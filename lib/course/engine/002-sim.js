(function (G) {
'use strict';
var VPS = G.VPS, cmds = VPS.cmds, CmdErr = VPS.CmdErr, SP = VPS.Shell.prototype;
var pad = VPS.util.pad, lines = VPS.lines, parseFlags = VPS.parseFlags;
var IP = VPS.IP;

VPS.newWorld = function () {
  return {
    ip: IP,
    nginx: { active: true, live: null },
    svc: { ssh: true, ufw: false, fail2ban: true, docker: true, cloudflared: false, cron: true },
    ufw: { active: false, rules: [], lockedOut: false },
    f2b: { banned: [] },
    ssh: { authIds: [], hostKeyChanged: false, hostFp: 'SHA256:newHostFingerprint', loginOK: false, reloadedOK: false, live: null },
    dns: {},
    cf: { mode: 'full-strict' },
    certs: {},
    containers: [],
    pm2: {}, pm2Saved: false,
    db: null,
    extra: [],
    journal: {},
    lastb: [],
    appStatus: {},
    diskBaseGB: 31,
    keyN: 0
  };
};

function hs(bytes) {
  var G1 = 1073741824, M = 1048576, K = 1024;
  if (bytes >= G1) { var v = bytes / G1; return (v >= 10 ? Math.ceil(v) : (Math.ceil(v * 10) / 10)) + 'G'; }
  if (bytes >= M) { var m = bytes / M; return (m >= 10 ? Math.ceil(m) : (Math.ceil(m * 10) / 10)) + 'M'; }
  if (bytes >= K) return Math.ceil(bytes / K) + 'K';
  return bytes + '';
}
VPS.util.hs = hs;

function needRoot(c, name, msg) {
  if (!c.sh.isRoot(c)) throw new CmdErr(msg || (name + ': Permission denied (cần sudo)'));
}

// ====================== nginx parser ======================
var KNOWN = {};
('server listen server_name return location proxy_pass proxy_http_version proxy_set_header ssl_certificate ssl_certificate_key include ssl_dhparam client_max_body_size root index try_files add_header access_log error_log http2 gzip if set rewrite proxy_read_timeout proxy_connect_timeout proxy_send_timeout upstream map real_ip_header set_real_ip_from real_ip_recursive ssl_protocols ssl_stapling ssl_stapling_verify ssl_trusted_certificate ssl_session_tickets ssl_ecdh_curve ssl_verify_client ssl_client_certificate alias internal autoindex log_not_found log_subrequest absolute_redirect server_name_in_redirect proxy_intercept_errors merge_slashes proxy_pass_request_headers proxy_redirect open_log_file_cache gzip_types gzip_min_length gzip_comp_level gzip_vary gzip_proxied etag sendfile tcp_nopush tcp_nodelay if_modified_since resolver ssl_ciphers ssl_session_cache ssl_session_timeout ssl_prefer_server_ciphers proxy_redirect deny allow charset default_type expires error_page proxy_buffering keepalive_timeout log_format limit_req limit_req_zone limit_req_status limit_conn limit_conn_zone server_tokens types http events worker_processes debug_connection limit_req_dry_run limit_req_log_level proxy_cache_background_update proxy_cache_revalidate proxy_cache_lock_timeout proxy_cache_lock_age worker_shutdown_timeout ssl_reject_handshake')
  .split(' ').forEach(function (k) { KNOWN[k] = 1; });
('ip_hash least_conn hash keepalive keepalive_requests keepalive_timeout proxy_cache proxy_cache_path proxy_cache_valid proxy_cache_key proxy_cache_bypass proxy_no_cache proxy_cache_use_stale proxy_cache_lock proxy_cache_min_uses proxy_cache_methods proxy_next_upstream proxy_next_upstream_tries proxy_next_upstream_timeout proxy_buffering proxy_buffers proxy_buffer_size proxy_busy_buffers_size proxy_request_buffering proxy_ignore_headers proxy_hide_header proxy_pass_header proxy_cookie_domain proxy_cookie_path gzip_disable gzip_buffers gzip_http_version gzip_static open_file_cache open_file_cache_valid open_file_cache_min_uses open_file_cache_errors client_body_timeout client_header_timeout client_body_buffer_size client_header_buffer_size large_client_header_buffers send_timeout reset_timedout_connection lingering_close worker_processes worker_connections worker_rlimit_nofile multi_accept use accept_mutex expires etag limit_conn limit_conn_zone limit_conn_status limit_rate limit_rate_after http2_max_concurrent_streams error_page split_clients map_hash_bucket_size server_names_hash_bucket_size types_hash_max_size variables_hash_max_size charset_types add_trailer aio directio output_buffers postpone_output sendfile_max_chunk tcp_nodelay').split(' ').forEach(function (k) { KNOWN[k] = 1; });
('geo auth_basic auth_basic_user_file auth_request auth_request_set satisfy valid_referers stub_status autoindex_exact_size autoindex_localtime autoindex_format proxy_set_body proxy_pass_request_body underscores_in_headers ignore_invalid_headers limit_except proxy_cookie_flags proxy_ssl_server_name proxy_ssl_name proxy_ssl_verify proxy_method client_body_in_file_only client_max_body_size client_body_temp_path proxy_temp_path proxy_max_temp_file_size proxy_http_version ssl_early_data http3 quic_retransmit quic_gso add_header alias set_real_ip_from resolver_timeout ssl_session_ticket_key ssl_buffer_size sub_filter sub_filter_once default_type chunked_transfer_encoding http2_push_preload keepalive_time worker_priority worker_cpu_affinity pid user daemon error_log pcre_jit thread_pool timer_resolution working_directory env load_module include request_pool_size connection_pool_size').split(' ').forEach(function (k) { KNOWN[k] = 1; });
var ARITY = { proxy_pass: [1, 1], proxy_set_header: [2, 2], server_name: [1, 99], listen: [1, 99], 'return': [1, 2], ssl_certificate: [1, 1], ssl_certificate_key: [1, 1], root: [1, 1], client_max_body_size: [1, 1], proxy_http_version: [1, 1], include: [1, 1] };

function ngTokens(text) {
  var toks = [], i = 0, line = 1, n = text.length;
  while (i < n) {
    var c = text.charAt(i);
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < n && text.charAt(i) !== '\n') i++; continue; }
    if (c === '{' || c === '}' || c === ';') { toks.push({ t: c, line: line }); i++; continue; }
    if (c === '"' || c === "'") {
      var q = c, j = i + 1, b = '';
      while (j < n && text.charAt(j) !== q) { if (text.charAt(j) === '\\') j++; b += text.charAt(j); j++; }
      toks.push({ t: 'w', v: b, line: line }); i = j + 1; continue;
    }
    var k = i; while (k < n && !/[\s{};]/.test(text.charAt(k))) k++;
    toks.push({ t: 'w', v: text.slice(i, k), line: line }); i = k;
  }
  return toks;
}

function ngParseFile(file, text) {
  var toks = ngTokens(text), root = { name: '', args: [], children: [] }, stack = [root], cur = [], err = null;
  function E(msg, line) { err = 'nginx: [emerg] ' + msg + ' in ' + file + ':' + line; }
  function check(words, ln, isBlock) {
    var name = words[0].v, parent = stack[stack.length - 1];
    if (parent.name === 'map' || parent.name === 'upstream' || parent.name === 'types' || parent.name === 'geo' || parent.name === 'split_clients') return true;
    if (!KNOWN[name]) { E('unknown directive "' + name + '"', words[0].line); return false; }
    var ar = ARITY[name];
    if (ar && !isBlock && (words.length - 1 < ar[0] || words.length - 1 > ar[1])) { E('invalid number of arguments in "' + name + '" directive', words[0].line); return false; }
    return true;
  }
  for (var x = 0; x < toks.length && !err; x++) {
    var t = toks[x];
    if (t.t === 'w') cur.push(t);
    else if (t.t === ';') {
      if (!cur.length) { E('unexpected ";"', t.line); break; }
      if (!check(cur, t.line, false)) break;
      stack[stack.length - 1].children.push({ name: cur[0].v, args: cur.slice(1).map(function (w) { return w.v; }), line: cur[0].line, children: null });
      cur = [];
    } else if (t.t === '{') {
      if (!cur.length) { E('unexpected "{"', t.line); break; }
      if (!check(cur, t.line, true)) break;
      var node = { name: cur[0].v, args: cur.slice(1).map(function (w) { return w.v; }), line: cur[0].line, children: [] };
      stack[stack.length - 1].children.push(node); stack.push(node); cur = [];
    } else if (t.t === '}') {
      if (cur.length) { E('directive "' + cur[0].v + '" is not terminated by ";"', t.line); break; }
      if (stack.length === 1) { E('unexpected "}"', t.line); break; }
      stack.pop();
    }
  }
  if (!err) {
    var lastLine = toks.length ? toks[toks.length - 1].line : 1;
    if (cur.length) E('unexpected end of file, expecting ";" or "}"', lastLine);
    else if (stack.length > 1) E('unexpected end of file, expecting "}"', lastLine);
  }
  return { root: root, err: err };
}

function findNodes(node, name, out) {
  (node.children || []).forEach(function (ch) {
    if (ch.name === name && ch.children) out.push(ch);
    else if (ch.children) findNodes(ch, name, out);
  });
  return out;
}

