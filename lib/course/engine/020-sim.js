(function (G) {
'use strict';
/* Tiến trình, tín hiệu, systemd (unit, timer, journal), cron, giờ giả lập. Bật bằng W.lin (dựng bởi VPS.lin.base). */
var V = G.VPS, SP = V.Shell.prototype, cmds = V.cmds, B = V.builtins, CmdErr = V.CmdErr;
var LIN = V.lin = {};
var P0 = {}, GATED = ['kill', 'pkill', 'killall', 'reboot', 'shutdown', 'renice', 'nice', 'top', 'htop', 'pgrep', 'lsof', 'fuser', 'tmux', 'whoami'];
GATED.forEach(function (n) { P0[n] = cmds[n]; });
var PJOBS = B.jobs;
var TZ = 7 * 3600000, DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function p2(n) { return (n < 10 ? '0' : '') + n; }
function pad(s, n, right) { s = String(s); while (s.length < n) s = right ? ' ' + s : s + ' '; return s; }
function loc(ms) { return new Date(ms + TZ); }
function hhmm(ms) { var d = loc(ms); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); }
function hhmmss(ms) { var d = loc(ms); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); }
function sysTs(ms) { var d = loc(ms); return MON[d.getUTCMonth()] + ' ' + (d.getUTCDate() < 10 ? ' ' : '') + d.getUTCDate() + ' ' + hhmmss(ms); }
function fullTs(ms) { var d = loc(ms); return DAYS[d.getUTCDay()] + ' ' + d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + hhmmss(ms) + ' +07'; }
function ago(ms, now) {
  var s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'min ' + (s % 60 ? (s % 60) + 's ' : '') + 'ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'min ago'; return Math.floor(s / 86400) + ' days ago';
}
function L(sh) { return sh.W.lin; }
function on(sh) { return !!(sh && sh.W && sh.W.lin); }
function root(sh, c) { return sh.isRoot(c); }
SP.isRoot = function (c) { return !!(c && c.sudo) || this.user === 'root' || !!this.forceRoot; };
function nextPid(sh) { var l = L(sh); l.nextPid += 1 + (l.nextPid % 3); return l.nextPid; }
function log(sh, unit, msg, pid, pri) { var l = L(sh); l.jr.push({ t: l.now, unit: unit || 'systemd', id: unit ? unit.replace(/\.service$/, '') : 'systemd', pid: pid || (unit ? 1 : 1), msg: msg, pri: pri || 6 }); }
function syslog(sh, line) {
  var l = L(sh), p = '/var/log/syslog', n = sh.fs.get(p);
  sh.fs.put(p, (n ? n.c : '') + sysTs(l.now) + ' vps ' + line + '\n', { owner: 'root', mode: 416 });
}

['bash', 'sh'].forEach(function (n) {
  var prev = cmds[n];
  cmds[n] = function (a, c) {
    var sh = c.sh; if (!c.sudo || sh.forceRoot) return prev(a, c);
    sh.forceRoot = true; try { return prev(a, c); } finally { sh.forceRoot = false; }
  };
});
/* ---------- đồng hồ ---------- */
function curDate(sh) { return L(sh) ? L(sh).now : Date.UTC(2026, 9, 27, 4, 20, 0); }
var prevDate = cmds.date;
cmds.date = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevDate(a, c);
  var now = curDate(sh), utc = a.indexOf('-u') >= 0, d = utc ? new Date(now) : loc(now);
  var Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds(), wd = d.getUTCDay();
  var f = a.filter(function (x) { return x.charAt(0) === '+'; })[0];
  var zone = utc ? 'UTC' : '+07';
  if (!f) { c.out(DAYS[wd] + ' ' + MON[Mo] + ' ' + D + ' ' + p2(h) + ':' + p2(mi) + ':' + p2(s) + ' ' + zone + ' ' + Y + '\n'); return 0; }
  c.out(f.slice(1).replace(/%([a-zA-Z%])/g, function (m, k) {
    switch (k) {
      case 'F': return Y + '-' + p2(Mo + 1) + '-' + p2(D); case 'Y': return String(Y); case 'y': return String(Y).slice(2);
      case 'm': return p2(Mo + 1); case 'd': return p2(D); case 'e': return (D < 10 ? ' ' : '') + D;
      case 'H': return p2(h); case 'M': return p2(mi); case 'S': return p2(s); case 'T': return p2(h) + ':' + p2(mi) + ':' + p2(s);
      case 's': return String(Math.floor(now / 1000)); case 'a': return DAYS[wd]; case 'b': return MON[Mo]; case 'Z': return zone;
      case 'u': return String(wd || 7); case 'w': return String(wd); case '%': return '%';
    }
    return m;
  }) + '\n'); return 0;
};
var prevUptime = cmds.uptime;
function upSecs(sh) { return Math.max(0, Math.floor((L(sh).now - L(sh).boot) / 1000)); }
function loadAvg(sh) {
  var l = L(sh), sum = 0; l.procs.forEach(function (p) { sum += p.cpu; });
  var base = l.load0 != null ? l.load0 : 0.12, x = Math.max(base, sum / 100 + base * 0.2);
  return [x, x * 0.85 + 0.03, x * 0.6 + 0.05];
}
cmds.uptime = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevUptime(a, c);
  var s = upSecs(sh), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), la = loadAvg(sh).map(function (x) { return x.toFixed(2); });
  var up = d ? d + ' day' + (d > 1 ? 's' : '') + ', ' + h + ':' + p2(m) : (h ? h + ':' + p2(m) : m + ' min');
  if (a.indexOf('-p') >= 0) { c.out('up ' + (d ? d + ' days, ' : '') + (h ? h + ' hours, ' : '') + m + ' minutes\n'); return 0; }
  if (a.indexOf('-s') >= 0) { c.out(loc(L(sh).boot).toISOString().replace('T', ' ').slice(0, 19) + '\n'); return 0; }
  c.out(' ' + hhmmss(L(sh).now) + ' up ' + up + ',  1 user,  load average: ' + la.join(', ') + '\n'); return 0;
};
var prevSleep = cmds.sleep;
cmds.sleep = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevSleep(a, c);
  var n = 0; a.forEach(function (x) { var m = /^([\d.]+)([smhd]?)$/.exec(x); if (m) n += parseFloat(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 })[m[2]]; });
  if (!n && a.length) throw new CmdErr("sleep: invalid time interval '" + a[0] + "'");
  LIN.advance(sh, n, c); return 0;
};

