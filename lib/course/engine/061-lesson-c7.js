(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran;
var GiB = 1073741824;

function usedPct(s) {
  var u = s.W.diskBaseGB * GiB + (s.W.heldBytes || 0);
  for (var k in s.fs.n) { var n = s.fs.n[k]; if (n.t === 'f' && n.size != null) u += n.size; }
  return u / (90 * GiB) * 100;
}
var OWN_IP = '203.0.113.7', BAD_IP = '103.149.28.77';

C.lesson({
  id: 'c7', group: 'Vận hành', short: 'Giám sát và log',
  title: 'Giám sát: đĩa, RAM, log và tấn công dò mật khẩu',
  dek: 'Đọc df, free, journalctl, auth.log; gỡ lỗi đầy đĩa vì log và chặn IP dò SSH.',
  theory: [
    { tag: 'Khái niệm', title: 'Kiểm tra sức khoẻ VPS mỗi ngày', body: [
      'Ba thứ làm sập VPS nhiều nhất: **đầy đĩa**, **hết RAM**, và **tiến trình chết im lặng**. Thói quen 30 giây:',
      { pre: ['df -h               # đĩa: cột Use% của /', 'free -h             # RAM và swap', 'pm2 list; docker ps    # ứng dụng', 'sudo ss -tlnp        # cổng nào đang mở'] },
      { note: 'Trên đĩa 90G, Use% từ 85% trở lên là lúc phải xử lý, đừng đợi 100%.', kind: 'tip' }
    ] },
    { tag: 'Cú pháp', title: 'Đọc log đúng chỗ', body: [
      { tbl: [['Cần xem', 'Lệnh'], ['Dịch vụ systemd (nginx, ssh)', '`sudo journalctl -u nginx -n 50 --no-pager`'], ['Truy cập và lỗi Nginx', '`sudo tail -n 50 /var/log/nginx/error.log`'], ['Đăng nhập SSH', '`sudo grep "Failed password" /var/log/auth.log`'], ['Ứng dụng Node', '`pm2 logs TEN --lines 50 --nostream`'], ['Container', '`docker logs TEN --tail 50`']] },
      'Luôn thêm `-n`/`--tail` để không đổ cả file ra màn hình.'
    ] },
    { tag: 'Cú pháp', title: 'Tìm kẻ dò mật khẩu bằng pipeline', body: [
      { pre: ['sudo grep "Failed password" /var/log/auth.log \\', '  | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" \\', '  | sort | uniq -c | sort -rn | head -5'], cap: 'Top 5 IP thất bại nhiều nhất' },
      { ul: ['`grep -oE` chỉ in phần khớp (địa chỉ IP)', '`sort | uniq -c` gom và đếm; `sort -rn` xếp giảm dần', '`sudo lastb | head` liệt kê đăng nhập thất bại gần nhất'] }
    ] },
    { tag: 'Quy trình', title: 'Chặn một IP', body: [
      { pre: ['sudo fail2ban-client set sshd banip 103.149.28.77', 'sudo ufw insert 1 deny from 103.149.28.77', 'sudo fail2ban-client status sshd'], cap: 'Hai cách; fail2ban còn tự cấm tạm thời theo luật' },
      { note: 'Trước khi chặn, so lại IP với IP của chính bạn (dòng "Accepted publickey"). Chặn nhầm IP nhà mình là cách tự khoá mình.', kind: 'warn' },
      'Chặn IP chỉ là giảm ồn. Gốc rễ bảo mật vẫn là khoá SSH, tắt mật khẩu và fail2ban (hai chương Bảo mật).'
    ] },
    { tag: 'Lưu ý', title: 'Xoá file log đang được mở: đĩa không giảm', body: [
      'Nginx giữ file `access.log` mở. Nếu bạn `rm` file đó, tên biến mất nhưng dung lượng chỉ được trả lại khi tiến trình đóng file. `df` vẫn báo đầy.',
      { pre: ['sudo truncate -s 0 /var/log/nginx/access.log     # làm rỗng, trả dung lượng ngay', 'sudo systemctl reload nginx                    # hoặc: Nginx mở lại file, trả nốt phần cũ'] },
      'Lâu dài: bật `logrotate` (đã có sẵn cho Nginx) và giới hạn journal: `sudo journalctl --vacuum-size=200M`.'
    ] }
  ],
  quiz: [
    { q: 'Bạn rm file access.log 40GB nhưng df vẫn báo đĩa đầy. Vì sao?', opts: ['df chậm cập nhật 1 ngày', 'Nginx vẫn mở file đó nên dung lượng chưa được trả; cần truncate hoặc reload Nginx', 'Cần fsck', 'rm chỉ chạy được với sudo'], ans: 1, why: 'Dung lượng chỉ được giải phóng khi không còn tiến trình nào giữ file mở.' },
    { q: 'Lệnh nào cho top IP thất bại nhiều nhất trong auth.log?', opts: ['cat auth.log | wc -l', 'grep "Failed password" auth.log | grep -oE <IP> | sort | uniq -c | sort -rn | head', 'df -h | sort', 'ss -tlnp | uniq'], ans: 1, why: 'Lọc dòng thất bại, trích IP, đếm trùng, xếp giảm dần.' },
    { q: 'Trước khi `ufw deny from <IP>`, bạn nên làm gì?', opts: ['Khởi động lại Nginx', 'Đảm bảo IP đó không phải IP của chính mình', 'Tắt fail2ban', 'Xoá auth.log'], ans: 1, why: 'Chặn nhầm IP của mình sẽ tự khoá khỏi VPS.' }
  ],
  lab: {
    host: 'vps', user: 'haidangphan',
    setup: function (s) { C.vpsBase(s); C.gateway(s, { up: true }); },
    items: [
      { text: 'Xem dung lượng đĩa dạng dễ đọc.', hint: 'df -h', check: function (s) { return ran(s, /^df -\w*h/); } },
      { text: 'Xem RAM và swap.', hint: 'free -h', check: function (s) { return ran(s, /^free -h/); } },
      { text: 'Xem 20 dòng log Nginx qua journalctl, không phân trang.', hint: 'sudo journalctl -u nginx -n 20 --no-pager', check: function (s) { return ran(s, /^sudo journalctl .*-u nginx/); } },
      { text: 'Lấy top 5 IP dò mật khẩu: grep "Failed password", trích IP bằng `grep -oE`, rồi `sort | uniq -c | sort -rn | head -5`.', hint: 'sudo grep "Failed password" /var/log/auth.log | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" | sort | uniq -c | sort -rn | head -5', check: function (s) { return ran(s, /^uniq -c/) && ran(s, /^sort -rn/) && ran(s, /auth\.log/); } },
      { text: 'Xem đăng nhập thất bại gần nhất bằng `lastb`, chỉ 10 dòng đầu.', hint: 'sudo lastb | head', check: function (s) { return ran(s, /^sudo lastb/); } },
      { text: 'Xem CPU/RAM từng container một lần (không treo màn hình).', hint: 'docker stats --no-stream', check: function (s) { return ran(s, /^docker stats .*--no-stream/); } }
    ]
  },
  debugs: [
    {
      id: 'c7d1', title: 'Đĩa đầy 92%, nghi do log',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ df -h', 'Filesystem      Size  Used Avail Use% Mounted on', '/dev/vda1        90G   83G  7.0G  92% /', '', '$ sudo apt install foo', 'E: You don\'t have enough free space in /var/cache/apt/archives/.'),
      story: 'Máy chủ chạy 8 tháng, chưa ai dọn log. Cảnh báo dung lượng đến từ nhà cung cấp VPS. Cần giải phóng đĩa mà không làm gián đoạn website.',
      goal: 'Mức dùng đĩa dưới 70%, Nginx vẫn chạy.',
      hints: ['Tìm thủ phạm: `sudo du -sh /var/log/nginx/* /var/log/journal/*`.', 'access.log phình to. Với file đang được Nginx mở, làm rỗng thay vì xoá: `sudo truncate -s 0 <file>`.', 'Nếu bạn đã dùng `rm`, hãy `sudo systemctl reload nginx` để Nginx đóng file cũ; sau đó kiểm tra lại bằng `df -h`.'],
      fix: ['df -h', 'sudo du -sh /var/log/nginx/*', 'sudo truncate -s 0 /var/log/nginx/access.log', 'df -h'],
      cause: 'Log truy cập không giới hạn cuối cùng ăn hết đĩa. Làm rỗng (truncate) trả dung lượng ngay mà không cần dừng Nginx. Về lâu dài: logrotate cho Nginx, `journalctl --vacuum-size=200M`, và cảnh báo khi Use% vượt 80%.',
      setup: function (s) {
        C.vpsBase(s);
        s.fs.put('/var/log/nginx/access.log', '', { owner: 'root', mode: M('640'), size: 44 * GiB });
        s.fs.get('/var/log/nginx/access.log').held = true;
        s.fs.put('/var/log/nginx/error.log', '', { owner: 'root', mode: M('640'), size: 4 * GiB });
        s.fs.put('/var/log/journal/system.journal', '', { owner: 'root', mode: M('640'), size: 4 * GiB });
      },
      check: function (s) { return usedPct(s) < 70 && s.W.nginx.active; }
    },
    {
      id: 'c7d2', title: 'Một IP dò mật khẩu SSH liên tục',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ sudo grep -c "Failed password" /var/log/auth.log', '925', '', '$ sudo tail -n 3 /var/log/auth.log', '... Failed password for root from 103.149.28.77 port 41722 ssh2', '... Failed password for invalid user admin from 103.149.28.77 port 41730 ssh2', '... Accepted publickey for haidangphan from 203.0.113.7 port 51022 ssh2'),
      story: 'Auth.log đầy dòng thất bại. IP của chính bạn là 203.0.113.7 (dòng "Accepted"). Hãy xác định kẻ tấn công nhiều nhất và chặn đúng IP đó.',
      goal: 'IP tấn công nhiều nhất bị chặn (fail2ban hoặc ufw), IP của bạn vẫn an toàn.',
      hints: ['Chạy pipeline đếm: grep "Failed password", grep -oE IP, sort, uniq -c, sort -rn, head.', 'IP đứng đầu có hàng trăm lần thất bại. Không phải 203.0.113.7.', '`sudo fail2ban-client set sshd banip <IP>` hoặc `sudo ufw deny from <IP>`.'],
      fix: ['sudo grep "Failed password" /var/log/auth.log | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" | sort | uniq -c | sort -rn | head -5', 'sudo fail2ban-client set sshd banip ' + BAD_IP, 'sudo fail2ban-client status sshd'],
      cause: 'Pipeline đếm biến log thô thành câu trả lời trong vài giây. Chặn IP chỉ giảm tiếng ồn; vì kẻ tấn công đổi IP liên tục, phòng thủ thật là khoá SSH, tắt mật khẩu và fail2ban tự động (hai chương Bảo mật).',
      setup: function (s) {
        var a = {}; a[BAD_IP] = 900; a['185.220.101.4'] = 18; a['92.118.39.62'] = 7;
        C.vpsBase(s, { attackers: a });
      },
      check: function (s) {
        function banned(ip) { return s.W.f2b.banned.indexOf(ip) >= 0 || s.W.ufw.rules.some(function (r) { return r.from === ip && /deny|reject/i.test(r.action); }); }
        return banned(BAD_IP) && !banned(OWN_IP);
      }
    }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
