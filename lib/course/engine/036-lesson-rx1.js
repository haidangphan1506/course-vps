(function (G) {
'use strict';
/* Chương rx1: biểu thức chính quy (regex). Đặt ngay sau chương grep. */
var V = G.VPS, C = G.COURSE, L = C.L, A = C.A, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt;

var DATA = {
  'contacts.txt': ['Nguyễn An <an@example.com> 0912345678', 'Bình Trần <binh.tran@example.com> 0987-654-321', 'Châu Lê <chau_le@school.edu.vn> +84 90 123 4567', 'Dũng <dung@@example.com> 091234567', 'Hà Phạm <ha.pham@example> 0356789012', 'admin@tutor.haiphan.org 0243 123 4567'],
  'dates.txt': ['2026-10-27', '27/10/2026', '2026-13-45', '10-27-2026', '2026/10/27', 'hạn nộp: 2026-11-05 lúc 23:59', 'ngày 5 tháng 3 năm 2026'],
  'versions.txt': ['v1.2.3', '2.10.0', '1.2', 'v10.20.30-beta.1', '1.2.3.4', 'latest', 'node 22.14.0 và npm 10.9.2'],
  'ips.txt': ['192.168.1.10', '10.0.0.256', '999.1.1.1', '8.8.8.8', '1.2.3', '203.0.113.5', 'server 10.0.0.11 up', '::1'],
  'words.txt': ['hello', 'book', 'committee', 'abcabc', 'banana', 'level', 'moon', 'sky', 'Ana', 'aaa', 'abab', 'xyzzy'],
  'ids.txt': ['ORD-2026-0001', 'ord-2026-12', 'INV_2026_3', 'ORD-2026-0002 paid', '550e8400-e29b-41d4-a716-446655440000', 'not-a-uuid-1234', 'ORD-26-0003']
};
function base(s, o) {
  o = o || {};
  C.TXT.base(s, {
    setup: function (s2, l) {
      var own = { owner: s2.user, mode: 420 };
      Object.keys(DATA).forEach(function (k) { s2.fs.put(s2.home + '/lab/' + k, DATA[k].join('\n') + '\n', own); });
      if (o.setup) o.setup(s2, l);
    },
    setup2: o.setup2
  });
}
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
/* có lệnh grep thành công trên file và khớp mọi regex */
function G_(file) {
  var res = Array.prototype.slice.call(arguments, 1);
  return function (s) {
    return s.hist.some(function (h) {
      if (h.code !== 0 || !/^grep /.test(h.cmd) || h.cmd.indexOf(file) < 0) return false;
      for (var i = 0; i < res.length; i++) if (!res[i].test(h.cmd)) return false;
      return true;
    });
  };
}
function runq(s, cmd) { var h = s.hist.length, cwd = s.cwd, o = null; try { o = s.run('cd ' + s.home + '/lab && ' + cmd); } catch (e) {} s.hist.length = h; s.cwd = cwd; return o ? String(o.out || '') : ''; }

var T = {
  id: 'rx1', group: 'Công cụ văn bản', short: 'Regex',
  title: 'Biểu thức chính quy (regex)',
  dek: 'Đọc và viết regex một cách có phương pháp: ký tự thường và siêu ký tự, neo, lớp ký tự, lượng từ, nhóm và tham chiếu ngược, tham lam và lười, nhìn trước/sau; dùng ở grep, sed, awk, bash và find; công thức IP, email, ngày, phiên bản và cách gỡ lỗi một mẫu.'
};
C.insertAfter('tx1', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Regex là gì và ba "phương ngữ"', body: [
    '**Biểu thức chính quy** (regular expression, regex) là một ngôn ngữ nhỏ để mô tả **hình dạng của chuỗi**: "bốn chữ số, một dấu gạch, hai chữ số...". Công cụ dùng nó duyệt văn bản và báo chỗ khớp. Một mẫu tốt vừa **khớp** thứ bạn muốn, vừa **không khớp** thứ bạn không muốn.',
    { tbl: [['Phương ngữ', 'Dùng ở đâu', 'Đặc điểm'], ['**BRE** (cơ bản)', '`grep`, `sed` mặc định', '`+ ? | ( ) { }` là ký tự thường; muốn có nghĩa đặc biệt phải thêm `\\` (`\\+`, `\\|`, `\\(\\)`, `\\{\\}`)'], ['**ERE** (mở rộng)', '`grep -E`, `sed -E`, `awk`, `egrep`', '`+ ? | ( ) { }` có nghĩa đặc biệt ngay, dễ đọc hơn: **nên dùng**'], ['**PCRE** (kiểu Perl)', '`grep -P`, Perl, Python, JavaScript (gần giống)', 'Thêm `\\d \\w \\s`, lười `*?`, nhìn trước/sau `(?=...)`, nhóm không bắt `(?:...)`']] },
    { pre: ['echo "order 1001 paid" | grep -oE "[0-9]+"        # -o chỉ in phần khớp: thấy ngay mẫu bắt gì', 'grep -E "ERROR|WARN" app.log                     # ERE', 'grep -P "\\d{4}-\\d{2}" dates.txt                  # PCRE'], cap: 'Cách thử nhanh một mẫu' },
    { note: 'Mẹo kiểm thử: dùng `grep -o` để **thấy chính xác** mẫu của bạn bắt được gì, thay vì chỉ thấy cả dòng. Nó cho biết ngay mẫu quá rộng hay quá hẹp.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Ký tự thường, siêu ký tự và dấu thoát', body: [
    'Phần lớn ký tự trong mẫu khớp **chính nó**: `error` khớp đúng chữ `error`. Một số ký tự là **siêu ký tự** (metacharacter) có nghĩa riêng:',
    { tbl: [['Ký tự', 'Nghĩa', 'Muốn khớp chính nó'], ['`.`', 'Một ký tự bất kỳ (trừ xuống dòng)', '`\\.`'], ['`*`', 'Lặp 0 lần trở lên ký tự/nhóm đứng trước', '`\\*`'], ['`^` `$`', 'Đầu / cuối dòng', '`\\^` `\\$`'], ['`[ ]`', 'Lớp ký tự', '`\\[` `\\]`'], ['`\\`', 'Thoát: biến siêu ký tự thành thường (hoặc ngược lại)', '`\\\\`'], ['`+` `?` `|` `( )` `{ }`', 'Lặp ≥1, tuỳ chọn, hoặc, nhóm, số lần (ERE/PCRE)', '`\\+` `\\?` `\\|` `\\(` `\\)` `\\{` `\\}`']] },
    { pre: ["grep '192.0.2.4' access.log        # '.' khớp mọi ký tự: cũng khớp 192x0y2z4", "grep '192\\.0\\.2\\.4' access.log      # dấu chấm thật", "grep -F '192.0.2.4' access.log       # -F: không phải regex, mọi ký tự là thường", "grep -E 'a\\+b' file                  # ERE: \\+ là dấu cộng THẬT"], cap: 'Thoát ký tự' },
    { ul: ['Trong **BRE**, `\\+` `\\?` `\\|` là siêu ký tự (GNU), còn `+ ? |` là thường; trong **ERE** ngược lại. Đây là nguồn nhầm lẫn lớn nhất giữa `grep` và `grep -E`', 'Luôn đặt mẫu trong **nháy đơn** để shell không động vào `\\`, `$`, `*`, `!`', 'Nếu chỉ cần tìm một chuỗi nguyên văn, đừng viết regex: dùng `grep -F`'] },
    { note: 'Dấu `.` là lỗi kinh điển số một. `grep 192.0.2.4` khớp cả `192.0.2.44` lẫn `192x0y2z4`. Hãy thoát bằng `\\.` và/hoặc dùng `-w`/neo.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Neo và ranh giới: khớp ở đúng chỗ', body: [
    'Neo (anchor) không khớp ký tự nào, chỉ khớp một **vị trí**. Chúng quyết định "khớp ở đâu trong dòng".',
    { tbl: [['Neo', 'Vị trí', 'Ví dụ'], ['`^`', 'Đầu dòng', '`^2026-10` chỉ khớp dòng bắt đầu bằng 2026-10'], ['`$`', 'Cuối dòng', '`user=an$` dòng kết thúc bằng user=an'], ['`^$`', 'Dòng trống', '`grep -c "^$" file` đếm dòng trống'], ['`\\b`', 'Ranh giới từ (giữa ký tự từ và không-từ)', '`\\bnode\\b` khớp `node` nhưng không `nodejs`'], ['`\\<` `\\>`', 'Đầu / cuối từ (GNU)', '`\\<ha\\>` khớp từ `ha`'], ['`-w` / `-x`', 'Cờ của grep: nguyên từ / nguyên dòng', '`grep -x PORT=3000 .env`']] },
    { pre: ["grep '^#' .env                    # dòng chú thích", "grep -v '^$' .env                  # bỏ dòng trống", "grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' dates.txt   # CẢ dòng phải là ngày ISO", "grep -E '2026$' dates.txt          # kết thúc bằng 2026"], cap: 'Neo đầu, neo cuối' },
    { ul: ['Mẫu không neo khớp **bất kỳ đâu** trong dòng: `[0-9]{4}-[0-9]{2}-[0-9]{2}` cũng khớp `hạn nộp: 2026-11-05 lúc 23:59`', 'Muốn kiểm tra một giá trị **hợp lệ trọn vẹn** (một IP, một ngày), luôn neo `^...$`, hoặc dùng `grep -x`', '`\\b` tính theo "ký tự từ" gồm chữ, số, `_`; dấu `-` và `.` là ranh giới'] }
  ] },
  { tag: 'Cú pháp', title: 'Lớp ký tự: [ ] và các lớp POSIX', body: [
    '`[...]` khớp **đúng một** ký tự thuộc tập liệt kê. Đây là công cụ dùng nhiều nhất sau `.`.',
    { tbl: [['Mẫu', 'Khớp'], ['`[abc]`', 'a, b hoặc c'], ['`[a-z]` `[0-9]` `[A-Za-z0-9]`', 'Khoảng ký tự'], ['`[^aeiou]`', 'Một ký tự **không** phải nguyên âm (`^` đầu tiên trong `[ ]` là phủ định)'], ['`[[:digit:]]`', 'Chữ số (giống `[0-9]`)'], ['`[[:alpha:]]` `[[:alnum:]]`', 'Chữ cái / chữ và số (theo locale: gồm cả chữ có dấu tiếng Việt như `à ộ`)'], ['`[[:upper:]]` `[[:lower:]]`', 'Chữ hoa / chữ thường'], ['`[[:space:]]` `[[:blank:]]`', 'Mọi khoảng trắng (cả tab, xuống dòng) / chỉ dấu cách và tab'], ['`[[:punct:]]`', 'Dấu câu'], ['`[[:xdigit:]]`', 'Chữ số hex 0-9 a-f A-F']] },
    { pre: ["grep '[[:upper:]]' words.txt                # dòng có chữ hoa", "grep -E '^[^aeiou]+$' words.txt              # dòng toàn phụ âm: sky, xyzzy", "echo 'Hà Nội' | grep -oE '[[:alpha:]]+'     # Hà, Nội (tiếng Việt đầy đủ)", "echo 'Hà Nội' | grep -oE '[a-z]+'           # CHỈ 'i': [a-z] không có chữ có dấu"], cap: 'Lớp ký tự trong thực tế' },
    { ul: ['Bên trong `[ ]`, hầu hết siêu ký tự mất nghĩa: `[.*+]` khớp dấu chấm, sao, cộng. Ngoại lệ: `]` (đặt **ngay đầu**: `[]abc]`), `-` (đặt **cuối**: `[a-z-]`), `^` (không đặt đầu), `\\` (trong POSIX là thường)', '`[[:digit:]]` cần **hai** cặp ngoặc: một cho lớp POSIX, một cho tập ký tự. `[:digit:]` đứng một mình là lỗi', 'Dữ liệu tiếng Việt: dùng `[[:alpha:]]` thay vì `[a-zA-Z]`'] },
    { note: '`\\d` **không tồn tại** trong BRE/ERE (GNU grep coi `\\d` là chữ `d`). `\\w`, `\\s` chạy được ở GNU grep/sed nhưng không phải chuẩn POSIX nên không mang đi mọi máy. Đáng tin hơn: `[0-9]`, `[[:alnum:]_]`, `[[:space:]]`, hoặc `grep -P`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Lượng từ: lặp bao nhiêu lần', body: [
    { tbl: [['ERE', 'BRE', 'Nghĩa'], ['`x*`', '`x*`', '0 lần trở lên'], ['`x+`', '`x\\+`', '1 lần trở lên'], ['`x?`', '`x\\?`', '0 hoặc 1 lần (tuỳ chọn)'], ['`x{3}`', '`x\\{3\\}`', 'Đúng 3 lần'], ['`x{2,}`', '`x\\{2,\\}`', 'Từ 2 lần trở lên'], ['`x{2,4}`', '`x\\{2,4\\}`', 'Từ 2 đến 4 lần']] },
    { pre: ["grep -E '^.{4}$' words.txt                 # đúng 4 ký tự: book, moon, abab", "grep -E 'o{2}' words.txt                  # hai chữ o liền nhau", "grep -E 'colou?r' file                    # color hoặc colour", "grep -oE '[0-9]+' <<< 'a1b22c333'          # 1, 22, 333", "grep -oE '[0-9]{1,3}' <<< '12345'          # 123 rồi 45"], cap: 'Lượng từ' },
    { ul: ['Lượng từ áp dụng cho **một đơn vị** ngay trước nó: một ký tự, một lớp `[ ]`, hoặc một nhóm `( )`. `ab*` là `a` rồi nhiều `b`; `(ab)*` là lặp cả cụm `ab`', '**Tham lam (greedy)**: lượng từ cố khớp **nhiều nhất** có thể. `a.*b` trên `a1b2b` khớp cả `a1b2b`, không dừng ở `b` đầu tiên', '`.*` rất hay dùng nhưng cũng rất hay "nuốt quá tay". Ưu tiên lớp phủ định: `<[^>]*>` thay cho `<.*>`'] },
    { note: 'Cẩn thận với `x*`: nó khớp được cả **chuỗi rỗng**. `grep "a*"` khớp mọi dòng (kể cả dòng không có `a`) vì 0 chữ `a` vẫn là khớp. Muốn "có ít nhất một", dùng `+`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Nhóm, lựa chọn và tham chiếu ngược', body: [
    { tbl: [['Cú pháp (ERE)', 'Tác dụng', 'Ví dụ'], ['`( ... )`', 'Gom thành nhóm: áp lượng từ cho cả cụm, và **ghi nhớ** phần khớp', '`(ab){2}` khớp `abab`'], ['`a|b`', 'Lựa chọn: a hoặc b', '`^(ORD|INV)` bắt đầu bằng ORD hoặc INV'], ['`\\1` `\\2`', '**Tham chiếu ngược**: khớp lại đúng chuỗi mà nhóm 1, 2 đã bắt', '`(.)\\1` hai ký tự giống nhau liền kề'], ['`(?: ... )`', 'Nhóm không ghi nhớ (chỉ PCRE)', '`(?:ab)+`']] },
    { pre: ["grep -E '(.)\\1' words.txt               # chữ lặp liền nhau: hello, book, committee, moon, aaa, xyzzy", "grep -E '^(.)(.).\\2\\1$' words.txt      # đối xứng 5 ký tự: level", "grep -E '(ab){2}' words.txt              # abab", "grep -E '^(ORD|INV)' ids.txt             # mã đơn hoặc mã hoá đơn"], cap: 'Nhóm và tham chiếu ngược' },
    'Nhóm còn dùng để **thay thế** trong `sed`: phần được bắt có thể dùng lại ở vế phải bằng `\\1`, `\\2`...',
    { pre: ["echo 2026-10-27 | sed -E 's/([0-9]{4})-([0-9]{2})-([0-9]{2})/\\3\\/\\2\\/\\1/'     # 27/10/2026", "echo 'hello world' | sed -E 's/(hello) (world)/\\2 \\1/'                              # world hello"], cap: 'Đảo thứ tự bằng nhóm' },
    { note: 'Tham chiếu ngược `\\1` làm regex mạnh hơn "ngôn ngữ chính quy" thuần (không phải DFA đơn giản) và có thể rất chậm trên chuỗi dài. Dùng vừa phải.', kind: 'tip' }
  ] },
  { tag: 'Nâng cao', title: 'Lười, nhìn trước/sau với grep -P', body: [
    'Với `grep -P` (PCRE) bạn có thêm vài công cụ quan trọng. Chỉ dùng khi ERE không đủ.',
    { tbl: [['PCRE', 'Nghĩa', 'Ví dụ'], ['`\\d` `\\w` `\\s`', 'Chữ số / ký tự từ / khoảng trắng (`\\d` chỉ có ở đây)', '`\\d{4}-\\d{2}-\\d{2}`'], ['`*?` `+?` `??`', '**Lười (lazy)**: khớp ít nhất có thể', '`<b>.*?</b>` bắt từng thẻ riêng'], ['`(?=...)`', 'Nhìn **trước** (lookahead): theo sau phải là ...', '`[a-z.]+(?=@)` phần trước dấu @'], ['`(?<=...)`', 'Nhìn **sau** (lookbehind): phía trước phải là ...', '`(?<=user=)[a-z]+` giá trị sau `user=`'], ['`(?!...)` `(?<!...)`', 'Phủ định của hai loại trên', '`ERROR(?!.*retry)`']] },
    { pre: ["echo '<b>x</b><b>y</b>' | grep -oE '<b>.*</b>'      # tham lam: <b>x</b><b>y</b> (một khối)", "echo '<b>x</b><b>y</b>' | grep -oP '<b>.*?</b>'      # lười: <b>x</b> rồi <b>y</b>", "grep -oP '(?<=user=)[a-z]+' app.log                  # chỉ lấy tên user", "grep -oP '(?<=\\+84 )\\d+' contacts.txt                # số sau +84", "echo '<b>x</b><b>y</b>' | grep -oE '<b>[^<]*</b>'    # cách ERE: dùng lớp phủ định"], cap: 'Lười và nhìn sau' },
    { ul: ['`lookbehind` trong PCRE yêu cầu độ dài cố định (hoặc hữu hạn); `lookahead` thì không giới hạn', 'Phần trong `(?=...)` và `(?<=...)` **không** nằm trong kết quả của `-o`: đó là lý do chúng hay dùng để "cắt" chuỗi', 'Nếu mẫu ERE với lớp phủ định (`[^>]*`) giải quyết được thì hãy dùng nó: chạy trên mọi máy, không dính `-P`'] }
  ] },
  { tag: 'Thực hành', title: 'Regex ở các công cụ khác', body: [
    { tbl: [['Công cụ', 'Cách dùng', 'Phương ngữ'], ['`grep`', '`grep -E \'mẫu\' file`', 'BRE (mặc định), ERE (`-E`), PCRE (`-P`)'], ['`sed`', '`sed -E \'s/mẫu/thay/g\'`', 'BRE, ERE với `-E`; tham chiếu `\\1` ở vế phải'], ['`awk`', '`awk \'/mẫu/ {print $1}\'` hoặc `$3 ~ /mẫu/`', 'ERE (gawk hoặc mawk)'], ['bash `[[ ]]`', '`[[ $v =~ ^v([0-9]+)\\.([0-9]+) ]]`', 'ERE; nhóm lưu trong `BASH_REMATCH`'], ['`find`', '`find . -regex \'.*/a[a-z]*\\.log\'`', 'Khớp **toàn bộ đường dẫn**, không chỉ tên file'], ['`less`', 'gõ `/mẫu` để tìm, `n` để tìm tiếp', 'BRE-ish'], ['`journalctl`', '`journalctl -g "mẫu"`', 'PCRE']] },
    { pre: ["[[ \"v1.2.3\" =~ ^v([0-9]+)\\.([0-9]+) ]] && echo \"${BASH_REMATCH[1]}.${BASH_REMATCH[2]}\"   # 1.2", "awk '/[0-9]+\\/[0-9]+\\/[0-9]+/' dates.txt        # dòng có ngày kiểu dd/mm/yyyy", "awk '$0 ~ /^[0-9]{4}-/' dates.txt                # bằng toán tử ~", "find . -regex '.*/a[a-z]*\\.log'                  # app.log auth.log access.log"], cap: 'Cùng một ngôn ngữ, nhiều nơi dùng' },
    { ul: ['Trong `[[ ... =~ ... ]]`, **không** đặt mẫu trong nháy (nháy làm nó thành chuỗi nguyên văn). Nếu mẫu dài, đặt vào biến: `re=\'^v([0-9]+)\'; [[ $v =~ $re ]]`', 'Trong `awk`, mẫu đặt giữa hai dấu `/ /`; nếu mẫu có `/`, thoát bằng `\\/`', '`sed -E` và `grep -E` dùng chung kiến thức: mẫu bạn đã kiểm bằng `grep -oE` có thể dán sang `sed -E` ở vế trái'] }
  ] },
  { tag: 'Công thức', title: 'Công thức hay dùng và giới hạn của regex', body: [
    { tbl: [['Cần khớp', 'Mẫu ERE', 'Lưu ý'], ['Số nguyên', '`[0-9]+`', 'Thêm `-?` cho số âm: `-?[0-9]+`'], ['Ngày ISO', '`[0-9]{4}-[0-9]{2}-[0-9]{2}`', 'Chỉ kiểm hình dạng: `2026-13-45` vẫn khớp'], ['Phiên bản', '`v?[0-9]+\\.[0-9]+\\.[0-9]+`', 'Bản `1.2.3.4` cũng chứa chuỗi này; thêm neo/`\\b` nếu cần'], ['IPv4 đơn giản', '`^[0-9]{1,3}(\\.[0-9]{1,3}){3}$`', 'Vẫn cho qua `999.1.1.1`'], ['IPv4 chặt', '`^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$`', 'Mỗi nhóm 0-255'], ['Email thường dùng', '`[[:alnum:]._+-]+@[[:alnum:].-]+\\.[[:alpha:]]{2,}`', 'Đủ để **trích**; không phải bộ kiểm tra chuẩn RFC'], ['UUID', '`^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$`', 'Thêm `-i` nếu có chữ hoa'], ['Dòng chú thích hoặc trống', '`^[[:space:]]*(#|$)`', 'Dùng với `-v` để thấy cấu hình thật'], ['Mã HTTP 5xx trong log', '` 5[0-9]{2} `', 'Có dấu cách hai đầu để không khớp số byte']] },
    { note: 'Regex kiểm tra **hình dạng**, không kiểm tra **ý nghĩa**. `999.1.1.1` có hình dạng IP; tháng `13` có hình dạng ngày. Muốn đúng tuyệt đối thì viết mẫu chặt hơn hoặc kiểm giá trị bằng code (`date -d`, `ipcalc`, thư viện) sau bước regex.', kind: 'warn' },
    { ul: ['**Không** dùng regex để phân tích HTML, JSON, YAML hay cấu hình lồng nhau; dùng `jq`, `yq`, `nginx -T`, hoặc parser ngôn ngữ lập trình', 'Mẫu quá phức tạp thì tách thành nhiều bước: `grep` thô rồi `grep` tinh, hoặc chia `-e` nhiều mẫu nhỏ', 'Đặt tên có ý nghĩa cho mẫu trong script: `ip_re=\'^...$\'`, kèm chú thích ví dụ khớp và không khớp'] }
  ] },
  { tag: 'Quy trình', title: 'Xây và gỡ lỗi một regex', body: [
    'Đừng viết cả mẫu rồi cầu may. Xây **từng lớp** và nhìn kết quả sau mỗi lớp:',
    { pre: ["# mục tiêu: lấy số điện thoại di động VN trong contacts.txt", "grep -oE '[0-9]+' contacts.txt                        # 1) thấy mọi dãy số", "grep -oE '0[39][0-9]+' contacts.txt                   # 2) thu hẹp: bắt đầu 03/09", "grep -oE '0[39][0-9]{8}' contacts.txt                 # 3) đúng 10 chữ số", "grep -oE '\\b0[39][0-9]{8}\\b' contacts.txt            # 4) không dính vào số dài hơn"], cap: 'Thu hẹp dần' },
    { tbl: [['Triệu chứng', 'Nguyên nhân thường gặp', 'Cách sửa'], ['Khớp quá nhiều', 'Thiếu neo; `.*` tham lam; `.` chưa thoát', 'Thêm `^ $`/`-w`/`\\b`, dùng lớp phủ định, thoát `\\.`'], ['Không khớp gì', 'Dùng `+ | ( )` trong BRE; dùng `\\d` trong ERE; quên `-E`', 'Thêm `-E`, đổi `\\d` thành `[0-9]`'], ['`Unmatched ( or \\(`', 'Ngoặc không cân', 'Đếm lại cặp ngoặc; thoát ngoặc muốn khớp nguyên văn'], ['`Invalid preceding regular expression`', 'Lượng từ đứng đầu (`*abc`, `+x`)', 'Thêm thứ gì đó trước lượng từ, hoặc thoát nó'], ['Mẫu có `$HOME` hoặc `!` bị đổi', 'Shell đã thay thế trước khi grep thấy', 'Nháy đơn'], ['Chạy rất chậm', 'Lượng từ lồng nhau `(a+)+`, nhiều `.*`', 'Viết mẫu cụ thể hơn, neo đầu, dùng `-F` nếu được']] },
    { ul: ['Luôn thử mẫu với **cả ví dụ nên khớp lẫn ví dụ không nên khớp**', '`grep -c` cho biết số dòng, `grep -o` cho biết phần khớp, `grep -n` cho biết vị trí: ba cái nhìn cho một mẫu', 'Khi thay thế bằng `sed -i`, hãy thử không `-i` trước và xem kết quả'] }
  ] }
];

T.quiz = C.QZ(2, [
  ['Trong regex, `.` nghĩa là gì?', 'Một ký tự bất kỳ', ['Chính dấu chấm', 'Cuối dòng', 'Không hoặc nhiều ký tự'], 'Muốn khớp dấu chấm thật phải viết `\\.` (hoặc dùng `grep -F`). Vì vậy `192.0.2.4` còn khớp cả `192x0y2z4`.'],
  ['`grep \'ERROR|WARN\' app.log` (không có `-E`) cho kết quả gì?', 'Không dòng nào: trong BRE `|` là ký tự thường', ['Mọi dòng có ERROR hoặc WARN', 'Lỗi cú pháp', 'Chỉ dòng có ERROR'], 'Trong BRE phải viết `ERROR\\|WARN`. Dùng `grep -E \'ERROR|WARN\'` cho gọn.'],
  ['Mẫu nào kiểm tra **cả dòng** là một ngày dạng `yyyy-mm-dd`?', '`^[0-9]{4}-[0-9]{2}-[0-9]{2}$` (với `-E`)', ['`[0-9]{4}-[0-9]{2}-[0-9]{2}` (không neo)', '`.{4}-.{2}-.{2}`', '`[0-9]*-[0-9]*-[0-9]*`'], 'Không neo thì mẫu khớp bất kỳ chỗ nào trong dòng, ví dụ `hạn nộp: 2026-11-05 lúc 23:59`.'],
  ['`[^aeiou]` khớp điều gì?', 'Một ký tự không phải nguyên âm thường', ['Dòng không bắt đầu bằng nguyên âm', 'Chuỗi `^aeiou`', 'Nguyên âm ở đầu dòng'], '`^` ngay sau `[` phủ định tập. Nó vẫn phải khớp **một** ký tự (nên dòng trống không khớp `[^aeiou]`).'],
  ['Vì sao `grep -oE "[a-z]+"` trên `Hà Nội` chỉ ra `i`?', '`[a-z]` chỉ gồm chữ Latin thường không dấu; `H`, `N` là chữ hoa còn `à`, `ộ` có dấu nên nằm ngoài', ['grep không đọc được UTF-8', 'Do thiếu cờ `-i`', 'Do `-o` chỉ in một ký tự'], 'Dùng `[[:alpha:]]+` (theo locale) để khớp chữ cái tiếng Việt: `Hà`, `Nội`.'],
  ['Trong `grep -E`, mẫu `(.)\\1` khớp điều gì?', 'Hai ký tự giống nhau đứng liền nhau (như `ll` trong `hello`)', ['Mọi dòng có ít nhất một ký tự', 'Ký tự `\\` theo sau một dấu chấm', 'Một ký tự và số 1'], '`\\1` là tham chiếu ngược tới nhóm 1: khớp lại đúng chuỗi mà nhóm 1 vừa bắt.'],
  ['`echo \'<b>x</b><b>y</b>\' | grep -oE \'<b>.*</b>\'` in ra?', 'Một khối `<b>x</b><b>y</b>` vì `.*` tham lam', ['Hai dòng `<b>x</b>` và `<b>y</b>`', 'Không gì cả', '`<b>` và `</b>`'], 'Để tách từng thẻ: `grep -oP \'<b>.*?</b>\'` (lười) hoặc `grep -oE \'<b>[^<]*</b>\'` (lớp phủ định, chạy mọi nơi).'],
  ['Mẫu `\\d{4}` trong `grep -E` có làm việc như mong đợi không?', 'Không. ERE không có `\\d`; dùng `[0-9]{4}` hoặc `grep -P`', ['Có, mọi regex đều có `\\d`', 'Có nhưng chỉ khi thêm `-i`', 'Chỉ khi đặt trong nháy kép'], '`\\d` là viết tắt kiểu Perl (PCRE), không thuộc POSIX; trong `grep -E` nó chỉ là chữ `d`. (`\\w`, `\\s` có ở GNU grep nhưng không portable.)'],
  ['Cách viết nào lấy phần **sau** `user=` mà không kèm chữ `user=` trong kết quả?', '`grep -oP \'(?<=user=)[a-z]+\' app.log`', ['`grep -oE \'user=[a-z]+\' app.log`', '`grep -w user app.log`', '`grep -o user= app.log`'], 'Lookbehind `(?<=user=)` yêu cầu tiền tố nhưng không đưa nó vào phần khớp (chỉ có trong `-P`).'],
  ['Trong bash, `[[ $v =~ ^v([0-9]+) ]]` thì số trong nhóm 1 nằm ở đâu?', '`${BASH_REMATCH[1]}`', ['`$1`', '`$MATCH`', '`${REGEX[0]}`'], '`BASH_REMATCH[0]` là toàn bộ phần khớp, `[1]`, `[2]`... là các nhóm. Không đặt mẫu trong nháy.'],
  ['`find . -regex \'a.*\\.log\'` không tìm thấy gì. Vì sao?', '`-regex` khớp **toàn bộ đường dẫn** (`./app.log`), không chỉ tên file', ['`find` không hỗ trợ `.*`', 'Phải dùng `-iregex`', 'Cần thêm `-print`'], 'Dùng `\'.*/a.*\\.log\'` hoặc `-name \'a*.log\'` nếu chỉ cần so tên.'],
  ['Mẫu IPv4 `^[0-9]{1,3}(\\.[0-9]{1,3}){3}$` có kiểm tra giá trị từng nhóm ≤ 255 không?', 'Không, `999.1.1.1` vẫn khớp; cần mẫu chặt hơn hoặc kiểm giá trị bằng code', ['Có, vì `{1,3}` giới hạn 255', 'Có, nhờ neo `^$`', 'Chỉ khi thêm `-w`'], 'Regex kiểm hình dạng. Mẫu chặt: `(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])` cho mỗi nhóm.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Thư mục `~/lab` có thêm `dates.txt`, `contacts.txt`, `versions.txt`, `ips.txt`, `words.txt`, `ids.txt`. Dùng `.` để khớp cả `2026-10` lẫn `2026/10`: tìm `2026.10` trong `dates.txt`.', hint: "grep '2026.10' dates.txt", check: OK(/^grep 2026\.10 dates\.txt$/) },
    { text: 'Thoát dấu chấm: tìm đúng `1.2.3` (dấu chấm thật) trong `versions.txt`.', hint: "grep '1\\.2\\.3' versions.txt", check: OK(/^grep 1\\\.2\\\.3 versions\.txt$/) },
    { text: 'Neo đầu dòng: các dòng của `dates.txt` bắt đầu bằng `2026`.', hint: "grep '^2026' dates.txt", check: OK(/^grep \^2026 dates\.txt$/) },
    { text: 'Neo cuối dòng: các dòng kết thúc bằng `2026`.', hint: "grep '2026$' dates.txt", check: OK(/^grep 2026\$ dates\.txt$/) },
    { text: 'Chỉ lấy dòng **cả dòng** là ngày ISO `yyyy-mm-dd` (dùng `-x`, ERE).', hint: "grep -xE '[0-9]{4}-[0-9]{2}-[0-9]{2}' dates.txt", check: G_('dates.txt', /^grep (-\w+ )*-\w*x/, /\{4\}-/) },
    { text: 'Tìm từ nguyên `ha` (đầu và cuối từ, `\\<` `\\>`) trong `contacts.txt`.', hint: "grep '\\<ha\\>' contacts.txt", check: OK(/^grep \\<ha\\> contacts\.txt$/) },
    { text: 'Tìm từ `node` bằng ranh giới từ `\\b` trong `versions.txt`.', hint: "grep '\\bnode\\b' versions.txt", check: OK(/^grep (\\bnode\\b|-w node) versions\.txt$/) },
    { text: 'Dòng nào trong `words.txt` có **chữ hoa**? (lớp POSIX).', hint: "grep '[[:upper:]]' words.txt", check: OK(/^grep \[\[:upper:\]\] words\.txt$/) },
    { text: 'Lớp phủ định: các từ trong `words.txt` **không có nguyên âm** `aeiou` (phải ra `sky`, `xyzzy`).', hint: "grep -E '^[^aeiou]+$' words.txt", check: G_('words.txt', /\[\^aeiou\]/) },
    { text: 'Từ có **đúng 4 ký tự** trong `words.txt`.', hint: "grep -E '^.{4}$' words.txt", check: G_('words.txt', /\{4\}/) },
    { text: 'Có hai chữ `o` liền nhau (lượng từ `{2}`).', hint: "grep -E 'o{2}' words.txt", check: G_('words.txt', /o(\{2\}|\\\{2\\\})/) },
    { text: 'Có từ hai chữ `a` trở lên liền nhau (`{2,}`).', hint: "grep -E 'a{2,}' words.txt", check: G_('words.txt', /a(\{2,\}|\\\{2,\\\})/) },
    { text: 'Nhóm lặp: từ chứa `abab` (nhóm `(ab)` lặp 2 lần).', hint: "grep -E '(ab){2}' words.txt", check: G_('words.txt', /\(ab\)\{2\}/) },
    { text: 'Tham chiếu ngược: từ có **hai ký tự giống nhau liền nhau**.', hint: "grep -E '(.)\\1' words.txt", check: G_('words.txt', /\(\.\)\\1/) },
    { text: 'Tham chiếu ngược nâng cao: từ **đối xứng 5 ký tự** (phải ra `level`).', hint: "grep -E '^(.)(.).\\2\\1$' words.txt", check: G_('words.txt', /\\2\\1/) },
    { text: 'Lựa chọn: mã bắt đầu bằng `ORD` hoặc `INV` trong `ids.txt`.', hint: "grep -E '^(ORD|INV)' ids.txt", check: G_('ids.txt', /ORD\|INV/) },
    { text: 'Không phân biệt hoa thường: mã đơn dạng `ord-yyyy-số` (cả `ORD-` lẫn `ord-`), 4 chữ số năm.', hint: "grep -iE '^ord-[0-9]{4}-[0-9]+' ids.txt", check: G_('ids.txt', /^grep (-\w+ )*-\w*i/, /\{4\}/) },
    { text: 'Chỉ in phần khớp (`-o`): trích các địa chỉ email từ `contacts.txt` bằng lớp `[[:alnum:]._]`.', hint: "grep -oE '[[:alnum:]._]+@[[:alnum:].]+' contacts.txt", check: G_('contacts.txt', /-\w*o/, /@/) },
    { text: 'Trích số di động VN: 10 chữ số, đầu `03` hoặc `09`, nằm trọn một từ (`\\b`).', hint: "grep -oE '\\b0[39][0-9]{8}\\b' contacts.txt", check: G_('contacts.txt', /0\[39\]/) },
    { text: 'IPv4 **đơn giản**: bốn nhóm 1-3 chữ số cách nhau dấu chấm, cả dòng. Để ý `999.1.1.1` vẫn lọt.', hint: "grep -E '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$' ips.txt", check: G_('ips.txt', /\{1,3\}/) },
    { text: 'IPv4 **chặt**: mỗi nhóm 0-255 (`25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9]`). Kết quả không còn `999.1.1.1` và `10.0.0.256`.', hint: "grep -E '^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$' ips.txt", check: G_('ips.txt', /25\[0-5\]/) },
    { text: 'Trích phiên bản dạng `x.y.z` (có thể có `v` đứng trước) trong `versions.txt`.', hint: "grep -oE 'v?[0-9]+\\.[0-9]+\\.[0-9]+' versions.txt", check: G_('versions.txt', /v\?/) },
    { text: 'Tìm UUID trọn dòng trong `ids.txt` (`8-4-4-4-12` chữ số hex).', hint: "grep -E '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' ids.txt", check: G_('ids.txt', /\{8\}/, /\{12\}/) },
    { text: 'Dùng `grep -P` với `\\d`: trích ngày `yyyy-mm-dd` từ `dates.txt`.', hint: "grep -oP '\\d{4}-\\d{2}-\\d{2}' dates.txt", check: G_('dates.txt', /^grep (-\w+ )*-\w*P/, /\\d/) },
    { text: 'Lookbehind: chỉ lấy dãy số **sau** `+84 ` trong `contacts.txt`.', hint: "grep -oP '(?<=\\+84 )\\d+' contacts.txt", check: G_('contacts.txt', /\(\?<=/) },
    { text: 'Tham lam: thử `echo \'<b>x</b><b>y</b>\' | grep -oE \'<b>.*</b>\'` và nhận ra chỉ ra **một** khối.', hint: "echo '<b>x</b><b>y</b>' | grep -oE '<b>.*</b>'", check: OK(/^grep -oE <b>\.\*<\/b>$/) },
    { text: 'Lười: tách thành hai thẻ riêng bằng `.*?` với `-oP`.', hint: "echo '<b>x</b><b>y</b>' | grep -oP '<b>.*?</b>'", check: OK(/^grep -oP <b>\.\*\?<\/b>$/) },
    { text: 'Đổi `2026-10-27` thành `27/10/2026` bằng `sed -E` và các nhóm bắt.', hint: "echo 2026-10-27 | sed -E 's/([0-9]{4})-([0-9]{2})-([0-9]{2})/\\3\\/\\2\\/\\1/'", check: OK(/^sed -E s\/\(\[0-9\]\{4\}\)-\(\[0-9\]\{2\}\)-\(\[0-9\]\{2\}\)\/\\3/) },
    { text: 'Trong bash: tách `v1.2.3` bằng `[[ =~ ]]` rồi in `major.minor` từ `BASH_REMATCH` (phải in `1.2`).', hint: '[[ "v1.2.3" =~ ^v([0-9]+)\\.([0-9]+) ]] && echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"', check: OK(/^echo 1\.2$/) },
    { text: 'Dùng `awk` với regex: in các dòng của `dates.txt` có dạng ngày `dd/mm/yyyy` hoặc `yyyy/mm/dd` (số, dấu `/`, số, dấu `/`, số).', hint: "awk '/[0-9]+\\/[0-9]+\\/[0-9]+/' dates.txt", check: OK(/^awk .*\[0-9\]\+.* dates\.txt$/) },
    { text: 'Dùng `find -regex` (khớp toàn đường dẫn) để tìm các file `.log` có tên bắt đầu bằng `a`.', hint: "find . -regex '.*/a[a-z]*\\.log'", check: OK(/^find \. -regex /) },
    { text: 'Xem cấu hình thật của `.env`: bỏ dòng chú thích và dòng trống chỉ bằng một `grep -vE`.', hint: "grep -vE '^[[:space:]]*(#|$)' .env", check: G_('.env', /^grep (-\w+ )*-\w*v/, /\(#\|\$\)/) },
    { text: 'Đếm dòng trống trong `.env` bằng `^$`.', hint: "grep -c '^$' .env", check: OK(/^grep -c \^\$ \.env$/) },
    { text: 'Tập thử bẫy: `grep -E \'\\d\' dates.txt` **không khớp gì** (ERE không có `\\d`). Chạy nó để thấy mã thoát 1.', hint: "grep -E '\\d' dates.txt", check: FAIL(/^grep -E \\d dates\.txt$/) },
    { text: 'Chữ cái tiếng Việt: tách các từ trong chuỗi `Hà Nội` bằng lớp `[[:alpha:]]+` (phải ra `Hà` và `Nội`).', hint: "grep -oE '[[:alpha:]]+' <<< 'Hà Nội'", check: OK(/^grep -oE \[\[:alpha:\]\]\+$/) }
  ]
};

var CHECKIP = ['#!/bin/bash', '# kiểm tra một địa chỉ IPv4 trước khi thêm vào firewall', 'ip=$1', "if echo \"$ip\" | grep -qE '^[0-9.]+$'; then", '  echo "hợp lệ"', 'else', '  echo "không hợp lệ"', 'fi'];
var EXEMAIL = ['#!/bin/bash', '# trích email từ contacts.txt', 'grep -oE "[a-z]+@[a-z]+\\.[a-z]+" contacts.txt'];
var STRIP = ['#!/bin/bash', '# bỏ thẻ HTML, chỉ giữ chữ', "sed -E 's/<.*>//g' page.html"];
var NORM = ['#!/bin/bash', '# chuẩn hoá dd/mm/yyyy thành yyyy-mm-dd, các dòng khác giữ nguyên', "sed 's/(\\d{2})\\/(\\d{2})\\/(\\d{4})/\\3-\\2-\\1/' dates.txt"];

T.debugs = [
  {
    id: 'rx1d1', title: 'Bộ kiểm tra IP cho qua cả 999.1.1.1',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./check-ip.sh 8.8.8.8', 'hợp lệ', '$ ./check-ip.sh 999.1.1.1', 'hợp lệ', '$ ./check-ip.sh 1..2', 'hợp lệ'),
    story: 'Script `check-ip.sh` kiểm tra địa chỉ trước khi thêm vào danh sách chặn của firewall. Nó chấp nhận cả `999.1.1.1` lẫn `1..2` và sắp gây lỗi cấu hình.',
    goal: 'Chỉ chấp nhận IPv4 đúng: `8.8.8.8` hợp lệ; `999.1.1.1`, `10.0.0.256`, `1..2`, `1.2.3` không hợp lệ.',
    hints: ['Mẫu `^[0-9.]+$` cho phép những chuỗi nào? Thử `echo 1..2 | grep -E \'^[0-9.]+$\'`.', 'Cần đúng **4 nhóm** số, mỗi nhóm 0-255, cách nhau dấu chấm. `{3}` lặp nhóm "chấm + số", còn mỗi số là `25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9]`.', "Thay mẫu bằng `^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$` trong script, rồi thử lại 5 giá trị trên."],
    fix: [C.HCU('check-ip.sh', ['#!/bin/bash', 'ip=$1', "if echo \"$ip\" | grep -qE '^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$'; then", '  echo "hợp lệ"', 'else', '  echo "không hợp lệ"', 'fi']), './check-ip.sh 999.1.1.1', './check-ip.sh 8.8.8.8'],
    cause: '`^[0-9.]+$` chỉ nói "toàn chữ số và dấu chấm", không nói gì về số nhóm hay giá trị từng nhóm. Regex kiểm tra hình dạng; muốn chặn `256+` phải mô tả khoảng 0-255 bằng các nhánh `25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9]`, và neo `^$` để cả chuỗi phải khớp.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/check-ip.sh', CHECKIP.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) {
      var bad = ['999.1.1.1', '10.0.0.256', '1..2', '1.2.3', '1.2.3.4.5'], i;
      for (i = 0; i < bad.length; i++) if (!/không hợp lệ/.test(runq(s, './check-ip.sh ' + bad[i]))) return false;
      return /^hợp lệ/m.test(runq(s, './check-ip.sh 8.8.8.8')) && /^hợp lệ/m.test(runq(s, './check-ip.sh 203.0.113.5'));
    }
  },
  {
    id: 'rx1d2', title: 'Trích email ra thiếu và bị cắt cụt',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./extract-emails.sh', 'an@example.com', 'tran@example.com', 'le@school.edu', 'admin@tutor.haiphan', '', '(mong đợi: binh.tran@example.com, chau_le@school.edu.vn, admin@tutor.haiphan.org đầy đủ)'),
    story: 'Script trích email từ `contacts.txt` cho bản tin. Địa chỉ có dấu chấm, gạch dưới hoặc tên miền nhiều cấp bị cắt cụt, nên bản tin gửi nhầm địa chỉ.',
    goal: 'Output đúng 4 email đầy đủ: `an@example.com`, `binh.tran@example.com`, `chau_le@school.edu.vn`, `admin@tutor.haiphan.org`; hai dòng sai định dạng (`dung@@example.com`, `ha.pham@example`) không được xuất hiện.',
    hints: ['So sánh kết quả với `cat contacts.txt`. Phần nào của địa chỉ bị mất, và lớp `[a-z]` có chứa những ký tự đó không?', 'Phần tên có thể chứa chữ, số, `.`, `_`, `+`, `-`; phần tên miền chứa chữ, số, `.`, `-`, và cuối cùng là `.` + ít nhất 2 chữ cái (TLD).', 'Thay mẫu bằng `[[:alnum:]._+-]+@[[:alnum:].-]+\\.[[:alpha:]]{2,}`. `-` đặt cuối lớp để là dấu gạch thật.'],
    fix: [C.HCU('extract-emails.sh', ['#!/bin/bash', 'grep -oE "[[:alnum:]._+-]+@[[:alnum:].-]+\\.[[:alpha:]]{2,}" contacts.txt']), './extract-emails.sh'],
    cause: '`[a-z]+` quá hẹp: không chứa `.`, `_`, chữ hoa, chữ số. Với `-o`, grep chỉ in đoạn khớp ngắn nhất tìm được từ vị trí bắt đầu sớm nhất, nên email bị cắt đầu (`tran@...`) hoặc đuôi. Khi trích dữ liệu, đặt lớp ký tự đủ rộng cho từng phần, và dùng `-o` để nhìn thấy chính xác phần bắt được.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/extract-emails.sh', EXEMAIL.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) {
      var out = runq(s, './extract-emails.sh').split('\n').filter(Boolean).join('|');
      return out === 'an@example.com|binh.tran@example.com|chau_le@school.edu.vn|admin@tutor.haiphan.org';
    }
  },
  {
    id: 'rx1d3', title: 'Bỏ thẻ HTML mà mất luôn nội dung',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ cat page.html', '<b>Xin</b> chào <i>bạn</i>', '$ ./strip-tags.sh', '', '(dòng trống: toàn bộ nội dung đã biến mất)'),
    story: 'Script `strip-tags.sh` loại bỏ thẻ HTML để lấy văn bản thô. Với `page.html` nó xoá sạch mọi thứ, kể cả chữ.',
    goal: 'Chạy `./strip-tags.sh` phải in `Xin chào bạn`.',
    hints: ['Thử mẫu bằng `echo \'<b>Xin</b> chào\' | grep -oE \'<.*>\'` để xem nó bắt đến đâu.', '`.*` tham lam: nó khớp từ `<` đầu tiên tới `>` **cuối cùng** của dòng, nuốt luôn phần chữ ở giữa.', 'Thay `.*` bằng lớp phủ định "mọi thứ trừ `>`": `<[^>]*>`.'],
    fix: ['cat strip-tags.sh', "echo '<b>Xin</b> chào' | grep -oE '<.*>'", C.HCU('strip-tags.sh', ['#!/bin/bash', "sed -E 's/<[^>]*>//g' page.html"]), './strip-tags.sh'],
    cause: 'Lượng từ mặc định là **tham lam**: `<.*>` kéo dài tới `>` xa nhất. Hai cách khắc phục: lớp phủ định `<[^>]*>` (dùng được ở mọi nơi) hoặc lượng từ lười `<.*?>` (chỉ PCRE, `grep -P`/`perl`). Với HTML thật nhiều tầng hoặc thuộc tính chứa `>`, hãy dùng parser chuyên dụng thay vì regex.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/page.html', '<b>Xin</b> chào <i>bạn</i>\n', { owner: s2.user, mode: 420 }); s2.fs.put(s2.home + '/lab/strip-tags.sh', STRIP.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) { return runq(s, './strip-tags.sh').trim() === 'Xin chào bạn'; }
  },
  {
    id: 'rx1d4', hard: true, title: 'Chuẩn hoá ngày: sed báo "invalid reference \\3"',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./norm-dates.sh', "sed: -e expression #1, char 37: invalid reference \\3 on `s' command's RHS", '', '$ echo $?', '1'),
    story: 'Script `norm-dates.sh` đổi ngày `dd/mm/yyyy` thành `yyyy-mm-dd` trong `dates.txt` và để nguyên các dòng khác. Nó chỉ trả lỗi lạ, và bạn đã thử vài cách sửa nhanh nhưng vẫn không đúng.',
    goal: 'Chạy `./norm-dates.sh` in toàn bộ file với dòng `27/10/2026` thành `2026-10-27`, các dòng còn lại (kể cả `2026/10/27`, `10-27-2026`) giữ nguyên; script không được dùng `\\d`.',
    hints: ['Thông báo nói vế phải tham chiếu `\\3` nhưng mẫu không có nhóm thứ ba. Nhóm nào trong mẫu thực sự được `sed` coi là nhóm?', 'Không có `-E`, `sed` dùng **BRE**: `( )` và `{ }` là ký tự thường, nên mẫu không có nhóm nào. Thêm `-E` rồi thử lại. Nhưng `\\d` cũng không phải chữ số trong `sed` (GNU sed không có `\\d`), nên kết quả vẫn lệch.', 'Dùng `sed -E` và thay `\\d` bằng `[0-9]`: `sed -E \'s/([0-9]{2})\\/([0-9]{2})\\/([0-9]{4})/\\3-\\2-\\1/\' dates.txt`. Kiểm tra dòng `2026/10/27` có bị đụng tới không.'],
    fix: ['cat norm-dates.sh', C.HCU('norm-dates.sh', ['#!/bin/bash', "sed -E 's/([0-9]{2})\\/([0-9]{2})\\/([0-9]{4})/\\3-\\2-\\1/' dates.txt"]), './norm-dates.sh'],
    cause: 'Ba lỗi chồng nhau: thiếu `-E` (BRE coi `()` và `{}` là chữ thường nên không có nhóm), dùng `\\d` (cú pháp Perl, không có trong sed/POSIX), và vì vậy `\\3` trỏ vào nhóm không tồn tại. Quy tắc: `sed -E` + `[0-9]` + thoát `/` (hoặc đổi dấu phân cách `s|...|...|`). Luôn thử không `-i` và nhìn cả dòng khớp lẫn không khớp.',
    setup: function (s) { base(s, { setup: function (s2) { s2.fs.put(s2.home + '/lab/norm-dates.sh', NORM.join('\n') + '\n', { owner: s2.user, mode: 493 }); } }); },
    check: function (s) {
      var t = ftxt(s, s.home + '/lab/norm-dates.sh'), out = runq(s, './norm-dates.sh').split('\n');
      return !/\\d/.test(t) && /sed (-\w*E|-r)/.test(t) && out[0] === '2026-10-27' && out[1] === '2026-10-27' && out[3] === '10-27-2026' && out[4] === '2026/10/27' && out.length >= 7 && /hạn nộp: 2026-11-05/.test(out[5]);
    }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
