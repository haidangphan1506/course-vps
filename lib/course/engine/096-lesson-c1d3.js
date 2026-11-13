(function (G) {
'use strict';
/* Bổ sung cho chương c1 (Linux và SSH): thêm quiz, lab, debug, bảng triệu chứng và checklist. */
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, IP = V.IP;
var ftxt = C.ftxt;
var Lc = C.lessons.filter(function (l) { return l.id === 'c1'; })[0];

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

/* ---------- lý thuyết ---------- */
Lc.theory.push(
  { tag: 'Bảng tra', title: 'Bảng triệu chứng thường gặp ở chương này', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân thường gặp', 'Lệnh kiểm tra', 'Cách sửa'],
      ['`Permission denied (publickey)`', 'Khoá chưa lên VPS, hoặc ssh không thử đúng khoá', '`ls ~/.ssh`, `ssh -i khoá user@host`', 'Dùng `-i` hoặc `IdentityFile` trong config'],
      ['`UNPROTECTED PRIVATE KEY FILE`', 'Khoá riêng có quyền quá rộng (644)', '`ls -l ~/.ssh`', '`chmod 600 ~/.ssh/khoá`'],
      ['`REMOTE HOST IDENTIFICATION HAS CHANGED`', 'VPS cài lại nên vân tay đổi', '`cat ~/.ssh/known_hosts`', '`ssh-keygen -R IP` (chỉ khi chắc chắn)'],
      ['`bash: ./x.sh: Permission denied`', 'File chưa có quyền thực thi', '`ls -l x.sh`', '`chmod +x x.sh`'],
      ['`command not found` dù file ở thư mục hiện tại', 'Thư mục hiện tại không nằm trong PATH', '`echo $PATH`', 'Gõ `./x.sh` hoặc đường dẫn đầy đủ'],
      ['`No such file or directory`', 'Sai đường dẫn hoặc sai thư mục hiện tại', '`pwd`, `ls`', 'Dùng đường dẫn tuyệt đối'],
      ['File cấu hình mất nội dung cũ', 'Dùng `>` (ghi đè) thay vì `>>` (nối thêm)', '`cat file`', 'Khôi phục từ bản sao; lần sau sao lưu trước']] }
  ] },
  { tag: 'Quy trình', title: 'Checklist cuối chương: sẵn sàng làm việc với VPS', body: [
    { ul: ['**1.** Điều hướng bằng đường dẫn tuyệt đối và tương đối mà không phải đoán (`pwd`, `ls -la`, `cd`)', '**2.** Biết khác nhau giữa `>`, `>>`, `|`, `2>`', '**3.** Đọc được cột quyền `rwxr-xr--` và đặt bằng `chmod 600/644/755/+x`', '**4.** Khoá riêng SSH quyền `600`, thư mục `~/.ssh` quyền `700`', '**5.** Có `~/.ssh/config` để gõ gọn `ssh vps`', '**6.** Biết đọc 3 thông báo SSH hay gặp: publickey, UNPROTECTED, HOST IDENTIFICATION', '**7.** Sao lưu file cấu hình (`cp file file.bak`) trước khi sửa', '**8.** Không bao giờ gửi khoá riêng (không có đuôi `.pub`) cho ai'] },
    { note: 'Sau chương này, tiếp tục với **Dịch vụ và tiến trình** (systemd, cron), **Gói, người dùng, đĩa, mạng** và **Shell script**: đó là bốn kỹ năng đủ để vận hành một VPS thật.', kind: 'tip' }
  ] }
);

/* ---------- quiz (+7) ---------- */
Lc.quiz = Lc.quiz.concat(C.QZ(1, [
  ['Lệnh nào tạo script `run.sh` thành chạy được bằng `./run.sh`?', '`chmod +x run.sh`', ['`chmod 600 run.sh`', '`mv run.sh /bin`', '`touch run.sh`'], 'Quyền thực thi (`x`) cho chủ file; `600` chỉ cho đọc và ghi.'],
  ['`ls /khong-co 2> err.txt` làm gì?', 'Ghi thông báo lỗi vào err.txt thay vì hiện ra màn hình', ['Ghi kết quả thành công vào err.txt', 'Xoá file err.txt', 'Tạo thư mục err.txt'], '`2>` chuyển luồng lỗi (stderr). `>` chỉ chuyển luồng kết quả (stdout).'],
  ['`cat docker.env | wc -l` đếm gì?', 'Số dòng của file docker.env', ['Số từ của file', 'Số file trong thư mục', 'Dung lượng file'], '`|` đưa đầu ra của lệnh trước làm đầu vào cho lệnh sau; `wc -l` đếm dòng.'],
  ['Thư mục `~/.ssh` nên có quyền nào?', '700 (chỉ chủ sở hữu vào được)', ['777', '644', '755 cho mọi người'], 'ssh từ chối tin thư mục cấu hình mà người khác ghi được. 700 là chuẩn.'],
  ['Bạn gõ `deploy.sh` và nhận `command not found`, dù file nằm ngay thư mục hiện tại. Cách gọi đúng?', '`./deploy.sh`, vì thư mục hiện tại không nằm trong PATH', ['`sudo deploy.sh`', '`cd / && deploy.sh`', '`chmod 000 deploy.sh`'], 'Shell chỉ tìm lệnh trong các thư mục của PATH. `./` chỉ rõ "file ở đây".'],
  ['Khác biệt `rm tep` và `rm -r thu-muc`?', '`-r` xoá đệ quy cả thư mục và nội dung bên trong', ['`-r` đưa file vào thùng rác', '`-r` chỉ xem trước, không xoá', 'Hai lệnh giống hệt nhau'], '`rm` không có thùng rác: xoá là mất. `rm -r` cần cẩn thận, kiểm tra bằng `ls` trước.'],
  ['Trong `ls -l`, dòng `-rw-r----- 1 duong duong ... a.txt` nghĩa là gì?', 'Chủ đọc và ghi; nhóm chỉ đọc; người khác không có quyền gì', ['Mọi người đều đọc và ghi được', 'File là thư mục', 'Chỉ nhóm được ghi'], 'Ba bộ `rw-`, `r--`, `---` lần lượt là chủ, nhóm, người khác (tương đương 640).']
]));

