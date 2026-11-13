(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran;

var ECO = function (home) {
  return L('module.exports = {', '  apps: [', '    {', "      name: 'tutor-api',", "      cwd: '" + home + "/tutor/api',", "      script: 'dist/main.js',", "      env: { NODE_ENV: 'production', PORT: 3001 },", '    },', '    {', "      name: 'tutor-ui',", "      cwd: '" + home + "/tutor/ui',", "      script: 'npm',", "      args: 'start',", "      env: { NODE_ENV: 'production', PORT: 3000 },", '    },', '  ],', '};', '').join('\n');
};
// o: {dist, next, start}
C.pm2World = function (s, o) {
  o = o || {};
  var h = s.home, u = s.user, f = s.fs;
  f.mkdirp(h + '/tutor/api/src', u); f.mkdirp(h + '/tutor/ui/src', u);
  f.put(h + '/tutor/api/package.json', '{ "name": "tutor-api", "scripts": { "build": "nest build" } }\n', { owner: u });
  f.put(h + '/tutor/ui/package.json', '{ "name": "tutor-ui", "scripts": { "build": "next build" } }\n', { owner: u });
  f.put(h + '/tutor/ecosystem.config.js', ECO(h), { owner: u });
  if (o.dist) f.put(h + '/tutor/api/dist/main.js', '// build\n', { owner: u });
  if (o.next) f.put(h + '/tutor/ui/.next/BUILD_ID', 'abc\n', { owner: u });
  if (o.start) { var sc = s.cwd; s.cwd = h + '/tutor'; s.silent('pm2 start ecosystem.config.js'); s.cwd = sc; }
};
function online(s, n) { return !!s.W.pm2[n] && s.W.pm2[n].status === 'online'; }

C.lesson({
  id: 'c6', group: 'Ứng dụng', short: 'PM2 cho Next.js',
  title: 'PM2: chạy Next.js và NestJS như dịch vụ',
  dek: 'File ecosystem, build trước khi chạy, đọc log, tự khởi động cùng máy và gỡ lỗi errored, EADDRINUSE.',
  theory: [
    { tag: 'Khái niệm', title: 'PM2 giữ tiến trình Node luôn sống', body: [
      'Chạy `npm start` trong cửa sổ SSH thì đóng cửa sổ là ứng dụng tắt. **PM2** chạy ứng dụng nền, tự bật lại khi chết và khi VPS khởi động lại.',
      { pre: ['pm2 list                       # bảng trạng thái', 'pm2 logs tutor-api --lines 30', 'pm2 restart tutor-api', 'pm2 stop tutor-api', 'pm2 delete tutor-api'] }
    ] },
    { tag: 'Cú pháp', title: 'File ecosystem.config.js', body: [
      'Khai báo cả hai ứng dụng trong một file để bật bằng một lệnh và không phải nhớ tham số:',
      { pre: ['module.exports = {', '  apps: [', '    { name: \'tutor-api\', cwd: \'/home/haidangphan/tutor/api\',', '      script: \'dist/main.js\', env: { PORT: 3001 } },', '    { name: \'tutor-ui\', cwd: \'/home/haidangphan/tutor/ui\',', '      script: \'npm\', args: \'start\', env: { PORT: 3000 } },', '  ],', '};'], cap: '~/tutor/ecosystem.config.js' },
      { pre: ['cd ~/tutor', 'pm2 start ecosystem.config.js', 'pm2 start ecosystem.config.js --only tutor-api'] }
    ] },
    { tag: 'Lưu ý', title: 'Build trước, rồi mới start', body: [
      { tbl: [['Ứng dụng', 'Lệnh build', 'Thứ pm2 cần'], ['NestJS (tutor-api)', '`npm run build`', '`dist/main.js`'], ['Next.js (tutor-ui)', '`npm run build`', 'thư mục `.next/`']] },
      'Thiếu bản build thì PM2 báo `errored` ngay, log ghi `Cannot find module .../dist/main` hoặc `Could not find a production build in the .next directory`. Quy trình triển khai gọn: `git pull`, `npm ci`, `npm run build`, `pm2 restart`.',
      { note: 'Code đã đổi mà không build lại thì `pm2 restart` chỉ chạy lại bản cũ.', kind: 'tip' }
    ] },
    { tag: 'Cú pháp', title: 'Tự chạy sau khi khởi động lại VPS', body: [
      { pre: ['pm2 save                # ghi danh sách tiến trình hiện tại', 'pm2 startup             # in ra MỘT lệnh sudo, copy và chạy lệnh đó'] },
      'Quên `pm2 save` thì sau reboot danh sách rỗng, ứng dụng không tự lên. Mỗi lần thêm hoặc xoá ứng dụng, chạy lại `pm2 save`.'
    ] },
    { tag: 'Bảng tra', title: 'Đọc bảng pm2 list', body: [
      { tbl: [['Cột', 'Ý nghĩa'], ['status online', 'Đang chạy'], ['status errored', 'Chết liên tục, PM2 đã bỏ cuộc: đọc `pm2 logs`'], ['↺ (restarts)', 'Số lần khởi động lại. Số lớn như 15 là ứng dụng đang crash-loop']] }
    ] },
    { tag: 'Quy trình', title: 'EADDRINUSE: cổng đã có người dùng', body: [
      'Lỗi `listen EADDRINUSE: address already in use :::3001` nghĩa là cổng đã bị tiến trình khác chiếm. Tìm ai đang giữ:',
      { pre: ['sudo ss -tlnp | grep 3001', 'docker ps'], cap: 'Cột Process cho tên tiến trình; docker-proxy nghĩa là một container' },
      'Hai cách xử lý: dừng thứ đang chiếm cổng, hoặc đổi cổng của ứng dụng của bạn (nhớ sửa `proxy_pass` của Nginx cho khớp).'
    ] }
  ],
  quiz: [
    { q: 'pm2 list hiện tutor-ui "errored", log ghi "Could not find a production build in the .next directory". Cần làm gì?', opts: ['pm2 save', 'Vào ~/tutor/ui chạy npm run build rồi pm2 restart tutor-ui', 'Mở cổng 3000', 'Cài lại pm2'], ans: 1, why: 'Next.js ở chế độ production cần thư mục .next do lệnh build tạo ra.' },
    { q: 'Bạn khởi động lại VPS và không ứng dụng nào tự chạy, dù đã pm2 start trước đó. Thiếu bước nào?', opts: ['pm2 save và pm2 startup', 'ufw enable', 'nginx -t', 'docker compose up'], ans: 0, why: 'pm2 save lưu danh sách, pm2 startup cài dịch vụ systemd để PM2 tự bật khi máy khởi động.' },
    { q: 'Log báo EADDRINUSE :::3001. Lệnh nào tìm ra tiến trình đang chiếm cổng?', opts: ['pm2 logs', 'sudo ss -tlnp | grep 3001', 'df -h', 'dig 3001'], ans: 1, why: 'ss -tlnp liệt kê cổng đang lắng nghe kèm tên tiến trình.' }
  ],
  lab: {
    host: 'vps', user: 'haidangphan',
    setup: function (s) { C.vpsBase(s); C.pm2World(s, { dist: true, next: true }); },
    items: [
      { text: 'Vào thư mục `~/tutor` và đọc file `ecosystem.config.js`.', hint: 'cd ~/tutor && cat ecosystem.config.js', check: function (s) { return ran(s, /^cat .*ecosystem\.config\.js/); } },
      { text: 'Khởi động cả hai ứng dụng từ file ecosystem.', hint: 'pm2 start ecosystem.config.js', check: function (s) { return online(s, 'tutor-api') && online(s, 'tutor-ui'); } },
      { text: 'Xem 10 dòng log của `tutor-ui` (không theo dõi liên tục: thêm `--nostream`).', hint: 'pm2 logs tutor-ui --lines 10 --nostream', check: function (s) { return ran(s, /^pm2 logs .*tutor-ui/); } },
      { text: 'Vào `~/tutor/api` và build lại bản production.', hint: 'cd ~/tutor/api && npm run build', check: function (s) { return ran(s, /^npm run build/); } },
      { text: 'Khởi động lại `tutor-api` để nhận bản build mới.', hint: 'pm2 restart tutor-api', check: function (s) { return ran(s, /^pm2 restart tutor-api/) && online(s, 'tutor-api'); } },
      { text: 'Lưu danh sách tiến trình để dùng sau khi reboot.', hint: 'pm2 save', check: function (s) { return !!s.W.pm2Saved; } },
      { text: 'Lấy lệnh cài khởi động cùng hệ thống.', hint: 'pm2 startup', check: function (s) { return ran(s, /^pm2 startup/); } }
    ]
  },
  debugs: [
    {
      id: 'c6d1', title: 'tutor-api: errored sau khi deploy',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ pm2 list', 'id  name        mode  ↺   status   cpu  memory', '0   tutor-api   fork  15  errored  0%   0b', '1   tutor-ui    fork  0   online   0%   78.4mb'),
      story: 'Bạn vừa `git pull` bản mới của API nhưng quên build. Giao diện chạy, API thì chết liên tục. Thư mục ecosystem: ~/tutor.',
      goal: 'tutor-api online và danh sách đã được `pm2 save`.',
      hints: ['Đọc log lỗi: `pm2 logs tutor-api --lines 5 --nostream`.', 'Thiếu `dist/main.js`: chưa build. Vào `~/tutor/api` chạy `npm run build`.', 'Sau build: `pm2 restart tutor-api`, rồi `pm2 save` để bản này được lưu.'],
      fix: ['pm2 logs tutor-api --lines 5 --nostream', 'cd ~/tutor/api', 'npm run build', 'pm2 restart tutor-api', 'pm2 save'],
      cause: 'PM2 chỉ chạy `dist/main.js` đã được build. Khi errored kèm số restart cao, hãy đọc log trước khi restart thêm vô ích. Đưa bước build vào script deploy để không quên.',
      setup: function (s) { C.vpsBase(s); C.pm2World(s, { dist: false, next: true, start: true }); s.cwd = s.home + '/tutor'; },
      check: function (s) { return online(s, 'tutor-api') && !!s.W.pm2Saved; }
    },
    {
      id: 'c6d2', title: 'tutor-api: EADDRINUSE cổng 3001',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ pm2 logs tutor-api --lines 3 --nostream', 'tutor-api  | Error: listen EADDRINUSE: address already in use :::3001', '', '$ pm2 list', '0   tutor-api   fork  15  errored'),
      story: 'Bản build đã đủ, nhưng API không lên được. Tuần trước bạn có cài thêm vài công cụ giám sát bằng Docker.',
      goal: 'tutor-api online ở cổng 3001 (hoặc cổng khác nếu bạn đổi), không phá thứ đang chạy khác ngoài ý muốn.',
      hints: ['Ai đang giữ cổng 3001? `sudo ss -tlnp | grep 3001`.', 'Tiến trình là docker-proxy: một container. `docker ps` sẽ cho biết tên (uptime-kuma).', 'Dừng container bằng `docker stop uptime-kuma` rồi `pm2 restart tutor-api`. (Cách khác: đổi cổng, nhưng phải sửa cả Nginx.)'],
      fix: ['sudo ss -tlnp | grep 3001', 'docker ps', 'docker stop uptime-kuma', 'pm2 restart tutor-api'],
      cause: 'Hai thứ không thể cùng lắng nghe một cổng. Dịch vụ giám sát bind `0.0.0.0:3001` còn lộ ra Internet. Cách bền vững: đặt cho uptime-kuma một cổng riêng dạng `127.0.0.1:3101:3001`, để tutor-api giữ 3001 như Nginx đã trỏ.',
      setup: function (s) {
        C.vpsBase(s); C.pm2World(s, { dist: true, next: true });
        s.W.containers.push({ id: 'a1b2c3d4e5f6', name: 'uptime-kuma', image: 'louislam/uptime-kuma:1', svc: 'uptime-kuma', proj: 'monitor', ports: [{ bind: '0.0.0.0', host: 3001, cont: 3001 }], env: {}, state: 'running', status: 'Up 6 days (healthy)', logs: ['Welcome to Uptime Kuma', 'Listening on 3001'], cpu: 0.4, mem: '160MiB / 7.8GiB' });
        s.cwd = s.home + '/tutor'; s.silent('pm2 start ecosystem.config.js');
      },
      check: function (s) { return online(s, 'tutor-api') && online(s, 'tutor-ui'); }
    }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
