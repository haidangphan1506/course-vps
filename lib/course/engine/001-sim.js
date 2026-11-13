(function (G) {
'use strict';
var VPS = G.VPS = G.VPS || {};
VPS.IP = '116.118.9.210';
VPS.cmds = {};
var cmds = VPS.cmds;
var NOW = 'Oct 26 17:49';

function CmdErr(msg, code) { this.msg = msg; this.code = code || 1; }
VPS.CmdErr = CmdErr;

// ================= FS =================
function FS() { this.n = {}; this.n['/'] = { t: 'd', mode: 493, owner: 'root' }; }
FS.prototype = {
  norm: function (p) {
    var parts = [], a = p.split('/');
    for (var i = 0; i < a.length; i++) { var s = a[i]; if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
    return '/' + parts.join('/');
  },
  res: function (cwd, p, home) {
    if (p === '~' || p.indexOf('~/') === 0) p = home + p.slice(1);
    if (p.charAt(0) !== '/') p = cwd + '/' + p;
    return this.norm(p);
  },
  real: function (p) {
    var g = 0, n = this.n[p];
    while (n && n.t === 'l' && g++ < 5) {
      var t = n.target;
      p = this.norm(t.charAt(0) === '/' ? t : p.replace(/[^\/]*$/, '') + t);
      n = this.n[p];
    }
    return p;
  },
  get: function (p, nofollow) { if (nofollow) return this.n[p]; return this.n[this.real(p)]; },
  ex: function (p) { return !!this.get(p); },
  isD: function (p) { var n = this.get(p); return !!n && n.t === 'd'; },
  isF: function (p) { var n = this.get(p); return !!n && n.t === 'f'; },
  parent: function (p) { return p.replace(/\/[^\/]*$/, '') || '/'; },
  mkdirp: function (p, owner, mode) {
    var parts = p.split('/').filter(Boolean), cur = '';
    for (var i = 0; i < parts.length; i++) {
      cur += '/' + parts[i];
      if (!this.n[cur]) this.n[cur] = { t: 'd', mode: mode || 493, owner: owner || 'root' };
    }
  },
  put: function (p, c, o) {
    o = o || {};
    p = this.real(p);
    this.mkdirp(this.parent(p), o.owner || 'root');
    var prev = this.n[p];
    this.n[p] = { t: 'f', c: c, mode: o.mode != null ? o.mode : (prev ? prev.mode : 420), owner: o.owner || (prev ? prev.owner : 'root'), size: o.size != null ? o.size : undefined };
  },
  link: function (p, target, owner) {
    this.mkdirp(this.parent(p), owner || 'root');
    this.n[p] = { t: 'l', target: target, mode: 511, owner: owner || 'root' };
  },
  list: function (dir) {
    var out = [], pre = dir === '/' ? '/' : dir + '/';
    for (var k in this.n) {
      if (k !== dir && k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') < 0) out.push(k.slice(pre.length));
    }
    return out.sort();
  },
  rm: function (p) {
    var pre = p + '/';
    for (var k in this.n) if (k === p || k.indexOf(pre) === 0) delete this.n[k];
  },
  size: function (p) {
    var n = this.n[p]; if (!n) return 0;
    if (n.t === 'f') return n.size != null ? n.size : (n.c || '').length;
    if (n.t === 'l') return n.target.length;
    var s = 0, pre = p === '/' ? '/' : p + '/';
    for (var k in this.n) if (k.indexOf(pre) === 0 && this.n[k].t === 'f') s += this.size(k);
    return s;
  }
};
VPS.FS = FS;

// ================= tokenizer / parser =================
function matchParen(s, open) {
  var d = 0;
  for (var i = open; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === "'") { var j = s.indexOf("'", i + 1); if (j < 0) return -1; i = j; continue; }
    if (c === '"') { var k = i + 1; while (k < s.length && s.charAt(k) !== '"') { if (s.charAt(k) === '\\') k++; k++; } i = k; continue; }
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}

function tokenize(s) {
  var toks = [], i = 0, n = s.length, cur = null, pd = 0;
  function push() { if (cur) { toks.push(cur); cur = null; } }
  function addp(q, v) {
    if (!cur) cur = { t: 'w', parts: [] };
    var last = cur.parts[cur.parts.length - 1];
    if (last && last.q === q && q !== 'c') last.v += v; else cur.parts.push({ q: q, v: v });
  }
  while (i < n) {
    var c = s.charAt(i);
    if (c === ' ' || c === '\t') { push(); i++; continue; }
    if (c === '#' && !cur) break;
    if (c === "'") {
      var j = s.indexOf("'", i + 1); if (j < 0) return { open: true };
      if (!cur) cur = { t: 'w', parts: [] };
      cur.parts.push({ q: 's', v: s.slice(i + 1, j) }); i = j + 1; continue;
    }
    if (c === '"') {
      var k = i + 1, buf = '';
      if (!cur) cur = { t: 'w', parts: [] };
      for (;;) {
        if (k >= n) return { open: true };
        var d = s.charAt(k);
        if (d === '\\' && '"\\$`'.indexOf(s.charAt(k + 1) || '#') >= 0 && k + 1 < n) { buf += s.charAt(k + 1) === '$' ? '\u0001' : s.charAt(k + 1); k += 2; continue; }
        if (d === '$' && s.charAt(k + 1) === '(') {
          var e = matchParen(s, k + 1); if (e < 0) return { open: true };
          if (buf) { cur.parts.push({ q: 'd', v: buf }); buf = ''; }
          cur.parts.push({ q: 'c', v: s.slice(k + 2, e), dq: true }); k = e + 1; continue;
        }
        if (d === '"') break;
        buf += d; k++;
      }
      cur.parts.push({ q: 'd', v: buf }); i = k + 1; continue;
    }
    if (c === '\\') {
      if (i + 1 >= n) { i++; continue; }
      if (!cur) cur = { t: 'w', parts: [] };
      cur.parts.push({ q: 's', v: s.charAt(i + 1) }); i += 2; continue;
    }
    if (c === '$' && s.charAt(i + 1) === '(') {
      var e2 = matchParen(s, i + 1); if (e2 < 0) return { open: true };
      if (!cur) cur = { t: 'w', parts: [] };
      cur.parts.push({ q: 'c', v: s.slice(i + 2, e2) }); i = e2 + 1; continue;
    }
    var two = s.substr(i, 2), op = null;
    if (c === '(' && !cur) { pd++; op = '('; }
    else if (c === ')' && pd > 0) { pd--; op = ')'; }
    else if (!cur && s.substr(i, 4) === '2>&1') op = '2>&1';
    else if (s.substr(i, 3) === '>&2') op = '>&2';
    else if (!cur && s.substr(i, 4) === '1>&2') { push(); toks.push({ t: 'op', v: '>&2' }); i += 4; continue; }
    else if (!cur && s.substr(i, 3) === '1>>') { push(); toks.push({ t: 'op', v: '>>' }); i += 3; continue; }
    else if (!cur && /[3-9]/.test(c) && s.charAt(i + 1) === '>' && s.charAt(i + 2) !== '>' && s.charAt(i + 2) !== '&') { push(); toks.push({ t: 'op', v: '>', fd: +c }); i += 2; continue; }
    else if (!cur && two === '1>') { push(); toks.push({ t: 'op', v: '>' }); i += 2; continue; }
    else if (two === '>|') op = '>|';
    else if (!cur && two === '2>') op = s.charAt(i + 2) === '>' ? '2>>' : '2>';
    else if (s.substr(i, 3) === '<<<') op = '<<<';
    else if (two === '&&' || two === '||' || two === '>>' || two === ';;') op = two;
    else if (s.substr(i, 3) === '<<-') op = '<<-';
    else if (two === '<<') op = '<<';
    else if (two === '&>') op = '&>';
    else if (c === '|' || c === ';' || c === '>' || c === '<' || c === '&') op = c;
    if (op) { push(); toks.push({ t: 'op', v: op }); i += op.length; continue; }
    addp('n', c); i++;
  }
  push();
  // heredoc delimiters
  var out = [];
  for (var x = 0; x < toks.length; x++) {
    var t = toks[x];
    if (t.t === 'op' && (t.v === '<<' || t.v === '<<-')) {
      var nx = toks[x + 1];
      if (nx && nx.t === 'w') {
        t.delim = nx.parts.map(function (p) { return p.v; }).join('');
        t.quoted = nx.parts.some(function (p) { return p.q !== 'n'; });
        t.strip = t.v === '<<-'; t.v = '<<'; x++;
      }
    }
    out.push(t);
  }
  return { tokens: out };
}

function btick(text) {
  if (text.indexOf('`') < 0) return text;
  var out = '', i = 0, n = text.length, sq = false;
  while (i < n) {
    var ch = text.charAt(i);
    if (ch === "'" ) { sq = !sq; out += ch; i++; continue; }
    if (ch === '`' && !sq) { var j = text.indexOf('`', i + 1); if (j > 0) { out += '$(' + text.slice(i + 1, j) + ')'; i = j + 1; continue; } }
    out += ch; i++;
  }
  return out;
}
function parseInput(text) {
  text = btick(text);
  var raw = text.split('\n'), cmds2 = [], i = 0;
  while (i < raw.length) {
    var line = raw[i++];
    if (line.trim() === '') continue;
    var tk;
    for (;;) {
      while (/\\$/.test(line) && !/\\\\$/.test(line)) { if (i >= raw.length) return { complete: false }; line = line.slice(0, -1) + raw[i++]; }
      tk = tokenize(line);
      if (tk.open) { if (i >= raw.length) return { complete: false }; line += '\n' + raw[i++]; continue; }
      var last = tk.tokens[tk.tokens.length - 1];
      if (last && last.t === 'op' && (last.v === '|' || last.v === '&&' || last.v === '||')) {
        if (i >= raw.length) return { complete: false }; line += ' ' + raw[i++]; continue;
      }
      break;
    }
    for (var x = 0; x < tk.tokens.length; x++) {
      var t = tk.tokens[x];
      if (t.t === 'op' && t.v === '<<') {
        var body = [], found = false;
        while (i < raw.length) {
          var l = raw[i++];
          if ((t.strip ? l.replace(/^\t+/, '') : l) === t.delim) { found = true; break; }
          body.push(t.strip ? l.replace(/^\t+/, '') : l);
        }
        if (!found) return { complete: false };
        t.body = body.length ? body.join('\n') + '\n' : '';
      }
    }
    cmds2.push(tk.tokens);
  }
  return { complete: true, cmds: cmds2 };
}

function parseTokens(toks) {
  var items = [], pipe = [], cmd = { words: [], redirs: [] }, pend = null, pendFd = 0;
  function endCmd() { pipe.push(cmd); cmd = { words: [], redirs: [] }; }
  for (var k = 0; k < toks.length; k++) {
    var t = toks[k];
    if (t.t === 'w') {
      if (pend) { cmd.redirs.push({ op: pend, target: t, fd: pendFd }); pend = null; pendFd = 0; } else cmd.words.push(t);
    } else {
      var v = t.v;
      if (v === '2>&1' || v === '>&2') cmd.redirs.push({ op: v });
      else if (v === '>' || v === '>>' || v === '<' || v === '<<<' || v === '2>' || v === '2>>' || v === '&>' || v === '>|') { pend = v; pendFd = t.fd || 0; }
      else if (v === '<<') cmd.redirs.push({ op: '<<', body: t.body || '', quoted: t.quoted });
      else if (v === '|') endCmd();
      else if (v === '&&' || v === '||' || v === ';') { endCmd(); items.push({ pipe: pipe, sep: v }); pipe = []; }
    }
  }
  endCmd(); items.push({ pipe: pipe, sep: null });
  return items;
}

VPS._p = { parseInput: parseInput, parseTokens: parseTokens, tokenize: tokenize };
// ================= Shell =================
function Shell(cfg) {
  cfg = cfg || {};
  this.fs = new FS();
  this.W = cfg.W || (VPS.newWorld ? VPS.newWorld() : {});
  this.hostName = cfg.host || 'vps';
  this.user = cfg.user || 'haidangphan';
  this.home = cfg.home || (this.user === 'root' ? '/root' : '/home/' + this.user);
  this.cwd = cfg.cwd || this.home;
  this.vars = {}; this.hist = []; this.lastStatus = 0; this.aliases = {};
  this.env = { HOME: this.home, USER: this.user, SHELL: '/bin/bash', LANG: 'en_US.UTF-8' };
  this.baseFS();
  if (cfg.setup) cfg.setup(this);
}
VPS.Shell = Shell;
var SP = Shell.prototype;

SP.baseFS = function () {
  var f = this.fs, u = this.user;
  ['/etc', '/var', '/var/log', '/usr', '/usr/bin', '/opt', '/root', '/home', '/run'].forEach(function (d) { f.mkdirp(d, 'root'); });
  f.mkdirp('/tmp', 'root', 511);
  f.mkdirp(this.home, u === 'root' ? 'root' : u, 493);
  f.mkdirp(this.home + '/.ssh', u, 448);
  f.put('/etc/hostname', this.hostName + '\n');
  f.put('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\n');
  f.mkdirp('/home/' + u, u, 493);
};

SP.prompt = function () {
  var p = this.cwd;
  if (p === this.home) p = '~'; else if (p.indexOf(this.home + '/') === 0) p = '~' + p.slice(this.home.length);
  return this.user + '@' + this.hostName + ':' + p + (this.user === 'root' ? '# ' : '$ ');
};
SP.abs = function (p) { return this.fs.res(this.cwd, p, this.home); };
SP.isRoot = function (c) { return !!(c && c.sudo) || this.user === 'root'; };

SP.canRead = function (p, c) {
  if (this.isRoot(c)) return true;
  var n = this.fs.get(p); if (!n) return true;
  if (n.owner === this.user) return true;
  return !!(n.mode & 4);
};
SP.canWrite = function (p, c) {
  if (this.isRoot(c)) return true;
  p = this.fs.real(p);
  var n = this.fs.n[p];
  if (n) return n.owner === this.user ? !!(n.mode & 128) : !!(n.mode & 2);
  var pp = this.fs.parent(p), d = this.fs.n[pp];
  while (!d && pp && pp !== '/') { pp = this.fs.parent(pp); d = this.fs.n[pp]; }
  if (!d) return false;
  return d.owner === this.user || !!(d.mode & 2);
};
SP.readFile = function (p, c, who) {
  var n = this.fs.get(p);
  if (!n) throw new CmdErr(who + ': ' + this.shortPath(p) + ': No such file or directory');
  if (n.t === 'd') throw new CmdErr(who + ': ' + this.shortPath(p) + ': Is a directory');
  if (!this.canRead(p, c)) throw new CmdErr(who + ': ' + this.shortPath(p) + ': Permission denied');
  return n.c || '';
};
SP.writeFile = function (p, content, c, who, append) {
  if (this.fs.isD(p)) throw new CmdErr(who + ': ' + this.shortPath(p) + ': Is a directory');
  if (!this.canWrite(p, c)) throw new CmdErr(who + ': ' + this.shortPath(p) + ': Permission denied');
  var prev = this.fs.get(p);
  var owner = this.isRoot(c) ? 'root' : this.user;
  if (prev) owner = prev.owner;
  this.fs.put(p, (append && prev ? prev.c : '') + content, { owner: owner, mode: prev ? prev.mode : 438 & ~(this.fs.umask != null ? this.fs.umask : 18) });
  if (this.onWrite) this.onWrite(this.fs.real(p));
};
SP.shortPath = function (p) { return p; };

// ---------- expansion ----------
SP.getVar = function (name) {
  if (name === '?') return String(this.lastStatus);
  if (name === '$') return '4242';
  if (this.vars[name] != null) return this.vars[name];
  if (this.env[name] != null) return this.env[name];
  return '';
};
SP.expVars = function (s) {
  var self = this;
  return s.replace(/\$\{(\w+)(?::-([^}]*))?\}|\$(\w+|\?|\$)/g, function (m, a, def, b) {
    var name = a || b, v = self.getVar(name);
    return v === '' && def != null ? def : v;
  });
};
SP.expHere = function (body) {
  var self = this, out = '', i = 0, n = body.length;
  while (i < n) {
    var ch = body.charAt(i), nx = body.charAt(i + 1);
    if (ch === '\\' && (nx === '$' || nx === '`' || nx === '\\')) { out += nx; i += 2; continue; }
    if (ch === '\\' && nx === '\n') { i += 2; continue; }
    if (ch === '$' && nx === '(') {
      var dbl = body.charAt(i + 2) === '(', depth = 0, j = i + 1;
      for (; j < n; j++) { var cj = body.charAt(j); if (cj === '(') depth++; else if (cj === ')') { depth--; if (!depth) break; } }
      if (j < n) {
        var inner = body.slice(i + 2, j);
        if (dbl && body.charAt(j - 1) === ')') { try { out += String(self.arith(body.slice(i + 3, j - 1))); } catch (e0) { out += '0'; } }
        else out += self.subst(inner);
        i = j + 1; continue;
      }
    }
    if (ch === '`') { var k = body.indexOf('`', i + 1); if (k > 0) { out += self.subst(body.slice(i + 1, k)); i = k + 1; continue; } }
    if (ch === '$') {
      var m = /^\$\{(\w+)(?::-([^}]*))?\}|^\$(\w+|\?|\$)/.exec(body.slice(i));
      if (m) { var nm = m[1] || m[3], v = self.getVar(nm); out += (v === '' && m[2] != null) ? m[2] : v; i += m[0].length; continue; }
    }
    out += ch; i++;
  }
  return out;
};
SP.subst = function (text) {
  var save = this.capture; this.subDepth = (this.subDepth || 0) + 1; var res; try { res = this.runCapture(text); } finally { this.subDepth--; }
  this.capture = save; this.substCode = this.lastStatus;
  return res.replace(/\n+$/, '');
};
SP.globExpand = function (pat) {
  var self = this, abs = pat.charAt(0) === '/';
  var segs = pat.split('/').filter(function (s, i) { return s !== '' || false; });
  var bases = [abs ? '/' : self.cwd], outPrefix = [abs ? '/' : ''];
  var results = [{ real: abs ? '/' : self.cwd, shown: abs ? '/' : '' }];
  segs.forEach(function (seg, idx) {
    var next = [];
    results.forEach(function (r) {
      if (!/[*?]/.test(seg)) {
        var real = r.real === '/' ? '/' + seg : r.real + '/' + seg;
        var shown = r.shown === '' ? seg : (r.shown === '/' ? '/' + seg : r.shown + '/' + seg);
        if (self.fs.ex(real)) next.push({ real: real, shown: shown });
        return;
      }
      if (!self.fs.isD(r.real)) return;
      var re = new RegExp('^' + seg.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$');
      self.fs.list(self.fs.real(r.real)).forEach(function (nm) {
        if (nm.charAt(0) === '.' && seg.charAt(0) !== '.') return;
        if (!re.test(nm)) return;
        var real = r.real === '/' ? '/' + nm : r.real + '/' + nm;
        var shown = r.shown === '' ? nm : (r.shown === '/' ? '/' + nm : r.shown + '/' + nm);
        next.push({ real: real, shown: shown });
      });
    });
    results = next;
  });
  var out = results.map(function (r) { return r.shown; }).sort();
  return out.length ? out : [pat];
};
SP.expand = function (word) {
  var fields = [''], glob = false, self = this;
  word.parts.forEach(function (p, idx) {
    var cur = fields.length - 1;
    if (p.q === 's') fields[cur] += p.v;
    else if (p.q === 'd') fields[cur] += self.expVars(p.v).replace(/\u0001/g, '$');
    else if (p.q === 'n') {
      var v = p.v;
      if (idx === 0 && (v === '~' || v.indexOf('~/') === 0)) v = self.home + v.slice(1);
      if (/[*?]/.test(v)) glob = true;
      fields[cur] += self.expVars(v);
    } else if (p.q === 'c') {
      var out = self.subst(p.v);
      if (p.dq) fields[cur] += out;
      else {
        var ws = out.split(/\s+/).filter(Boolean);
        if (ws.length) { fields[cur] += ws[0]; for (var i = 1; i < ws.length; i++) fields.push(ws[i]); }
      }
    }
  });
  var res = [];
  fields.forEach(function (f) { if (glob && /[*?]/.test(f)) res = res.concat(self.globExpand(f)); else res.push(f); });
  return res;
};

// ---------- execution ----------
SP.runCapture = function (text) {
  var save = this.cur;
  this.cur = { disp: '' };
  this.execText(text);
  var out = this.cur.disp; this.cur = save; return out;
};

SP.execText = function (text) {
  var P = parseInput(text);
  if (!P.complete) { this.cur.disp += 'bash: syntax error: unexpected end of file\n'; this.lastStatus = 2; return; }
  for (var i = 0; i < P.cmds.length; i++) {
    var items = parseTokens(P.cmds[i]), prevSep = null;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var ok = prevSep === null || prevSep === ';' || (prevSep === '&&' && this.lastStatus === 0) || (prevSep === '||' && this.lastStatus !== 0);
      if (ok) this.runPipeline(it.pipe);
      prevSep = it.sep;
    }
  }
};

SP.runPipeline = function (pipe, init) {
  var stdin = init || '', last = pipe.length - 1;
  for (var k = 0; k <= last; k++) {
    var r = this.runCmd(pipe[k], stdin, k === last);
    if (r.errText) this.cur.disp += r.errText;
    if (k === last) { if (r.outText) this.cur.disp += r.outText; }
    stdin = r.outText || '';
    this.lastStatus = r.code;
  }
};

SP.runCmd = function (cmd, stdin, isLast) {
  var self = this, argv = [];
  this.substCode = null;
  cmd.words.forEach(function (w) { argv = argv.concat(self.expand(w)); });
  // leading assignments
  var temp = {};
  while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) {
    var m = /^([A-Za-z_]\w*)=(.*)$/.exec(argv[0]); temp[m[1]] = m[2]; argv.shift();
  }
  if (!argv.length) { for (var tk in temp) this.vars[tk] = temp[tk]; return { outText: '', errText: '', code: this.substCode || 0 }; }
  var outTarget = null, errTarget = null, merge = false, bad = null, toErr = false;
  for (var i = 0; i < cmd.redirs.length; i++) {
    var r = cmd.redirs[i];
    if (r.op === '2>&1') { merge = true; continue; }
    if (r.op === '>&2') { toErr = true; continue; }
    if (r.op === '<<') { stdin = r.quoted ? r.body : this.expHere(r.body); continue; }
    var tgt = this.expand(r.target)[0] || '';
    if (r.fd) { var fp = this.abs(tgt); if (!this.fs.get(fp)) this.fs.put(fp, '', { owner: this.user, mode: 420 }); this.fds = this.fds || {}; this.fds[r.fd] = fp; continue; }
    if (r.op === '<<<') { stdin = this.expand(r.target).join(' ') + '\n'; continue; }
    if (r.op === '<') {
      try { stdin = this.readFile(this.abs(tgt), {}, 'bash'); } catch (e) { bad = e.msg; }
    } else if (r.op === '>' || r.op === '>>' || r.op === '&>' || r.op === '>|') {
      outTarget = { path: tgt, append: r.op === '>>' }; if (r.op === '&>') merge = true;
      if (r.op === '>' && this.flags && this.flags.C && tgt !== '/dev/null' && this.fs.get(this.abs(tgt)) && !this.fs.isD(this.abs(tgt))) bad = 'bash: ' + tgt + ': cannot overwrite existing file';
    } else if (r.op === '2>' || r.op === '2>>') errTarget = { path: tgt, append: r.op === '2>>' };
  }
  if (outTarget && outTarget.path !== '/dev/null') {
    var ap = this.abs(outTarget.path);
    if (!this.canWrite(ap, {}) || this.fs.isD(ap)) bad = 'bash: ' + outTarget.path + ': ' + (this.fs.isD(ap) ? 'Is a directory' : 'Permission denied');
    else if (!this.fs.isD(this.fs.parent(ap))) bad = 'bash: ' + outTarget.path + ': No such file or directory';
  }
  if (bad) return { outText: '', errText: (/^bash:/.test(bad) ? bad : 'bash: ' + bad) + '\n', code: 1 };
  if (outTarget && outTarget.path !== '/dev/null' && argv.length) {
    var otp = this.abs(outTarget.path);
    if (argv[0] === 'cat' && argv.slice(1).some(function (x) { return x.charAt(0) !== '-' && this.abs(x) === otp; }, this)) {
      if (!outTarget.append) { try { this.writeFile(otp, '', {}, 'bash', false); } catch (e0) {} }
      var ent0 = { cmd: argv.join(' '), code: 1, sudo: false }; this.hist.push(ent0); if (this.onCmd) this.onCmd(ent0);
      return { outText: '', errText: 'cat: ' + outTarget.path + ': input file is output file\n', code: 1 };
    }
    if (!outTarget.append) { try { this.writeFile(otp, '', {}, 'bash', false); } catch (e1) {} }
  }
  var ctx = { stdin: stdin, o: [], sh: this, sudo: false, tempEnv: temp, piped: !isLast || !!outTarget || !!this.subDepth };
  ctx.out = function (s) { ctx.o.push(['o', s]); };
  ctx.err = function (s) { ctx.o.push(['e', s]); };
  var saveEnv = {};
  for (var tn in temp) { saveEnv[tn] = this.env[tn]; this.env[tn] = temp[tn]; }
  var code = this.dispatch(argv, ctx, true);
  for (var sn in saveEnv) { if (saveEnv[sn] == null) delete this.env[sn]; else this.env[sn] = saveEnv[sn]; }
  var outT = '', errT = '';
  ctx.o.forEach(function (x) { if ((x[0] === 'o' && !toErr) || merge) outT += x[1]; else errT += x[1]; });
  if (errTarget) {
    if (errTarget.path !== '/dev/null') { try { this.writeFile(this.abs(errTarget.path), errT, {}, 'bash', errTarget.append); } catch (e) {} }
    errT = '';
  }
  if (outTarget) {
    if (outTarget.path !== '/dev/null') { try { this.writeFile(this.abs(outTarget.path), outT, {}, 'bash', outTarget.append); } catch (e2) { errT += e2.msg + '\n'; code = 1; } }
    outT = '';
  }
  return { outText: outT, errText: errT, code: code };
};

SP.dispatch = function (argv, ctx, top) {
  var name = argv[0], args = argv.slice(1), code = 0;
  var fn = VPS.builtins[name] || cmds[name];
  if (top) this.hist.push({ cmd: argv.join(' '), code: null, sudo: false });
  var entry = top ? this.hist[this.hist.length - 1] : null;
  if (!fn) { ctx.err('bash: ' + name + ': command not found\n'); code = 127; }
  else {
    try { var r = fn(args, ctx); code = typeof r === 'number' ? r : 0; }
    catch (e) {
      if (e instanceof CmdErr) { ctx.err(e.msg + '\n'); code = e.code; }
      else throw e;
    }
  }
  if (entry) { entry.code = code; entry.sudo = name === 'sudo'; if (this.onCmd) this.onCmd(entry); }
  return code;
};
SP.call = function (argv, parent, opts) {
  var c2 = Object.create(parent);
  c2.sudo = !!(opts && opts.sudo) || parent.sudo;
  return this.dispatch(argv, c2, false);
};

SP.isComplete = function (text) { return parseInput(text).complete; };

SP.run = function (text) {
  this.cur = { disp: '' }; this.clearFlag = false;
  var P = parseInput(text);
  if (!P.complete) return { needMore: true };
  this.execText(text);
  var out = this.cur.disp;
  return { out: out, code: this.lastStatus, clear: this.clearFlag };
};

SP.complete = function (line) {
  var m = /(\S*)$/.exec(line), word = m[1], first = line.slice(0, m.index).trim() === '';
  var matches = [];
  if (first && word.indexOf('/') < 0) {
    var names = Object.keys(cmds).concat(Object.keys(VPS.builtins));
    matches = names.filter(function (n) { return n.indexOf(word) === 0; });
  } else {
    var dir, base;
    var i = word.lastIndexOf('/');
    var dpart = i >= 0 ? word.slice(0, i + 1) : '', bpart = i >= 0 ? word.slice(i + 1) : word;
    dir = this.abs(dpart === '' ? '.' : dpart);
    if (this.fs.isD(dir)) {
      matches = this.fs.list(this.fs.real(dir)).filter(function (n) { return n.indexOf(bpart) === 0 && (n.charAt(0) !== '.' || bpart.charAt(0) === '.'); }).map(function (n) {
        var full = (dir === '/' ? '/' : dir + '/') + n;
        return dpart + n + (this.fs.isD(full) ? '/' : '');
      }, this);
    }
  }
  matches.sort();
  return { word: word, matches: matches };
};

// ================= builtins =================
VPS.builtins = {
  cd: function (a, c) {
    var sh = c.sh, t = a[0] === undefined ? sh.home : a[0];
    if (t === '-') t = sh.oldpwd || sh.cwd;
    var p = sh.abs(t);
    if (!sh.fs.ex(p)) throw new CmdErr('bash: cd: ' + t + ': No such file or directory');
    if (!sh.fs.isD(p)) throw new CmdErr('bash: cd: ' + t + ': Not a directory');
    sh.oldpwd = sh.cwd; sh.cwd = p; return 0;
  },
  export: function (a, c) {
    a.forEach(function (x) { var m = /^(\w+)=(.*)$/.exec(x); if (m) c.sh.env[m[1]] = m[2]; else if (c.sh.vars[x] != null) c.sh.env[x] = c.sh.vars[x]; });
    return 0;
  },
  unset: function (a, c) { a.forEach(function (x) { delete c.sh.vars[x]; delete c.sh.env[x]; }); return 0; },
  alias: function (a, c) { a.forEach(function (x) { var m = /^(\w+)=(.*)$/.exec(x); if (m) c.sh.aliases[m[1]] = m[2]; }); return 0; },
  exit: function (a, c) { c.out('logout\n'); return 0; },
  clear: function (a, c) { c.sh.clearFlag = true; return 0; },
  history: function (a, c) { c.sh.hist.forEach(function (h, i) { c.out('  ' + (i + 1) + '  ' + h.cmd + '\n'); }); return 0; },
  'true': function () { return 0; },
  'false': function () { return 1; }
};

// ================= helpers =================
function modeStr(n) {
  var t = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : '-', m = n.mode, s = t;
  for (var i = 8; i >= 0; i--) s += (m >> i) & 1 ? 'rwx'.charAt(8 - i - 0 === 0 ? 0 : (8 - i) % 3) : '-';
  return s;
}
function modeString(n) {
  var t = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : '-', s = t, ch = 'rwxrwxrwx';
  for (var i = 0; i < 9; i++) s += (n.mode >> (8 - i)) & 1 ? ch.charAt(i) : '-';
  if (n.mode & 2048) s = s.slice(0, 3) + (s.charAt(3) === 'x' ? 's' : 'S') + s.slice(4);
  if (n.mode & 1024) s = s.slice(0, 6) + (s.charAt(6) === 'x' ? 's' : 'S') + s.slice(7);
  if (n.mode & 512) s = s.slice(0, 9) + (s.charAt(9) === 'x' ? 't' : 'T');
  return s;
}
function pad(s, n, left) { s = String(s); while (s.length < n) s = left ? ' ' + s : s + ' '; return s; }
VPS.util = { modeString: modeString, pad: pad, NOW: NOW };

function parseFlags(a, withArg) {
  var flags = {}, rest = [], i = 0, done = false;
  for (; i < a.length; i++) {
    var x = a[i];
    if (done || x === '-' || x.charAt(0) !== '-') { rest.push(x); continue; }
    if (x === '--') { done = true; continue; }
    if (x.indexOf('--') === 0) { flags[x.slice(2)] = true; continue; }
    for (var j = 1; j < x.length; j++) {
      var ch = x.charAt(j);
      if (withArg && withArg.indexOf(ch) >= 0) {
        flags[ch] = x.slice(j + 1) || a[++i]; break;
      }
      flags[ch] = true;
    }
  }
  return { f: flags, rest: rest };
}
VPS.parseFlags = parseFlags;

function lines(s) { if (s === '') return []; var l = s.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; }
VPS.lines = lines;

// ================= basic commands =================
cmds.echo = function (a, c) {
  var nl = true, esc = false;
  while (a.length && /^-[neE]+$/.test(a[0])) { if (a[0].indexOf('n') > 0) nl = false; if (a[0].indexOf('e') > 0) esc = true; a = a.slice(1); }
  var s = a.join(' ');
  if (esc) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  c.out(s + (nl ? '\n' : '')); return 0;
};
cmds.pwd = function (a, c) { c.out(c.sh.cwd + '\n'); return 0; };
cmds.whoami = function (a, c) { c.out((c.sudo ? 'root' : c.sh.user) + '\n'); return 0; };
cmds.id = function (a, c) {
  var u = c.sudo ? 'root' : c.sh.user;
  if (u === 'root') c.out('uid=0(root) gid=0(root) groups=0(root)\n');
  else c.out('uid=1000(' + u + ') gid=1000(' + u + ') groups=1000(' + u + '),4(adm),27(sudo),988(docker)\n');
  return 0;
};
cmds.hostname = function (a, c) { c.out(c.sh.hostName + '\n'); return 0; };

cmds.uname = function (a, c) { c.out(a.indexOf('-a') >= 0 ? 'Linux ' + c.sh.hostName + ' 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux\n' : 'Linux\n'); return 0; };
cmds.uptime = function (a, c) { c.out(' 17:49:00 up 6 days,  3:12,  1 user,  load average: 0.21, 0.18, 0.15\n'); return 0; };
cmds.env = function (a, c) { for (var k in c.sh.env) c.out(k + '=' + c.sh.env[k] + '\n'); return 0; };
cmds.printenv = function (a, c) { if (a[0]) { var v = c.sh.env[a[0]]; if (v == null) return 1; c.out(v + '\n'); } else cmds.env(a, c); return 0; };
cmds.which = function (a, c) {
  var map = { nginx: '/usr/sbin/nginx', docker: '/usr/bin/docker', pm2: '/usr/local/bin/pm2', node: '/usr/bin/node', ufw: '/usr/sbin/ufw', certbot: '/usr/bin/certbot', curl: '/usr/bin/curl' };
  var rc = 0; a.forEach(function (x) { if (map[x]) c.out(map[x] + '\n'); else if (cmds[x]) c.out('/usr/bin/' + x + '\n'); else rc = 1; }); return rc;
};
cmds.sleep = function (a, c) { if (c && c.sh && c.sh.W && c.sh.W.nginx) c.sh.W.nginx.hits = {}; return 0; };
cmds.man = function (a, c) { c.out('Mô phỏng: không có trang man. Dùng --help hoặc xem phần lý thuyết.\n'); return 0; };

cmds.sudo = function (a, c) {
  var sh = c.sh, i = 0;
  while (i < a.length && a[i].charAt(0) === '-') { if (a[i] === '-u') i++; i++; }
  var argv = a.slice(i);
  if (!argv.length) { c.out('usage: sudo [-u user] command\n'); return 1; }
  if (sh.user === 'root') return sh.call(argv, c, { sudo: true });
  if (sh.W && sh.W.noSudo) { c.err(sh.user + ' is not in the sudoers file.\n'); return 1; }
  return sh.call(argv, c, { sudo: true });
};

cmds.ls = function (a, c) {
  var sh = c.sh, P = parseFlags(a), f = P.f, long = f.l, all = f.a || f.A;
  var paths = P.rest.length ? P.rest : ['.'], rc = 0, multi = paths.length > 1;
  function row(n, name, full) {
    if (!long) return name;
    var size = sh.fs.size(full);
    if (n.t === 'd') size = 4096;
    var sz = f.h ? (size >= 1048576 ? (size / 1048576).toFixed(1) + 'M' : size >= 1024 ? (size / 1024).toFixed(1) + 'K' : String(size)) : String(size);
    var line = modeString(n) + ' ' + (n.t === 'd' ? '2' : '1') + ' ' + pad(n.owner, 8) + ' ' + pad(n.group || n.owner, 8) + ' ' + pad(sz, 6, true) + ' ' + NOW + ' ' + name;
    if (n.t === 'l') line += ' -> ' + n.target;
    return line;
  }
  paths.forEach(function (p, idx) {
    var full = sh.abs(p), n = sh.fs.get(full, true), tn = sh.fs.get(full);
    if (!n) { c.err("ls: cannot access '" + p + "': No such file or directory\n"); rc = 2; return; }
    if (tn && tn.t === 'd' && !f.d) {
      if (!sh.canRead(full, c)) { c.err("ls: cannot open directory '" + p + "': Permission denied\n"); rc = 2; return; }
      if (multi) c.out((idx ? '\n' : '') + p + ':\n');
      var real = sh.fs.real(full), names = sh.fs.list(real);
      if (all) names = ['.', '..'].concat(names); else names = names.filter(function (x) { return x.charAt(0) !== '.'; });
      names.sort(function (x, y) { return x.replace(/^\./, '').toLowerCase() < y.replace(/^\./, '').toLowerCase() ? -1 : 1; });
      if (long) c.out('total ' + names.length * 4 + '\n');
      var out = [];
      names.forEach(function (nm) {
        var fp = nm === '.' ? real : nm === '..' ? sh.fs.parent(real) : (real === '/' ? '/' : real + '/') + nm;
        var nn = sh.fs.get(fp, true) || { t: 'd', mode: 493, owner: 'root' };
        out.push(row(nn, nm, fp));
      });
      if (long) c.out(out.join('\n') + (out.length ? '\n' : '')); else c.out(out.join('  ') + (out.length ? '\n' : ''));
    } else c.out(row(n, p, full) + '\n');
  });
  return rc;
};

cmds.cat = function (a, c) {
  var sh = c.sh, P = parseFlags(a), rc = 0;
  if (!P.rest.length) { c.out(c.stdin); return 0; }
  P.rest.forEach(function (p) {
    try { var s = sh.readFile(sh.abs(p), c, 'cat');
      if (P.f.n) { var n = 0; s = lines(s).map(function (l) { return pad(++n, 6, true) + '\t' + l; }).join('\n') + '\n'; }
      c.out(s); }
    catch (e) { if (e instanceof CmdErr) { c.err(e.msg + '\n'); rc = 1; } else throw e; }
  });
  return rc;
};

function headTail(isHead) {
  return function (a, c) {
    var sh = c.sh, n = 10, files = [], i;
    for (i = 0; i < a.length; i++) {
      if (a[i] === '-n') n = parseInt(a[++i], 10);
      else if (/^-n\d+$/.test(a[i])) n = parseInt(a[i].slice(2), 10);
      else if (/^-\d+$/.test(a[i])) n = parseInt(a[i].slice(1), 10);
      else if (a[i] === '-f' || a[i] === '-F') continue;
      else files.push(a[i]);
    }
    var text = files.length ? files.map(function (p) { return sh.readFile(sh.abs(p), c, isHead ? 'head' : 'tail'); }).join('') : c.stdin;
    var l = lines(text);
    c.out((isHead ? l.slice(0, n) : l.slice(Math.max(0, l.length - n))).join('\n') + (l.length ? '\n' : ''));
    return 0;
  };
}
cmds.head = headTail(true);
cmds.tail = headTail(false);

cmds.wc = function (a, c) {
  var sh = c.sh, P = parseFlags(a), f = P.f;
  var text = P.rest.length ? P.rest.map(function (p) { return sh.readFile(sh.abs(p), c, 'wc'); }).join('') : c.stdin;
  var l = lines(text).length, w = text.split(/\s+/).filter(Boolean).length, b = text.length;
  var parts = [];
  if (f.l) parts.push(l); if (f.w) parts.push(w); if (f.c) parts.push(b);
  if (!parts.length) parts = [l, w, b];
  c.out(parts.join(' ') + (P.rest.length === 1 ? ' ' + P.rest[0] : '') + '\n'); return 0;
};

cmds.mkdir = function (a, c) {
  var sh = c.sh, P = parseFlags(a, 'm'), rc = 0;
  P.rest.forEach(function (p) {
    var full = sh.abs(p);
    if (sh.fs.ex(full)) { if (!P.f.p) { c.err("mkdir: cannot create directory '" + p + "': File exists\n"); rc = 1; } return; }
    if (!P.f.p && !sh.fs.isD(sh.fs.parent(full))) { c.err("mkdir: cannot create directory '" + p + "': No such file or directory\n"); rc = 1; return; }
    if (!sh.canWrite(full, c) && !(P.f.p && sh.canWrite(full, c))) { c.err("mkdir: cannot create directory '" + p + "': Permission denied\n"); rc = 1; return; }
    var owner = sh.isRoot(c) ? 'root' : sh.user;
    sh.fs.mkdirp(full, owner, P.f.m ? parseInt(P.f.m, 8) : 493);
  });
  return rc;
};

cmds.touch = function (a, c) {
  var sh = c.sh, rc = 0;
  a.forEach(function (p) {
    var full = sh.abs(p);
    if (sh.fs.ex(full)) return;
    try { sh.writeFile(full, '', c, 'touch'); } catch (e) { c.err("touch: cannot touch '" + p + "': " + e.msg.replace(/^.*: /, '') + '\n'); rc = 1; }
  });
  return rc;
};

cmds.rm = function (a, c) {
  var sh = c.sh, P = parseFlags(a), rc = 0, rec = P.f.r || P.f.R || P.f.recursive;
  P.rest.forEach(function (p) {
    var full = sh.abs(p), n = sh.fs.get(full, true);
    if (!n) { if (!P.f.f) { c.err("rm: cannot remove '" + p + "': No such file or directory\n"); rc = 1; } return; }
    if (n.t === 'd' && !rec) { c.err("rm: cannot remove '" + p + "': Is a directory\n"); rc = 1; return; }
    if (!sh.canWrite(sh.fs.parent(full) + '/x', c) || (sh.fs.get(sh.fs.parent(full)) && sh.fs.get(sh.fs.parent(full)).owner !== sh.user && !sh.isRoot(c) && !(sh.fs.get(sh.fs.parent(full)).mode & 2))) { c.err("rm: cannot remove '" + p + "': Permission denied\n"); rc = 1; return; }
    if (n.t === 'f' && n.held) sh.W.heldBytes = (sh.W.heldBytes || 0) + sh.fs.size(full);
    sh.fs.rm(full);
  });
  return rc;
};

function copyNode(sh, from, to, c) {
  var n = sh.fs.get(from);
  if (n.t === 'd') {
    sh.fs.mkdirp(to, sh.isRoot(c) ? 'root' : sh.user, n.mode);
    sh.fs.list(sh.fs.real(from)).forEach(function (nm) { copyNode(sh, from + '/' + nm, to + '/' + nm, c); });
  } else sh.fs.put(to, n.c, { owner: sh.isRoot(c) ? 'root' : sh.user, mode: n.mode, size: n.size });
}
cmds.cp = function (a, c) {
  var sh = c.sh, P = parseFlags(a), rec = P.f.r || P.f.R || P.f.a, r = P.rest;
  if (r.length < 2) throw new CmdErr('cp: missing destination file operand');
  var dest = sh.abs(r[r.length - 1]), rc = 0;
  r.slice(0, -1).forEach(function (s) {
    var from = sh.abs(s);
    if (!sh.fs.ex(from)) { c.err("cp: cannot stat '" + s + "': No such file or directory\n"); rc = 1; return; }
    if (sh.fs.isD(from) && !rec) { c.err("cp: -r not specified; omitting directory '" + s + "'\n"); rc = 1; return; }
    var to = sh.fs.isD(dest) ? dest + '/' + from.split('/').pop() : dest;
    if (!sh.canRead(from, c)) { c.err("cp: cannot open '" + s + "' for reading: Permission denied\n"); rc = 1; return; }
    if (!sh.canWrite(to, c)) { c.err("cp: cannot create regular file '" + r[r.length - 1] + "': Permission denied\n"); rc = 1; return; }
    copyNode(sh, from, to, c);
  });
  return rc;
};
cmds.mv = function (a, c) {
  var sh = c.sh, r = parseFlags(a).rest;
  if (r.length < 2) throw new CmdErr('mv: missing destination file operand');
  var dest = sh.abs(r[r.length - 1]), rc = 0;
  r.slice(0, -1).forEach(function (s) {
    var from = sh.abs(s);
    if (!sh.fs.get(from, true)) { c.err("mv: cannot stat '" + s + "': No such file or directory\n"); rc = 1; return; }
    var to = sh.fs.isD(dest) ? dest + '/' + from.split('/').pop() : dest;
    if (!sh.canWrite(to, c)) { c.err("mv: cannot move '" + s + "' to '" + r[r.length - 1] + "': Permission denied\n"); rc = 1; return; }
    var pre = from + '/', moves = [];
    for (var k in sh.fs.n) if (k === from || k.indexOf(pre) === 0) moves.push(k);
    moves.forEach(function (k) { var nn = sh.fs.n[k]; delete sh.fs.n[k]; sh.fs.n[to + k.slice(from.length)] = nn; });
  });
  return rc;
};
cmds.ln = function (a, c) {
  var sh = c.sh, P = parseFlags(a), r = P.rest;
  if (r.length < 2) throw new CmdErr('ln: missing file operand');
  var target = r[0], link = sh.abs(r[1]);
  if (sh.fs.isD(link)) link = link + '/' + target.split('/').pop();
  if (!sh.canWrite(link, c)) throw new CmdErr("ln: failed to create symbolic link '" + r[1] + "': Permission denied");
  if (sh.fs.get(link, true) && !P.f.f) throw new CmdErr("ln: failed to create symbolic link '" + r[1] + "': File exists");
  if (P.f.s) sh.fs.link(link, target, sh.isRoot(c) ? 'root' : sh.user);
  else sh.fs.put(link, sh.readFile(sh.abs(target), c, 'ln'));
  if (sh.onWrite) sh.onWrite(link);
  return 0;
};

function applyMode(spec, old) {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8);
  var m = old, parts = spec.split(',');
  for (var i = 0; i < parts.length; i++) {
    var mm = /^([ugoa]*)([+\-=])([rwxXst]*)$/.exec(parts[i]);
    if (!mm) return null;
    var who = mm[1] || 'a', bits = 0, spec2 = 0;
    if (mm[3].indexOf('s') >= 0) { if (who.indexOf('u') >= 0 || who.indexOf('a') >= 0) spec2 |= 2048; if (who.indexOf('g') >= 0 || who.indexOf('a') >= 0) spec2 |= 1024; }
    if (mm[3].indexOf('t') >= 0) spec2 |= 512;
    if (mm[3].indexOf('X') >= 0) bits |= 1;
    if (mm[3].indexOf('r') >= 0) bits |= 4; if (mm[3].indexOf('w') >= 0) bits |= 2; if (mm[3].indexOf('x') >= 0) bits |= 1;
    var mask = 0;
    if (who.indexOf('u') >= 0 || who.indexOf('a') >= 0) mask |= bits << 6;
    if (who.indexOf('g') >= 0 || who.indexOf('a') >= 0) mask |= bits << 3;
    if (who.indexOf('o') >= 0 || who.indexOf('a') >= 0) mask |= bits;
    mask |= spec2;
    var wm = (who.indexOf('a') >= 0 ? 511 : 0) | (who.indexOf('u') >= 0 ? 448 : 0) | (who.indexOf('g') >= 0 ? 56 : 0) | (who.indexOf('o') >= 0 ? 7 : 0);
    if (mm[2] === '+') m |= mask; else if (mm[2] === '-') m &= ~mask; else m = (m & ~wm) | mask;
  }
  return m;
}
cmds.chmod = function (a, c) {
  var sh = c.sh, P = parseFlags(a.filter(function (x) { return !/^[ugoa]*[+\-=][rwx]+/.test(x) && !/^-[0-7]/.test(x) ? true : true; })), r = P.rest;
  var spec = r[0]; r = r.slice(1);
  if (!spec) throw new CmdErr('chmod: missing operand');
  var rc = 0;
  function setm(p) {
    var full = sh.fs.real(p), n = sh.fs.n[full];
    var nm = applyMode(spec, n.mode);
    if (nm == null) throw new CmdErr("chmod: invalid mode: '" + spec + "'");
    n.mode = nm;
    if (P.f.R && n.t === 'd') sh.fs.list(full).forEach(function (k) { setm(full + '/' + k); });
  }
  r.forEach(function (p) {
    var full = sh.abs(p), n = sh.fs.get(full);
    if (!n) { c.err("chmod: cannot access '" + p + "': No such file or directory\n"); rc = 1; return; }
    if (!sh.isRoot(c) && n.owner !== sh.user) { c.err("chmod: changing permissions of '" + p + "': Operation not permitted\n"); rc = 1; return; }
    setm(full);
  });
  return rc;
};
cmds.chown = function (a, c) {
  var sh = c.sh, P = parseFlags(a), r = P.rest, spec = r[0];
  if (!sh.isRoot(c)) { c.err("chown: changing ownership of '" + (r[1] || '') + "': Operation not permitted\n"); return 1; }
  var sp0 = (spec || '').split(/[:.]/), owner = sp0[0] || null, grp = sp0.length > 1 && sp0[1] ? sp0[1] : null, rc = 0;
  if (VPS.grpCheck) { var ge = VPS.grpCheck(sh, owner, grp); if (ge) { c.err('chown: ' + ge + '\n'); return 1; } }
  function seto(p) { var full = sh.fs.real(p), n = sh.fs.n[full]; if (owner) n.owner = owner; if (grp) n.group = grp; if (P.f.R && n.t === 'd') sh.fs.list(full).forEach(function (k) { seto(full + '/' + k); }); }
  r.slice(1).forEach(function (p) { var full = sh.abs(p); if (!sh.fs.ex(full)) { c.err("chown: cannot access '" + p + "': No such file or directory\n"); rc = 1; return; } seto(full); });
  return rc;
};

