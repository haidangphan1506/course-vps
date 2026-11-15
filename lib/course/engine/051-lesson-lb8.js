(function (G) {
'use strict';
/* Chương lb8: lập lịch và script nâng cao. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
var HOME = '/home/haidangphan';
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
function cron(s) { var l = s.W && s.W.lin; return (l && l.cron && l.cron[s.user]) || ''; }
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }
function mode(s, p) { var n = s.fs.get(p); return n ? n.mode : 0; }
function base(s, o) {
  o = o || {};
  LB.base(s, {
    setup: function (s2, l, h) {
      LB.put(s2, s2.home + '/bin/mybackup', '#!/bin/bash\necho "mybackup $(date +%F) ok"\n', { mode: 493 });
      LB.put(s2, s2.home + '/bin/report.sh', '#!/bin/bash\n# báo cáo nặng, chạy ~3 phút\nsleep 180\necho "report xong"\n', { mode: 493 });
      if (o.setup) o.setup(s2, l, h);
    },
    setup2: function (s3, S, l) { if (o.setup2) o.setup2(s3, S, l); }
  });
}

var T = {
  id: 'lb8', group: 'Linux căn bản', short: 'Lập lịch và script',
  title: 'Lập lịch và script nâng cao: cron, systemd timer, getopts, trap, flock',
  dek: 'Đọc và viết cú pháp cron, hiểu vì sao job chạy tay được mà qua cron thì lỗi (môi trường tối thiểu), ghi log, thay cron bằng systemd timer, rồi viết script đủ chắc để chạy không người trông: tham số với getopts, hàm, vòng lặp, set -euo pipefail, trap dọn dẹp và flock chống chạy chồng.'
};
C.insertAfter('lb7', T);

T.theory = [
  { tag: 'Cú pháp', title: 'Cú pháp cron: 5 trường thời gian', body: [
    '**cron** là dịch vụ chạy lệnh theo lịch. Mỗi dòng trong crontab gồm 5 trường thời gian rồi tới lệnh:',
    { pre: ['# ┌───── phút (0-59)', '# │ ┌───── giờ (0-23)', '# │ │ ┌───── ngày trong tháng (1-31)', '# │ │ │ ┌───── tháng (1-12)', '# │ │ │ │ ┌───── thứ (0-7, 0 và 7 là Chủ nhật)', '# │ │ │ │ │', '  *  *  *  *  *   lệnh cần chạy'], cap: 'Năm trường' },
    { tbl: [['Ký hiệu', 'Nghĩa', 'Ví dụ'], ['`*`', 'mọi giá trị', '`* * * * *` mỗi phút'], ['`,`', 'danh sách', '`0 9,17 * * *` lúc 9:00 và 17:00'], ['`-`', 'khoảng', '`0 9 * * 1-5` 9:00 các ngày thứ 2 đến thứ 6'], ['`/`', 'bước', '`*/15 * * * *` mỗi 15 phút'], ['`@daily` ...', 'viết tắt', '`@reboot`, `@hourly`, `@daily`, `@weekly`']] },
    { ul: ['`30 2 * * *` : 02:30 mỗi ngày', '`0 3 * * 0` : 03:00 Chủ nhật hằng tuần', '`0 0 1 * *` : nửa đêm ngày 1 hằng tháng', '`*/5 * * * *` : mỗi 5 phút'] },
    { note: 'Nếu cả trường **ngày trong tháng** và **thứ** đều khác `*`, cron chạy khi **một trong hai** khớp (OR), không phải cả hai. Đây là bẫy kinh điển.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Quản lý crontab của bạn', body: [
    { pre: ['crontab -l                 # xem crontab của bạn', 'crontab -e                 # sửa (mở trình soạn thảo)', 'crontab -r                 # XOÁ TOÀN BỘ crontab (không hỏi lại!)', 'crontab file.txt           # nạp crontab từ một file', 'echo \'* * * * * date >> ~/t.log\' | crontab -    # nạp từ stdin', 'sudo crontab -u www-data -l   # crontab của user khác'], cap: 'Lệnh crontab' },
    'Muốn **thêm** một dòng mà không mất các dòng cũ, đừng dùng `crontab -` đơn lẻ (nó ghi đè). Hãy nối thêm:',
    { pre: ["(crontab -l 2>/dev/null; echo '0 2 * * * /home/ubuntu/bin/backup') | crontab -"], cap: 'Thêm một dòng' },
    { ul: ['Trình an toàn nhất: `crontab -l > cron.txt`, sửa file, `crontab cron.txt` (cron kiểm tra cú pháp khi nạp)', 'Hệ thống còn có `/etc/crontab` và `/etc/cron.d/*` (có thêm cột **user**), cùng `/etc/cron.daily`, `cron.hourly` cho script chạy theo chu kỳ', 'Dòng bắt đầu bằng `#` là chú thích; mỗi crontab cần kết thúc bằng một dòng trống (có ký tự xuống dòng cuối)'] },
    { note: '`crontab -r` đứng cạnh `crontab -e` trên bàn phím chỉ cách nhau một ký tự và không xác nhận. Hãy thói quen `crontab -l > ~/crontab.bak` trước khi sửa.', kind: 'warn' }
  ] },
  { tag: 'Bẫy', title: 'Vì sao chạy tay được mà qua cron thì lỗi', body: [
    'cron khởi chạy lệnh trong một môi trường **tối thiểu**: không đọc `~/.bashrc`, `~/.profile`; shell mặc định là `/bin/sh`; `PATH` chỉ có `/usr/bin:/bin`; thư mục hiện tại là thư mục home. Đa số lỗi cron đến từ đó.',
    { tbl: [['Triệu chứng trong log', 'Nguyên nhân thường gặp', 'Cách sửa'], ['`mybackup: not found`', 'Lệnh nằm ngoài `PATH` của cron (ví dụ `~/bin`, `/usr/local/bin`, `node` cài bằng nvm)', 'Dùng **đường dẫn tuyệt đối** hoặc đặt `PATH=...` ở đầu crontab'], ['`Permission denied`', 'Script thiếu quyền thực thi (`chmod +x`)', '`chmod +x script`'], ['Chạy nhưng sai thư mục / không thấy file', 'cwd là home, không phải thư mục dự án', '`cd /duong/dan && lenh`, hoặc dùng đường dẫn tuyệt đối trong script'], ['Lệnh bị cắt dở, lỗi `unexpected EOF`', 'Ký tự `%` trong crontab có nghĩa là xuống dòng', 'Thoát bằng `\\%`: `date +\\%F`'], ['`[[: not found`, cú pháp bash lỗi', 'cron dùng `sh` (dash), không phải bash', 'Dòng `SHELL=/bin/bash` ở đầu crontab, hoặc để shebang trong script']] },
    { pre: ['SHELL=/bin/bash', 'PATH=/usr/local/bin:/usr/bin:/bin', 'MAILTO=""', '', '0 2 * * * /home/ubuntu/bin/backup >> /home/ubuntu/backups/backup.log 2>&1'], cap: 'Đầu crontab: đặt môi trường rõ ràng' }
  ] },
  { tag: 'Thực hành', title: 'Ghi log và gỡ lỗi job cron', body: [
    'Đầu ra của job cron không hiện ở đâu cả (cron định gửi mail, thường không có MTA nên bị bỏ). Luôn chuyển hướng ra log:',
    { pre: ['*/5 * * * * /home/ubuntu/bin/job >> /home/ubuntu/logs/job.log 2>&1', '', 'sudo grep CRON /var/log/syslog | tail      # cron có chạy lệnh không (dòng CMD)', 'sudo journalctl -u cron | tail            # (Ubuntu: dịch vụ tên cron)', 'tail -f ~/logs/job.log                     # kết quả bên trong', 'logger -t myjob "bắt đầu"                  # script tự ghi vào syslog'], cap: 'Log' },
    { ul: ['Dòng `CRON[...]: (user) CMD (...)` trong syslog chứng tỏ cron **đã khởi chạy**; không có dòng đó nghĩa là cron không đọc được dòng lịch (sai cú pháp, sai trường)', 'Có dòng CMD mà không thấy kết quả: lỗi nằm trong lệnh; đọc file log, chạy lại đúng lệnh trong môi trường tối thiểu', 'Mẹo tái hiện môi trường cron: `env -i HOME=$HOME PATH=/usr/bin:/bin /bin/sh -c \'lệnh\'`'] },
    { note: 'Dùng `date +\\%F` trong crontab (có dấu `\\`), nhưng bên trong script bash chỉ cần `date +%F`.', kind: 'tip' }
  ] },
  { tag: 'Công cụ', title: 'systemd timer: lựa chọn hiện đại thay cron', body: [
    'Một **timer** là unit `.timer` kích hoạt một unit `.service` cùng tên. So với cron: log nằm trong `journalctl`, có `Persistent=` để chạy bù khi máy tắt, giới hạn tài nguyên, phụ thuộc dịch vụ khác, và thấy rõ lần chạy tiếp theo.',
    { pre: ['# /etc/systemd/system/backup.service', '[Unit]', 'Description=Sao lưu dữ liệu', '', '[Service]', 'Type=oneshot', 'ExecStart=/home/ubuntu/bin/backup', '', '# /etc/systemd/system/backup.timer', '[Unit]', 'Description=Sao lưu mỗi đêm', '', '[Timer]', 'OnCalendar=*-*-* 02:00:00', 'Persistent=true', '', '[Install]', 'WantedBy=timers.target'], cap: 'Cặp service + timer' },
    { pre: ['sudo systemctl daemon-reload', 'sudo systemctl enable --now backup.timer   # chú ý: bật .timer, không phải .service', 'systemctl list-timers                      # lần chạy tới / lần vừa rồi', 'sudo systemctl start backup.service        # chạy thử ngay, không chờ lịch', 'journalctl -u backup.service | tail', 'systemd-analyze calendar "Mon *-*-* 09:00"   # kiểm tra biểu thức lịch'], cap: 'Vận hành' },
    { tbl: [['`OnCalendar=`', 'Nghĩa'], ['`daily` hoặc `*-*-* 00:00:00`', 'mỗi ngày lúc 0h'], ['`*-*-* 02:00:00`', '02:00 mỗi ngày'], ['`Mon..Fri *-*-* 09:00`', '9h các ngày làm việc'], ['`*:0/15`', 'mỗi 15 phút'], ['`OnBootSec=5min`', '5 phút sau khi khởi động (kiểu "tương đối")']] },
    { note: 'ExecStart bắt buộc dùng đường dẫn **tuyệt đối** (systemd không tìm trong PATH theo kiểu shell). Script thiếu `chmod +x` làm service lỗi `status=203/EXEC`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Cấu trúc script: tham số, getopts, hàm', body: [
    { pre: ['#!/bin/bash', 'usage() { echo "dùng: $0 [-n TÊN] [-v] file"; }', 'name=world; verbose=0', 'while getopts "n:vh" opt; do', '  case $opt in', '    n) name=$OPTARG ;;', '    v) verbose=1 ;;', '    h) usage; exit 0 ;;', '    *) usage; exit 1 ;;', '  esac', 'done', 'shift $((OPTIND-1))          # bỏ các tùy chọn, còn lại là đối số vị trí', '[ $# -ge 1 ] || { usage; exit 1; }', 'echo "hello $name file=$1 v=$verbose"'], cap: 'Khung script có tùy chọn' },
    { tbl: [['Biến', 'Ý nghĩa'], ['`$0` `$1` `$2`', 'tên script, đối số 1, 2'], ['`$#`', 'số đối số'], ['`"$@"`', 'tất cả đối số, giữ nguyên từng cái (luôn đặt trong ngoặc kép)'], ['`$?`', 'mã thoát của lệnh trước'], ['`$$` `$!`', 'PID của chính script / của job nền gần nhất']] },
    { pre: ['for f in *.log; do echo "xử lý $f"; done', 'i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done', 'while read -r line; do echo "[$line]"; done < file.txt', 'arr=(a b c); echo ${#arr[@]} ${arr[1]}; for x in "${arr[@]}"; do echo $x; done', 'backup() { local d=$1; echo "backup $d"; return 0; }; backup data', '[ -f f ] && echo có; [[ $USER == hai* ]] && echo khớp'], cap: 'Vòng lặp, mảng, hàm, điều kiện' },
    { ul: ['`getopts "n:v"`: chữ cái có dấu `:` theo sau nhận một giá trị, đọc từ `$OPTARG`', '`local` giữ biến trong phạm vi hàm', '`bash -n script.sh` kiểm tra cú pháp không chạy; `bash -x script.sh` in từng lệnh khi chạy (gỡ lỗi)'] }
  ] },
  { tag: 'An toàn', title: 'set -euo pipefail: dừng khi có lỗi', body: [
    'Mặc định bash **cứ chạy tiếp** sau lệnh lỗi. Với job không người trông, đó là thảm hoạ: `cd` thất bại rồi `rm -rf *` chạy ở thư mục sai. Đầu script hãy đặt:',
    { pre: ['#!/bin/bash', 'set -euo pipefail'], cap: 'Dòng bảo hiểm' },
    { tbl: [['Cờ', 'Tác dụng', 'Ví dụ'], ['`-e`', 'Thoát ngay khi một lệnh trả mã khác 0', '`cp a b` lỗi thì dừng'], ['`-u`', 'Dùng biến chưa gán là lỗi', '`rm -rf "$DIR/"` với `$DIR` rỗng'], ['`-o pipefail`', 'Pipeline thất bại nếu **bất kỳ** khâu nào thất bại (mặc định chỉ tính khâu cuối)', '`tar ... | gzip > out` ']] },
    { ul: ['Lệnh được phép lỗi: `cmd || true`, hoặc đặt trong `if cmd; then ...`', '`-e` không áp dụng trong điều kiện `if`, `while`, và vế trái của `&&`/`||`', 'Giá trị mặc định cho biến có thể rỗng: `${VAR:-mặc định}`'] },
    { note: 'Không có `pipefail`, `tar czf - dta | cat > out.tgz` báo thành công (mã của `cat`) dù `tar` đã lỗi và file ra rỗng. Bản sao lưu rỗng nhưng log vẫn ghi "ok" là kiểu lỗi đau nhất.', kind: 'err' }
  ] },
  { tag: 'An toàn', title: 'trap: dọn dẹp dù script thất bại', body: [
    'Script tạo file tạm, file khoá hoặc đổi trạng thái nên có bước dọn dẹp chắc chắn chạy, kể cả khi lỗi hay bị Ctrl+C:',
    { pre: ['#!/bin/bash', 'set -euo pipefail', 'tmp=$(mktemp -d)', 'cleanup() { echo "dọn dẹp"; rm -rf "$tmp"; }', 'trap cleanup EXIT           # chạy khi script kết thúc, bất kể lý do', 'trap \'echo bị ngắt; exit 130\' INT TERM', 'echo "làm việc trong $tmp"'], cap: 'trap + mktemp' },
    { tbl: [['Tín hiệu giả / thật', 'Khi nào'], ['`EXIT`', 'Mọi lối thoát (kể cả `set -e`, `exit n`)'], ['`INT`', 'Ctrl+C'], ['`TERM`', '`kill PID` thường, systemd stop'], ['`ERR`', 'Mỗi khi lệnh trả mã lỗi (hợp với `set -E`)']] },
    { ul: ['`mktemp` / `mktemp -d` tạo file / thư mục tạm tên ngẫu nhiên, an toàn hơn `/tmp/file` cố định', '`SIGKILL` (9) không bắt được, nên `trap` không chạy; vì vậy file khoá nên có cơ chế tự hết hạn (xem `flock` bên dưới)'] }
  ] },
  { tag: 'An toàn', title: 'flock và tính idempotent: chống chạy chồng', body: [
    'Job mỗi phút nhưng lần chạy dài 3 phút thì sau vài phút có nhiều bản cùng ghi một file: hỏng dữ liệu. `flock` lấy một **khoá** trên file; bản thứ hai không lấy được thì thoát luôn (`-n`).',
    { pre: ['# trong crontab: gói cả lệnh', '* * * * * flock -n /tmp/report.lock /home/ubuntu/bin/report.sh >> /home/ubuntu/logs/report.log 2>&1', '', '# trong script: giữ khoá suốt thời gian script chạy', 'exec 9>/tmp/job.lock', 'flock -n 9 || { echo "đang có bản khác chạy"; exit 1; }', 'echo "chạy job"'], cap: 'Hai cách dùng flock' },
    { ul: ['Khoá tự nhả khi tiến trình giữ nó kết thúc, kể cả bị `kill -9`: tốt hơn kiểu "tạo file .pid rồi xoá" (file còn sót lại làm job không chạy nữa)', '`flock` không có `-n` thì **chờ** tới khi được khoá', 'Hãy viết job **idempotent**: chạy hai lần cho cùng kết quả như chạy một lần (ghi đè hoặc đặt tên theo ngày, `mkdir -p`, `rsync` thay vì nối thêm vô hạn)'] }
  ] },
  { tag: 'Tổng kết', title: 'Checklist job chạy tự động', body: [
    { ul: ['Đường dẫn **tuyệt đối** cho lệnh, script và file (hoặc `cd` tường minh); script có `chmod +x` và shebang', 'Đầu crontab: `SHELL=`, `PATH=`, `MAILTO=""` nếu cần', 'Mọi job có `>> file.log 2>&1`; script dùng `logger -t` hoặc ghi log có thời gian (`date +%F_%H%M`)', 'Trong script: `set -euo pipefail`, `trap ... EXIT`, `mktemp`, kiểm tra tham số, trả mã thoát đúng', 'Job có thể chạy chồng thì bọc `flock -n`', 'Thử bằng tay trong môi trường tối thiểu trước, rồi chờ lần chạy đầu và đọc log', 'Dùng systemd timer khi cần `Persistent=`, phụ thuộc dịch vụ, log tập trung; dùng cron khi cần đơn giản và quen thuộc', 'Sao lưu mà không từng thử **khôi phục** thì chưa phải là sao lưu'] },
    { note: 'Một đêm nào đó job chạy sai là điều chắc chắn xảy ra. Việc của bạn là để lại đủ dấu vết (log, mã thoát) để sáng hôm sau biết ngay nó sai ở đâu.', kind: 'tip' }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`crontab -l`", "crontab -l: chưa có lịch nào nên báo không có crontab.", "no crontab for haidangphan"], ["`echo '* * * * * date >> /home/haidangphan/backups/heartbeat.log' | crontab -`", "Cài job chạy mỗi phút, ghi giờ vào heartbeat.log. Lệnh không in gì.", "(không in ra)"], ["`sleep 180`", "Chờ 180 giây để cron chạy vài lần.", "(không in ra)"], ["`cat /home/haidangphan/backups/heartbeat.log`", "Xem heartbeat.log: có nhiều dòng giờ, mỗi phút một dòng.", "Tue Oct 27 10:21:00 +07 2026 / Tue Oct 27 10:22:00 +07 2026 / Tue Oct 27 10:23:00 +07 2026"], ["`sudo grep CRON /var/log/syslog | tail -3`", "Xem syslog các dòng CRON gần nhất (cần sudo).", "Oct 27 10:21:00 vps CRON[2218]: (haidangphan) CMD (date >> /home/haidangphan/backups/heartbeat.log) / Oct 27 10:22:00 vps CRON[2220]: (ha…"], ["`(crontab -l; echo '0 2 * * * /home/haidangphan/work/scripts/deploy.sh >> /home/haidangphan/backups/deploy.log 2>&1') | crontab -`", "Nối thêm job deploy vào crontab, giữ job cũ.", "(không in ra)"], ["`crontab -l > cron.txt`", "Xuất crontab hiện tại ra cron.txt để sửa an toàn.", "[cron.txt] * * * * * date >> /home/haidangphan/backups/heartbeat.log / 0 2 * * * /home/haidangphan/work/scripts/deploy.sh >> /home/haidan…"], ["`(echo 'PATH=/usr/local/bin:/usr/bin:/bin'; echo 'MAILTO=\"\"'; cat cron.txt) > cron2.txt`", "Tạo cron2.txt có hai dòng môi trường rồi nội dung cron.txt.", "[cron2.txt] PATH=/usr/local/bin:/usr/bin:/bin / MAILTO=\"\" / * * * * * date >> /home/haidangphan/backups/heartbeat.log / 0 2 * * * /home/h…"], ["`crontab cron2.txt`", "Nạp cron2.txt làm crontab mới.", "(không in ra)"], ["`echo 'bad line' | crontab -`", "Nạp dòng sai cú pháp: cron báo lỗi và không cài.", "crontab: installing new crontab / \"stdin\":1: bad command / errors in crontab file, can't install."], ["`ls -l ~/bin/mybackup`", "Kiểm tra mybackup có quyền thực thi trong ~/bin.", "-rwxr-xr-x 1 haidangphan haidangphan 43 Oct 27 10:20 /home/haidangphan/bin/mybackup"], ["`echo '0 1 * * * /home/haidangphan/bin/mybackup >> /home/haidangphan/backups/mybackup.log 2>&1' | crontab -`", "Thay toàn bộ crontab bằng job duy nhất lúc 1 giờ sáng, gọi đường dẫn tuyệt đối.", "(không in ra)"], ["`date +%F_%H%M`", "In thời gian theo định dạng tên file.", "2026-10-27_1023"], ["`date -d \"7 days ago\" +%F`", "Ngày của 7 ngày trước.", "2026-10-20"], ["`logger -t myjob \"bat dau\"`", "logger ghi một dòng vào syslog với thẻ myjob.", "(không in ra)"], ["`sudo grep myjob /var/log/syslog`", "Tìm lại dòng myjob trong syslog.", "Oct 27 10:23:00 vps myjob[3201]: bat dau"], ["`systemctl list-timers`", "Liệt kê các timer của systemd và thời điểm chạy tiếp theo.", "NEXT                           LEFT          LAST                           PASSED      UNIT                  ACTIVATES / Tue 2026-10-27 …"], ["`sudo tee /etc/systemd/system/backup.service <<'EOF' …`", "Tạo file service bằng sudo tee và heredoc nháy đơn; $ giữ nguyên.", "[Unit] / Description=Backup /  / [Service] / Type=oneshot / ExecStart=/home/haidangphan/bin/mybackup"], ["`sudo tee /etc/systemd/system/backup.timer <<'EOF' …`", "Tạo file timer chạy lúc 02:00 hằng ngày.", "[Unit] / Description=Backup hang dem /  / [Timer] / OnCalendar=*-*-* 02:00:00 / Persistent=true /  / [Install] / WantedBy=timers.target"], ["`sudo systemctl daemon-reload`", "Nạp lại cấu hình systemd sau khi thêm file.", "(không in ra)"], ["`sudo systemctl enable --now backup.timer`", "enable --now bật timer và khởi động ngay; systemd tạo liên kết để tự chạy khi boot.", "Created symlink /etc/systemd/system/timers.target.wants/backup.timer → /etc/systemd/system/backup.timer."], ["`systemctl list-timers | grep backup`", "Lọc timer backup trong danh sách.", "Wed 2026-10-28 02:00:00 +07    15h 37min leftTue 2026-10-27 10:23:00 +07    0s ago      backup.timer          backup.service"], ["`sudo systemctl start backup.service`", "Chạy thử service ngay, không chờ lịch.", "(không in ra)"], ["`journalctl -u backup.service | tail -3`", "journalctl -u xem nhật ký của service backup; tail -3 lấy 3 dòng cuối.", "Oct 27 10:23:00 vps systemd[1]: Starting backup.service - Backup... / Oct 27 10:23:00 vps backup[2227]: mybackup 2026-10-27 ok / Oct 27 1…"], ["`systemd-analyze calendar \"*-*-* 02:00:00\"`", "systemd-analyze calendar kiểm tra biểu thức lịch và cho biết lần chạy tiếp theo.", "Original form: *-*-* 02:00:00 / Normalized form: *-*-* 02:00:00 /     Next elapse: Wed 2026-10-28 02:00:00 +07 /        (in UTC): Tue 202…"], ["`cat > greet.sh <<'EOF' …`", "Tạo greet.sh bằng heredoc: có set -euo pipefail, hàm usage và getopts.", "[greet.sh] #!/bin/bash / set -euo pipefail / usage() { echo \"dung: $0 [-n NAME] [-v] file\"; } / name=world; verbose=0 / while getopts \"n:…"], ["`chmod +x greet.sh`", "Cấp quyền chạy cho greet.sh.", "(không in ra)"], ["`./greet.sh -n Dang -v data.txt`", "Chạy greet.sh với -n và -v: getopts đọc các tham số.", "hello Dang file=data.txt v=1"], ["`./greet.sh; echo rc=$?`", "Gọi không đối số để thấy hàm usage và mã thoát 1.", "dung: ./greet.sh [-n NAME] [-v] file / rc=1"], ["`bash -n greet.sh`", "bash -n chỉ kiểm tra cú pháp, không chạy script.", "(không in ra)"], ["`for f in *.txt; do echo \"file: $f\"; done`", "Vòng for lặp qua các file .txt và in tên mỗi file.", "file: cron.txt / file: cron2.txt / file: notes.txt"], ["`arr=(a b c); echo ${#arr[@]}`", "Mảng arr có 3 phần tử; ${#arr[@]} là số phần tử.", "3"], ["`cat > p.sh <<'EOF' …`", "Tạo p.sh có trap cleanup EXIT để xoá lock khi thoát; lệnh không in gì.", "[p.sh] #!/bin/bash / set -euo pipefail / cleanup() { echo \"don dep\"; rm -f /tmp/mylock; } / trap cleanup EXIT / touch /tmp/mylock / exit 3"], ["`bash p.sh; echo rc=$?; ls /tmp/mylock`", "Chạy p.sh: in don dep từ cleanup, mã thoát 3, và lock đã bị xoá.", "don dep / rc=3 / ls: cannot access '/tmp/mylock': No such file or directory"], ["`flock -n /tmp/x.lock echo \"got lock\"`", "flock -n lấy khoá không chờ; lấy được khoá nên lệnh echo chạy.", "got lock"], ["`cat > l.sh <<'EOF' …`", "Tạo l.sh giữ khoá bằng exec 9 và flock -n 9; lệnh không in gì.", "[l.sh] #!/bin/bash / exec 9>/tmp/job.lock / flock -n 9 // { echo \"dang co ban khac chay\"; exit 1; } / echo \"chay job\" / sleep 1"], ["`bash l.sh`", "Chạy l.sh: lấy được khoá nên in chay job.", "chay job"], ["`echo '*/10 * * * * flock -n /tmp/backup.lock /home/haidangphan/bin/mybackup >> /home/haidangphan/backups/mybackup.log 2>&1' | crontab -`", "Cron chạy mỗi 10 phút, flock -n đảm bảo không có hai bản chạy cùng lúc.", "(không in ra)"]]}]});
