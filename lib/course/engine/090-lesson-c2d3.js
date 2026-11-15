(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, A = C.A2, pick = C.pick2, pickQ = C.pickQ2;
function R(re) { return function (s) { return ran(s, re); }; }
function rule(s, to, act, from) { return s.W.ufw.rules.some(function (r) { return r.to === to && (!act || r.action === act) && (!from || r.from === from); }); }
var OWN = '203.0.113.7';

/* ---------------- THEORY ---------------- */
A.theory = [
  pick('Nguyên tắc: càng ít cổng mở càng tốt'),
  pick('ufw: thứ tự an toàn'),
  pick('Quản lý luật ufw'),
  { tag: 'Cú pháp', title: 'ufw nâng cao: giới hạn theo IP, chống dò, ghi log', body: [
    { tbl: [['Nhu cầu', 'Lệnh', 'Ghi chú'],
      ['Chỉ một IP vào được cổng DB', '`sudo ufw allow from 203.0.113.7 to any port 5432 proto tcp`', 'Luật có cột From là IP, không phải Anywhere'],
      ['Chống dò mật khẩu SSH', '`sudo ufw limit OpenSSH`', 'Chặn IP nào mở từ 6 kết nối trở lên trong 30 giây'],
      ['Chặn hẳn một IP', '`sudo ufw deny from 45.155.205.12`', 'Luật deny phải đứng TRƯỚC luật allow trùng phạm vi'],
      ['Xoá theo số thứ tự', '`sudo ufw status numbered` rồi `sudo ufw delete 3`', 'Sau mỗi lần xoá, số thứ tự dịch chuyển: xem lại trước khi xoá tiếp'],
      ['Bật log', '`sudo ufw logging on`', 'Log ở `/var/log/ufw.log`, mức `low` là đủ'],
      ['Xem chính sách mặc định', '`sudo ufw status verbose`', 'Dòng `Default: deny (incoming), allow (outgoing)`'],
      ['Xoá sạch làm lại', '`sudo ufw reset`', 'Tắt ufw và xoá mọi luật: nhớ allow SSH lại trước khi enable']] },
    { pre: ['sudo ufw limit OpenSSH', 'sudo ufw allow from 203.0.113.7 to any port 5432 proto tcp', 'sudo ufw status numbered'], cap: 'Ví dụ: SSH có giới hạn tốc độ, Postgres chỉ cho IP văn phòng' },
    { note: 'ufw cũng quản lý IPv6 nếu `IPV6=yes` trong `/etc/default/ufw` (mặc định bật). Mỗi luật tạo thêm một bản `(v6)`. Quên IPv6 là lỗ hổng kinh điển: cổng đóng ở IPv4 nhưng mở ở IPv6.', kind: 'tip' }
  ] },
  pick('ss -tlnp: cổng nào đang lắng nghe'),
  pick('Docker bỏ qua ufw'),
  { tag: 'Quy trình', title: 'Truy cập DB từ máy cá nhân bằng SSH tunnel', body: [
    'Muốn dùng DBeaver hay `psql` trên laptop để xem Postgres của VPS, **đừng mở cổng 5432**. Hãy dùng đường hầm SSH: cổng trên laptop được nối vào cổng nội bộ của VPS qua kết nối SSH đã mã hoá.',
    { pre: ['ssh -N -f -L 5433:127.0.0.1:5432 haidangphan@116.118.9.210', '#        |  |  |    |         |', '#        |  |  |    |         +-- cổng đích (tính từ phía VPS)', '#        |  |  |    +------------ địa chỉ đích, nhìn từ VPS (loopback của VPS)', '#        |  |  +----------------- cổng mở trên LAPTOP', '#        |  +-------------------- chạy nền', '#        +----------------------- không mở shell, chỉ làm đường hầm'], cap: 'Chạy trên laptop' },
    { ul: ['Trong DBeaver kết nối tới `localhost:5433` với user và mật khẩu Postgres bình thường', 'Kiểm tra cổng đã mở: `nc -zv 127.0.0.1 5433`', 'Tắt đường hầm: tìm tiến trình `ps aux | grep "ssh -N"` rồi `kill PID`', 'Postgres vẫn chỉ nghe ở `127.0.0.1:5432` trên VPS, Internet không chạm tới được'] },
    { note: 'Địa chỉ `127.0.0.1` trong `-L` được hiểu **tại VPS**, không phải laptop. Nếu Postgres chạy trong container với publish `127.0.0.1:5432:5432` thì `127.0.0.1:5432` trên VPS đúng là cổng đó.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Cloudflare che chắn trước VPS', body: [
    'Với domain đi qua Cloudflare (đám mây cam), người ngoài chỉ thấy IP của Cloudflare. Nhưng nếu ai đó biết IP gốc (`116.118.9.210`) họ vẫn gọi thẳng được vào VPS và bỏ qua mọi bảo vệ của Cloudflare.',
    { tbl: [['Lớp', 'Việc cần làm'], ['DNS', 'Bật proxy (đám mây cam) cho các bản ghi web. Bản ghi dùng để SSH hoặc mail để xám'], ['ufw', 'Chỉ cho các dải IP của Cloudflare vào cổng 80 và 443'], ['Nginx', 'Khôi phục IP thật của khách từ header `CF-Connecting-IP`'], ['Lộ IP', 'Đừng để subdomain trỏ thẳng IP gốc ở chế độ xám nếu không cần']] },
    { pre: ['# Danh sách dải IP: https://www.cloudflare.com/ips-v4 (kiểm tra định kỳ vì có thể đổi)', 'sudo ufw allow from 173.245.48.0/20 to any port 443 proto tcp', 'sudo ufw allow from 103.21.244.0/22 to any port 443 proto tcp', '# ...lặp lại cho từng dải, rồi XOÁ luật "443/tcp Anywhere" cũ'], cap: 'Chỉ nhận HTTPS từ Cloudflare' },
    { note: 'Trước khi xoá luật `443/tcp` mở cho mọi người, hãy kiểm tra site vẫn vào được qua domain. Làm sai thứ tự sẽ làm site sập (lỗi 522).', kind: 'warn' },
    'Cloudflare Tunnel (`cloudflared`) đi xa hơn: VPS không mở cổng 80 và 443 nào, chính VPS kết nối ra Cloudflare. Phù hợp khi muốn đóng toàn bộ cổng vào web.'
  ] },
  { tag: 'Quy trình', title: 'Cập nhật bản vá: apt, unattended-upgrades và khởi động lại', body: [
    'Phần lớn vụ tấn công thành công dùng lỗ hổng **đã có bản vá**. Giữ hệ thống cập nhật là biện pháp rẻ nhất.',
    { pre: ['sudo apt update                     # tải danh sách gói mới (chưa cài gì)', 'apt list --upgradable                # gói nào có bản mới', 'sudo apt upgrade -y                 # cài các bản mới', 'cat /var/run/reboot-required        # có file này = cần khởi động lại (thường do kernel)', 'sudo reboot'], cap: 'Quy trình thủ công hằng tuần' },
    { tbl: [['', '`apt update`', '`apt upgrade`'], ['Việc làm', 'Cập nhật **danh mục** gói', 'Cài **phiên bản mới** của gói đã có'], ['Thay đổi hệ thống?', 'Không', 'Có'], ['Cần sudo', 'Có', 'Có']] },
    'Tự động hoá bản vá bảo mật bằng `unattended-upgrades`:',
    { pre: ['sudo apt install -y unattended-upgrades', 'cat /etc/apt/apt.conf.d/20auto-upgrades', '# APT::Periodic::Update-Package-Lists "1";', '# APT::Periodic::Unattended-Upgrade "1";', 'sudo systemctl status unattended-upgrades'] },
    { ul: ['Mặc định chỉ cài bản **bảo mật** (`-security`), không đổi phiên bản lớn của phần mềm', 'Bản nâng kernel cần khởi động lại mới có hiệu lực; có thể bật `Automatic-Reboot "true"` kèm giờ yên tĩnh (`Automatic-Reboot-Time "04:30"`)', 'Docker image không nằm trong hệ thống apt: phải `docker compose pull` và `up -d` để vá image'] },
    { note: 'Trước khi reboot hãy đảm bảo các dịch vụ có `restart: unless-stopped` (Docker) hoặc `pm2 save` + `pm2 startup` (PM2) để tự lên lại.', kind: 'warn' }
  ] },
  { tag: 'Bảng tra', title: 'Kiểm tra bề mặt tấn công từ cả hai phía', body: [
    { tbl: [['Góc nhìn', 'Công cụ', 'Câu hỏi trả lời'], ['Từ trong VPS', '`sudo ss -tlnp`', 'Tiến trình nào nghe cổng nào, ở địa chỉ nào?'], ['Từ trong VPS', '`sudo ufw status verbose`', 'Tường lửa cho phép gì?'], ['Từ trong VPS', '`docker ps`', 'Container nào publish cổng ra ngoài?'], ['Từ ngoài VPS', '`nc -zv IP CỔNG` hoặc `nmap IP`', 'Người ngoài thực sự chạm được cổng nào?'], ['Từ ngoài VPS', 'Công cụ quét online (Shodan, ...)', 'Kẻ tấn công thấy gì?']] },
    'Hai góc nhìn có thể **khác nhau**: `ufw` báo đã chặn nhưng `nmap` từ ngoài vẫn thấy cổng mở (trường hợp Docker). Luôn tin kết quả quét từ ngoài và `ss -tlnp` hơn là chỉ tin bảng luật.',
    { pre: ['# Trên laptop hoặc máy khác:', 'nc -zv 116.118.9.210 5432      # kết nối bị từ chối/timeout = tốt', 'nc -zv 116.118.9.210 443       # succeeded = đúng'], cap: 'Quét thử từ ngoài' }
  ] },
  { tag: 'Bảng tra', title: 'Bảng triệu chứng tường lửa và cổng', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân hay gặp', 'Kiểm tra'],
      ['SSH timeout sau khi bật ufw', 'Chưa allow SSH trước khi enable', 'Console nhà cung cấp, `ufw allow OpenSSH`'],
      ['SSH timeout sau khi đổi cổng', 'Quên allow cổng mới trong ufw', '`sudo ss -tlnp | grep sshd`, `ufw status`'],
      ['`ufw deny 5432` mà cổng vẫn mở', 'Container publish `0.0.0.0` (Docker bỏ qua ufw)', '`ss -tlnp`, `docker ps`'],
      ['Site 522/timeout sau khi siết ufw theo Cloudflare', 'Thiếu một dải IP, hoặc xoá luật 443 trước khi thêm', '`ufw status numbered`'],
      ['Lỡ xoá nhầm luật bằng số', 'Số thứ tự dịch sau mỗi lần xoá', 'Luôn `status numbered` lại'],
      ['`apt upgrade` xong dịch vụ lạ', 'Gói đã nâng kèm restart dịch vụ', '`systemctl status`, `journalctl -u`'],
      ['Cổng lạ xuất hiện trong `ss`', 'Tiến trình lạ hoặc container mới', '`sudo ss -tlnp`, `ps aux`']] }
  ] },
  { tag: 'Quy trình', title: 'Danh sách kiểm tra cuối chương: tường lửa và cổng', body: [
    { ul: ['`ufw status verbose`: deny incoming, chỉ có 22 (hoặc cổng SSH mới), 80, 443', '`ss -tlnp`: dịch vụ phụ trợ (Postgres, Redis, ứng dụng) chỉ ở `127.0.0.1`', 'Compose: mọi `ports` dạng `"127.0.0.1:host:container"`', 'SSH có `ufw limit` hoặc fail2ban', 'Quét từ ngoài đúng bằng những gì mong muốn', 'Bản vá bảo mật tự động (`unattended-upgrades`) và có lịch reboot', 'Đã thử truy cập DB bằng SSH tunnel, không cần mở 5432', 'Domain web đi qua Cloudflare; ufw giới hạn 80/443 theo dải Cloudflare (nếu cần)'] },
    'Chương sau sẽ làm phần còn lại: người dùng, khoá SSH, sshd, fail2ban, giữ bí mật và ứng phó khi bị xâm nhập.'
  ] }
];

