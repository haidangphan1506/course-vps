(function (G) {
'use strict';
/* Bài mới: WireGuard — đóng cổng SSH ra Internet, quản trị qua mạng riêng. */
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, cmds = V.cmds;
var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(seed) {
  var h = 7, s = '', i; seed = String(seed) || 'x';
  for (i = 0; i < 43; i++) { h = (Math.imul(h, 31) + seed.charCodeAt(i % seed.length) + i * 7) >>> 0; s += CHARS.charAt(h % 64); }
  return s.slice(0, 42) + 'A=';
}
C.wgPub = function (priv) { return b64('pub' + String(priv).trim()); };
var PEER = 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=';
var PEER_IP = '10.8.0.2/32';
function conf(s) { var n = s.fs.get('/etc/wireguard/wg0.conf'); return n && n.t === 'f' ? String(n.c || '') : null; }
function ufwBlocksWg(s) { var u = s.W.ufw; return !!(u && u.active && !u.rules.some(function (r) { return r.to === '51820/udp' && r.action === 'ALLOW'; })); }
function root(c, msg) { if (!c.sh.isRoot(c)) throw new V.CmdErr(msg); }

cmds.wg = function (a, c) {
  var sub = a[0], sh = c.sh;
  if (sub === 'genkey') { sh.W.wgn = (sh.W.wgn || 0) + 1; c.out(b64('priv' + sh.W.wgn) + '\n'); return 0; }
  if (sub === 'pubkey') {
    var k = (c.stdin || '').trim();
    if (!k) throw new V.CmdErr('Key is not the correct length or format');
    c.out(C.wgPub(k) + '\n'); return 0;
  }
  if (!sub || sub === 'show') {
    root(c, 'Unable to access interface: Operation not permitted');
    var w = sh.W.wg;
    if (!w || !w.up) return 0;
    var o = 'interface: wg0\n  public key: ' + w.pub + '\n  private key: (hidden)\n  listening port: ' + w.port + '\n\npeer: ' + (w.peer || PEER) + '\n  allowed ips: ' + (w.peerIp || PEER_IP) + '\n';
    if (!ufwBlocksWg(sh)) o += '  endpoint: 203.0.113.7:51514\n  latest handshake: 12 seconds ago\n  transfer: 1.52 KiB received, 1.98 KiB sent\n';
    c.out(o); return 0;
  }
  throw new V.CmdErr('Usage: wg <cmd> [<args>]\n\nAvailable subcommands:\n  show: Shows the current configuration and device information\n  genkey: Generates a new private key and writes it to stdout\n  pubkey: Reads a private key from stdin and writes a public key to stdout');
};
cmds['wg-quick'] = function (a, c) {
  var sh = c.sh, act = a[0], ifc = a[1];
  if (['up', 'down'].indexOf(act) < 0 || !ifc) throw new V.CmdErr('Usage: wg-quick [ up | down | save | strip ] [ CONFIG_FILE | INTERFACE ]');
  root(c, 'wg-quick: Permission denied (are you root?)');
  var W = sh.W, cf = '/etc/wireguard/' + ifc + '.conf';
  if (act === 'down') {
    if (!W.wg || !W.wg.up) throw new V.CmdErr("wg-quick: `" + ifc + "' is not a WireGuard interface");
    W.wg.up = false; c.out('[#] ip link delete dev ' + ifc + '\n'); return 0;
  }
  var t = conf(sh);
  if (t == null) throw new V.CmdErr("wg-quick: `" + cf + "' does not exist");
  if (W.wg && W.wg.up) throw new V.CmdErr("wg-quick: `" + ifc + "' already exists");
  var sec = '', port = 0, addr = '', priv = '', peer = '', peerIp = '', i, ln, m;
  var rows = t.split('\n');
  for (i = 0; i < rows.length; i++) {
    ln = rows[i].trim();
    if (!ln || ln.charAt(0) === '#') continue;
    if ((m = /^\[(Interface|Peer)\]$/i.exec(ln))) { sec = m[1].toLowerCase(); continue; }
    if (!(m = /^(\w+)\s*=\s*(.*)$/.exec(ln))) throw new V.CmdErr("Line unrecognized: `" + ln + "'\nConfiguration parsing error");
    var key = m[1].toLowerCase(), val = m[2].trim();
    if (sec === 'interface') { if (key === 'listenport') port = +val; else if (key === 'address') addr = val; else if (key === 'privatekey') priv = val; }
    else if (sec === 'peer') { if (key === 'publickey') peer = val; else if (key === 'allowedips') peerIp = val; }
  }
  if (!priv || priv === 'REPLACE_ME') throw new V.CmdErr('wg: Key is not the correct length or format\nConfiguration parsing error');
  var n = sh.fs.get(cf);
  if (n && (n.mode & 4)) c.err('Warning: `' + cf + "' is world accessible\n");
  c.out('[#] ip link add ' + ifc + ' type wireguard\n[#] wg setconf ' + ifc + ' /dev/fd/63\n[#] ip -4 address add ' + addr + ' dev ' + ifc + '\n[#] ip link set mtu 1420 up dev ' + ifc + '\n');
  W.wg = { up: true, port: port || 51820, addr: addr, pub: C.wgPub(priv), peer: peer, peerIp: peerIp };
  return 0;
};

function ufwHas(s, to, from) { return s.W.ufw.rules.some(function (r) { return r.to === to && r.action === 'ALLOW' && (!from || r.from === from); }); }
function wgUp(s) { return !!(s.W.wg && s.W.wg.up); }
function base(s, o) {
  o = o || {};
  C.vpsBase(s);
  var f = s.fs, u = s.user;
  f.mkdirp('/etc/wireguard', 'root', M('700'));
  s.W.ufw.active = true;
  s.W.ufw.rules = [{ to: 'OpenSSH', action: 'ALLOW', from: 'Anywhere' }, { to: '80/tcp', action: 'ALLOW', from: 'Anywhere' }, { to: '443/tcp', action: 'ALLOW', from: 'Anywhere' }];
  if (o.priv) {
    f.put('/etc/wireguard/private.key', o.priv + '\n', { owner: 'root', mode: M('600') });
    f.put('/etc/wireguard/wg0.conf', o.conf(o.priv), { owner: 'root', mode: M('600') });
  }
}
function tmpl(priv, lines) {
  return ['[Interface]', 'Address = 10.8.0.1/24', 'ListenPort = 51820', 'PrivateKey = ' + priv, '', '[Peer]', '# laptop', 'PublicKey = ' + PEER, 'AllowedIPs = ' + PEER_IP, ''].join('\n');
}
var K0 = b64('priv1');

var D = {
  id: 'wg1', group: 'Nền tảng', short: 'WireGuard: SSH qua mạng riêng',
  title: 'WireGuard: đóng cổng SSH ra Internet, quản trị qua mạng riêng',
  dek: 'Tạo mạng riêng 10.8.0.0/24 giữa laptop và VPS, rồi chỉ cho phép SSH từ mạng đó để bot không còn thấy cổng 22.',
  theory: [
    { tag: 'Khái niệm', title: 'Vì sao đóng cổng 22 ra Internet', body: [
      'Khoá SSH và fail2ban làm bot dò mật khẩu vô ích, nhưng cổng 22 vẫn mở, vẫn bị quét hằng giờ và vẫn đầy dòng `Failed password` trong log. Cách gọn hơn: không cho ai ngoài mạng riêng thấy cổng 22.',
      'WireGuard tạo một **mạng riêng** giữa các máy bằng cặp khoá. VPS lấy địa chỉ `10.8.0.1`, laptop lấy `10.8.0.2`. Bạn SSH tới `10.8.0.1`, còn ufw chỉ cho phép cổng 22 từ `10.8.0.0/24`.',
      { ul: ['Chỉ **một cổng UDP** (mặc định 51820) lộ ra Internet', 'WireGuard **không trả lời** gói không mang khoá hợp lệ, nên máy quét cổng không thấy gì', 'Mỗi máy chỉ cần giữ khoá riêng của chính nó; hai bên trao đổi **khoá công khai**'] }
    ] },
    { tag: 'Cú pháp', title: 'Khoá và file /etc/wireguard/wg0.conf', body: [
      { pre: ['sudo apt install -y wireguard', 'wg genkey | sudo tee /etc/wireguard/private.key', 'sudo chmod 600 /etc/wireguard/private.key', 'sudo cat /etc/wireguard/private.key | wg pubkey | sudo tee /etc/wireguard/public.key'], cap: 'Tạo khoá trên VPS (làm tương tự trên laptop)' },
      { pre: ['[Interface]', 'Address = 10.8.0.1/24', 'ListenPort = 51820', 'PrivateKey = <khoá riêng của VPS>', '', '[Peer]', '# laptop', 'PublicKey = <khoá công khai của laptop>', 'AllowedIPs = 10.8.0.2/32'], cap: 'wg0.conf trên VPS' },
      { tbl: [['Trường', 'Ý nghĩa', 'Lưu ý'], ['Address', 'Địa chỉ của máy này trong mạng riêng', 'Mỗi máy một địa chỉ khác nhau'], ['PrivateKey', 'Khoá riêng của máy này', 'Không bao giờ gửi đi; file phải `chmod 600`'], ['PublicKey (trong Peer)', 'Khoá công khai của máy kia', 'Dán nhầm khoá riêng hoặc khoá của chính mình là lỗi hay gặp'], ['AllowedIPs', 'Địa chỉ nào được đi qua peer này', 'Trên server: `10.8.0.2/32` (chỉ máy đó). Trên laptop: `10.8.0.0/24` nếu chỉ muốn route mạng riêng'], ['PersistentKeepalive', 'Gửi gói giữ kết nối', 'Đặt `25` trên laptop khi nằm sau NAT']] },
      { note: 'Lỗi cú pháp trong wg0.conf (thiếu dấu `=`, sai tên mục) làm `wg-quick up` báo `Line unrecognized` hoặc `Configuration parsing error` và giao diện không lên.', kind: 'warn' }
    ] },
    { tag: 'Cú pháp', title: 'Bật, kiểm tra và mở cổng UDP', body: [
      { pre: ['sudo wg-quick up wg0', 'sudo wg show', 'sudo ufw allow 51820/udp', 'sudo systemctl enable --now wg-quick@wg0     # tự chạy sau khi khởi động lại (không có trong mô phỏng)'] },
      { ul: ['`wg show` có dòng **latest handshake** nghĩa là hai bên đã bắt tay thành công', 'Không có handshake: khoá công khai dán sai, UDP 51820 bị ufw hoặc tường lửa nhà cung cấp chặn, hoặc laptop chưa gửi gói nào', 'Bắt tay chỉ xảy ra khi có lưu lượng; thử `ping 10.8.0.1` từ laptop'] }
    ] },
    { tag: 'Lưu ý', title: 'Thứ tự đóng cổng 22 để không tự khoá mình', body: [
      { pre: ['sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp   # 1. mở cho mạng riêng', 'ssh haidangphan@10.8.0.1                                       # 2. thử từ cửa sổ MỚI qua VPN', 'sudo ufw delete allow OpenSSH                                  # 3. chỉ khi bước 2 thành công', 'sudo ufw status numbered'], cap: 'Giữ nguyên phiên SSH cũ cho tới hết bước 2' },
      { note: 'Xoá luật OpenSSH khi VPN chưa chạy là tự khoá mình: chỉ gỡ được qua console của nhà cung cấp VPS. Đừng đổi `ListenAddress` của sshd sang 10.8.0.1: sshd có thể khởi động trước khi `wg0` lên và không bind được địa chỉ.', kind: 'warn' }
    ] }
  ],
  quiz: [
    { q: 'Hai máy WireGuard trao đổi thông tin nào với nhau?', opts: ['Khoá riêng của mỗi bên', 'Khoá công khai của mỗi bên', 'Mật khẩu root', 'File wg0.conf nguyên văn'], ans: 1, why: 'Khoá riêng ở yên trên máy của nó. Mỗi bên chỉ cần khoá công khai của bên kia để khai trong mục [Peer].' },
    { q: 'Trong wg0.conf trên VPS, `AllowedIPs` của peer laptop (địa chỉ VPN 10.8.0.2) nên là gì?', opts: ['0.0.0.0/0', '10.8.0.2/32', '116.118.9.210/32', '10.8.0.1/24'], ans: 1, why: 'Trên server, AllowedIPs liệt kê đúng địa chỉ VPN của peer đó. /32 là một máy duy nhất.' },
    { q: 'Thứ tự an toàn khi đóng cổng 22 ra Internet?', opts: ['Xoá luật OpenSSH, rồi bật WireGuard', 'Bật WireGuard, mở 22 cho 10.8.0.0/24, thử SSH qua VPN ở phiên mới, rồi mới xoá luật OpenSSH', 'Tắt ufw, cấu hình WireGuard, bật lại ufw', 'Khởi động lại VPS trước'], ans: 1, why: 'Chỉ xoá đường vào cũ sau khi đã chứng minh đường vào mới chạy, và vẫn giữ phiên cũ để sửa nếu hỏng.' },
    { q: '`sudo wg show` liệt kê peer nhưng không có dòng `latest handshake`. Nguyên nhân khả dĩ nào đúng?', opts: ['Đĩa đầy', 'UDP 51820 bị ufw chặn hoặc khoá công khai khai sai', 'Nginx chưa chạy', 'Chứng chỉ SSL hết hạn'], ans: 1, why: 'Bắt tay cần gói UDP đi tới cổng ListenPort và khoá khớp hai bên. Kiểm tra `ufw status` và so lại khoá công khai.' },
    { q: 'Vì sao file khoá riêng và wg0.conf phải `chmod 600`?', opts: ['WireGuard không đọc được file 644', 'Ai đọc được khoá riêng đều giả mạo được máy này trong mạng riêng', 'Để file nhỏ hơn', 'Để ufw nhận ra file'], ans: 1, why: 'Khoá riêng là danh tính của máy. wg-quick cũng cảnh báo `is world accessible` nếu file mở cho người khác đọc.' }
  ],
  lab: {
    host: 'vps', user: 'haidangphan',
    setup: function (s) { base(s); s.fs.put('/etc/wireguard/wg0.conf', tmpl('REPLACE_ME'), { owner: 'root', mode: M('644') }); },
    items: [
      { text: 'Cài gói WireGuard.', hint: 'sudo apt install -y wireguard', check: C.OK(/apt(-get)? install.*wireguard/) },
      { text: 'Tạo khoá riêng và lưu vào `/etc/wireguard/private.key` (dùng `wg genkey` và `sudo tee`).', hint: 'wg genkey | sudo tee /etc/wireguard/private.key', check: function (s) { return C.ftxt(s, '/etc/wireguard/private.key').trim().length === 44; } },
      { text: 'Chỉ root được đọc khoá riêng: đặt quyền 600 cho `private.key`.', hint: 'sudo chmod 600 /etc/wireguard/private.key', check: function (s) { var n = s.fs.get('/etc/wireguard/private.key'); return !!n && (n.mode & 511) === M('600'); } },
      { text: 'Sinh khoá công khai từ khoá riêng và lưu vào `/etc/wireguard/public.key`.', hint: 'sudo cat /etc/wireguard/private.key | wg pubkey | sudo tee /etc/wireguard/public.key', check: function (s) { var p = C.ftxt(s, '/etc/wireguard/private.key').trim(); return p.length === 44 && C.ftxt(s, '/etc/wireguard/public.key').trim() === C.wgPub(p); } },
      { text: 'File mẫu `wg0.conf` có dòng `PrivateKey = REPLACE_ME`. Thay bằng khoá riêng thật (dùng sed và `$(sudo cat ...)`).', hint: 'sudo sed -i "s|REPLACE_ME|$(sudo cat /etc/wireguard/private.key)|" /etc/wireguard/wg0.conf', check: function (s) { var p = C.ftxt(s, '/etc/wireguard/private.key').trim(); return p.length === 44 && C.ftxt(s, '/etc/wireguard/wg0.conf').indexOf('PrivateKey = ' + p) >= 0; } },
      { text: 'wg0.conf chứa khoá riêng: đặt quyền 600.', hint: 'sudo chmod 600 /etc/wireguard/wg0.conf', check: function (s) { var n = s.fs.get('/etc/wireguard/wg0.conf'); return !!n && (n.mode & 511) === M('600'); } },
      { text: 'Bật giao diện `wg0`.', hint: 'sudo wg-quick up wg0', check: function (s) { return wgUp(s); } },
      { text: 'Mở cổng UDP 51820 trong ufw.', hint: 'sudo ufw allow 51820/udp', check: function (s) { return ufwHas(s, '51820/udp'); } },
      { text: 'Xem trạng thái WireGuard và tìm dòng `latest handshake`.', hint: 'sudo wg show', check: C.OK(/^sudo wg( show)?$/) },
      { text: 'Cho phép SSH (22/tcp) chỉ từ mạng riêng `10.8.0.0/24`.', hint: 'sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp', check: function (s) { return ufwHas(s, '22/tcp', '10.8.0.0/24'); } },
      { text: 'Đóng cổng 22 ra Internet: xoá luật `OpenSSH` (VPN đã chạy nên an toàn).', hint: 'sudo ufw delete allow OpenSSH', check: function (s) { return wgUp(s) && ufwHas(s, '22/tcp', '10.8.0.0/24') && !ufwHas(s, 'OpenSSH'); } },
      { text: 'Kiểm tra lại danh sách luật có đánh số.', hint: 'sudo ufw status numbered', check: C.OK(/ufw status numbered/) }
    ]
  },
  debugs: [
    {
      id: 'wg1d1', title: 'wg-quick up báo "Line unrecognized"',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ sudo wg-quick up wg0', "Line unrecognized: `ListenPort51820'", 'Configuration parsing error'),
      story: 'Bạn vừa tự soạn `/etc/wireguard/wg0.conf` cho VPS. Khoá riêng đã điền đúng, nhưng giao diện wg0 không lên.',
      goal: '`wg-quick up wg0` chạy thành công và `wg show` hiện giao diện wg0.',
      hints: ['Thông báo nêu rõ dòng bị lỗi. Xem file: `sudo cat /etc/wireguard/wg0.conf`.', 'Dòng `ListenPort51820` thiếu dấu `=` giữa tên và giá trị.', 'Sửa bằng sed rồi bật lại: `sudo sed -i \'s/^ListenPort51820/ListenPort = 51820/\' /etc/wireguard/wg0.conf` rồi `sudo wg-quick up wg0`.'],
      fix: ["sudo sed -i 's/^ListenPort51820/ListenPort = 51820/' /etc/wireguard/wg0.conf", 'sudo wg-quick up wg0', 'sudo wg show'],
      cause: 'wg-quick đọc từng dòng dạng `Tên = Giá trị`. Một dòng sai cú pháp làm nó từ chối cả file. Đọc kỹ dòng được nêu trong thông báo, và nhớ giữ file `chmod 600`.',
      setup: function (s) { base(s, { priv: K0, conf: function (p) { return tmpl(p).replace('ListenPort = 51820', 'ListenPort51820'); } }); },
      check: function (s) { return wgUp(s) && /^ListenPort\s*=\s*51820/m.test(C.ftxt(s, '/etc/wireguard/wg0.conf')); }
    },
    {
      id: 'wg1d2', title: 'Giao diện đã lên nhưng laptop không bắt tay được',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ sudo wg show', 'interface: wg0', '  listening port: 51820', '', 'peer: ' + PEER, '  allowed ips: 10.8.0.2/32', '', '$ sudo ufw status | grep 51820', '(không có dòng nào)'),
      story: 'wg0 đã chạy trên VPS, khoá hai bên khớp, nhưng laptop không ping được 10.8.0.1 và `wg show` không có dòng `latest handshake`. Tường lửa ufw đang bật.',
      goal: 'Cổng UDP của WireGuard được mở và `sudo wg show` hiện `latest handshake`.',
      hints: ['Xem luật ufw: `sudo ufw status`. Có luật nào cho cổng 51820 không?', 'WireGuard dùng **UDP**, không phải TCP. Cần luật cho `51820/udp`.', 'Mở cổng: `sudo ufw allow 51820/udp`, rồi `sudo wg show` để thấy handshake.'],
      fix: ['sudo ufw allow 51820/udp', 'sudo wg show'],
      cause: 'ufw chặn mặc định mọi kết nối vào, kể cả UDP 51820, nên gói bắt tay không tới được WireGuard. WireGuard không báo lỗi khi bị chặn, nó chỉ im lặng; thiếu `latest handshake` là dấu hiệu.',
      setup: function (s) { base(s, { priv: K0, conf: tmpl }); s.run('sudo wg-quick up wg0'); },
      check: function (s) { return wgUp(s) && ufwHas(s, '51820/udp') && s.hist.some(function (h) { return h.code === 0 && /wg( show)?$/.test(h.cmd); }); }
    }
  ]
};
var idx = -1; C.lessons.forEach(function (l, i) { if (/^c2b/.test(l.id)) idx = i; });
C.lessons.splice(idx < 0 ? C.lessons.length : idx + 1, 0, D);
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
