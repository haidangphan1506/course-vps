(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, K = C.DKC, DK = V.dk;
var DKD = C.DKD = {};
var GHCR_TOKEN = 'ghp_SIMULATEDTOKENa1b2c3d4e5f6';

/* compose blue/green: api-blue 8881, api-green 8882, image tag đọc từ .env */
DKD.compose = function (o) {
  o = o || {};
  var L = ['services:'];
  L.push('  postgres:', '    image: postgres:16', '    container_name: tutor-postgres', '    restart: unless-stopped', '    environment:', '      POSTGRES_PASSWORD: Ab12cd34ef56', '      POSTGRES_DB: tutor', '    volumes:', '      - pgdata:/var/lib/postgresql/data');
  L.push('  redis:', '    image: redis:7', '    container_name: tutor-redis', '    restart: unless-stopped');
  ['blue:8881:BLUE_TAG', 'green:8882:GREEN_TAG'].forEach(function (x) {
    var p = x.split(':');
    L.push('  api-' + p[0] + ':', '    image: ' + (o.repo || 'tutor-api') + ':${' + p[2] + ':-latest}', '    container_name: tutor-api-' + p[0], '    restart: unless-stopped', '    environment:', '      NODE_ENV: production', '      DB_HOST: postgres', '      DB_USER: app', '      DB_PASSWORD: Ab12cd34ef56', '      REDIS_HOST: redis', '    ports:', '      - "127.0.0.1:' + p[1] + ':8888"', '    mem_limit: 512m');
  });
  L.push('', 'volumes:', '  pgdata:');
  return L;
};
DKD.site = function (port) { return 'server {\n    listen 80;\n    server_name api-tutor.haiphan.org;\n    location / {\n        proxy_pass http://127.0.0.1:' + port + ';\n        proxy_set_header Host $host;\n    }\n}\n'; };
DKD.GHCR_TOKEN = GHCR_TOKEN;

/* o: {mode:'bluegreen'|'single', tags:{blue,green}, live:'blue'|'green', junk:bool, login:bool, registry:bool} */
DKD.base = function (s, o) {
  o = o || {};
  var f = s.fs, h = s.home, u = s.user, W = s.W, td = h + '/tutor';
  K.base(s, { dockerfile: K.DF_MULTI, ignore: K.IGNORE, noUp: true, compose: {} });
  s.cwd = td;
  s.silent('docker tag tutor-api:latest tutor-api:1.0.0');
  f.put(h + '/ghcr-token.txt', GHCR_TOKEN + '\n', { owner: u, mode: M('600') });
  if (o.junk) {
    /* lịch sử build cũ: image nặng 0.8.0, bản vá làm mồ côi, image không dùng */
    f.put(td + '/Dockerfile', K.DF_NAIVE.join('\n') + '\n', { owner: u });
    s.silent('docker build -t tutor-api:0.8.0 .');
    f.put(td + '/Dockerfile', K.DF_MULTI.join('\n') + '\n', { owner: u });
    s.silent('docker pull node:20'); s.silent('docker pull alpine:3.19');
    for (var i = 0; i < 2; i++) { f.put(td + '/src/main.ts', f.get(td + '/src/main.ts').c + '// patch ' + i + '\n', { owner: u }); s.silent('docker build -t tutor-api:1.0.0 .'); }
    s.silent('docker run --name old-job alpine echo done');
  }
  if (o.mode === 'single') {
    f.put(td + '/docker-compose.yml', K.compose({ health: 'wget' }).join('\n').replace('image: tutor-api:latest', 'image: tutor-api:${API_TAG:-latest}') + '\n', { owner: u });
    f.put(td + '/.env', f.get(td + '/.env').c + 'API_TAG=' + ((o.tags && o.tags.api) || '1.0.0') + '\n', { owner: u });
  } else {
    var t = o.tags || {};
    f.put(td + '/docker-compose.yml', DKD.compose(o).join('\n') + '\n', { owner: u });
    f.put(td + '/.env', f.get(td + '/.env').c + 'BLUE_TAG=' + (t.blue || '1.0.0') + '\nGREEN_TAG=' + (t.green || '1.0.0') + '\n', { owner: u });
    C.site(s, 'api-tutor.haiphan.org', DKD.site(o.live === 'green' ? 8882 : 8881)); V.ngReload(s, false);
  }
  if (o.login) s.silent('cat ~/ghcr-token.txt | docker login ghcr.io -u haidangphan --password-stdin');
  if (o.registry) {
    s.silent('docker tag tutor-api:1.0.0 ghcr.io/haidangphan/tutor-api:1.0.0');
    if (!o.login) s.silent('cat ~/ghcr-token.txt | docker login ghcr.io -u haidangphan --password-stdin');
    s.silent('docker push ghcr.io/haidangphan/tutor-api:1.0.0');
    if (!o.login) s.silent('docker logout ghcr.io');
    s.silent('docker rmi ghcr.io/haidangphan/tutor-api:1.0.0');
  }
  s.cwd = td;
  if (o.up !== false) s.silent(o.mode === 'single' ? 'docker compose up -d' : 'docker compose up -d postgres redis api-' + (o.live === 'green' ? 'green' : 'blue'));
  s.cwd = td; s.hist.length = 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
