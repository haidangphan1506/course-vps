(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, DK = V.dk;
var DKC = C.DKC = {};

DKC.DF_NAIVE = ['FROM node:22', 'WORKDIR /app', 'COPY . .', 'RUN npm ci', 'RUN npm run build', 'CMD ["node", "dist/main.js"]'];
DKC.DF_MULTI = ['FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY package*.json ./', 'RUN --mount=type=cache,target=/root/.npm npm ci', 'COPY . .', 'RUN npm run build', 'RUN npm prune --omit=dev', '',
  'FROM node:22-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production', 'COPY --from=build /app/package*.json ./', 'COPY --from=build /app/node_modules ./node_modules', 'COPY --from=build /app/dist ./dist',
  'USER node', 'EXPOSE 8888', 'HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost:8888/health || exit 1', 'ENTRYPOINT ["node"]', 'CMD ["dist/main.js"]'];
DKC.IGNORE = ['node_modules', '.git', '.env', '.env*', 'dist', '*.log', 'docker-compose*.yml'];

/* o: {net:'default'|'split'|'internal', limits, health:'wget'|'curl'|'none', worker:'free'|'limited', vol:true|false, apiMem, pgPorts} */
DKC.compose = function (o) {
  o = o || {};
  var split = o.net === 'split' || o.net === 'internal', L = ['services:'];
  L.push('  postgres:', '    image: postgres:16', '    container_name: tutor-postgres', '    restart: unless-stopped', '    environment:', '      POSTGRES_PASSWORD: Ab12cd34ef56', '      POSTGRES_DB: tutor');
  L.push('    volumes:', '      - pgdata:/var/lib/postgresql/data');
  if (split) L.push('    networks:', '      - backend');
  L.push('  redis:', '    image: redis:7', '    container_name: tutor-redis', '    restart: unless-stopped');
  if (split) L.push('    networks:', '      - backend');
  L.push('  api:', '    image: tutor-api:latest', '    container_name: tutor-api', '    restart: unless-stopped', '    environment:', '      NODE_ENV: production', '      DB_HOST: postgres', '      DB_USER: app', '      DB_PASSWORD: Ab12cd34ef56', '      REDIS_HOST: redis', '    ports:', '      - "127.0.0.1:8888:8888"');
  if (o.net === 'split') L.push('    networks:', '      - frontend', '      - backend');
  if (o.net === 'internal') L.push('    networks:', '      - backend');
  if (o.limits) L.push('    mem_limit: ' + (o.apiMem || '512m'), '    cpus: "1.0"', '    pids_limit: 200');
  if (o.health === 'wget') L.push('    healthcheck:', '      test: ["CMD-SHELL", "wget -qO- http://localhost:8888/health || exit 1"]', '      interval: 30s', '      timeout: 3s', '      retries: 3');
  if (o.health === 'curl') L.push('    healthcheck:', '      test: ["CMD-SHELL", "curl -f http://localhost:8888/health || exit 1"]', '      interval: 30s', '      timeout: 3s', '      retries: 3');
  if (o.web) L.push('  web:', '    image: nginx:latest', '    container_name: tutor-web', '    restart: unless-stopped', '    networks:', '      - frontend');
  if (o.worker) {
    L.push('  worker:', '    image: tutor-worker:latest', '    container_name: tutor-worker', '    restart: unless-stopped', '    environment:', '      MEM_LEAK: "true"');
    if (o.worker === 'limited') L.push('    mem_limit: 512m');
    if (split) L.push('    networks:', '      - backend');
  }
  if (split) { L.push('', 'networks:', '  frontend:', '  backend:'); if (o.net === 'internal' || o.internalBackend) L.push('    internal: true'); }
  if (o.vol !== false) L.push('', 'volumes:', '  pgdata:');
  return L;
};

DKC.base = function (s, o) {
  o = o || {};
  var f = s.fs, h = s.home, u = s.user, W = s.W, td = h + '/tutor';
  C.vpsBase(s);
  C.site(s, 'api-tutor.haiphan.org', 'server {\n    listen 80;\n    server_name api-tutor.haiphan.org;\n    location / {\n        proxy_pass http://127.0.0.1:8888;\n        proxy_set_header Host $host;\n    }\n}\n');
  V.ngReload(s, false);
  V.dk4Init(s);
  W.db = { initialized: false, password: 'Ab12cd34ef56', user: 'app', hasData: true, version: '16' };
  f.mkdirp(td + '/src', u); f.mkdirp(h + '/backups', u);
  f.put(td + '/Dockerfile', (o.dockerfile || DKC.DF_NAIVE).join('\n') + '\n', { owner: u });
  f.put(td + '/package.json', '{\n  "name": "tutor-api",\n  "version": "1.0.0",\n  "scripts": { "build": "nest build", "start:prod": "node dist/main" }\n}\n', { owner: u });
  f.put(td + '/package-lock.json', '{ "lockfileVersion": 3 }\n', { owner: u });
  f.put(td + '/tsconfig.json', '{ "compilerOptions": { "outDir": "./dist" } }\n', { owner: u });
  f.put(td + '/src/main.ts', "import { NestFactory } from '@nestjs/core';\nasync function bootstrap() { const app = await NestFactory.create(AppModule); await app.listen(8888); }\nbootstrap();\n", { owner: u });
  f.put(td + '/src/app.module.ts', "@Module({ imports: [] })\nexport class AppModule {}\n", { owner: u });
  f.put(td + '/.env', 'DB_PASSWORD=Ab12cd34ef56\nJWT_SECRET=s3cr3t-do-not-commit\n', { owner: u, mode: M('600') });
  f.put(td + '/.git/HEAD', 'ref: refs/heads/main\n', { owner: u });
  f.put(td + '/.git/objects/pack/pack-1.pack', 'PACK', { owner: u, size: 38 * 1000000 });
  f.put(td + '/node_modules/.package-lock.json', '{}', { owner: u, size: 310 * 1000000 });
  f.put(td + '/dist/main.js', 'console.log("tutor-api");\n', { owner: u });
  f.put(td + '/app.log', 'log', { owner: u, size: 2 * 1000000 });
  if (o.ignore) f.put(td + '/.dockerignore', o.ignore.join('\n') + '\n', { owner: u });
  f.put(h + '/npm-token.txt', '//registry.npmjs.org/:_authToken=npm_SIMULATED_TOKEN_a1b2c3\n', { owner: u, mode: M('600') });
  DK.addImg(W, 'tutor-worker:latest', '180MB');
  var wi = DK.imgs(W).filter(function (x) { return x.repo === 'tutor-worker'; })[0]; if (wi) { wi.base = 'node:22-alpine'; wi.flavor = 'alpine'; wi.user = 'node'; }
  s.silent('docker pull redis:7');
  s.cwd = td;
  f.put(td + '/docker-compose.yml', DKC.compose(o.compose || {}).join('\n') + '\n', { owner: u });
  s.silent('docker build -t tutor-api:latest .');
  if (o.dockerfileAfter) f.put(td + '/Dockerfile', o.dockerfileAfter.join('\n') + '\n', { owner: u });
  if (!o.noUp) s.silent('docker compose up -d');
  s.cwd = td;
  s.hist.length = 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
