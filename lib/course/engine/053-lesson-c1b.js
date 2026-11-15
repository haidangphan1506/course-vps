(function (G) {
'use strict';
/* Chương c1b: Dịch vụ và tiến trình (ps, tín hiệu, systemd, journalctl, cron, timer). */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, LIN = V.lin;
var ftxt = C.ftxt, uactive = C.uactive;

var UNIT = ['[Unit]', 'Description=Tutor API (NestJS)', 'After=network.target', '', '[Service]', 'User=tutor', 'WorkingDirectory=/srv/tutor', 'EnvironmentFile=/srv/tutor/.env', 'ExecStart=/usr/bin/node dist/main.js', 'Restart=always', 'RestartSec=3', '', '[Install]', 'WantedBy=multi-user.target'];
var UNIT_TXT = UNIT.join('\n') + '\n';
var BACKUP_SH = ['#!/bin/bash', 'echo "backup $(date +%F)" >> /var/lib/tutor/backup.log'];
var BSVC = ['[Unit]', 'Description=Sao luu thu muc du lieu tutor', '', '[Service]', 'Type=oneshot', 'User=tutor', 'ExecStart=/usr/local/bin/tutor-backup.sh'];
var BTIM = ['[Unit]', 'Description=Chay sao luu moi dem', '', '[Timer]', 'OnCalendar=*-*-* 02:30:00', 'Persistent=true', '', '[Install]', 'WantedBy=timers.target'];

function base(s, o) {
  o = o || {};
  C.linBase(s, { runaway: o.runaway !== false, setup: function (s2, l) { l.appReq = ['DATABASE_URL']; if (o.setup) o.setup(s2, l); } });
}
function writeUnit(s, name, lines) { s.fs.put('/etc/systemd/system/' + name, lines.join('\n') + '\n', { owner: 'root', mode: 420 }); }
var quiet = { out: function () {}, err: function () {}, sudo: true };

var D = {
  id: 'c1b', group: 'Nền tảng', short: 'Dịch vụ và tiến trình',
  title: 'Dịch vụ và tiến trình: ps, tín hiệu, systemd, journalctl, cron',
  dek: 'Biết ứng dụng đang chạy thế nào, dừng nó đúng cách, biến nó thành dịch vụ tự khởi động lại, đọc nhật ký khi lỗi và hẹn giờ chạy việc định kỳ.'
};
C.insertAfter('c1', D);

D.theory = [
  { tag: 'Khái niệm', title: 'Tiến trình: mỗi chương trình đang chạy là một PID', body: [
    'Khi bạn chạy `node dist/main.js`, hệ điều hành tạo một **tiến trình** với số định danh **PID**. Mỗi tiến trình có cha (**PPID**), chủ sở hữu (**user**), trạng thái và mức dùng CPU, RAM. Tiến trình đầu tiên (PID 1) là `systemd`, nó sinh ra mọi dịch vụ khác.',
    { pre: ['ps aux | head -5', 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND', 'root           1  0.0  0.6 167700 11800 ?        Ss   Oct25   0:00 /sbin/init', 'tutor       2231  0.6  3.4 1210000 71000 ?       Ssl  10:20   0:01 /usr/bin/node dist/main.js'], cap: 'Đọc một dòng ps aux' },
    { tbl: [['Cột', 'Ý nghĩa'], ['`USER`', 'Tài khoản chạy tiến trình; quyết định quyền truy cập file của nó'], ['`PID`', 'Số định danh; dùng cho `kill`'], ['`%CPU`, `%MEM`', 'Mức dùng. `%CPU` gần 100 kéo dài là dấu hiệu tiến trình chạy vòng lặp'], ['`STAT`', '`R` đang chạy, `S` đang ngủ chờ việc, `D` chờ ổ đĩa (không kill được ngay), `T` tạm dừng, `Z` zombie (đã chết nhưng cha chưa thu dọn)'], ['`COMMAND`', 'Dòng lệnh đầy đủ; thường đủ để biết đây là ứng dụng nào']] },
    { note: 'Ứng dụng NestJS của bạn trên VPS thực chất chỉ là một tiến trình `node`. "Deploy" nghĩa là đảm bảo tiến trình đó luôn chạy, đúng user, đúng thư mục, và tự dậy lại khi chết.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Quan sát: ps, top, pgrep, ss', body: [
    { pre: ['ps aux --sort=-%cpu | head -5      # 5 tiến trình tốn CPU nhất', 'ps -o pid,ppid,user,stat,cmd -p 3150  # chọn cột cho một PID', 'top -bn1 | head -15                  # ảnh chụp top, không tương tác', 'pgrep -a nginx                       # tìm PID theo tên, in cả dòng lệnh', 'sudo ss -tlnp                         # cổng đang lắng nghe và tiến trình giữ cổng', 'sudo ss -tlnp | grep :8888'], cap: 'Bộ lệnh quan sát' },
    { ul: ['`top` thật chạy tương tác (phím `q` thoát); trong script và trong khung thực hành này dùng `top -bn1`', '`htop` đẹp hơn nhưng cũng cần terminal tương tác; cài bằng `sudo apt install htop`', '`ss -tlnp`: `t` TCP, `l` listening, `n` số cổng, `p` tiến trình. Phần `users:` chỉ hiện đủ khi dùng `sudo`', 'Muốn biết "ai đang giữ cổng 8888": `sudo ss -tlnp | grep :8888` rồi `ps -o pid,user,cmd -p PID`'] }
  ] },
  { tag: 'Khái niệm', title: 'Tín hiệu: nhờ tiến trình dừng, hay ép nó dừng', body: [
    '`kill` không "giết" ngay: nó **gửi một tín hiệu**. Tiến trình tự quyết cách phản ứng với hầu hết tín hiệu (đóng kết nối, ghi nốt dữ liệu rồi thoát). Riêng `SIGKILL` thì hệ điều hành thực thi, tiến trình không kịp làm gì.',
    { tbl: [['Tín hiệu', 'Số', 'Ý nghĩa', 'Khi dùng'], ['`SIGTERM`', '15', 'Xin dừng lịch sự (mặc định của `kill`)', 'Luôn thử trước; app dọn dẹp rồi thoát'], ['`SIGINT`', '2', 'Giống Ctrl+C', 'Dừng chương trình chạy ở foreground'], ['`SIGHUP`', '1', 'Terminal đóng; nhiều dịch vụ hiểu là "đọc lại cấu hình"', '`kill -HUP PID` cho nginx, postgres'], ['`SIGKILL`', '9', 'Ép chết, không thể bắt hay bỏ qua', 'Chỉ khi TERM không có tác dụng'], ['`SIGSTOP`/`SIGCONT`', '19/18', 'Tạm dừng / chạy tiếp', 'Hiếm dùng']] },
    { pre: ['kill 3150            # = kill -15 (SIGTERM)', 'kill -9 3150         # SIGKILL', 'kill -HUP 905        # nginx đọc lại cấu hình', 'pkill -f main.js     # kill theo tên lệnh', 'kill -l              # liệt kê tín hiệu'], cap: 'Gửi tín hiệu' },
    { note: '**Quy tắc vàng:** `kill` (TERM) trước, chờ vài giây, kiểm tra bằng `ps`, rồi mới `kill -9`. `kill -9` bừa bãi bỏ qua bước dọn dẹp: file khoá còn lại (`*.pid`), dữ liệu ghi dở, kết nối DB không đóng.', kind: 'warn' },
    'Chỉ chủ sở hữu tiến trình (hoặc root) mới gửi được tín hiệu: `kill` tiến trình của user khác báo `Operation not permitted`; thêm `sudo`.'
  ] },
  { tag: 'Cú pháp', title: 'Chạy nền, thoát SSH vẫn sống: &, nohup, tmux', body: [
    { pre: ['sleep 300 &            # chạy nền; shell in [1] 2220', 'jobs                   # liệt kê job của phiên này', 'kill %1                # dừng job số 1', 'nohup node app.js &    # miễn nhiễm SIGHUP khi đóng SSH', 'tmux new -d -s work "sleep 900"   # phiên tmux chạy nền', 'tmux ls                # xem các phiên', 'tmux kill-session -t work'], cap: 'Ba mức chạy nền' },
    { ul: ['`&` chỉ tách khỏi dòng lệnh: đóng SSH thì tiến trình nhận **SIGHUP** và chết', '`nohup` bỏ qua SIGHUP, ghi đầu ra vào `nohup.out`', '`tmux`/`screen` giữ cả một phiên terminal, đăng nhập lại `tmux attach -t work` là thấy tiếp', 'Cả ba đều **không** tự dậy lại khi VPS khởi động lại hay app crash. Dịch vụ thật cần **systemd**'] },
    { tbl: [['Nhu cầu', 'Dùng'], ['Chạy thử vài phút khi đang SSH', '`&` hoặc `tmux`'], ['Giữ lệnh dài (build, import) khi mạng chập chờn', '`tmux`'], ['Ứng dụng chạy lâu dài, tự dậy lại', '`systemd` (hoặc PM2, Docker `--restart`)']] },
    { tag: '', title: '', body: [] }
  ].filter(function (b) { return !(b && b.tag === ''); }) },
  { tag: 'Khái niệm', title: 'nice và renice: chia công bằng CPU', body: [
    'Mỗi tiến trình có độ ưu tiên **nice** từ -20 (ưu tiên cao) đến 19 (nhường người khác). Mặc định 0. Một việc nặng nhưng không gấp (nén, build) nên chạy với nice cao để không làm app web chậm.',
    { pre: ['nice -n 10 tar czf backup.tgz /srv/tutor    # khởi chạy với nice 10', 'renice -n 10 -p 3150                       # hạ ưu tiên tiến trình đang chạy', 'ps -o pid,ni,%cpu,cmd -p 3150'], cap: 'Điều chỉnh ưu tiên' },
    { note: 'Người dùng thường chỉ được **tăng** số nice (nhường). Giảm số nice (ưu tiên hơn) cần `sudo`.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'systemd: người quản lý dịch vụ', body: [
    '`systemd` khởi động, theo dõi và dừng dịch vụ theo **unit** (file mô tả). Với ứng dụng của bạn, quan trọng nhất là unit loại `.service`; ngoài ra có `.timer` (hẹn giờ) và `.target` (nhóm khởi động).',
    { tbl: [['Vị trí', 'Dùng cho'], ['`/lib/systemd/system/`', 'Unit do gói cài (nginx, cron, ssh). Không sửa trực tiếp'], ['`/etc/systemd/system/`', 'Unit **do bạn viết** hoặc ghi đè. Đây là nơi đặt `tutor.service`'], ['`/etc/systemd/system/multi-user.target.wants/`', 'Các liên kết tạo bởi `systemctl enable` (khởi động cùng máy)']] },
    { pre: ['systemctl status cron              # trạng thái + 10 dòng log gần nhất', 'systemctl list-units --type=service  # dịch vụ đang nạp', 'systemctl list-timers               # timer và lần chạy tới'], cap: 'Xem' },
    'Sau khi **sửa hoặc tạo** file unit phải chạy `sudo systemctl daemon-reload` để systemd đọc lại. Không làm bước này, `start` vẫn dùng bản cũ và in cảnh báo.'
  ] },
  { tag: 'Cú pháp', title: 'systemctl: vòng đời của một dịch vụ', body: [
    { tbl: [['Lệnh', 'Tác dụng', 'Ghi chú'], ['`start` / `stop`', 'Bật / tắt ngay', 'Không ảnh hưởng lần khởi động sau'], ['`restart`', 'Tắt rồi bật', 'Có khoảng gián đoạn'], ['`reload`', 'Đọc lại cấu hình, không ngắt kết nối', 'Chỉ khi dịch vụ hỗ trợ (nginx có)'], ['`enable` / `disable`', 'Bật / tắt **tự khởi động cùng máy**', '`enable --now` = enable + start'], ['`status`', 'Xem tình trạng', 'Mã thoát 0 nếu chạy, 3 nếu không'], ['`is-active`, `is-enabled`', 'Chỉ in một từ', 'Dùng trong script'], ['`mask` / `unmask`', 'Chặn hẳn không cho start (kể cả khi dịch vụ khác gọi)', 'Mạnh hơn `disable`'], ['`reset-failed`', 'Xoá trạng thái `failed`', 'Sau khi đã sửa lỗi']] },
    { note: '`start` và `enable` là **hai việc khác nhau**. Đây là lỗi hay gặp nhất: dịch vụ chạy tốt, VPS khởi động lại, dịch vụ không dậy vì quên `enable`. Hãy luôn kiểm tra cả `is-active` lẫn `is-enabled`.', kind: 'warn' },
    { pre: ['sudo systemctl enable --now tutor     # bật ngay và cho tự chạy sau reboot', 'systemctl is-active tutor            # active', 'systemctl is-enabled tutor           # enabled'], cap: 'Cặp lệnh quen thuộc' }
  ] },
  { tag: 'Cú pháp', title: 'Viết unit cho ứng dụng NestJS', body: [
    'File `/etc/systemd/system/tutor.service`:',
    { pre: UNIT, cap: 'tutor.service' },
    { tbl: [['Khoá', 'Vai trò'], ['`Description`', 'Hiện trong `status` và log'], ['`After=network.target`', 'Chỉ bắt đầu sau khi mạng sẵn sàng (chỉ thứ tự, không bắt buộc phải có)'], ['`User=tutor`', 'Chạy bằng tài khoản thường, **không dùng root**'], ['`WorkingDirectory`', 'Thư mục hiện hành; `main.js` và đường dẫn tương đối tính từ đây'], ['`EnvironmentFile`', 'Nạp biến môi trường (`PORT`, `DATABASE_URL`) từ file; không đặt bí mật trong unit'], ['`ExecStart`', 'Lệnh chạy; **bắt buộc đường dẫn tuyệt đối** (`/usr/bin/node`, không phải `node`)'], ['`Restart=always`, `RestartSec=3`', 'Tự chạy lại sau 3 giây khi tiến trình chết'], ['`WantedBy=multi-user.target`', 'Điều kiện để `enable` hoạt động: gắn vào mức khởi động bình thường']] },
    { pre: ['sudo systemctl daemon-reload', 'sudo systemctl enable --now tutor', 'systemctl status tutor', 'curl localhost:8888/health'], cap: 'Nạp và chạy' },
    { note: 'Dùng `systemd-analyze verify /etc/systemd/system/tutor.service` để bắt lỗi cú pháp trước khi start (khoá viết sai, đường dẫn `ExecStart` không tồn tại).', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'journalctl: đọc nhật ký của dịch vụ', body: [
    'Mọi thứ dịch vụ in ra (stdout, stderr) systemd gom vào **journal**. Không cần tự ghi file log.',
    { pre: ['journalctl -u tutor                    # toàn bộ log của dịch vụ', 'journalctl -u tutor -n 20 --no-pager     # 20 dòng cuối', 'journalctl -u tutor -f                 # theo dõi trực tiếp (Ctrl+C thoát)', "journalctl -u tutor --since '10 min ago'", 'journalctl -u tutor -p err             # chỉ lỗi trở lên', 'journalctl -b                          # từ lần khởi động hiện tại', 'sudo journalctl --disk-usage'], cap: 'Bộ lọc thường dùng' },
    { ul: ['`-u` lọc theo unit; `-p err` lọc theo mức (emerg, alert, crit, err, warning, notice, info, debug)', 'User thường chỉ xem được log của mình: thêm `sudo` hoặc vào nhóm `systemd-journal`', 'Khi `status` báo `failed`, đọc **dòng lỗi đầu tiên** trong `journalctl -u ...`, không phải dòng cuối cùng'] }
  ] },
  { tag: 'Cú pháp', title: 'cron: hẹn giờ kiểu cổ điển', body: [
    'Mỗi dòng crontab gồm **5 trường thời gian** rồi lệnh:',
    { pre: ['# phút giờ ngày-tháng tháng thứ   lệnh', '*/5  *   *         *     *      /usr/bin/node /srv/tutor/jobs/sync.js', '30   2   *         *     1-5    /usr/local/bin/backup.sh', '0    */6 *         *     *      curl -fsS https://example.com/ping', '@reboot                           /usr/local/bin/warm-cache.sh'], cap: 'Ví dụ' },
    { tbl: [['Trường', 'Giá trị', 'Ký hiệu'], ['Phút', '0-59', '`*` mọi giá trị, `*/5` mỗi 5, `1,15` liệt kê, `1-5` khoảng'], ['Giờ', '0-23', 'như trên'], ['Ngày trong tháng', '1-31', 'Nếu cả ngày-tháng và thứ cùng khác `*`, chạy khi **một trong hai** khớp'], ['Tháng', '1-12', ''], ['Thứ', '0-7 (0 và 7 là Chủ nhật)', '']] },
    { pre: ['crontab -l                  # xem của user hiện tại', 'echo "*/5 * * * * date >> /tmp/c.log" | crontab -    # nạp từ stdin', 'sudo crontab -u tutor -l       # xem của user khác', 'ls /etc/cron.d/                # cron cấp hệ thống, có thêm cột USER', 'sudo grep CRON /var/log/syslog | tail   # nhật ký cron'], cap: 'Quản lý crontab' },
    { note: '`crontab -e` mở trình soạn thảo; trong khung thực hành này dùng dạng `crontab -l`, sửa, rồi `crontab -` hoặc `crontab file`. Gõ nhầm `crontab -r` là **xoá sạch** crontab không hỏi lại.', kind: 'warn' },
    { ul: ['File trong `/etc/cron.d/` có dạng `phút giờ ngày tháng thứ USER lệnh` (thêm tên user), và tên file không được có dấu chấm', 'Dấu `%` trong lệnh cron có nghĩa đặc biệt (xuống dòng): phải viết `\\%`, ví dụ `date +\\%F`', 'Output của lệnh cron bị bỏ nếu không chuyển hướng: luôn thêm `>> /đường/dẫn.log 2>&1`'] }
  ] },
  { tag: 'Lưu ý', title: 'Vì sao "chạy tay được nhưng cron không chạy"', body: [
    'Cron chạy lệnh với môi trường **gần như trống**: `PATH=/usr/bin:/bin`, `HOME` đặt sẵn, **không đọc** `.bashrc`, không có biến bạn `export` trong terminal. Mọi khác biệt giữa "gõ tay" và "cron" đều quy về đây.',
    { tbl: [['Triệu chứng trong log', 'Nguyên nhân', 'Cách sửa'], ['`node: not found`', 'Thư mục chứa `node` (nvm, `/usr/local/bin`) không nằm trong PATH của cron', 'Dùng đường dẫn tuyệt đối `/usr/bin/node` hoặc đặt `PATH=...` ở đầu crontab'], ['Biến `DATABASE_URL` rỗng', 'Cron không nạp `.env`', 'Nạp trong lệnh: `set -a; . /srv/tutor/.env; set +a; node ...`'], ['`Permission denied`', 'Chạy bằng user khác với lúc thử tay', '`sudo crontab -u tutor -e` hoặc dùng `/etc/cron.d/` với cột user'], ['Không có dòng nào trong log', 'Sai cú pháp 5 trường, hoặc `%` chưa thoát', 'Xem `grep CRON /var/log/syslog`']] },
    { pre: ['PATH=/usr/local/bin:/usr/bin:/bin', 'MAILTO=""', '*/5 * * * * cd /srv/tutor && /usr/bin/node jobs/sync.js >> /var/log/tutor-sync.log 2>&1'], cap: 'Đặt PATH và chuyển hướng log ngay đầu crontab' }
  ] },
  { tag: 'Cú pháp', title: 'systemd timer so với cron', body: [
    'Timer là cách hẹn giờ của systemd: một file `.timer` kích hoạt một file `.service` cùng tên. Ưu điểm: log nằm trong journal, thấy được lần chạy tiếp theo, `Persistent=true` chạy bù nếu máy tắt đúng giờ hẹn.',
    { pre: ['# /etc/systemd/system/tutor-backup.service', '[Service]', 'Type=oneshot', 'User=tutor', 'ExecStart=/usr/local/bin/tutor-backup.sh', '', '# /etc/systemd/system/tutor-backup.timer', '[Timer]', 'OnCalendar=*-*-* 02:30:00', 'Persistent=true', '', '[Install]', 'WantedBy=timers.target'], cap: 'Cặp .service (oneshot) + .timer' },
    { pre: ['sudo systemctl daemon-reload', 'sudo systemctl enable --now tutor-backup.timer     # bật TIMER, không phải service', 'systemctl list-timers', "systemd-analyze calendar 'Mon *-*-* 03:00:00'   # kiểm tra biểu thức OnCalendar", 'sudo systemctl start tutor-backup.service          # chạy thử ngay'], cap: 'Dùng timer' },
    { tbl: [['Tiêu chí', 'cron', 'systemd timer'], ['Cấu hình', '1 dòng', '2 file'], ['Log', 'syslog, dễ mất nếu không chuyển hướng', 'journal, đọc bằng `journalctl -u`'], ['Môi trường', 'Trống, hay lỗi PATH', 'Do unit khai báo rõ'], ['Chạy bù khi tắt máy', 'Không (cần anacron)', '`Persistent=true`'], ['Biết lần chạy tới', 'Không', '`systemctl list-timers`']] }
  ] },
  { tag: 'Bảng tra', title: 'Bảng triệu chứng, nguyên nhân và lệnh kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân thường gặp', 'Lệnh kiểm tra', 'Cách sửa'], ['`status`: `failed (Result: exit-code)`', 'Ứng dụng tự thoát khi khởi động', '`journalctl -u tutor -n 30`', 'Sửa lỗi nêu trong log rồi `restart`'], ['`status`: `203/EXEC`', '`ExecStart` sai đường dẫn hoặc file không có quyền thực thi', '`systemd-analyze verify`, `ls -l`', 'Dùng đường dẫn tuyệt đối, `chmod +x`'], ['`status`: `200/CHDIR`', '`WorkingDirectory` không tồn tại', '`ls -ld` thư mục đó', 'Sửa đường dẫn, `daemon-reload`'], ['`status`: `217/USER`', '`User=` không tồn tại', '`getent passwd tutor`', 'Sửa tên user'], ['Chạy tốt, reboot xong mất', 'Chưa `enable`', '`systemctl is-enabled tutor`', '`sudo systemctl enable tutor`'], ['`activating (auto-restart)` lặp mãi', 'App chết ngay sau khi chạy, `Restart=always` cứ thử lại', '`journalctl -u tutor -f`', 'Tìm lỗi gốc; `start-limit-hit` thì `reset-failed` rồi start'], ['`EADDRINUSE`', 'Cổng đã có tiến trình khác giữ', '`sudo ss -tlnp | grep :8888`', 'Dừng tiến trình/unit thừa'], ['Sửa unit mà không đổi gì', 'Chưa `daemon-reload`', 'Cảnh báo "changed on disk"', '`sudo systemctl daemon-reload`'], ['Cron không chạy', 'PATH trống, `%`, sai cú pháp', '`grep CRON /var/log/syslog`', 'Đường dẫn tuyệt đối, chuyển hướng log']] }
  ] },
  { tag: 'Quy trình', title: 'Checklist cuối chương: dịch vụ đạt chuẩn production', body: [
    { ul: ['**1.** Chạy bằng user riêng (`User=tutor`), không phải root', '**2.** `ExecStart` dùng đường dẫn tuyệt đối; `WorkingDirectory` đúng', '**3.** Bí mật nằm trong `EnvironmentFile` quyền 600, không nằm trong unit', '**4.** `Restart=always` (hoặc `on-failure`) có `RestartSec`', '**5.** `systemctl is-enabled` = `enabled` **và** `is-active` = `active`', '**6.** `systemd-analyze verify` sạch trước khi nạp', '**7.** Log đọc được bằng `journalctl -u`, đã thử `-f` lúc có lỗi', '**8.** Dừng tiến trình bằng TERM trước KILL; file khoá `*.pid` không còn sót', '**9.** Tác vụ định kỳ: đường dẫn tuyệt đối, đã chuyển hướng log, đã thử bằng `sleep 60` rồi xem log', '**10.** Đã **reboot thử** một lần để chắc mọi thứ tự dậy'] },
    { note: 'Bài học đắt giá nhất: một dịch vụ chưa từng được reboot thử là dịch vụ chưa chắc chạy lại. Hãy thử vào giờ ít người dùng, không phải lúc sự cố.', kind: 'tip' }
  ] }
];

D.quiz = C.QZ(1, [
  ['`kill 3150` (không kèm số tín hiệu) gửi tín hiệu nào?', '`SIGTERM` (15), yêu cầu dừng lịch sự để ứng dụng kịp dọn dẹp', ['`SIGKILL` (9), ép chết ngay lập tức', '`SIGHUP` (1), yêu cầu đọc lại cấu hình', '`SIGSTOP` (19), tạm dừng tiến trình'], 'Mặc định của `kill` là SIGTERM. SIGKILL phải ghi rõ `-9` và không thể bắt hay bỏ qua.'],
  ['Vì sao nên `kill` thường trước rồi mới `kill -9`?', 'TERM cho ứng dụng cơ hội ghi nốt dữ liệu, đóng kết nối, xoá file khoá; KILL bỏ qua tất cả', ['TERM mạnh hơn KILL nên giải quyết triệt để hơn', 'KILL chỉ dùng được với tiến trình của root', 'Hai lệnh giống nhau, chỉ khác tên gọi'], 'KILL do hệ điều hành thực thi tức thì, tiến trình không chạy được dòng mã nào nữa, nên hay để lại `*.pid`, dữ liệu ghi dở.'],
  ['Bạn chạy `node app.js &` rồi đóng cửa sổ SSH. Chuyện gì xảy ra?', 'Tiến trình nhận SIGHUP khi phiên đóng và thường bị dừng; cần `nohup`, `tmux` hoặc tốt hơn là systemd', ['Tiến trình tiếp tục chạy mãi vì có `&`', 'Tiến trình tự khởi động lại sau 5 giây', 'Hệ thống hỏi bạn có muốn giữ nó chạy không'], '`&` chỉ chạy nền trong phiên hiện tại. Dịch vụ lâu dài cần systemd.'],
  ['Dịch vụ `tutor` đang chạy tốt, VPS reboot xong thì không còn. Nguyên nhân phổ biến nhất?', 'Đã `start` nhưng chưa `enable`', ['Thiếu `RestartSec` trong unit', 'Đã dùng `reload` thay vì `restart`', 'Unit nằm trong `/etc/systemd/system`'], '`start` chỉ chạy ngay; `enable` mới tạo liên kết để systemd khởi động nó mỗi lần boot.'],
  ['Bạn sửa `tutor.service` rồi `systemctl restart tutor` nhưng không có gì đổi và có cảnh báo. Bước còn thiếu?', '`sudo systemctl daemon-reload` để systemd đọc lại file unit', ['`sudo systemctl enable tutor` lần nữa', 'Khởi động lại cả VPS', 'Xoá `/var/log/syslog`'], 'systemd giữ bản unit trong bộ nhớ. Sửa file xong phải reload trước khi start/restart.'],
  ['Trong unit, vì sao viết `ExecStart=node dist/main.js` bị lỗi?', 'systemd yêu cầu đường dẫn tuyệt đối tới chương trình, như `/usr/bin/node`', ['`node` là từ khoá dành riêng của systemd', 'Phải thêm `sudo` phía trước lệnh', 'ExecStart không được có đối số'], 'systemd không tìm trong PATH của shell. Báo lỗi `Neither a valid executable name nor an absolute path`.'],
  ['`status` hiện `Active: failed (Result: exit-code)` kèm `status=200/CHDIR`. Lỗi nằm ở đâu?', '`WorkingDirectory` trỏ tới thư mục không tồn tại', ['`User=` ghi sai tên tài khoản', 'Cổng 8888 đã bị chiếm', 'File `.env` thiếu biến'], 'CHDIR là bước đổi thư mục làm việc. `217/USER` mới là sai user, `203/EXEC` là sai lệnh.'],
  ['Muốn xem **lỗi** của `tutor` trong 10 phút qua, lệnh đúng là?', "`journalctl -u tutor -p err --since '10 min ago'`", ['`systemctl log tutor --errors`', '`cat /var/log/tutor.log | tail`', '`journalctl tutor --last 10`'], '`-u` chọn unit, `-p err` chọn mức lỗi, `--since` giới hạn thời gian.'],
  ['Dòng cron `*/15 9-17 * * 1-5 /usr/local/bin/sync.sh` chạy khi nào?', 'Mỗi 15 phút, từ 9h đến 17h59, các ngày thứ Hai đến thứ Sáu', ['Mỗi 15 giờ, vào các ngày làm việc', 'Mỗi 15 phút, mọi ngày trong tuần, đến 17h', 'Một lần lúc 9h15 mỗi ngày'], 'Trường 1 `*/15` là mỗi 15 phút; trường 2 `9-17` là giờ; trường 5 `1-5` là thứ 2 đến thứ 6.'],
  ['Script chạy được khi gõ tay nhưng cron báo `node: not found`. Nguyên nhân?', 'Cron có PATH tối thiểu (`/usr/bin:/bin`) nên không thấy `node` nằm ở thư mục khác', ['Cron không hỗ trợ Node.js', 'Script thiếu quyền ghi', 'Đồng hồ hệ thống sai múi giờ'], 'Dùng đường dẫn tuyệt đối `/usr/bin/node` hoặc đặt `PATH=` ở đầu crontab.'],
  ['Dòng cron `0 3 * * * tar czf /backup/$(date +%F).tgz /srv/tutor` chạy mà không tạo được file. Nghi ngờ đầu tiên?', 'Dấu `%` trong `+%F` bị cron hiểu là xuống dòng; phải viết `\\%F`', ['Cron không cho phép dùng `tar`', 'Phải đặt dòng lệnh trong dấu nháy kép', 'Thiếu `sudo` trước lệnh tar'], 'Trong crontab `%` là ký tự đặc biệt. Thoát bằng dấu gạch chéo ngược.'],
  ['Khác biệt quan trọng của `Persistent=true` trong timer?', 'Nếu máy tắt đúng giờ hẹn, timer chạy bù ngay khi máy bật lại', ['Timer chạy mỗi giây', 'Timer không bao giờ dừng', 'Timer lưu log vĩnh viễn'], 'Cron thường bỏ lỡ lượt chạy khi máy tắt; timer có Persistent thì không.'],
  ['`systemctl mask nginx` khác `disable` thế nào?', '`mask` chặn hẳn việc start (kể cả khi bị dịch vụ khác gọi); `disable` chỉ bỏ tự khởi động', ['`mask` xoá gói nginx khỏi máy', '`mask` chỉ ẩn dịch vụ khỏi danh sách', 'Hai lệnh hoàn toàn giống nhau'], '`mask` trỏ unit về `/dev/null`. Dùng khi muốn chắc chắn không ai (kể cả phụ thuộc) bật nó lên.'],
  ['`status` của `tutor` luôn hiện `activating (auto-restart)` và log lặp lại cùng một lỗi. Việc nên làm đầu tiên?', 'Đọc dòng lỗi gốc bằng `journalctl -u tutor`, vì `Restart=always` chỉ che việc app chết ngay khi khởi động', ['Tăng `RestartSec` lên thật lớn', 'Đổi `Restart=always` thành `Restart=no` rồi bỏ qua', 'Chạy `kill -9` cho đến khi hết lặp'], 'Restart tự động không sửa lỗi gốc. Nguyên nhân nằm trong log: thiếu biến môi trường, cổng bị chiếm, sai đường dẫn.']
]);

var CRONLINE = '* * * * * date >> /tmp/cron-test.log';
D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Xem 5 dòng đầu của danh sách tiến trình để làm quen các cột.', hint: 'ps aux | head -5', check: OK(/^ps aux/) },
    { text: 'Tìm tiến trình tốn CPU nhất. Một tiến trình chạy `yes` đang chiếm gần 100%.', hint: 'ps aux --sort=-%cpu | head -4', check: OK(/^ps aux --sort=-%cpu/) },
    { text: 'Xem tổng quan tải bằng ảnh chụp top (không tương tác).', hint: 'top -bn1 | head -12', check: OK(/^top -bn1/) },
    { text: 'Tìm PID của nginx kèm dòng lệnh.', hint: 'pgrep -a nginx', check: OK(/^pgrep -a nginx/) },
    { text: 'Hiện các cột chọn lọc cho PID 3150: PID, PPID, user, trạng thái, lệnh.', hint: 'ps -o pid,ppid,user,stat,cmd -p 3150', check: OK(/^ps -o pid,ppid,user,stat,cmd -p 3150/) },
    { text: 'Liệt kê các cổng đang lắng nghe cùng tiến trình giữ cổng.', hint: 'sudo ss -tlnp', check: OK(/ss -tlnp/) },
    { text: 'Dừng tiến trình `yes` ngốn CPU bằng tín hiệu lịch sự (TERM).', hint: 'kill 3150', check: function (s) { return !LIN.findPid(s, 3150) && s.hist.some(function (h) { return h.code === 0 && /^kill 3150$/.test(h.cmd); }); } },
    { text: 'Xác nhận tiến trình đã mất.', hint: 'ps -p 3150', check: A(/^ps -p 3150$/) },
    { text: 'Thử `kill` một tiến trình của root: phải bị từ chối (Operation not permitted).', hint: 'kill 640', check: FAIL(/^kill 640$/) },
    { text: 'Liệt kê các tín hiệu.', hint: 'kill -l', check: OK(/^kill -l/) },
    { text: 'Chạy một việc nền: ngủ 300 giây.', hint: 'sleep 300 &', transient: true, check: function (s) { return C.pidOf(s, 'sleep').some(function (p) { return p.job && !p.nohup; }); } },
    { text: 'Xem danh sách job của phiên.', hint: 'jobs', check: OK(/^jobs$/) },
    { text: 'Dừng job số 1.', hint: 'kill %1', check: function (s) { return !C.pidOf(s, 'sleep').some(function (p) { return p.job === 1; }) && s.hist.some(function (h) { return h.code === 0 && /^kill %1$/.test(h.cmd); }); } },
    { text: 'Chạy việc nền miễn nhiễm khi đóng SSH bằng nohup.', hint: 'nohup sleep 600 &', transient: true, check: function (s) { return C.pidOf(s, 'sleep').some(function (p) { return p.nohup; }); } },
    { text: 'Chạy việc nặng nền, rồi hạ ưu tiên (nice 10) bằng PID của job vừa chạy ($!).', hint: 'yes > /dev/null & renice -n 10 -p $!', transient: true, check: function (s) { return C.pidOf(s, 'yes').some(function (p) { return p.ni === 10; }); } },
    { text: 'Dừng việc nặng vừa chạy.', hint: 'kill $(pgrep -u haidangphan yes)', transient: true, check: function (s) { return !C.pidOf(s, 'yes').length && s.hist.some(function (h) { return h.code === 0 && /^kill \d+$/.test(h.cmd); }); } },
    { text: 'tmux chưa cài sẵn trên VPS: cài nó.', hint: 'sudo apt install -y tmux', check: OK(/^sudo apt install -y tmux/) },
    { text: 'Tạo phiên tmux chạy nền tên `work`.', hint: 'tmux new -d -s work "sleep 900"', transient: true, check: function (s) { return (s.W.lin.tmux || []).some(function (t) { return t.name === 'work'; }); } },
    { text: 'Liệt kê phiên tmux.', hint: 'tmux ls', check: OK(/^tmux ls/) },
    { text: 'Xoá phiên tmux `work`.', hint: 'tmux kill-session -t work', check: function (s) { return !(s.W.lin.tmux || []).some(function (t) { return t.name === 'work'; }) && s.hist.some(function (h) { return /^tmux kill-session/.test(h.cmd); }); } },
    { text: 'Xem trạng thái dịch vụ cron có sẵn: đọc dòng `Active` và `Main PID`.', hint: 'systemctl status cron', check: OK(/^systemctl status cron/) },
    { text: 'Xem thư mục ứng dụng NestJS (đã build sẵn ở `/srv/tutor`).', hint: 'ls -la /srv/tutor', check: OK(/^ls -la \/srv\/tutor/) },
    { text: 'Đọc biến môi trường của ứng dụng. File quyền 600 của user `tutor` nên cần sudo.', hint: 'sudo cat /srv/tutor/.env', check: OK(/^sudo cat \/srv\/tutor\/\.env/) },
    { text: 'Viết unit `tutor.service`: user `tutor`, thư mục `/srv/tutor`, nạp `.env`, tự chạy lại.', hint: C.HCS('/etc/systemd/system/tutor.service', UNIT), check: function (s) { var t = ftxt(s, '/etc/systemd/system/tutor.service'); return /^User=tutor$/m.test(t) && /^WorkingDirectory=\/srv\/tutor$/m.test(t) && /^EnvironmentFile=\/srv\/tutor\/\.env$/m.test(t) && /^ExecStart=\/usr\/bin\/node dist\/main\.js$/m.test(t) && /^Restart=always$/m.test(t) && /^WantedBy=multi-user\.target$/m.test(t); } },
    { text: 'Kiểm tra cú pháp unit trước khi nạp (phải sạch).', hint: 'systemd-analyze verify /etc/systemd/system/tutor.service', check: OK(/^systemd-analyze verify/) },
    { text: 'Cho systemd đọc lại các file unit.', hint: 'sudo systemctl daemon-reload', check: OK(/^sudo systemctl daemon-reload/) },
    { text: 'Khởi động dịch vụ.', hint: 'sudo systemctl start tutor', check: function (s) { return uactive(s, 'tutor.service'); } },
    { text: 'Xem `status`: có `Main PID`, `CGroup` và vài dòng log của Nest.', hint: 'systemctl status tutor', check: OK(/^systemctl status tutor/) },
    { text: 'Gọi thử điểm kiểm tra sức khoẻ của ứng dụng.', hint: 'curl localhost:8888/health', check: OK(/^curl localhost:8888\/health/) },
    { text: 'Xác nhận tiến trình giữ cổng 8888 là node chạy bởi `tutor`.', hint: 'sudo ss -tlnp | grep :8888', check: OK(/^grep :8888/) },
    { text: 'Cho dịch vụ tự khởi động cùng máy.', hint: 'sudo systemctl enable tutor', check: function (s) { var u = C.unit(s, 'tutor.service'); return !!u && u.enabled === 'enabled'; } },
    { text: 'Kiểm tra cả hai trạng thái: active và enabled.', hint: 'systemctl is-active tutor && systemctl is-enabled tutor', check: OK(/^systemctl is-enabled tutor/) },
    { text: 'Đọc 5 dòng log cuối của dịch vụ trong journal.', hint: 'journalctl -u tutor -n 5 --no-pager', check: OK(/^journalctl -u tutor -n 5/) },
    { text: 'Mô phỏng sự cố: ép chết tiến trình node của tutor (kill -9) và quan sát systemd dựng lại.', hint: 'sudo kill -9 $(pgrep -u tutor node)', transient: true, check: function (s) { var u = C.unit(s, 'tutor.service'); return !!u && (u.restarts || 0) >= 1 && u.active === 'active'; } },
    { text: 'Xem số lần khởi động lại và PID mới.', hint: 'systemctl show tutor -p NRestarts -p MainPID', check: OK(/^systemctl show tutor/) },
    { text: 'Reload nginx không ngắt kết nối (SIGHUP nội bộ).', hint: 'sudo systemctl reload nginx', check: OK(/^sudo systemctl reload nginx/) },
    { text: 'Viết script sao lưu và cho phép chạy.', hint: C.HCS('/usr/local/bin/tutor-backup.sh', BACKUP_SH) + '\nsudo chmod +x /usr/local/bin/tutor-backup.sh', check: function (s) { var n = s.fs.get('/usr/local/bin/tutor-backup.sh'); return !!n && (n.mode & 73) > 0 && /backup/.test(n.c); } },
    { text: 'Viết unit `tutor-backup.service` kiểu oneshot gọi script đó.', hint: C.HCS('/etc/systemd/system/tutor-backup.service', BSVC), check: function (s) { var t = ftxt(s, '/etc/systemd/system/tutor-backup.service'); return /^Type=oneshot$/m.test(t) && /^ExecStart=\/usr\/local\/bin\/tutor-backup\.sh$/m.test(t); } },
    { text: 'Viết `tutor-backup.timer` chạy 02:30 mỗi đêm.', hint: C.HCS('/etc/systemd/system/tutor-backup.timer', BTIM), check: function (s) { var t = ftxt(s, '/etc/systemd/system/tutor-backup.timer'); return /^OnCalendar=\*-\*-\* 02:30:00$/m.test(t) && /^WantedBy=timers\.target$/m.test(t); } },
    { text: 'Kiểm tra biểu thức lịch trước khi tin vào nó.', hint: "systemd-analyze calendar '*-*-* 02:30:00'", check: OK(/^systemd-analyze calendar/) },
    { text: 'Nạp lại và bật timer (không phải service) ngay.', hint: 'sudo systemctl daemon-reload && sudo systemctl enable --now tutor-backup.timer', check: function (s) { var u = C.unit(s, 'tutor-backup.timer'); return !!u && u.active === 'active' && u.enabled === 'enabled'; } },
    { text: 'Xem timer và lần chạy tiếp theo.', hint: 'systemctl list-timers', check: OK(/^systemctl list-timers/) },
    { text: 'Chạy thử công việc ngay, không chờ 02:30.', hint: 'sudo systemctl start tutor-backup.service', check: function (s) { return /backup 2026/.test(ftxt(s, '/var/lib/tutor/backup.log')); } },
    { text: 'Đọc log thử (file backup.log do script ghi).', hint: 'cat /var/lib/tutor/backup.log', check: OK(/^cat \/var\/lib\/tutor\/backup\.log/) },
    { text: 'Xem crontab hiện tại của bạn: sẽ báo chưa có.', hint: 'crontab -l', check: FAIL(/^crontab -l$/) },
    { text: 'Nạp một dòng cron chạy mỗi phút ghi giờ vào file.', hint: "echo '" + CRONLINE + "' | crontab -", transient: true, check: function (s) { var t = (s.W.lin.cron || {}).haidangphan || ''; return t.indexOf(CRONLINE) >= 0; } },
    { text: 'Chờ 2 phút (đồng hồ giả lập chạy nhanh) rồi xem file kết quả.', hint: 'sleep 120; cat /tmp/cron-test.log', check: function (s) { return ftxt(s, '/tmp/cron-test.log').split('\n').filter(Boolean).length >= 2 && s.hist.some(function (h) { return /^cat \/tmp\/cron-test\.log/.test(h.cmd); }); } },
    { text: 'Đọc nhật ký cron trong syslog để thấy lần chạy được ghi.', hint: 'sudo grep CRON /var/log/syslog | tail -3', check: OK(/^(sudo )?grep CRON/) },
    { text: 'Gỡ crontab thử nghiệm.', hint: 'crontab -r', check: function (s) { return (s.W.lin.cron || {}).haidangphan == null && s.hist.some(function (h) { return /^crontab -r/.test(h.cmd); }); } },
    { text: 'Thêm cron cấp hệ thống dọn file tạm hằng đêm (cột user là `tutor`).', hint: "echo '30 2 * * * tutor find /var/lib/tutor -name \"*.tmp\" -mtime +7 -delete' | sudo tee /etc/cron.d/tutor-cleanup", check: function (s) { return /^30 2 \* \* \* tutor find /m.test(ftxt(s, '/etc/cron.d/tutor-cleanup')); } },
    { text: 'Reboot thử cả hệ thống, rồi kiểm tra dịch vụ tự dậy và thời gian chạy bắt đầu lại.', hint: 'sudo reboot; uptime; systemctl is-active tutor', check: function (s) { var l = s.W.lin, u = C.unit(s, 'tutor.service'); return l.now - l.boot < 3600000 && !!u && u.active === 'active' && s.hist.some(function (h) { return /^uptime/.test(h.cmd); }); } }
  ]
};

D.debugs = [
  {
    id: 'c1b1', title: 'Reboot xong ứng dụng biến mất',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl localhost:8888/health', 'curl: (7) Failed to connect to localhost port 8888 after 0 ms: Couldn\'t connect to server', '', '$ uptime', ' 10:22:35 up 0 min,  1 user,  load average: 0.12, 0.13, 0.12', '', '$ systemctl is-active tutor', 'inactive'),
    story: 'Nhà cung cấp VPS vừa bảo trì và khởi động lại máy. Trước đó `tutor.service` chạy bình thường. Giờ nginx trả 502 vì không có gì lắng nghe ở cổng 8888.',
    goal: 'Dịch vụ `tutor` chạy lại ngay và sẽ tự chạy sau mọi lần reboot (cả `active` và `enabled`).',
    hints: ['Hỏi systemd hai câu: `systemctl is-active tutor` và `systemctl is-enabled tutor`. Câu nào trả lời sai?', 'Dịch vụ từng chạy (do `start` thủ công) nhưng chưa bao giờ được `enable`, nên reboot xong không ai khởi động nó.', 'Chạy `sudo systemctl enable --now tutor` rồi kiểm tra lại cả hai trạng thái.'],
    fix: ['systemctl is-active tutor', 'systemctl is-enabled tutor', 'sudo systemctl enable --now tutor', 'systemctl is-active tutor', 'systemctl is-enabled tutor'],
    cause: '`systemctl start` chỉ chạy ngay lúc đó. Muốn tự chạy sau reboot phải `enable` (tạo liên kết trong `multi-user.target.wants`). `enable --now` làm cả hai việc.',
    setup: function (s) { base(s, { runaway: false, setup: function (s2, l) { writeUnit(s2, 'tutor.service', UNIT); var u = LIN.ensureUnit(s2, 'tutor.service'); LIN.startUnit(s2, u); LIN.reboot(s2, quiet); } }); },
    check: function (s) { var u = C.unit(s, 'tutor.service'); return !!u && u.active === 'active' && u.enabled === 'enabled'; }
  },
  {
    id: 'c1b2', title: 'status: failed, status=200/CHDIR',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ systemctl status tutor', '× tutor.service - Tutor API (NestJS)', '     Active: activating (auto-restart) (Result: exit-code)', '    Process: ExecStart=/usr/bin/node dist/main.js (code=exited, status=200/CHDIR)', '', 'Oct 27 10:20:01 vps systemd[1]: tutor.service: Failed at step CHDIR spawning /usr/bin/node: No such file or directory'),
    story: 'Bạn chuyển ứng dụng từ `/srv/tutor-api` về `/srv/tutor` nhưng quên sửa unit. Dịch vụ cứ thử lại rồi thất bại.',
    goal: 'Sửa unit để dịch vụ `tutor` ở trạng thái `active (running)`.',
    hints: ['Đọc dòng lỗi: `Failed at step CHDIR`. Systemd không vào được thư mục làm việc.', 'Xem unit: `systemctl cat tutor` và so `WorkingDirectory` với thư mục thật `ls -d /srv/tutor*`.', 'Sửa bằng sed, `sudo systemctl daemon-reload`, rồi `sudo systemctl restart tutor`.'],
    fix: ['journalctl -u tutor -n 5 --no-pager', 'systemctl cat tutor', "sudo sed -i 's#/srv/tutor-api#/srv/tutor#' /etc/systemd/system/tutor.service", 'sudo systemctl daemon-reload', 'sudo systemctl restart tutor', 'systemctl is-active tutor'],
    cause: '`CHDIR` là bước đổi thư mục làm việc trước khi chạy `ExecStart`. Đường dẫn sai làm mọi lần khởi động thất bại ngay lập tức, dù chương trình không có lỗi. Sửa unit xong phải `daemon-reload`.',
    setup: function (s) { base(s, { runaway: false, setup: function (s2, l) { writeUnit(s2, 'tutor.service', UNIT.map(function (x) { return x === 'WorkingDirectory=/srv/tutor' ? 'WorkingDirectory=/srv/tutor-api' : x; })); var u = LIN.ensureUnit(s2, 'tutor.service'); LIN.startUnit(s2, u); } }); },
    check: function (s) { var u = C.unit(s, 'tutor.service'); return !!u && u.active === 'active' && /WorkingDirectory=\/srv\/tutor$/m.test(ftxt(s, '/etc/systemd/system/tutor.service')); }
  },
  {
    id: 'c1b3', title: 'Cron: chạy tay được, cron thì không',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ node /srv/tutor/jobs/cleanup.js', 'dọn xong 14 file tạm', '', '$ crontab -l', '* * * * * node /srv/tutor/jobs/cleanup.js >> /home/haidangphan/cleanup.log 2>&1', '', '$ cat ~/cleanup.log', '/bin/sh: 1: node: not found'),
    story: 'Job dọn file tạm chạy đúng khi gõ tay nhưng theo cron thì chỉ ghi ra một dòng lỗi trong log.',
    goal: 'Sửa crontab của bạn để job chạy được dưới cron (không còn `node: not found`).',
    hints: ['Log nói `node: not found`: cron không thấy `node` dù terminal của bạn thấy.', 'PATH của cron chỉ có `/usr/bin:/bin`. Xem `which node` để biết đường dẫn thật của chương trình.', 'Đổi dòng cron sang đường dẫn tuyệt đối: `crontab -l | sed "s#node /srv#/usr/bin/node /srv#" | crontab -`'],
    fix: ['crontab -l', 'cat ~/cleanup.log', 'which node', 'crontab -l | sed "s#node /srv#/usr/bin/node /srv#" | crontab -', 'crontab -l'],
    cause: 'Cron không đọc `.bashrc` và có PATH tối thiểu. Luôn dùng đường dẫn tuyệt đối trong crontab hoặc đặt `PATH=...` ở dòng đầu.',
    setup: function (s) { base(s, { runaway: false, setup: function (s2, l) { s2.fs.mkdirp('/srv/tutor/jobs', 'tutor', 493); s2.fs.put('/srv/tutor/jobs/cleanup.js', "console.log('dọn xong 14 file tạm');\n", { owner: 'tutor', mode: 420 }); l.cron.haidangphan = '* * * * * node /srv/tutor/jobs/cleanup.js >> /home/haidangphan/cleanup.log 2>&1\n'; LIN.advance(s2, 130, quiet); } }); },
    check: function (s) { var t = (s.W.lin.cron || {}).haidangphan || ''; return /\/usr\/bin\/node/.test(t) || /^PATH=.*\/usr\/bin/m.test(t); }
  },
  {
    id: 'c1b4', title: 'kill -9 xong, dịch vụ không dậy lại được',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ systemctl status tutor-worker', '● tutor-worker.service - Tutor queue worker', '     Active: activating (auto-restart) (Result: exit-code)', '', 'tutor-worker[2308]: Error: another instance is already running (lock file /var/run/tutor-worker.pid exists)', '', '$ ls -l /var/run/tutor-worker.pid', '-rw-r--r-- 1 root root 5 Oct 27 10:20 /var/run/tutor-worker.pid'),
    story: 'Worker xử lý hàng đợi không phản hồi nên đồng nghiệp đã `kill -9` nó. Từ đó dịch vụ cứ báo "another instance is already running" dù không còn tiến trình nào.',
    goal: 'Đưa `tutor-worker` về `active (running)` sạch sẽ, không còn file khoá mồ côi.',
    hints: ['Lỗi nhắc tới file khoá `/var/run/tutor-worker.pid`. `kill -9` không cho app xoá nó.', 'Kiểm tra không còn tiến trình thật: `pgrep -a tutor-worker`. Nếu không có, file khoá là mồ côi.', 'Dừng vòng lặp (`sudo systemctl stop tutor-worker`), `sudo rm /var/run/tutor-worker.pid`, rồi `sudo systemctl start tutor-worker`.'],
    fix: ['systemctl status tutor-worker', 'pgrep -a tutor-worker', 'sudo systemctl stop tutor-worker', 'sudo rm /var/run/tutor-worker.pid', 'sudo systemctl start tutor-worker', 'systemctl is-active tutor-worker'],
    cause: 'SIGKILL không cho tiến trình chạy bước dọn dẹp nên file khoá để lại. Lần chạy sau thấy khoá và từ chối khởi động. Luôn dùng `systemctl stop` hoặc `kill` (TERM) trước; chỉ khi TERM bất lực mới `kill -9`, rồi tự xoá khoá mồ côi.',
    setup: function (s) {
      base(s, { runaway: false, setup: function (s2, l) {
        s2.fs.put('/usr/local/bin/tutor-worker', 'ELF', { owner: 'root', mode: 493 });
        writeUnit(s2, 'tutor-worker.service', ['[Unit]', 'Description=Tutor queue worker', '', '[Service]', 'User=tutor', 'ExecStart=/usr/local/bin/tutor-worker', 'Restart=on-failure', 'RestartSec=2', '', '[Install]', 'WantedBy=multi-user.target']);
        l.locks = { 'tutor-worker.service': '/var/run/tutor-worker.pid' }; l.workers = { 'tutor-worker.service': { ignoreTerm: true } };
        var u = LIN.ensureUnit(s2, 'tutor-worker.service'); LIN.startUnit(s2, u);
        var p = C.pidOf(s2, 'tutor-worker')[0]; if (p) { s2.silent('sudo kill -9 ' + p.pid); }
      } });
    },
    check: function (s) { var u = C.unit(s, 'tutor-worker.service'); return !!u && u.active === 'active' && C.pidOf(s, 'tutor-worker').length === 1; }
  },
  {
    id: 'c1b5', title: 'Hai dịch vụ tranh nhau cổng 8888', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ systemctl status tutor', '× tutor.service - Tutor API (NestJS)', '     Active: failed (Result: start-limit-hit)', '', '$ curl localhost:8888/health', 'Hello from tutor-api', '', '(trả lời là bản CŨ của ứng dụng, không phải bản vừa deploy)'),
    story: 'Bạn deploy bản mới bằng `tutor.service`. Dịch vụ thất bại liên tục rồi bị systemd bỏ cuộc, trong khi cổng 8888 vẫn trả lời bằng phiên bản cũ.',
    goal: '`tutor.service` chạy ổn định ở cổng 8888, và dịch vụ cũ không còn chạy hay tự khởi động nữa.',
    hints: ['Log của tutor chứa `EADDRINUSE`: có tiến trình khác đang giữ 8888. Tìm ai: `sudo ss -tlnp | grep :8888`.', 'Từ PID đó dùng `ps -o pid,user,cmd -p PID` rồi `systemctl list-units --type=service | grep tutor` để thấy dịch vụ cũ `tutor-old`.', '`sudo systemctl disable --now tutor-old` (dừng và không tự chạy), `sudo systemctl reset-failed tutor`, rồi `sudo systemctl restart tutor`.'],
    fix: ['journalctl -u tutor -n 8 --no-pager', 'sudo ss -tlnp | grep :8888', 'systemctl list-units --type=service | grep tutor', 'sudo systemctl disable --now tutor-old', 'sudo systemctl reset-failed tutor', 'sudo systemctl restart tutor', 'systemctl is-active tutor'],
    cause: 'Một cổng chỉ một tiến trình giữ. Unit cũ `tutor-old` (đã được `enable` từ trước) vẫn chạy bản cũ, nên bản mới đụng `EADDRINUSE` và systemd dừng thử sau vài lần (`start-limit-hit`). Phải gỡ unit cũ khỏi vòng chạy, `reset-failed` rồi mới start lại.',
    setup: function (s) {
      base(s, { runaway: false, setup: function (s2, l) {
        s2.fs.mkdirp('/opt/tutor-old/dist', 'tutor', 493); s2.fs.put('/opt/tutor-old/dist/main.js', "// bản cũ\n", { owner: 'tutor', mode: 420 });
        writeUnit(s2, 'tutor-old.service', ['[Unit]', 'Description=Tutor API (ban cu)', '', '[Service]', 'User=tutor', 'WorkingDirectory=/opt/tutor-old', 'Environment=PORT=8888', 'Environment=DATABASE_URL=postgres://old', 'ExecStart=/usr/bin/node dist/main.js', 'Restart=always', '', '[Install]', 'WantedBy=multi-user.target']);
        writeUnit(s2, 'tutor.service', UNIT);
        var o = LIN.ensureUnit(s2, 'tutor-old.service'); o.enabled = 'enabled'; LIN.startUnit(s2, o);
        var u = LIN.ensureUnit(s2, 'tutor.service'); u.enabled = 'enabled'; LIN.startUnit(s2, u); LIN.advance(s2, 20, quiet);
      } });
    },
    check: function (s) { var u = C.unit(s, 'tutor.service'), o = C.unit(s, 'tutor-old.service'); return !!u && u.active === 'active' && !!o && o.active !== 'active' && o.enabled !== 'enabled'; }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
