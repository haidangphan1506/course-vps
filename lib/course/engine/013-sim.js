(function (G) {
'use strict';
var V = G.VPS, SP = V.Shell.prototype, P = V._p, cmds = V.cmds;
function isW(t, v) { return !!t && t.t === 'w' && t.parts.length === 1 && t.parts[0].q === 'n' && (v == null || t.parts[0].v === v); }
function isOp(t, v) { return !!t && t.t === 'op' && t.v === v; }
function startsC(t) { return isW(t, 'for') || isW(t, 'while') || isW(t, 'until') || isW(t, 'if') || isW(t, 'case') || isW(t, '[[') || isOp(t, '(') || isW(t, '{'); }
function SynErr(tok, eof) { this.syn = true; this.tok = tok; this.eof = !!eof; }
function wordText(t) { return t.parts.map(function (p) { return p.v; }).join(''); }

function stopHere(st, stops) {
  var t = st.toks[st.i];
  if (!t || !stops) return false;
  return stops.some(function (s) { return s === ')' ? isOp(t, ')') : s === ';;' ? isOp(t, ';;') : isW(t, s); });
}
function parseSeq(st, stops) {
  var out = [];
  for (;;) {
    while (isOp(st.toks[st.i], ';')) st.i++;
    if (st.i >= st.toks.length) { if (stops) throw new SynErr('EOF', true); break; }
    if (stopHere(st, stops)) break;
    var t0 = st.toks[st.i];
    if (t0.t === 'op' && (t0.v === ')' || t0.v === '||' || t0.v === '&&' || t0.v === '|')) throw new SynErr(t0.v);
    if (t0.t === 'w' && !stops && ['do', 'done', 'then', 'fi', 'else', 'elif', '}'].some(function (k) { return isW(t0, k); })) throw new SynErr(wordText(t0));
    var node = parseStmt(st), sep = null, n = st.toks[st.i];
    if (n && n.t === 'op' && n.v === '&') { node.bg = true; st.i++; n = st.toks[st.i]; }
    if (n && n.t === 'op' && (n.v === ';' || n.v === '&&' || n.v === '||')) { sep = n.v; st.i++; if ((sep === '&&' || sep === '||') && st.i >= st.toks.length) throw new SynErr('EOF', true); }
    out.push({ node: node, sep: sep });
  }
  return out;
}
function expect(st, kw) {
  while (isOp(st.toks[st.i], ';')) st.i++;
  var t = st.toks[st.i];
  if (!t) throw new SynErr('EOF', true);
  if (!isW(t, kw)) throw new SynErr(t.t === 'w' ? wordText(t) : t.v);
  st.i++;
}
function parseTail(st, node) {
  node.redirs = []; node.tail = null;
  for (;;) {
    var t = st.toks[st.i];
    if (isOp(t, '|')) {
      st.i++;
      if (st.i >= st.toks.length) throw new SynErr('EOF', true);
      if (startsC(st.toks[st.i])) node.tail = { node: parseStmt(st) };
      else {
        var seg = [];
        while (st.i < st.toks.length) { var x = st.toks[st.i]; if (x.t === 'op' && (x.v === ';' || x.v === ';;' || x.v === '&' || x.v === '&&' || x.v === '||' || x.v === ')')) break; seg.push(x); st.i++; }
        node.tail = { simple: seg };
      }
      return node;
    }
    if (t && t.t === 'op' && (t.v === '>' || t.v === '>>' || t.v === '<') && st.toks[st.i + 1] && st.toks[st.i + 1].t === 'w') { node.redirs.push({ op: t.v, target: st.toks[st.i + 1] }); st.i += 2; continue; }
    if (t && t.t === 'op' && t.v === '<<') { node.redirs.push({ op: '<<', body: t.body || '', quoted: t.quoted }); st.i++; continue; }
    if (t && t.t === 'op' && t.v === '<<<' && st.toks[st.i + 1] && st.toks[st.i + 1].t === 'w') { node.redirs.push({ op: '<<<', target: st.toks[st.i + 1] }); st.i += 2; continue; }
    if (t && t.t === 'op' && (t.v === '2>' || t.v === '2>>') && st.toks[st.i + 1]) { st.i += 2; continue; }
    if (isOp(t, '2>&1')) { st.i++; continue; }
    return node;
  }
}
function parseStmt(st) {
  var t = st.toks[st.i];
  var tx = t && t.t === 'w' && t.parts.length === 1 && t.parts[0].q === 'n' ? t.parts[0].v : null, fm = null;
  if (isW(t, '[[')) {
    st.i++; var dt = [];
    while (st.i < st.toks.length && !isW(st.toks[st.i], ']]')) { dt.push(st.toks[st.i]); st.i++; }
    if (st.i >= st.toks.length) throw new SynErr('EOF', true);
    st.i++; return parseTail(st, { k: 'dbl', toks: dt });
  }
  if (isOp(t, '(') && isOp(st.toks[st.i + 1], '(')) {
    var j = st.i + 2, parts = [], L = st.toks.length;
    while (j < L && !(isOp(st.toks[j], ')') && isOp(st.toks[j + 1], ')'))) { var xj = st.toks[j]; parts.push(xj.t === 'w' ? wordText(xj) : xj.v); j++; }
    if (j >= L) throw new SynErr('EOF', true);
    st.i = j + 2; return { k: 'arith', expr: parts.join(' ') };
  }
  if (isW(t, 'case')) {
    st.i++; var subj = st.toks[st.i++]; if (!subj) throw new SynErr('EOF', true);
    expect(st, 'in'); var items = [];
    for (;;) {
      while (isOp(st.toks[st.i], ';') || isOp(st.toks[st.i], ';;')) st.i++;
      if (st.i >= st.toks.length) throw new SynErr('EOF', true);
      if (isW(st.toks[st.i], 'esac')) break;
      if (isOp(st.toks[st.i], '(')) st.i++;
      var pats = [], done = false;
      while (!done) {
        var pt = st.toks[st.i]; if (!pt) throw new SynErr('EOF', true);
        if (isOp(pt, ')')) { st.i++; break; }
        if (isOp(pt, '|')) { st.i++; continue; }
        if (pt.t !== 'w') throw new SynErr(pt.v);
        var ptx = wordText(pt);
        if (/\)$/.test(ptx) && pt.parts[pt.parts.length - 1].q === 'n') { var cp = JSON.parse(JSON.stringify(pt)); cp.parts[cp.parts.length - 1].v = cp.parts[cp.parts.length - 1].v.replace(/\)$/, ''); if (cp.parts[cp.parts.length - 1].v === '') cp.parts.pop(); pats.push(cp); done = true; st.i++; break; }
        pats.push(pt); st.i++;
      }
      var cb = parseSeq(st, [';;', 'esac']);
      if (isOp(st.toks[st.i], ';;')) st.i++;
      items.push({ pats: pats, body: cb });
    }
    expect(st, 'esac');
    return parseTail(st, { k: 'case', subj: subj, items: items });
  }
  if (isW(t, 'for') && isOp(st.toks[st.i + 1], '(') && isOp(st.toks[st.i + 2], '(')) {
    var j2 = st.i + 3, seg3 = [[]], L2 = st.toks.length;
    while (j2 < L2 && !(isOp(st.toks[j2], ')') && isOp(st.toks[j2 + 1], ')'))) { var xk = st.toks[j2]; if (isOp(xk, ';')) seg3.push([]); else seg3[seg3.length - 1].push(xk.t === 'w' ? wordText(xk) : xk.v); j2++; }
    if (j2 >= L2) throw new SynErr('EOF', true);
    st.i = j2 + 2; expect(st, 'do'); var cbody = parseSeq(st, ['done']); expect(st, 'done');
    return parseTail(st, { k: 'cfor', init: (seg3[0] || []).join(' '), cond: (seg3[1] || []).join(' '), step: (seg3[2] || []).join(' '), body: cbody });
  }
  if (tx && (fm = /^([A-Za-z_][\w.-]*)\(\)(\{)?$/.exec(tx))) st.i++;
  else if (tx && tx !== 'function' && isOp(st.toks[st.i + 1], '(') && isOp(st.toks[st.i + 2], ')')) { fm = [0, tx, null]; st.i += 3; }
  else if (isW(t, 'function') && st.toks[st.i + 1] && st.toks[st.i + 1].t === 'w') {
    fm = [0, wordText(st.toks[st.i + 1]).replace(/\(\)$/, ''), null]; st.i += 2;
    if (isOp(st.toks[st.i], '(') && isOp(st.toks[st.i + 1], ')')) st.i += 2;
  }
  if (fm) {
    if (!fm[2]) { if (!isW(st.toks[st.i], '{')) throw new SynErr(st.toks[st.i] ? (st.toks[st.i].t === 'w' ? wordText(st.toks[st.i]) : st.toks[st.i].v) : 'EOF', !st.toks[st.i]); st.i++; }
    var fb = parseSeq(st, ['}']); expect(st, '}');
    return { k: 'func', name: fm[1], body: fb };
  }
  if (isW(t, 'for')) {
    st.i++;
    var nm = st.toks[st.i]; if (!nm) throw new SynErr('EOF', true); st.i++;
    var words = [];
    if (isW(st.toks[st.i], 'in')) { st.i++; while (st.i < st.toks.length && !isOp(st.toks[st.i], ';')) { words.push(st.toks[st.i]); st.i++; } }
    expect(st, 'do'); var body = parseSeq(st, ['done']); expect(st, 'done');
    return parseTail(st, { k: 'for', v: wordText(nm), words: words, body: body });
  }
  if (isW(t, 'while') || isW(t, 'until')) {
    var until = isW(t, 'until'); st.i++;
    var cond = parseSeq(st, ['do']); cond.isCond = true; expect(st, 'do'); var b2 = parseSeq(st, ['done']); expect(st, 'done');
    return parseTail(st, { k: 'while', until: until, cond: cond, body: b2 });
  }
  if (isW(t, 'if')) {
    st.i++;
    var br = [], els = null;
    var c1 = parseSeq(st, ['then']); c1.isCond = true; expect(st, 'then'); var b1 = parseSeq(st, ['elif', 'else', 'fi']); br.push({ cond: c1, body: b1 });
    for (;;) {
      while (isOp(st.toks[st.i], ';')) st.i++;
      if (isW(st.toks[st.i], 'elif')) { st.i++; var c3 = parseSeq(st, ['then']); c3.isCond = true; expect(st, 'then'); var b3 = parseSeq(st, ['elif', 'else', 'fi']); br.push({ cond: c3, body: b3 }); continue; }
      if (isW(st.toks[st.i], 'else')) { st.i++; els = parseSeq(st, ['fi']); }
      break;
    }
    expect(st, 'fi');
    return parseTail(st, { k: 'if', br: br, els: els });
  }
  if (isOp(t, '(')) { st.i++; var sb = parseSeq(st, [')']); if (!isOp(st.toks[st.i], ')')) throw new SynErr('EOF', true); st.i++; return parseTail(st, { k: 'sub', body: sb }); }
  if (isW(t, '{')) { st.i++; var gb = parseSeq(st, ['}']); expect(st, '}'); return parseTail(st, { k: 'grp', body: gb }); }
  var seg = [];
  while (st.i < st.toks.length) {
    var x = st.toks[st.i];
    if (x.t === 'op' && (x.v === ';' || x.v === ';;' || x.v === '&' || x.v === '&&' || x.v === '||' || x.v === ')')) break;
    if (isOp(x, '|') && startsC(st.toks[st.i + 1])) { st.i++; var comp = parseStmt(st); return { k: 'pipeInto', head: seg, comp: comp }; }
    seg.push(x); st.i++;
  }
  return { k: 'simple', toks: seg };
}

var lastParse = { text: null, res: null };
function parseAll(text) {
  if (lastParse.text === text) return lastParse.res;
  var Pp = P.parseInput(text), res;
  if (!Pp.complete) res = { eof: true };
  else {
    var flat = [];
    Pp.cmds.forEach(function (tk, i) { if (i) flat.push({ t: 'op', v: ';' }); tk.forEach(function (x) { flat.push(x); }); });
    var st = { toks: flat, i: 0 };
    try { res = { entries: parseSeq(st, null) }; }
    catch (e) { if (e && e.syn) res = e.eof ? { eof: true } : { syn: e.tok }; else throw e; }
  }
  lastParse = { text: text, res: res };
  return res;
}

SP.isComplete = function (text) { return !parseAll(text).eof; };
SP.run = function (text) {
  this.cur = { disp: '' }; this.clearFlag = false; this.brk = null;
  if (!this.isComplete(text)) return { needMore: true };
  this.execText(text);
  return { out: this.cur.disp, code: this.lastStatus, clear: this.clearFlag };
};
SP.execText = function (text) {
  var r = parseAll(text);
  if (r.eof) { this.cur.disp += 'bash: syntax error: unexpected end of file\n'; this.lastStatus = 2; return; }
  if (r.syn) { this.cur.disp += "bash: syntax error near unexpected token `" + r.syn + "'\n"; this.lastStatus = 2; return; }
  this.depth = (this.depth || 0) + 1;
  try { this.execSeq(r.entries); } finally { this.depth--; }
};
SP.execSeq = function (entries) {
  var prev = null;
  for (var i = 0; i < entries.length; i++) {
    if (this.brk) return;
    var e = entries[i];
    var ok = prev === null || prev === ';' || (prev === '&&' && this.lastStatus === 0) || (prev === '||' && this.lastStatus !== 0);
    if (ok) this.execNode(e.node);
    prev = e.sep;
  }
};
SP.captureRun = function (fn) {
  var save = this.cur; this.cur = { disp: '' };
  try { fn.call(this); } finally { var o = this.cur.disp; this.cur = save; }
  return o;
};
function linesOf(text) { var l = text.split('\n'); if (l.length && l[l.length - 1] === '') l.pop(); return l; }
SP.withIn = function (text, fn) {
  var save = this.inBuf; this.inBuf = { lines: linesOf(text), i: 0 };
  try { fn.call(this); } finally { this.inBuf = save; }
};
SP.runSimple = function (toks, init) {
  var neg = false;
  if (toks.length && isW(toks[0], '!')) { neg = true; toks = toks.slice(1); }
  if (!toks.length) return;
  var items = P.parseTokens(toks);
  for (var i = 0; i < items.length; i++) { if (items[i].pipe.length && items[i].pipe[0].words.length + items[i].pipe[0].redirs.length) this.runPipeline(items[i].pipe, i === 0 ? init : ''); }
  if (neg) this.lastStatus = this.lastStatus ? 0 : 1;
};
SP.execNode = function (n) {
  var self = this;
  if (n.k === 'simple') return this.runSimple(n.toks);
  if (n.k === 'pipeInto') {
    var txt = this.captureRun(function () { this.runSimple(n.head); });
    return this.withIn(txt, function () { this.execNode(n.comp); });
  }
  var needCap = n.tail || (n.redirs && n.redirs.length);
  if (!needCap) return this.execCore(n);
  var inRed = (n.redirs || []).filter(function (r) { return r.op === '<' || r.op === '<<' || r.op === '<<<'; })[0];
  var outText;
  var run = function () { outText = self.captureRun(function () { self.execCore(n); }); };
  if (inRed) {
    var txt2 = '';
    if (inRed.op === '<<') txt2 = inRed.quoted ? inRed.body : this.expHere(inRed.body);
    else if (inRed.op === '<<<') txt2 = this.expand(inRed.target).join(' ') + '\n';
    else if (this.expand(inRed.target)[0] === '/dev/null') txt2 = '';
    else { var tgt = this.expand(inRed.target)[0];
    try { txt2 = this.readFile(this.abs(tgt), {}, 'bash'); } catch (e) { this.cur.disp += (e.msg || String(e)) + '\n'; this.lastStatus = 1; return; } }
    this.withIn(txt2, run);
  } else run();
  var outR = (n.redirs || []).filter(function (r) { return r.op === '>' || r.op === '>>'; })[0];
  if (outR) {
    var path = this.expand(outR.target)[0];
    if (path !== '/dev/null') { try { this.writeFile(this.abs(path), outText, {}, 'bash', outR.op === '>>'); } catch (e2) { this.cur.disp += (e2.msg || String(e2)) + '\n'; this.lastStatus = 1; } }
    return;
  }
  if (n.tail) {
    if (n.tail.simple) this.runSimple(n.tail.simple, outText);
    else this.withIn(outText, function () { this.execNode(n.tail.node); });
    return;
  }
  this.cur.disp += outText;
};
SP.execCore = function (n) {
  var self = this, g = 0;
  if (n.k === 'for') {
    var vals = [];
    n.words.forEach(function (w) { vals = vals.concat(self.expand(w)); });
    this.lastStatus = 0;
    for (var i = 0; i < vals.length && g++ < 2000; i++) {
      this.vars[n.v] = vals[i];
      this.execSeq(n.body);
      if (this.brk === 'b') { this.brk = null; break; }
      if (this.brk === 'c') this.brk = null;
      if (this.brk) return;
    }
    return;
  }
  if (n.k === 'while') {
    this.lastStatus = 0;
    while (g++ < 1000) {
      this.execSeq(n.cond);
      var okc = this.lastStatus === 0; if (n.until) okc = !okc;
      if (!okc) { this.lastStatus = 0; break; }
      this.execSeq(n.body);
      if (this.brk === 'b') { this.brk = null; break; }
      if (this.brk === 'c') this.brk = null;
      if (this.brk) return;
    }
    return;
  }
  if (n.k === 'if') {
    for (var b = 0; b < n.br.length; b++) {
      this.execSeq(n.br[b].cond);
      if (this.lastStatus === 0) { this.execSeq(n.br[b].body); return; }
    }
    if (n.els) this.execSeq(n.els); else this.lastStatus = 0;
    return;
  }
  if (n.k === 'sub') {
    var sv = { cwd: this.cwd, vars: JSON.parse(JSON.stringify(this.vars)), env: JSON.parse(JSON.stringify(this.env)) };
    try { this.execSeq(n.body); } finally { this.cwd = sv.cwd; this.vars = sv.vars; this.env = sv.env; this.brk = null; }
    return;
  }
  if (n.k === 'grp') this.execSeq(n.body);
};

// ---------- brace expansion, arithmetic ----------
function brace(s) {
  var m = /^(.*?)(?<!\$)\{([^{}]+)\}(.*)$/.exec(s);
  if (!m) return [s];
  var pre = m[1], body = m[2], post = m[3], items, r;
  if ((r = /^(-?\d+)\.\.(-?\d+)$/.exec(body))) {
    var a = +r[1], b = +r[2], pad = /^-?0\d/.test(r[1]) ? r[1].length : 0; items = [];
    for (var i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) { var x = String(i); while (pad && x.length < pad) x = '0' + x; items.push(x); }
  } else if ((r = /^([a-zA-Z])\.\.([a-zA-Z])$/.exec(body))) {
    items = []; var c1 = r[1].charCodeAt(0), c2 = r[2].charCodeAt(0);
    for (var k = c1; c1 <= c2 ? k <= c2 : k >= c2; k += c1 <= c2 ? 1 : -1) items.push(String.fromCharCode(k));
  } else if (body.indexOf(',') >= 0) items = body.split(',');
  else return [s];
  var out = [];
  items.forEach(function (it) { out = out.concat(brace(pre + it + post)); });
  return out;
}
var origExpand = SP.expand;
SP.expand = function (word) {
  var self = this;
  if (word.parts.every(function (p) { return p.q === 'n'; })) {
    var s = word.parts.map(function (p) { return p.v; }).join('');
    if (/\{[^{}]*(\.\.|,)[^{}]*\}/.test(s)) {
      var list = brace(s);
      if (list.length !== 1 || list[0] !== s) {
        var res = [];
        list.forEach(function (x) { res = res.concat(origExpand.call(self, { t: 'w', parts: [{ q: 'n', v: x }] })); });
        return res;
      }
    }
  }
  // arithmetic $(( ))
  var arith = word.parts.some(function (p) { return p.q === 'c' && /^\(.*\)$/.test(p.v); });
  if (arith) {
    var w2 = { t: 'w', parts: word.parts.map(function (p) {
      if (p.q === 'c' && /^\(.*\)$/.test(p.v)) return { q: 's', v: String(self.arith(p.v.slice(1, -1))) };
      return p;
    }) };
    return origExpand.call(this, w2);
  }
  return origExpand.call(this, word);
};
SP.arith = function (expr) {
  var self = this;
  var e = expr.replace(/\$\{?(\w+)\}?/g, function (m, n) { return self.getVar(n) || '0'; });
  var asg = /^\s*([A-Za-z_]\w*)\s*(\+\+|--|=|\+=|-=)\s*(.*)$/.exec(e);
  if (asg) {
    var cur = parseInt(self.getVar(asg[1]), 10) || 0, val;
    if (asg[2] === '++') val = cur + 1; else if (asg[2] === '--') val = cur - 1;
    else { var rhs = self.arith(asg[3]); val = asg[2] === '=' ? rhs : asg[2] === '+=' ? cur + rhs : cur - rhs; }
    self.vars[asg[1]] = String(val); return val;
  }
  e = e.replace(/[A-Za-z_]\w*/g, function (n) { return String(parseInt(self.getVar(n), 10) || 0); });
  if (!/^[\d\s+\-*\/%()<>=!&|^]*$/.test(e)) return 0;
  try { var r = Function('return (' + e + ')')(); return typeof r === 'boolean' ? (r ? 1 : 0) : (Math.trunc(r) || 0); } catch (x) { return 0; }
};

// ---------- builtins / commands ----------
V.builtins['break'] = function (a, c) { c.sh.brk = 'b'; return 0; };
V.builtins['continue'] = function (a, c) { c.sh.brk = 'c'; return 0; };
V.builtins.read = function (a, c) {
  var sh = c.sh, names = a.filter(function (x) { return x.charAt(0) !== '-'; });
  var src = sh.inBuf;
  if (!src && c.stdin) { src = sh.inBuf = { lines: linesOf(c.stdin), i: 0 }; }
  if (!src || src.i >= src.lines.length) return 1;
  var line = src.lines[src.i++];
  if (!names.length) names = ['REPLY'];
  var ws = line.split(/\s+/).filter(Boolean);
  names.forEach(function (nm, i) { sh.vars[nm] = i === names.length - 1 ? (names.length === 1 ? line : ws.slice(i).join(' ')) : (ws[i] || ''); });
  return 0;
};
V.builtins.let = function (a, c) { var r = 0; a.forEach(function (x) { r = c.sh.arith(x); }); return r ? 0 : 1; };

function test(args, sh, c) {
  args = args.slice();
  if (args[0] === '!') { args.shift(); return !test(args, sh, c); }
  var a, p, n;
  if (args.length === 1) return args[0] !== '';
  if (args.length === 2) {
    a = args[0]; p = args[1] ? sh.abs(args[1]) : '';
    n = p ? sh.fs.get(p) : null;
    switch (a) {
      case '-z': return args[1] === '';
      case '-n': return args[1] !== '';
      case '-e': return !!n;
      case '-f': return !!n && n.t !== 'd';
      case '-d': return !!n && n.t === 'd';
      case '-s': return !!n && (n.c || '').length > 0;
      case '-r': return !!n && sh.canRead(p, c);
      case '-w': return !!n && sh.canWrite(p, c);
      case '-x': return !!n && !!(n.mode & 73);
      case '-L': return false;
    }
    return false;
  }
  if (args.length === 3) {
    var l = args[0], o = args[1], r = args[2];
    switch (o) {
      case '=': case '==': return l === r;
      case '!=': return l !== r;
      case '-eq': return +l === +r; case '-ne': return +l !== +r;
      case '-lt': return +l < +r; case '-le': return +l <= +r;
      case '-gt': return +l > +r; case '-ge': return +l >= +r;
    }
  }
  return false;
}
cmds.test = function (a, c) { return test(a, c.sh, c) ? 0 : 1; };
cmds['['] = function (a, c) {
  if (a[a.length - 1] !== ']') throw new V.CmdErr('bash: [: missing `]\'');
  return test(a.slice(0, -1), c.sh, c) ? 0 : 1;
};
cmds.seq = function (a, c) {
  var n = a.map(Number), s = 1, st = 1, e;
  if (n.length === 1) e = n[0]; else if (n.length === 2) { s = n[0]; e = n[1]; } else { s = n[0]; st = n[1]; e = n[2]; }
  if (!st || isNaN(e)) throw new V.CmdErr('seq: invalid argument');
  for (var i = s, g = 0; (st > 0 ? i <= e : i >= e) && g < 5000; i += st, g++) c.out(i + '\n');
  return 0;
};
cmds.basename = function (a, c) { var p = (a[0] || '').replace(/\/+$/, ''), b = p.slice(p.lastIndexOf('/') + 1); if (a[1] && b.slice(-a[1].length) === a[1]) b = b.slice(0, -a[1].length); c.out(b + '\n'); return 0; };
cmds.dirname = function (a, c) { var p = (a[0] || '').replace(/\/+$/, ''), i = p.lastIndexOf('/'); c.out((i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i)) + '\n'); return 0; };
cmds.expr = function (a, c) {
  if (a.length === 3) { var l = +a[0], r = +a[2], o = a[1], v; if (o === '+') v = l + r; else if (o === '-') v = l - r; else if (o === '*') v = l * r; else if (o === '/') v = Math.trunc(l / r); else if (o === '%') v = l % r; if (v != null) { c.out(v + '\n'); return v === 0 ? 1 : 0; } }
  throw new V.CmdErr('expr: syntax error');
};
cmds.xargs = function (a, c) {
  var n = 0, repl = null, i = 0, noRun = false;
  for (; i < a.length && a[i].charAt(0) === '-'; i++) {
    if (a[i] === '-n') n = +a[++i]; else if (/^-n\d+$/.test(a[i])) n = +a[i].slice(2);
    else if (a[i] === '-I') repl = a[++i]; else if (/^-I./.test(a[i])) repl = a[i].slice(2);
    else if (a[i] === '-r') noRun = true; else if (a[i] === '-P') i++;
  }
  var tmpl = a.slice(i); if (!tmpl.length) tmpl = ['echo'];
  var text = c.stdin || '';
  if (!text.trim() && noRun) return 0;
  var calls = [];
  if (repl) linesOf(text).forEach(function (ln) { if (ln.trim()) calls.push(tmpl.map(function (t) { return t.split(repl).join(ln.trim()); })); });
  else {
    var items = text.split(/\s+/).filter(Boolean);
    if (!n) calls.push(tmpl.concat(items)); else for (var k = 0; k < items.length; k += n) calls.push(tmpl.concat(items.slice(k, k + n)));
    if (!items.length) calls = noRun ? [] : [tmpl];
  }
  var st = 0;
  calls.forEach(function (argv) { var r = c.sh.call(argv, c, {}); if (r) st = r; });
  return st;
};
var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
cmds.date = function (a, c) {
  var d = new Date(Date.UTC(2026, 9, 27, 4, 20, 0));
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  var f = a.filter(function (x) { return x.charAt(0) === '+'; })[0];
  if (a.indexOf('-u') >= 0 || a.indexOf('--utc') >= 0) { /* keep UTC fields */ } else d = new Date(d.getTime() + 7 * 3600000);
  var Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds(), wd = d.getUTCDay();
  if (!f) { c.out(DAYS[wd] + ' ' + MON[Mo] + ' ' + D + ' ' + p2(h) + ':' + p2(mi) + ':' + p2(s) + ' +07 ' + Y + '\n'); return 0; }
  var out = f.slice(1).replace(/%([a-zA-Z%])/g, function (m, k) {
    switch (k) {
      case 'F': return Y + '-' + p2(Mo + 1) + '-' + p2(D);
      case 'Y': return String(Y); case 'y': return String(Y).slice(2);
      case 'm': return p2(Mo + 1); case 'd': return p2(D); case 'e': return (D < 10 ? ' ' : '') + D;
      case 'H': return p2(h); case 'M': return p2(mi); case 'S': return p2(s);
      case 'T': return p2(h) + ':' + p2(mi) + ':' + p2(s);
      case 's': return String(Math.floor(Date.UTC(2026, 9, 27, 4, 20, 0) / 1000));
      case 'a': return DAYS[wd]; case 'b': return MON[Mo]; case 'Z': return '+07';
      case 'j': return '300'; case '%': return '%';
    }
    return m;
  });
  c.out(out + '\n'); return 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
