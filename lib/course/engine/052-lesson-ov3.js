(function (G) {
'use strict';
/* Chương ov3: ôn tập tổng hợp 3 (tiến trình, lập lịch, script). Đặt ngay sau chương lb8, cuối nhóm Linux căn bản. */
var V = G.VPS, C = G.COURSE, L = C.L, OK = C.OK, FAIL = C.FAIL, ftxt = C.ftxt, LB = C.LB;
function base(s, o) { LB.base(s, o); }
var W = function (s) { return s.home + '/work/'; };
function hok(s, re) { return s.hist.some(function (h) { return re.test(h.cmd); }); }
function has(s, f, re) { return re.test(ftxt(s, W(s) + f)); }
function exists(s, f) { return !!s.fs.get(W(s) + f); }

var JOB = ['#!/bin/bash', 'echo "job bắt đầu"', 'echo "job kết thúc"'];

var T = {
  id: 'ov3', group: 'Linux căn bản', short: 'Ôn tập 3',
  title: 'Ôn tập 3: tiến trình, lập lịch và script',
  dek: 'Tổng hợp nhóm cuối của phần Linux căn bản: xem và dừng tiến trình, chạy nền an toàn, đặt lịch bằng cron, và viết script chạy không người trông với log rõ ràng. Hoàn thành bài này là bạn đã có đủ nền để vào phần Bảo mật và Nginx.'
};
C.insertAfter('lb8', T);

T.theory = [
  { tag: 'Ôn tập', title: 'Quy trình xử lý một tác vụ trên VPS', body: [
    { pre: ['# 1. Tìm tiến trình đang ngốn tài nguyên', 'ps aux --sort=-%cpu | head -5', '# 2. Dừng êm trước, mới dùng KILL nếu cần', 'kill -TERM 1234', 'kill -KILL 1234     # chỉ khi TERM không hiệu lực', '# 3. Đặt lịch chạy định kỳ, ghi log có thời gian', '(crontab -l 2>/dev/null; echo "0 3 * * * /home/ten-ban/bin/backup.sh >> /home/ten-ban/backup.log 2>&1") | crontab -'], cap: 'Thứ tự này an toàn hơn: luôn thử tín hiệu nhẹ trước, và luôn gom log của tác vụ nền vào một file.' },
    'Một script chạy trong cron cần đủ ba thứ: đường dẫn tuyệt đối (môi trường cron rất tối thiểu), log có đầu ra và lỗi, và mã thoát đúng để bạn biết nó thất bại.'
  ] },
  { tag: 'Ôn tập', title: 'Nhớ các điểm khác nhau quan trọng', body: [
    { tbl: [['Khái niệm', 'Ý nghĩa ngắn gọn'], ['`&` và `nohup`', 'Chạy nền; `nohup` giữ tác vụ sống sau khi đóng SSH'], ['Tín hiệu TERM và KILL', 'TERM cho tiến trình cơ hội dọn dẹp; KILL thì dừng ngay, không dọn'], ['`set -euo pipefail`', 'Dừng khi lỗi, cấm biến chưa đặt, và pipe lỗi thì báo lỗi'], ['`flock`', 'Khoá để hai lần chạy không đè lên nhau']] },
    { note: 'Một script chạy tay được nhưng qua cron thì lỗi hầu như luôn do PATH hoặc thư mục làm việc khác. Hãy thử thêm đường dẫn tuyệt đối trước.', kind: 'tip' }
  ] }
];

T.theory.push({"tag": "Bảng lệnh", "title": "Bảng giải thích từng lệnh và kết quả", "body": [{"tbl": [["Lệnh", "Giải thích", "Kết quả khi chạy"], ["`mkdir -p on3`", "Tạo thư mục on3 để chứa kết quả.", "(không in ra)"], ["`ps aux > on3/ps.txt`", "Lưu danh sách tiến trình vào ps.txt.", "[on3/ps.txt] USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND / root             1  0.0  0.6 167700 11800 ?    …"], ["`(crontab -l 2>/dev/null; echo \"30 2 * * * /home/haidangphan/work/job.sh\") | crontab -`", "Thêm lịch chạy job.sh lúc 2:30 mà vẫn giữ các dòng cũ.", "(không in ra)"], ["`bash job.sh >> on3/job.log 2>&1`", "Chạy job.sh, ghi cả đầu ra và lỗi vào job.log (nối thêm).", "[on3/job.log] job bắt đầu / job kết thúc"], ["`grep -c \"job bắt đầu\" on3/job.log`", "Đếm số lần job bắt đầu trong log: 2 lần chạy nên có 2 dòng.", "2"], ["`chmod +x job.sh`", "Cấp quyền chạy cho job.sh.", "(không in ra)"], ["`./job.sh > on3/done.txt && echo \"chạy xong\" >> on3/done.txt`", "Chạy job.sh, ghi đầu ra vào done.txt; chỉ khi thành công mới nối thêm chạy xong.", "[on3/done.txt] job bắt đầu / job kết thúc / chạy xong"]]}]});
T.quiz = C.QZ(2, [
  ['Tín hiệu nào nên thử trước khi dùng KILL để dừng một tiến trình?', 'TERM (15)', ['HUP (1)', 'CONT (18)', 'STOP (19)'], 'TERM cho tiến trình cơ hội dọn dẹp tài nguyên. KILL (9) không cho làm gì và chỉ nên là lựa chọn cuối.'],
  ['Trường thứ hai trong cron `30 2 * * *` là gì?', 'Giờ, tức 2 giờ sáng', ['Phút, tức 30 phút', 'Ngày trong tháng', 'Thứ trong tuần'], 'Năm trường lần lượt là phút, giờ, ngày trong tháng, tháng và thứ. Ở đây 30 là phút, 2 là giờ.'],
  ['Vì sao một script chạy được bằng tay nhưng qua cron thì không?', 'Cron có môi trường tối thiểu: PATH hẹp và thư mục làm việc khác', ['Cron không chạy được script bash', 'Script phải có quyền root để chạy qua cron', 'Cron luôn bị giới hạn 10 giây'], 'Cron không nạp các biến và PATH của phiên đăng nhập, nên hãy dùng đường dẫn tuyệt đối và ghi log để chẩn đoán.'],
  ['`set -euo pipefail` có tác dụng gì?', 'Dừng khi có lệnh lỗi, cấm biến chưa đặt, và báo lỗi nếu bất kỳ lệnh nào trong pipe lỗi', ['Tăng tốc script', 'Tự động cài thêm gói còn thiếu', 'Chạy mọi lệnh song song'], 'Ba cờ này giúp script không tiếp tục khi đã hỏng, một lỗi nhỏ không bị che lấp.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { base(s, { setup: function (s2, l, h) { LB.put(s2, h + '/job.sh', JOB.join('\n') + '\n', { mode: 493 }); } }); },
  items: [
    { text: 'Lưu danh sách tiến trình đang chạy vào `on3/ps.txt` bằng `ps aux`.', hint: 'mkdir -p on3\nps aux > on3/ps.txt', check: function (s) { return exists(s, 'on3/ps.txt') && hok(s, /^ps aux$/); } },
    { text: 'Thêm một lịch cron mới `30 2 * * * /home/haidangphan/work/job.sh` mà vẫn giữ các dòng cũ.', hint: '(crontab -l 2>/dev/null; echo "30 2 * * * /home/haidangphan/work/job.sh") | crontab -', check: function (s) { var c = s.W && s.W.lin && s.W.lin.cron && s.W.lin.cron[s.user]; return !!c && /30 2 \* \* \* \/home\/haidangphan\/work\/job\.sh/.test(c); } },
    { text: 'Chạy `job.sh` và ghi cả đầu ra lẫn lỗi vào `on3/job.log`, nối thêm bằng `>>`.', hint: 'bash job.sh >> on3/job.log 2>&1', check: function (s) { return has(s, 'on3/job.log', /job bắt đầu\njob kết thúc\n/) && hok(s, /^bash job\.sh$/); } },
    { text: 'Chạy `job.sh` lần nữa rồi đếm số lần `job bắt đầu` trong `on3/job.log` bằng `grep -c`.', hint: 'bash job.sh >> on3/job.log 2>&1\ngrep -c "job bắt đầu" on3/job.log', check: function (s) { return has(s, 'on3/job.log', /job bắt đầu[\s\S]*job bắt đầu/) && hok(s, /^grep -c job bắt đầu on3\/job\.log$/); } },
    { text: 'Đặt `job.sh` chạy được và chạy bằng đường dẫn, rồi ghi `chạy xong` vào `on3/done.txt`.', hint: 'chmod +x job.sh\n./job.sh > on3/done.txt && echo "chạy xong" >> on3/done.txt', check: function (s) { return has(s, 'on3/done.txt', /chạy xong/) && hok(s, /^chmod \+x job\.sh$/); } }
  ]
};
T.debugs = [
  {
    id: 'ov3d1', title: 'Job cron chạy mỗi đêm nhưng không có log',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ crontab -l', '0 3 * * * /home/haidangphan/work/job.sh', '(không có log nào được ghi, không ai biết job có chạy không)'),
    story: 'Bạn đã đặt lịch cho `job.sh` lúc 3 giờ sáng, nhưng sáng nào cũng không có log để kiểm tra. Dòng cron hiện tại không gửi đầu ra vào đâu cả.',
    goal: 'Crontab có đúng một dòng chạy `job.sh` lúc 3 giờ, và đầu ra cùng lỗi được ghi vào `/home/haidangphan/work/job.log`.',
    hints: ['Trong dòng cron, đầu ra của script đi đâu? Có redirect không?', 'Thêm `>> ... 2>&1` vào cuối lệnh để gom cả đầu ra và lỗi vào một file log.', 'Thay toàn bộ crontab: `printf "0 3 * * * /home/haidangphan/work/job.sh >> /home/haidangphan/work/job.log 2>&1\\n" | crontab -`, rồi `crontab -l`.'],
    fix: ['printf "0 3 * * * /home/haidangphan/work/job.sh >> /home/haidangphan/work/job.log 2>&1\\n" | crontab -', 'crontab -l'],
    cause: 'Cron không có terminal để hiển thị đầu ra. Nếu không redirect, đầu ra và lỗi bị bỏ đi và bạn không thể chẩn đoán. Luôn ghi log bằng `>> file 2>&1`, và dùng đường dẫn tuyệt đối.',
    setup: function (s) { base(s, { setup2: function (s3) { s3.run('printf "0 3 * * * /home/haidangphan/work/job.sh\\n" | crontab -'); s3.hist.length = 0; s3.cwd = s3.home + '/work'; } }); },
    check: function (s) { var c = s.W && s.W.lin && s.W.lin.cron && s.W.lin.cron[s.user]; return !!c && /^0 3 \* \* \* \/home\/haidangphan\/work\/job\.sh >> \/home\/haidangphan\/work\/job\.log 2>&1$/m.test(c); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