/* ---------- lab (+11) ---------- */
Lc.lab.items = Lc.lab.items.concat([
  { text: 'Liệt kê cả file ẩn trong thư mục home.', hint: 'ls -la ~', check: C.OK(/^ls -\w*a\w* \/home\/duong$/) },
  { text: 'Chép cả thư mục `~/tutor` sang `~/tutor-copy` (cần -r).', hint: 'cp -r ~/tutor ~/tutor-copy', transient: true, check: function (s) { return s.fs.isD(s.home + '/tutor-copy/gateway'); } },
  { text: 'Xem cây thư mục bản sao.', hint: 'ls -R ~/tutor-copy', transient: true, check: C.OK(/^ls -R \/home\/duong\/tutor-copy/) },
  { text: 'Chạy lệnh cố ý lỗi và ghi thông báo lỗi vào `~/err.txt`.', hint: 'ls /khong-co 2> ~/err.txt', check: function (s) { return /No such file/.test(ftxt(s, s.home + '/err.txt')); } },
  { text: 'Tạo script `~/run.sh` và cho chủ file quyền thực thi.', hint: 'echo "echo xin chao" > ~/run.sh\nchmod u+x ~/run.sh', check: function (s) { var n = s.fs.get(s.home + '/run.sh'); return !!n && (n.mode & 64) > 0; } },
  { text: 'Chạy script bằng đường dẫn đầy đủ (không cần đứng trong thư mục của nó).', hint: '~/run.sh', check: C.OK(/^\/home\/duong\/run\.sh$/) },
  { text: 'Siết quyền thư mục `~/.ssh` còn 700.', hint: 'chmod 700 ~/.ssh', check: function (s) { var n = s.fs.get(s.home + '/.ssh'); return !!n && (n.mode & 511) === M('700') && s.hist.some(function (h) { return h.code === 0 && /^chmod 700 \S*\.ssh$/.test(h.cmd); }); } },
  { text: 'Xoá bản sao thư mục (cần -r). Kiểm tra bằng ls trước khi xoá!', hint: 'rm -r ~/tutor-copy', check: function (s) { return !s.fs.get(s.home + '/tutor-copy') && s.hist.some(function (h) { return h.code === 0 && /^rm -r \/home\/duong\/tutor-copy$/.test(h.cmd); }); } },
  { text: 'Đọc khoá công khai (an toàn để chia sẻ).', hint: 'cat ~/.ssh/id_ed25519_vps.pub', check: C.OK(/^cat \S*id_ed25519_vps\.pub$/) }
]);

