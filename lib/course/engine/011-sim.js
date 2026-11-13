(function (G) {
'use strict';
/* awk mô phỏng đầy đủ hơn: mẫu, BEGIN/END, biến, mảng kết hợp, printf, so sánh, hàm cơ bản */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr;
var prevAwk = cmds.awk;

function PErr(m) { var e = new Error(m); e.isParse = true; return e; }
function lex(src) {
  var t = [], i = 0, n = src.length, c, prevOperand = false;
  function push(k, v) { t.push({ k: k, v: v }); prevOperand = (k === 'num' || k === 'str' || k === 'id' || k === 're' || (k === 'op' && (v === ')' || v === ']'))); }
  while (i < n) {
    c = src.charAt(i);
    if (c === '\n' || c === ';') { push('op', ';'); prevOperand = false; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < n && src.charAt(i) !== '\n') i++; continue; }
    if (/[0-9.]/.test(c) && !(c === '.' && !/[0-9]/.test(src.charAt(i + 1)))) { var m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/.exec(src.slice(i)); push('num', parseFloat(m[1])); i += m[1].length; continue; }
    if (/[A-Za-z_]/.test(c)) { var id = /^[A-Za-z_]\w*/.exec(src.slice(i))[0]; push('id', id); i += id.length; continue; }
    if (c === '"') { var j = i + 1, b = ''; while (j < n && src.charAt(j) !== '"') { if (src.charAt(j) === '\\') { j++; var e = src.charAt(j); b += e === 'n' ? '\n' : e === 't' ? '\t' : e === '\\' ? '\\' : e === '"' ? '"' : e === '/' ? '/' : '\\' + e; } else b += src.charAt(j); j++; } push('str', b); i = j + 1; continue; }
    if (c === '/' && !prevOperand) { var k = i + 1, rb = ''; while (k < n && src.charAt(k) !== '/') { if (src.charAt(k) === '\\' && src.charAt(k + 1) === '/') { rb += '/'; k += 2; continue; } rb += src.charAt(k); k++; } push('re', rb); i = k + 1; continue; }
    var two = src.substr(i, 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '++', '--', '!~'].indexOf(two) >= 0) { push('op', two); i += 2; continue; }
    if ('+-*/%<>=!~?:,(){}[]$^'.indexOf(c) >= 0) { push('op', c); i++; continue; }
    throw PErr('bad char ' + c);
  }
  return t;
}
function num(v) { if (typeof v === 'number') return v; var m = /^\s*[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+)/.exec(String(v)); return m ? parseFloat(m[0]) : 0; }
function isNumStr(v) { return typeof v === 'number' || /^\s*[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+)\s*$/.test(String(v)); }
function str(v) { if (typeof v === 'number') { if (Number.isInteger(v)) return String(v); var s = String(parseFloat(v.toPrecision(6))); return s; } return v == null ? '' : String(v); }
function parse(tokens) {
  var p = 0;
  function peek() { return tokens[p]; }
  function isOp(v) { var t = tokens[p]; return t && t.k === 'op' && t.v === v; }
  function eat(v) { if (!isOp(v)) throw PErr('expected ' + v); p++; }
  function skipSemi() { while (isOp(';')) p++; }
  function program() {
    var items = []; skipSemi();
    while (p < tokens.length) {
      var it = { kind: 'main', pat: null, body: null };
      var t = peek();
      if (t.k === 'id' && (t.v === 'BEGIN' || t.v === 'END')) { it.kind = t.v; p++; }
      else if (!isOp('{')) it.pat = expr();
      if (isOp('{')) it.body = block(); else if (it.kind !== 'main') throw PErr('block');
      items.push(it); skipSemi();
    }
    return items;
  }
  function block() { eat('{'); var st = []; skipSemi(); while (!isOp('}')) { if (p >= tokens.length) throw PErr('eof'); st.push(stmt()); skipSemi(); } eat('}'); return { t: 'block', st: st }; }
  function simpleEnd() { return p >= tokens.length || isOp(';') || isOp('}'); }
  function stmt() {
    var t = peek();
    if (isOp('{')) return block();
    if (t.k === 'id') {
      if (t.v === 'print' || t.v === 'printf') {
        p++; var args = [];
        if (!simpleEnd()) { args.push(expr(true)); while (isOp(',')) { p++; args.push(expr(true)); } }
        return { t: t.v, args: args };
      }
      if (t.v === 'if') { p++; eat('('); var c = expr(); eat(')'); skipSemi(); var a = stmt(); skipSemi(); var b = null; if (peek() && peek().k === 'id' && peek().v === 'else') { p++; skipSemi(); b = stmt(); } return { t: 'if', c: c, a: a, b: b }; }
      if (t.v === 'for') {
        p++; eat('('); var save = p;
        if (peek().k === 'id' && tokens[p + 1] && tokens[p + 1].k === 'id' && tokens[p + 1].v === 'in') { var v = peek().v; p += 2; var arr = peek().v; p++; eat(')'); skipSemi(); return { t: 'forin', v: v, arr: arr, body: stmt() }; }
        p = save; var init = isOp(';') ? null : expr(); eat(';'); var cond = isOp(';') ? null : expr(); eat(';'); var step = isOp(')') ? null : expr(); eat(')'); skipSemi(); return { t: 'for', init: init, cond: cond, step: step, body: stmt() };
      }
      if (t.v === 'next') { p++; return { t: 'next' }; }
      if (t.v === 'exit') { p++; return { t: 'exit' }; }
    }
    return { t: 'expr', e: expr() };
  }
  /* biểu thức; noGt: đang trong print nên '>' không phải so sánh (chuyển hướng bị bỏ qua) */
  var noGt = false;
  function expr(ng) { var sv = noGt; noGt = !!ng; try { return assign(); } finally { noGt = sv; } }
  function assign() {
    var l = ternary();
    var t = peek();
    if (t && t.k === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].indexOf(t.v) >= 0 && (l.t === 'var' || l.t === 'idx' || l.t === 'field')) { p++; return { t: 'asg', op: t.v, l: l, r: assign() }; }
    return l;
  }
  function ternary() { var c = orx(); if (isOp('?')) { p++; var a = assign(); eat(':'); var b = assign(); return { t: 'tern', c: c, a: a, b: b }; } return c; }
  function orx() { var l = andx(); while (isOp('||')) { p++; l = { t: 'or', l: l, r: andx() }; } return l; }
  function andx() { var l = inx(); while (isOp('&&')) { p++; l = { t: 'and', l: l, r: inx() }; } return l; }
  function inx() { var l = match(); while (peek() && peek().k === 'id' && peek().v === 'in') { p++; var a = peek().v; p++; l = { t: 'in', k: l, arr: a }; } return l; }
  function match() { var l = cmp(); while (isOp('~') || isOp('!~')) { var neg = peek().v === '!~'; p++; l = { t: 'match', l: l, r: cmp(), neg: neg }; } return l; }
  function cmp() {
    var l = concat(), t = peek();
    while (t && t.k === 'op' && (['==', '!=', '<', '<=', '>='].indexOf(t.v) >= 0 || (t.v === '>' && !noGt))) { p++; l = { t: 'cmp', op: t.v, l: l, r: concat() }; t = peek(); }
    return l;
  }
  function startsPrimary() { var t = peek(); if (!t) return false; if (t.k === 'num' || t.k === 'str' || t.k === 're') return true; if (t.k === 'id') return ['in', 'else'].indexOf(t.v) < 0; return t.k === 'op' && (t.v === '$' || t.v === '(' || t.v === '!' ); }
  function concat() { var l = add(); while (startsPrimary() && !(peek().k === 'op' && peek().v === '!')) { l = { t: 'cat', l: l, r: add() }; } return l; }
  function add() { var l = mul(); while (isOp('+') || isOp('-')) { var o = peek().v; p++; l = { t: 'bin', op: o, l: l, r: mul() }; } return l; }
  function mul() { var l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { var o = peek().v; p++; l = { t: 'bin', op: o, l: l, r: unary() }; } return l; }
  function unary() {
    if (isOp('!')) { p++; return { t: 'not', e: unary() }; }
    if (isOp('-')) { p++; return { t: 'neg', e: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return pow();
  }
  function pow() { var l = post(); if (isOp('^')) { p++; return { t: 'bin', op: '^', l: l, r: unary() }; } return l; }
  function post() {
    if (isOp('++') || isOp('--')) { var o = peek().v; p++; var tg = primary(); return { t: 'inc', pre: true, d: o === '++' ? 1 : -1, l: tg }; }
    var e = primary();
    if ((isOp('++') || isOp('--')) && (e.t === 'var' || e.t === 'idx' || e.t === 'field')) { var o2 = peek().v; p++; return { t: 'inc', pre: false, d: o2 === '++' ? 1 : -1, l: e }; }
    return e;
  }
  function primary() {
    var t = peek(); if (!t) throw PErr('eof');
    if (t.k === 'num') { p++; return { t: 'num', v: t.v }; }
    if (t.k === 'str') { p++; return { t: 'str', v: t.v }; }
    if (t.k === 're') { p++; return { t: 'rematch', re: t.v }; }
    if (isOp('(')) { p++; var e = assign(); eat(')'); return { t: 'group', e: e }; }
    if (isOp('$')) { p++; return { t: 'field', e: primaryField() }; }
    if (t.k === 'id') {
      p++;
      if (isOp('(')) { p++; var args = []; if (!isOp(')')) { args.push(assign()); while (isOp(',')) { p++; args.push(assign()); } } eat(')'); return { t: 'call', f: t.v, args: args }; }
      if (isOp('[')) { p++; var k = assign(); while (isOp(',')) { p++; k = { t: 'cat', l: { t: 'cat', l: k, r: { t: 'str', v: '\x1c' } }, r: assign() }; } eat(']'); return { t: 'idx', a: t.v, k: k }; }
      if (['length'].indexOf(t.v) >= 0) return { t: 'call', f: t.v, args: [] };
      return { t: 'var', n: t.v };
    }
    throw PErr('unexpected');
  }
  function primaryField() { if (isOp('(')) { p++; var e = assign(); eat(')'); return e; } if (isOp('-') ) { p++; return { t: 'neg', e: primaryField() }; } return primary(); }
  var items = program();
  return items;
}

function run(items, ctx, c) {
  var vars = Object.assign({ NR: 0, NF: 0, FS: ctx.fs, OFS: ' ' }, ctx.vars), arrs = {}, fields = [], line = '', outBuf = [], exited = false, nextFlag = false;
  function split(s, fs) {
    if (fs === ' ' || fs == null) return s.split(/[ \t]+/).filter(Boolean);
    if (fs === '\\t') fs = '\t';
    if (fs.length === 1 && fs !== ' ') return s.split(fs);
    try { return s.split(new RegExp(fs)); } catch (e) { return s.split(fs); }
  }
  function setLine(l) { line = l; fields = split(l, String(vars.FS)); vars.NF = fields.length; }
  function getField(i) { i = Math.floor(num(i)); if (i === 0) return line; return fields[i - 1] != null ? fields[i - 1] : ''; }
  function arr(n) { return arrs[n] || (arrs[n] = {}); }
  function cmpVals(a, b) { if (isNumStr(a) && isNumStr(b)) { var x = num(a), y = num(b); return x < y ? -1 : x > y ? 1 : 0; } var s = str(a), t = str(b); return s < t ? -1 : s > t ? 1 : 0; }
  function re(s) { try { return new RegExp(s); } catch (e) { return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); } }
  function fmt(f, args) {
    var ai = 0;
    return f.replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdifxXcego%])/g, function (m, fl, w, pr, ty) {
      if (ty === '%') return '%';
      var v = args[ai++], o;
      if (ty === 's') { o = str(v); if (pr != null) o = o.slice(0, +pr); }
      else if (ty === 'd' || ty === 'i') { o = String(Math.trunc(num(v))); if (fl.indexOf('+') >= 0 && num(v) >= 0) o = '+' + o; }
      else if (ty === 'f') o = num(v).toFixed(pr == null ? 6 : +pr);
      else if (ty === 'e') o = num(v).toExponential(pr == null ? 6 : +pr);
      else if (ty === 'g') o = String(parseFloat(num(v).toPrecision(pr == null ? 6 : +pr || 1)));
      else if (ty === 'x') o = Math.trunc(num(v)).toString(16); else if (ty === 'X') o = Math.trunc(num(v)).toString(16).toUpperCase();
      else if (ty === 'c') o = typeof v === 'number' ? String.fromCharCode(v) : str(v).charAt(0); else o = str(v);
      if (w) { var wn = +w; if (o.length < wn) o = fl.indexOf('-') >= 0 ? o + ' '.repeat(wn - o.length) : (fl.indexOf('0') >= 0 && ty !== 's' ? '0'.repeat(wn - o.length) + o : ' '.repeat(wn - o.length) + o); }
      return o;
    });
  }
  function setL(l, v) {
    if (l.t === 'var') vars[l.n] = v; else if (l.t === 'idx') arr(l.a)[str(ev(l.k))] = v; else if (l.t === 'field') { var i = Math.floor(num(ev(l.e))); if (i === 0) setLine(str(v)); else { while (fields.length < i) fields.push(''); fields[i - 1] = str(v); line = fields.join(String(vars.OFS)); vars.NF = fields.length; } }
    return v;
  }
  function getL(l) { if (l.t === 'var') return vars[l.n] != null ? vars[l.n] : ''; if (l.t === 'idx') { var a = arr(l.a), k = str(ev(l.k)); return a[k] != null ? a[k] : ''; } return getField(ev(l.e)); }
  function ev(e) {
    switch (e.t) {
      case 'num': return e.v; case 'str': return e.v; case 'group': return ev(e.e);
      case 'rematch': return re(e.re).test(line) ? 1 : 0;
      case 'var': return vars[e.n] != null ? vars[e.n] : '';
      case 'idx': case 'field': return getL(e);
      case 'asg': { var r = ev(e.r), cur = e.op === '=' ? null : num(getL(e.l)), nv; if (e.op === '=') nv = r; else if (e.op === '+=') nv = cur + num(r); else if (e.op === '-=') nv = cur - num(r); else if (e.op === '*=') nv = cur * num(r); else if (e.op === '/=') nv = cur / num(r); else nv = cur % num(r); return setL(e.l, nv); }
      case 'inc': { var old = num(getL(e.l)); setL(e.l, old + e.d); return e.pre ? old + e.d : old; }
      case 'tern': return truth(ev(e.c)) ? ev(e.a) : ev(e.b);
      case 'or': return truth(ev(e.l)) || truth(ev(e.r)) ? 1 : 0;
      case 'and': return truth(ev(e.l)) && truth(ev(e.r)) ? 1 : 0;
      case 'not': return truth(ev(e.e)) ? 0 : 1;
      case 'neg': return -num(ev(e.e));
      case 'in': return Object.prototype.hasOwnProperty.call(arr(e.arr), str(ev(e.k))) ? 1 : 0;
      case 'match': { var m = e.r.t === 'rematch' ? re(e.r.re).test(str(ev(e.l))) : re(str(ev(e.r))).test(str(ev(e.l))); return (e.neg ? !m : m) ? 1 : 0; }
      case 'cmp': { var a = ev(e.l), b = ev(e.r), cr = cmpVals(a, b); return ({ '==': cr === 0, '!=': cr !== 0, '<': cr < 0, '<=': cr <= 0, '>': cr > 0, '>=': cr >= 0 })[e.op] ? 1 : 0; }
      case 'cat': return str(ev(e.l)) + str(ev(e.r));
      case 'bin': { var x = num(ev(e.l)), y = num(ev(e.r)); return e.op === '+' ? x + y : e.op === '-' ? x - y : e.op === '*' ? x * y : e.op === '/' ? (y === 0 ? (function () { throw new CmdErr('awk: division by zero'); })() : x / y) : e.op === '%' ? x % y : Math.pow(x, y); }
      case 'call': return call(e);
    }
    throw new CmdErr('awk: lỗi nội bộ');
  }
  function truth(v) { if (typeof v === 'number') return v !== 0; return v !== '' && v != null && !(isNumStr(v) && num(v) === 0 && false); }
  function call(e) {
    var a = e.args.map(ev), f = e.f;
    if (f === 'length') return e.args.length ? str(a[0]).length : line.length;
    if (f === 'tolower') return str(a[0]).toLowerCase(); if (f === 'toupper') return str(a[0]).toUpperCase();
    if (f === 'substr') { var s = str(a[0]), st = Math.max(1, Math.floor(num(a[1]))), ln = a.length > 2 ? Math.floor(num(a[2])) : s.length; return s.substr(st - 1, ln); }
    if (f === 'index') return str(a[0]).indexOf(str(a[1])) + 1;
    if (f === 'int') return Math.trunc(num(a[0])); if (f === 'sqrt') return Math.sqrt(num(a[0]));
    if (f === 'sprintf') return fmt(str(a[0]), a.slice(1));
    if (f === 'split') { var parts = split(str(a[0]), a.length > 2 ? str(a[2]) : ' '), ar = {}; parts.forEach(function (x, i) { ar[String(i + 1)] = x; }); arrs[e.args[1].n || e.args[1].a] = ar; return parts.length; }
    if (f === 'match') { var mm = re(str(a[1])).exec(str(a[0])); vars.RSTART = mm ? mm.index + 1 : 0; vars.RLENGTH = mm ? mm[0].length : -1; return vars.RSTART; }
    if (f === 'sub' || f === 'gsub') { var tg = e.args[2] || { t: 'field', e: { t: 'num', v: 0 } }, cur = str(ev(tg)), rx = new RegExp(str(a[0]) || (e.args[0].re || ''), f === 'gsub' ? 'g' : ''); if (e.args[0].t === 'rematch') rx = new RegExp(e.args[0].re, f === 'gsub' ? 'g' : ''); var cnt = (cur.match(rx) || []).length; if (cnt) setL(tg, cur.replace(rx, str(a[1]).replace(/&/g, '$&'))); return cnt; }
    throw new CmdErr('awk: hàm chưa hỗ trợ: ' + f);
  }
  function exec(s) {
    if (exited || nextFlag) return;
    switch (s.t) {
      case 'block': for (var i = 0; i < s.st.length; i++) { exec(s.st[i]); if (exited || nextFlag) return; } return;
      case 'expr': ev(s.e); return;
      case 'print': outBuf.push((s.args.length ? s.args.map(function (x) { return str(ev(x)); }).join(String(vars.OFS)) : line) + '\n'); return;
      case 'printf': { var av = s.args.map(ev); outBuf.push(fmt(str(av[0]), av.slice(1))); return; }
      case 'if': if (truth(ev(s.c))) exec(s.a); else if (s.b) exec(s.b); return;
      case 'forin': { var ks = Object.keys(arr(s.arr)); for (var j = 0; j < ks.length; j++) { vars[s.v] = ks[j]; exec(s.body); if (exited || nextFlag) return; } return; }
      case 'for': { if (s.init) ev(s.init); var guard = 0; while ((!s.cond || truth(ev(s.cond))) && guard++ < 100000) { exec(s.body); if (exited || nextFlag) return; if (s.step) ev(s.step); } return; }
      case 'next': nextFlag = true; return;
      case 'exit': exited = true; return;
    }
  }
  items.filter(function (x) { return x.kind === 'BEGIN'; }).forEach(function (x) { exec(x.body); });
  if (!exited) {
    var mains = items.filter(function (x) { return x.kind === 'main'; });
    if (mains.length || items.some(function (x) { return x.kind === 'END'; })) {
      ctx.lines.forEach(function (l) {
        if (exited) return; vars.NR++; setLine(l); nextFlag = false;
        mains.forEach(function (it) { if (exited || nextFlag) return; if (it.pat && !truth(ev(it.pat))) return; if (it.body) exec(it.body); else outBuf.push(line + '\n'); });
      });
    }
    nextFlag = false;
    items.filter(function (x) { return x.kind === 'END'; }).forEach(function (x) { exited = false; exec(x.body); });
  }
  c.out(outBuf.join(''));
}

