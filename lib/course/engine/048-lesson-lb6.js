(function (G) {
'use strict';
/* Chương lb6: nén, lưu trữ, đồng bộ và kiểm chứng. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
var W = function (s) { return s.home + '/work/'; };
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }
function arcs(s) { return (s.W && s.W.lin2 && s.W.lin2.arcs) || {}; }
function arcNames(s, f) { var d = arcs(s)[W(s) + f]; return d ? d.ents.map(function (e) { return e.name; }) : null; }
function remoteHas(s, p) { return !!s.fs.get('/__r/backup' + p); }

var T = {
  id: 'lb6', group: 'Linux căn bản', short: 'Nén và lưu trữ',
  title: 'Nén, lưu trữ và đồng bộ: tar, gzip, zip, rsync, scp, sha256sum',
  dek: 'Đóng gói thư mục với tar, nén bằng gzip và zip, giải nén an toàn, đồng bộ bằng rsync (dấu / cuối đường dẫn), chép qua mạng với scp, và kiểm chứng toàn vẹn bằng sha256sum. Nền tảng của mọi quy trình sao lưu.'
};
C.insertAfter('lb5', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Đóng gói và nén là hai việc khác nhau', body: [
    { tbl: [['Công cụ', 'Việc nó làm', 'Đuôi file'], ['`tar`', '**Đóng gói** nhiều file/thư mục thành một file (giữ quyền, chủ, thời gian), không nén', '`.tar`'], ['`gzip`', '**Nén** một file thành `.gz` (không nhận thư mục)', '`.gz`'], ['`tar` + `gzip`', 'Đóng gói rồi nén: kết hợp bằng cờ `z`', '`.tar.gz` hoặc `.tgz`'], ['`zip` / `unzip`', 'Đóng gói **và** nén trong một định dạng, tiện trao đổi với Windows/macOS', '`.zip`']] },
    'Trên Linux, chuẩn thực tế để sao lưu thư mục là `.tar.gz` vì giữ nguyên quyền và chủ file; `.zip` dùng khi gửi cho người dùng Windows. (Các định dạng nén mạnh hơn như `.tar.xz`, `.tar.zst` dùng cú pháp tương tự: `tar cJf`, `tar --zstd`.)',
    { note: 'Nén không phải mã hoá: ai có file đều giải nén được. Nội dung nhạy cảm cần mã hoá riêng (xem chương Sao lưu).', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'tar: tạo archive', body: [
    { tbl: [['Cờ', 'Ý nghĩa'], ['`c`', 'create: tạo archive'], ['`z`', 'nén (hoặc giải nén) bằng gzip'], ['`v`', 'verbose: in tên từng file'], ['`f TÊN`', 'file archive tên `TÊN` (đặt **ngay sau** cờ, tên file đi liền theo)'], ['`-C THƯ_MỤC`', 'chuyển vào thư mục trước khi thêm file'], ['`--exclude=MẪU`', 'bỏ qua file/thư mục khớp mẫu']] },
    { pre: ['tar czf backup.tgz projects/tutor/src data           # đóng gói và nén', 'tar czf "backup-$(date +%F).tgz" data               # kèm ngày trong tên', 'tar czf proj.tgz --exclude=node_modules projects    # bỏ node_modules', 'tar czf proj.tgz -C projects tutor                   # tên trong archive bắt đầu bằng tutor/, không có projects/', 'tar cf plain.tar data                                 # chỉ đóng gói, không nén'], cap: 'Ví dụ' },
    { ul: ['Thứ tự: `tar czf TÊN_ARCHIVE các_thứ_cần_nén`. Viết `tar czf data backup.tgz` (đảo) sẽ coi `data` là tên archive', 'Đường dẫn tuyệt đối: tar tự bỏ `/` đầu (`Removing leading /`) để lúc giải nén không ghi đè hệ thống', 'Đừng ghi archive vào chính thư mục đang nén (`tar czf data/x.tgz data` sẽ nén cả chính nó)'] }
  ] },
  { tag: 'Cú pháp', title: 'tar: xem và giải nén', body: [
    { tbl: [['Muốn', 'Lệnh'], ['Xem danh sách', '`tar tzf backup.tgz` (thêm `v` để xem quyền, chủ, cỡ: `tar tvzf`)'], ['Giải nén ở thư mục hiện tại', '`tar xzf backup.tgz`'], ['Giải vào thư mục khác', '`tar xzf backup.tgz -C restore` (thư mục phải tồn tại)'], ['Chỉ giải một file', '`tar xzf backup.tgz data/users.csv`'], ['In nội dung một file ra màn hình', '`tar xzf backup.tgz data/users.csv -O`'], ['Bỏ bớt thư mục cấp đầu', '`tar xzf proj.tgz -C flat --strip-components=1`']] },
    { pre: ['tar tzf release.tgz | head          # LUÔN xem trước khi giải', 'mkdir release && tar xzf release.tgz -C release', 'tar czf - data | tar xzf - -C /tmp/copy   # "-" là luồng chuẩn: nén ở đây, giải ở kia'], cap: 'Giải nén an toàn' },
    { note: 'Archive "tarbomb" không có thư mục gốc: giải nén thẳng ra thư mục hiện tại và trộn lẫn với file của bạn. Luôn `tar tzf` xem trước, hoặc giải vào thư mục mới bằng `-C`.', kind: 'warn' },
    'Lỗi `gzip: stdin: not in gzip format` nghĩa là bạn dùng `z` cho file **không** nén (hoặc ngược lại). Dùng `file archive` để biết loại thật.'
  ] },
  { tag: 'Cú pháp', title: 'gzip, gunzip, zip, unzip', body: [
    { pre: ['gzip notes.txt                # thay notes.txt bằng notes.txt.gz', 'gzip -k notes.txt             # -k: giữ file gốc', 'gzip -l notes.txt.gz          # xem cỡ nén và tỉ lệ', 'gunzip notes.txt.gz           # giải nén (cũng là gzip -d)', 'zcat notes.txt.gz | head -3   # đọc nội dung mà không giải nén ra đĩa'], cap: 'gzip' },
    { pre: ['sudo apt install -y zip unzip', 'zip -r site.zip data logs        # -r: gồm thư mục con', 'unzip -l site.zip                # xem danh sách', 'unzip site.zip -d unz            # giải vào thư mục unz', 'unzip -t site.zip                # kiểm tra toàn vẹn'], cap: 'zip' },
    'Log lớn nên nén thay vì xoá: `gzip logs/old.log` thường giảm cỡ 5-10 lần. `logrotate` làm việc này tự động theo lịch.'
  ] },
  { tag: 'Cú pháp', title: 'sha256sum: kiểm chứng toàn vẹn', body: [
    'Một hàm băm biến nội dung file thành chuỗi ngắn cố định (**checksum**). Đổi một bit trong file là checksum đổi hoàn toàn, nên so checksum để chắc chắn file không hỏng hay bị thay đổi khi tải/chép.',
    { pre: ['sha256sum notes.txt                 # in checksum', 'sha256sum notes.txt todo.md > SUMS    # lưu danh sách', 'sha256sum -c SUMS                    # kiểm tra: mỗi file OK hoặc FAILED', 'md5sum notes.txt                    # md5: nhanh, dùng phát hiện lỗi chép (không dùng cho bảo mật)'], cap: 'Dùng' },
    { ul: ['Tải phần mềm: so `sha256sum file` với checksum công bố của nhà phát hành (lấy từ nguồn tin cậy, kênh khác)', 'Sau khi sao lưu hoặc chép sang máy khác: chạy `sha256sum -c` hai đầu để chắc bản sao đúng', '`FAILED` nghĩa là nội dung đã khác: tải/chép lại, đừng dùng file đó'] }
  ] },
  { tag: 'Cú pháp', title: 'rsync: đồng bộ thông minh', body: [
    'Khác `cp`, `rsync` chỉ chép phần **khác biệt** (file mới hoặc đã đổi), nên lần chạy thứ hai nhanh hơn nhiều. Nó cũng làm việc qua SSH.',
    { pre: ['rsync -av data/ copy/                   # -a: lưu trữ (giữ quyền, thời gian), -v: nói rõ', 'rsync -avn data/ copy/                  # -n: chạy thử, chưa chép gì (dry run)', 'rsync -av --delete src/ dst/            # xoá ở đích những file không còn ở nguồn', 'rsync -a --exclude=node_modules projects/ pcopy/', 'rsync -avz logs/ backup@backup.example.com:/backups/logs/   # qua SSH, -z nén khi truyền'], cap: 'Ví dụ' },
    { tbl: [['Viết', 'Kết quả'], ['`rsync -a site/ /srv/www/`', 'Chép **nội dung** của `site` vào `/srv/www/` (`index.html` nằm trực tiếp trong `/srv/www`)'], ['`rsync -a site /srv/www/`', 'Chép chính thư mục `site` vào `/srv/www/` (kết quả `/srv/www/site/index.html`)']] },
    { note: 'Dấu `/` ở cuối **nguồn** quyết định kết quả. Với `--delete`, hãy chạy `-n` trước: viết nhầm đích có thể xoá cả thư mục.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'scp và ssh: chép sang máy khác', body: [
    { pre: ['scp notes.txt backup@backup.example.com:~/            # chép lên máy backup', 'scp -r data backup@backup.example.com:/backups/        # -r cho thư mục', 'scp backup@backup.example.com:/backups/data/users.csv .   # tải về thư mục hiện tại', 'ssh backup@backup.example.com ls /backups               # chạy một lệnh trên máy kia'], cap: 'Ví dụ (máy backup của khoá học)' },
    { ul: ['Cần đăng nhập được bằng khoá SSH (`ssh-keygen`, rồi cài khoá công khai lên máy kia). Lỗi `Permission denied (publickey)` là chưa có hoặc sai khoá', 'Cú pháp đường dẫn từ xa: `user@host:đường_dẫn`. Đường dẫn tương đối tính từ thư mục home bên kia', 'Chép nhiều hoặc chép định kỳ: dùng `rsync` qua ssh, nhanh hơn và dừng/tiếp tục được', 'Cảnh báo `Permanently added ... to the list of known hosts` là bình thường ở lần kết nối đầu'] }
  ] },
  { tag: 'Quy trình', title: 'Một quy trình sao lưu đơn giản và đáng tin', body: [
    { pre: ['#!/bin/bash', 'set -euo pipefail', 'DEST=~/backups', 'STAMP=$(date +%F)', 'tar czf "$DEST/work-$STAMP.tgz" -C ~ work/projects         # 1. đóng gói', 'sha256sum "$DEST/work-$STAMP.tgz" > "$DEST/work-$STAMP.sha256"   # 2. checksum', 'rsync -a "$DEST/" backup@backup.example.com:/backups/        # 3. đẩy sang máy khác', 'echo "đã sao lưu $STAMP"'], cap: 'backup.sh (ý tưởng)' },
    { ul: ['**3-2-1**: 3 bản sao, 2 loại phương tiện khác nhau, 1 bản ở ngoài địa điểm. Bản sao cùng ổ đĩa không phải sao lưu', 'Cơ sở dữ liệu đang chạy phải `pg_dump` hoặc `mysqldump` ra file rồi mới đóng gói, đừng `tar` thư mục dữ liệu đang ghi', '**Thử khôi phục định kỳ** vào một thư mục tạm (`tar xzf ... -C /tmp/restore-test`). Sao lưu chưa từng khôi phục thử là sao lưu chưa biết có dùng được không', 'Chạy tự động bằng cron/systemd timer (chương Lập lịch), giữ N bản gần nhất để khỏi đầy đĩa'] }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['Giải nén làm lộn xộn thư mục hiện tại', 'Archive không có thư mục gốc', '`tar tzf` xem trước; giải vào `-C thư-mục-mới`'], ['`gzip: stdin: not in gzip format`', 'Dùng `z` cho archive chưa nén', 'Bỏ `z`: `tar xf`'], ['`tar: Cowardly refusing to create an empty archive`', 'Quên liệt kê file cần nén, hoặc đảo thứ tự tên', '`tar czf TÊN.tgz file...`'], ['Sau rsync, file nằm lồng thêm một cấp', 'Thiếu `/` cuối nguồn', '`rsync -a nguồn/ đích/`'], ['`Permission denied (publickey)` khi scp', 'Chưa có/sai khoá SSH', 'Tạo khoá và cài khoá công khai lên máy đích'], ['`sha256sum -c` báo FAILED', 'File hỏng hoặc bị đổi', 'Tải/chép lại và kiểm tra lại'], ['Đĩa đầy vì sao lưu', 'Giữ mọi bản và không nén', 'Xoay vòng: giữ N bản; `--exclude` thư mục tạo lại được']] },
    { ul: ['Đã `tar tzf` xem nội dung và đường dẫn trước khi giải nén chưa?', 'Dùng `rsync -n` trước khi chạy thật (đặc biệt với `--delete`)?', 'Có checksum đi kèm và đã kiểm tra hai đầu chưa?', 'Đã thử khôi phục từ bản sao lưu gần nhất chưa?'] }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`tar czf backup.tgz projects/tutor/src data`", "tar c tạo archive, z nén gzip, f đặt tên file; nén cả thư mục src và data.", "(không in ra)"], ["`tar tzf backup.tgz`", "t liệt kê nội dung archive mà không giải nén.", "projects/tutor/src/ / projects/tutor/src/app.js / projects/tutor/src/routes/ / projects/tutor/src/routes/users.js / projects/tutor/src/ut…"], ["`tar tvzf backup.tgz`", "tv liệt kê chi tiết: quyền, chủ, kích thước, ngày sửa.", "drwxr-xr-x haidangphan/haidangphan       0 2026-10-27 10:20 projects/tutor/src/ / -rw-r--r-- haidangphan/haidangphan     148 2026-10-27 1…"], ["`mkdir restore`", "Tạo thư mục restore để giải nén vào.", "(không in ra)"], ["`tar xzf backup.tgz -C restore`", "x giải nén, -C chỉ định thư mục đích.", "(không in ra)"], ["`tar xzf backup.tgz data/users.csv -O`", "Giải nén một file ra stdout (-O) để xem nội dung mà không ghi đĩa.", "id,name,role / 1,An,student / 2,Bình,student / 3,Cô Hà,teacher"], ["`tar czf b2.tgz --exclude=node_modules projects`", "--exclude bỏ thư mục node_modules khi nén.", "(không in ra)"], ["`tar czf \"backup-$(date +%F).tgz\" data`", "Tên archive có ngày hiện tại nhờ $(date +%F).", "(không in ra)"], ["`tar czf proj.tgz -C projects tutor`", "-C projects đổi thư mục gốc, archive chỉ có tutor/ ở đầu.", "(không in ra)"], ["`mkdir flat`", "Tạo thư mục flat để giải nén vào.", "(không in ra)"], ["`tar xzf proj.tgz -C flat --strip-components=1`", "--strip-components=1 bỏ cấp thư mục đầu tiên khi giải nén.", "(không in ra)"], ["`tar cf plain.tar data`", "cf tạo tar không nén (c tạo, f tên file).", "(không in ra)"], ["`gzip plain.tar`", "gzip nén plain.tar thành plain.tar.gz và xoá file gốc.", "(không in ra)"], ["`gzip -l plain.tar.gz`", "gzip -l xem kích thước trước và sau khi nén, cùng tỉ lệ nén.", "compressed        uncompressed  ratio uncompressed_name /                 307                1024 70.0% plain.tar"], ["`gunzip plain.tar.gz`", "gunzip giải nén plain.tar.gz và xoá file .gz.", "(không in ra)"], ["`gzip -k notes.txt`", "-k giữ file gốc khi nén.", "(không in ra)"], ["`zcat notes.txt.gz | head -1`", "zcat đọc file nén và in ra, không giải nén thành file.", "Họp nhóm thứ Hai: chốt lịch dạy thêm tuần sau."], ["`sudo apt install -y zip unzip rsync`", "Cài zip, unzip và rsync.", "Reading package lists... Done / Building dependency tree... Done / Reading state information... Done / rsync is already the newest versio…"], ["`zip -r site.zip data logs`", "zip -r tạo file zip đệ quy; mỗi mục được báo adding kèm tỉ lệ nén.", "adding: data/ (stored 0%) /   adding: data/users.csv (deflated 38%) /   adding: logs/ (stored 0%) /   adding: logs/app.log (deflated 38%)…"], ["`unzip -l site.zip`", "unzip -l liệt kê nội dung site.zip.", "Archive:  site.zip /   Length      Date    Time    Name / ---------  ---------- -----   ---- /         0  2026-10-27 10:20   data/ /     …"], ["`unzip -t site.zip`", "unzip -t kiểm tra từng file trong zip: OK nghĩa là file không hỏng.", "Archive:  site.zip /     testing: data/users.csv                OK /     testing: logs/app.log                  OK /     testing: logs/er…"], ["`unzip site.zip -d unz`", "-d unz giải nén vào thư mục unz.", "Archive:  site.zip /    creating: unz/data/ /   inflating: unz/data/users.csv /    creating: unz/logs/ /   inflating: unz/logs/app.log / …"], ["`sha256sum todo.md`", "sha256sum tính mã băm của todo.md.", "69e75cf8d98fb2380b43cd4757e1586723def7d717a684ae55f2c67f0cbc5ca7  todo.md"], ["`sha256sum todo.md data/users.csv > SUMS`", "Lưu mã băm của hai file vào SUMS để kiểm tra sau.", "[SUMS] 69e75cf8d98fb2380b43cd4757e1586723def7d717a684ae55f2c67f0cbc5ca7  todo.md / 46807205f26e3af0c6a41e8f10aabbb8ff31bee6240c5e6c6d13b6…"], ["`sha256sum -c SUMS`", "sha256sum -c so lại mã băm với SUMS: OK nghĩa là không đổi.", "todo.md: OK / data/users.csv: OK"], ["`echo \"- [ ] thêm việc\" >> todo.md`", "Thêm dòng vào todo.md làm nội dung thay đổi, nên mã băm sẽ khác.", "[todo.md] # Việc cần làm / - [ ] Cập nhật Node.js lên bản LTS / - [ ] Tắt đăng nhập SSH bằng mật khẩu / - [x] Cài Nginx / - [ ] thêm việc"], ["`echo -n abc | md5sum`", "md5sum của chuỗi abc; -n bỏ ký tự xuống dòng cuối.", "900150983cd24fb0d6963f7d28e17f72  -"], ["`cp -a data data-copy`", "cp -a sao chép giữ nguyên quyền, chủ và thời gian sửa.", "(không in ra)"], ["`rsync -av data/ copy/`", "rsync -av đồng bộ nội dung của data sang copy; dấu / cuối nghĩa là nội dung chứ không phải thư mục.", "sending incremental file list / ./ / users.csv /  / sent 277 bytes  received 80 bytes  238.00 bytes/sec / total size is 57  speedup is 0.16"], ["`rsync -avn logs/ logcopy/`", "-n là chạy thử: rsync chỉ liệt kê file sẽ được chép, không ghi thật.", "sending incremental file list / ./ / app.log / error.log / old.log /  / sent 5,291,398 bytes  received 140 bytes  3,527,692.00 bytes/sec …"], ["`mkdir src dst`", "Tạo hai thư mục để thử đồng bộ.", "(không in ra)"], ["`touch src/a src/b`", "Tạo hai file rỗng trong src.", "(không in ra)"], ["`rsync -a src/ dst/`", "Đồng bộ nội dung src sang dst.", "(không in ra)"], ["`rm src/b`", "Xoá file b ở nguồn.", "(không in ra)"], ["`rsync -a --delete src/ dst/`", "--delete xoá ở đích những file đã bị xoá ở nguồn; b biến mất khỏi dst.", "(không in ra)"], ["`rsync -a --exclude=node_modules projects/ pcopy/`", "--exclude bỏ node_modules khi đồng bộ projects.", "(không in ra)"], ["`scp notes.txt backup@backup.example.com:~/`", "scp chép notes.txt qua SSH sang máy backup; lần đầu có cảnh báo host mới.", "Warning: Permanently added '10.0.0.20' (ED25519) to the list of known hosts. / notes.txt                             100%   134      5.2K…"], ["`scp -r data backup@backup.example.com:/backups/`", "scp -r chép cả thư mục data sang máy backup.", "data/users.csv                        100%    57      2.2KB/s   00:00"], ["`rsync -avz logs/ backup@backup.example.com:/backups/logs/`", "rsync -z nén dữ liệu khi truyền qua mạng, chỉ gửi phần thay đổi.", "sending incremental file list / ./ / app.log / error.log / old.log /  / sent 5,291,398 bytes  received 140 bytes  3,527,692.00 bytes/sec …"], ["`ssh backup@backup.example.com ls /backups`", "ssh chạy lệnh ls trên máy từ xa rồi trả kết quả về.", "data  logs"], ["`scp backup@backup.example.com:/backups/data/users.csv ./users-remote.csv`", "scp kéo file users.csv từ máy backup về máy hiện tại với tên mới.", "backup@backup.example.com:/backups/data/users.csv100%    57      2.2KB/s   00:00"], ["`chmod +x scripts/backup.sh`", "Cấp quyền chạy cho script sao lưu.", "(không in ra)"], ["`./scripts/backup.sh`", "Chạy script sao lưu; tar bỏ dấu / đầu đường dẫn khi nén.", "tar: Removing leading `/' from member names / đã sao lưu"], ["`ls ~/backups`", "Kiểm tra file sao lưu đã được tạo trong ~/backups.", "work-2026-10-27.tgz"]]}]});
T.quiz = C.QZ(10, [
  ['Khác biệt giữa `tar` và `gzip`?', '`tar` đóng gói nhiều file thành một, `gzip` nén một file', ['`tar` nén mạnh hơn `gzip`', 'Hai lệnh giống nhau', '`gzip` đóng gói được thư mục'], 'Kết hợp bằng cờ `z`: `tar czf` đóng gói và nén.'],
  ['Lệnh nào tạo `backup.tgz` từ thư mục `data`?', '`tar czf backup.tgz data`', ['`tar czf data backup.tgz`', '`tar xzf backup.tgz data`', '`gzip backup.tgz data`'], 'Tên archive đi ngay sau `f`, rồi mới tới các thứ cần nén.'],
  ['Trước khi giải nén một archive không rõ nguồn, nên làm gì?', 'Xem danh sách bằng `tar tzf` hoặc giải vào thư mục mới bằng `-C`', ['Giải ngay ở thư mục home', 'Chạy `chmod 777`', 'Dùng `sudo` để giải'], 'Tránh "tarbomb" trộn file vào thư mục hiện tại.'],
  ['`tar xzf data.tar.gz` báo `gzip: stdin: not in gzip format`. Nguyên nhân khả dĩ nhất?', 'File thực ra chưa được nén gzip (tạo thiếu cờ `z`)', ['Ổ đĩa đầy', 'Thiếu quyền root', 'Thiếu cờ `v`'], 'Dùng `tar xf` (không `z`) hoặc `file data.tar.gz` để xem loại thật.'],
  ['Cách chỉ lấy `data/users.csv` ra từ `backup.tgz`?', '`tar xzf backup.tgz data/users.csv`', ['`tar tzf backup.tgz data/users.csv`', '`unzip backup.tgz users.csv`', '`gunzip data/users.csv`'], 'Liệt kê tên thành viên cần giải ở cuối lệnh.'],
  ['`gzip -k notes.txt` khác `gzip notes.txt` ở điểm nào?', 'Giữ lại file gốc `notes.txt`', ['Nén mạnh hơn', 'Chỉ đọc không nén', 'Nén cả thư mục'], 'Không có `-k`, file gốc bị thay bằng `.gz`.'],
  ['`sha256sum -c SUMS` in `notes.txt: FAILED`. Điều đó nghĩa là?', 'Nội dung `notes.txt` đã khác so với lúc tạo `SUMS`', ['Thiếu quyền đọc', 'Checksum quá cũ về thời gian', 'File đã được nén'], 'Một bit khác nhau cũng đổi hoàn toàn checksum.'],
  ['`rsync -a site/ /srv/www/` và `rsync -a site /srv/www/` khác nhau thế nào?', 'Có `/` cuối: chép nội dung `site` vào `/srv/www`; không có: tạo `/srv/www/site`', ['Không khác', 'Cái có `/` cuối xoá thư mục đích', 'Cái không có `/` chép chậm hơn'], 'Dấu `/` cuối nguồn rsync quyết định có lấy chính thư mục hay chỉ nội dung.'],
  ['Cờ nào cho `rsync` chạy thử, chưa thay đổi gì?', '`-n` (`--dry-run`)', ['`-z`', '`-v`', '`-q`'], 'Luôn chạy `-n` trước, nhất là khi có `--delete`.'],
  ['`scp -r data backup@backup.example.com:/backups/` làm gì?', 'Chép đệ quy thư mục `data` sang `/backups/` trên máy backup', ['Tải `/backups` về máy bạn', 'Xoá `data` trên máy kia', 'Chỉ kiểm tra kết nối'], '`-r` cho thư mục; đường dẫn từ xa có dạng `user@host:path`.'],
  ['Vì sao bản sao lưu cần được thử khôi phục định kỳ?', 'Chỉ khi khôi phục được thì mới biết bản sao lưu có dùng được', ['Để làm đĩa chạy nhanh hơn', 'Để xoá file cũ', 'Không cần nếu đã có checksum'], 'Checksum chỉ chứng minh file nguyên vẹn, không chứng minh nội dung đúng và đầy đủ.'],
  ['Với quy tắc 3-2-1, bản sao lưu duy nhất đặt cùng ổ đĩa với dữ liệu có đạt không?', 'Không, ổ đĩa hỏng là mất cả hai', ['Có, nếu đã nén', 'Có, nếu có checksum', 'Có, nếu dùng rsync'], 'Cần ít nhất một bản ở nơi khác (máy khác, kho đám mây).']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Đóng gói và nén `projects/tutor/src` và `data` vào `backup.tgz`.', hint: 'tar czf backup.tgz projects/tutor/src data', check: function (s) { var n = arcNames(s, 'backup.tgz'); return !!n && n.indexOf('data/users.csv') >= 0 && n.indexOf('projects/tutor/src/app.js') >= 0; } },
    { text: 'Xem danh sách bên trong `backup.tgz` mà không giải nén.', hint: 'tar tzf backup.tgz', check: OK(/^tar tzf backup\.tgz$/) },
    { text: 'Xem chi tiết (quyền, chủ, cỡ) bằng cờ `v`.', hint: 'tar tvzf backup.tgz', check: OK(/^tar tvzf backup\.tgz$/) },
    { text: 'Giải nén vào thư mục mới `restore` bằng `-C`.', hint: 'mkdir restore\ntar xzf backup.tgz -C restore', check: function (s) { return !!s.fs.get(W(s) + 'restore/data/users.csv') && !!s.fs.get(W(s) + 'restore/projects/tutor/src/app.js'); } },
    { text: 'In nội dung `data/users.csv` từ archive ra màn hình (cờ `-O`), không giải nén ra đĩa.', hint: 'tar xzf backup.tgz data/users.csv -O', check: OK(/^tar xzf backup\.tgz data\/users\.csv -O$/) },
    { text: 'Tạo `b2.tgz` từ `projects` nhưng bỏ `node_modules` bằng `--exclude`.', hint: 'tar czf b2.tgz --exclude=node_modules projects', check: function (s) { var n = arcNames(s, 'b2.tgz'); return !!n && n.length > 3 && !n.some(function (x) { return /node_modules/.test(x); }); } },
    { text: 'Tạo archive có ngày trong tên từ `data` bằng `$(date +%F)`.', hint: 'tar czf "backup-$(date +%F).tgz" data', check: function (s) { return Object.keys(s.fs.n).some(function (k) { return /\/work\/backup-\d{4}-\d\d-\d\d\.tgz$/.test(k); }); } },
    { text: 'Dùng `-C` khi tạo: archive `proj.tgz` từ `projects`, tên bên trong bắt đầu bằng `tutor/`.', hint: 'tar czf proj.tgz -C projects tutor', check: function (s) { var n = arcNames(s, 'proj.tgz'); return !!n && n.indexOf('tutor/package.json') >= 0 && !n.some(function (x) { return /^projects/.test(x); }); } },
    { text: 'Giải `proj.tgz` vào `flat` và bỏ cấp `tutor/` bằng `--strip-components=1`.', hint: 'mkdir flat\ntar xzf proj.tgz -C flat --strip-components=1', check: function (s) { return !!s.fs.get(W(s) + 'flat/package.json') && !s.fs.get(W(s) + 'flat/tutor'); } },
    { text: 'Chỉ đóng gói (không nén) `data` vào `plain.tar`.', hint: 'tar cf plain.tar data', check: function (s) { var d = arcs(s)[W(s) + 'plain.tar']; return !!d && !d.z; } },
    { text: 'Nén `plain.tar` bằng `gzip` (nó sẽ thành `plain.tar.gz`).', hint: 'gzip plain.tar', check: function (s) { return !!s.fs.get(W(s) + 'plain.tar.gz') && !s.fs.get(W(s) + 'plain.tar'); }, transient: true },
    { text: 'Xem cỡ nén và tỉ lệ bằng `gzip -l`.', hint: 'gzip -l plain.tar.gz', check: OK(/^gzip -l plain\.tar\.gz$/) },
    { text: 'Giải nén lại bằng `gunzip`.', hint: 'gunzip plain.tar.gz', check: function (s) { return !!s.fs.get(W(s) + 'plain.tar') && !s.fs.get(W(s) + 'plain.tar.gz'); } },
    { text: 'Nén `notes.txt` nhưng **giữ** file gốc bằng `-k`.', hint: 'gzip -k notes.txt', check: function (s) { return !!s.fs.get(W(s) + 'notes.txt') && !!s.fs.get(W(s) + 'notes.txt.gz'); } },
    { text: 'Đọc dòng đầu của `notes.txt.gz` mà không giải nén bằng `zcat`.', hint: 'zcat notes.txt.gz | head -1', check: AND(OK(/^zcat notes\.txt\.gz$/), OK(/^head -1$/)) },
    { text: 'Cài `zip`, `unzip` và `rsync`.', hint: 'sudo apt install -y zip unzip rsync', check: OK(/^sudo apt install -y zip unzip rsync$/) },
    { text: 'Tạo `site.zip` từ `data` và `logs`.', hint: 'zip -r site.zip data logs', check: function (s) { var d = arcs(s)[W(s) + 'site.zip']; return !!d && d.kind === 'zip'; } },
    { text: 'Xem danh sách trong `site.zip`.', hint: 'unzip -l site.zip', check: OK(/^unzip -l site\.zip$/) },
    { text: 'Kiểm tra toàn vẹn `site.zip` bằng `-t`.', hint: 'unzip -t site.zip', check: OK(/^unzip -t site\.zip$/) },
    { text: 'Giải `site.zip` vào thư mục `unz` bằng `-d`.', hint: 'unzip site.zip -d unz', check: function (s) { return !!s.fs.get(W(s) + 'unz/data/users.csv'); } },
    { text: 'Tính checksum SHA-256 của `todo.md`.', hint: 'sha256sum todo.md', check: OK(/^sha256sum todo\.md$/) },
    { text: 'Lưu checksum của `todo.md` và `data/users.csv` vào file `SUMS`.', hint: 'sha256sum todo.md data/users.csv > SUMS', check: function (s) { var t = ftxt(s, W(s) + 'SUMS'); return /todo\.md/.test(t) && /data\/users\.csv/.test(t) && /^[0-9a-f]{64}  /m.test(t); } },
    { text: 'Kiểm tra bằng `sha256sum -c SUMS` (mọi dòng phải OK).', hint: 'sha256sum -c SUMS', check: OK(/^sha256sum -c SUMS$/) },
    { text: 'Sửa `todo.md` rồi kiểm tra lại để thấy `FAILED`.', hint: 'echo "- [ ] thêm việc" >> todo.md\nsha256sum -c SUMS', check: FAIL(/^sha256sum -c SUMS$/) },
    { text: 'Tính `md5sum` của chuỗi `abc` qua pipe (kết quả bắt đầu bằng 900150983cd2).', hint: 'echo -n abc | md5sum', check: OK(/^md5sum$/) },
    { text: 'Sao chép giữ thuộc tính thư mục `data` thành `data-copy` bằng `cp -a`.', hint: 'cp -a data data-copy', check: function (s) { return !!s.fs.get(W(s) + 'data-copy/users.csv'); } },
    { text: 'Đồng bộ `data/` sang `copy/` bằng `rsync -av` (để ý dấu `/`).', hint: 'rsync -av data/ copy/', check: function (s) { return !!s.fs.get(W(s) + 'copy/users.csv') && !s.fs.get(W(s) + 'copy/data'); } },
    { text: 'Chạy thử (`-n`) đồng bộ `logs/` sang `logcopy/`: thư mục đích **không** được tạo.', hint: 'rsync -avn logs/ logcopy/', check: function (s) { return !s.fs.get(W(s) + 'logcopy') && histN(s, /^rsync -avn logs\/ logcopy\/$/) > 0; } },
    { text: 'Dùng `--delete`: tạo `src` có `a`, `b`; đồng bộ sang `dst`; xoá `b` ở nguồn; đồng bộ lại với `--delete`.', hint: 'mkdir src dst\ntouch src/a src/b\nrsync -a src/ dst/\nrm src/b\nrsync -a --delete src/ dst/', check: function (s) { return !!s.fs.get(W(s) + 'dst/a') && !s.fs.get(W(s) + 'dst/b'); } },
    { text: 'Sao chép `projects/` sang `pcopy/` bỏ `node_modules` bằng `rsync --exclude`.', hint: 'rsync -a --exclude=node_modules projects/ pcopy/', check: function (s) { return !!s.fs.get(W(s) + 'pcopy/tutor/src/app.js') && !Object.keys(s.fs.n).some(function (k) { return k.indexOf(W(s) + 'pcopy') === 0 && /node_modules/.test(k); }); } },
    { text: 'Chép `notes.txt` lên máy backup bằng `scp`.', hint: 'scp notes.txt backup@backup.example.com:~/', check: function (s) { return remoteHas(s, '/home/backup/notes.txt'); } },
    { text: 'Chép thư mục `data` lên `/backups/` của máy backup bằng `scp -r`.', hint: 'scp -r data backup@backup.example.com:/backups/', check: function (s) { return remoteHas(s, '/backups/data/users.csv'); } },
    { text: 'Đồng bộ `logs/` lên `/backups/logs/` qua SSH bằng `rsync -avz`.', hint: 'rsync -avz logs/ backup@backup.example.com:/backups/logs/', check: function (s) { return remoteHas(s, '/backups/logs/app.log'); } },
    { text: 'Xem nội dung `/backups` trên máy backup bằng `ssh`.', hint: 'ssh backup@backup.example.com ls /backups', check: OK(/^ssh backup@backup\.example\.com ls \/backups$/) },
    { text: 'Tải `users.csv` từ máy backup về thành `users-remote.csv`.', hint: 'scp backup@backup.example.com:/backups/data/users.csv ./users-remote.csv', check: function (s) { return has2(s, 'users-remote.csv', /student/); } },
    { text: 'Chạy script sao lưu có sẵn (`chmod +x` rồi chạy) và xem kết quả trong `~/backups`.', hint: 'chmod +x scripts/backup.sh\n./scripts/backup.sh\nls ~/backups', check: AND(function (s) { return Object.keys(s.fs.n).some(function (k) { return /\/backups\/work-\d{4}-\d\d-\d\d\.tgz$/.test(k); }); }, OK(/^ls \/home\/haidangphan\/backups$/)) }
  ]
};
function has2(s, f, re) { return re.test(ftxt(s, W(s) + f)); }

var GOOD = 'app-1.0 nội dung đúng\n';
var BAD = 'app-1.0 nội dung ĐÃ HỎNG khi tải\n';

T.debugs = [
  {
    id: 'lb6d1', title: 'Giải nén xong thư mục work lộn xộn',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ tar xzf release.tgz', '$ ls', 'a.js  b.js  index.html  notes.txt  data  logs  ...  (các file lạ lẫn vào file của bạn)'),
    story: 'Bạn nhận `release.tgz` từ đồng nghiệp. Archive này **không** có thư mục gốc, nên giải nén thẳng vào `work` sẽ trộn lẫn với file của bạn. Hãy chưa giải nén vội.',
    goal: 'Các file của release nằm gọn trong `release/` (có `release/index.html`), và `work` không bị lẫn `index.html`, `a.js`, `b.js`.',
    hints: ['Xem trước nội dung bằng `tar tzf release.tgz`. Có thư mục gốc chung không?', 'Không có, nên cần tự tạo thư mục đích và giải vào đó bằng `-C`.', '`mkdir release`, `tar xzf release.tgz -C release`, rồi `ls release` và `ls`.'],
    fix: ['tar tzf release.tgz', 'mkdir release', 'tar xzf release.tgz -C release', 'ls release'],
    cause: 'Archive không có thư mục gốc ("tarbomb") giải ra ngay thư mục hiện tại. Thói quen tốt: luôn `tar tzf` xem trước, và giải vào thư mục mới bằng `-C`. Khi tự tạo archive, hãy đóng gói một thư mục thay vì nhiều file rời.',
    setup: function (s) { base(s, { setup2: function (s3) {
      s3.run('mkdir -p /tmp/rel && cd /tmp/rel && echo "<h1>v1</h1>" > index.html && echo "1" > a.js && echo "2" > b.js && tar czf ~/work/release.tgz index.html a.js b.js && cd ~/work && rm -r /tmp/rel');
      s3.hist.length = 0; s3.cwd = s3.home + '/work';
    } }); },
    check: function (s) { return !!s.fs.get(W(s) + 'release/index.html') && !s.fs.get(W(s) + 'index.html') && !s.fs.get(W(s) + 'a.js') && !s.fs.get(W(s) + 'b.js'); }
  },
  {
    id: 'lb6d2', title: 'Giải nén .tar.gz báo not in gzip format',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ tar xzf backup.tar.gz -C restore', 'gzip: stdin: not in gzip format', 'tar: Child returned status 1', 'tar: Error is not recoverable: exiting now'),
    story: 'Bạn (hoặc ai đó) đã tạo `backup.tar.gz` nhưng giải nén lại báo không phải định dạng gzip. Bạn cần lấy lại `data/users.csv` vào thư mục `restore`.',
    goal: 'Có `restore/data/users.csv` (đúng nội dung từ archive).',
    hints: ['`file backup.tar.gz` nói file này thật sự là loại gì?', 'Tên có `.gz` nhưng bên trong chỉ là tar thường: lúc tạo đã quên cờ `z`.', 'Giải nén không dùng `z`: `tar xf backup.tar.gz -C restore`.'],
    fix: ['file backup.tar.gz', 'mkdir -p restore', 'tar xf backup.tar.gz -C restore', 'ls restore/data'],
    cause: 'Đuôi tên file không quyết định định dạng. Tạo bằng `tar cf` thì chỉ đóng gói, dù đặt tên `.tar.gz`. Cờ `z` khi giải phải khớp thật sự với nội dung. Tên đúng giúp tránh nhầm: dùng `.tar` cho `cf`, `.tgz`/`.tar.gz` cho `czf`.',
    setup: function (s) { base(s, { setup2: function (s3) {
      s3.run('cd ~/work && tar cf backup.tar.gz data'); s3.hist.length = 0; s3.cwd = s3.home + '/work';
    } }); },
    check: function (s) { return /student/.test(ftxt(s, W(s) + 'restore/data/users.csv')); }
  },
  {
    id: 'lb6d3', title: 'sha256sum -c báo FAILED sau khi tải về',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ cd downloads', '$ sha256sum -c app-1.0.tar.gz.sha256', 'app-1.0.tar.gz: FAILED', 'sha256sum: WARNING: 1 computed checksum did NOT match'),
    story: 'Bạn tải `app-1.0.tar.gz` vào `downloads/` cùng file checksum công bố. Kiểm tra báo FAILED: file bị hỏng khi tải. Một bản đúng nằm ở `mirror/app-1.0.tar.gz`.',
    goal: 'File trong `downloads/` được thay bằng bản đúng và `sha256sum -c` báo OK.',
    hints: ['FAILED nghĩa là file khác bản gốc. Có nên dùng file đó không?', 'Không dùng. Thay bằng bản tải lại (ở đây: lấy từ `../mirror/`).', '`cp ../mirror/app-1.0.tar.gz .` rồi `sha256sum -c app-1.0.tar.gz.sha256` (trong thư mục `downloads`).'],
    fix: ['cd downloads', 'sha256sum -c app-1.0.tar.gz.sha256', 'cp ../mirror/app-1.0.tar.gz .', 'sha256sum -c app-1.0.tar.gz.sha256'],
    cause: 'Checksum không khớp nghĩa là file không giống bản gốc (lỗi mạng, ngắt giữa chừng, bị thay đổi). Đừng cài đặt hay chạy nó; tải lại, và nếu vẫn FAILED hãy nghi ngờ nguồn. Checksum phải lấy từ nguồn tin cậy, tốt nhất là kênh khác với file tải.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      var H = V.base.hash.sha256(GOOD);
      s2.fs.mkdirp(h + '/downloads', s2.user, 493); s2.fs.mkdirp(h + '/mirror', s2.user, 493);
      LB.put(s2, h + '/downloads/app-1.0.tar.gz', BAD); LB.put(s2, h + '/downloads/app-1.0.tar.gz.sha256', H + '  app-1.0.tar.gz\n'); LB.put(s2, h + '/mirror/app-1.0.tar.gz', GOOD);
    } }); },
    check: function (s) { return ftxt(s, W(s) + 'downloads/app-1.0.tar.gz') === GOOD; }
  },
  {
    id: 'lb6d4', title: 'Triển khai bằng rsync nhưng site nằm lồng một cấp', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ rsync -av site /srv/www/', '$ ls /srv/www', 'site', '$ curl -I http://localhost/', 'HTTP/1.1 403 Forbidden   # Nginx tìm /srv/www/index.html nhưng chỉ có /srv/www/site/index.html'),
    story: 'Nginx phục vụ `/srv/www`. Bạn đồng bộ thư mục `site` lên đó bằng `rsync -av site /srv/www/` và kết quả là `/srv/www/site/index.html`, tức là lồng thêm một cấp.',
    goal: '`/srv/www/index.html` tồn tại (nội dung từ `site/`) và không còn thư mục `/srv/www/site`.',
    hints: ['`ls /srv/www` và `ls /srv/www/site`. Thư mục nào chứa `index.html`?', 'Dấu `/` ở cuối nguồn khác nhau: `site` chép chính thư mục, `site/` chép nội dung bên trong. Cần dọn bản lồng sai.', '`rm -r /srv/www/site`, rồi `rsync -av site/ /srv/www/`, và `ls /srv/www`.'],
    fix: ['ls /srv/www', 'rm -r /srv/www/site', 'rsync -av site/ /srv/www/', 'ls /srv/www'],
    cause: 'Với rsync, `nguồn/` (có dấu `/`) nghĩa là "nội dung của nguồn", còn `nguồn` nghĩa là "chính thư mục nguồn". Luôn viết `rsync -a thư-mục/ đích/` khi muốn đồng bộ nội dung. Kết hợp `-n` để xem trước và `--delete` để đích khớp hệt nguồn.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      s2.fs.mkdirp(h + '/site/css', s2.user, 493); LB.put(s2, h + '/site/index.html', '<h1>Tutor</h1>\n'); LB.put(s2, h + '/site/css/app.css', 'body{margin:0}\n');
    }, setup2: function (s3) {
      s3.run('sudo mkdir -p /srv/www && sudo chown haidangphan:haidangphan /srv/www && sudo apt install -y rsync >/dev/null && rsync -a site /srv/www/');
      s3.hist.length = 0; s3.cwd = s3.home + '/work';
    } }); },
    check: function (s) { return /Tutor/.test(ftxt(s, '/srv/www/index.html')) && !s.fs.get('/srv/www/site'); }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
