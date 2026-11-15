(function (G) {
'use strict';
var V = G.VPS, IP = V.IP;
var C = G.COURSE = { lessons: [] };
var M = function (x) { return parseInt(x, 8); };
function L() { return Array.prototype.slice.call(arguments); }
C.L = L; C.M = M;
C.ran = function (sh, re, sudo) {
  return sh.hist.some(function (h) { return h.code === 0 && re.test(h.cmd) && (sudo == null || h.sudo === sudo); });
};
function p2(n) { return (n < 10 ? '0' : '') + n; }
C.authLog = function (counts) {
  var out = [], t = 0, users = ['admin', 'root', 'ubuntu', 'test', 'postgres', 'oracle'];
  Object.keys(counts).forEach(function (ip) {
    for (var i = 0; i < counts[ip]; i++) {
      var u = users[(i + ip.length) % users.length];
      var h = 1 + (t * 7) % 8, mi = (t * 13) % 60, se = (t * 29) % 60;
      out.push('Oct 26 0' + h + ':' + p2(mi) + ':' + p2(se) + ' vps sshd[' + (2200 + t) + ']: Failed password for ' + (u === 'root' ? 'root' : 'invalid user ' + u) + ' from ' + ip + ' port ' + (30000 + (t * 137) % 30000) + ' ssh2');
      t++;
    }
  });
  out.sort();
  out.push('Oct 26 09:12:44 vps sshd[3011]: Accepted publickey for haidangphan from 203.0.113.7 port 51022 ssh2: ED25519 SHA256:abc');
  return out.join('\n') + '\n';
};
C.lastb = function (counts) {
  var out = [];
  Object.keys(counts).forEach(function (ip) { for (var i = 0; i < Math.min(counts[ip], 12); i++) out.push(('root').padEnd(9) + 'ssh:notty'.padEnd(13) + ip.padEnd(17) + 'Mon Oct 26 0' + (1 + i % 8) + ':' + p2((i * 11) % 60) + ' - 0' + (1 + i % 8) + ':' + p2((i * 11) % 60) + '  (00:00)'); });
  return out;
};

var SSHD = L('Include /etc/ssh/sshd_config.d/*.conf', 'Port 22', 'PermitRootLogin no', 'PasswordAuthentication yes', 'PubkeyAuthentication yes', 'UsePAM yes', 'X11Forwarding no', 'AcceptEnv LANG LC_*', 'Subsystem sftp /usr/lib/openssh/sftp-server', '').join('\n');
C.SSHD = SSHD;

C.vpsBase = function (s, o) {
  o = o || {};
  var W = s.W, f = s.fs, u = s.user, h = s.home;
  W.dns['tutor.haiphan.org'] = { ip: IP, proxied: false };
  W.dns['api-tutor.haiphan.org'] = { ip: IP, proxied: false };
  f.mkdirp('/etc/nginx/sites-available', 'root'); f.mkdirp('/etc/nginx/sites-enabled', 'root');
  f.put('/etc/nginx/nginx.conf', 'user www-data;\nworker_processes auto;\nevents { worker_connections 768; }\nhttp {\n    include /etc/nginx/sites-enabled/*;\n}\n');
  f.put('/etc/nginx/sites-available/000-default-deny', 'server {\n    listen 80 default_server;\n    listen [::]:80 default_server;\n    server_name _;\n    return 444;\n}\n');
  f.link('/etc/nginx/sites-enabled/000-default-deny', '/etc/nginx/sites-available/000-default-deny');
  f.put('/etc/ssh/sshd_config', SSHD);
  var counts = o.attackers || { '45.155.205.12': 40, '185.220.101.4': 18, '92.118.39.62': 7 };
  f.put('/var/log/auth.log', C.authLog(counts), { owner: 'root', mode: M('640') });
  f.mkdirp('/var/log/nginx', 'root', M('750'));
  f.put('/var/log/nginx/access.log', '203.0.113.7 - - [26/Oct/2026:09:13:01 +0700] "GET / HTTP/2.0" 200 5120 "-" "Mozilla/5.0"\n', { owner: 'root', mode: M('640') });
  f.mkdirp(h + '/tutor/gateway', u);
  W.journal.nginx = ['Oct 26 09:12:03 vps systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...', 'Oct 26 09:12:03 vps systemd[1]: Started nginx.service - A high performance web server and a reverse proxy server.', 'Oct 26 17:31:55 vps nginx[1021]: signal process started'];
  W.lastb = C.lastb(counts);
  V.ngReload(s, false);
};

C.link = function (s, name) { s.fs.link('/etc/nginx/sites-enabled/' + name, '/etc/nginx/sites-available/' + name); };
C.site = function (s, name, text) { s.fs.put('/etc/nginx/sites-available/' + name, text, { owner: 'root' }); C.link(s, name); };

C.composeFile = L(
  'services:',
  '  postgres:',
  '    image: postgres:16',
  '    container_name: tutor-postgres',
  '    restart: unless-stopped',
  '    env_file:',
  '      - docker.env',
  '    ports:',
  '      - "127.0.0.1:5432:5432"',
  '    volumes:',
  '      - pgdata:/var/lib/postgresql/data',
  '  api:',
  '    image: tutor-api:latest',
  '    container_name: tutor-api',
  '    restart: unless-stopped',
  '    env_file:',
  '      - docker.env',
  '    ports:',
  '      - "127.0.0.1:8888:8888"',
  '    depends_on:',
  '      - postgres',
  'volumes:',
  '  pgdata:', '').join('\n');

C.lesson = function (o) { C.lessons.push(o); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
