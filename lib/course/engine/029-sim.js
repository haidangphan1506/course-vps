(function (G) {
'use strict';
/* Bổ sung cho nhóm "Linux căn bản": PATH, alias, umask, thời gian sửa file (mt), hard link, ls/find/stat đầy đủ,
   touch -d/-t/-r, rmdir, pushd/popd, time, fg/bg, locate/updatedb/whereis, flock, /proc mẫu. */
var V = G.VPS, cmds = V.cmds, B = V.builtins, CmdErr = V.CmdErr, SP = V.Shell.prototype, U = V.util;
var FSP = Object.getPrototypeOf(new V.Shell({}).fs);
var NOW_MS = Date.UTC(2026, 9, 27, 3, 20, 0), TZ = 7 * 3600000;
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad(s, n, right) { s = String(s); while (s.length < n) s = right ? ' ' + s : s + ' '; return s; }
function z2(n) { return (n < 10 ? '0' : '') + n; }
function mtOf(n) { return n && n.mt != null ? n.mt : (n && n.mdays != null ? NOW_MS - n.mdays * 86400000 : NOW_MS); }
var INO = 131072;
function ino(n) { if (!n._ino) n._ino = ++INO * 3 + 7; return n._ino; }
V.base = { NOW_MS: NOW_MS };
V.base.setMt = function (s, path, str) { var n = s.fs.get(path, true); if (n) n.mt = parseDate(str); };

/* ---------- biến môi trường mặc định ---------- */
var origBase = SP.baseFS;
SP.baseFS = function () {
  origBase.call(this);
  if (!this.env.PATH) this.env.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  if (!this.env.EDITOR) this.env.EDITOR = 'nano';
};
var origGetVar = SP.getVar;
SP.getVar = function (name) {
  if (name === 'PWD') return this.cwd;
  if (name === 'OLDPWD') return this.oldpwd || '';
  if (name === 'RANDOM') return String(Math.floor(Math.random() * 32768));
  if (name === 'UID' || name === 'EUID') return this.user === 'root' ? '0' : '1000';
  if (name === 'HOSTNAME') return this.hostName;
  if (name === 'SECONDS') return '0';
  return origGetVar.call(this, name);
};

/* ---------- thời gian ---------- */
function parseDate(str) {
  str = String(str).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(str);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - TZ;
  m = /^(\d+)\s*(second|sec|minute|min|hour|day|week)s?\s+ago$/.exec(str);
  if (m) { var u = { second: 1000, sec: 1000, minute: 60000, min: 60000, hour: 3600000, day: 86400000, week: 604800000 }[m[2]]; return NOW_MS - (+m[1]) * u; }
  if (str === 'yesterday') return NOW_MS - 86400000;
  if (str === 'now' || str === '') return NOW_MS;
  return null;
}
function parseStamp(t) {
  var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{2}))?$/.exec(t);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - TZ;
}
function lsTime(ms) {
  var d = new Date(ms + TZ), age = NOW_MS - ms;
  var day = pad(d.getUTCDate(), 2, true);
  if (age > 15552000000 || age < -3600000) return MON[d.getUTCMonth()] + ' ' + day + '  ' + d.getUTCFullYear();
  return MON[d.getUTCMonth()] + ' ' + day + ' ' + z2(d.getUTCHours()) + ':' + z2(d.getUTCMinutes());
}
function fullTime(ms) {
  var d = new Date(ms + TZ);
  return d.getUTCFullYear() + '-' + z2(d.getUTCMonth() + 1) + '-' + z2(d.getUTCDate()) + ' ' + z2(d.getUTCHours()) + ':' + z2(d.getUTCMinutes()) + ':' + z2(d.getUTCSeconds()) + '.000000000 +0700';
}

/* ---------- FS: umask, hard link ---------- */
/* symlink ở giữa đường dẫn: current/version.txt với current -> releases/v2 */
FSP.real = function (p) {
  var parts = p.split('/').filter(Boolean), cur = '', i, hops = 0, n;
  for (i = 0; i < parts.length; i++) {
    cur += '/' + parts[i]; n = this.n[cur];
    while (n && n.t === 'l' && hops++ < 16) {
      var t = n.target, base = cur.replace(/[^\/]*$/, '');
      cur = this.norm(t.charAt(0) === '/' ? t : base + t); n = this.n[cur];
      if (n && n.t === 'l' && i === parts.length - 1) continue;
      if (!n) break;
    }
  }
  return cur || '/';
};
FSP.get = function (p, nofollow) {
  if (!nofollow) return this.n[this.real(p)];
  if (this.n[p]) return this.n[p];
  var par = this.parent(p), rp = this.real(par);
  return rp === par ? undefined : this.n[(rp === '/' ? '' : rp) + '/' + p.split('/').pop()];
};
var origPut = FSP.put;
FSP.put = function (p, c, o) {
  o = o || {};
  var rp = this.real(p), prev = this.n[rp];
  if (prev && prev.t === 'f' && prev.nl > 1) {
    prev.c = c; delete prev.mt; if (o.mode != null) prev.mode = o.mode; prev.size = o.size != null ? o.size : undefined; return;
  }
  if (!prev && o.mode == null) { o = Object.assign({}, o); o.mode = 438 & ~(this.umask != null ? this.umask : 18); }
  return origPut.call(this, p, c, o);
};
var origRm = FSP.rm;
FSP.rm = function (p) {
  if (!this.n[p]) { var par = this.parent(p), rp = this.real(par); if (rp !== par) p = (rp === '/' ? '' : rp) + '/' + p.split('/').pop(); }
  var pre = p + '/', k, n;
  for (k in this.n) if (k === p || k.indexOf(pre) === 0) { n = this.n[k]; if (n && n.nl > 1) { n.nl--; delete this.n[k]; } }
  return origRm.call(this, p);
};
var prevLn = cmds.ln;
cmds.ln = function (a, c) {
  var sh = c.sh, flags = '', rest = [];
  a.forEach(function (x) { if (/^-[a-zA-Z]+$/.test(x)) flags += x.slice(1); else rest.push(x); });
  if (/s/.test(flags)) return prevLn(a, c);
  if (rest.length < 2) throw new CmdErr('ln: missing file operand', 1);
  var t = sh.abs(rest[0]), tn = sh.fs.get(t);
  if (!tn) throw new CmdErr("ln: failed to access '" + rest[0] + "': No such file or directory", 1);
  if (tn.t === 'd') throw new CmdErr("ln: " + rest[0] + ": hard link not allowed for directory", 1);
  var link = sh.abs(rest[1]);
  if (sh.fs.isD(link)) link = (link === '/' ? '' : link) + '/' + rest[0].split('/').pop();
  if (!sh.canWrite(link, c)) throw new CmdErr("ln: failed to create hard link '" + rest[1] + "': Permission denied", 1);
  if (sh.fs.get(link, true)) { if (/f/.test(flags)) sh.fs.rm(link); else throw new CmdErr("ln: failed to create hard link '" + rest[1] + "': File exists", 1); }
  if (!sh.fs.isD(sh.fs.parent(link))) throw new CmdErr("ln: failed to create hard link '" + rest[1] + "': No such file or directory", 1);
  var rt = sh.fs.real(t); tn.nl = (tn.nl || 1) + 1;
  sh.fs.n[link] = sh.fs.n[rt];
  return 0;
};
function nlinkOf(sh, p, n) {
  if (n.t === 'd') { var c = 2; sh.fs.list(sh.fs.real(p)).forEach(function (nm) { var ch = sh.fs.get((p === '/' ? '' : sh.fs.real(p)) + '/' + nm, true); if (ch && ch.t === 'd') c++; }); return c; }
  return n.nl || 1;
}

/* ---------- umask ---------- */
B.umask = function (a, c) {
  var fs = c.sh.fs, cur = fs.umask != null ? fs.umask : 18, sym = a.indexOf('-S') >= 0, v = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (v == null) {
    if (sym) { var f = function (b) { return (b & 4 ? '' : 'r') + (b & 2 ? '' : 'w') + (b & 1 ? '' : 'x'); }; c.out('u=' + f(cur >> 6 & 7).replace(/^$/, '') + ',g=' + f(cur >> 3 & 7) + ',o=' + f(cur & 7) + '\n'); }
    else c.out(pad(cur.toString(8), 4, true).replace(/ /g, '0') + '\n');
    return 0;
  }
  if (!/^[0-7]{1,4}$/.test(v)) throw new CmdErr('bash: umask: ' + v + ': octal number out of range', 1);
  fs.umask = parseInt(v, 8); return 0;
};
var prevMkdir = cmds.mkdir;
cmds.mkdir = function (a, c) {
  var sh = c.sh, targets = [], skip = false;
  a.forEach(function (x, i) { if (skip) { skip = false; return; } if (x === '-m') { skip = true; return; } if (x.charAt(0) !== '-') targets.push(sh.abs(x)); });
  var fresh = targets.filter(function (t) { return !sh.fs.get(t, true); });
  var rc = prevMkdir(a, c);
  if (a.indexOf('-m') < 0 && sh.fs.umask != null) fresh.forEach(function (t) { var n = sh.fs.get(t, true); if (n && n.t === 'd') n.mode = 511 & ~sh.fs.umask; });
  return rc;
};
cmds.rmdir = function (a, c) {
  var sh = c.sh, rc = 0;
  a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) {
    var ap = sh.abs(p), n = sh.fs.get(ap, true);
    if (!n) { c.err("rmdir: failed to remove '" + p + "': No such file or directory\n"); rc = 1; return; }
    if (n.t !== 'd') { c.err("rmdir: failed to remove '" + p + "': Not a directory\n"); rc = 1; return; }
    if (sh.fs.list(ap).length) { c.err("rmdir: failed to remove '" + p + "': Directory not empty\n"); rc = 1; return; }
    if (!sh.canWrite(ap, c)) { c.err("rmdir: failed to remove '" + p + "': Permission denied\n"); rc = 1; return; }
    sh.fs.rm(ap);
  });
  return rc;
};