/* ---------------- QUIZ ---------------- */
A.quiz = [
  pickQ('Bạn gõ `sudo ufw enable`'),
  pickQ('Postgres chạy trong Docker'),
  pickQ('Trong `ss -tlnp`'),
  pickQ('Thứ tự an toàn để bật ufw'),
  { q: '`sudo ufw limit OpenSSH` làm gì?', opts: ['Chặn hẳn SSH', 'Cho phép SSH nhưng chặn tạm IP mở quá nhiều kết nối trong thời gian ngắn (chống dò)', 'Giới hạn dung lượng truyền', 'Chỉ cho một người đăng nhập'], ans: 1, why: 'limit = allow kèm giới hạn tốc độ kết nối mới từ cùng một IP (khoảng 6 lần trong 30 giây).' },
  { q: 'Luật `ufw allow from 203.0.113.7 to any port 5432 proto tcp` có nghĩa gì?', opts: ['Mọi người vào được cổng 5432', 'Chỉ IP 203.0.113.7 vào được cổng 5432/tcp', 'Chặn IP 203.0.113.7', 'Mở cổng 5432 cho IPv6'], ans: 1, why: 'Có mệnh đề from IP nên luật chỉ áp cho IP đó, cột From của status hiện đúng IP.' },
  { q: 'Bạn xoá luật bằng `ufw delete 2`. Muốn xoá tiếp luật tưởng là số 4, cần làm gì?', opts: ['Gõ luôn delete 4', 'Chạy lại `ufw status numbered` vì các số đã dịch chuyển', 'Reboot VPS', 'Không thể xoá thêm'], ans: 1, why: 'Sau khi xoá một luật, các luật phía sau đánh số lại. Xoá theo số cũ dễ nhầm luật.' },
  { q: 'Lệnh `ssh -N -f -L 5433:127.0.0.1:5432 user@vps` chạy trên laptop. Địa chỉ `127.0.0.1:5432` là của máy nào?', opts: ['Laptop', 'VPS (đích được hiểu từ phía VPS)', 'Máy chủ Cloudflare', 'Container Docker bất kỳ'], ans: 1, why: 'Phần sau cổng local là đích mà VPS sẽ kết nối tới. Do đó 127.0.0.1 là loopback của VPS.' },
  { q: 'Vì sao nên chỉ cho dải IP Cloudflare vào cổng 80/443 khi domain đã proxy qua Cloudflare?', opts: ['Để site chạy nhanh hơn', 'Để kẻ biết IP gốc không bỏ qua được lớp bảo vệ của Cloudflare', 'Để tiết kiệm băng thông', 'Vì Nginx yêu cầu'], ans: 1, why: 'Nếu cổng 443 mở cho mọi người, ai biết IP gốc có thể gọi thẳng, bỏ qua WAF/giới hạn của Cloudflare.' },
  { q: '`apt update` và `apt upgrade` khác nhau thế nào?', opts: ['Giống nhau', 'update tải danh mục gói mới; upgrade mới cài phiên bản mới', 'update cài, upgrade tải', 'upgrade chỉ dành cho kernel'], ans: 1, why: 'update chỉ làm mới danh sách; upgrade là bước thay đổi hệ thống.' },
  { q: 'Sau `apt upgrade` có file `/var/run/reboot-required`. Ý nghĩa?', opts: ['Hệ thống bị hỏng', 'Có bản vá (thường là kernel) chỉ có hiệu lực sau khi khởi động lại', 'apt đã tự reboot', 'Cần xoá file'], ans: 1, why: 'Kernel đang chạy vẫn là bản cũ cho tới khi reboot. Hãy chuẩn bị dịch vụ tự lên lại rồi reboot.' },
  { q: '`ufw` báo `5432 DENY` nhưng quét từ ngoài vẫn thấy cổng 5432 mở. Tin điều nào?', opts: ['Bảng luật ufw', 'Kết quả quét từ ngoài và `ss -tlnp`', 'Cả hai đều sai', 'Chỉ tin `docker ps`'], ans: 1, why: 'Docker NAT bỏ qua ufw. Thực tế cổng mở được xác định bởi cái đang nghe và đường đi của gói tin, không phải bảng luật.' },
  { q: 'Cách đúng để xem DB production bằng DBeaver trên laptop mà không mở cổng 5432?', opts: ['`ufw allow 5432` cho mọi IP', 'SSH tunnel `-L` tới 127.0.0.1:5432 trên VPS', 'Đổi `ports` thành `0.0.0.0:5432:5432`', 'Tắt ufw'], ans: 1, why: 'Tunnel dùng sẵn kết nối SSH mã hoá, Postgres vẫn chỉ nghe ở loopback.' }
];

