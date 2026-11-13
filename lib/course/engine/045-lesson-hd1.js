(function (G) {
'use strict';
/* Chương hd1: here-document (heredoc) và here-string. Đặt ngay sau chương chuyển hướng và pipe (lb4). */
var V = G.VPS, C = G.COURSE, L = C.L, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
var W = function (s) { return s.home + '/work/'; };
function has(s, f, re) { return re.test(ftxt(s, W(s) + f)); }
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }
function lines(s, f) { return ftxt(s, W(s) + f).split('\n').filter(function (x) { return x !== ''; }); }

var T = {
  id: 'hd1', group: 'Linux căn bản', short: 'Heredoc',
  title: 'Here-document (heredoc) và here-string',
  dek: 'Viết nhiều dòng văn bản ngay trong terminal hoặc script mà không cần mở trình soạn thảo: cú pháp << và dấu kết thúc, có/không mở rộng biến, <<- để thụt lề, ghi file cấu hình bằng cat và sudo tee, here-string <<<, đưa heredoc vào pipe, vòng lặp, bash và crontab, cùng các lỗi hay gặp trên VPS.'
};
C.insertAfter('ov1', T);

T.theory = [
  { tag: 'Khái niệm', title: 'Heredoc là gì và dùng để làm gì', body: [
    '**Here-document** (heredoc) cho phép bạn đưa **nhiều dòng văn bản** vào đầu vào (stdin) của một lệnh ngay tại chỗ, thay vì đọc từ file hay gõ một dòng `echo`. Bạn mở bằng `<< DẤU_KẾT_THÚC`, gõ nội dung, và kết thúc bằng một dòng chỉ chứa đúng `DẤU_KẾT_THÚC`.',
    { pre: ['$ cat << EOF', '> Xin chào,', '> đây là dòng thứ hai.', '> EOF', 'Xin chào,', 'đây là dòng thứ hai.'], cap: 'Dấu nhắc `>` do shell hiển thị khi đang chờ thêm dòng. Chữ EOF chỉ là một quy ước (End Of File); bạn đặt tên nào cũng được.' },
    'Trên VPS bạn dùng heredoc gần như mỗi ngày để: **tạo file cấu hình** (Nginx, systemd, `.env`, crontab), **ghi script** vào file, **in trợ giúp** (`usage`) trong script, và **gửi một loạt lệnh** cho `bash`, `ssh` hay `psql`.',
    { tbl: [['Dạng', 'Tên', 'Dùng khi'], ['`lệnh << EOF`', 'here-document', 'Nhiều dòng; có mở rộng biến và `$(...)`'], ['`lệnh << \'EOF\'`', 'here-document nháy đơn', 'Nhiều dòng; giữ **nguyên văn**, không mở rộng gì'], ['`lệnh <<- EOF`', 'here-document bỏ tab', 'Thụt lề bằng **tab** trong script cho dễ đọc'], ['`lệnh <<< "chuỗi"`', 'here-string', 'Chỉ một chuỗi ngắn làm đầu vào (thêm xuống dòng cuối)']] },
    { note: 'Heredoc là một **chuyển hướng đầu vào** như `<`, chỉ khác là nguồn dữ liệu nằm ngay trong dòng lệnh thay vì trong file.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Luật của dấu kết thúc', body: [
    'Shell đọc từng dòng cho đến khi gặp một dòng **trùng khít** với dấu kết thúc. "Trùng khít" nghĩa là:',
    { ul: ['dòng đó **chỉ** gồm dấu kết thúc, không có chữ hay dấu nào khác (kể cả `;`);', 'nó nằm **sát đầu dòng** (không thụt lề bằng dấu cách; với `<<-` thì được thụt bằng **tab**);', '**không có khoảng trắng ở cuối** dòng (`EOF ` có dấu cách cuối sẽ không khớp);', 'phân biệt hoa thường: `eof` khác `EOF`.'] },
    { pre: ['cat << EOF            # ĐÚNG: dấu mở', 'nội dung', 'EOF                    # ĐÚNG: dòng chỉ có EOF', '', 'cat << EOF', 'nội dung', '  EOF                  # SAI: có dấu cách đầu dòng -> shell vẫn chờ tiếp', 'EOF ', '                       # SAI: dấu cách cuối dòng'], cap: 'Khi dấu kết thúc sai, terminal cứ hiện dấu nhắc `>` mãi. Bấm **Ctrl+C** để hủy.' },
    'Tên dấu kết thúc tùy ý: `EOF`, `END`, `SQL`, `NGINX`... Hãy chọn tên **không xuất hiện trong nội dung**, và nên chọn tên gợi ý nội dung (`<<SQL`, `<<CONF`) để dễ đọc script.',
    { note: 'Nếu nội dung của bạn có dòng chỉ gồm `EOF` (ví dụ khi sinh ra một script chứa heredoc khác), hãy đặt cho lớp ngoài một tên khác như `OUTER` hay `SCRIPT`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Có mở rộng biến hay không: <<EOF và <<\'EOF\'', body: [
    'Đây là điểm quan trọng nhất của heredoc. Cách bạn viết dấu kết thúc ở dòng mở quyết định shell có **diễn giải** nội dung hay không.',
    { tbl: [['Viết dòng mở', 'Nội dung được xử lý'], ['`<< EOF` (không nháy)', 'Mở rộng `$biến`, `${biến:-mặc định}`, `$(lệnh)`, `$((phép tính))`; `\\$` cho ra ký tự `$` thật'], ['`<< \'EOF\'`', 'Giữ **nguyên văn**, mọi `$` và `\\` đều là chữ thường'], ['`<< "EOF"` hoặc `<< \\EOF`', 'Giống nháy đơn: nguyên văn']] },
    { pre: ['name=Dang', 'cat << EOF', 'Chào $name, hôm nay là $(date +%F), $((2+3)) bài.', 'Ký tự đô-la thật: \\$HOME', 'EOF', '# Chào Dang, hôm nay là 2026-10-27, 5 bài.', '# Ký tự đô-la thật: $HOME', '', "cat << 'EOF'", 'Chào $name, hôm nay là $(date +%F).', 'EOF', '# Chào $name, hôm nay là $(date +%F).'], cap: 'Cùng nội dung, hai kết quả khác hẳn chỉ vì cặp nháy quanh EOF.' },
    { ul: ['**Dùng `<<EOF`** khi cần chèn giá trị biến hoặc kết quả lệnh (ngày giờ, tên máy, đường dẫn).', '**Dùng `<<\'EOF\'`** khi nội dung có `$` mà bạn muốn giữ nguyên: file Nginx (`$host`, `$uri`), script con (`$1`, `$@`), mật khẩu có ký tự `$`, mẫu regex.'] },
    { note: 'Quên nháy khi ghi file Nginx là lỗi kinh điển: `proxy_set_header Host $host;` bị biến thành `proxy_set_header Host ;` vì `$host` là biến rỗng của shell. Khi nghi ngờ, hãy luôn dùng `<<\'EOF\'`.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'Ghi file bằng heredoc: cat, >, >>, tee', body: [
    'Heredoc là đầu vào của `cat`; bạn kết hợp với chuyển hướng đầu ra để ghi file:',
    { pre: ["cat > app.env << 'EOF'            # tạo mới/ghi đè", 'PORT=3000', 'NODE_ENV=production', 'EOF', '', "cat >> app.env << 'EOF'           # nối thêm vào cuối", 'LOG_LEVEL=info', 'EOF', '', "cat << 'EOF' > app.env           # viết chuyển hướng ra sau cũng được", 'PORT=3000', 'EOF'], cap: '`>` ghi đè, `>>` nối thêm. Nội dung nằm giữa dòng mở và dòng EOF; chuyển hướng đầu ra có thể đứng trước hoặc sau `<<`.' },
    '**File hệ thống cần quyền root.** Chuyển hướng `>` do **shell của bạn** mở file, trước khi `sudo` chạy, nên `sudo cat > /etc/x << EOF` vẫn báo `Permission denied`. Hãy để chính `tee` chạy bằng sudo:',
    { pre: ["sudo tee /etc/myapp.conf > /dev/null << 'EOF'     # ghi đè, không in lại ra màn hình", 'port=8080', 'EOF', '', "sudo tee -a /etc/myapp.conf > /dev/null << 'EOF'  # -a: nối thêm", 'debug=false', 'EOF', '', "cat << 'EOF' | sudo tee /etc/myapp.conf > /dev/null   # dạng pipe, tương đương", 'port=8080', 'EOF'], cap: '`tee` đọc stdin và ghi vào file; nó chạy dưới sudo nên mở được file trong /etc. `> /dev/null` giấu bản sao in ra màn hình.' },
    { tbl: [['Muốn', 'Viết'], ['Ghi file trong thư mục của bạn', '`cat > file << \'EOF\'`'], ['Nối thêm', '`cat >> file << \'EOF\'`'], ['Ghi file cần root', '`sudo tee file > /dev/null << \'EOF\'`'], ['Nối thêm file cần root', '`sudo tee -a file > /dev/null << \'EOF\'`']] },
    { note: 'Sau khi ghi, luôn kiểm tra: `cat file` (nội dung), `ls -l file` (quyền), và với dịch vụ thì chạy bộ kiểm tra cú pháp (`sudo nginx -t`) trước khi reload.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: '<<- và thụt lề trong script', body: [
    'Trong script, bạn muốn thụt lề cả khối heredoc cho dễ đọc, nhưng thụt lề sẽ lọt vào nội dung và làm dòng kết thúc không khớp. Toán tử **`<<-`** (có dấu gạch) giải quyết: nó **bỏ mọi ký tự TAB đầu dòng** của nội dung và của dòng kết thúc.',
    { pre: ['usage() {', '\tcat <<-EOF', '\t\tCách dùng: backup.sh [-v] thư_mục', '\t\t  -v  in chi tiết', '\tEOF', '}', '# in ra (đã bỏ hết tab đầu dòng):', '# Cách dùng: backup.sh [-v] thư_mục', '#   -v  in chi tiết   <- hai dấu cách sau tab được giữ nguyên'], cap: 'Chỉ **tab** bị bỏ. Dấu cách không bị bỏ.' },
    { note: 'Bẫy phổ biến: trình soạn thảo đổi tab thành dấu cách. Khi đó `<<-` không bỏ được gì, dòng EOF thụt bằng dấu cách không khớp, và script báo `unexpected end of file` hoặc `here-document delimited by end-of-file`. Hãy bật "chèn tab thật" cho file `.sh`, hoặc bỏ `<<-` và để heredoc sát lề trái.', kind: 'warn' },
    'Cách khác để giữ script gọn: đặt heredoc sát lề trái (không thụt), hoặc lưu văn bản dài vào file riêng rồi `cat file`.'
  ] },
  { tag: 'Cú pháp', title: 'Here-string <<< cho chuỗi ngắn', body: [
    '**Here-string** `lệnh <<< "chuỗi"` đưa **một chuỗi** vào stdin của lệnh (shell tự thêm một ký tự xuống dòng ở cuối). Gọn hơn `echo "chuỗi" | lệnh` và còn tránh được một "tiến trình con".',
    { pre: ['tr a-z A-Z <<< "xin chao"            # XIN CHAO', 'wc -w <<< "một hai ba"               # 3', 'grep -c a <<< "banana"               # 1  (số dòng khớp, không phải số chữ a)', 'bc <<< "2+3*4"                         # 14', 'read ten tuoi <<< "An 17"; echo $tuoi  # 17', 'sed "s/a/A/g" <<< "banana"             # bAnAnA'] },
    { tbl: [['', 'Pipe `echo x | read v`', 'Here-string `read v <<< x`'], ['Biến `v` sau lệnh', '**Rỗng** (read chạy trong tiến trình con của pipeline)', '**Có giá trị** (read chạy ngay trong shell hiện tại)'], ['Chuỗi nhiều dòng', 'Dùng `printf`', 'Dùng heredoc `<<`']] },
    { note: 'Muốn đọc một biến từ kết quả của lệnh, hãy dùng here-string hoặc `$(...)`, đừng dùng `lệnh | read v`. Đây là lý do bash hay "mất" biến sau pipe.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Heredoc với pipe, chuyển hướng và vòng lặp', body: [
    'Heredoc chỉ là đầu vào của một lệnh nên kết hợp được với mọi thứ bạn đã học:',
    { pre: ['cat << EOF | sort                       # nối pipe sau dòng mở', 'cam', 'táo', 'bưởi', 'EOF', '', 'sort << EOF > ket-qua.txt                # đầu vào heredoc, đầu ra ra file', 'b', 'a', 'EOF', '', 'cat << EOF >> app.log 2>&1                # cả stdout và stderr', '[$(date +%F)] job chạy xong', 'EOF', '', 'while read ten tuoi; do                   # lặp qua từng dòng của heredoc', '  echo "$ten tuổi $tuoi"', 'done << EOF', 'An 17', 'Bình 18', 'EOF', '', 'cat << A; cat << B                          # hai heredoc trong một dòng, đọc lần lượt', 'một', 'A', 'hai', 'B'], cap: 'Dòng mở có thể chứa pipe và chuyển hướng; nội dung bắt đầu ở dòng kế tiếp, và dấu kết thúc đóng nó lại.' },
    { ul: ['`bash << EOF` hoặc `bash -s << EOF`: chạy nhiều lệnh bằng một tiến trình `bash` mới. Dạng `ssh user@host \'bash -s\' << EOF` chạy một loạt lệnh trên máy từ xa (sau này, từ laptop).', '`psql`, `mysql`: truyền cả câu SQL (`psql app << SQL ... SQL`).', '`crontab - << EOF`: thay **toàn bộ** crontab bằng nội dung heredoc. Muốn **thêm** một dòng mà giữ các dòng cũ, bọc bằng khối lệnh: `{ crontab -l; cat << EOF ... EOF` rồi một dòng `} | crontab -`.'] },
    { note: 'Heredoc **không** phù hợp để truyền bí mật: nội dung nằm trong lịch sử shell và có thể thấy trong danh sách tiến trình. Với mật khẩu, hãy ghi file quyền `600` hoặc đọc bằng `read -s`.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Công thức VPS: Nginx, systemd, .env, script sinh script', body: [
    'Một số khuôn mẫu bạn sẽ dùng lại nhiều lần (nháy đơn khi nội dung có `$`):',
    { pre: ["# Nginx: nháy đơn để giữ $host, $uri", "sudo tee /etc/nginx/conf.d/tutor.conf > /dev/null << 'EOF'", 'server {', '  listen 80;', '  server_name tutor.haiphan.org;', '  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }', '}', 'EOF', 'sudo nginx -t', '', '# systemd service, rồi nạp lại', "sudo tee /etc/systemd/system/backup.service > /dev/null << 'EOF'", '[Unit]', 'Description=Sao lưu hằng đêm', '[Service]', 'Type=oneshot', 'ExecStart=/home/haidangphan/bin/mybackup', 'EOF', 'sudo systemctl daemon-reload', '', '# .env có chèn biến (không nháy) và quyền chặt', 'umask 077', 'cat > .env << EOF', 'APP_HOST=$(hostname)', 'DEPLOYED_AT=$(date +%F)', 'EOF'], cap: 'Nhớ: thay đổi dịch vụ xong phải kiểm tra cú pháp và nạp lại, nếu không chưa có hiệu lực.' },
    '**Script sinh ra script**: lớp ngoài dùng dấu kết thúc khác để tránh va chạm, và nháy đơn để giữ `$` cho lớp trong:',
    { pre: ["cat > gen.sh << 'OUTER'", '#!/bin/bash', 'name=${1:-bạn}', 'cat << EOF', 'Xin chào $name, hôm nay $(date +%F)', 'EOF', 'OUTER', 'chmod +x gen.sh && ./gen.sh Dang'] }
  ] },
  { tag: 'Lưu ý', title: 'Bảng lỗi thường gặp và cách gỡ', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân', 'Cách sửa'], ['Terminal hiện `>` mãi, không chạy', 'Dòng kết thúc sai: thừa dấu cách đầu/cuối, sai hoa thường, gõ nhầm chữ', 'Ctrl+C rồi gõ lại; kiểm tra dòng chỉ có đúng dấu kết thúc'], ['Giá trị trong file bị rỗng (vd `Host ;`)', 'Dùng `<<EOF` nên shell mở rộng `$host`', 'Đổi sang `<<\'EOF\'`'], ['`$(date)` hiện nguyên chữ trong file', 'Dùng `<<\'EOF\'` nên không chạy lệnh', 'Bỏ nháy, hoặc tạo biến trước rồi chèn `$biến`'], ['`Permission denied` khi `sudo cat > /etc/x << EOF`', 'Chuyển hướng `>` chạy bằng quyền của bạn, không phải root', '`sudo tee /etc/x > /dev/null << EOF`'], ['Script báo `unexpected end of file`', 'Dòng EOF thụt bằng dấu cách (hoặc editor đổi tab thành dấu cách)', 'Đưa EOF sát lề, hoặc dùng tab thật với `<<-`'], ['Nội dung dư/thiếu dòng', 'Dấu kết thúc xuất hiện sớm trong nội dung, hoặc dấu cách đầu dòng bị lẫn vào', 'Đổi tên dấu kết thúc; xem bằng `cat -A file`'], ['`crontab - << EOF` làm mất các cron cũ', '`crontab -` **thay thế** toàn bộ', '`{ crontab -l; cat << EOF ... EOF` rồi `} | crontab -`'], ['File từ Windows báo lỗi lạ', 'Ký tự CR ở cuối dòng khiến EOF không khớp', '`sed -i \'s/\\r$//\' script.sh`']] },
    { note: 'Mẹo gỡ lỗi: dùng `cat -A file` để thấy tab (`^I`), cuối dòng (`$`) và ký tự lạ; so sánh với điều bạn nghĩ mình đã gõ.', kind: 'tip' }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`cat > hello.txt << EOF …`", "Heredoc: đưa nhiều dòng vào stdin của cat, ghi vào hello.txt. Dấu EOF đóng khối.", "[hello.txt] Xin chào VPS / dòng hai"], ["`cat << EOF | tee shown.txt …`", "Heredoc đi vào tee: vừa in ra màn hình vừa lưu vào shown.txt.", "chỉ để xem"], ["`cat > end.txt << XONG …`", "Dấu kết thúc có thể là tên bất kỳ, ở đây là XONG.", "[end.txt] đã xong"], ["`cat >> hello.txt << EOF …`", "Nối thêm nội dung heredoc vào cuối hello.txt (>>).", "[hello.txt] Xin chào VPS / dòng hai / dòng ba"], ["`cat << EOF > order.txt …`", "Chuyển hướng có thể đặt sau dòng mở <<. Nội dung ghi vào order.txt.", "[order.txt] b / a"], ["`cat > me.txt << EOF …`", "Nội dung không có nháy: biến $USER được mở rộng khi ghi.", "[me.txt] user=haidangphan"], ["`cat > raw.txt << 'EOF' …`", "Nháy đơn cho heredoc: $USER được giữ nguyên là chữ.", "[raw.txt] user=$USER"], ["`name=Dang`", "Gán biến name để dùng trong heredoc kế tiếp.", "(không in ra)"], ["`cat > hi.txt << EOF …`", "Biến $name trong nội dung được thay bằng Dang.", "[hi.txt] Chào Dang"], ["`cat > year.txt << EOF …`", "$(date +%Y) được chạy và thay bằng năm hiện tại.", "[year.txt] năm: 2026"], ["`cat > calc.txt << EOF …`", "$((7*6)) được tính ngay khi ghi file.", "[calc.txt] 7 x 6 = 42"], ["`cat > port.txt << EOF …`", "$PORT được thay bằng giá trị đã đặt trước đó trong bài.", "[port.txt] port=3000"], ["`cat > price.txt << EOF …`", "$5 trong nội dung bị coi là tham số vị trí rỗng, nên chỉ còn lại Giá: nếu không dùng nháy đơn.", "[price.txt] Giá: $5"], ["`cat > site.conf << 'EOF' …`", "Heredoc có nháy đơn: nội dung nginx giữ nguyên $host.", "[site.conf] location / { /   proxy_set_header Host $host; / }"], ["`cat > app.env << 'EOF' …`", "Ghi biến APP_ENV vào app.env bằng heredoc nháy đơn.", "[app.env] SECRET=ab$cd"], ["`cat << EOF | sort > fruits.txt …`", "Nội dung heredoc được sắp xếp bằng sort, kết quả ghi vào fruits.txt.", "[fruits.txt] bưởi / cam / táo"], ["`wc -l << EOF > count.txt …`", "wc -l nhận đầu vào từ heredoc và ghi số dòng vào count.txt.", "[count.txt] 3"], ["`cat << EOF >> job.log 2>&1 …`", "Nối heredoc vào job.log, cả stdout và stderr đều ghi vào log.", "[job.log] [job] xong"], ["`cat << A > one.txt; cat << B > two.txt …`", "Hai heredoc trong một dòng lệnh, mỗi cái ghi ra một file.", "[one.txt] một"], ["`while read ten tuoi; do …`", "Vòng while đọc từng dòng từ heredoc, mỗi dòng gồm tên và tuổi.", "(không in ra)"], ["`tr a-z A-Z <<< \"xin chao\" > up.txt`", "Here-string <<< đưa chuỗi làm stdin, tr đổi chữ thành hoa rồi ghi ra up.txt.", "[up.txt] XIN CHAO"], ["`wc -w <<< \"một hai ba bốn\"`", "Here-string: wc đếm số từ trong chuỗi (4).", "4"], ["`bc <<< \"2+3*4\"`", "bc tính 2+3*4 = 14 (nhân trước cộng).", "14"], ["`read ten tuoi <<< \"An 17\"`", "read gán hai giá trị An và 17 vào ten và tuoi.", "(không in ra)"], ["`echo $tuoi`", "Biến tuoi có giá trị 17 vì read chạy trong shell hiện tại.", "17"], ["`echo \"Bình 18\" | read ten2 tuoi2`", "read ở cuối pipe chạy trong tiến trình con nên ten2 và tuoi2 không còn sau pipe.", "(không in ra)"], ["`echo \"[$tuoi2]\"`", "Biến tuoi2 rỗng vì pipe đã tạo tiến trình con.", "[]"], ["`sudo tee /etc/myapp.conf > /dev/null << 'EOF' …`", "Ghi file cấu hình vào /etc bằng sudo tee; > /dev/null bỏ bản sao in ra màn hình.", "(không in ra)"], ["`sudo tee -a /etc/myapp.conf > /dev/null << 'EOF' …`", "tee -a nối thêm dòng vào cuối file cấu hình trong /etc.", "(không in ra)"], ["`ls -l /etc/myapp.conf`", "ls -l cho thấy file thuộc root và có quyền 644.", "-rw-r--r-- 1 root root 22 Oct 27 10:20 /etc/myapp.conf"], ["`sudo tee /etc/systemd/system/backup.service > /dev/null << 'EOF' …`", "Ghi file dịch vụ systemd bằng sudo tee và heredoc nháy đơn.", "(không in ra)"], ["`cat > greet.sh << 'EOF' …`", "Tạo greet.sh bằng heredoc nháy đơn, nội dung là một script.", "[greet.sh] #!/bin/bash / echo \"Xin chào $1\""], ["`chmod +x greet.sh`", "Cấp quyền chạy cho greet.sh.", "(không in ra)"], ["`./greet.sh Dang`", "Chạy script với tham số Dang, script in lời chào.", "Xin chào Dang"], ["`cat > help.sh << 'EOF' …`", "Tạo help.sh có hàm in hướng dẫn sử dụng.", "[help.sh] usage() { /   cat << MSG / Cách dùng: help.sh FILE / MSG / } / usage"], ["`bash help.sh`", "bash chạy help.sh với đối số là tên file.", "Cách dùng: help.sh FILE"], ["`printf 'if true; then\\n\\tcat <<-EOF\\n\\t\\txin chào\\n\\t\\tEOF\\nfi\\n' > tabs.sh`", "Tạo tabs.sh bằng printf; dòng có tab để thử <<-.", "[tabs.sh] if true; then / \tcat <<-EOF / \t\txin chào / \t\tEOF / fi"], ["`bash tabs.sh`", "Chạy tabs.sh: <<- bỏ tab đầu dòng nên EOF khớp.", "xin chào"], ["`cat > gen.sh << 'OUTER' …`", "Tạo gen.sh có heredoc bên trong, lớp ngoài dùng dấu OUTER.", "[gen.sh] name=${1:-bạn} / cat << EOF / Xin chào $name / EOF"], ["`bash gen.sh`", "Chạy gen.sh: lớp trong chạy và in lời chào với ngày hiện tại.", "Xin chào bạn"], ["`bash << EOF …`", "bash << EOF gửi nội dung như một script cho bash con.", "một / hai"], ["`crontab - << EOF …`", "crontab - thay toàn bộ crontab bằng nội dung heredoc.", "(không in ra)"], ["`crontab -l`", "crontab -l xem lại: chỉ còn dòng vừa cài.", "0 2 * * * /home/haidangphan/bin/mybackup"], ["`{ crontab -l; cat << EOF …`", "Thêm dòng vào crontab mà giữ các dòng cũ: đọc crontab -l, nối thêm, rồi nạp lại.", "(không in ra)"], ["`printf '\\tcó tab\\n' > tabfile.txt`", "printf tạo file có tab đầu dòng.", "[tabfile.txt] \tcó tab"], ["`cat -A tabfile.txt`", "cat -A hiện tab (^I) và dấu cuối dòng để kiểm tra.", "^Icó tab$"]]}]});
T.quiz = C.QZ(2, [
  ['Heredoc `cat << EOF` kết thúc khi nào?', 'Khi gặp một dòng chỉ chứa đúng `EOF`', ['Khi bấm Ctrl+D', 'Khi gặp từ EOF ở bất kỳ vị trí nào trong dòng', 'Sau đúng 10 dòng'], 'Shell so sánh **cả dòng** với dấu kết thúc. Thừa dấu cách, thêm `;` hay thụt lề (với `<<`) đều làm nó không khớp.'],
  ['Khác biệt giữa `<< EOF` và `<< \'EOF\'`?', 'Không nháy thì shell mở rộng `$biến` và `$(lệnh)`; có nháy thì giữ nguyên văn', ['Không có khác biệt', 'Có nháy thì chạy nhanh hơn', 'Có nháy thì không ghi được file'], 'Đây là lựa chọn quan trọng nhất của heredoc. File Nginx, script con, mẫu có `$` nên dùng nháy đơn.'],
  ['Bạn ghi file Nginx bằng `<<EOF` (không nháy) và dòng `proxy_set_header Host $host;` trở thành gì?', '`proxy_set_header Host ;` vì `$host` là biến shell rỗng', ['Không đổi', 'Báo lỗi cú pháp', '`proxy_set_header Host localhost;`'], 'Biến `host` chưa được đặt trong shell nên được thay bằng chuỗi rỗng. Dùng `<<\'EOF\'` để giữ `$host`.'],
  ['`sudo cat > /etc/myapp.conf << EOF` báo `Permission denied`. Vì sao?', 'Chuyển hướng `>` do shell của bạn mở file, trước khi sudo chạy', ['Heredoc không ghi được vào /etc', 'sudo không chạy được với cat', 'Thiếu dấu nháy quanh EOF'], 'Dùng `sudo tee /etc/myapp.conf > /dev/null << EOF`: chính `tee` chạy bằng quyền root nên tự mở được file.'],
  ['`<<-` khác `<<` ở điểm nào?', 'Bỏ các ký tự **tab** đầu dòng trong nội dung và dòng kết thúc', ['Bỏ mọi dấu cách đầu dòng', 'Bỏ dòng trống', 'Không mở rộng biến'], 'Chỉ tab bị bỏ, dấu cách không. Nếu editor đổi tab thành dấu cách thì `<<-` mất tác dụng.'],
  ['Kết quả của `wc -w <<< "một hai ba"`?', '`3`', ['`1`', '`11`', 'Lỗi cú pháp'], 'Here-string đưa chuỗi vào stdin (kèm một xuống dòng); `wc -w` đếm 3 từ.'],
  ['Sau `echo "An 17" | read ten tuoi`, `echo $tuoi` in ra gì?', 'Rỗng: `read` chạy trong tiến trình con của pipeline', ['`17`', '`An`', 'Báo lỗi'], 'Dùng `read ten tuoi <<< "An 17"` để `read` chạy ngay trong shell hiện tại và giữ biến.'],
  ['Cách đúng để ghi **nối thêm** vào `/etc/myapp.conf` (cần root) bằng heredoc?', '`sudo tee -a /etc/myapp.conf > /dev/null << \'EOF\'`', ['`sudo cat >> /etc/myapp.conf << \'EOF\'`', '`sudo tee /etc/myapp.conf >> << \'EOF\'`', '`cat << \'EOF\' >> sudo /etc/myapp.conf`'], '`tee -a` nối thêm; chạy dưới sudo nên mở được file. Hai dạng còn lại vẫn để shell của bạn mở file.'],
  ['`crontab - << EOF` với một dòng cron mới sẽ làm gì với các cron đã có?', 'Thay thế toàn bộ, các cron cũ biến mất', ['Nối thêm vào cuối', 'Bỏ qua dòng trùng', 'Hỏi xác nhận'], 'Muốn giữ cũ: `{ crontab -l; cat << EOF ... EOF` rồi `} | crontab -`.'],
  ['Trong `cat << EOF`, nhập `Giá \\$5` sẽ in gì?', '`Giá $5`', ['`Giá 5`', '`Giá \\$5`', 'Lỗi'], 'Trong heredoc không nháy, `\\$` cho ra ký tự `$` thật (và `\\\\` cho `\\`). Với `<<\'EOF\'` bạn chỉ cần viết `$5`.'],
  ['Cách nào sinh ra một script có chứa heredoc bên trong?', 'Lớp ngoài dùng dấu kết thúc khác (vd `<<\'OUTER\'`)', ['Dùng hai lần `<<EOF` cùng tên', 'Không thể làm được', 'Dùng `<<<` thay cho `<<`'], 'Nếu hai lớp cùng tên EOF, lớp ngoài sẽ kết thúc ở EOF đầu tiên của lớp trong.'],
  ['Cách nhanh nhất để thấy tab và ký tự cuối dòng ẩn trong một file heredoc bị lỗi?', '`cat -A file`', ['`ls -l file`', '`wc -c file`', '`head file`'], '`cat -A` hiện tab là `^I`, cuối dòng là `$`, ký tự CR là `^M`; rất hợp để bắt lỗi thụt lề và CRLF.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s); },
  items: [
    { text: 'Heredoc cơ bản: ghi `hello.txt` bằng `cat > hello.txt << EOF` với hai dòng `Xin chào VPS` và `dòng hai`.', hint: 'cat > hello.txt << EOF\nXin chào VPS\ndòng hai\nEOF', check: function (s) { return has(s, 'hello.txt', /^Xin chào VPS\ndòng hai\n/); } },
    { text: 'Vừa xem vừa lưu: `cat << EOF | tee shown.txt` với dòng `chỉ để xem` (hiện ra màn hình và ghi vào `shown.txt`).', hint: 'cat << EOF | tee shown.txt\nchỉ để xem\nEOF', check: function (s) { return has(s, 'shown.txt', /^chỉ để xem\n$/); } },
    { text: 'Đổi tên dấu kết thúc: ghi `end.txt` bằng dấu kết thúc `XONG` (không phải EOF), nội dung `đã xong`.', hint: 'cat > end.txt << XONG\nđã xong\nXONG', check: function (s) { return has(s, 'end.txt', /^đã xong\n$/); } },
    { text: 'Nối thêm: ghi `hello.txt` thêm dòng `dòng ba` bằng `>>` (giữ nguyên hai dòng cũ).', hint: 'cat >> hello.txt << EOF\ndòng ba\nEOF', check: function (s) { return has(s, 'hello.txt', /^Xin chào VPS\ndòng hai\ndòng ba\n$/); } },
    { text: 'Viết chuyển hướng **sau** dấu mở: `cat << EOF > order.txt` với dòng `b` rồi `a`.', hint: 'cat << EOF > order.txt\nb\na\nEOF', check: function (s) { return has(s, 'order.txt', /^b\na\n$/); } },
    { text: 'Có mở rộng biến: tạo `me.txt` chứa `user=` kèm giá trị thật của `$USER`.', hint: 'cat > me.txt << EOF\nuser=$USER\nEOF', check: function (s) { return has(s, 'me.txt', /^user=haidangphan\n$/); } },
    { text: 'Không mở rộng: tạo `raw.txt` giữ nguyên chữ `user=$USER` (dùng `<<\'EOF\'`).', hint: "cat > raw.txt << 'EOF'\nuser=$USER\nEOF", check: function (s) { return has(s, 'raw.txt', /^user=\$USER\n$/); } },
    { text: 'Đặt `name=Dang` rồi tạo `hi.txt` có dòng `Chào Dang` bằng biến trong heredoc.', hint: 'name=Dang\ncat > hi.txt << EOF\nChào $name\nEOF', check: function (s) { return has(s, 'hi.txt', /^Chào Dang\n$/); } },
    { text: 'Chạy lệnh trong heredoc: tạo `year.txt` có dòng `năm: 2026` bằng `$(date +%Y)`.', hint: 'cat > year.txt << EOF\nnăm: $(date +%Y)\nEOF', check: function (s) { return has(s, 'year.txt', /^năm: 2026\n$/); } },
    { text: 'Tính toán trong heredoc: tạo `calc.txt` có dòng `7 x 6 = 42` bằng `$((7*6))`.', hint: 'cat > calc.txt << EOF\n7 x 6 = $((7*6))\nEOF', check: function (s) { return has(s, 'calc.txt', /^7 x 6 = 42\n$/); } },
    { text: 'Giá trị mặc định: tạo `port.txt` có dòng `port=3000` dùng `${PORT:-3000}` (biến `PORT` chưa đặt).', hint: 'cat > port.txt << EOF\nport=${PORT:-3000}\nEOF', check: function (s) { return has(s, 'port.txt', /^port=3000\n$/); } },
    { text: 'Thoát dấu `$`: tạo `price.txt` có dòng `Giá: $5` trong heredoc **không** nháy (dùng `\\$`).', hint: 'cat > price.txt << EOF\nGiá: \\$5\nEOF', check: function (s) { return has(s, 'price.txt', /^Giá: \$5\n$/); } },
    { text: 'Ghi file Nginx đúng cách: tạo `site.conf` có dòng `proxy_set_header Host $host;` (giữ nguyên `$host`).', hint: "cat > site.conf << 'EOF'\nlocation / {\n  proxy_set_header Host $host;\n}\nEOF", check: function (s) { return has(s, 'site.conf', /proxy_set_header Host \$host;/); } },
    { text: 'Ghi `.env` nháy đơn có chuỗi chứa `$`: tạo `app.env` với `SECRET=ab$cd`.', hint: "cat > app.env << 'EOF'\nSECRET=ab$cd\nEOF", check: function (s) { return has(s, 'app.env', /^SECRET=ab\$cd\n$/); } },
    { text: 'Đưa heredoc vào pipe: sắp xếp ba dòng `cam`, `táo`, `bưởi` bằng `cat << EOF | sort > fruits.txt`.', hint: 'cat << EOF | sort > fruits.txt\ncam\ntáo\nbưởi\nEOF', check: function (s) { return lines(s, 'fruits.txt').join('|') === 'bưởi|cam|táo'; } },
    { text: 'Đưa heredoc thẳng vào lệnh: đếm dòng bằng `wc -l << EOF > count.txt` với 3 dòng.', hint: 'wc -l << EOF > count.txt\na\nb\nc\nEOF', check: function (s) { return has(s, 'count.txt', /^3\n$/); } },
    { text: 'Ghi cả stdout và stderr: nối vào `job.log` một dòng `[job] xong` bằng `cat << EOF >> job.log 2>&1`.', hint: 'cat << EOF >> job.log 2>&1\n[job] xong\nEOF', check: function (s) { return has(s, 'job.log', /\[job\] xong\n$/); } },
    { text: 'Hai heredoc trong một dòng: `cat << A > one.txt; cat << B > two.txt` với `một` và `hai`.', hint: 'cat << A > one.txt; cat << B > two.txt\nmột\nA\nhai\nB', check: function (s) { return has(s, 'one.txt', /^một\n$/) && has(s, 'two.txt', /^hai\n$/); } },
    { text: 'Lặp qua heredoc: `while read ten tuoi` in `An: 17` và `Bình: 18` từ hai dòng `An 17`, `Bình 18` (chuyển ra `ages.txt`).', hint: 'while read ten tuoi; do\n  echo "$ten: $tuoi"\ndone << EOF > ages.txt\nAn 17\nBình 18\nEOF', check: function (s) { return has(s, 'ages.txt', /^An: 17\nBình: 18\n$/); } },
    { text: 'Here-string: đổi `xin chao` thành chữ hoa vào `up.txt` bằng `tr a-z A-Z <<< "xin chao" > up.txt`.', hint: 'tr a-z A-Z <<< "xin chao" > up.txt', check: function (s) { return has(s, 'up.txt', /^XIN CHAO\n$/); } },
    { text: 'Here-string: đếm từ của chuỗi `một hai ba bốn` bằng `wc -w <<<`.', hint: 'wc -w <<< "một hai ba bốn"', check: OK(/^wc -w$/) },
    { text: 'Tính nhanh bằng `bc <<<`: tính `2+3*4` (kết quả `14`).', hint: 'bc <<< "2+3*4"', check: OK(/^bc$/) },
    { text: 'Đọc biến bằng here-string: `read ten tuoi <<< "An 17"` rồi in `$tuoi` (17).', hint: 'read ten tuoi <<< "An 17"\necho $tuoi', check: OK(/^echo 17$/) },
    { text: 'Chứng minh bẫy pipe: chạy `echo "Bình 18" | read ten2 tuoi2` rồi in `[$tuoi2]` (rỗng vì `read` chạy trong tiến trình con).', hint: 'echo "Bình 18" | read ten2 tuoi2\necho "[$tuoi2]"', check: OK(/^echo \[\]$/) },
    { text: 'Ghi file cần root: tạo `/etc/myapp.conf` với `port=8080` bằng `sudo tee ... > /dev/null << EOF`.', hint: "sudo tee /etc/myapp.conf > /dev/null << 'EOF'\nport=8080\nEOF", check: function (s) { return /^port=8080\n/.test(ftxt(s, '/etc/myapp.conf')); } },
    { text: 'Nối thêm vào file root bằng `sudo tee -a`: thêm dòng `debug=false` vào `/etc/myapp.conf`.', hint: "sudo tee -a /etc/myapp.conf > /dev/null << 'EOF'\ndebug=false\nEOF", check: function (s) { return /^port=8080\ndebug=false\n$/.test(ftxt(s, '/etc/myapp.conf')); } },
    { text: 'Xem quyền và chủ sở hữu của file vừa tạo bằng `ls -l /etc/myapp.conf` (chủ là root vì ghi bằng sudo).', hint: 'ls -l /etc/myapp.conf', check: OK(/^ls -l \/etc\/myapp\.conf$/) },
    { text: 'Tạo service systemd: ghi `/etc/systemd/system/backup.service` (có `Type=oneshot` và `ExecStart=/home/haidangphan/bin/mybackup`) bằng `sudo tee`.', hint: "sudo tee /etc/systemd/system/backup.service > /dev/null << 'EOF'\n[Unit]\nDescription=Sao lưu\n[Service]\nType=oneshot\nExecStart=/home/haidangphan/bin/mybackup\nEOF", check: function (s) { var t = ftxt(s, '/etc/systemd/system/backup.service'); return /Type=oneshot/.test(t) && /ExecStart=\/home\/haidangphan\/bin\/mybackup/.test(t); } },
    { text: 'Tạo script bằng heredoc: ghi `greet.sh` (nháy đơn) với `#!/bin/bash` và `echo "Xin chào $1"`, cấp quyền thực thi, chạy `./greet.sh Dang`.', hint: "cat > greet.sh << 'EOF'\n#!/bin/bash\necho \"Xin chào $1\"\nEOF\nchmod +x greet.sh\n./greet.sh Dang", check: AND(function (s) { return has(s, 'greet.sh', /echo "Xin chào \$1"/); }, OK(/^\.\/greet\.sh Dang$/)) },
    { text: 'Hàm `usage` dùng heredoc: ghi `help.sh` có hàm `usage` in `Cách dùng: help.sh FILE` rồi gọi hàm; chạy `bash help.sh`.', hint: "cat > help.sh << 'EOF'\nusage() {\n  cat << MSG\nCách dùng: help.sh FILE\nMSG\n}\nusage\nEOF\nbash help.sh", check: AND(function (s) { return has(s, 'help.sh', /usage\(\)/); }, OK(/^bash help\.sh$/)) },
    { text: 'Heredoc thụt lề bằng `<<-` (dùng tab): trong `tabs.sh` có khối `cat <<-EOF` thụt tab in `xin chào`; chạy bằng `bash tabs.sh`.', hint: "printf 'if true; then\\n\\tcat <<-EOF\\n\\t\\txin chào\\n\\t\\tEOF\\nfi\\n' > tabs.sh\nbash tabs.sh", check: AND(function (s) { return has(s, 'tabs.sh', /<<-EOF/); }, OK(/^bash tabs\.sh$/)) },
    { text: 'Script sinh script: ghi `gen.sh` bằng `<<\'OUTER\'` chứa một heredoc `EOF` bên trong; chạy `bash gen.sh` in `Xin chào bạn`.', hint: "cat > gen.sh << 'OUTER'\nname=${1:-bạn}\ncat << EOF\nXin chào $name\nEOF\nOUTER\nbash gen.sh", check: AND(function (s) { return has(s, 'gen.sh', /name=\$\{1:-bạn\}\ncat << EOF\nXin chào \$name\nEOF/); }, OK(/^bash gen\.sh$/)) },
    { text: 'Heredoc vào `bash`: chạy `bash << EOF` với hai lệnh `echo một` và `echo hai`.', hint: 'bash << EOF\necho một\necho hai\nEOF', check: function (s) { return s.hist.some(function (h) { return h.code === 0 && /^echo một$/.test(h.cmd); }) && s.hist.some(function (h) { return /^echo hai$/.test(h.cmd); }); } },
    { text: 'Đặt crontab bằng heredoc: `crontab - << EOF` với dòng `0 2 * * * /home/haidangphan/bin/mybackup`, rồi xem bằng `crontab -l`.', hint: 'crontab - << EOF\n0 2 * * * /home/haidangphan/bin/mybackup\nEOF\ncrontab -l', check: AND(function (s) { var c = s.W && s.W.lin && s.W.lin.cron && s.W.lin.cron[s.user]; return /0 2 \* \* \* \/home\/haidangphan\/bin\/mybackup/.test(c || ''); }, OK(/^crontab -l$/)) },
    { text: 'Thêm một dòng cron mà **giữ** dòng cũ: `{ crontab -l; cat << EOF` thêm `30 3 * * 0 /home/haidangphan/bin/weekly`, kết thúc `} | crontab -`.', hint: '{ crontab -l; cat << EOF\n30 3 * * 0 /home/haidangphan/bin/weekly\nEOF\n} | crontab -\ncrontab -l', check: function (s) { var c = (s.W && s.W.lin && s.W.lin.cron && s.W.lin.cron[s.user]) || ''; return /0 2 \* \* \* \/home\/haidangphan\/bin\/mybackup/.test(c) && /30 3 \* \* 0 \/home\/haidangphan\/bin\/weekly/.test(c); } },
    { text: 'Soi file bằng `cat -A`: ghi `tabfile.txt` có một dòng bắt đầu bằng tab (bằng `printf`) rồi xem `cat -A tabfile.txt` (thấy `^I`).', hint: "printf '\\tcó tab\\n' > tabfile.txt\ncat -A tabfile.txt", check: OK(/^cat -A tabfile\.txt$/) }
  ]
};

var MKCONF = ['#!/bin/bash', '# sinh file cấu hình Nginx cho tutor.haiphan.org', 'cat > site.conf << EOF', 'server {', '  listen 80;', '  server_name tutor.haiphan.org;', '  location / {', '    proxy_pass http://127.0.0.1:3000;', '    proxy_set_header Host $host;', '    try_files $uri @app;', '  }', '}', 'EOF'];
var STAMP = ['#!/bin/bash', '# ghi dòng nhật ký có ngày giờ', "cat >> job.log << 'EOF'", '[$(date +%F)] job chạy xong', 'EOF'];
var REPORT = ['#!/bin/bash', 'report() {', '    cat <<-EOF', '    Báo cáo cuối ngày', '    Trạng thái: ổn', '    EOF', '}', 'report', 'echo "hoàn tất"'];

T.debugs = [
  {
    id: 'hd1d1', title: 'File Nginx sinh ra bị mất $host và $uri',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./mkconf.sh', '$ cat site.conf', 'server {', '  listen 80;', '  server_name tutor.haiphan.org;', '  location / {', '    proxy_pass http://127.0.0.1:3000;', '    proxy_set_header Host ;', '    try_files  @app;', '  }', '}'),
    story: 'Script `mkconf.sh` sinh `site.conf` bằng heredoc. File ra đời nhưng hai dòng `proxy_set_header Host ;` và `try_files  @app;` trống trơn, Nginx sẽ không chạy đúng.',
    goal: 'Làm cho `site.conf` chứa đúng `proxy_set_header Host $host;` và `try_files $uri @app;`.',
    hints: ['`$host` và `$uri` đang bị ai thay mất? Trong shell hai biến đó có giá trị không?', 'Heredoc **không nháy** mở rộng biến; `host` và `uri` là biến rỗng của shell nên bị thay bằng chuỗi rỗng.', 'Đổi dòng mở thành `<< \'EOF\'` (hoặc ghi lại bằng `cat > site.conf << \'EOF\'`), rồi chạy lại và `cat site.conf`.'],
    fix: ["sed -i \"s/<< EOF/<< 'EOF'/\" mkconf.sh", './mkconf.sh', 'cat site.conf'],
    cause: 'Không có nháy quanh dấu kết thúc nên shell diễn giải nội dung: `$host`, `$uri` thành rỗng. Với nội dung của chương trình khác (Nginx, script con, regex), hãy dùng `<<\'EOF\'` để giữ nguyên văn.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/mkconf.sh', MKCONF.join('\n') + '\n', { mode: 493 }); LB.put(s2, h + '/site.conf', MKCONF.slice(3, 12).join('\n').replace('$host', '').replace('$uri', '') + '\n'); } }); },
    check: function (s) { var t = ftxt(s, W(s) + 'site.conf'); return /proxy_set_header Host \$host;/.test(t) && /try_files \$uri @app;/.test(t); }
  },
  {
    id: 'hd1d2', title: 'sudo cat > /etc/... báo Permission denied',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ sudo cat > /etc/myapp.conf << EOF', '> port=8080', '> EOF', 'bash: /etc/myapp.conf: Permission denied'),
    story: 'Bạn thêm `sudo` trước `cat` để ghi file cấu hình trong `/etc` nhưng vẫn bị từ chối quyền.',
    goal: 'Tạo `/etc/myapp.conf` chứa dòng `port=8080` bằng heredoc.',
    hints: ['Ai mở file `/etc/myapp.conf` để ghi: `cat` hay shell của bạn?', 'Dấu `>` do shell hiện tại (không phải root) xử lý trước khi `sudo` chạy. Cần một lệnh tự mở file và chạy dưới sudo.', '`sudo tee /etc/myapp.conf > /dev/null << \'EOF\'` ... `EOF`'],
    fix: ["sudo tee /etc/myapp.conf > /dev/null << 'EOF'\nport=8080\nEOF", 'cat /etc/myapp.conf'],
    cause: 'Chuyển hướng là việc của shell và chạy với quyền người dùng. `sudo` chỉ nâng quyền cho lệnh `cat`. `tee` đọc stdin và tự ghi file nên khi chạy bằng sudo nó mở được file trong `/etc`.',
    setup: function (s) { base(s); },
    check: function (s) { return /^port=8080\n$/.test(ftxt(s, '/etc/myapp.conf')); }
  },
  {
    id: 'hd1d3', title: 'Ngày giờ trong log hiện nguyên chữ $(date +%F)',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./stamp.sh', '$ cat job.log', '[$(date +%F)] job chạy xong'),
    story: 'Script `stamp.sh` ghi dòng nhật ký có ngày, nhưng trong `job.log` ngày không được tính mà hiện nguyên chữ `$(date +%F)`.',
    goal: 'Sau khi sửa và chạy lại, `job.log` có dòng dạng `[2026-10-27] job chạy xong` (ngày thật), và không còn chữ `$(date`.',
    hints: ['Lệnh `$(date +%F)` có được shell chạy không? Hãy nhìn dòng mở heredoc trong `stamp.sh`.', 'Dòng mở là `<< \'EOF\'` (có nháy) nên toàn bộ nội dung bị giữ nguyên văn.', 'Bỏ nháy (`<< EOF`), xoá `job.log`, chạy lại `./stamp.sh`.'],
    fix: ["sed -i \"s/<< 'EOF'/<< EOF/\" stamp.sh", 'rm job.log', './stamp.sh', 'cat job.log'],
    cause: 'Nháy quanh dấu kết thúc tắt mọi mở rộng, kể cả `$(...)`. Khi cần chèn ngày giờ, tên máy, biến: dùng `<<EOF` không nháy; khi cần giữ `$`: dùng `<<\'EOF\'`. Có thể trộn bằng cách đặt giá trị vào biến trước rồi chèn `$biến`.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/stamp.sh', STAMP.join('\n') + '\n', { mode: 493 }); LB.put(s2, h + '/job.log', '[$(date +%F)] job chạy xong\n'); } }); },
    check: function (s) { var t = ftxt(s, W(s) + 'job.log'); return /\[\d{4}-\d{2}-\d{2}\] job chạy xong/.test(t) && t.indexOf('$(date') < 0; }
  },
  {
    id: 'hd1d4', title: 'Script báo unexpected end of file vì EOF thụt bằng dấu cách', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ bash report.sh', 'bash: syntax error: unexpected end of file', '$ cat -A report.sh | head -4', '#!/bin/bash$', 'report() {$', '    cat <<-EOF$', '    Báo cáo cuối ngày$'),
    story: 'Bạn thụt lề khối `cat <<-EOF` trong `report.sh` cho đẹp. Script báo `unexpected end of file`. Editor của bạn đã đổi tab thành dấu cách.',
    goal: 'Sửa `report.sh` để `bash report.sh` chạy được và in `Báo cáo cuối ngày`, `Trạng thái: ổn`, `hoàn tất`.',
    hints: ['`cat -A report.sh` cho thấy dòng thụt lề là `^I` (tab) hay dấu cách?', '`<<-` chỉ bỏ **tab**. Dòng EOF thụt bằng dấu cách không khớp nên heredoc không bao giờ kết thúc.', 'Cách gọn nhất: bỏ thụt lề của nội dung heredoc và dòng EOF (hoặc dùng tab thật). Chạy lại `bash report.sh`.'],
    fix: ["sed -i 's/^ *EOF$/EOF/; s/^ *Báo/Báo/; s/^ *Trạng/Trạng/; s/<<-EOF/<<EOF/' report.sh", 'bash report.sh'],
    cause: '`<<-` chỉ bỏ ký tự tab đầu dòng. Khi editor đổi tab thành dấu cách, dòng kết thúc không còn khớp. Giải pháp: dùng tab thật cho khối heredoc, hoặc không thụt lề heredoc (và dùng `<<EOF`), hoặc tách văn bản vào file riêng.',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/report.sh', REPORT.join('\n') + '\n', { mode: 493 }); } }); },
    check: function (s) {
      var r = null; try { var h = s.hist.length, cwd = s.cwd; r = s.run('cd ' + W(s) + ' && bash report.sh'); s.hist.length = h; s.cwd = cwd; } catch (e) {}
      return !!r && !r.code && /Báo cáo cuối ngày/.test(r.out) && /Trạng thái: ổn/.test(r.out) && /hoàn tất/.test(r.out);
    }
  },
  {
    id: 'hd1d5', title: 'Thêm cron bằng heredoc làm mất các cron cũ', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ crontab -l', '0 2 * * * /home/haidangphan/bin/mybackup', '30 3 * * 1 /home/haidangphan/bin/cleanup', '$ crontab - << EOF', '> 0 5 * * * /home/haidangphan/bin/report', '> EOF', '$ crontab -l', '0 5 * * * /home/haidangphan/bin/report'),
    story: 'Bạn thêm một job cron mới bằng `crontab - << EOF` và hai job cũ (`mybackup`, `cleanup`) biến mất. May là bạn nhớ nội dung của chúng.',
    goal: 'Đưa crontab về đủ **ba** dòng: `mybackup` (02:00), `cleanup` (thứ Hai 03:30) và `report` (05:00), mỗi dòng đúng một lần.',
    hints: ['`crontab -` làm gì với nội dung cũ? Có cách nào "lấy cũ + thêm mới" rồi mới nạp lại?', 'Nạp bằng pipe: `{ crontab -l; ... } | crontab -`. Bên trong khối, in lại hai dòng cũ rồi thêm dòng mới.', 'Gõ: `{ cat << EOF` với hai dòng cũ, rồi `EOF` và `} | crontab -`; hoặc `crontab -l`, `cat >> file << EOF`, `crontab file`.'],
    fix: ['{ crontab -l; cat << EOF\n0 2 * * * /home/haidangphan/bin/mybackup\n30 3 * * 1 /home/haidangphan/bin/cleanup\nEOF\n} | crontab -', 'crontab -l'],
    cause: '`crontab -` (và `crontab file`) **thay thế** toàn bộ crontab. Để thêm, hãy lấy nội dung hiện có (`crontab -l`), nối dòng mới, rồi nạp lại. Luôn sao lưu `crontab -l > cron.bak` trước khi sửa.',
    setup: function (s) { base(s, { setup2: function (s3, S) { s3.W.lin.cron[s3.user] = '0 5 * * * /home/haidangphan/bin/report\n'; } }); },
    check: function (s) {
      var c = (s.W && s.W.lin && s.W.lin.cron && s.W.lin.cron[s.user]) || '', ls = c.split('\n').filter(Boolean);
      return ls.length === 3 && /^0 2 \* \* \* \/home\/haidangphan\/bin\/mybackup$/m.test(c) && /^30 3 \* \* 1 \/home\/haidangphan\/bin\/cleanup$/m.test(c) && /^0 5 \* \* \* \/home\/haidangphan\/bin\/report$/m.test(c);
    }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
