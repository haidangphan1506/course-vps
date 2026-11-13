(function (G) {
'use strict';
/* awk đầy đủ hơn (kiểu POSIX / mawk): pattern, range, BEGIN/END, hàm do người dùng, while/do/for, break/continue, getline,
   print > file, print | cmd, -f progfile, -v, FS/OFS/ORS/RS, FNR/FILENAME, NF gán, mảng, delete, printf, sub/gsub/match/split... */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, mkRx = V.mkRx;

var KW = { BEGIN: 1, END: 1, function: 1, func: 1, if: 1, else: 1, while: 1, do: 1, for: 1, in: 1, break: 1, continue: 1, next: 1, nextfile: 1, exit: 1, return: 1, delete: 1, getline: 1, print: 1, printf: 1 };
function SynErr(near, line) { var e = new Error('syntax'); e.syn = true; e.near = near; e.line = line || 1; return e; }
function AArr() { this.m = new Map(); }
function RunErr(msg) { var e = new Error(msg); e.run = true; return e; }

function lex(src) {
  var t = [], i = 0, n = src.length, line = 1, prevOperand = false;
  function push(k, v) { t.push({ k: k, v: v, line: line }); prevOperand = k === 'num' || k === 'str' || (k === 'id' && !KW[v]) || (k === 'op' && (v === ')' || v === ']' || v === '++' || v === '--')) || (k === 'id' && v === 'getline'); }
  while (i < n) {
    var c = src.charAt(i);
    if (c === '\n') { push('nl', '\n'); prevOperand = false; line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '\\' && src.charAt(i + 1) === '\n') { i += 2; line++; continue; }
    if (c === '#') { while (i < n && src.charAt(i) !== '\n') i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
      var m = /^(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
      push('num', m[0].toLowerCase().indexOf('0x') === 0 ? parseInt(m[0], 16) : parseFloat(m[0])); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) { var id = /^[A-Za-z_]\w*/.exec(src.slice(i))[0]; i += id.length; push('id', id === 'func' ? 'function' : id); if (src.charAt(i) === '(' && !KW[id]) t[t.length - 1].call = true; continue; }
    if (c === '"') {
      var j = i + 1, b = '';
      while (j < n && src.charAt(j) !== '"') {
        var ch = src.charAt(j);
        if (ch === '\n') throw SynErr('runaway string constant "' + b.slice(0, 10) + ' ...', line);
        if (ch === '\\') {
          j++; var e = src.charAt(j);
          if (e === 'n') b += '\n'; else if (e === 't') b += '\t'; else if (e === '\\') b += '\\'; else if (e === '"') b += '"'; else if (e === '/') b += '/'; else if (e === 'r') b += '\r'; else if (e === 'a') b += '\x07'; else if (e === 'b') b += '\b'; else if (e === 'f') b += '\f'; else if (e === 'v') b += '\v';
          else if (/[0-7]/.test(e)) { var om = /^[0-7]{1,3}/.exec(src.slice(j)); b += String.fromCharCode(parseInt(om[0], 8)); j += om[0].length - 1; }
          else if (e === '\n') { line++; }
          else b += '\\' + e;
          j++; continue;
        }
        b += ch; j++;
      }
      if (j >= n) throw SynErr('runaway string constant "' + b.slice(0, 10) + ' ...', line);
      push('str', b); i = j + 1; continue;
    }
    if (c === '/' && !prevOperand) {
      var k = i + 1, rb = '', inBr = false;
      while (k < n && (src.charAt(k) !== '/' || inBr)) {
        var rc = src.charAt(k);
        if (rc === '\n') throw SynErr('runaway regular expression /' + rb.slice(0, 10) + ' ...', line);
        if (rc === '\\' && k + 1 < n) { if (src.charAt(k + 1) === '/') { rb += '/'; k += 2; continue; } rb += rc + src.charAt(k + 1); k += 2; continue; }
        if (rc === '[') inBr = true; else if (rc === ']') inBr = false;
        rb += rc; k++;
      }
      if (k >= n) throw SynErr('runaway regular expression /' + rb.slice(0, 10) + ' ...', line);
      push('re', rb); i = k + 1; continue;
    }
    var three = src.substr(i, 3), two = src.substr(i, 2);
    if (three === '**=') { push('op', '^='); i += 3; continue; }
    if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '^=', '++', '--', '!~', '>>', '**'].indexOf(two) >= 0) { push('op', two === '**' ? '^' : two); i += 2; continue; }
    if ('+-*/%<>=!~?:,;(){}[]$^|'.indexOf(c) >= 0) { push('op', c === ';' ? ';' : c); i++; continue; }
    throw SynErr(c, line);
  }
  return t;
}

function parse(tokens) {
  var p = 0, items = [], funcs = {};
  function peek() { return tokens[p]; }
  function isOp(v) { var t = tokens[p]; return !!t && t.k === 'op' && t.v === v; }
  function isId(v) { var t = tokens[p]; return !!t && t.k === 'id' && t.v === v; }
  function near() { var t = tokens[p] || tokens[tokens.length - 1]; return t ? (t.k === 'nl' ? 'end of line' : t.k === 'str' ? '"' + t.v + '"' : String(t.v)) : 'end of file'; }
  function fail() { var t = tokens[p] || tokens[tokens.length - 1] || {}; throw SynErr(tokens[p] ? near() : 'end of file', t.line || 1); }
  function eat(v) { if (!isOp(v)) fail(); p++; }
  function optNl() { while (peek() && peek().k === 'nl') p++; }
  function skipTerms() { while (peek() && (peek().k === 'nl' || isOp(';'))) p++; }
  function program() {
    skipTerms();
    while (p < tokens.length) {
      var it = { kind: 'main', pat: null, pat2: null, body: null, on: false };
      if (isId('function')) { p++; var nm = peek(); if (!nm || nm.k !== 'id') fail(); p++; eat('('); var ps = []; optNl(); while (!isOp(')')) { var q = peek(); if (!q || q.k !== 'id') fail(); ps.push(q.v); p++; optNl(); if (isOp(',')) { p++; optNl(); } } eat(')'); optNl(); funcs[nm.v] = { params: ps, body: block() }; skipTerms(); continue; }
      if (isId('BEGIN') || isId('END')) { it.kind = peek().v; p++; optNl(); if (!isOp('{')) fail(); it.body = block(); items.push(it); skipTerms(); continue; }
      if (!isOp('{')) { it.pat = expr(); if (isOp(',')) { p++; optNl(); it.pat2 = expr(); } }
      if (isOp('{')) it.body = block();
      items.push(it); skipTerms();
    }
  }
  function block() { eat('{'); var st = []; skipTerms(); while (!isOp('}')) { if (p >= tokens.length) fail(); st.push(stmt()); skipTerms(); } eat('}'); return { t: 'block', st: st }; }
  function endSimple() { /* kết thúc câu lệnh đơn */
    if (p >= tokens.length || isOp('}')) return;
    if (isOp(';') || peek().k === 'nl') { p++; return; }
    fail();
  }
  function simpleBody() { /* thân của if/while/for: có thể rỗng ';' */
    optNl();
    if (isOp(';')) { p++; return { t: 'block', st: [] }; }
    return stmt();
  }
  function stmt() {
    var t = peek();
    if (!t) fail();
    if (isOp('{')) return block();
    if (t.k === 'id') {
      switch (t.v) {
        case 'if': {
          p++; eat('('); var c = expr(); eat(')'); var a = simpleBody(), b = null, sv = p;
          skipTerms(); if (isId('else')) { p++; b = simpleBody(); } else p = sv;
          return { t: 'if', c: c, a: a, b: b };
        }
        case 'while': { p++; eat('('); var wc = expr(); eat(')'); if (isOp(';')) { p++; return { t: 'while', c: wc, body: { t: 'block', st: [] } }; } return { t: 'while', c: wc, body: simpleBody() }; }
        case 'do': { p++; var db = simpleBody(); skipTerms(); if (!isId('while')) fail(); p++; eat('('); var dc = expr(); eat(')'); endSimple(); return { t: 'do', c: dc, body: db }; }
        case 'for': {
          p++; eat('(');
          if (peek() && peek().k === 'id' && tokens[p + 1] && tokens[p + 1].k === 'id' && tokens[p + 1].v === 'in' && tokens[p + 2] && tokens[p + 2].k === 'id' && tokens[p + 3] && tokens[p + 3].k === 'op' && tokens[p + 3].v === ')') {
            var kv = peek().v, ar = tokens[p + 2].v; p += 4; return { t: 'forin', v: kv, arr: ar, body: simpleBody() };
          }
          var init = null, cond = null, step = null;
          if (!isOp(';')) init = simpleStmtExpr(); eat(';'); optNl();
          if (!isOp(';')) cond = expr(); eat(';'); optNl();
          if (!isOp(')')) step = simpleStmtExpr(); eat(')');
          if (isOp(';')) { p++; return { t: 'for', init: init, cond: cond, step: step, body: { t: 'block', st: [] } }; }
          return { t: 'for', init: init, cond: cond, step: step, body: simpleBody() };
        }
        case 'break': case 'continue': case 'next': case 'nextfile': p++; endSimple(); return { t: t.v };
        case 'exit': case 'return': { p++; var e = null; if (!(p >= tokens.length || isOp(';') || isOp('}') || peek().k === 'nl')) e = expr(); endSimple(); return { t: t.v, e: e }; }
        case 'delete': { p++; var nm = peek(); if (!nm || nm.k !== 'id') fail(); p++; var k = null; if (isOp('[')) { p++; k = subscript(); eat(']'); } endSimple(); return { t: 'delete', a: nm.v, k: k }; }
        case 'print': case 'printf': {
          p++; var args = [], red = null;
          if (!(p >= tokens.length || isOp(';') || isOp('}') || peek().k === 'nl' || isOp('>') || isOp('>>') || isOp('|'))) {
            var sv2 = p, done = false;
            if (isOp('(')) {
              try { p++; var lst = [expr()]; while (isOp(',')) { p++; optNl(); lst.push(expr()); } eat(')'); if (p >= tokens.length || isOp(';') || isOp('}') || peek().k === 'nl' || isOp('>') || isOp('>>') || isOp('|')) { args = lst; done = true; } } catch (e2) { if (!e2.syn) throw e2; }
              if (!done) p = sv2;
            }
            if (!done) { args.push(expr(true)); while (isOp(',')) { p++; optNl(); args.push(expr(true)); } }
          }
          if (isOp('>') || isOp('>>') || isOp('|')) { var kind = peek().v; p++; red = { kind: kind, e: concatNoCmp() }; }
          endSimple();
          return { t: t.v, args: args, red: red };
        }
      }
    }
    var ex = expr(); endSimple(); return { t: 'expr', e: ex };
  }
  function simpleStmtExpr() { return expr(); }
  var noGt = false, noIn = false;
  function expr(ng) { var sv = noGt; noGt = !!ng; try { return assign(); } finally { noGt = sv; } }
  function isLv(e) { return e.t === 'var' || e.t === 'idx' || e.t === 'field'; }
  function assign() {
    var l = ternary(), t = peek();
    if (t && t.k === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '^='].indexOf(t.v) >= 0 && isLv(l)) { p++; optNl(); return { t: 'asg', op: t.v, l: l, r: assign() }; }
    return l;
  }
  function ternary() { var c = orx(); if (isOp('?')) { p++; optNl(); var a = assign(); optNl(); eat(':'); optNl(); var b = assign(); return { t: 'tern', c: c, a: a, b: b }; } return c; }
  function orx() { var l = andx(); while (isOp('||')) { p++; optNl(); l = { t: 'or', l: l, r: andx() }; } return l; }
  function andx() { var l = inx(); while (isOp('&&')) { p++; optNl(); l = { t: 'and', l: l, r: inx() }; } return l; }
  function inx() { var l = matchx(); while (isId('in')) { p++; var a = peek(); if (!a || a.k !== 'id') fail(); p++; l = { t: 'in', k: l, arr: a.v }; } return l; }
  function matchx() { var l = cmpx(); while (isOp('~') || isOp('!~')) { var neg = peek().v === '!~'; p++; l = { t: 'match', l: l, r: cmpx(), neg: neg }; } return l; }
  function cmpx() {
    var l = concat(), t = peek();
    while (t && t.k === 'op' && (['==', '!=', '<', '<=', '>='].indexOf(t.v) >= 0 || (t.v === '>' && !noGt))) { p++; l = { t: 'cmp', op: t.v, l: l, r: concat() }; t = peek(); }
    return l;
  }
  function concatNoCmp() { return concat(); }
  function startsPrimary() {
    var t = peek(); if (!t) return false;
    if (t.k === 'num' || t.k === 'str' || t.k === 're') return true;
    if (t.k === 'id') return !KW[t.v] || t.v === 'getline' && false;
    return t.k === 'op' && (t.v === '$' || t.v === '(' || t.v === '!' || t.v === '-' && false || t.v === '++' || t.v === '--');
  }
  function concat() {
    var l = add();
    for (;;) {
      if (isOp('|') && tokens[p + 1] && tokens[p + 1].k === 'id' && tokens[p + 1].v === 'getline') { p += 2; var lv = optLvalue(); l = { t: 'getline', src: 'cmd', cmd: l, lv: lv }; continue; }
      if (startsPrimary() && !isOp('!')) { var r = add(); l = { t: 'cat', l: l, r: r }; continue; }
      break;
    }
    return l;
  }
  function optLvalue() {
    var t = peek();
    if (t && t.k === 'id' && !KW[t.v]) return primary();
    if (isOp('$')) return primary();
    return null;
  }
  function add() { var l = mul(); while (isOp('+') || isOp('-')) { var o = peek().v; p++; l = { t: 'bin', op: o, l: l, r: mul() }; } return l; }
  function mul() { var l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { var o = peek().v; p++; l = { t: 'bin', op: o, l: l, r: unary() }; } return l; }
  function unary() {
    if (isOp('!')) { p++; return { t: 'not', e: unary() }; }
    if (isOp('-')) { p++; return { t: 'neg', e: unary() }; }
    if (isOp('+')) { p++; return { t: 'plus', e: unary() }; }
    return pow();
  }
  function pow() { var l = post(); if (isOp('^')) { p++; return { t: 'bin', op: '^', l: l, r: unaryPow() }; } return l; }
  function unaryPow() { if (isOp('-')) { p++; return { t: 'neg', e: unaryPow() }; } if (isOp('+')) { p++; return unaryPow(); } return pow(); }
  function post() {
    if (isOp('++') || isOp('--')) { var o = peek().v; p++; var tg = primary(); if (!isLv(tg)) fail(); return { t: 'inc', pre: true, d: o === '++' ? 1 : -1, l: tg }; }
    var e = primary();
    if ((isOp('++') || isOp('--')) && isLv(e)) { var o2 = peek().v; p++; return { t: 'inc', pre: false, d: o2 === '++' ? 1 : -1, l: e }; }
    return e;
  }
  function subscript() { var k = assign(); if (isOp(',')) { var parts = [k]; while (isOp(',')) { p++; optNl(); parts.push(assign()); } k = { t: 'multi', parts: parts }; } return k; }
  function primary() {
    var t = peek(); if (!t) fail();
    if (t.k === 'num') { p++; return { t: 'num', v: t.v }; }
    if (t.k === 'str') { p++; return { t: 'str', v: t.v }; }
    if (t.k === 're') { p++; return { t: 'rematch', re: t.v }; }
    if (isOp('(')) {
      p++; optNl(); var sgt = noGt; noGt = false; var e = assign(); noGt = sgt;
      if (isOp(',')) { var parts = [e]; while (isOp(',')) { p++; optNl(); parts.push(assign()); } eat(')'); if (!isId('in')) fail(); p++; var an = peek(); if (!an || an.k !== 'id') fail(); p++; return { t: 'in', k: { t: 'multi', parts: parts }, arr: an.v }; }
      eat(')'); return { t: 'group', e: e };
    }
    if (isOp('$')) { p++; var fe; if (isOp('++') || isOp('--')) { fe = post(); } else if (isOp('-')) { p++; fe = { t: 'neg', e: primary() }; } else fe = primary(); return { t: 'field', e: fe }; }
    if (isOp('-')) { p++; return { t: 'neg', e: unary() }; }
    if (isOp('!')) { p++; return { t: 'not', e: unary() }; }
    if (t.k === 'id') {
      if (t.v === 'getline') {
        p++; var lv = optLvalue(), src = 'main', file = null;
        if (isOp('<')) { p++; src = 'file'; file = primaryNoConcat(); }
        return { t: 'getline', src: src, file: file, lv: lv };
      }
      if (KW[t.v]) fail();
      p++;
      if (t.call && isOp('(')) { p++; optNl(); var args = []; if (!isOp(')')) { args.push(assign()); optNl(); while (isOp(',')) { p++; optNl(); args.push(assign()); optNl(); } } eat(')'); return { t: 'call', f: t.v, args: args }; }
      if (isOp('[')) { p++; var k = subscript(); eat(']'); return { t: 'idx', a: t.v, k: k }; }
      if (t.v === 'length') return { t: 'call', f: 'length', args: [] };
      return { t: 'var', n: t.v };
    }
    fail();
  }
  function primaryNoConcat() { var sv = noGt; noGt = true; try { return post(); } finally { noGt = sv; } }
  program();
  return { items: items, funcs: funcs };
}

