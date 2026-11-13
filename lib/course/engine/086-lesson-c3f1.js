(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.NGF;
function R(re) { return function (s) { return ran(s, re); }; }
function RF(re) { return function (s) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function SU(path, ls) { return 'sudo tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function live(s) { return s.W.nginx && s.W.nginx.active ? s.W.nginx.live : null; }
function liveSrv(s, name) { var l = live(s); return l ? l.servers.filter(function (x) { return x.names.indexOf(name) >= 0; })[0] : null; }
function liveLoc(s, name, path) { var sv = liveSrv(s, name); return sv ? sv.locs.filter(function (l) { return l.path === path; })[0] : null; }
function locDir(s, name, path, d) { var l = liveLoc(s, name, path); if (!l) return null; var f = l.stmts.filter(function (x) { return x.name === d; })[0]; return f ? f.args.join(' ') : null; }
function srvDirs(s, d) { var sv = liveSrv(s, TUT); return sv ? sv.stmts.filter(function (x) { return x.name === d; }) : []; }
function request(s, scheme, host, path, headers, meta, port, ip) {
  var W = s.W, sv = W.ngx2req, sm = W.ngx2meta, sc = W.nginx.clientIp; W.ngx2req = headers || {}; W.ngx2meta = meta || null; if (ip) W.nginx.clientIp = ip;
  try { return V.ngReq(s, scheme, host, port || (scheme === 'https' ? 443 : 80), path); } catch (e) { return { kind: 'err' }; } finally { W.ngx2req = sv; W.ngx2meta = sm; W.nginx.clientIp = sc; }
}
function st(s, scheme, host, path, h, ip) { var r = request(s, scheme, host, path, h, null, null, ip); return r.kind === 'resp' ? r.status : (r.kind === 'empty' ? 0 : -1); }
function hdr(r, name) { var a = (r.adds || []).filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0]; return a ? a.value : null; }
var TUT = 'tutor.haiphan.org', SITE = '/etc/nginx/sites-available/tutor.haiphan.org', RELOAD = 'sudo nginx -t && sudo systemctl reload nginx', NGX = '/etc/nginx/nginx.conf', SNIP = '/etc/nginx/snippets/proxy-common.conf';
function cfg(o) { return B.site(o); }
function J(a) { return a.join('\n') + '\n'; }
function dropLine(a, re) { return a.filter(function (l) { return !re.test(l); }); }

/* conf.d và nginx.conf dùng trong chương */
var JSON_FMT = ['log_format json escape=json \'{"time":"$time_iso8601","remote_addr":"$remote_addr","request_id":"$request_id","method":"$request_method","uri":"$request_uri","status":"$status","bytes":$body_bytes_sent,"request_time":$request_time,"upstream_time":"$upstream_response_time","ua":"$http_user_agent"}\';'];
var JSON_BAD = ['log_format json \'{"time":"$time_iso8601","request_id":"$request_id","method":"$request_method","uri":"$request_uri","status":"$status","ua":"$http_user_agent"}\';'];
var CACHE_CONF = ['proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m use_temp_path=off;'];
var LIMIT_CONF = ['limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;'];
function NGXCONF(o) {
  o = o || {};
  return ['user www-data;', 'worker_processes auto;'].concat(o.rl ? ['worker_rlimit_nofile ' + o.rl + ';'] : [], ['error_log /var/log/nginx/error.log;', 'events {', '    worker_connections ' + (o.conns || 768) + ';'], o.dbg ? ['    debug_connection 192.0.2.7;'] : [], ['}', 'http {', '    access_log /var/log/nginx/access.log;', '    include /etc/nginx/conf.d/*.conf;', '    include /etc/nginx/sites-enabled/*;', '}']);
}

var F = {};
F.snip = { snippets: true };
F.stat = Object.assign({}, F.snip, { status: 'local' });
F.json = Object.assign({}, F.stat, { log: 'json' });
F.rid = Object.assign({}, F.json, { reqid: true });
F.lim1 = Object.assign({}, F.rid, { limit: 1 });
F.lim2 = Object.assign({}, F.rid, { limit: 2 });
F.lim3 = Object.assign({}, F.rid, { limit: 3 });
F.c1 = Object.assign({}, F.lim3, { cache: 1 });
F.c2 = Object.assign({}, F.lim3, { cache: 2 });
F.h2 = Object.assign({}, F.c2, { h2: true });
F.hsts = Object.assign({}, F.h2, { hsts: true });

var D = { id: 'c3f', group: 'Web server', short: 'Nginx (6): vận hành và giám sát', title: 'Nginx (6): vận hành, giám sát và chẩn đoán', dek: 'Reload an toàn, snippets và sao lưu cấu hình, giới hạn kết nối và file mở, stub_status và log JSON, request ID xuyên suốt, giới hạn tốc độ có dry run, cache nâng cao, HTTP/2 và HSTS, và chẩn đoán sâu bằng debug_connection.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c3e') idx = i; });
C.lessons.splice(idx + 1, 0, D);

