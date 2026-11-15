(function (G) {
'use strict';
/* Chương lb3: shell hằng ngày. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
var W = function (s) { return s.home + '/work/'; };
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }
function mode(s, p) { var n = s.fs.get(p); return n ? n.mode & 4095 : -1; }

var T = {
  id: 'lb3', group: 'Linux căn bản', short: 'Shell hằng ngày',
  title: 'Shell hằng ngày: biến, PATH, quoting, alias, history',
  dek: 'Biến shell và biến môi trường, export, PATH và việc shell tìm lệnh, dấu nháy, $(...), &&, ||, mã thoát, alias, history và các file khởi động như ~/.bashrc. Nền tảng cho mọi script và mọi dòng lệnh về sau.'
};
C.insertAfter('lb2', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Biến shell: tạo, đọc, xoá', body: [
    'Biến là một cái tên giữ một chuỗi. Gán bằng `TÊN=giá_trị` (**không có dấu cách** quanh `=`), đọc bằng `$TÊN` hoặc `${TÊN}`. Mọi giá trị đều là chuỗi; số học cần cú pháp riêng `$(( ))`.',
    { pre: ['name=Dang', 'echo "Xin chào $name"          # Xin chào Dang', 'echo "${name}ABC"              # DangABC (dùng {} để tách tên biến)', 'unset name                     # xoá biến', 'echo $((6 * 7))                # 42'], cap: 'Cơ bản' },
    { tbl: [['Biến có sẵn', 'Giá trị'], ['`$HOME`', 'Thư mục home của bạn'], ['`$USER`', 'Tên user'], ['`$PWD`', 'Thư mục hiện tại'], ['`$?`', 'Mã thoát của lệnh vừa chạy (0 là thành công)'], ['`$$`', 'PID của shell'], ['`$0`, `$1`...', 'Tên script và các đối số (trong script)']] },
    { note: '`NAME = Dang` (có dấu cách) là **lỗi kinh điển**: shell hiểu `NAME` là một lệnh với hai đối số `=` và `Dang`, rồi báo `command not found`.', kind: 'err' }
  ] },
  { tag: 'Khái niệm', title: 'Biến môi trường và export', body: [
    'Biến shell chỉ tồn tại trong shell hiện tại. Muốn **tiến trình con** (script, `node`, `python`...) nhìn thấy biến, phải **export** nó thành biến môi trường.',
    { pre: ['APP_ENV=production           # chỉ shell này thấy', 'bash -c \'echo [$APP_ENV]\'     # [] vì tiến trình con không thấy', 'export APP_ENV=production    # biến môi trường', 'bash -c \'echo [$APP_ENV]\'     # [production]', 'env | grep APP_ENV           # liệt kê môi trường', 'printenv APP_ENV'], cap: 'Biến shell và biến môi trường' },
    { pre: ['APP_ENV=test node server.js      # chỉ cho MỘT lệnh này, không đổi shell', 'PORT=4000 ./start.sh'], cap: 'Đặt biến chỉ cho một lệnh' },
    { ul: ['Biến export **không** lan ngược lên tiến trình cha: script con `export X=1` rồi kết thúc thì shell cha vẫn không có `X`', 'Muốn script chỉnh môi trường của shell hiện tại, phải **`source script.sh`** (hoặc `. script.sh`) thay vì `./script.sh`', 'Đừng để bí mật (mật khẩu DB) trong `~/.bashrc`; hãy dùng file `.env` quyền `600` hoặc systemd `EnvironmentFile=`'] }
  ] },
  { tag: 'Khái niệm', title: 'PATH: shell tìm lệnh ở đâu', body: [
    'Khi bạn gõ `ls`, shell không biết `ls` ở đâu. Nó duyệt lần lượt các thư mục trong `$PATH` (ngăn cách bằng `:`) và chạy file thực thi **đầu tiên** tìm thấy.',
    { pre: ['echo $PATH', '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'which ls            # /usr/bin/ls', 'type cd             # cd is a shell builtin', 'type ll             # ll is aliased to `ls -la\'', 'command -v node     # in đường dẫn nếu có, im lặng nếu không'], cap: 'Tra cứu lệnh' },
    { pre: ['mkdir -p ~/bin', 'cp scripts/deploy.sh ~/bin/deploy', 'chmod +x ~/bin/deploy', 'export PATH="$HOME/bin:$PATH"   # thêm vào ĐẦU PATH', 'deploy                          # gọi từ bất kỳ đâu'], cap: 'Thêm thư mục lệnh riêng' },
    { ul: ['Luôn **nối** vào PATH (`PATH="$HOME/bin:$PATH"`), đừng ghi đè (`PATH=$HOME/bin`) kẻo mất mọi lệnh khác', 'Thư mục đứng trước thắng thư mục đứng sau: đặt `~/bin` trước thì lệnh của bạn che lệnh hệ thống cùng tên', 'File phải có quyền `x` (xem chương Quyền); thiếu thì báo `Permission denied`, không phải `not found`', 'Lệnh nằm ở thư mục hiện tại **không** tự chạy được bằng tên; phải gõ `./tên` (vì `.` không có trong PATH, và đó là chủ ý an toàn)'] }
  ] },
  { tag: 'Cú pháp', title: 'Dấu nháy và ký tự thoát', body: [
    { tbl: [['Cách viết', 'Ý nghĩa', 'Ví dụ (`name=Dang`)'], ['Không nháy', 'Shell tách từ theo dấu cách và mở rộng `*`, `$`', '`echo $name` → `Dang`'], ['Nháy kép `"..."`', 'Giữ nguyên dấu cách, **vẫn** mở rộng `$var` và `$(...)`', '`echo "Hi $name"` → `Hi Dang`'], ['Nháy đơn `\'...\'`', 'Giữ nguyên **mọi** ký tự, không mở rộng gì', '`echo \'Hi $name\'` → `Hi $name`'], ['Gạch ngược `\\`', 'Thoát đúng một ký tự kế tiếp', '`echo \\$name` → `$name`']] },
    { pre: ['f="bao cao.txt"', 'cp $f backup/        # SAI: thành cp bao cao.txt backup/  (hai đối số)', 'cp "$f" backup/      # ĐÚNG', 'rm $f                # nguy hiểm: có thể xoá nhầm file "bao" và "cao.txt"', 'rm -- "$f"           # an toàn'], cap: 'Quy tắc vàng: luôn đặt biến trong nháy kép' },
    { note: 'Quên nháy kép quanh biến là nguồn lỗi (và sự cố xoá nhầm) số một trong script. Quy tắc: **luôn `"$biến"`**, trừ khi bạn chủ ý muốn tách từ.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Mở rộng: $(...), $((...)), ${...}, glob, ngoặc nhọn', body: [
    { tbl: [['Dạng', 'Tác dụng', 'Ví dụ'], ['`$(lệnh)`', 'Thay bằng **đầu ra** của lệnh', '`today=$(date +%F)`; `echo "có $(ls | wc -l) mục"`'], ['`$((biểu thức))`', 'Số học nguyên', '`echo $((7*6))` → `42`'], ['`${v:-mặc_định}`', 'Dùng mặc định nếu `v` rỗng/chưa đặt', '`echo "${PORT:-3000}"`'], ['`${v%.txt}`', 'Cắt đuôi ngắn nhất khớp', '`f=a.txt; echo ${f%.txt}` → `a`'], ['`${v#*/}`', 'Cắt đầu', '`p=a/b/c; echo ${p#*/}` → `b/c`'], ['`${#v}`', 'Độ dài chuỗi', '`${#f}`'], ['`*` `?` `[ab]`', 'Glob: khớp tên file', '`ls *.md`, `ls file?.txt`'], ['`{a,b}` `{1..5}`', 'Ngoặc nhọn: sinh nhiều từ', '`touch note{1,2,3}.txt`']] },
    { pre: ['cp notes.txt "notes-$(date +%F).bak"      # sao lưu kèm ngày', 'for f in *.md; do echo "$f"; done            # lặp qua file', 'for d in */; do echo "$d"; done              # chỉ thư mục', 'mkdir -p release/{bin,conf,logs}             # tạo nhiều thư mục một lần'], cap: 'Dùng trong thực tế' },
    'Dùng `$(...)` chứ không dùng dấu backtick `` `...` ``: dễ đọc hơn và lồng nhau được.'
  ] },
  { tag: 'Cú pháp', title: 'Mã thoát và nối lệnh: ; && || |', body: [
    'Mỗi lệnh kết thúc với **mã thoát**: `0` là thành công, khác `0` là lỗi. Xem bằng `$?` ngay sau lệnh.',
    { pre: ['ls /etc/hosts; echo $?        # 0', 'ls /khong-co; echo $?          # 2'], cap: '$?' },
    { tbl: [['Toán tử', 'Chạy lệnh sau khi...', 'Ví dụ'], ['`a ; b`', 'luôn luôn, bất kể kết quả', '`cd /tmp; ls`'], ['`a && b`', '`a` **thành công**', '`mkdir out && cd out`'], ['`a || b`', '`a` **thất bại**', '`ls x || echo "không có"`'], ['`a | b`', 'chạy song song, nối đầu ra `a` vào đầu vào `b`', '`ls | wc -l`'], ['`a &`', 'chạy nền (xem chương Tiến trình)', '`sleep 60 &`']] },
    { pre: ['cd /srv/app && git pull && npm ci && echo "xong" || echo "có lỗi ở một bước"', 'test -f config.yml || { echo "thiếu config"; exit 1; }'], cap: 'Chuỗi triển khai' },
    { note: '`cd thư-mục-sai; rm -rf *` (dùng `;`) vẫn chạy `rm` ở thư mục cũ! Với thao tác phá huỷ, luôn nối bằng `&&`.', kind: 'err' }
  ] },
  { tag: 'Tiện ích', title: 'alias, history và phím tắt', body: [
    { pre: ['alias ll=\'ls -la\'', 'alias gs=\'git status\'', 'alias                       # liệt kê alias', 'unalias ll', 'type ll                      # xem ll là gì'], cap: 'alias: đặt tên ngắn cho lệnh dài' },
    { pre: ['history | tail -5           # 5 lệnh gần nhất', '!!                          # chạy lại lệnh vừa rồi', 'sudo !!                     # chạy lại lệnh vừa rồi với sudo', '!$                          # đối số cuối của lệnh trước', 'history | grep nginx        # tìm lệnh cũ', '!42                         # chạy lệnh số 42 trong history'], cap: 'history' },
    { tbl: [['Phím', 'Tác dụng'], ['`Tab`', 'Tự hoàn thành tên lệnh/file (bấm hai lần để xem danh sách)'], ['`↑` `↓`', 'Duyệt lệnh cũ'], ['`Ctrl+R`', 'Tìm ngược trong history (gõ một phần lệnh)'], ['`Ctrl+C`', 'Ngắt lệnh đang chạy'], ['`Ctrl+L`', 'Xoá màn hình'], ['`Ctrl+A` / `Ctrl+E`', 'Về đầu / cuối dòng'], ['`Ctrl+D`', 'Thoát shell (EOF)']] },
    'alias chỉ có hiệu lực trong shell tương tác; script **không** dùng alias. Cần dùng trong script thì viết hàm hoặc dùng lệnh đầy đủ.'
  ] },
  { tag: 'Cấu hình', title: 'File khởi động: ~/.bashrc, ~/.profile, source', body: [
    { tbl: [['File', 'Khi nào đọc', 'Nên đặt gì'], ['`~/.bashrc`', 'Mỗi shell **tương tác** mới (mở terminal, đăng nhập SSH thường nạp thêm)', 'alias, hàm, `PS1`, `EDITOR`, PATH cá nhân'], ['`~/.profile`', 'Khi **đăng nhập** (login shell)', 'Biến môi trường dùng chung; mặc định đã thêm `~/bin` vào PATH nếu thư mục tồn tại'], ['`/etc/profile`, `/etc/environment`', 'Mọi user', 'Thiết lập toàn hệ thống (cần root)']] },
    { pre: ['echo "alias ll=\'ls -la\'" >> ~/.bashrc     # nối thêm dòng', 'echo \'export EDITOR=nano\' >> ~/.bashrc', 'source ~/.bashrc                            # nạp lại ngay, khỏi mở phiên mới', 'cat ~/.bashrc'], cap: 'Thay đổi vĩnh viễn' },
    { ul: ['Sửa `.bashrc` **không** ảnh hưởng shell đang mở cho tới khi bạn `source` hoặc mở phiên mới', 'Dùng `>>` (nối) chứ không phải `>` (ghi đè) khi thêm vào file cấu hình, kẻo xoá sạch nội dung cũ', 'Lệnh chạy bằng cron hoặc systemd **không** đọc `.bashrc`, nên PATH và biến của bạn thường không có ở đó (xem chương Lập lịch)'] }
  ] },
  { tag: 'Khái niệm', title: 'Chạy script: ./script, bash script, source script', body: [
    { tbl: [['Cách chạy', 'Cần `x`?', 'Chạy ở đâu', 'Biến/`cd` có ảnh hưởng shell hiện tại?'], ['`./env.sh`', 'Có', 'Tiến trình con (shell mới)', 'Không'], ['`bash env.sh`', 'Không', 'Tiến trình con', 'Không'], ['`source env.sh` hoặc `. env.sh`', 'Không', 'Chính shell hiện tại', 'Có']] },
    { pre: ['cat env.sh                 # export APP_ENV=production', './env.sh; echo "[$APP_ENV]"    # [] vì chạy ở shell con', 'source env.sh; echo "[$APP_ENV]" # [production]'], cap: 'Khác biệt giữa chạy và source' },
    'Dòng đầu `#!/bin/bash` (shebang) nói hệ điều hành dùng trình thông dịch nào khi bạn chạy `./script`. Thiếu `x` thì `./script` báo Permission denied (xem chương Quyền).'
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['`NAME: command not found` sau `NAME = x`', 'Có dấu cách quanh `=`', '`NAME=x`'], ['`mycmd: command not found` dù file tồn tại', 'Thư mục chứa nó không có trong `PATH`, hoặc cần `./`', '`export PATH="$HOME/bin:$PATH"`, hoặc `./mycmd`'], ['Script con không thấy biến', 'Chưa `export`', '`export TÊN=...`'], ['Đặt biến trong script xong, shell vẫn trống', 'Chạy bằng `./`, không phải `source`', '`source script.sh`'], ['`cp: cannot stat \'bao\'`', 'Biến chứa dấu cách không có nháy kép', '`cp "$f" ...`'], ['Mất sạch lệnh sau khi sửa PATH', 'Ghi đè `PATH=...` thay vì nối', 'Mở phiên mới; dùng `PATH="...:$PATH"`'], ['alias không có trong script', 'alias chỉ cho shell tương tác', 'Dùng hàm hoặc lệnh đầy đủ'], ['Sửa `.bashrc` mà không có tác dụng', 'Chưa `source` hoặc cron/systemd không đọc nó', '`source ~/.bashrc`; đặt biến thẳng trong unit/crontab']] },
    { ul: ['Biến đã `export` chưa, và giá trị có khớp mong đợi không (`echo "[$VAR]"`)?', 'Biến có đặt trong nháy kép không?', 'Lệnh nằm ở đâu (`type -a lệnh`, `command -v lệnh`)?', 'Đang ở shell tương tác hay trong cron/systemd (môi trường rất tối giản)?'] }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`echo $HOME`", "In giá trị biến HOME, đường dẫn thư mục home.", "/home/haidangphan"], ["`name=Dang`", "Gán biến name. Gán không in gì ra màn hình.", "(không in ra)"], ["`echo \"Xin chào $name\"`", "Nháy kép cho phép mở rộng $name nên in ra Xin chào Dang.", "Xin chào Dang"], ["`NAME = Dang`", "Lỗi vì có khoảng trắng quanh dấu =. Shell coi NAME là tên lệnh.", "bash: NAME: command not found"], ["`echo '$HOME'`", "Nháy đơn giữ nguyên chữ $HOME, không mở rộng biến.", "$HOME"], ["`APP_ENV=production`", "Gán biến thường, chưa phải biến môi trường nên tiến trình con không thấy.", "(không in ra)"], ["`bash -c 'echo [$APP_ENV]'`", "Chạy bash con: biến APP_ENV rỗng vì chưa được export.", "[]"], ["`export APP_ENV=production`", "export đưa biến vào môi trường để tiến trình con kế thừa.", "(không in ra)"], ["`env | grep APP_ENV`", "env liệt kê biến môi trường; grep lọc ra dòng APP_ENV.", "APP_ENV=production"], ["`GREETING=hello bash -c 'echo $GREETING'`", "Gán biến chỉ cho lệnh bash con này; shell hiện tại không bị ảnh hưởng.", "hello"], ["`echo $PATH`", "PATH là danh sách thư mục shell tìm lệnh, theo thứ tự từ trái sang phải.", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"], ["`which ls`", "Cho biết ls nằm ở đâu bằng đường dẫn tuyệt đối.", "/usr/bin/ls"], ["`type cd`", "type cho biết cd là lệnh nội tại (builtin) của shell.", "cd is a shell builtin"], ["`printf '#!/bin/bash\\necho hello $1\\n' > ~/bin/hello`", "Ghi một script hello vào ~/bin. Lệnh ghi file, không in ra màn hình.", "[~/bin/hello] #!/bin/bash / echo hello $1"], ["`chmod +x ~/bin/hello`", "Thêm quyền thực thi cho script hello.", "(không in ra)"], ["`export PATH=\"$HOME/bin:$PATH\"`", "Thêm ~/bin lên đầu PATH để shell tìm thấy lệnh mới.", "(không in ra)"], ["`hello Dang`", "Gọi script hello bằng tên, nhờ PATH đã có ~/bin.", "hello Dang"], ["`command -v hello`", "command -v cho biết đường dẫn lệnh mà shell sẽ chạy.", "/home/haidangphan/bin/hello"], ["`today=$(date +%F)`", "$(date +%F) chạy lệnh rồi gán kết quả vào biến today.", "(không in ra)"], ["`echo $today`", "In giá trị biến today: ngày hiện tại.", "2026-10-27"], ["`echo \"Có $(ls | wc -l) mục\"`", "Thay thế lệnh bằng kết quả của nó bên trong nháy kép: đếm số mục trong thư mục.", "Có 10 mục"], ["`echo $((7*6))`", "Phép tính số học trong $(( )).", "42"], ["`cp notes.txt \"notes-$(date +%F).bak\"`", "Tên file có ngày được tính lúc chạy lệnh, sao chép notes.txt thành bản sao lưu.", "(không in ra)"], ["`touch note{1,2,3}.txt`", "Dấu ngoặc nhọn tạo ba file note1.txt, note2.txt, note3.txt.", "(không in ra)"], ["`mkdir -p release/{bin,conf,logs}`", "Tạo ba thư mục con bin, conf, logs trong release.", "(không in ra)"], ["`for f in *.md; do echo \"$f\"; done`", "Vòng lặp: với mỗi file .md, in tên file. Trong thư mục này chỉ có todo.md.", "todo.md"], ["`for d in */; do echo \"$d\"; done`", "Vòng lặp: với mỗi thư mục (*/ chỉ khớp thư mục), in tên thư mục.", "data/ / logs/ / photos/ / projects/ / release/ / reports/ / scripts/ / tmp/"], ["`ls /khong-co`", "Thư mục không tồn tại nên lệnh báo lỗi.", "ls: cannot access '/khong-co': No such file or directory"], ["`echo $?`", "$? là mã thoát của lệnh trước. 2 nghĩa là lỗi không tìm thấy file.", "2"], ["`mkdir -p out && echo ok`", "&& chỉ chạy lệnh sau khi lệnh trước thành công, nên in ok.", "ok"], ["`ls khong-co || echo thiếu`", "|| chạy lệnh sau khi lệnh trước thất bại, nên in thiếu.", "ls: cannot access 'khong-co': No such file or directory / thiếu"], ["`alias ll='ls -la'`", "Đặt biệt danh ll cho ls -la.", "(không in ra)"], ["`ll`", "Gọi alias ll như một lệnh bình thường.", "total 300 / drwxr-xr-x 11 haidangphan haidangphan   4096 Oct 27 10:20 . / drwxr-xr-x  6 haidangphan haidangphan   4096 Oct 27 10:20 .. / …"], ["`type ll`", "type cho biết ll là alias và nội dung của nó.", "ll is aliased to `ls -la'"], ["`unalias ll`", "Xoá alias ll.", "(không in ra)"], ["`echo xin chào`", "echo in chuỗi có dấu tiếng Việt.", "xin chào"], ["`!!`", "!! lặp lại lệnh trước; shell in lệnh rồi chạy.", "echo xin chào / xin chào"], ["`history | tail -5`", "Xem 5 lệnh gần nhất trong lịch sử shell.", "48  type ll /   49  unalias ll /   50  echo xin chào /   51  echo xin chào /   52  history"], ["`echo \"alias lt='ls -lt'\" >> ~/.bashrc`", "Thêm một alias vào ~/.bashrc để dùng lần sau. Lệnh ghi file, không in ra.", "[~/.bashrc] # ~/.bashrc / export EDITOR=nano / alias ll='ls -la' / alias gs='git status' / alias lt='ls -lt'"], ["`source ~/.bashrc`", "source nạp lại ~/.bashrc ngay trong phiên hiện tại.", "(không in ra)"], ["`echo 'export APP_ENV=prod' > env.sh`", "Ghi file env.sh chứa một lệnh export.", "[env.sh] export APP_ENV=prod"], ["`chmod +x env.sh`", "Cho phép chạy file env.sh.", "(không in ra)"], ["`./env.sh`", "Chạy env.sh trong tiến trình con nên biến export không tồn tại sau đó.", "(không in ra)"], ["`source env.sh`", "source chạy script trong shell hiện tại nên biến export có hiệu lực.", "(không in ra)"], ["`echo \"${PORT:-3000}\"`", "Dùng giá trị mặc định 3000 khi biến PORT chưa đặt.", "3000"], ["`f=notes.txt`", "Gán biến f là tên file.", "(không in ra)"], ["`echo ${f%.txt}.bak`", "${f%.txt} cắt đuôi .txt rồi nối thêm .bak.", "notes.bak"]]}]});
