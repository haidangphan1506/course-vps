(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, IP = V.IP;

function apps(s) {
  s.W.extra.push({ port: 3000, bind: '127.0.0.1', proc: 'node', pid: 5101 });
  s.W.extra.push({ port: 8888, bind: '127.0.0.1', proc: 'node', pid: 5102 });
}
function certs(s, d) {
  var f = s.fs;
  f.put('/etc/letsencrypt/live/' + d + '/fullchain.pem', 'CERT ' + d + '\n', { owner: 'root' });
  f.put('/etc/letsencrypt/live/' + d + '/privkey.pem', 'KEY\n', { owner: 'root', mode: M('600') });
  f.put('/etc/letsencrypt/options-ssl-nginx.conf', 'ssl_session_timeout 1440m;\n', { owner: 'root' });
  f.put('/etc/letsencrypt/ssl-dhparams.pem', 'DH\n', { owner: 'root' });
  s.W.certs[d] = true;
}
C.apps = apps; C.certs = certs;

var SITE80 = L('server {', '    listen 80;', '    listen [::]:80;', '    server_name tutor.haiphan.org;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '        proxy_http_version 1.1;', '        proxy_set_header Host $host;', '        proxy_set_header X-Real-IP $remote_addr;', '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', '        proxy_set_header X-Forwarded-Proto $scheme;', '    }', '}', '').join('\n');
C.SITE80 = SITE80;
var TEE = L("sudo tee /etc/nginx/sites-available/tutor.haiphan.org > /dev/null << 'EOF'", 'server {', '    listen 80;', '    listen [::]:80;', '    server_name tutor.haiphan.org;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '        proxy_http_version 1.1;', '        proxy_set_header Host $host;', '        proxy_set_header X-Real-IP $remote_addr;', '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', '        proxy_set_header X-Forwarded-Proto $scheme;', '    }', '}', 'EOF').join('\n');

