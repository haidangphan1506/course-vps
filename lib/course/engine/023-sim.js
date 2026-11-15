(function (G) {
'use strict';
/* find đầy đủ hơn cho chương shell: -name -iname -type -maxdepth -mindepth -empty -size -user -mtime ! -print -delete -exec ... {} \; / +.
   Chỉ dùng khi W.lin2 bật và không đụng thư mục ảo đầy inode (để eng-lin2 xử lý). */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, prevFind = cmds.find;
function globRe(g, ci) { return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', ci ? 'i' : ''); }
function sizeOf(n) { return n.t === 'f' ? (n.size != null ? n.size : String(n.c || '').length) : 4096; }
cmds.find = function (a, c) {
  var sh = c.sh;
  if (!(sh.W && sh.W.lin2)) return prevFind(a, c);
  var starts = [], i = 0;
  while (i < a.length && (a[i].charAt(0) !== '-' || a[i] === '-') && a[i] !== '!' && a[i] !== '(') starts.push(a[i++]);
  if (!starts.length) starts = ['.'];
  for (var q = 0; q < starts.length; q++) { var vn = sh.fs.get(sh.abs(starts[q]), true); if (vn && vn.virt) return prevFind(a, c); }
  var o = { tests: [], del: false, exec: null, print: false, maxd: 1e9, mind: 0 };
  var neg = false;
  for (; i < a.length; i++) {
    var t = a[i], v;
    if (t === '!') { neg = true; continue; }
    function add(fn) { var nf = neg ? function (n, p) { return !fn(n, p); } : fn; neg = false; o.tests.push(nf); }
    if (t === '-name') { var re = globRe(a[++i]); add(function (n, p) { return re.test(p.replace(/^.*\//, '')); }); }
    else if (t === '-iname') { var ri = globRe(a[++i], true); add(function (n, p) { return ri.test(p.replace(/^.*\//, '')); }); }
    else if (t === '-type') { var ty = a[++i]; add(function (n) { return ty === 'f' ? n.t === 'f' : ty === 'd' ? n.t === 'd' : true; }); }
    else if (t === '-maxdepth') o.maxd = parseInt(a[++i], 10);
    else if (t === '-mindepth') o.mind = parseInt(a[++i], 10);
    else if (t === '-empty') add(function (n, p) { return n.t === 'f' ? sizeOf(n) === 0 : sh.fs.list(p).length === 0; });
    else if (t === '-user') { var u = a[++i]; add(function (n) { return n.owner === u; }); }
    else if (t === '-size') { var m = /^([+-]?)(\d+)([cKMG]?)$/.exec(a[++i]); if (!m) throw new CmdErr('find: invalid argument to -size', 1); var mul = { '': 512, c: 1, K: 1024, M: 1048576, G: 1073741824 }[m[3]], lim = parseInt(m[2], 10); add(function (n) { if (n.t !== 'f') return false; var sz = sizeOf(n), u2 = Math.ceil(sz / mul); return m[1] === '+' ? u2 > lim : m[1] === '-' ? u2 < lim : u2 === lim; }); }
    else if (t === '-mtime') { var mm = /^([+-]?)(\d+)$/.exec(a[++i]); add(function (n) { var d = n.mdays || 0, l = parseInt(mm[2], 10); return mm[1] === '+' ? d > l : mm[1] === '-' ? d < l : d === l; }); }
    else if (t === '-delete') o.del = true;
    else if (t === '-print') o.print = true;
    else if (t === '-exec') {
      var tpl = []; i++;
      while (i < a.length && a[i] !== ';' && a[i] !== '+') tpl.push(a[i++]);
      if (i >= a.length) throw new CmdErr("find: missing argument to `-exec'", 1);
      o.exec = { tpl: tpl, batch: a[i] === '+' };
    }
    else if (t === '-o' || t === '-a' || t === '(' || t === ')') return prevFind(a, c);
    else throw new CmdErr("find: unknown predicate `" + t + "'", 1);
  }
  var out = [], code = 0;
  starts.forEach(function (st) {
    var base = sh.abs(st), pre = base === '/' ? '/' : base + '/';
    if (!sh.fs.get(base)) { c.err("find: '" + st + "': No such file or directory\n"); code = 1; return; }
    Object.keys(sh.fs.n).sort().forEach(function (p) {
      if (p !== base && p.indexOf(pre) !== 0) return;
      if (p.indexOf('/__r/') === 0) return;
      var n = sh.fs.n[p]; if (!n) return;
      var depth = p === base ? 0 : p.slice(pre.length).split('/').length;
      if (depth > o.maxd || depth < o.mind) return;
      for (var k = 0; k < o.tests.length; k++) if (!o.tests[k](n, p)) return;
      var shown = st.charAt(0) === '/' ? p : (st === '.' ? (p === base ? '.' : '.' + p.slice(base.length)) : st.replace(/\/$/, '') + p.slice(base.length));
      out.push({ shown: shown, p: p, n: n });
    });
  });
  if (o.del) {
    out.reverse().forEach(function (e) {
      if (!sh.isRoot(c) && e.n.owner !== sh.user) { c.err("find: cannot delete '" + e.shown + "': Permission denied\n"); code = 1; return; }
      if (e.n.t === 'f' || sh.fs.list(e.p).length === 0) sh.fs.rm(e.p);
    });
    return code;
  }
  if (o.exec) {
    var tpl2 = o.exec.tpl;
    if (o.exec.batch) { var argv = []; tpl2.forEach(function (t2) { if (t2 === '{}') out.forEach(function (e) { argv.push(e.shown); }); else argv.push(t2); }); if (out.length) { var r = sh.call(argv, c, {}); if (r) code = r; } }
    else out.forEach(function (e) { var r = sh.call(tpl2.map(function (t2) { return t2.replace(/\{\}/g, e.shown); }), c, {}); if (r) code = r; });
    return code;
  }
  out.forEach(function (e) { c.out(e.shown + '\n'); });
  return code;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
