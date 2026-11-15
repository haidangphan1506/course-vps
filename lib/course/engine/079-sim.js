(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, NGB = C.NGB;
function L() { return Array.prototype.slice.call(arguments).join('\n') + '\n'; }
var NGC = C.NGC = {};
function big(n, unit) { var s = ''; while (s.length < n) s += unit; return s.slice(0, n); }

NGC.TUT_BOTH = L('server {', '    listen 80;', '    listen 443 ssl;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    root /var/www/tutor;', '', '    location /assets/ {', '    }', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}');
NGC.API_PLAIN = L('server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location /api/ {', '        proxy_pass http://127.0.0.1:8888;', '    }', '', '    location = /health {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}');

/* o: {sites, extraSites, conf:{tên: nội dung}, pool, backends:false} */
NGC.base = function (s, o) {
  o = o || {};
  var f = s.fs, W = s.W, u = s.user, h = s.home;
  NGB.base(s, { only: [], sites: Object.assign({ 'tutor.haiphan.org': NGC.TUT_BOTH, 'api-tutor.haiphan.org': NGC.API_PLAIN }, o.sites || {}) });
  W.extra = W.extra.filter(function (e) { return e.port !== 8888; });
  W.dns['www.tutor.haiphan.org'] = { ip: V.IP, proxied: false };
  C.certs(s, 'tutor.haiphan.org');
  f.mkdirp('/var/cache', 'root', M('755'));
  f.put('/var/www/tutor/assets/app.js', big(60000, 'console.log("tutor bundle");function a(){return 1}\n').replace(/\n$/, '') , { owner: 'root' });
  f.put('/var/www/tutor/assets/style.css', big(20000, 'body{margin:0;font-family:sans-serif}.btn{padding:4px 8px}\n').replace(/\n$/, ''), { owner: 'root' });
  f.put('/var/www/tutor/assets/logo.png', big(8000, 'PNG\x89\x00\x01\x02binary').replace(/\n$/, ''), { owner: 'root' });
  var app = h + '/tutor-api';
  f.mkdirp(app + '/dist', u); f.put(app + '/dist/main.js', '// api\n', { owner: u });
  function pm(name, port, pid) { W.pm2[name] = { name: name, dir: app, port: port, script: 'dist/main.js', status: 'online', pid: pid, restarts: 0, logs: ['Nest application successfully started', 'Listening on ' + port] }; }
  pm('api', 8888, 5102);
  if (o.backends !== false) { pm('api-1', 8881, 5111); pm('api-2', 8882, 5112); pm('api-3', 8883, 5113); }
  Object.keys(o.conf || {}).forEach(function (n) { f.put('/etc/nginx/conf.d/' + n, o.conf[n], { owner: 'root' }); });
  (o.extraSites || []).forEach(function (e) { C.site(s, e[0], e[1]); });
  s.cwd = h;
  V.ngReload(s, false);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
