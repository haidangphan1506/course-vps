(function (G) {
'use strict';
/* Bộ công cụ xử lý văn bản đầy đủ hơn: grep, sed, cut, tr, sort, uniq, paste, comm, join, column, rev, tac, fold, nl, head, tail, expand, shuf.
   Dùng cho các chương grep / sed / awk / công cụ text đặt ở đầu khoá học. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr;

/* ---------- regex: BRE / ERE / PCRE -> JS ---------- */
var POSIX = {
  alpha: 'A-Za-z\u00C0-\u1EF9', digit: '0-9', alnum: 'A-Za-z0-9\u00C0-\u1EF9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', print: ' -~', graph: '!-~', cntrl: '\\x00-\\x1f\\x7f', xdigit: '0-9A-Fa-f'
};
function convRegex(p, mode) { /* mode: 'bre' | 'ere' | 'pcre' */
  if (mode === 'pcre') return p;
  var ere = mode === 'ere', out = '', i = 0, n = p.length, atStart = true, ch, nx;
  while (i < n) {
    ch = p.charAt(i);
    if (ch === '[') {
      var j = i + 1, b = '[';
      if (p.charAt(j) === '^') { b += '^'; j++; }
      if (p.charAt(j) === ']') { b += '\\]'; j++; }
      var closed = false;
      while (j < n) {
        var d = p.charAt(j);
        if (d === ']') { closed = true; j++; break; }
        if (d === '[' && p.charAt(j + 1) === ':') {
          var e = p.indexOf(':]', j + 2);
          if (e > 0) { var nm = p.slice(j + 2, e); if (!POSIX[nm]) throw new Error('class'); b += POSIX[nm]; j = e + 2; continue; }
        }
        if (d === '\\') { b += '\\\\'; j++; continue; }
        if (d === '[') { b += '\\['; j++; continue; }
        b += d; j++;
      }
      if (!closed) throw new Error('bracket');
      out += b + ']'; i = j; atStart = false; continue;
    }
    if (ch === '\\' && i + 1 < n) {
      nx = p.charAt(i + 1); i += 2;
      if (!ere && '(){}|+?'.indexOf(nx) >= 0) { out += nx; if (nx === '(' || nx === '|') atStart = true; else atStart = false; continue; }
      if (nx === '<') { out += '\\b(?=\\w)'; continue; }
      if (nx === '>') { out += '\\b(?<=\\w)'; continue; }
      if (nx === 'd' || nx === 'D') { out += nx; atStart = false; continue; } /* GNU: không có \d trong BRE/ERE, đọc như chữ d */
      if (nx === 'n') { out += '\\n'; continue; }
      if (nx === 't') { out += '\\t'; continue; }
      out += '\\' + nx; atStart = false; continue;
    }
    if (ere) {
      if (ch === '(' || ch === '|') atStart = true; else atStart = false;
      out += ch; i++; continue;
    }
    /* BRE */
    if ('(){}|+?'.indexOf(ch) >= 0) { out += '\\' + ch; atStart = false; i++; continue; }
    if (ch === '*' && atStart) { out += '\\*'; i++; atStart = false; continue; }
    if (ch === '^' && !atStart) { out += '\\^'; i++; continue; }
    if (ch === '$' && i < n - 1 && !(p.charAt(i + 1) === '\\' && (p.charAt(i + 2) === ')' || p.charAt(i + 2) === '|'))) { out += '\\$'; i++; continue; }
    out += ch; i++;
    atStart = ch === '^' && atStart;
  }
  return out;
}
function mkRx(pat, o) {
  o = o || {};
  var src;
  if (o.fixed) src = pat.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  else src = convRegex(pat, o.perl ? 'pcre' : (o.ere ? 'ere' : 'bre'));
  if (o.w) src = '(?<![A-Za-z0-9_])(?:' + src + ')(?![A-Za-z0-9_])';
  if (o.x) src = '^(?:' + src + ')$';
  return new RegExp(src, (o.g ? 'g' : '') + (o.i ? 'i' : '') + 's');
}
V.mkRx = mkRx;

function lns(s) { if (s === '' || s == null) return []; var l = String(s).split('\n'); if (l[l.length - 1] === '') l.pop(); return l; }
function out(l) { return l.length ? l.join('\n') + '\n' : ''; }
function padL(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
function globRe(g) { return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); }

/* đọc đối số: trả về {f, vals, rest}; optsWithArg là chuỗi các chữ cái nhận đối số */
function parseArgs(a, withArg, longWithArg) {
  var f = {}, rest = [], vals = {}, i, done = false;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (done || x === '-' || x.charAt(0) !== '-') { rest.push(x); continue; }
    if (x === '--') { done = true; continue; }
    if (x.indexOf('--') === 0) {
      var eq = x.indexOf('='), nm = eq > 0 ? x.slice(2, eq) : x.slice(2);
      if (longWithArg && longWithArg.indexOf(nm) >= 0 && eq < 0) { vals[nm] = a[++i]; }
      else if (eq > 0) vals[nm] = x.slice(eq + 1); else f[nm] = true;
      continue;
    }
    for (var j = 1; j < x.length; j++) {
      var ch = x.charAt(j);
      if (/\d/.test(ch) && !(withArg && withArg.indexOf(ch) >= 0)) { var m = /^\d+/.exec(x.slice(j)); (vals.num = m[0]); j += m[0].length - 1; continue; }
      if (withArg && withArg.indexOf(ch) >= 0) {
        var v = x.slice(j + 1); if (v === '') v = a[++i];
        (vals[ch] = vals[ch] || []).push(v); break;
      }
      f[ch] = true;
    }
  }
  return { f: f, vals: vals, rest: rest };
}
function readAll(c, files, who) {
  if (!files.length) return String(c.stdin || '');
  return files.map(function (p) { return p === '-' ? String(c.stdin || '') : c.sh.readFile(c.sh.abs(p), c, who); }).join('');
}

/* ---------- grep ---------- */
function grep(a, c, forced) {
  var sh = c.sh, P = parseArgs(a, 'eAfBCm', ['include', 'exclude', 'exclude-dir', 'color', 'colour', 'max-count', 'after-context', 'before-context', 'context', 'regexp', 'file']);
  var f = P.f, v = P.vals, rest = P.rest;
  var mode = forced || (f.E ? 'E' : f.F ? 'F' : f.P ? 'P' : 'G');
  if (f.E) mode = 'E'; if (f.F) mode = 'F'; if (f.P) mode = 'P';
  if (forced && forced !== 'G') mode = forced;
  var pats = [];
  (v.e || []).forEach(function (p) { String(p).split('\n').forEach(function (q) { pats.push(q); }); });
  (v.regexp ? [v.regexp] : []).forEach(function (p) { pats.push(p); });
  (v.f || []).forEach(function (p) { lns(sh.readFile(sh.abs(p), c, 'grep')).forEach(function (q) { pats.push(q); }); });
  if (!pats.length && !(v.e || v.f)) {
    var first = rest.shift();
    if (first == null) throw new CmdErr('Usage: grep [OPTION]... PATTERNS [FILE]...\nTry \'grep --help\' for more information.', 2);
    String(first).split('\n').forEach(function (q) { pats.push(q); });
  }
  var rxs;
  try {
    rxs = pats.map(function (p) { return mkRx(p, { fixed: mode === 'F', ere: mode === 'E', perl: mode === 'P', i: f.i, w: f.w, x: f.x }); });
  } catch (e) {
    throw new CmdErr(e.message === 'class' ? 'grep: Invalid character class name' : e.message === 'bracket' ? 'grep: Unmatched [, [^, [:, [., or [=' : 'grep: Invalid regular expression', 2);
  }
  function test(line) { for (var k = 0; k < rxs.length; k++) { rxs[k].lastIndex = 0; if (rxs[k].test(line)) return true; } return false; }
  var maxc = v.m ? parseInt(v.m[0], 10) : (v['max-count'] ? parseInt(v['max-count'], 10) : Infinity);
  var A = 0, B = 0;
  if (v.num) A = B = parseInt(v.num, 10);
  if (v.C) A = B = parseInt(v.C[v.C.length - 1], 10);
  if (v.context) A = B = parseInt(v.context, 10);
  if (v.A) A = parseInt(v.A[v.A.length - 1], 10);
  if (v.B) B = parseInt(v.B[v.B.length - 1], 10);
  if (v['after-context']) A = parseInt(v['after-context'], 10);
  if (v['before-context']) B = parseInt(v['before-context'], 10);
  var inc = v.include ? globRe(v.include) : null, exc = v.exclude ? globRe(v.exclude) : null, excd = v['exclude-dir'] ? globRe(v['exclude-dir']) : null;
  var rec = f.r || f.R, inputs = [], rc = 0, errored = false;
  function err(msg) { errored = true; if (!f.s) c.err(msg + '\n'); }
  function add(p, shown, top) {
    var full = sh.abs(p), n = sh.fs.get(full);
    if (!n) { err('grep: ' + p + ': No such file or directory'); return; }
    if (n.t === 'd') {
      if (rec) {
        var base = p.replace(/^.*\//, '');
        if (!top && excd && excd.test(base)) return;
        sh.fs.list(sh.fs.real(full)).sort().forEach(function (k) { add((p === '/' ? '' : p.replace(/\/$/, '')) + '/' + k, (shown === '' ? '' : shown.replace(/\/$/, '') + '/') + k, false); });
      } else err('grep: ' + p + ': Is a directory');
      return;
    }
    var bn = p.replace(/^.*\//, '');
    if (inc && !inc.test(bn)) return;
    if (exc && exc.test(bn)) return;
    try { inputs.push({ name: shown, text: sh.readFile(full, c, 'grep') }); } catch (e) { if (e instanceof CmdErr) err(e.msg); else throw e; }
  }
  if (rest.length) rest.forEach(function (p) { if (p === '-') inputs.push({ name: '(standard input)', text: String(c.stdin || '') }); else add(p, p, true); });
  else if (rec) add('.', '', true);
  else inputs.push({ name: '(standard input)', text: String(c.stdin || '') });
  var multi = (rest.length > 1 || rec) && !f.h;
  if (f.H) multi = true;
  var total = 0, stop = false;
  inputs.forEach(function (inp) {
    if (stop) return;
    var all = lns(inp.text), cnt = 0, lastPrinted = -1, afterLeft = 0, buf = [], printedAny = false;
    function pfx(ln, sep) { return (multi ? inp.name + sep : '') + (f.n ? ln + sep : ''); }
    var emitLines = !(f.c || f.l || f.L || f.q);
    for (var i = 0; i < all.length; i++) {
      if (cnt >= maxc) break;
      var line = all[i], hit = test(line);
      if (f.v) hit = !hit;
      if (hit) {
        cnt++; total++;
        if (f.q) { stop = true; break; }
        if (!emitLines) { if (f.l || f.L) break; continue; }
        if ((A || B) && lastPrinted >= 0 && i - Math.min(B, i - lastPrinted - 1) > lastPrinted + 1) c.out('--\n');
        else if ((A || B) && lastPrinted < 0 && printedAny) c.out('--\n');
        if (B) { for (var k = Math.max(lastPrinted + 1, i - B); k < i; k++) c.out(pfx(k + 1, '-') + all[k] + '\n'); }
        if (f.o && !f.v) {
          rxs.forEach(function (rx) {
            var r2 = new RegExp(rx.source, rx.flags.indexOf('g') >= 0 ? rx.flags : rx.flags + 'g'), m;
            while ((m = r2.exec(line))) { if (m[0] === '') { r2.lastIndex++; continue; } c.out(pfx(i + 1, ':') + m[0] + '\n'); }
          });
        } else c.out(pfx(i + 1, ':') + line + '\n');
        lastPrinted = i; printedAny = true; afterLeft = A;
      } else if (afterLeft > 0 && emitLines) {
        c.out(pfx(i + 1, '-') + line + '\n'); lastPrinted = i; afterLeft--;
      }
    }
    if (f.c) c.out((multi ? inp.name + ':' : '') + cnt + '\n');
    if (f.l && cnt) c.out(inp.name + '\n');
    if (f.L && !cnt) c.out(inp.name + '\n');
  });
  if (f.q && total) return 0;
  if (errored) return 2;
  if (f.L) return 0;
  return total ? 0 : 1;
}
cmds.grep = function (a, c) { return grep(a, c); };
cmds.egrep = function (a, c) { return grep(['-E'].concat(a), c); };
cmds.fgrep = function (a, c) { return grep(['-F'].concat(a), c); };

/* ---------- cut ---------- */
function parseRanges(spec, who) {
  return String(spec).split(',').map(function (t) {
    var m = /^(\d*)-(\d*)$/.exec(t), m2 = /^\d+$/.exec(t);
    if (m2) return [+t, +t];
    if (m && (m[1] || m[2])) return [m[1] ? +m[1] : 1, m[2] ? +m[2] : Infinity];
    throw new CmdErr(who + ': invalid byte, character or field list\nTry \'' + who + ' --help\' for more information.');
  });
}
cmds.cut = function (a, c) {
  var P = parseArgs(a, 'dfbc', ['output-delimiter', 'complement']), f = P.f, v = P.vals;
  var spec = v.f || v.c || v.b;
  if (!spec) throw new CmdErr('cut: you must specify a list of bytes, characters, or fields\nTry \'cut --help\' for more information.');
  var rg = parseRanges(spec[spec.length - 1], 'cut'), comp = f.complement || f['complement'];
  var d = v.d ? v.d[v.d.length - 1] : '\t', od = v['output-delimiter'] != null ? v['output-delimiter'] : (v.f ? d : '');
  if (v.f && d.length !== 1) throw new CmdErr('cut: the delimiter must be a single character\nTry \'cut --help\' for more information.');
  function sel(i) { var s = rg.some(function (r) { return i >= r[0] && i <= r[1]; }); return comp ? !s : s; }
  var res = [];
  lns(readAll(c, P.rest, 'cut')).forEach(function (line) {
    if (v.f) {
      if (line.indexOf(d) < 0) { if (!f.s) res.push(line); return; }
      var p = line.split(d); res.push(p.filter(function (_, i) { return sel(i + 1); }).join(od));
    } else {
      var ch = Array.from(line); res.push(ch.filter(function (_, i) { return sel(i + 1); }).join(od));
    }
  });
  c.out(out(res)); return 0;
};

/* ---------- tr ---------- */
function trExpand(s) {
  var o = [], i = 0;
  while (i < s.length) {
    var ch = s.charAt(i);
    if (ch === '[' && s.charAt(i + 1) === ':') {
      var e = s.indexOf(':]', i + 2);
      if (e > 0) {
        var nm = s.slice(i + 2, e), cl = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', space: ' \t\n\r\f\v', blank: ' \t', punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~', alpha: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', alnum: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', xdigit: '0123456789abcdefABCDEF' }[nm];
        if (!cl) throw new CmdErr("tr: invalid character class '" + nm + "'");
        for (var k = 0; k < cl.length; k++) o.push(cl.charAt(k)); i = e + 2; continue;
      }
    }
    if (ch === '\\' && i + 1 < s.length) {
      var nx = s.charAt(i + 1); i += 2;
      var m = /^[0-7]{1,3}/.exec(s.slice(i - 1));
      if (m && /[0-7]/.test(nx)) { o.push(String.fromCharCode(parseInt(m[0], 8))); i += m[0].length - 1; continue; }
      o.push(nx === 'n' ? '\n' : nx === 't' ? '\t' : nx === 'r' ? '\r' : nx === 'f' ? '\f' : nx === 'v' ? '\v' : nx); continue;
    }
    if (s.charAt(i + 1) === '-' && i + 2 < s.length) {
      var lo = ch.charCodeAt(0), hi = s.charAt(i + 2).charCodeAt(0);
      if (hi < lo) throw new CmdErr("tr: range-endpoints of '" + ch + '-' + s.charAt(i + 2) + "' are in reverse collating sequence order");
      for (var q = lo; q <= hi; q++) o.push(String.fromCharCode(q)); i += 3; continue;
    }
    o.push(ch); i++;
  }
  return o;
}
cmds.tr = function (a, c) {
  var args = [], opt = { d: false, s: false, c: false };
  a.forEach(function (x) { if (/^-[dsc]+$/.test(x) && args.length === 0) { for (var i = 1; i < x.length; i++) opt[x.charAt(i)] = true; } else if (x === '--delete') opt.d = true; else if (x === '--squeeze-repeats') opt.s = true; else if (x === '--complement') opt.c = true; else args.push(x); });
  if (!args.length) throw new CmdErr("tr: missing operand\nTry 'tr --help' for more information.");
  if (!opt.d && !opt.s && args.length < 2) throw new CmdErr("tr: missing operand after '" + args[0] + "'\nTwo strings must be given when translating.\nTry 'tr --help' for more information.");
  var s1 = trExpand(args[0]), s2 = args[1] != null ? trExpand(args[1]) : [];
  var inSet = function (ch) { var h = s1.indexOf(ch) >= 0; return opt.c ? !h : h; };
  var text = String(c.stdin || ''), res = '', last = null, i, ch;
  var sq = opt.d && opt.s ? s2 : (opt.s && !opt.d && args.length < 2 ? s1 : s2);
  var sqSet = function (ch) { return opt.s && (opt.d ? s2 : (args.length < 2 ? s1 : s2)).indexOf(ch) >= 0 ? (args.length < 2 && opt.c ? !(s1.indexOf(ch) >= 0) : true) : false; };
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    var o = ch;
    if (opt.d && inSet(ch)) { last = null; continue; }
    if (!opt.d && args.length >= 2 && inSet(ch)) {
      if (opt.c) o = s2.length ? s2[s2.length - 1] : ch;
      else { var ix = s1.indexOf(ch); o = s2.length ? (ix < s2.length ? s2[ix] : s2[s2.length - 1]) : ch; }
    }
    if (opt.s) {
      var squeezeSet = args.length >= 2 || opt.d ? s2 : s1;
      var inSq = opt.c && args.length < 2 ? s1.indexOf(o) < 0 : squeezeSet.indexOf(o) >= 0;
      if (inSq && last === o) continue;
      last = inSq ? o : null;
    }
    res += o;
  }
  c.out(res); return 0;
};

/* ---------- sort ---------- */
function humanNum(s) { var m = /^\s*(-?[\d.]+)([KMGTPE]?)/i.exec(s); if (!m) return 0; var mult = { '': 1, K: 1024, M: 1048576, G: 1073741824, T: 1099511627776, P: 1.1259e15, E: 1.1529e18 }[m[2].toUpperCase()]; return parseFloat(m[1]) * mult; }
function numVal(s) { var m = /^\s*[+-]?(\d+\.?\d*|\.\d+)/.exec(s); return m ? parseFloat(m[0]) : 0; }
cmds.sort = function (a, c) {
  var keys = [], gf = {}, sep = null, files = [], outFile = null, i, uniq = false, stable = false, check = false, rev = false;
  function flagsOf(str, o) { for (var j = 0; j < str.length; j++) { var ch = str.charAt(j); if ('nrfbhMVd'.indexOf(ch) >= 0) o[ch] = true; else throw new CmdErr("sort: invalid option -- '" + ch + "'"); } }
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-k' || /^-k./.test(x) || /^-[a-zA-Z]*k./.test(x)) {
      var spec;
      if (x === '-k') spec = a[++i]; else if (/^-k/.test(x)) spec = x.slice(2); else { var kk = x.indexOf('k'); flagsOf(x.slice(1, kk), gf); spec = x.slice(kk + 1) || a[++i]; }
      var m = /^(\d+)(?:\.(\d+))?([nrfbhMVd]*)(?:,(\d+)(?:\.(\d+))?([nrfbhMVd]*))?$/.exec(spec || '');
      if (!m) throw new CmdErr('sort: invalid number at field start: invalid count at start of \'' + (spec || '') + '\'');
      var ko = {}; flagsOf(m[3] + (m[6] || ''), ko);
      keys.push({ f1: +m[1], c1: m[2] ? +m[2] : 1, f2: m[4] ? +m[4] : 0, c2: m[5] ? +m[5] : 0, o: ko });
    } else if (x === '-t') sep = a[++i];
    else if (/^-t./.test(x)) sep = x.slice(2);
    else if (x === '-o') outFile = a[++i];
    else if (/^-o./.test(x)) outFile = x.slice(2);
    else if (x === '--stable') stable = true;
    else if (x === '--unique') uniq = true;
    else if (x === '--reverse') gf.r = true;
    else if (x === '--numeric-sort') gf.n = true;
    else if (x === '--human-numeric-sort') gf.h = true;
    else if (x === '--ignore-case') gf.f = true;
    else if (x.charAt(0) === '-' && x.length > 1 && x.charAt(1) !== '-') {
      for (var j = 1; j < x.length; j++) { var ch = x.charAt(j); if (ch === 'u') uniq = true; else if (ch === 's') stable = true; else if (ch === 'c' || ch === 'C') check = true; else if ('nrfbhMVd'.indexOf(ch) >= 0) gf[ch] = true; else throw new CmdErr("sort: invalid option -- '" + ch + "'\nTry 'sort --help' for more information.", 2); }
    } else files.push(x);
  }
  var text = readAll(c, files, 'sort'), l = lns(text);
  function fieldsOf(line) {
    if (sep != null && sep !== '') { var p = line.split(sep), st = [], pos = 0; p.forEach(function (q) { st.push(pos); pos += q.length + sep.length; }); return { p: p, st: st, sep: sep }; }
    var re = /\s*\S+/g, mm, parts = [], st2 = []; while ((mm = re.exec(line))) { st2.push(mm.index); parts.push(mm[0]); }
    return { p: parts, st: st2, sep: null };
  }
  function keyStr(line, k) {
    var F = fieldsOf(line), s = F.p.slice(k.f1 - 1, k.f2 ? k.f2 : F.p.length);
    if (!s.length) return '';
    var txt;
    if (k.f2) { var last = s.length - 1; if (k.c2) { var seg = s[last]; if (!F.sep) seg = seg; s[last] = seg.slice(0, k.c2 + (F.sep ? 0 : (seg.length - seg.replace(/^\s+/, '').length))); } }
    if (k.c1 > 1) { var s0 = s[0], lead = F.sep ? 0 : (s0.length - s0.replace(/^\s+/, '').length); s[0] = s0.slice(lead + k.c1 - 1); }
    txt = s.join(F.sep || '');
    return txt;
  }
  function cmpOne(x, y, o) {
    if (o.b || o.n || o.h || o.M) { x = x.replace(/^\s+/, ''); y = y.replace(/^\s+/, ''); }
    var r;
    if (o.h) r = humanNum(x) - humanNum(y);
    else if (o.n) r = numVal(x) - numVal(y);
    else if (o.M) { var mo = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']; r = (mo.indexOf(x.trim().slice(0, 3).toUpperCase()) + 1) - (mo.indexOf(y.trim().slice(0, 3).toUpperCase()) + 1); }
    else if (o.V) { var xa = x.split(/(\d+)/), ya = y.split(/(\d+)/); r = 0; for (var q = 0; q < Math.max(xa.length, ya.length) && !r; q++) { var u = xa[q] || '', w = ya[q] || ''; r = q % 2 ? (+u - +w) : (u < w ? -1 : u > w ? 1 : 0); } }
    else { if (o.f) { x = x.toUpperCase(); y = y.toUpperCase(); } if (o.d) { x = x.replace(/[^A-Za-z0-9 \t]/g, ''); y = y.replace(/[^A-Za-z0-9 \t]/g, ''); } r = x < y ? -1 : x > y ? 1 : 0; }
    if (r !== 0 && isFinite(r) === false) r = r > 0 ? 1 : -1;
    return o.r ? -r : r;
  }
  function keyCmp(x, y) {
    if (keys.length) {
      for (var k = 0; k < keys.length; k++) {
        var o = keys[k].o, oo = {}; ['n', 'r', 'f', 'b', 'h', 'M', 'V', 'd'].forEach(function (t) { oo[t] = Object.keys(o).length ? !!o[t] : !!gf[t]; });
        if (!Object.keys(o).length) oo.r = !!gf.r;
        var r = cmpOne(keyStr(x, keys[k]), keyStr(y, keys[k]), oo);
        if (r) return r;
      }
      return 0;
    }
    return cmpOne(x, y, gf);
  }
  if (check) {
    for (var q = 1; q < l.length; q++) if (keyCmp(l[q - 1], l[q]) > 0) { c.err('sort: ' + (files[0] || '-') + ':' + (q + 1) + ': disorder: ' + l[q] + '\n'); return 1; }
    return 0;
  }
  var idx = l.map(function (s, n) { return { s: s, n: n }; });
  idx.sort(function (p, q2) {
    var r = keyCmp(p.s, q2.s);
    if (r) return r;
    if (!stable && !uniq) { var w = p.s < q2.s ? -1 : p.s > q2.s ? 1 : 0; return gf.r ? -w : w; }
    return p.n - q2.n;
  });
  var res = idx.map(function (o) { return o.s; });
  if (uniq) res = res.filter(function (s, k) { return k === 0 || keyCmp(res[k - 1], s) !== 0; });
  if (outFile) { c.sh.writeFile(c.sh.abs(outFile), out(res), c, 'sort'); return 0; }
  c.out(out(res)); return 0;
};

