(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, NGC = C.NGC;
function L() { return Array.prototype.slice.call(arguments).join('\n') + '\n'; }
var NGD = C.NGD = {};
var CERT = ['    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;'];

/* site tutor cho chương Nginx (4): web 3000, API 8888, /socket.io/ và /auth/ chưa cấu hình đúng */
NGD.site = function (o) {
  o = o || {};
  var a = ['server {', '    listen 80;', '    listen 443 ssl;', '    server_name tutor.haiphan.org;'].concat(CERT).concat(['']);
  if (o.pre) a = a.concat(o.pre);
  a = a.concat(['    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '']);
  a = a.concat(o.api || ['    location /api/ {', '        proxy_pass http://127.0.0.1:8888;', '    }', '']);
  if (o.upload) a = a.concat(o.upload);
  a = a.concat(o.ws || ['    location /socket.io/ {', '        proxy_pass http://127.0.0.1:8888;', '    }', '']);
  if (o.events) a = a.concat(o.events);
  a = a.concat(o.auth || ['    location /auth/ {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_set_header Host $host;', '    }']);
  a.push('}');
  return a;
};
NGD.SITE0 = NGD.site();

NGD.base = function (s, o) {
  o = o || {};
  var f = s.fs, W = s.W, u = s.user, h = s.home;
  W.ngx3 = true;
  NGC.base(s, Object.assign({}, o, { sites: Object.assign({ 'tutor.haiphan.org': NGD.SITE0.join('\n') + '\n' }, o.sites || {}) }));
  f.mkdirp(h + '/uploads', u);
  f.put(h + '/uploads/small.txt', 'hello tutor\n', { owner: u });
  f.put(h + '/uploads/avatar.png', '', { owner: u, size: 2 * 1048576 });
  f.put(h + '/uploads/lesson.mp4', '', { owner: u, size: 25 * 1048576 });
  s.cwd = h;
  V.ngReload(s, false);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
