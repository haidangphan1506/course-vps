(function (G) {
'use strict';
/* Chương tx2: sed. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt;
function base(s, o) { C.TXT.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };

var T = {
  id: 'tx2', group: 'Công cụ văn bản', short: 'sed',
  title: 'sed: sửa văn bản theo dòng',
  dek: 'Thay thế, xoá, chèn, chọn dòng; sửa file cấu hình tại chỗ với -i an toàn; địa chỉ dòng, regex, nhóm \\1, nhiều lệnh, và các công thức sed dùng hằng ngày.'
};
C.insertAfter('rx1', T);

T.theory = [
  { tag: 'Khái niệm', title: 'sed là gì và chạy như thế nào', body: [
    '**sed** (stream editor) đọc văn bản từng dòng, áp một hay nhiều lệnh lên dòng đó, rồi in kết quả. Nó **không** sửa file gốc trừ khi bạn dùng `-i`.',
    { pre: ['sed [cờ] \'LỆNH\' file...', 'sed \'s/ERROR/LOI/\' app.log          # thay ERROR bằng LOI, in ra màn hình', 'cat app.log | sed \'s/ERROR/LOI/\'   # đọc từ pipe', 'sed -n \'5p\' app.log                  # chỉ in dòng 5'], cap: 'Cấu trúc câu lệnh' },
    { tbl: [['Bước', 'Việc sed làm'], ['1', 'Đọc một dòng vào **pattern space** (bộ nhớ đệm)'], ['2', 'Chạy lần lượt các lệnh lên dòng đó (nếu địa chỉ khớp)'], ['3', 'In pattern space ra (trừ khi dùng `-n` hoặc lệnh `d`)'], ['4', 'Lặp lại với dòng kế tiếp']] },
    { tbl: [['Cờ', 'Nghĩa'], ['`-n`', 'Không tự in; chỉ in khi có lệnh `p`'], ['`-e`', 'Thêm một biểu thức (dùng nhiều lần)'], ['`-f file`', 'Đọc lệnh từ file script'], ['`-E` hoặc `-r`', 'Dùng regex mở rộng (ERE)'], ['`-i[SUFFIX]`', 'Sửa **tại chỗ**; có SUFFIX thì lưu bản sao lưu']] },
    { note: 'Hai chế độ cần phân biệt: **không** `-n` thì mọi dòng đều được in (đã sửa hoặc nguyên vẹn). Có `-n` thì chỉ dòng bạn yêu cầu `p` mới hiện.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Lệnh s: thay thế', body: [
    { pre: ['s/mẫu/thay/flags', 'sed \'s/ERROR/E/\' app.log        # mỗi dòng: thay lần ĐẦU tiên', 'sed \'s/:/-/g\' app.log            # g: thay MỌI lần trong dòng', 'sed \'s/error/E/I\' app.log        # I (hoặc i): không phân biệt hoa thường', 'sed \'s/o/0/2\' <<< "foo boo"       # số 2: chỉ thay lần xuất hiện thứ 2 -> fo0 boo', 'sed -n \'s/ERROR/E/p\' app.log      # p: in dòng đã thay (kèm -n: chỉ in những dòng có thay)'], cap: 'Cờ của s' },
    { tbl: [['Thành phần', 'Ý nghĩa', 'Ví dụ'], ['Dấu phân cách', 'Mặc định `/`; có thể là bất kỳ ký tự nào', '`s|/srv|/opt|` khi chuỗi chứa `/`'], ['`&` trong phần thay', 'Toàn bộ đoạn đã khớp', '`s/ERROR/[&]/` ra `[ERROR]`'], ['`\\1`..`\\9`', 'Nhóm đã bắt `\\(...\\)` (BRE) hoặc `(...)` với `-E`', '`-E \'s/(\\w+) (\\w+)/\\2 \\1/\'`'], ['`\\n` trong phần thay', 'Xuống dòng (GNU sed)', '`s/ /\\n/g`'], ['`\\U` `\\L` `\\u` `\\E`', 'Đổi hoa/thường (GNU)', '`s/.*/\\U&/`']] },
    { pre: ["sed 's|/srv/tutor|/opt/tutor|g' app.log      # phân cách | để khỏi phải thoát /", "sed -E 's/user=([a-z]+)/người dùng: \\1/' app.log", "sed 's/\\(.*\\) \\(.*\\)/\\2 \\1/'                     # BRE: nhóm cần dấu \\", "echo 'tutor' | sed 's/.*/\\U&/'                  # TUTOR"], cap: 'Dấu phân cách, nhóm, đổi chữ hoa' },
    { note: 'Trong BRE (mặc định) các ký tự `( ) { } + ? |` là chữ thường, còn `\\( \\) \\{ \\} \\+ \\? \\|` mới là toán tử. Với `-E` thì ngược lại, giống grep. Vì vậy hầu hết mọi người dùng `sed -E`.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Địa chỉ: chọn dòng nào sẽ chịu lệnh', body: [
    'Đặt trước lệnh để giới hạn phạm vi. Không có địa chỉ thì lệnh áp lên mọi dòng.',
    { tbl: [['Địa chỉ', 'Chọn', 'Ví dụ'], ['`N`', 'Dòng số N', '`sed -n \'5p\'`'], ['`$`', 'Dòng cuối', '`sed -n \'$p\'`'], ['`/re/`', 'Dòng khớp regex', '`sed \'/^#/d\'`'], ['`N,M`', 'Từ dòng N đến M', '`sed -n \'4,6p\'`'], ['`N,+K`', 'Dòng N và K dòng sau', '`sed -n \'/TypeError/,+2p\'`'], ['`/a/,/b/`', 'Từ dòng khớp a đến dòng khớp b', '`sed -n \'/start/,/end/p\'`'], ['`first~step`', 'Cách đều', '`sed -n \'1~2p\'` (dòng lẻ)'], ['`ĐỊA_CHỈ!`', 'Mọi dòng **trừ** địa chỉ này', '`sed \'/INFO/!d\'`']] },
    { pre: ["sed -n '4,6p' app.log                        # dòng 4 đến 6", "sed -n '/connection refused/,/reconnected/p' app.log", "sed '/location \\/api\\//,/}/s/3000/4000/' site.conf   # chỉ sửa trong khối", "sed '1d' orders.csv                          # bỏ dòng tiêu đề", "sed '/^#/d;/^$/d' .env                        # bỏ chú thích và dòng trống"], cap: 'Các địa chỉ thường dùng' },
    { note: 'Nếu mẫu địa chỉ chứa `/`, thoát bằng `\\/` hoặc đổi dấu phân cách: `\\|/api/|` (dấu `\\` rồi ký tự phân cách bất kỳ).', kind: 'tip' }
  ] },
  { tag: 'Bảng tra', title: 'Lệnh d, p, a, i, c, q, =, y', body: [
    { tbl: [['Lệnh', 'Tác dụng', 'Ví dụ'], ['`d`', 'Xoá dòng (không in)', '`sed \'/DEBUG/d\' app.log`'], ['`p`', 'In dòng (thường dùng với `-n`)', '`sed -n \'/ERROR/p\' app.log`'], ['`a TEXT`', 'Thêm dòng **sau**', '`sed \'/^PORT=/a HOST=0.0.0.0\' .env`'], ['`i TEXT`', 'Chèn dòng **trước**', '`sed \'1i # Tutor API\' .env`'], ['`c TEXT`', 'Thay cả dòng bằng TEXT', '`sed \'/^DEBUG=/c DEBUG=true\' .env`'], ['`q`', 'Thoát sau dòng này', '`sed 5q app.log` giống `head -5`'], ['`=`', 'In số dòng', '`sed -n \'/ERROR/=\' app.log`'], ['`y/abc/ABC/`', 'Đổi từng ký tự một-một', '`sed \'y/-/_/\'`']] },
    { pre: ["sed '$a # hết file' app.log               # thêm vào cuối", "sed '/^PORT=/a HOST=0.0.0.0' .env       # thêm dòng sau PORT", "sed '2,3c\\\\\n# đã xoá' orders.csv          # thay cả khối dòng 2-3 bằng 1 dòng"], cap: 'Chèn và thay dòng' },
    { note: 'Với `a`, `i`, `c` kiểu một dòng (`a text`) là mở rộng của **GNU sed** (Linux). BSD sed trên macOS đòi `a\\` rồi xuống dòng. Script bạn viết cho VPS Ubuntu dùng GNU sed nên không sao, nhưng sẽ không chạy trên Mac.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Sửa file tại chỗ với -i một cách an toàn', body: [
    'Đây là dùng sed phổ biến nhất trên server: chỉnh `.env`, `nginx.conf`, `sshd_config`. Cũng là chỗ dễ làm hỏng file nhất. Quy trình an toàn:',
    { tbl: [['Bước', 'Lệnh', 'Mục đích'], ['1. Xem trước', "`sed 's/3000/4000/' .env`", 'Chưa đổi gì, nhìn kết quả'], ['2. So sánh', "`sed 's/3000/4000/' .env | diff .env -`", 'Chỉ thấy đúng các dòng sẽ đổi'], ['3. Sao lưu', '`cp .env .env.bak`', 'Có đường lui'], ['4. Áp dụng', "`sed -i 's/3000/4000/' .env`", 'Ghi đè file'], ['5. Kiểm tra', '`diff .env.bak .env`', 'Xác nhận thay đổi đúng ý']] },
    { pre: ["sed -i.bak 's/PORT=3000/PORT=4000/' .env   # -i.bak: tự lưu .env.bak (sed gốc để lại .env.bak)", "sudo sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config", "sudo sshd -t                                    # kiểm tra cú pháp trước khi reload", "find . -name '*.conf' | xargs sed -i 's/listen 80/listen 8080/'   # nhiều file"], cap: 'Ví dụ thực tế' },
    { ul: ['`-i` không có đầu ra: không thấy gì nghĩa là đã ghi (hoặc không có gì khớp). Hãy `grep` lại để xác nhận', 'File của root cần `sudo sed -i` (sed tạo file tạm cùng thư mục, nên cần quyền ghi cả thư mục)', 'Dùng `-i.bak` mà không dọn `.bak` đi sẽ để lại file thừa. Hãy nhớ chúng có thể chứa bí mật như mật khẩu `.env`', '`sed -i` tạo file mới rồi đổi tên, nên làm mất liên kết cứng và có thể đổi chủ sở hữu/quyền ở một số tình huống', 'Nếu đường dẫn là **symlink** (ví dụ `/etc/nginx/sites-enabled/tutor`), `sed -i` thay chính symlink bằng một file thường và site mất liên kết với `sites-available`. Thêm `--follow-symlinks`, hoặc sửa thẳng file gốc trong `sites-available`'] }
  ] },
  { tag: 'Cú pháp', title: 'Regex trong sed: neo, lớp ký tự, tham lam', body: [
    { tbl: [['Việc', 'Mẫu', 'Ví dụ'], ['Bỏ khoảng trắng đầu dòng', '`s/^[ \\t]*//`', 'xoá thụt lề'], ['Bỏ khoảng trắng cuối dòng', '`s/[ \\t]*$//`', 'dọn trailing space'], ['Bỏ chú thích cuối dòng', '`s/#.*//`', '`k=v # note` ra `k=v `'], ['Bỏ CR của file Windows', '`s/\\r$//`', 'sửa CRLF'], ['Giữ lại chỉ phần trong ngoặc kép', "`s/.*\"\\(.*\\)\".*/\\1/`", 'rút giá trị'], ['Đổi giá trị KEY=...', '`s/^PORT=.*/PORT=4000/`', 'cố định bất kể giá trị cũ'], ['Bỏ/cho dấu `#` đầu dòng', '`s/^#\\?Port/Port/`', '`#\\?` nghĩa là có thể có `#`']] },
    { note: '`.*` là **tham lam**: nó nuốt càng nhiều càng tốt rồi lùi lại. `echo "a=1,b=2" | sed \'s/=.*,/X/\'` cho `aXb=2` chứ không phải `aX1,b=2`. Muốn khớp ngắn nhất, loại trừ ký tự kết thúc: `s/=[^,]*,/X/`.', kind: 'warn' },
    'Thay thế dòng cấu hình theo kiểu "đặt giá trị cho khoá" là mẫu nên dùng nhất, vì nó không phụ thuộc giá trị hiện tại:',
    { pre: ["sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' sshd_config", "sed -i 's/^PORT=.*/PORT=4000/' .env"], cap: 'Đặt giá trị bất kể giá trị cũ, kể cả khi dòng đang bị comment' }
  ] },
  { tag: 'Cú pháp', title: 'Nhiều lệnh, khối lệnh, script file', body: [
    { pre: ["sed -e 's/ERROR/E/' -e 's/WARN/W/' app.log          # hai biểu thức", "sed 's/ERROR/E/;s/WARN/W/' app.log                   # cách nhau bằng ;", "sed -n '/ERROR/{p;q}' app.log                        # in dòng ERROR đầu tiên rồi dừng", "sed '/^$/d;s/^[ \\t]*//' file                        # xoá dòng trống và bỏ thụt lề", "sed -f fix.sed app.log                               # lệnh nằm trong file"], cap: 'Kết hợp nhiều lệnh' },
    { pre: ["# fix.sed", "/DEBUG/d", "s/ERROR/LOI/", "s/WARN/CANH BAO/"], cap: 'Script sed (mỗi lệnh một dòng)' },
    'Khối `{ ... }` áp nhiều lệnh lên cùng một địa chỉ. Nối dòng bằng `N`, giữ dòng bằng không gian giữ (hold space) là phần nâng cao, dùng khi cần xử lý nhiều dòng một lúc:',
    { pre: ["sed ':a;N;$!ba;s/\\n/,/g' servers.txt          # gộp mọi dòng thành 1 dòng, ngăn bằng dấu phẩy", "sed -n '1!G;h;$p' file                         # đảo ngược thứ tự dòng (như tac)"], cap: 'Nâng cao: nhiều dòng' },
    { note: 'Khi bạn thấy chuỗi `sed` dài hơn 3 lệnh thì nên cân nhắc `awk` (chương sau) hoặc viết script thật. sed rất tốt cho thay thế, awk tốt cho xử lý theo cột.', kind: 'tip' }
  ] },
  { tag: 'Bảng tra', title: 'Công thức sed hay dùng', body: [
    { tbl: [['Mục tiêu', 'Lệnh'], ['Xem dòng 10 đến 20', "`sed -n '10,20p' file`"], ['Xoá dòng trống', "`sed '/^$/d' file`"], ['Xoá dòng chú thích', "`sed '/^[[:space:]]*#/d' file`"], ['In giữa hai dấu mốc (không kèm mốc)', "`sed -n '/BEGIN/,/END/{//!p}' file`"], ['Thêm dòng sau khi thấy mẫu', "`sed '/mẫu/a dòng mới' file`"], ['Thay trong nhiều file', "`find . -name '*.conf' | xargs sed -i 's/a/b/g'`"], ['Đánh số dòng', "`sed = file | sed 'N;s/\\n/\\t/'`"], ['Đổi CRLF thành LF', "`sed -i 's/\\r$//' file`"], ['Lấy giá trị sau dấu =', "`sed -n 's/^PORT=//p' .env`"], ['Chỉ in những dòng đã đổi', "`sed -n 's/a/b/p' file`"], ['Thay trừ dòng chứa từ khoá', "`sed '/giữ/!s/a/b/' file`"]] },
    { note: 'Mẹo kiểm tra nhanh: thêm `-n` và `p` vào cuối lệnh `s` (`sed -n \'s/a/b/p\'`) để chỉ xem những dòng thực sự bị thay đổi.', kind: 'tip' }
  ] },
  { tag: 'Lưu ý', title: 'Lỗi thường gặp và danh sách kiểm tra', body: [
    { tbl: [['Thông báo / triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['`unterminated s command`', 'Thiếu dấu `/` cuối', '`s/a/b/` có 3 dấu `/`'], ['`unknown option to s`', 'Có `/` trong mẫu hoặc phần thay, sed hiểu thành cờ', 'Đổi dấu phân cách: `s|a/b|c/d|`'], ['`unknown command: x`', 'Địa chỉ hoặc lệnh viết sai', 'Kiểm tra vị trí `-n`, `p`, `d`'], ['`invalid reference \\1 on s command\'s RHS`', 'Dùng `\\1` nhưng mẫu không có nhóm', 'Thêm `\\( \\)` hoặc dùng `-E` và `( )`'], ['Sed chạy mà file không đổi', 'Quên `-i`', 'Thêm `-i`'], ['Chạy `-i` xong không còn gì', 'Dùng `>` ghi vào chính file đang đọc', '`sed -i`, không phải `sed ... f > f`'], ['`couldn\'t open temporary file`', 'Không có quyền ghi thư mục', '`sudo sed -i`'], ['Đổi nhầm nhiều chỗ hơn dự định', 'Mẫu ngắn khớp mọi nơi (`3000` nằm trong `30000`)', 'Neo mẫu: `proxy_pass …:3000`, `-w` kiểu `\\b3000\\b`, hoặc giới hạn bằng địa chỉ'], ['Biến shell không được thay', 'Dùng nháy đơn', 'Dùng nháy kép: `sed "s/x/$VAR/"` (cẩn thận ký tự đặc biệt trong biến)']] },
    { ul: ['Đã chạy bản **xem trước** (không `-i`) và đọc kết quả chưa?', 'Có bản sao lưu hoặc dùng `-i.bak` chưa?', 'Mẫu có thể khớp ngoài ý muốn (comment, số lớn hơn, chuỗi con)?', 'Phần thay chứa `/` hoặc `&` chưa được thoát?', 'Với file hệ thống: đã kiểm tra cú pháp (`nginx -t`, `sshd -t`) trước khi reload chưa?'] }
  ] }
];

T.quiz = C.QZ(2, [
  ['Lệnh `sed \'s/ERROR/E/\' app.log` làm gì với file `app.log`?', 'Chỉ in kết quả ra màn hình; file gốc giữ nguyên', ['Sửa trực tiếp file', 'Tạo file app.log.new', 'Xoá các dòng ERROR'], 'sed không sửa file gốc, trừ khi bạn thêm `-i`.'],
  ['Khác biệt giữa `s/a/b/` và `s/a/b/g` là gì?', 'Không có `g` chỉ thay lần đầu mỗi dòng; có `g` thay mọi lần', ['`g` làm sed chạy nhanh hơn', '`g` thay trên cả file thay vì từng dòng', 'Không khác biệt'], 'Mặc định `s` chỉ thay lần xuất hiện đầu tiên **trong mỗi dòng**.'],
  ['`sed -n \'/ERROR/p\' app.log` in ra gì?', 'Chỉ các dòng chứa ERROR', ['Mọi dòng, dòng ERROR in hai lần', 'Các dòng không chứa ERROR', 'Không in gì'], '`-n` tắt tự in; `p` in các dòng khớp địa chỉ.'],
  ['`sed -n \'4,6p\' app.log` in gì?', 'Các dòng số 4, 5, 6', ['Dòng số 4 và dòng số 6', 'Dòng số 6 đến cuối', 'Ba dòng đầu tiên sau dòng 6'], '`N,M` là khoảng dòng, bao gồm cả hai đầu.'],
  ['Chuỗi thay thế chứa nhiều dấu `/` như `/srv/tutor`. Cách viết đúng nhất là?', '`sed \'s|/srv/tutor|/opt/tutor|\'`', ['`sed \'s//srv/tutor//opt/tutor/\'`', '`sed \'s/srv/tutor/opt/tutor/\'`', 'Không thể làm với sed'], 'Ký tự phân cách của `s` có thể là bất kỳ ký tự nào. Dùng `|` hoặc `#` để khỏi phải thoát `/`.'],
  ['`&` trong phần thay của lệnh `s` đại diện cho gì?', 'Toàn bộ đoạn text đã khớp mẫu', ['Dấu và thông thường', 'Dòng kế tiếp', 'Nhóm thứ nhất'], '`sed \'s/ERROR/[&]/\'` biến `ERROR` thành `[ERROR]`.'],
  ['Muốn đặt `PermitRootLogin no` bất kể dòng hiện tại là `PermitRootLogin yes` hay `#PermitRootLogin prohibit-password`, dùng mẫu nào?', '`s/^#\\?PermitRootLogin.*/PermitRootLogin no/`', ['`s/PermitRootLogin yes/PermitRootLogin no/`', '`s/#//`', '`s/PermitRootLogin/no/`'], 'Mẫu có `#\\?` (có thể có dấu #) và `.*` (mọi giá trị cũ) nên khớp cả hai dạng.'],
  ['Trước khi chạy `sed -i` lên file cấu hình quan trọng, bước nào nên làm?', 'Chạy không `-i` để xem trước, và sao lưu hoặc dùng `-i.bak`', ['Chạy ngay vì sed có thể hoàn tác', 'Dừng dịch vụ để sed không tranh chấp', 'Đổi chủ file thành root'], 'sed -i ghi đè không có hoàn tác. Xem trước, `diff`, và có bản sao lưu.'],
  ['Lệnh `sed \'3d\' file` làm gì?', 'Xoá dòng thứ 3 khỏi đầu ra', ['Xoá 3 dòng đầu', 'Chép dòng 3 ra hai lần', 'In dòng thứ 3'], '`d` xoá dòng khỏi kết quả; địa chỉ `3` chọn dòng số 3.'],
  ['Biểu thức nào chỉ thay `3000` thành `4000` bên trong khối `location /api/ { ... }`?', '`sed \'/location \\/api\\//,/}/s/3000/4000/\'`', ['`sed \'s/3000/4000/\'`', '`sed \'/location/d\'`', '`sed -n \'3000p\'`'], 'Địa chỉ dạng khoảng `/mẫu1/,/mẫu2/` giới hạn lệnh `s` trong khối đó.'],
  ['Với `echo "a=1,b=2" | sed \'s/=.*,/X/\'` kết quả là gì?', '`aXb=2` (`.*` tham lam, nuốt tới dấu phẩy cuối cùng)', ['`aX1,b=2`', '`aX2`', '`a=1,b=2`'], '`.*` khớp dài nhất có thể. Muốn ngắn nhất dùng `[^,]*`.'],
  ['`sed \'s/(\\w+) (\\w+)/\\2 \\1/\'` (không có `-E`) có vấn đề gì?', 'Trong BRE `( )` là chữ thường, nên nhóm không tồn tại và `\\1` báo lỗi', ['Không vấn đề gì', 'Chỉ chạy trên macOS', 'Phải thêm cờ `-g`'], 'Dùng `sed -E` hoặc viết `\\(\\w\\+\\)` trong BRE.'],
  ['Vì sao `sed \'s/a/b/\' file > file` làm file thành rỗng?', 'Shell cắt (truncate) file đích trước khi sed kịp đọc nó', ['sed xoá file khi thất bại', 'Vì thiếu cờ `-n`', 'Vì file đang bị khoá bởi hệ điều hành'], 'Redirect `>` mở file ở chế độ ghi và xoá nội dung trước khi lệnh chạy. Dùng `sed -i`, hoặc ghi ra file tạm rồi `mv`.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Thay `ERROR` bằng `LOI` trên màn hình (chỉ lần đầu mỗi dòng).', hint: "sed 's/ERROR/LOI/' app.log", check: OK(/^sed s\/ERROR\/LOI\/ app\.log$/) },
    { text: 'Xác nhận file gốc không đổi: số dòng chứa `LOI` trong `app.log` phải là 0.', hint: 'grep -c LOI app.log', check: A(/^grep -c LOI app\.log$/) },
    { text: 'So sánh có `g` và không có `g`: thay dấu `:` bằng `h` trên một dòng giờ.', hint: 'echo 10:00:01 | sed s/:/h/\necho 10:00:01 | sed s/:/h/g', check: AND(OK(/^sed s\/:\/h\/$/), OK(/^sed s\/:\/h\/g$/)) },
    { text: 'Chỉ in các dòng ERROR (dùng `-n` và `p`).', hint: "sed -n '/ERROR/p' app.log", check: OK(/^sed -n \/ERROR\/p app\.log$/) },
    { text: 'In dòng 4 đến 6 của `app.log`.', hint: "sed -n '4,6p' app.log", check: OK(/^sed -n 4,6p app\.log$/) },
    { text: 'In dòng cuối cùng.', hint: "sed -n '$p' app.log", check: OK(/^sed -n \$p app\.log$/) },
    { text: 'In số dòng của mọi dòng ERROR bằng lệnh `=`.', hint: "sed -n '/ERROR/=' app.log", check: OK(/^sed -n \/ERROR\/= app\.log$/) },
    { text: 'Hiển thị `.env` không có dòng chú thích và dòng trống.', hint: "sed '/^#/d;/^$/d' .env", check: OK(/^sed \/\^#\/d;\/\^\$\/d \.env$/) },
    { text: 'Bỏ dòng tiêu đề của `orders.csv` (xoá dòng 1).', hint: "sed '1d' orders.csv", check: OK(/^sed 1d orders\.csv$/) },
    { text: 'In từ dòng `connection refused` đến dòng `reconnected` (khoảng giữa hai mẫu).', hint: "sed -n '/connection refused/,/reconnected/p' app.log", check: OK(/^sed -n \/connection refused\/,\/reconnected\/p app\.log$/) },
    { text: 'Bọc mức độ trong ngoặc vuông bằng `&`: `ERROR` thành `[ERROR]`, `WARN` thành `[WARN]`.', hint: "sed -E 's/ERROR|WARN/[&]/' app.log", check: OK(/^sed -E s\/ERROR\|WARN\/\[&\]\/ app\.log$/) },
    { text: 'Dùng nhóm bắt: đổi `user=an` thành `người dùng: an`.', hint: "sed -E 's/user=([a-z]+)/người dùng: \\1/' app.log", check: OK(/^sed -E s\/user=\(\[a-z\]\+\)\/người dùng: \\1\/ app\.log$/) },
    { text: 'Dùng dấu phân cách `|` để đổi đường dẫn `/srv/tutor` thành `/opt/tutor` trong `app.log`.', hint: "sed 's|/srv/tutor|/opt/tutor|g' app.log", check: OK(/^sed s\|\/srv\/tutor\|\/opt\/tutor\|g app\.log$/) },
    { text: 'Chèn một dòng tiêu đề vào đầu `app.log` (xem 2 dòng đầu).', hint: "sed '1i # Tutor API log' app.log | head -2", check: OK(/^sed 1i # Tutor API log app\.log$/) },
    { text: 'Thêm một dòng `# hết` vào cuối `app.log` (xem 2 dòng cuối).', hint: "sed '$a # hết' app.log | tail -2", check: OK(/^sed \$a # hết app\.log$/) },
    { text: 'Thay cả dòng `DEBUG=...` bằng `DEBUG=true` (chưa ghi vào file).', hint: "sed '/^DEBUG=/c\\DEBUG=true' .env", check: OK(/^sed \/\^DEBUG=\/c\\DEBUG=true \.env$/) },
    { text: 'Chỉ lấy 5 dòng đầu bằng lệnh `q`.', hint: 'sed 5q app.log', check: OK(/^sed 5q app\.log$/) },
    { text: 'In những dòng lẻ của `orders.csv` bằng `1~2`.', hint: "sed -n '1~2p' orders.csv", check: OK(/^sed -n 1~2p orders\.csv$/) },
    { text: 'Đổi chữ thành chữ hoa bằng `\\U&` (GNU sed).', hint: "echo tutor.haiphan.org | sed 's/.*/\\U&/'", check: OK(/^sed s\/\.\*\/\\U&\/$/) },
    { text: 'Dùng hai biểu thức `-e` liên tiếp.', hint: "sed -e 's/ERROR/E/' -e 's/WARN/W/' app.log | head -6", check: OK(/^sed -e s\/ERROR\/E\/ -e s\/WARN\/W\/ app\.log$/) },
    { text: 'Viết file script `fix.sed` rồi chạy bằng `-f`.', hint: "printf '/DEBUG/d\\ns/ERROR/LOI/\\n' > fix.sed\nsed -f fix.sed app.log | head -6", check: AND(OK(/^sed -f fix\.sed app\.log$/), function (s) { return /\/DEBUG\/d/.test(ftxt(s, s.cwd + '/fix.sed')); }) },
    { text: 'Sao lưu `.env` rồi sửa cổng tại chỗ: PORT=3000 thành PORT=4000.', hint: "cp .env .env.bak\nsed -i 's/^PORT=.*/PORT=4000/' .env", check: AND(OK(/^cp \.env \.env\.bak$/), OK(/^sed -i s\/\^PORT=\.\*\/PORT=4000\/ \.env$/), function (s) { return /^PORT=4000$/m.test(ftxt(s, s.cwd + '/.env')) && /^PORT=3000$/m.test(ftxt(s, s.cwd + '/.env.bak')); }) },
    { text: 'So sánh bản sao lưu với bản đã sửa bằng `diff`.', hint: 'diff .env.bak .env', check: A(/^diff \.env\.bak \.env$/) },
    { text: 'Dùng `-i.orig` để sed tự giữ bản gốc khi đổi `NODE_ENV` sang `staging`.', hint: "sed -i.orig 's/NODE_ENV=production/NODE_ENV=staging/' .env", check: function (s) { return /^NODE_ENV=staging$/m.test(ftxt(s, s.cwd + '/.env')) && /^NODE_ENV=production$/m.test(ftxt(s, s.cwd + '/.env.orig')); } },
    { text: 'Xem trước thay đổi trên `site.conf` bằng pipe vào `diff` (chưa ghi file).', hint: "sed 's/listen 80/listen 8080/' site.conf | diff site.conf -", check: A(/^diff site\.conf -$/) },
    { text: 'Trong `sshd_config`: bật `PermitRootLogin no` bất kể dòng hiện tại đang bị comment.', hint: "sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' sshd_config", check: function (s) { var t = ftxt(s, s.cwd + '/sshd_config'); return /^PermitRootLogin no$/m.test(t) && !/^#PermitRootLogin/m.test(t); } },
    { text: 'Tắt đăng nhập bằng mật khẩu trong `sshd_config`.', hint: "sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' sshd_config", check: function (s) { return /^PasswordAuthentication no$/m.test(ftxt(s, s.cwd + '/sshd_config')); } },
    { text: 'Đổi cổng upstream trong khối `location /api/` thành 4000 mà **không** động vào comment `# cổng cũ 3000`.', hint: "sed -i 's|proxy_pass http://127.0.0.1:3000|proxy_pass http://127.0.0.1:4000|' site.conf", check: function (s) { var t = ftxt(s, s.cwd + '/site.conf'); return /proxy_pass http:\/\/127\.0\.0\.1:4000;/.test(t) && /# cổng cũ 3000/.test(t); } },
    { text: 'Sửa nhiều file một lần: dùng `find` và `xargs` để đổi `listen 80` thành `listen 8080` trong `site.conf`.', hint: "find . -name '*.conf' | xargs sed -i 's/listen 80;/listen 8080;/'", check: function (s) { return /listen 8080;/.test(ftxt(s, s.cwd + '/site.conf')); } },
    { text: 'Tạo file kiểu Windows (CRLF), dùng `file` để thấy, rồi bỏ `\\r` bằng sed.', hint: "printf 'a\\r\\nb\\r\\n' > win.txt\nfile win.txt\nsed -i 's/\\r$//' win.txt\nfile win.txt", check: AND(OK(/^sed -i s\/\\r\$\/\/ win\.txt$/), function (s) { return ftxt(s, s.cwd + '/win.txt') === 'a\nb\n'; }) },
    { text: 'Gộp mọi dòng của `servers.txt` thành một dòng ngăn bởi dấu phẩy.', hint: "sed ':a;N;$!ba;s/\\n/,/g' servers.txt", check: OK(/^sed :a;N;\$!ba;s\/\\n\/,\/g servers\.txt$/) },
    { text: 'Gỡ lỗi nhanh: chạy một lệnh `s` thiếu dấu `/` cuối để đọc thông báo lỗi.', hint: "sed 's/a/b' app.log", check: FAIL(/^sed s\/a\/b app\.log$/) }
  ]
};

var SETPORT = ['#!/bin/bash', "sed 's/^PORT=.*/PORT=4000/' .env", 'echo "đã đổi cổng"'];

T.debugs = [
  {
    id: 'tx2d1', title: 'Script báo "đã đổi cổng" nhưng .env vẫn là 3000',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./setport.sh', 'NODE_ENV=production', 'PORT=4000', '...', 'đã đổi cổng', '', '$ grep PORT .env', 'PORT=3000'),
    story: 'Script `setport.sh` đổi cổng của API. Nó in ra file với PORT=4000 và báo đã đổi, nhưng `.env` vẫn là 3000 và ứng dụng không đổi.',
    goal: 'Sau khi sửa và chạy lại `./setport.sh`, `.env` phải có `PORT=4000`.',
    hints: ['Chạy `cat setport.sh`, rồi `grep PORT .env`. File có bị đổi không?', 'Không có `-i`, sed chỉ in kết quả ra màn hình và không ghi gì vào file.', 'Thêm `-i`: `sed -i \'s/^sed /sed -i /\' setport.sh`, sau đó chạy `./setport.sh`.'],
    fix: ['cat setport.sh', 'grep PORT .env', "sed -i 's/^sed /sed -i /' setport.sh", './setport.sh', 'grep PORT .env'],
    cause: 'sed mặc định chỉ in ra stdout, không đụng file nguồn. Muốn sửa tại chỗ phải dùng `-i`. Thông báo của script ("đã đổi") không chứng minh điều gì: luôn xác nhận bằng `grep` hoặc `diff`.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/setport.sh', SETPORT.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { return /^PORT=4000$/m.test(ftxt(s, s.home + '/lab/.env')); }
  },
  {
    id: 'tx2d2', title: 'sed báo unknown option to s khi đổi đường dẫn',
    host: 'vps', user: 'haidangphan',
    symptom: L("$ sed -i 's/root /var/www/html;/root /srv/www/tutor;/' site.conf", "sed: couldn't open file ww/html;/root /srv/www/tutor;/: No such file or directory", '', '$ sed -i "s/var/www/html/srv/tutor/" site.conf', "sed: -e expression #1, char 11: unknown option to `s'"),
    story: 'Bạn muốn đổi `root /var/www/html;` thành `root /srv/www/tutor;` trong `site.conf`. Các lần thử đều báo lỗi vì đường dẫn chứa nhiều dấu `/`.',
    goal: '`site.conf` có dòng `root /srv/www/tutor;` và không còn `/var/www/html`.',
    hints: ['Đếm các dấu `/` trong lệnh. `s` mong đợi đúng ba dấu phân cách.', 'Mỗi `/` trong đường dẫn bị sed hiểu là dấu phân cách. Có hai cách: thoát bằng `\\/` hoặc đổi dấu phân cách.', 'Dùng `|`: `sed -i \'s|/var/www/html|/srv/www/tutor|\' site.conf`, rồi `grep root site.conf`.'],
    fix: ["sed -i 's|/var/www/html|/srv/www/tutor|' site.conf", 'grep root site.conf'],
    cause: 'Dấu phân cách của `s` có thể là ký tự bất kỳ. Khi đường dẫn có `/`, chọn `|` hoặc `#` thay vì thoát từng dấu. Đó là lỗi thường gặp nhất khi dùng sed với đường dẫn.',
    setup: function (s) { base(s); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/site.conf'); return /root \/srv\/www\/tutor;/.test(t) && !/\/var\/www\/html/.test(t); }
  },
  {
    id: 'tx2d3', title: 'Đã đổi PermitRootLogin nhưng root vẫn đăng nhập được',
    host: 'vps', user: 'haidangphan',
    symptom: L("$ sed -i 's/PermitRootLogin yes/PermitRootLogin no/' sshd_config", '$ echo $?', '0', '', '$ grep -n Permit sshd_config', '4:#PermitRootLogin prohibit-password', '', '(không có dòng PermitRootLogin no nào)'),
    story: 'Bạn chạy sed để cấm root đăng nhập SSH. Lệnh thành công (mã 0) nhưng file không có dòng `PermitRootLogin no`. Vì mẫu thấy "yes" không tồn tại nên sed im lặng không làm gì.',
    goal: '`sshd_config` có đúng một dòng `PermitRootLogin no` (không còn dòng `#PermitRootLogin ...`).',
    hints: ['Chạy `grep -n PermitRootLogin sshd_config`. Dòng đó thực sự viết gì?', 'Mẫu `PermitRootLogin yes` không có trong file. Dòng thật là `#PermitRootLogin prohibit-password`: bị comment và giá trị khác.', 'Viết mẫu theo "đặt giá trị bất kể": `sed -i \'s/^#\\?PermitRootLogin.*/PermitRootLogin no/\' sshd_config`.'],
    fix: ['grep -n PermitRootLogin sshd_config', "sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' sshd_config", 'grep -n PermitRootLogin sshd_config'],
    cause: 'sed không báo lỗi khi mẫu không khớp, nên lệnh "thành công" mà không đổi gì. Dòng cấu hình mặc định thường bị comment và có giá trị khác. Viết mẫu `^#\\?KEY.*` để đặt giá trị bất kể trạng thái hiện tại, rồi luôn `grep` lại để xác nhận.',
    setup: function (s) { base(s); },
    check: function (s) { var t = ftxt(s, s.home + '/lab/sshd_config'); return (t.match(/^PermitRootLogin no$/gm) || []).length === 1 && !/^#PermitRootLogin/m.test(t); }
  },
  {
    id: 'tx2d4', title: 'Đổi cổng 3000 sang 4000 làm hỏng cả timeout và comment', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L("$ sed -i.bak 's/3000/4000/g' site.conf", '$ grep -n 4000 site.conf', '12:        # cổng cũ 4000', '13:        proxy_pass http://127.0.0.1:4000;', '14:        proxy_read_timeout 4000s;', '', '(timeout bị đổi từ 3000s thành 4000s, comment cũng mất ý nghĩa)'),
    story: 'Bạn đổi cổng upstream bằng `s/3000/4000/g` cho nhanh. Nó đổi luôn giá trị `proxy_read_timeout 3000s` và dòng ghi chú. Bản gốc còn trong `site.conf.bak`.',
    goal: 'Khôi phục từ `site.conf.bak` rồi chỉ đổi **dòng `proxy_pass`** sang cổng 4000: `proxy_read_timeout 3000s` và `# cổng cũ 3000` phải về nguyên.',
    hints: ['`diff site.conf.bak site.conf` cho thấy các dòng bị đổi ngoài ý muốn.', 'Đầu tiên khôi phục: `cp site.conf.bak site.conf`. Sau đó làm lại thật cụ thể, neo vào `proxy_pass`.', "`sed -i 's|proxy_pass http://127.0.0.1:3000|proxy_pass http://127.0.0.1:4000|' site.conf`, rồi `diff site.conf.bak site.conf` chỉ được hiện một dòng khác."],
    fix: ['diff site.conf.bak site.conf', 'cp site.conf.bak site.conf', "sed -i 's|proxy_pass http://127.0.0.1:3000|proxy_pass http://127.0.0.1:4000|' site.conf", 'diff site.conf.bak site.conf'],
    cause: 'Mẫu ngắn như `3000` khớp ở mọi nơi nó xuất hiện: comment, timeout, số lớn hơn (`30000`). Mẫu phải đủ cụ thể để chỉ chọn đúng nơi cần sửa, hoặc giới hạn phạm vi bằng địa chỉ. Luôn xem `diff` sau khi sửa: nếu có nhiều dòng khác hơn dự kiến thì dừng lại.',
    setup: function (s) {
      base(s, { setup: function (s2) {
        var orig = C.TXT.SITE.slice(); orig.splice(13, 0, '        proxy_read_timeout 3000s;');
        s2.fs.put(s2.home + '/lab/site.conf.bak', orig.join('\n') + '\n', { owner: s2.user, mode: 420 });
        s2.fs.put(s2.home + '/lab/site.conf', orig.join('\n').replace(/3000/g, '4000') + '\n', { owner: s2.user, mode: 420 });
      } });
    },
    check: function (s) { var t = ftxt(s, s.home + '/lab/site.conf'); return /proxy_pass http:\/\/127\.0\.0\.1:4000;/.test(t) && /proxy_read_timeout 3000s;/.test(t) && /# cổng cũ 3000/.test(t); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
