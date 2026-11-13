(function (G) {
'use strict';
/* Chương lb1: hệ thống file và điều hướng. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
function normPath(p) { var o = []; p.split('/').forEach(function (x) { if (!x || x === '.') return; if (x === '..') o.pop(); else o.push(x); }); return '/' + o.join('/'); }
function linkTo(s, path, want) { var n = s.fs.get(path, true); if (!n || n.t !== 'l') return false; var t = String(n.target || ''); var abs = t.charAt(0) === '/' ? t : path.replace(/\/[^\/]*$/, '/') + t; return normPath(abs) === normPath(want); }
/* ls với các cờ cho trước (thứ tự tuỳ ý) và đối số khớp argRe */
function LSF(chars, argRe) {
  return function (s) {
    return s.hist.some(function (h) {
      if (h.code !== 0 || !/^ls( |$)/.test(h.cmd)) return false;
      var fl = h.cmd.split(' ').filter(function (x) { return /^-[a-zA-Z]+$/.test(x); }).join('').replace(/-/g, '');
      for (var i = 0; i < chars.length; i++) if (fl.indexOf(chars.charAt(i)) < 0) return false;
      return !argRe || argRe.test(h.cmd);
    });
  };
}
var W = function (s) { return s.home + '/work/'; };

var T = {
  id: 'lb1', group: 'Linux căn bản', short: 'Hệ thống file',
  title: 'Hệ thống file và điều hướng',
  dek: 'Cây thư mục Linux, đường dẫn tuyệt đối và tương đối, tạo, chép, di chuyển, xoá; liên kết cứng và mềm; kiểm tra dung lượng. Nền tảng cho mọi thao tác trên VPS.'
};
C.insertFirst(T);

T.theory = [
  { tag: 'Khái niệm', title: 'Cây thư mục Linux: mọi thứ bắt đầu từ /', body: [
    'Linux chỉ có **một cây thư mục** duy nhất, gốc là `/`. Ổ đĩa, USB, thiết bị đều được "gắn" (mount) vào một nhánh nào đó của cây này, không có ổ `C:` hay `D:` như Windows. Triết lý chung: **mọi thứ là file**, kể cả thiết bị và tiến trình.',
    { tbl: [['Thư mục', 'Chứa gì', 'Ví dụ trên VPS của bạn'], ['`/`', 'Gốc của cả hệ thống', ''], ['`/home`', 'Thư mục riêng của từng user', '`/home/haidangphan`'], ['`/root`', 'Thư mục riêng của user root', ''], ['`/etc`', 'Cấu hình hệ thống (chỉ văn bản)', '`/etc/nginx/`, `/etc/ssh/sshd_config`'], ['`/var`', 'Dữ liệu thay đổi liên tục', '`/var/log/` (log), `/var/lib/` (dữ liệu DB)'], ['`/usr`, `/bin`', 'Chương trình đã cài', '`/usr/bin/node`'], ['`/opt`', 'Phần mềm cài thêm ngoài apt', '`/opt/tutor`'], ['`/srv`', 'Dữ liệu do dịch vụ phục vụ ra ngoài', '`/srv/tutor` (mã nguồn web)'], ['`/tmp`', 'File tạm, xoá khi khởi động lại', ''], ['`/dev`', 'Thiết bị (ổ đĩa, `null`)', '`/dev/null`'], ['`/proc`', 'Thông tin tiến trình và kernel (ảo)', '`/proc/meminfo`'], ['`/mnt`, `/media`', 'Điểm gắn ổ đĩa phụ', '`/mnt/data`']] },
    { note: 'Quy ước hay dùng khi triển khai: **cấu hình** nằm ở `/etc`, **log** ở `/var/log`, **mã nguồn web** ở `/srv` hoặc `/var/www` hoặc `/opt`, **dữ liệu cá nhân và script** ở `/home`.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Đường dẫn: tuyệt đối, tương đối và các ký hiệu đặc biệt', body: [
    { tbl: [['Ký hiệu', 'Nghĩa'], ['`/etc/ssh`', 'Đường dẫn **tuyệt đối**: bắt đầu bằng `/`, đúng ở mọi nơi'], ['`projects/tutor`', 'Đường dẫn **tương đối**: tính từ thư mục hiện tại'], ['`.`', 'Thư mục hiện tại'], ['`..`', 'Thư mục cha'], ['`~`', 'Thư mục home của bạn'], ['`~tutor`', 'Home của user `tutor`'], ['`-`', 'Với `cd -`: quay lại thư mục trước đó']] },
    { pre: ['pwd                      # cho biết đang ở đâu', 'cd /var/log               # tuyệt đối', 'cd ../..                  # lên hai cấp', 'cd ~/work/projects        # từ home đi xuống', 'cd -                      # về chỗ vừa đứng', 'cd                        # cd không đối số = về home'], cap: 'Điều hướng' },
    { ul: ['Linux **phân biệt hoa thường**: `Notes.txt` và `notes.txt` là hai file khác nhau', 'Tên file nên tránh khoảng trắng. Nếu có, phải đặt trong nháy: `cd "My Photos"` hoặc `cd My\\ Photos`', 'Dùng phím **Tab** để tự điền tên, bấm hai lần để xem gợi ý. Tiết kiệm thời gian và tránh gõ sai', 'Script cần chạy ổn định nên dùng đường dẫn **tuyệt đối** (hoặc `cd` vào thư mục trước), vì thư mục hiện tại của cron hay systemd không phải home của bạn'] }
  ] },
  { tag: 'Cú pháp', title: 'ls: xem nội dung thư mục', body: [
    { tbl: [['Lệnh', 'Tác dụng'], ['`ls`', 'Tên file, bỏ qua file ẩn'], ['`ls -l`', 'Danh sách dài: quyền, chủ, kích thước, ngày sửa'], ['`ls -a`', 'Hiện cả file ẩn (tên bắt đầu bằng `.`)'], ['`ls -lh`', 'Kích thước dễ đọc: `4.0K`, `1.5M`'], ['`ls -lt`', 'Mới sửa nhất lên đầu (`-r` để đảo ngược)'], ['`ls -lS`', 'File lớn nhất lên đầu'], ['`ls -d */`', 'Chỉ liệt kê thư mục'], ['`ls -R`', 'Đệ quy vào thư mục con'], ['`ls -F`', 'Thêm ký hiệu: `/` thư mục, `*` chạy được, `@` liên kết'], ['`ls -li`', 'Kèm số inode']] },
    { pre: ['$ ls -l scripts', 'total 8', '-rw-r--r-- 1 haidangphan haidangphan 79 Oct 27 10:20 backup.sh', '-rwxr-xr-x 1 haidangphan haidangphan 88 Oct 27 10:20 deploy.sh', '|\\_/|\\_/|\\_/| |  |            |            |   |            |', ' loại|quyền | |  chủ          nhóm        cỡ   ngày sửa       tên', '      liên kết (số hard link)'], cap: 'Đọc một dòng ls -l' },
    'Ký tự đầu của `ls -l`: `-` file thường, `d` thư mục, `l` liên kết mềm. Chín ký tự sau là quyền `rwx` cho chủ, nhóm và người khác (chương *Quyền và sở hữu* nói kỹ).',
    { note: 'File ẩn như `.env`, `.gitignore`, `.ssh` không hiện với `ls` thường. Khi "mất" file cấu hình, hãy thử `ls -a` trước.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Tạo, sao chép, di chuyển, xoá', body: [
    { tbl: [['Lệnh', 'Tác dụng', 'Lưu ý'], ['`mkdir tên`', 'Tạo thư mục', '`-p` tạo cả chuỗi thư mục cha: `mkdir -p a/b/c`'], ['`touch f`', 'Tạo file rỗng hoặc cập nhật giờ sửa', ''], ['`cp a b`', 'Sao chép file', '`-r` cho thư mục, `-a` giữ quyền và thời gian, `-v` nói rõ, `-i` hỏi trước khi ghi đè'], ['`mv a b`', 'Di chuyển **hoặc đổi tên**', 'Cùng một lệnh: `mv a.txt b.txt` là đổi tên'], ['`rm f`', 'Xoá file', '`-r` thư mục, `-f` không hỏi, `-i` hỏi từng file'], ['`rmdir d`', 'Xoá thư mục **rỗng**', 'An toàn hơn `rm -r`']] },
    { pre: ['mkdir -p reports/2026/10          # tạo chuỗi thư mục', 'cp notes.txt reports/              # chép vào thư mục', 'cp -r photos photos-backup         # chép cả thư mục', 'mv todo.md TODO.md                # đổi tên', 'mv photos/a.jpg /tmp/              # di chuyển', 'rm tmp/session.tmp                # xoá file', 'rm -r photos-backup               # xoá cả thư mục'], cap: 'Thao tác thường ngày' },
    { pre: ['mkdir -p proj/{src,docs,tests}    # brace expansion: tạo ba thư mục một lần', 'ls photos/*.jpg                   # * khớp mọi chuỗi', 'ls photos/?.png                   # ? khớp đúng một ký tự', 'ls photos/[ab].jpg                # [ab] một trong các ký tự', 'cp notes.txt{,.bak}               # = cp notes.txt notes.txt.bak'], cap: 'Ký tự đại diện (glob) và brace' },
    { note: 'Linux **không có thùng rác** trong dòng lệnh: `rm` là mất luôn. Trước khi xoá hàng loạt, hãy `ls` đúng mẫu đó trước (`ls *.tmp`, rồi mới `rm *.tmp`). Đặc biệt nguy hiểm: `rm -rf /` hoặc `rm -rf $BIEN/` khi biến rỗng.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Đọc file: cat, less, head, tail, wc, file', body: [
    { tbl: [['Lệnh', 'Dùng khi'], ['`cat f`', 'File ngắn, in hết ra màn hình'], ['`less f`', 'File dài; cuộn mũi tên, `/từ` tìm, `n` kết quả kế, `G` cuối file, `q` thoát'], ['`head -n 5 f`', '5 dòng đầu'], ['`tail -n 20 f`', '20 dòng cuối'], ['`tail -f f`', 'Theo dõi log theo thời gian thực (Ctrl+C để dừng)'], ['`wc -l f`', 'Đếm dòng'], ['`file f`', 'Đoán loại file (văn bản, ELF, gzip...)'], ['`tree -L 2`', 'Vẽ cây thư mục (cần `sudo apt install tree`)']] },
    { pre: ['tail -n 5 logs/app.log', 'wc -l logs/app.log', 'file report.pdf scripts/deploy.sh', 'less /var/log/syslog        # q để thoát'], cap: 'Ví dụ' },
    { note: '`cat` một file lớn (nhiều trăm MB) sẽ tràn màn hình. Với log hãy dùng `less`, `tail`, hoặc `grep` (chương *Công cụ văn bản*).', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Liên kết: hard link và symlink', body: [
    'Một file trong Linux gồm **inode** (siêu dữ liệu và vị trí dữ liệu) và một hay nhiều **tên** trỏ tới inode đó.',
    { tbl: [['', 'Liên kết mềm (symlink)', 'Liên kết cứng (hard link)'], ['Lệnh', '`ln -s đích tên`', '`ln đích tên`'], ['Bản chất', 'File nhỏ chứa **đường dẫn** tới đích', 'Một **tên khác** cho cùng inode'], ['Xoá file gốc', 'Liên kết thành "gãy" (dangling)', 'Dữ liệu vẫn còn qua tên còn lại'], ['Sửa nội dung', 'Sửa qua đâu cũng như nhau', 'Sửa qua đâu cũng như nhau (cùng một dữ liệu)'], ['Áp dụng cho thư mục', 'Có', 'Không'], ['Qua ổ đĩa khác', 'Được', 'Không'], ['Nhận biết', '`ls -l` thấy `->`', '`ls -li` hai tên cùng inode, cột số liên kết tăng']] },
    { pre: ['ln -s projects/tutor current      # current -> projects/tutor', 'ls -l current                      # lrwxrwxrwx ... current -> projects/tutor', 'readlink -f current                # đường dẫn thật', 'ln notes.txt notes.hard            # hard link', 'ls -li notes.txt notes.hard        # cùng số inode, số liên kết = 2'], cap: 'Tạo và kiểm tra' },
    { ul: ['Mẫu triển khai phổ biến: `releases/v1`, `releases/v2` và `current -> releases/v2`. Chuyển phiên bản bằng `ln -sfn releases/v3 current` (nhanh, có thể quay lại)', 'Symlink tương đối được tính **từ thư mục chứa symlink**, không phải từ nơi bạn gõ lệnh. Lỗi phổ biến nhất khi tạo link', '`cp` tạo bản **độc lập**, còn `ln` thì không. Đừng dùng hard link để "sao lưu": sửa một bên là hỏng cả hai'] }
  ] },
  { tag: 'Bảng tra', title: 'Dung lượng: df, du và tìm thứ chiếm chỗ', body: [
    { tbl: [['Lệnh', 'Cho biết'], ['`df -h`', 'Mức dùng của từng ổ/phân vùng'], ['`df -h /`', 'Chỉ ổ chứa `/`'], ['`df -i`', 'Mức dùng **inode** (hết inode cũng báo "No space left")'], ['`du -sh thư-mục`', 'Tổng dung lượng một thư mục'], ['`du -h --max-depth=1 .`', 'Dung lượng từng thư mục con cấp 1'], ['`ls -lS`', 'Sắp xếp file theo kích thước'], ['`find . -size +100M`', 'File lớn hơn 100 MB'], ['`find . -mtime +30`', 'File không đổi hơn 30 ngày']] },
    { pre: ['du -h --max-depth=1 . | sort -h        # thư mục nào nặng nhất nằm cuối', 'find logs -size +1M                  # log lớn hơn 1 MB', 'find logs -mtime +30                 # log cũ hơn 30 ngày', 'df -h /'], cap: 'Quy trình khi ổ đĩa đầy' },
    { note: 'Khi ổ đầy, đi từ ngoài vào trong: `df -h` (ổ nào), rồi `du -h --max-depth=1 /var | sort -h` (thư mục nào), rồi `ls -lS` (file nào). Thường là `/var/log` hoặc các file dump/backup cũ.', kind: 'tip' }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Thông báo', 'Nguyên nhân', 'Cách sửa'], ['`No such file or directory`', 'Sai tên, sai thư mục, sai hoa thường, hoặc symlink gãy', '`pwd`, `ls`, `ls -a`; dùng Tab'], ['`cannot stat \'My\'` rồi `\'Photos\'`', 'Tên có khoảng trắng chưa đặt trong nháy', '`"My Photos"`'], ['`Is a directory` / `omitting directory`', 'Dùng `cp`/`rm` cho thư mục thiếu `-r`', '`cp -r`, `rm -r`'], ['`Not a directory`', 'Dùng file như thư mục (`cd file`)', 'Kiểm tra bằng `ls -l`'], ['`Directory not empty`', '`rmdir` thư mục còn file', '`rm -r` (cẩn thận) hoặc dọn trước'], ['`Permission denied`', 'Thiếu quyền', 'Chương *Quyền và sở hữu*'], ['`File exists`', 'Tên đích đã có', 'Đổi tên, hoặc `-f` nếu đúng ý'], ['`No space left on device`', 'Hết dung lượng hoặc inode', '`df -h`, `df -i`, `du`']] },
    { ul: ['Đã `pwd` để chắc mình đang ở đúng thư mục chưa?', 'Với lệnh xoá hàng loạt: đã chạy `ls` cùng mẫu đó và đọc kết quả chưa?', 'Đường dẫn trong script có tuyệt đối (hoặc script tự `cd`) không?', 'Tên có khoảng trắng hay ký tự đặc biệt đã được đặt trong nháy chưa?'] }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`pwd`", "In đường dẫn thư mục hiện tại (print working directory).", "/home/haidangphan/work"], ["`ls -la`", "Liệt kê mọi mục, kể cả file ẩn (-a), với quyền, chủ sở hữu, kích thước và ngày sửa (-l).", "total 288 / drwxr-xr-x 9 haidangphan haidangphan   4096 Oct 27 10:20 . / drwxr-xr-x 6 haidangphan haidangphan   4096 Oct 27 10:20 .. / dr…"], ["`cd projects/tutor`", "Đi vào thư mục con bằng đường dẫn tương đối. Thành công thì không in gì.", "(không in ra)"], ["`cd ../..`", "Lên hai cấp thư mục cha (.. là thư mục cha).", "(không in ra)"], ["`cd /var/log`", "Đi tới đường dẫn tuyệt đối, bắt đầu bằng dấu /.", "(không in ra)"], ["`cd -`", "Quay lại thư mục vừa đứng trước đó (cd - ).", "(không in ra)"], ["`cd`", "Về thư mục home của người dùng (tương đương cd ~).", "(không in ra)"], ["`cd ~/work`", "Đi tới thư mục work trong home; ~ là đường dẫn home.", "(không in ra)"], ["`ls -lh logs`", "Liệt kê kích thước dễ đọc (K, M) nhờ tuỳ chọn -h.", "total 5172 / -rw-r--r-- 1 haidangphan haidangphan  138 Oct 27 10:20 app.log / -rw-r--r-- 1 haidangphan haidangphan  47K Oct 25 10:20 erro…"], ["`ls -lS logs`", "Sắp xếp theo kích thước (-S), file lớn nhất đứng đầu.", "total 5172 / -rw-r--r-- 1 haidangphan haidangphan 5242880 Sep 17 10:20 old.log / -rw-r--r-- 1 haidangphan haidangphan   48000 Oct 25 10:2…"], ["`ls -d */`", "Chỉ liệt kê thư mục: */ khớp mọi mục và -d không đi vào bên trong.", "data/  logs/  photos/  projects/  reports/  scripts/  tmp/"], ["`mkdir -p reports/2026/10`", "Tạo cây thư mục lồng nhau; -p tạo luôn cả thư mục cha.", "(không in ra)"], ["`touch reports/2026/10/summary.txt`", "Tạo file rỗng mới (hoặc cập nhật thời gian sửa nếu đã có).", "(không in ra)"], ["`cp notes.txt reports/2026/10/notes-copy.txt`", "Sao chép notes.txt sang tên mới; file gốc vẫn giữ nguyên.", "(không in ra)"], ["`cp -r photos photos-backup`", "Sao chép cả thư mục; -r là đệ quy (lặp lại cho mọi file bên trong).", "(không in ra)"], ["`mv todo.md TODO.md`", "Đổi tên todo.md thành TODO.md (mv trong cùng thư mục là đổi tên).", "(không in ra)"], ["`mv photos/holiday photos/trip`", "Đổi tên thư mục holiday thành trip.", "(không in ra)"], ["`mkdir -p proj/{src,docs,tests}`", "Dấu ngoặc nhọn tạo ba thư mục con src, docs, tests cùng lúc.", "(không in ra)"], ["`rmdir proj/docs`", "Xoá thư mục rỗng. Nếu thư mục còn file thì lệnh báo lỗi.", "(không in ra)"], ["`ls photos/*.jpg`", "Dấu * là ký tự đại diện: khớp mọi tên kết thúc bằng .jpg.", "photos/a.jpg  photos/b.jpg"], ["`rm tmp/session.tmp`", "Xoá file. Xoá rồi thì không khôi phục được bằng lệnh này.", "(không in ra)"], ["`tail -n 5 logs/app.log`", "Xem 5 dòng cuối của file log (tail -n 5).", "2026-10-27 10:00:01 INFO  api start port=3000 / 2026-10-27 10:00:09 ERROR api GET /users 500 / 2026-10-27 10:04:00 INFO  api GET /healthz…"], ["`wc -l logs/app.log`", "Đếm số dòng trong file (wc = word count, -l đếm dòng).", "3 logs/app.log"], ["`file report.pdf scripts/deploy.sh`", "Đoán loại file từ nội dung, không chỉ dựa vào đuôi file.", "report.pdf: PDF document, version 1.4 / scripts/deploy.sh: Bourne-Again shell script, Unicode text, UTF-8 text executable"], ["`ln -s projects/tutor current`", "Tạo liên kết mềm (symlink) tên current trỏ tới projects/tutor.", "(không in ra)"], ["`readlink -f current`", "In đường dẫn thật mà liên kết trỏ tới (-f đi theo toàn bộ chuỗi liên kết).", "/home/haidangphan/work/projects/tutor"], ["`ln notes.txt notes.hard`", "Tạo liên kết cứng notes.hard: hai tên cùng trỏ tới một dữ liệu.", "(không in ra)"], ["`ls -li notes.txt notes.hard`", "-i hiện số inode. Cùng số inode nghĩa là cùng một dữ liệu; cột thứ hai là số liên kết.", "393226 -rw-r--r-- 2 haidangphan haidangphan 134 Oct 27 10:20 notes.hard /   393226 -rw-r--r-- 2 haidangphan haidangphan 134 Oct 27 10:20 …"], ["`df -h /`", "Xem dung lượng còn trống của phân vùng chứa thư mục gốc (-h dạng dễ đọc).", "Filesystem Size Used Avail Use% Mounted on / /dev/vda1   40G  11G   29G  29% /"], ["`du -h --max-depth=1 . | sort -h`", "Dung lượng từng thư mục con, sắp xếp tăng dần để thấy thư mục nặng nhất ở cuối.", "8.0K\t./data / 12K\t./proj / 12K\t./scripts / 12K\t./tmp / 20K\t./reports / 56K\t./projects / 5.1M\t./logs / 7.3M\t./photos / 7.3M\t./photos-backu…"], ["`find logs -size +1M`", "Tìm file lớn hơn 1 MB trong thư mục logs.", "logs/old.log"], ["`find logs -mtime +30`", "Tìm file có thời gian sửa cách đây hơn 30 ngày.", "logs/old.log"], ["`mkdir \"my docs\"`", "Tên có khoảng trắng phải đặt trong nháy, nếu không shell tách thành hai tham số.", "(không in ra)"], ["`cd \"my docs\"`", "Vào thư mục có khoảng trắng trong tên; nháy là bắt buộc.", "(không in ra)"], ["`sudo apt install -y tree`", "Cài công cụ tree. Cần sudo vì ghi vào hệ thống; -y tự đồng ý.", "Reading package lists... Done / Building dependency tree... Done / Reading state information... Done / The following NEW packages will be…"], ["`tree -L 2 projects`", "Hiển thị cây thư mục tới 2 cấp. Kết quả báo lỗi mở thư mục; lỗi này do trạng thái bài mô phỏng ở bước này, không phải lỗi lệnh.", "projects [error opening dir] /  / 0 directories, 0 files"], ["`cd khong-co`", "Thử vào thư mục không tồn tại: shell báo lỗi và không đổi thư mục.", "bash: cd: khong-co: No such file or directory"]]}]});
T.quiz = C.QZ(5, [
  ['Đường dẫn nào là **tuyệt đối**?', '`/var/log/syslog`', ['`var/log/syslog`', '`../log/syslog`', '`~log/syslog`'], 'Đường dẫn tuyệt đối luôn bắt đầu bằng `/` và đúng ở mọi nơi.'],
  ['`cd -` làm gì?', 'Quay lại thư mục trước đó', ['Lên một cấp', 'Về thư mục home', 'Báo lỗi vì thiếu đối số'], '`cd -` đổi sang `$OLDPWD`, tiện khi nhảy qua lại giữa hai thư mục.'],
  ['Cấu hình dịch vụ trên Linux thường nằm ở thư mục nào?', '`/etc`', ['`/var`', '`/tmp`', '`/proc`'], '`/etc` chứa cấu hình hệ thống; `/var/log` chứa log; `/tmp` là file tạm.'],
  ['Vì sao `ls` không hiện file `.env`?', 'File bắt đầu bằng dấu chấm là file ẩn; dùng `ls -a`', ['`.env` thật sự không tồn tại', 'Cần quyền root để xem', '`ls` chỉ hiện file văn bản'], 'File ẩn chỉ hiện khi có `-a` (hoặc `-A`).'],
  ['`mv todo.md TODO.md` thực chất là?', 'Đổi tên file', ['Sao chép file', 'Tạo liên kết', 'Xoá todo.md và tạo file rỗng'], 'Trong Linux, đổi tên và di chuyển là cùng một lệnh `mv`.'],
  ['Cách tạo `proj/src`, `proj/docs`, `proj/tests` trong một lệnh?', '`mkdir -p proj/{src,docs,tests}`', ['`mkdir proj/src,docs,tests`', '`mkdir -r proj/src docs tests`', '`mkdir proj/*`'], 'Brace expansion `{a,b,c}` tạo ba đối số; `-p` tạo luôn thư mục cha `proj`.'],
  ['`rm` có thùng rác để khôi phục không?', 'Không, xoá là mất', ['Có, trong `~/.Trash`', 'Có, dùng `undo`', 'Chỉ khi thêm `-i`'], 'Dòng lệnh không có thùng rác. Hãy kiểm tra bằng `ls` trước khi xoá hàng loạt.'],
  ['Khác biệt giữa symlink và hard link khi xoá file gốc?', 'Symlink bị gãy, hard link vẫn đọc được dữ liệu', ['Cả hai đều bị gãy', 'Hard link bị gãy, symlink vẫn đọc được', 'Cả hai đều vẫn đọc được'], 'Hard link là một tên khác cho cùng inode, dữ liệu chỉ mất khi mọi tên bị xoá.'],
  ['`ln -s app/releases/v2 app/current` chạy ở thư mục cha của `app`, tạo ra link không dùng được. Vì sao?', 'Đích tương đối được tính từ thư mục chứa symlink (`app/`), thành `app/app/releases/v2`', ['Thiếu quyền root', '`ln -s` cần đường dẫn tuyệt đối đầu `/`', 'Vì `current` phải là thư mục có sẵn'], 'Dùng `ln -s releases/v2 app/current` hoặc đường dẫn tuyệt đối.'],
  ['Lệnh nào cho biết thư mục con nào nặng nhất, nặng nhất ở cuối?', '`du -h --max-depth=1 . | sort -h`', ['`ls -lS .`', '`df -h .`', '`du -s . | sort`'], '`du` tính dung lượng từng thư mục; `sort -h` hiểu hậu tố K/M/G.'],
  ['Hết chỗ nhưng `df -h` vẫn còn nhiều dung lượng trống. Nên kiểm tra gì?', 'Inode, bằng `df -i`', ['Tốc độ mạng', 'Quyền của thư mục /', 'Phiên bản kernel'], 'Hàng triệu file nhỏ có thể dùng hết inode trong khi dung lượng vẫn còn.'],
  ['Tên thư mục "My Photos" có dấu cách. Cách gõ đúng?', '`cd "My Photos"`', ['`cd My Photos`', '`cd My+Photos`', '`cd (My Photos)`'], 'Dấu cách phân tách đối số. Đặt trong nháy hoặc thêm `\\` trước dấu cách.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Đi vào `photos/holiday` rồi xem đường dẫn hiện tại bằng `pwd`, sau đó về `~/work` bằng `cd ~/work`.', hint: 'cd photos/holiday\npwd\ncd ~/work', check: AND(OK(/^cd photos\/holiday\/?$/), OK(/^pwd$/), OK(/^cd ~\/work\/?$|^cd \/home\/haidangphan\/work\/?$/)) },
    { text: 'Liệt kê cả file ẩn trong thư mục hiện tại bằng `ls -lA`.', hint: 'ls -lA', check: LSF('lA') },
    { text: 'Đi vào `projects/tutor/src/routes` bằng đường dẫn tương đối.', hint: 'cd projects/tutor/src/routes', check: OK(/^cd projects\/tutor\/src\/routes\/?$/) },
    { text: 'Lên ba cấp thư mục bằng `..` để về `projects`.', hint: 'cd ../../..', check: OK(/^cd \.\.\/\.\.\/\.\.\/?$/) },
    { text: 'Nhảy sang `/etc/sudoers.d` bằng đường dẫn tuyệt đối.', hint: 'cd /etc/sudoers.d', check: OK(/^cd \/etc\/sudoers\.d\/?$/) },
    { text: 'Từ đó quay lại thư mục trước bằng `cd -`.', hint: 'cd -', check: OK(/^cd -$/) },
    { text: 'Về home bằng `cd`, vào `~/work/tmp`, rồi quay lại `~/work` bằng `cd ~/work`.', hint: 'cd\ncd ~/work/tmp\ncd ~/work', check: AND(OK(/^cd$/), OK(/^cd ~\/work\/tmp\/?$|^cd \/home\/haidangphan\/work\/tmp\/?$/), OK(/^cd ~\/work\/?$|^cd \/home\/haidangphan\/work\/?$/)) },
    { text: 'Xem thư mục `photos` với kích thước dễ đọc bằng `ls -lh photos`.', hint: 'ls -lh photos', check: LSF('lh', /photos\/?$/) },
    { text: 'Sắp xếp `photos` theo kích thước, file nhỏ nhất đứng đầu: `ls -lSr photos`.', hint: 'ls -lSr photos', check: LSF('lSr', /photos\/?$/) },
    { text: 'Chỉ liệt kê thư mục con của `projects/tutor` bằng `ls -d`.', hint: 'ls -d projects/tutor/*/', check: OK(/^ls -d projects\/tutor\/(node_modules|src)/) },
    { text: 'Tạo chuỗi thư mục `archive/2025/09` bằng một lệnh.', hint: 'mkdir -p archive/2025/09', check: function (s) { return s.fs.isD(W(s) + 'archive/2025/09'); } },
    { text: 'Tạo file rỗng `archive/2025/09/summary.txt`.', hint: 'touch archive/2025/09/summary.txt', check: function (s) { return !!s.fs.get(W(s) + 'archive/2025/09/summary.txt'); } },
    { text: 'Chép `todo.md` vào `archive/2025/09/` với tên `todo-copy.md`.', hint: 'cp todo.md archive/2025/09/todo-copy.md', check: function (s) { var t = ftxt(s, W(s) + 'archive/2025/09/todo-copy.md'); return t !== '' && t === ftxt(s, W(s) + 'todo.md'); } },
    { text: 'Sao chép cả thư mục `projects/tutor/src` thành `src-backup`.', hint: 'cp -r projects/tutor/src src-backup', check: function (s) { return !!s.fs.get(W(s) + 'src-backup/app.js') && !!s.fs.get(W(s) + 'src-backup/routes/users.js'); } },
    { text: 'Đổi tên `report.pdf` thành `report-2026.pdf`.', hint: 'mv report.pdf report-2026.pdf', check: function (s) { return !!s.fs.get(W(s) + 'report-2026.pdf') && !s.fs.get(W(s) + 'report.pdf'); } },
    { text: 'Đổi tên thư mục `data` thành `dataset`.', hint: 'mv data dataset', check: function (s) { return s.fs.isD(W(s) + 'dataset') && !s.fs.get(W(s) + 'data'); } },
    { text: 'Tạo ba thư mục `site/css`, `site/js`, `site/img` bằng brace expansion.', hint: 'mkdir -p site/{css,js,img}', check: OK(/^mkdir -p site\/css site\/js site\/img$/), transient: true },
    { text: 'Xoá thư mục rỗng `site/img` bằng `rmdir`.', hint: 'rmdir site/img', check: function (s) { return !s.fs.get(W(s) + 'site/img') && s.fs.isD(W(s) + 'site/css'); }, transient: true },
    { text: 'Liệt kê file `.png` trong `photos` bằng ký tự đại diện `*`.', hint: 'ls photos/*.png', check: OK(/^ls photos\/c\.png$/) },
    { text: 'Xoá file tạm `tmp/cache2.tmp`.', hint: 'rm tmp/cache2.tmp', check: function (s) { return !s.fs.get(W(s) + 'tmp/cache2.tmp'); } },
    { text: 'Xem 4 dòng cuối của `logs/error.log`.', hint: 'tail -n 4 logs/error.log', check: OK(/^tail -n 4 logs\/error\.log$|^tail -4 logs\/error\.log$/) },
    { text: 'Đếm số dòng của `projects/tutor/src/app.js`.', hint: 'wc -l projects/tutor/src/app.js', check: OK(/^wc -l projects\/tutor\/src\/app\.js$/) },
    { text: 'Kiểm tra loại của `report-2026.pdf` và `scripts/backup.sh` bằng `file`.', hint: 'file report-2026.pdf scripts/backup.sh', check: OK(/^file report-2026\.pdf scripts\/backup\.sh$/) },
    { text: 'Tạo symlink `latest` trỏ tới `projects/tutor/src`.', hint: 'ln -s projects/tutor/src latest', check: function (s) { return linkTo(s, W(s) + 'latest', W(s) + 'projects/tutor/src'); } },
    { text: 'In đường dẫn thật của `latest` bằng `readlink -f`.', hint: 'readlink -f latest', check: OK(/^readlink -f latest$/) },
    { text: 'Tạo hard link `todo.hard` cho `todo.md` và xem số inode của hai tên bằng `ls -li`.', hint: 'ln todo.md todo.hard\nls -li todo.md todo.hard', check: function (s) { var n = s.fs.get(W(s) + 'todo.hard'); return !!n && n.nl === 2 && n === s.fs.get(W(s) + 'todo.md'); } },
    { text: 'Xem số inode còn trống của hệ thống bằng `df -i`.', hint: 'df -i', check: OK(/^df -i$/) },
    { text: 'Xem thư mục con nào trong `photos` nặng nhất.', hint: 'du -h --max-depth=1 photos | sort -h', check: AND(OK(/^du -h --max-depth=1 photos$/), OK(/^sort -h$/)) },
    { text: 'Tìm file lớn hơn 1 MB trong `photos`.', hint: 'find photos -size +1M', check: OK(/^find photos -size \+1M$/) },
    { text: 'Tìm file trong `logs` cũ hơn 10 ngày.', hint: 'find logs -mtime +10', check: OK(/^find logs -mtime \+10$/) },
    { text: 'Tạo và vào thư mục có dấu cách `bai tap`.', hint: 'mkdir "bai tap"\ncd "bai tap"', check: AND(function (s) { return s.fs.isD(W(s) + 'bai tap'); }, OK(/^cd bai tap$/)) },
    { text: 'Cài `tree` rồi xem cây `photos` sâu 1 cấp.', hint: 'sudo apt install -y tree\ntree -L 1 ~/work/photos', check: AND(OK(/^sudo apt install -y tree$/), OK(/^tree -L 1 (~\/work|\/home\/haidangphan\/work)\/photos\/?$/)) },
    { text: 'Đọc lỗi: thử `cd` vào `logs/2025` không tồn tại.', hint: 'cd logs/2025', check: FAIL(/^cd logs\/2025$/) }
  ]
};

var COPYSH = ['#!/bin/bash', 'mkdir -p backup', 'cp -r My Photos backup/'];
T.debugs = [
  {
    id: 'lb1d1', title: 'Script sao lưu ảnh báo cannot stat \'My\'',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./copy-photos.sh', "cp: cannot stat 'My': No such file or directory", "cp: cannot stat 'Photos': No such file or directory", '$ ls backup', '(trống)'),
    story: 'Thư mục ảnh của bạn tên **My Photos** (có dấu cách). Script `copy-photos.sh` sao chép nó vào `backup/` nhưng báo hai lỗi lạ.',
    goal: 'Sau khi sửa và chạy lại, `backup/My Photos/` có đủ ảnh.',
    hints: ['`cat copy-photos.sh` và `ls`. Tên thư mục thật là gì?', 'Dấu cách làm shell tách thành hai đối số `My` và `Photos`, nên `cp` tìm hai thứ không tồn tại.', 'Đặt tên trong nháy: `sed -i \'s/cp -r My Photos/cp -r "My Photos"/\' copy-photos.sh`, rồi `./copy-photos.sh` và `ls backup`.'],
    fix: ['cat copy-photos.sh', "sed -i 's/cp -r My Photos/cp -r \"My Photos\"/' copy-photos.sh", './copy-photos.sh', 'ls backup'],
    cause: 'Shell tách lệnh theo dấu cách. Tên có dấu cách phải đặt trong nháy (`"My Photos"`) hoặc thêm `\\` (`My\\ Photos`). Tốt nhất là tránh dấu cách khi tự đặt tên, nhưng file từ Windows, macOS hay điện thoại thường có.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      s2.fs.mkdirp(h + '/My Photos', s2.user, 493); LB.put(s2, h + '/My Photos/x.jpg', 'JFIF', { size: 100000 }); LB.put(s2, h + '/My Photos/y.jpg', 'JFIF', { size: 120000 });
      LB.put(s2, h + '/copy-photos.sh', COPYSH.join('\n') + '\n', { mode: 493 });
    } }); },
    check: function (s) { return !!s.fs.get(W(s) + 'backup/My Photos/x.jpg') && !!s.fs.get(W(s) + 'backup/My Photos/y.jpg'); }
  },
  {
    id: 'lb1d2', title: 'Symlink current không dùng được sau khi chuyển phiên bản',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls -l app', 'drwxr-xr-x 4 haidangphan haidangphan 4096 Oct 27 10:20 releases', 'lrwxrwxrwx 1 haidangphan haidangphan   16 Oct 27 10:20 current -> app/releases/v2', '$ cat app/current/version.txt', 'cat: app/current/version.txt: No such file or directory'),
    story: 'Bạn đang ở `~/work` và chạy `ln -s app/releases/v2 app/current` để chuyển sang phiên bản v2. Link được tạo nhưng đọc qua nó thì báo không có file.',
    goal: '`cat app/current/version.txt` in ra `v2` (và `current` vẫn là symlink).',
    hints: ['`ls -l app` và `ls app/releases`. `current` đang trỏ tới đường dẫn nào, đường dẫn đó tính từ đâu?', 'Đích tương đối được tính từ thư mục **chứa symlink** (`app/`), nên `app/releases/v2` thành `app/app/releases/v2` không tồn tại.', 'Tạo lại với đích tính từ `app/`: `ln -sfn releases/v2 app/current`, rồi `cat app/current/version.txt`.'],
    fix: ['ls -l app', 'ln -sfn releases/v2 app/current', 'cat app/current/version.txt'],
    cause: 'Symlink lưu nguyên chuỗi đường dẫn đích; nếu là đường dẫn tương đối thì được giải thích theo vị trí của symlink, không theo thư mục bạn đang đứng. Hoặc dùng đường dẫn tuyệt đối, hoặc cho đích tính từ thư mục chứa link. `-f` ghi đè link cũ, `-n` coi link cũ là file thường.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      s2.fs.mkdirp(h + '/app/releases/v1', s2.user, 493); s2.fs.mkdirp(h + '/app/releases/v2', s2.user, 493);
      LB.put(s2, h + '/app/releases/v1/version.txt', 'v1\n'); LB.put(s2, h + '/app/releases/v2/version.txt', 'v2\n');
      s2.fs.link(h + '/app/current', 'app/releases/v2', s2.user);
    } }); },
    check: function (s) { var ln = s.fs.get(W(s) + 'app/current', true); return !!ln && ln.t === 'l' && ftxt(s, W(s) + 'app/current/version.txt').trim() === 'v2'; }
  },
  {
    id: 'lb1d3', title: 'Ổ đĩa đầy: cần xoá đúng file đang chiếm chỗ',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./deploy.sh', 'npm ERR! ENOSPC: no space left on device, write', '', '$ df -h /', 'Filesystem  Size  Used Avail Use% Mounted on', '/dev/vda1    40G   40G     0 100% /'),
    story: 'Deploy báo hết chỗ. Bạn nghi do thư mục `logs`, nhưng có file log đang được ghi (`app.log`, `error.log`) không được xoá. Có một file dump cũ nặng hàng GB.',
    goal: 'Tìm và xoá **đúng một** file nặng nhất trong `logs`; `app.log`, `error.log`, `old.log` phải còn nguyên.',
    hints: ['`ls -lhS logs` xếp theo kích thước, lớn nhất lên đầu.', 'File lớn nhất là `dump-2026-10-01.sql` (khoảng 3 GB), một bản dump cũ không còn dùng.', 'Chỉ xoá file đó: `rm logs/dump-2026-10-01.sql`, rồi `ls -lh logs` để chắc các file còn lại vẫn đủ.'],
    fix: ['ls -lhS logs', 'rm logs/dump-2026-10-01.sql', 'ls -lh logs'],
    cause: 'Khi ổ đầy, tìm theo thứ tự: ổ nào (`df -h`), thư mục nào (`du -h --max-depth=1 | sort -h`), file nào (`ls -lS`). Xoá có chủ đích từng file; không dùng `rm -rf logs/*` vì sẽ xoá cả log đang ghi, khiến tiến trình mất tham chiếu mà dung lượng vẫn không được trả lại.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      LB.put(s2, h + '/logs/dump-2026-10-01.sql', '-- dump\n', { size: 3221225472, days: 26 });
    } }); },
    check: function (s) { return !s.fs.get(W(s) + 'logs/dump-2026-10-01.sql') && !!s.fs.get(W(s) + 'logs/app.log') && !!s.fs.get(W(s) + 'logs/error.log') && !!s.fs.get(W(s) + 'logs/old.log'); }
  },
  {
    id: 'lb1d4', title: 'Bản "sao lưu" config.bak bị hỏng cùng config.json', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ cat config.json', '{"port": 0}', '$ cat config.bak', '{"port": 0}', '$ ls -li config.json config.bak', '393301 -rw-r--r-- 2 haidangphan haidangphan 12 Oct 27 10:20 config.bak', '393301 -rw-r--r-- 2 haidangphan haidangphan 12 Oct 27 10:20 config.json'),
    story: 'Trước khi sửa cấu hình, bạn "sao lưu" bằng `ln config.json config.bak`. Sau khi sửa nhầm `port` thành 0 thì cả bản sao lưu cũng hỏng. Bản cũ còn trong `backups/config.2026-10-26.json`.',
    goal: 'Khôi phục `config.json` về `{"port": 3000}`, và `config.bak` phải là bản **sao độc lập** (số liên kết 1, sửa một bên không ảnh hưởng bên kia).',
    hints: ['`ls -li config.json config.bak`. Cùng số inode và số liên kết 2 nghĩa là gì?', 'Hai tên cùng một inode: chỉ có một bản dữ liệu. `ln` không phải sao chép. Cần gỡ liên kết cũ rồi sao chép bản thật.', 'Làm: `rm config.bak`, `cp backups/config.2026-10-26.json config.json`, `cp config.json config.bak`, rồi `ls -li config.json config.bak` (hai inode khác nhau).'],
    fix: ['ls -li config.json config.bak', 'rm config.bak', 'cp backups/config.2026-10-26.json config.json', 'cp config.json config.bak', 'ls -li config.json config.bak'],
    cause: 'Hard link là hai tên cho cùng một nội dung, không phải bản sao. Muốn sao lưu phải dùng `cp` (tốt hơn: `cp -a`). Dấu hiệu nhận biết: cột số liên kết của `ls -l` lớn hơn 1 và `ls -i` cho cùng inode.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      LB.put(s2, h + '/config.json', '{"port": 0}\n');
      LB.hardlink(s2.fs, h + '/config.json', h + '/config.bak');
      s2.fs.mkdirp(h + '/backups', s2.user, 493); LB.put(s2, h + '/backups/config.2026-10-26.json', '{"port": 3000}\n');
    } }); },
    check: function (s) {
      var a = s.fs.get(W(s) + 'config.json'), b = s.fs.get(W(s) + 'config.bak');
      return !!a && !!b && a !== b && /"port": 3000/.test(a.c) && /"port": 3000/.test(b.c) && !(a.nl > 1) && !(b.nl > 1);
    }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
