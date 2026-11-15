(function (G) {
'use strict';
var VPS = G.VPS, cmds = VPS.cmds, CmdErr = VPS.CmdErr, SP = VPS.Shell.prototype, pad = VPS.util.pad, lines = VPS.lines;
var prev = {};
['id', 'groups', 'usermod', 'sudo', 'sshd', 'ssh', 'ufw', 'fail2ban-client', 'ps', 'apt', 'systemctl'].forEach(function (k) { prev[k] = cmds[k]; });
var prevListeners = SP.listeners;

function sec(W) {
  if (!W.sec) W.sec = {
    users: { haidangphan: { uid: 1000, sudo: true, locked: false, groups: [] } },
    nextUid: 1001, tunnels: [], cron: {}, procs: [], lastRows: null,
    upg: [
      ['openssh-server', '1:9.6p1-3ubuntu13.5', '1:9.6p1-3ubuntu13.4'],
      ['openssl', '3.0.13-0ubuntu3.5', '3.0.13-0ubuntu3.4'],
      ['libssl3t64', '3.0.13-0ubuntu3.5', '3.0.13-0ubuntu3.4'],
      ['sudo', '1.9.15p5-3ubuntu5.24.04.1', '1.9.15p5-3ubuntu5'],
      ['nginx', '1.24.0-2ubuntu7.1', '1.24.0-2ubuntu7'],
      ['curl', '8.5.0-2ubuntu10.5', '8.5.0-2ubuntu10.4'],
      ['linux-image-generic', '6.8.0-48.48', '6.8.0-45.45']
    ],
    updated: false, unattended: false, logging: 'off'
  };
  return W.sec;
}
function need(c, msg) { if (!c.sh.isRoot(c)) throw new CmdErr(msg); }
function ignoreErr(c) { var o = Object.create(c); o.out = function () {}; o.err = function () {}; return o; }

/* ---------- users ---------- */
function sync(sh) {
  var S = sec(sh.W), p = ['root:x:0:0:root:/root:/bin/bash', 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin', 'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin', 'sshd:x:111:65534::/run/sshd:/usr/sbin/nologin'];
  var g = ['root:x:0:', 'adm:x:4:', 'www-data:x:33:'], sudoM = [], dockM = [];
  Object.keys(S.users).forEach(function (n) {
    var u = S.users[n]; p.push(n + ':x:' + u.uid + ':' + u.uid + ':' + n + ',,,:/home/' + n + ':/bin/bash');
    if (u.sudo) sudoM.push(n);
    if (u.groups.indexOf('docker') >= 0 || (n === 'haidangphan' && sh.W.dockerListed !== false)) dockM.push(n);
  });
  g.push('sudo:x:27:' + sudoM.join(','));
  g.push('docker:x:988:' + dockM.join(','));
  Object.keys(S.users).forEach(function (n) { g.push(n + ':x:' + S.users[n].uid + ':'); });
  sh.fs.put('/etc/passwd', p.join('\n') + '\n', { owner: 'root', mode: 420 });
  sh.fs.put('/etc/group', g.join('\n') + '\n', { owner: 'root', mode: 420 });
}
function addUser(a, c) {
  var sh = c.sh, S = sec(sh.W), name = null, i;
  need(c, 'adduser: Only root may add a user or group to the system.');
  for (i = 0; i < a.length; i++) { if (a[i] === '--gecos' || a[i] === '--shell' || a[i] === '-s' || a[i] === '-c') { i++; continue; } if (a[i].charAt(0) !== '-') name = a[i]; }
  if (!name) throw new CmdErr('adduser: Only one or two names allowed.');
  if (!/^[a-z_][a-z0-9_-]*$/.test(name)) throw new CmdErr("adduser: To avoid problems, the username should consist only of letters, digits, underscores, periods, at signs and dashes, and not start with a dash.");
  if (S.users[name] || name === 'root') throw new CmdErr("adduser: The user `" + name + "' already exists.");
  var uid = S.nextUid++;
  S.users[name] = { uid: uid, sudo: false, locked: false, groups: [] };
  sh.fs.mkdirp('/home/' + name, name, 493);
  sync(sh);
  var dis = a.indexOf('--disabled-password') >= 0;
  c.out("Adding user `" + name + "' ...\nAdding new group `" + name + "' (" + uid + ") ...\nAdding new user `" + name + "' (" + uid + ") with group `" + name + " (" + uid + ")' ...\nCreating home directory `/home/" + name + "' ...\nCopying files from `/etc/skel' ...\n" +
    (dis ? '' : '(mô phỏng: bước nhập mật khẩu được bỏ qua; ngoài đời adduser sẽ hỏi mật khẩu 2 lần)\n') + 'Cấp quyền sudo bằng: sudo usermod -aG sudo ' + name + '\n');
  return 0;
}
cmds.adduser = addUser;
cmds.useradd = addUser;
cmds.deluser = function (a, c) {
  var sh = c.sh, S = sec(sh.W), name = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  need(c, 'deluser: Only root may remove a user or group from the system.');
  if (!name || !S.users[name]) throw new CmdErr('deluser: The user `' + name + "' does not exist.");
  if (name === sh.user) throw new CmdErr('deluser: bạn đang đăng nhập bằng tài khoản này, không thể xoá');
  delete S.users[name];
  if (a.indexOf('--remove-home') >= 0) sh.fs.rm('/home/' + name);
  sync(sh);
  c.out("Removing user `" + name + "' ...\nDone.\n"); return 0;
};
cmds.usermod = function (a, c) {
  var sh = c.sh, S = sec(sh.W);
  need(c, 'usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.');
  var name = a[a.length - 1];
  var gi = a.indexOf('-aG') >= 0 ? a.indexOf('-aG') : (a.indexOf('-a') >= 0 && a.indexOf('-G') >= 0 ? a.indexOf('-G') : -1);
  if (gi < 0 && a.indexOf('-G') >= 0) throw new CmdErr('usermod: CẢNH BÁO (mô phỏng): -G không có -a sẽ GHI ĐÈ toàn bộ nhóm phụ của user (mất nhóm sudo). Hãy dùng -aG.');
  if (a.indexOf('-L') >= 0 || a.indexOf('-U') >= 0) {
    var u0 = S.users[name]; if (!u0) throw new CmdErr("usermod: user '" + name + "' does not exist");
    u0.locked = a.indexOf('-L') >= 0; return 0;
  }
  if (gi < 0) throw new CmdErr('Mô phỏng: hỗ trợ usermod -aG NHÓM TÊN_USER, usermod -L/-U TÊN_USER');
  var u = S.users[name];
  if (!u) throw new CmdErr("usermod: user '" + name + "' does not exist");
  var groups = (a[gi + 1] || '').split(',');
  groups.forEach(function (g) {
    if (g === 'sudo') u.sudo = true;
    else if (g === 'docker') { if (name === sh.user) sh.W.dockerListed = true; if (u.groups.indexOf('docker') < 0) u.groups.push('docker'); }
    else if (u.groups.indexOf(g) < 0) u.groups.push(g);
  });
  sync(sh); return 0;
};
cmds.id = function (a, c) {
  var S = sec(c.sh.W), n = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (n && n !== c.sh.user) {
    if (n === 'root') { c.out('uid=0(root) gid=0(root) groups=0(root)\n'); return 0; }
    var u = S.users[n]; if (!u) throw new CmdErr("id: '" + n + "': no such user");
    c.out('uid=' + u.uid + '(' + n + ') gid=' + u.uid + '(' + n + ') groups=' + u.uid + '(' + n + ')' + (u.sudo ? ',27(sudo)' : '') + (u.groups.indexOf('docker') >= 0 ? ',988(docker)' : '') + '\n'); return 0;
  }
  return prev.id(a, c);
};
cmds.groups = function (a, c) {
  var S = sec(c.sh.W), n = a[0];
  if (n && n !== c.sh.user) {
    var u = S.users[n]; if (!u) throw new CmdErr("groups: '" + n + "': no such user");
    c.out(n + ' : ' + n + (u.sudo ? ' sudo' : '') + (u.groups.length ? ' ' + u.groups.join(' ') : '') + '\n'); return 0;
  }
  return prev.groups(a, c);
};
cmds.getent = function (a, c) {
  var sh = c.sh; sync(sh);
  var db = a[0], key = a[1], n = sh.fs.get(db === 'group' ? '/etc/group' : '/etc/passwd');
  if (db !== 'passwd' && db !== 'group') throw new CmdErr('Mô phỏng: getent passwd|group [tên]');
  var ls = lines(n.c).filter(function (l) { return !key || l.split(':')[0] === key; });
  if (!ls.length) return 2;
  c.out(ls.join('\n') + '\n'); return 0;
};
cmds.passwd = function (a, c) {
  var sh = c.sh, S = sec(sh.W), name = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (a.indexOf('-S') >= 0) {
    need(c, 'passwd: Permission denied');
    var u1 = S.users[name || sh.user]; if (!u1) throw new CmdErr("passwd: user '" + name + "' does not exist");
    c.out((name || sh.user) + ' ' + (u1.locked ? 'L' : 'P') + ' 10/26/2026 0 99999 7 -1\n'); return 0;
  }
  if (a.indexOf('-l') >= 0 || a.indexOf('-u') >= 0) {
    need(c, 'passwd: Permission denied');
    var u = S.users[name]; if (!u) throw new CmdErr("passwd: user '" + name + "' does not exist");
    u.locked = a.indexOf('-l') >= 0; c.out('passwd: password expiry information changed.\n'); return 0;
  }
  c.out('Mô phỏng: passwd cần nhập mật khẩu tương tác. Hỗ trợ: passwd -l|-u|-S TÊN_USER\n'); return 1;
};
cmds.sudo = function (a, c) {
  var sh = c.sh, S = sec(sh.W);
  if (a[0] === '-l') {
    var who = a[1] === '-U' ? a[2] : sh.user, u = S.users[who];
    if (!u) throw new CmdErr("sudo: unknown user " + who);
    var nop = sh.fs.isF('/etc/sudoers.d/' + who) && /NOPASSWD/.test(sh.fs.get('/etc/sudoers.d/' + who).c);
    if (!u.sudo && !sh.fs.isF('/etc/sudoers.d/' + who)) { c.out('User ' + who + ' is not allowed to run sudo on vps.\n'); return 0; }
    c.out('Matching Defaults entries for ' + who + ' on vps:\n    env_reset, mail_badpass, secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:/usr/bin\\:/sbin\\:/bin\n\nUser ' + who + ' may run the following commands on vps:\n    (ALL : ALL) ' + (nop ? 'NOPASSWD: ' : '') + 'ALL\n'); return 0;
  }
  return prev.sudo(a, c);
};
cmds.visudo = function (a, c) {
  need(c, 'visudo: /etc/sudoers: Permission denied');
  if (a.indexOf('-c') >= 0) { c.out('/etc/sudoers: parsed OK\n' + (c.sh.fs.isD('/etc/sudoers.d') ? c.sh.fs.list('/etc/sudoers.d').map(function (n) { return '/etc/sudoers.d/' + n + ': parsed OK\n'; }).join('') : '')); return 0; }
  c.out('Mô phỏng: visudo mở trình soạn thảo. Cách an toàn trong bài tập:\n  echo "TÊN ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/TÊN\n  sudo chmod 440 /etc/sudoers.d/TÊN && sudo visudo -c\n'); return 0;
};

/* ---------- sshd -T ---------- */
function expand(sh, text, depth) {
  var out = [];
  lines(text).forEach(function (l) {
    var t = l.trim(); if (!t || t.charAt(0) === '#') return;
    var m = /^include\s+(.+)$/i.exec(t);
    if (m) {
      if (depth < 3) { var dir = m[1].replace(/\/\*(\.conf)?$/, ''); if (sh.fs.isD(dir)) sh.fs.list(dir).forEach(function (n) { if (/\.conf$/.test(n)) { var f = sh.fs.get(dir + '/' + n); if (f) out = out.concat(expand(sh, f.c, depth + 1)); } }); }
    } else out.push(t);
  });
  return out;
}
var DEF = { port: '22', addressfamily: 'any', permitrootlogin: 'prohibit-password', pubkeyauthentication: 'yes', passwordauthentication: 'yes', kbdinteractiveauthentication: 'no', usepam: 'yes', x11forwarding: 'no', maxauthtries: '6', logingracetime: '120', permitemptypasswords: 'no', clientaliveinterval: '0', clientalivecountmax: '3', allowtcpforwarding: 'yes', maxsessions: '10' };
function eff(sh, ctx) {
  var n = sh.fs.get('/etc/ssh/sshd_config'), r = {}, k;
  for (k in DEF) r[k] = DEF[k];
  var seen = {}, au = [], ov = {}, inM = false, hit = false;
  if (n) expand(sh, n.c, 0).forEach(function (t) {
    var m = /^(\S+)\s+(.+)$/.exec(t); if (!m) return;
    k = m[1].toLowerCase();
    if (k === 'match') {
      inM = true; hit = false;
      var mm = /^(user|group|address)\s+(\S+)/i.exec(m[2]);
      if (mm && ctx && mm[1].toLowerCase() === 'user' && ctx.user) hit = mm[2].split(',').indexOf(ctx.user) >= 0;
      return;
    }
    if (inM) { if (hit && !ov[k]) ov[k] = m[2]; return; }
    if (k === 'allowusers') { au = au.concat(m[2].split(/\s+/)); return; }
    if (seen[k]) return; seen[k] = 1; r[k] = m[2];
  });
  if (au.length) r.allowusers = au;
  for (k in ov) r[k] = ov[k];
  return r;
}
VPS.sec = { eff: eff, sync: sync, S: sec };
cmds.sshd = function (a, c) {
  if (a.indexOf('-T') >= 0) {
    if (!c.sh.isRoot(c)) { c.err('sshd: no hostkeys available -- exiting.\n'); return 1; }
    var rc = prev.sshd(['-t'], c); if (rc) return rc;
    var ci = a.indexOf('-C'), ctx = null;
    if (ci >= 0) { ctx = {}; (a[ci + 1] || '').split(',').forEach(function (kv) { var p = kv.split('='); ctx[p[0]] = p[1]; }); }
    var r = eff(c.sh, ctx), out = [];
    Object.keys(r).sort().forEach(function (k) { if (k === 'allowusers') r[k].forEach(function (u) { out.push('allowusers ' + u); }); else out.push(k + ' ' + r[k]); });
    c.out(out.join('\n') + '\n'); return 0;
  }
  return prev.sshd(a, c);
};
function applyCfg(sh) { var W = sh.W; W.ssh.applied = eff(sh); W.ssh.activePort = +W.ssh.applied.port; }
VPS.sec.snapshot = applyCfg;
VPS.sec.applied = function (sh) { return sh.W.ssh.applied || eff(sh); };

/* ---------- systemctl bổ sung ---------- */
cmds.systemctl = function (a, c) {
  var sh = c.sh, S = sec(sh.W), P = VPS.parseFlags(a), act = P.rest[0], unit = (P.rest[1] || '').replace(/\.service$/, '');
  if (unit === 'unattended-upgrades') {
    if (!S.unattended) { c.err('Unit unattended-upgrades.service could not be found.\n'); return 4; }
    if (act === 'status') { c.out('● unattended-upgrades.service - Unattended Upgrades Shutdown\n     Loaded: loaded (/usr/lib/systemd/system/unattended-upgrades.service; enabled; preset: enabled)\n     Active: active (running) since Mon 2026-10-26 09:12:03 +07; 8h ago\n'); return 0; }
    if (act === 'is-active') { c.out('active\n'); return 0; }
    if (act === 'is-enabled') { c.out('enabled\n'); return 0; }
    need(c, 'Failed to ' + act + ' unattended-upgrades.service: Interactive authentication required.'); return 0;
  }
  var rc = prev.systemctl(a, c);
  var isSsh = unit === 'ssh' || unit === 'sshd';
  if (rc === 0 && sh.isRoot(c)) {
    if (isSsh && (act === 'reload' || act === 'restart' || act === 'start')) applyCfg(sh);
    if (unit === 'fail2ban' && (act === 'restart' || act === 'reload' || act === 'start')) loadF2b(sh);
  }
  return rc;
};
SP.listeners = function () {
  var L = prevListeners.call(this), W = this.W;
  L.forEach(function (l) { if (l.proc === 'sshd' && W.ssh.activePort) l.port = W.ssh.activePort; });
  if (this.hostName === 'laptop') sec(W).tunnels.forEach(function (t, i) { L.push({ port: t.l, bind: '127.0.0.1', proc: 'ssh', pid: 4100 + i }); });
  return L;
};

/* ---------- ssh: cổng, tunnel ---------- */
function portAllowed(W, p) {
  if (!W.ufw.active) return true;
  return W.ufw.rules.some(function (r) { return r.action !== 'DENY' && r.action !== 'REJECT' && (r.from === 'Anywhere') && (r.to === String(p) || r.to === p + '/tcp' || (p === 22 && r.to === 'OpenSSH')); });
}
cmds.ssh = function (a, c) {
  var sh = c.sh, W = sh.W, S = sec(W), args = [], tun = null, i;
  for (i = 0; i < a.length; i++) {
    if (a[i] === '-L') { tun = a[++i]; continue; }
    if (/^-L./.test(a[i])) { tun = a[i].slice(2); continue; }
    if (a[i] === '-N' || a[i] === '-f') continue;
    args.push(a[i]);
  }
  var pi = args.indexOf('-p'), port = pi >= 0 ? +args[pi + 1] : 22;
  if (sh.hostName === 'laptop' && W.ssh.activePort && args.some(function (x) { return x.charAt(0) !== '-'; })) {
    var ap = W.ssh.activePort;
    if (port !== ap && args.some(function (x) { return x.indexOf(W.ip) >= 0; })) { c.err('ssh: connect to host ' + W.ip + ' port ' + port + ': Connection refused\n'); return 255; }
    if (!portAllowed(W, port) && args.some(function (x) { return x.indexOf(W.ip) >= 0; })) { c.err('ssh: connect to host ' + W.ip + ' port ' + port + ': Connection timed out\n'); return 255; }
  }
  if (!tun) return prev.ssh(a.filter(function (x) { return x !== '-N' && x !== '-f'; }), c);
  var m = /^(\d+):([\w.\-]+):(\d+)$/.exec(tun);
  if (!m) { c.err('Bad local forwarding specification \'' + tun + '\'\n'); return 255; }
  var rc = prev.ssh(args, ignoreErr(c));
  if (rc !== 0) { return prev.ssh(args, c); }
  if (!S.tunnels.some(function (t) { return t.l === +m[1]; })) S.tunnels.push({ l: +m[1], host: m[2], r: +m[3] });
  c.out('(mô phỏng) Đường hầm đã mở: localhost:' + m[1] + ' -> ' + m[2] + ':' + m[3] + ' trên VPS.\nNgoài đời: -N để không mở shell, -f để chạy nền; tắt bằng cách kill tiến trình ssh.\n');
  return 0;
};
cmds.nc = function (a, c) {
  var sh = c.sh, S = sec(sh.W), rest = a.filter(function (x) { return x.charAt(0) !== '-'; }), host = rest[0], port = +rest[1];
  var ok;
  if (sh.hostName === 'laptop') ok = (host === 'localhost' || host === '127.0.0.1') && S.tunnels.some(function (t) { return t.l === port; });
  else ok = sh.listeners().some(function (l) { return l.port === port; });
  if (ok) { c.out('Connection to ' + host + ' ' + port + ' port [tcp/*] succeeded!\n'); return 0; }
  c.err('nc: connect to ' + host + ' port ' + port + ' (tcp) failed: Connection refused\n'); return 1;
};

/* ---------- ufw nâng cao ---------- */
function ruleText(r) { return r.to + (r.from && r.from !== 'Anywhere' ? '  (từ ' + r.from + ')' : ''); }
cmds.ufw = function (a, c) {
  var sh = c.sh, W = sh.W, u = W.ufw, S = sec(W);
  if (!sh.isRoot(c)) { c.err('ERROR: You need to be root to run this script\n'); return 1; }
  var args = a.filter(function (x) { return x !== '--force'; }), sub = args[0];
  if (sub === 'status' && (args[1] === 'numbered' || args[1] === 'verbose')) {
    if (!u.active) { c.out('Status: inactive\n'); return 0; }
    var o = 'Status: active\n';
    if (args[1] === 'verbose') o += 'Logging: ' + (S.logging === 'off' ? 'off' : 'on (' + S.logging + ')') + '\nDefault: ' + (u.defIn || 'deny') + ' (incoming), ' + (u.defOut || 'allow') + ' (outgoing), disabled (routed)\nNew profiles: skip\n';
    o += '\n' + (args[1] === 'numbered' ? '     ' : '') + 'To                         Action      From\n' + (args[1] === 'numbered' ? '     ' : '') + '--                         ------      ----\n';
    u.rules.forEach(function (r, i) { o += (args[1] === 'numbered' ? pad('[' + pad(i + 1, 2, true) + ']', 5) : '') + pad(r.to, 27) + pad(r.action + (args[1] === 'numbered' ? ' IN' : ''), 12) + r.from + '\n'; });
    c.out(o); return 0;
  }
  if (sub === 'delete' && /^\d+$/.test(args[1] || '')) {
    var n = +args[1];
    if (n < 1 || n > u.rules.length) throw new CmdErr('ERROR: Could not find rule \'' + args[1] + '\'');
    var r = u.rules.splice(n - 1, 1)[0];
    c.out('Deleting:\n ' + r.action.toLowerCase() + ' ' + ruleText(r) + '\nRule deleted\n'); return 0;
  }
  if (sub === 'logging') { var lv = args[1]; if (['on', 'off', 'low', 'medium', 'high'].indexOf(lv) < 0) throw new CmdErr('ERROR: Invalid logging level'); S.logging = lv === 'on' ? 'low' : lv; c.out(lv === 'off' ? 'Logging disabled\n' : 'Logging enabled\n'); return 0; }
  if (sub === 'reload') { c.out('Firewall reloaded\n'); return 0; }
  if (sub === 'app' && args[1] === 'list') { c.out('Available applications:\n  Nginx Full\n  Nginx HTTP\n  Nginx HTTPS\n  OpenSSH\n'); return 0; }
  if ((sub === 'allow' || sub === 'deny' || sub === 'limit') && args.indexOf('from') >= 0 && (args.indexOf('port') >= 0)) {
    var src = args[args.indexOf('from') + 1], pt = args[args.indexOf('port') + 1], pr = args.indexOf('proto') >= 0 ? args[args.indexOf('proto') + 1] : 'tcp';
    var rule = { to: pt + '/' + pr, action: sub.toUpperCase(), from: src };
    if (u.rules.some(function (x) { return x.to === rule.to && x.action === rule.action && x.from === rule.from; })) { c.out('Skipping adding existing rule\n'); return 0; }
    u.rules.push(rule); c.out('Rule added\n'); return 0;
  }
  if ((sub === 'allow' || sub === 'deny' || sub === 'limit') && args.length >= 2 && args.indexOf('from') < 0) {
    var to = args[1] === 'Nginx' && args[2] === 'Full' ? 'Nginx Full' : args[1];
    var ex = u.rules.filter(function (x) { return x.to === to && x.from === 'Anywhere'; })[0];
    if (ex && ex.action !== sub.toUpperCase()) { ex.action = sub.toUpperCase(); c.out('Rule updated\n'); return 0; }
  }
  return prev.ufw(a, c);
};

/* ---------- fail2ban ---------- */
function f2bDefault() { return { bantime: 600, findtime: 600, maxretry: 5, ignoreip: ['127.0.0.1/8', '::1'] }; }
function secs(v) { var m = /^(\d+)([smhdw]?)$/.exec(String(v).trim()); if (!m) return null; return +m[1] * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 })[m[2]]; }
function loadF2b(sh) {
  var W = sh.W, cfg = f2bDefault(), n = sh.fs.get('/etc/fail2ban/jail.local'), sect = null, d = {}, s = {};
  if (n) lines(n.c).forEach(function (l) {
    var t = l.trim(); if (!t || t.charAt(0) === '#') return;
    var m = /^\[(\w+)\]$/.exec(t); if (m) { sect = m[1]; return; }
    var kv = /^(\w+)\s*=\s*(.*)$/.exec(t); if (!kv) return;
    if (sect === 'DEFAULT') d[kv[1]] = kv[2]; else if (sect === 'sshd') s[kv[1]] = kv[2];
  });
  [d, s].forEach(function (o) {
    if (o.bantime != null && secs(o.bantime) != null) cfg.bantime = secs(o.bantime);
    if (o.findtime != null && secs(o.findtime) != null) cfg.findtime = secs(o.findtime);
    if (o.maxretry != null && +o.maxretry > 0) cfg.maxretry = +o.maxretry;
    if (o.ignoreip != null) cfg.ignoreip = o.ignoreip.split(/[\s,]+/).filter(Boolean);
  });
  W.f2b.cfg = cfg;
}
VPS.sec.loadF2b = loadF2b;
cmds['fail2ban-client'] = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!sh.isRoot(c)) throw new CmdErr('ERROR  Permission denied to socket: /var/run/fail2ban/fail2ban.sock, (you must be root)');
  if (!W.f2b.cfg) W.f2b.cfg = f2bDefault();
  var cfg = W.f2b.cfg;
  if (a[0] === 'ping') { c.out('Server replied: pong\n'); return 0; }
  if (a[0] === 'reload') { loadF2b(sh); c.out('OK\n'); return 0; }
  if (a[0] === 'get' && a[1] === 'sshd') {
    var k = a[2];
    if (k === 'bantime' || k === 'findtime' || k === 'maxretry') { c.out(cfg[k] + '\n'); return 0; }
    if (k === 'ignoreip') { c.out('These IP addresses/networks are ignored:\n' + cfg.ignoreip.map(function (x, i) { return (i === cfg.ignoreip.length - 1 ? '`- ' : '|- ') + x; }).join('\n') + '\n'); return 0; }
    if (k === 'banip') { c.out(W.f2b.banned.join(' ') + '\n'); return 0; }
  }
  if (a[0] === 'set' && a[1] === 'sshd') {
    var key = a[2], val = a[3];
    if (key === 'maxretry' || key === 'bantime' || key === 'findtime') { var v = key === 'maxretry' ? +val : secs(val); if (!v) throw new CmdErr('ERROR  Invalid value'); cfg[key] = v; c.out(v + '\n'); return 0; }
    if (key === 'addignoreip') { if (cfg.ignoreip.indexOf(val) < 0) cfg.ignoreip.push(val); c.out('These IP addresses/networks are ignored:\n' + cfg.ignoreip.join(' ') + '\n'); return 0; }
    if (key === 'delignoreip') { cfg.ignoreip = cfg.ignoreip.filter(function (x) { return x !== val; }); c.out('OK\n'); return 0; }
  }
  if (a[0] === 'unban' && a[1] === '--all') { var n = W.f2b.banned.length; W.f2b.banned = []; c.out(n + '\n'); return 0; }
  if (a[0] === 'set' && a[1] === 'sshd' && a[2] === 'unbanip') {
    var had = a.slice(3).filter(function (ip) { return W.f2b.banned.indexOf(ip) >= 0; }).length;
    if (!had) throw new CmdErr('ERROR  NoBanAddress: ' + a.slice(3).join(' ') + ' is not banned');
  }
  return prev['fail2ban-client'](a, c);
};

