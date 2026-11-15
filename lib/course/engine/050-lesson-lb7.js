(function (G) {
'use strict';
/* Chương lb7: tiến trình và tín hiệu. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
function procs(s) { return (s.W && s.W.lin && s.W.lin.procs) || []; }
function findP(s, re) { return procs(s).filter(function (p) { return re.test(p.cmd); }); }
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }

var T = {
  id: 'lb7', group: 'Linux căn bản', short: 'Tiến trình và tín hiệu',
  title: 'Tiến trình và tín hiệu: ps, top, kill, jobs, nohup, tmux',
  dek: 'Xem và đọc tiến trình, tìm thứ đang ngốn CPU hoặc RAM, dừng đúng cách bằng tín hiệu TERM/KILL/HUP, chạy nền với &, nohup và tmux để tác vụ sống sót khi mất SSH, chỉnh độ ưu tiên và tìm tiến trình đang giữ một cổng.'
};
C.insertAfter('ov2', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Tiến trình: chương trình đang chạy', body: [
    'Mỗi chương trình đang chạy là một **tiến trình** với **PID** (số định danh), **PPID** (tiến trình cha), user chạy nó và một trạng thái. Mọi tiến trình đều có cha, tạo thành một cây gốc ở **PID 1** (`systemd`). Shell của bạn là cha của các lệnh bạn gõ.',
    { pre: ['ps                        # chỉ tiến trình của terminal này', 'ps aux                    # mọi tiến trình, mọi user', 'ps -ef                    # kiểu khác, có cột PPID', 'ps aux | grep nginx       # lọc theo tên', 'pgrep -a sshd             # chỉ lấy PID và dòng lệnh', 'ps -o pid,ppid,user,cmd -p 1   # chọn cột cho một PID', 'pstree                    # cây tiến trình'], cap: 'Xem tiến trình' },
    { tbl: [['Cột (`ps aux`)', 'Ý nghĩa'], ['`USER` `PID`', 'Chủ và số tiến trình'], ['`%CPU` `%MEM`', 'Mức dùng CPU, RAM'], ['`VSZ` `RSS`', 'Bộ nhớ ảo / bộ nhớ thật đang giữ (KB)'], ['`STAT`', '`R` đang chạy, `S` ngủ chờ, `D` chờ I/O (không ngắt được), `T` bị dừng, `Z` zombie; thêm `s` trưởng phiên, `l` đa luồng, `+` tiền cảnh'], ['`COMMAND`', 'Dòng lệnh đầy đủ']] }
  ] },
  { tag: 'Công cụ', title: 'Xem tài nguyên: top, uptime, free', body: [
    { pre: ['uptime                   # tải trung bình 1, 5, 15 phút', 'free -m                  # RAM theo MB (free -h: dễ đọc)', 'top                      # bảng tương tác (q để thoát)', 'top -b -n 1 | head -12  # chạy một lần, in ra để đọc hoặc lưu', 'ps aux --sort=-%cpu | head -5   # 5 tiến trình ngốn CPU nhất', 'ps aux --sort=-%mem | head -5   # ... ngốn RAM nhất'], cap: 'Máy chậm thì xem gì trước' },
    { tbl: [['Phím trong `top`', 'Tác dụng'], ['`P` / `M`', 'Sắp xếp theo CPU / RAM'], ['`k`', 'Gửi tín hiệu cho một PID'], ['`1`', 'Xem từng lõi CPU'], ['`q`', 'Thoát']] },
    { ul: ['**Load average** so với số lõi CPU: máy 2 lõi mà load 2.0 là đầy tải; 8.0 là đang nghẽn', 'Dòng `Mem`/`Swap`: swap đang dùng nhiều là dấu hiệu thiếu RAM', 'Cài `htop` (`sudo apt install htop`) cho giao diện dễ dùng hơn `top`'] }
  ] },
  { tag: 'Cú pháp', title: 'Tín hiệu và kill', body: [
    'Dừng một tiến trình thực chất là **gửi cho nó một tín hiệu**. Lệnh `kill` không chỉ để "giết": nó gửi bất kỳ tín hiệu nào.',
    { tbl: [['Tín hiệu', 'Số', 'Ý nghĩa', 'Dùng khi'], ['`SIGTERM`', '15', 'Yêu cầu dừng lịch sự: tiến trình dọn dẹp rồi thoát (**mặc định**)', 'Luôn thử đầu tiên'], ['`SIGKILL`', '9', 'Hệ điều hành xoá ngay, không thể chặn hay dọn dẹp', 'Chỉ khi TERM không có tác dụng'], ['`SIGHUP`', '1', 'Quy ước: nạp lại cấu hình (Nginx), hoặc "mất terminal"', '`kill -HUP PID` để reload'], ['`SIGINT`', '2', 'Là `Ctrl+C`', ''], ['`SIGSTOP` / `SIGCONT`', '19 / 18', 'Tạm dừng / tiếp tục', 'Tạm đóng băng tiến trình'], ['`SIGUSR1`', '10', 'Tuỳ ứng dụng', 'Ví dụ mở lại file log']] },
    { pre: ['kill 1234                 # gửi TERM tới PID 1234', 'kill -9 1234              # KILL', 'kill -HUP 1234             # reload', 'kill -l                    # liệt kê tên và số tín hiệu', 'kill -0 1234               # không gửi gì, chỉ kiểm tra PID còn sống và bạn có quyền'], cap: 'Cú pháp' },
    { note: 'Quy trình đúng: `kill PID`, đợi vài giây, kiểm tra bằng `ps`; chỉ khi vẫn còn mới `kill -9 PID`. `-9` bỏ qua dọn dẹp nên có thể để lại file khoá, dữ liệu ghi dở.', kind: 'warn' },
    'Bạn chỉ gửi tín hiệu được cho tiến trình của **chính mình**; tiến trình của root hoặc user khác cần `sudo kill`.'
  ] },
  { tag: 'Cú pháp', title: 'Tìm rồi dừng: pgrep, pkill, killall', body: [
    { pre: ['pgrep -a node                  # PID và dòng lệnh của tiến trình tên node', 'pgrep -f "python3 worker.py"    # khớp cả dòng lệnh đầy đủ', 'pkill node                     # TERM mọi tiến trình tên node (của bạn)', 'pkill -f "worker.py"           # theo dòng lệnh', 'killall sleep                  # theo tên chính xác', 'kill $(pgrep -f worker.py)     # dùng kết quả pgrep làm đối số', 'pidof sshd                     # chỉ lấy PID'], cap: 'Theo tên thay vì PID' },
    { note: '`pkill`/`killall` theo tên rất dễ trúng nhầm (tên `node` khớp mọi dịch vụ Node.js). Chạy `pgrep -a TÊN` trước để xem chính xác sẽ dừng những gì.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Chạy nền và quản lý job trong shell', body: [
    { pre: ['sleep 300 &              # & : chạy nền, shell in [số job] PID', 'jobs                     # liệt kê job của shell này (jobs -l: kèm PID)', 'echo $!                  # PID của job nền gần nhất', 'fg %1                    # đưa job 1 lên tiền cảnh', 'Ctrl+Z                   # tạm dừng lệnh đang chạy ở tiền cảnh', 'bg %1                    # cho job vừa dừng chạy tiếp ở nền', 'kill %1                  # dừng job 1 (dùng số job, không phải PID)', 'wait $!                  # chờ job nền kết thúc', 'sleep 5 & wait $!; echo "rc=$?"'], cap: 'Điều khiển job' },
    { ul: ['Job thuộc về **shell** hiện tại. Khi bạn đóng phiên SSH, shell gửi `SIGHUP` cho các job và chúng chết theo', 'Đầu ra của job nền vẫn in lên terminal của bạn: chuyển hướng `> log 2>&1 &` để gọn', '`timeout 30 lệnh` tự dừng lệnh sau 30 giây (mã thoát 124 nếu bị cắt)'] }
  ] },
  { tag: 'Cú pháp', title: 'Cho tác vụ sống sót khi mất SSH: nohup, disown, tmux', body: [
    { tbl: [['Cách', 'Dùng khi', 'Ví dụ'], ['`nohup`', 'Tác vụ dài, không cần tương tác', '`nohup ./build.sh > build.log 2>&1 &`'], ['`disown`', 'Đã lỡ chạy bằng `&` mà quên nohup', '`disown %1`'], ['`tmux`', 'Cần quay lại xem/tương tác sau khi mất kết nối', '`tmux new -s work`, thoát tạm `Ctrl+b d`, vào lại `tmux attach -t work`'], ['`systemd`', 'Dịch vụ chạy lâu dài, tự khởi động lại', 'File `.service` (xem chương Dịch vụ)']] },
    { pre: ['nohup ./build.sh > build.log 2>&1 &    # chuẩn: có chuyển hướng thì không sinh nohup.out', 'tail -f build.log                   # theo dõi, Ctrl+C chỉ dừng tail', 'sudo apt install -y tmux', 'tmux new -d -s work "sleep 900"   # tạo phiên chạy nền', 'tmux ls                           # liệt kê phiên', 'tmux attach -t work               # vào lại', 'tmux kill-session -t work'], cap: 'Ví dụ' },
    'Tác vụ chạy 24/7 như API, worker nên là dịch vụ systemd, không phải `nohup`: systemd khởi động lại khi lỗi, ghi log vào journal, và chạy lại sau khi reboot.'
  ] },
  { tag: 'Cú pháp', title: 'Độ ưu tiên và giới hạn: nice, renice, timeout', body: [
    { pre: ['nice -n 10 ./build.sh &          # chạy với độ "nhường" 10 (NI = 10)', 'renice -n 15 -p 1234            # đổi cho tiến trình đang chạy', 'ps -o pid,ni,cmd -p 1234         # xem NI', 'timeout 60 ./report.sh; echo $?   # tối đa 60 giây, 124 nếu bị cắt'], cap: 'Ví dụ' },
    { ul: ['**NI** từ -20 (ưu tiên nhất) đến 19 (nhường nhất). User thường chỉ được **tăng** NI (nhường hơn), hạ NI âm cần root', 'Tác vụ nặng chạy cùng dịch vụ web (nén, build, backup) nên dùng `nice` để không làm web chậm', 'Khi hết RAM, kernel bật **OOM killer** giết tiến trình ngốn nhiều: xem `sudo dmesg | grep -i "out of memory"` hoặc `journalctl -k`'] }
  ] },
  { tag: 'Cú pháp', title: 'Ai đang giữ cổng này? ss, lsof, fuser', body: [
    'Lỗi `EADDRINUSE: address already in use :::3000` nghĩa là một tiến trình khác đang lắng nghe cổng đó.',
    { pre: ['ss -tlnp                       # cổng TCP đang lắng nghe (-p cần sudo để thấy tên tiến trình)', 'sudo ss -tlnp | grep :3000        # ai giữ cổng 3000', 'sudo lsof -i :3000                # tương tự, hiện PID, user', 'sudo fuser 3000/tcp               # chỉ in PID', 'sudo lsof -p 1234                 # tiến trình 1234 đang mở những file nào', 'sudo lsof /var/log/syslog         # ai đang mở file này'], cap: 'Tìm chủ của cổng và của file' },
    { tbl: [['Cờ `ss`', 'Ý nghĩa'], ['`-t` `-u`', 'TCP / UDP'], ['`-l`', 'Chỉ cổng đang listen'], ['`-n`', 'Không phân giải tên (nhanh hơn)'], ['`-p`', 'Hiện tiến trình (cần quyền root để thấy của người khác)']] },
    { ul: ['`0.0.0.0:3000` mở ra mọi giao diện mạng; `127.0.0.1:3000` chỉ nội bộ (an toàn hơn cho dịch vụ sau Nginx)', 'Muốn dừng dịch vụ systemd đừng `kill` mà dùng `sudo systemctl stop tên`, nếu không systemd sẽ khởi động lại nó'] }
  ] },
  { tag: 'Quy trình', title: 'Sự cố "máy chậm" và danh sách kiểm tra', body: [
    { tbl: [['Bước', 'Lệnh', 'Tìm gì'], ['1. Tổng quan', '`uptime`, `free -m`', 'Load cao? RAM/swap cạn?'], ['2. Thủ phạm CPU', '`ps aux --sort=-%cpu | head`', 'Tiến trình lạ chiếm gần 100%'], ['3. Thủ phạm RAM', '`ps aux --sort=-%mem | head`', 'Rò rỉ bộ nhớ'], ['4. Dừng', '`kill PID`, đợi, rồi `kill -9 PID`', 'Chỉ dừng tiến trình đã xác định rõ'], ['5. Gốc rễ', 'log, `journalctl`, ai khởi động nó (`ps -o ppid`)', 'Tránh lặp lại']] },
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['`kill` xong mà tiến trình vẫn còn', 'Đang bỏ qua TERM, hoặc đang ở trạng thái D', '`kill -9`; trạng thái D chờ I/O, xử lý nguyên nhân đĩa/mạng'], ['`Operation not permitted`', 'Tiến trình của user khác/root', '`sudo kill`'], ['Job chết khi đóng SSH', 'Job gắn với shell, nhận SIGHUP', '`nohup`, `disown`, `tmux`, systemd'], ['Tiến trình tự sống lại sau khi kill', 'systemd/PM2/cron khởi động lại', 'Dừng ở đúng nơi quản lý nó'], ['Chiếm cổng nhưng không thấy PID', 'Thiếu `sudo` với `ss -p`/`lsof`', 'Thêm `sudo`'], ['Nhiều dòng `Z` (zombie)', 'Cha chưa thu dọn con', 'Khởi động lại tiến trình cha']] }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`ps`", "ps: tiến trình của phiên shell hiện tại.", "PID TTY          TIME CMD /    2188 pts/0    00:00:00 bash /    2217 pts/0    00:00:00 ps"], ["`ps aux | head -5`", "ps aux liệt kê mọi tiến trình; head -5 lấy 5 dòng đầu.", "USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND / root             1  0.0  0.6 167700 11800 ?        Ss   Oct2…"], ["`ps aux | grep sshd`", "Lọc các tiến trình có chữ sshd.", "root           812  0.0  0.3  15400  7300 ?        Ss   Oct25   0:00 /usr/sbin/sshd -D / root          2100  0.0  0.4  17000  8100 ?     …"], ["`pgrep -a sshd`", "pgrep -a tìm PID theo tên và in kèm lệnh.", "812 /usr/sbin/sshd -D / 2100 sshd: haidangphan [priv]"], ["`ps -o pid,ppid,user,cmd -p 1`", "Chọn các cột PID, PPID, người dùng và lệnh cho tiến trình có PID 1.", "PID    PPID USER       CMD /       1       0 root       /sbin/init"], ["`ps aux --sort=-%mem | head -3`", "Top 3 tiến trình dùng nhiều bộ nhớ nhất (--sort=-%mem).", "USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND / postgres      1010  0.0  2.1 220000 42000 ?        Ss   Oct2…"], ["`ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -3`", "Top 3 tiến trình dùng nhiều CPU nhất (theo cột pcpu).", "PID    %CPU    %MEM COMMAND /       1     0.0     0.6 systemd /     412     0.0     1.0 systemd-journal"], ["`uptime`", "uptime: thời gian chạy của máy và tải trung bình 1, 5, 15 phút.", "10:20:00 up 2 days, 5:14,  1 user,  load average: 0.12, 0.13, 0.12"], ["`free -m`", "free -m xem RAM và swap theo MB.", "total        used        free      shared  buff/cache   available / Mem:            1962         677         645          20         640 …"], ["`top -b -n 1 | head -12`", "top -b -n 1 chụp một lần rồi thoát, head lấy 12 dòng đầu.", "top - 10:20:00 up 2 days, 05:14,  1 user,  load average: 0.12, 0.13, 0.12 / Tasks:  50 total,   1 running,  49 sleeping,   0 stopped,   0…"], ["`sleep 300 &`", "& chạy sleep 300 nền; shell in số job và PID.", "[1] 2220"], ["`jobs -l`", "jobs -l liệt kê các job nền kèm PID.", "[1]+   2220 Running                 sleep 300 &"], ["`sleep 301 &`", "Thêm một job nền khác.", "[2] 2223"], ["`echo $!`", "$! là PID của tiến trình nền gần nhất.", "2223"], ["`kill %1`", "kill %1 gửi TERM cho job số 1.", "(không in ra)"], ["`sleep 500 &`", "Chạy sleep 500 nền.", "[3] 2226"], ["`kill $!`", "kill $! gửi TERM cho tiến trình vừa chạy nền bằng PID.", "(không in ra)"], ["`sleep 600 &`", "Chạy sleep 600 nền.", "[4] 2229"], ["`kill -9 $!`", "kill -9 gửi KILL: dừng ngay, không cho tiến trình dọn dẹp.", "(không in ra)"], ["`kill -l | head -3`", "kill -l liệt kê tên các tín hiệu; head lấy 3 dòng đầu.", "1) SIGHUP / 2) SIGINT / 3) SIGQUIT"], ["`kill 99999`", "PID 99999 không tồn tại nên kill báo lỗi.", "bash: kill: (99999) - No such process"], ["`sleep 700 &`", "Chạy sleep 700 nền.", "[5] 2232"], ["`kill -STOP $!`", "kill -STOP tạm dừng tiến trình.", "(không in ra)"], ["`jobs`", "jobs cho thấy job đã ở trạng thái Stopped.", "[2]-  Running                 sleep 301 & / [5]+  Stopped                 sleep 700"], ["`kill -CONT $!`", "kill -CONT tiếp tục tiến trình đã dừng.", "(không in ra)"], ["`nohup sleep 800 > /dev/null 2>&1 &`", "nohup giữ tiến trình sống khi đóng SSH; đầu ra bỏ vào /dev/null.", "[6] 2235"], ["`nice -n 10 sleep 900 &`", "nice -n 10 chạy với độ ưu tiên thấp hơn (NI = 10).", "[7] 2238"], ["`ps -o pid,ni,cmd -p $!`", "ps -o ni hiển thị độ ưu tiên (NI).", "PID      NI CMD /    2238      10 sleep 900"], ["`renice -n 15 -p $!`", "renice đổi độ ưu tiên của tiến trình đang chạy từ 10 sang 15.", "2238 (process ID) old priority 10, new priority 15"], ["`sleep 5 & wait $!; echo rc=$?`", "wait chờ tiến trình nền kết thúc và lấy mã thoát: 0.", "[8] 2241 / rc=0"], ["`timeout 2 sleep 10; echo $?`", "timeout 2 dừng lệnh sau 2 giây; mã thoát 124 là hết thời gian.", "124"], ["`pkill sleep`", "pkill dừng mọi tiến trình có tên sleep.", "(không in ra)"], ["`ss -tlnp`", "ss -tlnp liệt kê cổng đang lắng nghe và tiến trình giữ cổng.", "State  Recv-Q Send-Q  Local Address:Port      Peer Address:PortProcess / LISTEN 0      511     0.0.0.0:22              0.0.0.0:*        /…"], ["`sudo ss -tlnp | grep :80`", "Lọc cổng 80: nginx đang lắng nghe.", "LISTEN 0      511     0.0.0.0:80              0.0.0.0:*       users:((\"nginx\",pid=905,fd=26))"], ["`sudo apt install -y lsof tmux htop`", "Cài lsof, tmux và htop.", "Reading package lists... Done / Building dependency tree... Done / Reading state information... Done / The following NEW packages will be…"], ["`sudo lsof -i :22`", "lsof -i :22 cho biết tiến trình nào đang giữ cổng 22 (sshd).", "COMMAND     PID USER        FD   TYPE DEVICE SIZE/OFF NODE NAME / sshd         812 root         24u  IPv4  30022       0t0  TCP *:22 (LIS…"], ["`tmux new -d -s work \"sleep 900\"`", "tmux new -d chạy phiên work nền để sleep 900 không bị ngắt.", "(không in ra)"], ["`tmux ls`", "tmux ls liệt kê các phiên tmux.", "work: 1 windows (created Tue Oct 27 10:20:02 2026)"], ["`tmux kill-session -t work`", "tmux kill-session xoá phiên work.", "(không in ra)"], ["`pidof sshd`", "pidof trả về PID theo tên tiến trình.", "2100 812"], ["`pstree`", "pstree hiện cây tiến trình theo quan hệ cha con.", "systemd / ├─systemd-journal / ├─cron / ├─sshd / │ └─sshd / │   └─bash / ├─nginx / │ ├─nginx / │ └─nginx / └─postgres"], ["`sleep 1000 &`", "Chạy sleep 1000 nền.", "[9] 2250"], ["`disown`", "disown tách job khỏi shell, shell không gửi tín hiệu cho job khi đóng.", "(không in ra)"]]}]});
T.quiz = C.QZ(11, [
  ['PID 1 trên server Ubuntu là gì?', '`systemd`, tiến trình cha gốc của mọi tiến trình khác', ['`bash` của bạn', '`sshd`', '`kernel`'], 'Mọi tiến trình đều xuất phát từ PID 1 theo cây cha-con.'],
  ['Cột STAT hiện `D` nghĩa là gì?', 'Đang chờ I/O không thể ngắt (thường là đĩa/mạng)', ['Đã chết (Dead)', 'Chạy trong nền', 'Debug'], 'Trạng thái D hiếm khi kill được; phải xử lý nguyên nhân I/O.'],
  ['Lệnh nào liệt kê 5 tiến trình ngốn CPU nhất?', '`ps aux --sort=-%cpu | head -5`', ['`ps aux | tail -5`', '`top -c 5`', '`free -m`'], '`--sort=-%cpu` sắp giảm dần theo CPU.'],
  ['`kill 1234` gửi tín hiệu nào mặc định?', 'SIGTERM (15), yêu cầu dừng lịch sự', ['SIGKILL (9)', 'SIGHUP (1)', 'SIGSTOP'], 'Tiến trình có thể bắt TERM để dọn dẹp trước khi thoát.'],
  ['Khi nào mới nên dùng `kill -9`?', 'Sau khi TERM không có tác dụng', ['Luôn dùng ngay cho nhanh', 'Để reload cấu hình', 'Khi muốn tạm dừng'], '`-9` không cho dọn dẹp, có thể để lại file khoá hoặc dữ liệu dở dang.'],
  ['Cách thông thường để Nginx nạp lại cấu hình bằng tín hiệu?', '`kill -HUP PID_của_master`', ['`kill -9 PID`', '`kill -STOP PID`', '`kill -0 PID`'], 'SIGHUP là quy ước "đọc lại cấu hình" cho nhiều daemon (nhưng `systemctl reload nginx` an toàn hơn).'],
  ['Bạn chạy `sleep 300 &` rồi muốn dừng nó bằng số job. Cách đúng?', '`kill %1`', ['`kill 1`', '`stop %1`', '`kill -job 1`'], '`%N` là cách tham chiếu job; `kill 1` sẽ nhắm PID 1.'],
  ['Vì sao lệnh chạy bằng `&` thường chết khi bạn đóng SSH?', 'Shell gửi SIGHUP cho các job con khi phiên kết thúc', ['`&` làm lệnh có thời hạn', 'SSH tự xoá file tạm', 'Nginx khởi động lại'], 'Dùng `nohup`, `disown`, `tmux` hoặc systemd để tác vụ không phụ thuộc phiên.'],
  ['Dòng nào chạy tác vụ dài, ghi log và không chết khi mất SSH?', '`nohup ./build.sh > build.log 2>&1 &`', ['`./build.sh &`', '`./build.sh | tee build.log`', '`kill -HUP ./build.sh`'], 'nohup bỏ qua SIGHUP; chuyển hướng giữ log; `&` đưa xuống nền.'],
  ['`nice -n 10 ./build.sh` làm gì?', 'Chạy với độ ưu tiên thấp hơn để nhường CPU cho tiến trình khác', ['Chạy nhanh gấp 10 lần', 'Giới hạn 10 giây', 'Chạy 10 bản'], 'NI càng cao càng "nhường". Chỉ root mới hạ NI xuống âm.'],
  ['Ứng dụng báo `EADDRINUSE :::3000`. Bước đầu tiên?', '`sudo ss -tlnp | grep :3000` để tìm tiến trình giữ cổng', ['Khởi động lại VPS', 'Đổi cổng sang 3001 ngay', 'Xoá thư mục ứng dụng'], 'Tìm ra tiến trình đang giữ cổng rồi mới quyết định dừng nó hay đổi cổng.'],
  ['Một dịch vụ do systemd quản lý, bạn `kill -9` nó nhưng vài giây sau nó lại chạy. Vì sao?', 'systemd cấu hình `Restart=` nên tự khởi động lại; hãy `systemctl stop`', ['Lệnh kill bị hỏng', 'Do có zombie', 'Do thiếu sudo'], 'Dừng đúng nơi quản lý nó (systemd, PM2, cron...).']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Xem tiến trình của terminal hiện tại.', hint: 'ps', check: OK(/^ps$/) },
    { text: 'Xem 5 dòng đầu của danh sách mọi tiến trình.', hint: 'ps aux | head -5', check: AND(OK(/^ps aux$/), OK(/^head -5$/)) },
    { text: 'Tìm tiến trình `sshd` bằng `ps aux` kết hợp `grep`.', hint: 'ps aux | grep sshd', check: AND(OK(/^ps aux$/), OK(/^grep sshd$/)) },
    { text: 'Dùng `pgrep -a` để lấy PID và dòng lệnh của `sshd`.', hint: 'pgrep -a sshd', check: OK(/^pgrep -a sshd$/) },
    { text: 'Xem PID, PPID, user, lệnh của tiến trình số 1.', hint: 'ps -o pid,ppid,user,cmd -p 1', check: OK(/^ps -o pid,ppid,user,cmd -p 1$/) },
    { text: 'Liệt kê 3 tiến trình ngốn RAM nhất.', hint: 'ps aux --sort=-%mem | head -3', check: AND(OK(/^ps aux --sort=-%mem$/), OK(/^head -3$/)) },
    { text: 'Chọn cột `pid,pcpu,pmem,comm` và sắp theo CPU giảm dần (3 dòng đầu).', hint: 'ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -3', check: OK(/^ps -eo pid,pcpu,pmem,comm --sort=-pcpu$/) },
    { text: 'Xem tải trung bình và RAM: `uptime` rồi `free -m`.', hint: 'uptime\nfree -m', check: AND(OK(/^uptime$/), OK(/^free -m$/)) },
    { text: 'Chụp bảng `top` một lần (chế độ batch) và xem 12 dòng đầu.', hint: 'top -b -n 1 | head -12', check: AND(OK(/^top -b -n 1$/), OK(/^head -12$/)) },
    { text: 'Chạy `sleep 300` ở nền.', hint: 'sleep 300 &', check: function (s) { return findP(s, /^sleep 300$/).length > 0; }, transient: true },
    { text: 'Liệt kê các job của shell, kèm PID.', hint: 'jobs -l', check: OK(/^jobs -l$/) },
    { text: 'In PID của job nền gần nhất bằng `$!`.', hint: 'sleep 301 &\necho $!', check: OK(/^echo \d+$/) },
    { text: 'Dừng job số 1 bằng `kill %1`.', hint: 'kill %1', check: function (s) { return findP(s, /^sleep 300$/).length === 0 && histN(s, /^kill %1$/) > 0; }, transient: true },
    { text: 'Chạy `sleep 500` ở nền rồi dừng nó bằng PID (`kill $!`).', hint: 'sleep 500 &\nkill $!', check: function (s) { return findP(s, /^sleep 500$/).length === 0 && histN(s, /^sleep 500$/) >= 0 && s.hist.some(function (h) { return /^kill \d+$/.test(h.cmd); }); }, transient: true },
    { text: 'Chạy `sleep 600` ở nền rồi buộc dừng bằng `kill -9 $!`.', hint: 'sleep 600 &\nkill -9 $!', check: function (s) { return findP(s, /^sleep 600$/).length === 0 && s.hist.some(function (h) { return /^kill -9 \d+$/.test(h.cmd); }); }, transient: true },
    { text: 'Liệt kê tên và số các tín hiệu (3 dòng đầu).', hint: 'kill -l | head -3', check: AND(OK(/^kill -l$/), OK(/^head -3$/)) },
    { text: 'Thử `kill` một PID không tồn tại để thấy lỗi.', hint: 'kill 99999', check: FAIL(/^kill 99999$/) },
    { text: 'Tạm dừng một job bằng `SIGSTOP`, xem `jobs` (Stopped), rồi tiếp tục bằng `SIGCONT`.', hint: 'sleep 700 &\nkill -STOP $!\njobs\nkill -CONT $!\njobs', check: AND(function (s) { return s.hist.some(function (h) { return /^kill -STOP \d+$/.test(h.cmd); }); }, function (s) { return s.hist.some(function (h) { return /^kill -CONT \d+$/.test(h.cmd); }); }), transient: true },
    { text: 'Chạy tác vụ nền bền vững: `nohup sleep 800` có chuyển hướng ra `/dev/null`.', hint: 'nohup sleep 800 > /dev/null 2>&1 &', check: function (s) { var p = findP(s, /^sleep 800$/)[0]; return !!p && !!p.nohup; }, transient: true },
    { text: 'Chạy `sleep 900` với `nice -n 10` ở nền rồi kiểm tra cột NI.', hint: 'nice -n 10 sleep 900 &\nps -o pid,ni,cmd -p $!', check: function (s) { var p = findP(s, /^sleep 900$/)[0]; return !!p && p.ni === 10; }, transient: true },
    { text: 'Đổi độ ưu tiên của job vừa tạo thành 15 bằng `renice`.', hint: 'renice -n 15 -p $!', check: function (s) { var p = findP(s, /^sleep 900$/)[0]; return !!p && p.ni === 15; }, transient: true },
    { text: 'Chờ job nền kết thúc bằng `wait` và in mã thoát.', hint: 'sleep 5 & wait $!; echo rc=$?', check: OK(/^echo rc=0$/) },
    { text: 'Giới hạn thời gian: `timeout 2 sleep 10` rồi in mã thoát (124).', hint: 'timeout 2 sleep 10; echo $?', check: OK(/^echo 124$/) },
    { text: 'Dừng mọi `sleep` của bạn bằng `pkill`.', hint: 'pkill sleep', check: function (s) { return findP(s, /^sleep /).length === 0 && histN(s, /^pkill sleep$/) > 0; }, transient: true },
    { text: 'Liệt kê cổng TCP đang lắng nghe.', hint: 'ss -tlnp', check: OK(/^ss -tlnp$/) },
    { text: 'Tìm tiến trình giữ cổng 80 (cần sudo để thấy tên tiến trình).', hint: 'sudo ss -tlnp | grep :80', check: AND(OK(/^sudo ss -tlnp$/), OK(/^grep :80$/)) },
    { text: 'Cài `lsof`, `tmux`, `htop`.', hint: 'sudo apt install -y lsof tmux htop', check: OK(/^sudo apt install -y lsof tmux htop$/) },
    { text: 'Xem ai giữ cổng 22 bằng `lsof`.', hint: 'sudo lsof -i :22', check: OK(/^sudo lsof -i :22$/) },
    { text: 'Tạo một phiên tmux chạy nền tên `work`, xem danh sách rồi xoá nó.', hint: 'tmux new -d -s work "sleep 900"\ntmux ls\ntmux kill-session -t work', check: AND(OK(/^tmux new -d -s work sleep 900$/), OK(/^tmux ls$/), OK(/^tmux kill-session -t work$/)) },
    { text: 'Xem PID của sshd bằng `pidof`.', hint: 'pidof sshd', check: OK(/^pidof sshd$/) },
    { text: 'Xem cây tiến trình (`pstree`).', hint: 'pstree', check: OK(/^pstree$/) },
    { text: 'Đưa một job đã chạy bằng `&` ra khỏi shell bằng `disown` để nó sống sót sau khi thoát.', hint: 'sleep 1000 &\ndisown', check: function (s) { var p = findP(s, /^sleep 1000$/)[0]; return !!p && !!p.nohup; }, transient: true }
  ]
};

T.debugs = [
  {
    id: 'lb7d1', title: 'Server chậm: tìm và dừng tiến trình ngốn CPU',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ uptime', ' 10:20:00 up 2 days,  load average: 1.12, 0.98, 0.70', '$ ssh vẫn chậm, gõ lệnh trễ nhiều giây'),
    story: 'VPS 1 lõi phản hồi rất chậm. `uptime` cho thấy tải cao bất thường. Có một tiến trình lạ của bạn đang chiếm CPU. Các dịch vụ khác (Nginx, PostgreSQL) phải giữ nguyên.',
    goal: 'Dừng đúng tiến trình đang ngốn CPU; Nginx và PostgreSQL vẫn chạy.',
    hints: ['`ps aux --sort=-%cpu | head -5` cho thấy tiến trình nào chiếm gần 100% CPU?', 'Một tiến trình tên `yes` (PID 3150) chiếm ~99% CPU; nó chạy dưới user của bạn nên không cần sudo.', '`kill 3150`, đợi, rồi `ps aux | grep yes` để chắc chắn; nếu còn, `kill -9 3150`.'],
    fix: ['ps aux --sort=-%cpu | head -5', 'kill 3150', 'ps aux --sort=-%cpu | head -3'],
    cause: 'Quy trình chẩn đoán: `uptime`/`top` để thấy máy bận, `ps aux --sort=-%cpu` để nhận diện thủ phạm, rồi `kill PID` (TERM) trước khi nghĩ tới `kill -9`. Chỉ dừng đúng PID đã xác định, tránh `pkill` bừa bãi vì có thể giết nhầm dịch vụ.',
    setup: function (s) { base(s, { runaway: true }); },
    check: function (s) { return findP(s, /^yes$/).length === 0 && findP(s, /nginx/).length > 0 && findP(s, /postgres/).length > 0; }
  },
  {
    id: 'lb7d2', title: 'kill không có tác dụng với worker',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ pgrep -a python3', '4101 python3 /home/haidangphan/work/worker.py', '$ kill 4101', '$ pgrep -a python3', '4101 python3 /home/haidangphan/work/worker.py'),
    story: 'Worker Python (PID 4101) bị kẹt nhưng `kill 4101` không làm nó dừng. Bạn đã chờ cả phút.',
    goal: 'Tiến trình 4101 không còn.',
    hints: ['`kill` mặc định gửi tín hiệu gì? Một chương trình có thể làm gì với tín hiệu đó?', 'Worker bắt và bỏ qua SIGTERM (đang bận). SIGKILL thì không ai chặn được.', '`kill -9 4101`, rồi `pgrep -a python3` để kiểm tra.'],
    fix: ['kill 4101', 'pgrep -a python3', 'kill -9 4101', 'pgrep -a python3'],
    cause: 'SIGTERM chỉ là lời đề nghị; chương trình bị kẹt hoặc tự cài trình xử lý có thể phớt lờ. SIGKILL (9) do kernel thực thi, không chặn được. Dùng sau cùng vì tiến trình không kịp dọn dẹp (file khoá, ghi dở). Nếu kill -9 cũng không được, tiến trình đang ở trạng thái D (chờ I/O).',
    setup: function (s) { base(s, { setup2: function (s3) {
      V.lin.addProc(s3, { pid: 4101, user: s3.user, cmd: 'python3 /home/haidangphan/work/worker.py', name: 'python3', ppid: 1, cpu: 2.0, mem: 0.9, rss: 30000, vsz: 90000, stat: 'S', tty: '?', ignoreTerm: true });
    } }); },
    check: function (s) { return !procs(s).some(function (p) { return p.pid === 4101; }); }
  },
  {
    id: 'lb7d3', title: 'Ứng dụng không khởi động: cổng 3000 đã bị chiếm',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ node src/app.js', 'Error: listen EADDRINUSE: address already in use :::3000', '    at Server.setupListenHandle [as _listen2] (node:net:1817:16)'),
    story: 'Bạn chạy ứng dụng Node mới nhưng cổng 3000 bị một tiến trình cũ (của root, chạy từ lần triển khai trước) chiếm giữ.',
    goal: 'Giải phóng cổng 3000: không còn tiến trình nào lắng nghe trên cổng đó (mà không đụng tới sshd/nginx/postgres).',
    hints: ['`ss -tlnp` không đủ thông tin nếu thiếu `sudo`. Hãy thử `sudo ss -tlnp | grep :3000`.', 'Có một tiến trình `node` thuộc root (PID 4200) giữ cổng; bạn cần `sudo` để dừng nó.', '`sudo kill 4200`, rồi `sudo ss -tlnp | grep :3000` không còn dòng nào.'],
    fix: ['sudo ss -tlnp | grep :3000', 'sudo kill 4200', 'sudo ss -tlnp | grep :3000'],
    cause: '`EADDRINUSE` luôn nghĩa là có tiến trình khác đang `listen` ở cổng đó. Tìm bằng `sudo ss -tlnp`/`sudo lsof -i :PORT`, dừng đúng chủ (tiến trình của root cần `sudo kill`). Nếu nó thuộc một dịch vụ systemd thì dừng bằng `systemctl stop` để không bị khởi động lại.',
    setup: function (s) { base(s, { setup2: function (s3) {
      V.lin.addProc(s3, { pid: 4200, user: 'root', cmd: 'node /srv/old-api/server.js', name: 'node', ppid: 1, cpu: 0.4, mem: 2.0, rss: 60000, vsz: 900000, stat: 'Sl', tty: '?', port: 3000, bind: '0.0.0.0' });
    } }); },
    check: function (s) { return !procs(s).some(function (p) { return p.port === 3000; }) && findP(s, /sshd/).length > 0 && findP(s, /nginx/).length > 0; }
  },
  {
    id: 'lb7d4', title: 'Tác vụ dài chết mỗi lần đóng SSH', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sleep 3000 &', '[1] 2310', '$ exit', '# đăng nhập lại', '$ ps aux | grep "sleep 3000"', '(không còn gì)'),
    story: '`sleep 3000` đại diện cho một tác vụ dài (build, import dữ liệu). Mỗi lần đóng phiên SSH, tác vụ biến mất cùng phiên.',
    goal: 'Chạy tác vụ `sleep 3000` sao cho nó **vẫn chạy sau khi bạn `exit`** khỏi phiên SSH (đăng nhập lại vẫn thấy tiến trình).',
    hints: ['Tiến trình `&` thuộc về shell. Chuyện gì xảy ra với nó khi shell nhận SIGHUP lúc đóng phiên?', 'Cần tách tác vụ khỏi shell: `nohup` (bỏ qua SIGHUP) hoặc `tmux`/`disown`.', '`nohup sleep 3000 > /dev/null 2>&1 &`, rồi `exit`, đăng nhập lại và `ps aux | grep "sleep 3000"`.'],
    fix: ['nohup sleep 3000 > /dev/null 2>&1 &', 'exit', 'ps aux | grep "sleep 3000" | grep -v grep'],
    cause: 'Khi phiên đóng, shell gửi SIGHUP cho các job nền và chúng chết. `nohup` làm tiến trình bỏ qua SIGHUP; `disown` gỡ job khỏi bảng job của shell; `tmux` giữ cả phiên terminal sống. Với dịch vụ chạy lâu dài, hãy dùng systemd để có tự khởi động lại, log và chạy lại sau khi reboot.',
    setup: function (s) { base(s); },
    check: function (s) { var p = findP(s, /^sleep 3000$/)[0], l = s.W && s.W.lin; return (!!p && histN(s, /^exit$/) > 0) || (!!l && !!l.tmux && l.tmux.length > 0 && histN(s, /^tmux new/) > 0 && histN(s, /^exit$/) > 0); }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