C.lesson({
  id: 'c3', group: 'Web server', short: 'Nginx reverse proxy',
  title: 'Nginx làm reverse proxy cho tutor.haiphan.org',
  dek: 'Viết file site, bật bằng symlink, kiểm tra cú pháp, nạp lại và chẩn đoán Empty reply, lỗi cú pháp.',
  theory: [
    { tag: 'Khái niệm', title: 'Vì sao cần Nginx đứng trước ứng dụng', body: [
      'Ứng dụng Next.js (cổng 3000) và NestJS (cổng 8888) chỉ lắng nghe ở `127.0.0.1`. Nginx là cửa duy nhất mở ra Internet: nhận HTTPS ở 443, chọn ứng dụng theo tên miền rồi chuyển tiếp (`proxy_pass`).',
      { pre: ['Trình duyệt -> Cloudflare -> Nginx :443', '                          |-- tutor.haiphan.org     -> 127.0.0.1:3000 (Next.js)', '                          `-- api-tutor.haiphan.org -> 127.0.0.1:8888 (NestJS)'], cap: 'Kiến trúc của dự án tutor' },
      'Lợi ích: một IP phục vụ nhiều domain, SSL xử lý một chỗ, ứng dụng không phải mở cổng công khai.'
    ] },
    { tag: 'Khái niệm', title: 'sites-available và sites-enabled', body: [
      'Mỗi domain một file trong `/etc/nginx/sites-available/`. File chỉ có hiệu lực khi có **symlink** (lối tắt) trỏ tới nó trong `/etc/nginx/sites-enabled/`, đó là nơi Nginx đọc.',
      { pre: ['sudo ln -s /etc/nginx/sites-available/tutor.haiphan.org /etc/nginx/sites-enabled/', 'ls -l /etc/nginx/sites-enabled/        # thấy mũi tên -> là symlink'] },
      'Tắt một site: xoá symlink trong sites-enabled, giữ nguyên file gốc.'
    ] },
    { tag: 'Cú pháp', title: 'Ghi file cấu hình có quyền root bằng heredoc', body: [
      'Thư mục /etc chỉ root ghi được. Lệnh `sudo echo "..." > file` **không** hoạt động vì phần `> file` do shell của bạn thực hiện, không có sudo. Dùng `sudo tee` kèm heredoc:',
      { pre: ["sudo tee /etc/nginx/sites-available/tutor.haiphan.org > /dev/null << 'EOF'", 'server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '        proxy_set_header Host $host;', '    }', '}', 'EOF'], cap: 'Dán nguyên khối, gồm cả dòng EOF cuối' },
      { ul: ['`<< \'EOF\'` có dấu nháy đơn: shell **không** thay `$host` thành chuỗi rỗng', '`tee` ghi vào file và cũng in ra màn hình; `> /dev/null` bỏ phần in', '`proxy_set_header Host $host;` giữ tên miền gốc để ứng dụng biết đang phục vụ domain nào'] }
    ] },
    { tag: 'Cú pháp', title: 'Chu trình sửa an toàn: test, nạp lại, kiểm tra', body: [
      { pre: ['sudo nginx -t && sudo systemctl reload nginx', 'curl -I -H "Host: tutor.haiphan.org" http://127.0.0.1'], cap: 'Thử cú pháp, chỉ nạp lại khi thử thành công' },
      { ul: ['`&&` chỉ chạy lệnh sau khi lệnh trước thành công (mã thoát 0)', '`reload` nạp cấu hình mới **không** làm rớt kết nối đang chạy; `restart` thì có, và nếu file lỗi sẽ làm Nginx **tắt hẳn**', '`curl -H "Host: ..." http://127.0.0.1` thử từ chính VPS, tách lỗi của Nginx khỏi lỗi DNS và Cloudflare'] },
      { note: 'Nginx chạy theo cấu hình **đã nạp**. Sửa file và `nginx -t` OK vẫn chưa đổi gì cho tới khi `reload`.', kind: 'tip' }
    ] },
    { tag: 'Lưu ý', title: '`return 444` chỉ dành cho block chặn mặc định', body: [
      'Block `default_server` với `return 444;` đóng kết nối ngay khi ai đó truy cập bằng IP hay domain lạ. Nếu dán nhầm dòng này vào file site thật, domain của bạn sẽ chết: curl báo `Empty reply from server`, Cloudflare báo **520**.',
      { tbl: [['Mã Cloudflare', 'Nghĩa là gì', 'Thường do'], ['520', 'Origin trả lời bất thường hoặc đóng kết nối', '`return 444` nhầm chỗ, ứng dụng crash'], ['521', 'Origin từ chối kết nối', 'Nginx tắt, tường lửa chặn 80/443'], ['522', 'Hết thời gian kết nối', 'VPS treo, chặn IP Cloudflare'], ['525', 'Bắt tay SSL thất bại', 'Origin chưa có cổng 443/chứng chỉ'], ['526', 'Chứng chỉ origin không hợp lệ', 'Chứng chỉ hết hạn hoặc sai domain'], ['502', 'Nginx không gọi được ứng dụng', 'Sai cổng proxy_pass, ứng dụng chưa chạy']] }
    ] },
    { tag: 'Mẹo', title: 'Đọc lỗi nginx -t', body: [
      { tbl: [['Thông báo', 'Cách sửa'], ['unknown directive "proxy_pas"', 'Gõ sai tên lệnh, so lại với tài liệu'], ['directive "..." is not terminated by ";"', 'Thiếu dấu `;` ở cuối dòng trước dòng báo lỗi'], ['invalid number of arguments in "proxy_set_header"', 'Thường là dòng trước thiếu `;` làm hai lệnh dính nhau'], ['unexpected end of file, expecting "}"', 'Thiếu dấu `}` đóng block'], ['a duplicate default server for 0.0.0.0:80', 'Hai block cùng `default_server`']] },
      'Nginx dừng ở **lỗi đầu tiên** nên sửa xong một lỗi rồi chạy lại `nginx -t` để thấy lỗi kế tiếp.'
    ] }
  ],
  quiz: [
    { q: 'Bạn sửa file site, `sudo nginx -t` báo successful nhưng chưa reload. curl tới domain trả về gì?', opts: ['Kết quả của cấu hình mới', 'Kết quả của cấu hình cũ đã nạp trước đó', 'Lỗi 404', 'Nginx tự dừng'], ans: 1, why: 'nginx -t chỉ kiểm tra. Cấu hình chỉ đổi khi reload.' },
    { q: 'Trong file site của tutor.haiphan.org có dòng `return 444;` và không có proxy_pass. Triệu chứng nào đúng?', opts: ['curl báo Empty reply from server, Cloudflare báo 520', '502 Bad Gateway', '404 Not Found', 'Trang hiện bình thường'], ans: 0, why: '444 là mã riêng của Nginx: đóng kết nối không trả gì. Cloudflare coi đó là phản hồi bất thường (520).' },
    { q: 'Vì sao `sudo echo "server {}" > /etc/nginx/sites-available/x` báo Permission denied?', opts: ['sudo không dùng được với echo', 'Phần chuyển hướng `>` do shell của bạn (không có sudo) thực hiện', 'File x đã tồn tại', 'Nginx đang khoá file'], ans: 1, why: 'Shell mở file đích trước, bằng quyền của bạn. Dùng `echo ... | sudo tee file` hoặc heredoc với `sudo tee`.' }
  ],
  lab: {
    host: 'vps', user: 'haidangphan',
    setup: function (s) { C.vpsBase(s); apps(s); },
    items: [
      { text: 'Xem các site đang bật trong sites-enabled (dùng `ls -l` để thấy symlink).', hint: 'ls -l /etc/nginx/sites-enabled/', check: function (s) { return ran(s, /^ls -\w*l\w* \/etc\/nginx\/sites-enabled/); } },
      { text: 'Tạo file `/etc/nginx/sites-available/tutor.haiphan.org`: lắng nghe 80, `server_name tutor.haiphan.org`, proxy tới `http://127.0.0.1:3000` (dùng sudo tee và heredoc).', hint: TEE, check: function (s) { var n = s.fs.get('/etc/nginx/sites-available/tutor.haiphan.org'); return !!n && /server_name tutor\.haiphan\.org/.test(n.c) && /proxy_pass http:\/\/127\.0\.0\.1:3000/.test(n.c) && !/return 444/.test(n.c); } },
      { text: 'Bật site bằng symlink vào sites-enabled.', hint: 'sudo ln -s /etc/nginx/sites-available/tutor.haiphan.org /etc/nginx/sites-enabled/', check: function (s) { var n = s.fs.get('/etc/nginx/sites-enabled/tutor.haiphan.org', true); return !!n && n.t === 'l'; } },
      { text: 'Kiểm tra cú pháp cấu hình bằng nginx.', hint: 'sudo nginx -t', check: function (s) { return ran(s, /^sudo nginx -t/); } },
      { text: 'Nạp lại cấu hình (không làm rớt kết nối).', hint: 'sudo systemctl reload nginx', check: function (s) { var l = s.W.nginx.live; return !!l && l.servers.some(function (x) { return x.names.indexOf('tutor.haiphan.org') >= 0; }); } },
      { text: 'Từ chính VPS, gọi thử site qua cổng 80 với header Host đúng, chỉ lấy header (-I).', hint: 'curl -I -H "Host: tutor.haiphan.org" http://127.0.0.1', check: function (s) { return ran(s, /^curl .*tutor\.haiphan\.org.*127\.0\.0\.1/); } }
    ]
  },
  debugs: [
    {
      id: 'c3d1', title: 'Cloudflare 520 và Empty reply',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ curl -sSI https://tutor.haiphan.org', 'HTTP/2 520', 'server: cloudflare', '', '$ curl -sSkI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org', 'curl: (52) Empty reply from server'),
      story: 'Ứng dụng ở 127.0.0.1:3000 vẫn chạy tốt. Hôm qua bạn dán thêm vài khối cấu hình từ ghi chú vào file site của tutor. Chứng chỉ SSL đã có sẵn. Domain đang bật proxy Cloudflare (đám mây cam).',
      goal: 'Cả `curl` qua Cloudflare lẫn `curl --resolve` về 127.0.0.1 đều trả 200.',
      hints: ['Đọc file site đang bật: `cat /etc/nginx/sites-enabled/tutor.haiphan.org`. Block 443 có `proxy_pass` không?', 'Block 443 chỉ có `return 444;` (đoạn chặn mặc định bị dán nhầm) và không có `location /` với proxy_pass.', 'Thay dòng đó bằng location trỏ cổng 3000 (sed hoặc ghi lại file), rồi `sudo nginx -t && sudo systemctl reload nginx` và curl lại.'],
      fix: ['cat /etc/nginx/sites-enabled/tutor.haiphan.org', 'sudo sed -i \'s|return 444;|location / { proxy_pass http://127.0.0.1:3000; }|\' /etc/nginx/sites-available/tutor.haiphan.org', 'sudo nginx -t && sudo systemctl reload nginx', 'curl -sSkI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org'],
      cause: 'Dòng `return 444;` thuộc block `default_server` chặn truy cập lạ, chỉ được nằm ở đó. Khi nằm trong block của domain thật, Nginx đóng kết nối không trả nội dung, Cloudflare quy ra lỗi 520. Phương pháp tách lớp: thử ứng dụng (127.0.0.1:3000), rồi Nginx tại chỗ bằng `--resolve`, rồi mới tới domain qua Cloudflare.',
      setup: function (s) {
        C.vpsBase(s); apps(s); certs(s, 'tutor.haiphan.org');
        s.W.dns['tutor.haiphan.org'] = { ip: IP, proxied: true }; s.W.cf.mode = 'full-strict';
        C.site(s, 'tutor.haiphan.org', L('server {', '    listen 80;', '    listen [::]:80;', '    server_name tutor.haiphan.org;', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    listen [::]:443 ssl;', '    server_name tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    include /etc/letsencrypt/options-ssl-nginx.conf;', '', '    return 444;', '}', '').join('\n'));
        V.ngReload(s, false);
      },
      check: function (s) {
        var a = V.probe(s, 'https://tutor.haiphan.org', false), b = V.probe(s, 'https://tutor.haiphan.org', true);
        return a.status === 200 && b.status === 200;
      }
    },
    {
      id: 'c3d2', title: 'nginx -t báo lỗi liên tiếp, site API không lên',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ sudo nginx -t', 'nginx: [emerg] unknown directive "proxy_pas" in /etc/nginx/sites-enabled/api-tutor.haiphan.org:6', 'nginx: configuration file /etc/nginx/nginx.conf test failed'),
      story: 'Bạn vừa tạo file site cho api-tutor.haiphan.org và bật bằng symlink. Backend NestJS chạy ở 127.0.0.1:8888. Có nhiều hơn một lỗi trong file, mỗi lần chỉ lộ ra một lỗi.',
      goal: 'nginx -t thành công, nạp lại xong và `curl -H "Host: api-tutor.haiphan.org" http://127.0.0.1` trả 200.',
      hints: ['Mở file: `cat -n /etc/nginx/sites-enabled/api-tutor.haiphan.org`. Dòng 6 viết sai tên lệnh.', 'Sửa `proxy_pas` thành `proxy_pass`, chạy lại `sudo nginx -t`. Lỗi kế tiếp là `invalid number of arguments in "proxy_set_header"`: dòng `Host $host` thiếu dấu `;` ở cuối.', 'Sửa: `sudo sed -i \'s/Host $host$/Host $host;/\' file`, rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
      fix: ['sudo nginx -t', 'sudo sed -i \'s/proxy_pas /proxy_pass /\' /etc/nginx/sites-available/api-tutor.haiphan.org', 'sudo nginx -t', 'sudo sed -i \'s/Host $host$/Host $host;/\' /etc/nginx/sites-available/api-tutor.haiphan.org', 'sudo nginx -t && sudo systemctl reload nginx'],
      cause: 'Nginx dừng ở lỗi đầu tiên. Thiếu `;` không báo ngay ở dòng đó mà báo ở dòng sau (hai lệnh dính nhau thành một lệnh có quá nhiều tham số). Luôn đọc số dòng trong thông báo và nhìn cả dòng phía trên.',
      setup: function (s) {
        C.vpsBase(s); apps(s);
        C.site(s, 'api-tutor.haiphan.org', L('server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location / {', '        proxy_pas http://127.0.0.1:8888;', '        proxy_set_header Host $host', '        proxy_set_header X-Real-IP $remote_addr;', '    }', '}', '').join('\n'));
      },
      check: function (s) {
        var r = V.probe(s, 'http://api-tutor.haiphan.org', false);
        return r.status === 200 && !V.ngLoad(s).errors.length;
      }
    }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
