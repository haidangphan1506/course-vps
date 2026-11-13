(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, B = C.DKD, K = C.DKC;
var DKE = C.DKE = {};
/* Dockerfile distroless: giai đoạn build giống DF_MULTI, giai đoạn cuối không có shell */
DKE.DF_SLIM = K.DF_MULTI.slice(0, K.DF_MULTI.indexOf('')).concat(['',
  'FROM gcr.io/distroless/nodejs22-debian12:nonroot', 'WORKDIR /app', 'ENV NODE_ENV=production', 'COPY --from=build /app/package*.json ./', 'COPY --from=build /app/node_modules ./node_modules', 'COPY --from=build /app/dist ./dist',
  'USER nonroot', 'EXPOSE 8888', 'CMD ["dist/main.js"]']);
/* o: tuỳ chọn của DKD.base cộng thêm {slim, hostLoop, mem:'128m', bigLog:MB, userns, uploads, daemonBroken, live} */
DKE.base = function (s, o) {
  o = o || {};
  var f = s.fs, h = s.home, u = s.user, W = s.W, td = h + '/tutor', live = o.live === 'green' ? 'green' : 'blue';
  var doUp = o.up !== false;
  B.base(s, Object.assign({}, o, { up: false }));
  f.put('/etc/shadow', 'root:$y$j9T$simulated:19000:0:99999:7:::\nhaidangphan:$y$j9T$simulated:19000:0:99999:7:::\n', { owner: 'root', mode: M('640') });
  f.put('/etc/subuid', 'haidangphan:100000:65536\n', { owner: 'root', mode: M('644') });
  f.put('/etc/subgid', 'haidangphan:100000:65536\n', { owner: 'root', mode: M('644') });
  f.mkdirp('/etc/docker', 'root', M('755'));
  var cf = td + '/docker-compose.yml', txt = f.get(cf).c;
  if (o.slim) {
    f.put(td + '/Dockerfile.distroless', K.DF_MULTI && DKE.DF_SLIM.join('\n') + '\n', { owner: u });
    s.cwd = td; s.silent('docker build -f Dockerfile.distroless -t tutor-api:1.0.0-slim .');
    f.put(td + '/.env', f.get(td + '/.env').c.replace(/^BLUE_TAG=.*$/m, 'BLUE_TAG=1.0.0-slim'), { owner: u });
  }
  if (o.hostLoop) txt = txt.replace(/(      NODE_ENV: production)/g, '$1\n      HOST: 127.0.0.1');
  if (o.mem) txt = txt.replace(/mem_limit: \d+m/g, 'mem_limit: ' + o.mem);
  f.put(cf, txt, { owner: u });
  if (doUp) { s.cwd = td; s.silent('docker compose up -d postgres redis api-' + live); }
  if (o.bigLog) { var api = W.containers.filter(function (c) { return /api/.test(c.name); })[0]; if (api) api.logMB = o.bigLog; }
  if (o.userns) { f.put('/etc/docker/daemon.json', '{\n  "userns-remap": "default"\n}\n', { owner: 'root', mode: M('644') }); W.dk6 = W.dk6 || {}; W.dk6.userns = true; }
  if (o.uploads) f.mkdirp(td + '/uploads', u, M('755'));
  if (o.daemonBroken) {
    f.put('/etc/docker/daemon.json', '{\n  // giữ log nhỏ\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": 3, },\n}\n', { owner: 'root', mode: M('644') });
    W.dk6 = W.dk6 || {}; W.dk6.down = true;
  }
  s.cwd = td; s.hist.length = 0;
  if (V.dkSync) V.dkSync(s);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
