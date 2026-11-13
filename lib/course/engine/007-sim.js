(function (G) {
'use strict';
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, pad = V.util.pad, SP = V.Shell.prototype;
var prevDocker = cmds.docker, prevCurl = cmds.curl, prevOpenssl = cmds.openssl;
function lines(t) { return (t || '').split('\n'); }
function listOf(v) {
  if (Array.isArray(v)) return v.slice();
  if (typeof v === 'string' && /^\[.*\]$/.test(v.trim())) return v.trim().slice(1, -1).split(',').map(function (x) { return x.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
  return v ? [v] : [];
}
function isTrue(v) { return /^true$/i.test(String(v == null ? '' : v)); }
function findCt(W, n) { return (W.containers || []).filter(function (c) { return c.name === n || c.id.indexOf(n) === 0; })[0]; }
function imgOf(W, ref) {
  var i = ref.lastIndexOf(':'), repo = i > 0 && ref.indexOf('/', i) < 0 ? ref.slice(0, i) : ref, tag = i > 0 && ref.indexOf('/', i) < 0 ? ref.slice(i + 1) : 'latest';
  return (W.images || []).filter(function (x) { return x.repo === repo && x.tag === tag; })[0];
}
var DEFAULT_USER = { postgres: 'postgres', redis: 'redis' };
function cfgOf(sh, ct) {
  var r = ct.runCfg || {}, s = ct.svcCfg || {}, im = imgOf(sh.W, ct.image) || {};
  var repo = ct.image.replace(/:.*$/, '');
  var dep = (s.deploy && s.deploy.resources && s.deploy.resources.limits) || {};
  var vols = (r.vols || []).concat(listOf(s.volumes));
  var tmp = (r.tmpfs || []).concat(listOf(s.tmpfs));
  var user = r.user || s.user || im.user || DEFAULT_USER[repo] || '';
  var cdrop = r.capDrop && r.capDrop.length ? r.capDrop : listOf(s.cap_drop);
  return {
    user: String(user), readOnly: !!r.readOnly || isTrue(s.read_only), capDrop: cdrop.map(function (x) { return String(x).toUpperCase(); }),
    capAdd: (r.capAdd || []).concat(listOf(s.cap_add)), secOpt: (r.secOpt || []).concat(listOf(s.security_opt)),
    privileged: !!r.privileged || isTrue(s.privileged), cpus: r.cpus || s.cpus || dep.cpus || '', pids: r.pids || s.pids_limit || '',
    vols: vols, tmpfs: tmp, hostNet: (r.network === 'host') || s.network_mode === 'host',
    mem: ct.memMB || null, env: ct.env || {}
  };
}
V.dkcfg = cfgOf;
function hasSock(cfg) { return cfg.vols.some(function (v) { return /docker\.sock/.test(String(v)); }); }
function noNewPriv(cfg) { return cfg.secOpt.some(function (x) { return /no-new-privileges(:true|=true)?$/.test(String(x)); }); }
function uidOf(user) {
  var u = String(user || '').split(':')[0];
  if (u === '' || u === 'root' || u === '0') return { uid: 0, name: 'root' };
  if (/^\d+$/.test(u)) return { uid: +u, name: +u === 1000 ? 'node' : +u === 999 ? 'postgres' : +u === 65534 ? 'nobody' : '' };
  return { uid: u === 'node' ? 1000 : u === 'postgres' || u === 'redis' ? 999 : u === 'nobody' ? 65534 : 1001, name: u };
}
function hid(n) { var h = 7, s = '', i; for (i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0; h = Math.abs(h); for (i = 0; i < 12; i++) { h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff; s += '0123456789abcdef'.charAt(h % 16); } return s; }

// ===================== docker wrapper =====================
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W, sub = a[0], rest = a.slice(1);
  if (sub === 'run') return dockerRun(a, c);
  if (sub === 'build') return dockerBuild(a, c);
  if (sub === 'inspect') { var rv = dockerInspect(c, rest); if (rv !== undefined) return rv; }
  if (sub === 'exec') { var re = dockerExec(c, rest); if (re !== undefined) return re; }
  var isRestart = sub === 'restart' || sub === 'start' || (sub === 'compose' && (rest.indexOf('up') >= 0 || rest.indexOf('restart') >= 0));
  var rc = prevDocker(a, c);
  if (isRestart || sub === 'kill') afterStart(sh);
  return rc;
};
var STRIP_VAL = { '--user': 'user', '-u': 'user', '--cap-drop': 'capDrop', '--cap-add': 'capAdd', '--security-opt': 'secOpt', '--cpus': 'cpus', '--pids-limit': 'pids', '--tmpfs': 'tmpfs', '--memory-swap': 'x', '--health-cmd': 'x', '--hostname': 'x', '-h': 'x' };
function dockerRun(a, c) {
  var sh = c.sh, W = sh.W, rest = a.slice(1), keep = [], cfg = { capDrop: [], capAdd: [], secOpt: [], vols: [], tmpfs: [] }, name = null, image = null, tail = [], i;
  for (i = 0; i < rest.length; i++) {
    var x = rest[i];
    if (image) { tail.push(x); continue; }
    if (STRIP_VAL[x]) {
      var v = rest[++i]; if (v == null) throw new CmdErr('flag needs an argument: ' + x);
      var k = STRIP_VAL[x];
      if (k === 'user') cfg.user = v; else if (k === 'capDrop') cfg.capDrop.push(v.toUpperCase()); else if (k === 'capAdd') cfg.capAdd.push(v.toUpperCase());
      else if (k === 'secOpt') cfg.secOpt.push(v); else if (k === 'cpus') cfg.cpus = v; else if (k === 'pids') cfg.pids = v; else if (k === 'tmpfs') cfg.tmpfs.push(v);
      continue;
    }
    if (x === '--read-only') { cfg.readOnly = true; continue; }
    if (x === '--privileged') { cfg.privileged = true; continue; }
    if (x === '--name') { name = rest[i + 1]; }
    if (x === '-v' || x === '--volume') cfg.vols.push(rest[i + 1]);
    if (x === '--network' || x === '--net') cfg.network = rest[i + 1];
    keep.push(x);
    if (x === '--name' || x === '-p' || x === '--publish' || x === '-e' || x === '--env' || x === '--restart' || x === '-v' || x === '--network' || x === '--volume' || x === '-m' || x === '--memory' || x === '--net') { keep.push(rest[++i]); continue; }
    if (x.charAt(0) !== '-') { image = x; }
  }
  if (!image) return prevDocker(a, c);
  var rc = prevDocker(['run'].concat(keep, tail), c);
  var ct = findCt(W, name || 'quirky_turing');
  if (rc === 0 && ct) { ct.runCfg = cfg; ct.cmdArgs = tail; afterStart(sh); }
  return rc;
}
function dockerBuild(a, c) {
  var sh = c.sh, W = sh.W, rest = a.slice(1), tag = null, ctx = null;
  for (var i = 0; i < rest.length; i++) { if (rest[i] === '-t' || rest[i] === '--tag') tag = rest[++i]; else if (rest[i].charAt(0) !== '-') ctx = rest[i]; }
  var rc = prevDocker(a, c);
  if (rc === 0 && tag && ctx) {
    var df = sh.fs.get(sh.abs(ctx) + '/Dockerfile'), im = imgOf(W, tag);
    if (df && im) {
      var froms = [], user = '';
      lines(df.c).forEach(function (l) { var m = /^\s*FROM\s+(\S+)/i.exec(l); if (m) froms.push(m[1]); var u = /^\s*USER\s+(\S+)/i.exec(l); if (u) user = u[1]; });
      im.base = froms.length ? froms[froms.length - 1] : ''; im.user = user; im.stages = froms.length;
      im.hasEnv = /^\s*COPY\s+.*\.env/mi.test(df.c);
    }
  }
  return rc;
}
function dockerInspect(c, rest) {
  var sh = c.sh, W = sh.W, fi = rest.indexOf('--format'); if (fi < 0) fi = rest.indexOf('-f');
  var fmt = fi >= 0 ? rest[fi + 1] : null, nm = rest.filter(function (x, i) { return x.charAt(0) !== '-' && i !== fi + 1; })[0], ct = findCt(W, nm || '');
  if (!ct) return undefined;
  var cfg = cfgOf(sh, ct);
  var envArr = Object.keys(cfg.env).map(function (k) { return k + '=' + cfg.env[k]; });
  function goList(arr) { return '[' + arr.join(' ') + ']'; }
  var vals = {
    'Config.User': cfg.user, 'HostConfig.ReadonlyRootfs': String(cfg.readOnly), 'HostConfig.Privileged': String(cfg.privileged),
    'HostConfig.CapDrop': cfg.capDrop.length ? goList(cfg.capDrop) : '[]', 'HostConfig.CapAdd': cfg.capAdd.length ? goList(cfg.capAdd) : '[]',
    'HostConfig.SecurityOpt': cfg.secOpt.length ? goList(cfg.secOpt) : '[]', 'HostConfig.Memory': cfg.mem ? String(cfg.mem * 1048576) : '0',
    'HostConfig.NanoCpus': cfg.cpus ? String(Math.round(parseFloat(cfg.cpus) * 1e9)) : '0', 'HostConfig.PidsLimit': cfg.pids ? String(cfg.pids) : '<nil>',
    'HostConfig.NetworkMode': cfg.hostNet ? 'host' : 'bridge', 'Config.Env': goList(envArr),
    'HostConfig.Binds': goList(cfg.vols.filter(function (v) { return /:/.test(String(v)) && !/^[\w-]+:/.test(String(v)) || /^[.\/]/.test(String(v)); }))
  };
  if (fmt) {
    var js = /\{\{\s*json\s+\.([\w.]+)\s*\}\}/.exec(fmt);
    if (js && vals[js[1]] != null) {
      var raw = vals[js[1]];
      if (js[1] === 'Config.Env') c.out(JSON.stringify(envArr) + '\n'); else if (/^\[.*\]$/.test(raw)) c.out(JSON.stringify(raw === '[]' ? [] : raw.slice(1, -1).split(' ')) + '\n'); else c.out(JSON.stringify(raw) + '\n');
      return 0;
    }
    var hit = false;
    var o = fmt.replace(/\{\{\s*\.([\w.]+)\s*\}\}/g, function (m, k) { if (vals[k] != null) { hit = true; return vals[k]; } return m; });
    if (hit && !/\{\{/.test(o)) { c.out(o + '\n'); return 0; }
    return undefined;
  }
  var st = ct.state;
  c.out('[\n    {\n        "Id": "' + ct.id + '...",\n        "Name": "/' + ct.name + '",\n        "State": { "Status": "' + st + '", "Running": ' + (st === 'running') + ', "ExitCode": ' + (ct.memKill ? 137 : 0) + ' },\n        "Config": {\n            "Image": "' + ct.image + '",\n            "User": "' + cfg.user + '",\n            "Env": [\n' + envArr.map(function (e) { return '                "' + e + '"'; }).join(',\n') + '\n            ]\n        },\n        "HostConfig": {\n            "Binds": ' + JSON.stringify(cfg.vols.filter(function (v) { return /^[.\/]/.test(String(v)); })) + ',\n            "NetworkMode": "' + (cfg.hostNet ? 'host' : 'bridge') + '",\n            "Privileged": ' + cfg.privileged + ',\n            "ReadonlyRootfs": ' + cfg.readOnly + ',\n            "CapDrop": ' + (cfg.capDrop.length ? JSON.stringify(cfg.capDrop) : 'null') + ',\n            "CapAdd": ' + (cfg.capAdd.length ? JSON.stringify(cfg.capAdd) : 'null') + ',\n            "SecurityOpt": ' + (cfg.secOpt.length ? JSON.stringify(cfg.secOpt) : 'null') + ',\n            "Memory": ' + vals['HostConfig.Memory'] + ',\n            "NanoCpus": ' + vals['HostConfig.NanoCpus'] + ',\n            "RestartPolicy": { "Name": "' + (ct.restartPolicy || 'no') + '" }\n        }\n    }\n]\n');
  return 0;
}
function dockerExec(c, rest) {
  var sh = c.sh, W = sh.W, a = [], env = {}, user = null, i;
  for (i = 0; i < rest.length; i++) {
    var x = rest[i];
    if (a.length === 0 && (x === '-e' || x === '--env')) { var kv = rest[++i] || '', q = kv.indexOf('='); if (q > 0) env[kv.slice(0, q)] = kv.slice(q + 1); continue; }
    if (a.length === 0 && (x === '-u' || x === '--user')) { user = rest[++i]; continue; }
    if (a.length === 0 && (x === '-w' || x === '--workdir')) { i++; continue; }
    if (a.length === 0 && x.charAt(0) === '-') continue;
    a.push(x);
  }
  var ct = findCt(W, a[0] || ''); if (!ct) return undefined;
  if (ct.state !== 'running') return undefined;
  var cmd = a.slice(1);
  if ((cmd[0] === 'sh' || cmd[0] === 'bash') && cmd[1] === '-c' && cmd[2]) cmd = cmd[2].trim().split(/\s+/);
  var cfg = cfgOf(sh, ct), eff = user != null ? user : cfg.user, ui = uidOf(eff);
  if (cmd[0] === 'id') {
    var nm = ui.name ? '(' + ui.name + ')' : '';
    c.out('uid=' + ui.uid + nm + ' gid=' + ui.uid + nm + ' groups=' + ui.uid + nm + '\n'); return 0;
  }
  if (cmd[0] === 'whoami') { c.out((ui.name || 'I have no name!') + '\n'); return 0; }
  if (cmd[0] === 'touch' && cmd[1]) {
    var p = cmd[1], tmpOk = cfg.tmpfs.some(function (t) { return p.indexOf(String(t).split(':')[0]) === 0; });
    if (cfg.readOnly && !tmpOk) { c.err("touch: cannot touch '" + p + "': Read-only file system\n"); return 1; }
    if (ui.uid !== 0 && !/^\/(tmp)\//.test(p) && !tmpOk) { c.err("touch: cannot touch '" + p + "': Permission denied\n"); return 1; }
    return 0;
  }
  if (cmd[0] === 'ls' && /docker\.sock/.test(cmd.join(' '))) {
    if (hasSock(cfg)) { c.out('srw-rw---- 1 root 999 0 Oct 26 09:00 /var/run/docker.sock\n'); return 0; }
    c.err("ls: cannot access '/var/run/docker.sock': No such file or directory\n"); return 2;
  }
  if (cmd[0] === 'psql' && W.pg) return psql(c, ct, cmd.slice(1), env);
  if (cmd[0] === 'pg_isready' && W.pg) { c.out('/var/run/postgresql:5432 - accepting connections\n'); return 0; }
  if (cmd[0] === 'redis-cli') return redisCli(c, ct, cmd.slice(1), env);
  return undefined;
}

// ===================== postgres =====================
function pgHba(sh) {
  var W = sh.W; if (!W.pg) return [];
  var out = [];
  lines(W.pg.hbaLive || '').forEach(function (l) {
    l = l.replace(/#.*$/, '').trim(); if (!l) return;
    var p = l.split(/\s+/);
    if (p[0] === 'local') out.push({ type: 'local', db: p[1], user: p[2], addr: null, method: p[3] });
    else out.push({ type: p[0], db: p[1], user: p[2], addr: p[3], method: p[4] });
  });
  return out;
}
function ipNum(s) { var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s); return m ? ((+m[1] * 16777216) + (+m[2] << 16) + (+m[3] << 8) + (+m[4])) : null; }
function inCidr(ip, cidr) {
  if (cidr === 'all') return true;
  var m = /^([\d.]+)(?:\/(\d+))?$/.exec(cidr); if (!m) return false;
  var bits = m[2] == null ? 32 : +m[2], a = ipNum(ip), b = ipNum(m[1]); if (a == null || b == null) return false;
  if (bits === 0) return true;
  var mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}
V.pgInCidr = inCidr;
function pgReload(sh) {
  var W = sh.W; if (!W.pg) return;
  var n = sh.fs.get(W.pg.hbaPath); if (n) W.pg.hbaLive = n.c || '';
}
function hbaDecide(sh, role, db, via) {
  var rules = pgHba(sh), src = via === 'local' ? null : via;
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    if (via === 'local' ? r.type !== 'local' : r.type === 'local') continue;
    if (r.db !== 'all' && r.db.split(',').indexOf(db) < 0) continue;
    if (r.user !== 'all' && r.user.split(',').indexOf(role) < 0) continue;
    if (src && !inCidr(src, r.addr || 'all')) continue;
    return r.method;
  }
  return null;
}
function psql(c, ct, a, env) {
  var sh = c.sh, W = sh.W, pg = W.pg, user = null, db = null, host = null, sql = null, i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-U') user = a[++i]; else if (x === '-d') db = a[++i]; else if (x === '-h') host = a[++i]; else if (x === '-c') sql = (sql ? sql + '; ' : '') + a[++i];
    else if (x === '-W' || x === '-w' || x === '-t' || x === '-A' || x === '-q') continue; else if (x.charAt(0) !== '-' && !db) db = x;
  }
  var pwEnv = env.PGPASSWORD || sh.env.PGPASSWORD || null;
  if (!user) { c.err('psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  role "root" does not exist\n'); return 2; }
  db = db || user;
  var role = pg.roles[user];
  var via = !host || host === '/var/run/postgresql' ? 'local' : (host === '127.0.0.1' || host === 'localhost' ? '127.0.0.1' : '172.18.0.5');
  var hs = host ? '"' + host + '"' : '';
  var method = hbaDecide(sh, user, db, via);
  function conErr(msg) { c.err(host ? 'psql: error: connection to server at ' + hs + ', port 5432 failed: ' + msg + '\n' : 'psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: ' + msg + '\n'); return 2; }
  if (method == null) return conErr('FATAL:  no pg_hba.conf entry for host "' + (via === 'local' ? '[local]' : via) + '", user "' + user + '", database "' + db + '", no encryption');
  if (method === 'reject') return conErr('FATAL:  pg_hba.conf rejects connection for host "' + via + '", user "' + user + '", database "' + db + '", no encryption');
  if (method !== 'trust' && method !== 'peer') {
    if (pwEnv == null) return conErr('fe_sendauth: no password supplied');
    if (!role || role.pw !== pwEnv) return conErr('FATAL:  password authentication failed for user "' + user + '"');
  } else if (!role) return conErr('FATAL:  role "' + user + '" does not exist');
  if (pg.dbs.indexOf(db) < 0) return conErr('FATAL:  database "' + db + '" does not exist');
  if (!sql) { c.out('psql (16.4)\nType "help" for help.\n(mô phỏng không mở phiên tương tác, dùng -c "SQL")\n'); return 0; }
  var rc = 0;
  sql.split(/;\s*/).forEach(function (st) { st = st.trim(); if (!st || rc) return; rc = pgSql(c, pg, user, st); });
  return rc;
}
var ATTRS = [['SUPERUSER', 'Superuser'], ['CREATEROLE', 'Create role'], ['CREATEDB', 'Create DB']];
function attrStr(r) { if (r.super) return 'Superuser, Create role, Create DB, Replication, Bypass RLS'; var o = []; if (r.createrole) o.push('Create role'); if (r.createdb) o.push('Create DB'); if (!r.login) o.push('Cannot login'); return o.join(', '); }
function pgSql(c, pg, cur, st) {
  var m, up = st.toUpperCase();
  function role(n) { return pg.roles[n]; }
  if (/^\\du/.test(st)) {
    var names = Object.keys(pg.roles).sort(), w = 9; names.forEach(function (n) { w = Math.max(w, n.length); });
    var rows = names.map(function (n) { return [n, attrStr(pg.roles[n])]; }), aw = 10; rows.forEach(function (r) { aw = Math.max(aw, r[1].length); });
    var tl = Math.floor((w + aw + 5 - 13) / 2);
    var o = pad('', tl) + 'List of roles\n ' + pad('Role name', w) + ' | ' + pad('Attributes', aw) + '\n' + '-'.repeat(w + 2) + '+' + '-'.repeat(aw + 2) + '\n';
    rows.forEach(function (r) { o += ' ' + pad(r[0], w) + ' | ' + r[1] + '\n'; });
    c.out(o + '\n'); return 0;
  }
  if (/^\\l/.test(st)) { c.out('   Name    |  Owner   \n-----------+----------\n' + pg.dbs.map(function (d) { return ' ' + pad(d, 10) + '| postgres'; }).join('\n') + '\n(' + pg.dbs.length + ' rows)\n'); return 0; }
  if (/^SELECT\s+CURRENT_USER/i.test(st)) { c.out(' current_user \n--------------\n ' + cur + '\n(1 row)\n'); return 0; }
  if (/^SELECT\s+PG_RELOAD_CONF\(\)/i.test(st)) { pgReload(c.sh); c.out(' pg_reload_conf \n----------------\n t\n(1 row)\n'); return 0; }
  if (/^SHOW\s+PASSWORD_ENCRYPTION/i.test(st)) { c.out(' password_encryption \n---------------------\n scram-sha-256\n(1 row)\n'); return 0; }
  if (/^SHOW\s+LISTEN_ADDRESSES/i.test(st)) { c.out(' listen_addresses \n------------------\n *\n(1 row)\n'); return 0; }
  if ((m = /^SELECT\s+ROLNAME\s*,\s*ROLSUPER\s+FROM\s+PG_ROLES/i.exec(st))) {
    var nn = Object.keys(pg.roles).sort(); var o2 = ' rolname  | rolsuper \n----------+----------\n'; nn.forEach(function (n) { o2 += ' ' + pad(n, 9) + '| ' + (pg.roles[n].super ? 't' : 'f') + '\n'; }); c.out(o2 + '(' + nn.length + ' rows)\n'); return 0;
  }
  if ((m = /^(?:CREATE)\s+(?:ROLE|USER)\s+"?(\w+)"?\s*(.*)$/i.exec(st))) {
    if (role(m[1])) { c.err('ERROR:  role "' + m[1] + '" already exists\n'); return 1; }
    if (!pg.roles[cur].super && !pg.roles[cur].createrole) { c.err('ERROR:  permission denied to create role\n'); return 1; }
    var r = { super: false, login: /^USER$/i.test(/^CREATE\s+(\w+)/i.exec(st)[1]), createdb: false, createrole: false, pw: null }, o3 = m[2];
    if (/\bLOGIN\b/i.test(o3) && !/\bNOLOGIN\b/i.test(o3)) r.login = true; if (/\bNOLOGIN\b/i.test(o3)) r.login = false;
    if (/\bSUPERUSER\b/i.test(o3) && !/\bNOSUPERUSER\b/i.test(o3)) r.super = true;
    if (/\bCREATEDB\b/i.test(o3) && !/\bNOCREATEDB\b/i.test(o3)) r.createdb = true;
    var pw = /PASSWORD\s+'([^']*)'/i.exec(o3); if (pw) r.pw = pw[1];
    pg.roles[m[1]] = r; c.out('CREATE ROLE\n'); return 0;
  }
  if ((m = /^ALTER\s+(?:ROLE|USER)\s+"?(\w+)"?\s+(.*)$/i.exec(st))) {
    var t = role(m[1]); if (!t) { c.err('ERROR:  role "' + m[1] + '" does not exist\n'); return 1; }
    if (!pg.roles[cur].super && cur !== m[1]) { c.err('ERROR:  permission denied to alter role\n'); return 1; }
    var o4 = m[2], p2 = /PASSWORD\s+'([^']*)'/i.exec(o4);
    if (/\bNOSUPERUSER\b/i.test(o4)) t.super = false; else if (/\bSUPERUSER\b/i.test(o4)) t.super = true;
    if (/\bNOCREATEDB\b/i.test(o4)) t.createdb = false; else if (/\bCREATEDB\b/i.test(o4)) t.createdb = true;
    if (/\bNOCREATEROLE\b/i.test(o4)) t.createrole = false; else if (/\bCREATEROLE\b/i.test(o4)) t.createrole = true;
    if (/\bNOLOGIN\b/i.test(o4)) t.login = false; else if (/\bLOGIN\b/i.test(o4)) t.login = true;
    if (p2) { t.pw = p2[1]; if (c.sh.W.db && c.sh.W.db.user === m[1]) c.sh.W.db.password = p2[1]; }
    c.out('ALTER ROLE\n'); return 0;
  }
  if ((m = /^DROP\s+(?:ROLE|USER)\s+(?:IF EXISTS\s+)?"?(\w+)"?/i.exec(st))) { if (!role(m[1])) { c.err('ERROR:  role "' + m[1] + '" does not exist\n'); return 1; } delete pg.roles[m[1]]; c.out('DROP ROLE\n'); return 0; }
  if ((m = /^GRANT\s+(.+?)\s+ON\s+(ALL TABLES IN SCHEMA public|DATABASE\s+\w+|SCHEMA public)\s+TO\s+"?(\w+)"?/i.exec(st))) {
    if (!role(m[3]) && m[3].toUpperCase() !== 'PUBLIC') { c.err('ERROR:  role "' + m[3] + '" does not exist\n'); return 1; }
    pg.grants[m[3]] = pg.grants[m[3]] || []; pg.grants[m[3]].push((m[1] + ' ON ' + m[2]).toUpperCase()); c.out('GRANT\n'); return 0;
  }
  if ((m = /^REVOKE\s+(.+?)\s+ON\s+(DATABASE\s+\w+|SCHEMA public|ALL TABLES IN SCHEMA public)\s+FROM\s+"?(\w+)"?/i.exec(st))) {
    pg.revokes.push((m[1] + ' ON ' + m[2] + ' FROM ' + m[3]).toUpperCase());
    if (pg.grants[m[3]]) pg.grants[m[3]] = [];
    c.out('REVOKE\n'); return 0;
  }
  if (/^SELECT\s+1/i.test(st)) { c.out(' ?column? \n----------\n        1\n(1 row)\n'); return 0; }
  if (/^\\dt/.test(st)) { c.out('           List of relations\n Schema |   Name    | Type  | Owner\n--------+-----------+-------+-------\n public | users     | table | app\n public | bookings  | table | app\n(2 rows)\n'); return 0; }
  c.err('ERROR:  mô phỏng chưa hỗ trợ câu lệnh này (hỗ trợ: \\du, CREATE/ALTER/DROP ROLE, GRANT, REVOKE, SELECT pg_reload_conf())\n'); return 1;
}
V.pgInit = function (sh, o) {
  o = o || {};
  var W = sh.W;
  W.pg = { roles: o.roles || { postgres: { super: true, login: true, pw: 'Pg-Super-9xK2' }, app: { super: false, login: true, pw: 'Ab12cd34ef56' } }, dbs: ['postgres', 'tutor'], grants: {}, revokes: [], hbaPath: o.hbaPath, hbaLive: o.hba || '' };
  if (o.hbaPath && o.hba != null) sh.fs.put(o.hbaPath, o.hba, { owner: o.owner || 'root', mode: 420 });
};

// ===================== redis =====================
function redisLiveFor(sh, ct) {
  var cfg = cfgOf(sh, ct), live = { requirepass: '', bind: '0.0.0.0', protectedMode: 'yes', renamed: {} };
  var texts = [];
  var conf = null;
  (ct.binds || []).forEach(function (b) { if (/redis.*\.conf$/.test(b.cont)) conf = b.host; });
  cfg.vols.forEach(function (v) { var m = /^((?:\.{0,2})\/?[^:]+):(\/[^:]*redis[^:]*\.conf)/.exec(String(v)); if (m && !conf) conf = sh.abs(m[1]); });
  if (conf) { var n = sh.fs.get(conf); if (n) texts.push(n.c || ''); }
  var args = [];
  if (ct.cmdArgs && ct.cmdArgs.length) args = ct.cmdArgs.join(' ').split(/\s+/);
  var cm = ct.svcCfg && ct.svcCfg.command; if (cm) args = args.concat(Array.isArray(cm) ? cm : String(cm).split(/\s+/));
  texts.forEach(function (t) {
    lines(t).forEach(function (l) {
      l = l.replace(/#.*$/, '').trim(); var m;
      if ((m = /^requirepass\s+(\S+)/.exec(l))) live.requirepass = m[1].replace(/^"|"$/g, '');
      else if ((m = /^bind\s+(.+)$/.exec(l))) live.bind = m[1];
      else if ((m = /^protected-mode\s+(\w+)/.exec(l))) live.protectedMode = m[1];
      else if ((m = /^rename-command\s+(\w+)\s+"?(\w*)"?/.exec(l))) live.renamed[m[1].toUpperCase()] = m[2];
    });
  });
  for (var i = 0; i < args.length; i++) { if (args[i] === '--requirepass' && args[i + 1]) live.requirepass = args[i + 1]; if (args[i] === '--bind' && args[i + 1]) live.bind = args[i + 1]; if (args[i] === '--protected-mode' && args[i + 1]) live.protectedMode = args[i + 1]; }
  return live;
}
function afterStart(sh) {
  var W = sh.W;
  if (W.pg) pgReload(sh);
  (W.containers || []).forEach(function (ct) {
    if (/redis|cache/.test(ct.image + ' ' + ct.name) && /redis/.test(ct.image)) ct.redisLive = redisLiveFor(sh, ct);
  });
  // ứng dụng phụ thuộc: read-only rootfs + redis auth
  (W.containers || []).forEach(function (ct) {
    if (ct.state === 'exited' && ct.manualStop) return;
    if (!/^(api|gateway|backend|be)$/.test(ct.svc || '') || ct.state === 'restarting' && ct.crashBy !== 'sec3') return;
    var cfg = cfgOf(sh, ct), bad = null;
    if (cfg.readOnly && !cfg.tmpfs.some(function (t) { return String(t).split(':')[0] === '/tmp'; }) && ct.env && ct.env.NEED_TMP !== 'no') bad = ['[Nest] LOG  [NestFactory] Starting Nest application...', "Error: EROFS: read-only file system, mkdir '/tmp/nest-cache'", '    at Object.mkdirSync (node:fs:1396:3)'];
    var rd = (W.containers || []).filter(function (o) { return o.redisLive && o.proj === ct.proj; })[0];
    if (!bad && rd && ct.env && ct.env.REDIS_HOST) {
      var need = rd.redisLive.requirepass;
      if (need && ct.env.REDIS_PASSWORD == null) bad = ['[Nest] LOG  [NestFactory] Starting Nest application...', 'ReplyError: NOAUTH Authentication required.', '    at parseError (ioredis/built/redis/parser.js)'];
      else if (need && ct.env.REDIS_PASSWORD !== need) bad = ['[Nest] LOG  [NestFactory] Starting Nest application...', 'ReplyError: WRONGPASS invalid username-password pair or user is disabled.'];
    }
    if (!bad && W.pg && ct.env && ct.env.DB_PASSWORD != null) {
      var dr = W.pg.roles[ct.env.DB_USER || 'app'];
      if (dr && dr.pw !== ct.env.DB_PASSWORD) bad = ['[Nest] LOG  [NestFactory] Starting Nest application...', 'error: password authentication failed for user "' + (ct.env.DB_USER || 'app') + '"', '[Nest] ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...'];
    }
    if (bad) { ct.state = 'restarting'; ct.status = 'Restarting (1) 4 seconds ago'; ct.logs = bad; ct.crashBy = 'sec3'; }
    else if (ct.crashBy === 'sec3') { ct.state = 'running'; ct.status = 'Up 3 seconds'; ct.logs = ['[Nest] LOG  [NestFactory] Starting Nest application...', '[Nest] LOG  Nest application successfully started', 'Listening on port 8888']; ct.crashBy = null; }
  });
}
V.dkAfter = afterStart;
function redisCli(c, ct, a, env) {
  var sh = c.sh, live = ct.redisLive || (ct.redisLive = redisLiveFor(sh, ct)), pw = env.REDISCLI_AUTH || null, args = [], warn = true, i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-a') pw = a[++i]; else if (x === '--no-auth-warning') warn = false; else if (x === '-h' || x === '-p' || x === '-n') i++; else if (x.charAt(0) === '-') continue; else args.push(x);
  }
  if (pw != null && warn && !env.REDISCLI_AUTH) c.err("Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.\n");
  var cmd = (args[0] || 'PING').toUpperCase(), authed = !live.requirepass || pw === live.requirepass;
  if (cmd === 'AUTH') { if (!live.requirepass) { c.out('(error) ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?\n'); return 0; } c.out(args[1] === live.requirepass ? 'OK\n' : '(error) WRONGPASS invalid username-password pair or user is disabled.\n'); return 0; }
  if (live.requirepass && pw != null && pw !== live.requirepass) { c.out('(error) WRONGPASS invalid username-password pair or user is disabled.\n'); return 0; }
  if (!authed) { c.out('(error) NOAUTH Authentication required.\n'); return 0; }
  if (live.renamed[cmd] != null) { c.out("(error) ERR unknown command '" + (args[0] || '') + "', with args beginning with: " + args.slice(1).map(function (x) { return "'" + x + "'"; }).join(' ') + '\n'); return 0; }
  if (cmd === 'PING') { c.out('PONG\n'); return 0; }
  if (cmd === 'DBSIZE') { c.out('(integer) 42\n'); return 0; }
  if (cmd === 'KEYS') { c.out('1) "sess:7f3a"\n2) "sess:9b21"\n3) "ratelimit:203.0.113.7"\n'); return 0; }
  if (cmd === 'FLUSHALL' || cmd === 'FLUSHDB') { c.out('OK\n'); return 0; }
  if (cmd === 'INFO') { c.out('# Server\nredis_version:7.2.4\nredis_mode:standalone\ntcp_port:6379\n'); return 0; }
  if (cmd === 'CONFIG') {
    var sub = (args[1] || '').toUpperCase(), key = (args[2] || '').toLowerCase();
    if (sub === 'GET') {
      var v = key === 'requirepass' ? live.requirepass : key === 'bind' ? live.bind : key === 'protected-mode' ? live.protectedMode : '';
      c.out('1) "' + key + '"\n2) "' + v + '"\n'); return 0;
    }
    if (sub === 'SET') { if (key === 'requirepass') live.requirepass = args[3] || ''; c.out('OK\n'); return 0; }
  }
  if (cmd === 'SET') { c.out('OK\n'); return 0; }
  if (cmd === 'GET') { c.out('(nil)\n'); return 0; }
  c.out('(error) ERR mô phỏng chưa hỗ trợ lệnh này\n'); return 0;
}
V.redisLiveFor = redisLiveFor;

// ===================== trivy =====================
var VULN = {
  'node:18': [3, 21, 44, 80, 'debian 12.5'], 'node:20': [1, 9, 25, 70, 'debian 12.7'], 'node:22': [0, 4, 18, 55, 'debian 12.8'], 'node:20-alpine': [0, 2, 6, 4, 'alpine 3.20'], 'node:22-alpine': [0, 0, 2, 5, 'alpine 3.21'],
  'postgres:16': [0, 3, 10, 35, 'debian 12.8'], 'postgres:16-alpine': [0, 0, 3, 1, 'alpine 3.21'], 'redis:7': [1, 4, 9, 30, 'debian 12.7'], 'redis:7-alpine': [0, 1, 2, 0, 'alpine 3.20'],
  'nginx:latest': [0, 5, 14, 60, 'debian 12.8'], 'ubuntu:22.04': [0, 2, 12, 20, 'ubuntu 22.04'], 'louislam/uptime-kuma:1': [0, 6, 20, 40, 'debian 12.6']
};
var PKGS = [['libssl3', 'CRITICAL', '3.0.11-1~deb12u1', '3.0.13-1~deb12u1'], ['zlib1g', 'CRITICAL', '1:1.2.13.dfsg-1', '1:1.2.13.dfsg-1+deb12u1'], ['libc6', 'HIGH', '2.36-9+deb12u3', '2.36-9+deb12u7'], ['libexpat1', 'HIGH', '2.5.0-1', '2.5.0-1+deb12u1'], ['curl', 'HIGH', '7.88.1-10+deb12u4', '7.88.1-10+deb12u8'], ['libxml2', 'MEDIUM', '2.9.14+dfsg-1.3', '2.9.14+dfsg-1.3~deb12u1']];
V.trivyCounts = function (sh, ref) {
  var im = imgOf(sh.W, ref), key = im && im.base ? im.base : ref;
  if (key.indexOf(':') < 0) key += ':latest';
  var v = VULN[key];
  if (!v) { var short = key.replace(/-(slim|bookworm)$/, ''); v = VULN[short] || (im ? [0, 2, 5, 12, 'debian 12'] : null); }
  return v ? { crit: v[0], high: v[1], med: v[2], low: v[3], os: v[4], key: key } : null;
};
cmds.trivy = function (a, c) {
  var sh = c.sh;
  if (a[0] !== 'image' && a[0] !== 'i') throw new CmdErr('trivy mô phỏng chỉ hỗ trợ: trivy image [--severity HIGH,CRITICAL] [--ignore-unfixed] [--exit-code 1] IMAGE');
  var sev = null, exitCode = 0, ref = null, i, ign = false;
  for (i = 1; i < a.length; i++) {
    if (a[i] === '--severity') sev = a[++i].toUpperCase().split(','); else if (a[i] === '--exit-code') exitCode = +a[++i]; else if (a[i] === '--ignore-unfixed') ign = true; else if (a[i].charAt(0) === '-') { if (a[i] === '--format' || a[i] === '-f' || a[i] === '-o' || a[i] === '--scanners') i++; } else ref = a[i];
  }
  if (!ref) throw new CmdErr('trivy: thiếu tên image');
  if (!imgOf(sh.W, ref)) { c.err('FATAL\tImage scan error: unable to find the specified image "' + ref + '" in ["docker" "containerd" "podman" "remote"]\n'); return 1; }
  var vc = V.trivyCounts(sh, ref);
  var want = function (s) { return !sev || sev.indexOf(s) >= 0; };
  var cr = want('CRITICAL') ? vc.crit : 0, hi = want('HIGH') ? vc.high : 0, me = want('MEDIUM') ? vc.med : 0, lo = want('LOW') ? vc.low : 0;
  if (ign) { cr = Math.max(0, cr - 1); hi = Math.floor(hi / 2); }
  var total = cr + hi + me + lo, o = '# (số liệu minh hoạ của simulator; ngoài đời trivy tải CSDL lỗ hổng mới nhất)\n' + ref + ' (' + vc.os + ')\n' + '='.repeat(ref.length + vc.os.length + 3) + '\nTotal: ' + total + ' (' + (sev ? '' : 'UNKNOWN: 0, ') + (want('LOW') ? 'LOW: ' + lo + ', ' : '') + (want('MEDIUM') ? 'MEDIUM: ' + me + ', ' : '') + (want('HIGH') ? 'HIGH: ' + hi + ', ' : '') + (want('CRITICAL') ? 'CRITICAL: ' + cr : '') + ')\n';
  o = o.replace(/, \)$/m, ')');
  if (total) {
    o += '\n' + pad('Library', 14) + pad('Severity', 10) + pad('Installed Version', 22) + 'Fixed Version\n';
    PKGS.filter(function (p) { return want(p[1]) && ((p[1] === 'CRITICAL' && cr) || (p[1] === 'HIGH' && hi) || (p[1] === 'MEDIUM' && me)); }).forEach(function (p) { o += pad(p[0], 14) + pad(p[1], 10) + pad(p[2], 22) + p[3] + '\n'; });
  }
  c.out(o);
  return exitCode && (cr + hi > 0 || (sev && sev.indexOf('MEDIUM') >= 0 && me > 0)) ? exitCode : 0;
};

