(function (G) {
'use strict';
/* Chương lb4: chuyển hướng và pipe. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
var W = function (s) { return s.home + '/work/'; };
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }
function has(s, f, re) { return re.test(ftxt(s, W(s) + f)); }

var T = {
  id: 'lb4', group: 'Linux căn bản', short: 'Chuyển hướng và pipe',
  title: 'Chuyển hướng và pipe: stdin, stdout, stderr, tee',
  dek: 'Ba luồng dữ liệu của mọi lệnh, các toán tử > >> < 2> 2>&1 &>, /dev/null, here-doc, pipe, tee, mã thoát trong pipeline, và cái bẫy "sort f > f" làm trống file. Cách ghi log đúng cho script và cron.'
};
C.insertAfter('lb3', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Ba luồng: stdin, stdout, stderr', body: [
    'Mỗi chương trình khi chạy có sẵn ba "ống" dữ liệu, đánh số bằng **file descriptor** (fd):',
    { tbl: [['fd', 'Tên', 'Mặc định nối với', 'Dùng để'], ['`0`', 'stdin (đầu vào chuẩn)', 'Bàn phím', 'Chương trình đọc dữ liệu'], ['`1`', 'stdout (đầu ra chuẩn)', 'Màn hình', 'Kết quả bình thường'], ['`2`', 'stderr (lỗi chuẩn)', 'Màn hình', 'Thông báo lỗi và cảnh báo']] },
    { pre: ['$ ls notes.txt khong-co', "ls: cannot access 'khong-co': No such file or directory   <-- đi ra stderr (fd 2)", 'notes.txt                                                    <-- đi ra stdout (fd 1)'], cap: 'Cả hai cùng hiện ra màn hình nhưng là hai luồng khác nhau' },
    'Nhờ tách riêng, bạn có thể lưu kết quả vào file mà vẫn thấy lỗi trên màn hình, hoặc ngược lại. Mọi toán tử trong chương này chỉ làm một việc: **đổi nơi nối** của một trong ba luồng.'
  ] },
  { tag: 'Cú pháp', title: 'Chuyển hướng đầu ra: > >> 2> 2>&1 &>', body: [
    { tbl: [['Viết', 'Ý nghĩa'], ['`lệnh > file`', 'stdout ghi vào file (**xoá nội dung cũ**, tạo mới nếu chưa có)'], ['`lệnh >> file`', 'stdout **nối thêm** vào cuối file'], ['`lệnh 2> file`', 'chỉ stderr vào file'], ['`lệnh > out 2> err`', 'tách riêng hai luồng'], ['`lệnh > file 2>&1`', 'stderr đi **cùng chỗ với stdout** (cả hai vào file)'], ['`lệnh &> file`', 'cách viết tắt của dòng trên (bash)'], ['`lệnh > /dev/null`', 'vứt stdout đi'], ['`lệnh 2> /dev/null`', 'vứt thông báo lỗi']] },
    { pre: ['echo "bắt đầu" > log.txt          # tạo/ghi đè', 'echo "dòng 2" >> log.txt          # nối thêm', 'ls khong-co 2> err.txt           # lỗi vào err.txt, màn hình sạch', 'ls notes.txt khong-co > out.txt 2>&1   # cả hai vào out.txt', 'ls khong-co 2>/dev/null; echo $?  # không thấy lỗi nhưng mã thoát vẫn là 2'], cap: 'Ví dụ' },
    { note: 'Thứ tự quan trọng: `lệnh > file 2>&1` đúng (đưa stdout vào file trước, rồi stderr theo stdout). `lệnh 2>&1 > file` sai: stderr bị nối tới nơi stdout đang trỏ (màn hình), **rồi** stdout mới chuyển vào file, nên lỗi vẫn hiện trên màn hình.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Chuyển hướng đầu vào: <, here-doc, here-string', body: [
    { pre: ['wc -l < notes.txt                 # đọc từ file thay vì bàn phím', 'sort < todo.md > sorted.md          # vào từ file, ra vào file', 'tr a-z A-Z <<< "xin chao"          # here-string: một chuỗi làm stdin'], cap: '< và <<<' },
    { pre: ['cat > config.ini << EOF', '[server]', 'port=8080', 'home=$HOME', 'EOF', '', 'cat > raw.txt << \'EOF\'          # nháy đơn quanh EOF: không mở rộng $biến', 'giá trị là $HOME', 'EOF'], cap: 'Here-doc: nhập nhiều dòng ngay trong lệnh' },
    { ul: ['Here-doc kết thúc ở dòng chỉ có đúng từ khoá (ở đây `EOF`), không thụt lề, không dấu cách thừa', 'Không có nháy: `$HOME` và `$(...)` được mở rộng; có nháy quanh từ khoá: giữ nguyên văn', 'Ghi file cấu hình cần root: `sudo tee /etc/app.conf << EOF ... EOF` (đừng dùng `sudo cat > file`, chuyển hướng không được hưởng sudo)'] },
    { note: 'Heredoc có chương riêng ngay sau chương này (chương "Heredoc"): luật dấu kết thúc, `<<-`, ghi file bằng `sudo tee`, here-string, crontab và các lỗi thường gặp.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Pipe: nối stdout của lệnh này vào stdin của lệnh kia', body: [
    'Dấu `|` nối **stdout** của lệnh bên trái vào **stdin** của lệnh bên phải; các lệnh chạy cùng lúc. Đây là cách ghép các công cụ nhỏ thành công cụ lớn.',
    { pre: ['ls | wc -l                                  # đếm số mục', 'grep ERROR logs/app.log | wc -l             # đếm dòng lỗi', 'cut -d, -f3 data/users.csv | sort | uniq -c | sort -rn   # thống kê theo cột', 'ps aux | grep node                          # lọc tiến trình', 'history | tail -5', 'cat access.log | awk \'{print $1}\' | sort | uniq -c | sort -rn | head   # top IP'], cap: 'Ví dụ pipeline' },
    { ul: ['Pipe chỉ mang **stdout**. stderr vẫn ra màn hình, trừ khi bạn viết `2>&1 |` (hoặc `|&` trong bash)', 'Mỗi lệnh trong pipeline là một tiến trình riêng: biến gán trong đó (ví dụ `echo x | read v`) không vào shell cha', 'Pipe không lưu gì xuống đĩa; nếu muốn vừa xem vừa lưu, dùng `tee`'] },
    { pre: ['printf \'a\\nb\\n\' | xargs -I{} echo "mục {}"   # xargs: biến dòng đầu vào thành đối số', 'find . -name "*.tmp" | xargs rm -v'], cap: 'xargs: cầu nối giữa pipe và đối số' }
  ] },
  { tag: 'Lưu ý', title: 'tee có chương riêng', body: [
    '`tee` (ghi đè, nối thêm `-a`, nhiều file, `sudo tee`) được học ở chương **tee** ngay sau chương Heredoc.'
  ] },
  { tag: 'Lưu ý', title: 'Cái bẫy: lệnh > file xoá file trước khi lệnh chạy', body: [
    'Shell mở và **cắt rỗng** file đích ngay lúc bắt đầu, **trước** khi lệnh kịp đọc gì. Nếu đầu vào và đầu ra là cùng một file, bạn mất dữ liệu.',
    { pre: ['$ sort data.txt > data.txt', '$ wc -c data.txt', '0 data.txt              # file đã rỗng!', '', '$ cat log.txt >> log.txt', 'cat: log.txt: input file is output file'], cap: 'Bẫy kinh điển' },
    { tbl: [['Muốn', 'Cách an toàn'], ['Sắp xếp tại chỗ', '`sort -o data.txt data.txt` (sort tự xử lý), hoặc `sort data.txt > tmp && mv tmp data.txt`'], ['Sửa tại chỗ bằng sed', '`sed -i \'s/a/b/\' file`'], ['Bảo vệ khỏi ghi đè', '`set -C` (noclobber): `>` báo lỗi nếu file đã tồn tại; ép ghi bằng `>|`'], ['Giữ bản sao', '`cp data.txt data.txt.bak` trước khi biến đổi']] },
    { note: 'Luôn ghi ra file **khác** rồi `mv` đè lên bản gốc sau khi kiểm tra kết quả. Với dữ liệu quan trọng, sao lưu trước.', kind: 'warn' }
  ] },
  { tag: 'Khái niệm', title: 'Mã thoát trong pipeline: $?, PIPESTATUS, pipefail', body: [
    'Mặc định, mã thoát của cả pipeline là mã của **lệnh cuối cùng**. Lệnh đầu thất bại có thể bị giấu đi.',
    { pre: ['false | true; echo $?                 # 0  (false thất bại nhưng bị giấu)', 'ls khong-co | wc -l; echo "${PIPESTATUS[@]}"   # 2 0  (mã từng lệnh)', 'set -o pipefail', 'false | true; echo $?                 # 1  (một lệnh lỗi là cả pipeline lỗi)'], cap: 'Nhìn vào mã thoát' },
    { pre: ['set -o pipefail', './build.sh | tee build.log && echo "BUILD OK"    # không in OK nếu build.sh thất bại'], cap: 'Dùng trong script triển khai' },
    { ul: ['Không có `pipefail`, `./build.sh | tee build.log && deploy` vẫn deploy dù build lỗi, vì `tee` thành công', 'Trong script, đặt `set -euo pipefail` ở đầu (xem chương Script nâng cao)'] }
  ] },
  { tag: 'Cú pháp', title: 'Nhóm lệnh và chuyển hướng cả nhóm', body: [
    { tbl: [['Cú pháp', 'Chạy ở', 'Ghi chú'], ['`( a; b )`', 'Shell con', '`cd` và biến bên trong không ảnh hưởng ngoài'], ['`{ a; b; }`', 'Shell hiện tại', 'Cần dấu cách sau `{` và `;` trước `}`']] },
    { pre: ['{ date; echo "---"; ls; } > report.txt     # cả khối ghi vào một file', '( cd /tmp && ls ) | head -3                # cd không đổi thư mục của bạn', 'while read line; do echo "[$line]"; done < todo.md   # vòng lặp đọc file'], cap: 'Ví dụ' },
    { pre: ['*/5 * * * * /srv/app/job.sh >> /var/log/job.log 2>&1'], cap: 'Mẫu chuẩn cho cron: ghi cả stdout và stderr vào log' }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['File bị rỗng sau `cmd f > f`', 'Shell cắt rỗng file trước khi chạy', 'Ghi sang file khác rồi `mv`, hoặc `sort -o`'], ['Log thiếu thông báo lỗi', 'Chỉ chuyển stdout (`>`), stderr vẫn ra terminal/cron mail', '`>> log 2>&1`'], ['Lỗi vẫn hiện dù đã `2>&1 > file`', 'Sai thứ tự', '`> file 2>&1`'], ['`sudo cmd > /etc/f` bị từ chối', 'Phần `>` do shell của bạn mở', '`cmd | sudo tee /etc/f`'], ['Pipeline báo thành công dù bước đầu lỗi', 'Chỉ lấy mã của lệnh cuối', '`set -o pipefail`'], ['`xargs` hỏng với tên file có dấu cách', 'Tách theo khoảng trắng', '`find ... -print0 | xargs -0 ...`'], ['Biến gán trong `| while read` mất sau vòng lặp', 'Mỗi phần của pipe là shell con', 'Dùng `while ...; done < file`']] },
    { ul: ['Đầu ra nào cần giữ: stdout, stderr hay cả hai?', 'Có cùng file làm cả đầu vào lẫn đầu ra không?', '`>` hay `>>`: bạn có định xoá nội dung cũ?', 'Mã thoát của bước giữa pipeline có quan trọng không (`pipefail`)?'] }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`ls notes.txt khong-co`", "Hai luồng hiện cùng lúc ra màn hình: notes.txt (stdout) và thông báo lỗi khong-co (stderr).", "ls: cannot access 'khong-co': No such file or directory / notes.txt"], ["`ls notes.txt khong-co > out.txt`", "stdout ghi vào out.txt, còn stderr vẫn hiện trên màn hình.", "ls: cannot access 'khong-co': No such file or directory"], ["`ls notes.txt khong-co 2> err.txt`", "stderr ghi vào err.txt, stdout ra màn hình.", "notes.txt"], ["`ls notes.txt khong-co > a.out 2> a.err`", "Tách hai luồng ra hai file khác nhau: a.out cho kết quả, a.err cho lỗi.", "[a.out] notes.txt"], ["`ls notes.txt khong-co > both.txt 2>&1`", "2>&1 gộp stderr vào cùng chỗ với stdout. Cả hai nằm trong both.txt.", "[both.txt] ls: cannot access 'khong-co': No such file or directory / notes.txt"], ["`ls notes.txt khong-co &> all.txt`", "&> là cách viết ngắn của bash cho cả stdout và stderr vào một file.", "(không in ra)"], ["`ls khong-co 2>/dev/null`", "Chuyển stderr vào /dev/null (bỏ đi) nên không thấy thông báo lỗi.", "(không in ra)"], ["`echo $?`", "$? là mã thoát của lệnh trước: 2 nghĩa là lỗi.", "2"], ["`echo \"dòng 1\" > log.txt`", "> ghi đè file, dòng 1 là nội dung duy nhất.", "[log.txt] dòng 1"], ["`echo \"dòng 2\" >> log.txt`", ">> nối thêm vào cuối file.", "[log.txt] dòng 1 / dòng 2"], ["`wc -l < notes.txt`", "Đầu vào lấy từ notes.txt, wc chỉ in số dòng.", "3"], ["`wc -l < todo.md > count.txt`", "Đếm dòng của todo.md rồi ghi kết quả vào count.txt.", "[count.txt] 4"], ["`: > empty.txt`", ": là lệnh rỗng; chuyển hướng > làm file thành rỗng hoặc tạo file rỗng.", "[empty.txt]"], ["`wc -c < empty.txt`", "Đếm byte: 0 vì file rỗng.", "0"], ["`echo a > x.txt`", "Ghi a vào x.txt (ghi đè).", "[x.txt] a"], ["`echo b >> x.txt`", "Nối b vào cuối x.txt.", "[x.txt] a / b"], ["`ls -1 > names.txt`", "ls -1 in mỗi tên file một dòng rồi ghi vào names.txt.", "[names.txt] a.err / a.out / all.txt / both.txt / count.txt / data / empty.txt / err.txt / log.txt / logs / names.txt / notes.txt / out.tx…"], ["`echo xin chao | tr a-z A-Z > up.txt`", "Pipe đưa chuỗi sang tr để đổi chữ thường thành chữ hoa, kết quả ghi vào up.txt.", "[up.txt] XIN CHAO"], ["`grep ERROR logs/app.log | wc -l`", "grep lọc dòng có ERROR, wc đếm số dòng đó.", "1"], ["`ls | wc -l`", "Đếm số mục trong thư mục hiện tại.", "22"], ["`cut -d, -f2 data/users.csv | wc -l`", "cut lấy cột thứ 2 (phân tách bằng dấu phẩy), wc đếm số dòng.", "4"], ["`cp notes.txt n.txt`", "Sao chép notes.txt thành n.txt.", "(không in ra)"], ["`echo mới > n.txt`", "Ghi đè n.txt bằng nội dung mới.", "[n.txt] mới"], ["`cat n.txt`", "Xem nội dung n.txt sau khi ghi đè.", "mới"], ["`echo \"bản mới\" > new.txt`", "Tạo new.txt với một dòng.", "[new.txt] bản mới"], ["`mv new.txt notes-moi.txt`", "Đổi tên new.txt thành notes-moi.txt.", "(không in ra)"], ["`cat notes-moi.txt`", "Xem nội dung file vừa đổi tên.", "bản mới"], ["`cat log.txt >> log.txt`", "Shell từ chối vì đọc và ghi cùng một file, sẽ làm mất nội dung.", "cat: log.txt: input file is output file"], ["`echo a > nc.txt`", "Tạo nc.txt để thử noclobber.", "[nc.txt] a"], ["`set -C`", "set -C bật noclobber: > không ghi đè file có sẵn.", "(không in ra)"], ["`echo x > nc.txt`", "Bị chặn vì nc.txt đã tồn tại và noclobber đang bật.", "[nc.txt] x"], ["`echo y >| nc.txt`", ">| ép ghi đè dù noclobber đang bật.", "(không in ra)"], ["`set +C`", "Tắt noclobber, > ghi đè bình thường.", "(không in ra)"], ["`ls khong-co | wc -l`", "Lỗi hiện ra màn hình vì stderr không đi vào pipe. wc đếm được 0 dòng.", "ls: cannot access 'khong-co': No such file or directory / 0"], ["`echo \"${PIPESTATUS[@]}\"`", "PIPESTATUS là mảng mã thoát của từng lệnh trong pipe gần nhất; 2 là ls, 0 là wc.", "2 0"], ["`false | true; echo $?`", "Mã thoát của pipe là mã của lệnh cuối cùng (true), nên là 0.", "0"], ["`set -o pipefail`", "Bật pipefail: pipe trả về lỗi nếu một lệnh trong đó lỗi.", "(không in ra)"], ["`{ date; echo \"---\"; ls; } > report.txt`", "Gom nhiều lệnh vào một chuyển hướng, ghi cả ba kết quả vào report.txt.", "[report.txt] Tue Oct 27 10:20:00 +07 2026 / --- / a.err  a.out  all.txt  both.txt  count.txt  data  empty.txt  err.txt  log.txt  logs  n.…"], ["`printf 'a\\nb\\n' | xargs -I{} echo mục {}`", "xargs biến từng dòng đầu vào thành tham số cho lệnh echo.", "mục a / mục b"], ["`while read line; do echo \"[$line]\"; done < todo.md`", "Đọc từng dòng todo.md và in trong dấu ngoặc vuông.", "[# Việc cần làm] / [- [ ] Cập nhật Node.js lên bản LTS] / [- [ ] Tắt đăng nhập SSH bằng mật khẩu] / [- [x] Cài Nginx]"], ["`echo '*/5 * * * * /srv/job.sh >> /var/log/job.log 2>&1' > cron.txt`", "Ghi dòng cron vào cron.txt. Lưu ý: $ trong nháy đơn không được mở rộng.", "(không in ra)"]]}]});
T.quiz = C.QZ(8, [
  ['Trong `ls notes.txt khong-co`, thông báo "cannot access" đi ra luồng nào?', 'stderr (fd 2)', ['stdout (fd 1)', 'stdin (fd 0)', 'Không luồng nào'], 'Lỗi luôn đi ra stderr, tách riêng với kết quả bình thường ở stdout.'],
  ['Khác biệt giữa `>` và `>>`?', '`>` ghi đè từ đầu, `>>` nối vào cuối', ['`>` dành cho lỗi, `>>` cho kết quả', 'Không khác nhau', '`>>` luôn xoá file cũ'], 'Dùng `>>` cho log và file cấu hình khi muốn giữ nội dung cũ.'],
  ['Cách ghi **cả stdout và stderr** vào `all.log` đúng?', '`cmd > all.log 2>&1`', ['`cmd 2>&1 > all.log`', '`cmd 2> all.log`', '`cmd | all.log`'], 'Đưa stdout vào file trước, rồi cho stderr theo stdout. Đảo thứ tự thì stderr vẫn ra màn hình.'],
  ['`ls khong-co 2>/dev/null; echo $?` in ra?', 'Một số khác 0 (ví dụ 2)', ['0', 'Thông báo lỗi', 'Không in gì'], 'Giấu thông báo lỗi không đổi mã thoát.'],
  ['Chạy `sort data.txt > data.txt` thì kết quả?', 'File `data.txt` bị cắt rỗng, mất dữ liệu', ['File được sắp xếp tại chỗ', 'Lệnh báo lỗi và không đổi gì', 'Dữ liệu được nối đôi'], 'Shell cắt rỗng file đích trước khi `sort` đọc. Dùng `sort -o data.txt data.txt`.'],
  ['Mục đích của `cat > a.conf << \'EOF\'` (nháy đơn quanh EOF)?', 'Nhập nhiều dòng và **không** mở rộng `$biến` bên trong', ['Chạy lệnh EOF', 'Ghi đè mọi file `.conf`', 'Đọc file có tên EOF'], 'Có nháy quanh từ khoá thì nội dung giữ nguyên văn.'],
  ['`ps aux | grep node` hoạt động thế nào?', 'stdout của `ps` trở thành stdin của `grep`', ['stderr của ps vào grep', 'grep chạy trước, ps chạy sau', 'ps ghi file tạm rồi grep đọc'], 'Pipe nối stdout bên trái vào stdin bên phải.'],
  ['`false | true; echo $?` in `0`. Cách làm pipeline báo lỗi khi bất kỳ bước nào lỗi?', '`set -o pipefail`', ['`set -x`', '`set -u`', 'Thêm `&` cuối dòng'], 'Mặc định chỉ lấy mã của lệnh cuối. `pipefail` lấy mã lỗi của bước thất bại.'],
  ['Dòng crontab nào ghi đủ cả lỗi của job vào log?', '`*/5 * * * * /srv/job.sh >> /var/log/job.log 2>&1`', ['`*/5 * * * * /srv/job.sh > /var/log/job.log`', '`*/5 * * * * /srv/job.sh 2>&1`', '`*/5 * * * * /srv/job.sh | /var/log/job.log`'], 'Nối thêm (`>>`) và gộp stderr (`2>&1`) để không mất thông báo lỗi.'],
  ['Vì sao `cat log.txt >> log.txt` báo "input file is output file"?', 'cat từ chối đọc và ghi cùng một file để tránh vòng lặp vô hạn', ['File log.txt quá lớn', 'Thiếu quyền ghi', '`>>` không dùng được với cat'], 'Đầu vào cũng là đầu ra sẽ làm file phình mãi; cat chặn lại.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Chạy `ls notes.txt khong-co` để thấy kết quả và lỗi lẫn trên màn hình.', hint: 'ls notes.txt khong-co', check: A(/^ls notes\.txt khong-co$/) },
    { text: 'Ghi riêng stdout vào `out.txt` (lỗi vẫn hiện trên màn hình).', hint: 'ls notes.txt khong-co > out.txt', check: function (s) { return has(s, 'out.txt', /notes\.txt/) && !has(s, 'out.txt', /cannot access/); } },
    { text: 'Ghi riêng stderr vào `err.txt`.', hint: 'ls notes.txt khong-co 2> err.txt', check: function (s) { return has(s, 'err.txt', /cannot access/) && !has(s, 'err.txt', /^notes\.txt/m); } },
    { text: 'Tách hai luồng vào hai file `a.out` và `a.err` trong một lệnh.', hint: 'ls notes.txt khong-co > a.out 2> a.err', check: function (s) { return has(s, 'a.out', /notes\.txt/) && has(s, 'a.err', /cannot access/); } },
    { text: 'Gộp cả hai luồng vào `both.txt` bằng `2>&1` (đúng thứ tự).', hint: 'ls notes.txt khong-co > both.txt 2>&1', check: function (s) { return has(s, 'both.txt', /notes\.txt/) && has(s, 'both.txt', /cannot access/); } },
    { text: 'Làm điều tương tự bằng cách viết tắt `&>` vào `all.txt`.', hint: 'ls notes.txt khong-co &> all.txt', check: function (s) { return has(s, 'all.txt', /notes\.txt/) && has(s, 'all.txt', /cannot access/); } },
    { text: 'Im lặng thông báo lỗi bằng `2>/dev/null`, rồi in mã thoát `$?`.', hint: 'ls khong-co 2>/dev/null\necho $?', check: AND(function (s) { return histN(s, /^ls khong-co$/) > 0; }, OK(/^echo 2$/)) },
    { text: 'Tạo `log.txt` bằng `>` với dòng `dòng 1`.', hint: 'echo "dòng 1" > log.txt', check: function (s) { return has(s, 'log.txt', /dòng 1/); } },
    { text: 'Nối thêm `dòng 2` vào `log.txt` bằng `>>` (giữ dòng 1).', hint: 'echo "dòng 2" >> log.txt', check: function (s) { return has(s, 'log.txt', /dòng 1\ndòng 2\n/); } },
    { text: 'Đếm số dòng của `notes.txt` bằng cách cho `wc -l` đọc từ file qua `<`.', hint: 'wc -l < notes.txt', check: OK(/^wc -l$/) },
    { text: 'Ghi số dòng của `todo.md` vào `count.txt` bằng `wc -l < todo.md > count.txt`.', hint: 'wc -l < todo.md > count.txt', check: function (s) { return has(s, 'count.txt', /^4\n$/); } },
    { text: 'Tạo file rỗng bằng `: > empty.txt` (`:` không làm gì, chỉ để chuyển hướng ghi đè), rồi kiểm tra kích thước bằng `wc -c < empty.txt` (kết quả 0).', hint: ': > empty.txt\nwc -c < empty.txt', check: function (s) { var n = s.fs.get(W(s) + 'empty.txt'); return !!n && (n.c || '') === ''; } },
    { text: 'Tạo `x.txt` bằng `echo a > x.txt`, rồi nối thêm `echo b >> x.txt` (giữ dòng `a`).', hint: 'echo a > x.txt\necho b >> x.txt', check: function (s) { return has(s, 'x.txt', /^a\nb\n$/); } },
    { text: 'Ghi danh sách tên mục của thư mục hiện tại, mỗi tên một dòng, vào `names.txt` bằng `ls -1 > names.txt`.', hint: 'ls -1 > names.txt', check: function (s) { return has(s, 'names.txt', /notes\.txt/); } },
    { text: 'Đổi chữ hoa bằng pipe: `echo xin chao | tr a-z A-Z > up.txt`, rồi kiểm tra `up.txt`.', hint: 'echo xin chao | tr a-z A-Z > up.txt', check: function (s) { return has(s, 'up.txt', /^XIN CHAO\n$/); } },
    { text: 'Đếm dòng ERROR trong log bằng pipe `grep ... | wc -l`.', hint: 'grep ERROR logs/app.log | wc -l', check: AND(OK(/^grep ERROR logs\/app\.log$/), OK(/^wc -l$/)) },
    { text: 'Đếm số mục của thư mục hiện tại bằng `ls | wc -l`.', hint: 'ls | wc -l', check: AND(OK(/^ls$/), OK(/^wc -l$/)) },
    { text: 'Lấy cột 2 (tên) của `data/users.csv` và đếm bằng pipe: `cut -d, -f2 data/users.csv | wc -l`.', hint: 'cut -d, -f2 data/users.csv | wc -l', check: AND(OK(/^cut -d, -f2 data\/users\.csv$/), OK(/^wc -l$/)) },
    { text: 'Làm hỏng thử trên bản sao: `cp notes.txt n.txt` rồi `echo mới > n.txt`, kiểm tra nội dung `n.txt` bằng `cat`.', hint: 'cp notes.txt n.txt\necho mới > n.txt\ncat n.txt', check: function (s) { return has(s, 'n.txt', /^mới\n$/); } },
    { text: 'Ghi nháp rồi đổi tên an toàn: `echo "bản mới" > new.txt` rồi `mv new.txt notes-moi.txt`, xem bằng `cat notes-moi.txt`.', hint: 'echo "bản mới" > new.txt\nmv new.txt notes-moi.txt\ncat notes-moi.txt', check: function (s) { return has(s, 'notes-moi.txt', /^bản mới\n$/) && !s.fs.get(W(s) + 'new.txt'); } },
    { text: 'Thử `cat log.txt >> log.txt` để thấy cat từ chối.', hint: 'cat log.txt >> log.txt', check: FAIL(/^cat log\.txt$/) },
    { text: 'Bật noclobber `set -C`, thử ghi đè `nc.txt` (tạo bằng `echo a > nc.txt` trước; bị chặn), ép ghi bằng `>|`, rồi tắt bằng `set +C`.', hint: 'echo a > nc.txt\nset -C\necho x > nc.txt\necho y >| nc.txt\nset +C', check: function (s) { return has(s, 'nc.txt', /^y\n$/); } },
    { text: 'Xem mã từng bước trong pipeline: `ls khong-co | wc -l` rồi in `${PIPESTATUS[@]}`.', hint: 'ls khong-co | wc -l\necho "${PIPESTATUS[@]}"', check: OK(/^echo 2 0$/) },
    { text: 'Chứng minh pipeline giấu lỗi: chạy `false | true; echo $?` (được 0), rồi bật `pipefail` và chạy lại (được 1).', hint: 'false | true; echo $?\nset -o pipefail\nfalse | true; echo $?', check: AND(OK(/^echo 0$/), OK(/^echo 1$/)) },
    { text: 'Ghi cả một khối lệnh vào một file: `{ date; echo "---"; ls; } > report.txt`.', hint: '{ date; echo "---"; ls; } > report.txt', check: function (s) { return has(s, 'report.txt', /---/) && has(s, 'report.txt', /notes\.txt/); } },
    { text: 'Dùng `xargs -I{}` để in mỗi dòng đầu vào thành `mục <giá trị>`.', hint: "printf 'a\\nb\\n' | xargs -I{} echo mục {}", check: OK(/^xargs -I\{\} echo mục \{\}$/) },
    { text: 'Đọc `todo.md` từng dòng bằng vòng `while read` với `< todo.md`.', hint: 'while read line; do echo "[$line]"; done < todo.md', check: OK(/^echo \[# Việc cần làm\]$/) },
    { text: 'Viết dòng crontab mẫu ghi cả stdout và stderr vào log và lưu vào `cron.txt`.', hint: "echo '*/5 * * * * /srv/job.sh >> /var/log/job.log 2>&1' > cron.txt", check: function (s) { return has(s, 'cron.txt', />> \/var\/log\/job\.log 2>&1/); } }
  ]
};

var JOB = ['#!/bin/bash', 'echo "bắt đầu job"', 'echo "lỗi: thiếu thư mục /srv/data" >&2', 'echo "kết thúc job"'];
var BUILD = ['#!/bin/bash', 'echo "biên dịch..."', 'echo "lỗi: thiếu module x" >&2', 'exit 1'];
var USERS_RAW = ['id,name,role', '3,Cô Hà,teacher', '1,An,student', '2,Bình,student'];

T.debugs = [
  {
    id: 'lb4d1', title: 'Sắp xếp xong thì users.csv rỗng',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sort users.csv > users.csv', '$ wc -c users.csv', '0 users.csv', '$ ls users.csv*', 'users.csv  users.csv.bak'),
    story: 'Bạn định sắp xếp `users.csv` tại chỗ bằng `sort users.csv > users.csv` và mất sạch nội dung. May còn bản `users.csv.bak`.',
    goal: 'Khôi phục `users.csv` (đủ 4 dòng) và sắp xếp nó, **không** tái phạm lỗi cũ.',
    hints: ['Vì sao file rỗng? Ai mở và cắt rỗng file `users.csv` trước khi `sort` kịp đọc?', 'Shell cắt rỗng file đích khi mở để ghi, trước khi `sort` chạy. Khôi phục từ `users.csv.bak` trước.', '`sort users.csv.bak > users.csv` (đọc từ file khác), hoặc `cp users.csv.bak users.csv` rồi `sort -o users.csv users.csv`.'],
    fix: ['sort users.csv.bak > users.csv', 'cat users.csv'],
    cause: 'Chuyển hướng `>` được xử lý trước khi lệnh chạy: file bị cắt rỗng rồi `sort` đọc một file rỗng. Quy tắc: đừng đọc và ghi cùng một file trong một lệnh. Dùng file tạm + `mv`, `sort -o`, `sed -i`, hoặc `set -C` để shell từ chối ghi đè.',
    setup: function (s) { base(s, { setup: function (s2, l, h) {
      LB.put(s2, h + '/users.csv', '');
      LB.put(s2, h + '/users.csv.bak', USERS_RAW.join('\n') + '\n');
    } }); },
    check: function (s) {
      var a = ftxt(s, W(s) + 'users.csv').split('\n').filter(Boolean), srt = a.slice().sort();
      return a.length === 4 && a.join('|') === srt.join('|');
    }
  },
  {
    id: 'lb4d2', title: 'File log không có thông báo lỗi của job',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./job.sh > job.log', 'lỗi: thiếu thư mục /srv/data', '$ cat job.log', 'bắt đầu job', 'kết thúc job'),
    story: 'Bạn chuyển hướng đầu ra của `job.sh` vào `job.log`, nhưng lỗi vẫn hiện trên màn hình và log thì thiếu nó. Khi chuyển sang cron, lỗi sẽ biến mất hoàn toàn.',
    goal: '`job.log` chứa **cả** dòng thường lẫn dòng `lỗi: ...`, và lần chạy mới nối vào cuối chứ không ghi đè.',
    hints: ['Dòng "lỗi" đi ra luồng nào? `>` chuyển luồng nào?', '`>` chỉ chuyển stdout (fd 1). Thông báo lỗi ở stderr (fd 2).', '`./job.sh >> job.log 2>&1`, rồi `cat job.log`.'],
    fix: ['./job.sh >> job.log 2>&1', 'cat job.log'],
    cause: 'Mỗi luồng cần chuyển hướng riêng. `> file 2>&1` (hoặc `&> file`) gộp cả hai. Dùng `>>` cho log để lần chạy sau không xoá lần trước. Đây chính là dạng dòng lệnh chuẩn trong crontab.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/job.sh', JOB.join('\n') + '\n', { mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, W(s) + 'job.log'); return /bắt đầu job/.test(t) && /lỗi: thiếu thư mục/.test(t) && /kết thúc job/.test(t); }
  },
  {
    id: 'lb4d3', title: '2>&1 mà lỗi vẫn hiện ra màn hình',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./job.sh 2>&1 > all.log', 'lỗi: thiếu thư mục /srv/data', '$ cat all.log', 'bắt đầu job', 'kết thúc job'),
    story: 'Bạn đã thêm `2>&1` nhưng lỗi vẫn bị in ra terminal và không có trong `all.log`. Có gì đó sai ở thứ tự.',
    goal: '`all.log` chứa cả 3 dòng của job (kể cả dòng lỗi), và màn hình không in dòng lỗi nữa.',
    hints: ['Các chuyển hướng được xử lý từ trái sang phải. Khi `2>&1` chạy, stdout đang trỏ vào đâu?', '`2>&1` nghĩa là "stderr tới nơi stdout đang trỏ **lúc này**". Lúc đó stdout còn ở màn hình.', 'Đặt `> all.log` trước: `./job.sh > all.log 2>&1`.'],
    fix: ['./job.sh > all.log 2>&1', 'cat all.log'],
    cause: '`2>&1` sao chép đích hiện tại của fd 1 sang fd 2. Nếu viết trước `> file`, nó sao chép "màn hình"; sau đó stdout mới chuyển sang file. Đúng thứ tự: `> file 2>&1`.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/job.sh', JOB.join('\n') + '\n', { mode: 493 }); } }); },
    check: function (s) { var t = ftxt(s, W(s) + 'all.log'); return /bắt đầu job/.test(t) && /lỗi: thiếu thư mục/.test(t) && /kết thúc job/.test(t); }
  },
  {
    id: 'lb4d4', title: 'Pipeline báo build thành công dù build lỗi', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./build.sh 2>&1 | tee build.log && touch deployed.flag', 'biên dịch...', 'lỗi: thiếu module x', '$ ls deployed.flag', 'deployed.flag', '$ echo $?', '0'),
    story: 'Quy trình triển khai: `./build.sh 2>&1 | tee build.log && touch deployed.flag`. `build.sh` thất bại (exit 1) nhưng cờ `deployed.flag` vẫn được tạo, nghĩa là deploy sẽ chạy trên bản build hỏng.',
    goal: 'Bật chế độ để lỗi của `build.sh` làm cả pipeline thất bại, rồi chạy lại quy trình sao cho `build.log` có log nhưng **không** tạo `deployed.flag`.',
    hints: ['Mã thoát của cả pipeline lấy từ lệnh nào? `echo "${PIPESTATUS[@]}"` sau khi chạy sẽ cho thấy gì?', 'Mặc định lấy mã của lệnh cuối (`tee`, luôn thành công) nên `&&` coi như xong. Cần `pipefail`.', '`set -o pipefail`, `rm -f deployed.flag`, chạy lại `./build.sh 2>&1 | tee build.log && touch deployed.flag`, rồi `ls deployed.flag` (không còn).'],
    fix: ['set -o pipefail', 'rm -f deployed.flag', './build.sh 2>&1 | tee build.log && touch deployed.flag', 'ls deployed.flag'],
    cause: 'Không có `pipefail`, mã thoát pipeline = mã của lệnh cuối, và `tee` luôn thành công nên lỗi của `build.sh` bị giấu. `set -o pipefail` (thường kèm `set -eu` trong script) làm pipeline trả mã lỗi của bước thất bại; `&&` sau đó không chạy.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/build.sh', BUILD.join('\n') + '\n', { mode: 493 }); LB.put(s2, h + '/deployed.flag', ''); } }); },
    check: function (s) { return !!(s.flags && s.flags.pipefail) && !s.fs.get(W(s) + 'deployed.flag') && /biên dịch/.test(ftxt(s, W(s) + 'build.log')); }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