/* ---------- touch với -d/-t/-r ---------- */
var prevTouch = cmds.touch;
cmds.touch = function (a, c) {
  var sh = c.sh, stamp = null, files = [], i, noCreate = false, bad = null;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-d' || x === '--date') { stamp = parseDate(a[++i] || ''); if (stamp == null) bad = a[i]; }
    else if (/^--date=/.test(x)) { stamp = parseDate(x.slice(7)); if (stamp == null) bad = x.slice(7); }
    else if (x === '-t') { stamp = parseStamp(a[++i] || ''); if (stamp == null) bad = a[i]; }
    else if (x === '-r' || x === '--reference') { var rn = sh.fs.get(sh.abs(a[++i] || '')); if (!rn) throw new CmdErr("touch: failed to get attributes of '" + a[i] + "': No such file or directory", 1); stamp = mtOf(rn); }
    else if (/^-[acm]+$/.test(x)) { if (/c/.test(x)) noCreate = true; }
    else files.push(x);
  }
  if (bad != null) throw new CmdErr("touch: invalid date format '" + bad + "'", 1);
  var rc = 0;
  files.forEach(function (f) {
    var ap = sh.abs(f), ex = sh.fs.get(ap, true);
    if (!ex && noCreate) return;
    if (!ex) { var r = prevTouch([f], c); if (r) { rc = r; return; } }
    var n = sh.fs.get(ap);
    if (!n) return;
    if (stamp != null) n.mt = stamp; else delete n.mt;
  });
  return rc;
};


/* ---------- quyền truy cập thực tế: theo lớp owner/group/other và quyền duyệt thư mục cha ---------- */
function permCls(sh, n, c) {
  if (sh.isRoot(c)) return 7;
  if (n.owner === sh.user) return (n.mode >> 6) & 7;
  var g = V.lin2 && V.lin2.sgroups && sh.W && sh.W.lin2 ? V.lin2.sgroups(sh, sh.user) : [sh.user];
  if (g.indexOf(n.group || n.owner) >= 0) return (n.mode >> 3) & 7;
  return n.mode & 7;
}
function traverseOK(sh, rp, c) {
  if (sh.isRoot(c)) return true;
  var parts = rp.split('/').filter(Boolean), cur = '', i;
  for (i = 0; i < parts.length - 1; i++) { cur += '/' + parts[i]; var d = sh.fs.n[cur]; if (d && d.t === 'd' && !(permCls(sh, d, c) & 1)) return false; }
  return true;
}
V.base.permCls = permCls; V.base.traverseOK = traverseOK;
SP.canRead = function (p, c) {
  if (this.isRoot(c)) return true;
  var rp = this.fs.real(p), n = this.fs.n[rp]; if (!n) return true;
  return traverseOK(this, rp, c) && !!(permCls(this, n, c) & 4);
};
SP.canWrite = function (p, c) {
  if (this.isRoot(c)) return true;
  var rp = this.fs.real(p), n = this.fs.n[rp];
  if (n) return traverseOK(this, rp, c) && !!(permCls(this, n, c) & 2);
  var pp = this.fs.parent(rp), d = this.fs.n[pp];
  while (!d && pp && pp !== '/') { pp = this.fs.parent(pp); d = this.fs.n[pp]; }
  if (!d) return false;
  return traverseOK(this, pp + '/x', c) && (permCls(this, d, c) & 3) === 3;
};
var prevCd = B.cd;
B.cd = function (a, c) {
  var sh = c.sh, t = a[0] === undefined ? sh.home : (a[0] === '-' ? (sh.oldpwd || sh.cwd) : a[0]), p = sh.abs(t), rp = sh.fs.real(p), n = sh.fs.n[rp];
  if (n && n.t === 'd' && !sh.isRoot(c) && (!traverseOK(sh, rp, c) || !(permCls(sh, n, c) & 1))) throw new CmdErr('bash: cd: ' + t + ': Permission denied', 1);
  return prevCd(a, c);
};
cmds.namei = function (a, c) {
  var sh = c.sh, long = a.indexOf('-l') >= 0 || a.indexOf('-m') >= 0, rc = 0;
  a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (f) {
    var ap = sh.abs(f), parts = ap.split('/').filter(Boolean), cur = '', rows = [['/', sh.fs.n['/']]], i;
    c.out('f: ' + f + '\n');
    for (i = 0; i < parts.length; i++) { cur += '/' + parts[i]; var n = sh.fs.get(cur, true); if (!n) { rows.push([parts[i], null]); break; } rows.push([parts[i], n]); }
    var ow = 0, gw = 0; rows.forEach(function (r) { if (r[1]) { ow = Math.max(ow, r[1].owner.length); gw = Math.max(gw, (r[1].group || r[1].owner).length); } });
    rows.forEach(function (r) {
      if (!r[1]) { c.out(' ' + r[0] + ' - No such file or directory\n'); rc = 1; return; }
      var n = r[1];
      c.out(long ? ' ' + U.modeString(n) + ' ' + pad(n.owner, ow) + ' ' + pad(n.group || n.owner, gw) + ' ' + r[0] + (n.t === 'l' ? ' -> ' + n.target : '') + '\n' : ' ' + (n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : '-') + ' ' + r[0] + '\n');
    });
  });
  return rc;
};


/* ---------- shell: tilde sau dau = va :, glob thu muc, !! va !$, tim lenh theo PATH ---------- */
var origExpand = SP.expand;
SP.expand = function (word) {
  var p0 = word.parts && word.parts[0];
  if (p0 && p0.q === 'n' && /^[A-Za-z_]\w*=/.test(p0.v) && p0.v.indexOf('~') > 0) {
    var home = this.home, parts = word.parts.slice();
    parts[0] = { q: 'n', v: p0.v.replace(/(=|:)~(?=\/|:|$)/g, function (m, d) { return d + home; }) };
    word = { t: 'w', parts: parts };
  }
  return origExpand.call(this, word);
};
SP.expandNG = function (w) {
  var parts = w.parts.map(function (p) { return p.q === 'n' ? { q: 'd', v: p.v } : p; });
  return origExpand.call(this, { t: 'w', parts: parts }).join(' ');
};
var origGlob = SP.globExpand;
SP.globExpand = function (pat) {
  if (/\/$/.test(pat) && pat.length > 1) {
    var self = this, res = origGlob.call(this, pat.replace(/\/+$/, ''));
    var dirs = res.filter(function (r) { return self.fs.isD(self.abs(r)); }).map(function (r) { return r + '/'; });
    return dirs.length ? dirs : [pat];
  }
  return origGlob.call(this, pat);
};
function findInPath(sh, name) {
  var dirs = String(sh.getVar('PATH') || '').split(':'), i;
  for (i = 0; i < dirs.length; i++) {
    if (!dirs[i]) continue;
    var p = sh.fs.norm((dirs[i].charAt(0) === '/' ? '' : sh.cwd + '/') + dirs[i] + '/' + name), n = sh.fs.get(p);
    if (n && n.t === 'f' && (n.mode & 73)) return p;
  }
  return null;
}
V.base.findInPath = findInPath;
var prevWhich = cmds.which;
cmds.which = function (a, c) {
  var sh = c.sh, rc = 0;
  a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (nm) {
    if (!cmds[nm] || B[nm]) { var p = nm.indexOf('/') < 0 ? findInPath(sh, nm) : null; if (p) c.out(p + '\n'); else rc = 1; return; }
    var r = prevWhich ? prevWhich([nm], c) : 1; if (r) rc = r;
  });
  return rc;
};
var prevType = B.type;
B.type = function (a, c) {
  var sh = c.sh, rest = [], rc = 0;
  a.forEach(function (nm) {
    if (nm.charAt(0) !== '-' && !B[nm] && !cmds[nm] && !(sh.aliases && sh.aliases[nm] != null) && !(sh.funcs && sh.funcs[nm])) {
      var p = findInPath(sh, nm); if (p) { c.out(nm + ' is ' + p + '\n'); return; }
    }
    rest.push(nm);
  });
  if (rest.filter(function (x) { return x.charAt(0) !== '-'; }).length) { var r = prevType(rest, c); if (r) rc = r; }
  return rc;
};
var prevCommand = B.command;
B.command = function (a, c) {
  if ((a[0] === '-v' || a[0] === '-V') && a[1] && !B[a[1]] && !cmds[a[1]]) { var p = findInPath(c.sh, a[1]); if (p) { c.out(p + '\n'); return 0; } return 1; }
  return prevCommand(a, c);
};
var prevRun2 = SP.run;
SP.run = function (text) {
  var self = this, expanded = false;
  if (/!!|!\$/.test(text)) {
    if (text.indexOf('\n') >= 0 && text.indexOf('<<') < 0) {
      var ls = text.split('\n').filter(function (x) { return x.trim(); }), outs = '', last2 = { out: '', code: 0 }, k;
      for (k = 0; k < ls.length; k++) { last2 = this.run(ls[k]); outs += last2.out || ''; }
      return { out: outs, code: last2.code, clear: last2.clear };
    }
    var last = this.hist.length ? this.hist[this.hist.length - 1].cmd : '', lastArg = last.split(' ').pop(), bad = false, out = '', sq = false, i;
    for (i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "'") sq = !sq;
      if (!sq && ch === '!' && text.charAt(i + 1) === '!') { if (!last) bad = true; out += last; i++; expanded = true; continue; }
      if (!sq && ch === '!' && text.charAt(i + 1) === '$') { if (!last) bad = true; out += lastArg; i++; expanded = true; continue; }
      out += ch;
    }
    if (bad) return { out: 'bash: !!: event not found\n', code: 1 };
    var o2 = prevRun2.call(this, out);
    if (expanded && o2 && typeof o2.out === 'string') o2.out = out + '\n' + o2.out;
    return o2;
  }
  return prevRun2.call(this, text);
};