/* ---------- chạy ---------- */
function numOf(v) { if (typeof v === 'number') return v; if (v == null) return 0; var m = /^\s*[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+)/.exec(String(v)); if (!m) { var inf = /^\s*([+-]?)(inf|nan)/i.exec(String(v)); return 0; } return parseFloat(m[0]); }
function looksNum(v) { return typeof v === 'number' || (typeof v === 'string' && /^\s*[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)\s*$/.test(v)); }
function fmtG(v, prec, alt) {
  if (v === 0) return '0'; if (!isFinite(v)) return v > 0 ? 'inf' : v < 0 ? '-inf' : 'nan';
  prec = prec === 0 ? 1 : prec;
  var ex = Math.floor(Math.log10(Math.abs(v)));
  var r = Number(v.toPrecision(prec)); ex = r === 0 ? 0 : Math.floor(Math.log10(Math.abs(r)));
  if (ex < -4 || ex >= prec) {
    var s = v.toExponential(prec - 1); var mm = /^(-?[\d.]+)e([+-])(\d+)$/.exec(s);
    var mant = mm[1]; if (!alt && mant.indexOf('.') >= 0) mant = mant.replace(/0+$/, '').replace(/\.$/, '');
    return mant + 'e' + mm[2] + (mm[3].length < 2 ? '0' + mm[3] : mm[3]);
  }
  var f = v.toFixed(Math.max(0, prec - 1 - ex)); if (!alt && f.indexOf('.') >= 0) f = f.replace(/0+$/, '').replace(/\.$/, '');
  return f;
}
function toStr(v, fmtName) { if (typeof v === 'number') { if (Number.isInteger(v) && Math.abs(v) < 1e16) return String(v); return fmtG(v, 6); } if (v == null) return ''; if (v instanceof AArr) throw RunErr("can't use array in scalar context"); return String(v); }

