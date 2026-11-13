(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.NGE;
function R(re) { return function (s) { return ran(s, re); }; }
function RA(re) { return function (s) { return s.hist.some(function (h) { return re.test(h.cmd); }); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function SU(path, ls) { return 'sudo tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function live(s) { return s.W.nginx && s.W.nginx.active ? s.W.nginx.live : null; }
function liveSrv(s, name) { var l = live(s); return l ? l.servers.filter(function (x) { return x.names.indexOf(name) >= 0; })[0] : null; }
function liveLoc(s, name, path) { var sv = liveSrv(s, name); return sv ? sv.locs.filter(function (l) { return l.path === path; })[0] : null; }
function locDir(s, name, path, d) { var l = liveLoc(s, name, path); if (!l) return null; var f = l.stmts.filter(function (x) { return x.name === d; })[0]; return f ? f.args.join(' ') : null; }
function srvHas(s, d) { var sv = liveSrv(s, TUT); return !!sv && sv.stmts.some(function (x) { return x.name === d; }); }
function request(s, scheme, host, path, headers, meta) {
  var W = s.W, sv = W.ngx2req, sm = W.ngx2meta; W.ngx2req = headers || {}; W.ngx2meta = meta || null;
  try { return V.ngReq(s, scheme, host, scheme === 'https' ? 443 : 80, path); } catch (e) { return { kind: 'err' }; } finally { W.ngx2req = sv; W.ngx2meta = sm; }
}
function st(s, scheme, host, path, h, m) { var r = request(s, scheme, host, path, h, m); return r.kind === 'resp' ? r.status : (r.kind === 'empty' ? 0 : -1); }
function hasHdr(r, name, re) { return (r.adds || []).some(function (a) { return a.name.toLowerCase() === name.toLowerCase() && (!re || re.test(a.value)); }); }
function b64(x) { return typeof btoa === 'function' ? btoa(x) : Buffer.from(x).toString('base64'); }
var TUT = 'tutor.haiphan.org', SITE = '/etc/nginx/sites-available/tutor.haiphan.org', RELOAD = 'sudo nginx -t && sudo systemctl reload nginx';
function cfg(o) { return B.site(o); }

/* conf.d dùng trong chương */
var BOTS_MAP = ['map $http_user_agent $bad_bot {', '    default 0;', '    ~*(sqlmap|nikto|masscan|mj12bot|ahrefsbot) 1;', '}'];
var REDIR_MAP = ['map $request_uri $new_uri {', '    default "";', '    /khoa-hoc-cu /courses;', '    /gioi-thieu /about;', '}'];
var CANARY = ['split_clients "${remote_addr}${http_user_agent}" $variant {', '    50% "new";', '    *   "old";', '}'];
var REALIP = ['set_real_ip_from 127.0.0.1;', 'real_ip_header X-Forwarded-For;'];
var PAGE404 = ['<!doctype html>', '<title>Không tìm thấy</title>', '<h1>Trang này không tồn tại</h1>', '<p><a href="/">Về trang chủ</a></p>'];
var PAGE50X = ['<!doctype html>', '<title>Đang bảo trì</title>', '<h1>Hệ thống đang bảo trì</h1>', '<p>Vui lòng quay lại sau ít phút.</p>'];

var D = { id: 'c3e', group: 'Web server', short: 'Nginx (5): file tĩnh, truy cập, biến', title: 'Nginx (5): file tĩnh, kiểm soát truy cập và biến', dek: 'root và alias, thư mục và autoindex, trang lỗi và bảo trì, internal với X-Accel-Redirect, chống hotlink, allow/deny với IP thật, Basic Auth, chặn bot, và map/split_clients cho bảng chuyển hướng và canary.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c3d') idx = i; });
C.lessons.splice(idx + 1, 0, D);

D.theory = [
  { tag: 'Khái niệm', title: 'Nginx tìm file tĩnh thế nào: từ URI tới đường dẫn đĩa', body: [
    'Với một yêu cầu không phải proxy, Nginx đi qua một chuỗi quyết định rất cố định. Nắm chuỗi này là đọc được mọi lỗi 403/404 của file tĩnh:',
    { tbl: [['Bước', 'Điều Nginx làm', 'Kết quả khi hỏng'], ['1. Chọn `server` rồi `location`', 'Theo `server_name` và quy tắc khớp location', 'Vào nhầm location'], ['2. Ghép đường dẫn', '`root` + URI, hoặc `alias` thay phần tiền tố location', '404 vì file không ở chỗ bạn nghĩ'], ['3. Là file?', 'Có thì trả về, kèm `Content-Type`, `ETag`', '404: `open() "..." failed (2: No such file or directory)`'], ['4. Là thư mục?', 'URI chưa có `/` cuối thì trả **301** sang bản có `/`', '—'], ['5. Tìm `index`', 'Thử lần lượt các tên trong `index` (mặc định `index.html`)', '—'], ['6. Không có index', '`autoindex on` thì liệt kê, ngược lại **403**', '403: `directory index of "..." is forbidden`']] },
    { ul: ['Nhớ cặp "404 = không có file" và "403 = có thư mục nhưng không được liệt kê" (hoặc quyền đọc đĩa sai).', 'Nginx chạy bằng user `www-data`: file và **mọi thư mục cha** phải cho `www-data` quyền đọc/duyệt (`x`). Quyền sai cho `403` kèm `(13: Permission denied)`.', 'Luôn đọc `error.log` trước: nó ghi đường dẫn **thật** Nginx đã thử.']}
  ] },
  { tag: 'Cú pháp', title: 'root và alias: bẫy ghép đường dẫn', body: [
    'Hai chỉ thị này cùng chỉ "thư mục chứa file", nhưng ghép với URI khác nhau:',
    { tbl: [['Cấu hình', 'Yêu cầu', 'Nginx mở file'], ['`location /media/ { root /srv/media; }`', '`/media/intro.mp4`', '`/srv/media/media/intro.mp4` (root + **toàn bộ** URI)'], ['`location /media/ { root /srv; }`', '`/media/intro.mp4`', '`/srv/media/intro.mp4`'], ['`location /media/ { alias /srv/media/; }`', '`/media/intro.mp4`', '`/srv/media/intro.mp4` (alias **thay** phần `/media/`)']] },
    { pre: ['# Đúng, hai cách tương đương', 'location /media/ { root /srv; }                 # thư mục /srv/media có tên trùng location', 'location /media/ { alias /srv/media/; }          # thư mục đặt tên tuỳ ý'], cap: 'root hợp khi tên thư mục khớp, alias hợp khi muốn ánh xạ tên khác' },
    { ul: ['Với `alias`, **dấu `/` cuối phải khớp nhau**: `location /media/` đi với `alias /srv/media/;`. Lệch dấu gạch sinh đường dẫn kiểu `/srv/mediaintro.mp4`.', 'Chỉ nên đặt `root` ở cấp `server` một lần, `location` kế thừa; dùng `alias` khi cần ánh xạ riêng.', 'Cách kiểm tra nhanh: `sudo tail -n 1 /var/log/nginx/error.log` rồi đọc đường dẫn trong `open() "..."`.']}
  ] },
  { tag: 'Cú pháp', title: 'Thư mục, index và autoindex', body: [
    { pre: ['location /files {', '    autoindex on;                 # liệt kê khi không có index', '    autoindex_exact_size off;     # hiện 12K thay vì 12345 byte', '    autoindex_localtime on;', '}'], cap: 'Cho phép duyệt thư mục tài liệu' },
    { ul: ['Truy cập `/files` (không dấu `/`) vào một thư mục: Nginx trả `301` tới `/files/` rồi mới liệt kê. Sau Cloudflare hoặc proxy, địa chỉ chuyển hướng có thể sai cổng/scheme nếu `Host` bị đổi.', '`index index.html index.htm;` đặt thứ tự thử; có file index thì autoindex không bao giờ hiện.', '`autoindex on` lộ toàn bộ tên file: không bật cho thư mục chứa dữ liệu nhạy cảm, bản sao lưu (`.sql`, `.zip`), `.env`, `.git`.', 'Chặn truy cập file ẩn: `location ~ /\\. { deny all; }` (cho phép riêng `/.well-known/` của Let\'s Encrypt).']}
  ] },
  { tag: 'Cú pháp', title: 'error_page: trang lỗi tuỳ chỉnh và internal', body: [
    { pre: ['error_page 404 /errors/404.html;', 'error_page 500 502 503 504 /errors/50x.html;', '', 'location ^~ /errors/ {', '    root /var/www;', '    internal;                     # khách không gọi trực tiếp được, chỉ Nginx chuyển nội bộ', '}'], cap: 'Trang lỗi đẹp thay cho trang mặc định của Nginx' },
    { tbl: [['Dạng', 'Ý nghĩa'], ['`error_page 404 /404.html;`', 'Giữ mã 404, nội dung từ file'], ['`error_page 404 =200 /empty.gif;`', 'Đổi mã trả về thành 200 (hiếm khi nên làm)'], ['`error_page 502 = @fallback;`', 'Chuyển sang location có tên, ví dụ cho `return 200 "..."` hoặc proxy dự phòng'], ['`error_page 401 https://sso.example.com/login;`', 'Chuyển hướng tới URL ngoài']] },
    { ul: ['`internal` làm yêu cầu trực tiếp tới `/errors/404.html` trả 404: tránh lộ trang hoặc bị lập chỉ mục.', 'Nginx chỉ dùng `error_page` cho lỗi do **chính nó** sinh ra. Lỗi 404/500 từ ứng dụng phía sau chỉ được thay khi bật `proxy_intercept_errors on;`.', 'Trang lỗi mà bản thân nó cũng lỗi (file không tồn tại) sẽ cho ra trang mặc định: kiểm tra bằng cách xem thật.']}
  ] },
  { tag: 'Mẹo', title: 'Trang bảo trì bằng file cờ', body: [
    'Khi deploy lớn cần cho khách thấy trang "đang bảo trì" mà không sửa cấu hình: dùng một file cờ.',
    { pre: ['server {', '    error_page 503 /errors/50x.html;', '', '    if (-f /var/www/maintenance.flag) {', '        add_header Retry-After 3600 always;', '        return 503;', '    }', '}'], cap: 'Có file cờ thì mọi yêu cầu nhận 503' },
    { ul: ['Bật: `sudo touch /var/www/maintenance.flag`. Tắt: `sudo rm /var/www/maintenance.flag`. **Không cần reload.**', 'Dùng mã **503** (không phải 200/404) và `Retry-After` để Google biết là tạm thời, không gỡ trang khỏi chỉ mục.', 'Cho phép đội ngũ vẫn vào được: dùng `map $remote_addr $maintenance_block` hoặc `allow` IP văn phòng ở một location.', 'Kiểm tra bằng `curl -si`: thấy `503`, `Retry-After`, nội dung trang bảo trì.']}
  ] },
  { tag: 'Khái niệm', title: 'internal và X-Accel-Redirect: ứng dụng quyết, Nginx phát file', body: [
    'Bài toán: tài liệu chỉ học viên đã đăng nhập mới được tải. Đưa file qua ứng dụng Node thì tốn bộ nhớ và chậm; để file ở thư mục công khai thì ai biết link cũng tải được. Giải pháp: ứng dụng **kiểm quyền**, rồi bảo Nginx phát file.',
    { pre: ['# Nginx', 'location /protected/ {', '    internal;                  # chặn truy cập trực tiếp từ ngoài', '    alias /var/protected/;', '}', '', '# Ứng dụng (sau khi kiểm quyền) trả về', '# HTTP/1.1 200 OK', '# X-Accel-Redirect: /protected/report.pdf', '# Content-Disposition: attachment; filename="bao-cao.pdf"'], cap: 'Ứng dụng chỉ gửi một header, Nginx gửi cả file' },
    { ul: ['Quên `internal;` là lỗ hổng: ai cũng tải thẳng được `/protected/report.pdf`, bỏ qua kiểm quyền. Kiểm tra bằng `curl -sI` link trực tiếp, kết quả đúng phải là 404.', 'Nginx hỗ trợ Range, ETag, `sendfile` nên video và file lớn phát hiệu quả hơn nhiều so với đi qua ứng dụng.', 'Có thể thêm `X-Accel-Limit-Rate`, `X-Accel-Expires` để giới hạn tốc độ và điều khiển cache theo từng phản hồi.']}
  ] },
  { tag: 'Cú pháp', title: 'Chống hotlink: valid_referers', body: [
    'Hotlink là trang khác nhúng thẳng ảnh/video của bạn vào trang họ, bạn trả tiền băng thông. `valid_referers` đánh giá header `Referer` và đặt `$invalid_referer`:',
    { pre: ['location /assets/ {', '    valid_referers none blocked server_names *.haiphan.org;', '    if ($invalid_referer) {', '        return 403;', '    }', '}'], cap: 'Chỉ cho trang của mình (và yêu cầu không có Referer)' },
    { tbl: [['Giá trị', 'Khớp khi'], ['`none`', 'Không có header Referer (gõ địa chỉ trực tiếp, nhiều ứng dụng di động)'], ['`blocked`', 'Có Referer nhưng đã bị tường lửa/proxy xoá phần scheme'], ['`server_names`', 'Referer có tên trong `server_name` của server'], ['`*.haiphan.org`', 'Mẫu tên miền hoặc regex bắt đầu bằng `~`']] },
    { ul: ['Referer chỉ là lời khai của trình duyệt, kẻ xấu giả được. Đây là rào chắn nhẹ cho việc "nhúng trộm", không phải bảo mật.', 'Muốn chặn thật dùng URL ký (signed URL/`secure_link`) hoặc xác thực.', 'Nhớ cho phép `none`, nếu không công cụ tìm kiếm và ứng dụng di động bị chặn nhầm.']}
  ] },
  { tag: 'Khái niệm', title: 'allow/deny, IP thật và satisfy', body: [
    { pre: ['location /admin/ {', '    allow 203.0.113.0/24;      # IP văn phòng', '    allow 10.8.0.0/24;         # VPN', '    deny all;                  # mọi nơi khác 403', '    proxy_pass http://127.0.0.1:3100;', '}'], cap: 'Quy tắc đánh giá lần lượt, quy tắc đầu tiên khớp thắng' },
    { ul: ['Thứ tự rất quan trọng: `deny all;` đặt trước `allow` sẽ chặn tất cả.', 'Nginx so với **`$remote_addr`**. Sau Cloudflare hoặc load balancer, đó là IP của họ nên `allow` không bao giờ khớp (hoặc cho cả thế giới). Khôi phục IP thật: `set_real_ip_from <dải proxy tin cậy>; real_ip_header CF-Connecting-IP;`.', 'Chỉ tin header chuyển tiếp từ proxy mà bạn tin (`set_real_ip_from`), không bao giờ tin `X-Forwarded-For` từ Internet.', '`satisfy all` (mặc định): phải đạt cả IP lẫn mật khẩu. `satisfy any`: đạt một trong hai là đủ (ví dụ văn phòng khỏi mật khẩu, nơi khác phải nhập).', 'Vi phạm `allow/deny` trả **403**; sai mật khẩu Basic trả **401**: nhìn mã để biết lớp nào chặn.']}
  ] },
  { tag: 'Cú pháp', title: 'Basic Auth với htpasswd và auth_request', body: [
    { pre: ['sudo htpasswd -bc /etc/nginx/.htpasswd admin Tutor2026   # -c: tạo file mới (lần đầu)', 'sudo htpasswd -b  /etc/nginx/.htpasswd giaovien Gv2026    # thêm/đổi người dùng', '', 'location /admin/ {', '    auth_basic "Khu vực quản trị";', '    auth_basic_user_file /etc/nginx/.htpasswd;', '    proxy_pass http://127.0.0.1:3100;', '}'], cap: 'Cấp mật khẩu cho khu vực quản trị' },
    { ul: ['Cờ `-c` **ghi đè** file hiện có: chỉ dùng lúc tạo. Thêm người dùng sau không có `-c`.', 'File mật khẩu phải đọc được bởi tiến trình Nginx (`www-data`): file `600 root` cho **500** và `open() ... (13: Permission denied)` trong error.log. Đặt `640` với nhóm `www-data` hoặc `644` (chỉ chứa băm).', 'Basic Auth gửi tên/mật khẩu mã hoá base64 (không phải mã hoá an toàn): **chỉ dùng qua https**.', 'Không có giới hạn thử sai: kết hợp `limit_req` (chương Nginx 3) để chống dò mật khẩu.', 'Cần đăng nhập thật (SSO, JWT, session): dùng `auth_request /auth;`: Nginx hỏi một endpoint nội bộ trước mỗi yêu cầu, 2xx là cho qua, 401/403 là chặn.']}
  ] },
  { tag: 'Cú pháp', title: 'Chặn bot theo User-Agent và các giới hạn nhẹ', body: [
    { pre: ['map $http_user_agent $bad_bot {', '    default 0;', '    ~*(sqlmap|nikto|masscan|mj12bot|ahrefsbot) 1;', '}', '', 'server {', '    if ($bad_bot) {', '        return 403;           # hoặc return 444; để đóng kết nối không trả lời', '    }', '}'], cap: 'Chặn công cụ quét và bot ăn băng thông' },
    { ul: ['`~*` là regex không phân biệt hoa thường. Viết mẫu **cụ thể**: `~*bot` sẽ chặn luôn Googlebot và Bingbot (mất SEO).', 'User-Agent do client tự khai nên chỉ chặn được kẻ lười; bot hiểm có thể giả Chrome. Kết hợp `limit_req`, `limit_conn`, Cloudflare Bot Fight.', '`limit_conn_zone $binary_remote_addr zone=perip:10m; limit_conn perip 20;` giới hạn số kết nối đồng thời mỗi IP (quan trọng với tải xuống lớn).', '`return 444;` là mã riêng của Nginx: đóng kết nối ngay, không phản hồi, tiết kiệm băng thông với kẻ quét.', 'Một `if` chỉ chứa `return` là an toàn. Tránh nhồi `proxy_pass`, `set` phức tạp vào `if` ("if is evil").']}
  ] },
  { tag: 'Khái niệm', title: 'Biến, map, geo và split_clients', body: [
    'Nginx tính giá trị biến **chậm** (khi biến được dùng), nên `map` rẻ và có thể khai báo thoải mái ở cấp `http`.',
    { tbl: [['Khối', 'Dùng để', 'Ví dụ'], ['`map $a $b { ... }`', 'Tạo biến `$b` từ giá trị `$a` (khớp chuỗi, `~` regex, `default`)', 'Bảng chuyển hướng, nhãn bot, chọn upstream theo host'], ['`geo $b { ... }`', 'Tạo `$b` từ **dải IP** của khách', 'Nhận diện IP văn phòng, VPN'], ['`split_clients "$khoá" $b { 20% "new"; * "old"; }`', 'Chia khách theo phần trăm, ổn định theo khoá', 'Canary 20% người dùng sang bản mới'], ['`set $x ...;`', 'Gán biến trong server/location', 'Đặt cờ tạm']] },
    { pre: ['map $request_uri $new_uri {', '    default "";', '    /khoa-hoc-cu /courses;', '    /gioi-thieu  /about;', '}', 'server {', '    if ($new_uri) { return 301 $new_uri; }', '}'], cap: 'Bảng chuyển hướng hàng trăm URL chỉ bằng một khối map' },
    { ul: ['`$request_uri` **gồm query**: khoá `/gioi-thieu` không khớp `/gioi-thieu?utm=1`. Dùng `$uri` (đã bỏ query) làm nguồn, rồi nối lại `$is_args$args` khi chuyển hướng: `return 301 $new_uri$is_args$args;`.', '`split_clients` băm khoá nên cùng khách (cùng IP + UA) luôn cùng nhóm: trải nghiệm ổn định khi chạy thử nghiệm A/B hoặc canary.', 'Gửi biến cho ứng dụng qua header để nó biết khách thuộc nhóm nào: `proxy_set_header X-Variant $variant;`.', '`map` đặt ở cấp `http` (file `conf.d/*.conf`), **không** được đặt trong `server`/`location`.']}
  ] },
  { tag: 'Mẹo', title: 'Quy trình chẩn đoán file tĩnh và kiểm soát truy cập', body: [
    { tbl: [['Triệu chứng', 'Kiểm tra', 'Nguyên nhân thường gặp'], ['404 cho file chắc chắn có', '`error.log`: đường dẫn thật trong `open()`', '`root` với location có tiền tố (cần `alias`), hoặc sai thư mục'], ['403 ở thư mục', '`error.log`: `directory index ... forbidden`', 'Không có `index`, chưa bật `autoindex`'], ['403 kèm `Permission denied`', '`namei -l đường-dẫn` (quyền các thư mục cha)', '`www-data` thiếu quyền đọc/duyệt'], ['Trang lỗi đẹp không hiện', '`curl -si` link lỗi, xem body', 'Thiếu location chứa file lỗi, hoặc file lỗi bị 404'], ['Ai cũng tải được file riêng tư', '`curl -sI` link trực tiếp', 'Thiếu `internal;` trên location nhận X-Accel-Redirect'], ['Basic Auth luôn 500', '`error.log`: `open() ... failed`', 'Sai đường dẫn file mật khẩu hoặc quyền đọc'], ['`allow/deny` không có tác dụng', 'IP trong `$remote_addr` (log)', 'Sau proxy/Cloudflare chưa dùng real_ip'], ['Chuyển hướng bằng map không chạy', '`curl -sI` địa chỉ có và không có `?query`', 'Khoá map dùng `$request_uri` nên lệch khi có query']] }
  ] }
];

D.quiz = [
  { q: 'Cấu hình `location /media/ { root /srv/media; }`. Yêu cầu `/media/intro.mp4` làm Nginx mở file nào?', opts: ['/srv/media/intro.mp4', '/srv/media/media/intro.mp4', '/srv/intro.mp4', '/media/intro.mp4'], ans: 1, why: 'root được nối với toàn bộ URI, nên phần /media/ xuất hiện hai lần. Dùng alias /srv/media/; hoặc root /srv; để có đường dẫn đúng.' },
  { q: 'Với `location /media/ { alias /srv/media/; }`, yêu cầu `/media/intro.mp4` ánh xạ tới?', opts: ['/srv/media/media/intro.mp4', '/srv/media/intro.mp4', '/srv/media/', '/srv/intro.mp4'], ans: 1, why: 'alias thay phần tiền tố của location bằng đường dẫn alias; phần còn lại của URI được nối vào.' },
  { q: 'Vào `/files/` (thư mục không có index.html, autoindex off), Nginx trả?', opts: ['200 trang trắng', '403 Forbidden, error.log ghi "directory index ... is forbidden"', '404 Not Found', '500'], ans: 1, why: '403 nghĩa là thư mục tồn tại nhưng Nginx không được phép liệt kê. 404 mới là không có file.' },
  { q: 'Khách truy cập `/files` (thiếu dấu / cuối) vào thư mục có thật. Nginx làm gì?', opts: ['Trả 404', 'Trả 301 sang /files/', 'Trả thẳng danh sách', 'Trả 403'], ans: 1, why: 'Nginx chuẩn hoá địa chỉ thư mục bằng cách chuyển hướng sang bản có dấu / cuối rồi mới tìm index hoặc liệt kê.' },
  { q: '`error_page 404 /errors/404.html;` nhưng khách vẫn thấy trang 404 mặc định của Nginx. Nguyên nhân khả dĩ?', opts: ['Thiếu location phục vụ /errors/ hoặc file 404.html không ở đường dẫn Nginx tìm', 'Cần `gzip on`', 'Cần restart máy', 'Chứng chỉ hết hạn'], ans: 0, why: 'error_page chuyển nội bộ tới URI đó như một yêu cầu mới. Nếu URI đó cũng không ra file thì Nginx trả trang mặc định.' },
  { q: 'Mục đích của `internal;` trên `location ^~ /errors/`?', opts: ['Khách không truy cập trực tiếp được; chỉ Nginx chuyển nội bộ vào', 'Tăng tốc', 'Tắt log', 'Bật nén'], ans: 0, why: 'Yêu cầu từ bên ngoài tới location internal nhận 404. error_page và X-Accel-Redirect vẫn dùng được.' },
  { q: 'Trang bảo trì nên trả mã nào kèm header gì để không ảnh hưởng SEO?', opts: ['200 và không header', '404', '503 kèm Retry-After', '301'], ans: 2, why: '503 báo tạm thời không phục vụ; Retry-After gợi ý thời gian quay lại, công cụ tìm kiếm không gỡ trang.' },
  { q: 'Điều kiện nào đúng cho việc bật/tắt bảo trì bằng file cờ `/var/www/maintenance.flag` mà không cần reload?', opts: ['`if (-f /var/www/maintenance.flag) { return 503; }`', '`set $m 1;`', '`map $flag $m {}`', 'Không thể'], ans: 0, why: 'Nginx kiểm tra sự tồn tại file ở mỗi yêu cầu, nên tạo/xoá file là đủ, không cần nạp lại cấu hình.' },
  { q: 'Tài liệu riêng tư lưu ở /var/protected. Ứng dụng kiểm quyền rồi trả `X-Accel-Redirect: /protected/report.pdf`. Điều bắt buộc trên location /protected/?', opts: ['`internal;`', '`autoindex on;`', '`expires max;`', '`proxy_pass`'], ans: 0, why: 'Thiếu internal thì ai cũng gọi thẳng /protected/report.pdf được, bỏ qua bước kiểm quyền.' },
  { q: '`valid_referers none blocked server_names;` rồi `if ($invalid_referer) { return 403; }`. Yêu cầu không có header Referer sẽ?', opts: ['Bị 403', 'Được cho qua vì khớp none', 'Bị 401', 'Gây lỗi cú pháp'], ans: 1, why: '`none` coi yêu cầu không có Referer là hợp lệ, tránh chặn nhầm người gõ địa chỉ trực tiếp, bot tìm kiếm, ứng dụng di động.' },
  { q: 'Vì sao chống hotlink bằng Referer chỉ là biện pháp nhẹ?', opts: ['Referer do client tự khai nên giả được', 'Nginx không đọc được Referer', 'Referer luôn rỗng', 'Chỉ chạy được với HTTP/2'], ans: 0, why: 'Dùng nó để giảm nhúng trộm. Bảo vệ thật cần xác thực hoặc URL có ký.' },
  { q: 'Nginx đứng sau Cloudflare, `allow 203.0.113.0/24; deny all;` luôn trả 403 dù khách đến từ IP văn phòng. Nguyên nhân?', opts: ['`$remote_addr` là IP của Cloudflare; cần real_ip (set_real_ip_from + real_ip_header CF-Connecting-IP)', 'Thiếu gzip', 'Cần listen 8443', 'Quy tắc allow phải sau deny'], ans: 0, why: 'allow/deny so với địa chỉ kết nối trực tiếp. Phải khôi phục IP khách từ header của proxy tin cậy.' },
  { q: '`satisfy any;` cùng `allow 203.0.113.0/24; deny all;` và `auth_basic`. Khách IP văn phòng không nhập mật khẩu sẽ?', opts: ['Bị 401', 'Được vào vì thoả điều kiện IP', 'Bị 403', 'Bị 500'], ans: 1, why: 'any nghĩa là thoả IP hoặc mật khẩu là đủ. Với satisfy all (mặc định) phải thoả cả hai.' },
  { q: 'Basic Auth đã cấu hình nhưng mọi yêu cầu đều 500, error.log ghi `open() "/etc/nginx/.htpasswd" failed (13: Permission denied)`. Chữa?', opts: ['Cho phép tiến trình Nginx (www-data) đọc file: chmod 644 hoặc đổi chủ/nhóm', 'Tăng worker_processes', 'Đổi realm', 'Thêm gzip'], ans: 0, why: '500 ở Basic Auth gần như luôn là lỗi không đọc được file mật khẩu: sai đường dẫn hoặc quyền.' },
  { q: 'Lệnh nào tạo MỚI file mật khẩu với người dùng admin (không hỏi lại mật khẩu)?', opts: ['`htpasswd -bc /etc/nginx/.htpasswd admin Mật_khẩu`', '`htpasswd -b /etc/nginx/.htpasswd admin Mật_khẩu` (file chưa tồn tại)', '`htpasswd -D ...`', '`nginx -t`'], ans: 0, why: '-c tạo file mới (ghi đè nếu đã có), -b nhận mật khẩu trên dòng lệnh. Thêm người dùng về sau bỏ -c.' },
  { q: 'Mẫu map `~*bot 1;` để chặn bot xấu có hại gì?', opts: ['Chặn luôn Googlebot, Bingbot nên mất SEO', 'Không có hại', 'Làm Nginx chậm', 'Chặn cả Cloudflare'], ans: 0, why: 'Viết mẫu cụ thể theo tên công cụ cần chặn, không dùng từ khoá chung chung như bot.' },
  { q: 'Bảng chuyển hướng dùng `map $request_uri $new_uri { /gioi-thieu /about; }`. Tại sao `/gioi-thieu?utm_source=mail` không được chuyển?', opts: ['$request_uri có cả query nên không khớp khoá; nên dùng $uri làm nguồn và nối lại $is_args$args', 'Nginx không hỗ trợ query', 'Cần restart', 'map không dùng được với 301'], ans: 0, why: '$uri đã bỏ query và chuẩn hoá. Khi chuyển hướng dùng `return 301 $new_uri$is_args$args;` để giữ tham số theo dõi.' }
];

var F1 = { media: 'alias' }, F2 = Object.assign({}, F1, { files: 'auto' }), F3 = Object.assign({}, F2, { errors: 1 }), F4 = Object.assign({}, F3, { errors: 2 }), F5 = Object.assign({}, F4, { accel: true }), F6 = Object.assign({}, F5, { hotlink: true }), F7 = Object.assign({}, F6, { admin: 'auth' }), F8 = Object.assign({}, F7, { admin: 'any' }), F9 = Object.assign({}, F8, { bots: true }), F10 = Object.assign({}, F9, { redirects: true }), F11 = Object.assign({}, F10, { canary: true });
function srvIf(s, word) { var sv = liveSrv(s, TUT); return !!sv && sv.stmts.some(function (x) { return x.name === 'if' && x.args.join('').indexOf(word) >= 0; }); }
function cc(re) { return function (s) { return cnt(s, re) >= 2; }; }
var CODE = 'curl -s -o /dev/null -w "%{http_code}\\n" ';

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, {}); },
  items: [
    /* A. root, alias, thư mục */
    { text: 'Xem thư mục media thật trên đĩa (có intro.mp4, poster.jpg)', hint: 'ls -R /srv/media', check: R(/ls -R \/srv\/media/) },
    { text: 'Gọi intro.mp4: 404 dù file có thật', hint: 'curl -sI http://tutor.haiphan.org/media/intro.mp4', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/media\/intro\.mp4$/) },
    { text: 'Đọc error.log: Nginx đã thử đường dẫn nào?', hint: 'sudo tail -n 1 /var/log/nginx/error.log', check: R(/tail -n 1 \/var\/log\/nginx\/error\.log/) },
    { text: 'Sửa bằng alias (khớp dấu / cuối)', hint: SU(SITE, cfg(F1)), check: function (s) { return /alias \/srv\/media\/;/.test(txt(s, SITE)); } },
    { text: 'Kiểm tra cú pháp và nạp lại', hint: RELOAD, check: function (s) { return locDir(s, TUT, '/media/', 'alias') === '/srv/media/'; } },
    { text: 'Gọi lại intro.mp4: 200, Content-Type video/mp4', hint: 'curl -sI http://tutor.haiphan.org/media/intro.mp4', check: cc(/curl -sI http:\/\/tutor\.haiphan\.org\/media\/intro\.mp4$/) },
    { text: 'Vào thư mục không có dấu / cuối: 301 sang /files/', hint: 'curl -sI http://tutor.haiphan.org/files', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/files$/) },
    { text: 'Vào /files/ khi chưa có index và autoindex: 403', hint: 'curl -si http://tutor.haiphan.org/files/', check: R(/curl -si http:\/\/tutor\.haiphan\.org\/files\/$/) },
    { text: 'Tìm dòng giải thích 403 trong error.log', hint: 'sudo grep forbidden /var/log/nginx/error.log', check: R(/grep forbidden/) },
    { text: 'Bật autoindex cho /files', hint: SU(SITE, cfg(F2)), check: function (s) { return /autoindex on;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return locDir(s, TUT, '/files', 'autoindex') === 'on'; } },
    { text: 'Xem trang liệt kê thư mục', hint: 'curl -s http://tutor.haiphan.org/files/', check: R(/curl -s http:\/\/tutor\.haiphan\.org\/files\/$/) },

    /* B. error_page và bảo trì */
    { text: 'Gọi file không tồn tại: trang 404 mặc định của Nginx', hint: 'curl -si http://tutor.haiphan.org/files/none.txt', check: R(/curl -si http:\/\/tutor\.haiphan\.org\/files\/none\.txt$/) },
    { text: 'Tạo trang 404 tuỳ chỉnh', hint: SU('/var/www/errors/404.html', PAGE404), check: function (s) { return /không tồn tại/.test(txt(s, '/var/www/errors/404.html')); } },
    { text: 'Tạo trang 50x (lỗi máy chủ và bảo trì)', hint: SU('/var/www/errors/50x.html', PAGE50X), check: function (s) { return /bảo trì/.test(txt(s, '/var/www/errors/50x.html')); } },
    { text: 'Khai báo error_page và location internal cho /errors/', hint: SU(SITE, cfg(F3)), check: function (s) { return /error_page 404 \/errors\/404\.html/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return !!liveLoc(s, TUT, '/errors/'); } },
    { text: 'Gọi lại file không tồn tại: thấy trang 404 mới', hint: 'curl -si http://tutor.haiphan.org/files/none.txt', check: cc(/curl -si http:\/\/tutor\.haiphan\.org\/files\/none\.txt$/) },
    { text: 'Dừng API rồi gọi /api/users: Nginx hiện trang 50x thay vì 502 mặc định', hint: 'pm2 stop api', check: function (s) { return s.W.pm2.api.status === 'stopped'; }, transient: true },
    { text: 'Gọi /api/users khi API đã dừng', hint: 'curl -si http://tutor.haiphan.org/api/users', check: R(/curl -si http:\/\/tutor\.haiphan\.org\/api\/users$/) },
    { text: 'Khởi động lại API', hint: 'pm2 start api', check: R(/pm2 start api/) },
    { text: 'Thêm chế độ bảo trì bằng file cờ (503 + Retry-After)', hint: SU(SITE, cfg(F4)), check: function (s) { return /maintenance\.flag/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình (chỉ cần một lần)', hint: RELOAD, check: function (s) { return srvIf(s, 'maintenance.flag'); } },
    { text: 'Bật bảo trì bằng cách tạo file cờ (không reload)', hint: 'sudo touch /var/www/maintenance.flag', check: R(/touch \/var\/www\/maintenance\.flag/) },
    { text: 'Gọi trang bất kỳ: 503, Retry-After, trang bảo trì', hint: 'curl -si http://tutor.haiphan.org/media/intro.mp4', check: R(/curl -si http:\/\/tutor\.haiphan\.org\/media\/intro\.mp4$/) },
    { text: 'Tắt bảo trì bằng cách xoá file cờ', hint: 'sudo rm /var/www/maintenance.flag', check: R(/rm \/var\/www\/maintenance\.flag/) },
    { text: 'Gọi lại intro.mp4: đã trở lại 200', hint: 'curl -sI http://tutor.haiphan.org/media/intro.mp4', check: function (s) { return cnt(s, /curl -sI http:\/\/tutor\.haiphan\.org\/media\/intro\.mp4$/) >= 3; } },

    /* C. internal và X-Accel-Redirect */
    { text: 'Gọi /api/download: ứng dụng bảo Nginx phát /protected/report.pdf nhưng chưa có location: 404', hint: 'curl -si http://tutor.haiphan.org/api/download', check: R(/curl -si http:\/\/tutor\.haiphan\.org\/api\/download$/) },
    { text: 'Thêm location /protected/ với internal và alias', hint: SU(SITE, cfg(F5)), check: function (s) { return /internal;[\s\S]*alias \/var\/protected\//.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return !!liveLoc(s, TUT, '/protected/'); } },
    { text: 'Gọi lại /api/download: 200, application/pdf', hint: 'curl -si http://tutor.haiphan.org/api/download', check: cc(/curl -si http:\/\/tutor\.haiphan\.org\/api\/download$/) },
    { text: 'Gọi thẳng /protected/report.pdf: 404 (internal)', hint: 'curl -sI http://tutor.haiphan.org/protected/report.pdf', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/protected\/report\.pdf$/) },

    /* D. hotlink */
    { text: 'Nhúng logo từ trang khác (Referer lạ): đang được phép', hint: 'curl -sI -e https://other.example.com/page http://tutor.haiphan.org/assets/logo.png', check: R(/-e https:\/\/other\.example\.com\/page.*assets\/logo\.png/) },
    { text: 'Bật valid_referers cho /assets/', hint: SU(SITE, cfg(F6)), check: function (s) { return /valid_referers none blocked server_names;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { var l = liveLoc(s, TUT, '/assets/'); return !!l && l.stmts.some(function (x) { return x.name === 'valid_referers'; }); } },
    { text: 'Thử Referer lạ lại: 403', hint: 'curl -sI -e https://other.example.com/page http://tutor.haiphan.org/assets/logo.png', check: cc(/-e https:\/\/other\.example\.com\/page.*assets\/logo\.png/) },
    { text: 'Referer là chính trang của bạn: 200', hint: 'curl -sI -e https://tutor.haiphan.org/ http://tutor.haiphan.org/assets/logo.png', check: R(/-e https:\/\/tutor\.haiphan\.org\/ .*assets\/logo\.png/) },

    /* E. kiểm soát truy cập */
    { text: 'Tạo file mật khẩu với người dùng admin', hint: 'sudo htpasswd -bc /etc/nginx/.htpasswd admin Tutor2026', check: function (s) { return /^admin:/m.test(txt(s, '/etc/nginx/.htpasswd')); } },
    { text: 'Thêm người dùng giaovien (không dùng -c)', hint: 'sudo htpasswd -b /etc/nginx/.htpasswd giaovien Gv2026', check: function (s) { return /^giaovien:/m.test(txt(s, '/etc/nginx/.htpasswd')) && /^admin:/m.test(txt(s, '/etc/nginx/.htpasswd')); } },
    { text: 'Xem file mật khẩu: mỗi dòng là tên:băm', hint: 'sudo cat /etc/nginx/.htpasswd', check: R(/cat \/etc\/nginx\/\.htpasswd/) },
    { text: 'Bật Basic Auth cho /admin/', hint: SU(SITE, cfg(F7)), check: function (s) { return /auth_basic_user_file \/etc\/nginx\/\.htpasswd;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return !!locDir(s, TUT, '/admin/', 'auth_basic'); } },
    { text: 'Gọi /admin/ không có mật khẩu: 401', hint: CODE + 'http://tutor.haiphan.org/admin/', check: R(/-w %\{http_code\}.*tutor\.haiphan\.org\/admin\/$/) },
    { text: 'Gọi với mật khẩu đúng: 200', hint: CODE + '-u admin:Tutor2026 http://tutor.haiphan.org/admin/', check: R(/-u admin:Tutor2026.*admin\//) },
    { text: 'Gọi với mật khẩu sai: 401', hint: CODE + '-u admin:sai http://tutor.haiphan.org/admin/', check: R(/-u admin:sai.*admin\//) },
    { text: 'Xem lý do trong error.log (password mismatch)', hint: 'sudo grep mismatch /var/log/nginx/error.log', check: R(/grep mismatch/) },
    { text: 'Khai báo tin cậy X-Forwarded-For từ proxy nội bộ (real_ip)', hint: SU('/etc/nginx/conf.d/realip.conf', REALIP), check: function (s) { return /real_ip_header X-Forwarded-For/.test(txt(s, '/etc/nginx/conf.d/realip.conf')); } },
    { text: 'Cho IP văn phòng khỏi mật khẩu: satisfy any + allow + deny all', hint: SU(SITE, cfg(F8)), check: function (s) { return /satisfy any;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { var l = live(s); return locDir(s, TUT, '/admin/', 'satisfy') === 'any' && !!l && l.http.realHeader === 'X-Forwarded-For'; } },
    { text: 'Giả lập khách đến từ IP văn phòng 203.0.113.9: vào thẳng, 200', hint: CODE + '-H "X-Forwarded-For: 203.0.113.9" http://tutor.haiphan.org/admin/', check: R(/X-Forwarded-For: 203\.0\.113\.9.*admin\//) },
    { text: 'Khách từ IP khác 198.51.100.7: vẫn bị hỏi mật khẩu, 401', hint: CODE + '-H "X-Forwarded-For: 198.51.100.7" http://tutor.haiphan.org/admin/', check: R(/X-Forwarded-For: 198\.51\.100\.7.*admin\//) },
    { text: 'Tạo map nhận diện bot xấu theo User-Agent', hint: SU('/etc/nginx/conf.d/bots.conf', BOTS_MAP), check: function (s) { return /\$bad_bot/.test(txt(s, '/etc/nginx/conf.d/bots.conf')); } },
    { text: 'Chặn bot trong server: if ($bad_bot) { return 403; }', hint: SU(SITE, cfg(F9)), check: function (s) { return /if \(\$bad_bot\)/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return srvIf(s, 'bad_bot'); } },
    { text: 'Gọi bằng User-Agent sqlmap: 403', hint: 'curl -sI -A sqlmap http://tutor.haiphan.org/files/', check: R(/-A sqlmap/) },
    { text: 'Trình duyệt bình thường vẫn vào được: 200', hint: 'curl -sI -A Mozilla/5.0 http://tutor.haiphan.org/files/', check: R(/-A Mozilla\/5\.0/) },

    /* F. biến, map, split_clients */
    { text: 'Tạo bảng chuyển hướng bằng map $request_uri', hint: SU('/etc/nginx/conf.d/redirects.conf', REDIR_MAP), check: function (s) { return /\$new_uri/.test(txt(s, '/etc/nginx/conf.d/redirects.conf')); } },
    { text: 'Áp dụng trong server: if ($new_uri) { return 301 $new_uri; }', hint: SU(SITE, cfg(F10)), check: function (s) { return /if \(\$new_uri\)/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return srvIf(s, 'new_uri'); } },
    { text: 'Gọi /gioi-thieu: 301 sang /about', hint: 'curl -sI http://tutor.haiphan.org/gioi-thieu', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/gioi-thieu$/) },
    { text: 'Gọi lại kèm ?utm_source=mail: không chuyển (khoá map là $request_uri nên lệch; phần Sửa lỗi sẽ chữa)', hint: 'curl -sI "http://tutor.haiphan.org/gioi-thieu?utm_source=mail"', check: R(/gioi-thieu\?utm_source=mail/) },
    { text: 'Tạo split_clients 50/50 để chia khách vào nhóm new/old', hint: SU('/etc/nginx/conf.d/canary.conf', CANARY), check: function (s) { return /split_clients/.test(txt(s, '/etc/nginx/conf.d/canary.conf')); } },
    { text: 'Trả nhóm của khách bằng header X-Variant', hint: SU(SITE, cfg(F11)), check: function (s) { return /add_header X-Variant \$variant;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { var sv = liveSrv(s, TUT); return !!sv && sv.stmts.some(function (x) { return x.name === 'add_header' && x.args[0] === 'X-Variant'; }); } },
    { text: 'Thử nhiều User-Agent khác nhau: thấy cả new lẫn old', hint: 'for u in a b c d e f; do curl -sI -A $u http://tutor.haiphan.org/files/ | grep X-Variant; done', check: RA(/-A [a-f]\b/) }
  ]
};

function dropBlock(a, head) { var o = [], skip = false; a.forEach(function (l) { if (!skip && l.indexOf(head) >= 0) { skip = true; return; } if (skip) { if (/^    \}/.test(l)) { skip = false; } return; } o.push(l); }); return o; }
function sub(a, from, to) { return a.map(function (l) { return l === from ? to : l; }); }
function J(a) { return a.join('\n') + '\n'; }
var UA = function (u) { return { 'user-agent': u }; };

D.debugs = [
  {
    id: 'c3e1', title: 'Video bài giảng 404 dù file có thật trên đĩa',
    host: 'vps', user: 'haidangphan',
    symptom: L('Trang bài học không phát được video:', '', '$ curl -sI http://tutor.haiphan.org/media/intro.mp4', 'HTTP/1.1 404 Not Found', '', 'Nhưng `ls /srv/media` vẫn thấy intro.mp4 và poster.jpg, quyền đọc đều ổn.'),
    story: 'File có thật, quyền đúng, mà Nginx vẫn báo không thấy: nghĩa là nó đang tìm ở chỗ khác. error.log ghi chính xác đường dẫn nó đã thử.',
    goal: 'Cả /media/intro.mp4 và /media/poster.jpg trả 200.',
    hints: ['`sudo tail -n 1 /var/log/nginx/error.log`: đường dẫn trong `open() "..."` có gì lạ?', 'Với `root /srv/media;` trong `location /media/`, Nginx nối **toàn bộ** URI: `/srv/media/media/intro.mp4`.', 'Đổi sang `alias /srv/media/;` (nhớ dấu `/` cuối khớp với location) hoặc `root /srv;`, rồi reload và thử lại.'],
    fix: ['curl -sI http://tutor.haiphan.org/media/intro.mp4', 'sudo tail -n 1 /var/log/nginx/error.log', SU(SITE, cfg({ media: 'alias' })), RELOAD, 'curl -sI http://tutor.haiphan.org/media/intro.mp4'],
    cause: '`root` nối cả URI vào đường dẫn, nên `location /media/` với `root /srv/media` mở `/srv/media/media/intro.mp4`. `alias` thay phần tiền tố location bằng đường dẫn, hoặc đặt `root /srv` để thư mục `media` nằm trong URI. Luôn đọc error.log: nó cho thấy đường dẫn thật.',
    setup: function (s) { B.base(s, {}); },
    check: function (s) { return st(s, 'http', TUT, '/media/intro.mp4') === 200 && st(s, 'http', TUT, '/media/poster.jpg') === 200; }
  },
  {
    id: 'c3e2', title: 'Đã cấu hình trang 404 đẹp nhưng khách vẫn thấy trang mặc định',
    host: 'vps', user: 'haidangphan',
    symptom: L('Đã tạo /var/www/errors/404.html và 50x.html, đã thêm `error_page`, nhưng:', '', '$ curl -s http://tutor.haiphan.org/files/none.txt', '<html>', '<head><title>404 Not Found</title></head>', '...<center>nginx</center>', '', 'File trang lỗi nằm đúng thư mục, `nginx -t` báo ok.'),
    story: '`error_page` chỉ nói Nginx "chuyển nội bộ tới /errors/404.html". Việc đó cần một location phục vụ đường dẫn ấy. Thiếu nó, chính yêu cầu nội bộ lại 404 và Nginx lùi về trang mặc định.',
    goal: 'Gọi file không tồn tại trả 404 với nội dung trang tuỳ chỉnh ("Trang này không tồn tại").',
    hints: ['`cat /etc/nginx/sites-available/tutor.haiphan.org` và tìm xem có `location` nào khớp `/errors/` không.', 'Yêu cầu nội bộ tới `/errors/404.html` rơi vào `location /` (proxy tới ứng dụng) hoặc không thấy file. Cần một location riêng, có `internal`.', 'Thêm `location ^~ /errors/ { root /var/www; internal; }` (file nằm ở /var/www/errors/), reload, thử lại bằng `curl -si`.'],
    fix: ['curl -s http://tutor.haiphan.org/files/none.txt', 'cat ' + SITE, SU(SITE, cfg({ media: 'alias', errors: 1 })), RELOAD, 'curl -si http://tutor.haiphan.org/files/none.txt'],
    cause: '`error_page 404 /errors/404.html` tạo một yêu cầu nội bộ mới tới URI đó; URI phải được một location phục vụ. Thiếu location `/errors/`, yêu cầu nội bộ cũng thất bại. `internal` giữ cho khách không gọi trực tiếp trang lỗi. Nhớ `root /var/www` (không phải `/var/www/errors`) vì URI đã chứa `/errors/`.',
    setup: function (s) {
      s.fs.put('/var/www/errors/404.html', PAGE404.join('\n') + '\n', { owner: 'root' });
      s.fs.put('/var/www/errors/50x.html', PAGE50X.join('\n') + '\n', { owner: 'root' });
      B.base(s, { sites: { 'tutor.haiphan.org': J(dropBlock(cfg({ media: 'alias', errors: 1 }), 'location ^~ /errors/')) } });
    },
    check: function (s) { var r = request(s, 'http', TUT, '/files/none.txt'), d = request(s, 'http', TUT, '/errors/404.html'); return r.kind === 'resp' && r.status === 404 && /không tồn tại/.test(r.body || '') && d.kind === 'resp' && d.status === 404; }
  },
  {
    id: 'c3e3', title: 'Báo cáo "chỉ dành cho người đăng nhập" ai cũng tải được',
    host: 'vps', user: 'haidangphan',
    symptom: L('Kiểm tra bảo mật phát hiện:', '', '$ curl -sI http://tutor.haiphan.org/protected/report.pdf', 'HTTP/1.1 200 OK', 'Content-Type: application/pdf', '', 'Ứng dụng kiểm tra đăng nhập ở /api/download rồi mới trả X-Accel-Redirect, nhưng khách bỏ qua bước đó, gọi thẳng đường dẫn nội bộ.'),
    story: 'Thiết kế X-Accel-Redirect chỉ an toàn khi location đích **không** gọi được từ ngoài. Hiện tại có cách gọi thẳng. Sửa mà không phá luồng tải qua ứng dụng.',
    goal: '/protected/report.pdf gọi trực tiếp trả 404, còn /api/download vẫn trả 200.',
    hints: ['`cat /etc/nginx/sites-available/tutor.haiphan.org`: location `/protected/` có `alias` nhưng thiếu một chỉ thị.', 'Chỉ thị `internal;` làm location chỉ phục vụ chuyển hướng nội bộ (X-Accel-Redirect, error_page); gọi trực tiếp nhận 404.', 'Thêm `internal;` vào location `/protected/`, reload, thử cả hai: gọi thẳng và gọi qua `/api/download`.'],
    fix: ['curl -sI http://tutor.haiphan.org/protected/report.pdf', 'cat ' + SITE, SU(SITE, cfg({ media: 'alias', accel: true })), RELOAD, 'curl -sI http://tutor.haiphan.org/protected/report.pdf', 'curl -sI http://tutor.haiphan.org/api/download'],
    cause: 'Location đích của X-Accel-Redirect phải có `internal;`, nếu không nó là một URL công khai và bỏ qua toàn bộ kiểm tra quyền của ứng dụng. Với `internal`, khách gọi thẳng nhận 404 nhưng Nginx vẫn phục vụ khi ứng dụng yêu cầu bằng header, và file lớn được gửi bởi Nginx (nhanh, không qua Node).',
    setup: function (s) { B.base(s, { sites: { 'tutor.haiphan.org': J(sub(cfg({ media: 'alias', accel: true }), '        internal;', '        # internal;')) } }); },
    check: function (s) { return st(s, 'http', TUT, '/protected/report.pdf') === 404 && st(s, 'http', TUT, '/api/download') === 200; }
  },
  {
    id: 'c3e4', title: 'Bật Basic Auth xong, nhập đúng mật khẩu vẫn lỗi 500',
    host: 'vps', user: 'haidangphan',
    symptom: L('Vừa bật mật khẩu cho trang quản trị:', '', '$ curl -s -o /dev/null -w "%{http_code}\\n" -u admin:Tutor2026 http://tutor.haiphan.org/admin/', '500', '', 'Mật khẩu chắc chắn đúng (vừa tạo bằng htpasswd). Không có mật khẩu thì ra 500 chứ không phải 401.'),
    story: '500 từ chính Nginx thường nghĩa là nó không đọc được tài nguyên cấu hình tham chiếu. error.log nói rõ file nào và vì sao.',
    goal: 'Gọi /admin/ với admin:Tutor2026 trả 200, không có mật khẩu trả 401, mật khẩu sai trả 401.',
    hints: ['`sudo tail -n 2 /var/log/nginx/error.log` có dòng `open() "/etc/nginx/.htpasswd" failed (13: Permission denied)`.', '`ls -l /etc/nginx/.htpasswd`: file mode 600, thuộc root. Worker Nginx chạy `www-data` nên không đọc được.', 'Cấp quyền đọc: `sudo chmod 644 /etc/nginx/.htpasswd` (hoặc `chown root:www-data` + `chmod 640` ở máy thật). Không cần reload: file được đọc lại mỗi yêu cầu. Thử lại ba trường hợp.'],
    fix: ['curl -s -o /dev/null -w "%{http_code}\\n" -u admin:Tutor2026 http://tutor.haiphan.org/admin/', 'sudo tail -n 2 /var/log/nginx/error.log', 'ls -l /etc/nginx/.htpasswd', 'sudo chmod 644 /etc/nginx/.htpasswd', 'curl -s -o /dev/null -w "%{http_code}\\n" -u admin:Tutor2026 http://tutor.haiphan.org/admin/'],
    cause: 'Worker của Nginx chạy bằng user `www-data` (không phải root) nên file mật khẩu phải đọc được bởi user đó. File tạo bằng `sudo` với umask chặt thành 600 root nên Nginx gặp `Permission denied` và trả 500. Cách chuẩn: `chown root:www-data` + `chmod 640`; vẫn không để file trong thư mục web.',
    setup: function (s) {
      B.base(s, { sites: { 'tutor.haiphan.org': J(cfg({ media: 'alias', admin: 'auth' })) } });
      s.fs.put('/etc/nginx/.htpasswd', 'admin:' + V.htHash('admin', 'Tutor2026') + '\n', { owner: 'root', mode: M('600') });
    },
    check: function (s) {
      var ok = { authorization: 'Basic ' + b64('admin:Tutor2026') }, bad = { authorization: 'Basic ' + b64('admin:sai') };
      return st(s, 'http', TUT, '/admin/', ok) === 200 && st(s, 'http', TUT, '/admin/') === 401 && st(s, 'http', TUT, '/admin/', bad) === 401;
    }
  },
  {
    id: 'c3e5', hard: true, title: 'Chuyển hướng URL cũ hỏng khi có tham số quảng cáo',
    host: 'vps', user: 'haidangphan',
    symptom: L('Đã dựng bảng chuyển hướng URL cũ. Link trong email chạy tốt, nhưng link quảng cáo thì không:', '', '$ curl -sI http://tutor.haiphan.org/gioi-thieu', 'HTTP/1.1 301 Moved Permanently', 'Location: http://tutor.haiphan.org/about', '', '$ curl -sI "http://tutor.haiphan.org/gioi-thieu?utm_source=mail"', 'HTTP/1.1 404 Not Found', '', 'Chiến dịch email đang gửi hàng nghìn link có ?utm_source=... nên đội marketing báo toàn 404.'),
    story: 'Hai lỗi chồng nhau: bảng map không khớp khi có chuỗi truy vấn, và dù khớp, chuyển hướng hiện tại sẽ làm mất các tham số (đo lường chiến dịch hỏng). Cần khớp theo đường dẫn và giữ nguyên query.',
    goal: '/gioi-thieu và /khoa-hoc-cu chuyển 301 đúng; /gioi-thieu?utm_source=mail chuyển 301 tới /about?utm_source=mail.',
    hints: ['`cat /etc/nginx/conf.d/redirects.conf`: map khoá theo `$request_uri`, biến này gồm **cả** query (`/gioi-thieu?utm_source=mail`) nên không khớp mục `/gioi-thieu`.', 'Khớp theo `$uri` (chỉ đường dẫn, không query). Nhưng `return 301 $new_uri;` sẽ bỏ query: phải nối `$is_args$args`.', 'Sửa `map $uri $new_uri { ... }` và `return 301 $new_uri$is_args$args;`; reload; thử lại ba địa chỉ (có và không có query).'],
    fix: ['curl -sI "http://tutor.haiphan.org/gioi-thieu?utm_source=mail"', 'cat /etc/nginx/conf.d/redirects.conf', SU('/etc/nginx/conf.d/redirects.conf', REDIR_MAP.map(function (l) { return l.replace('$request_uri', '$uri'); })), SU(SITE, cfg({ media: 'alias', redirects: true }).map(function (l) { return l === '        return 301 $new_uri;' ? '        return 301 $new_uri$is_args$args;' : l; })), RELOAD, 'curl -sI "http://tutor.haiphan.org/gioi-thieu?utm_source=mail"'],
    cause: '`$request_uri` là URI gốc kèm chuỗi truy vấn nên khoá map chỉ khớp khi không có query. `$uri` đã bỏ query, hợp để tra bảng. Vì vậy phải nối lại `$is_args$args` (dấu `?` chỉ xuất hiện khi có tham số) để chiến dịch quảng cáo không mất `utm_*`. Với bảng lớn, dùng map thay cho nhiều `rewrite` vì tra băm nhanh và gọn.',
    setup: function (s) { B.base(s, { conf: { 'redirects.conf': J(REDIR_MAP) }, sites: { 'tutor.haiphan.org': J(cfg({ media: 'alias', redirects: true })) } }); },
    check: function (s) {
      var a = request(s, 'http', TUT, '/gioi-thieu'), b = request(s, 'http', TUT, '/gioi-thieu?utm_source=mail'), c = request(s, 'http', TUT, '/khoa-hoc-cu');
      return a.status === 301 && /\/about$/.test(a.loc || '') && b.status === 301 && /\/about\?utm_source=mail$/.test(b.loc || '') && c.status === 301 && /\/courses$/.test(c.loc || '') && st(s, 'http', TUT, '/files/') !== 301;
    }
  },
  {
    id: 'c3e6', title: 'Chặn bot xấu nhưng Googlebot cũng bị chặn',
    host: 'vps', user: 'haidangphan',
    symptom: L('Sau khi thêm bộ chặn bot, lưu lượng từ tìm kiếm tụt mạnh. Search Console báo "Server error (403)":', '', '$ curl -sI -A "Googlebot/2.1" http://tutor.haiphan.org/files/notes.txt', 'HTTP/1.1 403 Forbidden', '', 'Mục tiêu ban đầu chỉ là chặn sqlmap, nikto và vài crawler gây tải.'),
    story: 'Bộ lọc dùng một mẫu regex quá rộng. Xem map và tìm chuỗi nào khớp cả tên bot hợp lệ. Sửa sao cho chỉ chặn đúng danh sách, và kiểm tra cả bot tốt lẫn trình duyệt thường.',
    goal: 'Googlebot và Mozilla trả 200; sqlmap, AhrefsBot và MJ12bot trả 403.',
    hints: ['`cat /etc/nginx/conf.d/bots.conf`: có mẫu `~*bot 1;` khớp mọi UA chứa "bot".', '"Googlebot", "bingbot" đều chứa "bot". Chỉ liệt kê đúng tên cần chặn thay vì một mẫu chung.', 'Đổi thành `~*(sqlmap|nikto|masscan|mj12bot|ahrefsbot) 1;`, reload, thử đủ 5 User-Agent.'],
    fix: ['curl -sI -A "Googlebot/2.1" http://tutor.haiphan.org/files/notes.txt', 'cat /etc/nginx/conf.d/bots.conf', SU('/etc/nginx/conf.d/bots.conf', BOTS_MAP), RELOAD, 'curl -sI -A "Googlebot/2.1" http://tutor.haiphan.org/files/notes.txt', 'curl -sI -A sqlmap http://tutor.haiphan.org/files/notes.txt'],
    cause: 'Regex `~*bot` không phân biệt hoa thường nên khớp mọi User-Agent có chữ "bot", gồm cả Googlebot và Bingbot (chặn nhầm làm tụt SEO). Dùng danh sách tên cụ thể. Lưu ý User-Agent dễ giả mạo: đây chỉ là lớp lọc nhẹ cho crawler gây tải, còn chống tấn công thật cần `limit_req`, fail2ban hoặc WAF.',
    setup: function (s) { B.base(s, { conf: { 'bots.conf': J(['map $http_user_agent $bad_bot {', '    default 0;', '    ~*bot 1;', '}']) }, sites: { 'tutor.haiphan.org': J(cfg({ media: 'alias', bots: true })) } }); },
    check: function (s) {
      return st(s, 'http', TUT, '/files/notes.txt', UA('Googlebot/2.1')) === 200 && st(s, 'http', TUT, '/files/notes.txt', UA('Mozilla/5.0')) === 200 && st(s, 'http', TUT, '/files/notes.txt', UA('sqlmap/1.7')) === 403 && st(s, 'http', TUT, '/files/notes.txt', UA('AhrefsBot/7.0')) === 403 && st(s, 'http', TUT, '/files/notes.txt', UA('MJ12bot/v1.4')) === 403;
    }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