/* ---------- tiến trình ---------- */
function addProc(sh, o) {
  var l = L(sh), p = Object.assign({ pid: nextPid(sh), ppid: 1, user: 'root', name: '', cmd: '', cpu: 0.0, mem: 0.1, rss: 4000, vsz: 20000, stat: 'Ss', tty: '?', start: l.now, ni: 0, cputime: 0 }, o);
  if (!p.name) p.name = (p.cmd.split(/\s+/)[0] || '').replace(/^.*\//, '');
  if (o && o.pid) { p.pid = o.pid; } else p.pid = nextPid(sh);
  l.procs.push(p); return p;
}
LIN.addProc = addProc;
function findPid(sh, pid) { return L(sh).procs.filter(function (p) { return p.pid === pid; })[0]; }
function removeProc(sh, p) { var l = L(sh); l.procs = l.procs.filter(function (x) { return x !== p; }); }
LIN.findPid = findPid;
function startStr(p, now) { var d0 = loc(p.start), d1 = loc(now); return d0.getUTCDate() === d1.getUTCDate() && d0.getUTCMonth() === d1.getUTCMonth() && now - p.start < 86400000 ? hhmm(p.start) : MON[d0.getUTCMonth()] + p2(d0.getUTCDate()); }
function timeStr(p, now) { var s = Math.floor(p.cputime + (p.cpu > 5 ? (now - p.start) / 1000 * p.cpu / 100 : 0)); return Math.floor(s / 60) + ':' + p2(s % 60); }
function sortedProcs(sh) { return L(sh).procs.slice().sort(function (a, b) { return a.pid - b.pid; }); }
function uname8(u) { return u.length > 8 ? u.slice(0, 7) + '+' : u; }
cmds.ps = (function (prev) {
  return function (a, c) {
    var sh = c.sh; if (!on(sh)) return prev(a, c);
    var l = L(sh), now = l.now, list = sortedProcs(sh), i, aux = false, ef = false, uSel = null, pSel = null, ofmt = null, sort = null, noh = false, full = false;
    for (i = 0; i < a.length; i++) {
      var x = a[i];
      if (x === 'aux' || x === 'axu' || x === 'auxf' || x === '-aux') aux = true;
      else if (x === '-ef' || x === '-eF' || x === '-e' || x === 'ax' || x === '-A') { ef = x === '-ef' || x === '-eF'; if (x === '-e' || x === 'ax' || x === '-A') uSel = uSel || '*'; }
      else if (x === '-u' || x === '-U') uSel = a[++i];
      else if (x === '-p') pSel = String(a[++i]).split(',').map(Number);
      else if (x === '-o' || x === '-O') ofmt = a[++i];
      else if (/^--sort=/.test(x)) sort = x.slice(7);
      else if (x === '--no-headers' || x === '--noheaders') noh = true;
      else if (x === '-f') full = true;
      else if (/^-o/.test(x) && x.length > 2) ofmt = x.slice(2);
      else if (/^\d+$/.test(x) && a[i - 1] === '-p') {}
    }
    if (aux) uSel = '*';
    if (pSel) list = list.filter(function (p) { return pSel.indexOf(p.pid) >= 0; });
    else if (uSel && uSel !== '*') list = list.filter(function (p) { return p.user === uSel; });
    else if (!uSel && !aux && !ef) list = list.filter(function (p) { return p.session === sh.user || p.name === 'ps'; });
    if (!aux && !ef && !uSel && !pSel && !ofmt) { var me = list.slice(); me.push({ pid: nextPid(sh), tty: 'pts/0', name: 'ps', cmd: 'ps', cputime: 0, cpu: 0, user: sh.user, start: now }); list = me; }
    if (sort) { var k = sort.replace(/^[-+]/, ''), desc = sort.charAt(0) === '-'; var key = { '%cpu': 'cpu', pcpu: 'cpu', '%mem': 'mem', pmem: 'mem', pid: 'pid', rss: 'rss', ni: 'ni', vsz: 'vsz' }[k] || 'pid'; list.sort(function (x, y) { return desc ? y[key] - x[key] : x[key] - y[key]; }); }
    var out = '';
    if (ofmt) {
      var cols = ofmt.split(',').map(function (s) { return s.trim(); });
      var hd = { pid: 'PID', ppid: 'PPID', user: 'USER', ni: 'NI', pri: 'PRI', '%cpu': '%CPU', pcpu: '%CPU', '%mem': '%MEM', pmem: '%MEM', rss: 'RSS', vsz: 'VSZ', stat: 'STAT', comm: 'COMMAND', cmd: 'CMD', args: 'COMMAND', etime: 'ELAPSED', tty: 'TTY', time: 'TIME', start: 'STARTED', nice: 'NI', command: 'COMMAND', s: 'S' };
      function val(p, cn) {
        switch (cn) { case 'pid': return p.pid; case 'ppid': return p.ppid; case 'user': return p.user; case 'ni': case 'nice': return p.ni; case 'pri': return 19 - p.ni; case '%cpu': case 'pcpu': return p.cpu.toFixed(1); case '%mem': case 'pmem': return p.mem.toFixed(1); case 'rss': return p.rss; case 'vsz': return p.vsz; case 'stat': return p.stat; case 's': return p.stat.charAt(0); case 'comm': return p.name; case 'cmd': case 'args': case 'command': return p.cmd; case 'tty': return p.tty; case 'time': return timeStr(p, now); case 'etime': { var s = Math.floor((now - p.start) / 1000); return p2(Math.floor(s / 60)) + ':' + p2(s % 60); } case 'start': return startStr(p, now); }
        return '-';
      }
      if (!noh) out += cols.map(function (cn, ci) { var h = hd[cn] || cn.toUpperCase(); return ci === cols.length - 1 ? h : pad(h, /^(cmd|comm|args|command|user)$/.test(cn) ? 10 : 7, !/^(cmd|comm|args|command|user)$/.test(cn)); }).join(' ') + '\n';
      list.forEach(function (p) { out += cols.map(function (cn, ci) { var v = String(val(p, cn)); return ci === cols.length - 1 ? v : pad(v, /^(cmd|comm|args|command|user)$/.test(cn) ? 10 : 7, !/^(cmd|comm|args|command|user)$/.test(cn)); }).join(' ') + '\n'; });
      c.out(out); return pSel && !list.length ? 1 : 0;
    }
    if (aux || uSel === '*' && !ef) {
      out += 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n';
      list.forEach(function (p) { out += pad(uname8(p.user), 12) + ' ' + pad(p.pid, 5, true) + ' ' + pad(p.cpu.toFixed(1), 4, true) + ' ' + pad(p.mem.toFixed(1), 4, true) + ' ' + pad(p.vsz, 6, true) + ' ' + pad(p.rss, 5, true) + ' ' + pad(p.tty, 8) + ' ' + pad(p.stat, 4) + ' ' + pad(startStr(p, now), 5) + ' ' + pad(timeStr(p, now), 6, true) + ' ' + p.cmd + '\n'; });
    } else if (ef || full) {
      out += 'UID          PID    PPID  C STIME TTY          TIME CMD\n';
      list.forEach(function (p) { out += pad(uname8(p.user), 8) + ' ' + pad(p.pid, 7, true) + ' ' + pad(p.ppid, 7, true) + ' ' + pad(Math.round(p.cpu > 50 ? 99 : p.cpu), 2, true) + ' ' + pad(startStr(p, now), 5) + ' ' + pad(p.tty, 8) + ' ' + pad('00:' + p2(Math.floor(p.cputime / 60) % 60) + ':' + p2(p.cputime % 60), 8, true) + ' ' + p.cmd + '\n'; });
    } else {
      out += '    PID TTY          TIME CMD\n';
      list.forEach(function (p) { out += pad(p.pid, 7, true) + ' ' + pad(p.tty, 8) + ' 00:00:0' + (p.cputime % 10) + ' ' + p.name + '\n'; });
    }
    c.out(out); return 0;
  };
})(cmds.ps);
cmds.top = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: top: command not found', 127);
  var l = L(sh), now = l.now, list = sortedProcs(sh), i, sortKey = 'cpu', uSel = null, n = 20;
  for (i = 0; i < a.length; i++) { if (a[i] === '-o') { var k = a[++i].replace(/^[+-]/, ''); sortKey = { '%MEM': 'mem', '%CPU': 'cpu', PID: 'pid', RES: 'rss', TIME: 'cputime' }[k] || 'cpu'; } else if (a[i] === '-u') uSel = a[++i]; else if (/^-b?n?\d*$/.test(a[i])) {} else if (a[i] === '-p') { var ps = String(a[++i]).split(',').map(Number); list = list.filter(function (p) { return ps.indexOf(p.pid) >= 0; }); } }
  if (a.indexOf('-bn1') < 0 && a.indexOf('-b') < 0 && !a.some(function (x) { return /^-.*b/.test(x); })) { c.out('top: cần chế độ không tương tác trong khung này. Dùng: top -bn1\n'); return 1; }
  if (uSel) list = list.filter(function (p) { return p.user === uSel; });
  list.sort(function (x, y) { return sortKey === 'pid' ? x.pid - y.pid : y[sortKey] - x[sortKey]; });
  var cpuSum = 0, memUsed = memUsedMB(sh); l.procs.forEach(function (p) { cpuSum += p.cpu; });
  var us = Math.min(99, cpuSum), idle = Math.max(0, 100 - us - 1.2), la = loadAvg(sh).map(function (x) { return x.toFixed(2); }), s = upSecs(sh), d = Math.floor(s / 86400);
  var run = l.procs.filter(function (p) { return p.cpu > 5; }).length + 1, tot = l.procs.length + 40;
  var mem = memInfo(sh);
  var out = 'top - ' + hhmmss(now) + ' up ' + (d ? d + ' days, ' : '') + p2(Math.floor(s % 86400 / 3600)) + ':' + p2(Math.floor(s % 3600 / 60)) + ',  1 user,  load average: ' + la.join(', ') + '\n';
  out += 'Tasks: ' + pad(tot, 3, true) + ' total, ' + pad(run, 3, true) + ' running, ' + pad(tot - run, 3, true) + ' sleeping,   0 stopped,   0 zombie\n';
  out += '%Cpu(s): ' + pad(us.toFixed(1), 5, true) + ' us,  ' + (1.2).toFixed(1) + ' sy,  0.0 ni, ' + pad(idle.toFixed(1), 5, true) + ' id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st\n';
  out += 'MiB Mem : ' + pad(mem.total.toFixed(1), 8, true) + ' total, ' + pad(mem.free.toFixed(1), 8, true) + ' free, ' + pad(mem.used.toFixed(1), 8, true) + ' used, ' + pad(mem.cache.toFixed(1), 8, true) + ' buff/cache\n';
  out += 'MiB Swap: ' + pad(mem.swapT.toFixed(1), 8, true) + ' total, ' + pad((mem.swapT - mem.swapU).toFixed(1), 8, true) + ' free, ' + pad(mem.swapU.toFixed(1), 8, true) + ' used. ' + pad(mem.avail.toFixed(1), 8, true) + ' avail Mem \n\n';
  out += '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n';
  list.slice(0, n).forEach(function (p) { var t = Math.floor(p.cputime + (p.cpu > 5 ? (now - p.start) / 1000 * p.cpu / 100 : 0)); out += pad(p.pid, 7, true) + ' ' + pad(uname8(p.user), 9) + ' ' + pad(20 - p.ni, 3, true) + ' ' + pad(p.ni, 3, true) + ' ' + pad(p.vsz, 7, true) + ' ' + pad(p.rss, 6, true) + ' ' + pad(Math.round(p.rss * 0.3), 6, true) + ' ' + p.stat.charAt(0) + ' ' + pad(p.cpu.toFixed(1), 5, true) + ' ' + pad(p.mem.toFixed(1), 5, true) + ' ' + pad(Math.floor(t / 60) + ':' + p2(t % 60) + '.00', 9, true) + ' ' + p.name + '\n'; });
  c.out(out); return 0;
};
cmds.htop = function (a, c) { c.out('htop cần terminal tương tác (màn hình tự cập nhật), không chạy được trong khung này. Dùng: top -bn1 hoặc ps aux --sort=-%cpu | head\n'); return 1; };
function memUsedMB(sh) { var l = L(sh), u = l.memBase; l.procs.forEach(function (p) { u += p.rss / 1024; }); return u; }
function memInfo(sh) {
  var l = L(sh), total = l.memMB, used = Math.min(total - 20, memUsedMB(sh)), swapT = 0, swapU = 0;
  (l.swaps || []).forEach(function (s) { swapT += s.mb; });
  if (used > total * 0.9 && swapT) { swapU = Math.min(swapT, used - total * 0.9); used = total * 0.9; }
  var cache = Math.min(l.cacheMB, Math.max(0, total - used - 40)), free = Math.max(0, total - used - cache);
  return { total: total, used: used, free: free, cache: cache, swapT: swapT, swapU: swapU, avail: free + cache * 0.9 };
}
LIN.memInfo = memInfo;
var prevFree = cmds.free;
cmds.free = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevFree(a, c);
  var m = memInfo(sh), h = a.indexOf('-h') >= 0 || a.indexOf('--human') >= 0, g = a.indexOf('-g') >= 0, div = g ? 1024 : 1;
  function f(x) { x = x / div; if (h) { return x >= 1024 ? (x / 1024).toFixed(1) + 'Gi' : Math.round(x) + 'Mi'; } return String(Math.round(x)); }
  var rows = [['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'], ['Mem:', f(m.total), f(m.used), f(m.free), f(m.total * 0.01), f(m.cache), f(m.avail)], ['Swap:', f(m.swapT), f(m.swapU), f(m.swapT - m.swapU)]];
  c.out(rows.map(function (r) { return pad(r[0], 8) + r.slice(1).map(function (x) { return pad(x, 12, true); }).join(''); }).join('\n') + '\n'); return 0;
};
cmds.pgrep = function (a, c) {
  var sh = c.sh, fl = a.filter(function (x) { return x.charAt(0) === '-'; }).join(''), pat = a.filter(function (x) { return x.charAt(0) !== '-'; }).slice(-1)[0], uidx = a.indexOf('-u'), usr = uidx >= 0 ? a[uidx + 1] : null;
  if (usr && pat === usr) pat = null;
  var rs = sortedProcs(sh).filter(function (p) { return (!pat || (/f/.test(fl) ? p.cmd : p.name).indexOf(pat) >= 0) && (!usr || p.user === usr); });
  rs.forEach(function (p) { c.out(p.pid + (/[la]/.test(fl) ? ' ' + (/a/.test(fl) ? p.cmd : p.name) : '') + '\n'); });
  return rs.length ? 0 : 1;
};
var SIG = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, USR1: 10, SEGV: 11, USR2: 12, TERM: 15, CONT: 18, STOP: 19 };
function sigOf(x) {
  if (x == null) return 15; x = String(x).replace(/^SIG/, '');
  if (/^\d+$/.test(x)) { var n = +x; for (var k in SIG) if (SIG[k] === n) return n; return n; }
  return SIG[x] || null;
}
function sigName(n) { for (var k in SIG) if (SIG[k] === n) return k; return String(n); }
function deliver(sh, p, sig, c) {
  var l = L(sh);
  if (p.pid === 1) return 'noop';
  if (sig === 18 || sig === 19 || sig === 0) { if (sig === 19) p.stat = 'T'; if (sig === 18) p.stat = 'S'; return 'ok'; }
  if (sig === 1 && p.hup === 'reload') { p.reloaded = (p.reloaded || 0) + 1; if (p.unit) log(sh, p.unit, 'Reloading configuration (SIGHUP)', p.pid); return 'ok'; }
  if (sig === 1 && p.hup === 'ignore') return 'ok';
  if (sig !== 9 && p.ignoreTerm) { if (p.unit) log(sh, p.unit, 'Received ' + sigName(sig) + ', ignoring (worker busy)', p.pid, 4); return 'ignored'; }
  if (sig === 9) { if (p.onKill) p.onKill(sh); }
  else if (p.onTerm) p.onTerm(sh);
  p.exitSig = sig; exitProc(sh, p, sig);
  return 'killed';
}
function exitProc(sh, p, sig) {
  removeProc(sh, p);
  if (p.lock && sig !== 9) sh.fs.rm(p.lock);
  if (p.unit) LIN.unitExited(sh, p.unit, p, sig);
}
function parseJob(sh, x) { var m = /^%(\d+)$/.exec(x); if (!m) return null; var l = L(sh); return l.procs.filter(function (p) { return p.job === +m[1]; })[0] || false; }
function killCmd(a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: kill: command not found', 127);
  var sig = 15, i = 0, rc = 0;
  if (a[0] === '-l' || a[0] === '-L') { c.out(Object.keys(SIG).map(function (k) { return SIG[k] + ') SIG' + k; }).join('\n') + '\n'); return 0; }
  if (a[0] === '-s' || a[0] === '-n') { sig = sigOf(a[1]); i = 2; }
  else if (/^-/.test(a[0] || '')) { sig = sigOf(a[0].slice(1)); i = 1; }
  if (sig == null) throw new CmdErr('bash: kill: ' + a[0].replace(/^-/, '') + ': invalid signal specification');
  if (i >= a.length) throw new CmdErr('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', 2);
  for (; i < a.length; i++) {
    var t = a[i], p = /^%/.test(t) ? parseJob(sh, t) : findPid(sh, parseInt(t, 10));
    if (p === false || (!p && /^%/.test(t))) { c.err('bash: kill: ' + t + ': no such job\n'); rc = 1; continue; }
    if (!p) { c.err('bash: kill: (' + t + ') - No such process\n'); rc = 1; continue; }
    if (p.user !== sh.user && !sh.isRoot(c)) { c.err('bash: kill: (' + p.pid + ') - Operation not permitted\n'); rc = 1; continue; }
    var r = deliver(sh, p, sig, c);
    if (r === 'noop') { rc = 0; }
  }
  return rc;
}
cmds.kill = killCmd;
function byName(sh, a, c, who) {
  var sig = 15, names = [], full = false, i, usr = null;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-f') full = true; else if (x === '-u') usr = a[++i];
    else if (/^-\w+$/.test(x) && sigOf(x.slice(1)) != null && !names.length) sig = sigOf(x.slice(1));
    else if (x === '-s') sig = sigOf(a[++i]);
    else if (x.charAt(0) !== '-') names.push(x);
  }
  if (!names.length) throw new CmdErr(who + ': no process specification', 2);
  var hit = 0, denied = 0;
  sortedProcs(sh).forEach(function (p) {
    if (!names.some(function (n) { return (full ? p.cmd : p.name).indexOf(n) >= 0 && (who === 'pkill' || p.name === n); }) || (usr && p.user !== usr)) return;
    if (p.name === 'pkill' || p.name === 'killall') return;
    if (p.user !== sh.user && !sh.isRoot(c)) { denied++; return; }
    hit++; deliver(sh, p, sig, c);
  });
  if (denied && !hit) { c.err(who + ': Operation not permitted\n'); return 1; }
  if (!hit) { if (who === 'killall') c.err(who + ': ' + names[0] + ': no process found\n'); return 1; }
  return 0;
}
cmds.pkill = function (a, c) { return on(c.sh) ? byName(c.sh, a, c, 'pkill') : (function () { throw new CmdErr('bash: pkill: command not found', 127); })(); };
cmds.killall = function (a, c) { return on(c.sh) ? byName(c.sh, a, c, 'killall') : (function () { throw new CmdErr('bash: killall: command not found', 127); })(); };
cmds.renice = function (a, c) {
  var sh = c.sh, n = null, pids = [], i;
  for (i = 0; i < a.length; i++) { if (a[i] === '-n') n = parseInt(a[++i], 10); else if (a[i] === '-p') { pids.push(parseInt(a[++i], 10)); } else if (/^-?\d+$/.test(a[i]) && n == null) n = parseInt(a[i], 10); else if (/^\d+$/.test(a[i])) pids.push(+a[i]); }
  if (n == null || !pids.length) throw new CmdErr('Usage: renice [-n] <priority> [-p|--pid] <pid>...', 1);
  var rc = 0;
  pids.forEach(function (pid) {
    var p = findPid(sh, pid);
    if (!p) { c.err('renice: failed to get priority for ' + pid + ' (process ID): No such process\n'); rc = 1; return; }
    if (p.user !== sh.user && !sh.isRoot(c)) { c.err('renice: failed to set priority for ' + pid + ' (process ID): Operation not permitted\n'); rc = 1; return; }
    if (n < p.ni && !sh.isRoot(c)) { c.err('renice: failed to set priority for ' + pid + ' (process ID): Permission denied\n'); rc = 1; return; }
    c.out(pid + ' (process ID) old priority ' + p.ni + ', new priority ' + n + '\n'); p.ni = n; if (p.cpu > 5) p.cpu = Math.max(8, p.cpu * 0.5);
  });
  return rc;
};
cmds.nice = function (a, c) {
  var sh = c.sh, n = 10, i = 0;
  if (!a.length) { c.out('0\n'); return 0; }
  if (a[0] === '-n') { n = parseInt(a[1], 10); i = 2; } else if (/^-\d+$/.test(a[0])) { n = -parseInt(a[0], 10); i = 1; }
  if (n < 0 && !sh.isRoot(c)) { c.err('nice: cannot set niceness: Permission denied\n'); }
  var rest = a.slice(i); if (!rest.length) { c.out('0\n'); return 0; }
  return sh.call(rest, c, {});
};
cmds.lsof = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: lsof: command not found', 127);
  var iarg = null, i; for (i = 0; i < a.length; i++) { if (a[i] === '-i') iarg = a[++i]; else if (/^-i/.test(a[i])) iarg = a[i].slice(2); }
  var m = iarg && /:(\d+)$/.exec(iarg), port = m ? +m[1] : null, rows = [];
  listeners(sh).forEach(function (s) { if (port && s.port !== port) return; if (s.proc.user !== sh.user && !sh.isRoot(c)) return; rows.push(pad(s.proc.name.slice(0, 9), 9) + ' ' + pad(s.proc.pid, 6, true) + ' ' + pad(s.proc.user, 10) + '  ' + pad(20 + (s.port % 9), 3, true) + 'u  IPv4  ' + pad(30000 + s.port, 6) + '      0t0  TCP ' + (s.bind === '0.0.0.0' ? '*' : s.bind) + ':' + s.port + ' (LISTEN)'); });
  if (!rows.length) return 1;
  c.out('COMMAND     PID USER        FD   TYPE DEVICE SIZE/OFF NODE NAME\n' + rows.join('\n') + '\n'); return 0;
};
cmds.fuser = function (a, c) { var sh = c.sh, m = /^(\d+)\/tcp$/.exec(a.filter(function (x) { return x.charAt(0) !== '-'; })[0] || ''); if (!m) return 1; var s = listeners(sh).filter(function (x) { return x.port === +m[1]; })[0]; if (!s) return 1; c.out(m[1] + '/tcp:             ' + s.proc.pid + '\n'); return 0; };
function listeners(sh) {
  var out = [];
  L(sh).procs.forEach(function (p) { if (p.port) out.push({ port: p.port, bind: p.bind || '0.0.0.0', proc: p }); });
  return out.sort(function (x, y) { return x.port - y.port; });
}
LIN.listeners = listeners;
var prevSS = cmds.ss;
cmds.ss = function (a, c) {
  var sh = c.sh; if (!on(sh) || !L(sh).ownSS) return prevSS(a, c);
  var fl = a.join(''), withP = /p/.test(fl), rows = [];
  listeners(sh).forEach(function (s) {
    var bind = s.bind === '0.0.0.0' ? '0.0.0.0' : s.bind, canSee = s.proc.user === sh.user || sh.isRoot(c);
    var users = withP && canSee ? 'users:(("' + s.proc.name + '",pid=' + s.proc.pid + ',fd=' + (18 + s.port % 9) + '))' : '';
    rows.push(pad('LISTEN', 7) + pad('0', 7) + pad('511', 8) + pad(bind + ':' + s.port, 24) + pad('0.0.0.0:*', 16) + users);
  });
  c.out(pad('State', 7) + pad('Recv-Q', 7) + pad('Send-Q', 8) + pad('Local Address:Port', 24) + pad('Peer Address:Port', 16) + (withP ? 'Process' : '') + '\n' + rows.join('\n') + '\n'); return 0;
};

