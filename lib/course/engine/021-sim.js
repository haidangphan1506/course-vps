(function (G) {
'use strict';
/* Chương 1C (phần 1): nhóm và quyền group, setgid, sudo -u/su, apt/dpkg, đĩa, inode, swap, mount, sysctl. Bật bằng W.lin2. */
var V = G.VPS, SP = V.Shell.prototype, cmds = V.cmds, B = V.builtins, CmdErr = V.CmdErr, LIN = V.lin, FSP = V.FS.prototype;
var L2 = V.lin2 = { impl: {} };
function pad(s, n, right) { s = String(s); while (s.length < n) s = right ? ' ' + s : s + ' '; return s; }
function on(sh) { return !!(sh && sh.W && sh.W.lin2); }
function S2(sh) { return sh.W.lin2; }
function secS(sh) { return V.sec.S(sh.W); }
function rootOK(sh, c) { return sh.isRoot(c); }
function lines(t) { return String(t || '').split('\n').filter(function (x) { return x !== ''; }); }
function nowMs(sh) { return sh.W.lin ? sh.W.lin.now : Date.UTC(2026, 9, 27, 3, 20, 0); }
function fileText(sh, p) { var n = sh.fs.get(p); return n && n.t === 'f' ? String(n.c || '') : ''; }
function hum(b, si) {
  var u = ['B', 'K', 'M', 'G', 'T'], i = 0, x = b;
  while (x >= 1024 && i < 4) { x /= 1024; i++; }
  if (i === 0) return String(Math.round(x));
  return (x >= 10 ? Math.round(x) : (Math.ceil(x * 10) / 10).toFixed(1)) + u[i];
}
function parseSize(s) {
  var m = /^(\d+(?:\.\d+)?)([kKmMgGtT]?)[bB]?$/.exec(String(s)); if (!m) return null;
  return Math.round(parseFloat(m[1]) * ({ '': 1, k: 1024, m: 1048576, g: 1073741824, t: 1099511627776 })[m[2].toLowerCase()]);
}

/* ============ FS: kế thừa nhóm qua setgid, giữ nhóm khi ghi đè ============ */
var fsPut = FSP.put, fsMk = FSP.mkdirp;
FSP.put = function (p, c, o) {
  var rp = this.real(p), prev = this.n[rp], ex = !!prev, par = this.n[this.parent(rp)];
  var r = fsPut.call(this, p, c, o), n = this.n[rp];
  if (n) {
    if (ex && prev.group && !(o && o.group)) n.group = prev.group;
    else if (o && o.group) n.group = o.group;
    else if (!ex && par && (par.mode & 1024) && par.group) n.group = par.group;
    if (ex && prev.swap) n.swap = prev.swap;
  }
  return r;
};
FSP.mkdirp = function (p, owner, mode) {
  var parts = p.split('/').filter(Boolean), cur = '', self = this;
  for (var i = 0; i < parts.length; i++) {
    cur += '/' + parts[i];
    var had = !!self.n[cur];
    if (!had) {
      var par = self.n[cur.replace(/\/[^\/]*$/, '') || '/'];
      fsMk.call(self, cur, owner, mode);
      var n = self.n[cur];
      if (n && par && (par.mode & 1024) && par.group) { n.group = par.group; n.mode = (n.mode | 1024); }
    }
  }
};

/* ============ nhóm, người dùng ============ */
var BUILTING = { root: 0, adm: 4, sudo: 27, 'www-data': 33, docker: 988, users: 100 };
function gidOf(sh, g) {
  if (BUILTING[g] != null) return BUILTING[g];
  var S = S2(sh); if (S.groups[g]) return S.groups[g].gid;
  var u = secS(sh).users[g]; return u ? u.uid : null;
}
function groupExists(sh, g) { return gidOf(sh, g) != null; }
function userExists(sh, n) { return n === 'root' || !!secS(sh).users[n] || n === 'www-data'; }
function dbGroups(sh, user) {
  var u = secS(sh).users[user], out = [user];
  if (user === 'root') return ['root'];
  if (!u) return out;
  if (u.sudo) out.push('sudo');
  u.groups.forEach(function (g) { if (out.indexOf(g) < 0) out.push(g); });
  return out;
}
function sgroups(sh, user) {
  if (user === 'root' || sh.forceRoot) return ['root'];
  var S = S2(sh);
  if (user === sh.user && S.sessG && S.sessG[user]) return S.sessG[user];
  return dbGroups(sh, user);
}
L2.relogin = function (sh) { var S = S2(sh); S.sessG = S.sessG || {}; S.sessG[sh.user] = dbGroups(sh, sh.user); };
function syncGroups(sh) {
  V.sec.sync(sh);
  var S = S2(sh), g = fileText(sh, '/etc/group').split('\n').filter(Boolean), users = secS(sh).users;
  Object.keys(S.groups).forEach(function (name) {
    var mem = Object.keys(users).filter(function (n) { return users[n].groups.indexOf(name) >= 0; });
    g.push(name + ':x:' + S.groups[name].gid + ':' + mem.join(','));
  });
  sh.fs.put('/etc/group', g.join('\n') + '\n', { owner: 'root', mode: 420 });
}
L2.syncGroups = syncGroups;
function needRoot(sh, c, msg) { if (!sh.isRoot(c)) throw new CmdErr(msg); }
cmds.groupadd = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: groupadd: command not found', 127);
  needRoot(sh, c, 'groupadd: Permission denied.\ngroupadd: cannot lock /etc/group; try again later.');
  var S = S2(sh), name = null, gid = null, i;
  for (i = 0; i < a.length; i++) { if (a[i] === '-g') gid = parseInt(a[++i], 10); else if (a[i] === '-r' || a[i] === '-f') {} else if (a[i].charAt(0) !== '-') name = a[i]; }
  if (!name) throw new CmdErr('Usage: groupadd [options] GROUP', 2);
  if (!/^[a-z_][a-z0-9_-]*$/.test(name)) throw new CmdErr("groupadd: '" + name + "' is not a valid group name", 3);
  if (groupExists(sh, name)) throw new CmdErr("groupadd: group '" + name + "' already exists", 9);
  if (gid == null) { gid = 1100; Object.keys(S.groups).forEach(function (k) { gid = Math.max(gid, S.groups[k].gid + 1); }); }
  S.groups[name] = { gid: gid }; syncGroups(sh); return 0;
};
cmds.addgroup = cmds.groupadd;
cmds.groupdel = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: groupdel: command not found', 127);
  needRoot(sh, c, 'groupdel: Permission denied.\ngroupdel: cannot lock /etc/group; try again later.');
  var S = S2(sh), n = a[a.length - 1];
  if (!S.groups[n]) throw new CmdErr("groupdel: group '" + n + "' does not exist", 6);
  delete S.groups[n]; var us = secS(sh).users; Object.keys(us).forEach(function (k) { us[k].groups = us[k].groups.filter(function (g) { return g !== n; }); });
  syncGroups(sh); return 0;
};
cmds.gpasswd = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: gpasswd: command not found', 127);
  var op = a[0], user = a[1], grp = a[2];
  if (op !== '-a' && op !== '-d') throw new CmdErr('Mô phỏng: gpasswd -a USER NHÓM | gpasswd -d USER NHÓM', 1);
  if (!sh.isRoot(c)) throw new CmdErr('gpasswd: Permission denied.', 1);
  var us = secS(sh).users[user];
  if (!groupExists(sh, grp)) throw new CmdErr("gpasswd: group '" + grp + "' does not exist in /etc/group", 3);
  if (!us) throw new CmdErr("gpasswd: user '" + user + "' does not exist", 3);
  if (op === '-a') { if (us.groups.indexOf(grp) < 0) us.groups.push(grp); c.err('Adding user ' + user + ' to group ' + grp + '\n'); }
  else { us.groups = us.groups.filter(function (g) { return g !== grp; }); c.err('Removing user ' + user + ' from group ' + grp + '\n'); }
  syncGroups(sh); return 0;
};
var prevUsermod = cmds.usermod;
cmds.usermod = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevUsermod(a, c);
  var gi = a.indexOf('-aG'); if (gi < 0 && a.indexOf('-a') >= 0) gi = a.indexOf('-G');
  var name = a[a.length - 1];
  if (gi < 0 || a.indexOf('-s') >= 0 || a.indexOf('-L') >= 0 || a.indexOf('-U') >= 0) {
    var si = a.indexOf('-s');
    if (si >= 0) { needRoot(sh, c, 'usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.'); var us0 = secS(sh).users[name]; if (!us0) throw new CmdErr("usermod: user '" + name + "' does not exist", 6); us0.shell = a[si + 1]; return 0; }
    var r = prevUsermod(a, c); syncGroups(sh); return r;
  }
  needRoot(sh, c, 'usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.');
  var us = secS(sh).users[name]; if (!us) throw new CmdErr("usermod: user '" + name + "' does not exist", 6);
  var gs = String(a[gi + 1] || '').split(',').filter(Boolean);
  for (var k = 0; k < gs.length; k++) if (!groupExists(sh, gs[k])) throw new CmdErr("usermod: group '" + gs[k] + "' does not exist", 6);
  gs.forEach(function (g) { if (g === 'sudo') us.sudo = true; else if (g === name) {} else if (us.groups.indexOf(g) < 0) us.groups.push(g); });
  if (gs.indexOf('docker') >= 0 && name === sh.user) sh.W.dockerListed = true;
  syncGroups(sh); return 0;
};
var prevUseradd = cmds.useradd, prevAdduser = cmds.adduser;
cmds.useradd = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevUseradd(a, c);
  needRoot(sh, c, 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.');
  var name = null, i, gs = [], mk = false, shell = '/bin/sh', home = null;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-G') gs = String(a[++i]).split(',').filter(Boolean); else if (x === '-s') shell = a[++i]; else if (x === '-d') home = a[++i]; else if (x === '-m' || x === '--create-home') mk = true;
    else if (x === '-c' || x === '-g' || x === '-u' || x === '-p') i++; else if (x === '-r' || x === '-M' || x === '-U') {} else if (x.charAt(0) !== '-') name = x;
  }
  if (!name) throw new CmdErr('Usage: useradd [options] LOGIN', 2);
  if (!/^[a-z_][a-z0-9_-]*$/.test(name)) throw new CmdErr("useradd: invalid user name '" + name + "'", 3);
  var S = secS(sh); if (S.users[name] || name === 'root') throw new CmdErr("useradd: user '" + name + "' already exists", 9);
  for (var k = 0; k < gs.length; k++) if (!groupExists(sh, gs[k])) throw new CmdErr("useradd: group '" + gs[k] + "' does not exist", 6);
  var uid = S.nextUid++; S.users[name] = { uid: uid, sudo: gs.indexOf('sudo') >= 0, locked: true, groups: gs.filter(function (g) { return g !== 'sudo'; }), shell: shell };
  if (mk) { sh.fs.mkdirp(home || '/home/' + name, name, 493); var hn = sh.fs.get(home || '/home/' + name); if (hn) hn.group = name; }
  syncGroups(sh); return 0;
};
cmds.adduser = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevAdduser(a, c);
  var r = prevAdduser(a, c); syncGroups(sh);
  var nm = a.filter(function (x) { return x.charAt(0) !== '-'; })[0]; var hn = nm && sh.fs.get('/home/' + nm); if (hn) hn.group = nm;
  return r;
};
cmds.userdel = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: userdel: command not found', 127);
  needRoot(sh, c, 'userdel: Permission denied.\nuserdel: cannot lock /etc/passwd; try again later.');
  var n = a[a.length - 1], S = secS(sh); if (!S.users[n]) throw new CmdErr("userdel: user '" + n + "' does not exist", 6);
  delete S.users[n]; if (a.indexOf('-r') >= 0) sh.fs.rm('/home/' + n); syncGroups(sh); return 0;
};
cmds.chpasswd = function (a, c) { var sh = c.sh; needRoot(sh, c, 'chpasswd: Permission denied.'); lines(c.stdin).forEach(function (l) { var u = l.split(':')[0], us = secS(sh).users[u]; if (us) us.locked = false; }); return 0; };
function idLine(sh, user, sess) {
  var gs = sess ? sgroups(sh, user) : dbGroups(sh, user), u = user === 'root' ? { uid: 0 } : secS(sh).users[user];
  var parts = gs.map(function (g) { return gidOf(sh, g) + '(' + g + ')'; });
  return 'uid=' + u.uid + '(' + user + ') gid=' + (user === 'root' ? 0 : u.uid) + '(' + user + ') groups=' + parts.join(',');
}
var prevId = cmds.id, prevGroups = cmds.groups, prevGetent = cmds.getent;
cmds.id = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevId(a, c);
  var fl = a.filter(function (x) { return x.charAt(0) === '-'; }).join(''), n = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  var cur = n || (c.sudo || sh.forceRoot ? 'root' : sh.user);
  if (!userExists(sh, cur)) throw new CmdErr("id: '" + cur + "': no such user");
  var sess = !n || n === sh.user;
  if (/G/.test(fl) && /n/.test(fl)) { c.out(sgroups(sh, cur === sh.user && sess ? sh.user : cur).join(' ') + '\n'); if (!sess) { } return 0; }
  if (/u/.test(fl) && /n/.test(fl)) { c.out(cur + '\n'); return 0; }
  if (/u/.test(fl)) { c.out((cur === 'root' ? 0 : secS(sh).users[cur].uid) + '\n'); return 0; }
  c.out(idLine(sh, cur, sess && cur === sh.user) + '\n'); return 0;
};
cmds.groups = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevGroups(a, c);
  var n = a[0] || (c.sudo || sh.forceRoot ? 'root' : sh.user);
  if (!userExists(sh, n)) throw new CmdErr("groups: '" + n + "': no such user");
  var gs = (!a[0] || a[0] === sh.user) ? sgroups(sh, n) : dbGroups(sh, n);
  c.out((a[0] ? n + ' : ' : '') + gs.join(' ') + '\n'); return 0;
};
cmds.getent = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevGetent(a, c);
  syncGroups(sh);
  var db = a[0], key = a[1];
  if (db !== 'passwd' && db !== 'group') throw new CmdErr('Mô phỏng: getent passwd|group [tên]');
  var ls = lines(fileText(sh, db === 'group' ? '/etc/group' : '/etc/passwd')).filter(function (l) { return !key || l.split(':')[0] === key; });
  if (!ls.length) return 2;
  c.out(ls.join('\n') + '\n'); return 0;
};
V.grpCheck = function (sh, owner, grp) {
  if (!on(sh)) return null;
  if (owner && !userExists(sh, owner)) return 'invalid user: ‘' + owner + '’';
  if (grp && !groupExists(sh, grp)) return 'invalid group: ‘' + (owner ? owner + ':' : ':') + grp + '’'.replace('‘:' , '‘');
  return null;
};
cmds.chgrp = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: chgrp: command not found', 127);
  var rec = a.indexOf('-R') >= 0, r = a.filter(function (x) { return x.charAt(0) !== '-'; }), g = r.shift(), rc = 0;
  if (!g || !r.length) throw new CmdErr("chgrp: missing operand", 1);
  if (!groupExists(sh, g)) throw new CmdErr("chgrp: invalid group: ‘" + g + "’", 1);
  function setg(p) { var full = sh.fs.real(p), n = sh.fs.n[full]; n.group = g; if (rec && n.t === 'd') sh.fs.list(full).forEach(function (k) { setg(full + '/' + k); }); }
  r.forEach(function (p) {
    var full = sh.abs(p), n = sh.fs.get(full);
    if (!n) { c.err("chgrp: cannot access '" + p + "': No such file or directory\n"); rc = 1; return; }
    if (!sh.isRoot(c) && !(n.owner === sh.user && sgroups(sh, sh.user).indexOf(g) >= 0)) { c.err("chgrp: changing group of '" + p + "': Operation not permitted\n"); rc = 1; return; }
    setg(full);
  });
  return rc;
};
/* quyền theo nhóm */
var prevCanRead = SP.canRead, prevCanWrite = SP.canWrite;
function grpOf(n) { return n.group || n.owner; }
SP.canRead = function (p, c) {
  if (!on(this)) return prevCanRead.call(this, p, c);
  if (this.isRoot(c)) return true;
  var n = this.fs.get(p); if (!n) return true;
  if (n.owner === this.user) return true;
  if (sgroups(this, this.user).indexOf(grpOf(n)) >= 0) return !!(n.mode & 32);
  return !!(n.mode & 4);
};
SP.canWrite = function (p, c) {
  if (!on(this)) return prevCanWrite.call(this, p, c);
  if (this.isRoot(c)) return true;
  p = this.fs.real(p);
  var n = this.fs.n[p], me = this, g = sgroups(this, this.user);
  function chk(n) { if (n.owner === me.user) return !!(n.mode & 128); if (g.indexOf(grpOf(n)) >= 0) return !!(n.mode & 16); return !!(n.mode & 2); }
  if (n) return chk(n);
  var pp = this.fs.parent(p), d = this.fs.n[pp];
  while (!d && pp && pp !== '/') { pp = this.fs.parent(pp); d = this.fs.n[pp]; }
  if (!d) return false;
  if (d.owner === this.user) return true;
  return g.indexOf(grpOf(d)) >= 0 ? !!(d.mode & 16) : !!(d.mode & 2);
};
var prevStat = cmds.stat;
cmds.stat = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevStat(a, c);
  var ci = a.indexOf('-c'), fmt = ci >= 0 ? a[ci + 1] : null, files = a.filter(function (x, i) { return x.charAt(0) !== '-' && a[i - 1] !== '-c'; }), rc = 0;
  files.forEach(function (f) {
    var p = sh.abs(f), n = sh.fs.get(p);
    if (!n) { c.err("stat: cannot statx '" + f + "': No such file or directory\n"); rc = 1; return; }
    var oct = (n.mode & 4095).toString(8); if (oct.length < 3) oct = ('000' + oct).slice(-3);
    var ms = V.util.modeString(n), sz = sh.fs.size(sh.fs.real(p));
    if (fmt) c.out(fmt.replace(/%a/g, oct).replace(/%A/g, ms).replace(/%U/g, n.owner).replace(/%G/g, grpOf(n)).replace(/%n/g, f).replace(/%s/g, String(sz)).replace(/%F/g, n.t === 'd' ? 'directory' : 'regular file') + '\n');
    else c.out('  File: ' + f + '\n  Size: ' + sz + '\t\tBlocks: ' + Math.ceil(sz / 512) + '\t IO Block: 4096   ' + (n.t === 'd' ? 'directory' : 'regular file') + '\nAccess: (' + ('0000' + (n.mode & 4095).toString(8)).slice(-4) + '/' + ms + ')  Uid: (' + pad(userExists(sh, n.owner) && n.owner !== 'root' && secS(sh).users[n.owner] ? secS(sh).users[n.owner].uid : 0, 5, true) + '/' + pad(n.owner, 8, true) + ')   Gid: (' + pad(gidOf(sh, grpOf(n)) != null ? gidOf(sh, grpOf(n)) : 0, 5, true) + '/' + pad(grpOf(n), 8, true) + ')\n');
  });
  return rc;
};
/* whoami khi forceRoot */
var prevWhoami = cmds.whoami;
cmds.whoami = function (a, c) { if (c.sh.forceRoot) { c.out('root\n'); return 0; } return prevWhoami(a, c); };
/* sudo -u, su */
var prevSudo = cmds.sudo;
function asUser(sh, user, fn) {
  var sv = { user: sh.user, home: sh.home, forceRoot: sh.forceRoot, env: sh.env, cwd: sh.cwd };
  sh.user = user; sh.home = user === 'root' ? '/root' : '/home/' + user; sh.forceRoot = false;
  var S = S2(sh); var oldS = S.sessG && S.sessG[user]; if (S.sessG) delete S.sessG[user];
  try { return fn(); } finally { sh.user = sv.user; sh.home = sv.home; sh.forceRoot = sv.forceRoot; if (S.sessG && oldS) S.sessG[user] = oldS; }
}
cmds.sudo = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevSudo(a, c);
  var ui = -1, oi;
  for (oi = 0; oi < a.length; oi++) {
    if (a[oi] === '-u') { ui = oi; break; }
    if (/^-[ghpCDrtUTR]$/.test(a[oi])) { oi++; continue; }
    if (a[oi].charAt(0) !== '-') break;
  }
  if (ui >= 0 && a[ui + 1] && a[ui + 1] !== 'root') {
    var target = a[ui + 1], rest = a.slice(); rest.splice(ui, 2);
    rest = rest.filter(function (x, i) { return !(i === 0 && x.charAt(0) === '-' && /^-[EHn]+$/.test(x)); });
    if (!userExists(sh, target)) throw new CmdErr('sudo: unknown user ' + target, 1);
    while (rest.length && rest[0].charAt(0) === '-') rest.shift();
    if (!rest.length) throw new CmdErr('sudo: a command is required', 1);
    if (!sh.isRoot(c) && !(secS(sh).users[sh.user] || {}).sudo) throw new CmdErr(sh.user + ' is not in the sudoers file.', 1);
    var cc = Object.create(c); cc.sudo = false;
    return asUser(sh, target, function () { return sh.call(rest, cc, {}); });
  }
  return prevSudo(a, c);
};
cmds.su = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: su: command not found', 127);
  var login = false, user = 'root', cmdline = null, i;
  for (i = 0; i < a.length; i++) { if (a[i] === '-' || a[i] === '-l' || a[i] === '--login') login = true; else if (a[i] === '-c') cmdline = a[++i]; else if (a[i].charAt(0) !== '-') user = a[i]; }
  if (!userExists(sh, user)) throw new CmdErr('su: user ' + user + ' does not exist or the user entry does not contain all the required fields', 1);
  if (!sh.isRoot(c)) { c.out('Password: '); throw new CmdErr('su: Authentication failure', 1); }
  if (cmdline == null) { c.out('su: shell tương tác không chạy được trong khung này. Dùng: sudo su - ' + user + " -c 'lệnh'  hoặc  sudo -u " + user + ' lệnh\n'); return 1; }
  var cc = Object.create(c); cc.sudo = false;
  return asUser(sh, user, function () { var cwd = sh.cwd; if (login) sh.cwd = sh.home; try { var r = sh.runScriptText(cmdline, 'bash', [], {}); if (r.out) c.out(r.out); return r.code; } finally { sh.cwd = cwd; } });
};
var prevExit2 = B.exit;
B.exit = function (a, c) { var sh = c.sh; if (on(sh) && !sh.sdepth && !(sh.fstack && sh.fstack.length)) L2.relogin(sh); return prevExit2(a, c); };
var prevNewgrp = cmds.newgrp;
cmds.newgrp = function (a, c) { if (!on(c.sh) && prevNewgrp) return prevNewgrp(a, c); c.out('newgrp: mô phỏng không đổi được nhóm của phiên. Cách đúng: thoát (exit) rồi đăng nhập lại để nhóm mới có hiệu lực.\n'); return 1; };