/* ---------- debug (+3) ---------- */
Lc.debugs = Lc.debugs.concat([
  {
    id: 'c1d3', title: 'Permission denied khi chạy script, command not found khi bỏ ./',
    host: 'laptop', user: 'duong',
    symptom: L('$ deploy.sh', 'bash: deploy.sh: command not found', '', '$ ./deploy.sh', 'bash: ./deploy.sh: Permission denied'),
    story: 'Bạn nhận script `~/deploy.sh` từ đồng nghiệp. Cả hai cách gọi đều thất bại với hai thông báo khác nhau.',
    goal: 'Chạy được `./deploy.sh` và thấy dòng "deploy xong".',
    hints: ['Hai thông báo cho hai vấn đề khác nhau. Thông báo thứ nhất do PATH; thông báo thứ hai nói về quyền.', 'Xem quyền: `ls -l deploy.sh`. Có `x` nào không?', 'Cấp quyền thực thi cho chủ file: `chmod u+x deploy.sh`, rồi chạy `./deploy.sh`.'],
    fix: ['ls -l deploy.sh', 'chmod u+x deploy.sh', './deploy.sh'],
    cause: '`deploy.sh` không có trong PATH nên phải gọi `./deploy.sh` (đường dẫn rõ ràng). Khi đó mới lộ lỗi thứ hai: file chưa có bit `x`. Hai lỗi độc lập, sửa từng lỗi.',
    setup: function (s) { laptop(s); s.fs.put(s.home + '/deploy.sh', '#!/bin/bash\necho "deploy xong"\n', { owner: s.user, mode: M('644') }); s.cwd = s.home; },
    check: function (s) { return s.hist.some(function (h) { return h.code === 0 && /^\.\/deploy\.sh$/.test(h.cmd); }); }
  },
  {
    id: 'c1d4', title: 'File .env mất hết biến sau khi thêm một dòng',
    host: 'laptop', user: 'duong',
    symptom: L('$ echo "POSTGRES_DB=tutor_db" > ~/tutor/gateway/docker.env', '$ cat ~/tutor/gateway/docker.env', 'POSTGRES_DB=tutor_db', '', '(trước đó file có thêm POSTGRES_USER và POSTGRES_PASSWORD)'),
    story: 'Bạn muốn thêm một biến vào `docker.env` nhưng dùng `>` thay vì `>>`. May là hôm trước bạn đã sao lưu `docker.env.bak`.',
    goal: '`docker.env` chứa đủ ba biến: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB.',
    hints: ['`>` ghi đè toàn bộ file. Nội dung cũ chỉ còn trong bản sao lưu.', 'Xem `cat ~/tutor/gateway/docker.env.bak` để chắc nó có hai biến cũ.', 'Khôi phục rồi nối thêm: `cp docker.env.bak docker.env` rồi `echo "POSTGRES_DB=tutor_db" >> docker.env`.'],
    fix: ['cat ~/tutor/gateway/docker.env.bak', 'cp ~/tutor/gateway/docker.env.bak ~/tutor/gateway/docker.env', 'echo "POSTGRES_DB=tutor_db" >> ~/tutor/gateway/docker.env', 'cat ~/tutor/gateway/docker.env'],
    cause: '`>` mở file ở chế độ ghi đè và cắt nội dung về 0 ngay trước khi lệnh chạy. Với file cấu hình luôn `cp file file.bak` trước khi sửa, và dùng `>>` khi chỉ thêm dòng.',
    setup: function (s) { laptop(s); s.fs.mkdirp(s.home + '/tutor/gateway', s.user, 493); s.fs.put(s.home + '/tutor/gateway/docker.env', 'POSTGRES_DB=tutor_db\n', { owner: s.user, mode: 420 }); s.fs.put(s.home + '/tutor/gateway/docker.env.bak', 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=s3cret\n', { owner: s.user, mode: 420 }); },
    check: function (s) { var t = ftxt(s, s.home + '/tutor/gateway/docker.env'); return /POSTGRES_USER=app/.test(t) && /POSTGRES_PASSWORD=s3cret/.test(t) && /POSTGRES_DB=tutor_db/.test(t); }
  },
  {
    id: 'c1d5', title: 'ssh vps: ba lỗi nối tiếp', hard: true,
    host: 'laptop', user: 'duong',
    symptom: L('$ ssh vps', '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @', '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', 'Host key verification failed.'),
    story: 'VPS vừa được cài lại. Bạn cũng sắp xếp lại thư mục ~/.ssh hôm qua. Sửa xong một lỗi, ssh có thể trả về lỗi khác: hãy đọc kỹ từng thông báo.',
    goal: '`ssh vps` đăng nhập thành công.',
    hints: ['Lỗi đầu: vân tay máy chủ đổi vì cài lại. Xoá dòng cũ trong known_hosts bằng `ssh-keygen -R`.', 'Sau đó xem thông báo mới. Nếu liên quan tới quyền của khoá, nhìn `ls -l ~/.ssh`.', 'Có thể config trỏ nhầm tên file khoá. So tên trong `cat ~/.ssh/config` với `ls ~/.ssh`, sửa cho khớp và đặt quyền 600.'],
    fix: ['ssh-keygen -R 116.118.9.210', 'ssh vps', 'ls -l ~/.ssh', 'cat ~/.ssh/config', "sed -i 's/id_ed25519_vsp/id_ed25519_vps/' ~/.ssh/config", 'chmod 600 ~/.ssh/id_ed25519_vps', 'ssh vps'],
    cause: 'Ba lỗi độc lập: vân tay cũ trong known_hosts, quyền khoá 644, và tên IdentityFile gõ nhầm (`vsp`). Mỗi lỗi chỉ lộ ra sau khi lỗi trước được sửa. Cách làm đúng là sửa từng lỗi và đọc lại thông báo mới, không đoán một lúc.',
    setup: function (s) {
      laptop(s); keyFile(s, 'id_ed25519_vps', 'K1vps', M('644'));
      s.W.ssh.authIds = ['K1vps']; s.W.ssh.hostKeyChanged = true;
      s.fs.put(s.home + '/.ssh/known_hosts', IP + ' ssh-ed25519 AAAAC3NzaC1lZDI1NTE5oldhost\n', { owner: s.user });
      s.fs.put(s.home + '/.ssh/config', 'Host vps\n    HostName ' + IP + '\n    User haidangphan\n    IdentityFile ~/.ssh/id_ed25519_vsp\n    IdentitiesOnly yes\n', { owner: s.user, mode: M('600') });
    },
    check: function (s) { return s.W.ssh.loginOK; }
  }
]);
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
