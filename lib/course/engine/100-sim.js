(function (G) {
'use strict';
/* Chấm bài lab theo KẾT QUẢ: nếu một đến ba lệnh gần nhất của người học cho cùng đầu ra và cùng trạng thái hệ thống
   như lệnh gợi ý (chạy trên bản sao phiên làm việc), bài được tính là đạt dù gõ khác. Dùng thêm bên cạnh check() gốc. */
var V = G.VPS, C = G.COURSE;
var SKIPW = { now: 1, boot: 1, nextPid: 1, jr: 1, cronRuns: 1, t: 1 };
function normP(p) { var o = []; p.split('/').forEach(function (x) { if (!x || x === '.') return; if (x === '..') o.pop(); else o.push(x); }); return '/' + o.join('/'); }
function sig(sh) {
  var o = [], n = sh.fs && sh.fs.n || {}, keys = Object.keys(n).sort();
  keys.forEach(function (k) {
    if (/^\/(proc|sys|dev)(\/|$)/.test(k)) return;
    var x = n[k];
    o.push(k + '|' + x.t + '|' + x.mode + '|' + x.owner + '|' + (x.group || '') + '|' + (x.t === 'l' ? normP((x.target || '').charAt(0) === '/' ? x.target : k.replace(/\/[^\/]*$/, '/') + x.target) : (x.target || '')) + '|' + (x.c == null ? '' : (typeof x.c === 'string' ? x.c : JSON.stringify(x.c))) + '|' + (x.size || ''));
  });
  var w = '';
  try { w = JSON.stringify(sh.W, function (k, v) { if (typeof v === 'function') return undefined; if (SKIPW[k]) return undefined; return v; }); } catch (e) { w = ''; }
  var env = ''; try { env = JSON.stringify([sh.vars, sh.env, sh.user]); } catch (e) {}
  return o.join('\n') + '\n#' + w + '\n#' + env;
}
function norm(s) { return String(s || '').split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n').replace(/\n+$/, ''); }
function replay(l, log, upto) {
  var sh = new V.Shell({ host: l.lab.host, user: l.lab.user, setup: l.lab.setup });
  for (var i = 0; i < upto; i++) { try { sh.run(log[i].t); } catch (e) {} }
  return sh;
}
function toks(s) { return String(s || '').split(/\s+/).filter(Boolean); }
/* đầu ra của người học là tập con của đầu ra gợi ý và chứa mọi số trong đó (vd `wc -l < f` so với `wc -l f`) */
function tokSub(hintOut, userOut) {
  var h = toks(hintOut), u = toks(userOut);
  if (!u.length || h.length > 12 || hintOut.split('\n').length > 3) return false;
  var nums = h.filter(function (x) { return /^\d+$/.test(x); });
  if (!nums.length) return false;
  var pool = h.slice(), i;
  for (i = 0; i < u.length; i++) { var k = pool.indexOf(u[i]); if (k < 0) return false; pool.splice(k, 1); }
  return nums.every(function (x) { return u.indexOf(x) >= 0; });
}
function verbs(t) {
  var out = {};
  String(t || '').split(/\|\||&&|[|;\n]/).forEach(function (seg) {
    var w = seg.trim().split(/\s+/), i = 0;
    while (i < w.length && (/^[A-Za-z_]\w*=/.test(w[i]) || /^(sudo|time|!|\(|\{|nohup|command)$/.test(w[i]) || /^-/.test(w[i]) && i > 0 && /^sudo$/.test(w[i - 1]))) i++;
    if (w[i]) out[w[i].replace(/^.*\//, '').replace(/^[({]+/, '')] = 1;
  });
  return Object.keys(out);
}
function shareVerb(a, b) { var A = verbs(a), B = verbs(b); return A.some(function (x) { return B.indexOf(x) >= 0; }); }
/* mọi đường dẫn có thật mà gợi ý nhắc tới phải xuất hiện (từng thành phần) trong lệnh của người học */
function pathsOk(hint, userText, fsh) {
  var toksH = hint.replace(/<<[\s\S]*$/, '').split(/[\s|;&<>]+/).filter(function (x) { return x && x.charAt(0) !== '-' && !/^\d+$/.test(x); }), i;
  var u = userText.replace(/~\//g, '/');
  for (i = 0; i < toksH.length; i++) {
    var t = toksH[i].replace(/^['"]|['"]$/g, ''), n = null;
    if (!/[\/.]/.test(t) || /[*?\[\]=$]/.test(t)) continue;
    try { n = fsh.fs.get(fsh.abs(t)); } catch (e) {}
    if (!n) continue;
    var pcs = t.split('/').filter(function (x) { return x.length > 1 && x !== '..'; }), k;
    for (k = 0; k < pcs.length; k++) if (u.indexOf(pcs[k]) < 0) return false;
  }
  return true;
}
function lastGroup(hint) { if (/<</.test(hint)) return null; var ls = hint.split('\n').filter(function (x) { return x.trim(); }); return ls.length > 1 ? ls[ls.length - 1] : null; }

/* it: một mục lab. Trả về true nếu kết quả tương đương lệnh gợi ý. */
function equiv(l, sh, it, budget) {
  var log = sh.cmdLog || [], n = log.length;
  if (!n || !it.hint) return false;
  var cur = null, maxW = Math.min(3, n), w;
  for (w = 1; w <= maxW; w++) {
    if (budget && budget.t0 && (Date.now() - budget.t0) > budget.ms) return false;
    var last = log[n - 1], utext = log.slice(n - w).map(function (x) { return x.t; }).join('\n');
    var shd = replay(l, log, n - w), before = sig(shd), o, cwdBefore = shd.cwd;
    try { o = shd.run(it.hint); } catch (e) { return false; }
    var after = sig(shd), out = norm(o.out), cwdChanged = shd.cwd !== cwdBefore;
    if (out === '' && before === after && !cwdChanged) { continue; }              /* gợi ý không có tác dụng nhìn thấy: không dùng cách này */
    if (!!o.code !== !!last.code) continue;
    if (!pathsOk(it.hint, utext, shd)) continue;
    if (cur === null) cur = sig(sh);
    if (after !== cur) continue;
    if (cwdChanged && shd.cwd !== sh.cwd) continue;
    if (out === '' && !cwdChanged && before === after) continue;
    var sv = shareVerb(it.hint, utext);
    if (out === '' && !sv) continue;
    if (out !== '' && !sv && out.split('\n').length < 3 && !(out === norm(last.out) && out.length >= 4)) continue;
    if (out !== '') {
      var lo = norm(last.out), lg = lastGroup(it.hint), ok = (out === lo);
      if (!ok && lg) { var s2 = replay(l, log, n - w); try { s2.run(it.hint.slice(0, it.hint.lastIndexOf('\n'))); var o2 = s2.run(lg); ok = norm(o2.out) === lo; } catch (e) {} }
      if (!ok) ok = tokSub(out, lo);
      if (!ok) continue;
    }
    return true;
  }
  return false;
}
C.equiv = equiv; C.gradeSig = sig;
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
