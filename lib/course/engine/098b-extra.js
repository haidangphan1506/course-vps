(function (G) {
'use strict';
/* Câu hỏi trắc nghiệm và bài lab bổ sung cho nhóm "Linux căn bản" và "Web server".
   Nạp trước 099-sim.js để bước tách bài (tối đa 20 câu lab mỗi phần) tính cả các mục này. */
var C = G.COURSE, OK = C.OK;
/* lệnh khớp re (kể cả khi trả mã khác 0, ví dụ grep -c ra 0) */
function A(re) { return function (s) { return s.hist.some(function (h) { return re.test(h.cmd); }); }; }
function add(id, seed, quiz, labs) {
  var l = null;
  C.lessons.forEach(function (x) { if (x.id === id) l = x; });
  if (!l) throw new Error('extra: không thấy bài ' + id);
  if (quiz && quiz.length) l.quiz = l.quiz.concat(C.QZ(seed, quiz));
  if (labs && labs.length) l.lab.items = l.lab.items.concat(labs);
}
/* lệnh chạy ok, có đủ các cờ (chars) và khớp argRe */
function flagsOK(cmd, chars, argRe) {
  return function (s) {
    return s.hist.some(function (h) {
      if (h.code !== 0) return false;
      var w = h.cmd.split(' ');
      if (w[0] !== cmd) return false;
      var fl = w.filter(function (x) { return /^-[a-zA-Z]+$/.test(x); }).join('').replace(/-/g, '');
      for (var i = 0; i < chars.length; i++) if (fl.indexOf(chars.charAt(i)) < 0) return false;
      return !argRe || argRe.test(h.cmd);
    });
  };
}

/* ===================== Linux căn bản ===================== */

add('lb1', 1, [
  ['Script có dòng `rm -rf "$DIR"/*` nhưng biến `DIR` bị rỗng. Điều gì có thể xảy ra?', 'Lệnh thành `rm -rf /*` và xoá cả hệ thống nếu đủ quyền', ['Không xoá gì vì biến rỗng', 'Chỉ xoá thư mục hiện tại', 'Shell tự dừng và báo lỗi'], 'Biến rỗng biến đường dẫn thành `/*`. Dùng `$DIR:?` hoặc `set -u` để script dừng khi biến chưa có giá trị.'],
  ['`cp -a` khác `cp -r` ở điểm nào?', '`-a` giữ cả quyền, chủ sở hữu, thời gian sửa và symlink', ['`-a` chỉ chép file ẩn', '`-a` chép mọi ổ đĩa', 'Hai cờ giống hệt nhau'], '`-a` (archive) là cách chép nguyên trạng, thích hợp khi sao lưu cả cây thư mục.'],
  ['`pushd photos` rồi `popd` làm gì?', 'Lưu thư mục hiện tại vào ngăn xếp, sang `photos`, rồi quay lại thư mục đã lưu', ['Xoá thư mục `photos` rồi tạo lại', 'Đổi tên `photos`', 'Chép `photos` ra thư mục trước'], 'Hai lệnh này tiện khi cần nhảy qua nhiều thư mục rồi quay về đúng chỗ cũ, nhất là trong script.'],
  ['`ls -ltr logs` sắp xếp kết quả thế nào?', 'Theo thời gian sửa, file cũ nhất ở trên và mới nhất nằm cuối', ['Theo tên A đến Z', 'Theo kích thước giảm dần', 'Theo thời gian sửa, mới nhất ở trên'], '`-t` sắp theo thời gian mới nhất trước, `-r` đảo ngược. Rất tiện khi muốn thấy log mới nhất ngay cuối màn hình.']
], [
  { text: 'Về lại `~/work` (nếu đang ở nơi khác), rồi xem inode, kích thước, quyền và các mốc thời gian của `notes.txt` bằng `stat`.', hint: 'cd ~/work\nstat notes.txt', check: OK(/^stat notes\.txt$/) },
  { text: 'Liệt kê `logs` theo thời gian sửa, cũ nhất trước, bằng `ls -ltr`.', hint: 'ls -ltr logs', check: flagsOK('ls', 'ltr', /logs\/?$/) },
  { text: 'Đi vào `photos` bằng `pushd`, rồi quay lại bằng `popd`.', hint: 'pushd photos\npopd', check: function (s) { return OK(/^pushd photos\/?$/)(s) && OK(/^popd$/)(s); } },
  { text: 'Chép nguyên trạng `projects/tutor` thành `projects/tutor-bak` bằng `cp -a`.', hint: 'cp -a projects/tutor projects/tutor-bak', check: function (s) { return OK(/^cp -a projects\/tutor projects\/tutor-bak$/)(s) && s.fs.isD(s.home + '/work/projects/tutor-bak'); } }
]);

add('lb2', 2, [
  ['Web báo 403 và bạn định chạy `chmod -R 777 /var/www`. Đó có phải cách sửa tốt không?', 'Không: cho mọi người quyền ghi là lỗ hổng, hãy sửa đúng chủ, nhóm và quyền 644 cho file, 755 cho thư mục', ['Có, vì 777 luôn an toàn', 'Có, nhưng chỉ khi dùng sudo', 'Không, vì 777 làm file không đọc được'], 'Nguyên tắc quyền tối thiểu: chỉ cấp đúng thứ cần. 403 thường do thiếu quyền `x` trên thư mục cha hoặc sai chủ file.'],
  ['Trong `chmod -R u+rwX,go-w dir`, chữ **X hoa** nghĩa là gì?', 'Chỉ đặt quyền thực thi cho thư mục, hoặc file vốn đã có quyền thực thi ở đâu đó', ['Đặt quyền thực thi cho mọi file', 'Xoá quyền thực thi', 'Giống hệt `x` thường'], 'X hoa giúp mở thư mục để duyệt mà không biến file văn bản thành file chạy được.'],
  ['`stat -c "%a %U:%G %n" notes.txt` in ra gì?', 'Quyền dạng số, chủ:nhóm và tên file', ['Kích thước và ngày sửa', 'Inode và số liên kết', 'Nội dung đầu của file'], '`stat -c` cho phép tự chọn định dạng, hữu ích để kiểm tra quyền hàng loạt trong script.']
], [
  { text: 'In quyền dạng số, chủ:nhóm và tên của `notes.txt` bằng `stat -c`.', hint: 'stat -c "%a %U:%G %n" notes.txt', check: OK(/^stat -c ["']?%a[^ ]* .*notes\.txt$/) },
  { text: 'Xem quyền của từng thành phần trên đường dẫn tới `notes.txt` bằng `namei -l`.', hint: 'namei -l /home/haidangphan/work/notes.txt', check: OK(/^namei -l \S*notes\.txt$/) },
  { text: 'Đặt đệ quy cho `projects`: chủ đọc/ghi, nhóm và người khác không được ghi, bằng `chmod -R u+rwX,go-w`.', hint: 'chmod -R u+rwX,go-w projects', check: OK(/^chmod -R u\+rwX,go-w projects\/?$/) }
]);

add('lb3', 3, [
  ['`echo ${#HOME}` in ra gì?', 'Độ dài (số ký tự) của chuỗi trong biến HOME', ['Nội dung biến HOME', 'Số file trong HOME', 'Lỗi cú pháp'], '`${#biến}` trả độ dài chuỗi, `${#mảng[@]}` trả số phần tử của mảng.'],
  ['`echo file{A,B}.txt` in ra gì?', 'fileA.txt fileB.txt', ['file{A,B}.txt', 'fileA,B.txt', 'Lỗi vì thiếu dấu cách'], 'Brace expansion do shell mở rộng trước khi chạy lệnh, rất tiện để tạo nhiều tên file cùng lúc.'],
  ['`set -u` ở đầu script làm gì?', 'Báo lỗi và dừng khi dùng biến chưa được gán, thay vì coi là chuỗi rỗng', ['Chuyển mọi biến thành chữ hoa', 'Cho phép biến dùng ở tiến trình con', 'Tắt mọi thông báo lỗi'], 'Kết hợp `set -euo pipefail` giúp script bắt lỗi sớm, nhất là lỗi gõ sai tên biến.']
], [
  { text: 'In độ dài chuỗi của biến `HOME` bằng `${#HOME}`.', hint: 'echo ${#HOME}', check: OK(/^echo 17$/) },
  { text: 'Dùng brace expansion để in `fileA.txt fileB.txt` bằng một lệnh `echo`.', hint: 'echo file{A,B}.txt', check: OK(/^echo fileA\.txt fileB\.txt$/) },
  { text: 'Tạo mảng `arr=(a b c)` rồi in phần tử thứ hai bằng `${arr[1]}`.', hint: 'arr=(a b c); echo ${arr[1]}', check: OK(/^echo b$/) }
]);

add('lb4', 0, [
  ['`cmd 2>&1 | tee run.log` làm gì?', 'Gộp stderr vào stdout, rồi vừa hiện lên màn hình vừa ghi vào `run.log`', ['Chỉ ghi lỗi vào run.log', 'Xoá run.log rồi chạy cmd', 'Chạy cmd hai lần'], '`tee` chép stdin ra hai nơi: màn hình và file. Thêm `-a` để nối thêm thay vì ghi đè.'],
  ['`wc -l < notes.txt` khác `wc -l notes.txt` ở điểm nào?', 'Dạng `<` chỉ in con số, không kèm tên file', ['Dạng `<` đếm từ thay vì dòng', 'Dạng `<` không chạy được', 'Hai lệnh cho đầu ra hoàn toàn giống nhau'], 'Với `<`, wc đọc stdin nên không biết tên file. Tiện khi gán kết quả vào biến.'],
  ['`cat <<< "xin chào"` là cú pháp gì?', 'Here-string: đưa chuỗi làm stdin của lệnh', ['Here-document nhiều dòng', 'Chuyển hướng lỗi', 'Nối hai file'], 'Here-string ngắn gọn hơn `echo "..." | lệnh` và không tạo thêm tiến trình pipe.']
], [
  { text: 'Gộp lỗi vào stdout rồi vừa xem vừa ghi vào `loi.txt` bằng `2>&1 | tee`.', hint: 'ls khong-co 2>&1 | tee loi.txt', check: function (s) { return OK(/^tee loi\.txt$/)(s) && /cannot access/.test(C.ftxt(s, s.home + '/work/loi.txt')); } },
  { text: 'Nối thêm hai dòng vào `loi.txt` bằng `tee -a` và đếm số dòng đi qua pipe.', hint: 'printf "a\\nb\\n" | tee -a loi.txt | wc -l', check: function (s) { var t = C.ftxt(s, s.home + '/work/loi.txt'); return OK(/^tee -a loi\.txt$/)(s) && /^a$/m.test(t) && /^b$/m.test(t) && OK(/^wc -l$/)(s); } },
  { text: 'Đưa chuỗi làm stdin bằng here-string: `cat <<< "here string"`.', hint: 'cat <<< "here string"', check: function (s) { return s.hist.some(function (h) { return h.code === 0 && h.cmd === 'cat'; }); } }
]);

add('lb5', 1, [
  ['`find . -type f -name "*.log" -mtime +30 -delete` làm gì?', 'Xoá file `.log` được sửa lần cuối cách đây hơn 30 ngày', ['Liệt kê file `.log` mới hơn 30 ngày', 'Nén file `.log` cũ', 'Chỉ đếm file `.log`'], '`-delete` xoá thật. Luôn chạy trước phiên bản không có `-delete` để xem danh sách sẽ bị xoá.'],
  ['`grep -rl "TODO" src` cho ra gì?', 'Chỉ tên các file trong `src` có chứa TODO, tìm đệ quy', ['Mọi dòng chứa TODO kèm số dòng', 'Số file trong `src`', 'Tên các thư mục con'], '`-r` đi vào thư mục con, `-l` chỉ in tên file khớp, rất hợp để xử lý tiếp bằng `xargs`.'],
  ['Lệnh nào tìm file thường lớn hơn 100 MB dưới `/var`?', '`sudo find /var -type f -size +100M`', ['`find /var -size 100M`', '`du /var -gt 100M`', '`find /var -large`'], '`+100M` nghĩa là lớn hơn 100 MB. Dùng `sudo` để không bị lỗi Permission denied ở thư mục của root.']
], [
  { text: 'Đếm số file `.md` dưới thư mục hiện tại bằng `find ... | wc -l`.', hint: 'find . -type f -name "*.md" | wc -l', check: function (s) { return OK(/^find \. -type f -name \*\.md$/)(s) && OK(/^wc -l$/)(s); } },
  { text: 'Xem dung lượng của thư mục `logs` dạng dễ đọc bằng `du -sh`.', hint: 'du -sh logs', check: flagsOK('du', 'sh', /logs\/?$/) }
]);

add('lb6', 2, [
  ['Trong `tar -czf b.tgz -C /srv/app .`, cờ `-C` có tác dụng gì?', 'Chuyển sang `/srv/app` trước khi đóng gói, nên đường dẫn trong archive không chứa `/srv/app`', ['Nén mức cao nhất', 'Kiểm tra checksum', 'Bỏ qua file ẩn'], 'Dùng `-C` khi tạo và khi giải nén giúp archive gọn và tránh giải nhầm ra vị trí tuyệt đối.'],
  ['`rsync -a --delete src/ dst/` làm thêm điều gì so với `rsync -a`?', 'Xoá ở `dst` những file không còn trong `src`, nên cần chạy thử bằng `-n` trước', ['Nén dữ liệu khi truyền', 'Giữ lại mọi file cũ ở `dst`', 'Chỉ chép file mới nhất'], '`--delete` làm `dst` giống hệt `src`. Một dấu `/` sai chỗ hoặc `src` rỗng có thể xoá sạch `dst`.'],
  ['Muốn xem nhanh 3 mục đầu trong `backup.tgz` mà không giải nén, dùng lệnh nào?', '`tar -tzf backup.tgz | head -n 3`', ['`tar -xzf backup.tgz | head -n 3`', '`gzip -d backup.tgz | head -n 3`', '`ls backup.tgz -3`'], '`-t` chỉ liệt kê nội dung. Đọc danh sách trước khi giải nén là thói quen an toàn.']
], [
  { text: 'Xem 3 mục đầu trong `backup.tgz` mà không giải nén: `tar -tzf ... | head -n 3`.', hint: 'tar -tzf backup.tgz | head -n 3', check: function (s) { return OK(/^tar -?t\w*f backup\.tgz$/)(s) && OK(/^head -n 3$/)(s); } },
  { text: 'Xem cỡ file `backup.tgz` dạng dễ đọc bằng `ls -lh`.', hint: 'ls -lh backup.tgz', check: flagsOK('ls', 'lh', /backup\.tgz$/) }
]);

add('lb7', 3, [
  ['`kill -0 1234` dùng để làm gì?', 'Kiểm tra tiến trình 1234 còn sống và mình có quyền gửi tín hiệu, không làm gì tiến trình', ['Dừng tiến trình 1234 nhẹ nhàng', 'Dừng ngay tiến trình 1234', 'Khởi động lại tiến trình 1234'], 'Tín hiệu 0 không được gửi thật. Mã thoát 0 nghĩa là tiến trình tồn tại, dùng nhiều trong script giám sát.'],
  ['Tiến trình zombie (STAT `Z`) là gì?', 'Tiến trình đã kết thúc nhưng tiến trình cha chưa đọc mã thoát của nó', ['Tiến trình đang chờ ổ đĩa', 'Tiến trình bị treo, ngốn CPU', 'Tiến trình chạy dưới quyền root'], 'Zombie không dùng CPU hay RAM, chỉ giữ một dòng trong bảng tiến trình. Cách xử lý là sửa hoặc khởi động lại tiến trình cha.'],
  ['Nhấn `Ctrl+Z` khi một lệnh đang chạy ở foreground thì sao?', 'Lệnh bị tạm dừng (SIGTSTP), có thể chạy tiếp bằng `bg` hoặc `fg`', ['Lệnh bị huỷ hẳn', 'Lệnh chạy nhanh hơn', 'Shell bị đóng'], '`Ctrl+C` gửi SIGINT để dừng hẳn, còn `Ctrl+Z` chỉ tạm dừng và đưa vào danh sách `jobs`.']
], [
  { text: 'Kiểm tra tiến trình số 1 còn sống bằng `kill -0 1` rồi in mã thoát.', hint: 'kill -0 1; echo $?', check: function (s) { return s.hist.some(function (h) { return /^kill -0 1$/.test(h.cmd); }); } }
]);

add('lb8', 1, [
  ['Dòng crontab bắt đầu bằng `@reboot` nghĩa là gì?', 'Chạy một lần mỗi khi máy khởi động', ['Chạy lại mỗi giờ', 'Chạy khi người dùng đăng nhập', 'Chạy khi cron khởi động lại'], 'Hữu ích để dựng lại tmux hoặc tiến trình nền sau khi VPS khởi động, không cần tạo service riêng.'],
  ['`0 0 1 * *` chạy vào lúc nào?', '00:00 ngày mùng 1 hằng tháng', ['00:00 mỗi ngày', 'Mỗi giờ vào phút thứ 0 của ngày 1', 'Mỗi thứ Hai'], 'Năm trường là: phút, giờ, ngày trong tháng, tháng, thứ trong tuần.'],
  ['`crontab -r` làm gì?', 'Xoá toàn bộ crontab của người dùng ngay, không hỏi lại', ['Chạy lại các job', 'Chỉ đọc crontab', 'Xoá một dòng cuối'], '`-r` và `-e` nằm sát nhau trên bàn phím nên rất dễ gõ nhầm. Hãy lưu bản sao bằng `crontab -l > cron.txt` trước khi sửa.']
], [
  { text: 'Đếm số dòng trong crontab hiện tại bằng `crontab -l | wc -l`.', hint: 'crontab -l | wc -l', check: function (s) { return OK(/^crontab -l$/)(s) && OK(/^wc -l$/)(s); } }
]);

/* ===================== Web server ===================== */

add('c3', 0, [
  ['`proxy_set_header X-Forwarded-Proto $scheme;` để làm gì?', 'Cho ứng dụng biết khách đã vào bằng http hay https, vì Nginx nói chuyện với app qua http', ['Bật HTTPS cho ứng dụng', 'Đổi cổng của ứng dụng', 'Chặn truy cập bằng http'], 'Không có header này, app thường tạo link và redirect sai giao thức, hay gặp vòng lặp chuyển hướng.'],
  ['Nginx trả 502 cho `/api/`. Bước kiểm tra đầu tiên hợp lý là gì?', 'Gọi thẳng `curl -I http://127.0.0.1:8888` để xem ứng dụng phía sau có phản hồi không', ['Xoá cache trình duyệt', 'Cài lại Nginx', 'Đổi chứng chỉ SSL'], '502 nghĩa là Nginx không nhận được phản hồi hợp lệ từ upstream. Tách Nginx ra, hỏi trực tiếp ứng dụng.'],
  ['Sau khi sửa file trong `sites-available`, cần làm gì để Nginx áp dụng?', 'File phải được link vào `sites-enabled`, rồi chạy `nginx -t` và reload', ['Chỉ cần lưu file là đủ', 'Khởi động lại cả VPS', 'Xoá file trong `sites-enabled`'], '`sites-available` chỉ là kho cấu hình, Nginx đọc `sites-enabled`. Luôn `nginx -t` trước khi reload.']
], [
  { text: 'Xem file thật mà symlink trong `sites-enabled` đang trỏ tới bằng `readlink -f`.', hint: 'readlink -f /etc/nginx/sites-enabled/000-default-deny', check: OK(/^readlink -f \/etc\/nginx\/sites-enabled\/\S+$/) },
  { text: 'Kiểm tra Nginx có tự bật khi khởi động không bằng `systemctl is-enabled nginx`.', hint: 'sudo systemctl is-enabled nginx', check: OK(/^(sudo )?systemctl is-enabled nginx$/) },
  { text: 'Xem tiến trình `node` nào đang lắng nghe cổng nào (app phía sau Nginx) bằng `ss -tlnp | grep node`.', hint: 'sudo ss -tlnp | grep node', check: function (s) { return OK(/^(sudo )?ss -tlnp$/)(s) && OK(/^grep node$/)(s); } }
]);

add('c3b', 1, [
  ['Nginx nhận request có `Host` không khớp `server_name` nào. Điều gì xảy ra?', 'Dùng server `default_server` của cổng đó, hoặc server khai báo đầu tiên nếu chưa đặt', ['Trả 404 ngay lập tức', 'Từ chối kết nối', 'Chuyển sang server có tên gần giống nhất'], 'Nên chủ động đặt `default_server` để request lạ (quét IP, tên miền sai) rơi vào khối chặn thay vì lộ site thật.'],
  ['`location = /health { ... }` khớp thế nào?', 'Chỉ khớp đúng URI `/health`, ưu tiên cao nhất', ['Khớp mọi URI bắt đầu bằng `/health`', 'Khớp theo regex', 'Khớp mọi URI chứa `health`'], 'Dấu `=` là khớp chính xác và được xét trước. Rất nhanh nên hay dùng cho endpoint kiểm tra sống.'],
  ['`curl --resolve tutor.haiphan.org:443:127.0.0.1 https://tutor.haiphan.org` giúp gì?', 'Giả lập DNS: gửi tới 127.0.0.1 nhưng vẫn giữ đúng tên miền cho Host và SNI', ['Tắt kiểm tra chứng chỉ', 'Đổi bản ghi DNS thật', 'Chuyển giao thức sang HTTP/3'], 'Cho phép thử một server trước khi trỏ DNS, và kiểm tra chứng chỉ đúng tên miền.']
], [
  { text: 'Liệt kê mọi `server_name` đang có trong cấu hình bằng `nginx -T | grep`.', hint: 'sudo nginx -T | grep -i server_name', check: function (s) { return OK(/^(sudo )?nginx -T$/)(s) && OK(/^grep -i server_name$/)(s); } },
  { text: 'Đếm tổng số request đã ghi trong `access.log` bằng `wc -l`.', hint: 'sudo wc -l /var/log/nginx/access.log', check: OK(/^(sudo )?wc -l \/var\/log\/nginx\/access\.log$/) }
]);

add('c3c', 2, [
  ['Khi `upstream` có nhiều server mà không chọn thuật toán, Nginx cân bằng tải theo kiểu nào?', 'Vòng tròn (round robin), lần lượt từng server', ['Luôn chọn server nhanh nhất', 'Theo địa chỉ IP khách', 'Ngẫu nhiên hoàn toàn'], 'Muốn giữ một khách ở cùng một server dùng `ip_hash`, muốn dồn vào server ít kết nối nhất dùng `least_conn`.'],
  ['Cách chuyển hướng http sang https gọn và đúng nhất?', '`return 301 https://$host$request_uri;` trong khối listen 80', ['`rewrite ^ /https permanent;`', '`proxy_pass https://$host;`', '`error_page 301 https://;`'], '`return` đơn giản và nhanh hơn `rewrite`. Giữ nguyên `$request_uri` để không mất đường dẫn và query.'],
  ['`expires 30d;` trong khối file tĩnh có tác dụng gì?', 'Trình duyệt giữ bản sao 30 ngày, không hỏi lại Nginx trong thời gian đó', ['Nginx xoá file sau 30 ngày', 'Tắt nén gzip', 'Chặn truy cập sau 30 ngày'], 'Chỉ nên dùng cho file có tên gắn hash (đổi nội dung là đổi tên), nếu không người dùng sẽ thấy bản cũ.']
], [
  { text: 'Đếm số khối `location` trong toàn bộ cấu hình bằng `nginx -T | grep -c`.', hint: 'sudo nginx -T | grep -c location', check: function (s) { return OK(/^(sudo )?nginx -T$/)(s) && A(/^grep -c location$/)(s); } },
  { text: 'Xem Nginx được biên dịch với những module nào bằng `nginx -V`.', hint: 'sudo nginx -V 2>&1 | head -n 2', check: OK(/^(sudo )?nginx -V/) }
]);

add('c3d', 3, [
  ['Cấu hình tối thiểu để WebSocket đi qua Nginx cần những gì?', '`proxy_http_version 1.1;` cùng hai header `Upgrade` và `Connection "upgrade"`', ['Chỉ cần `proxy_pass`', 'Bật `gzip on;`', 'Mở thêm cổng 8080'], 'Mặc định Nginx nói HTTP/1.0 với upstream và bỏ header Upgrade, nên bắt tay WebSocket thất bại.'],
  ['Upload file 5 MB bị lỗi 413. Nguyên nhân thường gặp và cách chữa?', '`client_max_body_size` mặc định 1m, tăng lên trong khối server hoặc location', ['Thiếu `gzip`', 'Cổng 443 bị đóng', 'DNS sai'], '413 do chính Nginx từ chối trước khi tới ứng dụng. Chỉ nâng giới hạn ở location thật sự cần upload.'],
  ['Ứng dụng xử lý lâu hơn 60 giây thì Nginx mặc định trả mã nào?', '504 Gateway Timeout, vì `proxy_read_timeout` mặc định là 60s', ['502 Bad Gateway', '413 Payload Too Large', '301 Moved Permanently'], '504 khác 502: ứng dụng vẫn sống nhưng trả lời quá chậm. Tăng `proxy_read_timeout` hoặc tối ưu tác vụ chậm.']
], [
  { text: 'Tìm các dòng nhắc tới `upgrade` trong cấu hình bằng `nginx -T | grep -i`.', hint: 'sudo nginx -T | grep -i upgrade', check: function (s) { return OK(/^(sudo )?nginx -T$/)(s) && A(/^grep -i upgrade$/)(s); } }
]);

add('c3e', 0, [
  ['`root` và `alias` khác nhau thế nào khi ghép đường dẫn?', '`root` nối thêm toàn bộ URI vào đường dẫn, còn `alias` thay phần khớp của `location` bằng đường dẫn', ['Hai chỉ thị giống hệt nhau', '`alias` chỉ dùng cho file ẩn', '`root` chỉ dùng cho HTTPS'], 'Với `alias`, nhớ dấu `/` cuối ở cả `location` và đường dẫn, sai một dấu là ra 404 khó hiểu.'],
  ['SPA (React, Vue) cần dòng nào để mọi đường dẫn đều trả `index.html`?', '`try_files $uri $uri/ /index.html;`', ['`return 200 /index.html;`', '`proxy_pass /index.html;`', '`autoindex on;`'], '`try_files` thử file thật trước, không có thì trả `index.html` để router phía trình duyệt xử lý.'],
  ['Thứ tự `allow 10.0.0.0/8; deny all;` hoạt động thế nào?', 'Nginx xét từ trên xuống và dừng ở luật khớp đầu tiên: mạng 10.x vào được, còn lại bị chặn', ['Luôn chặn tất cả vì `deny all` đứng sau', 'Chỉ có `deny` được xét', 'Luật cuối cùng thắng'], 'Đặt luật cụ thể trước, `deny all` sau cùng. Đảo thứ tự sẽ chặn cả mạng được phép.']
], [
  { text: 'Tìm các dòng `root` hoặc `alias` trong cấu hình bằng `nginx -T | grep -nE`.', hint: 'sudo nginx -T | grep -nE "root|alias"', check: function (s) { return OK(/^(sudo )?nginx -T$/)(s) && A(/^grep -nE root\|alias$/)(s); } }
]);

add('c3f', 1, [
  ['Khác biệt giữa `nginx -s reload` và `systemctl restart nginx`?', '`reload` nạp cấu hình mới mà không ngắt các kết nối đang chạy, `restart` dừng hẳn rồi chạy lại', ['Hai lệnh giống hệt nhau', '`reload` xoá log cũ', '`restart` chỉ kiểm tra cú pháp'], 'Ưu tiên `nginx -t && systemctl reload nginx`: cấu hình lỗi thì Nginx giữ nguyên bản cũ đang chạy.'],
  ['Vì sao sau khi xoay log (logrotate) Nginx cần nhận tín hiệu USR1 hoặc reload?', 'Để Nginx mở lại file log mới, nếu không nó vẫn ghi vào file cũ đã đổi tên', ['Để xoá log cũ', 'Để nén log', 'Để đổi chủ file log'], 'Tiến trình giữ file descriptor trỏ vào file cũ, nên phải báo cho nó mở lại file theo tên.'],
  ['`nginx -T` khác `nginx -t` ở điểm nào?', '`-T` vừa kiểm tra vừa in toàn bộ cấu hình đã gộp mọi file include', ['`-T` chỉ in phiên bản', '`-T` khởi động lại Nginx', 'Không khác'], 'Rất hữu ích để thấy cấu hình thực sự đang được dùng, kể cả phần nằm ở các file include.']
], [
  { text: 'In toàn bộ cấu hình đã gộp bằng `nginx -T` và xem 20 dòng đầu.', hint: 'sudo nginx -T | head -n 20', check: function (s) { return OK(/^(sudo )?nginx -T$/)(s) && OK(/^head -n 20$/)(s); } },
  { text: 'Xem 3 dòng nhật ký gần nhất của dịch vụ Nginx bằng `journalctl -u nginx -n 3`.', hint: 'sudo journalctl -u nginx -n 3', check: OK(/^(sudo )?journalctl -u nginx -n 3$/) }
]);

add('c4', 2, [
  ['Bản ghi nào trỏ tên miền thẳng tới một địa chỉ IPv4?', 'Bản ghi A', ['Bản ghi CNAME', 'Bản ghi MX', 'Bản ghi TXT'], 'CNAME trỏ tên này sang tên khác. Bản ghi tại gốc domain (apex) thường phải là A hoặc AAAA.'],
  ['Đám mây **cam** trên Cloudflare nghĩa là gì?', 'Lưu lượng đi qua proxy của Cloudflare, IP thật của VPS được che', ['Bản ghi bị tắt', 'Chỉ trả lời DNS, không qua proxy', 'Chứng chỉ đã hết hạn'], 'Đám mây xám là chỉ DNS. Khi dùng proxy cam, cần cấu hình chế độ SSL phù hợp (Full strict) để tránh vòng lặp redirect.'],
  ['`dig +short tutor.haiphan.org` giúp làm gì?', 'Xem nhanh địa chỉ IP mà tên miền đang trả về', ['Kiểm tra chứng chỉ SSL', 'Xem nội dung trang web', 'Tạo bản ghi DNS mới'], 'Dùng khi vừa đổi DNS để biết bản ghi mới đã được lan truyền chưa. TTL càng thấp thì cập nhật càng nhanh.']
], [
  { text: 'Hỏi thẳng resolver công cộng 1.1.1.1 để xem DNS đã cập nhật chưa: `dig @1.1.1.1 +short tutor.haiphan.org`.', hint: 'dig @1.1.1.1 +short tutor.haiphan.org', check: OK(/^dig @1\.1\.1\.1 \+short tutor\.haiphan\.org$/) },
  { text: 'Tra nhanh địa chỉ của `tutor.haiphan.org` bằng lệnh `host`.', hint: 'host tutor.haiphan.org', check: OK(/^host tutor\.haiphan\.org$/) }
]);
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
