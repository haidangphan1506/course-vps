(function (G) {
'use strict';
var C = G.COURSE, V = G.VPS, L = C.L, M = C.M, ran = C.ran;
var l = C.lessons.filter(function (x) { return x.id === 'c5'; })[0], GiB = 1073741824;
function R(re) { return function (s) { return ran(s, re); }; }
function ct(s, n) { return s.W.containers.filter(function (c) { return c.name === n; })[0]; }
function usedPct(s) { var u = s.W.diskBaseGB * GiB + (s.W.heldBytes || 0); for (var k in s.fs.n) { var n = s.fs.n[k]; if (n.t === 'f' && n.size != null) u += n.size; } return u / (90 * GiB) * 100; }
function hasImg(s, r, t) { return (s.W.images || []).some(function (x) { return x.repo === r && x.tag === t; }); }

var DF = L('FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', '', 'FROM node:22-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production', 'COPY --from=build /app/dist ./dist', 'COPY --from=build /app/node_modules ./node_modules', 'EXPOSE 8888', 'CMD ["node", "dist/main.js"]', '').join('\n');
var oldSetup = l.lab.setup;
l.lab.setup = function (s) { oldSetup(s); s.fs.put(s.home + '/tutor/api/Dockerfile', DF, { owner: s.user }); s.fs.put(s.home + '/tutor/api/package.json', '{ "name": "tutor-api" }\n', { owner: s.user }); };

[
 { tag: 'Khái niệm', title: 'Docker khác máy ảo ở đâu', body: [
   { tbl: [['', 'Máy ảo (VM)', 'Container'], ['Nhân hệ điều hành', 'Mỗi VM một nhân riêng', 'Dùng chung nhân của máy chủ'], ['Khởi động', 'Hàng chục giây', 'Dưới 1 giây'], ['Dung lượng', 'GB', 'Vài chục đến vài trăm MB'], ['Cô lập', 'Mạnh (phần cứng ảo)', 'Vừa phải (namespace, cgroup)']] },
   'Container là **tiến trình thường** được cô lập bằng *namespace* (nhìn thấy file/mạng/PID riêng) và giới hạn tài nguyên bằng *cgroup* (RAM, CPU). Vì vậy `docker top` cho thấy tiến trình của container cũng xuất hiện trên máy chủ.'
 ] },
 { tag: 'Bảng tra', title: 'docker run: các cờ quan trọng', body: [
   { tbl: [['Cờ', 'Ý nghĩa', 'Ví dụ'], ['`-d`', 'Chạy nền', ''], ['`--name`', 'Đặt tên container', '`--name cache`'], ['`-p host:cont`', 'Map cổng', '`-p 127.0.0.1:6379:6379`'], ['`-e KEY=VAL`', 'Biến môi trường', '`-e TZ=Asia/Ho_Chi_Minh`'], ['`-v vol:/path`', 'Gắn volume', '`-v pgdata:/var/lib/postgresql/data`'], ['`--restart`', 'Chính sách khởi động lại', '`--restart unless-stopped`'], ['`-m 512m`', 'Giới hạn RAM', ''], ['`--rm`', 'Tự xoá khi thoát (chạy thử)', '']] },
   { pre: ['docker run -d --name cache -p 127.0.0.1:6379:6379 --restart unless-stopped redis:7'], cap: 'Redis chỉ lắng nghe ở loopback của VPS' },
   'Dự án thật nên dùng Compose thay cho chuỗi `docker run` dài, vì cấu hình được lưu vào file và nằm trong Git.'
 ] },
 { tag: 'Khái niệm', title: 'Image, tag, registry', body: [
   { ul: ['Tên đầy đủ: `registry/repo:tag`, ví dụ `postgres:16` nghĩa là `docker.io/library/postgres:16`', '**Tag là con trỏ có thể đổi**: `latest` hôm nay khác `latest` tháng sau. Ghim bản cụ thể (`postgres:16`, `node:22-alpine`) để triển khai lặp lại được. Chọn bản Node còn được hỗ trợ: Node 20 đã hết hạn từ 04/2026, nên dùng 22 hoặc 24', 'Image nội bộ như `tutor-api` không có trên Docker Hub: phải tự `docker build` (hoặc đẩy lên registry riêng) trước khi `compose up`, nếu không sẽ gặp `pull access denied`'] },
   { pre: ['docker pull redis:7', 'docker images', 'docker rmi redis:7          # lỗi nếu còn container dùng image đó'] }
 ] },
 { tag: 'Cú pháp', title: 'bind mount và named volume', body: [
   { tbl: [['Loại', 'Khai báo', 'Dữ liệu nằm ở', 'Dùng cho'], ['Named volume', '`pgdata:/var/lib/postgresql/data`', 'Docker quản lý (`/var/lib/docker/volumes`)', 'Dữ liệu DB'], ['Bind mount', '`./uploads:/app/uploads`', 'Thư mục thật bạn chọn trên VPS', 'File upload, cấu hình cần sửa tay']] },
   { note: 'Container ghi vào thư mục không gắn volume thì dữ liệu mất khi container bị xoá. Hãy tự hỏi "dữ liệu này có phải sống lâu hơn container không?".', kind: 'warn' },
   { pre: ['# sao lưu và khôi phục Postgres', 'docker exec tutor-postgres pg_dump -U app tutor_db > ~/backup.sql', 'cat ~/backup.sql | docker exec -i tutor-postgres psql -U app tutor_db'] }
 ] },
 { tag: 'Quy trình', title: 'Cứng hoá container', body: [
   { tbl: [['Việc', 'Cách làm', 'Lý do'], ['Giới hạn RAM/CPU', '`mem_limit: 512m`, `cpus: "1.0"`', 'Một app rò rỉ không kéo sập cả VPS'], ['Không chạy bằng root', 'Dockerfile: `USER node`', 'Lỗ hổng trong app khó leo thang'], ['Không mở cổng thừa', '`127.0.0.1:` hoặc bỏ `ports`', 'Docker đi vòng ufw'], ['Không gắn docker.sock', 'Tránh `-v /var/run/docker.sock:...`', 'Ai chiếm được container là chiếm cả máy chủ'], ['Giới hạn log', '`logging.options.max-size`', 'Chống đầy đĩa'], ['Ghim phiên bản image', '`node:22-alpine`', 'Tránh bản mới bất ngờ']] },
   { note: 'Đặt `mem_limit` quá thấp cũng gây sự cố: Node bị kill với mã 137. Đặt giá trị dựa trên `docker stats` khi chạy thật.', kind: 'tip' }
 ] },
 { tag: 'Bảng tra', title: 'Triệu chứng và nguyên nhân thường gặp', body: [
   { tbl: [['Triệu chứng', 'Nguyên nhân hay gặp', 'Xem ở đâu'], ['`pull access denied`', 'Image nội bộ chưa được build', '`docker images`'], ['`port is already allocated`', 'Cổng bị tiến trình khác giữ', '`sudo ss -tlnp`'], ['`ECONNREFUSED 127.0.0.1`', 'Dùng localhost thay vì tên service', '`docker exec ... env`'], ['`password authentication failed`', 'Mật khẩu env khác mật khẩu trong DB', '`docker logs`'], ['Restarting (137)', 'Hết RAM hoặc `mem_limit` quá thấp', '`docker inspect`, `docker stats`'], ['Đĩa đầy', 'Log container không giới hạn', '`docker system df`, `du`'], ['`missing a value`', 'Thiếu biến cho `${BIEN:?}`', '`--env-file`']] }
 ] }
].forEach(function (t) { l.theory.push(t); });

[
 { q: 'Câu nào đúng về tag `latest`?', opts: ['Luôn là bản mới nhất, cố định', 'Chỉ là con trỏ có thể đổi, nên ghim tag cụ thể khi triển khai', 'Là bản ổn định nhất', 'Chỉ dùng cho Postgres'], ans: 1, why: 'Tag là nhãn có thể trỏ sang image khác; ghim bản để triển khai lặp lại được.' },
 { q: 'Dữ liệu Postgres cần sống lâu hơn container. Dùng gì?', opts: ['Không cần gì', 'Named volume gắn vào /var/lib/postgresql/data', 'Biến môi trường', 'EXPOSE 5432'], ans: 1, why: 'Dữ liệu ghi ngoài volume sẽ mất khi container bị xoá.' },
 { q: 'docker compose up báo "pull access denied for tutor-api". Việc cần làm?', opts: ['docker login Docker Hub', 'Build image: docker build -t tutor-api:latest <thư mục có Dockerfile>', 'ufw allow 443', 'Xoá volume'], ans: 1, why: 'Image nội bộ không có trên Docker Hub nên phải build trước.' },
 { q: 'Vì sao nên đặt giới hạn log (max-size) cho container?', opts: ['Để log đẹp hơn', 'Log json-file mặc định không giới hạn và có thể làm đầy đĩa', 'Docker bắt buộc', 'Để tăng tốc API'], ans: 1, why: 'Log container nằm trong /var/lib/docker và có thể phình tới hàng chục GB.' }
].forEach(function (q) { l.quiz.push(q); });

[
 { text: 'Đọc Dockerfile của API: `~/tutor/api/Dockerfile`.', hint: 'cat ~/tutor/api/Dockerfile', check: R(/^cat .*Dockerfile/) },
 { text: 'Build image `tutor-api:v2` từ thư mục `~/tutor/api`.', hint: 'docker build -t tutor-api:v2 ~/tutor/api', check: function (s) { return hasImg(s, 'tutor-api', 'v2'); } },
 { transient: true, text: 'Tải image `redis:7` từ Docker Hub.', hint: 'docker pull redis:7', check: function (s) { return hasImg(s, 'redis', '7'); } },
 { transient: true, text: 'Chạy Redis nền tên `cache`, cổng chỉ bind loopback `127.0.0.1:6379`.', hint: 'docker run -d --name cache -p 127.0.0.1:6379:6379 redis:7', check: function (s) { var c = ct(s, 'cache'); return !!c && c.state === 'running' && c.ports[0].bind === '127.0.0.1'; } },
 { text: 'Xem tiến trình bên trong `cache`.', hint: 'docker top cache', check: R(/^docker top cache/) },
 { text: 'Thử `docker rmi redis:7` khi container còn chạy (sẽ báo lỗi), rồi dừng và xoá container `cache`.', hint: 'docker rmi redis:7; docker stop cache && docker rm cache', check: function (s) { return !ct(s, 'cache') && s.hist.some(function (h) { return /^docker rmi redis:7/.test(h.cmd) && h.code !== 0; }); } },
 { text: 'Giờ xoá image `redis:7`.', hint: 'docker rmi redis:7', check: function (s) { return ran(s, /^docker rmi redis:7/) && !hasImg(s, 'redis', '7'); } },
 { text: 'Xem toàn bộ cấu hình tài nguyên container bằng `docker stats` một lần.', hint: 'docker stats --no-stream', check: R(/^docker stats/) }
].forEach(function (i) { l.lab.items.push(i); });

l.debugs.push({
  id: 'c5d6', title: 'compose up: pull access denied for tutor-api',
  host: 'vps', user: 'haidangphan',
  symptom: L('$ docker compose --env-file docker.env up -d', ' api Error pull access denied for tutor-api, repository does not exist or may require \'docker login\': denied: requested access to the resource is denied'),
  story: 'Bạn dọn dẹp image cũ trên VPS và lỡ xoá luôn `tutor-api:latest`. Mã nguồn API và Dockerfile vẫn ở ~/tutor/api. Compose cố tải `tutor-api` từ Docker Hub và thất bại. Thư mục làm việc: ~/tutor/gateway.',
  goal: 'Image `tutor-api:latest` tồn tại và container tutor-api đang chạy.',
  hints: ['`docker images` có `tutor-api` không? Image nội bộ không có trên Docker Hub.', 'Phải tự build: cần thư mục chứa Dockerfile là `~/tutor/api`.', '`docker build -t tutor-api:latest ~/tutor/api`, sau đó `docker compose --env-file docker.env up -d`.'],
  fix: ['docker images', 'docker build -t tutor-api:latest ~/tutor/api', 'docker compose --env-file docker.env up -d'],
  cause: 'Image chỉ tồn tại cục bộ nếu bạn build nó. `docker image prune -a` hoặc `docker rmi` sẽ xoá nó và Compose lại tìm trên Docker Hub. Cách bền vững: đẩy image lên một registry riêng, hoặc đưa `docker build` vào script deploy.',
  setup: function (s) {
    C.vpsBase(s); C.gateway(s, {});
    s.fs.put(s.home + '/tutor/api/Dockerfile', DF, { owner: s.user }); s.fs.put(s.home + '/tutor/api/package.json', '{ "name": "tutor-api" }\n', { owner: s.user });
    s.silent('docker images');
    s.W.images = s.W.images.filter(function (x) { return x.repo !== 'tutor-api'; });
    s.cwd = s.home + '/tutor/gateway';
  },
  check: function (s) { var c = ct(s, 'tutor-api'); return hasImg(s, 'tutor-api', 'latest') && !!c && c.state === 'running'; }
});
l.debugs.push({
  id: 'c5d7', title: 'API chết liên tục, Restarting (137)',
  host: 'vps', user: 'haidangphan',
  symptom: L('$ docker ps', 'tutor-api        Restarting (137) 5 seconds ago', '', '$ docker logs tutor-api --tail 2', '<--- Last few GCs --->', 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'),
  story: 'Tuần trước bạn thêm `mem_limit: 128m` vào service api trong docker-compose.yml để "tiết kiệm RAM". Từ đó API không chạy nổi. VPS còn trống hơn 6GB RAM. Thư mục: ~/tutor/gateway.',
  goal: 'tutor-api chạy ổn (Up) với giới hạn RAM hợp lý.',
  hints: ['Mã thoát 137 là bị kill, thường vì hết bộ nhớ. Xem `docker inspect tutor-api --format \'{{.State.ExitCode}}\'` và `grep mem_limit docker-compose.yml`.', '128m quá nhỏ cho một ứng dụng NestJS. Tăng lên khoảng 512m.', 'Sửa bằng sed rồi `docker compose --env-file docker.env up -d` (phải tạo lại container để nhận giới hạn mới).'],
  fix: ["docker inspect tutor-api --format '{{.State.ExitCode}}'", 'grep -n mem_limit docker-compose.yml', "sed -i 's/mem_limit: 128m/mem_limit: 512m/' docker-compose.yml", 'docker compose --env-file docker.env up -d'],
  cause: 'Giới hạn RAM của cgroup làm kernel kill tiến trình khi vượt (OOM kill, mã 137). Giới hạn là tốt, nhưng phải dựa trên mức dùng thực tế (`docker stats`) cộng đệm, không đoán. Đổi giới hạn phải tạo lại container bằng `up -d`.',
  setup: function (s) {
    C.vpsBase(s);
    C.gateway(s, { compose: C.composeFile.replace("    container_name: tutor-api\n", "    container_name: tutor-api\n    mem_limit: 128m\n"), up: true });
    s.cwd = s.home + '/tutor/gateway';
  },
  check: function (s) { var c = ct(s, 'tutor-api'); return !!c && c.state === 'running'; }
});
l.debugs.push({
  id: 'c5d8', title: 'Đĩa đầy 91% vì log container',
  host: 'vps', user: 'haidangphan',
  symptom: L('$ df -h /', '/dev/vda1        90G   82G  8.0G  91% /', '', '$ sudo du -sh /var/lib/docker', '49G     /var/lib/docker'),
  story: 'Không có gì thay đổi về dữ liệu, nhưng đĩa đầy dần. Nginx và journal đều nhỏ. Nghi ngờ log của container API (đang in log cực nhiều lỗi kết nối).',
  goal: 'Mức dùng đĩa dưới 70% mà không phải dừng container.',
  hints: ['Tìm file log lớn của container: `sudo find /var/lib/docker/containers -name "*-json.log"`.', 'File log `<id>-json.log` của tutor-api rất lớn. Container đang mở file này nên làm rỗng bằng truncate thay vì xoá.', '`sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log`, rồi `df -h /`. Lâu dài hãy thêm `logging: options: max-size: "10m"` cho service.'],
  fix: ['sudo find /var/lib/docker/containers -name "*-json.log"', 'sudo du -sh /var/lib/docker/containers/*/*-json.log', 'sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log', 'df -h'],
  cause: 'Driver json-file mặc định không xoay vòng log. Container ồn ào có thể ghi hàng chục GB vào /var/lib/docker/containers. Giải pháp lâu dài: `logging.driver: json-file` với `max-size` và `max-file` cho từng service, hoặc đặt mặc định trong /etc/docker/daemon.json.',
  setup: function (s) {
    C.vpsBase(s); C.gateway(s, { up: true });
    var id = ct(s, 'tutor-api').id, p = '/var/lib/docker/containers/' + id + '/' + id + '-json.log';
    s.fs.put(p, '', { owner: 'root', mode: M('640'), size: 48 * GiB });
    s.cwd = s.home + '/tutor/gateway';
  },
  check: function (s) { return usedPct(s) < 70; }
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
