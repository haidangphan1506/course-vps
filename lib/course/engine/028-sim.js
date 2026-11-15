(function (G) {
'use strict';
/* Bổ sung cho chương công cụ text: printf đầy đủ, wc, diff (normal/-u/-q/-r), cmp, xargs, find -print0, file, yes, bc, tee /dev/stderr. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr;
function lns(s) { if (s === '' || s == null) return []; var l = String(s).split('\n'); if (l[l.length - 1] === '') l.pop(); return l; }
function padL(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

/* ---------- printf ---------- */
function escapes(s, inFmt) {
  return s.replace(/\\(?:([abfnrtv\\"e'])|x([0-9a-fA-F]{1,2})|(0[0-7]{0,3}|[1-7][0-7]{0,2})|c|(.))/g, function (m, c1, hx, oct, other) {
    if (c1) return { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', e: '\x1b', "'": "'" }[c1];
    if (hx) return String.fromCharCode(parseInt(hx, 16));
    if (oct != null) return String.fromCharCode(parseInt(oct, 8));
    if (m === '\\c') return '';
    return '\\' + (other || '');
  });
}
function printfStr(fmt, args, errs) {
  var f = escapes(fmt, true), out = '', ai = 0, used;
  var re = /%([-+ 0#']*)(\*|\d+)?(?:\.(\*|\d*))?([diouxXeEfFgGcsbq%])/g;
  do {
    used = false; var pos = 0, m;
    re.lastIndex = 0; out_loop: for (;;) {
      m = re.exec(f);
      if (!m) { out += f.slice(pos); break; }
      out += f.slice(pos, m.index); pos = m.index + m[0].length;
      var fl = m[1], w = m[2], pr = m[3], ty = m[4];
      if (ty === '%') { out += '%'; continue; }
      if (w === '*') w = String(parseInt(args[ai++], 10) || 0);
      if (pr === '*') pr = String(parseInt(args[ai++], 10) || 0);
      var has = ai < args.length, v = has ? args[ai++] : undefined; if (has) used = true;
      var left = fl.indexOf('-') >= 0, zero = fl.indexOf('0') >= 0 && !left, plus = fl.indexOf('+') >= 0, space = fl.indexOf(' ') >= 0, s;
      if (ty === 's' || ty === 'b' || ty === 'q') {
        s = v === undefined ? '' : String(v); if (ty === 'b') s = escapes(s); if (ty === 'q') s = /^[\w@%+=:,.\/-]*$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'";
        if (pr != null && pr !== '') s = s.slice(0, +pr); zero = false;
      } else if (ty === 'c') { s = v === undefined ? '' : String(v).charAt(0); zero = false; }
      else {
        var raw = v === undefined ? '0' : String(v), nv;
        if (/^['"]./.test(raw)) nv = raw.charCodeAt(1);
        else if (/^[+-]?(0[xX][0-9a-fA-F]+)$/.test(raw)) nv = parseInt(raw, 16);
        else if (/^[+-]?\d*\.?\d+([eE][+-]?\d+)?$|^[+-]?\d+\.$/.test(raw.trim()) && raw.trim() !== '') nv = parseFloat(raw);
        else { if (errs) errs.push('printf: ' + raw + ': invalid number'); nv = 0; }
        var sign = '';
        if (ty === 'd' || ty === 'i') { nv = Math.trunc(nv); s = String(Math.abs(nv)); if (pr != null && pr !== '') s = s.padStart(+pr, '0'); sign = nv < 0 ? '-' : plus ? '+' : space ? ' ' : ''; }
        else if (ty === 'u') s = String(Math.abs(Math.trunc(nv)));
        else if (ty === 'o') s = Math.trunc(nv).toString(8);
        else if (ty === 'x' || ty === 'X') { s = Math.trunc(nv).toString(16); if (ty === 'X') s = s.toUpperCase(); if (fl.indexOf('#') >= 0 && nv) s = (ty === 'x' ? '0x' : '0X') + s; }
        else {
          var a = Math.abs(nv), pp = pr == null ? 6 : (pr === '' ? 0 : +pr);
          if (ty === 'f' || ty === 'F') s = a.toFixed(pp);
          else if (ty === 'e' || ty === 'E') { s = a.toExponential(pp).replace(/e([+-])(\d)$/, 'e$10$2'); if (ty === 'E') s = s.toUpperCase(); }
          else { s = String(Number(a.toPrecision(pp || 1))); if (ty === 'G') s = s.toUpperCase(); }
          sign = nv < 0 ? '-' : plus ? '+' : space ? ' ' : '';
        }
        s = sign + s;
        if (zero && w && s.length < +w) { var sg = /^[+\- ]/.test(s) ? s.charAt(0) : ''; s = sg + s.slice(sg.length).padStart(+w - sg.length, '0'); }
      }
      if (w && s.length < +w) s = left ? s.padEnd(+w, ' ') : s.padStart(+w, ' ');
      out += s;
    }
  } while (used && ai < args.length);
  return out;
}
V.printfStr = printfStr;
cmds.printf = function (a, c) {
  var vname = null, i = 0;
  if (a[0] === '-v') { vname = a[1]; i = 2; }
  if (a[i] === '--') i++;
  if (a[i] == null) throw new CmdErr('printf: usage: printf [-v var] format [arguments]', 2);
  var errs = [], res = printfStr(a[i], a.slice(i + 1), errs);
  if (vname) c.sh.vars[vname] = res; else c.out(res);
  if (errs.length) { errs.forEach(function (e) { c.err(e + '\n'); }); return 1; }
  return 0;
};

/* ---------- wc ---------- */
cmds.wc = function (a, c) {
  var sh = c.sh, f = {}, files = [];
  a.forEach(function (x) { if (/^-[lwcmL]+$/.test(x)) x.slice(1).split('').forEach(function (ch) { f[ch] = true; }); else if (x === '--lines') f.l = true; else if (x === '--words') f.w = true; else if (x === '--bytes') f.c = true; else if (x === '--chars') f.m = true; else if (x.charAt(0) === '-' && x.length > 1) throw new CmdErr("wc: invalid option -- '" + x.slice(1) + "'\nTry 'wc --help' for more information."); else files.push(x); });
  if (!(f.l || f.w || f.c || f.m || f.L)) { f.l = f.w = f.c = true; }
  var rows = [], rc = 0;
  function stat(txt) {
    var lines = (txt.match(/\n/g) || []).length, words = (txt.match(/\S+/g) || []).length, bytes = new TextEncoder().encode(txt).length, chars = Array.from(txt).length, mx = 0;
    txt.split('\n').forEach(function (l) { mx = Math.max(mx, l.length); });
    return { l: lines, w: words, c: bytes, m: chars, L: mx };
  }
  if (!files.length) rows.push({ name: '', s: stat(String(c.stdin || '')), stdin: true });
  else files.forEach(function (p) {
    try {
      var nd = sh.fs.get(sh.abs(p));
      if (nd && nd.t === 'd') { c.err('wc: ' + p + ': Is a directory\n'); rows.push({ name: p, s: { l: 0, w: 0, c: 0, m: 0, L: 0 } }); rc = 1; return; }
      rows.push({ name: p, s: stat(p === '-' ? String(c.stdin || '') : sh.readFile(sh.abs(p), c, 'wc')) });
    } catch (e) { if (e instanceof CmdErr) { c.err(e.msg + '\n'); rc = 1; } else throw e; }
  });
  if (rows.length > 1) { var t = { l: 0, w: 0, c: 0, m: 0, L: 0 }; rows.forEach(function (r) { ['l', 'w', 'c', 'm'].forEach(function (k) { t[k] += r.s[k]; }); t.L = Math.max(t.L, r.s.L); }); rows.push({ name: 'total', s: t }); }
  var cols = ['l', 'w', 'm', 'c', 'L'].filter(function (k) { return f[k]; });
  var width = 0;
  if (cols.length > 1 || rows.length > 1) { var mx = 0; rows.forEach(function (r) { cols.forEach(function (k) { mx = Math.max(mx, r.s[k]); }); }); width = rows[0] && rows[0].stdin ? 7 : String(Math.max(mx, 0)).length; }
  rows.forEach(function (r) { c.out(cols.map(function (k) { return padL(r.s[k], width); }).join(' ') + (r.name ? ' ' + r.name : '') + '\n'); });
  return rc;
};

/* ---------- diff / cmp ---------- */
function fmtTime() { return '2026-10-27 04:20:00.000000000 +0000'; }
function diffOps(A, B, o) {
  var eq = function (x, y) { if (o.i) { x = x.toLowerCase(); y = y.toLowerCase(); } if (o.w) { x = x.replace(/\s+/g, ''); y = y.replace(/\s+/g, ''); } else if (o.b) { x = x.replace(/\s+/g, ' ').replace(/\s+$/, ''); y = y.replace(/\s+/g, ' ').replace(/\s+$/, ''); } return x === y; };
  var n = A.length, m = B.length, d = [], i, j;
  for (i = 0; i <= n; i++) { d[i] = new Array(m + 1).fill(0); }
  for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) d[i][j] = eq(A[i], B[j]) ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  var ops = []; i = 0; j = 0;
  while (i < n && j < m) { if (eq(A[i], B[j])) { ops.push([' ', A[i], i, j]); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) { ops.push(['-', A[i], i, j]); i++; } else { ops.push(['+', B[j], i, j]); j++; } }
  while (i < n) { ops.push(['-', A[i], i, j]); i++; } while (j < m) { ops.push(['+', B[j], i, j]); j++; }
  return ops;
}
function diffText(fa, fb, A, B, o) {
  var ops = diffOps(A, B, o);
  if (!ops.some(function (x) { return x[0] !== ' '; })) return null;
  var out = '';
  if (o.u) {
    var ctx = o.U == null ? 3 : o.U;
    out += '--- ' + fa + '\t' + fmtTime() + '\n+++ ' + fb + '\t' + fmtTime() + '\n';
    var idx = [], k;
    for (k = 0; k < ops.length; k++) if (ops[k][0] !== ' ') idx.push(k);
    var hunks = [], cur = null;
    idx.forEach(function (p) { var s = Math.max(0, p - ctx), e = Math.min(ops.length - 1, p + ctx); if (cur && s <= cur.e + 1) cur.e = e; else { cur = { s: s, e: e }; hunks.push(cur); } });
    hunks.forEach(function (h) {
      var la = 0, lb = 0, sa = null, sb = null, body = '';
      for (var q = h.s; q <= h.e; q++) {
        var op = ops[q];
        if (sa === null) { sa = op[2] + 1; sb = op[3] + 1; }
        if (op[0] === ' ') { la++; lb++; } else if (op[0] === '-') la++; else lb++;
        body += op[0] + op[1] + '\n';
      }
      out += '@@ -' + (la === 0 ? sa - 1 : sa) + (la === 1 ? '' : ',' + la) + ' +' + (lb === 0 ? sb - 1 : sb) + (lb === 1 ? '' : ',' + lb) + ' @@\n' + body;
    });
    return out;
  }
  var kk = 0, la2 = 1, lb2 = 1;
  while (kk < ops.length) {
    if (ops[kk][0] === ' ') { la2++; lb2++; kk++; continue; }
    var dl = [], ad = [], sa2 = la2, sb2 = lb2;
    while (kk < ops.length && ops[kk][0] !== ' ') { if (ops[kk][0] === '-') { dl.push(ops[kk][1]); la2++; } else { ad.push(ops[kk][1]); lb2++; } kk++; }
    var ra = dl.length > 1 ? sa2 + ',' + (sa2 + dl.length - 1) : String(sa2), rb = ad.length > 1 ? sb2 + ',' + (sb2 + ad.length - 1) : String(sb2);
    var opc = dl.length && ad.length ? 'c' : dl.length ? 'd' : 'a';
    out += (opc === 'a' ? (sa2 - 1) : ra) + opc + (opc === 'd' ? (sb2 - 1) : rb) + '\n';
    dl.forEach(function (x) { out += '< ' + x + '\n'; }); if (dl.length && ad.length) out += '---\n'; ad.forEach(function (x) { out += '> ' + x + '\n'; });
  }
  return out;
}
cmds.diff = function (a, c) {
  var sh = c.sh, o = {}, files = [], i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-u') o.u = true; else if (x === '-U') { o.u = true; o.U = parseInt(a[++i], 10); } else if (/^-U\d+$/.test(x)) { o.u = true; o.U = parseInt(x.slice(2), 10); }
    else if (x === '-q' || x === '--brief') o.q = true; else if (x === '-r' || x === '--recursive') o.r = true; else if (x === '-i') o.i = true; else if (x === '-w') o.w = true; else if (x === '-b') o.b = true; else if (x === '-N') o.N = true;
    else if (/^-[uqriwbN]+$/.test(x)) x.slice(1).split('').forEach(function (ch) { o[ch] = true; });
    else if (x.charAt(0) === '-' && x.length > 1) continue;
    else files.push(x);
  }
  if (files.length < 2) throw new CmdErr("diff: missing operand after '" + (files[0] || 'diff') + "'\ndiff: Try 'diff --help' for more information.", 2);
  var rc = 0;
  function rd(p) { var nd = sh.fs.get(sh.abs(p)); if (!nd) return null; return nd; }
  function cmpFiles(pa, pb) {
    var na = pa === '-' ? { t: 'f', c: c.stdin } : rd(pa), nb = pb === '-' ? { t: 'f', c: c.stdin } : rd(pb);
    if (!na || !nb) { c.err('diff: ' + (!na ? pa : pb) + ': No such file or directory\n'); rc = 2; return; }
    var A = lns(pa === '-' ? c.stdin : sh.readFile(sh.abs(pa), c, 'diff')), B = lns(pb === '-' ? c.stdin : sh.readFile(sh.abs(pb), c, 'diff'));
    var same = String(na.c || '') === String(nb.c || '');
    if (o.q) { var dd = diffText(pa, pb, A, B, o); if (dd !== null || !same && !o.i && !o.w && !o.b) { c.out('Files ' + pa + ' and ' + pb + ' differ\n'); rc = rc || 1; } return; }
    var txt = diffText(pa, pb, A, B, o);
    if (txt !== null) { c.out((o.r ? 'diff ' + (o.u ? '-u ' : '') + '-r ' + pa + ' ' + pb + '\n' : '') + txt); rc = rc || 1; }
  }
  var na0 = files[0] === '-' ? null : rd(files[0]), nb0 = files[1] === '-' ? null : rd(files[1]);
  if (na0 && nb0 && na0.t === 'd' && nb0.t === 'd') {
    (function walk(da, db) {
      var la = sh.fs.list(sh.fs.real(sh.abs(da))).sort(), lb = sh.fs.list(sh.fs.real(sh.abs(db))).sort(), all = Array.from(new Set(la.concat(lb))).sort();
      all.forEach(function (nm) {
        var pa = da.replace(/\/$/, '') + '/' + nm, pb = db.replace(/\/$/, '') + '/' + nm, ia = la.indexOf(nm) >= 0, ib = lb.indexOf(nm) >= 0;
        if (ia && !ib) { c.out('Only in ' + da + ': ' + nm + '\n'); rc = rc || 1; return; }
        if (!ia && ib) { c.out('Only in ' + db + ': ' + nm + '\n'); rc = rc || 1; return; }
        var xa = rd(pa), xb = rd(pb);
        if (xa.t === 'd' && xb.t === 'd') { if (o.r) walk(pa, pb); else c.out('Common subdirectories: ' + pa + ' and ' + pb + '\n'); return; }
        if (xa.t === 'd' || xb.t === 'd') { c.out('File ' + pa + ' is a ' + (xa.t === 'd' ? 'directory' : 'regular file') + ' while file ' + pb + ' is a ' + (xb.t === 'd' ? 'directory' : 'regular file') + '\n'); rc = rc || 1; return; }
        cmpFiles(pa, pb);
      });
    })(files[0], files[1]);
    return rc;
  }
  if (na0 && na0.t === 'd' && nb0 && nb0.t === 'f') { cmpFiles(files[0].replace(/\/$/, '') + '/' + files[1].replace(/^.*\//, ''), files[1]); return rc; }
  if (nb0 && nb0.t === 'd' && na0 && na0.t === 'f') { cmpFiles(files[0], files[1].replace(/\/$/, '') + '/' + files[0].replace(/^.*\//, '')); return rc; }
  cmpFiles(files[0], files[1]);
  return rc;
};
cmds.cmp = function (a, c) {
  var sh = c.sh, files = a.filter(function (x) { return x.charAt(0) !== '-'; }), silent = a.indexOf('-s') >= 0;
  if (files.length < 2) throw new CmdErr('cmp: missing operand after ' + (files[0] ? "'" + files[0] + "'" : "'cmp'") + "\ncmp: Try 'cmp --help' for more information.", 2);
  var A = sh.readFile(sh.abs(files[0]), c, 'cmp'), B = sh.readFile(sh.abs(files[1]), c, 'cmp');
  var n = Math.min(A.length, B.length), i, line = 1;
  for (i = 0; i < n; i++) { if (A.charAt(i) !== B.charAt(i)) { if (!silent) c.out(files[0] + ' ' + files[1] + ' differ: byte ' + (i + 1) + ', line ' + line + '\n'); return 1; } if (A.charAt(i) === '\n') line++; }
  if (A.length !== B.length) { if (!silent) c.err('cmp: EOF on ' + (A.length < B.length ? files[0] : files[1]) + ' after byte ' + n + ', line ' + (line - (A.charAt(n - 1) === '\n' ? 0 : 0)) + '\n'); return 1; }
  return 0;
};

/* ---------- xargs ---------- */
cmds.xargs = function (a, c) {
  var n = 0, repl = null, i = 0, noRun = false, nul = false, delim = null, trace = false, maxLines = 0, afile = null, eof = null;
  for (; i < a.length && a[i].charAt(0) === '-' && a[i] !== '-'; i++) {
    var x = a[i];
    if (x === '-n' || x === '--max-args') n = +a[++i]; else if (/^-n\d+$/.test(x)) n = +x.slice(2);
    else if (x === '-I' || x === '-i') repl = x === '-i' ? '{}' : a[++i]; else if (/^-I./.test(x)) repl = x.slice(2); else if (/^--replace(=.*)?$/.test(x)) repl = x.indexOf('=') > 0 ? x.split('=')[1] : '{}';
    else if (x === '-r' || x === '--no-run-if-empty') noRun = true;
    else if (x === '-0' || x === '--null') nul = true;
    else if (x === '-d') delim = a[++i].replace(/\\n/g, '\n').replace(/\\t/g, '\t'); else if (/^-d./.test(x)) delim = x.slice(2);
    else if (x === '-t' || x === '--verbose') trace = true;
    else if (x === '-P' || x === '-s' || x === '-E') { var vv = a[++i]; if (x === '-E') eof = vv; }
    else if (x === '-L') maxLines = +a[++i]; else if (/^-L\d+$/.test(x)) maxLines = +x.slice(2);
    else if (x === '-a') afile = a[++i];
    else if (x === '--') { i++; break; }
    else if (/^-[A-Za-z]/.test(x)) continue;
    else throw new CmdErr("xargs: unrecognized option '" + x + "'\nUsage: xargs [OPTION]... COMMAND [INITIAL-ARGS]...", 1);
  }
  var tmpl = a.slice(i); if (!tmpl.length) tmpl = ['echo'];
  var text = afile ? c.sh.readFile(c.sh.abs(afile), c, 'xargs') : String(c.stdin || '');
  var items;
  if (nul) items = text.split('\0').filter(function (s, k, arr) { return !(s === '' && k === arr.length - 1); });
  else if (delim != null) items = text.split(delim).filter(function (s, k, arr) { return !(s === '' && k === arr.length - 1); });
  else if (repl || maxLines) items = lns(text).map(function (s) { return s.replace(/^\s+/, ''); }).filter(function (s) { return s !== ''; });
  else {
    items = []; var cur = '', inTok = false, q = null, k;
    for (k = 0; k < text.length; k++) {
      var ch = text.charAt(k);
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; inTok = true; continue; }
      if (ch === '\\' && k + 1 < text.length) { cur += text.charAt(++k); inTok = true; continue; }
      if (/\s/.test(ch)) { if (inTok) { items.push(cur); cur = ''; inTok = false; } continue; }
      cur += ch; inTok = true;
    }
    if (q) throw new CmdErr('xargs: unmatched ' + (q === '"' ? 'double' : 'single') + ' quote; by default quotes are special to xargs unless you use the -0 option', 1);
    if (inTok) items.push(cur);
  }
  if (eof != null) { var ei = items.indexOf(eof); if (ei >= 0) items = items.slice(0, ei); }
  var calls = [];
  if (repl) items.forEach(function (it) { calls.push(tmpl.map(function (t) { return t.split(repl).join(it); })); });
  else if (maxLines) { for (var l = 0; l < items.length; l += maxLines) calls.push(tmpl.concat(items.slice(l, l + maxLines))); }
  else if (n) { for (var m = 0; m < items.length; m += n) calls.push(tmpl.concat(items.slice(m, m + n))); }
  else if (items.length) calls.push(tmpl.concat(items));
  if (!items.length && !noRun) calls = [tmpl];
  var st = 0;
  calls.forEach(function (argv) {
    if (trace) c.err(argv.join(' ') + '\n');
    var r = c.sh.call(argv, c, {});
    if (r === 127) { st = 127; } else if (r === 255) st = 124; else if (r && st !== 127) st = 123;
  });
  return st;
};

/* ---------- find -print0 ---------- */
var prevFind = cmds.find;
cmds.find = function (a, c) {
  var k = a.indexOf('-print0');
  if (k < 0) return prevFind(a, c);
  var b = a.slice(); b.splice(k, 1);
  var buf = '', c2 = Object.create(c); c2.out = function (s) { buf += s; };
  var rc = prevFind(b, c2);
  c.out(buf.replace(/\n/g, '\0')); return rc;
};

/* ---------- file, yes, bc, tee ---------- */
cmds.file = function (a, c) {
  var sh = c.sh, brief = a.indexOf('-b') >= 0, mime = a.indexOf('-i') >= 0 || a.indexOf('--mime') >= 0, rc = 0;
  a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) {
    var nd = sh.fs.get(sh.abs(p)), t;
    if (!nd) { c.out((brief ? '' : p + ': ') + "cannot open `" + p + "' (No such file or directory)\n"); rc = 1; return; }
    if (nd.t === 'd') t = mime ? 'inode/directory; charset=binary' : 'directory';
    else {
      var txt = String(nd.c || '');
      if (txt === '') t = mime ? 'inode/x-empty; charset=binary' : 'empty';
      else if (/^ELF/.test(txt)) t = 'ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked';
      else if (/^\x1f\x8b/.test(txt)) t = 'gzip compressed data';
      else {
        var nonAscii = /[^\x00-\x7f]/.test(txt), crlf = /\r\n/.test(txt), sb = /^#!\s*\/(?:usr\/)?(?:bin\/(?:env )?)?(\w+)/.exec(txt);
        if (mime) t = (sb ? 'text/x-shellscript' : 'text/plain') + '; charset=' + (nonAscii ? 'utf-8' : 'us-ascii');
        else {
          var kind = nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text';
          if (sb && /bash/.test(sb[1])) t = 'Bourne-Again shell script, ' + kind + ' executable';
          else if (sb && /^(sh|dash)$/.test(sb[1])) t = 'POSIX shell script, ' + kind + ' executable';
          else if (sb && /python/.test(sb[1])) t = 'Python script, ' + kind + ' executable';
          else if (/^\s*[{\[]/.test(txt) && /[}\]]\s*$/.test(txt) && /\.json$/.test(p)) t = 'JSON text data';
          else t = kind;
          if (crlf) t += ', with CRLF line terminators';
          if (!/\n/.test(txt)) t += ', with no line terminators';
        }
      }
    }
    c.out((brief ? '' : p + ': ') + t + '\n');
  });
  return rc;
};
cmds.yes = function (a, c) { var s = (a.length ? a.join(' ') : 'y') + '\n', o = ''; for (var i = 0; i < 2000; i++) o += s; c.out(o); return 0; };
cmds.bc = function (a, c) {
  var scale = a.indexOf('-l') >= 0 ? 20 : 0, res = '';
  String(c.stdin || '').split(/\n|;/).forEach(function (ln) {
    ln = ln.trim(); if (!ln) return;
    var sm = /^scale\s*=\s*(\d+)$/.exec(ln); if (sm) { scale = +sm[1]; return; }
    var e = ln.replace(/\^/g, '**').replace(/sqrt\(/g, 'Math.sqrt(');
    if (!/^[\d\s+\-*\/%().,Math.sqrt]*$/.test(e)) { c.err('(standard_in) 1: syntax error\n'); return; }
    var v; try { v = Function('"use strict"; return (' + e + ')')(); } catch (er) { c.err('(standard_in) 1: syntax error\n'); return; }
    if (!isFinite(v)) { c.err('Runtime error (func=(main), adr=0): Divide by zero\n'); return; }
    var f = Math.pow(10, scale), t = Math.trunc(v * f + (v >= 0 ? 1e-9 : -1e-9)) / f, s = scale ? t.toFixed(scale) : String(Math.trunc(t));
    if (scale && Math.abs(t) < 1) s = s.replace(/^(-?)0\./, '$1.');
    res += s + '\n';
  });
  c.out(res); return 0;
};
var prevTee = cmds.tee;
cmds.tee = function (a, c) {
  var rest = [], toErr = false, toOut = false;
  a.forEach(function (x) { if (x === '/dev/stderr') toErr = true; else if (x === '/dev/stdout') toOut = true; else rest.push(x); });
  if (toErr) c.err(String(c.stdin || '')); if (toOut) c.out(String(c.stdin || ''));
  return prevTee(rest, c);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