T.quiz = C.QZ(7, [
  ['Cách gán biến đúng trong bash?', '`name=Dang`', ['`name = Dang`', '`$name=Dang`', '`set name Dang`'], 'Không có dấu cách quanh `=`; không dùng `$` khi gán, chỉ dùng khi đọc.'],
  ['`bash -c \'echo $X\'` in ra rỗng dù bạn vừa gõ `X=5`. Cần làm gì để tiến trình con thấy `X`?', '`export X=5`', ['`$X=5`', 'Viết `X=5;` có dấu chấm phẩy', 'Dùng nháy đơn khi gán'], '`export` biến thành biến môi trường nên tiến trình con được thừa kế.'],
  ['Điều gì xảy ra khi bạn gõ `NAME = Dang`?', 'Shell cố chạy lệnh `NAME` và báo command not found', ['Biến NAME nhận giá trị Dang', 'Gán rỗng cho NAME', 'Lỗi cú pháp ở dấu ='], 'Dấu cách làm `NAME`, `=`, `Dang` thành ba từ riêng: lệnh và hai đối số.'],
  ['Dòng nào thêm `~/bin` vào PATH một cách an toàn?', '`export PATH="$HOME/bin:$PATH"`', ['`export PATH="$HOME/bin"`', '`PATH=$HOME/bin ; unset PATH`', '`export HOME=$PATH/bin`'], 'Phải nối giá trị cũ vào, nếu không mọi lệnh khác biến mất khỏi PATH.'],
  ['`f="bao cao.txt"; cp $f backup/` lỗi vì?', 'Biến không có nháy kép nên bị tách thành hai đối số `bao` và `cao.txt`', ['cp không hỗ trợ dấu cách', 'Thiếu `-r`', 'backup/ chưa có quyền'], 'Phải viết `cp "$f" backup/`.'],
  ['`echo \'Xin chào $USER\'` in ra gì?', 'Đúng chuỗi `Xin chào $USER`', ['Xin chào và tên user', 'Lỗi cú pháp', 'Chuỗi rỗng'], 'Nháy đơn không mở rộng biến; nháy kép thì có.'],
  ['Cách lấy ngày dạng 2026-10-27 vào biến `today`?', '`today=$(date +%F)`', ['`today=date +%F`', '`today=\'date +%F\'`', '`today={date +%F}`'], '`$(...)` thay thế bằng đầu ra của lệnh.'],
  ['`ls /khong-co; echo $?` in ra?', 'Một số khác 0 (ví dụ 2)', ['0', 'Tên file', 'Không in gì'], '`$?` là mã thoát của lệnh trước; lỗi khác 0.'],
  ['Vì sao `cd build; rm -rf *` nguy hiểm hơn `cd build && rm -rf *`?', 'Với `;`, nếu `cd` lỗi thì `rm -rf *` vẫn chạy ở thư mục hiện tại', ['`;` chạy song song', '`&&` xoá chậm hơn', 'Không khác gì nhau'], '`&&` chỉ chạy lệnh sau khi lệnh trước thành công.'],
  ['`./env.sh` có dòng `export APP_ENV=prod` nhưng sau đó `echo $APP_ENV` rỗng. Vì sao, và sửa thế nào?', 'Script chạy ở shell con nên không đổi shell cha; dùng `source env.sh`', ['File thiếu `x`; chạy `chmod 777`', 'Phải dùng `unset` trước', 'Biến APP_ENV là tên dành riêng'], 'Chỉ `source` (hoặc `.`) chạy trong shell hiện tại.'],
  ['Bạn sửa `~/.bashrc` thêm một alias nhưng terminal đang mở chưa nhận. Làm gì nhanh nhất?', '`source ~/.bashrc`', ['Khởi động lại VPS', '`chmod +x ~/.bashrc`', '`export alias`'], 'File khởi động chỉ đọc lúc shell bắt đầu; `source` nạp lại ngay.'],
  ['Lệnh `type ll` in `ll is aliased to ...`. Điều đó cho biết gì?', '`ll` là alias của shell tương tác, không phải chương trình độc lập', ['`ll` nằm trong `/usr/bin`', '`ll` là biến', '`ll` bị hỏng'], '`type` cho biết lệnh là alias, builtin, hàm hay file.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'In thư mục home của bạn bằng biến `$HOME`.', hint: 'echo $HOME', check: OK(/^echo \/home\/haidangphan$/) },
    { text: 'Gán biến `name=Dang` rồi in lời chào `Xin chào Minh` bằng nháy kép.', hint: 'name=Minh\necho "Xin chào $name"', check: AND(function (s) { return s.vars.name === 'Minh'; }, OK(/^echo Xin chào Minh$/)) },
    { text: 'Cố tình gõ sai: gán có dấu cách quanh `=` để thấy lỗi.', hint: 'NAME = Lan', check: FAIL(/^NAME = Lan$/) },
    { text: 'In đúng chữ `$HOME` (không mở rộng) bằng nháy đơn.', hint: "echo '$HOME'", check: OK(/^echo \$HOME$/) },
    { text: 'Đặt biến `APP_ENV=staging` rồi chứng minh tiến trình con **không** thấy nó (chưa export).', hint: "APP_ENV=staging\nbash -c 'echo [$APP_ENV]'", check: AND(function (s) { return s.vars.APP_ENV === 'staging' && !s.env.APP_ENV; }, OK(/^bash -c echo \[\$APP_ENV\]$/)), transient: true },
    { text: 'Export `APP_ENV` để tiến trình con thấy nó.', hint: 'export APP_ENV=staging', check: function (s) { return s.env.APP_ENV === 'staging'; }, transient: true },
    { text: 'Xem biến môi trường `APP_ENV` bằng `env` kết hợp `grep`.', hint: 'env | grep APP_ENV', check: OK(/^grep APP_ENV$/) },
    { text: 'Đặt biến chỉ cho một lệnh: chạy `bash -c` in `$GREETING` với `GREETING=hello` ngay trước lệnh.', hint: "GREETING=hello bash -c 'echo $GREETING'", check: OK(/^bash -c echo \$GREETING$/) },
    { text: 'In giá trị `PATH`.', hint: 'echo $PATH', check: OK(/^echo \/usr\/local\/sbin:/) },
    { text: 'Tìm file thực thi của `ls` bằng `which`.', hint: 'which ls', check: OK(/^which ls$/) },
    { text: 'Hỏi shell `cd` là gì bằng `type`.', hint: 'type cd', check: OK(/^type cd$/) },
    { text: 'Tạo script `~/bin/greet` (in `xin chao` kèm đối số), cấp quyền chạy.', hint: "printf '#!/bin/bash\\necho xin chao $1\\n' > ~/bin/greet\nchmod +x ~/bin/greet", check: function (s) { var n = s.fs.get(s.home + '/bin/greet'); return !!n && (n.mode & 73) > 0 && /echo xin chao/.test(n.c || ''); } },
    { text: 'Thêm `~/bin` vào ĐẦU `PATH` (nối, không ghi đè) rồi gọi `greet Lan` từ thư mục hiện tại.', hint: 'export PATH="$HOME/bin:$PATH"\ngreet Lan', check: AND(function (s) { return (s.env.PATH || '').indexOf(s.home + '/bin') === 0 && (s.env.PATH || '').indexOf('/usr/bin') > 0; }, OK(/^\/home\/haidangphan\/bin\/greet Lan$/)) },
    { text: 'Kiểm tra `greet` nằm ở đâu bằng `command -v`.', hint: 'command -v greet', check: OK(/^command -v greet$/) },
    { text: 'Lưu ngày hôm nay vào biến `ngay` bằng `$(date +%F)` rồi in ra.', hint: 'ngay=$(date +%F)\necho $ngay', check: AND(function (s) { return /^\d{4}-\d\d-\d\d$/.test(s.vars.ngay || ''); }, OK(/^echo \d{4}-\d\d-\d\d$/)) },
    { text: 'In số mục trong thư mục hiện tại bằng `$(ls | wc -l)` bên trong chuỗi nháy kép.', hint: 'echo "Có $(ls | wc -l) mục"', check: OK(/^echo Có \d+ mục$/) },
    { text: 'Tính số học: in kết quả `8*9` bằng `$(( ))`.', hint: 'echo $((8*9))', check: OK(/^echo 72$/) },
    { text: 'Sao lưu `todo.md` thành `todo-<ngày>.bak` bằng `$(date +%F)` trong tên file.', hint: 'cp todo.md "todo-$(date +%F).bak"', check: function (s) { return Object.keys(s.fs.n).some(function (k) { return /\/work\/todo-\d{4}-\d\d-\d\d\.bak$/.test(k); }); } },
    { text: 'Tạo ba file `ghi-a.txt ghi-b.txt ghi-c.txt` bằng ngoặc nhọn.', hint: 'touch ghi-{a,b,c}.txt', check: function (s) { return ['a', 'b', 'c'].every(function (x) { return !!s.fs.get(W(s) + 'ghi-' + x + '.txt'); }); } },
    { text: 'Tạo cấu trúc `app/src`, `app/lib`, `app/data` trong một lệnh.', hint: 'mkdir -p app/{src,lib,data}', check: function (s) { return ['src', 'lib', 'data'].every(function (d) { return s.fs.isD(W(s) + 'app/' + d); }); } },
    { text: 'Lặp in tên mọi file `.md` trong thư mục hiện tại bằng vòng `for`.', hint: 'for f in *.md; do echo "$f"; done', check: OK(/^echo todo\.md$/) },
    { text: 'Lặp chỉ qua thư mục con (dùng mẫu `*/`).', hint: 'for d in */; do echo "$d"; done', check: OK(/^echo photos\/$/) },
    { text: 'Gây lỗi rồi đọc mã thoát: chạy `ls /thu-muc-ao` và in `$?`.', hint: 'ls /thu-muc-ao\necho $?', check: AND(FAIL(/^ls \/thu-muc-ao$/), OK(/^echo 2$/)) },
    { text: 'Dùng `&&`: tạo `ghichu` rồi chỉ khi thành công mới `echo xong`.', hint: 'mkdir -p ghichu && echo xong', check: OK(/^echo xong$/) },
    { text: 'Dùng `||`: thử `ls thu-muc-ao` và nếu lỗi thì in `lỗi`.', hint: 'ls thu-muc-ao || echo lỗi', check: OK(/^echo lỗi$/) },
    { text: 'Tạo alias `lh` là `ls -lh` rồi dùng nó.', hint: "alias lh='ls -lh'\nlh", check: AND(function (s) { return s.aliases.lh === 'ls -lh'; }, OK(/^ls -lh$/)) },
    { text: 'Hỏi shell `lh` là gì bằng `type`.', hint: 'type lh', check: OK(/^type lh$/) },
    { text: 'Xoá alias vừa tạo.', hint: 'unalias lh', check: function (s) { return s.aliases.lh == null && histN(s, /^unalias lh$/) > 0; }, transient: true },
    { text: 'Gõ `echo tạm biệt`, rồi chạy lại đúng lệnh đó bằng `!!`.', hint: 'echo tạm biệt\n!!', check: function (s) { return histN(s, /^echo tạm biệt$/) >= 2; } },
    { text: 'Xem 3 lệnh gần nhất trong history.', hint: 'history | tail -n 3', check: OK(/^tail -n 3$/) },
    { text: 'Thêm alias vĩnh viễn: nối `alias lt=\'ls -lt\'` vào `~/.bashrc`, rồi nạp lại bằng `source`.', hint: "echo \"alias lt='ls -lt'\" >> ~/.bashrc\nsource ~/.bashrc", check: AND(function (s) { return /alias lt='ls -lt'/.test(ftxt(s, s.home + '/.bashrc')) && /alias ll=/.test(ftxt(s, s.home + '/.bashrc')); }, function (s) { return s.aliases.lt === 'ls -lt'; }) },
    { text: 'Tạo `env.sh` chứa `export APP_ENV=staging`, chạy bằng `./env.sh` (biến không vào shell), rồi `source env.sh` (biến vào shell).', hint: "echo 'export APP_ENV=staging' > env.sh\nchmod +x env.sh\n./env.sh\nsource env.sh", check: AND(function (s) { return s.env.APP_ENV === 'staging'; }, OK(/^\.\/env\.sh$/), OK(/^source env\.sh$/)) },
    { text: 'Đặt giá trị mặc định: in `${PORT:-8080}` khi `PORT` chưa đặt.', hint: 'echo "${PORT:-8080}"', check: OK(/^echo 8080$/) },
    { text: 'Cắt đuôi tên file: với `f=todo.md`, in `todo.bak` bằng `${f%.md}`.', hint: 'f=todo.md\necho ${f%.md}.bak', check: OK(/^echo todo\.bak$/) }
  ]
};

var STARTSH = ['#!/bin/bash', 'if [ -z "$DB_URL" ]; then', '  echo "thiếu DB_URL" >&2', '  exit 1', 'fi', 'echo "kết nối $DB_URL" > started.txt'];
var DB = 'postgres://app@127.0.0.1:5432/tutor_db';

T.debugs = [
  {
    id: 'lb3d1', title: 'Lệnh tự viết: command not found',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls -l ~/bin/stamp', '-rwxr-xr-x 1 haidangphan haidangphan 40 Oct 27 10:20 /home/haidangphan/bin/stamp', '$ stamp', 'stamp: command not found'),
    story: 'Bạn viết script `~/bin/stamp` (đã có quyền chạy). Gõ `stamp` thì báo không tìm thấy, dù file ở đó.',
    goal: 'Gõ `stamp` được từ thư mục `work` và nó tạo ra file `stamped.txt`.',
    hints: ['`echo $PATH` có thư mục `~/bin` không?', 'Shell chỉ tìm lệnh trong các thư mục của PATH. `~/bin` chưa nằm trong đó.', 'Nối vào PATH: `export PATH="$HOME/bin:$PATH"`, rồi chạy `stamp` và `cat stamped.txt`.'],
    fix: ['echo $PATH', 'export PATH="$HOME/bin:$PATH"', 'stamp', 'cat stamped.txt'],
    cause: 'Shell chỉ tìm lệnh theo tên trong các thư mục của `$PATH`. File có quyền chạy mà không nằm trong PATH thì phải gọi bằng đường dẫn (`~/bin/stamp`). Ubuntu tự thêm `~/bin` vào PATH ở lần đăng nhập sau (qua `~/.profile`) nếu thư mục tồn tại lúc đó; muốn có ngay thì `export PATH="$HOME/bin:$PATH"`.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, s2.home + '/bin/stamp', '#!/bin/bash\necho "đã đóng dấu" > stamped.txt\n', { mode: 493 }); } }); },
    check: function (s) { return ftxt(s, W(s) + 'stamped.txt').indexOf('đã đóng dấu') >= 0; }
  },
  {
    id: 'lb3d2', title: 'Script báo thiếu DB_URL dù đã gán biến',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ DB_URL=' + DB, '$ ./start.sh', 'thiếu DB_URL'),
    story: 'Bạn gán `DB_URL` ngay trước khi chạy `./start.sh` nhưng script vẫn nói biến trống.',
    goal: 'Chạy `./start.sh` thành công, tạo ra `started.txt` chứa chuỗi kết nối.',
    hints: ['`start.sh` chạy trong tiến trình nào so với shell của bạn?', '`DB_URL=...` chỉ là biến shell, chưa export nên tiến trình con (script) không thấy.', '`export DB_URL=' + DB + '`, rồi `./start.sh` và `cat started.txt`.'],
    fix: ['export DB_URL=' + DB, './start.sh', 'cat started.txt'],
    cause: 'Script chạy trong tiến trình con và chỉ nhận **biến môi trường**. `X=1` không export thì chỉ sống trong shell hiện tại. Có hai cách: `export X=1` (cho cả phiên) hoặc `X=1 ./start.sh` (chỉ cho một lệnh).',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/start.sh', STARTSH.join('\n') + '\n', { mode: 493 }); } }); },
    check: function (s) { return ftxt(s, W(s) + 'started.txt').indexOf(DB) >= 0; }
  },
  {
    id: 'lb3d3', title: 'cp báo "cannot stat" với tên file có dấu cách',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ f="bao cao thang 10.txt"', '$ cp $f backup/', "cp: cannot stat 'bao': No such file or directory", "cp: cannot stat 'cao': No such file or directory", "cp: cannot stat 'thang': No such file or directory", "cp: cannot stat '10.txt': No such file or directory"),
    story: 'Bạn lưu tên file trong biến rồi dùng cho `cp`. File `bao cao thang 10.txt` có thật, nhưng `cp` lại coi như bốn file.',
    goal: 'File `bao cao thang 10.txt` có mặt trong thư mục `backup`.',
    hints: ['Có bao nhiêu đối số mà `cp` nhận được? Đếm các thông báo lỗi.', 'Biến không đặt trong nháy kép bị shell tách theo dấu cách.', 'Dùng `cp "$f" backup/` (nhớ gán `f` trong phiên của bạn trước).'],
    fix: ['f="bao cao thang 10.txt"', 'cp "$f" backup/', 'ls backup'],
    cause: 'Mở rộng biến không có nháy kép bị tách từ (word splitting) theo dấu cách. Luôn viết `"$f"`. Điều tương tự xảy ra với `rm $f`, nơi hậu quả là xoá nhầm file khác.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/bao cao thang 10.txt', 'số liệu\n'); s2.fs.mkdirp(h + '/backup', s2.user, 493); } }); },
    check: function (s) { return !!s.fs.get(W(s) + 'backup/bao cao thang 10.txt'); }
  },
  {
    id: 'lb3d4', title: 'Chạy script cấu hình xong mà biến vẫn trống', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ cat env.sh', 'export APP_ENV=prod', 'export APP_PORT=8080', '$ ./env.sh', '$ echo "[$APP_ENV][$APP_PORT]"', '[][]', '$ bash env.sh; echo "[$APP_ENV]"', '[]'),
    story: 'Đồng nghiệp đưa `env.sh` để nạp biến môi trường. Bạn chạy bằng `./env.sh` rồi cả `bash env.sh`, nhưng không biến nào xuất hiện trong phiên của bạn.',
    goal: 'Trong phiên hiện tại, `APP_ENV` là `prod` và `APP_PORT` là `8080`.',
    hints: ['`./env.sh` và `bash env.sh` chạy script ở đâu so với shell của bạn?', 'Cả hai tạo shell **con**; biến export trong shell con biến mất khi nó kết thúc, không lan lên shell cha.', 'Chạy script ngay trong shell hiện tại: `source env.sh` (hoặc `. env.sh`), rồi `env | grep APP_`.'],
    fix: ['./env.sh', 'source env.sh', 'env | grep APP_'],
    cause: 'Tiến trình con không thể đổi môi trường của tiến trình cha. Chỉ `source`/`.` chạy các dòng trong chính shell hiện tại. Mẫu hay gặp: `source .env`, `source venv/bin/activate`, `source ~/.bashrc`: tất cả đều cần `source` vì mục đích của chúng là thay đổi phiên hiện tại.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/env.sh', 'export APP_ENV=prod\nexport APP_PORT=8080\n', { mode: 493 }); } }); },
    check: function (s) { return s.env.APP_ENV === 'prod' && s.env.APP_PORT === '8080'; }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