/* ---------------- LAB ---------------- */
A.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { C.secBase(s, { fresh: true }); C.gateway(s, { up: true }); },
  items: [
    { text: 'Đặt chính sách mặc định: chặn mọi kết nối **vào**.', hint: 'sudo ufw default deny incoming', check: function (s) { return s.W.ufw.defIn === 'deny' && ran(s, /ufw default deny incoming/); } },
    { text: 'Cho phép mọi kết nối **ra**.', hint: 'sudo ufw default allow outgoing', check: function (s) { return s.W.ufw.defOut === 'allow' && ran(s, /ufw default allow outgoing/); } },
    { text: 'Cho phép SSH bằng profile `OpenSSH`.', hint: 'sudo ufw allow OpenSSH', check: R(/^sudo ufw allow OpenSSH/) },
    { text: 'Cho phép HTTP và HTTPS (hai lệnh: cổng 80/tcp và 443/tcp).', hint: 'sudo ufw allow 80/tcp\nsudo ufw allow 443/tcp', check: function (s) { return rule(s, '80/tcp', 'ALLOW') && rule(s, '443/tcp', 'ALLOW'); } },
    { text: 'Bật tường lửa (SSH đã được cho phép nên an toàn).', hint: 'sudo ufw enable', check: function (s) { return s.W.ufw.active && !s.W.ufw.lockedOut; } },
    { text: 'Xem trạng thái chi tiết, gồm chính sách mặc định.', hint: 'sudo ufw status verbose', check: R(/^sudo ufw status verbose/) },
    { text: 'Giới hạn tốc độ kết nối SSH: đổi luật `OpenSSH` sang `limit`.', hint: 'sudo ufw limit OpenSSH', check: function (s) { return rule(s, 'OpenSSH', 'LIMIT'); } },
    { transient: true, text: 'Chỉ cho IP văn phòng `203.0.113.7` vào Postgres: `allow from ... to any port 5432 proto tcp`.', hint: 'sudo ufw allow from 203.0.113.7 to any port 5432 proto tcp', check: function (s) { return rule(s, '5432/tcp', 'ALLOW', OWN); } },
    { text: 'Xem luật có đánh số.', hint: 'sudo ufw status numbered', check: R(/^sudo ufw status numbered/) },
    { text: 'Xoá luật 5432 vừa thêm bằng SỐ THỨ TỰ của nó (xem `status numbered` để biết số).', hint: 'sudo ufw delete 4', check: function (s) { return ran(s, /^sudo ufw delete \d+/) && !rule(s, '5432/tcp'); } },
    { text: 'Bật ghi log cho ufw.', hint: 'sudo ufw logging on', check: function (s) { return s.W.sec && s.W.sec.logging !== 'off'; } },
    { text: 'Che sau Cloudflare: cho dải `173.245.48.0/20` vào cổng 443.', hint: 'sudo ufw allow from 173.245.48.0/20 to any port 443 proto tcp', check: function (s) { return rule(s, '443/tcp', 'ALLOW', '173.245.48.0/20'); } },
    { text: 'Xem cổng đang lắng nghe kèm tên tiến trình (nhớ sudo để thấy cột Process).', hint: 'sudo ss -tlnp', check: R(/^sudo ss -\w*p/) },
    { text: 'Lọc riêng các cổng đang nghe ở `0.0.0.0` (mở cho mọi giao diện).', hint: 'sudo ss -tlnp | grep 0.0.0.0', check: R(/^grep 0\.0\.0\.0/) },
    { text: 'Xem container nào đang publish cổng.', hint: 'docker ps', check: R(/^docker ps/) },
    { text: 'Đếm số dòng "Failed password" trong auth.log bằng grep và wc.', hint: 'sudo grep "Failed password" /var/log/auth.log | wc -l', check: R(/grep .*Failed password.*auth\.log/) },
    { text: 'Làm mới danh mục gói (`apt update`).', hint: 'sudo apt update', check: R(/^sudo apt update/) },
    { text: 'Liệt kê các gói có bản mới.', hint: 'apt list --upgradable', check: R(/^apt list --upgradable/) },
    { text: 'Cài toàn bộ bản vá bằng `apt upgrade -y`.', hint: 'sudo apt upgrade -y', check: function (s) { return s.W.sec && s.W.sec.upg.length === 0 && ran(s, /^sudo apt upgrade/); } },
    { text: 'Kiểm tra có cần khởi động lại không: đọc `/var/run/reboot-required`.', hint: 'cat /var/run/reboot-required', check: R(/^cat \/var\/run\/reboot-required/) },
    { text: 'Cài `unattended-upgrades` để tự vá bảo mật.', hint: 'sudo apt install -y unattended-upgrades', check: function (s) { return s.W.sec && s.W.sec.unattended; } },
    { text: 'Đọc file cấu hình tự động cập nhật `20auto-upgrades`.', hint: 'cat /etc/apt/apt.conf.d/20auto-upgrades', check: R(/^cat .*20auto-upgrades/) },
    { text: 'Kiểm tra dịch vụ `unattended-upgrades` đang chạy.', hint: 'sudo systemctl status unattended-upgrades', check: R(/^sudo systemctl status unattended-upgrades/) },
    { transient: true, text: 'Khởi động lại máy chủ để nhận kernel mới (`sudo reboot`).', hint: 'sudo reboot', check: function (s) { return ran(s, /^sudo reboot/) && !s.fs.ex('/var/run/reboot-required'); } }
  ]
};