function runProgram(P, o, c) {
  var sh = c.sh, G = Object.create(null), frame = null, funcs = P.funcs;
  var rec = '', fields = [], fieldsOk = true, outBuf = '', rangeOn = [];
  var rx = {};
  var files = {}, readers = {}, pipes = {}, srand = 1;
  var ENV = new AArr(); Object.keys(sh.env || {}).forEach(function (k) { ENV.m.set(k, sh.env[k]); });
  G.FS = o.fs; G.OFS = ' '; G.ORS = '\n'; G.RS = '\n'; G.NR = 0; G.FNR = 0; G.NF = 0; G.FILENAME = ''; G.SUBSEP = '\x1c'; G.RSTART = 0; G.RLENGTH = -1; G.CONVFMT = '%.6g'; G.OFMT = '%.6g'; G.ENVIRON = ENV;
  G.ARGC = o.args.length + 1; var ARGV = new AArr(); ARGV.m.set('0', 'awk'); o.args.forEach(function (a, i) { ARGV.m.set(String(i + 1), a); }); G.ARGV = ARGV;
  Object.keys(o.vars).forEach(function (k) { G[k] = o.vars[k]; });
  function cx(msg) { return RunErr(msg); }

  /* đầu vào */
  var inputs = o.inputs, ii = -1, curLines = null, li = 0;
  function openNext() {
    for (;;) {
      ii++;
      if (ii >= inputs.length) return false;
      var inp = inputs[ii];
      if (inp.assign) { G[inp.assign[0]] = inp.assign[1]; continue; }
      curLines = splitRecords(inp.text); li = 0; G.FILENAME = inp.name === '-' ? '' : inp.name; G.FNR = 0; return true;
    }
  }
  function splitRecords(text) {
    var rs = toStr(G.RS);
    if (rs === '\n') { var l = text.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; }
    if (rs === '') return text.split(/\n{2,}/).map(function (s) { return s.replace(/^\n+|\n+$/g, ''); }).filter(function (s) { return s !== ''; });
    var l2 = text.split(rs.length === 1 ? rs : new RegExp(mkRegexSrc(rs))); if (l2.length && l2[l2.length - 1].replace(/\n$/, '') === '') l2.pop(); return l2;
  }
  var started = false;
  function nextMain() {
    if (!started) { started = true; if (!inputs.length) inputs = [{ name: '-', text: String(c.stdin || '') }]; }
    for (;;) {
      if (curLines == null || li >= curLines.length) { if (!openNext()) return null; continue; }
      G.NR = numOf(G.NR) + 1; G.FNR = numOf(G.FNR) + 1;
      return curLines[li++];
    }
  }
  function mkRegexSrc(s) { return s; }

  /* bản ghi và trường */
  function splitFields(s) {
    var fs = G.FS == null ? ' ' : toStr(G.FS), rs = toStr(G.RS);
    if (fs === ' ') return s.split(/[ \t\n]+/).filter(function (x) { return x !== ''; });
    if (s === '') return [];
    if (fs === '\t') return s.split('\t');
    if (rs === '') { /* chế độ đoạn văn: xuống dòng cũng là ngăn cách */
      return s.split(new RegExp(fs.length === 1 ? '[' + fs.replace(/[\]\\^-]/g, '\\$&') + '\\n]' : '(?:' + fsRx(fs) + ')|\\n'));
    }
    if (fs.length === 1) return s.split(fs);
    return s.split(getRx(fs));
  }
  function fsRx(fs) { return mkRx(fs, { ere: true }).source; }
  function setRec(s) { rec = s; fieldsOk = false; }
  function ensureFields() { if (!fieldsOk) { fields = splitFields(rec); fieldsOk = true; G.NF = fields.length; } }
  function getNF() { ensureFields(); return fields.length; }
  function getField(i) {
    i = Math.floor(numOf(i)); if (i < 0) throw cx('negative field index $' + i);
    if (i === 0) return rec; ensureFields(); return fields[i - 1] != null ? fields[i - 1] : '';
  }
  function setField(i, v) {
    i = Math.floor(numOf(i)); if (i < 0) throw cx('negative field index $' + i);
    if (i === 0) { setRec(toStr(v)); return v; }
    ensureFields(); while (fields.length < i) fields.push(''); fields[i - 1] = toStr(v);
    rec = fields.join(toStr(G.OFS)); G.NF = fields.length; return v;
  }
  function setNF(n) { ensureFields(); n = Math.floor(numOf(n)); while (fields.length < n) fields.push(''); fields.length = n; rec = fields.join(toStr(G.OFS)); G.NF = n; }

  /* biến */
  function getVar(n) {
    if (frame && Object.prototype.hasOwnProperty.call(frame, n)) return frame[n];
    if (n === 'NF') return getNF();
    var v = G[n]; return v === undefined ? '' : v;
  }
  function setVar(n, v) {
    if (frame && Object.prototype.hasOwnProperty.call(frame, n)) { frame[n] = v; return v; }
    if (n === 'NF') { setNF(v); return v; }
    G[n] = v; return v;
  }
  function getArr(n) {
    var v;
    if (frame && Object.prototype.hasOwnProperty.call(frame, n)) { v = frame[n]; if (v instanceof AArr) return v; if (v === undefined || v === '') { v = new AArr(); frame[n] = v; return v; } throw cx("can't use scalar " + n + ' as array'); }
    v = G[n]; if (v instanceof AArr) return v; if (v === undefined || v === '') { v = new AArr(); G[n] = v; return v; }
    throw cx("can't use scalar " + n + ' as array');
  }
  function keyOf(k) { return k.t === 'multi' ? k.parts.map(function (e) { return toStr(ev(e)); }).join(toStr(G.SUBSEP)) : toStr(ev(k)); }
  function setL(l, v) {
    if (l.t === 'var') return setVar(l.n, v);
    if (l.t === 'idx') { getArr(l.a).m.set(keyOf(l.k), v); return v; }
    return setField(ev(l.e), v);
  }
  function getL(l) {
    if (l.t === 'var') return getVar(l.n);
    if (l.t === 'idx') { var a = getArr(l.a), k = keyOf(l.k); if (!a.m.has(k)) a.m.set(k, ''); return a.m.get(k); }
    return getField(ev(l.e));
  }
  function getRx(s, flags) { var key = flags + '|' + s; if (rx[key]) return rx[key]; try { return (rx[key] = mkRx(s, { ere: true })); } catch (e) { throw cx('regular expression compile failed (bad class -- [], [^] or [)\n' + s); } }
  function reOf(node) { return node.t === 'rematch' ? getRx(node.re, '') : getRx(toStr(ev(node)), ''); }
  function truth(v) { if (typeof v === 'number') return v !== 0; if (v instanceof AArr) return true; if (v === '' || v == null) return false; if (looksNum(v)) return numOf(v) !== 0; return true; }
  function cmpVals(a, b, na, nb) {
    var strConst = (na && na.t === 'str') || (nb && nb.t === 'str');
    if (!strConst && (typeof a === 'number' || looksNum(a)) && (typeof b === 'number' || looksNum(b))) { var x = numOf(a), y = numOf(b); return x < y ? -1 : x > y ? 1 : 0; }
    var s = toStr(a), t = toStr(b); return s < t ? -1 : s > t ? 1 : 0;
  }

  /* printf */
  function fmt(f, args) {
    var ai = 0;
    return f.replace(/%([-+ 0#']*)(\*|\d+)?(?:\.(\*|\d+))?([diouxXeEfFgGcs%])/g, function (m, fl, w, pr, ty) {
      if (ty === '%') return '%';
      if (w === '*') w = String(numOf(args[ai++])); if (pr === '*') pr = String(numOf(args[ai++]));
      if (ai >= args.length && ty !== '%') throw cx('not enough arguments passed to printf("' + f + '")');
      var v = args[ai++], s;
      var left = fl.indexOf('-') >= 0, zero = fl.indexOf('0') >= 0 && !left, plus = fl.indexOf('+') >= 0, space = fl.indexOf(' ') >= 0;
      if (ty === 's') { s = toStr(v); if (pr != null) s = s.slice(0, +pr); zero = false; }
      else if (ty === 'c') { s = typeof v === 'number' ? String.fromCharCode(v) : toStr(v).charAt(0); zero = false; }
      else {
        var nv = numOf(v), sign = '';
        if (ty === 'd' || ty === 'i') { nv = Math.trunc(nv); s = String(Math.abs(nv)); if (pr != null) s = s.padStart(+pr, '0'); sign = nv < 0 ? '-' : plus ? '+' : space ? ' ' : ''; }
        else if (ty === 'u') { s = String(Math.abs(Math.trunc(nv))); }
        else if (ty === 'o') { s = Math.trunc(nv).toString(8); if (fl.indexOf('#') >= 0) s = '0' + s; }
        else if (ty === 'x' || ty === 'X') { s = Math.trunc(nv).toString(16); if (ty === 'X') s = s.toUpperCase(); if (fl.indexOf('#') >= 0 && nv !== 0) s = (ty === 'x' ? '0x' : '0X') + s; }
        else { var a = Math.abs(nv), pp = pr == null ? 6 : +pr; if (ty === 'f' || ty === 'F') s = a.toFixed(pp); else if (ty === 'e' || ty === 'E') { s = a.toExponential(pp).replace(/e([+-])(\d)$/, 'e$10$2'); if (ty === 'E') s = s.toUpperCase(); } else { s = fmtG(a, pp, fl.indexOf('#') >= 0); if (ty === 'G') s = s.toUpperCase(); } sign = nv < 0 || (nv === 0 && 1 / nv < 0 && false) ? '-' : plus ? '+' : space ? ' ' : ''; }
        s = sign + s;
        if (zero && w && s.length < +w) { var sg = /^[+\- ]/.test(s) ? s.charAt(0) : ''; s = sg + s.slice(sg.length).padStart(+w - sg.length, '0'); }
      }
      if (w && s.length < +w) s = left ? s.padEnd(+w, ' ') : s.padStart(+w, ' ');
      return s;
    });
  }

  /* đầu ra */
  function outTo(red, text) {
    if (!red) { outBuf += text; return; }
    var name = toStr(ev(red.e));
    if (red.kind === '|') { pipes[name] = (pipes[name] || '') + text; return; }
    if (name === '/dev/stdout' || name === '-') { outBuf += text; return; }
    if (name === '/dev/stderr') { c.out(outBuf); outBuf = ''; c.err(text); return; }
    var f = files[name];
    if (!f) {
      var full = sh.abs(name), prev = sh.fs.get(full);
      f = files[name] = { text: red.kind === '>>' && prev ? String(prev.c || '') : '', dirty: true };
      if (!sh.canWrite(full, c)) { delete files[name]; throw cx("can't redirect to " + name); }
    }
    f.text += text; f.dirty = true;
  }
  function closeOne(name) {
    var r = -1;
    if (files[name]) { sh.writeFile(sh.abs(name), files[name].text, c, 'awk'); delete files[name]; r = 0; }
    if (pipes[name] != null) { c.out(outBuf); outBuf = ''; var text = pipes[name]; delete pipes[name]; c.out(sh.runCapture(name + " <<'AWK_EOF_X'\n" + text + (text.endsWith('\n') || text === '' ? '' : '\n') + 'AWK_EOF_X')); r = 0; }
    if (readers[name]) { delete readers[name]; r = 0; }
    return r;
  }
  function closeAll() { Object.keys(files).forEach(closeOne); Object.keys(pipes).forEach(closeOne); }

  /* điều khiển luồng */
  function Ctl(kind, val) { this.kind = kind; this.val = val; }
  var steps = 0;

  function ev(e) {
    switch (e.t) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'group': return ev(e.e);
      case 'rematch': return getRx(e.re, '').test(rec) ? 1 : 0;
      case 'var': { var vv = getVar(e.n); return vv; }
      case 'idx': case 'field': return getL(e);
      case 'multi': return e.parts.map(function (x) { return toStr(ev(x)); }).join(toStr(G.SUBSEP));
      case 'asg': {
        var r = ev(e.r), nv;
        if (e.op === '=') nv = (r instanceof AArr) ? r : r;
        else { var cur = numOf(getL(e.l)), rr = numOf(r); nv = e.op === '+=' ? cur + rr : e.op === '-=' ? cur - rr : e.op === '*=' ? cur * rr : e.op === '/=' ? (rr === 0 ? divz() : cur / rr) : e.op === '%=' ? (rr === 0 ? divz() : cur % rr) : Math.pow(cur, rr); }
        setL(e.l, nv); return nv;
      }
      case 'inc': { var old = numOf(getL(e.l)); setL(e.l, old + e.d); return e.pre ? old + e.d : old; }
      case 'tern': return truth(ev(e.c)) ? ev(e.a) : ev(e.b);
      case 'or': return truth(ev(e.l)) || truth(ev(e.r)) ? 1 : 0;
      case 'and': return truth(ev(e.l)) && truth(ev(e.r)) ? 1 : 0;
      case 'not': return truth(ev(e.e)) ? 0 : 1;
      case 'neg': return -numOf(ev(e.e));
      case 'plus': return numOf(ev(e.e));
      case 'in': return getArr(e.arr).m.has(keyOf(e.k)) ? 1 : 0;
      case 'match': { var s = toStr(ev(e.l)); var m = reOf(e.r).test(s); return (e.neg ? !m : m) ? 1 : 0; }
      case 'cmp': { var a = ev(e.l), b = ev(e.r), cr = cmpVals(a, b, e.l, e.r); return ({ '==': cr === 0, '!=': cr !== 0, '<': cr < 0, '<=': cr <= 0, '>': cr > 0, '>=': cr >= 0 })[e.op] ? 1 : 0; }
      case 'cat': return toStr(ev(e.l)) + toStr(ev(e.r));
      case 'bin': {
        var x = numOf(ev(e.l)), y = numOf(ev(e.r));
        if (e.op === '+') return x + y; if (e.op === '-') return x - y; if (e.op === '*') return x * y;
        if (e.op === '/') return y === 0 ? divz() : x / y; if (e.op === '%') return y === 0 ? divz('%') : x % y;
        return Math.pow(x, y);
      }
      case 'call': return call(e);
      case 'getline': return doGetline(e);
    }
    throw cx('lỗi nội bộ: ' + e.t);
  }
  function divz(op) { throw cx(op ? 'division by zero in %' : 'division by zero'); }
  function doGetline(e) {
    var line = null;
    if (e.src === 'main') { line = nextMain(); if (line == null) return 0; if (e.lv) setL(e.lv, line); else { setRec(line); } return 1; }
    var name, rd;
    if (e.src === 'file') {
      name = toStr(ev(e.file)); rd = readers[name];
      if (!rd) {
        var text;
        if (name === '-' || name === '/dev/stdin') text = String(c.stdin || '');
        else { var nd = sh.fs.get(sh.abs(name)); if (!nd || nd.t !== 'f') return -1; text = String(nd.c || ''); }
        rd = readers[name] = { l: splitRecords(text), i: 0 };
      }
    } else {
      name = toStr(ev(e.cmd)); rd = readers['\u0001' + name];
      if (!rd) { c.out(outBuf); outBuf = ''; var res = sh.runCapture(name); rd = readers['\u0001' + name] = { l: splitRecords(res), i: 0 }; }
    }
    if (rd.i >= rd.l.length) return 0;
    line = rd.l[rd.i++];
    if (e.lv) setL(e.lv, line); else { setRec(line); G.NR = numOf(G.NR) + 1; }
    return 1;
  }
  function regexArg(node) { return node.t === 'rematch' ? getRx(node.re, '') : getRx(toStr(ev(node)), ''); }
  function call(e) {
    var f = e.f, args = e.args;
    if (funcs[f]) return callUser(funcs[f], e);
    function A(i) { return ev(args[i]); }
    switch (f) {
      case 'length': {
        if (!args.length) return rec.length;
        if (args[0].t === 'var') { var vv = frame && Object.prototype.hasOwnProperty.call(frame, args[0].n) ? frame[args[0].n] : G[args[0].n]; if (vv instanceof AArr) return vv.m.size; }
        return toStr(A(0)).length;
      }
      case 'tolower': return toStr(A(0)).toLowerCase();
      case 'toupper': return toStr(A(0)).toUpperCase();
      case 'substr': {
        var s = toStr(A(0)), m = numOf(A(1)); m = Math.round(m); var end = args.length > 2 ? m + Math.round(numOf(A(2))) : s.length + 1;
        var st = Math.max(m, 1); end = Math.min(end, s.length + 1); return end > st ? s.slice(st - 1, end - 1) : '';
      }
      case 'index': return toStr(A(0)).indexOf(toStr(A(1))) + 1;
      case 'int': return Math.trunc(numOf(A(0)));
      case 'sqrt': return Math.sqrt(numOf(A(0))); case 'exp': return Math.exp(numOf(A(0))); case 'log': return Math.log(numOf(A(0)));
      case 'sin': return Math.sin(numOf(A(0))); case 'cos': return Math.cos(numOf(A(0))); case 'atan2': return Math.atan2(numOf(A(0)), numOf(A(1)));
      case 'rand': return Math.random(); case 'srand': { var old = srand; srand = args.length ? numOf(A(0)) : Math.floor(Date.now() / 1000); return old; }
      case 'systime': return Math.floor(Date.now() / 1000);
      case 'sprintf': { if (!args.length) throw cx('sprintf needs at least one argument'); var av = args.map(ev); return fmt(toStr(av[0]), av.slice(1)); }
      case 'split': {
        var str = toStr(A(0)), an = args[1]; if (!an || an.t !== 'var') throw cx('split: second argument must be an array');
        var parts;
        if (args.length > 2) { var sep = args[2]; if (sep.t === 'rematch') parts = str === '' ? [] : str.split(getRx(sep.re, '')); else { var sv = toStr(ev(sep)); parts = str === '' ? [] : sv === ' ' ? str.split(/[ \t\n]+/).filter(Boolean) : sv.length === 1 ? str.split(sv) : str.split(getRx(sv, '')); } }
        else parts = str === '' ? [] : splitFields(str);
        var arr = getArr(an.n); arr.m.clear(); parts.forEach(function (x, i) { arr.m.set(String(i + 1), x); }); return parts.length;
      }
      case 'match': { var ms = toStr(A(0)), mm = regexArg(args[1]).exec(ms); G.RSTART = mm ? mm.index + 1 : 0; G.RLENGTH = mm ? mm[0].length : -1; return G.RSTART; }
      case 'sub': case 'gsub': {
        var re = regexArg(args[0]), repl = toStr(A(1)), tg = args[2] || { t: 'field', e: { t: 'num', v: 0 } };
        if (args[2] && !isLv(tg)) { /* không phải lvalue: chỉ tính số lần */ }
        var cur = toStr(ev(tg)), cnt = 0, res = '', pos = 0, g = f === 'gsub';
        var r2 = new RegExp(re.source, re.flags.replace('g', '') + 'g'), mt;
        function expand(m0) { return repl.replace(/\\\\|\\&|&/g, function (z) { return z === '&' ? m0 : z === '\\&' ? '&' : '\\'; }); }
        while ((mt = r2.exec(cur))) {
          cnt++;
          if (mt[0] === '') { res += cur.slice(pos, mt.index) + expand(''); pos = mt.index; if (mt.index < cur.length) { res += cur.charAt(mt.index); pos = mt.index + 1; } r2.lastIndex = mt.index + 1; if (mt.index >= cur.length) break; if (!g) break; continue; }
          res += cur.slice(pos, mt.index) + expand(mt[0]); pos = mt.index + mt[0].length; if (!g) break;
        }
        if (cnt) { res += cur.slice(pos); if (isLv(tg)) setL(tg, res); }
        return cnt;
      }
      case 'close': return closeOne(toStr(A(0)));
      case 'fflush': c.out(outBuf); outBuf = ''; return 0;
      case 'system': { c.out(outBuf); outBuf = ''; var o2 = sh.runCapture(toStr(A(0))); c.out(o2); return sh.lastStatus || 0; }
    }
    throw cx('function ' + f + ' never defined');
  }
  function isLv(e) { return e.t === 'var' || e.t === 'idx' || e.t === 'field'; }
  function callUser(fn, e) {
    if (e.args.length > fn.params.length) throw cx('too many arguments in call to ' + e.f);
    var loc = Object.create(null), back = [];
    fn.params.forEach(function (pn, i) {
      if (i < e.args.length) {
        var an = e.args[i];
        if (an.t === 'var') {
          var cv = frame && Object.prototype.hasOwnProperty.call(frame, an.n) ? frame[an.n] : (an.n === 'NF' ? getNF() : G[an.n]);
          if (cv instanceof AArr) { loc[pn] = cv; return; }
          if (cv === undefined) { loc[pn] = undefined; back.push([pn, an.n]); return; }
          loc[pn] = cv; return;
        }
        loc[pn] = ev(an);
      } else loc[pn] = undefined;
    });
    var saved = frame; frame = loc;
    if (++depth > 200) { frame = saved; depth = 0; throw cx('function call nesting too deep'); }
    var ret = '';
    try { execStmt(fn.body); } catch (ex) { if (ex instanceof Ctl && ex.kind === 'return') ret = ex.val; else { frame = saved; depth--; throw ex; } }
    frame = saved; depth--;
    back.forEach(function (b) { if (loc[b[0]] instanceof AArr) { if (saved && Object.prototype.hasOwnProperty.call(saved, b[1])) saved[b[1]] = loc[b[0]]; else G[b[1]] = loc[b[0]]; } });
    return ret === undefined ? '' : ret;
  }
  var depth = 0;

  function execStmt(s) {
    if (++steps > 3000000) throw cx('chương trình chạy quá lâu (vòng lặp vô hạn?)');
    switch (s.t) {
      case 'block': for (var i = 0; i < s.st.length; i++) execStmt(s.st[i]); return;
      case 'expr': ev(s.e); return;
      case 'print': {
        var txt = (s.args.length ? s.args.map(function (x) { var v = ev(x); return typeof v === 'number' && !Number.isInteger(v) ? fmt(toStr(G.OFMT), [v]) : toStr(v); }).join(toStr(G.OFS)) : rec) + toStr(G.ORS);
        outTo(s.red, txt); return;
      }
      case 'printf': { var av = s.args.map(ev); if (!av.length) throw cx('printf: no format'); outTo(s.red, fmt(toStr(av[0]), av.slice(1))); return; }
      case 'if': if (truth(ev(s.c))) execStmt(s.a); else if (s.b) execStmt(s.b); return;
      case 'while': while (truth(ev(s.c))) { try { execStmt(s.body); } catch (x) { if (x instanceof Ctl && x.kind === 'break') break; if (x instanceof Ctl && x.kind === 'continue') continue; throw x; } } return;
      case 'do': do { try { execStmt(s.body); } catch (x) { if (x instanceof Ctl && x.kind === 'break') break; if (x instanceof Ctl && x.kind === 'continue') continue; throw x; } } while (truth(ev(s.c))); return;
      case 'for': {
        if (s.init) ev(s.init);
        while (!s.cond || truth(ev(s.cond))) {
          try { execStmt(s.body); } catch (x) { if (x instanceof Ctl && x.kind === 'break') break; if (!(x instanceof Ctl && x.kind === 'continue')) throw x; }
          if (s.step) ev(s.step);
        }
        return;
      }
      case 'forin': {
        var ks = Array.from(getArr(s.arr).m.keys());
        for (var j = 0; j < ks.length; j++) {
          setVar(s.v, ks[j]);
          try { execStmt(s.body); } catch (x) { if (x instanceof Ctl && x.kind === 'break') break; if (x instanceof Ctl && x.kind === 'continue') continue; throw x; }
        }
        return;
      }
      case 'delete': { var a = getArr(s.a); if (s.k) a.m.delete(keyOf(s.k)); else a.m.clear(); return; }
      case 'break': case 'continue': case 'next': case 'nextfile': throw new Ctl(s.t);
      case 'exit': throw new Ctl('exit', s.e ? numOf(ev(s.e)) : null);
      case 'return': throw new Ctl('return', s.e ? ev(s.e) : '');
    }
    throw cx('lỗi nội bộ: ' + s.t);
  }

  var exitCode = 0, inEnd = false;
  var begins = P.items.filter(function (x) { return x.kind === 'BEGIN'; }), ends = P.items.filter(function (x) { return x.kind === 'END'; }), mains = P.items.filter(function (x) { return x.kind === 'main'; });
  function runBlocks(list) { for (var i = 0; i < list.length; i++) execStmt(list[i].body); }
  try {
    try {
      runBlocks(begins);
      if (mains.length || ends.length) {
        var line;
        mainLoop: while ((line = nextMain()) != null) {
          setRec(line);
          for (var mi = 0; mi < mains.length; mi++) {
            var it = mains[mi], hit;
            try {
              if (!it.pat) hit = true;
              else if (!it.pat2) hit = truth(ev(it.pat));
              else {
                if (it.on) { hit = true; if (truth(ev(it.pat2))) it.on = false; }
                else if (truth(ev(it.pat))) { hit = true; if (!truth(ev(it.pat2))) it.on = true; }
                else hit = false;
              }
              if (hit) { if (it.body) execStmt(it.body); else outBuf += rec + toStr(G.ORS); }
            } catch (x) { if (x instanceof Ctl && x.kind === 'next') continue mainLoop; if (x instanceof Ctl && x.kind === 'nextfile') { curLines = null; continue mainLoop; } throw x; }
          }
        }
      }
    } catch (x) { if (x instanceof Ctl && x.kind === 'exit') { if (x.val != null) exitCode = x.val; } else throw x; }
    try { inEnd = true; runBlocks(ends); } catch (x) { if (x instanceof Ctl && x.kind === 'exit') { if (x.val != null) exitCode = x.val; } else throw x; }
  } catch (x) {
    c.out(outBuf); outBuf = '';
    if (x instanceof Ctl) { c.err('awk: run time error: improper use of ' + x.kind + '\n'); return 2; }
    if (x.run) { closeAll(); c.err('awk: run time error: ' + x.message + '\n\tFILENAME="' + toStr(G.FILENAME) + '" FNR=' + toStr(G.FNR) + ' NR=' + toStr(G.NR) + '\n'); return 2; }
    throw x;
  }
  c.out(outBuf); outBuf = '';
  closeAll();
  return exitCode;
}

