(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M;
function L() { return Array.prototype.slice.call(arguments).join('\n') + '\n'; }
var NGB = C.NGB = {};

NGB.SITES = {
  'tutor.haiphan.org': L('server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    root /var/www/tutor;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}'),
  'api-tutor.haiphan.org': L('server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location /api/ {', '        proxy_pass http://127.0.0.1:8888;', '    }', '', '    location = /health {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}'),
  'lab.haiphan.org': L('server {', '    listen 80;', '    server_name lab.haiphan.org;', '', '    location / {', "        return 200 'prefix /';", '    }', '    location /img/ {', "        return 200 'prefix /img/';", '    }', '    location ^~ /img/raw/ {', "        return 200 'caret /img/raw/';", '    }', '    location ~* \\.(png|jpg)$ {', "        return 200 'regex anh';", '    }', '    location = /logo.png {', "        return 200 'exact logo';", '    }', '}'),
  'spa.haiphan.org': L('server {', '    listen 80;', '    server_name spa.haiphan.org;', '    root /var/www/spa/current;', '    index index.html;', '', '    location / {', '        try_files $uri $uri/ /index.html;', '    }', '    location /old-blog/ {', '        rewrite ^/old-blog/(.*)$ /blog/$1 permanent;', '    }', '}'),
  'legacy.haiphan.org': L('server {', '    listen 80;', '    server_name legacy.haiphan.org;', '', '    location / {', '        proxy_pass http://127.0.0.1:9000;', '    }', '}')
};
NGB.LOGROTATE = L('/var/log/nginx/*.log {', '    daily', '    missingok', '    rotate 14', '    compress', '    delaycompress', '    notifempty', '    create 0640 www-data adm', '    sharedscripts', '    postrotate', '        invoke-rc.d nginx rotate >/dev/null 2>&1', '    endscript', '}');

/* o: {only:[tên site], sites:{tên:nộiDung}, slow, noLab, extraSites} */
NGB.base = function (s, o) {
  o = o || {};
  var f = s.fs, W = s.W, u = s.user;
  C.vpsBase(s, o);
  W.ngx2 = true;
  W.extra.push({ port: 3000, bind: '127.0.0.1', proc: 'node', pid: 5101 });
  W.extra.push({ port: 8888, bind: '127.0.0.1', proc: 'node', pid: 5102 });
  W.extra.push({ port: 3100, bind: '127.0.0.1', proc: 'node', pid: 5103 });
  f.mkdirp('/var/www/tutor/assets', 'root', M('755'));
  f.put('/var/www/tutor/index.html', '<h1>Tutor (file tĩnh)</h1>\n', { owner: 'root' });
  f.put('/var/www/tutor/assets/app.js', 'console.log("tutor");\n', { owner: 'root' });
  f.mkdirp('/var/www/static', 'root', M('755'));
  f.put('/var/www/static/index.html', '<h1>Static site</h1>\n', { owner: 'root' });
  f.put('/var/www/static/style.css', 'body{margin:0}\n', { owner: 'root' });
  f.mkdirp('/var/www/spa/current/assets', 'root', M('755'));
  f.put('/var/www/spa/current/index.html', '<h1>SPA shell</h1>\n', { owner: 'root' });
  f.put('/var/www/spa/current/assets/app.js', 'console.log("spa");\n', { owner: 'root' });
  f.mkdirp('/var/www/uploads', 'root', M('755'));
  f.put('/var/www/uploads/a.png', 'PNGDATA\n', { owner: 'root' });
  f.put('/etc/nginx/nginx.conf', L('user www-data;', 'worker_processes auto;', 'error_log /var/log/nginx/error.log;', 'events { worker_connections 768; }', 'http {', '    access_log /var/log/nginx/access.log;', '    include /etc/nginx/conf.d/*.conf;', '    include /etc/nginx/sites-enabled/*;', '}'), { owner: 'root' });
  f.mkdirp('/etc/nginx/conf.d', 'root', M('755'));
  f.put('/etc/logrotate.d/nginx', NGB.LOGROTATE, { owner: 'root', mode: M('644') });
  var sites = Object.assign({}, NGB.SITES, o.sites || {});
  Object.keys(sites).forEach(function (n) {
    if (sites[n] === null) return;
    if (o.only && o.only.indexOf(n) < 0 && n !== 'tutor.haiphan.org' && n !== 'api-tutor.haiphan.org') return;
    C.site(s, n, sites[n]);
  });
  (o.extraSites || []).forEach(function (e) { C.site(s, e[0], e[1]); });
  V.ngSeedLog(s, { n: o.n || 600, slow504: !!o.slow });
  var err = '2026/10/27 09:12:03 [notice] 1021#1021: signal process started\n';
  if (o.slow) { W.ngx2slow = true; for (var i = 0; i < 4; i++) err += '2026/10/27 12:0' + (4 + i) + ':11 [error] 1021#1021: *' + (88 + i) + ' upstream timed out (110: Connection timed out) while reading response header from upstream, client: 203.0.113.' + (7 + i) + ', server: api-tutor.haiphan.org, request: "GET /api/reports/monthly HTTP/1.1", upstream: "http://127.0.0.1:8888/api/reports/monthly", host: "api-tutor.haiphan.org"\n'; }
  f.put('/var/log/nginx/error.log', err, { owner: 'root', mode: M('640') });
  s.cwd = s.home;
  V.ngReload(s, false);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