T.quiz = C.QZ(12, [
  ['Biểu thức cron `*/15 9-17 * * 1-5` có nghĩa gì?', 'Mỗi 15 phút, từ 9h đến 17h, các ngày thứ 2 đến thứ 6', ['Mỗi 15 giờ, từ ngày 9 đến 17 hằng tháng', 'Lúc 9:15 và 17:15 mỗi ngày', 'Mỗi 15 phút, mọi ngày trong tuần'], 'Trường 1 là phút (bước 15), trường 2 là giờ (9-17), trường 5 là thứ (1-5 = thứ 2 đến thứ 6).'],
  ['Dòng nào chạy lúc 02:30 mỗi Chủ nhật?', '`30 2 * * 0`', ['`2 30 * * 0`', '`30 2 0 * *`', '`0 2 30 * *`'], 'Thứ tự là phút, giờ, ngày, tháng, thứ. Chủ nhật là 0 (hoặc 7) ở trường thứ.'],
  ['Bạn chạy `echo \'0 3 * * * /bin/job\' | crontab -` trên máy đã có crontab nhiều dòng. Điều gì xảy ra?', 'Toàn bộ crontab cũ bị thay bằng một dòng này', ['Dòng mới được nối vào cuối', 'Lệnh báo lỗi vì crontab đã tồn tại', 'Chỉ dòng đầu tiên bị thay'], '`crontab -` nạp và ghi đè. Muốn nối thêm: `(crontab -l; echo "..."; ) | crontab -`.'],
  ['Script chạy tốt khi gõ tay nhưng qua cron báo `mybackup: not found`. Nguyên nhân khả dĩ nhất?', '`PATH` của cron chỉ có `/usr/bin:/bin`, không chứa thư mục `~/bin`', ['Cron không chạy được script bash', 'Tên script quá dài', 'Chưa khởi động lại máy'], 'Dùng đường dẫn tuyệt đối hoặc đặt `PATH=` ở đầu crontab.'],
  ['Trong crontab, vì sao `date +%F` cho kết quả lạ còn `date +\\%F` thì đúng?', 'Trong crontab, `%` chưa thoát có nghĩa là xuống dòng và cắt lệnh', ['`%F` không phải định dạng hợp lệ', 'Cron không hỗ trợ lệnh `date`', 'Dấu `\\` làm ngày theo múi giờ UTC'], 'Phải thoát `\\%` trong dòng crontab; bên trong script thì không cần.'],
  ['Dòng nào chứng minh cron **đã khởi chạy** job của bạn?', '`CRON[...]: (user) CMD (lệnh)` trong `/var/log/syslog`', ['File `/etc/crontab` có dòng đó', '`crontab -l` có dòng đó', '`systemctl status cron` hiện `active`'], 'Có dòng CMD là cron đã chạy; kết quả/lỗi của chính lệnh thì phải đọc file log bạn đã chuyển hướng tới.'],
  ['Khác biệt quan trọng của `Persistent=true` trong systemd timer?', 'Nếu máy tắt đúng lúc đến hạn, lần chạy bị lỡ sẽ được chạy bù khi bật lại', ['Timer chạy lại liên tục không nghỉ', 'Timer tự bật sau khi reboot mà không cần `enable`', 'Service chạy với quyền root'], 'cron thường bỏ lỡ job khi máy tắt; timer có `Persistent=` thì chạy bù.'],
  ['Bạn đã tạo `backup.service` và `backup.timer`. Lệnh nào bật lịch chạy vĩnh viễn?', '`sudo systemctl enable --now backup.timer`', ['`sudo systemctl enable --now backup.service`', '`sudo systemctl start backup.timer` (chỉ một lần)', '`sudo crontab backup.timer`'], 'Bật `.timer`; `.service` được timer kích hoạt. Cũng đừng quên `daemon-reload` sau khi tạo/sửa file unit.'],
  ['Trong script, `getopts "n:v" opt` cho phép gọi thế nào, và giá trị của `-n` nằm ở đâu?', '`./s.sh -n Dang -v`; giá trị trong `$OPTARG`', ['`./s.sh -n -v Dang`; giá trị trong `$1`', '`./s.sh n v`; giá trị trong `$opt`', 'Chỉ nhận `-nv`; không có giá trị đi kèm'], 'Dấu `:` sau `n` nghĩa là `-n` cần một đối số, được gán vào `$OPTARG`. Sau vòng lặp dùng `shift $((OPTIND-1))`.'],
  ['`tar czf - dir | gzip > out.gz` khi thư mục `dir` không tồn tại. Không có `pipefail`, `$?` sẽ là?', '0, vì pipeline lấy mã thoát của khâu cuối (`gzip`) và nó thành công', ['2, mã lỗi của `tar`', '1, do pipeline luôn lỗi nếu có stderr', 'Không xác định'], 'Với `set -o pipefail` pipeline mới trả mã của khâu lỗi đầu tiên.'],
  ['Đặt `trap cleanup EXIT` ở đầu script thì `cleanup` chạy khi nào?', 'Khi script kết thúc, dù thành công, lỗi do `set -e` hay `exit n`', ['Chỉ khi nhấn Ctrl+C', 'Chỉ khi script thành công', 'Không bao giờ nếu có `set -e`'], 'EXIT là tín hiệu giả của bash chạy ở mọi lối thoát (trừ khi bị SIGKILL).'],
  ['Job chạy mỗi phút nhưng đôi khi mất 3 phút. Cách chống chạy chồng gọn nhất?', '`* * * * * flock -n /tmp/job.lock /đường/dẫn/job`', ['Đặt `sleep 180` ở cuối script', 'Đổi lịch thành `*/3 * * * *`', 'Chạy `kill -9` các bản cũ mỗi phút'], '`flock -n` thoát ngay nếu khoá đang bị giữ; khoá tự nhả khi tiến trình giữ nó kết thúc.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Xem crontab của bạn (hiện chưa có gì).', hint: 'crontab -l', check: A(/^crontab -l$/) },
    { text: 'Cài một job chạy **mỗi phút**: ghi giờ hiện tại vào `/home/haidangphan/backups/heartbeat.log`. Dùng `echo ... | crontab -`.', hint: "echo '* * * * * date >> /home/haidangphan/backups/heartbeat.log' | crontab -", check: function (s) { return /^\* \* \* \* \* date >> \/home\/haidangphan\/backups\/heartbeat\.log$/m.test(cron(s)); }, transient: true },
    { text: 'Xác nhận lại bằng `crontab -l`.', hint: 'crontab -l', check: OK(/^crontab -l$/) },
    { text: 'Chờ 3 phút (mô phỏng bằng `sleep 180`) rồi đọc file `heartbeat.log`.', hint: 'sleep 180\ncat /home/haidangphan/backups/heartbeat.log', check: AND(OK(/^sleep 180$/), OK(/^cat \/home\/haidangphan\/backups\/heartbeat\.log$/)) },
    { text: 'Xem cron đã ghi gì vào syslog: lọc dòng `CRON`, lấy 3 dòng cuối (cần `sudo`).', hint: 'sudo grep CRON /var/log/syslog | tail -3', check: AND(OK(/^sudo grep CRON \/var\/log\/syslog$/), OK(/^tail -3$/)) },
    { text: 'Nối thêm một job thứ hai **mà không mất dòng cũ**: `0 2 * * *` chạy `/home/haidangphan/work/scripts/deploy.sh`, log vào `/home/haidangphan/backups/deploy.log` (nhớ `2>&1`).', hint: "(crontab -l; echo '0 2 * * * /home/haidangphan/work/scripts/deploy.sh >> /home/haidangphan/backups/deploy.log 2>&1') | crontab -", check: function (s) { var t = cron(s); return /heartbeat\.log/.test(t) && /^0 2 \* \* \* \/home\/haidangphan\/work\/scripts\/deploy\.sh >> \S+deploy\.log 2>&1$/m.test(t); }, transient: true },
    { text: 'Xuất crontab ra file `cron.txt` trong thư mục hiện tại (cách sửa an toàn).', hint: 'crontab -l > cron.txt', check: function (s) { return /deploy\.sh/.test(ftxt(s, s.home + '/work/cron.txt')); } },
    { text: 'Tạo `cron2.txt` gồm hai dòng môi trường `PATH=/usr/local/bin:/usr/bin:/bin` và `MAILTO=""` rồi tới nội dung `cron.txt`; nạp nó bằng `crontab cron2.txt`.', hint: "(echo 'PATH=/usr/local/bin:/usr/bin:/bin'; echo 'MAILTO=\"\"'; cat cron.txt) > cron2.txt\ncrontab cron2.txt", check: function (s) { var t = cron(s); return /^PATH=\/usr\/local\/bin:\/usr\/bin:\/bin$/m.test(t) && /^MAILTO=""$/m.test(t) && /heartbeat\.log/.test(t); }, transient: true },
    { text: 'Thử nạp một dòng sai cú pháp (`bad line`) để thấy cron từ chối và giữ nguyên crontab cũ.', hint: "echo 'bad line' | crontab -", check: FAIL(/^crontab -$/) },
    { text: 'Xem script `mybackup` có thật trong `~/bin` và có quyền `x` không (thư mục này không nằm trong PATH của cron).', hint: 'ls -l ~/bin/mybackup', check: OK(/^ls -l \/home\/haidangphan\/bin\/mybackup$/) },
    { text: 'Thay toàn bộ crontab bằng một job duy nhất lúc 01:00 gọi `mybackup` bằng **đường dẫn tuyệt đối** `/home/haidangphan/bin/mybackup`, log vào `/home/haidangphan/backups/mybackup.log`.', hint: "echo '0 1 * * * /home/haidangphan/bin/mybackup >> /home/haidangphan/backups/mybackup.log 2>&1' | crontab -", check: function (s) { return /^0 1 \* \* \* \/home\/haidangphan\/bin\/mybackup >> \S+mybackup\.log 2>&1$/m.test(cron(s)); }, transient: true },
    { text: 'In ngày hiện tại theo dạng tên file `năm-tháng-ngày_giờphút` (định dạng `%F_%H%M`).', hint: 'date +%F_%H%M', check: OK(/^date \+%F_%H%M$/) },
    { text: 'In ngày của **7 ngày trước** bằng `date -d`.', hint: 'date -d "7 days ago" +%F', check: OK(/^date -d 7 days ago \+%F$/) },
    { text: 'Ghi một dòng vào syslog bằng `logger -t myjob "bat dau"`, rồi tìm lại bằng `sudo grep myjob /var/log/syslog`.', hint: 'logger -t myjob "bat dau"\nsudo grep myjob /var/log/syslog', check: AND(OK(/^logger -t myjob bat dau$/), OK(/^sudo grep myjob \/var\/log\/syslog$/)) },
    { text: 'Xem danh sách timer đang có của systemd.', hint: 'systemctl list-timers', check: OK(/^systemctl list-timers/) },
    { text: 'Tạo `/etc/systemd/system/backup.service` (Type=oneshot, `ExecStart=/home/haidangphan/bin/mybackup`) bằng `sudo tee` + heredoc.', hint: "sudo tee /etc/systemd/system/backup.service <<'EOF'\n[Unit]\nDescription=Backup\n\n[Service]\nType=oneshot\nExecStart=/home/haidangphan/bin/mybackup\nEOF", check: function (s) { var t = ftxt(s, '/etc/systemd/system/backup.service'); return /Type=oneshot/.test(t) && /ExecStart=\/home\/haidangphan\/bin\/mybackup/.test(t); } },
    { text: 'Tạo `/etc/systemd/system/backup.timer` với `OnCalendar=*-*-* 02:00:00`, `Persistent=true` và phần `[Install]` `WantedBy=timers.target`.', hint: "sudo tee /etc/systemd/system/backup.timer <<'EOF'\n[Unit]\nDescription=Backup hang dem\n\n[Timer]\nOnCalendar=*-*-* 02:00:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\nEOF", check: function (s) { var t = ftxt(s, '/etc/systemd/system/backup.timer'); return /OnCalendar=\*-\*-\* 02:00:00/.test(t) && /Persistent=true/.test(t) && /WantedBy=timers\.target/.test(t); } },
    { text: 'Nạp lại cấu hình systemd, rồi bật và chạy timer ngay (`enable --now`).', hint: 'sudo systemctl daemon-reload\nsudo systemctl enable --now backup.timer', check: AND(OK(/^sudo systemctl daemon-reload$/), OK(/^sudo systemctl enable --now backup\.timer$/)) },
    { text: 'Xác nhận timer đã vào danh sách: `systemctl list-timers` lọc `backup`.', hint: 'systemctl list-timers | grep backup', check: AND(OK(/^systemctl list-timers$/), OK(/^grep backup$/)) },
    { text: 'Chạy thử ngay service (không chờ lịch) và xem 3 dòng cuối nhật ký của nó.', hint: 'sudo systemctl start backup.service\njournalctl -u backup.service | tail -3', check: AND(OK(/^sudo systemctl start backup\.service$/), OK(/^journalctl -u backup\.service$/)) },
    { text: 'Kiểm tra biểu thức lịch `*-*-* 02:00:00` bằng `systemd-analyze calendar`.', hint: 'systemd-analyze calendar "*-*-* 02:00:00"', check: OK(/^systemd-analyze calendar \*-\*-\* 02:00:00$/) },
    { text: 'Tạo script `greet.sh` (trong `~/work`) có `set -euo pipefail`, hàm `usage`, `getopts "n:vh"` và in `hello $name file=$1 v=$verbose`. Dùng heredoc.', hint: "cat > greet.sh <<'EOF'\n#!/bin/bash\nset -euo pipefail\nusage() { echo \"dung: $0 [-n NAME] [-v] file\"; }\nname=world; verbose=0\nwhile getopts \"n:vh\" opt; do\n  case $opt in\n    n) name=$OPTARG ;;\n    v) verbose=1 ;;\n    h) usage; exit 0 ;;\n    *) usage; exit 1 ;;\n  esac\ndone\nshift $((OPTIND-1))\n[ $# -ge 1 ] || { usage; exit 1; }\necho \"hello $name file=$1 v=$verbose\"\nEOF", check: function (s) { var t = ftxt(s, s.home + '/work/greet.sh'); return /set -euo pipefail/.test(t) && /getopts/.test(t) && /usage\(\)/.test(t); } },
    { text: 'Cấp quyền chạy và gọi `./greet.sh -n Dang -v data.txt`.', hint: 'chmod +x greet.sh\n./greet.sh -n Dang -v data.txt', check: OK(/^echo hello Dang file=data\.txt v=1$/) },
    { text: 'Gọi `./greet.sh` không đối số để thấy hàm `usage` và mã thoát 1.', hint: './greet.sh; echo rc=$?', check: AND(OK(/^echo dung:/), OK(/^echo rc=1$/)) },
    { text: 'Kiểm tra cú pháp `greet.sh` mà không chạy.', hint: 'bash -n greet.sh', check: OK(/^bash -n greet\.sh$/) },
    { text: 'Duyệt các file `.txt` trong thư mục hiện tại bằng vòng `for` và in `file: TÊN` cho mỗi file.', hint: 'for f in *.txt; do echo "file: $f"; done', check: OK(/^echo file: notes\.txt$/) },
    { text: 'Tạo mảng `arr=(a b c)` và in số phần tử của nó.', hint: 'arr=(a b c); echo ${#arr[@]}', check: OK(/^echo 3$/) },
    { text: 'Viết `p.sh` có `trap cleanup EXIT`: hàm `cleanup` xoá `/tmp/mylock`; script tạo lock, rồi `exit 3`. Chạy bằng `bash p.sh` và kiểm tra lock đã biến mất.', hint: "cat > p.sh <<'EOF'\n#!/bin/bash\nset -euo pipefail\ncleanup() { echo \"don dep\"; rm -f /tmp/mylock; }\ntrap cleanup EXIT\ntouch /tmp/mylock\nexit 3\nEOF\nbash p.sh; echo rc=$?; ls /tmp/mylock", check: function (s) { return /trap cleanup EXIT/.test(ftxt(s, s.home + '/work/p.sh')) && histN(s, /^rm -f \/tmp\/mylock$/) > 0 && !s.fs.get('/tmp/mylock'); } },
    { text: 'Thử `flock -n` với một file khoá tạm: chạy `echo "got lock"` trong khoá `/tmp/x.lock`.', hint: 'flock -n /tmp/x.lock echo "got lock"', check: OK(/^flock -n \/tmp\/x\.lock echo got lock$/) },
    { text: 'Viết `l.sh` dùng `exec 9>/tmp/job.lock` và `flock -n 9 || { ...; exit 1; }` rồi chạy nó.', hint: "cat > l.sh <<'EOF'\n#!/bin/bash\nexec 9>/tmp/job.lock\nflock -n 9 || { echo \"dang co ban khac chay\"; exit 1; }\necho \"chay job\"\nsleep 1\nEOF\nbash l.sh", check: function (s) { var t = ftxt(s, s.home + '/work/l.sh'); return /exec 9>/.test(t) && /flock -n 9/.test(t) && histN(s, /^echo chay job$/) > 0; } },
    { text: 'Hoàn thiện: thay crontab bằng job mỗi 10 phút chạy `mybackup` **bọc trong `flock -n /tmp/backup.lock`**, log vào `/home/haidangphan/backups/mybackup.log`.', hint: "echo '*/10 * * * * flock -n /tmp/backup.lock /home/haidangphan/bin/mybackup >> /home/haidangphan/backups/mybackup.log 2>&1' | crontab -", check: function (s) { return /^\*\/10 \* \* \* \* flock -n \/tmp\/backup\.lock \/home\/haidangphan\/bin\/mybackup >> \S+mybackup\.log 2>&1$/m.test(cron(s)); } }
  ]
};

