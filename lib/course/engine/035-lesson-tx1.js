(function (G) {
'use strict';
/* Chương tx1: grep và biểu thức chính quy. Đặt ở đầu khoá học. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, HCU = C.HCU;

function base(s, o) { C.TXT.base(s, o); }

var T = {
  id: 'tx1', group: 'Công cụ văn bản', short: 'grep',
  title: 'grep: tìm nhanh trong log và file cấu hình',
  dek: 'Các cờ -i -v -n -c -o -w -x -l -r, ngữ cảnh -A -B -C, chuỗi cố định -F và nhiều mẫu, kiểm soát đầu ra, tìm trong log nén và log xoay vòng (zgrep), công thức cho quản trị VPS, grep trong pipeline và script. Regex đi sâu ở chương riêng.'
};
C.insertFirst(T);

T.theory = [
  { tag: 'Khái niệm', title: 'grep làm gì và mã thoát', body: [
    '**grep** đọc từng dòng của file (hoặc của đầu vào chuẩn), và in ra những dòng **khớp mẫu**. Đây là công cụ bạn sẽ dùng nhiều nhất khi đọc log, tìm cấu hình, và kiểm tra trạng thái trong script.',
    { pre: ['grep ERROR app.log                 # in các dòng chứa ERROR', 'grep "connection refused" app.log  # mẫu có dấu cách phải đặt trong nháy', 'cat app.log | grep ERROR            # cũng được, nhưng thừa một tiến trình', 'grep ERROR app.log access.log       # nhiều file: mỗi dòng có tên file đứng trước'], cap: 'Cú pháp: grep [cờ] MẪU [file...]' },
    { tbl: [['Mã thoát', 'Nghĩa', 'Dùng để làm gì'], ['`0`', 'Có ít nhất một dòng khớp', '`if grep -q ...; then` chạy nhánh đúng'], ['`1`', 'Không dòng nào khớp (không phải lỗi!)', 'Với `set -e` có thể làm script dừng ngoài ý muốn'], ['`2`', 'Lỗi thật: file không tồn tại, regex sai', 'Cần báo lỗi hoặc dừng']] },
    { note: 'Không tìm thấy gì **không phải lỗi** với grep, nhưng nó trả mã khác 0. Trong script có `set -e` hoặc `pipefail`, một lệnh `grep` không khớp có thể kết thúc cả script. Phần lỗi thường gặp bên dưới có ví dụ.', kind: 'warn' }
  ] },
  { tag: 'Bảng tra', title: 'Các cờ hay dùng', body: [
    { tbl: [['Cờ', 'Tác dụng', 'Ví dụ'], ['`-i`', 'Không phân biệt hoa thường', '`grep -i error app.log`'], ['`-v`', 'Đảo ngược: in dòng **không** khớp', '`grep -v INFO app.log`'], ['`-n`', 'Thêm số dòng', '`grep -n ERROR app.log`'], ['`-c`', 'Đếm **số dòng** khớp (không in dòng)', '`grep -c ERROR app.log`'], ['`-o`', 'Chỉ in **phần khớp**, mỗi phần một dòng', '`grep -o "user=[a-z]*" app.log`'], ['`-w`', 'Khớp nguyên **từ**', '`grep -w db app.log`'], ['`-x`', 'Khớp nguyên **dòng**', '`grep -x "PORT=3000" .env`'], ['`-l` / `-L`', 'Chỉ in tên file có / không có khớp', '`grep -l ERROR *.log`'], ['`-q`', 'Im lặng, chỉ dùng mã thoát', '`grep -q ERROR app.log`'], ['`-s`', 'Giấu thông báo lỗi file không tồn tại', '`grep -s x nofile`'], ['`-m N`', 'Dừng sau N dòng khớp', '`grep -m1 ERROR app.log`'], ['`-h` / `-H`', 'Bỏ / thêm tên file ở đầu dòng', '`grep -h x a b`']] },
    { note: '`-c` đếm **dòng**, không đếm số lần xuất hiện. Một dòng có `ERROR` hai lần vẫn chỉ tính 1. Muốn đếm số lần: `grep -o ERROR app.log | wc -l`.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Ngữ cảnh: -A, -B, -C', body: [
    'Một dòng lỗi thường vô nghĩa nếu thiếu những dòng xung quanh. Ba cờ này in thêm dòng kèm theo:',
    { tbl: [['Cờ', 'In thêm'], ['`-A N` (after)', 'N dòng **sau** mỗi dòng khớp'], ['`-B N` (before)', 'N dòng **trước**'], ['`-C N` (context)', 'N dòng cả trước lẫn sau']] },
    { pre: ['grep -A2 TypeError app.log', 'grep -B1 "connection refused" app.log', 'grep -n -C1 "rate limit" app.log'], cap: 'Xem stack trace và bối cảnh' },
    { ul: ['Các nhóm không liền nhau được ngăn cách bằng dòng `--`', 'Với `-n`, dòng khớp dùng dấu `:` (`4:...`), dòng ngữ cảnh dùng dấu `-` (`5-...`). Nhờ đó nhìn là phân biệt được', 'Stack trace của Node.js thường có các dòng thụt vào ngay sau thông báo lỗi, nên `-A3` rất hữu ích'] }
  ] },
  { tag: 'Cú pháp', title: 'Tìm đệ quy trong cả thư mục', body: [
    { pre: ['grep -rn "PermitRootLogin" /etc/ssh        # -r: đi vào thư mục con', 'grep -rn --include="*.conf" "listen" /etc/nginx', 'grep -rl "TODO" ~/projects --exclude-dir=node_modules', 'grep -r "api_key" .                           # "." là thư mục hiện tại'], cap: 'Đệ quy với bộ lọc tên file' },
    { tbl: [['Tuỳ chọn', 'Nghĩa'], ['`-r`', 'Tìm trong thư mục và mọi thư mục con (không theo symlink; `-R` theo symlink)'], ['`--include="*.js"`', 'Chỉ xét file có tên khớp mẫu glob'], ['`--exclude="*.min.js"`', 'Bỏ file khớp mẫu'], ['`--exclude-dir=node_modules`', 'Bỏ cả thư mục']] },
    { note: 'Đặt mẫu glob trong nháy (`--include="*.log"`). Nếu không, shell có thể mở rộng `*.log` ở thư mục hiện tại trước khi grep nhìn thấy nó.', kind: 'warn' },
    'Khi tìm trong thư mục có `node_modules`, luôn loại trừ nó. Nếu không bạn sẽ đọc hàng chục nghìn file và kết quả đầy rác.'
  ] },
  { tag: 'Cú pháp', title: 'Kiểm soát đầu ra: tên file, màu, nhị phân', body: [
    { tbl: [['Tuỳ chọn', 'Tác dụng', 'Khi nào dùng'], ['`-H` / `-h`', 'Luôn thêm / luôn bỏ tên file ở đầu dòng', '`-H` khi chỉ có một file mà muốn biết nguồn; `-h` khi gộp nhiều file để xử lý tiếp'], ['`--color=auto`', 'Tô màu phần khớp (nhiều bản Ubuntu đã alias sẵn)', 'Đọc kết quả bằng mắt; **không** dùng khi chuyển tiếp vào file/pipe (mã màu lẫn vào dữ liệu)'], ['`-s`', 'Im lặng lỗi "No such file"', 'Script duyệt danh sách file có thể không tồn tại'], ['`-a`', 'Coi file nhị phân như văn bản', 'Khi thấy `Binary file x matches` mà vẫn muốn xem dòng'], ['`-I`', 'Bỏ qua file nhị phân', 'Với `grep -r` trong thư mục có ảnh, `.gz`, `.so`'], ['`-m N`', 'Dừng sau N dòng khớp', 'File log khổng lồ, chỉ cần vài kết quả đầu'], ['`-q`', 'Không in gì, chỉ trả mã thoát', 'Điều kiện trong `if`']] },
    { pre: ['grep -H ERROR app.log                  # app.log:2026-10-27 ... ERROR ...', 'grep -h user=an app.log access.log      # bỏ tiền tố tên file', 'grep -rI "api_key" ~/projects --exclude-dir=node_modules', 'grep --color=always ERROR app.log | head -2   # ép tô màu dù đi qua pipe (chỉ để xem)'], cap: 'Điều khiển đầu ra' },
    'Mỗi cờ ngắn có một dạng **dài** dễ đọc, rất hợp khi viết script mà người khác sẽ bảo trì: `--ignore-case` (`-i`), `--count` (`-c`), `--line-number` (`-n`), `--invert-match` (`-v`), `--only-matching` (`-o`), `--word-regexp` (`-w`), `--files-with-matches` (`-l`), `--recursive` (`-r`), `--max-count=N` (`-m`), `--extended-regexp` (`-E`), `--fixed-strings` (`-F`).',
    { note: 'Khi `grep` đọc nhiều file và có một file không đọc được, mã thoát là **2** dù các file khác có khớp. Nếu script chỉ coi `0` là "tìm thấy", hãy thêm `-s` hoặc kiểm tra file trước.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Nháy, chuỗi cố định và nhiều mẫu', body: [
    { ul: ['**Luôn đặt mẫu trong nháy đơn** `\'...\'`. Nháy kép để shell thay `$` và `!`; mẫu như `"^$"` hay `"cost$5"` sẽ bị hiểu sai', 'Mẫu bắt đầu bằng `-` bị nhầm là cờ: dùng `grep -e "-v" file` hoặc `grep -- "-v" file`', 'Muốn tìm chuỗi nguyên văn có ký tự đặc biệt (`[error]`, `a.b`, `$HOME`): dùng **`-F`** (fixed)'] },
    { pre: ["grep -F '[ERROR]' app.log", "grep -F '/.env' access.log", "grep -e wp-login -e phpmyadmin -e '/.env' access.log   # nhiều mẫu", "printf '%s\\n' wp-login phpmyadmin > patterns.txt", "grep -f patterns.txt access.log                       # mẫu lấy từ file"], cap: 'Chuỗi cố định, nhiều mẫu, mẫu từ file' },
    { note: '`grep -F` còn nhanh hơn khi tìm hàng nghìn chuỗi (ví dụ danh sách IP bị cấm). Nó cũng an toàn hơn khi mẫu đến từ biến mà bạn không kiểm soát.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Regex trong grep: đủ để bắt đầu', body: [
    'Mặc định `grep` đọc mẫu là **biểu thức chính quy cơ bản (BRE)**. Chỉ cần nhớ vài ký hiệu để dùng ngay:',
    { tbl: [['Ký hiệu', 'Nghĩa', 'Ví dụ'], ['`^` / `$`', 'Đầu / cuối dòng', '`grep "^2026-10-27" app.log`'], ['`.`', 'Một ký tự **bất kỳ**', '`grep "a.c"` khớp `abc`, `a-c`'], ['`*`', 'Ký tự trước lặp 0 lần trở lên', '`grep "ab*c"`'], ['`[abc]` `[0-9]`', 'Một ký tự trong tập', '`grep "[0-9]ms" app.log`'], ['`\\.`', 'Dấu chấm thật', '`grep "192\\.0\\.2\\.4"`']] },
    { pre: ["grep -E 'ERROR|WARN' app.log           # -E: bật regex mở rộng (ERE): | + ? () {}", "grep -E ' 5[0-9]{2} ' access.log        # mã trạng thái 5xx", "grep -vE '^[[:space:]]*(#|$)' .env       # bỏ dòng chú thích và dòng trống", "grep -P '(?<=user=)[a-z]+' app.log       # -P: kiểu Perl (nhìn trước/sau, \\d)"], cap: 'Ba "phương ngữ": BRE (mặc định), -E, -P' },
    { note: '**Nên dùng `-E`** cho mọi mẫu có `|`, `+`, `?`, `()`, `{}` để khỏi phải thêm dấu `\\`. Cú pháp đầy đủ (lớp ký tự, lượng từ, nhóm, tham chiếu ngược, tham lam/lười, công thức IP, email, ngày) nằm ở chương **Regex** ngay sau chương này.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'grep trong pipeline và script', body: [
    { tbl: [['Việc cần làm', 'Cách làm'], ['Lọc đầu ra của lệnh khác', '`systemctl list-units | grep tutor`'], ['Đếm theo nhóm', '`grep -oE "user=[a-z]+" app.log | sort | uniq -c`'], ['Kiểm tra trong `if`', '`if grep -q "connection refused" app.log; then ... fi`'], ['Hai điều kiện đều đúng (AND)', '`grep ERROR app.log | grep db`'], ['Loại bỏ nhiễu', '`grep -v "healthz" access.log`'], ['Bỏ chú thích và dòng trống khỏi cấu hình', '`grep -vE "^[[:space:]]*(#|$)" file`'], ['Xem log đang chạy theo thời gian thực', '`tail -f app.log | grep --line-buffered ERROR`']] },
    { pre: ['ps aux | grep nginx            # luôn thấy cả chính tiến trình grep', 'ps aux | grep "[n]ginx"        # mẹo: [n]ginx không khớp chính nó', 'pgrep -x nginx                # cách đúng: tìm theo tên tiến trình', 'systemctl is-active --quiet nginx && echo chạy'], cap: 'Kiểm tra một tiến trình đang chạy' },
    { note: 'Dùng `grep -q` trong `if`: nó dừng ngay khi thấy khớp đầu tiên nên nhanh, và không in gì.', kind: 'tip' }
  ] },
  { tag: 'Thực hành', title: 'Log nén, log xoay vòng và log trực tiếp', body: [
    'Trên VPS, `logrotate` đổi tên log cũ thành `app.log.1`, rồi nén thành `app.log.2.gz`, `app.log.3.gz`... `grep` thường **không** đọc được file `.gz` (nó báo `Binary file ... matches` hoặc chẳng khớp gì). Hãy dùng họ lệnh `z*`:',
    { pre: ['zgrep -c ERROR app.log.2.gz           # grep thẳng vào file .gz', 'zgrep -h ERROR app.log app.log.*.gz   # gộp log hiện tại và log đã nén (cả file thường lẫn .gz)', 'zcat app.log.2.gz | grep -c ERROR     # tương đương, dùng pipe', 'tail -f app.log | grep --line-buffered ERROR   # theo dõi log trực tiếp, chỉ in dòng lỗi', 'sudo journalctl -u tutor --since today | grep -i timeout', 'sudo grep -rn "Failed password" /var/log/auth.log*'], cap: 'Đọc log đã xoay vòng' },
    { ul: ['**`--line-buffered`**: khi grep đứng giữa pipeline và đầu ra là terminal hoặc lệnh khác, nó có thể gom dòng thành khối rồi mới in. Cờ này ép in ngay từng dòng, cần thiết khi dùng với `tail -f`', '`journalctl -u dịch_vụ -g "mẫu"` cũng lọc được trực tiếp bằng regex', 'Đọc `/var/log/*` thường cần `sudo`; hãy `sudo grep`, không phải `grep` rồi mới thêm `sudo` ở sau pipe'] },
    { note: 'Trước khi báo "tuần này không có lỗi", nhớ kiểm tra bạn đã quét **cả file đã nén**. Báo cáo chỉ đọc `app.log` sẽ bỏ sót mọi thứ đã bị xoay vòng.', kind: 'warn' }
  ] },
  { tag: 'Thực hành', title: 'Công thức grep cho quản trị VPS', body: [
    { tbl: [['Việc cần làm', 'Lệnh'], ['10 IP tấn công SSH nhiều nhất', '`grep "Failed password" auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn | head`'], ['Số request lỗi 5xx', '`grep -cE "\\" 5[0-9]{2} " access.log`'], ['Xem cấu hình thật (bỏ chú thích, dòng trống)', '`grep -vE "^[[:space:]]*(#|$)" /etc/ssh/sshd_config`'], ['File nào trong thư mục có chứa mật khẩu/khoá', '`grep -rIl --exclude-dir=node_modules -e password -e api_key .`'], ['Dòng nào trong A mà không có trong B (so khớp trọn dòng)', '`grep -Fxvf B.txt A.txt`'], ['Kiểm tra dịch vụ trong script', '`systemctl is-active --quiet nginx` hoặc `pgrep -x nginx` (không dùng `ps | grep`)'], ['Tìm TODO/FIXME trong mã', '`grep -rnE "TODO|FIXME" src --include="*.ts"`'], ['Tìm file .log có chữ ERROR rồi đếm từng file', '`find . -name "*.log" -exec grep -c ERROR {} +`'], ['Đưa kết quả grep sang lệnh khác an toàn với tên file có dấu cách', '`grep -rlZ TODO src | xargs -0 wc -l`']] },
    { note: '`find ... -exec grep ... {} +` và `grep -r` làm cùng một việc; chọn `find` khi cần lọc theo thời gian, kích thước, chủ sở hữu trước khi grep. Chương **Tìm file** sẽ nói kỹ.', kind: 'tip' }
  ] },
  { tag: 'Nâng cao', title: 'Tốc độ, công cụ thay thế và giới hạn', body: [
    { ul: ['**Nhanh hơn**: dùng `-F` khi không cần regex; `-m N` để dừng sớm; `--include`/`--exclude-dir` để khỏi đọc file vô ích; `LC_ALL=C grep ...` bỏ qua xử lý UTF-8 khi dữ liệu chỉ có ASCII (nhanh gấp nhiều lần trên file rất lớn)', '**`grep -P`** có thể không có trên mọi hệ (macOS, BusyBox/Alpine). Viết script cho máy khác thì ưu tiên `-E`', '**ripgrep (`rg`)** và **`ag`** nhanh hơn `grep -r` trên cây mã lớn, tự bỏ qua `.git`, `node_modules`, file theo `.gitignore`. Cài bằng `sudo apt install ripgrep`; cú pháp gần giống (`rg -n "TODO" src`)', '**Giới hạn**: grep làm việc theo từng **dòng**. Tìm mẫu trải nhiều dòng (một khối JSON, một block `server { }` của Nginx) cần `grep -z`, `awk`, `sed` hoặc công cụ chuyên (`jq`, `nginx -T`)', 'Đừng parse HTML/JSON bằng grep để làm việc quan trọng: dùng `jq` cho JSON; còn `grep -o` chỉ nên để lấy nhanh một giá trị đơn giản'] },
    { pre: ['LC_ALL=C grep -c "ERROR" big.log      # file nhiều GB, chỉ ASCII', 'rg -n --glob "!node_modules" "api_key" .   # ripgrep: bỏ thư mục, in số dòng', 'grep -z -o "server {[^}]*}" site.conf   # -z coi cả file là một "dòng": tìm trải nhiều dòng'], cap: 'Khi grep chậm hoặc chưa đủ' }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['Không có kết quả dù chắc chắn có chữ đó', 'Hoa thường khác nhau, hoặc dùng `\\|`, `+` trong BRE', '`-i`, hoặc thêm `-E`'], ['`grep: Unmatched [` hoặc `Invalid regular expression`', 'Ký tự đặc biệt chưa thoát (`[`, `(`)', 'Thoát bằng `\\` hoặc dùng `-F`'], ['`Binary file x matches`', 'File có byte không phải chữ', 'Dùng `-a` (xử lý như văn bản) hoặc xem lại file'], ['`grep: dir: Is a directory`', 'Truyền thư mục mà không có `-r`', 'Thêm `-r`'], ['Khớp thừa (192.0.2.4 khớp 192.0.2.44)', '`.` khớp mọi ký tự, không có ranh giới', '`-w`, `-F`, hoặc neo `^`/`$`'], ['`ps aux | grep x` luôn thấy', 'Chính grep nằm trong danh sách', '`pgrep -x`, `[x]`, hoặc `systemctl is-active`'], ['Script dừng im lặng', 'grep không khớp trả mã 1 trong `set -e` / `pipefail`', '`|| true` hoặc dùng `if grep -q`'], ['`\\d` không khớp gì', 'POSIX regex không có `\\d`', '`[0-9]` hoặc `-P`']] },
    { ul: ['Mẫu đã đặt trong **nháy đơn** chưa?', 'Đang cần regex (BRE/ERE) hay chuỗi nguyên văn (`-F`)?', 'Cần khớp hoa thường (`-i`), nguyên từ (`-w`), hay nguyên dòng (`-x`)?', 'Ở trong script: đã xử lý trường hợp mã thoát 1 (không khớp) chưa?', 'Tìm trong thư mục: đã loại `node_modules`, `.git`, file nhị phân chưa?'] }
  ] }
];

T.quiz = C.QZ(1, [
  ['`grep FATAL app.log` không tìm thấy dòng nào. Mã thoát là gì?', '1', ['0', '2', '127'], '`0` là có khớp, `1` là không khớp, `2` là lỗi thật (file không có, regex sai). `127` là lệnh không tồn tại.'],
  ['Lệnh nào đếm số dòng chứa `error` **không phân biệt hoa thường**?', '`grep -ci error app.log`', ['`grep -c error app.log`', '`grep -v error app.log`', '`grep -o error app.log`'], '`-i` bỏ qua hoa thường, `-c` đếm dòng. Thiếu `-i` thì `ERROR` viết hoa không được tính.'],
  ['Một dòng chứa `ERROR` hai lần. `grep -c ERROR` tính dòng đó là bao nhiêu?', '1 (đếm dòng, không đếm lần xuất hiện)', ['2', '0', 'Tuỳ file'], '`-c` đếm số dòng khớp. Muốn đếm số lần xuất hiện, dùng `grep -o ERROR file | wc -l`.'],
  ['Muốn xem 3 dòng **sau** mỗi dòng khớp (ví dụ stack trace), dùng cờ nào?', '`-A3`', ['`-B3`', '`-C0`', '`-n3`'], '`-A` là after (sau), `-B` là before (trước), `-C` là cả hai phía.'],
  ['Lệnh nào đếm đúng số request của IP `192.0.2.4` mà **không** tính `192.0.2.44`?', '`grep -cw \'192.0.2.4\' access.log`', ['`grep -c \'192.0.2.4\' access.log`', '`grep -c 192 access.log`', '`grep -v 192.0.2.44 access.log`'], 'Không có `-w`, mẫu `192.0.2.4` là tiền tố của `192.0.2.44` nên khớp cả hai. `-w` yêu cầu khớp nguyên từ.'],
  ['`grep -r --include="*.conf" listen /etc/nginx` làm gì?', 'Tìm `listen` đệ quy, chỉ trong file có đuôi .conf', ['Chỉ tìm ở thư mục /etc/nginx, không vào thư mục con', 'Bỏ qua file .conf', 'Thêm đuôi .conf vào kết quả'], '`-r` đi vào thư mục con, `--include` lọc theo tên file.'],
  ['Cờ `-F` dùng để làm gì?', 'Coi mẫu là chuỗi nguyên văn, không phải regex', ['Ép in tên file', 'Chỉ khớp ở đầu dòng', 'Tìm nhanh bằng chỉ mục'], 'Với `-F`, các ký tự như `.`, `[`, `*` được hiểu đúng nghĩa đen. Tiện khi tìm chuỗi như `[ERROR]` hay `a.b`.'],
  ['Vì sao `ps aux | grep nginx` luôn in ít nhất một dòng, kể cả khi nginx đã dừng?', 'Chính tiến trình `grep nginx` cũng chứa chữ nginx trong dòng lệnh', ['Nginx không bao giờ dừng hẳn', 'Vì ps luôn in dòng đầu tiên', 'Vì grep dùng cache'], 'Dùng `pgrep -x nginx`, `grep "[n]ginx"`, hoặc `systemctl is-active nginx`.'],
  ['Trong script có `set -e`, dòng `n=$(grep -c FATAL app.log)` có thể gây sự cố gì khi không có dòng nào khớp?', '`grep -c` in 0 nhưng trả mã 1, `set -e` có thể dừng script', ['Gán n thành rỗng và tiếp tục', 'grep tự thử lại', 'Không có gì, mã thoát luôn 0'], '`grep` trả mã 1 khi không khớp (kể cả `-c` in 0). Dùng `|| true`, hoặc kiểm tra trong `if`.'],
  ['Chạy `grep -h ERROR app.log access.log` khác `grep ERROR app.log access.log` ở điểm nào?', '`-h` bỏ tiền tố tên file ở đầu mỗi dòng', ['`-h` hiển thị trợ giúp rồi thoát', '`-h` chỉ tìm trong file đầu tiên', '`-h` tô màu phần khớp'], 'Khi có nhiều file, grep mặc định thêm `tên_file:` trước dòng; `-h` bỏ tiền tố để xử lý tiếp, `-H` luôn thêm.'],
  ['Log đã được `logrotate` nén thành `app.log.2.gz`. Lệnh nào đếm dòng ERROR trong đó mà không cần giải nén ra đĩa?', '`zgrep -c ERROR app.log.2.gz`', ['`grep -c ERROR app.log.2.gz`', '`gunzip -c app.log.2.gz > ERROR`', '`cat app.log.2.gz | wc -c`'], '`zgrep` giải nén tạm thời rồi grep. `grep` thường thấy dữ liệu nhị phân và báo `Binary file matches` hoặc không khớp gì.'],
  ['Vì sao nên thêm `--line-buffered` trong `tail -f app.log | grep --line-buffered ERROR | tee errors.txt`?', 'Để grep in ngay từng dòng thay vì gom thành khối lớn khi đầu ra không phải terminal', ['Để grep bỏ qua dòng trống', 'Để tăng tốc tìm kiếm', 'Để grep không phân biệt hoa thường'], 'Khi stdout là pipe hay file, grep đệm đầu ra; không có cờ này bạn thấy kết quả trễ hàng chục giây.'],
  ['`grep -Fxvf B.txt A.txt` in ra gì?', 'Các dòng trong A.txt mà không trùng trọn dòng với dòng nào trong B.txt', ['Các dòng có trong cả hai file', 'Các dòng của B.txt không có trong A.txt', 'Số dòng khác nhau giữa hai file'], '`-F` chuỗi cố định, `-x` khớp trọn dòng, `-f` lấy mẫu từ file, `-v` đảo ngược. Rất hợp để so danh sách (email, IP) đơn giản.'],
  ['Script quét `/var/log` bằng `grep -r "password" .` in rất nhiều dòng `Binary file ... matches`. Cách gọn nhất để bỏ chúng?', 'Thêm `-I` để bỏ qua file nhị phân', ['Thêm `-q`', 'Thêm `-s`', 'Thêm `-c`'], '`-I` (`--binary-files=without-match`) coi file nhị phân là không khớp; ngược lại `-a` ép in như văn bản.'],
  ['Khi nào nên dùng `grep -P` thay vì `grep -E`?', 'Khi cần nhìn trước/sau hoặc `\\d`, và biết máy chạy script có hỗ trợ `-P`', ['Mọi lúc vì nhanh hơn', 'Khi mẫu có ký tự `|`', 'Khi cần đếm số dòng'], '`-P` mạnh hơn nhưng không có ở mọi hệ (BusyBox, macOS). Script cần chạy ở nhiều nơi nên ưu tiên `-E`.']
]);

var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Bạn đang ở thư mục `~/lab` có sẵn `app.log`, `access.log`, `auth.log`. Đếm số dòng của `app.log`.', hint: 'wc -l app.log', check: OK(/^wc -l( app\.log)?$/) },
    { text: 'In các dòng chứa `ERROR` trong `app.log`.', hint: 'grep ERROR app.log', check: OK(/^grep ERROR app\.log$/) },
    { text: 'Thêm số dòng vào kết quả.', hint: 'grep -n ERROR app.log', check: OK(/^grep -\w*n\w* ERROR app\.log$/) },
    { text: 'Chỉ đếm số dòng ERROR.', hint: 'grep -c ERROR app.log', check: OK(/^grep -\w*c\w* ERROR app\.log$/) },
    { text: 'Đếm cả dòng viết thường `error` (không phân biệt hoa thường). Kết quả phải lớn hơn bước trước.', hint: 'grep -ci error app.log', check: OK(/^grep (-\w*i\w*|-c -i|-i -c) error app\.log$/) },
    { text: 'In các dòng **không** phải INFO.', hint: 'grep -v INFO app.log', check: OK(/^grep -\w*v\w* INFO app\.log$/) },
    { text: 'Chỉ in phần `user=...` của mỗi dòng có chứa nó.', hint: "grep -o 'user=[a-z]*' app.log", check: OK(/^grep -\w*o\w* user=/) },
    { text: 'Khớp nguyên từ `db` (không tính `db` nằm trong từ khác).', hint: 'grep -w db app.log', check: OK(/^grep -\w*w\w* db app\.log$/) },
    { text: 'Xem thông báo `TypeError` kèm 2 dòng stack trace phía sau.', hint: 'grep -A2 TypeError app.log', check: OK(/^grep -A ?2 TypeError app\.log$/) },
    { text: 'Xem dòng `connection refused` kèm 1 dòng ngay trước nó.', hint: "grep -B1 'connection refused' app.log", check: OK(/^grep -B ?1 connection refused app\.log$/) },
    { text: 'Xem `rate limit` kèm một dòng trước và sau, có số dòng.', hint: "grep -n -C1 'rate limit' app.log", check: OK(/^grep .*-\w*C ?1 .*rate limit/) },
    { text: 'Chỉ lấy 2 dòng ERROR đầu tiên.', hint: 'grep -m2 ERROR app.log', check: OK(/^grep -m ?2 ERROR app\.log$/) },
    { text: 'Tìm trong cả ba file log cùng lúc: tên file xuất hiện trước mỗi dòng.', hint: 'grep -c ERROR app.log access.log auth.log', check: OK(/^grep -\w+ \S+ (app\.log access\.log auth\.log|access\.log app\.log auth\.log)$/) },
    { text: 'File nào có chứa `Failed password`? Chỉ in tên file.', hint: "grep -l 'Failed password' *.log", check: OK(/^grep -l Failed password /) },
    { text: 'File nào **không** chứa `ERROR`?', hint: 'grep -L ERROR *.log', check: OK(/^grep -L ERROR /) },
    { text: 'Tìm `PermitRootLogin` đệ quy trong thư mục hiện tại, kèm số dòng.', hint: 'grep -rn PermitRootLogin .', check: OK(/^grep -(rn|nr) PermitRootLogin \.?$/) },
    { text: 'Tìm `Failed` đệ quy nhưng chỉ trong file `*.log`.', hint: "grep -rn --include='*.log' Failed .", check: OK(/^grep -\w+ --include=\*\.log Failed \.$/) },
    { text: 'Đếm dòng của `access.log` khớp `192.0.2.4` KHÔNG dùng `-w`. Kết quả 6 là sai vì lấy cả `192.0.2.44`.', hint: "grep -c '192.0.2.4' access.log", check: OK(/^grep -c 192\.0\.2\.4 access\.log$/) },
    { text: 'Đếm đúng IP `192.0.2.4` bằng `-w`. Kết quả phải là 1.', hint: "grep -cw '192.0.2.4' access.log", check: OK(/^grep (-\w*c\w*w\w*|-\w*w\w*c\w*|-c -w|-w -c) 192\.0\.2\.4 access\.log$/) },
    { text: 'In các dòng ERROR của `app.log` kèm **tên file** ở đầu dòng, dù chỉ có một file (`-H`). Lấy 2 dòng đầu.', hint: 'grep -H ERROR app.log | head -2', check: OK(/^grep -H ERROR app\.log$/) },
    { text: 'Tìm `WARN` trong `app.log` và `access.log` cùng lúc nhưng **bỏ** tiền tố tên file (`-h`).', hint: 'grep -h WARN app.log access.log', check: OK(/^grep -h WARN app\.log access\.log$/) },
    { text: 'Viết bằng **tùy chọn dài**: đếm dòng chứa `error` không phân biệt hoa thường.', hint: 'grep --ignore-case --count error app.log', check: OK(/^grep --ignore-case --count error app\.log$|^grep --count --ignore-case error app\.log$/) },
    { text: 'Tìm `ERROR` trong file **không tồn tại** `nofile.log` bằng `-s` rồi in mã thoát (phải là 2, không có thông báo lỗi).', hint: 'grep -s ERROR nofile.log; echo $?', check: AND(A(/^grep -s ERROR nofile\.log$/), OK(/^echo 2$/)) },
    { text: 'Tìm chuỗi nguyên văn `/.env` (dấu chấm là dấu chấm) bằng `-F`.', hint: "grep -F '/.env' access.log", check: OK(/^grep -F \/\.env access\.log$/) },
    { text: 'Tìm nhiều mẫu cùng lúc bằng `-e`: wp-login và phpmyadmin.', hint: "grep -e wp-login -e phpmyadmin access.log", check: OK(/^grep (-e \S+ ){2,}access\.log$/) },
    { text: 'Tạo file mẫu `patterns.txt` rồi dùng `-f` để tìm.', hint: "printf '%s\\n' wp-login phpmyadmin '/.env' > patterns.txt\ngrep -F -f patterns.txt access.log", check: AND(OK(/^grep (-\w+ )*-f patterns\.txt access\.log$/), function (s) { return /wp-login/.test(ftxt(s, s.cwd + '/patterns.txt')); }) },
    { text: 'Tạo `want.txt` gồm hai email `an@example.com`, `binh@example.com`; liệt kê email trong `emails.txt` **không** có trong `want.txt` (trọn dòng, `-Fxvf`).', hint: "printf 'an@example.com\\nbinh@example.com\\n' > want.txt\ngrep -Fxvf want.txt emails.txt", check: AND(function (s) { return /an@example\.com/.test(ftxt(s, s.cwd + '/want.txt')); }, OK(/^grep -Fxvf want\.txt emails\.txt$/)) },
    { text: 'Xem cấu hình thật của `.env`: lọc bỏ dòng chú thích (bắt đầu `#`) bằng `grep -v`, rồi bỏ dòng trống bằng một `grep -v` nữa.', hint: "grep -v '^#' .env | grep -v '^$'", check: AND(OK(/^grep -v \^# \.env$/), OK(/^grep -v \^\$$/)) },
    { text: 'Thống kê số lần mỗi user xuất hiện (`user=...`) trong `app.log`, nhiều nhất trước, không in tên file.', hint: "grep -ho 'user=[a-z]*' app.log | sort | uniq -c | sort -rn", check: AND(OK(/^grep -\w*h\w*o\w* user=/), OK(/^uniq -c$/), OK(/^sort -rn$/)) },
    { text: 'Ghép hai grep (AND): dòng ERROR có chứa `db`.', hint: 'grep ERROR app.log | grep db', check: AND(OK(/^grep ERROR app\.log$/), OK(/^grep db$/)) },
    { text: 'Dùng `-q` và xem mã thoát khi **không** khớp (phải là 1).', hint: "grep -q FATAL app.log; echo $?", check: AND(A(/^grep -q FATAL app\.log$/), A(/^echo 1$/)) },
    { text: 'Dùng `grep -q` trong `if` để báo khi DB lỗi.', hint: 'if grep -q "connection refused" app.log; then echo "DB từng lỗi"; fi', check: AND(OK(/^grep -q connection refused app\.log$/), OK(/^echo DB/)) },
    { text: 'Đếm các IP đã thử đăng nhập SSH thất bại, kèm số lần, nhiều nhất trước.', hint: "grep 'Failed password' auth.log | grep -oE 'from [0-9.]+' | sort | uniq -c | sort -rn", check: AND(OK(/^grep Failed password auth\.log$/), OK(/^uniq -c$/), OK(/^sort -rn$/)) },
    { text: 'Nén `app.log` thành `app.log.gz` (giữ bản gốc, `gzip -k`), rồi đếm dòng ERROR **trong file nén** bằng `zgrep -c`.', hint: 'gzip -k app.log\nzgrep -c ERROR app.log.gz', check: AND(OK(/^gzip -k app\.log$/), OK(/^zgrep -c ERROR app\.log\.gz$/)) },
    { text: 'Làm điều tương tự bằng pipe: `zcat` rồi `grep -c WARN`.', hint: 'zcat app.log.gz | grep -c WARN', check: AND(OK(/^zcat app\.log\.gz$/), OK(/^grep -c WARN$/)) },
    { text: 'Liệt kê các file `*.log` (từ thư mục hiện tại) có chứa `Failed`, dùng `find` kết hợp `xargs grep -l`.', hint: "find . -name '*.log' | xargs grep -l Failed", check: AND(OK(/^find \. -name \*\.log$/), OK(/^xargs grep -l Failed$/)) },
    { text: 'Tìm đệ quy chuỗi `secret` trong thư mục hiện tại, **bỏ qua file nhị phân** (`-I`) và in số dòng.', hint: 'grep -rIn secret .', check: OK(/^grep -(rIn|rnI|Irn|nrI|Inr|nIr) secret \.$/) }
  ]
};

var ERRCOUNT = ['#!/bin/bash', 'LOG=${1:-app.log}', 'n=$(grep -c "error" "$LOG")', 'echo "Số lỗi trong $LOG: $n"'];
var LASTERR = ['#!/bin/bash', 'set -euo pipefail', 'echo "Kiểm tra lỗi gần nhất..."', "last=$(grep 'FATAL' app.log | tail -1)", 'echo "Lỗi gần nhất: ${last:-không có}"', 'echo "xong"'];
var CHKNGINX = ['#!/bin/bash', 'if ps aux | grep -q nginx; then', '  echo "nginx đang chạy"', 'else', '  echo "nginx đã dừng"', 'fi'];
var IPCOUNT = ['#!/bin/bash', 'IP=$1', '[ -n "$IP" ] || { echo "cần truyền địa chỉ IP"; exit 1; }', 'n=$(grep -c "$IP" access.log)', 'echo "$IP: $n request"'];

var WEEKLY = ['#!/bin/bash', '# tổng lỗi trong log hôm nay và log hôm qua (đã nén)', 'total=0', 'for f in app.log app.log.1.gz; do', '  n=$(grep -c ERROR "$f")', '  total=$((total + n))', 'done', 'echo "Tổng lỗi: $total"'];
var OLDLOG = '2026-10-26 09:00:01 ERROR api boom\n2026-10-26 09:00:02 INFO  api ok\n2026-10-26 09:05:00 ERROR db down\n2026-10-26 09:06:00 ERROR api again\n';
function runq(s, cmd) { var h = s.hist.length, cwd = s.cwd, o = null; try { o = s.run('cd ' + s.home + '/lab && ' + cmd); } catch (e) {} s.hist.length = h; s.cwd = cwd; return o ? String(o.out || '') : ''; }

T.debugs = [
  {
    id: 'tx1d1', title: 'Báo cáo hằng ngày chỉ đếm được 1 lỗi',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./errcount.sh', 'Số lỗi trong app.log: 1', '', '$ grep -n ERROR app.log | head -3', '4:2026-10-27 10:00:09 ERROR api     GET /users 500 user=an', '5:2026-10-27 10:00:09 ERROR api     TypeError: ...', '11:2026-10-27 10:01:30 ERROR db      connection refused ...'),
    story: 'Script `errcount.sh` đếm số lỗi trong log và gửi báo cáo mỗi sáng. Nó luôn báo rất ít lỗi, dù bạn thấy ngay nhiều dòng ERROR bằng mắt.',
    goal: '`errcount.sh` phải đếm cả `ERROR` lẫn `error` (kết quả 6 với `app.log` mẫu).',
    hints: ['Chạy `grep -c "error" app.log` và so sánh với `grep -ci error app.log`. Hai con số khác nhau.', 'Mẫu `"error"` viết thường, nhưng log ghi `ERROR` viết hoa. grep phân biệt hoa thường mặc định.', 'Thêm cờ `-i`: `sed -i \'s/grep -c/grep -ci/\' errcount.sh`, chạy lại và xác nhận con số.'],
    fix: ['cat errcount.sh', 'grep -c "error" app.log', 'grep -ci "error" app.log', "sed -i 's/grep -c/grep -ci/' errcount.sh", './errcount.sh'],
    cause: 'grep phân biệt hoa thường mặc định. Mẫu `error` chỉ khớp dòng chữ thường (1 dòng), bỏ sót 5 dòng `ERROR`. Dùng `-i` cho báo cáo toàn diện.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/errcount.sh', ERRCOUNT.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/errcount.sh'); return /grep\s+(-\w*i\w*|--ignore-case)[\w\s-]*["']?error/i.test(t) || /grep\s+-c\s+-i/.test(t) || /grep\s+-i\s+-c/.test(t); }
  },
  {
    id: 'tx1d2', title: 'Script dừng im lặng sau dòng đầu tiên',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./last-error.sh', 'Kiểm tra lỗi gần nhất...', '$ echo $?', '1', '', '(không có "Lỗi gần nhất", không có "xong", không có thông báo lỗi nào)'),
    story: 'Script tìm lỗi `FATAL` gần nhất trong `app.log`. Hôm nay log sạch, không có FATAL, nhưng script im lặng thoát với mã 1 thay vì in "không có".',
    goal: 'Khi không có dòng FATAL, script vẫn chạy tới cuối và in `Lỗi gần nhất: không có` rồi `xong`.',
    hints: ['Xem `set -euo pipefail` ở đầu script. Rồi chạy riêng `grep FATAL app.log; echo $?`.', 'Không khớp thì grep trả mã 1. Với `pipefail`, mã 1 truyền qua pipeline, và `set -e` coi là lỗi.', 'Thêm `|| true` sau cả pipeline trong `$(...)`: `sed -i "s/tail -1)/tail -1 || true)/" last-error.sh`'],
    fix: ['cat last-error.sh', 'grep FATAL app.log; echo $?', 'sed -i "s/tail -1)/tail -1 || true)/" last-error.sh', 'cat last-error.sh', './last-error.sh'],
    cause: '`grep` không khớp trả mã 1. Trong `set -e` và `pipefail`, lệnh đó làm kết thúc script mà không báo gì. Với grep, "không tìm thấy" là kết quả bình thường: chủ động xử lý bằng `|| true` hoặc `if grep -q`.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/last-error.sh', LASTERR.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/last-error.sh'); return /\|\|\s*(true|:)/.test(t) || /if\s+grep\s+-q/.test(t) || /set \+e/.test(t) && !/set -euo pipefail/.test(t); }
  },
  {
    id: 'tx1d3', title: 'Kiểm tra nginx luôn báo "đang chạy"',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo systemctl stop nginx', '$ ./check-nginx.sh', 'nginx đang chạy', '', '$ ps aux | grep nginx', 'haidang+  4012  0.0  0.0  9032  2400 pts/0  S+  11:20  0:00 grep nginx'),
    story: 'Script giám sát gọi `ps aux | grep -q nginx`. Bạn đã dừng nginx để thử, nhưng script vẫn báo đang chạy nên cảnh báo không bao giờ kêu.',
    goal: 'Sửa `check-nginx.sh` để không còn tự khớp với tiến trình `grep` của chính nó.',
    hints: ['Chạy `ps aux | grep nginx` khi nginx đã dừng. Dòng nào còn lại?', 'Tiến trình `grep nginx` chính nó có chuỗi "nginx" trong dòng lệnh, nên luôn khớp.', 'Dùng `pgrep -x nginx` (hoặc `systemctl is-active --quiet nginx`). Sửa dòng `if` rồi thử lại.'],
    fix: ['cat check-nginx.sh', 'ps aux | grep nginx', "sed -i 's/ps aux | grep -q nginx/pgrep -x nginx > \\/dev\\/null/' check-nginx.sh", 'cat check-nginx.sh'],
    cause: '`grep nginx` xuất hiện trong chính danh sách tiến trình nó đọc. Cách đúng là hỏi hệ thống trực tiếp: `pgrep -x nginx`, `systemctl is-active`, hoặc mẹo `grep "[n]ginx"` (mẫu `[n]ginx` không khớp chuỗi `[n]ginx`).',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/check-nginx.sh', CHKNGINX.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/check-nginx.sh'); return /pgrep|is-active|grep -v grep|\[n\]ginx/.test(t) && !/ps aux \| grep -q nginx/.test(t); }
  },
  {
    id: 'tx1d4', title: 'Số request của một IP cao bất thường', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./ipcount.sh 192.0.2.4', '192.0.2.4: 6 request', '', '$ grep -c "^192.0.2.4 " access.log', '1', '', '(script nói 6, nhưng IP này chỉ có 1 request)'),
    story: 'Script `ipcount.sh` đếm số request của một IP để quyết định có chặn không. IP `192.0.2.4` bị báo 6 request nên suýt bị chặn oan. Thực tế chỉ có 1.',
    goal: '`./ipcount.sh 192.0.2.4` phải in `192.0.2.4: 1 request`.',
    hints: ['So sánh `grep "192.0.2.4" access.log` với `grep "^192.0.2.4 " access.log`. Dòng nào là thừa?', 'Ngoài `192.0.2.4`, log còn có `192.0.2.44`. Mẫu `192.0.2.4` là tiền tố của nó. Dấu `.` còn khớp mọi ký tự.', 'Thêm `-w` (nguyên từ) và nên thêm `-F` để dấu chấm là dấu chấm: `sed -i \'s/grep -c/grep -cFw/\' ipcount.sh`.'],
    fix: ['cat ipcount.sh', './ipcount.sh 192.0.2.4', 'grep 192.0.2.4 access.log', "sed -i 's/grep -c/grep -cFw/' ipcount.sh", './ipcount.sh 192.0.2.4'],
    cause: 'grep khớp chuỗi con. `192.0.2.4` nằm trong `192.0.2.44`, và `.` trong regex khớp mọi ký tự. Khi mẫu đến từ biến (địa chỉ, tên, đường dẫn), dùng `-F` để không là regex và `-w` (hoặc neo `^IP `) để khớp trọn từ.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/ipcount.sh', IPCOUNT.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/ipcount.sh'); return /grep\s+-\w*w\w*/.test(t) || /grep\s+.*-w\b/.test(t) || /\^\$\{?IP\}? /.test(t); }
  },
  {
    id: 'tx1d5', title: 'Báo cáo tuần chỉ thấy lỗi của hôm nay',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./weekly.sh', 'Tổng lỗi: 5', '', '$ ls app.log*', 'app.log  app.log.1.gz', '$ zcat app.log.1.gz | grep -c ERROR', '3'),
    story: 'Script `weekly.sh` cộng số lỗi của log hôm nay và log hôm qua. `logrotate` đã nén log hôm qua thành `app.log.1.gz`, nhưng báo cáo vẫn chỉ đếm đúng lỗi của `app.log`. Đếm tay thì hôm qua có 3 lỗi.',
    goal: '`./weekly.sh` phải in `Tổng lỗi: 8`.',
    hints: ['Chạy riêng `grep -c ERROR app.log.1.gz` và `zgrep -c ERROR app.log.1.gz`. Hai con số có giống nhau không?', 'File `.gz` là dữ liệu nén; chuỗi `ERROR` không nằm nguyên văn trong đó nên `grep` đếm được 0 (không báo lỗi, rất dễ bỏ sót).', 'Đổi `grep -c` thành `zgrep -c` trong script (zgrep đọc được cả file thường lẫn file .gz): `sed -i \'s/grep -c/zgrep -c/\' weekly.sh`.'],
    fix: ['cat weekly.sh', './weekly.sh', 'grep -c ERROR app.log.1.gz', 'zgrep -c ERROR app.log.1.gz', "sed -i 's/grep -c/zgrep -c/' weekly.sh", './weekly.sh'],
    cause: '`grep` đọc dữ liệu nén như byte rác nên không khớp gì và trả 0 mà không báo lỗi gì. Mọi báo cáo cần cả log đã xoay vòng phải dùng `zgrep` (hoặc `zcat file.gz | grep`). Đây cũng là một lý do để so sánh con số báo cáo với số đếm tay khi viết script giám sát.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/weekly.sh', WEEKLY.join('\n') + '\n', { owner: s2.user, mode: 493 }); s2.fs.put(s2.home + '/lab/app.log.1', OLDLOG, { owner: s2.user, mode: 420 }); }, setup2: function (s3) { s3.run('cd ' + s3.home + '/lab && gzip app.log.1'); s3.hist.length = 0; s3.cwd = s3.home + '/lab'; } }); },
    check: function (s) { return /Tổng lỗi: 8/.test(runq(s, './weekly.sh')); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
