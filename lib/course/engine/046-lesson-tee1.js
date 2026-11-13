(function (G) {
'use strict';
/* Chương tee1: lệnh tee (vừa xem vừa lưu, nối thêm, nhiều file, sudo tee). Đặt ngay sau chương heredoc (hd1). */
var V = G.VPS, C = G.COURSE, L = C.L, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var AND = function () { var f = arguments; return function (s) { for (var i = 0; i < f.length; i++) if (!f[i](s)) return false; return true; }; };
var W = function (s) { return s.home + '/work/'; };
function has(s, f, re) { return re.test(ftxt(s, W(s) + f)); }
function histN(s, re) { var n = 0; s.hist.forEach(function (h) { if (re.test(h.cmd)) n++; }); return n; }

var DEPLOY = ['#!/bin/bash', 'echo "đang triển khai"', 'echo "cảnh báo: cache trống" >&2', 'echo "xong"'];
var JOB = ['#!/bin/bash', 'echo "bắt đầu job"', 'echo "kết thúc job"'];
var BUILD = ['#!/bin/bash', 'echo "biên dịch..."', 'echo "lỗi: thiếu module x" >&2', 'exit 1'];

var T = {
  id: 'tee1', group: 'Linux căn bản', short: 'tee',
  title: 'tee: vừa xem vừa lưu, nối thêm và sudo tee',
  dek: 'Lệnh tee chép dữ liệu ra cả màn hình (hoặc pipe tiếp) lẫn file: ghi đè với tee, nối thêm với tee -a, ghi nhiều file cùng lúc, lưu log khi deploy, và vì sao cần sudo tee để ghi file trong /etc.'
};
C.insertAfter('hd1', T);

T.theory = [
  { tag: 'Khái niệm', title: 'tee chép stdin ra hai nơi', body: [
    '`tee` đọc dữ liệu từ stdin và **chép ra hai nơi**: stdout (để pipe tiếp, hoặc để bạn xem trên màn hình) và một hoặc nhiều file. Tên lệnh lấy từ chữ T trong ống nước: một nhánh đi tới file, một nhánh đi tiếp.',
    { pre: ['ls | tee list.txt | wc -l            # lưu danh sách, đồng thời đếm', './deploy.sh 2>&1 | tee deploy.log   # xem trực tiếp và có log', 'echo "dòng mới" | tee -a log.txt   # -a: nối thêm thay vì ghi đè', 'echo "x" | tee a.txt b.txt > /dev/null   # ghi hai file, im lặng'], cap: 'Bốn cách dùng tee hay gặp' },
    { tbl: [['Tùy chọn / cú pháp', 'Ý nghĩa'], ['`tee file`', 'Ghi đè file, vừa in ra màn hình'], ['`tee -a file`', 'Nối thêm vào cuối file (append)'], ['`tee f1 f2`', 'Ghi cùng nội dung vào nhiều file'], ['`tee file > /dev/null`', 'Chỉ ghi file, không in ra màn hình'], ['`lệnh 2>&1 \\| tee file`', 'Lưu cả stdout lẫn stderr']] },
    { note: 'Khác với `>`: `lệnh > file` chỉ ghi file, còn `lệnh | tee file` vừa ghi vừa cho dữ liệu đi tiếp. Nhờ vậy bạn đặt được `tee` giữa một pipeline dài mà không phá luồng.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Ghi đè hay nối thêm: tee và tee -a', body: [
    '`tee` mặc định **ghi đè** file (như `>`). Muốn giữ nội dung cũ và thêm dòng mới, dùng `-a` (như `>>`).',
    { pre: ['echo "dòng 1" | tee log.txt         # log.txt = dòng 1', 'echo "dòng 2" | tee log.txt         # ghi đè: chỉ còn dòng 2', 'echo "dòng 3" | tee -a log.txt      # nối thêm: dòng 2, dòng 3', 'cat log.txt'], cap: 'Dùng tee -a để nối; nếu quên -a, log cũ biến mất' },
    { note: 'Với log chạy lặp lại (cron, deploy nhiều lần), dùng `tee -a` là mặc định. Dùng `tee` không `-a` sẽ mất lịch sử từ lần chạy trước.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Lưu log khi chạy script và giữ mã thoát', body: [
    'Đây là lý do phổ biến nhất để dùng tee: vừa theo dõi tiến trình trên màn hình, vừa có bản ghi để xem lại sau.',
    { pre: ['./deploy.sh 2>&1 | tee -a deploy.log   # cả stdout và stderr, nối thêm', 'echo $?                               # mã của TEE, không phải của deploy.sh'], cap: 'Mã thoát của pipeline là mã của lệnh cuối' },
    { pre: ['set -o pipefail', './build.sh 2>&1 | tee build.log && echo "BUILD OK"'], cap: 'Với pipefail, lỗi của build.sh được trả về' },
    { note: 'Không có `pipefail`, `./build.sh | tee build.log && echo OK` vẫn in OK dù build lỗi, vì `tee` luôn thành công. Trong script hãy đặt `set -o pipefail` (hoặc `set -euo pipefail`) ở đầu.', kind: 'warn' }
  ] },
  { tag: 'Cú pháp', title: 'sudo tee: ghi file cần quyền root', body: [
    'Giống heredoc, `echo ... | sudo tee file` là cách ghi file trong `/etc`. Lý do: dấu `>` do **shell của bạn** mở file trước khi sudo chạy, nên `sudo echo x > /etc/...` vẫn báo `Permission denied`. `tee` là chương trình chạy dưới sudo nên tự mở file với quyền root.',
    { pre: ['echo "vm.swappiness = 10" | sudo tee /etc/sysctl.d/99-app.conf', 'echo "vm.dirty_ratio = 20" | sudo tee -a /etc/sysctl.d/99-app.conf', 'sudo sysctl --system           # nạp cấu hình mới'], cap: 'Ghi file cấu hình hệ thống' },
    { note: '`sudo tee` in nội dung ra màn hình. Thêm `> /dev/null` để giấu đi nếu bạn chỉ cần ghi file.', kind: 'tip' }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`ls | tee list.txt`", "tee ghi danh sách ra list.txt và vẫn hiện ra màn hình.", "build.sh / data / deploy.sh / logs / notes.txt / photos / projects / report.pdf / reports / scripts / tmp / todo.md"], ["`ls | tee list2.txt | wc -l`", "tee nằm giữa pipe: list2.txt nhận bản sao, wc nhận dữ liệu và đếm số mục.", "13"], ["`echo \"dòng 1\" > log.txt`", "Ghi dòng đầu tiên vào log.txt bằng >.", "[log.txt] dòng 1"], ["`echo \"dòng mới\" | tee -a log.txt`", "tee -a nối thêm dòng mới vào log.txt và in ra màn hình.", "dòng mới"], ["`echo \"chỉ còn\" | tee plain.txt`", "tee không có -a sẽ ghi đè plain.txt.", "chỉ còn"], ["`cat plain.txt`", "Xem nội dung plain.txt: chỉ còn một dòng.", "chỉ còn"], ["`echo \"x\" | tee a.txt b.txt > /dev/null`", "tee ghi cùng lúc vào a.txt và b.txt; > /dev/null bỏ bản in ra màn hình.", "(không in ra)"], ["`cat b.txt`", "Xem b.txt: cũng có dòng x.", "x"], ["`./deploy.sh 2>&1 | tee deploy.log`", "Chạy deploy.sh, cả stdout và stderr đi qua tee rồi vào deploy.log.", "đang triển khai / cảnh báo: cache trống / xong"], ["`./deploy.sh 2>&1 | tee -a deploy.log`", "tee -a nối thêm lần chạy mới vào deploy.log, log cũ được giữ.", "đang triển khai / cảnh báo: cache trống / xong"], ["`grep -c \"đang triển khai\" deploy.log`", "grep -c đếm số dòng có đang triển khai: 2 lần chạy nên có 2 dòng.", "2"], ["`echo \"vm.swappiness = 10\" | sudo tee /etc/sysctl.d/99-app.conf`", "sudo tee ghi cấu hình vào /etc/sysctl.d; tee in lại nội dung.", "vm.swappiness = 10"], ["`echo \"vm.dirty_ratio = 20\" | sudo tee -a /etc/sysctl.d/99-app.conf`", "sudo tee -a nối thêm dòng thứ hai vào file cấu hình của hệ thống.", "vm.dirty_ratio = 20"], ["`echo hi | tee /etc/motd`", "Thiếu sudo nên tee không ghi được vào /etc/motd, báo Permission denied; dòng hi vẫn được in ra.", "tee: /etc/motd: Permission denied / hi"], ["`set -o pipefail`", "Bật pipefail để lỗi của build.sh không bị che bởi tee.", "(không in ra)"], ["`./build.sh 2>&1 | tee build.log && echo \"BUILD OK\"`", "Chạy build.sh, tee lưu log. Vì build lỗi nên && không chạy lệnh echo BUILD OK.", "biên dịch... / lỗi: thiếu module x"]]}]});
T.quiz = C.QZ(2, [
  ['Điều gì làm `tee` khác `>`?', '`tee` vừa ghi file vừa cho dữ liệu đi tiếp ra stdout', ['`tee` chỉ đọc file', '`tee` luôn nối thêm', '`tee` chỉ dùng được với root'], 'Dùng khi muốn vừa xem/pipe tiếp vừa lưu.'],
  ['Muốn `tee` **nối thêm** vào cuối file (không xoá nội dung cũ), dùng tuỳ chọn nào?', '`-a`', ['`-n`', '`-r`', '`-o`'], '`tee -a file` nối thêm, giống `>>`. Mặc định `tee file` ghi đè.'],
  ['`echo "x" | tee a.txt b.txt` ghi dữ liệu vào đâu?', 'Cả `a.txt` và `b.txt`', ['Chỉ `a.txt`', 'Chỉ `b.txt`', 'Vào một file tên `a.txt b.txt`'], '`tee` nhận nhiều tên file và chép cùng nội dung vào tất cả.'],
  ['`./build.sh | tee build.log && echo OK` in OK dù build.sh lỗi. Vì sao?', 'Mã thoát của pipeline là mã của `tee` (luôn thành công)', ['`echo` không bao giờ lỗi', 'build.sh không trả mã lỗi', '`&&` bỏ qua lỗi'], 'Thêm `set -o pipefail` để pipeline trả mã lỗi của khâu thất bại.'],
  ['Cách ghi dòng cấu hình vào `/etc/sysctl.d/99-app.conf` bằng quyền root?', '`echo "x=1" | sudo tee /etc/sysctl.d/99-app.conf`', ['`sudo echo "x=1" > /etc/sysctl.d/99-app.conf`', '`echo "x=1" > sudo /etc/...`', '`sudo > /etc/... echo "x=1"`'], '`>` do shell của bạn mở file; `tee` chạy dưới sudo nên mở được file.'],
  ['`tee` có ghi được gì khi bị thiếu quyền ghi file đích và không có sudo?', 'Báo `Permission denied` và không ghi file', ['Ghi vào thư mục tạm', 'Tự động xin quyền root', 'Ghi một phần'], 'tee không tự nâng quyền; cần `sudo tee` nếu file thuộc root.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/deploy.sh', DEPLOY.join('\n') + '\n', { mode: 493 }); LB.put(s2, h + '/build.sh', BUILD.join('\n') + '\n', { mode: 493 }); } }); },
  items: [
    { text: 'Lưu danh sách: `ls | tee list.txt` (vừa in ra màn hình vừa ghi `list.txt`).', hint: 'ls | tee list.txt', check: function (s) { return has(s, 'list.txt', /notes\.txt/); } },
    { text: 'Vừa lưu vừa đếm: `ls | tee list2.txt | wc -l` (lưu `list2.txt`, và đếm số mục).', hint: 'ls | tee list2.txt | wc -l', check: function (s) { return has(s, 'list2.txt', /notes\.txt/) && histN(s, /^wc -l$/) > 0; } },
    { text: 'Tạo `log.txt` có `dòng 1` bằng `echo "dòng 1" > log.txt`, rồi nối thêm `dòng mới` bằng `tee -a`.', hint: 'echo "dòng 1" > log.txt\necho "dòng mới" | tee -a log.txt', check: function (s) { return has(s, 'log.txt', /^dòng 1\ndòng mới\n$/); } },
    { text: 'Ghi đè với `tee` (không `-a`): `echo "chỉ còn" | tee plain.txt`, rồi kiểm tra `plain.txt` còn đúng một dòng.', hint: 'echo "chỉ còn" | tee plain.txt\ncat plain.txt', check: function (s) { return has(s, 'plain.txt', /^chỉ còn\n$/); } },
    { text: 'Ghi hai file cùng lúc: `echo "x" | tee a.txt b.txt > /dev/null`, rồi xem `b.txt`.', hint: 'echo "x" | tee a.txt b.txt > /dev/null\ncat b.txt', check: function (s) { return has(s, 'a.txt', /^x\n$/) && has(s, 'b.txt', /^x\n$/); } },
    { text: 'Chạy `deploy.sh` và lưu cả stdout lẫn stderr vào `deploy.log` bằng `./deploy.sh 2>&1 | tee deploy.log`.', hint: './deploy.sh 2>&1 | tee deploy.log', check: function (s) { return has(s, 'deploy.log', /đang triển khai/) && has(s, 'deploy.log', /cảnh báo: cache trống/); } },
    { text: 'Ghi tiếp log bằng `tee -a`: chạy `./deploy.sh 2>&1 | tee -a deploy.log`, rồi đếm dòng `đang triển khai` trong `deploy.log` bằng `grep -c`.', hint: './deploy.sh 2>&1 | tee -a deploy.log\ngrep -c "đang triển khai" deploy.log', check: function (s) { return has(s, 'deploy.log', /đang triển khai[\s\S]*đang triển khai/) && histN(s, /^grep -c/) > 0; } },
    { text: 'Ghi file hệ thống bằng `sudo tee`: tạo `/etc/sysctl.d/99-app.conf` với `vm.swappiness = 10`.', hint: 'echo "vm.swappiness = 10" | sudo tee /etc/sysctl.d/99-app.conf', check: function (s) { return /vm\.swappiness = 10/.test(ftxt(s, '/etc/sysctl.d/99-app.conf')); } },
    { text: 'Nối thêm dòng vào file đó bằng `sudo tee -a`: thêm `vm.dirty_ratio = 20`.', hint: 'echo "vm.dirty_ratio = 20" | sudo tee -a /etc/sysctl.d/99-app.conf', check: function (s) { return /vm\.swappiness = 10/.test(ftxt(s, '/etc/sysctl.d/99-app.conf')) && /vm\.dirty_ratio = 20/.test(ftxt(s, '/etc/sysctl.d/99-app.conf')); } },
    { text: 'Thử ghi `/etc/motd` bằng `tee` không có sudo để thấy bị từ chối (so với `sudo tee` ở trên).', hint: 'echo hi | tee /etc/motd', check: FAIL(/^tee \/etc\/motd$/) },
    { text: 'Bật pipefail rồi chạy `./build.sh 2>&1 | tee build.log && echo "BUILD OK"`: kiểm tra `build.log` có log và không in BUILD OK.', hint: 'set -o pipefail\n./build.sh 2>&1 | tee build.log && echo "BUILD OK"', check: function (s) { return !!(s.flags && s.flags.pipefail) && has(s, 'build.log', /biên dịch/) && histN(s, /BUILD OK/) === 0; } }
  ]
};

T.debugs = [
  {
    id: 'tee1d1', title: 'Log của lần chạy trước bị mất',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ./job.sh | tee run.log', 'bắt đầu job', 'kết thúc job', '$ cat run.log', 'bắt đầu job', 'kết thúc job', '# lần chạy hôm qua đâu rồi?'),
    story: 'Bạn chạy job hằng ngày bằng `./job.sh | tee run.log` để xem log. Hôm qua có một lần chạy, nhưng hôm nay file chỉ còn đúng lần chạy mới nhất.',
    goal: 'Sau khi chạy lại, `run.log` có **hai** lần chạy (lần cũ còn nguyên, lần mới nối thêm vào cuối).',
    hints: ['`tee` không có `-a` làm gì với file đã tồn tại?', '`tee file` ghi đè (như `>`). Cần tuỳ chọn để nối thêm.', 'Chạy `./job.sh | tee -a run.log`, rồi `grep -c "bắt đầu job" run.log` để đếm.'],
    fix: ['./job.sh | tee -a run.log', 'grep -c "bắt đầu job" run.log'],
    cause: '`tee file` mở file với chế độ ghi đè, nên nội dung cũ bị xoá trước khi ghi. Với log cần giữ lịch sử, dùng `tee -a` (tương ứng `>>`).',
    setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/job.sh', JOB.join('\n') + '\n', { mode: 493 }); LB.put(s2, h + '/run.log', 'bắt đầu job\nkết thúc job\n'); } }); },
    check: function (s) { var t = ftxt(s, W(s) + 'run.log'); return (t.match(/bắt đầu job/g) || []).length >= 2; }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