/* ---------- uniq ---------- */
cmds.uniq = function (a, c) {
  var P = parseArgs(a, 'fsw'), f = P.f, v = P.vals;
  var text = readAll(c, P.rest.slice(0, 1), 'uniq'), l = lns(text), groups = [];
  var skipF = v.f ? parseInt(v.f[0], 10) : 0, skipS = v.s ? parseInt(v.s[0], 10) : 0, wN = v.w ? parseInt(v.w[0], 10) : 0;
  function key(s) { var t = s; if (skipF) t = t.replace(new RegExp('^(?:\\s*\\S+){0,' + skipF + '}'), ''); if (skipS) t = t.slice(skipS); if (wN) t = t.slice(0, wN); return f.i ? t.toLowerCase() : t; }
  l.forEach(function (x) { var g = groups[groups.length - 1]; if (g && key(g.v) === key(x)) g.n++; else groups.push({ v: x, n: 1 }); });
  var res = [];
  groups.forEach(function (g) {
    if (f.d && g.n < 2) return;
    if (f.u && g.n > 1) return;
    res.push(f.c ? padL(g.n, 7) + ' ' + g.v : g.v);
  });
  var o = out(res);
  if (P.rest[1]) c.sh.writeFile(c.sh.abs(P.rest[1]), o, c, 'uniq'); else c.out(o);
  return 0;
};

