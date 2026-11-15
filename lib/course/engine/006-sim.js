(function (G) {
'use strict';
var VPS = G.VPS, cmds = VPS.cmds, CmdErr = VPS.CmdErr, SP = VPS.Shell.prototype, pad = VPS.util.pad, lines = VPS.lines;
var sec = VPS.sec.S;
var prev = {};
['ufw', 'sudo', 'visudo', 'find'].forEach(function (k) { prev[k] = cmds[k]; });
function need(c, msg) { if (!c.sh.isRoot(c)) throw new CmdErr(msg); }

/* ---------- ufw insert ---------- */
cmds.ufw = function (a, c) {
  var args = a.filter(function (x) { return x !== '--force'; });
  if (args[0] === 'insert') {
    var u = c.sh.W.ufw, n = +args[1], before = u.rules.length;
    if (!n || n < 1) throw new CmdErr('ERROR: Invalid position \'' + args[1] + '\'');
    var rc = prev.ufw(args.slice(2), c);
    if (rc === 0 && u.rules.length > before) { var r = u.rules.pop(); u.rules.splice(Math.min(n - 1, u.rules.length), 0, r); }
    return rc;
  }
  return prev.ufw(a, c);
};

/* ---------- sudo -l có sudoers.d ---------- */
function sudoRules(sh, who) {
  var out = [], S = sec(sh.W), u = S.users[who];
  if (u && u.sudo) out.push('    (ALL : ALL) ALL');
  var f = sh.fs.get('/etc/sudoers.d/' + who);
  if (f) lines(f.c).forEach(function (l) {
    var t = l.trim(); if (!t || t.charAt(0) === '#') return;
    var m = /^(\S+)\s+\S+=\(([^)]*)\)\s*(NOPASSWD:)?\s*(.+)$/.exec(t);
    if (m && (m[1] === who || m[1] === 'ALL')) out.push('    (' + m[2] + ') ' + (m[3] ? 'NOPASSWD: ' : '') + m[4]);
  });
  return out;
}
cmds.sudo = function (a, c) {
  var sh = c.sh;
  if (a[0] === '-l') {
    var who = a[1] === '-U' ? a[2] : sh.user, S = sec(sh.W);
    if (!S.users[who] && who !== 'root') throw new CmdErr('sudo: unknown user ' + who);
    var rules = sudoRules(sh, who);
    if (!rules.length) { c.out('User ' + who + ' is not allowed to run sudo on vps.\n'); return 0; }
    c.out('Matching Defaults entries for ' + who + ' on vps:\n    env_reset, mail_badpass, secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:/usr/bin\\:/sbin\\:/bin\n\nUser ' + who + ' may run the following commands on vps:\n' + rules.join('\n') + '\n');
    return 0;
  }
  return prev.sudo(a, c);
};
cmds.visudo = function (a, c) {
  if (a.indexOf('-c') < 0) return prev.visudo(a, c);
  need(c, 'visudo: /etc/sudoers: Permission denied');
  var sh = c.sh, out = '/etc/sudoers: parsed OK\n', rc = 0;
  if (sh.fs.isD('/etc/sudoers.d')) sh.fs.list('/etc/sudoers.d').forEach(function (nm) {
    var f = sh.fs.get('/etc/sudoers.d/' + nm); if (!f || f.t !== 'f') return;
    var bad = lines(f.c).filter(function (l) { var t = l.trim(); return t && t.charAt(0) !== '#' && !/^\S+\s+\S+=\([^)]*\)\s*(NOPASSWD:)?\s*\S.*$/.test(t); });
    if (bad.length) { out += '/etc/sudoers.d/' + nm + ':1:1: syntax error\n' + bad[0] + '\n^\n'; rc = 1; return; }
    if ((f.mode & 511) !== 288) { out += '/etc/sudoers.d/' + nm + ': bad permissions, should be mode 0440\n'; rc = 1; return; }
    out += '/etc/sudoers.d/' + nm + ': parsed OK\n';
  });
  if (rc) c.err(out); else c.out(out);
  return rc;
};

/* ---------- chage ---------- */
cmds.chage = function (a, c) {
  var sh = c.sh, S = sec(sh.W), name = a[a.length - 1];
  if (name === sh.user || sh.isRoot(c) || a.indexOf('-l') >= 0 && name === sh.user) { /* ok */ } else throw new CmdErr('chage: Permission denied');
  var u = S.users[name]; if (!u) throw new CmdErr("chage: user '" + name + "' does not exist");
  if (a.indexOf('-l') >= 0) {
    var mx = u.maxdays || 99999;
    c.out('Last password change\t\t\t\t\t: Oct 20, 2026\nPassword expires\t\t\t\t\t: ' + (mx >= 99999 ? 'never' : 'Jan 18, 2027') + '\nPassword inactive\t\t\t\t\t: never\nAccount expires\t\t\t\t\t\t: never\nMinimum number of days between password change\t\t: ' + (u.mindays || 0) + '\nMaximum number of days between password change\t\t: ' + mx + '\nNumber of days of warning before password expires\t: ' + (u.warndays || 7) + '\n');
    return 0;
  }
  need(c, 'chage: Permission denied');
  for (var i = 0; i < a.length - 1; i++) {
    if (a[i] === '-M') u.maxdays = +a[++i]; else if (a[i] === '-m') u.mindays = +a[++i]; else if (a[i] === '-W') u.warndays = +a[++i];
  }
  return 0;
};