/* ---------------- DEBUGS ---------------- */
function laptopKey(s) {
  var f = s.fs, h = s.home, u = s.user;
  f.put(h + '/.ssh/known_hosts', '', { owner: u });
  f.put(h + '/.ssh/id_ed25519', '-----BEGIN OPENSSH PRIVATE KEY-----\nKEYID:KT1\n-----END OPENSSH PRIVATE KEY-----\n', { owner: u, mode: M('600') });
  f.put(h + '/.ssh/id_ed25519.pub', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5KT1 ' + u + '@laptop\n', { owner: u, mode: M('644') });
  s.W.ssh.authIds = ['KT1'];
}
A.debugs = [
  C.pickD2('c2d1'),
  {
    id: 'c2d3', title: 'Đổi cổng SSH xong, không vào được VPS nữa',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ssh -p 2222 haidangphan@116.118.9.210   (từ laptop)', 'ssh: connect to host 116.118.9.210 port 2222: Connection timed out', '', '$ ssh haidangphan@116.118.9.210   (cổng 22 cũ)', 'ssh: connect to host 116.118.9.210 port 22: Connection refused'),
    story: 'Bạn đổi `Port 22` thành `Port 2222` trong sshd_config và restart ssh, mà quên mở cổng mới trong ufw. Giờ bạn đang ngồi ở **console web của nhà cung cấp** (không qua SSH) để cứu. Thư mục làm việc tuỳ ý.',
    goal: 'Cổng 2222 được ufw cho phép; dịch vụ ssh đang nghe cổng 2222. (Chưa xoá luật cổng 22 cũ vội.)',
    hints: ['Dịch vụ ssh nghe cổng nào? `sudo ss -tlnp | grep sshd`. Và ufw đang cho phép những cổng nào? `sudo ufw status`.', 'Luật `OpenSSH` chỉ là cổng 22. Cổng mới 2222 chưa có luật nào, nên bị chặn theo chính sách mặc định deny.', '`sudo ufw allow 2222/tcp`, rồi kiểm tra `sudo ufw status`. Chỉ xoá luật OpenSSH cũ SAU KHI đã đăng nhập thử thành công bằng cổng mới.'],
    fix: ['sudo ss -tlnp | grep sshd', 'sudo ufw status', 'sudo ufw allow 2222/tcp', 'sudo ufw status'],
    cause: 'Đổi cổng SSH là hai việc phải đi cùng nhau: mở cổng mới trong tường lửa TRƯỚC khi restart sshd, rồi thử đăng nhập bằng cổng mới trong một cửa sổ khác. Chỉ khi chắc chắn mới xoá luật cổng cũ. Luôn nhớ nơi cứu hộ: console của nhà cung cấp VPS.',
    setup: function (s) {
      C.secBase(s);
      var n = s.fs.get('/etc/ssh/sshd_config'); n.c = n.c.replace('Port 22', 'Port 2222');
      V.sec.snapshot(s);
      s.W.svc.ssh = true;
    },
    check: function (s) { return rule(s, '2222/tcp', 'ALLOW') && s.W.ssh.activePort === 2222 && s.W.svc.ssh; }
  },
  {
    id: 'c2d9', title: 'Cần xem DB từ DBeaver nhưng Postgres chỉ nghe loopback',
    host: 'laptop', user: 'duong',
    symptom: L('$ nc -zv 116.118.9.210 5432', 'nc: connect to 116.118.9.210 port 5432 (tcp) failed: Connection refused', '', '(Đúng như thiết kế: Postgres chỉ nghe 127.0.0.1:5432 trên VPS.)'),
    story: 'Bạn là `duong` ở laptop. Muốn mở DBeaver xem dữ liệu tutor_db trên VPS 116.118.9.210. Cổng 5432 đã (đúng) đóng với Internet. Khoá SSH của bạn đã được cài sẵn, user trên VPS là haidangphan. Không được mở cổng 5432.',
    goal: 'Một đường hầm SSH chạy nền từ cổng 5433 trên laptop tới 127.0.0.1:5432 của VPS, và `nc -zv 127.0.0.1 5433` báo succeeded.',
    hints: ['Dùng tuỳ chọn `-L cổng_local:địa_chỉ_đích:cổng_đích` của ssh. Đích được hiểu từ phía VPS.', 'Thêm `-N` (không mở shell) và `-f` (chạy nền). Cổng local chọn 5433 để khỏi đụng Postgres cục bộ.', '`ssh -N -f -L 5433:127.0.0.1:5432 haidangphan@116.118.9.210`, rồi kiểm tra bằng `nc -zv 127.0.0.1 5433`.'],
    fix: ['ssh -N -f -L 5433:127.0.0.1:5432 haidangphan@116.118.9.210', 'nc -zv 127.0.0.1 5433'],
    cause: 'SSH tunnel mượn kết nối SSH đã có để đưa một cổng của VPS về laptop, mà không mở thêm cổng nào ra Internet. Đây là cách truy cập DB production an toàn: DBeaver trỏ tới localhost:5433.',
    setup: function (s) { laptopKey(s); },
    check: function (s) { var S = s.W.sec; return !!S && S.tunnels.some(function (t) { return t.r === 5432 && t.host === '127.0.0.1'; }) && ran(s, /^nc .*127\.0\.0\.1 \d+/); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
