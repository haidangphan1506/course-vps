(function (G) {
'use strict';
/* Chương tx4: công cụ text khác và pipeline. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt;
function base(s, o) { C.TXT.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };

var T = {
  id: 'tx4', group: 'Công cụ văn bản', short: 'sort, cut, xargs',
  title: 'sort, uniq, cut, tr, xargs và pipeline',
  dek: 'Bộ đồ nghề còn lại: sắp xếp, đếm trùng, cắt cột, đổi ký tự, so sánh, find với xargs, tee, và cách ghép tất cả thành pipeline đáng tin cậy.'
};
C.insertAfter('tx3', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Triết lý pipeline: mỗi công cụ một việc', body: [
    'Mỗi lệnh Unix đọc **stdin**, ghi **stdout**, và làm đúng một việc. Dấu `|` nối stdout của lệnh trước vào stdin của lệnh sau. Ghép nhiều bước nhỏ sẽ giải được bài toán lớn mà không cần viết chương trình.',
    { pre: ['awk \'{print $1}\' access.log | sort | uniq -c | sort -rn | head -3', '#  1. lấy cột IP   2. xếp để các IP giống nhau liền kề   3. đếm   4. xếp theo số đếm giảm dần   5. lấy 3 dòng đầu'], cap: 'Ví dụ kinh điển: top 3 IP' },
    { tbl: [['Công cụ', 'Việc'], ['`sort`', 'Sắp xếp dòng'], ['`uniq`', 'Gộp/đếm dòng liền kề giống nhau'], ['`cut`', 'Cắt cột theo ký tự hoặc dấu tách'], ['`tr`', 'Đổi hoặc xoá ký tự'], ['`wc`', 'Đếm dòng, từ, byte'], ['`head` `tail`', 'Lấy đầu hoặc cuối'], ['`paste` `join` `comm`', 'Ghép và đối chiếu file'], ['`diff`', 'So sánh hai file'], ['`xargs`', 'Biến stdin thành đối số của lệnh'], ['`tee`', 'Vừa ghi file vừa chuyển tiếp']] },
    { note: 'Xây pipeline từng bước: chạy lệnh đầu, nhìn kết quả (`| head`), rồi thêm từng bước một. Đừng viết sẵn cả dãy 6 lệnh rồi mới chạy.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'sort: sắp xếp', body: [
    { tbl: [['Cờ', 'Nghĩa'], ['(không cờ)', 'Theo thứ tự chữ (lexical)'], ['`-n`', 'Theo giá trị số'], ['`-r`', 'Đảo ngược'], ['`-u`', 'Bỏ dòng trùng'], ['`-f`', 'Không phân biệt hoa/thường'], ['`-h`', 'Số kèm đơn vị (`2K`, `10M`), dùng với `du -h`'], ['`-t,`', 'Dấu tách cột'], ['`-k N`', 'Sắp theo cột N (`-k2,2` chỉ cột 2; `-k3 -n`)'], ['`-V`', 'Số phiên bản (`1.9` trước `1.10`)'], ['`-o file`', 'Ghi vào file (an toàn khi file đích là chính file nguồn)']] },
    { pre: ['sort emails.txt                      # chữ', 'printf "9\\n10\\n2\\n" | sort             # 10 2 9: thứ tự CHỮ, "10" < "2"', 'printf "9\\n10\\n2\\n" | sort -n          # 2 9 10', 'sort -t, -k6 -n -r orders.csv | head -3   # đơn có giá cao nhất', 'du -sh /var/* | sort -h               # thư mục lớn nhất ở cuối', 'sort -u emails.txt -o emails.txt      # bỏ trùng ngay tại file'], cap: 'sort theo ngữ cảnh' },
    { note: '`sort` không `-n` xếp **chữ**: `9999` đứng sau `88231`, vì `9` lớn hơn `8` ở ký tự đầu. Mọi cột số phải có `-n`. Và `sort f > f` làm trống file; hãy dùng `-o`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'uniq: đếm và gộp, luôn đi sau sort', body: [
    '`uniq` chỉ gộp các dòng **liền kề** giống nhau. Vì thế gần như luôn viết `sort | uniq`.',
    { pre: ['sort emails.txt | uniq          # bỏ trùng (như sort -u)', 'sort emails.txt | uniq -c       # kèm số lần xuất hiện', 'sort emails.txt | uniq -d       # chỉ in những dòng xuất hiện nhiều hơn một lần', 'sort emails.txt | uniq -u       # chỉ in những dòng xuất hiện đúng một lần', 'sort -f emails.txt | uniq -ci   # không phân biệt hoa thường'], cap: 'Các dạng uniq' },
    { pre: ['awk \'{print $9}\' access.log | sort | uniq -c | sort -rn     # đếm theo mã trạng thái, nhiều nhất trước'], cap: 'Công thức đếm tần suất (nhớ thuộc lòng)' },
    { note: '`sort | uniq -c | sort -rn` là bộ ba bạn sẽ gõ hàng trăm lần. Bỏ `sort` đầu tiên thì `uniq` chỉ gộp các dòng nằm cạnh nhau và số đếm sai.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'cut, paste, tr: cắt, ghép, đổi ký tự', body: [
    { pre: ['cut -d, -f3 orders.csv           # cột 3, tách bằng dấu phẩy', 'cut -d, -f1,3 orders.csv          # nhiều cột', 'cut -f1,3 grades.tsv              # mặc định tách bằng TAB', 'cut -c1-10 app.log               # 10 ký tự đầu', 'paste -sd, servers.txt           # gộp mọi dòng thành 1 dòng, ngăn bằng dấu phẩy', 'paste a.txt b.txt                # ghép hai file theo cột'], cap: 'cut và paste' },
    { pre: ['echo tutor | tr a-z A-Z                 # chữ hoa', 'echo "a1b2" | tr -d 0-9                 # xoá chữ số: ab', 'echo "a    b" | tr -s " "               # gộp khoảng trắng lặp: a b', 'tr "\\n" "," < servers.txt                # đổi xuống dòng thành dấu phẩy', 'tr -d "\\r" < win.txt > unix.txt           # bỏ CR'], cap: 'tr làm việc theo từng ký tự' },
    { ul: ['`cut` chỉ tách theo **một ký tự** cố định, không xử lý "nhiều dấu cách". Với cột phân cách không đều dùng `awk`', '`tr` nhận dữ liệu từ stdin, không nhận tên file: dùng `tr ... < file`', '`tr a-z A-Z` đổi từng ký tự tương ứng, không phải chuỗi; muốn đổi chuỗi dùng `sed`'] }
  ] },
  { tag: 'Bảng tra', title: 'head, tail, wc, tac, nl, column', body: [
    { tbl: [['Lệnh', 'Tác dụng'], ['`head -n 5 f`', '5 dòng đầu'], ['`tail -n 5 f`', '5 dòng cuối'], ['`tail -n +2 f`', 'Từ dòng 2 trở đi (bỏ tiêu đề)'], ['`tail -f f`', 'Theo dõi file khi có dòng mới'], ['`wc -l f`', 'Đếm dòng'], ['`wc -w`, `wc -c`', 'Đếm từ, byte'], ['`tac f`', 'In ngược thứ tự dòng'], ['`rev`', 'Đảo ngược từng dòng'], ['`nl f`', 'Đánh số dòng'], ['`column -t f`', 'Căn cột thành bảng gọn'], ['`fold -w 40 f`', 'Cắt dòng dài']] },
    { pre: ['grep ERROR app.log | wc -l           # đếm số dòng khớp', 'tail -n +2 orders.csv | wc -l        # số đơn (bỏ tiêu đề)', 'column -t servers.txt                # bảng thẳng hàng', 'tac app.log | head -n 3              # 3 dòng cuối nhưng in từ dưới lên'], cap: 'Ghép nhanh' },
    { note: '`wc -l` đếm ký tự xuống dòng. File không kết thúc bằng `\\n` sẽ báo thiếu một dòng so với số dòng bạn thấy.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'So sánh: diff, comm, cmp', body: [
    { pre: ['diff a.conf b.conf           # định dạng mặc định', 'diff -u a.conf b.conf        # dạng unified: dễ đọc, dùng trong patch, git', 'diff -r dir1 dir2           # so sánh cả thư mục', 'diff -q a b                 # chỉ nói khác nhau hay không', 'comm -12 a.txt b.txt        # dòng có ở CẢ HAI file (cần sort sẵn)', 'comm -23 a.txt b.txt        # dòng chỉ có ở a', 'cmp a b                     # khác nhau ở byte nào (file nhị phân)'], cap: 'So sánh hai file' },
    { tbl: [['Cột của `comm`', 'Nội dung', 'Bỏ bằng'], ['1', 'Chỉ trong file 1', '`-1`'], ['2', 'Chỉ trong file 2', '`-2`'], ['3', 'Có ở cả hai', '`-3`']] },
    { ul: ['`diff` trả mã 0 khi giống, 1 khi khác, 2 khi lỗi. Nhớ điều này khi dùng trong `if` hoặc với `set -e`', '`diff -u` có `-` cho dòng bị xoá và `+` cho dòng thêm vào', 'Trước khi `sed -i` hay đổi cấu hình: lưu bản cũ và `diff -u cũ mới`'] }
  ] },
  { tag: 'Cú pháp', title: 'find với xargs: xử lý hàng loạt file', body: [
    '`xargs` đọc các từ từ stdin rồi gọi lệnh với chúng làm đối số. Kết hợp `find` để xoá, đổi, tìm trong nhiều file:',
    { pre: ["find . -name '*.log' | xargs wc -l                  # đếm dòng của mọi .log", "find . -name '*.tmp' -print0 | xargs -0 rm          # an toàn khi tên file có khoảng trắng", "printf 'a\\nb\\n' | xargs -I{} echo item-{}            # -I{}: chạy một lần cho mỗi dòng", "echo 'a b c' | xargs -n1 echo                         # mỗi lần chỉ 1 đối số", "grep -rl TODO src | xargs sed -i 's/TODO/FIXME/'       # sửa hàng loạt", "find /var/log -name '*.gz' -mtime +30 -print0 | xargs -0 rm -f"], cap: 'Mẫu dùng xargs' },
    { note: 'Mặc định `xargs` tách theo **khoảng trắng và xuống dòng**, nên file tên `my report.tmp` bị hiểu thành `my` và `report.tmp`. Luôn dùng cặp `find ... -print0 | xargs -0` khi không chắc về tên file. Thêm `-r` (`xargs -0 -r rm`) để không chạy lệnh khi đầu vào rỗng: GNU `xargs` mặc định vẫn chạy `rm` một lần không đối số và báo `missing operand`. `find ... -delete` hoặc `-exec ... {} +` cũng an toàn.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Luồng, tee, chuyển hướng và mã thoát', body: [
    { tbl: [['Cú pháp', 'Ý nghĩa'], ['`>` / `>>`', 'Ghi đè / nối vào file'], ['`2>`', 'Chuyển stderr (thông báo lỗi) vào file'], ['`2>&1`', 'Gộp stderr vào stdout'], ['`> /dev/null 2>&1`', 'Bỏ hết đầu ra'], ['`tee f`', 'Ghi vào file **và** tiếp tục chuyển sang bước kế'], ['`tee -a f`', 'Như tee nhưng nối thêm']] },
    { pre: ['grep ERROR app.log | tee errors.txt | wc -l    # lưu lại và đếm', 'ls /khong-co 2> err.txt                  # lỗi vào file', 'cmd 2>&1 | tee run.log                   # lưu cả stdout lẫn stderr'], cap: 'Ví dụ' },
    { pre: ['set -o pipefail      # pipeline thất bại nếu BẤT KỲ bước nào thất bại', 'false | true; echo $?   # 0 mặc định (chỉ lấy mã bước cuối); 1 khi có pipefail'], cap: 'Mã thoát của pipeline' },
    { note: 'Mặc định mã thoát của pipeline là mã của lệnh **cuối**. Trong script quan trọng, bắt đầu bằng `set -euo pipefail` để lỗi ở giữa không bị nuốt mất. Nhớ rằng `grep` không khớp trả mã 1 và sẽ làm script dừng.', kind: 'tip' }
  ] },
  { tag: 'Bảng tra', title: 'Công thức pipeline thường dùng', body: [
    { tbl: [['Mục tiêu', 'Pipeline'], ['Top 3 IP', "`awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -3`"], ['Phân bố mã trạng thái', "`awk '{print $9}' access.log | sort | uniq -c | sort -rn`"], ['Đếm IP khác nhau', "`awk '{print $1}' access.log | sort -u | wc -l`"], ['Dòng lớn nhất theo byte', "`awk '{print $10, $7}' access.log | sort -n | tail -1`"], ['Email trùng', '`sort emails.txt | uniq -d`'], ['Email sau khi chuẩn hoá', '`tr A-Z a-z < emails.txt | sort -u`'], ['Nhóm lỗi trong log', "`grep -o 'ERROR [a-z]*' app.log | sort | uniq -c`"], ['Xoá file .tmp (an toàn)', "`find . -name '*.tmp' -print0 | xargs -0 rm`"], ['Dung lượng thư mục, lớn nhất cuối', '`du -sh /var/* 2>/dev/null | sort -h | tail`'], ['Xem thay đổi cấu hình', '`diff -u cũ.conf mới.conf`']] },
    { note: 'Khi một pipeline cho kết quả lạ, tách ra: chạy từng đoạn đầu và nhìn đầu ra. 90% lỗi nằm ở thiếu `sort`, thiếu `-n`, hoặc cột sai.', kind: 'tip' }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['Số đếm toàn là 1', '`uniq` mà chưa `sort`', '`sort | uniq -c`'], ['Số lớn nhất sai (9999 > 88231)', '`sort` không `-n`', '`sort -n`'], ['File biến thành rỗng', '`sort f > f`', '`sort f -o f` hoặc ghi ra file tạm'], ['`xargs rm` xoá thiếu / báo `No such file`', 'Tên file có khoảng trắng', '`-print0` và `xargs -0`'], ['`tr` không đọc file', '`tr` chỉ đọc stdin', '`tr ... < file`'], ['`cut` cột sai với file nhiều dấu cách', 'Dấu tách không đều', 'Dùng `awk`'], ['`sort` đặt chữ hoa trước chữ thường (hoặc ngược lại)', 'Locale: `C`/`C.UTF-8` xếp theo mã ký tự (hoa trước), `en_US.UTF-8` xếp theo từ điển', '`sort -f` để không phân biệt hoa thường; `LC_ALL=C sort` khi cần thứ tự byte ổn định giữa các máy'], ['Pipeline không báo lỗi dù bước giữa hỏng', 'Chỉ lấy mã bước cuối', '`set -o pipefail`']] },
    { ul: ['Mỗi bước của pipeline đã được chạy thử riêng bằng `| head` chưa?', 'Có `sort` trước `uniq`? Có `-n` với cột số?', 'Tên file có thể chứa khoảng trắng? Dùng `-print0` và `-0`', 'Lệnh sẽ **ghi** vào file nguồn không (`>` cùng file)? Dùng `-o`, `-i` hay file tạm', 'Script quan trọng có `set -euo pipefail` chưa?'] }
  ] }
];

T.quiz = C.QZ(4, [
  ['Vì sao hầu như luôn viết `sort | uniq`?', '`uniq` chỉ gộp các dòng giống nhau nằm liền kề', ['`uniq` chỉ đọc được từ file đã sắp xếp có đuôi .sorted', '`sort` làm `uniq` chạy nhanh hơn 10 lần', 'Vì `uniq` không đọc stdin'], 'Không sắp xếp trước thì các dòng giống nhau nằm rải rác và không được gộp.'],
  ['`printf "9\\n10\\n2\\n" | sort` cho thứ tự nào?', '10, 2, 9 (theo chữ)', ['2, 9, 10', '9, 10, 2', '10, 9, 2'], 'Mặc định `sort` so từng ký tự: `1` đứng trước `2` và `9`. Thêm `-n` để theo giá trị số.'],
  ['Pipeline đếm tần suất kinh điển, nhiều nhất trước, là?', '`sort | uniq -c | sort -rn`', ['`uniq -c | sort`', '`sort -u | wc -l`', '`uniq | sort -n`'], 'Sắp xếp để gom, đếm, rồi xếp theo số đếm giảm dần.'],
  ['`sort emails.txt > emails.txt` sẽ làm gì?', 'Làm file rỗng vì shell cắt file trước khi sort đọc', ['Sắp xếp file tại chỗ', 'Báo lỗi và giữ nguyên file', 'Nối kết quả vào cuối file'], 'Dùng `sort emails.txt -o emails.txt`, vì `-o` đọc xong rồi mới ghi.'],
  ['Cách đúng để lấy cột 3 của file CSV?', '`cut -d, -f3 orders.csv`', ['`cut -c3 orders.csv`', '`cut -f3 -s, orders.csv`', '`cut -col 3 orders.csv`'], '`-d` đặt dấu tách, `-f` chọn trường.'],
  ['Vì sao `echo "a1b2" | tr -d 0-9` cho `ab`?', '`tr -d` xoá mọi ký tự trong tập đã cho', ['`tr` chỉ giữ lại chữ cái', '`-d` nghĩa là digit', 'Nó thay chữ số bằng dấu cách'], '`-d` là delete. Tập `0-9` là các chữ số.'],
  ['Điều gì xảy ra với `find . -name "*.tmp" | xargs rm` nếu có file `my report.tmp`?', '`xargs` tách thành `my` và `report.tmp`, nên file đó không bị xoá', ['`rm` hỏi xác nhận', 'Xoá đúng file vì `rm` thông minh', 'Xoá cả thư mục'], 'Dùng `find ... -print0 | xargs -0 rm` để tên file được phân cách bằng ký tự NUL.'],
  ['Trong `comm -12 a.txt b.txt`, kết quả là gì?', 'Dòng có ở cả hai file', ['Dòng chỉ có ở a', 'Dòng chỉ có ở b', 'Dòng khác nhau giữa hai file'], '`-1` và `-2` ẩn cột "chỉ ở file 1" và "chỉ ở file 2", còn lại cột chung. Cả hai file phải được sort sẵn.'],
  ['`diff a b` trả mã thoát nào khi hai file khác nhau?', '1', ['0', '2', '127'], '0: giống, 1: khác, 2: lỗi. Cẩn thận khi dùng cùng `set -e`.'],
  ['`tee errors.txt` trong pipeline làm gì?', 'Ghi dữ liệu vào file và vẫn chuyển tiếp sang lệnh kế tiếp', ['Chỉ ghi vào file, không chuyển tiếp', 'Gửi email', 'Đọc file errors.txt'], 'Giống chữ T trong đường ống: một nhánh ra file, một nhánh đi tiếp.'],
  ['`false | true; echo $?` in ra gì khi KHÔNG có pipefail?', '0 (mã của lệnh cuối)', ['1', '127', 'Không in gì'], 'Mặc định pipeline lấy mã của lệnh cuối. Với `set -o pipefail` sẽ là 1.'],
  ['Cờ nào xếp `2K 500 10M` theo đúng độ lớn?', '`sort -h`', ['`sort -n`', '`sort -r`', '`sort -u`'], '`-h` hiểu hậu tố K, M, G. `-n` chỉ đọc số thuần.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Sắp xếp `emails.txt` theo thứ tự chữ.', hint: 'sort emails.txt', check: OK(/^sort emails\.txt$/) },
    { text: 'Bỏ dòng trùng bằng `sort -u`.', hint: 'sort -u emails.txt', check: OK(/^sort -u emails\.txt$/) },
    { text: 'Đếm số lần mỗi email xuất hiện: `sort` rồi `uniq -c`.', hint: 'sort emails.txt | uniq -c', check: AND(OK(/^sort emails\.txt$/), OK(/^uniq -c$/)) },
    { text: 'Chỉ liệt kê những email xuất hiện nhiều hơn một lần (`uniq -d`).', hint: 'sort emails.txt | uniq -d', check: OK(/^uniq -d$/) },
    { text: 'Xếp hạng email theo số lần xuất hiện, lấy 3 đầu.', hint: 'sort emails.txt | uniq -c | sort -rn | head -3', check: AND(OK(/^uniq -c$/), OK(/^sort -rn$/), OK(/^head -3$/)) },
    { text: 'So sánh với và không có `-n`: xem `printf "9\\n10\\n2\\n" | sort` và `| sort -n`.', hint: 'printf "9\\n10\\n2\\n" | sort\nprintf "9\\n10\\n2\\n" | sort -n', check: AND(OK(/^sort$/), OK(/^sort -n$/)) },
    { text: 'Tìm byte lớn nhất trong log: cột 10, `sort -n`, `tail -1` (kết quả 88231).', hint: "awk '{print $10}' access.log | sort -n | tail -1", check: AND(OK(/^awk \{print \$10\} access\.log$/), OK(/^sort -n$/), OK(/^tail -1$/)) },
    { text: 'Sắp xếp `servers.txt` theo cột 2 (IP).', hint: 'sort -k2 servers.txt', check: OK(/^sort -k2 servers\.txt$/) },
    { text: 'Ba đơn có giá cao nhất: `sort -t, -k6 -n -r orders.csv | head -3`.', hint: 'sort -t, -k6 -n -r orders.csv | head -3', check: OK(/^sort -t, .*-k6.*orders\.csv$/) },
    { text: 'Sắp xếp kích thước có hậu tố bằng `sort -h`.', hint: 'printf "10M\\n2K\\n500\\n" | sort -h', check: OK(/^sort -h$/) },
    { text: 'Không phân biệt hoa thường: `sort -f -u emails.txt`.', hint: 'sort -f -u emails.txt', check: OK(/^sort (-fu|-uf|-f -u|-u -f) emails\.txt$/) },
    { text: 'Lấy cột 3 (tên khách) của `orders.csv`.', hint: 'cut -d, -f3 orders.csv', check: OK(/^cut -d, -f3 orders\.csv$/) },
    { text: 'Lấy hai cột 1 và 3 của `grades.tsv` (mặc định tách bằng tab).', hint: 'cut -f1,3 grades.tsv', check: OK(/^cut -f1,3 grades\.tsv$/) },
    { text: 'Cắt 10 ký tự đầu mỗi dòng bằng `cut -c`.', hint: 'cut -c1-10 app.log', check: OK(/^cut -c1-10 app\.log$/) },
    { text: 'Đổi chữ thường thành chữ hoa bằng `tr`.', hint: 'echo tutor | tr a-z A-Z', check: OK(/^tr a-z A-Z$/) },
    { text: 'Xoá mọi chữ số bằng `tr -d`.', hint: 'echo a1b2c3 | tr -d 0-9', check: OK(/^tr -d /) },
    { text: 'Gộp nhiều dấu cách thành một bằng `tr -s`.', hint: "echo 'a     b    c' | tr -s ' '", check: OK(/^tr -s/) },
    { text: 'Gộp mọi dòng thành một dòng ngăn bởi dấu phẩy với `paste -sd,`.', hint: 'paste -sd, servers.txt', check: OK(/^paste -sd, servers\.txt$/) },
    { text: 'Đếm số dòng của `app.log` bằng `wc -l`.', hint: 'wc -l app.log', check: OK(/^wc -l app\.log$/) },
    { text: 'Đếm số dòng ERROR: pipe `grep` vào `wc -l`.', hint: 'grep ERROR app.log | wc -l', check: AND(A(/^grep ERROR app\.log$/), OK(/^wc -l$/)) },
    { text: 'Xem 5 dòng cuối rồi 3 dòng đầu của `app.log`.', hint: 'tail -n 5 app.log\nhead -n 3 app.log', check: AND(OK(/^tail -n 5 app\.log$/), OK(/^head -n 3 app\.log$/)) },
    { text: 'In ngược thứ tự dòng của `app.log` bằng `tac` (xem 3 dòng).', hint: 'tac app.log | head -3', check: OK(/^tac app\.log$/) },
    { text: 'Căn `servers.txt` thành bảng bằng `column -t`.', hint: 'column -t servers.txt', check: OK(/^column -t servers\.txt$/) },
    { text: 'Sao chép cấu hình, đổi cổng, rồi `diff -u` để xem thay đổi.', hint: "cp site.conf site.conf.new\nsed -i 's/listen 80;/listen 8080;/' site.conf.new\ndiff -u site.conf site.conf.new", check: AND(OK(/^cp site\.conf site\.conf\.new$/), A(/^diff -u site\.conf site\.conf\.new$/)) },
    { text: 'Tìm dòng chung của hai danh sách bằng `comm -12`.', hint: "printf 'a\\nb\\nc\\n' > a.txt\nprintf 'b\\nc\\nd\\n' > b.txt\ncomm -12 a.txt b.txt", check: OK(/^comm -12 a\.txt b\.txt$/) },
    { text: 'Dùng `find` với `xargs` để đếm dòng của mọi file `.log`.', hint: "find . -name '*.log' | xargs wc -l", check: OK(/^xargs wc -l$/) },
    { text: 'Tạo file có khoảng trắng trong tên và xử lý an toàn bằng `-print0` và `xargs -0`.', hint: "touch 'my file.log'\nfind . -name '*.log' -print0 | xargs -0 ls -l", check: AND(A(/^find \. -name \*\.log -print0$/), OK(/^xargs -0 ls -l$/)) },
    { text: 'Chạy lệnh một lần cho mỗi dòng bằng `xargs -I{}`.', hint: "printf 'a\\nb\\n' | xargs -I{} echo item-{}", check: OK(/^xargs -I\{\} echo item-\{\}$/) },
    { text: 'Vừa lưu vừa đếm với `tee`: lưu các dòng ERROR vào `errors.txt`.', hint: 'grep ERROR app.log | tee errors.txt | wc -l', check: AND(OK(/^tee errors\.txt$/), function (s) { return ftxt(s, s.cwd + '/errors.txt').split('\n').filter(Boolean).length === 5; }) },
    { text: 'Chuyển thông báo lỗi vào file bằng `2>` rồi đọc nó.', hint: 'ls /khong-co 2> err.txt\ncat err.txt', check: function (s) { return /khong-co/.test(ftxt(s, s.cwd + '/err.txt')); } },
    { text: 'Xây pipeline top 3 IP đầy đủ từ đầu đến cuối.', hint: "awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -3", check: AND(OK(/^awk \{print \$1\} access\.log$/), OK(/^uniq -c$/), OK(/^sort -rn$/), OK(/^head -3$/)) },
    { text: 'Bật `pipefail` rồi thử `false | true` và xem mã thoát.', hint: 'set -o pipefail\nfalse | true\necho $?', check: AND(OK(/^set -o pipefail$/), A(/^echo 1$/)) }
  ]
};

function putx(s2, name, txt, mode) { s2.fs.put(s2.home + '/lab/' + name, txt, { owner: s2.user, mode: mode || 493 }); }

T.debugs = [
  {
    id: 'tx4d1', title: 'Đếm email trùng nhưng số nào cũng là 1',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./dups.sh && cat dups.txt', '      1 an@example.com', '      1 binh@example.com', '      1 An@Example.com', '      ...', '(mọi email đều có 1 lần, nhưng nhìn file rõ ràng có trùng)'),
    story: 'Script `dups.sh` thống kê số lần xuất hiện của từng email. Kết quả toàn số 1, dù `an@example.com` và `binh@example.com` đều xuất hiện hai lần.',
    goal: '`dups.txt` có `2 an@example.com` và `2 binh@example.com`.',
    hints: ['`cat dups.sh` và `cat emails.txt`. Các email giống nhau có nằm cạnh nhau không?', '`uniq` chỉ gộp dòng liền kề. Phải `sort` trước.', 'Sửa: `sed -i "s/uniq -c emails.txt/sort emails.txt | uniq -c/" dups.sh` rồi `./dups.sh` và `cat dups.txt`.'],
    fix: ['cat dups.sh', 'sed -i "s/uniq -c emails.txt/sort emails.txt | uniq -c/" dups.sh', './dups.sh', 'cat dups.txt'],
    cause: '`uniq` so sánh từng dòng với dòng liền trước. Dữ liệu chưa sắp xếp thì các bản trùng nằm xa nhau. Luôn `sort | uniq`, hoặc dùng `sort -u` khi chỉ cần bỏ trùng.',
    setup: function (s) { base(s, { setup: function (s2) { putx(s2, 'dups.sh', '#!/bin/bash\nuniq -c emails.txt | sort -rn > dups.txt\n'); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/dups.txt'); return /^\s*2 an@example\.com$/m.test(t) && /^\s*2 binh@example\.com$/m.test(t); }
  },
  {
    id: 'tx4d2', title: 'Response lớn nhất báo 9999 trong khi có 88231',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./biggest.sh && cat max.txt', '9999', '', '(trong access.log có response 88231 byte của /assets/app.js)'),
    story: 'Script tìm số byte lớn nhất của một response trong access.log, nhưng nó báo 9999 trong khi file JS nặng 88231 byte.',
    goal: '`max.txt` chứa `88231`.',
    hints: ['`cat biggest.sh`. Đã có `-n` ở `sort` chưa?', 'Không có `-n`, `sort` xếp theo chữ: `9999` lớn hơn `88231` vì `9` > `8` ở ký tự đầu.', 'Thêm `-n`: `sed -i "s/| sort |/| sort -n |/" biggest.sh`, chạy lại và `cat max.txt`.'],
    fix: ['cat biggest.sh', 'sed -i "s/| sort |/| sort -n |/" biggest.sh', './biggest.sh', 'cat max.txt'],
    cause: 'Mặc định `sort` so sánh từng ký tự như chữ, nên "9999" lớn hơn "88231". Mọi cột số cần `sort -n` (hoặc `-h` cho số kèm đơn vị). Đây là lỗi âm thầm vì lệnh không báo lỗi.',
    setup: function (s) { base(s, { setup: function (s2) { putx(s2, 'biggest.sh', "#!/bin/bash\nawk '{print $10}' access.log | sort | tail -1 > max.txt\n"); } }); },
    check: function (s) { return ftxt(s, s.home + '/lab/max.txt').trim() === '88231'; }
  },
  {
    id: 'tx4d3', title: 'Script dedupe làm trống emails.txt',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./dedupe.sh', '$ wc -l emails.txt', '0 emails.txt', '', '(danh sách email biến mất; bản gốc còn trong emails.txt.bak)'),
    story: 'Script `dedupe.sh` loại email trùng ngay trong file nhưng sau khi chạy `emails.txt` trống trơn. May mà có bản sao lưu `emails.txt.bak`.',
    goal: '`emails.txt` có 6 dòng khác nhau (đã bỏ trùng), và `dedupe.sh` không còn dùng `> emails.txt`.',
    hints: ['`cat dedupe.sh`. File nguồn và file đích có trùng nhau không?', '`>` mở và cắt file đích trước khi `sort` kịp đọc, nên `sort` đọc một file rỗng. Khôi phục: `cp emails.txt.bak emails.txt`.', 'Dùng `-o`: `sed -i "s/ > emails.txt/ -o emails.txt/" dedupe.sh`, rồi `./dedupe.sh` và `wc -l emails.txt`.'],
    fix: ['cat dedupe.sh', 'cp emails.txt.bak emails.txt', 'sed -i "s/ > emails.txt/ -o emails.txt/" dedupe.sh', './dedupe.sh', 'wc -l emails.txt'],
    cause: 'Redirect `>` xoá nội dung file trước khi lệnh chạy, nên không bao giờ đọc và ghi cùng một file bằng `>`. Dùng cờ riêng của lệnh (`sort -o`, `sed -i`) hoặc ghi ra file tạm rồi `mv`.',
    setup: function (s) { base(s, { setup: function (s2) {
      putx(s2, 'dedupe.sh', '#!/bin/bash\nsort -u emails.txt > emails.txt\n');
      putx(s2, 'emails.txt.bak', C.TXT.EMAILS.join('\n') + '\n', 420);
      putx(s2, 'emails.txt', '', 420);
    } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/emails.txt').split('\n').filter(Boolean); var sc = ftxt(s, s.home + '/lab/dedupe.sh'); return t.length === 6 && new Set(t).size === 6 && !/> ?emails\.txt/.test(sc); }
  },
  {
    id: 'tx4d4', title: 'cleanup.sh xoá không hết file .tmp', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./cleanup.sh', 'rm: cannot remove \'uploads/my\': No such file or directory', 'rm: cannot remove \'report.tmp\': No such file or directory', 'rm: cannot remove \'uploads/old\': No such file or directory', 'rm: cannot remove \'backup.tmp\': No such file or directory', '$ ls uploads', 'keep.txt  my report.tmp  old backup.tmp'),
    story: 'Script dọn các file `.tmp` trong `uploads/` chạy thành công với file tên đơn giản nhưng báo lỗi lạ với các file có khoảng trắng trong tên và để chúng lại.',
    goal: 'Không còn file `.tmp` nào trong `uploads/`, và `keep.txt` vẫn còn.',
    hints: ['`cat cleanup.sh`. Tên file được truyền từ `find` sang `rm` qua gì?', '`xargs` tách theo khoảng trắng, nên `my report.tmp` bị chia thành `my` và `report.tmp`. Cần dùng ký tự NUL làm dấu phân cách.', 'Sửa: `sed -i "s/ | xargs rm/ -print0 | xargs -0 rm/" cleanup.sh` rồi `./cleanup.sh` và `ls uploads`.'],
    fix: ['cat cleanup.sh', 'sed -i "s/ | xargs rm/ -print0 | xargs -0 rm/" cleanup.sh', './cleanup.sh', 'ls uploads'],
    cause: 'Pipe văn bản thuần không phân biệt được khoảng trắng trong tên file với dấu phân cách giữa hai file. `find -print0 | xargs -0` dùng byte NUL (không thể nằm trong tên file), nên an toàn với mọi tên. Tương tự nguy hiểm hơn với `rm`: một tên như `my report` thành `my` có thể xoá nhầm file khác trùng tên.',
    setup: function (s) { base(s, { setup: function (s2) {
      putx(s2, 'cleanup.sh', "#!/bin/bash\nfind uploads -name '*.tmp' | xargs rm\n");
      s2.fs.mkdirp(s2.home + '/lab/uploads', s2.user, 493);
      putx(s2, 'uploads/a.tmp', 'x\n', 420); putx(s2, 'uploads/my report.tmp', 'x\n', 420);
      putx(s2, 'uploads/old backup.tmp', 'x\n', 420); putx(s2, 'uploads/keep.txt', 'giữ\n', 420);
    } }); },
    check: function (s) { var d = s.home + '/lab/uploads/'; return !s.fs.get(d + 'a.tmp') && !s.fs.get(d + 'my report.tmp') && !s.fs.get(d + 'old backup.tmp') && !!s.fs.get(d + 'keep.txt'); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
