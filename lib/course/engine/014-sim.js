(function (G) {
'use strict';
/* Shell script: hàm, case, [[ ]], (( )), for kiểu C, mảng, set -e/-u/pipefail, trap, local, return, source, bash script.sh, ./script.sh, getopts, shift, eval, type, command. */
var V = G.VPS, SP = V.Shell.prototype, P = V._p, cmds = V.cmds, B = V.builtins, CmdErr = V.CmdErr;

function wtext(t) { return t.parts.map(function (p) { return p.v; }).join(''); }
function quoted(t) { return t.parts.some(function (p) { return p.q !== 'n'; }); }
function globRe(pat, flagsI) {
  var re = '', i = 0;
  while (i < pat.length) {
    var c = pat.charAt(i);
    if (c === '*') re += '.*'; else if (c === '?') re += '.';
    else if (c === '[') { var j = pat.indexOf(']', i + 2); if (j > 0) { re += '[' + pat.slice(i + 1, j).replace(/^!/, '^') + ']'; i = j; } else re += '\\['; }
    else re += c.replace(/[.+^${}()|\\\]]/g, '\\$&');
    i++;
  }
  return new RegExp('^' + re + '$', flagsI ? 'i' : '');
}
function st(sh) {
  if (!sh.funcs) { sh.funcs = {}; sh.arrs = {}; sh.flags = {}; sh.traps = {}; sh.fstack = []; sh.sdepth = 0; sh.pos = []; sh.inCond = 0; sh.optind = 1; }
  return sh;
}
SP.syncPos = function () {
  st(this); var v = this.vars, i;
  for (i = 1; i < 30; i++) delete v[String(i)];
  this.pos.forEach(function (x, k) { v[String(k + 1)] = x; });
  v['#'] = String(this.pos.length); v['@'] = this.pos.join(' '); v['*'] = this.pos.join(' ');
};

/* ---------- mở rộng tham số ---------- */
function arrOf(sh, name) { return sh.arrs && sh.arrs[name]; }
SP.getV = function (name) {
  st(this);
  if (name === '0') return this.vars['0'] != null ? this.vars['0'] : 'bash';
  if (name === '!') return this.vars['!'] || '';
  var v = this.getVar(name);
  if (v === '' && this.flags.u && this.vars[name] == null && this.env[name] == null && !/^[0-9#@*?$]$/.test(name) && !arrOf(this, name)) {
    this.cur.disp += 'bash: ' + name + ': unbound variable\n'; this.brk = 'x'; this.exitCode = 1; this.lastStatus = 1;
  }
  if (v === '' && arrOf(this, name)) return arrOf(this, name)[0] || '';
  return v;
};
function trimPat(val, pat, suffix, longest) {
  var re = globRe(pat), n = val.length, k;
  if (suffix) { for (k = longest ? 0 : n; longest ? k <= n : k >= 0; k += longest ? 1 : -1) if (re.test(val.slice(k))) return val.slice(0, k); }
  else { for (k = longest ? n : 0; longest ? k >= 0 : k <= n; k += longest ? -1 : 1) if (re.test(val.slice(0, k))) return val.slice(k); }
  return val;
}
SP.paramExp = function (br) {
  var self = this, m;
  if ((m = /^#(\w+)\[[@*]\]$/.exec(br))) return String((arrOf(this, m[1]) || []).length);
  if ((m = /^#(\w+)$/.exec(br))) return String(this.getV(m[1]).length);
  if ((m = /^(\w+)\[([@*])\]$/.exec(br))) return (arrOf(this, m[1]) || []).join(' ');
  if ((m = /^(\w+)\[(\d+)\]$/.exec(br))) return (arrOf(this, m[1]) || [])[+m[2]] || '';
  if ((m = /^(\w+)(:?[-=+?])(.*)$/.exec(br))) {
    var nm = m[1], op = m[2], w = this.expVars(m[3]), cur = this.getVar(nm), unset = op.charAt(0) === ':' ? cur === '' : (this.vars[nm] == null && this.env[nm] == null);
    var o = op.slice(-1);
    if (o === '-') return unset ? w : cur;
    if (o === '=') { if (unset) { this.vars[nm] = w; return w; } return cur; }
    if (o === '+') return unset ? '' : w;
    if (o === '?') { if (unset) { this.cur.disp += 'bash: ' + nm + ': ' + (w || 'parameter null or not set') + '\n'; this.brk = 'x'; this.exitCode = 1; this.lastStatus = 1; return ''; } return cur; }
  }
  if ((m = /^(\w+)(%%|%|##|#)(.+)$/.exec(br))) return trimPat(this.getV(m[1]), this.expVars(m[3]), m[2].charAt(0) === '%', m[2].length === 2);
  if ((m = /^(\w+)(\/\/|\/)([^\/]*)(?:\/(.*))?$/.exec(br))) {
    var val = this.getV(m[1]), pat = this.expVars(m[3]), rep = m[4] != null ? this.expVars(m[4]) : '';
    var rx = new RegExp(pat.replace(/[.+^${}()|\\\]\[]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), m[2] === '//' ? 'g' : '');
    return val.replace(rx, function () { return rep; });
  }
  if ((m = /^(\w+):(-?\d+)(?::(\d+))?$/.exec(br))) { var s0 = this.getV(m[1]), off = +m[2]; if (off < 0) off = Math.max(0, s0.length + off); return m[3] != null ? s0.substr(off, +m[3]) : s0.slice(off); }
  if ((m = /^(\w+)(\^\^|\^|,,|,)$/.exec(br))) { var s1 = this.getV(m[1]); return m[2].charAt(0) === '^' ? (m[2].length === 2 ? s1.toUpperCase() : s1.charAt(0).toUpperCase() + s1.slice(1)) : (m[2].length === 2 ? s1.toLowerCase() : s1.charAt(0).toLowerCase() + s1.slice(1)); }
  if (/^\w+$/.test(br)) return this.getV(br);
  return '${' + br + '}';
};
SP.expVars = function (s) {
  var self = this;
  return s.replace(/\$\{([^}]+)\}|\$(\w+|\?|\$|#|@|\*|!)/g, function (m, br, nm) { return nm !== undefined ? self.getV(nm) : self.paramExp(br); });
};
var prevExpand = SP.expand;
SP.expand = function (word) {
  st(this);
  if (word.parts.length === 1 && word.parts[0].q === 'd') {
    var dv = word.parts[0].v;
    if (dv === '$@' || dv === '${@}') return this.pos.slice();
    var am = /^\$\{(\w+)\[@\]\}$/.exec(dv); if (am) return (arrOf(this, am[1]) || []).slice();
  }
  var res = prevExpand.call(this, word);
  if (word.parts.every(function (p) { return p.q === 'n'; }) && /\$/.test(wtext(word)) && res.length === 1) {
    if (res[0] === '') return [];
    if (/\s/.test(res[0])) return res[0].split(/\s+/).filter(Boolean);
  }
  return res;
};

/* ---------- kiểm tra [[ ]] ---------- */
function unary(sh, op, a, c) {
  var p = a ? sh.abs(a) : '', n = p ? sh.fs.get(p) : null;
  switch (op) {
    case '-z': return a === ''; case '-n': return a !== '';
    case '-e': case '-a': return !!n; case '-f': return !!n && n.t !== 'd'; case '-d': return !!n && n.t === 'd';
    case '-s': return !!n && (n.c || '').length > 0; case '-r': return !!n && sh.canRead(p, c); case '-w': return !!n && sh.canWrite(p, c);
    case '-x': return !!n && !!(n.mode & 73); case '-L': case '-h': return !!n && n.t === 'l';
    case '-v': return sh.vars[a] != null || sh.env[a] != null;
  }
  return null;
}
SP.evalDbl = function (toks) {
  var self = this, i = 0, c = {};
  var items = toks.map(function (t) { return t.t === 'w' ? { w: (self.expandNG ? self.expandNG(t) : self.expand(t).join(' ')), q: quoted(t) } : { op: t.v }; });
  function peek() { return items[i]; }
  function isOp(x, v) { return x && x.op === v; }
  function primary() {
    var x = peek(); if (!x) return false;
    if (isOp(x, '(')) { i++; var r = orE(); if (isOp(peek(), ')')) i++; return r; }
    if (x.w === '!' && !x.q) { i++; return !primary(); }
    var y = items[i + 1];
    if (y && (y.op === '<' || y.op === '>' || (y.w != null && /^(==|=|!=|=~|-eq|-ne|-lt|-le|-gt|-ge)$/.test(y.w)))) {
      var z = items[i + 2], op = y.op || y.w; i += 3;
      var l = x.w, r2 = z ? z.w : '';
      if (op === '==' || op === '=') return z && !z.q ? globRe(r2).test(l) : l === r2;
      if (op === '!=') return z && !z.q ? !globRe(r2).test(l) : l !== r2;
      if (op === '=~') {
        try {
          var jr = r2.replace(/\[:alpha:\]/g, 'a-zA-Z').replace(/\[:digit:\]/g, '0-9').replace(/\[:alnum:\]/g, 'a-zA-Z0-9').replace(/\[:upper:\]/g, 'A-Z').replace(/\[:lower:\]/g, 'a-z').replace(/\[:space:\]/g, ' \\t\\n').replace(/\[:punct:\]/g, '!-\\/:-@\\[-`{-~');
          var mm = new RegExp(jr).exec(l); self.arrs = self.arrs || {};
          self.arrs.BASH_REMATCH = mm ? Array.prototype.map.call(mm, function (x) { return x == null ? '' : x; }) : [];
          return !!mm;
        } catch (e) { return false; }
      }
      if (op === '<') return l < r2; if (op === '>') return l > r2;
      if (op === '-eq') return +l === +r2; if (op === '-ne') return +l !== +r2; if (op === '-lt') return +l < +r2;
      if (op === '-le') return +l <= +r2; if (op === '-gt') return +l > +r2; if (op === '-ge') return +l >= +r2;
    }
    if (/^-[a-zA-Z]$/.test(x.w || '') && !x.q && y && y.w != null) { i += 2; var u = unary(self, x.w, y.w, c); return u === null ? false : u; }
    i++; return x.w !== undefined && x.w !== '';
  }
  function andE() { var r = primary(); while (isOp(peek(), '&&')) { i++; var r2 = primary(); r = r && r2; } return r; }
  function orE() { var r = andE(); while (isOp(peek(), '||')) { i++; var r2 = andE(); r = r || r2; } return r; }
  return orE();
};

/* ---------- thực thi nút mới ---------- */
var prevCore = SP.execCore;
SP.execCore = function (n) {
  st(this);
  var self = this, g = 0;
  if (n.k === 'func') { this.funcs[n.name] = n.body; this.lastStatus = 0; return; }
  if (n.k === 'dbl') { this.lastStatus = this.evalDbl(n.toks) ? 0 : 1; return; }
  if (n.k === 'arith') { this.lastStatus = this.arith(n.expr) ? 0 : 1; return; }
  if (n.k === 'case') {
    var subj = this.expand(n.subj).join(' ');
    this.lastStatus = 0;
    for (var i = 0; i < n.items.length; i++) {
      var hit = n.items[i].pats.some(function (p) { if (!quoted(p)) return globRe(p.parts.map(function (x) { return x.v; }).join('')).test(subj); var s = self.expand(p).join(' '); return s === subj; });
      if (hit) { this.execSeq(n.items[i].body); return; }
    }
    return;
  }
  if (n.k === 'cfor') {
    if (n.init) this.arith(n.init);
    this.lastStatus = 0;
    while (g++ < 2000) {
      if (n.cond && !this.arith(n.cond)) break;
      this.execSeq(n.body);
      if (this.brk === 'b') { this.brk = null; break; }
      if (this.brk === 'c') this.brk = null;
      if (this.brk) return;
      if (n.step) this.arith(n.step);
    }
    return;
  }
  return prevCore.call(this, n);
};
SP.execSeq = function (entries) {
  st(this);
  var prev = null;
  if (entries.isCond) this.inCond++;
  try {
    for (var i = 0; i < entries.length; i++) {
      if (this.brk) return;
      var e = entries[i];
      var ok = prev === null || prev === ';' || (prev === '&&' && this.lastStatus === 0) || (prev === '||' && this.lastStatus !== 0);
      if (ok) {
        if (e.node.bg && V.bgHook && V.bgHook(this, e.node)) { /* đã chạy nền */ }
        else this.execNode(e.node);
        if (this.lastStatus !== 0 && !this.brk && e.sep !== '&&' && e.sep !== '||' && !this.inCond && e.node.k !== 'func') {
          if (this.traps.ERR && !this.inTrap) this.runTrap('ERR');
          if (this.flags.e) { this.brk = 'x'; this.exitCode = this.lastStatus; }
        }
      }
      prev = e.sep;
    }
  } finally { if (entries.isCond) this.inCond--; }
};
SP.runPipeline = function (pipe, init) {
  var stdin = init || '', last = pipe.length - 1, codes = [];
  for (var k = 0; k <= last; k++) {
    var w0 = pipe.length > 1 && pipe[k].words && pipe[k].words[0] && pipe[k].words[0].parts && pipe[k].words[0].parts[0] ? pipe[k].words[0].parts[0].v : '', snapV = null;
    if (w0 === 'read') { snapV = {}; for (var vk in this.vars) snapV[vk] = this.vars[vk]; }
    var r = this.runCmd(pipe[k], stdin, k === last);
    if (snapV) this.vars = snapV;
    if (r.errText) this.cur.disp += r.errText;
    if (k === last) { if (r.outText) this.cur.disp += r.outText; }
    stdin = r.outText || '';
    this.lastStatus = r.code; codes.push(r.code);
  }
  this.arrs = this.arrs || {}; this.arrs.PIPESTATUS = codes.map(String);
  if (this.flags && this.flags.pipefail) { var nz = codes.filter(function (x) { return x !== 0; }); if (nz.length) this.lastStatus = nz[nz.length - 1]; }
};
SP.runTrap = function (sig) {
  var t = this.traps && this.traps[sig]; if (!t) return;
  this.inTrap = true; var sv = this.lastStatus, sb = this.brk; this.brk = null;
  try { this.execText(t); } finally { this.inTrap = false; this.lastStatus = sv; if (sb) this.brk = sb; }
};
/* mảng: arr=(a b c), arr+=(d) */
var prevSimple = SP.runSimple;
SP.runSimple = function (toks, init) {
  st(this);
  var t0 = toks[0], m = t0 && t0.t === 'w' ? /^([A-Za-z_]\w*)(\+?)=\(([\s\S]*)$/.exec(wtext(t0)) : null;
  if (m && t0.parts.every(function (p) { return p.q === 'n'; })) {
    var words = [], j = 0, item, endFound = false, first = m[3];
    if (/\)$/.test(first)) { first = first.slice(0, -1); endFound = true; }
    if (first) words.push({ t: 'w', parts: [{ q: 'n', v: first }] });
    for (j = 1; j < toks.length && !endFound; j++) {
      item = toks[j];
      if (item.t === 'w' && /\)$/.test(wtext(item)) && item.parts[item.parts.length - 1].q === 'n') {
        var cp = JSON.parse(JSON.stringify(item)); cp.parts[cp.parts.length - 1].v = cp.parts[cp.parts.length - 1].v.slice(0, -1);
        if (wtext(cp) !== '') words.push(cp); endFound = true;
      } else if (item.t === 'w') words.push(item);
    }
    var vals = []; var self = this; words.forEach(function (w) { vals = vals.concat(self.expand(w)); });
    this.arrs[m[1]] = m[2] ? (this.arrs[m[1]] || []).concat(vals) : vals;
    this.lastStatus = 0; return;
  }
  return prevSimple.call(this, toks, init);
};

/* ---------- gọi hàm, chạy script ---------- */
var prevDispatch = SP.dispatch;
SP.callFunc = function (name, args, ctx) {
  var self = st(this), body = this.funcs[name];
  if (this.fstack.length > 100) { ctx.err('bash: ' + name + ': maximum function nesting level exceeded\n'); return 1; }
  var frame = { locals: {}, pos: this.pos };
  this.fstack.push(frame); this.pos = args.slice(); this.syncPos();
  var out = this.captureRun(function () { this.execSeq(body); });
  if (this.brk === 'r') this.brk = null;
  this.fstack.pop(); this.pos = frame.pos; this.syncPos();
  Object.keys(frame.locals).forEach(function (k) { var l = frame.locals[k]; if (l.unset) delete self.vars[k]; else self.vars[k] = l.v; });
  if (out) ctx.out(out);
  return this.lastStatus;
};
SP.runScriptText = function (text, name, args, opts) {
  var self = st(this), src = opts && opts.source, saved = { env: this.env, vars: this.vars, funcs: this.funcs, flags: this.flags, traps: this.traps, pos: this.pos, brk: this.brk, cwd: this.cwd, fstack: this.fstack, exit: this.exitCode, arrs: this.arrs };
  if (!src) { this.env = Object.assign({}, this.env); this.vars = {}; this.funcs = {}; this.flags = Object.assign({}, opts && opts.flags || {}); this.traps = {}; this.arrs = {}; this.fstack = []; }
  if (args) { this.pos = args.slice(); }
  this.vars['0'] = name || 'bash'; this.syncPos();
  this.brk = null; this.sdepth++; this.exitCode = null;
  var out, code;
  try {
    out = this.captureRun(function () { this.execText(text); if (this.traps.EXIT) { var sb = this.brk; this.brk = null; this.runTrap('EXIT'); this.brk = sb; } });
    code = this.brk === 'x' && this.exitCode != null ? this.exitCode : this.lastStatus;
  } finally {
    this.sdepth--;
    if (!src) { this.env = saved.env; this.vars = saved.vars; this.funcs = saved.funcs; this.flags = saved.flags; this.traps = saved.traps; this.arrs = saved.arrs; this.cwd = saved.cwd; this.pos = saved.pos; this.syncPos(); }
    else if (opts && opts.restorePos) { this.pos = saved.pos; this.syncPos(); }
    this.brk = saved.brk === 'x' ? 'x' : null; this.exitCode = saved.exit;
  }
  this.lastStatus = code;
  return { out: out, code: code };
};
SP.dispatch = function (argv, ctx, top) {
  st(this);
  var name = argv[0];
  if (this.funcs[name] && !(name in cmds && false)) {
    var entry = null;
    if (top) { this.hist.push({ cmd: argv.join(' '), code: null, sudo: false }); entry = this.hist[this.hist.length - 1]; }
    var code = this.callFunc(name, argv.slice(1), ctx);
    if (entry) { entry.code = code; if (this.onCmd) this.onCmd(entry); }
    return code;
  }
  if (name.indexOf('/') >= 0 && !cmds[name] && !B[name]) {
    var p = this.abs(name), n = this.fs.get(p), ent = null;
    if (n && n.t === 'f' && /^ELF/.test(n.c || '') && (n.mode & 73)) { var bn = name.replace(/^.*\//, ''); if (cmds[bn] || B[bn]) return prevDispatch.call(this, [bn].concat(argv.slice(1)), ctx, top); }
    if (top) { this.hist.push({ cmd: argv.join(' '), code: null, sudo: false }); ent = this.hist[this.hist.length - 1]; }
    var rc;
    if (!n) { ctx.err('bash: ' + name + ': No such file or directory\n'); rc = 127; }
    else if (n.t === 'd') { ctx.err('bash: ' + name + ': Is a directory\n'); rc = 126; }
    else if (!(n.mode & 73) && !this.isRoot(ctx)) { ctx.err('bash: ' + name + ': Permission denied\n'); rc = 126; }
    else if (!this.canRead(p, ctx)) { ctx.err('bash: ' + name + ': Permission denied\n'); rc = 126; }
    else {
      var r = this.runScriptText(n.c || '', name, argv.slice(1), {});
      if (r.out) ctx.out(r.out); rc = r.code;
    }
    if (ent) { ent.code = rc; if (this.onCmd) this.onCmd(ent); }
    return rc;
  }
  return prevDispatch.call(this, argv, ctx, top);
};

/* ---------- builtins ---------- */
function setOpts(sh, letters, on) {
  letters.split('').forEach(function (ch) { if (ch === 'e') sh.flags.e = on; else if (ch === 'u') sh.flags.u = on; else if (ch === 'x') sh.flags.x = on; else if (ch === 'C') sh.flags.C = on; });
}
B.set = function (a, c) {
  var sh = st(c.sh), i;
  if (!a.length) { Object.keys(sh.vars).filter(function (k) { return /^[A-Za-z_]/.test(k); }).forEach(function (k) { c.out(k + '=' + sh.vars[k] + '\n'); }); return 0; }
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '--') { sh.pos = a.slice(i + 1); sh.syncPos(); break; }
    if (x === '-o' || x === '+o') { var o = a[++i]; if (o === 'pipefail') sh.flags.pipefail = x === '-o'; else if (o === 'errexit') sh.flags.e = x === '-o'; else if (o === 'nounset') sh.flags.u = x === '-o'; else if (o === 'noclobber') sh.flags.C = x === '-o'; continue; }
    if (/^[-+][a-z]+$/.test(x)) {
      var on = x.charAt(0) === '-', letters = x.slice(1), hasO = letters.charAt(letters.length - 1) === 'o';
      setOpts(sh, hasO ? letters.slice(0, -1) : letters, on);
      if (hasO) { var o2 = a[++i]; if (o2 === 'pipefail') sh.flags.pipefail = on; else if (o2 === 'errexit') sh.flags.e = on; else if (o2 === 'nounset') sh.flags.u = on; else if (o2 === 'noclobber') sh.flags.C = on; }
    }
  }
  return 0;
};
B.trap = function (a, c) {
  var sh = st(c.sh);
  if (!a.length || a[0] === '-p') { Object.keys(sh.traps).forEach(function (k) { c.out("trap -- '" + sh.traps[k] + "' " + k + '\n'); }); return 0; }
  var cmd = a[0], sigs = a.slice(1);
  if (cmd === '-') { sigs.forEach(function (s) { delete sh.traps[s.replace(/^SIG/, '')]; }); return 0; }
  sigs.forEach(function (s) { s = s.replace(/^SIG/, ''); if (s === '0') s = 'EXIT'; sh.traps[s] = cmd; });
  return 0;
};
B.local = function (a, c) {
  var sh = st(c.sh), fr = sh.fstack[sh.fstack.length - 1];
  if (!fr) throw new CmdErr('bash: local: can only be used in a function');
  a.forEach(function (x) {
    var m = /^([A-Za-z_]\w*)(?:=(.*))?$/.exec(x); if (!m) return;
    if (!(m[1] in fr.locals)) fr.locals[m[1]] = sh.vars[m[1]] != null ? { v: sh.vars[m[1]] } : { unset: true };
    sh.vars[m[1]] = m[2] != null ? m[2] : '';
  });
  return 0;
};
B['return'] = function (a, c) {
  var sh = st(c.sh), n = a.length ? parseInt(a[0], 10) || 0 : sh.lastStatus;
  if (!sh.fstack.length && !sh.sdepth) throw new CmdErr('bash: return: can only `return\' from a function or sourced script');
  sh.lastStatus = n; sh.brk = sh.fstack.length ? 'r' : 'x'; sh.exitCode = n; return n;
};
B.exit = function (a, c) {
  var sh = st(c.sh), n = a.length ? parseInt(a[0], 10) || 0 : sh.lastStatus;
  if (sh.sdepth || sh.fstack.length) { sh.brk = 'x'; sh.exitCode = n; sh.lastStatus = n; return n; }
  c.out('logout\n'); return 0;
};
B.shift = function (a, c) { var sh = st(c.sh), n = a.length ? parseInt(a[0], 10) || 1 : 1; if (n > sh.pos.length) return 1; sh.pos = sh.pos.slice(n); sh.syncPos(); return 0; };
B[':'] = function () { return 0; };
B.wait = function () { return 0; };
B.readonly = function (a, c) { a.forEach(function (x) { var m = /^(\w+)=(.*)$/.exec(x); if (m) c.sh.vars[m[1]] = m[2]; }); return 0; };
B.declare = B.typeset = function (a, c) {
  var sh = st(c.sh), fl = '';
  a.forEach(function (x) {
    if (/^-[a-zA-Z]+$/.test(x)) { fl += x.slice(1); return; }
    var m = /^(\w+)(?:=(.*))?$/.exec(x); if (!m) return;
    var v = m[2] != null ? m[2] : '';
    if (/i/.test(fl) && m[2] != null) v = String(sh.arith(v));
    if (/a/.test(fl)) { sh.arrs[m[1]] = sh.arrs[m[1]] || []; return; }
    if (/x/.test(fl)) sh.env[m[1]] = v; else if (m[2] != null || sh.vars[m[1]] == null) sh.vars[m[1]] = v;
  });
  if (/p/.test(fl)) a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (n) { c.out('declare -- ' + n + '="' + sh.getVar(n) + '"\n'); });
  return 0;
};
B.read = function (a, c) {
  var sh = st(c.sh), names = [], i, raw = false, arrName = null;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-p' || x === '-t' || x === '-n' || x === '-N' || x === '-d' || x === '-u') { i++; continue; }
    if (x === '-a') { arrName = a[++i]; continue; }
    if (/^-[a-zA-Z]+$/.test(x)) { if (/r/.test(x)) raw = true; continue; }
    names.push(x);
  }
  var src = sh.inBuf;
  if (!src && c.stdin) { src = { lines: c.stdin.split('\n').filter(function (l, k, arr) { return !(k === arr.length - 1 && l === ''); }), i: 0 }; }
  if (!src || src.i >= src.lines.length) return 1;
  var line = src.lines[src.i++];
  if (!raw) line = line.replace(/\\(.)/g, '$1');
  if (arrName) { sh.arrs[arrName] = line.split(/\s+/).filter(Boolean); return 0; }
  if (!names.length) names = ['REPLY'];
  var ws = line.split(/\s+/).filter(Boolean);
  names.forEach(function (nm, k) { sh.vars[nm] = k === names.length - 1 ? (names.length === 1 ? line : ws.slice(k).join(' ')) : (ws[k] || ''); });
  return 0;
};
B.getopts = function (a, c) {
  var sh = st(c.sh), spec = a[0], name = a[1], args = a.length > 2 ? a.slice(2) : sh.pos;
  if (!spec || !name) return 2;
  var idx = sh.optind - 1, cur = args[idx];
  if (cur == null || cur.charAt(0) !== '-' || cur === '-' || cur === '--') { sh.vars[name] = '?'; return 1; }
  var ch = cur.charAt(1), pos = sh.optpos || 1, silent = spec.charAt(0) === ':', sp2 = spec.replace(/^:/, ''), k = sp2.indexOf(ch);
  ch = cur.charAt(pos);
  k = sp2.indexOf(ch);
  function adv() { if (pos + 1 < cur.length) { sh.optpos = pos + 1; } else { sh.optpos = 0; sh.optind++; } sh.vars.OPTIND = String(sh.optind); }
  if (k < 0 || ch === ':') { sh.vars[name] = '?'; if (silent) sh.vars.OPTARG = ch; else c.err('bash: illegal option -- ' + ch + '\n'); adv(); return 0; }
  sh.vars[name] = ch;
  if (sp2.charAt(k + 1) === ':') {
    var arg = pos + 1 < cur.length ? cur.slice(pos + 1) : args[idx + 1];
    if (arg == null) { sh.vars[name] = silent ? ':' : '?'; if (silent) sh.vars.OPTARG = ch; else c.err('bash: option requires an argument -- ' + ch + '\n'); sh.optind++; sh.optpos = 0; sh.vars.OPTIND = String(sh.optind); return 0; }
    sh.vars.OPTARG = arg; sh.optind += pos + 1 < cur.length ? 1 : 2; sh.optpos = 0; sh.vars.OPTIND = String(sh.optind); return 0;
  }
  adv(); return 0;
};
B.eval = function (a, c) { var sh = c.sh, out = sh.captureRun(function () { sh.execText(a.join(' ')); }); if (out) c.out(out); return sh.lastStatus; };
function srcFile(a, c, who) {
  var sh = st(c.sh), f = a[0]; if (!f) throw new CmdErr('bash: ' + who + ': filename argument required');
  var p = sh.abs(f);
  if (!sh.fs.get(p)) throw new CmdErr('bash: ' + f + ': No such file or directory');
  var text = sh.readFile(p, c, 'bash');
  var r = sh.runScriptText(text, f, a.length > 1 ? a.slice(1) : null, { source: true, restorePos: a.length > 1 });
  if (r.out) c.out(r.out); return r.code;
}
B.source = function (a, c) { return srcFile(a, c, 'source'); };
B['.'] = function (a, c) { return srcFile(a, c, '.'); };
B.type = function (a, c) {
  var sh = st(c.sh), rc = 0;
  a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (n) {
    if (sh.funcs[n]) c.out(n + ' is a function\n');
    else if (sh.aliases && sh.aliases[n]) c.out(n + " is aliased to `" + sh.aliases[n] + "'\n");
    else if (B[n] && ['cd', 'echo', 'export', 'set', 'read', 'exit', 'source', 'alias', 'type', 'local', 'return', 'trap', 'shift', 'declare', 'eval', 'unset', 'history', 'test', 'true', 'false', 'printf', 'pwd'].indexOf(n) >= 0) c.out(n + ' is a shell builtin\n');
    else if (cmds[n]) c.out(n + ' is /usr/' + (/^(sudo|ls|cat|grep|ps|curl|systemctl|id|find|sed|awk|head|tail|df|du)$/.test(n) ? 'bin' : 'sbin') + '/' + n + '\n');
    else { c.err('bash: type: ' + n + ': not found\n'); rc = 1; }
  });
  return rc;
};
B.command = function (a, c) {
  var sh = st(c.sh);
  if (a[0] === '-v' || a[0] === '-V') { var rc = 0; a.slice(1).forEach(function (n) { if (sh.funcs[n] || B[n]) c.out(n + '\n'); else if (cmds[n]) c.out('/usr/bin/' + n + '\n'); else rc = 1; }); return rc; }
  if (a.length) return sh.call(a, c, {});
  return 0;
};
cmds.mktemp = function (a, c) {
  var sh = c.sh, dir = a.indexOf('-d') >= 0, tmpl = a.filter(function (x) { return x.charAt(0) !== '-'; })[0] || '/tmp/tmp.XXXXXXXXXX';
  sh.mkc = (sh.mkc || 0) + 1; var ch = 'aBcD3fGh1JkLmN0pQrStUvWx';
  var p = tmpl.replace(/X+$/, function (m) { var s = ''; for (var i = 0; i < m.length; i++) s += ch.charAt((sh.mkc * 7 + i * 5) % ch.length); return s; });
  p = sh.abs(p);
  if (dir) sh.fs.mkdirp(p, sh.user, 448); else sh.fs.put(p, '', { owner: sh.user, mode: 384 });
  c.out(p + '\n'); return 0;
};
/* bash / sh */
function shellCmd(label) {
  return function (a, c) {
    var sh = st(c.sh), flags = {}, i = 0, cmdStr = null, file = null, check = false;
    for (; i < a.length; i++) {
      var x = a[i];
      if (x === '-c') { cmdStr = a[++i]; i++; break; }
      if (x === '-n') { check = true; continue; }
      if (/^-[a-zA-Z]+$/.test(x)) { setOptsLocal(flags, x.slice(1)); continue; }
      if (x === '-o') { if (a[++i] === 'pipefail') flags.pipefail = true; continue; }
      if (x === '--') { i++; break; }
      break;
    }
    function setOptsLocal(f, l) { l.split('').forEach(function (ch) { if (ch === 'e') f.e = true; if (ch === 'u') f.u = true; if (ch === 's') f.s = true; }); }
    var rest = a.slice(i);
    if (cmdStr == null && flags.s && c.stdin != null) { cmdStr = c.stdin; }
    else if (cmdStr == null && rest.length) { file = rest.shift(); }
    if (cmdStr == null && file == null && c.stdin) { cmdStr = c.stdin; }
    if (cmdStr == null && (file == null || file === '-')) { if (file === '-') { if (!c.stdin) return 0; cmdStr = c.stdin; file = null; } else { c.out('logout\n'); return 0; } }
    var text, name;
    if (cmdStr != null) { text = cmdStr; name = rest.length ? rest.shift() : label; }
    else {
      var p = sh.abs(file), n = sh.fs.get(p);
      if (!n) throw new CmdErr(label + ': ' + file + ': No such file or directory', 127);
      if (n.t === 'd') throw new CmdErr(label + ': ' + file + ': Is a directory', 126);
      text = sh.readFile(p, c, label); name = file;
    }
    if (check) {
      var okp = sh.isComplete(text);
      if (!okp) { c.err(label + ': line ' + (text.split('\n').length) + ': syntax error: unexpected end of file\n'); return 2; }
      return 0;
    }
    var r = sh.runScriptText(text, name, rest, { flags: flags });
    if (r.out) c.out(r.out);
    return r.code;
  };
}
cmds.bash = shellCmd('bash'); cmds.sh = shellCmd('sh');
cmds.less = cmds.more = function (a, c) { var f = a.filter(function (x) { return x.charAt(0) !== '-'; }); if (!f.length) { c.out(c.stdin || ''); return 0; } f.forEach(function (x) { c.out(c.sh.readFile(c.sh.abs(x), c, 'less')); }); return 0; };
cmds.timeout = function (a, c) { var i = 0; while (a[i] && a[i].charAt(0) === '-') i++; i++; if (i >= a.length) return 125; return c.sh.call(a.slice(i), c, {}); };
cmds.diff = function (a, c) {
  var sh = c.sh, uni = a.indexOf('-u') >= 0, f = a.filter(function (x) { return x.charAt(0) !== '-'; });
  if (f.length < 2) throw new CmdErr('diff: missing operand after \'' + (f[0] || 'diff') + '\'', 2);
  var A = sh.readFile(sh.abs(f[0]), c, 'diff').split('\n'), Bn = sh.readFile(sh.abs(f[1]), c, 'diff').split('\n');
  if (A[A.length - 1] === '') A.pop(); if (Bn[Bn.length - 1] === '') Bn.pop();
  var n = A.length, m = Bn.length, d = [], i, j;
  for (i = 0; i <= n; i++) { d[i] = []; for (j = 0; j <= m; j++) d[i][j] = 0; }
  for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) d[i][j] = A[i] === Bn[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  var ops = []; i = 0; j = 0;
  while (i < n && j < m) { if (A[i] === Bn[j]) { ops.push([' ', A[i]]); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) { ops.push(['-', A[i++]]); } else { ops.push(['+', Bn[j++]]); } }
  while (i < n) ops.push(['-', A[i++]]); while (j < m) ops.push(['+', Bn[j++]]);
  if (!ops.some(function (o) { return o[0] !== ' '; })) return 0;
  if (uni) { c.out('--- ' + f[0] + '\n+++ ' + f[1] + '\n@@ -1,' + n + ' +1,' + m + ' @@\n'); ops.forEach(function (o) { c.out(o[0] + o[1] + '\n'); }); return 1; }
  var k = 0, la = 1, lb = 1;
  while (k < ops.length) {
    if (ops[k][0] === ' ') { la++; lb++; k++; continue; }
    var dl = [], ad = [], sa = la, sb = lb;
    while (k < ops.length && ops[k][0] !== ' ') { if (ops[k][0] === '-') { dl.push(ops[k][1]); la++; } else { ad.push(ops[k][1]); lb++; } k++; }
    var ra = dl.length > 1 ? sa + ',' + (sa + dl.length - 1) : String(sa), rb = ad.length > 1 ? sb + ',' + (sb + ad.length - 1) : String(sb);
    var op = dl.length && ad.length ? 'c' : dl.length ? 'd' : 'a';
    c.out((op === 'a' ? (sa - 1) : ra) + op + (op === 'd' ? (sb - 1) : rb) + '\n');
    dl.forEach(function (x) { c.out('< ' + x + '\n'); }); if (dl.length && ad.length) c.out('---\n'); ad.forEach(function (x) { c.out('> ' + x + '\n'); });
  }
  return 1;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
