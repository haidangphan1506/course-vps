(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, A = C.A2, B = C.B2;
function R(re) { return function (s) { return ran(s, re); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function S(s) { return V.sec.S(s.W); }
function txt(s, p) { var n = s.fs.get(p); return n ? n.c : ''; }
var BAD = '45.155.205.12';
var CF = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];

/* ================= A: thêm ================= */
A.theory.splice(3, 0, { tag: 'Quy trình', title: 'Thứ tự luật ufw và cách đối chiếu danh sách dài', body: [
  'ufw duyệt luật **từ trên xuống và dừng ở luật đầu tiên khớp**. Luật `deny from IP` đặt SAU `allow 443` sẽ không bao giờ được xét với gói tới cổng 443, vì luật allow đã khớp trước.',
  { pre: ['[ 1] OpenSSH                    ALLOW IN    Anywhere', '[ 2] 443/tcp                    ALLOW IN    Anywhere', '[ 3] Anywhere                   DENY IN     45.155.205.12      <- vô tác dụng với cổng 443', '', 'sudo ufw insert 1 deny from 45.155.205.12      # chèn LÊN ĐẦU', 'sudo ufw status numbered                          # kiểm tra lại'], cap: 'Luật chặn phải đứng trước luật cho phép trùng phạm vi' },
  { ul: ['`ufw insert N ...` chèn luật vào vị trí N; `ufw allow/deny` thường chỉ thêm vào cuối', 'Sau mỗi thay đổi hãy chạy `ufw status numbered` để xác nhận thứ tự', 'Luật mới của bạn ở cuối thường không bao giờ được dùng nếu phía trên đã có luật rộng hơn'] },
  'Khi danh sách luật dài (như 15 dải IP của Cloudflare), đừng đối chiếu bằng mắt. Dùng `sort | uniq -u`: dòng nào xuất hiện **một lần** là dòng chỉ có ở một phía.',
  { pre: ['sudo ufw status | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/[0-9]+" > ~/have.txt   # dải đã có trong ufw', 'sort ~/have.txt ~/cf-ips-v4.txt | uniq -u                                       # dải còn thiếu'], cap: 'Tìm dải Cloudflare chưa có trong ufw (file nguồn là cf-ips-v4.txt)' },
  { note: 'Cách này hoạt động khi một phía là tập con của phía kia. Phần thừa ở ufw sẽ hiện lẫn trong kết quả, nên hãy đọc kết quả có suy nghĩ.', kind: 'tip' }
] });
A.quiz.push(
  { q: 'ufw có `443/tcp ALLOW Anywhere` ở dòng 2 và `Anywhere DENY 45.155.205.12` ở dòng 4. IP đó vào cổng 443 được không?', opts: ['Không, deny luôn thắng', 'Được, vì luật allow ở trên khớp trước', 'Tuỳ thứ tự chữ cái', 'Chỉ khi bật IPv6'], ans: 1, why: 'ufw dừng ở luật đầu tiên khớp. Phải `ufw insert 1 deny from IP`.' },
  { q: '`sort a.txt b.txt | uniq -u` in ra gì?', opts: ['Các dòng trùng', 'Các dòng chỉ xuất hiện một lần trong hai file gộp', 'Số dòng', 'Tất cả dòng đã sắp xếp'], ans: 1, why: 'uniq -u giữ dòng không lặp. Nếu một file là tập con thì kết quả là phần chênh lệch.' },
  { q: 'Bạn thêm 14 trong 15 dải IP Cloudflare vào ufw rồi xoá luật mở 443 cho tất cả. Hậu quả?', opts: ['Không gì cả', 'Một số vùng của Cloudflare không tới được VPS, khách báo lỗi 522 lúc có lúc không', 'Site nhanh hơn', 'ufw tự thêm dải thiếu'], ans: 1, why: 'Dải thiếu thuộc về một số máy chủ biên của Cloudflare; người dùng đi qua máy chủ đó sẽ gặp 522.' }
);
(function () {
  var oldSetup = A.lab.setup;
  A.lab.setup = function (s) { oldSetup(s); s.fs.put(s.home + '/cf-ips-v4.txt', CF.join('\n') + '\n', { owner: s.user }); };
})();
A.lab.items.push(
  { text: 'Chặn IP tấn công `45.155.205.12` bằng cách CHÈN lên đầu danh sách (`ufw insert 1 deny from ...`).', hint: 'sudo ufw insert 1 deny from 45.155.205.12', check: function (s) { var r = s.W.ufw.rules[0]; return !!r && r.action === 'DENY' && r.from === BAD; } },
  { text: 'Xác nhận luật chặn đang đứng đầu (xem `status numbered`).', hint: 'sudo ufw status numbered', check: function (s) { return cnt(s, /^sudo ufw status numbered/) >= 2; } },
  { text: 'Lưu các dải IP hiện có trong ufw vào `~/have.txt` (`grep -oE` lấy dạng a.b.c.d/n).', hint: 'sudo ufw status | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/[0-9]+" > ~/have.txt', check: function (s) { return txt(s, s.home + '/have.txt').length > 0; } },
  { text: 'So với danh sách chuẩn `~/cf-ips-v4.txt` để tìm dải còn thiếu: `sort ... | uniq -u`.', hint: 'sort ~/have.txt ~/cf-ips-v4.txt | uniq -u', check: R(/^uniq -u/) }
);
A.debugs.push(
  {
    id: 'c2d10', title: 'Đã ufw deny IP tấn công nhưng nó vẫn vào được cổng 443',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo ufw status numbered', '[ 1] OpenSSH         ALLOW IN    Anywhere', '[ 2] 80/tcp          ALLOW IN    Anywhere', '[ 3] 443/tcp         ALLOW IN    Anywhere', '[ 4] Anywhere        DENY IN     45.155.205.12', '', '$ sudo tail -n 2 /var/log/nginx/access.log', '45.155.205.12 - - "GET /wp-login.php HTTP/1.1" 404', '45.155.205.12 - - "GET /.env HTTP/1.1" 404'),
    story: 'Bạn đã `ufw deny from 45.155.205.12` để chặn bot quét, nhưng access.log vẫn thấy IP đó gửi request tới Nginx (cổng 443) sau đó.',
    goal: 'Luật chặn IP 45.155.205.12 được xét TRƯỚC mọi luật allow cho cổng 443.',
    hints: ['Xem thứ tự luật: `sudo ufw status numbered`. Luật DENY nằm ở vị trí nào so với `443/tcp ALLOW Anywhere`?', 'ufw dừng ở luật đầu tiên khớp. `443/tcp ALLOW Anywhere` ở vị trí 3 khớp trước luật deny ở vị trí 4.', 'Chèn luật chặn lên đầu: `sudo ufw insert 1 deny from 45.155.205.12`, rồi kiểm tra lại bằng `status numbered`.'],
    fix: ['sudo ufw status numbered', 'sudo ufw insert 1 deny from 45.155.205.12', 'sudo ufw status numbered'],
    cause: 'Thứ tự luật là một phần của ý nghĩa luật. Luật chặn chi tiết (theo IP) phải đứng trước luật cho phép rộng (theo cổng). Luật cũ ở cuối vô hại nhưng thừa, có thể xoá bằng `ufw delete <số>` sau khi kiểm tra.',
    setup: function (s) {
      C.secBase(s);
      s.W.ufw.rules.push({ to: 'Anywhere', action: 'DENY', from: BAD });
      var a = txt(s, '/var/log/nginx/access.log');
      s.fs.put('/var/log/nginx/access.log', a + BAD + ' - - [26/Oct/2026:03:11:09 +0700] "GET /wp-login.php HTTP/1.1" 404 0\n' + BAD + ' - - [26/Oct/2026:03:11:10 +0700] "GET /.env HTTP/1.1" 404 0\n', { owner: 'root', mode: M('640') });
    },
    check: function (s) {
      var rs = s.W.ufw.rules, i;
      for (i = 0; i < rs.length; i++) {
        var r = rs[i];
        if ((r.from === BAD) || (r.from === 'Anywhere' && (r.to === '443/tcp' || r.to === 'Anywhere'))) return r.from === BAD && r.action === 'DENY';
      }
      return false;
    }
  },
  {
    id: 'c2d11', title: 'Siết ufw theo Cloudflare xong, một số khách báo lỗi 522',
    host: 'vps', user: 'haidangphan',
    symptom: L('Khách ở một số vùng: "Error 522: Connection timed out" (lúc có lúc không)', '', '$ sudo ufw status | grep -c 443', '14', '$ wc -l ~/cf-ips-v4.txt', '15 /home/haidangphan/cf-ips-v4.txt'),
    story: 'Bạn đã thay luật `443 Anywhere` bằng các luật theo dải IP Cloudflare. File ~/cf-ips-v4.txt là danh sách chuẩn 15 dải (đã tải về sẵn). ufw chỉ có 14 luật 443. Tìm đúng dải còn thiếu rồi thêm vào (đừng thêm lại luật mở 443 cho tất cả).',
    goal: 'ufw có đủ 15 luật `allow ... to any port 443 proto tcp` ứng với 15 dải trong file, và không có luật 443 mở cho Anywhere.',
    hints: ['Đếm và so sánh: file có 15 dòng, ufw có 14. Cần biết dòng NÀO thiếu, không đoán.', 'Lấy dải hiện có từ ufw ra file: `sudo ufw status | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/[0-9]+" > ~/have.txt`.', '`sort ~/have.txt ~/cf-ips-v4.txt | uniq -u` in ra dải thiếu. Thêm bằng `sudo ufw allow from <dải> to any port 443 proto tcp`.'],
    fix: ['sudo ufw status | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/[0-9]+" > ~/have.txt', 'sort ~/have.txt ~/cf-ips-v4.txt | uniq -u', 'sudo ufw allow from 104.16.0.0/13 to any port 443 proto tcp'],
    cause: 'Cloudflare dùng nhiều dải IP; thiếu một dải thì máy chủ biên dùng dải đó không kết nối được tới VPS và trả 522. Hãy tự động hoá việc đối chiếu bằng sort/uniq và kiểm tra lại danh sách chính thức theo định kỳ vì Cloudflare có thể đổi.',
    setup: function (s) {
      C.secBase(s);
      s.fs.put(s.home + '/cf-ips-v4.txt', CF.join('\n') + '\n', { owner: s.user });
      s.W.ufw.rules = [{ to: 'OpenSSH', action: 'ALLOW', from: 'Anywhere' }];
      CF.forEach(function (r) { if (r !== '104.16.0.0/13') s.W.ufw.rules.push({ to: '443/tcp', action: 'ALLOW', from: r }); });
    },
    check: function (s) {
      var rs = s.W.ufw.rules;
      return CF.every(function (r) { return rs.some(function (x) { return x.to === '443/tcp' && x.action === 'ALLOW' && x.from === r; }); }) && !rs.some(function (x) { return x.to === '443/tcp' && x.from === 'Anywhere'; });
    }
  },
  {
    id: 'c2d14', title: 'Sau đêm tự cập nhật, website sập: nginx không lên',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -sI -H "Host: api-tutor.haiphan.org" http://127.0.0.1', 'curl: (7) Failed to connect to 127.0.0.1 port 80', '', '$ sudo systemctl status nginx', '× nginx.service - A high performance web server', '     Active: failed (Result: exit-code)'),
    story: 'unattended-upgrades vừa nâng gói `nginx` lúc 03:30 và restart dịch vụ. Nginx không lên được lại. Trước đó bạn có sửa file site nhưng chưa reload nên không nhận ra lỗi.',
    goal: 'Nginx chạy lại và `api-tutor.haiphan.org` trả 200.',
    hints: ['Đọc nhật ký cập nhật: `sudo tail -n 5 /var/log/unattended-upgrades/unattended-upgrades.log` rồi `sudo systemctl status nginx`.', '`sudo nginx -t` chỉ ra đúng file và dòng sai: một directive viết thiếu chữ.', 'Sửa lỗi gõ (`proxy_pas` thành `proxy_pass`) bằng sed, `sudo nginx -t`, rồi `sudo systemctl restart nginx`.'],
    fix: ['sudo tail -n 5 /var/log/unattended-upgrades/unattended-upgrades.log', 'sudo systemctl status nginx', 'sudo nginx -t', "sudo sed -i 's/proxy_pas /proxy_pass /' /etc/nginx/sites-available/api-tutor.haiphan.org", 'sudo nginx -t', 'sudo systemctl restart nginx'],
    cause: 'Cấu hình lỗi âm thầm chờ sẵn: Nginx đang chạy giữ cấu hình cũ trong bộ nhớ, đến khi dịch vụ được restart (do cập nhật gói hoặc reboot) thì mới lộ. Quy tắc: sửa cấu hình xong luôn `nginx -t && reload` ngay; và sau khi bật tự cập nhật hãy có giám sát/alert cho dịch vụ chính.',
    setup: function (s) {
      C.secBase(s);
      C.gateway(s, { up: true });
      C.site(s, 'api-tutor.haiphan.org', 'server {\n    listen 80;\n    server_name api-tutor.haiphan.org;\n    location / {\n        proxy_pass http://127.0.0.1:8888;\n    }\n}\n');
      V.ngReload(s, false);
      s.fs.put('/etc/nginx/sites-available/api-tutor.haiphan.org', 'server {\n    listen 80;\n    server_name api-tutor.haiphan.org;\n    location / {\n        proxy_pas http://127.0.0.1:8888;\n    }\n}\n', { owner: 'root' });
      s.W.nginx.active = false;
      s.fs.put('/var/log/unattended-upgrades/unattended-upgrades.log', '2026-10-27 03:30:02 INFO Packages that will be upgraded: nginx\n2026-10-27 03:30:41 INFO All upgrades installed\n2026-10-27 03:30:42 WARNING nginx.service: restart failed (exit-code)\n', { owner: 'root' });
    },
    check: function (s) { return s.W.nginx.active && V.probe(s, 'http://api-tutor.haiphan.org', true).status === 200; }
  }
);

/* ================= B: thêm ================= */
B.theory.push(
  { tag: 'Cú pháp', title: 'SSH nâng cao: Match, hai lớp xác thực, ProxyJump, SFTP bị giam', body: [
    'Khối `Match` áp tuỳ chọn riêng cho một user/nhóm/địa chỉ. **Phải đặt ở cuối file** sshd_config, vì mọi dòng sau `Match` thuộc khối đó cho đến `Match` kế tiếp.',
    { pre: ['# cuối /etc/ssh/sshd_config', 'Match User deploy', '    AllowTcpForwarding no          # không cho tunnel', '    PermitTTY no                   # không cho shell tương tác', '    ForceCommand /usr/bin/docker compose up -d   # chỉ làm đúng 1 việc', '', 'Match User sftpuser', '    ChrootDirectory /srv/sftp', '    ForceCommand internal-sftp', '    AllowTcpForwarding no'], cap: 'User CI chỉ chạy được một lệnh; user SFTP bị giam trong một thư mục' },
    { pre: ['sudo sshd -T -C user=deploy,host=localhost,addr=127.0.0.1 | grep -E "allowtcpforwarding|permittty|forcecommand"'], cap: 'Xem cấu hình hiệu lực CHO user deploy (-C cần đủ user, host, addr)' },
    { tbl: [['Kỹ thuật', 'Cách làm', 'Lưu ý'], ['Hai lớp xác thực', 'Cài `libpam-google-authenticator`, bật `AuthenticationMethods publickey,keyboard-interactive`', 'Test kỹ bằng phiên mới; giữ phiên cũ mở; có mã khôi phục'], ['ProxyJump', '`ssh -J haidangphan@116.118.9.210 user@10.0.0.5` hoặc `ProxyJump vps` trong `~/.ssh/config`', 'Máy phía sau không cần public IP, mọi truy cập đi qua VPS (trạm nhảy)'], ['SFTP giam thư mục', '`ChrootDirectory` phải thuộc root và không ai khác ghi được', 'Sai quyền thư mục là lỗi thường gặp nhất'], ['ssh-agent', '`eval "$(ssh-agent)"` rồi `ssh-add khoá`', '`ssh -A` (chuyển tiếp agent) chỉ dùng với máy đáng tin']] },
    { note: 'Hai lớp xác thực làm tăng bảo mật nhưng cũng tăng nguy cơ tự khoá mình. Chỉ bật khi đã có đường cứu hộ (console nhà cung cấp) và đã lưu mã khôi phục.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'sudo có kiểm soát: sudoers.d, mật khẩu hết hạn, umask và nhật ký', body: [
    'Thay vì cấp `ALL` cho mọi tài khoản tự động, hãy cho phép **đúng lệnh cần thiết**:',
    { pre: ['# /etc/sudoers.d/deploy  (chmod 440)', 'deploy ALL=(ALL) NOPASSWD: /usr/bin/docker compose *', '', 'sudo chmod 440 /etc/sudoers.d/deploy', 'sudo visudo -c                  # kiểm tra cú pháp và quyền mọi file sudoers', 'sudo -l -U deploy              # liệt kê chính xác user đó chạy được gì'], cap: 'User deploy chỉ chạy được docker compose bằng sudo, không cần mật khẩu' },
    { note: 'Sai cú pháp file sudoers có thể khoá toàn bộ sudo. Luôn sửa bằng `visudo` hoặc tạo file trong `sudoers.d`, rồi `visudo -c`. File sudoers.d phải có quyền `440`, nếu không sudo bỏ qua và báo `bad permissions`.', kind: 'warn' },
    { tbl: [['Việc', 'Lệnh', 'Ý nghĩa'], ['Xem chính sách mật khẩu', '`sudo chage -l ops`', 'Ngày đổi, hết hạn, cảnh báo'], ['Bắt đổi mật khẩu mỗi 90 ngày', '`sudo chage -M 90 -W 14 ops`', '`-M` tối đa, `-W` cảnh báo trước'], ['Nhật ký sudo', '`sudo grep sudo /var/log/auth.log`', 'Ai chạy lệnh gì với quyền root, lúc nào'], ['Quyền mặc định file mới', '`umask 027`', 'File mới: chủ đọc/ghi, nhóm đọc, người khác không có gì']] },
    'Với tài khoản chỉ dùng khoá SSH (không mật khẩu), `chage` ít quan trọng; quan trọng là xoay khoá và gỡ khoá khi người rời đi.'
  ] }
);
B.quiz.push(
  { q: 'Khối `Match User deploy` trong sshd_config nên đặt ở đâu?', opts: ['Đầu file', 'Cuối file, vì mọi dòng sau Match thuộc khối đó', 'Trong thư mục /etc/ssh/keys', 'Ở đâu cũng được'], ans: 1, why: 'Match mở một khối kéo dài tới Match kế tiếp hoặc hết file. Đặt giữa file sẽ nuốt các tuỳ chọn phía sau.' },
  { q: 'File `/etc/sudoers.d/deploy` có quyền 644. Hậu quả?', opts: ['Không ảnh hưởng', 'sudo bỏ qua file và `visudo -c` báo bad permissions; cần chmod 440', 'Tự sửa thành 440', 'Mọi người dùng được sudo'], ans: 1, why: 'sudo yêu cầu file sudoers.d không cho người khác ghi/đọc rộng; quy ước là 0440.' },
  { q: 'Muốn user `deploy` chỉ chạy được `docker compose` bằng sudo, không cần mật khẩu. Cách đúng?', opts: ['Thêm vào nhóm sudo', 'Tạo /etc/sudoers.d/deploy với `deploy ALL=(ALL) NOPASSWD: /usr/bin/docker compose *`, chmod 440, visudo -c', 'Chạy deploy bằng root', 'Đặt mật khẩu rỗng'], ans: 1, why: 'Nhóm sudo cho toàn quyền. File sudoers.d giới hạn đúng lệnh cần.' },
  { q: '`ssh -J haidangphan@116.118.9.210 user@10.0.0.5` làm gì?', opts: ['Đăng nhập VPS bằng khoá user', 'Kết nối tới máy 10.0.0.5 thông qua VPS làm trạm nhảy', 'Sao chép file', 'Mở tunnel DB'], ans: 1, why: '-J (ProxyJump) đi qua máy trung gian, hữu ích khi máy đích chỉ có địa chỉ nội bộ.' }
);
B.lab.items = B.lab.items.filter(function (i) { return i.text.indexOf('visudo -c') < 0; });
B.lab.items.push(
  { text: 'Cho `deploy` quyền sudo CHỈ với `docker compose`: tạo `/etc/sudoers.d/deploy` (NOPASSWD).', hint: 'echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/docker compose *" | sudo tee /etc/sudoers.d/deploy', check: function (s) { return /^deploy ALL=\(ALL\) NOPASSWD: \/usr\/bin\/docker compose/m.test(txt(s, '/etc/sudoers.d/deploy')); } },
  { text: 'Kiểm tra bằng `visudo -c`: sẽ báo sai quyền file (đang 644). Chạy rồi đọc kết quả.', hint: 'sudo chmod 440 /etc/sudoers.d/deploy && sudo visudo -c', check: function (s) { var n = s.fs.get('/etc/sudoers.d/deploy'); return !!n && (n.mode & 511) === M('440') && ran(s, /^sudo visudo -c/); } },
  { text: 'Xem lại quyền sudo của `deploy`: giờ chỉ còn `docker compose`.', hint: 'sudo -l -U deploy', check: function (s) { return cnt(s, /^sudo -l -U deploy/) >= 2; } },
  { text: 'Bắt `ops` đổi mật khẩu tối đa 90 ngày, cảnh báo trước 14 ngày (`chage`).', hint: 'sudo chage -M 90 -W 14 ops', check: function (s) { var u = S(s).users.ops; return !!u && u.maxdays === 90 && u.warndays === 14; } },
  { text: 'Xem chính sách mật khẩu của `ops`.', hint: 'sudo chage -l ops', check: R(/^sudo chage -l ops/) },
  { text: 'Giam user `deploy`: thêm khối `Match User deploy` (không forwarding, không TTY) vào CUỐI sshd_config.', hint: 'echo -e "\\nMatch User deploy\\n    AllowTcpForwarding no\\n    PermitTTY no" | sudo tee -a /etc/ssh/sshd_config', check: function (s) { var e = V.sec.eff(s, { user: 'deploy' }); return e.allowtcpforwarding === 'no' && e.permittty === 'no'; } },
  { text: 'Xem cấu hình hiệu lực CHO user deploy: `sshd -T -C user=deploy,host=localhost,addr=127.0.0.1`.', hint: 'sudo sshd -T -C user=deploy,host=localhost,addr=127.0.0.1 | grep -E "allowtcpforwarding|permittty"', check: R(/^grep -E .*permittty/) },
  { text: 'Kiểm tra cú pháp và reload lần nữa để áp dụng khối Match.', hint: 'sudo sshd -t && sudo systemctl reload ssh', check: function (s) { return cnt(s, /^sudo systemctl reload ssh/) >= 2; } }
);
B.debugs.push(
  {
    id: 'c2d12', title: 'Đồng nghiệp bị mất quyền sudo sau khi chạy usermod',
    host: 'vps', user: 'haidangphan',
    symptom: L('(ops) $ sudo apt update', 'ops is not in the sudoers file.  This incident will be reported.', '', '$ id ops', 'uid=1001(ops) gid=1001(ops) groups=1001(ops),988(docker)'),
    story: 'Đồng nghiệp `ops` vừa chạy `sudo usermod -G docker ops` để vào nhóm docker. Từ đó mất quyền sudo. Bạn đang là haidangphan (có sudo). Khôi phục quyền sudo cho ops mà vẫn giữ nhóm docker.',
    goal: '`ops` thuộc nhóm sudo và vẫn thuộc nhóm docker.',
    hints: ['Xem nhóm: `id ops` và `getent group sudo`. Mất nhóm sudo từ khi nào?', '`usermod -G` (không có `-a`) ghi đè toàn bộ nhóm phụ: ops chỉ còn docker.', '`sudo usermod -aG sudo ops` (có `-a`), rồi kiểm tra `id ops`.'],
    fix: ['id ops', 'getent group sudo', 'sudo usermod -aG sudo ops', 'id ops'],
    cause: '`-G` không kèm `-a` thay thế danh sách nhóm. Luôn dùng `usermod -aG`. Biện pháp phòng ngừa: luôn còn ít nhất một tài khoản admin khác đăng nhập được khi sửa nhóm của chính mình.',
    setup: function (s) {
      C.secBase(s);
      var W = S(s);
      W.users.ops = { uid: 1001, sudo: false, locked: false, groups: ['docker'] };
      V.sec.sync(s);
    },
    check: function (s) { var u = S(s).users.ops; return !!u && u.sudo && u.groups.indexOf('docker') >= 0; }
  },
  {
    id: 'c2d13', title: 'CI/CD deploy bị từ chối: not listed in AllowUsers',
    host: 'vps', user: 'haidangphan',
    symptom: L('GitHub Actions: Permission denied (publickey).', '', '$ sudo grep deploy /var/log/auth.log | tail -1', 'sshd[5120]: User deploy from 20.201.28.151 not allowed because not listed in AllowUsers'),
    story: 'Tuần trước bạn thêm `AllowUsers haidangphan` để siết SSH. Hôm nay pipeline deploy (user `deploy`, khoá đã cài đúng) báo Permission denied. Sửa mà KHÔNG làm mất quyền của haidangphan.',
    goal: 'sshd đang chạy với AllowUsers gồm cả haidangphan và deploy.',
    hints: ['Log nói thẳng lý do: `not listed in AllowUsers`, không phải lỗi khoá. Xem cấu hình hiệu lực: `sudo sshd -T | grep allowusers`.', 'AllowUsers là danh sách trắng. Cần thêm `deploy` vào cùng dòng, giữ haidangphan.', "Sửa bằng sed, `sudo sshd -t`, rồi `sudo systemctl reload ssh` (đừng quên reload)."],
    fix: ['sudo grep deploy /var/log/auth.log | tail -1', 'sudo sshd -T | grep allowusers', "sudo sed -i 's/^AllowUsers haidangphan$/AllowUsers haidangphan deploy/' /etc/ssh/sshd_config", 'sudo sshd -t', 'sudo systemctl reload ssh'],
    cause: 'AllowUsers từ chối mọi user không có tên trong danh sách, kể cả khi khoá đúng. Mỗi lần thêm tài khoản dịch vụ mới (CI, backup) phải cập nhật danh sách. Cũng vì thế, hãy giữ ghi chú danh sách các tài khoản được phép SSH.',
    setup: function (s) {
      C.secBase(s);
      var W = S(s);
      W.users.deploy = { uid: 1002, sudo: false, locked: false, groups: [] };
      V.sec.sync(s);
      var n = s.fs.get('/etc/ssh/sshd_config'); n.c += 'AllowUsers haidangphan\n';
      V.sec.snapshot(s);
      s.fs.put('/var/log/auth.log', txt(s, '/var/log/auth.log') + 'Oct 27 10:02:11 vps sshd[5120]: User deploy from 20.201.28.151 not allowed because not listed in AllowUsers\n', { owner: 'root', mode: M('640') });
    },
    check: function (s) { var a = V.sec.applied(s).allowusers || []; return a.indexOf('deploy') >= 0 && a.indexOf('haidangphan') >= 0; }
  }
);
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
