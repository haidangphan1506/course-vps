(function (G) {
'use strict';
/* Chương lb5: tìm file và tìm trong file. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
var W = function (s) { return s.home + '/work/'; };
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }
function has(s, f, re) { return re.test(ftxt(s, W(s) + f)); }

var T = {
  id: 'lb5', group: 'Linux căn bản', short: 'Tìm file',
  title: 'Tìm file và tìm trong file: find, locate, grep -r, du',
  dek: 'find với tên, kích thước, thời gian, quyền và hành động -exec/-delete; locate cho tìm nhanh; grep -r tìm nội dung; du và tree để biết dung lượng nằm ở đâu. Các công thức hay dùng khi dọn đĩa và truy lỗi.'
};
C.insertAfter('tee1', T);

T.theory = [
  { tag: 'Cú pháp', title: 'find: điểm bắt đầu, điều kiện, hành động', body: [
    'Cú pháp: `find [ĐIỂM_BẮT_ĐẦU...] [ĐIỀU_KIỆN...] [HÀNH_ĐỘNG]`. `find` duyệt cây thư mục từ điểm bắt đầu, và với mỗi mục kiểm tra các điều kiện (nối nhau bằng **và**), mục nào thoả thì thực hiện hành động (mặc định là in đường dẫn).',
    { tbl: [['Điều kiện', 'Ý nghĩa', 'Ví dụ'], ['`-name MẪU`', 'Tên khớp mẫu glob (phân biệt hoa/thường)', '`-name "*.log"`'], ['`-iname MẪU`', 'Như trên, không phân biệt hoa/thường', '`-iname "*.jpg"`'], ['`-type f|d|l`', 'File thường, thư mục, symlink', '`-type d`'], ['`-path MẪU`', 'Khớp toàn bộ đường dẫn', '`-path "*/node_modules/*"`'], ['`-maxdepth N`', 'Chỉ đi sâu tối đa N cấp (đặt sớm)', '`-maxdepth 1`']] },
    { pre: ['find . -name "*.log"                    # mọi file .log từ thư mục hiện tại', 'find /etc -maxdepth 1 -type f -name "*.conf"', 'find . -type d -name node_modules       # tìm thư mục', 'find / -name "nginx.conf" 2>/dev/null   # bỏ thông báo Permission denied'], cap: 'Ví dụ' },
    { note: 'Luôn đặt mẫu glob trong **nháy**: `-name "*.log"`. Không có nháy, shell mở rộng `*.log` thành danh sách file ở thư mục hiện tại trước khi `find` chạy, và bạn sẽ gặp `find: paths must precede expression`.', kind: 'err' }
  ] },
  { tag: 'Cú pháp', title: 'Điều kiện theo kích thước, thời gian, quyền, chủ', body: [
    { tbl: [['Điều kiện', 'Ý nghĩa'], ['`-size +1M`', 'Lớn hơn 1 MB (`k`, `M`, `G`; `-size -10k` là nhỏ hơn 10 KB)'], ['`-mtime +7`', 'Sửa **hơn 7 ngày** trước (`-mtime -1`: trong vòng 1 ngày)'], ['`-mmin -60`', 'Sửa trong 60 phút qua'], ['`-newer file`', 'Mới hơn `file`'], ['`-perm 600`', 'Quyền **đúng** 600'], ['`-perm -u+x`', 'Có **ít nhất** các quyền này (chủ chạy được)'], ['`-perm -4000`', 'Có bit setuid'], ['`-user tên` `-group tên`', 'Thuộc chủ/nhóm'], ['`-empty`', 'File rỗng hoặc thư mục rỗng'], ['`-executable`', 'Bạn chạy được']] },
    { pre: ['find . -type f -size +1M                       # file to hơn 1 MB', 'find tmp -type f -mtime +7                    # file tmp cũ hơn 7 ngày', 'find . -type f -mmin -30                      # vừa sửa trong 30 phút', 'find /home -user root                         # file root để lại trong home', 'find /usr/bin -perm -4000 -type f             # chương trình setuid'], cap: 'Ví dụ' },
    'Số `+n`, `-n`, `n` ở `-size`, `-mtime`: `+n` là **lớn hơn** n, `-n` là **nhỏ hơn** n, `n` là đúng n. `-mtime` tính theo khoảng 24 giờ tròn, nên `-mtime +7` nghĩa là từ ngày thứ 8 trở đi.'
  ] },
  { tag: 'Cú pháp', title: 'Kết hợp điều kiện: và, hoặc, phủ định, loại trừ', body: [
    { tbl: [['Toán tử', 'Ý nghĩa', 'Ví dụ'], ['(để trống) hoặc `-a`', 'VÀ', '`-type f -name "*.js"`'], ['`-o`', 'HOẶC', '`-name "*.jpg" -o -name "*.png"`'], ['`-not` hoặc `!`', 'Phủ định', '`-not -name "*.md"`'], ['`\\( ... \\)`', 'Nhóm (phải thoát ngoặc)', '`\\( -name "*.jpg" -o -name "*.png" \\) -size +1M`'], ['`-prune`', 'Không đi vào thư mục này', '`-name node_modules -prune -o -name "*.js" -print`']] },
    { pre: ['find . -name "*.jpg" -o -name "*.png"', 'find . -type f -name "*.js" -not -path "*/node_modules/*"', 'find . -name node_modules -prune -o -type f -name "*.js" -print   # nhanh hơn: không chui vào node_modules'], cap: 'Loại trừ thư mục khi tìm mã nguồn' },
    { note: 'Với `-o`, nếu cần thêm điều kiện chung, hãy nhóm bằng `\\( \\)`. Nếu không, `A -o B -exec ...` chỉ áp hành động cho vế `B`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Hành động: -print, -exec, -delete, -printf', body: [
    { tbl: [['Hành động', 'Tác dụng'], ['`-print`', 'In đường dẫn (mặc định)'], ['`-ls`', 'In dạng `ls -l`'], ['`-printf \'%s %p\\n\'`', 'In theo định dạng: `%s` cỡ byte, `%p` đường dẫn, `%T@` mtime'], ['`-delete`', 'Xoá mục khớp'], ['`-exec lệnh {} \\;`', 'Chạy `lệnh` **một lần cho mỗi mục** (`{}` là đường dẫn)'], ['`-exec lệnh {} +`', 'Gom nhiều mục vào một lần chạy (nhanh hơn)'], ['`-print0`', 'Phân tách bằng ký tự NUL, an toàn với tên có dấu cách']] },
    { pre: ['find logs -type f -size +10k -exec ls -lh {} +', 'find . -name "*.md" -exec grep -l Node {} \\;', 'find tmp -name "*.tmp" -mtime +7 -delete', 'find . -type f -name "*.jpg" -print0 | xargs -0 ls -l', 'find . -type f -printf \'%s %p\\n\' | sort -n | tail -3   # 3 file lớn nhất'], cap: 'Ví dụ' },
    { note: '`-delete` là hành động, và `find` đánh giá **từ trái sang phải**. `find . -delete -name "*.tmp"` xoá **mọi thứ** (vì `-delete` chạy trước khi kiểm tra tên). Luôn đặt `-delete` ở cuối và chạy thử mà không có nó để xem danh sách trước.', kind: 'err' }
  ] },
  { tag: 'Tiện ích', title: 'Tìm nhanh: locate, which, type, whereis', body: [
    { tbl: [['Lệnh', 'Dùng khi'], ['`locate tên`', 'Tìm file theo tên trong **chỉ mục** dựng sẵn, gần như tức thì'], ['`sudo updatedb`', 'Dựng lại chỉ mục (hệ thống tự làm mỗi ngày)'], ['`which lệnh`', 'Chương trình nào được chạy khi gõ `lệnh`'], ['`type -a lệnh`', 'Mọi nơi `lệnh` xuất hiện: alias, builtin, file'], ['`whereis lệnh`', 'Tìm file chạy, nguồn và man page']] },
    { pre: ['sudo apt install -y plocate     # nếu chưa có', 'sudo updatedb', 'locate nginx.conf', 'locate -i "*.PDF" | head', 'which node; type -a ls; whereis nginx'], cap: 'Dùng' },
    { ul: ['`locate` **không thấy file mới tạo** cho tới khi `updatedb` chạy lại, và có thể liệt kê file đã xoá. Cần kết quả chính xác ngay thì dùng `find`', '`locate` chỉ tìm theo **tên**; `find` tìm được theo kích thước, thời gian, quyền, chủ'] }
  ] },
  { tag: 'Cú pháp', title: 'Tìm nội dung trong file: grep -r', body: [
    { pre: ['grep -rn "express" .                         # -r đệ quy, -n số dòng', 'grep -rl "ERROR" logs                      # -l chỉ in tên file', 'grep -ri "password" . --include="*.env"     # -i bỏ phân biệt hoa/thường, chỉ file .env', 'grep -r "TODO" src --exclude-dir=node_modules', 'grep -rc "ERROR" logs                      # -c đếm theo từng file', 'grep -rn "listen" /etc/nginx 2>/dev/null'], cap: 'Ví dụ' },
    { tbl: [['Cờ', 'Ý nghĩa'], ['`-r`', 'Duyệt cả thư mục con'], ['`-n`', 'Hiện số dòng'], ['`-l` / `-L`', 'Chỉ tên file có / không có khớp'], ['`-i`', 'Không phân biệt hoa thường'], ['`-w`', 'Khớp nguyên từ'], ['`-v`', 'Đảo ngược: dòng KHÔNG khớp'], ['`--include=MẪU`', 'Chỉ xét file có tên khớp'], ['`--exclude-dir=THƯ_MỤC`', 'Bỏ qua thư mục (ví dụ `node_modules`, `.git`)']] },
    'Kết hợp `find` với `grep` khi cần điều kiện phức tạp: `find . -type f -mtime -1 -name "*.log" -exec grep -l ERROR {} +` (log hôm nay có lỗi).'
  ] },
  { tag: 'Tiện ích', title: 'Dung lượng nằm ở đâu: du, ls -S, tree, file', body: [
    { pre: ['du -sh *                          # tổng của từng mục ở thư mục hiện tại', 'du -sh * | sort -h | tail -3         # 3 mục lớn nhất (sort -h hiểu 5.1M, 240K)', 'du -h --max-depth=1 /var | sort -h  # từng cấp một, dò xuống dần', 'ls -lS | head -5                   # file lớn nhất trong thư mục', 'find / -xdev -type f -size +100M 2>/dev/null   # file khổng lồ trên ổ gốc', 'df -h                              # tổng quan các phân vùng'], cap: 'Truy vết ổ đĩa đầy' },
    { pre: ['sudo apt install -y tree', 'tree -L 2                  # 2 cấp', 'tree -d                    # chỉ thư mục', 'tree -a -I ".git|node_modules"   # gồm file ẩn, loại trừ vài thư mục', 'file report.pdf photos/a.jpg   # nhận dạng loại file theo nội dung'], cap: 'Xem cấu trúc và loại file' },
    { ul: ['Quy trình dọn đĩa: `df -h` để biết phân vùng nào đầy, `du -sh * | sort -h` để dò xuống thư mục lớn nhất, lặp lại, rồi `find ... -size +100M` để chốt file cụ thể', 'Log phình to thường nằm ở `/var/log`; cache ở `/var/cache`, `~/.cache`; hãy xem xét trước khi xoá'] }
  ] },
  { tag: 'Công thức', title: 'Bạn muốn... thì gõ', body: [
    { tbl: [['Bạn muốn', 'Lệnh'], ['Xoá file tạm cũ hơn 7 ngày', '`find tmp -type f -mtime +7 -print` (xem trước), rồi thay `-print` bằng `-delete`'], ['Tìm 5 file to nhất', '`find . -type f -printf \'%s %p\\n\' | sort -rn | head -5`'], ['Tìm file vừa sửa trong 1 giờ', '`find . -type f -mmin -60`'], ['Tìm mọi nơi nhắc đến một chuỗi', '`grep -rn "chuỗi" . --exclude-dir=node_modules`'], ['Đổi quyền mọi script', '`find scripts -name "*.sh" -exec chmod +x {} +`'], ['Tìm file không thuộc bạn', '`find ~ -not -user $USER`'], ['Tìm symlink hỏng', '`find . -xtype l`'], ['Tìm thư mục rỗng', '`find . -type d -empty`'], ['Chương trình setuid (kiểm tra bảo mật)', '`find / -perm -4000 -type f 2>/dev/null`'], ['Đếm file theo đuôi', '`find . -type f -name "*.js" | wc -l`']] }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['`find: paths must precede expression`', 'Mẫu glob không đặt trong nháy', '`-name "*.log"`'], ['Tràn thông báo `Permission denied`', 'Duyệt cả thư mục không đủ quyền', '`2>/dev/null` hoặc `sudo find`'], ['`-delete` xoá nhiều hơn mong muốn', 'Đặt `-delete` trước điều kiện', 'Đặt cuối; chạy thử với `-print`'], ['`xargs rm` xoá nhầm file khác', 'Tên có dấu cách bị tách', '`-print0 | xargs -0` hoặc `-delete`'], ['`locate` không thấy file mới', 'Chỉ mục chưa cập nhật', '`sudo updatedb`'], ['`grep -r` chậm, nhiều kết quả rác', 'Duyệt `node_modules`, `.git`', '`--exclude-dir=...`'], ['`-mtime +1` bỏ sót file 30 giờ tuổi', 'Làm tròn xuống theo ngày', 'Dùng `-mmin +1440` hoặc `-mtime +0`']] },
    { ul: ['Đã chạy lệnh với `-print` để xem danh sách trước khi dùng `-delete` hoặc `-exec rm`?', 'Mẫu có nằm trong nháy không?', 'Có cần loại `node_modules`/`.git` (`-prune`, `--exclude-dir`) không?', 'Tên file có thể chứa dấu cách (cần `-print0`/`-0`, nháy kép quanh `"$f"`)?'] }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`find . -name \"*.log\"`", "find từ thư mục hiện tại, tìm mọi file có đuôi .log.", "./logs/app.log / ./logs/error.log / ./logs/old.log"], ["`find . -iname \"*.JPG\" -type f`", "-iname không phân biệt hoa thường nên khớp cả .JPG và .jpg; -type f chỉ lấy file.", "./photos/a.jpg / ./photos/b.jpg / ./photos/holiday/d.jpg"], ["`find . -type d`", "-type d chỉ lấy thư mục, kể cả thư mục trong projects và node_modules.", ". / ./data / ./logs / ./photos / ./photos/holiday / ./projects / ./projects/tutor / ./projects/tutor/node_modules / ./projects/tutor/node…"], ["`find . -maxdepth 1 -type f`", "-maxdepth 1 chỉ xét cấp hiện tại, không đi vào thư mục con.", "./.hidden-note / ./notes.txt / ./report.pdf / ./todo.md"], ["`find projects -name \"*.js\" -not -path \"*/node_modules/*\"`", "-not -path loại bỏ những đường dẫn chứa node_modules.", "projects/tutor/src/app.js / projects/tutor/src/routes/users.js / projects/tutor/src/util.js"], ["`find projects -name node_modules -prune -o -type f -name \"*.js\" -print`", "-prune bỏ qua node_modules, -print in phần còn lại.", "projects/tutor/src/app.js / projects/tutor/src/routes/users.js / projects/tutor/src/util.js"], ["`find . -type f -size +1M`", "-size +1M: file lớn hơn 1 MB.", "./logs/old.log / ./photos/a.jpg / ./photos/b.jpg / ./photos/holiday/d.jpg"], ["`find . -type f -size +10k -size -1M`", "Khoảng kích thước từ 10 KB đến 1 MB: không có file nào nằm trong khoảng này nên kết quả rỗng.", "(không in ra)"], ["`find tmp -type f -mtime +7`", "-mtime +7: file có nội dung sửa cách đây hơn 7 ngày.", "tmp/cache1.tmp / tmp/cache2.tmp"], ["`find . -type f -mtime -3`", "-mtime -3: file sửa trong 3 ngày gần đây.", "./.hidden-note / ./data/users.csv / ./logs/app.log / ./logs/error.log / ./notes.txt / ./photos/a.jpg / ./photos/b.jpg / ./photos/c.png / …"], ["`find logs -type f -newer logs/old.log`", "-newer logs/old.log: file mới hơn file mốc.", "logs/app.log / logs/error.log"], ["`find . -type f -perm -u+x`", "-perm -u+x: file có quyền chạy cho chủ.", "./scripts/deploy.sh"], ["`find . -type f -perm 600`", "-perm 600: file có quyền đúng bằng 600.", "./projects/tutor/.env"], ["`find /etc -maxdepth 1 -user root -name \"s*\"`", "-maxdepth 1, -user root, -name s*: tìm file của root ở cấp /etc có tên bắt đầu bằng s.", "/etc/shadow / /etc/sudoers / /etc/sudoers.d / /etc/sysctl.d / /etc/systemd"], ["`find . -empty`", "-empty tìm thư mục rỗng: reports.", "./reports"], ["`find . -name \"*.jpg\" -o -name \"*.png\"`", "-o là hoặc: khớp file .jpg hoặc .png.", "./photos/a.jpg / ./photos/b.jpg / ./photos/c.png / ./photos/holiday/d.jpg"], ["`find . -name \"*.jpg\" -printf '%s %p\\n'`", "-printf in kích thước (byte) và đường dẫn theo định dạng tự chọn.", "2200000 ./photos/a.jpg / 1800000 ./photos/b.jpg / 3100000 ./photos/holiday/d.jpg"], ["`find logs -type f -size +10k -exec ls -lh {} +`", "-exec ls -lh {} + gọi ls cho nhóm file tìm được và hiện kích thước dễ đọc.", "-rw-r--r-- 1 haidangphan haidangphan  47K Oct 25 10:20 logs/error.log / -rw-r--r-- 1 haidangphan haidangphan 5.0M Sep 17 10:20 logs/old.log"], ["`find . -name \"*.md\" -exec grep -l Node {} \\;`", "-exec ... \\; chạy grep -l cho từng file .md, in tên file có chữ Node.", "./projects/tutor/README.md / ./todo.md"], ["`find tmp -name \"*.tmp\" -mtime +7 -print`", "-print in tên file rõ ràng; -mtime +7 và -name kết hợp như điều kiện AND.", "tmp/cache1.tmp / tmp/cache2.tmp"], ["`find tmp -name \"*.tmp\" -mtime +7 -delete`", "-delete xoá file tìm được. Lệnh này không in gì khi thành công.", "(không in ra)"], ["`find . -name \"*.jpg\" -print0 | xargs -0 ls -l`", "-print0 và xargs -0 xử lý an toàn tên file có khoảng trắng.", "-rw-r--r-- 1 haidangphan haidangphan 2200000 Oct 27 10:20 ./photos/a.jpg / -rw-r--r-- 1 haidangphan haidangphan 1800000 Oct 27 10:20 ./ph…"], ["`find / -name passwd -type f 2>/dev/null`", "2>/dev/null ẩn các lỗi không có quyền khi tìm trong cả hệ thống.", "/etc/passwd / /usr/bin/passwd"], ["`find /usr/bin -perm -4000 -type f`", "-perm -4000 tìm file có bit SUID trong /usr/bin.", "/usr/bin/chfn / /usr/bin/mount / /usr/bin/passwd / /usr/bin/su"], ["`sudo updatedb`", "Cập nhật cơ sở dữ liệu cho locate (cần sudo). Lệnh không in gì khi xong.", "(không in ra)"], ["`locate app.js`", "locate tìm nhanh bằng chỉ mục nên nhanh hơn find.", "/home/haidangphan/work/projects/tutor/src/app.js"], ["`which ls`", "which cho biết đường dẫn của lệnh ls.", "/usr/bin/ls"], ["`whereis ls`", "whereis tìm cả binary, mã nguồn và trang man của lệnh.", "ls: /usr/bin/ls /usr/share/man/man1/ls.1.gz"], ["`type -a ls`", "type -a liệt kê mọi nơi có lệnh ls mà shell có thể chọn.", "ls is /usr/bin/ls"], ["`grep -rn \"express\" --include=\"*.js\" .`", "grep -r tìm đệ quy, -n in số dòng, --include chỉ xét file .js.", "./projects/tutor/src/app.js:1:const express = require('express'); / ./projects/tutor/src/app.js:2:const app = express();"], ["`grep -rl \"ERROR\" logs`", "grep -l chỉ in tên file có chữ ERROR.", "logs/app.log"], ["`grep -ril node . --exclude-dir=node_modules`", "-i bỏ phân biệt hoa thường, --exclude-dir bỏ qua node_modules.", "./projects/tutor/.gitignore / ./projects/tutor/README.md / ./projects/tutor/package.json / ./todo.md"], ["`du -sh * | sort -h | tail -3`", "du -sh đo dung lượng từng mục, sort -h xếp theo kích thước, tail -3 lấy 3 mục lớn nhất.", "240K\treport.pdf / 5.1M\tlogs / 7.3M\tphotos"], ["`find . -type f -printf '%s %p\\n' | sort -rn | head -3`", "find in kích thước và đường dẫn, sort -rn xếp giảm dần, head -3 lấy 3 file lớn nhất.", "5242880 ./logs/old.log / 3100000 ./photos/holiday/d.jpg / 2200000 ./photos/a.jpg"], ["`sudo apt install -y tree`", "Cài công cụ tree (cần sudo).", "Reading package lists... Done / Building dependency tree... Done / Reading state information... Done / The following NEW packages will be…"], ["`tree -L 2 -I node_modules`", "tree -L 2 hiện cây tới 2 cấp; -I node_modules bỏ thư mục đó.", ". / ├── data / │   └── users.csv / ├── logs / │   ├── app.log / │   ├── error.log / │   └── old.log / ├── notes.txt / ├── photos / │   ├─…"], ["`file report.pdf photos/a.jpg`", "file cho biết loại của report.pdf và photos/a.jpg.", "report.pdf: PDF document, version 1.4 / photos/a.jpg: JPEG image data, JFIF standard 1.01"], ["`find scripts -name \"*.sh\" -exec chmod +x {} +`", "find tìm mọi file .sh trong scripts và chmod +x cấp quyền chạy cho chúng.", "(không in ra)"]]}]});
T.quiz = C.QZ(9, [
  ['Vì sao nên viết `find . -name "*.log"` (có nháy) thay vì `find . -name *.log`?', 'Không có nháy, shell mở rộng `*.log` trước khi find chạy, gây lỗi hoặc kết quả sai', ['Nháy làm find chạy nhanh hơn', 'find yêu cầu nháy kép bắt buộc cho mọi tham số', 'Không có khác biệt'], 'Glob phải đến được find ở dạng nguyên văn để find tự so khớp.'],
  ['`find . -type f -size +1M` tìm gì?', 'File thường lớn hơn 1 MB', ['File nhỏ hơn 1 MB', 'Thư mục lớn hơn 1 MB', 'File đúng 1 MB'], '`+n` là lớn hơn, `-n` nhỏ hơn.'],
  ['`find tmp -mtime +7` khớp file nào?', 'File sửa lần cuối cách đây hơn 7 ngày', ['File sửa trong 7 ngày qua', 'File tạo đúng 7 ngày trước', 'File lớn hơn 7 KB'], '`-mtime -7` mới là trong 7 ngày qua.'],
  ['Cách tìm cả `.jpg` lẫn `.png`?', '`find . -name "*.jpg" -o -name "*.png"`', ['`find . -name "*.jpg" -a -name "*.png"`', '`find . -name "*.jpg,*.png"`', '`find . -name "*.{jpg,png}"`'], '`-o` là HOẶC; `-a` (mặc định) là VÀ nên không khớp được cả hai đuôi cùng lúc.'],
  ['Dòng nào nguy hiểm vì xoá mọi thứ dưới thư mục hiện tại?', '`find . -delete -name "*.tmp"`', ['`find . -name "*.tmp" -delete`', '`find . -name "*.tmp" -print`', '`find . -name "*.tmp" -ls`'], 'find đánh giá từ trái sang phải; `-delete` đứng trước điều kiện tên thì xoá tất cả.'],
  ['`-exec ls -l {} \\;` khác `-exec ls -l {} +` ra sao?', '`\\;` chạy lệnh mỗi lần một mục, `+` gom nhiều mục vào một lần chạy', ['`\\;` nhanh hơn `+`', '`+` chỉ chạy trên thư mục', 'Hai cách hoàn toàn như nhau'], 'Dấu `+` giảm số lần khởi động tiến trình khi có nhiều kết quả.'],
  ['`find . -name "*.tmp" | xargs rm` có thể xoá nhầm khi nào?', 'Khi tên file có dấu cách, xargs tách thành nhiều đối số', ['Khi file quá lớn', 'Khi chạy bằng sudo', 'Khi có hơn 10 file'], 'Dùng `find ... -print0 | xargs -0 rm` hoặc `-delete`.'],
  ['Vừa tạo file mới nhưng `locate` không thấy. Nên làm gì?', '`sudo updatedb` rồi tìm lại', ['`locate -f`', 'Khởi động lại máy', 'Cài lại plocate'], '`locate` đọc chỉ mục dựng sẵn, cần cập nhật.'],
  ['Cách tìm mọi file `.js` chứa chữ `express` và bỏ qua `node_modules`?', '`grep -rl express . --include="*.js" --exclude-dir=node_modules`', ['`grep express *.js`', '`find . -name express`', '`grep -v express .`'], '`-r` đệ quy, `-l` chỉ tên file, `--exclude-dir` loại thư mục.'],
  ['`du -sh * | sort -h | tail -3` cho biết?', '3 mục chiếm nhiều dung lượng nhất trong thư mục hiện tại', ['3 file mới nhất', '3 file nhỏ nhất', 'Dung lượng trống của ổ đĩa'], '`du -sh` tính tổng từng mục, `sort -h` sắp theo đơn vị dễ đọc, `tail` lấy cuối (lớn nhất).'],
  ['Lệnh để xem `ls` đang là alias, builtin hay file và ở đâu?', '`type -a ls`', ['`which -z ls`', '`locate ls`', '`find ls`'], '`type -a` liệt kê mọi định nghĩa của tên lệnh.'],
  ['Cách an toàn để dọn file `.tmp` cũ hơn 7 ngày?', 'Chạy với `-print` xem danh sách, rồi mới thay bằng `-delete` đặt cuối', ['Chạy ngay `find / -delete`', 'Dùng `rm -rf *.tmp` ở thư mục gốc', 'Khởi động lại dịch vụ'], 'Luôn xem trước kết quả của điều kiện khi hành động có thể phá huỷ.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Tìm mọi file `.log` từ thư mục hiện tại (mẫu trong nháy).', hint: 'find . -name "*.log"', check: OK(/^find \. -name \*\.log$/) },
    { text: 'Tìm ảnh `.jpg` không phân biệt hoa/thường (chỉ file thường).', hint: 'find . -iname "*.JPG" -type f', check: OK(/^find \. -iname \*\.JPG -type f$/) },
    { text: 'Liệt kê mọi thư mục con bằng `-type d`.', hint: 'find . -type d', check: OK(/^find \. -type d$/) },
    { text: 'Chỉ liệt kê file ở cấp hiện tại (không đi sâu) bằng `-maxdepth 1`.', hint: 'find . -maxdepth 1 -type f', check: OK(/^find \. -maxdepth 1 -type f$/) },
    { text: 'Tìm file `.js` của dự án nhưng loại `node_modules` bằng `-not -path`.', hint: 'find projects -name "*.js" -not -path "*/node_modules/*"', check: OK(/^find projects -name \*\.js -not -path \*\/node_modules\/\*$/) },
    { text: 'Dùng `-prune` để không chui vào `node_modules` khi tìm `.js`.', hint: 'find projects -name node_modules -prune -o -type f -name "*.js" -print', check: OK(/^find projects -name node_modules -prune -o -type f -name \*\.js -print$/) },
    { text: 'Tìm file thường lớn hơn 1 MB.', hint: 'find . -type f -size +1M', check: OK(/^find \. -type f -size \+1M$/) },
    { text: 'Tìm file có cỡ trong khoảng 10 KB đến 1 MB (hai điều kiện `-size`).', hint: 'find . -type f -size +10k -size -1M', check: OK(/^find \. -type f -size \+10k -size -1M$/) },
    { text: 'Tìm file trong `tmp` cũ hơn 7 ngày.', hint: 'find tmp -type f -mtime +7', check: OK(/^find tmp -type f -mtime \+7$/) },
    { text: 'Tìm file sửa trong vòng 3 ngày qua.', hint: 'find . -type f -mtime -3', check: OK(/^find \. -type f -mtime -3$/) },
    { text: 'Tìm file trong `logs` mới hơn `logs/old.log` bằng `-newer`.', hint: 'find logs -type f -newer logs/old.log', check: OK(/^find logs -type f -newer logs\/old\.log$/) },
    { text: 'Tìm file mà chủ chạy được (`-perm -u+x`).', hint: 'find . -type f -perm -u+x', check: OK(/^find \. -type f -perm -u\+x$/) },
    { text: 'Tìm file có quyền đúng `600`.', hint: 'find . -type f -perm 600', check: OK(/^find \. -type f -perm 600$/) },
    { text: 'Tìm file trong `/etc` (chỉ cấp 1) thuộc chủ `root` và tên bắt đầu bằng `s`.', hint: 'find /etc -maxdepth 1 -user root -name "s*"', check: OK(/^find \/etc -maxdepth 1 -user root -name s\*$/) },
    { text: 'Tìm file và thư mục rỗng.', hint: 'find . -empty', check: OK(/^find \. -empty$/) },
    { text: 'Tìm cả `.jpg` lẫn `.png` bằng `-o`.', hint: 'find . -name "*.jpg" -o -name "*.png"', check: OK(/^find \. -name \*\.jpg -o -name \*\.png$/) },
    { text: 'In cỡ byte và đường dẫn của ảnh `.jpg` bằng `-printf`.', hint: "find . -name \"*.jpg\" -printf '%s %p\\n'", check: OK(/^find \. -name \*\.jpg -printf %s %p\\n$/) },
    { text: 'Hiện chi tiết `ls -lh` cho các log lớn hơn 10 KB bằng `-exec ... {} +`.', hint: 'find logs -type f -size +10k -exec ls -lh {} +', check: OK(/^find logs -type f -size \+10k -exec ls -lh \{\} \+$/) },
    { text: 'Liệt kê file `.md` có chứa chữ `Node` bằng `-exec grep -l`.', hint: 'find . -name "*.md" -exec grep -l Node {} \\;', check: OK(/^find \. -name \*\.md -exec grep -l Node \{\} ;$/) },
    { text: 'Xem trước (không xoá) các file `.tmp` cũ hơn 7 ngày trong `tmp`.', hint: 'find tmp -name "*.tmp" -mtime +7 -print', check: OK(/^find tmp -name \*\.tmp -mtime \+7 -print$/) },
    { text: 'Xoá thật các file `.tmp` cũ hơn 7 ngày (đặt `-delete` cuối). `session.tmp` mới phải còn.', hint: 'find tmp -name "*.tmp" -mtime +7 -delete', check: function (s) { return !s.fs.get(W(s) + 'tmp/cache1.tmp') && !s.fs.get(W(s) + 'tmp/cache2.tmp') && !!s.fs.get(W(s) + 'tmp/session.tmp'); } },
    { text: 'Đếm số file `.jpg` an toàn với tên có dấu cách: `-print0 | xargs -0 ls -l`.', hint: 'find . -name "*.jpg" -print0 | xargs -0 ls -l', check: OK(/^xargs -0 ls -l$/) },
    { text: 'Tìm `passwd` trên toàn hệ thống, bỏ các lỗi Permission denied.', hint: 'find / -name passwd -type f 2>/dev/null', check: A(/^find \/ -name passwd -type f$/) },
    { text: 'Liệt kê chương trình setuid trong `/usr/bin`.', hint: 'find /usr/bin -perm -4000 -type f', check: OK(/^find \/usr\/bin -perm -4000 -type f$/) },
    { text: 'Cập nhật chỉ mục và tìm `app.js` bằng `locate`.', hint: 'sudo updatedb\nlocate app.js', check: AND(OK(/^sudo updatedb$/), OK(/^locate app\.js$/)) },
    { text: 'Hỏi vị trí lệnh `ls` bằng `which`, `whereis` và `type -a`.', hint: 'which ls\nwhereis ls\ntype -a ls', check: AND(OK(/^which ls$/), OK(/^whereis ls$/), OK(/^type -a ls$/)) },
    { text: 'Tìm mọi nơi dùng `express` trong file `.js` bằng `grep -rn --include`.', hint: 'grep -rn "express" --include="*.js" .', check: OK(/^grep -rn express --include=\*\.js \.$/) },
    { text: 'Liệt kê các file trong `logs` có chứa `ERROR` (chỉ tên).', hint: 'grep -rl "ERROR" logs', check: OK(/^grep -rl ERROR logs$/) },
    { text: 'Tìm `node` không phân biệt hoa thường, bỏ qua `node_modules`, chỉ in tên file.', hint: 'grep -ril node . --exclude-dir=node_modules', check: OK(/^grep -ril node \. --exclude-dir=node_modules$/) },
    { text: 'Xem mục nào nặng nhất: `du -sh *` rồi sắp xếp, lấy 3 dòng cuối.', hint: 'du -sh * | sort -h | tail -3', check: AND(OK(/^du -sh /), OK(/^sort -h$/), OK(/^tail -3$/)) },
    { text: 'In 3 file lớn nhất (theo byte) bằng `-printf`, `sort -rn`, `head`.', hint: "find . -type f -printf '%s %p\\n' | sort -rn | head -3", check: AND(OK(/^sort -rn$/), OK(/^head -3$/)) },
    { text: 'Cài `tree` rồi xem 2 cấp thư mục (`-L 2`), loại `node_modules` bằng `-I`.', hint: 'sudo apt install -y tree\ntree -L 2 -I node_modules', check: OK(/^tree -L 2 -I node_modules$/) },
    { text: 'Nhận dạng loại file thật của `report.pdf` và `photos/a.jpg`.', hint: 'file report.pdf photos/a.jpg', check: OK(/^file report\.pdf photos\/a\.jpg$/) },
    { text: 'Cấp quyền chạy cho mọi `*.sh` trong `scripts` bằng `-exec chmod +x {} +`.', hint: 'find scripts -name "*.sh" -exec chmod +x {} +', check: function (s) { return (s.fs.get(W(s) + 'scripts/backup.sh').mode & 73) === 73; } }
  ]
};

var PASS = 'hunter2';

T.debugs = [
  {
    id: 'lb5d1', title: 'find báo "paths must precede expression"',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls', 'a.log  b.log  logs  notes.txt', '$ find . -name *.log', 'find: paths must precede expression: `b.log\'', 'find: possible unquoted pattern after predicate `-name\'?'),
    story: 'Trong thư mục hiện tại có sẵn `a.log` và `b.log`, bạn cần liệt kê tất cả file `.log` (kể cả trong thư mục con) ra `found.txt`. Lệnh `find` báo lỗi lạ.',
    goal: '`found.txt` chứa danh sách mọi file `.log` dưới thư mục hiện tại, gồm cả `./logs/deep/c.log`.',
    hints: ['Thử `echo *.log`. Shell đã biến `*.log` thành gì trước khi đưa cho `find`?', 'Shell mở rộng `*.log` thành `a.log b.log` vì ở thư mục hiện tại có file khớp, `find` nhận hai đối số thừa.', 'Đặt mẫu trong nháy: `find . -name "*.log" > found.txt`, rồi `cat found.txt`.'],
    fix: ['echo *.log', 'find . -name "*.log" > found.txt', 'cat found.txt'],
    cause: 'Glob không có nháy được shell mở rộng **trước** khi gọi find. Trong thư mục không có file khớp thì glob giữ nguyên và find chạy đúng, nên lỗi lúc có lúc không. Luôn viết `-name "*.log"`.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      LB.put(s2, h + '/a.log', 'a\n'); LB.put(s2, h + '/b.log', 'b\n');
      s2.fs.mkdirp(h + '/logs/deep', s2.user, 493); LB.put(s2, h + '/logs/deep/c.log', 'c\n');
    } }); },
    check: function (s) { var t = ftxt(s, W(s) + 'found.txt'); return /\.\/logs\/deep\/c\.log/.test(t) && /\.\/a\.log/.test(t) && /\.\/b\.log/.test(t); }
  },
  {
    id: 'lb5d2', title: 'locate không thấy file mới',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls reports/', 'report-final.pdf', '$ locate report-final.pdf', '$ echo $?', '1'),
    story: 'Bạn vừa chép `report-final.pdf` vào `reports/`. `ls` thấy nó, còn `locate` thì không tìm ra.',
    goal: '`locate report-final.pdf` in ra đường dẫn của file.',
    hints: ['`locate` tìm trong đâu? Nó có đọc thư mục thật tại thời điểm chạy không?', '`locate` đọc **chỉ mục** dựng sẵn, nên không biết về file mới.', 'Cập nhật chỉ mục: `sudo updatedb`, rồi `locate report-final.pdf`.'],
    fix: ['sudo updatedb', 'locate report-final.pdf'],
    cause: 'plocate dựng chỉ mục bằng `updatedb` (hệ thống chạy mỗi ngày theo timer). File tạo sau lần cập nhật cuối thì chưa có; file đã xoá thì vẫn còn. Cần kết quả tức thời dùng `find`.',
    setup: function (s) { base(s, { setup2: function (s3) {
      V.base.locateSnap(s3);
      LB.put(s3, s3.home + '/work/reports/report-final.pdf', '%PDF-1.4\n', { size: 90000 });
    } }); },
    check: function (s) { return histN(s, /^locate report-final\.pdf$/) > 0 && histN(s, /^updatedb$|^sudo updatedb$/) > 0 && s.hist.some(function (h, i) { return /^locate report-final\.pdf$/.test(h.cmd) && h.code === 0; }); }
  },
  {
    id: 'lb5d3', title: 'Mật khẩu lọt vào mã nguồn: tìm mọi nơi nhắc tới',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ grep -rl hunter2 .', './projects/tutor/src/db.js', './projects/tutor/node_modules/pg-lite/test/sample.js', './scripts/old-deploy.sh', './projects/tutor/.env'),
    story: 'Mật khẩu DB `hunter2` đã bị dán nhầm vào mã nguồn. Bạn cần lập danh sách các file của **chính bạn** chứa nó (không tính thư viện trong `node_modules` và file `.env` vốn được phép) để sửa từng chỗ.',
    goal: '`leak.txt` chứa đúng hai dòng: `./projects/tutor/src/db.js` và `./scripts/old-deploy.sh` (không có `node_modules`, không có `.env`).',
    hints: ['`grep -rl hunter2 .` cho kết quả gì? Dòng nào là rác cần loại?', '`grep` có `--exclude-dir=` để bỏ thư mục và `--exclude=` để bỏ theo tên file.', '`grep -rl hunter2 . --exclude-dir=node_modules --exclude=.env > leak.txt`, rồi `cat leak.txt`.'],
    fix: ['grep -rl hunter2 . --exclude-dir=node_modules --exclude=.env > leak.txt', 'cat leak.txt'],
    cause: '`-r` duyệt mọi thứ kể cả thư viện. `--exclude-dir` và `--exclude` thu hẹp phạm vi; dùng `-l` để chỉ lấy tên file. Với dự án git, `git grep` còn nhanh hơn và tự bỏ qua file không theo dõi.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      s2.fs.mkdirp(h + '/projects/tutor/node_modules/pg-lite/test', s2.user, 493);
      LB.put(s2, h + '/projects/tutor/src/db.js', "module.exports = { host: '127.0.0.1', user: 'app', password: '" + PASS + "' };\n");
      LB.put(s2, h + '/projects/tutor/node_modules/pg-lite/test/sample.js', "const pw = '" + PASS + "'; // ví dụ trong test\n");
      LB.put(s2, h + '/scripts/old-deploy.sh', '#!/bin/bash\nPGPASSWORD=' + PASS + ' psql -h 127.0.0.1 -U app tutor_db -c "select 1"\n', { mode: 493 });
      LB.put(s2, h + '/projects/tutor/.env', 'DB_PASSWORD=' + PASS + '\n', { mode: 384 });
    } }); },
    check: function (s) { var a = ftxt(s, W(s) + 'leak.txt').split('\n').filter(Boolean).sort(); return a.length === 2 && a[0] === './projects/tutor/src/db.js' && a[1] === './scripts/old-deploy.sh'; }
  },
  {
    id: 'lb5d4', title: 'Dọn file .tmp cũ nhưng xargs xoá nhầm file khác', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ find tmp -name "*.tmp" -mtime +7', 'tmp/old report.tmp', '$ find tmp -name "*.tmp" -mtime +7 | xargs rm', "rm: cannot remove 'tmp/old': No such file or directory", "rm: cannot remove 'report.tmp': No such file or directory", '(nếu có file report.tmp ở thư mục hiện tại, nó đã bị xoá nhầm!)'),
    story: 'Cần xoá file `.tmp` cũ hơn 7 ngày trong `tmp`. Một file tên `old report.tmp` có dấu cách. Pipe sang `xargs rm` tách tên thành `tmp/old` và `report.tmp`, và `report.tmp` là file quan trọng nằm ngay ở thư mục hiện tại.',
    goal: 'Xoá `tmp/old report.tmp`, còn nguyên `report.tmp` ở thư mục hiện tại. **Đừng** chạy lại lệnh `xargs rm` kiểu cũ.',
    hints: ['Cho `find` tự xoá thì không cần xargs. Hoặc cho xargs tách theo ký tự NUL.', '`find ... -print0 | xargs -0 rm` (NUL không xuất hiện trong tên file), hoặc dùng hành động `-delete` của find.', '`find tmp -name "*.tmp" -mtime +7 -delete`, rồi `ls tmp; ls report.tmp`.'],
    fix: ['find tmp -name "*.tmp" -mtime +7 -delete', 'ls tmp', 'ls report.tmp'],
    cause: '`xargs` mặc định tách đầu vào theo khoảng trắng, nên tên có dấu cách thành nhiều đối số, và một trong số đó có thể trùng file quan trọng khác. Giải pháp: `-delete`, `-exec rm {} +`, hoặc `-print0 | xargs -0 rm`.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      LB.put(s2, h + '/tmp/old report.tmp', 'cũ\n', { days: 10 });
      LB.put(s2, h + '/report.tmp', 'QUAN TRỌNG\n');
    } }); },
    check: function (s) { return !s.fs.get(W(s) + 'tmp/old report.tmp') && ftxt(s, W(s) + 'report.tmp').indexOf('QUAN TRỌNG') >= 0 && !!s.fs.get(W(s) + 'tmp/session.tmp'); }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
