(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.NGB;
function R(re) { return function (s) { return ran(s, re); }; }
function saw(s, re) { return s.hist.some(function (h) { return re.test(h.cmd); }); }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function failedCmd(s, re) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function HU(path, ls) { return 'tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function SU(path, ls) { return 'sudo ' + HU(path, ls); }
function live(s) { return s.W.nginx && s.W.nginx.active ? s.W.nginx.live : null; }
function liveSrv(s, name) { var l = live(s); return l ? l.servers.filter(function (x) { return x.names.indexOf(name) >= 0; })[0] : null; }
function liveLoc(s, name, path) { var sv = liveSrv(s, name); return sv ? sv.locs.filter(function (l) { return l.path === path; })[0] : null; }
function locDir(s, name, path, d) { var l = liveLoc(s, name, path); if (!l) return null; var f = l.stmts.filter(function (x) { return x.name === d; })[0]; return f ? f.args.join(' ') : null; }
function srvDir(s, name, d) { var sv = liveSrv(s, name); if (!sv) return null; var f = sv.stmts.filter(function (x) { return x.name === d; })[0]; return f ? f.args.join(' ') : null; }
function req(s, host, path) { try { return V.ngReq(s, 'http', host, 80, path); } catch (e) { return { kind: 'err' }; } }
function status(s, host, path) { var r = req(s, host, path); return r.kind === 'resp' ? r.status : (r.kind === 'empty' ? 0 : -1); }
function bodyOf(s, host, path) { var r = req(s, host, path); return r.kind === 'resp' && r.body != null ? String(r.body) : ''; }
function hasSites(s, name) { return !!s.fs.get('/etc/nginx/sites-enabled/' + name); }

var API = 'api-tutor.haiphan.org', TUT = 'tutor.haiphan.org';
var APISLASH = ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location /api/ {', '        proxy_pass http://127.0.0.1:8888/;', '    }', '', '    location = /health {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}'];
var WILD = ['server {', '    listen 80;', '    server_name *.haiphan.org;', '    root /var/www/static;', '    index index.html;', '}'];
var TUT_TIMING = ['server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    root /var/www/tutor;', '    access_log /var/log/nginx/tutor.access.log timing;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '}'];
var LOGFMT = ["log_format timing '$remote_addr [$time_local] \"$request\" $status $body_bytes_sent rt=$request_time urt=$upstream_response_time';"];

var D = { id: 'c3b', group: 'Web server', short: 'Nginx (2): chọn khối, log', title: 'Nginx (2): chọn server, location và đọc log để chẩn đoán', dek: 'Hiểu Nginx chọn khối server và location thế nào, bẫy dấu / của proxy_pass, rewrite và try_files; ghi log có thời gian xử lý, phân tích bằng awk, GoAccess và logrotate; chẩn đoán 502, 504, 404, 500 từ error.log.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c3') idx = i; });
C.lessons.splice(idx + 1, 0, D);

D.theory = [
  { tag: 'Khái niệm', title: 'Hai vòng chọn của Nginx: server rồi mới đến location', body: [
    'Mỗi yêu cầu đi qua **hai** lần chọn độc lập. Vòng 1 chọn khối `server` theo cổng `listen` và header `Host`. Vòng 2 chọn khối `location` bên trong server đó theo đường dẫn. Phần lớn lỗi kiểu "trang này hiện nội dung của trang kia" hay "file có mà không ra" đều do hiểu sai một trong hai vòng.',
    { pre: ['Yêu cầu: GET /api/users   Host: api-tutor.haiphan.org   (cổng 80)', '', '  Vòng 1  listen 80 + server_name  ->  server "api-tutor.haiphan.org"', '  Vòng 2  URI /api/users           ->  location /api/', '  Sau đó  rewrite / try_files / return / proxy_pass chạy trong location đó'], cap: 'Hai vòng chọn, theo thứ tự' },
    { ul: ['Không cần DNS để thử: `curl -s -H "Host: lab.haiphan.org" http://127.0.0.1/about` đóng vai khách truy cập bằng tên miền đó ngay trên VPS.', 'Nginx chỉ nhìn **Host** để chọn server. Truy cập bằng IP thì Host là IP, không khớp tên nào, nên rơi vào server mặc định.', 'Chọn sai ở vòng 1 thì mọi thứ trong vòng 2 đều vô nghĩa. Khi gặp lỗi lạ, hãy kiểm tra vòng 1 trước.'] }
  ] },
  { tag: 'Khái niệm', title: 'Vòng 1: chọn server theo server_name', body: [
    'Nginx thử lần lượt các kiểu khớp sau và dừng ở kiểu đầu tiên có kết quả:',
    { tbl: [['Thứ tự', 'Kiểu server_name', 'Ví dụ', 'Ghi chú'], ['1', 'Tên chính xác', '`tutor.haiphan.org`', 'Thắng mọi kiểu khác'], ['2', 'Wildcard đầu', '`*.haiphan.org`', 'Nhiều cái khớp thì cái dài nhất thắng'], ['3', 'Wildcard cuối', '`tutor.*`', 'Ít dùng'], ['4', 'Regex', '`~^www\\d+\\.haiphan\\.org$`', 'Cái khớp đầu tiên theo thứ tự trong file'], ['5', 'default_server', '`listen 80 default_server;`', 'Khi không tên nào khớp. Không khai báo thì lấy khối nạp đầu tiên']] },
    { ul: ['`*.haiphan.org` **không** khớp `haiphan.org` (tên gốc). Muốn cả hai, dùng `.haiphan.org` (có dấu chấm đầu) hoặc liệt kê `haiphan.org *.haiphan.org`.', '`server_name _;` chỉ là tên giả không bao giờ khớp host thật, hay đi cùng `default_server` làm khối chặn.', 'Hai khối cùng `server_name` trên cùng cổng: Nginx cảnh báo `conflicting server name ... ignored` và **khối nạp trước thắng**. Thứ tự nạp là thứ tự chữ cái của tên file trong `sites-enabled` (a-... đứng trước t-...). Cảnh báo này nằm ngay trong kết quả `nginx -t`, đừng bỏ qua.']},
    { note: 'Khi một tên miền mới "trả nội dung của site cũ", gần như chắc chắn là copy-paste file mà quên đổi `server_name`.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Vòng 2: chọn location và thứ tự ưu tiên', body: [
    'Trong server đã chọn, Nginx so URI (không kèm `?query`) với các `location` theo thuật toán cố định, **không** theo thứ tự viết trong file (trừ regex):',
    { tbl: [['Cú pháp', 'Loại', 'Ý nghĩa'], ['`location = /logo.png`', 'Chính xác', 'Chỉ khớp đúng URI đó, thắng ngay'], ['`location ^~ /img/raw/`', 'Prefix ưu tiên', 'Khớp đầu URI, và **dừng** không xét regex'], ['`location ~ \\.php$`', 'Regex', 'Phân biệt hoa thường'], ['`location ~* \\.(png|jpg)$`', 'Regex', 'Không phân biệt hoa thường'], ['`location /img/`', 'Prefix thường', 'Khớp đầu URI, dài nhất thắng, nhưng nhường regex']] },
    { ul: ['Bước 1: có `=` khớp chính xác thì dùng luôn.', 'Bước 2: tìm prefix **dài nhất** (kể cả `^~`). Nếu nó là `^~` thì chốt, bỏ qua regex.', 'Bước 3: duyệt các regex **từ trên xuống dưới**, cái nào khớp trước thì thắng (thứ tự trong file có ý nghĩa ở đây).', 'Bước 4: không regex nào khớp thì dùng prefix dài nhất đã tìm ở bước 2.'] },
    { tbl: [['URI (server lab.haiphan.org)', 'Location được chọn', 'Vì sao'], ['`/about`', '`/`', 'Chỉ prefix `/` khớp'], ['`/img/a.txt`', '`/img/`', 'Prefix dài nhất, không regex nào khớp'], ['`/img/pic.png`', '`~* \\.(png|jpg)$`', 'Regex thắng prefix thường `/img/`'], ['`/img/raw/pic.png`', '`^~ /img/raw/`', '`^~` chặn không cho regex xét'], ['`/logo.png`', '`= /logo.png`', 'Chính xác thắng tất cả']] },
    { note: 'Lỗi kinh điển: thêm `location ~* \\.(js|css|png)$` để cache file tĩnh, rồi ảnh trong `location /uploads/` bỗng 404 vì regex "nuốt" mất. Chữa bằng `location ^~ /uploads/`.', kind: 'warn' }
  ] },
  { tag: 'Lưu ý', title: 'Bẫy dấu / ở cuối proxy_pass', body: [
    'Cách viết `proxy_pass` quyết định upstream nhận đường dẫn nào. Quy tắc: nếu sau `host:port` **không có** gì thì chuyển nguyên URI; nếu **có** phần đường dẫn (kể cả chỉ một dấu `/`) thì phần URI khớp với location bị thay bằng nó.',
    { tbl: [['location', 'proxy_pass', 'Khách gọi', 'Upstream nhận'], ['`/api/`', '`http://127.0.0.1:8888`', '`/api/users`', '`/api/users`'], ['`/api/`', '`http://127.0.0.1:8888/`', '`/api/users`', '`/users`'], ['`/api/`', '`http://127.0.0.1:8888/v2/`', '`/api/users`', '`/v2/users`'], ['`/api/`', '`http://127.0.0.1:8888/api/`', '`/api/users`', '`/api/users`']] },
    { ul: ['Một dấu `/` thừa biến `/api/users` thành `/users`, và NestJS trả `{"message":"Cannot GET /users","statusCode":404}`. Đây là 404 **của ứng dụng**, không phải của Nginx (trang 404 của Nginx là HTML).', 'Trong `location` dạng regex (`~`, `~*`), location đặt tên (`@x`) và khối `if`, `proxy_pass` **không được** có phần URI; `nginx -t` báo `[emerg] "proxy_pass" cannot have URI part ...`.', 'Muốn bỏ tiền tố có chủ đích (`/app/` thành `/`) thì dùng dấu `/` cuối ở cả hai: `location /app/ { proxy_pass http://127.0.0.1:3000/; }`.']}
  ] },
  { tag: 'Cú pháp', title: 'Ngữ cảnh và kế thừa chỉ thị', body: [
    'Cấu hình lồng nhau: `http` chứa `server`, `server` chứa `location`. Chỉ thị đặt ở cấp trên được cấp dưới **kế thừa** nếu cấp dưới không đặt lại.',
    { pre: ['http {', '    server_tokens off;            # mọi server kế thừa', '    server {', '        root /var/www/tutor;      # mọi location trong server này kế thừa', '        location /api/ { proxy_pass http://127.0.0.1:8888; }', '        location /uploads/ { root /var/www; }   # đặt lại root cho riêng mình', '    }', '}'], cap: 'Kế thừa từ ngoài vào trong' },
    { ul: ['Các chỉ thị dạng danh sách (`add_header`, `proxy_set_header`) có quy tắc riêng: cấp dưới chỉ cần khai báo **một** dòng cùng loại là toàn bộ danh sách của cấp trên **biến mất**, không gộp.', '`log_format` chỉ được đặt ở cấp `http`. Đặt trong `server` sẽ báo `directive is not allowed here`.', '`access_log`, `error_log` cũng kế thừa; khai báo ở `server` hay `location` thì ghi đè cấp trên.']}
  ] },
  { tag: 'Cú pháp', title: 'nginx -T: xem cấu hình thật sự đang chạy', body: [
    '`nginx -t` chỉ kiểm tra. `nginx -T` (T hoa) kiểm tra **và in toàn bộ cấu hình đã gộp** từ mọi file được include, mỗi file có dòng tiêu đề `# configuration file ...:`.',
    { pre: ['sudo nginx -T | less', 'sudo nginx -T | grep -n server_name              # mọi tên miền đang phục vụ', 'sudo nginx -T | grep -n -A6 "location /api"        # xem một location và 6 dòng sau', 'sudo nginx -T | grep -n "configuration file"       # liệt kê file nào được nạp'], cap: 'Bốn cách dùng hay gặp' },
    { ul: ['Khi "sửa file rồi mà không đổi gì": kiểm tra file có nằm trong danh sách `configuration file` không (có thể quên `ln -s` vào `sites-enabled`), và có khối khác trùng `server_name` không.', '`nginx -T` cần quyền root (đọc được mọi file), nên dùng `sudo`.', 'Kết quả thử cú pháp đi ra stderr, cấu hình đi ra stdout, nên `| grep` chỉ lọc phần cấu hình.']}
  ] },
  { tag: 'Cú pháp', title: 'return, rewrite và try_files', body: [
    { tbl: [['Chỉ thị', 'Dùng khi', 'Ví dụ'], ['`return`', 'Trả mã ngay, chuyển hướng đơn giản (nhanh nhất)', '`return 301 https://$host$request_uri;`'], ['`rewrite`', 'Đổi URI theo regex', '`rewrite ^/old-blog/(.*)$ /blog/$1 permanent;`'], ['`try_files`', 'Thử file theo thứ tự, mục cuối là phương án dự phòng', '`try_files $uri $uri/ /index.html;`']] },
    { tbl: [['Cờ của rewrite', 'Tác dụng'], ['`last`', 'Dừng rewrite, tìm location lại với URI mới (có thể vào location khác)'], ['`break`', 'Dừng rewrite, ở lại location hiện tại'], ['`redirect`', 'Trả 302 (tạm thời), trình duyệt đổi URL'], ['`permanent`', 'Trả 301 (vĩnh viễn), trình duyệt và công cụ tìm kiếm ghi nhớ']] },
    { ul: ['SPA (React, Vue): `try_files $uri $uri/ /index.html;` nghĩa là có file thật thì trả file, không thì trả trang chính để router phía trình duyệt xử lý.', 'Phương án cuối của `try_files` là chuyển hướng **nội bộ**. Nếu `/index.html` không tồn tại (sai `root`), Nginx lặp lại tới giới hạn 10 lần rồi trả **500** kèm log `rewrite or internal redirection cycle`.', 'Mục cuối `=404` trả 404 thẳng, không ghi lỗi `open() failed`.']}
  ] },
  { tag: 'Cú pháp', title: 'log_format: ghi thêm thời gian xử lý', body: [
    'Log mặc định (`combined`) không có thời gian. Muốn biết endpoint nào chậm, định nghĩa định dạng riêng ở cấp `http` (file trong `conf.d/` là chỗ tiện nhất) rồi gọi theo tên:',
    { pre: ["# /etc/nginx/conf.d/log-timing.conf", "log_format timing '$remote_addr [$time_local] \"$request\" $status $body_bytes_sent rt=$request_time urt=$upstream_response_time';", '', '# trong khối server của site', 'access_log /var/log/nginx/tutor.access.log timing;'], cap: 'Khai báo một lần, dùng cho nhiều site' },
    { tbl: [['Biến', 'Ý nghĩa'], ['`$request_time`', 'Tổng thời gian xử lý: từ byte đầu của yêu cầu đến khi gửi hết phản hồi (gồm cả tốc độ mạng của khách)'], ['`$upstream_response_time`', 'Chỉ phần ứng dụng phía sau xử lý. `-` nghĩa là không đi qua upstream (file tĩnh)'], ['`$upstream_addr`', 'Địa chỉ upstream đã xử lý (hữu ích khi có nhiều upstream)'], ['`$status`, `$body_bytes_sent`', 'Mã trạng thái và số byte nội dung'], ['`$http_cf_connecting_ip`', 'IP thật của khách khi đứng sau Cloudflare (`$remote_addr` lúc đó là IP của Cloudflare)']] },
    { ul: ['`request_time` lớn nhưng `upstream_response_time` nhỏ: khách tải chậm hoặc nội dung lớn, ứng dụng không phải nguyên nhân.', 'Cả hai cùng lớn: ứng dụng hoặc cơ sở dữ liệu chậm.', 'Gọi tên format chưa khai báo thì `nginx -t` báo `unknown log format "timing"`.', '`access_log off;` trong `location = /health` để khỏi làm nhiễu log bởi healthcheck; `buffer=32k flush=5s` giảm số lần ghi đĩa khi tải cao.']}
  ] },
  { tag: 'Cú pháp', title: 'error_log: mức độ và các thông báo hay gặp', body: [
    '`error_log /var/log/nginx/error.log warn;` ghi mức đã chọn **và các mức nghiêm trọng hơn**. Thứ tự từ chi tiết đến nghiêm trọng:',
    { pre: ['debug < info < notice < warn < error < crit < alert < emerg', '', '# mặc định là error. Chỉ bật debug khi thật cần, rất nhiều dòng.'], cap: 'Các mức của error_log' },
    { tbl: [['Thông báo trong error.log', 'Mã khách thấy', 'Nghĩa là'], ['`connect() failed (111: Connection refused) while connecting to upstream`', '502', 'Ứng dụng không chạy, sai cổng hoặc chỉ nghe địa chỉ khác'], ['`upstream timed out (110: Connection timed out) while reading response header`', '504', 'Ứng dụng trả lời quá `proxy_read_timeout` (mặc định 60s)'], ['`open() "/var/www/x" failed (2: No such file or directory)`', '404', 'File không tồn tại ở đường dẫn đã ghép từ `root`'], ['`open() ... failed (13: Permission denied)`', '403', 'Tài khoản chạy Nginx (www-data) không đọc được thư mục hoặc file'], ['`rewrite or internal redirection cycle`', '500', '`try_files` hoặc `rewrite` lặp vô hạn'], ['`client intended to send too large body`', '413', 'Vượt `client_max_body_size`']] },
    { note: 'Khi có sự cố, mở hai cửa sổ: `sudo tail -f /var/log/nginx/error.log` ở một bên và chạy lại `curl` ở bên kia. Dòng lỗi vừa xuất hiện chính là lời giải thích.', kind: 'tip' }
  ] },
  { tag: 'Mẹo', title: 'Phân tích access.log bằng awk, sort, uniq', body: [
    'Với định dạng `combined`, mỗi dòng tách theo khoảng trắng cho các cột cố định. Nếu bạn thêm `rt=...` ở cuối như log mẫu trong bài này thì `$NF` (cột cuối) là thời gian xử lý.',
    { tbl: [['Cột', 'Nội dung'], ['`$1`', 'IP khách'], ['`$4`', 'Thời điểm (bắt đầu bằng `[`)'], ['`$7`', 'Đường dẫn (URI)'], ['`$9`', 'Mã trạng thái'], ['`$10`', 'Số byte trả về'], ['`$NF`', 'Cột cuối, ở đây là `rt=giây`']] },
    { pre: ["sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn          # đếm theo mã trạng thái", "sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5    # 5 IP nhiều nhất", "sudo awk '$9 == 404 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head   # URL 404 nhiều nhất", "sudo awk '$NF ~ /rt=[1-9]/ {print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -5   # yêu cầu chậm hơn 1 giây", "sudo awk '$9 >= 500' /var/log/nginx/access.log | wc -l                                       # số lỗi 5xx", "sudo grep -E 'wp-login|\\.env' /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn   # kẻ dò quét"], cap: 'Sáu công thức dùng hằng ngày' },
    { ul: ['Luôn bọc chương trình awk trong **nháy đơn** để shell không thay `$9` bằng giá trị rỗng.', '`uniq -c` chỉ gộp các dòng **liền kề**, nên phải `sort` trước. `sort -rn` xếp số lớn lên đầu.', 'Log chỉ root hoặc nhóm `adm` đọc được (mode 640), nên cần `sudo`.']}
  ] },
  { tag: 'Mẹo', title: 'GoAccess và logrotate', body: [
    '**GoAccess** đọc access.log và cho báo cáo tổng hợp: số yêu cầu, mã trạng thái, URL và IP hàng đầu, băng thông. Có thể xem ngay trong terminal hoặc xuất HTML.',
    { pre: ['sudo goaccess /var/log/nginx/access.log --log-format=COMBINED', 'sudo goaccess /var/log/nginx/access.log --log-format=COMBINED -o /var/www/report.html   # xuất HTML'], cap: 'GoAccess: format phải khớp log' },
    '**logrotate** xoay vòng log để ổ đĩa không đầy. Cấu hình có sẵn ở `/etc/logrotate.d/nginx`:',
    { tbl: [['Dòng', 'Tác dụng'], ['`daily`', 'Xoay mỗi ngày'], ['`rotate 14`', 'Giữ 14 bản cũ, bản thứ 15 bị xoá'], ['`compress` + `delaycompress`', 'Nén bản cũ, nhưng hoãn nén bản vừa xoay một chu kỳ'], ['`notifempty`', 'Log rỗng thì bỏ qua'], ['`postrotate ... endscript`', 'Lệnh chạy sau khi xoay (báo Nginx mở lại file log)']] },
    { ul: ['Nginx giữ file log **đang mở**. Sau khi đổi tên `access.log` thành `access.log.1`, nếu không báo Nginx mở lại (`nginx -s reopen`, tín hiệu USR1 hoặc reload) thì nó vẫn ghi tiếp vào file đã đổi tên. Đó là lý do có `postrotate`.', '`sudo logrotate -d /etc/logrotate.d/nginx` chạy thử, chỉ in ra việc sẽ làm; `sudo logrotate -f ...` ép xoay ngay.', 'Có log tuỳ biến (như `tutor.access.log`) mà vẫn khớp mẫu `/var/log/nginx/*.log` thì tự được xoay vòng cùng.']}
  ] },
  { tag: 'Mẹo', title: 'Quy trình chẩn đoán: triệu chứng, log, nguyên nhân', body: [
    { tbl: [['Triệu chứng', 'Xem ở đâu', 'Dấu hiệu', 'Nguyên nhân hay gặp'], ['curl báo Empty reply, Cloudflare 520', '`nginx -T`, thử `-H Host:`', 'Rơi vào server `return 444`', '`server_name` sai, trùng hoặc chưa bật site'], ['502 Bad Gateway', 'error.log', '`connect() failed (111)`', 'Ứng dụng tắt, sai cổng, chỉ nghe loopback khác'], ['504 Gateway Time-out', 'error.log, `$upstream_response_time`', '`upstream timed out`, thời gian đúng 60s', 'Endpoint chậm hơn `proxy_read_timeout`'], ['404 mà file có thật', 'error.log, `nginx -T`', '`open() ... failed` kèm đường dẫn', 'Sai `root`/`alias`, hoặc regex location nuốt'], ['404 dạng JSON "Cannot GET"', 'Phản hồi của ứng dụng', 'Đường dẫn upstream nhận khác mong đợi', 'Dấu `/` ở `proxy_pass`'], ['500 Internal Server Error', 'error.log', '`redirection cycle`', '`try_files` fallback không tồn tại'], ['403 Forbidden', 'error.log', '`Permission denied` hoặc `directory index forbidden`', 'Quyền thư mục, thiếu `index`']] },
    { ul: ['Bước 1: **tái hiện** bằng `curl -s -H "Host: ..." http://127.0.0.1/...`, cố định lại triệu chứng.', 'Bước 2: `sudo nginx -T` để biết cấu hình nào đang chạy (không phải cấu hình bạn tưởng).', 'Bước 3: đọc `error.log` đúng lúc tái hiện.', 'Bước 4: đọc `access.log` để biết mã trạng thái và thời gian; so với lúc bình thường.']}
  ] }
];

D.quiz = [
  { q: 'Khách gọi Host `blog.haiphan.org`. Có ba server: A `server_name *.haiphan.org;`, B `server_name blog.*;`, C `server_name ~^blog\\.;`. Nginx chọn server nào?', opts: ['A (wildcard đầu)', 'B (wildcard cuối)', 'C (regex)', 'Server nào viết trước trong file'], ans: 0, why: 'Thứ tự ưu tiên: tên chính xác, wildcard đầu (`*.x`), wildcard cuối (`x.*`), regex, rồi default_server. Ở đây A thuộc nhóm cao nhất trong ba cái nên thắng.' },
  { q: 'Hai server cùng nghe cổng 80, không cái nào có `default_server`. Khách gọi bằng Host không khớp tên nào. Chuyện gì xảy ra?', opts: ['Nginx trả 404', 'Nginx dùng server nạp đầu tiên cho cổng đó', 'Nginx từ chối kết nối', 'Nginx chọn ngẫu nhiên'], ans: 1, why: 'Không có default_server thì khối nạp đầu tiên (theo thứ tự chữ cái của file trong sites-enabled) làm mặc định. Vì vậy nên luôn khai báo rõ một default_server để chặn.' },
  { q: 'Server có `location /img/` và `location ~* \\.(png|jpg)$`. Yêu cầu `/img/pic.png` đi vào location nào?', opts: ['`/img/` vì dài hơn', '`~* \\.(png|jpg)$` vì regex thắng prefix thường', 'Cả hai', 'Phụ thuộc thứ tự viết'], ans: 1, why: 'Prefix thường chỉ là ứng viên tạm. Nginx duyệt regex sau đó, regex khớp thì thắng. Muốn prefix thắng phải dùng `^~`.' },
  { q: 'Thêm `^~` vào `location ^~ /uploads/` làm gì?', opts: ['Làm location phân biệt hoa thường', 'Khi prefix này là khớp dài nhất thì Nginx dừng, không xét các location regex', 'Biến nó thành khớp chính xác', 'Tắt log cho location'], ans: 1, why: '`^~` nghĩa là "ưu tiên prefix": nếu nó là prefix dài nhất khớp được thì chốt luôn, regex không có cơ hội nuốt yêu cầu.' },
  { q: 'Hai location regex cùng khớp một URI. Cái nào thắng?', opts: ['Cái dài hơn', 'Cái khớp chính xác hơn', 'Cái xuất hiện trước trong file', 'Cái xuất hiện sau trong file'], ans: 2, why: 'Regex được duyệt từ trên xuống, cái khớp đầu tiên thắng. Đây là chỗ duy nhất thứ tự viết trong file quan trọng.' },
  { q: '`location /api/ { proxy_pass http://127.0.0.1:8888/; }` và khách gọi `/api/users`. Ứng dụng nhận đường dẫn nào?', opts: ['`/api/users`', '`/users`', '`/api//users`', '`/`'], ans: 1, why: 'Có phần URI (dù chỉ là `/`) sau host:port nên phần khớp `/api/` bị thay bằng `/`. Bỏ dấu `/` cuối (hoặc viết `http://127.0.0.1:8888/api/`) để giữ nguyên đường dẫn.' },
  { q: 'Trình duyệt thấy JSON `{"message":"Cannot GET /users","statusCode":404}` khi gọi `/api/users`. Điều gì đúng?', opts: ['Nginx không tìm thấy file', 'Yêu cầu đã tới ứng dụng, nhưng đường dẫn bị đổi thành `/users` (dấu / thừa ở proxy_pass)', 'Cloudflare chặn', 'Ứng dụng đã sập'], ans: 1, why: 'Trang 404 của Nginx là HTML. JSON kiểu này do framework (NestJS) sinh ra, nghĩa là yêu cầu đã tới upstream nhưng sai đường dẫn.' },
  { q: 'Bạn viết `location ~ ^/v1/ { proxy_pass http://127.0.0.1:8888/api/; }`. `nginx -t` cho kết quả gì?', opts: ['OK', '`[emerg] "proxy_pass" cannot have URI part in location given by regular expression ...`', 'Chỉ cảnh báo [warn]', 'Tự bỏ phần /api/'], ans: 1, why: 'Với location regex, Nginx không biết phần nào của URI cần thay, nên cấm proxy_pass có phần URI. Dùng location prefix hoặc proxy_pass không có URI kèm `rewrite`.' },
  { q: 'Server có `add_header X-Frame-Options DENY;`. Trong `location /api/` bạn thêm `add_header Cache-Control no-store;`. Phản hồi của `/api/...` có X-Frame-Options không?', opts: ['Có, vì kế thừa', 'Không, vì location đã khai báo add_header riêng nên danh sách ở cấp server bị bỏ', 'Có nhưng ở dạng trùng lặp', 'Phụ thuộc phiên bản trình duyệt'], ans: 1, why: 'Các chỉ thị dạng danh sách không gộp: chỉ cần cấp dưới khai báo một dòng cùng loại là cấp trên bị thay hoàn toàn. Phải lặp lại header cần giữ.' },
  { q: 'SPA có `root /var/www/spa/dist;` và `try_files $uri $uri/ /index.html;`, nhưng thư mục `dist` không tồn tại. Khách vào `/courses/12` sẽ thấy gì?', opts: ['404', '500 Internal Server Error, error.log ghi `rewrite or internal redirection cycle`', '200 với trang trống', '403'], ans: 1, why: 'Phương án cuối `/index.html` không tìm thấy nên Nginx lại chạy `try_files` với chính nó, lặp tới giới hạn 10 lần rồi trả 500. Sửa `root` cho đúng.' },
  { q: 'Khác nhau giữa `rewrite ... last` và `rewrite ... break`?', opts: ['`last` trả 301, `break` trả 302', '`last` tìm location lại với URI mới, `break` ở lại location hiện tại', 'Không khác nhau', '`break` dừng Nginx'], ans: 1, why: '`last` chạy lại bước chọn location (có thể sang location khác); `break` dừng xử lý rewrite và tiếp tục trong location hiện tại. `redirect` và `permanent` mới là 302 và 301.' },
  { q: 'Dòng log có `rt=75.012 urt=75.010`. Kết luận hợp lý nhất?', opts: ['Mạng của khách chậm', 'Ứng dụng phía sau xử lý mất khoảng 75 giây', 'Nginx quá tải', 'Cloudflare chậm'], ans: 1, why: '`upstream_response_time` gần bằng `request_time` nghĩa là gần như toàn bộ thời gian nằm ở ứng dụng. Nếu rt lớn mà urt nhỏ thì nghi mạng khách hoặc payload lớn.' },
  { q: 'Vì sao khi đếm theo cột phải viết `awk ... | sort | uniq -c` mà không `uniq -c` trực tiếp?', opts: ['Để tăng tốc', '`uniq` chỉ gộp các dòng giống nhau nằm liền kề, nên cần sort trước để chúng liền nhau', 'Vì awk không in được số', 'Không có lý do'], ans: 1, why: 'Dữ liệu chưa sắp xếp thì cùng một giá trị xuất hiện ở nhiều chỗ, `uniq -c` đếm rời rạc từng cụm. Thêm `sort -rn` sau cùng để xếp số lớn lên đầu.' },
  { q: 'Ứng dụng báo cáo mất 75 giây, khách luôn nhận 504 sau đúng 60 giây, error.log ghi `upstream timed out (110)`. Cách xử lý đúng?', opts: ['Đặt `proxy_read_timeout 3600s;` cho toàn bộ server', 'Đặt `proxy_read_timeout` đủ lớn chỉ trong location của endpoint chậm, rồi tối ưu hoặc chuyển thành tác vụ nền', 'Tăng worker_processes', 'Tắt access_log'], ans: 1, why: '60s là mặc định của proxy_read_timeout. Nới đúng chỗ cần thiết, tránh giữ kết nối treo cho mọi endpoint. Về lâu dài nên đưa báo cáo nặng thành tác vụ chạy nền.' },
  { q: 'Cấu hình có `access_log /var/log/nginx/x.log timing;` nhưng chưa có `log_format timing`. `nginx -t` báo?', opts: ['OK, dùng format mặc định', '`[emerg] unknown log format "timing"`', 'Chỉ cảnh báo', 'Không báo gì, lỗi khi reload'], ans: 1, why: 'Tên format được kiểm tra lúc nạp cấu hình. Khai báo `log_format` ở cấp `http` (nhớ: trước hay sau đều được, miễn trong cùng cấu hình đã nạp).' },
  { q: 'Sau khi logrotate đổi tên `access.log` thành `access.log.1`, nếu không có `postrotate` báo Nginx mở lại log thì sao?', opts: ['Nginx dừng', 'Nginx tạo file mới tự động', 'Nginx vẫn ghi tiếp vào file đã đổi tên (`.1`), file `access.log` mới trống', 'Log bị xoá'], ans: 2, why: 'Nginx giữ descriptor của file đang mở nên đổi tên không làm nó đổi nơi ghi. Cần `nginx -s reopen`, USR1 hoặc reload để mở lại file.' },
  { q: 'Bạn tưởng đã sửa `server_name` nhưng hành vi không đổi. Lệnh nào cho thấy cấu hình **đã nạp** gồm những file nào?', opts: ['`nginx -t`', '`sudo nginx -T | grep "configuration file"`', '`cat nginx.conf`', '`systemctl status nginx`'], ans: 1, why: '`-T` in mọi file được include kèm tiêu đề `# configuration file ...`. Kết hợp `grep -n server_name` để thấy tên miền nằm trong file nào, và nhớ `reload` để cấu hình mới có hiệu lực.' }
];

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, {}); },
  items: [
    { text: 'Xem toàn bộ cấu hình đã gộp (30 dòng đầu)', hint: 'sudo nginx -T | head -30', check: R(/nginx -T/) },
    { text: 'Liệt kê mọi server_name đang phục vụ, kèm số dòng', hint: 'sudo nginx -T | grep -n server_name', check: R(/grep -n server_name/) },
    { text: 'Đóng vai khách vào tutor.haiphan.org bằng header Host', hint: 'curl -s -H "Host: tutor.haiphan.org" http://127.0.0.1/', check: R(/curl .*Host: tutor\.haiphan\.org/) },
    { text: 'Thử một Host lạ: rơi vào default_server nên không có phản hồi (Empty reply)', hint: 'curl -s -H "Host: lung-tung.com" http://127.0.0.1/', check: function (s) { return saw(s, /Host: lung-tung\.com/); } },
    { text: 'Gọi API qua tên miền api-tutor: /api/users', hint: 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/api/users', check: R(/Host: api-tutor\.haiphan\.org .*\/api\/users/) },

    { text: 'Tạo site wildcard cho mọi subdomain của haiphan.org, phục vụ thư mục /var/www/static', hint: SU('/etc/nginx/sites-available/wildcard.haiphan.org', WILD), check: function (s) { return /server_name \*\.haiphan\.org;/.test(txt(s, '/etc/nginx/sites-available/wildcard.haiphan.org')); }, transient: true },
    { text: 'Bật site bằng symlink vào sites-enabled', hint: 'sudo ln -s /etc/nginx/sites-available/wildcard.haiphan.org /etc/nginx/sites-enabled/', check: function (s) { return hasSites(s, 'wildcard.haiphan.org'); } },
    { text: 'Kiểm tra cú pháp rồi nạp lại Nginx', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return !!liveSrv(s, '*.haiphan.org'); }, transient: true },
    { text: 'Vào lại tutor.haiphan.org: vẫn ra ứng dụng Next.js, vì tên chính xác thắng wildcard', hint: 'curl -s -H "Host: tutor.haiphan.org" http://127.0.0.1/', check: function (s) { return cnt(s, /curl .*Host: tutor\.haiphan\.org/) >= 2; } },
    { text: 'Vào blog.haiphan.org: không có server riêng nên wildcard nhận, ra trang tĩnh', hint: 'curl -s -H "Host: blog.haiphan.org" http://127.0.0.1/', check: R(/curl .*Host: blog\.haiphan\.org/) },
    { text: 'Vào haiphan.org (tên gốc): wildcard KHÔNG khớp, lại rơi vào default_server', hint: 'curl -s -H "Host: haiphan.org" http://127.0.0.1/', check: function (s) { return saw(s, /Host: haiphan\.org /); } },
    { text: 'Đổi server_name thành .haiphan.org (có dấu chấm đầu) để khớp cả tên gốc', hint: "sudo sed -i 's/server_name \\*\\.haiphan\\.org;/server_name .haiphan.org;/' /etc/nginx/sites-available/wildcard.haiphan.org", check: function (s) { return /server_name \.haiphan\.org;/.test(txt(s, '/etc/nginx/sites-available/wildcard.haiphan.org')); } },
    { text: 'Nạp lại cấu hình sau khi sửa', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return !!liveSrv(s, '.haiphan.org'); } },
    { text: 'Thử lại haiphan.org: lần này có trang', hint: 'curl -s -H "Host: haiphan.org" http://127.0.0.1/', check: R(/curl .*Host: haiphan\.org /) },

    { text: 'Đọc site lab.haiphan.org: mỗi location trả về nhãn của chính nó', hint: 'cat /etc/nginx/sites-available/lab.haiphan.org', check: R(/cat .*lab\.haiphan\.org/) },
    { text: 'Thử /about: chỉ có prefix / khớp', hint: 'curl -s -H "Host: lab.haiphan.org" http://127.0.0.1/about', check: R(/lab\.haiphan\.org http:\/\/127\.0\.0\.1\/about/) },
    { text: 'Thử /img/a.txt: prefix dài nhất là /img/', hint: 'curl -s -H "Host: lab.haiphan.org" http://127.0.0.1/img/a.txt', check: R(/lab\.haiphan\.org http:\/\/127\.0\.0\.1\/img\/a\.txt/) },
    { text: 'Thử /img/pic.png: regex thắng prefix thường', hint: 'curl -s -H "Host: lab.haiphan.org" http://127.0.0.1/img/pic.png', check: R(/lab\.haiphan\.org http:\/\/127\.0\.0\.1\/img\/pic\.png/) },
    { text: 'Thử /img/raw/pic.png: ^~ chặn regex', hint: 'curl -s -H "Host: lab.haiphan.org" http://127.0.0.1/img/raw/pic.png', check: R(/lab\.haiphan\.org http:\/\/127\.0\.0\.1\/img\/raw\/pic\.png/) },
    { text: 'Thử /logo.png: khớp chính xác (=) thắng tất cả', hint: 'curl -s -H "Host: lab.haiphan.org" http://127.0.0.1/logo.png', check: R(/lab\.haiphan\.org http:\/\/127\.0\.0\.1\/logo\.png/) },
    { text: 'Bỏ ^~ khỏi location /img/raw/ để xem hậu quả', hint: "sudo sed -i 's#location ^~ /img/raw/#location /img/raw/#' /etc/nginx/sites-available/lab.haiphan.org", check: function (s) { return !/\^~/.test(txt(s, '/etc/nginx/sites-available/lab.haiphan.org')); } },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var l = liveLoc(s, 'lab.haiphan.org', '/img/raw/'); return !!l && l.mod === ''; } },
    { text: 'Gọi lại /img/raw/pic.png: giờ regex "nuốt" mất, nhãn đã đổi', hint: 'curl -s -H "Host: lab.haiphan.org" http://127.0.0.1/img/raw/pic.png', check: function (s) { return cnt(s, /lab\.haiphan\.org http:\/\/127\.0\.0\.1\/img\/raw\/pic\.png/) >= 2; } },

    { text: 'Xem các dòng proxy_pass trong site API', hint: 'grep -n proxy_pass /etc/nginx/sites-available/api-tutor.haiphan.org', check: R(/grep -n proxy_pass .*api-tutor/) },
    { text: 'Cố ý thêm dấu / ở cuối proxy_pass (thay 8888; bằng 8888/;)', hint: "sudo sed -i 's#8888;#8888/;#' /etc/nginx/sites-available/api-tutor.haiphan.org", check: function (s) { return /8888\/;/.test(txt(s, '/etc/nginx/sites-available/api-tutor.haiphan.org')); }, transient: true },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return /8888\/$/.test(locDir(s, API, '/api/', 'proxy_pass') || ''); }, transient: true },
    { text: 'Gọi lại /api/users: ứng dụng nhận /users nên trả 404 "Cannot GET /users"', hint: 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/api/users', check: function (s) { return cnt(s, /Host: api-tutor\.haiphan\.org .*\/api\/users/) >= 2; } },
    { text: 'Chữa: bỏ dấu / thừa', hint: "sudo sed -i 's#8888/;#8888;#' /etc/nginx/sites-available/api-tutor.haiphan.org", check: function (s) { return !/8888\/;/.test(txt(s, '/etc/nginx/sites-available/api-tutor.haiphan.org')); } },
    { text: 'Nạp lại cấu hình', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { return /8888$/.test(locDir(s, API, '/api/', 'proxy_pass') || ''); } },
    { text: 'Gọi lại: về bình thường', hint: 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/api/users', check: function (s) { return cnt(s, /Host: api-tutor\.haiphan\.org .*\/api\/users/) >= 3; } },

    { text: 'SPA: lấy file thật /assets/app.js', hint: 'curl -s -H "Host: spa.haiphan.org" http://127.0.0.1/assets/app.js', check: R(/spa\.haiphan\.org .*assets\/app\.js/) },
    { text: 'SPA: đường dẫn không có file (/courses/12) vẫn trả trang chính nhờ try_files', hint: 'curl -s -H "Host: spa.haiphan.org" http://127.0.0.1/courses/12', check: R(/spa\.haiphan\.org .*courses\/12/) },
    { text: 'Chuyển hướng vĩnh viễn /old-blog/post-1 sang /blog/post-1 (xem mã 301 và Location)', hint: 'curl -sI -H "Host: spa.haiphan.org" http://127.0.0.1/old-blog/post-1', check: R(/spa\.haiphan\.org .*old-blog/) },

    { text: 'Đọc log không sudo: bị từ chối vì log chỉ root và nhóm adm đọc được', hint: 'tail /var/log/nginx/access.log', check: function (s) { return failedCmd(s, /^tail .*access\.log/); } },
    { text: 'Đọc 5 dòng cuối access.log bằng sudo', hint: 'sudo tail -n 5 /var/log/nginx/access.log', check: R(/sudo tail .*access\.log/) },
    { text: 'Đếm số yêu cầu theo mã trạng thái', hint: "sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn", check: R(/awk \{print \$9\}/) },
    { text: '5 địa chỉ IP gọi nhiều nhất', hint: "sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -5", check: R(/awk \{print \$1\} /) },
    { text: 'Các URL trả 404 nhiều nhất', hint: "sudo awk '$9 == 404 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head", check: R(/awk \$9 == 404/) },
    { text: 'Tìm các IP dò quét wp-login hoặc .env', hint: "sudo grep -E 'wp-login|\\.env' /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn", check: R(/grep -E wp-login/) },
    { text: 'Liệt kê yêu cầu chậm hơn 1 giây (cột cuối rt=...)', hint: "sudo awk '$NF ~ /rt=[1-9]/ {print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -5", check: R(/awk \$NF ~ \/rt=/) },
    { text: 'Đếm số lỗi 5xx', hint: "sudo awk '$9 >= 500' /var/log/nginx/access.log | wc -l", check: R(/awk \$9 >= 500/) },
    { text: 'Xem báo cáo tổng hợp bằng GoAccess', hint: 'sudo goaccess /var/log/nginx/access.log --log-format=COMBINED', check: R(/goaccess /) },

    { text: 'Khai báo log_format timing (cấp http, trong conf.d) có $request_time và $upstream_response_time', hint: SU('/etc/nginx/conf.d/log-timing.conf', LOGFMT), check: function (s) { return /log_format timing/.test(txt(s, '/etc/nginx/conf.d/log-timing.conf')); } },
    { text: 'Cho site tutor ghi log riêng với format timing', hint: SU('/etc/nginx/sites-available/tutor.haiphan.org', TUT_TIMING), check: function (s) { return /access_log \/var\/log\/nginx\/tutor\.access\.log timing;/.test(txt(s, '/etc/nginx/sites-available/tutor.haiphan.org')); } },
    { text: 'Kiểm tra cú pháp và nạp lại', hint: 'sudo nginx -t && sudo systemctl reload nginx', check: function (s) { var l = live(s), sv = liveSrv(s, TUT); return !!l && !!l.http.logFormats && !!l.http.logFormats.timing && !!sv && sv.stmts.some(function (x) { return x.name === 'access_log' && x.args[1] === 'timing'; }); } },
    { text: 'Tạo một yêu cầu tới tutor để sinh dòng log mới', hint: 'curl -s -H "Host: tutor.haiphan.org" http://127.0.0.1/api-demo', check: function (s) { return /urt=/.test(txt(s, '/var/log/nginx/tutor.access.log')); }, transient: true },
    { text: 'Đọc log riêng của site tutor', hint: 'sudo cat /var/log/nginx/tutor.access.log', check: R(/sudo cat .*tutor\.access\.log/) },
    { text: 'Gây lỗi 502: site legacy trỏ vào cổng 9000 không có ai nghe', hint: 'curl -s -H "Host: legacy.haiphan.org" http://127.0.0.1/', check: R(/curl .*legacy\.haiphan\.org/) },
    { text: 'Xem lý do trong error.log', hint: 'sudo tail -n 3 /var/log/nginx/error.log', check: R(/sudo tail .*error\.log/) },
    { text: 'Đếm số lần "Connection refused" trong error.log', hint: "sudo grep -c 'Connection refused' /var/log/nginx/error.log", check: R(/grep -c Connection refused/) },
    { text: 'Gây 404 file thật: xin /nope.html ở blog.haiphan.org', hint: 'curl -s -H "Host: blog.haiphan.org" http://127.0.0.1/nope.html', check: R(/blog\.haiphan\.org .*nope\.html/) },
    { text: 'Tìm dòng "open() failed" tương ứng trong error.log', hint: "sudo grep 'No such file' /var/log/nginx/error.log", check: R(/grep No such file/) },
    { text: 'Đổi mức error_log từ mặc định (error) sang warn trong nginx.conf', hint: "sudo sed -i 's#error_log /var/log/nginx/error.log;#error_log /var/log/nginx/error.log warn;#' /etc/nginx/nginx.conf", check: function (s) { return /error_log \/var\/log\/nginx\/error\.log warn;/.test(txt(s, '/etc/nginx/nginx.conf')); } },

    { text: 'Đọc cấu hình logrotate của Nginx', hint: 'cat /etc/logrotate.d/nginx', check: R(/cat .*logrotate\.d\/nginx/) },
    { text: 'Chạy thử (dry-run) logrotate, không thay đổi gì', hint: 'sudo logrotate -d /etc/logrotate.d/nginx', check: R(/logrotate -d/) },
    { text: 'Ép xoay log ngay', hint: 'sudo logrotate -f /etc/logrotate.d/nginx', check: function (s) { return !!(s.W.logrot && s.W.logrot.count >= 1); } },
    { text: 'Xem thư mục log: có access.log.1 và access.log mới rỗng', hint: 'sudo ls -l /var/log/nginx', check: R(/sudo ls -l \/var\/log\/nginx/) },
    { text: 'Phân tích bản log cũ vừa xoay (.1)', hint: "sudo awk '{print $9}' /var/log/nginx/access.log.1 | sort | uniq -c", check: R(/awk .*access\.log\.1/) }
  ]
};

