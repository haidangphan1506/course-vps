(function (G) {
'use strict';
var VPS = G.VPS, cmds = VPS.cmds, CmdErr = VPS.CmdErr, pad = VPS.util.pad;
var orig = cmds.docker;
var HUB = /^(postgres|redis|nginx|node|louislam\/uptime-kuma|mysql|mongo|alpine|busybox|ubuntu)$/;
function imgs(W) { if (!W.images) W.images = [{ repo: 'tutor-api', tag: 'latest', id: '3f1a2b9c0d11', size: '412MB' }, { repo: 'postgres', tag: '16', id: 'a9c1d2e3f405', size: '432MB' }, { repo: 'louislam/uptime-kuma', tag: '1', id: 'b7e5d4c3a211', size: '452MB' }]; return W.images; }
function split(img) { var i = img.lastIndexOf(':'); return i > 0 && img.indexOf('/', i) < 0 ? [img.slice(0, i), img.slice(i + 1)] : [img, 'latest']; }
function has(W, img) { var p = split(img); return imgs(W).some(function (x) { return x.repo === p[0] && x.tag === p[1]; }); }
function addImg(W, img, size) { var p = split(img); if (!has(W, img)) imgs(W).push({ repo: p[0], tag: p[1], id: (Math.abs(hash(img)).toString(16) + '000000000000').slice(0, 12), size: size || '118MB' }); }
function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function pullImg(c, W, img) {
  var p = split(img);
  if (/^tutor-/.test(p[0])) throw new CmdErr("Error response from daemon: pull access denied for " + p[0] + ", repository does not exist or may require 'docker login': denied: requested access to the resource is denied");
  if (!has(W, img)) { c.out(p[1] + ': Pulling from library/' + p[0] + '\nDigest: sha256:' + (Math.abs(hash(img)).toString(16) + 'a1b2c3d4e5f6').slice(0, 12) + '...\nStatus: Downloaded newer image for ' + p[0] + ':' + p[1] + '\n'); addImg(W, img); }
  else c.out(p[1] + ': Pulling from library/' + p[0] + '\nStatus: Image is up to date for ' + p[0] + ':' + p[1] + '\n');
}
VPS.dk = { imgs: imgs, split: split, has: has, addImg: addImg, hid: null, pullImg: pullImg };
function hid(n) { var h = Math.abs(hash(n)), s = ''; for (var i = 0; i < 12; i++) { h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff; s += '0123456789abcdef'.charAt(h % 16); } return s; }

function projects(W) { var p = {}; W.containers.forEach(function (c) { if (c.proj) p[c.proj] = 1; }); return Object.keys(p); }
function find(W, n) { return W.containers.filter(function (c) { return c.name === n || c.id.indexOf(n) === 0; })[0]; }
VPS.dk.hid = hid;
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W, sub = a[0], rest = a.slice(1);
  if (sub === 'images') {
    var t = 'REPOSITORY            TAG       IMAGE ID       CREATED        SIZE\n'; imgs(W).forEach(function (x) { t += pad(x.repo, 22) + pad(x.tag, 10) + pad(x.id, 15) + pad('2 hours ago', 15) + x.size + '\n'; }); c.out(t); return 0;
  }
  if (sub === 'pull') { if (!rest[0]) throw new CmdErr('"docker pull" requires exactly 1 argument.'); pullImg(c, W, rest[0]); return 0; }
  if (sub === 'build') {
    var tag = null, ctx = null;
    for (var bi = 0; bi < rest.length; bi++) { if (rest[bi] === '-t' || rest[bi] === '--tag') tag = rest[++bi]; else if (rest[bi].charAt(0) !== '-') ctx = rest[bi]; }
    if (!ctx) throw new CmdErr('"docker build" requires exactly 1 argument.');
    var dir = sh.abs(ctx);
    if (!sh.fs.isF(dir + '/Dockerfile')) throw new CmdErr('ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory');
    var dfT = sh.fs.get(dir + '/Dockerfile').c, cmdM = /^CMD\s+(.*)$/m.exec(dfT), badCmd = cmdM && !/dist\/main\.js/.test(cmdM[1]);
    var crashLogs = badCmd ? ['node:internal/modules/cjs/loader:1228', "Error: Cannot find module '/app/" + ((/"([^"]+\.js)"/.exec(cmdM[1]) || [0, 'build/main.js'])[1]) + "'", '    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)', 'Node.js v20.18.0'] : null;
    if (tag) { var tp = split(tag); var ex = imgs(W).filter(function (x) { return x.repo === tp[0] && x.tag === tp[1]; })[0]; if (ex) { ex.id = hid(tag + Date.now()); ex.crash = crashLogs; } else imgs(W).push({ repo: tp[0], tag: tp[1], id: hid(tag), size: '412MB', crash: crashLogs }); }
    c.out('[+] Building 38.2s (14/14) FINISHED\n => [build 4/6] RUN npm ci\n => [build 6/6] RUN npm run build\n => [stage-1 5/5] COPY --from=build /app/node_modules ./node_modules\n => exporting to image\n => => naming to docker.io/library/' + (tag || 'untagged') + '\n'); return 0;
  }
  if (sub === 'rmi') {
    var img = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0], pi = split(img || '');
    if (!has(W, img)) throw new CmdErr('Error response from daemon: No such image: ' + img);
    var user = W.containers.filter(function (x) { return split(x.image).join(':') === pi.join(':'); })[0];
    if (user && rest.indexOf('-f') < 0) throw new CmdErr('Error response from daemon: conflict: unable to remove repository reference "' + img + '" (must force) - container ' + user.id + ' is using its image');
    W.images = imgs(W).filter(function (x) { return !(x.repo === pi[0] && x.tag === pi[1]); }); c.out('Untagged: ' + pi[0] + ':' + pi[1] + '\nDeleted: sha256:' + hid(img) + '\n'); return 0;
  }
  if (sub === 'top') {
    var tc = find(W, rest[0]); if (!tc) throw new CmdErr('Error response from daemon: No such container: ' + rest[0]);
    if (tc.state !== 'running') throw new CmdErr('Error response from daemon: container ' + tc.id + ' is not running');
    c.out('UID    PID     PPID    C   STIME   TTY   TIME       CMD\nroot   ' + (3100 + hash(tc.name) % 800 + 800) + '    ' + (3000 + hash(tc.name) % 800 + 800) + '    0   09:12   ?     00:00:01   ' + (/postgres/.test(tc.name) ? 'postgres' : tc.name === 'cache' ? 'redis-server *:6379' : 'node dist/main.js') + '\n'); return 0;
  }
  if (sub === 'run') {
    var name = null, ports = [], env = {}, image = null, mem = null, j;
    for (j = 0; j < rest.length; j++) {
      var x = rest[j];
      if (x === '--name') name = rest[++j]; else if (x === '-p' || x === '--publish') ports.push(rest[++j]); else if (x === '-e' || x === '--env') { var kv = rest[++j]; var q = kv.indexOf('='); if (q > 0) env[kv.slice(0, q)] = kv.slice(q + 1); }
      else if (x === '--restart' || x === '-v' || x === '--network' || x === '--volume') j++; else if (x === '-m' || x === '--memory') mem = rest[++j];
      else if (x.charAt(0) === '-') continue; else { image = x; break; }
    }
    if (!image) throw new CmdErr('"docker run" requires at least 1 argument.');
    var pr = split(image);
    if (!has(W, image)) { if (/^tutor-/.test(pr[0])) throw new CmdErr("Unable to find image '" + image + "' locally\ndocker: Error response from daemon: pull access denied for " + pr[0] + ", repository does not exist or may require 'docker login'."); pullImg(c, W, image); }
    name = name || 'quirky_turing';
    if (find(W, name)) throw new CmdErr('docker: Error response from daemon: Conflict. The container name "/' + name + '" is already in use by container "' + find(W, name).id + '". You have to remove (or rename) that container to be able to reuse that name.');
    var pl = ports.map(function (p) { var a = p.replace(/\/(tcp|udp)$/, '').split(':'); return a.length === 3 ? { bind: a[0], host: +a[1], cont: +a[2] } : { bind: '0.0.0.0', host: +a[0], cont: +a[1] }; });
    var mm = /^(\d+)([mMgG])/.exec(mem || '');
    var ct = { id: hid(name), name: name, image: image, svc: name, proj: null, ports: pl, env: env, memMB: mm ? (/g/i.test(mm[2]) ? +mm[1] * 1024 : +mm[1]) : null, state: 'created', status: '', logs: ['started'], cpu: 0.1, mem: '24MiB / 7.8GiB' };
    W.containers.push(ct); VPS.applyRules(sh);
    if (ct.portErr) { c.err('docker: ' + ct.portErr + '.\n'); return 125; }
    c.out(ct.id + hid(name + 'x') + hid(name + 'y') + hid(name + 'z').slice(0, 4) + '\n'); return 0;
  }
  if (sub === 'volume' && rest[0] === 'rm') {
    var vn = rest[1], pj = projects(W).filter(function (p) { return vn === p + '_pgdata'; })[0];
    if (!pj) { var pm = /^(.*)_pgdata$/.exec(vn || ''); if (pm && W.db && W.db.initialized) { W.db.initialized = false; c.out(vn + '\n'); return 0; } throw new CmdErr('Error response from daemon: get ' + vn + ': no such volume'); }
    throw new CmdErr('Error response from daemon: remove ' + vn + ': volume is in use - [' + W.containers.filter(function (x) { return x.proj === pj; }).map(function (x) { return x.id; }).join(', ') + ']');
  }
  if (sub === 'volume' && rest[0] === 'ls') {
    var o = 'DRIVER    VOLUME NAME\n'; projects(W).forEach(function (p) { o += 'local     ' + p + '_pgdata\n'; }); c.out(o); return 0;
  }
  if (sub === 'network' && rest[0] === 'ls') {
    var n = 'NETWORK ID     NAME      DRIVER    SCOPE\n1a2b3c4d5e6f   bridge    bridge    local\n2b3c4d5e6f70   host      host      local\n3c4d5e6f7081   none      null      local\n'; projects(W).forEach(function (p, i) { n += '4d5e6f70819' + i + '   ' + pad(p + '_default', 9) + 'bridge    local\n'; }); c.out(n); return 0;
  }
  if (sub === 'system' && rest[0] === 'df') {
    c.out('TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\nImages          5         2         1.21GB    412MB (34%)\nContainers      ' + W.containers.length + '         ' + W.containers.filter(function (x) { return x.state === 'running'; }).length + '         86MB      0B (0%)\nLocal Volumes   ' + projects(W).length + '         ' + projects(W).length + '         1.4GB     0B (0%)\nBuild Cache     23        0         2.3GB     2.3GB\n'); return 0;
  }
  if (sub === 'image' && rest[0] === 'prune') { c.out('Deleted Images:\ndeleted: sha256:9f3a2c1b0d44\n\nTotal reclaimed space: 412MB\n'); return 0; }
  if (sub === 'inspect') {
    var fi = rest.indexOf('--format'); if (fi < 0) fi = rest.indexOf('-f');
    var fmt = fi >= 0 ? rest[fi + 1] : null, nm = rest.filter(function (x, i) { return x.charAt(0) !== '-' && i !== fi + 1; })[0], ct = find(W, nm);
    if (!ct) throw new CmdErr('Error response from daemon: No such object: ' + nm);
    var st = ct.state, vals = { 'State.Status': st, 'State.Running': String(st === 'running'), 'State.Restarting': String(st === 'restarting'), 'State.ExitCode': ct.memKill ? '137' : (st === 'exited' ? '0' : (st === 'restarting' ? '1' : '0')), 'Config.Image': ct.image, 'Name': '/' + ct.name, 'RestartCount': st === 'restarting' ? '14' : '0' };
    if (fmt) { c.out(fmt.replace(/\{\{\s*\.([\w.]+)\s*\}\}/g, function (m, k) { return vals[k] != null ? vals[k] : '<no value>'; }) + '\n'); return 0; }
    c.out('[\n    {\n        "Id": "' + ct.id + '...",\n        "Name": "/' + ct.name + '",\n        "State": { "Status": "' + st + '", "Running": ' + (st === 'running') + ', "ExitCode": ' + vals['State.ExitCode'] + ' },\n        "Config": { "Image": "' + ct.image + '" },\n        "HostConfig": { "RestartPolicy": { "Name": "unless-stopped" } }\n    }\n]\n'); return 0;
  }
  if (sub === 'compose') {
    var r2 = rest.filter(function (x) { return x !== '--env-file'; });
    if (r2.indexOf('up') >= 0 || r2.indexOf('build') >= 0) {
      var cf = sh.cwd + '/docker-compose.yml';
      if (sh.fs.isF(cf) && r2.indexOf('build') < 0) {
        var miss = null, missSvc = 'api';
        try { var efi = rest.indexOf('--env-file'), Lq = VPS.composeLoad(sh, c, efi >= 0 ? rest[efi + 1] : null), sq = Lq.doc.services || {}, nq = Object.keys(sq), selq = r2.filter(function (x) { return nq.indexOf(x) >= 0; }), tq = (W.dk4 && selq.length) ? selq : nq;
          tq.forEach(function (n) { var im = sq[n].image; if (im && /^tutor-/.test(im) && !has(W, im) && !miss) { miss = im; missSvc = n; } }); } catch (e) { /* lỗi cấu hình để lớp compose xử lý */ }
        if (miss) { var mp = split(miss); throw new CmdErr(' ' + missSvc + ' Error pull access denied for ' + mp[0] + ', repository does not exist or may require \'docker login\': denied: requested access to the resource is denied\nError response from daemon: pull access denied for ' + mp[0] + ', repository does not exist or may require \'docker login\': denied: requested access to the resource is denied'); }
      }
    }
    if (r2.indexOf('pull') >= 0) {
      var f = sh.cwd + '/docker-compose.yml'; if (!sh.fs.isF(f)) throw new CmdErr('no configuration file provided: not found');
      var out = ''; sh.fs.get(f).c.split('\n').forEach(function (l) { var m = /^\s*image:\s*(\S+)/.exec(l); if (m) out += ' ' + m[1].split(':')[0] + ' Pulled\n'; }); c.out(out); return 0;
    }
  }
  return orig(a, c);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
