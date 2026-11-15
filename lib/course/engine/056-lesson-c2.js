(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, IP = V.IP;

function ufwHas(s, to) { return s.W.ufw.rules.some(function (r) { return r.to === to && r.action === 'ALLOW'; }); }

C.lesson({
  id: 'c2', group: 'Nền tảng', short: 'Bảo mật VPS',
  title: 'Bảo mật VPS: tường lửa, cổng mở và SSH',
  dek: 'Chỉ mở cổng cần thiết, hiểu vì sao Docker làm thủng ufw và cứng hoá sshd_config an toàn.',
  theory: [
    { tag: 'Khái niệm', title: 'Nguyên tắc: càng ít cổng mở càng tốt', body: [
      'Một VPS vừa tạo sẽ bị quét và thử mật khẩu trong vài phút. Ba lớp phòng thủ cơ bản: **user thường + sudo** (không dùng root), **tường lửa** (chỉ mở 22, 80, 443) và **khoá SSH** (tắt đăng nhập mật khẩu khi khoá đã chạy).',
      { ul: ['SSH (22): quản trị', 'HTTP (80) và HTTPS (443): Nginx phục vụ web', 'Postgres, Redis, RabbitMQ, cổng ứng dụng 3000/8888: **không** mở ra Internet, chỉ để Nginx hoặc container khác gọi nội bộ'] }
    ] },
    { tag: 'Cú pháp', title: 'ufw: thứ tự an toàn', body: [
      { pre: ['sudo ufw default deny incoming', 'sudo ufw default allow outgoing', 'sudo ufw allow OpenSSH', 'sudo ufw allow 80/tcp', 'sudo ufw allow 443/tcp', 'sudo ufw enable', 'sudo ufw status'], cap: 'Chặn mặc định, mở đúng cổng, rồi mới bật' },
      { note: '**Luôn allow SSH trước khi `ufw enable`.** Bật tường lửa khi chưa cho phép cổng 22 sẽ tự khoá bạn khỏi VPS, chỉ gỡ được qua console của nhà cung cấp.', kind: 'warn' },
      'Chặn riêng một IP tấn công: `sudo ufw deny from 45.155.205.12`. Xoá luật: `sudo ufw delete allow 80/tcp`.'
    ] },
    { tag: 'Cú pháp', title: 'ss -tlnp: cổng nào đang lắng nghe', body: [
      { tbl: [['Cờ', 'Ý nghĩa'], ['-t', 'chỉ TCP'], ['-l', 'chỉ cổng đang lắng nghe (listen)'], ['-n', 'hiện số cổng, không đổi sang tên dịch vụ'], ['-p', 'hiện tiến trình, **cần sudo** mới thấy tiến trình của người khác']] },
      'Đọc cột **Local Address**: `0.0.0.0:80` nghĩa là mọi giao diện mạng, ai cũng chạm tới được nếu không có tường lửa. `127.0.0.1:3000` chỉ nội bộ máy này. Tên tiến trình `docker-proxy` nghĩa là cổng do Docker publish.',
      { pre: ['sudo ss -tlnp', 'sudo ss -tlnp | grep 5432      # lọc một cổng'] }
    ] },
    { tag: 'Lưu ý', title: 'Docker bỏ qua ufw', body: [
      'Khi compose có `ports: "5432:5432"`, Docker tự thêm luật NAT trước khi gói tin tới chuỗi INPUT mà ufw quản lý. Kết quả: **`ufw deny 5432` không chặn được** Postgres trong container.',
      { pre: ['ports:', '  - "5432:5432"              # SAI: mở ra 0.0.0.0', '  - "127.0.0.1:5432:5432"    # ĐÚNG: chỉ nội bộ'], cap: 'docker-compose.yml' },
      'Sau khi sửa, tạo lại container bằng `docker compose up -d` rồi kiểm tra lại bằng `ss -tlnp`.'
    ] },
    { tag: 'Cú pháp', title: 'Cứng hoá sshd_config an toàn', body: [
      { pre: ['PermitRootLogin no', 'PasswordAuthentication no     # chỉ bật khi đã đăng nhập thử bằng khoá thành công', 'PubkeyAuthentication yes'], cap: '/etc/ssh/sshd_config' },
      'Quy trình: sửa file, chạy `sudo sshd -t` (im lặng nghĩa là cú pháp đúng), rồi `sudo systemctl reload ssh`. **Giữ nguyên phiên SSH đang mở** và mở cửa sổ mới để thử trước khi đóng phiên cũ.',
      { note: 'Gõ sai tên tuỳ chọn (ví dụ `PasswordAuthenticaton`) làm `sshd -t` báo `Bad configuration option` và `reload` thất bại, cấu hình mới không được áp dụng.', kind: 'tip' }
    ] },
    { tag: 'Khái niệm', title: 'fail2ban và nhật ký đăng nhập', body: [
      'fail2ban đọc `/var/log/auth.log` và tự chặn IP sai mật khẩu nhiều lần. Xem trạng thái và chặn tay:',
      { pre: ['sudo fail2ban-client status sshd', 'sudo fail2ban-client set sshd banip 45.155.205.12', 'sudo grep "Failed password" /var/log/auth.log | wc -l'] }
    ] }
  ],
  quiz: [
    { q: 'Bạn gõ `sudo ufw enable` khi chưa allow cổng 22. Chuyện gì xảy ra?', opts: ['Tự khoá SSH, phải vào console nhà cung cấp để sửa', 'Không sao, ufw tự nhận ra phiên SSH đang mở', 'ufw tự allow cổng 22', 'ufw từ chối bật'], ans: 0, why: 'Phiên đang mở có thể vẫn sống một lúc, nhưng kết nối mới sẽ bị chặn. Luôn `allow OpenSSH` trước.' },
    { q: 'Postgres chạy trong Docker với `ports: "5432:5432"`. Bạn chạy `sudo ufw deny 5432`. Cổng có bị chặn không?', opts: ['Có, ufw chặn mọi thứ', 'Không, Docker NAT bỏ qua ufw; phải đổi thành 127.0.0.1:5432:5432', 'Chỉ chặn IPv6', 'Có, nhưng phải reboot'], ans: 1, why: 'Luật NAT của Docker chạy trước chuỗi INPUT của ufw. Cách đúng là bind vào 127.0.0.1 trong compose.' },
    { q: 'Trong `ss -tlnp` bạn thấy `127.0.0.1:3000` và `0.0.0.0:8888`. Điều nào đúng?', opts: ['Cả hai đều truy cập được từ Internet', 'Cả hai chỉ nội bộ', '3000 chỉ nội bộ, 8888 mở cho mọi giao diện mạng', '3000 mở, 8888 chỉ nội bộ'], ans: 2, why: '127.0.0.1 là loopback, chỉ máy đó tự gọi được. 0.0.0.0 là mọi giao diện, cần tường lửa hoặc bind lại nếu không muốn công khai.' }
  ],
  lab: {
    host: 'vps', user: 'haidangphan',
    setup: function (s) { C.vpsBase(s); s.W.noSudo = false; },
    items: [
      { text: 'Đặt chính sách mặc định: chặn mọi kết nối **vào**.', hint: 'sudo ufw default deny incoming', check: function (s) { return s.W.ufw.defIn === 'deny'; } },
      { text: 'Cho phép mọi kết nối **ra**.', hint: 'sudo ufw default allow outgoing', check: function (s) { return s.W.ufw.defOut === 'allow'; } },
      { text: 'Cho phép SSH bằng profile `OpenSSH`.', hint: 'sudo ufw allow OpenSSH', check: function (s) { return ufwHas(s, 'OpenSSH'); } },
      { text: 'Cho phép HTTP và HTTPS (hai lệnh: cổng 80/tcp và 443/tcp).', hint: 'sudo ufw allow 80/tcp\nsudo ufw allow 443/tcp', check: function (s) { return ufwHas(s, '80/tcp') && ufwHas(s, '443/tcp'); } },
      { text: 'Bật tường lửa (SSH đã được cho phép nên an toàn).', hint: 'sudo ufw enable', check: function (s) { return s.W.ufw.active && !s.W.ufw.lockedOut; } },
      { text: 'Xem cổng đang lắng nghe kèm tên tiến trình (nhớ sudo để thấy cột Process).', hint: 'sudo ss -tlnp', check: function (s) { return ran(s, /^sudo ss -\w*p/); } },
      { text: 'Đếm số dòng "Failed password" trong auth.log bằng grep và wc.', hint: 'sudo grep "Failed password" /var/log/auth.log | wc -l', check: function (s) { return ran(s, /grep .*Failed password.*auth\.log/) ; } }
    ]
  },
  debugs: [
    {
      id: 'c2d1', title: 'Postgres lộ ra Internet dù đã ufw deny',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ sudo ufw status', 'Status: active', '5432                       DENY        Anywhere', '', '$ sudo ss -tlnp | grep 5432', 'LISTEN 0 4096   0.0.0.0:5432   0.0.0.0:*   users:(("docker-proxy",pid=2332,fd=3))'),
      story: 'Bạn đã `ufw deny 5432` nhưng công cụ quét cổng bên ngoài vẫn thấy Postgres mở. Thư mục làm việc là ~/tutor/gateway, file mật khẩu là docker.env.',
      goal: 'Không còn cổng 5432 nào lắng nghe ở 0.0.0.0. Postgres chỉ được lắng nghe ở 127.0.0.1.',
      hints: ['Xem `grep -n 5432 docker-compose.yml`. Cổng đang được publish theo dạng nào?', '`"5432:5432"` mặc định là 0.0.0.0. Thêm địa chỉ bind 127.0.0.1 phía trước.', 'Sửa bằng sed rồi tạo lại container: sửa file, rồi `docker compose --env-file docker.env up -d`, kiểm tra bằng `sudo ss -tlnp | grep 5432`.'],
      fix: ['sed -i \'s|"5432:5432"|"127.0.0.1:5432:5432"|\' docker-compose.yml', 'docker compose --env-file docker.env up -d', 'sudo ss -tlnp | grep 5432'],
      cause: 'Docker publish cổng bằng luật NAT, đi vòng qua ufw, nên `ufw deny` vô hiệu với cổng của container. Quy tắc: mọi dịch vụ phụ trợ (Postgres, Redis, RabbitMQ) luôn publish dạng `127.0.0.1:host:container`, hoặc bỏ hẳn `ports` nếu chỉ container khác cần gọi.',
      setup: function (s) {
        C.vpsBase(s);
        var f = s.fs, h = s.home, u = s.user;
        f.put(h + '/tutor/gateway/docker-compose.yml', C.composeFile.replace('127.0.0.1:5432:5432', '5432:5432'), { owner: u });
        f.put(h + '/tutor/gateway/docker.env', 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=Ab12cd34ef56\nDB_PASSWORD=Ab12cd34ef56\n', { owner: u, mode: M('600') });
        s.W.ufw.active = true; s.W.ufw.rules = [{ to: 'OpenSSH', action: 'ALLOW', from: 'Anywhere' }, { to: '80/tcp', action: 'ALLOW', from: 'Anywhere' }, { to: '443/tcp', action: 'ALLOW', from: 'Anywhere' }, { to: '5432', action: 'DENY', from: 'Anywhere' }];
        s.W.db = { initialized: false, password: null, user: 'app' };
        s.cwd = h + '/tutor/gateway';
        s.silent('docker compose --env-file docker.env up -d');
      },
      check: function (s) {
        var l = s.listeners().filter(function (x) { return x.port === 5432; });
        return !l.some(function (x) { return x.bind === '0.0.0.0'; }) && s.W.containers.some(function (c) { return c.name === 'tutor-postgres' && c.state === 'running'; });
      }
    },
    {
      id: 'c2d2', title: 'Sửa sshd_config xong nhưng reload báo lỗi',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ sudo systemctl reload ssh', 'Job for ssh.service failed because the control process exited with error code.', 'See "systemctl status ssh.service" and "journalctl -xeu ssh.service" for details.'),
      story: 'Bạn đã thêm hai dòng cứng hoá vào /etc/ssh/sshd_config: tắt đăng nhập mật khẩu và tắt root. Khoá SSH đã được kiểm tra chạy tốt. Nhưng reload ssh không thành công, nên cấu hình mới chưa được áp dụng.',
      goal: 'File cấu hình hợp lệ (`sudo sshd -t` im lặng), `PasswordAuthentication no` có hiệu lực và reload ssh thành công.',
      hints: ['Chạy `sudo sshd -t` để lấy thông báo lỗi chính xác kèm số dòng.', 'Lỗi là `Bad configuration option: PasswordAuthenticaton` (thiếu chữ "n"). Xem dòng bằng `grep -n Password /etc/ssh/sshd_config`.', 'Sửa: `sudo sed -i \'s/PasswordAuthenticaton/PasswordAuthentication/\' /etc/ssh/sshd_config`, kiểm tra `sudo sshd -t`, rồi `sudo systemctl reload ssh`.'],
      fix: ['sudo sshd -t', 'sudo sed -i \'s/PasswordAuthenticaton/PasswordAuthentication/\' /etc/ssh/sshd_config', 'sudo sshd -t', 'sudo systemctl reload ssh'],
      cause: 'Tên tuỳ chọn gõ sai làm sshd từ chối cả file. Thói quen an toàn: luôn chạy `sudo sshd -t` TRƯỚC khi reload, và giữ một phiên SSH cũ mở trong lúc thử phiên mới.',
      setup: function (s) {
        C.vpsBase(s);
        s.fs.put('/etc/ssh/sshd_config', C.SSHD.replace('PasswordAuthentication yes', 'PasswordAuthenticaton no'), { owner: 'root' });
      },
      check: function (s) {
        var n = s.fs.get('/etc/ssh/sshd_config');
        return s.W.ssh.reloadedOK && /^PasswordAuthentication no/m.test(n.c);
      }
    }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