/* ---------- find với -perm / -type / -name ---------- */
function globRe(g) { return new RegExp('^' + g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); }
cmds.find = function (a, c) {
  if (a.indexOf('-perm') < 0 && a.indexOf('-user') < 0) return prev.find(a, c);
  var sh = c.sh, starts = [], i = 0, o = {};
  while (i < a.length && a[i].charAt(0) !== '-') starts.push(a[i++]);
  if (!starts.length) starts = ['.'];
  for (; i < a.length; i++) {
    if (a[i] === '-type') o.type = a[++i]; else if (a[i] === '-perm') o.perm = a[++i]; else if (a[i] === '-name') o.name = globRe(a[++i]); else if (a[i] === '-user') o.user = a[++i];
  }
  var pm = o.perm ? /^([-\/]?)([0-7]+)$/.exec(o.perm) : null, pv = pm ? parseInt(pm[2], 8) : 0, res = [];
  starts.forEach(function (st) {
    var base = sh.abs(st), pre = base === '/' ? '/' : base + '/';
    Object.keys(sh.fs.n).sort().forEach(function (p) {
      if (p !== base && p.indexOf(pre) !== 0) return;
      var n = sh.fs.n[p];
      if (o.type === 'f' && n.t !== 'f') return;
      if (o.type === 'd' && n.t !== 'd') return;
      if (o.name && !o.name.test(p.replace(/^.*\//, ''))) return;
      if (o.user && n.owner !== o.user) return;
      if (pm) {
        var md = n.mode & 4095;
        if (pm[1] === '-' && (md & pv) !== pv) return;
        if (pm[1] === '/' && !(md & pv)) return;
        if (pm[1] === '' && md !== pv) return;
      }
      var shown = st.charAt(0) === '/' ? p : (st === '.' ? '.' + p.slice(base.length) : st + p.slice(base.length));
      res.push(shown);
    });
  });
  if (res.length) c.out(res.join('\n') + '\n');
  return 0;
};

/* ---------- tar (mô phỏng) ---------- */
cmds.tar = function (a, c) {
  var sh = c.sh, S = sec(sh.W); S.tars = S.tars || {};
  var flags = '', rest = [], i;
  for (i = 0; i < a.length; i++) { if (/^-?[cxtzvf]+$/.test(a[i]) && !flags) flags = a[i].replace('-', ''); else rest.push(a[i]); }
  if (!flags) throw new CmdErr('tar: You must specify one of the \'-Acdtrux\' options');
  var dirI = rest.indexOf('-C'), dir = dirI >= 0 ? rest.splice(dirI, 2)[1] : null;
  var arch = rest.shift();
  if (!arch) throw new CmdErr('tar: Refusing to read archive contents from terminal (missing -f option?)');
  arch = sh.abs(arch);
  if (flags.indexOf('c') >= 0) {
    if (!rest.length) throw new CmdErr('tar: Cowardly refusing to create an empty archive');
    var snap = [], bytes = 0;
    rest.forEach(function (p) {
      var base = sh.abs(p), pre = base === '/' ? '/' : base + '/';
      if (!sh.fs.get(base)) { c.err('tar: ' + p + ': Cannot stat: No such file or directory\n'); return; }
      Object.keys(sh.fs.n).sort().forEach(function (k) {
        if (k !== base && k.indexOf(pre) !== 0) return;
        var n = sh.fs.n[k]; snap.push({ p: k, n: JSON.parse(JSON.stringify(n)) });
        if (n.t === 'f') bytes += (n.c || '').length;
      });
    });
    if (flags.indexOf('v') >= 0) snap.forEach(function (s) { c.out(s.p.replace(/^\//, '') + (s.n.t === 'd' ? '/' : '') + '\n'); });
    S.tars[arch] = snap;
    sh.fs.put(arch, 'gzip compressed data (mô phỏng): ' + snap.length + ' mục\n', { owner: sh.user, size: Math.max(1024, Math.round(bytes / 3)) });
    return 0;
  }
  var snapx = S.tars[arch];
  if (!snapx) throw new CmdErr('tar: ' + arch + ': Cannot open: No such file or directory');
  if (flags.indexOf('t') >= 0) { c.out(snapx.map(function (s) { return s.p.replace(/^\//, '') + (s.n.t === 'd' ? '/' : ''); }).join('\n') + '\n'); return 0; }
  if (flags.indexOf('x') >= 0) {
    var target = dir ? sh.abs(dir) : sh.cwd;
    snapx.forEach(function (s) {
      var dest = (target === '/' ? '' : target) + s.p;
      if (!sh.isRoot(c) && !sh.canWrite(dest, c)) { c.err('tar: ' + s.p.replace(/^\//, '') + ': Cannot open: Permission denied\n'); return; }
      if (s.n.t === 'd') sh.fs.mkdirp(dest, s.n.owner, s.n.mode); else sh.fs.put(dest, s.n.c, { owner: s.n.owner, mode: s.n.mode });
      if (flags.indexOf('v') >= 0) c.out(s.p.replace(/^\//, '') + '\n');
    });
    return 0;
  }
  throw new CmdErr('tar: chỉ hỗ trợ c, t, x (kèm z, v, f, -C)');
};

/* ---------- printf, bash script ---------- */
cmds.printf = function (a, c) {
  var fmt = (a[0] || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t'), args = a.slice(1), k = 0;
  c.out(fmt.replace(/%[sd]/g, function () { return args[k++] || ''; })); return 0;
};
function runScript(a, c, name) {
  var sh = c.sh, p = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (!p) throw new CmdErr(name + ': thiếu tên script');
  var n = sh.fs.get(sh.abs(p));
  if (!n) throw new CmdErr(name + ': ' + p + ': No such file or directory');
  var rc = 0;
  lines(n.c).forEach(function (l) {
    var t = l.trim(); if (!t || t.charAt(0) === '#') return;
    var r = sh.run(t); if (r.out) c.out(r.out); rc = r.code || 0;
  });
  return rc;
}
cmds.bash = function (a, c) { return runScript(a, c, 'bash'); };
cmds.sh = function (a, c) { return runScript(a, c, 'sh'); };

/* ---------- lynis ---------- */
function lynisItems(sh) {
  var W = sh.W, S = sec(W), out = [], e = VPS.sec.applied(sh);
  if (e.permitrootlogin === 'yes') out.push(['SSH-7440', 'Consider hardening SSH configuration: PermitRootLogin (YES --> NO)']);
  if (e.passwordauthentication === 'yes') out.push(['SSH-7441', 'Consider hardening SSH configuration: PasswordAuthentication (YES --> NO)']);
  if (+e.maxauthtries > 3) out.push(['SSH-7442', 'Consider hardening SSH configuration: MaxAuthTries (' + e.maxauthtries + ' --> 3)']);
  if (!e.allowusers) out.push(['SSH-7408', 'Consider restricting logins with AllowUsers or AllowGroups']);
  if (!W.ufw.active) out.push(['FIRE-4512', 'Enable a firewall (ufw) and allow only required ports']);
  if (S.upg.length) out.push(['PKGS-7392', S.upg.length + ' packages have updates available (apt upgrade)']);
  if (!S.unattended) out.push(['PKGS-7420', 'Install unattended-upgrades to apply security patches automatically']);
  if (!sh.fs.isF('/etc/fail2ban/jail.local')) out.push(['DEFA-7330', 'Create /etc/fail2ban/jail.local with ignoreip and a stricter sshd jail']);
  var live = W.nginx.live;
  if (W.nginx.active && live && live.http && live.http.tokens && !live.servers.some(function (s) { return s.stmts.some(function (t) { return t.name === 'server_tokens' && t.args[0] === 'off'; }); })) out.push(['HTTP-6640', 'Hide Nginx version: set server_tokens off']);
  if (W.nginx.active && live && live.http && !live.http.headers.some(function (h) { return /x-frame-options/i.test(h.name); }) && !live.servers.some(function (s) { return s.stmts.some(function (t) { return t.name === 'add_header' && /x-frame-options/i.test(t.args[0]); }); })) out.push(['HTTP-6641', 'Add security headers (X-Frame-Options, X-Content-Type-Options, HSTS)']);
  Object.keys(sh.fs.n).sort().forEach(function (p) {
    var n = sh.fs.n[p];
    if (n.t === 'f' && (n.mode & 2048) && !/^\/usr\/(bin|lib)\//.test(p)) out.push(['FILE-6410', 'Unexpected SUID file found: ' + p]);
  });
  return out;
}
VPS.sec.lynis = function (sh) { var it = lynisItems(sh); return { items: it, score: Math.max(30, 92 - 6 * it.length) }; };
cmds.lynis = function (a, c) {
  need(c, 'Lynis: bạn nên chạy với sudo để quét đầy đủ (sudo lynis audit system).');
  if (a[0] !== 'audit' || a[1] !== 'system') { c.out('Usage: lynis audit system\n'); return 1; }
  var r = VPS.sec.lynis(c.sh), bar = '', fill = Math.round(r.score / 5);
  for (var i = 0; i < 20; i++) bar += i < fill ? '#' : ' ';
  c.out('[ Lynis 3.0.9 ]\n\n  Initializing program...\n  - Detecting OS...                                           [ DONE ]\n  - Checking SSH, firewall, packages, web server...           [ DONE ]\n\n================================================================================\n\n  -[ Lynis 3.0.9 Results ]-\n\n  Warnings (0):\n\n  Suggestions (' + r.items.length + '):\n' + r.items.map(function (x) { return '  * ' + x[1] + ' [' + x[0] + ']\n      https://cisofy.com/lynis/controls/' + x[0] + '/\n'; }).join('') + '\n  Lynis security scan details:\n\n  Hardening index : ' + r.score + ' [' + bar + ']\n  Tests performed : 262\n  Plugins enabled : 0\n');
  return 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
