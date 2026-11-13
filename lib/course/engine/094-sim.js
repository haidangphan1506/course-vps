(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M;
var SD = C.SD = {};

SD.NGINX_CONF = ['user www-data;', 'worker_processes auto;', 'events { worker_connections 768; }', 'http {', '    ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3; # Dropping SSLv3, ref: POODLE', '    include /etc/nginx/conf.d/*.conf;', '    include /etc/nginx/sites-enabled/*;', '}'];
SD.NGINX_CONF_OK = ['user www-data;', 'worker_processes auto;', 'events { worker_connections 768; }', 'http {', '    ssl_protocols TLSv1.2 TLSv1.3;', '    include /etc/nginx/conf.d/*.conf;', '    include /etc/nginx/sites-enabled/*;', '}'];
var CERT = function (d) { return ['    ssl_certificate /etc/letsencrypt/live/' + d + '/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/' + d + '/privkey.pem;']; };
SD.TUTOR_BAD = ['server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    root /var/www/tutor;', '}', '', 'server {', '    listen 443 ssl;', '    server_name tutor.haiphan.org;'].concat(CERT('tutor.haiphan.org'), ['    root /var/www/tutor;', '}']);
SD.TUTOR_TLS = ['server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    http2 on;', '    server_name tutor.haiphan.org;'].concat(CERT('tutor.haiphan.org'), ['    add_header Strict-Transport-Security "max-age=300" always;', '    root /var/www/tutor;', '}']);
SD.TUTOR_AOP = ['server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    http2 on;', '    server_name tutor.haiphan.org;'].concat(CERT('tutor.haiphan.org'), ['    ssl_client_certificate /etc/ssl/cloudflare/origin-pull-ca.pem;', '    ssl_verify_client on;', '    add_header Strict-Transport-Security "max-age=300" always;', '    root /var/www/tutor;', '}']);
SD.API_SITE = ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    server_name api-tutor.haiphan.org;'].concat(CERT('api-tutor.haiphan.org'), ['    location /auth/login {', '        limit_req zone=login burst=2 nodelay;', '        limit_req_status 429;', '        proxy_pass http://127.0.0.1:8888;', '    }', '    location / {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}']);
SD.RATELIMIT = ['limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;'];
SD.CF_V4 = V.CF_RANGES;
SD.HBA_BAD = ['# TYPE  DATABASE  USER  ADDRESS      METHOD', 'local   all       postgres                   peer', 'local   all       all                        trust', 'host    all       all   0.0.0.0/0    trust'];
SD.HBA_GOOD = ['# TYPE  DATABASE  USER    ADDRESS         METHOD', 'local   all       postgres                        peer', 'local   all       all                             scram-sha-256', 'host    tutor     app     172.18.0.0/16   scram-sha-256', 'host    tutor     backup  172.18.0.0/16   scram-sha-256', 'host    all       all     0.0.0.0/0       reject'];
SD.REDIS_CONF = ['requirepass Rd-4mNq8Zt2Lw9', 'bind 0.0.0.0', 'protected-mode yes', 'rename-command FLUSHALL ""', 'rename-command FLUSHDB ""', 'rename-command CONFIG ""', 'maxmemory 256mb'];
SD.DOCKERFILE_BAD = ['FROM node:18', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci --omit=dev', 'COPY . .', 'CMD ["node", "dist/main.js"]'];
SD.DOCKERFILE_OK = ['FROM node:22-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci --omit=dev', 'COPY . .', 'USER node', 'CMD ["node", "dist/main.js"]'];

// o: {api:'bad'|'good', pg:'bad'|'good', redis:'bad'|'good', apiRedisPw:true, apiDbPw:'...'}
SD.compose = function (o) {
  o = o || {};
  var L = ['services:', '  postgres:', '    image: postgres:16', '    container_name: tutor-postgres', '    restart: unless-stopped', '    environment:'];
  if (o.pg === 'good') L.push('      POSTGRES_PASSWORD_FILE: /run/secrets/pg_password', '      POSTGRES_DB: tutor', '    secrets:', '      - pg_password', '    ports:', '      - "127.0.0.1:5432:5432"');
  else L.push('      POSTGRES_PASSWORD: Ab12cd34ef56', '      POSTGRES_DB: tutor', '    ports:', '      - "5432:5432"');
  L.push('    volumes:', '      - pgdata:/var/lib/postgresql/data', '      - ./pg/pg_hba.conf:/etc/postgresql/pg_hba.conf', '    command: postgres -c hba_file=/etc/postgresql/pg_hba.conf');
  L.push('  redis:', '    image: redis:7', '    container_name: tutor-redis', '    restart: unless-stopped');
  if (o.redis === 'good') L.push('    ports:', '      - "127.0.0.1:6379:6379"', '    volumes:', '      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf', '    command: redis-server /usr/local/etc/redis/redis.conf');
  else L.push('    ports:', '      - "6379:6379"');
  L.push('  api:', '    image: tutor-api:latest', '    container_name: tutor-api', '    restart: unless-stopped', '    environment:', '      NODE_ENV: production', '      DB_HOST: postgres', '      DB_USER: app', '      DB_PASSWORD: ' + (o.apiDbPw || 'Ab12cd34ef56'), '      REDIS_HOST: redis');
  if (o.apiRedisPw) L.push('      REDIS_PASSWORD: Rd-4mNq8Zt2Lw9');
  L.push('    ports:', '      - "127.0.0.1:8888:8888"');
  if (o.api === 'good') L.push('    user: "1000:1000"', '    read_only: true', '    tmpfs:', '      - /tmp', '    cap_drop:', '      - ALL', '    security_opt:', '      - no-new-privileges:true', '    mem_limit: 512m', '    cpus: "1.0"', '    pids_limit: 200');
  else L.push('    volumes:', '      - /var/run/docker.sock:/var/run/docker.sock');
  if (o.pg === 'good') L.push('', 'secrets:', '  pg_password:', '    file: ./secrets/pg_password.txt');
  L.push('', 'volumes:', '  pgdata:');
  return L;
};

// Môi trường chung cho chương
SD.base = function (s, o) {
  o = o || {};
  C.secBase(s);
  var f = s.fs, h = s.home, u = s.user, W = s.W;
  f.put('/etc/nginx/nginx.conf', SD.NGINX_CONF.join('\n') + '\n', { owner: 'root' });
  f.mkdirp('/etc/nginx/conf.d', 'root');
  f.mkdirp('/etc/ssl/cloudflare', 'root');
  ['tutor.haiphan.org', 'api-tutor.haiphan.org'].forEach(function (d) {
    f.mkdirp('/etc/letsencrypt/live/' + d, 'root', M('755'));
    f.put('/etc/letsencrypt/live/' + d + '/fullchain.pem', '-----BEGIN CERTIFICATE-----\nSIM:' + d + '\n-----END CERTIFICATE-----\n', { owner: 'root', mode: M('644') });
    f.put('/etc/letsencrypt/live/' + d + '/privkey.pem', '-----BEGIN PRIVATE KEY-----\nSIM\n-----END PRIVATE KEY-----\n', { owner: 'root', mode: M('600') });
    W.certs[d] = true;
  });
  f.put('/etc/letsencrypt/options-ssl-nginx.conf', 'ssl_session_timeout 1440m;\n', { owner: 'root' });
  f.mkdirp('/var/www/tutor', 'root', M('755'));
  f.put('/var/www/tutor/index.html', '<h1>EduTrack</h1>\n', { owner: 'root' });
  f.put('/etc/nginx/conf.d/ratelimit.conf', SD.RATELIMIT.join('\n') + '\n', { owner: 'root' });
  C.site(s, 'tutor.haiphan.org', (o.tutor || SD.TUTOR_BAD).join('\n') + '\n');
  C.site(s, 'api-tutor.haiphan.org', SD.API_SITE.join('\n') + '\n');
  f.put(h + '/cf-ips-v4.txt', SD.CF_V4.join('\n') + '\n', { owner: u });
  // docker + bí mật
  var td = h + '/tutor';
  f.mkdirp(td + '/pg', u); f.mkdirp(td + '/redis', u); f.mkdirp(td + '/secrets', u, M('700'));
  f.put(td + '/Dockerfile', SD.DOCKERFILE_BAD.join('\n') + '\n', { owner: u });
  f.put(td + '/package.json', '{ "name": "tutor-api", "version": "1.0.0" }\n', { owner: u });
  f.put(td + '/pg/pg_hba.conf', (o.hba || SD.HBA_BAD).join('\n') + '\n', { owner: u });
  f.put(td + '/redis/redis.conf', (o.redisConf || ['# redis.conf (chưa bật mật khẩu)', 'bind 0.0.0.0', 'protected-mode no']).join('\n') + '\n', { owner: u });
  f.put(td + '/docker-compose.yml', SD.compose(o.compose || {}).join('\n') + '\n', { owner: u });
  V.pgInit(s, { owner: u, hbaPath: td + '/pg/pg_hba.conf', hba: (o.hba || SD.HBA_BAD).join('\n') + '\n', roles: o.roles || { postgres: { super: true, login: true, pw: 'Pg-Super-9xK2' }, app: { super: true, login: true, pw: 'Ab12cd34ef56' } } });
  s.silent('docker pull redis:7');
  var im = (W.images || []).filter(function (x) { return x.repo === 'tutor-api'; })[0];
  if (im) { im.base = 'node:18'; im.user = ''; }
  s.cwd = td;
  V.ngReload(s, false);
  if (!o.noCompose) s.silent('docker compose up -d');
  s.cwd = td;
  s.hist.length = 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
