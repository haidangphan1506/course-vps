(function (G) {
'use strict';
/* Chương sao lưu: sha256sum (-c), age/age-keygen (mô phỏng mã hoá), pg_restore qua docker exec. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, L2 = V.lin2, B = V.builtins;

function fnv(str, seed) { var h = seed >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function hex8(str) { var o = ''; for (var k = 0; k < 8; k++) o += ('00000000' + fnv(str, 2166136261 + k * 7919).toString(16)).slice(-8); return o; }
function sha(text) { return hex8(String(text)); }
var CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech(seed, n) { var o = '', h = seed; for (var i = 0; i < n; i++) { h = fnv(seed + i, 2166136261 + i); o += CS.charAt(h % 32); } return o; }
function pubOf(seed) { return 'age1' + bech(seed + 'pub', 58); }
function keyText(seed) { var p = pubOf(seed); return '# created: 2026-10-27T10:00:00+07:00\n# public key: ' + p + '\nAGE-SECRET-KEY-1' + bech(seed + 'sec', 58).toUpperCase() + '\n'; }
function toHex(s) { var u = unescape(encodeURIComponent(String(s))), o = ''; for (var i = 0; i < u.length; i++) o += ('0' + u.charCodeAt(i).toString(16)).slice(-2); return o; }
function fromHex(h) { var b = ''; for (var i = 0; i < h.length; i += 2) b += String.fromCharCode(parseInt(h.substr(i, 2), 16)); return decodeURIComponent(escape(b)); }
function encText(pub, text) { return 'age-encryption.org/v1\n-> X25519 ' + pub + '\n' + toHex(text) + '\n'; }
function decText(keyTxt, enc) {
  var m = /-> X25519 (age1\w+)/.exec(enc); if (!m) return { err: 'age: error: unknown format' };
  if (keyTxt == null) return { err: 'age: error: failed to open identity file: no such file or directory' };
  if (keyTxt.indexOf('# public key: ' + m[1]) < 0) return { err: 'age: error: no identity matched any of the recipients' };
  var body = enc.split('\n').slice(2).join(''); return { text: fromHex(body) };
}
V.age = { keyText: keyText, pubOf: pubOf, encText: encText, decText: decText, sha: sha };

function on(sh) { return !!(sh && sh.W && sh.W.lin2); }

/* ---- sha256sum ---- */
cmds.sha256sum = function (a, c) {
  var sh = c.sh, check = a.indexOf('-c') >= 0 || a.indexOf('--check') >= 0;
  var files = a.filter(function (x) { return x.charAt(0) !== '-'; }), rc = 0;
  if (check) {
    var list = files.length ? files : [];
    list.forEach(function (lf) {
      var lt = sh.fs.get(sh.abs(lf)); if (!lt) { c.err('sha256sum: ' + lf + ': No such file or directory\n'); rc = 1; return; }
      String(lt.c || '').split('\n').filter(Boolean).forEach(function (ln) {
        var m = /^(\S+)\s+\*?(.+)$/.exec(ln); if (!m) return;
        var n = sh.fs.get(sh.abs(m[2]));
        if (!n || n.t !== 'f') { c.out(m[2] + ': FAILED open or read\n'); c.err('sha256sum: WARNING: 1 listed file could not be read\n'); rc = 1; return; }
        if (sha(n.c || '') === m[1]) c.out(m[2] + ': OK\n'); else { c.out(m[2] + ': FAILED\n'); c.err('sha256sum: WARNING: 1 computed checksum did NOT match\n'); rc = 1; }
      });
    });
    return rc;
  }
  if (!files.length) { c.out(sha(c.stdin || '') + '  -\n'); return 0; }
  files.forEach(function (f) {
    var n = sh.fs.get(sh.abs(f));
    if (!n || n.t !== 'f') { c.err('sha256sum: ' + f + ': No such file or directory\n'); rc = 1; return; }
    c.out(sha(n.c || '') + '  ' + f + '\n');
  });
  return rc;
};

/* ---- age (cài bằng apt install age) ---- */
L2.impl = L2.impl || {};
function fileOrStdin(sh, c, args) {
  var f = args[0];
  if (!f) return c.stdin || '';
  var n = sh.fs.get(sh.abs(f)); if (!n) throw new CmdErr('age: error: failed to open ' + f + ': No such file or directory', 1);
  return String(n.c || '');
}
function optVal(args, k) { var i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; }
function writeOut(sh, c, outPath, text) { if (outPath) sh.writeFile(sh.abs(outPath), text, c, 'age'); else c.out(text); }

L2.impl['age-keygen'] = function (a, c) {
  var sh = c.sh;
  if (a.indexOf('-y') >= 0) {
    var kf = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
    var kn = kf ? sh.fs.get(sh.abs(kf)) : null; if (!kn) throw new CmdErr('age-keygen: error: failed to open ' + kf + ': No such file or directory', 1);
    var pm = /# public key: (age1\w+)/.exec(kn.c || ''); if (!pm) throw new CmdErr('age-keygen: error: no identity found', 1);
    c.out(pm[1] + '\n'); return 0;
  }
  var out = optVal(a, '-o'); if (!out) throw new CmdErr('age-keygen: error: missing output file (use -o)', 1);
  var ap = sh.abs(out); var parent = sh.fs.parent(ap); if (!sh.fs.isD(parent)) throw new CmdErr('age-keygen: error: failed to open ' + out + ': No such file or directory', 1);
  if (sh.fs.get(ap)) throw new CmdErr('age-keygen: error: ' + out + ': file exists', 1);
  var seed = 'key:' + ap + ':' + (sh.user || '');
  sh.writeFile(ap, keyText(seed), c, 'age-keygen');
  c.err('Public key: ' + pubOf(seed) + '\n');
  return 0;
};
L2.impl.age = function (a, c) {
  var sh = c.sh;
  if (a.indexOf('-d') >= 0) {
    var ki = optVal(a, '-i'), oo = optVal(a, '-o');
    var pos = a.filter(function (x, k) { return x.charAt(0) !== '-' && a[k - 1] !== '-i' && a[k - 1] !== '-o'; });
    if (!ki) { c.err('age: error: no identity specified (use -i)\n'); return 1; }
    var keyN = sh.fs.get(sh.abs(ki));
    if (!keyN) { c.err('age: error: failed to open identity file ' + ki + ': No such file or directory\n'); return 1; }
    var enc = fileOrStdin(sh, c, pos);
    var r = decText(String(keyN.c || ''), enc);
    if (r.err) { c.err(r.err + '\n'); return 1; }
    writeOut(sh, c, oo, r.text); return 0;
  }
  var rcp = optVal(a, '-r'); if (!rcp || !/^age1/.test(rcp)) { c.err('age: error: no recipients specified or invalid recipient (use -r age1...)\n'); return 1; }
  var src = fileOrStdin(sh, c, a.filter(function (x, k) { return x.charAt(0) !== '-' && a[k - 1] !== '-r' && a[k - 1] !== '-o'; }));
  writeOut(sh, c, optVal(a, '-o'), encText(rcp, src)); return 0;
};

/* ---- pg_restore qua docker exec (đọc từ stdin) ---- */
/* được gọi từ eng-docker3: xem patch ở đó */
V.pgRestoreStdin = function (c, W, restore) {
  var inp = c.stdin || '';
  if (!inp) { c.err('pg_restore: error: did not find magic string in file header\n'); return 1; }
  if (/TUTOR_DB_DUMP/.test(inp)) return restore(c, W);
  c.err('pg_restore: error: input file does not appear to be a valid archive\n'); return 1;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