/* ---------- file: nhận dạng theo nội dung đầu file ---------- */
var prevFile = cmds.file;
cmds.file = function (a, c) {
  var sh = c.sh, rc = 0, names = a.filter(function (x) { return x.charAt(0) !== '-'; });
  names.forEach(function (nm) {
    var n = sh.fs.get(sh.abs(nm)), head = n && n.t === 'f' ? String(n.c || '').slice(0, 8) : '';
    if (!n) { c.out(nm + ': cannot open `' + nm + "' (No such file or directory)\n"); rc = 1; }
    else if (/^%PDF-/.test(head)) c.out(nm + ': PDF document, version ' + head.slice(5, 8) + '\n');
    else if (/^JFIF/.test(head)) c.out(nm + ': JPEG image data, JFIF standard 1.01\n');
    else if (/^PNG/.test(head)) c.out(nm + ': PNG image data, 800 x 600, 8-bit/color RGB, non-interlaced\n');
    else if (n.t === 'f' && (n.mode & 73) && /^#!\s*\/\S*(bash|sh)/.test(String(n.c || ''))) c.out(nm + ': Bourne-Again shell script, Unicode text, UTF-8 text executable\n');
    else if (n.t === 'f' && /^#!/.test(String(n.c || ''))) c.out(nm + ': script, Unicode text, UTF-8 text executable\n');
    else if (n.t === 'f' && String(n.c || '') === '') c.out(nm + ': empty\n');
    else if (prevFile) { var r = prevFile([nm], c); if (r) rc = r; }
  });
  return rc;
};


/* ---------- băm thật: sha256, sha1, md5 ---------- */
function utf8(str) { return typeof TextEncoder !== 'undefined' ? Array.prototype.slice.call(new TextEncoder().encode(str)) : unescape(encodeURIComponent(str)).split('').map(function (ch) { return ch.charCodeAt(0); }); }
function hex8(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
function padMsg(bytes, little) {
  var l = bytes.length, b = bytes.slice(), i; b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  var hi = Math.floor(l / 0x20000000), lo = (l << 3) >>> 0;
  var parts = little ? [lo, hi] : [hi, lo];
  parts.forEach(function (w) { if (little) for (i = 0; i < 4; i++) b.push((w >>> (8 * i)) & 255); else for (i = 3; i >= 0; i--) b.push((w >>> (8 * i)) & 255); });
  return b;
}
var K256 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256hex(str) {
  var b = padMsg(utf8(str), false), H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], o, i, t;
  for (o = 0; o < b.length; o += 64) {
    var w = [];
    for (i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (i = 16; i < 64; i++) { var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    var a = H[0], bb = H[1], cc = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & bb) ^ (a & cc) ^ (bb & cc), t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = bb; bb = a; a = (t1 + t2) | 0;
    }
    H = [(H[0] + a) | 0, (H[1] + bb) | 0, (H[2] + cc) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
  }
  return H.map(hex8).join('');
}
function sha1hex(str) {
  var b = padMsg(utf8(str), false), H = [0x67452301,0xEFCDAB89,0x98BADCFE,0x10325476,0xC3D2E1F0], o, i;
  for (o = 0; o < b.length; o += 64) {
    var w = [];
    for (i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    var a = H[0], bb = H[1], cc = H[2], d = H[3], e = H[4];
    for (i = 0; i < 80; i++) {
      var f, k;
      if (i < 20) { f = (bb & cc) | (~bb & d); k = 0x5A827999; } else if (i < 40) { f = bb ^ cc ^ d; k = 0x6ED9EBA1; } else if (i < 60) { f = (bb & cc) | (bb & d) | (cc & d); k = 0x8F1BBCDC; } else { f = bb ^ cc ^ d; k = 0xCA62C1D6; }
      var t = (rotl(a, 5) + f + e + k + w[i]) | 0; e = d; d = cc; cc = rotl(bb, 30); bb = a; a = t;
    }
    H = [(H[0] + a) | 0, (H[1] + bb) | 0, (H[2] + cc) | 0, (H[3] + d) | 0, (H[4] + e) | 0];
  }
  return H.map(hex8).join('');
}
var MS = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
var MK = []; for (var mi = 0; mi < 64; mi++) MK[mi] = Math.floor(Math.abs(Math.sin(mi + 1)) * 4294967296) | 0;
function md5hex(str) {
  var b = padMsg(utf8(str), true), a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476, o, i;
  for (o = 0; o < b.length; o += 64) {
    var M = [];
    for (i = 0; i < 16; i++) M[i] = b[o + 4 * i] | (b[o + 4 * i + 1] << 8) | (b[o + 4 * i + 2] << 16) | (b[o + 4 * i + 3] << 24);
    var A = a0, Bq = b0, Cq = c0, D = d0;
    for (i = 0; i < 64; i++) {
      var F, g;
      if (i < 16) { F = (Bq & Cq) | (~Bq & D); g = i; } else if (i < 32) { F = (D & Bq) | (~D & Cq); g = (5 * i + 1) % 16; } else if (i < 48) { F = Bq ^ Cq ^ D; g = (3 * i + 5) % 16; } else { F = Cq ^ (Bq | ~D); g = (7 * i) % 16; }
      F = (F + A + MK[i] + M[g]) | 0; A = D; D = Cq; Cq = Bq; Bq = (Bq + rotl(F, MS[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + Bq) | 0; c0 = (c0 + Cq) | 0; d0 = (d0 + D) | 0;
  }
  function le(n) { var r = ''; for (var k = 0; k < 4; k++) r += ('0' + ((n >>> (8 * k)) & 255).toString(16)).slice(-2); return r; }
  return le(a0) + le(b0) + le(c0) + le(d0);
}
V.base.hash = { sha256: sha256hex, sha1: sha1hex, md5: md5hex };
function mkSum(name, fn) {
  cmds[name] = function (a, c) {
    var sh = c.sh, check = a.indexOf('-c') >= 0 || a.indexOf('--check') >= 0;
    var files = a.filter(function (x) { return x.charAt(0) !== '-'; }), rc = 0, bad = 0, unread = 0;
    if (check) {
      files.forEach(function (lf) {
        var lt = sh.fs.get(sh.abs(lf)); if (!lt) { c.err(name + ': ' + lf + ': No such file or directory\n'); rc = 1; return; }
        String(lt.c || '').split('\n').filter(Boolean).forEach(function (ln) {
          var m = /^(\S+)\s+\*?(.+)$/.exec(ln); if (!m) return;
          var n = sh.fs.get(sh.abs(m[2]));
          if (!n || n.t !== 'f') { c.out(m[2] + ': FAILED open or read\n'); unread++; rc = 1; return; }
          if (fn(n.c || '') === m[1]) c.out(m[2] + ': OK\n'); else { c.out(m[2] + ': FAILED\n'); bad++; rc = 1; }
        });
      });
      if (unread) c.err(name + ': WARNING: ' + unread + ' listed file' + (unread > 1 ? 's' : '') + ' could not be read\n');
      if (bad) c.err(name + ': WARNING: ' + bad + ' computed checksum' + (bad > 1 ? 's' : '') + ' did NOT match\n');
      return rc;
    }
    if (!files.length) { c.out(fn(c.stdin || '') + '  -\n'); return 0; }
    files.forEach(function (f) {
      var n = sh.fs.get(sh.abs(f));
      if (!n) { c.err(name + ': ' + f + ': No such file or directory\n'); rc = 1; return; }
      if (n.t !== 'f') { c.err(name + ': ' + f + ': Is a directory\n'); rc = 1; return; }
      c.out(fn(n.c || '') + '  ' + f + '\n');
    });
    return rc;
  };
}
mkSum('sha256sum', sha256hex); mkSum('sha1sum', sha1hex); mkSum('md5sum', md5hex);


/* ---------- tar: -tv, -O, -f - ; gzip -l ---------- */
function lin2S(sh) { return sh.W && sh.W.lin2; }
var prevTar = cmds.tar;
cmds.tar = function (a, c) {
  var sh = c.sh, S = lin2S(sh); if (!S || !prevTar) return prevTar(a, c);
  var args = a.slice(), i, fl = '', fIdx = -1;
  for (i = 0; i < args.length; i++) {
    var x = args[i];
    if (x === '-f' || x === '--file') { fIdx = i + 1; fl += 'f'; i++; continue; }
    if (/^-?[cxtzjJvfpOkP]+$/.test(x) && (i === 0 || x.charAt(0) === '-')) { fl += x.replace(/^-/, ''); if (/f/.test(x)) fIdx = i + 1; }
  }
  var fname = fIdx >= 0 ? args[fIdx] : null, mode = /c/.test(fl) ? 'c' : /x/.test(fl) ? 'x' : /t/.test(fl) ? 't' : null, tmp = null;
  S.arcs = S.arcs || {};
  if (fname === '-' && mode === 'c') {
    tmp = '/tmp/.tarstream-' + (S.tsN = (S.tsN || 0) + 1); args[fIdx] = tmp;
    var rc0 = prevTar(args, c);
    var tn = sh.fs.get(tmp); if (tn) { c.out('TARSTREAM:' + tmp + ':' + 'x'.repeat(Math.max(10, tn.size || 100))); }
    return rc0;
  }
  if (fname === '-' && (mode === 'x' || mode === 't')) {
    var m = /^TARSTREAM:(\/tmp\/\.tarstream-\d+):/.exec(c.stdin || '');
    if (!m) throw new CmdErr('tar: This does not look like a tar archive\ntar: Exiting with failure status due to previous errors', 2);
    args[fIdx] = m[1];
  }
  if (/O/.test(fl) || args.indexOf('-O') >= 0 || args.indexOf('--to-stdout') >= 0) {
    var ap = sh.abs(args[fIdx]), data = S.arcs[ap];
    if (!data) return prevTar(args.filter(function (q) { return q !== '-O' && q !== '--to-stdout'; }), c);
    var names = args.filter(function (q, k) { return k !== fIdx && !/^-/.test(q) && !(k === 0 && /^[cxtzjJvfpOkP]+$/.test(q)); });
    data.ents.forEach(function (e) { if (e.node.t === 'f' && (!names.length || names.some(function (nm) { return e.name === nm || e.name.indexOf(nm.replace(/\/$/, '') + '/') === 0; }))) c.out(e.node.c || ''); });
    return 0;
  }
  if (mode === 't' && /v/.test(fl)) {
    var ap2 = sh.abs(args[fIdx]), d2 = S.arcs[ap2];
    if (d2 && sh.fs.get(ap2)) {
      var rows = d2.ents.map(function (e) {
        var n = e.node, sz = n.t === 'd' ? 0 : (n.size != null ? n.size : (n.c || '').length);
        var ms = U.modeString(n); 
        return ms + ' ' + (n.owner || sh.user) + '/' + (n.group || n.owner || sh.user) + ' ' + ('          ' + sz).slice(-7) + ' 2026-10-27 10:20 ' + e.name + (n.t === 'd' ? '/' : '');
      });
      c.out(rows.join('\n') + '\n'); return 0;
    }
  }
  return prevTar(args, c);
};
var prevGzip = cmds.gzip;
cmds.gzip = function (a, c) {
  var sh = c.sh, S = lin2S(sh);
  if (S && a.indexOf('-l') >= 0) {
    var files = a.filter(function (x) { return x.charAt(0) !== '-'; }), rc = 0, out = '         compressed        uncompressed  ratio uncompressed_name\n', tc = 0, tu = 0;
    files.forEach(function (p) {
      var ap = sh.abs(p), n = sh.fs.get(ap), src = (S.gz || {})[ap];
      if (!n) { c.err('gzip: ' + p + ': No such file or directory\n'); rc = 1; return; }
      if (!src) { c.err('gzip: ' + p + ': not in gzip format\n'); rc = 1; return; }
      var cs = n.size || 60, us = src.size != null ? src.size : (src.c || '').length; tc += cs; tu += us;
      out += ('                    ' + cs).slice(-19) + ' ' + ('                    ' + us).slice(-19) + ' ' + (us ? ((1 - cs / us) * 100).toFixed(1) : '0.0') + '% ' + p.replace(/\.gz$/, '') + '\n';
    });
    c.out(out); return rc;
  }
  return prevGzip(a, c);
};


/* ---------- ps -eo, disown, timeout, pstree ---------- */
var prevPs = cmds.ps;
cmds.ps = function (a, c) {
  var args = []; a.forEach(function (x) { if (x === '-eo' || x === '-Ao') { args.push('-e'); args.push('-o'); } else if (/^-e[a-zA-Z]*o/.test(x) && x.length > 3 && x !== '-eo') { args.push('-e'); args.push('-o'); args.push(x.replace(/^-e\w*o/, '')); } else args.push(x); });
  return prevPs(args, c);
};
B.disown = function (a, c) {
  var sh = c.sh, l = sh.W && sh.W.lin; if (!l) throw new CmdErr('bash: disown: command not found', 127);
  var js = l.procs.filter(function (p) { return p.job && p.session === sh.user && !p.nohup; });
  if (a.indexOf('-a') >= 0 || !a.length) {
    if (!a.length && !js.length) { c.err('bash: disown: current: no such job\n'); return 1; }
    var tgt = a.indexOf('-a') >= 0 ? js : [js[js.length - 1]];
    tgt.forEach(function (p) { p.nohup = true; p.job = 0; });
    return 0;
  }
  var rc = 0;
  a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (x) {
    var m = /^%(\d+)$/.exec(x), p = m ? l.procs.filter(function (q) { return q.job === +m[1]; })[0] : null;
    if (!p) { c.err('bash: disown: ' + x + ': no such job\n'); rc = 1; return; }
    p.nohup = true; p.job = 0;
  });
  return rc;
};
var prevTimeout = cmds.timeout;
cmds.timeout = function (a, c) {
  var i = 0; while (a[i] && a[i].charAt(0) === '-') { if (a[i] === '-s' || a[i] === '-k') i++; i++; }
  var m = /^([\d.]+)([smhd]?)$/.exec(a[i] || ''), rest = a.slice(i + 1);
  if (m && rest[0] === 'sleep') {
    var lim = parseFloat(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 })[m[2]], need = 0;
    rest.slice(1).forEach(function (x) { var q = /^([\d.]+)([smhd]?)$/.exec(x); if (q) need += parseFloat(q[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 })[q[2]]; });
    if (need > lim) { var sh0 = c.sh; if (sh0.W && sh0.W.lin && V.lin && V.lin.advance) V.lin.advance(sh0, lim, c); return 124; }
  }
  return prevTimeout(a, c);
};
cmds.pstree = function (a, c) {
  var sh = c.sh, l = sh.W && sh.W.lin; if (!l) throw new CmdErr('bash: pstree: command not found', 127);
  var byPpid = {}; l.procs.forEach(function (p) { (byPpid[p.ppid] = byPpid[p.ppid] || []).push(p); });
  var out = '', seen = {};
  function walk(p, pre, last, root) {
    seen[p.pid] = true;
    out += (root ? '' : pre + (last ? '└─' : '├─')) + p.name + (a.indexOf('-p') >= 0 ? '(' + p.pid + ')' : '') + '\n';
    var kids = (byPpid[p.pid] || []).filter(function (k) { return k.pid !== p.pid && !seen[k.pid]; });
    kids.forEach(function (k, i) { walk(k, root ? '' : pre + (last ? '  ' : '│ '), i === kids.length - 1, false); });
  }
  var init = l.procs.filter(function (p) { return p.pid === 1; })[0];
  if (init) walk(init, '', true, true);
  c.out(out); return 0;
};


cmds.pidof = function (a, c) {
  var sh = c.sh, l = sh.W && sh.W.lin; if (!l) throw new CmdErr('bash: pidof: command not found', 127);
  var names = a.filter(function (x) { return x.charAt(0) !== '-'; }), single = a.indexOf('-s') >= 0, pids = [];
  l.procs.slice().sort(function (x, y) { return y.pid - x.pid; }).forEach(function (p) { if (names.indexOf(p.name) >= 0) pids.push(p.pid); });
  if (single) pids = pids.slice(0, 1);
  if (!pids.length) return 1;
  c.out(pids.join(' ') + '\n'); return 0;
};

/* ---------- ls ---------- */
var prevLs = cmds.ls;
function sizeOfNode(sh, full, n) {
  if (n.t === 'd') return 4096;
  if (n.t === 'l') return String(n.target).length;
  return sh.fs.size(sh.fs.real(full));
}
function human(sz) {
  if (sz < 1024) return String(sz);
  var u = ['K', 'M', 'G', 'T'], v = sz / 1024, i = 0;
  while (v >= 1024 && i < 3) { v /= 1024; i++; }
  return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + u[i];
}
cmds.ls = function (a, c) {
  var sh = c.sh, f = {}, paths = [], i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '--') { paths = paths.concat(a.slice(i + 1)); break; }
    if (/^--/.test(x)) {
      if (x === '--all') f.a = 1; else if (x === '--human-readable') f.h = 1; else if (x === '--reverse') f.r = 1; else if (x === '--recursive') f.R = 1; else if (x === '--directory') f.d = 1; else if (x === '--inode') f.i = 1; else if (x === '--almost-all') f.A = 1;
      continue;
    }
    if (/^-[A-Za-z1]+$/.test(x)) x.slice(1).split('').forEach(function (ch) { f[ch] = 1; }); else paths.push(x);
  }
  if (!paths.length) paths = ['.'];
  for (i = 0; i < paths.length; i++) { var vn = sh.fs.get(sh.abs(paths[i]), true); if (vn && vn.virt) return prevLs(a, c); }
  var rc = 0, long = f.l, multi = paths.length > 1 || f.R, firstOut = true;
  function entryName(n, nm) {
    var s = nm;
    if (f.F) { if (n.t === 'd') s += '/'; else if (n.t === 'l') s += '@'; else if (n.mode & 73) s += '*'; }
    return s;
  }
  function render(list) {
    // list: [{name, full, n}]
    var rows;
    if (long) {
      var ws = { nl: 1, ow: 1, gr: 1, sz: 1 };
      var info = list.map(function (e) {
        var o = { nl: String(nlinkOf(sh, e.full, e.n)), ow: e.n.owner, gr: e.n.group || e.n.owner, sz: f.h ? human(sizeOfNode(sh, e.full, e.n)) : String(sizeOfNode(sh, e.full, e.n)) };
        ['nl', 'ow', 'gr', 'sz'].forEach(function (k) { ws[k] = Math.max(ws[k], o[k].length); }); return o;
      });
      rows = list.map(function (e, k) {
        var o = info[k], line = (f.i ? pad(ino(e.n), 8, true) + ' ' : '') + U.modeString(e.n) + ' ' + pad(o.nl, ws.nl, true) + ' ' + pad(o.ow, ws.ow) + ' ' + pad(o.gr, ws.gr) + ' ' + pad(o.sz, ws.sz, true) + ' ' + lsTime(mtOf(e.n)) + ' ' + entryName(e.n, e.name);
        if (e.n.t === 'l') line += ' -> ' + e.n.target;
        return line;
      });
      return rows.join('\n') + (rows.length ? '\n' : '');
    }
    rows = list.map(function (e) { return (f.i ? ino(e.n) + ' ' : '') + entryName(e.n, e.name); });
    if (f['1'] || f.i || c.piped) return rows.join('\n') + (rows.length ? '\n' : '');
    return rows.join('  ') + (rows.length ? '\n' : '');
  }
  function sortList(list) {
    var key = function (e) { return e.name.replace(/^\./, '').toLowerCase(); };
    list.sort(function (x, y) {
      if (f.S) { var d = sizeOfNode(sh, y.full, y.n) - sizeOfNode(sh, x.full, x.n); if (d) return d; }
      else if (f.t) { var d2 = mtOf(y.n) - mtOf(x.n); if (d2) return d2; }
      var kx = key(x), ky = key(y); return kx < ky ? -1 : kx > ky ? 1 : (x.name < y.name ? -1 : 1);
    });
    if (f.r) list.reverse();
    return list;
  }
  function totalOf(list) {
    var t = 0; list.forEach(function (e) { var s = sizeOfNode(sh, e.full, e.n); if (e.n.t === 'd') t += 4; else if (e.n.t === 'f' && s > 0) t += Math.ceil(s / 4096) * 4; }); return t;
  }
  function listDir(dirReal, shown) {
    if (!sh.canRead(dirReal, c)) { c.err("ls: cannot open directory '" + shown + "': Permission denied\n"); rc = 2; return; }
    var names = sh.fs.list(dirReal), list = [];
    if (f.a) names = ['.', '..'].concat(names); else if (!f.A) names = names.filter(function (x) { return x.charAt(0) !== '.'; });
    names.forEach(function (nm) {
      var fp = nm === '.' ? dirReal : nm === '..' ? sh.fs.parent(dirReal) : (dirReal === '/' ? '' : dirReal) + '/' + nm;
      var nn = sh.fs.get(fp, true) || { t: 'd', mode: 493, owner: 'root' };
      list.push({ name: nm, full: fp, n: nn });
    });
    sortList(list);
    if (multi) { c.out((firstOut ? '' : '\n') + shown + ':\n'); }
    firstOut = false;
    if (long) c.out('total ' + totalOf(list) + '\n');
    c.out(render(list));
    if (f.R) list.forEach(function (e) { if (e.n.t === 'd' && e.name !== '.' && e.name !== '..') listDir(e.full, (shown === '.' ? '.' : shown.replace(/\/$/, '')) + '/' + e.name); });
  }
  var fileEntries = [], dirs = [];
  paths.forEach(function (p) {
    var full = sh.abs(p), n = sh.fs.get(full, true), tn = sh.fs.get(full);
    if (!n) { c.err("ls: cannot access '" + p + "': No such file or directory\n"); rc = 2; return; }
    if (tn && tn.t === 'd' && !f.d && !(long && n.t === 'l')) dirs.push({ p: p, real: sh.fs.real(full) });
    else fileEntries.push({ name: p, full: full, n: n });
  });
  if (fileEntries.length) { sortList(fileEntries); c.out(render(fileEntries)); firstOut = false; }
  dirs.sort(function (x, y) { return x.p < y.p ? -1 : 1; });
  dirs.forEach(function (d) { if (fileEntries.length && firstOut === false && !multi) multi = true; listDir(d.real, d.p); });
  return rc;
};

/* ---------- stat ---------- */
cmds.stat = function (a, c) {
  var sh = c.sh, fmt = null, files = [], i, rc = 0, deref = false;
  for (i = 0; i < a.length; i++) {
    if (a[i] === '-c' || a[i] === '--format') fmt = a[++i]; else if (/^--format=/.test(a[i])) fmt = a[i].slice(9); else if (a[i] === '-L') deref = true; else if (a[i].charAt(0) !== '-') files.push(a[i]);
  }
  files.forEach(function (f) {
    var p = sh.abs(f), n = sh.fs.get(p, !deref);
    if (!n) { c.err("stat: cannot statx '" + f + "': No such file or directory\n"); rc = 1; return; }
    var oct = ('000' + (n.mode & 4095).toString(8)).slice(-4).replace(/^0(\d{3})$/, '$1'); if (oct.length < 3) oct = ('000' + oct).slice(-3);
    var ms = U.modeString(n), sz = sizeOfNode(sh, p, n), grp = n.group || n.owner, uid = n.owner === 'root' ? 0 : 1000;
    var ftype = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link' : (sz === 0 ? 'regular empty file' : 'regular file');
    if (fmt) {
      c.out(fmt.replace(/%([aAUGnsFhiyYuNgdxXzZ%])/g, function (m, k) {
        switch (k) {
          case 'a': return oct; case 'A': return ms; case 'U': return n.owner; case 'G': return grp; case 'n': return f; case 's': return String(sz); case 'F': return ftype;
          case 'h': return String(nlinkOf(sh, p, n)); case 'i': return String(ino(n)); case 'u': return String(uid); case 'g': return String(uid);
          case 'y': case 'x': case 'z': return fullTime(mtOf(n)); case 'Y': case 'X': case 'Z': return String(Math.floor(mtOf(n) / 1000));
          case 'N': return n.t === 'l' ? "'" + f + "' -> '" + n.target + "'" : "'" + f + "'"; case '%': return '%'; default: return m;
        }
      }) + '\n');
      return;
    }
    c.out('  File: ' + f + (n.t === 'l' ? ' -> ' + n.target : '') + '\n  Size: ' + pad(sz, 10) + '\tBlocks: ' + pad(Math.ceil(sz / 512) + (sz > 0 ? 7 - ((Math.ceil(sz / 512) + 7) % 8) : 0), 10) + ' IO Block: 4096   ' + ftype + '\n' +
      'Device: 801h/2049d\tInode: ' + pad(ino(n), 10) + '  Links: ' + nlinkOf(sh, p, n) + '\n' +
      'Access: (' + oct.replace(/^(\d{3})$/, '0$1') + '/' + ms + ')  Uid: (' + pad(uid, 5, true) + '/' + pad(n.owner, 8, true) + ')   Gid: (' + pad(uid, 5, true) + '/' + pad(grp, 8, true) + ')\n' +
      'Access: ' + fullTime(mtOf(n)) + '\nModify: ' + fullTime(mtOf(n)) + '\nChange: ' + fullTime(mtOf(n)) + '\n Birth: ' + fullTime(mtOf(n)) + '\n');
  });
  return rc;
};

/* ---------- find ---------- */
function globRe(pat, ci, full) {
  var re = '', i, ch;
  for (i = 0; i < pat.length; i++) {
    ch = pat.charAt(i);
    if (ch === '*') re += full ? '.*' : '.*'; else if (ch === '?') re += '.';
    else if (ch === '[') { var j = pat.indexOf(']', i + 1); if (j < 0) re += '\\['; else { re += '[' + pat.slice(i + 1, j).replace(/^!/, '^') + ']'; i = j; } }
    else if (ch === '\\' && i + 1 < pat.length) { re += pat.charAt(++i).replace(/[.+^${}()|\\\[\]*?]/g, '\\$&'); }
    else re += ch.replace(/[.+^${}()|\\\]]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', ci ? 'i' : '');
}
function numCmp(spec, val) {
  var m = /^([+-]?)(\d+)$/.exec(spec); if (!m) return null;
  var n = +m[2]; return m[1] === '+' ? val > n : m[1] === '-' ? val < n : val === n;
}
var prevFind = cmds.find;
cmds.find = function (a, c) {
  var sh = c.sh, i = 0, starts = [], rc = 0, maxd = Infinity, mind = 0, depthFirst = false;
  a = a.filter(function (x) { return x !== '-xdev' && x !== '-mount' && x !== '-L' && x !== '-H' && x !== '-P'; });
  while (i < a.length && a[i].charAt(0) !== '-' && a[i] !== '!' && a[i] !== '(') starts.push(a[i++]);
  if (!starts.length) starts = ['.'];
  for (var q = 0; q < starts.length; q++) { var vn = sh.fs.get(sh.abs(starts[q]), true); if (vn && vn.virt) return prevFind(a, c); }
  var toks = a.slice(i), ti = 0, execBatches = [], hasAction = false, pruneNow = false;
  function fail(msg) { throw new CmdErr(msg, 1); }
  function arg(name) { if (ti >= toks.length) fail("find: missing argument to `" + name + "'"); return toks[ti++]; }
  function parseOr() { var l = [parseAnd()]; while (toks[ti] === '-o' || toks[ti] === '-or') { ti++; l.push(parseAnd()); } return l.length === 1 ? l[0] : function (e) { for (var k = 0; k < l.length; k++) if (l[k](e)) return true; return false; }; }
  function parseAnd() {
    var l = [parseNot()];
    while (ti < toks.length && toks[ti] !== '-o' && toks[ti] !== '-or' && toks[ti] !== ')') { if (toks[ti] === '-a' || toks[ti] === '-and') ti++; l.push(parseNot()); }
    return l.length === 1 ? l[0] : function (e) { for (var k = 0; k < l.length; k++) if (!l[k](e)) return false; return true; };
  }
  function parseNot() {
    if (toks[ti] === '!' || toks[ti] === '-not') { ti++; var f = parseNot(); return function (e) { return !f(e); }; }
    return parsePrimary();
  }
  function parsePrimary() {
    var t = toks[ti++], v;
    if (t === '(') { var f = parseOr(); if (toks[ti] !== ')') fail("find: unmatched ( or ["); ti++; return f; }
    switch (t) {
      case '-maxdepth': v = arg(t); maxd = parseInt(v, 10); return function () { return true; };
      case '-mindepth': v = arg(t); mind = parseInt(v, 10); return function () { return true; };
      case '-depth': depthFirst = true; return function () { return true; };
      case '-name': case '-iname': { var re = globRe(arg(t), t === '-iname'); return function (e) { return re.test(e.name); }; }
      case '-path': case '-ipath': case '-wholename': { var rp = globRe(arg(t), t === '-ipath'); return function (e) { return rp.test(e.shown); }; }
      case '-regex': { var rr = new RegExp('^(?:' + arg(t) + ')$'); return function (e) { return rr.test(e.shown); }; }
      case '-type': { v = arg(t); return function (e) { var k = e.n.t === 'd' ? 'd' : e.n.t === 'l' ? 'l' : 'f'; return v.split(',').indexOf(k) >= 0; }; }
      case '-size': {
        v = arg(t); var m = /^([+-]?)(\d+)([cwbkMG]?)$/.exec(v); if (!m) fail("find: Invalid argument `" + v + "' to -size");
        var unit = { c: 1, w: 2, b: 512, k: 1024, M: 1048576, G: 1073741824, '': 512 }[m[3]];
        return function (e) { var sz = sizeOfNode(sh, e.full, e.n), u = Math.ceil(sz / unit); return numCmp(m[1] + m[2], u); };
      }
      case '-empty': return function (e) { return e.n.t === 'd' ? sh.fs.list(sh.fs.real(e.full)).length === 0 : (e.n.t === 'f' && sizeOfNode(sh, e.full, e.n) === 0); };
      case '-mtime': case '-atime': case '-ctime': { v = arg(t); if (!/^[+-]?\d+$/.test(v)) fail("find: Invalid argument `" + v + "' to " + t); return function (e) { return numCmp(v, Math.floor((NOW_MS - mtOf(e.n)) / 86400000)); }; }
      case '-mmin': case '-amin': case '-cmin': { v = arg(t); if (!/^[+-]?\d+$/.test(v)) fail("find: Invalid argument `" + v + "' to " + t); return function (e) { return numCmp(v, Math.ceil((NOW_MS - mtOf(e.n)) / 60000)); }; }
      case '-newer': { v = arg(t); var rn = sh.fs.get(sh.abs(v)); if (!rn) fail("find: ‘" + v + "’: No such file or directory"); var rm = mtOf(rn); return function (e) { return mtOf(e.n) > rm; }; }
      case '-user': { v = arg(t); return function (e) { return e.n.owner === v; }; }
      case '-group': { v = arg(t); return function (e) { return (e.n.group || e.n.owner) === v; }; }
      case '-perm': {
        v = arg(t); var kind = '', ms = v; if (v.charAt(0) === '-' || v.charAt(0) === '/') { kind = v.charAt(0); ms = v.slice(1); }
        var bits;
        if (/^[0-7]+$/.test(ms)) bits = parseInt(ms, 8);
        else { var sm = /^([ugoa]*)([+=-])([rwxst]+)$/.exec(ms); if (!sm) fail("find: Invalid mode ‘" + v + "’"); var w = sm[1] || 'a', b = 0; if (/r/.test(sm[3])) b |= 4; if (/w/.test(sm[3])) b |= 2; if (/x/.test(sm[3])) b |= 1; bits = 0; if (/u|a/.test(w)) bits |= b << 6; if (/g|a/.test(w)) bits |= b << 3; if (/o|a/.test(w)) bits |= b; if (/s/.test(sm[3])) { if (/u|a/.test(w)) bits |= 2048; if (/g|a/.test(w)) bits |= 1024; } if (/t/.test(sm[3])) bits |= 512; }
        return function (e) { var m = e.n.mode & 4095; return kind === '-' ? (m & bits) === bits : kind === '/' ? (bits === 0 || (m & bits) !== 0) : m === bits; };
      }
      case '-executable': return function (e) { return !!(e.n.mode & 73); };
      case '-readable': return function () { return true; };
      case '-writable': return function (e) { return !!(e.n.mode & 146); };
      case '-true': return function () { return true; };
      case '-false': return function () { return false; };
      case '-prune': return function () { pruneNow = true; return true; };
      case '-print': hasAction = true; return function (e) { c.out(e.shown + '\n'); return true; };
      case '-print0': hasAction = true; return function (e) { c.out(e.shown + '\0'); return true; };
      case '-printf': { hasAction = true; var pf = arg(t).replace(/\\n/g, '\n').replace(/\\t/g, '\t'); return function (e) { c.out(pf.replace(/%([pfsumgyhM])/g, function (m, k) { return k === 'p' ? e.shown : k === 'f' ? e.name : k === 's' ? String(sizeOfNode(sh, e.full, e.n)) : k === 'u' ? e.n.owner : k === 'g' ? (e.n.group || e.n.owner) : k === 'm' ? (e.n.mode & 4095).toString(8) : k === 'M' ? U.modeString(e.n) : k === 'h' ? e.shown.replace(/\/[^\/]*$/, '') || '.' : (e.n.t === 'd' ? 'd' : e.n.t === 'l' ? 'l' : 'f'); })); return true; }; }
      case '-ls': hasAction = true; return function (e) { c.out(pad(ino(e.n), 8, true) + ' ' + pad(Math.ceil(sizeOfNode(sh, e.full, e.n) / 1024), 4, true) + ' ' + U.modeString(e.n) + ' ' + pad(nlinkOf(sh, e.full, e.n), 2, true) + ' ' + pad(e.n.owner, 8) + ' ' + pad(e.n.group || e.n.owner, 8) + ' ' + pad(sizeOfNode(sh, e.full, e.n), 8, true) + ' ' + lsTime(mtOf(e.n)) + ' ' + e.shown + '\n'); return true; };
      case '-delete': hasAction = true; depthFirst = true; return function (e) {
        if (e.n.t === 'd' && sh.fs.list(sh.fs.real(e.full)).length) { c.err("find: cannot delete ‘" + e.shown + "’: Directory not empty\n"); rc = 1; return false; }
        if (!sh.canWrite(e.full, c)) { c.err("find: cannot delete ‘" + e.shown + "’: Permission denied\n"); rc = 1; return false; }
        sh.fs.rm(e.full); return true;
      };
      case '-exec': case '-ok': {
        hasAction = true; var cmdw = [];
        while (ti < toks.length && toks[ti] !== ';' && !(toks[ti] === '+' && cmdw[cmdw.length - 1] === '{}')) cmdw.push(toks[ti++]);
        if (ti >= toks.length) fail("find: missing argument to `-exec'");
        var batch = toks[ti++] === '+';
        if (batch) { var b = { cmd: cmdw.slice(0, -1), files: [] }; execBatches.push(b); return function (e) { b.files.push(e.shown); return true; }; }
        return function (e) {
          var argv = cmdw.map(function (w) { return w.replace(/\{\}/g, e.shown); });
          var r = sh.call(argv, c, {}); return r === 0;
        };
      }
      default:
        if (t.charAt(0) !== '-') fail("find: paths must precede expression: `" + t + "'\nfind: possible unquoted pattern after predicate `" + (toks[ti - 3] || '-name') + "'?");
        fail("find: unknown predicate `" + t + "'");
    }
  }
  var expr = toks.length ? parseOr() : function () { return true; };
  if (ti < toks.length) fail("find: paths must precede expression: `" + toks[ti] + "'");
  var finalExpr = expr;
  if (!hasAction) finalExpr = function (e) { if (expr(e)) { c.out(e.shown + '\n'); return true; } return false; };
  function walk(full, shown, depth, name) {
    var n = sh.fs.get(full, true); if (!n) return;
    var e = { full: full, shown: shown, n: n, name: name };
    var isDir = n.t === 'd', kids = [];
    pruneNow = false;
    if (!depthFirst && depth >= mind && depth <= maxd) finalExpr(e);
    var pr = pruneNow;
    if (isDir && depth < maxd && !pr) {
      if (!sh.canRead(full, c)) { c.err("find: ‘" + shown + "’: Permission denied\n"); rc = 1; }
      else sh.fs.list(full).forEach(function (nm) { walk((full === '/' ? '' : full) + '/' + nm, (shown === '/' ? '' : shown) + '/' + nm, depth + 1, nm); });
    }
    if (depthFirst && depth >= mind && depth <= maxd) finalExpr(e);
  }
  starts.forEach(function (st) {
    var full = sh.abs(st);
    if (!sh.fs.get(full, true)) { c.err("find: ‘" + st + "’: No such file or directory\n"); rc = 1; return; }
    var shown = st.length > 1 ? st.replace(/\/+$/, '') : st;
    walk(full, shown, 0, shown.split('/').pop() || '/');
  });
  execBatches.forEach(function (b) { if (b.files.length) { var r = sh.call(b.cmd.concat(b.files), c, {}); if (r) rc = r; } });
  return rc;
};

/* ---------- locate / updatedb / whereis ---------- */
function plocateOk(sh) { var S = sh.W && sh.W.lin2; return !S || !!(S.pkgs && S.pkgs.plocate); }
function snapshot(sh) { sh.W.locDb = Object.keys(sh.fs.n).filter(function (k) { return k !== '/' && k.indexOf('/proc/') !== 0 && k.indexOf('/__r/') !== 0; }).sort(); }
V.base.locateSnap = snapshot;
if (V.lin2 && V.lin2.REPO) V.lin2.REPO.plocate = { ver: '1.1.19-1build1', kb: 130, desc: 'quick file search using an index (locate/updatedb)' };
cmds.locate = function (a, c) {
  var sh = c.sh;
  if (!plocateOk(sh)) { c.err("Command 'locate' not found, but can be installed with:\nsudo apt install plocate\n"); return 127; }
  var ci = false, count = false, lim = Infinity, pats = [], i;
  for (i = 0; i < a.length; i++) { if (a[i] === '-i') ci = true; else if (a[i] === '-c') count = true; else if (a[i] === '-n') lim = parseInt(a[++i], 10); else if (a[i].charAt(0) !== '-') pats.push(a[i]); }
  if (!pats.length) throw new CmdErr('locate: no pattern to search for specified', 1);
  if (!sh.W.locDb) snapshot(sh);
  var hits = sh.W.locDb.filter(function (p) {
    return pats.every(function (pt) {
      if (/[*?\[]/.test(pt)) return globRe(pt, ci).test(p);
      return ci ? p.toLowerCase().indexOf(pt.toLowerCase()) >= 0 : p.indexOf(pt) >= 0;
    });
  }).filter(function (p) { return sh.canRead(sh.fs.parent(p), c); });
  if (count) { c.out(hits.length + '\n'); return hits.length ? 0 : 1; }
  hits.slice(0, lim).forEach(function (p) { c.out(p + '\n'); });
  return hits.length ? 0 : 1;
};
cmds.updatedb = function (a, c) {
  var sh = c.sh;
  if (!plocateOk(sh)) { c.err("Command 'updatedb' not found, but can be installed with:\nsudo apt install plocate\n"); return 127; }
  if (!sh.isRoot(c)) { c.err("updatedb: can not open a temporary file for `/var/lib/plocate/plocate.db'\n"); return 1; }
  snapshot(sh); return 0;
};
cmds.whereis = function (a, c) {
  a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (nm) {
    if (cmds[nm] && !B[nm]) c.out(nm + ': /usr/bin/' + nm + ' /usr/share/man/man1/' + nm + '.1.gz\n');
    else if (B[nm]) c.out(nm + ': /usr/share/man/man1/' + nm + '.1.gz\n');
    else c.out(nm + ':\n');
  });
  return 0;
};

/* ---------- flock ---------- */
cmds.flock = function (a, c) {
  var sh = c.sh, nb = false, rest = [], i;
  for (i = 0; i < a.length; i++) { if (a[i] === '-n' || a[i] === '--nonblock') nb = true; else if (a[i] === '-x' || a[i] === '-e') continue; else rest.push(a[i]); }
  if (rest.length < 2) throw new CmdErr('flock: usage: flock [options] <file>|<directory> <command> [<args>]', 64);
  var lf = sh.abs(rest[0]), n = sh.fs.get(lf);
  if (n && n.held) { if (nb) return 1; c.err('flock: (mô phỏng) đang chờ khoá...\n'); return 1; }
  if (!n) sh.fs.put(lf, '', { owner: sh.user, mode: 420 });
  return sh.call(rest.slice(1), c, {});
};

/* ---------- exec N>file, flock -n N, logger, date -d ---------- */
B.exec = function (a, c) { if (a.length) return c.sh.call(a, c, {}); return 0; };
var prevFlock = cmds.flock;
cmds.flock = function (a, c) {
  var sh = c.sh, rest = a.filter(function (x) { return x.charAt(0) !== '-'; });
  if (rest.length === 1 && /^\d+$/.test(rest[0])) {
    var fp = sh.fds && sh.fds[+rest[0]];
    if (!fp) throw new CmdErr('flock: ' + rest[0] + ': Bad file descriptor', 1);
    var n = sh.fs.get(fp);
    if (n.held) { if (a.indexOf('-n') >= 0) return 1; c.err('flock: (mô phỏng) đang chờ khoá...\n'); return 1; }
    n.held = true; sh.fdLocks = sh.fdLocks || []; sh.fdLocks.push(fp); return 0;
  }
  return prevFlock(a, c);
};
var prevRST = SP.runScriptText;
SP.runScriptText = function (text, name, args, opts) {
  if (opts && opts.source) return prevRST.apply(this, arguments);
  var sf = this.fds, sl = this.fdLocks; this.fds = {}; this.fdLocks = [];
  try { return prevRST.apply(this, arguments); }
  finally {
    var self = this; (this.fdLocks || []).forEach(function (fp) { var n = self.fs.get(fp); if (n) n.held = false; });
    this.fds = sf; this.fdLocks = sl;
  }
};
cmds.logger = function (a, c) {
  var tag = 'claude', msg = [], i;
  for (i = 0; i < a.length; i++) { if (a[i] === '-t') { tag = a[++i]; } else if (a[i] === '-p') i++; else if (a[i].charAt(0) !== '-') msg.push(a[i]); }
  V.lin.syslog(c.sh, tag + '[' + (3000 + Math.floor(Math.random() * 900)) + ']: ' + msg.join(' '));
  return 0;
};
var prevDate2 = cmds.date;
cmds.date = function (a, c) {
  var di = a.indexOf('-d'); if (di < 0) { var dd = a.filter(function (x) { return x.indexOf('--date=') === 0; })[0]; if (dd) { a = a.filter(function (x) { return x !== dd; }).concat(['-d', dd.slice(7)]); di = a.indexOf('-d'); } }
  if (di < 0) return prevDate2(a, c);
  var ms = parseDate(a[di + 1]);
  if (ms == null) throw new CmdErr("date: invalid date '" + a[di + 1] + "'", 1);
  var f = a.filter(function (x) { return x.charAt(0) === '+'; })[0];
  var utc = a.indexOf('-u') >= 0, d = new Date(ms + (utc ? 0 : TZ));
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), se = d.getUTCSeconds(), wd = d.getUTCDay();
  if (!f) { c.out(DN[wd] + ' ' + MON[Mo] + ' ' + D + ' ' + z2(h) + ':' + z2(mi) + ':' + z2(se) + (utc ? ' UTC ' : ' +07 ') + Y + '\n'); return 0; }
  c.out(f.slice(1).replace(/%([a-zA-Z%])/g, function (m, k) {
    switch (k) {
      case 'F': return Y + '-' + z2(Mo + 1) + '-' + z2(D); case 'Y': return String(Y); case 'y': return String(Y).slice(2);
      case 'm': return z2(Mo + 1); case 'd': return z2(D); case 'e': return (D < 10 ? ' ' : '') + D;
      case 'H': return z2(h); case 'M': return z2(mi); case 'S': return z2(se); case 'T': return z2(h) + ':' + z2(mi) + ':' + z2(se);
      case 's': return String(Math.floor(ms / 1000)); case 'a': return DN[wd]; case 'b': return MON[Mo]; case 'u': return String(wd || 7); case 'w': return String(wd); case '%': return '%';
    }
    return m;
  }) + '\n'); return 0;
};

/* ---------- grep: tùy chọn dài, zgrep ---------- */
var GLONG = { '--count': '-c', '--ignore-case': '-i', '--invert-match': '-v', '--line-number': '-n', '--only-matching': '-o', '--word-regexp': '-w', '--line-regexp': '-x', '--files-with-matches': '-l', '--files-without-match': '-L', '--recursive': '-r', '--dereference-recursive': '-R', '--quiet': '-q', '--silent': '-q', '--no-filename': '-h', '--with-filename': '-H', '--extended-regexp': '-E', '--fixed-strings': '-F', '--perl-regexp': '-P', '--no-messages': '-s', '--text': '-a', '--basic-regexp': '-G' };
function grepLong(a) {
  var out = [];
  a.forEach(function (x) {
    var m;
    if (GLONG[x]) out.push(GLONG[x]);
    else if ((m = /^--max-count=(.*)$/.exec(x))) out.push('-m', m[1]);
    else if ((m = /^--regexp=(.*)$/.exec(x))) out.push('-e', m[1]);
    else if ((m = /^--file=(.*)$/.exec(x))) out.push('-f', m[1]);
    else if ((m = /^--binary-files=without-match$/.exec(x))) out.push('-I');
    else out.push(x);
  });
  return out;
}
var prevGrepB = cmds.grep;
cmds.grep = function (a, c) { return prevGrepB(grepLong(a), c); };
cmds.zgrep = function (a, c) {
  var opts = [], rest = [], i, rc = 1, any = false;
  a = grepLong(a);
  for (i = 0; i < a.length; i++) {
    if (a[i] === '-e' || a[i] === '-f' || a[i] === '-m' || a[i] === '-A' || a[i] === '-B' || a[i] === '-C') { opts.push(a[i], a[++i]); any = any || a[i - 1] === '-e'; }
    else if (a[i].charAt(0) === '-' && a[i].length > 1) opts.push(a[i]); else rest.push(a[i]);
  }
  var pat = any ? null : rest.shift(), files = rest, multi = files.length > 1;
  if (!files.length) return prevGrepB(opts.concat(pat == null ? [] : [pat]), c);
  files.forEach(function (f) {
    var buf = '', cc = Object.assign({}, c, { out: function (t) { buf += t; }, err: c.err });
    var gz = (c.sh.W && c.sh.W.lin2 && c.sh.W.lin2.gz) || null, txt;
    var n = c.sh.fs.get(c.sh.abs(f));
    if (!n) { c.err('zgrep: ' + f + ': No such file or directory\n'); rc = 2; return; }
    if (/\.gz$/.test(f)) { cmds.zcat([f], cc); txt = buf; } else txt = String(n.c || '');
    var gout = '', gc = Object.assign({}, c, { stdin: txt, out: function (t) { gout += t; } });
    var r = prevGrepB(opts.concat(pat == null ? [] : [pat]), gc);
    var lmode = opts.some(function (o) { return /^-[a-zA-Z]*[lL]/.test(o); });
    if (gout && lmode) { gout = gout.replace(/^\(standard input\)/gm, f); c.out(gout); }
    else if (gout) { if (multi) gout = gout.replace(/^(?=.)/gm, f + ':'); c.out(gout); }
    if (r === 0) rc = 0; else if (r > 1) rc = r;
  });
  return rc;
};

/* ---------- pushd / popd / dirs / time / fg / bg ---------- */
function tilde(sh, p) { return p === sh.home ? '~' : p.indexOf(sh.home + '/') === 0 ? '~' + p.slice(sh.home.length) : p; }
function stackLine(sh) { return [sh.cwd].concat(sh.dstack || []).map(function (p) { return tilde(sh, p); }).join(' ') + '\n'; }
B.pushd = function (a, c) {
  var sh = c.sh, t = a[0]; if (!t) throw new CmdErr('bash: pushd: no other directory', 1);
  var p = sh.abs(t); if (!sh.fs.isD(p)) throw new CmdErr('bash: pushd: ' + t + ': No such file or directory', 1);
  sh.dstack = sh.dstack || []; sh.dstack.unshift(sh.cwd); sh.oldpwd = sh.cwd; sh.cwd = p; c.out(stackLine(sh)); return 0;
};
B.popd = function (a, c) {
  var sh = c.sh; if (!sh.dstack || !sh.dstack.length) throw new CmdErr('bash: popd: directory stack empty', 1);
  sh.oldpwd = sh.cwd; sh.cwd = sh.dstack.shift(); c.out(stackLine(sh)); return 0;
};
B.dirs = function (a, c) { c.out(stackLine(c.sh)); return 0; };
function jobProc(sh, spec) {
  var l = sh.W && sh.W.lin; if (!l) return null;
  var js = l.procs.filter(function (p) { return p.job && p.session === sh.user && !p.nohup; });
  if (spec) { var m = /^%?(\d+)$/.exec(spec); return m ? (js.filter(function (p) { return p.job === +m[1]; })[0] || null) : null; }
  return js.length ? js[js.length - 1] : null;
}
B.fg = function (a, c) {
  var sh = c.sh, p = jobProc(sh, a[0]);
  if (!p) throw new CmdErr('bash: fg: ' + (a[0] ? a[0] + ': no such job' : 'current: no such job'), 1);
  c.out(p.cmd + '\n'); sh.call(['kill', '-TERM', String(p.pid)], { out: function () {}, err: function () {}, sh: sh, stdin: '' }, {}); return 0;
};
B.bg = function (a, c) {
  var sh = c.sh, p = jobProc(sh, a[0]);
  if (!p) throw new CmdErr('bash: bg: ' + (a[0] ? a[0] + ': no such job' : 'current: no such job'), 1);
  if (p.stat === 'T') p.stat = 'S'; c.out('[' + p.job + ']+ ' + p.cmd + ' &\n'); return 0;
};
var prevRun = SP.run;
SP.run = function (text) { if (this.W && !this.W.locDb) snapshot(this); return prevRun.call(this, text); };
var prevDispatch = SP.dispatch;
SP.dispatch = function (argv, ctx, top) {
  var name = argv[0];
  if (name === 'time' && argv.length > 1) {
    var code = this.dispatch(argv.slice(1), ctx, false);
    ctx.err('\nreal\t0m0.004s\nuser\t0m0.002s\nsys\t0m0.002s\n'); return code;
  }
  if (name && name.indexOf('/') < 0 && !B[name] && !cmds[name] && !(this.funcs && this.funcs[name]) && !(this.aliases && this.aliases[name] != null)) {
    var pp = findInPath(this, name); if (pp) argv = [pp].concat(argv.slice(1));
  }
  if (this.aliases && Object.prototype.hasOwnProperty.call(this.aliases, name) && !(top && name === 'alias')) {
    var words = String(this.aliases[name]).replace(/^(['"])(.*)\1$/, '$2').split(/\s+/).filter(Boolean);
    if (words.length) argv = words.concat(argv.slice(1));
  }
  return prevDispatch.call(this, argv, ctx, top);
};
B.alias = function (a, c) {
  var sh = c.sh;
  if (!a.length) { Object.keys(sh.aliases).sort().forEach(function (k) { c.out("alias " + k + "='" + sh.aliases[k] + "'\n"); }); return 0; }
  var rc = 0;
  a.forEach(function (x) {
    var m = /^([^=\s]+)=(.*)$/.exec(x);
    if (m) sh.aliases[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    else if (sh.aliases[x] != null) c.out("alias " + x + "='" + sh.aliases[x] + "'\n");
    else { c.err('bash: alias: ' + x + ': not found\n'); rc = 1; }
  });
  return rc;
};
B.unalias = function (a, c) { var rc = 0; a.forEach(function (x) { if (x === '-a') c.sh.aliases = {}; else if (c.sh.aliases[x] != null) delete c.sh.aliases[x]; else { c.err('bash: unalias: ' + x + ': not found\n'); rc = 1; } }); return rc; };

/* ---------- dữ liệu /proc mẫu ---------- */
V.base.seedProc = function (s) {
  var f = s.fs, o = { owner: 'root', mode: 292 };
  f.put('/proc/cpuinfo', 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) Platinum 8272CL CPU @ 2.60GHz\ncpu MHz\t\t: 2593.906\ncache size\t: 36608 KB\n\nprocessor\t: 1\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) Platinum 8272CL CPU @ 2.60GHz\ncpu MHz\t\t: 2593.906\ncache size\t: 36608 KB\n', o);
  f.put('/proc/meminfo', 'MemTotal:        2007492 kB\nMemFree:          661200 kB\nMemAvailable:    1259800 kB\nBuffers:           81220 kB\nCached:           573100 kB\nSwapTotal:             0 kB\nSwapFree:              0 kB\n', o);
  f.put('/proc/loadavg', '0.12 0.13 0.12 1/112 4242\n', o);
  f.put('/proc/uptime', '184440.12 366001.55\n', o);
  f.put('/proc/version', 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-103) #45-Ubuntu SMP PREEMPT_DYNAMIC\n', o);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
