(function (G) {
'use strict';
/* Nginx nâng cao (bật bằng W.ngx2): chọn server/location, rewrite, try_files, đường dẫn proxy_pass, log_format, nginx -T */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, pad = V.util.pad, M = function (o) { return parseInt(o, 8); };
var prevNginx = cmds.nginx;

var BUILTIN_FMT = { combined: '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"' };
var VARS = 'remote_addr remote_user time_local time_iso8601 request request_method request_uri uri args status body_bytes_sent bytes_sent http_referer http_user_agent http_x_forwarded_for http_host host hostname scheme server_name server_port request_time request_length upstream_addr upstream_status upstream_response_time upstream_connect_time upstream_header_time connection msec pid proxy_add_x_forwarded_for http_cf_connecting_ip http_cf_ipcountry request_id sent_http_content_type sent_http_location upstream_cache_status ssl_protocol ssl_cipher http2 server_protocol remote_port content_length content_type document_root request_filename request_completion upstream_bytes_received upstream_bytes_sent realip_remote_addr binary_remote_addr invalid_referer nginx_version sent_http_content_length remote_user'.split(' ');
function durSec(v) { var m = /^(-?\d+(?:\.\d+)?)(ms|s|m|h|d|w|M|y)?$/.exec(String(v || '')); if (!m) return 0; var f = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800, M: 2592000, y: 31536000 }; return parseFloat(m[1]) * f[m[2] || 's']; }
function hnum(s) { s = String(s); var h = 2166136261 >>> 0, k; for (k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } return h; }
function parseAll(sh, files, parse) {
  var out = [];
  files.forEach(function (f) { var n = sh.fs.get(f); if (!n || n.t !== 'f') return; var P = parse(f, n.c || ''); if (!P.err) out.push({ file: f, root: P.root }); });
  return out;
}
function walk(node, fn, parent) { (node.children || []).forEach(function (ch) { fn(ch, node); if (ch.children) walk(ch, fn, node); }); }

/* ---------- kiểm tra cấu hình bổ sung (nginx -t) ---------- */
V.ngLoad2 = function (sh, res, files, parse) {
  var fmts = {}, esc = {}, parsed = parseAll(sh, files, parse), E = res.errors;
  res.http.maps = {}; res.http.splits = {}; res.http.geos = {};
  var conf = sh.fs.get('/etc/nginx/nginx.conf');
  if (conf && conf.c) { var pc = parse('/etc/nginx/nginx.conf', conf.c); if (!pc.err) parsed.unshift({ file: '/etc/nginx/nginx.conf', root: pc.root }); }
  parsed.forEach(function (p) { walk(p.root, function (n, par) { if (n.name === 'log_format' && !n.children) { var fa = n.args.slice(1); if (/^escape=/.test(fa[0])) { esc[n.args[0]] = fa[0].slice(7); fa.shift(); } fmts[n.args[0]] = fa.join(''); } }); });
  res.http.logFormats = fmts; res.http.logEsc = esc;
  var HTTPDIR = 'gzip gzip_types gzip_min_length gzip_comp_level gzip_vary expires etag proxy_cache proxy_cache_valid proxy_next_upstream proxy_cache_use_stale proxy_cache_key client_max_body_size large_client_header_buffers proxy_buffer_size proxy_buffering proxy_read_timeout proxy_http_version proxy_request_buffering client_body_timeout client_header_buffer_size'.split(' ');
  res.http.dir = {}; res.http.upstreams = {}; res.http.cachePaths = {};
  function foldHttp(ch) { (ch || []).forEach(function (n) { if (!n.children && HTTPDIR.indexOf(n.name) >= 0) res.http.dir[n.name] = n.args; }); }
  parsed.forEach(function (p) {
    if (p.file === '/etc/nginx/nginx.conf') { (p.root.children || []).forEach(function (n) { if (n.name === 'http' && n.children) foldHttp(n.children); }); } else foldHttp(p.root.children);
    walk(p.root, function (n) {
      if (E.length) return;
      if (n.name === 'map' && n.children) res.http.maps[(n.args[1] || '').replace(/^\$/, '')] = { src: n.args[0], rules: n.children.map(function (ch) { return { k: ch.name, v: ch.args[0] != null ? ch.args[0] : '' }; }) };
      if (n.name === 'split_clients' && n.children) res.http.splits[(n.args[1] || '').replace(/^\$/, '')] = { key: n.args[0], rules: n.children.map(function (ch) { return { k: ch.name, v: ch.args[0] != null ? ch.args[0] : '' }; }) };
      if (n.name === 'geo' && n.children) { var gd = n.args.length > 1 ? n.args[1] : n.args[0]; res.http.geos[(gd || '').replace(/^\$/, '')] = { src: n.args.length > 1 ? n.args[0] : '$remote_addr', rules: n.children.map(function (ch) { return { k: ch.name, v: ch.args[0] != null ? ch.args[0] : '' }; }) }; }
      if (n.name === 'upstream' && n.children) {
        if (res.http.upstreams[n.args[0]]) { E.push('nginx: [emerg] duplicate upstream "' + n.args[0] + '" in ' + p.file + ':' + n.line); return; }
        var U = { servers: [], method: 'rr', hashKey: null };
        n.children.forEach(function (ch) {
          if (ch.name === 'server' && !ch.children) {
            var pr = { addr: ch.args[0], weight: 1, backup: false, down: false, maxFails: 1, failTimeout: 10 };
            if (!/:\d+$/.test(pr.addr) && !/^unix:/.test(pr.addr)) pr.addr += ':80';
            ch.args.slice(1).forEach(function (a) { var m; if (a === 'backup') pr.backup = true; else if (a === 'down') pr.down = true; else if ((m = /^weight=(\d+)$/.exec(a))) pr.weight = +m[1]; else if ((m = /^max_fails=(\d+)$/.exec(a))) pr.maxFails = +m[1]; else if ((m = /^fail_timeout=(.+)$/.exec(a))) pr.failTimeout = durSec(m[1]); });
            U.servers.push(pr);
          } else if (ch.name === 'ip_hash') U.method = 'ip_hash'; else if (ch.name === 'least_conn') U.method = 'least_conn'; else if (ch.name === 'hash') { U.method = 'hash'; U.hashKey = ch.args[0]; }
        });
        if (!U.servers.length) { E.push('nginx: [emerg] no servers are inside upstream in ' + p.file + ':' + n.line); return; }
        res.http.upstreams[n.args[0]] = U;
      }
      if (n.name === 'proxy_cache_path' && !n.children) {
        var kz = n.args.map(function (a) { return /^keys_zone=([^:]+)/.exec(a); }).filter(Boolean)[0];
        if (!kz) { E.push('nginx: [emerg] "keys_zone" parameter is required in ' + p.file + ':' + n.line); return; }
        var cdir = n.args[0].replace(/\/$/, ''), par = cdir.replace(/\/[^\/]*$/, '') || '/';
        if (!sh.fs.isD(cdir)) { if (!sh.fs.isD(par)) { E.push('nginx: [emerg] mkdir() "' + cdir + '" failed (2: No such file or directory)'); return; } sh.fs.mkdirp(cdir, 'www-data', 448); }
        res.http.cachePaths[kz[1]] = { path: cdir };
      }
    });
  });
  var order = [];
  parsed.forEach(function (p) {
    walk(p.root, function (n, par) {
      if (E.length) return;
      if (n.name === 'log_format' && !n.children) {
        var tpl = n.args.slice(1).join(''), vm, re = /\$(\w+)/g;
        while ((vm = re.exec(tpl))) { if (VARS.indexOf(vm[1]) < 0 && !/^(arg_|http_|sent_http_|cookie_|upstream_http_)/.test(vm[1]) && !res.http.maps[vm[1]] && !res.http.splits[vm[1]] && !res.http.geos[vm[1]]) { E.push('nginx: [emerg] unknown "' + vm[1] + '" variable'); return; } }
      }
      if (n.name === 'access_log' && !n.children && n.args[0] !== 'off') {
        var fm = n.args[1]; if (fm && !/^(buffer|gzip|flush|if)=/.test(fm) && !BUILTIN_FMT[fm] && !fmts[fm]) { E.push('nginx: [emerg] unknown log format "' + fm + '" in ' + p.file + ':' + n.line); return; }
      }
      if (n.name === 'proxy_pass' && !n.children) {
        var arg = n.args[0] || '', hasUri = /^https?:\/\/[^\/]+\/.*$/.test(arg) || /^https?:\/\/[^\/]+\/$/.test(arg);
        if (par && hasUri) {
          var isRe = par.name === 'location' && (par.args[0] === '~' || par.args[0] === '~*'), isNamed = par.name === 'location' && /^@/.test(par.args[par.args.length - 1] || ''), isIf = par.name === 'if' || par.name === 'limit_except';
          if (isRe || isNamed || isIf) { E.push('nginx: [emerg] "proxy_pass" cannot have URI part in location given by regular expression, or inside named location, or inside "if" statement, or inside "limit_except" block in ' + p.file + ':' + n.line); return; }
        }
      }
      if (n.name === 'proxy_pass' && !n.children) {
        var hm2 = /^https?:\/\/([^\/:]+)/.exec(n.args[0] || '');
        if (hm2 && hm2[1].indexOf('.') < 0 && hm2[1] !== 'localhost' && hm2[1].indexOf('$') < 0 && !res.http.upstreams[hm2[1]]) { E.push('nginx: [emerg] host not found in upstream "' + hm2[1] + '" in ' + p.file + ':' + n.line); return; }
      }
      if (n.name === 'proxy_cache' && !n.children && n.args[0] !== 'off' && !res.http.cachePaths[n.args[0]]) { E.push('nginx: [emerg] "proxy_cache" zone "' + n.args[0] + '" is unknown in ' + p.file + ':' + n.line); return; }
      if (n.name === 'rewrite' && !n.children) {
        if (n.args.length < 2 || n.args.length > 3) { E.push('nginx: [emerg] invalid number of arguments in "rewrite" directive in ' + p.file + ':' + n.line); return; }
        if (n.args[2] && ['last', 'break', 'redirect', 'permanent'].indexOf(n.args[2]) < 0) { E.push('nginx: [emerg] invalid parameter "' + n.args[2] + '" in ' + p.file + ':' + n.line); return; }
      }
      if (n.name === 'server' && n.children) {
        var seen = {};
        n.children.forEach(function (ch) {
          if (E.length || ch.name !== 'location') return;
          var key = ch.args.join(' ');
          if (seen[key]) { E.push('nginx: [emerg] duplicate location "' + ch.args[ch.args.length - 1] + '" in ' + p.file + ':' + ch.line); return; }
          seen[key] = 1;
        });
      }
    });
  });
};

/* ---------- chọn server_name ---------- */
function nameScore(pat, host) {
  if (pat === host) return 4000;
  if (pat.charAt(0) === '.' && (host === pat.slice(1) || host.slice(-pat.length) === pat)) return 3000 + pat.length;
  if (pat.slice(0, 2) === '*.' && host.slice(-(pat.length - 1)) === pat.slice(1)) return 3000 + pat.length;
  if (pat.slice(-2) === '.*' && host.indexOf(pat.slice(0, -1)) === 0) return 2000 + pat.length;
  if (pat.charAt(0) === '~') { try { if (new RegExp(pat.slice(1)).test(host)) return 1000; } catch (e) { } }
  return 0;
}
function pickServer(cand, host, port) {
  var best = null, bs = 0;
  cand.forEach(function (s) { s.names.forEach(function (n) { var sc = nameScore(n, host); if (sc > bs) { bs = sc; best = s; } }); });
  if (best) return best;
  cand.forEach(function (s) { if (!best && s.listens.some(function (l) { return l.port === port && l.def; })) best = s; });
  return best || cand[0];
}
function pickLoc(locs, p) {
  var i, l, best = null;
  for (i = 0; i < locs.length; i++) if (locs[i].mod === '=' && locs[i].path === p) return locs[i];
  for (i = 0; i < locs.length; i++) { l = locs[i]; if (/^@/.test(l.path)) continue; if ((l.mod === '' || l.mod === '^~') && p.indexOf(l.path) === 0 && (!best || l.path.length > best.path.length)) best = l; }
  if (best && best.mod === '^~') return best;
  for (i = 0; i < locs.length; i++) { l = locs[i]; if (l.mod !== '~' && l.mod !== '~*') continue; try { if (new RegExp(l.path, l.mod === '~*' ? 'i' : '').test(p)) return l; } catch (e) { } }
  return best;
}
function dirs(list, name) { return (list || []).filter(function (x) { return x.name === name; }); }
function firstOf(lists, name) { for (var i = 0; i < lists.length; i++) { var f = dirs(lists[i], name); if (f.length) return f; } return []; }
function expandVars(s, uri, args, host) { return s.replace(/\$uri/g, uri).replace(/\$request_uri/g, uri + (args ? '?' + args : '')).replace(/\$args/g, args || '').replace(/\$host/g, host).replace(/\$scheme/g, 'http'); }

/* rewrite: trả về {uri, redirect?, last?} */
function doRewrites(stmts, uri, args, host, scheme) {
  for (var i = 0; i < stmts.length; i++) {
    var st = stmts[i]; if (st.name !== 'rewrite') continue;
    var rx; try { rx = new RegExp(st.args[0]); } catch (e) { continue; }
    var m = rx.exec(uri); if (!m) continue;
    var repl = st.args[1].replace(/\$(\d)/g, function (z, d) { return m[+d] != null ? m[+d] : ''; }), flag = st.args[2] || '';
    if (/^https?:\/\//.test(repl)) return { redirect: { status: flag === 'permanent' ? 301 : 302, loc: repl } };
    if (flag === 'redirect' || flag === 'permanent') return { redirect: { status: flag === 'permanent' ? 301 : 302, loc: scheme + '://' + host + repl } };
    var q = repl.indexOf('?'), nu = q < 0 ? repl : repl.slice(0, q), na = q < 0 ? args : repl.slice(q + 1);
    uri = nu; args = na;
    if (flag === 'last') return { uri: uri, args: args, last: true };
    if (flag === 'break') return { uri: uri, args: args, brk: true };
  }
  return { uri: uri, args: args };
}

/* ---------- mô hình phản hồi của ứng dụng upstream ---------- */
function appRoutes(port, p) {
  if (port === 3000 || (port === 3100 && V.ngx3on)) return true;
  return /^\/(health|healthz)?$/.test(p) || /^\/api(\/|$)/.test(p) || /^\/(socket\.io|uploads|auth)\//.test(p);
}
function upPort(locNode, fb) { var pp = dirs(locNode ? locNode.stmts : [], 'proxy_pass')[0], m = pp && /^https?:\/\/[^\/:]+:(\d+)/.exec(pp.args[0]); return m ? +m[1] : (fb || 80); }
function fwdPath(locNode, proxyArg, uri) {
  var m = /^https?:\/\/[^\/]+(\/.*)?$/.exec(proxyArg || ''), has = m && m[1] != null;
  if (has && locNode && !/^@/.test(locNode.path) && (locNode.mod === '' || locNode.mod === '^~' || locNode.mod === '=')) return m[1] + uri.slice(locNode.path.length);
  return uri;
}
function reqTime(uri, status, up) {
  var h = hnum(uri) % 40;
  if (/slow|report|export|stats/.test(uri)) return (1.2 + (h % 20) / 10);
  if (status === 502) return 0.001;
  return up ? 0.004 + h / 1000 : 0.000 + (h % 3) / 1000;
}

/* ---------- ghi log truy cập / lỗi ---------- */
function appendFile(sh, path, text, owner, mode) {
  var n = sh.fs.get(path);
  if (n && n.t === 'f') { n.c = (n.c || '') + text; if (n.size != null && typeof n.size === 'number') n.size += text.length; }
  else sh.fs.put(path, text, { owner: owner || 'root', mode: mode || 416 });
}
function nowStr(W, kind) {
  W.ngx2c = (W.ngx2c || 0) + 1; var t = 13 * 3600 + 21 * 60 + W.ngx2c * 2, hh = Math.floor(t / 3600) % 24, mm = Math.floor(t / 60) % 60, ss = t % 60;
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return kind === 'err' ? '2026/10/27 ' + p2(hh) + ':' + p2(mm) + ':' + p2(ss) : '27/Oct/2026:' + p2(hh) + ':' + p2(mm) + ':' + p2(ss) + ' +0700';
}
function logAccess(sh, srv, locNode, ctx) {
  var W = sh.W, live = W.nginx.live, http = live.http || {}, fmts = http.logFormats || {};
  var al = firstOf([locNode ? locNode.stmts : [], srv.stmts], 'access_log');
  var spec = al.length ? al[0].args : [];
  if (spec[0] === 'off') return;
  var path = spec[0] || '/var/log/nginx/access.log', fn = spec[1] && !/^(buffer|gzip|flush|if)=/.test(spec[1]) ? spec[1] : 'combined';
  var tpl = fmts[fn] || BUILTIN_FMT[fn] || BUILTIN_FMT.combined;
  var rt = ctx.rt, esc = (http.logEsc || {})[fn], line = tpl.replace(/\$(\w+)/g, function (m, k) { var v = (function () {
    switch (k) {
      case 'remote_addr': return ctx.client || W.nginx.clientIp || '127.0.0.1'; case 'remote_user': return ctx.user || '-'; case 'time_local': return ctx.tl; case 'time_iso8601': return '2026-10-27T13:21:00+07:00';
      case 'request': return (ctx.method || 'GET') + ' ' + ctx.orig + (ctx.h2 ? ' HTTP/2.0' : ' HTTP/1.1'); case 'request_method': return ctx.method || 'GET'; case 'request_uri': return ctx.orig; case 'uri': return ctx.uri; case 'args': return ctx.args || '';
      case 'status': return String(ctx.status); case 'body_bytes_sent': case 'bytes_sent': return String(ctx.bytes); case 'http_referer': return hv(ctx.RH || {}, 'referer') || '-'; case 'http_user_agent': return hv(ctx.RH || {}, 'user-agent') || 'curl/8.5.0';
      case 'http_x_forwarded_for': return hv(ctx.RH || {}, 'x-forwarded-for') || '-'; case 'http_host': case 'host': return ctx.host; case 'scheme': return ctx.scheme; case 'server_name': return srv.names[0] || '_'; case 'server_port': return String(ctx.port);
      case 'request_time': return rt.toFixed(3); case 'upstream_response_time': case 'upstream_header_time': return ctx.up ? Math.max(0.001, rt - 0.001).toFixed(3) : '-'; case 'upstream_connect_time': return ctx.up ? '0.000' : '-';
      case 'upstream_addr': return ctx.upAddr || (ctx.up ? '127.0.0.1:' + ctx.up : '-'); case 'upstream_status': return ctx.up ? String(ctx.status) : '-'; case 'request_length': return String(85 + (ctx.bodyLen || 0)); case 'hostname': return 'vps'; case 'connection': return String(1000 + W.ngx2c);
      case 'msec': return '1793080860.000'; case 'pid': return '1021'; case 'request_id': return ctx.reqId || ('00000000000000000000000000000000' + hnum(ctx.orig + W.ngx2c).toString(16)).slice(-32);
      default: { var vv = varVal(k, ctx); return vv === '' ? '-' : vv; }
    }
  })(); if (esc === 'json') { v = String(v); if (v === '-') v = ''; return v.replace(/["\\]/g, '\\$&'); } if (W.ngx3 && /["\\]/.test(String(v))) v = String(v).replace(/["\\]/g, function (ch) { return '\\x' + ch.charCodeAt(0).toString(16).toUpperCase(); }); return v; });
  appendFile(sh, path, line + '\n', 'root', 416);
}
V.ngNow = function (W, k) { return nowStr(W, k); }; V.ngAppend = function (sh, p, t, o, m) { return appendFile(sh, p, t, o, m); };
function logError(sh, srv, ctx, level, msg) {
  var W = sh.W, el = firstOf([srv.stmts], 'error_log'), path = el.length ? el[0].args[0] : '/var/log/nginx/error.log';
  if (path === '/dev/null') return;
  appendFile(sh, path, nowStr(W, 'err') + ' [' + level + '] 1021#1021: *' + (1000 + W.ngx2c) + ' ' + msg + ', client: ' + (ctx.client || W.nginx.clientIp || '127.0.0.1') + ', server: ' + (srv.names[0] || '_') + ', request: "' + (ctx.method || 'GET') + ' ' + ctx.orig + ' HTTP/1.1", host: "' + ctx.host + '"\n', 'root', 416);
}

/* ---------- tiện ích thời gian, biến, thời hạn ---------- */
function clock(W) { return (W.ngx2c || 0) * 2 + (W.ngx2extra || 0); }
var CTYPE = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', txt: 'text/plain', xml: 'application/xml', woff2: 'font/woff2', pdf: 'application/pdf', mp4: 'video/mp4', zip: 'application/zip', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', csv: 'text/csv', mp3: 'audio/mpeg', map: 'application/json', webm: 'video/webm', gz: 'application/gzip' };
function ctypeOf(uri) { var m = /\.([a-z0-9]+)$/i.exec(uri); if (!m) return 'text/html'; return CTYPE[m[1].toLowerCase()] || 'application/octet-stream'; }
function hv(RH, name) { return RH[name] != null ? String(RH[name]) : ''; }
function mapVal(H, name, c, depth) {
  var cache = c._mv = c._mv || {}; if (Object.prototype.hasOwnProperty.call(cache, name)) return cache[name];
  if ((depth || 0) > 8) return '';
  var out = '', m = H.maps && H.maps[name], sp = H.splits && H.splits[name], g = H.geos && H.geos[name], i, r;
  if (m) {
    var val = subst(m.src, c), def = null, hit = null;
    for (i = 0; i < m.rules.length && hit == null; i++) {
      r = m.rules[i];
      if (r.k === 'default') { def = r.v; continue; }
      if (/^~/.test(r.k)) { var rx; try { rx = new RegExp(r.k.replace(/^~\*?/, ''), r.k.charAt(1) === '*' ? 'i' : ''); } catch (e) { continue; } if (rx.test(val)) hit = r.v; }
      else if (r.k === val) hit = r.v;
    }
    out = hit != null ? hit : (def != null ? def : '');
  } else if (sp) {
    var key = subst(sp.key, c), hh = hnum(key); hh ^= hh >>> 16; hh = Math.imul(hh, 0x85ebca6b) >>> 0; hh ^= hh >>> 13; hh = Math.imul(hh, 0xc2b2ae35) >>> 0; hh ^= hh >>> 16; var pct = (hh >>> 0) / 4294967296 * 100, cum = 0;
    for (i = 0; i < sp.rules.length; i++) { r = sp.rules[i]; if (r.k === '*') { out = r.v; break; } cum += parseFloat(r.k); if (pct < cum) { out = r.v; break; } }
  } else if (g) {
    var ip = subst(g.src, c), best = -1, def2 = '';
    g.rules.forEach(function (rr) { if (rr.k === 'default') { def2 = rr.v; return; } if (V.ipIn2 && V.ipIn2(ip, rr.k)) { var bits = /\/(\d+)$/.exec(rr.k); var b = bits ? +bits[1] : 32; if (b > best) { best = b; out = rr.v; } } });
    if (best < 0) out = def2;
  }
  if (out.indexOf('$') >= 0) out = subst(out, c);
  cache[name] = out; return out;
}
function varVal(name, c) {
  var m, H = c.http || {};
  if (c.vars && Object.prototype.hasOwnProperty.call(c.vars, name)) return c.vars[name];
  if ((H.maps && H.maps[name]) || (H.splits && H.splits[name]) || (H.geos && H.geos[name])) return mapVal(H, name, c, 1);
  if (name === 'request_method') return c.method || 'GET';
  if (name === 'is_args') return c.args ? '?' : '';
  if (name === 'query_string') return c.args || '';
  if (name === 'request_id' && c.reqId) return c.reqId;
  if (name === 'remote_user') return c.user || '';
  if (name === 'document_root') return c.docroot || '/usr/share/nginx/html';
  if (name === 'request_filename') return (c.docroot || '/usr/share/nginx/html') + c.uri;
  if (name === 'proxy_add_x_forwarded_for') { var xf = hv(c.RH, 'x-forwarded-for'); return xf ? xf + ', ' + c.client : c.client; }
  if (name === 'server_protocol') return c.h2 ? 'HTTP/2.0' : 'HTTP/1.1';
  if (name === 'ssl_protocol') return c.scheme === 'https' ? 'TLSv1.3' : '';
  if (name === 'ssl_cipher') return c.scheme === 'https' ? 'TLS_AES_256_GCM_SHA384' : '';
  if (name === 'http2') return c.h2 ? 'h2' : '';
  if (name === 'nginx_version') return '1.24.0';
  if (name === 'realip_remote_addr') return c.peer || '127.0.0.1';
  if (name === 'invalid_referer') {
    if (!c.vr) return '';
    var ref = hv(c.RH, 'referer'); if (!ref) return c.vr.indexOf('none') >= 0 ? '' : '1';
    var hm = /^https?:\/\/([^\/:]+)/.exec(ref); if (!hm) return c.vr.indexOf('blocked') >= 0 ? '' : '1';
    var rh = hm[1].toLowerCase(), ok = c.vr.some(function (t) {
      if (t === 'server_names') return (c.srvNamesAll || []).some(function (n) { return n.toLowerCase() === rh || (n.charAt(0) === '*' && rh.slice(-(n.length - 1)) === n.slice(1).toLowerCase()); });
      if (t === 'none' || t === 'blocked') return false;
      if (t.indexOf('*') >= 0) { return new RegExp('^' + t.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(rh); }
      return t.toLowerCase() === rh;
    });
    return ok ? '' : '1';
  }
  if (name === 'host' || name === 'http_host') return c.host; if (name === 'scheme') return c.scheme; if (name === 'request_uri') return c.orig; if (name === 'uri') return c.uri; if (name === 'args') return c.args || '';
  if (name === 'remote_addr') return c.client; if (name === 'server_name') return c.srvName; if (name === 'request_method') return 'GET'; if (name === 'hostname') return 'vps';
  if (name === 'upstream_cache_status') return c.cacheStatus || ''; if (name === 'upstream_addr') return c.upAddr || ''; if (name === 'request_time') return (c.rt || 0).toFixed(3);
  if ((m = /^http_(.+)$/.exec(name))) return hv(c.RH, m[1].replace(/_/g, '-')); if ((m = /^arg_(.+)$/.exec(name))) { var mm = new RegExp('(?:^|&)' + m[1] + '=([^&]*)').exec(c.args || ''); return mm ? mm[1] : ''; }
  if ((m = /^cookie_(.+)$/.exec(name))) { var cm = new RegExp('(?:^|;\\s*)' + m[1] + '=([^;]*)').exec(hv(c.RH, 'cookie')); return cm ? cm[1] : ''; }
  return '';
}
function subst(s, c) { return String(s).replace(/\$\{?(\w+)\}?/g, function (z, n) { return varVal(n, c); }); }
function truthy(v) { return v !== '' && v !== '0'; }
function ifCond(args, c) {
  var t = args.join(' ').trim().replace(/^\(/, '').replace(/\)$/, '').trim(), m;
  if ((m = /^(\$\w+)\s+(!?=|!?~\*?)\s+(.+)$/.exec(t))) {
    var val = subst(m[1], c), rhs = m[3].replace(/^["']|["']$/g, ''), op = m[2];
    if (op === '=') return val === rhs; if (op === '!=') return val !== rhs;
    var rx; try { rx = new RegExp(rhs, /\*/.test(op) ? 'i' : ''); } catch (e) { return false; }
    return /^!/.test(op) ? !rx.test(val) : rx.test(val);
  }
  if ((m = /^(!?)-([fde])\s+(.+)$/.exec(t)) && c.sh) { var fp0 = subst(m[3], c), okf = m[2] === 'f' ? c.sh.fs.isF(fp0) : m[2] === 'd' ? c.sh.fs.isD(fp0) : (c.sh.fs.isF(fp0) || c.sh.fs.isD(fp0)); return m[1] ? !okf : okf; }
  if ((m = /^(\$\w+)$/.exec(t))) return truthy(subst(m[1], c));
  return false;
}
function returnResult(args, c) {
  var code = parseInt(args[0], 10);
  if (code === 444) return { kind: 'empty' };
  var loc = null, body = null;
  if (code >= 300 && code < 400 && args[1]) { loc = subst(args[1], c); if (loc.charAt(0) === '/') loc = c.scheme + '://' + c.host + loc; }
  else if (code < 300 && args[1]) body = args[1];
  return { kind: 'resp', status: code, loc: loc, body: body };
}

/* ---------- upstream: chọn máy chủ phía sau ---------- */
function peerPort(addr) { var m = /:(\d+)$/.exec(addr); return m ? +m[1] : 80; }
function upstreamOf(live, arg) {
  var m = /^https?:\/\/([^\/:]+)/.exec(arg || ''); if (!m) return null;
  var ups = (live.http && live.http.upstreams) || {}; return ups[m[1]] ? { name: m[1], def: ups[m[1]] } : null;
}
function pickPeer(sh, up, tried, c) {
  var W = sh.W, st = (W.ngx2up = W.ngx2up || {}), S = (st[up.name] = st[up.name] || { cw: {}, downUntil: {}, fails: {} }), now = clock(W);
  function avail(backup) { return up.def.servers.filter(function (p) { return !p.down && !!p.backup === backup && tried.indexOf(p.addr) < 0 && (S.downUntil[p.addr] || 0) <= now; }); }
  var list = avail(false); if (!list.length) list = avail(true);
  if (!list.length) return null;
  if (up.def.method === 'ip_hash') return list[hnum(c.client.replace(/\.\d+$/, '')) % list.length];
  if (up.def.method === 'hash') return list[hnum(subst(up.def.hashKey || '$request_uri', c)) % list.length];
  var total = 0, best = null;
  list.forEach(function (p) { S.cw[p.addr] = (S.cw[p.addr] || 0) + p.weight; total += p.weight; if (!best || S.cw[p.addr] > S.cw[best.addr]) best = p; });
  S.cw[best.addr] -= total; return best;
}
function peerAlive(sh, p) { var port = peerPort(p.addr); return sh.listeners().some(function (l) { return l.port === port && l.bind !== '127.0.0.53'; }); }
function markFail(sh, up, p) {
  var W = sh.W, S = W.ngx2up[up.name]; S.fails[p.addr] = (S.fails[p.addr] || 0) + 1;
  if (p.maxFails > 0 && S.fails[p.addr] >= p.maxFails) { S.downUntil[p.addr] = clock(W) + p.failTimeout; S.fails[p.addr] = 0; }
}
function withProxyArg(locNode, newArg) {
  return Object.assign({}, locNode, { stmts: locNode.stmts.map(function (x) { return x.name === 'proxy_pass' ? Object.assign({}, x, { args: [newArg] }) : x; }) });
}

/* ---------- nội dung phản hồi của ứng dụng phía sau ---------- */
function appBody(port, fwd, RH) {
  if (port === 3000) return '<!doctype html><title>Tutor</title><div id="__next">Tutor web (Next.js)</div>';
  if (port === 3100) return '<!doctype html><title>Admin</title><h1>Admin panel</h1>';
  if (/^\/api\/me(\?|$)/.test(fwd)) return '{"user":"' + (hv(RH, 'authorization').replace(/^Bearer\s+/i, '') || 'anonymous') + '","instance":' + port + '}';
  var inst = port >= 8881 && port <= 8889 && port !== 8888 ? ',"instance":' + port : '';
  return '{"status":"ok","service":"tutor-api","path":"' + fwd + '"' + inst + '}';
}

/* ---------- xử lý yêu cầu ---------- */
V.pickLocExt = pickLoc; V.hnum = hnum; V.durSec = durSec; V.nxSubst = subst;
V.ngReq2 = function (sh, scheme, host, port, path, old) {
  var W = sh.W;
  V.ngx3on = !!W.ngx3;
  if (!W.nginx.active || !W.nginx.live) return { kind: 'refused' };
  var live = W.nginx.live, cand = live.servers.filter(function (s) { return s.listens.some(function (l) { return l.port === port; }); });
  if (!cand.length) return { kind: 'refused' };
  if (scheme === 'https' && !cand.some(function (s) { return s.listens.some(function (l) { return l.port === port && l.ssl; }); })) return { kind: 'sslerr' };
  var srv = pickServer(cand, host, port);
  var q = path.indexOf('?'), uri = q < 0 ? path : path.slice(0, q), args = q < 0 ? '' : path.slice(q + 1), orig = path;
  var RH = W.ngx2req || {}, http = live.http || { tokens: true, headers: [], dir: {} }, HD = http.dir || {};
  var ctx = { orig: orig, host: host, scheme: scheme, port: port, uri: uri, args: args, tl: nowStr(W, 'acc'), up: 0, status: 0, bytes: 0, rt: 0, RH: RH, sh: sh, http: http, method: (W.ngx2meta && W.ngx2meta.method) || 'GET', bodyLen: (W.ngx2meta && W.ngx2meta.bodyLen) || 0, vars: {}, srvNamesAll: srv.names, client: W.nginx.clientIp || '127.0.0.1', srvName: srv.names[0] || '_', cacheStatus: '', upAddr: '' };
  ctx.h2 = scheme === 'https' && (srv.listens.some(function (l) { return l.port === port && l.h2; }) || srv.stmts.some(function (x) { return x.name === 'http2' && x.args[0] === 'on'; }));
  function eff(lists, name) { var f = firstOf(lists, name); if (f.length) return f[0].args; return HD[name] || null; }
  function fin(r, lst) {
    var tk = firstOf([lst || [], srv.stmts], 'server_tokens'); r.tokens = tk.length ? tk[0].args[0] !== 'off' : http.tokens;
    var ah = firstOf([lst || [], srv.stmts], 'add_header');
    r.adds = ah.length ? ((lst || []).some(function (x) { return x.name === 'add_header'; }) ? lst : srv.stmts).filter(function (x) { return x.name === 'add_header'; }).map(function (x) { return { name: x.args[0], value: x.args[1] || '', always: x.args.indexOf('always') >= 0 }; }) : http.headers;
    return r;
  }
  function decorate(r, locNode) {
    var lst = locNode ? locNode.stmts : [], lists = [lst, srv.stmts], xs = [];
    if (r.kind !== 'resp') return;
    var isStatic = false, content = r.body != null ? String(r.body) : null, ctype = null;
    if (ctx.up) ctype = ctx.up === 3000 || ctx.up === 3100 ? 'text/html' : 'application/json';
    else if (ctx.file && sh.fs.isF(ctx.file)) { isStatic = true; ctype = ctypeOf(ctx.file); }
    else if (r.status === 200 && content != null) {
      var rd = firstOf(lists, 'root');
      if (rd.length) { var fp = rd[0].args[0].replace(/\/$/, '') + (/\/$/.test(ctx.uri) ? ctx.uri + 'index.html' : ctx.uri); if (sh.fs.isF(fp)) { isStatic = true; ctype = ctypeOf(fp); } }
    }
    if (r.ctype) ctype = r.ctype;
    if (r.status === 200 && isStatic && content != null) {
      var etagOn = (eff(lists, 'etag') || ['on'])[0] !== 'off', etag = '"6713c7a0-' + content.length.toString(16) + '"', lm = 'Sat, 24 Oct 2026 08:00:00 GMT';
      if (etagOn) {
        if (hv(RH, 'if-none-match') === etag || (hv(RH, 'if-modified-since') === lm && !hv(RH, 'if-none-match'))) { r.status = 304; r.body = ''; content = ''; ctx.status = 304; }
        xs.push({ name: 'ETag', value: etag }); xs.push({ name: 'Last-Modified', value: lm });
      }
    }
    if (ctype && (r.status === 200 || r.status === 304 || r.ctype)) xs.push({ name: 'Content-Type', value: ctype });
    if (r.status === 200 && content != null && ctype) {
      var gz = eff(lists, 'gzip'), on = gz && gz[0] === 'on', types = ['text/html'].concat(eff(lists, 'gzip_types') || []), minL = parseInt((eff(lists, 'gzip_min_length') || ['20'])[0], 10), vary = (eff(lists, 'gzip_vary') || ['off'])[0] === 'on';
      var typeOk = types.indexOf(ctype) >= 0 || types.indexOf('*') >= 0, len = content.length + 1, wire = len;
      if (on && typeOk && len >= minL && /gzip/.test(hv(RH, 'accept-encoding'))) { wire = Math.ceil(len * 0.28) + 20; xs.push({ name: 'Content-Encoding', value: 'gzip' }); }
      if (on && vary && typeOk) xs.push({ name: 'Vary', value: 'Accept-Encoding' });
      if (ctype === 'text/event-stream') xs.push({ name: 'Transfer-Encoding', value: 'chunked' }); else xs.push({ name: 'Content-Length', value: String(wire) }); ctx.bytes = wire;
    }
    var ex = eff(lists, 'expires');
    if (ex && ex[0] !== 'off' && [200, 201, 204, 206, 301, 302, 303, 304, 307, 308].indexOf(r.status) >= 0) {
      var sec = ex[0] === 'max' ? 315360000 : ex[0] === 'epoch' || ex[0] === '-1' ? -1 : durSec(ex[0]);
      if (sec < 0) { xs.push({ name: 'Expires', value: 'Thu, 01 Jan 1970 00:00:01 GMT' }); xs.push({ name: 'Cache-Control', value: 'no-cache' }); }
      else { xs.push({ name: 'Expires', value: new Date(Date.UTC(2026, 9, 26, 10, 49, 0) + sec * 1000).toUTCString() }); xs.push({ name: 'Cache-Control', value: 'max-age=' + Math.round(sec) }); }
    }
    ctx.upAddr = ctx.upAddr || '';
    r.adds = (r.adds || []).map(function (a) { return { name: a.name, value: subst(a.value, ctx), always: a.always }; }).concat(xs.map(function (x) { return { name: x.name, value: x.value, always: true }; }));
  }
  function ifAdds(r, node) { return V.ngIfAdds ? V.ngIfAdds(r, node, W) : r; }
  function finish(r, locNode, errMsg) {
    if (W.ngx3 && r.kind === 'resp' && r.status >= 400 && !r.errDone && (!r.upstream || r.status >= 502) && V.ngErrPage) V.ngErrPage(E, r, locNode);
    r.h2 = ctx.h2;
    ctx.status = r.status || 0;
    if (r.kind === 'resp') decorate(r, locNode);
    ctx.status = r.status || ctx.status;
    ctx.rt = ctx.rtO != null ? ctx.rtO : (ctx.cacheStatus === 'HIT' ? 0.000 : reqTime(ctx.uri, ctx.status, ctx.up)); if (ctx.errO && !errMsg) errMsg = ctx.errO;
    var body = r.body != null ? r.body : (r.status === 404 ? '<html>\r\n<head><title>404 Not Found</title></head>' : '');
    if (!ctx.bytes || ctx.status === 304) ctx.bytes = ctx.status === 304 ? 0 : (ctx.status >= 300 && ctx.status < 400 ? 169 : (r.status === 502 ? 157 : (r.status === 404 && !r.body ? 146 : String(body).length + 1)));
    r.adds = r.adds || []; W.ngx2last = { size: ctx.bytes, status: ctx.status, rt: ctx.rt, h2: ctx.h2 };
    if (W.ngx3 && W.ngx3lim) { (ctx.errs = ctx.errs || []).push(W.ngx3lim); W.ngx3lim = null; }
    logAccess(sh, srv, locNode, ctx);
    if (W.ngx3 && V.ngDebug) V.ngDebug(E, locNode);
    (ctx.errs || []).forEach(function (e) { logError(sh, srv, ctx, e.level || 'error', e.msg); });
    if (errMsg) logError(sh, srv, ctx, errMsg.level || 'error', errMsg.msg);
    return r;
  }
  var cur = { uri: uri, args: args }, locNode = null, iter = 0, lastLoc = null;
  var E = { sh: sh, W: W, http: http, RH: RH, srv: srv, ctx: ctx, eff: eff, fin: fin, finish: finish, firstOf: firstOf, subst: subst, durSec: durSec, cur: cur, LS: [], lastLoc: null, ppD: null };
  if (W.ngx3) { W.ngx3lim = null; var pa = V.ngPhaseA(E); if (pa) return pa; V.ngSrvPre(E); }
  var sr = doRewrites(srv.stmts, cur.uri, cur.args, host, scheme);
  if (sr.redirect) { if (sr.redirect.loc.charAt(0) === '/') sr.redirect.loc = scheme + '://' + host + sr.redirect.loc; return finish(fin({ kind: 'resp', status: sr.redirect.status, loc: sr.redirect.loc }), null); }
  cur.uri = sr.uri; cur.args = sr.args;
  for (var si = 0; si < srv.stmts.length; si++) { var sst = srv.stmts[si]; if (sst.name === 'if' && sst.children && ifCond(sst.args, ctx)) { var sret = sst.children.filter(function (x) { return x.name === 'return'; })[0]; if (sret) { var sres = returnResult(sret.args, ctx); if (sres.kind !== 'resp') return sres; return finish(ifAdds(fin(sres), sst), null); } } }
  for (;;) {
    if (++iter > 10) { var er = fin({ kind: 'resp', status: 500 }); return finish(er, locNode, { msg: 'rewrite or internal redirection cycle while internally redirecting to "' + cur.uri + '"' }); }
    locNode = pickLoc(srv.locs, cur.uri); lastLoc = locNode;
    var lst = locNode ? locNode.stmts : [];
    var lr = doRewrites(lst, cur.uri, cur.args, host, scheme);
    if (lr.redirect) { if (lr.redirect.loc.charAt(0) === '/') lr.redirect.loc = scheme + '://' + host + lr.redirect.loc; return finish(fin({ kind: 'resp', status: lr.redirect.status, loc: lr.redirect.loc }, lst), locNode); }
    cur.uri = lr.uri; cur.args = lr.args;
    if (lr.last) continue;
    var tf = dirs(lst, 'try_files')[0];
    if (tf && !dirs(lst, 'return').length) {
      var rootD = firstOf([lst, srv.stmts], 'root'), root = rootD.length ? rootD[0].args[0].replace(/\/$/, '') : '/usr/share/nginx/html', idx = firstOf([lst, srv.stmts], 'index'), idxName = idx.length ? idx[0].args[0] : 'index.html', hit = null, targs = tf.args;
      for (var ti = 0; ti < targs.length - 1 && !hit; ti++) {
        var tp = expandVars(targs[ti], cur.uri, cur.args, host), isDir = /\/$/.test(tp), fp = root + (tp.charAt(0) === '/' ? '' : '/') + tp;
        if (isDir) { if (sh.fs.isD(fp.replace(/\/$/, ''))) { var ff = fp + idxName; if (sh.fs.isF(ff)) hit = ff; } }
        else if (sh.fs.isF(fp)) hit = fp;
      }
      if (hit) { ctx.file = hit; return finish(fin({ kind: 'resp', status: 200, body: (sh.fs.get(hit).c || '').replace(/\n$/, '') }, lst), locNode); }
      var fb = targs[targs.length - 1];
      if (/^=\d+$/.test(fb)) return finish(fin({ kind: 'resp', status: +fb.slice(1) }, lst), locNode);
      if (/^@/.test(fb)) { var nl = srv.locs.filter(function (l) { return l.path === fb; })[0]; if (!nl) return finish(fin({ kind: 'resp', status: 500 }, lst), locNode, { msg: 'named location "' + fb + '" not found' }); lastLoc = nl; locNode = nl; break; }
      var fq = expandVars(fb, cur.uri, cur.args, host), qi = fq.indexOf('?'); cur.uri = qi < 0 ? fq : fq.slice(0, qi); cur.args = qi < 0 ? '' : fq.slice(qi + 1);
      continue;
    }
    break;
  }
  ctx.uri = cur.uri; ctx.args = cur.args;
  var LS = lastLoc ? lastLoc.stmts : [];
  E.LS = LS; E.lastLoc = lastLoc; E.cur = cur; if (W.ngx3) V.ngLocPre(E);
  for (var li = 0; li < LS.length; li++) { var lst2 = LS[li]; if (lst2.name === 'if' && lst2.children && ifCond(lst2.args, ctx)) { var lret = lst2.children.filter(function (x) { return x.name === 'return'; })[0]; if (lret) { var lres = returnResult(lret.args, ctx); if (lres.kind !== 'resp') return lres; return finish(ifAdds(fin(lres, LS), lst2), lastLoc); } } }

  function viaOld(shimSrv, uriFinal, argsFinal) {
    if (W.ngx3 && V.ngStrip) shimSrv = V.ngStrip(shimSrv);
    var saved = W.nginx.live;
    W.nginx.live = Object.assign({}, saved, { servers: [shimSrv] });
    try { return old(sh, scheme, shimSrv.names.filter(function (n) { return !/[*~]/.test(n) && n.charAt(0) !== '.'; })[0] || host, port, uriFinal + (argsFinal ? '?' + argsFinal : '')); } finally { W.nginx.live = saved; }
  }
  var ppD = dirs(LS, 'proxy_pass')[0], ppArg = ppD ? ppD.args[0] : '', upg = ppD ? upstreamOf(live, ppArg) : null;
  var nu = eff([LS, srv.stmts], 'proxy_next_upstream'), nextOn = !(nu && nu[0] === 'off');
  ctx.errs = [];
  E.ppD = ppD;
  if (W.ngx3) { var pb = V.ngPhaseB(E); if (pb) return pb; }

  function runApp() {
    var shimLoc = lastLoc, r, rest = ppArg.replace(/^https?:\/\/[^\/]+/, '');
    if (upg) {
      var tried = [], addrs = [], peer;
      for (;;) {
        peer = pickPeer(sh, upg, tried, ctx);
        if (!peer) { r = { kind: 'resp', status: 502 }; if (!addrs.length) ctx.errs.push({ msg: 'no live upstreams while connecting to upstream, upstream: "' + ppArg + cur.uri + '"' }); ctx.upAddr = addrs.join(', '); return { r: r, noPort: true }; }
        tried.push(peer.addr); addrs.push(peer.addr);
        if (peerAlive(sh, peer)) { shimLoc = withProxyArg(lastLoc, 'http://127.0.0.1:' + peerPort(peer.addr) + rest); break; }
        ctx.errs.push({ msg: 'connect() failed (111: Connection refused) while connecting to upstream, upstream: "http://' + peer.addr + cur.uri + '"' });
        markFail(sh, upg, peer);
        if (!nextOn) { ctx.upAddr = addrs.join(', '); return { r: { kind: 'resp', status: 502 }, noPort: true }; }
      }
      ctx.upAddr = addrs.join(', ');
    }
    var shim = Object.assign({}, srv, { locs: lastLoc ? [Object.assign({}, shimLoc, { path: /^@/.test(lastLoc.path) ? '/' : lastLoc.path, mod: /^@/.test(lastLoc.path) ? '' : lastLoc.mod })] : srv.locs });
    r = viaOld(shim, cur.uri, cur.args);
    return { r: r, shimLoc: shimLoc };
  }
  function proxiedFix(r) {
    if (r.kind !== 'resp' || !r.upstream) return r;
    var fwd = fwdPath(lastLoc, ppArg.replace(/^(https?:\/\/)[^\/]+/, '$1x'), cur.uri);
    ctx.up = r.upstream; ctx.fwd = fwd; if (!ctx.upAddr) ctx.upAddr = '127.0.0.1:' + r.upstream;
    if (r.status === 200 && !appRoutes(r.upstream, fwd.replace(/\?.*$/, ''))) { r.status = 404; r.body = '{"message":"Cannot GET ' + fwd + '","error":"Not Found","statusCode":404}'; }
    else if (r.status === 200) r.body = appBody(r.upstream, fwd, RH);
    if (r.status === 200 && r.upstream === 8888 && W.ngx2slow && /report/.test(fwd)) {
      var pt = firstOf([LS, srv.stmts], 'proxy_read_timeout'), tv = pt.length ? pt[0].args[0] : '60s', tn = durSec(tv);
      if (tn < 75) { r.status = 504; r.body = null; ctx.rtO = tn + 0.001; ctx.errO = { msg: 'upstream timed out (110: Connection timed out) while reading response header from upstream, upstream: "http://127.0.0.1:8888' + fwd + '"' }; }
      else ctx.rtO = 75.012;
    }
    if (W.ngx3 && V.ngApp) { E.LS = LS; r = V.ngApp(E, r, fwd); }
    return r;
  }

  /* proxy_cache */
  var czone = ppD ? (eff([LS, srv.stmts], 'proxy_cache') || [null])[0] : null, cached = null, ckey = null, cstore = false;
  if (czone && czone !== 'off' && http.cachePaths && http.cachePaths[czone]) {
    var keyD = eff([LS, srv.stmts], 'proxy_cache_key'); ckey = subst(keyD ? keyD[0] : '$scheme$host$request_uri', ctx);
    var byp = (firstOf([LS, srv.stmts], 'proxy_cache_bypass')[0] || { args: [] }).args.some(function (a) { return truthy(subst(a, ctx)); });
    var noc = (firstOf([LS, srv.stmts], 'proxy_no_cache')[0] || { args: [] }).args.some(function (a) { return truthy(subst(a, ctx)); });
    W.ngx2cache = W.ngx2cache || {}; var ent = W.ngx2cache[czone + '|' + ckey], now = clock(W);
    if (byp) ctx.cacheStatus = 'BYPASS';
    else if (ent && ent.exp > now && (!W.ngx3 || !ent.file || sh.fs.isF(ent.file))) { cached = ent; ctx.cacheStatus = 'HIT'; }
    else ctx.cacheStatus = ent && (!W.ngx3 || !ent.file || sh.fs.isF(ent.file)) ? 'EXPIRED' : 'MISS';
    cstore = !noc;
    if (cached) {
      var hr = fin({ kind: 'resp', status: cached.status, body: cached.body, upstream: cached.upstream }, LS); ctx.up = cached.upstream; ctx.upAddr = '';
      return finish(hr, lastLoc);
    }
  }
  var ar = runApp(), r = ar.r;
  if (!ar.noPort) r = proxiedFix(r); else r = fin(r, LS);
  if (W.ngx3 && r.accel) return V.ngAccel(E, r);
  if (r.kind === 'resp' && czone && czone !== 'off' && ckey) {
    var okCodes = (dirs(LS, 'proxy_cache_valid').length ? dirs(LS, 'proxy_cache_valid') : dirs(srv.stmts, 'proxy_cache_valid'));
    if (r.status >= 500 && W.ngx2cache) {
      var us = eff([LS, srv.stmts], 'proxy_cache_use_stale'), old2 = W.ngx2cache[czone + '|' + ckey];
      if (old2 && us && (us.indexOf('error') >= 0 || us.indexOf('http_' + r.status) >= 0 || us.indexOf('timeout') >= 0)) { ctx.cacheStatus = 'STALE'; r = fin({ kind: 'resp', status: old2.status, body: old2.body, upstream: old2.upstream }, LS); ctx.up = old2.upstream; ctx.errs = ctx.errs || []; }
    } else if (cstore && r.status < 500) {
      var ttl = 0; okCodes.forEach(function (d) { var ca = d.args.slice(0, -1), tv2 = d.args[d.args.length - 1]; if (!ttl && (ca.length === 0 || ca.indexOf(String(r.status)) >= 0 || ca.indexOf('any') >= 0)) ttl = durSec(tv2); });
      if (ttl > 0) {
        W.ngx2cache[czone + '|' + ckey] = { status: r.status, body: r.body, upstream: r.upstream, exp: clock(W) + ttl };
        var h32 = ('00000000' + hnum(ckey).toString(16)).slice(-8); h32 = h32 + h32 + h32 + h32;
        var cpath = http.cachePaths[czone].path.replace(/\/$/, '') + '/' + h32.charAt(31) + '/' + h32.slice(29, 31) + '/' + h32;
        sh.fs.mkdirp(cpath.replace(/\/[^\/]*$/, ''), 'www-data', M('700')); sh.fs.put(cpath, 'KEY: ' + ckey + '\n\n' + (r.body || '') + '\n', { owner: 'www-data', mode: M('600') }); W.ngx2cache[czone + '|' + ckey].file = cpath;
      }
    }
  }
  var em = null;
  if (r.status === 502 && !ar.noPort && !ctx.errO) em = { msg: 'connect() failed (111: Connection refused) while connecting to upstream, upstream: "http://127.0.0.1:' + upPort(lastLoc, r.upstream) + cur.uri + '"' };
  else if (r.status === 404 && !r.upstream) { var rd = firstOf([LS, srv.stmts], 'root'); if (rd.length) em = { msg: 'open() "' + rd[0].args[0].replace(/\/$/, '') + cur.uri + '" failed (2: No such file or directory)' }; }
  var epd = firstOf([LS, srv.stmts], 'error_page');
  if (epd.length && r.status >= 400 && !W.ngx3) {
    var ep = epd.filter(function (e) { return e.args.slice(0, -1).indexOf(String(r.status)) >= 0; })[0];
    if (ep) { var tgt = ep.args[ep.args.length - 1]; if (/^\//.test(tgt) && !/^=/.test(ep.args[ep.args.length - 2] || '')) { var rd2 = firstOf([LS, srv.stmts], 'root'), pf = rd2.length ? rd2[0].args[0].replace(/\/$/, '') + tgt : null; if (pf && sh.fs.isF(pf)) { r.body = (sh.fs.get(pf).c || '').replace(/\n$/, ''); } } }
  }
  if (r.loc && r.loc.charAt(0) === '/') r.loc = scheme + '://' + host + r.loc;
  return finish(r, lastLoc, em);
};

/* ---------- curl: header yêu cầu và thêm biến -w; sleep: kéo đồng hồ ảo ---------- */
var prevCurl = cmds.curl, prevSleep = cmds.sleep;
cmds.curl = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.ngx2) return prevCurl(a, c);
  var H = {}, i;
  for (i = 0; i < a.length; i++) {
    if (a[i] === '-H' || a[i] === '--header') { var hv0 = a[i + 1] || '', k = hv0.indexOf(':'); if (k > 0) H[hv0.slice(0, k).toLowerCase()] = hv0.slice(k + 1).trim(); }
    if (a[i] === '--compressed' && !H['accept-encoding']) H['accept-encoding'] = 'gzip, deflate';
  }
  W.ngx2req = H; W.ngx2last = null;
  var buf = '', c2 = Object.create(c); c2.out = function (t) { buf += t; };
  var rc;
  try { rc = prevCurl(a, c2); } finally { W.ngx2req = null; }
  var L = W.ngx2last || { size: 0, status: 0, rt: 0 };
  buf = buf.replace(/%\{size_download\}/g, String(L.size)).replace(/%\{time_total\}/g, L.rt.toFixed(6)).replace(/%\{time_starttransfer\}/g, Math.max(0, L.rt - 0.0005).toFixed(6)).replace(/%\{num_redirects\}/g, '0').replace(/%\{http_version\}/g, L.h2 ? '2' : '1.1');
  c.out(buf); return rc;
};
cmds.sleep = function (a, c) { var W = c.sh.W; if (W.ngx2) W.ngx2extra = (W.ngx2extra || 0) + (parseFloat(a[0]) || 0); return prevSleep(a, c); };

/* ---------- nginx -T ---------- */
cmds.nginx = function (a, c) {
  var sh = c.sh;
  if (a.indexOf('-T') < 0) return prevNginx(a, c);
  if (!sh.isRoot(c)) { c.err('nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)\nnginx: [emerg] open() "/etc/nginx/nginx.conf" failed (13: Permission denied)\nnginx: configuration file /etc/nginx/nginx.conf test failed\n'); return 1; }
  var rc = prevNginx(['-t'], c);
  if (rc !== 0) return rc;
  var out = '# configuration file /etc/nginx/nginx.conf:\n' + (sh.fs.get('/etc/nginx/nginx.conf').c || '');
  var files = [];
  sh.fs.list('/etc/nginx/conf.d').forEach(function (n) { if (/\.conf$/.test(n)) files.push('/etc/nginx/conf.d/' + n); });
  sh.fs.list('/etc/nginx/sites-enabled').forEach(function (n) { files.push('/etc/nginx/sites-enabled/' + n); });
  files.forEach(function (f) { var n = sh.fs.get(f); if (n && n.t === 'f') out += '\n# configuration file ' + f + ':\n' + n.c; });
  c.out(out); return 0;
};

/* ---------- logrotate ---------- */
function logrotateConf(sh) {
  var n = sh.fs.get('/etc/logrotate.d/nginx'); return n && n.t === 'f' ? n.c : '';
}
cmds.logrotate = function (a, c) {
  var sh = c.sh, dbg = a.indexOf('-d') >= 0, force = a.indexOf('-f') >= 0, files = a.filter(function (x) { return x.charAt(0) !== '-'; });
  if (!sh.isRoot(c)) { c.err('error: error opening state file /var/lib/logrotate/status: Permission denied\n'); return 1; }
  var cf = files[0] || '/etc/logrotate.d/nginx', n = sh.fs.get(cf);
  if (!n || n.t !== 'f') { c.err('error: Can\'t open ' + cf + ': No such file or directory\n'); return 1; }
  var m = /^\s*(\S+\*?\.log)\s*\{([\s\S]*?)\}/m.exec(n.c);
  if (!m) { c.err('error: ' + cf + ':1 unexpected text\n'); return 1; }
  var body = m[2], rot = +((/rotate\s+(\d+)/.exec(body) || [])[1] || 4), freq = (/\b(daily|weekly|monthly)\b/.exec(body) || [])[1] || 'weekly', comp = /\bcompress\b/.test(body);
  var out = 'reading config file ' + cf + '\n\nHandling 1 logs\n\nrotating pattern: ' + m[1] + '  ' + (force ? 'forced from command line' : freq) + ' (' + rot + ' rotations)\nempty log files are ' + (/notifempty/.test(body) ? 'not ' : '') + 'rotated, old logs are removed\n';
  var dir = m[1].replace(/\/[^\/]*$/, ''), names = sh.fs.list(dir).filter(function (x) { return /\.log$/.test(x); });
  var W = sh.W; W.logrot = W.logrot || { count: 0 };
  if (dbg) {
    names.forEach(function (x) { out += 'considering log ' + dir + '/' + x + '\n  log needs rotating\nrotating log ' + dir + '/' + x + ', log->rotateCount is ' + rot + '\n'; });
    out += (/postrotate/.test(body) ? 'running postrotate script\n' : '') + '(debug: không có gì bị thay đổi)\n'; c.out(out); return 0;
  }
  if (!force) { c.out(out + 'log does not need rotating (log has been rotated at today, trying again at next day)\n'); return 0; }
  names.forEach(function (x) {
    var p = dir + '/' + x, node = sh.fs.get(p); if (!node || node.t !== 'f') return;
    var k = rot, i;
    sh.fs.rm(p + '.' + k + (comp ? '.gz' : ''));
    for (i = k - 1; i >= 1; i--) { var o = p + '.' + i + (comp && i >= 2 ? '.gz' : ''), nn = p + '.' + (i + 1) + (comp ? '.gz' : ''); var on = sh.fs.get(o); if (on && on.t === 'f') { sh.fs.put(nn, on.c, { owner: on.owner || 'root', mode: on.mode }); sh.fs.rm(o); } }
    sh.fs.put(p + '.1', node.c, { owner: 'root', mode: node.mode || 416 });
    sh.fs.put(p, '', { owner: 'root', mode: node.mode || 416 });
  });
  W.logrot.count++;
  c.out(out + 'renaming ' + dir + '/access.log to ' + dir + '/access.log.1\n' + (/postrotate/.test(body) ? 'running postrotate script\n' : '')); return 0;
};

/* ---------- goaccess (bản tóm tắt dạng văn bản) ---------- */
cmds.goaccess = function (a, c) {
  var sh = c.sh, files = a.filter(function (x) { return x.charAt(0) !== '-'; }), file = files[0];
  if (!file) { c.err('GoAccess - Missing log file. Use: goaccess FILE --log-format=COMBINED\n'); return 1; }
  var txt = sh.readFile(sh.abs(file), c, 'cat'); if (txt == null) return 1;
  var lines = txt.split('\n').filter(Boolean), st = {}, hits = {}, ips = {}, tot = 0;
  lines.forEach(function (l) { var m = /"[A-Z]+ (\S+) [^"]*" (\d{3}) (\d+)/.exec(l), ip = l.split(' ')[0]; if (!m) return; tot += +m[3]; st[m[2]] = (st[m[2]] || 0) + 1; hits[m[1]] = (hits[m[1]] || 0) + 1; ips[ip] = (ips[ip] || 0) + 1; });
  function top(o, n) { return Object.keys(o).sort(function (x, y) { return o[y] - o[x]; }).slice(0, n); }
  var out = 'GoAccess (tóm tắt, --no-curses)\nTổng yêu cầu: ' + lines.length + '   Băng thông: ' + (tot / 1024).toFixed(1) + ' KiB\n\nMã trạng thái\n';
  top(st, 8).forEach(function (k) { out += '  ' + pad(k, 5) + pad(String(st[k]), 7) + (100 * st[k] / lines.length).toFixed(1) + '%\n'; });
  out += '\nURL nhiều nhất\n'; top(hits, 6).forEach(function (k) { out += '  ' + pad(String(hits[k]), 6) + k + '\n'; });
  out += '\nIP nhiều nhất\n'; top(ips, 5).forEach(function (k) { out += '  ' + pad(String(ips[k]), 6) + k + '\n'; });
  c.out(out); return 0;
};

/* ---------- tạo access.log mẫu để thực hành phân tích ---------- */
V.ngSeedLog = function (sh, o) {
  o = o || {}; var n = o.n || 600, lines = [], seed = o.seed || 7, st = seed;
  function rnd() { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; }
  var ips = ['203.0.113.7', '198.51.100.23', '192.0.2.44', '45.155.205.12', '185.220.101.4', '92.118.39.62', '203.0.113.99', '198.51.100.8'];
  var paths = [['/api/users', 40, 200], ['/api/courses', 30, 200], ['/api/reports/monthly', 8, 200], ['/api/login', 12, 401], ['/health', 20, 200], ['/', 25, 200], ['/static/app.js', 18, 200], ['/favicon.ico', 6, 404], ['/wp-login.php', 5, 404], ['/.env', 4, 404], ['/api/export', 3, 502]];
  var total = 0; paths.forEach(function (p) { total += p[1]; });
  var uas = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)', 'curl/8.5.0', 'python-requests/2.31.0', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Go-http-client/1.1'];
  for (var i = 0; i < n; i++) {
    var r = rnd() * total, pi = 0, acc = 0; for (; pi < paths.length; pi++) { acc += paths[pi][1]; if (r < acc) break; } var p = paths[Math.min(pi, paths.length - 1)];
    var ip = rnd() < 0.18 ? ips[3 + Math.floor(rnd() * 3)] : ips[Math.floor(rnd() * 8)];
    var status = p[2]; if (p[2] === 200 && rnd() < 0.03) status = 500; if (o.slow504 && p[0] === '/api/reports/monthly') status = 504; if (p[0] === '/api/users' && rnd() < 0.05) status = 404;
    var rt = o.slow504 && p[0] === '/api/reports/monthly' ? 60.001 : /report|export/.test(p[0]) ? 1.4 + rnd() * 2.5 : 0.004 + rnd() * 0.09, bytes = status === 200 ? Math.floor(300 + rnd() * 9000) : Math.floor(120 + rnd() * 400);
    var mm = 5 + Math.floor(i / 12), ss = Math.floor(rnd() * 60), ua = uas[Math.floor(rnd() * uas.length)];
    if (/wp-login|\.env/.test(p[0])) { ua = 'python-requests/2.31.0'; }
    lines.push(ip + ' - - [27/Oct/2026:' + (mm >= 60 ? '13' : '12') + ':' + (mm % 60 < 10 ? '0' : '') + (mm % 60) + ':' + (ss < 10 ? '0' : '') + ss + ' +0700] "' + (p[0] === '/api/login' ? 'POST' : 'GET') + ' ' + p[0] + ' HTTP/1.1" ' + status + ' ' + bytes + ' "-" "' + ua + '" rt=' + rt.toFixed(3));
  }
  sh.fs.put(o.path || '/var/log/nginx/access.log', lines.join('\n') + '\n', { owner: 'root', mode: 416 });
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
