(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, IP = V.IP;

function laptop(s) {
  var f = s.fs, h = s.home, u = s.user;
  f.mkdirp('/var/log/nginx', 'root');
  f.put(h + '/.ssh/known_hosts', '', { owner: u });
  s.W.ssh.authIds = [];
}
function keyFile(s, name, id, mode) {
  s.fs.put(s.home + '/.ssh/' + name, '-----BEGIN OPENSSH PRIVATE KEY-----\nKEYID:' + id + '\n-----END OPENSSH PRIVATE KEY-----\n', { owner: s.user, mode: mode });
  s.fs.put(s.home + '/.ssh/' + name + '.pub', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5' + id + ' ' + s.user + '@laptop\n', { owner: s.user, mode: M('644') });
}

C.lesson({
  id: 'c1', group: 'Nền tảng', short: 'Linux và SSH',
  title: 'Linux cơ bản và đăng nhập VPS bằng SSH',
  dek: 'Điều hướng thư mục, đặt quyền file và vào VPS 116.118.9.210 bằng khoá SSH thay cho mật khẩu.',
  theory: [
    { tag: 'Khái niệm', title: 'Cấu trúc thư mục trên VPS', body: [
      'Linux chỉ có một cây thư mục bắt đầu từ `/`. Đường dẫn bắt đầu bằng `/` là **tuyệt đối**, còn lại tính từ thư mục hiện tại (`pwd`). Dấu `~` là thư mục cá nhân của bạn, ở VPS là `/home/haidangphan`.',
      { tbl: [['Thư mục', 'Chứa gì', 'Ví dụ trong dự án'], ['/home/haidangphan', 'Thư mục cá nhân (~)', '~/tutor/gateway/docker.env'], ['/etc', 'File cấu hình hệ thống', '/etc/nginx, /etc/ssh/sshd_config'], ['/var/log', 'Nhật ký', '/var/log/auth.log, /var/log/nginx/'], ['/usr/bin', 'Các lệnh cài sẵn', 'curl, docker'], ['/tmp', 'File tạm, ai cũng ghi được', 'file thử nghiệm']] },
      { note: 'IP VPS dùng xuyên suốt khoá học là **116.118.9.210** (lấy từ lệnh `ip -br a`, cột eth0). Hãy đối chiếu với bảng điều khiển vpssieutoc.vn của bạn.', kind: 'tip' }
    ] },
    { tag: 'Cú pháp', title: 'Lệnh làm việc với file', body: [
      { tbl: [['Lệnh', 'Việc làm', 'Ghi nhớ'], ['pwd', 'Cho biết đang ở đâu', ''], ['cd /var/log', 'Chuyển thư mục', '`cd` trơn về ~, `cd -` quay lại'], ['ls -la', 'Liệt kê, gồm file ẩn và quyền', '`-l` chi tiết, `-a` file bắt đầu bằng chấm'], ['mkdir -p a/b/c', 'Tạo cả chuỗi thư mục', 'không có -p thì lỗi nếu thiếu cha'], ['cat file', 'In nội dung file', 'file dài dùng `head`, `tail -n 50`'], ['cp -r a b', 'Chép (thư mục cần -r)', ''], ['mv a b', 'Đổi tên hoặc chuyển', ''], ['rm -r thư_mục', 'Xoá, **không có thùng rác**', 'đọc kỹ đường dẫn trước khi Enter']] },
      'Ghi nội dung vào file bằng chuyển hướng: `>` ghi đè, `>>` nối thêm. Ống `|` đưa kết quả lệnh trước vào lệnh sau.',
      { pre: ['echo "POSTGRES_USER=app" > docker.env     # tạo mới hoặc ghi đè', 'echo "POSTGRES_DB=tutor_db" >> docker.env     # nối thêm dòng', 'cat docker.env | wc -l                       # đếm số dòng'] }
    ] },
    { tag: 'Bảng tra', title: 'Quyền file: rwx và chmod', body: [
      'Dòng `ls -l` bắt đầu bằng 10 ký tự, ví dụ `-rw-------`: ký tự đầu là loại (`-` file, `d` thư mục, `l` liên kết), sau đó ba nhóm rwx cho **chủ**, **nhóm**, **người khác**. Mỗi quyền có một con số: r=4, w=2, x=1, cộng lại thành một chữ số cho mỗi nhóm.',
      { tbl: [['Số', 'Ký hiệu', 'Dùng cho'], ['600', 'rw-------', 'khoá riêng SSH, file .env chứa mật khẩu'], ['700', 'rwx------', 'thư mục ~/.ssh'], ['644', 'rw-r--r--', 'file cấu hình công khai, khoá công khai .pub'], ['755', 'rwxr-xr-x', 'thư mục thường, script chạy được']] },
      { note: 'SSH từ chối dùng khoá riêng nếu người khác đọc được nó (644 là quá mở). Thông báo là `UNPROTECTED PRIVATE KEY FILE`, sau đó thường kèm `Permission denied (publickey)`.', kind: 'warn' }
    ] },
    { tag: 'Cú pháp', title: 'Khoá SSH và file ~/.ssh/config', body: [
      'Khoá SSH gồm hai file: **khoá riêng** (ở lại máy bạn) và **khoá công khai** `.pub` (đưa lên VPS vào `~/.ssh/authorized_keys`). Đăng nhập bằng khoá an toàn hơn mật khẩu vì không có gì để đoán.',
      { pre: ['ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_vps -C "duong@laptop"', 'ssh-copy-id -i ~/.ssh/id_ed25519_vps.pub haidangphan@116.118.9.210', 'ssh -i ~/.ssh/id_ed25519_vps haidangphan@116.118.9.210'], cap: 'Tạo khoá, đưa khoá công khai lên VPS, đăng nhập chỉ định khoá' },
      'ssh chỉ tự thử các tên mặc định (`id_rsa`, `id_ed25519`...). Khoá đặt tên khác như `id_ed25519_vps` phải khai báo bằng `-i` hoặc trong `~/.ssh/config` để gõ ngắn `ssh vps`:',
      { pre: ['Host vps', '    HostName 116.118.9.210', '    User haidangphan', '    IdentityFile ~/.ssh/id_ed25519_vps', '    IdentitiesOnly yes'], cap: '~/.ssh/config' }
    ] },
    { tag: 'Lưu ý', title: 'Cảnh báo "REMOTE HOST IDENTIFICATION HAS CHANGED"', body: [
      'Lần đầu kết nối, ssh lưu dấu vân tay của VPS vào `~/.ssh/known_hosts`. Sau khi bạn **cài lại VPS**, vân tay đổi và ssh từ chối kết nối để chống kẻ mạo danh.',
      { pre: ['ssh-keygen -R 116.118.9.210     # xoá dòng cũ của IP này khỏi known_hosts'] },
      { note: 'Chỉ xoá khi bạn biết chắc vừa cài lại VPS. Nếu không có lý do gì mà vân tay đổi, hãy dừng lại và kiểm tra đường mạng.', kind: 'warn' }
    ] }
  ],
  quiz: [
    { q: 'Quyền nào phù hợp nhất cho khoá riêng ~/.ssh/id_ed25519_vps?', opts: ['600', '644', '666', '777'], ans: 0, why: '600 chỉ cho chủ file đọc và ghi. 644 cho người khác đọc, ssh sẽ bỏ qua khoá và báo bad permissions.' },
    { q: 'Chạy lần lượt `echo "x" > a.txt` rồi `echo "y" > a.txt`. File a.txt chứa gì?', opts: ['x', 'y', 'x rồi y (hai dòng)', 'Báo lỗi vì file đã tồn tại'], ans: 1, why: '`>` ghi đè toàn bộ. Muốn thêm dòng mới dùng `>>`.' },
    { q: 'Bạn đã đưa khoá công khai lên VPS nhưng `ssh haidangphan@116.118.9.210` vẫn báo Permission denied (publickey). Khoá của bạn tên id_ed25519_vps. Nguyên nhân khả dĩ nhất?', opts: ['ssh không tự thử khoá có tên lạ, cần -i hoặc IdentityFile', 'VPS đang tắt', 'Sai DNS', 'Thiếu quyền sudo'], ans: 0, why: 'Khoá tên khác mặc định không được thử tự động. Thêm `-i ~/.ssh/id_ed25519_vps` hoặc khai báo IdentityFile trong ~/.ssh/config.' }
  ],
  lab: {
    host: 'laptop', user: 'duong', setup: laptop,
    items: [
      { text: 'Đi tới thư mục nhật ký hệ thống `/var/log`.', hint: 'cd /var/log', check: function (s) { return s.cwd === '/var/log'; } },
      { text: 'Tạo cây thư mục `~/tutor/gateway` chỉ bằng một lệnh.', hint: 'mkdir -p ~/tutor/gateway', check: function (s) { return s.fs.isD(s.home + '/tutor/gateway'); } },
      { text: 'Tạo file `~/tutor/gateway/docker.env` có dòng `POSTGRES_USER=app` (dùng echo và `>`).', hint: 'echo "POSTGRES_USER=app" > ~/tutor/gateway/docker.env', check: function (s) { var n = s.fs.get(s.home + '/tutor/gateway/docker.env'); return !!n && /POSTGRES_USER=app/.test(n.c); } },
      { text: 'Nối thêm dòng `POSTGRES_DB=tutor_db` vào cuối file đó mà không làm mất dòng cũ.', hint: 'echo "POSTGRES_DB=tutor_db" >> ~/tutor/gateway/docker.env', check: function (s) { var n = s.fs.get(s.home + '/tutor/gateway/docker.env'); return !!n && /POSTGRES_USER=app/.test(n.c) && /POSTGRES_DB=tutor_db/.test(n.c); } },
      { text: 'Chỉ chủ file được đọc và ghi `docker.env`: đặt quyền 600.', hint: 'chmod 600 ~/tutor/gateway/docker.env', check: function (s) { var n = s.fs.get(s.home + '/tutor/gateway/docker.env'); return !!n && (n.mode & 511) === M('600'); } },
      { text: 'Tạo cặp khoá ed25519 tên `id_ed25519_vps` trong ~/.ssh (nhận xét `duong@laptop`).', hint: 'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_vps -C "duong@laptop"', check: function (s) { var n = s.fs.get(s.home + '/.ssh/id_ed25519_vps'); return !!n && s.fs.isF(s.home + '/.ssh/id_ed25519_vps.pub') && (n.mode & 63) === 0; } },
      { text: 'Xem quyền các file trong ~/.ssh bằng `ls -la`.', hint: 'ls -la ~/.ssh', check: function (s) { return ran(s, /^ls -\w*l\w* .*\.ssh/); } }
    ]
  },
  debugs: [
    {
      id: 'c1d1', title: 'Permission denied (publickey) dù khoá đã nằm trên VPS',
      host: 'laptop', user: 'duong',
      symptom: L('$ ssh haidangphan@116.118.9.210', 'haidangphan@116.118.9.210: Permission denied (publickey).'),
      story: 'Hôm qua bạn đã đưa khoá công khai `id_ed25519_vps.pub` lên VPS. Hôm nay đăng nhập vẫn bị từ chối. Trong ~/.ssh còn một khoá cũ tên `id_ed25519` dùng cho GitHub.',
      goal: 'Đăng nhập thành công vào haidangphan@116.118.9.210.',
      hints: ['Xem tên các file khoá: `ls ~/.ssh`. Khoá nào đã được đưa lên VPS?', 'ssh chỉ tự thử khoá tên mặc định, nên nó thử `id_ed25519` (khoá GitHub) và bị từ chối. Cần chỉ rõ khoá đúng.', 'Thử: `ssh -i ~/.ssh/id_ed25519_vps haidangphan@116.118.9.210`'],
      fix: ['ssh -i ~/.ssh/id_ed25519_vps haidangphan@116.118.9.210'],
      cause: 'ssh tự thử các khoá tên mặc định (id_ed25519 là khoá GitHub, không có trên VPS) và không biết tới id_ed25519_vps. Giải pháp lâu dài: khai báo `IdentityFile ~/.ssh/id_ed25519_vps` và `IdentitiesOnly yes` trong ~/.ssh/config, sau đó gõ gọn `ssh vps`.',
      setup: function (s) {
        laptop(s); keyFile(s, 'id_ed25519', 'K2gh', M('600')); keyFile(s, 'id_ed25519_vps', 'K1vps', M('600'));
        s.W.ssh.authIds = ['K1vps'];
        s.fs.put(s.home + '/.ssh/known_hosts', IP + ' ssh-ed25519 AAAAC3NzaC1lZDI1NTE5' + s.W.ssh.hostFp.slice(-8) + '\n', { owner: s.user });
      },
      check: function (s) { return s.W.ssh.loginOK; }
    },
    {
      id: 'c1d2', title: 'Hai lỗi liên tiếp sau khi cài lại VPS',
      host: 'laptop', user: 'duong',
      symptom: L('$ ssh vps', '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @', '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', 'Host key verification failed.'),
      story: 'Bạn vừa cài lại VPS (chuyển từ Ubuntu 18.04 lên bản mới). File ~/.ssh/config đã có `Host vps` với IdentityFile đúng. Có thể sẽ còn lỗi thứ hai sau lỗi đầu tiên.',
      goal: 'Chạy `ssh vps` đăng nhập thành công.',
      hints: ['Cảnh báo đầu: vân tay máy chủ trong known_hosts là của VPS cũ. Bạn biết chắc VPS vừa cài lại nên xoá dòng cũ: `ssh-keygen -R 116.118.9.210`.', 'Chạy lại `ssh vps`. Nếu ssh nói `UNPROTECTED PRIVATE KEY FILE`, hãy xem quyền của khoá bằng `ls -l ~/.ssh`.', 'Đặt quyền khoá riêng về 600: `chmod 600 ~/.ssh/id_ed25519_vps` rồi `ssh vps` lại.'],
      fix: ['ssh-keygen -R 116.118.9.210', 'ssh vps', 'chmod 600 ~/.ssh/id_ed25519_vps', 'ssh vps'],
      cause: 'Lỗi 1: vân tay VPS thay đổi vì cài lại, known_hosts còn dòng cũ. Lỗi 2: khoá riêng có quyền 644 nên ssh bỏ qua. Mỗi lỗi chỉ lộ ra sau khi lỗi trước được sửa, nên đọc kỹ thông báo của từng lần chạy thay vì đoán.',
      setup: function (s) {
        laptop(s); keyFile(s, 'id_ed25519_vps', 'K1vps', M('644'));
        s.W.ssh.authIds = ['K1vps']; s.W.ssh.hostKeyChanged = true;
        s.fs.put(s.home + '/.ssh/known_hosts', '203.0.113.50 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5old1\n' + IP + ' ssh-ed25519 AAAAC3NzaC1lZDI1NTE5oldhost\n', { owner: s.user });
        s.fs.put(s.home + '/.ssh/config', 'Host vps\n    HostName ' + IP + '\n    User haidangphan\n    IdentityFile ~/.ssh/id_ed25519_vps\n    IdentitiesOnly yes\n', { owner: s.user, mode: M('600') });
      },
      check: function (s) { return s.W.ssh.loginOK; }
    }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
