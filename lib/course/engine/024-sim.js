(function (G) {
'use strict';
/* sed có địa chỉ dòng: 2,4p  $p  3d  /re/,/re/d  1a texto  2i texto  5c texto  3q  và s///, dùng khi biểu thức bắt đầu bằng địa chỉ. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, prevSed = cmds.sed;
var ADDR = '(?:\\d+|\\$|\\/(?:[^\\/\\\\]|\\\\.)*\\/)';
var RE = new RegExp('^(' + ADDR + ')(?:,(' + ADDR + '))?\\s*(!?)\\s*([pdqaic]|s.)(.*)$');
function mkRe(src, ere, flags) {
  var s = src;
  if (!ere) s = s.replace(/\\([+?|(){}])/g, '\u0001$1').replace(/([+?|(){}])/g, '\\$1').replace(/\u0001/g, '');
  try { return new RegExp(s, flags || ''); } catch (e) { throw new CmdErr('sed: -e expression #1: invalid regex'); }
}
cmds.sed = function (a, c) {
  var exprs = [], files = [], quiet = false, inplace = false, bak = '', ere = false, i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-n') quiet = true; else if (x === '-i') inplace = true; else if (/^-i./.test(x)) { inplace = true; bak = x.slice(2); }
    else if (x === '-E' || x === '-r') ere = true; else if (x === '-e') exprs.push(a[++i]);
    else if (x.charAt(0) === '-' && x.length > 1) continue;
    else if (!exprs.length) exprs.push(x); else files.push(x);
  }
  var SPL = new RegExp('^(?:\\s*(?:' + ADDR + '(?:,' + ADDR + ')?)?\\s*!?[pdq]\\s*;?)+$');
  var ex2 = []; exprs.forEach(function (e) { e = String(e).trim(); if (e.indexOf(';') >= 0 && SPL.test(e)) e.split(';').forEach(function (z) { if (z.trim()) ex2.push(z); }); else ex2.push(e); });
  exprs = ex2;
  var ops = exprs.map(function (e) { return RE.exec(String(e).trim()); });
  if (!exprs.length || ops.some(function (m) { return !m; })) return prevSed(a, c);
  var sh = c.sh;
  function addr(t) { if (t === undefined) return null; if (t === '$') return { k: '$' }; if (t.charAt(0) === '/') return { k: 're', re: mkRe(t.slice(1, -1), ere) }; return { k: 'n', n: parseInt(t, 10) }; }
  var cmdsL = ops.map(function (m) {
    var cm = m[4], arg = m[5], o = { a1: addr(m[1]), a2: addr(m[2]), neg: m[3] === '!', c: cm.charAt(0), on: false };
    if (cm === 'a' || cm === 'i' || cm === 'c') o.text = arg.replace(/^\\?\s*/, '');
    else if (cm.charAt(0) === 's') {
      var d = cm.charAt(1), body = arg, parts = [], cur = '';
      for (var k = 0; k < body.length; k++) { var ch = body.charAt(k); if (ch === '\\' && body.charAt(k + 1) === d) { cur += d; k++; continue; } if (ch === '\\') { cur += ch + body.charAt(k + 1); k++; continue; } if (ch === d) { parts.push(cur); cur = ''; continue; } cur += ch; }
      parts.push(cur);
      if (parts.length < 2) throw new CmdErr("sed: -e expression #1: unterminated `s' command");
      var fl = parts[1] || '';
      o.c = 's'; o.re = mkRe(parts[0], ere, (fl.indexOf('g') >= 0 ? 'g' : '') + (/[iI]/.test(fl) ? 'i' : '')); o.rep = parts[0] === undefined ? '' : (parts.length >= 2 ? (function () { return null; })() : '');
      // parts: [pattern, replacement, flags]; do the split again with the pattern as parts[0]
      o.rep = null;
      o._p = parts;
    }
    return o;
  });
  // chỉnh lại s: cm = 's' + delimiter, arg = "pattern<d>repl<d>flags"
  cmdsL.forEach(function (o) {
    if (o.c !== 's') return;
    var p = o._p; // [pattern-first-part?]
    // p was built from arg after the delimiter already consumed: p[0]=pattern p[1]=repl p[2]=flags
    o.re = mkRe(p[0], ere, ((p[2] || '').indexOf('g') >= 0 ? 'g' : '') + (/[iI]/.test(p[2] || '') ? 'i' : ''));
    o.rep = String(p[1] === undefined ? '' : p[1]).replace(/\$/g, '$$$$').replace(/&/g, '$&').replace(/\\([1-9])/g, '$$$1').replace(/\\&/g, '&').replace(/\\n/g, '\n');
  });
  function match(a1, line, ln, last) { return a1.k === 'n' ? ln === a1.n : a1.k === '$' ? last : a1.re.test(line); }
  function proc(text) {
    var all = String(text).split('\n'); if (all.length && all[all.length - 1] === '') all.pop();
    var out = [], quit = false;
    cmdsL.forEach(function (o) { o.on = false; });
    for (var li = 0; li < all.length && !quit; li++) {
      var line = all[li], ln = li + 1, last = li === all.length - 1, deleted = false, pre = [], post = [], printed = false;
      for (var ci = 0; ci < cmdsL.length && !deleted && !quit; ci++) {
        var o = cmdsL[ci], hit;
        if (!o.a2) hit = match(o.a1, line, ln, last);
        else if (o.on) { hit = true; if (o.a2.k === 'n' ? ln >= o.a2.n : match(o.a2, line, ln, last)) o.on = false; }
        else if (match(o.a1, line, ln, last)) { hit = true; if (!(o.a2.k === 'n' && o.a2.n <= ln) && !(o.a2.k === '$' && last)) o.on = true; }
        else hit = false;
        if (o.neg) hit = !hit;
        if (!hit) continue;
        if (o.c === 'p') { out.push(line); }
        else if (o.c === 'd') deleted = true;
        else if (o.c === 'q') { quit = true; }
        else if (o.c === 'a') post.push(o.text);
        else if (o.c === 'i') pre.push(o.text);
        else if (o.c === 'c') { deleted = true; pre.push(o.text); }
        else if (o.c === 's') line = line.replace(o.re, o.rep);
      }
      pre.forEach(function (t) { out.push(t); });
      if (!deleted && !quiet) out.push(line);
      post.forEach(function (t) { out.push(t); });
    }
    return out.join('\n') + (out.length ? '\n' : '');
  }
  if (!files.length) { c.out(proc(c.stdin || '')); return 0; }
  var rc = 0;
  files.forEach(function (p) {
    var full = sh.abs(p);
    try {
      var res = proc(sh.readFile(full, c, 'sed'));
      if (inplace) {
        if (!sh.canWrite(full, c)) throw new CmdErr("sed: couldn't open temporary file " + sh.fs.parent(full) + '/sedXXXX: Permission denied');
        if (bak) sh.fs.put(full + bak, sh.fs.get(full).c, { owner: sh.fs.get(full).owner });
        sh.writeFile(full, res, c, 'sed');
      } else c.out(res);
    } catch (e) { if (e instanceof CmdErr) { c.err(e.msg.replace(/^sed: sed: /, 'sed: ') + '\n'); rc = 4; } else throw e; }
  });
  return rc;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
