(function (G) {
'use strict';
var C = G.COURSE, L = C.L, ran = C.ran;
function add(id, o) {
  var l = C.lessons.filter(function (x) { return x.id === id; })[0];
  (o.theory || []).forEach(function (t) { l.theory.push(t); });
  (o.quiz || []).forEach(function (q) { l.quiz.push(q); });
  (o.items || []).forEach(function (i) { l.lab.items.push(i); });
}
function R(re) { return function (s) { return ran(s, re); }; }

add('c1', {
  theory: [
    { tag: 'Bảng tra', title: 'Xem và tìm nội dung file', body: [
      { tbl: [['Lệnh', 'Dùng để', 'Ví dụ'], ['`ls -la`', 'Liệt kê cả file ẩn, kèm quyền và chủ sở hữu', '`ls -la ~/.ssh`'], ['`cat`', 'In cả file', '`cat docker.env`'], ['`head -n 5` / `tail -n 5`', 'Vài dòng đầu / cuối', '`tail -n 20 /var/log/auth.log`'], ['`wc -l`', 'Đếm dòng', '`wc -l docker.env`'], ['`grep`', 'Lọc dòng chứa chuỗi', '`grep POSTGRES docker.env`'], ['`find`', 'Tìm file theo tên', '`find ~/tutor -name "*.env"`'], ['`cp` / `mv` / `rm`', 'Sao chép / đổi tên-di chuyển / xoá', '`cp a.env a.env.bak`']] },
      { note: '`rm` không có thùng rác: xoá là mất. Với file cấu hình luôn `cp` ra bản `.bak` trước khi sửa.', kind: 'warn' }
    ] },
    { tag: 'Bảng tra', title: 'Quyền file dạng số', body: [
      'Mỗi file có 3 nhóm quyền: **chủ sở hữu, nhóm, người khác**. Mỗi nhóm cộng `r`=4, `w`=2, `x`=1.',
      { tbl: [['Số', 'Nghĩa', 'Dùng cho'], ['600', 'Chủ đọc/ghi, người khác không có gì', 'Khoá riêng SSH, `docker.env`'], ['644', 'Chủ đọc/ghi, người khác chỉ đọc', 'File cấu hình thường, khoá công khai `.pub`'], ['700', 'Chỉ chủ vào được', 'Thư mục `~/.ssh`'], ['755', 'Chủ toàn quyền, người khác đọc và chạy', 'Thư mục thường, script']] },
      { pre: ['chmod 600 ~/.ssh/id_ed25519_vps', 'chmod 700 ~/.ssh', 'ls -l ~/.ssh'], cap: 'SSH từ chối khoá riêng nếu quyền quá rộng (lỗi UNPROTECTED PRIVATE KEY FILE)' }
    ] },
    { tag: 'Khái niệm', title: 'Pipe và redirect: ghép lệnh nhỏ thành việc lớn', body: [
      { tbl: [['Ký hiệu', 'Tác dụng'], ['`a | b`', 'Đầu ra của a thành đầu vào của b'], ['`> file`', 'Ghi đè file bằng đầu ra'], ['`>> file`', 'Nối thêm vào cuối file'], ['`2>&1`', 'Gộp thông báo lỗi vào đầu ra thường'], ['`a && b`', 'Chạy b chỉ khi a thành công'], ['`a ; b`', 'Chạy b dù a thành công hay không']] },
      { pre: ['cat docker.env | grep -v PASSWORD | wc -l', 'ls /khong-co 2>&1 | head -1'], cap: 'Đếm số dòng không chứa PASSWORD' }
    ] },
    { tag: 'Cú pháp', title: 'Biến môi trường, alias và lịch sử', body: [
      { pre: ['export TUTOR_HOME=~/tutor     # biến cho phiên hiện tại và tiến trình con', 'echo $TUTOR_HOME', "alias gw='cd ~/tutor/gateway'   # đặt lệnh tắt", 'history | tail -5                # 5 lệnh vừa gõ'] },
      'Biến và alias chỉ sống trong phiên. Muốn giữ lâu dài, ghi vào `~/.bashrc`. Phím tắt: `Tab` hoàn thành tên, `↑` lệnh cũ, `Ctrl+C` huỷ, `Ctrl+L` xoá màn hình.'
    ] }
  ],
  quiz: [
    { q: 'Lệnh nào nối thêm một dòng vào cuối docker.env mà không xoá nội dung cũ?', opts: ['echo "A=1" > docker.env', 'echo "A=1" >> docker.env', 'echo "A=1" | docker.env', 'cat "A=1" docker.env'], ans: 1, why: '`>>` nối thêm, `>` ghi đè toàn bộ file.' },
    { q: 'Thư mục ~/.ssh nên có quyền nào?', opts: ['777', '700', '666', '644'], ans: 1, why: '700: chỉ chủ sở hữu được vào. SSH có thể từ chối khoá nếu quyền quá rộng.' }
  ],
  items: [
    { text: 'Đếm số dòng của `~/tutor/gateway/docker.env`.', hint: 'wc -l ~/tutor/gateway/docker.env', check: R(/^wc -l/) },
    { text: 'Lọc dòng chứa `POSTGRES` trong file đó bằng `grep`.', hint: 'grep POSTGRES ~/tutor/gateway/docker.env', check: R(/^grep .*POSTGRES/) },
    { text: 'Sao lưu file thành `docker.env.bak` cùng thư mục.', hint: 'cp ~/tutor/gateway/docker.env ~/tutor/gateway/docker.env.bak', check: function (s) { return s.fs.isF(s.home + '/tutor/gateway/docker.env.bak'); } },
    { text: 'Tìm mọi file `.env` dưới `~/tutor` bằng `find`.', hint: 'find ~/tutor -name "*.env"', check: R(/^find /) },
    { text: 'Đặt biến `TUTOR_HOME` bằng `~/tutor` và in ra.', hint: 'export TUTOR_HOME=~/tutor; echo $TUTOR_HOME', check: function (s) { return !!((s.env && s.env.TUTOR_HOME) || (s.vars && s.vars.TUTOR_HOME)); } },
    { text: 'Tạo alias `gw` để nhảy tới `~/tutor/gateway`.', hint: "alias gw='cd ~/tutor/gateway'", check: function (s) { return !!(s.aliases && s.aliases.gw); } },
    { text: 'Xem 5 lệnh gần nhất bằng `history` và `tail`.', hint: 'history | tail -5', check: R(/^tail /) }
  ]
});

add('c2', {
  theory: [
    { tag: 'Bảng tra', title: 'Quản lý luật ufw', body: [
      { tbl: [['Lệnh', 'Tác dụng'], ['`sudo ufw status verbose`', 'Trạng thái, chính sách mặc định, mọi luật'], ['`sudo ufw status numbered`', 'Đánh số luật để xoá'], ['`sudo ufw delete 3`', 'Xoá luật số 3'], ['`sudo ufw allow from 203.0.113.7 to any port 22`', 'Chỉ cho một IP vào SSH'], ['`sudo ufw insert 1 deny from 103.149.28.77`', 'Chặn một IP; `insert 1` đặt luật lên đầu để không bị luật allow phía trên che mất'], ['`sudo ufw limit OpenSSH`', 'Giới hạn tần suất kết nối SSH']] },
      { note: 'Luôn `ufw allow OpenSSH` TRƯỚC `ufw enable`. Làm ngược lại là tự khoá mình khỏi VPS.', kind: 'warn' }
    ] },
    { tag: 'Quy trình', title: 'Danh sách cứng hoá SSH', body: [
      { tbl: [['Tuỳ chọn', 'Giá trị', 'Lý do'], ['`PermitRootLogin`', '`no`', 'Root là tên bị dò nhiều nhất'], ['`PasswordAuthentication`', '`no`', 'Chỉ cho đăng nhập bằng khoá, hết dò mật khẩu'], ['`PubkeyAuthentication`', '`yes`', 'Bật đăng nhập bằng khoá'], ['`X11Forwarding`', '`no`', 'Giảm bề mặt tấn công'], ['`MaxAuthTries`', '`3`', 'Ít lần thử mỗi kết nối']] },
      { pre: ['sudo sshd -t                      # kiểm tra cú pháp, im lặng là tốt', 'sudo systemctl reload ssh', '# giữ phiên cũ mở, mở phiên mới để thử trước khi đóng'], cap: 'Quy trình sửa sshd_config an toàn' }
    ] },
    { tag: 'Khái niệm', title: 'Fail2ban hoạt động thế nào', body: [
      'Fail2ban đọc `/var/log/auth.log`, đếm số lần đăng nhập sai theo IP; vượt ngưỡng thì thêm luật tường lửa chặn IP đó một thời gian (mặc định 10 phút).',
      { pre: ['sudo fail2ban-client status', 'sudo fail2ban-client status sshd      # IP đang bị cấm', 'sudo fail2ban-client set sshd unbanip 1.2.3.4'] },
      'Fail2ban là lớp phụ. Tắt đăng nhập bằng mật khẩu mới là biện pháp chính, vì khi đó bot dò mật khẩu không bao giờ thành công.'
    ] },
    { tag: 'Mẹo', title: 'Đọc auth.log để biết ai đang gõ cửa', body: [
      { tbl: [['Dòng log', 'Ý nghĩa'], ['`Failed password for root from IP`', 'Dò mật khẩu root'], ['`Failed password for invalid user admin`', 'Dò tên người dùng không tồn tại'], ['`Accepted publickey for haidangphan`', 'Đăng nhập khoá thành công (có thể là bạn)'], ['`Connection closed by authenticating user`', 'Ngắt khi chưa xác thực xong']] },
      { pre: ['sudo grep "Accepted" /var/log/auth.log | tail -5', 'sudo grep -c "Failed password" /var/log/auth.log'] }
    ] }
  ],
  quiz: [
    { q: 'Thứ tự an toàn để bật ufw trên VPS đang SSH vào?', opts: ['ufw enable rồi allow OpenSSH', 'allow OpenSSH rồi ufw enable', 'Chỉ cần enable', 'Tắt SSH trước'], ans: 1, why: 'Bật tường lửa khi chưa có luật SSH sẽ cắt kết nối của chính bạn.' },
    { q: 'Sau khi sửa sshd_config, việc nào bắt buộc làm trước reload?', opts: ['Xoá auth.log', 'sudo sshd -t', 'Khởi động lại VPS', 'ufw disable'], ans: 1, why: 'sshd -t phát hiện lỗi cú pháp, tránh reload thất bại khi bạn chỉ còn một phiên.' }
  ],
  items: [
    { text: 'Xem luật tường lửa đầy đủ kèm chính sách mặc định.', hint: 'sudo ufw status verbose', check: R(/^sudo ufw status verbose/) },
    { text: 'Xem luật có đánh số.', hint: 'sudo ufw status numbered', check: R(/^sudo ufw status numbered/) },
    { text: 'Xem trạng thái fail2ban của jail `sshd`.', hint: 'sudo fail2ban-client status sshd', check: R(/^sudo fail2ban-client status sshd/) },
    { text: 'Liệt kê các lần đăng nhập thành công (dòng `Accepted`) trong auth.log.', hint: 'sudo grep Accepted /var/log/auth.log', check: R(/^sudo grep .*Accepted/) },
    { text: 'Kiểm tra cú pháp sshd_config.', hint: 'sudo sshd -t', check: R(/^sudo sshd -t/) },
    { text: 'In các dòng `PermitRootLogin` và `PasswordAuthentication` đang có hiệu lực (dùng `grep -E` với dấu `|`).', hint: 'grep -E "^(PermitRootLogin|PasswordAuthentication)" /etc/ssh/sshd_config', check: R(/^grep -E .*PermitRootLogin/) }
  ]
});

add('c3', {
  theory: [
    { tag: 'Bảng tra', title: 'Các file và log của Nginx', body: [
      { tbl: [['Đường dẫn', 'Nội dung'], ['`/etc/nginx/nginx.conf`', 'Cấu hình chính, nạp `sites-enabled/*`'], ['`/etc/nginx/sites-available/`', 'Mỗi domain một file (nguồn)'], ['`/etc/nginx/sites-enabled/`', 'Symlink tới file đang bật'], ['`/var/log/nginx/access.log`', 'Mỗi request một dòng'], ['`/var/log/nginx/error.log`', 'Lỗi cấu hình và upstream']] },
      { pre: ['sudo systemctl status nginx', 'sudo tail -n 20 /var/log/nginx/error.log', 'sudo nginx -t && sudo systemctl reload nginx'], cap: 'Bộ ba kiểm tra sức khoẻ Nginx' }
    ] },
    { tag: 'Cú pháp', title: 'Các header proxy cần có', body: [
      { pre: ['location / {', '    proxy_pass http://127.0.0.1:3000;', '    proxy_http_version 1.1;', '    proxy_set_header Host $host;', '    proxy_set_header X-Real-IP $remote_addr;', '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', '    proxy_set_header X-Forwarded-Proto $scheme;', '}'] },
      { tbl: [['Header', 'Ứng dụng nhận được'], ['`Host`', 'Tên miền người dùng gõ (nếu thiếu, app thấy 127.0.0.1)'], ['`X-Forwarded-For`', 'IP thật của người dùng'], ['`X-Forwarded-Proto`', '`https` hay `http`, cần cho redirect và cookie secure']] }
    ] },
    { tag: 'Cú pháp', title: 'WebSocket, dung lượng upload, timeout', body: [
      { pre: ['location /socket.io/ {', '    proxy_pass http://127.0.0.1:8888;', '    proxy_http_version 1.1;', '    proxy_set_header Upgrade $http_upgrade;', '    proxy_set_header Connection "upgrade";', '}', '', 'client_max_body_size 20m;     # trong server {}, mặc định chỉ 1m', 'proxy_read_timeout 60s;'] },
      { tbl: [['Hiện tượng', 'Thường do'], ['413 Request Entity Too Large', '`client_max_body_size` nhỏ hơn file upload'], ['504 Gateway Timeout', 'Backend phản hồi chậm hơn `proxy_read_timeout`'], ['WebSocket ngắt ngay', 'Thiếu `Upgrade` và `Connection`']] }
    ] },
    { tag: 'Quy trình', title: 'Bảng mã lỗi Nginx', body: [
      { tbl: [['Mã', 'Nghĩa', 'Kiểm tra đầu tiên'], ['404', 'Không có route hoặc sai `location`', 'Ứng dụng có route đó không?'], ['444', 'Nginx tự đóng kết nối (do `return 444`)', 'Server block default có chặn nhầm domain không?'], ['502', 'Không nối được upstream', '`ss -tlnp`, đúng cổng chưa?'], ['504', 'Upstream quá chậm', 'Log ứng dụng, timeout']] },
      { note: 'Mỗi domain nên có block 80 riêng (chuyển hướng) và block 443 riêng. `server_name` quyết định block nào trả lời, còn khi không khớp thì rơi vào `default_server`.', kind: 'tip' }
    ] }
  ],
  quiz: [
    { q: 'Người dùng upload ảnh 5MB nhận 413. Cách xử lý?', opts: ['Tăng client_max_body_size trong server block rồi reload', 'Khởi động lại VPS', 'Đổi cổng backend', 'Xoá access.log'], ans: 0, why: 'Mặc định Nginx chỉ nhận body 1MB.' },
    { q: 'Ứng dụng nhận sai Host (thấy 127.0.0.1) khi qua Nginx. Thiếu dòng nào?', opts: ['proxy_set_header Host $host;', 'listen 80;', 'return 301;', 'gzip on;'], ans: 0, why: 'Không có header Host, Nginx gửi tên upstream thay vì tên miền gốc.' }
  ],
  items: [
    { text: 'Xem trạng thái dịch vụ Nginx.', hint: 'sudo systemctl status nginx', check: R(/^sudo systemctl status nginx/) },
    { text: 'Liệt kê thư mục `/etc/nginx/`.', hint: 'ls /etc/nginx/', check: R(/^ls \/etc\/nginx/) },
    { text: 'Đọc file cấu hình chính `nginx.conf`.', hint: 'cat /etc/nginx/nginx.conf', check: R(/^cat \/etc\/nginx\/nginx\.conf/) },
    { text: 'Xem 5 dòng cuối của access.log.', hint: 'sudo tail -n 5 /var/log/nginx/access.log', check: R(/^sudo tail .*access\.log/) },
    { text: 'Chỉ in mã trạng thái HTTP của site qua Nginx (`-s -o /dev/null -w "%{http_code}\\n"`).', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: tutor.haiphan.org" http://127.0.0.1', check: R(/^curl .*http_code/) }
  ]
});

add('c4', {
  theory: [
    { tag: 'Bảng tra', title: 'Các loại bản ghi DNS', body: [
      { tbl: [['Loại', 'Trỏ tới', 'Ví dụ'], ['A', 'Địa chỉ IPv4', '`tutor` -> 116.118.9.210'], ['AAAA', 'Địa chỉ IPv6', '`tutor` -> 2001:db8::1'], ['CNAME', 'Tên khác (bí danh)', '`www` -> `tutor.haiphan.org`'], ['TXT', 'Văn bản xác thực', 'SPF, chứng minh sở hữu domain, certbot DNS-01'], ['MX', 'Máy chủ nhận mail', 'Cấu hình email']] },
      'Không dùng CNAME cho domain gốc (`haiphan.org`), chỉ dùng A. `api-tutor.haiphan.org` và `tutor.haiphan.org` là hai bản ghi A độc lập cùng trỏ về một IP.'
    ] },
    { tag: 'Cú pháp', title: 'dig: hỏi DNS đúng cách', body: [
      { pre: ['dig +short tutor.haiphan.org', 'dig tutor.haiphan.org            # đầy đủ: ANSWER, TTL, máy chủ trả lời', 'dig +short TXT haiphan.org', 'dig @1.1.1.1 +short tutor.haiphan.org   # hỏi thẳng máy chủ DNS cụ thể'] },
      { note: 'TTL là thời gian bản ghi được cache. Sau khi đổi IP, mạng chậm cập nhật tới hết TTL; hạ TTL xuống 300 giây trước khi chuyển server.', kind: 'tip' }
    ] },
    { tag: 'Lưu ý', title: 'Khi bật proxy Cloudflare: IP thật của khách', body: [
      'Phía sau Cloudflare, `$remote_addr` của Nginx là IP của Cloudflare, không phải người dùng. IP thật nằm ở header `CF-Connecting-IP`.',
      { pre: ['# /etc/nginx/conf.d/cloudflare.conf', 'real_ip_header CF-Connecting-IP;', 'set_real_ip_from 173.245.48.0/20;     # lấy đủ dải ở cloudflare.com/ips'] },
      'Không thì log, giới hạn tốc độ và fail2ban đều thấy mọi người dùng là một IP.'
    ] },
    { tag: 'Khái niệm', title: 'Gia hạn chứng chỉ và chuyển hướng HTTPS', body: [
      { ul: ['Let\'s Encrypt hạn 90 ngày; certbot tự gia hạn khi còn dưới 30 ngày', '`sudo certbot renew --dry-run` chạy thử không thay đổi gì: nên chạy sau khi cấp mới', '`sudo certbot certificates` xem domain, ngày hết hạn và đường dẫn file', 'Chứng chỉ gồm `fullchain.pem` (cho `ssl_certificate`) và `privkey.pem` (cho `ssl_certificate_key`)'] },
      { tbl: [['Thành phần', 'Ai cấp', 'Dùng cho'], ['Chứng chỉ Let\'s Encrypt trên origin', 'certbot', 'Cloudflare Full (strict) kiểm tra được'], ['Chứng chỉ phía người dùng', 'Cloudflare', 'Trình duyệt thấy khoá xanh']] }
    ] }
  ],
  quiz: [
    { q: 'Cần trỏ www.haiphan.org về cùng nơi với haiphan.org. Dùng loại bản ghi nào?', opts: ['MX', 'CNAME', 'TXT', 'NS'], ans: 1, why: 'CNAME là bí danh của tên khác.' },
    { q: 'Sau Cloudflare, log Nginx chỉ thấy IP lạ lặp lại (IP Cloudflare). Cách khắc phục?', opts: ['Tắt Nginx', 'real_ip_header CF-Connecting-IP cùng set_real_ip_from', 'Cấp lại chứng chỉ', 'ufw deny'], ans: 1, why: 'Nginx cần được dặn lấy IP thật từ header CF-Connecting-IP.' }
  ],
  items: [
    { text: 'Hỏi IP của `api-tutor.haiphan.org`.', hint: 'dig +short api-tutor.haiphan.org', check: R(/^dig .*api-tutor/) },
    { text: 'Chạy `dig` dạng đầy đủ (không `+short`) cho `tutor.haiphan.org`.', hint: 'dig tutor.haiphan.org', check: R(/^dig tutor\.haiphan\.org$/) },
    { text: 'Liệt kê thư mục chứng chỉ `/etc/letsencrypt/live` (cần sudo).', hint: 'sudo ls /etc/letsencrypt/live', check: R(/^sudo ls \/etc\/letsencrypt\/live/) },
    { text: 'Xem chế độ SSL hiện tại của Cloudflare (lệnh giả lập).', hint: 'cfctl ssl-mode', check: R(/^cfctl ssl-mode$/) }
  ]
});

add('c5', {
  theory: [
    { tag: 'Khái niệm', title: 'Container nói chuyện với nhau bằng tên service', body: [
      'Compose tạo một mạng riêng. Trong mạng đó mỗi service có hostname bằng chính tên service. API kết nối DB bằng `postgres:5432`, **không phải** `127.0.0.1` (trong container, `127.0.0.1` là chính container đó).',
      { pre: ['# docker.env của api', 'DB_HOST=postgres', 'DB_PORT=5432'] },
      'Vì vậy cổng 5432 không cần publish ra ngoài khi chỉ API dùng. Bỏ hẳn `ports` của postgres là cách an toàn nhất, chỉ publish khi bạn cần mở DBeaver từ máy mình qua SSH tunnel.'
    ] },
    { tag: 'Khái niệm', title: 'Volume: dữ liệu sống lâu hơn container', body: [
      { tbl: [['Thao tác', 'Container', 'Dữ liệu volume'], ['`docker compose restart`', 'Chạy lại', 'Giữ'], ['`docker compose down`', 'Xoá', 'Giữ'], ['`docker compose down -v`', 'Xoá', '**Mất hết**'], ['`docker compose up -d` sau khi đổi image', 'Tạo lại', 'Giữ']] },
      { pre: ['docker exec tutor-postgres pg_dump -U app tutor_db > ~/backup-$(date +%F).sql', 'ls -lh ~/backup-*.sql'], cap: 'Sao lưu DB trước mỗi lần thay đổi lớn' }
    ] },
    { tag: 'Quy trình', title: 'Quy trình cập nhật bản mới của API', body: [
      { pre: ['cd ~/tutor/gateway', 'docker compose --env-file docker.env pull', 'docker compose --env-file docker.env up -d     # chỉ tạo lại service có thay đổi', 'docker compose logs api --tail 30           # chắc chắn khởi động sạch', 'docker image prune -f                         # dọn image cũ'] },
      { note: 'Nếu bản mới lỗi: sửa tag image về bản trước rồi `up -d` lại. Đó là lý do nên ghim tag (như `postgres:16`) thay vì `latest`.', kind: 'tip' }
    ] },
    { tag: 'Lưu ý', title: 'Giới hạn log container (tránh đầy đĩa)', body: [
      'Log container mặc định không giới hạn và nằm trong `/var/lib/docker`. Một API ồn ào có thể nuốt hàng chục GB (xem sự cố đầy đĩa ở chương 7). Thêm vào từng service:',
      { pre: ['    logging:', '      driver: json-file', '      options:', '        max-size: "10m"', '        max-file: "3"'] }
    ] }
  ],
  quiz: [
    { q: 'API trong container cần kết nối Postgres cùng compose. Host đúng là gì?', opts: ['127.0.0.1', 'postgres (tên service)', 'localhost', '116.118.9.210'], ans: 1, why: 'Trong mạng Compose, tên service là hostname. 127.0.0.1 trỏ về chính container API.' },
    { q: 'Cách nào KHÔNG làm mất dữ liệu Postgres?', opts: ['docker compose down -v', 'docker volume rm pgdata', 'docker compose down rồi up -d', 'Xoá thư mục volume'], ans: 2, why: '`down` bỏ container nhưng giữ volume.' }
  ],
  items: [
    { text: 'Xem trạng thái các service của dự án bằng Compose.', hint: 'docker compose --env-file docker.env ps', check: R(/^docker compose .*ps/) },
    { text: 'Liệt kê image đang có.', hint: 'docker images', check: R(/^docker images/) },
    { text: 'In biến môi trường bên trong container `tutor-api`.', hint: 'docker exec tutor-api env', check: R(/^docker exec tutor-api env/) },
    { text: 'Dừng `tutor-api`, rồi bật lại bằng `docker start`.', hint: 'docker stop tutor-api && docker start tutor-api', check: function (s) { return ran(s, /^docker stop tutor-api/) && ran(s, /^docker start tutor-api/); } },
    { text: 'Xem log của cả hệ thống Compose.', hint: 'docker compose --env-file docker.env logs', check: R(/^docker compose .*logs/) }
  ]
});

add('c6', {
  theory: [
    { tag: 'Bảng tra', title: 'Bộ lệnh PM2 thường dùng', body: [
      { tbl: [['Lệnh', 'Tác dụng'], ['`pm2 list`', 'Bảng trạng thái'], ['`pm2 logs TEN --lines 50 --nostream`', 'Xem log, không theo dõi liên tục'], ['`pm2 restart TEN` / `pm2 restart all`', 'Khởi động lại một / tất cả'], ['`pm2 stop TEN`', 'Dừng nhưng giữ trong danh sách'], ['`pm2 delete TEN`', 'Gỡ khỏi danh sách'], ['`pm2 save`', 'Lưu danh sách để khôi phục sau reboot'], ['`pm2 monit`', 'Bảng CPU/RAM theo thời gian thực (không chạy được trong mô phỏng)']] }
    ] },
    { tag: 'Quy trình', title: 'Quy trình deploy một lần cho cả hai ứng dụng', body: [
      { pre: ['cd ~/tutor/api && git pull && npm ci && npm run build', 'cd ~/tutor/ui  && git pull && npm ci && npm run build', 'pm2 restart ecosystem.config.js', 'pm2 list && pm2 logs --lines 10 --nostream', 'pm2 save'], cap: 'Gói vào một file deploy.sh để không bỏ sót bước' },
      { note: 'Dùng `&&` để dừng ngay khi một bước lỗi. Build hỏng mà vẫn restart là cách nhanh nhất để đưa trang xuống.', kind: 'warn' }
    ] },
    { tag: 'Khái niệm', title: 'Log của PM2 cũng có thể phình to', body: [
      'Log nằm ở `~/.pm2/logs/TEN-out.log` và `TEN-error.log`. Bật xoay vòng để không đầy đĩa:',
      { pre: ['pm2 install pm2-logrotate', 'pm2 set pm2-logrotate:max_size 10M', 'pm2 set pm2-logrotate:retain 7'] }
    ] },
    { tag: 'Mẹo', title: 'Biến môi trường và phiên bản Node', body: [
      { ul: ['Đặt biến trong khối `env` của ecosystem; đổi giá trị thì phải `pm2 restart TEN --update-env`', 'Bí mật (mật khẩu, khoá API) để trong file `.env` của ứng dụng, không ghi thẳng vào ecosystem rồi commit', 'Kiểm tra phiên bản: `node -v`; Next.js 15 cần Node 18.18 trở lên, Next.js 16 cần Node 20.9 trở lên. Nên chạy bản Node LTS còn hỗ trợ (22 hoặc 24); Node 18 và 20 đã hết hạn hỗ trợ', 'Cổng của từng app phải khác nhau và khớp với `proxy_pass` của Nginx (tutor-ui: 3000, tutor-api: 3001)'] }
    ] }
  ],
  quiz: [
    { q: 'Vì sao nên dùng `&&` giữa git pull, npm ci, npm run build, pm2 restart?', opts: ['Chạy nhanh hơn', 'Một bước lỗi thì dừng, tránh restart bằng bản build hỏng', 'Bắt buộc của PM2', 'Để ẩn log'], ans: 1, why: '`&&` chỉ chạy bước sau khi bước trước thành công.' },
    { q: 'pm2 stop khác pm2 delete ở chỗ nào?', opts: ['Không khác', 'stop giữ tiến trình trong danh sách, delete gỡ hẳn', 'delete nhanh hơn', 'stop xoá log'], ans: 1, why: 'stop chỉ dừng; delete bỏ khỏi danh sách quản lý.' }
  ],
  items: [
    { text: 'Dừng riêng `tutor-ui` rồi kiểm tra bảng trạng thái.', hint: 'pm2 stop tutor-ui && pm2 list', check: function (s) { return ran(s, /^pm2 stop tutor-ui/); } },
    { text: 'Khởi động lại mọi ứng dụng cùng lúc.', hint: 'pm2 restart all', check: R(/^pm2 restart all/) },
    { text: 'Xem cổng 3000 và 3001 có đang được Node giữ không.', hint: 'sudo ss -tlnp | grep node', check: function (s) { return ran(s, /^sudo ss -\w*p/) && ran(s, /^grep node/); } },
    { text: 'Cài thư viện cho API: vào `~/tutor/api` rồi `npm install`.', hint: 'cd ~/tutor/api && npm install', check: R(/^npm install/) }
  ]
});

add('c7', {
  theory: [
    { tag: 'Bảng tra', title: 'Đọc uptime và load average', body: [
      { pre: ['uptime', ' 09:12:44 up 8 days,  3:10,  1 user,  load average: 0.42, 0.35, 0.30'], cap: 'Ba số cuối: tải trung bình 1, 5, 15 phút' },
      'Quy tắc nhanh: so load với **số nhân CPU**. VPS 2 nhân mà load 1 phút kéo dài trên 2 nghĩa là quá tải (tiến trình xếp hàng chờ CPU). Số đang tăng (1 phút lớn hơn 15 phút) là sự cố đang xảy ra.',
      { tbl: [['Cột `free -h`', 'Cách đọc'], ['`available`', 'RAM thực sự dùng được, nhìn cột này chứ không phải `free`'], ['`Swap used`', 'Có dùng swap nhiều là RAM sắp cạn']] }
    ] },
    { tag: 'Bảng tra', title: 'Tìm thứ ăn dung lượng', body: [
      { pre: ['df -h                                  # phân vùng nào đầy', 'sudo du -sh /var/log/*                 # thư mục log nào lớn', 'sudo du -sh /var/lib/docker             # image, volume, log container', 'sudo journalctl --disk-usage'] },
      'Đi từ trên xuống: `df` cho biết phân vùng, `du -sh` lần lượt thu hẹp tới đúng file. Trên VPS web, thủ phạm thường là log Nginx, journal, log container, bản sao lưu cũ.'
    ] },
    { tag: 'Cú pháp', title: 'logrotate: dọn log tự động', body: [
      { pre: ['# /etc/logrotate.d/nginx (có sẵn)', '/var/log/nginx/*.log {', '    daily', '    rotate 14', '    compress', '    missingok', '    notifempty', '    postrotate', '        systemctl reload nginx', '    endscript', '}'], cap: 'Giữ 14 bản nén, mỗi ngày xoay một lần' },
      { pre: ['sudo journalctl --vacuum-size=200M    # giới hạn journal', 'sudo journalctl --vacuum-time=14d'] }
    ] },
    { tag: 'Quy trình', title: 'Danh sách kiểm tra hằng tuần', body: [
      { tbl: [['Việc', 'Lệnh'], ['Đĩa còn bao nhiêu', '`df -h`'], ['RAM, load', '`free -h`, `uptime`'], ['Ứng dụng sống', '`pm2 list`, `docker ps`'], ['Chứng chỉ còn hạn', '`sudo certbot certificates`'], ['Ai đang dò SSH', 'pipeline top IP trong auth.log (không có auth.log thì dùng `sudo journalctl -u ssh`)'], ['Cần khởi động lại chưa', '`cat /var/run/reboot-required` (có file nghĩa là có bản vá kernel chờ reboot)'], ['Bản vá hệ thống', '`sudo apt update && apt list --upgradable`']] },
      { note: 'Việc nào chạy lại mỗi tuần thì nên viết thành script và cho `cron` chạy. Chương cuối của khoá nên là: tự động hoá những việc này.', kind: 'tip' }
    ] }
  ],
  quiz: [
    { q: 'VPS 2 nhân CPU, load average 6.5 / 6.0 / 5.8. Kết luận?', opts: ['Bình thường', 'Quá tải kéo dài: tiến trình xếp hàng chờ CPU', 'Do RAM thừa', 'Do chứng chỉ'], ans: 1, why: 'Load gấp ~3 lần số nhân và ổn định nghĩa là quá tải.' },
    { q: 'Cột nào của `free -h` cho biết RAM thực sự dùng thêm được?', opts: ['free', 'available', 'shared', 'total'], ans: 1, why: '`available` đã tính cả phần cache có thể thu hồi.' }
  ],
  items: [
    { text: 'Xem uptime và load average.', hint: 'uptime', check: R(/^uptime/) },
    { text: 'Xem dung lượng từng mục trong `/var/log` (cần sudo).', hint: 'sudo du -sh /var/log/*', check: R(/^sudo du -sh \/var\/log/) },
    { text: 'Giới hạn journal ở 200M.', hint: 'sudo journalctl --vacuum-size=200M', check: R(/^sudo journalctl --vacuum-size/) },
    { text: 'Xem 10 dòng cuối của auth.log.', hint: 'sudo tail -n 10 /var/log/auth.log', check: R(/^sudo tail .*auth\.log/) },
    { text: 'Xem phiên bản nhân và tên máy chủ bằng `uname -a`.', hint: 'uname -a', check: R(/^uname -a/) }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