D.theory = [
  { tag: 'Khái niệm', title: 'reload, restart và bộ ba -t, -T, -V', body: [
    'Nginx có một tiến trình **master** (đọc cấu hình, quản lý worker) và các tiến trình **worker** (phục vụ yêu cầu). Mọi thao tác vận hành xoay quanh việc thay worker mà không làm rơi khách.',
    { tbl: [['Lệnh', 'Điều xảy ra', 'Dùng khi'], ['`nginx -t`', 'Chỉ kiểm tra cú pháp và tài nguyên (file cert, include), không đổi gì', '**Luôn chạy trước** mọi thay đổi'], ['`systemctl reload nginx` (`nginx -s reload`)', 'Master đọc lại cấu hình; nếu hợp lệ, sinh worker mới, worker cũ xử lý nốt yêu cầu đang dở rồi thoát. **Không rớt kết nối.** Cấu hình lỗi thì giữ nguyên bản cũ', 'Gần như mọi thay đổi cấu hình, gia hạn chứng chỉ'], ['`systemctl restart nginx`', 'Dừng hẳn rồi chạy lại: kết nối đang dở bị ngắt', 'Đổi tham số của master, sau khi nâng cấp gói, tiến trình bị treo'], ['`nginx -T`', 'Kiểm tra và **in toàn bộ** cấu hình đã gộp mọi `include`', 'Xem Nginx thực sự đang đọc gì, gửi cho người hỗ trợ'], ['`nginx -V`', 'In phiên bản và các tuỳ chọn biên dịch (`--with-http_stub_status_module`, `--with-debug`...)', 'Kiểm tra module có sẵn không']] },
    { pre: ['sudo nginx -t && sudo systemctl reload nginx     # thói quen chuẩn: -t lỗi thì && dừng, reload không chạy'], cap: 'Nếu -t thất bại, lệnh reload không bao giờ được gọi' },
    { ul: ['Vài chỉ thị chỉ có hiệu lực khi **restart**: `user`, `pid`, `worker_processes` đổi sâu (reload vẫn áp dụng được hầu hết), module nạp động. Cứ `reload` rồi kiểm tra; nếu không đổi thì mới restart.', 'Reload thành công nhưng "không thấy tác dụng": mở trang bằng `curl -I`, cache của trình duyệt hoặc Cloudflare thường là thủ phạm chứ không phải Nginx.', 'Khi `reload` báo lỗi, bản cấu hình cũ **vẫn chạy**: xem `journalctl -u nginx` hoặc chạy lại `nginx -t` để thấy dòng lỗi và số dòng.']}
  ] },
  { tag: 'Mẹo', title: 'Cấu hình gọn: snippets, include và sao lưu', body: [
    'Một khối `proxy_set_header` chép đi chép lại ở 6 location là mầm mống lỗi: sửa 5 chỗ, quên chỗ thứ sáu. Gom vào **snippet** rồi `include`.',
    { pre: ['# /etc/nginx/snippets/proxy-common.conf', 'proxy_set_header Host $host;', 'proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-Proto $scheme;', '', '# trong location', 'location /api/ {', '    proxy_pass http://127.0.0.1:8888;', '    include snippets/proxy-common.conf;', '}'], cap: 'Đường dẫn include tương đối tính từ /etc/nginx/' },
    { tbl: [['Thư mục', 'Vai trò'], ['`sites-available/`, `sites-enabled/`', 'Mỗi tên miền một file; `sites-enabled` chứa liên kết tới `available`'], ['`conf.d/*.conf`', 'Cấu hình cấp `http` dùng chung: `log_format`, `limit_req_zone`, `proxy_cache_path`, `map`'], ['`snippets/`', 'Mảnh dùng lại trong `server`/`location` (proxy headers, SSL, CORS, security headers)']] },
    { ul: ['Hai bẫy khi tách file: `include` của file không tồn tại làm `nginx -t` lỗi (đúng ý); và `add_header` trong snippet cũng chịu luật thừa kế như thường (xem phần HSTS).', 'Sao lưu trước khi sửa lớn: `sudo cp -a /etc/nginx /root/nginx.bak`. Tốt hơn: đưa `/etc/nginx` vào git hoặc dùng `etckeeper` để có lịch sử và biết ai đổi gì.', 'Đừng sửa trực tiếp file đang chạy khi chưa có `-t`: sửa, `nginx -t`, rồi mới reload.']}
  ] },
  { tag: 'Khái niệm', title: 'Giới hạn kết nối: worker_connections và file mở', body: [
    'Một "kết nối" Nginx dùng một **file descriptor**. Reverse proxy tốn nhiều hơn bạn nghĩ: mỗi yêu cầu cần một kết nối với khách **và** một kết nối với upstream.',
    { pre: ['worker_processes auto;            # bằng số nhân CPU', 'worker_rlimit_nofile 65535;       # trần số file mở của mỗi worker', 'events {', '    worker_connections 8192;  # số kết nối đồng thời của mỗi worker', '}'], cap: 'Trần số kết nối = worker_processes x worker_connections' },
    { tbl: [['Dấu hiệu trong error.log', 'Nghĩa là', 'Cách chữa'], ['`[alert] ... 768 worker_connections are not enough`', 'Worker hết chỗ nhận kết nối mới (mặc định gói Ubuntu: 768)', 'Tăng `worker_connections`'], ['`[crit] accept4() failed (24: Too many open files)`', 'Chạm trần file mở của tiến trình (mặc định 1024)', 'Tăng `worker_rlimit_nofile` (và `LimitNOFILE` của systemd nếu cần)']] },
    { ul: ['Quy tắc ngón tay cái: `worker_rlimit_nofile` ≥ **2 x** `worker_connections` (proxy dùng hai kết nối cho mỗi yêu cầu, cộng file tĩnh, log).', 'Số khách đồng thời thực tế của reverse proxy xấp xỉ `worker_processes x worker_connections / 2` (chưa tính keepalive tới upstream).', 'Kiểm tra giới hạn thật của worker: `cat /proc/PID/limits | grep "open files"`. Giới hạn của **master** là riêng và không đổi theo `worker_rlimit_nofile`.', 'Đừng chỉ nâng số: kiểm tra RAM, và `net.core.somaxconn`, `ulimit` của ứng dụng phía sau. Nâng trần không tạo ra thêm tài nguyên.']}
  ] },
  { tag: 'Cú pháp', title: 'stub_status: đồng hồ sức khoẻ của Nginx', body: [
    { pre: ['server {', '    listen 127.0.0.1:8080;      # chỉ lắng nghe loopback', '    server_name _;', '    location = /nginx_status {', '        stub_status;', '    }', '}'], cap: 'Đặt stub_status ở cổng nội bộ, không lộ ra Internet' },
    { pre: ['Active connections: 291', 'server accepts handled requests', ' 16630948 16630948 31070465', 'Reading: 6 Writing: 179 Waiting: 106'], cap: 'Đầu ra mẫu' },
    { tbl: [['Trường', 'Ý nghĩa'], ['Active connections', 'Kết nối đang mở, **gồm cả** Waiting'], ['accepts', 'Tổng kết nối đã nhận kể từ lúc khởi động'], ['handled', 'Tổng kết nối đã xử lý. **Bình thường bằng accepts**; nhỏ hơn nghĩa là Nginx đang từ chối vì chạm trần'], ['requests', 'Tổng yêu cầu. `requests / handled` = số yêu cầu trung bình mỗi kết nối (keepalive hiệu quả đến đâu)'], ['Reading', 'Đang đọc header yêu cầu'], ['Writing', 'Đang gửi phản hồi (kể cả chờ upstream)'], ['Waiting', 'Kết nối keepalive rảnh']] },
    { ul: ['Các bộ đếm là **cộng dồn**: muốn có tốc độ (yêu cầu/giây) phải lấy hiệu hai lần đo, việc mà Prometheus (`nginx-prometheus-exporter`) hay Netdata làm giúp.', 'Nếu bắt buộc đặt trong server công khai: `allow 127.0.0.1; deny all;` hoặc thêm `auth_basic`. Mở công khai làm lộ lưu lượng thật của bạn.', 'Cần module `--with-http_stub_status_module` (xem `nginx -V`; gói Ubuntu có sẵn).']}
  ] },
  { tag: 'Cú pháp', title: 'Log dạng JSON và các biến thời gian', body: [
    { pre: ['log_format json escape=json', '    \'{"time":"$time_iso8601","remote_addr":"$remote_addr",\'', '    \'"request_id":"$request_id","method":"$request_method",\'', '    \'"uri":"$request_uri","status":"$status","bytes":$body_bytes_sent,\'', '    \'"request_time":$request_time,"upstream_time":"$upstream_response_time",\'', '    \'"ua":"$http_user_agent"}\';', '', 'access_log /var/log/nginx/tutor.json.log json;'], cap: 'Các chuỗi liền kề được nối thành một dòng' },
    { ul: ['**`escape=json` là bắt buộc** khi log JSON. Không có nó, dấu `"` hoặc `\\` trong User-Agent hay URI bị đổi thành `\\x22` (kiểu "default"), JSON hỏng và công cụ như `jq` dừng giữa file.', 'Đọc nhanh bằng `jq`: `sudo tail -n 1 file | jq .`, lọc `jq -c \'select(.status=="502")\' file`, đếm `jq -s length file`.', 'Trường số (`$body_bytes_sent`, `$request_time`) để không có dấu nháy; trường có thể là `-` (`$upstream_response_time` khi không đi qua upstream) nên để dạng chuỗi.']},
    { tbl: [['Biến', 'Đo gì', 'Đọc thế nào'], ['`$request_time`', 'Từ byte đầu của yêu cầu tới khi gửi xong phản hồi (gồm cả mạng của khách)', 'Chậm do mạng khách hoặc file lớn'], ['`$upstream_connect_time`', 'Thời gian bắt tay TCP tới ứng dụng', 'Cao: mạng nội bộ, hết cổng, backlog'], ['`$upstream_header_time`', 'Tới khi nhận header đầu tiên từ ứng dụng', 'Cao: ứng dụng xử lý chậm'], ['`$upstream_response_time`', 'Tới khi nhận xong toàn bộ phản hồi', 'Trừ cho `header_time` ra thời gian truyền thân'], ['`$upstream_addr`, `$upstream_status`', 'Backend nào, mã gì (nhiều giá trị nếu thử lại)', 'Biết `proxy_next_upstream` đã chuyển sang đâu']] }
  ] },
  { tag: 'Mẹo', title: 'request_id: một mã đi suốt từ trình duyệt tới log ứng dụng', body: [
    'Nginx sinh `$request_id` là 32 ký tự hex ngẫu nhiên, **duy nhất cho mỗi yêu cầu**. Khi người dùng báo lỗi, đây là sợi dây nối mọi log lại.',
    { pre: ['server {', '    add_header X-Request-ID $request_id always;          # khách (và devtools) thấy mã', '    location /api/ {', '        proxy_set_header X-Request-ID $request_id;       # ứng dụng nhận và ghi vào log của nó', '        proxy_pass http://127.0.0.1:8888;', '    }', '}'] , cap: 'Ba nơi cùng chứa một mã: header trả về, log Nginx, log ứng dụng' },
    { ul: ['Đưa `$request_id` vào `log_format` của Nginx (xem log JSON ở trên) và để ứng dụng ghi `req.headers["x-request-id"]` vào mỗi dòng log.', 'Khi khách gửi ảnh chụp lỗi kèm `X-Request-ID`, bạn `grep` đúng mã đó trong log Nginx và log ứng dụng, thấy toàn bộ hành trình thay vì đoán theo giờ.', 'Nếu có proxy phía trước (Cloudflare, load balancer đã đặt sẵn `X-Request-ID`), dùng `$http_x_request_id` và chỉ sinh mới khi vắng: `map $http_x_request_id $req_id { default $http_x_request_id; "" $request_id; }`.']}
  ] },
  { tag: 'Mẹo', title: 'Đọc log bằng tay: triage trong 3 phút', body: [
    'Trước khi có Grafana, vài dòng `awk` cho bạn câu trả lời "có sự cố thật không" nhanh hơn mọi dashboard.',
    { pre: ['# phân phối mã trạng thái (cột 9 của định dạng combined)', "sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", '', '# tỉ lệ 5xx', "sudo awk '{t++; if ($9>=500) e++} END {printf \"%.1f%%\\n\", e*100/t}' /var/log/nginx/access.log", '', '# 3 IP nhiều yêu cầu nhất', "sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -n 3"], cap: 'Ba lệnh đáng thuộc lòng' },
    { tbl: [['Mã / dấu hiệu', 'Thường là', 'Xem tiếp'], ['502', 'Ứng dụng chết hoặc không nghe cổng', '`error.log` (connect() failed), `pm2 status`'], ['504', 'Ứng dụng quá chậm (`proxy_read_timeout`)', '`$upstream_response_time`, truy vấn DB'], ['499', 'Khách tự đóng kết nối trước khi có phản hồi', 'Nhiều 499 + `request_time` lớn: ứng dụng chậm, khách bỏ cuộc'], ['429 / 503 hàng loạt', 'Bị `limit_req` hoặc quá tải', 'error.log "limiting requests"'], ['Tăng đột biến một IP', 'Quét hoặc tấn công', '`fail2ban`, `limit_req`, chặn ở Cloudflare']] },
    { ul: ['Công cụ có sẵn hơn: `goaccess /var/log/nginx/access.log --log-format=COMBINED` cho báo cáo tương tác.', 'Lâu dài: gom log vào Loki hoặc ELK, đo bằng Prometheus. **Cảnh báo** nên đặt trên **tỉ lệ** (5xx / tổng > 1% trong 5 phút), thời gian upstream p95, số kết nối gần trần, chứng chỉ sắp hết hạn, đĩa `/var/log` đầy.']}
  ] },
  { tag: 'Khái niệm', title: 'Cache nâng cao: lock, stale, micro-caching và xoá cache', body: [
    'Kiến thức nền về `proxy_cache` đã học ở chương trước. Đây là bốn công cụ dùng khi tải thật tăng.',
    { tbl: [['Chỉ thị', 'Vấn đề giải quyết'], ['`proxy_cache_lock on;`', '**Cache stampede**: cache vừa hết hạn, 500 yêu cầu cùng lúc ập vào ứng dụng. Với lock, chỉ **một** yêu cầu đi lấy, số còn lại chờ (mặc định tối đa 5 giây)'], ['`proxy_cache_use_stale updating error timeout http_500 http_502 http_503;`', 'Trả bản cũ khi đang làm mới hoặc khi ứng dụng lỗi: khách ít thấy lỗi hơn'], ['`proxy_cache_background_update on;`', 'Làm mới ở nền; khách luôn nhận bản (có thể cũ) ngay lập tức'], ['`proxy_cache_valid 200 10s;`', '**Micro-caching**: cache vài giây cho endpoint công khai; hạ tải gấp trăm lần mà dữ liệu gần như thời gian thực']] },
    { pre: ['location /api/courses {', '    proxy_cache api_cache;', '    proxy_cache_valid 200 10s;', '    proxy_cache_lock on;', '    proxy_cache_use_stale updating error timeout http_500 http_502 http_503;', '    proxy_cache_background_update on;', '    add_header X-Cache-Status $upstream_cache_status always;', '    proxy_pass http://127.0.0.1:8888;', '}'], cap: 'Công thức micro-cache' },
    { ul: ['Trạng thái `$upstream_cache_status`: `MISS`, `HIT`, `EXPIRED`, `STALE` (bản cũ vì upstream lỗi), `UPDATING` (bản cũ trong lúc làm mới), `REVALIDATED`, `BYPASS`.', '**Không** cache response cá nhân hoá: khoá cache mặc định `$scheme$host$request_uri` không có danh tính. Dùng `proxy_cache_bypass $http_authorization;` và `proxy_no_cache $http_authorization;` hoặc đưa token vào `proxy_cache_key`.', '**Xoá cache**: Nginx bản mã nguồn mở **không có** lệnh purge (chỉ Nginx Plus). Cách làm: xoá file (`sudo find /var/cache/nginx -type f -delete`), đổi phiên bản trong khoá cache, hoặc cho một header riêng kích hoạt `proxy_cache_bypass` để làm mới từng URL.', 'Sau deploy có đổi dữ liệu, đừng để cache TTL dài làm khách thấy bản cũ hàng giờ: dùng TTL ngắn hoặc có bước xoá cache trong quy trình deploy.']}
  ] },
  { tag: 'Mẹo', title: 'Cloudflare và cache: ai cache cái gì', body: [
    'Khi tên miền đi qua Cloudflare, có **hai tầng cache**: Cloudflare (biên) và `proxy_cache` (máy chủ của bạn). Lỗi "vẫn thấy bản cũ" thường nằm ở tầng bạn không để ý.',
    { tbl: [['Nội dung', 'Cloudflare mặc định', 'Bạn điều khiển bằng'], ['File tĩnh (.js, .css, ảnh, font)', 'Cache theo đuôi file', '`Cache-Control: public, max-age=...` từ Nginx (`expires`)'], ['HTML và JSON API', '**Không cache** (trạng thái DYNAMIC)', 'Cache Rules ("cache everything") kèm `s-maxage`'], ['Có `Set-Cookie`', 'Thường bỏ qua cache', 'Đừng set cookie ở trang công khai']] },
    { ul: ['Đọc `CF-Cache-Status` trong header: `HIT`, `MISS`, `EXPIRED`, `DYNAMIC` (không đủ điều kiện cache), `BYPASS`. Cùng lúc xem `X-Cache-Status` của Nginx để biết tầng nào đang trả.', '`s-maxage` chỉ áp dụng cho cache chia sẻ (CDN); `max-age` cho cả trình duyệt. Đặt `Cache-Control: public, max-age=60, s-maxage=300` để trình duyệt giữ 1 phút còn CDN giữ 5 phút.', 'Xoá cache Cloudflare qua bảng điều khiển hoặc API ("Purge by URL/prefix"), tách biệt với việc xoá cache Nginx. File tĩnh có hash trong tên (`app.3f9a1c.js`) giúp khỏi cần purge.', 'Để Nginx thấy IP thật qua Cloudflare, dùng `set_real_ip_from` các dải của Cloudflare và `real_ip_header CF-Connecting-IP` (đã học ở chương trước).']}
  ] },
  { tag: 'Cú pháp', title: 'TLS hiện đại: HTTP/2, HTTP/3, session cache, OCSP, HSTS', body: [
    { tbl: [['Tính năng', 'Cấu hình', 'Lưu ý'], ['HTTP/2', '`listen 443 ssl http2;` (Nginx ≤ 1.25.0) hoặc `http2 on;` (≥ 1.25.1)', 'Dồn nhiều yêu cầu qua một kết nối; kiểm tra bằng `curl -sI --http2 https://...` thấy `HTTP/2 200`'], ['HTTP/3 (QUIC)', '`listen 443 quic reuseport;` cùng `listen 443 ssl;`, và `add_header Alt-Svc \'h3=":443"; ma=86400\';`', 'Cần Nginx ≥ 1.25 (Ubuntu 24.04 đóng gói 1.24 **chưa có**; dùng kho nginx.org). Chạy trên **UDP 443**: mở thêm trong ufw và nhóm bảo mật của VPS'], ['Session cache', '`ssl_session_cache shared:SSL:10m;` `ssl_session_timeout 1d;`', '1 MB khoảng 4000 phiên; khách quay lại bỏ qua bắt tay đầy đủ'], ['Giao thức', '`ssl_protocols TLSv1.2 TLSv1.3;`', 'TLS 1.0/1.1 đã bị khai tử'], ['OCSP stapling', '`ssl_stapling on; ssl_stapling_verify on;` cần `resolver`', 'Let\'s Encrypt **đã ngừng OCSP** từ tháng 8/2025: với chứng chỉ LE, bật stapling chỉ sinh cảnh báo. Chỉ còn ích với CA vẫn cung cấp OCSP'], ['HSTS', '`add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`', 'Trình duyệt tự ép https cho tên miền trong thời hạn đó']] },
    { ul: ['**HSTS khó hoàn tác**: nếu chứng chỉ hỏng, người dùng đã nhận HSTS không thể "bấm tiếp tục". Thử với `max-age=300` trước, tăng dần lên một năm. Chỉ thêm `preload` và gửi vào danh sách preload của trình duyệt khi chắc chắn **mọi** subdomain đều chạy https.', 'Luôn thêm `always` để cả trang lỗi 4xx/5xx cũng có header.', '**Bẫy thừa kế của `add_header`** (rất hay gặp): nếu một `location` tự khai báo **bất kỳ** `add_header` nào, nó **mất toàn bộ** `add_header` của `server`. Ví dụ `/assets/` có `add_header Cache-Control "public"` sẽ làm mất HSTS ở đường dẫn đó. Cách chữa: lặp lại header cần thiết trong location đó, hoặc gom các header an toàn vào một snippet `include` ở mọi nơi.']}
  ] },
  { tag: 'Khái niệm', title: 'Chẩn đoán sâu: mức log, debug_connection, $upstream_*', body: [
    { tbl: [['Mức log', 'Nên dùng', ''], ['`error`', 'Mặc định cho production', 'Lỗi thật'], ['`warn`, `notice`', 'Khi cần thêm ngữ cảnh', 'Cảnh báo cấu hình'], ['`info`', 'Tạm thời khi điều tra', 'Nhiều dòng'], ['`debug`', '**Chỉ tạm thời**, hoặc với `debug_connection`', 'Hàng chục dòng mỗi yêu cầu, file phình rất nhanh, lộ cả header']] },
    { pre: ['events {', '    worker_connections 8192;', '    debug_connection 192.0.2.7;     # chỉ kết nối từ IP này ghi mức debug', '}'], cap: 'Cần Nginx biên dịch với --with-debug (xem nginx -V; gói Ubuntu có sẵn)' },
    { ul: ['`debug_connection` hợp lý hơn nhiều so với bật `error_log ... debug` cho cả máy chủ đang chạy thật: log debug chỉ xuất hiện cho IP bạn chỉ định, mức log chung vẫn là `error`.', 'Đọc log debug: `http request line`, `http header`, **`test location`** và **`using configuration "/api/"`** cho biết location nào thực sự khớp, `http upstream request` cho biết đã gửi gì cho ứng dụng, `http finalize request` cho biết mã cuối. Đây là cách duy nhất để thấy Nginx **chọn** location thế nào.', 'Xong việc thì **xoá** `debug_connection`, reload, và dọn file log đã phình to.', 'Nguyên tắc chọn công cụ: thắc mắc "request chậm ở đâu" thì dùng `$upstream_*` trong log; thắc mắc "request đi vào location nào, header nào" thì debug; thắc mắc "cổng nào đang nghe" thì `ss -tlnp`.']}
  ] },
  { tag: 'Cú pháp', title: 'limit_req: dry run trước, chặn thật sau', body: [
    { pre: ['# conf.d/limit.conf (cấp http)', 'limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;', '', '# trong location', 'limit_req zone=api burst=10 nodelay;', 'limit_req_dry_run on;                # chỉ GHI LOG, chưa chặn', 'limit_req_status 429;                # mặc định là 503'], cap: 'Quy trình triển khai an toàn: dry_run, quan sát, rồi bỏ dry_run' },
    { tbl: [['Tham số', 'Nghĩa'], ['`rate=5r/s`', 'Tốc độ ổn định cho phép (mỗi IP)'], ['`burst=10`', 'Cho phép "bùng" thêm 10 yêu cầu vượt tốc độ; vượt nữa bị từ chối'], ['`nodelay`', 'Xử lý ngay các yêu cầu trong burst (không xếp hàng chờ làm chậm khách)'], ['`limit_req_dry_run on`', 'Vẫn ghi `limiting requests, dry run, excess: ...` vào error.log nhưng **không từ chối** (Nginx ≥ 1.17.1)'], ['`limit_req_status 429`', 'Trả 429 Too Many Requests, đúng ngữ nghĩa cho client và công cụ giám sát']] },
    { ul: ['Giới hạn quá chặt gây hại: một trang SPA tải 8 API cùng lúc từ **một** IP hợp lệ. Đo trước bằng dry run, thấy bao nhiêu khách hợp lệ chạm trần, rồi mới đặt `rate` và `burst`.', 'Khóa theo `$binary_remote_addr` sai nếu nhiều người dùng chung một IP (văn phòng, NAT) hoặc đứng sau Cloudflare: cần `real_ip` đúng, hoặc khoá theo token/API key.', 'Đây là lớp giảm tải, không thay cho fail2ban hay WAF khi bị tấn công thật.']}
  ] },
  { tag: 'Mẹo', title: 'Danh sách kiểm tra trước khi go-live', body: [
    { tbl: [['Nhóm', 'Kiểm tra'], ['Cấu hình', '`nginx -t` ok; có bản sao lưu `/etc/nginx`; snippet dùng chung, không chép tay'], ['Giới hạn', '`worker_connections` và `worker_rlimit_nofile` hợp lý; `/proc/PID/limits` của worker đúng'], ['Giám sát', '`stub_status` chỉ nội bộ; log JSON có `request_id`, `request_time`, `upstream_*`; cảnh báo 5xx theo tỉ lệ'], ['Bảo vệ', '`limit_req` đã qua dry run; chặn bot xấu; `server_tokens off`; không lộ `.git`, `.env`'], ['Hiệu năng', 'gzip và `expires` cho tĩnh; micro-cache cho API công khai; HTTP/2 bật'], ['TLS', 'TLS 1.2/1.3; HSTS (kèm `always`, kiểm tra từng location); gia hạn tự động và reload sau gia hạn'], ['Vận hành', 'logrotate chạy (`nginx -s reopen` hoặc `postrotate`); đĩa `/var/log` có cảnh báo; quy trình deploy: sửa, `-t`, reload, `curl` kiểm tra, xem error.log']] },
    'Chương này là mảnh ghép cuối của bộ Nginx: từ cấu hình, proxy và hiệu năng ở các chương trước, tới **vận hành**. Phần lớn sự cố production không đến từ cấu hình sai mà từ việc không nhìn thấy: thiếu số đo, thiếu mã yêu cầu, thiếu cảnh báo.'
  ] }
];