function ngLoad(sh) {
  var res = { errors: [], warns: [], servers: [], http: { tokens: true, headers: [], zones: {}, ssl: {}, realFrom: [], realHeader: null } };
  var ncf0 = sh.fs.get('/etc/nginx/nginx.conf'); if (ncf0 && ncf0.c) { var pm0 = /^\s*ssl_protocols\s+([^;]+);/m.exec(ncf0.c); if (pm0) res.http.sslBase = pm0[1].trim().split(/\s+/); }
  var fs = sh.fs, files = [];
  fs.list('/etc/nginx/sites-enabled').forEach(function (n) { files.push('/etc/nginx/sites-enabled/' + n); });
  fs.list('/etc/nginx/conf.d').forEach(function (n) { if (/\.conf$/.test(n)) files.push('/etc/nginx/conf.d/' + n); });
  var defaults = {}, names = {};
  for (var fi = 0; fi < files.length; fi++) {
    var file = files[fi], node = fs.get(file);
    if (!node || node.t !== 'f') { res.errors.push('nginx: [emerg] open() "' + file + '" failed (2: No such file or directory)'); return res; }
    var P = ngParseFile(file, node.c || '');
    if (P.err) { res.errors.push(P.err); return res; }
    if (sh.W.ngx3 && VPS.ngExpand) { var xe = VPS.ngExpand(sh, P.root, ngParseFile, file, 0); if (xe) { res.errors.push(xe); return res; } }
    P.root.children.forEach(function (tn) {
      if (tn.children) return;
      if (tn.name === 'server_tokens') res.http.tokens = tn.args[0] !== 'off';
      else if (tn.name === 'add_header') res.http.headers.push({ name: tn.args[0], value: tn.args[1] || '', always: tn.args.indexOf('always') >= 0 });
      else if (/^ssl_/.test(tn.name) && tn.name !== 'ssl_certificate' && tn.name !== 'ssl_certificate_key') {
        if (tn.name === 'ssl_protocols' && res.http.sslBase && !res.http.ssl.ssl_protocols && /^\/etc\/nginx\/conf\.d\//.test(file)) { res.errors.push('nginx: [emerg] "ssl_protocols" directive is duplicate in ' + file + ':' + tn.line); }
        res.http.ssl[tn.name] = tn.args;
      }
      else if (tn.name === 'set_real_ip_from') res.http.realFrom.push(tn.args[0]);
      else if (tn.name === 'real_ip_header') res.http.realHeader = tn.args[0];
      else if (tn.name === 'limit_req_zone') { var zm = /zone=(\w+)/.exec(tn.args.join(' ')); if (zm) res.http.zones[zm[1]] = { rate: (/rate=(\S+)/.exec(tn.args.join(' ')) || [])[1] }; }
    });
    var srvNodes = findNodes(P.root, 'server', []);
    for (var si = 0; si < srvNodes.length; si++) {
      var sn = srvNodes[si], srv = { file: file, line: sn.line, listens: [], names: [], stmts: sn.children, locs: [], certs: [] };
      for (var ci = 0; ci < sn.children.length; ci++) {
        var st = sn.children[ci];
        if (st.name === 'listen') {
          var a0 = st.args[0] || '', pm = /(?:^|:)(\d+)$/.exec(a0), port = pm ? +pm[1] : 80;
          var bindStr = a0.charAt(0) === '[' ? '[::]' : (a0.indexOf(':') > 0 ? a0.split(':')[0] : '0.0.0.0');
          srv.listens.push({ port: port, h2: st.args.indexOf('http2') >= 0, quic: st.args.indexOf('quic') >= 0, ssl: st.args.indexOf('ssl') >= 0, def: st.args.indexOf('default_server') >= 0, bind: bindStr, line: st.line });
        } else if (st.name === 'server_name') srv.names = srv.names.concat(st.args);
        else if (st.name === 'location') {
          var path = st.args.filter(function (x) { return ['=', '~', '~*', '^~'].indexOf(x) < 0; }).pop() || '/';
          var lmod = ['=', '~', '~*', '^~'].indexOf(st.args[0]) >= 0 && st.args.length > 1 ? st.args[0] : '';
          srv.locs.push({ path: path, mod: lmod, stmts: st.children || [] });
        } else if (st.name === 'ssl_certificate') srv.certs.push({ path: st.args[0], line: st.line });
        else if (st.name === 'include' && st.args[0]) {
          if (!fs.ex(st.args[0]) && st.args[0].indexOf('*') < 0) { res.errors.push('nginx: [emerg] open() "' + st.args[0] + '" failed (2: No such file or directory) in ' + file + ':' + st.line); return res; }
        }
      }
      srv.locs.forEach(function (l) {
        l.stmts.forEach(function (s) { if (s.name === 'include' && s.args[0] && !fs.ex(s.args[0]) && s.args[0].indexOf('*') < 0) res._pendingInc = res._pendingInc || { f: file, s: s }; });
      });
      if (res._pendingInc) { res.errors.push('nginx: [emerg] open() "' + res._pendingInc.s.args[0] + '" failed (2: No such file or directory) in ' + res._pendingInc.f + ':' + res._pendingInc.s.line); return res; }
      var vcOn = srv.stmts.filter(function (x) { return x.name === 'ssl_verify_client' && x.args[0] === 'on'; })[0];
      if (vcOn && !srv.stmts.some(function (x) { return x.name === 'ssl_client_certificate'; })) { res.errors.push('nginx: [emerg] no ssl_client_certificate for ssl_client_verify in ' + file + ':' + vcOn.line); return res; }
      var sslL = srv.listens.filter(function (l) { return l.ssl; })[0];
      if (sslL && !srv.certs.length) { res.errors.push('nginx: [emerg] no "ssl_certificate" is defined for the "listen ... ssl" directive in ' + file + ':' + sslL.line); return res; }
      for (var ce = 0; ce < srv.certs.length; ce++) {
        if (!fs.isF(srv.certs[ce].path)) { res.errors.push('nginx: [emerg] cannot load certificate "' + srv.certs[ce].path + '": BIO_new_file() failed (SSL: error:80000002:system library::No such file or directory:calling fopen(' + srv.certs[ce].path + ', r) error:10000080:BIO routines::no such file) in ' + file + ':' + srv.certs[ce].line); return res; }
      }
      for (var li = 0; li < srv.listens.length; li++) {
        var l = srv.listens[li], key = l.bind + ':' + l.port;
        if (l.def) { if (defaults[key]) { res.errors.push('nginx: [emerg] a duplicate default server for ' + key + ' in ' + file + ':' + l.line); return res; } defaults[key] = 1; }
        srv.names.forEach(function (nm) {
          var k2 = key + '|' + nm;
          if (names[k2]) res.warns.push('nginx: [warn] conflicting server name "' + nm + '" on ' + key + ', ignored'); else names[k2] = 1;
        });
      }
      res.servers.push(srv);
    }
  }
  for (var zi = 0; zi < res.servers.length; zi++) {
    var zs = res.servers[zi], zl = [{ stmts: zs.stmts }].concat(zs.locs);
    for (var zj = 0; zj < zl.length; zj++) (zl[zj].stmts || []).forEach(function (zt) {
      if (zt.name !== 'limit_req' || res.errors.length) return;
      var zn = (/zone=(\w+)/.exec(zt.args.join(' ')) || [])[1];
      if (zn && !res.http.zones[zn]) res.errors.push('nginx: [emerg] zero size shared memory zone "' + zn + '"');
    });
  }
  if (sh.W.ngx2 && VPS.ngLoad2) VPS.ngLoad2(sh, res, files, ngParseFile);
  return res;
}
VPS.ngLoad = ngLoad;
VPS.ngParseFile = ngParseFile;

function ngTestOutput(sh, c) {
  var r = ngLoad(sh);
  var out = '';
  if (!sh.isRoot(c)) {
    out += 'nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)\n';
    out += r.warns.map(function (w) { return w + '\n'; }).join('');
    if (r.errors.length) { out += r.errors.join('\n') + '\n'; }
    else out += 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\n';
    out += 'nginx: [emerg] open() "/run/nginx.pid" failed (13: Permission denied)\nnginx: configuration file /etc/nginx/nginx.conf test failed\n';
    return { ok: false, out: out, r: r };
  }
  out += r.warns.map(function (w) { return w + '\n'; }).join('');
  if (r.errors.length) {
    out += r.errors.join('\n') + '\n' + 'nginx: configuration file /etc/nginx/nginx.conf test failed\n';
    return { ok: false, out: out, r: r };
  }
  out += 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n';
  return { ok: true, out: out, r: r };
}

function ngReload(sh, restart) {
  var r = ngLoad(sh);
  if (!r.errors.length) sh.W.heldBytes = 0;
  if (r.errors.length) { if (restart) sh.W.nginx.active = false; return false; }
  sh.W.nginx.live = r; sh.W.nginx.active = true; sh.W.nginx.hits = {}; if (sh.W.ngx3 && VPS.ngProcSync) VPS.ngProcSync(sh); if (sh.W.cert2 && VPS.certSync) VPS.certSync(sh); return true;
}
VPS.ngReload = ngReload;

// ---- request evaluation ----
function retResult(args, host, path, scheme) {
  var code = parseInt(args[0], 10);
  if (code === 444) return { kind: 'empty' };
  var loc = null;
  if (args[1] && code >= 300 && code < 400) loc = args[1].replace(/\$host/g, host).replace(/\$request_uri/g, path).replace(/\$scheme/g, scheme);
  return { kind: 'resp', status: code, loc: loc, body: code < 300 && args[1] ? args[1] : null };
}
function ipIn(ip, spec) {
  if (spec === 'all') return true;
  if (spec === ip) return true;
  var m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(spec);
  if (!m) return false;
  var bits = +m[2], a = ip.split('.'), b = m[1].split('.');
  var n = Math.floor(bits / 8);
  for (var q = 0; q < n; q++) if (a[q] !== b[q]) return false;
  return true;
}
function pickLoc(locs, p) {
  var i, l, best = null;
  for (i = 0; i < locs.length; i++) if (locs[i].mod === '=' && locs[i].path === p) return locs[i];
  for (i = 0; i < locs.length; i++) { l = locs[i]; if ((l.mod === '' || l.mod === '^~') && p.indexOf(l.path) === 0 && (!best || l.path.length > best.path.length)) best = l; }
  if (best && best.mod === '^~') return best;
  for (i = 0; i < locs.length; i++) {
    l = locs[i]; if (l.mod !== '~' && l.mod !== '~*') continue;
    try { if (new RegExp(l.path, l.mod === '~*' ? 'i' : '').test(p)) return l; } catch (e) { }
  }
  return best;
}
function firstDirective(lists, name) {
  for (var i = 0; i < lists.length; i++) { var f = (lists[i] || []).filter(function (x) { return x.name === name; }); if (f.length) return f; }
  return [];
}
function ngReq(sh, scheme, host, port, path) {
  if (sh.W.ngx2 && VPS.ngReq2) return VPS.ngReq2(sh, scheme, host, port, path, ngReqOld);
  return ngReqOld(sh, scheme, host, port, path);
}
function ngReqOld(sh, scheme, host, port, path) {
  var W = sh.W;
  if (!W.nginx.active || !W.nginx.live) return { kind: 'refused' };
  var live = W.nginx.live, servers = live.servers, http = live.http || { tokens: true, headers: [], zones: {} };
  var cand = servers.filter(function (s) { return s.listens.some(function (l) { return l.port === port; }); });
  if (!cand.length) return { kind: 'refused' };
  if (scheme === 'https' && !cand.some(function (s) { return s.listens.some(function (l) { return l.port === port && l.ssl; }); })) return { kind: 'sslerr' };
  var srv = null;
  cand.forEach(function (s) { if (!srv && s.names.indexOf(host) >= 0) srv = s; });
  if (!srv) cand.forEach(function (s) { if (!srv && s.listens.some(function (l) { return l.port === port && l.def; })) srv = s; });
  if (!srv) srv = cand[0];
  var bare = path.split('?')[0];
  var best = pickLoc(srv.locs, bare);
  var lst = best ? best.stmts : [];
  function done(r) {
    var tk = firstDirective([lst, srv.stmts], 'server_tokens');
    r.tokens = tk.length ? tk[0].args[0] !== 'off' : http.tokens;
    var ah = firstDirective([lst, srv.stmts], 'add_header');
    var adds = ah.length ? (lst.some(function (x) { return x.name === 'add_header'; }) ? lst : srv.stmts).filter(function (x) { return x.name === 'add_header'; }).map(function (x) { return { name: x.args[0], value: x.args[1] || '', always: x.args.indexOf('always') >= 0 }; }) : http.headers;
    r.adds = adds;
    return r;
  }
  var vcl = firstDirective([srv.stmts], 'ssl_verify_client');
  if (scheme === 'https' && vcl.length && vcl[0].args[0] === 'on' && !W.nginx.clientCert) return done({ kind: 'resp', status: 400, body: '<html>\n<head><title>400 No required SSL certificate was sent</title></head>\n<body>\n<center><h1>400 Bad Request</h1></center>\n<center>No required SSL certificate was sent</center>\n</body>\n</html>' });
  for (var i = 0; i < srv.stmts.length; i++) if (srv.stmts[i].name === 'return') return done(retResult(srv.stmts[i].args, host, path, scheme));
  var rootDir = firstDirective([lst, srv.stmts], 'root');
  if (!best) {
    if (!rootDir.length) return done({ kind: 'resp', status: 404 });
    best = { path: '/', mod: '', stmts: [] };
  }
  var j, st;
  for (j = 0; j < lst.length; j++) {
    st = lst[j];
    if (st.name === 'allow' || st.name === 'deny') {
      if (ipIn('127.0.0.1', st.args[0])) { if (st.name === 'deny') return done({ kind: 'resp', status: 403 }); break; }
    }
  }
  for (j = 0; j < lst.length; j++) {
    st = lst[j];
    if (st.name === 'limit_req') {
      var za = st.args.join(' '), zn = (/zone=(\w+)/.exec(za) || [])[1], bu = +((/burst=(\d+)/.exec(za) || [])[1] || 0);
      W.nginx.hits = W.nginx.hits || {};
      var zk = zn + '|' + (W.nginx.clientIp || '127.0.0.1');
      W.nginx.hits[zk] = (W.nginx.hits[zk] || 0) + 1;
      if (W.nginx.hits[zk] > bu + 1) {
        if (W.ngx3) { var dry = firstDirective([lst, srv.stmts], 'limit_req_dry_run'), isDry = dry.length && dry[0].args[0] === 'on'; W.ngx3lim = { level: 'error', msg: 'limiting requests, ' + (isDry ? 'dry run, ' : '') + 'excess: ' + (W.nginx.hits[zk] - 1 - bu - 0.008).toFixed(3) + ' by zone "' + zn + '"' }; if (isDry) continue; }
        var ls = firstDirective([lst, srv.stmts], 'limit_req_status');
        return done({ kind: 'resp', status: ls.length ? +ls[0].args[0] : 503 });
      }
    }
  }
  for (j = 0; j < lst.length; j++) {
    st = lst[j];
    if (st.name === 'return') return done(retResult(st.args, host, path, scheme));
    if (st.name === 'proxy_pass') {
      var m = /^https?:\/\/[^\/:]+(?::(\d+))?/.exec(st.args[0] || '');
      var up = m ? (m[1] ? +m[1] : 80) : 80;
      var hm = /^https?:\/\/([^\/:]+)/.exec(st.args[0] || '');
      if (hm && /^172\./.test(hm[1])) { var okc = W.containers.some(function (ct) { return ct.ip === hm[1] && ct.state === 'running'; }); if (!okc) return done({ kind: 'resp', status: 502 }); return done({ kind: 'resp', status: W.appStatus[up] || 200, upstream: up }); }
      var uinf = W.dk4 && VPS.upInfo ? VPS.upInfo(sh, up, bare) : null;
      var listening = sh.listeners().some(function (l) { return l.port === up && l.bind !== '127.0.0.53'; });
      if (!listening) return done({ kind: 'resp', status: 502 });
      return done({ kind: 'resp', status: (uinf && uinf.status) || W.appStatus[up] || 200, upstream: up, body: uinf ? uinf.body : undefined });
    }
  }
  if (rootDir.length) {
    var base = rootDir[0].args[0].replace(/\/$/, ''), fp = base + bare;
    if (/\/$/.test(bare)) fp += 'index.html';
    var fn = sh.fs.get(fp);
    if (fn && fn.t === 'f') return done({ kind: 'resp', status: 200, body: (fn.c || '').replace(/\n$/, '') });
  }
  return done({ kind: 'resp', status: 404 });
}
VPS.ngReq = ngReq;

// ====================== listeners / ss ======================
SP.listeners = function () {
  var W = this.W, L = [];
  if (W.svc.ssh) L.push({ port: 22, bind: '0.0.0.0', proc: 'sshd', pid: 812 });
  L.push({ port: 53, bind: '127.0.0.53', proc: 'systemd-resolve', pid: 601 });
  if (W.nginx.active) {
    L.push({ port: 80, bind: '0.0.0.0', proc: 'nginx', pid: 1021 });
    if (W.nginx.live && W.nginx.live.servers.some(function (s) { return s.listens.some(function (l) { return l.port === 443; }); })) L.push({ port: 443, bind: '0.0.0.0', proc: 'nginx', pid: 1021 });
    if (W.ngx3 && W.nginx.live) { var seenL = {}; W.nginx.live.servers.forEach(function (s) { s.listens.forEach(function (l) { var k = l.bind + ':' + l.port; if (l.port !== 80 && l.port !== 443 && !seenL[k]) { seenL[k] = 1; L.push({ port: l.port, bind: l.bind, proc: 'nginx', pid: 1021 }); } }); }); }
  }
  W.containers.forEach(function (ct) {
    if (ct.state !== 'running') return;
    (ct.ports || []).forEach(function (p) { L.push({ port: p.host, bind: p.bind, proc: 'docker-proxy', pid: 2000 + (p.host % 900) }); });
  });
  Object.keys(W.pm2).forEach(function (k) {
    var a = W.pm2[k]; if (a.status === 'online') L.push({ port: a.port, bind: '*', proc: 'node', pid: a.pid });
  });
  W.extra.forEach(function (e) { L.push(e); });
  return L;
};

cmds.ss = function (a, c) {
  var sh = c.sh, flags = a.join('').replace(/-/g, '');
  var showP = flags.indexOf('p') >= 0, root = sh.isRoot(c);
  var w = pad('State', 8) + pad('Recv-Q', 8) + pad('Send-Q', 9) + pad('Local Address:Port', 22) + pad('Peer Address:Port', 14) + 'Process\n';
  var rows = [];
  sh.listeners().forEach(function (l) {
    var la = (l.bind === '*' ? '*' : l.bind) + ':' + l.port;
    var proc = showP && root ? 'users:(("' + l.proc + '",pid=' + l.pid + ',fd=' + (l.proc === 'nginx' ? 6 : 3) + '))' : '';
    rows.push(pad('LISTEN', 8) + pad('0', 8) + pad(l.proc === 'nginx' ? '511' : '4096', 9) + pad(la, 22) + pad(l.bind === '*' ? '*:*' : '0.0.0.0:*', 14) + proc);
    if (l.proc === 'docker-proxy' && l.bind === '0.0.0.0') rows.push(pad('LISTEN', 8) + pad('0', 8) + pad('4096', 9) + pad('[::]:' + l.port, 22) + pad('[::]:*', 14) + proc);
  });
  c.out(w + rows.join('\n') + '\n'); return 0;
};

cmds.ip = function (a, c) {
  var W = c.sh.W;
  if (c.sh.hostName === 'laptop') { c.out('lo               UNKNOWN        127.0.0.1/8\nwlan0            UP             192.168.1.23/24\n'); return 0; }
  c.out('lo               UNKNOWN        127.0.0.1/8 ::1/128\neth0             UP             ' + W.ip + '/24 fe80::216:3eff:fe3a:91b2/64\ndocker0          UP             172.17.0.1/16\n'); return 0;
};

cmds.dig = function (a, c) {
  var W = c.sh.W, short = a.indexOf('+short') >= 0, name = a.filter(function (x) { return x.charAt(0) !== '+' && x !== 'A' && x !== 'AAAA' && x.charAt(0) !== '@'; })[0];
  var rec = W.dns[name], ips = [];
  if (rec) ips = rec.proxied ? ['104.21.55.187', '172.67.172.34'] : [rec.ip];
  if (short) { c.out(ips.join('\n') + (ips.length ? '\n' : '')); return 0; }
  c.out('; <<>> DiG 9.18.28 <<>> ' + name + '\n;; ->>HEADER<<- opcode: QUERY, status: ' + (ips.length ? 'NOERROR' : 'NXDOMAIN') + ', id: 4412\n\n;; ANSWER SECTION:\n');
  ips.forEach(function (ip) { c.out(name + '.\t\t300\tIN\tA\t' + ip + '\n'); });
  c.out('\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n'); return 0;
};

// ====================== curl ======================
var STATUS = { 200: 'OK', 304: 'Not Modified', 307: 'Temporary Redirect', 400: 'Bad Request', 403: 'Forbidden', 429: 'Too Many Requests', 503: 'Service Temporarily Unavailable', 301: 'Moved Permanently', 302: 'Found', 308: 'Permanent Redirect', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 504: 'Gateway Time-out', 101: 'Switching Protocols', 201: 'Created', 204: 'No Content', 401: 'Unauthorized', 405: 'Not Allowed', 413: 'Request Entity Too Large', 414: 'Request-URI Too Large', 431: 'Request Header Fields Too Large' };
function bodyFor(r) {
  var NGX = '<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\r\n';
  if (r.title && !r.body) {
    var tm = /^(\d+) (.*)$/.exec(r.title);
    if (r.status === 400 && tm) return '<html>\r\n<head><title>' + r.title + '</title></head>\r\n<body>\r\n<center><h1>400 Bad Request</h1></center>\r\n<center>' + tm[2] + '</center>\r\n' + NGX;
    return '<html>\r\n<head><title>' + r.title + '</title></head>\r\n<body>\r\n<center><h1>' + r.title + '</h1></center>\r\n' + NGX;
  }
  if (!r.body && (r.status === 401 || r.status === 405 || r.status === 413 || r.status === 414 || r.status === 431)) return '<html>\r\n<head><title>' + r.status + ' ' + STATUS[r.status] + '</title></head>\r\n<body>\r\n<center><h1>' + r.status + ' ' + STATUS[r.status] + '</h1></center>\r\n' + NGX;
  if (!r.body && (r.status === 101 || r.status === 204)) return '';
  if (r.body && r.errDone) return r.body + '\n';
  if (r.status === 403 && !r.body) return '<html>\r\n<head><title>403 Forbidden</title></head>\r\n<body>\r\n<center><h1>403 Forbidden</h1></center>\r\n' + NGX;
  if ((r.status === 503 || r.status === 429) && !r.body) return '<html>\r\n<head><title>' + r.status + ' ' + STATUS[r.status] + '</title></head>\r\n<body>\r\n<center><h1>' + r.status + ' ' + STATUS[r.status] + '</h1></center>\r\n' + NGX;
  if (r.status === 403 || r.status === 429 || r.status === 503) return '<html>\r\n<head><title>' + r.status + ' ' + (r.status === 403 ? 'Forbidden' : r.status === 429 ? 'Too Many Requests' : 'Service Temporarily Unavailable') + '</title></head>\r\n<body>\r\n<center><h1>' + r.status + '</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n';
  if (r.status === 502) return '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\n';
  if (r.status === 404) return '<html>\r\n<head><title>404 Not Found</title></head>\r\n<body>\r\n<center><h1>404 Not Found</h1></center>\r\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\n';
  if (r.status >= 300 && r.status < 400) return '<html>\r\n<head><title>' + r.status + ' ' + STATUS[r.status] + '</title></head>\r\n<body>\r\n<center><h1>' + r.status + ' ' + STATUS[r.status] + '</h1></center>\r\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\n';
  if ((r.status === 500 || r.status === 504 || r.status === 400) && !r.body) return '<html>\r\n<head><title>' + r.status + ' ' + STATUS[r.status] + '</title></head>\r\n<body>\r\n<center><h1>' + r.status + ' ' + STATUS[r.status] + '</h1></center>\r\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\n';
  if (r.body) return r.body + '\n';
  if (r.upstream === 3000) return '<!DOCTYPE html><html lang="vi"><head><title>EduTrack Pro</title></head><body>Quản lý gia sư</body></html>\n';
  if (r.upstream) return '{"status":"ok","service":"tutor-api"}\n';
  return '';
}
function addHdrs(h, r) {
  (r.adds || []).forEach(function (a) {
    if (!a.always && !(r.status >= 200 && r.status < 400)) return;
    h[String(a.name).toLowerCase()] = a.value;
  });
}
function cfErr(code) { return { status: code, headers: { server: 'cloudflare' }, body: 'error code: ' + code + '\n', cf: true }; }
function fetchOnce(sh, scheme, host, port, path, hostHdr, resolved) {
  var W = sh.W;
  if (W.hooks && W.hooks[host]) { (W.hookLog = W.hookLog || []).push(host + path); return { status: 200, headers: { server: 'nginx' }, body: '{"ok":true}' }; }
  var isLocal = /^127\./.test(host) || host === 'localhost' || host === W.ip;
  var rec = null;
  if (!isLocal && !resolved) {
    rec = W.dns[host];
    if (!rec) return { err: 6, msg: 'Could not resolve host: ' + host };
    if (rec.ip !== W.ip && !rec.proxied) return { err: 28, msg: 'Failed to connect to ' + host + ' port ' + port + ' after 129000 ms: Timeout was reached' };
  }
  if (sh.hostName === 'laptop' && isLocal && host !== W.ip) return { err: 7, msg: 'Failed to connect to ' + host + ' port ' + port + ' after 0 ms: Couldn\'t connect to server' };
  if (W.hooks && W.hooks[host]) { (W.hookLog = W.hookLog || []).push(host + path); return { status: 200, headers: { server: 'nginx' }, body: '{"ok":true}' }; }
  if (W.dk4 && isLocal && port !== 80 && port !== 443 && VPS.dkDirect) { var dr = VPS.dkDirect(sh, port, path, host); if (dr) return dr; }
  var vh = hostHdr || host;
  if (rec && rec.proxied) {
    var mode = W.cf.mode, os = mode === 'flexible' ? 'http' : 'https', op = mode === 'flexible' ? 80 : 443;
    var r0 = ngReq(sh, os, vh, op, path);
    if (r0.kind === 'refused') return cfErr(os === 'https' ? 525 : 521);
    if (r0.kind === 'sslerr') return cfErr(525);
    if (r0.kind === 'empty') return cfErr(520);
    if (mode === 'full-strict' && (!W.certs[vh] || (W.cert2 && VPS.certBad && VPS.certBad(sh, vh)))) return cfErr(526);
    var h = { server: 'cloudflare' };
    addHdrs(h, r0);
    if (r0.loc) h.location = r0.loc;
    return { status: r0.status, headers: h, body: bodyFor(r0), cf: true };
  }
  var r = ngReq(sh, scheme, vh, port, path);
  if (r.kind === 'refused') return { err: 7, msg: 'Failed to connect to ' + host + ' port ' + port + ' after 0 ms: Couldn\'t connect to server' };
  if (r.kind === 'empty') return { err: 52, msg: 'Empty reply from server' };
  if (r.kind === 'sslerr') return { err: 35, msg: 'OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number' };
  var hd = { server: r.tokens === false ? 'nginx' : 'nginx/1.24.0 (Ubuntu)' };
  addHdrs(hd, r);
  if (r.loc) hd.location = r.loc;
  if (r.status === 101 || r.status === 204) delete hd['content-length'];
  return { status: r.status, headers: hd, body: bodyFor(r), h2: !!r.h2 };
}

cmds.curl = function (a, c) {
  var sh = c.sh, o = { H: {}, resolve: {} }, url = null;
  for (var i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-H' || x === '--header') { var hv = a[++i] || '', k = hv.indexOf(':'); o.H[hv.slice(0, k).toLowerCase()] = hv.slice(k + 1).trim(); }
    else if (x === '-m' || x === '--max-time' || x === '-X' || x === '--connect-timeout' || x === '-d' || x === '-u') i++;
    else if (x === '-o') o.o = a[++i];
    else if (x === '-w') o.w = a[++i];
    else if (x === '--resolve') { var rm = (a[++i] || '').split(':'); o.resolve[rm[0] + ':' + rm[1]] = rm[2]; }
    else if (x.indexOf('--') === 0) { if (x === '--head') o.I = true; if (x === '--location') o.L = true; if (x === '--silent') o.s = true; if (x === '--show-error') o.S = true; if (x === '--insecure') o.k = true; if (x === '--include') o.i = true; }
    else if (x.charAt(0) === '-' && x.length > 1) {
      for (var j = 1; j < x.length; j++) {
        var ch = x.charAt(j);
        if (ch === 'm' || ch === 'H' || ch === 'o' || ch === 'w' || ch === 'X') { if (j === x.length - 1) { if (ch === 'm') i++; else if (ch === 'o') o.o = a[++i]; else if (ch === 'w') o.w = a[++i]; else if (ch === 'H') { var hv2 = a[++i] || '', k2 = hv2.indexOf(':'); o.H[hv2.slice(0, k2).toLowerCase()] = hv2.slice(k2 + 1).trim(); } else i++; } break; }
        o[ch] = true;
      }
    } else url = x;
  }
  if (!url) { c.err('curl: try \'curl --help\' for more information\n'); return 2; }
  if (!/^https?:\/\//.test(url)) url = 'http://' + url;
  var hops = 0, lastStatus = 0, outText = '', rc = 0;
  for (;;) {
    var m = /^(https?):\/\/([^\/:]+)(?::(\d+))?(\/[^]*)?$/.exec(url);
    if (!m) { c.err('curl: (3) URL rejected: Bad hostname\n'); return 3; }
    var scheme = m[1], host = m[2], port = m[3] ? +m[3] : (scheme === 'https' ? 443 : 80), path = m[4] || '/';
    var rsv = o.resolve[host + ':' + port];
    var r = fetchOnce(sh, scheme, rsv ? host : host, port, path, o.H.host, !!rsv);
    if (r.err) {
      if (!o.s || o.S) c.err('curl: (' + r.err + ') ' + r.msg + '\n');
      rc = r.err; break;
    }
    lastStatus = r.status;
    var hdrs = '';
    var proto = r.cf || r.h2 ? 'HTTP/2' : 'HTTP/1.1';
    var hd = r.headers || {};
    var head = proto + ' ' + r.status + (r.cf || r.h2 ? '' : ' ' + (STATUS[r.status] || '')) + '\r\n';
    Object.keys(hd).forEach(function (k) { head += k.charAt(0).toUpperCase() + k.slice(1).replace(/-./g, function (q) { return q.toUpperCase(); }) + ': ' + hd[k] + '\r\n'; });
    head = head.replace(/\r\nEtag:/g, '\r\nETag:').replace(/\r\nWww-Authenticate:/g, '\r\nWWW-Authenticate:').replace(/\r\nX-Accel-Redirect:/g, '\r\nX-Accel-Redirect:');
    head += 'Date: Mon, 26 Oct 2026 10:49:00 GMT\r\n\r\n';
    if (r.status >= 300 && r.status < 400 && hd.location && o.L) {
      if (o.i || o.v) outText += head;
      if (++hops >= 50) { if (!o.s || o.S) c.err('curl: (47) Maximum (50) redirects followed\n'); rc = 47; break; }
      url = hd.location; if (url.charAt(0) === '/') url = scheme + '://' + host + url; continue;
    }
    if (o.I) outText += head.replace(/\r\n/g, '\n');
    else { if (o.i) outText += head.replace(/\r\n/g, '\n'); outText += r.body; }
    break;
  }
  if (o.o && o.o !== '/dev/null' && !rc) { try { sh.writeFile(sh.abs(o.o), outText, c, 'curl'); } catch (e) { c.err('curl: (23) ' + e.msg + '\n'); } outText = ''; }
  else if (o.o === '/dev/null') outText = '';
  c.out(outText);
  if (o.w) c.out(o.w.replace(/%\{http_code\}/g, String(rc ? 0 : lastStatus)).replace(/\\n/g, '\n'));
  return rc;
};

// ====================== ssh ======================
function keyId(content) { var m = /KEYID:(\w+)/.exec(content || ''); return m ? m[1] : null; }
function parseSshConfig(text) {
  var hosts = {}, cur = null;
  lines(text).forEach(function (l) {
    var m = /^\s*(\w+)\s+(.+?)\s*$/.exec(l); if (!m || l.trim().charAt(0) === '#') return;
    var k = m[1].toLowerCase();
    if (k === 'host') { cur = { names: m[2].split(/\s+/), ids: [] }; m[2].split(/\s+/).forEach(function (n) { hosts[n] = cur; }); }
    else if (cur) { if (k === 'identityfile') cur.ids.push(m[2]); else cur[k] = m[2]; }
  });
  return hosts;
}
cmds.ssh = function (a, c) {
  var sh = c.sh, W = sh.W, ids = [], opts = {}, target = null, i, port = 22;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-i') ids.push(a[++i]);
    else if (x === '-o') { var kv = (a[++i] || '').split('='); opts[kv[0].toLowerCase()] = (kv[1] || '').toLowerCase(); }
    else if (x === '-p') port = +a[++i];
    else if (x === '-v' || x === '-q' || x === '-A') continue;
    else if (x.charAt(0) === '-') continue;
    else if (!target) target = x;
  }
  if (!target) { c.out('usage: ssh [-i identity_file] [-o option] [-p port] destination\n'); return 255; }
  if (sh.hostName !== 'laptop') { c.out('Mô phỏng: lệnh ssh chỉ chạy từ máy cá nhân (bài 1). Bạn đang ở VPS rồi.\n'); return 1; }
  var user = null, host = target;
  if (target.indexOf('@') > 0) { user = target.split('@')[0]; host = target.split('@')[1]; }
  var cfgNode = sh.fs.get(sh.home + '/.ssh/config'), cfg = cfgNode ? parseSshConfig(cfgNode.c) : {};
  var alias = cfg[host];
  if (alias) { host = alias.hostname || host; if (!user) user = alias.user; if (alias.port) port = +alias.port; if (alias.identitiesonly === 'yes') opts.identitiesonly = 'yes'; ids = ids.concat(alias.ids); }
  if (!user) user = sh.user;
  if (host !== W.ip) { c.err('ssh: Could not resolve hostname ' + host + ': Name or service not known\n'); return 255; }
  if (W.ufw.lockedOut) { c.err('ssh: connect to host ' + host + ' port ' + port + ': Connection timed out\n'); return 255; }
  var kh = sh.home + '/.ssh/known_hosts', khn = sh.fs.get(kh);
  var has = khn && lines(khn.c).some(function (l) { return l.split(' ')[0] === host; });
  if (has && W.ssh.hostKeyChanged) {
    var ln = lines(khn.c).findIndex(function (l) { return l.split(' ')[0] === host; }) + 1;
    var at = '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n';
    c.err(at + '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n' + at + 'IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!\nSomeone could be eavesdropping on you right now (man-in-the-middle attack)!\nIt is also possible that a host key has just been changed.\nThe fingerprint for the ED25519 key sent by the remote host is\n' + W.ssh.hostFp + '.\nAdd correct host key in ' + kh + ' to get rid of this message.\nOffending ED25519 key in ' + kh + ':' + ln + '\nHost key for ' + host + ' has changed and you have requested strict checking.\nHost key verification failed.\n');
    return 255;
  }
  if (!has) {
    sh.fs.put(kh, (khn ? khn.c : '') + host + ' ssh-ed25519 AAAAC3NzaC1lZDI1NTE5' + W.ssh.hostFp.slice(-8) + '\n', { owner: sh.user, mode: 420 });
    W.ssh.hostKeyChanged = false;
    c.err("Warning: Permanently added '" + host + "' (ED25519) to the list of known hosts.\n");
  }
  var cand = ids.slice();
  if (opts.identitiesonly !== 'yes') ['id_rsa', 'id_ecdsa', 'id_ed25519'].forEach(function (d) { var p = sh.home + '/.ssh/' + d; if (sh.fs.isF(p)) cand.push(p); });
  var ok = false, tried = 0;
  for (i = 0; i < cand.length && tried < 6; i++) {
    var p = sh.fs.res(sh.cwd, cand[i], sh.home), n = sh.fs.get(p);
    if (!n) { if (ids.indexOf(cand[i]) >= 0) c.err('Warning: Identity file ' + cand[i] + ' not accessible: No such file or directory.\n'); continue; }
    if (n.mode & 63) {
      var at2 = '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n';
      c.err(at2 + '@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @\n' + at2 + 'Permissions 0' + (n.mode & 511).toString(8) + ' for \'' + p + '\' are too open.\nIt is required that your private key files are NOT accessible by others.\nThis private key will be ignored.\nLoad key "' + p + '": bad permissions\n');
      continue;
    }
    tried++;
    if (W.ssh.authIds.indexOf(keyId(n.c)) >= 0) { ok = true; break; }
  }
  if (!ok) { c.err(user + '@' + host + ': Permission denied (publickey).\n'); return 255; }
  W.ssh.loginOK = true;
  c.out('Welcome to Ubuntu 24.04 LTS (GNU/Linux 6.8.0-45-generic x86_64)\nLast login: Sun Oct 25 22:10:41 2026 from 203.0.113.7\n' + user + '@vps:~$  (đăng nhập thành công, phiên mô phỏng kết thúc, bạn vẫn ở máy cá nhân)\n');
  return 0;
};

function fp() { var s = '', ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; for (var i = 0; i < 43; i++) s += ch.charAt(Math.floor(Math.random() * ch.length)); return 'SHA256:' + s; }
cmds['ssh-keygen'] = function (a, c) {
  var sh = c.sh, W = sh.W, P = parseFlags(a, 'tfCNbR');
  if (P.f.R) {
    var kh = sh.home + '/.ssh/known_hosts', n = sh.fs.get(kh);
    if (!n) { c.out('Host ' + P.f.R + ' not found in ' + kh + '\n'); return 1; }
    var ls = lines(n.c), idx = ls.findIndex(function (l) { return l.split(' ')[0] === P.f.R; });
    if (idx < 0) { c.out('Host ' + P.f.R + ' not found in ' + kh + '\n'); return 0; }
    sh.fs.put(kh + '.old', n.c, { owner: sh.user });
    ls.splice(idx, 1); sh.fs.put(kh, ls.join('\n') + (ls.length ? '\n' : ''), { owner: sh.user, mode: 420 });
    c.out('# Host ' + P.f.R + ' found: line ' + (idx + 1) + '\n' + kh + ' updated.\nOriginal contents retained as ' + kh + '.old\n'); return 0;
  }
  var type = P.f.t || 'rsa', path = sh.abs(P.f.f || (sh.home + '/.ssh/id_' + type));
  if (sh.fs.ex(path)) { c.out(path + ' already exists.\nOverwrite (y/n)? (mô phỏng không hỏi lại: chọn tên file khác bằng -f)\n'); return 1; }
  var id = 'K' + (++W.keyN) + Math.floor(Math.random() * 1000);
  sh.fs.put(path, '-----BEGIN OPENSSH PRIVATE KEY-----\nKEYID:' + id + '\n-----END OPENSSH PRIVATE KEY-----\n', { owner: sh.user, mode: 384 });
  var com = P.f.C || (sh.user + '@' + sh.hostName);
  sh.fs.put(path + '.pub', 'ssh-' + type + ' AAAAC3NzaC1lZDI1NTE5' + id + ' ' + com + '\n', { owner: sh.user, mode: 420 });
  c.out('Generating public/private ' + type + ' key pair.\nYour identification has been saved in ' + path + '\nYour public key has been saved in ' + path + '.pub\nThe key fingerprint is:\n' + fp() + ' ' + com + '\n');
  return 0;
};
cmds['ssh-copy-id'] = function (a, c) {
  var sh = c.sh, W = sh.W, P = parseFlags(a, 'i'), tgt = P.rest[0] || '';
  var pubp = sh.abs(P.f.i || (sh.home + '/.ssh/id_ed25519.pub')), n = sh.fs.get(pubp);
  if (!n) throw new CmdErr('/usr/bin/ssh-copy-id: ERROR: No identities found');
  var id = (/AAAAC3NzaC1lZDI1NTE5(\w+)/.exec(n.c) || [])[1];
  if (W.ssh.authIds.indexOf(id) < 0) W.ssh.authIds.push(id);
  c.out('/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "' + pubp + '"\nNumber of key(s) added: 1\n\nNow try logging into the machine, with: "ssh ' + tgt + '"\nand check to make sure that only the key(s) you wanted were added.\n');
  return 0;
};

// ====================== sshd ======================
var SSHD_OK = {};
'match forcecommand permittty chrootdirectory authenticationmethods maxsessions allowagentforwarding banner port permitrootlogin passwordauthentication pubkeyauthentication kbdinteractiveauthentication challengeresponseauthentication usepam x11forwarding printmotd acceptenv subsystem allowusers maxauthtries clientaliveinterval clientalivecountmax logingracetime include authorizedkeysfile hostkey addressfamily listenaddress permitemptypasswords usedns loglevel allowtcpforwarding denyusers'.split(' ').forEach(function (k) { SSHD_OK[k] = 1; });
function sshdCheck(sh) {
  var n = sh.fs.get('/etc/ssh/sshd_config'), errs = [];
  if (!n) return ['/etc/ssh/sshd_config: No such file or directory'];
  lines(n.c).forEach(function (l, i) {
    var t = l.trim(); if (!t || t.charAt(0) === '#') return;
    var k = t.split(/\s+/)[0].toLowerCase();
    if (!SSHD_OK[k]) errs.push('/etc/ssh/sshd_config line ' + (i + 1) + ': Bad configuration option: ' + t.split(/\s+/)[0]);
  });
  if (errs.length) errs.push('/etc/ssh/sshd_config: terminating, ' + errs.length + ' bad configuration options');
  return errs;
}
cmds.sshd = function (a, c) {
  if (a.indexOf('-t') < 0) { c.out('usage: sshd -t   (mô phỏng chỉ hỗ trợ kiểm tra cấu hình)\n'); return 1; }
  if (!c.sh.isRoot(c)) { c.err('sshd: no hostkeys available -- exiting.\n'); return 1; }
  var e = sshdCheck(c.sh);
  if (e.length) { c.err(e.join('\n') + '\n'); return 255; }
  return 0;
};

// ====================== ufw / fail2ban ======================
cmds.ufw = function (a, c) {
  var sh = c.sh, W = sh.W, u = W.ufw;
  if (!sh.isRoot(c)) { c.err('ERROR: You need to be root to run this script\n'); return 1; }
  a = a.filter(function (x) { return x !== '--force'; });
  var sub = a[0];
  function norm(r) { return r.join(' '); }
  if (sub === 'status') {
    if (!u.active) { c.out('Status: inactive\n'); return 0; }
    var out = 'Status: active\n\nTo                         Action      From\n--                         ------      ----\n';
    u.rules.forEach(function (r) { out += pad(r.to, 27) + pad(r.action, 12) + r.from + '\n'; });
    c.out(out); return 0;
  }
  if (sub === 'enable') {
    var has22 = u.rules.some(function (r) { return /^(22|OpenSSH)/.test(r.to) && r.action === 'ALLOW'; });
    u.active = true; W.svc.ufw = true;
    c.out('Command may disrupt existing ssh connections. Proceed with operation (y|n)? y\nFirewall is active and enabled on system startup\n');
    if (!has22) { u.lockedOut = true; c.out('\n!!! Mô phỏng: bạn bật ufw khi chưa cho phép SSH, nên đã tự khoá mình khỏi VPS.\n    Ngoài đời phải vào console của nhà cung cấp để sửa. Bấm "Đặt lại" để làm lại, nhớ allow OpenSSH TRƯỚC khi enable.\n'); }
    return 0;
  }
  if (sub === 'disable') { u.active = false; c.out('Firewall stopped and disabled on system startup\n'); return 0; }
  if (sub === 'reset') { u.rules = []; u.active = false; c.out('Resetting all rules to installed defaults.\n'); return 0; }
  if (sub === 'default') {
    var pol = a[1], dir = a[2];
    if (['allow', 'deny', 'reject'].indexOf(pol) < 0 || ['incoming', 'outgoing'].indexOf(dir) < 0) throw new CmdErr('ERROR: Wrong number of arguments');
    if (dir === 'incoming') u.defIn = pol; else u.defOut = pol;
    c.out('Default ' + dir + ' policy changed to \'' + pol + '\'\n(be sure to update your rules accordingly)\n'); return 0;
  }
  if (sub === 'allow' || sub === 'deny' || sub === 'limit') {
    var rest = a.slice(1), to;
    if (rest[0] === 'from') { to = 'Anywhere'; var src = rest[1]; u.rules.push({ to: to, action: sub.toUpperCase(), from: src }); c.out('Rule added\n'); return 0; }
    to = rest[0];
    if (!to) throw new CmdErr('ERROR: Wrong number of arguments');
    if (to === 'Nginx') to = 'Nginx Full';
    if (rest[0] === 'Nginx' && rest[1] === 'Full') to = 'Nginx Full';
    if (u.rules.some(function (r) { return r.to === to && r.action === sub.toUpperCase(); })) { c.out('Skipping adding existing rule\n'); return 0; }
    u.rules.push({ to: to, action: sub.toUpperCase(), from: 'Anywhere' });
    c.out(u.active || true ? 'Rule added\n' : 'Rules updated\n');
    if (sub === 'deny') c.out('');
    return 0;
  }
  if (sub === 'delete') {
    var act = (a[1] || '').toUpperCase(), tt = a.slice(2).join(' '), before = u.rules.length;
    u.rules = u.rules.filter(function (r) { return !(r.action === act && r.to === tt && (r.from === 'Anywhere' || !r.from)); });
    c.out(before === u.rules.length ? 'Could not delete non-existent rule\n' : 'Rule deleted\n'); return 0;
  }
  c.out('Usage: ufw COMMAND\n'); return 1;
};

cmds['fail2ban-client'] = function (a, c) {
  var W = c.sh.W;
  if (!c.sh.isRoot(c)) throw new CmdErr('ERROR  Permission denied to socket: /var/run/fail2ban/fail2ban.sock, (you must be root)');
  if (a[0] === 'status' && !a[1]) { c.out('Status\n|- Number of jail:\t1\n`- Jail list:\tsshd\n'); return 0; }
  if (a[0] === 'status' && a[1] === 'sshd') {
    c.out('Status for the jail: sshd\n|- Filter\n|  |- Currently failed:\t3\n|  |- Total failed:\t' + (W.lastb.length * 3) + '\n|  `- File list:\t/var/log/auth.log\n`- Actions\n   |- Currently banned:\t' + W.f2b.banned.length + '\n   |- Total banned:\t' + W.f2b.banned.length + '\n   `- Banned IP list:\t' + W.f2b.banned.join(' ') + '\n');
    return 0;
  }
  if (a[0] === 'set' && a[1] === 'sshd' && a[2] === 'banip') { a.slice(3).forEach(function (ip) { if (W.f2b.banned.indexOf(ip) < 0) W.f2b.banned.push(ip); }); c.out(a.slice(3).length + '\n'); return 0; }
  if (a[0] === 'set' && a[1] === 'sshd' && a[2] === 'unbanip') { W.f2b.banned = W.f2b.banned.filter(function (x) { return a.slice(3).indexOf(x) < 0; }); c.out('1\n'); return 0; }
  c.out('Mô phỏng: hỗ trợ status, status sshd, set sshd banip|unbanip IP\n'); return 1;
};

cmds.lastb = function (a, c) {
  if (!c.sh.isRoot(c)) throw new CmdErr('lastb: cannot open /var/log/btmp: Permission denied');
  c.out(c.sh.W.lastb.join('\n') + '\n\nbtmp begins Mon Oct 19 00:00:11 2026\n'); return 0;
};

// ====================== systemctl / journalctl / nginx ======================
var UNITS = { nginx: 'A high performance web server and a reverse proxy server', ssh: 'OpenBSD Secure Shell server', ufw: 'Uncomplicated firewall', fail2ban: 'Fail2Ban Service', docker: 'Docker Application Container Engine', cloudflared: 'Cloudflare Tunnel', cron: 'Regular background program processing daemon' };
function unitActive(W, u) { return u === 'nginx' ? W.nginx.active : !!W.svc[u]; }
cmds.systemctl = function (a, c) {
  var sh = c.sh, W = sh.W, P = parseFlags(a), act = P.rest[0], unit = (P.rest[1] || '').replace(/\.service$/, '');
  if (unit === 'sshd') unit = 'ssh';
  if (act === 'list-timers') { c.out('NEXT                        LEFT     LAST  UNIT\nMon 2026-10-26 22:14:00 +07 4h left  -     certbot.timer\n'); return 0; }
  if (!act) { c.out('Usage: systemctl status|start|stop|restart|reload|enable UNIT\n'); return 1; }
  if (!UNITS[unit]) { c.err('Unit ' + (P.rest[1] || '') + '.service could not be found.\n'); return 4; }
  var on = unitActive(W, unit);
  if (act === 'status') {
    var st = on ? 'active (running) since Mon 2026-10-26 09:12:03 +07; 8h ago' : 'failed (Result: exit-code) since Mon 2026-10-26 17:40:12 +07; 9min ago';
    c.out((on ? '● ' : '× ') + unit + '.service - ' + UNITS[unit] + '\n     Loaded: loaded (/usr/lib/systemd/system/' + unit + '.service; enabled; preset: enabled)\n     Active: ' + st + '\n   Main PID: ' + (unit === 'nginx' ? 1021 : 900) + '\n');
    return on ? 0 : 3;
  }
  if (act === 'is-active') { c.out((on ? 'active' : 'inactive') + '\n'); return on ? 0 : 3; }
  if (act === 'is-enabled') { c.out('enabled\n'); return 0; }
  if (['start', 'stop', 'restart', 'reload', 'enable', 'disable'].indexOf(act) < 0) { c.err('Unknown command verb ' + act + '.\n'); return 1; }
  if (!sh.isRoot(c)) { c.err('Failed to ' + act + ' ' + unit + '.service: Interactive authentication required.\nSee system logs and \'systemctl status ' + unit + '.service\' for details.\n'); return 1; }
  if (act === 'enable' || act === 'disable') { c.out('Synchronizing state of ' + unit + '.service with SysV service script...\n'); return 0; }
  if (unit === 'nginx') {
    if (act === 'stop') { W.nginx.active = false; return 0; }
    var ok = ngReload(sh, act === 'restart' || act === 'start');
    if (!ok) { c.err('Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.\n'); return 1; }
    return 0;
  }
  if (unit === 'ssh') {
    if (act === 'stop') { W.svc.ssh = false; return 0; }
    var e = sshdCheck(sh);
    if (e.length) { c.err('Job for ssh.service failed because the control process exited with error code.\nSee "systemctl status ssh.service" and "journalctl -xeu ssh.service" for details.\n'); if (act !== 'reload') W.svc.ssh = false; return 1; }
    W.svc.ssh = true; W.ssh.reloadedOK = true;
    return 0;
  }
  W.svc[unit] = act !== 'stop'; return 0;
};
cmds.service = function (a, c) { return cmds.systemctl([a[1] || 'status', a[0]], c); };

cmds.nginx = function (a, c) {
  var sh = c.sh;
  if (a.indexOf('-v') >= 0) { c.err('nginx version: nginx/1.24.0 (Ubuntu)\n'); return 0; }
  if (a.indexOf('-t') >= 0) { var t = ngTestOutput(sh, c); c.err(t.out); return t.ok ? 0 : 1; }
  if (a[0] === '-s' && a[1] === 'reload') {
    if (!sh.isRoot(c)) { c.err('nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)\n2026/10/26 17:49:00 [notice] signal process started\n2026/10/26 17:49:00 [error] open() "/run/nginx.pid" failed (13: Permission denied)\n'); return 1; }
    var ok = ngReload(sh, false);
    if (!ok) { c.err(ngTestOutput(sh, c).out); return 1; }
    return 0;
  }
  c.out('Mô phỏng: nginx -t | nginx -s reload\n'); return 1;
};

cmds.journalctl = function (a, c) {
  var sh = c.sh, W = sh.W, unit = null, n = 20;
  for (var i = 0; i < a.length; i++) {
    if (a[i] === '-u') unit = a[++i];
    else if (/^-[a-z]*u$/.test(a[i])) unit = a[++i];
    else if (a[i] === '-n') n = parseInt(a[++i], 10);
    else if (a[i] === '--vacuum-size' || /^--vacuum-size=/.test(a[i])) {
      var v = (a[i].split('=')[1] || a[++i] || '200M');
      if (!sh.isRoot(c)) throw new CmdErr('Failed to vacuum: Access denied');
      var jf = sh.fs.get('/var/log/journal/system.journal');
      if (jf) { jf.size = 200 * 1048576; }
      c.out('Vacuuming done, freed 3.8G of archived journals from /var/log/journal.\n'); return 0;
    }
  }
  if (!sh.isRoot(c) && sh.user !== 'root') c.out('Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n');
  var l = (W.journal[unit || '_'] || [
    'Oct 26 09:12:03 vps systemd[1]: Started ' + (UNITS[unit] || 'service') + '.',
    'Oct 26 09:12:03 vps ' + (unit || 'system') + '[1021]: ready'
  ]);
  c.out(l.slice(-n).join('\n') + '\n'); return 0;
};

// ====================== certbot ======================
function writeCerts(sh, d) {
  var base = '/etc/letsencrypt/live/' + d;
  sh.fs.put(base + '/fullchain.pem', '-----BEGIN CERTIFICATE-----\nSIM:' + d + '\n-----END CERTIFICATE-----\n', { owner: 'root', mode: 420 });
  sh.fs.put(base + '/privkey.pem', '-----BEGIN PRIVATE KEY-----\nSIM\n-----END PRIVATE KEY-----\n', { owner: 'root', mode: 384 });
  sh.fs.put('/etc/letsencrypt/options-ssl-nginx.conf', 'ssl_session_cache shared:le_nginx_SSL:10m;\nssl_session_timeout 1440m;\n', { owner: 'root' });
  sh.fs.put('/etc/letsencrypt/ssl-dhparams.pem', 'DH PARAMETERS SIM\n', { owner: 'root' });
  sh.W.certs[d] = true;
}
function siteTemplate(d, upstream) {
  return ['server {', '    listen 80;', '    listen [::]:80;', '    server_name ' + d + ';', '    return 301 https://$host$request_uri; # managed by Certbot', '}', '',
    'server {', '    listen 443 ssl; # managed by Certbot', '    listen [::]:443 ssl;', '    server_name ' + d + ';', '    ssl_certificate /etc/letsencrypt/live/' + d + '/fullchain.pem; # managed by Certbot',
    '    ssl_certificate_key /etc/letsencrypt/live/' + d + '/privkey.pem; # managed by Certbot', '    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot', '',
    '    location / {', '        proxy_pass ' + upstream + ';', '        proxy_set_header Host $host;', '        proxy_set_header X-Forwarded-Proto $scheme;', '    }', '}', ''].join('\n');
}
cmds.certbot = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!sh.isRoot(c)) throw new CmdErr('Error while running certbot: Either run as root, or set --config-dir, --work-dir, and --logs-dir to writeable paths.');
  var sub = a[0];
  if (sub === 'certificates') {
    var ds = Object.keys(W.certs);
    if (!ds.length) { c.out('No certificates found.\n'); return 0; }
    c.out('Found the following certs:\n');
    ds.forEach(function (d) { c.out('  Certificate Name: ' + d + '\n    Domains: ' + d + '\n    Expiry Date: 2027-01-24 04:11:09+00:00 (VALID: 89 days)\n    Certificate Path: /etc/letsencrypt/live/' + d + '/fullchain.pem\n    Private Key Path: /etc/letsencrypt/live/' + d + '/privkey.pem\n'); });
    return 0;
  }
  if (sub === 'renew') {
    if (!Object.keys(W.certs).length) { c.out('No renewals were attempted.\n'); return 0; }
    c.out('Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nProcessing /etc/letsencrypt/renewal/' + Object.keys(W.certs)[0] + '.conf\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nAccount registered.\nSimulating renewal of an existing certificate for ' + Object.keys(W.certs).join(' and ') + '\n\nCongratulations, all simulated renewals succeeded:\n  ' + Object.keys(W.certs).map(function (d) { return '/etc/letsencrypt/live/' + d + '/fullchain.pem (success)'; }).join('\n  ') + '\n');
    return 0;
  }
  var P = parseFlags(a.filter(function (x) { return x !== '--nginx' && x !== '--dns-cloudflare' && x !== '--standalone'; }), 'd');
  var doms = []; for (var i = 0; i < a.length; i++) if (a[i] === '-d' || a[i] === '--domain') doms.push(a[++i]);
  var useNginx = a.indexOf('--nginx') >= 0, useDns = a.indexOf('--dns-cloudflare') >= 0;
  if (!doms.length) throw new CmdErr('No names were found in your configuration files. Use -d DOMAIN.');
  if (!useNginx && !useDns) { c.out('Mô phỏng: dùng --nginx hoặc --dns-cloudflare.\n'); return 1; }
  c.out('Saving debug log to /var/log/letsencrypt/letsencrypt.log\n');
  if (useDns) {
    var ci = a.indexOf('--dns-cloudflare-credentials'), cp = ci >= 0 ? sh.abs(a[ci + 1]) : null;
    if (!cp || !sh.fs.isF(cp)) throw new CmdErr('Missing property in credentials configuration file: dns_cloudflare_api_token (cần --dns-cloudflare-credentials FILE)');
    c.out('Requesting a certificate for ' + doms.join(' and ') + '\nWaiting 10 seconds for DNS changes to propagate\n');
    doms.forEach(function (d) { writeCerts(sh, d); });
    c.out('\nSuccessfully received certificate.\nCertificate is saved at: /etc/letsencrypt/live/' + doms[0] + '/fullchain.pem\nKey is saved at:         /etc/letsencrypt/live/' + doms[0] + '/privkey.pem\nThis certificate expires on 2027-01-24.\n');
    return 0;
  }
  var t = ngLoad(sh);
  if (t.errors.length) throw new CmdErr('nginx.conf test failed\n' + t.errors.join('\n') + '\nThe nginx plugin is not working; there may be problems with your existing configuration.\nThe error was: MisconfigurationError(\'Error while running nginx -c /etc/nginx/nginx.conf -t.\')');
  var missing = doms.filter(function (d) { return !t.servers.some(function (s) { return s.names.indexOf(d) >= 0 && s.listens.some(function (l) { return l.port === 80; }); }); });
  if (missing.length) throw new CmdErr('Could not automatically find a matching server block for ' + missing[0] + '. Set the `server_name` directive to use the Nginx installer.');
  var d0 = doms[0], srvB = t.servers.filter(function (s) { return s.names.indexOf(d0) >= 0; })[0], up = 'http://127.0.0.1:3000';
  srvB.locs.forEach(function (l) { l.stmts.forEach(function (s) { if (s.name === 'proxy_pass') up = s.args[0]; }); });
  c.out('Requesting a certificate for ' + doms.join(' and ') + '\n\nSuccessfully received certificate.\nCertificate is saved at: /etc/letsencrypt/live/' + d0 + '/fullchain.pem\nKey is saved at:         /etc/letsencrypt/live/' + d0 + '/privkey.pem\nThis certificate expires on 2027-01-24.\n');
  doms.forEach(function (d) { writeCerts(sh, d); });
  if (a.indexOf('certonly') < 0) {
    sh.fs.put(srvB.file, siteTemplate(d0, up), { owner: 'root' });
    ngReload(sh, false);
    c.out('Deploying certificate\nSuccessfully deployed certificate for ' + d0 + ' to ' + srvB.file + '\nCongratulations! You have successfully enabled HTTPS on https://' + d0 + '\n');
  }
  return 0;
};

