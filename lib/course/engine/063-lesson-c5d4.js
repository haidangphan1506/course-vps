(function (G) {
'use strict';
var C = G.COURSE, V = G.VPS, L = C.L, ran = C.ran;
var l = C.lessons.filter(function (x) { return x.id === 'c5'; })[0];
function R(re) { return function (s) { return ran(s, re); }; }
function run(s, n) { return s.W.containers.some(function (c) { return c.name === n && c.state === 'running'; }); }

[
 { tag: 'Khái niệm', title: 'Dockerfile và build image cho NestJS', body: [
   'Image `tutor-api` được dựng từ một **Dockerfile**: mỗi lệnh là một lớp (layer) được cache. Dùng **multi-stage** để image cuối nhỏ, không chứa mã nguồn và công cụ build.',
   { pre: ['FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', '', 'FROM node:22-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production', 'COPY --from=build /app/dist ./dist', 'COPY --from=build /app/node_modules ./node_modules', 'EXPOSE 8888', 'CMD ["node", "dist/main.js"]'], cap: 'Dockerfile rút gọn của tutor-api' },
   { tbl: [['Lệnh', 'Ý nghĩa'], ['`FROM`', 'Image nền'], ['`COPY`', 'Chép file vào image'], ['`RUN`', 'Chạy lúc build (cài gói, build code)'], ['`ENV`', 'Biến môi trường mặc định'], ['`EXPOSE`', 'Ghi chú cổng; KHÔNG tự mở cổng ra ngoài'], ['`CMD`', 'Lệnh chạy khi container khởi động']] },
   { pre: ['docker build -t tutor-api:latest .          # chạy ở thư mục có Dockerfile'], cap: 'Mô phỏng không có docker build; lệnh này dùng trên VPS thật' }
 ] },
 { tag: 'Bảng tra', title: 'Ba nơi đặt biến môi trường: độ ưu tiên', body: [
   { tbl: [['Cách', 'Ai đọc', 'Ghi chú'], ['`env_file: [docker.env]`', 'Truyền thẳng vào **container**', 'Dùng cho DB_PASSWORD, DB_HOST...'], ['`environment:`', 'Truyền vào container, thắng `env_file`', 'Có thể dùng `${BIEN}`'], ['`--env-file docker.env` (lệnh compose)', 'Chỉ để **thay `${BIEN}` trong file compose**', 'Không tự vào container'], ['`.env` cạnh compose', 'Giống `--env-file`, nạp tự động', 'Quên tạo là lỗi "missing a value"']] },
   { note: 'Hai chữ "env" hay gây nhầm: `env_file` là biến cho **ứng dụng**, còn `--env-file` là biến cho **chính file compose**.', kind: 'warn' }
 ] },
 { tag: 'Cú pháp', title: 'Ba dạng map cổng và hệ quả bảo mật', body: [
   { tbl: [['Khai báo', 'Truy cập từ', 'Khi nào dùng'], ['`"8888:8888"`', 'Mọi nơi (0.0.0.0), kể cả Internet, và Docker đi vòng ufw', 'Gần như không bao giờ trên VPS'], ['`"127.0.0.1:8888:8888"`', 'Chỉ máy chủ (Nginx proxy_pass vào được)', 'API/DB mà Nginx hoặc SSH tunnel dùng'], ['không có `ports`', 'Chỉ container cùng mạng Compose', 'Postgres khi chỉ API cần']] },
   { pre: ['ssh -L 5432:127.0.0.1:5432 haidangphan@116.118.9.210     # mở DBeaver tới localhost:5432 trên laptop'], cap: 'Truy cập Postgres từ laptop qua SSH tunnel, không mở cổng ra Internet' }
 ] },
 { tag: 'Bảng tra', title: 'Restart policy và healthcheck', body: [
   { tbl: [['restart:', 'Hành vi'], ['`no`', 'Không tự chạy lại'], ['`on-failure`', 'Chạy lại khi thoát mã lỗi'], ['`unless-stopped`', 'Luôn chạy lại, trừ khi bạn tự `docker stop` (khuyên dùng)'], ['`always`', 'Luôn chạy lại, kể cả khi bạn đã stop và Docker khởi động lại']] },
   { pre: ['  postgres:', '    healthcheck:', '      test: ["CMD-SHELL", "pg_isready -U app"]', '      interval: 5s', '      retries: 10', '  api:', '    depends_on:', '      postgres:', '        condition: service_healthy'], cap: 'api chỉ khởi động khi Postgres thật sự nhận kết nối (không chỉ "đã bật")' }
 ] },
 { tag: 'Quy trình', title: 'Gỡ lỗi container theo bậc thang', body: [
   { tbl: [['Bước', 'Lệnh', 'Cho biết'], ['1', '`docker ps -a`', 'Container có chạy không, trạng thái gì'], ['2', '`docker logs TEN --tail 50`', 'Ứng dụng chết vì lỗi gì'], ['3', '`docker inspect TEN --format \'{{.State.Status}}\'`', 'Trạng thái, mã thoát chính xác'], ['4', '`docker exec TEN env`', 'Biến môi trường thật sự bên trong'], ['5', '`sudo ss -tlnp`', 'Cổng publish ra host có đúng không']] },
   { tbl: [['Mã thoát', 'Thường là'], ['0', 'Thoát bình thường'], ['1', 'Ứng dụng báo lỗi (xem log)'], ['137', 'Bị kill, thường do hết RAM (OOM)'], ['143', 'Nhận SIGTERM (docker stop)']] }
 ] },
 { tag: 'Bảng tra', title: 'Dọn dẹp và kiểm kê tài nguyên', body: [
   { tbl: [['Lệnh', 'Tác dụng'], ['`docker system df`', 'Image, container, volume, cache đang chiếm bao nhiêu'], ['`docker volume ls`', 'Các volume dữ liệu (đừng xoá volume Postgres)'], ['`docker network ls`', 'Các mạng; mỗi dự án Compose có `<tên>_default`'], ['`docker image prune -f`', 'Xoá image không còn dùng (an toàn)'], ['`docker compose pull`', 'Tải bản image mới nhất theo file compose']] },
   { note: 'Không chạy `docker system prune -a --volumes` trên máy chủ thật: lệnh này có thể xoá cả volume chứa dữ liệu.', kind: 'warn' }
 ] }
].forEach(function (t) { l.theory.push(t); });

[
 { q: 'Trong compose có `env_file: [docker.env]`. Còn `docker compose --env-file docker.env up -d` dùng file đó để làm gì thêm?', opts: ['Không để làm gì', 'Thay các ${BIEN} ghi trong chính file docker-compose.yml', 'Mã hoá mật khẩu', 'Tạo volume'], ans: 1, why: '`--env-file` cấp giá trị để Compose nội suy ${BIEN} khi đọc file compose.' },
 { q: 'Container thoát với mã 137. Nghi vấn đầu tiên?', opts: ['Sai cú pháp compose', 'Bị kill, thường do hết RAM (OOM)', 'Hết hạn chứng chỉ', 'DNS lỗi'], ans: 1, why: '137 = 128 + 9 (SIGKILL), thường do bộ nhớ.' },
 { q: 'Muốn mở DBeaver trên laptop vào Postgres trên VPS mà không mở cổng 5432 ra Internet?', opts: ['ufw allow 5432', 'Publish "5432:5432"', 'SSH tunnel: ssh -L 5432:127.0.0.1:5432 user@vps', 'Tắt ufw'], ans: 2, why: 'Tunnel đi qua kết nối SSH đã có, DB vẫn chỉ nghe ở 127.0.0.1.' }
].forEach(function (q) { l.quiz.push(q); });

[
 { text: 'Liệt kê cả container đã dừng.', hint: 'docker ps -a', check: R(/^docker ps -a/) },
 { text: 'Hiển thị bảng chỉ có tên và trạng thái bằng `--format "table {{.Names}}\\t{{.Status}}"`.', hint: 'docker ps --format "table {{.Names}}\\t{{.Status}}"', check: R(/^docker ps .*--format/) },
 { text: 'Hỏi trạng thái của `tutor-api` bằng `docker inspect ... --format`.', hint: "docker inspect tutor-api --format '{{.State.Status}}'", check: R(/^docker inspect tutor-api/) },
 { text: 'Liệt kê volume dữ liệu.', hint: 'docker volume ls', check: R(/^docker volume ls/) },
 { text: 'Liệt kê các mạng Docker.', hint: 'docker network ls', check: R(/^docker network ls/) },
 { text: 'Xem Docker đang chiếm bao nhiêu dung lượng.', hint: 'docker system df', check: R(/^docker system df/) },
 { text: 'Tải bản image mới theo file compose.', hint: 'docker compose --env-file docker.env pull', check: R(/^docker compose .*pull/) },
 { text: 'Khởi động lại `tutor-api` và chắc chắn nó vẫn Up.', hint: 'docker restart tutor-api && docker ps', check: function (s) { return ran(s, /^docker restart tutor-api/) && run(s, 'tutor-api'); } },
 { text: 'Dọn image không dùng.', hint: 'docker image prune -f', check: R(/^docker image prune/) }
].forEach(function (i) { l.lab.items.push(i); });

l.debugs.push({
  id: 'c5d4', title: 'API restart: ECONNREFUSED 127.0.0.1:5432',
  host: 'vps', user: 'haidangphan',
  symptom: L('$ docker ps', 'tutor-api        Restarting (1) 6 seconds ago', 'tutor-postgres   Up 3 minutes (healthy)', '', '$ docker logs tutor-api --tail 2', 'Error: connect ECONNREFUSED 127.0.0.1:5432'),
  story: 'Postgres khoẻ, mật khẩu đúng, nhưng API không nối được DB. Trong docker.env có dòng `DB_HOST=127.0.0.1` do bạn chép từ cấu hình chạy thủ công trên laptop. Thư mục làm việc: ~/tutor/gateway.',
  goal: 'tutor-api chạy ổn định và `DB_HOST` trong container là `postgres`.',
  hints: ['Lỗi ở chỗ API gọi tới đâu: `127.0.0.1` trong container là CHÍNH container API, không có Postgres ở đó.', 'Trong mạng Compose, host của DB là tên service: `postgres`. Sửa dòng `DB_HOST` trong docker.env.', 'Sửa file xong dùng `docker compose --env-file docker.env up -d` (tạo lại container nhận env mới). `restart` KHÔNG nạp lại env.'],
  fix: ['docker logs tutor-api --tail 3', "sed -i 's/DB_HOST=127.0.0.1/DB_HOST=postgres/' docker.env", 'docker compose --env-file docker.env up -d', 'docker exec tutor-api env'],
  cause: 'Trong container, `localhost` luôn là chính nó. Các service trong cùng Compose gọi nhau bằng tên service. Và vì `restart` giữ nguyên môi trường cũ, mọi thay đổi env phải dùng `up -d` để container được tạo lại.',
  setup: function (s) {
    C.vpsBase(s);
    C.gateway(s, { env: 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=Ab12cd34ef56\nDB_PASSWORD=Ab12cd34ef56\nDB_HOST=127.0.0.1\n', up: true });
    s.cwd = s.home + '/tutor/gateway';
  },
  check: function (s) { return s.W.containers.some(function (c) { return c.name === 'tutor-api' && c.state === 'running' && c.env.DB_HOST === 'postgres'; }); }
});
l.debugs.push({
  id: 'c5d5', title: 'up -d báo "port is already allocated" cổng 8888',
  host: 'vps', user: 'haidangphan',
  symptom: L('$ docker compose --env-file docker.env up -d', ' Container tutor-postgres  Started', 'Error response from daemon: driver failed programming external connectivity on endpoint tutor-api: Bind for 127.0.0.1:8888 failed: port is already allocated'),
  story: 'Trước khi chuyển sang Docker, bạn từng chạy API bằng PM2 với tên `old-api` ở cổng 8888 và quên xoá. Bây giờ container API không bật được vì cổng đã có người giữ.',
  goal: 'tutor-api (container) chạy, và tiến trình PM2 cũ đã được gỡ.',
  hints: ['Tìm ai đang giữ cổng: `sudo ss -tlnp | grep 8888`.', 'Tiến trình tên `node`, không phải docker-proxy. Hãy xem `pm2 list`.', 'Gỡ bằng `pm2 delete old-api`, rồi chạy lại `docker compose --env-file docker.env up -d` và `pm2 save`.'],
  fix: ['sudo ss -tlnp | grep 8888', 'pm2 list', 'pm2 delete old-api', 'docker compose --env-file docker.env up -d', 'pm2 save'],
  cause: 'Một cổng chỉ một tiến trình giữ được. Khi chuyển kiến trúc (PM2 sang Docker), phải gỡ tiến trình cũ khỏi cả PM2 lẫn `pm2 save` để sau khi reboot nó không tự sống lại và giành cổng.',
  setup: function (s) {
    C.vpsBase(s);
    C.gateway(s, {});
    s.W.pm2['old-api'] = { name: 'old-api', dir: s.home + '/tutor/api', port: 8888, script: 'dist/main.js', status: 'online', pid: 5200, restarts: 0, logs: ['Listening on port 8888'] };
    s.cwd = s.home + '/tutor/gateway';
    s.silent('docker compose --env-file docker.env up -d');
  },
  check: function (s) { return run(s, 'tutor-api') && !s.W.pm2['old-api']; }
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
