(function (G) {
'use strict';
/* Chương ov1: ôn tập tổng hợp 1 (hệ thống file, quyền, shell, chuyển hướng). Đặt ngay sau chương lb4. */
var V = G.VPS, C = G.COURSE, L = C.L, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var W = function (s) { return s.home + '/work/'; };
function hok(s, re) { return s.hist.some(function (h) { return re.test(h.cmd); }); }
function has(s, f, re) { return re.test(ftxt(s, W(s) + f)); }
function mode(s, p) { var n = s.fs.get(p); return n ? n.mode & 4095 : -1; }
function exists(s, f) { return !!s.fs.get(W(s) + f); }

var T = {
  id: 'ov1', group: 'Linux căn bản', short: 'Ôn tập 1',
  title: 'Ôn tập 1: file, quyền, shell và chuyển hướng',
  dek: 'Tổng hợp bốn chương đầu: đường dẫn và thao tác file, quyền số và chữ, biến và dấu nháy trong shell, chuyển hướng > >> 2>&1 và pipe. Làm lại các bước này trên một bài tập nhỏ để chắc tay trước khi học tiếp.'
};
C.insertAfter('lb4', T);

T.theory = [
  { tag: 'Ôn tập', title: 'Bốn chương đầu và việc từng chương giải quyết', body: [
    { tbl: [['Chương', 'Câu hỏi nó trả lời', 'Dấu hiệu khi gặp lỗi'], ['Lb1: hệ thống file', 'File nằm ở đâu, đường dẫn đúng chưa?', '`No such file or directory`'], ['Lb2: quyền', 'Ai được đọc, ghi, chạy file này?', '`Permission denied`, 403'], ['Lb3: shell', 'Biến có được mở rộng không? Shell có tìm thấy lệnh không?', '`command not found`, biến hiện sai'], ['Lb4: chuyển hướng', 'Mỗi luồng dữ liệu đi đâu?', 'File trống, lỗi không được ghi vào log']] },
    'Khi một lệnh lỗi, hãy đi theo đúng thứ tự này: đường dẫn → quyền → biến và dấu nháy → luồng đầu ra. Gần như mọi lỗi trên VPS đều rơi vào một trong bốn bước đó.'
  ] },
  { tag: 'Ôn tập', title: 'Ba cái bẫy hay gặp nhất', body: [
    { ul: ['**Ghi đè file đang đọc:** `sort todo.md > todo.md` làm file trống, vì shell mở và cắt file trước khi `sort` kịp đọc. Muốn sắp xếp tại chỗ, hãy ghi ra file tạm rồi đổi tên.', '**Nháy đơn không mở rộng biến:** `echo \'$HOME\'` in đúng chữ `$HOME`; `echo "$HOME"` mới in đường dẫn thư mục.', '**Thứ tự `2>&1`:** `lệnh > f 2>&1` gửi cả hai luồng vào `f`; `lệnh 2>&1 > f` chỉ chuyển stdout vào `f`, còn stderr vẫn ra màn hình.'] },
    { note: 'Trước khi chạy lệnh có chuyển hướng `>`, hãy tự hỏi: file đích có đang là đầu vào của lệnh không? Nếu có, hãy đổi tên đích.', kind: 'warn' }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`mkdir -p on1/logs on1/tmp`", "Tạo hai thư mục con trong một lệnh; -p tạo cả thư mục cha.", "(không in ra)"], ["`cp todo.md on1/logs/todo-copy.md`", "Sao chép todo.md vào thư mục logs của bài ôn tập.", "(không in ra)"], ["`echo \"ngày 1\" > on1/tmp/ghi.txt`", "> ghi đè: tạo ghi.txt với dòng đầu tiên.", "[on1/tmp/ghi.txt] ngày 1"], ["`echo \"ngày 2\" >> on1/tmp/ghi.txt`", ">> nối thêm dòng thứ hai vào cuối file.", "[on1/tmp/ghi.txt] ngày 1 / ngày 2"], ["`wc -l < on1/tmp/ghi.txt > on1/count.txt`", "Đếm dòng của file rồi ghi kết quả vào count.txt; chuỗi chuyển hướng < > kết hợp được.", "[on1/count.txt] 2"], ["`chmod 640 on1/count.txt`", "Đặt quyền 640 cho count.txt: chủ đọc và ghi, nhóm chỉ đọc, người khác không có quyền.", "(không in ra)"], ["`ls notes.txt khong-co > on1/both.txt 2>&1`", "Gom stdout và stderr vào cùng một file; 2>&1 phải đứng sau >.", "[on1/both.txt] ls: cannot access 'khong-co': No such file or directory / notes.txt"]]}]});
T.quiz = C.QZ(2, [
  ['Lệnh `sort todo.md > todo.md` thường cho kết quả gì?', 'File todo.md bị trống', ['File được sắp xếp đúng', 'Lệnh báo lỗi cú pháp và không chạy', 'Nội dung được nối thêm vào cuối'], 'Shell mở `todo.md` để ghi và cắt nó về rỗng trước khi `sort` đọc. Dữ liệu cũ mất hẳn.'],
  ['`chmod 640 file` nghĩa là gì?', 'Chủ đọc-ghi, nhóm chỉ đọc, người khác không có quyền', ['Chủ đọc-ghi-chạy, nhóm đọc-chạy, người khác đọc', 'Mọi người đọc và ghi, chỉ chủ được chạy', 'Chỉ root đọc được'], '640 = 6 (rw-) cho chủ, 4 (r--) cho nhóm, 0 (---) cho người khác.'],
  ['`echo \'Thư mục: $HOME\'` in ra gì?', 'Thư mục: $HOME', ['Thư mục: /home/ten-ban', 'Thư mục: (rỗng)', 'Lỗi vì thiếu dấu nháy kép'], 'Nháy đơn giữ nguyên văn mọi ký tự, kể cả `$`. Chỉ nháy kép hoặc không nháy mới mở rộng biến.'],
  ['Khác nhau giữa `lệnh > f 2>&1` và `lệnh 2>&1 > f` là gì?', 'Cách đầu ghi cả stdout và stderr vào f; cách sau chỉ ghi stdout vào f', ['Hai cách hoàn toàn giống nhau', 'Cách sau ghi cả hai vào f, cách đầu thì không', 'Cách đầu làm lệnh chạy hai lần'], 'Shell xử lý chuyển hướng từ trái sang phải. Trong `2>&1 > f`, stderr được nối vào đích cũ (màn hình) trước khi stdout được chuyển sang f.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s, {}); },
  items: [
    { text: 'Tạo thư mục `on1/logs` và `on1/tmp` trong một lệnh bằng `mkdir -p`.', hint: 'mkdir -p on1/logs on1/tmp', check: function (s) { return hok(s, /^mkdir -p on1\/logs on1\/tmp$/) && !!s.fs.get(W(s) + 'on1/logs') && !!s.fs.get(W(s) + 'on1/tmp'); } },
    { text: 'Chép `todo.md` vào `on1/logs/todo-copy.md` bằng `cp`.', hint: 'cp todo.md on1/logs/todo-copy.md', check: function (s) { return exists(s, 'on1/logs/todo-copy.md') && ftxt(s, W(s) + 'on1/logs/todo-copy.md') === ftxt(s, W(s) + 'todo.md'); } },
    { text: 'Ghi `ngày 1` vào `on1/tmp/ghi.txt` bằng `>`, rồi nối thêm `ngày 2` bằng `>>`.', hint: 'echo "ngày 1" > on1/tmp/ghi.txt\necho "ngày 2" >> on1/tmp/ghi.txt', check: function (s) { return has(s, 'on1/tmp/ghi.txt', /^ngày 1\nngày 2\n$/); } },
    { text: 'Đếm số dòng của `on1/tmp/ghi.txt` và lưu kết quả vào `on1/count.txt` bằng `wc -l <` và `>`.', hint: 'wc -l < on1/tmp/ghi.txt > on1/count.txt', check: function (s) { return has(s, 'on1/count.txt', /^2\n$/); } },
    { text: 'Đặt quyền `640` cho `on1/count.txt`.', hint: 'chmod 640 on1/count.txt', check: function (s) { return mode(s, W(s) + 'on1/count.txt') === 416; } },
    { text: 'Liệt kê `notes.txt` và `khong-co` vào `on1/both.txt`, ghi cả lỗi, bằng `2>&1`.', hint: 'ls notes.txt khong-co > on1/both.txt 2>&1', check: function (s) { return has(s, 'on1/both.txt', /notes\.txt/) && /khong-co/.test(ftxt(s, W(s) + 'on1/both.txt')) && hok(s, /^ls notes\.txt khong-co$/); } }
  ]
};
T.debugs = [
  {
    id: 'ov1d1', title: 'Chạy script báo Permission denied',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ls -l run.sh', '-rw-r--r-- 1 haidangphan haidangphan 8 run.sh', '$ ./run.sh', 'bash: ./run.sh: Permission denied'),
    story: 'Bạn vừa tạo `run.sh` bằng redirect và muốn chạy ngay bằng `./run.sh`. Shell từ chối, dù nội dung file đúng.',
    goal: 'File `run.sh` có quyền thực thi (`x`), và `./run.sh` in ra `ok`.',
    hints: ['Xem quyền hiện tại của file bằng `ls -l`. Có chữ `x` nào không?', 'File mới tạo bằng `>` chỉ có quyền đọc và ghi. Cần thêm quyền thực thi.', '`chmod +x run.sh`, rồi `./run.sh`.'],
    fix: ['chmod +x run.sh', './run.sh'],
    cause: 'Lệnh `./file` cần bit thực thi. Redirect chỉ tạo nội dung, không cấp quyền chạy. Dùng `chmod +x` cho script, hoặc chạy trực tiếp bằng `bash run.sh`.',
    setup: function (s) { base(s, { setup2: function (s3) { s3.run('echo "echo ok" > ~/work/run.sh'); s3.hist.length = 0; s3.cwd = s3.home + '/work'; } }); },
    check: function (s) { var n = s.fs.get(W(s) + 'run.sh'); return !!n && (n.mode & 73) !== 0 && hok(s, /^\.\/run\.sh$/); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
