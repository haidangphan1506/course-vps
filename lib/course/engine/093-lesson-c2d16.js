(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran;
function R(re) { return function (s) { return ran(s, re); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function S(s) { return V.sec.S(s.W); }
function txt(s, p) { var n = s.fs.get(p); return n ? n.c : ''; }
function H(path, ls) { return 'sudo tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function probe(s, host, path) { return V.probe(s, 'http://' + host + path, true); }

var SEC_CONF = ['server_tokens off;', 'add_header X-Content-Type-Options nosniff always;', 'add_header X-Frame-Options SAMEORIGIN always;', 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;', 'limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;'];
var APP_OK = ['server {', '    listen 80;', '    server_name app.haiphan.org;', '    root /var/www/app;', '    location ~ /\\.(?!well-known) {', '        return 404;', '    }', '    location / {', '        try_files $uri $uri/ =404;', '    }', '}'];
var APP_BAD = ['server {', '    listen 80;', '    server_name app.haiphan.org;', '    root /var/www/app;', '    location / {', '        try_files $uri $uri/ =404;', '    }', '}'];
var API_BAD = ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '    location / {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}'];
var API_OK = ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '    location /auth/login {', '        limit_req zone=login burst=2 nodelay;', '        limit_req_status 429;', '        proxy_pass http://127.0.0.1:8888;', '    }', '    location / {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}'];

function sites(s, app, api) {
  s.fs.mkdirp('/var/www/app', 'root', M('755'));
  s.fs.put('/var/www/app/index.html', '<h1>EduTrack</h1>\n', { owner: 'root' });
  s.fs.put('/var/www/app/.env', 'NODE_ENV=production\nJWT_SECRET=supersecret123\n', { owner: 'root', mode: M('644') });
  s.fs.put('/var/www/app/.git/config', '[remote "origin"]\n    url = https://ghp_tokenXYZ@github.com/duongpd/edutrack.git\n', { owner: 'root', mode: M('644') });
  C.site(s, 'app.haiphan.org', app.join('\n') + '\n');
  C.site(s, 'api-tutor.haiphan.org', api.join('\n') + '\n');
  V.ngReload(s, false);
}
function logs(s) {
  var bad = '45.155.205.12', acc = '';
  ['/.env', '/.git/config', '/wp-login.php', '/phpmyadmin/', '/.env', '/admin', '/.env', '/wp-login.php'].forEach(function (p, i) { acc += bad + ' - - [26/Oct/2026:03:1' + i + ':09 +0700] "GET ' + p + ' HTTP/1.1" 404 0 "-" "curl/8.5.0"\n'; });
  acc += '203.0.113.7 - - [26/Oct/2026:09:13:01 +0700] "GET / HTTP/1.1" 200 5120 "-" "Mozilla/5.0"\n';
  s.fs.put('/var/log/nginx/access.log', acc, { owner: 'root', mode: M('640') });
  var ufw = '';
  [['45.155.205.12', 14], ['185.220.101.4', 9], ['92.118.39.62', 4]].forEach(function (x) { for (var i = 0; i < x[1]; i++) ufw += 'Oct 26 0' + (1 + i % 8) + ':1' + (i % 10) + ':00 vps kernel: [UFW BLOCK] IN=eth0 OUT= SRC=' + x[0] + ' DST=116.118.9.210 PROTO=TCP SPT=4' + i + ' DPT=' + (i % 2 ? 3306 : 6379) + '\n'; });
  s.fs.put('/var/log/ufw.log', ufw, { owner: 'root', mode: M('640') });
}
function appCode(s) {
  var h = s.home;
  s.fs.mkdirp(h + '/tutor/api/src', s.user); s.fs.mkdirp(h + '/tutor/ui', s.user);
  s.fs.put(h + '/tutor/api/src/main.ts', "import { NestFactory } from '@nestjs/core';\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(8888);\n}\nbootstrap();\n", { owner: s.user });
  s.fs.put(h + '/tutor/api/src/auth.module.ts', "JwtModule.register({\n  secret: 'supersecret123',\n  signOptions: { expiresIn: '7d' },\n})\n", { owner: s.user });
  s.fs.put(h + '/tutor/api/src/app.module.ts', "TypeOrmModule.forRoot({\n  type: 'postgres',\n  host: 'postgres',\n  username: 'app',\n  password: 'Ab12cd34ef56',\n})\n", { owner: s.user });
  s.fs.put(h + '/tutor/api/.gitignore', 'node_modules\ndist\n', { owner: s.user });
  s.fs.put(h + '/tutor/ui/.env.production', 'NEXT_PUBLIC_API_URL=https://api-tutor.haiphan.org\nNEXT_PUBLIC_API_SECRET=Ab12cd34ef56\n', { owner: s.user, mode: M('600') });
}
function base(s) {
  C.secBase(s);
  s.fs.mkdirp('/tmp/.x', 'root', M('755'));
  s.fs.put('/tmp/.x/rootshell', '', { owner: 'root', mode: M('4755') });
  C.gateway(s, { up: true });
  s.W.hooks = { 'api.telegram.org': true };
  s.fs.put('/usr/bin/sudo', '', { owner: 'root', mode: M('4755') });
  s.fs.put('/usr/bin/passwd', '', { owner: 'root', mode: M('4755') });
  logs(s);
}

var Cc = { id: 'c2c', group: 'Nền tảng', short: 'Bảo mật: Nginx và ứng dụng', title: 'Bảo mật VPS (3): Nginx, rà soát, cảnh báo, sao lưu và ứng dụng', dek: 'Cứng hoá Nginx, chặn dò đường dẫn nhạy cảm và dò mật khẩu, rà soát bằng lynis, săn tấn công trong log, tự cảnh báo qua Telegram, sao lưu cấu hình và vá lỗi bí mật trong mã NestJS/Next.js.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c2b') idx = i; });
C.lessons.splice(idx + 1, 0, Cc);
C.C2 = Cc;

Cc.theory = [
  { tag: 'Cú pháp', title: 'Cứng hoá Nginx: giấu phiên bản và thêm header bảo mật', body: [
    'Mặc định Nginx tự khai phiên bản (`Server: nginx/1.24.0 (Ubuntu)`), giúp kẻ quét biết chính xác lỗ hổng nào áp dụng. Header bảo mật bảo trình duyệt tự bảo vệ người dùng.',
    { pre: ['# /etc/nginx/conf.d/security.conf  (nạp ở cấp http cho mọi site)', 'server_tokens off;', 'add_header X-Content-Type-Options nosniff always;', 'add_header X-Frame-Options SAMEORIGIN always;', 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;', 'add_header Referrer-Policy strict-origin-when-cross-origin always;'], cap: 'Một file dùng chung' },
    { tbl: [['Header', 'Chống', 'Lưu ý'], ['`X-Content-Type-Options: nosniff`', 'Trình duyệt tự đoán loại file (MIME sniffing)', 'An toàn, nên luôn bật'], ['`X-Frame-Options: SAMEORIGIN`', 'Clickjacking (nhúng site của bạn vào iframe lừa đảo)', 'Hoặc dùng CSP `frame-ancestors`'], ['`Strict-Transport-Security`', 'Hạ cấp HTTPS xuống HTTP', 'Chỉ bật khi HTTPS đã chạy ổn trên MỌI subdomain; khó quay lại'], ['`Content-Security-Policy`', 'XSS, tài nguyên lạ', 'Mạnh nhưng dễ làm hỏng site; thử ở chế độ report trước'], ['`Referrer-Policy`', 'Rò URL nội bộ qua header Referer', '']] },
    { note: '`add_header` bị **thừa kế ngược**: nếu một `location` hay `server` tự khai báo bất kỳ `add_header` nào thì toàn bộ header ở cấp trên bị bỏ qua cho nơi đó. Hãy khai báo lại đủ, hoặc `include` chung một snippet.', kind: 'warn' },
    { pre: ['sudo nginx -t && sudo systemctl reload nginx', 'curl -sI https://tutor.haiphan.org | grep -iE "^(server|x-frame|strict)"'], cap: 'Áp dụng và kiểm tra bằng curl -I' }
  ] },
  { tag: 'Cú pháp', title: 'Chặn đường dẫn nhạy cảm và thứ tự chọn location', body: [
    'Bot quét liên tục `/.env`, `/.git/config`, `/wp-login.php`, `/phpmyadmin`. Nếu thư mục `root` của site chứa những file đó, Nginx sẽ phục vụ chúng. Chặn bằng một location:',
    { pre: ['location ~ /\\.(?!well-known) {', '    return 404;          # hoặc: deny all;', '}'], cap: 'Chặn mọi đường dẫn bắt đầu bằng dấu chấm, trừ /.well-known (dùng cho certbot)' },
    { tbl: [['Cú pháp', 'Loại', 'Thứ tự ưu tiên'], ['`location = /x`', 'Khớp chính xác', '1 (cao nhất)'], ['`location ^~ /static/`', 'Tiền tố, dừng không xét regex', '2'], ['`location ~ \\.php$`, `~*`', 'Regex (`~*` không phân biệt hoa thường), xét theo thứ tự viết', '3'], ['`location /api/`', 'Tiền tố thường, lấy cái dài nhất', '4']] },
    { ul: ['Regex thắng tiền tố thường, nên location `~ /\\.` chặn được `/.env` dù có `location /`', '`return 404` trả gọn; `deny all` trả 403 (lộ rằng file có tồn tại)', 'Cách tốt hơn: không bao giờ để bí mật trong thư mục web. Chặn bằng Nginx là lớp phòng thủ thứ hai', 'Kiểm tra: `curl -s -o /dev/null -w "%{http_code}\\n" https://app.haiphan.org/.env` phải ra 404'] }
  ] },
  { tag: 'Cú pháp', title: 'Giới hạn tốc độ: limit_req chống dò mật khẩu', body: [
    'Endpoint đăng nhập là mục tiêu số một. `limit_req` giới hạn số request mỗi IP trước khi chúng chạm tới ứng dụng.',
    { pre: ['# http level (conf.d/security.conf)', 'limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;', '', '# trong server của API', 'location /auth/login {', '    limit_req zone=login burst=2 nodelay;', '    limit_req_status 429;', '    proxy_pass http://127.0.0.1:8888;', '}'], cap: 'Mỗi IP: 5 request/phút, cho phép bùng nổ thêm 2' },
    { tbl: [['Tham số', 'Ý nghĩa'], ['`$binary_remote_addr`', 'Khoá theo IP khách (nhỏ gọn hơn `$remote_addr`)'], ['`zone=login:10m`', 'Tên vùng nhớ và dung lượng (10m đủ cho hàng chục nghìn IP)'], ['`rate=5r/m`', 'Tốc độ trung bình cho phép'], ['`burst=2`', 'Hàng đợi vượt mức; request quá hạn bị từ chối'], ['`nodelay`', 'Xử lý ngay trong burst thay vì làm chậm'], ['`limit_req_status 429`', 'Mã trả về khi bị chặn (mặc định 503)']] },
    { note: 'Vùng `zone` phải được khai báo bằng `limit_req_zone` (ở cấp http) trước khi dùng, nếu không `nginx -t` báo `zero size shared memory zone`. Khi sau Cloudflare, phải khôi phục IP thật trước, nếu không mọi khách đều trông như chung IP Cloudflare.', kind: 'warn' },
    'Giới hạn đồng thời: `limit_conn_zone` và `limit_conn` chặn một IP mở quá nhiều kết nối cùng lúc.'
  ] },
  { tag: 'Quy trình', title: 'Cloudflare phía trước: IP thật, WAF, Origin Pulls và Tunnel', body: [
    { tbl: [['Việc', 'Cách làm', 'Tác dụng'],
      ['Khôi phục IP thật', 'Trong Nginx: `set_real_ip_from <dải Cloudflare>;` (lặp từng dải) và `real_ip_header CF-Connecting-IP;`', 'Log, `limit_req`, fail2ban thấy IP khách thật'],
      ['WAF và rate limit', 'Bảng điều khiển Cloudflare: Security > WAF > Custom rules / Rate limiting', 'Chặn tấn công ngay ở rìa, không tốn tài nguyên VPS'],
      ['Under Attack mode', 'Bật tạm khi bị DDoS', 'Hiển thị thử thách trình duyệt'],
      ['Authenticated Origin Pulls', 'Cloudflare gửi chứng chỉ khách; Nginx `ssl_client_certificate` + `ssl_verify_client on`', 'Chỉ Cloudflare (đúng tài khoản của bạn) nói chuyện được với Nginx'],
      ['Cloudflare Tunnel', '`cloudflared` trên VPS kết nối RA Cloudflare; không mở cổng 80/443', 'IP gốc không bao giờ lộ, đóng được cả cổng web'],
      ['Cloudflare Access', 'Đặt trang quản trị sau đăng nhập SSO', 'Không cần tự viết đăng nhập cho dashboard']] },
    { pre: ['set_real_ip_from 173.245.48.0/20;', 'set_real_ip_from 103.21.244.0/22;', '# ...các dải còn lại', 'real_ip_header CF-Connecting-IP;'], cap: 'Khôi phục IP thật trong nginx.conf hoặc conf.d' },
    { note: 'Chỉ tin header `CF-Connecting-IP` khi cổng 80/443 CHỈ nhận kết nối từ Cloudflare (ufw theo dải, hoặc Tunnel). Nếu không, kẻ tấn công tự gửi header giả để mạo danh IP.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Rà soát chủ động: lynis, SUID, file ghi được', body: [
    'Phòng thủ tốt vẫn phải **kiểm tra định kỳ** xem có gì lệch. Ba công cụ rẻ tiền nhất:',
    { pre: ['sudo lynis audit system                         # chấm điểm và liệt kê gợi ý cứng hoá', 'sudo find / -xdev -perm -4000 -type f           # file SUID: chạy với quyền chủ file (thường là root)', 'sudo find /var/www /home -type f -perm -0002     # file ai cũng ghi được', 'sudo awk -F: \'$3==0 {print $1}\' /etc/passwd       # tài khoản có UID 0 (chỉ nên có root)'], cap: 'Bộ rà soát ngắn' },
    { ul: ['**lynis** cho "Hardening index" và danh sách `Suggestions`. Mục tiêu không phải 100 điểm mà là hiểu từng gợi ý và quyết định có áp dụng không', '**SUID** hợp lệ nằm ở `/usr/bin` (sudo, passwd, mount). SUID ở `/tmp`, `/home`, `/var/www` là dấu hiệu cài cửa hậu', '**File ghi được bởi mọi người** (`-perm -0002`) trong thư mục web cho phép kẻ khác sửa mã của bạn', 'Lưu kết quả lần rà đầu tiên làm mốc; lần sau chỉ cần xem phần **khác biệt**'] },
    { note: 'Phát hiện file lạ: đừng xoá ngay. Ghi lại đường dẫn, chủ sở hữu, thời gian (`ls -l`, `stat`), sao chép làm bằng chứng rồi mới xoá, và tìm xem nó vào bằng đường nào.', kind: 'tip' }
  ] },
  { tag: 'Mẹo', title: 'Săn tấn công trong log: ufw.log và access.log', body: [
    { tbl: [['Muốn biết', 'Lệnh'], ['IP bị ufw chặn nhiều nhất', '`sudo grep "UFW BLOCK" /var/log/ufw.log | grep -oE "SRC=[0-9.]+" | sort | uniq -c | sort -rn | head -5`'], ['Cổng bị dò nhiều nhất', '`sudo grep "UFW BLOCK" /var/log/ufw.log | grep -oE "DPT=[0-9]+" | sort | uniq -c | sort -rn | head`'], ['Đường dẫn bị quét nhiều nhất', '`sudo awk \'{print $7}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10`'], ['Phân bố mã trạng thái', '`sudo awk \'{print $9}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn`'], ['Số request 404', '`sudo grep -c \'" 404 \' /var/log/nginx/access.log`'], ['Ai đã gọi `.env`', '`sudo grep "/.env" /var/log/nginx/access.log | awk \'{print $1}\' | sort -u`']] },
    'Cách đọc: một IP gửi hàng chục request 404 vào đường dẫn lạ (`wp-login.php`, `.env`, `phpmyadmin`) là bot quét. Một IP nhận mã **200** ở những đường dẫn đó mới là chuyện nghiêm trọng, vì bot đã lấy được nội dung.',
    { note: 'Chặn tự động: bật jail `nginx-botsearch` và `nginx-http-auth` của fail2ban (`[nginx-botsearch]` `enabled = true` trong jail.local), jail đọc `error.log` và chặn IP quét.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Cảnh báo tự động: script, cron và Telegram', body: [
    'Phát hiện chậm cũng là một dạng không phát hiện. Một script nhỏ chạy bằng cron có thể báo đầy đĩa, tải cao, hoặc đăng nhập SSH mới tới điện thoại bạn.',
    { pre: ['#!/bin/bash', '# ~/bin/disk-alert.sh', 'curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" -d "chat_id=<CHAT_ID>" -d "text=VPS tutor: canh bao dia tren 80 phan tram"'], cap: 'Script gửi tin Telegram (TOKEN lấy từ @BotFather, CHAT_ID là id cuộc trò chuyện)' },
    { pre: ['mkdir -p ~/bin', 'chmod +x ~/bin/disk-alert.sh                  # QUAN TRỌNG: thiếu bước này cron báo Permission denied', 'bash ~/bin/disk-alert.sh                       # chạy thử bằng tay trước', '# crontab -e:', '*/10 * * * * /home/haidangphan/bin/disk-alert.sh   # luôn dùng ĐƯỜNG DẪN TUYỆT ĐỐI'], cap: 'Trình tự đúng' },
    { ul: ['Cron chạy với môi trường rất trơ: không có `~`, PATH ngắn. Dùng đường dẫn tuyệt đối cho cả script lẫn lệnh bên trong', 'Lỗi của cron nằm trong `grep CRON /var/log/syslog`', 'Token bot là bí mật: chmod 700 cho script, không commit vào Git', 'Trong script thật, kiểm tra điều kiện (ví dụ `df / | awk ...` lớn hơn 80) rồi mới gửi để tránh spam', 'Cảnh báo SSH: đặt lệnh gọi script trong `/etc/ssh/sshrc` hoặc dùng PAM; cảnh báo fail2ban: thêm action Telegram cho jail'] },
    'Không muốn tự viết: **Uptime Kuma** (có sẵn trong lab Docker) theo dõi website/cổng và gửi cảnh báo qua Telegram, email, Slack.'
  ] },
  { tag: 'Quy trình', title: 'Sao lưu cấu hình và khả năng khôi phục', body: [
    'Backup dữ liệu (pg_dump) đã có ở chương Docker. Cấu hình hệ thống cũng cần: mất `/etc/nginx` hay `/etc/ssh` nghĩa là mất hàng giờ dựng lại.',
    { pre: ['mkdir -p ~/backups', 'sudo tar czf ~/backups/etc-config.tgz /etc/nginx /etc/ssh /etc/fail2ban /etc/ufw', 'tar tzf ~/backups/etc-config.tgz | head -5      # xem bên trong', 'sudo tar xzf ~/backups/etc-config.tgz -C /      # khôi phục về đúng chỗ cũ'], cap: 'Sao lưu và khôi phục cấu hình' },
    { tbl: [['Lớp', 'Nội dung', 'Công cụ'], ['Dữ liệu', 'Postgres, uploads', '`pg_dump`, `tar`'], ['Cấu hình', '`/etc/nginx`, `/etc/ssh`, `ufw`, `jail.local`, `docker-compose.yml`', '`tar`, Git riêng, `etckeeper`'], ['Toàn máy', 'Cả đĩa', 'Snapshot của nhà cung cấp VPS (trước mỗi lần thay đổi lớn)'], ['Ngoài VPS', 'Bản sao ở nơi khác', '`rsync`/`rclone` lên máy khác hoặc kho lưu trữ']] },
    { note: 'Quy tắc 3-2-1: 3 bản, 2 loại lưu trữ, 1 bản ở nơi khác. Và backup chưa thử khôi phục thì chưa phải backup: hãy thử `tar tzf` rồi khôi phục vào thư mục tạm định kỳ.', kind: 'warn' },
    'Mật khẩu, khoá riêng, token bên trong backup cũng là bí mật: để file backup quyền `600`, mã hoá (`gpg -c`) trước khi gửi ra ngoài.'
  ] },
  { tag: 'Cú pháp', title: 'Bảo mật API NestJS: helmet, CORS, throttler, validation', body: [
    { pre: ["// main.ts", "import helmet from 'helmet';", "const app = await NestFactory.create(AppModule);", "app.use(helmet());                                     // header bảo mật", "app.enableCors({ origin: ['https://tutor.haiphan.org'] });   // CHỈ domain của bạn, không dùng '*'", "app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));", "await app.listen(8888, '127.0.0.1');                   // nghe loopback, Nginx đứng ngoài"], cap: 'Khởi tạo an toàn' },
    { pre: ["// app.module.ts: giới hạn tốc độ ở tầng ứng dụng", "ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])", "// riêng endpoint đăng nhập:", "@Throttle({ default: { limit: 5, ttl: 60000 } })"], cap: '@nestjs/throttler: lớp phòng thủ thứ hai sau limit_req của Nginx' },
    { tbl: [['Rủi ro', 'Biện pháp'], ['Mật khẩu/secret viết cứng trong mã', '`process.env.JWT_SECRET` qua `ConfigModule`; mã không chứa bí mật'], ['Dữ liệu vào bẩn (SQL injection, thừa trường)', '`ValidationPipe` với `whitelist`; dùng truy vấn tham số của ORM'], ['Lộ chi tiết lỗi', 'Filter trả thông báo chung; không trả stack trace ở production (`NODE_ENV=production`)'], ['CORS `*`', 'Danh sách origin cụ thể'], ['JWT sống quá lâu', '`expiresIn` ngắn kèm refresh token; secret dài, ngẫu nhiên, xoay định kỳ'], ['Mật khẩu người dùng', 'Băm bằng `bcrypt`/`argon2`, không bao giờ lưu rõ']] }
  ] },
  { tag: 'Lưu ý', title: 'Bảo mật Next.js: NEXT_PUBLIC_ và cookie', body: [
    'Mọi biến môi trường bắt đầu bằng **`NEXT_PUBLIC_` được nhúng thẳng vào mã JavaScript gửi tới trình duyệt**. Ai cũng đọc được bằng "Xem nguồn".',
    { tbl: [['Biến', 'Ai thấy', 'Dùng cho'], ['`NEXT_PUBLIC_API_URL`', 'Mọi người dùng', 'Địa chỉ API công khai'], ['`API_SECRET`, `DB_PASSWORD`', 'Chỉ server Next.js', 'Bí mật; chỉ dùng trong Server Components / API routes']] },
    { note: 'Đặt `NEXT_PUBLIC_API_SECRET=...` là biến thành "bí mật công khai": phải đổi tên bỏ tiền tố `NEXT_PUBLIC_`, rồi **xoay giá trị** vì nó đã bị gửi ra Internet.', kind: 'warn' },
    { pre: ["// đặt token đăng nhập trong cookie an toàn:", "cookies().set('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });", '', '// next.config.js', 'async headers() { return [{ source: "/(.*)", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "X-Content-Type-Options", value: "nosniff" }] }]; }'], cap: 'Cookie và header trong Next.js' },
    { ul: ['`httpOnly`: JavaScript trên trang không đọc được cookie (chống đánh cắp qua XSS)', '`secure`: chỉ gửi qua HTTPS; `sameSite`: giảm CSRF', 'Không lưu JWT trong `localStorage` nếu có thể tránh', 'Không dùng `dangerouslySetInnerHTML` với dữ liệu người dùng nếu chưa lọc'] }
  ] },
  { tag: 'Quy trình', title: 'Bí mật nằm trong mã nguồn: tìm, thay, xoay', body: [
    { pre: ['grep -rnE "(password|secret|api[_-]?key|token)\\s*[:=]\\s*[\'\\"]" ~/tutor/api/src      # tìm bí mật viết cứng', "sed -i \"s/secret: 'supersecret123'/secret: process.env.JWT_SECRET/\" ~/tutor/api/src/auth.module.ts", 'echo ".env*" >> ~/tutor/api/.gitignore                                # đừng commit file bí mật'], cap: 'Thay giá trị viết cứng bằng biến môi trường' },
    { ul: ['Bí mật đã commit vào Git xem như đã lộ, kể cả khi xoá ở commit sau (lịch sử vẫn còn). Việc đầu tiên: **xoay**', 'Dùng `git-secrets`, `gitleaks` hoặc GitHub secret scanning để bắt bí mật trước khi push', 'Token Git chèn trong URL remote (`https://ghp_xxx@github.com/...`) nằm trong `.git/config`: nếu thư mục `.git` bị phục vụ qua web là lộ luôn', 'Thứ tự xử lý: đổi bí mật ở dịch vụ gốc, cập nhật `.env`/`docker.env`, `up -d`, rồi mới dọn mã nguồn'] }
  ] },
  { tag: 'Bảng tra', title: 'Bảng triệu chứng: Nginx, log và ứng dụng', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân hay gặp', 'Kiểm tra'],
      ['`GET /.env` trả 200', 'Thư mục `root` chứa file bí mật', '`curl -s -o /dev/null -w "%{http_code}"`, `ls -la /var/www`'],
      ['`nginx -t`: `zero size shared memory zone`', 'Dùng `limit_req` khi chưa khai báo `limit_req_zone`', 'Tên zone trong `conf.d`'],
      ['Mọi khách bị 429/503 cùng lúc', 'Sau Cloudflare nhưng chưa khôi phục IP thật nên coi cả thế giới là một IP', '`set_real_ip_from`, `real_ip_header`'],
      ['Header bảo mật biến mất ở một location', '`add_header` ở cấp location ghi đè cấp trên', 'Khai báo lại hoặc `include` snippet'],
      ['Cron báo `Permission denied`', 'Script thiếu quyền thực thi', '`ls -l`, `chmod +x`, `grep CRON /var/log/syslog`'],
      ['Cảnh báo Telegram không tới', 'Token/chat_id sai, VPS chặn ra ngoài, script lỗi', 'Chạy tay `bash script`, xem phản hồi của curl'],
      ['`lynis` điểm thấp', 'Chưa vá, thiếu header, SSH chưa siết', 'Đọc phần Suggestions từng dòng'],
      ['Có file SUID trong `/tmp`', 'Cửa hậu', '`find / -xdev -perm -4000`, `ls -l`']] }
  ] },
  { tag: 'Quy trình', title: 'Tổng kết ba chương Bảo mật: phòng thủ, phát hiện, ứng phó', body: [
    { tbl: [['Lớp', 'Đã làm', 'Chương'], ['Mạng', 'ufw deny mặc định; chỉ 22/80/443; Docker bind 127.0.0.1; thứ tự luật đúng; Cloudflare', 'Bảo mật (1)'], ['Truy cập', 'User thường; khoá SSH; tắt mật khẩu; AllowUsers; fail2ban có ignoreip', 'Bảo mật (2)'], ['Web', 'server_tokens off; header; chặn dotfile; limit_req', 'Bảo mật (3)'], ['Ứng dụng', 'helmet, CORS, throttler; không bí mật trong mã', 'Bảo mật (3)'], ['Vá', 'unattended-upgrades; reboot có kế hoạch; vá image Docker', 'Bảo mật (1)'], ['Phát hiện', 'lynis, SUID, log, cảnh báo Telegram, Uptime Kuma', 'Bảo mật (3), Giám sát'], ['Ứng phó', 'Dấu hiệu xâm nhập; xoay bí mật; backup cấu hình và dữ liệu', 'Bảo mật (2), (3), Docker']] },
    { ul: ['Lịch gợi ý: **hằng ngày** xem cảnh báo; **hằng tuần** `apt list --upgradable`, `last`, `fail2ban-client status`; **hằng tháng** `lynis`, kiểm tra backup bằng cách khôi phục thử; **mỗi khi có người rời nhóm** gỡ khoá SSH và xoay bí mật'] },
    'Không có hệ thống nào an toàn tuyệt đối. Mục tiêu là làm cho tấn công tốn kém hơn giá trị thu được, phát hiện nhanh khi có chuyện, và khôi phục được.'
  ] }
];

Cc.quiz = [
  { q: 'Bạn thêm `add_header X-Frame-Options SAMEORIGIN;` ở cấp http, nhưng trong `location /api/` có `add_header Cache-Control no-store;`. Phản hồi từ /api/ có X-Frame-Options không?', opts: ['Có', 'Không: location khai báo add_header riêng nên header cấp trên không được thừa kế', 'Chỉ khi có always', 'Tuỳ trình duyệt'], ans: 1, why: 'add_header chỉ được thừa kế khi cấp hiện tại không có add_header nào. Phải khai báo lại hoặc include chung snippet.' },
  { q: '`server_tokens off;` làm gì?', opts: ['Tắt HTTPS', 'Ẩn số phiên bản Nginx khỏi header Server và trang lỗi', 'Chặn bot', 'Tăng tốc'], ans: 1, why: 'Giảm thông tin cho kẻ quét; header Server chỉ còn "nginx".' },
  { q: 'Vì sao `location ~ /\\.(?!well-known) { return 404; }` có `(?!well-known)`?', opts: ['Để chặn cả .well-known', 'Để vẫn cho phép /.well-known/ (certbot xác thực domain) trong khi chặn các dotfile khác', 'Để tăng tốc', 'Không có tác dụng'], ans: 1, why: 'Phủ định tiến trước loại trừ /.well-known; nếu chặn nhầm, certbot không gia hạn được chứng chỉ.' },
  { q: 'Có `location /` và `location ~ /\\.env`. Request `/.env` vào location nào?', opts: ['/ vì dài nhất', 'Regex ~ /\\.env (regex thắng tiền tố thường)', 'Báo lỗi', 'Ngẫu nhiên'], ans: 1, why: 'Thứ tự: = chính xác, ^~ tiền tố, regex theo thứ tự, rồi mới tiền tố thường dài nhất.' },
  { q: '`nginx -t` báo `zero size shared memory zone "login"`. Thiếu gì?', opts: ['Chứng chỉ SSL', '`limit_req_zone ... zone=login:10m ...` ở cấp http', 'Quyền file', 'Cổng 80'], ans: 1, why: 'limit_req tham chiếu một zone chưa được khai báo bằng limit_req_zone.' },
  { q: 'Đặt `limit_req` theo IP trên site đứng sau Cloudflare mà chưa khôi phục IP thật. Điều gì xảy ra?', opts: ['Hoạt động hoàn hảo', 'Mọi khách chung IP của Cloudflare nên bị giới hạn chung, dễ chặn nhầm người dùng thật', 'Cloudflare bị chặn vĩnh viễn', 'Không có gì'], ans: 1, why: 'Cần set_real_ip_from và real_ip_header CF-Connecting-IP (chỉ khi cổng web chỉ nhận từ Cloudflare).' },
  { q: 'Hardening index của lynis là 62. Cách hiểu đúng?', opts: ['Phải đạt 100 mới an toàn', 'Là gợi ý để đọc từng Suggestion và quyết định áp dụng; điểm chỉ là chỉ báo tương đối', 'Điểm càng thấp càng tốt', 'Chỉ áp dụng cho Windows'], ans: 1, why: 'Mục tiêu là hiểu và cải thiện có chủ đích, không săn điểm.' },
  { q: 'Bạn tìm thấy file `/tmp/.x/rootshell` có bit SUID (mode 4755) chủ root. Việc làm đúng?', opts: ['Bỏ qua vì ở /tmp', 'Ghi lại bằng chứng, nghi ngờ xâm nhập, xoá file, tìm đường vào và xoay bí mật', 'Chạy thử nó', 'Đổi tên'], ans: 1, why: 'SUID root ngoài /usr là cửa hậu điển hình. Xử lý như sự cố bảo mật chứ không chỉ xoá file.' },
  { q: 'Trong access.log, IP A gửi 40 request 404 vào /wp-login.php, IP B nhận 200 cho /.env. IP nào đáng lo hơn?', opts: ['A vì nhiều request', 'B vì đã lấy được nội dung file bí mật', 'Như nhau', 'Không IP nào'], ans: 1, why: '404 nghĩa là không có gì để lấy. 200 ở đường dẫn nhạy cảm nghĩa là bí mật đã lộ: cần xoay.' },
  { q: 'Cron chạy `/home/u/bin/alert.sh` nhưng syslog có `Permission denied`. Nguyên nhân khả dĩ nhất?', opts: ['Sai múi giờ', 'Script chưa có quyền thực thi (thiếu chmod +x)', 'Cron bị tắt', 'Sai DNS'], ans: 1, why: 'Cron thực thi trực tiếp file; không có bit x thì bị từ chối. Chạy thử `bash script` sẽ không lộ lỗi này, nên cần kiểm tra cả hai.' },
  { q: 'Trong crontab, vì sao nên dùng đường dẫn tuyệt đối?', opts: ['Cho đẹp', 'Cron có môi trường tối giản (PATH ngắn, không có ~ như shell đăng nhập)', 'Bắt buộc bởi luật', 'Để chạy nhanh'], ans: 1, why: 'Lệnh chạy tốt trong terminal có thể không tìm thấy gì trong cron nếu dùng tên tương đối.' },
  { q: 'Backup `/etc/nginx` nằm cùng ổ đĩa VPS và chưa bao giờ thử khôi phục. Đánh giá?', opts: ['Đủ an toàn', 'Chưa đủ: mất ổ đĩa là mất cả hai, và chưa chắc dùng được', 'Tốt hơn không backup một chút', 'Không cần'], ans: 1, why: '3-2-1 và thử khôi phục định kỳ. Backup chưa thử khôi phục thì chưa phải backup.' },
  { q: 'File `.env.production` của Next.js có `NEXT_PUBLIC_API_SECRET=abc`. Vấn đề?', opts: ['Không có', 'Biến NEXT_PUBLIC_ được nhúng vào JS gửi tới mọi trình duyệt, nên "secret" đã công khai', 'Tên quá dài', 'Next.js không đọc file này'], ans: 1, why: 'Chỉ đặt giá trị công khai ở NEXT_PUBLIC_. Đổi tên bỏ tiền tố và xoay giá trị.' },
  { q: '`app.enableCors({ origin: "*" })` trên API có cookie đăng nhập. Rủi ro?', opts: ['Không có', 'Mọi website có thể gọi API từ trình duyệt người dùng; nên chỉ cho đúng origin của bạn', 'API chạy chậm', 'Lỗi build'], ans: 1, why: 'CORS rộng làm tăng bề mặt tấn công. Dùng danh sách origin cụ thể.' }
];

Cc.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); sites(s, APP_BAD, API_BAD); appCode(s); },
  items: [
    { text: 'Xem header phản hồi của site `app.haiphan.org` (thấy `Server: nginx/1.24.0`).', hint: 'curl -sI -H "Host: app.haiphan.org" http://127.0.0.1', check: R(/^curl -sI .*app\.haiphan/) },
    { text: 'Tạo `/etc/nginx/conf.d/security.conf`: ẩn phiên bản, 3 header bảo mật và khai báo vùng `limit_req_zone` tên `login`.', hint: H('/etc/nginx/conf.d/security.conf', SEC_CONF), check: function (s) { var t = txt(s, '/etc/nginx/conf.d/security.conf'); return /server_tokens off/.test(t) && /zone=login/.test(t); } },
    { text: 'Kiểm tra cấu hình rồi reload Nginx.', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var l = s.W.nginx.live; return !!l && !!l.http && l.http.tokens === false; } },
    { text: 'Xem lại header: không còn số phiên bản và có X-Frame-Options.', hint: 'curl -sI -H "Host: app.haiphan.org" http://127.0.0.1', check: function (s) { var p = probe(s, 'app.haiphan.org', '/'); return cnt(s, /^curl -sI .*app\.haiphan/) >= 2 && p.headers.server === 'nginx' && p.headers['x-frame-options'] === 'SAMEORIGIN'; } },
    { text: 'Thử đọc `/.env` qua web: file bí mật đang bị lộ (HTTP 200).', hint: 'curl -s -H "Host: app.haiphan.org" http://127.0.0.1/.env', check: R(/^curl -s .*\.env/) },
    { text: 'Chặn dotfile: ghi lại site `app.haiphan.org` có `location ~ /\\.(?!well-known) { return 404; }`.', hint: H('/etc/nginx/sites-available/app.haiphan.org', APP_OK), check: function (s) { return /location ~ \/\\\.\(\?!well-known\)/.test(txt(s, '/etc/nginx/sites-available/app.haiphan.org')); } },
    { text: 'Reload để áp dụng; `/.env` phải trả 404 còn trang chủ vẫn 200.', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return probe(s, 'app.haiphan.org', '/.env').status === 404 && probe(s, 'app.haiphan.org', '/').status === 200; } },
    { text: 'Kiểm tra `/.git/config` cũng bị chặn, chỉ in mã trạng thái.', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: app.haiphan.org" http://127.0.0.1/.git/config', check: R(/^curl .*\.git\/config/) },
    { text: 'Giới hạn đăng nhập API: ghi lại site `api-tutor.haiphan.org` có `limit_req zone=login burst=2 nodelay` cho `/auth/login`, trả 429.', hint: H('/etc/nginx/sites-available/api-tutor.haiphan.org', API_OK), check: function (s) { return /limit_req zone=login burst=2/.test(txt(s, '/etc/nginx/sites-available/api-tutor.haiphan.org')); } },
    { text: 'Kiểm tra và reload để giới hạn có hiệu lực.', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var l = s.W.nginx.live; return !!l && l.servers.some(function (sv) { return sv.locs.some(function (lc) { return lc.stmts.some(function (t) { return t.name === 'limit_req'; }); }); }); } },
    { text: 'Mô phỏng dò mật khẩu: gọi `/auth/login` 5 lần liên tiếp, xem mã trả về (mong đợi 200 200 200 429 429).', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: api-tutor.haiphan.org" http://127.0.0.1/auth/login ; curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: api-tutor.haiphan.org" http://127.0.0.1/auth/login ; curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: api-tutor.haiphan.org" http://127.0.0.1/auth/login ; curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: api-tutor.haiphan.org" http://127.0.0.1/auth/login ; curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: api-tutor.haiphan.org" http://127.0.0.1/auth/login', check: function (s) { return cnt(s, /^curl .*auth\/login/) >= 5; } },
    { text: 'Chờ hết cửa sổ giới hạn rồi thử lại: lần này phải được 200.', hint: 'sleep 60 && curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: api-tutor.haiphan.org" http://127.0.0.1/auth/login', check: function (s) { return cnt(s, /^curl .*auth\/login/) >= 6; } },
    { text: 'Chạy lynis để lấy điểm và danh sách gợi ý ban đầu.', hint: 'sudo lynis audit system', check: R(/^sudo lynis audit system/) },
    { text: 'Tìm file SUID bên ngoài `/usr` (rà soát cửa hậu).', hint: 'sudo find / -xdev -perm -4000 -type f', check: R(/^sudo find \/ .*-perm -4000/) },
    { text: 'Phát hiện `/tmp/.x/rootshell` (SUID lạ): xem chủ sở hữu rồi xoá cả thư mục `/tmp/.x`.', hint: 'ls -la /tmp/.x && sudo rm -rf /tmp/.x', check: function (s) { return !s.fs.ex('/tmp/.x') && ran(s, /^sudo rm -rf \/tmp\/\.x/); } },
    { text: 'Cài toàn bộ bản vá bảo mật còn thiếu.', hint: 'sudo apt upgrade -y', check: function (s) { return S(s).upg.length === 0; } },
    { text: 'Cài `unattended-upgrades` để vá tự động.', hint: 'sudo apt install -y unattended-upgrades', check: function (s) { return S(s).unattended; } },
    { text: 'Chạy lynis lần 2: chỉ số phải từ 65 trở lên.', hint: 'sudo lynis audit system', check: function (s) { return cnt(s, /^sudo lynis audit system/) >= 2 && V.sec.lynis(s).score >= 65; } },
    { text: 'IP bị ufw chặn nhiều nhất? Gom `SRC=` trong ufw.log bằng `grep -o`, `sort | uniq -c | sort -rn | head -3`.', hint: 'sudo grep "UFW BLOCK" /var/log/ufw.log | grep -oE "SRC=[0-9.]+" | sort | uniq -c | sort -rn | head -3', check: R(/^sudo grep .*UFW BLOCK/) },
    { text: 'Đường dẫn bị quét nhiều nhất trong access.log (cột thứ 7) bằng `awk`.', hint: "sudo awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5", check: R(/^sudo awk .*\$7/) },
    { text: 'Đếm số request trả 404.', hint: "sudo grep -c '\" 404 ' /var/log/nginx/access.log", check: R(/^sudo grep -c .*404/) },
    { text: 'Bật jail `nginx-botsearch` cho fail2ban bằng cách thêm vào `jail.local`.', hint: 'echo -e "[nginx-botsearch]\\nenabled = true" | sudo tee -a /etc/fail2ban/jail.local', check: function (s) { return /\[nginx-botsearch\][\s\S]*enabled\s*=\s*true/.test(txt(s, '/etc/fail2ban/jail.local')); } },
    { text: 'Tạo thư mục `~/bin` cho script cảnh báo.', hint: 'mkdir -p ~/bin', check: function (s) { return s.fs.isD(s.home + '/bin'); } },
    { text: 'Viết script `~/bin/disk-alert.sh` gửi tin Telegram bằng curl (dùng heredoc).', hint: "tee ~/bin/disk-alert.sh > /dev/null <<'EOF'\n#!/bin/bash\ncurl -s -X POST \"https://api.telegram.org/bot123456:ABC/sendMessage\" -d \"chat_id=998877\" -d \"text=VPS tutor: canh bao dia\"\nEOF", check: function (s) { return /api\.telegram\.org/.test(txt(s, s.home + '/bin/disk-alert.sh')); } },
    { text: 'Cấp quyền thực thi cho script.', hint: 'chmod +x ~/bin/disk-alert.sh', check: function (s) { var n = s.fs.get(s.home + '/bin/disk-alert.sh'); return !!n && (n.mode & 64) === 64; } },
    { text: 'Chạy thử script bằng tay để xác nhận tin được gửi.', hint: 'bash ~/bin/disk-alert.sh', check: function (s) { return !!s.W.hookLog && s.W.hookLog.length > 0; } },
    { text: 'Lập lịch chạy mỗi 10 phút bằng đường dẫn TUYỆT ĐỐI: ghi `~/mycron` rồi `crontab ~/mycron`.', hint: 'echo "*/10 * * * * /home/haidangphan/bin/disk-alert.sh" > ~/mycron && crontab ~/mycron', check: function (s) { return (S(s).cron.haidangphan || []).some(function (l) { return /^\*\/10 \* \* \* \* \/home\/haidangphan\/bin\/disk-alert\.sh/.test(l); }); } },
    { text: 'Tạo thư mục `~/backups`.', hint: 'mkdir -p ~/backups', check: function (s) { return s.fs.isD(s.home + '/backups'); } },
    { text: 'Sao lưu cấu hình hệ thống: `tar czf` cho `/etc/nginx /etc/ssh /etc/fail2ban`.', hint: 'sudo tar czf ~/backups/etc-config.tgz /etc/nginx /etc/ssh /etc/fail2ban', check: function (s) { return s.fs.isF(s.home + '/backups/etc-config.tgz'); } },
    { text: 'Xem bên trong bản backup (5 dòng đầu) mà không giải nén.', hint: 'tar tzf ~/backups/etc-config.tgz | head -5', check: R(/^tar tzf/) },
    { text: 'Liệt kê thư mục backup kèm dung lượng.', hint: 'ls -lh ~/backups', check: R(/^ls -lh .*backups/) },
    { text: 'Tìm bí mật viết cứng trong mã API (`grep -rnE`).', hint: 'grep -rnE "(password|secret)" ~/tutor/api/src', check: R(/^grep -rnE .*password/) },
    { text: 'Thay JWT secret viết cứng bằng `process.env.JWT_SECRET`.', hint: "sed -i \"s/secret: 'supersecret123'/secret: process.env.JWT_SECRET/\" ~/tutor/api/src/auth.module.ts", check: function (s) { var t = txt(s, s.home + '/tutor/api/src/auth.module.ts'); return /process\.env\.JWT_SECRET/.test(t) && !/supersecret123/.test(t); } },
    { text: 'Thay mật khẩu DB viết cứng bằng `process.env.DB_PASSWORD`.', hint: "sed -i \"s/password: 'Ab12cd34ef56'/password: process.env.DB_PASSWORD/\" ~/tutor/api/src/app.module.ts", check: function (s) { var t = txt(s, s.home + '/tutor/api/src/app.module.ts'); return /process\.env\.DB_PASSWORD/.test(t) && !/Ab12cd34ef56/.test(t); } },
    { text: 'Thêm `helmet` vào `main.ts`: import ở đầu và `app.use(helmet())` trước `listen`.', hint: "sed -i \"s#^import { NestFactory } from '@nestjs/core';#import helmet from 'helmet';\\nimport { NestFactory } from '@nestjs/core';#\" ~/tutor/api/src/main.ts && sed -i 's/^  await app.listen/  app.use(helmet());\\n  await app.listen/' ~/tutor/api/src/main.ts", check: function (s) { var t = txt(s, s.home + '/tutor/api/src/main.ts'); return /import helmet/.test(t) && /app\.use\(helmet\(\)\)/.test(t); } },
    { text: 'Ngăn commit file bí mật: thêm `.env*` vào `.gitignore` của API.', hint: 'echo ".env*" >> ~/tutor/api/.gitignore', check: function (s) { return /^\.env\*/m.test(txt(s, s.home + '/tutor/api/.gitignore')); } },
    { text: 'Next.js: tìm biến bí mật bị đặt nhầm `NEXT_PUBLIC_` trong `.env.production`.', hint: 'grep -n NEXT_PUBLIC ~/tutor/ui/.env.production', check: R(/^grep -n NEXT_PUBLIC/) },
    { text: 'Đổi `NEXT_PUBLIC_API_SECRET` thành `API_SECRET` (chỉ phía server).', hint: "sed -i 's/^NEXT_PUBLIC_API_SECRET=/API_SECRET=/' ~/tutor/ui/.env.production", check: function (s) { var t = txt(s, s.home + '/tutor/ui/.env.production'); return /^API_SECRET=/m.test(t) && !/NEXT_PUBLIC_API_SECRET/.test(t); } }
  ]
};