/* ---------- last / w / who / crontab / kill ---------- */
cmds.last = function (a, c) {
  var S = sec(c.sh.W), rows = S.lastRows || [
    'haidangphan pts/0        203.0.113.7      Mon Oct 26 09:12   still logged in',
    'haidangphan pts/0        203.0.113.7      Sun Oct 25 22:10 - 23:40  (01:30)',
    'haidangphan pts/0        203.0.113.7      Sat Oct 24 08:55 - 12:03  (03:08)',
    'reboot   system boot  6.8.0-45-generic Mon Oct 19 06:00   still running'
  ];
  var ni = a.indexOf('-n'), lim = ni >= 0 ? +a[ni + 1] : (/^-\d+$/.test(a[0] || '') ? -a[0] : 0);
  var out = lim ? rows.slice(0, lim) : rows;
  c.out(out.join('\n') + '\n\nwtmp begins Mon Oct 19 06:00:02 2026\n'); return 0;
};
cmds.who = function (a, c) { c.out(c.sh.user + ' pts/0        2026-10-26 09:12 (203.0.113.7)\n'); return 0; };
cmds.w = function (a, c) {
  c.out(' 17:49:00 up 7 days,  11:49,  1 user,  load average: 0.21, 0.18, 0.15\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n' + pad(c.sh.user, 12) + 'pts/0    203.0.113.7      09:12    0.00s  0.05s  0.00s w\n'); return 0;
};
function cronOf(sh, c, a) {
  var ui = a.indexOf('-u'), who = ui >= 0 ? a[ui + 1] : (c.sudo ? 'root' : sh.user);
  if (ui >= 0 && !sh.isRoot(c)) throw new CmdErr('must be privileged to use -u');
  return who;
}
cmds.crontab = function (a, c) {
  var sh = c.sh, S = sec(sh.W), who = cronOf(sh, c, a), list = a.filter(function (x, i) { return x !== '-u' && a[i - 1] !== '-u'; });
  if (list.indexOf('-l') >= 0) {
    var cr = S.cron[who];
    if (!cr || !cr.length) { c.err('no crontab for ' + who + '\n'); return 1; }
    c.out(cr.join('\n') + '\n'); return 0;
  }
  if (list.indexOf('-r') >= 0) { if (!S.cron[who]) { c.err('no crontab for ' + who + '\n'); return 1; } delete S.cron[who]; return 0; }
  if (list.indexOf('-e') >= 0) { c.out('Mô phỏng: crontab -e mở trình soạn thảo. Thay thế: (crontab -l; echo "DÒNG") | crontab -\n'); return 1; }
  var src = list[0];
  var text = src === '-' ? c.stdin : (sh.fs.get(sh.abs(src)) || {}).c;
  if (text == null) throw new CmdErr('crontab: ' + src + ': No such file or directory');
  S.cron[who] = lines(text).filter(function (l) { return l.trim(); });
  return 0;
};
cmds.ps = function (a, c) {
  var S = sec(c.sh.W);
  var r = prev.ps(a, c);
  S.procs.forEach(function (p) { c.out(pad(p.user, 9) + pad(p.pid, 6, true) + '  96.8  2.1 912340 85012 ?        Sl   Oct25 1503:12 ' + p.cmd + '\n'); });
  return r;
};
function killProc(c, p) {
  var S = sec(c.sh.W);
  if (p.user !== c.sh.user && !c.sh.isRoot(c)) throw new CmdErr('kill: (' + p.pid + ') - Operation not permitted');
  S.procs = S.procs.filter(function (x) { return x !== p; });
}
cmds.kill = function (a, c) {
  var S = sec(c.sh.W), pids = a.filter(function (x) { return /^\d+$/.test(x); }), rc = 0;
  if (!pids.length) throw new CmdErr('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]');
  pids.forEach(function (id) {
    var p = S.procs.filter(function (x) { return x.pid === +id; })[0];
    if (!p) { c.err('bash: kill: (' + id + ') - No such process\n'); rc = 1; return; }
    killProc(c, p);
  });
  return rc;
};
cmds.pkill = function (a, c) {
  var S = sec(c.sh.W), pat = a.filter(function (x) { return x.charAt(0) !== '-'; })[0], hit = S.procs.filter(function (p) { return pat && p.cmd.indexOf(pat) >= 0; });
  if (!hit.length) return 1;
  hit.forEach(function (p) { killProc(c, p); }); return 0;
};
cmds.stat = function (a, c) {
  var sh = c.sh, ci = a.indexOf('-c'), fmt = ci >= 0 ? a[ci + 1] : null, files = a.filter(function (x, i) { return x.charAt(0) !== '-' && a[i - 1] !== '-c'; }), rc = 0;
  files.forEach(function (f) {
    var p = sh.abs(f), n = sh.fs.get(p);
    if (!n) { c.err("stat: cannot statx '" + f + "': No such file or directory\n"); rc = 1; return; }
    var oct = (n.mode & 511).toString(8);
    if (fmt) c.out(fmt.replace(/%a/g, oct).replace(/%U/g, n.owner).replace(/%G/g, n.owner).replace(/%n/g, f).replace(/%s/g, String(sh.fs.size(sh.fs.real(p)))) + '\n');
    else c.out('  File: ' + f + '\n  Size: ' + sh.fs.size(sh.fs.real(p)) + '\nAccess: (0' + oct + ')  Uid: ' + n.owner + '  Gid: ' + n.owner + '\n');
  });
  return rc;
};