/* ============ apt, dpkg ============ */
var REPO = {
  nginx: { ver: '1.24.0-2ubuntu7.1', kb: 1280, desc: 'small, powerful, scalable web/proxy server', dep: ['nginx-common'] },
  curl: { ver: '8.5.0-2ubuntu10.5', kb: 520, desc: 'command line tool for transferring data with URL syntax' },
  openssl: { ver: '3.0.13-0ubuntu3.4', kb: 2100, desc: 'Secure Sockets Layer toolkit - cryptographic utility' },
  'openssh-server': { ver: '1:9.6p1-3ubuntu13.5', kb: 1900, desc: 'secure shell (SSH) server, for secure access from remote machines' },
  git: { ver: '1:2.43.0-1ubuntu7.1', kb: 4800, desc: 'fast, scalable, distributed revision control system', dep: ['git-man', 'liberror-perl'] },
  htop: { ver: '3.3.0-4build1', kb: 420, desc: 'interactive processes viewer' },
  tmux: { ver: '3.4-1ubuntu0.1', kb: 750, desc: 'terminal multiplexer' },
  ncdu: { ver: '1.19-0.1build1', kb: 110, desc: 'ncurses disk usage viewer' },
  tree: { ver: '2.1.1-2ubuntu3', kb: 60, desc: 'displays an indented directory tree, in color' },
  age: { ver: '1.1.1-2', kb: 1100, desc: 'simple, modern and secure file encryption tool' },
  jq: { ver: '1.7.1-3build1', kb: 100, desc: 'lightweight and flexible command-line JSON processor', dep: ['libjq1', 'libonig5'] },
  unzip: { ver: '6.0-28ubuntu4.1', kb: 175, desc: 'De-archiver for .zip files' },
  zip: { ver: '3.0-13ubuntu0.1', kb: 175, desc: 'Archiver for .zip files' },
  rsync: { ver: '3.2.7-1ubuntu1.1', kb: 440, desc: 'fast, versatile, remote (and local) file-copying tool' },
  'net-tools': { ver: '2.10-0.1ubuntu4', kb: 200, desc: 'NET-3 networking toolkit' },
  dnsutils: { ver: '1:9.18.28-0ubuntu0.24.04.1', kb: 380, desc: 'Transitional package for bind9-dnsutils', dep: ['bind9-dnsutils', 'bind9-host', 'bind9-libs'] },
  traceroute: { ver: '1:2.1.5-1', kb: 70, desc: 'Traces the route taken by packets over an IPv4/IPv6 network' },
  'mtr-tiny': { ver: '0.95-1build1', kb: 100, desc: 'Full screen ncurses and report network diagnostic tool' },
  ufw: { ver: '0.36.2-6', kb: 170, desc: 'program for managing a Netfilter firewall' },
  fail2ban: { ver: '1.0.2-3ubuntu0.1', kb: 1500, desc: 'ban hosts that cause multiple authentication errors' },
  postgresql: { ver: '16+257build1.1', kb: 80, desc: 'object-relational SQL database (supported version)', dep: ['libpq5', 'postgresql-16', 'postgresql-client-16', 'postgresql-common'] },
  nodejs: { ver: '18.19.1+dfsg-6ubuntu5', kb: 25400, desc: 'evented I/O for V8 javascript - runtime executable', dep: ['libnode109', 'node-acorn'] },
  npm: { ver: '9.2.0~ds1-2', kb: 1800, desc: 'package manager for Node.js' },
  'build-essential': { ver: '12.10ubuntu1', kb: 20, desc: 'Informational list of build-essential packages', dep: ['gcc', 'g++', 'make', 'dpkg-dev'] },
  'software-properties-common': { ver: '0.99.49.1', kb: 140, desc: 'manage the repositories that you install software from (common)' },
  vim: { ver: '2:9.1.0016-1ubuntu7.3', kb: 1700, desc: 'Vi IMproved - enhanced vi editor' },
  nano: { ver: '7.2-2build1', kb: 280, desc: 'small, friendly text editor inspired by Pico' },
  lsof: { ver: '4.95.0-1build3', kb: 250, desc: 'utility to list open files' },
  certbot: { ver: '2.9.0-1', kb: 90, desc: 'automatically configure HTTPS using Let\'s Encrypt', dep: ['python3-certbot', 'python3-acme'] },
  'unattended-upgrades': { ver: '2.9.1+nmu4ubuntu1', kb: 160, desc: 'automatic installation of security upgrades' },
  'docker.io': { ver: '24.0.7-0ubuntu4.1', kb: 29000, desc: 'Linux container runtime', dep: ['containerd', 'runc', 'bridge-utils'] },
  'ca-certificates': { ver: '20240203', kb: 160, desc: 'Common CA certificates' },
  gnupg: { ver: '2.4.4-2ubuntu17', kb: 560, desc: 'GNU privacy guard - a free PGP replacement' }
};
var CMDPKG = { age: 'age', 'age-keygen': 'age', ncdu: 'ncdu', htop: 'htop', tmux: 'tmux', tree: 'tree', jq: 'jq', unzip: 'unzip', zip: 'zip', rsync: 'rsync', traceroute: 'traceroute', mtr: 'mtr-tiny', nslookup: 'dnsutils', dig: 'dnsutils', git: 'git', netstat: 'net-tools', ifconfig: 'net-tools', lsof: 'lsof' };
L2.CMDPKG = CMDPKG;
var BASEPKGS = ['ca-certificates', 'curl', 'nginx', 'openssh-server', 'openssl', 'rsync', 'nano', 'ufw', 'gnupg'];
function sources(sh) {
  var txt = '', files = [];
  sh.fs.list('/etc/apt/sources.list.d').forEach(function (n) { txt += '\n' + fileText(sh, '/etc/apt/sources.list.d/' + n); files.push(n); });
  txt += '\n' + fileText(sh, '/etc/apt/sources.list');
  return txt;
}
function candidates(sh) {
  var S = S2(sh), txt = sources(sh), cand = {}, m;
  Object.keys(REPO).forEach(function (n) { cand[n] = { ver: REPO[n].ver, origin: 'ubuntu', kb: REPO[n].kb }; });
  if ((m = /deb\.nodesource\.com\/node_(\d+)\.x/.exec(txt))) { var v = m[1], full = { 18: '18.20.4', 20: '20.18.0', 22: '22.11.0', 24: '24.0.0' }[v] || v + '.0.0'; cand.nodejs = { ver: full + '-1nodesource1', origin: 'nodesource', kb: 31000, major: v }; cand.npm = { ver: cand.npm.ver, origin: 'ubuntu', kb: 0 }; }
  if (/git-core\/ppa|git-core-ubuntu-ppa/.test(txt)) cand.git = { ver: '1:2.47.0-0ppa1~ubuntu24.04.1', origin: 'ppa', kb: 5200 };
  return cand;
}
function refreshCache(sh) { S2(sh).cache = candidates(sh); }
function lockHolder(sh) {
  var l = sh.W.lin; if (!l) return null;
  return l.procs.filter(function (p) { return p.name === 'unattended-upgr' || /unattended-upgr/.test(p.cmd); })[0] || null;
}
function aptCommon(sh, c, sub) {
  var S = S2(sh);
  if (!sh.isRoot(c)) {
    if (sub === 'update') throw new CmdErr('Reading package lists... Done\nE: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock directory /var/lib/apt/lists/\nW: Problem unlinking the file /var/cache/apt/pkgcache.bin - RemoveCaches (13: Permission denied)\nW: Problem unlinking the file /var/cache/apt/srcpkgcache.bin - RemoveCaches (13: Permission denied)', 100);
    throw new CmdErr('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?', 100);
  }
  var h = lockHolder(sh);
  if (h) {
    if (sub === 'update') throw new CmdErr('Reading package lists... Done\nE: Could not get lock /var/lib/apt/lists/lock. It is held by process ' + h.pid + ' (unattended-upgr)\nN: Be aware that removing the lock file is not a solution and may break your system.\nE: Unable to lock directory /var/lib/apt/lists/', 100);
    throw new CmdErr('E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process ' + h.pid + ' (unattended-upgr)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), is another process using it?', 100);
  }
  if (S.dpkgBroken) throw new CmdErr("E: dpkg was interrupted, you must manually run 'sudo dpkg --configure -a' to correct the problem.", 100);
}
function installedList(sh) { return Object.keys(S2(sh).pkgs).sort(); }
function upgradable(sh) { var S = S2(sh); return S.upg.filter(function (u) { return S.pkgs[u[0]] && !S.held[u[0]]; }); }
function resolveArg(sh, a) { var m = /^([^=]+)(?:=(.+))?$/.exec(a); return { name: m[1], ver: m[2] }; }
function nNotUpgraded(sh) { return upgradable(sh).length + Object.keys(S2(sh).held).filter(function (k) { return S2(sh).upg.some(function (u) { return u[0] === k; }); }).length; }
function doInstall(sh, c, names, yes) {
  var S = S2(sh), cache = S.cache || candidates(sh), news = [], extra = [], already = [], rc = 0;
  names.forEach(function (raw) {
    var r = resolveArg(sh, raw), n = r.name, ca = cache[n];
    if (!ca) { c.err('E: Unable to locate package ' + n + '\n'); rc = 100; return; }
    if (S.pkgs[n] && S.pkgs[n].ver === ca.ver) { already.push(n); return; }
    news.push(n); (REPO[n].dep || []).forEach(function (d) { if (!S.pkgs[d] && extra.indexOf(d) < 0) extra.push(d); });
  });
  if (rc && !news.length && !already.length) return rc;
  if (rc) return rc;
  var hdr = 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n';
  already.forEach(function (n) { hdr += n + ' is already the newest version (' + S.pkgs[n].ver + ').\n'; });
  if (!news.length) { c.out(hdr + '0 upgraded, 0 newly installed, 0 to remove and ' + nNotUpgraded(sh) + ' not upgraded.\n'); return 0; }
  var up = news.filter(function (n) { return S.pkgs[n]; }), nw = news.filter(function (n) { return !S.pkgs[n]; }), kb = 0;
  news.forEach(function (n) { kb += cache[n].kb; }); extra.forEach(function () { kb += 300; });
  var out = hdr;
  if (extra.length) out += 'The following additional packages will be installed:\n  ' + extra.join(' ') + '\n';
  if (nw.length || extra.length) out += 'The following NEW packages will be installed:\n  ' + nw.concat(extra).join(' ') + '\n';
  if (up.length) out += 'The following packages will be upgraded:\n  ' + up.join(' ') + '\n';
  out += up.length + ' upgraded, ' + (nw.length + extra.length) + ' newly installed, 0 to remove and ' + nNotUpgraded(sh) + ' not upgraded.\nNeed to get ' + Math.round(kb * 0.45) + ' kB of archives.\nAfter this operation, ' + Math.round(kb * 1.2) + ' kB of additional disk space will be used.\n';
  if (!yes) out += 'Do you want to continue? [Y/n] Y (mô phỏng: tự trả lời Y; ngoài đời bạn gõ y rồi Enter, hoặc thêm -y để bỏ qua câu hỏi)\n';
  var i = 1;
  news.concat(extra).forEach(function (n) { out += 'Get:' + (i++) + ' ' + ((cache[n] && cache[n].origin === 'nodesource') ? 'https://deb.nodesource.com/node_' + cache[n].major + '.x nodistro/main' : 'http://archive.ubuntu.com/ubuntu noble/main') + ' amd64 ' + n + ' amd64 ' + ((cache[n] || REPO[n] || { ver: '1.0' }).ver) + ' [' + Math.round(((cache[n] || { kb: 300 }).kb) * 0.45) + ' kB]\n'; });
  news.concat(extra).forEach(function (n) { out += 'Setting up ' + n + ' (' + ((cache[n] || REPO[n] || { ver: '1.0' }).ver) + ') ...\n'; });
  c.out(out);
  news.forEach(function (n) { S.pkgs[n] = { ver: cache[n].ver, manual: true, rc: false }; delete S.rc[n]; S.upg = S.upg.filter(function (u) { return u[0] !== n; }); addFiles(sh, n); });
  extra.forEach(function (n) { S.pkgs[n] = { ver: (REPO[n] || { ver: '1.0' }).ver, manual: false }; });
  return 0;
}
function addFiles(sh, n) {
  var f = sh.fs;
  if (n === 'nodejs') { f.put('/usr/bin/node', 'ELF node', { owner: 'root', mode: 493 }); }
  if (n === 'git') f.put('/usr/bin/git', 'ELF', { owner: 'root', mode: 493 });
  if (n === 'htop' || n === 'tmux' || n === 'ncdu' || n === 'tree' || n === 'jq') f.put('/usr/bin/' + n, 'ELF', { owner: 'root', mode: 493 });
  if (n === 'nginx') { f.mkdirp('/etc/nginx', 'root'); if (!f.get('/etc/nginx/nginx.conf')) f.put('/etc/nginx/nginx.conf', 'user www-data;\nworker_processes auto;\nevents { worker_connections 768; }\nhttp { include /etc/nginx/sites-enabled/*; }\n', { owner: 'root' }); }
}
function dpkgState(S, n) { if (S.pkgs[n]) return S.held[n] ? 'hi' : 'ii'; if (S.rc[n]) return 'rc'; return null; }
cmds.apt = (function (prev) {
  return function (a, c) {
    var sh = c.sh; if (!on(sh)) return prev(a, c);
    var S = S2(sh), flags = a.filter(function (x) { return x.charAt(0) === '-'; }), pos = a.filter(function (x) { return x.charAt(0) !== '-'; }), sub = pos[0], args = pos.slice(1), yes = flags.some(function (f) { return /^-[a-z]*y|--yes|--assume-yes/.test(f); });
    if (!S.cache) refreshCache(sh);
    if (!sub) { c.out('apt 2.7.14 (amd64)\nUsage: apt [options] command\n'); return 0; }
    switch (sub) {
      case 'update': {
        aptCommon(sh, c, 'update');
        refreshCache(sh); S.updated = true;
        var cand = S.cache, n = upgradable(sh).length, out = 'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]\nGet:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\n';
        if (cand.nodejs && cand.nodejs.origin === 'nodesource') out += 'Get:4 https://deb.nodesource.com/node_' + cand.nodejs.major + '.x nodistro InRelease [12.1 kB]\nGet:5 https://deb.nodesource.com/node_' + cand.nodejs.major + '.x nodistro/main amd64 Packages [3,422 B]\n';
        if (cand.git && cand.git.origin === 'ppa') out += 'Get:6 https://ppa.launchpadcontent.net/git-core/ppa/ubuntu noble InRelease [24.6 kB]\n';
        out += 'Fetched 391 kB in 1s (412 kB/s)\nReading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n' + (n ? n + ' package' + (n > 1 ? 's' : '') + ' can be upgraded. Run \'apt list --upgradable\' to see ' + (n > 1 ? 'them' : 'it') + '.\n' : 'All packages are up to date.\n');
        c.out(out); return 0;
      }
      case 'upgrade': case 'full-upgrade': case 'dist-upgrade': {
        aptCommon(sh, c, 'upgrade');
        var ups = upgradable(sh), kept = S.upg.filter(function (u) { return S.pkgs[u[0]] && S.held[u[0]]; }).map(function (u) { return u[0]; });
        var o = 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nCalculating upgrade... Done\n';
        if (kept.length) o += 'The following packages have been kept back:\n  ' + kept.join(' ') + '\n';
        if (ups.length) o += 'The following packages will be upgraded:\n  ' + ups.map(function (u) { return u[0]; }).join(' ') + '\n';
        o += ups.length + ' upgraded, 0 newly installed, 0 to remove and ' + kept.length + ' not upgraded.\n';
        ups.forEach(function (u) { o += 'Setting up ' + u[0] + ' (' + u[1] + ') ...\n'; S.pkgs[u[0]].ver = u[1]; });
        S.upg = S.upg.filter(function (u) { return !(S.pkgs[u[0]] && !S.held[u[0]]); });
        c.out(o); return 0;
      }
      case 'install': case 'reinstall': {
        if (!args.length) throw new CmdErr('E: No packages specified', 100);
        aptCommon(sh, c, 'install'); return doInstall(sh, c, args, yes);
      }
      case 'remove': case 'purge': case 'autoremove': case 'autopurge': {
        aptCommon(sh, c, 'remove');
        if (sub === 'autoremove' || sub === 'autopurge') {
          var au = Object.keys(S.pkgs).filter(function (k) { return !S.pkgs[k].manual; });
          var hd0 = 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n';
          if (!au.length) { c.out(hd0 + '0 upgraded, 0 newly installed, 0 to remove and ' + nNotUpgraded(sh) + ' not upgraded.\n'); return 0; }
          c.out(hd0 + 'The following packages will be REMOVED:\n  ' + au.join(' ') + '\n0 upgraded, 0 newly installed, ' + au.length + ' to remove and ' + nNotUpgraded(sh) + ' not upgraded.\n'); au.forEach(function (k) { delete S.pkgs[k]; }); return 0;
        }
        var gone = [], hdr2 = 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n';
        args.forEach(function (n) {
          if (!REPO[n] && !S.pkgs[n]) { throw new CmdErr('E: Unable to locate package ' + n, 100); }
          if (!S.pkgs[n]) { if (sub === 'purge' && S.rc[n]) { gone.push(n); return; } hdr2 += "Package '" + n + "' is not installed, so not removed\n"; return; }
          gone.push(n);
        });
        if (!gone.length) { c.out(hdr2 + '0 upgraded, 0 newly installed, 0 to remove and ' + nNotUpgraded(sh) + ' not upgraded.\n'); return 0; }
        var o2 = hdr2 + 'The following packages will be REMOVED:\n  ' + gone.join(' ') + '\n0 upgraded, 0 newly installed, ' + gone.length + ' to remove and ' + nNotUpgraded(sh) + ' not upgraded.\n';
        gone.forEach(function (n) {
          o2 += (sub === 'purge' ? 'Purging configuration files for ' + n + ' ...\n' : 'Removing ' + n + ' (' + ((S.pkgs[n] || {}).ver || '') + ') ...\n');
          delete S.pkgs[n];
          if (sub === 'purge') { delete S.rc[n]; if (n === 'nginx') sh.fs.rm('/etc/nginx'); } else S.rc[n] = true;
          if (n === 'nodejs') sh.fs.rm('/usr/bin/node');
          if (n === 'nginx' && sh.W.lin) sh.W.lin.procs = sh.W.lin.procs.filter(function (p) { return p.name !== 'nginx'; });
          if (n === 'nginx' || n === 'git') sh.fs.rm('/usr/bin/' + n);
        });
        c.out(o2); return 0;
      }
      case 'list': {
        if (flags.indexOf('--upgradable') >= 0) {
          var us = upgradable(sh).concat(S.upg.filter(function (u) { return S.pkgs[u[0]] && S.held[u[0]]; }));
          c.out('Listing... Done\n' + us.map(function (u) { return u[0] + '/noble-updates ' + u[1] + ' amd64 [upgradable from: ' + u[2] + ']'; }).join('\n') + (us.length ? '\n' : '')); return 0;
        }
        if (flags.indexOf('--installed') >= 0) {
          c.out('Listing... Done\n' + installedList(sh).map(function (n) { return n + '/noble,now ' + S.pkgs[n].ver + ' amd64 [installed' + (S.pkgs[n].manual ? '' : ',automatic') + ']'; }).join('\n') + '\n'); return 0;
        }
        var pat = args[0]; var all = Object.keys(S.cache).filter(function (n) { return !pat || n.indexOf(pat.replace(/\*/g, '')) >= 0; }).sort();
        c.out('Listing... Done\n' + all.map(function (n) { return n + '/noble ' + S.cache[n].ver + ' amd64' + (S.pkgs[n] ? ' [installed]' : ''); }).join('\n') + '\n'); return 0;
      }
      case 'search': {
        var kw = (args[0] || '').toLowerCase(), hit = Object.keys(REPO).filter(function (n) { return n.indexOf(kw) >= 0 || REPO[n].desc.toLowerCase().indexOf(kw) >= 0; }).sort();
        c.out('Sorting... Done\nFull Text Search... Done\n' + hit.map(function (n) { return n + '/noble ' + S.cache[n].ver + ' amd64' + (S.pkgs[n] ? ' [installed]' : '') + '\n  ' + REPO[n].desc; }).join('\n\n') + (hit.length ? '\n' : '')); return 0;
      }
      case 'show': {
        var n3 = args[0]; if (!REPO[n3]) { c.err('E: No packages found\n'); return 100; }
        c.out('Package: ' + n3 + '\nVersion: ' + S.cache[n3].ver + '\nPriority: optional\nSection: ' + (n3 === 'nodejs' ? 'javascript' : 'universe/utils') + '\nOrigin: ' + (S.cache[n3].origin === 'nodesource' ? 'nodesource' : 'Ubuntu') + '\nMaintainer: Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>\nInstalled-Size: ' + REPO[n3].kb + ' kB\n' + (REPO[n3].dep ? 'Depends: ' + REPO[n3].dep.join(', ') + '\n' : '') + 'Description: ' + REPO[n3].desc + '\n'); return 0;
      }
      case 'policy': return cmds['apt-cache'](['policy'].concat(args), c);
      case 'autoclean': case 'clean': { aptCommon(sh, c, 'clean'); return 0; }
      default: return prev(a, c);
    }
  };
})(cmds.apt);
cmds['apt-get'] = function (a, c) { var sh = c.sh; if (!on(sh)) return cmds.apt(a, c); if (a[0] === 'update' || a[0] === 'install' || a[0] === 'upgrade' || a[0] === 'remove' || a[0] === 'purge' || a[0] === 'autoremove' || a[0] === 'clean' || a[0] === 'dist-upgrade') return cmds.apt(a, c); return cmds.apt(a, c); };
cmds['apt-cache'] = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: apt-cache: command not found', 127);
  var S = S2(sh); if (!S.cache) refreshCache(sh);
  var sub = a[0], args = a.slice(1).filter(function (x) { return x.charAt(0) !== '-'; });
  if (sub === 'policy') {
    if (!args.length) { c.out('Package files:\n 100 /var/lib/dpkg/status\n     release a=now\n 500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\n'); return 0; }
    args.forEach(function (n) {
      var ca = S.cache[n]; if (!ca && !REPO[n]) { c.out(n + ':\n'.replace(/^/, '')); c.err('N: Unable to locate package ' + n + '\n'); return; }
      var inst = S.pkgs[n], out = n + ':\n  Installed: ' + (inst ? inst.ver : '(none)') + '\n  Candidate: ' + ca.ver + '\n  Version table:\n';
      var rows = [];
      if (ca.origin !== 'ubuntu') rows.push([ca.ver, ca.origin === 'nodesource' ? 1000 : 500, ca.origin === 'nodesource' ? 'https://deb.nodesource.com/node_' + ca.major + '.x nodistro/main amd64 Packages' : 'https://ppa.launchpadcontent.net/git-core/ppa/ubuntu noble/main amd64 Packages']);
      rows.push([REPO[n].ver, 500, 'http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages']);
      rows.forEach(function (r) {
        var isI = inst && inst.ver === r[0];
        out += ' ' + (isI ? '***' : '   ') + ' ' + r[0] + ' ' + r[1] + '\n' + '        ' + r[1] + ' ' + r[2] + '\n' + (isI ? '        100 /var/lib/dpkg/status\n' : '');
      });
      c.out(out);
    });
    return 0;
  }
  if (sub === 'madison') { args.forEach(function (n) { if (REPO[n]) c.out(pad(n, 10, true) + ' | ' + S.cache[n].ver + ' | http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages\n'); }); return 0; }
  if (sub === 'show' || sub === 'search') return cmds.apt([sub].concat(args), c);
  c.out('Mô phỏng apt-cache: policy, madison, show, search\n'); return 0;
};
cmds['apt-mark'] = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: apt-mark: command not found', 127);
  var S = S2(sh), sub = a[0], args = a.slice(1).filter(function (x) { return x.charAt(0) !== '-'; });
  if (sub === 'showhold') { c.out(Object.keys(S.held).sort().join('\n') + (Object.keys(S.held).length ? '\n' : '')); return 0; }
  if (sub === 'hold' || sub === 'unhold') {
    if (!sh.isRoot(c)) throw new CmdErr('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?', 100);
    args.forEach(function (n) {
      if (!S.pkgs[n]) { c.err('E: Unable to locate package ' + n + '\n'); return; }
      if (sub === 'hold') { S.held[n] = true; c.out(n + ' set on hold.\n'); } else { delete S.held[n]; c.out('Canceled hold on ' + n + '.\n'); }
    });
    return 0;
  }
  if (sub === 'showmanual') { c.out(installedList(sh).filter(function (n) { return S.pkgs[n].manual; }).join('\n') + '\n'); return 0; }
  if (sub === 'manual' || sub === 'auto') { args.forEach(function (n) { if (S.pkgs[n]) { S.pkgs[n].manual = sub === 'manual'; c.out(n + ' set to ' + (sub === 'manual' ? 'manually' : 'automatically') + ' installed.\n'); } }); return 0; }
  throw new CmdErr('Usage: apt-mark hold|unhold|showhold|manual|auto|showmanual', 1);
};
cmds.dpkg = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: dpkg: command not found', 127);
  var S = S2(sh), fl = a[0] || '', args = a.slice(1);
  if (fl === '-l' || fl === '--list') {
    var pat = args[0], names = Object.keys(S.pkgs).concat(Object.keys(S.rc)).filter(function (n, i, arr) { return arr.indexOf(n) === i; }).sort();
    if (pat) { var re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); names = names.filter(function (n) { return re.test(n) || (pat.indexOf('*') < 0 && n === pat); }); if (!names.length) { c.err('dpkg-query: no packages found matching ' + pat + '\n'); return 1; } }
    var out = 'Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name                 Version                    Architecture Description\n+++-====================-==========================-============-=================================\n';
    names.forEach(function (n) { var st = dpkgState(S, n), v = (S.pkgs[n] || { ver: (REPO[n] || { ver: '' }).ver }).ver; out += st + '  ' + pad(n, 20) + ' ' + pad(v, 26) + ' amd64        ' + (REPO[n] ? REPO[n].desc.slice(0, 40) : 'package') + '\n'; });
    c.out(out); return 0;
  }
  if (fl === '-s' || fl === '--status') {
    var n = args[0]; if (!S.pkgs[n]) { c.err("dpkg-query: package '" + n + "' is not installed and no information is available\nUse dpkg --info (= dpkg-deb --info) to examine archive files.\n"); return 1; }
    c.out('Package: ' + n + '\nStatus: install ok installed' + (S.held[n] ? ' (hold)' : '') + '\nPriority: optional\nArchitecture: amd64\nVersion: ' + S.pkgs[n].ver + '\nDescription: ' + (REPO[n] ? REPO[n].desc : '') + '\n'); return 0;
  }
  if (fl === '-L' || fl === '--listfiles') {
    var p = args[0]; if (!S.pkgs[p]) { c.err("dpkg-query: package '" + p + "' is not installed\nUse dpkg --info (= dpkg-deb --info) to examine archive files.\n"); return 1; }
    var map = { nginx: ['/etc/nginx', '/etc/nginx/nginx.conf', '/usr/sbin/nginx', '/usr/share/nginx', '/var/log/nginx'], curl: ['/usr/bin/curl'], nodejs: ['/usr/bin/node', '/usr/share/doc/nodejs'], git: ['/usr/bin/git'], htop: ['/usr/bin/htop'] };
    c.out(['/.'].concat(map[p] || ['/usr/share/doc/' + p]).join('\n') + '\n'); return 0;
  }
  if (fl === '--get-selections') { c.out(installedList(sh).map(function (n) { return pad(n, 30) + (S.held[n] ? 'hold' : 'install'); }).join('\n') + '\n'); return 0; }
  if (fl === '--configure') {
    if (!sh.isRoot(c)) throw new CmdErr('dpkg: error: requested operation requires superuser privilege', 2);
    var h = lockHolder(sh); if (h) throw new CmdErr('dpkg: error: dpkg frontend lock was locked by another process with pid ' + h.pid + '\nNote: removing the lock file is always wrong, and can end up damaging the locked area and the entire system. See <https://wiki.debian.org/Teams/Dpkg/FAQ#db-lock>.', 2);
    if (S.dpkgBroken) { S.dpkgBroken = false; c.out('Setting up unattended-upgrades (2.9.1+nmu4ubuntu1) ...\nProcessing triggers for man-db (2.12.0-4build2) ...\n'); } return 0;
  }
  if (fl === '-i') { c.out('dpkg: cài .deb cục bộ không có trong bài tập này; dùng apt install\n'); return 1; }
  throw new CmdErr('Mô phỏng dpkg: -l [mẫu], -s gói, -L gói, --get-selections, --configure -a', 2);
};
cmds['add-apt-repository'] = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: add-apt-repository: command not found', 127);
  var S = S2(sh);
  if (!S.pkgs['software-properties-common']) { c.err("Command 'add-apt-repository' not found, but can be installed with:\nsudo apt install software-properties-common\n"); return 127; }
  if (!sh.isRoot(c)) throw new CmdErr('add-apt-repository: Permission denied: cần chạy bằng sudo', 1);
  var spec = a.filter(function (x) { return x.charAt(0) !== '-'; })[0] || '', known = { 'ppa:git-core/ppa': 'git-core-ubuntu-ppa-noble.list', 'ppa:deadsnakes/ppa': 'deadsnakes-ubuntu-ppa-noble.list', 'ppa:ondrej/nginx': 'ondrej-ubuntu-nginx-noble.list' };
  if (!known[spec]) { c.err("Cannot add PPA: '" + spec + "'.\nPlease check that the PPA name or format is correct.\n"); return 1; }
  var u = spec.slice(4);
  sh.fs.put('/etc/apt/sources.list.d/' + known[spec], 'deb https://ppa.launchpadcontent.net/' + u.replace('/ppa', '/ppa') + '/ubuntu noble main\n', { owner: 'root', mode: 420 });
  c.out('Repository: \'Types: deb\nURIs: https://ppa.launchpadcontent.net/' + u + '/ubuntu/\nSuites: noble\nComponents: main\n\'\nDescription:\nPPA ' + spec + '\nAdding repository.\n' + (a.indexOf('-y') >= 0 ? '' : 'Press [ENTER] to continue or Ctrl-c to cancel adding it. (mô phỏng: tự nhấn Enter)\n') + 'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nReading package lists... Done\n');
  refreshCache(sh); return 0;
};
/* node -v theo gói đã cài */
var prevNode = cmds.node;
cmds.node = function (a, c) {
  var sh = c.sh; if (on(sh) && (a[0] === '-v' || a[0] === '--version')) {
    var p = S2(sh).pkgs.nodejs; if (!p) { c.err("Command 'node' not found, but can be installed with:\nsudo apt install nodejs\n"); return 127; }
    c.out('v' + p.ver.split(/[-+]/)[0] + '\n'); return 0;
  }
  if (prevNode) return prevNode(a, c); throw new CmdErr('bash: node: command not found', 127);
};
/* lệnh chỉ có khi gói đã cài */
Object.keys(CMDPKG).forEach(function (cn) {
  var prev = cmds[cn], pk = CMDPKG[cn];
  cmds[cn] = function (a, c) {
    var sh = c.sh;
    if (on(sh) && !S2(sh).pkgs[pk]) { c.err("Command '" + cn + "' not found, but can be installed with:\nsudo apt install " + pk + '\n'); return 127; }
    if (on(sh) && L2.impl && L2.impl[cn]) return L2.impl[cn](a, c);
    if (!prev) {
      if (cn === 'ncdu') { c.out('ncdu cần giao diện tương tác (ncurses) nên không chạy được trong khung này.\nDùng thay thế: sudo du -h --max-depth=1 / 2>/dev/null | sort -h\n'); return 0; }
      if (cn === 'tree') { return treeCmd(a, c); }
      throw new CmdErr('bash: ' + cn + ': command not found', 127);
    }
    return prev(a, c);
  };
});
function treeCmd(a, c) {
  var sh = c.sh, f = { a: false, d: false, f: false, L: 0, I: null, noreport: false }, paths = [], i, x;
  for (i = 0; i < a.length; i++) {
    x = a[i];
    if (x === '-L') { f.L = parseInt(a[++i], 10) || 0; continue; }
    if (x === '-I') { f.I = a[++i]; continue; }
    if (x === '--noreport') { f.noreport = true; continue; }
    if (x.charAt(0) === '-' && x.length > 1) { x.slice(1).split('').forEach(function (ch) { if (ch === 'a') f.a = true; else if (ch === 'd') f.d = true; else if (ch === 'f') f.f = true; }); continue; }
    paths.push(x);
  }
  if (!paths.length) paths.push('.');
  var ignRe = null;
  if (f.I) ignRe = new RegExp('^(' + f.I.split('|').map(function (g) { return g.replace(/[.+^${}()\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'); }).join('|') + ')$');
  var nd = 0, nf = 0, out = '';
  paths.forEach(function (arg) {
    var root = sh.abs(arg);
    if (!sh.fs.get(root, true)) { out += arg + ' [error opening dir]\n'; return; }
    out += arg + '\n';
    (function walk(d, pre, depth) {
      var ks = sh.fs.list(d).filter(function (k) { return (f.a || k.charAt(0) !== '.') && !(ignRe && ignRe.test(k)); }).sort(function (p, q) { var a1 = p.replace(/^\./, '').toLowerCase(), b1 = q.replace(/^\./, '').toLowerCase(); return a1 < b1 ? -1 : a1 > b1 ? 1 : 0; });
      if (f.d) ks = ks.filter(function (k) { var n0 = sh.fs.get((d === '/' ? '' : d) + '/' + k); return n0 && n0.t === 'd'; });
      ks.forEach(function (k, idx) {
        var last = idx === ks.length - 1, p = (d === '/' ? '' : d) + '/' + k, n = sh.fs.get(p, true), isD = n && n.t === 'd', label = f.f ? (arg === '.' ? '.' : arg).replace(/\/$/, '') + p.slice(root.length) : k;
        if (n && n.t === 'l') label += ' -> ' + n.target;
        out += pre + (last ? '└── ' : '├── ') + label + '\n';
        if (isD) { nd++; if (!f.L || depth < f.L) walk(p, pre + (last ? '    ' : '│   '), depth + 1); } else nf++;
      });
    })(root, '', 1);
  });
  c.out(out + (f.noreport ? '' : '\n' + nd + ' director' + (nd === 1 ? 'y' : 'ies') + (f.d ? '' : ', ' + nf + ' file' + (nf === 1 ? '' : 's')) + '\n')); return 0;
}

/* ============ đĩa, inode, mount, swap, sysctl ============ */
function mountOf(sh, p) {
  var ms = S2(sh).mounts.slice().sort(function (x, y) { return y.mp.length - x.mp.length; });
  for (var i = 0; i < ms.length; i++) { var m = ms[i]; if (m.mp === '/' || p === m.mp || p.indexOf(m.mp + '/') === 0) return m; }
  return S2(sh).mounts[0];
}
function usedOn(sh, m) {
  var s = m.baseUsed || 0, pre, k;
  for (k in sh.fs.n) {
    var n = sh.fs.n[k]; if (n.t !== 'f') continue;
    if (k.indexOf('/__r/') === 0) continue;
    if (mountOf(sh, k) !== m) continue;
    s += n.size != null ? n.size : (n.c || '').length;
  }
  return s;
}
function inodesUsed(sh) {
  var S = S2(sh), n = 0, k; for (k in sh.fs.n) { if (k.indexOf('/__r/') !== 0) { n++; if (sh.fs.n[k].virt) n += sh.fs.n[k].virt; } }
  return S.inodeBase + n;
}
var INODE_TOTAL = 2621440;
function fullDisk(sh, path) {
  var m = mountOf(sh, path);
  if (m.size && usedOn(sh, m) >= m.size) return 'disk';
  if (m === S2(sh).mounts[0] && inodesUsed(sh) >= INODE_TOTAL) return 'inode';
  return null;
}
var prevWrite = SP.writeFile;
SP.writeFile = function (p, content, c, who, append) {
  if (on(this) && !this.fs.get(p) && fullDisk(this, p)) throw new CmdErr(who + ': ' + this.shortPath(p) + ': No space left on device');
  if (on(this) && this.fs.get(p) && fullDisk(this, p) === 'disk' && String(content || '').length > 0) throw new CmdErr(who + ': write error: No space left on device');
  return prevWrite.call(this, p, content, c, who, append);
};
var prevTouch = cmds.touch, prevMkdir = cmds.mkdir;
cmds.touch = function (a, c) {
  var sh = c.sh;
  if (on(sh)) { var fs = a.filter(function (x) { return x.charAt(0) !== '-'; }); for (var i = 0; i < fs.length; i++) { var ap = sh.abs(fs[i]); if (!sh.fs.get(ap) && fullDisk(sh, ap)) { c.err("touch: cannot touch '" + fs[i] + "': No space left on device\n"); return 1; } } }
  return prevTouch(a, c);
};
cmds.mkdir = function (a, c) {
  var sh = c.sh;
  if (on(sh)) { var fs = a.filter(function (x) { return x.charAt(0) !== '-'; }); for (var i = 0; i < fs.length; i++) { var ap = sh.abs(fs[i]); if (!sh.fs.get(ap) && fullDisk(sh, ap)) { c.err("mkdir: cannot create directory '" + fs[i] + "': No space left on device\n"); return 1; } } }
  return prevMkdir(a, c);
};
var prevDf = cmds.df;
cmds.df = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevDf(a, c);
  var S = S2(sh), fl = a.filter(function (x) { return x.charAt(0) === '-'; }).join(''), paths = a.filter(function (x) { return x.charAt(0) !== '-'; }), h = /h/.test(fl), T = /T/.test(fl), inode = /i/.test(fl);
  var ms = S.mounts.slice();
  if (paths.length) { ms = paths.map(function (p) { var ap = sh.abs(p); if (!sh.fs.get(ap)) { c.err('df: ' + p + ': No such file or directory\n'); return null; } return mountOf(sh, ap); }).filter(Boolean); }
  var rows = [];
  ms.forEach(function (m) {
    if (inode) {
      var tot = m.mp === '/' ? INODE_TOTAL : (m.inodes || 0), used = m.mp === '/' ? inodesUsed(sh) : (m.inodeUsed || 0);
      var free = Math.max(0, tot - used), pc = tot ? Math.min(100, Math.round(used / tot * 100)) : 0;
      rows.push([m.dev, h ? hum(tot).replace(/B$/, '') : String(tot), h ? hum(used).replace(/B$/, '') : String(used), h ? hum(free).replace(/B$/, '') : String(free), tot ? pc + '%' : '-', m.mp]);
    } else {
      var u = m.fs === 'tmpfs' ? (m.tmpUsed || 0) : usedOn(sh, m), t = m.size, av = Math.max(0, t - u), pc2 = Math.min(100, Math.ceil(u / t * 100));
      rows.push([m.dev, h ? hum(t) : String(Math.round(t / 1024)), h ? hum(u) : String(Math.round(u / 1024)), h ? hum(av) : String(Math.round(av / 1024)), pc2 + '%', m.mp, m.fs]);
    }
  });
  var head = inode ? ['Filesystem', 'Inodes', 'IUsed', 'IFree', 'IUse%', 'Mounted on'] : ['Filesystem', h ? 'Size' : '1K-blocks', 'Used', 'Avail', 'Use%', 'Mounted on'];
  if (T && !inode) head.splice(1, 0, 'Type');
  var tbl = [head].concat(rows.map(function (r) { var o = r.slice(0, 6); if (T && !inode) o.splice(1, 0, r[6]); return o; }));
  var w = []; tbl[0].forEach(function (_, i) { w[i] = 0; tbl.forEach(function (r) { w[i] = Math.max(w[i], String(r[i]).length); }); });
  c.out(tbl.map(function (r) { return r.map(function (x, i) { return i === 0 || (T && !inode && i === 1) || i === r.length - 1 ? pad(x, w[i]) : pad(x, w[i], true); }).join(' ').replace(/ +$/, ''); }).join('\n') + '\n'); return 0;
};
var prevDu = cmds.du;
cmds.du = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevDu(a, c);
  var S = S2(sh), h = false, s = false, depth = null, all = false, tot = false, inodes = false, paths = [], i, bs = false;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (/^--max-depth=/.test(x)) depth = parseInt(x.slice(12), 10); else if (x === '-d') depth = parseInt(a[++i], 10); else if (/^-d\d+$/.test(x)) depth = +x.slice(2);
    else if (x === '--inodes') inodes = true; else if (x === '--apparent-size' || x === '-x') {} else if (x === '-B' || x === '-t') i++;
    else if (/^-[a-zA-Z]+$/.test(x)) { if (/h/.test(x)) h = true; if (/s/.test(x)) s = true; if (/a/.test(x)) all = true; if (/c/.test(x)) tot = true; if (/k/.test(x)) {} if (/b/.test(x)) bs = true; }
    else if (x === '--human-readable') h = true; else if (x === '--summarize') s = true; else if (x === '--total') tot = true; else if (x.charAt(0) !== '-') paths.push(x);
  }
  if (!paths.length) paths = ['.'];
  if (s) depth = 0;
  var rc = 0, totalB = 0;
  function sizeOf(p) {
    var n = sh.fs.get(p, true); if (!n) return 0;
    if (inodes) { var cnt = 1; if (n.virt) cnt += n.virt; if (n.t === 'd') sh.fs.list(p).forEach(function (k) { cnt += sizeOf(p === '/' ? '/' + k : p + '/' + k); }); return cnt; }
    if (n.t === 'f') { var z = n.size != null ? n.size : (n.c || '').length; return Math.max(4096, Math.ceil(z / 4096) * 4096); }
    var t = 4096; sh.fs.list(p).forEach(function (k) { t += sizeOf(p === '/' ? '/' + k : p + '/' + k); }); return t;
  }
  function fmt(b) { return inodes ? String(b) : bs ? String(b) : h ? hum(b) : String(Math.ceil(b / 1024)); }
  function walk(p, shown, d) {
    var n = sh.fs.get(p, true), sz = sizeOf(p);
    if (n.t === 'd') {
      if (!sh.canRead(p, c)) { c.err("du: cannot read directory '" + shown + "': Permission denied\n"); rc = 1; c.out(fmt(4096) + '\t' + shown + '\n'); return; }
      if (depth == null || d < depth) sh.fs.list(p).sort().forEach(function (k) { var cp = p === '/' ? '/' + k : p + '/' + k, cn = sh.fs.get(cp, true); if (cn && (cn.t === 'd' || all)) walk(cp, (shown === '/' ? '' : shown) + '/' + k, d + 1); });
    }
    c.out(fmt(sz) + '\t' + shown + '\n');
  }
  paths.forEach(function (p) {
    var ap = sh.abs(p), n = sh.fs.get(ap, true);
    if (!n) { c.err("du: cannot access '" + p + "': No such file or directory\n"); rc = 1; return; }
    totalB += sizeOf(ap); walk(ap, p, 0);
  });
  if (tot) c.out(fmt(totalB) + '\ttotal\n');
  return rc;
};
var prevLs = cmds.ls;
cmds.ls = function (a, c) {
  var sh = c.sh;
  if (on(sh)) {
    var pos = a.filter(function (x) { return x.charAt(0) !== '-'; }), tgt = sh.abs(pos[0] || '.'), n = sh.fs.get(tgt, true);
    if (n && n.t === 'd' && n.virt && !a.some(function (x) { return /d/.test(x) && /^-[a-zA-Z]*d/.test(x); })) {
      var names = []; for (var i = 0; i < 20; i++) names.push('sess_' + (1000003 * (i + 7)).toString(36)); sh.fs.list(tgt).forEach(function (k) { names.push(k); });
      c.out(names.join('\n') + '\n'); return 0;
    }
  }
  return prevLs(a, c);
};
function clearVirt(sh, dir) { var n = sh.fs.get(dir, true); if (n && n.virt) { n.virt = 0; return true; } return false; }
var prevFind = cmds.find;
cmds.find = function (a, c) {
  var sh = c.sh;
  if (on(sh)) {
    var root = a.filter(function (x) { return x.charAt(0) !== '-' && x !== '!' && x !== '(' && x !== ')'; })[0];
    var n = root && sh.fs.get(sh.abs(root), true);
    if (n && n.virt) {
      if (a.indexOf('-delete') >= 0) { if (!sh.isRoot(c) && n.owner !== sh.user) { c.err("find: cannot delete '" + root + "/sess_x': Permission denied\n"); return 1; } n.virt = 0; return 0; }
      if (a.indexOf('-type') >= 0 && a.indexOf('f') >= 0 && !a.some(function (x) { return /^-(mtime|name|exec|size)/.test(x); }) && a.indexOf('-print') < 0) { var o = ''; for (var i = 0; i < 12; i++) o += root + '/sess_' + (1000003 * (i + 7)).toString(36) + '\n'; c.out(o); return 0; }
    }
  }
  return prevFind(a, c);
};
var prevRm = cmds.rm;
cmds.rm = function (a, c) {
  var sh = c.sh;
  if (on(sh)) {
    var keep = [], hit = false;
    a.forEach(function (x) { if (x.charAt(0) === '-') { keep.push(x); return; } var m = /^(.*)\/\*$/.exec(x), d = m ? sh.abs(m[1]) : sh.abs(x); var dn = sh.fs.get(d, true); if (dn && dn.virt && (m || /r/.test(a.join('')))) { if (!sh.isRoot(c) && dn.owner !== sh.user) { c.err("rm: cannot remove '" + x + "': Permission denied\n"); return; } dn.virt = 0; hit = true; if (!m) keep.push(x); return; } keep.push(x); });
    if (hit && !keep.filter(function (x) { return x.charAt(0) !== '-'; }).length) return 0;
    if (hit) a = keep;
  }
  return prevRm(a, c);
};
cmds.lsblk = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: lsblk: command not found', 127);
  var S = S2(sh), vdb = S.disks.vdb, mp = function (d) { var m = S.mounts.filter(function (x) { return x.dev === '/dev/' + d; })[0]; return m ? m.mp : ''; };
  var out = 'NAME    MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS\nvda     252:0    0   40G  0 disk \n├─vda1  252:1    0 39.9G  0 part ' + mp('vda1') + '\n├─vda14 252:14   0    4M  0 part \n└─vda15 252:15   0  106M  0 part ' + mp('vda15') + '\n';
  if (vdb) out += 'vdb     252:16   0  100G  0 disk \n└─vdb1  252:17   0  100G  0 part ' + mp('vdb1') + '\n';
  if (S.swapOnList && S.swapOnList.length) { }
  c.out(out); return 0;
};
cmds.blkid = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: blkid: command not found', 127);
  if (!sh.isRoot(c)) return 2;
  var S = S2(sh);
  c.out('/dev/vda1: UUID="3b1c9f0e-6a2d-4c11-9e55-1f4d7a8b2c10" BLOCK_SIZE="4096" TYPE="ext4" PARTUUID="a1b2c3d4-01"\n/dev/vda15: UUID="C1A2-3B4D" BLOCK_SIZE="512" TYPE="vfat" PARTUUID="a1b2c3d4-0f"\n' + (S.disks.vdb ? '/dev/vdb1: UUID="8f2e41d7-0c5b-4a9e-b7d3-5e6f1a2b3c4d" BLOCK_SIZE="4096" TYPE="ext4" PARTUUID="e5f6a7b8-01"\n' : '')); return 0;
};
var UUIDS = { '3b1c9f0e-6a2d-4c11-9e55-1f4d7a8b2c10': '/dev/vda1', 'C1A2-3B4D': '/dev/vda15', '8f2e41d7-0c5b-4a9e-b7d3-5e6f1a2b3c4d': '/dev/vdb1' };
function devOf(sh, spec) {
  var m = /^UUID=(.+)$/.exec(spec); if (m) return UUIDS[m[1]] || null;
  if (/^\/dev\//.test(spec)) return /^\/dev\/(vda1|vda15|vdb1)$/.test(spec) && (spec !== '/dev/vdb1' || S2(sh).disks.vdb) ? spec : null;
  return null;
}
function doMount(sh, c, spec, mp, type) {
  var S = S2(sh), dev = devOf(sh, spec);
  if (!dev) return (spec.indexOf('UUID=') === 0 ? "mount: " + mp + ": can't find " + spec + '.' : 'mount: ' + mp + ': special device ' + spec + ' does not exist.');
  if (!sh.fs.isD(mp)) return 'mount: ' + mp + ': mount point does not exist.';
  var ex = S.mounts.filter(function (m) { return m.mp === mp; })[0];
  if (ex) return 'mount: ' + mp + ': ' + dev + ' already mounted on ' + mp + '.';
  var disk = { '/dev/vdb1': { size: 100 * 1073741824, fs: 'ext4', baseUsed: 2.1 * 1073741824, inodes: 6553600, inodeUsed: 12 }, '/dev/vda15': { size: 106 * 1048576, fs: 'vfat', baseUsed: 6.1 * 1048576 } }[dev] || { size: 1073741824, fs: 'ext4', baseUsed: 0 };
  S.mounts.push({ dev: dev, mp: mp, fs: disk.fs, size: disk.size, baseUsed: disk.baseUsed, inodes: disk.inodes, inodeUsed: disk.inodeUsed });
  return null;
}
cmds.mount = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: mount: command not found', 127);
  var S = S2(sh), pos = a.filter(function (x) { return x.charAt(0) !== '-'; });
  if (a.indexOf('-a') >= 0) {
    if (!sh.isRoot(c)) throw new CmdErr('mount: only root can do that', 32);
    var rc = 0;
    lines(fileText(sh, '/etc/fstab')).forEach(function (l) {
      var t = l.trim(); if (!t || t.charAt(0) === '#') return;
      var f = t.split(/\s+/); if (f.length < 4) { c.err('mount: /etc/fstab: parse error at line (cột thiếu)\n'); rc = 1; return; }
      if (f[2] === 'swap' || f[1] === 'none' || f[1] === '/' ) return;
      if (S.mounts.some(function (m) { return m.mp === f[1]; })) return;
      var e = doMount(sh, c, f[0], f[1], f[2]);
      if (e) { if (!/nofail/.test(f[3])) { c.err(e + '\n'); rc = 32; } }
    });
    S.fstabChecked = rc === 0; return rc;
  }
  if (!pos.length) {
    c.out(S.mounts.map(function (m) { return (m.fs === 'tmpfs' ? 'tmpfs' : m.dev) + ' on ' + m.mp + ' type ' + m.fs + ' (rw,relatime' + (m.fs === 'ext4' ? ',discard,errors=remount-ro' : '') + ')'; }).join('\n') + '\n'); return 0;
  }
  if (!sh.isRoot(c)) throw new CmdErr('mount: ' + (pos[1] || pos[0]) + ': must be superuser to use mount.', 32);
  if (pos.length === 1) {
    var fl = lines(fileText(sh, '/etc/fstab')).map(function (l) { return l.trim().split(/\s+/); }).filter(function (f) { return f[1] === pos[0] || f[0] === pos[0]; })[0];
    if (!fl) throw new CmdErr('mount: ' + pos[0] + ': can\'t find in /etc/fstab.', 32);
    var e1 = doMount(sh, c, fl[0], fl[1], fl[2]); if (e1) throw new CmdErr(e1, 32); return 0;
  }
  var e2 = doMount(sh, c, pos[0], sh.abs(pos[1]), null); if (e2) throw new CmdErr(e2, 32); return 0;
};
cmds.umount = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: umount: command not found', 127);
  var S = S2(sh), t = a.filter(function (x) { return x.charAt(0) !== '-'; })[0]; if (!t) throw new CmdErr('umount: bạn cần chỉ định điểm mount', 1);
  if (!sh.isRoot(c)) throw new CmdErr('umount: ' + t + ': must be superuser to unmount.', 1);
  var ap = sh.abs(t), m = S.mounts.filter(function (x) { return x.mp === ap || x.dev === t; })[0];
  if (!m || m.mp === '/') throw new CmdErr('umount: ' + t + ': not mounted.', 1);
  if (sh.cwd === m.mp || sh.cwd.indexOf(m.mp + '/') === 0) throw new CmdErr('umount: ' + m.mp + ': target is busy.', 32);
  S.mounts = S.mounts.filter(function (x) { return x !== m; }); return 0;
};
cmds.findmnt = function (a, c) { var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: findmnt: command not found', 127); c.out('TARGET       SOURCE     FSTYPE OPTIONS\n' + S2(sh).mounts.map(function (m) { return pad(m.mp, 12) + ' ' + pad(m.dev, 10) + ' ' + pad(m.fs, 6) + ' rw,relatime'; }).join('\n') + '\n'); return 0; };
cmds.fallocate = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: fallocate: command not found', 127);
  var li = a.indexOf('-l'), sz = li >= 0 ? parseSize(a[li + 1]) : null, f = a.filter(function (x, i) { return x.charAt(0) !== '-' && a[i - 1] !== '-l'; })[0];
  if (sz == null || !f) throw new CmdErr('Usage: fallocate -l SIZE FILE', 1);
  var ap = sh.abs(f);
  if (!sh.canWrite(ap, c)) throw new CmdErr('fallocate: cannot open ' + f + ': Permission denied', 1);
  var m = mountOf(sh, ap); if (m.size && usedOn(sh, m) + sz > m.size) throw new CmdErr('fallocate: fallocate failed: No space left on device', 1);
  sh.fs.put(ap, '', { owner: sh.isRoot(c) ? 'root' : sh.user, mode: 420, size: sz }); return 0;
};
cmds.dd = (function (prev) {
  return function (a, c) {
    var sh = c.sh; if (!on(sh) && prev) return prev(a, c);
    var kv = {}; a.forEach(function (x) { var m = /^(\w+)=(.*)$/.exec(x); if (m) kv[m[1]] = m[2]; });
    if (!kv.of) throw new CmdErr('dd: cần of=FILE trong bản mô phỏng', 1);
    var bs = parseSize(kv.bs || '512'), cnt = parseInt(kv.count || '1', 10), sz = bs * cnt, ap = sh.abs(kv.of);
    if (!sh.canWrite(ap, c)) throw new CmdErr('dd: failed to open \'' + kv.of + '\': Permission denied', 1);
    var m = mountOf(sh, ap); if (m.size && usedOn(sh, m) + sz > m.size) throw new CmdErr('dd: error writing \'' + kv.of + '\': No space left on device', 1);
    sh.fs.put(ap, '', { owner: sh.isRoot(c) ? 'root' : sh.user, mode: 420, size: sz });
    c.err(cnt + '+0 records in\n' + cnt + '+0 records out\n' + sz + ' bytes (' + (sz / 1e9 >= 1 ? (sz / 1e9).toFixed(1) + ' GB' : (sz / 1e6).toFixed(0) + ' MB') + ', ' + hum(sz).replace('B', '') + 'iB) copied, 2.1 s, ' + Math.round(sz / 2.1 / 1e6) + ' MB/s\n'); return 0;
  };
})(cmds.dd);
function swapPerm(n) { return '0' + (n.mode & 511).toString(8); }
cmds.mkswap = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: mkswap: command not found', 127);
  var f = a.filter(function (x) { return x.charAt(0) !== '-'; })[0]; if (!f) throw new CmdErr('Usage: mkswap [options] device', 1);
  var ap = sh.abs(f), n = sh.fs.get(ap);
  if (!n) throw new CmdErr('mkswap: cannot open ' + f + ': No such file or directory', 1);
  if (!sh.isRoot(c)) throw new CmdErr('mkswap: cannot open ' + f + ': Permission denied', 1);
  var mb = Math.floor((n.size != null ? n.size : (n.c || '').length) / 1048576);
  if (mb < 1) throw new CmdErr('mkswap: error: swap area needs to be at least 40 KiB', 1);
  if ((n.mode & 63) !== 0) c.err('mkswap: ' + f + ': insecure permissions ' + swapPerm(n) + ', fix with: chmod 0600 ' + f + '\n');
  n.swap = { mb: mb, uuid: '5c7e1a90-2b34-4d8f-a6c1-' + String(1000000 + mb).slice(-6) + 'ab12' };
  c.out('Setting up swapspace version 1, size = ' + (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GiB' : mb + ' MiB') + ' (' + (mb * 1048576 - 4096) + ' bytes)\nno label, UUID=' + n.swap.uuid + '\n'); return 0;
};
function swapsList(sh) { return sh.W.lin ? sh.W.lin.swaps : (S2(sh).swapsFallback = S2(sh).swapsFallback || []); }
function activateSwap(sh, c, f) {
  var ap = sh.abs(f), n = sh.fs.get(ap);
  if (!n) return 'swapon: cannot stat ' + f + ': No such file or directory';
  if (!sh.isRoot(c)) return 'swapon: ' + f + ': swapon failed: Operation not permitted';
  if (!n.swap) return 'swapon: ' + f + ': read swap header failed';
  var ls = swapsList(sh); if (ls.some(function (s) { return s.path === ap; })) return 'swapon: ' + f + ': swapon failed: Device or resource busy';
  var warn = (n.mode & 63) !== 0 ? 'swapon: ' + f + ': insecure permissions ' + swapPerm(n) + ', 0600 suggested.' : null;
  ls.push({ path: ap, mb: n.swap.mb, used: 0 }); return warn ? { warn: warn } : null;
}
cmds.swapon = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: swapon: command not found', 127);
  var S = S2(sh), pos = a.filter(function (x) { return x.charAt(0) !== '-'; });
  if (a.indexOf('--show') >= 0 || (!pos.length && a.indexOf('-a') < 0)) {
    var ls = swapsList(sh); if (!ls.length) return 0;
    c.out('NAME      TYPE SIZE USED PRIO\n' + ls.map(function (s) { return pad(s.path, 9) + ' file ' + pad(s.mb >= 1024 ? (s.mb / 1024) + 'G' : s.mb + 'M', 4, true) + ' ' + pad(s.used ? s.used + 'M' : '0B', 4, true) + '   -2'; }).join('\n') + '\n'); return 0;
  }
  if (a.indexOf('-a') >= 0) {
    lines(fileText(sh, '/etc/fstab')).forEach(function (l) { var f = l.trim().split(/\s+/); if (f[0] && f[0].charAt(0) !== '#' && f[2] === 'swap') { var r = activateSwap(sh, c, f[0]); if (typeof r === 'string') c.err(r + '\n'); } });
    return 0;
  }
  var r = activateSwap(sh, c, pos[0]);
  if (typeof r === 'string') { c.err(r + '\n'); return 255; }
  if (r && r.warn) c.err(r.warn + '\n'); return 0;
};
cmds.swapoff = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: swapoff: command not found', 127);
  if (!sh.isRoot(c)) throw new CmdErr('swapoff: ' + a[a.length - 1] + ': swapoff failed: Operation not permitted', 255);
  var l = sh.W.lin, ap = a.indexOf('-a') >= 0 ? null : sh.abs(a[a.length - 1]);
  if (ap && !l.swaps.some(function (s) { return s.path === ap; })) throw new CmdErr('swapoff: ' + a[a.length - 1] + ': swapoff failed: Invalid argument', 255);
  l.swaps = ap ? l.swaps.filter(function (s) { return s.path !== ap; }) : []; return 0;
};
/* sysctl */
var KEYS = { 'vm.swappiness': '60', 'vm.vfs_cache_pressure': '100', 'vm.overcommit_memory': '0', 'net.ipv4.ip_forward': '0', 'net.core.somaxconn': '4096', 'fs.file-max': '9223372036854775807', 'kernel.pid_max': '4194304' };
function kernelVals(sh) { var S = S2(sh); S.kern = S.kern || Object.assign({}, KEYS); return S.kern; }
function putProc(sh, k, v) { sh.fs.put('/proc/sys/' + k.replace(/\./g, '/'), v + '\n', { owner: 'root', mode: 420 }); }
function loadSysctlFiles(sh) {
  var kv = kernelVals(sh), files = ['/etc/sysctl.conf'];
  sh.fs.list('/etc/sysctl.d').sort().forEach(function (n) { if (/\.conf$/.test(n)) files.push('/etc/sysctl.d/' + n); });
  var out = [];
  files.forEach(function (f) { lines(fileText(sh, f)).forEach(function (l) { var m = /^\s*([\w.\-]+)\s*=\s*(.*?)\s*$/.exec(l); if (m && l.trim().charAt(0) !== '#') { out.push([m[1], m[2], f]); } }); });
  return out;
}
cmds.sysctl = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: sysctl: command not found', 127);
  var kv = kernelVals(sh), flags = a.filter(function (x) { return x.charAt(0) === '-'; }), pos = a.filter(function (x) { return x.charAt(0) !== '-'; });
  if (flags.indexOf('-a') >= 0 || flags.indexOf('--all') >= 0) { c.out(Object.keys(kv).sort().map(function (k) { return k + ' = ' + kv[k]; }).join('\n') + '\n'); return 0; }
  if (flags.indexOf('-p') >= 0 || flags.indexOf('--system') >= 0) {
    if (!sh.isRoot(c)) throw new CmdErr("sysctl: permission denied on key 'vm.swappiness'", 255);
    var src = flags.indexOf('-p') >= 0 && pos[0] ? [[pos[0]]] : null, ents = loadSysctlFiles(sh), rc = 0;
    ents.forEach(function (e) { if (src && sh.abs(src[0][0]) !== e[2]) return; if (kv[e[0]] == null) { c.err("sysctl: cannot stat /proc/sys/" + e[0].replace(/\./g, '/') + ': No such file or directory\n'); rc = 255; return; } kv[e[0]] = e[1]; putProc(sh, e[0], e[1]); c.out((flags.indexOf('--system') >= 0 ? '* Applying ' + e[2] + ' ...\n' : '') + e[0] + ' = ' + e[1] + '\n'); });
    return rc;
  }
  var write = flags.indexOf('-w') >= 0 || pos.some(function (x) { return x.indexOf('=') >= 0; }), rc2 = 0;
  pos.forEach(function (x) {
    var m = /^([\w.\-]+)=(.*)$/.exec(x), k = m ? m[1] : x;
    if (kv[k] == null) { c.err('sysctl: cannot stat /proc/sys/' + k.replace(/\./g, '/') + ': No such file or directory\n'); rc2 = 255; return; }
    if (m) {
      if (!sh.isRoot(c)) { c.err("sysctl: permission denied on key '" + k + "', ignoring\n".replace(', ignoring', '')); rc2 = 255; return; }
      if (k === 'vm.swappiness' && (!/^\d+$/.test(m[2]) || +m[2] > 200)) { c.err('sysctl: setting key "vm.swappiness": Invalid argument\n'); rc2 = 255; return; }
      kv[k] = m[2]; putProc(sh, k, m[2]); c.out(k + ' = ' + m[2] + '\n');
    } else c.out(k + ' = ' + kv[k] + '\n');
  });
  if (!pos.length) throw new CmdErr('usage: sysctl [options] [variable[=value] ...]', 255);
  return rc2;
};
cmds.dmesg = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: dmesg: command not found', 127);
  if (!sh.isRoot(c)) throw new CmdErr('dmesg: read kernel buffer failed: Operation not permitted', 1);
  var S = S2(sh), T = a.some(function (x) { return /T/.test(x) && x.charAt(0) === '-'; }), out = '', t = 3.1;
  function ts() { t += 1.7; return T ? '[Tue Oct 27 ' + '09:' + String(10 + Math.floor(t / 60)).slice(-2) + ':' + String(Math.floor(t) % 60).padStart(2, '0') + ' 2026] ' : '[' + pad(t.toFixed(6), 12, true) + '] '; }
  out += ts() + 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-051) (x86_64-linux-gnu-gcc-13)\n' + ts() + 'EXT4-fs (vda1): mounted filesystem with ordered data mode.\n';
  (S.oom || []).forEach(function (o) {
    out += ts() + o.name + ' invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0\n' + ts() + 'Out of memory: Killed process ' + o.pid + ' (' + o.name + ') total-vm:' + o.vm + 'kB, anon-rss:' + o.rss + 'kB, file-rss:0kB, shmem-rss:0kB, UID:' + o.uid + ' pgtables:' + Math.round(o.rss / 400) + 'kB oom_score_adj:0\n';
  });
  c.out(out); return 0;
};
cmds.nproc = function (a, c) { c.out('2\n'); return 0; };
cmds.hostnamectl = function (a, c) { c.out(' Static hostname: ' + c.sh.hostName + '\n       Icon name: computer-vm\n         Chassis: vm\n Operating System: Ubuntu 24.04.1 LTS\n          Kernel: Linux 6.8.0-45-generic\n    Architecture: x86-64\n'); return 0; };
cmds.timedatectl = function (a, c) {
  var sh = c.sh, now = nowMs(sh), d = new Date(now + 7 * 3600000), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  c.out('               Local time: ' + DAYS[d.getUTCDay()] + ' ' + d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' +07\n           Universal time: ' + new Date(now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC\n                Time zone: Asia/Ho_Chi_Minh (+07, +0700)\nSystem clock synchronized: yes\n              NTP service: active\n'); return 0;
};
cmds.readlink = function (a, c) { var sh = c.sh, f = a.filter(function (x) { return x.charAt(0) !== '-'; })[0], n = f && sh.fs.get(sh.abs(f), true); if (a.indexOf('-f') >= 0) { c.out(sh.fs.real(sh.abs(f || '.')) + '\n'); return 0; } if (!n || n.t !== 'l') return 1; c.out(n.target + '\n'); return 0; };
cmds.realpath = function (a, c) { var sh = c.sh; a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (f) { c.out(sh.fs.real(sh.abs(f)) + '\n'); }); return 0; };
cmds.nl = function (a, c) { var k = 0; String(c.stdin || '').split('\n').forEach(function (l, i, arr) { if (i === arr.length - 1 && l === '') return; c.out(l === '' ? '       \n' : pad(++k, 6, true) + '\t' + l + '\n'); }); return 0; };
cmds.watch = function (a, c) { c.out('watch cần terminal tương tác (màn hình tự làm mới). Dùng vòng lặp: for i in 1 2 3; do df -h /; sleep 2; done\n'); return 1; };
cmds.lscpu = function (a, c) { c.out('Architecture:             x86_64\nCPU(s):                   2\nModel name:               Intel Xeon Processor (Cascadelake)\nThread(s) per core:       1\n'); return 0; };

/* nâng cấp reboot: giữ swap/mount theo fstab, fstab hỏng thì không lên */
var prevReboot = LIN.reboot;
LIN.reboot = function (sh, c) {
  if (!on(sh)) return prevReboot(sh, c);
  var S = S2(sh), bad = null;
  lines(fileText(sh, '/etc/fstab')).forEach(function (l) {
    var t = l.trim(); if (!t || t.charAt(0) === '#' || bad) return; var f = t.split(/\s+/);
    if (f[2] === 'swap') { var n = sh.fs.get(f[0]); if (!n) bad = 'Dependency failed for ' + f[1]; return; }
    if (f[1] === '/' || f[1] === '/boot/efi') return;
    if (!devOf(sh, f[0]) && !/nofail/.test(f[3] || '')) bad = 'Failed to mount ' + f[1] + ' (không tìm thấy ' + f[0] + ')';
  });
  if (bad) {
    S.bootFailed = true;
    c.out('Connection to ' + V.IP + ' closed by remote host.\n(mô phỏng) VPS KHÔNG khởi động được: ' + bad + ' rồi rơi vào emergency mode vì /etc/fstab sai.\nNgoài đời bạn phải vào Console/VNC của nhà cung cấp VPS để sửa. Bài học: sau khi sửa fstab luôn chạy "sudo mount -a" để kiểm tra TRƯỚC khi reboot, và thêm "nofail" cho ổ phụ.\n(Phiên mô phỏng được giữ nguyên, chưa reboot.)\n');
    return;
  }
  var mounts = S.mounts.filter(function (m) { return m.mp === '/' || m.mp === '/boot/efi' || m.fs === 'tmpfs'; });
  prevReboot(sh, c);
  S.mounts = mounts;
  lines(fileText(sh, '/etc/fstab')).forEach(function (l) { var f = l.trim().split(/\s+/); if (f[0] && f[0].charAt(0) !== '#' && f[2] !== 'swap' && f[1] !== '/' && f[1] !== '/boot/efi') doMount(sh, c, f[0], f[1], f[2]); });
  sh.W.lin.swaps = [];
  lines(fileText(sh, '/etc/fstab')).forEach(function (l) { var f = l.trim().split(/\s+/); if (f[0] && f[0].charAt(0) !== '#' && f[2] === 'swap') activateSwap(sh, { sudo: true }, f[0]); });
  var kv = kernelVals(sh); Object.keys(KEYS).forEach(function (k) { kv[k] = KEYS[k]; putProc(sh, k, KEYS[k]); });
  loadSysctlFiles(sh).forEach(function (e) { if (kv[e[0]] != null) { kv[e[0]] = e[1]; putProc(sh, e[0], e[1]); } });
  L2.relogin(sh);
};
/* giữ khoá apt theo thời gian */
var prevAdvance = LIN.advance;
LIN.advance = function (sh, secs, c) {
  var r = prevAdvance(sh, secs, c);
  if (on(sh)) { var S = S2(sh), l = sh.W.lin; if (S.lockUntil && l.now >= S.lockUntil) { l.procs = l.procs.filter(function (p) { return !/unattended-upgr/.test(p.cmd); }); S.lockUntil = 0; } }
  return r;
};
var prevFreeLin = null;

/* ============ dựng thế giới ============ */
L2.base = function (s, o) {
  o = o || {};
  LIN.base(s, o);
  var W = s.W, f = s.fs, l = W.lin;
  var S = W.lin2 = {
    groups: {}, pkgs: {}, rc: {}, held: {}, cache: null, updated: false, dpkgBroken: false, sessG: {}, lockUntil: 0,
    upg: [['openssl', '3.0.13-0ubuntu3.5', '3.0.13-0ubuntu3.4'], ['curl', '8.5.0-2ubuntu10.5', '8.5.0-2ubuntu10.4'], ['nginx', '1.24.0-2ubuntu7.1', '1.24.0-2ubuntu7'], ['openssh-server', '1:9.6p1-3ubuntu13.5', '1:9.6p1-3ubuntu13.4']],
    mounts: [
      { dev: '/dev/vda1', mp: '/', fs: 'ext4', size: 40 * 1073741824 - 1, baseUsed: 11.4 * 1073741824 },
      { dev: '/dev/vda15', mp: '/boot/efi', fs: 'vfat', size: 106 * 1048576, baseUsed: 6.1 * 1048576 },
      { dev: 'tmpfs', mp: '/dev/shm', fs: 'tmpfs', size: 981 * 1048576, baseUsed: 0, tmpUsed: 0 }
    ],
    disks: { vdb: !!o.vdb }, inodeBase: 150000, oom: [], kern: null
  };
  if (o.noRsync) { }
  BASEPKGS.forEach(function (n) { S.pkgs[n] = { ver: REPO[n] ? (n === 'openssl' || n === 'curl' || n === 'nginx' || n === 'openssh-server' ? S.upg.filter(function (u) { return u[0] === n; })[0][2] : REPO[n].ver) : '1.0', manual: true }; });
  f.mkdirp('/etc/apt/sources.list.d', 'root'); f.mkdirp('/etc/apt/keyrings', 'root'); f.mkdirp('/mnt/data', 'root'); f.mkdirp('/proc/sys/vm', 'root'); f.mkdirp('/etc/sysctl.d', 'root');
  f.put('/etc/apt/sources.list.d/ubuntu.sources', 'Types: deb\nURIs: http://archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n', { owner: 'root', mode: 420 });
  f.put('/etc/apt/sources.list', '# Ubuntu sources have moved to /etc/apt/sources.list.d/ubuntu.sources\n', { owner: 'root', mode: 420 });
  f.put('/etc/fstab', '# /etc/fstab: static file system information.\n# <file system> <mount point> <type> <options> <dump> <pass>\nUUID=3b1c9f0e-6a2d-4c11-9e55-1f4d7a8b2c10 /          ext4 discard,errors=remount-ro 0 1\nUUID=C1A2-3B4D                            /boot/efi  vfat umask=0077 0 1\n', { owner: 'root', mode: 420 });
  Object.keys(KEYS).forEach(function (k) { putProc(s, k, KEYS[k]); });
  f.put('/etc/hosts', '127.0.0.1 localhost\n127.0.1.1 vps\n::1 ip6-localhost ip6-loopback\n', { owner: 'root', mode: 420 });
  f.put('/etc/resolv.conf', 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n', { owner: 'root', mode: 420 });
  f.put('/var/log/dpkg.log', '', { owner: 'root', mode: 420 });
  f.put('/usr/bin/tmux', 'ELF', { owner: 'root', mode: 493 }); f.rm('/usr/bin/tmux');
  f.mkdirp(s.home + '/.ssh', s.user, 448); f.put(s.home + '/.ssh/id_ed25519', '-----BEGIN OPENSSH PRIVATE KEY-----\n(mô phỏng)\n-----END OPENSSH PRIVATE KEY-----\n', { owner: s.user, mode: 384 }); f.put(s.home + '/.ssh/id_ed25519.pub', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK7mock haidangphan@laptop\n', { owner: s.user, mode: 420 });
  var us = secS(s).users; if (!us.tutor) us.tutor = { uid: 1001, sudo: false, locked: false, groups: [] };
  syncGroups(s);
  L2.relogin(s); refreshCache(s);
  s.cwd = s.home; s.hist.length = 0;
  if (o.setup2) o.setup2(s, S, l);
};
L2.addGroup = function (s, name, members) { var S = s.W.lin2, gid = 1100; Object.keys(S.groups).forEach(function (k) { gid = Math.max(gid, S.groups[k].gid + 1); }); S.groups[name] = { gid: gid }; (members || []).forEach(function (m) { var u = secS(s).users[m]; if (u && u.groups.indexOf(name) < 0) u.groups.push(name); }); syncGroups(s); };
L2.addUser = function (s, name, groups, sudo) { var S = secS(s); if (!S.users[name]) S.users[name] = { uid: S.nextUid++, sudo: !!sudo, locked: false, groups: groups || [] }; s.fs.mkdirp('/home/' + name, name, 493); var hn = s.fs.get('/home/' + name); if (hn) hn.group = name; syncGroups(s); };
L2.startUpgrader = function (s, secs) { var l = s.W.lin, S = s.W.lin2; LIN.addProc(s, { user: 'root', cmd: '/usr/bin/python3 /usr/bin/unattended-upgrade --download-only', name: 'unattended-upgr', stat: 'Ss', cpu: 3.2, rss: 42000, vsz: 120000, pid: 1843 }); S.lockUntil = l.now + (secs || 120) * 1000; };
L2.REPO = REPO;
L2.sgroups = sgroups;
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
