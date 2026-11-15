(function (G) {
'use strict';
var VPS = G.VPS, cmds = VPS.cmds, CmdErr = VPS.CmdErr, pad = VPS.util.pad, DK = VPS.dk;
var prev = cmds.docker;

/* ---------- nhóm docker ---------- */
function inGroup(W) { return W.dockerGroup !== false; }
cmds.id = function (a, c) {
  var u = c.sudo ? 'root' : c.sh.user, W = c.sh.W;
  if (u === 'root') c.out('uid=0(root) gid=0(root) groups=0(root)\n');
  else c.out('uid=1000(' + u + ') gid=1000(' + u + ') groups=1000(' + u + '),4(adm),27(sudo)' + (inGroup(W) ? ',988(docker)' : '') + '\n');
  return 0;
};
cmds.groups = function (a, c) {
  var W = c.sh.W, u = a[0] || c.sh.user, session = !a[0];
  var ok = session ? inGroup(W) : (inGroup(W) || W.dockerListed);
  c.out((a[0] ? u + ' : ' : '') + u + ' adm sudo' + (ok ? ' docker' : '') + '\n'); return 0;
};
cmds.usermod = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!sh.isRoot(c)) throw new CmdErr('usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.');
  var gi = a.indexOf('-aG') >= 0 ? a.indexOf('-aG') : (a.indexOf('-a') >= 0 && a.indexOf('-G') >= 0 ? a.indexOf('-G') : -1);
  if (gi < 0 && a.indexOf('-G') >= 0) throw new CmdErr('usermod: CẢNH BÁO (mô phỏng): -G không có -a sẽ GHI ĐÈ toàn bộ nhóm phụ của user (mất nhóm sudo). Hãy dùng -aG.');
  if (gi < 0) throw new CmdErr('Mô phỏng: hỗ trợ usermod -aG docker TÊN_USER');
  if (a[gi + 1] === 'docker') { W.dockerListed = true; return 0; }
  return 0;
};
cmds.newgrp = function (a, c) {
  var W = c.sh.W;
  if (a[0] === 'docker' && (W.dockerListed || inGroup(W))) { W.dockerGroup = true; return 0; }
  throw new CmdErr('newgrp: failed to crypt password with previous salt: Invalid argument');
};

/* ---------- container giả lập ---------- */
function find(W, n) { return W.containers.filter(function (c) { return c.name === n || c.id.indexOf(n) === 0; })[0]; }
function defUser(ct) { return /postgres/.test(ct.name) ? 'postgres' : /redis|cache/.test(ct.image + ct.name) ? 'redis' : /^tutor-/.test(ct.image) ? 'node' : 'root'; }
var PKG = '{\n  "name": "tutor-api",\n  "version": "1.0.0",\n  "scripts": { "build": "nest build", "start:prod": "node dist/main" }\n}\n';
var OSR = 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3\nPRETTY_NAME="Alpine Linux v3.20"\n';
function dirList(sh, ct, p) {
  p = p.replace(/\/+$/, '') || '/';
  var tut = /^tutor-/.test(ct.image);
  var host = (ct.binds || []).filter(function (b) { return b.cont === p; })[0];
  if (host) { var n = sh.fs.get(host.host); return n ? sh.fs.list(host.host) : []; }
  if (tut) {
    if (p === '/app') { var l = ['dist', 'node_modules', 'package.json']; (ct.binds || []).forEach(function (b) { if (b.cont.indexOf('/app/') === 0) l.push(b.cont.slice(5)); }); return l.sort(); }
    if (p === '/app/dist') return ['main.js'];
    if (p === '/') return ['app', 'bin', 'etc', 'home', 'tmp', 'usr', 'var'];
  } else {
    if (p === '/') return ['bin', 'data', 'etc', 'home', 'tmp', 'usr', 'var'];
    if (p === '/var/lib/postgresql/data') return ['PG_VERSION', 'base', 'global', 'pg_wal', 'postgresql.conf'];
    if (p === '/data') return [];
  }
  if (p === '/tmp') return Object.keys(ct.files || {}).filter(function (k) { return k.indexOf('/tmp/') === 0; }).map(function (k) { return k.slice(5); });
  if (p === '/etc') return ['hostname', 'os-release', 'passwd'];
  return null;
}
function cpath(ct, p) { if (p.charAt(0) === '/') return p; return (/^tutor-/.test(ct.image) ? '/app' : '/') + '/' + p; }
var DUMP = '-- PostgreSQL database dump\n-- TUTOR_DB_DUMP\nSET statement_timeout = 0;\nCREATE TABLE public.users (id integer NOT NULL, email text, role text);\nCREATE TABLE public.sessions (id integer NOT NULL, user_id integer, starts_at timestamptz);\nCREATE TABLE public.bookings (id integer NOT NULL, session_id integer, student text);\nCOPY public.users (id, email, role) FROM stdin;\n-- (128 dòng)\nCOPY public.sessions (id, user_id, starts_at) FROM stdin;\n-- (342 dòng)\nCOPY public.bookings (id, session_id, student) FROM stdin;\n-- (57 dòng)\n';
VPS.DUMP = DUMP;
function restore(c, W) { W.db.hasData = true; c.out('SET\nSET\nCREATE TABLE\nCREATE TABLE\nCREATE TABLE\nCOPY 128\nCOPY 342\nCOPY 57\nALTER TABLE\n'); return 0; }