cmds.tee = function (a, c) {
  var sh = c.sh, P = parseFlags(a), rc = 0;
  c.out(c.stdin);
  P.rest.forEach(function (p) {
    if (p === '/dev/null') return;
    try { sh.writeFile(sh.abs(p), c.stdin, c, 'tee', !!P.f.a); } catch (e) { if (e instanceof CmdErr) { c.err(e.msg.replace(/^tee: /, 'tee: ') + '\n'); rc = 1; } else throw e; }
  });
  return rc;
};

function toRegex(pat, flags, fixed, ere) {
  if (fixed) pat = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  else if (!ere) pat = bre2js(pat);
  try { return new RegExp(pat, flags); } catch (e) { return null; }
}
function bre2js(p) {
  var out = '', i = 0;
  while (i < p.length) {
    var ch = p.charAt(i);
    if (ch === '\\' && i + 1 < p.length) {
      var nx = p.charAt(i + 1);
      if ('(){}+?|'.indexOf(nx) >= 0) out += nx; else out += '\\' + nx;
      i += 2; continue;
    }
    if ('(){}+?|'.indexOf(ch) >= 0) out += '\\' + ch;
    else if (ch === '$' && i < p.length - 1) out += '\\$';
    else if (ch === '^' && i > 0) out += '\\^';
    else out += ch;
    i++;
  }
  return out;
}
VPS.bre2js = bre2js;

