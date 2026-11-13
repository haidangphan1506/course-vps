(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, NGC = C.NGC;
var NGE = C.NGE = {};
var CERT = ['    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;'];

/* o: {media:'root'|'alias', files:'plain'|'auto', errors:0|1|2, accel, hotlink, admin:'open'|'auth'|'any', bots, redirects, canary, geo} */
NGE.site = function (o) {
  o = o || {};
  var a = ['server {', '    listen 80;', '    listen 443 ssl;', '    server_name tutor.haiphan.org;'].concat(CERT).concat(['    root /var/www/tutor;', '']);
  if (o.bots) a = a.concat(['    if ($bad_bot) {', '        return 403;', '    }']);
  if (o.redirects) a = a.concat(['    if ($new_uri) {', '        return 301 $new_uri;', '    }']);
  if (o.errors >= 1) a = a.concat(['    error_page 404 /errors/404.html;', '    error_page 500 502 503 504 /errors/50x.html;']);
  if (o.errors >= 2) a = a.concat(['    if (-f /var/www/maintenance.flag) {', '        add_header Retry-After 3600 always;', '        return 503;', '    }']);
  if (o.canary) a.push('    add_header X-Variant $variant;');
  if (o.geo) a.push('    add_header X-Office $is_office;');
  if (o.bots || o.redirects || o.errors || o.canary || o.geo) a.push('');
  a = a.concat(['    location /media/ {'], o.media === 'alias' ? ['        alias /srv/media/;'] : ['        root /srv/media;'], ['    }', '']);
  a = a.concat(['    location /files {'], o.files === 'auto' ? ['        autoindex on;'] : [], ['    }', '']);
  a = a.concat(['    location /assets/ {'], o.hotlink ? ['        valid_referers none blocked server_names;', '        if ($invalid_referer) {', '            return 403;', '        }'] : [], ['    }', '']);
  if (o.errors >= 1) a = a.concat(['    location ^~ /errors/ {', '        root /var/www;', '        internal;', '    }', '']);
  if (o.accel) a = a.concat(['    location /protected/ {', '        internal;', '        alias /var/protected/;', '    }', '']);
  a = a.concat(['    location /admin/ {', '        proxy_pass http://127.0.0.1:3100;']);
  if (o.admin === 'auth' || o.admin === 'any') a = a.concat(['        auth_basic "Khu vực quản trị";', '        auth_basic_user_file /etc/nginx/.htpasswd;']);
  if (o.admin === 'any') a = a.concat(['        satisfy any;', '        allow 203.0.113.0/24;', '        deny all;']);
  a = a.concat(['    }', '', '    location /api/ {', '        proxy_pass http://127.0.0.1:8888;', '    }', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}']);
  return a;
};
NGE.SITE0 = NGE.site({ media: 'root' });

NGE.base = function (s, o) {
  o = o || {};
  var f = s.fs, W = s.W, u = s.user, h = s.home;
  W.ngx3 = true;
  NGC.base(s, Object.assign({}, o, { sites: Object.assign({ 'tutor.haiphan.org': NGE.SITE0.join('\n') + '\n' }, o.sites || {}) }));
  f.put('/var/www/tutor/index.html', '<!doctype html><title>Tutor</title><h1>Gia sư Hải Phan</h1>\n', { owner: 'root' });
  f.mkdirp('/var/www/tutor/files/giao-trinh', 'root', M('755'));
  f.put('/var/www/tutor/files/report-2026.pdf', '%PDF-1.4 bao cao 2026\n', { owner: 'root' });
  f.put('/var/www/tutor/files/notes.txt', 'ghi chu buoi hoc\n', { owner: 'root' });
  f.put('/var/www/tutor/files/giao-trinh/bai1.txt', 'bai 1\n', { owner: 'root' });
  f.mkdirp('/srv/media', 'root', M('755'));
  f.put('/srv/media/intro.mp4', 'MP4 binary intro\n', { owner: 'root' });
  f.put('/srv/media/poster.jpg', 'JPG binary poster\n', { owner: 'root' });
  f.mkdirp('/var/protected', 'root', M('750'));
  f.put('/var/protected/report.pdf', '%PDF-1.4 bao cao bao mat\n', { owner: 'root' });
  f.mkdirp('/var/www/errors', 'root', M('755'));
  s.cwd = h;
  V.ngReload(s, false);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