cmds.cfctl = function (a, c) {
  var W = c.sh.W;
  if (a[0] === 'ssl-mode') {
    if (a[1]) {
      if (['off', 'flexible', 'full', 'full-strict'].indexOf(a[1]) < 0) throw new CmdErr('cfctl: chế độ hợp lệ: flexible | full | full-strict');
      W.cf.mode = a[1]; c.out('SSL/TLS encryption mode -> ' + a[1] + '\n'); return 0;
    }
    c.out(W.cf.mode + '\n'); return 0;
  }
  c.out('cfctl: lệnh giả lập cho bài tập (ngoài đời bạn chỉnh trong Cloudflare Dashboard > SSL/TLS).\n  cfctl ssl-mode [flexible|full|full-strict]\n'); return 0;
};

cmds.apt = function (a, c) { needRoot(c, 'apt', 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?'); c.out('Reading package lists... Done\nBuilding dependency tree... Done\n' + (a[0] === 'install' ? 'Setting up packages... done.\n' : 'All packages are up to date.\n')); return 0; };
cmds['apt-get'] = cmds.apt;

// ====================== df / free / du / ps ======================
function usedBytes(sh) {
  var s = sh.W.diskBaseGB * 1073741824 + (sh.W.heldBytes || 0);
  for (var k in sh.fs.n) { var n = sh.fs.n[k]; if (n.t === 'f' && n.size != null) s += n.size; }
  return s;
}
cmds.df = function (a, c) {
  var used = usedBytes(sh0(c)) + (VPS.dkDisk ? VPS.dkDisk(c.sh) : 0), total = 90 * 1073741824, avail = total - used, pct = Math.min(100, Math.round(used / total * 100));
  c.out('Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        90G  ' + pad(hs(used), 4, true) + ' ' + pad(hs(Math.max(0, avail)), 5, true) + ' ' + pad(pct + '%', 4, true) + ' /\ntmpfs           3.9G     0  3.9G   0% /dev/shm\n');
  return 0;
};
function sh0(c) { return c.sh; }
cmds.free = function (a, c) { c.out('               total        used        free      shared  buff/cache   available\nMem:           7.8Gi       1.6Gi       4.9Gi       4.0Mi       1.3Gi       6.2Gi\nSwap:          2.0Gi          0B       2.0Gi\n'); return 0; };
cmds.du = function (a, c) {
  var sh = c.sh, P = parseFlags(a);
  P.rest.forEach(function (p) {
    var full = sh.abs(p);
    if (!sh.fs.ex(full)) { c.err("du: cannot access '" + p + "': No such file or directory\n"); return; }
    if (sh.fs.isD(full) && !sh.canRead(full, c)) { c.err("du: cannot read directory '" + p + "': Permission denied\n"); c.out('0\t' + p + '\n'); return; }
    c.out(hs(sh.fs.size(sh.fs.real(full))) + '\t' + p + '\n');
  });
  return 0;
};
cmds.ps = function (a, c) {
  var out = 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n';
  c.sh.listeners().forEach(function (l) { out += pad('root', 9) + pad(l.pid, 6, true) + '  0.1  0.4 123456 34567 ?        Ssl  09:12   0:03 ' + l.proc + '\n'; });
  c.out(out); return 0;
};

// ====================== docker ======================
function yaml(text) {
  var L = [];
  text.split('\n').forEach(function (raw) {
    if (/^\s*(#.*)?$/.test(raw)) return;
    var ind = raw.match(/^ */)[0].length;
    L.push({ ind: ind, s: raw.trim() });
  });
  function scalar(v) { v = v.trim(); if (/^(["'])(.*)\1$/.test(v)) return v.slice(1, -1); return v; }
  function block(i, ind) {
    if (i >= L.length) return [null, i];
    if (L[i].s.indexOf('- ') === 0 || L[i].s === '-') {
      var arr = [];
      while (i < L.length && L[i].ind === ind && L[i].s.charAt(0) === '-') { arr.push(scalar(L[i].s.slice(2))); i++; }
      return [arr, i];
    }
    var o = {};
    while (i < L.length && L[i].ind === ind) {
      var m = /^([^:]+?):\s*(.*)$/.exec(L[i].s);
      if (!m) { i++; continue; }
      i++;
      if (m[2] !== '') o[m[1]] = scalar(m[2]);
      else if (i < L.length && L[i].ind > ind) { var r = block(i, L[i].ind); o[m[1]] = r[0]; i = r[1]; }
      else if (i < L.length && L[i].ind === ind && L[i].s.charAt(0) === '-') { var r2 = block(i, ind); o[m[1]] = r2[0]; i = r2[1]; }
      else o[m[1]] = '';
    }
    return [o, i];
  }
  return block(0, L.length ? L[0].ind : 0)[0] || {};
}
function cid(name) { var h = 0, s = ''; for (var i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0; var ch = '0123456789abcdef'; for (var j = 0; j < 12; j++) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; s += ch.charAt((h >>> 8) % 16); } return s; }
function composeLoad(sh, c, envFile) {
  var cwd = sh.cwd, file = ['docker-compose.yml', 'compose.yaml', 'compose.yml', 'docker-compose.yaml'].map(function (f) { return cwd + '/' + f; }).filter(function (p) { return sh.fs.isF(p); })[0];
  if (!file) throw new CmdErr('no configuration file provided: not found');
  var env = {}, ep = envFile ? sh.abs(envFile) : cwd + '/.env';
  if (envFile && !sh.fs.isF(ep)) throw new CmdErr("couldn't find env file: " + ep);
  if (sh.fs.isF(ep)) lines(sh.fs.get(ep).c).forEach(function (l) { var m = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(l); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
  var text = sh.fs.get(file).c;
  text = text.replace(/\$\{(\w+)(?:(:-|:\?|-|\?)([^}]*))?\}/g, function (m, name, op, arg) {
    var v = env[name];
    if (op === ':?' || op === '?') { if (v == null || v === '') throw new CmdErr('required variable ' + name + ' is missing a value: ' + arg); }
    if ((op === ':-' || op === '-') && (v == null || v === '')) return arg;
    return v == null ? '' : v;
  });
  var doc = yaml(text), project = cwd.split('/').pop().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return { doc: doc, project: project, env: env, file: file };
}
VPS.yaml = yaml; VPS.composeLoad = composeLoad;
function svcEnv(sh, svc) {
  var e = {};
  var ef = svc.env_file; if (ef) { (Array.isArray(ef) ? ef : [ef]).forEach(function (p) { var n = sh.fs.get(sh.abs(p)); if (n) lines(n.c).forEach(function (l) { var m = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(l); if (m) e[m[1]] = m[2]; }); }); }
  var en = svc.environment;
  if (Array.isArray(en)) en.forEach(function (x) { var i = x.indexOf('='); if (i > 0) e[x.slice(0, i)] = x.slice(i + 1); });
  else if (en && typeof en === 'object') for (var k in en) e[k] = en[k];
  return e;
}
function parsePorts(list) {
  return (list || []).map(function (p) {
    var parts = String(p).replace(/\/(tcp|udp)$/, '').split(':');
    if (parts.length === 3) return { bind: parts[0], host: +parts[1], cont: +parts[2] };
    if (parts.length === 2) return { bind: '0.0.0.0', host: +parts[0], cont: +parts[1] };
    return { bind: '0.0.0.0', host: 32768 + (+parts[0] % 100), cont: +parts[0] };
  });
}
function nextIp(W) { W.ipN = (W.ipN || 1) + 1; return '172.18.0.' + W.ipN; }
function bindList(sh, vols) { var o = []; (Array.isArray(vols) ? vols : []).forEach(function (v) { var m = /^((?:\.{1,2})?\/[^:]*):(\/[^:]*)/.exec(v); if (m) o.push({ host: sh.abs(m[1]), cont: m[2] }); }); return o; }
function crashState(ct, logs) { var again = /^(unless-stopped|always|on-failure)/.test(ct.restartPolicy || ''); ct.state = again ? 'restarting' : 'exited'; ct.status = again ? 'Restarting (1) 6 seconds ago' : 'Exited (1) 8 seconds ago'; ct.logs = logs; }
function memParse(v) { var m = /^(\d+)\s*([mMgG])/.exec(String(v || '')); return m ? (/g/i.test(m[2]) ? +m[1] * 1024 : +m[1]) : null; }
function applyRules(sh) {
  var W = sh.W;
  W.containers.forEach(function (ct) {
    if (ct.state === 'exited' && ct.manualStop) return;
    var svc = ct.svc || ct.name;
    ct.portErr = null;
    var pc = ct.state !== 'running' ? (ct.ports || []).filter(function (p) { return sh.listeners().some(function (l) { return l.port === p.host && l.proc !== 'docker-proxy'; }); })[0] : null;
    if (pc) { ct.state = 'created'; ct.status = 'Created'; ct.logs = []; ct.portErr = 'Error response from daemon: driver failed programming external connectivity on endpoint ' + ct.name + ': Bind for ' + pc.bind + ':' + pc.host + ' failed: port is already allocated'; return; }
    if (/postgres/.test(svc)) {
      var vm = /:(\d+)/.exec(ct.image || '');
      if (W.db && W.db.initialized && W.db.version && vm && vm[1] !== W.db.version) {
        crashState(ct, ['FATAL:  database files are incompatible with server', 'DETAIL:  The data directory was initialized by PostgreSQL version ' + W.db.version + ', which is not compatible with this version ' + vm[1] + '.']);
      } else {
      ct.state = 'running'; ct.status = 'Up 2 minutes (healthy)';
      ct.logs = ['LOG:  database system is ready to accept connections'];
      }
    } else if (W.db && /^(api|gateway|backend|be)$/.test(svc)) {
      var pw = ct.env.DB_PASSWORD;
      ct.memKill = false;
      var imN = ct.image.indexOf(':') > 0 ? ct.image : ct.image + ':latest', im = (W.images || []).filter(function (x) { return x.repo + ':' + x.tag === imN; })[0];
      var pgBad = W.containers.some(function (o) { return o.proj === ct.proj && /postgres/.test(o.svc || '') && o.state !== 'running'; });
      var bindBad = null;
      (ct.binds || []).forEach(function (b) { var bn = sh.fs.get(b.host); if (!bn) { sh.fs.mkdirp(b.host, 'root', 493); bn = sh.fs.get(b.host); } if (!bindBad && bn.owner !== sh.user && !(bn.mode & 2)) bindBad = b; });
      if (im && im.crash) crashState(ct, im.crash);
      else if (bindBad) crashState(ct, ['[Nest] LOG  [NestFactory] Starting Nest application...', "Error: EACCES: permission denied, open '" + bindBad.cont + "/.write-test'", '    at Object.openSync (node:fs:603:3)']);
      else if (pgBad) crashState(ct, ['Error: connect ECONNREFUSED postgres:5432', '[Nest] ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...']);
      else if (W.db && W.db.slowStart && !ct.dependsHealthy && !/^(unless-stopped|always|on-failure)/.test(ct.restartPolicy || '')) crashState(ct, ['[Nest] LOG  [NestFactory] Starting Nest application...', 'Error: connect ECONNREFUSED 172.18.0.2:5432', '    (database system is starting up)']);
      else if (ct.memMB && ct.memMB < 256) { ct.memKill = true; ct.state = 'restarting'; ct.status = 'Restarting (137) 5 seconds ago'; ct.logs = ['[Nest] LOG  [NestFactory] Starting Nest application...', '<--- Last few GCs --->', 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory']; }
      else if (ct.env.DB_HOST && ct.env.DB_HOST !== 'postgres') { ct.state = 'restarting'; ct.status = 'Restarting (1) 6 seconds ago'; ct.logs = ['[Nest] LOG  [NestFactory] Starting Nest application...', 'Error: connect ECONNREFUSED ' + ct.env.DB_HOST + ':5432', '    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)', '[Nest] ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...']; }
      else if (pw == null) { ct.state = 'restarting'; ct.status = 'Restarting (1) 6 seconds ago'; ct.logs = ['Error: DB_PASSWORD is not defined']; }
      else if (pw !== W.db.password) {
        ct.state = 'restarting'; ct.status = 'Restarting (1) 6 seconds ago';
        ct.logs = ['[Nest] LOG  [NestFactory] Starting Nest application...', 'error: password authentication failed for user "' + W.db.user + '"', '    at Parser.parseErrorMessage (pg-protocol/src/parser.ts:285:98)', '[Nest] ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...'];
      } else { ct.state = 'running'; ct.status = 'Up 2 minutes'; ct.logs = ['[Nest] LOG  [NestFactory] Starting Nest application...', '[Nest] LOG  Database connected', '[Nest] LOG  Nest application successfully started', 'Listening on port 8888']; }
    } else if (ct.state !== 'running') { ct.state = 'running'; ct.status = 'Up 2 minutes'; if (!ct.logs || !ct.logs.length) ct.logs = ['started']; }
  });
}
VPS.applyRules = applyRules;
function findCt(W, name) { return W.containers.filter(function (ct) { return ct.name === name || ct.id === name || ct.id.indexOf(name) === 0; })[0]; }
function portsStr(ct) {
  if (ct.state !== 'running') return '';
  var out = [];
  (ct.ports || []).forEach(function (p) { out.push(p.bind + ':' + p.host + '->' + p.cont + '/tcp'); if (p.bind === '0.0.0.0') out.push('[::]:' + p.host + '->' + p.cont + '/tcp'); });
  return out.join(', ');
}
function table(rows) {
  var w = []; rows.forEach(function (r) { r.forEach(function (x, i) { w[i] = Math.max(w[i] || 0, String(x).length); }); });
  return rows.map(function (r) { return r.map(function (x, i) { return i === r.length - 1 ? x : pad(x, w[i] + 3); }).join(''); }).join('\n') + '\n';
}
function fmtFormat(fmt, ct) {
  var map = { Names: ct.name, Image: ct.image, Status: ct.status, Ports: portsStr(ct), ID: ct.id, State: ct.state === 'restarting' ? 'restarting' : ct.state };
  return fmt.replace(/\{\{\.(\w+)\}\}/g, function (m, k) { return map[k] != null ? map[k] : ''; });
}
function dockerPs(sh, c, a) {
  var W = sh.W, all = a.indexOf('-a') >= 0 || a.indexOf('-aq') >= 0, q = a.indexOf('-q') >= 0 || a.indexOf('-aq') >= 0;
  var fi = a.indexOf('--format'), fmt = fi >= 0 ? a[fi + 1] : null;
  var list = W.containers.filter(function (ct) { return all || ct.state !== 'exited'; });
  if (q) { c.out(list.map(function (ct) { return ct.id; }).join('\n') + (list.length ? '\n' : '')); return 0; }
  if (fmt) {
    var isTable = /^table /.test(fmt), f = fmt.replace(/^table /, '').replace(/\\t/g, '\t'), rows = [];
    if (isTable) rows.push(f.split('\t').map(function (x) { return x.replace(/\{\{\.(\w+)\}\}/, function (m, k) { return k.toUpperCase(); }); }));
    list.forEach(function (ct) { rows.push(fmtFormat(f, ct).split('\t')); });
    if (isTable) c.out(table(rows)); else c.out(rows.map(function (r) { return r.join('\t'); }).join('\n') + '\n');
    return 0;
  }
  var rows2 = [['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES']];
  list.forEach(function (ct) { rows2.push([ct.id, ct.image, '"docker-entrypoint.s…"', '2 hours ago', ct.status, portsStr(ct), ct.name]); });
  c.out(table(rows2)); return 0;
}
function dockerCompose(sh, c, a) {
  var W = sh.W, envFile = null, rest = [], i;
  for (i = 0; i < a.length; i++) { if (a[i] === '--env-file') envFile = a[++i]; else if (a[i] === '-p') i++; else rest.push(a[i]); }
  var sub = rest[0], args = rest.slice(1);
  var L = composeLoad(sh, c, envFile), svcs = L.doc.services || {};
  var names = Object.keys(svcs);
  function projCts() { return W.containers.filter(function (ct) { return ct.proj === L.project; }); }
  if (sub === 'config') { if (args.indexOf('--quiet') >= 0 || args.indexOf('-q') >= 0) return 0; c.out('name: ' + L.project + '\nservices:\n' + names.map(function (n) { return '  ' + n + ':\n    image: ' + (svcs[n].image || '') + '\n'; }).join('')); return 0; }
  if (sub === 'up') {
    var out = '', upStarted = [];
    var upSel = args.filter(function (x) { return x.charAt(0) !== '-' && names.indexOf(x) >= 0; }), upNoDeps = args.indexOf('--no-deps') >= 0, upForce = args.indexOf('--force-recreate') >= 0, upTargets = names;
    if (W.dk4 && upSel.length) { upTargets = upSel.slice(); if (!upNoDeps) { var qq = upSel.slice(); while (qq.length) { var dn = qq.pop(), dd = svcs[dn].depends_on, dl = Array.isArray(dd) ? dd : (dd ? Object.keys(dd) : []); dl.forEach(function (x) { if (names.indexOf(x) >= 0 && upTargets.indexOf(x) < 0) { upTargets.push(x); qq.push(x); } }); } } }
    names.forEach(function (n) {
      var s = svcs[n], name = s.container_name || (L.project + '-' + n + '-1');
      if (W.dk4 && upTargets.indexOf(n) < 0) return;
      if (/postgres/.test(n) && W.db && !W.db.initialized) { var e0 = svcEnv(sh, s); W.db.initialized = true; if (W.db.hasData == null) W.db.hasData = true; var vm0 = /:(\d+)/.exec(s.image || ''); if (vm0) W.db.version = vm0[1]; if (e0.POSTGRES_PASSWORD) W.db.password = e0.POSTGRES_PASSWORD; }
      var old = W.containers.filter(function (ct) { return ct.name === name; })[0];
      var ct = { id: cid(name), name: name, image: s.image || (L.project + '-' + n), svcCfg: s, svc: n, proj: L.project, ports: parsePorts(s.ports), env: svcEnv(sh, s), memMB: memParse(s.mem_limit), restartPolicy: s.restart, dependsHealthy: JSON.stringify(s.depends_on || '').indexOf('service_healthy') >= 0, binds: bindList(sh, s.volumes), ip: nextIp(W), state: 'created', status: '', logs: [], cpu: 0.3, mem: '120MiB / 7.8GiB' };
      if (W.dk4) {
        var ipr = VPS.dk.split(s.image || ''), iim = VPS.dk.imgs(W).filter(function (x) { return x.repo === ipr[0] && x.tag === ipr[1]; })[0];
        ct.cfgHash = JSON.stringify([s.image, iim && iim.id, ct.env, s.ports, s.mem_limit, s.cpus, s.restart, s.healthcheck, s.networks, s.volumes, s.command, s.logging, s.user]);
        if (old && old.cfgHash === ct.cfgHash && !upForce && old.state !== 'exited') { out += ' Container ' + name + '  Running\n'; return; }
      }
      upStarted.push(name);
      if (old) W.containers.splice(W.containers.indexOf(old), 1);
      W.containers.push(ct);
      out += ' Container ' + name + '  ' + (old ? 'Recreated' : 'Created') + '\n';
    });
    applyRules(sh);
    var bad = W.containers.filter(function (ct) { return ct.proj === L.project && ct.portErr; });
    if (bad.length) { out += names.filter(function (n) { var nm = svcs[n].container_name || (L.project + '-' + n + '-1'); return !bad.some(function (b) { return b.name === nm; }); }).map(function (n) { return ' Container ' + (svcs[n].container_name || (L.project + '-' + n + '-1')) + '  Started'; }).join('\n') + '\n'; c.out(out); c.err(bad.map(function (b) { return b.portErr; }).join('\n') + '\n'); return 1; }
    out += (W.dk4 ? upStarted : names.map(function (n) { return svcs[n].container_name || (L.project + '-' + n + '-1'); })).map(function (nm) { return ' Container ' + nm + '  Started'; }).join('\n') + (W.dk4 && !upStarted.length ? '' : '\n');
    c.out(out); return 0;
  }
  if (sub === 'down') {
    var vol = args.indexOf('-v') >= 0;
    projCts().forEach(function (ct) { c.out(' Container ' + ct.name + '  Removed\n'); W.containers.splice(W.containers.indexOf(ct), 1); });
    if (vol && W.db) { W.db.initialized = false; c.out(' Volume ' + L.project + '_pgdata  Removed\n'); }
    return 0;
  }
  if (sub === 'ps') {
    var rows = [['NAME', 'IMAGE', 'SERVICE', 'STATUS', 'PORTS']];
    projCts().forEach(function (ct) { rows.push([ct.name, ct.image, ct.svc, ct.status, portsStr(ct)]); });
    c.out(table(rows)); return 0;
  }
  if (sub === 'restart' || sub === 'stop' || sub === 'start') {
    var targets = projCts().filter(function (ct) { return !args.length || args.indexOf(ct.svc) >= 0; });
    targets.forEach(function (ct) {
      if (sub === 'stop') { ct.state = 'exited'; ct.manualStop = true; ct.status = 'Exited (0) 2 seconds ago'; }
      else { ct.state = 'created'; ct.manualStop = false; }
      c.out(' Container ' + ct.name + '  ' + (sub === 'stop' ? 'Stopped' : sub === 'start' ? 'Started' : 'Started') + '\n');
    });
    applyRules(sh); return 0;
  }
  if (sub === 'logs') {
    projCts().filter(function (ct) { return !args.filter(function (x) { return x.charAt(0) !== '-' && !/^\d+$/.test(x); }).length || args.indexOf(ct.svc) >= 0; }).forEach(function (ct) { (ct.logs || []).forEach(function (l) { c.out(ct.name + '  | ' + l + '\n'); }); });
    return 0;
  }
  if (sub === 'exec') return dockerExec(sh, c, [projCts().filter(function (ct) { return ct.svc === args.filter(function (x) { return x.charAt(0) !== '-'; })[0]; })[0] ? projCts().filter(function (ct) { return ct.svc === args.filter(function (x) { return x.charAt(0) !== '-'; })[0]; })[0].name : 'x'].concat(args.filter(function (x) { return x.charAt(0) !== '-'; }).slice(1)).slice(0));
  throw new CmdErr('Mô phỏng: docker compose hỗ trợ up, down, ps, logs, restart, stop, start, config');
}
function dockerExec(sh, c, args) {
  var W = sh.W, a = args.filter(function (x) { return x !== '-it' && x !== '-i' && x !== '-t' && x !== '-T'; });
  var ct = findCt(W, a[0]);
  if (!ct) throw new CmdErr('Error response from daemon: No such container: ' + a[0]);
  if (ct.state !== 'running') throw new CmdErr('Error response from daemon: container ' + ct.id + ' is not running');
  var cmd = a.slice(1);
  if (cmd[0] === 'psql') {
    var ci = cmd.indexOf('-c'), sql = ci >= 0 ? cmd[ci + 1] : null;
    if (!sql) { c.out('psql (16.4)\nType "help" for help.\n(mô phỏng không mở phiên tương tác, dùng -c "SQL")\n'); return 0; }
    var m = /alter\s+(?:user|role)\s+(\w+)\s+with\s+password\s+'([^']*)'/i.exec(sql);
    if (m && W.db) { W.db.password = m[2]; c.out('ALTER ROLE\n'); return 0; }
    if (/^\\dt/.test(sql)) { c.out('             List of relations\n Schema |    Name    | Type  | Owner\n--------+------------+-------+-------\n public | users      | table | app\n public | sessions   | table | app\n public | bookings   | table | app\n(3 rows)\n'); return 0; }
    if (/^\\du/.test(sql)) { c.out('                 List of roles\n Role name |                         Attributes\n-----------+------------------------------------------------------------\n app       |\n postgres  | Superuser, Create role, Create DB, Replication, Bypass RLS\n'); return 0; }
    c.out(' ?column?\n----------\n        1\n(1 row)\n'); return 0;
  }
  if (cmd[0] === 'env' || cmd[0] === 'printenv') { for (var k in ct.env) c.out(k + '=' + ct.env[k] + '\n'); return 0; }
  c.out('Mô phỏng: docker exec hỗ trợ psql -c "..." và env\n'); return 0;
}
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W, sub = a[0], rest = a.slice(1);
  if (sub === 'ps') return dockerPs(sh, c, rest);
  if (sub === 'compose') return dockerCompose(sh, c, rest);
  if (sub === 'logs') {
    var n = 1e9, name = null;
    for (var i = 0; i < rest.length; i++) { if (rest[i] === '--tail' || rest[i] === '-n') n = parseInt(rest[++i], 10); else if (rest[i].charAt(0) !== '-') name = rest[i]; }
    var ct = findCt(W, name); if (!ct) throw new CmdErr('Error response from daemon: No such container: ' + name);
    var l = ct.logs || []; c.out(l.slice(Math.max(0, l.length - n)).join('\n') + (l.length ? '\n' : '')); return 0;
  }
  if (sub === 'exec') return dockerExec(sh, c, rest);
  if (sub === 'stop' || sub === 'kill' || sub === 'start' || sub === 'restart' || sub === 'rm') {
    var rc = 0;
    rest.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (nm) {
      var t = findCt(W, nm); if (!t) { c.err('Error response from daemon: No such container: ' + nm + '\n'); rc = 1; return; }
      if (sub === 'rm') { if (t.state === 'running' && rest.indexOf('-f') < 0) { c.err('Error response from daemon: cannot remove container "' + nm + '": container is running: stop the container before removing or force remove\n'); rc = 1; return; } W.containers.splice(W.containers.indexOf(t), 1); }
      else if (sub === 'stop' || sub === 'kill') { t.state = 'exited'; t.manualStop = true; t.status = 'Exited (0) 2 seconds ago'; }
      else { t.state = 'created'; t.manualStop = false; applyRules(sh); }
      c.out(nm + '\n');
    });
    return rc;
  }
  if (sub === 'stats') {
    var rows = [['CONTAINER ID', 'NAME', 'CPU %', 'MEM USAGE / LIMIT', 'MEM %', 'NET I/O', 'PIDS']];
    W.containers.filter(function (ct) { return ct.state === 'running'; }).forEach(function (ct) { rows.push([ct.id, ct.name, ct.cpu.toFixed(2) + '%', ct.mem, '1.5%', '2.1MB / 1.8MB', '14']); });
    c.out(table(rows)); return 0;
  }
  if (sub === 'images') { c.out('REPOSITORY      TAG       IMAGE ID       CREATED        SIZE\ntutor-api       latest    3f1a2b9c0d11   2 hours ago    412MB\npostgres        16        a9c1d2e3f405   3 weeks ago    432MB\n'); return 0; }
  if (sub === '--version' || sub === 'version') { c.out('Docker version 27.3.1, build ce12230\n'); return 0; }
  throw new CmdErr('Mô phỏng: docker hỗ trợ ps, logs, exec, stop, start, restart, rm, stats, images, compose');
};
cmds['docker-compose'] = function (a, c) { return cmds.docker(['compose'].concat(a), c); };

// ====================== pm2 / npm ======================
function parseEco(sh, file) {
  var n = sh.fs.get(file); if (!n) return null;
  var parts = n.c.split(/name:\s*/).slice(1), apps = [];
  parts.forEach(function (p) {
    var nm = /^['"]([^'"]+)['"]/.exec(p); if (!nm) return;
    var cwd = /cwd:\s*['"]([^'"]+)['"]/.exec(p), port = /PORT:\s*['"]?(\d+)/.exec(p), sc = /script:\s*['"]([^'"]+)['"]/.exec(p);
    apps.push({ name: nm[1], dir: cwd ? cwd[1] : file.replace(/\/[^\/]*$/, ''), port: port ? +port[1] : 3000, script: sc ? sc[1] : 'npm' });
  });
  return apps;
}
function pm2Eval(sh, app) {
  var W = sh.W, fs = sh.fs, a = W.pm2[app.name], msg = null;
  app.logs = [];
  if (!fs.isD(app.dir)) msg = 'Error: ENOENT: no such file or directory, chdir \'' + app.dir + '\'';
  else if (/ui|web|next/.test(app.name) && !fs.isD(app.dir + '/.next')) msg = 'Error: Could not find a production build in the \'.next\' directory. Try building your app with \'next build\' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id';
  else if (/api|back|gateway/.test(app.name) && !fs.isF(app.dir + '/dist/main.js')) msg = 'Error: Cannot find module \'' + app.dir + '/dist/main\'';
  if (!msg) {
    var other = sh.listeners().filter(function (l) { return l.port === app.port && !(W.pm2[app.name] && W.pm2[app.name].status === 'online' && l.proc === 'node' && l.pid === W.pm2[app.name].pid); })[0];
    if (other) msg = 'Error: listen EADDRINUSE: address already in use :::' + app.port + '\n    at Server.setupListenHandle [as _listen2] (node:net:1817:16)';
  }
  app.restarts = (a ? a.restarts : 0) + (msg ? 15 : 0);
  if (msg) { app.status = 'errored'; app.pid = 0; app.logs = msg.split('\n'); }
  else { app.status = 'online'; app.pid = 5000 + Math.floor(Math.random() * 900); app.logs = ['▲ Next.js 14.2.5', '- Local:        http://localhost:' + app.port, '✓ Ready in 412ms']; }
  W.pm2[app.name] = app;
}
cmds.pm2 = function (a, c) {
  var sh = c.sh, W = sh.W, sub = a[0], rest = a.slice(1), P = parseFlags(rest, 'n');
  function list() {
    var names = Object.keys(W.pm2);
    var H = ['id', 'name', 'mode', '↺', 'status', 'cpu', 'memory'], rows = [];
    names.forEach(function (n, i) { var p = W.pm2[n]; rows.push([String(i), n, 'fork', String(p.restarts), p.status, p.status === 'online' ? '0%' : '0%', p.status === 'online' ? '78.4mb' : '0b']); });
    var w = H.map(function (h, i) { return Math.max(h.length, rows.reduce(function (m, r) { return Math.max(m, r[i].length); }, 0)) + 2; });
    var line = function (l, m, r) { return l + w.map(function (x) { return new Array(x + 1).join('─'); }).join(m) + r + '\n'; };
    var row = function (r) { return '│' + r.map(function (x, i) { return ' ' + pad(x, w[i] - 1); }).join('│') + '│\n'; };
    var out = line('┌', '┬', '┐') + row(H) + line('├', '┼', '┤');
    rows.forEach(function (r) { out += row(r); });
    c.out(out + line('└', '┴', '┘'));
  }
  if (sub === 'list' || sub === 'ls' || sub === 'status' || sub === 'l') { list(); return 0; }
  if (sub === 'start' || (sub === 'restart' && /\.config\.js$/.test(rest[0] || ''))) {
    var tgt = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0], oi = rest.indexOf('--only'), only = oi >= 0 ? rest[oi + 1] : null;
    if (/\.config\.js$/.test(tgt || '')) {
      var apps = parseEco(sh, sh.abs(tgt));
      if (!apps) throw new CmdErr('[PM2][ERROR] File ' + tgt + ' not found');
      apps.filter(function (x) { return !only || x.name === only; }).forEach(function (x) { pm2Eval(sh, x); });
      list(); return 0;
    }
    var ex = W.pm2[tgt];
    if (!ex) throw new CmdErr('[PM2][ERROR] Script not found: ' + tgt + ' (mô phỏng: dùng pm2 start ecosystem.config.js --only TÊN)');
    pm2Eval(sh, ex); list(); return 0;
  }
  if (sub === 'restart' || sub === 'reload') {
    var names = rest[0] === 'all' ? Object.keys(W.pm2) : [rest[0]];
    names.forEach(function (n) { if (!W.pm2[n]) throw new CmdErr('[PM2][ERROR] Process or Namespace ' + n + ' not found'); pm2Eval(sh, W.pm2[n]); });
    list(); return 0;
  }
  if (sub === 'stop') { var s = W.pm2[rest[0]]; if (!s) throw new CmdErr('[PM2][ERROR] Process or Namespace ' + rest[0] + ' not found'); s.status = 'stopped'; list(); return 0; }
  if (sub === 'delete') { delete W.pm2[rest[0]]; list(); return 0; }
  if (sub === 'logs') {
    var nm = rest.filter(function (x) { return x.charAt(0) !== '-' && !/^\d+$/.test(x); })[0], li = rest.indexOf('--lines'), nl = li >= 0 ? +rest[li + 1] : 15;
    Object.keys(W.pm2).filter(function (k) { return !nm || k === nm; }).forEach(function (k) {
      var p = W.pm2[k];
      c.out('/home/' + sh.user + '/.pm2/logs/' + k + '-' + (p.status === 'errored' ? 'error' : 'out') + '.log last ' + nl + ' lines:\n');
      p.logs.slice(-nl).forEach(function (l) { c.out(k + '  | ' + l + '\n'); });
    });
    return 0;
  }
  if (sub === 'save') { W.pm2Saved = true; c.out('[PM2] Saving current process list...\n[PM2] Successfully saved in /home/' + sh.user + '/.pm2/dump.pm2\n'); return 0; }
  if (sub === 'startup') { c.out('[PM2] Init System found: systemd\n[PM2] To setup the Startup Script, copy/paste the following command:\nsudo env PATH=$PATH:/usr/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u ' + sh.user + ' --hp /home/' + sh.user + '\n'); return 0; }
  throw new CmdErr('Mô phỏng: pm2 hỗ trợ list, start, restart, stop, delete, logs, save, startup');
};
cmds.npm = function (a, c) {
  var sh = c.sh;
  if (a[0] === '--version' || a[0] === '-v') { c.out('10.8.2\n'); return 0; }
  if (!sh.fs.isF(sh.cwd + '/package.json')) throw new CmdErr('npm error code ENOENT\nnpm error syscall open\nnpm error path ' + sh.cwd + '/package.json\nnpm error errno -2\nnpm error enoent Could not read package.json: Error: ENOENT: no such file or directory');
  if (a[0] === 'install' || a[0] === 'ci' || a[0] === 'i') { c.out('added 612 packages, and audited 613 packages in 14s\n'); return 0; }
  if (a[0] === 'run' && a[1] === 'build') {
    if (/ui|web|next/.test(sh.cwd.split('/').pop())) {
      sh.fs.put(sh.cwd + '/.next/BUILD_ID', 'sim-build\n', { owner: sh.user });
      c.out('> tutor-ui@1.0.0 build\n> next build\n\n   ▲ Next.js 14.2.5\n\n   Creating an optimized production build ...\n ✓ Compiled successfully\n ✓ Generating static pages (12/12)\n');
    } else {
      sh.fs.put(sh.cwd + '/dist/main.js', '// build sim\n', { owner: sh.user });
      c.out('> tutor-api@1.0.0 build\n> nest build\n\n');
    }
    return 0;
  }
  c.out('Mô phỏng: npm install | npm run build\n'); return 0;
};


SP.silent = function (cmd) { var n = this.hist.length, sc = this.cwd; this.run(cmd); this.hist.length = n; };
VPS.probe = function (sh, url, resolveLocal) {
  var m = /^(https?):\/\/([^\/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
  var scheme = m[1], port = m[3] ? +m[3] : (scheme === 'https' ? 443 : 80);
  return fetchOnce(sh, scheme, m[2], port, m[4] || '/', null, !!resolveLocal);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
