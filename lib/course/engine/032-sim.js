(function (G) {
'use strict';
/* Công cụ dùng chung cho các chương 1B, 1C, 1D và phần bổ sung chương 1. */
var V = G.VPS, C = G.COURSE;
C.QZ = function (seed, items) {
  return items.map(function (it, i) {
    var pos = (i * 3 + seed) % 4, wrong = it[2].slice(), opts = wrong.slice(0, pos).concat([it[1]], wrong.slice(pos));
    return { q: it[0], opts: opts, ans: pos, why: it[3] };
  });
};
C.A = function (re) { return function (s) { return s.hist.some(function (h) { return re.test(h.cmd); }); }; };
C.OK = function (re) { return function (s) { return s.hist.some(function (h) { return h.code === 0 && re.test(h.cmd); }); }; };
C.FAIL = function (re) { return function (s) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }; };
C.ftxt = function (s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? String(n.c || '') : ''; };
C.unit = function (s, n) { var l = s.W.lin; return l && l.units ? l.units[n] : null; };
C.uactive = function (s, n) { var u = C.unit(s, n); return !!u && u.active === 'active'; };
C.pidOf = function (s, name, user) { var l = s.W.lin; return l ? l.procs.filter(function (p) { return p.name === name && (!user || p.user === user); }) : []; };
C.HCS = function (path, ls) { return 'sudo tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; };
C.HCU = function (path, ls) { return 'cat > ' + path + " <<'EOF'\n" + ls.join('\n') + '\nEOF'; };
C.linBase = function (s, o) { V.lin2.base(s, o); };
C.insertAfter = function (afterId, lesson) {
  var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === afterId) idx = i; });
  C.lessons.splice(idx + 1, 0, lesson);
};
C.insertFirst = function (lesson) { C.lessons.unshift(lesson); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
