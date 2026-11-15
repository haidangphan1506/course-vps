(function (G) {
'use strict';
/* Chương c5i: Sao lưu và khôi phục thảm hoạ (DB, cấu hình, mã hoá bằng age, đưa ra ngoài VPS, diễn tập khôi phục). */
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, OK = C.OK, FAIL = C.FAIL, A = C.A, LIN = V.lin, L2 = V.lin2;
var ftxt = C.ftxt, HCU = C.HCU;
var quiet = { out: function () {}, err: function () {}, sudo: true };
var GRP = (C.lessons.filter(function (l) { return l.id === 'c5a'; })[0] || {}).group || 'Container';

function ct(s, n) { return s.W.containers.filter(function (c) { return c.name === n; })[0]; }
function listed(s, dir, re) { return s.fs.list(dir).some(function (n) { return re.test(n); }); }
function dumpName() { return 'tutor_db-2026-10-27.dump'; }

var SCRIPT = ['#!/bin/bash', 'set -euo pipefail', 'DEST="$HOME/backups"', 'mkdir -p "$DEST"', 'OUT="$DEST/tutor_db-$(date +%F).dump"', 'TMP="$OUT.tmp"', '/usr/bin/docker exec tutor-postgres pg_dump -U app -Fc tutor_db > "$TMP"', 'if [ ! -s "$TMP" ]; then echo "backup rỗng, dừng" >&2; rm -f "$TMP"; exit 1; fi', 'mv "$TMP" "$OUT"', 'find "$DEST" -name \'tutor_db-*.dump\' -mtime +7 -delete', 'echo "đã sao lưu: $OUT"'];

function base(s, o) {
  o = o || {};
  C.vpsBase(s);
  C.gateway(s, { env: C.ENV_OK, up: true, db: { initialized: true, password: 'Ab12cd34ef56', user: 'app', hasData: true } });
  C.linBase(s, { setup2: function (s2, S, l) {
    s2.fs.put('/usr/bin/docker', 'ELF docker', { owner: 'root', mode: M('755') });
    l.cronLocal = ['docker'];
    s2.fs.mkdirp(s2.home + '/bin', s2.user, M('755'));
    if (o.backups) s2.fs.mkdirp(s2.home + '/backups', s2.user, M('755'));
    if (o.setup) o.setup(s2, S, l);
  } });
}

var D = {
  id: 'c5i', group: GRP, short: 'Sao lưu và khôi phục',
  title: 'Sao lưu và khôi phục thảm hoạ',
  dek: 'Sao lưu Postgres và cấu hình đúng cách, mã hoá bản sao, đưa ra ngoài VPS, kiểm tra toàn vẹn và diễn tập khôi phục trước khi cần.'
};
C.insertAfter('c5h', D);

D.theory = [
  { tag: 'Khái niệm', title: 'Sao lưu không đồng nghĩa với khôi phục được', body: [
    'Một bản sao lưu chỉ có giá trị khi bạn **khôi phục được từ nó**, trong thời gian chấp nhận được. Hai con số định nghĩa mục tiêu:',
    { tbl: [['Thuật ngữ', 'Nghĩa', 'Ví dụ'], ['**RPO** (Recovery Point Objective)', 'Mất tối đa bao nhiêu dữ liệu (tính theo thời gian)', 'RPO 24 giờ: chấp nhận mất dữ liệu của một ngày'], ['**RTO** (Recovery Time Objective)', 'Phải có lại hệ thống trong bao lâu', 'RTO 2 giờ: từ khi sự cố đến khi site trở lại']] },
    { note: 'Với tutor (dữ liệu học viên, lịch dạy), RPO 24 giờ là mức tối thiểu hợp lý. Sao lưu lúc 02:30 mỗi đêm nghĩa là nếu VPS chết lúc 23:00, bạn mất gần 24 giờ dữ liệu.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Sao lưu cái gì, và quy tắc 3-2-1', body: [
    { tbl: [['Lớp', 'Nội dung', 'Cách lấy'], ['Cơ sở dữ liệu', 'Postgres `tutor_db`', '`pg_dump` (quan trọng nhất)'], ['Cấu hình', '`docker-compose.yml`, `/etc/nginx`, `/etc/systemd/system/tutor*`, crontab', '`tar`'], ['Bí mật', '`docker.env`, `.env`, khoá SSH và khoá age', '`tar` rồi **mã hoá**; để khoá riêng nơi khác'], ['Tệp người dùng', 'Ảnh, tài liệu upload', '`rsync`, hoặc tar volume khi dịch vụ đã dừng'], ['Chứng chỉ', '`/etc/letsencrypt`', 'Có thể lấy lại bằng certbot; vẫn nên sao lưu']] },
    'Quy tắc **3-2-1**: ba bản sao, trên hai loại phương tiện khác nhau, và một bản ở nơi khác (ngoài VPS). Một bản nằm cùng ổ với dữ liệu thì không phải là bản sao lưu: ổ hỏng là mất cả hai.'
  ] },
  { tag: 'Cú pháp', title: 'pg_dump và pg_restore trong container', body: [
    'Postgres trong Docker: lệnh chạy **bên trong** container, kết quả kéo ra host bằng chuyển hướng shell.',
    { pre: ['mkdir -p ~/backups', 'docker exec tutor-postgres pg_dump -U app tutor_db > ~/backups/plain.sql        # dạng văn bản SQL', 'docker exec tutor-postgres pg_dump -U app -Fc tutor_db > ~/backups/tutor_db.dump   # dạng nén nhị phân (custom)', 'docker exec -i tutor-postgres pg_restore -U app -d tutor_db --clean < ~/backups/tutor_db.dump'], cap: 'Sao lưu và khôi phục dạng custom' },
    { tbl: [['Tuỳ chọn', 'Ý nghĩa'], ['`-Fc`', 'Dạng custom: nén, cho phép khôi phục có chọn lọc bằng `pg_restore`'], ['`-d tutor_db`', 'Database đích khi khôi phục'], ['`--clean`', 'Xoá đối tượng cũ trước khi tạo lại'], ['`-i` (trên `docker exec`)', 'Giữ stdin mở để nhận file từ `<`']] },
    { note: '`psql < file.dump` **không** đọc được dạng `-Fc`. Dùng dạng văn bản (`plain.sql`) với `psql`, và dạng `-Fc` với `pg_restore`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Script sao lưu an toàn', body: [
    'Một script sao lưu tốt có bốn đặc điểm: dừng khi lỗi, ghi ra file tạm rồi mới đổi tên, kiểm tra file không rỗng, và xoay vòng có kiểm soát.',
    { pre: SCRIPT, cap: '~/bin/backup-db.sh' },
    { ul: ['`set -euo pipefail` (đã học ở chương shell): lỗi `docker exec` làm script dừng ngay, không tiếp tục với file rỗng', 'Ghi vào `.tmp` rồi `mv`: nếu sao lưu giữa chừng thất bại, không có file dở dang mang tên bản hợp lệ', '`-s` kiểm tra file không rỗng; chỉ khi có dữ liệu mới đổi tên', 'Xoay vòng `-mtime +7`: xoá bản **cũ hơn** 7 ngày. Dấu `-` hay `+` đảo nghĩa hoàn toàn; luôn chạy thử bằng `-print` trước'] }
  ] },
  { tag: 'Lưu ý', title: 'Chạy trong cron: đường dẫn tuyệt đối', body: [
    'Cron không có `docker` trong PATH (xem chương shell và chương dịch vụ). Dòng cron đúng phải chạy script bằng đường dẫn đầy đủ, và script gọi `/usr/bin/docker` bằng đường dẫn đầy đủ.',
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['File `.dump` có 0 byte mỗi đêm', 'Lệnh chạy lỗi, chuyển hướng vẫn tạo file rỗng', 'Kiểm tra `-s`, `set -e`, và log có `2>&1`'], ['Log có `docker: not found`', 'PATH của cron không có docker', 'Dùng `/usr/bin/docker` trong script'], ['Không có dòng nào trong log', 'Không chuyển hướng stdout và stderr', 'Thêm `>> ~/backup.log 2>&1` ở cuối dòng cron']] }
  ] },
  { tag: 'Cú pháp', title: 'Đưa bản sao ra ngoài VPS', body: [
    'Mục tiêu là bản thứ hai nằm trên máy khác. Hai công cụ đã biết: `scp` cho một file, `rsync` cho cả thư mục và chỉ truyền phần thay đổi.',
    { pre: ['scp ~/backups/tutor_db.dump backup@backup:/backups/', 'rsync -avzn ~/backups/ backup@backup:/backups/db/   # -n: chạy thử', 'rsync -avz ~/backups/ backup@backup:/backups/db/     # chạy thật'], cap: 'Đẩy ra máy sao lưu' },
    { note: 'Nhiều người chọn object storage (S3, Cloudflare R2, Backblaze B2, Google Drive) qua **rclone**: `rclone copy ~/backups r2:tutor-backups`. Chương này dạy nguyên lý và dùng máy sao lưu làm đích; rclone cần cấu hình tài khoản riêng nên không có trong bài lab.', kind: 'tip' },
    { ul: ['Đích sao lưu **không** nên dùng cùng tài khoản SSH quản trị với VPS chính. Nếu VPS bị chiếm, kẻ tấn công có thể xoá luôn bản sao', 'Đừng để `rsync --delete` chạy trên thư mục chứa nhiều đời bản sao mà không hiểu hậu quả (chương shell, phần đồng bộ)'] }
  ] },
  { tag: 'Khái niệm', title: 'Mã hoá bản sao bằng age', body: [
    'Bản sao lưu chứa mật khẩu, dữ liệu học viên, bí mật cấu hình. Nếu máy sao lưu bị lộ, không mã hoá nghĩa là lộ tất cả. **age** là công cụ mã hoá đơn giản dùng cặp khoá:',
    { tbl: [['Khoá', 'Đặt ở đâu', 'Dùng để'], ['**Khoá công khai** `age1...`', 'Ai cũng biết được; đặt trong script sao lưu', 'Mã hoá (`age -r`)'], ['**Khoá riêng** `AGE-SECRET-KEY-1...`', 'Chỉ giữ ở nơi an toàn, **không** cùng VPS', 'Giải mã (`age -d -i`)']] },
    { pre: ['sudo apt install -y age', 'mkdir -p ~/.config/age && age-keygen -o ~/.config/age/key.txt', 'chmod 600 ~/.config/age/key.txt', 'age-keygen -y ~/.config/age/key.txt                    # in khoá công khai', 'age -r $(age-keygen -y ~/.config/age/key.txt) -o out.age in.dump', 'age -d -i ~/.config/age/key.txt -o back.dump out.age'], cap: 'Mã hoá và giải mã' },
    { note: '**Mất khoá riêng = mất toàn bộ bản sao đã mã hoá.** Hãy lưu khoá riêng ở ít nhất hai nơi ngoài VPS (trình quản lý mật khẩu, một máy sao lưu khác). Khoá riêng nằm chung với bản mã hoá trên một máy là vô nghĩa về mặt bảo mật.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Kiểm tra toàn vẹn: sha256sum', body: [
    'Một bản sao bị hỏng im lặng (đĩa, truyền mạng) vẫn "chạy được" cho tới khi cần khôi phục. Ghi mã băm lúc sao lưu, kiểm tra lại trước khi tin cậy.',
    { pre: ['cd ~/backups && sha256sum tutor_db.dump > SHA256SUMS', 'sha256sum -c SHA256SUMS                  # OK hoặc FAILED', 'tutor_db.dump: OK'], cap: 'Manifest và kiểm tra' }
  ] },
  { tag: 'Quy trình', title: 'Diễn tập khôi phục: runbook và thời gian thật', body: [
    'Bản sao lưu chưa từng được khôi phục thì chưa phải bản sao lưu đáng tin. Diễn tập định kỳ (ví dụ mỗi quý) trên máy khác hoặc container tạm, và ghi lại thời gian thật.',
    { ul: ['**1.** Lấy bản sao mới nhất và kiểm tra `sha256sum -c`', '**2.** Giải mã bằng khoá lấy từ nơi lưu khoá riêng (không phải từ VPS đang chạy)', '**3.** Khôi phục vào database tạm, đếm vài bảng quan trọng (`users` có 128 dòng)', '**4.** Ghi thời gian từ bước 1 đến bước 3: đó là RTO thực tế', '**5.** Viết vào runbook: lệnh chính xác, vị trí khoá, ai được làm, và bước nào hay lỗi'] },
    { note: 'Runbook viết lúc bình tĩnh giúp tiết kiệm nhiều giờ lúc đang có sự cố. Viết sao cho người khác (hoặc bạn của 3 giờ sáng) làm theo được.', kind: 'tip' }
  ] },
  { tag: 'Bảng tra', title: 'Bảng triệu chứng và checklist', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Lệnh kiểm tra', 'Cách sửa'], ['`pg_restore: did not find magic string`', 'File rỗng hoặc không phải dạng `-Fc`', '`ls -l file.dump`', 'Sao lưu lại; kiểm tra `-s`'], ['`age: no identity matched`', 'Sai khoá riêng', '`age-keygen -y key.txt` so với khoá công khai trong bản mã hoá', 'Dùng đúng khoá đã mã hoá'], ['`age: failed to open identity file`', 'Khoá riêng không có trên máy này', '`ls ~/.config/age`', 'Lấy khoá từ nơi lưu an toàn'], ['`sha256sum: FAILED`', 'File bị hỏng hoặc bị sửa', '`sha256sum -c`', 'Dùng bản sao cũ hơn đã qua kiểm tra'], ['`No such container`', 'Sai tên container trong script', '`docker ps --format "{{.Names}}"`', 'Sửa tên, chạy thử thủ công'], ['Backup 0 byte mỗi đêm', 'Lệnh cron lỗi, không có `set -e`', '`cat ~/backup.log`', 'Dùng `set -euo pipefail` và `-s`']] },
    { ul: ['**1.** Sao lưu DB định dạng `-Fc` theo lịch, có kiểm tra file không rỗng', '**2.** Cấu hình và bí mật được sao lưu, bí mật được mã hoá', '**3.** Khoá riêng được lưu ở ít nhất hai nơi ngoài VPS', '**4.** Có bản thứ hai trên máy khác; đã thử `rsync -n` trước', '**5.** Xoay vòng có `-print` thử trước', '**6.** Đã diễn tập khôi phục ít nhất một lần và ghi thời gian'] }
  ] }
];

D.quiz = C.QZ(2, [
  ['RPO 24 giờ nghĩa là gì?', 'Chấp nhận mất tối đa khoảng 24 giờ dữ liệu gần nhất khi sự cố', ['Hệ thống phải khôi phục xong trong 24 giờ', 'Sao lưu chạy mỗi 24 phút', 'Bản sao lưu được giữ trong 24 ngày'], 'RPO đo lượng dữ liệu có thể mất, còn RTO đo thời gian để hoạt động lại.'],
  ['RTO khác RPO thế nào?', 'RTO là thời gian để hệ thống hoạt động lại; RPO là lượng dữ liệu tối đa có thể mất', ['Hai thuật ngữ giống nhau', 'RTO là dung lượng bản sao, RPO là thời gian chạy', 'RPO đo tốc độ mạng'], 'Một cái hỏi "mất bao lâu dữ liệu", một cái hỏi "chết bao lâu".'],
  ['Quy tắc 3-2-1 yêu cầu gì?', 'Ba bản sao, trên hai loại phương tiện, một bản ở nơi khác', ['Ba ổ đĩa cùng một máy, để tăng tốc', 'Hai bản sao, mỗi bản một tuần một lần', 'Ba bản sao ở cùng VPS'], 'Bản nằm cùng máy hoặc cùng ổ không bảo vệ được khi máy hỏng.'],
  ['Lệnh nào sao lưu DB Postgres trong container ra file dạng nén trên host?', 'docker exec tutor-postgres pg_dump -U app -Fc tutor_db > ~/backups/tutor_db.dump', ['docker cp tutor-postgres:/var/lib/postgresql ~/backups', 'docker exec tutor-postgres pg_dump -U app tutor_db -o ~/backups', 'docker save tutor-postgres > ~/backups/tutor.tar'], 'pg_dump chạy trong container, stdout được chuyển hướng ra host bằng `>`.'],
  ['Vì sao `psql < file.dump` lỗi với bản sao dạng `-Fc`?', '`-Fc` là dạng nhị phân; psql chỉ đọc SQL văn bản, cần `pg_restore`', ['psql không bao giờ khôi phục được dữ liệu', 'File phải có đuôi `.sql`', 'Thiếu dấu `-` trong lệnh psql'], 'Mỗi dạng sao lưu có công cụ khôi phục riêng: plain dùng psql, custom dùng pg_restore.'],
  ['Script sao lưu nên ghi ra file tạm rồi mới `mv`. Lợi ích chính?', 'Nếu sao lưu giữa chừng thất bại, không có file dở dang mang tên bản hợp lệ', ['Chạy nhanh hơn gấp đôi', 'Không cần quyền ghi vào thư mục đích', 'Tự động nén file'], 'Đổi tên là thao tác gần như tức thì; bản đích chỉ xuất hiện khi đã đầy đủ.'],
  ['Trong cron, dòng nào đúng để chạy script sao lưu và giữ log?', '`30 2 * * * /home/haidangphan/bin/backup-db.sh >> /home/haidangphan/backup.log 2>&1`', ['`30 2 * * * backup-db.sh`', '`30 2 * * * ~/bin/backup-db.sh --log`', '`30 2 * * * sudo backup-db.sh`'], 'Cron không có `~` đã mở rộng và PATH tối thiểu; cần đường dẫn đầy đủ và chuyển hướng cả stdout lẫn stderr.'],
  ['Khoá riêng age nên được lưu ở đâu?', 'Ở ít nhất hai nơi ngoài VPS, không cùng chỗ với bản mã hoá', ['Trong `docker.env` của VPS để tiện dùng', 'Cùng thư mục với bản sao lưu để dễ tìm', 'Trong crontab dưới dạng biến'], 'Mất khoá riêng là mất toàn bộ bản sao đã mã hoá. Để chung với bản mã hoá trên VPS thì mất cả hai khi VPS bị chiếm.'],
  ['`age -r <khoá công khai>` và `age -d -i <khoá riêng>` làm gì?', 'Mã hoá cho người nhận có khoá công khai đó / giải mã bằng khoá riêng tương ứng', ['Nén và giải nén file', 'Đổi quyền truy cập file', 'Ký số để chứng minh người gửi'], 'Khoá công khai ai cũng có thể dùng để mã hoá; chỉ khoá riêng mới giải mã được.'],
  ['`sha256sum -c SHA256SUMS` in `FAILED`. Hành động đúng?', 'Không tin bản đó; dùng bản cũ đã qua kiểm tra và tìm nguyên nhân hỏng', ['Bỏ qua vì sha256 chỉ là cảnh báo', 'Tạo lại SHA256SUMS ngay để hết lỗi', 'Xoá file SHA256SUMS'], 'Tạo lại manifest từ file đã hỏng sẽ hợp thức hoá dữ liệu sai.'],
  ['`sha256sum -c` cho biết điều gì mà `ls -l` không cho biết?', 'Nội dung file có còn đúng như lúc sao lưu hay không (đúng từng byte)', ['Ai là chủ sở hữu file', 'File có đủ quyền đọc hay không', 'Thời điểm file được tạo'], '`ls -l` chỉ thấy kích thước và thời gian; mã băm thấy được cả khi một byte thay đổi.'],
  ['Một lệnh `find ~/backups -name "*.dump" -mtime -7 -delete` sẽ làm gì?', 'Xoá các bản sao lưu MỚI hơn 7 ngày (đảo nghĩa), giữ lại bản cũ', ['Xoá các bản cũ hơn 7 ngày', 'Không xoá gì vì thiếu -print', 'Chỉ xoá file rỗng'], '`-mtime -7` là "ít hơn 7 ngày". Xoá xoay vòng cần `+7`. Luôn chạy thử với `-print` trước.'],
  ['Điều nào biến diễn tập khôi phục thành bằng chứng có giá trị?', 'Ghi thời gian thật từ lúc lấy bản sao đến lúc kiểm tra dữ liệu, và viết lại runbook', ['Chỉ cần thấy lệnh `pg_restore` chạy xong', 'Khôi phục thẳng lên DB đang sản xuất để thử', 'Xoá bản sao sau khi khôi phục'], 'Thời gian đo được là RTO thực tế; runbook giúp làm lại đúng khi có sự cố.']
]);

var PLAIN_CHECK = function (s, p) { return /TUTOR_DB_DUMP/.test(ftxt(s, p)); };

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { transient: true, text: 'Vào thư mục dự án `~/tutor/gateway`.', hint: 'cd ~/tutor/gateway', check: function (s) { return /\/tutor\/gateway$/.test(s.cwd); } },
    { text: 'Xác nhận hai container đang chạy.', hint: 'docker compose --env-file docker.env ps', check: OK(/^docker compose .*ps/) },
    { text: 'Ghi lại số học viên trước khi sao lưu (bảng `users`).', hint: 'docker exec tutor-postgres psql -U app -c "select count(*) from users;"', check: OK(/^docker exec tutor-postgres psql .*count/) },
    { text: 'Tạo thư mục `~/backups`.', hint: 'mkdir -p ~/backups', check: function (s) { return s.fs.isD(s.home + '/backups'); } },
    { text: 'Sao lưu dạng văn bản để xem thử nội dung: ghi ra `~/backups/plain.sql`.', hint: 'docker exec tutor-postgres pg_dump -U app tutor_db > ~/backups/plain.sql', check: function (s) { return PLAIN_CHECK(s, s.home + '/backups/plain.sql'); } },
    { text: 'Xem kích thước hai file vừa tạo.', hint: 'ls -lh ~/backups', check: OK(/^ls -lh \S*backups/) },
    { text: 'Sao lưu dạng custom nén, đặt tên theo ngày.', hint: 'docker exec tutor-postgres pg_dump -U app -Fc tutor_db > ~/backups/tutor_db-$(date +%F).dump', check: function (s) { return listed(s, s.home + '/backups', /^tutor_db-.*\.dump$/); } },
    { text: 'Khôi phục thử bản custom vào `tutor_db` (dùng `-i` và `<`).', hint: 'docker exec -i tutor-postgres pg_restore -U app -d tutor_db --clean < ~/backups/tutor_db-$(date +%F).dump', check: OK(/^docker exec -i tutor-postgres pg_restore .*--clean/) },
    { text: 'Kiểm tra lại số học viên sau khi khôi phục thử.', hint: 'docker exec tutor-postgres psql -U app -c "select count(*) from users;"', check: function (s) { return s.hist.filter(function (h) { return h.code === 0 && /psql .*count/.test(h.cmd); }).length >= 2; } },
    { text: 'Viết script sao lưu `~/bin/backup-db.sh` (an toàn, xoay vòng).', hint: HCU('~/bin/backup-db.sh', SCRIPT), check: function (s) { var t = ftxt(s, s.home + '/bin/backup-db.sh'); return /set -euo pipefail/.test(t) && /-s "\$TMP"|! -s/.test(t) && /\/usr\/bin\/docker/.test(t) && /mv "\$TMP"/.test(t); } },
    { text: 'Cấp quyền chạy cho script.', hint: 'chmod +x ~/bin/backup-db.sh', check: function (s) { var n = s.fs.get(s.home + '/bin/backup-db.sh'); return !!n && (n.mode & 73) > 0; } },
    { text: 'Chạy script sao lưu bằng đường dẫn đầy đủ.', hint: '~/bin/backup-db.sh', check: OK(/^\S*backup-db\.sh$/) },
    { text: 'Sao lưu cấu hình (không gồm `docker.env`) thành tgz trong `~/backups`.', hint: 'cd ~/tutor/gateway && tar czf ~/backups/config-$(date +%F).tgz docker-compose.yml', check: function (s) { return listed(s, s.home + '/backups', /^config-.*\.tgz$/); } },
    { text: 'Kiểm tra nội dung tgz trước khi tin nó.', hint: 'tar tzf ~/backups/config-$(date +%F).tgz', check: OK(/^tar tzf \S*config-/) },
    { text: 'Tạo manifest mã băm cho toàn bộ thư mục sao lưu.', hint: 'cd ~/backups && sha256sum * > SHA256SUMS', check: function (s) { return !!s.fs.get(s.home + '/backups/SHA256SUMS'); } },
    { text: 'Kiểm tra toàn vẹn bằng manifest.', hint: 'cd ~/backups && sha256sum -c SHA256SUMS', check: OK(/^sha256sum -c SHA256SUMS$/) },
    { text: 'Cài công cụ mã hoá `age`.', hint: 'sudo apt install -y age', check: function (s) { return !!(s.W.lin2.pkgs && s.W.lin2.pkgs.age); } },
    { text: 'Tạo cặp khoá age trong `~/.config/age/key.txt`.', hint: 'mkdir -p ~/.config/age && age-keygen -o ~/.config/age/key.txt', check: function (s) { return /AGE-SECRET-KEY-1/.test(ftxt(s, s.home + '/.config/age/key.txt')); } },
    { text: 'Khoá riêng phải chỉ chủ đọc được: đặt quyền 600.', hint: 'chmod 600 ~/.config/age/key.txt', check: function (s) { var n = s.fs.get(s.home + '/.config/age/key.txt'); return !!n && (n.mode & 511) === M('600'); } },
    { text: 'In khoá công khai bằng `age-keygen -y`.', hint: 'age-keygen -y ~/.config/age/key.txt', check: OK(/^age-keygen -y /) },
    { text: 'Mã hoá bản custom bằng khoá công khai, ra `~/backups/tutor_db.dump.age`.', hint: 'age -r $(age-keygen -y ~/.config/age/key.txt) -o ~/backups/tutor_db.dump.age ~/backups/tutor_db-$(date +%F).dump', check: function (s) { return /-> X25519 age1/.test(ftxt(s, s.home + '/backups/tutor_db.dump.age')); } },
    { transient: true, text: 'Giải mã thử ra `~/check.dump` bằng khoá riêng.', hint: 'age -d -i ~/.config/age/key.txt -o ~/check.dump ~/backups/tutor_db.dump.age', check: function (s) { return PLAIN_CHECK(s, s.home + '/check.dump'); } },
    { text: 'So sánh mã băm của bản giải mã với bản gốc: phải giống nhau.', hint: 'sha256sum ~/check.dump ~/backups/tutor_db-$(date +%F).dump', check: OK(/^sha256sum .*check\.dump/) },
    { text: 'Xoá bản giải mã trên VPS (không để bản rõ lại đây).', hint: 'rm ~/check.dump', check: function (s) { return !s.fs.get(s.home + '/check.dump'); } },
    { text: 'Thêm máy sao lưu vào /etc/hosts.', hint: "echo '10.0.0.20 backup' | sudo tee -a /etc/hosts", check: function (s) { return /10\.0\.0\.20\s+backup/.test(ftxt(s, '/etc/hosts')); } },
    { text: 'Đẩy bản mã hoá ra máy sao lưu bằng scp.', hint: 'scp ~/backups/tutor_db.dump.age backup@backup:/backups/', check: function (s) { return !!s.fs.get('/__r/backup/backups/tutor_db.dump.age'); } },
    { text: 'Tạo thư mục giữ khoá trên máy sao lưu, rồi chép khoá riêng sang (nơi thứ hai ngoài VPS).', hint: "ssh backup@backup mkdir -p /home/backup/keys\nscp ~/.config/age/key.txt backup@backup:/home/backup/keys/age-tutor.txt", check: function (s) { return !!s.fs.get('/__r/backup/home/backup/keys/age-tutor.txt'); } },
    { text: 'Đồng bộ thư mục sao lưu bằng rsync: chạy thử trước với `-n`.', hint: 'rsync -avzn ~/backups/ backup@backup:/backups/db/', check: OK(/^rsync -avzn \S*backups\//) },
    { text: 'Chạy thật.', hint: 'rsync -avz ~/backups/ backup@backup:/backups/db/', check: OK(/^rsync -avz \S*backups\//) },
    { text: 'Kiểm tra bản đã có trên máy sao lưu.', hint: 'ssh backup@backup ls /backups/db', check: OK(/^ssh backup@backup ls \/backups\/db/) },
    { text: 'Xem trước các bản cũ hơn 7 ngày sẽ bị xoá (chỉ in, chưa xoá).', hint: "find ~/backups -name 'tutor_db-*.dump' -mtime +7 -print", check: OK(/-mtime \+7 -print/) },
    { text: 'Hẹn sao lưu lúc 02:30 mỗi đêm, ghi log vào `~/backup.log` (đường dẫn đầy đủ).', hint: "echo '30 2 * * * /home/haidangphan/bin/backup-db.sh >> /home/haidangphan/backup.log 2>&1' | crontab -", check: function (s) { return /backup-db\.sh >> \S*backup\.log 2>&1/.test((s.W.lin.cron || {}).haidangphan || ''); } },
    { text: 'Kiểm tra crontab vừa nạp.', hint: 'crontab -l', check: OK(/^crontab -l/) },
    { text: 'Ghi một dòng vào `~/restore-drill.log` là ngày diễn tập đã làm (theo dõi định kỳ).', hint: "echo \"$(date +%F) diễn tập: ok\" >> ~/restore-drill.log", check: function (s) { return /diễn tập/.test(ftxt(s, s.home + '/restore-drill.log')); } }
  ]
};

D.debugs = [
  {
    id: 'c5i1', title: 'Mỗi đêm có file .dump 0 byte',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls -lh ~/backups', '-rw-r--r-- 1 haidangphan haidangphan    0 Oct 27 02:30 tutor_db-nightly.dump', '', '$ crontab -l', '30 2 * * * docker exec tutor-postgres pg_dump -U app -Fc tutor_db > /home/haidangphan/backups/tutor_db-nightly.dump', '', '$ cat ~/backup.log', '(trống)'),
    story: 'Bạn đã hẹn sao lưu đêm, nhưng mỗi buổi sáng chỉ thấy file 0 byte. Không có dòng nào trong log.',
    goal: 'Sửa dòng cron để mỗi đêm tạo ra file `.dump` có dữ liệu, và có log ghi lại mọi lần chạy.',
    hints: ['Log trống vì cron không chuyển hướng stderr và chạy lệnh không tìm thấy `docker`. Chuyển hướng `>` đã tạo file rỗng trước khi lệnh chạy.', 'Trong cron, `docker` không có trong PATH. Dùng đường dẫn tuyệt đối `/usr/bin/docker` và ghi stderr vào log.', 'Viết lại dòng cron: `echo "30 2 * * * /usr/bin/docker exec tutor-postgres pg_dump -U app -Fc tutor_db > /home/haidangphan/backups/tutor_db-nightly.dump 2>> /home/haidangphan/backup.log" | crontab -`.'],
    fix: ['crontab -l', 'ls -lh ~/backups', 'echo "30 2 * * * /usr/bin/docker exec tutor-postgres pg_dump -U app -Fc tutor_db > /home/haidangphan/backups/tutor_db-nightly.dump 2>> /home/haidangphan/backup.log" | crontab -', 'crontab -l'],
    cause: 'Shell tạo file đích trước khi chạy lệnh, nên lệnh lỗi vẫn để lại file 0 byte. Cron không có `docker` trong PATH nên lệnh thất bại. Vì không chuyển hướng stderr, lỗi bị mất. Ba vấn đề cùng lúc: đường dẫn, log, và kiểm tra file rỗng.',
    setup: function (s) { base(s, { backups: true, setup: function (s2, S, l) { s2.fs.put(s2.home + '/backups/tutor_db-2026-10-26.dump', 'TUTOR_DB_DUMP\n', { owner: s2.user, mode: M('644') }); l.cron.haidangphan = '30 2 * * * docker exec tutor-postgres pg_dump -U app -Fc tutor_db > /home/haidangphan/backups/tutor_db-nightly.dump\n'; LIN.advance(s2, 60, quiet); } }); },
    check: function (s) { var t = (s.W.lin.cron || {}).haidangphan || ''; return /\/usr\/bin\/docker/.test(t) && /2>&1|2>>/.test(t); }
  },
  {
    id: 'c5i2', title: 'Xoá nhầm: bản mới bị xoá, bản cũ còn lại',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls ~/backups', 'tutor_db-2026-09-01.dump', 'tutor_db-2026-10-20.dump', '', '$ cat ~/bin/prune.sh', 'find ~/backups -name "tutor_db-*.dump" -mtime -7 -delete', '', '(bản 26/10 và 27/10 đã biến mất sau khi chạy prune.sh)'),
    story: 'Script `prune.sh` được viết để giữ 7 ngày gần nhất. Sau khi chạy, các bản gần đây bị xoá, còn lại bản cũ từ tháng 9.',
    goal: 'Sửa `prune.sh` để xoá các bản **cũ hơn 7 ngày** và giữ lại các bản gần đây. Chạy thử với `-print` trước khi xoá.',
    hints: ['Đọc kỹ `-mtime -7`: nó nghĩa là "ít hơn 7 ngày", tức là các bản MỚI.', 'Đổi thành `-mtime +7` (hơn 7 ngày). Chạy `find ... -print` để xem trước danh sách.', 'Sửa: `sed -i "s/-mtime -7/-mtime +7/" ~/bin/prune.sh`, rồi kiểm tra `cat ~/bin/prune.sh`.'],
    fix: ['cat ~/bin/prune.sh', 'sed -i "s/-mtime -7/-mtime +7/" ~/bin/prune.sh', 'cat ~/bin/prune.sh', 'find ~/backups -name "tutor_db-*.dump" -mtime +7 -print'],
    cause: 'Dấu của `-mtime` đảo nghĩa: `-7` là trong vòng 7 ngày, `+7` là cũ hơn 7 ngày. Xoá mà không chạy `-print` trước khiến lỗi lộ ra quá muộn.',
    setup: function (s) { base(s, { backups: true, setup: function (s2) {
      var names = [['tutor_db-2026-09-01.dump', 56], ['tutor_db-2026-10-20.dump', 7]];
      names.forEach(function (x) { s2.fs.put(s2.home + '/backups/' + x[0], 'TUTOR_DB_DUMP\n', { owner: s2.user, mode: M('644') }); s2.fs.get(s2.home + '/backups/' + x[0]).mdays = x[1]; });
      s2.fs.put(s2.home + '/bin/prune.sh', '#!/bin/bash\nfind ~/backups -name "tutor_db-*.dump" -mtime -7 -delete\n', { owner: s2.user, mode: M('755') });
    } }); },
    check: function (s) { var t = ftxt(s, s.home + '/bin/prune.sh'); return /-mtime \+7/.test(t) && !/-mtime -7/.test(t); }
  },
  {
    id: 'c5i3', title: 'Script báo "đã sao lưu" nhưng không có dữ liệu',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ tail -4 ~/backup.log', 'Error response from daemon: No such container: tutor-postgress', 'đã sao lưu: /home/haidangphan/backups/tutor_db-2026-10-27.dump', '', '$ ls -l ~/backups/tutor_db-2026-10-27.dump', '-rw-r--r-- 1 haidangphan haidangphan 0 Oct 27 02:30 /home/haidangphan/backups/tutor_db-2026-10-27.dump'),
    story: 'Script `backup-nightly.sh` in ra "đã sao lưu" và thoát thành công, nhưng file 0 byte. Có một lỗi nhỏ trong log.',
    goal: 'Sửa script để: dừng khi `docker exec` lỗi, không in "đã sao lưu" nếu file rỗng, và tên container đúng là `tutor-postgres`.',
    hints: ['Log có chữ `No such container`: tên container bị gõ sai (`tutor-postgress`). Đối chiếu với `docker ps --format "{{.Names}}"`.', 'Script không có `set -e`/`pipefail` nên lỗi bị bỏ qua, và `echo` vẫn chạy. Thêm `set -euo pipefail` và kiểm tra `-s`.', 'Thay cả dòng bằng `sed -i "s/tutor-postgress/tutor-postgres/" ~/bin/backup-nightly.sh`, rồi thêm dòng `set -euo pipefail` dưới shebang và chạy thử.'],
    fix: ['cat ~/bin/backup-nightly.sh', 'docker ps --format "{{.Names}}"', 'sed -i "s/tutor-postgress/tutor-postgres/" ~/bin/backup-nightly.sh', "sed -i '1a set -euo pipefail' ~/bin/backup-nightly.sh", '~/bin/backup-nightly.sh; echo "rc=$?"', 'ls -l ~/backups'],
    cause: 'Lệnh `docker exec` lỗi không làm script dừng vì thiếu `set -e`. Chuyển hướng đã tạo file rỗng, và `echo` vẫn chạy nên báo thành công giả. Một script sao lưu phải coi file rỗng là thất bại.',
    setup: function (s) { base(s, { backups: true, setup: function (s2) {
      s2.fs.put(s2.home + '/bin/backup-nightly.sh', '#!/bin/bash\nOUT=$HOME/backups/tutor_db-$(date +%F).dump\n/usr/bin/docker exec tutor-postgress pg_dump -U app -Fc tutor_db > "$OUT"\necho "đã sao lưu: $OUT"\n', { owner: s2.user, mode: M('755') });
      s2.fs.put(s2.home + '/backup.log', 'Error response from daemon: No such container: tutor-postgress\nđã sao lưu: /home/haidangphan/backups/tutor_db-2026-10-27.dump\n', { owner: s2.user, mode: M('644') });
    } }); },
    check: function (s) { var t = ftxt(s, s.home + '/bin/backup-nightly.sh'); return /tutor-postgres\b/.test(t) && !/tutor-postgress/.test(t) && /set -e/.test(t); }
  },
  {
    id: 'c5i4', title: 'Máy mới, có bản mã hoá nhưng không có khoá riêng', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls ~/backups', 'tutor_db.dump.age', '', '$ age -d -i ~/.config/age/key.txt -o ~/restore.dump ~/backups/tutor_db.dump.age', 'age: error: failed to open identity file /home/haidangphan/.config/age/key.txt: No such file or directory', '', '$ ls ~/.config/age', '(thư mục không tồn tại)'),
    story: 'VPS được dựng lại từ đầu. Bạn đã kéo bản mã hoá từ máy sao lưu về, nhưng khoá riêng cũ đã mất theo máy cũ. Dữ liệu chỉ có ích nếu khôi phục được.',
    goal: 'Lấy được khoá riêng từ nơi lưu an toàn ngoài VPS, giải mã bản `tutor_db.dump.age`, và khôi phục vào `tutor_db` (đếm được `users` > 0).',
    hints: ['Khoá riêng đã được lưu ở máy sao lưu từ lúc sao lưu trước. Xem `ssh backup@backup ls /backups /home/backup/keys`.', 'Kéo khoá về đúng chỗ bằng `scp backup@backup:/home/backup/keys/age-tutor.txt ~/.config/age/key.txt` (sau khi `mkdir -p ~/.config/age`), rồi `chmod 600`.', 'Giải mã: `age -d -i ~/.config/age/key.txt -o ~/restore.dump ~/backups/tutor_db.dump.age`, rồi `docker exec -i tutor-postgres pg_restore -U app -d tutor_db --clean < ~/restore.dump`.'],
    fix: ['ls ~/.config/age', 'ssh backup@backup ls /home/backup/keys', 'mkdir -p ~/.config/age', 'scp backup@backup:/home/backup/keys/age-tutor.txt ~/.config/age/key.txt', 'chmod 600 ~/.config/age/key.txt', 'age -d -i ~/.config/age/key.txt -o ~/restore.dump ~/backups/tutor_db.dump.age', 'docker exec -i tutor-postgres pg_restore -U app -d tutor_db --clean < ~/restore.dump', 'docker exec tutor-postgres psql -U app -c "select count(*) from users;"'],
    cause: 'Bản mã hoá vô dụng nếu thiếu khoá riêng. Chính vì vậy khoá phải được lưu ở nơi ngoài VPS, và được kiểm tra định kỳ bằng một lần giải mã thử (diễn tập). Ở đây khoá vẫn còn trên máy sao lưu, nên khôi phục được.',
    setup: function (s) {
      base(s, { backups: true, setup: function (s2) {
        var seed = 'backup-key-2026';
        s2.fs.mkdirp('/__r/backup/home/backup/keys', 'backup', M('755'));
        s2.fs.put('/__r/backup/home/backup/keys/age-tutor.txt', V.age.keyText(seed), { owner: 'backup', mode: M('600') });
        s2.fs.put(s2.home + '/backups/tutor_db.dump.age', V.age.encText(V.age.pubOf(seed), V.DUMP), { owner: s2.user, mode: M('644') });
        s2.W.db.hasData = false; s2.W.lin2.pkgs.age = { ver: '1.1.1-2', manual: true };
        s2.fs.put('/etc/hosts', (s2.fs.get('/etc/hosts') ? s2.fs.get('/etc/hosts').c : '') + '10.0.0.20 backup\n', { owner: 'root', mode: M('644') });
      } });
    },
    check: function (s) { return PLAIN_CHECK(s, s.home + '/restore.dump') && s.hist.some(function (h) { return h.code === 0 && /pg_restore/.test(h.cmd); }) && /AGE-SECRET-KEY-1/.test(ftxt(s, s.home + '/.config/age/key.txt')); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
