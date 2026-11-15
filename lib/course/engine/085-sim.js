(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M, NGE = C.NGE;
var NGF = C.NGF = {};
var CERT = ['    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;'];
NGF.SNIPPET = ['proxy_set_header Host $host;', 'proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-Proto $scheme;'];

/* o: {h2, hsts, hstsLoc, assets, reqid, snippets, status:'open'|'local', log:'json'|'timing', cache:0|1|2, ttl, limit:0|1|2|3} */
NGF.site = function (o) {
  o = o || {};
  var a = ['server {', '    listen 80;', '    listen 443 ssl' + (o.h2 ? ' http2' : '') + ';', '    server_name tutor.haiphan.org;'].concat(CERT).concat(['    root /var/www/tutor;']);
  if (o.hsts) a.push('    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
  if (o.reqid) a.push('    add_header X-Request-ID $request_id always;');
  if (o.cache) a.push('    add_header X-Cache-Status $upstream_cache_status always;');
  if (o.log) a.push('    access_log /var/log/nginx/tutor.' + (o.log === 'json' ? 'json' : 'timing') + '.log ' + o.log + ';');
  a.push('');
  if (o.status === 'open' || o.status === 'acl') a = a.concat(['    location = /nginx_status {', '        stub_status;'], o.status === 'acl' ? ['        allow 127.0.0.1;', '        deny all;'] : [], ['    }', '']);
  if (o.assets) a = a.concat(['    location /assets/ {', '        expires 7d;', '        add_header Cache-Control "public";'], o.hstsLoc ? ['        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'] : [], ['    }', '']);
  a = a.concat(['    location /api/ {', '        proxy_pass http://127.0.0.1:8888;']);
  a = a.concat(o.snippets ? ['        include snippets/proxy-common.conf;'] : NGF.SNIPPET.map(function (l) { return '        ' + l; }));
  if (o.reqid) a.push('        proxy_set_header X-Request-ID $request_id;');
  if (o.cache) {
    a.push('        proxy_cache api_cache;');
    if (o.cache === 1) a.push('        proxy_cache_valid 200 ' + (o.ttl || '10m') + ';');
    else a = a.concat(['        proxy_cache_valid 200 10s;', '        proxy_cache_lock on;', '        proxy_cache_use_stale updating error timeout http_500 http_502 http_503;', '        proxy_cache_background_update on;']);
  }
  if (o.limit) {
    a.push('        limit_req zone=api burst=' + (o.limit === 3 ? 10 : (o.burst || 3)) + ' nodelay;');
    if (o.limit === 2) a.push('        limit_req_dry_run on;');
    if (o.limit === 3) a.push('        limit_req_status 429;');
  }
  a = a.concat(['    }', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}']);
  if (o.status === 'local') a = a.concat(['', 'server {', '    listen 127.0.0.1:8080;', '    server_name _;', '', '    location = /nginx_status {', '        stub_status;', '    }', '}']);
  return a;
};
NGF.SITE0 = NGF.site({});

function seedAccess(n) {
  var lines = [], ips = ['203.0.113.10', '203.0.113.24', '198.51.100.7', '192.0.2.55', '203.0.113.88'], paths = ['/', '/api/courses', '/api/users', '/assets/app.js', '/api/lessons/12', '/files/notes.txt'];
  var codes = []; for (var i = 0; i < 240; i++) codes.push(i % 40 === 7 ? 502 : (i % 29 === 3 ? 404 : (i % 53 === 9 ? 499 : 200)));
  for (i = 0; i < n; i++) {
    var t = 21 * 3600 + 40 * 60 + i * 3, hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60, p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    lines.push(ips[i % ips.length] + ' - - [26/Oct/2026:' + p2(hh) + ':' + p2(mm) + ':' + p2(ss) + ' +0700] "GET ' + paths[(i * 7) % paths.length] + ' HTTP/1.1" ' + codes[i % codes.length] + ' ' + (codes[i % codes.length] === 502 ? 157 : 1200 + (i * 37) % 900) + ' "-" "Mozilla/5.0"');
  }
  return lines.join('\n') + '\n';
}

/* o: {site:{…}, seedErr, seedAcc, conf:{…}} */
NGF.base = function (s, o) {
  o = o || {};
  var f = s.fs;
  NGE.base(s, Object.assign({}, o, { sites: { 'tutor.haiphan.org': NGF.site(o.site || {}).join('\n') + '\n' } }));
  f.mkdirp('/etc/nginx/snippets', 'root', M('755'));
  f.put('/etc/nginx/snippets/snakeoil.conf', 'ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;\nssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;\n', { owner: 'root' });
  f.put('/etc/nginx/snippets/fastcgi-php.conf', 'fastcgi_split_path_info ^(.+?\\.php)(/.*)$;\ntry_files $fastcgi_script_name =404;\nfastcgi_pass unix:/run/php/php-fpm.sock;\n', { owner: 'root' });
  if (o.site && o.site.snippets) f.put('/etc/nginx/snippets/proxy-common.conf', NGF.SNIPPET.join('\n') + '\n', { owner: 'root' });
  if (o.seedErr) {
    var e = '', k;
    for (k = 0; k < 3; k++) e += '2026/10/26 21:4' + k + ':12 [alert] 1022#1022: *4821' + k + ' 768 worker_connections are not enough while connecting to upstream, client: 203.0.113.5' + k + ', server: tutor.haiphan.org, request: "GET /api/courses HTTP/1.1", upstream: "http://127.0.0.1:8888/api/courses", host: "tutor.haiphan.org"\n';
    for (k = 0; k < 2; k++) e += '2026/10/26 21:4' + k + ':14 [crit] 1022#1022: accept4() failed (24: Too many open files)\n';
    var en = f.get('/var/log/nginx/error.log'); f.put('/var/log/nginx/error.log', (en && en.c ? en.c : '') + e, { owner: 'root', mode: M('640') });
  }
  if (o.seedAcc) f.put('/var/log/nginx/access.log', seedAccess(o.seedAcc), { owner: 'root', mode: M('640') });
  V.ngReload(s, false);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