cmds.awk = function (a, c) {
  var sh = c.sh, fs = ' ', prog = null, files = [], vars = {}, i;
  for (i = 0; i < a.length; i++) {
    if (a[i] === '-F') fs = a[++i];
    else if (/^-F./.test(a[i])) fs = a[i].slice(2);
    else if (a[i] === '-v') { var kv = String(a[++i]).split('='); vars[kv[0]] = isNumStr(kv.slice(1).join('=')) && kv.slice(1).join('=') !== '' ? parseFloat(kv.slice(1).join('=')) : kv.slice(1).join('='); }
    else if (prog == null) prog = a[i];
    else files.push(a[i]);
  }
  if (prog == null) throw new CmdErr('usage: awk [-F fs][-v var=value] \'prog\' [file ...]');
  var items;
  try { items = parse(lex(prog)); } catch (e) { if (e.isParse) return prevAwk(a, c); throw e; }
  var text = files.length ? files.map(function (p) { return sh.readFile(sh.abs(p), c, 'awk'); }).join('') : (c.stdin || '');
  var lines = text.split('\n'); if (lines.length && lines[lines.length - 1] === '') lines.pop();
  try { run(items, { fs: fs, vars: vars, lines: lines }, c); } catch (e) { if (e.isParse) return prevAwk(a, c); throw e; }
  return 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