/* ---------- apt / reboot ---------- */
cmds.apt = function (a, c) {
  var sh = c.sh, S = sec(sh.W);
  if (a[0] === 'list' && a.indexOf('--upgradable') >= 0) {
    c.out('Listing... Done\n' + S.upg.map(function (p) { return p[0] + '/noble-updates ' + p[1] + ' amd64 [upgradable from: ' + p[2] + ']'; }).join('\n') + (S.upg.length ? '\n' : '')); return 0;
  }
  if (a[0] === 'update') {
    need(c, 'E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock directory /var/lib/apt/lists/');
    S.updated = true;
    c.out('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]\nGet:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nFetched 252 kB in 1s (310 kB/s)\nReading package lists... Done\nBuilding dependency tree... Done\n' + (S.upg.length ? S.upg.length + " packages can be upgraded. Run 'apt list --upgradable' to see them.\n" : 'All packages are up to date.\n')); return 0;
  }
  if (a[0] === 'upgrade' || a[0] === 'full-upgrade' || a[0] === 'dist-upgrade') {
    need(c, 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?');
    var n = S.upg.length, kernel = S.upg.some(function (p) { return /^linux-image/.test(p[0]); });
    c.out('Reading package lists... Done\nCalculating upgrade... Done\nThe following packages will be upgraded:\n  ' + S.upg.map(function (p) { return p[0]; }).join(' ') + '\n' + n + ' upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\nSetting up packages... done.\n');
    S.upg = [];
    if (kernel) { sh.fs.put('/var/run/reboot-required', '*** System restart required ***\n', { owner: 'root' }); c.out('Pending kernel upgrade!\nRunning kernel version: 6.8.0-45-generic\nExpected kernel version: 6.8.0-48-generic\n*** System restart required ***\n'); }
    return 0;
  }
  if (a[0] === 'install' && a.indexOf('unattended-upgrades') >= 0) {
    need(c, 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?');
    S.unattended = true;
    sh.fs.put('/etc/apt/apt.conf.d/20auto-upgrades', 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n', { owner: 'root' });
    sh.fs.put('/etc/apt/apt.conf.d/50unattended-upgrades', 'Unattended-Upgrade::Allowed-Origins {\n        "${distro_id}:${distro_codename}";\n        "${distro_id}:${distro_codename}-security";\n};\nUnattended-Upgrade::Automatic-Reboot "false";\n', { owner: 'root' });
    c.out('Reading package lists... Done\nSetting up unattended-upgrades (2.9.1+nmu4ubuntu1) ...\nCreated symlink /etc/systemd/system/multi-user.target.wants/unattended-upgrades.service\n'); return 0;
  }
  return prev.apt(a, c);
};
cmds.reboot = function (a, c) {
  need(c, 'Failed to reboot system via logind: Interactive authentication required.');
  c.sh.fs.rm('/var/run/reboot-required');
  c.out('(mô phỏng) Máy chủ sẽ khởi động lại. Trong bài tập, phiên vẫn giữ nguyên; cờ reboot-required đã được xoá.\n'); return 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
