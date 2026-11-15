(function (G) {
'use strict';
/* Chương c1d: Shell script và xử lý văn bản. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, LIN = V.lin, L2 = V.lin2;
var ftxt = C.ftxt, HCU = C.HCU;
var quiet = { out: function () {}, err: function () {}, sudo: true };

var UNIT = ['[Unit]', 'Description=Tutor API (NestJS)', 'After=network.target', '', '[Service]', 'User=tutor', 'WorkingDirectory=/srv/tutor', 'EnvironmentFile=/srv/tutor/.env', 'ExecStart=/usr/bin/node dist/main.js', 'Restart=always', 'RestartSec=3', '', '[Install]', 'WantedBy=multi-user.target'];

function base(s, o) {
  o = o || {};
  C.linBase(s, { runaway: false, setup: function (s2, l) {
    l.appReq = ['DATABASE_URL'];
    if (o.app !== false) {
      s2.fs.put('/etc/systemd/system/tutor.service', UNIT.join('\n') + '\n', { owner: 'root', mode: 420 });
      var u = LIN.ensureUnit(s2, 'tutor.service'); u.enabled = 'enabled'; LIN.startUnit(s2, u);
    }
    s2.fs.mkdirp(s2.home + '/bin', s2.user, 493);
    if (o.setup) o.setup(s2, l);
  } });
}

var D = {
  id: 'c1d', group: 'Nền tảng', short: 'Shell script, xử lý text',
  title: 'Shell script và xử lý văn bản',
  dek: 'Viết script an toàn (biến, điều kiện, vòng lặp, hàm, set -euo pipefail, trap), kiểm tra sức khoẻ, sao lưu, và xử lý log bằng grep, sed, awk, cut, tr, xargs, find.'
};
C.insertAfter('c1c', D);

D.theory = [
  { tag: 'Cú pháp', title: 'Script đầu tiên: shebang, chmod +x, mã thoát', body: [
    'Một **shell script** là file văn bản chứa các lệnh. Dòng đầu `#!/bin/bash` (shebang) cho hệ điều hành biết dùng trình thông dịch nào.',
    { pre: ['#!/bin/bash', 'echo "Xin chào $1"'], cap: '~/bin/hello.sh' },
    { tbl: [['Cách chạy', 'Cần +x?', 'Ghi chú'], ['`./hello.sh Dương`', 'Có', 'Chạy trong tiến trình con, dùng shebang'], ['`bash hello.sh Dương`', 'Không', 'Chỉ định rõ trình thông dịch'], ['`source hello.sh` hoặc `. hello.sh`', 'Không', 'Chạy **trong chính shell hiện tại**: biến và `cd` trong script còn lại sau khi chạy']] },
    { pre: ['chmod +x ~/bin/hello.sh', './hello.sh Dương', 'echo $?                 # mã thoát của lệnh vừa chạy: 0 = thành công'], cap: 'Cấp quyền chạy' },
    { ul: ['Mọi lệnh trả về **mã thoát** (0 là thành công, khác 0 là lỗi). `if`, `&&`, `||`, cron và CI đều dựa vào đó', '`exit 1` trong script trả lỗi cho người gọi; thiếu `exit` thì mã thoát là của lệnh cuối cùng', '`bash -n script.sh` kiểm tra cú pháp mà không chạy'] }
  ] },
  { tag: 'Cú pháp', title: 'Biến, tham số và dấu nháy', body: [
    { pre: ['NAME="tutor"            # không có dấu cách quanh =', 'echo "Dịch vụ: $NAME"    # nháy kép: biến được thay thế', "echo 'Dịch vụ: $NAME'    # nháy đơn: giữ nguyên chữ", 'DATE=$(date +%F)        # lấy kết quả của lệnh', 'PORT="${1:-8888}"       # tham số 1, mặc định 8888 nếu rỗng', 'echo "$# tham số: $@"', 'read -r -p "Tiếp tục? " ANS'], cap: 'Các dạng cơ bản' },
    { tbl: [['Biến', 'Ý nghĩa'], ['`$0`', 'Tên script'], ['`$1`, `$2`...', 'Tham số vị trí'], ['`$#`', 'Số tham số'], ['`"$@"`', 'Tất cả tham số, **mỗi tham số một từ riêng** (luôn đặt trong nháy kép)'], ['`$?`', 'Mã thoát lệnh trước'], ['`$$`', 'PID của chính script']] },
    { note: '**Luôn đặt biến trong nháy kép: `"$f"`.** Không có nháy, giá trị `my report.txt` bị tách thành hai từ `my` và `report.txt`, gây lỗi `too many arguments` hoặc, nghiêm trọng hơn, `rm -rf $DIR/*` với `DIR` rỗng thành `rm -rf /*`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Điều kiện và vòng lặp', body: [
    { pre: ['if [ -f "$FILE" ]; then', '  echo "có file"', 'elif [ -d "$FILE" ]; then', '  echo "là thư mục"', 'else', '  echo "không có"', 'fi', '', '[[ "$ENV" == prod* ]] && echo "production"', '', 'for f in *.log; do gzip "$f"; done', 'for i in 1 2 3; do echo "lần $i"; done', '', 'while read -r ip line; do echo "$ip"; done < access.log', '', 'case "$1" in', '  start)    echo "bật" ;;', '  stop|halt) echo "tắt" ;;', '  *)        echo "dùng: $0 start|stop"; exit 2 ;;', 'esac'], cap: 'if / for / while / case' },
    { tbl: [['Phép thử', 'Nghĩa'], ['`-f f` / `-d d` / `-e p`', 'là file / thư mục / tồn tại'], ['`-z s` / `-n s`', 'chuỗi rỗng / không rỗng'], ['`a -eq b`, `-ne`, `-lt`, `-gt`', 'so sánh số'], ['`"$a" = "$b"`', 'so sánh chuỗi'], ['`[[ ... ]]`', 'bản bash mạnh hơn: hỗ trợ `==` với mẫu, `&&`, `||`']] },
    { note: 'Khoảng trắng bên trong `[ ... ]` là **bắt buộc**: `[ -f "$f" ]`, không phải `[-f "$f"]`.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Hàm, chế độ an toàn và trap', body: [
    { pre: ['#!/bin/bash', 'set -euo pipefail', 'log() { echo "[$(date +%H:%M:%S)] $*"; }', 'tmp=$(mktemp -d)', "trap 'rm -rf \"$tmp\"; log cleanup' EXIT", 'log "bắt đầu"', 'tar czf "$tmp/out.tgz" /srv/tutor', 'log "xong"'], cap: 'Khung script an toàn' },
    { tbl: [['Dòng', 'Tác dụng'], ['`set -e`', 'Dừng ngay khi một lệnh trả mã khác 0'], ['`set -u`', 'Dùng biến chưa gán là lỗi (bắt lỗi gõ nhầm tên biến)'], ['`set -o pipefail`', 'Một pipeline thất bại nếu **bất kỳ** lệnh nào trong nó thất bại'], ['`trap ... EXIT`', 'Chạy lệnh dọn dẹp khi script kết thúc, kể cả khi lỗi'], ['`mktemp -d`', 'Tạo thư mục tạm duy nhất']] },
    { note: 'Không có `pipefail`, `set -e` **bỏ qua** lỗi ở giữa pipeline: `npm run build | tee build.log` có mã thoát của `tee` (0) dù build thất bại, và script đi tiếp tới bước deploy.', kind: 'warn' },
    { ul: ['`set -e` không bắt lỗi trong điều kiện `if cmd; then`, hoặc sau `||`: đó là thiết kế, không phải lỗi', 'Hàm trả về mã thoát bằng `return N`; kết quả in ra lấy bằng `$(ham)`'] }
  ] },
  { tag: 'Cú pháp', title: 'Công cụ xử lý văn bản', body: [
    { pre: ['grep -c " 500 " access.log          # đếm dòng khớp', "awk '{print $9}' access.log | sort | uniq -c | sort -rn   # đếm theo mã trạng thái", "awk '$9 >= 500 {n++} END {print n+0}' access.log   # tổng lỗi 5xx", "cut -d' ' -f1 access.log | sort -u | wc -l   # số IP khác nhau", "sed -n '2,4p' access.log                 # in dòng 2-4", "sed 's/GET/get/' access.log               # thay thế, in ra", "sed -i 's/8888/9999/' app.conf            # sửa trực tiếp trong file", "tr 'a-z' 'A-Z' < names.txt               # đổi chữ hoa", "printf 'a\\nb\\n' | xargs -I{} touch {}.tmp   # chạy lệnh cho từng dòng", "find . -name '*.log' -exec gzip {} \\;     # chạy lệnh cho từng file tìm được"], cap: 'Những lệnh dùng hằng ngày' },
    { tbl: [['Công cụ', 'Dùng khi'], ['`grep`', 'Lọc dòng theo mẫu'], ['`cut`', 'Lấy cột theo dấu phân cách cố định'], ['`awk`', 'Xử lý theo cột có điều kiện, cộng dồn, in định dạng'], ['`sed`', 'Thay thế, xoá, in theo số dòng'], ['`sort | uniq -c`', 'Thống kê tần suất (uniq chỉ gộp các dòng **liền nhau**, nên phải sort trước)'], ['`xargs`', 'Biến danh sách dòng thành đối số lệnh'], ['`find -exec`', 'Áp dụng lệnh lên từng file thoả điều kiện']] },
    { note: '`sed -i` sửa file tại chỗ không có hoàn tác. Thử trước không `-i`, hoặc `sed -i.bak` để giữ bản sao `.bak`.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Hai script thực tế: health-check và backup', body: [
    { pre: ['#!/bin/bash', '# health.sh: gọi /health tối đa 3 lần, thoát 1 nếu vẫn lỗi', 'set -euo pipefail', 'URL="${1:-http://localhost:8888/health}"', 'for i in 1 2 3; do', '  if curl -fsS "$URL" > /dev/null; then', '    echo "ok"; exit 0', '  fi', '  echo "lần $i lỗi"; sleep 1', 'done', 'exit 1'], cap: 'health.sh' },
    { pre: ['#!/bin/bash', 'set -euo pipefail', 'DEST="$HOME/backups"', 'mkdir -p "$DEST"', 'OUT="$DEST/tutor-$(date +%F).tgz"', 'tar czf "$OUT" --exclude=node_modules /srv/tutor', 'tar tzf "$OUT" > /dev/null          # kiểm tra file nén đọc được', 'echo "đã tạo $OUT"'], cap: 'backup.sh' },
    { ul: ['`curl -f` làm lỗi HTTP (4xx, 5xx) thành mã thoát khác 0, `-sS` im lặng nhưng vẫn in lỗi', 'Luôn kiểm tra bản sao lưu đọc được (`tar tzf`) trước khi coi là xong', 'Giữ số bản sao lưu có hạn: `find "$DEST" -name "*.tgz" -mtime +7 -delete`'] }
  ] },
  { tag: 'Lưu ý', title: 'Chạy script từ cron: những thứ khác với terminal', body: [
    'Cron chạy script với PATH tối thiểu, thư mục làm việc là **home** của user, không có biến môi trường đăng nhập. Một script "chạy tay được" cần ba thứ để chạy dưới cron:',
    { tbl: [['Vấn đề', 'Biểu hiện', 'Cách sửa trong script'], ['PATH', '`node: not found`, `jq: not found`', 'Dùng đường dẫn tuyệt đối hoặc `export PATH=/usr/local/bin:/usr/bin:/bin` ở đầu'], ['Thư mục làm việc', '`No such file`, đường dẫn tương đối hỏng', '`cd "$(dirname "$0")"` hoặc dùng đường dẫn tuyệt đối'], ['Biến môi trường', 'Biến rỗng, kết nối DB hỏng', 'Nạp file: `set -a; . /srv/tutor/.env; set +a`'], ['Log', 'Không biết nó có chạy hay không', 'Trong crontab: `>> /đường/dẫn.log 2>&1`']] },
    { pre: ['*/5 * * * * /home/haidangphan/bin/health.sh >> /home/haidangphan/health.log 2>&1'], cap: 'Dòng crontab đúng chuẩn' },
    'Nếu script có thể chạy quá lâu và chồng lên lần sau, bọc bằng `flock -n /tmp/health.lock /home/haidangphan/bin/health.sh` để lần mới bỏ qua khi lần cũ chưa xong.'
  ] },
  { tag: 'Bảng tra', title: 'Bảng triệu chứng và checklist cuối chương', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['`Permission denied` khi `./script.sh`', 'Thiếu quyền thực thi', '`chmod +x script.sh` hoặc `bash script.sh`'], ['`bad interpreter` / `command not found: ^M`', 'File có xuống dòng kiểu Windows (CRLF)', '`sed -i "s/\\r$//" script.sh`'], ['`[: too many arguments`', 'Biến không có nháy kép chứa dấu cách', '`[ -f "$f" ]`'], ['Script chạy tiếp dù bước giữa lỗi', 'Thiếu `set -e`, hoặc lỗi nằm trong pipeline thiếu `pipefail`', '`set -euo pipefail`'], ['`unbound variable`', '`set -u` bắt biến chưa gán', 'Gán mặc định `${VAR:-giá_trị}`'], ['Chạy tay được, cron không', 'PATH, thư mục làm việc, biến môi trường', 'Đường dẫn tuyệt đối, `cd`, nạp `.env`'], ['Biến mất sau khi chạy script', 'Chạy bằng `./script`, không phải `source`', '`source script.sh` nếu cần giữ biến']] },
    { ul: ['**1.** Dòng đầu `#!/bin/bash`; file có quyền `+x`', '**2.** `set -euo pipefail` ở đầu mọi script quan trọng', '**3.** Mọi biến đặt trong nháy kép: `"$var"`, `"$@"`', '**4.** Dọn dẹp bằng `trap ... EXIT`; file tạm dùng `mktemp`', '**5.** `bash -n` (và `shellcheck` nếu có) trước khi chạy thật', '**6.** Trong cron: đường dẫn tuyệt đối, đã `cd`, đã chuyển hướng log', '**7.** Script thay đổi dữ liệu có chế độ thử (dry-run) hoặc in ra việc sẽ làm'] }
  ] }
];