// ===================== TLS: openssl, nmap, curl =====================
var ALLV = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
function tlsInfo(sh, host) {
  var W = sh.W, live = W.nginx && W.nginx.live; if (!W.nginx.active || !live) return null;
  var cand = live.servers.filter(function (s) { return s.listens.some(function (l) { return l.port === 443 && l.ssl; }); });
  if (!cand.length) return null;
  var srv = cand.filter(function (s) { return s.names.indexOf(host) >= 0; })[0] || cand[0];
  function d(name) { var f = srv.stmts.filter(function (x) { return x.name === name; })[0]; return f ? f.args : (live.http.ssl && live.http.ssl[name]) || null; }
  var pr = d('ssl_protocols') || live.http.sslBase || ['TLSv1.2', 'TLSv1.3'];
  return { protocols: pr, ciphers: (d('ssl_ciphers') || ['HIGH:!aNULL:!MD5']).join(' '), srv: srv };
}
V.tlsInfo = tlsInfo;
cmds.openssl = function (a, c) {
  if (a[0] === 's_client') {
    var sh = c.sh, conn = null, sn = null, ver = null, i;
    for (i = 1; i < a.length; i++) {
      if (a[i] === '-connect') conn = a[++i]; else if (a[i] === '-servername') sn = a[++i];
      else if (/^-tls1(_[123])?$/.test(a[i])) ver = a[i] === '-tls1' ? 'TLSv1' : a[i] === '-tls1_1' ? 'TLSv1.1' : a[i] === '-tls1_2' ? 'TLSv1.2' : 'TLSv1.3';
    }
    if (!conn) throw new CmdErr('openssl s_client: thiếu -connect HOST:PORT');
    var m = /^([^:]+):(\d+)$/.exec(conn), host = m ? m[1] : conn, port = m ? +m[2] : 443;
    var ti = port === 443 ? tlsInfo(sh, sn || host) : null;
    if (!ti) { c.err('connect:errno=111\n'); return 1; }
    var allowed = ALLV.filter(function (v) { return ti.protocols.indexOf(v) >= 0; });
    var use = ver ? (allowed.indexOf(ver) >= 0 ? ver : null) : allowed[allowed.length - 1];
    if (!use) { c.out('CONNECTED(00000003)\n'); c.err('00A8F4CE6B7F0000:error:0A00042E:SSL routines:ssl3_read_bytes:tlsv1 alert protocol version:../ssl/record/rec_layer_s3.c:1584:SSL alert number 70\n'); c.out('---\nno peer certificate available\n---\nSSL handshake has read 7 bytes and written 0 bytes\nVerification: OK\n---\nNew, (NONE), Cipher is (NONE)\nSecure Renegotiation IS NOT supported\nNo ALPN negotiated\n'); return 1; }
    var cipher = use === 'TLSv1.3' ? 'TLS_AES_256_GCM_SHA384' : use === 'TLSv1.2' ? 'ECDHE-RSA-AES256-GCM-SHA384' : 'ECDHE-RSA-AES256-SHA';
    c.out('CONNECTED(00000003)\n---\nCertificate chain\n 0 s:CN = ' + (sn || host) + '\n   i:C = US, O = Let\'s Encrypt, CN = R11\n---\nNew, ' + use + ', Cipher is ' + cipher + '\nProtocol  : ' + use + '\nCipher    : ' + cipher + '\nVerification: OK\n---\n');
    return 0;
  }
  if (a[0] === 'x509') {
    var fi = a.indexOf('-in'), f = fi >= 0 ? a[fi + 1] : null, n = f && c.sh.fs.get(c.sh.abs(f));
    if (!n) { c.err('Could not open file or uri for loading certificate from ' + f + '\n'); return 1; }
    var dom = (/live\/([^\/]+)\//.exec(f) || [0, 'tutor.haiphan.org'])[1], days = (c.sh.W.certDays && c.sh.W.certDays[dom]) || 62;
    if (a.indexOf('-enddate') >= 0) c.out('notAfter=Dec 28 04:20:00 2026 GMT\n');
    if (a.indexOf('-subject') >= 0) c.out('subject=CN = ' + dom + '\n');
    if (a.indexOf('-dates') >= 0) c.out('notBefore=Sep 29 04:20:00 2026 GMT\nnotAfter=Dec 28 04:20:00 2026 GMT\n');
    return 0;
  }
  return prevOpenssl(a, c);
};
cmds.nmap = function (a, c) {
  var sh = c.sh, host = a.filter(function (x) { return x.charAt(0) !== '-' && !/^ssl-enum-ciphers$|^\d+$/.test(x); }).pop() || '127.0.0.1';
  if (a.indexOf('--script') < 0) { c.out('Mô phỏng: nmap chỉ hỗ trợ  nmap --script ssl-enum-ciphers -p 443 HOST\n'); return 0; }
  var ti = tlsInfo(sh, host);
  if (!ti) { c.out('Starting Nmap 7.94 ( https://nmap.org )\nNmap scan report for ' + host + '\nPORT    STATE  SERVICE\n443/tcp closed https\n'); return 0; }
  var weak = /3DES|RC4|DES-CBC3|\bALL\b|\bNULL\b/.test(ti.ciphers), o = 'Starting Nmap 7.94 ( https://nmap.org )\nNmap scan report for ' + host + '\nPORT    STATE SERVICE\n443/tcp open  https\n| ssl-enum-ciphers:\n', least = 'A';
  ALLV.forEach(function (v) {
    if (ti.protocols.indexOf(v) < 0) return;
    o += '|   ' + v + ':\n|     ciphers:\n';
    if (v === 'TLSv1.3') o += '|       TLS_AKE_WITH_AES_256_GCM_SHA384 (ecdh_x25519) - A\n|       TLS_AKE_WITH_CHACHA20_POLY1305_SHA256 (ecdh_x25519) - A\n';
    else if (v === 'TLSv1.2') o += '|       TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (secp256r1) - A\n|       TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256 (secp256r1) - A\n';
    else { o += '|       TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA (secp256r1) - A\n'; }
    if (weak && v !== 'TLSv1.3') { o += '|       TLS_RSA_WITH_3DES_EDE_CBC_SHA (rsa 2048) - C\n'; if (least < 'C') least = 'C'; }
    o += '|     compressors:\n|       NULL\n|     cipher preference: server\n';
    if (v === 'TLSv1' || v === 'TLSv1.1') { o += '|     warnings:\n|       TLS ' + v.replace('TLSv', '') + ' is deprecated (RFC 8996)\n'; if (least < 'C') least = 'C'; }
  });
  o += '|_  least strength: ' + least + '\n\nNmap done: 1 IP address (1 host up) scanned in 1.82 seconds\n';
  c.out(o); return 0;
};
cmds.curl = function (a, c) {
  var sh = c.sh, args = [], tmin = null, tmax = null, i;
  for (i = 0; i < a.length; i++) {
    var x = a[i], mm;
    if ((mm = /^--tlsv1(?:\.(\d))?$/.exec(x))) tmin = mm[1] ? 'TLSv1.' + mm[1] : 'TLSv1';
    else if (x === '--tls-max') { var tv = a[++i]; tmax = tv === '1.0' ? 'TLSv1' : 'TLSv' + tv; }
    else if (x === '--tlsv1.0') tmin = 'TLSv1';
    else args.push(x);
  }
  if (tmin === 'TLSv1.0') tmin = 'TLSv1';
  if (tmin || tmax) {
    var url = args.filter(function (x) { return /^https:\/\//.test(x); })[0];
    if (url) {
      var hi = args.indexOf('-H'); var hostH = null; args.forEach(function (x, j) { if ((args[j - 1] === '-H' || args[j - 1] === '--header') && /^host:/i.test(x)) hostH = x.split(':')[1].trim(); });
      var host = hostH || (/^https:\/\/([^\/:]+)/.exec(url) || [0, ''])[1], ti = tlsInfo(sh, host);
      if (ti) {
        var lo = tmin ? ALLV.indexOf(tmin) : 0, hiI = tmax ? ALLV.indexOf(tmax) : 3;
        var ok = ALLV.some(function (v, k) { return k >= lo && k <= hiI && ti.protocols.indexOf(v) >= 0; });
        if (!ok) { if (args.indexOf('-s') < 0 || args.some(function (x) { return /^-\w*S/.test(x); })) c.err('curl: (35) OpenSSL/3.0.13: error:0A00042E:SSL routines::tlsv1 alert protocol version\n'); return 35; }
      }
    }
  }
  return prevCurl(args, c);
};
// ===================== cfpass: mô phỏng yêu cầu đi qua Cloudflare =====================
V.CF_RANGES = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
cmds.cfpass = function (a, c) {
  var sh = c.sh, W = sh.W, from = '203.0.113.7', edge = '172.67.10.1', rest = [], noCert = false, i;
  for (i = 0; i < a.length; i++) { if (a[i] === '--from') from = a[++i]; else if (a[i] === '--edge') edge = a[++i]; else if (a[i] === '--no-origin-cert') noCert = true; else rest.push(a[i]); }
  var live = W.nginx.live, ip = edge;
  if (live && live.http) {
    var viaHdr = live.http.realHeader === 'CF-Connecting-IP' || live.servers.some(function (s) { return s.stmts.some(function (x) { return x.name === 'real_ip_header' && x.args[0] === 'CF-Connecting-IP'; }); });
    var froms = live.http.realFrom.slice();
    live.servers.forEach(function (s) { s.stmts.forEach(function (x) { if (x.name === 'set_real_ip_from') froms.push(x.args[0]); }); });
    if (viaHdr && froms.some(function (f) { return inCidr(edge, f); })) ip = from;
  }
  var save = W.nginx.clientIp, saveCert = W.nginx.clientCert;
  W.nginx.clientIp = ip; W.nginx.clientCert = !noCert;
  try { return cmds.curl(['-H', 'CF-Connecting-IP: ' + from].concat(rest), c); }
  finally { W.nginx.clientIp = save; W.nginx.clientCert = saveCert; }
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