D.quiz = [
  { q: 'Bạn sửa cấu hình và chạy `sudo nginx -t && sudo systemctl reload nginx`. `nginx -t` báo lỗi cú pháp. Điều gì xảy ra với Nginx đang chạy?', opts: ['Nginx dừng hẳn', 'Reload không được gọi (do &&), Nginx vẫn chạy bản cấu hình cũ', 'Nginx tự dùng cấu hình lỗi một phần', 'Nginx khởi động lại với cấu hình mặc định'], ans: 1, why: '&& chỉ chạy lệnh sau khi lệnh trước thành công. Dù có gọi reload với cấu hình lỗi, master vẫn giữ bản cũ. Đây là lý do luôn ghép -t với reload.' },
  { q: 'Khác biệt chính giữa `reload` và `restart` Nginx là gì?', opts: ['reload nhanh hơn do không đọc cấu hình', 'reload sinh worker mới và để worker cũ xử lý nốt yêu cầu dở dang (không rớt kết nối), restart dừng hẳn rồi chạy lại', 'restart kiểm tra cú pháp còn reload thì không', 'Không có khác biệt trên Ubuntu'], ans: 1, why: 'Reload là thay worker êm ái. Restart ngắt kết nối đang mở nên chỉ dùng khi cần (đổi tham số của master, treo tiến trình).' },
  { q: 'Lệnh nào in ra **toàn bộ** cấu hình Nginx đã gộp mọi `include`?', opts: ['nginx -t', 'nginx -V', 'sudo nginx -T', 'nginx -s reload'], ans: 2, why: '-T (chữ hoa) vừa kiểm tra vừa in toàn bộ cấu hình. -V in phiên bản và tuỳ chọn biên dịch, -t chỉ kiểm tra.' },
  { q: 'error.log có `[alert] 768 worker_connections are not enough`. Chỉ thị nào chữa trực tiếp lỗi này?', opts: ['worker_rlimit_nofile', 'worker_connections trong khối events', 'client_max_body_size', 'keepalive_timeout'], ans: 1, why: 'Worker đã dùng hết số kết nối cho phép (768). Tăng worker_connections, đồng thời nâng worker_rlimit_nofile để file descriptor đủ.' },
  { q: 'Với `worker_connections 8192`, giá trị hợp lý cho `worker_rlimit_nofile` là?', opts: ['4096', '8192 là vừa đủ, không thể thấp hơn', 'Ít nhất khoảng 16384 (gấp đôi), vì proxy dùng hai kết nối cho mỗi yêu cầu', 'Phải bằng đúng số CPU'], ans: 2, why: 'Mỗi yêu cầu qua reverse proxy dùng một kết nối với khách và một với upstream, chưa kể file tĩnh và log. Quy tắc gấp đôi giúp tránh "Too many open files".' },
  { q: 'Bạn đặt `worker_rlimit_nofile 65535;` rồi reload. Cách kiểm tra giới hạn **thật** của worker?', opts: ['`nginx -t`', '`ulimit -n` trong shell của bạn', '`cat /proc/PID_của_worker/limits | grep "open files"`', 'Xem access.log'], ans: 2, why: 'Giới hạn là thuộc tính của từng tiến trình, đọc ở /proc/PID/limits. ulimit -n chỉ cho giá trị của shell hiện tại, và master có giới hạn riêng.' },
  { q: 'Trong đầu ra của stub_status, `accepts` lớn hơn `handled` đáng kể nghĩa là gì?', opts: ['Nginx đang chạy rất hiệu quả', 'Nginx từ chối một số kết nối vì chạm trần tài nguyên (ví dụ worker_connections)', 'Có nhiều kết nối keepalive', 'Cache đang HIT nhiều'], ans: 1, why: 'Bình thường hai số bằng nhau. handled < accepts nghĩa là có kết nối đã nhận nhưng không xử lý được, thường do chạm giới hạn.' },
  { q: 'Cách an toàn nhất để đặt `stub_status` trên máy chủ công khai?', opts: ['Đặt trong server công khai, không giới hạn, vì chỉ là số liệu', 'Server riêng nghe `127.0.0.1:8080` (hoặc location có `allow 127.0.0.1; deny all;`)', 'Đổi tên đường dẫn thành thứ khó đoán', 'Bật `autoindex`'], ans: 1, why: 'Số liệu lưu lượng thật không nên lộ ra Internet. Cổng loopback hoặc ACL cho exporter và quản trị viên tại chỗ là cách chuẩn; đổi tên đường dẫn không phải bảo mật.' },
  { q: 'Vì sao `log_format` dạng JSON cần `escape=json`?', opts: ['Để file log nhỏ hơn', 'Để dấu `"` và `\\` trong User-Agent/URI được thoát đúng, JSON hợp lệ; mặc định thoát kiểu `\\x22` làm jq lỗi', 'Để ghi thêm trường request_id', 'Để log xoay vòng'], ans: 1, why: 'escape=default đổi ký tự đặc biệt thành \\xNN, không hợp lệ trong JSON. escape=json dùng quy tắc thoát của JSON.' },
  { q: '`$request_time` khác `$upstream_response_time` thế nào?', opts: ['Giống hệt nhau', '`$request_time` tính cả thời gian đọc yêu cầu và gửi phản hồi cho khách; `$upstream_response_time` chỉ thời gian chờ ứng dụng', '`$upstream_response_time` luôn lớn hơn', '`$request_time` chỉ tính thời gian DNS'], ans: 1, why: 'request_time bao gồm cả mạng của khách. So hai số để phân biệt "ứng dụng chậm" với "khách mạng chậm".' },
  { q: 'Mục đích của `add_header X-Request-ID $request_id always;` kèm `proxy_set_header X-Request-ID $request_id;`?', opts: ['Chặn yêu cầu trùng lặp', 'Cùng một mã nhận diện xuất hiện ở phản hồi cho khách, log Nginx và log ứng dụng để lần theo một yêu cầu cụ thể', 'Tăng tốc cache', 'Xác thực người dùng'], ans: 1, why: 'Khi khách báo lỗi kèm mã này, bạn grep đúng mã ở mọi tầng log thay vì đoán theo thời gian.' },
  { q: 'Mã trạng thái 499 trong access.log của Nginx nghĩa là?', opts: ['Ứng dụng lỗi nội bộ', 'Khách đóng kết nối trước khi Nginx gửi xong phản hồi', 'Bị giới hạn tốc độ', 'Chứng chỉ hết hạn'], ans: 1, why: '499 là mã riêng của Nginx cho "client closed request". Nhiều 499 kèm thời gian xử lý dài thường là dấu hiệu ứng dụng chậm khiến khách bỏ cuộc.' },
  { q: '`proxy_cache_lock on;` giải quyết vấn đề nào?', opts: ['Chặn người lạ đọc cache', 'Cache stampede: khi bản cache hết hạn, chỉ một yêu cầu đi làm mới, các yêu cầu khác chờ', 'Mã hoá file cache', 'Giới hạn dung lượng cache'], ans: 1, why: 'Không có lock, hàng trăm yêu cầu cùng lúc cùng chọc xuống ứng dụng khi cache vừa hết hạn. Lock gộp chúng lại.' },
  { q: 'Nginx mã nguồn mở xoá một mục cache ra sao?', opts: ['`nginx -s purge`', 'Có chỉ thị `proxy_cache_purge` sẵn', 'Không có lệnh purge sẵn: xoá file cache trên đĩa, đổi khoá cache, hoặc dùng bypass; purge chuẩn là tính năng của Nginx Plus', 'Chờ hết TTL là cách duy nhất'], ans: 2, why: 'Bản OSS thiếu purge. `find /var/cache/nginx -type f -delete` xoá hết; muốn xoá có chọn lọc thì thiết kế khoá cache hoặc header bypass.' },
  { q: 'Server có `add_header Strict-Transport-Security "..." always;`. Location `/assets/` có `add_header Cache-Control "public";`. Phản hồi của `/assets/app.js` có header HSTS không?', opts: ['Có, vì thừa kế từ server', 'Không: location đã khai báo add_header riêng nên không thừa kế add_header nào từ cấp server', 'Chỉ khi có `always`', 'Chỉ với file lớn'], ans: 1, why: 'add_header chỉ thừa kế xuống cấp dưới khi cấp đó không có add_header nào. Phải lặp lại HSTS trong location, hoặc gom header vào snippet include ở mọi nơi.' },
  { q: 'Muốn bật HTTP/3 (QUIC), ngoài cấu hình `listen 443 quic reuseport;` bạn còn cần lưu ý gì?', opts: ['Chỉ cần TCP 443', 'Mở UDP 443 ở tường lửa, Nginx phải đủ mới (≥ 1.25) và có module HTTP/3, thêm header Alt-Svc để trình duyệt biết', 'Tắt HTTP/2', 'Bật HSTS preload'], ans: 1, why: 'QUIC chạy trên UDP nên ufw và nhóm bảo mật phải mở UDP 443. Trình duyệt biết có h3 qua header Alt-Svc.' },
  { q: 'Điều nào đúng về `debug_connection 192.0.2.7;` trong khối `events`?', opts: ['Chặn IP đó', 'Ghi log mức debug chỉ cho kết nối từ IP đó, mức log chung vẫn là error; cần Nginx biên dịch với --with-debug', 'Chuyển IP đó sang server khác', 'Tăng tốc cho IP đó'], ans: 1, why: 'Đây là cách điều tra an toàn trên production. Nhớ gỡ bỏ sau khi xong vì log debug rất lớn và lộ header.' },
  { q: 'Quy trình triển khai `limit_req` an toàn nên là?', opts: ['Đặt rate thật thấp rồi xem ai phàn nàn', 'Bật `limit_req_dry_run on;`, đọc "limiting requests, dry run" trong error.log để đo, chỉnh rate/burst, rồi mới bỏ dry run và đặt `limit_req_status 429`', 'Chỉ dùng `nodelay`', 'Không cần zone'], ans: 1, why: 'Dry run cho thấy ai sẽ bị chặn mà chưa chặn thật, tránh làm hỏng trải nghiệm khách hợp lệ ngay khi bật.' }
];