Cc.debugs = [
  {
    id: 'c2d16', title: 'Bot tải được /.env và /.git/config qua website',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: app.haiphan.org" http://127.0.0.1/.env', '200', '$ curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: app.haiphan.org" http://127.0.0.1/.git/config', '200'),
    story: 'Site tĩnh `app.haiphan.org` phục vụ thư mục /var/www/app. Quy trình deploy copy cả repo (có `.git` và `.env`) vào đó. Bí mật đã phải xoay (xử lý riêng). Việc cần làm bây giờ: dù deploy còn sai, Nginx KHÔNG được phép phục vụ dotfile.',
    goal: '`/.env` và `/.git/config` trả 404 qua Nginx, trang chủ `/` vẫn trả 200.',
    hints: ['Xác nhận lỗi bằng curl -w. Xem file site: `cat /etc/nginx/sites-available/app.haiphan.org`: chỉ có `location /`.', 'Thêm location regex bắt mọi đường dẫn bắt đầu bằng dấu chấm, trả 404; nhớ chừa `/.well-known` cho certbot.', 'Ghi lại file site có `location ~ /\\.(?!well-known) { return 404; }`, rồi `sudo nginx -t && sudo systemctl reload nginx`, kiểm tra lại cả ba đường dẫn.'],
    fix: ['cat /etc/nginx/sites-available/app.haiphan.org', H('/etc/nginx/sites-available/app.haiphan.org', APP_OK), 'sudo nginx -t && sudo systemctl reload nginx', 'curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: app.haiphan.org" http://127.0.0.1/.env'],
    cause: 'Nginx phục vụ mọi file nằm dưới root. Khoá dotfile bằng location regex là lớp phòng thủ thứ hai; lớp thứ nhất là không bao giờ để `.env`/`.git` trong thư mục web (deploy chỉ copy thư mục build). Bí mật đã có thể bị tải trước đó nên vẫn phải xoay.',
    setup: function (s) { base(s); sites(s, APP_BAD, API_BAD); },
    check: function (s) { return probe(s, 'app.haiphan.org', '/.env').status === 404 && probe(s, 'app.haiphan.org', '/.git/config').status === 404 && probe(s, 'app.haiphan.org', '/').status === 200; }
  },
  {
    id: 'c2d17', title: 'Hàng trăm lượt đăng nhập sai mỗi phút vào /auth/login',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo awk \'{print $7}\' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -2', '  412 /auth/login', '    9 /', '', 'API: CPU 85%, mật khẩu người dùng bị thử liên tục'),
    story: 'Kẻ tấn công thử mật khẩu hàng loạt vào endpoint đăng nhập của API. Chưa có giới hạn tốc độ nào. Hãy giới hạn ngay ở Nginx: 5 request/phút cho mỗi IP, burst 2, trả 429.',
    goal: 'Nginx đang chạy với `limit_req` cho `/auth/login` dùng một zone đã khai báo, và site API vẫn hoạt động.',
    hints: ['Cần hai phần: khai báo `limit_req_zone` ở cấp http (file mới trong `conf.d`) và dùng `limit_req` trong location `/auth/login`.', 'Zone phải tồn tại trước khi site dùng, nếu không `nginx -t` báo `zero size shared memory zone`.', 'Tạo `conf.d/ratelimit.conf` với `limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;`, ghi lại site API với location /auth/login có `limit_req zone=login burst=2 nodelay;`, rồi `nginx -t` và reload.'],
    fix: [H('/etc/nginx/conf.d/ratelimit.conf', ['limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;']), H('/etc/nginx/sites-available/api-tutor.haiphan.org', API_OK), 'sudo nginx -t && sudo systemctl reload nginx'],
    cause: 'limit_req_zone (cấp http) định nghĩa khoá và tốc độ; limit_req (cấp location) áp dụng. Với endpoint đăng nhập nên kết hợp thêm giới hạn ở ứng dụng (@nestjs/throttler) và, nếu sau Cloudflare, phải khôi phục IP thật. Khóa khoá tài khoản sau nhiều lần sai cũng nên có.',
    setup: function (s) { base(s); sites(s, APP_OK, API_BAD); },
    check: function (s) {
      var l = s.W.nginx.live; if (!l || !s.W.nginx.active || !l.http) return false;
      var ok = l.servers.some(function (sv) { return sv.names.indexOf('api-tutor.haiphan.org') >= 0 && sv.locs.some(function (lc) { return lc.path === '/auth/login' && lc.stmts.some(function (t) { var z = (/zone=(\w+)/.exec(t.args.join(' ')) || [])[1]; return t.name === 'limit_req' && !!z && !!l.http.zones[z]; }); }); });
      return ok && probe(s, 'api-tutor.haiphan.org', '/').status === 200;
    }
  },
  {
    id: 'c2d18', title: 'Script cảnh báo Telegram không bao giờ gửi tin',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ crontab -l', '*/10 * * * * /home/haidangphan/bin/disk-alert.sh', '', '$ grep CRON /var/log/syslog | tail -1', 'CRON[7120]: (CRON) info (No MTA installed, discarding output)', '/bin/sh: 1: /home/haidangphan/bin/disk-alert.sh: Permission denied'),
    story: 'Bạn đã viết script gửi Telegram và đặt cron từ tuần trước, nhưng chưa nhận được tin nào, dù đĩa đã đầy 85%. Cron có vẻ vẫn chạy mỗi 10 phút.',
    goal: 'Script có quyền thực thi, cron vẫn còn, và bạn đã chạy thử thành công một lần để xác nhận tin Telegram được gửi.',
    hints: ['Lỗi nằm trong log của cron: `Permission denied`. Xem `ls -l ~/bin/disk-alert.sh`.', 'File không có bit thực thi (mode 644). Cron gọi trực tiếp file nên bị từ chối.', '`chmod +x ~/bin/disk-alert.sh`, rồi chạy thử bằng `bash ~/bin/disk-alert.sh` để chắc chắn tin được gửi.'],
    fix: ['grep CRON /var/log/syslog | tail -2', 'ls -l ~/bin/disk-alert.sh', 'chmod +x ~/bin/disk-alert.sh', 'bash ~/bin/disk-alert.sh'],
    cause: 'Cron thực thi file trực tiếp nên cần bit x; việc chạy tay bằng `bash file` không đòi bit x nên có thể che lỗi này. Hãy thử đúng cách cron gọi, dùng đường dẫn tuyệt đối, và đặt thêm cảnh báo cho chính việc cảnh báo (heartbeat).',
    setup: function (s) {
      base(s);
      s.fs.mkdirp(s.home + '/bin', s.user);
      s.fs.put(s.home + '/bin/disk-alert.sh', '#!/bin/bash\ncurl -s -X POST "https://api.telegram.org/bot123456:ABC/sendMessage" -d "chat_id=998877" -d "text=VPS tutor: canh bao dia"\n', { owner: s.user, mode: M('644') });
      S(s).cron.haidangphan = ['*/10 * * * * /home/haidangphan/bin/disk-alert.sh'];
      s.fs.put('/var/log/syslog', 'Oct 27 10:10:01 vps CRON[7120]: (haidangphan) CMD (/home/haidangphan/bin/disk-alert.sh)\nOct 27 10:10:01 vps CRON[7119]: (CRON) info (No MTA installed, discarding output)\nOct 27 10:10:01 vps CRON[7120]: /bin/sh: 1: /home/haidangphan/bin/disk-alert.sh: Permission denied\n', { owner: 'root', mode: M('640') });
    },
    check: function (s) { var n = s.fs.get(s.home + '/bin/disk-alert.sh'); return !!n && (n.mode & 64) === 64 && (S(s).cron.haidangphan || []).length > 0 && !!s.W.hookLog && s.W.hookLog.length > 0; }
  },
  {
    id: 'c2d19', hard: true, title: 'Sự cố tổng hợp: kết quả quét bên ngoài vẫn báo năm lỗi (không gợi ý sẵn)',
    host: 'vps', user: 'haidangphan',
    symptom: L('Báo cáo quét web (app.haiphan.org và api-tutor.haiphan.org):', '[ĐỎ] /.env tải được (200)', '[ĐỎ] /.git/config tải được (200)', '[VÀNG] Header Server lộ phiên bản nginx/1.24.0 (Ubuntu)', '[VÀNG] Thiếu Strict-Transport-Security', '[ĐỎ] /auth/login không giới hạn tốc độ'),
    story: 'Có năm phát hiện từ một lần quét ngoài. Bạn chỉ có báo cáo, không có gợi ý nào về cách sửa. Hãy kiểm chứng từng mục bằng `curl`, sửa tận gốc ở cấu hình Nginx, và xác nhận lại bằng curl sau mỗi thay đổi.',
    goal: 'Cả năm mục hết đỏ/vàng: dotfile 404, Server chỉ còn "nginx", có HSTS, và `/auth/login` có `limit_req` hợp lệ; site vẫn hoạt động.',
    hints: ['Dùng `curl -sI` và `curl -w "%{http_code}"` để tự tái hiện từng mục trước khi sửa. Cấp http (file trong `conf.d`) áp dụng cho mọi site cùng lúc.', 'Hai file cấu hình: `conf.d/security.conf` (server_tokens, HSTS, `limit_req_zone`) và hai file site (khối dotfile cho app, `limit_req` cho API). Zone phải được khai báo trước khi dùng.', 'Sau khi ghi các file, `sudo nginx -t && sudo systemctl reload nginx`, rồi chạy lại curl để chắc chắn từng mục đã xanh.'],
    fix: ['curl -sI -H "Host: app.haiphan.org" http://127.0.0.1', H('/etc/nginx/conf.d/security.conf', SEC_CONF), H('/etc/nginx/sites-available/app.haiphan.org', APP_OK), H('/etc/nginx/sites-available/api-tutor.haiphan.org', API_OK), 'sudo nginx -t && sudo systemctl reload nginx', 'curl -sI -H "Host: app.haiphan.org" http://127.0.0.1'],
    cause: 'Năm phát hiện đến từ ba chỗ: root web chứa dotfile (cần location chặn), thiếu cấu hình cấp http (ẩn phiên bản, HSTS) và thiếu giới hạn tốc độ cho đăng nhập. Sửa theo từng lớp rồi xác nhận lại từ góc nhìn của kẻ quét bằng curl là quy trình chuẩn; đừng tin chỉ vào file cấu hình.',
    setup: function (s) { base(s); sites(s, APP_BAD, API_BAD); },
    check: function (s) {
      var l = s.W.nginx.live; if (!l || !s.W.nginx.active || !l.http) return false;
      var p = probe(s, 'app.haiphan.org', '/'), lim = l.servers.some(function (sv) { return sv.locs.some(function (lc) { return lc.path === '/auth/login' && lc.stmts.some(function (t) { var z = (/zone=(\w+)/.exec(t.args.join(' ')) || [])[1]; return t.name === 'limit_req' && !!z && !!l.http.zones[z]; }); }); });
      return probe(s, 'app.haiphan.org', '/.env').status === 404 && probe(s, 'app.haiphan.org', '/.git/config').status === 404 && p.status === 200 && p.headers.server === 'nginx' && !!p.headers['strict-transport-security'] && lim;
    }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