/* ---------- paste / comm / join / column / rev / tac / fold / nl / expand / shuf ---------- */
cmds.paste = function (a, c) {
  var P = parseArgs(a, 'd'), f = P.f, delim = P.vals.d ? P.vals.d[0].replace(/\\t/g, '\t').replace(/\\n/g, '\n') : '\t';
  var srcs = P.rest.map(function (p) { return lns(p === '-' ? String(c.stdin || '') : c.sh.readFile(c.sh.abs(p), c, 'paste')); });
  if (!srcs.length) srcs = [lns(String(c.stdin || ''))];
  var res = [];
  if (f.s) srcs.forEach(function (s) { var o = ''; s.forEach(function (x, i) { o += (i ? delim.charAt((i - 1) % delim.length) : '') + x; }); res.push(o); });
  else { var n = Math.max.apply(null, srcs.map(function (s) { return s.length; })); for (var i = 0; i < n; i++) { var o2 = ''; srcs.forEach(function (s, j) { o2 += (j ? delim.charAt((j - 1) % delim.length) : '') + (s[i] != null ? s[i] : ''); }); res.push(o2); } }
  c.out(out(res)); return 0;
};
cmds.comm = function (a, c) {
  var f = {}, P = { rest: [] };
  a.forEach(function (x) { if (/^-[123]+$/.test(x)) x.slice(1).split('').forEach(function (d) { f[d] = true; }); else P.rest.push(x); });
  if (P.rest.length < 2) throw new CmdErr("comm: missing operand after '" + (P.rest[0] || 'comm') + "'\nTry 'comm --help' for more information.");
  var A = lns(P.rest[0] === '-' ? c.stdin : c.sh.readFile(c.sh.abs(P.rest[0]), c, 'comm')), B = lns(P.rest[1] === '-' ? c.stdin : c.sh.readFile(c.sh.abs(P.rest[1]), c, 'comm'));
  var i = 0, j = 0, res = [];
  function col(n, s) { if (f[String(n)]) return; var pre = ''; if (n >= 2 && !f['1']) pre += '\t'; if (n === 3 && !f['2']) pre += '\t'; res.push(pre + s); }
  while (i < A.length || j < B.length) {
    if (j >= B.length || (i < A.length && A[i] < B[j])) { col(1, A[i++]); }
    else if (i >= A.length || B[j] < A[i]) { col(2, B[j++]); }
    else { col(3, A[i]); i++; j++; }
  }
  c.out(out(res)); return 0;
};
cmds.join = function (a, c) {
  var P = parseArgs(a, 't12'), v = P.vals, t = v.t ? v.t[0] : null, k1 = v['1'] ? +v['1'][0] : 1, k2 = v['2'] ? +v['2'][0] : 1;
  var A = lns(c.sh.readFile(c.sh.abs(P.rest[0]), c, 'join')), B = lns(c.sh.readFile(c.sh.abs(P.rest[1]), c, 'join'));
  function sp(s) { return t ? s.split(t) : s.trim().split(/\s+/); }
  var map = {}; B.forEach(function (l) { var p = sp(l); (map[p[k2 - 1]] = map[p[k2 - 1]] || []).push(p); });
  var res = [];
  A.forEach(function (l) { var p = sp(l); (map[p[k1 - 1]] || []).forEach(function (q) { var rest1 = p.filter(function (_, i) { return i !== k1 - 1; }), rest2 = q.filter(function (_, i) { return i !== k2 - 1; }); res.push([p[k1 - 1]].concat(rest1, rest2).join(t || ' ')); }); });
  c.out(out(res)); return 0;
};
cmds.column = function (a, c) {
  var P = parseArgs(a, 'so'), f = P.f, sepRe = P.vals.s ? new RegExp('[' + P.vals.s[0].replace(/[\]\\^-]/g, '\\$&') + ']') : /\s+/;
  var l = lns(readAll(c, P.rest, 'column'));
  if (!f.t) { c.out(out(l)); return 0; }
  var rows = l.map(function (x) { return P.vals.s ? x.split(sepRe) : x.trim().split(sepRe); }), w = [];
  rows.forEach(function (r) { r.forEach(function (x, i) { w[i] = Math.max(w[i] || 0, x.length); }); });
  c.out(out(rows.map(function (r) { return r.map(function (x, i) { return i === r.length - 1 ? x : (x + new Array(w[i] - x.length + 1).join(' ')); }).join('  '); }))); return 0;
};
cmds.rev = function (a, c) { c.out(out(lns(readAll(c, a, 'rev')).map(function (s) { return Array.from(s).reverse().join(''); }))); return 0; };
cmds.tac = function (a, c) { c.out(out(lns(readAll(c, a, 'tac')).reverse())); return 0; };
cmds.fold = function (a, c) {
  var P = parseArgs(a, 'w'), w = P.vals.w ? parseInt(P.vals.w[0], 10) : (P.vals.num ? parseInt(P.vals.num, 10) : 80), res = [];
  lns(readAll(c, P.rest, 'fold')).forEach(function (s) {
    if (!s.length) { res.push(''); return; }
    while (s.length > w) { var cut = w; if (P.f.s) { var sp = s.slice(0, w).lastIndexOf(' '); if (sp > 0) cut = sp + 1; } res.push(s.slice(0, cut)); s = s.slice(cut); }
    res.push(s);
  });
  c.out(out(res)); return 0;
};
cmds.nl = function (a, c) {
  var P = parseArgs(a, 'bnwsv'), body = P.vals.b ? P.vals.b[0] : 't', fmt = P.vals.n ? P.vals.n[0] : 'rn', w = P.vals.w ? +P.vals.w[0] : 6, sep = P.vals.s ? P.vals.s[0] : '\t', k = P.vals.v ? +P.vals.v[0] : 1;
  c.out(out(lns(readAll(c, P.rest, 'nl')).map(function (s) {
    if (body === 'n' || (body === 't' && s === '')) return new Array(w + 1).join(' ') + sep + s;
    var num = String(k++); num = fmt === 'ln' ? num + new Array(Math.max(0, w - num.length) + 1).join(' ') : fmt === 'rz' ? new Array(Math.max(0, w - num.length) + 1).join('0') + num : padL(num, w);
    return num + sep + s;
  }))); return 0;
};
cmds.expand = function (a, c) { c.out(readAll(c, a.filter(function (x) { return x.charAt(0) !== '-'; }), 'expand').replace(/\t/g, '        ')); return 0; };
cmds.shuf = function (a, c) {
  var P = parseArgs(a, 'n'), l = lns(readAll(c, P.rest, 'shuf'));
  for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
  if (P.vals.n) l = l.slice(0, parseInt(P.vals.n[0], 10));
  c.out(out(l)); return 0;
};