function doExec(c, W, rest) {
  var sh = c.sh, flags = { u: null }, args = [], i, x;
  for (i = 0; i < rest.length; i++) {
    x = rest[i];
    if (/^-(it|ti|i|t|T|d)$/.test(x)) continue;
    if (x === '-u' || x === '--user') { flags.u = rest[++i]; continue; }
    if (x === '-w' || x === '-e' || x === '--workdir' || x === '--env') { i++; continue; }
    args = rest.slice(i); break;
  }
  if (args.length < 1) throw new CmdErr('docker: "exec" requires at least 2 arguments.');
  var ct = find(W, args[0]);
  if (!ct) throw new CmdErr('Error response from daemon: No such container: ' + args[0]);
  if (ct.state !== 'running') throw new CmdErr('Error response from daemon: container ' + ct.id + ' is not running');
  var cmd = args.slice(1);
  if (!cmd.length) throw new CmdErr('docker: "exec" requires at least 2 arguments.');
  if (/^(sh|bash|ash)$/.test(cmd[0])) {
    if (cmd[1] === '-c' && cmd[2]) cmd = cmd[2].trim().split(/\s+/);
    else { c.out('(mô phỏng) Không mở được phiên tương tác trong khung này. Hãy chạy từng lệnh, ví dụ:\n  docker exec ' + ct.name + ' ls /app\n  docker exec ' + ct.name + ' whoami\n  docker exec ' + ct.name + ' env\n'); return 0; }
  }
  var user = flags.u || defUser(ct), prog = cmd[0], a = cmd.slice(1);
  if (prog === 'psql') {
    var sql = null, file = null;
    for (i = 0; i < a.length; i++) { if (a[i] === '-c') sql = a[++i]; else if (a[i] === '-f') file = a[++i]; }
    if (sql != null) {
      if (/^\\dt/.test(sql) && W.db && W.db.hasData === false) { c.out('Did not find any relations.\n'); return 0; }
      if (/select\s+count\(\*\)\s+from\s+users/i.test(sql)) {
        if (W.db && W.db.hasData === false) { c.err('ERROR:  relation "users" does not exist\nLINE 1: select count(*) from users;\n                             ^\n'); return 1; }
        c.out(' count \n-------\n   128\n(1 row)\n'); return 0;
      }
      return prev(['exec', ct.name, 'psql'].concat(a), c);
    }
    if (file) { var fc = (ct.files || {})[file]; if (fc == null) throw new CmdErr(file + ': No such file or directory'); return /TUTOR_DB_DUMP/.test(fc) ? restore(c, W) : (c.out('(không có gì để nạp)\n'), 0); }
    if (c.stdin) return /TUTOR_DB_DUMP/.test(c.stdin) ? restore(c, W) : (c.out('(không có gì để nạp)\n'), 0);
    c.out('(mô phỏng) psql tương tác không mở được. Dùng: docker exec ' + ct.name + ' psql -U app -c "SQL"\n'); return 0;
  }
  if (prog === 'pg_restore') return VPS.pgRestoreStdin(c, W, restore);
  if (prog === 'pg_dump') { c.out(W.db && W.db.hasData === false ? '-- PostgreSQL database dump\n-- (database rỗng)\n' : DUMP); return 0; }
  if (prog === 'pg_isready') { c.out('/var/run/postgresql:5432 - accepting connections\n'); return 0; }
  if (prog === 'redis-cli') { c.out(a[0] === 'ping' ? 'PONG\n' : 'OK\n'); return 0; }
  if (prog === 'whoami') { c.out(user + '\n'); return 0; }
  if (prog === 'id') { var uid = user === 'root' ? 0 : 1000; c.out('uid=' + uid + '(' + user + ') gid=' + uid + '(' + user + ')\n'); return 0; }
  if (prog === 'pwd') { c.out((/^tutor-/.test(ct.image) ? '/app' : '/') + '\n'); return 0; }
  if (prog === 'hostname') { c.out(ct.id + '\n'); return 0; }
  if (prog === 'node') { c.out(a[0] === '-v' ? 'v20.18.0\n' : '(mô phỏng) node chạy script\n'); return 0; }
  if (prog === 'date') { c.out('Mon Oct 26 09:12:44 UTC 2026\n'); return 0; }
  if (prog === 'env' || prog === 'printenv') { for (var k in ct.env) c.out(k + '=' + ct.env[k] + '\n'); c.out('PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOME=/home/' + user + '\n'); return 0; }
  if (prog === 'cat') {
    var rc = 0; a.forEach(function (p) {
      var fp = cpath(ct, p), f = (ct.files || {})[fp];
      if (f != null) c.out(f); else if (fp === '/etc/os-release') c.out(OSR); else if (fp === '/app/package.json' && /^tutor-/.test(ct.image)) c.out(PKG);
      else { var hb = (ct.binds || []).filter(function (b) { return fp.indexOf(b.cont + '/') === 0; })[0]; var hn = hb && sh.fs.get(hb.host + fp.slice(hb.cont.length)); if (hn && hn.t === 'f') c.out(hn.c); else { c.err('cat: can\'t open \'' + p + '\': No such file or directory\n'); rc = 1; } }
    }); return rc;
  }
  if (prog === 'ls') {
    var long = a.some(function (x) { return /^-\w*l/.test(x); }), dflag = a.some(function (x) { return /^-\w*d/.test(x); }), paths = a.filter(function (x) { return x.charAt(0) !== '-'; });
    if (!paths.length) paths = [cpath(ct, '.').replace(/\/\.$/, '')];
    var rc2 = 0;
    paths.forEach(function (p) {
      var fp = cpath(ct, p).replace(/\/+$/, '') || '/', list = dirList(sh, ct, fp);
      if (list === null && !dflag) { c.err("ls: " + p + ": No such file or directory\n"); rc2 = 1; return; }
      if (dflag) {
        var hb = (ct.binds || []).filter(function (b) { return b.cont === fp; })[0], hn = hb && sh.fs.get(hb.host);
        var own = hn ? (hn.owner === sh.user ? 'node node' : 'root root') : 'root root';
        c.out(long ? 'drwxr-xr-x    2 ' + own + '     4096 Oct 26 09:12 ' + p + '\n' : p + '\n'); return;
      }
      if (paths.length > 1) c.out(p + ':\n');
      if (long) { var hb2 = (ct.binds || []).filter(function (b) { return b.cont === fp; })[0], hn2 = hb2 && sh.fs.get(hb2.host); var o2 = hn2 ? (hn2.owner === sh.user ? 'node node' : 'root root') : 'root root'; c.out('total ' + list.length * 4 + '\n'); list.forEach(function (n) { c.out((/\./.test(n) ? '-rw-r--r--' : 'drwxr-xr-x') + '    1 ' + o2 + '     1024 Oct 26 09:12 ' + n + '\n'); }); }
      else c.out(list.join('  ') + (list.length ? '\n' : ''));
    });
    return rc2;
  }
  c.err('OCI runtime exec failed: exec failed: unable to start container process: exec: "' + prog + '": executable file not found in $PATH: unknown\n'); return 126;
}

