(function (G) {
'use strict';
/* Chương tx3: awk. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt;
function base(s, o) { C.TXT.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };

var T = {
  id: 'tx3', group: 'Công cụ văn bản', short: 'awk',
  title: 'awk: xử lý văn bản theo cột',
  dek: 'Tách trường, lọc theo điều kiện, tính tổng và trung bình, đếm theo nhóm bằng mảng, định dạng báo cáo với printf. awk biến log và CSV thành số liệu chỉ trong một dòng lệnh.'
};
C.insertAfter('tx2', T);

T.theory = [
  { tag: 'Khái niệm', title: 'awk là gì: mẫu và hành động', body: [
    '**awk** đọc từng dòng, tự tách thành các **trường** (field) theo khoảng trắng, rồi chạy chương trình dạng **`điều kiện { hành động }`**. Nó là ngôn ngữ lập trình thu nhỏ, mạnh nhất ở dữ liệu có cột: log, CSV, kết quả `ps`, `df`.',
    { pre: ["awk '{print $1}' access.log              # cột 1 của mọi dòng (IP)", "awk '$9 == 404' access.log               # chỉ có điều kiện: in cả dòng nếu đúng", "awk '$9 == 404 {print $1, $7}' access.log   # điều kiện + hành động", "awk 'BEGIN{...} {...} END{...}' file       # trước, từng dòng, sau cùng"], cap: 'Cấu trúc: điều kiện { hành động }' },
    { tbl: [['Biến', 'Ý nghĩa'], ['`$0`', 'Cả dòng'], ['`$1`, `$2`, ...', 'Trường thứ 1, 2, ...'], ['`$NF`', 'Trường cuối cùng'], ['`NF`', 'Số trường của dòng hiện tại'], ['`NR`', 'Số thứ tự dòng (tính cả các file)'], ['`FNR`', 'Số thứ tự dòng trong file hiện tại'], ['`FS` / `OFS`', 'Dấu phân tách vào / ra'], ['`FILENAME`', 'Tên file đang đọc']] },
    { note: 'Phải dùng **nháy đơn** cho chương trình awk. Trong nháy kép, shell sẽ thay `$1` bằng tham số của script trước khi awk thấy nó.', kind: 'warn' },
      { note: 'Ubuntu cài sẵn **mawk** làm `awk`. Các ví dụ trong khoá chạy được trên cả mawk và gawk, nhưng hàm riêng của gawk (`gensub`, `asort`, `strftime`, `PROCINFO`) cần `sudo apt install gawk` và gọi bằng `gawk`.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Trường và dấu phân tách', body: [
    'Mặc định awk tách theo một hoặc nhiều khoảng trắng/tab. Đổi dấu tách bằng `-F`:',
    { pre: ["awk -F, '{print $3}' orders.csv           # CSV: tách theo dấu phẩy", "awk -F'\\t' '{print $2}' grades.tsv         # TSV", "awk -F: '{print $1, $7}' /etc/passwd       # user và shell", "awk -F'[ :]+' '{print $2}' file           # -F nhận regex", "awk 'BEGIN{FS=\",\"; OFS=\";\"} {print $1,$2}' f   # đặt trong BEGIN"], cap: 'Chọn dấu tách' },
    { ul: ['`print $1, $2` in hai trường cách nhau bởi `OFS` (mặc định là một dấu cách)', '`print $1 $2` (không có dấu phẩy) nối liền hai trường', 'Gán lại trường sẽ tự ghép dòng với `OFS`: `$2 = ""; print` xoá cột 2', 'CSV có dấu phẩy nằm trong ngoặc kép (`"a,b"`) **không** tách đúng bằng `-F,`; hãy dùng công cụ CSV chuyên dụng'] }
  ] },
  { tag: 'Cú pháp', title: 'Điều kiện: chọn dòng nào', body: [
    { tbl: [['Mẫu', 'Chọn', 'Ví dụ'], ['`NR==5`', 'Dòng số 5', '`awk \'NR==5\' f`'], ['`NR>1`', 'Bỏ dòng tiêu đề', '`awk -F, \'NR>1\' orders.csv`'], ['`$9==404`', 'So sánh trường', '`awk \'$9==404\' access.log`'], ['`$9>=400 && $9<500`', 'Điều kiện ghép', 'lỗi phía client'], ['`/ERROR/`', 'Dòng khớp regex', '`awk \'/ERROR/\' app.log`'], ['`$7 ~ /^\\/api/`', 'Trường khớp regex', 'đường dẫn bắt đầu /api'], ['`$3 !~ /INFO/`', 'Trường không khớp', ''], ['`/start/,/end/`', 'Khoảng dòng', 'giống sed'], ['`NF`', 'Dòng có ít nhất 1 trường (bỏ dòng trống)', '`awk NF f`'], ['`length($0)>80`', 'Dòng dài hơn 80 ký tự', '']] },
    { note: 'So sánh số và chữ: nếu cả hai vế trông như số thì so sánh **số** (`10 > 9`), nếu một vế là chữ thì so sánh **chuỗi** (`"10" < "9"`). Hằng chuỗi trong ngoặc kép luôn là chữ: `$1 == "10"` so chuỗi.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Tính toán: tổng, đếm, trung bình, lớn nhất', body: [
    'Biến trong awk không cần khai báo, mặc định là 0 hoặc rỗng. Cộng dồn trong khối chính, in kết quả trong `END`:',
    { pre: ["awk '{s+=$10} END{print s}' access.log                    # tổng byte", "awk '$9==404{n++} END{print n+0}' access.log              # đếm 404 (n+0 để in 0 khi không có)", "awk -F, 'NR>1{s+=$5*$6} END{print s}' orders.csv           # doanh thu = tổng qty*price", "awk '{s+=$10} END{print s/NR}' access.log                  # trung bình", "awk 'NR==1||$10>m{m=$10; l=$0} END{print l}' access.log    # dòng có byte lớn nhất"], cap: 'Tổng, đếm, trung bình, lớn nhất' },
    { ul: ['`n++` tăng biến; `n+=x` cộng dồn', 'Phép chia luôn ra số thực: `7/2` là `3.5`. Dùng `int(x)` để lấy phần nguyên', 'In 0 khi không có kết quả: `print n+0`, vì biến chưa gán là chuỗi rỗng', '`x ? a : b` là toán tử điều kiện, như trong C'] }
  ] },
  { tag: 'Cú pháp', title: 'Mảng kết hợp: nhóm và đếm theo khoá', body: [
    'Mảng của awk có chỉ số là **chuỗi bất kỳ**. Đây là cách làm "GROUP BY" của SQL:',
    { pre: ["awk '{c[$9]++} END{for (k in c) print k, c[k]}' access.log      # đếm theo mã trạng thái", "awk '{b[$1]+=$10} END{for (ip in b) print ip, b[ip]}' access.log  # tổng byte mỗi IP", "awk -F, 'NR>1{t[$3]+=$5*$6} END{for (c in t) print c, t[c]}' orders.csv   # doanh thu từng khách", "awk '!seen[$1]++' emails.txt                               # bỏ trùng giữ thứ tự (dedupe)"], cap: 'Đếm và cộng theo nhóm' },
    { ul: ['Thứ tự duyệt `for (k in a)` **không** được đảm bảo; muốn thứ tự thì pipe qua `sort`', '`if (k in a)` kiểm tra khoá có tồn tại, `delete a[k]` xoá', '`!seen[$1]++` là cách rút gọn nổi tiếng: lần đầu `seen` bằng 0 nên `!0` đúng và in; các lần sau khác 0 nên bỏ', '`split(chuỗi, mảng, dấu)` tạo mảng từ một chuỗi'] },
    { pre: ["awk '{c[$9]++} END{for (k in c) print c[k], k}' access.log | sort -rn   # xếp hạng"], cap: 'Kết hợp với sort' }
  ] },
  { tag: 'Bảng tra', title: 'Hàm có sẵn và printf', body: [
    { tbl: [['Hàm', 'Làm gì', 'Ví dụ'], ['`length(s)`', 'Độ dài chuỗi', '`length($0)`'], ['`substr(s,i,n)`', 'Cắt chuỗi, vị trí tính từ 1', '`substr($4,2,11)` ra `27/Oct/2026`'], ['`index(s,t)`', 'Vị trí của t trong s (0 nếu không có)', ''], ['`split(s,a,sep)`', 'Tách s vào mảng a, trả về số phần tử', '`split($4,t,":")`'], ['`sub(re,rep)`', 'Thay lần đầu, ảnh hưởng `$0`', ''], ['`gsub(re,rep)`', 'Thay mọi lần', '`gsub(/ERROR/,"E")`'], ['`match(s,re)`', 'Đặt `RSTART`, `RLENGTH`', ''], ['`toupper` `tolower`', 'Đổi hoa/thường', ''], ['`int` `sqrt` `exp` `log`', 'Hàm toán', ''], ['`sprintf(fmt,...)`', 'Như printf nhưng trả về chuỗi', '']] },
    { pre: ["awk '{printf \"%-16s %5d\\n\", $1, $10}' access.log          # căn trái, rộng 16; số rộng 5", "awk -F, 'NR>1{t+=$5*$6} END{printf \"%.2f triệu\\n\", t/1000000}' orders.csv", "awk '{printf \"%s\\t%s\\n\", $1, $9}' access.log"], cap: 'printf: định dạng báo cáo' },
    { note: '`print` tự thêm xuống dòng; `printf` thì **không**. Nhớ `\\n` ở cuối. Các định dạng thường dùng: `%s` chuỗi, `%d` số nguyên, `%.2f` thực hai chữ số thập phân, `%5d`/`%-10s` rộng cố định (âm là căn trái).', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'BEGIN, END, biến -v và điều khiển luồng', body: [
    { pre: ["awk 'BEGIN{print \"IP\\tSTATUS\"} {print $1\"\\t\"$9}' access.log      # tiêu đề trước", "awk -v min=400 '$9>=min{n++} END{print n}' access.log             # truyền biến từ shell", "awk -v ip=\"$1\" '$1==ip' access.log                            # dùng tham số script", "awk '{ if ($9>=500) s=\"server\"; else if ($9>=400) s=\"client\"; else s=\"ok\"; c[s]++ } END{for (k in c) print k, c[k]}' access.log"], cap: 'BEGIN/END, -v, if/else' },
    'Khi chương trình dài hơn một dòng, đưa vào file và gọi bằng `-f`:',
    { pre: ["# sum.awk", "BEGIN { FS = \",\" }", "NR > 1 { total += $5 * $6 }", "END { print \"Doanh thu:\", total }", "", "awk -f sum.awk orders.csv"], cap: 'Chương trình awk trong file' },
    { ul: ['`next` bỏ qua phần còn lại và sang dòng kế', '`exit` thoát (vẫn chạy `END`)', '`for (i=1; i<=NF; i++) ...` duyệt các trường', '`NR==FNR{...; next}` là mẹo đọc file thứ nhất vào mảng rồi đối chiếu với file thứ hai (join)'] }
  ] },
  { tag: 'Bảng tra', title: 'Công thức awk hay dùng trong vận hành', body: [
    { tbl: [['Mục tiêu', 'Lệnh'], ['Top IP gọi nhiều nhất', "`awk '{c[$1]++} END{for(i in c) print c[i], i}' access.log | sort -rn | head`"], ['Tổng byte đã phục vụ', "`awk '{s+=$10} END{print s}' access.log`"], ['Đếm theo mã trạng thái', "`awk '{c[$9]++} END{for(k in c) print k, c[k]}' access.log`"], ['Request lỗi 5xx', "`awk '$9>=500' access.log`"], ['IP có nhiều lần đăng nhập thất bại', "`awk '/Failed password/{c[$(NF-3)]++} END{for(i in c) print c[i], i}' auth.log | sort -rn`"], ['Dung lượng ổ dùng quá 80%', "`df -h | awk 'NR>1 && $5+0>80 {print $6, $5}'`"], ['Tiến trình dùng nhiều RAM', "`ps aux | awk 'NR>1{print $4, $11}' | sort -rn | head`"], ['Đảo hai cột', "`awk '{print $2, $1}' file`"], ['Bỏ dòng trùng giữ thứ tự', "`awk '!seen[$0]++' file`"], ['Trung bình thời gian xử lý ms=', "`awk '{for(i=1;i<=NF;i++) if($i~/^ms=/){split($i,a,\"=\");s+=a[2];n++}} END{print s/n}' app.log`"]] },
    { note: 'Với log định dạng chuẩn, awk giúp bạn trả lời nhanh các câu hỏi như "ai gọi nhiều nhất", "lỗi 5xx bao nhiêu", "tổng băng thông", mà không cần cài thêm phần mềm.', kind: 'tip' }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['`awk: line 1: syntax error`', 'Thiếu `}`, dấu nháy, hoặc dùng `$1` trong nháy kép', 'Dùng nháy đơn, kiểm tra cặp `{ }`'], ['`print $1` ra cả dòng', 'Shell thay `$1` rỗng (nháy kép)', 'Nháy đơn cho awk'], ['Cột sai trên CSV', 'Quên `-F,`', 'Thêm `-F,`'], ['Số ra `0` hoặc rất nhỏ', 'Chia số nguyên bằng `%d` hoặc trường chứa chữ', '`n*100/t`, kiểm tra dòng tiêu đề (`NR>1`)'], ['Khớp rỗng khi join', 'File có CRLF (`\\r` dính vào trường cuối)', '`sed -i \'s/\\r$//\' file`, xác nhận bằng `cat -A`'], ['`10 < 9` cho kết quả sai', 'So chuỗi thay vì số', 'Ép số: `$1+0 < 9`'], ['Thứ tự `for (k in a)` thay đổi', 'awk không đảm bảo thứ tự', 'Pipe qua `sort`'], ['Dòng cuối thiếu hoặc `END` in rỗng', 'Biến chưa gán', '`print n+0`']] },
    { ul: ['Chương trình nằm trong **nháy đơn**?', 'Đã đặt đúng `-F` cho dữ liệu của bạn chưa?', 'Dòng tiêu đề có bị tính vào tổng không (`NR>1`)?', 'File có ký tự `\\r` lạ không (`cat -A file | head`)?', 'In kết quả thử trên vài dòng (`head -3`) trước khi chạy trên file lớn'] }
  ] }
];

T.quiz = C.QZ(3, [
  ['Trong `awk \'{print $2}\' file`, `$2` là gì?', 'Trường thứ hai của mỗi dòng', ['Tham số thứ hai của script', 'Dòng thứ hai của file', 'Ký tự thứ hai của dòng'], '`$n` là trường thứ n sau khi awk tách dòng theo dấu phân tách (mặc định là khoảng trắng).'],
  ['`$0` đại diện cho gì?', 'Toàn bộ dòng hiện tại', ['Trường đầu tiên', 'Mã thoát của lệnh', 'Tên chương trình'], '`$0` là cả dòng; `$1` trở đi là từng trường.'],
  ['Để xử lý file CSV phân cách bằng dấu phẩy, bạn thêm tùy chọn nào?', '`-F,`', ['`-d,`', '`-c,`', '`-s,`'], '`-F` đặt dấu phân tách trường (FS).'],
  ['`awk \'NR>1\' orders.csv` cho ra gì?', 'Mọi dòng trừ dòng đầu tiên (tiêu đề)', ['Chỉ dòng đầu tiên', 'Số dòng của file', 'Không in gì vì thiếu hành động'], 'Mẫu không có hành động nghĩa là in dòng nếu mẫu đúng. `NR>1` đúng từ dòng 2 trở đi.'],
  ['Chương trình nào tính tổng cột 10?', '`awk \'{s+=$10} END{print s}\'`', ['`awk \'{print $10+$10}\'`', '`awk \'END{s+=$10; print s}\'`', '`awk \'BEGIN{s+=$10} {print s}\'`'], 'Cộng dồn trong khối chính, in kết quả ở `END` khi đã đọc hết file.'],
  ['`awk \'{c[$9]++} END{for (k in c) print k, c[k]}\'` làm gì?', 'Đếm số dòng theo từng giá trị của cột 9', ['In cột 9 của mọi dòng', 'Tổng các giá trị cột 9', 'Sắp xếp theo cột 9'], 'Mảng kết hợp `c` dùng giá trị cột 9 làm khoá, tăng đếm mỗi lần gặp.'],
  ['`awk \'!seen[$1]++\' file` có tác dụng gì?', 'Bỏ các dòng có trường 1 trùng, giữ dòng đầu tiên', ['Đếm số dòng khác nhau', 'In dòng trùng', 'Xoá file nếu trùng'], 'Lần đầu `seen[$1]` bằng 0 nên `!0` đúng và dòng được in; lần sau khác 0 nên bỏ.'],
  ['Vì sao nên viết chương trình awk trong nháy đơn?', 'Để shell không thay `$1`, `$2`... bằng tham số của nó', ['Để chạy nhanh hơn', 'Vì awk chỉ chấp nhận ký tự ASCII', 'Để awk tự thêm `-F`'], 'Trong nháy kép shell sẽ thay `$1` (thường rỗng) trước khi awk nhìn thấy.'],
  ['`printf "%d\\n", 7/2` in ra gì?', '`3` (`%d` cắt phần thập phân)', ['`3.5`', '`4`', 'Lỗi chia cho số nguyên'], '`7/2` là 3.5 nhưng `%d` in số nguyên nên bỏ phần thập phân. Muốn thực dùng `%.1f`.'],
  ['`print $1 $2` khác `print $1, $2` thế nào?', 'Cái đầu nối liền không dấu cách, cái sau cách nhau bởi OFS', ['Không khác', 'Cái đầu in hai dòng', 'Cái sau bị lỗi cú pháp'], 'Dấu phẩy chèn `OFS` (mặc định là một dấu cách).'],
  ['Khi join hai file bằng `NR==FNR{p[$2]=$1;next}`, kết quả rỗng dù dữ liệu có vẻ khớp. Nguyên nhân phổ biến nhất?', 'File có CRLF nên khoá thật là `An\\r`, không khớp `An`', ['awk không hỗ trợ join', 'Thiếu `-v`', 'Mảng tối đa 10 phần tử'], 'Kiểm tra bằng `cat -A` (thấy `^M`), rồi `sed -i \'s/\\r$//\'`.'],
  ['`awk \'$9>=400 && $9<500\' access.log` chọn gì?', 'Các request có mã trạng thái 4xx', ['Các request lớn hơn 400 byte', 'Các dòng 400 đến 500', 'Chỉ mã 400 và 500'], '`&&` ghép hai điều kiện; cột 9 của nginx access log là mã trạng thái.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'In cột đầu tiên (địa chỉ IP) của `access.log`.', hint: "awk '{print $1}' access.log", check: OK(/^awk \{print \$1\} access\.log$/) },
    { text: 'In IP và mã trạng thái (cột 1 và cột 9).', hint: "awk '{print $1, $9}' access.log", check: OK(/^awk \{print \$1, ?\$9\} access\.log$/) },
    { text: 'Chỉ in các dòng có mã trạng thái 404.', hint: "awk '$9==404' access.log", check: OK(/^awk \$9 ?== ?404 access\.log$/) },
    { text: 'Đếm số request 404 bằng `n++` và `END`.', hint: "awk '$9==404{n++} END{print n+0}' access.log", check: OK(/^awk .*\$9 ?== ?404.*n\+\+.*END.* access\.log$/) },
    { text: 'In số thứ tự dòng cùng IP bằng `NR`.', hint: "awk '{print NR, $1}' access.log", check: OK(/^awk .*NR.*access\.log$/) },
    { text: 'In trường cuối cùng của mỗi dòng bằng `$NF` trong `servers.txt`.', hint: "awk '{print $NF}' servers.txt", check: OK(/^awk .*\$NF.* servers\.txt$/) },
    { text: 'Tên học sinh có điểm toán >= 8 (grades.tsv, dấu tách là tab).', hint: "awk -F'\\t' '$2>=8{print $1}' grades.tsv", check: OK(/^awk -F\\t .*\$2 ?>= ?8.* grades\.tsv$/) },
    { text: 'Tính điểm trung bình ba môn của từng học sinh, bỏ dòng tiêu đề.', hint: "awk -F'\\t' 'NR>1{print $1, ($2+$3+$4)/3}' grades.tsv", check: OK(/^awk -F\\t .*NR ?> ?1.*\(\$2\+\$3\+\$4\)\/3.* grades\.tsv$/) },
    { text: 'Tính doanh thu: tổng `qty * price` trong `orders.csv` (kết quả 5460000).', hint: "awk -F, 'NR>1{s+=$5*$6} END{print s}' orders.csv", check: OK(/^awk -F, .*\$5 ?\* ?\$6.*END.* orders\.csv$/) },
    { text: 'Doanh thu theo từng khách hàng bằng mảng `t[$3]`.', hint: "awk -F, 'NR>1{t[$3]+=$5*$6} END{for (c in t) print c, t[c]}' orders.csv", check: OK(/^awk -F, .*\[\$3\].*END.*for.* orders\.csv$/) },
    { text: 'Đếm số request theo mã trạng thái.', hint: "awk '{c[$9]++} END{for (k in c) print k, c[k]}' access.log", check: OK(/^awk .*c\[\$9\]\+\+.*END.*for.* access\.log$/) },
    { text: 'Tính tổng byte đã gửi (cột 10) cho mỗi IP.', hint: "awk '{b[$1]+=$10} END{for (ip in b) print ip, b[ip]}' access.log", check: OK(/^awk .*\[\$1\] ?\+= ?\$10.*END.* access\.log$/) },
    { text: 'Xếp hạng IP gọi nhiều nhất: awk đếm rồi `sort -rn | head -3`.', hint: "awk '{c[$1]++} END{for (i in c) print c[i], i}' access.log | sort -rn | head -3", check: AND(OK(/^awk .*c\[\$1\]\+\+.*END.* access\.log$/), OK(/^sort -rn$/), OK(/^head -3$/)) },
    { text: 'In tiêu đề bằng `BEGIN` trước dữ liệu.', hint: "awk 'BEGIN{print \"IP STATUS\"} {print $1, $9}' access.log | head -4", check: OK(/^awk BEGIN\{print "?IP STATUS"?\}.* access\.log$/) },
    { text: 'Định dạng bảng với `printf`: IP rộng 16 ký tự căn trái, byte rộng 6.', hint: "awk '{printf \"%-16s %6d\\n\", $1, $10}' access.log | head -5", check: OK(/^awk .*printf.*%-16s.* access\.log$/) },
    { text: 'Truyền biến từ shell: in request có mã >= `min`, với `-v min=400`.', hint: "awk -v min=400 '$9>=min' access.log", check: OK(/^awk -v min=400 \$9>=min access\.log$/) },
    { text: 'Lọc dòng bằng regex: chỉ dòng ERROR của `app.log`.', hint: "awk '/ERROR/' app.log", check: OK(/^awk \/ERROR\/ app\.log$/) },
    { text: 'Lọc theo trường khớp regex: đường dẫn (cột 7) bắt đầu bằng `/api`.', hint: "awk '$7 ~ /^\\/api/' access.log", check: OK(/^awk \$7 ?~ .*api.* access\.log$/) },
    { text: 'In khoảng từ `connection refused` đến `reconnected` bằng pattern phạm vi.', hint: "awk '/connection refused/,/reconnected/' app.log", check: OK(/^awk \/connection refused\/,\/reconnected\/ app\.log$/) },
    { text: 'In dòng 4 đến 6 bằng điều kiện trên `NR`.', hint: "awk 'NR>=4 && NR<=6' app.log", check: OK(/^awk NR ?>= ?4 && NR ?<= ?6 app\.log$/) },
    { text: 'Tìm các dòng dài hơn 80 ký tự bằng `length`.', hint: "awk 'length($0)>80' app.log", check: OK(/^awk length\(\$0\) ?> ?80 app\.log$/) },
    { text: 'Đổi tên khách hàng thành chữ hoa bằng `toupper`.', hint: "awk -F, 'NR>1{print toupper($3)}' orders.csv", check: OK(/^awk -F, .*toupper\(\$3\).* orders\.csv$/) },
    { text: 'Tách giờ ra khỏi cột 4 bằng `split` theo dấu `:`.', hint: "awk '{split($4, t, \":\"); print t[2]}' access.log", check: OK(/^awk .*split\(\$4.*access\.log$/) },
    { text: 'Thay `ERROR` thành `E` bằng `gsub` rồi in.', hint: "awk '{gsub(/ERROR/, \"E\"); print}' app.log", check: OK(/^awk .*gsub\(\/ERROR\/.* app\.log$/) },
    { text: 'Đặt dấu phân tách ra `OFS` là dấu phẩy để xuất CSV.', hint: "awk 'BEGIN{OFS=\",\"} {print $1, $9}' access.log | head -3", check: OK(/^awk .*OFS.*access\.log$/) },
    { text: 'Đếm số dòng của file bằng `END{print NR}`.', hint: "awk 'END{print NR}' app.log", check: OK(/^awk END\{print NR\} app\.log$/) },
    { text: 'Bỏ trùng giữ thứ tự bằng `!seen[$0]++` trên `emails.txt`.', hint: "awk '!seen[$0]++' emails.txt", check: OK(/^awk !seen\[\$0\]\+\+ emails\.txt$/) },
    { text: 'Tính thời gian xử lý trung bình từ các trường `ms=` trong `app.log` (kết quả 695).', hint: "awk '{for (i=1;i<=NF;i++) if ($i ~ /^ms=/) {split($i,a,\"=\"); s+=a[2]; n++}} END{print s/n}' app.log", check: OK(/^awk .*ms=.*split.*END.* app\.log$/) },
    { text: 'Viết chương trình vào file `sum.awk` rồi chạy bằng `-f`.', hint: "printf 'BEGIN{FS=\",\"}\\nNR>1{s+=$5*$6}\\nEND{print s}\\n' > sum.awk\nawk -f sum.awk orders.csv", check: AND(OK(/^awk -f sum\.awk orders\.csv$/), function (s) { return /NR>1/.test(ftxt(s, s.cwd + '/sum.awk')); }) },
    { text: 'Ghi mỗi khách hàng vào một file riêng bằng `print > ...`.', hint: "awk -F, 'NR>1{print > ($3 \".csv\")}' orders.csv\nwc -l An.csv", check: function (s) { return ftxt(s, s.cwd + '/An.csv').split('\n').filter(Boolean).length === 4; } },
    { text: 'Đọc thông báo lỗi: chạy chương trình awk thiếu dấu `}`.', hint: "awk '{print $1' access.log", check: FAIL(/^awk \{print \$1 access\.log$/) }
  ]
};

var TOPIP = ['#!/bin/bash', 'awk "{print $1}" access.log | sort | uniq -c | sort -rn | head -3 > top.txt'];
var REVENUE = ['#!/bin/bash', "awk '{s+=$5*$6} END{print s}' orders.csv > revenue.txt"];
var SHARE = ['#!/bin/bash', "awk -F, 'NR>1{n[$3]+=$5*$6; t+=$5*$6} END{for (c in n) printf \"%s %d\\n\", c, n[c]/t}' orders.csv > share.txt"];
var ENRICH = ['#!/bin/bash', "awk -F, 'NR==FNR{p[$2]=$1; next} {print $0 \",\" p[$3]}' plans.csv orders.csv > enriched.csv"];
function putx(s2, name, arr) { s2.fs.put(s2.home + '/lab/' + name, arr.join('\n') + '\n', { owner: s2.user, mode: 493 }); }

T.debugs = [
  {
    id: 'tx3d1', title: 'top-ip.sh in ra cả dòng log thay vì chỉ địa chỉ IP',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./top-ip.sh', '$ cat top.txt', '      1 203.0.113.5 - - [27/Oct/2026:10:00:01 +0700] "GET / HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (X11; Linux x86_64)"', '      1 203.0.113.5 - - [27/Oct/2026:10:00:02 +0700] "GET /assets/app.js HTTP/1.1" 200 88231 ...', '      1 ...', '(mọi dòng đều đếm 1, không có IP nào nổi lên)'),
    story: 'Script `top-ip.sh` định xếp hạng các IP gọi nhiều nhất, nhưng `top.txt` toàn dòng log đầy đủ với số đếm 1.',
    goal: 'Dòng đầu của `top.txt` là `8 203.0.113.5` (IP gọi nhiều nhất).',
    hints: ['`cat top-ip.sh`. Chương trình awk nằm trong dấu nháy nào?', 'Trong nháy kép, shell đã thay `$1` bằng tham số script (rỗng), nên awk chỉ thấy `{print }` và in cả dòng.', 'Đổi sang nháy đơn: `sed -i "s/\\"/\'/g" top-ip.sh` rồi `./top-ip.sh` và `cat top.txt`.'],
    fix: ['cat top-ip.sh', "sed -i \"s/\\\"/'/g\" top-ip.sh", './top-ip.sh', 'cat top.txt'],
    cause: 'Trong nháy kép shell mở rộng `$1` trước khi gọi awk; trong script không có tham số nên nó thành rỗng. Chương trình awk luôn nên nằm trong nháy đơn; muốn truyền giá trị từ shell vào dùng `awk -v biến="$giá_trị"`.',
    setup: function (s) { base(s, { setup: function (s2) { putx(s2, 'top-ip.sh', TOPIP); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/top.txt').split('\n')[0]; return /^\s*8 203\.0\.113\.5$/.test(t); }
  },
  {
    id: 'tx3d2', title: 'revenue.sh cho doanh thu sai khác xa thực tế',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./revenue.sh && cat revenue.txt', '0', '', '(mong đợi: 5460000)'),
    story: 'Script tính doanh thu từ `orders.csv` luôn ra 0. Công thức `qty * price` (cột 5 và 6) có vẻ đúng.',
    goal: '`revenue.txt` chứa `5460000`.',
    hints: ['`head -2 orders.csv`. Các trường ngăn cách bởi gì?', 'Không có `-F,` thì awk tách theo khoảng trắng, nên `$5` và `$6` không phải qty và price (dòng có tên "Gói Toán 10" chứa khoảng trắng).', 'Thêm `-F,`: `sed -i "s/awk /awk -F, /" revenue.sh`, chạy lại và `cat revenue.txt`.'],
    fix: ['head -2 orders.csv', 'sed -i "s/awk /awk -F, /" revenue.sh', './revenue.sh', 'cat revenue.txt'],
    cause: 'awk mặc định tách theo khoảng trắng, nên với CSV phải đặt `-F,`. Dấu hiệu: số liệu bằng 0 hoặc vô lý, cột in ra không như dự kiến. Hãy thử `awk \'{print $5}\'` trên vài dòng để xem cột thực sự là gì.',
    setup: function (s) { base(s, { setup: function (s2) { putx(s2, 'revenue.sh', REVENUE); } }); },
    check: function (s) { return ftxt(s, s.home + '/lab/revenue.txt').trim() === '5460000'; }
  },
  {
    id: 'tx3d3', title: 'Báo cáo tỷ lệ doanh thu toàn ra 0',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./share.sh && cat share.txt', 'An 0', 'Bình 0', 'Châu 0', 'Dũng 0'),
    story: 'Script `share.sh` tính tỷ trọng doanh thu của từng khách trên tổng. Mọi khách đều ra 0, trong khi An đóng góp khoảng một phần tư.',
    goal: '`share.txt` có các dòng `An 24`, `Bình 34`, `Châu 30`, `Dũng 9` (phần trăm làm tròn xuống).',
    hints: ['`cat share.sh` và để ý biểu thức `n[c]/t`. Kết quả của nó nằm trong khoảng nào?', '`n[c]/t` là số trong khoảng 0 đến 1 (ví dụ 0.245) và `%d` cắt bỏ phần thập phân nên thành 0.', 'Nhân 100 trước khi in: `sed -i "s|n\\[c\\]/t|n[c]*100/t|" share.sh`, chạy lại và `cat share.txt`.'],
    fix: ['cat share.sh', 'sed -i "s|n\\[c\\]/t|n[c]*100/t|" share.sh', './share.sh', 'cat share.txt'],
    cause: 'awk chia số thực, nhưng `%d` luôn cắt phần thập phân. Tỷ lệ 0.245 thành 0. Phải nhân 100 trước (hoặc in với `%.1f`). Khi kết quả là 0 bất thường, hãy `print` giá trị gốc không qua printf để nhìn thấy số thật.',
    setup: function (s) { base(s, { setup: function (s2) { putx(s2, 'share.sh', SHARE); } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/share.txt'); return /^An 24$/m.test(t) && /^Bình 34$/m.test(t) && /^Châu 30$/m.test(t) && /^Dũng 9$/m.test(t); }
  },
  {
    id: 'tx3d4', title: 'Ghép gói cước vào đơn hàng nhưng cột cuối luôn trống', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./enrich.sh && head -3 enriched.csv', 'id,date,customer,item,qty,price,', '1001,2026-10-01,An,Gói Toán 10,2,250000,', '1002,2026-10-02,Bình,Gói Lý 11,1,300000,', '', '$ cat plans.csv', 'pro,An', 'free,Bình', '...'),
    story: 'Tệp `plans.csv` ghi gói cước của từng khách (do bộ phận khác xuất từ Windows). Script `enrich.sh` đối chiếu bằng `NR==FNR` nhưng cột gói cước luôn rỗng, dù `cat` cho thấy tên khớp.',
    goal: 'Mỗi dòng đơn hàng trong `enriched.csv` kết thúc bằng gói cước đúng, ví dụ `1001,2026-10-01,An,Gói Toán 10,2,250000,pro`.',
    hints: ['Hãy nhìn tận bytes: `cat -A plans.csv`. Cuối mỗi dòng có gì?', 'File từ Windows có `^M$` (CRLF): ký tự `\\r` dính vào trường cuối nên khoá là `An\\r`, không bằng `An`.', 'Bỏ `\\r`: `sed -i \'s/\\r$//\' plans.csv`, rồi `./enrich.sh` và `cat enriched.csv`.'],
    fix: ['cat -A plans.csv', "sed -i 's/\\r$//' plans.csv", './enrich.sh', 'cat enriched.csv'],
    cause: 'File CRLF để lại `\\r` ở cuối dòng, nên trường cuối của dòng không bao giờ khớp khoá đối chiếu. `cat` bình thường không hiển thị `\\r`; dùng `cat -A` (hoặc `file`) để thấy. Chuẩn hoá file đầu vào (`sed -i \'s/\\r$//\'`) trước khi join là bước phải làm với dữ liệu từ Windows hoặc Excel.',
    setup: function (s) { base(s, { setup: function (s2) {
      putx(s2, 'enrich.sh', ENRICH);
      s2.fs.put(s2.home + '/lab/plans.csv', 'pro,An\r\nfree,Bình\r\npro,Châu\r\nfree,Dũng\r\n', { owner: s2.user, mode: 420 });
    } }); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/enriched.csv'); return t.indexOf('\r') < 0 && /^1001,2026-10-01,An,Gói Toán 10,2,250000,pro$/m.test(t) && /^1002,2026-10-02,Bình,Gói Lý 11,1,300000,free$/m.test(t) && /^1012,2026-10-20,Châu,Gói Toán 10,1,250000,pro$/m.test(t); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
