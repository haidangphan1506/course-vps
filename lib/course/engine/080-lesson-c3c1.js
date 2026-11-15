(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.NGC;
function R(re) { return function (s) { return ran(s, re); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function HU(path, ls) { return 'tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function SU(path, ls) { return 'sudo ' + HU(path, ls); }
function live(s) { return s.W.nginx && s.W.nginx.active ? s.W.nginx.live : null; }
function liveSrv(s, name) { var l = live(s); return l ? l.servers.filter(function (x) { return x.names.indexOf(name) >= 0; })[0] : null; }
function liveLoc(s, name, path) { var sv = liveSrv(s, name); return sv ? sv.locs.filter(function (l) { return l.path === path; })[0] : null; }
function locDir(s, name, path, d) { var l = liveLoc(s, name, path); if (!l) return null; var f = l.stmts.filter(function (x) { return x.name === d; })[0]; return f ? f.args.join(' ') : null; }
function dirOf(s, d) { var l = live(s); return l && l.http.dir ? l.http.dir[d] || null : null; }
function upstream(s, n) { var l = live(s); return l && l.http.upstreams ? l.http.upstreams[n] || null : null; }
function request(s, scheme, host, path, headers) {
  var W = s.W, saved = W.ngx2req; W.ngx2req = headers || {};
  try { return V.ngReq(s, scheme, host, scheme === 'https' ? 443 : 80, path); } catch (e) { return { kind: 'err' }; } finally { W.ngx2req = saved; }
}
function st(s, scheme, host, path, h) { var r = request(s, scheme, host, path, h); return r.kind === 'resp' ? r.status : (r.kind === 'empty' ? 0 : -1); }
function hasHdr(r, name, re) { return (r.adds || []).some(function (a) { return a.name.toLowerCase() === name.toLowerCase() && (!re || re.test(a.value)); }); }
var TUT = 'tutor.haiphan.org', WWW = 'www.tutor.haiphan.org', API = 'api-tutor.haiphan.org';

var GZ1 = ['gzip on;', 'gzip_min_length 256;', 'gzip_comp_level 5;', 'gzip_vary on;', 'gzip_types text/css application/json;'];
var TUT_EXP = ['server {', '    listen 80;', '    listen 443 ssl;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    root /var/www/tutor;', '', '    location /assets/ {', '        expires 30d;', '    }', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}'];
var CACHE_CONF = ['proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m use_temp_path=off;'];
function apiCache(extra) { return ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location /api/ {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_cache api_cache;', '        proxy_cache_valid 200 30s;'].concat(extra || []).concat(['        add_header X-Cache-Status $upstream_cache_status;', '    }', '', '    location = /health {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}']); }
var API_CACHE = apiCache(), API_STALE = apiCache(['        proxy_cache_use_stale error timeout updating;']);
function pool(servers, method) { return ['upstream api_pool {'].concat(method ? ['    ' + method + ';'] : []).concat(servers.map(function (x) { return '    server ' + x + ';'; })).concat(['    keepalive 16;', '}']); }
var POOL1 = pool(['127.0.0.1:8881', '127.0.0.1:8882', '127.0.0.1:8883']);
var POOL2 = pool(['127.0.0.1:8881 weight=3', '127.0.0.1:8882', '127.0.0.1:8883', '127.0.0.1:8888 backup']);
var POOL3 = pool(['127.0.0.1:8881', '127.0.0.1:8882', '127.0.0.1:8883'], 'ip_hash');
function apiPool(extra) { return ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location /api/ {', '        proxy_pass http://api_pool;', '        proxy_http_version 1.1;', '        proxy_set_header Connection "";'].concat(extra || []).concat(['        add_header X-Upstream $upstream_addr;', '    }', '', '    location = /health {', '        proxy_pass http://api_pool;', '    }', '}']); }
var API_POOL = apiPool();
function tutRedirect(wwwLine) {
  var ssl = ['    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;'];
  return ['server {', '    listen 80;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    ' + (wwwLine || 'return 301 https://tutor.haiphan.org$request_uri;'), '}', '', 'server {', '    listen 443 ssl;', '    server_name www.tutor.haiphan.org;'].concat(ssl).concat(['    ' + (wwwLine || 'return 301 https://tutor.haiphan.org$request_uri;'), '}', '', 'server {', '    listen 443 ssl;', '    server_name tutor.haiphan.org;']).concat(ssl).concat(['    root /var/www/tutor;', '', '    location /assets/ {', '        expires 30d;', '    }', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}']);
}
var TUT_REDIR = tutRedirect();
var TUT_LOOP = ['server {', '    listen 80;', '    listen 443 ssl;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    return 301 https://$host$request_uri;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}'];

var D = { id: 'c3c', group: 'Web server', short: 'Nginx (3): hiệu năng, tải, chuyển hướng', title: 'Nginx (3): hiệu năng, cân bằng tải và chuyển hướng', dek: 'Nén gzip, cache trình duyệt (expires, ETag, 304), proxy_cache, upstream với weight, backup, failover và ip_hash; chuyển hướng 301/308 http sang https, www sang tên gốc và các lỗi vòng lặp hay gặp.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c3b') idx = i; });
C.lessons.splice(idx + 1, 0, D);

D.theory = [
  { tag: 'Khái niệm', title: 'Bốn lớp tăng tốc: nén, cache trình duyệt, cache proxy, nhiều bản sao', body: [
    'Một yêu cầu qua Nginx có thể nhanh hơn ở bốn chỗ. Hiểu từng lớp giúp bạn chọn đúng công cụ thay vì chỉnh lung tung:',
    { tbl: [['Lớp', 'Giảm gì', 'Chỉ thị chính', 'Hiệu quả'], ['Nén', 'Số byte phải truyền', '`gzip`, `gzip_types`', 'JS, CSS, JSON nhỏ đi 60-80%'], ['Cache trình duyệt', 'Số yêu cầu tới server', '`expires`, ETag, `Cache-Control`', 'Khách quay lại không tải lại file tĩnh'], ['Cache proxy', 'Tải lên ứng dụng', '`proxy_cache*`', 'Endpoint đọc nhiều được trả từ đĩa'], ['Nhiều bản sao', 'Nút cổ chai và điểm chết duy nhất', '`upstream`', 'Chia tải, một bản chết vẫn phục vụ']] },
    { ul: ['Đo trước khi sửa: `curl -sI` xem header, `curl -s -o /dev/null -w "%{size_download}"` xem số byte tải về, cột `rt=` trong access.log xem thời gian xử lý.', 'Thứ tự nên làm: nén (rẻ, ít rủi ro) rồi cache trình duyệt cho file tĩnh, sau đó mới tới proxy_cache và cân bằng tải (có rủi ro dữ liệu và vận hành cao hơn).']}
  ] },
  { tag: 'Cú pháp', title: 'gzip: nén phản hồi văn bản', body: [
    'Khai báo ở cấp `http` (file trong `conf.d/`), áp dụng cho mọi site:',
    { pre: ['# /etc/nginx/conf.d/gzip.conf', 'gzip on;', 'gzip_min_length 256;          # không nén thứ quá nhỏ', 'gzip_comp_level 5;              # 1 nhanh nhưng nén ít, 9 chậm; 4-6 là hợp lý', 'gzip_vary on;                  # thêm Vary: Accept-Encoding để cache trung gian không nhầm', 'gzip_types text/css application/javascript application/json image/svg+xml;'], cap: 'Cấu hình gzip cho website thông thường' },
    { ul: ['`text/html` luôn được nén khi `gzip on`, các loại khác **chỉ** nén khi nằm trong `gzip_types`. Quên `application/javascript` là lỗi phổ biến nhất: CSS nén mà JS lớn nhất lại không.', 'Không nén ảnh PNG/JPEG/WebP, video, file `.gz`/`.zip`: chúng đã được nén, nén thêm chỉ tốn CPU.', 'Nginx chỉ nén khi khách gửi `Accept-Encoding: gzip` (trình duyệt luôn gửi). Thử bằng `curl -sI -H "Accept-Encoding: gzip" URL` rồi tìm dòng `Content-Encoding: gzip`.', 'Nhận biết hiệu quả: so `Content-Length` hoặc `%{size_download}` khi có và không có header Accept-Encoding.', 'Cloudflare cũng nén (gzip/brotli) ở phía biên, nhưng nén ở origin vẫn cần cho kết nối không đi qua Cloudflare và để Cloudflare lấy bản nhỏ từ origin.']}
  ] },
  { tag: 'Cú pháp', title: 'Cache trình duyệt: expires, ETag và mã 304', body: [
    'Với file tĩnh, tốt nhất là trình duyệt không hỏi lại server cho tới khi hết hạn.',
    { pre: ['location /assets/ {', '    expires 30d;                       # Cache-Control: max-age=2592000', '}', '', 'location = /index.html {', '    expires -1;                        # Cache-Control: no-cache (luôn kiểm tra lại)', '}'], cap: 'Tài nguyên có băm tên: dài hạn. Trang HTML: luôn kiểm tra' },
    { tbl: [['Header', 'Ai gửi', 'Ý nghĩa'], ['`Cache-Control: max-age=N`', 'Server', 'Trình duyệt dùng bản lưu trong N giây, không hỏi lại'], ['`ETag`', 'Server', 'Dấu vân tay nội dung (Nginx tự tính cho file tĩnh)'], ['`If-None-Match`', 'Trình duyệt', 'Gửi lại ETag đang có để hỏi "còn mới không?"'], ['`304 Not Modified`', 'Server', 'Trả về không kèm nội dung: dùng bản trong cache']] },
    { ul: ['Hết hạn cache thì trình duyệt gửi `If-None-Match`; nội dung không đổi thì nhận 304 (vài trăm byte) thay vì tải lại cả file.', 'Cache dài (`30d`, `max`) chỉ an toàn khi tên file đổi theo nội dung (`app.3f9a1c.js`). Nếu không, người dùng sẽ kẹt với bản JS cũ sau khi deploy.', 'HTML của SPA nên `expires -1` hoặc `no-cache` để luôn nhận bản trỏ tới file JS mới.']}
  ] },
  { tag: 'Khái niệm', title: 'Tinh chỉnh kết nối và tài nguyên của Nginx', body: [
    'Phần này ít khi gây lỗi nhưng đáng biết khi tải tăng. Các giá trị mặc định của gói Ubuntu thường đã ổn cho một VPS nhỏ.',
    { tbl: [['Chỉ thị', 'Tác dụng', 'Lưu ý'], ['`worker_processes auto;`', 'Một worker mỗi lõi CPU', 'Giữ `auto`'], ['`worker_connections 768;`', 'Số kết nối đồng thời mỗi worker', 'Tối đa xấp xỉ worker × connections; mỗi yêu cầu proxy dùng 2 kết nối'], ['`keepalive_timeout 65;`', 'Giữ kết nối khách để tái sử dụng', 'Quá lớn tốn bộ nhớ khi nhiều khách'], ['`sendfile on; tcp_nopush on;`', 'Gửi file từ nhân hệ điều hành, ít sao chép', 'Bật cho file tĩnh'], ['`client_max_body_size 10m;`', 'Giới hạn dung lượng upload', 'Vượt thì 413. Mặc định chỉ 1m'], ['`open_file_cache max=1000;`', 'Nhớ thông tin file đã mở', 'Có ích khi phục vụ rất nhiều file nhỏ'], ['`proxy_buffering on;`', 'Nginx đệm phản hồi từ ứng dụng', 'Giữ bật; tắt chỉ cho SSE/stream']] },
    { note: 'Điểm nghẽn thật của site thường nằm ở ứng dụng và cơ sở dữ liệu, không phải Nginx. Hãy xem cột `urt=` ($upstream_response_time) trong log trước khi chỉnh thông số của Nginx.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'proxy_cache: lưu phản hồi của ứng dụng trên đĩa', body: [
    'Với endpoint đọc nhiều nhưng ít đổi (danh sách khoá học, cấu hình công khai), Nginx có thể trả từ cache thay vì gọi ứng dụng.',
    { pre: ['# http (conf.d/cache.conf): vùng nhớ khoá và thư mục lưu', 'proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m use_temp_path=off;', '', '# trong location', 'proxy_cache api_cache;', 'proxy_cache_valid 200 30s;                     # BẮT BUỘC, không có thì không lưu gì', 'add_header X-Cache-Status $upstream_cache_status;'], cap: 'Ba phần: nơi lưu, bật cho location, thời hạn' },
    { tbl: [['X-Cache-Status', 'Nghĩa là'], ['`MISS`', 'Chưa có trong cache, Nginx gọi ứng dụng rồi lưu lại'], ['`HIT`', 'Trả từ cache, ứng dụng không bị gọi'], ['`EXPIRED`', 'Bản cache đã quá hạn, Nginx gọi lại ứng dụng để làm mới'], ['`STALE`', 'Dùng bản cũ vì ứng dụng lỗi (cần `proxy_cache_use_stale`)'], ['`BYPASS`', 'Cố ý bỏ qua cache cho yêu cầu này (`proxy_cache_bypass`)']] },
    { ul: ['Khoá cache mặc định là `$scheme$proxy_host$request_uri`: **không** có người dùng, cookie hay header Authorization trong đó.', 'Quên `proxy_cache_valid` là sai sót thường gặp: ứng dụng không gửi `Cache-Control` nên mọi yêu cầu đều MISS.', 'File cache nằm dưới thư mục khai báo (`levels=1:2` chia thành thư mục con theo mã băm); xoá cache bằng cách xoá các file đó.']},
    { note: 'Không bao giờ cache phản hồi phụ thuộc người dùng (`/api/me`, giỏ hàng, hồ sơ) bằng khoá mặc định: người này sẽ thấy dữ liệu của người khác. Loại chúng ra bằng `proxy_cache_bypass` và `proxy_no_cache`, hoặc đưa người dùng vào khoá.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Điều khiển cache: bỏ qua, lưu bản cũ, thời hạn', body: [
    { pre: ['proxy_cache_bypass $http_authorization;     # có Authorization thì không đọc cache', 'proxy_no_cache $http_authorization;           # và cũng không lưu phản hồi đó', 'proxy_cache_key "$scheme$host$request_uri";   # thay khoá mặc định nếu cần', 'proxy_cache_use_stale error timeout updating http_502 http_503;', 'proxy_cache_lock on;                           # nhiều yêu cầu cùng lúc chỉ gọi ứng dụng một lần'], cap: 'Các chỉ thị điều khiển hay dùng' },
    { ul: ['`bypass` và `no_cache` nhận danh sách biến: giá trị khác rỗng và khác `0` thì kích hoạt.', '`proxy_cache_use_stale error ...` cho phép trả bản cũ khi ứng dụng sập: khách vẫn thấy trang (trạng thái `STALE`) trong lúc bạn sửa.', 'Khi `updating`, khách khác nhận bản cũ trong lúc một yêu cầu đang làm mới, tránh dồn tải lên ứng dụng ("cache stampede").', 'Ứng dụng có thể tự điều khiển bằng header `Cache-Control`/`X-Accel-Expires`, nhưng `proxy_cache_valid` rõ ràng, dễ kiểm soát hơn.']}
  ] },
  { tag: 'Cú pháp', title: 'upstream: nhóm máy chủ phía sau và thuật toán chia tải', body: [
    'Khai báo nhóm ở cấp `http`, rồi `proxy_pass` tới **tên nhóm** (không có cổng):',
    { pre: ['upstream api_pool {', '    server 127.0.0.1:8881;', '    server 127.0.0.1:8882;', '    server 127.0.0.1:8883;', '    keepalive 16;', '}', '', 'location /api/ {', '    proxy_pass http://api_pool;', '}'], cap: 'Ba bản sao của API chạy bằng pm2, cổng 8881 đến 8883' },
    { tbl: [['Phương pháp', 'Khai báo', 'Hành vi', 'Dùng khi'], ['Round robin', '(mặc định)', 'Lần lượt từng máy, tôn trọng `weight`', 'Bản sao giống nhau, API không lưu trạng thái'], ['Least connections', '`least_conn;`', 'Máy đang có ít kết nối nhất', 'Yêu cầu có thời gian xử lý chênh lệch lớn'], ['IP hash', '`ip_hash;`', 'Cùng IP khách luôn vào cùng một máy', 'Cần "dính" phiên mà ứng dụng giữ trạng thái trong bộ nhớ'], ['Hash tuỳ chọn', '`hash $http_x_user_id consistent;`', 'Băm theo biến bạn chọn', 'Dính theo người dùng hoặc theo URL (cache)']] },
    { ul: ['Phía sau Cloudflare, `$remote_addr` là IP của Cloudflare nên `ip_hash` chia rất lệch; hãy khôi phục IP thật bằng `real_ip` hoặc `hash $http_cf_connecting_ip`.', 'Tốt nhất là ứng dụng không giữ trạng thái trong bộ nhớ (phiên lưu ở Redis hoặc dùng JWT) để mọi bản sao thay thế nhau được.', 'Tên nhóm không tồn tại làm `nginx -t` báo `[emerg] host not found in upstream "api_pool"`.']}
  ] },
  { tag: 'Cú pháp', title: 'Trọng số, dự phòng và tự loại máy lỗi', body: [
    { tbl: [['Tham số của `server`', 'Ý nghĩa'], ['`weight=3`', 'Nhận gấp 3 lượng yêu cầu so với máy `weight=1`'], ['`backup`', 'Chỉ dùng khi **tất cả** máy chính không khả dụng'], ['`down`', 'Đánh dấu tạm ngưng (bảo trì), không nhận yêu cầu'], ['`max_fails=3 fail_timeout=30s`', 'Lỗi 3 lần trong 30 giây thì coi là chết 30 giây. Mặc định `max_fails=1 fail_timeout=10s`'], ['`max_fails=0`', 'Không bao giờ loại máy lỗi']] },
    { ul: ['Khi kết nối tới một máy bị từ chối, Nginx ghi `connect() failed (111)` vào error.log và **tự thử máy kế tiếp**; khách vẫn nhận 200. Nhờ vậy mất một bản sao không gây lỗi cho khách.', 'Hành vi đó do `proxy_next_upstream` (mặc định `error timeout`). Đặt `proxy_next_upstream off;` thì mỗi lần chọn trúng máy chết khách nhận ngay 502.', 'Mặc định Nginx **không** thử lại yêu cầu không idempotent (POST) sau khi đã gửi đi, để tránh tạo trùng đơn hàng; chỉ lỗi kết nối mới được thử lại.', 'Nginx mã nguồn mở chỉ kiểm tra thụ động (qua lỗi thật của khách). Kiểm tra chủ động (health check định kỳ) là tính năng của Nginx Plus hoặc công cụ ngoài.']}
  ] },
  { tag: 'Cú pháp', title: 'keepalive tới upstream: tái sử dụng kết nối', body: [
    'Mặc định Nginx mở một kết nối TCP mới tới ứng dụng cho mỗi yêu cầu. Với `keepalive` trong nhóm, nó giữ lại một số kết nối nhàn rỗi để dùng lại, giảm độ trễ và số cổng bị kẹt ở trạng thái TIME_WAIT khi tải cao.',
    { pre: ['upstream api_pool {', '    server 127.0.0.1:8881;', '    keepalive 16;                       # giữ tối đa 16 kết nối nhàn rỗi mỗi worker', '}', '', 'location /api/ {', '    proxy_pass http://api_pool;', '    proxy_http_version 1.1;             # keepalive cần HTTP/1.1', '    proxy_set_header Connection "";     # xoá "Connection: close" mặc định', '}'], cap: 'Ba mảnh phải đi cùng nhau' },
    { ul: ['Thiếu `proxy_http_version 1.1` hoặc `Connection ""` thì `keepalive` không có tác dụng (vẫn gửi HTTP/1.0 và đóng kết nối).', 'WebSocket thì cần `proxy_set_header Upgrade $http_upgrade;` và `Connection "upgrade";` ở location riêng, không dùng chung với cấu hình trên.']}
  ] },
  { tag: 'Khái niệm', title: 'Mã chuyển hướng: 301, 302, 307, 308', body: [
    { tbl: [['Mã', 'Vĩnh viễn?', 'Giữ nguyên method (POST)?', 'Dùng khi'], ['`301`', 'Có', 'Không (có thể đổi thành GET)', 'http sang https, www sang tên gốc, đổi domain, đổi URL trang'], ['`302`', 'Không', 'Không', 'Chuyển tạm thời, ví dụ trang bảo trì'], ['`308`', 'Có', 'Có', 'Chuyển vĩnh viễn nhưng API cần giữ POST/PUT'], ['`307`', 'Không', 'Có', 'Chuyển tạm thời giữ method']] },
    { ul: ['Trình duyệt và công cụ tìm kiếm ghi nhớ rất lâu mã 301/308. Thử cấu hình mới bằng 302 trước, chắc chắn rồi mới chuyển sang 301.', 'Tối ưu SEO: một địa chỉ chuẩn duy nhất cho mỗi trang (https, một trong hai www hoặc không www), các biến thể còn lại 301 về đúng địa chỉ đó **trong một bước**.', 'Quan sát bằng `curl -sI URL` (một bước) và `curl -sIL URL` (theo hết chuỗi chuyển hướng). Chuỗi dài hơn một bước là dấu hiệu cấu hình chưa gọn.']}
  ] },
  { tag: 'Mẹo', title: 'Các mẫu chuyển hướng chuẩn', body: [
    'Mẫu chuẩn là các khối `server` riêng cho từng việc, mỗi khối chỉ một dòng `return`:',
    { pre: ['# 1) http -> https cho cả hai tên, về địa chỉ chuẩn trong một bước', 'server {', '    listen 80;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    return 301 https://tutor.haiphan.org$request_uri;', '}', '', '# 2) www trên https -> tên gốc (cần chứng chỉ cho www)', 'server {', '    listen 443 ssl;', '    server_name www.tutor.haiphan.org;', '    # ssl_certificate ...', '    return 301 https://tutor.haiphan.org$request_uri;', '}', '', '# 3) server thật chỉ nghe 443, tên gốc', 'server { listen 443 ssl; server_name tutor.haiphan.org; ... }'], cap: 'Ba khối, không cần if' },
    { tbl: [['Cách viết', 'Kết quả', 'Ghi chú'], ['`return 301 https://tutor.haiphan.org$request_uri;`', 'Giữ đường dẫn và query', 'Cách nên dùng'], ['`return 301 https://tutor.haiphan.org;`', 'Mọi liên kết về trang chủ', 'Lỗi hay gặp: mất đường dẫn'], ['`return 301 https://$host$request_uri;`', 'Giữ nguyên tên khách gõ', 'Đúng cho http sang https, KHÔNG dùng để gộp www'], ['`rewrite ^/khoa-hoc/(.*)$ /courses/$1 permanent;`', 'Đổi một phần đường dẫn bằng regex', 'Dùng khi cần nhóm bắt `$1`'], ['`map $request_uri $new_uri { /old /new; }`', 'Bảng chuyển hướng nhiều URL', 'Kèm `if ($new_uri) { return 301 $new_uri; }`']] },
    { ul: ['`$request_uri` gồm cả `?query`; `$uri` đã được chuẩn hoá, không có query. Chuyển hướng nên dùng `$request_uri`.', '`return` đơn giản và nhanh hơn `rewrite`; chỉ dùng `rewrite` khi cần regex.', 'Hạn chế `if` trong location; trong khối `server` chỉ để `return` thì an toàn.']}
  ] },
  { tag: 'Lưu ý', title: 'Vòng lặp chuyển hướng (ERR_TOO_MANY_REDIRECTS)', body: [
    'Trình duyệt báo `ERR_TOO_MANY_REDIRECTS`, curl báo `Maximum (50) redirects followed`: URL chuyển tới đâu cũng bị chuyển tiếp lại. Nguyên nhân thường gặp:',
    { tbl: [['Nguyên nhân', 'Dấu hiệu', 'Cách chữa'], ['Một khối nghe cả `80` và `443 ssl` mà có `return 301 https://...`', 'Chính địa chỉ https cũng bị chuyển về https', 'Tách thành hai khối `server`: khối 80 redirect, khối 443 phục vụ'], ['Cloudflare chế độ **Flexible** + Nginx chuyển http sang https', 'Cloudflare luôn nói chuyện http với origin nên origin luôn redirect', 'Đổi sang Full (strict) có chứng chỉ ở origin, bỏ redirect trùng'], ['www chuyển về tên gốc, tên gốc lại chuyển về www', 'Hai khối chuyển qua lại', 'Chọn **một** địa chỉ chuẩn và đảm bảo nó là đích cuối'], ['Ứng dụng (Next.js) tự redirect về https vì không biết được scheme', 'Nginx đã nhận https nhưng gửi http cho app', '`proxy_set_header X-Forwarded-Proto $scheme;`']] },
    { pre: ['curl -sIL http://tutor.haiphan.org/            # theo hết chuỗi, thấy được vòng lặp', 'curl -s -o /dev/null -w "%{http_code}\\n" http://tutor.haiphan.org/   # chỉ in mã trạng thái'], cap: 'Hai lệnh để quan sát chuyển hướng' }
  ] },
  { tag: 'Mẹo', title: 'Quy trình chẩn đoán hiệu năng và chuyển hướng', body: [
    { tbl: [['Triệu chứng', 'Kiểm tra', 'Nguyên nhân thường gặp'], ['Tải lại trang vẫn tải lại file lớn', '`curl -sI` file đó: có `Cache-Control`/`ETag` không', 'Thiếu `expires` trên `/assets/`'], ['Lighthouse: "Enable text compression"', '`curl -sI -H "Accept-Encoding: gzip"`: có `Content-Encoding` không', '`gzip_types` thiếu loại, hoặc `gzip off`'], ['Sửa API xong nhưng khách vẫn thấy dữ liệu cũ', '`X-Cache-Status`: `HIT` kéo dài', '`proxy_cache_valid` quá dài, cần xoá cache hoặc rút ngắn'], ['Người dùng A thấy dữ liệu của người dùng B', '`X-Cache-Status: HIT` ở endpoint cá nhân', 'Cache với khoá mặc định, thiếu bypass và no_cache'], ['Cứ vài yêu cầu lại một lần 502', 'error.log: `connect() failed` tới một cổng', 'Một bản sao chết kèm `proxy_next_upstream off`'], ['Thêm máy mà tải vẫn lệch', '`$upstream_addr` trong log theo từng máy', '`ip_hash` sau Cloudflare, hoặc `weight` không đều'], ['`ERR_TOO_MANY_REDIRECTS`', '`curl -sIL` xem chuỗi `Location`', 'Redirect nằm trong khối nghe cả 80 và 443, hoặc Flexible SSL']] }
  ] }
];

D.quiz = [
  { q: 'Nginx đã `gzip on;` nhưng `gzip_types` chỉ có `text/css`. Tệp `app.js` (application/javascript) 60KB sẽ thế nào?', opts: ['Được nén vì có gzip on', 'Không được nén vì loại application/javascript không nằm trong gzip_types', 'Bị lỗi 500', 'Được nén nếu khách yêu cầu brotli'], ans: 1, why: 'Ngoài text/html, Nginx chỉ nén các MIME type có trong gzip_types. Bổ sung application/javascript (và application/json, image/svg+xml) để nén đủ.' },
  { q: 'Có nên thêm `image/png` vào `gzip_types`?', opts: ['Có, ảnh nào cũng nén được', 'Không, PNG đã nén sẵn nên gzip tốn CPU mà gần như không giảm dung lượng', 'Có, nhưng chỉ khi gzip_comp_level 9', 'Bắt buộc để Cloudflare hoạt động'], ans: 1, why: 'Định dạng ảnh, video, file nén đã được nén. Nén lần hai tốn tài nguyên và thường không nhỏ hơn.' },
  { q: '`gzip_vary on;` thêm header nào và để làm gì?', opts: ['`Vary: Accept-Encoding`, để proxy/CDN trung gian lưu riêng bản nén và bản không nén', '`Cache-Control: no-cache`', '`Content-Length: 0`', '`Connection: close`'], ans: 0, why: 'Cache trung gian cần biết nội dung thay đổi theo Accept-Encoding, nếu không có thể trả bản nén cho khách không hỗ trợ nén.' },
  { q: 'Trình duyệt gửi `If-None-Match` với ETag khớp file hiện tại. Nginx trả về gì?', opts: ['200 kèm toàn bộ file', '304 Not Modified, không kèm nội dung', '404', '301'], ans: 1, why: 'ETag khớp nghĩa là trình duyệt đang có bản mới nhất; 304 chỉ gồm header, tiết kiệm băng thông.' },
  { q: 'Vì sao `expires 30d;` cho `/assets/` chỉ an toàn khi tên file có mã băm (app.3f9a1c.js)?', opts: ['Vì Nginx bắt buộc', 'Vì khi nội dung đổi mà tên giữ nguyên, khách vẫn dùng bản cũ trong 30 ngày; đổi tên theo nội dung thì URL mới sẽ được tải ngay', 'Vì ETag không hoạt động với tên thường', 'Vì Cloudflare chặn'], ans: 1, why: 'Cache dài hạn giả định URL ↔ nội dung là cố định. Build có băm tên đảm bảo điều đó.' },
  { q: 'Bạn khai báo `proxy_cache api_cache;` nhưng không có `proxy_cache_valid`, ứng dụng không gửi Cache-Control. Kết quả?', opts: ['Cache 10 phút mặc định', 'Mọi yêu cầu đều MISS vì không có thời hạn nào để lưu', 'Nginx báo lỗi khi khởi động', 'Cache vô hạn'], ans: 1, why: 'Không có proxy_cache_valid (hoặc header cache từ ứng dụng) Nginx không biết được phép lưu bao lâu nên không lưu.' },
  { q: 'Trạng thái `EXPIRED` trong `X-Cache-Status` cho biết điều gì?', opts: ['Chứng chỉ SSL hết hạn', 'Có bản trong cache nhưng quá hạn, Nginx đã gọi ứng dụng để làm mới', 'Cache đầy', 'Khách hết quyền'], ans: 1, why: 'EXPIRED khác MISS: khoá đã từng được lưu, nay hết hạn nên được tải lại và ghi đè.' },
  { q: 'Endpoint `/api/me` trả thông tin theo token Authorization. Bật `proxy_cache` cho `/api/` với khoá mặc định. Hậu quả?', opts: ['Không có gì', 'Người gọi đầu tiên được cache; người khác gọi cùng URL nhận lại dữ liệu của người đó', 'Nginx từ chối cache', 'Chỉ Cloudflare bị ảnh hưởng'], ans: 1, why: 'Khoá mặc định là scheme + host + URI, không có danh tính. Phải bypass/no_cache theo Authorization, đưa nó vào khoá, hoặc không cache endpoint cá nhân.' },
  { q: '`proxy_cache_bypass $http_authorization;` làm gì?', opts: ['Chặn yêu cầu có Authorization', 'Khi header Authorization có giá trị thì không đọc từ cache (vẫn có thể lưu nếu không có no_cache)', 'Xoá cache', 'Mã hoá cache'], ans: 1, why: 'bypass chỉ bỏ qua bước đọc. Để cũng không lưu phản hồi cá nhân, cần thêm `proxy_no_cache $http_authorization;`.' },
  { q: '`proxy_cache_use_stale error timeout updating;` hữu ích khi nào?', opts: ['Khi muốn xoá cache cũ', 'Khi ứng dụng sập hoặc quá chậm, Nginx vẫn trả bản cũ trong cache để khách thấy trang', 'Khi tăng tốc gzip', 'Khi đổi chứng chỉ'], ans: 1, why: 'Trả bản cũ (STALE) thay vì 502/504 là cách giữ site "sống" trong lúc sự cố ngắn.' },
  { q: 'Upstream có 3 máy cùng weight 1. Khách gọi 9 yêu cầu liên tiếp, 3 máy đều sống. Mỗi máy nhận bao nhiêu (round robin)?', opts: ['Máy đầu nhận hết', '3 yêu cầu mỗi máy', 'Ngẫu nhiên hoàn toàn', '9, 0, 0'], ans: 1, why: 'Round robin mặc định chia đều lần lượt. Tăng weight cho máy mạnh hơn để chia theo tỉ lệ.' },
  { q: 'Máy cổng 8888 được khai báo `server 127.0.0.1:8888 backup;`. Khi nào nó nhận yêu cầu?', opts: ['Luôn luôn một phần', 'Chỉ khi tất cả máy không phải backup đều không khả dụng', 'Chỉ khi ip_hash bật', 'Không bao giờ'], ans: 1, why: 'backup là phương án cuối cùng; nó đứng ngoài vòng chia tải bình thường.' },
  { q: 'Một trong ba bản sao chết, mọi cấu hình mặc định. Khách thấy gì?', opts: ['Cứ 3 yêu cầu có 1 lỗi 502', 'Vẫn 200: Nginx tự chuyển sang máy kế tiếp và ghi connect() failed vào error.log', 'Toàn bộ site sập', '504'], ans: 1, why: 'proxy_next_upstream mặc định (error timeout) giúp failover trong suốt. Chỉ khi nó bị tắt hay mọi máy chết khách mới thấy lỗi.' },
  { q: 'Điều kiện để `keepalive 16;` trong upstream thực sự phát huy?', opts: ['Chỉ cần dòng keepalive', 'Cần thêm `proxy_http_version 1.1;` và `proxy_set_header Connection "";`', 'Cần `ip_hash`', 'Cần bật gzip'], ans: 1, why: 'Mặc định proxy dùng HTTP/1.0 và gửi Connection: close nên kết nối bị đóng ngay.' },
  { q: 'Muốn chuyển hướng vĩnh viễn nhưng API cần giữ method POST của client. Mã nào phù hợp?', opts: ['301', '302', '308', '200'], ans: 2, why: '308 là bản "vĩnh viễn, giữ method" của 301; 307 là bản tạm thời giữ method.' },
  { q: 'Khối `server { listen 80; listen 443 ssl; ... return 301 https://$host$request_uri; }` gây ra điều gì?', opts: ['Chuyển http sang https đúng', 'Vòng lặp chuyển hướng vô hạn, vì cả yêu cầu https cũng bị chuyển về https', 'Lỗi cú pháp', 'Chuyển sang www'], ans: 1, why: 'Return nằm ở cấp server nên áp dụng cho cả hai cổng. Tách khối 80 (redirect) và khối 443 (phục vụ).' },
  { q: 'Khác biệt giữa `return 301 https://tutor.haiphan.org;` và `return 301 https://tutor.haiphan.org$request_uri;` khi khách vào `www.tutor.haiphan.org/courses/12?x=1`?', opts: ['Không khác', 'Cách đầu đưa về trang chủ, cách sau giữ `/courses/12?x=1`', 'Cách sau bị lỗi', 'Cách đầu giữ query còn cách sau thì không'], ans: 1, why: 'Thiếu $request_uri làm mọi liên kết sâu mất đường dẫn: tệ cho người dùng và SEO.' },
  { q: 'Cloudflare ở chế độ Flexible, origin có `return 301 https://$host$request_uri;` cho cổng 80. Điều gì xảy ra?', opts: ['Chạy tốt', 'Vòng lặp: Cloudflare luôn gọi origin bằng http, origin luôn chuyển sang https, Cloudflare lại gọi http', 'Cloudflare tự sửa', 'Chỉ lỗi 522'], ans: 1, why: 'Flexible nghĩa là biên→origin đi bằng http. Dùng Full (strict) hoặc bỏ redirect ở origin cho kết nối từ Cloudflare.' }
];

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, {}); },
  items: [
    { text: 'Xem header của app.js khi khách hỗ trợ gzip: chưa có Content-Encoding, chưa có Cache-Control', hint: 'curl -sI -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/app.js', check: R(/curl -sI .*Accept-Encoding: gzip.*assets\/app\.js/) },
    { text: 'Đo số byte thực tế tải về của app.js', hint: 'curl -s -o /dev/null -w "%{size_download}\\n" -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/app.js', check: R(/size_download.*assets\/app\.js/) },
    { text: 'Tạo file gzip.conf cấp http (cố ý chưa có application/javascript)', hint: SU('/etc/nginx/conf.d/gzip.conf', GZ1), check: function (s) { return /gzip on;/.test(txt(s, '/etc/nginx/conf.d/gzip.conf')); } },
    { text: 'Kiểm tra cú pháp rồi nạp lại', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var g = dirOf(s, 'gzip'); return !!g && g[0] === 'on'; }, transient: true },
    { text: 'Thử lại app.js: vẫn không được nén vì thiếu loại JS', hint: 'curl -sI -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/app.js', check: function (s) { return cnt(s, /curl -sI .*Accept-Encoding: gzip.*assets\/app\.js/) >= 2; } },
    { text: 'Thử style.css: được nén (Content-Encoding: gzip, Vary)', hint: 'curl -sI -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/style.css', check: R(/Accept-Encoding: gzip.*assets\/style\.css/) },
    { text: 'Bổ sung application/javascript và image/svg+xml vào gzip_types', hint: "sudo sed -i 's#gzip_types text/css application/json;#gzip_types text/css application/javascript application/json image/svg+xml;#' /etc/nginx/conf.d/gzip.conf", check: function (s) { return /application\/javascript/.test(txt(s, '/etc/nginx/conf.d/gzip.conf')); } },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var g = dirOf(s, 'gzip_types'); return !!g && g.indexOf('application/javascript') >= 0; } },
    { text: 'Đo lại số byte của app.js: nhỏ đi rõ rệt', hint: 'curl -s -o /dev/null -w "%{size_download}\\n" -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/app.js', check: function (s) { return cnt(s, /size_download.*assets\/app\.js/) >= 2; } },
    { text: 'Ảnh PNG không nên nén: kiểm tra logo.png không có Content-Encoding', hint: 'curl -sI -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/logo.png', check: R(/Accept-Encoding: gzip.*assets\/logo\.png/) },

    { text: 'Bật cache trình duyệt 30 ngày cho /assets/ (viết lại site tutor)', hint: SU('/etc/nginx/sites-available/tutor.haiphan.org', TUT_EXP), check: function (s) { return /expires 30d;/.test(txt(s, '/etc/nginx/sites-available/tutor.haiphan.org')); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return locDir(s, TUT, '/assets/', 'expires') === '30d'; }, transient: true },
    { text: 'Xem header app.js: đã có Cache-Control: max-age, ETag, Last-Modified', hint: 'curl -sI http://tutor.haiphan.org/assets/app.js', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/assets\/app\.js/) },
    { text: 'Hỏi có bản mới không bằng If-None-Match (ETag của app.js là "6713c7a0-ea60"): nhận 304', hint: "curl -sI -H 'If-None-Match: \"6713c7a0-ea60\"' http://tutor.haiphan.org/assets/app.js", check: R(/If-None-Match.*6713c7a0-ea60/) },

    { text: 'Khai báo vùng cache api_cache (cấp http)', hint: SU('/etc/nginx/conf.d/cache.conf', CACHE_CONF), check: function (s) { return /keys_zone=api_cache/.test(txt(s, '/etc/nginx/conf.d/cache.conf')); } },
    { text: 'Bật proxy_cache 30 giây cho /api/ và thêm header X-Cache-Status', hint: SU('/etc/nginx/sites-available/api-tutor.haiphan.org', API_CACHE), check: function (s) { return /proxy_cache api_cache;/.test(txt(s, '/etc/nginx/sites-available/api-tutor.haiphan.org')); }, transient: true },
    { text: 'Kiểm tra cú pháp rồi nạp lại', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return locDir(s, API, '/api/', 'proxy_cache') === 'api_cache'; }, transient: true },
    { text: 'Lần gọi đầu /api/courses: X-Cache-Status: MISS', hint: 'curl -si http://api-tutor.haiphan.org/api/courses', check: R(/curl -si http:\/\/api-tutor\.haiphan\.org\/api\/courses/) },
    { text: 'Lần hai: HIT, ứng dụng không bị gọi', hint: 'curl -si http://api-tutor.haiphan.org/api/courses', check: function (s) { return cnt(s, /curl -si http:\/\/api-tutor\.haiphan\.org\/api\/courses/) >= 2; } },
    { text: 'Chờ 31 giây cho cache hết hạn', hint: 'sleep 31', check: R(/sleep 3\d/) },
    { text: 'Gọi lại: EXPIRED, Nginx làm mới bản lưu', hint: 'curl -si http://api-tutor.haiphan.org/api/courses', check: function (s) { return cnt(s, /curl -si http:\/\/api-tutor\.haiphan\.org\/api\/courses/) >= 3; } },
    { text: 'Xem các file cache trên đĩa', hint: 'sudo find /var/cache/nginx -type f', check: R(/find \/var\/cache\/nginx/) },
    { text: 'Cho phép dùng bản cũ khi ứng dụng lỗi (proxy_cache_use_stale)', hint: SU('/etc/nginx/sites-available/api-tutor.haiphan.org', API_STALE), check: function (s) { return /proxy_cache_use_stale/.test(txt(s, '/etc/nginx/sites-available/api-tutor.haiphan.org')); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return !!locDir(s, API, '/api/', 'proxy_cache_use_stale'); }, transient: true },
    { text: 'Chờ cache hết hạn rồi làm nóng lại cache', hint: 'sleep 31', check: function (s) { return cnt(s, /sleep 3\d/) >= 2; } },
    { text: 'Gọi để lưu bản mới', hint: 'curl -si http://api-tutor.haiphan.org/api/courses', check: function (s) { return cnt(s, /curl -si http:\/\/api-tutor\.haiphan\.org\/api\/courses/) >= 4; } },
    { text: 'Giả lập sự cố: dừng ứng dụng API chính', hint: 'pm2 stop api', check: function (s) { return !!s.W.pm2.api && s.W.pm2.api.status === 'stopped'; }, transient: true },
    { text: 'Chờ cache hết hạn trong lúc ứng dụng chết', hint: 'sleep 31', check: function (s) { return cnt(s, /sleep 3\d/) >= 3; } },
    { text: 'Gọi /api/courses: vẫn 200 với X-Cache-Status: STALE', hint: 'curl -si http://api-tutor.haiphan.org/api/courses', check: function (s) { return cnt(s, /curl -si http:\/\/api-tutor\.haiphan\.org\/api\/courses/) >= 5; } },
    { text: 'Endpoint chưa có trong cache (/api/users) thì 502 như thường', hint: 'curl -si http://api-tutor.haiphan.org/api/users', check: R(/curl -si http:\/\/api-tutor\.haiphan\.org\/api\/users/) },
    { text: 'Khởi động lại ứng dụng', hint: 'pm2 start api', check: function (s) { return !!s.W.pm2.api && s.W.pm2.api.status === 'online'; } },

    { text: 'Khai báo nhóm api_pool với ba bản sao (8881, 8882, 8883)', hint: SU('/etc/nginx/conf.d/api-pool.conf', POOL1), check: function (s) { return /upstream api_pool/.test(txt(s, '/etc/nginx/conf.d/api-pool.conf')); }, transient: true },
    { text: 'Chuyển site API sang dùng nhóm, thêm keepalive và header X-Upstream', hint: SU('/etc/nginx/sites-available/api-tutor.haiphan.org', API_POOL), check: function (s) { return /proxy_pass http:\/\/api_pool;/.test(txt(s, '/etc/nginx/sites-available/api-tutor.haiphan.org')); } },
    { text: 'Kiểm tra cú pháp rồi nạp lại', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return !!upstream(s, 'api_pool') && /^http:\/\/api_pool$/.test(locDir(s, API, '/api/', 'proxy_pass') || ''); }, transient: true },
    { text: 'Gửi 12 yêu cầu và đếm theo máy phục vụ: chia đều', hint: 'seq 12 | xargs -I{} curl -si http://api-tutor.haiphan.org/api/users | grep X-Upstream | sort | uniq -c', check: R(/xargs .*curl -si http:\/\/api-tutor\.haiphan\.org\/api\/users/) },
    { text: 'Đổi sang trọng số: máy 8881 nhận gấp ba, thêm 8888 làm backup', hint: SU('/etc/nginx/conf.d/api-pool.conf', POOL2), check: function (s) { return /weight=3/.test(txt(s, '/etc/nginx/conf.d/api-pool.conf')); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var u = upstream(s, 'api_pool'); return !!u && u.servers[0].weight === 3; }, transient: true },
    { text: 'Đếm lại: tỉ lệ khoảng 3:1:1, máy backup không nhận gì', hint: 'seq 12 | xargs -I{} curl -si http://api-tutor.haiphan.org/api/users | grep X-Upstream | sort | uniq -c', check: function (s) { return cnt(s, /xargs .*curl -si http:\/\/api-tutor\.haiphan\.org\/api\/users/) >= 2; } },
    { text: 'Giả lập một bản sao chết: dừng api-2', hint: 'pm2 stop api-2', check: function (s) { return !!s.W.pm2['api-2'] && s.W.pm2['api-2'].status === 'stopped'; }, transient: true },
    { text: 'Gửi 12 yêu cầu: khách vẫn nhận 200, Nginx tự bỏ qua máy chết', hint: 'seq 12 | xargs -I{} curl -si http://api-tutor.haiphan.org/api/users | grep X-Upstream | sort | uniq -c', check: function (s) { return cnt(s, /xargs .*curl -si http:\/\/api-tutor\.haiphan\.org\/api\/users/) >= 3; } },
    { text: 'Xem dấu vết trong error.log: connect() failed tới cổng 8882', hint: 'sudo tail -n 3 /var/log/nginx/error.log', check: R(/sudo tail .*error\.log/) },
    { text: 'Khởi động lại api-2', hint: 'pm2 start api-2', check: function (s) { return !!s.W.pm2['api-2'] && s.W.pm2['api-2'].status === 'online'; } },
    { text: 'Dùng ip_hash: cùng một khách luôn vào cùng một máy', hint: SU('/etc/nginx/conf.d/api-pool.conf', POOL3), check: function (s) { return /ip_hash;/.test(txt(s, '/etc/nginx/conf.d/api-pool.conf')); } },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var u = upstream(s, 'api_pool'); return !!u && u.method === 'ip_hash'; } },
    { text: 'Đếm lại: tất cả vào một máy duy nhất', hint: 'seq 12 | xargs -I{} curl -si http://api-tutor.haiphan.org/api/users | grep X-Upstream | sort | uniq -c', check: function (s) { return cnt(s, /xargs .*curl -si http:\/\/api-tutor\.haiphan\.org\/api\/users/) >= 4; } },

    { text: 'Hiện trạng chuyển hướng: http và https đều trả thẳng 200', hint: 'curl -sI http://tutor.haiphan.org/courses/12', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/courses\/12/) },
    { text: 'Viết lại site: khối 80 chuyển hướng, www trên 443 chuyển về tên gốc, khối 443 phục vụ', hint: SU('/etc/nginx/sites-available/tutor.haiphan.org', TUT_REDIR), check: function (s) { return /return 301 https:\/\/tutor\.haiphan\.org\$request_uri;/.test(txt(s, '/etc/nginx/sites-available/tutor.haiphan.org')); } },
    { text: 'Kiểm tra cú pháp rồi nạp lại', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var l = live(s); return !!l && l.servers.some(function (sv) { return sv.names.indexOf(TUT) >= 0 && sv.listens.every(function (x) { return x.port === 443; }); }); } },
    { text: 'http với đường dẫn và query: 301 Location giữ nguyên /courses/12?x=1', hint: 'curl -sI "http://tutor.haiphan.org/courses/12?x=1"', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/courses\/12\?x=1/) },
    { text: 'www qua http: chỉ một bước tới địa chỉ chuẩn', hint: 'curl -sI http://www.tutor.haiphan.org/courses/12', check: R(/curl -sI http:\/\/www\.tutor\.haiphan\.org\/courses\/12/) },
    { text: 'Theo hết chuỗi chuyển hướng (-L) từ www qua http', hint: 'curl -sIL http://www.tutor.haiphan.org/courses/12', check: R(/curl -sIL http:\/\/www\.tutor\.haiphan\.org\/courses\/12/) },
    { text: 'Chỉ in mã trạng thái của trang gốc qua http', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" http://tutor.haiphan.org/', check: R(/-w %\{http_code\}.*http:\/\/tutor\.haiphan\.org\/$/) },
    { text: 'Trang https chuẩn phục vụ bình thường (200)', hint: 'curl -sI https://tutor.haiphan.org/', check: R(/curl -sI https:\/\/tutor\.haiphan\.org\/$/) }
  ]
};

