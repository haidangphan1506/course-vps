(function (G) {
'use strict';
/* Lớp Docker nâng cao (chương c5c). Chỉ hoạt động khi W.dk4 được bật bởi V.dk4Init, nên không ảnh hưởng các chương cũ. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, pad = V.util.pad, hs = V.util.hs, DK = V.dk, SP = V.Shell.prototype;
var prev = cmds.docker, prevFree = cmds.free;

function lines(t) { return (t || '').split('\n'); }
function hash(s) { var h = 7; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function hex(seed, n) { var h = hash(seed), s = ''; for (var i = 0; i < n; i++) { h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff; s += '0123456789abcdef'.charAt((h >>> 14) % 16); } return s; }
function isTrue(v) { return /^true$/i.test(String(v == null ? '' : v)); }
function listOf(v) {
  if (Array.isArray(v)) return v.slice();
  if (typeof v === 'string' && /^\[.*\]$/.test(v.trim())) return v.trim().slice(1, -1).split(',').map(function (x) { return x.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
  return v ? [v] : [];
}
function fmtMB(mb) { return mb >= 1000 ? (mb / 1000).toFixed(2) + 'GB' : mb >= 10 ? Math.round(mb) + 'MB' : mb.toFixed(1) + 'MB'; }
function fmtMiB(m) { return m >= 1024 ? (m / 1024).toFixed(2) + 'GiB' : m.toFixed(1) + 'MiB'; }
function memParse(v) { var m = /^(\d+(?:\.\d+)?)\s*([kKmMgG])/.exec(String(v == null ? '' : v)); if (!m) return null; var n = +m[1], u = m[2].toLowerCase(); return u === 'g' ? n * 1024 : u === 'k' ? n / 1024 : n; }
function findCt(W, n) { return (W.containers || []).filter(function (c) { return c.name === n || c.id === n || (n && n.length >= 4 && c.id.indexOf(n) === 0); })[0]; }
function sk(fi) { return fi >= 0 ? fi + 1 : -99; }
function strip(a, drop) { return a.filter(function (x) { return !drop[x]; }); }

/* ===================== khởi tạo ===================== */
V.dk4Init = function (sh) {
  var W = sh.W;
  W.dk4 = { nets: {}, vols: {}, cache: {}, cacheMounts: {}, lastHas: null, subnetN: 18, hostMiB: 7987 };
  var D = W.dk4;
  D.nets.bridge = { name: 'bridge', driver: 'bridge', internal: false, subnet: '172.17.0.0/16', gw: '172.17.0.1', next: 2, id: hex('bridge', 12), predefined: true };
  D.nets.host = { name: 'host', driver: 'host', internal: false, subnet: '', gw: '', next: 2, id: hex('host', 12), predefined: true };
  D.nets.none = { name: 'none', driver: 'null', internal: false, subnet: '', gw: '', next: 2, id: hex('none', 12), predefined: true };
  sh.fs.mkdirp('/var/lib/docker/volumes', 'root', 449);
};
function D4(W) { return W.dk4; }

/* ===================== mạng ===================== */
function netCreate(W, name, o) {
  var D = D4(W);
  if (D.nets[name]) return D.nets[name];
  var sub = o.subnet, gw;
  if (!sub) { sub = '172.' + (D.subnetN++) + '.0.0/16'; }
  var m = /^(\d+\.\d+\.\d+)\.\d+\/(\d+)$/.exec(sub); gw = m ? m[1] + '.1' : '';
  D.nets[name] = { name: name, driver: o.driver || 'bridge', internal: !!o.internal, subnet: sub, gw: gw, next: 2, id: hex(name, 12), proj: o.proj || null };
  return D.nets[name];
}
function ipOn(W, ct, net) {
  var n = D4(W).nets[net]; ct.ips = ct.ips || {};
  if (ct.ips[net]) return ct.ips[net];
  if (!n || !n.subnet) { ct.ips[net] = ''; return ''; }
  var base = n.subnet.replace(/\.\d+\/\d+$/, '');
  ct.ips[net] = base + '.' + (n.next++);
  return ct.ips[net];
}
function attach(W, ct, net) { ct.nets = ct.nets || []; if (ct.nets.indexOf(net) < 0) ct.nets.push(net); ipOn(W, ct, net); ct.ip = ct.ips[ct.nets[0]] || ct.ip; }
function detach(W, ct, net) { ct.nets = (ct.nets || []).filter(function (x) { return x !== net; }); if (ct.ips) delete ct.ips[net]; ct.ip = ct.ips && ct.nets[0] ? ct.ips[ct.nets[0]] : ct.ip; }
function userNets(W, ct) { return (ct.nets || []).filter(function (n) { return n !== 'bridge' && n !== 'host' && n !== 'none'; }); }
function allInternal(W, ct) { var ns = ct.nets || []; return ns.length > 0 && ns.every(function (n) { var x = D4(W).nets[n]; return x && x.internal; }); }
function aliasesOf(ct) {
  var a = [ct.name, ct.svc].filter(Boolean);
  var s = ct.svcCfg || {}, nn = s.networks;
  if (nn && typeof nn === 'object' && !Array.isArray(nn)) Object.keys(nn).forEach(function (k) { var v = nn[k]; if (v && typeof v === 'object') listOf(v.aliases).forEach(function (x) { a.push(x); }); });
  (ct.aliases || []).forEach(function (x) { a.push(x); });
  return a;
}
function resolve(W, from, host) {
  // trả về { ct, ip } nếu from phân giải được host bằng DNS nội bộ hoặc IP, ngược lại null
  var cts = W.containers.filter(function (x) { return x.state === 'running'; });
  var m = /^\d+\.\d+\.\d+\.\d+$/.test(host);
  for (var i = 0; i < cts.length; i++) {
    var t = cts[i];
    if (m) { var shared = (from.nets || []).filter(function (n) { return (t.nets || []).indexOf(n) >= 0; })[0]; if (shared && t.ips && t.ips[shared] === host) return { ct: t, ip: host, net: shared }; continue; }
    if (t === from) { if (aliasesOf(t).indexOf(host) >= 0 || host === 'localhost') return { ct: t, ip: (t.ips && t.ips[(t.nets || [])[0]]) || '127.0.0.1', net: (t.nets || [])[0] }; continue; }
    if (aliasesOf(t).indexOf(host) < 0) continue;
    var sn = userNets(W, from).filter(function (n) { return (t.nets || []).indexOf(n) >= 0; })[0];
    if (sn) return { ct: t, ip: t.ips[sn], net: sn };
  }
  if (host === 'localhost' || host === '127.0.0.1') return { ct: from, ip: '127.0.0.1', net: null };
  return null;
}
function portsOf(ct) {
  var set = []; (ct.portsDecl || ct.ports || []).forEach(function (p) { set.push(p.cont); });
  var im = ct.image || '';
  if (/postgres/.test(im)) set.push(5432); else if (/redis/.test(im)) set.push(6379); else if (/nginx/.test(im)) set.push(80); else if (/uptime-kuma/.test(im)) set.push(3001);
  else if (kind(ct) === 'api') set.push(8888);
  return set;
}

/* ===================== volume ===================== */
function volDir(n) { return '/var/lib/docker/volumes/' + n + '/_data'; }
function volCreate(sh, name, seedKind, proj) {
  var D = D4(sh.W), fresh = !D.vols[name];
  if (fresh) { D.vols[name] = { name: name, created: '2026-10-27T09:15:11+07:00', proj: proj || null, labels: {} }; }
  sh.fs.mkdirp('/var/lib/docker/volumes/' + name, 'root', 449);
  sh.fs.mkdirp(volDir(name), 'root', 493);
  if (seedKind === 'pg') { pgSeed(sh, name, !D.pgSeeded); D.pgSeeded = true; }
  return fresh;
}
function pgSeed(sh, vn, firstEver) {
  var d = volDir(vn), f = sh.fs, W = sh.W, D = D4(W);
  if (f.isF(d + '/PG_VERSION')) return;
  var o = { owner: '999', mode: 384 };
  f.put(d + '/PG_VERSION', '16\n', o);
  f.put(d + '/postgresql.conf', '# PostgreSQL configuration (mô phỏng)\nlisten_addresses = \'*\'\nmax_connections = 100\n', o);
  f.put(d + '/pg_wal/000000010000000000000001', 'WAL', { owner: '999', mode: 384, size: 16777216 });
  f.put(d + '/base/1/1259', 'catalog', { owner: '999', mode: 384, size: 8192 });
  ['', '/base', '/pg_wal', '/base/1', '/base/16384'].forEach(function (x) { f.mkdirp(d + x, '999', 448); var dn = f.n[d + x]; dn.owner = '999'; dn.mode = 448; });
  if (firstEver) { f.put(d + '/base/16384/16397', 'users+sessions+bookings', { owner: '999', mode: 384, size: 50331648 }); D.lastHas = true; if (W.db) W.db.hasData = true; }
  else { D.lastHas = false; if (W.db) W.db.hasData = false; }
}
function pgVolName(W) {
  var ct = W.containers.filter(function (c) { return /postgres/.test(c.image || ''); })[0]; if (!ct) return null;
  var vs = volsOf(ct); return vs.filter(function (v) { return v.cont === '/var/lib/postgresql/data'; }).map(function (v) { return v.name; })[0] || null;
}
function syncPg(sh) {
  var W = sh.W, D = D4(W); if (!W.db) return;
  var vn = pgVolName(W); if (!vn || !D.vols[vn]) return;
  var marker = volDir(vn) + '/base/16384/16397', exists = sh.fs.isF(marker), cur = W.db.hasData;
  if (D.lastHas == null) D.lastHas = exists;
  if (cur === true || cur === false) {
    if (cur !== D.lastHas) {
      if (cur) sh.fs.put(marker, 'users+sessions+bookings', { owner: '999', mode: 384, size: 50331648 }); else sh.fs.rm(marker);
      D.lastHas = cur; return;
    }
  }
  if (exists !== D.lastHas) { W.db.hasData = exists; D.lastHas = exists; }
}
function volsOf(ct) {
  // trả về [{name, cont, ro}] cho volume có tên
  var out = [], proj = ct.proj, top = ct.topVols || {};
  var list = [];
  if (ct.svcCfg && ct.svcCfg.volumes) listOf(ct.svcCfg.volumes).forEach(function (v) { list.push({ v: String(v), compose: true }); });
  ((ct.runCfg && ct.runCfg.vols) || []).forEach(function (v) { list.push({ v: String(v), compose: false }); });
  list.forEach(function (e) {
    var m = /^([A-Za-z0-9][\w.-]*):(\/[^:]*)(?::(\w+))?$/.exec(e.v); if (!m) return;
    var name = m[1];
    if (e.compose && proj) { var t = top[name]; name = t && t.name ? t.name : proj + '_' + name; }
    out.push({ name: name, cont: m[2], ro: m[3] === 'ro' });
  });
  return out;
}
function volUsedBy(W, name) { return W.containers.filter(function (ct) { return volsOf(ct).some(function (v) { return v.name === name; }); }); }
function volRemove(sh, name) { var D = D4(sh.W); delete D.vols[name]; sh.fs.rm('/var/lib/docker/volumes/' + name); }
function volSize(sh, name) { return sh.fs.size(volDir(name)); }

/* ===================== phân tích Dockerfile ===================== */
function parseDf(text) {
  var raw = lines(String(text).replace(/\\\n\s*/g, ' ')), stages = [], gargs = {}, cur = null;
  raw.forEach(function (l) {
    l = l.trim(); if (!l || l.charAt(0) === '#') return;
    var m = /^(\w+)\s*(.*)$/.exec(l); if (!m) return;
    var op = m[1].toUpperCase(), rest = m[2], flags = {}, fl;
    if (op !== 'ARG' && op !== 'ENV' && op !== 'LABEL' && op !== 'EXPOSE' && op !== 'USER' && op !== 'WORKDIR') { while ((fl = /^--([\w-]+)(?:=(\S+))?\s*/.exec(rest))) { (flags[fl[1]] = flags[fl[1]] || []).push(fl[2] == null ? true : fl[2]); rest = rest.slice(fl[0].length); } }
    if (op === 'FROM') { var fm = /^(\S+)(?:\s+AS\s+(\S+))?/i.exec(rest); if (!fm) return; cur = { name: fm[2] || null, ref: fm[1], idx: stages.length, instrs: [] }; stages.push(cur); }
    else if (!cur) { if (op === 'ARG') { var am = /^(\w+)(?:=(.*))?$/.exec(rest); if (am) gargs[am[1]] = am[2] == null ? null : am[2].replace(/^["']|["']$/g, ''); } }
    else cur.instrs.push({ op: op, rest: rest, flags: flags, line: l });
  });
  return { stages: stages, gargs: gargs };
}
var BASES = [
  [/^node(:(latest|lts|[\d.]+))?$/, 1100, 'full'], [/^node:(latest|lts|[\d.]+)-slim$/, 250, 'slim'], [/^node:(latest|lts|[\d.]+)-alpine[\d.]*$/, 160, 'alpine'],
  [/^alpine(:[\w.]+)?$/, 8, 'alpine'], [/^busybox(:[\w.]+)?$/, 4, 'alpine'], [/^debian(:[\w.-]+)?$/, 120, 'full'], [/^ubuntu(:[\w.]+)?$/, 78, 'full'],
  [/^gcr\.io\/distroless\/nodejs\d*(-debian\d+)?:debug$/, 127, 'debug'], [/^gcr\.io\/distroless\/nodejs\d*(-debian\d+)?(:[\w.-]+)?$/, 125, 'distroless'], [/^scratch$/, 0, 'distroless'],
  [/^postgres(:[\w.-]+)?$/, 432, 'full'], [/^redis(:[\w.-]+)?$/, 117, 'slim'], [/^nginx(:[\w.-]+)?$/, 192, 'full']
];
function baseInfo(ref) { for (var i = 0; i < BASES.length; i++) if (BASES[i][0].test(ref)) return { mb: BASES[i][1], flavor: BASES[i][2] }; return null; }
function toolsOfFlavor(fl) {
  if (fl === 'alpine') return ['wget', 'nc', 'ping', 'nslookup', 'getent', 'hostname'];
  if (fl === 'slim') return ['getent', 'hostname'];
  if (fl === 'distroless') return [];
  if (fl === 'debug') return ['wget', 'nc', 'getent', 'hostname'];
  return ['curl', 'wget', 'ping', 'getent', 'hostname', 'nc'];
}
function badRef(ref) {
  if (/\$\{|\$\w/.test(ref)) return true;
  var i = ref.lastIndexOf(':'); if (i > 0 && ref.indexOf('/', i) < 0) { var tag = ref.slice(i + 1); return !/^[\w][\w.-]*$/.test(tag); }
  return false;
}
function substArgs(s, vals) { return s.replace(/\$\{(\w+)\}|\$(\w+)/g, function (m, a, b) { var k = a || b; return vals[k] != null ? vals[k] : ''; }); }
function ignorePatterns(sh, dir) {
  var n = sh.fs.get(dir + '/.dockerignore'); if (!n) return [];
  return lines(n.c).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== '#'; });
}
function globRe(p) { return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0001/g, '.*').replace(/\?/g, '[^/]') + '$'); }
function ignored(rel, pats) {
  var ig = false;
  pats.forEach(function (p) {
    var neg = p.charAt(0) === '!'; if (neg) p = p.slice(1);
    p = p.replace(/^\.?\//, '').replace(/\/$/, '');
    var re = globRe(p), parts = rel.split('/'), hit = false;
    for (var i = 1; i <= parts.length; i++) if (re.test(parts.slice(0, i).join('/'))) { hit = true; break; }
    if (hit) ig = !neg;
  });
  return ig;
}
function ctxFiles(sh, dir) {
  var pats = ignorePatterns(sh, dir), out = [], pre = dir + '/';
  Object.keys(sh.fs.n).sort().forEach(function (k) {
    if (k.indexOf(pre) !== 0) return; var n = sh.fs.n[k], rel = k.slice(pre.length);
    if (n.t !== 'f') return;
    if (ignored(rel, pats)) return;
    out.push({ rel: rel, size: sh.fs.size(k), c: n.c || '' });
  });
  return out;
}
function nodeModulesMB(rest) { return /--omit=dev|--omit dev|--production|--only=production/.test(rest) ? 92 : 330; }
function runTimeSec(rest, warmCache) {
  if (/\bnpm (ci|install)\b|\byarn (install|--frozen)/.test(rest)) return warmCache ? 5.5 : 24.1;
  if (/npm run build|nest build|\btsc\b/.test(rest)) return 13.2;
  if (/apk add/.test(rest)) return 4.8; if (/apt-get (install|update)/.test(rest)) return 11.6;
  if (/npm prune/.test(rest)) return 3.1;
  return 0.9;
}

function dkBuild(a, c) {
  var sh = c.sh, W = sh.W, D = D4(W), rest = a.slice(1), tag = null, ctx = null, bargs = {}, secrets = {}, target = null, noCache = false, file = null, i;
  for (i = 0; i < rest.length; i++) {
    var x = rest[i], eq = x.indexOf('=');
    var nm = eq > 0 && x.indexOf('--') === 0 ? x.slice(0, eq) : x, inl = eq > 0 && x.indexOf('--') === 0 ? x.slice(eq + 1) : null;
    function val() { return inl != null ? inl : rest[++i]; }
    if (nm === '-t' || nm === '--tag') tag = val();
    else if (nm === '-f' || nm === '--file') file = val();
    else if (nm === '--build-arg') { var kv = val() || '', q = kv.indexOf('='); if (q > 0) bargs[kv.slice(0, q)] = kv.slice(q + 1); else bargs[kv] = (sh.env[kv] != null ? sh.env[kv] : ''); }
    else if (nm === '--secret') { var sv = val() || '', idm = /(?:^|,)id=([^,]+)/.exec(sv), srcm = /(?:^|,)src=([^,]+)/.exec(sv); if (idm) secrets[idm[1]] = srcm ? srcm[1] : null; }
    else if (nm === '--target') target = val();
    else if (nm === '--no-cache') noCache = true;
    else if (nm === '--progress' || nm === '--platform' || nm === '--label' || nm === '--cache-from' || nm === '--cache-to' || nm === '--network' || nm === '--build-context' || nm === '--output' || nm === '-o') val();
    else if (nm.charAt(0) === '-') continue;
    else ctx = x;
  }
  if (!ctx) throw new CmdErr('"docker build" requires exactly 1 argument.');
  var dir = sh.abs(ctx), dfPath = file ? sh.abs(file) : dir + '/Dockerfile', dfNode = sh.fs.get(dfPath);
  if (!dfNode) return prev(a, c);
  var P = parseDf(dfNode.c);
  if (!P.stages.length) throw new CmdErr('ERROR: failed to solve: dockerfile parse error: file with no instructions');
  var pull = function (ref) { throw new CmdErr('ERROR: failed to solve: ' + ref + ': failed to resolve source metadata for docker.io/library/' + (ref.indexOf(':') > 0 ? ref : ref + ':latest') + ': pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed'); };
  // 1) FROM
  var gvals = {}; Object.keys(P.gargs).forEach(function (k) { gvals[k] = bargs[k] != null ? bargs[k] : P.gargs[k]; });
  var byName = {};
  P.stages.forEach(function (st) {
    st.refR = substArgs(st.ref, gvals);
    if (byName[st.refR] == null && !(st.refR in byName) && P.stages.some(function (o) { return o.name === st.refR && o.idx < st.idx; })) { st.fromStage = P.stages.filter(function (o) { return o.name === st.refR; })[0]; }
    if (st.fromStage) { st.base = st.fromStage.base; st.flavor = st.fromStage.flavor; st.baseMB = st.fromStage.baseMB; return; }
    if (badRef(st.refR)) throw new CmdErr('ERROR: failed to solve: failed to parse stage name "' + st.refR + '": invalid reference format');
    var bi = baseInfo(st.refR); if (!bi) pull(st.refR);
    st.base = st.refR; st.flavor = bi.flavor; st.baseMB = bi.mb;
  });
  // chọn stage đích
  var final = P.stages[P.stages.length - 1];
  if (target) { final = P.stages.filter(function (s) { return s.name === target; })[0]; if (!final) throw new CmdErr('ERROR: failed to solve: target stage "' + target + '" could not be found'); }
  function stageRef(x) { var n = P.stages.filter(function (s) { return s.name === x; })[0]; if (!n && /^\d+$/.test(x)) n = P.stages[+x]; return n; }
  // 2) phụ thuộc và kiểm tra
  var needed = {}; function need(st) { if (needed[st.idx]) return; needed[st.idx] = true; if (st.fromStage) need(st.fromStage); st.instrs.forEach(function (ins) { if (ins.op === 'COPY' && ins.flags.from) { var t = stageRef(String(ins.flags.from[0])); if (t && t.idx < st.idx) need(t); } }); }
  need(final);
  var files = ctxFiles(sh, dir), ctxBytes = 0; files.forEach(function (f) { ctxBytes += f.size; });
  var ctxHash = hash(files.map(function (f) { return f.rel + ':' + f.c.length + ':' + hash(f.c); }).join('|'));
  var sizeLayers = {};   // stage.idx -> {nmMB, dist, layers[]}
  var anyBuild = {};
  P.stages.forEach(function (st) {
    if (!needed[st.idx]) return;
    var info = { nm: st.fromStage ? sizeLayers[st.fromStage.idx].nm : 0, nmFinal: st.fromStage ? sizeLayers[st.fromStage.idx].nmFinal : 0, built: st.fromStage ? sizeLayers[st.fromStage.idx].built : false, hasPkg: st.fromStage ? sizeLayers[st.fromStage.idx].hasPkg : false, args: {}, env: {}, layers: [], steps: [] };
    sizeLayers[st.idx] = info;
    var sargs = [];
    st.instrs.forEach(function (ins) {
      var sub = function (s) { var v = {}; Object.keys(gvals).forEach(function (k) { v[k] = gvals[k]; }); Object.keys(info.args).forEach(function (k) { v[k] = info.args[k]; }); Object.keys(info.env).forEach(function (k) { v[k] = info.env[k]; }); return substArgs(s, v); };
      if (ins.op === 'ARG') { var am = /^(\w+)(?:=(.*))?$/.exec(ins.rest); if (am) { var val = bargs[am[1]] != null ? bargs[am[1]] : (am[2] != null ? am[2].replace(/^["']|["']$/g, '') : (P.gargs[am[1]] != null && !(am[1] in info.args) ? gvals[am[1]] : '')); info.args[am[1]] = val; sargs.push(am[1]); ins.argName = am[1]; } }
      if (ins.op === 'ENV') { var em = /^(\w+)(?:=|\s+)(.*)$/.exec(ins.rest); if (em) info.env[em[1]] = em[2].replace(/^["']|["']$/g, ''); }
      if (ins.op === 'RUN') {
        listOf(ins.flags.mount).forEach(function (mt) {
          var sm = /type=secret(?:.*?,id=([^,]+)|,id=([^,]+))/.exec(String(mt)) || /id=([^,]+).*type=secret/.exec(String(mt));
          if (/type=secret/.test(String(mt))) { var idm = /id=([^,]+)/.exec(String(mt)); var sid = idm ? idm[1] : 'default'; if (!(sid in secrets)) throw new CmdErr('ERROR: failed to solve: secret ' + sid + ': not found'); if (secrets[sid] && !sh.fs.isF(sh.abs(secrets[sid]))) throw new CmdErr('ERROR: failed to solve: failed to read secret ' + sid + ': open ' + sh.abs(secrets[sid]) + ': no such file or directory'); }
        });
        var r = ins.rest;
        if (/\bnpm (ci|install)\b|\byarn install/.test(r)) { info.nm = nodeModulesMB(r); info.nmFinal = info.nm; }
        if (/npm prune/.test(r) && /--omit=dev|--production/.test(r)) info.nmFinal = 92;
        if (/npm run build|nest build|\btsc\b/.test(r)) info.built = true;
      }
      if (ins.op === 'COPY' || ins.op === 'ADD') {
        var toks = ins.rest.trim().split(/\s+/), srcs = toks.slice(0, -1);
        if (ins.flags.from) {
          var fr = String(ins.flags.from[0]), ft = stageRef(fr);
          if (!ft || ft.idx >= st.idx) { if (/^\d+$/.test(fr)) throw new CmdErr('ERROR: failed to solve: invalid from flag value ' + fr + ': invalid stage index'); pull(fr); }
          var fi = sizeLayers[ft.idx];
          srcs.forEach(function (sp) {
            var miss = null;
            if (/\/dist\/?$|^dist\/?$/.test(sp) && !fi.built) miss = sp;
            if (/node_modules/.test(sp) && !fi.nm) miss = sp;
            if (/package\.json/.test(sp) && !fi.hasPkg) miss = sp;
            if (miss) throw new CmdErr('ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref ' + hex(fr + miss, 25) + '::' + hex(miss + fr, 25) + ': "' + (miss.charAt(0) === '/' ? miss : '/app/' + miss.replace(/^\.\//, '')) + '": not found');
          });
        } else {
          srcs.forEach(function (sp) {
            if (sp === '.' || sp === './') { info.hasPkg = true; return; }
            var re = globRe(sp.replace(/^\.\//, '').replace(/\/$/, '')), hit = files.some(function (f) { var p = f.rel.split('/'), j; for (j = 1; j <= p.length; j++) if (re.test(p.slice(0, j).join('/'))) return true; return false; });
            if (!hit) throw new CmdErr('ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref ' + hex(sp + 'k', 25) + '::' + hex('k' + sp, 25) + ': "/' + sp.replace(/^\.\//, '') + '": not found');
            if (/package/.test(sp)) info.hasPkg = true;
          });
        }
      }
    });
  });
  // 3) tính lớp, kích thước, bộ nhớ đệm (chỉ stage được cần)
  var out = [], totalT = 0.0, stepCount = 0, ctxT = Math.max(0.1, ctxBytes / 50e6);
  var needList = P.stages.filter(function (s) { return needed[s.idx]; });
  var multi = P.stages.length > 1;
  var prevKeyByStage = {};
  var stepLines = [], finalLayers = [], finalSize = 0, finalEnv = {}, finalUser = '', finalEntry = null, finalCmd = null, finalHealth = null, finalArgsSeen = [], finalLeak = null, finalExpose = [];
  needList.forEach(function (st) {
    var label = !multi && !st.name ? '' : (st.name || 'stage-' + st.idx) + ' ';
    var execSteps = [{ ins: { op: 'FROM', rest: st.refR, flags: {}, line: 'FROM ' + st.refR } }];
    st.instrs.forEach(function (ins) { if (/^(WORKDIR|COPY|ADD|RUN)$/.test(ins.op)) execSteps.push({ ins: ins }); });
    var key = st.fromStage ? prevKeyByStage[st.fromStage.idx] : 'base:' + st.refR, cachedChain = !noCache, info = sizeLayers[st.idx];
    var argsNow = {}, sargsList = [], envNow = {};
    // đi lần lượt tất cả instruction để theo dõi ARG khi gặp RUN
    var layers = [];
    var baseLayerMB = st.fromStage ? 0 : st.baseMB;
    var stepIdx = 0, stepTotal = execSteps.length;
    var seq = [{ op: 'FROM', ins: null }].concat(st.instrs.map(function (x) { return { op: x.op, ins: x }; }));
    var stSize = st.fromStage ? 0 : st.baseMB;
    var argVals = {}, argOrder = [];
    seq.forEach(function (it) {
      var ins = it.ins, op = it.op, desc;
      if (op === 'FROM') {
        stepIdx++;
        var kk = 'base:' + st.refR; key = st.fromStage ? prevKeyByStage[st.fromStage.idx] : kk;
        stepLines.push([' => ' + (cachedChain && D.cache[key] ? 'CACHED ' : '') + '[' + label + stepIdx + '/' + stepTotal + '] FROM docker.io/library/' + (st.fromStage ? st.refR : st.refR), 0.0]);
        return;
      }
      if (op === 'ARG') { var am2 = /^(\w+)/.exec(ins.rest); if (am2) { var nm3 = am2[1]; var dm = /=(.*)$/.exec(ins.rest); var vv = bargs[nm3] != null ? bargs[nm3] : (dm ? dm[1].replace(/^["']|["']$/g, '') : (P.gargs[nm3] != null ? gvals[nm3] : '')); argVals[nm3] = vv; if (argOrder.indexOf(nm3) < 0) argOrder.push(nm3); } layers.push({ by: 'ARG ' + ins.rest, mb: 0 }); return; }
      if (op === 'ENV') { var em2 = /^(\w+)(?:=|\s+)(.*)$/.exec(ins.rest); if (em2) envNow[em2[1]] = em2[2].replace(/^["']|["']$/g, ''); layers.push({ by: 'ENV ' + ins.rest, mb: 0 }); return; }
      if (op === 'USER') { if (st === final) finalUser = ins.rest.trim(); layers.push({ by: 'USER ' + ins.rest, mb: 0 }); return; }
      if (op === 'EXPOSE') { layers.push({ by: 'EXPOSE ' + ins.rest, mb: 0 }); return; }
      if (op === 'ENTRYPOINT') { if (st === final) finalEntry = parseExec(ins.rest); layers.push({ by: 'ENTRYPOINT ' + ins.rest, mb: 0 }); return; }
      if (op === 'CMD') { if (st === final) finalCmd = parseExec(ins.rest); layers.push({ by: 'CMD ' + ins.rest, mb: 0 }); return; }
      if (op === 'HEALTHCHECK') {
        if (st === final) { if (/^NONE/i.test(ins.rest)) finalHealth = null; else { var hm = /^CMD\s+(.*)$/i.exec(ins.rest); finalHealth = { cmd: hm ? hm[1] : ins.rest, interval: (ins.flags.interval || ['30s'])[0], timeout: (ins.flags.timeout || ['30s'])[0], retries: +(ins.flags.retries || [3])[0], start: (ins.flags['start-period'] || ['0s'])[0] }; } }
        layers.push({ by: 'HEALTHCHECK ' + (ins.line.replace(/^HEALTHCHECK\s*/i, '')), mb: 0 }); return;
      }
      if (op === 'VOLUME' || op === 'LABEL') { layers.push({ by: op + ' ' + ins.rest, mb: 0 }); return; }
      // bước thực thi
      stepIdx++;
      var text, secs = 0.3, mb = 0, inputs = '';
      if (op === 'WORKDIR') { text = 'WORKDIR ' + ins.rest; secs = 0.0; }
      else if (op === 'RUN') {
        var mt = listOf(ins.flags.mount).map(function (m) { return '--mount=' + m; }).join(' ');
        text = 'RUN ' + (mt ? mt + ' ' : '') + ins.rest;
        var warm = listOf(ins.flags.mount).some(function (m) { return /type=cache/.test(String(m)) && D.cacheMounts[(/target=([^,]+)/.exec(String(m)) || [0, 'x'])[1]]; });
        secs = runTimeSec(ins.rest, warm);
        if (/\bnpm (ci|install)\b|\byarn install/.test(ins.rest)) mb = nodeModulesMB(ins.rest); else if (/npm run build|nest build|\btsc\b/.test(ins.rest)) mb = 5; else if (/apk add/.test(ins.rest)) mb = 18; else if (/apt-get install/.test(ins.rest)) mb = 120; else mb = 0.5;
        inputs = argOrder.map(function (k) { return k + '=' + argVals[k]; }).join(',');
      } else {
        // COPY / ADD
        text = op + ' ' + (ins.flags.from ? '--from=' + ins.flags.from[0] + ' ' : '') + ins.rest;
        var toks2 = ins.rest.trim().split(/\s+/), srcs2 = toks2.slice(0, -1);
        if (ins.flags.from) {
          var ft2 = stageRef(String(ins.flags.from[0])), fi2 = sizeLayers[ft2.idx]; mb = 0;
          srcs2.forEach(function (sp) { mb += /node_modules/.test(sp) ? fi2.nmFinal : /dist/.test(sp) ? 4 : 1; });
          inputs = 'from:' + (prevKeyByStage[ft2.idx] || '');
        } else {
          srcs2.forEach(function (sp) {
            if (sp === '.' || sp === './') { mb += ctxBytes / 1e6; inputs += 'ctx:' + ctxHash; }
            else { var re2 = globRe(sp.replace(/^\.\//, '').replace(/\/$/, '')); files.forEach(function (f) { var p = f.rel.split('/'), j, h = false; for (j = 1; j <= p.length; j++) if (re2.test(p.slice(0, j).join('/'))) { h = true; break; } if (h) { mb += f.size / 1e6; inputs += f.rel + ':' + hash(f.c); } }); }
          });
          secs = 0.1 + mb / 100;
        }
      }
      var nk = String(hash(key + '>' + text + '>' + inputs)); var hit = cachedChain && !!D.cache[nk];
      if (!hit) cachedChain = false;
      key = nk; D.cache[nk] = true;
      stepLines.push([' => ' + (hit ? 'CACHED ' : '') + '[' + label + stepIdx + '/' + stepTotal + '] ' + text, hit ? 0.0 : secs]);
      if (!hit) totalT += secs;
      var by = op === 'RUN' && argOrder.length ? 'RUN |' + argOrder.length + ' ' + argOrder.map(function (k) { return k + '=' + argVals[k]; }).join(' ') + ' /bin/sh -c ' + ins.rest + ' # buildkit' : op === 'RUN' ? 'RUN /bin/sh -c ' + ins.rest + ' # buildkit' : text + ' # buildkit';
      layers.push({ by: by, mb: mb });
      if (op === 'RUN') listOf(ins.flags.mount).forEach(function (m) { if (/type=cache/.test(String(m))) D.cacheMounts[(/target=([^,]+)/.exec(String(m)) || [0, 'x'])[1]] = true; });
    });
    prevKeyByStage[st.idx] = key;
    if (st === final) {
      finalLayers = layers; finalSize = (st.fromStage ? sizeLayers[st.fromStage.idx].size || 0 : st.baseMB);
      layers.forEach(function (l) { finalSize += l.mb; });
      finalEnv = envNow; finalLeak = argOrder.filter(function (k) { return layers.some(function (l) { return l.by.indexOf(k + '=') > 0; }) && /TOKEN|SECRET|PASSWORD|KEY|NPM/i.test(k) && argVals[k]; }).map(function (k) { return k + '=' + argVals[k]; });
    }
    sizeLayers[st.idx].size = (st.fromStage ? (sizeLayers[st.fromStage.idx].size || 0) : st.baseMB) + layers.reduce(function (s, l) { return s + l.mb; }, 0);
  });
  D.lastBuild = { id: null, tag: tag, cached: stepLines.filter(function (x) { return x[0].indexOf('CACHED') > 0; }).length, total: stepLines.length, ctxBytes: ctxBytes, sizeMB: finalSize, stages: P.stages.length };
  // 4) in tiến trình giống BuildKit
  var allT = totalT + ctxT + 1.4;
  var o = '[+] Building ' + allT.toFixed(1) + 's (' + (stepLines.length + 8) + '/' + (stepLines.length + 8) + ') FINISHED                                     docker:default\n';
  o += ' => [internal] load build definition from Dockerfile                          0.0s\n => => transferring dockerfile: ' + (dfNode.c.length) + 'B                                          0.0s\n';
  o += ' => [internal] load metadata for docker.io/library/' + needList[0].refR + '          1.1s\n';
  o += ' => [internal] load .dockerignore                                            0.0s\n => => transferring context: ' + (sh.fs.get(dir + '/.dockerignore') ? sh.fs.get(dir + '/.dockerignore').c.length : 2) + 'B                                                 0.0s\n';
  o += ' => [internal] load build context                                           ' + ctxT.toFixed(1) + 's\n => => transferring context: ' + (ctxBytes >= 1e6 ? (ctxBytes / 1e6).toFixed(2) + 'MB' : Math.max(1, Math.round(ctxBytes / 1e3)) + 'kB') + '                                         ' + ctxT.toFixed(1) + 's\n';
  stepLines.forEach(function (s) { var t = s[0]; o += pad(t, Math.max(46, t.length + 1)) + s[1].toFixed(1) + 's\n'; });
  var imgKey = String(prevKeyByStage[final.idx] || ''), allCached = stepLines.length > 0 && stepLines.every(function (x) { return x[0].indexOf('CACHED') >= 0; });
  D.idByKey = D.idByKey || {};
  var finalId = (allCached && D.idByKey[imgKey]) ? D.idByKey[imgKey] : hex((tag || 'x') + Date.now() + stepLines.length + imgKey, 12);
  D.idByKey[imgKey] = finalId;
  o += ' => exporting to image                                                      0.7s\n => => exporting layers                                                     0.7s\n => => writing image sha256:' + finalId + '0000000000                  0.0s\n => => naming to docker.io/library/' + (tag || 'untagged') + '                                  0.0s\n';
  // 5) đăng ký image thông qua lớp cũ (tắt đầu ra cũ)
  var c2 = Object.create(c); c2.out = function () { };
  var pa = ['build']; if (tag) pa.push('-t', tag); pa.push(ctx);
  var rc = prev(pa, c2);
  if (rc !== 0) return rc;
  c.out(o);
  if (tag) {
    var im = DK.imgs(W).filter(function (x) { var p = DK.split(tag); return x.repo === p[0] && x.tag === p[1]; })[0];
    if (im) {
      im.size = fmtMB(finalSize); im.sizeMB = finalSize; im.base = final.base; im.flavor = final.flavor; im.user = finalUser; im.stages = P.stages.length;
      im.layers = finalLayers; im.baseMB = final.baseMB; im.baseRef = final.base; im.entrypoint = finalEntry; im.cmd = finalCmd; im.health = finalHealth; im.env = finalEnv; im.leak = finalLeak;
      im.tools = toolsOfFlavor(final.flavor); im.id = finalId;
      im.hasEnv = files.some(function (f) { return /(^|\/)\.env/.test(f.rel); }) && P.stages[P.stages.length - 1].instrs.some(function (x) { return x.op === 'COPY' && /^\.\s/.test(x.rest); });
    }
  }
  return 0;
}
function parseExec(s) {
  s = String(s).trim();
  if (/^\[.*\]$/.test(s)) { try { return JSON.parse(s); } catch (e) { return s.slice(1, -1).split(',').map(function (x) { return x.trim().replace(/^["']|["']$/g, ''); }); } }
  return ['/bin/sh', '-c', s];
}
function goList(a) { return '[' + (a || []).join(' ') + ']'; }

/* ===================== image: history, inspect ===================== */
function imgOfRef(W, ref) { var p = DK.split(ref); return DK.imgs(W).filter(function (x) { return x.repo === p[0] && x.tag === p[1]; })[0]; }
function dkHistory(c, rest) {
  var sh = c.sh, W = sh.W, noTrunc = rest.indexOf('--no-trunc') >= 0, ref = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (!ref) throw new CmdErr('"docker history" requires exactly 1 argument.');
  var im = imgOfRef(W, ref); if (!im) throw new CmdErr('Error: No such image: ' + ref);
  var ly = (im.layers || []).slice(), rows = [];
  var baseMB = im.baseMB != null ? im.baseMB : 100;
  var top = ly.slice().reverse();
  top.forEach(function (l, i) { rows.push([i === 0 ? im.id : '<missing>', '2 minutes ago', l.by, l.mb > 0 ? fmtMB(l.mb).replace('MB', 'MB') : '0B', 'buildkit.dockerfile.v0']); });
  rows.push(['<missing>', '3 weeks ago', 'CMD ["node"]', '0B', ''], ['<missing>', '3 weeks ago', 'ENTRYPOINT ["docker-entrypoint.sh"]', '0B', ''], ['<missing>', '3 weeks ago', '/bin/sh -c #(nop) ADD base-rootfs.tar.xz /', fmtMB(baseMB), '']);
  var cw = noTrunc ? Math.max(20, Math.max.apply(null, rows.map(function (r) { return r[2].length; }))) : 45;
  var o = pad('IMAGE', 15) + pad('CREATED', 15) + pad('CREATED BY', cw + 3) + pad('SIZE', 10) + 'COMMENT\n';
  rows.forEach(function (r) { var by = r[2]; if (!noTrunc && by.length > cw) by = by.slice(0, cw - 3) + '...'; o += pad(r[0], 15) + pad(r[1], 15) + pad(by, cw + 3) + pad(r[3], 10) + r[4] + '\n'; });
  c.out(o); return 0;
}
function goVal(v) { return v == null ? '<nil>' : typeof v === 'string' ? v : Array.isArray(v) ? goList(v) : String(v); }
function fmtApply(fmt, vals, c) {
  var hit = false, bad = false;
  var o = fmt.replace(/\{\{\s*json\s+\.([\w.]+)\s*\}\}/g, function (m, k) { if (k in vals) { hit = true; return JSON.stringify(vals[k]); } bad = true; return m; })
    .replace(/\{\{\s*\.([\w.]+)\s*\}\}/g, function (m, k) { if (k in vals) { hit = true; return goVal(vals[k]); } bad = true; return m; });
  return (hit && !bad) ? o : null;
}
function imageInspect(c, rest) {
  var sh = c.sh, W = sh.W, fi = rest.indexOf('--format'); if (fi < 0) fi = rest.indexOf('-f');
  var fmt = fi >= 0 ? rest[fi + 1] : null, ref = rest.filter(function (x, i) { return x.charAt(0) !== '-' && i !== sk(fi); })[0];
  var im = imgOfRef(W, ref || ''); if (!im) throw new CmdErr('Error response from daemon: No such image: ' + ref);
  var hc = im.health;
  var vals = {
    'Size': Math.round((im.sizeMB || parseFloat(im.size) || 100) * 1000000), 'Config.Entrypoint': im.entrypoint || null, 'Config.Cmd': im.cmd || null, 'Config.User': im.user || '',
    'Config.Env': Object.keys(im.env || {}).map(function (k) { return k + '=' + im.env[k]; }).concat(['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin']),
    'Config.Healthcheck': hc ? { Test: ['CMD-SHELL', hc.cmd], Interval: hc.interval, Timeout: hc.timeout, Retries: hc.retries } : null,
    'RootFS.Layers': (im.layers || []).filter(function (l) { return l.mb > 0; }).map(function (l, i) { return 'sha256:' + hex(im.id + i, 16); }), 'Id': 'sha256:' + (im.id || '') + hex(im.id || 'x', 52), 'Os': 'linux', 'Architecture': 'amd64'
  };
  if (fmt) {
    var ml = /\{\{\s*len\s+\.RootFS\.Layers\s*\}\}/.exec(fmt);
    if (ml) { c.out(fmt.replace(ml[0], String(vals['RootFS.Layers'].length)) + '\n'); return 0; }
    var o = fmtApply(fmt, vals, c);
    if (o != null) {
      if (/\{\{\s*\.Config\.Healthcheck\s*\}\}/.test(fmt) && hc) o = fmt.replace(/\{\{\s*\.Config\.Healthcheck\s*\}\}/, '&{[CMD-SHELL ' + hc.cmd + '] ' + hc.interval + ' ' + hc.timeout + ' 0s ' + hc.retries + '}');
      c.out(o + '\n'); return 0;
    }
    throw new CmdErr('Template parsing error: mô phỏng chỉ hỗ trợ Size, Config.Entrypoint, Config.Cmd, Config.User, Config.Env, Config.Healthcheck, len .RootFS.Layers');
  }
  c.out('[\n    {\n        "Id": "' + vals.Id + '",\n        "RepoTags": [ "' + im.repo + ':' + im.tag + '" ],\n        "Config": {\n            "User": "' + vals['Config.User'] + '",\n            "Entrypoint": ' + JSON.stringify(vals['Config.Entrypoint']) + ',\n            "Cmd": ' + JSON.stringify(vals['Config.Cmd']) + ',\n            "Healthcheck": ' + JSON.stringify(vals['Config.Healthcheck']) + '\n        },\n        "Size": ' + vals.Size + ',\n        "RootFS": { "Layers": ' + vals['RootFS.Layers'].length + ' }\n    }\n]\n');
  return 0;
}

/* ===================== tài nguyên ===================== */
function kind(ct) {
  var im = ct.image || '';
  if (/postgres/.test(im)) return 'pg'; if (/redis/.test(im)) return 'redis'; if (/worker/.test(im + ' ' + (ct.svc || ''))) return 'worker';
  if (/^tutor-/.test(im) || /(^|\/)tutor-api/.test(im) || /^(api|gateway|backend|be)$/.test(ct.svc || '') || /^api-/.test(ct.svc || '')) return 'api'; return 'other';
}
function leaky(ct) { return kind(ct) === 'worker' && ct.env && isTrue(ct.env.MEM_LEAK); }
function peakOf(ct) { var k = kind(ct); return k === 'api' ? 256 : k === 'pg' ? 160 : k === 'redis' ? 64 : leaky(ct) ? Infinity : k === 'worker' ? 300 : 128; }
function usageOf(W, ct) {
  var k = kind(ct), base = k === 'api' ? 205.3 : k === 'pg' ? 78.4 : k === 'redis' ? 9.2 : k === 'worker' ? 41.6 : 24.0;
  if (leaky(ct)) return ct.memMB ? ct.memMB * 0.97 : 6900.0;
  if (ct.memMB) base = Math.min(base, ct.memMB * 0.9);
  return base;
}
function cpuOf(ct) { var k = kind(ct); return leaky(ct) ? 31.5 : k === 'api' ? 0.42 : k === 'pg' ? 0.21 : k === 'redis' ? 0.37 : 0.05; }
function pidsOf(ct) { var k = kind(ct); return k === 'api' ? 14 : k === 'pg' ? 8 : k === 'redis' ? 5 : k === 'worker' ? 22 : 3; }
function statsRows(W, names) {
  return W.containers.filter(function (ct) { return ct.state === 'running' && (!names.length || names.indexOf(ct.name) >= 0 || names.indexOf(ct.id) >= 0); }).map(function (ct) {
    var u = usageOf(W, ct), lim = ct.memMB || D4(W).hostMiB;
    return { ID: ct.id, Name: ct.name, CPUPerc: cpuOf(ct).toFixed(2) + '%', MemUsage: fmtMiB(u) + ' / ' + (ct.memMB ? fmtMiB(ct.memMB).replace(/\.0MiB$/, 'MiB') : '7.8GiB'), MemPerc: (u / lim * 100).toFixed(2) + '%', NetIO: '2.1MB / 1.8MB', BlockIO: '0B / 0B', PIDs: String(pidsOf(ct)), Container: ct.name };
  });
}
function dkStats(c, rest) {
  var W = c.sh.W, fi = rest.indexOf('--format'), fmt = fi >= 0 ? rest[fi + 1] : null, names = rest.filter(function (x, i) { return x.charAt(0) !== '-' && i !== sk(fi); });
  var rows = statsRows(W, names);
  if (fmt) {
    var isT = /^table /.test(fmt), f = fmt.replace(/^table\s*/, '').replace(/\\t/g, '\t');
    var hdr = f.replace(/\{\{\.(\w+)\}\}/g, function (m, k) { return ({ Name: 'NAME', ID: 'CONTAINER ID', CPUPerc: 'CPU %', MemUsage: 'MEM USAGE / LIMIT', MemPerc: 'MEM %', NetIO: 'NET I/O', BlockIO: 'BLOCK I/O', PIDs: 'PIDS', Container: 'CONTAINER' })[k] || k; });
    var body = rows.map(function (r) { return f.replace(/\{\{\.(\w+)\}\}/g, function (m, k) { return r[k] != null ? r[k] : ''; }); });
    if (isT) {
      var all = [hdr.split('\t')].concat(body.map(function (b) { return b.split('\t'); })), w = [];
      all.forEach(function (r) { r.forEach(function (x, i) { w[i] = Math.max(w[i] || 0, x.length); }); });
      c.out(all.map(function (r) { return r.map(function (x, i) { return i === r.length - 1 ? x : pad(x, w[i] + 3); }).join(''); }).join('\n') + '\n');
    } else c.out(body.join('\n') + (body.length ? '\n' : ''));
    return 0;
  }
  var all2 = [['CONTAINER ID', 'NAME', 'CPU %', 'MEM USAGE / LIMIT', 'MEM %', 'NET I/O', 'BLOCK I/O', 'PIDS']].concat(rows.map(function (r) { return [r.ID, r.Name, r.CPUPerc, r.MemUsage, r.MemPerc, r.NetIO, r.BlockIO, r.PIDs]; }));
  var w2 = []; all2.forEach(function (r) { r.forEach(function (x, i) { w2[i] = Math.max(w2[i] || 0, String(x).length); }); });
  c.out(all2.map(function (r) { return r.map(function (x, i) { return i === r.length - 1 ? x : pad(x, w2[i] + 3); }).join(''); }).join('\n') + '\n'); return 0;
}
V.dk4Free = function (sh, a) {
  var W = sh.W, total = D4(W).hostMiB, used = 1331;
  W.containers.forEach(function (ct) { if (ct.state === 'running') used += usageOf(W, ct); });
  var swapU = 0, avail;
  if (used > total - 100) { swapU = Math.min(2000, Math.round(used - (total - 100) + 900)); used = total - 140; }
  avail = Math.max(60, Math.round(total - used - 300));
  var free = Math.max(30, total - used - 1300 > 0 ? total - used - 1300 : 40), cache = 1300;
  var fl = a.join(' '), unit = /-m\b/.test(fl) ? 'm' : /-g\b/.test(fl) ? 'g' : /-h\b/.test(fl) ? 'h' : 'k';
  function f(n) { if (unit === 'm') return String(Math.round(n)); if (unit === 'g') return (n / 1024).toFixed(1); if (unit === 'h') return n >= 1024 ? (n / 1024).toFixed(1) + 'Gi' : Math.round(n) + 'Mi'; return String(Math.round(n * 1024)); }
  var w = unit === 'h' ? 11 : 12;
  return pad('', 14) + pad('total', w) + pad('used', w) + pad('free', w) + pad('shared', w) + pad('buff/cache', w) + 'available\n' +
    pad('Mem:', 14) + pad(f(total), w) + pad(f(used), w) + pad(f(free), w) + pad(f(4), w) + pad(f(cache), w) + f(avail) + '\n' +
    pad('Swap:', 14) + pad(f(2048), w) + pad(f(swapU), w) + pad(f(2048 - swapU), w) + '\n';
};
cmds.free = function (a, c) { if (!c.sh.W.dk4) return prevFree(a, c); c.out(V.dk4Free(c.sh, a)); return 0; };

/* ===================== sức khoẻ (healthcheck) ===================== */
function healthSpec(ct, W) {
  var s = ct.svcCfg || {}, hc = s.healthcheck;
  if (hc) {
    if (isTrue(hc.disable)) return null;
    var t = hc.test; if (t == null) return null;
    var txt = Array.isArray(t) ? t.join(' ') : String(t).replace(/^\[|\]$/g, '').replace(/["']/g, '').replace(/,\s*/g, ' ');
    txt = txt.replace(/^CMD-SHELL\s+|^CMD\s+/, '');
    if (/^NONE/.test(txt)) return null;
    return { cmd: txt, src: 'compose' };
  }
  var im = imgOfRef(W, ct.image || ''); if (im && im.health) return { cmd: im.health.cmd, src: 'image' };
  return null;
}
function toolsOfCt(W, ct) {
  var im = imgOfRef(W, ct.image || ''), k = kind(ct);
  if (im && im.flavor) return toolsOfFlavor(im.flavor);
  if (k === 'pg' || k === 'redis') return ['getent', 'hostname'];
  return toolsOfFlavor('full');
}
function evalHealth(W, ct) {
  var h = healthSpec(ct, W); if (!h) return null;
  var hbi = imgOfRef(W, ct.image || ''); if (hbi && hbi.bug === 'health' && kind(ct) === 'api') return { ok: false, out: '{"statusCode":500,"message":"Internal server error"}', code: 1 };
  var cmd = h.cmd, tool = (/\b(curl|wget|pg_isready|redis-cli|node)\b/.exec(cmd) || [])[1];
  var tools = toolsOfCt(W, ct);
  if ((tool === 'curl' || tool === 'wget') && tools.indexOf(tool) < 0) return { ok: false, out: 'OCI runtime exec failed: exec failed: unable to start container process: exec: "' + tool + '": executable file not found in $PATH: unknown', code: 126 };
  var pm = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/.exec(cmd);
  if (pm && kind(ct) === 'api' && +pm[1] !== 8888) return { ok: false, out: tool === 'curl' ? 'curl: (7) Failed to connect to localhost port ' + pm[1] + ' after 0 ms: Connection refused' : 'wget: can\'t connect to remote host (127.0.0.1): Connection refused', code: 1 };
  var path = (/:\d+(\/[\w\-\/]*)/.exec(cmd) || [0, '/'])[1];
  if (kind(ct) === 'api' && !/^\/(health|healthz|)?$/.test(path)) return { ok: false, out: tool === 'curl' ? 'curl: (22) The requested URL returned error: 404' : 'wget: server returned error: HTTP/1.1 404 Not Found', code: 1 };
  return { ok: true, out: '{"status":"ok"}', code: 0 };
}

/* ===================== settle: tính lại trạng thái sau mỗi lệnh ===================== */
function rebase(sh) {
  var W = sh.W;
  V.applyRules(sh); if (V.dkAfter) V.dkAfter(sh);
  syncPg(sh);
  settle(sh);
}
function settle(sh) {
  var W = sh.W, D = D4(W);
  W.containers.forEach(function (ct) {
    if (ct.state === 'exited' && ct.manualStop) return;
    if (ct.portsDecl == null) ct.portsDecl = (ct.ports || []).slice();
    ct.ports = (allInternal(W, ct) || (ct.nets || []).indexOf('none') >= 0) ? [] : ct.portsDecl;
    ct.healthInfo = null; ct.exitCode = ct.exitCode || 0;
    var oomOn = ct.memMB != null && ct.memMB < peakOf(ct);
    var k = kind(ct);
    if (oomOn && (ct.state === 'running' || ct.state === 'restarting' || ct.state === 'exited')) {
      var again = /^(unless-stopped|always|on-failure)/.test(ct.restartPolicy || '');
      ct.oomKilled = true; ct.exitCode = 137; ct.crashBy = 'dk4oom';
      ct.state = again ? 'restarting' : 'exited'; ct.status = again ? 'Restarting (137) 5 seconds ago' : 'Exited (137) 5 seconds ago';
      ct.logs = k === 'api' ? ['[Nest] LOG  [NestFactory] Starting Nest application...', '<--- Last few GCs --->', 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'] : k === 'pg' ? ['LOG:  server process (PID 41) was terminated by signal 9: Killed', 'LOG:  terminating any other active server processes'] : k === 'redis' ? ['# Out Of Memory: Killed by the kernel (cgroup)'] : ['Killed'];
      ct.memKill = k === 'api'; return;
    }
    var bim = imgOfRef(W, ct.image || '');
    if (bim && bim.bug === 'crash' && k === 'api' && (ct.state === 'running' || ct.state === 'restarting' || ct.state === 'exited') && !ct.manualStop) {
      var agb = /^(unless-stopped|always|on-failure)/.test(ct.restartPolicy || '');
      ct.crashBy = 'dk4bug'; ct.exitCode = 1; ct.state = agb ? 'restarting' : 'exited'; ct.status = agb ? 'Restarting (1) 6 seconds ago' : 'Exited (1) 6 seconds ago'; ct.ports = [];
      ct.logs = ['[Nest] LOG  [NestFactory] Starting Nest application...', 'Error: Cannot find module \'./config/database.config\'', 'Require stack:', '- /app/dist/app.module.js', '- /app/dist/main.js', '    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)', '    at Module._load (node:internal/modules/cjs/loader:1051:27)', '    at Module.require (node:internal/modules/cjs/loader:1311:19)', 'Node.js v22.9.0'];
      return;
    }
    if (ct.crashBy === 'dk4bug') ct.crashBy = null;
    ct.oomKilled = false; if (ct.crashBy === 'dk4oom') ct.crashBy = null; ct.memKill = ct.memKill && k === 'api' && ct.memMB && ct.memMB < 256;
    if (k === 'api' && ct.env) {
      var bad = null;
      ['DB_HOST', 'REDIS_HOST'].forEach(function (key) {
        var h = ct.env[key]; if (bad || !h || ct.state === 'restarting' && ct.crashBy !== 'dk4net') return;
        var tgt = W.containers.filter(function (o) { return o !== ct && aliasesOf(o).indexOf(h) >= 0 && o.proj === ct.proj; })[0];
        if (!tgt) return;
        var r = resolve(W, ct, h);
        if (!r) bad = key === 'DB_HOST' ? ['[Nest] LOG  [NestFactory] Starting Nest application...', 'Error: getaddrinfo ENOTFOUND ' + h, '    at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:109:26)', '[Nest] ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...'] : ['[Nest] LOG  [NestFactory] Starting Nest application...', '[ioredis] Unhandled error event: Error: getaddrinfo ENOTFOUND ' + h];
      });
      if (bad) { ct.crashBy = 'dk4net'; var ag = /^(unless-stopped|always|on-failure)/.test(ct.restartPolicy || ''); ct.state = ag ? 'restarting' : 'exited'; ct.exitCode = 1; ct.status = ag ? 'Restarting (1) 6 seconds ago' : 'Exited (1) 6 seconds ago'; ct.logs = bad; return; }
      if (ct.crashBy === 'dk4net') ct.crashBy = null;
    }
    if (ct.state === 'running') {
      var hv = evalHealth(W, ct);
      if (hv) { ct.healthInfo = hv; ct.status = String(ct.status).replace(/\s*\((healthy|unhealthy|health: starting)\)$/, '') + (hv.ok ? ' (healthy)' : ' (unhealthy)'); }
    }
  });
}
V.dk4Settle = rebase;

/* ===================== compose ===================== */
function composeDoc(sh, c) { try { return V.composeLoad(sh, c, null); } catch (e) { return null; } }
function composeCheck(sh, c, rest) {
  var L = composeDoc(sh, c); if (!L) return null;
  var svcs = L.doc.services || {}, topN = L.doc.networks, topV = L.doc.volumes;
  Object.keys(svcs).forEach(function (n) {
    var s = svcs[n];
    if (s.networks) {
      var names = Array.isArray(s.networks) ? s.networks : Object.keys(s.networks);
      names.forEach(function (x) { if (x === 'default' && !(topN && x in topN)) return; if (!topN || typeof topN !== 'object' || !(x in topN)) throw new CmdErr('service "' + n + '" refers to undefined network ' + x + ': invalid compose project'); });
    }
    listOf(s.volumes).forEach(function (v) {
      var m = /^([A-Za-z0-9][\w.-]*):\//.exec(String(v)); if (!m) return;
      if (!topV || typeof topV !== 'object' || !(m[1] in topV)) throw new CmdErr('service "' + n + '" refers to undefined volume ' + m[1] + ': invalid compose project');
    });
  });
  return L;
}
function composePost(sh, c, L) {
  var W = sh.W, D = D4(W), svcs = L.doc.services || {}, proj = L.project, topN = (L.doc.networks && typeof L.doc.networks === 'object') ? L.doc.networks : {}, topV = (L.doc.volumes && typeof L.doc.volumes === 'object') ? L.doc.volumes : {};
  function netFull(x) { var t = topN[x]; if (t && typeof t === 'object' && t.name) return t.name; return proj + '_' + x; }
  W.containers.filter(function (ct) { return ct.proj === proj; }).forEach(function (ct) {
    var s = ct.svcCfg || svcs[ct.svc] || {}, names;
    ct.topVols = {}; Object.keys(topV).forEach(function (k) { ct.topVols[k] = (topV[k] && typeof topV[k] === 'object') ? topV[k] : {}; });
    if (s.network_mode === 'host') names = ['host'];
    else if (s.networks) names = (Array.isArray(s.networks) ? s.networks : Object.keys(s.networks)).map(netFull);
    else names = [proj + '_default'];
    names.forEach(function (nn) {
      if (nn === 'host') return;
      var short = nn.indexOf(proj + '_') === 0 ? nn.slice(proj.length + 1) : nn, t = topN[short];
      netCreate(W, nn, { internal: t && typeof t === 'object' && isTrue(t.internal), proj: proj, subnet: t && typeof t === 'object' && t.ipam ? null : null });
    });
    ct.nets = []; ct.ips = {};
    names.forEach(function (nn) { if (nn === 'host') ct.nets.push('host'); else attach(W, ct, nn); });
    volsOf(ct).forEach(function (v) { volCreate(sh, v.name, /postgres/.test(ct.image) && v.cont === '/var/lib/postgresql/data' ? 'pg' : null, proj); });
    var cl = s.mem_limit != null ? memParse(s.mem_limit) : null;
    var dl = s.deploy && s.deploy.resources && s.deploy.resources.limits;
    if (cl == null && dl && dl.memory) cl = memParse(dl.memory);
    if (cl != null) ct.memMB = cl;
    var cpus = s.cpus || (dl && dl.cpus); if (cpus) { ct.runCfg = ct.runCfg || {}; ct.runCfg.cpus = String(cpus); }
    ct.aliases = [];
  });
  rebase(sh);
}
function composeRemoveNets(sh, proj, withVols) {
  var W = sh.W, D = D4(W);
  Object.keys(D.nets).forEach(function (k) { if (D.nets[k].proj === proj) delete D.nets[k]; });
  if (withVols) Object.keys(D.vols).forEach(function (k) { if (D.vols[k].proj === proj) volRemove(sh, k); });
}

/* ===================== docker network / volume ===================== */
function netCmd(c, rest) {
  var sh = c.sh, W = sh.W, D = D4(W), sub = rest[0], r = rest.slice(1);
  if (sub === 'ls') {
    var fi = r.indexOf('--format'), fmt = fi >= 0 ? r[fi + 1] : null, q = r.indexOf('-q') >= 0 || r.indexOf('--quiet') >= 0;
    var names = Object.keys(D.nets).sort(function (a, b) { return (D.nets[a].predefined ? 0 : 1) - (D.nets[b].predefined ? 0 : 1) || a.localeCompare(b); });
    if (q) { c.out(names.map(function (n) { return D.nets[n].id; }).join('\n') + '\n'); return 0; }
    if (fmt) { c.out(names.map(function (n) { var x = D.nets[n]; return fmt.replace(/\{\{\.(\w+)\}\}/g, function (m, k) { return ({ Name: x.name, ID: x.id, Driver: x.driver, Scope: 'local', Internal: String(x.internal) })[k] || ''; }); }).join('\n') + '\n'); return 0; }
    var o = pad('NETWORK ID', 15) + pad('NAME', 22) + pad('DRIVER', 10) + 'SCOPE\n'; names.forEach(function (n) { var x = D.nets[n]; o += pad(x.id, 15) + pad(x.name, 22) + pad(x.driver, 10) + 'local\n'; }); c.out(o); return 0;
  }
  if (sub === 'create') {
    var name = null, o2 = { driver: 'bridge', internal: false, subnet: null };
    for (var i = 0; i < r.length; i++) { var x = r[i]; if (x === '--internal') o2.internal = true; else if (x === '--driver' || x === '-d') o2.driver = r[++i]; else if (x === '--subnet') o2.subnet = r[++i]; else if (x === '--gateway' || x === '--ip-range' || x === '--label' || x === '--opt') i++; else if (x.charAt(0) !== '-') name = x; }
    if (!name) throw new CmdErr('"docker network create" requires exactly 1 argument.');
    if (D.nets[name]) throw new CmdErr('Error response from daemon: network with name ' + name + ' already exists');
    var n = netCreate(W, name, o2); c.out(hex(name + 'full', 12) + hex(name, 12) + hex(name + 'z', 12).slice(0, 4) + '\n'); return 0;
  }
  if (sub === 'rm') {
    var rc = 0;
    r.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (nm) {
      var x = D.nets[nm]; if (!x) { c.err('Error response from daemon: network ' + nm + ' not found\n'); rc = 1; return; }
      if (x.predefined) { c.err('Error response from daemon: ' + nm + ' is a pre-defined network and cannot be removed\n'); rc = 1; return; }
      var inUse = W.containers.filter(function (ct) { return (ct.nets || []).indexOf(nm) >= 0; });
      if (inUse.length) { c.err('Error response from daemon: error while removing network: network ' + nm + ' id ' + x.id + hex(nm, 52) + ' has active endpoints\n'); rc = 1; return; }
      delete D.nets[nm]; c.out(nm + '\n');
    });
    return rc;
  }
  if (sub === 'prune') {
    var rem = []; Object.keys(D.nets).forEach(function (k) { var x = D.nets[k]; if (x.predefined) return; if (!W.containers.some(function (ct) { return (ct.nets || []).indexOf(k) >= 0; })) { rem.push(k); delete D.nets[k]; } });
    if (r.indexOf('-f') < 0 && r.indexOf('--force') < 0) { c.out('WARNING! This will remove all custom networks not used by at least one container.\nAre you sure you want to continue? [y/N] '); return 0; }
    c.out('Deleted Networks:\n' + rem.join('\n') + (rem.length ? '\n' : '')); return 0;
  }
  if (sub === 'connect' || sub === 'disconnect') {
    var pos = r.filter(function (x, i) { return x.charAt(0) !== '-' && (r[i - 1] !== '--alias' && r[i - 1] !== '--ip'); });
    var nname = pos[0], cname = pos[1]; if (!nname || !cname) throw new CmdErr('"docker network ' + sub + '" requires exactly 2 arguments.');
    var net = D.nets[nname]; if (!net) throw new CmdErr('Error response from daemon: network ' + nname + ' not found');
    var ct = findCt(W, cname); if (!ct) throw new CmdErr('Error response from daemon: No such container: ' + cname);
    if (sub === 'connect') {
      if ((ct.nets || []).indexOf(nname) >= 0) throw new CmdErr('Error response from daemon: endpoint with name ' + ct.name + ' already exists in network ' + nname);
      attach(W, ct, nname); var al = r.indexOf('--alias'); if (al >= 0) { ct.aliases = ct.aliases || []; ct.aliases.push(r[al + 1]); }
    } else {
      if ((ct.nets || []).indexOf(nname) < 0) throw new CmdErr('Error response from daemon: container ' + ct.id + ' is not connected to network ' + nname);
      detach(W, ct, nname);
    }
    rebase(sh); return 0;
  }
  if (sub === 'inspect') {
    var fi2 = r.indexOf('--format'); if (fi2 < 0) fi2 = r.indexOf('-f');
    var fmt2 = fi2 >= 0 ? r[fi2 + 1] : null, nm2 = r.filter(function (x, i) { return x.charAt(0) !== '-' && i !== sk(fi2); })[0];
    var x2 = D.nets[nm2]; if (!x2) throw new CmdErr('Error response from daemon: network ' + nm2 + ' not found');
    var cs = W.containers.filter(function (ct) { return (ct.nets || []).indexOf(nm2) >= 0; });
    if (fmt2) {
      var rg = /\{\{\s*range\s+\.Containers\s*\}\}(.*?)\{\{\s*end\s*\}\}/.exec(fmt2);
      var s2 = fmt2;
      if (rg) s2 = s2.replace(rg[0], cs.map(function (ct) { return rg[1].replace(/\{\{\s*\.Name\s*\}\}/g, ct.name).replace(/\{\{\s*\.IPv4Address\s*\}\}/g, (ct.ips[nm2] || '') + '/16'); }).join(''));
      s2 = s2.replace(/\{\{\s*\.Name\s*\}\}/g, x2.name).replace(/\{\{\s*\.Driver\s*\}\}/g, x2.driver).replace(/\{\{\s*\.Internal\s*\}\}/g, String(x2.internal)).replace(/\{\{\s*\(index \.IPAM\.Config 0\)\.Subnet\s*\}\}/g, x2.subnet).replace(/\{\{\s*\(index \.IPAM\.Config 0\)\.Gateway\s*\}\}/g, x2.gw).replace(/\{\{\s*json \.Containers\s*\}\}/g, JSON.stringify(cs.reduce(function (m, ct) { m[ct.id] = { Name: ct.name, IPv4Address: ct.ips[nm2] + '/16' }; return m; }, {})));
      if (/\{\{/.test(s2)) throw new CmdErr('Template parsing error: mô phỏng hỗ trợ .Name, .Driver, .Internal, range .Containers, (index .IPAM.Config 0).Subnet');
      c.out(s2 + '\n'); return 0;
    }
    c.out('[\n    {\n        "Name": "' + x2.name + '",\n        "Id": "' + x2.id + hex(nm2, 52) + '",\n        "Driver": "' + x2.driver + '",\n        "Internal": ' + x2.internal + ',\n        "IPAM": { "Config": [ { "Subnet": "' + x2.subnet + '", "Gateway": "' + x2.gw + '" } ] },\n        "Containers": {\n' + cs.map(function (ct) { return '            "' + ct.id + hex(ct.name, 52) + '": { "Name": "' + ct.name + '", "IPv4Address": "' + ct.ips[nm2] + '/16" }'; }).join(',\n') + '\n        }\n    }\n]\n'); return 0;
  }
  throw new CmdErr('Mô phỏng: docker network hỗ trợ ls, create, rm, prune, connect, disconnect, inspect');
}
function volCmd(c, rest) {
  var sh = c.sh, W = sh.W, D = D4(W), sub = rest[0], r = rest.slice(1);
  if (sub === 'ls') {
    var q = r.indexOf('-q') >= 0 || r.indexOf('--quiet') >= 0, fi = r.indexOf('--format'), fmt = fi >= 0 ? r[fi + 1] : null, fl = r.indexOf('-f') >= 0 ? r[r.indexOf('-f') + 1] : (r.indexOf('--filter') >= 0 ? r[r.indexOf('--filter') + 1] : null);
    var names = Object.keys(D.vols).sort();
    if (fl && /dangling=true/.test(fl)) names = names.filter(function (n) { return !volUsedBy(W, n).length; });
    if (fl && /dangling=false/.test(fl)) names = names.filter(function (n) { return volUsedBy(W, n).length; });
    if (q) { c.out(names.join('\n') + (names.length ? '\n' : '')); return 0; }
    if (fmt) { c.out(names.map(function (n) { return fmt.replace(/\{\{\.(\w+)\}\}/g, function (m, k) { return ({ Name: n, Driver: 'local', Mountpoint: volDir(n).replace('/_data', '/_data') })[k] || ''; }); }).join('\n') + (names.length ? '\n' : '')); return 0; }
    c.out('DRIVER    VOLUME NAME\n' + names.map(function (n) { return 'local     ' + n + '\n'; }).join('')); return 0;
  }
  if (sub === 'create') {
    var nm = r.filter(function (x) { return x.charAt(0) !== '-'; })[0] || hex('anon' + Date.now(), 64);
    volCreate(sh, nm, null, null); c.out(nm + '\n'); return 0;
  }
  if (sub === 'inspect') {
    var fi2 = r.indexOf('--format'); if (fi2 < 0) fi2 = r.indexOf('-f');
    var fmt2 = fi2 >= 0 ? r[fi2 + 1] : null, nm2 = r.filter(function (x, i) { return x.charAt(0) !== '-' && i !== sk(fi2); })[0];
    var v = D.vols[nm2]; if (!v) throw new CmdErr('Error response from daemon: get ' + nm2 + ': no such volume');
    if (fmt2) { c.out(fmt2.replace(/\{\{\s*\.(\w+)\s*\}\}/g, function (m, k) { return ({ Name: nm2, Driver: 'local', Mountpoint: volDir(nm2).replace('/_data', '') + '/_data', Scope: 'local', CreatedAt: v.created })[k] || ''; }) + '\n'); return 0; }
    c.out('[\n    {\n        "CreatedAt": "' + v.created + '",\n        "Driver": "local",\n        "Labels": ' + (v.proj ? '{ "com.docker.compose.project": "' + v.proj + '" }' : 'null') + ',\n        "Mountpoint": "' + volDir(nm2) + '",\n        "Name": "' + nm2 + '",\n        "Options": null,\n        "Scope": "local"\n    }\n]\n'); return 0;
  }
  if (sub === 'rm') {
    var rc = 0;
    r.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (n) {
      if (!D.vols[n]) { c.err('Error response from daemon: get ' + n + ': no such volume\n'); rc = 1; return; }
      var us = volUsedBy(W, n);
      if (us.length && r.indexOf('-f') < 0) { c.err('Error response from daemon: remove ' + n + ': volume is in use - [' + us.map(function (u) { return u.id + hex(u.name, 52); }).join(', ') + ']\n'); rc = 1; return; }
      volRemove(sh, n); c.out(n + '\n');
    });
    return rc;
  }
  if (sub === 'prune') {
    var all = r.indexOf('-a') >= 0 || r.indexOf('--all') >= 0, force = r.indexOf('-f') >= 0 || r.indexOf('--force') >= 0;
    if (!force) { c.out('WARNING! This will remove ' + (all ? 'all local volumes' : 'anonymous local volumes') + ' not used by at least one container.\nAre you sure you want to continue? [y/N] '); return 0; }
    var del = [], bytes = 0;
    Object.keys(D.vols).forEach(function (n) { if (volUsedBy(W, n).length) return; var anon = /^[0-9a-f]{64}$/.test(n); if (!anon && !all) return; bytes += volSize(sh, n); volRemove(sh, n); del.push(n); });
    c.out('Deleted Volumes:\n' + del.join('\n') + (del.length ? '\n' : '') + '\nTotal reclaimed space: ' + (bytes ? fmtMB(bytes / 1e6) : '0B') + '\n'); syncPg(sh); return 0;
  }
  throw new CmdErr('Mô phỏng: docker volume hỗ trợ ls, create, inspect, rm, prune');
}

/* ===================== docker run ===================== */
var RUN_VAL = { '-v': 1, '--volume': 1, '-e': 1, '--env': 1, '-w': 1, '--workdir': 1, '-u': 1, '--user': 1, '--name': 1, '--network': 1, '--net': 1, '-p': 1, '--publish': 1, '--entrypoint': 1, '-m': 1, '--memory': 1, '--cpus': 1, '--restart': 1, '--mount': 1, '--network-alias': 1, '--health-cmd': 1, '--health-interval': 1, '--health-timeout': 1, '--health-retries': 1, '--memory-reservation': 1, '--memory-swap': 1, '--hostname': 1, '-h': 1, '--label': 1, '-l': 1, '--pids-limit': 1, '--cap-drop': 1, '--cap-add': 1, '--security-opt': 1, '--tmpfs': 1, '--env-file': 1 };
function parseRun(sh, rest) {
  var o = { flags: {}, vols: [], mounts: [], env: {}, image: null, args: [], rm: false, d: false, user: null, workdir: null, entry: null, net: null, name: null, alias: [], mem: null, cpus: null, health: {} };
  for (var i = 0; i < rest.length; i++) {
    var x = rest[i], eq = x.indexOf('='), nm = x, inl = null;
    if (x.indexOf('--') === 0 && eq > 0) { nm = x.slice(0, eq); inl = x.slice(eq + 1); }
    if (o.image) { o.args.push(x); continue; }
    if (nm === '--rm') { o.rm = true; continue; } if (nm === '-d' || nm === '--detach') { o.d = true; continue; }
    if (/^-(it|ti|i|t)$/.test(nm) || nm === '--init' || nm === '--read-only' || nm === '--privileged' || nm === '--oom-kill-disable') { if (nm === '--read-only') o.flags.readOnly = true; continue; }
    if (RUN_VAL[nm]) {
      var v = inl != null ? inl : rest[++i];
      if (nm === '-v' || nm === '--volume') o.vols.push(v); else if (nm === '--mount') o.mounts.push(v);
      else if (nm === '-e' || nm === '--env') { var q = v.indexOf('='); if (q > 0) o.env[v.slice(0, q)] = v.slice(q + 1); }
      else if (nm === '-w' || nm === '--workdir') o.workdir = v; else if (nm === '-u' || nm === '--user') o.user = v; else if (nm === '--entrypoint') o.entry = v;
      else if (nm === '--network' || nm === '--net') o.net = v; else if (nm === '--name') o.name = v; else if (nm === '--network-alias') o.alias.push(v);
      else if (nm === '-m' || nm === '--memory') o.mem = v; else if (nm === '--cpus') o.cpus = v;
      else if (nm === '--health-cmd') o.health.cmd = v; else if (nm === '--health-interval') o.health.interval = v;
      continue;
    }
    if (x.charAt(0) === '-') continue;
    o.image = x;
  }
  return o;
}
function mountsOf(sh, o) {
  var out = [];
  o.vols.forEach(function (v) {
    var m = /^([^:]+):(\/[^:]*)(?::(\w+))?$/.exec(v); if (!m) return;
    var named = !/^[\/.~]/.test(m[1]); out.push({ src: m[1], cont: m[2], named: named, ro: m[3] === 'ro', host: named ? volDir(m[1]) : sh.abs(m[1]) });
  });
  o.mounts.forEach(function (s) {
    var kv = {}; s.split(',').forEach(function (p) { var q = p.split('='); kv[q[0]] = q[1]; });
    var src = kv.src || kv.source, dst = kv.dst || kv.target || kv.destination; if (!src || !dst) return;
    var named = (kv.type || 'volume') === 'volume'; out.push({ src: src, cont: dst, named: named, ro: kv.readonly != null || kv.ro != null, host: named ? volDir(src) : sh.abs(src) });
  });
  return out;
}
function runPre(c, o, mounts) {
  var sh = c.sh, W = sh.W, D = D4(W);
  if (o.net && o.net !== 'host' && o.net !== 'none' && !D.nets[o.net] && o.net.indexOf('container:') !== 0) { var e = new CmdErr('docker: Error response from daemon: network ' + o.net + ' not found.', 125); throw e; }
  mounts.forEach(function (m) { if (m.named && !D.vols[m.src]) volCreate(sh, m.src, null, null); else if (!m.named && !sh.fs.get(m.host)) { sh.fs.mkdirp(m.host, 'root', 493); } });
}
function dkRun(a, c) {
  var sh = c.sh, W = sh.W, rest = a.slice(1), o = parseRun(sh, rest), mounts = mountsOf(sh, o);
  if (!o.image) return prev(a, c);
  var ephemeral = o.rm && !o.d;
  runPre(c, o, mounts);
  if (ephemeral) return ephRun(c, o, mounts);
  // chạy nền / foreground bình thường: loại bỏ cờ lạ rồi giao cho lớp dưới
  var keep = [], skip = { '--entrypoint': 1, '--network-alias': 1, '--health-interval': 1, '--health-timeout': 1, '--health-retries': 1, '--memory-reservation': 1, '--label': 1, '-l': 1, '--mount': 1, '--env-file': 1, '--restart': 0 };
  var seenImg = false;
  for (var i = 0; i < rest.length; i++) {
    var x = rest[i];
    if (seenImg) { keep.push(x); continue; }
    var nm = x.indexOf('--') === 0 && x.indexOf('=') > 0 ? x.slice(0, x.indexOf('=')) : x;
    if (skip[nm]) { if (nm === x) i++; continue; }
    if (nm === '--rm') continue;
    keep.push(x);
    if (RUN_VAL[nm] && nm === x) { keep.push(rest[++i]); continue; }
    if (x.charAt(0) !== '-') seenImg = true;
  }
  var rc = prev(['run'].concat(keep), c);
  if (rc !== 0) return rc;
  var ct = findCt(W, o.name || 'quirky_turing');
  if (ct) {
    ct.restartPolicy = (rest.indexOf('--restart') >= 0 ? rest[rest.indexOf('--restart') + 1] : '') || ct.restartPolicy;
    ct.runCfg = ct.runCfg || {}; ct.runCfg.vols = (ct.runCfg.vols || []).concat(o.vols);
    if (o.health.cmd) { ct.svcCfg = ct.svcCfg || {}; ct.svcCfg.healthcheck = { test: o.health.cmd }; }
    ct.nets = []; ct.ips = {}; attach(W, ct, o.net && o.net.indexOf('container:') !== 0 ? o.net : 'bridge'); ct.aliases = o.alias.slice();
    if (o.mem) { var mm = memParse(o.mem); if (mm != null) ct.memMB = mm; }
    if (o.cpus) ct.runCfg.cpus = o.cpus;
    mounts.forEach(function (m) { if (m.named && ct.runCfg.vols.indexOf(m.src + ':' + m.cont) < 0 && !o.vols.some(function (v) { return v.indexOf(m.src + ':') === 0; })) ct.runCfg.vols.push(m.src + ':' + m.cont); });
    if (o.entry) ct.entrypointOverride = o.entry;
    rebase(sh);
  }
  return rc;
}

/* ---- chạy tạm (--rm) ---- */
function secT(W) { W.sec = W.sec || {}; W.sec.tars = W.sec.tars || {}; return W.sec.tars; }
function ownerOf(user) { var u = String(user || 'root').split(':')[0]; return u === 'root' || u === '0' ? 'root' : u; }
function ephRun(c, o, mounts) {
  var sh = c.sh, W = sh.W, image = o.image;
  if (!DK.has(W, image)) { var ps = DK.split(image); if (/^tutor-/.test(ps[0])) throw new CmdErr("Unable to find image '" + image + "' locally\ndocker: Error response from daemon: pull access denied for " + ps[0] + ", repository does not exist or may require 'docker login'.", 125); if (!baseInfo(image)) throw new CmdErr("Unable to find image '" + image + "' locally\ndocker: Error response from daemon: pull access denied for " + ps[0] + ", repository does not exist or may require 'docker login'.", 125); DK.pullImg(c, W, image); }
  var im = imgOfRef(W, image) || {}, local = {}, user = ownerOf(o.user || im.user), wd = o.workdir || (/^tutor-/.test(image) ? '/app' : '/');
  var entry = o.entry != null ? [o.entry] : (im.entrypoint || []);
  var args = o.args.length ? o.args : (o.entry != null ? [] : (im.cmd || (/^tutor-/.test(image) ? [] : (/alpine|busybox/.test(image) ? ['/bin/sh'] : []))));
  var cmd = entry.concat(args);
  if (!cmd.length) { c.out('(mô phỏng) Container thoát ngay vì không có lệnh nào để chạy.\n'); return 0; }
  function tr(p) {
    if (p.charAt(0) !== '/') p = (wd === '/' ? '' : wd) + '/' + p;
    p = p.replace(/\/\.\//g, '/').replace(/\/\.$/, '') || '/';
    var best = null; mounts.forEach(function (m) { if ((p === m.cont || p.indexOf(m.cont.replace(/\/$/, '') + '/') === 0) && (!best || m.cont.length > best.cont.length)) best = m; });
    if (!best) return { local: p };
    return { host: best.host + p.slice(best.cont.length), ro: best.ro, m: best };
  }
  function canR(n) { if (user === 'root') return true; var bits = n.mode || 420; return n.owner === user ? (bits & 256) : (bits & 4); }
  var rc = 0;
  function run1(argv) {
    var prog = argv[0], a = argv.slice(1);
    if (prog === 'sh' || prog === '/bin/sh' || prog === 'bash' || prog === 'ash') {
      if (a[0] === '-c' && a[1] != null) {
        var parts = a[1].split(/\s*&&\s*|\s*;\s*/), r2 = 0;
        for (var pi = 0; pi < parts.length; pi++) {
          var t = parts[pi].trim(); if (!t) continue;
          var tok = t.split(/\s+/);
          var red = /^echo\s+(.*?)\s*>\s*(\S+)$/.exec(t);
          if (tok[0] === 'cd') { wd = tr(tok[1]).host ? tok[1] : tok[1]; continue; }
          if (red) { var tp = tr(red[2]); if (tp.host) { if (tp.ro) { c.err('sh: can\'t create ' + red[2] + ': Read-only file system\n'); return 1; } sh.fs.put(tp.host, red[1].replace(/^["']|["']$/g, '') + '\n', { owner: user }); } continue; }
          r2 = run1(tok); if (r2 !== 0) return r2;
        }
        return r2;
      }
      c.out('(mô phỏng) Không mở được phiên tương tác trong khung này. Hãy chạy từng lệnh, ví dụ: docker run --rm -v VOL:/data alpine ls /data\n'); return 0;
    }
    if (prog === 'echo') { c.out(a.join(' ') + '\n'); return 0; }
    if (prog === 'pwd') { c.out(wd + '\n'); return 0; }
    if (prog === 'id') { var uid = user === 'root' ? 0 : (/^\d+$/.test(user) ? +user : 1000), un = user === 'root' ? 'root' : (user === 'node' || uid === 1000 ? 'node' : ''), nn = un ? '(' + un + ')' : ''; c.out('uid=' + uid + nn + ' gid=' + uid + nn + ' groups=' + uid + nn + '\n'); return 0; }
    if (prog === 'whoami') { c.out((user === 'root' ? 'root' : user) + '\n'); return 0; }
    if (prog === 'hostname') { c.out(hex(image + 'host', 12) + '\n'); return 0; }
    if (prog === 'node') {
      if (a[0] === '-v') { c.out((/node:18/.test(im.base || image) ? 'v18.20.4' : 'v22.9.0') + '\n'); return 0; }
      if ((a[0] === '-e' || a[0] === '-p') && a[1]) {
        var ex = a[1], mm = ex.match(/^console\.log\((.*)\)$/), inner = mm ? mm[1] : (a[0] === '-p' ? ex : null);
        if (inner != null && /^[\d\s+\-*\/().]+$/.test(inner)) { var val; try { val = Function('return (' + inner + ')')(); } catch (e2) { val = null; } if (val != null) { c.out(String(val) + '\n'); return 0; } }
        if (inner != null && /^(['"])(.*)\1$/.test(inner)) { c.out(inner.slice(1, -1) + '\n'); return 0; }
        if (/process\.version/.test(ex)) { c.out('v22.9.0\n'); return 0; }
        if (/process\.getuid/.test(ex)) { c.out((user === 'root' ? 0 : 1000) + '\n'); return 0; }
        c.out('undefined\n'); return 0;
      }
      var sc = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
      if (sc && !/^(dist\/main(\.js)?)$/.test(sc)) { c.err('node:internal/modules/cjs/loader:1228\n  throw err;\n  ^\n\nError: Cannot find module \'' + wd.replace(/\/$/, '') + '/' + sc + '\'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)\n\nNode.js v22.9.0\n'); return 1; }
      c.out('[Nest] 1  - 10/27/2026, 9:20:11 AM     LOG [NestFactory] Starting Nest application...\n[Nest] 1  - 10/27/2026, 9:20:12 AM     LOG [NestApplication] Nest application successfully started\n(mô phỏng) Ứng dụng chạy ở foreground; kết thúc sau khi nhấn Ctrl+C\n'); return 0;
    }
    if (prog === 'ls') {
      var long = a.some(function (x) { return /^-\w*l/.test(x); }), all = a.some(function (x) { return /^-\w*a/.test(x); }), ps = a.filter(function (x) { return x.charAt(0) !== '-'; }); if (!ps.length) ps = ['.'];
      var rc3 = 0;
      ps.forEach(function (p) {
        var t = tr(p);
        if (!t.host) { c.err("ls: " + p + ": No such file or directory\n"); rc3 = 1; return; }
        var n = sh.fs.get(t.host); if (!n) { c.err("ls: " + p + ": No such file or directory\n"); rc3 = 1; return; }
        if (n.t === 'f') { c.out((long ? '-rw-r--r--    1 ' + n.owner + ' ' + n.owner + '  ' + pad(String(sh.fs.size(t.host)), 8, true) + ' Oct 27 09:20 ' : '') + p + '\n'); return; }
        if (!canR(n)) { c.err("ls: can't open '" + p + "': Permission denied\n"); rc3 = 1; return; }
        var nm = sh.fs.list(t.host); if (ps.length > 1) c.out(p + ':\n');
        if (long) { c.out('total ' + nm.length * 4 + '\n'); (all ? ['.', '..'] : []).forEach(function (d) { c.out('drwxr-xr-x    2 root     root          4096 Oct 27 09:20 ' + d + '\n'); }); nm.forEach(function (x) { var cn = sh.fs.get(t.host + '/' + x); var isD = cn && cn.t === 'd'; c.out((isD ? 'drwx------' : '-rw-------') + '    1 ' + pad(cn.owner, 8) + ' ' + pad(cn.owner, 8) + pad(String(isD ? 4096 : sh.fs.size(t.host + '/' + x)), 10, true) + ' Oct 27 09:20 ' + x + '\n'); }); }
        else c.out(nm.join('  ') + (nm.length ? '\n' : ''));
      });
      return rc3;
    }
    if (prog === 'cat') {
      var rc4 = 0; a.forEach(function (p) { var t = tr(p); var n = t.host && sh.fs.get(t.host); if (!n || n.t !== 'f') { c.err('cat: can\'t open \'' + p + '\': No such file or directory\n'); rc4 = 1; return; } if (!canR(n)) { c.err('cat: can\'t open \'' + p + '\': Permission denied\n'); rc4 = 1; return; } c.out(n.c); }); return rc4;
    }
    if (prog === 'du') {
      var ps2 = a.filter(function (x) { return x.charAt(0) !== '-'; }); if (!ps2.length) ps2 = ['.']; ps2.forEach(function (p) { var t = tr(p); if (!t.host || !sh.fs.get(t.host)) { c.err('du: ' + p + ': No such file or directory\n'); rc = 1; return; } var b = sh.fs.size(t.host); c.out(hs(b) + '\t' + p + '\n'); }); return rc;
    }
    if (prog === 'mkdir') { a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) { var t = tr(p); if (t.host) { if (t.ro) { c.err('mkdir: can\'t create directory \'' + p + '\': Read-only file system\n'); rc = 1; return; } sh.fs.mkdirp(t.host, user); } }); return rc; }
    if (prog === 'touch') { a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) { var t = tr(p); if (t.host) { if (t.ro) { c.err('touch: ' + p + ': Read-only file system\n'); rc = 1; return; } if (!sh.fs.get(t.host)) sh.fs.put(t.host, '', { owner: user }); } }); return rc; }
    if (prog === 'rm') {
      var rf = a.some(function (x) { return /^-\w*r/.test(x); }); a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) {
        var star = /\/\*$/.test(p), t = tr(p.replace(/\/\*$/, ''));
        if (!t.host) return; if (t.ro) { c.err('rm: can\'t remove \'' + p + '\': Read-only file system\n'); rc = 1; return; }
        if (star) { sh.fs.list(t.host).forEach(function (x) { sh.fs.rm(t.host + '/' + x); }); } else sh.fs.rm(t.host);
      }); return rc;
    }
    if (prog === 'cp') {
      var ps3 = a.filter(function (x) { return x.charAt(0) !== '-'; }), s = tr(ps3[0]), d = tr(ps3[1]);
      if (!s.host || !d.host || !sh.fs.get(s.host)) { c.err('cp: can\'t stat \'' + ps3[0] + '\': No such file or directory\n'); return 1; }
      if (d.ro) { c.err('cp: can\'t create \'' + ps3[1] + '\': Read-only file system\n'); return 1; }
      var base = s.host; Object.keys(sh.fs.n).forEach(function (k) { if (k === base || k.indexOf(base + '/') === 0) { var nn = JSON.parse(JSON.stringify(sh.fs.n[k])); sh.fs.n[d.host + k.slice(base.length)] = nn; } }); return 0;
    }
    if (prog === 'chown') {
      var ps4 = a.filter(function (x) { return x.charAt(0) !== '-'; }), own = (ps4[0] || '').split(':')[0], tgt = tr(ps4[1] || '.');
      if (!tgt.host || !sh.fs.get(tgt.host)) { c.err('chown: ' + ps4[1] + ': No such file or directory\n'); return 1; }
      if (tgt.ro) { c.err('chown: ' + ps4[1] + ': Read-only file system\n'); return 1; }
      Object.keys(sh.fs.n).forEach(function (k) { if (k === tgt.host || k.indexOf(tgt.host + '/') === 0) sh.fs.n[k].owner = own; }); return 0;
    }
    if (prog === 'tar') {
      var flags = '', pa = [], dirI = -1, dir = null, i3;
      for (i3 = 0; i3 < a.length; i3++) { if (/^-?[cxtzvfjpa]+$/.test(a[i3]) && !flags) flags = a[i3].replace('-', ''); else if (a[i3] === '-C') { dir = a[++i3]; } else pa.push(a[i3]); }
      if (!flags) { c.err('tar: You must specify one of the \'-Acdtrux\' options\n'); return 1; }
      var arch = pa.shift(); if (!arch) { c.err('tar: Refusing to read archive contents from terminal (missing -f option?)\n'); return 1; }
      var at = tr(arch), tars = secT(W);
      if (flags.indexOf('c') >= 0) {
        var bt = tr(dir || wd), srcPaths = pa.length ? pa : ['.'], snap = [], bytes = 0, denied = false;
        if (!bt.host || !sh.fs.get(bt.host)) { c.err('tar: ' + (dir || wd) + ': Cannot chdir: No such file or directory\n'); return 1; }
        srcPaths.forEach(function (sp) {
          var root = sp === '.' || sp === './' ? bt.host : bt.host + '/' + sp.replace(/^\.\//, '');
          if (!sh.fs.get(root)) { c.err('tar: ' + sp + ': Cannot stat: No such file or directory\n'); denied = true; return; }
          Object.keys(sh.fs.n).sort().forEach(function (k) {
            if (k !== root && k.indexOf(root + '/') !== 0) return;
            var nn = sh.fs.n[k];
            if (!canR(nn)) { c.err('tar: ./' + k.slice(bt.host.length + 1) + ': Cannot open: Permission denied\n'); denied = true; return; }
            if (k === bt.host) return;
            snap.push({ p: '/' + k.slice(bt.host.length + 1), n: JSON.parse(JSON.stringify(nn)) }); if (nn.t === 'f') bytes += sh.fs.size(k);
          });
        });
        if (flags.indexOf('v') >= 0) snap.forEach(function (s) { c.out('.' + s.p + (s.n.t === 'd' ? '/' : '') + '\n'); });
        if (at.host) { if (at.ro) { c.err('tar: ' + arch + ': Cannot open: Read-only file system\n'); return 2; } tars[at.host] = snap; sh.fs.put(at.host, 'gzip compressed data (mô phỏng): ' + snap.length + ' mục\n', { owner: user, size: Math.max(1024, Math.round(bytes / 3)) }); }
        return denied ? 2 : 0;
      }
      var snapx = at.host && tars[at.host];
      if (!snapx) { c.err('tar: ' + arch + ': Cannot open: No such file or directory\n'); return 2; }
      if (flags.indexOf('t') >= 0) { c.out(snapx.map(function (s) { return '.' + s.p + (s.n.t === 'd' ? '/' : ''); }).join('\n') + '\n'); return 0; }
      if (flags.indexOf('x') >= 0) {
        var xt = tr(dir || wd); if (!xt.host) return 0; if (xt.ro) { c.err('tar: ' + (dir || wd) + ': Cannot open: Read-only file system\n'); return 2; }
        sh.fs.mkdirp(xt.host, user, 493);
        snapx.forEach(function (s) {
          var dest = xt.host + s.p;
          if (s.n.t === 'd') sh.fs.mkdirp(dest, user === 'root' ? s.n.owner : user, s.n.mode); else sh.fs.put(dest, s.n.c, { owner: user === 'root' ? s.n.owner : user, mode: s.n.mode, size: s.n.size });
          if (flags.indexOf('v') >= 0) c.out('.' + s.p + '\n');
        });
        return 0;
      }
      return 1;
    }
    c.err('docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: exec: "' + prog + '": executable file not found in $PATH: unknown.\n'); return 127;
  }
  return run1(cmd);
}

/* ===================== docker exec bổ sung ===================== */
function parseHostPort(url) {
  var m = /^(?:(\w+):\/\/)?([^\/:]+)(?::(\d+))?(\/.*)?$/.exec(url); if (!m) return null;
  return { scheme: m[1] || 'http', host: m[2], port: m[3] ? +m[3] : (m[1] === 'https' ? 443 : 80), path: m[4] || '/' };
}
function execExtra(c, rest) {
  var sh = c.sh, W = sh.W, args = [], user = null, i;
  for (i = 0; i < rest.length; i++) {
    var x = rest[i];
    if (args.length === 0 && /^-(it|ti|i|t|T|d)$/.test(x)) continue;
    if (args.length === 0 && (x === '-u' || x === '--user')) { user = rest[++i]; continue; }
    if (args.length === 0 && (x === '-e' || x === '--env' || x === '-w' || x === '--workdir')) { i++; continue; }
    if (args.length === 0 && x.charAt(0) === '-') continue;
    args.push(x);
  }
  var ct = findCt(W, args[0] || ''); if (!ct) return undefined;
  if (ct.state !== 'running') return undefined;
  var cmd = args.slice(1);
  if ((cmd[0] === 'sh' || cmd[0] === 'bash' || cmd[0] === 'ash') && cmd[1] === '-c' && cmd[2]) cmd = cmd[2].trim().split(/\s+/);
  var prog = cmd[0], a = cmd.slice(1), tools = toolsOfCt(W, ct), im = imgOfRef(W, ct.image || '');
  var distroless = im && im.flavor === 'distroless';
  function notFound(p) { c.err('OCI runtime exec failed: exec failed: unable to start container process: exec: "' + p + '": executable file not found in $PATH: unknown\n'); return 126; }
  if (distroless && prog !== 'node') return notFound(prog);
  var NET = ['ping', 'wget', 'curl', 'nc', 'nslookup', 'getent', 'hostname'];
  if (NET.indexOf(prog) >= 0 && tools.indexOf(prog) < 0) return notFound(prog);
  function internetOk() { return (ct.nets || []).some(function (n) { var x = D4(W).nets[n]; return x && !x.internal && n !== 'none'; }); }
  function lookup(host) {
    var r = resolve(W, ct, host); if (r) return r;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    if (/\./.test(host) && internetOk()) return { ct: null, ip: '93.184.216.' + (hash(host) % 200 + 10), net: null, ext: true };
    return null;
  }
  function badAddr(tool, host) {
    if (tool === 'curl') { c.err('curl: (6) Could not resolve host: ' + host + '\n'); return 6; }
    if (tool === 'wget') { c.err('wget: bad address \'' + host + '\'\n'); return 1; }
    c.err(tool + ': bad address \'' + host + '\'\n'); return 1;
  }
  if (prog === 'hostname') { if (a[0] === '-i') { c.out((ct.ips && ct.ips[(ct.nets || [])[0]]) || '172.17.0.2'); c.out('\n'); } else c.out(ct.id + '\n'); return 0; }
  if (prog === 'getent') { if (a[0] !== 'hosts' || !a[1]) return 2; var rg = resolve(W, ct, a[1]); if (!rg) return 2; c.out(pad(rg.ip, 16) + a[1] + '\n'); return 0; }
  if (prog === 'nslookup') {
    var h = a[0]; if (!h) { c.err('BusyBox: nslookup: missing host\n'); return 1; }
    var rl = lookup(h); var userDef = userNets(W, ct).length > 0;
    if (!rl) { c.out('Server:\t\t' + (userDef ? '127.0.0.11' : '1.1.1.1') + '\nAddress:\t' + (userDef ? '127.0.0.11:53' : '1.1.1.1:53') + '\n\n** server can\'t find ' + h + ': NXDOMAIN\n\n'); return 1; }
    c.out('Server:\t\t' + (userDef ? '127.0.0.11' : '1.1.1.1') + '\nAddress:\t' + (userDef ? '127.0.0.11:53' : '1.1.1.1:53') + '\n\nNon-authoritative answer:\nName:\t' + h + '\nAddress: ' + rl.ip + '\n\n'); return 0;
  }
  if (prog === 'ping') {
    var cn = 3, host = null; for (i = 0; i < a.length; i++) { if (a[i] === '-c') cn = +a[++i] || 3; else if (a[i].charAt(0) !== '-') host = a[i]; }
    if (!host) { c.err('ping: usage error: Destination address required\n'); return 1; }
    var rp = lookup(host);
    if (!rp) { if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && !allInternal(W, ct)) { c.out('PING ' + host + ' (' + host + '): 56 data bytes\n64 bytes from ' + host + ': seq=0 ttl=57 time=1.' + '2 ms\n\n--- ' + host + ' ping statistics ---\n1 packets transmitted, 1 packets received, 0% packet loss\nround-trip min/avg/max = 1.2/1.2/1.2 ms\n'); return 0; } if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) { c.out('PING ' + host + ' (' + host + '): 56 data bytes\n\n--- ' + host + ' ping statistics ---\n' + cn + ' packets transmitted, 0 packets received, 100% packet loss\n'); return 1; } return badAddr('ping', host); }
    var o = 'PING ' + host + ' (' + rp.ip + '): 56 data bytes\n'; for (i = 0; i < cn; i++) o += '64 bytes from ' + rp.ip + ': seq=' + i + ' ttl=64 time=0.0' + (80 + i * 7) + ' ms\n';
    o += '\n--- ' + host + ' ping statistics ---\n' + cn + ' packets transmitted, ' + cn + ' packets received, 0% packet loss\nround-trip min/avg/max = 0.080/0.094/0.101 ms\n'; c.out(o); return 0;
  }
  if (prog === 'nc') {
    var pos = a.filter(function (x) { return x.charAt(0) !== '-'; }), flg = a.filter(function (x) { return x.charAt(0) === '-'; }).join(''), nh = pos[0], np = +pos[1];
    if (!nh || !np) { c.err('nc: usage error\n'); return 1; }
    var rn = lookup(nh); if (!rn) return badAddr('nc', nh);
    var okp = rn.ext ? true : portsOf(rn.ct).indexOf(np) >= 0;
    if (!okp) { c.err('nc: connect to ' + nh + ' (' + rn.ip + ') port ' + np + ' (tcp) failed: Connection refused\n'); return 1; }
    if (flg.indexOf('v') >= 0) c.out(nh + ' (' + rn.ip + ':' + np + ') open\n'); return 0;
  }
  if (prog === 'wget' || prog === 'curl') {
    var url = a.filter(function (x) { return x.charAt(0) !== '-' && !/^(-O|-o)$/.test(x); }).pop();
    if (!url) { c.err(prog + ': missing URL\n'); return 1; }
    var hp = parseHostPort(url); if (!hp) { c.err(prog + ': invalid URL\n'); return 1; }
    var rw = lookup(hp.host); if (!rw) return badAddr(prog, hp.host);
    if (rw.ext) { c.out('<!doctype html><html><head><title>Example Domain</title></head></html>\n'); return 0; }
    var listening = portsOf(rw.ct).indexOf(hp.port) >= 0;
    if (!listening) { if (prog === 'curl') { c.err('curl: (7) Failed to connect to ' + hp.host + ' port ' + hp.port + ' after 0 ms: Connection refused\n'); return 7; } c.err('wget: can\'t connect to remote host (' + rw.ip + '): Connection refused\n'); return 1; }
    var kd = kind(rw.ct);
    if (kd === 'api') { if (/^\/(health|healthz)?$/.test(hp.path)) { c.out('{"status":"ok"}\n'); return 0; } c.out('{"statusCode":404,"message":"Cannot GET ' + hp.path + '"}\n'); return 0; }
    if (kd === 'pg') { if (prog === 'curl') { c.err('curl: (52) Empty reply from server\n'); return 52; } c.err('wget: error getting response: Connection reset by peer\n'); return 1; }
    c.out('(mô phỏng) 200 OK\n'); return 0;
  }
  if (prog === 'cat' && a[0]) {
    var p0 = a[0], mem = ct.memMB;
    if (p0 === '/etc/resolv.conf') { c.out(userNets(W, ct).length ? 'nameserver 127.0.0.11\noptions ndots:0\n' : 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n'); return 0; }
    if (p0 === '/sys/fs/cgroup/memory.max') { c.out(mem ? String(Math.round(mem * 1048576)) + '\n' : 'max\n'); return 0; }
    if (p0 === '/sys/fs/cgroup/memory.current') { c.out(String(Math.round(usageOf(W, ct) * 1048576)) + '\n'); return 0; }
    if (p0 === '/sys/fs/cgroup/cpu.max') { var cp = ct.runCfg && ct.runCfg.cpus; c.out(cp ? Math.round(parseFloat(cp) * 100000) + ' 100000\n' : 'max 100000\n'); return 0; }
    if (p0 === '/sys/fs/cgroup/pids.max') { c.out((ct.runCfg && ct.runCfg.pids ? ct.runCfg.pids : (ct.svcCfg && ct.svcCfg.pids_limit) || 'max') + '\n'); return 0; }
  }
  if (prog === 'free') { c.out(V.dk4Free(sh, a)); return 0; }
  return undefined;
}

/* ===================== docker inspect (khoá bổ sung) ===================== */
function inspectExtra(c, rest) {
  var sh = c.sh, W = sh.W, fi = rest.indexOf('--format'); if (fi < 0) fi = rest.indexOf('-f');
  var nm = rest.filter(function (x, i) { return x.charAt(0) !== '-' && i !== sk(fi); })[0];
  var ct = findCt(W, nm || '');
  if (!ct) { if (imgOfRef(W, nm || '') && fi < 0) return imageInspect(c, rest); if (imgOfRef(W, nm || '')) return imageInspect(c, rest); return undefined; }
  var fmt = fi >= 0 ? rest[fi + 1] : null; if (!fmt) return undefined;
  var cfg = V.dkcfg(sh, ct), hv = ct.healthInfo, hasH = !!healthSpec(ct, W);
  var health = hasH && ct.state === 'running' && hv ? { Status: hv.ok ? 'healthy' : 'unhealthy', FailingStreak: hv.ok ? 0 : 3, Log: [{ ExitCode: hv.code, Output: hv.out }] } : (hasH ? { Status: 'starting', FailingStreak: 0, Log: [] } : null);
  var nets = {}; (ct.nets || []).forEach(function (n) { nets[n] = { IPAddress: (ct.ips && ct.ips[n]) || '', Gateway: (D4(W).nets[n] || {}).gw || '', Aliases: aliasesOf(ct) }; });
  var vals = {
    'State.OOMKilled': String(!!ct.oomKilled), 'State.ExitCode': String(ct.oomKilled ? 137 : (ct.state === 'restarting' || ct.state === 'exited' ? (ct.exitCode || 1) : 0)), 'State.Status': ct.state, 'State.Running': String(ct.state === 'running'),
    'State.Restarting': String(ct.state === 'restarting'),
    'RestartCount': ct.state === 'restarting' ? '14' : '0', 'Name': '/' + ct.name, 'Config.Image': ct.image,
    'HostConfig.Memory': ct.memMB ? String(Math.round(ct.memMB * 1048576)) : '0', 'HostConfig.MemoryReservation': '0', 'HostConfig.CpuShares': '0',
    'HostConfig.NanoCpus': cfg.cpus ? String(Math.round(parseFloat(cfg.cpus) * 1e9)) : '0', 'HostConfig.PidsLimit': cfg.pids ? String(cfg.pids) : '<nil>',
    'HostConfig.RestartPolicy.Name': ct.restartPolicy || 'no', 'HostConfig.NetworkMode': (ct.nets && ct.nets[0]) || 'default'
  };
  if (health) { vals['State.Health.Status'] = health.Status; vals['State.Health.FailingStreak'] = String(health.FailingStreak); }
  var jsonVals = { 'State.Health': health, 'NetworkSettings.Networks': nets };
  var handled = true, s2 = fmt;
  var rn = /\{\{\s*range\s+\$(\w+)\s*,\s*\$(\w+)\s*:=\s*\.NetworkSettings\.Networks\s*\}\}(.*?)\{\{\s*end\s*\}\}/.exec(fmt);
  if (rn) { s2 = s2.replace(rn[0], Object.keys(nets).map(function (k) { return rn[3].replace(new RegExp('\\{\\{\\s*\\$' + rn[1] + '\\s*\\}\\}', 'g'), k).replace(new RegExp('\\{\\{\\s*\\$' + rn[2] + '\\.IPAddress\\s*\\}\\}', 'g'), nets[k].IPAddress); }).join('')); }
  s2 = s2.replace(/\{\{\s*json\s+\.([\w.]+)\s*\}\}/g, function (m, k) { if (k in jsonVals) { if (jsonVals[k] == null) return 'null'; return JSON.stringify(jsonVals[k]); } handled = false; return m; });
  s2 = s2.replace(/\{\{\s*\.([\w.]+)\s*\}\}/g, function (m, k) { if (k in vals) return vals[k]; if (/^State\.Health/.test(k)) return '<no value>'; handled = false; return m; });
  if (!handled || /\{\{/.test(s2)) return undefined;
  c.out(s2 + '\n'); return 0;
}

/* ===================== docker update ===================== */
function dkUpdate(c, rest) {
  var sh = c.sh, W = sh.W, names = [], i;
  var upd = {};
  for (i = 0; i < rest.length; i++) {
    var x = rest[i], eq = x.indexOf('='), nm = x.indexOf('--') === 0 && eq > 0 ? x.slice(0, eq) : x, inl = x.indexOf('--') === 0 && eq > 0 ? x.slice(eq + 1) : null;
    if (nm === '-m' || nm === '--memory') upd.mem = inl != null ? inl : rest[++i]; else if (nm === '--cpus') upd.cpus = inl != null ? inl : rest[++i];
    else if (nm === '--restart') upd.restart = inl != null ? inl : rest[++i]; else if (nm === '--pids-limit') upd.pids = inl != null ? inl : rest[++i];
    else if (nm === '--memory-swap' || nm === '--memory-reservation' || nm === '--cpu-shares') { if (inl == null) i++; }
    else if (x.charAt(0) !== '-') names.push(x);
  }
  if (!names.length) throw new CmdErr('"docker update" requires at least 1 argument.');
  if (upd.mem == null && upd.cpus == null && upd.restart == null && upd.pids == null) throw new CmdErr('"docker update" requires at least one of --memory, --cpus, --restart, --pids-limit');
  names.forEach(function (n) {
    var ct = findCt(W, n); if (!ct) throw new CmdErr('Error response from daemon: No such container: ' + n);
    if (upd.mem != null) { var m = memParse(upd.mem); if (m == null && upd.mem !== '0') throw new CmdErr('invalid argument "' + upd.mem + '" for "-m, --memory" flag: invalid size: \'' + upd.mem + '\''); ct.memMB = upd.mem === '0' ? null : m; }
    if (upd.cpus != null) { ct.runCfg = ct.runCfg || {}; ct.runCfg.cpus = upd.cpus; }
    if (upd.pids != null) { ct.runCfg = ct.runCfg || {}; ct.runCfg.pids = upd.pids; }
    if (upd.restart != null) ct.restartPolicy = upd.restart;
    c.out(n + '\n');
  });
  rebase(sh); return 0;
}

/* ===================== bộ điều phối docker ===================== */
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W, sub = a[0], rest = a.slice(1);
  if (!W.dk4) return prev(a, c);
  syncPg(sh);
  if (W.dockerGroup === false && !c.sudo && sh.user !== 'root') return prev(a, c);
  if (sub === 'build') return dkBuild(a, c);
  if (sub === 'history') return dkHistory(c, rest);
  if (sub === 'image' && rest[0] === 'inspect') return imageInspect(c, rest.slice(1));
  if (sub === 'image' && rest[0] === 'history') return dkHistory(c, rest.slice(1));
  if (sub === 'network') return netCmd(c, rest);
  if (sub === 'volume') { var vr = volCmd(c, rest); return vr; }
  if (sub === 'images' || (sub === 'image' && rest[0] === 'ls')) {
    var ir = sub === 'image' ? rest.slice(1) : rest, ifi = ir.indexOf('--format'), ifmt = ifi >= 0 ? ir[ifi + 1] : null, iarg = ir.filter(function (x, i) { return x.charAt(0) !== '-' && i !== sk(ifi); })[0];
    var list = DK.imgs(W).filter(function (x) { if (!iarg) return true; var p = DK.split(iarg); return x.repo === p[0] && (iarg.indexOf(':') < 0 || x.tag === p[1]); });
    if (ir.indexOf('-q') >= 0) { c.out(list.map(function (x) { return x.id; }).join('\n') + (list.length ? '\n' : '')); return 0; }
    if (ifmt) { c.out(list.map(function (x) { return ifmt.replace(/\{\{\.(\w+)\}\}/g, function (m, k) { return ({ Repository: x.repo, Tag: x.tag, ID: x.id, Size: x.size, CreatedSince: '2 hours ago' })[k] || ''; }); }).join('\n') + (list.length ? '\n' : '')); return 0; }
    var io = 'REPOSITORY            TAG       IMAGE ID       CREATED        SIZE\n'; list.forEach(function (x) { io += pad(x.repo, 22) + pad(x.tag, 10) + pad(x.id, 15) + pad('2 hours ago', 15) + x.size + '\n'; }); c.out(io); return 0;
  }
  if (sub === 'stats') return dkStats(c, rest);
  if (sub === 'update') return dkUpdate(c, rest);
  if (sub === 'run') return dkRun(a, c);
  if (sub === 'inspect') { var ri = inspectExtra(c, rest); if (ri !== undefined) return ri; }
  if (sub === 'exec') { var re = execExtra(c, rest); if (re !== undefined) return re; }
  if (sub === 'compose') {
    var flagsStripped = rest.filter(function (x) { return x !== '--env-file'; });
    var csub = flagsStripped.filter(function (x) { return x.charAt(0) !== '-'; })[0];
    if (csub === 'exec') {
      var ei = rest.indexOf('exec'), after = rest.slice(ei + 1), pos = [], fl = [];
      for (var i = 0; i < after.length; i++) { var x = after[i]; if (pos.length === 0 && x.charAt(0) === '-') { fl.push(x); if (x === '-u' || x === '-e' || x === '-w') fl.push(after[++i]); continue; } pos.push(x); }
      var L0 = composeDoc(sh, c), pj = L0 ? L0.project : null;
      var tc = W.containers.filter(function (ct) { return ct.proj === pj && (ct.svc === pos[0]); })[0];
      if (!tc) throw new CmdErr('service "' + pos[0] + '" is not running');
      var rx = execExtra(c, fl.concat([tc.name], pos.slice(1)));
      if (rx !== undefined) return rx;
      return prev(['exec'].concat(fl, [tc.name], pos.slice(1)), c);
    }
    var L = null;
    if (csub === 'up' || csub === 'config' || csub === 'create') L = composeCheck(sh, c, rest);
    var rv = prev(a, c);
    var pstate = csub === 'up' || csub === 'start' || csub === 'restart' || csub === 'stop' || csub === 'down' || csub === 'rm' || csub === 'create';
    if (csub === 'up' && rv === 0) { composePost(sh, c, L || composeDoc(sh, c)); }
    else if (csub === 'down') { var Ld = composeDoc(sh, c); if (Ld) composeRemoveNets(sh, Ld.project, rest.indexOf('-v') >= 0 || rest.indexOf('--volumes') >= 0); syncPg(sh); }
    else if (pstate) rebase(sh);
    return rv;
  }
  var isLife = sub === 'start' || sub === 'restart' || sub === 'stop' || sub === 'kill' || sub === 'rm' || sub === 'unpause';
  var rc = prev(a, c);
  if (isLife) rebase(sh);
  return rc;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