D.quiz = C.QZ(3, [
  ['Bạn viết `deploy.sh` có `#!/bin/bash` nhưng `./deploy.sh` báo `Permission denied`. Cách sửa?', '`chmod +x deploy.sh` (hoặc chạy bằng `bash deploy.sh`)', ['Đổi dòng đầu thành `#!/bin/sh -x`', 'Chạy `sudo ./deploy.sh` lần đầu để tự cấp quyền', 'Xoá và tạo lại file bằng `touch`'], 'Chạy trực tiếp bằng `./` cần bit thực thi; `bash file` thì không cần.'],
  ['Điểm khác biệt chính giữa `./env.sh` và `source env.sh` khi script có `export APP_ENV=prod`?', '`source` đặt biến vào shell hiện tại; `./env.sh` chỉ đặt trong tiến trình con rồi mất', ['`source` chạy nhanh hơn, ngoài ra giống hệt', '`./env.sh` luôn chạy với quyền root', '`source` không đọc dòng `export`'], 'Tiến trình con không thể đổi biến của shell cha. Muốn script "để lại" biến hay `cd` thì phải `source`.'],
  ['Trong `[ -f $f ]`, `f="my report.txt"` gây lỗi vì?', 'Biến không có nháy kép nên tách thành hai từ: `[ -f my report.txt ]`', ['`-f` không dùng được với tên có dấu cách', 'Phải dùng `[[ ]]` mới đọc được biến', 'Tên file không được chứa dấu chấm'], 'Luôn viết `"$f"`. Có nháy kép thì giá trị giữ nguyên là một từ.'],
  ['`"$@"` khác `$*` (không nháy) thế nào khi gọi `./s.sh "a b" c`?', '`"$@"` giữ đúng hai tham số `a b` và `c`; `$*` không nháy tách thành ba từ', ['Hai cách luôn cho kết quả giống nhau', '`"$@"` gộp thành một chuỗi duy nhất', '`$*` chỉ lấy tham số đầu tiên'], '`"$@"` là cách đúng để chuyển tiếp mọi tham số nguyên vẹn.'],
  ['`set -e` được thêm vào đầu script. Dòng `npm run build | tee build.log` có build thất bại nhưng script vẫn chạy tiếp. Vì sao?', 'Mã thoát của pipeline là của lệnh cuối (`tee` = 0); cần `set -o pipefail`', ['`set -e` chỉ có tác dụng trong hàm', 'npm luôn trả mã 0', '`tee` chặn mã lỗi của hệ điều hành'], 'Không có pipefail, lỗi giữa pipeline bị nuốt. Dùng `set -euo pipefail` làm khung mặc định.'],
  ['Mục đích của `trap \'rm -rf "$tmp"\' EXIT`?', 'Dọn thư mục tạm khi script kết thúc, kể cả khi dừng do lỗi', ['Chặn người dùng nhấn Ctrl+C', 'Chạy lệnh `rm` mỗi giây', 'Xoá script sau khi chạy xong'], 'EXIT kích hoạt ở mọi đường thoát (bình thường, `exit 1`, lỗi `set -e`).'],
  ['Cần đếm số IP khác nhau trong `access.log` (IP là cột 1, phân cách bằng dấu cách). Lệnh đúng?', "`cut -d' ' -f1 access.log | sort -u | wc -l`", ["`cut -f1 access.log | uniq | wc -l`", "`grep -c ip access.log`", "`awk '{print $1}' access.log | uniq -c`"], '`uniq` chỉ gộp dòng liền nhau nên cần `sort` trước (hoặc dùng `sort -u`).'],
  ['Script `report.sh` gọi `node report.js`. Chạy tay tốt; trong cron log ghi `node: not found`. Sửa gọn nhất?', 'Đổi sang `/usr/bin/node` (hoặc `export PATH=...` ở đầu script)', ['Thêm `sudo` trước `node`', 'Đổi shebang thành `#!/bin/zsh`', 'Chuyển file vào `/etc/cron.d`'], 'PATH của cron chỉ gồm `/usr/bin:/bin`, nên `node` ở thư mục khác không tìm thấy.'],
  ['Script chạy từ cron báo `tar: data: Cannot stat`, trong khi `cd ~/bin && ./backup.sh` chạy tốt. Nguyên nhân?', 'Cron chạy ở thư mục home, nên đường dẫn tương đối `data` không tồn tại; cần `cd` hoặc đường dẫn tuyệt đối', ['tar không chạy được trong cron', 'Cron yêu cầu file `.sh` phải thuộc root', 'Biến `$HOME` rỗng khiến tar hỏng'], 'Dùng `cd "$(dirname "$0")"` đầu script hoặc đường dẫn tuyệt đối.'],
  ['`curl -fsS http://localhost:8888/health` khác `curl -s ...` ở điểm nào quan trọng với script kiểm tra?', '`-f` làm mã HTTP 4xx/5xx trả mã thoát khác 0, để `if`/`set -e` bắt được', ['`-f` ép curl tải về file', '`-f` bật HTTPS', '`-f` tăng tốc độ tải'], 'Không có `-f`, curl trả 0 dù server trả 500, nên health-check "xanh" giả.']
]);

