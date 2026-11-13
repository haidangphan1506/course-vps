(function (G) {
'use strict';
/* Dữ liệu mẫu dùng chung cho 4 chương văn bản: grep, sed, awk, công cụ text. Tất cả nằm trong ~/lab. */
var V = G.VPS, C = G.COURSE;

var UA = { M: 'Mozilla/5.0 (X11; Linux x86_64)', G: 'Googlebot/2.1', C: 'curl/8.5.0', S: 'python-requests/2.31', Z: 'Mozilla/5.0 zgrab/0.x' };
/* ip, giây (từ 10:00:00), method, path, status, bytes, ua */
var REQ = [
  ['203.0.113.5', 1, 'GET', '/', 200, 5120, 'M'],
  ['203.0.113.5', 2, 'GET', '/assets/app.js', 200, 88231, 'M'],
  ['203.0.113.5', 2, 'GET', '/assets/app.css', 304, 0, 'M'],
  ['198.51.100.7', 9, 'POST', '/api/login', 200, 312, 'S'],
  ['198.51.100.7', 10, 'GET', '/api/users', 200, 2048, 'S'],
  ['45.9.148.1', 14, 'GET', '/wp-login.php', 404, 162, 'Z'],
  ['45.9.148.1', 14, 'GET', '/.env', 404, 162, 'Z'],
  ['45.9.148.1', 15, 'GET', '/phpmyadmin/', 404, 162, 'Z'],
  ['14.161.20.3', 21, 'GET', '/api/sessions', 200, 1500, 'M'],
  ['14.161.20.3', 22, 'POST', '/api/sessions', 201, 220, 'M'],
  ['14.161.20.3', 25, 'GET', '/api/sessions/42', 200, 640, 'M'],
  ['66.249.66.1', 31, 'GET', '/robots.txt', 200, 55, 'G'],
  ['66.249.66.1', 32, 'GET', '/', 200, 5120, 'G'],
  ['192.0.2.44', 40, 'POST', '/api/login', 401, 45, 'C'],
  ['192.0.2.44', 41, 'POST', '/api/login', 401, 45, 'C'],
  ['192.0.2.44', 42, 'POST', '/api/login', 401, 45, 'C'],
  ['192.0.2.44', 44, 'POST', '/api/login', 200, 312, 'C'],
  ['203.0.113.5', 50, 'GET', '/api/users', 200, 2048, 'M'],
  ['203.0.113.5', 52, 'GET', '/api/payments', 500, 120, 'M'],
  ['198.51.100.7', 61, 'GET', '/api/payments', 502, 150, 'S'],
  ['198.51.100.7', 63, 'GET', '/api/payments', 502, 150, 'S'],
  ['14.161.20.3', 70, 'GET', '/healthz', 200, 2, 'C'],
  ['14.161.20.3', 100, 'GET', '/healthz', 200, 2, 'C'],
  ['203.0.113.5', 104, 'GET', '/api/users/7', 404, 90, 'M'],
  ['192.0.2.44', 110, 'DELETE', '/api/sessions/42', 204, 0, 'C'],
  ['45.9.148.1', 118, 'GET', '/admin', 404, 162, 'Z'],
  ['45.9.148.1', 119, 'GET', '/api/users', 401, 45, 'Z'],
  ['203.0.113.5', 125, 'GET', '/about', 200, 9999, 'M'],
  ['192.0.2.4', 131, 'GET', '/api/users', 200, 2048, 'C'],
  ['203.0.113.5', 140, 'GET', '/api/users', 200, 2048, 'M']
];
function two(n) { return (n < 10 ? '0' : '') + n; }
function accessLog() {
  return REQ.map(function (r) {
    var t = r[1], ts = '10:' + two(Math.floor(t / 60)) + ':' + two(t % 60);
    return r[0] + ' - - [27/Oct/2026:' + ts + ' +0700] "' + r[2] + ' ' + r[3] + ' HTTP/1.1" ' + r[4] + ' ' + r[5] + ' "-" "' + UA[r[6]] + '"';
  }).join('\n') + '\n';
}

var APP = [
  '2026-10-27 10:00:01 INFO  api     start port=3000',
  '2026-10-27 10:00:02 INFO  db      connected host=127.0.0.1 db=tutor_db',
  '2026-10-27 10:00:05 WARN  db      slow query ms=1200 table=sessions',
  '2026-10-27 10:00:09 ERROR api     GET /users 500 user=an',
  "2026-10-27 10:00:09 ERROR api     TypeError: Cannot read properties of undefined (reading 'id')",
  '    at UsersController.list (/srv/tutor/dist/users.js:42:17)',
  '    at Layer.handle [as handle_request] (/srv/tutor/node_modules/express/lib/router/layer.js:95:5)',
  '2026-10-27 10:00:10 INFO  worker  job=email-reminder queued=12',
  '2026-10-27 10:01:00 INFO  api     GET /login 200 user=binh',
  '2026-10-27 10:01:12 DEBUG api     cache miss key=session:42',
  '2026-10-27 10:01:30 ERROR db      connection refused host=127.0.0.1 port=5432',
  '2026-10-27 10:01:31 ERROR api     GET /sessions 503 user=an',
  '2026-10-27 10:01:45 WARN  worker  retry job=email-reminder attempt=2',
  '2026-10-27 10:02:00 ERROR api     POST /pay 502 user=an',
  '2026-10-27 10:02:05 INFO  db      reconnected host=127.0.0.1 db=tutor_db',
  '2026-10-27 10:02:10 INFO  api     GET /sessions 200 user=binh ms=48',
  '2026-10-27 10:02:30 INFO  api     GET /sessions 200 user=chau ms=1530',
  '2026-10-27 10:03:00 WARN  api     rate limit user=an ip=192.0.2.44',
  '2026-10-27 10:03:15 INFO  worker  job=email-reminder done sent=12',
  '2026-10-27 10:03:40 DEBUG db      pool idle=3 busy=1',
  '2026-10-27 10:04:00 INFO  api     GET /healthz 200 ms=2',
  '2026-10-27 10:04:20 error api     manual test entry (lowercase)',
  '2026-10-27 10:05:00 INFO  api     shutdown signal=SIGTERM'
];

var AUTH = [
  'Oct 27 03:12:40 vps sshd[1801]: Failed password for root from 45.9.148.1 port 51222 ssh2',
  'Oct 27 03:12:44 vps sshd[1801]: Failed password for root from 45.9.148.1 port 51222 ssh2',
  'Oct 27 03:12:49 vps sshd[1805]: Failed password for invalid user admin from 45.9.148.1 port 51310 ssh2',
  'Oct 27 03:12:55 vps sshd[1805]: Failed password for invalid user admin from 45.9.148.1 port 51310 ssh2',
  'Oct 27 03:13:02 vps sshd[1809]: Invalid user test from 91.240.118.5 port 40112',
  'Oct 27 03:13:04 vps sshd[1809]: Failed password for invalid user test from 91.240.118.5 port 40112 ssh2',
  'Oct 27 03:13:20 vps sshd[1812]: Connection closed by authenticating user root 45.9.148.1 port 51400 [preauth]',
  'Oct 27 03:14:01 vps sshd[1815]: Failed password for root from 45.9.148.1 port 51444 ssh2',
  'Oct 27 03:15:30 vps sshd[1820]: Failed password for root from 185.220.101.9 port 33100 ssh2',
  'Oct 27 03:15:33 vps sshd[1820]: Failed password for root from 185.220.101.9 port 33100 ssh2',
  'Oct 27 03:15:39 vps sshd[1820]: Failed password for root from 185.220.101.9 port 33100 ssh2',
  'Oct 27 08:02:11 vps sshd[2201]: Accepted publickey for haidangphan from 14.161.20.3 port 52311 ssh2: ED25519 SHA256:abc123xyz',
  'Oct 27 08:02:11 vps sshd[2201]: pam_unix(sshd:session): session opened for user haidangphan(uid=1000) by (uid=0)',
  'Oct 27 08:05:30 vps sudo: haidangphan : TTY=pts/0 ; PWD=/home/haidangphan ; USER=root ; COMMAND=/usr/bin/apt update',
  'Oct 27 08:06:12 vps sudo: haidangphan : TTY=pts/0 ; PWD=/home/haidangphan ; USER=root ; COMMAND=/usr/bin/systemctl restart tutor',
  'Oct 27 09:40:00 vps sshd[2201]: pam_unix(sshd:session): session closed for user haidangphan',
  'Oct 27 11:20:05 vps sshd[2410]: Failed password for haidangphan from 14.161.20.3 port 52900 ssh2',
  'Oct 27 11:20:18 vps sshd[2410]: Accepted password for haidangphan from 14.161.20.3 port 52900 ssh2'
];

var ORDERS = [
  'id,date,customer,item,qty,price',
  '1001,2026-10-01,An,Gói Toán 10,2,250000',
  '1002,2026-10-02,Bình,Gói Lý 11,1,300000',
  '1003,2026-10-02,An,Gói Lý 11,1,300000',
  '1004,2026-10-03,Châu,Gói Toán 12,3,280000',
  '1005,2026-10-05,Dũng,Gói Toán 10,1,250000',
  '1006,2026-10-07,Bình,Gói Toán 12,2,280000',
  '1007,2026-10-08,An,Gói Hoá 10,1,260000',
  '1008,2026-10-09,Châu,Gói Lý 11,2,300000',
  '1009,2026-10-12,Dũng,Gói Toán 12,1,280000',
  '1010,2026-10-14,An,Gói Toán 12,1,280000',
  '1011,2026-10-15,Bình,Gói Hoá 10,4,260000',
  '1012,2026-10-20,Châu,Gói Toán 10,1,250000'
];

var GRADES = ['name\tmath\tphysics\tchem', 'An\t9\t8\t7', 'Bình\t7\t9\t8', 'Châu\t10\t6\t9', 'Dũng\t5\t7\t6', 'Hà\t8\t8\t10'];
var SERVERS = ['web1 10.0.0.11 web ubuntu-22.04', 'web2 10.0.0.12 web ubuntu-22.04', 'db1 10.0.0.21 db ubuntu-24.04', 'cache1 10.0.0.31 cache debian-12', 'backup1 10.0.0.41 backup ubuntu-22.04'];
var EMAILS = ['an@example.com', 'binh@example.com', 'An@Example.com', 'chau@example.com', 'an@example.com', 'dung@example.com', 'binh@example.com', 'ha@example.com'];
var ENV = ['# Tutor API - môi trường', 'NODE_ENV=production', 'PORT=3000', '', '# Cơ sở dữ liệu', 'DATABASE_URL=postgres://app:secret@127.0.0.1:5432/tutor_db', 'JWT_SECRET=change-me', 'DEBUG=false', ''];
var SITE = [
  '# tutor.haiphan.org',
  'server {',
  '    listen 80;',
  '    server_name tutor.haiphan.org;',
  '    root /var/www/html;',
  '',
  '    location / {',
  '        try_files $uri /index.html;',
  '    }',
  '',
  '    location /api/ {',
  '        # cổng cũ 3000',
  '        proxy_pass http://127.0.0.1:3000;',
  '        proxy_set_header Host $host;',
  '    }',
  '}'
];
var SSHD = [
  '# sshd_config (trích)',
  'Include /etc/ssh/sshd_config.d/*.conf',
  '#Port 22',
  '#PermitRootLogin prohibit-password',
  'PasswordAuthentication yes',
  '#MaxAuthTries 6',
  'X11Forwarding yes',
  'UsePAM yes'
];

C.TXT = {
  accessLog: accessLog, APP: APP, AUTH: AUTH, ORDERS: ORDERS, GRADES: GRADES, SERVERS: SERVERS, EMAILS: EMAILS, ENV: ENV, SITE: SITE, SSHD: SSHD, REQ: REQ,
  base: function (s, o) {
    o = o || {};
    C.linBase(s, { runaway: false, setup: function (s2, l) {
      var h = s2.home, own = { owner: s2.user, mode: 420 };
      s2.fs.mkdirp(h + '/lab', s2.user, 493);
      s2.fs.mkdirp(h + '/bin', s2.user, 493);
      s2.fs.put(h + '/lab/access.log', accessLog(), own);
      s2.fs.put(h + '/lab/app.log', APP.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/auth.log', AUTH.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/orders.csv', ORDERS.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/grades.tsv', GRADES.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/servers.txt', SERVERS.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/emails.txt', EMAILS.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/.env', ENV.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/site.conf', SITE.join('\n') + '\n', own);
      s2.fs.put(h + '/lab/sshd_config', SSHD.join('\n') + '\n', own);
      if (o.setup) o.setup(s2, l);
    }, setup2: o.setup2 ? function (s3, S, l) { o.setup2(s3, S, l); } : undefined });
    s.cwd = s.home + '/lab';
  }
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