/* nền (&), jobs, nohup */
LIN.bgHook = V.bgHook = function (sh, node) {
  if (!on(sh)) return false;
  var l = L(sh), words = [];
  if (node.k !== 'simple') return false;
  var skipNext = false, redirOut = false, redirErr = false, REDIR = { '>': 1, '>>': 1, '<': 1, '2>': 1, '2>>': 1, '&>': 1, '>|': 1, '<<<': 1 };
  node.toks.forEach(function (t) {
    if (t.t === 'op') { if (REDIR[t.v]) { skipNext = true; if (t.v === '>' || t.v === '>>' || t.v === '&>' || t.v === '>|') redirOut = true; if (t.v === '2>' || t.v === '2>>' || t.v === '&>') redirErr = true; } else if (t.v === '2>&1') redirErr = true; return; }
    if (t.t === 'w') { if (skipNext) { skipNext = false; return; } words = words.concat(sh.expand(t)); }
  });
  if (!words.length) return false;
  var nohup = false, niceN = 0, again = true;
  while (again) {
    again = false;
    if (words[0] === 'nohup') { nohup = true; words.shift(); again = true; }
    else if (words[0] === 'nice') { words.shift(); niceN = 10; if (words[0] === '-n') { niceN = parseInt(words[1], 10) || 0; words.splice(0, 2); } else if (/^-\d+$/.test(words[0] || '')) { niceN = -parseInt(words[0], 10); words.shift(); } again = true; }
  }
  if (!words.length) return false;
  var inner = words.join(' ');
  var spec = bgSpec(words);
  var job = ++l.jobN;
  var p = addProc(sh, { user: sh.user, cmd: inner, name: words[0].replace(/^.*\//, ''), ppid: sh.sessionPid || 2100, tty: nohup ? '?' : 'pts/0', stat: spec.cpu > 5 ? 'R' : 'S', cpu: spec.cpu, mem: spec.mem, rss: spec.rss, vsz: spec.vsz, session: sh.user, nohup: nohup, job: job, bg: true, ni: niceN });
  sh.vars['!'] = String(p.pid); sh.lastStatus = 0;
  if (nohup) {
    if (!redirOut) { c0(sh).err('nohup: ignoring input and appending output to \'nohup.out\'\n'); sh.fs.put(sh.cwd + '/nohup.out', '', { owner: sh.user, mode: 384 }); }
    else if (!redirErr) c0(sh).err('nohup: ignoring input\n');
  }
  sh.cur.disp += '[' + job + '] ' + p.pid + '\n';
  return true;
};
function c0(sh) { return { err: function (s) { sh.cur.disp += s; } }; }
function bgSpec(w) {
  var n = w[0].replace(/^.*\//, '');
  if (n === 'yes' || n === 'stress' || n === 'dd' || n === 'md5sum' || n === 'cat' && w.indexOf('/dev/zero') > 0) return { cpu: 98.5, mem: 0.1, rss: 1900, vsz: 7500 };
  if (n === 'node') return { cpu: 1.2, mem: 3.2, rss: 66000, vsz: 1190000 };
  if (n === 'tail' || n === 'sleep') return { cpu: 0.0, mem: 0.0, rss: 1000, vsz: 5300 };
  return { cpu: 0.3, mem: 0.1, rss: 2400, vsz: 9000 };
}
B.jobs = function (a, c) {
  var sh = c.sh; if (!on(sh)) return 0;
  var js = L(sh).procs.filter(function (p) { return p.job && p.session === sh.user && !p.nohup; });
  js.sort(function (x, y) { return x.job - y.job; });
  if (a.indexOf('-p') >= 0) { js.forEach(function (p) { c.out(p.pid + '\n'); }); return 0; }
  var lf = a.indexOf('-l') >= 0;
  js.forEach(function (p, i) { c.out('[' + p.job + ']' + (i === js.length - 1 ? '+' : (i === js.length - 2 ? '-' : ' ')) + ' ' + (lf ? pad(p.pid, 6, true) + ' ' : ' ') + pad(p.stat === 'T' ? 'Stopped' : 'Running', 24) + p.cmd + (p.stat === 'T' ? '' : ' &') + '\n'); });
  return 0;
};
var prevExit = B.exit;
B.exit = function (a, c) {
  var sh = c.sh;
  if (on(sh) && !sh.sdepth && !sh.fstack.length) {
    var l = L(sh), gone = l.procs.filter(function (p) { return p.session === sh.user && !p.nohup && p.bg; });
    gone.forEach(function (p) { removeProc(sh, p); });
    c.out('logout\n' + (gone.length ? '(mô phỏng: phiên SSH đóng, ' + gone.length + ' tiến trình chạy nền không có nohup đã nhận SIGHUP và chết; hãy đăng nhập lại để tiếp tục)\n' : '(mô phỏng: phiên SSH đóng và mở lại)\n'));
    return 0;
  }
  return prevExit(a, c);
};
/* tmux tối giản */
cmds.tmux = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: tmux: command not found', 127);
  var l = L(sh), sub = a[0] || '', sn = null, i, cmdline = null, det = false;
  for (i = 1; i < a.length; i++) { if (a[i] === '-s') sn = a[++i]; else if (a[i] === '-t') sn = a[++i]; else if (a[i] === '-d') det = true; else if (a[i].charAt(0) !== '-') cmdline = a[i]; }
  l.tmux = l.tmux || [];
  if (sub === 'ls' || sub === 'list-sessions') {
    if (!l.tmux.length) { c.err('no server running on /tmp/tmux-1000/default\n'); return 1; }
    l.tmux.forEach(function (s) { c.out(s.name + ': 1 windows (created ' + DAYS[loc(s.t).getUTCDay()] + ' ' + MON[loc(s.t).getUTCMonth()] + ' ' + loc(s.t).getUTCDate() + ' ' + hhmmss(s.t) + ' 2026)\n'); }); return 0;
  }
  if (sub === 'new' || sub === 'new-session') {
    sn = sn || String(l.tmux.length);
    if (l.tmux.some(function (s) { return s.name === sn; })) { c.err('duplicate session: ' + sn + '\n'); return 1; }
    if (!det) { c.out('tmux: new -s mà không có -d cần terminal tương tác. Dùng: tmux new -d -s ' + sn + (cmdline ? '' : " 'lệnh'") + '\n'); return 1; }
    var srv = l.procs.filter(function (p) { return p.name === 'tmux: server' && p.user === sh.user; })[0] || addProc(sh, { user: sh.user, cmd: 'tmux: server', name: 'tmux: server', stat: 'Ss', rss: 3500, vsz: 10800 });
    var ch = cmdline ? addProc(sh, { user: sh.user, cmd: cmdline, name: cmdline.split(/\s+/)[0], ppid: srv.pid, stat: 'S', tty: 'pts/1', rss: 2000, vsz: 8000, tmuxSess: sn, cpu: bgSpec(cmdline.split(/\s+/)).cpu }) : null;
    l.tmux.push({ name: sn, t: l.now, user: sh.user }); return 0;
  }
  if (sub === 'kill-session') {
    var k = l.tmux.filter(function (s) { return s.name === sn; })[0]; if (!k) { c.err("can't find session: " + sn + '\n'); return 1; }
    l.tmux = l.tmux.filter(function (s) { return s !== k; }); l.procs = l.procs.filter(function (p) { return p.tmuxSess !== sn; });
    if (!l.tmux.length) l.procs = l.procs.filter(function (p) { return p.name !== 'tmux: server'; });
    return 0;
  }
  if (sub === 'attach' || sub === 'a' || sub === 'attach-session') { c.out('tmux attach cần terminal tương tác (giao diện tmux), không chạy được trong khung này. Ngoài đời: tmux attach -t ' + (sn || '0') + ', thoát bằng Ctrl+b rồi d.\n'); return 0; }
  c.out('Mô phỏng tmux hỗ trợ: new -d -s TÊN [lệnh], ls, kill-session -t TÊN, attach\n'); return 0;
};

/* ---------- unit systemd ---------- */
var KEYS = {
  Unit: 'Description After Before Requires Wants Documentation ConditionPathExists PartOf BindsTo Conflicts OnFailure StartLimitIntervalSec StartLimitBurst'.split(' '),
  Service: 'Type ExecStart ExecStartPre ExecStartPost ExecStop ExecReload WorkingDirectory User Group Restart RestartSec Environment EnvironmentFile StandardOutput StandardError TimeoutStartSec TimeoutStopSec LimitNOFILE NoNewPrivileges ProtectSystem ProtectHome PrivateTmp SyslogIdentifier KillMode KillSignal RemainAfterExit UMask Nice MemoryMax CPUQuota StartLimitIntervalSec StartLimitBurst SuccessExitStatus'.split(' '),
  Install: 'WantedBy RequiredBy Alias Also'.split(' '),
  Timer: 'OnCalendar OnBootSec OnUnitActiveSec OnUnitInactiveSec OnStartupSec Persistent Unit RandomizedDelaySec AccuracySec WakeSystem'.split(' ')
};
function parseUnit(text) {
  var cfg = { _order: [], _warn: [], _sections: {} }, cur = null;
  String(text).split('\n').forEach(function (ln, i) {
    var s = ln.trim(); if (!s || /^[#;]/.test(s)) return;
    var m = /^\[(\w+)\]$/.exec(s);
    if (m) { cur = m[1]; cfg[cur] = cfg[cur] || {}; cfg._sections[cur] = true; cfg._order.push(cur); return; }
    var kv = /^([A-Za-z0-9]+)\s*=\s*(.*)$/.exec(s);
    if (!kv) { cfg._warn.push('Missing \'=\', ignoring line ' + (i + 1) + '.'); return; }
    if (!cur) { cfg._warn.push('Assignment outside of section. Ignoring.'); return; }
    if (KEYS[cur] && KEYS[cur].indexOf(kv[1]) < 0) cfg._warn.push("Unknown key name '" + kv[1] + "' in section '" + cur + "', ignoring.");
    var o = cfg[cur]; o[kv[1]] = o[kv[1]] || []; o[kv[1]].push(kv[2]);
    if (kv[2] === '' && /^(ExecStart|Environment|EnvironmentFile)$/.test(kv[1])) o[kv[1]] = [];
  });
  return cfg;
}
LIN.parseUnit = parseUnit;
function g1(cfg, sec, key) { var o = cfg[sec]; return o && o[key] && o[key].length ? o[key][o[key].length - 1] : null; }
function unitPath(name) { return '/etc/systemd/system/' + name; }
function ensureUnit(sh, name) {
  var l = L(sh), u = l.units[name];
  if (u) return u;
  var f = sh.fs.get(unitPath(name)), lib = sh.fs.get('/lib/systemd/system/' + name);
  var file = f ? unitPath(name) : lib ? '/lib/systemd/system/' + name : null;
  if (!file) return null;
  u = l.units[name] = { name: name, file: file, kind: /\.timer$/.test(name) ? 'timer' : 'service', active: 'inactive', sub: 'dead', enabled: 'disabled', pid: 0, since: l.now, restarts: 0, result: 'success', loadedText: null, cfg: null };
  loadUnit(sh, u);
  return u;
}
function loadUnit(sh, u) { var n = sh.fs.get(u.file); u.loadedText = n ? n.c : ''; u.cfg = parseUnit(u.loadedText); u.dirty = false; }
function allUnitNames(sh) {
  var l = L(sh), set = {};
  Object.keys(l.units).forEach(function (n) { set[n] = 1; });
  sh.fs.list('/etc/systemd/system').forEach(function (n) { if (/\.(service|timer)$/.test(n)) set[n] = 1; });
  return Object.keys(set).sort();
}
function normName(n) { return /\.(service|timer|socket|target)$/.test(n) ? n : n + '.service'; }
var BUILTIN = { 'ssh.service': 'ssh', 'nginx.service': 'nginx', 'ufw.service': 'ufw', 'docker.service': 'docker', 'fail2ban.service': 'fail2ban' };
function isStaticUnit(sh, n) { return !!BUILTIN[n] && !(L(sh).units[n]) && !sh.fs.get(unitPath(n)); }
LIN.onWrite = function (sh, path) {
  if (!on(sh)) return;
  var m = /^\/etc\/systemd\/system\/([^\/]+\.(service|timer))$/.exec(path); if (!m) return;
  var u = L(sh).units[m[1]]; if (u && u.cfg) u.dirty = true;
};
var prevOnWrite = null;
function hookWrite(sh) { if (sh.__lw) return; sh.__lw = true; prevOnWrite = sh.onWrite; sh.onWrite = function (p) { LIN.onWrite(sh, p); if (prevOnWrite) prevOnWrite.call(sh, p); }; }
function envOf(sh, cfg) {
  var env = {}, evs = (cfg.Service && cfg.Service.Environment) || [], efs = (cfg.Service && cfg.Service.EnvironmentFile) || [];
  efs.forEach(function (f) { var opt = f.charAt(0) === '-', p = f.replace(/^-/, ''), n = sh.fs.get(p); if (n) String(n.c).split('\n').forEach(function (ln) { var m = /^\s*([A-Za-z_]\w*)=(.*)$/.exec(ln); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }); });
  evs.forEach(function (e) { (e.match(/([A-Za-z_]\w*)=("[^"]*"|\S+)/g) || []).forEach(function (kv) { var i = kv.indexOf('='); env[kv.slice(0, i)] = kv.slice(i + 1).replace(/^"|"$/g, ''); }); });
  return env;
}
function passwdHas(sh, user) { var n = sh.fs.get('/etc/passwd'); return !!n && new RegExp('^' + user + ':', 'm').test(n.c); }
function attempt(sh, u) {
  var l = L(sh), cfg = u.cfg, S = cfg.Service || {}, es = g1(cfg, 'Service', 'ExecStart'), type = g1(cfg, 'Service', 'Type') || 'simple';
  if (!cfg._sections.Service || !es) return { code: 'bad', msg: 'Service has no ExecStart=, ExecStop=, or SuccessAction=. Refusing.', result: 'resources', status: null, load: 'bad-setting' };
  var user = g1(cfg, 'Service', 'User'), wd = g1(cfg, 'Service', 'WorkingDirectory'), efs = S.EnvironmentFile || [];
  var ex = es.replace(/^[-@+!:]+/, ''), toks = ex.split(/\s+/), bin = toks[0];
  var envMiss = efs.filter(function (f) { return f.charAt(0) !== '-' && !sh.fs.get(f); })[0];
  if (envMiss) return { code: 'exit', status: 'N/A', msg: 'Failed to load environment files: No such file or directory', msg2: 'Failed to run \'start\' task: No such file or directory', result: 'resources' };
  if (user && !passwdHas(sh, user)) return { code: 'exit', status: '217/USER', msg: 'Failed to determine user credentials: No such process', msg2: 'Failed at step USER spawning ' + bin + ': No such process', result: 'exit-code' };
  if (wd && !sh.fs.isD(wd.replace(/^[-!]/, ''))) return { code: 'exit', status: '200/CHDIR', msg: 'Changing to the requested working directory failed: No such file or directory', msg2: 'Failed at step CHDIR spawning ' + bin + ': No such file or directory', result: 'exit-code' };
  var bn = sh.fs.get(bin);
  if (bin.charAt(0) !== '/') return { code: 'bad', msg: 'Neither a valid executable name nor an absolute path: ' + bin, result: 'resources', load: 'bad-setting' };
  if (!bn) return { code: 'exit', status: '203/EXEC', msg: 'Failed at step EXEC spawning ' + bin + ': No such file or directory', result: 'exit-code' };
  if (!(bn.mode & 73)) return { code: 'exit', status: '203/EXEC', msg: 'Failed at step EXEC spawning ' + bin + ': Permission denied', result: 'exit-code' };
  var lk = (l.locks || {})[u.name];
  if (lk && sh.fs.get(lk) && type !== 'oneshot') return { code: 'exit', status: '1/FAILURE', msg: 'Error: another instance is already running (lock file ' + lk + ' exists)', result: 'exit-code', node: true };
  var env = envOf(sh, cfg), base = bin.replace(/^.*\//, ''), res = { ok: true, env: env, bin: bin, toks: toks, user: user || 'root', wd: wd };
  if (type === 'oneshot') return res;
  if (/^(node|npm|npx)$/.test(base)) {
    var scr = toks[1] || ''; var sp = scr.charAt(0) === '/' ? scr : (wd || '/') + '/' + scr;
    if (base === 'node' && scr && scr.charAt(0) !== '-' && !sh.fs.get(sp.replace(/\/\.\//g, '/'))) return { code: 'exit', status: '1/FAILURE', msg: 'Error: Cannot find module \'' + sp + '\'', result: 'exit-code', node: true };
    var reqs = l.appReq || [];
    for (var i = 0; i < reqs.length; i++) if (!env[reqs[i]]) return { code: 'exit', status: '1/FAILURE', msg: 'Error: ' + reqs[i] + ' is not defined (đọc từ EnvironmentFile hoặc Environment=)', result: 'exit-code', node: true };
    var port = parseInt(env.PORT || l.appPort || 8888, 10);
    var other = listeners(sh).filter(function (s) { return s.port === port && !(s.proc.unit === u.name); })[0];
    if (other) return { code: 'exit', status: '1/FAILURE', msg: 'Error: listen EADDRINUSE: address already in use :::' + port, result: 'exit-code', node: true };
    res.port = port; res.app = true;
  }
  return res;
}
function mkProc(sh, u, a) {
  var base = a.bin.replace(/^.*\//, ''), spec = bgSpec([base]);
  var p = addProc(sh, { user: a.user, cmd: a.toks.join(' '), name: base, ppid: 1, stat: spec.cpu > 5 ? 'R' : 'Ssl', cpu: a.app ? 0.6 : spec.cpu, mem: a.app ? 3.4 : spec.mem, rss: a.app ? 71000 : spec.rss, vsz: a.app ? 1210000 : spec.vsz, port: a.port, bind: a.app ? '0.0.0.0' : null, unit: u.name, hup: 'term', ignoreTerm: false });
  var wk = (L(sh).workers || {})[u.name]; if (wk) p.ignoreTerm = !!wk.ignoreTerm;
  var lk = (L(sh).locks || {})[u.name]; if (lk) { sh.fs.put(lk, String(p.pid) + '\n', { owner: 'root', mode: 420 }); p.lock = lk; }
  return p;
}
function startUnit(sh, u, c) {
  var l = L(sh), a = attempt(sh, u), cfg = u.cfg, id = u.name.replace(/\.service$/, ''), type = g1(cfg, 'Service', 'Type') || 'simple';
  var desc = g1(cfg, 'Unit', 'Description') || u.name;
  log(sh, 'systemd', 'Starting ' + u.name + ' - ' + desc + '...');
  if (a.ok) {
    u.restartsNow = false;
    if (type === 'oneshot') {
      var r = LIN.runSandbox(sh, a.user, a.toks.join(' '), a.env, a.wd, true);
      if (r.out.trim()) r.out.trim().split('\n').forEach(function (ln) { log(sh, u.name, ln, nextPid(sh)); });
      if (r.code === 0) { u.active = 'inactive'; u.sub = 'dead'; u.result = 'success'; u.since = l.now; u.exit = { code: 'exited', status: '0/SUCCESS', pid: nextPid(sh) }; log(sh, 'systemd', 'Finished ' + u.name + ' - ' + desc + '.'); return true; }
      u.active = 'failed'; u.sub = 'failed'; u.result = 'exit-code'; u.since = l.now; u.exit = { code: 'exited', status: r.code + '/FAILURE', pid: nextPid(sh) };
      log(sh, 'systemd', u.name + ': Main process exited, code=exited, status=' + r.code + '/FAILURE', 1, 3); log(sh, 'systemd', u.name + ': Failed with result \'exit-code\'.', 1, 3); log(sh, 'systemd', 'Failed to start ' + u.name + ' - ' + desc + '.', 1, 3);
      return false;
    }
    var p = mkProc(sh, u, a); u.pid = p.pid; u.active = 'active'; u.sub = 'running'; u.since = l.now; u.result = 'success'; u.exit = null; u.runOpts = a;
    log(sh, 'systemd', 'Started ' + u.name + ' - ' + desc + '.');
    if (a.app) log(sh, u.name, '[Nest] ' + p.pid + '  - LOG [NestApplication] Nest application successfully started', p.pid);
    else log(sh, u.name, 'started', p.pid);
    return true;
  }
  // thất bại
  var pid = nextPid(sh);
  u.exit = { code: a.code === 'bad' ? null : 'exited', status: a.status, pid: pid, msg: a.msg };
  if (a.code === 'bad') { u.badLoad = a.load; u.active = 'failed'; u.sub = 'failed'; u.result = 'resources'; log(sh, 'systemd', u.name + ': ' + a.msg, 1, 3); log(sh, 'systemd', 'Failed to start ' + u.name + ' - ' + desc + '.', 1, 3); return false; }
  if (a.node) { log(sh, u.name, a.msg, pid, 3); } else { log(sh, 'systemd', u.name + ': ' + a.msg, 1, 3); if (a.msg2) log(sh, 'systemd', u.name + ': ' + a.msg2, 1, 3); }
  var rs = g1(cfg, 'Service', 'Restart') || 'no';
  if (/^(always|on-failure|on-abnormal|on-abort)$/.test(rs) && a.result !== 'resources') {
    u.restarts = (u.restarts || 0) + 1; u.active = 'activating'; u.sub = 'auto-restart'; u.result = a.result; u.since = l.now;
    log(sh, 'systemd', u.name + ': Main process exited, code=exited, status=' + a.status + '/FAILURE'.replace(/\/FAILURE\/FAILURE/, '/FAILURE'), 1, 3);
    log(sh, 'systemd', u.name + ': Scheduled restart job, restart counter is at ' + u.restarts + '.', 1, 6);
    return false;
  }
  u.active = 'failed'; u.sub = 'failed'; u.result = a.result || 'exit-code'; u.since = l.now;
  log(sh, 'systemd', u.name + ': Failed with result \'' + u.result + '\'.', 1, 3); log(sh, 'systemd', 'Failed to start ' + u.name + ' - ' + desc + '.', 1, 3);
  return false;
}
LIN.unitExited = function (sh, name, p, sig) {
  var u = L(sh).units[name]; if (!u) return;
  var rs = g1(u.cfg, 'Service', 'Restart') || 'no', l = L(sh), id = name.replace(/\.service$/, '');
  if (u.stopping) return;
  var code = sig === 15 ? 'killed, signal=TERM' : 'killed, signal=' + sigName(sig);
  log(sh, 'systemd', name + ': Main process exited, code=' + code, 1, sig === 15 ? 6 : 3);
  if (rs === 'always' || (rs === 'on-failure' && sig !== 15) || (rs === 'on-abnormal' && sig !== 15)) {
    u.restarts = (u.restarts || 0) + 1; u.active = 'activating'; u.sub = 'auto-restart'; u.since = l.now; u.result = 'signal';
    log(sh, 'systemd', name + ': Scheduled restart job, restart counter is at ' + u.restarts + '.');
    LIN.advanceRestart(sh, u);
  } else {
    u.active = 'failed'; u.sub = 'failed'; u.result = 'signal'; u.pid = 0; u.since = l.now; u.exit = { code: 'killed', status: sigName(sig), pid: p.pid };
    log(sh, 'systemd', name + ': Failed with result \'signal\'.', 1, 3);
  }
};
LIN.advanceRestart = function (sh, u) {
  var l = L(sh), rs = parseFloat(g1(u.cfg, 'Service', 'RestartSec') || '0.1') || 0.1;
  l.now += Math.round(rs * 1000);
  var ok = startUnit(sh, u);
  if (ok) return;
  if (u.active === 'activating') {
    var burst = 5, n = 0;
    while (u.active === 'activating' && n++ < 0) {}
  }
};
function stopUnit(sh, u) {
  var l = L(sh), desc = g1(u.cfg, 'Unit', 'Description') || u.name;
  u.stopping = true;
  l.procs.filter(function (p) { return p.unit === u.name; }).forEach(function (p) { if (p.onTerm) p.onTerm(sh); if (p.ignoreTerm) log(sh, 'systemd', u.name + ": State 'stop-sigterm' timed out. Killing.", 1, 4); else if (p.lock) sh.fs.rm(p.lock); removeProc(sh, p); });
  u.stopping = false; u.active = 'inactive'; u.sub = 'dead'; u.pid = 0; u.since = l.now; u.restarts = 0;
  log(sh, 'systemd', 'Stopping ' + u.name + ' - ' + desc + '...'); log(sh, 'systemd', 'Stopped ' + u.name + ' - ' + desc + '.');
}
function enabledOf(sh, u) {
  if (u.masked) return 'masked';
  var n = sh.fs.get(u.file); if (!n) return 'disabled';
  var wb = g1(u.cfg, 'Install', 'WantedBy');
  if (!wb && !g1(u.cfg, 'Install', 'RequiredBy')) return 'static';
  return u.enabled;
}
function statusText(sh, u) {
  var l = L(sh), now = l.now, cfg = u.cfg, desc = g1(cfg, 'Unit', 'Description') || u.name, en = enabledOf(sh, u), dot = u.active === 'active' ? '●' : u.active === 'failed' ? '×' : u.active === 'activating' ? '●' : '○';
  var out = dot + ' ' + u.name + (desc ? ' - ' + desc : '') + '\n';
  if (u.badLoad) out += '     Loaded: bad-setting (Reason: Unit ' + u.name + ' has a bad unit file setting.)\n';
  else out += '     Loaded: loaded (' + u.file + '; ' + en + '; preset: enabled)\n';
  if (u.masked) { out = '○ ' + u.name + '\n     Loaded: masked (Reason: Unit ' + u.name + ' is masked.)\n     Active: inactive (dead)\n'; return out; }
  var act = u.active === 'activating' && u.sub === 'auto-restart' ? 'activating (auto-restart) (Result: ' + u.result + ') since ' + fullTs(u.since) + '; ' + ago(u.since, now).replace(' ago', '') + ' ago'
    : u.active === 'failed' ? 'failed (Result: ' + u.result + ') since ' + fullTs(u.since) + '; ' + ago(u.since, now)
    : u.active === 'active' ? 'active (' + u.sub + ') since ' + fullTs(u.since) + '; ' + ago(u.since, now)
    : 'inactive (dead)' + (u.kind === 'service' && u.exit && u.exit.status === '0/SUCCESS' ? ' since ' + fullTs(u.since) + '; ' + ago(u.since, now) : '');
  out += '     Active: ' + act + '\n';
  if (u.kind === 'timer') { var tm = timerInfo(sh, u); out += '    Trigger: ' + (tm && u.active === 'active' ? fullTs(tm.next) + '; ' + untilStr(tm.next - now) + ' left' : 'n/a') + '\n   Triggers: ● ' + (g1(cfg, 'Timer', 'Unit') || u.name.replace(/\.timer$/, '.service')) + '\n'; }
  if (u.exit && u.active !== 'active') {
    var es = g1(cfg, 'Service', 'ExecStart') || '';
    out += '    Process: ' + u.exit.pid + ' ExecStart=' + es + ' (code=' + (u.exit.code || 'exited') + ', status=' + (u.exit.status || '') + ')\n   Main PID: ' + u.exit.pid + ' (code=' + (u.exit.code || 'exited') + ', status=' + (u.exit.status || '') + ')\n        CPU: ' + (30 + u.exit.pid % 40) + 'ms\n';
  }
  if (u.active === 'active' && u.pid) {
    var p = findPid(sh, u.pid), procs = l.procs.filter(function (x) { return x.unit === u.name; });
    out += '   Main PID: ' + u.pid + ' (' + (p ? p.name : '?') + ')\n      Tasks: ' + (p ? 11 : 1) + ' (limit: 2269)\n     Memory: ' + (p ? (p.rss / 1024).toFixed(1) : '0') + 'M\n        CPU: ' + (1 + u.pid % 5) + '.' + (u.pid % 9) + '12s\n     CGroup: /system.slice/' + u.name + '\n';
    procs.forEach(function (x, i) { out += '             ' + (i === procs.length - 1 ? '└─' : '├─') + x.pid + ' ' + x.cmd + '\n'; });
  }
  var lines = l.jr.filter(function (j) { return (j.unit === u.name || (j.unit === 'systemd' && j.msg.indexOf(u.name) >= 0) || j.unit === u.name.replace(/\.service$/, '')); }).slice(-8);
  if (lines.length) { out += '\n'; lines.forEach(function (j) { out += jline(j) + '\n'; }); }
  return out;
}
function jline(j) { return sysTs(j.t) + ' vps ' + (j.unit === 'systemd' ? 'systemd[1]' : j.id + '[' + j.pid + ']') + ': ' + j.msg; }
function untilStr(ms) { var s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'min ' + (s % 60 ? s % 60 + 's' : '').trim(); if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'min'; return Math.floor(s / 86400) + ' day' + (s >= 172800 ? 's' : '') + ' ' + Math.floor(s % 86400 / 3600) + 'h'; }

/* ---------- lịch: OnCalendar và cron ---------- */
function calNext(expr, after) {
  expr = String(expr).trim();
  var m, step = 60000;
  var presets = { minutely: '*-*-* *:*:00', hourly: '*-*-* *:00:00', daily: '*-*-* 00:00:00', weekly: 'Mon *-*-* 00:00:00', monthly: '*-*-01 00:00:00', yearly: '*-01-01 00:00:00' };
  if (presets[expr]) expr = presets[expr];
  var wd = null; if ((m = /^((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:,(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))*)\s+(.*)$/.exec(expr))) { wd = m[1].split(','); expr = m[2]; }
  m = /^(?:(\*|\d{4})-(\*|\d{1,2})-(\*|\d{1,2})\s+)?(\*|\d{1,2}|\*\/\d+):(\*|\d{1,2}|\*\/\d+)(?::(\d{1,2}))?$/.exec(expr);
  if (!m) return null;
  var dd = m[3], hh = m[4], mm = m[5];
  function fits(v, spec) { if (spec === '*' || spec === undefined) return true; var s = /^\*\/(\d+)$/.exec(spec); return s ? v % +s[1] === 0 : v === +spec; }
  var t = Math.floor((after + 1000) / 60000) * 60000 + 60000;
  for (var i = 0; i < 60 * 24 * 40; i++, t += 60000) {
    var d = loc(t);
    if (m[1] && m[1] !== '*' && d.getUTCFullYear() !== +m[1]) continue;
    if (m[2] && m[2] !== '*' && d.getUTCMonth() + 1 !== +m[2]) continue;
    if (dd && dd !== '*' && d.getUTCDate() !== +dd) continue;
    if (wd && wd.indexOf(DAYS[d.getUTCDay()]) < 0) continue;
    if (!fits(d.getUTCHours(), hh) || !fits(d.getUTCMinutes(), mm)) continue;
    return t;
  }
  return null;
}
LIN.calNext = calNext;
function timerInfo(sh, u) {
  var l = L(sh), cfg = u.cfg, oc = g1(cfg, 'Timer', 'OnCalendar'), ob = g1(cfg, 'Timer', 'OnBootSec'), ou = g1(cfg, 'Timer', 'OnUnitActiveSec');
  if (oc) { var nx = calNext(oc, u.lastRun || l.now); return nx ? { next: nx } : null; }
  function dur(s) { var m = /^(\d+)\s*(s|sec|min|m|h|d)?$/.exec(s || ''); if (!m) return 0; return +m[1] * ({ s: 1, sec: 1, min: 60, m: 60, h: 3600, d: 86400 })[m[2] || 's'] * 1000; }
  if (ou) return { next: (u.lastRun || u.since) + dur(ou) };
  if (ob) return { next: l.boot + dur(ob) };
  return null;
}
function cronField(f, lo, hi, names) {
  var set = {}, ok = true;
  f.split(',').forEach(function (part) {
    var p = part, step = 1, m = /^(.*)\/(\d+)$/.exec(p); if (m) { p = m[1]; step = +m[2]; }
    if (names) p = p.replace(/[A-Za-z]{3}/g, function (n) { var k = names.indexOf(n.toLowerCase()); return k < 0 ? n : String(k + (names.length === 12 ? 1 : 0)); });
    var a, b;
    if (p === '*') { a = lo; b = hi; } else if ((m = /^(\d+)-(\d+)$/.exec(p))) { a = +m[1]; b = +m[2]; } else if (/^\d+$/.test(p)) { a = +p; b = m ? hi : +p; } else { ok = false; return; }
    if (a < lo || b > hi || a > b) { ok = false; return; }
    for (var v = a; v <= b; v += step) set[v] = 1;
  });
  return ok ? set : null;
}
function parseCronLine(line, sys) {
  var s = line.replace(/^\s+/, '');
  if (!s || s.charAt(0) === '#') return { skip: true };
  if (/^[A-Za-z_]\w*\s*=/.test(s)) { var m = /^([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(s); return { env: [m[1], m[2].replace(/^["']|["']$/g, '')] }; }
  var at = /^@(reboot|hourly|daily|midnight|weekly|monthly|yearly|annually)\s+(.*)$/.exec(s), f, rest;
  if (at) { var map = { hourly: '0 * * * *', daily: '0 0 * * *', midnight: '0 0 * * *', weekly: '0 0 * * 0', monthly: '0 0 1 * *', yearly: '0 0 1 1 *', annually: '0 0 1 1 *', reboot: '@reboot' }; if (at[1] === 'reboot') return { reboot: true, user: null, cmd: at[2] }; s = map[at[1]] + ' ' + at[2]; }
  var parts = s.split(/\s+/); if (parts.length < 6) return { err: 'bad command' };
  var fields = [cronField(parts[0], 0, 59), cronField(parts[1], 0, 23), cronField(parts[2], 1, 31), cronField(parts[3], 1, 12, ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']), cronField(parts[4].replace(/7/g, '0'), 0, 6, ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])];
  var names = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week'];
  for (var i = 0; i < 5; i++) if (!fields[i]) return { err: 'bad ' + names[i] };
  var user = null, cmd;
  if (sys) { user = parts[5]; cmd = parts.slice(6).join(' '); if (!cmd) return { err: 'bad command' }; } else cmd = parts.slice(5).join(' ');
  return { f: fields, dom: parts[2] !== '*', dow: parts[4] !== '*', user: user, cmd: cmd };
}
LIN.parseCronLine = parseCronLine;
function cronDue(e, d) {
  var m = e.f[0][d.getUTCMinutes()], h = e.f[1][d.getUTCHours()], mo = e.f[3][d.getUTCMonth() + 1], dm = e.f[2][d.getUTCDate()], dw = e.f[4][d.getUTCDay()];
  if (!m || !h || !mo) return false;
  if (e.dom && e.dow) return !!(dm || dw); if (e.dom) return !!dm; if (e.dow) return !!dw; return true;
}
function cronSources(sh) {
  var l = L(sh), out = [];
  Object.keys(l.cron).forEach(function (u) { out.push({ user: u, text: l.cron[u], sys: false, src: 'crontab:' + u }); });
  var etc = sh.fs.get('/etc/crontab'); if (etc) out.push({ user: 'root', text: etc.c, sys: true, src: '/etc/crontab' });
  sh.fs.list('/etc/cron.d').forEach(function (n) { var f = sh.fs.get('/etc/cron.d/' + n); if (f && f.t === 'f' && /^[A-Za-z0-9_-]+$/.test(n)) out.push({ user: 'root', text: f.c, sys: true, src: '/etc/cron.d/' + n }); });
  return out;
}
LIN.runSandbox = function (sh, user, cmdline, env, wd, isUnit) {
  var sv = { vars: sh.vars, env: sh.env, cwd: sh.cwd, user: sh.user, funcs: sh.funcs, flags: sh.flags, forceRoot: sh.forceRoot, home: sh.home, hist: sh.hist.length, sdepth: sh.sdepth, pos: sh.pos };
  var home = user === 'root' ? '/root' : '/home/' + user;
  sh.vars = {}; sh.env = Object.assign({ HOME: home, LOGNAME: user, USER: user, SHELL: '/bin/sh', PATH: '/usr/bin:/bin' }, env || {}); sh.cwd = wd || home; sh.user = user; sh.forceRoot = user === 'root'; sh.funcs = {}; sh.flags = {}; sh.pos = [];
  var out = '', code = 0;
  var guard = { err: null };
  try {
    var miss = missingCmd(sh, cmdline);
    if (miss) { out = '/bin/sh: 1: ' + miss + ': not found\n'; code = 127; var rd = />>?\s*(\S+)\s*(2>&1)?\s*$/.exec(cmdline); if (rd && rd[2]) { var tp = rd[1].charAt(0) === '/' ? rd[1] : sh.cwd + '/' + rd[1]; var ex0 = sh.fs.get(tp); sh.fs.put(tp, (ex0 ? ex0.c : '') + out, { owner: user }); out = ''; } else { var rw = /(^|[^>])>\s*(\S+)\s*$/.exec(cmdline); if (rw) { var tw = rw[2].charAt(0) === '/' ? rw[2] : sh.cwd + '/' + rw[2]; sh.fs.put(tw, '', { owner: user }); out = ''; } } }
    else { var r = sh.runScriptText(cmdline, 'sh', [], {}); out = r.out; code = r.code; }
  } finally { sh.vars = sv.vars; sh.env = sv.env; sh.cwd = sv.cwd; sh.user = sv.user; sh.forceRoot = sv.forceRoot; sh.funcs = sv.funcs; sh.flags = sv.flags; sh.pos = sv.pos; sh.hist.length = sv.hist; }
  return { out: out, code: code };
};
function missingCmd(sh, cmdline) {
  var local = L(sh).cronLocal || [], segs = cmdline.split(/&&|\|\||[;|]/), i;
  for (i = 0; i < segs.length; i++) {
    var w = segs[i].trim().split(/\s+/)[0]; if (!w) continue;
    w = w.replace(/^[A-Za-z_]\w*=\S*/, '');
    if (w && local.indexOf(w) >= 0) return w;
  }
  return null;
}
function runCron(sh, src, e, d) {
  var l = L(sh), user = e.user || src.user, cmd = e.cmd, pid = nextPid(sh), stdin = '';
  syslog(sh, 'CRON[' + pid + ']: (' + user + ') CMD (' + cmd + ')');
  // dấu % chưa thoát: phần sau thành stdin, lệnh bị cắt
  var pi = -1, k; for (k = 0; k < cmd.length; k++) { if (cmd.charAt(k) === '\\') { k++; continue; } if (cmd.charAt(k) === '%') { pi = k; break; } }
  if (pi >= 0) {
    var head = cmd.slice(0, pi), open = (head.match(/\$\(/g) || []).length > (head.match(/\)/g) || []).length;
    if (open) { syslog(sh, 'CRON[' + pid + ']: (' + user + ') CMDERR (/bin/sh: 1: Syntax error: end of file unexpected (expecting ")"))'); l.cronRuns.push({ t: l.now, user: user, cmd: cmd, code: 2 }); return; }
    stdin = cmd.slice(pi + 1).replace(/%/g, '\n'); cmd = head;
  }
  cmd = cmd.replace(/\\%/g, '%');
  var env = Object.assign({}, src.envs || {});
  var r = LIN.runSandbox(sh, user, cmd, env, null, false);
  if (r.code === 127 && /not found/.test(r.out)) syslog(sh, 'CRON[' + pid + ']: (' + user + ') CMDOUT (' + r.out.trim() + ')');
  else if (r.out.trim() && !/>\s*\S/.test(cmd)) syslog(sh, 'CRON[' + pid + ']: (CRON) info (No MTA installed, discarding output)');
  else if (r.out.trim()) syslog(sh, 'CRON[' + pid + ']: (' + user + ') CMDOUT (' + r.out.trim().split('\n')[0] + ')');
  l.cronRuns.push({ t: l.now, user: user, cmd: cmd, code: r.code });
}
function cronTick(sh, minuteMs) {
  var l = L(sh), d = loc(minuteMs);
  cronSources(sh).forEach(function (src) {
    var env = {};
    String(src.text || '').split('\n').forEach(function (ln) {
      var e = parseCronLine(ln, src.sys);
      if (e.env) { env[e.env[0]] = e.env[1]; return; }
      if (e.skip || e.err || e.reboot) return;
      src.envs = env;
      if (cronDue(e, d)) runCron(sh, src, e, d);
    });
  });
}
LIN.advance = function (sh, secs, c) {
  var l = L(sh), end = l.now + secs * 1000, t = l.now;
  var first = Math.floor(t / 60000) * 60000 + 60000;
  for (var m = first; m <= end; m += 60000) {
    l.now = m; cronTick(sh, m);
    allUnitNames(sh).forEach(function (n) { var u = ensureUnit(sh, n); if (!u || u.kind !== 'timer' || u.active !== 'active') return; var ti = timerInfo(sh, u); if (ti && ti.next <= m) { var tgt = ensureUnit(sh, g1(u.cfg, 'Timer', 'Unit') || n.replace(/\.timer$/, '.service')); u.lastRun = m; if (tgt) { log(sh, 'systemd', 'Started ' + n + ' trigger'); startUnit(sh, tgt); } } });
  }
  l.now = end;
  // vòng khởi động lại
  Object.keys(l.units).forEach(function (n) {
    var u = l.units[n]; if (u.active !== 'activating' || u.sub !== 'auto-restart') return;
    var guard = 0;
    while (u.active === 'activating' && guard++ < Math.max(1, Math.floor(secs / 0.1 > 6 ? 6 : secs / 0.1)) && u.restarts < 5) { LIN.advanceRestart(sh, u); }
    if (u.active === 'activating' && u.restarts >= 5) { u.active = 'failed'; u.sub = 'failed'; u.result = 'start-limit-hit'; u.since = l.now; log(sh, 'systemd', u.name + ': Start request repeated too quickly.', 1, 3); log(sh, 'systemd', u.name + ': Failed with result \'start-limit-hit\'.', 1, 3); log(sh, 'systemd', 'Failed to start ' + u.name + '.', 1, 3); }
  });
  // thời gian CPU của tiến trình
  l.procs.forEach(function (p) { p.cputime += p.cpu > 5 ? Math.round(secs * p.cpu / 100) : 0; });
};

/* ---------- systemctl ---------- */
var prevSystemctl = cmds.systemctl;
function needRoot(sh, c, act, name) { if (!sh.isRoot(c)) throw new CmdErr('Failed to ' + act + ' ' + name + ': Interactive authentication required.\nSee system logs and \'systemctl status ' + name + '\' for details.', 1); }
cmds.systemctl = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevSystemctl(a, c);
  hookWrite(sh);
  var pvals = []; a = a.filter(function (x, i) { if (a[i - 1] === '-p' || a[i - 1] === '--property') { pvals.push(x); return false; } return true; });
  var flags = a.filter(function (x) { return x.charAt(0) === '-'; }), pos = a.filter(function (x) { return x.charAt(0) !== '-'; }), sub = pos[0], names = pos.slice(1);
  var now = flags.indexOf('--now') >= 0, l = L(sh);
  if (!sub) sub = 'list-units';
  if (sub === 'daemon-reload') { needRoot(sh, c, 'reload', 'daemon'); Object.keys(l.units).forEach(function (n) { var u = l.units[n]; if (sh.fs.get(u.file) || sh.fs.get(unitPath(n))) { u.file = sh.fs.get(unitPath(n)) ? unitPath(n) : u.file; loadUnit(sh, u); } }); return 0; }
  if (sub === 'list-units' || sub === 'list-unit-files' || sub === 'list-timers') return listCmd(sh, c, sub, flags);
  if (sub === 'reboot') { needRoot(sh, c, 'reboot', 'system'); LIN.reboot(sh, c); return 0; }
  if (!names.length) { if (/^(start|stop|restart|reload|status|enable|disable|mask|unmask|is-active|is-enabled|is-failed|cat|show|reset-failed)$/.test(sub)) throw new CmdErr('Too few arguments.', 1); return prevSystemctl(a, c); }
  var rc = 0;
  names.forEach(function (raw) {
    var name = normName(raw);
    if (isStaticUnit(sh, name) || (!ensureUnit(sh, name) && BUILTIN[name])) { var r0 = prevSystemctl([sub].concat(flags, [raw]), c); if (r0) rc = r0; return; }
    var u = ensureUnit(sh, name);
    if (!u) {
      if (sub === 'is-active' || sub === 'is-failed') { c.out('inactive\n'); rc = sub === 'is-active' ? 3 : 1; return; }
      if (sub === 'is-enabled') { c.err('Failed to get unit file state for ' + name + ': No such file or directory\n'); rc = 1; return; }
      if (sub === 'status') { c.err('Unit ' + name + ' could not be found.\n'); rc = 4; return; }
      c.err((sub === 'enable' || sub === 'disable' ? 'Failed to ' + sub + ' unit: Unit file ' + name + ' does not exist.' : 'Failed to ' + sub + ' ' + name + ': Unit ' + name + ' not found.') + '\n'); rc = 1; return;
    }
    var warn = u.dirty && /^(start|restart|reload|stop|status)$/.test(sub);
    if (warn) c.err('Warning: The unit file, source configuration file or drop-ins of ' + name + ' changed on disk. Run \'systemctl daemon-reload\' to reload units.\n');
    switch (sub) {
      case 'status': c.out(statusText(sh, u)); if (u.active !== 'active') rc = u.active === 'failed' || u.active === 'activating' ? 3 : 3; break;
      case 'is-active': c.out(u.active + '\n'); if (u.active !== 'active') rc = 3; break;
      case 'is-failed': c.out(u.active === 'failed' ? 'failed\n' : u.active + '\n'); if (u.active !== 'failed') rc = 1; break;
      case 'is-enabled': { var en = enabledOf(sh, u); c.out(en + '\n'); if (en !== 'enabled' && en !== 'static') rc = 1; break; }
      case 'cat': { var f = sh.fs.get(u.file); c.out('# ' + u.file + '\n' + (f ? f.c : '') + (f && f.c.slice(-1) !== '\n' ? '\n' : '')); break; }
      case 'show': {
        var props = {}, pi = flags.indexOf('-p'); var want = pi >= 0 ? null : null;
        var allf = a.join(' '), pm = /--property=(\S+)/.exec(allf), wl = pvals.length ? pvals.join(',').split(',') : (pm ? pm[1].split(',') : null);
        var envp = envOf(sh, u.cfg);
        var vals = { Id: u.name, Description: g1(u.cfg, 'Unit', 'Description') || '', LoadState: u.badLoad ? 'bad-setting' : 'loaded', ActiveState: u.active, SubState: u.sub, MainPID: u.pid || 0, Restart: g1(u.cfg, 'Service', 'Restart') || 'no', RestartUSec: (g1(u.cfg, 'Service', 'RestartSec') || '100ms'), User: g1(u.cfg, 'Service', 'User') || '', WorkingDirectory: g1(u.cfg, 'Service', 'WorkingDirectory') || '', UnitFileState: enabledOf(sh, u), Type: g1(u.cfg, 'Service', 'Type') || 'simple', ExecStart: g1(u.cfg, 'Service', 'ExecStart') || '', NRestarts: u.restarts || 0, Result: u.result, FragmentPath: u.file, EnvironmentFiles: (u.cfg.Service && u.cfg.Service.EnvironmentFile || []).join(' '), Environment: (u.cfg.Service && u.cfg.Service.Environment || []).join(' ') };
        Object.keys(vals).forEach(function (k) { if (!wl || wl.indexOf(k) >= 0) c.out(k + '=' + vals[k] + '\n'); });
        break;
      }
      case 'start': case 'restart': case 'reload': case 'try-restart': case 'reload-or-restart': {
        needRoot(sh, c, sub, name);
        if (u.masked) { c.err('Failed to ' + sub + ' ' + name + ': Unit ' + name + ' is masked.\n'); rc = 1; break; }
        if (u.kind === 'timer') { u.active = 'active'; u.sub = 'waiting'; u.since = l.now; u.lastRun = l.now; log(sh, 'systemd', 'Started ' + name + '.'); break; }
        if (sub === 'reload' && u.active !== 'active') { c.err('Failed to reload ' + name + ': Job type reload is not applicable for unit ' + name + '.\n'); rc = 1; break; }
        if (sub === 'reload') { var pr = l.procs.filter(function (p) { return p.unit === name; })[0]; if (!g1(u.cfg, 'Service', 'ExecReload')) { c.err('Failed to reload ' + name + ': Job type reload is not applicable for unit ' + name + '.\n'); rc = 1; } else { log(sh, 'systemd', 'Reloading ' + name + '.'); } break; }
        if (u.active === 'active' && sub === 'start') break;
        if (u.active === 'active') stopUnit(sh, u);
        if (u.dirty) loadUnit(sh, u);
        u.restarts = u.active === 'activating' ? u.restarts : 0;
        var ok = startUnit(sh, u, c);
        if (!ok) { c.err('Job for ' + name + ' failed because ' + (u.exit && u.exit.status === 'N/A' ? 'of an unavailable resource or another system error' : u.exit && u.exit.status ? 'the control process exited with error code' : 'of an invalid configuration') + '.\nSee "systemctl status ' + name + '" and "journalctl -xeu ' + name + '" for details.\n'); rc = 1; }
        break;
      }
      case 'stop': { needRoot(sh, c, 'stop', name); if (u.kind === 'timer') { u.active = 'inactive'; u.sub = 'dead'; break; } stopUnit(sh, u); break; }
      case 'enable': {
        needRoot(sh, c, 'enable', name);
        if (u.masked) { c.err('Failed to enable unit: Unit file ' + u.file + ' is masked.\n'); rc = 1; break; }
        var wb = g1(u.cfg, 'Install', 'WantedBy');
        if (!wb) { c.err('The unit files have no installation config (WantedBy=, RequiredBy=, Also=,\nAlias= settings in the [Install] section, and DefaultInstance= for template\nunits). This means they are not meant to be enabled or disabled using systemctl.\n'); break; }
        if (u.enabled !== 'enabled') { u.enabled = 'enabled'; var dir = '/etc/systemd/system/' + wb + '.wants'; sh.fs.mkdirp(dir, 'root'); sh.fs.put(dir + '/' + name, '# liên kết tới ' + u.file + '\n', { owner: 'root' }); c.out('Created symlink ' + dir + '/' + name + ' → ' + u.file + '.\n'); }
        if (now) { if (u.kind === 'timer') { u.active = 'active'; u.sub = 'waiting'; u.since = l.now; u.lastRun = l.now; } else if (u.active !== 'active') { if (!startUnit(sh, u, c)) rc = 1; } }
        break;
      }
      case 'disable': {
        needRoot(sh, c, 'disable', name);
        if (u.enabled === 'enabled') { var wb2 = g1(u.cfg, 'Install', 'WantedBy'), dir2 = '/etc/systemd/system/' + wb2 + '.wants'; u.enabled = 'disabled'; sh.fs.rm(dir2 + '/' + name); c.out('Removed ' + dir2 + '/' + name + '.\n'); }
        if (now) { if (u.kind === 'timer') { u.active = 'inactive'; u.sub = 'dead'; } else stopUnit(sh, u); }
        break;
      }
      case 'mask': { needRoot(sh, c, 'mask', name); if (u.active === 'active') stopUnit(sh, u); u.masked = true; c.out('Created symlink /etc/systemd/system/' + name + ' → /dev/null.\n'); break; }
      case 'unmask': { needRoot(sh, c, 'unmask', name); if (u.masked) { u.masked = false; c.out('Removed /etc/systemd/system/' + name + '.\n'); } break; }
      case 'reset-failed': { needRoot(sh, c, 'reset-failed', name); if (u.active === 'failed') { u.active = 'inactive'; u.sub = 'dead'; u.restarts = 0; u.result = 'success'; } break; }
      default: { var r1 = prevSystemctl([sub].concat(flags, [raw]), c); if (r1) rc = r1; }
    }
  });
  return rc;
};
function listCmd(sh, c, sub, flags) {
  var l = L(sh), names = allUnitNames(sh), out = '', fl = flags.join(' ');
  var failedOnly = /--failed/.test(fl) || /--state=failed/.test(fl), allOpt = /--all|-a\b/.test(fl), type = (/--type=(\w+)/.exec(fl) || [])[1] || (sub === 'list-timers' ? 'timer' : null);
  if (sub === 'list-timers') {
    var rows = [];
    names.forEach(function (n) { var u = ensureUnit(sh, n); if (!u || u.kind !== 'timer') return; if (u.active !== 'active' && !allOpt) return; var ti = timerInfo(sh, u); rows.push([ti && u.active === 'active' ? fullTs(ti.next) : '-', ti && u.active === 'active' ? untilStr(ti.next - l.now) + ' left' : '-', u.lastRun ? fullTs(u.lastRun) : '-', u.lastRun ? ago(u.lastRun, l.now) : '-', n, g1(u.cfg, 'Timer', 'Unit') || n.replace(/\.timer$/, '.service')]); });
    rows.push([fullTs(l.now + 5 * 3600000), '5h left', fullTs(l.now - 19 * 3600000), '19h ago', 'apt-daily.timer', 'apt-daily.service']);
    out = pad('NEXT', 31) + pad('LEFT', 14) + pad('LAST', 31) + pad('PASSED', 12) + pad('UNIT', 22) + 'ACTIVATES\n' + rows.map(function (r) { return pad(r[0], 31) + pad(r[1], 14) + pad(r[2], 31) + pad(r[3], 12) + pad(r[4], 22) + r[5]; }).join('\n') + '\n\n' + rows.length + ' timers listed.\n';
    c.out(out); return 0;
  }
  if (sub === 'list-unit-files') {
    out = 'UNIT FILE                              STATE    PRESET\n';
    ['cron.service', 'nginx.service', 'ssh.service', 'ufw.service', 'docker.service'].forEach(function (n) { out += pad(n, 38) + ' enabled  enabled\n'; });
    names.forEach(function (n) { var u = ensureUnit(sh, n); if (u && (!type || type === u.kind)) out += pad(n, 38) + ' ' + pad(enabledOf(sh, u), 8) + ' enabled\n'; });
    c.out(out + '\n'); return 0;
  }
  out = pad('  UNIT', 40) + pad('LOAD', 8) + pad('ACTIVE', 11) + pad('SUB', 9) + 'DESCRIPTION\n';
  var n2 = 0;
  var builtin = [['cron.service', 'Regular background program processing daemon', true], ['nginx.service', 'A high performance web server and a reverse proxy server', sh.W.nginx ? sh.W.nginx.active : true], ['ssh.service', 'OpenBSD Secure Shell server', sh.W.svc ? sh.W.svc.ssh !== false : true], ['systemd-journald.service', 'Journal Service', true]];
  if (!failedOnly && (!type || type === 'service')) builtin.forEach(function (b) { out += pad((b[2] ? '  ' : '  ') + b[0], 40) + pad('loaded', 8) + pad(b[2] ? 'active' : 'inactive', 11) + pad(b[2] ? 'running' : 'dead', 9) + b[1] + '\n'; n2++; });
  names.forEach(function (n) {
    var u = ensureUnit(sh, n); if (!u || (type && type !== u.kind)) return;
    if (failedOnly && u.active !== 'failed') return; if (!failedOnly && !allOpt && u.active === 'inactive') return;
    out += pad((u.active === 'failed' ? '● ' : '  ') + n, 40) + pad('loaded', 8) + pad(u.active, 11) + pad(u.sub, 9) + (g1(u.cfg, 'Unit', 'Description') || '') + '\n'; n2++;
  });
  c.out(out + '\nLOAD   = Reflects whether the unit definition was properly loaded.\nACTIVE = The high-level unit activation state, i.e. generalization of SUB.\nSUB    = The low-level unit activation state, values depend on unit type.\n\n' + n2 + ' loaded units listed.' + (failedOnly ? '' : ' Pass --all to see loaded but inactive units, too.') + '\n'); return 0;
}
cmds['systemd-analyze'] = function (a, c) {
  var sh = c.sh, sub = a[0];
  if (sub === 'verify') {
    var rc = 0;
    a.slice(1).filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (f) {
      var p = sh.abs(f), n = sh.fs.get(p);
      if (!n) { c.err('Failed to load ' + f + ': No such file or directory\n'); rc = 1; return; }
      var cfg = parseUnit(n.c), base = p.replace(/^.*\//, '');
      cfg._warn.forEach(function (w) { c.err(p + ': ' + w + '\n'); });
      if (/\.service$/.test(base)) {
        if (!cfg._sections.Service) { c.err(p + ': Unit has no [Service] section? Refusing.\n'.replace('? ', ' ')); rc = 1; }
        else {
          var es = (cfg.Service.ExecStart || [])[0];
          if (!es) { c.err(base + ': Service has no ExecStart=, ExecStop=, or SuccessAction=. Refusing.\n'); rc = 1; }
          else {
            var bin = es.replace(/^[-@+!:]+/, '').split(/\s+/)[0], bn = sh.fs.get(bin);
            if (bin.charAt(0) !== '/') { c.err(base + ': Neither a valid executable name nor an absolute path: ' + bin + '\n'); rc = 1; }
            else if (!bn) { c.err(base + ': Command ' + bin + ' is not executable: No such file or directory\n'); rc = 1; }
            else if (!(bn.mode & 73)) { c.err(base + ': Command ' + bin + ' is not executable: Permission denied\n'); rc = 1; }
          }
          if (!cfg._sections.Install) c.err('');
        }
      }
    });
    return rc;
  }
  if (sub === 'calendar') {
    var ex = a.slice(1).join(' '), nx = calNext(ex, L(sh).now);
    if (!nx) { c.err("Failed to parse calendar specification '" + ex + "': Invalid argument\n"); return 1; }
    var d = loc(nx);
    c.out('  Original form: ' + ex + '\nNormalized form: ' + ex + '\n    Next elapse: ' + fullTs(nx) + '\n       (in UTC): ' + DAYS[new Date(nx).getUTCDay()] + ' ' + new Date(nx).toISOString().slice(0, 10) + ' ' + new Date(nx).toISOString().slice(11, 19) + ' UTC\n       From now: ' + untilStr(nx - L(sh).now) + ' left\n'); return 0;
  }
  if (sub === 'blame') { c.out('1.912s cloud-init.service\n1.204s snapd.service\n 702ms docker.service\n 418ms postgresql@16-main.service\n 233ms nginx.service\n'); return 0; }
  c.out('Startup finished in 3.1s (kernel) + 9.4s (userspace) = 12.5s\ngraphical.target reached after 9.2s in userspace.\n'); return 0;
};
LIN.reboot = function (sh, c) {
  var l = L(sh);
  l.procs = l.procs.filter(function (p) { return p.base; });
  Object.keys(l.units).forEach(function (n) { var u = l.units[n]; if (u.kind === 'service') { u.active = 'inactive'; u.sub = 'dead'; u.pid = 0; } if (u.kind === 'timer') { u.active = 'inactive'; u.sub = 'dead'; } });
  l.tmux = []; l.jobN = 0; l.now += 95000; l.boot = l.now - 15000; l.jr.push({ t: l.boot, unit: 'systemd', id: 'systemd', pid: 1, msg: '-- Boot --', pri: 6 });
  allUnitNames(sh).forEach(function (n) { var u = ensureUnit(sh, n); if (!u || u.masked) return; loadUnit(sh, u); if (enabledOf(sh, u) === 'enabled') { if (u.kind === 'timer') { u.active = 'active'; u.sub = 'waiting'; u.since = l.now; u.lastRun = l.now; } else startUnit(sh, u); } });
  cronSources(sh).forEach(function (src) { String(src.text).split('\n').forEach(function (ln) { var e = parseCronLine(ln, src.sys); if (e.reboot) { var pid = nextPid(sh); syslog(sh, 'CRON[' + pid + ']: (' + (src.user) + ') CMD (' + e.cmd + ')'); } }); });
  c.out('Connection to ' + V.IP + ' closed by remote host.\n(mô phỏng: VPS khởi động lại sau khoảng 95 giây và bạn đăng nhập lại; uptime tính từ 0)\n');
};
cmds.reboot = function (a, c) { var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: reboot: command not found', 127); if (!sh.isRoot(c)) throw new CmdErr('Failed to reboot system via logind: Interactive authentication required.', 1); LIN.reboot(sh, c); return 0; };
cmds.shutdown = function (a, c) { var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: shutdown: command not found', 127); if (!sh.isRoot(c)) throw new CmdErr('Failed to set wall message, ignoring: Interactive authentication required.\nCall to ScheduleShutdown failed: Interactive authentication required.', 1); if (a.indexOf('-r') >= 0) { LIN.reboot(sh, c); return 0; } c.out('Mô phỏng: shutdown -h sẽ tắt VPS và bạn mất kết nối. Dùng shutdown -r now để khởi động lại.\n'); return 0; };

/* ---------- journalctl ---------- */
var prevJournal = cmds.journalctl;
function parseSince(s, now) {
  s = String(s).trim().replace(/^"|"$/g, '');
  var m;
  if (s === 'today') { var d = loc(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TZ; }
  if (s === 'yesterday') { var y = loc(now); return Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate() - 1) - TZ; }
  if ((m = /^(\d+)\s*(second|sec|minute|min|hour|day)s?\s+ago$/.exec(s))) return now - +m[1] * ({ second: 1, sec: 1, minute: 60, min: 60, hour: 3600, day: 86400 })[m[2]] * 1000;
  if ((m = /^(\d{4})-(\d\d)-(\d\d)(?:\s+(\d\d):(\d\d)(?::(\d\d))?)?$/.exec(s))) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - TZ;
  return null;
}
cmds.journalctl = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevJournal(a, c);
  var l = L(sh), i, unit = null, n = null, since = null, until = null, prio = null, grep = null, rev = false, kern = false, boot = false, follow = false, disk = false, noh = false;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-u' || x === '--unit') unit = a[++i]; else if (/^--unit=/.test(x)) unit = x.slice(7);
    else if (x === '-n' || x === '--lines') n = parseInt(a[++i], 10); else if (/^-n\d+$/.test(x)) n = +x.slice(2); else if (/^--lines=/.test(x)) n = +x.slice(8);
    else if (x === '--since' || x === '-S') since = a[++i]; else if (/^--since=/.test(x)) since = x.slice(8);
    else if (x === '--until' || x === '-U') until = a[++i]; else if (/^--until=/.test(x)) until = x.slice(8);
    else if (x === '-p' || x === '--priority') prio = a[++i]; else if (/^--priority=/.test(x)) prio = x.slice(11);
    else if (x === '-g' || x === '--grep') grep = a[++i]; else if (x === '-r' || x === '--reverse') rev = true; else if (x === '-k' || x === '--dmesg') kern = true;
    else if (x === '-b' || x === '--boot') boot = true; else if (x === '-f' || x === '--follow') follow = true; else if (x === '--disk-usage') disk = true; else if (x === '--no-pager') noh = true;
  }
  if (disk) { c.out('Archived and active journals take up 48.0M in the file system.\n'); return 0; }
  if (kern) { c.out('-- No entries --\n'); return 0; }
  var uname = unit ? normName(unit) : null;
  if (uname && !l.units[uname] && !ensureUnit(sh, uname)) return prevJournal(a, c);
  var pmax = null; if (prio) { var pm = { emerg: 0, alert: 1, crit: 2, err: 3, warning: 4, notice: 5, info: 6, debug: 7 }; pmax = pm[prio] != null ? pm[prio] : parseInt(prio, 10); }
  var sinceMs = since ? parseSince(since, l.now) : null, untilMs = until ? parseSince(until, l.now) : null;
  if (since && sinceMs == null) { c.err('Failed to parse timestamp: ' + since + '\n'); return 1; }
  var rows = l.jr.filter(function (j) {
    if (uname && !(j.unit === uname || j.unit === uname.replace(/\.service$/, '') || (j.unit === 'systemd' && j.msg.indexOf(uname) >= 0))) return false;
    if (pmax != null && j.pri > pmax) return false; if (sinceMs != null && j.t < sinceMs) return false; if (untilMs != null && j.t > untilMs) return false;
    if (boot && j.t < l.boot) return false;
    if (grep && !new RegExp(grep).test(j.msg)) return false; return true;
  });
  if (n == null && follow) n = 10;
  if (n != null) rows = rows.slice(-n);
  if (rev) rows = rows.slice().reverse();
  if (!sh.isRoot(c) && !rows.length && !uname) { c.out('Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n      Pass -q to turn off this notice.\nNo journal files were opened due to insufficient permissions.\n'); return 0; }
  if (!rows.length) { c.out('-- No entries --\n'); return 0; }
  c.out((boot || !uname ? '' : '') + rows.map(jline).join('\n') + '\n'); return 0;
};

/* ---------- crontab ---------- */
var prevCrontab = cmds.crontab;
cmds.crontab = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevCrontab(a, c);
  var l = L(sh), user = sh.user, i, file = null, mode = 'install';
  for (i = 0; i < a.length; i++) {
    if (a[i] === '-u') { user = a[++i]; if (user !== sh.user && !sh.isRoot(c)) throw new CmdErr('must be privileged to use -u', 1); }
    else if (a[i] === '-l') mode = 'list'; else if (a[i] === '-r') mode = 'remove'; else if (a[i] === '-e') mode = 'edit'; else if (a[i].charAt(0) !== '-') file = a[i];
  }
  if (sh.isRoot(c) && !/-u/.test(a.join(' ')) && sh.user !== 'root') user = 'root';
  if (mode === 'edit') { c.out('crontab: mô phỏng không mở được trình soạn thảo. Cách làm tương đương:\n  crontab -l > cron.txt   (xuất ra file)\n  nano cron.txt hoặc echo "..." >> cron.txt\n  crontab cron.txt        (nạp lại)\n'); return 1; }
  if (mode === 'list') { if (l.cron[user] == null) { c.err('no crontab for ' + user + '\n'); return 1; } c.out(l.cron[user]); return 0; }
  if (mode === 'remove') { delete l.cron[user]; syslog(sh, 'crontab[' + nextPid(sh) + ']: (' + user + ') DELETE (' + user + ')'); return 0; }
  var text = file && file !== '-' ? sh.readFile(sh.abs(file), c, 'crontab') : c.stdin;
  if (text == null || (!file && !c.stdin)) throw new CmdErr('crontab: usage error: file name or - (for stdin) must be specified', 1);
  var lines = String(text).split('\n'), bad = null;
  lines.forEach(function (ln, k) { if (bad) return; var e = parseCronLine(ln, false); if (e.err) bad = '"' + (file || 'stdin') + '":' + (k + 1) + ': ' + e.err; });
  if (bad) { c.err('crontab: installing new crontab\n' + bad + '\nerrors in crontab file, can\'t install.\nDo you want to retry the same edit? (y/n) n\n'.replace('Do you want to retry the same edit? (y/n) n\n', '')); return 1; }
  if (text && text.slice(-1) !== '\n') { c.err('crontab: installing new crontab\n"' + (file || 'stdin') + '":' + lines.length + ': missing newline before EOF. Installing anyway.\n'); text += '\n'; }
  l.cron[user] = text; syslog(sh, 'crontab[' + nextPid(sh) + ']: (' + user + ') REPLACE (' + user + ')');
  return 0;
};

/* ---------- dựng thế giới ---------- */
LIN.newWorld = function (o) {
  o = o || {};
  var now = Date.UTC(2026, 9, 27, 3, 20, 0);
  return { now: now, boot: now - (2 * 86400 + 5 * 3600 + 14 * 60) * 1000, nextPid: 2200, procs: [], units: {}, jr: [], cron: {}, cronRuns: [], jobN: 0, memMB: 1962, memBase: 560, cacheMB: 640, swaps: [], cronLocal: ['node', 'npm', 'pm2'], appReq: [], appPort: 8888, ownSS: true, tmux: [] };
};
LIN.base = function (s, o) {
  o = o || {};
  var W = s.W, f = s.fs, u = s.user;
  W.lin = LIN.newWorld(o);
  var l = W.lin;
  hookWrite(s);
  if (V.sec) { var S = V.sec.S(W); if (!S.users.tutor) { S.users.tutor = { uid: 1001, sudo: false, locked: false, groups: [] }; S.nextUid = Math.max(S.nextUid || 1002, 1002); } V.sec.sync(s); }
  ['/etc/systemd/system', '/lib/systemd/system', '/etc/cron.d', '/etc/cron.daily', '/var/log', '/usr/local/bin', '/usr/bin', '/bin', '/var/backups'].forEach(function (d) { f.mkdirp(d, 'root'); });
  f.mkdirp('/srv/tutor', 'tutor', 493); f.mkdirp('/srv/tutor/dist', 'tutor', 493); f.mkdirp('/var/lib/tutor', 'tutor', 493); f.mkdirp('/home/tutor', 'tutor', 493);
  f.put('/usr/bin/node', 'ELF node v22.11.0', { owner: 'root', mode: 493 });
  ['/usr/bin/sleep', '/usr/bin/yes', '/usr/bin/tail', '/usr/bin/bash', '/bin/bash'].forEach(function (p) { f.put(p, 'ELF', { owner: 'root', mode: 493 }); });
  f.put('/usr/local/bin/pm2', 'node script', { owner: 'root', mode: 493 });
  f.put('/srv/tutor/dist/main.js', "const { NestFactory } = require('@nestjs/core');\n// (nội dung build NestJS, lắng nghe cổng 8888)\n", { owner: 'tutor', mode: 420 });
  f.put('/srv/tutor/.env', 'PORT=8888\nDATABASE_URL=postgres://app:secret@127.0.0.1:5432/tutor_db\nNODE_ENV=production\n', { owner: 'tutor', mode: 384 });
  f.put('/var/log/syslog', sysTs(l.now - 3600000) + ' vps systemd[1]: Started Daily apt download activities.\n', { owner: 'root', mode: 416 });
  f.put('/etc/crontab', ['SHELL=/bin/sh', 'PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin', '', '# m h dom mon dow user  command', '17 *\t* * *\troot    cd / && run-parts --report /etc/cron.hourly', '25 6\t* * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }', ''].join('\n'), { owner: 'root', mode: 420 });
  var P = { user: 'root', base: true };
  function bp(o2) { var p = addProc(s, Object.assign({}, P, o2)); p.start = l.boot; return p; }
  var init = bp({ pid: 1, cmd: '/sbin/init', name: 'systemd', ppid: 0, rss: 11800, vsz: 167700, mem: 0.6 });
  bp({ pid: 412, cmd: '/lib/systemd/systemd-journald', name: 'systemd-journal', rss: 21000, vsz: 55000, mem: 1.0, stat: 'Ss' });
  bp({ pid: 640, cmd: '/usr/sbin/cron -f -P', name: 'cron', rss: 3100, vsz: 8500, mem: 0.1, unit: 'cron.service' });
  f.put('/lib/systemd/system/cron.service', '[Unit]\nDescription=Regular background program processing daemon\n\n[Service]\nExecStart=/usr/sbin/cron -f -P\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n', { owner: 'root', mode: 420 });
  f.put('/usr/sbin/cron', 'ELF', { owner: 'root', mode: 493 });
  bp({ pid: 812, cmd: '/usr/sbin/sshd -D', name: 'sshd', rss: 7300, vsz: 15400, mem: 0.3, port: 22, bind: '0.0.0.0' });
  bp({ pid: 905, cmd: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', name: 'nginx', rss: 11200, vsz: 55500, mem: 0.5, port: 80, bind: '0.0.0.0', hup: 'reload' });
  bp({ pid: 906, user: 'www-data', cmd: 'nginx: worker process', name: 'nginx', ppid: 905, rss: 5100, vsz: 56000, mem: 0.2 });
  bp({ pid: 907, user: 'www-data', cmd: 'nginx: worker process', name: 'nginx', ppid: 905, rss: 5100, vsz: 56000, mem: 0.2 });
  bp({ pid: 1010, user: 'postgres', cmd: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main', name: 'postgres', rss: 42000, vsz: 220000, mem: 2.1, port: 5432, bind: '127.0.0.1', hup: 'reload' });
  var sess = bp({ pid: 2100, user: 'root', cmd: 'sshd: ' + u + ' [priv]', name: 'sshd', ppid: 812, rss: 8100, vsz: 17000, mem: 0.4, tty: '?', start: l.now - 600000 });
  s.sessionPid = 2188;
  bp({ pid: 2188, user: u, cmd: '-bash', name: 'bash', ppid: 2100, rss: 5200, vsz: 8700, mem: 0.2, stat: 'Ss', tty: 'pts/0', start: l.now - 600000, session: u });
  if (o.runaway) { var r = bp({ pid: 3150, user: u, cmd: 'yes', name: 'yes', ppid: 2188, rss: 1900, vsz: 7500, mem: 0.1, cpu: 99.0, stat: 'R', tty: 'pts/1', start: l.now - 3 * 3600000, cputime: 10600 }); }
  var cu = ensureUnit(s, 'cron.service'); cu.active = 'active'; cu.sub = 'running'; cu.enabled = 'enabled'; cu.pid = 640; cu.since = l.boot;
  l.jr.push({ t: l.boot, unit: 'systemd', id: 'systemd', pid: 1, msg: '-- Boot --', pri: 6 });
  if (o.setup) o.setup(s, l);
  s.cwd = s.home; s.hist.length = 0;
};
LIN.addUnitFile = function (sh, name, text, o) { sh.fs.put('/etc/systemd/system/' + name, text, { owner: 'root', mode: 420 }); };
GATED.forEach(function (n) {
  var mine = cmds[n]; if (!mine || mine === P0[n]) return;
  cmds[n] = function (a, c) { if (!on(c.sh) && P0[n]) return P0[n](a, c); return mine(a, c); };
});
B.jobs = (function (mine) { return function (a, c) { if (!on(c.sh) && PJOBS) return PJOBS(a, c); return mine(a, c); }; })(B.jobs);
LIN.log = log; LIN.syslog = syslog; LIN.ensureUnit = ensureUnit; LIN.startUnit = startUnit; LIN.attempt = attempt; LIN.listeners = listeners;
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
