(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, K = C.DKC;
var DKG = C.DKG = {};
DKG.DF_GOOD = ['FROM node:22-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', 'ENV NODE_ENV=production', 'EXPOSE 8888', 'USER node', 'CMD ["node", "dist/main.js"]'];
DKG.IGN_GOOD = ['node_modules', '.git', '.env', '.env*', 'dist', '*.log', 'docker-compose*.yml'];
DKG.DEPS = { '@nestjs/common': '^10.4.0', '@nestjs/core': '^10.4.0', 'class-validator': '^0.14.1' };
DKG.pkg = function (deps) { return JSON.stringify({ name: 'tutor-api', version: '1.0.0', scripts: { build: 'nest build', 'start:prod': 'node dist/main' }, dependencies: deps || DKG.DEPS, devDependencies: { '@nestjs/cli': '^10.4.0', typescript: '^5.5.0' } }, null, 2) + '\n'; };
DKG.lock = function (deps, skip) {
  var all = Object.assign({}, deps || DKG.DEPS, { '@nestjs/cli': '^10.4.0', typescript: '^5.5.0' }), pk = { '': { name: 'tutor-api', version: '1.0.0' } };
  Object.keys(all).forEach(function (d) { if (d !== skip) pk['node_modules/' + d] = { version: String(all[d]).replace(/^[\^~]/, '') }; });
  return JSON.stringify({ name: 'tutor-api', version: '1.0.0', lockfileVersion: 3, packages: pk }, null, 2) + '\n';
};
/* o: {dockerfile:[...], ignore:[...]|null, noDf, skipLock:'tên-gói', deps, extra:{path:nội dung}} */
DKG.base = function (s, o) {
  o = o || {};
  var f = s.fs, td = s.home + '/tutor', u = s.user, W = s.W;
  K.base(s, { dockerfile: o.dockerfile || DKG.DF_GOOD });
  W.containers = []; W.dkb = true;
  f.put(td + '/package.json', DKG.pkg(o.deps), { owner: u });
  f.put(td + '/package-lock.json', DKG.lock(o.deps, o.skipLock), { owner: u });
  f.put(td + '/src/auth/auth.service.ts', "export class AuthService {\n  private readonly expiresIn: number = 3600;\n  sign(id: number) { return `token-${id}-${this.expiresIn}`; }\n}\n", { owner: u });
  if (o.noDf) f.rm(td + '/Dockerfile');
  if (o.ignore) f.put(td + '/.dockerignore', o.ignore.join('\n') + '\n', { owner: u });
  if (o.extra) Object.keys(o.extra).forEach(function (p) { f.put(td + '/' + p, o.extra[p], { owner: u }); });
  if (V.dkSync) V.dkSync(s);
  s.cwd = td; s.hist.length = 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