var HELLO = ['#!/bin/bash', 'echo "Xin chào $1"'];
var ARGS = ['#!/bin/bash', 'echo "$# tham số"', 'for a in "$@"; do echo "[$a]"; done'];
var ENVSH = ['export APP_ENV=prod'];
var SVC = ['#!/bin/bash', 'case "$1" in', '  start) echo "bật" ;;', '  stop|halt) echo "tắt" ;;', '  *) echo "dùng: $0 start|stop"; exit 2 ;;', 'esac'];
var HEALTH = ['#!/bin/bash', 'set -euo pipefail', 'URL="${1:-http://localhost:8888/health}"', 'for i in 1 2 3; do', '  if curl -fsS "$URL" > /dev/null; then echo "ok"; exit 0; fi', '  echo "lần $i lỗi"; sleep 1', 'done', 'exit 1'];
var BACKUP = ['#!/bin/bash', 'set -euo pipefail', 'DEST="$HOME/backups"', 'mkdir -p "$DEST"', 'OUT="$DEST/tutor-$(date +%F).tgz"', 'tar czf "$OUT" --exclude=node_modules /srv/tutor', 'tar tzf "$OUT" > /dev/null', 'echo "đã tạo $OUT"'];
var LOGLINES = ['10.0.0.5 - - [27/Oct/2026:10:00:01] "GET /api/users HTTP/1.1" 200', '10.0.0.5 - - [27/Oct/2026:10:00:02] "GET /api/orders HTTP/1.1" 500', '10.0.0.9 - - [27/Oct/2026:10:00:03] "GET /health HTTP/1.1" 200', '10.0.0.7 - - [27/Oct/2026:10:00:04] "POST /api/login HTTP/1.1" 401', '10.0.0.9 - - [27/Oct/2026:10:00:05] "GET /api/orders HTTP/1.1" 500', '10.0.0.5 - - [27/Oct/2026:10:00:06] "GET /health HTTP/1.1" 200'];
var CRONHEALTH = '*/5 * * * * /home/haidangphan/bin/health.sh >> /home/haidangphan/health.log 2>&1';

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Tạo script chào hỏi trong ~/bin.', hint: HCU('~/bin/hello.sh', HELLO), check: function (s) { return /echo "Xin chào \$1"/.test(ftxt(s, s.home + '/bin/hello.sh')); } },
    { text: 'Chạy thử trực tiếp: chưa có quyền thực thi nên bị từ chối.', hint: '~/bin/hello.sh', check: FAIL(/hello\.sh$/) },
    { text: 'Cấp quyền chạy.', hint: 'chmod +x ~/bin/hello.sh', check: function (s) { var n = s.fs.get(s.home + '/bin/hello.sh'); return !!n && (n.mode & 73) > 0; } },
    { text: 'Chạy với một tham số.', hint: '~/bin/hello.sh Dương', check: OK(/hello\.sh Dương$/) },
    { text: 'Xem mã thoát của lệnh vừa rồi.', hint: 'echo $?', check: OK(/^echo 0$/) },
    { text: 'Chạy bằng bash (không cần +x).', hint: 'bash ~/bin/hello.sh Linux', check: OK(/^bash \S*hello\.sh Linux/) },
    { text: 'Viết script đặt biến môi trường rồi nạp bằng source.', hint: HCU('~/bin/env.sh', ENVSH) + '\nsource ~/bin/env.sh', check: function (s) { return s.env && s.env.APP_ENV === 'prod' || (s.vars && s.vars.APP_ENV === 'prod') || s.hist.some(function (h) { return h.code === 0 && /^source \S*env\.sh/.test(h.cmd); }); } },
    { text: 'Xác nhận biến còn lại trong shell.', hint: 'echo $APP_ENV', check: OK(/^echo prod$/) },
    { text: 'Script đếm tham số, mỗi tham số một dòng.', hint: HCU('~/bin/args.sh', ARGS) + '\nchmod +x ~/bin/args.sh', check: function (s) { return /"\$@"/.test(ftxt(s, s.home + '/bin/args.sh')); } },
    { text: 'Gọi với tham số có dấu cách: phải thấy 2 tham số.', hint: '~/bin/args.sh "a b" c', check: OK(/args\.sh "?a b"? c$/) },
    { text: 'Tạo file tên có dấu cách.', hint: 'touch "my report.txt"', check: function (s) { return !!s.fs.get(s.home + '/my report.txt'); } },
    { text: 'Liệt kê không nháy: lệnh tách tên thành hai từ và thất bại.', hint: 'f="my report.txt"; ls $f', check: FAIL(/^ls my report\.txt$/) },
    { text: 'Có nháy kép: đúng.', hint: 'f="my report.txt"; ls "$f"', check: OK(/^ls my report\.txt$/) },
    { text: 'Viết script `svc.sh` dùng case.', hint: HCU('~/bin/svc.sh', SVC) + '\nchmod +x ~/bin/svc.sh', check: function (s) { return /^case "\$1" in/m.test(ftxt(s, s.home + '/bin/svc.sh')); } },
    { text: 'Thử `start` rồi một lệnh sai (mã thoát phải là 2).', hint: '~/bin/svc.sh start\n~/bin/svc.sh nonsense; echo $?', check: FAIL(/svc\.sh nonsense$/) },
    { text: 'Viết health-check với set -euo pipefail và vòng lặp thử lại.', hint: HCU('~/bin/health.sh', HEALTH) + '\nchmod +x ~/bin/health.sh', check: function (s) { var t = ftxt(s, s.home + '/bin/health.sh'); return /set -euo pipefail/.test(t) && /curl -fsS/.test(t); } },
    { text: 'Kiểm tra cú pháp không cần chạy.', hint: 'bash -n ~/bin/health.sh', check: OK(/^bash -n \S*health\.sh/) },
    { text: 'Chạy health-check khi app đang sống: in ok.', hint: '~/bin/health.sh', check: OK(/^\/home\/haidangphan\/bin\/health\.sh$/) },
    { text: 'Dừng app rồi chạy lại để thấy script thất bại có mã thoát 1.', hint: 'sudo systemctl stop tutor\n~/bin/health.sh; echo $?', check: FAIL(/^\/home\/haidangphan\/bin\/health\.sh$/) },
    { text: 'Bật lại app.', hint: 'sudo systemctl start tutor', check: function (s) { return C.uactive(s, 'tutor.service'); } },
    { text: 'Viết script sao lưu có kiểm tra file nén.', hint: HCU('~/bin/backup.sh', BACKUP) + '\nchmod +x ~/bin/backup.sh', check: function (s) { var t = ftxt(s, s.home + '/bin/backup.sh'); return /tar czf/.test(t) && /tar tzf/.test(t); } },
    { text: 'Chạy sao lưu rồi xem kết quả.', hint: '~/bin/backup.sh\nls -l ~/backups', check: function (s) { return s.fs.list(s.home + '/backups').some(function (n) { return /^tutor-.*\.tgz$/.test(n); }); } },
    { text: 'Tạo file log mẫu để thực hành xử lý văn bản.', hint: HCU('~/access.log', LOGLINES), check: function (s) { return ftxt(s, s.home + '/access.log').split('\n').filter(Boolean).length === 6; } },
    { text: 'Lọc các dòng lỗi 500.', hint: "grep ' 500' ~/access.log", check: OK(/^grep  ?500 /) },
    { text: 'Thống kê số lần xuất hiện của từng mã trạng thái.', hint: "awk '{print $NF}' ~/access.log | sort | uniq -c | sort -rn", check: OK(/^sort -rn/) },
    { text: 'Đếm số IP khác nhau.', hint: "cut -d' ' -f1 ~/access.log | sort -u | wc -l", check: OK(/^wc -l/) },
    { text: 'Tổng số lỗi 5xx bằng awk.', hint: "awk '$NF >= 500 {n++} END {print n+0}' ~/access.log", check: OK(/^awk \$NF >= 500 /) },
    { text: 'In dòng 2 đến 4.', hint: "sed -n '2,4p' ~/access.log", check: OK(/^sed -n 2,4p /) },
    { text: 'Đổi GET thành get, thử trước không dùng -i.', hint: "sed 's/GET/get/' ~/access.log | head -2", check: OK(/^sed s\/GET\/get\//) },
    { text: 'Đổi chữ thường thành chữ hoa bằng tr.', hint: "echo tutor | tr 'a-z' 'A-Z'", check: OK(/^tr a-z A-Z/) },
    { text: 'Dùng xargs tạo file từ danh sách.', hint: "printf 'a\\nb\\n' | xargs -I{} touch {}.tmp", transient: true, check: function (s) { return !!s.fs.get(s.home + '/a.tmp') && !!s.fs.get(s.home + '/b.tmp'); } },
    { text: 'Đếm dòng từng file .tmp bằng find -exec.', hint: "find ~ -maxdepth 1 -name '*.tmp' -exec wc -l {} \\;", check: OK(/^find .*-exec wc -l/) },
    { text: 'Xoá chúng bằng find -delete.', hint: "find ~ -maxdepth 1 -name '*.tmp' -delete", check: function (s) { return !s.fs.get(s.home + '/a.tmp') && s.hist.some(function (h) { return /^find .*-delete/.test(h.cmd); }); } },
    { text: 'Hẹn health-check chạy mỗi phút từ cron (ghi log).', hint: "echo '* * * * * /home/haidangphan/bin/health.sh >> /home/haidangphan/health.log 2>&1' | crontab -", check: function (s) { var t = (s.W.lin.cron || {}).haidangphan || ''; return /health\.sh >> \S*health\.log 2>&1/.test(t); } },
    { text: 'Chờ 2 phút rồi đọc log để thấy lần chạy.', hint: 'sleep 120; cat ~/health.log', check: function (s) { return ftxt(s, s.home + '/health.log').split('\n').filter(Boolean).length >= 2; } }
  ]
};