T.debugs = [
  {
    id: 'lb8d1', title: 'Cron không chạy được script backup',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ tail -3 ~/backups/cron.log', '/bin/sh: 1: /home/haidangphan/work/scripts/backup.sh: Permission denied', '/bin/sh: 1: /home/haidangphan/work/scripts/backup.sh: Permission denied', '$ ls ~/backups', '(không có bản sao lưu mới nào từ nhiều ngày nay)'),
    story: 'Bạn đặt cron chạy `backup.sh` mỗi 5 phút. Gõ tay `bash backup.sh` thì chạy được, nhưng qua cron thì log toàn "Permission denied" và không có bản sao lưu mới.',
    goal: 'Để cron chạy được `backup.sh` (giữ nguyên dòng lịch trong crontab).',
    hints: ['Dòng lịch trong `crontab -l` gọi script trực tiếp bằng đường dẫn. Điều gì cần có ở file để gọi trực tiếp được? Xem `ls -l`.', '`backup.sh` có quyền `-rw-r--r--`: không có bit `x`. `bash backup.sh` chạy được vì bash chỉ đọc file, nhưng cron thực thi nó trực tiếp.', '`chmod +x /home/haidangphan/work/scripts/backup.sh`, rồi `ls -l` kiểm tra có `x`. Đợi một chu kỳ (`sleep 300`) và đọc lại `cron.log`.'],
    fix: ['crontab -l', 'ls -l /home/haidangphan/work/scripts/backup.sh', 'chmod +x /home/haidangphan/work/scripts/backup.sh', 'ls -l /home/haidangphan/work/scripts/backup.sh'],
    cause: 'cron thực thi dòng lệnh như một lệnh bình thường, nên script cần quyền thực thi (`chmod +x`) và dòng shebang `#!/bin/bash`. Chạy bằng `bash script` bỏ qua yêu cầu này nên dễ tưởng script "không lỗi". Cách phòng: luôn thử bằng đúng dòng lệnh trong crontab, và để log `>> file 2>&1` để thấy lỗi như thế này.',
    setup: function (s) { base(s, { setup2: function (s3) {
      s3.W.lin.cron[s3.user] = '*/5 * * * * /home/haidangphan/work/scripts/backup.sh >> /home/haidangphan/backups/cron.log 2>&1\n';
      LB.put(s3, s3.home + '/backups/cron.log', '/bin/sh: 1: /home/haidangphan/work/scripts/backup.sh: Permission denied\n/bin/sh: 1: /home/haidangphan/work/scripts/backup.sh: Permission denied\n', {});
    } }); },
    check: function (s) { return (mode(s, s.home + '/work/scripts/backup.sh') & 73) > 0 && /backup\.sh/.test(cron(s)); }
  },
  {
    id: 'lb8d2', title: 'Cron báo "mybackup: not found"',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ~/bin/mybackup', 'mybackup 2026-10-27 ok', '$ tail -2 ~/backups/mybackup.log', '/bin/sh: 1: mybackup: not found', '/bin/sh: 1: mybackup: not found'),
    story: 'Script `mybackup` (nằm trong `~/bin`) chạy ngon khi bạn gõ tay, nhưng job cron 01:00 chỉ ghi "not found" vào log mỗi đêm.',
    goal: 'Sửa crontab để job gọi được `mybackup` (vẫn chạy 01:00 và ghi log vào `mybackup.log`).',
    hints: ['Cron tìm `mybackup` ở đâu? Thử `echo $PATH` và `ls -l ~/bin/mybackup`: thư mục `~/bin` có nằm trong PATH tối thiểu của cron không?', '`~/bin` được thêm vào PATH trong `~/.profile` mà cron không đọc. PATH của cron chỉ có `/usr/bin:/bin`.', 'Sửa dòng cron để dùng đường dẫn tuyệt đối: `/home/haidangphan/bin/mybackup`. Dùng `crontab -l > c.txt`, sửa, `crontab c.txt`, hoặc `echo ... | crontab -` (job duy nhất).'],
    fix: ['crontab -l', "echo '0 1 * * * /home/haidangphan/bin/mybackup >> /home/haidangphan/backups/mybackup.log 2>&1' | crontab -", 'crontab -l'],
    cause: 'cron không chạy shell đăng nhập nên không đọc `.profile`/`.bashrc`; PATH của nó rất ngắn. Quy tắc vàng: trong crontab (và unit systemd) luôn dùng **đường dẫn tuyệt đối**, hoặc đặt `PATH=` ở đầu crontab.',
    setup: function (s) { base(s, { setup2: function (s3) {
      s3.W.lin.cron[s3.user] = '0 1 * * * mybackup >> /home/haidangphan/backups/mybackup.log 2>&1\n';
      s3.W.lin.cronLocal = ['mybackup'];
      LB.put(s3, s3.home + '/backups/mybackup.log', '/bin/sh: 1: mybackup: not found\n/bin/sh: 1: mybackup: not found\n', {});
    } }); },
    check: function (s) { return /^0 1 \* \* \* \/home\/haidangphan\/bin\/mybackup\b/m.test(cron(s)); }
  },
  {
    id: 'lb8d3', title: 'Báo cáo chạy chồng chéo, server nặng dần',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ps aux | grep report.sh | grep -v grep', 'haidang+  4301  ... /bin/bash /home/haidangphan/bin/report.sh', 'haidang+  4302  ... /bin/bash /home/haidangphan/bin/report.sh', 'haidang+  4303  ... /bin/bash /home/haidangphan/bin/report.sh', '$ uptime', ' load average: 2.80, 2.10, 1.40'),
    story: 'Job `report.sh` chạy **mỗi phút** nhưng mỗi lần mất khoảng 3 phút, nên trên máy luôn có vài bản chạy cùng lúc, cùng ghi `report.log`, và tải ngày càng cao.',
    goal: 'Sửa dòng cron để job không bao giờ chạy chồng (vẫn mỗi phút, vẫn ghi log).',
    hints: ['Cron không biết lần chạy trước đã xong hay chưa; nó cứ đến giờ là chạy. Cần một cơ chế "chỉ một bản tại một thời điểm".', 'Công cụ chuẩn là `flock`: `flock -n /tmp/report.lock LỆNH` bỏ qua lần chạy mới nếu khoá đang bị giữ.', 'Bọc lệnh trong crontab: `* * * * * flock -n /tmp/report.lock /home/haidangphan/bin/report.sh >> /home/haidangphan/backups/report.log 2>&1`, nạp lại bằng `crontab -`.'],
    fix: ['crontab -l', "echo '* * * * * flock -n /tmp/report.lock /home/haidangphan/bin/report.sh >> /home/haidangphan/backups/report.log 2>&1' | crontab -", 'crontab -l'],
    cause: 'Job dài hơn chu kỳ lịch sẽ chồng lên nhau. `flock -n` lấy khoá không chờ: bản mới thấy khoá đang bị giữ thì thoát ngay. Khoá do kernel giữ nên tự nhả khi tiến trình chết (kể cả `kill -9`), khác kiểu file `.pid` dễ bị sót. Cách khác: tăng chu kỳ cho vượt thời gian chạy, hoặc dùng systemd timer vì service `oneshot` không chạy chồng chính nó.',
    setup: function (s) { base(s, { setup2: function (s3) {
      s3.W.lin.cron[s3.user] = '* * * * * /home/haidangphan/bin/report.sh >> /home/haidangphan/backups/report.log 2>&1\n';
      [4301, 4302, 4303].forEach(function (pid) {
        V.lin.addProc(s3, { pid: pid, user: s3.user, cmd: '/bin/bash /home/haidangphan/bin/report.sh', name: 'report.sh', ppid: 1, cpu: 0.2, mem: 0.1, rss: 3000, vsz: 9000, stat: 'S', tty: '?' });
      });
    } }); },
    check: function (s) { return /^\* \* \* \* \* flock -n \S+ \/home\/haidangphan\/bin\/report\.sh\b/m.test(cron(s)); }
  },
  {
    id: 'lb8d4', hard: true, title: 'Log báo "backup ok" nhưng bản sao lưu rỗng',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ tail -2 ~/backups/nightly.log', 'backup ok 2026-10-25', 'backup ok 2026-10-26', '$ ls -l ~/backups/data-*.tgz', '-rw-r--r-- 1 haidangphan haidangphan 0 Oct 26 02:00 /home/haidangphan/backups/data-2026-10-26.tgz'),
    story: 'Script `nightly.sh` chạy hằng đêm và luôn ghi "backup ok", nhưng khi cần khôi phục bạn phát hiện file `.tgz` có kích thước 0. Script có một lỗi gõ nhầm đường dẫn, và cấu trúc của nó che giấu mọi thất bại.',
    goal: 'Sửa `~/work/scripts/nightly.sh` để (1) dừng ngay khi có lỗi (`set -euo pipefail`), (2) sửa đường dẫn sai, rồi chạy lại để có file `.tgz` hợp lệ (kích thước > 0) cho hôm nay.',
    hints: ['Đọc script bằng `cat`. Lệnh `tar` chạy ở đâu, và điều gì xảy ra nếu nó lỗi? `echo "backup ok"` ở cuối có phụ thuộc vào kết quả `tar` không?', 'Hai lỗi: (a) thư mục nguồn gõ nhầm `dta` thay vì `data`; (b) `tar ... | cat > file` che mã lỗi của `tar` vì mặc định pipeline chỉ lấy mã khâu cuối, và script không có `set -e`.', 'Viết lại script: thêm `set -euo pipefail` sau shebang, sửa `dta` thành `data`, chạy lại `~/work/scripts/nightly.sh` và kiểm tra `ls -l ~/backups/data-*.tgz` có kích thước > 0.'],
    fix: ["cat > /home/haidangphan/work/scripts/nightly.sh <<'EOF'\n#!/bin/bash\nset -euo pipefail\nBACKUP_DIR=$HOME/backups\nLOG=$BACKUP_DIR/nightly.log\nSRC=$HOME/work/data\nOUT=$BACKUP_DIR/data-$(date +%F).tgz\nmkdir -p \"$BACKUP_DIR\"\ntar czf - \"$SRC\" | cat > \"$OUT\"\necho \"backup ok $(date +%F)\" >> \"$LOG\"\nEOF", '/home/haidangphan/work/scripts/nightly.sh', 'ls -l /home/haidangphan/backups'],
    cause: 'Ba lỗi chồng lên nhau: đường dẫn sai, pipeline không có `pipefail` (mã thoát của `tar` bị `cat` nuốt), và không có `set -e` nên `echo "backup ok"` vẫn chạy. Kết quả là một hệ thống sao lưu "xanh" nhưng vô dụng. Nền tảng của script chạy tự động: `set -euo pipefail`, kiểm tra kết quả (kích thước file, `tar tzf` thử), chỉ ghi "ok" khi mọi bước trước đã thành công, và thỉnh thoảng thử khôi phục thật.',
    setup: function (s) { base(s, { setup2: function (s3) {
      LB.put(s3, s3.home + '/work/scripts/nightly.sh', '#!/bin/bash\nBACKUP_DIR=$HOME/backups\nLOG=$BACKUP_DIR/nightly.log\nSRC=$HOME/work/dta\nOUT=$BACKUP_DIR/data-$(date +%F).tgz\nmkdir -p $BACKUP_DIR\ntar czf - $SRC | cat > $OUT\necho "backup ok $(date +%F)" >> $LOG\n', { mode: 493 });
      LB.put(s3, s3.home + '/backups/nightly.log', 'backup ok 2026-10-25\nbackup ok 2026-10-26\n', {});
      LB.put(s3, s3.home + '/backups/data-2026-10-26.tgz', '', {});
    } }); },
    check: function (s) {
      var t = ftxt(s, s.home + '/work/scripts/nightly.sh'), n = s.fs.get(s.home + '/backups/data-2026-10-27.tgz');
      return /set -[a-z]*e[a-z]*u?[a-z]*o? ?pipefail|set -euo pipefail/.test(t) && /pipefail/.test(t) && !/\bdta\b/.test(t) && !!n && (n.size || String(n.c || '').length) > 0;
    }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