var ADMIN_DUP = ['server {', '    listen 80;', '    server_name tutor.haiphan.org;', '', '    location / {', '        proxy_pass http://127.0.0.1:3100;', '    }', '}'];
var ADMIN_OK = ADMIN_DUP.slice(); ADMIN_OK[2] = '    server_name admin.haiphan.org;';
var TUT_UPLOADS = ['server {', '    listen 80;', '    server_name tutor.haiphan.org;', '    root /var/www/tutor;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '    }', '    location /uploads/ {', '        root /var/www;', '    }', '    location ~* \\.(png|jpg|css|js)$ {', '        expires 7d;', '    }', '}'];
var SPA_BUG = ['server {', '    listen 80;', '    server_name spa.haiphan.org;', '    root /var/www/spa/dist;', '    index index.html;', '', '    location / {', '        try_files $uri $uri/ /index.html;', '    }', '}'];
var API_SLOW_FIX = ['server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location /api/ {', '        proxy_pass http://127.0.0.1:8888;', '    }', '', '    location = /api/reports/monthly {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_read_timeout 120s;', '    }', '', '    location = /health {', '        proxy_pass http://127.0.0.1:8888;', '    }', '}'];

D.debugs = [
  {
    id: 'c3b1', title: 'Thêm site admin xong, trang chính hiện Admin panel',
    host: 'vps', user: 'haidangphan',
    symptom: L('Vừa thêm admin.haiphan.org (sao chép file từ tutor) rồi reload.', '', '$ curl -s http://tutor.haiphan.org/', '<!doctype html><title>Admin</title><h1>Admin panel</h1>', '', '$ curl -s http://admin.haiphan.org/', '(Empty reply from server)', '', 'Khách vào trang chính thấy giao diện quản trị.'),
    story: 'Bạn sao chép site tutor thành site admin cho ứng dụng cổng 3100. Sau khi nạp lại, hai tên miền như bị đảo: trang chính ra giao diện quản trị, còn admin lại không có phản hồi. Đọc kết quả `nginx -t` rồi sửa cho từng tên miền về đúng ứng dụng.',
    goal: 'tutor.haiphan.org trả ứng dụng Tutor (cổng 3000), admin.haiphan.org trả Admin panel (cổng 3100).',
    hints: ['`sudo nginx -t` in cảnh báo `conflicting server name "tutor.haiphan.org" ... ignored`. Hai file cùng khai báo một tên, khối nạp trước thắng.', '`ls /etc/nginx/sites-enabled/` cho thấy `admin.haiphan.org` đứng trước `tutor.haiphan.org` theo chữ cái, nên nó thắng. `grep -n server_name /etc/nginx/sites-available/*` để so sánh tên của hai file.', 'Sửa `server_name` trong file `admin.haiphan.org` thành `admin.haiphan.org`, rồi `sudo nginx -t && sudo systemctl reload nginx` và thử lại bằng `curl -H "Host: ..."`.'],
    fix: ['sudo nginx -t', 'grep -n server_name /etc/nginx/sites-available/admin.haiphan.org', "sudo sed -i 's/server_name tutor.haiphan.org;/server_name admin.haiphan.org;/' /etc/nginx/sites-available/admin.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx', 'curl -s -H "Host: admin.haiphan.org" http://127.0.0.1/'],
    cause: 'Sao chép file site mà quên đổi `server_name` khiến hai server cùng tên trên cổng 80. Nginx chỉ cảnh báo (không báo lỗi), giữ khối nạp trước (admin.haiphan.org, đứng trước theo chữ cái) và bỏ qua khối sau, nên tutor bị admin chiếm còn tên admin không khớp ai, rơi vào default_server `return 444`. Luôn đọc cảnh báo của `nginx -t` và `grep server_name` sau khi sao chép site.',
    setup: function (s) { B.base(s, {}); s.W.dns['admin.haiphan.org'] = { ip: V.IP, proxied: false }; C.site(s, 'admin.haiphan.org', ADMIN_DUP.join('\n') + '\n'); V.ngReload(s, false); },
    check: function (s) { return status(s, TUT, '/') === 200 && /Tutor/.test(bodyOf(s, TUT, '/')) && status(s, 'admin.haiphan.org', '/') === 200 && /Admin panel/.test(bodyOf(s, 'admin.haiphan.org', '/')); }
  },
  {
    id: 'c3b2', title: 'Frontend gọi /api/users nhận JSON "Cannot GET /users"',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -s https://api-tutor.haiphan.org/api/users', '{"message":"Cannot GET /users","error":"Not Found","statusCode":404}', '', 'Sau đợt dọn dẹp cấu hình hôm qua, mọi route /api/* trả 404 JSON. /health vẫn 200. Log ứng dụng cũng ghi nhận GET /users.'),
    story: 'Đây không phải trang 404 của Nginx mà là JSON của NestJS, nghĩa là yêu cầu đã tới được ứng dụng nhưng đường dẫn bị đổi. Tìm dòng cấu hình làm biến `/api/users` thành `/users`.',
    goal: 'GET /api/users qua Nginx trả 200 và ứng dụng nhận đúng đường dẫn /api/users; /health vẫn 200.',
    hints: ['Phân biệt nguồn lỗi: HTML 404 là Nginx, JSON "Cannot GET /users" là ứng dụng. Ứng dụng nhận `/users` còn khách gửi `/api/users`: đường dẫn đã bị cắt tiền tố `/api`.', '`grep -n proxy_pass /etc/nginx/sites-available/api-tutor.haiphan.org`: nhìn cuối dòng `proxy_pass` trong `location /api/`.', 'Bỏ dấu `/` ở cuối `http://127.0.0.1:8888/` (hoặc đổi thành `http://127.0.0.1:8888/api/`), rồi `sudo nginx -t && sudo systemctl reload nginx` và thử lại.'],
    fix: ['curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/api/users', 'grep -n proxy_pass /etc/nginx/sites-available/api-tutor.haiphan.org', "sudo sed -i 's#http://127.0.0.1:8888/;#http://127.0.0.1:8888;#' /etc/nginx/sites-available/api-tutor.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx', 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/api/users'],
    cause: '`proxy_pass http://127.0.0.1:8888/;` có phần URI (`/`), nên phần khớp location `/api/` bị thay bằng `/` và ứng dụng nhận `/users`. Bỏ dấu `/` để chuyển nguyên URI, hoặc viết rõ `http://127.0.0.1:8888/api/` nếu muốn giữ tiền tố. Dấu hiệu nhận biết: 404 dạng JSON của framework chứ không phải trang HTML của Nginx.',
    setup: function (s) { B.base(s, { sites: { 'api-tutor.haiphan.org': APISLASH.join('\n') + '\n' } }); },
    check: function (s) { return status(s, API, '/api/users') === 200 && /"path":"\/api\/users"/.test(bodyOf(s, API, '/api/users')) && status(s, API, '/health') === 200; }
  },
  {
    id: 'c3b3', title: 'Thêm cache cho file tĩnh xong, ảnh avatar 404',
    host: 'vps', user: 'haidangphan',
    symptom: L('Sau commit "thêm expires cho static", toàn bộ ảnh trong /uploads/ bị 404:', '', '$ curl -sI https://tutor.haiphan.org/uploads/a.png', 'HTTP/1.1 404 Not Found', '', 'Trên đĩa file vẫn còn: /var/www/uploads/a.png. Các file /assets/app.js vẫn bình thường.'),
    story: 'Trước đây ảnh trong `/uploads/` được phục vụ từ `/var/www/uploads`. Sau khi thêm một location regex để đặt `expires 7d`, ảnh bỗng 404 dù file còn nguyên. Lỗi nằm ở vòng chọn location, không phải ở file.',
    goal: 'GET /uploads/a.png trả 200 (nội dung từ /var/www/uploads), /assets/app.js vẫn 200.',
    hints: ['Hỏi: URI `/uploads/a.png` khớp location nào? Nó có đuôi `.png` nên có thể bị location regex lấy trước location prefix `/uploads/`. Nếu vậy `root` được dùng là của server (`/var/www/tutor`), không phải `/var/www`.', '`grep -n -A3 location /etc/nginx/sites-available/tutor.haiphan.org`: so sánh `location /uploads/` và `location ~* \\.(png|jpg|css|js)$`.', 'Đổi `location /uploads/` thành `location ^~ /uploads/` để prefix này chặn regex, rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['grep -n -A3 location /etc/nginx/sites-available/tutor.haiphan.org', "sudo sed -i 's#location /uploads/ {#location ^~ /uploads/ {#' /etc/nginx/sites-available/tutor.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx', 'curl -s -H "Host: tutor.haiphan.org" http://127.0.0.1/uploads/a.png'],
    cause: 'Prefix thường (`/uploads/`) chỉ là ứng viên tạm; regex `~* \\.(png|jpg|css|js)$` khớp `/uploads/a.png` và thắng. Location regex không có `root` riêng nên dùng `/var/www/tutor` của server, nơi không có file. `^~` làm prefix chặn bước xét regex. Với các file khác (`/assets/app.js`) regex vẫn đúng nhờ `root` của server.',
    setup: function (s) { B.base(s, { sites: { 'tutor.haiphan.org': TUT_UPLOADS.join('\n') + '\n' } }); },
    check: function (s) { return status(s, TUT, '/uploads/a.png') === 200 && /PNGDATA/.test(bodyOf(s, TUT, '/uploads/a.png')) && status(s, TUT, '/assets/app.js') === 200; }
  },
  {
    id: 'c3b4', title: 'Deploy SPA mới: mọi trang trả 500',
    host: 'vps', user: 'haidangphan',
    symptom: L('Sau khi deploy bản frontend mới:', '', '$ curl -sI https://spa.haiphan.org/courses/12', 'HTTP/1.1 500 Internal Server Error', '', 'Cả trang chủ và /assets/app.js cũng lỗi. Trước deploy mọi thứ bình thường.'),
    story: 'Quy trình deploy đặt bản build vào `/var/www/spa/current`. Hôm nay có người sửa cấu hình Nginx cho "đúng cấu trúc thư mục mới". Hãy để error.log nói cho bạn biết chuyện gì xảy ra.',
    goal: 'spa.haiphan.org trả 200 cho / , /courses/12 (trang chính qua try_files) và /assets/app.js.',
    hints: ['`curl -sI -H "Host: spa.haiphan.org" http://127.0.0.1/courses/12` để tái hiện, rồi `sudo tail -n 3 /var/log/nginx/error.log`.', 'Log nói `rewrite or internal redirection cycle ... "/index.html"`: `try_files` rơi xuống phương án cuối `/index.html` mà file này cũng không tìm thấy nên lặp vô hạn. Kiểm tra `root` có tồn tại không: `ls /var/www/spa/`.', 'Đổi `root /var/www/spa/dist;` thành `root /var/www/spa/current;`, rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['curl -s -H "Host: spa.haiphan.org" http://127.0.0.1/courses/12', 'sudo tail -n 3 /var/log/nginx/error.log', 'ls /var/www/spa/', "sudo sed -i 's#root /var/www/spa/dist;#root /var/www/spa/current;#' /etc/nginx/sites-available/spa.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx', 'curl -s -H "Host: spa.haiphan.org" http://127.0.0.1/courses/12'],
    cause: '`root` trỏ vào thư mục không tồn tại (`dist`) nên `/index.html` không có. Phương án dự phòng của `try_files` là chuyển hướng nội bộ, bị lặp lại cho tới giới hạn 10 lần và trả 500, log ghi `rewrite or internal redirection cycle`. Khi gặp 500 của Nginx, error.log gần như luôn chỉ thẳng nguyên nhân; đối chiếu `root` với cấu trúc thư mục deploy.',
    setup: function (s) { B.base(s, { sites: { 'spa.haiphan.org': SPA_BUG.join('\n') + '\n' } }); var e = txt(s, '/var/log/nginx/error.log'); s.fs.put('/var/log/nginx/error.log', e + '2026/10/27 12:55:41 [error] 1021#1021: *77 rewrite or internal redirection cycle while internally redirecting to "/index.html", client: 203.0.113.7, server: spa.haiphan.org, request: "GET /courses/12 HTTP/1.1", host: "spa.haiphan.org"\n', { owner: 'root', mode: M('640') }); },
    check: function (s) { return status(s, 'spa.haiphan.org', '/') === 200 && status(s, 'spa.haiphan.org', '/courses/12') === 200 && /SPA shell/.test(bodyOf(s, 'spa.haiphan.org', '/courses/12')) && status(s, 'spa.haiphan.org', '/assets/app.js') === 200; }
  },
  {
    id: 'c3b5', hard: true, title: 'Báo cáo tháng luôn lỗi 504 sau đúng 60 giây',
    host: 'vps', user: 'haidangphan',
    symptom: L('Nút "Xuất báo cáo tháng" quay đúng một phút rồi báo lỗi:', '', '504 Gateway Time-out', '', 'Các API khác (/api/users, /api/courses) bình thường. Kế toán cần báo cáo trước giờ họp. Ứng dụng vẫn sống, chỉ endpoint này lỗi.'),
    story: 'Không có gợi ý chi tiết. Hãy dùng log để tìm quy luật (mã trạng thái, thời gian, thông điệp), rồi sửa Nginx sao cho báo cáo chạy được mà không làm ảnh hưởng các endpoint khác.',
    goal: '/api/reports/monthly trả 200; chỉ nới timeout cho đúng endpoint này, không đặt chung cho server hay cả /api/; các API khác vẫn 200.',
    hints: ['Lọc access.log theo `/api/reports/monthly` và nhìn mã trạng thái cùng cột thời gian cuối dòng (`rt=`). Sau đó `sudo grep timed /var/log/nginx/error.log`.', 'Mọi lần 504 đều `rt=60.001`: đúng giá trị mặc định của `proxy_read_timeout`. Ứng dụng cần khoảng 75 giây cho báo cáo này.', 'Thêm `location = /api/reports/monthly { proxy_pass http://127.0.0.1:8888; proxy_read_timeout 120s; }` vào site API (location khớp chính xác thắng `/api/`), rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ["sudo awk '$7 == \"/api/reports/monthly\" {print $9, $NF}' /var/log/nginx/access.log | sort | uniq -c", "sudo grep timed /var/log/nginx/error.log", SU('/etc/nginx/sites-available/api-tutor.haiphan.org', API_SLOW_FIX), 'sudo nginx -t && sudo systemctl reload nginx', 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/api/reports/monthly'],
    cause: 'Log cho thấy một quy luật rõ: mọi yêu cầu tới `/api/reports/monthly` đều 504 với thời gian đúng 60.001 giây, error.log ghi `upstream timed out (110)`. 60s là mặc định của `proxy_read_timeout`, trong khi báo cáo cần khoảng 75s. Nới timeout **chỉ cho location của endpoint đó** (location khớp chính xác thắng `/api/`) để không giữ kết nối treo lâu cho mọi API. Về lâu dài nên đưa báo cáo nặng thành tác vụ nền hoặc tối ưu truy vấn.',
    setup: function (s) { B.base(s, { slow: true }); },
    check: function (s) {
      var sv = liveSrv(s, API), apiLoc = liveLoc(s, API, '/api/');
      if (!sv || !apiLoc) return false;
      var globalTO = sv.stmts.some(function (x) { return x.name === 'proxy_read_timeout'; }) || apiLoc.stmts.some(function (x) { return x.name === 'proxy_read_timeout'; });
      return !globalTO && status(s, API, '/api/reports/monthly') === 200 && status(s, API, '/api/users') === 200;
    }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