D.debugs = [
  {
    id: 'c3c1', title: 'Bật chuyển hướng https xong: ERR_TOO_MANY_REDIRECTS',
    host: 'vps', user: 'haidangphan',
    symptom: L('Sau khi thêm dòng chuyển hướng sang https:', '', '$ curl -sIL http://tutor.haiphan.org/', 'curl: (47) Maximum (50) redirects followed', '', 'Trình duyệt báo ERR_TOO_MANY_REDIRECTS. Chứng chỉ SSL vẫn hợp lệ, ứng dụng vẫn chạy.'),
    story: 'Bạn muốn mọi truy cập http đều sang https nên đã thêm một dòng return vào site. Từ đó cả http và https đều không vào được. Xem chuỗi Location, tìm xem dòng đó nằm ở đâu và áp dụng cho cổng nào.',
    goal: 'http://tutor.haiphan.org/ trả 301 tới https; https://tutor.haiphan.org/ trả 200 với nội dung ứng dụng.',
    hints: ['`curl -sI https://tutor.haiphan.org/` cũng trả 301 với `Location: https://tutor.haiphan.org/`: chính địa chỉ https bị chuyển về chính nó.', '`cat /etc/nginx/sites-available/tutor.haiphan.org`: khối `server` nghe **cả** `listen 80` và `listen 443 ssl`, mà `return 301 ...` ở cấp server áp dụng cho cả hai.', 'Tách thành hai khối: khối `listen 80` chỉ có `return 301 https://$host$request_uri;`, khối `listen 443 ssl` có chứng chỉ, `root`, `location /`. Rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['curl -sI https://tutor.haiphan.org/', 'cat /etc/nginx/sites-available/tutor.haiphan.org', SU('/etc/nginx/sites-available/tutor.haiphan.org', ['server {', '    listen 80;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}']), 'sudo nginx -t && sudo systemctl reload nginx', 'curl -sIL http://tutor.haiphan.org/'],
    cause: 'Chỉ thị `return` ở cấp `server` áp dụng cho mọi cổng mà khối đó nghe. Khối nghe cả 80 và 443 nên yêu cầu https cũng bị chuyển về https, lặp vô hạn. Quy tắc: khối nghe cổng 80 chỉ để chuyển hướng, khối nghe 443 mới phục vụ nội dung.',
    setup: function (s) { B.base(s, { sites: { 'tutor.haiphan.org': TUT_LOOP.join('\n') + '\n' } }); },
    check: function (s) { var a = request(s, 'http', TUT, '/'), b = request(s, 'https', TUT, '/'); return a.kind === 'resp' && a.status === 301 && /^https:\/\//.test(a.loc || '') && b.kind === 'resp' && b.status === 200; }
  },
  {
    id: 'c3c2', title: 'Chuyển hướng www xong, mọi liên kết sâu về trang chủ',
    host: 'vps', user: 'haidangphan',
    symptom: L('Khách bấm liên kết đã chia sẻ trước đây:', '', '$ curl -sI "http://www.tutor.haiphan.org/courses/12?ref=zalo"', 'HTTP/1.1 301 Moved Permanently', 'Location: https://tutor.haiphan.org', '', 'Mọi liên kết có www đều rơi về trang chủ, Google Search Console báo hàng trăm trang "đã chuyển hướng".'),
    story: 'Cấu hình chuyển hướng www về tên gốc chạy đúng về mặt kỹ thuật: tên miền chuẩn, https đầy đủ. Nhưng khách mất đường dẫn họ muốn vào. Sửa sao cho đường dẫn và query được giữ nguyên, không đổi mã 301.',
    goal: 'Cả http và https của www.tutor.haiphan.org/courses/12?ref=zalo chuyển 301 tới https://tutor.haiphan.org/courses/12?ref=zalo trong một bước.',
    hints: ['Nhìn kỹ `Location:` của lệnh curl: có tên miền nhưng thiếu đường dẫn và query.', '`grep -n "return 301" /etc/nginx/sites-available/tutor.haiphan.org`: dòng đích kết thúc ngay sau tên miền.', 'Thêm `$request_uri` vào sau tên miền (ở **mọi** dòng `return 301 https://tutor.haiphan.org;`), rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['curl -sI "http://www.tutor.haiphan.org/courses/12?ref=zalo"', 'grep -n "return 301" /etc/nginx/sites-available/tutor.haiphan.org', "sudo sed -i 's#return 301 https://tutor.haiphan.org;#return 301 https://tutor.haiphan.org$request_uri;#' /etc/nginx/sites-available/tutor.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx', 'curl -sI "http://www.tutor.haiphan.org/courses/12?ref=zalo"'],
    cause: '`$request_uri` chứa đường dẫn và chuỗi query gốc; không đưa vào đích chuyển hướng thì Nginx chỉ gửi khách tới trang chủ của tên miền chuẩn. Có hai chỗ cần sửa (khối 80 chung và khối www trên 443). Kiểm tra bằng cách chạy curl trên cả http và https của biến thể www.',
    setup: function (s) { B.base(s, { sites: { 'tutor.haiphan.org': tutRedirect('return 301 https://tutor.haiphan.org;').join('\n') + '\n' } }); },
    check: function (s) { var want = 'https://tutor.haiphan.org/courses/12?ref=zalo', a = request(s, 'http', WWW, '/courses/12?ref=zalo'), b = request(s, 'https', WWW, '/courses/12?ref=zalo'); return a.kind === 'resp' && a.status === 301 && a.loc === want && b.kind === 'resp' && b.status === 301 && b.loc === want; }
  },
  {
    id: 'c3c3', title: 'Lighthouse: "Enable text compression" dù đã bật gzip',
    host: 'vps', user: 'haidangphan',
    symptom: L('Báo cáo Lighthouse của tutor.haiphan.org:', '', '  Enable text compression', '  /assets/app.js   60 KiB   tiết kiệm tiềm năng 43 KiB', '', 'Đã có file /etc/nginx/conf.d/gzip.conf với "gzip on;". CSS thì nhỏ rồi nhưng JS vẫn nguyên.'),
    story: 'Gzip đã bật nhưng chỉ một phần tài nguyên được nén. Đừng tin cấu hình: hãy kiểm tra bằng header thật cho từng loại file, rồi sửa đúng chỗ.',
    goal: 'app.js (khi khách gửi Accept-Encoding: gzip) có Content-Encoding: gzip; style.css vẫn được nén; ảnh PNG không bị nén.',
    hints: ['`curl -sI -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/app.js` rồi lặp lại với `style.css` và `logo.png` để so sánh `Content-Encoding`.', '`cat /etc/nginx/conf.d/gzip.conf`: so danh sách `gzip_types` với `Content-Type` của app.js (`application/javascript`).', 'Thêm `application/javascript` (và `application/json image/svg+xml`) vào `gzip_types`, không thêm `image/png`; `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['curl -sI -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/app.js', 'cat /etc/nginx/conf.d/gzip.conf', "sudo sed -i 's#gzip_types text/css;#gzip_types text/css application/javascript application/json image/svg+xml;#' /etc/nginx/conf.d/gzip.conf", 'sudo nginx -t && sudo systemctl reload nginx', 'curl -sI -H "Accept-Encoding: gzip" http://tutor.haiphan.org/assets/app.js'],
    cause: 'Ngoài `text/html`, Nginx chỉ nén các MIME type có trong `gzip_types`. File conf chỉ liệt kê `text/css` nên JavaScript (loại lớn nhất) không được nén. Kiểm tra từng loại file bằng `Content-Type` và `Content-Encoding` thay vì chỉ nhìn `gzip on`. Không thêm ảnh nhị phân vì chúng đã được nén.',
    setup: function (s) { B.base(s, { conf: { 'gzip.conf': ['gzip on;', 'gzip_min_length 256;', 'gzip_comp_level 5;', 'gzip_vary on;', 'gzip_types text/css;'].join('\n') + '\n' } }); },
    check: function (s) {
      var h = { 'accept-encoding': 'gzip' }, js = request(s, 'http', TUT, '/assets/app.js', h), css = request(s, 'http', TUT, '/assets/style.css', h), png = request(s, 'http', TUT, '/assets/logo.png', h);
      return js.kind === 'resp' && hasHdr(js, 'Content-Encoding', /gzip/) && css.kind === 'resp' && hasHdr(css, 'Content-Encoding', /gzip/) && png.kind === 'resp' && !hasHdr(png, 'Content-Encoding');
    }
  },
  {
    id: 'c3c4', title: 'Cứ vài yêu cầu API lại có một lỗi 502 ngẫu nhiên',
    host: 'vps', user: 'haidangphan',
    symptom: L('Frontend thỉnh thoảng báo "Không tải được dữ liệu" rồi F5 lại ổn.', '', '$ for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " http://api-tutor.haiphan.org/api/users; done', '200 200 502 200 200 502', '', 'Đã có 3 bản sao API sau nhóm api_pool. Không ai deploy gì hôm nay.'),
    story: 'Quy luật "cứ 3 yêu cầu có 1 lỗi" gợi ý chính xác một trong ba bản sao có vấn đề, nhưng bình thường Nginx tự bỏ qua bản chết và khách không thấy gì. Tìm xem bản nào hỏng và vì sao Nginx không che được lỗi đó.',
    goal: '6 yêu cầu liên tiếp tới /api/users đều trả 200.',
    hints: ['`pm2 list` xem trạng thái các bản sao, và `sudo tail -n 5 /var/log/nginx/error.log` xem `connect() failed` tới cổng nào.', 'Failover tự động nhờ `proxy_next_upstream` (mặc định `error timeout`). `grep -n proxy_next_upstream /etc/nginx/sites-available/api-tutor.haiphan.org` xem có ai tắt nó không.', 'Bỏ dòng `proxy_next_upstream off;` rồi reload (cách chữa bền vững), và nên khởi động lại bản sao chết: `pm2 start api-3`.'],
    fix: ['pm2 list', 'sudo tail -n 3 /var/log/nginx/error.log', 'grep -n proxy_next_upstream /etc/nginx/sites-available/api-tutor.haiphan.org', "sudo sed -i '/proxy_next_upstream off;/d' /etc/nginx/sites-available/api-tutor.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx', 'pm2 start api-3'],
    cause: 'Bản sao api-3 (cổng 8883) đã dừng. Với cấu hình mặc định Nginx ghi `connect() failed` rồi thử máy kế tiếp nên khách không thấy lỗi. Ai đó đặt `proxy_next_upstream off;` nên mỗi lần round robin chọn trúng máy chết khách nhận ngay 502, đúng nhịp 1 trên 3. Chữa: bỏ dòng tắt failover và khởi động lại bản sao hỏng; đồng thời theo dõi error.log để biết có máy đang chết dù khách không thấy lỗi.',
    setup: function (s) { B.base(s, { conf: { 'api-pool.conf': POOL1.join('\n') + '\n' }, sites: { 'api-tutor.haiphan.org': apiPool(['        proxy_next_upstream off;']).join('\n') + '\n' } }); s.W.pm2['api-3'].status = 'stopped'; V.ngReload(s, false); },
    check: function (s) { for (var i = 0; i < 6; i++) if (st(s, 'http', API, '/api/users') !== 200) return false; return true; }
  },
  {
    id: 'c3c5', hard: true, title: 'Bật cache cho API xong, người dùng này thấy tài khoản của người khác',
    host: 'vps', user: 'haidangphan',
    symptom: L('Sáng nay hai học viên báo: "Em đăng nhập nhưng trang hiện tên bạn khác".', '', '$ curl -s -H "Authorization: Bearer bob" http://api-tutor.haiphan.org/api/me', '{"user":"alice","instance":8888}', '', 'Lỗi chỉ xuất hiện sau khi bật proxy_cache cho /api/ để giảm tải. Endpoint danh sách khoá học cache vẫn rất hiệu quả.'),
    story: 'Không có gợi ý chi tiết. Đây là sự cố rò rỉ dữ liệu: ưu tiên chặn rò rỉ ngay. Nhưng đừng tắt toàn bộ cache: /api/courses vẫn phải được cache (HIT). Tìm cách để endpoint cá nhân không bao giờ dùng chung cache giữa người dùng.',
    goal: 'Gọi /api/me với Authorization khác nhau trả đúng người của mình; /api/courses vẫn được lưu và phục vụ từ cache.',
    hints: ['Gọi `/api/me` hai lần với hai token khác nhau và so sánh header `X-Cache-Status` cùng nội dung. Khoá cache mặc định gồm những gì?', 'Khoá mặc định là `$scheme$host$request_uri`: không có danh tính. Có ba hướng: bỏ qua cache khi có Authorization (`proxy_cache_bypass`, `proxy_no_cache`), đưa Authorization vào `proxy_cache_key`, hoặc tách `location = /api/me` không dùng cache.', 'Thêm `proxy_cache_bypass $http_authorization;` và `proxy_no_cache $http_authorization;` vào location `/api/`, reload và thử lại bằng cả hai token. Nhớ rằng bản đã lưu trong cache cũ có thể còn sót.'],
    fix: ['curl -si -H "Authorization: Bearer bob" http://api-tutor.haiphan.org/api/me', 'grep -n proxy_cache /etc/nginx/sites-available/api-tutor.haiphan.org', SU('/etc/nginx/sites-available/api-tutor.haiphan.org', apiCache(['        proxy_cache_bypass $http_authorization;', '        proxy_no_cache $http_authorization;'])), 'sudo nginx -t && sudo systemctl reload nginx', 'curl -si -H "Authorization: Bearer bob" http://api-tutor.haiphan.org/api/me', 'curl -si http://api-tutor.haiphan.org/api/courses', 'curl -si http://api-tutor.haiphan.org/api/courses'],
    cause: 'Khoá cache mặc định là scheme + host + URI nên `/api/me` của người gọi đầu tiên được lưu và trả lại cho mọi người dùng trong thời hạn `proxy_cache_valid`. Cách chữa an toàn: `proxy_cache_bypass $http_authorization;` (không đọc cache) cùng `proxy_no_cache $http_authorization;` (không lưu) để mọi yêu cầu có đăng nhập đi thẳng ứng dụng, trong khi yêu cầu công khai như `/api/courses` vẫn được cache. Cũng có thể đưa token vào `proxy_cache_key` hoặc tách location riêng cho endpoint cá nhân. Sau sự cố nên rà soát mọi endpoint phụ thuộc người dùng và cân nhắc xoá cache cũ.',
    setup: function (s) {
      B.base(s, { conf: { 'cache.conf': CACHE_CONF.join('\n') + '\n' }, sites: { 'api-tutor.haiphan.org': apiCache().join('\n').replace('valid 200 30s', 'valid 200 10m') + '\n' } });
      var W = s.W, sv = W.ngx2req; W.ngx2req = { authorization: 'Bearer alice' }; V.ngReq(s, 'http', API, 80, '/api/me'); W.ngx2req = sv;
    },
    check: function (s) {
      var a = request(s, 'http', API, '/api/me', { authorization: 'Bearer alice' }), b = request(s, 'http', API, '/api/me', { authorization: 'Bearer bob' });
      if (a.kind !== 'resp' || b.kind !== 'resp' || !/"user":"alice"/.test(a.body || '') || !/"user":"bob"/.test(b.body || '')) return false;
      request(s, 'http', API, '/api/courses'); var c2 = request(s, 'http', API, '/api/courses');
      return c2.kind === 'resp' && hasHdr(c2, 'X-Cache-Status', /^HIT$/);
    }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
