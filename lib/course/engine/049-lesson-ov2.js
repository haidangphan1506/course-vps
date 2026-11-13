(function (G) {
'use strict';
/* Chương ov2: ôn tập tổng hợp 2 (tìm kiếm, nén và sao lưu, heredoc, tee). Đặt ngay sau chương lb6. */
var V = G.VPS, C = G.COURSE, L = C.L, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var W = function (s) { return s.home + '/work/'; };
function hok(s, re) { return s.hist.some(function (h) { return re.test(h.cmd); }); }
function has(s, f, re) { return re.test(ftxt(s, W(s) + f)); }
function exists(s, f) { return !!s.fs.get(W(s) + f); }

var T = {
  id: 'ov2', group: 'Linux căn bản', short: 'Ôn tập 2',
  title: 'Ôn tập 2: tìm kiếm, nén, heredoc và tee',
  dek: 'Tổng hợp bốn chương giữa: find và grep để tìm, tar và sha256sum để đóng gói và kiểm chứng, heredoc để ghi file nhiều dòng, và tee để vừa xem vừa lưu. Đây là bộ công cụ bạn dùng khi sao lưu và truy lỗi trên VPS.'
};
C.insertAfter('lb6', T);

T.theory = [
  { tag: 'Ôn tập', title: 'Chọn công cụ đúng cho từng việc', body: [
    { tbl: [['Việc cần làm', 'Công cụ', 'Ghi nhớ'], ['Tìm file theo tên, kích thước, ngày', '`find`', 'Điểm bắt đầu đứng trước, điều kiện đứng sau'], ['Tìm chữ trong nội dung file', '`grep -r`', 'Dùng `-n` để thấy số dòng'], ['Đóng gói và nén thư mục', '`tar -czf`', 'Xem trước bằng `tar -tzf`'], ['Kiểm tra file không bị hỏng', '`sha256sum`', 'Lưu mã băm và so lại sau khi chép'], ['Ghi nhiều dòng vào file', 'heredoc `<<`', 'Dùng `<<\'EOF\'` khi có `$` cần giữ nguyên'], ['Vừa in vừa ghi log', '`tee` và `tee -a`', 'Thêm `2>&1` để gom cả lỗi']] },
    'Một quy trình sao lưu gọn gồm bốn bước: `find` để xác định file, `tar` để đóng gói, `sha256sum` để ghi mã kiểm chứng, và `tee -a` để ghi log mỗi lần chạy.'
  ] },
  { tag: 'Ôn tập', title: 'Ba lỗi thường gặp ở nhóm này', body: [
    { ul: ['**Lệnh `crontab -` thay thế toàn bộ crontab.** Muốn thêm một dòng, hãy đọc cái cũ trước: `{ crontab -l; echo "..."; } | crontab -`.', '**`tar -czf` không tự nhận thư mục cần đóng gói.** Bạn phải đưa tên thư mục vào sau tên archive.', '**`tee` không có `-a` sẽ ghi đè.** Log cũ mất hết mỗi lần chạy, nên với log hãy luôn dùng `tee -a`.'] },
    { note: 'Heredoc với `<<EOF` mở rộng `$biến`. Nếu file đích là cấu hình Nginx hoặc script, hãy dùng `<<\'EOF\'`.', kind: 'tip' }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`mkdir -p on2`", "Tạo thư mục on2 để chứa kết quả bài ôn tập.", "(không in ra)"], ["`find . -name \"*.csv\" > on2/csv.txt`", "Tìm mọi file .csv và ghi danh sách vào csv.txt.", "[on2/csv.txt] ./data/users.csv"], ["`grep -n Sao notes.txt > on2/tim.txt`", "grep -n tìm chữ Sao trong notes.txt, in số dòng và ghi vào tim.txt.", "[on2/tim.txt] 3:Sao lưu cơ sở dữ liệu mỗi đêm lúc 02:00."], ["`tar -czf on2/data.tar.gz data`", "Đóng gói thư mục data thành data.tar.gz.", "(không in ra)"], ["`sha256sum on2/data.tar.gz > on2/data.sha256`", "Tính mã băm của file nén và ghi vào data.sha256 để kiểm tra sau.", "[on2/data.sha256] 095c14a8e5062592124229c9e9376f4036ef295d08435b06be3a076af0752ff0  on2/data.tar.gz"], ["`cat > on2/env.txt << 'EOF' …`", "Heredoc nháy đơn ghi file env.txt, giữ nguyên $HOME.", "[on2/env.txt] PORT=3000 / DIR=$HOME"]]}]});
T.quiz = C.QZ(2, [
  ['Lệnh nào xem danh sách file trong `archive.tar.gz` mà không giải nén?', '`tar -tzf archive.tar.gz`', ['`tar -xzf archive.tar.gz`', '`tar -czf archive.tar.gz`', '`gzip -d archive.tar.gz`'], '`t` là liệt kê (list), `x` là giải nén, `c` là tạo. `z` báo hiệu gzip.'],
  ['`rsync -a src/ dst/` khác `rsync -a src dst` ở điểm nào?', 'Có dấu / cuối src thì chép nội dung của src vào dst; không có thì chép cả thư mục src vào dst', ['Hai lệnh hoàn toàn giống nhau', 'Có dấu / thì chép chậm hơn', 'Không có dấu / thì lệnh báo lỗi'], 'Dấu `/` cuối đường dẫn nguồn quyết định rsync lấy nội dung hay chính thư mục đó.'],
  ['Muốn tìm mọi file `.log` lớn hơn 100 MB, lệnh nào đúng?', '`find /var/log -name "*.log" -size +100M`', ['`grep -r "*.log" -size 100M`', '`ls -s +100M *.log`', '`find -size 100 log`'], '`find` nhận điểm bắt đầu, sau đó là điều kiện `-name` và `-size`. `+100M` nghĩa là lớn hơn 100 MB.'],
  ['Vì sao phải dùng `sudo tee` thay vì `sudo cat > /etc/x`?', 'Chuyển hướng `>` do shell của bạn mở trước khi sudo chạy, nên không có quyền root', ['`cat` không ghi được file văn bản', '`sudo` không hỗ trợ chuyển hướng', 'Thư mục /etc chỉ đọc được bằng `tee`'], 'Phần `>` được shell xử lý bằng quyền người dùng hiện tại. `tee` là lệnh riêng nên nhận được quyền root từ sudo.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s, {}); },
  items: [
    { text: 'Tìm mọi file `.csv` trong thư mục hiện tại bằng `find`, lưu danh sách vào `on2/csv.txt`.', hint: 'mkdir -p on2\nfind . -name "*.csv" > on2/csv.txt', check: function (s) { return exists(s, 'on2/csv.txt') && has(s, 'on2/csv.txt', /data\/users\.csv/); } },
    { text: 'Tìm chữ `Sao` trong `notes.txt` bằng `grep -n`, lưu kết quả vào `on2/tim.txt`.', hint: 'grep -n Sao notes.txt > on2/tim.txt', check: function (s) { return has(s, 'on2/tim.txt', /^3:Sao/) && hok(s, /^grep -n Sao notes\.txt$/); } },
    { text: 'Đóng gói thư mục `data` thành `on2/data.tar.gz` bằng `tar -czf`.', hint: 'tar -czf on2/data.tar.gz data', check: function (s) { return exists(s, 'on2/data.tar.gz') && hok(s, /^tar -czf on2\/data\.tar\.gz data$/); } },
    { text: 'Ghi mã kiểm chứng của `on2/data.tar.gz` vào `on2/data.sha256` bằng `sha256sum`.', hint: 'sha256sum on2/data.tar.gz > on2/data.sha256', check: function (s) { return has(s, 'on2/data.sha256', /on2\/data\.tar\.gz/) && hok(s, /^sha256sum on2\/data\.tar\.gz$/); } },
    { text: 'Tạo `on2/env.txt` bằng heredoc nháy đơn, có dòng `DIR=$HOME` giữ nguyên văn.', hint: "cat > on2/env.txt << 'EOF'\nPORT=3000\nDIR=$HOME\nEOF", check: function (s) { return has(s, 'on2/env.txt', /^PORT=3000\nDIR=\$HOME\n$/); } }
  ]
};
T.debugs = [
  {
    id: 'ov2d1', title: 'Log sao lưu bị mất dòng cũ',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ cat backup.log', 'run 2', '(dòng "run 1" đã biến mất)'),
    story: 'Mỗi lần sao lưu bạn ghi thêm một dòng vào `backup.log`. Lần chạy vừa rồi dùng `tee` không có `-a`, và file chỉ còn một dòng.',
    goal: 'File `backup.log` có đủ hai dòng, `run 1` đứng trước `run 2`.',
    hints: ['`tee` không có `-a` sẽ ghi đè. Muốn nối thêm thì dùng cờ nào?', 'Dòng cũ đã mất. Bạn cần giữ mọi lần chạy về sau bằng `tee -a`.', 'Khôi phục hai dòng: `printf "run 1\\n" > backup.log` rồi `echo "run 2" | tee -a backup.log`, cuối cùng `cat backup.log`.'],
    fix: ['printf "run 1\\n" > backup.log', 'echo "run 2" | tee -a backup.log', 'cat backup.log'],
    cause: 'Chuyển hướng `>` và `tee` không có `-a` đều ghi đè file từ đầu. Với log, luôn dùng `tee -a` hoặc `>>` để nối thêm.',
    setup: function (s) { base(s, { setup2: function (s3) { s3.run('echo "run 2" > ~/work/backup.log'); s3.hist.length = 0; s3.cwd = s3.home + '/work'; } }); },
    check: function (s) { return has(s, 'backup.log', /^run 1\nrun 2\n$/); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
