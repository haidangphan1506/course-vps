(function (G) {
'use strict';
/* Mở rộng chương c3 (Nginx reverse proxy): bản đồ cấu hình, nhiều domain, location, dịch vụ, log, chẩn đoán lớp. Chỉ thêm vào cuối. */
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, IP = V.IP;
var TUT = 'tutor.haiphan.org', API = 'api-tutor.haiphan.org', SITE = '/etc/nginx/sites-available/tutor.haiphan.org', ASITE = '/etc/nginx/sites-available/api-tutor.haiphan.org', ERR = '/var/log/nginx/error.log';
var RELOAD = 'sudo nginx -t && sudo systemctl reload nginx';
function R(re) { return function (s) { return ran(s, re); }; }
function RF(re) { return function (s) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function SU(path, ls) { return 'sudo tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function live(s) { return s.W.nginx && s.W.nginx.active ? s.W.nginx.live : null; }
function liveSrv(s, name) { var l = live(s); return l ? l.servers.filter(function (x) { return x.names.indexOf(name) >= 0; })[0] : null; }
function ok(s) { return !V.ngLoad(s).errors.length; }
function probe(s, host) { return V.ngReq ? (function () { try { return V.ngReq(s, 'http', host, 80, '/'); } catch (e) { return { kind: 'err' }; } })() : { kind: 'err' }; }
function status(s, host, path) { var W = s.W, sv = W.ngx2req; W.ngx2req = {}; try { var r = V.ngReq(s, 'http', host, 80, path || '/'); return r.kind === 'resp' ? r.status : (r.kind === 'empty' ? 0 : -1); } catch (e) { return -2; } finally { W.ngx2req = sv; } }
function body(s, host, path) { var W = s.W, sv = W.ngx2req; W.ngx2req = {}; try { var r = V.ngReq(s, 'http', host, 80, path || '/'); return r.kind === 'resp' ? String(r.body || '') : ''; } catch (e) { return ''; } finally { W.ngx2req = sv; } }
function site(name, port, extra) {
  return L('server {', '    listen 80;', '    listen [::]:80;', '    server_name ' + name + ';', '', '    location / {', '        proxy_pass http://127.0.0.1:' + port + ';', '        proxy_http_version 1.1;', '        proxy_set_header Host $host;', '        proxy_set_header X-Real-IP $remote_addr;', '    }', '}', '').join('\n');
}
function errSeed(s, up) {
  s.fs.put(ERR, '2026/10/27 09:41:12 [error] 1021#1021: *1 connect() failed (111: Connection refused) while connecting to upstream, client: 203.0.113.7, server: tutor.haiphan.org, request: "GET / HTTP/1.1", upstream: "http://127.0.0.1:' + up + '/", host: "tutor.haiphan.org"\n', { owner: 'root', mode: M('640') });
}
function base(s) { s.W.ngx2 = true; s.W.ngx3 = true; C.vpsBase(s); C.apps(s); }

var Lc = C.lessons.filter(function (l) { return l.id === 'c3'; })[0];
if (!Lc) return;

/* ============ LÝ THUYẾT ============ */
Lc.theory.push(
  { tag: 'Bảng tra', title: 'Bản đồ thư mục Nginx và lệnh `nginx -T`', body: [
    { tbl: [['Đường dẫn', 'Chứa gì'], ['`/etc/nginx/nginx.conf`', 'File gốc: số worker, khối `http { }`, và dòng `include` kéo các file khác vào'], ['`/etc/nginx/sites-available/`', 'Mỗi domain một file (kho)'], ['`/etc/nginx/sites-enabled/`', 'Symlink tới file cần bật. Nginx **chỉ đọc nơi này**'], ['`/etc/nginx/conf.d/*.conf`', 'Cấu hình dùng chung (log_format, limit, upstream)'], ['`/etc/nginx/snippets/`', 'Đoạn dùng lại, chèn bằng `include`'], ['`/var/log/nginx/access.log`, `error.log`', 'Nhật ký truy cập và nhật ký lỗi'], ['`/run/nginx.pid`', 'Số tiến trình chính (master)']] },
    { pre: ['sudo nginx -T | head -30             # in TOÀN BỘ cấu hình đã nạp, kèm tên file nguồn', 'sudo nginx -T | grep server_name      # liệt kê mọi server_name đang có hiệu lực', 'nginx -v                                # phiên bản'], cap: 'Ba lệnh xem cấu hình' },
    { note: '`nginx -T` (chữ T hoa) in cấu hình sau khi gộp mọi `include`, mỗi đoạn có dòng `# configuration file ...`. Đây là cách nhanh nhất để thấy cái gì thật sự đang chạy, thay vì đoán xem file nào được đọc.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Nhiều domain trên một IP: server_name và default_server', body: [
    'Trình duyệt gửi tên domain trong header `Host`. Nginx chọn khối `server` theo thứ tự:',
    { ul: ['Khớp `listen` (IP và cổng)', 'Trong các server cùng cổng, so `server_name` với `Host`: khớp chính xác trước, rồi wildcard (`*.haiphan.org`), rồi biểu thức chính quy', 'Không khớp tên nào: dùng khối `default_server` (nếu không đánh dấu, là khối đầu tiên)'] },
    { pre: ['# tutor  -> Next.js cổng 3000', 'server { listen 80; server_name tutor.haiphan.org;     location / { proxy_pass http://127.0.0.1:3000; } }', '# api    -> NestJS cổng 8888', 'server { listen 80; server_name api-tutor.haiphan.org; location / { proxy_pass http://127.0.0.1:8888; } }', '# mọi tên khác', 'server { listen 80 default_server; server_name _; return 444; }'], cap: 'Ba khối server cùng cổng 80' },
    { ul: ['Thử từ chính VPS: `curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/` rồi đổi tên Host để thấy Nginx chọn khối khác', 'Gõ sai một ký tự trong `server_name` là domain rơi xuống `default_server` và bị `return 444`', 'Hai file cùng `server_name` + cùng cổng: Nginx cảnh báo `conflicting server name ... ignored` và **dùng khối đọc trước** (theo thứ tự tên file)'] }
  ] },
  { tag: 'Cú pháp', title: 'location và dấu `/` ở cuối proxy_pass', body: [
    '`location` chọn theo **đường dẫn** trong URL. Quy tắc ưu tiên (đơn giản hoá): `= /health` (khớp tuyệt đối) > tiền tố dài nhất (`/v1/` thắng `/`) > `/` (bắt mọi thứ).',
    { tbl: [['Cấu hình', 'Yêu cầu từ người dùng', 'Ứng dụng nhận'], ['`location /v1/ { proxy_pass http://127.0.0.1:8888; }`', '`/v1/users`', '`/v1/users` (giữ nguyên)'], ['`location /v1/ { proxy_pass http://127.0.0.1:8888/; }`', '`/v1/users`', '`/users` (cắt phần `/v1/`)']] },
    { pre: ['location = /health {', '    return 200 "ok";', '}', 'location /v1/ {', '    proxy_pass http://127.0.0.1:8888/;   # có dấu / cuối: bỏ tiền tố /v1/', '}'], cap: 'Điểm kiểm tra sức khoẻ và cổng API có phiên bản' },
    { note: 'Dấu `/` cuối trong `proxy_pass` làm đổi hẳn đường dẫn gửi cho ứng dụng. Ứng dụng báo 404 cho đường dẫn mà bạn tin là đúng thì kiểm tra dấu này đầu tiên.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Quản lý dịch vụ Nginx: systemctl, nginx -s, journalctl', body: [
    { tbl: [['Lệnh', 'Tác dụng', 'Khi dùng'], ['`sudo systemctl reload nginx`', 'Nạp lại cấu hình, tiến trình cũ làm nốt việc rồi thoát', 'Sau khi sửa cấu hình (**mặc định nên dùng**)'], ['`sudo systemctl restart nginx`', 'Dừng rồi chạy lại. Cấu hình lỗi thì **không lên lại được**', 'Sau khi nâng cấp gói, đổi module'], ['`sudo systemctl stop/start nginx`', 'Tắt, bật', 'Bảo trì'], ['`systemctl is-active nginx`', 'In `active` hoặc `inactive`, dùng trong script', 'Kiểm nhanh'], ['`systemctl status nginx`', 'Trạng thái, PID, vài dòng log gần nhất', 'Xem tổng quan'], ['`sudo systemctl enable nginx`', 'Tự chạy khi máy khởi động', 'Một lần khi cài']] },
    { pre: ['sudo journalctl -u nginx -n 20 --no-pager     # log của dịch vụ: khởi động, tắt, lỗi cấu hình', 'sudo nginx -t                                  # luôn kiểm trước khi reload'], cap: 'journalctl khác với error.log' },
    'Phân biệt: `journalctl -u nginx` ghi **vòng đời dịch vụ** (đã chạy, bị tắt, vì sao `start` thất bại). `error.log` ghi **từng yêu cầu bị lỗi** (502, 404...).'
  ] },
  { tag: 'Mẹo', title: 'Đọc error.log và access.log', body: [
    'Người dùng thấy mã lỗi, **nguyên nhân thật nằm trong `error.log`**. Quy trình: gây lỗi một lần, rồi đọc ngay dòng cuối.',
    { pre: ['sudo tail -n 5 /var/log/nginx/error.log', 'sudo grep -c "Connection refused" /var/log/nginx/error.log', "sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c    # đếm theo mã trạng thái"], cap: 'Ba thao tác đọc log' },
    { tbl: [['Mã', 'Dòng trong error.log', 'Ý nghĩa'], ['502', '`connect() failed (111: Connection refused) while connecting to upstream`', 'Ứng dụng không chạy hoặc sai cổng'], ['504', '`upstream timed out (110: Connection timed out) while reading response header`', 'Ứng dụng chạy nhưng quá chậm'], ['404', '`open() "/var/www/html/x" failed (2: No such file or directory)`', 'File tĩnh không có (hoặc sai `root`)'], ['403', '`directory index of "..." is forbidden` hoặc `(13: Permission denied)`', 'Thiếu file index hoặc sai quyền'], ['413', '`client intended to send too large body`', 'Vượt `client_max_body_size`']] },
    { note: 'access.log ghi mọi yêu cầu, error.log chỉ ghi khi có chuyện. File log thuộc root: đọc bằng `sudo`.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Tách lớp khi site không vào được', body: [
    'Đi từ trong ra ngoài. Mỗi bước loại trừ một lớp:',
    { ul: ['**1. Nginx có chạy không?** `systemctl is-active nginx`, `sudo ss -tlnp | grep :80`', '**2. Ứng dụng có chạy không?** `curl -sI http://127.0.0.1:3000` (bỏ qua Nginx). Không trả lời: lỗi ở ứng dụng, xem `pm2 logs` hoặc `docker logs`', '**3. Nginx có chọn đúng site không?** `curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/`. Lỗi 52 (Empty reply) là rơi vào `default_server`', '**4. Nginx nói gì?** `sudo tail error.log`', '**5. Có bị chặn từ ngoài?** Tường lửa (`sudo ufw status`), DNS (`dig +short`), Cloudflare (mã 52x)'] },
    { tbl: [['curl báo', 'Lớp nghi ngờ đầu tiên'], ['`(7) Couldn\'t connect`', 'Nginx tắt hoặc không nghe cổng đó'], ['`(52) Empty reply`', 'Rơi vào `return 444`: sai `server_name`, site chưa bật'], ['HTTP 502', 'Ứng dụng phía sau chết hoặc sai cổng'], ['HTTP 504', 'Ứng dụng treo, quá chậm'], ['HTTP 404 từ ứng dụng', 'Sai đường dẫn (xem dấu `/` của proxy_pass)']] }
  ] },
  { tag: 'Cú pháp', title: 'Tường lửa cho web: chỉ mở 80 và 443', body: [
    'Ứng dụng nghe `127.0.0.1` nên không lộ ra ngoài. Cổng công khai chỉ cần SSH, 80, 443.',
    { pre: ['sudo ufw allow OpenSSH               # LUÔN làm trước khi bật ufw', "sudo ufw allow 'Nginx Full'         # mở 80 và 443 (profile có sẵn)", 'sudo ufw --force enable', 'sudo ufw status numbered', "ss -tlnp | grep -E ':(3000|8888)'    # phải thấy 127.0.0.1, KHÔNG phải 0.0.0.0"], cap: 'Bộ tối thiểu cho server web' },
    { ul: ['Cổng 80 vẫn cần mở dù site chạy HTTPS: để chuyển hướng HTTP sang HTTPS và để certbot xác thực HTTP-01', '`0.0.0.0:3000` trong `ss` nghĩa là ứng dụng lộ ra Internet, bỏ qua Nginx và SSL. Sửa ứng dụng để chỉ nghe `127.0.0.1`'] }
  ] },
  { tag: 'Mẹo', title: 'Sửa cấu hình an toàn: sao lưu, thử, hoàn tác', body: [
    { pre: ['sudo cp -a /etc/nginx/sites-available/tutor.haiphan.org /etc/nginx/sites-available/tutor.haiphan.org.bak', '# ... sửa file ...', 'sudo nginx -t && sudo systemctl reload nginx', '# hỏng thì quay lại:', 'sudo cp /etc/nginx/sites-available/tutor.haiphan.org.bak /etc/nginx/sites-available/tutor.haiphan.org', 'sudo nginx -t && sudo systemctl reload nginx'], cap: 'Vòng sửa có đường lui' },
    { note: 'Đừng để file `.bak` hay bản sao trong `sites-enabled/`: Nginx đọc **mọi file** ở đó. Bản sao cùng `server_name` sẽ tranh quyền với bản chính, và bản đọc trước (tên file đứng trước theo thứ tự chữ cái) thắng. Để bản sao trong `sites-available/` hoặc thư mục khác.', kind: 'warn' }
  ] }
);

/* ============ QUIZ ============ */
Lc.quiz.push(
  { q: 'Hai file site cùng `server_name tutor.haiphan.org` và cùng `listen 80` đều nằm trong sites-enabled. Điều gì xảy ra?', opts: ['Nginx gộp cả hai', 'Nginx cảnh báo conflicting server name và dùng khối đọc trước', 'Nginx từ chối khởi động', 'Mỗi yêu cầu chọn ngẫu nhiên một khối'], ans: 1, why: 'Chỉ khối đọc trước có hiệu lực. Sửa file sau mãi không thấy đổi là triệu chứng điển hình.' },
  { q: 'curl tới domain báo `(52) Empty reply from server`, trong khi ứng dụng ở 127.0.0.1:3000 chạy tốt. Nghi ngờ đầu tiên?', opts: ['Ứng dụng crash', 'Yêu cầu rơi vào default_server `return 444`: sai server_name hoặc site chưa bật', 'Hết dung lượng đĩa', 'Chứng chỉ hết hạn'], ans: 1, why: '444 đóng kết nối không trả nội dung nên curl thấy Empty reply.' },
  { q: '`location /v1/ { proxy_pass http://127.0.0.1:8888/; }` nhận `/v1/users`. Ứng dụng thấy đường dẫn nào?', opts: ['/v1/users', '/users', '/v1/', '/'], ans: 1, why: 'proxy_pass có `/` cuối thì phần khớp của location (`/v1/`) bị thay bằng `/`.' },
  { q: 'Cùng cấu hình trên nhưng bỏ dấu `/` cuối proxy_pass. Ứng dụng thấy?', opts: ['/users', '/v1/users', '/v1', '404 từ Nginx'], ans: 1, why: 'Không có phần URI sau địa chỉ upstream thì đường dẫn gốc được giữ nguyên.' },
  { q: 'Dòng error.log `connect() failed (111: Connection refused) while connecting to upstream` tương ứng với mã nào?', opts: ['404', '502', '504', '413'], ans: 1, why: 'Refused nghĩa là không có tiến trình nào nghe cổng đó (chết hoặc sai cổng): 502. Còn 504 là timed out.' },
  { q: 'Sau khi sửa file cấu hình có lỗi cú pháp, bạn chạy `sudo systemctl restart nginx`. Kết quả?', opts: ['Nginx giữ cấu hình cũ và chạy tiếp', 'Nginx không khởi động lại được: site sập cho tới khi sửa xong', 'Nginx tự hoàn tác', 'Chỉ cảnh báo'], ans: 1, why: 'restart dừng tiến trình cũ trước. Với reload, cấu hình lỗi bị từ chối và tiến trình cũ vẫn chạy.' },
  { q: 'Muốn biết cấu hình **thật sự** đang có những server_name nào (sau mọi include), dùng?', opts: ['`cat nginx.conf`', '`sudo nginx -T | grep server_name`', '`ls sites-available`', '`systemctl status nginx`'], ans: 1, why: '`nginx -T` in cấu hình đã gộp include. `ls sites-available` chỉ cho biết file nào tồn tại, không nói file nào được bật.' },
  { q: '`ss -tlnp` cho thấy `0.0.0.0:3000`. Vì sao đáng lo?', opts: ['Chậm hơn', 'Ứng dụng lộ ra Internet, bỏ qua Nginx và SSL', 'Nginx không proxy được', 'Không có gì đáng lo'], ans: 1, why: '127.0.0.1 chỉ truy cập được từ chính máy. 0.0.0.0 là mọi giao diện mạng. Nếu ufw cũng mở cổng đó thì ai cũng gọi thẳng được.' },
  { q: 'Vì sao vẫn phải mở cổng 80 trong ufw dù site chạy HTTPS?', opts: ['Để chuyển hướng HTTP sang HTTPS và để certbot xác thực HTTP-01', 'Không cần thiết', 'Để SSH hoạt động', 'Để Cloudflare tính phí'], ans: 0, why: 'Người gõ http:// cần cổng 80 để được chuyển hướng. Gia hạn bằng HTTP-01 cũng cần cổng 80.' },
  { q: 'Bạn lưu bản sao `old-tutor.haiphan.org` vào sites-enabled "cho chắc". Hệ quả khả dĩ?', opts: ['Không ảnh hưởng', 'Khối server cũ tranh tên miền và có thể thắng vì đọc trước', 'Nginx xoá nó', 'Chỉ làm tăng dung lượng'], ans: 1, why: 'Nginx nạp mọi file trong sites-enabled/. Bản sao cùng server_name sẽ xung đột. Để bản sao ngoài thư mục đó.' },
  { q: '`location = /health { return 200 "ok"; }` và `location / { proxy_pass ...; }` cùng tồn tại. Yêu cầu `/health` đi đâu?', opts: ['proxy_pass', '`= /health` (khớp tuyệt đối thắng)', 'Cả hai', 'Lỗi cấu hình'], ans: 1, why: 'Khớp tuyệt đối `=` có ưu tiên cao nhất, nên /health không bao giờ tới ứng dụng.' }
);

/* ============ LAB ============ */
var oldSetup = Lc.lab.setup;
Lc.lab.setup = function (s) { s.W.ngx2 = true; s.W.ngx3 = true; oldSetup(s); s.fs.put(ERR, '', { owner: 'root', mode: M('640') }); };
var APISITE = SU(ASITE, ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location / {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_set_header Host $host;', '    }', '}']);
var APISITE2 = SU(ASITE, ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location = /health {', '        return 200 "ok";', '    }', '', '    location /v1/ {', '        proxy_pass http://127.0.0.1:8888/;', '        proxy_set_header Host $host;', '    }', '', '    location / {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_set_header Host $host;', '    }', '}']);
var it = Lc.lab.items;
it.push(
  { text: 'In toàn bộ cấu hình đã nạp (đủ cả include) và chỉ xem 20 dòng đầu.', hint: 'sudo nginx -T | head -20', check: R(/^sudo nginx -T/) },
  { text: 'Liệt kê mọi `server_name` đang có hiệu lực.', hint: 'sudo nginx -T | grep server_name', check: R(/^grep server_name/) },
  { text: 'Xem phiên bản Nginx.', hint: 'nginx -v', check: R(/^nginx -v/) },
  { text: 'Tạo site thứ hai `api-tutor.haiphan.org` proxy tới NestJS ở cổng 8888 (dùng sudo tee và heredoc).', hint: APISITE, check: function (s) { var t = txt(s, ASITE); return /server_name api-tutor\.haiphan\.org;/.test(t) && /proxy_pass http:\/\/127\.0\.0\.1:8888;/.test(t); } },
  { text: 'Bật site bằng symlink.', hint: 'sudo ln -s ' + ASITE + ' /etc/nginx/sites-enabled/', check: function (s) { var n = s.fs.get('/etc/nginx/sites-enabled/api-tutor.haiphan.org', true); return !!n && n.t === 'l'; } },
  { text: 'Kiểm tra cú pháp và nạp lại.', hint: RELOAD, check: function (s) { return !!liveSrv(s, API); } },
  { text: 'Gọi API qua Nginx với header Host đúng.', hint: 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/', check: R(/^curl .*api-tutor\.haiphan\.org.*127\.0\.0\.1/) },
  { text: 'Gọi bằng một tên Host lạ: Nginx rơi vào `default_server` và đóng kết nối (curl phải báo lỗi).', hint: 'curl -sI -H "Host: unknown.example" http://127.0.0.1/', check: RF(/unknown\.example/) },
  { text: 'Viết lại site API: thêm điểm kiểm tra `location = /health` trả `ok`, và `location /v1/` proxy có dấu `/` cuối để cắt tiền tố.', hint: APISITE2, check: function (s) { var t = txt(s, ASITE); return /location = \/health/.test(t) && /location \/v1\//.test(t) && /proxy_pass http:\/\/127\.0\.0\.1:8888\/;/.test(t); } },
  { text: 'Kiểm tra cú pháp và nạp lại.', hint: RELOAD, check: function (s) { return status(s, API, '/health') === 200 && body(s, API, '/health').trim() === 'ok'; } },
  { text: 'Gọi `/health`: không đi tới ứng dụng, Nginx tự trả.', hint: 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/health', check: R(/^curl .*\/health/) },
  { text: 'Kiểm tra Nginx có đang chạy bằng `is-active`.', hint: 'systemctl is-active nginx', check: R(/^systemctl is-active nginx/) },
  { text: 'Đọc 10 dòng log gần nhất của dịch vụ Nginx.', hint: 'sudo journalctl -u nginx -n 10 --no-pager', check: R(/^sudo journalctl -u nginx/) },
  { text: 'Xác nhận hai ứng dụng chỉ nghe ở `127.0.0.1` (không phải 0.0.0.0).', hint: "ss -tlnp | grep -E ':(3000|8888)'", check: R(/^grep -E .*3000/) },
  { text: 'Mở SSH trong ufw **trước** khi bật tường lửa.', hint: 'sudo ufw allow OpenSSH', check: function (s) { return s.W.ufw.rules.some(function (r) { return /OpenSSH|^22/.test(r.to); }); } },
  { text: 'Mở 80 và 443 bằng profile có sẵn của Nginx.', hint: "sudo ufw allow 'Nginx Full'", check: function (s) { return s.W.ufw.rules.some(function (r) { return /Nginx Full|^80|^443/.test(r.to); }); } },
  { text: 'Bật ufw.', hint: 'sudo ufw --force enable', check: function (s) { return !!s.W.ufw.active; } },
  { text: 'Xem quy tắc ufw có đánh số.', hint: 'sudo ufw status numbered', check: R(/^sudo ufw status numbered/) },
  { text: 'Tạo bản sao lưu file site tutor trước khi sửa (nằm trong sites-available, không phải sites-enabled).', hint: 'sudo cp -a ' + SITE + ' ' + SITE + '.bak', check: function (s) { return !!s.fs.get(SITE + '.bak'); } },
  { text: 'Gây lỗi có chủ đích: đổi cổng proxy của tutor từ 3000 sang 3001 (cổng không ai nghe).', hint: "sudo sed -i 's/127.0.0.1:3000/127.0.0.1:3001/' " + SITE, check: function (s) { return /127\.0\.0\.1:3001/.test(txt(s, SITE)); }, transient: true },
  { text: 'Nạp lại cấu hình có lỗi chủ đích.', hint: RELOAD, check: function (s) { return status(s, TUT, '/') === 502; }, transient: true },
  { text: 'Gọi site: phải nhận 502 Bad Gateway.', hint: 'curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/', check: function (s) { return s.hist.some(function (h) { return /^curl -sI -H Host: tutor\.haiphan\.org http:\/\/127\.0\.0\.1\/?$/.test(h.cmd) && h.code === 0; }) && status(s, TUT, '/') === 502; }, transient: true },
  { text: 'Đọc 3 dòng cuối error.log để thấy nguyên nhân thật.', hint: 'sudo tail -n 3 ' + ERR, check: R(/^sudo tail -n 3 \/var\/log\/nginx\/error\.log/) },
  { text: 'Đếm số dòng "Connection refused" trong error.log.', hint: 'sudo grep -c "Connection refused" ' + ERR, check: R(/^sudo grep -c .*Connection refused/) },
  { text: 'Đếm số yêu cầu theo mã trạng thái từ access.log (cột 9).', hint: "sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c", check: R(/^uniq -c/) },
  { text: 'Hoàn tác từ bản sao lưu.', hint: 'sudo cp ' + SITE + '.bak ' + SITE, check: function (s) { return /127\.0\.0\.1:3000/.test(txt(s, SITE)) && !/3001/.test(txt(s, SITE)); } },
  { text: 'Kiểm tra cú pháp và nạp lại để khôi phục site.', hint: RELOAD, check: function (s) { return status(s, TUT, '/') === 200; } }
);

/* ============ DEBUGS ============ */
Lc.debugs.push(
  {
    id: 'c3d3', title: 'Site trả 502, error.log báo Connection refused',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/', 'HTTP/1.1 502 Bad Gateway', '', '$ curl -sI http://127.0.0.1:3000', 'HTTP/1.1 200 OK'),
    story: 'Sau lần dọn dẹp cấu hình hôm qua, trang web tutor trả 502 dù Next.js vẫn chạy bình thường ở 127.0.0.1:3000. Bạn đã xác nhận ứng dụng trả lời khi gọi thẳng.',
    goal: 'curl với Host `tutor.haiphan.org` về 127.0.0.1 trả 200.',
    hints: ['Ứng dụng khoẻ, nên lỗi nằm ở Nginx. Đọc nguyên nhân thật: `sudo tail -n 3 /var/log/nginx/error.log` (dòng `upstream: "http://127.0.0.1:...`).', 'error.log nhắc `Connection refused` tới cổng **3001**, trong khi ứng dụng nghe cổng 3000. Mở file site: `cat /etc/nginx/sites-enabled/tutor.haiphan.org`.', 'Sửa cổng: `sudo sed -i \'s/127.0.0.1:3001/127.0.0.1:3000/\' /etc/nginx/sites-available/tutor.haiphan.org` rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['sudo tail -n 3 /var/log/nginx/error.log', 'sudo sed -i \'s/127.0.0.1:3001/127.0.0.1:3000/\' /etc/nginx/sites-available/tutor.haiphan.org', RELOAD, 'curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/'],
    cause: 'Mã 502 chỉ nói Nginx không nói chuyện được với ứng dụng. error.log nói rõ địa chỉ upstream mà Nginx cố kết nối (cổng 3001, sai). Luôn đối chiếu địa chỉ trong error.log với cổng ứng dụng thật (`ss -tlnp`).',
    setup: function (s) { base(s); errSeed(s, 3001); C.site(s, TUT, site(TUT, 3001)); V.ngReload(s, false); },
    check: function (s) { return status(s, TUT, '/') === 200 && ok(s); }
  },
  {
    id: 'c3d4', title: 'Site mới viết xong mà curl báo Empty reply',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo nginx -t', 'nginx: configuration file /etc/nginx/nginx.conf test is successful', '', '$ curl -sI -H "Host: api-tutor.haiphan.org" http://127.0.0.1/', 'curl: (52) Empty reply from server'),
    story: 'Bạn vừa viết file /etc/nginx/sites-available/api-tutor.haiphan.org cho backend NestJS (cổng 8888). `nginx -t` thành công, đã reload, nhưng domain vẫn bị cắt kết nối. Cấu hình trong file đã được đọc kỹ và hoàn toàn đúng.',
    goal: 'curl với Host `api-tutor.haiphan.org` về 127.0.0.1 trả 200.',
    hints: ['File đúng nhưng Nginx có đọc nó không? Nginx chỉ đọc `sites-enabled`. Xem: `ls -l /etc/nginx/sites-enabled/`.', 'Không có symlink cho api-tutor.haiphan.org, nên yêu cầu rơi vào default_server (`return 444`).', 'Bật site: `sudo ln -s /etc/nginx/sites-available/api-tutor.haiphan.org /etc/nginx/sites-enabled/` rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['ls -l /etc/nginx/sites-enabled/', 'sudo ln -s /etc/nginx/sites-available/api-tutor.haiphan.org /etc/nginx/sites-enabled/', RELOAD, 'curl -sI -H "Host: api-tutor.haiphan.org" http://127.0.0.1/'],
    cause: '`nginx -t` chỉ kiểm tra những gì được nạp. File nằm trong sites-available mà chưa có symlink thì Nginx không biết nó tồn tại và vẫn "successful". Triệu chứng 52 trỏ về default_server.',
    setup: function (s) { base(s); s.fs.put(ASITE, site(API, 8888), { owner: 'root' }); C.site(s, TUT, site(TUT, 3000)); V.ngReload(s, false); },
    check: function (s) { return status(s, API, '/') === 200 && ok(s); }
  },
  {
    id: 'c3d5', title: 'Domain bị cắt kết nối vì gõ sai server_name',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/', 'curl: (52) Empty reply from server', '', '$ ls -l /etc/nginx/sites-enabled/', 'tutor.haiphan.org -> /etc/nginx/sites-available/tutor.haiphan.org'),
    story: 'Site tutor đã bật symlink, `nginx -t` thành công, ứng dụng chạy ở 127.0.0.1:3000. Nhưng domain vẫn bị cắt kết nối như thể Nginx không biết tới nó.',
    goal: 'curl với Host `tutor.haiphan.org` về 127.0.0.1 trả 200.',
    hints: ['Liệt kê các tên Nginx thật sự biết: `sudo nginx -T | grep server_name`.', 'Trong file có `server_name tutor.haipan.org;`: thiếu một chữ `h`. Domain thật nên rơi vào default_server.', 'Sửa: `sudo sed -i \'s/tutor.haipan.org/tutor.haiphan.org/\' /etc/nginx/sites-available/tutor.haiphan.org`, rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['sudo nginx -T | grep server_name', 'sudo sed -i \'s/tutor.haipan.org/tutor.haiphan.org/\' /etc/nginx/sites-available/tutor.haiphan.org', RELOAD, 'curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/'],
    cause: 'Nginx chọn site theo header Host. Một ký tự sai trong server_name không bị `nginx -t` bắt vì cú pháp vẫn đúng. `nginx -T | grep server_name` là cách nhanh nhất để đối chiếu tên thật với tên bạn gõ.',
    setup: function (s) { base(s); C.site(s, TUT, site('tutor.haipan.org', 3000)); V.ngReload(s, false); },
    check: function (s) { return status(s, TUT, '/') === 200 && ok(s); }
  },
  {
    id: 'c3d6', title: 'Nginx sập sau khi restart với cấu hình lỗi',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ systemctl is-active nginx', 'inactive', '', '$ curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/', 'curl: (7) Failed to connect to tutor.haiphan.org port 80 after 0 ms: Couldn\'t connect to server'),
    story: 'Bạn sửa file site rồi gõ thẳng `sudo systemctl restart nginx` mà không chạy `nginx -t` trước. Giờ Nginx đã tắt và site sập hoàn toàn. Ứng dụng ở cổng 3000 vẫn chạy.',
    goal: 'Nginx chạy lại (`active`) và curl với Host `tutor.haiphan.org` trả 200.',
    hints: ['Tìm lỗi cấu hình: `sudo nginx -t`. Nginx báo `unknown directive "proxy_passs"` kèm số dòng.', 'Sửa chính tả: `sudo sed -i \'s/proxy_passs/proxy_pass/\' /etc/nginx/sites-available/tutor.haiphan.org`, chạy lại `sudo nginx -t` đến khi successful.', 'Khi cấu hình đã đúng, **khởi động** lại dịch vụ: `sudo systemctl start nginx` (reload không dùng được vì Nginx đang tắt).'],
    fix: ['sudo nginx -t', 'sudo sed -i \'s/proxy_passs/proxy_pass/\' /etc/nginx/sites-available/tutor.haiphan.org', 'sudo nginx -t', 'sudo systemctl start nginx', 'curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/'],
    cause: '`restart` dừng tiến trình chạy tốt rồi mới nạp cấu hình mới; cấu hình lỗi thì Nginx không lên lại. Luôn `nginx -t` trước, và dùng `reload`: cấu hình lỗi bị từ chối còn tiến trình cũ vẫn phục vụ.',
    setup: function (s) { base(s); C.site(s, TUT, site(TUT, 3000).replace('proxy_pass', 'proxy_passs')); s.W.nginx.active = false; s.W.nginx.live = null; },
    check: function (s) { return !!s.W.nginx.active && status(s, TUT, '/') === 200 && ok(s); }
  },
  {
    id: 'c3d7', title: 'api-tutor trả về trang web thay vì JSON',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/', '<!DOCTYPE html><html>... tutor-web ...</html>', '', '$ curl -s http://127.0.0.1:8888/', '{"status":"ok","service":"tutor-api"}'),
    story: 'Bạn sao chép file site của tutor để tạo site API, đổi `server_name` nhưng quên đổi phần còn lại. Domain API vào được nhưng trả nội dung của trang web, trong khi backend NestJS ở 8888 vẫn trả JSON bình thường khi gọi thẳng.',
    goal: 'Gọi `api-tutor.haiphan.org` qua Nginx trả JSON của `tutor-api` (từ cổng 8888).',
    hints: ['Đối chiếu: gọi thẳng 8888 đúng, qua Nginx sai. Đọc file: `cat /etc/nginx/sites-enabled/api-tutor.haiphan.org`.', 'File site API vẫn `proxy_pass http://127.0.0.1:3000;` (cổng của Next.js).', 'Sửa thành 8888: `sudo sed -i \'s/127.0.0.1:3000/127.0.0.1:8888/\' /etc/nginx/sites-available/api-tutor.haiphan.org` rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['cat /etc/nginx/sites-enabled/api-tutor.haiphan.org', 'sudo sed -i \'s/127.0.0.1:3000/127.0.0.1:8888/\' /etc/nginx/sites-available/api-tutor.haiphan.org', RELOAD, 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/'],
    cause: 'Sao chép file site rồi chỉ đổi một nửa là lỗi thường gặp. Mỗi lần nhân bản, đọc lại từng dòng `server_name`, `proxy_pass`, đường dẫn log và chứng chỉ. Kỹ thuật so sánh "gọi thẳng và gọi qua Nginx" định vị lỗi vào đúng lớp.',
    setup: function (s) { base(s); C.site(s, TUT, site(TUT, 3000)); C.site(s, API, site(API, 3000)); V.ngReload(s, false); },
    check: function (s) { return status(s, API, '/') === 200 && /tutor-api/.test(body(s, API, '/')) && ok(s); }
  },
  {
    id: 'c3d8', title: 'Sửa file site mãi không thấy đổi, vẫn 502', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo nginx -t', 'nginx: [warn] conflicting server name "tutor.haiphan.org" on 0.0.0.0:80, ignored', 'nginx: configuration file /etc/nginx/nginx.conf test is successful', '', '$ curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/', 'HTTP/1.1 502 Bad Gateway'),
    story: 'Bạn đã sửa file /etc/nginx/sites-available/tutor.haiphan.org đúng cổng 3000, reload nhiều lần, `nginx -t` successful, nhưng error.log vẫn báo kết nối tới cổng 3001. Tuần trước bạn có "sao lưu" file site bằng cách chép cạnh bản chính.',
    goal: 'Chỉ còn **một** khối server cho `tutor.haiphan.org` trong cấu hình đang nạp, và curl với Host đó trả 200.',
    hints: ['Cảnh báo `conflicting server name` nghĩa là có hai khối cùng tên. Xem: `sudo nginx -T | grep -B2 server_name` hoặc `ls -l /etc/nginx/sites-enabled/`.', 'Trong sites-enabled có thêm `old-tutor.haiphan.org` (bản sao lưu cũ, proxy 3001). Tên đứng trước theo thứ tự chữ cái nên nó được đọc trước và thắng.', 'Gỡ bản sao khỏi thư mục được nạp: `sudo rm /etc/nginx/sites-enabled/old-tutor.haiphan.org`, rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['sudo nginx -T | grep server_name', 'ls -l /etc/nginx/sites-enabled/', 'sudo rm /etc/nginx/sites-enabled/old-tutor.haiphan.org', RELOAD, 'curl -sI -H "Host: tutor.haiphan.org" http://127.0.0.1/'],
    cause: 'Nginx nạp mọi file trong sites-enabled. Khi hai khối trùng tên và cổng, khối đọc trước thắng và khối sau bị bỏ qua dù bạn đang sửa đúng nó. Triệu chứng "sửa mà không đổi" luôn đáng nghi có khối trùng. Để bản sao ngoài thư mục được nạp (hoặc dùng đuôi không được include).',
    setup: function (s) {
      base(s); errSeed(s, 3001);
      s.fs.put('/etc/nginx/sites-enabled/old-tutor.haiphan.org', site(TUT, 3001), { owner: 'root' });
      C.site(s, TUT, site(TUT, 3000)); V.ngReload(s, false);
    },
    check: function (s) { var l = live(s); return !!l && l.servers.filter(function (x) { return x.names.indexOf(TUT) >= 0; }).length === 1 && status(s, TUT, '/') === 200 && ok(s); }
  }
);
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