D.debugs = [
  {
    id: 'c1sh1', title: 'Script chạy tay được, cron: node not found',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ~/bin/report.sh', 'báo cáo: 42 đơn hàng', '', '$ cat ~/report.log', '/home/haidangphan/bin/report.sh: line 3: node: command not found'),
    story: 'Script báo cáo hằng ngày gọi `node`. Gõ tay thì ổn, nhưng lần chạy tự động của cron chỉ ghi lỗi.',
    goal: 'Sửa **trong script** để chạy dưới cron không còn `node: command not found`.',
    hints: ['Log lỗi từ chính script, mà cron chạy với PATH `/usr/bin:/bin`. `which node` cho biết nó nằm ở đâu.', '`node` nằm ngoài PATH của cron. Có hai cách: dùng đường dẫn tuyệt đối, hoặc đặt PATH ở đầu script.', 'Sửa nhanh: `sed -i "s#^node #/usr/bin/node #" ~/bin/report.sh`'],
    fix: ['cat ~/report.log', 'which node', 'cat ~/bin/report.sh', 'sed -i "s#^node #/usr/bin/node #" ~/bin/report.sh', 'cat ~/bin/report.sh'],
    cause: 'Cron không nạp `.bashrc` nên PATH rất ngắn. Script phải tự đủ: đường dẫn tuyệt đối hoặc `export PATH=` ở đầu.',
    setup: function (s) {
      base(s, { app: false, setup: function (s2, l) {
        s2.fs.mkdirp('/srv/tutor/jobs', 'tutor', 493); s2.fs.put('/srv/tutor/jobs/report.js', "console.log('báo cáo: 42 đơn hàng');\n", { owner: 'tutor', mode: 420 });
        s2.fs.put(s2.home + '/bin/report.sh', '#!/bin/bash\nset -e\nnode /srv/tutor/jobs/report.js\n', { owner: s2.user, mode: 493 });
        l.cron.haidangphan = '* * * * * /home/haidangphan/bin/report.sh >> /home/haidangphan/report.log 2>&1\n'; LIN.advance(s2, 70, quiet);
      } });
    },
    check: function (s) { var t = ftxt(s, s.home + '/bin/report.sh'); return /\/usr\/bin\/node|^(export )?PATH=.*\/usr\/bin/m.test(t) && !/^node /m.test(t); }
  },
  {
    id: 'c1sh2', title: 'too many arguments: tên file có dấu cách',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./size.sh "my report.txt"', './size.sh: line 3: [: too many arguments', 'không thấy file', '', '$ ls "my report.txt"', 'my report.txt'),
    story: 'File tồn tại nhưng script báo không thấy. Script chạy tốt với `data.txt`, chỉ hỏng với tên có dấu cách.',
    goal: '`./size.sh "my report.txt"` in ra `thấy file`.',
    hints: ['Lỗi `too many arguments` xuất hiện khi `[ ... ]` nhận nhiều từ hơn dự kiến. Xem dòng 3 của script.', 'Biến `$f` không có nháy kép nên `my report.txt` bị tách thành hai từ.', 'Sửa thành `[ -f "$f" ]`: `sed -i \'s/\\$f/"$f"/\' ~/size.sh`, rồi chạy lại.'],
    fix: ['cat -n ~/size.sh', "sed -i 's/\\$f/\"$f\"/g' ~/size.sh", 'cat ~/size.sh', './size.sh "my report.txt"'],
    cause: 'Mọi tham chiếu biến nên đặt trong nháy kép. Không có nháy, shell tách theo khoảng trắng, nên `[ -f my report.txt ]` có 3 đối số.',
    setup: function (s) { base(s, { app: false, setup: function (s2) { s2.fs.put(s2.home + '/my report.txt', 'a\nb\n', { owner: s2.user, mode: 420 }); s2.fs.put(s2.home + '/size.sh', '#!/bin/bash\nf=$1\nif [ -f $f ]; then echo "thấy file"; else echo "không thấy file"; fi\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/size.sh'); return /\[ -f "\$f" \]|\[\[ -f \$f \]\]|\[ -f "\$1" \]/.test(t); }
  },
  {
    id: 'c1sh3', title: 'Build lỗi nhưng deploy vẫn chạy tiếp',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./deploy.sh', 'error TS2304: Cannot find name "Foo"', 'đã deploy xong!', '', '(build thất bại nhưng script vẫn báo thành công)'),
    story: 'Script deploy có `set -e` nên bạn tin nó sẽ dừng khi build lỗi. Nhưng bản lỗi vẫn được đưa lên.',
    goal: 'Sửa `deploy.sh` để khi build thất bại thì script dừng với mã thoát khác 0 và **không** in "đã deploy xong!".',
    hints: ['Xem dòng chạy build: `./build.sh | tee build.log`. Có pipe.', 'Mã thoát của pipeline là của lệnh cuối cùng (`tee`) nếu không bật `pipefail`.', 'Đổi `set -e` thành `set -euo pipefail` ở đầu `deploy.sh`.'],
    fix: ['cat ~/deploy.sh', "sed -i 's/^set -e$/set -euo pipefail/' ~/deploy.sh", 'cat ~/deploy.sh', './deploy.sh; echo $?'],
    cause: '`set -e` chỉ thấy mã thoát cuối pipeline. `pipefail` làm pipeline thất bại nếu bất kỳ lệnh nào trong nó lỗi. `-u` bắt thêm biến chưa gán.',
    setup: function (s) { base(s, { app: false, setup: function (s2) { s2.fs.put(s2.home + '/build.sh', '#!/bin/bash\necho "error TS2304: Cannot find name \\"Foo\\""\nexit 1\n', { owner: s2.user, mode: 493 }); s2.fs.put(s2.home + '/deploy.sh', '#!/bin/bash\nset -e\n./build.sh | tee build.log\necho "đã deploy xong!"\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/deploy.sh'); return /pipefail/.test(t); }
  },
  {
    id: 'c1sh4', title: 'Sao lưu trong cron: Cannot stat', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ cd ~/bin && ./nightly.sh', 'đã nén 2 file', '', '$ cat ~/nightly.log', 'tar: data: Cannot stat: No such file or directory'),
    story: 'Script sao lưu `nightly.sh` hoạt động khi bạn chạy trong thư mục `~/bin`, nhưng cron luôn thất bại.',
    goal: 'Sửa script để chạy đúng từ **bất kỳ thư mục nào** (không đổi crontab).',
    hints: ['So sánh nơi bạn chạy (`~/bin`) với nơi cron chạy (thư mục home).', 'Script dùng đường dẫn tương đối `data`. Cron không `cd` vào thư mục script.', 'Thêm `cd "$(dirname "$0")"` ngay sau dòng shebang, hoặc dùng đường dẫn tuyệt đối `/home/haidangphan/bin/data`.'],
    fix: ['cat ~/bin/nightly.sh', 'crontab -l', "sed -i '1a cd \"$(dirname \"$0\")\"' ~/bin/nightly.sh", 'cat ~/bin/nightly.sh', 'cd / && ~/bin/nightly.sh'],
    cause: 'Cron chạy script với thư mục làm việc là home. Đường dẫn tương đối đúng khi bạn đứng đúng thư mục nhưng sai ở mọi nơi khác. Dùng `cd "$(dirname "$0")"` hoặc đường dẫn tuyệt đối.',
    setup: function (s) {
      base(s, { app: false, setup: function (s2, l) {
        s2.fs.mkdirp(s2.home + '/bin/data', s2.user, 493); s2.fs.put(s2.home + '/bin/data/a.txt', 'a\n', { owner: s2.user, mode: 420 }); s2.fs.put(s2.home + '/bin/data/b.txt', 'b\n', { owner: s2.user, mode: 420 });
        s2.fs.put(s2.home + '/bin/nightly.sh', '#!/bin/bash\nset -e\ntar czf /tmp/nightly.tgz data\necho "đã nén 2 file"\n', { owner: s2.user, mode: 493 });
        l.cron.haidangphan = '* * * * * /home/haidangphan/bin/nightly.sh >> /home/haidangphan/nightly.log 2>&1\n'; LIN.advance(s2, 70, quiet);
      } });
    },
    check: function (s) { var t = ftxt(s, s.home + '/bin/nightly.sh'); return /cd "\$\(dirname "\$0"\)"|cd \S*\/bin|\/home\/haidangphan\/bin\/data/.test(t); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
