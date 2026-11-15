(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, A = C.A, pick = C.pick;
function R(re) { return function (s) { return ran(s, re); }; }
function ct(s, n) { return s.W.containers.filter(function (c) { return c.name === n; })[0]; }
function hasImg(s, r, t) { return (s.W.images || []).some(function (x) { return x.repo === r && x.tag === t; }); }
var DF = L('FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', '', 'FROM node:22-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production', 'COPY --from=build /app/dist ./dist', 'COPY --from=build /app/node_modules ./node_modules', 'EXPOSE 8888', 'CMD ["node", "dist/main.js"]', '').join('\n');
C.DF = DF;

/* ---------------- THEORY ---------------- */
var dock = pick('Dockerfile và build image cho NestJS');
dock.body.forEach(function (b) { if (b.cap && /Mô phỏng không có docker build/.test(b.cap)) b.cap = 'Chạy ở thư mục có Dockerfile; terminal giả lập hỗ trợ lệnh này'; });
var tagCard = pick('Image, tag, registry');
var runCard = pick('docker run: các cờ quan trọng');

A.theory = [
  pick('Docker khác máy ảo ở đâu'),
  { tag: 'Cú pháp', title: 'Cài Docker và quyền dùng docker', body: [
    'Trên Ubuntu 24.04, cài từ kho chính thức của Docker (không dùng bản `docker.io` cũ trong kho Ubuntu). Cách nhanh cho máy mới:',
    { pre: ['curl -fsSL https://get.docker.com | sudo sh', 'sudo systemctl enable --now docker', 'docker --version', 'docker compose version        # Compose v2 đi kèm, gõ có dấu cách'], cap: 'Dùng script chính thức; trên VPS thật hãy đọc script trước khi chạy' },
    'Mặc định chỉ root dùng được Docker vì socket `/var/run/docker.sock` thuộc root. Nếu bạn gõ `docker ps` bằng user thường sẽ gặp:',
    { pre: ['permission denied while trying to connect to the Docker daemon socket', 'at unix:///var/run/docker.sock: ... connect: permission denied'] },
    { pre: ['groups                                  # xem nhóm của phiên hiện tại', 'sudo usermod -aG docker haidangphan     # THÊM vào nhóm docker (nhớ -a)', 'newgrp docker                           # hoặc thoát SSH rồi vào lại để nhóm có hiệu lực', 'docker ps'], cap: 'Thêm user vào nhóm docker' },
    { note: 'Thiếu `-a` (`usermod -G docker ...`) sẽ GHI ĐÈ toàn bộ nhóm phụ và làm mất nhóm `sudo`. Luôn dùng `-aG`.', kind: 'warn' },
    { note: 'Thành viên nhóm `docker` gần như tương đương root trên máy chủ (có thể gắn cả ổ đĩa vào container). Chỉ thêm tài khoản bạn tin tưởng.', kind: 'warn' }
  ] },
  { tag: 'Khái niệm', title: 'Vòng đời của container', body: [
    'Image là bản đóng gói chỉ đọc; container là một thể hiện đang sống của image. Một image tạo được nhiều container.',
    { pre: ['docker run  = tạo (create) + chạy (start)', '', 'created --start--> running --stop--> exited --rm--> (không còn)', '                       |', '                       +-- tiến trình chết ---> exited (mã thoát) / restarting (nếu có restart policy)'], cap: 'Trạng thái chính của container' },
    { tbl: [['Lệnh', 'Tác dụng', 'Dữ liệu trong container'], ['`docker stop NAME`', 'Dừng (gửi SIGTERM, 10 giây sau SIGKILL)', 'Giữ nguyên'], ['`docker start NAME`', 'Chạy lại container đã dừng', 'Giữ nguyên'], ['`docker restart NAME`', 'Dừng rồi chạy lại', 'Giữ nguyên'], ['`docker rm NAME`', 'Xoá container (phải stop trước hoặc `-f`)', '**Mất** (trừ phần ghi vào volume)'], ['`docker rmi IMAGE`', 'Xoá image (không được nếu còn container dùng)', 'Không liên quan']] },
    'Điểm cần nhớ: mọi thứ container tự ghi ra ngoài volume chỉ sống đến khi container bị xoá. Vì vậy container nên được coi là "dùng một lần", còn dữ liệu quan trọng phải nằm ở volume.'
  ] },
  tagCard,
  runCard,
  dock,
  { tag: 'Quy trình', title: 'Build nhanh: cache lớp và .dockerignore', body: [
    'Mỗi dòng Dockerfile tạo một lớp (layer) và Docker **cache** từng lớp. Khi một lớp thay đổi, mọi lớp phía sau phải làm lại. Vì vậy hãy xếp phần ít đổi lên trước:',
    { pre: ['COPY package*.json ./     # ít đổi: chỉ đổi khi thêm/bớt thư viện', 'RUN npm ci                 # lớp tốn thời gian nhất, được cache nếu hai dòng trên không đổi', 'COPY . .                   # mã nguồn đổi liên tục: đặt SAU npm ci', 'RUN npm run build'], cap: 'Thứ tự đúng giúp build lại chỉ mất vài giây khi chỉ sửa code' },
    'File `.dockerignore` (cùng thư mục Dockerfile) loại bỏ những thứ không nên vào image, giống `.gitignore`:',
    { pre: ['node_modules', 'dist', '.git', '.env', 'docker.env', '*.log', 'uploads'] },
    { tbl: [['Cờ', 'Ý nghĩa'], ['`-t tên:tag`', 'Đặt tên và tag cho image'], ['`--no-cache`', 'Bỏ cache, build lại từ đầu (khi nghi cache cũ)'], ['`--build-arg KEY=VAL`', 'Truyền tham số lúc build'], ['`.` hoặc đường dẫn cuối lệnh', 'Build context: thư mục gửi cho Docker']] },
    { note: 'Không để `.env`, khoá SSH, mật khẩu vào image: image có thể bị đẩy lên registry hoặc ai đó chạy `docker history` đều thấy.', kind: 'warn' }
  ] },
  { tag: 'Bảng tra', title: 'Vào bên trong container: exec, cp, logs', body: [
    { tbl: [['Việc', 'Lệnh'], ['Chạy một lệnh trong container', '`docker exec tutor-api ls /app`'], ['Mở shell tương tác (trên VPS thật)', '`docker exec -it tutor-api sh`  (Alpine không có bash)'], ['Biết đang là user nào', '`docker exec tutor-api whoami`'], ['Xem biến môi trường thực tế', '`docker exec tutor-api env`'], ['Chép file ra khỏi container', '`docker cp tutor-api:/app/package.json ~/package.json`'], ['Chép file vào container', '`docker cp ./fix.sql tutor-postgres:/tmp/fix.sql`'], ['Log 10 phút gần đây', '`docker logs tutor-api --since 10m`'], ['Theo dõi log trực tiếp', '`docker logs -f tutor-api` (Ctrl+C để thoát)'], ['Chỉ N dòng cuối', '`docker logs tutor-api --tail 50`']] },
    'Terminal giả lập không mở được phiên `sh` tương tác. Hãy dùng dạng một lệnh một lần như trong bảng.',
    { note: 'Sửa file bằng cách chui vào container chỉ có tác dụng đến khi container bị tạo lại. Thay đổi thật phải nằm trong image (Dockerfile), env hoặc volume.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Volume, bind mount và quyền file', body: [
    { tbl: [['Loại', 'Khai báo', 'Dữ liệu nằm ở', 'Dùng cho'], ['Named volume', '`pgdata:/var/lib/postgresql/data`', '`/var/lib/docker/volumes/` (Docker quản lý)', 'Dữ liệu DB, thứ bạn không sửa tay'], ['Bind mount', '`./uploads:/app/uploads`', 'Thư mục thật trên VPS', 'File upload, cấu hình cần sửa tay'], ['tmpfs', '`tmpfs: /tmp`', 'RAM', 'Dữ liệu tạm, nhạy cảm']] },
    { tbl: [['Thao tác', 'Container', 'Volume'], ['`docker compose restart`', 'Chạy lại', 'Giữ'], ['`docker compose down`', 'Xoá', 'Giữ'], ['`docker compose down -v`', 'Xoá', '**Mất hết**'], ['`docker volume rm gateway_pgdata`', 'Không đổi', '**Mất hết**']] },
    { pre: ['docker volume ls', 'docker volume inspect gateway_pgdata     # Mountpoint nằm ở /var/lib/docker/volumes/...'] },
    '**Quyền với bind mount** là lỗi kinh điển: container NestJS chạy bằng user `node` (uid 1000). Nếu thư mục host do root tạo (Docker tự tạo thư mục bind mount nếu nó chưa tồn tại, chủ sở hữu là root) thì container không ghi được và báo `EACCES: permission denied`.',
    { pre: ['mkdir -p ~/tutor/gateway/uploads          # tự tạo trước, chủ là user của bạn (uid 1000)', 'ls -ld ~/tutor/gateway/uploads', 'sudo chown -R 1000:1000 ~/tutor/gateway/uploads   # nếu đã bị tạo bởi root'], cap: 'Trên VPS uid 1000 thường chính là user đầu tiên của bạn' },
    { note: 'Đừng "chữa" bằng `chmod 777`: ai trên máy cũng ghi được. Hãy chown đúng chủ.', kind: 'warn' }
  ] },
  pick('Đọc trạng thái và log'),
  pick('Gỡ lỗi container theo bậc thang'),
  { tag: 'Quy trình', title: 'Registry: tag, login, push, pull và rollback', body: [
    'Registry là kho chứa image (Docker Hub, GitHub Container Registry `ghcr.io`, ...). Tên đầy đủ: `registry/chủ/tên:tag`.',
    { pre: ['docker tag tutor-api:v2 ghcr.io/duongpd/tutor-api:v2     # đặt thêm một tên', 'echo "$GHCR_TOKEN" | docker login ghcr.io -u duongpd --password-stdin', 'docker push ghcr.io/duongpd/tutor-api:v2', '', '# trên VPS khác:', 'docker pull ghcr.io/duongpd/tutor-api:v2'], cap: 'Đưa image từ máy build lên máy chạy' },
    { ul: ['Dùng **token** (Personal Access Token có quyền `write:packages`), không dùng mật khẩu tài khoản', 'Truyền token bằng `--password-stdin`, tránh `-p TOKEN` (lọt vào lịch sử lệnh và danh sách tiến trình)', 'Chưa `docker login` thì `push` báo `unauthorized: authentication required`', 'Đẩy image không có tiền tố registry (như `tutor-api:v2`) sẽ bị hiểu là Docker Hub và báo `denied`'] },
    { tbl: [['Chiến lược tag', 'Ví dụ', 'Ghi chú'], ['Phiên bản', '`v2`, `v3`', 'Dễ rollback: đổi về tag cũ rồi `up -d`'], ['Mã commit', '`sha-9f3a2c1`', 'Truy ngược được code'], ['`latest`', '`latest`', 'Chỉ nên là bí danh, đừng dùng làm cơ sở triển khai']] },
    { note: 'Rollback chỉ làm được nếu bạn còn giữ image cũ (trên VPS hoặc registry). Đừng `image prune -a` ngay sau mỗi lần deploy.', kind: 'tip' }
  ] },
  pick('Dọn dẹp và kiểm kê tài nguyên'),
  pick('Cứng hoá container')
];

/* ---------------- QUIZ ---------------- */
A.quiz = [
  { q: 'Gõ `docker ps` bằng user thường báo "permission denied ... docker.sock". Cách sửa đúng?', opts: ['chmod 777 /var/run/docker.sock', 'sudo usermod -aG docker TÊN_USER rồi đăng nhập lại (hoặc newgrp docker)', 'Cài lại Docker', 'Chạy mọi lệnh bằng root'], ans: 1, why: 'Thêm user vào nhóm docker. Mở quyền 777 cho socket tương đương cho mọi người quyền root.' },
  { q: 'Vì sao `usermod -G docker user` (không có -a) nguy hiểm?', opts: ['Không nguy hiểm', 'Nó ghi đè toàn bộ nhóm phụ, user có thể mất nhóm sudo', 'Nó xoá user', 'Nó khởi động lại Docker'], ans: 1, why: '`-a` nghĩa là append. Thiếu nó thì danh sách nhóm bị thay hoàn toàn.' },
  C.pickQ('Câu nào đúng về tag'),
  { q: 'Container `cache` đã bị `docker rm`. Dữ liệu ghi bên trong nó (không có volume) ra sao?', opts: ['Vẫn còn trong image', 'Mất cùng container', 'Chuyển sang volume', 'Được sao lưu tự động'], ans: 1, why: 'Lớp ghi của container bị xoá cùng container. Chỉ volume giữ dữ liệu.' },
  { q: 'Để build lại nhanh khi chỉ sửa mã nguồn, thứ tự đúng trong Dockerfile là?', opts: ['COPY . . rồi RUN npm ci', 'COPY package*.json, RUN npm ci, rồi mới COPY . .', 'RUN npm run build trước COPY', 'Thứ tự không ảnh hưởng'], ans: 1, why: 'Lớp npm ci chỉ làm lại khi package.json đổi, nếu COPY . . đặt sau nó.' },
  { q: 'Dòng `EXPOSE 8888` trong Dockerfile có tác dụng gì?', opts: ['Mở cổng 8888 ra Internet', 'Chỉ là ghi chú về cổng ứng dụng lắng nghe; cổng chỉ mở khi map bằng -p hoặc ports', 'Tạo luật ufw', 'Bắt buộc phải có để container chạy'], ans: 1, why: '`EXPOSE` không publish cổng. Việc publish do `-p`/`ports:` quyết định.' },
  C.pickQ('Dữ liệu Postgres cần sống'),
  { q: 'Container NestJS báo EACCES khi ghi vào ./uploads (bind mount). Nguyên nhân phổ biến nhất?', opts: ['Hết RAM', 'Thư mục host do root tạo, container chạy user node uid 1000', 'ufw chặn', 'Sai DNS'], ans: 1, why: 'Docker tự tạo thư mục bind mount thuộc root nếu chưa có. Chown về uid 1000.' },
  { q: 'Cách đưa token vào `docker login` an toàn nhất?', opts: ['docker login -u user -p TOKEN', 'echo "$TOKEN" | docker login ghcr.io -u user --password-stdin', 'Ghi token vào Dockerfile', 'Gửi token qua tên image'], ans: 1, why: '`-p` làm lộ token trong lịch sử lệnh; `--password-stdin` thì không.' },
  C.pickQ('docker compose up báo "pull access denied'),
  { q: 'Image nào bạn KHÔNG nên đưa vào Dockerfile?', opts: ['node:22-alpine', 'File .env chứa mật khẩu DB', 'package.json', 'Thư mục dist'], ans: 1, why: 'Bí mật trong image sẽ nằm trong mọi layer và registry.' },
  C.pickQ('Container thoát với mã 137'),
  { q: '`docker rmi tutor-api:v2` báo "conflict ... container is using its image". Việc đúng là?', opts: ['Dùng -f ngay', 'Xem container nào dùng (docker ps -a), dừng và xoá container đó rồi rmi', 'Xoá /var/lib/docker', 'Khởi động lại VPS'], ans: 1, why: 'Cần giải phóng container trước; `-f` dễ để lại container mồ côi.' }
];

/* ---------------- LAB ---------------- */
A.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) {
    C.vpsBase(s); C.gateway(s, { up: true });
    s.fs.put(s.home + '/tutor/api/Dockerfile', DF, { owner: s.user });
    s.fs.put(s.home + '/tutor/api/package.json', '{ "name": "tutor-api" }\n', { owner: s.user });
  },
  items: [
    { text: 'Kiểm tra phiên bản Docker.', hint: 'docker --version', check: R(/^docker --version/) },
    { text: 'Xem bạn thuộc những nhóm nào (có `docker` không?).', hint: 'groups', check: R(/^groups/) },
    { text: 'Liệt kê image đang có.', hint: 'docker images', check: R(/^docker images/) },
    { transient: true, text: 'Tải image `redis:7` từ Docker Hub.', hint: 'docker pull redis:7', check: function (s) { return hasImg(s, 'redis', '7'); } },
    { transient: true, text: 'Chạy Redis nền tên `cache`, cổng chỉ bind loopback `127.0.0.1:6379`.', hint: 'docker run -d --name cache -p 127.0.0.1:6379:6379 redis:7', check: function (s) { var c = ct(s, 'cache'); return !!c && c.state === 'running' && c.ports[0].bind === '127.0.0.1'; } },
    { text: 'Xem container đang chạy.', hint: 'docker ps', check: R(/^docker ps$/) },
    { text: 'Kiểm tra Redis sống bằng lệnh chạy bên trong: `redis-cli ping`.', hint: 'docker exec cache redis-cli ping', check: R(/^docker exec cache redis-cli/) },
    { text: 'Container `tutor-api` đang chạy bằng user nào? Dùng `docker exec ... whoami`.', hint: 'docker exec tutor-api whoami', check: R(/^docker exec tutor-api whoami/) },
    { text: 'Liệt kê thư mục `/app` bên trong `tutor-api`.', hint: 'docker exec tutor-api ls /app', check: R(/^docker exec tutor-api ls/) },
    { text: 'Hỏi trạng thái của `cache` bằng `docker inspect ... --format`.', hint: "docker inspect cache --format '{{.State.Status}}'", check: R(/^docker inspect cache/) },
    { text: 'Xem 5 dòng log cuối của `cache`.', hint: 'docker logs cache --tail 5', check: R(/^docker logs cache/) },
    { text: 'Xem tiến trình bên trong `cache`.', hint: 'docker top cache', check: R(/^docker top cache/) },
    { text: 'Xem CPU và RAM từng container, một lần.', hint: 'docker stats --no-stream', check: R(/^docker stats/) },
    { transient: true, text: 'Dừng container `cache`.', hint: 'docker stop cache', check: function (s) { var c = ct(s, 'cache'); return !!c && c.state === 'exited'; } },
    { text: 'Liệt kê cả container đã dừng.', hint: 'docker ps -a', check: R(/^docker ps -a/) },
    { text: 'Thử xoá image `redis:7` khi container `cache` còn tồn tại (sẽ báo lỗi, đó là mục đích).', hint: 'docker rmi redis:7', check: function (s) { return s.hist.some(function (h) { return /^docker rmi redis:7/.test(h.cmd) && h.code !== 0; }); } },
    { text: 'Xoá container `cache`.', hint: 'docker rm cache', check: function (s) { return ran(s, /^docker rm cache/) && !ct(s, 'cache'); } },
    { text: 'Giờ xoá được image `redis:7`.', hint: 'docker rmi redis:7', check: function (s) { return ran(s, /^docker rmi redis:7/) && !hasImg(s, 'redis', '7'); } },
    { text: 'Đọc Dockerfile của API.', hint: 'cat ~/tutor/api/Dockerfile', check: R(/^cat .*Dockerfile/) },
    { text: 'Build image `tutor-api:v2` từ thư mục `~/tutor/api`.', hint: 'docker build -t tutor-api:v2 ~/tutor/api', check: function (s) { return hasImg(s, 'tutor-api', 'v2'); } },
    { text: 'Gắn thêm tên registry: `ghcr.io/duongpd/tutor-api:v2` từ `tutor-api:v2`.', hint: 'docker tag tutor-api:v2 ghcr.io/duongpd/tutor-api:v2', check: function (s) { return hasImg(s, 'ghcr.io/duongpd/tutor-api', 'v2'); } },
    { text: 'Thử đẩy lên registry khi CHƯA đăng nhập (sẽ bị từ chối).', hint: 'docker push ghcr.io/duongpd/tutor-api:v2', check: function (s) { return s.hist.some(function (h) { return /^docker push/.test(h.cmd) && h.code !== 0; }); } },
    { text: 'Đăng nhập `ghcr.io` bằng `--password-stdin` (token giả `ghp_demo`).', hint: 'echo "ghp_demo" | docker login ghcr.io -u duongpd --password-stdin', check: function (s) { return s.W.dockerLogin === 'ghcr.io'; } },
    { text: 'Đẩy image lên registry.', hint: 'docker push ghcr.io/duongpd/tutor-api:v2', check: function (s) { return (s.W.pushed || []).indexOf('ghcr.io/duongpd/tutor-api:v2') >= 0; } },
    { text: 'Chép `/app/package.json` từ container ra `~/package.json`.', hint: 'docker cp tutor-api:/app/package.json ~/package.json', check: function (s) { return s.fs.isF(s.home + '/package.json'); } },
    { text: 'Tạo volume tên `notes` và liệt kê volume.', hint: 'docker volume create notes && docker volume ls', check: function (s) { return (s.W.volumes || []).indexOf('notes') >= 0 && ran(s, /^docker volume ls/); } },
    { text: 'Xem chi tiết volume `notes` (Mountpoint nằm ở đâu?).', hint: 'docker volume inspect notes', check: R(/^docker volume inspect notes/) },
    { text: 'Xem Docker đang chiếm bao nhiêu dung lượng.', hint: 'docker system df', check: R(/^docker system df/) },
    { text: 'Dọn image không dùng.', hint: 'docker image prune -f', check: R(/^docker image prune/) }
  ]
};

/* ---------------- DEBUGS ---------------- */
A.debugs = [
  {
    id: 'c5d9', title: 'docker ps: permission denied (docker.sock)',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker ps', 'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json": dial unix /var/run/docker.sock: connect: permission denied'),
    story: 'Bạn vừa tạo user haidangphan trên VPS mới và cài Docker bằng root. Với `sudo docker ps` thì chạy, nhưng bạn muốn dùng docker không cần sudo. Không được chmod 777 cho docker.sock.',
    goal: 'User haidangphan chạy `docker ps` được mà không cần sudo, không đổi quyền của docker.sock.',
    hints: ['Xem `groups` và `id`: user có thuộc nhóm `docker` chưa?', 'Thêm vào nhóm bằng `sudo usermod -aG docker haidangphan` (nhớ chữ `a`). Nhóm mới chỉ có hiệu lực ở phiên đăng nhập mới.', 'Dùng `newgrp docker` (hoặc thoát SSH và vào lại), rồi `docker ps` để kiểm tra.'],
    fix: ['docker ps', 'groups', 'sudo usermod -aG docker haidangphan', 'groups haidangphan', 'newgrp docker', 'docker ps'],
    cause: 'Socket Docker thuộc root và nhóm `docker`. Thêm user vào nhóm là cách chuẩn. Hai bẫy: quên `-a` (mất nhóm sudo) và quên rằng phiên hiện tại chưa nhận nhóm mới. Cũng nhớ nhóm docker gần như tương đương root.',
    setup: function (s) { C.vpsBase(s); C.gateway(s, { up: true }); s.W.dockerGroup = false; s.W.dockerListed = false; },
    check: function (s) { return s.W.dockerGroup === true && ran(s, /^docker ps/, false); }
  },
  {
    id: 'c5d10', title: 'Container thoát ngay: Cannot find module build/main.js',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker ps', 'tutor-api        Restarting (1) 6 seconds ago', '', '$ docker logs tutor-api --tail 3', "Error: Cannot find module '/app/build/main.js'", '    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)'),
    story: 'Bạn chuyển thư mục build của NestJS từ `build` sang `dist` nhưng quên sửa Dockerfile, nên `CMD` vẫn trỏ `build/main.js`. Image đã được build với CMD sai. Thư mục Dockerfile: ~/tutor/api, thư mục compose: ~/tutor/gateway.',
    goal: 'tutor-api chạy ổn định (Up).',
    hints: ['Đọc log: file không tồn tại là `/app/build/main.js`. Xem dòng `CMD` trong `~/tutor/api/Dockerfile`.', 'CMD được đóng gói vào image lúc build, nên chỉ restart container là chưa đủ: phải sửa Dockerfile rồi build lại image.', 'Sửa bằng sed (build/main.js thành dist/main.js), `docker build -t tutor-api:latest ~/tutor/api`, rồi `docker compose --env-file docker.env up -d` để tạo lại container.'],
    fix: ['docker logs tutor-api --tail 3', 'grep CMD ~/tutor/api/Dockerfile', "sed -i 's|build/main.js|dist/main.js|' ~/tutor/api/Dockerfile", 'docker build -t tutor-api:latest ~/tutor/api', 'docker compose --env-file docker.env up -d'],
    cause: 'CMD, ENV, COPY là một phần của image: đổi Dockerfile mà không build lại thì container vẫn chạy bản cũ. Quy trình đúng khi đổi code hay Dockerfile: sửa, build lại image, tạo lại container (`up -d`).',
    setup: function (s) {
      C.vpsBase(s);
      s.fs.put(s.home + '/tutor/api/Dockerfile', DF.replace('dist/main.js', 'build/main.js'), { owner: s.user });
      s.fs.put(s.home + '/tutor/api/package.json', '{ "name": "tutor-api" }\n', { owner: s.user });
      C.gateway(s, {}); s.cwd = s.home + '/tutor/gateway';
      s.silent('docker build -t tutor-api:latest ~/tutor/api');
      s.silent('docker compose --env-file docker.env up -d');
    },
    check: function (s) { var c = ct(s, 'tutor-api'); return !!c && c.state === 'running'; }
  },
  C.pickD('c5d6')
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