cmds.cat = function (a, c) {
  var sh = c.sh, f = {}, files = [], rc = 0;
  a.forEach(function (x) {
    if (x === '-') { files.push(x); return; }
    if (/^-[A-Za-z]+$/.test(x)) { x.slice(1).split('').forEach(function (ch) { f[ch] = true; }); return; }
    if (x === '--number') { f.n = true; return; } if (x === '--show-all') { f.A = true; return; }
    files.push(x);
  });
  if (f.A) { f.E = true; f.T = true; }
  var n = 0, prevBlank = false;
  function render(txt) {
    if (!(f.n || f.b || f.E || f.T || f.s || f.A || f.v)) return txt;
    if (f.A || f.v) txt = txt.replace(/\r/g, '^M');
    var l = txt.split('\n'), tail = l[l.length - 1] === '' ? (l.pop(), true) : false;
    var res = [];
    l.forEach(function (ln) {
      if (f.s) { if (ln === '' && prevBlank) return; prevBlank = ln === ''; }
      var o = f.T ? ln.replace(/\t/g, '^I') : ln;
      if (f.E) o += '$';
      if (f.b ? ln !== '' : f.n) o = padL(++n, 6) + '\t' + o;
      res.push(o);
    });
    return res.join('\n') + (tail ? '\n' : '');
  }
  if (!files.length) { c.out(render(String(c.stdin || ''))); return 0; }
  files.forEach(function (p) {
    try { c.out(render(p === '-' ? String(c.stdin || '') : sh.readFile(sh.abs(p), c, 'cat'))); }
    catch (e) { if (e instanceof CmdErr) { c.err(e.msg + '\n'); rc = 1; } else throw e; }
  });
  return rc;
};