cmds.grep = function (a, c) {
  var sh = c.sh, P = parseFlags(a, 'e'), f = P.f, rest = P.rest;
  var pat = f.e != null ? f.e : rest.shift();
  if (pat == null) throw new CmdErr('Usage: grep [OPTION]... PATTERNS [FILE]...', 2);
  var re = toRegex(pat, f.i ? 'gi' : 'g', f.F, f.E);
  if (!re) throw new CmdErr('grep: Invalid regular expression', 2);
  var inputs = [], rc = 1;
  function addFile(p, shown) {
    var full = sh.abs(p), n = sh.fs.get(full);
    if (!n) { c.err('grep: ' + p + ': No such file or directory\n'); rc = 2; return; }
    if (n.t === 'd') {
      if (f.r || f.R) sh.fs.list(sh.fs.real(full)).forEach(function (k) { addFile((p === '.' ? '' : p + '/') + k, (p === '.' ? '' : shown + '/') + k); });
      else c.err('grep: ' + p + ': Is a directory\n');
      return;
    }
    try { inputs.push({ name: shown, text: sh.readFile(full, c, 'grep') }); } catch (e) { c.err(e.msg + '\n'); rc = 2; }
  }
  if (rest.length) rest.forEach(function (p) { addFile(p, p); });
  else if (f.r || f.R) addFile('.', '.');
  else inputs.push({ name: '(standard input)', text: c.stdin });
  var multi = (rest.length > 1 || f.r || f.R) && !f.h, found = 0;
  inputs.forEach(function (inp) {
    var cnt = 0, ln = 0;
    lines(inp.text).forEach(function (line) {
      ln++;
      re.lastIndex = 0;
      var hit = re.test(line); if (f.v) hit = !hit;
      if (!hit) return;
      cnt++; found++;
      if (f.c || f.l || f.q) return;
      var pre = (multi ? inp.name + ':' : '') + (f.n ? ln + ':' : '');
      if (f.o && !f.v) { re.lastIndex = 0; var m; var r2 = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g'); while ((m = r2.exec(line))) { if (m[0] === '') { r2.lastIndex++; continue; } c.out(pre + m[0] + '\n'); } }
      else c.out(pre + line + '\n');
    });
    if (f.c) c.out((multi ? inp.name + ':' : '') + cnt + '\n');
    if (f.l && cnt) c.out(inp.name + '\n');
  });
  return found ? 0 : (rc === 2 ? 2 : 1);
};
cmds.egrep = function (a, c) { return cmds.grep(['-E'].concat(a), c); };

cmds.sed = function (a, c) {
  var sh = c.sh, inplace = false, bak = '', ere = false, quiet = false, exprs = [], files = [], i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-i') inplace = true;
    else if (/^-i./.test(x)) { inplace = true; bak = x.slice(2); }
    else if (x === '-E' || x === '-r') ere = true;
    else if (x === '-n') quiet = true;
    else if (x === '-e') exprs.push(a[++i]);
    else if (x === '-ie' || x === '-ni') { inplace = true; }
    else if (x.charAt(0) === '-' && x.length > 1) continue;
    else if (!exprs.length) exprs.push(x);
    else files.push(x);
  }
  if (!exprs.length) throw new CmdErr('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...');
  var ops = [];
  exprs.forEach(function (e) {
    e = e.trim();
    var m = /^s(.)/.exec(e);
    if (m) {
      var d = m[1], body = e.slice(2), parts = [], cur = '';
      for (var k = 0; k < body.length; k++) {
        var ch = body.charAt(k);
        if (ch === '\\' && body.charAt(k + 1) === d) { cur += d === '|' || d === '/' ? (d === '|' ? '|' : '/') : d; k++; continue; }
        if (ch === '\\') { cur += ch + body.charAt(k + 1); k++; continue; }
        if (ch === d) { parts.push(cur); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur);
      if (parts.length < 3) throw new CmdErr("sed: -e expression #1, char " + e.length + ": unterminated `s' command");
      var fl = parts[2] || '';
      var re = toRegex(parts[0], (fl.indexOf('g') >= 0 ? 'g' : '') + (fl.indexOf('i') >= 0 || fl.indexOf('I') >= 0 ? 'i' : ''), false, ere);
      if (!re) throw new CmdErr('sed: -e expression #1: invalid regex');
      var rep = parts[1].replace(/\$/g, '$$$$').replace(/&/g, '$&').replace(/\\([1-9])/g, '$$$1').replace(/\\&/g, '&').replace(/\\n/g, '\n');
      ops.push({ k: 's', re: re, rep: rep });
      return;
    }
    m = /^\/(.*?)\/([dp]?)$/.exec(e);
    if (m) { ops.push({ k: m[2] === 'p' ? 'p' : 'd', re: toRegex(m[1], '', false, ere) }); return; }
    m = /^(\d+)d$/.exec(e);
    if (m) { ops.push({ k: 'nd', n: +m[1] }); return; }
    throw new CmdErr("sed: -e expression #1, char 1: unknown command: `" + e.charAt(0) + "'");
  });
  function proc(text) {
    var out = [], ln = 0, had = /\n$/.test(text) || text === '';
    lines(text).forEach(function (line) {
      ln++;
      var del = false, pr = false;
      ops.forEach(function (op) {
        if (del) return;
        if (op.k === 's') line = line.replace(op.re, op.rep);
        else if (op.k === 'd') { if (op.re.test(line)) del = true; }
        else if (op.k === 'nd') { if (ln === op.n) del = true; }
        else if (op.k === 'p') { if (op.re.test(line)) pr = true; }
      });
      if (del) return;
      if (quiet) { if (pr) out.push(line); } else { out.push(line); if (pr) out.push(line); }
    });
    return out.join('\n') + (out.length ? '\n' : '');
  }
  if (!files.length) { c.out(proc(c.stdin)); return 0; }
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

cmds.awk = function (a, c) {
  var sh = c.sh, fs = null, prog = null, files = [], i;
  for (i = 0; i < a.length; i++) {
    if (a[i] === '-F') fs = a[++i];
    else if (/^-F./.test(a[i])) fs = a[i].slice(2);
    else if (prog == null) prog = a[i];
    else files.push(a[i]);
  }
  var m = /^\s*(?:\/(.+?)\/\s*)?\{\s*print\s*(.*?)\s*\}\s*$/.exec(prog || '');
  if (!m) throw new CmdErr('awk: simulator chỉ hỗ trợ dạng {print $1, $NF} hoặc /mẫu/ {print}');
  var pre = m[1] ? new RegExp(m[1]) : null, items = m[2] ? m[2].split(/\s*,\s*/) : ['$0'];
  var text = files.length ? files.map(function (p) { return sh.readFile(sh.abs(p), c, 'awk'); }).join('') : c.stdin;
  lines(text).forEach(function (line) {
    if (pre && !pre.test(line)) return;
    var fld = fs ? line.split(fs.length === 1 ? fs : new RegExp(fs)) : line.split(/\s+/).filter(Boolean);
    var out = items.map(function (it) {
      var mm;
      if ((mm = /^"(.*)"$/.exec(it))) return mm[1];
      if (it === '$0') return line;
      if (it === '$NF') return fld[fld.length - 1] || '';
      if ((mm = /^\$\(NF-(\d+)\)$/.exec(it))) return fld[fld.length - 1 - (+mm[1])] || '';
      if ((mm = /^\$(\d+)$/.exec(it))) return fld[+mm[1] - 1] || '';
      return it;
    });
    c.out(out.join(' ') + '\n');
  });
  return 0;
};

function humanToNum(s) {
  var m = /^([\d.]+)([KMGT]?)/i.exec(s.trim()); if (!m) return 0;
  var mult = { '': 1, K: 1024, M: 1048576, G: 1073741824, T: 1099511627776 }[m[2].toUpperCase()];
  return parseFloat(m[1]) * mult;
}
cmds.sort = function (a, c) {
  var sh = c.sh, P = parseFlags(a), f = P.f;
  var text = P.rest.length ? P.rest.map(function (p) { return sh.readFile(sh.abs(p), c, 'sort'); }).join('') : c.stdin;
  var l = lines(text);
  l.sort(function (x, y) {
    var r;
    if (f.h) r = humanToNum(x) - humanToNum(y);
    else if (f.n) r = (parseFloat(x.trim()) || 0) - (parseFloat(y.trim()) || 0);
    else r = x < y ? -1 : x > y ? 1 : 0;
    return f.r ? -r : r;
  });
  if (f.u) l = l.filter(function (x, i) { return i === 0 || x !== l[i - 1]; });
  c.out(l.join('\n') + (l.length ? '\n' : '')); return 0;
};
cmds.uniq = function (a, c) {
  var P = parseFlags(a), l = lines(c.stdin), out = [];
  l.forEach(function (x) { if (out.length && out[out.length - 1].v === x) out[out.length - 1].n++; else out.push({ v: x, n: 1 }); });
  c.out(out.map(function (o) { return P.f.c ? pad(o.n, 7, true) + ' ' + o.v : o.v; }).join('\n') + (out.length ? '\n' : '')); return 0;
};
cmds.cut = function (a, c) {
  var P = parseFlags(a, 'df'), d = P.f.d || '\t', fl = String(P.f.f || '1').split(',').map(Number);
  var text = P.rest.length ? P.rest.map(function (p) { return c.sh.readFile(c.sh.abs(p), c, 'cut'); }).join('') : c.stdin;
  lines(text).forEach(function (l) { var p = l.split(d); c.out(fl.map(function (i) { return p[i - 1] || ''; }).join(d) + '\n'); });
  return 0;
};
cmds.tr = function (a, c) {
  if (a[0] === '-d') { var re = new RegExp('[' + a[1].replace(/[\]\\^]/g, '\\$&') + ']', 'g'); c.out(c.stdin.replace(re, '')); return 0; }
  var from = a[0], to = a[1] || '';
  if (from === 'a-z' && to === 'A-Z') c.out(c.stdin.toUpperCase()); else if (from === 'A-Z' && to === 'a-z') c.out(c.stdin.toLowerCase()); else c.out(c.stdin);
  return 0;
};
cmds.openssl = function (a, c) {
  if (a[0] === 'rand' && (a[1] === '-hex' || a[1] === '-base64')) {
    var n = parseInt(a[2], 10) || 16, s = '', ch = '0123456789abcdef';
    for (var i = 0; i < n * 2; i++) s += ch.charAt(Math.floor(Math.random() * 16));
    c.out(s + '\n'); return 0;
  }
  throw new CmdErr('openssl: simulator chỉ hỗ trợ: openssl rand -hex N');
};
cmds.truncate = function (a, c) {
  var sh = c.sh, P = parseFlags(a, 's');
  P.rest.forEach(function (p) {
    var full = sh.abs(p);
    if (!sh.canWrite(full, c)) throw new CmdErr("truncate: cannot open '" + p + "' for writing: Permission denied");
    var n = sh.fs.get(full);
    if (!n) { sh.fs.put(full, '', { owner: sh.isRoot(c) ? 'root' : sh.user }); return; }
    n.size = 0; n.c = '';
  });
  return 0;
};
cmds.nano = function (a, c) {
  c.out('Mô phỏng: không mở được nano trong khung này. Ghi file bằng: sudo tee FILE > /dev/null << \'EOF\' ... EOF (xem lý thuyết).\n');
  return 1;
};
cmds.vim = cmds.vi = cmds.nano;
cmds.find = function (a, c) {
  var sh = c.sh, P = parseFlags(a, 'name'), start = a[0] && a[0].charAt(0) !== '-' ? a[0] : '.';
  var ni = a.indexOf('-name'), pat = ni >= 0 ? a[ni + 1] : null;
  var re = pat ? new RegExp('^' + pat.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;
  var base = sh.abs(start);
  Object.keys(sh.fs.n).sort().forEach(function (k) {
    if (k !== base && k.indexOf(base === '/' ? '/' : base + '/') !== 0) return;
    if (re && !re.test(k.split('/').pop())) return;
    c.out((start === '.' ? '.' + k.slice(base.length) : start.replace(/\/$/, '') + k.slice(base.length)) + '\n');
  });
  return 0;
};

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
