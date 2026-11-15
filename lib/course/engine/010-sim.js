(function (G) {
'use strict';
/* eng-dock6: giám sát (events, info, log), userns, sidecar debug cho image distroless */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, pad = V.util.pad, DK = V.dk;
var prev = cmds.docker, prevPs = cmds.ps, prevSysctl = cmds.systemctl, prevTruncate = cmds.truncate, prevJournal = cmds.journalctl, prevDisk = V.dkDisk;
var LOGDIR = '/var/lib/docker/containers';

function hex(s, n) { s = String(s); var h = 2166136261 >>> 0, k; for (k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } var out = ''; for (k = 0; k < n; k++) { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; out += '0123456789abcdef'.charAt((h >>> 14) % 16); } return out; }
function hnum(s) { s = String(s); var h = 2166136261 >>> 0, k; for (k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } return h; }
function D6(W) { W.dk6 = W.dk6 || { userns: false, down: false, liveRestore: false, logDefault: null }; return W.dk6; }
function imgs(W) { return DK.imgs(W); }
function imgOf(W, ref) { var p = DK.split(ref || ''); return imgs(W).filter(function (x) { return x.repo === p[0] && x.tag === p[1]; })[0]; }
function kind(ct) { var n = (ct.name || '') + ' ' + (ct.image || ''); if (/postgres/.test(n)) return 'pg'; if (/redis/.test(n)) return 'redis'; if (/tutor-api|(^|\s)api-|(^|\s)tutor-api/.test(n)) return 'api'; return 'other'; }
function findCt(W, n) { return W.containers.filter(function (x) { return x.name === n || x.id === n || (n.length >= 4 && x.id.indexOf(n) === 0) || fullId(x).indexOf(n) === 0 && n.length >= 12; })[0]; }
function fullId(ct) { return ct.id + hex('f' + ct.id, 64 - ct.id.length); }
function pidOf(ct) { return 2000 + hnum(ct.id) % 30000; }
function txt(sh, p) { var n = sh.fs.get(p); return n && n.t === 'f' ? n.c : null; }

/* ---------- người dùng bên trong container và trên máy chủ ---------- */
function userSpec(W, ct) {
  var s = ct.svcCfg && ct.svcCfg.user != null ? String(ct.svcCfg.user) : (ct.runUser != null ? String(ct.runUser) : null);
  if (s == null) { var im = imgOf(W, ct.image); s = im && im.user ? String(im.user) : (kind(ct) === 'pg' || kind(ct) === 'redis' ? '999' : 'root'); }
  return s;
}
function uidOf(spec) { var u = String(spec).split(':')[0]; if (u === '' || u === 'root') return 0; if (/^\d+$/.test(u)) return +u; if (u === 'postgres' || u === 'redis') return 999; if (u === 'nonroot') return 65532; return 1000; }
function hostUser(W, uid) { if (D6(W).userns) return String(100000 + uid); return uid === 0 ? 'root' : uid === 1000 ? 'haidangphan' : String(uid); }
function cmdOf(ct) { var k = kind(ct); return k === 'api' ? 'node dist/main.js' : k === 'pg' ? 'postgres' : k === 'redis' ? 'redis-server *:6379' : (ct.cmd || 'sleep infinity'); }
function listenOf(ct) {
  var k = kind(ct); if (k === 'api') { var h = ct.env && ct.env.HOST; return [{ addr: h === '127.0.0.1' || h === 'localhost' ? '127.0.0.1' : '0.0.0.0', port: 8888, proc: 'node' }]; }
  if (k === 'pg') return [{ addr: '0.0.0.0', port: 5432, proc: 'postgres' }]; if (k === 'redis') return [{ addr: '0.0.0.0', port: 6379, proc: 'redis-server' }]; return [];
}
function appBody(W, ct, path) {
  var im = imgOf(W, ct.image);
  if (!/^\/(health|healthz|)?$/.test(path || '/')) return { status: 404, body: '{"statusCode":404,"message":"Cannot GET ' + path + '","error":"Not Found"}\n' };
  if (im && im.bug === 'health') return { status: 500, body: '{"statusCode":500,"message":"Internal server error"}\n' };
  var ver = (ct.env && ct.env.APP_VERSION) || DK.split(ct.image)[1];
  return { status: 200, body: '{"status":"ok","service":"tutor-api","version":"' + ver + '","container":"' + ct.name + '"}\n' };
}
function appFiles(ct, p) {
  var k = kind(ct); if (k !== 'api') return null;
  var m = { '/': ['app', 'bin', 'dev', 'etc', 'home', 'lib', 'proc', 'tmp', 'usr', 'var'], '/app': ['dist', 'node_modules', 'package.json', 'package-lock.json'], '/app/dist': ['main.js', 'app.module.js', 'config'] };
  return m[p.replace(/\/$/, '') || '/'] || null;
}

/* ---------- log của container: json-file, xoay vòng, kích thước ---------- */
function parseSize(s) { var m = /^(\d+(?:\.\d+)?)\s*([kKmMgG]?)/.exec(String(s || '')); if (!m) return 0; var n = +m[1], u = m[2].toLowerCase(); return u === 'g' ? n * 1024 : u === 'k' ? n / 1024 : n; }
function cfgFromOpts(o) { if (!o) return null; var opts = o.options || o['log-opts'] || o; var sz = opts['max-size'], fl = opts['max-file']; if (!sz && !fl && !o.driver && !o['log-driver']) return null; return { driver: o.driver || o['log-driver'] || 'json-file', size: sz || null, files: fl ? +fl : 1 }; }
function logCfg(W, ct) {
  if (ct.logCfg === undefined) {
    var c = (ct.svcCfg && ct.svcCfg.logging) ? cfgFromOpts(ct.svcCfg.logging) : null;
    if (!c && ct.runLog) c = cfgFromOpts(ct.runLog);
    if (!c) c = D6(W).logDefault;
    ct.logCfg = c || null;
  }
  return ct.logCfg;
}
function logMB(W, ct) {
  var raw = ct.logMB != null ? ct.logMB : 3 + (ct.logs || []).length * 0.002, c = logCfg(W, ct);
  if (c && c.driver === 'none') return 0;
  if (c && c.size) return Math.min(raw, parseSize(c.size) * (c.files || 1));
  return raw;
}
function logPath(ct) { var f = fullId(ct); return LOGDIR + '/' + f + '/' + f + '-json.log'; }
function syncLogs(sh) {
  var W = sh.W, fs = sh.fs; if (!W.dk4) return;
  var want = {};
  fs.mkdirp(LOGDIR, 'root', 456);
  W.containers.forEach(function (ct) {
    var p = logPath(ct), dir = LOGDIR + '/' + fullId(ct); want[fullId(ct)] = 1;
    fs.mkdirp(dir, 'root', 448);
    fs.put(p, '', { owner: 'root', mode: 416, size: Math.round(logMB(W, ct) * 1048576) });
  });
  fs.list(LOGDIR).forEach(function (nm) { if (!want[nm]) fs.rm(LOGDIR + '/' + nm); });
}
V.dkSync = syncLogs;
V.dkLogCfg = function (W, ct) { return logCfg(W, ct); };
V.dkLogMB = function (W, ct) { return logMB(W, ct); };
function logBytes(W) { var b = 0; if (!W.dk4) return 0; W.containers.forEach(function (ct) { b += logMB(W, ct) * 1048576; }); return b; }
V.dkDisk = function (sh) { var base = prevDisk ? prevDisk(sh) : 0; return base + Math.round(logBytes(sh.W)); };

cmds.truncate = function (a, c) {
  var rc = prevTruncate(a, c), W = c.sh.W;
  if (W.dk4) a.forEach(function (p) { var full = c.sh.abs(p); W.containers.forEach(function (ct) { if (logPath(ct) === full) ct.logMB = 0; }); syncLogs(c.sh); });
  return rc;
};

/* ---------- sự kiện ---------- */
function eventsOf(W) {
  var evs = [], T0 = Date.UTC(2026, 9, 27, 3, 30, 0);
  W.containers.forEach(function (ct, i) {
    var t = T0 + i * 7000, at = { image: ct.image, name: ct.name };
    evs.push({ t: t, type: 'container', action: 'create', ct: ct, at: at });
    evs.push({ t: t + 800, type: 'container', action: 'start', ct: ct, at: at });
    var bad = ct.state === 'restarting' || (ct.exitCode && ct.exitCode !== 0 && ct.state === 'exited'), code = ct.exitCode || 1;
    if (bad || ct.oomKilled) {
      for (var r = 0; r < 4; r++) {
        var tr = t + 40000 * (r + 1);
        if (ct.oomKilled) evs.push({ t: tr, type: 'container', action: 'oom', ct: ct, at: { image: ct.image, name: ct.name } });
        var at2 = { exitCode: String(ct.oomKilled ? 137 : code), image: ct.image, name: ct.name }; if (ct.oomKilled) at2.oomKilled = 'true';
        evs.push({ t: tr + 200, type: 'container', action: 'die', ct: ct, at: at2 });
        if (r < 3) evs.push({ t: tr + 900, type: 'container', action: 'start', ct: ct, at: at });
      }
    }
    if (ct.state === 'running') {
      if (/\(unhealthy\)/.test(ct.status || '')) evs.push({ t: t + 95000, type: 'container', action: 'health_status: unhealthy', ct: ct, at: at });
      else if (/\(healthy\)/.test(ct.status || '')) evs.push({ t: t + 35000, type: 'container', action: 'health_status: healthy', ct: ct, at: at });
    }
    if (ct.state === 'exited' && ct.manualStop) evs.push({ t: t + 30000, type: 'container', action: 'die', ct: ct, at: { exitCode: String(ct.exitCode || 0), image: ct.image, name: ct.name } });
  });
  evs.sort(function (a, b) { return a.t - b.t; });
  return evs;
}
function isoTs(t) { var d = new Date(t + 7 * 3600 * 1000); return d.toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000000') + '+07:00'; }
function dkEvents(c, rest) {
  var W = c.sh.W, hasSince = false, hasUntil = false, filters = [], fmt = null, i;
  for (i = 0; i < rest.length; i++) {
    var x = rest[i];
    if (x === '--since' || /^--since=/.test(x)) { hasSince = true; if (x === '--since') i++; } else if (x === '--until' || /^--until=/.test(x)) { hasUntil = true; if (x === '--until') i++; }
    else if (x === '--filter' || x === '-f') filters.push(rest[++i]); else if (/^--filter=/.test(x)) filters.push(x.slice(9)); else if (x === '--format') fmt = rest[++i]; else if (/^--format=/.test(x)) fmt = x.slice(9);
  }
  if (!hasSince && !hasUntil) { c.err('(không có --since nên chỉ in sự kiện MỚI từ lúc này; trong mô phỏng không có sự kiện nào xảy ra. Dùng --since 1h --until 0s để xem lịch sử.)\n'); return 0; }
  var fl = {}; filters.forEach(function (f) { var m = /^(\w+)=(.*)$/.exec(f); if (m) (fl[m[1]] = fl[m[1]] || []).push(m[2].replace(/^["']|["']$/g, '')); });
  var out = [];
  eventsOf(W).forEach(function (e) {
    if (fl.event && fl.event.indexOf(e.action) < 0) return;
    if (fl.type && fl.type.indexOf(e.type) < 0) return;
    if (fl.container && fl.container.indexOf(e.ct.name) < 0 && fl.container.indexOf(e.ct.id) < 0) return;
    if (fl.image && fl.image.indexOf(e.ct.image) < 0) return;
    var attrs = Object.keys(e.at).sort().map(function (k) { return k + '=' + e.at[k]; }).join(', ');
    if (fmt) out.push(fmt.replace(/\{\{\s*\.(\S+?)\s*\}\}/g, function (m, k) {
      if (k === 'Type') return e.type; if (k === 'Action') return e.action; if (k === 'Actor.ID') return fullId(e.ct); if (k === 'ID') return fullId(e.ct);
      if (k === 'Time') return String(Math.floor(e.t / 1000)); if (k === 'TimeNano') return String(e.t) + '000000'; if (k === 'From') return e.ct.image;
      var am = /^Actor\.Attributes\.(\w+)$/.exec(k); if (am) return e.at[am[1]] != null ? e.at[am[1]] : ''; return '';
    }));
    else out.push(isoTs(e.t) + ' ' + e.type + ' ' + e.action + ' ' + fullId(e.ct) + ' (' + attrs + ')');
  });
  if (out.length) c.out(out.join('\n') + '\n'); return 0;
}

/* ---------- docker info ---------- */
function infoVals(sh) {
  var W = sh.W, D = D6(W), sec = ['name=seccomp,profile=builtin', 'name=cgroupns']; if (D.userns) sec.push('name=userns');
  var run = W.containers.filter(function (x) { return x.state === 'running'; }).length;
  return { SecurityOptions: sec, ServerVersion: '27.3.1', Driver: 'overlay2', LoggingDriver: (D.logDefault && D.logDefault.driver) || 'json-file', CgroupDriver: 'systemd', CgroupVersion: '2', DockerRootDir: D.userns ? '/var/lib/docker/100000.100000' : '/var/lib/docker', LiveRestoreEnabled: String(!!D.liveRestore), Containers: W.containers.length, ContainersRunning: run, ContainersStopped: W.containers.length - run, ContainersPaused: 0, Images: new Set(imgs(W).map(function (x) { return x.id; })).size, NCPU: 4, MemTotal: '8329056256', OperatingSystem: 'Ubuntu 24.04.1 LTS', KernelVersion: '6.8.0-48-generic', DefaultRuntime: 'runc', Name: 'vps', Rootless: 'false' };
}
function dkInfo(c, rest) {
  var sh = c.sh, v = infoVals(sh), fi = rest.indexOf('--format'); if (fi < 0) fi = rest.indexOf('-f');
  var fmt = fi >= 0 ? rest[fi + 1] : null, i2 = rest.filter(function (x) { return /^--format=/.test(x); })[0]; if (i2) fmt = i2.slice(9);
  if (fmt) {
    c.out(fmt.replace(/\{\{\s*(json\s+)?\.(\w+)\s*\}\}/g, function (m, j, k) {
      var val = v[k]; if (val == null) return '';
      if (k === 'SecurityOptions') return j ? JSON.stringify(val) : '[' + val.join(' ') + ']';
      return String(val);
    }) + '\n'); return 0;
  }
  var D = D6(sh.W), o = 'Client: Docker Engine - Community\n Version:    27.3.1\n Context:    default\n Debug Mode: false\n\nServer:\n Containers: ' + v.Containers + '\n  Running: ' + v.ContainersRunning + '\n  Paused: 0\n  Stopped: ' + v.ContainersStopped + '\n Images: ' + v.Images + '\n Server Version: ' + v.ServerVersion + '\n Storage Driver: overlay2\n  Backing Filesystem: extfs\n Logging Driver: ' + v.LoggingDriver + '\n Cgroup Driver: systemd\n Cgroup Version: 2\n Plugins:\n  Volume: local\n  Network: bridge host ipvlan macvlan null overlay\n  Log: awslogs fluentd gcplogs gelf journald json-file local splunk syslog\n Swarm: inactive\n Runtimes: io.containerd.runc.v2 runc\n Default Runtime: runc\n Live Restore Enabled: ' + (D.liveRestore ? 'true' : 'false') + '\n Security Options:\n  apparmor\n  seccomp\n   Profile: builtin\n  cgroupns\n' + (D.userns ? '  userns\n' : '') + ' Kernel Version: ' + v.KernelVersion + '\n Operating System: ' + v.OperatingSystem + '\n OSType: linux\n Architecture: x86_64\n CPUs: 4\n Total Memory: 7.757GiB\n Name: vps\n Docker Root Dir: ' + v.DockerRootDir + '\n';
  c.out(o); return 0;
}

/* ---------- docker top / inspect bổ sung ---------- */
function dkTop(c, rest) {
  var W = c.sh.W, ct = findCt(W, rest[0] || ''); if (!ct) throw new CmdErr('Error response from daemon: No such container: ' + (rest[0] || ''));
  if (ct.state !== 'running') throw new CmdErr('Error response from daemon: container ' + ct.id + ' is not running');
  var u = hostUser(W, uidOf(userSpec(W, ct))), pid = pidOf(ct);
  c.out(pad('UID', 20) + pad('PID', 20) + pad('PPID', 20) + pad('C', 20) + pad('STIME', 20) + pad('TTY', 20) + pad('TIME', 20) + 'CMD\n' + pad(u, 20) + pad(String(pid), 20) + pad(String(pid - 40), 20) + pad('0', 20) + pad('09:12', 20) + pad('?', 20) + pad('00:00:01', 20) + cmdOf(ct) + '\n'); return 0;
}
function inspectExtra(c, rest) {
  var W = c.sh.W, fi = -1, i; for (i = 0; i < rest.length; i++) if (rest[i] === '-f' || rest[i] === '--format') fi = i;
  var fmtA = rest.filter(function (x) { return /^--format=/.test(x); })[0];
  var fmt = fi >= 0 ? rest[fi + 1] : (fmtA ? fmtA.slice(9) : null); if (!fmt) return undefined;
  if (!/State\.Pid|\.LogPath|LogConfig|UsernsMode/.test(fmt)) return undefined;
  var names = rest.filter(function (x, k) { return x.charAt(0) !== '-' && k !== fi + 1; }), rc = 0;
  names.forEach(function (n) {
    var ct = findCt(W, n); if (!ct) { c.err('Error response from daemon: No such container: ' + n + '\n'); rc = 1; return; }
    var cfg = logCfg(W, ct), mp = {}; if (cfg && cfg.size) mp['max-size'] = cfg.size; if (cfg && cfg.files && cfg.size) mp['max-file'] = String(cfg.files);
    var mapStr = 'map[' + Object.keys(mp).sort().map(function (k) { return k + ':' + mp[k]; }).join(' ') + ']', typ = (cfg && cfg.driver) || (D6(W).logDefault && D6(W).logDefault.driver) || 'json-file';
    c.out(fmt.replace(/\{\{\s*(json\s+)?\.([\w.]+)\s*\}\}/g, function (m, j, k) {
      if (k === 'State.Pid') return ct.state === 'running' ? String(pidOf(ct)) : '0';
      if (k === 'LogPath') return logPath(ct);
      if (k === 'HostConfig.LogConfig.Type') return typ;
      if (k === 'HostConfig.LogConfig.Config') return j ? JSON.stringify(mp) : mapStr;
      if (k === 'HostConfig.LogConfig') return j ? JSON.stringify({ Type: typ, Config: mp }) : '{' + typ + ' ' + mapStr + '}';
      if (k === 'HostConfig.UsernsMode') return '';
      return '';
    }) + '\n');
  });
  return rc;
}

/* ---------- ps trên máy chủ: thấy tiến trình container ---------- */
function hostRows(sh) {
  var rows = [], W = sh.W;
  var base = (function () { var cap = ''; try { prevPs([], { sh: sh, out: function (s) { cap += s; }, err: function () { } }); } catch (e) { } return cap; })();
  base.split('\n').slice(1).filter(Boolean).forEach(function (l) { var p = l.trim().split(/\s+/); rows.push({ user: p[0], pid: +p[1], cmd: p.slice(10).join(' ') || p[p.length - 1], ppid: 1 }); });
  W.containers.forEach(function (ct) { if (ct.state === 'running') rows.push({ user: hostUser(W, uidOf(userSpec(W, ct))), pid: pidOf(ct), cmd: cmdOf(ct), ppid: pidOf(ct) - 40 }); });
  return rows;
}
cmds.ps = function (a, c) {
  var sh = c.sh, W = sh.W; if (!W.dk4) return prevPs(a, c);
  var rows = hostRows(sh), oi = -1, i; for (i = 0; i < a.length; i++) if (a[i] === '-o' || a[i] === '-eo' || a[i] === '-Ao') oi = i;
  var joined = a.join(' ');
  if (oi >= 0) {
    var cols = (a[oi + 1] || '').split(',').map(function (x) { return x.split(':')[0].toLowerCase(); }), H = { user: 'USER', pid: 'PID', ppid: 'PPID', cmd: 'CMD', args: 'COMMAND', comm: 'COMMAND', uid: 'UID' };
    var wid = {}; cols.forEach(function (k) { wid[k] = k === 'user' ? 12 : k === 'pid' || k === 'ppid' ? 7 : 0; });
    var line = function (r, hdr) { return cols.map(function (k, j) { var v = hdr ? (H[k] || k.toUpperCase()) : (k === 'user' || k === 'uid' ? r.user : k === 'pid' ? String(r.pid) : k === 'ppid' ? String(r.ppid) : r.cmd); return j === cols.length - 1 ? v : (k === 'pid' || k === 'ppid' ? pad(v, wid[k], true) + ' ' : pad(v, wid[k] || 8) + ' '); }).join(''); };
    c.out(line({}, true) + '\n' + rows.map(function (r) { return line(r, false); }).join('\n') + '\n'); return 0;
  }
  if (/-ef|-e -f|-fe/.test(joined)) { c.out('UID          PID    PPID  C STIME TTY          TIME CMD\n' + rows.map(function (r) { return pad(r.user, 12) + pad(String(r.pid), 6, true) + pad(String(r.ppid), 8, true) + '  0 09:12 ?        00:00:03 ' + r.cmd; }).join('\n') + '\n'); return 0; }
  c.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' + rows.map(function (r) { return pad(r.user, 9) + pad(String(r.pid), 6, true) + '  0.1  0.4 123456 34567 ?        Ssl  09:12   0:03 ' + r.cmd; }).join('\n') + '\n'); return 0;
};

/* ---------- nsenter ---------- */
function ssRows(ct, showP) {
  return listenOf(ct).map(function (l) { return pad('LISTEN', 8) + pad('0', 8) + pad('511', 9) + pad(l.addr + ':' + l.port, 22) + pad('0.0.0.0:*', 14) + (showP ? 'users:(("' + l.proc + '",pid=1,fd=18))' : ''); });
}
cmds.nsenter = function (a, c) {
  var sh = c.sh, W = sh.W, pid = null, flags = '', i = 0;
  for (; i < a.length; i++) {
    var x = a[i];
    if (x === '-t' || x === '--target') { pid = +a[++i]; } else if (/^--target=/.test(x)) pid = +x.slice(9); else if (/^-[nmpuiaUCT]+$/.test(x)) flags += x.slice(1); else if (/^--(net|mount|pid|uts|ipc|all)/.test(x)) flags += x.slice(2, 3); else if (x === '--') { i++; break; } else break;
  }
  var argv = a.slice(i);
  if (pid == null || isNaN(pid)) { c.err('nsenter: no target PID specified for --all\nTry \'nsenter --help\' for more information.\n'); return 1; }
  if (!sh.isRoot(c)) { c.err('nsenter: cannot open /proc/' + pid + '/ns/' + (flags.indexOf('n') >= 0 || flags.indexOf('a') >= 0 ? 'net' : 'mnt') + ': Permission denied\n'); return 1; }
  var ct = W.containers.filter(function (x) { return x.state === 'running' && pidOf(x) === pid; })[0];
  if (!ct) { c.err('nsenter: cannot open /proc/' + pid + '/ns/net: No such file or directory\n'); return 1; }
  var all = flags.indexOf('a') >= 0, nn = all || flags.indexOf('n') >= 0, mm = all || flags.indexOf('m') >= 0, pp = all || flags.indexOf('p') >= 0;
  if (!argv.length) { c.out('(mô phỏng) Mở shell trong namespace của container: hãy chạy từng lệnh, ví dụ: sudo nsenter -t ' + pid + ' -n ss -tlnp\n'); return 0; }
  var prog = argv[0], r = argv.slice(1);
  if (nn && (prog === 'ss' || prog === 'netstat')) {
    var showP = r.join('').indexOf('p') >= 0;
    c.out(pad('State', 8) + pad('Recv-Q', 8) + pad('Send-Q', 9) + pad('Local Address:Port', 22) + pad('Peer Address:Port', 14) + 'Process\n' + ssRows(ct, showP).join('\n') + (listenOf(ct).length ? '\n' : '')); return 0;
  }
  if (nn && (prog === 'curl' || prog === 'wget')) {
    var url = r.filter(function (z) { return /:\/\/|^localhost|^127\./.test(z); })[0] || '', m = /^(?:\w+:\/\/)?([^\/:]+)(?::(\d+))?(\/.*)?$/.exec(url), port = m ? +(m[2] || 80) : 0;
    var lst = listenOf(ct).filter(function (l) { return l.port === port; })[0];
    if (m && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(m[1]) && lst && kind(ct) === 'api') { var ar = appBody(W, ct, m[3] || '/'); c.out(ar.body); return ar.status >= 400 && r.indexOf('-f') >= 0 ? 22 : 0; }
    c.err(prog === 'curl' ? 'curl: (7) Failed to connect to ' + (m ? m[1] : 'localhost') + ' port ' + port + ' after 0 ms: Couldn\'t connect to server\n' : 'wget: can\'t connect to remote host: Connection refused\n'); return prog === 'curl' ? 7 : 1;
  }
  if (pp && (prog === 'ps')) { c.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' + pad(hostUser(W, uidOf(userSpec(W, ct))), 9) + pad('1', 6, true) + '  0.1  0.4 123456 34567 ?        Ssl  09:12   0:03 ' + cmdOf(ct) + '\n'); return 0; }
  if (mm && prog === 'ls') { var p0 = r.filter(function (z) { return z.charAt(0) !== '-'; })[0] || '/', fl = appFiles(ct, p0); if (!fl) { c.err('ls: cannot access \'' + p0 + '\': No such file or directory\n'); return 2; } c.out(fl.join('\n') + '\n'); return 0; }
  if (mm && prog === 'cat') { var p1 = r[0] || ''; if (kind(ct) === 'api' && p1 === '/app/package.json') { c.out('{\n  "name": "tutor-api",\n  "version": "' + DK.split(ct.image)[1] + '",\n  "scripts": { "start": "node dist/main.js" }\n}\n'); return 0; } c.err('cat: ' + p1 + ': No such file or directory\n'); return 1; }
  return sh.call(argv, c, { sudo: true });
};

/* ---------- dockerd --validate ---------- */
function goJsonErr(t) {
  var cm = /^\s*(\/\/|#)/m.exec(t); if (cm) return "invalid character '" + cm[1].charAt(0) + "' looking for beginning of object key string";
  if (/,\s*[}\]]/.test(t)) return "invalid character '" + /,\s*([}\]])/.exec(t)[1] + "' looking for beginning of object key string";
  if (/'/.test(t)) return "invalid character '\\'' looking for beginning of object key string";
  try { JSON.parse(t); } catch (e) { return 'invalid character looking for beginning of value'; }
  return null;
}
function validateDaemon(sh, path) {
  var t = txt(sh, sh.abs(path)); if (t == null) return 'unable to configure the Docker daemon with file ' + path + ': open ' + path + ': no such file or directory';
  var pre = 'unable to configure the Docker daemon with file ' + path + ': ', j;
  var ge = goJsonErr(t); if (ge) return pre + ge;
  try { j = JSON.parse(t); } catch (e) { return pre + 'invalid character looking for beginning of value'; }
  var known = /^(log-driver|log-opts|live-restore|userns-remap|data-root|storage-driver|dns|iptables|default-ulimits|registry-mirrors|insecure-registries|exec-opts|features|default-address-pools|icc|ip|bip|max-concurrent-downloads|no-new-privileges|userland-proxy|debug|hosts|experimental|tls|metrics-addr|default-runtime|runtimes|cgroup-parent|shutdown-timeout)$/;
  var unk = Object.keys(j).filter(function (k) { return !known.test(k); })[0]; if (unk) return pre + "the following directives don't match any configuration option: " + unk;
  if (j['log-opts'] && typeof j['log-opts'] === 'object') {
    var bad = Object.keys(j['log-opts']).filter(function (k) { return !/^(max-size|max-file|compress|labels|env|tag|mode|max-buffer-size)$/.test(k); })[0];
    if (bad) return pre + "unknown log opt '" + bad + "' for json-file log driver";
    if (j['log-opts']['max-file'] != null && typeof j['log-opts']['max-file'] !== 'string') return pre + 'json: cannot unmarshal number into Go struct field Config.log-opts of type string';
  }
  return null;
}
cmds.dockerd = function (a, c) {
  var sh = c.sh;
  if (a.indexOf('--validate') < 0) { c.err('dockerd: trong mô phỏng chỉ hỗ trợ: dockerd --validate --config-file=FILE\n'); return 1; }
  if (!sh.isRoot(c) && false) return 1;
  var cf = a.filter(function (x) { return /^--config-file/.test(x); })[0], path = '/etc/docker/daemon.json';
  if (cf) path = /=/.test(cf) ? cf.split('=')[1] : a[a.indexOf(cf) + 1];
  var err = validateDaemon(sh, path); if (err) { c.err(err + '\n'); return 1; }
  c.out('configuration OK\n'); return 0;
};
cmds.journalctl = function (a, c) {
  var W = c.sh.W, j = a.join(' ');
  if (W.dk4 && /docker/.test(j) && D6(W).down) {
    var e = validateDaemon(c.sh, '/etc/docker/daemon.json') || 'daemon exited';
    c.out('Oct 27 12:44:02 vps systemd[1]: Starting docker.service - Docker Application Container Engine...\nOct 27 12:44:02 vps dockerd[4121]: ' + e + '\nOct 27 12:44:02 vps systemd[1]: docker.service: Main process exited, code=exited, status=1/FAILURE\nOct 27 12:44:02 vps systemd[1]: docker.service: Failed with result \'exit-code\'.\nOct 27 12:44:02 vps systemd[1]: Failed to start docker.service - Docker Application Container Engine.\n'); return 0;
  }
  return prevJournal(a, c);
};

/* ---------- systemctl restart docker ---------- */
function applyDaemon(sh, c) {
  var W = sh.W, D = D6(W), t = txt(sh, '/etc/docker/daemon.json'), j = {};
  var verr = t != null && t.trim() ? validateDaemon(sh, '/etc/docker/daemon.json') : null;
  if (verr) { D.down = true; c.err('Job for docker.service failed because the control process exited with error code.\nSee "systemctl status docker.service" and "journalctl -xeu docker.service" for details.\n'); return 1; }
  if (t != null && t.trim()) j = JSON.parse(t);
  var ur = j['userns-remap'];
  if (ur && ur !== 'default') { var sub = txt(sh, '/etc/subuid') || ''; if (!new RegExp('^' + String(ur).split(':')[0] + ':', 'm').test(sub)) { D.down = true; c.err('Job for docker.service failed because the control process exited with error code.\nSee "systemctl status docker.service" and "journalctl -xeu docker.service" for details.\n'); return 1; } }
  D.down = false; D.userns = !!ur; D.liveRestore = j['live-restore'] === true;
  D.logDefault = (j['log-opts'] || j['log-driver']) ? cfgFromOpts({ driver: j['log-driver'] || 'json-file', options: j['log-opts'] || {} }) : null;
  return 0;
}
cmds.systemctl = function (a, c) {
  var sh = c.sh, W = sh.W, rest = a.filter(function (x) { return x.charAt(0) !== '-'; }), act = rest[0], unit = (rest[1] || '').replace(/\.service$/, '');
  if (W.dk4 && unit === 'docker' && /^(restart|start|reload|stop)$/.test(act) && sh.isRoot(c)) {
    if (act === 'stop') { D6(W).down = true; return 0; }
    var rc = applyDaemon(sh, c); syncLogs(sh); return rc;
  }
  if (W.dk4 && unit === 'docker' && act === 'status' && D6(W).down) { c.out('× docker.service - Docker Application Container Engine\n     Active: failed (Result: exit-code) since Tue 2026-10-27 12:44:02 +07; 3s ago\n  Main PID: 4121 (code=exited, status=1/FAILURE)\n'); return 3; }
  return prevSysctl(a, c);
};

/* ---------- docker run tạm: sidecar chia sẻ namespace và userns ---------- */
var RUN_VAL = { '-v': 1, '--volume': 1, '-e': 1, '--env': 1, '-w': 1, '--workdir': 1, '-u': 1, '--user': 1, '--name': 1, '--network': 1, '--net': 1, '-p': 1, '--publish': 1, '--entrypoint': 1, '-m': 1, '--memory': 1, '--cpus': 1, '--restart': 1, '--pid': 1, '--userns': 1, '--cap-add': 1, '--cap-drop': 1, '--security-opt': 1, '--log-opt': 1, '--log-driver': 1, '--volumes-from': 1, '--mount': 1, '--add-host': 1, '--hostname': 1, '-h': 1, '--label': 1, '-l': 1, '--env-file': 1, '--ipc': 1, '--health-cmd': 1, '--health-interval': 1, '--tmpfs': 1 };
function parseRun(rest) {
  var o = { vols: [], user: null, pid: null, net: null, userns: null, image: null, cmd: [], name: null, rm: false, d: false, entry: null, logOpt: {}, logDriver: null, interactive: false }, j;
  for (j = 0; j < rest.length; j++) {
    var x = rest[j], nm = x, val = null, eq = /^(--[\w-]+)=(.*)$/.exec(x); if (eq) { nm = eq[1]; val = eq[2]; }
    if (o.image) { o.cmd.push(x); continue; }
    if (RUN_VAL[nm]) { if (val == null) val = rest[++j]; if (nm === '-v' || nm === '--volume') o.vols.push(val); else if (nm === '-u' || nm === '--user') o.user = val; else if (nm === '--pid') o.pid = val; else if (nm === '--network' || nm === '--net') o.net = val; else if (nm === '--userns') o.userns = val; else if (nm === '--name') o.name = val; else if (nm === '--entrypoint') o.entry = val; else if (nm === '--log-opt') { var kv = String(val).split('='); o.logOpt[kv[0]] = kv[1]; } else if (nm === '--log-driver') o.logDriver = val; continue; }
    if (nm === '--rm') { o.rm = true; continue; } if (nm === '-d' || nm === '--detach') { o.d = true; continue; }
    if (/^-[a-z]*[it][a-z]*$/.test(nm) && nm.charAt(1) !== '-') { o.interactive = true; if (/d/.test(nm)) o.d = true; continue; }
    if (nm.charAt(0) === '-') continue;
    o.image = x;
  }
  return o;
}
function notFoundExec(c, prog) { c.err('docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: exec: "' + prog + '": executable file not found in $PATH: unknown.\n'); return 127; }
function sidecar(c, o) {
  var sh = c.sh, W = sh.W;
  function target(spec) { var m = /^container:(.+)$/.exec(spec || ''); if (!m) return null; var t = findCt(W, m[1]); if (!t) throw new CmdErr('docker: Error response from daemon: No such container: ' + m[1] + '.'); return t; }
  var pt = target(o.pid), nt = target(o.net);
  if (pt && pt.state !== 'running') throw new CmdErr('docker: Error response from daemon: cannot join PID of a non running container: ' + fullId(pt) + '.');
  if (nt && nt.state !== 'running') throw new CmdErr('docker: Error response from daemon: cannot join network of a non running container: ' + fullId(nt) + '.');
  var image = o.image, netshoot = /netshoot/.test(image), local = DK.has(W, image);
  if (!local && !/^(busybox|alpine|ubuntu|debian|nicolaka\/netshoot)(:[\w.-]+)?$/.test(image)) throw new CmdErr("Unable to find image '" + image + "' locally\ndocker: Error response from daemon: pull access denied for " + image.split(':')[0] + ', repository does not exist or may require \'docker login\': denied: requested access to the resource is denied.');
  if (!local && /^(busybox|alpine|ubuntu|debian)(:[\w.-]+)?$/.test(image)) { prev(['pull', image], c); local = true; }
  if (!local) { var rp = image.indexOf('/') < 0 ? 'library/' + image.split(':')[0] : image.split(':')[0]; c.out("Unable to find image '" + (image.indexOf(':') < 0 ? image + ':latest' : image) + "' locally\n" + (image.split(':')[1] || 'latest') + ': Pulling from ' + rp + '\n' + hex(image + 'l', 12) + ': Pull complete\nDigest: sha256:' + hex(image + 'dg', 64) + '\nStatus: Downloaded newer image for ' + (image.indexOf(':') < 0 ? image + ':latest' : image) + '\n'); }
  var user = o.user ? uidOf(o.user) : 0, uname = user === 0 ? 'root' : String(user);
  var cmd = (o.entry ? [o.entry] : []).concat(o.cmd);
  if (!cmd.length) cmd = ['sh'];
  var tools = netshoot ? ['ps', 'netstat', 'ss', 'curl', 'wget', 'nc', 'ls', 'cat', 'id', 'whoami', 'env', 'echo', 'hostname', 'sh', 'ip', 'nslookup'] : ['ps', 'netstat', 'wget', 'nc', 'ls', 'cat', 'id', 'whoami', 'env', 'echo', 'hostname', 'sh', 'top'];
  function run1(argv) {
    var prog = argv[0].replace(/^\/(usr\/)?(s?bin)\//, ''), r = argv.slice(1);
    if (tools.indexOf(prog) < 0) return notFoundExec(c, prog);
    if (prog === 'sh' || prog === 'bash') {
      if (r[0] === '-c' && r[1] != null) { var parts = r[1].split(/\s*&&\s*|\s*;\s*/), rc = 0; for (var i = 0; i < parts.length; i++) { var t = parts[i].trim(); if (!t) continue; rc = run1(t.replace(/^["']|["']$/g, '').split(/\s+/)); if (rc !== 0) return rc; } return rc; }
      c.out('(mô phỏng) Không mở được phiên tương tác. Hãy chạy từng lệnh, ví dụ: docker run --rm --pid=container:NAME --network=container:NAME busybox ps\n'); return 0;
    }
    if (prog === 'echo') { c.out(r.join(' ') + '\n'); return 0; }
    if (prog === 'id') { c.out(user === 0 ? 'uid=0(root) gid=0(root) groups=0(root),10(wheel)\n' : 'uid=' + user + ' gid=' + user + ' groups=' + user + '\n'); return 0; }
    if (prog === 'whoami') { c.out(uname + '\n'); return 0; }
    if (prog === 'hostname') { c.out((nt ? nt.id : hex(image + 'h', 12)) + '\n'); return 0; }
    if (prog === 'env') { c.out('PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOSTNAME=' + (nt ? nt.id : hex(image + 'h', 12)) + '\nHOME=/root\n'); return 0; }
    if (prog === 'ps' || prog === 'top') {
      var rows = []; if (pt) { var pu = uidOf(userSpec(W, pt)); rows.push({ pid: 1, user: pu === 0 ? 'root' : String(pu), cmd: cmdOf(pt) }); }
      rows.push({ pid: pt ? 7 + hnum(image) % 20 : 1, user: uname, cmd: 'ps' + (r.length ? ' ' + r.join(' ') : '') });
      c.out('PID   USER     TIME  COMMAND\n' + rows.map(function (x) { return pad(String(x.pid), 5, true) + ' ' + pad(x.user, 8) + ' 0:0' + (x.pid === 1 && pt ? '3' : '0') + '  ' + x.cmd; }).join('\n') + '\n'); return 0;
    }
    if (prog === 'netstat' || prog === 'ss') {
      var ls = nt ? listenOf(nt) : [], showP = r.join('').indexOf('p') >= 0;
      if (prog === 'ss') { c.out(pad('State', 8) + pad('Recv-Q', 8) + pad('Send-Q', 9) + pad('Local Address:Port', 22) + pad('Peer Address:Port', 14) + 'Process\n' + ls.map(function (l) { return pad('LISTEN', 8) + pad('0', 8) + pad('511', 9) + pad(l.addr + ':' + l.port, 22) + pad('0.0.0.0:*', 14) + (showP ? 'users:(("' + l.proc + '",pid=1,fd=18))' : ''); }).join('\n') + (ls.length ? '\n' : '')); return 0; }
      c.out('Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       ' + (showP ? 'PID/Program name' : '') + '\n' + ls.map(function (l) { return 'tcp        0      0 ' + pad(l.addr + ':' + l.port, 23) + ' ' + pad('0.0.0.0:*', 23) + ' LISTEN      ' + (showP ? (pt ? '1/' + l.proc : '-') : ''); }).join('\n') + (ls.length ? '\n' : '')); return 0;
    }
    if (prog === 'wget' || prog === 'curl') {
      var url = r.filter(function (z) { return /:\/\/|^localhost|^127\.|^[\w.-]+:\d+/.test(z); })[0] || '', m = /^(?:\w+:\/\/)?([^\/:]+)(?::(\d+))?(\/.*)?$/.exec(url), port = m ? +(m[2] || 80) : 0;
      var ls2 = nt ? listenOf(nt).filter(function (l) { return l.port === port; }) : [];
      if (m && /^(localhost|127\.0\.0\.1)$/.test(m[1]) && ls2.length && kind(nt) === 'api') { var ar = appBody(W, nt, m[3] || '/'); if (ar.status >= 400) { c.err(prog === 'wget' ? 'wget: server returned error: HTTP/1.1 ' + ar.status + ' Internal Server Error\n' : ''); if (prog === 'curl' && r.join(' ').indexOf('-f') < 0) { c.out(ar.body); return 0; } return prog === 'wget' ? 1 : 22; } c.out(ar.body); return 0; }
      c.err(prog === 'wget' ? "wget: can't connect to remote host (127.0.0.1): Connection refused\n" : 'curl: (7) Failed to connect to ' + (m ? m[1] : 'localhost') + ' port ' + port + " after 0 ms: Couldn't connect to server\n"); return prog === 'wget' ? 1 : 7;
    }
    if (prog === 'nc') { var zp = r.filter(function (z) { return /^\d+$/.test(z); })[0]; var ls3 = nt ? listenOf(nt).filter(function (l) { return String(l.port) === zp; }) : []; if (ls3.length) { c.out('localhost (127.0.0.1:' + zp + ') open\n'); return 0; } return 1; }
    if (prog === 'cat') {
      var p = r[0] || '';
      if (p === '/proc/1/environ') { if (!pt) { c.err("cat: can't open '/proc/1/environ': Permission denied\n"); return 1; } var env = Object.assign({ NODE_ENV: 'production', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOSTNAME: pt.id }, pt.env || {}); c.out(Object.keys(env).map(function (k) { return k + '=' + env[k]; }).join('\0') + '\0'); return 0; }
      if (/^\/proc\/1\/root\/app\/package\.json$/.test(p) && pt) { c.out('{\n  "name": "tutor-api",\n  "version": "' + DK.split(pt.image)[1] + '"\n}\n'); return 0; }
      if (/^\/proc\/1\/cmdline$/.test(p) && pt) { c.out(cmdOf(pt).split(' ').join('\0') + '\0'); return 0; }
      c.err("cat: can't open '" + p + "': No such file or directory\n"); return 1;
    }
    if (prog === 'ls') {
      var p2 = r.filter(function (z) { return z.charAt(0) !== '-'; })[0] || '/', mm = /^\/proc\/1\/root(\/.*)?$/.exec(p2);
      if (mm && pt) { var fl = appFiles(pt, mm[1] || '/'); if (!fl) { c.err("ls: " + p2 + ": No such file or directory\n"); return 1; } c.out(fl.join('\n') + '\n'); return 0; }
      if (mm && !pt) { c.err("ls: " + p2 + ": No such file or directory\n"); return 1; }
      c.out('bin\ndev\netc\nhome\nlib\nproc\nroot\nsys\ntmp\nusr\nvar\n'); return 0;
    }
    return notFoundExec(c, prog);
  }
  return run1(cmd);
}

/* userns: quyền ghi vào thư mục bind-mount */
function usernsPrecheck(c, o) {
  var sh = c.sh, W = sh.W, D = D6(W); if (!D.userns || o.userns === 'host' || !o.vols.length || !o.image) return 0;
  var im = imgOf(W, o.image), uspec = o.user || (im && im.user) || 'root', uid = uidOf(uspec), mapped = String(100000 + uid);
  var prog = o.cmd[0] || '', args = o.cmd.slice(1), mounts = [];
  o.vols.forEach(function (v) { var m = /^([^:]+):([^:]+)(?::(\w+))?$/.exec(v); if (m && /^[\/~.]/.test(m[1])) { var host = m[1].charAt(0) === '~' ? sh.home + m[1].slice(1) : sh.abs(m[1]); mounts.push({ host: host, cont: m[2], ro: m[3] === 'ro' }); } });
  var targets = [];
  if (prog === 'touch' || prog === 'mkdir' || prog === 'rm' || prog === 'cp' || prog === 'chown' || prog === 'tee') args.forEach(function (x) { if (x.charAt(0) !== '-') targets.push(x); });
  if ((prog === 'sh' || prog === 'bash') && args[0] === '-c' && args[1]) { var mr = /(?:>|touch\s|mkdir\s(?:-p\s)?)\s*(\/\S+)/.exec(args[1]); if (mr) targets.push(mr[1]); }
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i], mt = mounts.filter(function (m) { return t === m.cont || t.indexOf(m.cont.replace(/\/$/, '') + '/') === 0; })[0]; if (!mt || mt.ro) continue;
    var node = sh.fs.get(mt.host); if (!node) continue;
    if (String(node.owner) === mapped || ((node.mode || 0) & 2)) continue;
    var msg = prog === 'mkdir' ? "mkdir: can't create directory '" + t + "': Permission denied" : prog === 'rm' ? "rm: can't remove '" + t + "': Permission denied" : (prog === 'sh' || prog === 'bash') ? "sh: can't create " + t + ': Permission denied' : prog + ': ' + t + ': Permission denied';
    c.err(msg + '\n'); return 1;
  }
  return 0;
}

/* ---------- bộ điều phối ---------- */
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W; if (!W.dk4) return prev(a, c);
  var D = D6(W);
  if (D.down) { c.err('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n'); return 1; }
  var sub = a[0], rest = a.slice(1), rc;
  if ((sub === 'ps' || (sub === 'container' && /^(ls|ps|list)$/.test(rest[0] || ''))) && (a.indexOf('-f') >= 0 || a.indexOf('--filter') >= 0 || a.some(function (x) { return /^--filter=/.test(x); }))) {
    var pa = sub === 'ps' ? rest : rest.slice(1), fl = [], keep = [], ii;
    for (ii = 0; ii < pa.length; ii++) { if (pa[ii] === '-f' || pa[ii] === '--filter') fl.push(pa[++ii]); else if (/^--filter=/.test(pa[ii])) fl.push(pa[ii].slice(9)); else keep.push(pa[ii]); }
    var all = W.containers.slice(), sel = all.filter(function (ct) {
      return fl.every(function (f) {
        var m = /^(\w+)=(.*)$/.exec(f); if (!m) return true; var v = m[2].replace(/^["']|["']$/g, ''), st = ct.status || '';
        if (m[1] === 'health') return v === 'unhealthy' ? /\(unhealthy\)/.test(st) : v === 'healthy' ? /\(healthy\)/.test(st) : v === 'starting' ? /starting\)/.test(st) : !/\((un)?healthy|starting\)/.test(st);
        if (m[1] === 'status') return ct.state === v;
        if (m[1] === 'name') return ct.name.indexOf(v) >= 0;
        if (m[1] === 'id') return ct.id.indexOf(v) === 0;
        if (m[1] === 'ancestor') return (ct.image || '').indexOf(v) >= 0;
        if (m[1] === 'exited') return ct.state === 'exited' && String(ct.exitCode || 0) === v;
        return true;
      });
    });
    W.containers = sel;
    try { rc = prev(['ps'].concat(keep), c); } finally { W.containers = all; }
    return rc;
  }
  if (sub === 'events') return dkEvents(c, rest);
  if (sub === 'info' || (sub === 'system' && rest[0] === 'info')) return dkInfo(c, sub === 'info' ? rest : rest.slice(1));
  if (sub === 'top') return dkTop(c, rest);
  if (sub === 'inspect' || (sub === 'container' && rest[0] === 'inspect')) { var ie = inspectExtra(c, sub === 'inspect' ? rest : rest.slice(1)); if (ie !== undefined) return ie; }
  if (sub === 'run' || (sub === 'container' && rest[0] === 'run')) {
    var rr = sub === 'run' ? rest : rest.slice(1), o = parseRun(rr);
    if (o.rm && !o.d && o.image && ((o.pid && /^container:/.test(o.pid)) || (o.net && /^container:/.test(o.net)))) return sidecar(c, o);
    if (o.rm && !o.d && o.image) { var pr = usernsPrecheck(c, o); if (pr) return pr; }
    if (Object.keys(o.logOpt).length || o.logDriver) {
      var clean = [], q;
      for (q = 0; q < a.length; q++) { if (a[q] === '--log-opt' || a[q] === '--log-driver') { q++; continue; } if (/^--log-(opt|driver)=/.test(a[q])) continue; clean.push(a[q]); }
      rc = prev(clean, c);
      var ct0 = o.name ? findCt(W, o.name) : null; if (ct0) ct0.runLog = { driver: o.logDriver || 'json-file', options: o.logOpt };
      syncLogs(sh); return rc;
    }
  }
  rc = prev(a, c); syncLogs(sh); return rc;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