/* ---------- head / tail ---------- */
function headTail(isHead) {
  var who = isHead ? 'head' : 'tail';
  return function (a, c) {
    var sh = c.sh, n = 10, bytes = null, files = [], quiet = false, plus = false, minus = false, i, x;
    for (i = 0; i < a.length; i++) {
      x = a[i];
      if (x === '-n' || x === '-c' || x === '--lines' || x === '--bytes') {
        var val = String(a[++i]); var isB = x === '-c' || x === '--bytes';
        if (!/^[+-]?\d+$/.test(val)) throw new CmdErr(who + ': invalid number of ' + (isB ? 'bytes' : 'lines') + ": '" + val + "'");
        if (val.charAt(0) === '+') plus = true; if (val.charAt(0) === '-') minus = true;
        var num = Math.abs(parseInt(val, 10)); if (isB) bytes = num; else n = num;
      } else if (/^-[nc][+-]?\d+$/.test(x)) {
        var v2 = x.slice(2); if (v2.charAt(0) === '+') plus = true; if (v2.charAt(0) === '-') minus = true;
        if (x.charAt(1) === 'c') bytes = Math.abs(parseInt(v2, 10)); else n = Math.abs(parseInt(v2, 10));
      } else if (/^--(lines|bytes)=[+-]?\d+$/.test(x)) { var vv = x.split('=')[1]; if (vv.charAt(0) === '+') plus = true; if (vv.charAt(0) === '-') minus = true; if (/bytes/.test(x)) bytes = Math.abs(parseInt(vv, 10)); else n = Math.abs(parseInt(vv, 10)); }
      else if (/^-\d+$/.test(x)) n = parseInt(x.slice(1), 10);
      else if (x === '-q' || x === '--quiet' || x === '--silent') quiet = true;
      else if (x === '-f' || x === '-F' || x === '--follow' || x === '-v') continue;
      else files.push(x);
    }
    function one(text) {
      if (bytes != null) return isHead ? (minus ? text.slice(0, Math.max(0, text.length - bytes)) : text.slice(0, bytes)) : (plus ? text.slice(Math.max(0, bytes - 1)) : text.slice(Math.max(0, text.length - bytes)));
      var l = lns(text);
      if (isHead) return out(minus ? l.slice(0, Math.max(0, l.length - n)) : l.slice(0, n));
      return out(plus ? l.slice(Math.max(0, n - 1)) : l.slice(Math.max(0, l.length - n)));
    }
    if (!files.length) { c.out(one(String(c.stdin || ''))); return 0; }
    var rc = 0;
    files.forEach(function (p, k) {
      try {
        var t = p === '-' ? String(c.stdin || '') : sh.readFile(sh.abs(p), c, who);
        if (files.length > 1 && !quiet) c.out((k ? '\n' : '') + '==> ' + (p === '-' ? 'standard input' : p) + ' <==\n');
        c.out(one(t));
      } catch (e) { if (e instanceof CmdErr) { c.err(e.msg.replace(/^(head|tail): /, who + ': cannot open \'').replace(/: (No such file or directory|Permission denied)$/, function (m, r) { return '\' for reading: ' + r; }) + '\n'); rc = 1; } else throw e; }
    });
    return rc;
  };
}
cmds.head = headTail(true);
cmds.tail = headTail(false);

