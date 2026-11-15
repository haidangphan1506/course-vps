(function (G) {
'use strict';
/* Mở rộng chương c4 (DNS, SSL, Cloudflare): bản ghi DNS, SAN/wildcard, gia hạn, hook, kiểm tra chứng chỉ. Giữ nguyên mục cũ, chỉ thêm vào cuối. */
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, IP = V.IP;
var TUT = 'tutor.haiphan.org', WWW = 'www.tutor.haiphan.org', ROOT = 'haiphan.org', CRED = '/root/.cloudflare.ini', FC = '/etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem', SITE = '/etc/nginx/sites-available/tutor.haiphan.org';
var HOOK = '/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh', RELOAD = 'sudo nginx -t && sudo systemctl reload nginx';
function R(re) { return function (s) { return ran(s, re); }; }
function RF(re) { return function (s) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function SU(path, ls) { return 'sudo tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function live(s) { return s.W.nginx && s.W.nginx.active ? s.W.nginx.live : null; }
function liveSrv(s, name) { var l = live(s); return l ? l.servers.filter(function (x) { return x.names.indexOf(name) >= 0; })[0] : null; }
function cmE(s, n) { return (s.W.cm || {})[n]; }
function ok(s) { return !V.ngLoad(s).errors.length; }
function bad(s, h) { return !!V.certBad && V.certBad(s, h); }
function hasDom(s, n, d) { var e = cmE(s, n); return !!e && e.doms.indexOf(d) >= 0; }
function request(s, scheme, host, path) {
  var W = s.W, sv = W.ngx2req, sm = W.ngx2meta; W.ngx2req = {}; W.ngx2meta = null;
  try { return V.ngReq(s, scheme, host, scheme === 'https' ? 443 : 80, path); } catch (e) { return { kind: 'err' }; } finally { W.ngx2req = sv; W.ngx2meta = sm; }
}
function blocks(o) {
  o = o || {};
  var names = o.names || [TUT], cert = o.cert || TUT, up = o.up || 'http://127.0.0.1:3000';
  return L('server {', '    listen 80;', '    listen [::]:80;', '    server_name ' + names.join(' ') + ';', '    return 301 https://$host$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    listen [::]:443 ssl;', '    server_name ' + names.join(' ') + ';', '    ssl_certificate /etc/letsencrypt/live/' + cert + '/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/' + cert + '/privkey.pem;', '    include /etc/letsencrypt/options-ssl-nginx.conf;', '', '    location / {', '        proxy_pass ' + up + ';', '        proxy_set_header Host $host;', '        proxy_set_header X-Forwarded-Proto $scheme;', '    }', '}', '').join('\n');
}
function dnsBase(s) {
  var W = s.W; W.cert2 = true; W.dnsrec2 = W.dnsrec2 || {};
  W.dnsrec2[ROOT] = { NS: ['ada.ns.cloudflare.com.', 'ben.ns.cloudflare.com.'], MX: ['10 route1.mx.cloudflare.net.', '20 route2.mx.cloudflare.net.'], TXT: ['v=spf1 include:_spf.mx.cloudflare.net ~all'], CAA: ['0 issue "letsencrypt.org"'] };
}
function ufwSetup(s, allow80) {
  s.silent('sudo ufw allow OpenSSH'); s.silent('sudo ufw allow 443/tcp'); if (allow80) s.silent('sudo ufw allow 80/tcp'); s.silent('sudo ufw --force enable');
}
function certEntry(s, name, e) { s.W.cm = s.W.cm || {}; s.W.cm[name] = e; s.W.certs[name] = true; }

var Lc = C.lessons.filter(function (l) { return l.id === 'c4'; })[0];
if (!Lc) return;

/* ============ LÝ THUYẾT ============ */
Lc.theory.push(
  { tag: 'Khái niệm', title: 'CNAME, MX, TXT, NS, CAA: ai trả lời câu hỏi gì', body: [
    'Một tên miền có thể mang nhiều loại bản ghi. Mỗi loại trả lời một câu hỏi khác nhau:',
    { tbl: [['Loại', 'Trả lời câu hỏi', 'Ví dụ'], ['A', 'Tên này ứng với IPv4 nào?', '`tutor.haiphan.org` -> `116.118.9.210`'], ['AAAA', 'Tên này ứng với IPv6 nào?', 'Chỉ thêm nếu VPS thật sự mở IPv6'], ['CNAME', 'Tên này là bí danh của tên nào?', '`www.tutor.haiphan.org` -> `tutor.haiphan.org`'], ['MX', 'Thư gửi tới domain đi đâu?', '`10 route1.mx.cloudflare.net.`'], ['TXT', 'Chuỗi văn bản (SPF, xác minh domain, DNS-01)', '`v=spf1 ... ~all`'], ['NS', 'Máy chủ DNS nào quản lý zone?', '`ada.ns.cloudflare.com.`'], ['CAA', 'CA nào được phép cấp chứng chỉ?', '`0 issue "letsencrypt.org"`']] },
    { pre: ['dig +short NS haiphan.org', 'dig +short MX haiphan.org', 'dig +short TXT haiphan.org', 'dig +short CAA haiphan.org', 'dig www.tutor.haiphan.org     # thấy chuỗi CNAME rồi mới tới A', 'host www.tutor.haiphan.org'], cap: 'Hỏi từng loại bản ghi' },
    { ul: ['Tên đứng một mình có **CNAME** thì không được có bản ghi nào khác cùng tên (A, MX, TXT...). Vì vậy domain gốc `haiphan.org` thường dùng A, còn `www` mới dùng CNAME', '`dig` không có `+short` cho thêm phần HEADER (status NOERROR hay NXDOMAIN) và cột TTL, rất hữu ích khi chẩn đoán', 'Đổi bản ghi trong bài thực hành bằng lệnh giả lập `cfctl dns ...`; ngoài đời là thao tác trong Cloudflare, DNS, Records'] }
  ] },
  { tag: 'Khái niệm', title: 'TTL và chuyện "đổi DNS mà chưa thấy đổi"', body: [
    '**TTL** (time to live, đơn vị giây) là thời gian máy chủ DNS trung gian được phép nhớ câu trả lời. Đặt TTL 3600 nghĩa là sau khi bạn đổi IP, vẫn có người nhận IP cũ tới 1 giờ.',
    { ul: ['**Trước khi chuyển VPS:** hạ TTL xuống 60 giây, chờ hết TTL cũ, rồi mới đổi IP. Sau khi ổn định thì nâng TTL lên lại', 'Bản ghi bật proxy Cloudflare (đám mây cam) hiển thị TTL "Auto"; người dùng luôn nhận IP của Cloudflare', 'Kiểm tra từng nơi: `dig +short tutor.haiphan.org @1.1.1.1` (máy chủ công cộng) khác với `dig +short tutor.haiphan.org` (máy chủ của VPS) là dấu hiệu bộ nhớ đệm chưa hết hạn'] },
    { pre: ['cfctl dns set A tutor.haiphan.org 116.118.9.210 --ttl 60', 'dig tutor.haiphan.org      # cột thứ hai của dòng A là TTL'], cap: 'Hạ TTL' },
    { note: 'Không có cách "xoá bộ nhớ đệm của cả thế giới". Cách duy nhất là hạ TTL từ sớm.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'www và domain gốc: một địa chỉ chính (canonical)', body: [
    'Người dùng gõ cả `tutor.haiphan.org` lẫn `www.tutor.haiphan.org`. Nếu cả hai đều trả nội dung, công cụ tìm kiếm coi là hai trang trùng nhau. Chọn **một** tên chính, tên còn lại chuyển hướng 301 sang.',
    { pre: ['cfctl dns add CNAME www.tutor.haiphan.org tutor.haiphan.org', '', '# Nginx: www chuyển về tên chính', 'server {', '    listen 443 ssl;', '    server_name www.tutor.haiphan.org;', '    ssl_certificate     /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    return 301 https://tutor.haiphan.org$request_uri;', '}'], cap: 'CNAME cho www và khối 443 chuyển hướng' },
    { ul: ['Khối 443 của `www` **vẫn phải có chứng chỉ** chứa tên `www`, nếu không trình duyệt báo lỗi chứng chỉ trước khi kịp nhận lệnh chuyển hướng', 'Dùng `$request_uri` để giữ nguyên đường dẫn và query string', 'Chỉ chuyển hướng ở **một** tầng: hoặc Nginx, hoặc "Always Use HTTPS" của Cloudflare, tránh cộng dồn nhiều bước'] }
  ] },
  { tag: 'Cú pháp', title: 'Chứng chỉ nhiều tên (SAN) và --expand', body: [
    'Một chứng chỉ có thể chứa nhiều tên, gọi là **SAN** (Subject Alternative Name). Trình duyệt chỉ chấp nhận khi tên bạn truy cập nằm trong danh sách SAN.',
    { pre: ['sudo certbot --nginx -d tutor.haiphan.org -d www.tutor.haiphan.org', 'sudo certbot --nginx --expand -d tutor.haiphan.org -d www.tutor.haiphan.org', 'sudo certbot certificates | grep -E "Certificate Name|Domains"'], cap: 'Cấp mới nhiều tên; thêm tên vào chứng chỉ có sẵn' },
    { ul: ['Chứng chỉ đã tồn tại mà bạn thêm tên mới: certbot hỏi có mở rộng không. Chạy không có terminal thì phải ghi rõ `--expand`', 'Khi mở rộng phải liệt kê **tất cả** tên (cũ và mới). Thiếu tên cũ là chứng chỉ mới sẽ mất tên đó', 'Mỗi tên trong `-d` đều phải có DNS trỏ đúng và một server block cổng 80 có `server_name` tương ứng (với plugin nginx)', 'Kiểm tra tên trong tệp: `openssl x509 -in .../fullchain.pem -noout -ext subjectAltName`'] },
    { note: 'Triệu chứng thiếu tên: `curl: (60) SSL: no alternative certificate subject name matches target host name`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Wildcard và xác thực DNS-01', body: [
    'Chứng chỉ wildcard `*.haiphan.org` cho mọi tên **một cấp** dưới domain. Let\'s Encrypt chỉ cấp wildcard qua **DNS-01**: certbot tạo bản ghi TXT `_acme-challenge` trên Cloudflare để chứng minh bạn quản lý DNS.',
    { tbl: [['Tên', '`*.haiphan.org` có phủ không?'], ['`app.haiphan.org`', 'Có'], ['`haiphan.org` (gốc)', 'Không: phải thêm `-d haiphan.org`'], ['`api.tutor.haiphan.org` (hai cấp)', 'Không: cần thêm `*.tutor.haiphan.org`']] },
    { pre: ["sudo tee /root/.cloudflare.ini > /dev/null <<'EOF'", 'dns_cloudflare_api_token = <token chỉ có quyền Edit zone DNS>', 'EOF', 'sudo chmod 600 /root/.cloudflare.ini', '', "sudo certbot certonly --dns-cloudflare \\", '  --dns-cloudflare-credentials /root/.cloudflare.ini \\', "  -d '*.haiphan.org' -d haiphan.org"], cap: 'Cấp wildcard' },
    { ul: ['Phải **đặt dấu nháy** quanh `*.haiphan.org`, nếu không shell sẽ tự mở rộng dấu `*`', 'Thử `--nginx` với wildcard sẽ lỗi: plugin nginx chỉ làm HTTP-01', 'DNS-01 không cần cổng 80, nên dùng được khi VPS sau tường lửa hoặc chưa có Nginx'] }
  ] },
  { tag: 'Khái niệm', title: 'Tự gia hạn: timer, renew, dry-run', body: [
    'Chứng chỉ sống 90 ngày. Gói certbot cài sẵn **systemd timer** chạy `certbot renew` hai lần mỗi ngày. Lệnh này chỉ gia hạn chứng chỉ **còn dưới 30 ngày**; các chứng chỉ còn lại được bỏ qua.',
    { pre: ['systemctl list-timers | grep certbot', 'systemctl status certbot.timer', 'sudo cat /etc/letsencrypt/renewal/tutor.haiphan.org.conf', 'sudo certbot renew --dry-run', 'sudo certbot renew --dry-run --cert-name tutor.haiphan.org'], cap: 'Kiểm tra cơ chế tự gia hạn' },
    { ul: ['`--dry-run` thử toàn bộ quy trình với máy chủ thử nghiệm, **không** đổi chứng chỉ thật và không tốn giới hạn. Nên chạy sau mỗi lần sửa Nginx hay tường lửa', 'File `renewal/<tên>.conf` ghi cách cấp: dòng `authenticator` và `installer`. Chứng chỉ cấp bằng `certonly` **không có** `installer`', '`--force-renewal` ép gia hạn ngay, nhưng đếm vào giới hạn của Let\'s Encrypt (chứng chỉ trùng bộ tên tối đa khoảng 5 lần mỗi tuần): đừng dùng bừa'] },
    { note: 'Timer tắt, hoặc gia hạn thất bại âm thầm, là nguyên nhân hàng đầu của sự cố "chứng chỉ hết hạn" lúc nửa đêm.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Deploy hook: gia hạn xong phải nạp lại Nginx', body: [
    'Nginx đọc chứng chỉ **một lần lúc nạp cấu hình** rồi giữ trong bộ nhớ. File trên đĩa đã mới mà Nginx chưa reload thì người dùng vẫn nhận chứng chỉ cũ, cho đến lúc hết hạn.',
    { ul: ['Chứng chỉ cấp bằng `--nginx`: certbot tự reload Nginx sau khi gia hạn (đã có `installer = nginx`)', 'Chứng chỉ cấp bằng `certonly` (DNS-01, wildcard): **không** tự reload. Cần **deploy hook**'] },
    { pre: ["sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'", '#!/bin/sh', 'systemctl reload nginx', 'EOF', 'sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh', '', '# hoặc chỉ cho một lần gia hạn:', 'sudo certbot renew --deploy-hook "systemctl reload nginx"'], cap: 'Hook mọi chứng chỉ' },
    { ul: ['Thư mục `renewal-hooks/` có ba ngăn: `pre` (trước), `deploy` (chỉ chạy khi gia hạn **thành công**), `post` (sau cùng)', 'Script hook **phải có quyền thực thi** (`chmod +x`), nếu không certbot bỏ qua và chỉ in cảnh báo', 'Thử hook: `sudo certbot renew --force-renewal --cert-name <tên>` (chỉ làm khi cần, vì tốn giới hạn)'] }
  ] },
  { tag: 'Mẹo', title: 'Xem chứng chỉ thật sự đang được phục vụ', body: [
    'Đừng chỉ tin `certbot certificates` (nói về file trên đĩa). Hãy hỏi chính Nginx đang phục vụ chứng chỉ nào:',
    { pre: ['sudo openssl x509 -in /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem -noout -dates', 'openssl s_client -connect tutor.haiphan.org:443 -servername tutor.haiphan.org 2>/dev/null | openssl x509 -noout -dates', 'curl -vI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org 2>&1 | grep -E "subject|expire"', 'sudo openssl x509 -in /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem -noout -checkend 2592000'], cap: 'Ba cách xem hạn; cách thứ tư tạo cảnh báo' },
    { ul: ['Hai kết quả khác nhau (file ngày mới, `s_client` ngày cũ) = Nginx chưa reload', '`-checkend 2592000` hỏi "30 ngày nữa chứng chỉ còn hạn không?": thoát 0 là còn, thoát 1 là sắp hết. Đưa vào cron hoặc công cụ giám sát để được báo trước', '`-servername` bắt buộc khi nhiều domain dùng chung một IP (SNI), nếu không Nginx trả chứng chỉ của server mặc định'] }
  ] },
  { tag: 'Bảng tra', title: 'Cấp chứng chỉ thất bại: đọc thông báo', body: [
    'Với HTTP-01, máy chủ Let\'s Encrypt phải truy cập được `http://<domain>/.well-known/acme-challenge/...` trên **cổng 80**. Thông báo của certbot có ba dòng đáng đọc: `Domain`, `Type`, `Detail`.',
    { tbl: [['Detail', 'Nguyên nhân', 'Cách gỡ'], ['`NXDOMAIN looking up A`', 'Chưa có bản ghi DNS, hoặc gõ sai', '`dig +short <tên>`, thêm bản ghi A hoặc CNAME'], ['`Timeout during connect (likely firewall problem)`', 'Cổng 80 bị ufw hoặc nhà cung cấp chặn, hoặc DNS trỏ sai IP', '`sudo ufw status`, `sudo ufw allow 80/tcp`; kiểm tra IP trong DNS'], ['`Connection refused`', 'Không có gì lắng nghe cổng 80', '`sudo systemctl start nginx`'], ['`CAA record for ... prevents issuance`', 'Bản ghi CAA chỉ cho CA khác cấp', '`dig +short CAA haiphan.org`, thêm `0 issue "letsencrypt.org"`'], ['`nginx.conf test failed`', 'Cấu hình Nginx đang lỗi', '`sudo nginx -t` rồi sửa']] },
    { note: 'Domain đang bật proxy Cloudflare vẫn cấp được bằng HTTP-01 vì Cloudflare chuyển tiếp đường dẫn `.well-known`. Nếu bạn bật "Always Use HTTPS", đảm bảo nó không chặn đường dẫn này.', kind: 'tip' }
  ] },
  { tag: 'Bảng tra', title: 'Lỗi chứng chỉ khi dùng curl và Cloudflare', body: [
    { tbl: [['Hiện tượng', 'Ý nghĩa', 'Kiểm tra'], ['`curl: (60) SSL certificate problem: certificate has expired`', 'Chứng chỉ đang phục vụ đã hết hạn', '`openssl s_client ... | openssl x509 -noout -dates`'], ['`curl: (60) SSL: no alternative certificate subject name matches`', 'Tên bạn truy cập không có trong SAN', '`openssl x509 ... -ext subjectAltName`'], ['`curl: (35)` wrong version number', 'Cổng 443 không bật `ssl` hoặc gọi HTTPS vào cổng HTTP', '`ss -tlnp`, kiểm tra `listen 443 ssl`'], ['Cloudflare **526**', 'Full (strict) nhưng chứng chỉ origin hết hạn, sai tên hoặc không tin cậy', 'Gọi thẳng origin bằng `curl --resolve` để xem lỗi thật'], ['Cloudflare **525**', 'Không bắt tay TLS được với origin', 'Origin chưa mở 443 hoặc cấu hình TLS sai']] },
    'Mẹo chẩn đoán qua Cloudflare: lỗi 52x của Cloudflare che mất nguyên nhân. Hãy bỏ qua Cloudflare bằng `curl --resolve <domain>:443:127.0.0.1 https://<domain>` ngay trên VPS. `-k` giúp phân biệt "chứng chỉ lỗi" (có `-k` thì chạy) với "Nginx lỗi" (có `-k` vẫn lỗi).'
  ] }
);

/* ============ QUIZ ============ */
Lc.quiz.push(
  { q: 'Bạn cần `www.tutor.haiphan.org` trỏ cùng chỗ với `tutor.haiphan.org`. Cách nào đúng và dễ bảo trì nhất?', opts: ['Thêm bản ghi CNAME `www` -> `tutor.haiphan.org`', 'Thêm bản ghi MX', 'Thêm bản ghi NS', 'Tạo VPS thứ hai'], ans: 0, why: 'CNAME là bí danh: khi IP của tên chính đổi, www đổi theo. MX dành cho thư, NS cho máy chủ DNS.' },
  { q: 'Bạn sắp chuyển site sang VPS mới vào tối thứ Sáu. Bước chuẩn bị nào làm trước nhất?', opts: ['Xoá bản ghi A cũ', 'Hạ TTL của bản ghi A xuống 60 giây và chờ hết TTL cũ', 'Tắt Nginx', 'Cấp lại chứng chỉ'], ans: 1, why: 'Bộ nhớ đệm DNS giữ IP cũ theo TTL cũ. Hạ TTL từ trước thì lúc đổi IP, người dùng sang IP mới trong vài chục giây.' },
  { q: '`dig +short CAA haiphan.org` trả `0 issue "digicert.com"`. certbot xin chứng chỉ cho tutor.haiphan.org sẽ ra sao?', opts: ['Thành công bình thường', 'Bị từ chối: CAA không cho Let\'s Encrypt cấp', 'Chỉ cấp được wildcard', 'Cloudflare tự sửa'], ans: 1, why: 'CAA là danh sách CA được phép cấp cho domain (và các tên con). Cần thêm `0 issue "letsencrypt.org"`.' },
  { q: 'Bạn chạy `sudo certbot --nginx -d tutor.haiphan.org -d www.tutor.haiphan.org` khi đã có chứng chỉ chỉ chứa tutor.haiphan.org (chạy không có terminal) thì certbot...', opts: ['Tự mở rộng', 'Từ chối, yêu cầu thêm `--expand`', 'Xoá chứng chỉ cũ', 'Bỏ qua tên www'], ans: 1, why: 'Thay thế chứng chỉ có sẵn cần xác nhận. Không có terminal thì phải ghi `--expand`.' },
  { q: 'Khi `--expand`, bạn viết `-d www.tutor.haiphan.org` (quên tên cũ). Hệ quả?', opts: ['Chứng chỉ mới chỉ chứa www, domain gốc mất chứng chỉ hợp lệ', 'Certbot tự nhớ tên cũ', 'Không có gì thay đổi', 'Lệnh báo lỗi cú pháp'], ans: 0, why: 'Chứng chỉ mới có đúng danh sách `-d` bạn đưa. Luôn liệt kê đủ cả tên cũ lẫn tên mới.' },
  { q: 'Chứng chỉ `*.haiphan.org` có hợp lệ cho `api.tutor.haiphan.org` không?', opts: ['Có, wildcard phủ mọi cấp', 'Không, wildcard chỉ phủ một cấp tên', 'Chỉ khi bật proxy Cloudflare', 'Có, nếu dùng Full (strict)'], ans: 1, why: '`*.haiphan.org` phủ `app.haiphan.org` nhưng không phủ `api.tutor.haiphan.org` (hai cấp) và cũng không phủ `haiphan.org`.' },
  { q: 'Vì sao `sudo certbot --nginx -d \'*.haiphan.org\'` không chạy?', opts: ['Thiếu sudo', 'Wildcard cần xác thực DNS-01, plugin nginx chỉ làm HTTP-01', 'Cổng 80 đang bận', 'Cloudflare chặn'], ans: 1, why: 'Let\'s Encrypt chỉ cấp wildcard qua DNS-01. Dùng `certbot certonly --dns-cloudflare` kèm file credentials.' },
  { q: '`sudo certbot renew` hôm nay in "Certificate not yet due for renewal" cho chứng chỉ còn 80 ngày. Điều này nghĩa là?', opts: ['Gia hạn bị lỗi', 'Bình thường: certbot chỉ gia hạn khi còn dưới 30 ngày', 'Timer chưa bật', 'Chứng chỉ không hợp lệ'], ans: 1, why: 'Đây là hành vi đúng. Dùng `--dry-run` để thử quy trình, `--force-renewal` chỉ khi thật cần.' },
  { q: 'Chứng chỉ cấp bằng `certbot certonly --dns-cloudflare` được gia hạn thành công lúc 3 giờ sáng nhưng sáng ra trình duyệt vẫn báo hết hạn. Nguyên nhân khả dĩ nhất?', opts: ['Let\'s Encrypt chậm', 'Nginx chưa reload nên vẫn giữ chứng chỉ cũ; thiếu deploy hook', 'DNS sai', 'Cloudflare lỗi'], ans: 1, why: '`certonly` không có installer nên không tự reload Nginx. Thêm deploy hook `systemctl reload nginx`.' },
  { q: 'Bạn đã tạo `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` nhưng hook không chạy. Lỗi hay gặp nhất?', opts: ['Tên file sai', 'Thiếu quyền thực thi (`chmod +x`)', 'Nginx đang tắt', 'Thư mục `pre` trống'], ans: 1, why: 'certbot chỉ chạy script có quyền thực thi trong thư mục hook; thiếu `+x` nó in cảnh báo rồi bỏ qua.' },
  { q: 'Cách nhanh nhất xem chứng chỉ mà Nginx **đang phục vụ** (không phải file trên đĩa)?', opts: ['`sudo certbot certificates`', '`openssl s_client -connect host:443 -servername host | openssl x509 -noout -dates`', '`ls /etc/letsencrypt/live`', '`nginx -t`'], ans: 1, why: '`certbot certificates` và `ls` nói về file. `s_client` kết nối thật và lấy chứng chỉ Nginx trả cho client.' },
  { q: 'Muốn script giám sát báo khi chứng chỉ còn dưới 14 ngày, dùng lệnh nào?', opts: ['`openssl x509 -in fullchain.pem -noout -checkend 1209600` rồi xét mã thoát', '`certbot renew`', '`nginx -t`', '`dig +short A`'], ans: 0, why: '`-checkend N` thoát 0 nếu chứng chỉ còn hạn sau N giây (1209600 giây = 14 ngày), thoát 1 nếu không.' },
  { q: 'certbot báo "Timeout during connect (likely firewall problem)" khi xác thực HTTP-01. Hai việc cần kiểm tra đầu tiên?', opts: ['Cổng 80 trong ufw và IP trong bản ghi DNS', 'Phiên bản Node', 'Dung lượng đĩa', 'Quyền file site'], ans: 0, why: 'Máy chủ Let\'s Encrypt phải tới được cổng 80 của đúng VPS. Chặn ufw hoặc DNS trỏ nhầm IP đều gây timeout.' },
  { q: 'Cloudflare ở Full (strict) báo 526 nhưng `curl -k --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org` trên VPS trả 200. Kết luận?', opts: ['Nginx lỗi', 'Ứng dụng lỗi', 'Nginx chạy ổn, chứng chỉ origin có vấn đề (hết hạn, thiếu tên); bỏ `-k` để thấy lỗi', 'Cloudflare hỏng'], ans: 2, why: '`-k` bỏ qua kiểm tra chứng chỉ. Có `-k` chạy được mà không có `-k` thì lỗi nghĩa là chứng chỉ origin không hợp lệ.' }
);

/* ============ LAB ============ */
var oldSetup = Lc.lab.setup;
Lc.lab.setup = function (s) { s.W.cert2 = true; oldSetup(s); dnsBase(s); };
var CRT = SU(CRED, ['dns_cloudflare_api_token = cf-token-demo']);
var CANON = SU(SITE, ['server {', '    listen 80;', '    listen [::]:80;', '    server_name tutor.haiphan.org www.tutor.haiphan.org;', '    return 301 https://tutor.haiphan.org$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    listen [::]:443 ssl;', '    server_name www.tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    include /etc/letsencrypt/options-ssl-nginx.conf;', '    return 301 https://tutor.haiphan.org$request_uri;', '}', '', 'server {', '    listen 443 ssl;', '    listen [::]:443 ssl;', '    server_name tutor.haiphan.org;', '    ssl_certificate /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem;', '    ssl_certificate_key /etc/letsencrypt/live/tutor.haiphan.org/privkey.pem;', '    include /etc/letsencrypt/options-ssl-nginx.conf;', '', '    location / {', '        proxy_pass http://127.0.0.1:3000;', '        proxy_set_header Host $host;', '        proxy_set_header X-Forwarded-Proto $scheme;', '    }', '}']);
var HK = SU(HOOK, ['#!/bin/sh', 'systemctl reload nginx']);
var it = Lc.lab.items;
it.push(
  /* A. DNS */
  { text: 'Hỏi bản ghi **AAAA** (IPv6) của `tutor.haiphan.org`: kết quả rỗng nghĩa là domain chưa có IPv6.', hint: 'dig +short AAAA tutor.haiphan.org', check: R(/^dig .*\bAAAA\b/) },
  { text: 'Hỏi bản ghi **NS** của `haiphan.org`: máy chủ DNS nào quản lý zone.', hint: 'dig +short NS haiphan.org', check: R(/^dig .*\bNS\b/) },
  { text: 'Hỏi bản ghi **MX** của `haiphan.org`.', hint: 'dig +short MX haiphan.org', check: R(/^dig .*\bMX\b/) },
  { text: 'Hỏi bản ghi **TXT** của `haiphan.org` (SPF).', hint: 'dig +short TXT haiphan.org', check: R(/^dig .*\bTXT\b/) },
  { text: 'Hỏi bản ghi **CAA** để biết CA nào được cấp chứng chỉ cho domain.', hint: 'dig +short CAA haiphan.org', check: R(/^dig .*\bCAA\b/) },
  { text: 'Tạo bản ghi **CNAME** để `www.tutor.haiphan.org` là bí danh của `tutor.haiphan.org`.', hint: 'cfctl dns add CNAME www.tutor.haiphan.org tutor.haiphan.org', check: function (s) { var r = (s.W.dnsrec2 || {})[WWW]; return !!r && !!r.CNAME && r.CNAME[0] === TUT; } },
  { text: 'Hỏi DNS về `www.tutor.haiphan.org` và quan sát chuỗi CNAME rồi mới tới A.', hint: 'dig www.tutor.haiphan.org', check: R(/^dig .*www\.tutor\.haiphan\.org/) },
  { text: 'Dùng `host` để xem nhanh bí danh và địa chỉ của `www.tutor.haiphan.org`.', hint: 'host www.tutor.haiphan.org', check: R(/^host .*www\.tutor/) },
  { text: 'Chuẩn bị đổi IP: hạ TTL của bản ghi A `tutor.haiphan.org` xuống 60 giây (IP giữ nguyên `116.118.9.210`).', hint: 'cfctl dns set A tutor.haiphan.org 116.118.9.210 --ttl 60', check: function (s) { return s.W.dnsttl && s.W.dnsttl[TUT] === 60 && s.W.dns[TUT].ip === IP; } },
  { text: 'Bật proxy Cloudflare (đám mây cam) cho `tutor.haiphan.org`.', hint: 'cfctl dns proxy tutor.haiphan.org on', check: R(/^cfctl dns proxy tutor\.haiphan\.org on/) },
  { text: 'Hỏi lại `dig +short tutor.haiphan.org`: lần này phải thấy IP của Cloudflare chứ không phải IP VPS.', hint: 'dig +short tutor.haiphan.org', check: function (s) { return cnt(s, /^dig \+short tutor\.haiphan\.org/) >= 2; } },
  { text: 'Tắt proxy (đám mây xám) để certbot và curl thấy IP gốc.', hint: 'cfctl dns proxy tutor.haiphan.org off', check: R(/^cfctl dns proxy tutor\.haiphan\.org off/) },
  /* B. SAN, www, canonical */
  { text: 'Cho Nginx biết tên www: sửa mọi `server_name` của site thành `tutor.haiphan.org www.tutor.haiphan.org`.', hint: "sudo sed -i 's/server_name tutor.haiphan.org;/server_name tutor.haiphan.org www.tutor.haiphan.org;/' " + SITE, check: function (s) { return /server_name tutor\.haiphan\.org www\.tutor\.haiphan\.org;/.test(txt(s, SITE)); } },
  { text: 'Kiểm tra cú pháp và nạp lại để Nginx nhận tên www.', hint: RELOAD, check: function (s) { return !!liveSrv(s, WWW); } },
  { text: 'Thử cấp chứng chỉ có thêm tên www **mà không có `--expand`**: certbot phải từ chối vì chứng chỉ đã tồn tại.', hint: 'sudo certbot --nginx -d tutor.haiphan.org -d www.tutor.haiphan.org', check: RF(/^sudo certbot --nginx -d tutor\.haiphan\.org -d www\.tutor/) },
  { text: 'Mở rộng chứng chỉ để chứa cả hai tên.', hint: 'sudo certbot --nginx --expand -d tutor.haiphan.org -d www.tutor.haiphan.org', check: function (s) { return hasDom(s, TUT, WWW) && hasDom(s, TUT, TUT); } },
  { text: 'Liệt kê chứng chỉ và lọc dòng tên chứng chỉ cùng Domains.', hint: 'sudo certbot certificates | grep -E "Certificate Name|Domains"', check: R(/^grep -E .*Domains/) },
  { text: 'Đọc danh sách SAN trực tiếp từ file chứng chỉ bằng openssl.', hint: 'sudo openssl x509 -in ' + FC + ' -noout -ext subjectAltName', check: R(/^sudo openssl x509 .*subjectAltName/) },
  { text: 'Gọi HTTPS tới `www.tutor.haiphan.org` thẳng vào VPS (dùng `--resolve`).', hint: 'curl -sI --resolve www.tutor.haiphan.org:443:127.0.0.1 https://www.tutor.haiphan.org', check: R(/^curl .*--resolve www\.tutor\.haiphan\.org:443/) },
  { text: 'Viết lại file site: HTTP chuyển về `https://tutor.haiphan.org`, khối 443 của `www` cũng chuyển 301 về tên chính, khối 443 chính proxy tới cổng 3000.', hint: CANON, check: function (s) { var t = txt(s, SITE); return /server_name www\.tutor\.haiphan\.org;/.test(t) && /return 301 https:\/\/tutor\.haiphan\.org\$request_uri/.test(t) && /proxy_pass http:\/\/127\.0\.0\.1:3000/.test(t); } },
  { text: 'Kiểm tra cú pháp và nạp lại.', hint: RELOAD, check: function (s) { var r = request(s, 'https', WWW, '/p?x=1'); return r.kind === 'resp' && r.status === 301 && r.loc === 'https://tutor.haiphan.org/p?x=1'; } },
  { text: 'Xem `Location` mà `www` trả về, lọc bằng grep.', hint: 'curl -sI --resolve www.tutor.haiphan.org:443:127.0.0.1 https://www.tutor.haiphan.org | grep -i location', check: R(/^grep -i location/) },
  /* C. wildcard */
  { text: 'Tạo file credentials Cloudflare cho DNS-01 (token chỉ có quyền Edit zone DNS).', hint: CRT, check: function (s) { return /dns_cloudflare_api_token\s*=\s*\S+/.test(txt(s, CRED)); } },
  { text: 'Chỉ cho root đọc file token: quyền 600.', hint: 'sudo chmod 600 ' + CRED, check: function (s) { var n = s.fs.get(CRED); return !!n && n.mode === 384; } },
  { text: 'Thử xin wildcard bằng plugin nginx: certbot phải từ chối.', hint: "sudo certbot --nginx -d '*.haiphan.org'", check: RF(/^sudo certbot --nginx -d \*\.haiphan\.org/) },
  { text: 'Cấp chứng chỉ wildcard `*.haiphan.org` kèm domain gốc bằng DNS-01 (nhớ nháy đơn quanh dấu sao).', hint: "sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.cloudflare.ini -d '*.haiphan.org' -d haiphan.org", check: function (s) { return hasDom(s, ROOT, '*.haiphan.org') && hasDom(s, ROOT, ROOT); } },
  { text: 'Liệt kê lại: bây giờ có hai chứng chỉ. Lọc dòng Domains để thấy dấu sao.', hint: 'sudo certbot certificates | grep Domains', check: function (s) { return cnt(s, /^grep .*Domains/) >= 2; } },
  /* D. gia hạn */
  { text: 'Tìm bộ hẹn giờ tự gia hạn của certbot.', hint: 'systemctl list-timers | grep certbot', check: R(/^systemctl list-timers/) },
  { text: 'Xem trạng thái `certbot.timer`.', hint: 'systemctl status certbot.timer', check: R(/^systemctl status certbot\.timer/) },
  { text: 'Đọc file cấu hình gia hạn của `tutor.haiphan.org` và tìm dòng `authenticator` và `installer`.', hint: 'sudo cat /etc/letsencrypt/renewal/tutor.haiphan.org.conf', check: R(/^sudo cat \/etc\/letsencrypt\/renewal\/tutor\.haiphan\.org\.conf/) },
  { text: 'Thử gia hạn giả lập riêng cho chứng chỉ `tutor.haiphan.org`.', hint: 'sudo certbot renew --dry-run --cert-name tutor.haiphan.org', check: R(/^sudo certbot renew .*--cert-name tutor\.haiphan\.org/) },
  { text: 'Chạy gia hạn thật: không có gì đến hạn nên certbot bỏ qua tất cả.', hint: 'sudo certbot renew', check: R(/^sudo certbot renew$/) },
  { text: 'Chứng chỉ wildcard cấp bằng `certonly` không tự reload Nginx. Tạo deploy hook `reload-nginx.sh`.', hint: HK, check: function (s) { return /systemctl reload nginx/.test(txt(s, HOOK)); } },
  { text: 'Cho hook quyền thực thi.', hint: 'sudo chmod +x ' + HOOK, check: function (s) { var n = s.fs.get(HOOK); return !!n && (n.mode & 73) > 0; } },
  { text: 'Thử hook: ép gia hạn chứng chỉ wildcard một lần và để ý dòng "Running deploy-hook command".', hint: 'sudo certbot renew --force-renewal --cert-name haiphan.org', check: function (s) { return (s.W.certHookRuns || 0) >= 1; } },
  { text: 'Xem lại thư mục deploy hook.', hint: 'sudo ls -l /etc/letsencrypt/renewal-hooks/deploy/', check: R(/^sudo ls -l \/etc\/letsencrypt\/renewal-hooks\/deploy/) },
  /* E. kiểm tra */
  { text: 'Đọc ngày hiệu lực (`-dates`) từ file `fullchain.pem`.', hint: 'sudo openssl x509 -in ' + FC + ' -noout -dates', check: R(/^sudo openssl x509 .*-dates/) },
  { text: 'Hỏi chính Nginx đang phục vụ chứng chỉ nào: kết nối `s_client` rồi đưa vào `x509` để lấy ngày hết hạn.', hint: 'openssl s_client -connect tutor.haiphan.org:443 -servername tutor.haiphan.org 2>/dev/null | openssl x509 -noout -enddate', check: R(/^openssl x509 -noout -enddate/) },
  { text: 'Hỏi "30 ngày nữa chứng chỉ còn hạn không?" bằng `-checkend` (2592000 giây).', hint: 'sudo openssl x509 -in ' + FC + ' -noout -checkend 2592000', check: R(/^sudo openssl x509 .*-checkend/) },
  { text: 'Dùng curl chế độ chi tiết để đọc subject và ngày hết hạn mà server trả.', hint: 'curl -vI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org 2>&1 | grep -E "subject|expire"', check: R(/^curl -vI /) },
  /* F. Cloudflare */
  { text: 'Liệt kê các bản ghi DNS trong zone và trạng thái proxy của từng bản ghi.', hint: 'cfctl dns list', check: R(/^cfctl dns list/) },
  { text: 'Tái hiện lỗi vòng lặp: đặt chế độ SSL về Flexible.', hint: 'cfctl ssl-mode flexible', check: R(/^cfctl ssl-mode flexible/) },
  { text: 'Sửa đúng: đặt lại Full (strict).', hint: 'cfctl ssl-mode full-strict', check: function (s) { return s.W.cf.mode === 'full-strict' && ran(s, /^cfctl ssl-mode flexible/); } },
  { text: 'Bật lại proxy Cloudflare cho `tutor.haiphan.org`.', hint: 'cfctl dns proxy tutor.haiphan.org on', check: function (s) { return !!s.W.dns[TUT].proxied; } },
  { text: 'Gọi site qua Cloudflare: phải thấy `server: cloudflare` và HTTP 200.', hint: 'curl -sI https://tutor.haiphan.org', check: function (s) { return ran(s, /^curl -sI https:\/\/tutor\.haiphan\.org/) && V.probe(s, 'https://' + TUT, false).status === 200; } }
);

/* ============ DEBUGS ============ */
var LET = '"letsencrypt.org"';
Lc.debugs.push(
  {
    id: 'c4d3', title: 'Chứng chỉ hết hạn, certbot renew báo timeout',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -sSI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org', 'curl: (60) SSL certificate problem: certificate has expired', '', '$ sudo certbot renew', 'Failed to renew certificate tutor.haiphan.org with error: ...', '  Detail: 116.118.9.210: Fetching http://tutor.haiphan.org/.well-known/acme-challenge/Xq2: Timeout during connect (likely firewall problem)'),
    story: 'Hai tuần trước bạn siết tường lửa ufw: chỉ mở SSH và 443 cho gọn. Từ hôm qua người dùng báo chứng chỉ hết hạn. Timer của certbot vẫn chạy mỗi ngày nhưng lần nào cũng thất bại âm thầm.',
    goal: 'Chứng chỉ của `tutor.haiphan.org` được gia hạn, Nginx đang phục vụ chứng chỉ mới và `curl` HTTPS không còn lỗi (60).',
    hints: ['Đọc thông báo lỗi của `sudo certbot renew`: Detail nói "Timeout during connect (likely firewall problem)". Xem quy tắc tường lửa: `sudo ufw status`.', 'Let\'s Encrypt xác thực HTTP-01 qua cổng 80, nhưng ufw chỉ mở 22 và 443. Mở cổng 80: `sudo ufw allow 80/tcp`.', 'Chạy lại `sudo certbot renew`. Chứng chỉ cấp bằng plugin nginx nên certbot tự reload Nginx. Kiểm tra bằng `curl --resolve` về 127.0.0.1.'],
    fix: ['sudo certbot certificates', 'sudo ufw status', 'sudo ufw allow 80/tcp', 'sudo certbot renew', 'curl -sSI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org'],
    cause: 'Gia hạn bằng HTTP-01 cần cổng 80 mở ra Internet, kể cả khi toàn bộ site chạy HTTPS (cổng 80 chỉ để chuyển hướng và xác thực). Siết ufw mà không chạy `certbot renew --dry-run` sau đó là lỗi kinh điển. Đặt thói quen: mỗi lần đổi tường lửa hay Nginx, chạy dry-run.',
    setup: function (s) {
      s.W.cert2 = true; C.vpsBase(s); C.apps(s); C.certs(s, TUT); dnsBase(s);
      certEntry(s, TUT, { doms: [TUT], days: -3, auth: 'nginx', installer: 'nginx' });
      C.site(s, TUT, blocks()); V.ngReload(s, false);
      ufwSetup(s, false);
    },
    check: function (s) { var e = cmE(s, TUT); return !!e && e.days > 30 && !bad(s, TUT) && ok(s); }
  },
  {
    id: 'c4d4', title: 'Đã gia hạn mà trình duyệt vẫn báo hết hạn',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo certbot certificates', '    Domains: tutor.haiphan.org', '    Expiry Date: 2027-01-24 04:20:00+00:00 (VALID: 89 days)', '', '$ curl -sSI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org', 'curl: (60) SSL certificate problem: certificate has expired'),
    story: 'Chứng chỉ của tutor được cấp bằng `certonly --dns-cloudflare` vì bạn từng phải gỡ rối nginx -t. Đêm qua timer đã gia hạn thành công, file trên đĩa mới tinh, nhưng người dùng vẫn bị cảnh báo. Bạn muốn sửa ngay và để lần sau không lặp lại.',
    goal: 'Nginx phục vụ chứng chỉ mới **và** có deploy hook `reload-nginx.sh` (có quyền thực thi, chứa `systemctl reload nginx`) cho lần gia hạn sau.',
    hints: ['So sánh `sudo certbot certificates` (file trên đĩa) với `openssl s_client -connect tutor.haiphan.org:443 -servername tutor.haiphan.org 2>/dev/null | openssl x509 -noout -dates` (thứ Nginx đang phục vụ). Chúng khác nhau.', 'Xem `sudo cat /etc/letsencrypt/renewal/tutor.haiphan.org.conf`: không có dòng `installer`, nên certbot không reload Nginx. Reload ngay: `sudo systemctl reload nginx`.', 'Để lần sau tự động: tạo `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` với nội dung `#!/bin/sh` và `systemctl reload nginx` (dùng `sudo tee` kèm heredoc), rồi `sudo chmod +x` file đó.'],
    fix: ['sudo certbot certificates', 'openssl s_client -connect tutor.haiphan.org:443 -servername tutor.haiphan.org 2>/dev/null | openssl x509 -noout -dates', 'sudo cat /etc/letsencrypt/renewal/tutor.haiphan.org.conf', 'sudo systemctl reload nginx', SU(HOOK, ['#!/bin/sh', 'systemctl reload nginx']), 'sudo chmod +x ' + HOOK],
    cause: 'Nginx chỉ đọc chứng chỉ lúc nạp cấu hình. Chứng chỉ cấp bằng `certonly` không có installer nên certbot không reload Nginx sau khi gia hạn. Deploy hook là chỗ chuẩn để làm việc này, và phải có quyền thực thi.',
    setup: function (s) {
      s.W.cert2 = true; C.vpsBase(s); C.apps(s); C.certs(s, TUT); dnsBase(s);
      s.fs.put(CRED, 'dns_cloudflare_api_token = cf-token-demo\n', { owner: 'root', mode: M('600') });
      certEntry(s, TUT, { doms: [TUT], days: -1, auth: 'dns', installer: null, cred: CRED });
      C.site(s, TUT, blocks()); V.ngReload(s, false);
      s.W.cm[TUT].days = 89;
    },
    check: function (s) { var n = s.fs.get(HOOK); return !bad(s, TUT) && !!n && (n.mode & 73) > 0 && /reload nginx/.test(n.c || '') && ok(s); }
  },
  {
    id: 'c4d5', title: 'www.tutor.haiphan.org báo lỗi chứng chỉ',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -sSI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org', 'HTTP/1.1 200 OK', '', '$ curl -sSI --resolve www.tutor.haiphan.org:443:127.0.0.1 https://www.tutor.haiphan.org', 'curl: (60) SSL: no alternative certificate subject name matches target host name \'www.tutor.haiphan.org\''),
    story: 'Bạn đã thêm www vào `server_name` và tạo bản ghi DNS cho www. Tên chính chạy tốt nhưng ai gõ có www đều thấy cảnh báo chứng chỉ không khớp. Chứng chỉ do certbot cấp từ trước, lúc đó chưa có www.',
    goal: 'Chứng chỉ chứa cả `tutor.haiphan.org` và `www.tutor.haiphan.org`; curl HTTPS tới cả hai tên (qua `--resolve`) đều không còn lỗi (60); `nginx -t` vẫn thành công.',
    hints: ['Xem tên trong chứng chỉ: `sudo certbot certificates` hoặc `sudo openssl x509 -in /etc/letsencrypt/live/tutor.haiphan.org/fullchain.pem -noout -ext subjectAltName`. Chỉ có tutor.haiphan.org.', 'Cần thêm tên vào chứng chỉ có sẵn bằng `--expand`, liệt kê đủ cả tên cũ lẫn mới.', 'Lệnh: `sudo certbot --nginx --expand -d tutor.haiphan.org -d www.tutor.haiphan.org`.'],
    fix: ['sudo certbot certificates', 'sudo openssl x509 -in ' + FC + ' -noout -ext subjectAltName', 'sudo certbot --nginx --expand -d tutor.haiphan.org -d www.tutor.haiphan.org', 'curl -sSI --resolve www.tutor.haiphan.org:443:127.0.0.1 https://www.tutor.haiphan.org'],
    cause: 'Trình duyệt chỉ chấp nhận khi tên đang truy cập nằm trong SAN của chứng chỉ. `server_name` của Nginx và bản ghi DNS không liên quan tới danh sách đó. Thêm tên mới phải cấp lại chứng chỉ với `--expand` và đủ mọi tên.',
    setup: function (s) {
      s.W.cert2 = true; C.vpsBase(s); C.apps(s); C.certs(s, TUT); dnsBase(s);
      certEntry(s, TUT, { doms: [TUT], days: 60, auth: 'nginx', installer: 'nginx' });
      s.W.dns[WWW] = { ip: IP, proxied: false };
      C.site(s, TUT, blocks({ names: [TUT, WWW] })); V.ngReload(s, false);
    },
    check: function (s) { return hasDom(s, TUT, WWW) && hasDom(s, TUT, TUT) && !bad(s, TUT) && !bad(s, WWW) && ok(s); }
  },
  {
    id: 'c4d6', title: 'certbot từ chối cấp chứng chỉ vì bản ghi CAA',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo certbot --nginx -d tutor.haiphan.org', 'Certbot failed to authenticate some domains (authenticator: nginx).', '  Domain: tutor.haiphan.org', '  Type:   caa', '  Detail: CAA record for haiphan.org prevents issuance'),
    story: 'Domain haiphan.org vừa được chuyển từ công ty cũ về. DNS đã trỏ đúng, cổng 80 mở, Nginx chạy ổn ở cổng 80. Chỉ riêng việc cấp chứng chỉ là bị từ chối ngay từ vòng xác thực.',
    goal: 'Cấp được chứng chỉ cho `tutor.haiphan.org` bằng `certbot --nginx`: Nginx có khối 443, HTTPS trả 200.',
    hints: ['Detail nhắc bản ghi **CAA**. Xem nó: `dig +short CAA haiphan.org`.', 'CAA chỉ cho `digicert.com` cấp chứng chỉ, không có Let\'s Encrypt. Sửa bản ghi: `cfctl dns set CAA haiphan.org \'0 issue "letsencrypt.org"\'`.', 'Xác minh bằng `dig +short CAA haiphan.org` rồi chạy lại `sudo certbot --nginx -d tutor.haiphan.org`.'],
    fix: ['dig +short CAA haiphan.org', 'cfctl dns set CAA haiphan.org \'0 issue "letsencrypt.org"\'', 'dig +short CAA haiphan.org', 'sudo certbot --nginx -d tutor.haiphan.org', 'curl -sSkI --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org'],
    cause: 'CAA (Certification Authority Authorization) là danh sách CA được phép cấp chứng chỉ cho domain và mọi tên con. Khi có CAA mà không liệt kê Let\'s Encrypt, CA phải từ chối. Khi nhận domain từ nơi khác, luôn kiểm tra CAA.',
    setup: function (s) {
      s.W.cert2 = true; C.vpsBase(s); C.apps(s); dnsBase(s);
      s.W.dnsrec2[ROOT].CAA = ['0 issue "digicert.com"'];
      C.site(s, TUT, C.SITE80); V.ngReload(s, false);
    },
    check: function (s) {
      var caa = (s.W.dnsrec2[ROOT].CAA || []).join(' ');
      return !!cmE(s, TUT) && /letsencrypt\.org/.test(caa) && ok(s) && V.probe(s, 'https://' + TUT, true).status === 200;
    }
  },
  {
    id: 'c4d7', title: 'Wildcard mà api.tutor.haiphan.org vẫn lỗi chứng chỉ', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo certbot certificates | grep Domains', '    Domains: *.haiphan.org haiphan.org', '', '$ curl -sSI --resolve api.tutor.haiphan.org:443:127.0.0.1 https://api.tutor.haiphan.org', 'curl: (60) SSL: no alternative certificate subject name matches target host name \'api.tutor.haiphan.org\''),
    story: 'Bạn có chứng chỉ wildcard `*.haiphan.org` cấp bằng DNS-01 và nghĩ rằng nó phủ mọi thứ. Site chính `tutor.haiphan.org` chạy tốt với chứng chỉ này. Bạn vừa tạo `api.tutor.haiphan.org` dùng chung chứng chỉ và bị lỗi. Cả hai server đều dùng `/etc/letsencrypt/live/haiphan.org/`. File credentials Cloudflare đã có ở /root/.cloudflare.ini.',
    goal: 'Cả `tutor.haiphan.org` và `api.tutor.haiphan.org` được phục vụ bằng chứng chỉ hợp lệ. Chứng chỉ vẫn giữ `*.haiphan.org` và `haiphan.org`.',
    hints: ['Wildcard chỉ phủ **một cấp**: `api.tutor.haiphan.org` có hai cấp dưới haiphan.org nên cần `*.tutor.haiphan.org`.', 'Mở rộng chứng chỉ có sẵn bằng DNS-01, giữ tên cũ: `--cert-name haiphan.org --expand` và liệt kê đủ ba tên (`-d haiphan.org -d \'*.haiphan.org\' -d \'*.tutor.haiphan.org\'`).', 'Chứng chỉ cấp bằng `certonly` không tự reload: chạy `sudo nginx -t && sudo systemctl reload nginx` sau khi cấp.'],
    fix: ['sudo certbot certificates | grep Domains', "sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.cloudflare.ini --cert-name haiphan.org --expand -d haiphan.org -d '*.haiphan.org' -d '*.tutor.haiphan.org'", RELOAD, 'curl -sSI --resolve api.tutor.haiphan.org:443:127.0.0.1 https://api.tutor.haiphan.org'],
    cause: 'Wildcard chỉ phủ đúng một cấp. Muốn phủ cấp sâu hơn phải thêm một wildcard riêng (`*.tutor.haiphan.org`) hoặc đặt tên phẳng (`api-tutor.haiphan.org`). Khi `--expand` phải liệt kê cả tên cũ, và vì không có installer nên phải tự reload Nginx.',
    setup: function (s) {
      s.W.cert2 = true; C.vpsBase(s); C.apps(s); C.certs(s, ROOT); dnsBase(s);
      s.fs.put(CRED, 'dns_cloudflare_api_token = cf-token-demo\n', { owner: 'root', mode: M('600') });
      certEntry(s, ROOT, { doms: ['*.haiphan.org', 'haiphan.org'], days: 70, auth: 'dns', installer: null, cred: CRED });
      s.W.dns['api.tutor.haiphan.org'] = { ip: IP, proxied: false };
      C.site(s, TUT, blocks({ cert: ROOT }));
      C.site(s, 'api.tutor.haiphan.org', blocks({ names: ['api.tutor.haiphan.org'], cert: ROOT, up: 'http://127.0.0.1:8888' }));
      V.ngReload(s, false);
    },
    check: function (s) { return hasDom(s, ROOT, '*.haiphan.org') && hasDom(s, ROOT, ROOT) && !bad(s, 'api.tutor.haiphan.org') && !bad(s, TUT) && ok(s); }
  },
  {
    id: 'c4d8', title: 'Cloudflare 526 và certbot.timer đã tắt',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -sSI https://tutor.haiphan.org', 'HTTP/2 526', 'server: cloudflare', '', '$ systemctl list-timers | grep certbot', '(không có dòng nào)'),
    story: 'Cloudflare đang ở Full (strict) và bật proxy cho tutor.haiphan.org. Sáng nay site báo 526. Người đồng nghiệp từng "dọn dẹp" các timer trên VPS để giảm tải và có thể đã tắt cả bộ hẹn giờ của certbot.',
    goal: 'Timer certbot chạy lại, chứng chỉ được gia hạn và site qua Cloudflare trả 200.',
    hints: ['526 nghĩa là chứng chỉ origin không hợp lệ. Kiểm tra `sudo certbot certificates` (EXPIRED) và `systemctl status certbot.timer` (disabled).', 'Bật lại timer: `sudo systemctl enable --now certbot.timer`.', 'Gia hạn ngay: `sudo certbot renew`, rồi `curl -sSI https://tutor.haiphan.org`.'],
    fix: ['sudo certbot certificates', 'systemctl status certbot.timer', 'sudo systemctl enable --now certbot.timer', 'sudo certbot renew', 'curl -sSI https://tutor.haiphan.org'],
    cause: 'Không có timer thì không ai chạy `certbot renew`, chứng chỉ 90 ngày hết hạn và Cloudflare Full (strict) từ chối. Ngoài việc bật timer, hãy giám sát hạn chứng chỉ (`openssl x509 -checkend`) để biết trước khi người dùng biết.',
    setup: function (s) {
      s.W.cert2 = true; C.vpsBase(s); C.apps(s); C.certs(s, TUT); dnsBase(s);
      certEntry(s, TUT, { doms: [TUT], days: -2, auth: 'nginx', installer: 'nginx' });
      s.W.certTimer = false;
      s.W.dns[TUT] = { ip: IP, proxied: true }; s.W.cf.mode = 'full-strict';
      C.site(s, TUT, blocks()); V.ngReload(s, false);
    },
    check: function (s) { return !!s.W.certTimer && cmE(s, TUT).days > 30 && V.probe(s, 'https://' + TUT, false).status === 200; }
  }
);
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
