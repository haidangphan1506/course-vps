(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, M = C.M;
var idx = -1, old = null;
C.lessons.forEach(function (l, i) { if (l.id === 'c2') { idx = i; old = l; } });
C.old2 = old;
C.pick2 = function (title) { var r = old.theory.filter(function (t) { return t.title === title; })[0]; if (!r) throw new Error('no card ' + title); return r; };
C.pickQ2 = function (prefix) { var r = old.quiz.filter(function (q) { return q.q.indexOf(prefix) === 0; })[0]; if (!r) throw new Error('no quiz ' + prefix); return r; };
C.pickD2 = function (id) { var r = old.debugs.filter(function (d) { return d.id === id; })[0]; if (!r) throw new Error('no debug ' + id); return r; };
var A = { id: 'c2a', group: 'Nền tảng', short: 'Bảo mật: cổng và tường lửa', title: 'Bảo mật VPS (1): cổng mở, tường lửa, cập nhật và đường hầm', dek: 'Chỉ mở cổng cần thiết, hiểu vì sao Docker làm thủng ufw, giới hạn theo IP, che sau Cloudflare, vá lỗi tự động và truy cập DB bằng SSH tunnel.', theory: [], quiz: [], lab: null, debugs: [] };
var B = { id: 'c2b', group: 'Nền tảng', short: 'Bảo mật: SSH và ứng phó', title: 'Bảo mật VPS (2): người dùng, khoá SSH, fail2ban và ứng phó sự cố', dek: 'Tạo user thường, quản lý khoá và authorized_keys, cứng hoá sshd, đổi cổng an toàn, cấu hình fail2ban, giữ bí mật và dọn dẹp khi bị xâm nhập.', theory: [], quiz: [], lab: null, debugs: [] };
C.A2 = A; C.B2 = B;
C.lessons.splice(idx, 1, A, B);

/* nền chung cho các bài bảo mật */
C.secBase = function (s, o) {
  o = o || {};
  var f = s.fs, h = s.home, u = s.user, W = s.W;
  C.vpsBase(s, o.vps);
  W.noSudo = false;
  f.mkdirp(h + '/.ssh', u, M('700'));
  f.put(h + '/.ssh/authorized_keys', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5K1main duong@laptop\nssh-ed25519 AAAAC3NzaC1lZDI1NTE5K0old old-laptop\n', { owner: u, mode: M(o.akMode || '600') });
  if (o.sshMode) f.get(h + '/.ssh').mode = M(o.sshMode);
  f.put('/etc/fail2ban/jail.conf', '# jail.conf (đừng sửa file này, tạo jail.local để ghi đè)\n[DEFAULT]\nbantime = 10m\nfindtime = 10m\nmaxretry = 5\nignoreip = 127.0.0.1/8 ::1\n\n[sshd]\nenabled = true\n', { owner: 'root' });
  f.mkdirp('/etc/ssh/sshd_config.d', 'root');
  if (o.cloudInit !== false) f.put('/etc/ssh/sshd_config.d/50-cloud-init.conf', 'PasswordAuthentication yes\n', { owner: 'root' });
  f.mkdirp('/etc/sudoers.d', 'root', M('755'));
  if (!o.fresh) { W.ufw.active = true; W.svc.ufw = true; W.ufw.defIn = 'deny'; W.ufw.defOut = 'allow';
  W.ufw.rules = [{ to: 'OpenSSH', action: 'ALLOW', from: 'Anywhere' }, { to: '80/tcp', action: 'ALLOW', from: 'Anywhere' }, { to: '443/tcp', action: 'ALLOW', from: 'Anywhere' }]; }
  V.sec.sync(s);
  V.sec.snapshot(s);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