/* ---------- sed ---------- */
function sedErr(pos, msg) { return new CmdErr('sed: -e expression #1, char ' + pos + ': ' + msg, 1); }
function parseSed(src, ere) {
  var p = 0, n = src.length, cmdsL = [], stack = [];
  function skipWs() { while (p < n && /[ \t]/.test(src.charAt(p))) p++; }
  function readDelimited(d) { /* đọc tới d chưa thoát; trả chuỗi với \d -> d */
    var s = '';
    while (p < n) {
      var ch = src.charAt(p);
      if (ch === '\\' && p + 1 < n) {
        var nx = src.charAt(p + 1);
        if (nx === d && d !== '\\') { s += (d === '/' || d === '|' || d === '#' || d === ',' || d === ':' || d === '_' || d === '@' ? d : '\\' + d); p += 2; continue; }
        s += ch + nx; p += 2; continue;
      }
      if (ch === d) { p++; return s; }
      if (ch === '\n' && d !== '\n') { return null; }
      s += ch; p++;
    }
    return null;
  }
  function addrParse() {
    skipWs();
    var ch = src.charAt(p), m;
    if (/\d/.test(ch)) {
      m = /^(\d+)(?:~(\d+))?/.exec(src.slice(p)); p += m[0].length;
      return m[2] != null ? { k: 'step', a: +m[1], s: +m[2] } : { k: 'n', n: +m[1] };
    }
    if (ch === '$') { p++; return { k: '$' }; }
    if (ch === '/' || ch === '\\') {
      var d = '/';
      if (ch === '\\') { p++; d = src.charAt(p); }
      p++;
      var re = readDelimited(d);
      if (re == null) throw sedErr(p, 'unterminated address regex');
      var fl = '';
      while (src.charAt(p) === 'I' || src.charAt(p) === 'M') { fl += src.charAt(p); p++; }
      try { return { k: 're', re: mkRx(re, { ere: ere, i: fl.indexOf('I') >= 0 }), src: re }; } catch (e) { throw sedErr(p, 'invalid regex'); }
    }
    return null;
  }
  function endCmd() { skipWs(); var ch = src.charAt(p); if (p >= n || ch === ';' || ch === '\n') { p++; return; } if (ch === '}' || ch === '#') return; throw sedErr(p + 1, 'extra characters after command'); }
  function readText() { /* a/i/c */
    skipWs();
    if (src.charAt(p) === '\\') { p++; skipWs(); if (src.charAt(p) === '\n') p++; }
    var s = '';
    while (p < n && src.charAt(p) !== '\n') { if (src.charAt(p) === '\\' && p + 1 < n) { var nx = src.charAt(p + 1); if (nx === '\n') { s += '\n'; p += 2; continue; } s += nx === 't' ? '\t' : nx; p += 2; continue; } s += src.charAt(p++); }
    p++;
    return s;
  }
  function readLabel() { skipWs(); var s = ''; while (p < n && src.charAt(p) !== '\n' && src.charAt(p) !== ';' && src.charAt(p) !== '}') s += src.charAt(p++); return s.trim(); }
  while (p < n) {
    while (p < n && /[ \t\n;]/.test(src.charAt(p))) p++;
    if (p >= n) break;
    if (src.charAt(p) === '#') { while (p < n && src.charAt(p) !== '\n') p++; continue; }
    var cmd = { a1: null, a2: null, neg: false, c: '' };
    cmd.a1 = addrParse();
    if (cmd.a1) {
      skipWs();
      if (src.charAt(p) === ',') {
        p++; skipWs();
        if (src.charAt(p) === '+' || src.charAt(p) === '~') { var kind = src.charAt(p++); var mm = /^\d+/.exec(src.slice(p)); if (!mm) throw sedErr(p + 1, 'expected number'); p += mm[0].length; cmd.a2 = { k: kind === '+' ? 'plus' : 'mult', n: +mm[0] }; }
        else { cmd.a2 = addrParse(); if (!cmd.a2) throw sedErr(p + 1, 'unexpected `,\''); }
      }
    }
    skipWs();
    while (src.charAt(p) === '!') { cmd.neg = true; p++; skipWs(); }
    if (p >= n) throw sedErr(p, 'missing command');
    var ch = src.charAt(p++);
    cmd.c = ch;
    if (ch === '{') { stack.push(cmdsL.length); cmdsL.push(cmd); continue; }
    if (ch === '}') {
      if (!stack.length) throw sedErr(p, 'unexpected `}\'');
      var open = stack.pop(); cmdsL[open].end = cmdsL.length; cmd.c = '}'; cmdsL.push(cmd); endCmd(); continue;
    }
    if (ch === 's') {
      var d = src.charAt(p++);
      if (!d || d === '\n' || d === '\\') throw sedErr(p, "unterminated `s' command");
      var pat = readDelimited(d);
      if (pat == null) throw sedErr(p, "unterminated `s' command");
      /* thay thế: giữ nguyên \ để xử lý riêng */
      var rep = '';
      var ok = false;
      while (p < n) {
        var q = src.charAt(p);
        if (q === '\\' && p + 1 < n) { var q2 = src.charAt(p + 1); if (q2 === d) { rep += (d === '&' ? '\\&' : d); } else rep += '\\' + q2; p += 2; continue; }
        if (q === d) { p++; ok = true; break; }
        rep += q; p++;
      }
      if (!ok) throw sedErr(p, "unterminated `s' command");
      var fl = '', nth = 0, glob = false, pr = false, ic = false, wfile = null;
      while (p < n) {
        var fc = src.charAt(p);
        if (fc === 'g') { glob = true; p++; }
        else if (fc === 'p') { pr = true; p++; }
        else if (fc === 'i' || fc === 'I') { ic = true; p++; }
        else if (/\d/.test(fc)) { var nm = /^\d+/.exec(src.slice(p)); nth = +nm[0]; p += nm[0].length; }
        else if (fc === 'w') { p++; skipWs(); wfile = ''; while (p < n && src.charAt(p) !== '\n') wfile += src.charAt(p++); break; }
        else if (fc === 'e' || fc === 'm' || fc === 'M') { p++; }
        else if (' \t;\n}#'.indexOf(fc) >= 0) break;
        else throw sedErr(p + 1, "unknown option to `s'");
      }
      try { cmd.re = mkRx(pat, { ere: ere, i: ic }); } catch (e) { throw sedErr(p, e.message === 'class' ? 'invalid character class' : 'Invalid preceding regular expression'); }
      var gm = /\\(\d)/g, mx, maxRef = 0; while ((mx = gm.exec(rep))) maxRef = Math.max(maxRef, +mx[1]);
      var gcount = (new RegExp(cmd.re.source + '|')).exec('').length - 1;
      if (maxRef > gcount) throw sedErr(p, 'invalid reference \\' + maxRef + ' on `s\' command\'s RHS');
      cmd.rep = parseRep(rep); cmd.g = glob; cmd.nth = nth; cmd.p = pr; cmd.w = wfile;
      cmdsL.push(cmd); if (wfile == null) endCmd(); continue;
    }
    if (ch === 'y') {
      var d2 = src.charAt(p++), s1 = readDelimited(d2), s2 = s1 == null ? null : readDelimited(d2);
      if (s1 == null || s2 == null) throw sedErr(p, "unterminated `y' command");
      function unesc(t) { return t.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\'); }
      s1 = unesc(s1); s2 = unesc(s2);
      if (s1.length !== s2.length) throw sedErr(p, "strings for `y' command are different lengths");
      cmd.map = {}; for (var yi = 0; yi < s1.length; yi++) cmd.map[s1.charAt(yi)] = s2.charAt(yi);
      cmdsL.push(cmd); endCmd(); continue;
    }
    if (ch === 'a' || ch === 'i' || ch === 'c') { cmd.text = readText(); if (cmd.text === '' && false) throw sedErr(p, 'expected \\ after `a\', `c\' or `i\''); cmdsL.push(cmd); continue; }
    if (ch === ':') { cmd.label = readLabel(); cmdsL.push(cmd); continue; }
    if (ch === 'b' || ch === 't' || ch === 'T') { cmd.label = readLabel(); cmdsL.push(cmd); continue; }
    if (ch === 'r' || ch === 'w' || ch === 'R' || ch === 'W') { skipWs(); var fn = ''; while (p < n && src.charAt(p) !== '\n') fn += src.charAt(p++); cmd.file = fn; cmdsL.push(cmd); continue; }
    if (ch === 'q' || ch === 'Q') { skipWs(); var qm = /^\d+/.exec(src.slice(p)); if (qm) { cmd.code = +qm[0]; p += qm[0].length; } cmdsL.push(cmd); endCmd(); continue; }
    if ('pPdDnNgGhHx=l'.indexOf(ch) >= 0) { cmdsL.push(cmd); endCmd(); continue; }
    throw sedErr(p, 'unknown command: `' + ch + "'");
  }
  if (stack.length) throw sedErr(0, 'unmatched `{\'');
  /* nhãn */
  var labels = {}; cmdsL.forEach(function (o, i) { if (o.c === ':') labels[o.label] = i; });
  cmdsL.forEach(function (o) { if ((o.c === 'b' || o.c === 't' || o.c === 'T') && o.label) { if (labels[o.label] == null) throw new CmdErr("sed: -e expression #1, char " + n + ": can't find label for jump to `" + o.label + "'"); o.to = labels[o.label]; } else if (o.c === 'b' || o.c === 't' || o.c === 'T') o.to = cmdsL.length; });
  return cmdsL;
}
function parseRep(r) {
  var toks = [], lit = '', i = 0;
  function flush() { if (lit) { toks.push({ t: 'l', v: lit }); lit = ''; } }
  while (i < r.length) {
    var ch = r.charAt(i);
    if (ch === '\\' && i + 1 < r.length) {
      var nx = r.charAt(i + 1); i += 2;
      if (/\d/.test(nx)) { flush(); toks.push({ t: 'g', n: +nx }); }
      else if (nx === 'n') lit += '\n'; else if (nx === 't') lit += '\t';
      else if ('ULEul'.indexOf(nx) >= 0) { flush(); toks.push({ t: 'c', v: nx }); }
      else lit += nx;
      continue;
    }
    if (ch === '&') { flush(); toks.push({ t: 'g', n: 0 }); i++; continue; }
    lit += ch; i++;
  }
  flush();
  return toks;
}
function applyRep(toks, m) {
  var res = '', mode = '', once = '';
  function add(s) {
    if (!s) return;
    if (once) { s = (once === 'u' ? s.charAt(0).toUpperCase() : s.charAt(0).toLowerCase()) + (mode === 'U' ? s.slice(1).toUpperCase() : mode === 'L' ? s.slice(1).toLowerCase() : s.slice(1)); once = ''; }
    else if (mode === 'U') s = s.toUpperCase(); else if (mode === 'L') s = s.toLowerCase();
    res += s;
  }
  toks.forEach(function (t) {
    if (t.t === 'l') add(t.v); else if (t.t === 'g') add(m[t.n] == null ? '' : m[t.n]);
    else if (t.v === 'U' || t.v === 'L') mode = t.v; else if (t.v === 'E') { mode = ''; once = ''; } else once = t.v;
  });
  return res;
}
function sedRun(cmdsL, o, text, ctx) { /* ctx: {sh,c,files:{}} */
  var all = String(text).split('\n'), hadNl = /\n$/.test(text) || text === '';
  if (all.length && all[all.length - 1] === '') all.pop();
  var outL = [], hold = '', ln = ctx.ln0 || 0, li = 0, quit = false, qcode = 0, steps = 0;
  var states = cmdsL.map(function () { return { on: false, end: 0 }; });
  function matchA(ad, ps, last) {
    if (ad.k === 'n') return ln === ad.n; if (ad.k === '$') return last; if (ad.k === 'step') return ad.s === 0 ? ln === ad.a : ln >= ad.a && (ln - ad.a) % ad.s === 0;
    ad.re.lastIndex = 0; return ad.re.test(ps);
  }
  function selected(idx, ps, last) {
    var cmd = cmdsL[idx], st = states[idx], r;
    if (!cmd.a1) r = true;
    else if (!cmd.a2) r = matchA(cmd.a1, ps, last);
    else {
      if (st.on) {
        r = true;
        if (cmd.a2.k === 'n' || cmd.a2.k === 'plus' || cmd.a2.k === 'mult') { if (ln >= st.end) st.on = false; }
        else if (cmd.a2.k === '$') { if (last) st.on = false; }
        else if (matchA(cmd.a2, ps, last)) st.on = false;
      } else {
        var zeroStart = cmd.a1.k === 'n' && cmd.a1.n === 0 && cmd.a2.k === 're' && !st.done;
        if (zeroStart) { st.done = true; r = true; st.on = !matchA(cmd.a2, ps, last); }
        else if (matchA(cmd.a1, ps, last)) {
          r = true;
          if (cmd.a2.k === 'n') { if (cmd.a2.n > ln) { st.on = true; st.end = cmd.a2.n; } }
          else if (cmd.a2.k === 'plus') { if (cmd.a2.n > 0) { st.on = true; st.end = ln + cmd.a2.n; } }
          else if (cmd.a2.k === 'mult') { var nn = cmd.a2.n; var e = nn > 0 ? Math.ceil(ln / nn) * nn : ln; if (e > ln) { st.on = true; st.end = e; } }
          else if (cmd.a2.k === '$') { if (!last) st.on = true; }
          else st.on = true;
        } else r = false;
      }
    }
    return cmd.neg ? !r : r;
  }
  function emit(s) { outL.push(s); }
  while (li < all.length && !quit) {
    var ps = all[li++]; ln++;
    var restart = true;
    while (restart && !quit) {
      restart = false;
      var append = [], pc = 0, tflag = false, endCycle = false, noPrint = false, last = li >= all.length;
      while (pc < cmdsL.length && !endCycle && !quit) {
        if (++steps > 200000) throw new CmdErr('sed: script loop limit');
        var cmd = cmdsL[pc], sel;
        if (cmd.c === ':' || cmd.c === '}') { pc++; continue; }
        sel = selected(pc, ps, last);
        if (cmd.c === '{') { pc = sel ? pc + 1 : cmd.end + 1; continue; }
        if (!sel) { pc++; continue; }
        switch (cmd.c) {
          case 's': {
            var count = 0, did = false, res = '', pos = 0, rx = new RegExp(cmd.re.source, cmd.re.flags.indexOf('g') >= 0 ? cmd.re.flags : cmd.re.flags + 'g'), m;
            while ((m = rx.exec(ps))) {
              count++;
              var take = cmd.nth ? (cmd.g ? count >= cmd.nth : count === cmd.nth) : true;
              if (m[0] === '') { if (take) { res += ps.slice(pos, m.index) + applyRep(cmd.rep, m); pos = m.index; did = true; } rx.lastIndex = m.index + 1; if (m.index >= ps.length) break; if (take && !cmd.g) break; if (take) { res += ps.charAt(m.index); pos = m.index + 1; } continue; }
              if (take) { res += ps.slice(pos, m.index) + applyRep(cmd.rep, m); pos = m.index + m[0].length; did = true; if (!cmd.g) break; }
            }
            if (did) { ps = res + ps.slice(pos); tflag = true; if (cmd.p) emit(ps); if (cmd.w != null) ctx.wr(cmd.w, ps); }
            break;
          }
          case 'y': ps = Array.from(ps).map(function (ch) { return cmd.map[ch] != null ? cmd.map[ch] : ch; }).join(''); break;
          case 'p': emit(ps); break;
          case 'P': emit(ps.split('\n')[0]); break;
          case 'd': endCycle = true; noPrint = true; break;
          case 'D': { var nl = ps.indexOf('\n'); if (nl < 0) { endCycle = true; noPrint = true; } else { ps = ps.slice(nl + 1); endCycle = true; noPrint = true; restart = true; } break; }
          case 'q': quit = true; qcode = cmd.code || 0; break;
          case 'Q': quit = true; noPrint = true; qcode = cmd.code || 0; break;
          case 'n': if (li >= all.length) { quit = true; } else { if (!o.n) emit(ps); append.forEach(emit); append = []; ps = all[li++]; ln++; last = li >= all.length; } break;
          case 'N': if (li >= all.length) { quit = true; } else { ps += '\n' + all[li++]; ln++; last = li >= all.length; } break;
          case 'g': ps = hold; break;
          case 'G': ps += '\n' + hold; break;
          case 'h': hold = ps; break;
          case 'H': hold += '\n' + ps; break;
          case 'x': { var tmp = ps; ps = hold; hold = tmp; break; }
          case '=': emit(String(ln)); break;
          case 'l': emit(ps.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n') + '$'); break;
          case 'a': append.push(cmd.text); break;
          case 'i': emit(cmd.text); break;
          case 'c': {
            var rg = cmd.a2 && !cmd.neg;
            if (!rg || !states[pc].on) emit(cmd.text);
            endCycle = true; noPrint = true; break;
          }
          case 'r': { var rn = ctx.sh.fs.get(ctx.sh.abs(cmd.file)); if (rn && rn.t === 'f') append.push(String(rn.c || '').replace(/\n$/, '')); break; }
          case 'w': ctx.wr(cmd.file, ps); break;
          case 'b': pc = cmd.to - 1; break;
          case 't': if (tflag) { tflag = false; pc = cmd.to - 1; } break;
          case 'T': if (!tflag) pc = cmd.to - 1; else tflag = false; break;
        }
        pc++;
      }
      if (!noPrint && !o.n) emit(ps);
      append.forEach(emit);
      if (restart) { ln = ln; }
    }
  }
  /* khi quit giữa chừng, in phần còn lại? (q: không) */
  ctx.ln0 = ln;
  return { text: outL.length ? outL.join('\n') + '\n' : '', code: qcode, quit: quit };
}
cmds.sed = function (a, c) {
  var sh = c.sh, o = { n: false, i: false, bak: '', E: false, s: false }, exprs = [], files = [], i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-n' || x === '--quiet' || x === '--silent') o.n = true;
    else if (x === '-i' || x === '--in-place') o.i = true;
    else if (/^-i./.test(x) && x.charAt(1) === 'i') { o.i = true; o.bak = x.slice(2); }
    else if (/^--in-place=/.test(x)) { o.i = true; o.bak = x.split('=')[1]; }
    else if (x === '-E' || x === '-r' || x === '--regexp-extended') o.E = true;
    else if (x === '-s' || x === '--separate') o.s = true;
    else if (x === '-e') exprs.push(a[++i]);
    else if (/^--expression=/.test(x)) exprs.push(x.slice(13));
    else if (x === '-f') { var sn = sh.fs.get(sh.abs(a[++i])); if (!sn) throw new CmdErr("sed: couldn't open file " + a[i] + ': No such file or directory'); exprs.push(String(sn.c || '').replace(/\n$/, '')); }
    else if (/^-[nEris]+$/.test(x)) { if (x.indexOf('n') > 0) o.n = true; if (/[Er]/.test(x)) o.E = true; if (x.indexOf('s') > 0) o.s = true; }
    else if (/^-n[eE]/.test(x) || x === '-ne') { o.n = true; if (x === '-ne') exprs.push(a[++i]); }
    else if (x === '--posix' || x === '-u' || x === '--debug') continue;
    else if (x.charAt(0) === '-' && x.length > 1) throw new CmdErr("sed: invalid option -- '" + x.slice(1) + "'\nUsage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...");
    else if (!exprs.length) exprs.push(x); else files.push(x);
  }
  if (!exprs.length) throw new CmdErr('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...');
  var prog = parseSed(exprs.join('\n'), o.E);
  var wfiles = {};
  var ctx = { sh: sh, ln0: 0, wr: function (fn, s) { if (fn === '/dev/stdout') { c.out(s + '\n'); return; } wfiles[fn] = (wfiles[fn] || '') + s + '\n'; } };
  var rc = 0;
  function flushW() { Object.keys(wfiles).forEach(function (fn) { sh.writeFile(sh.abs(fn), wfiles[fn], c, 'sed'); }); wfiles = {}; }
  if (!files.length) { var r0 = sedRun(prog, o, String(c.stdin || ''), ctx); c.out(r0.text); flushW(); return r0.code; }
  var cat = '';
  files.forEach(function (p) {
    var full = sh.abs(p), nd = sh.fs.get(full);
    if (!nd) { c.err("sed: can't read " + p + ': No such file or directory\n'); rc = 2; return; }
    if (nd.t === 'd') { c.err('sed: couldn\'t edit ' + p + ': not a regular file\n'); rc = 4; return; }
    var txt;
    try { txt = sh.readFile(full, c, 'sed'); } catch (e) { if (e instanceof CmdErr) { c.err("sed: can't read " + p + ': Permission denied\n'); rc = 2; return; } throw e; }
    if (o.i) {
      if (!sh.canWrite(full, c)) { c.err("sed: couldn't open temporary file " + sh.fs.parent(full) + '/sedXXXXXX: Permission denied\n'); rc = 4; return; }
      ctx.ln0 = 0;
      var r = sedRun(prog, o, txt, ctx);
      if (o.bak) sh.fs.put(full + o.bak, nd.c, { owner: nd.owner });
      sh.writeFile(full, r.text, c, 'sed');
    } else if (o.s) { ctx.ln0 = 0; var r2 = sedRun(prog, o, txt, ctx); c.out(r2.text); }
    else cat += txt.replace(/([^\n])$/, '$1\n');
  });
  if (!o.i && !o.s) { var r3 = sedRun(prog, o, cat, ctx); c.out(r3.text); if (r3.code) rc = r3.code; }
  flushW();
  return rc;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
