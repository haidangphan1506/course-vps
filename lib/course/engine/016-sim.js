(function (G) {
'use strict';
/* Nginx vận hành và giám sát: ulimit, pgrep, /proc/PID/limits, log debug. Chỉ chạy khi W.ngx3 bật. */
var V = G.VPS, cmds = V.cmds, M = function (o) { return parseInt(o, 8); };
var MASTER = 1021, WORKERS = [1022, 1023];

function limitsTxt(soft, hard) {
  function row(n, s, h, u) { return (n + '                         ').slice(0, 26) + (String(s) + '                    ').slice(0, 21) + (String(h) + '                    ').slice(0, 21) + u; }
  return ['Limit                     Soft Limit           Hard Limit           Units', row('Max cpu time', 'unlimited', 'unlimited', 'seconds'), row('Max file size', 'unlimited', 'unlimited', 'bytes'), row('Max processes', 15284, 15284, 'processes'), row('Max open files', soft, hard, 'files'), row('Max locked memory', 8388608, 8388608, 'bytes')].join('\n') + '\n';
}
V.ngProcSync = function (sh) {
  var f = sh.fs, conf = f.get('/etc/nginx/nginx.conf'), c = conf && conf.c ? conf.c : '';
  var m = /^\s*worker_rlimit_nofile\s+(\d+)\s*;/m.exec(c), wl = m ? +m[1] : 0;
  var mc = /worker_connections\s+(\d+)\s*;/.exec(c); sh.W.ngx3main = { conns: mc ? +mc[1] : 512, rlimit: wl, dbg: /^[^#\n]*debug_connection\s+\S+;/m.test(c) };
  f.put('/run/nginx.pid', MASTER + '\n', { owner: 'root', mode: M('644') });
  f.mkdirp('/proc/' + MASTER, 'root', M('555'));
  f.put('/proc/' + MASTER + '/limits', limitsTxt(1024, 524288), { owner: 'root', mode: M('444') });
  WORKERS.forEach(function (p) {
    f.mkdirp('/proc/' + p, 'www-data', M('555'));
    f.put('/proc/' + p + '/limits', wl ? limitsTxt(wl, wl) : limitsTxt(1024, 524288), { owner: 'www-data', mode: M('444') });
  });
};

cmds.ulimit = function (a, c) {
  var fl = a.join(' '), hard = /-\w*H/.test(fl);
  if (/-\w*n/.test(fl) || a.length === 0) { c.out((hard ? 524288 : 1024) + '\n'); return 0; }
  if (/-\w*a/.test(fl)) { c.out('open files                      (-n) ' + (hard ? 524288 : 1024) + '\nmax user processes              (-u) 15284\n'); return 0; }
  c.out('unlimited\n'); return 0;
};

var PROCS = [{ pid: MASTER, ppid: 1, name: 'nginx', cmd: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;' }, { pid: 1022, ppid: MASTER, name: 'nginx', cmd: 'nginx: worker process' }, { pid: 1023, ppid: MASTER, name: 'nginx', cmd: 'nginx: worker process' }];
cmds.pgrep = function (a, c) {
  var sh = c.sh, W = sh.W; if (!W.ngx3) { c.err('bash: pgrep: command not found\n'); return 127; }
  var list = false, count = false, full = false, parent = null, pat = null, i;
  for (i = 0; i < a.length; i++) { var x = a[i]; if (x === '-P') parent = +a[++i]; else if (/^-[a-z]+$/.test(x)) { if (/l|a/.test(x)) list = true; if (/c/.test(x)) count = true; if (/f/.test(x)) full = true; } else pat = x.replace(/^["']|["']$/g, ''); }
  var ok = W.nginx && W.nginx.active, res = !ok ? [] : PROCS.filter(function (p) { if (parent != null && p.ppid !== parent) return false; if (pat == null) return true; return full ? p.cmd.indexOf(pat) >= 0 : p.name.indexOf(pat) >= 0; });
  if (count) { c.out(res.length + '\n'); return res.length ? 0 : 1; }
  res.forEach(function (p) { c.out(p.pid + (list ? ' ' + (full ? p.cmd : p.name) : '') + '\n'); });
  return res.length ? 0 : 1;
};

function two(n) { return (n < 10 ? '0' : '') + n; }
V.ngDebug = function (E) {
  var sh = E.sh, ctx = E.ctx, W = E.W, conf = sh.fs.get('/etc/nginx/nginx.conf'), c = conf && conf.c ? conf.c : '';
  var em = /^\s*error_log\s+(\S+?)(?:\s+(\w+))?\s*;/m.exec(c), path = em ? em[1] : '/var/log/nginx/error.log', lvl = em && em[2] ? em[2] : 'error';
  var client = ctx.client || W.nginx.clientIp || '127.0.0.1', on = lvl === 'debug', re = /^[^#\n]*debug_connection\s+(\S+)\s*;/mg, mm;
  while (!on && (mm = re.exec(c))) if (V.ipIn2(client, mm[1])) on = true;
  if (!on) return;
  var t = 13 * 3600 + 21 * 60 + (W.ngx2c || 0) * 2, ts = '2026/10/27 ' + two(Math.floor(t / 3600) % 24) + ':' + two(Math.floor(t / 60) % 60) + ':' + two(t % 60), cn = 1000 + (W.ngx2c || 0), pre = ts + ' [debug] 1022#1022: *' + cn + ' ';
  var L = ['http process request line', 'http request line: "' + (ctx.method || 'GET') + ' ' + ctx.orig + ' HTTP/1.1"', 'http uri: "' + ctx.uri + '"', 'http args: "' + (ctx.args || '') + '"', 'http header: "Host: ' + ctx.host + '"', 'http header: "User-Agent: ' + ((ctx.RH && ctx.RH['user-agent']) || 'curl/8.5.0') + '"', 'http header: "Accept: */*"', 'http header done', 'test location: "' + (E.lastLoc && E.lastLoc.path ? E.lastLoc.path : '/') + '"', 'using configuration "' + (E.lastLoc && E.lastLoc.path ? E.lastLoc.path : '/') + '"'];
  if (ctx.up) L.push('http upstream request: "' + ctx.orig + '"', 'http proxy status ' + ctx.status);
  L.push('http finalize request: ' + ctx.status + ', "' + ctx.orig + '" a:1, c:1');
  V.ngAppend(sh, path, L.map(function (l) { return pre + l; }).join('\n') + '\n', 'root', 416);
};
/* find: -type f / -name / -delete chính xác hơn (chỉ khi ngx3 bật) */
var prevFind = cmds.find;
cmds.find = function (a, c) {
  var sh = c.sh;
  if (!sh.W.ngx3 || (a.indexOf('-type') < 0 && a.indexOf('-delete') < 0) || a.indexOf('-perm') >= 0 || a.indexOf('-user') >= 0) return prevFind(a, c);
  var starts = [], i = 0, type = null, name = null, del = false;
  while (i < a.length && a[i].charAt(0) !== '-') starts.push(a[i++]);
  if (!starts.length) starts = ['.'];
  for (; i < a.length; i++) { if (a[i] === '-type') type = a[++i]; else if (a[i] === '-name') { var g = a[++i]; name = new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); } else if (a[i] === '-delete') del = true; }
  var out = [], code = 0;
  starts.forEach(function (st) {
    var base = sh.abs(st), pre = base === '/' ? '/' : base + '/';
    if (!sh.fs.get(base)) { c.err('find: ‘' + st + '’: No such file or directory\n'); code = 1; return; }
    Object.keys(sh.fs.n).sort().forEach(function (p) {
      if (p !== base && p.indexOf(pre) !== 0) return;
      var n = sh.fs.n[p]; if (!n) return;
      if (type === 'f' && n.t !== 'f') return; if (type === 'd' && n.t !== 'd') return;
      if (name && !name.test(p.replace(/^.*\//, ''))) return;
      var shown = st.charAt(0) === '/' ? p : (st === '.' ? '.' + p.slice(base.length) : st + p.slice(base.length));
      if (del) { if (!sh.isRoot(c) && n.owner !== sh.user) { c.err('find: cannot delete ‘' + shown + '’: Permission denied\n'); code = 1; return; } if (n.t === 'f') sh.fs.rm(p); }
      else out.push(shown);
    });
  });
  if (out.length) c.out(out.join('\n') + '\n');
  return code;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
