(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, IP = V.IP;

C.lesson({
  id: 'c4', group: 'Web server', short: 'DNS, SSL, Cloudflare',
  title: 'DNS, chứng chỉ SSL và Cloudflare',
  dek: 'Trỏ tên miền haiphan.org về VPS, cấp chứng chỉ Let\'s Encrypt và gỡ lỗi 525, 526, vòng lặp chuyển hướng.',
  theory: [
    { tag: 'Khái niệm', title: 'Bản ghi A và đám mây cam/xám', body: [
      'Bản ghi **A** gắn tên với IP: `tutor.haiphan.org` -> `116.118.9.210`. Trên Cloudflare mỗi bản ghi có hai chế độ:',
      { tbl: [['Chế độ', 'Biểu tượng', 'Người dùng kết nối tới', '`dig` trả về'], ['DNS only', 'đám mây xám', 'thẳng IP VPS', '116.118.9.210'], ['Proxied', 'đám mây cam', 'Cloudflare, rồi Cloudflare gọi VPS', 'IP của Cloudflare (104.x, 172.67.x)']] },
      { pre: ['dig +short tutor.haiphan.org', 'curl -I https://tutor.haiphan.org'] },
      { note: 'Khi đang proxied, `dig` không trả IP VPS: đó là bình thường, không phải lỗi. Muốn kiểm tra IP gốc, tạm chuyển bản ghi sang xám.', kind: 'tip' }
    ] },
    { tag: 'Cú pháp', title: 'Cấp chứng chỉ Let\'s Encrypt bằng certbot', body: [
      'Điều kiện: DNS đã trỏ đúng, Nginx đang phục vụ domain ở cổng **80** (HTTP) với `server_name` đúng, cổng 80/443 mở.',
      { pre: ['sudo certbot --nginx -d tutor.haiphan.org', 'sudo certbot certificates', 'sudo certbot renew --dry-run'], cap: 'Cấp, xem danh sách, thử gia hạn' },
      { ul: ['Chứng chỉ có hạn 90 ngày; certbot cài sẵn bộ hẹn giờ (`systemctl list-timers | grep certbot`) tự gia hạn', 'certbot sẽ viết lại file site thêm khối 443 và chuyển hướng HTTP sang HTTPS', 'Không tìm thấy server block: kiểm tra `server_name` trong file site'] }
    ] },
    { tag: 'Lưu ý', title: 'Thứ tự: đừng trỏ vào chứng chỉ chưa tồn tại', body: [
      'Nếu bạn viết sẵn block `listen 443 ssl` với đường dẫn `/etc/letsencrypt/live/<domain>/fullchain.pem` **trước khi** chứng chỉ được cấp, `nginx -t` báo `cannot load certificate` và certbot (plugin nginx) cũng không chạy nổi vì cấu hình đang lỗi.',
      { ul: ['**Cách A:** viết file site chỉ có block 80, `reload`, chạy `certbot --nginx`', '**Cách B:** `certbot certonly --dns-cloudflare` xác thực bằng bản ghi TXT, **không cần Nginx** và cổng 80, cấp được cả wildcard'] },
      { pre: ['sudo certbot certonly --dns-cloudflare \\', '  --dns-cloudflare-credentials /root/.cloudflare.ini \\', '  -d api-tutor.haiphan.org'], cap: 'Cách B' },
      { note: 'File credentials chứa API token Cloudflare: `chmod 600`, chỉ cấp quyền "Edit zone DNS" cho đúng một zone, không commit lên Git.', kind: 'warn' }
    ] },
    { tag: 'Bảng tra', title: 'Chế độ SSL của Cloudflare', body: [
      { tbl: [['Chế độ', 'Cloudflare gọi origin bằng', 'Đánh giá'], ['Flexible', 'HTTP cổng 80', 'Dễ gây vòng lặp chuyển hướng nếu Nginx ép HTTPS'], ['Full', 'HTTPS cổng 443, chấp nhận chứng chỉ bất kỳ', 'Tạm được'], ['Full (strict)', 'HTTPS cổng 443, chứng chỉ phải hợp lệ', '**Khuyên dùng**']] },
      'Flexible cộng với Nginx `return 301 https://...` tạo vòng lặp: người dùng vào HTTPS, Cloudflare gọi origin bằng HTTP, Nginx chuyển hướng sang HTTPS, lặp mãi. Trình duyệt báo `ERR_TOO_MANY_REDIRECTS`.'
    ] },
    { tag: 'Bảng tra', title: 'Lỗi thường gặp với domain Cloudflare', body: [
      { tbl: [['Hiện tượng', 'Nguyên nhân', 'Kiểm tra'], ['ERR_TOO_MANY_REDIRECTS', 'SSL mode Flexible', 'Đổi sang Full (strict)'], ['525', 'Origin chưa có HTTPS cổng 443', '`sudo ss -tlnp | grep 443`'], ['526', 'Chứng chỉ origin sai domain hoặc hết hạn', '`sudo certbot certificates`'], ['DNS_PROBE_FINISHED_NXDOMAIN', 'Chưa có bản ghi hoặc gõ sai tên', '`dig +short tên`'], ['Certbot lỗi khi cấp', 'Cổng 80 bị chặn hoặc sai server_name', '`curl -I http://domain`']] },
      'Lưu ý: Cloudflare Dashboard là giao diện web. Trong bài thực hành, lệnh `cfctl ssl-mode` chỉ là **lệnh giả lập** thay cho thao tác bấm chọn trong SSL/TLS, để bạn tập chẩn đoán.'
    ] }
  ],
  quiz: [
    { q: '`dig +short tutor.haiphan.org` trả về 104.21.55.187 và 172.67.172.34 chứ không phải 116.118.9.210. Điều gì đang xảy ra?', opts: ['VPS bị hack', 'Bản ghi đang bật proxy Cloudflare (đám mây cam)', 'DNS bị lỗi', 'Certbot hết hạn'], ans: 1, why: 'Proxied thì DNS trả IP của Cloudflare. Muốn xem IP gốc, tạm chuyển sang DNS only.' },
    { q: 'Trình duyệt báo ERR_TOO_MANY_REDIRECTS. Cloudflare đang ở Flexible, Nginx có `return 301 https://$host$request_uri`. Cách sửa đúng?', opts: ['Tắt Nginx', 'Chuyển SSL/TLS sang Full (strict) với chứng chỉ hợp lệ trên origin', 'Xoá bản ghi DNS', 'Cấp lại chứng chỉ'], ans: 1, why: 'Ở Flexible, Cloudflare gọi origin bằng HTTP nên Nginx chuyển hướng lặp mãi. Full (strict) gọi bằng HTTPS.' },
    { q: 'File site có block 443 trỏ tới chứng chỉ chưa được cấp, `nginx -t` lỗi. Cách nào gỡ được mà không cần sửa Nginx trước?', opts: ['certbot --nginx', 'certbot certonly --dns-cloudflare (xác thực qua DNS, không cần Nginx)', 'Khởi động lại VPS', 'ufw allow 443'], ans: 1, why: 'Xác thực DNS-01 không đi qua Nginx, cấp xong chứng chỉ thì `nginx -t` tự hết lỗi.' }
  ],
  lab: {
    host: 'vps', user: 'haidangphan',
    setup: function (s) { C.vpsBase(s); C.apps(s); C.site(s, 'tutor.haiphan.org', C.SITE80); V.ngReload(s, false); },
    items: [
      { text: 'Hỏi DNS địa chỉ IP của `tutor.haiphan.org` (ngắn gọn bằng `+short`).', hint: 'dig +short tutor.haiphan.org', check: function (s) { return ran(s, /^dig .*tutor\.haiphan\.org/); } },
      { text: 'Gọi thử HTTP tới domain, chỉ lấy header.', hint: 'curl -I http://tutor.haiphan.org', check: function (s) { return ran(s, /^curl .*http:\/\/tutor\.haiphan\.org/); } },
      { text: 'Cấp chứng chỉ cho `tutor.haiphan.org` bằng certbot với plugin nginx.', hint: 'sudo certbot --nginx -d tutor.haiphan.org', check: function (s) { var n = s.fs.get('/etc/nginx/sites-available/tutor.haiphan.org'); return !!s.W.certs['tutor.haiphan.org'] && !!n && /443/.test(n.c); } },
      { text: 'Liệt kê các chứng chỉ đang có và ngày hết hạn.', hint: 'sudo certbot certificates', check: function (s) { return ran(s, /^sudo certbot certificates/); } },
      { text: 'Thử gia hạn giả lập để chắc việc tự gia hạn sẽ chạy.', hint: 'sudo certbot renew --dry-run', check: function (s) { return ran(s, /^sudo certbot renew --dry-run/); } },
      { text: 'Gọi thử HTTPS tới domain và xem header.', hint: 'curl -I https://tutor.haiphan.org', check: function (s) { return ran(s, /^curl .*https:\/\/tutor\.haiphan\.org/); } }
    ]
  },
  debugs: [
    {
      id: 'c4d1', title: 'nginx -t lỗi vì chứng chỉ chưa có',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ sudo nginx -t', 'nginx: [emerg] cannot load certificate "/etc/letsencrypt/live/api-tutor.haiphan.org/fullchain.pem": BIO_new_file() failed (SSL: error:80000002:system library::No such file or directory) in /etc/nginx/sites-enabled/api-tutor.haiphan.org:11', 'nginx: configuration file /etc/nginx/nginx.conf test failed'),
      story: 'Bạn viết sẵn file site cho api-tutor.haiphan.org gồm cả block 443 rồi mới tính cấp chứng chỉ. Bây giờ `certbot --nginx` cũng từ chối chạy vì Nginx đang lỗi cấu hình. Backend NestJS đã chạy ở 127.0.0.1:8888. Token Cloudflare đã có sẵn ở /root/.cloudflare.ini.',
      goal: '`nginx -t` thành công, nạp lại và `curl --resolve` HTTPS về 127.0.0.1 cho api-tutor.haiphan.org trả 200.',
      hints: ['Chứng chỉ chưa tồn tại: xem `sudo certbot certificates` hoặc `sudo ls /etc/letsencrypt/live/`.', 'Dùng cách xác thực DNS để không phụ thuộc Nginx: `certbot certonly --dns-cloudflare` với file credentials.', 'Lệnh: `sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.cloudflare.ini -d api-tutor.haiphan.org`, sau đó `sudo nginx -t && sudo systemctl reload nginx`.'],
      fix: ['sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.cloudflare.ini -d api-tutor.haiphan.org', 'sudo nginx -t && sudo systemctl reload nginx', 'curl -sSkI --resolve api-tutor.haiphan.org:443:127.0.0.1 https://api-tutor.haiphan.org'],
      cause: 'Nginx kiểm tra file chứng chỉ ngay khi nạp cấu hình. Vòng luẩn quẩn "cần Nginx chạy để cấp chứng chỉ, cần chứng chỉ để Nginx chạy" được phá bằng xác thực DNS-01. Cách còn lại: tạm viết file chỉ có block 80, cấp chứng chỉ bằng `certbot --nginx`, rồi mới có block 443.',
      setup: function (s) {
        C.vpsBase(s); C.apps(s);
        s.fs.put('/etc/letsencrypt/options-ssl-nginx.conf', 'ssl_session_timeout 1440m;\n', { owner: 'root' });
        s.fs.put('/etc/letsencrypt/ssl-dhparams.pem', 'DH\n', { owner: 'root' });
        s.fs.put('/root/.cloudflare.ini', 'dns_cloudflare_api_token = cf-token-demo\n', { owner: 'root', mode: M('600') });
        C.site(s, 'api-tutor.haiphan.org', L('server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    server_name api-tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/api-tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/api-tutor.haiphan.org/privkey.pem;', '    include /etc/letsencrypt/options-ssl-nginx.conf;', '', '    location / {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_set_header Host $host;', '    }', '}', '').join('\n'));
      },
      check: function (s) {
        if (V.ngLoad(s).errors.length || !s.W.certs['api-tutor.haiphan.org']) return false;
        var r = V.probe(s, 'https://api-tutor.haiphan.org', true);
        return r.status === 200;
      }
    },
    {
      id: 'c4d2', title: 'ERR_TOO_MANY_REDIRECTS khi mở tutor.haiphan.org',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ curl -sSI https://tutor.haiphan.org', 'HTTP/2 301', 'location: https://tutor.haiphan.org/', '', '$ curl -sSIL https://tutor.haiphan.org', 'curl: (47) Maximum (50) redirects followed'),
      story: 'Trang chạy ổn cho tới khi bạn bật proxy Cloudflare (đám mây cam) cho domain. Nginx đã có chứng chỉ và chuyển hướng HTTP sang HTTPS. Trình duyệt quay vòng rồi báo ERR_TOO_MANY_REDIRECTS.',
      goal: 'curl tới `https://tutor.haiphan.org` trả 200.',
      hints: ['Kiểm tra chế độ SSL hiện tại: `cfctl ssl-mode`.', 'Đang là `flexible`: Cloudflare gọi origin bằng HTTP cổng 80, Nginx lại chuyển hướng sang HTTPS, vòng lặp bất tận.', 'Đổi sang chế độ gọi origin bằng HTTPS: `cfctl ssl-mode full-strict` (ngoài đời: Cloudflare, SSL/TLS, Overview).'],
      fix: ['cfctl ssl-mode', 'cfctl ssl-mode full-strict', 'curl -sSI https://tutor.haiphan.org'],
      cause: 'Flexible mã hoá phía người dùng nhưng gọi origin bằng HTTP. Khi origin tự ép HTTPS thì tạo vòng lặp. Giải pháp: Full (strict), vì origin đã có chứng chỉ hợp lệ từ Let\'s Encrypt.',
      setup: function (s) {
        C.vpsBase(s); C.apps(s); C.certs(s, 'tutor.haiphan.org');
        s.W.dns['tutor.haiphan.org'] = { ip: IP, proxied: true }; s.W.cf.mode = 'flexible';
        C.site(s, 'tutor.haiphan.org', L('server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    server_name tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    include /etc/letsencrypt/options-ssl-nginx.conf;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '        proxy_set_header Host $host;', '    }', '}', '').join('\n'));
        V.ngReload(s, false);
      },
      check: function (s) { return V.probe(s, 'https://tutor.haiphan.org', false).status === 200; }
    }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
