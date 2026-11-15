(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran;

var ENV_OK = 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=Ab12cd34ef56\nDB_PASSWORD=Ab12cd34ef56\n';
// Dựng thư mục ~/tutor/gateway. o: {compose, env, up, db}
C.gateway = function (s, o) {
  o = o || {};
  var d = s.home + '/tutor/gateway', u = s.user;
  s.fs.mkdirp(d, u);
  s.fs.put(d + '/docker-compose.yml', o.compose || C.composeFile, { owner: u });
  s.fs.put(d + '/docker.env', o.env != null ? o.env : ENV_OK, { owner: u, mode: M('600') });
  s.W.db = o.db || { initialized: false, password: null, user: 'app' };
  if (o.up) { var sc = s.cwd; s.cwd = d; s.silent('docker compose --env-file docker.env up -d'); s.cwd = sc; }
};
C.ENV_OK = ENV_OK;

function ctRunning(s, name) { return s.W.containers.some(function (c) { return c.name === name && c.state === 'running'; }); }

C.lesson({
  id: 'c5', group: 'Ứng dụng', short: 'Docker và Compose',
  title: 'Docker Compose: Postgres và API NestJS',
  dek: 'Chạy backend bằng Compose, quản lý mật khẩu qua file env, đọc log container và gỡ lỗi 502, thiếu biến, sai mật khẩu DB.',
  theory: [
    { tag: 'Khái niệm', title: 'Image, container, Compose', body: [
      '**Image** là bản đóng gói (như file cài đặt), **container** là bản đang chạy từ image. **Compose** mô tả cả bộ nhiều container trong một file `docker-compose.yml` để bật/tắt bằng một lệnh.',
      { pre: ['cd ~/tutor/gateway', 'docker compose --env-file docker.env up -d     # tạo và chạy nền', 'docker compose ps', 'docker compose logs api --tail 30', 'docker compose down                           # xoá container, GIỮ volume dữ liệu'] },
      { note: '`down -v` xoá luôn volume, tức **mất toàn bộ dữ liệu Postgres**. Chỉ dùng khi chủ ý.', kind: 'warn' }
    ] },
    { tag: 'Cú pháp', title: 'File compose của dự án tutor', body: [
      { pre: ['services:', '  postgres:', '    image: postgres:16', '    container_name: tutor-postgres', '    env_file: [docker.env]', '    ports: ["127.0.0.1:5432:5432"]', '    volumes: [pgdata:/var/lib/postgresql/data]', '  api:', '    image: tutor-api:latest', '    container_name: tutor-api', '    env_file: [docker.env]', '    ports: ["127.0.0.1:8888:8888"]', '    depends_on: [postgres]'], cap: 'Rút gọn' },
      { ul: ['`127.0.0.1:8888:8888` = chỉ máy chủ gọi được, Nginx đứng ngoài làm cửa', '`env_file` nạp biến từ `docker.env`; file này chứa mật khẩu nên `chmod 600` và không commit', '`depends_on` chỉ lo thứ tự khởi động, không đợi DB thật sự sẵn sàng'] }
    ] },
    { tag: 'Lưu ý', title: 'Mật khẩu Postgres chỉ có hiệu lực lần khởi tạo đầu', body: [
      'Biến `POSTGRES_PASSWORD` chỉ được dùng khi **volume dữ liệu còn trống**. Sau đó đổi biến trong env không đổi được mật khẩu trong DB: API mang mật khẩu mới, DB vẫn giữ mật khẩu cũ và báo `password authentication failed`.',
      { pre: ['docker exec tutor-postgres psql -U postgres -c "ALTER USER app WITH PASSWORD \'MAT_KHAU_MOI\';"', 'docker compose --env-file docker.env restart api'], cap: 'Đổi mật khẩu đúng cách, rồi khởi động lại API' },
      'Sinh mật khẩu ngẫu nhiên: `openssl rand -hex 24`.'
    ] },
    { tag: 'Lưu ý', title: 'restart khác up -d', body: [
      { tbl: [['Lệnh', 'Làm gì', 'Nạp lại env?'], ['`compose restart api`', 'Dừng rồi chạy lại **cùng container**', 'Không'], ['`compose up -d`', 'Tạo lại container nếu cấu hình hoặc env đổi', 'Có']] },
      'Sửa `docker.env` hoặc `docker-compose.yml` thì phải `up -d`, không phải `restart`. Ngược lại nếu chỉ đổi dữ liệu bên trong DB (như ALTER USER) thì `restart api` là đủ.'
    ] },
    { tag: 'Bảng tra', title: 'Đọc trạng thái và log', body: [
      { tbl: [['Lệnh', 'Dùng khi'], ['`docker ps`', 'Container nào đang chạy, cổng nào'], ['`docker ps -a`', 'Cả container đã thoát'], ['`docker logs tutor-api --tail 50`', 'Xem lỗi của ứng dụng'], ['`docker exec tutor-postgres psql -U app -c "\\dt"`', 'Chạy truy vấn trong DB'], ['`docker compose config --quiet`', 'Kiểm tra cú pháp compose và biến thiếu']] },
      { tbl: [['Trạng thái', 'Ý nghĩa'], ['Up ... (healthy)', 'Ổn'], ['Restarting (1) ...', 'Tiến trình chết ngay khi chạy, Docker khởi động lại liên tục: đọc `docker logs`'], ['Exited (0/1)', 'Đã dừng']] }
    ] },
    { tag: 'Quy trình', title: 'Gỡ lỗi 502 từ Nginx', body: [
      'Nginx trả **502 Bad Gateway** nghĩa là Nginx chạy nhưng không nói chuyện được với upstream. Đi từ trong ra ngoài:',
      { ul: ['`docker ps`: container có Up không?', '`sudo ss -tlnp | grep 8888`: cổng có đang lắng nghe không?', '`grep proxy_pass /etc/nginx/sites-enabled/*`: Nginx đang trỏ đúng cổng đó chưa?', '`docker logs`: ứng dụng có tự thoát không?'] }
    ] }
  ],
  quiz: [
    { q: 'Bạn sửa POSTGRES_PASSWORD trong docker.env cho một DB đã chạy lâu. API báo "password authentication failed". Vì sao?', opts: ['Docker lỗi', 'Postgres chỉ nhận POSTGRES_PASSWORD khi khởi tạo volume lần đầu, DB vẫn giữ mật khẩu cũ', 'Cổng 5432 bị chặn', 'API cần cài lại'], ans: 1, why: 'Phải đổi trong chính DB bằng ALTER USER, rồi restart API.' },
    { q: 'Container api ở trạng thái "Restarting (1) 6 seconds ago". Bước đầu tiên?', opts: ['docker compose down -v', 'docker logs tutor-api --tail 30', 'Khởi động lại VPS', 'ufw allow 8888'], ans: 1, why: 'Restarting nghĩa là tiến trình chết ngay; log cho biết lý do. Tuyệt đối không dùng -v kẻo mất dữ liệu.' },
    { q: 'Vì sao nên publish cổng là "127.0.0.1:8888:8888" thay vì "8888:8888"?', opts: ['Nhanh hơn', 'Để cổng không lộ ra Internet, kể cả khi ufw bị Docker đi vòng', 'Bắt buộc của Compose', 'Để dùng được HTTPS'], ans: 1, why: 'Docker thêm luật NAT riêng nên ufw không chặn được cổng publish; bind vào loopback là cách an toàn.' }
  ],
  lab: {
    host: 'vps', user: 'haidangphan',
    setup: function (s) { C.vpsBase(s); C.gateway(s); },
    items: [
      { text: 'Vào thư mục `~/tutor/gateway`.', hint: 'cd ~/tutor/gateway', check: function (s) { return /\/tutor\/gateway$/.test(s.cwd); } },
      { text: 'Đọc file `docker-compose.yml`.', hint: 'cat docker-compose.yml', check: function (s) { return ran(s, /^cat .*docker-compose\.yml/); } },
      { text: 'Kiểm tra cú pháp compose (chỉ báo lỗi, không in nội dung) với `--env-file docker.env`.', hint: 'docker compose --env-file docker.env config --quiet', check: function (s) { return ran(s, /^docker compose .*config/); } },
      { text: 'Khởi động cả hai dịch vụ ở chế độ nền.', hint: 'docker compose --env-file docker.env up -d', check: function (s) { return ctRunning(s, 'tutor-postgres') && ctRunning(s, 'tutor-api'); } },
      { text: 'Liệt kê container đang chạy.', hint: 'docker ps', check: function (s) { return ran(s, /^docker ps/); } },
      { text: 'Xem 20 dòng log cuối của `tutor-api`.', hint: 'docker logs tutor-api --tail 20', check: function (s) { return ran(s, /^docker logs .*tutor-api/); } },
      { text: 'Chạy lệnh `\\dt` trong Postgres để xem các bảng.', hint: 'docker exec tutor-postgres psql -U app -c "\\dt"', check: function (s) { return ran(s, /^docker exec .*psql/); } }
    ]
  },
  debugs: [
    {
      id: 'c5d1', title: 'api-tutor.haiphan.org trả 502 Bad Gateway',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ curl -sSI -H "Host: api-tutor.haiphan.org" http://127.0.0.1', 'HTTP/1.1 502 Bad Gateway', '', '$ docker ps', 'tutor-api   Up 2 minutes   127.0.0.1:8888->8888/tcp'),
      story: 'Backend NestJS chạy ổn trong Docker, nhưng domain API trả 502. Nginx mới được cấu hình hôm qua.',
      goal: 'Request tới api-tutor.haiphan.org qua Nginx trả 200 (nhớ reload).',
      hints: ['Cổng của backend là 8888. Xem Nginx đang trỏ tới đâu: `grep proxy_pass /etc/nginx/sites-enabled/*`.', 'proxy_pass đang là 127.0.0.1:3001, không có gì lắng nghe ở đó.', 'Sửa bằng `sudo sed -i`, sau đó `sudo nginx -t && sudo systemctl reload nginx`.'],
      fix: ['grep proxy_pass /etc/nginx/sites-enabled/api-tutor.haiphan.org', 'sudo ss -tlnp | grep 8888', "sudo sed -i 's/127.0.0.1:3001/127.0.0.1:8888/' /etc/nginx/sites-available/api-tutor.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx'],
      cause: '502 = Nginx không kết nối được upstream. Lỗi do lệch cổng giữa cấu hình Nginx và ứng dụng thật. Nhớ rằng sửa file xong vẫn phải reload: Nginx chỉ chạy bản cấu hình đã nạp.',
      setup: function (s) {
        C.vpsBase(s); C.gateway(s, { up: true });
        C.site(s, 'api-tutor.haiphan.org', L('server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location / {', '        proxy_pass http://127.0.0.1:3001;', '        proxy_set_header Host $host;', '    }', '}', '').join('\n'));
        V.ngReload(s, false);
      },
      check: function (s) { return V.probe(s, 'http://api-tutor.haiphan.org', true).status === 200; }
    },
    {
      id: 'c5d2', title: 'docker compose up báo thiếu biến',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ docker compose up -d', 'required variable POSTGRES_PASSWORD is missing a value: đặt POSTGRES_PASSWORD trong docker.env'),
      story: 'Bạn dựng lại máy chủ mới. File compose dùng `${POSTGRES_PASSWORD:?...}` để bắt buộc phải có mật khẩu, còn docker.env chưa có dòng đó. Thư mục làm việc: ~/tutor/gateway.',
      goal: 'Cả tutor-postgres và tutor-api đang chạy; docker.env có POSTGRES_PASSWORD ngẫu nhiên đủ dài.',
      hints: ['Compose chỉ đọc biến từ `.env` cùng thư mục hoặc file chỉ định bằng `--env-file`. Xem `cat docker.env`.', 'Thiếu dòng POSTGRES_PASSWORD. Sinh bằng `openssl rand -hex 24` và nối vào file bằng `>>` (không dùng `>` kẻo ghi đè).', '`echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> docker.env`, rồi `docker compose --env-file docker.env up -d`.'],
      fix: ['docker compose up -d', 'cat docker.env', 'echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> docker.env', 'docker compose --env-file docker.env up -d'],
      cause: 'Cú pháp `${BIEN:?thông báo}` khiến Compose dừng ngay nếu thiếu biến, tốt hơn là chạy với mật khẩu rỗng. Lưu ý: `>` ghi đè cả file, `>>` mới nối thêm. Đừng quên `chmod 600 docker.env` và không commit file này.',
      setup: function (s) {
        C.vpsBase(s);
        var compose = L('services:', '  postgres:', '    image: postgres:16', '    container_name: tutor-postgres', '    env_file:', '      - docker.env', '    environment:', '      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?đặt POSTGRES_PASSWORD trong docker.env}', '    ports:', '      - "127.0.0.1:5432:5432"', '    volumes:', '      - pgdata:/var/lib/postgresql/data', '  api:', '    image: tutor-api:latest', '    container_name: tutor-api', '    env_file:', '      - docker.env', '    environment:', '      DB_PASSWORD: ${POSTGRES_PASSWORD:?đặt POSTGRES_PASSWORD trong docker.env}', '    ports:', '      - "127.0.0.1:8888:8888"', '    depends_on:', '      - postgres', 'volumes:', '  pgdata:', '').join('\n');
        C.gateway(s, { compose: compose, env: 'POSTGRES_USER=app\n' });
        s.cwd = s.home + '/tutor/gateway';
      },
      check: function (s) {
        var e = s.fs.get(s.home + '/tutor/gateway/docker.env');
        return !!e && /^POSTGRES_PASSWORD=\S{16,}$/m.test(e.c) && ctRunning(s, 'tutor-postgres') && ctRunning(s, 'tutor-api');
      }
    },
    {
      id: 'c5d3', title: 'API restart liên tục: password authentication failed',
      host: 'vps', user: 'haidangphan',
      symptom: L('$ docker ps', 'tutor-api        Restarting (1) 6 seconds ago', 'tutor-postgres   Up 2 minutes (healthy)', '', '$ docker logs tutor-api --tail 3', 'error: password authentication failed for user "app"'),
      story: 'Bạn đổi mật khẩu trong docker.env sang giá trị mới (NewPass456xyz) rồi `up -d`. Postgres chạy bình thường nhưng API không đăng nhập được. Volume dữ liệu đã dùng nhiều tuần, không được xoá.',
      goal: 'tutor-api chạy ổn định (Up) và dữ liệu Postgres giữ nguyên.',
      hints: ['Đọc `docker logs tutor-api`: lỗi nằm ở xác thực DB, không phải ở API.', 'DB đang giữ mật khẩu cũ vì POSTGRES_PASSWORD chỉ có hiệu lực lần khởi tạo đầu. Đừng `down -v`.', 'Đổi trong DB: `docker exec tutor-postgres psql -U postgres -c "ALTER USER app WITH PASSWORD \'NewPass456xyz\';"` rồi `docker compose --env-file docker.env restart api`.'],
      fix: ['docker logs tutor-api --tail 5', 'docker exec tutor-postgres psql -U postgres -c "ALTER USER app WITH PASSWORD \'NewPass456xyz\';"', 'docker compose --env-file docker.env restart api'],
      cause: 'Mật khẩu nằm ở hai nơi phải khớp nhau: biến môi trường của API và dữ liệu trong DB. Đổi một phía thì phía kia phải theo. `down -v` cũng "sửa" được nhưng xoá sạch dữ liệu, tuyệt đối tránh trên máy chủ thật.',
      setup: function (s) {
        C.vpsBase(s);
        C.gateway(s, { env: 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=NewPass456xyz\nDB_PASSWORD=NewPass456xyz\n', db: { initialized: true, password: 'Ab12cd34ef56', user: 'app' }, up: true });
        s.cwd = s.home + '/tutor/gateway';
      },
      check: function (s) {
        return ctRunning(s, 'tutor-api') && s.W.db.initialized && s.W.db.password === 'NewPass456xyz';
      }
    }
  ]
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