/* ---------- registry ---------- */
function registryOf(name) { var m = /^([a-z0-9.-]+\.[a-z]+(?::\d+)?)\//.exec(name); return m ? m[1] : null; }

cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W, sub = a[0], rest = a.slice(1);
  if (sub !== '--version' && sub !== 'version' && W.dockerGroup === false && !c.sudo && sh.user !== 'root')
    throw new CmdErr('permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json": dial unix /var/run/docker.sock: connect: permission denied');

  /* logs: bỏ các cờ chưa hỗ trợ */
  function stripLog(arr) { var o = []; for (var i = 0; i < arr.length; i++) { var x = arr[i]; if (x === '--since' || x === '--until') { i++; continue; } if (/^(-f|--follow|-t|--timestamps|--details)$/.test(x)) continue; o.push(x); } return o; }
  if (sub === 'logs') return prev(['logs'].concat(stripLog(rest)), c);
  if (sub === 'compose') {
    var ci = rest.indexOf('logs');
    var r = ci >= 0 ? rest.slice(0, ci + 1).concat(stripLog(rest.slice(ci + 1))) : rest;
    var rv = prev(['compose'].concat(r), c);
    if (rest.indexOf('down') >= 0 && (rest.indexOf('-v') >= 0 || rest.indexOf('--volumes') >= 0) && W.db) { W.db.hasData = false; W.db.initialized = false; }
    return rv;
  }
  if (sub === 'exec') return doExec(c, W, rest);
  if (sub === 'cp') {
    if (rest.length < 2) throw new CmdErr('"docker cp" requires exactly 2 arguments.');
    var src = rest[0], dst = rest[1], m1 = /^([^:\/]+):(.*)$/.exec(src), m2 = /^([^:\/]+):(.*)$/.exec(dst);
    if (m1) {
      var ct = find(W, m1[1]); if (!ct) throw new CmdErr('Error response from daemon: No such container: ' + m1[1]);
      var fp = cpath(ct, m1[2]), content = (ct.files || {})[fp];
      if (content == null && fp === '/app/package.json' && /^tutor-/.test(ct.image)) content = PKG;
      if (content == null && fp === '/etc/os-release') content = OSR;
      if (content == null) throw new CmdErr('Error response from daemon: Could not find the file ' + fp + ' in container ' + ct.name);
      var d = sh.abs(dst); if (sh.fs.isD(d)) d = d + '/' + fp.split('/').pop();
      if (!sh.canWrite(d, c)) throw new CmdErr('open ' + dst + ': permission denied');
      sh.fs.put(d, content, { owner: sh.user }); return 0;
    }
    if (m2) {
      var ct2 = find(W, m2[1]); if (!ct2) throw new CmdErr('Error response from daemon: No such container: ' + m2[1]);
      var s0 = sh.abs(src), n0 = sh.fs.get(s0); if (!n0 || n0.t !== 'f') throw new CmdErr('lstat ' + s0 + ': no such file or directory');
      var dp = m2[2]; if (/\/$/.test(dp)) dp += s0.split('/').pop();
      ct2.files = ct2.files || {}; ct2.files[dp] = n0.c; return 0;
    }
    throw new CmdErr('must specify at least one container source');
  }
  if (sub === 'tag') {
    if (rest.length !== 2) throw new CmdErr('"docker tag" requires exactly 2 arguments.');
    if (!DK.has(W, rest[0])) throw new CmdErr('Error response from daemon: No such image: ' + rest[0]);
    var sp = DK.split(rest[0]), dp2 = DK.split(rest[1]), srcImg = DK.imgs(W).filter(function (x) { return x.repo === sp[0] && x.tag === sp[1]; })[0];
    DK.imgs(W).push({ repo: dp2[0], tag: dp2[1], id: srcImg.id, size: srcImg.size, crash: srcImg.crash }); return 0;
  }
  if (sub === 'login') {
    var server = null, user = null, pw = null, stdinPw = false;
    for (var i = 0; i < rest.length; i++) { var x = rest[i]; if (x === '-u' || x === '--username') user = rest[++i]; else if (x === '-p' || x === '--password') pw = rest[++i]; else if (x === '--password-stdin') stdinPw = true; else if (x.charAt(0) !== '-') server = x; }
    server = server || 'docker.io';
    if (!user) throw new CmdErr('Error: Cannot perform an interactive login from a non TTY device');
    if (stdinPw && !String(c.stdin || '').trim()) throw new CmdErr('Error: Password required');
    if (!stdinPw && !pw) throw new CmdErr('Error: Cannot perform an interactive login from a non TTY device');
    if (pw) c.err('WARNING! Using --password via the CLI is insecure. Use --password-stdin.\n');
    W.dockerLogin = server; c.out('Login Succeeded\n'); return 0;
  }
  if (sub === 'push') {
    var nm = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
    if (!nm) throw new CmdErr('"docker push" requires exactly 1 argument.');
    if (!DK.has(W, nm)) throw new CmdErr('An image does not exist locally with the tag: ' + DK.split(nm)[0]);
    var reg = registryOf(nm);
    if (!reg) throw new CmdErr('The push refers to repository [docker.io/library/' + DK.split(nm)[0] + ']\ndenied: requested access to the resource is denied');
    if (W.dockerLogin !== reg) throw new CmdErr('The push refers to repository [' + DK.split(nm)[0] + ']\nunauthorized: authentication required (hãy docker login ' + reg + ' trước)');
    W.pushed = W.pushed || []; if (W.pushed.indexOf(nm) < 0) W.pushed.push(nm);
    c.out('The push refers to repository [' + DK.split(nm)[0] + ']\n5f70bf18a086: Pushed\n8b2c1d4e9a03: Pushed\n' + DK.split(nm)[1] + ': digest: sha256:' + DK.hid(nm).repeat(5).slice(0, 64) + ' size: 1362\n'); return 0;
  }
  if (sub === 'pull' && registryOf(rest[0] || '')) {
    var nn = rest[0];
    if (DK.has(W, nn)) { c.out(DK.split(nn)[1] + ': Pulling from ' + DK.split(nn)[0] + '\nStatus: Image is up to date for ' + nn + '\n'); return 0; }
    if ((W.pushed || []).indexOf(nn) >= 0 || (W.registry || []).indexOf(nn) >= 0) { c.out(DK.split(nn)[1] + ': Pulling from ' + DK.split(nn)[0] + '\nStatus: Downloaded newer image for ' + nn + '\n'); DK.addImg(W, nn, '412MB'); return 0; }
    throw new CmdErr('Error response from daemon: manifest unknown (hoặc cần đăng nhập): ' + nn);
  }
  if (sub === 'volume') {
    W.volumes = W.volumes || [];
    var vs = rest[0], vn = rest[1];
    var pg = W.db && W.db.initialized ? ['gateway_pgdata'] : [];
    if (vs === 'ls') { var o = 'DRIVER    VOLUME NAME\n'; pg.concat(W.volumes).forEach(function (v) { o += 'local     ' + v + '\n'; }); c.out(o); return 0; }
    if (vs === 'create') { if (!vn) throw new CmdErr('"docker volume create" requires at most 1 argument.'); if (W.volumes.indexOf(vn) < 0) W.volumes.push(vn); c.out(vn + '\n'); return 0; }
    if (vs === 'inspect') {
      if (pg.concat(W.volumes).indexOf(vn) < 0) throw new CmdErr('Error response from daemon: get ' + vn + ': no such volume');
      c.out('[\n    {\n        "CreatedAt": "2026-10-20T09:12:03+07:00",\n        "Driver": "local",\n        "Mountpoint": "/var/lib/docker/volumes/' + vn + '/_data",\n        "Name": "' + vn + '",\n        "Scope": "local"\n    }\n]\n'); return 0;
    }
    if (vs === 'rm') {
      if (W.volumes.indexOf(vn) >= 0) { W.volumes = W.volumes.filter(function (v) { return v !== vn; }); c.out(vn + '\n'); return 0; }
      if (vn === 'gateway_pgdata' && W.db && W.db.initialized) {
        var users = W.containers.filter(function (x) { return x.proj === 'gateway'; });
        if (users.length) throw new CmdErr('Error response from daemon: remove ' + vn + ': volume is in use - [' + users.map(function (x) { return x.id; }).join(', ') + ']');
        W.db.initialized = false; W.db.hasData = false; c.out(vn + '\n'); return 0;
      }
      throw new CmdErr('Error response from daemon: get ' + vn + ': no such volume');
    }
  }
  if (sub === 'network' && rest[0] === 'inspect') {
    var nname = rest[1], projs = {}; W.containers.forEach(function (x) { if (x.proj) projs[x.proj + '_default'] = 1; });
    if (nname !== 'bridge' && !projs[nname]) throw new CmdErr('Error response from daemon: network ' + nname + ' not found');
    var cs = W.containers.filter(function (x) { return nname === 'bridge' ? !x.proj : x.proj + '_default' === nname; });
    c.out('[\n    {\n        "Name": "' + nname + '",\n        "Driver": "bridge",\n        "IPAM": { "Config": [ { "Subnet": "172.18.0.0/16", "Gateway": "172.18.0.1" } ] },\n        "Containers": {\n' + cs.map(function (x) { return '            "' + x.id + '...": { "Name": "' + x.name + '", "IPv4Address": "' + (x.ip || '172.17.0.2') + '/16" }'; }).join(',\n') + '\n        }\n    }\n]\n'); return 0;
  }
  return prev(a, c);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
