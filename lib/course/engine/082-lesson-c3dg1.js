(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.NGD;
function R(re) { return function (s) { return ran(s, re); }; }
function RA(re) { return function (s) { return s.hist.some(function (h) { return re.test(h.cmd); }); }; }
function RF(re) { return function (s) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function SU(path, ls) { return 'sudo tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function live(s) { return s.W.nginx && s.W.nginx.active ? s.W.nginx.live : null; }
function liveSrv(s, name) { var l = live(s); return l ? l.servers.filter(function (x) { return x.names.indexOf(name) >= 0; })[0] : null; }
function liveLoc(s, name, path) { var sv = liveSrv(s, name); return sv ? sv.locs.filter(function (l) { return l.path === path; })[0] : null; }
function locDir(s, name, path, d) { var l = liveLoc(s, name, path); if (!l) return null; var f = l.stmts.filter(function (x) { return x.name === d; })[0]; return f ? f.args.join(' ') : null; }
function dirOf(s, d) { var l = live(s); return l && l.http.dir ? l.http.dir[d] || null : null; }
function hasSet(s, path, hdr) { var l = liveLoc(s, TUT, path); return !!l && l.stmts.some(function (x) { return x.name === 'proxy_set_header' && String(x.args[0]).toLowerCase() === hdr.toLowerCase(); }); }
function request(s, scheme, host, path, headers, meta) {
  var W = s.W, sv = W.ngx2req, sm = W.ngx2meta; W.ngx2req = headers || {}; W.ngx2meta = meta || null;
  try { return V.ngReq(s, scheme, host, scheme === 'https' ? 443 : 80, path); } catch (e) { return { kind: 'err' }; } finally { W.ngx2req = sv; W.ngx2meta = sm; }
}
function st(s, scheme, host, path, h, m) { var r = request(s, scheme, host, path, h, m); return r.kind === 'resp' ? r.status : (r.kind === 'empty' ? 0 : -1); }
function hasHdr(r, name, re) { return (r.adds || []).some(function (a) { return a.name.toLowerCase() === name.toLowerCase() && (!re || re.test(a.value)); }); }
var TUT = 'tutor.haiphan.org', MB = 1048576;
var SITE = '/etc/nginx/sites-available/tutor.haiphan.org';

/* ---- các khối cấu hình ---- */
var WSMAP = ['map $http_upgrade $connection_upgrade {', '    default upgrade;', "    ''      close;", '}'];
function wsBlock(level) {
  var a = ['    location /socket.io/ {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_http_version 1.1;', '        proxy_set_header Upgrade $http_upgrade;', '        proxy_set_header Connection $connection_upgrade;', '        proxy_set_header Host $host;'];
  if (level >= 2) a.push('        proxy_read_timeout 3600s;');
  return a.concat(['    }', '']);
}
var EVENTS = ['    location /api/events {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_http_version 1.1;', '        proxy_set_header Connection "";', '        proxy_buffering off;', '        proxy_cache off;', '        proxy_read_timeout 1h;', '        add_header X-Accel-Buffering no;', '    }', ''];
var UPLOAD = ['    location = /api/upload {', '        client_max_body_size 100m;', '        proxy_request_buffering off;', '        proxy_pass http://127.0.0.1:8888;', '    }', ''];
var FWD = ['        proxy_set_header Host $host;', '        proxy_set_header X-Real-IP $remote_addr;', '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', '        proxy_set_header X-Forwarded-Proto $scheme;', '        proxy_set_header X-Request-Id $request_id;'];
var CORS = ['        add_header Access-Control-Allow-Origin "https://admin.haiphan.org" always;', '        if ($request_method = OPTIONS) {', '            add_header Access-Control-Allow-Origin "https://admin.haiphan.org" always;', '            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;', '            add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;', '            add_header Access-Control-Max-Age 86400;', '            return 204;', '        }'];
function apiBlock(kind) {
  var a = ['    location /api/ {', '        proxy_pass http://127.0.0.1:8888;'];
  if (kind === 'fwd' || kind === 'cors') a = a.concat(FWD);
  if (kind === 'cors') a = a.concat(CORS);
  return a.concat(['    }', '']);
}
function authBlock(kind) {
  var a = ['    location /auth/ {', '        proxy_pass http://127.0.0.1:8888;', '        proxy_set_header Host $host;'];
  if (kind === 'buf' || kind === 'xfp') a.push('        proxy_buffer_size 16k;');
  if (kind === 'xfp') a.push('        proxy_set_header X-Forwarded-Proto $scheme;');
  return a.concat(['    }']);
}
/* o: {ws:0|1|2, events, upload, api:'plain'|'fwd'|'cors', auth:'plain'|'buf'|'xfp'} */
function cfg(o) {
  o = o || {};
  return B.site({ ws: o.ws ? wsBlock(o.ws) : null, events: o.events ? EVENTS : null, upload: o.upload ? UPLOAD : null, api: apiBlock(o.api || 'plain'), auth: authBlock(o.auth || 'plain') });
}
function siteTxt(o) { return cfg(o).join('\n') + '\n'; }
var BIGCOOKIE = "printf 'Cookie: sess=%s\\n' \"$(seq -s '' 2500)\" > /tmp/bigcookie.txt";
function bigHeaders() { var v = ''; for (var i = 1; i <= 2500; i++) v += i; return { cookie: 'sess=' + v }; }
function mkDocker(host) { return ['server {', '    listen 8090;', '    server_name _;', '', '    location / {', '        proxy_pass http://' + host + ';', '    }', '}']; }

var D = { id: 'c3d', group: 'Web server', short: 'Nginx (4): kết nối dài, upload, Docker', title: 'Nginx (4): kết nối dài, upload, header và Docker', dek: 'WebSocket và SSE qua reverse proxy, giới hạn kích thước upload và header (413, 400, 502 "too big header"), header chuyển tiếp X-Forwarded-*, CORS, và đặt Nginx phía trước container Docker.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c3c') idx = i; });
C.lessons.splice(idx + 1, 0, D);

D.theory = [
  { tag: 'Khái niệm', title: 'Kết nối dài: vì sao WebSocket và SSE hay "chết" sau Nginx', body: [
    'Request HTTP bình thường kết thúc sau vài trăm mili giây. Với chat, thông báo, bảng điểm trực tiếp, kết nối được giữ mở hàng phút hoặc hàng giờ. Reverse proxy mặc định được thiết kế cho loại ngắn, nên có bốn chỗ dễ gãy:',
    { tbl: [['Kiểu', 'Đặc điểm', 'Chỗ Nginx can thiệp'], ['WebSocket', 'Bắt đầu bằng HTTP, rồi "nâng cấp" thành kênh hai chiều (mã 101)', 'Phải truyền `Upgrade` và `Connection`, dùng HTTP/1.1 tới upstream'], ['SSE (Server-Sent Events)', 'Một chiều, server đẩy từng đoạn `data:` qua phản hồi không kết thúc', 'Phải tắt `proxy_buffering`, tăng `proxy_read_timeout`'], ['Long polling', 'Client treo yêu cầu cho tới khi có dữ liệu', 'Tăng `proxy_read_timeout`'], ['Tải lên / tải xuống lớn', 'Một yêu cầu dài vì lượng dữ liệu', '`client_max_body_size`, `proxy_request_buffering`, timeout']] },
    { ul: ['Nginx đóng kết nối **rảnh** quá `proxy_read_timeout` (mặc định **60 giây**): đó là lý do WebSocket "tự rớt sau đúng 1 phút" nếu hai bên không gửi ping.', 'Ứng dụng nên gửi ping định kỳ (socket.io mặc định mỗi 25 giây) và Nginx đặt timeout lớn hơn khoảng ping nhiều lần.', 'Cloudflare cũng có giới hạn riêng: kết nối WebSocket được giữ nhưng yêu cầu HTTP thường bị cắt sau 100 giây không có phản hồi (mã 524).']}
  ] },
  { tag: 'Cú pháp', title: 'Cấu hình WebSocket chuẩn: map + Upgrade + HTTP/1.1', body: [
    'Trình duyệt gửi `Upgrade: websocket` và `Connection: Upgrade`. Đây là hai header **hop-by-hop**: Nginx không tự chuyển tiếp chúng, bạn phải đặt lại. Nginx cũng mặc định nói chuyện HTTP/1.0 với upstream, không có upgrade.',
    { pre: ['# /etc/nginx/conf.d/websocket.conf  (cấp http)', 'map $http_upgrade $connection_upgrade {', '    default upgrade;', "    ''      close;", '}', '', '# trong khối server', 'location /socket.io/ {', '    proxy_pass http://127.0.0.1:8888;', '    proxy_http_version 1.1;', '    proxy_set_header Upgrade $http_upgrade;', '    proxy_set_header Connection $connection_upgrade;', '    proxy_set_header Host $host;', '    proxy_read_timeout 3600s;', '}'], cap: 'Khuôn mẫu WebSocket cho socket.io' },
    { tbl: [['Thiếu gì', 'Hiện tượng'], ['`proxy_http_version 1.1`', 'Nginx gửi HTTP/1.0, server trả 400 hoặc không nâng cấp'], ['`Upgrade` / `Connection`', 'Trình duyệt thấy `400`/`426`, socket.io lùi về long polling (chậm, tốn tải)'], ['`proxy_read_timeout` lớn', 'Rớt đều đặn sau 60 giây rảnh'], ['`map` cho Connection', 'Nếu cố định `Connection upgrade`, các yêu cầu thường (không Upgrade) cũng bị đánh dấu sai']] },
    { ul: ['Thử bằng `wscat -c ws://host/socket.io/?EIO=4&transport=websocket`: thành công in `Connected`; thất bại in `Unexpected server response: 400`.', 'Chỉ đặt các header này trong location cần WebSocket, không đặt cho toàn site.']}
  ] },
  { tag: 'Cú pháp', title: 'SSE và phản hồi dạng luồng', body: [
    'SSE trả `Content-Type: text/event-stream` và gửi từng khối `data: ...`. Nếu Nginx **đệm** (buffer), khách chỉ nhận dữ liệu khi bộ đệm đầy hoặc khi kết thúc: trông như "server đứng im rồi đổ ra cùng lúc".',
    { pre: ['location /api/events {', '    proxy_pass http://127.0.0.1:8888;', '    proxy_http_version 1.1;', '    proxy_set_header Connection "";', '    proxy_buffering off;', '    proxy_cache off;', '    proxy_read_timeout 1h;', '    add_header X-Accel-Buffering no;   # ứng dụng cũng có thể gửi header này để tự tắt đệm', '}'], cap: 'Luồng sự kiện không bị đệm' },
    { ul: ['`proxy_buffering off` chỉ nên đặt ở location luồng; tắt toàn cục làm hại hiệu năng API thường.', 'Dùng `curl -N URL` (`--no-buffer`) để xem dữ liệu đến từng đoạn.', 'Với gzip bật: nén làm gom dữ liệu, SSE nên loại trừ khỏi `gzip_types` hoặc tắt gzip trong location đó.']}
  ] },
  { tag: 'Khái niệm', title: 'Upload lớn: client_max_body_size và mã 413', body: [
    'Mặc định Nginx chỉ nhận thân yêu cầu tối đa **1 MB**. Vượt quá, khách nhận `413 Request Entity Too Large` ngay khi Nginx đọc `Content-Length`, ứng dụng không hề nhìn thấy yêu cầu.',
    { tbl: [['Chỉ thị', 'Mặc định', 'Tác dụng'], ['`client_max_body_size`', '1m', 'Trần kích thước thân yêu cầu; `0` là không giới hạn'], ['`client_body_timeout`', '60s', 'Thời gian chờ giữa hai lần đọc thân (client gửi quá chậm bị ngắt)'], ['`proxy_request_buffering`', 'on', 'Nginx đọc hết thân vào đĩa/bộ nhớ rồi mới gửi cho ứng dụng; `off` là truyền thẳng'], ['`client_body_buffer_size`', '8k/16k', 'Thân nhỏ hơn giữ trong RAM, lớn hơn ghi file tạm']] },
    { pre: ['server {', '    client_max_body_size 1m;          # mặc định hợp lý cho cả site', '', '    location = /api/upload {', '        client_max_body_size 100m;    # nới riêng cho đường upload', '        proxy_request_buffering off;  # không ghi file tạm 100MB lên đĩa', '        proxy_pass http://127.0.0.1:8888;', '    }', '}'], cap: 'Chỉ nới giới hạn ở nơi cần' },
    { ul: ['Nới toàn site thành `1g` là cách làm nhanh nhưng mở cửa cho tải giả làm đầy đĩa và RAM. Nới theo location.', 'Nhìn log: error.log ghi `client intended to send too large body: N bytes`.', 'Phải cộng giới hạn ở tầng khác: Cloudflare (gói Free tối đa 100 MB mỗi yêu cầu), giới hạn của ứng dụng (multer, Nest `limits`).']}
  ] },
  { tag: 'Khái niệm', title: 'Header và cookie quá lớn: 400, 414 và large_client_header_buffers', body: [
    'Nginx đọc dòng yêu cầu và từng header vào bộ đệm. Một dòng vượt cỡ đệm lớn nhất thì bị từ chối:',
    { tbl: [['Giới hạn', 'Mặc định', 'Vượt thì', 'Gặp khi'], ['Dòng yêu cầu (`GET /đường-dẫn?query HTTP/1.1`)', '8k', '`414 Request-URI Too Large`', 'Query string dài, token trên URL'], ['Một dòng header', '8k', '`400 Request Header Or Cookie Too Large`', 'Cookie phình to, JWT chứa nhiều quyền'], ['Tổng số bộ đệm lớn', '4 bộ đệm', 'Như trên', 'Nhiều cookie của nhiều ứng dụng cùng tên miền']] },
    { pre: ['# cấp http hoặc server', 'large_client_header_buffers 4 16k;   # 4 bộ đệm, mỗi bộ 16 KB'], cap: 'Nới giới hạn header' },
    { ul: ['Nguyên nhân gốc thường là **cookie tích tụ** (tracking, session lưu cả dữ liệu) chứ không phải thiếu cấu hình: nới `16k` chỉ để đệm, nên rút gọn cookie/JWT về lâu dài.', 'Triệu chứng đặc trưng: lỗi 400 chỉ xảy ra với một số người dùng, xoá cookie là hết.', 'Lỗi 400 này nằm ở **Nginx**, không phải ứng dụng: ứng dụng không có log cho yêu cầu đó.']}
  ] },
  { tag: 'Lưu ý', title: '502 "upstream sent too big header": phản hồi có header quá lớn', body: [
    'Chiều ngược lại cũng có giới hạn: header **phản hồi** từ ứng dụng phải nằm gọn trong `proxy_buffer_size` (mặc định bằng 1 trang bộ nhớ: 4k hoặc 8k). Ứng dụng đặt `Set-Cookie` lớn, nhiều `Link` preload, hoặc JWT dài trong header sẽ làm Nginx trả **502**.',
    { pre: ['2026/10/27 13:21:15 [error] ... upstream sent too big header while reading response header from upstream, upstream: "http://127.0.0.1:8888/auth/login"'], cap: 'Dấu hiệu trong error.log' },
    { pre: ['location /auth/ {', '    proxy_pass http://127.0.0.1:8888;', '    proxy_buffer_size 16k;           # vùng đệm cho header phản hồi', '    proxy_buffers 8 16k;', '    proxy_busy_buffers_size 32k;', '}'], cap: 'Tăng vùng đệm header phản hồi' },
    { ul: ['Kinh nghiệm: đăng nhập OAuth/SSO hay gặp, vì ứng dụng gửi nhiều cookie phiên cùng lúc.', 'Hai lỗi dễ nhầm: `400 Header Or Cookie Too Large` (header **yêu cầu** từ khách, chữa bằng `large_client_header_buffers`) và `502 too big header` (header **phản hồi** từ app, chữa bằng `proxy_buffer_size`).']}
  ] },
  { tag: 'Khái niệm', title: 'Header chuyển tiếp: ứng dụng cần biết khách là ai', body: [
    'Ứng dụng đứng sau Nginx chỉ thấy kết nối từ `127.0.0.1` qua HTTP. Mọi thông tin gốc phải đi qua header:',
    { tbl: [['Header', 'Giá trị nên đặt', 'Ứng dụng dùng để'], ['`Host`', '`$host`', 'Tạo URL tuyệt đối, chọn tenant theo tên miền (mặc định Nginx gửi `127.0.0.1:cổng`)'], ['`X-Real-IP`', '`$remote_addr`', 'IP khách (ghi log, giới hạn tần suất)'], ['`X-Forwarded-For`', '`$proxy_add_x_forwarded_for`', 'Chuỗi IP đi qua các proxy: `khách, proxy1, proxy2`'], ['`X-Forwarded-Proto`', '`$scheme`', 'Biết khách dùng https để tạo liên kết, cookie `Secure`, redirect'], ['`X-Request-Id`', '`$request_id`', 'Cùng một mã trong log Nginx và log ứng dụng để lần theo yêu cầu']] },
    { ul: ['`$proxy_add_x_forwarded_for` = `X-Forwarded-For` từ khách (nếu có) + `, $remote_addr`. Khách có thể giả mạo phần đầu, chỉ tin phần do proxy của mình thêm vào.', 'Sau Cloudflare, `$remote_addr` là IP của Cloudflare. Dùng `set_real_ip_from` + `real_ip_header CF-Connecting-IP` để Nginx khôi phục IP khách trước khi chuyển tiếp.', 'Đặt header trong `location` sẽ **thay thế hoàn toàn** các `proxy_set_header` kế thừa từ `server`. Vì vậy hay gom chúng vào một file snippet (xem chương Nginx 6).']}
  ] },
  { tag: 'Lưu ý', title: 'Chuyển hướng sai scheme/host và proxy_redirect', body: [
    'Triệu chứng kinh điển: đăng nhập xong khách bị chuyển tới `http://...` (hoặc `http://127.0.0.1:8888/...`) trong khi họ đang ở https. Ứng dụng tạo địa chỉ chuyển hướng từ những gì nó nhìn thấy:',
    { tbl: [['Ứng dụng thấy', 'Địa chỉ nó tạo', 'Cách chữa'], ['`Host: 127.0.0.1:8888`, không có X-Forwarded-Proto', '`http://127.0.0.1:8888/dashboard`', '`proxy_set_header Host $host;` và `X-Forwarded-Proto $scheme;`'], ['`Host: tutor.haiphan.org`, thiếu X-Forwarded-Proto', '`http://tutor.haiphan.org/dashboard` (hạ cấp xuống http)', '`proxy_set_header X-Forwarded-Proto $scheme;` (và bật tin cậy proxy trong app)'], ['Đủ cả hai nhưng app bỏ qua header', 'Vẫn sai', 'Cấu hình app: `trust proxy` (Express/Nest), `USE_X_FORWARDED_*`']] },
    { ul: ['`proxy_redirect default` (mặc định) chỉ viết lại `Location` khớp với địa chỉ trong `proxy_pass`; nếu Host đã là `$host` thì không khớp nên không được viết lại.', 'Viết lại thủ công khi cần: `proxy_redirect http://127.0.0.1:8888/ /;` hoặc tắt hẳn với `proxy_redirect off;`.', 'Cookie cũng có thể mang miền/đường dẫn sai: `proxy_cookie_domain internal.local tutor.haiphan.org;`, `proxy_cookie_path /app/ /;`, `proxy_cookie_flags ~ secure samesite=lax;`.']}
  ] },
  { tag: 'Cú pháp', title: 'CORS trong Nginx: preflight OPTIONS', body: [
    'Khi trang `https://admin.haiphan.org` gọi API ở `https://tutor.haiphan.org`, trình duyệt gửi trước một yêu cầu **preflight** `OPTIONS` để hỏi quyền. Phải trả 204 kèm các header `Access-Control-*`, nếu không yêu cầu thật sẽ bị chặn ngay tại trình duyệt.',
    { pre: ['location /api/ {', '    proxy_pass http://127.0.0.1:8888;', '    add_header Access-Control-Allow-Origin "https://admin.haiphan.org" always;', '', '    if ($request_method = OPTIONS) {', '        add_header Access-Control-Allow-Origin "https://admin.haiphan.org" always;', '        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;', '        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;', '        add_header Access-Control-Max-Age 86400;', '        return 204;', '    }', '}'], cap: 'CORS cho đúng một origin' },
    { ul: ['Luôn dùng `always`: nếu không, header biến mất trên phản hồi lỗi (4xx/5xx) và trình duyệt báo lỗi CORS che mất lỗi thật.', 'Không dùng `*` cùng với cookie/Authorization: trình duyệt từ chối. Liệt kê origin cụ thể hoặc dùng `map` để phản chiếu origin hợp lệ.', 'Chỉ xử lý CORS ở **một** nơi. Nếu cả Nginx lẫn ứng dụng đều thêm `Access-Control-Allow-Origin`, trình duyệt thấy hai giá trị và từ chối.', '`if` trong location chấp nhận được cho `return`; đừng nhồi logic khác vào đó.']}
  ] },
  { tag: 'Khái niệm', title: 'Nginx đứng trước Docker: ba cách nối', body: [
    'Ứng dụng chạy trong container, Nginx chạy trên host. Có ba mô hình, mỗi mô hình có cạm bẫy riêng:',
    { tbl: [['Mô hình', 'Cấu hình', 'Ưu', 'Cạm bẫy'], ['Cổng công bố vào loopback', 'Compose: `ports: "127.0.0.1:8881:3000"`; Nginx: `proxy_pass http://127.0.0.1:8881;`', 'Đơn giản, địa chỉ cố định, không lộ ra Internet', 'Phải nhớ gắn `127.0.0.1`; viết `8881:3000` sẽ mở cổng ra ngoài, vòng qua tường lửa ufw'], ['Cùng mạng Docker (Nginx cũng là container)', '`proxy_pass http://api:3000;` (tên service)', 'Không công bố cổng, DNS nội bộ', 'Chỉ chạy được **trong** mạng Docker; Nginx trên host không phân giải được `api`'], ['Host network / IP container', '`proxy_pass http://172.18.0.5:3000;`', 'Nhanh để thử', 'IP đổi khi tạo lại container: 502 sau mỗi lần deploy']] },
    { ul: ['Lỗi `host not found in upstream "api"` khi chạy `nginx -t` nghĩa là Nginx trên host không có DNS của Docker: dùng cổng công bố vào `127.0.0.1`.', 'Tên miền trong `proxy_pass` được phân giải **một lần lúc nạp cấu hình** rồi nhớ mãi. Container tạo lại có IP mới, Nginx vẫn gọi IP cũ: `connect() failed ... No route to host` hoặc `Connection refused`, khách thấy 502 cho tới khi `nginx -s reload`.', 'Cổng đã bị chiếm kiểm tra bằng `ss -ltnp`; container nghe trên `127.0.0.1` bên trong sẽ không truy cập được từ ngoài container: ứng dụng phải nghe `0.0.0.0`.']}
  ] },
  { tag: 'Cú pháp', title: 'Phân giải tên động: resolver và proxy_pass bằng biến', body: [
    'Khi Nginx cũng chạy trong Docker và backend là service được tạo lại thường xuyên, hãy bắt Nginx phân giải lại theo thời gian thay vì chỉ một lần:',
    { pre: ['resolver 127.0.0.11 valid=10s ipv6=off;      # DNS nhúng của Docker', '', 'location /api/ {', '    set $api_upstream http://api:3000;', '    proxy_pass $api_upstream;                 # dùng biến => phân giải lúc có yêu cầu', '}'], cap: 'Phân giải lại mỗi 10 giây' },
    { ul: ['Với `proxy_pass` có biến, Nginx **không** tự cắt tiền tố location: nếu cần giữ phần đuôi hãy dùng `rewrite ... break;` hoặc ghép `$request_uri`.', 'Nginx không báo lỗi khi nạp cấu hình nếu tên chưa tồn tại (nó chỉ lỗi lúc có yêu cầu), nên lỗi cấu hình dễ lọt vào production. Kiểm tra bằng một yêu cầu thật sau khi reload.', 'Thay thế: blue/green bằng cách đổi dòng `server` trong `upstream` giữa hai cổng (8881 xanh, 8882 lam) rồi `nginx -s reload`: nạp cấu hình mới không làm rớt các kết nối đang xử lý.']}
  ] },
  { tag: 'Mẹo', title: 'Quy trình chẩn đoán lỗi qua proxy', body: [
    { tbl: [['Triệu chứng', 'Kiểm tra đầu tiên', 'Nguyên nhân thường gặp'], ['WebSocket báo 400, lùi về polling', '`wscat -c ws://...` và `curl -si -H "Upgrade: websocket"`', 'Thiếu `proxy_http_version 1.1`, `Upgrade`, `Connection`'], ['WebSocket rớt đều sau 60 giây', 'Thời điểm rớt trong DevTools, `proxy_read_timeout`', 'Timeout mặc định, app không ping'], ['SSE hiện dữ liệu một lần ở cuối', '`curl -N` có dữ liệu từng đoạn không', '`proxy_buffering on`, gzip trên luồng'], ['Upload 413', 'error.log: `too large body`', '`client_max_body_size` mặc định 1m'], ['Một số người dùng bị 400', 'Kích thước cookie trong DevTools', 'Cookie phình, `large_client_header_buffers`'], ['Đăng nhập SSO ra 502', 'error.log: `too big header`', '`proxy_buffer_size` nhỏ'], ['Đăng nhập xong về http hoặc 127.0.0.1', '`curl -sI .../auth/callback`', 'Thiếu `Host`/`X-Forwarded-Proto`'], ['Trình duyệt báo CORS', 'DevTools: preflight OPTIONS trả mã gì', 'Không xử lý OPTIONS, thiếu `always`, trùng header'], ['`host not found in upstream`', '`nginx -t`', 'Dùng tên service Docker từ Nginx trên host'], ['502 sau mỗi lần deploy container', '`docker inspect` IP, error.log', 'Dùng IP container hoặc tên đã bị nhớ, cần cổng công bố hoặc resolver']] }
  ] }
];

D.quiz = [
  { q: 'WebSocket qua Nginx báo `400` và socket.io lùi về long polling. Thiếu gì nhiều khả năng nhất?', opts: ['`gzip on`', '`proxy_http_version 1.1` cùng `Upgrade` và `Connection` trong location', '`worker_processes auto`', 'Chứng chỉ SSL'], ans: 1, why: 'Upgrade và Connection là header hop-by-hop, Nginx không tự chuyển; đồng thời mặc định nói HTTP/1.0 với upstream nên không nâng cấp được.' },
  { q: 'Tại sao dùng `map $http_upgrade $connection_upgrade` thay vì cố định `Connection upgrade`?', opts: ['Để tăng tốc gzip', 'Để các yêu cầu thường (không có Upgrade) nhận `Connection: close`, không bị coi nhầm là WebSocket', 'Vì map bắt buộc với HTTP/1.1', 'Để Nginx ghi log nhiều hơn'], ans: 1, why: 'Khi header Upgrade trống map trả `close`, khi có thì trả `upgrade`. Cố định upgrade làm mọi yêu cầu đều mang ý định nâng cấp.' },
  { q: 'WebSocket đang mở rồi rớt đều đặn sau đúng 60 giây không ai gửi dữ liệu. Nguyên nhân khả dĩ nhất?', opts: ['Chứng chỉ hết hạn', '`proxy_read_timeout` mặc định 60s đóng kết nối rảnh', 'Cloudflare chặn', 'Ổ đĩa đầy'], ans: 1, why: 'Nginx đóng kết nối nếu không có dữ liệu từ upstream trong proxy_read_timeout. Tăng timeout và cho ứng dụng gửi ping định kỳ.' },
  { q: 'Luồng SSE chỉ hiện dữ liệu ở cuối cùng, không đến từng đoạn. Cách chữa trong location của luồng?', opts: ['`proxy_buffering off;`', '`client_max_body_size 0;`', '`gzip_comp_level 9;`', '`worker_connections 4096;`'], ans: 0, why: 'Bộ đệm phản hồi giữ dữ liệu lại cho tới khi đầy hoặc kết thúc. Tắt đệm cho riêng location luồng, đồng thời tăng read timeout.' },
  { q: 'Người dùng tải video 25 MB lên và nhận `413`. Giới hạn mặc định của Nginx là bao nhiêu?', opts: ['1 MB', '10 MB', '100 MB', 'Không giới hạn'], ans: 0, why: 'client_max_body_size mặc định 1m. Vượt quá thì Nginx trả 413 trước khi ứng dụng nhìn thấy yêu cầu.' },
  { q: 'Cách tốt nhất để cho phép upload 100 MB?', opts: ['Đặt `client_max_body_size 100m;` chỉ trong `location = /api/upload`', 'Đặt `client_max_body_size 0;` ở cấp http', 'Tắt Nginx', 'Tăng `worker_processes`'], ans: 0, why: 'Nới giới hạn theo location giữ phần còn lại của site chống được yêu cầu khổng lồ. Mở toàn cục là rủi ro làm đầy đĩa/RAM.' },
  { q: '`proxy_request_buffering off;` cho upload lớn có tác dụng gì?', opts: ['Nginx truyền thân yêu cầu thẳng cho ứng dụng thay vì ghi hết vào file tạm trước', 'Tắt kiểm tra kích thước', 'Nén thân yêu cầu', 'Bật cache'], ans: 0, why: 'Mặc định Nginx đọc hết thân rồi mới chuyển tiếp. Tắt đệm giảm I/O đĩa và độ trễ nhưng ứng dụng nhận dữ liệu chậm theo tốc độ của khách.' },
  { q: 'Một số người dùng vào site nhận `400 Request Header Or Cookie Too Large`; xoá cookie thì hết. Điều chỉnh nào đúng?', opts: ['`large_client_header_buffers 4 16k;` và rút gọn cookie', '`proxy_buffer_size 16k;` duy nhất', '`client_max_body_size 50m;`', '`keepalive_timeout 0;`'], ans: 0, why: 'Lỗi do header yêu cầu quá lớn, chữa bằng large_client_header_buffers. proxy_buffer_size lo header phản hồi và client_max_body_size lo thân yêu cầu.' },
  { q: 'Error.log ghi `upstream sent too big header while reading response header from upstream`. Chỉ thị cần chỉnh?', opts: ['`proxy_buffer_size`', '`large_client_header_buffers`', '`client_body_timeout`', '`gzip_min_length`'], ans: 0, why: 'Đây là header phản hồi từ ứng dụng vượt vùng đệm; tăng proxy_buffer_size (kèm proxy_buffers, proxy_busy_buffers_size nếu cần).' },
  { q: 'Ứng dụng đứng sau Nginx tạo liên kết `http://127.0.0.1:8888/...` thay vì tên miền thật. Cấu hình thiếu?', opts: ['`proxy_set_header Host $host;`', '`proxy_cache on;`', '`listen 443 ssl;`', '`root /var/www;`'], ans: 0, why: 'Không đặt Host, Nginx gửi `127.0.0.1:cổng` (giá trị $proxy_host). Ứng dụng dùng Host để dựng URL tuyệt đối.' },
  { q: 'Đã đặt `Host $host`, nhưng sau đăng nhập khách trên https bị chuyển tới `http://tutor.haiphan.org/dashboard`. Thêm gì?', opts: ['`proxy_set_header X-Forwarded-Proto $scheme;` (và cho ứng dụng tin cậy proxy)', '`add_header X-Frame-Options DENY;`', '`gzip on;`', '`expires 30d;`'], ans: 0, why: 'Ứng dụng nhận kết nối http từ Nginx nên tự dựng liên kết http, trừ khi được báo scheme gốc qua X-Forwarded-Proto.' },
  { q: '`$proxy_add_x_forwarded_for` cho giá trị gì khi khách gửi sẵn `X-Forwarded-For: 1.2.3.4`?', opts: ['`1.2.3.4, <remote_addr của Nginx>`', 'Chỉ `1.2.3.4`', 'Chỉ remote_addr', 'Rỗng'], ans: 0, why: 'Biến nối $remote_addr vào chuỗi sẵn có. Vì khách có thể tự điền phần đầu, chỉ tin phần do proxy mình thêm.' },
  { q: 'Vì sao nên dùng `always` trong `add_header Access-Control-Allow-Origin ... always;`?', opts: ['Để header cũng có mặt ở phản hồi lỗi 4xx/5xx, tránh lỗi CORS che mất lỗi thật', 'Để tăng tốc', 'Để bỏ qua kiểm tra origin', 'Bắt buộc với HTTP/2'], ans: 0, why: 'Mặc định add_header chỉ áp dụng cho một số mã thành công. Với always, trình duyệt luôn thấy header và hiển thị đúng lỗi.' },
  { q: 'Preflight CORS của trình duyệt dùng phương thức nào và nên được Nginx trả mã nào?', opts: ['`OPTIONS`, trả `204` kèm Access-Control-Allow-*', '`HEAD`, trả `200` rỗng', '`POST`, trả `302`', '`GET`, trả `404`'], ans: 0, why: 'Preflight là OPTIONS. Trả 204 không nội dung cùng các header cho phép origin, phương thức, header.' },
  { q: 'Nginx cài trên host, ứng dụng là service `api` trong Docker Compose. `proxy_pass http://api:3000;` làm `nginx -t` báo `host not found in upstream "api"`. Cách đúng?', opts: ['Công bố cổng `127.0.0.1:8881:3000` và `proxy_pass http://127.0.0.1:8881;`', 'Thêm `resolver 8.8.8.8;`', 'Đổi sang `listen 8881;`', 'Cài lại Docker'], ans: 0, why: 'DNS tên service chỉ có trong mạng Docker. Từ host hãy dùng cổng được công bố vào loopback (đừng bỏ 127.0.0.1, kẻo mở cổng ra Internet).' },
  { q: 'Sau mỗi lần tạo lại container, Nginx trả 502 cho tới khi reload; `proxy_pass` dùng tên host. Nguyên nhân?', opts: ['Nginx phân giải tên một lần lúc nạp cấu hình và nhớ IP cũ', 'Chứng chỉ SSL đổi', 'Đĩa đầy', 'Cloudflare cache'], ans: 0, why: 'Tên trong proxy_pass tĩnh chỉ được phân giải khi load. Dùng cổng cố định trên host, hoặc resolver với proxy_pass bằng biến để phân giải lại định kỳ.' },
  { q: 'Ghi `ports: "8881:3000"` (không có 127.0.0.1) trong Compose có rủi ro gì?', opts: ['Cổng 8881 mở trên mọi giao diện, truy cập thẳng từ Internet và vòng qua ufw', 'Container không chạy', 'Nginx từ chối', 'Không có rủi ro'], ans: 0, why: 'Docker tự thêm quy tắc iptables bỏ qua ufw. Gắn 127.0.0.1 để chỉ Nginx trên cùng máy truy cập được.' }
];

var RELOAD = 'sudo nginx -t && sudo systemctl reload nginx';
var WSURL = 'ws://tutor.haiphan.org/socket.io/?EIO=4&transport=websocket';
D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, {}); },
  items: [
    /* A. WebSocket và SSE */
    { text: 'Gọi socket.io bằng HTTP thường (polling): hoạt động bình thường', hint: 'curl -s "http://tutor.haiphan.org/socket.io/?EIO=4&transport=polling"', check: R(/curl -s .*socket\.io\/\?EIO=4&transport=polling/) },
    { text: 'Thử WebSocket thật: bị từ chối với 400', hint: 'wscat -c "' + WSURL + '"', check: RF(/wscat -c .*socket\.io/) },
    { text: 'Xem cấu hình hiện tại của site', hint: 'cat ' + SITE, check: R(/cat \/etc\/nginx\/sites-available\/tutor\.haiphan\.org/) },
    { text: 'Tạo map Upgrade -> Connection (cấp http)', hint: SU('/etc/nginx/conf.d/websocket.conf', WSMAP), check: function (s) { return /map \$http_upgrade \$connection_upgrade/.test(txt(s, '/etc/nginx/conf.d/websocket.conf')); } },
    { text: 'Viết lại site: location /socket.io/ có HTTP/1.1, Upgrade, Connection', hint: SU(SITE, cfg({ ws: 1 })), check: function (s) { return /proxy_set_header Upgrade \$http_upgrade/.test(txt(s, SITE)); } },
    { text: 'Kiểm tra cú pháp và nạp lại', hint: RELOAD, check: function (s) { return locDir(s, TUT, '/socket.io/', 'proxy_http_version') === '1.1'; } },
    { text: 'WebSocket lại: Connected', hint: 'wscat -c "' + WSURL + '"', check: R(/wscat -c .*socket\.io/) },
    { text: 'Giữ kết nối rảnh 90 giây: bị rớt (mã 1006) vì proxy_read_timeout mặc định 60s', hint: 'wscat -c "' + WSURL + '" --idle 90', check: RF(/--idle 90/) },
    { text: 'Thêm proxy_read_timeout 3600s cho location WebSocket', hint: SU(SITE, cfg({ ws: 2 })), check: function (s) { return /proxy_read_timeout 3600s/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return locDir(s, TUT, '/socket.io/', 'proxy_read_timeout') === '3600s'; } },
    { text: 'Thử giữ rảnh 90 giây lần nữa: kết nối sống', hint: 'wscat -c "' + WSURL + '" --idle 90', check: R(/--idle 90/) },
    { text: 'Thêm location /api/events cho SSE: tắt proxy_buffering, read timeout 1h', hint: SU(SITE, cfg({ ws: 2, events: true })), check: function (s) { return /proxy_buffering off/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return locDir(s, TUT, '/api/events', 'proxy_buffering') === 'off'; } },
    { text: 'Đọc luồng sự kiện không đệm (-N)', hint: 'curl -N http://tutor.haiphan.org/api/events', check: R(/curl -N .*api\/events/) },

    /* B. Upload */
    { text: 'Xem các file thử trong ~/uploads (small.txt, avatar.png 2MB, lesson.mp4 25MB)', hint: 'ls -lh uploads', check: R(/ls -lh uploads/) },
    { text: 'Upload file nhỏ: thành công', hint: 'curl -s -X POST -F file=@uploads/small.txt http://tutor.haiphan.org/api/upload', check: R(/uploads\/small\.txt.*api\/upload/) },
    { text: 'Upload video 25MB: chỉ in mã trạng thái, nhận 413', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -F file=@uploads/lesson.mp4 http://tutor.haiphan.org/api/upload', check: R(/lesson\.mp4.*api\/upload/) },
    { text: 'Xem error.log để thấy lý do chính xác', hint: 'sudo tail -n 2 /var/log/nginx/error.log', check: R(/tail -n 2 \/var\/log\/nginx\/error\.log/) },
    { text: 'Nới riêng location = /api/upload lên 100m và tắt proxy_request_buffering', hint: SU(SITE, cfg({ ws: 2, events: true, upload: true })), check: function (s) { return /client_max_body_size 100m/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return locDir(s, TUT, '/api/upload', 'client_max_body_size') === '100m'; } },
    { text: 'Upload video 25MB lại: thành công (200)', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -F file=@uploads/lesson.mp4 http://tutor.haiphan.org/api/upload', check: function (s) { return cnt(s, /lesson\.mp4.*api\/upload/) >= 2; } },
    { text: 'Đường khác vẫn giữ giới hạn 1m: ảnh 2MB gửi /api/profile nhận 413', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -F file=@uploads/avatar.png http://tutor.haiphan.org/api/profile', check: R(/avatar\.png.*api\/profile/) },

    /* C. Header lớn */
    { text: 'Tạo header Cookie rất dài (khoảng 8.9 KB) vào /tmp/bigcookie.txt', hint: BIGCOOKIE, check: function (s) { var n = s.fs.get('/tmp/bigcookie.txt'); return !!n && (n.c || '').length > 8000; } },
    { text: 'Gửi yêu cầu kèm cookie đó: 400 Request Header Or Cookie Too Large', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -H @/tmp/bigcookie.txt http://tutor.haiphan.org/api/me', check: R(/-H @\/tmp\/bigcookie\.txt.*api\/me/) },
    { text: 'Nới bộ đệm header: 4 bộ đệm, mỗi bộ 16k (cấp http)', hint: SU('/etc/nginx/conf.d/headers.conf', ['large_client_header_buffers 4 16k;']), check: function (s) { return /large_client_header_buffers 4 16k/.test(txt(s, '/etc/nginx/conf.d/headers.conf')); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { var d = dirOf(s, 'large_client_header_buffers'); return !!d && d.join(' ') === '4 16k'; } },
    { text: 'Gửi lại cùng yêu cầu: 200', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" -H @/tmp/bigcookie.txt http://tutor.haiphan.org/api/me', check: function (s) { return cnt(s, /bigcookie\.txt.*api\/me/) >= 2; } },
    { text: 'Gọi /auth/login: 502 (ứng dụng trả header Set-Cookie lớn)', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" http://tutor.haiphan.org/auth/login', check: R(/-w %\{http_code\}.*auth\/login/) },
    { text: 'Tìm nguyên nhân trong error.log', hint: 'sudo grep "too big header" /var/log/nginx/error.log', check: R(/grep too big header/) },
    { text: 'Thêm proxy_buffer_size 16k vào location /auth/', hint: SU(SITE, cfg({ ws: 2, events: true, upload: true, auth: 'buf' })), check: function (s) { return /proxy_buffer_size 16k/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return locDir(s, TUT, '/auth/', 'proxy_buffer_size') === '16k'; } },
    { text: 'Gọi lại /auth/login: 200', hint: 'curl -s -o /dev/null -w "%{http_code}\\n" http://tutor.haiphan.org/auth/login', check: function (s) { return cnt(s, /-w %\{http_code\}.*auth\/login/) >= 2; } },

    /* D. Header chuyển tiếp */
    { text: 'Xem ứng dụng thấy gì khi chưa đặt header (Host là 127.0.0.1:8888)', hint: 'curl -s http://tutor.haiphan.org/api/whoami', check: R(/curl -s http:\/\/tutor\.haiphan\.org\/api\/whoami$/) },
    { text: 'Đặt Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto, X-Request-Id cho /api/', hint: SU(SITE, cfg({ ws: 2, events: true, upload: true, auth: 'buf', api: 'fwd' })), check: function (s) { return /proxy_set_header X-Real-IP \$remote_addr/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return hasSet(s, '/api/', 'X-Real-IP'); } },
    { text: 'Gọi lại whoami với XFF giả: thấy chuỗi "1.2.3.4, 127.0.0.1"', hint: 'curl -s -H "X-Forwarded-For: 1.2.3.4" http://tutor.haiphan.org/api/whoami', check: R(/X-Forwarded-For: 1\.2\.3\.4.*whoami/) },
    { text: 'Xem Location sau đăng nhập khi khách dùng https: đang bị hạ xuống http', hint: 'curl -sI https://tutor.haiphan.org/auth/callback', check: R(/curl -sI https:\/\/tutor\.haiphan\.org\/auth\/callback/) },
    { text: 'Thêm X-Forwarded-Proto vào location /auth/', hint: SU(SITE, cfg({ ws: 2, events: true, upload: true, auth: 'xfp', api: 'fwd' })), check: function (s) { return /location \/auth\/ \{[^}]*X-Forwarded-Proto/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { return hasSet(s, '/auth/', 'X-Forwarded-Proto'); } },
    { text: 'Gọi lại /auth/callback: Location đã là https', hint: 'curl -sI https://tutor.haiphan.org/auth/callback', check: function (s) { return cnt(s, /curl -sI https:\/\/tutor\.haiphan\.org\/auth\/callback/) >= 2; } },

    /* E. CORS */
    { text: 'Gửi preflight OPTIONS khi chưa cấu hình CORS: không có Access-Control-*', hint: 'curl -si -X OPTIONS -H "Origin: https://admin.haiphan.org" http://tutor.haiphan.org/api/courses', check: R(/-X OPTIONS.*api\/courses/) },
    { text: 'Thêm CORS cho origin admin.haiphan.org (có xử lý OPTIONS trả 204)', hint: SU(SITE, cfg({ ws: 2, events: true, upload: true, auth: 'xfp', api: 'cors' })), check: function (s) { return /Access-Control-Allow-Origin/.test(txt(s, SITE)); } },
    { text: 'Nạp lại cấu hình', hint: RELOAD, check: function (s) { var l = liveLoc(s, TUT, '/api/'); return !!l && l.stmts.some(function (x) { return x.name === 'if'; }); } },
    { text: 'Preflight lại: 204 kèm Allow-Methods', hint: 'curl -si -X OPTIONS -H "Origin: https://admin.haiphan.org" http://tutor.haiphan.org/api/courses', check: function (s) { return cnt(s, /-X OPTIONS.*api\/courses/) >= 2; } },
    { text: 'Yêu cầu GET thật cũng có Access-Control-Allow-Origin', hint: 'curl -sI http://tutor.haiphan.org/api/courses', check: R(/curl -sI http:\/\/tutor\.haiphan\.org\/api\/courses/) },

    /* F. Docker */
    { text: 'Xem các cổng đang nghe: container API công bố 8881 vào 127.0.0.1', hint: 'ss -ltn', check: R(/ss -ltn/) },
    { text: 'Thử proxy_pass bằng tên service Compose (api) trong conf.d', hint: SU('/etc/nginx/conf.d/docker-api.conf', mkDocker('api:8888')), check: function (s) { return /http:\/\/api:8888/.test(txt(s, '/etc/nginx/conf.d/docker-api.conf')); }, transient: true },
    { text: 'Kiểm tra cú pháp: host not found in upstream "api"', hint: 'sudo nginx -t', check: RF(/nginx -t/) },
    { text: 'Đổi sang cổng công bố vào loopback 127.0.0.1:8881', hint: SU('/etc/nginx/conf.d/docker-api.conf', mkDocker('127.0.0.1:8881')), check: function (s) { return /http:\/\/127\.0\.0\.1:8881/.test(txt(s, '/etc/nginx/conf.d/docker-api.conf')); } },
    { text: 'Kiểm tra cú pháp và nạp lại', hint: RELOAD, check: function (s) { var l = live(s); return !!l && l.servers.some(function (x) { return x.listens.some(function (q) { return q.port === 8090; }); }); } },
    { text: 'Gọi cổng 8090: Nginx tới container 8881', hint: 'curl -s http://127.0.0.1:8090/health', check: R(/curl -s http:\/\/127\.0\.0\.1:8090\/health/) }
  ]
};

var WSREQ = { upgrade: 'websocket', connection: 'Upgrade' };
function wsReq(s) { return request(s, 'http', TUT, '/socket.io/?EIO=4&transport=websocket', WSREQ); }
D.debugs = [
  {
    id: 'c3dg1', title: 'Chat realtime không kết nối được WebSocket: báo 400',
    host: 'vps', user: 'haidangphan',
    symptom: L('Trang chat của học viên cứ "đang kết nối lại", DevTools hiện:', '', 'WebSocket connection to \'wss://tutor.haiphan.org/socket.io/?EIO=4&transport=websocket\' failed: Error during WebSocket handshake: Unexpected response code: 400', '', '$ wscat -c "ws://tutor.haiphan.org/socket.io/?EIO=4&transport=websocket"', 'error: Unexpected server response: 400', '', 'Polling vẫn chạy nên chat có tin nhắn nhưng chậm và nặng tải. API 8888 hoàn toàn bình thường.'),
    story: 'Ứng dụng socket.io chạy tốt khi gọi thẳng cổng 8888 trên máy chủ. Vấn đề chỉ xuất hiện qua Nginx, và chỉ với WebSocket chứ không phải polling. Xem location /socket.io/ đang truyền những gì tới ứng dụng.',
    goal: 'wscat kết nối WebSocket thành công qua Nginx (Connected).',
    hints: ['`cat /etc/nginx/sites-available/tutor.haiphan.org`: location `/socket.io/` chỉ có `proxy_pass`. Nginx mặc định gửi HTTP/1.0 và bỏ hai header `Upgrade`/`Connection`.', 'Cần ba thứ trong location: `proxy_http_version 1.1;`, `proxy_set_header Upgrade $http_upgrade;`, `proxy_set_header Connection $connection_upgrade;`. Biến `$connection_upgrade` lấy từ `map` đặt ở cấp http (file trong `conf.d/`).', 'Tạo `/etc/nginx/conf.d/websocket.conf` có `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; }`, thêm ba dòng vào location, rồi `sudo nginx -t && sudo systemctl reload nginx` và thử lại `wscat`.'],
    fix: ['wscat -c "' + WSURL + '"', 'cat ' + SITE, SU('/etc/nginx/conf.d/websocket.conf', WSMAP), SU(SITE, cfg({ ws: 1 })), RELOAD, 'wscat -c "' + WSURL + '"'],
    cause: 'Upgrade và Connection là header hop-by-hop, Nginx không chuyển tiếp chúng, và mặc định nói HTTP/1.0 với upstream. Không có `Upgrade: websocket` tới ứng dụng, bước bắt tay không thành (400); socket.io tự lùi về long polling nên chat vẫn "chạy" nhưng kém. Thêm `proxy_http_version 1.1` và hai header, dùng `map` để `Connection` chỉ là `upgrade` khi khách thực sự gửi Upgrade.',
    setup: function (s) { B.base(s, {}); },
    check: function (s) { var r = wsReq(s); return r.kind === 'resp' && r.status === 101; }
  },
  {
    id: 'c3dg2', title: 'WebSocket tự rớt sau đúng một phút',
    host: 'vps', user: 'haidangphan',
    symptom: L('Bảng điểm trực tiếp ngưng cập nhật sau khoảng 1 phút nếu không có điểm mới, F5 mới chạy lại.', '', '$ wscat -c "ws://tutor.haiphan.org/socket.io/?EIO=4&transport=websocket" --idle 90', 'Connected (press CTRL+C to quit)', 'Disconnected (code: 1006, reason: "")', '', 'Đã thêm Upgrade/Connection từ tuần trước nên kết nối được. Mạng của người dùng bình thường.'),
    story: 'Kết nối thiết lập được, nhưng "đứng yên" quá lâu thì bị cắt đúng ranh giới 60 giây: con số tròn này không phải ngẫu nhiên. Tìm timeout nào của Nginx áp dụng cho kết nối rảnh phía upstream.',
    goal: 'Kết nối WebSocket rảnh 90 giây vẫn còn sống (không có Disconnected).',
    hints: ['Thử `wscat ... --idle 90` và để ý rớt. Thử `--idle 30` thì không rớt: ranh giới nằm giữa.', '`grep -n timeout /etc/nginx/sites-available/tutor.haiphan.org`: location WebSocket không có `proxy_read_timeout`, nên dùng mặc định 60s.', 'Thêm `proxy_read_timeout 3600s;` vào location `/socket.io/`, reload, thử lại. (Ứng dụng nên gửi ping mỗi 25 giây để mạng trung gian cũng không cắt.)'],
    fix: ['wscat -c "' + WSURL + '" --idle 90', 'grep -n timeout ' + SITE, SU(SITE, cfg({ ws: 2 })), RELOAD, 'wscat -c "' + WSURL + '" --idle 90'],
    cause: 'Nginx đóng kết nối nếu upstream không gửi dữ liệu trong `proxy_read_timeout` (mặc định 60s). Với WebSocket rảnh, đó là điều xảy ra đúng một phút sau tin cuối. Đặt `proxy_read_timeout` đủ lớn cho location WebSocket (và `proxy_send_timeout` nếu khách gửi thưa), đồng thời để ứng dụng ping định kỳ.',
    setup: function (s) { B.base(s, { conf: { 'websocket.conf': WSMAP.join('\n') + '\n' }, sites: { 'tutor.haiphan.org': siteTxt({ ws: 1 }) } }); },
    check: function (s) { var r = wsReq(s); return r.kind === 'resp' && r.status === 101 && r.wsTimeout >= 90; }
  },
  {
    id: 'c3dg3', title: 'Giảng viên tải video bài giảng lên: 413',
    host: 'vps', user: 'haidangphan',
    symptom: L('Ứng dụng quản trị báo "Tải lên thất bại" với file lesson.mp4 (25 MB); file ảnh nhỏ vẫn tải được.', '', '$ curl -s -o /dev/null -w "%{http_code}\\n" -X POST -F file=@uploads/lesson.mp4 http://tutor.haiphan.org/api/upload', '413', '', 'Nhật ký ứng dụng (pm2 logs api) không có dòng nào cho yêu cầu này.'),
    story: 'Ứng dụng không thấy yêu cầu nghĩa là bị chặn trước đó: chính là Nginx. Cần cho phép upload lớn nhưng không mở toang toàn site: ảnh đại diện 2 MB gửi tới các API khác vẫn nên bị giới hạn như cũ.',
    goal: 'POST 25 MB tới /api/upload trả 200; POST 2 MB tới /api/profile vẫn trả 413.',
    hints: ['`sudo tail -n 2 /var/log/nginx/error.log` có dòng `client intended to send too large body`.', 'Mặc định `client_max_body_size` là 1m. Đặt lại cho **riêng** đường upload thay vì toàn site.', 'Thêm `location = /api/upload { client_max_body_size 100m; proxy_request_buffering off; proxy_pass http://127.0.0.1:8888; }`, reload, rồi thử cả hai yêu cầu (25 MB và 2 MB).'],
    fix: ['sudo tail -n 2 /var/log/nginx/error.log', SU(SITE, cfg({ upload: true })), RELOAD, 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -F file=@uploads/lesson.mp4 http://tutor.haiphan.org/api/upload', 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -F file=@uploads/avatar.png http://tutor.haiphan.org/api/profile'],
    cause: 'Nginx chặn thân yêu cầu lớn hơn `client_max_body_size` (mặc định 1m) bằng 413 trước khi ứng dụng thấy gì. Giải pháp tốt là nới theo location (`= /api/upload`) để các đường khác vẫn có trần thấp, kèm `proxy_request_buffering off` để không ghi file tạm lớn. Nhớ rằng Cloudflare và ứng dụng cũng có giới hạn riêng.',
    setup: function (s) { B.base(s, {}); },
    check: function (s) {
      var M25 = { method: 'POST', bodyLen: 25 * MB }, M2 = { method: 'POST', bodyLen: 2 * MB };
      return st(s, 'http', TUT, '/api/upload', {}, M25) === 200 && st(s, 'http', TUT, '/api/profile', {}, M2) === 413 && st(s, 'http', TUT, '/api/upload', {}, { method: 'POST', bodyLen: 200 * MB }) === 413;
    }
  },
  {
    id: 'c3dg4', title: 'Đăng nhập xong bị đẩy về http, trình duyệt cảnh báo không an toàn',
    host: 'vps', user: 'haidangphan',
    symptom: L('Khách vào https://tutor.haiphan.org, đăng nhập xong thấy thanh địa chỉ chuyển sang http:// và cookie Secure không gửi lại, bị yêu cầu đăng nhập vòng vòng.', '', '$ curl -sI https://tutor.haiphan.org/auth/callback', 'HTTP/1.1 302 Found', 'Location: http://tutor.haiphan.org/dashboard', '', 'Địa chỉ đúng tên miền, chỉ sai scheme.'),
    story: 'Ứng dụng dựng địa chỉ chuyển hướng từ thông tin nó nhận được. Nginx đã gửi Host đúng; xem nó còn thiếu thông tin nào để biết khách đang dùng https.',
    goal: 'Gọi /auth/callback qua https trả Location bắt đầu bằng https://tutor.haiphan.org/.',
    hints: ['`cat /etc/nginx/sites-available/tutor.haiphan.org`: location `/auth/` có `Host $host` nhưng không có header nào nói về scheme.', 'Kết nối Nginx tới ứng dụng là http thuần. Ứng dụng chỉ biết scheme gốc qua `X-Forwarded-Proto`.', 'Thêm `proxy_set_header X-Forwarded-Proto $scheme;` vào location `/auth/`, reload và thử lại. (Ứng dụng Express/Nest cần bật `trust proxy` để dùng header này.)'],
    fix: ['curl -sI https://tutor.haiphan.org/auth/callback', 'cat ' + SITE, SU(SITE, cfg({ auth: 'xfp' })), RELOAD, 'curl -sI https://tutor.haiphan.org/auth/callback'],
    cause: 'Nginx chuyển tiếp qua http nên ứng dụng không biết khách dùng https và dựng `Location` bằng http. `proxy_set_header X-Forwarded-Proto $scheme;` báo scheme gốc (kèm `Host $host` cho tên miền). Nên áp dụng bộ header này cho mọi location proxy, tốt nhất gom vào một snippet để không sót.',
    setup: function (s) { B.base(s, {}); },
    check: function (s) { var r = request(s, 'https', TUT, '/auth/callback'); return r.kind === 'resp' && r.status === 302 && /^https:\/\/tutor\.haiphan\.org\//.test(r.loc || ''); }
  },
  {
    id: 'c3dg5', hard: true, title: 'Một số học viên bị 400, đăng nhập SSO thì 502',
    host: 'vps', user: 'haidangphan',
    symptom: L('Hai nhóm báo lỗi riêng biệt từ sáng nay:', '', '1) Một số học viên (đã dùng site lâu, có nhiều cookie) vào bất kỳ trang API nào cũng thấy:', '   400 Bad Request - Request Header Or Cookie Too Large', '   Mở cửa sổ ẩn danh thì vào được.', '', '2) Đăng nhập SSO (đường /auth/login) cho mọi người dùng ra 502 Bad Gateway, trong khi pm2 báo ứng dụng online.'),
    story: 'Hai lỗi cùng liên quan tới kích thước header nhưng theo hai chiều ngược nhau, và cần hai chỉ thị khác nhau. Đừng sửa mò: đọc error.log và dùng cookie thật (có sẵn file mẫu) để tái hiện từng lỗi, rồi chữa đúng chỗ.',
    goal: 'Yêu cầu /api/me với cookie rất dài trả 200, và /auth/login trả 200 (không còn 502).',
    hints: ['Tạo cookie mẫu: `printf \'Cookie: sess=%s\\n\' "$(seq -s \'\' 2500)" > /tmp/bigcookie.txt` rồi `curl -s -o /dev/null -w "%{http_code}\\n" -H @/tmp/bigcookie.txt http://tutor.haiphan.org/api/me`. Tách riêng `curl .../auth/login` và đọc `error.log`.', 'Lỗi 1 là header **yêu cầu** quá lớn: `large_client_header_buffers` (mặc định 4 8k). Lỗi 2 là error.log `upstream sent too big header`: header **phản hồi** của ứng dụng lớn hơn `proxy_buffer_size` (4k).', 'Tạo `conf.d/headers.conf` với `large_client_header_buffers 4 16k;`, thêm `proxy_buffer_size 16k;` vào location `/auth/`, reload; thử lại cả hai yêu cầu. Về lâu dài nên rút gọn cookie.'],
    fix: [BIGCOOKIE, 'curl -s -o /dev/null -w "%{http_code}\\n" -H @/tmp/bigcookie.txt http://tutor.haiphan.org/api/me', 'curl -s -o /dev/null -w "%{http_code}\\n" http://tutor.haiphan.org/auth/login', 'sudo grep "too big header" /var/log/nginx/error.log', SU('/etc/nginx/conf.d/headers.conf', ['large_client_header_buffers 4 16k;']), SU(SITE, cfg({ auth: 'buf' })), RELOAD, 'curl -s -o /dev/null -w "%{http_code}\\n" -H @/tmp/bigcookie.txt http://tutor.haiphan.org/api/me', 'curl -s -o /dev/null -w "%{http_code}\\n" http://tutor.haiphan.org/auth/login'],
    cause: 'Có hai giới hạn kích thước độc lập. (1) Header yêu cầu từ khách: mỗi dòng phải nằm trong một bộ đệm của `large_client_header_buffers` (mặc định 8k), cookie phình to làm Nginx trả 400, xảy ra trước khi chạm ứng dụng. (2) Header phản hồi từ ứng dụng: phải nằm trong `proxy_buffer_size` (mặc định 4k hoặc 8k); `Set-Cookie` lớn của luồng SSO làm Nginx trả 502 và ghi `upstream sent too big header`. Chữa mỗi chiều bằng đúng chỉ thị của nó; nới 16k là đệm tạm, cần rút gọn cookie/JWT để bền vững.',
    setup: function (s) { B.base(s, {}); },
    check: function (s) { return st(s, 'http', TUT, '/api/me', bigHeaders()) === 200 && st(s, 'http', TUT, '/auth/login') === 200; }
  },
  {
    id: 'c3dg6', title: 'Chuyển API sang container: nginx -t báo host not found in upstream "api"',
    host: 'vps', user: 'haidangphan',
    symptom: L('API vừa được đóng gói vào Docker Compose (service tên "api", công bố 127.0.0.1:8881:8888). Bạn sửa proxy_pass sang tên service, nhưng:', '', '$ sudo nginx -t', 'nginx: [emerg] host not found in upstream "api" in /etc/nginx/sites-available/tutor.haiphan.org:13', 'nginx: configuration file /etc/nginx/nginx.conf test failed', '', 'Reload không áp dụng được. Website cũ vẫn chạy bằng cấu hình trước đó.'),
    story: 'Nginx cài trên máy chủ (không nằm trong mạng Docker) nên không phân giải được tên service Compose. Đưa cấu hình về trạng thái chạy được bằng cách trỏ vào cổng mà container đã công bố trên loopback.',
    goal: 'Cấu hình hợp lệ, /api/ trỏ vào 127.0.0.1:8881 và /api/health trả 200 từ instance 8881.',
    hints: ['`sudo nginx -t` chỉ rõ tên `api` và số dòng; `grep -n proxy_pass /etc/nginx/sites-available/tutor.haiphan.org` để xem dòng đó.', 'Tên `api` là DNS của mạng Docker, Nginx trên host không có. Compose đã công bố cổng `127.0.0.1:8881`, đó là địa chỉ Nginx dùng.', 'Đổi `proxy_pass http://api:8888;` thành `proxy_pass http://127.0.0.1:8881;`, `sudo nginx -t && sudo systemctl reload nginx`, rồi `curl -s http://tutor.haiphan.org/api/health`.'],
    fix: ['sudo nginx -t', 'grep -n proxy_pass ' + SITE, "sudo sed -i 's#http://api:8888#http://127.0.0.1:8881#' " + SITE, RELOAD, 'curl -s http://tutor.haiphan.org/api/health'],
    cause: 'Tên service Compose chỉ phân giải được bên trong mạng Docker. Nginx trên host phải dùng địa chỉ cổng công bố (`127.0.0.1:8881`, đã gắn loopback nên không lộ ra Internet). Nếu Nginx cũng chạy trong container hãy đặt nó cùng mạng và dùng `resolver 127.0.0.11` kèm `proxy_pass` bằng biến để phân giải lại khi container đổi IP.',
    setup: function (s) {
      B.base(s, {});
      var t = txt(s, SITE).replace('proxy_pass http://127.0.0.1:8888;\n    }\n\n    location /socket.io/', 'proxy_pass http://api:8888;\n    }\n\n    location /socket.io/');
      s.fs.put(SITE, t, { owner: 'root' });
    },
    check: function (s) { var l = locDir(s, TUT, '/api/', 'proxy_pass'), r = request(s, 'http', TUT, '/api/health'); return l === 'http://127.0.0.1:8881' && r.kind === 'resp' && r.status === 200 && /"instance":8881/.test(r.body || ''); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
