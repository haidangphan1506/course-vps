(function (G) {
'use strict';
/* Dữ liệu và hàm dùng chung cho 8 chương "Linux căn bản". Thư mục làm việc: ~/work */
var V = G.VPS, C = G.COURSE;
var DAY = 86400000;
var NOTES = ['Họp nhóm thứ Hai: chốt lịch dạy thêm tuần sau.', 'Nhớ gia hạn domain haiphan.org trước ngày 30.', 'Sao lưu cơ sở dữ liệu mỗi đêm lúc 02:00.'];
var TODO = ['# Việc cần làm', '- [ ] Cập nhật Node.js lên bản LTS', '- [ ] Tắt đăng nhập SSH bằng mật khẩu', '- [x] Cài Nginx'];
var README = ['# Tutor API', '', 'API cho nền tảng gia sư. Chạy bằng Node.js, cổng 3000.', '', '## Chạy thử', '', '    npm install', '    npm start'];
var PKG = ['{', '  "name": "tutor-api",', '  "version": "1.4.2",', '  "scripts": { "start": "node src/app.js" }', '}'];
var APPJS = ["const express = require('express');", 'const app = express();', "app.get('/healthz', (req, res) => res.send('ok'));", 'app.listen(process.env.PORT || 3000);'];
var APPLOG = ['2026-10-27 10:00:01 INFO  api start port=3000', '2026-10-27 10:00:09 ERROR api GET /users 500', '2026-10-27 10:04:00 INFO  api GET /healthz 200'];
var USERS = ['id,name,role', '1,An,student', '2,Bình,student', '3,Cô Hà,teacher'];
var BACKUPSH = ['#!/bin/bash', 'tar czf ~/backups/work-$(date +%F).tgz ~/work/projects', 'echo "đã sao lưu"'];
var DEPLOYSH = ['#!/bin/bash', 'cd ~/work/projects/tutor && git pull && npm ci && pm2 restart tutor-api'];

function put(s2, path, text, o) {
  o = o || {};
  s2.fs.put(path, text, { owner: s2.user, mode: o.mode != null ? o.mode : 420, size: o.size });
  var n = s2.fs.get(path, true); if (o.days != null) n.mt = V.base.NOW_MS - o.days * DAY;
}
function lines(a) { return a.join('\n') + '\n'; }

var LB = C.LB = {
  put: put,
  hardlink: function (fs, a, b) { var n = fs.n[a]; n.nl = (n.nl || 1) + 1; fs.n[b] = n; },
  base: function (s, o) {
    o = o || {};
    C.linBase(s, { runaway: !!o.runaway, setup2: function (s3, S, l) { if (S && S.pkgs) S.pkgs.plocate = { ver: '1.1.19-1build1', manual: true, rc: false }; if (o.setup2) o.setup2(s3, S, l); }, setup: function (s2, l) {
      var h = s2.home + '/work', fs = s2.fs, u = s2.user;
      ['', '/photos', '/photos/holiday', '/projects', '/projects/tutor', '/projects/tutor/src', '/projects/tutor/src/routes', '/projects/tutor/node_modules', '/projects/tutor/node_modules/left-pad', '/logs', '/scripts', '/tmp', '/data', '/reports'].forEach(function (d) { fs.mkdirp(h + d, u, 493); });
      fs.mkdirp(s2.home + '/bin', u, 493); fs.mkdirp(s2.home + '/backups', u, 493);
      put(s2, h + '/notes.txt', lines(NOTES)); put(s2, h + '/todo.md', lines(TODO));
      put(s2, h + '/report.pdf', '%PDF-1.4\n(giả lập)\n', { size: 245760 });
      put(s2, h + '/photos/a.jpg', 'JFIF', { size: 2200000 }); put(s2, h + '/photos/b.jpg', 'JFIF', { size: 1800000 }); put(s2, h + '/photos/c.png', 'PNG', { size: 530000 });
      put(s2, h + '/photos/holiday/d.jpg', 'JFIF', { size: 3100000 });
      put(s2, h + '/projects/tutor/README.md', lines(README)); put(s2, h + '/projects/tutor/package.json', lines(PKG));
      put(s2, h + '/projects/tutor/.env', 'PORT=3000\nDATABASE_URL=postgres://app:secret@127.0.0.1:5432/tutor_db\n', { mode: 384 });
      put(s2, h + '/projects/tutor/.gitignore', 'node_modules\n.env\ndist\n');
      put(s2, h + '/projects/tutor/src/app.js', lines(APPJS)); put(s2, h + '/projects/tutor/src/util.js', 'exports.sum = (a, b) => a + b;\n');
      put(s2, h + '/projects/tutor/src/routes/users.js', "module.exports = (app) => app.get('/users', (req, res) => res.json([]));\n");
      put(s2, h + '/projects/tutor/node_modules/left-pad/index.js', 'module.exports = (s, n) => String(s).padStart(n);\n');
      put(s2, h + '/logs/app.log', lines(APPLOG)); put(s2, h + '/logs/error.log', 'TypeError: x is undefined\n', { size: 48000, days: 2 });
      put(s2, h + '/logs/old.log', 'cũ\n', { size: 5242880, days: 40 });
      put(s2, h + '/scripts/backup.sh', lines(BACKUPSH), { mode: 420 }); put(s2, h + '/scripts/deploy.sh', lines(DEPLOYSH), { mode: 493 });
      put(s2, h + '/tmp/cache1.tmp', 'x\n', { days: 12 }); put(s2, h + '/tmp/cache2.tmp', 'x\n', { days: 9 }); put(s2, h + '/tmp/session.tmp', 'x\n', { days: 0 });
      put(s2, h + '/data/users.csv', lines(USERS));
      put(s2, h + '/.hidden-note', 'file ẩn: bắt đầu bằng dấu chấm\n');
      put(s2, s2.home + '/.bashrc', "# ~/.bashrc\nexport EDITOR=nano\nalias ll='ls -la'\nalias gs='git status'\n", {});
      put(s2, s2.home + '/.profile', "# ~/.profile\nif [ -d \"$HOME/bin\" ]; then PATH=\"$HOME/bin:$PATH\"; fi\n", {});
      V.base.seedProc(s2);
      fs.put('/etc/shadow', 'root:*:19900:0:99999:7:::\nhaidangphan:$y$j9T$abc$xyz:19900:0:99999:7:::\n', { owner: 'root', mode: 416 }); fs.n['/etc/shadow'].group = 'shadow';
      fs.put('/etc/sudoers', 'Defaults\tenv_reset\nroot\tALL=(ALL:ALL) ALL\n%sudo\tALL=(ALL:ALL) ALL\n@includedir /etc/sudoers.d\n', { owner: 'root', mode: 288 });
      fs.mkdirp('/etc/sudoers.d', 'root', 493); fs.mkdirp('/srv', 'root', 493);
      ['passwd', 'su', 'mount', 'chfn'].forEach(function (b) { fs.put('/usr/bin/' + b, 'ELF', { owner: 'root', mode: parseInt('4755', 8) }); });
      if (fs.n['/tmp']) fs.n['/tmp'].mode = 1023; if (fs.n['/root']) fs.n['/root'].mode = 448;
      if (o.setup) o.setup(s2, l, h);
    } });
    s.cwd = s.home + '/work';
  }
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
