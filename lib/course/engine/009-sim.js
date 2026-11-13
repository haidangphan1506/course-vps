(function (G) {
'use strict';
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, pad = V.util.pad, DK = V.dk;
var prev = cmds.docker;
var HUBS = /^(postgres|redis|nginx|node|mysql|mongo|alpine|busybox|ubuntu|debian|louislam\/uptime-kuma)$/;

function hex(s, n) { s = String(s); var h = 2166136261 >>> 0, k; for (k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } var out = ''; for (k = 0; k < n; k++) { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; out += '0123456789abcdef'.charAt((h >>> 16) % 16); } return out; }
function toMB(x) { if (x.sizeMB) return x.sizeMB; var m = /^([\d.]+)\s*(GB|MB|kB|B)$/.exec(x.size || ''); if (!m) return 100; var v = +m[1]; return m[2] === 'GB' ? v * 1000 : m[2] === 'MB' ? v : m[2] === 'kB' ? v / 1000 : v / 1e6; }
function fmt(mb) { if (mb <= 0) return '0B'; if (mb >= 1000) return (mb / 1000).toFixed(2) + 'GB'; if (mb >= 1) return Math.round(mb) + 'MB'; return (mb * 1000).toFixed(1) + 'kB'; }
function imgs(W) { return DK.imgs(W); }
function isDangling(x) { return x.repo === '<none>'; }
function ref(x) { return x.repo + ':' + x.tag; }
function sha(id) { return hex(id + 'sha', 64); }
function dig(x) { return 'sha256:' + hex(x.id + 'digest', 64); }
function ids(W) { var m = {}; imgs(W).forEach(function (x) { m[x.id] = (m[x.id] || 0) + 1; }); return m; }
function fixIds(W) { W.containers.forEach(function (ct) { if (!ct.imgId) { var p = DK.split(ct.image || ''), e = imgs(W).filter(function (x) { return x.repo === p[0] && x.tag === p[1]; })[0]; if (e) ct.imgId = e.id; } }); }
function usedIds(W) { var u = {}; W.containers.forEach(function (ct) { if (ct.imgId) u[ct.imgId] = ct; }); return u; }
var SEQ = 0;
function cloneEntry(x, repo, tag) { var n = {}; for (var k in x) n[k] = x[k]; n.repo = repo; n.tag = tag; delete n.digest; n.seq = ++SEQ; return n; }
function findExact(W, repo, tag) { return imgs(W).filter(function (x) { return x.repo === repo && x.tag === tag; })[0]; }
function parseRef(r) {
  var dg = null, m = /@(sha256:[0-9a-f]+)$/.exec(r); if (m) { dg = m[1]; r = r.slice(0, m.index); }
  var sp = DK.split(r), repo = sp[0], tag = sp[1], first = repo.split('/')[0];
  var host = (repo.indexOf('/') > 0 && (first.indexOf('.') >= 0 || first.indexOf(':') >= 0 || first === 'localhost')) ? first : 'docker.io';
  var path = host === 'docker.io' ? repo.replace(/^docker\.io\//, '') : repo.slice(host.length + 1);
  return { host: host, repo: repo, tag: tag, digest: dg, path: path, hasTag: r.lastIndexOf(':') > r.lastIndexOf('/') };
}
function D5(W) { var D = W.dk4; D.registry = D.registry || {}; D.saved = D.saved || {}; D.cacheMB = D.cacheMB || 0; D.extraMB = D.extraMB || 0; return D; }
function regKey(p) { return p.host + '/' + p.path + ':' + p.tag; }

/* ---------- đĩa ---------- */
V.dkDisk = function (sh) {
  var W = sh.W; if (!W.dk4) return 0; var D = D5(W), seen = {}, mb = 0;
  imgs(W).forEach(function (x) { if (!seen[x.id]) { seen[x.id] = 1; mb += toMB(x); } });
  mb += D.cacheMB + D.extraMB + W.containers.length * 20;
  return Math.round(mb * 1e6);
};

/* ---------- phản hồi của ứng dụng ---------- */
function apiCt(W, port, host) {
  return W.containers.filter(function (c) { return c.state === 'running' && /tutor-api|^tutor-/.test(c.image || '') && (c.ports || []).some(function (p) { return p.host === port && (!host || p.bind !== '127.0.0.1' || host !== W.ip); }); })[0];
}
function loopbackBound(ct) { var h = ct.env && ct.env.HOST; return h === '127.0.0.1' || h === 'localhost'; }
function appResp(W, ct) {
  if (W.dk6 && W.dk6.down) return { status: 502, body: '', down: true };
  if (loopbackBound(ct)) return { status: 502, body: '<html>502 Bad Gateway</html>', loop: true };
  var im = findExact(W, DK.split(ct.image)[0], DK.split(ct.image)[1]);
  if (im && im.bug === 'health') return { status: 500, body: '{"statusCode":500,"message":"Internal server error"}\n' };
  var ver = (ct.env && ct.env.APP_VERSION) || DK.split(ct.image)[1];
  return { status: 200, body: '{"status":"ok","service":"tutor-api","version":"' + ver + '","container":"' + ct.name + '"}\n' };
}
V.upInfo = function (sh, port) { var ct = apiCt(sh.W, port); return ct ? appResp(sh.W, ct) : null; };
V.dkDirect = function (sh, port, path, host) { var ct = apiCt(sh.W, port, host); if (!ct) return null; var r = appResp(sh.W, ct); if (r.down) return { err: 7, msg: 'Failed to connect to ' + host + ' port ' + port + " after 0 ms: Couldn't connect to server" }; if (r.loop) return { err: 52, msg: 'Empty reply from server' }; return { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-powered-by': 'Express' }, body: r.body }; };

/* ---------- đăng nhập registry ---------- */
function cfgPath(sh) { return sh.home + '/.docker/config.json'; }
function readCfg(sh) { var n = sh.fs.get(cfgPath(sh)); if (!n) return { auths: {} }; try { var j = JSON.parse(n.c); j.auths = j.auths || {}; return j; } catch (e) { return { auths: {} }; } }
function loginUser(sh, host) { var a = readCfg(sh).auths[host]; if (!a || !a.auth) return null; try { return atob(a.auth).split(':')[0]; } catch (e) { return null; } }
function writeCfg(sh, j) { sh.fs.mkdirp(sh.home + '/.docker', sh.user); sh.fs.put(cfgPath(sh), JSON.stringify(j, null, 2) + '\n', { owner: sh.user, mode: 384 }); }
function doLogin(c, rest) {
  var sh = c.sh, server = null, user = null, pw = null, stdinPw = false;
  for (var i = 0; i < rest.length; i++) { var x = rest[i]; if (x === '-u' || x === '--username') user = rest[++i]; else if (x === '-p' || x === '--password') pw = rest[++i]; else if (x === '--password-stdin') stdinPw = true; else if (x.charAt(0) !== '-') server = x; }
  server = server || 'docker.io';
  if (!user) throw new CmdErr('Error: Cannot perform an interactive login from a non TTY device');
  if (stdinPw) { pw = String(c.stdin || '').trim(); if (!pw) throw new CmdErr('Error: Password required'); }
  if (!pw) throw new CmdErr('Error: Cannot perform an interactive login from a non TTY device');
  if (!stdinPw) c.err('WARNING! Using --password via the CLI is insecure. Use --password-stdin.\n');
  if (server !== 'ghcr.io' && server !== 'docker.io') throw new CmdErr('Error response from daemon: Get "https://' + server + '/v2/": dial tcp: lookup ' + server + ' on 127.0.0.53:53: no such host');
  if (server === 'ghcr.io' && !/^(ghp_|github_pat_)/.test(pw)) throw new CmdErr('Error response from daemon: Get "https://ghcr.io/v2/": denied: denied');
  if (server === 'docker.io' && !/^dckr_pat_/.test(pw)) throw new CmdErr('Error response from daemon: Get "https://registry-1.docker.io/v2/": unauthorized: incorrect username or password');
  var j = readCfg(sh); j.auths[server] = { auth: btoa(user + ':' + pw) }; writeCfg(sh, j);
  c.err('WARNING! Your credentials are stored unencrypted in \'' + cfgPath(sh) + '\'.\nConfigure a credential helper to remove this warning. See\nhttps://docs.docker.com/go/credential-store/\n');
  sh.W.dockerLogin = server; c.out('Login Succeeded\n'); return 0;
}
function doLogout(c, rest) {
  var sh = c.sh, server = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0] || 'docker.io', j = readCfg(sh);
  if (!j.auths[server]) { c.out('Not logged in to ' + server + '\n'); return 0; }
  delete j.auths[server]; writeCfg(sh, j); c.out('Removing login credentials for ' + server + '\n'); return 0;
}

/* ---------- push / pull ---------- */
function layersOf(x) { return Math.max(4, (x.layers || []).length || 6); }
function doPush(c, rest) {
  var sh = c.sh, W = sh.W, D = D5(W), nm = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (!nm) throw new CmdErr('"docker push" requires exactly 1 argument.');
  var p = parseRef(nm), e = findExact(W, p.repo, p.tag);
  if (!e) throw new CmdErr('An image does not exist locally with the tag: ' + p.repo);
  var head = 'The push refers to repository [' + (p.host === 'docker.io' ? 'docker.io/' + p.path : p.repo) + ']\n';
  var user = loginUser(sh, p.host);
  if (p.host !== 'ghcr.io' && p.host !== 'docker.io') throw new CmdErr('Get "https://' + p.host + '/v2/": dial tcp: lookup ' + p.host + ' on 127.0.0.53:53: no such host');
  if (p.host === 'docker.io' && p.path.indexOf('/') < 0) { c.out(head); throw new CmdErr('denied: requested access to the resource is denied'); }
  if (!user) { c.out(head); throw new CmdErr(p.host === 'ghcr.io' ? 'unauthorized: unauthenticated' : 'denied: requested access to the resource is denied'); }
  if (p.path.split('/')[0] !== user) { c.out(head); throw new CmdErr(p.host === 'ghcr.io' ? 'denied: permission_denied: The token provided does not match expected scopes.' : 'denied: requested access to the resource is denied'); }
  var key = regKey(p), ex = D.registry[key], same = ex && ex.entry.id === e.id, n = layersOf(e), o = head;
  for (var i = 0; i < n; i++) o += hex(e.id + i, 12) + ': ' + (same ? 'Layer already exists' : 'Pushed') + '\n';
  e.digest = dig(e); D.registry[key] = { entry: cloneEntry(e, p.repo, p.tag), digest: e.digest };
  o += p.tag + ': digest: ' + e.digest + ' size: ' + (1200 + n * 62) + '\n'; c.out(o); return 0;
}
function pullFromRegistry(sh, c, p, silent) {
  var W = sh.W, D = D5(W), user = loginUser(sh, p.host), o = '';
  if (p.host !== 'ghcr.io' && p.host !== 'docker.io') throw new CmdErr('Error response from daemon: Get "https://' + p.host + '/v2/": dial tcp: lookup ' + p.host + ' on 127.0.0.53:53: no such host');
  var key = p.digest ? Object.keys(D.registry).filter(function (k) { return D.registry[k].digest === p.digest && k.indexOf(p.host + '/' + p.path + ':') === 0; })[0] : regKey(p);
  var rec = key && D.registry[key];
  if (p.host === 'ghcr.io' && !user) throw new CmdErr('Error response from daemon: Head "https://ghcr.io/v2/' + p.path + '/manifests/' + (p.digest || p.tag) + '": unauthorized');
  if (p.host === 'docker.io' && !rec) throw new CmdErr("Error response from daemon: pull access denied for " + p.repo + ", repository does not exist or may require 'docker login': denied: requested access to the resource is denied");
  if (!rec) throw new CmdErr('Error response from daemon: manifest unknown');
  var tagName = p.digest ? '<none>' : p.tag, local = findExact(W, p.repo, tagName);
  o += (p.digest ? p.digest : p.tag) + ': Pulling from ' + p.path + '\n';
  if (local && local.id === rec.entry.id) { o += 'Digest: ' + rec.digest + '\nStatus: Image is up to date for ' + p.repo + ':' + tagName + '\n'; if (!silent) c.out(o); return 0; }
  for (var i = 0; i < layersOf(rec.entry); i++) o += hex(rec.entry.id + i, 12) + ': Pull complete\n';
  if (local) { var still = imgs(W).some(function (x) { return x !== local && x.id === local.id; }); if (!still) { var d = cloneEntry(local, '<none>', '<none>'); imgs(W).push(d); } W.images = imgs(W).filter(function (x) { return x !== local; }); }
  var ne = cloneEntry(rec.entry, p.repo, tagName); ne.digest = rec.digest; ne.age = '3 weeks ago'; imgs(W).push(ne);
  o += 'Digest: ' + rec.digest + '\nStatus: Downloaded newer image for ' + p.repo + ':' + tagName + '\n' + p.repo + ':' + tagName + '\n';
  if (!silent) c.out(o); return 0;
}
function isHubOfficial(p) { return p.host === 'docker.io' && (p.path.indexOf('/') < 0 || HUBS.test(p.path)) && !/^tutor-/.test(p.path); }

/* ---------- images / tag / rmi / prune ---------- */
function listImages(c, rest) {
  var sh = c.sh, W = sh.W, fmtS = null, filters = [], flags = {}, arg = null;
  for (var i = 0; i < rest.length; i++) { var x = rest[i]; if (x === '--format') fmtS = rest[++i]; else if (x === '--filter' || x === '-f') filters.push(rest[++i]); else if (x === '-q' || x === '--quiet') flags.q = 1; else if (x === '--digests') flags.dg = 1; else if (x === '--no-trunc') flags.nt = 1; else if (x === '-a' || x === '--all') flags.a = 1; else if (x.charAt(0) !== '-') arg = x; }
  var list = imgs(W).slice().sort(function (a, b) { return (b.seq || 0) - (a.seq || 0); }).filter(function (x) { if (!arg) return true; var p = DK.split(arg); return x.repo === p[0] && (arg.indexOf(':') < 0 || x.tag === p[1]); });
  filters.forEach(function (f) { var m = /^(\w+)=(.*)$/.exec(f || ''); if (!m) return; if (m[1] === 'dangling') list = list.filter(function (x) { return isDangling(x) === (m[2] === 'true'); }); else if (m[1] === 'reference') list = list.filter(function (x) { return x.repo === m[2] || ref(x) === m[2] || new RegExp('^' + m[2].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(ref(x)); }); });
  var idOf = function (x) { return flags.nt ? 'sha256:' + sha(x.id) : x.id; };
  if (flags.q) { c.out(list.map(idOf).join('\n') + (list.length ? '\n' : '')); return 0; }
  if (fmtS) { c.out(list.map(function (x) { return fmtS.replace(/\{\{\s*\.(\w+)\s*\}\}/g, function (m, k) { return ({ Repository: x.repo, Tag: x.tag, ID: idOf(x), Size: x.size || fmt(toMB(x)), CreatedSince: x.age || '2 hours ago', Digest: x.digest || '<none>' })[k] || ''; }); }).join('\n') + (list.length ? '\n' : '')); return 0; }
  var wR = Math.max(22, list.reduce(function (m, x) { return Math.max(m, x.repo.length + 3); }, 0)), wT = Math.max(10, list.reduce(function (m, x) { return Math.max(m, x.tag.length + 3); }, 0));
  var o = pad('REPOSITORY', wR) + pad('TAG', wT) + (flags.dg ? pad('DIGEST', 73) : '') + pad('IMAGE ID', flags.nt ? 73 : 15) + pad('CREATED', 15) + 'SIZE\n';
  list.forEach(function (x) { o += pad(x.repo, wR) + pad(x.tag, wT) + (flags.dg ? pad(x.digest || '<none>', 73) : '') + pad(idOf(x), flags.nt ? 73 : 15) + pad(x.age || '2 hours ago', 15) + (x.size || fmt(toMB(x))) + '\n'; });
  c.out(o); return 0;
}
function doTag(c, rest) {
  var W = c.sh.W; if (rest.length !== 2) throw new CmdErr('"docker tag" requires exactly 2 arguments.');
  var sp = DK.split(rest[0]), src = findExact(W, sp[0], sp[1]);
  if (!src) throw new CmdErr('Error response from daemon: No such image: ' + rest[0]);
  var dp = DK.split(rest[1]), ex = findExact(W, dp[0], dp[1]);
  if (ex && ex.id !== src.id) { var still = imgs(W).some(function (x) { return x !== ex && x.id === ex.id; }); if (!still) imgs(W).push(cloneEntry(ex, '<none>', '<none>')); W.images = imgs(W).filter(function (x) { return x !== ex; }); }
  if (ex && ex.id === src.id) return 0;
  imgs(W).push(cloneEntry(src, dp[0], dp[1])); return 0;
}
function resolveRef(W, r) {
  var m = /^(?:sha256:)?([0-9a-f]{4,64})$/.exec(r);
  if (m) { var byId = imgs(W).filter(function (x) { return x.id.indexOf(m[1]) === 0 || sha(x.id).indexOf(m[1]) === 0; }); if (byId.length) return { entries: byId, byId: true }; }
  var p = DK.split(r), e = findExact(W, p[0], p[1]); return e ? { entries: [e], byId: false } : null;
}
function doRmi(c, rest) {
  var W = c.sh.W, force = rest.indexOf('-f') >= 0 || rest.indexOf('--force') >= 0, names = rest.filter(function (x) { return x.charAt(0) !== '-'; }), errs = [], out = '';
  if (!names.length) throw new CmdErr('"docker rmi" requires at least 1 argument.');
  names.forEach(function (nm) {
    var r = resolveRef(W, nm); if (!r) { errs.push('Error response from daemon: No such image: ' + nm); return; }
    var used = usedIds(W);
    if (r.byId) {
      var id = r.entries[0].id, tags = imgs(W).filter(function (x) { return x.id === id; });
      if (tags.length > 1 && !force && !tags.every(isDangling)) { errs.push('Error response from daemon: conflict: unable to delete ' + id + ' (must be forced) - image is referenced in multiple repositories'); return; }
      if (used[id] && !force) { errs.push('Error response from daemon: conflict: unable to delete ' + id + ' (cannot be forced) - image is being used by running container ' + used[id].id.slice(0, 12)); return; }
      tags.forEach(function (x) { if (!isDangling(x)) out += 'Untagged: ' + ref(x) + '\n'; });
      W.images = imgs(W).filter(function (x) { return x.id !== id; }); out += 'Deleted: sha256:' + sha(id) + '\n'; return;
    }
    var e = r.entries[0], same = imgs(W).filter(function (x) { return x.id === e.id; }), last = same.length === 1;
    if (last && used[e.id] && !force) { errs.push('Error response from daemon: conflict: unable to remove repository reference "' + nm + '" (must force) - container ' + used[e.id].id.slice(0, 12) + ' is using its referenced image ' + e.id); return; }
    W.images = imgs(W).filter(function (x) { return x !== e; }); out += 'Untagged: ' + ref(e) + '\n'; if (last) out += 'Deleted: sha256:' + sha(e.id) + '\n';
  });
  c.out(out);
  if (errs.length) { c.err(errs.join('\n') + '\n'); if (names.length > 1) c.err('Error: failed to remove images: [' + names.filter(function (n) { return !resolveRef(W, n) || true; }).join(' ') + ']\n'); return 1; }
  return 0;
}
function pruneImages(W, all) {
  var used = usedIds(W), removed = [], reclaimed = 0, seen = {}, o = '';
  var targets = imgs(W).filter(function (x) { return !used[x.id] && (all || isDangling(x)); });
  var targetIds = {}; targets.forEach(function (x) { targetIds[x.id] = 1; });
  targets.forEach(function (x) { if (!isDangling(x)) o += 'untagged: ' + ref(x) + '\n'; });
  Object.keys(targetIds).forEach(function (id) {
    var all2 = imgs(W).filter(function (x) { return x.id === id; });
    if (all2.every(function (x) { return targets.indexOf(x) >= 0; })) { o += 'deleted: sha256:' + sha(id) + '\n'; reclaimed += toMB(all2[0]); }
  });
  W.images = imgs(W).filter(function (x) { return targets.indexOf(x) < 0; });
  return { out: o, mb: reclaimed };
}
function cacheBytes(W) { return D5(W).cacheMB; }
function pruneCache(W) { var D = D5(W), mb = D.cacheMB, n = Math.max(1, Object.keys(D.cache || {}).length), o = ''; if (mb <= 0) return { out: '', mb: 0 }; for (var i = 0; i < Math.min(n, 8); i++) o += hex('cache' + i + mb, 25) + '\n'; D.cache = {}; D.cacheMounts = {}; D.cacheMB = 0; return { out: o, mb: mb }; }
function sysDf(c) {
  var W = c.sh.W, D = D5(W), used = usedIds(W), seen = {}, tot = 0, act = 0, rec = 0, n = 0, na = 0;
  imgs(W).forEach(function (x) { if (seen[x.id]) return; seen[x.id] = 1; n++; var mb = toMB(x); tot += mb; if (used[x.id]) { act += mb; na++; } else rec += mb; });
  var cts = W.containers, run = cts.filter(function (x) { return x.state === 'running' || x.state === 'restarting'; }).length;
  var vols = Object.keys(D.vols || {}), vact = 0, vsz = 0;
  vols.forEach(function (v) { var inUse = cts.some(function (x) { return JSON.stringify(x.binds || []).indexOf(v) >= 0 || (x.proj && v.indexOf(x.proj + '_') === 0 && JSON.stringify((x.svcCfg && x.svcCfg.volumes) || []).indexOf(v.slice(x.proj.length + 1)) >= 0) || JSON.stringify(x.runCfg || '').indexOf(v) >= 0; }); if (inUse) vact++; var mp = '/var/lib/docker/volumes/' + v + '/_data'; try { vsz += c.sh.fs.size(c.sh.fs.real ? c.sh.fs.real(mp) : mp) / 1e6; } catch (e) { vsz += 50; } });
  var pc = function (a, b) { return b > 0 ? ' (' + Math.round(a / b * 100) + '%)' : ' (0%)'; };
  var rows = [['TYPE', 'TOTAL', 'ACTIVE', 'SIZE', 'RECLAIMABLE'],
    ['Images', String(n), String(na), fmt(tot), fmt(rec) + pc(rec, tot)],
    ['Containers', String(cts.length), String(run), fmt(cts.length * 20), fmt(cts.filter(function (x) { return x.state === 'exited'; }).length * 20) + pc(cts.filter(function (x) { return x.state === 'exited'; }).length, cts.length)],
    ['Local Volumes', String(vols.length), String(vact), fmt(vsz), fmt(vols.length > vact ? vsz * 0.0 : 0) + ' (0%)'],
    ['Build Cache', String(D.cacheMB > 0 ? Math.max(3, Object.keys(D.cache || {}).length) : 0), '0', fmt(D.cacheMB), fmt(D.cacheMB)]];
  var w = [16, 10, 10, 10]; c.out(rows.map(function (r) { return pad(r[0], w[0]) + pad(r[1], w[1]) + pad(r[2], w[2]) + pad(r[3], w[3]) + r[4]; }).join('\n') + '\n'); return 0;
}
function capture(fn) { var buf = ''; var c2 = { out: function (s) { buf += s; }, err: function (s) { buf += s; } }; return { c2: c2, get: function () { return buf; } }; }

/* ---------- save / load ---------- */
function doSave(c, rest) {
  var sh = c.sh, W = sh.W, D = D5(W), outF = null, names = [];
  for (var i = 0; i < rest.length; i++) { if (rest[i] === '-o' || rest[i] === '--output') outF = rest[++i]; else if (rest[i].charAt(0) !== '-') names.push(rest[i]); }
  if (!outF) throw new CmdErr('cowardly refusing to save to a terminal. Use the -o flag or redirect.');
  if (!names.length) throw new CmdErr('"docker save" requires at least 1 argument.');
  var es = names.map(function (n) { var p = DK.split(n), e = findExact(W, p[0], p[1]); if (!e) throw new CmdErr('Error response from daemon: reference does not exist'); return e; });
  var path = sh.abs(outF), mb = 0, seen = {}; es.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; mb += toMB(e) * 0.98; } });
  if (!sh.canWrite(path, c)) throw new CmdErr('open ' + outF + ': permission denied');
  sh.fs.put(path, 'DOCKER-IMAGE-TAR\n' + es.map(ref).join('\n') + '\n', { owner: sh.user, size: Math.round(mb * 1e6) });
  D.saved[path] = es.map(function (e) { return cloneEntry(e, e.repo, e.tag); }); return 0;
}
function doLoad(c, rest) {
  var sh = c.sh, W = sh.W, D = D5(W), inF = null;
  for (var i = 0; i < rest.length; i++) { if (rest[i] === '-i' || rest[i] === '--input') inF = rest[++i]; }
  if (!inF) throw new CmdErr('requested load from stdin, but stdin is empty');
  var path = sh.abs(inF); if (!sh.fs.get(path)) throw new CmdErr('open ' + inF + ': no such file or directory');
  var sv = D.saved[path]; if (!sv) throw new CmdErr('Error response from daemon: invalid tar header');
  var o = ''; sv.forEach(function (e) { var ex = findExact(W, e.repo, e.tag); if (ex && ex.id !== e.id) { var still = imgs(W).some(function (x) { return x !== ex && x.id === ex.id; }); if (!still) imgs(W).push(cloneEntry(ex, '<none>', '<none>')); W.images = imgs(W).filter(function (x) { return x !== ex; }); ex = null; } if (!ex) imgs(W).push(cloneEntry(e, e.repo, e.tag)); o += 'Loaded image: ' + ref(e) + '\n'; });
  c.out(o); return 0;
}

/* ---------- build ---------- */
function doBuild(c, a) {
  var sh = c.sh, W = sh.W, D = D5(W), rest = a.slice(1), tags = [], keep = [], i;
  for (i = 0; i < rest.length; i++) { if (rest[i] === '-t' || rest[i] === '--tag') tags.push(rest[++i]); else keep.push(rest[i]); }
  var before = {}; tags.forEach(function (t) { var p = DK.split(t), e = findExact(W, p[0], p[1]); if (e) before[t] = cloneEntry(e, e.repo, e.tag); });
  var args = ['build']; if (tags[0]) args.push('-t', tags[0]); args = args.concat(keep);
  var rc = prev(args, c); if (rc !== 0) return rc;
  var ctx = '.'; for (i = keep.length - 1; i >= 0; i--) { if (keep[i].charAt(0) !== '-') { ctx = keep[i]; break; } }
  var p0 = DK.split(tags[0] || 'x:x'), first = findExact(W, p0[0], p0[1]);
  if (first) {
    var mainTs = sh.fs.get(sh.abs(ctx) + '/src/main.ts'), mt = mainTs ? mainTs.c : '';
    first.bug = /BUG_CRASH/.test(mt) ? 'crash' : /BUG_HEALTH/.test(mt) ? 'health' : null; first.age = '2 minutes ago'; first.seq = ++SEQ;
    for (i = 1; i < tags.length; i++) { var pp = DK.split(tags[i]), ex = findExact(W, pp[0], pp[1]); if (ex) W.images = imgs(W).filter(function (x) { return x !== ex; }); imgs(W).push(cloneEntry(first, pp[0], pp[1])); }
    tags.forEach(function (t) {
      var o = before[t], pt = DK.split(t), cur = findExact(W, pt[0], pt[1]); if (!o || !cur || cur.id === o.id) return;
      if (o.layers && !imgs(W).some(function (x) { return x.id === o.id; })) imgs(W).push(cloneEntry(o, '<none>', '<none>'));
    });
  }
  var lb = D.lastBuild; if (lb && lb.cached < lb.total) D.cacheMB += Math.round((lb.sizeMB || 100) * 0.55);
  return 0;
}

/* ---------- compose --wait và kéo image thiếu ---------- */
function composeTargets(sh, c, rest) {
  var L; try { L = V.composeLoad(sh, c, null); } catch (e) { return null; }
  var svcs = L.doc.services || {}, names = Object.keys(svcs), sel = rest.filter(function (x) { return x.charAt(0) !== '-' && names.indexOf(x) >= 0; });
  return { L: L, svcs: svcs, names: sel.length ? sel : names };
}
function doCompose(c, a) {
  var sh = c.sh, W = sh.W, rest = a.slice(1);
  var sub = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (sub !== 'up') return prev(a, c);
  var wait = false, args2 = [];
  for (var i = 0; i < rest.length; i++) { if (rest[i] === '--wait') wait = true; else if (rest[i] === '--wait-timeout') i++; else args2.push(rest[i]); }
  var T = composeTargets(sh, c, args2.slice(args2.indexOf('up') + 1));
  if (T) {
    for (var k = 0; k < T.names.length; k++) {
      var im = T.svcs[T.names[k]].image; if (!im) continue; var p = parseRef(im);
      if (p.host === 'docker.io' || findExact(W, p.repo, p.hasTag ? p.tag : 'latest')) continue;
      try { pullFromRegistry(sh, c, p, true); } catch (e) { c.err(' ' + T.names[k] + ' Error ' + String(e.message).replace(/^Error response from daemon: /, '') + '\n'); throw e; }
    }
  }
  var rc = prev(['compose'].concat(args2), c);
  if (rc !== 0 || !wait || !T) return rc;
  var bad = null, o = '';
  T.names.forEach(function (n) {
    var nm = T.svcs[n].container_name || (T.L.project + '-' + n + '-1'), ct = W.containers.filter(function (x) { return x.name === nm; })[0]; if (!ct || bad) return;
    var hasH = !!(T.svcs[n].healthcheck || (function () { var e = findExact(W, DK.split(ct.image)[0], DK.split(ct.image)[1]); return e && e.health; })());
    if (!hasH && ct.state === 'running') return;
    o += ' Container ' + nm + '  Waiting\n';
    if (ct.state === 'restarting') bad = 'container ' + nm + ' is restarting, wait until the container is running';
    else if (ct.state === 'exited') bad = 'dependency failed to start: container ' + nm + ' exited (' + (ct.exitCode || 1) + ')';
    else if (/\(unhealthy\)/.test(ct.status || '')) bad = 'dependency failed to start: container ' + nm + ' is unhealthy';
    if (bad) o += ' Container ' + nm + '  Error\n'; else o += ' Container ' + nm + '  Healthy\n';
  });
  c.out(o); if (bad) { c.err(bad + '\n'); return 1; }
  return 0;
}

/* ---------- dispatcher ---------- */
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W; if (!W.dk4) return prev(a, c);
  var D = D5(W); fixIds(W);
  var sub = a[0], rest = a.slice(1), rc;
  if (sub === 'image' && /^(ls|rm|prune|tag|save|load|push|pull|list)$/.test(rest[0] || '')) { sub = ({ ls: 'images', list: 'images', rm: 'rmi' })[rest[0]] || rest[0]; rest = rest.slice(1); a = [sub].concat(rest); }
  if (sub === 'images') return listImages(c, rest);
  if (sub === 'tag') return doTag(c, rest);
  if (sub === 'rmi') { rc = doRmi(c, rest); return rc; }
    if (sub === 'save') return doSave(c, rest);
  if (sub === 'load') return doLoad(c, rest);
  if (sub === 'login') return doLogin(c, rest);
  if (sub === 'logout') return doLogout(c, rest);
  if (sub === 'push') return doPush(c, rest);
  if (sub === 'pull') { var pr = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0]; if (!pr) throw new CmdErr('"docker pull" requires exactly 1 argument.'); var pp = parseRef(pr); if (!isHubOfficial(pp)) return pullFromRegistry(sh, c, pp, false); }
  if (sub === 'build') { rc = doBuild(c, a); fixIds(W); return rc; }
  if (sub === 'run' && rest.indexOf('-d') < 0 && rest.indexOf('--detach') < 0 && rest.indexOf('--rm') < 0 && rest.indexOf('-it') < 0 && rest.indexOf('-i') < 0) {
    var VAL = { '-v': 1, '--volume': 1, '-e': 1, '--env': 1, '-w': 1, '--workdir': 1, '-u': 1, '--user': 1, '--name': 1, '--network': 1, '--net': 1, '-p': 1, '--publish': 1, '--entrypoint': 1, '-m': 1, '--memory': 1, '--cpus': 1, '--restart': 1 }, nm = null, imgRef = null, j;
    for (j = 0; j < rest.length; j++) { if (rest[j] === '--name') { nm = rest[j + 1]; } if (VAL[rest[j]]) { j++; continue; } if (rest[j].charAt(0) === '-') continue; imgRef = rest[j]; break; }
    var before = W.containers.length;
    rc = prev(['run', '--rm'].concat(rest), c); fixIds(W);
    if (rc === 0 && imgRef) {
      var names = ['quirky_turing', 'sleepy_hopper', 'brave_lovelace', 'eager_knuth'], pr0 = DK.split(imgRef), e0 = findExact(W, pr0[0], pr0[1]), nid = hex('run' + imgRef + W.containers.length + Date.now(), 12);
      W.containers.push({ id: nid, name: nm || names[W.containers.length % names.length], image: imgRef, ports: [], env: {}, state: 'exited', status: 'Exited (0) 2 seconds ago', logs: [], manualStop: true, exitCode: 0, restartPolicy: 'no', imgId: e0 && e0.id, binds: [], nets: ['bridge'] });
    }
    return rc;
  }
  if (sub === 'builder' && rest[0] === 'prune') {
    var force = rest.indexOf('-f') >= 0 || rest.indexOf('--force') >= 0;
    if (!force) { c.out('WARNING! This will remove any build cache not used in the last 5 minutes... Are you sure you want to continue? [y/N] '); return 0; }
    var pc = pruneCache(W); c.out((pc.mb > 0 ? 'Deleted build cache objects:\n' + pc.out + '\n' : '') + 'Total reclaimed space: ' + fmt(pc.mb) + '\n'); return 0;
  }
  if (sub === 'system' && rest[0] === 'df') return sysDf(c);
  if (sub === 'system' && rest[0] === 'prune') return sysPrune(c, rest.slice(1));
  if (sub === 'compose') { rc = doCompose(c, a); fixIds(W); return rc; }
  rc = prev(a, c); fixIds(W); return rc;
};
// docker image prune đi qua cmds.docker với a = ['image','prune',...] đã được chuẩn hoá thành sub = 'prune'
var dispatch = cmds.docker;
cmds.docker = function (a, c) {
  var W = c.sh.W;
  if (W.dk4 && a[0] === 'image' && a[1] === 'prune') return imagePrune(c, a.slice(2));
  return dispatch(a, c);
};
function imagePrune(c, rest) {
  var W = c.sh.W, all = rest.indexOf('-a') >= 0 || rest.indexOf('--all') >= 0, force = rest.indexOf('-f') >= 0 || rest.indexOf('--force') >= 0;
  if (!force) { c.out('WARNING! This will remove ' + (all ? 'all images without at least one container associated to them' : 'all dangling images') + '.\nAre you sure you want to continue? [y/N] '); return 0; }
  fixIds(W); var r = pruneImages(W, all);
  c.out((r.out ? 'Deleted Images:\n' + r.out + '\n' : '') + 'Total reclaimed space: ' + fmt(r.mb) + '\n'); return 0;
}
function sysPrune(c, rest) {
  var sh = c.sh, W = sh.W, D = D5(W), all = rest.indexOf('-a') >= 0 || rest.indexOf('--all') >= 0, vols = rest.indexOf('--volumes') >= 0, force = rest.indexOf('-f') >= 0 || rest.indexOf('--force') >= 0;
  if (!force) { c.out('WARNING! This will remove:\n  - all stopped containers\n  - all networks not used by at least one container\n' + (vols ? '  - all anonymous volumes not used by at least one container\n' : '') + '  - all ' + (all ? 'images without at least one container associated to them' : 'dangling images') + '\n  - unused build cache\n\nAre you sure you want to continue? [y/N] '); return 0; }
  var o = '', mb = 0, stopped = W.containers.filter(function (x) { return x.state === 'exited'; });
  if (stopped.length) { o += 'Deleted Containers:\n' + stopped.map(function (x) { return x.id; }).join('\n') + '\n\n'; W.containers = W.containers.filter(function (x) { return x.state !== 'exited'; }); mb += stopped.length * 0.02; }
  var cap = capture(); try { prev(['network', 'prune', '-f'], Object.assign(Object.create(c), { out: cap.c2.out, err: cap.c2.err })); } catch (e) { }
  var nt = cap.get(); if (/Deleted Networks:/.test(nt)) o += nt.replace(/\n*$/, '\n\n');
  if (vols) { var cv = capture(); try { prev(['volume', 'prune', '-f'].concat(all ? ['-a'] : []), Object.assign(Object.create(c), { out: cv.c2.out, err: cv.c2.err })); } catch (e) { } var vt = cv.get(); if (/Deleted Volumes:/.test(vt) && /Deleted Volumes:\n\S/.test(vt)) o += vt.replace(/Total reclaimed space:.*\n?/, '').replace(/\n*$/, '\n\n'); }
  fixIds(W); var r = pruneImages(W, all); if (r.out) o += 'Deleted Images:\n' + r.out + '\n'; mb += r.mb;
  var pc = pruneCache(W); if (pc.mb > 0) o += 'Deleted build cache objects:\n' + pc.out + '\n'; mb += pc.mb;
  c.out(o + 'Total reclaimed space: ' + fmt(mb) + '\n'); return 0;
}
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