cmds.awk = function (a, c) {
  var sh = c.sh, fs = ' ', progSrc = [], vars = {}, rest = [], i, usedF = false;
  function esc(s) { return s.replace(/\\([nt\\"\/])/g, function (m, ch) { return ch === 'n' ? '\n' : ch === 't' ? '\t' : ch; }); }
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '--') { rest = rest.concat(a.slice(i + 1)); break; }
    if (x === '-F') fs = a[++i]; else if (/^-F./.test(x)) fs = x.slice(2);
    else if (x === '-v') { var kv = String(a[++i]); var eq = kv.indexOf('='); if (eq < 1) throw new CmdErr('awk: improper assignment: -v ' + kv, 2); var vv = esc(kv.slice(eq + 1)); vars[kv.slice(0, eq)] = vv; }
    else if (/^-v./.test(x)) { var kv2 = x.slice(2), eq2 = kv2.indexOf('='); vars[kv2.slice(0, eq2)] = esc(kv2.slice(eq2 + 1)); }
    else if (x === '-f') { usedF = true; var fn = a[++i]; var nd = sh.fs.get(sh.abs(fn)); if (!nd || nd.t !== 'f') throw new CmdErr('awk: couldn\'t open file ' + fn, 2); progSrc.push(String(nd.c || '')); }
    else if (x === '--version' || x === '-V') { c.out('awk version 20200120 (mawk 1.3.4)\n'); return 0; }
    else if (x.charAt(0) === '-' && x.length > 1 && !progSrc.length && !usedF) throw new CmdErr('awk: not an option: ' + x, 2);
    else { rest = rest.concat(a.slice(i)); break; }
  }
  if (!usedF) { if (!rest.length) throw new CmdErr('usage: awk [-F value] [-v var=value] [--] \'program text\' [file ...]\nusage: awk [-F value] [-v var=value] [-f program-file] [--] [file ...]', 2); progSrc.push(rest.shift()); }
  if (fs === 't') fs = '\t'; else if (fs === '\\t') fs = '\t';
  var P;
  try { P = parse(lex(progSrc.join('\n'))); }
  catch (e) {
    if (e.syn) { var m = e.near; c.err(/^runaway/.test(m) ? 'awk: line ' + e.line + ': ' + m + '\n' : 'awk: line ' + e.line + ': syntax error at or near ' + m + '\n'); return 2; }
    throw e;
  }
  var inputs = [], rc = 0;
  rest.forEach(function (p) {
    var am = /^([A-Za-z_]\w*)=(.*)$/.exec(p);
    if (am) { inputs.push({ assign: [am[1], esc(am[2])] }); return; }
    if (p === '-') { inputs.push({ name: '-', text: String(c.stdin || '') }); return; }
    var full = sh.abs(p), nd = sh.fs.get(full);
    if (!nd) { c.err('awk: cannot open ' + p + ' (No such file or directory)\n'); rc = 2; return; }
    if (nd.t === 'd') { c.err('awk: cannot open ' + p + ' (Is a directory)\n'); rc = 2; return; }
    try { inputs.push({ name: p, text: sh.readFile(full, c, 'awk') }); } catch (e) { c.err('awk: cannot open ' + p + ' (Permission denied)\n'); rc = 2; }
  });
  if (rc && !inputs.length) return 2;
  var r = runProgram(P, { fs: fs, vars: vars, inputs: inputs, args: rest }, c);
  return r || rc;
};
cmds.gawk = cmds.mawk = cmds.awk;
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
