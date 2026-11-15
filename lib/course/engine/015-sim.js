(function (G) {
'use strict';
/* Nginx nâng cao (phần 2): header/body, tệp tĩnh, kiểm soát truy cập, WebSocket, htpasswd, wscat, jq... Chỉ chạy khi W.ngx3 bật. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, M = function (o) { return parseInt(o, 8); };
function hnum(s) { s = String(s); var h = 2166136261 >>> 0, k; for (k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } return h; }
function hv(RH, n) { return RH && RH[n] != null ? String(RH[n]) : ''; }
function size(v, def) { var m = /^(\d+)([kKmMgG]?)$/.exec(String(v || '')); if (!m) return def; return +m[1] * ({ '': 1, k: 1024, m: 1048576, g: 1073741824 }[m[2].toLowerCase()]); }
function ip2n(ip) { var p = String(ip).split('.'); if (p.length !== 4) return null; return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + (+p[3]); }
function ipIn(ip, spec) {
  if (spec === 'all') return true; if (spec === ip) return true;
  var m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(spec), a = ip2n(ip); if (!m || a == null) return false;
  var b = ip2n(m[1]), bits = +m[2]; if (bits === 0) return true; var mask = (0xFFFFFFFF << (32 - bits)) >>> 0; return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}
V.ipIn2 = ipIn;
function b64e(s) { return typeof btoa === 'function' ? btoa(s) : Buffer.from(s).toString('base64'); }
function b64d(s) { try { return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString(); } catch (e) { return ''; } }
V.htHash = function (user, pass, salt) { salt = salt || ('s' + (hnum(user) % 99999).toString(36)); return '$apr1$' + salt + '$' + (hnum(salt + ':' + pass) >>> 0).toString(36) + (hnum(pass + salt) >>> 0).toString(36); };
function htOk(entry, pass) { var m = /^\$apr1\$([^$]+)\$(.+)$/.exec(entry || ''); return !!m && V.htHash('', pass, m[1]) === entry; }
function dirs(l, n) { return (l || []).filter(function (x) { return x.name === n; }); }

/* địa chỉ client thật (real_ip) */
V.ngClientIp = function (e) {
  var W = e.W, base = W.nginx.clientIp || '127.0.0.1', h = e.http, st = e.srv.stmts;
  e.ctx.peer = base;
  var rf = dirs(st, 'set_real_ip_from').map(function (x) { return x.args[0]; }); if (!rf.length) rf = h.realFrom || [];
  var rhD = dirs(st, 'real_ip_header')[0], rh = rhD ? rhD.args[0] : h.realHeader;
  var rec = dirs(st, 'real_ip_recursive')[0]; var recursive = rec && rec.args[0] === 'on';
  if (rh && rf.some(function (f) { return ipIn(base, f); })) {
    var v = hv(e.RH, String(rh).toLowerCase());
    if (v) {
      var parts = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean), pick = parts[parts.length - 1];
      if (recursive) { for (var i = parts.length - 1; i >= 0; i--) { pick = parts[i]; if (!rf.some(function (f) { return ipIn(parts[i], f); })) break; } }
      if (pick && ip2n(pick) != null) return pick;
    }
  }
  return base;
};

/* giai đoạn A: kích thước dòng yêu cầu và header, ID yêu cầu */
V.ngPhaseA = function (e) {
  var ctx = e.ctx, W = e.W;
  ctx.client = V.ngClientIp(e);
  ctx.reqId = ('00000000000000000000000000000000' + (hnum(ctx.orig + W.ngx2c + 'a') >>> 0).toString(16) + (hnum('b' + ctx.orig + W.ngx2c) >>> 0).toString(16) + (hnum('c' + ctx.orig) >>> 0).toString(16) + (hnum('d' + W.ngx2c) >>> 0).toString(16)).slice(-32);
  var lb = e.eff([e.srv.stmts], 'large_client_header_buffers'), lim = lb && lb[1] ? size(lb[1], 8192) : 8192;
  if ((ctx.method + ' ' + ctx.orig + ' HTTP/1.1').length > lim) return e.finish(e.fin({ kind: 'resp', status: 414, title: '414 Request-URI Too Large' }), null);
  var hk = Object.keys(e.RH);
  for (var i = 0; i < hk.length; i++) if ((hk[i] + ': ' + String(e.RH[hk[i]])).length + 2 > lim) return e.finish(e.fin({ kind: 'resp', status: 400, title: '400 Request Header Or Cookie Too Large' }), null);
  return null;
};
function setVars(e, stmts) { stmts.forEach(function (s) { if (s.name === 'set' && s.args[0] && s.args[0].charAt(0) === '$') e.ctx.vars[s.args[0].slice(1)] = e.subst(s.args[1] || '', e.ctx); }); }
V.ngSrvPre = function (e) {
  var rd = dirs(e.srv.stmts, 'root')[0]; e.ctx.docroot = rd ? rd.args[0].replace(/\/$/, '') : '/usr/share/nginx/html';
  setVars(e, e.srv.stmts);
};
V.ngLocPre = function (e) {
  var rd = e.firstOf([e.LS, e.srv.stmts], 'root')[0]; if (rd) e.ctx.docroot = rd.args[0].replace(/\/$/, '');
  setVars(e, e.LS);
  var vr = e.firstOf([e.LS, e.srv.stmts], 'valid_referers')[0]; e.ctx.vr = vr ? vr.args : null;
};
V.ngIfAdds = function (r, node, W) {
  if (!W.ngx3 || !node || !node.children) return r;
  var ah = node.children.filter(function (x) { return x.name === 'add_header'; });
  if (ah.length) r.adds = ah.map(function (x) { return { name: x.args[0], value: x.args[1] || '', always: x.args.indexOf('always') >= 0 }; });
  return r;
};
var DROP = { allow: 1, deny: 1, satisfy: 1, auth_basic: 1, auth_basic_user_file: 1 };
V.ngStrip = function (shim) {
  function f(l) { return (l || []).filter(function (x) { return !DROP[x.name]; }); }
  return Object.assign({}, shim, { stmts: f(shim.stmts), locs: (shim.locs || []).map(function (l) { return Object.assign({}, l, { stmts: f(l.stmts) }); }) });
};

/* tệp tĩnh theo root / alias */
V.ngStatic = function (e, loc, uri) {
  var lst = loc ? loc.stmts : [], al = e.firstOf([lst], 'alias')[0], rd = e.firstOf([lst, e.srv.stmts], 'root')[0];
  if (al) return { base: al.args[0] + uri.slice((loc.path || '').length) };
  if (rd) return { base: rd.args[0].replace(/\/$/, '') + uri };
  return null;
};
function absLoc(ctx, path) { var std = (ctx.scheme === 'https' && ctx.port === 443) || (ctx.scheme === 'http' && ctx.port === 80); return ctx.scheme + '://' + ctx.host + (std ? '' : ':' + ctx.port) + path; }
function listing(sh, dir, uri) {
  var d = dir.replace(/\/$/, ''), names = sh.fs.list(d).sort(), dd = names.filter(function (n) { return sh.fs.isD(d + '/' + n); }), ff = names.filter(function (n) { return !sh.fs.isD(d + '/' + n); });
  var out = '<html>\r\n<head><title>Index of ' + uri + '</title></head>\r\n<body>\r\n<h1>Index of ' + uri + '</h1><hr><pre><a href="../">../</a>\r\n';
  dd.forEach(function (n) { out += '<a href="' + n + '/">' + n + '/</a>' + new Array(Math.max(1, 51 - n.length)).join(' ') + '24-Oct-2026 08:00                   -\r\n'; });
  ff.forEach(function (n) { var sz = String(sh.fs.size(d + '/' + n)); out += '<a href="' + n + '">' + n + '</a>' + new Array(Math.max(1, 52 - n.length)).join(' ') + '24-Oct-2026 08:00 ' + new Array(Math.max(1, 19 - sz.length)).join(' ') + sz + '\r\n'; });
  return out + '</pre><hr></body>\r\n</html>';
}
V.ngServe = function (e, st, R) {
  var sh = e.sh, ctx = e.ctx, lists = [e.LS, e.srv.stmts], base = st.base, uri = e.cur.uri, names = e.eff(lists, 'index') || ['index.html'];
  if (sh.fs.isF(base)) { ctx.file = base; return R(200, { body: (sh.fs.get(base).c || '').replace(/\n$/, '') }); }
  if (sh.fs.isD(base.replace(/\/$/, '')) && base !== '') {
    if (!/\/$/.test(uri)) return R(301, { loc: absLoc(ctx, uri + '/' + (e.cur.args ? '?' + e.cur.args : '')) });
    for (var i = 0; i < names.length; i++) { var f = base + names[i]; if (sh.fs.isF(f)) { ctx.file = f; return R(200, { body: (sh.fs.get(f).c || '').replace(/\n$/, '') }); } }
    var ai = e.eff(lists, 'autoindex');
    if (ai && ai[0] === 'on') return R(200, { body: listing(sh, base, uri), ctype: 'text/html' });
    return R(403, null, { msg: 'directory index of "' + base + '" is forbidden' });
  }
  return R(404, null, { msg: 'open() "' + base + '" failed (2: No such file or directory)' });
};

/* allow/deny + auth_basic */
V.ngAccess = function (e) {
  var sh = e.sh, ctx = e.ctx, lists = [e.LS, e.srv.stmts], eff = e.eff;
  function R(status, extra, err) { var r = e.fin(Object.assign({ kind: 'resp', status: status }, extra || {}), e.LS); return e.finish(r, e.lastLoc, err); }
  var rules = null; lists.forEach(function (l) { if (rules) return; var f = (l || []).filter(function (x) { return x.name === 'allow' || x.name === 'deny'; }); if (f.length) rules = f; });
  var sat = (eff(lists, 'satisfy') || ['all'])[0], ab = eff(lists, 'auth_basic'), hasAuth = !!(ab && ab[0] !== 'off');
  if (!rules && !hasAuth) return null;
  var accessOk = true;
  if (rules) for (var i = 0; i < rules.length; i++) if (ipIn(ctx.client, rules[i].args[0])) { accessOk = rules[i].name === 'allow'; break; }
  var auth = { ok: true };
  if (hasAuth) {
    var file = (eff(lists, 'auth_basic_user_file') || [])[0], fnode = file && sh.fs.get(file);
    if (!file || !fnode || fnode.t !== 'f') auth = { ok: false, status: 500, err: { msg: 'open() "' + (file || '') + '" failed (2: No such file or directory)' } };
    else if (!(fnode.mode & 4) && fnode.owner !== 'www-data') auth = { ok: false, status: 500, err: { msg: 'open() "' + file + '" failed (13: Permission denied)' } };
    else {
      var au = hv(ctx.RH, 'authorization');
      if (!/^Basic /i.test(au)) auth = { ok: false, status: 401, err: null };
      else {
        var dec = b64d(au.slice(6)), ci = dec.indexOf(':'), u = dec.slice(0, ci), p = dec.slice(ci + 1), line = (fnode.c || '').split('\n').filter(function (l) { return l.indexOf(u + ':') === 0; })[0];
        if (!line) auth = { ok: false, status: 401, err: { msg: 'user "' + u + '" was not found in "' + file + '"' } };
        else if (!htOk(line.slice(u.length + 1), p)) auth = { ok: false, status: 401, err: { msg: 'user "' + u + '": password mismatch' } };
        else ctx.user = u;
      }
    }
  }
  var pass = (sat === 'any' && rules && hasAuth) ? (accessOk || auth.ok) : (accessOk && auth.ok);
  if (pass) return null;
  if (!accessOk && (sat !== 'any' || !hasAuth)) return R(403, null, { msg: 'access forbidden by rule' });
  if (auth.status === 500) return R(500, null, auth.err);
  var rr = e.fin({ kind: 'resp', status: 401, title: '401 Authorization Required' }, e.LS);
  rr.adds = (rr.adds || []).concat([{ name: 'WWW-Authenticate', value: 'Basic realm="' + (ab ? ab[0] : 'Restricted') + '"', always: true }]);
  return e.finish(rr, e.lastLoc, auth.err);
};

/* giai đoạn B: sau khi chọn location, trước khi proxy */
V.ngPhaseB = function (e) {
  var sh = e.sh, ctx = e.ctx, LS = e.LS, srv = e.srv, lists = [LS, srv.stmts], eff = e.eff;
  function R(status, extra, err) { var r = e.fin(Object.assign({ kind: 'resp', status: status }, extra || {}), LS); return e.finish(r, e.lastLoc, err); }
  if (LS.some(function (x) { return x.name === 'internal'; }) && !ctx.internal) return R(404);
  var cm = eff(lists, 'client_max_body_size'), lim = cm ? size(cm[0], 1048576) : 1048576;
  if (ctx.bodyLen && lim > 0 && ctx.bodyLen > lim) return R(413, { title: '413 Request Entity Too Large' }, { msg: 'client intended to send too large body: ' + ctx.bodyLen + ' bytes' });
  if (LS.some(function (x) { return x.name === 'return'; })) return null;
  var acc = V.ngAccess(e); if (acc) return acc;
  if (LS.some(function (x) { return x.name === 'stub_status'; })) {
    var n = e.W.ngx2c || 0;
    return R(200, { body: 'Active connections: ' + (2 + n % 3) + ' \nserver accepts handled requests\n ' + (1200 + n) + ' ' + (1200 + n) + ' ' + (3100 + n * 2) + ' \nReading: 0 Writing: 1 Waiting: ' + (1 + n % 2) + ' ', ctype: 'text/plain' });
  }
  if (!e.ppD && !LS.some(function (x) { return x.name === 'try_files'; })) {
    var st = V.ngStatic(e, e.lastLoc, e.cur.uri);
    if (st) return V.ngServe(e, st, R);
  }
  return null;
};

/* X-Accel-Redirect: chuyển nội bộ sang location internal */
V.ngAccel = function (e, r) {
  var ctx = e.ctx, loc = V.pickLocExt(e.srv.locs, r.accel);
  ctx.internal = true; ctx.up = 0; ctx.upAddr = ctx.upAddr || '127.0.0.1:' + r.upstream;
  e.LS = loc ? loc.stmts : []; e.lastLoc = loc; e.cur = { uri: r.accel, args: '' };
  function R(status, extra, err) { var rr = e.fin(Object.assign({ kind: 'resp', status: status }, extra || {}), e.LS); return e.finish(rr, loc, err); }
  var st = V.ngStatic(e, loc, r.accel);
  if (!st) return R(404, null, { msg: 'open() "' + r.accel + '" failed (2: No such file or directory)' });
  return V.ngServe(e, st, R);
};

/* tuyến của ứng dụng phía sau (mô phỏng) */
V.ngApp = function (e, r, fwd) {
  var ctx = e.ctx, LS = e.LS, srv = e.srv, RH = e.RH, lists = [LS, srv.stmts], eff = e.eff, path = fwd.replace(/\?.*$/, ''), port = r.upstream;
  function psh() { var l = null; lists.forEach(function (x) { if (!l && (x || []).some(function (s) { return s.name === 'proxy_set_header'; })) l = x; }); var m = {}; (l || []).forEach(function (s) { if (s.name === 'proxy_set_header') m[String(s.args[0]).toLowerCase()] = s.args[1] != null ? s.args[1] : ''; }); return m; }
  function sv(x) { return e.subst(x, ctx); }
  function add(n, v) { r.adds = (r.adds || []).concat([{ name: n, value: v, always: true }]); }
  if (port === 3000 || port === 3100) return r;
  if (hv(RH, 'upgrade').toLowerCase() === 'websocket' && /^\/socket\.io\//.test(path)) {
    var ph = psh(), ver = eff(lists, 'proxy_http_version'), up = ph.upgrade, cn = ph.connection;
    var ok = ver && ver[0] === '1.1' && up != null && up !== '' && cn != null && cn !== '' && (/^upgrade$/i.test(cn) || cn.charAt(0) === '$');
    if (ok && cn.charAt(0) === '$') ok = !/^close$/i.test(sv(cn));
    if (!ok) { r.status = 400; r.body = '{"code":3,"message":"Bad request"}'; return r; }
    var rt = eff(lists, 'proxy_read_timeout'); r.status = 101; r.body = ''; r.wsTimeout = rt ? e.durSec(rt[0]) : 60; add('Upgrade', 'websocket'); add('Connection', 'upgrade'); return r;
  }
  if (r.status !== 200) return r;
  var p = psh();
  if (path === '/api/whoami') {
    var host = p.host != null ? sv(p.host) : '127.0.0.1:' + port;
    r.body = JSON.stringify({ host: host, xForwardedFor: p['x-forwarded-for'] != null ? sv(p['x-forwarded-for']) : '', xForwardedProto: p['x-forwarded-proto'] != null ? sv(p['x-forwarded-proto']) : '', xRealIp: p['x-real-ip'] != null ? sv(p['x-real-ip']) : '', xRequestId: p['x-request-id'] != null ? sv(p['x-request-id']) : '', remoteAddr: '127.0.0.1' }); return r;
  }
  if (path === '/auth/callback') {
    var h2 = p.host != null ? sv(p.host) : '127.0.0.1:' + port, pr2 = p['x-forwarded-proto'] != null ? sv(p['x-forwarded-proto']) : 'http', lo = pr2 + '://' + h2 + '/dashboard';
    var pr = e.firstOf([LS, srv.stmts], 'proxy_redirect');
    if (pr.length && pr[0].args[0] === 'off') { /* giữ nguyên */ }
    else if (pr.length && pr[0].args[0] !== 'default' && pr[0].args.length >= 2) { pr.forEach(function (d) { var from = sv(d.args[0]); if (lo.indexOf(from) === 0) { lo = sv(d.args[1]) + lo.slice(from.length); } }); }
    else if (lo.indexOf('http://127.0.0.1:' + port + '/') === 0) lo = lo.slice(('http://127.0.0.1:' + port).length);
    r.status = 302; r.loc = lo; r.body = null; return r;
  }
  if (path === '/auth/login') {
    var pb = eff(lists, 'proxy_buffer_size'), pbs = pb ? size(pb[0], 4096) : 4096;
    if (pbs < 5120) { r.status = 502; r.body = null; ctx.errO = { msg: 'upstream sent too big header while reading response header from upstream, upstream: "http://127.0.0.1:' + port + '/auth/login"' }; return r; }
    add('Set-Cookie', 'session=' + new Array(451).join('abcdefghij') + '; HttpOnly'); r.body = '{"token":"ok"}'; return r;
  }
  if (path === '/api/upload') {
    if (ctx.method !== 'POST' && ctx.method !== 'PUT') { r.status = 404; r.body = '{"message":"Cannot ' + ctx.method + ' /api/upload","error":"Not Found","statusCode":404}'; return r; }
    r.body = '{"uploaded":' + ctx.bodyLen + ',"ok":true}'; ctx.rtO = 0.05 + ctx.bodyLen / 100000000; return r;
  }
  if (path === '/api/events') { r.ctype = 'text/event-stream'; r.body = 'data: {"n":1}\n\ndata: {"n":2}\n\ndata: {"n":3}\n'; return r; }
  if (path === '/api/download') { r.accel = '/protected/report.pdf'; r.body = ''; return r; }
  return r;
};

/* error_page: kể cả =200, @named, trang tĩnh */
V.ngErrPage = function (e, r, locNode) {
  var sh = e.sh, lst = locNode ? locNode.stmts : [], srv = e.srv, eps = e.firstOf([lst, srv.stmts], 'error_page');
  if (!eps.length) return;
  var ep = eps.filter(function (x) { return x.args.slice(0, -1).filter(function (y) { return !/^=/.test(y); }).indexOf(String(r.status)) >= 0; })[0];
  if (!ep) return;
  var ov = ep.args.filter(function (y) { return /^=\d+$/.test(y); })[0], tgt = ep.args[ep.args.length - 1];
  r.errDone = true;
  if (/^https?:\/\//.test(tgt)) { r.status = ov ? +ov.slice(1) : 302; r.loc = tgt; r.body = null; r.title = null; return; }
  var nl = V.pickLocExt(srv.locs, tgt);
  if (/^@/.test(tgt)) { nl = srv.locs.filter(function (l) { return l.path === tgt; })[0]; var rt = nl && nl.stmts.filter(function (x) { return x.name === 'return'; })[0]; if (rt) { var code = parseInt(rt.args[0], 10); r.status = ov ? +ov.slice(1) : code; r.body = code < 300 && rt.args[1] ? e.subst(rt.args[1], e.ctx) : null; r.title = null; if (code >= 300 && code < 400 && rt.args[1]) r.loc = e.subst(rt.args[1], e.ctx); } return; }
  var st = V.ngStatic(e, nl, tgt), f = st && st.base;
  if (f && sh.fs.isF(f)) { r.body = (sh.fs.get(f).c || '').replace(/\n$/, ''); r.title = null; r.ctype = 'text/html'; if (ov) r.status = +ov.slice(1); }
  else if (ov) r.status = +ov.slice(1);
};

/* include: mở rộng trong cây cấu hình */
V.ngExpand = function (sh, root, parse, file, depth) {
  var err = null;
  function walk(node) {
    if (err || !node.children) return;
    var out = [];
    node.children.forEach(function (ch) {
      if (err) return;
      if (ch.name === 'include' && !ch.children && ch.args[0]) {
        var pat = ch.args[0], full = pat.charAt(0) === '/' ? pat : '/etc/nginx/' + pat, files = [];
        if (full.indexOf('*') >= 0) {
          var dir = full.replace(/\/[^\/]*$/, ''), base = full.slice(dir.length + 1), rx = new RegExp('^' + base.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
          sh.fs.list(dir).sort().forEach(function (n) { if (rx.test(n) && sh.fs.isF(dir + '/' + n)) files.push(dir + '/' + n); });
        } else {
          if (!sh.fs.isF(full)) { err = 'nginx: [emerg] open() "' + full + '" failed (2: No such file or directory) in ' + file + ':' + ch.line; return; }
          files.push(full);
        }
        if (depth > 6) { err = 'nginx: [emerg] include nesting too deep in ' + file + ':' + ch.line; return; }
        files.forEach(function (f) {
          if (err) return;
          var P = parse(f, sh.fs.get(f).c || ''); if (P.err) { err = P.err; return; }
          var x = V.ngExpand(sh, P.root, parse, f, depth + 1); if (x) { err = x; return; }
          P.root.children.forEach(function (c2) { out.push(c2); });
        });
      } else { walk(ch); out.push(ch); }
    });
    node.children = out;
  }
  walk(root);
  return err;
};

/* ---------- lệnh ---------- */
cmds.htpasswd = function (a, c) {
  var sh = c.sh, flags = a.filter(function (x) { return x.charAt(0) === '-'; }).join(''), pos = a.filter(function (x) { return x.charAt(0) !== '-'; });
  var batch = /b/.test(flags), create = /c/.test(flags), toOut = /n/.test(flags), del = /D/.test(flags);
  var file = toOut ? null : pos.shift(), user = pos[0], pass = pos[1];
  if (!user && !toOut) { c.err('Usage:\n\thtpasswd [-cimBdpsDv] [-C cost] passwordfile username\n\thtpasswd -b[cmBdpsDv] [-C cost] passwordfile username password\n\n\thtpasswd -n[imBdps] [-C cost] username\n\thtpasswd -nb[mBdps] [-C cost] username password\n'); return 2; }
  if (!batch && !del) { c.err('htpasswd: bản mô phỏng chỉ hỗ trợ chế độ -b (đưa mật khẩu ngay trên dòng lệnh), ví dụ: htpasswd -bc FILE USER MẬT_KHẨU\n'); return 1; }
  var p = file ? sh.abs(file) : null, n = p ? sh.fs.get(p) : null;
  if (del) {
    if (!n || n.t !== 'f') { c.err('htpasswd: cannot open file ' + file + ' for read: No such file or directory\n'); return 1; }
    var keep = (n.c || '').split('\n').filter(function (l) { return l && l.indexOf(user + ':') !== 0; });
    try { sh.writeFile(p, keep.length ? keep.join('\n') + '\n' : '', c, 'htpasswd'); } catch (e) { c.err('htpasswd: cannot open file ' + file + ' for write: Permission denied\n'); return 1; }
    c.out('Deleting password for user ' + user + '\n'); return 0;
  }
  if (pass == null) { c.err('Usage: htpasswd -b [-cimBdpsDv] passwordfile username password\n'); return 2; }
  var line = user + ':' + V.htHash(user, pass);
  if (toOut) { c.out(line + '\n'); return 0; }
  if (!create && (!n || n.t !== 'f')) { c.err('htpasswd: cannot modify file ' + file + '; use \'-c\' to create it\n'); return 1; }
  var lines = (!create && n ? (n.c || '') : '').split('\n').filter(Boolean), exist = false;
  lines = lines.map(function (l) { if (l.indexOf(user + ':') === 0) { exist = true; return line; } return l; });
  if (!exist) lines.push(line);
  try { sh.writeFile(p, lines.join('\n') + '\n', c, 'htpasswd'); } catch (e) { c.err('htpasswd: cannot open file ' + file + ' for write: Permission denied\n'); return 1; }
  c.out((exist ? 'Updating password for user ' : 'Adding password for user ') + user + '\n'); return 0;
};
cmds.wscat = function (a, c) {
  var sh = c.sh, W = sh.W, url = null, idle = 0, i, extra = {};
  for (i = 0; i < a.length; i++) { if (a[i] === '-c' || a[i] === '--connect') url = a[++i]; else if (a[i] === '--idle') idle = +a[++i] || 0; else if (a[i] === '-H' || a[i] === '--header') { var h = a[++i] || '', k = h.indexOf(':'); if (k > 0) extra[h.slice(0, k).toLowerCase()] = h.slice(k + 1).trim(); } }
  if (!url) { c.err('wscat: dùng wscat -c ws://host/đường-dẫn [--idle GIÂY]\n(--idle là tuỳ chọn của bản mô phỏng: giữ kết nối rảnh N giây rồi báo kết quả)\n'); return 1; }
  var m = /^(wss?):\/\/([^\/:]+)(?::(\d+))?(\/.*)?$/.exec(url); if (!m) { c.err('error: Invalid URL: ' + url + '\n'); return 1; }
  var scheme = m[1] === 'wss' ? 'https' : 'http', port = m[3] ? +m[3] : (scheme === 'https' ? 443 : 80), host = m[2], path = m[4] || '/';
  var saved = W.ngx2req, saveM = W.ngx2meta; W.ngx2req = Object.assign({ upgrade: 'websocket', connection: 'Upgrade', origin: 'http://' + host }, extra); W.ngx2meta = null;
  var r; try { r = V.ngReq(sh, scheme, host, port, path); } finally { W.ngx2req = saved; W.ngx2meta = saveM; }
  if (r.kind === 'refused' || r.kind === 'empty') { c.err('error: connect ECONNREFUSED ' + host + ':' + port + '\n'); return 1; }
  if (r.kind === 'sslerr') { c.err('error: write EPROTO\n'); return 1; }
  if (r.status !== 101) { c.err('error: Unexpected server response: ' + r.status + '\n'); return 1; }
  c.out('Connected (press CTRL+C to quit)\n');
  if (idle > 0) {
    W.ngx2extra = (W.ngx2extra || 0) + idle;
    if (r.wsTimeout && idle >= r.wsTimeout) { c.out('Disconnected (code: 1006, reason: "")\n'); W.ngx2wsDrop = (W.ngx2wsDrop || 0) + 1; return 1; }
    c.out('(kết nối vẫn mở sau ' + idle + ' giây rảnh)\n');
  }
  return 0;
};
/* jq tối giản */
function jqPath(v, expr) {
  var toks = [], re = /\.([A-Za-z_][\w-]*)|\["([^"]+)"\]|\[(\d*)\]/g, m;
  while ((m = re.exec(expr))) toks.push(m[1] != null ? { k: m[1] } : m[2] != null ? { k: m[2] } : { i: m[3] === '' ? null : +m[3] });
  var cur = [v];
  toks.forEach(function (t) { var nx = []; cur.forEach(function (x) { if (t.k != null) nx.push(x == null ? null : (x[t.k] === undefined ? null : x[t.k])); else if (Array.isArray(x)) { if (t.i == null) x.forEach(function (y) { nx.push(y); }); else nx.push(x[t.i] === undefined ? null : x[t.i]); } }); cur = nx; });
  return cur;
}
cmds.jq = function (a, c) {
  var raw = false, compact = false, slurp = false, expr = null, file = null, i;
  for (i = 0; i < a.length; i++) { var x = a[i]; if (x.charAt(0) === '-' && x.length > 1 && expr == null) { if (/r/.test(x)) raw = true; if (/c/.test(x)) compact = true; if (/s/.test(x)) slurp = true; } else if (expr == null) expr = x; else file = x; }
  if (expr == null) expr = '.';
  var text = c.stdin; if (file) { try { text = c.sh.readFile(c.sh.abs(file), c, 'jq'); } catch (e) { c.err('jq: error: Could not open ' + file + ': No such file or directory\n'); return 2; } }
  var stages = expr.split('|').map(function (s) { return s.trim(); });
  function cmpOk(l, op, rv) { if (op === '==') return JSON.stringify(l) === JSON.stringify(rv); if (op === '!=') return JSON.stringify(l) !== JSON.stringify(rv); var ln = parseFloat(l), rn = parseFloat(rv); if (isNaN(ln) || isNaN(rn)) return false; return op === '>' ? ln > rn : op === '<' ? ln < rn : op === '>=' ? ln >= rn : ln <= rn; }
  function run(data) {
    var cur = [data];
    stages.forEach(function (st) {
      var nx = [], m;
      if (st === 'length') cur.forEach(function (x) { nx.push(Array.isArray(x) ? x.length : (x && typeof x === 'object' ? Object.keys(x).length : (typeof x === 'string' ? x.length : 0))); });
      else if (st === 'keys') cur.forEach(function (x) { nx.push(Object.keys(x || {}).sort()); });
      else if ((m = /^select\((.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)\)$/.exec(st))) { cur.forEach(function (x) { var l = jqPath(x, m[1])[0], rv = m[3].trim(); try { rv = JSON.parse(rv); } catch (e) { } if (cmpOk(l, m[2], rv)) nx.push(x); }); }
      else cur.forEach(function (x) { jqPath(x, st).forEach(function (y) { nx.push(y); }); });
      cur = nx;
    });
    cur.forEach(function (x) { c.out((raw && typeof x === 'string' ? x : (compact ? JSON.stringify(x) : JSON.stringify(x, null, 2))) + '\n'); });
  }
  var whole; try { whole = JSON.parse(text); } catch (e) { whole = undefined; }
  if (whole !== undefined) { run(slurp ? [whole] : whole); return 0; }
  var lines = String(text || '').split('\n'), docs = [], k;
  for (k = 0; k < lines.length; k++) {
    if (!lines[k].trim()) continue;
    var d; try { d = JSON.parse(lines[k]); } catch (e2) { if (slurp) { c.err('jq: error (at <stdin>:' + (k + 1) + '): Cannot parse input\n'); return 2; } var col = 1; try { JSON.parse(lines[k].replace(/\\"/g, '')); } catch (e3) { var pm = /position (\d+)/.exec(e3.message); col = pm ? +pm[1] + 1 : 1; } c.err('jq: error (at <stdin>:' + (k + 1) + '): Invalid literal at line ' + (k + 1) + ', column ' + col + '\n'); return 2; }
    if (slurp) docs.push(d); else run(d);
  }
  if (slurp) run(docs);
  return 0;
};
/* nginx -V, -s reopen */
var prevNginx = cmds.nginx;
cmds.nginx = function (a, c) {
  if (a.indexOf('-V') >= 0) {
    c.err('nginx version: nginx/1.24.0 (Ubuntu)\nbuilt with OpenSSL 3.0.13 30 Jan 2024\nTLS SNI support enabled\nconfigure arguments: --with-cc-opt=\'-g -O2 -fstack-protector-strong -Wformat -Werror=format-security\' --prefix=/usr/share/nginx --conf-path=/etc/nginx/nginx.conf --http-log-path=/var/log/nginx/access.log --error-log-path=/var/log/nginx/error.log --lock-path=/var/lock/nginx.lock --pid-path=/run/nginx.pid --modules-path=/usr/lib/nginx/modules --with-compat --with-debug --with-pcre-jit --with-http_ssl_module --with-http_stub_status_module --with-http_realip_module --with-http_auth_request_module --with-http_v2_module --with-http_dav_module --with-http_slice_module --with-threads --with-http_addition_module --with-http_gunzip_module --with-http_gzip_static_module --with-http_sub_module\n'); return 0;
  }
  if (a[0] === '-s' && a[1] === 'reopen') {
    if (!c.sh.isRoot(c)) { c.err('nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)\n2026/10/27 13:21:00 [error] open() "/run/nginx.pid" failed (13: Permission denied)\n'); return 1; }
    return 0;
  }
  return prevNginx(a, c);
};
/* seq -s SEP */
var prevSeq = cmds.seq;
cmds.seq = function (a, c) {
  var si = a.indexOf('-s'), k = -1, sep, rest = a.slice();
  if (si >= 0) { sep = a[si + 1] == null ? '' : a[si + 1]; rest.splice(si, 2); }
  else { a.forEach(function (x, i) { if (k < 0 && /^-s./.test(x)) k = i; }); if (k < 0) return prevSeq(a, c); sep = a[k].slice(2); rest.splice(k, 1); }
  var buf = '', c2 = Object.create(c); c2.out = function (t) { buf += t; };
  var rc = prevSeq(rest, c2); c.out(buf.split('\n').filter(function (x) { return x !== ''; }).join(sep) + '\n'); return rc;
};
/* curl: -X, -d, -F, -T, -u, -A, -e, -b, -H @file, --interface */
var prevCurl = cmds.curl;
var VAL1 = { '-X': 1, '--request': 1, '-d': 1, '--data': 1, '--data-raw': 1, '--data-binary': 1, '--data-urlencode': 1, '-F': 1, '--form': 1, '-T': 1, '--upload-file': 1, '-u': 1, '--user': 1, '-A': 1, '--user-agent': 1, '-e': 1, '--referer': 1, '-b': 1, '--cookie': 1, '--limit-rate': 1, '--max-time': 1, '--retry': 1, '--interface': 1, '--max-filesize': 1 };
cmds.curl = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.ngx3) return prevCurl(a, c);
  var out = [], meta = { method: null, bodyLen: 0 }, i, hasData = false, ip = null;
  function fileLen(spec) { var p = spec.replace(/^@/, ''); if (spec.charAt(0) !== '@') return spec.length; var ap = sh.abs(p); return sh.fs.get(ap) ? sh.fs.size(ap) : 0; }
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-H' || x === '--header') {
      var hv0 = a[++i] || '';
      if (hv0.charAt(0) === '@') { var hf = sh.fs.get(sh.abs(hv0.slice(1))); (hf && hf.c ? hf.c.split('\n') : []).forEach(function (ln) { if (ln.indexOf(':') > 0) out.push('-H', ln); }); }
      else out.push('-H', hv0);
    } else if (VAL1[x]) {
      var v = a[++i] || '';
      if (x === '-X' || x === '--request') meta.method = v;
      else if (x === '-d' || x === '--data' || x === '--data-raw' || x === '--data-binary' || x === '--data-urlencode') { hasData = true; meta.bodyLen += fileLen(v); }
      else if (x === '-F' || x === '--form') { hasData = true; var fm = v.split('=').slice(1).join('='); meta.bodyLen += fm.charAt(0) === '@' ? fileLen(fm.split(';')[0]) : fm.length; meta.bodyLen += 200; }
      else if (x === '-T' || x === '--upload-file') { meta.method = meta.method || 'PUT'; meta.bodyLen += fileLen('@' + v); }
      else if (x === '-u' || x === '--user') out.push('-H', 'Authorization: Basic ' + b64e(v));
      else if (x === '-A' || x === '--user-agent') out.push('-H', 'User-Agent: ' + v);
      else if (x === '-e' || x === '--referer') out.push('-H', 'Referer: ' + v);
      else if (x === '-b' || x === '--cookie') out.push('-H', 'Cookie: ' + v);
      else if (x === '--interface') ip = v;
    } else out.push(x);
  }
  if (hasData && !meta.method) meta.method = 'POST';
  if (out.indexOf('-I') >= 0 || out.some(function (z) { return /^-[a-zA-Z]*I[a-zA-Z]*$/.test(z); }) || out.indexOf('--head') >= 0) meta.method = 'HEAD';
  W.ngx2meta = meta; var savedIp = W.nginx.clientIp; if (ip) W.nginx.clientIp = ip;
  try { return prevCurl(out, c); } finally { W.ngx2meta = null; if (ip) W.nginx.clientIp = savedIp; }
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