var CODEW = 'for i in 1 2 3 4 5 6 7 8 9 10 11 12; do curl -s -o /dev/null -w "%{http_code} " http://tutor.haiphan.org/api/courses; done';
var LOOPRE = /-w %\{http_code\}\s+http:\/\/tutor\.haiphan\.org\/api\/courses$/;
function dir(s, p, d) { return locDir(s, TUT, p, d); }
function srvListen(s, f) { var sv = live(s); return !!sv && sv.servers.some(function (x) { return x.listens.some(f); }); }
function secs(v) { var m = /^(\d+)([smh]?)$/.exec(v || ''); return m ? +m[1] * ({ '': 1, s: 1, m: 60, h: 3600 }[m[2]]) : 1e9; }

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, { seedErr: true, seedAcc: 240 }); },
  items: [
    /* A. vận hành an toàn */
    { text: 'Kiểm tra cú pháp cấu hình hiện tại', hint: 'sudo nginx -t', check: R(/nginx -t$/) },
    { text: 'Xem toàn bộ cấu hình đã gộp include và tìm server_name', hint: 'sudo nginx -T | grep -n server_name', check: R(/nginx -T/) },
    { text: 'Cố tình làm hỏng cấu hình: thiếu dấu ; sau proxy_pass của /api/', hint: SU(SITE, cfg({}).map(function (l) { return l === '        proxy_pass http://127.0.0.1:8888;' ? '        proxy_pass http://127.0.0.1:8888' : l; })), check: function (s) { return /proxy_pass http:\/\/127\.0\.0\.1:8888\n/.test(txt(s, SITE)); }, transient: true },
    { text: 'Thử nạp lại: -t chặn lại, reload không chạy, Nginx vẫn phục vụ bản cũ', hint: RELOAD, check: RF(/nginx -t$/) },
    { text: 'Khôi phục cấu hình đúng', hint: SU(SITE, cfg({})), check: function (s) { return /proxy_pass http:\/\/127\.0\.0\.1:8888;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại thành công', hint: RELOAD, check: function (s) { return cnt(s, /systemctl reload nginx/) >= 1; } },

    /* B. snippets và sao lưu */
    { text: 'Sao lưu cả thư mục cấu hình trước khi sửa lớn', hint: 'sudo cp -a /etc/nginx /root/nginx.bak', check: function (s) { return s.fs.isD('/root/nginx.bak'); } },
    { text: 'Tạo snippet chứa bộ proxy_set_header dùng chung', hint: SU(SNIP, B.SNIPPET), check: function (s) { return /X-Forwarded-Proto/.test(txt(s, SNIP)); } },
    { text: 'Thay các dòng chép tay trong /api/ bằng include snippets/proxy-common.conf', hint: SU(SITE, cfg(F.snip)), check: function (s) { return /include snippets\/proxy-common\.conf;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { var l = liveLoc(s, TUT, '/api/'); return !!l && l.stmts.some(function (x) { return x.name === 'proxy_set_header' && x.line <= 4; }); } },
    { text: 'Ứng dụng vẫn nhận đủ header (Host, X-Forwarded-*) qua snippet', hint: 'curl -s http://tutor.haiphan.org/api/whoami', check: R(/curl -s http:\/\/tutor\.haiphan\.org\/api\/whoami$/) },

    /* C. giới hạn kết nối và file mở */
    { text: 'Xem giới hạn file mở của shell hiện tại', hint: 'ulimit -n', check: R(/ulimit -n/) },
    { text: 'Đếm lỗi "worker_connections are not enough" trong error.log', hint: 'sudo grep -c "worker_connections are not enough" /var/log/nginx/error.log', check: R(/grep -c .*worker_connections are not enough/) },
    { text: 'Xem giới hạn file mở thực tế của worker (PID 1022): đang là 1024', hint: 'cat /proc/1022/limits | grep "open files"', check: R(/cat \/proc\/1022\/limits/) },
    { text: 'Nâng worker_connections lên 8192 và worker_rlimit_nofile lên 65535 trong nginx.conf', hint: SU(NGX, NGXCONF({ rl: 65535, conns: 8192 })), check: function (s) { var c = txt(s, NGX); return /worker_rlimit_nofile 65535;/.test(c) && /worker_connections 8192;/.test(c); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { var m = s.W.ngx3main; return !!m && m.rlimit === 65535 && m.conns === 8192; } },
    { text: 'Đọc lại giới hạn của worker: đã là 65535', hint: 'cat /proc/1022/limits | grep "open files"', check: function (s) { return cnt(s, /cat \/proc\/1022\/limits/) >= 2; } },

    /* D. stub_status */
    { text: 'Thêm server riêng nghe 127.0.0.1:8080 chứa stub_status', hint: SU(SITE, cfg(F.stat)), check: function (s) { return /listen 127\.0\.0\.1:8080;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return srvListen(s, function (l) { return l.port === 8080; }); } },
    { text: 'Xác nhận cổng 8080 chỉ lắng nghe trên loopback', hint: 'ss -tlnp | grep 8080', check: R(/ss -tlnp/) },
    { text: 'Đọc trạng thái Nginx', hint: 'curl -s http://127.0.0.1:8080/nginx_status', check: R(/curl -s http:\/\/127\.0\.0\.1:8080\/nginx_status$/) },
    { text: 'Gửi 10 yêu cầu tới trang chủ', hint: 'for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://tutor.haiphan.org/; done', check: function (s) { return cnt(s, /curl -s -o \/dev\/null http:\/\/tutor\.haiphan\.org\/$/) >= 10; } },
    { text: 'Lấy riêng con số requests (cột 3 dòng 3): đã tăng', hint: "curl -s http://127.0.0.1:8080/nginx_status | awk 'NR==3 {print $3}'", check: R(/awk NR==3/) },

    /* E. log JSON */
    { text: 'Định nghĩa log_format json với escape=json', hint: SU('/etc/nginx/conf.d/logfmt.conf', JSON_FMT), check: function (s) { return /escape=json/.test(txt(s, '/etc/nginx/conf.d/logfmt.conf')); } },
    { text: 'Ghi log của site vào tutor.json.log theo định dạng json', hint: SU(SITE, cfg(F.json)), check: function (s) { return /access_log \/var\/log\/nginx\/tutor\.json\.log json;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return srvDirs(s, 'access_log').some(function (x) { return x.args[1] === 'json'; }); } },
    { text: 'Tạo một yêu cầu API', hint: 'curl -s -o /dev/null http://tutor.haiphan.org/api/users', check: R(/curl -s -o \/dev\/null http:\/\/tutor\.haiphan\.org\/api\/users$/) },
    { text: 'Xem dòng log cuối (một dòng JSON)', hint: 'sudo tail -n 1 /var/log/nginx/tutor.json.log', check: R(/tail -n 1 \/var\/log\/nginx\/tutor\.json\.log/) },
    { text: 'Đọc đẹp bằng jq', hint: 'sudo tail -n 1 /var/log/nginx/tutor.json.log | jq .', check: R(/jq \.$/) },
    { text: 'Dừng API để tạo lỗi 502', hint: 'pm2 stop api', check: function (s) { return s.W.pm2.api.status === 'stopped'; }, transient: true },
    { text: 'Gọi API khi đã dừng: 502', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" http://tutor.haiphan.org/api/users', check: R(/-w %\{http_code\}.*tutor\.haiphan\.org\/api\/users$/) },
    { text: 'Khởi động lại API', hint: 'pm2 start api', check: R(/pm2 start api/) },
    { text: 'Lọc đúng các yêu cầu 502 trong log JSON bằng jq', hint: "sudo jq -c 'select(.status==\"502\")' /var/log/nginx/tutor.json.log", check: R(/jq -c select\(\.status=="502"\)/) },

    /* F. request_id */
    { text: 'Trả X-Request-ID cho khách và chuyển nó cho ứng dụng', hint: SU(SITE, cfg(F.rid)), check: function (s) { var c = txt(s, SITE); return /add_header X-Request-ID \$request_id always;/.test(c) && /proxy_set_header X-Request-ID \$request_id;/.test(c); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return srvDirs(s, 'add_header').some(function (x) { return x.args[0] === 'X-Request-ID'; }); } },
    { text: 'Xem header phản hồi có mã yêu cầu', hint: 'curl -sI http://tutor.haiphan.org/api/users | grep -i x-request-id', check: R(/grep -i x-request-id/) },
    { text: 'Ứng dụng cũng nhận được một X-Request-ID (xRequestId)', hint: 'curl -s http://tutor.haiphan.org/api/whoami', check: function (s) { return cnt(s, /curl -s http:\/\/tutor\.haiphan\.org\/api\/whoami$/) >= 2; } },

    /* G. limit_req với dry run */
    { text: 'Khai báo vùng giới hạn tốc độ 5 yêu cầu/giây mỗi IP', hint: SU('/etc/nginx/conf.d/limit.conf', LIMIT_CONF), check: function (s) { return /limit_req_zone/.test(txt(s, '/etc/nginx/conf.d/limit.conf')); } },
    { text: 'Áp dụng cho /api/ với burst=3 (lần này chặn thật)', hint: SU(SITE, cfg(F.lim1)), check: function (s) { return /limit_req zone=api burst=3 nodelay;/.test(txt(s, SITE)); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return /burst=3/.test(dir(s, '/api/', 'limit_req') || ''); }, transient: true },
    { text: 'Gửi 12 yêu cầu liên tiếp: vài yêu cầu đầu 200, các yêu cầu sau 503', hint: CODEW, check: function (s) { return cnt(s, LOOPRE) >= 12; } },
    { text: 'Chuyển sang dry run: ghi log nhưng chưa chặn', hint: SU(SITE, cfg(F.lim2)), check: function (s) { return /limit_req_dry_run on;/.test(txt(s, SITE)); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return dir(s, '/api/', 'limit_req_dry_run') === 'on'; }, transient: true },
    { text: 'Gửi 12 yêu cầu lần nữa: tất cả 200', hint: CODEW, check: function (s) { return cnt(s, LOOPRE) >= 24; } },
    { text: 'Đọc các dòng "dry run" trong error.log', hint: 'sudo grep "dry run" /var/log/nginx/error.log | tail -n 2', check: R(/grep dry run/) },
    { text: 'Bật thật: burst=10, trả 429 thay vì 503', hint: SU(SITE, cfg(F.lim3)), check: function (s) { var c = txt(s, SITE); return /burst=10 nodelay;/.test(c) && /limit_req_status 429;/.test(c) && !/dry_run/.test(c); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return dir(s, '/api/', 'limit_req_status') === '429'; } },
    { text: 'Gửi 12 yêu cầu: 11 đầu 200, yêu cầu thứ 12 trả 429', hint: CODEW, check: function (s) { return cnt(s, LOOPRE) >= 36; } },

    /* H. cache nâng cao */
    { text: 'Khai báo vùng cache api_cache', hint: SU('/etc/nginx/conf.d/cache.conf', CACHE_CONF), check: function (s) { return /proxy_cache_path/.test(txt(s, '/etc/nginx/conf.d/cache.conf')); } },
    { text: 'Bật proxy_cache 10 phút cho /api/', hint: SU(SITE, cfg(F.c1)), check: function (s) { return /proxy_cache_valid 200 10m;/.test(txt(s, SITE)); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return dir(s, '/api/', 'proxy_cache') === 'api_cache' && /10m/.test(dir(s, '/api/', 'proxy_cache_valid') || ''); }, transient: true },
    { text: 'Gọi /api/courses lần đầu: X-Cache-Status MISS', hint: 'curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/api\/courses$/) },
    { text: 'Gọi lần hai: HIT', hint: 'curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', check: function (s) { return cnt(s, /curl -sI http:\/\/tutor\.haiphan\.org\/api\/courses$/) >= 2; } },
    { text: 'Liệt kê file cache trên đĩa', hint: 'sudo find /var/cache/nginx -type f', check: R(/find \/var\/cache\/nginx -type f$/) },
    { text: 'Xoá toàn bộ cache (purge thủ công)', hint: 'sudo find /var/cache/nginx -type f -delete', check: R(/find \/var\/cache\/nginx -type f -delete/) },
    { text: 'Gọi lại: trở về MISS (đã xoá cache)', hint: 'curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', check: function (s) { return cnt(s, /curl -sI http:\/\/tutor\.haiphan\.org\/api\/courses$/) >= 3; } },
    { text: 'Chuyển sang micro-cache 10 giây kèm lock, use_stale và background_update', hint: SU(SITE, cfg(F.c2)), check: function (s) { var c = txt(s, SITE); return /proxy_cache_lock on;/.test(c) && /proxy_cache_background_update on;/.test(c) && /proxy_cache_valid 200 10s;/.test(c); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return dir(s, '/api/', 'proxy_cache_lock') === 'on'; } },
    { text: 'Bản cache cũ vẫn mang TTL 10 phút đã lưu sẵn (đổi cấu hình không đổi bản cũ): xoá cache lần nữa', hint: 'sudo find /var/cache/nginx -type f -delete', check: function (s) { return cnt(s, /find \/var\/cache\/nginx -type f -delete/) >= 2; } },
    { text: 'Gọi /api/courses: MISS rồi lưu với TTL 10 giây', hint: 'curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', check: function (s) { return cnt(s, /curl -sI http:\/\/tutor\.haiphan\.org\/api\/courses$/) >= 4; } },
    { text: 'Gọi lại ngay: HIT', hint: 'curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', check: function (s) { return cnt(s, /curl -sI http:\/\/tutor\.haiphan\.org\/api\/courses$/) >= 5; } },
    { text: 'Chờ quá 10 giây', hint: 'sleep 11', check: R(/sleep 11/) },
    { text: 'Gọi lại: EXPIRED (quá hạn, Nginx làm mới)', hint: 'curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', check: function (s) { return cnt(s, /curl -sI http:\/\/tutor\.haiphan\.org\/api\/courses$/) >= 6; } },

    /* I. HTTP/2 và HSTS */
    { text: 'Hỏi bằng HTTP/2: hiện đang là HTTP/1.1 vì chưa bật', hint: 'curl -sI --http2 https://tutor.haiphan.org/api/users | head -n 1', check: R(/--http2/) },
    { text: 'Bật http2 trên listen 443', hint: SU(SITE, cfg(F.h2)), check: function (s) { return /listen 443 ssl http2;/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return srvListen(s, function (l) { return l.port === 443 && l.h2; }); } },
    { text: 'Hỏi lại bằng HTTP/2: HTTP/2 200', hint: 'curl -sI --http2 https://tutor.haiphan.org/api/users | head -n 1', check: function (s) { return cnt(s, /--http2/) >= 2; } },
    { text: 'Thêm HSTS ở cấp server (kèm always)', hint: SU(SITE, cfg(F.hsts)), check: function (s) { return /Strict-Transport-Security/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return srvDirs(s, 'add_header').some(function (x) { return x.args[0] === 'Strict-Transport-Security'; }); } },
    { text: 'Xác nhận header HSTS có mặt', hint: 'curl -sI https://tutor.haiphan.org/ | grep -i strict', check: R(/grep -i strict/) },

    /* J. chẩn đoán sâu */
    { text: 'Xác nhận Nginx có hỗ trợ debug (--with-debug)', hint: 'sudo nginx -V 2>&1 | grep -o with-debug', check: R(/grep -o with-debug/) },
    { text: 'Bật debug_connection chỉ cho IP 192.0.2.7', hint: SU(NGX, NGXCONF({ rl: 65535, conns: 8192, dbg: true })), check: function (s) { return /debug_connection 192\.0\.2\.7;/.test(txt(s, NGX)); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return !!s.W.ngx3main && s.W.ngx3main.dbg === true; }, transient: true },
    { text: 'Gửi yêu cầu từ IP được theo dõi', hint: 'curl --interface 192.0.2.7 -s -o /dev/null http://tutor.haiphan.org/api/lessons', check: R(/--interface 192\.0\.2\.7.*api\/lessons$/) },
    { text: 'Gửi yêu cầu từ IP bình thường (không có debug)', hint: 'curl -s -o /dev/null http://tutor.haiphan.org/api/lessons', check: R(/curl -s -o \/dev\/null http:\/\/tutor\.haiphan\.org\/api\/lessons$/) },
    { text: 'Đếm dòng debug: chỉ có từ yêu cầu của IP được theo dõi', hint: 'sudo grep -c "\\[debug\\]" /var/log/nginx/error.log', check: R(/grep -c .*debug/) },
    { text: 'Gỡ debug_connection khỏi nginx.conf', hint: SU(NGX, NGXCONF({ rl: 65535, conns: 8192 })), check: function (s) { return !/debug_connection/.test(txt(s, NGX)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return !!s.W.ngx3main && s.W.ngx3main.dbg === false; } },

    /* K. triage từ access.log */
    { text: 'Phân phối mã trạng thái trong access.log', hint: "sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", check: R(/uniq -c/) },
    { text: 'Tính tỉ lệ 5xx', hint: "sudo awk '{t++; if ($9>=500) e++} END {printf \"%.1f%%\\n\", e*100/t}' /var/log/nginx/access.log", check: R(/\$9>=500/) }
  ]
};

var UAQ = 'Scanner "x" \\ y';
var CACHE_B = { 'cache.conf': J(CACHE_CONF) };

D.debugs = [
  {
    id: 'c3f1', title: 'Giờ cao điểm: "worker_connections are not enough" và "Too many open files"',
    host: 'vps', user: 'haidangphan',
    symptom: L('Mỗi buổi tối 20:00-22:00 khách báo trang đứng hình hoặc lỗi kết nối. Trong error.log:', '', '2026/10/26 21:40:12 [alert] 1022#1022: *48210 768 worker_connections are not enough while connecting to upstream, client: 203.0.113.50 ...', '2026/10/26 21:40:14 [crit] 1022#1022: accept4() failed (24: Too many open files)', '', 'CPU và RAM của VPS vẫn còn dư. Ứng dụng chạy bình thường khi gọi thẳng cổng 8888.'),
    story: 'Cả hai dòng đều là trần tài nguyên của Nginx, nhưng ở hai chỗ khác nhau: số kết nối mỗi worker được phép và số file mà tiến trình được mở. Chỉ chữa một trong hai thì lỗi còn lại sẽ xuất hiện ngay khi tải tăng.',
    goal: 'worker_connections ít nhất 4096, và worker (PID 1022) có giới hạn file mở ít nhất gấp đôi worker_connections sau khi reload.',
    hints: ['`cat /etc/nginx/nginx.conf` rồi `cat /proc/1022/limits | grep "open files"`. Hiện worker_connections là 768 và file mở là 1024.', 'Hai chỉ thị riêng: `worker_connections` nằm trong khối `events`, còn `worker_rlimit_nofile` nằm ở cấp ngoài cùng của nginx.conf. Quy tắc: file mở ≥ 2 x connections (mỗi yêu cầu proxy dùng hai kết nối).', 'Đặt `worker_rlimit_nofile 65535;` ở đầu và `worker_connections 8192;` trong `events`, rồi `sudo nginx -t && sudo systemctl reload nginx` và đọc lại `/proc/1022/limits`.'],
    fix: ['cat ' + NGX, 'cat /proc/1022/limits | grep "open files"', SU(NGX, NGXCONF({ rl: 65535, conns: 8192 })), RELOAD, 'cat /proc/1022/limits | grep "open files"'],
    cause: '`worker_connections` giới hạn số kết nối đồng thời mỗi worker (768 theo gói Ubuntu), còn mỗi kết nối cần một file descriptor nên tiến trình còn bị trần `RLIMIT_NOFILE` (mặc định 1024). Reverse proxy dùng hai kết nối cho mỗi yêu cầu nên cần `worker_rlimit_nofile` ≥ 2 x `worker_connections`. Đo lại bằng `/proc/PID/limits` của worker (không phải của master) và nhớ rằng nâng trần chỉ có ích khi RAM và ứng dụng phía sau chịu được.',
    setup: function (s) { B.base(s, { seedErr: true }); },
    check: function (s) { var m = s.W.ngx3main, lim = /Max open files\s+(\d+)/.exec(txt(s, '/proc/1022/limits')); return !!m && m.conns >= 4096 && !!lim && +lim[1] >= 2 * m.conns; }
  },
  {
    id: 'c3f2', title: 'Kiểm tra bảo mật: /nginx_status mở cho cả Internet',
    host: 'vps', user: 'haidangphan',
    symptom: L('Báo cáo pentest nội bộ:', '', '$ curl -s https://tutor.haiphan.org/nginx_status', 'Active connections: 3', 'server accepts handled requests', ' 1203 1203 3106', 'Reading: 0 Writing: 1 Waiting: 2', '', 'Khuyến nghị: không để lộ số liệu lưu lượng và trạng thái máy chủ ra ngoài. Nhưng exporter giám sát trên chính máy chủ vẫn phải đọc được.'),
    story: 'Cần đóng cửa với khách bên ngoài mà không phá việc giám sát tại chỗ. Có hai cách đúng: giới hạn theo IP tại location, hoặc đưa stub_status ra một server chỉ nghe loopback.',
    goal: 'Khách bên ngoài (198.51.100.7) không còn đọc được số liệu stub_status, còn từ máy chủ (127.0.0.1) vẫn đọc được.',
    hints: ['`curl -s --interface 198.51.100.7 http://tutor.haiphan.org/nginx_status` in ra số liệu: ai cũng đọc được. Xem `cat /etc/nginx/sites-available/tutor.haiphan.org`.', 'Cách 1: thêm `allow 127.0.0.1; deny all;` vào `location = /nginx_status`. Cách 2: xoá location đó và tạo `server { listen 127.0.0.1:8080; location = /nginx_status { stub_status; } }`.', 'Dùng cách 2 (gọn hơn, không phụ thuộc IP): đặt cấu hình mới, reload, kiểm tra `curl -s http://127.0.0.1:8080/nginx_status` và lại gọi từ IP ngoài.'],
    fix: ['curl -s --interface 198.51.100.7 http://tutor.haiphan.org/nginx_status', 'cat ' + SITE, SU(SITE, cfg({ status: 'local' })), RELOAD, 'curl -s --interface 198.51.100.7 http://tutor.haiphan.org/nginx_status', 'curl -s http://127.0.0.1:8080/nginx_status'],
    cause: '`stub_status` không có xác thực mặc định, nên đặt trong server công khai là lộ số kết nối và tổng yêu cầu. Cách chuẩn là server riêng nghe `127.0.0.1:8080` (không ai bên ngoài kết nối được), hoặc giữ location nhưng thêm `allow 127.0.0.1; deny all;`. Exporter Prometheus chạy cùng máy trỏ vào địa chỉ nội bộ.',
    setup: function (s) { B.base(s, { site: { status: 'open' } }); },
    check: function (s) {
      var pub = request(s, 'http', TUT, '/nginx_status', {}, null, null, '198.51.100.7'), loc = request(s, 'http', TUT, '/nginx_status', {}, null, null, '127.0.0.1'), r8 = request(s, 'http', '127.0.0.1', '/nginx_status', {}, null, 8080);
      function isStat(r) { return r.kind === 'resp' && r.status === 200 && /Active connections/.test(r.body || ''); }
      return !isStat(pub) && (isStat(loc) || isStat(r8));
    }
  },
  {
    id: 'c3f3', title: 'jq báo lỗi giữa chừng khi đọc log JSON',
    host: 'vps', user: 'haidangphan',
    symptom: L('Tập lệnh phân tích log JSON của đội giám sát đột ngột dừng:', '', '$ sudo jq -c . /var/log/nginx/tutor.json.log', '{"time":"2026-10-27T13:21:00+07:00","request_id":"...","method":"GET","uri":"/api/users","status":"200","ua":"curl/8.5.0"}', '{...}', 'jq: error (at <stdin>:3): Invalid literal at line 3, column 114', '', 'Hai dòng đầu đọc được, dòng thứ ba thì không. Cấu hình ghi log JSON đã có từ tuần trước.'),
    story: 'Một dòng log hỏng thì cả đường ống phân tích hỏng theo. Hãy xem dòng đó và tìm cái làm nó không còn là JSON hợp lệ: nó có liên quan tới nội dung do khách kiểm soát.',
    goal: 'Yêu cầu có User-Agent chứa dấu nháy và gạch chéo ngược ghi ra dòng log JSON hợp lệ, giữ nguyên nội dung.',
    hints: ['`sudo tail -n 1 /var/log/nginx/tutor.json.log`: User-Agent của yêu cầu thứ ba có dạng `Scanner \\x22x\\x22 \\x5C y`. `\\x22` không phải escape hợp lệ của JSON.', '`log_format` mặc định (`escape=default`) đổi `"` và `\\` thành `\\xNN`. JSON cần `escape=json`.', 'Sửa `/etc/nginx/conf.d/logfmt.conf`: thêm `escape=json` sau tên format (log_format json escape=json \'...\';), reload, rồi gửi lại một yêu cầu có User-Agent kỳ lạ và đọc dòng cuối bằng `jq`.'],
    fix: ['sudo tail -n 1 /var/log/nginx/tutor.json.log', 'cat /etc/nginx/conf.d/logfmt.conf', SU('/etc/nginx/conf.d/logfmt.conf', JSON_FMT), RELOAD, "curl -s -o /dev/null -A 'Scanner \"x\" y' http://tutor.haiphan.org/api/users", 'sudo tail -n 1 /var/log/nginx/tutor.json.log | jq .'],
    cause: 'Không khai báo `escape=json`, Nginx dùng kiểu thoát mặc định: `"` thành `\\x22`, `\\` thành `\\x5C`. Những chuỗi này hợp lệ trong log thường nhưng **không phải JSON**. Vì User-Agent, URI, Referer đều do khách quyết định, một yêu cầu cố ý hay vô ý chứa dấu nháy là đủ làm hỏng đường ống phân tích. `escape=json` thoát theo quy tắc JSON. Dòng cũ đã hỏng nằm lại trong file, nên khi xử lý nên xoay log (logrotate) hoặc bỏ qua dòng lỗi.',
    setup: function (s) {
      B.base(s, { site: { log: 'json' }, conf: { 'logfmt.conf': J(JSON_BAD) } });
      request(s, 'http', TUT, '/api/users'); request(s, 'http', TUT, '/api/courses'); request(s, 'http', TUT, '/api/users', { 'user-agent': 'Scanner "x" \\ y' });
    },
    check: function (s) {
      request(s, 'http', TUT, '/api/users', { 'user-agent': UAQ });
      var ls = txt(s, '/var/log/nginx/tutor.json.log').trim().split('\n'), last = ls[ls.length - 1];
      try { return JSON.parse(last).ua === UAQ; } catch (e) { return false; }
    }
  },
  {
    id: 'c3f4', title: 'Deploy xong nhưng khách vẫn thấy dữ liệu cũ cả giờ',
    host: 'vps', user: 'haidangphan',
    symptom: L('Vừa sửa lỗi sai giá khoá học và deploy. Ứng dụng trả đúng, nhưng website vẫn hiển thị giá cũ:', '', '$ curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', 'X-Cache-Status: HIT', '', 'Nhóm vận hành nhớ đã bật cache "để giảm tải" 1 giờ. Không muốn tắt hẳn cache vì API này rất nhiều người gọi.'),
    story: 'Cần hai việc khác nhau: dọn ngay các bản cũ đang nằm trong cache, và đổi cách cache để lần sau lỗi kiểu này chỉ kéo dài vài giây. Nhớ rằng thay TTL trong cấu hình không đổi bản đã lưu.',
    goal: 'TTL cache của /api/ không quá 60 giây và không còn bản cache cũ mang hạn 1 giờ (cache vẫn hoạt động).',
    hints: ['`curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache` thấy HIT. Xem `proxy_cache_valid` trong site và `sudo find /var/cache/nginx -type f`.', 'Chỉ giảm TTL là chưa đủ: mỗi bản cache đã lưu mang theo hạn riêng (1 giờ). Phải xoá file cache cũ. Nginx bản mã nguồn mở không có lệnh purge.', 'Đổi sang micro-cache (`proxy_cache_valid 200 10s;` kèm lock/use_stale/background_update), reload, rồi `sudo find /var/cache/nginx -type f -delete` và thử lại `curl`.'],
    fix: ['curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache', 'cat ' + SITE, SU(SITE, cfg({ cache: 2 })), RELOAD, 'sudo find /var/cache/nginx -type f -delete', 'curl -sI http://tutor.haiphan.org/api/courses | grep -i x-cache'],
    cause: 'Nginx lưu hạn sử dụng cùng với từng bản cache. Giảm `proxy_cache_valid` chỉ áp dụng cho các bản lưu **sau này**; bản cũ vẫn HIT đến hết hạn 1 giờ. Cần xoá file cache (OSS không có purge) hoặc đổi khoá cache. Về lâu dài, endpoint công khai nên dùng micro-cache vài giây với `proxy_cache_lock` và `proxy_cache_use_stale ... updating` + `background_update`: vẫn giảm tải gấp trăm lần nhưng sai lệch tối đa chỉ vài giây, và thêm bước xoá cache vào quy trình deploy.',
    setup: function (s) { B.base(s, { site: { cache: 1, ttl: '1h' }, conf: CACHE_B }); request(s, 'http', TUT, '/api/courses'); request(s, 'http', TUT, '/api/courses'); },
    check: function (s) {
      var l = liveLoc(s, TUT, '/api/'), v = l && l.stmts.filter(function (x) { return x.name === 'proxy_cache_valid'; })[0], ttl = v ? secs(v.args[v.args.length - 1]) : 1e9;
      if (ttl > 60) return false;
      var W = s.W, now = (W.ngx2c || 0) * 2 + (W.ngx2extra || 0), old = Object.keys(W.ngx2cache || {}).some(function (k) { return W.ngx2cache[k].exp - now > 120; });
      var r = request(s, 'http', TUT, '/api/courses');
      return !old && r.kind === 'resp' && r.status === 200 && /^(HIT|MISS|EXPIRED)$/.test(hdr(r, 'X-Cache-Status') || '');
    }
  },
  {
    id: 'c3f5', hard: true, title: 'Chống spam làm chính khách hợp lệ nhận 503',
    host: 'vps', user: 'haidangphan',
    symptom: L('Sau khi bật giới hạn tốc độ cho API tuần trước, trang bảng điều khiển hay hiện ô lỗi 503 "Service Temporarily Unavailable" ở vài khung dữ liệu, tải lại lần hai thì được. Ứng dụng khoẻ, CPU thấp.', '', 'error.log:', '[error] ... limiting requests, excess: 0.992 by zone "api", client: 203.0.113.24, ...', '', 'Mỗi lần mở bảng điều khiển, trình duyệt gọi cùng lúc khoảng 8 API từ một IP.'),
    story: 'Giới hạn quá chặt gây hại cho khách tốt, nhưng bỏ hẳn thì mất lớp bảo vệ. Cần cho phép đợt gọi dồn dập hợp lệ, vẫn chặn kẻ spam liên tục, và trả mã đúng ngữ nghĩa cho client (429 thay vì 503 vốn nghĩa là máy chủ quá tải).',
    goal: '8 yêu cầu liên tiếp từ một IP đều 200; 40 yêu cầu liên tiếp thì có yêu cầu bị 429 và không có 503.',
    hints: ['Dùng `for i in 1 2 3 4 5 6 7 8; do curl -s -o /dev/null -w "%{http_code} " http://tutor.haiphan.org/api/courses; done` để tái hiện: bốn yêu cầu đầu 200 rồi 503. Xem dòng `limit_req` trong site.', '`burst=3` chỉ cho vượt 3 yêu cầu. Trang cần 8 yêu cầu dồn: nâng `burst` lên mức cho phép đợt này (ví dụ 10, giữ `nodelay`). Đừng tắt `limit_req`: spam liên tục vẫn phải bị chặn.', 'Thêm `limit_req_status 429;`, đặt `burst=10 nodelay`, bỏ `limit_req_dry_run` nếu có, reload. Thử 8 yêu cầu (tất cả 200) rồi 40 yêu cầu (xuất hiện 429).'],
    fix: ['for i in 1 2 3 4 5 6 7 8; do curl -s -o /dev/null -w "%{http_code} " http://tutor.haiphan.org/api/courses; done', 'sudo grep "limiting requests" /var/log/nginx/error.log | tail -n 1', 'cat ' + SITE, SU(SITE, cfg({ limit: 3 })), RELOAD, 'for i in 1 2 3 4 5 6 7 8; do curl -s -o /dev/null -w "%{http_code} " http://tutor.haiphan.org/api/courses; done'],
    cause: 'Với `rate=5r/s burst=3`, một đợt 8 yêu cầu cùng lúc từ một IP vượt quá hạn mức nên 4 yêu cầu bị từ chối: lỗi 503 rải rác trên giao diện. `burst` quyết định cỡ đợt dồn mà khách hợp lệ được phép (kèm `nodelay` để xử lý ngay, không xếp hàng). Giữ `limit_req` để spam kéo dài vẫn bị chặn, đổi `limit_req_status 429` để client và công cụ giám sát hiểu đây là giới hạn tốc độ, không phải máy chủ lỗi. Quy trình tốt hơn: bật `limit_req_dry_run`, đọc log, chỉnh rồi mới chặn thật.',
    setup: function (s) { B.base(s, { site: { limit: 1 }, conf: { 'limit.conf': J(LIMIT_CONF) } }); },
    check: function (s) {
      var W = s.W, i, codes = [];
      W.nginx.hits = {}; for (i = 0; i < 8; i++) if (st(s, 'http', TUT, '/api/courses') !== 200) { W.nginx.hits = {}; return false; }
      W.nginx.hits = {}; for (i = 0; i < 40; i++) codes.push(st(s, 'http', TUT, '/api/courses'));
      W.nginx.hits = {};
      return codes.indexOf(429) >= 0 && codes.indexOf(503) < 0;
    }
  },
  {
    id: 'c3f6', title: 'HTTPS chưa tối ưu: không HTTP/2, thiếu HSTS ở thư mục assets',
    host: 'vps', user: 'haidangphan',
    symptom: L('Công cụ chấm điểm bảo mật báo hai điểm trừ:', '', '$ curl -sI --http2 https://tutor.haiphan.org/ | head -n 1', 'HTTP/1.1 200 OK            <- mong đợi HTTP/2', '', '$ curl -sI https://tutor.haiphan.org/ | grep -i strict', 'Strict-Transport-Security: max-age=31536000; includeSubDomains', '$ curl -sI https://tutor.haiphan.org/assets/logo.png | grep -i strict', '(không in gì)', '', 'HSTS đã được cấu hình ở cấp server mà. Trang chủ có, riêng /assets/ thì không.'),
    story: 'Hai lỗi độc lập. Lỗi thứ hai là một quy tắc thừa kế rất hay gặp của add_header: hãy đọc location /assets/ xem nó khai báo gì. Đừng quên trang lỗi 404 của đường dẫn đó cũng cần header.',
    goal: 'HTTPS dùng HTTP/2, và HSTS có ở trang chủ, ở /assets/logo.png và cả ở 404 của /assets/.',
    hints: ['`cat /etc/nginx/sites-available/tutor.haiphan.org`: `listen 443 ssl;` thiếu `http2`. Location `/assets/` có `expires` và một `add_header Cache-Control`.', 'Quy tắc: khi một location có **bất kỳ** `add_header`, nó không thừa kế **bất kỳ** `add_header` nào từ server. Vì vậy HSTS biến mất ở `/assets/`.', 'Thêm `http2` vào `listen 443 ssl`, và lặp lại `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` ngay trong `location /assets/`. Reload rồi `curl -sI --http2` kiểm tra.'],
    fix: ['curl -sI --http2 https://tutor.haiphan.org/ | head -n 1', 'curl -sI https://tutor.haiphan.org/assets/logo.png | grep -i strict', 'cat ' + SITE, SU(SITE, cfg({ hsts: true, assets: true, hstsLoc: true, h2: true })), RELOAD, 'curl -sI --http2 https://tutor.haiphan.org/ | head -n 1', 'curl -sI https://tutor.haiphan.org/assets/logo.png | grep -i strict'],
    cause: '`listen 443 ssl;` không có `http2` nên thương lượng chỉ HTTP/1.1. Còn `add_header` thừa kế theo kiểu "tất cả hoặc không": location nào tự khai báo một `add_header` (ở đây `Cache-Control`) sẽ mất toàn bộ `add_header` của cấp server, trong đó có HSTS. Cách chữa: lặp lại các header an toàn trong location đó (kèm `always` để cả 4xx/5xx có header), hoặc gom chúng vào một snippet `include` ở mọi location có `add_header` riêng. Nên kiểm tra cả `/`, một file tĩnh và một trang 404.',
    setup: function (s) { B.base(s, { site: { hsts: true, assets: true } }); },
    check: function (s) {
      var a = request(s, 'https', TUT, '/assets/logo.png'), r = request(s, 'https', TUT, '/'), e = request(s, 'https', TUT, '/assets/none.png');
      return !!hdr(a, 'Strict-Transport-Security') && !!hdr(r, 'Strict-Transport-Security') && !!hdr(e, 'Strict-Transport-Security') && r.h2 === true;
    }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
