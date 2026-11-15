(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.B, pick = C.pick, GiB = 1073741824;
function R(re) { return function (s) { return ran(s, re); }; }
function ct(s, n) { return s.W.containers.filter(function (c) { return c.name === n; })[0]; }
function up(s, n) { var c = ct(s, n); return !!c && c.state === 'running'; }
var ENVB = 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=Ab12cd34ef56\nDB_PASSWORD=Ab12cd34ef56\nDB_HOST=postgres\nLOG_LEVEL=info\n';
var SITE = function (port) { return L('server {', '    listen 80;', '    server_name api-tutor.haiphan.org;', '', '    location / {', '        proxy_pass ' + port + ';', '        proxy_set_header Host $host;', '    }', '}', '').join('\n'); };
function usedPct(s) { var u = s.W.diskBaseGB * GiB + (s.W.heldBytes || 0); for (var k in s.fs.n) { var n = s.fs.n[k]; if (n.t === 'f' && n.size != null) u += n.size; } return u / (90 * GiB) * 100; }

/* ---------------- THEORY ---------------- */
var stateCard = pick('Restart policy và healthcheck');
B.theory = [
  { tag: 'Khái niệm', title: 'Compose là gì, và Compose v2', body: [
    'Compose mô tả cả hệ thống nhiều container trong **một file YAML**. Bạn chạy một lệnh, Compose tạo mạng, volume và container theo đúng thứ tự.',
    { tbl: [['', 'Compose v1 (cũ)', 'Compose v2 (hiện tại)'], ['Lệnh', '`docker-compose up`', '`docker compose up` (có dấu cách)'], ['Cài đặt', 'Gói Python riêng', 'Plugin của Docker, đi kèm khi cài Docker'], ['Trạng thái', 'Đã ngừng hỗ trợ', 'Dùng cho mọi dự án mới']] },
    { ul: ['**Tên dự án** mặc định là tên thư mục (`gateway`), nên container thành `gateway-api-1`, mạng `gateway_default`, volume `gateway_pgdata`. Ở dự án tutor, `container_name` được đặt cứng để dễ gọi', '`docker compose config` in file sau khi nội suy `${BIEN}`: cách nhanh nhất để xem Compose thực sự nhìn thấy gì', '`docker compose ps / logs / exec / down` chỉ tác động tới container của dự án trong thư mục hiện tại', 'Container còn sót từ lần chạy với file cũ gọi là **orphan**; xoá bằng `docker compose up -d --remove-orphans`'] },
    { pre: ['cd ~/tutor/gateway', 'docker compose --env-file docker.env config --quiet     # chỉ báo lỗi cú pháp, im lặng là tốt', 'docker compose --env-file docker.env up -d', 'docker compose --env-file docker.env ps'] }
  ] },
  pick('File compose của dự án tutor'),
  { tag: 'Cú pháp', title: 'Compose nâng cao: override, profiles, nhiều file', body: [
    'Khi một file compose phình ra, tách theo mục đích:',
    { tbl: [['Kỹ thuật', 'Cách dùng', 'Khi nào'], ['File override', '`docker-compose.override.yml` tự được nạp cùng file chính', 'Khác biệt dev và production (cổng, volume mã nguồn)'], ['Chọn file', '`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`', 'Rõ ràng cho production'], ['Profiles', 'Gắn `profiles: ["tools"]` cho service phụ; chạy bằng `docker compose --profile tools up -d`', 'Adminer, pgAdmin chỉ bật khi cần'], ['Biến mặc định', '`${LOG_LEVEL:-info}`', 'Có giá trị dự phòng nếu quên khai báo']] },
    { pre: ['# docker-compose.yml: dùng chung', 'services:', '  adminer:', '    image: adminer:4', '    profiles: ["tools"]        # mặc định KHÔNG chạy', '    ports: ["127.0.0.1:8080:8080"]'], cap: 'Adminer chỉ bật khi gõ --profile tools, và chỉ nghe ở loopback (truy cập qua SSH tunnel)' },
    { note: 'Terminal giả lập chỉ đọc `docker-compose.yml` trong thư mục hiện tại; override và profiles chỉ có trong phần lý thuyết.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Mạng Compose: vì sao không proxy vào IP container', body: [
    'Compose tạo mạng `gateway_default`. Container trong mạng gọi nhau bằng **tên service** (`postgres`, `api`) nhờ DNS nội bộ của Docker.',
    { tbl: [['Ai gọi ai', 'Địa chỉ đúng', 'Sai thường gặp'], ['API tới Postgres (cùng Compose)', '`postgres:5432`', '`127.0.0.1:5432` (chính container API)'], ['Nginx trên host tới API', '`127.0.0.1:8888` (cổng publish)', '`172.18.0.3:8888` (IP container)'], ['Máy ngoài tới API', 'Không trực tiếp: đi qua Nginx', 'Publish `0.0.0.0:8888`']] },
    { pre: ['docker network ls', 'docker network inspect gateway_default       # xem IP từng container'] },
    { note: 'IP container **thay đổi mỗi lần container được tạo lại** (`up -d`, `down` rồi `up`). Cấu hình Nginx trỏ vào IP sẽ trả 502 sau lần deploy kế tiếp. Luôn trỏ vào cổng publish ở `127.0.0.1`.', kind: 'warn' }
  ] },
  pick('Ba nơi đặt biến môi trường: độ ưu tiên'),
  { tag: 'Quy trình', title: 'Quản lý bí mật: mật khẩu, token, khoá', body: [
    { tbl: [['Nên', 'Không nên'], ['Để mật khẩu trong `docker.env`, `chmod 600`', 'Ghi mật khẩu thẳng vào `docker-compose.yml` rồi commit'], ['Thêm `docker.env` vào `.gitignore`', 'Đưa `.env` vào image (Dockerfile `COPY . .` mà quên `.dockerignore`)'], ['Sinh ngẫu nhiên: `openssl rand -hex 24`', 'Dùng mật khẩu dễ đoán như `postgres123`'], ['Mỗi môi trường một mật khẩu riêng', 'Dùng chung mật khẩu giữa máy dev và production']] },
    { pre: ['ls -l docker.env                        # -rw------- là đúng', 'chmod 600 docker.env', 'grep -c PASSWORD docker.env              # đếm không lộ giá trị'], cap: 'Kiểm tra nhanh quyền và nội dung không in mật khẩu ra màn hình' },
    { ul: ['**Xoay (đổi) mật khẩu DB**: đổi trong DB bằng `ALTER USER` trước (hoặc cùng lúc), cập nhật `docker.env`, rồi `up -d` để API nhận env mới', 'Bí mật lỡ lộ (commit nhầm, dán vào chat) phải coi là đã mất: đổi ngay, xoá khỏi lịch sử Git không đủ', 'Docker Secrets / trình quản lý bí mật là bước nâng cao cho nhiều máy; với một VPS, file env quyền 600 là đủ hợp lý'] }
  ] },
  pick('Mật khẩu Postgres chỉ có hiệu lực lần khởi tạo đầu'),
  (function () {
    var c = pick('restart khác up -d');
    c.body = [
      { tbl: [['Lệnh', 'Làm gì', 'Nạp lại env / compose?'], ['`compose restart api`', 'Dừng rồi chạy lại **cùng container**', 'Không'], ['`compose up -d`', 'Tạo lại container nếu cấu hình hoặc env đổi', 'Có'], ['`compose up -d --force-recreate`', 'Luôn tạo lại mọi container', 'Có'], ['`compose up -d --build`', 'Build lại image (có `build:`) rồi tạo lại', 'Có'], ['`compose down && up -d`', 'Xoá container rồi tạo mới (volume giữ nguyên)', 'Có']] },
      'Sửa `docker.env` hoặc `docker-compose.yml` thì phải `up -d`, không phải `restart`. Ngược lại nếu chỉ đổi dữ liệu bên trong DB (như `ALTER USER`) thì `restart api` là đủ.',
      { pre: ['sed -i \'s/LOG_LEVEL=info/LOG_LEVEL=debug/\' docker.env', 'docker compose --env-file docker.env restart api', 'docker exec tutor-api env | grep LOG_LEVEL        # vẫn là info!', 'docker compose --env-file docker.env up -d', 'docker exec tutor-api env | grep LOG_LEVEL        # debug'], cap: 'Thí nghiệm bạn sẽ làm ở phần thực hành' }
    ];
    return c;
  })(),
  pick('Ba dạng map cổng và hệ quả bảo mật'),
  stateCard,
  { tag: 'Quy trình', title: 'Thứ tự khởi động: depends_on và race condition', body: [
    '`depends_on: [postgres]` chỉ bảo Compose **bật postgres trước**, không chờ nó sẵn sàng nhận kết nối. Postgres cần vài giây khởi tạo, API khởi động nhanh hơn và nối DB thất bại ngay lần đầu:',
    { pre: ['Error: connect ECONNREFUSED ...:5432   (database system is starting up)'] },
    { tbl: [['Giải pháp', 'Cách làm', 'Ưu nhược'], ['Restart policy', '`restart: unless-stopped` cho api', 'Đơn giản: API chết thì Docker chạy lại tới khi DB sẵn sàng. Log có vài lỗi đầu'], ['Healthcheck và điều kiện', 'postgres có `healthcheck`; api có `depends_on: postgres: condition: service_healthy`', 'Sạch nhất: API chỉ bật khi DB thật sự sẵn sàng'], ['Retry trong ứng dụng', 'TypeORM/Prisma tự thử lại kết nối', 'Bền nhất, nên có dù dùng cách nào']] },
    { pre: ['  postgres:', '    healthcheck:', '      test: ["CMD-SHELL", "pg_isready -U app"]', '      interval: 5s', '      timeout: 3s', '      retries: 10', '  api:', '    restart: unless-stopped', '    depends_on:', '      postgres:', '        condition: service_healthy'], cap: 'Cấu hình khuyên dùng' },
    { note: 'Với `restart: "no"` (có dấu ngoặc, nghĩa là không bao giờ chạy lại), API gặp lỗi ở lần đầu sẽ dừng hẳn ở trạng thái Exited.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Postgres vận hành: backup, restore, nâng cấp', body: [
    '**Backup** logic bằng `pg_dump`, ghi ra file trên host:',
    { pre: ['mkdir -p ~/backups', 'docker exec tutor-postgres pg_dump -U app tutor_db > ~/backups/tutor_db-$(date +%F).sql', 'ls -lh ~/backups'], cap: 'Dấu `>` do shell của bạn xử lý nên file nằm trên host, không phải trong container' },
    '**Restore** bằng cách đưa file vào `psql` (cờ `-i` để container nhận stdin):',
    { pre: ['cat ~/backups/tutor_db-2026-10-26.sql | docker exec -i tutor-postgres psql -U app tutor_db', 'docker exec tutor-postgres psql -U app -c "\\dt"          # kiểm tra bảng đã về'] },
    { pre: ['# /etc/cron.d/tutor-backup (chạy 02:30 mỗi đêm, giữ 7 ngày)', '30 2 * * * haidangphan docker exec tutor-postgres pg_dump -U app tutor_db > /home/haidangphan/backups/tutor_db-$(date +\\%F).sql', '45 2 * * * haidangphan find /home/haidangphan/backups -name "*.sql" -mtime +7 -delete'], cap: 'Trong crontab phải viết `\\%` thay cho `%`' },
    { ul: ['Backup chưa từng thử restore thì **chưa phải backup**: hãy thử khôi phục định kỳ trên một máy khác', 'Chép bản sao ra ngoài VPS (rclone, scp) vì ổ đĩa hỏng sẽ mất cả dữ liệu lẫn backup', '`docker compose down -v` hoặc `docker volume rm` xoá dữ liệu vĩnh viễn'] },
    { tbl: [['Nâng cấp', 'Cách làm'], ['Bản vá (16.3 lên 16.4)', 'Đổi tag `postgres:16` kéo bản mới, `up -d`: dữ liệu tương thích'], ['**Bản chính** (16 lên 17)', 'Dữ liệu KHÔNG tương thích. Phải: `pg_dump` bản 16, dựng volume mới với `postgres:17`, rồi restore']] },
    { note: 'Chỉ đổi `postgres:16` thành `postgres:17` trong compose sẽ làm container thoát với lỗi `database files are incompatible with server`. Hãy hoàn tác tag, hoặc nâng cấp đúng quy trình dump và restore.', kind: 'warn' }
  ] },
  pick('Quy trình cập nhật bản mới của API'),
  { tag: 'Quy trình', title: 'CI/CD: tự động deploy bằng GitHub Actions', body: [
    'Mục tiêu: `git push` lên nhánh main thì tự build image, đẩy lên registry, rồi SSH vào VPS kéo bản mới.',
    { pre: ['name: deploy', 'on: { push: { branches: [main] } }', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: docker/login-action@v3', '        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }', '      - uses: docker/build-push-action@v6', '        with: { context: ./api, push: true, tags: "ghcr.io/duongpd/tutor-api:${{ github.sha }}" }', '      - uses: appleboy/ssh-action@v1', '        with:', '          host: 116.118.9.210', '          username: haidangphan', '          key: ${{ secrets.VPS_SSH_KEY }}', '          script: |', '            cd ~/tutor/gateway', '            sed -i "s|^API_IMAGE=.*|API_IMAGE=ghcr.io/duongpd/tutor-api:${{ github.sha }}|" docker.env', '            docker compose --env-file docker.env pull api', '            docker compose --env-file docker.env up -d'], cap: '.github/workflows/deploy.yml (rút gọn)' },
    { ul: ['Khoá SSH cho CI là **khoá riêng**, chỉ dùng cho deploy, lưu trong GitHub Secrets, không dùng khoá cá nhân của bạn', 'Tag bằng mã commit (`github.sha`) để biết chính xác bản nào đang chạy và rollback dễ', 'Pull và up chỉ service api, không đụng Postgres'] },
    { tbl: [['Rollback', 'Cách làm'], ['Nhanh nhất', 'Sửa `image:` về tag trước (`tutor-api:v2`), `docker compose up -d`'], ['Điều kiện', 'Image cũ còn trên VPS hoặc registry (đừng `prune -a` ngay)'], ['Dữ liệu', 'Migration DB đã chạy thì rollback code có thể không đủ: cần plan riêng']] }
  ] },
  pick('Giới hạn log container (tránh đầy đĩa)'),
  { tag: 'Cú pháp', title: 'daemon.json: cấu hình mặc định cho cả Docker', body: [
    'Thay vì ghi `logging:` vào từng service, đặt mặc định cho mọi container mới trong `/etc/docker/daemon.json`:',
    { pre: ['{', '  "log-driver": "json-file",', '  "log-opts": { "max-size": "10m", "max-file": "3" },', '  "dns": ["1.1.1.1", "8.8.8.8"]', '}'] },
    { pre: ['sudo systemctl restart docker      # cấu hình mới chỉ áp cho container TẠO MỚI sau đó'] },
    { note: 'Restart Docker daemon làm các container không có `restart` policy bị dừng. Dự án tutor đặt `restart: unless-stopped` nên tự chạy lại.', kind: 'warn' }
  ] },
  { tag: 'Khái niệm', title: 'Kiến trúc dự án tutor: UI chạy PM2, API chạy Docker', body: [
    { pre: ['Trình duyệt -> Cloudflare -> Nginx :443', '    tutor.haiphan.org      -> 127.0.0.1:3000   Next.js  (PM2, tutor-ui)', '    api-tutor.haiphan.org  -> 127.0.0.1:8888   NestJS   (Docker, tutor-api)', '                                    |', '                                    +--> postgres (Docker, chỉ trong mạng Compose)'], cap: 'Hiện tại' },
    { tbl: [['', 'Next.js trên PM2 (hiện tại)', 'Next.js trong Docker'], ['Ưu', 'Đơn giản, build nhanh trên VPS, log PM2 quen thuộc', 'Môi trường giống nhau ở mọi máy, rollback bằng tag'], ['Nhược', 'Phụ thuộc phiên bản Node cài trên VPS', 'Thêm Dockerfile và bước build, image nặng hơn'], ['Hợp khi', 'Một VPS, một người quản trị', 'Nhiều môi trường, CI/CD, nhiều người']] },
    { pre: ['# next.config.js: output: "standalone"  => image nhỏ gọn', 'FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', 'FROM node:22-alpine', 'WORKDIR /app', 'COPY --from=build /app/.next/standalone ./', 'COPY --from=build /app/.next/static ./.next/static', 'COPY --from=build /app/public ./public', 'EXPOSE 3000', 'CMD ["node", "server.js"]'], cap: 'Dockerfile Next.js standalone (nếu sau này muốn chuyển UI sang Docker)' },
    'Dù theo cách nào, nguyên tắc chung giữ nguyên: ứng dụng chỉ nghe ở `127.0.0.1`, Nginx là cửa duy nhất, bí mật nằm ngoài image.'
  ] },
  pick('Gỡ lỗi 502 từ Nginx'),
  { tag: 'Bảng tra', title: 'Bảng triệu chứng và nguyên nhân thường gặp', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân hay gặp', 'Xem ở đâu'], ['`pull access denied`', 'Image nội bộ chưa được build hoặc đã bị xoá', '`docker images`'], ['`port is already allocated`', 'Cổng bị tiến trình khác giữ (PM2 cũ, container khác)', '`sudo ss -tlnp`'], ['`ECONNREFUSED 127.0.0.1`', 'Dùng localhost thay vì tên service', '`docker exec ... env`'], ['`ECONNREFUSED postgres:5432`', 'API bật trước khi DB sẵn sàng, hoặc DB đang chết', '`docker ps`, `docker logs`'], ['`password authentication failed`', 'Mật khẩu env khác mật khẩu trong DB', '`docker logs`'], ['`EACCES: permission denied`', 'Bind mount thuộc root, container chạy uid 1000', '`ls -ld`, `docker exec ... ls -ld`'], ['Restarting (137)', 'Hết RAM hoặc `mem_limit` quá thấp', '`docker inspect`, `docker stats`'], ['`database files are incompatible`', 'Đổi phiên bản chính của Postgres trên volume cũ', 'Tag image trong compose'], ['502 sau khi deploy lại', 'Nginx trỏ IP container đã đổi', '`grep proxy_pass /etc/nginx/sites-enabled/*`'], ['Bảng DB rỗng bất ngờ', 'Ai đó `down -v` hoặc xoá volume', '`docker volume ls`, backup'], ['Đĩa đầy', 'Log container không giới hạn', '`docker system df`, `du`'], ['`missing a value`', 'Thiếu biến cho `${BIEN:?}`', '`--env-file`']] },
    { note: 'Khi gặp sự cố lạ: `docker ps -a` (trạng thái), `docker logs` (lý do), `docker inspect` (mã thoát), `docker exec ... env` (cấu hình thật), `ss -tlnp` (cổng), rồi mới tới Nginx.', kind: 'tip' }
  ] }
];

/* ---------------- QUIZ ---------------- */
B.quiz = [
  C.pickQ('Bạn sửa POSTGRES_PASSWORD'),
  C.pickQ('Container api ở trạng thái "Restarting (1)'),
  C.pickQ('Vì sao nên publish cổng là'),
  C.pickQ('API trong container cần kết nối Postgres'),
  C.pickQ('Cách nào KHÔNG làm mất dữ liệu Postgres'),
  C.pickQ('Trong compose có `env_file'),
  C.pickQ('Muốn mở DBeaver'),
  C.pickQ('Vì sao nên đặt giới hạn log'),
  { q: 'Bạn sửa LOG_LEVEL trong docker.env rồi chạy `docker compose restart api`. Container có nhận giá trị mới không?', opts: ['Có', 'Không: restart giữ env cũ, cần `up -d` để tạo lại container', 'Chỉ khi xoá image', 'Chỉ khi reboot VPS'], ans: 1, why: '`restart` không đọc lại env_file; `up -d` phát hiện thay đổi và tạo lại container.' },
  { q: 'API (restart: "no") thoát ngay lần đầu với ECONNREFUSED postgres:5432 dù Postgres vẫn Up. Nguyên nhân?', opts: ['Sai mật khẩu', 'API bật trước khi DB sẵn sàng (race), và không có restart policy để thử lại', 'ufw chặn', 'Hết đĩa'], ans: 1, why: 'depends_on chỉ lo thứ tự bật. Dùng restart policy và/hoặc healthcheck với condition service_healthy.' },
  { q: 'Lệnh nào sao lưu DB Postgres ra file trên host?', opts: ['docker cp tutor-postgres:/var/lib/postgresql ~/b', 'docker exec tutor-postgres pg_dump -U app tutor_db > ~/backups/b.sql', 'docker compose down -v', 'docker volume ls'], ans: 1, why: 'pg_dump xuất SQL; dấu > ghi ra file trên host.' },
  { q: 'Đổi `image: postgres:16` thành `postgres:17` trên volume đã có dữ liệu. Điều gì xảy ra?', opts: ['Tự nâng cấp dữ liệu', 'Container thoát vì dữ liệu do bản 16 tạo ra không tương thích; cần dump và restore để nâng cấp', 'Postgres chạy bình thường', 'Compose từ chối file'], ans: 1, why: 'Bản chính khác nhau không đọc được dữ liệu của nhau: phải pg_dump/restore (pg_upgrade).' },
  { q: 'Nginx trỏ `proxy_pass http://172.18.0.3:8888`. Sau lần `up -d` kế tiếp site trả 502. Vì sao, và cách sửa?', opts: ['Cloudflare lỗi', 'IP container đổi khi tạo lại; trỏ vào cổng publish http://127.0.0.1:8888', 'Hết RAM', 'Đổi sang cổng 80'], ans: 1, why: 'IP container không cố định. Cổng publish ở loopback thì ổn định.' },
  { q: 'Bản deploy v3 lỗi, v2 chạy tốt hôm qua và image v2 vẫn còn. Rollback nhanh nhất?', opts: ['Xoá volume', 'Sửa image: về tag v2 rồi docker compose up -d', 'Build lại từ đầu', 'Reboot VPS'], ans: 1, why: 'Đổi tag về bản cũ rồi tạo lại container; vì vậy cần ghim tag và giữ image cũ.' },
  { q: 'Điều nào đúng về file `docker-compose.override.yml`?', opts: ['Phải gọi bằng -f mới có tác dụng', 'Tự được nạp và gộp với docker-compose.yml', 'Chỉ dùng cho v1', 'Thay thế hoàn toàn file chính'], ans: 1, why: 'Compose tự nạp override cạnh file chính, thường dùng cho khác biệt dev/production.' }
];

/* ---------------- LAB ---------------- */
B.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { C.vpsBase(s); C.gateway(s, { env: ENVB }); },
  items: [
    { text: 'Vào thư mục `~/tutor/gateway`.', hint: 'cd ~/tutor/gateway', check: function (s) { return /\/tutor\/gateway$/.test(s.cwd); } },
    { text: 'Đọc file `docker-compose.yml`.', hint: 'cat docker-compose.yml', check: R(/^cat .*docker-compose\.yml/) },
    { text: 'Kiểm tra cú pháp compose (chỉ báo lỗi) với `--env-file docker.env`.', hint: 'docker compose --env-file docker.env config --quiet', check: R(/^docker compose .*config/) },
    { text: 'Khởi động cả hai dịch vụ ở chế độ nền.', hint: 'docker compose --env-file docker.env up -d', check: function (s) { return up(s, 'tutor-postgres') && up(s, 'tutor-api'); } },
    { text: 'Xem trạng thái các service của dự án.', hint: 'docker compose --env-file docker.env ps', check: R(/^docker compose .*ps/) },
    { text: 'Đọc log của riêng service `api` qua Compose.', hint: 'docker compose --env-file docker.env logs api', check: R(/^docker compose .*logs/) },
    { text: 'Xem log của `tutor-api` trong 10 phút gần đây.', hint: 'docker logs tutor-api --since 10m', check: R(/^docker logs tutor-api .*--since/) },
    { text: 'Liệt kê mạng Docker, rồi xem chi tiết mạng của dự án để thấy IP từng container.', hint: 'docker network ls && docker network inspect gateway_default', check: R(/^docker network inspect gateway_default/) },
    { text: 'Postgres đã sẵn sàng nhận kết nối chưa? Dùng `pg_isready -U app` trong container.', hint: 'docker exec tutor-postgres pg_isready -U app', check: R(/^docker exec tutor-postgres pg_isready/) },
    { text: 'Liệt kê bảng trong DB bằng `\\dt`.', hint: 'docker exec tutor-postgres psql -U app -c "\\dt"', check: R(/^docker exec tutor-postgres psql .*dt/) },
    { text: 'Đếm số dòng bảng `users`.', hint: 'docker exec tutor-postgres psql -U app -c "select count(*) from users;"', check: R(/^docker exec tutor-postgres psql .*count/) },
    { text: 'Đổi `LOG_LEVEL=info` thành `debug` trong `docker.env` bằng `sed -i`.', hint: "sed -i 's/LOG_LEVEL=info/LOG_LEVEL=debug/' docker.env", check: function (s) { var n = s.fs.get(s.home + '/tutor/gateway/docker.env'); return !!n && /LOG_LEVEL=debug/.test(n.c); } },
    { transient: true, text: 'Thử `docker compose --env-file docker.env restart api`. Rồi kiểm tra: container VẪN mang LOG_LEVEL=info (restart không nạp lại env).', hint: 'docker compose --env-file docker.env restart api && docker exec tutor-api env', check: function (s) { var c = ct(s, 'tutor-api'); return ran(s, /^docker compose .*restart api/) && !!c && c.env.LOG_LEVEL === 'info' && ran(s, /^docker exec tutor-api env/); } },
    { text: 'Dùng đúng lệnh: `up -d` để container được tạo lại với env mới.', hint: 'docker compose --env-file docker.env up -d', check: function (s) { var c = ct(s, 'tutor-api'); return !!c && c.state === 'running' && c.env.LOG_LEVEL === 'debug'; } },
    { text: 'Xác nhận bằng `docker exec tutor-api env | grep LOG_LEVEL`.', hint: 'docker exec tutor-api env | grep LOG_LEVEL', check: R(/^grep LOG_LEVEL/) },
    { text: 'Tạo thư mục `~/backups`.', hint: 'mkdir -p ~/backups', check: function (s) { return s.fs.isD(s.home + '/backups'); } },
    { text: 'Sao lưu DB bằng `pg_dump` ra `~/backups/tutor_db.sql`.', hint: 'docker exec tutor-postgres pg_dump -U app tutor_db > ~/backups/tutor_db.sql', check: function (s) { var n = s.fs.get(s.home + '/backups/tutor_db.sql'); return !!n && /TUTOR_DB_DUMP/.test(n.c); } },
    { text: 'Xem file backup bằng `ls -lh`.', hint: 'ls -lh ~/backups', check: R(/^ls -lh .*backups/) },
    { transient: true, text: 'Chạy `docker compose --env-file docker.env down` (KHÔNG có -v). Container biến mất, volume còn.', hint: 'docker compose --env-file docker.env down', check: function (s) { return ran(s, /^docker compose .* down$/) && !ct(s, 'tutor-api') && s.W.db.initialized; } },
    { text: 'Xác nhận volume `gateway_pgdata` vẫn còn.', hint: 'docker volume ls', check: function (s) { return ran(s, /^docker volume ls/) && !!s.W.db.initialized; } },
    { text: 'Bật lại hệ thống và kiểm tra dữ liệu còn nguyên (`\\dt` vẫn thấy bảng).', hint: 'docker compose --env-file docker.env up -d && docker exec tutor-postgres psql -U app -c "\\dt"', check: function (s) { return up(s, 'tutor-postgres') && up(s, 'tutor-api') && ran(s, /^docker compose .* down$/) && ran(s, /^docker exec tutor-postgres psql .*dt/) && s.W.db.hasData !== false; } },
    { text: 'Tải bản image mới theo file compose.', hint: 'docker compose --env-file docker.env pull', check: R(/^docker compose .*pull/) }
  ]
};

/* ---------------- DEBUGS ---------------- */
var GW = function (s) { return s.home + '/tutor/gateway'; };
B.debugs = [
  C.pickD('c5d1'), C.pickD('c5d2'), C.pickD('c5d3'), C.pickD('c5d4'), C.pickD('c5d5'), C.pickD('c5d7'), C.pickD('c5d8'),
  {
    id: 'c5d11', title: 'API restart: EACCES permission denied ở /app/uploads',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker ps', 'tutor-api        Restarting (1) 6 seconds ago', '', '$ docker logs tutor-api --tail 2', "Error: EACCES: permission denied, open '/app/uploads/.write-test'"),
    story: 'Bạn thêm tính năng upload ảnh và gắn `./uploads:/app/uploads` vào service api. Thư mục `uploads` chưa tồn tại nên Docker tự tạo nó. Từ đó API không chạy nổi. Thư mục làm việc: ~/tutor/gateway.',
    goal: 'tutor-api chạy ổn và thư mục `uploads` thuộc user của bạn (không dùng chmod 777).',
    hints: ['Xem chủ sở hữu thư mục: `ls -ld uploads` và `docker exec tutor-api ls -ld /app/uploads`.', 'Docker tự tạo thư mục bind mount thuộc root, còn container chạy user `node` (uid 1000, chính là user của bạn trên host).', '`sudo chown -R haidangphan:haidangphan uploads`, rồi `docker compose --env-file docker.env up -d` (hoặc restart api).'],
    fix: ['docker logs tutor-api --tail 2', 'ls -ld uploads', 'docker exec tutor-api whoami', 'sudo chown -R haidangphan:haidangphan uploads', 'docker compose --env-file docker.env up -d'],
    cause: 'Bind mount dùng thư mục thật của host nên quyền của host quyết định. Thư mục do Docker tự tạo thuộc root. Cách tránh: `mkdir -p uploads` trước khi `up`, hoặc `chown` về uid của user trong container. `chmod 777` chỉ che lỗi và mở quyền cho tất cả.',
    setup: function (s) {
      C.vpsBase(s);
      C.gateway(s, { compose: C.composeFile.replace('    depends_on:\n      - postgres\n', '    depends_on:\n      - postgres\n    volumes:\n      - ./uploads:/app/uploads\n'), up: true });
      s.cwd = GW(s);
    },
    check: function (s) { var d = s.fs.get(GW(s) + '/uploads'); return up(s, 'tutor-api') && !!d && d.owner === s.user; }
  },
  {
    id: 'c5d12', title: 'API dừng hẳn (Exited 1) dù Postgres vẫn Up',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker compose ps', 'tutor-postgres   Up 12 seconds (healthy)', 'tutor-api        Exited (1) 8 seconds ago', '', '$ docker logs tutor-api --tail 3', 'Error: connect ECONNREFUSED 172.18.0.2:5432', '    (database system is starting up)'),
    story: 'Máy chủ vừa khởi động lại. Postgres cần vài giây để sẵn sàng nhưng API bật quá sớm nên thoát. Bạn đã đặt `restart: "no"` cho api từ lúc chạy thử. Chạy tay `docker start tutor-api` lúc này thì được, nhưng mỗi lần reboot lại lỗi.',
    goal: 'tutor-api tự sống lại mà không cần chạy tay, kể cả khi DB khởi động chậm.',
    hints: ['Xem log: lỗi là DB chưa sẵn sàng (ECONNREFUSED), không phải sai mật khẩu. Postgres vẫn Up nên là lỗi thứ tự khởi động.', '`depends_on` chỉ đảm bảo thứ tự bật, không chờ DB sẵn sàng. Xem dòng `restart:` của service api trong compose.', 'Đổi `restart: "no"` thành `restart: unless-stopped` bằng sed, rồi `up -d`. (Cách sạch hơn: healthcheck và `condition: service_healthy`.)'],
    fix: ['docker logs tutor-api --tail 3', 'grep -n restart docker-compose.yml', "sed -i 's/restart: \"no\"/restart: unless-stopped/' docker-compose.yml", 'docker compose --env-file docker.env up -d'],
    cause: 'Race condition giữa API và DB. Có ba lớp phòng thủ: (1) `restart: unless-stopped` để Docker thử lại, (2) healthcheck cho postgres kèm `depends_on: condition: service_healthy`, (3) ứng dụng tự retry kết nối. Chỉ dựa vào `depends_on` đơn thuần là chưa đủ.',
    setup: function (s) {
      C.vpsBase(s);
      var cf = C.composeFile.replace('    container_name: tutor-api\n    restart: unless-stopped', '    container_name: tutor-api\n    restart: "no"');
      C.gateway(s, { compose: cf, db: { initialized: false, password: null, user: 'app', slowStart: true }, up: true });
      s.cwd = GW(s);
    },
    check: function (s) { return up(s, 'tutor-api'); }
  },
  {
    id: 'c5d13', title: 'Bảng DB rỗng sau khi dọn dẹp: khôi phục từ backup',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker exec tutor-postgres psql -U app -c "\\dt"', 'Did not find any relations.', '', '$ docker exec tutor-postgres psql -U app -c "select count(*) from users;"', 'ERROR:  relation "users" does not exist'),
    story: 'Một đồng nghiệp "dọn dẹp" VPS bằng `docker compose down -v` rồi `up -d`. Hệ thống lên lại nhưng mọi dữ liệu biến mất. May là có bản backup đêm qua trong ~/backups.',
    goal: 'Dữ liệu được khôi phục: `\\dt` thấy lại các bảng, Postgres và API đang chạy.',
    hints: ['Xem bản backup có sẵn: `ls ~/backups`. Chọn bản mới nhất.', 'Đưa file SQL vào psql qua stdin của container: cần cờ `-i` cho `docker exec`.', '`cat ~/backups/tutor_db-2026-10-26.sql | docker exec -i tutor-postgres psql -U app tutor_db`, rồi kiểm tra lại bằng `\\dt`.'],
    fix: ['ls ~/backups', 'docker exec tutor-postgres psql -U app -c "\\dt"', 'cat ~/backups/tutor_db-2026-10-26.sql | docker exec -i tutor-postgres psql -U app tutor_db', 'docker exec tutor-postgres psql -U app -c "\\dt"'],
    cause: '`down -v` xoá luôn volume dữ liệu. Backup là thứ cứu bạn, nhưng chỉ khi nó tồn tại, nằm ngoài volume, và đã từng được thử restore. Hãy đặt backup tự động (cron) và chép ra ngoài VPS.',
    setup: function (s) {
      C.vpsBase(s);
      C.gateway(s, { up: true });
      s.fs.mkdirp(s.home + '/backups', s.user);
      s.fs.put(s.home + '/backups/tutor_db-2026-10-26.sql', V.DUMP, { owner: s.user });
      s.fs.put(s.home + '/backups/tutor_db-2026-10-25.sql', V.DUMP, { owner: s.user });
      s.cwd = GW(s);
      s.silent('docker compose --env-file docker.env down -v');
      s.silent('docker compose --env-file docker.env up -d');
    },
    check: function (s) { return s.W.db.hasData === true && up(s, 'tutor-postgres'); }
  },
  {
    id: 'c5d14', title: 'Postgres không lên: database files are incompatible',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker ps', 'tutor-postgres   Restarting (1) 5 seconds ago', 'tutor-api        Restarting (1) 5 seconds ago', '', '$ docker logs tutor-postgres --tail 2', 'FATAL:  database files are incompatible with server', 'DETAIL:  The data directory was initialized by PostgreSQL version 16, which is not compatible with this version 17.'),
    story: 'Bạn thấy Postgres 17 đã ra mắt nên đổi `image: postgres:16` thành `postgres:17` trong docker-compose.yml rồi `up -d`. Từ đó cả hệ thống chết. Dữ liệu thật vẫn nằm trong volume và KHÔNG được mất.',
    goal: 'Postgres và API chạy lại với dữ liệu nguyên vẹn.',
    hints: ['Log nói rõ: dữ liệu được tạo bởi bản 16, không dùng được với 17. Xem `grep image docker-compose.yml`.', 'Đừng `down -v` hay xoá volume. Cách an toàn nhất lúc này là hoàn tác tag về `postgres:16`.', '`sed -i \'s/postgres:17/postgres:16/\' docker-compose.yml`, rồi `docker compose --env-file docker.env up -d`. Việc nâng cấp thật phải làm bằng pg_dump và restore ở một ngày khác.'],
    fix: ['docker logs tutor-postgres --tail 2', 'grep -n image docker-compose.yml', "sed -i 's/postgres:17/postgres:16/' docker-compose.yml", 'docker compose --env-file docker.env up -d', 'docker exec tutor-postgres psql -U app -c "\\dt"'],
    cause: 'Mỗi bản chính của Postgres có định dạng dữ liệu riêng. Cách nâng cấp đúng: pg_dump từ bản 16, dựng volume mới với bản 17, restore vào. Ghim tag chính xác (`postgres:16`) và đọc ghi chú phát hành trước khi nâng cấp image của dịch vụ có dữ liệu.',
    setup: function (s) {
      C.vpsBase(s);
      C.gateway(s, { compose: C.composeFile.replace('postgres:16', 'postgres:17'), db: { initialized: true, version: '16', hasData: true, password: 'Ab12cd34ef56', user: 'app' } });
      s.cwd = GW(s); s.silent('docker compose --env-file docker.env up -d');
    },
    check: function (s) { return up(s, 'tutor-postgres') && up(s, 'tutor-api') && s.W.db.hasData === true && s.W.db.initialized; }
  },
  {
    id: 'c5d15', title: 'Sau khi deploy lại, API trả 502 dù container Up',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker ps', 'tutor-api   Up 2 minutes   127.0.0.1:8888->8888/tcp', '', '$ curl -sSI -H "Host: api-tutor.haiphan.org" http://127.0.0.1', 'HTTP/1.1 502 Bad Gateway'),
    story: 'Hôm qua site chạy ổn. Hôm nay bạn `docker compose down && up -d` để cập nhật, container lên bình thường nhưng domain API trả 502. Trước đó, để "cho chắc", bạn đã cấu hình Nginx trỏ thẳng vào IP của container.',
    goal: 'Request qua Nginx tới api-tutor.haiphan.org trả 200 và Nginx không còn phụ thuộc IP container.',
    hints: ['Xem Nginx đang trỏ đâu: `grep proxy_pass /etc/nginx/sites-enabled/api-tutor.haiphan.org`.', 'Địa chỉ `172.18.0.x` là IP container lúc đó. Hãy so với `docker network inspect gateway_default`: IP đã đổi sau lần tạo lại.', 'Trỏ vào cổng publish ổn định: `proxy_pass http://127.0.0.1:8888;` (sed), rồi `sudo nginx -t && sudo systemctl reload nginx`.'],
    fix: ['docker network inspect gateway_default', 'grep proxy_pass /etc/nginx/sites-enabled/api-tutor.haiphan.org', "sudo sed -i 's|http://172.18.0.[0-9]*:8888|http://127.0.0.1:8888|' /etc/nginx/sites-available/api-tutor.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx'],
    cause: 'IP container được cấp lại mỗi khi container được tạo mới, nên không bao giờ dùng nó trong cấu hình bên ngoài. Cổng publish ở 127.0.0.1 là giao diện ổn định giữa Nginx (trên host) và container.',
    setup: function (s) {
      C.vpsBase(s);
      C.gateway(s, { up: true });
      var ip = ct(s, 'tutor-api').ip;
      C.site(s, 'api-tutor.haiphan.org', SITE('http://' + ip + ':8888'));
      V.ngReload(s, false);
      s.cwd = GW(s);
      s.silent('docker compose --env-file docker.env down');
      s.silent('docker compose --env-file docker.env up -d');
    },
    check: function (s) { var f = s.fs.get('/etc/nginx/sites-available/api-tutor.haiphan.org'); return !!f && !/172\./.test(f.c) && V.probe(s, 'http://api-tutor.haiphan.org', true).status === 200; }
  },
  {
    id: 'c5d16', title: 'Bản deploy v3 lỗi: rollback về v2',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker ps', 'tutor-api   Restarting (1) 4 seconds ago   (image: tutor-api:v3)', '', '$ docker logs tutor-api --tail 2', "TypeError: Cannot read properties of undefined (reading 'split')", '    at AppService.onModuleInit (/app/dist/app.service.js:21:44)'),
    story: 'Vừa deploy tutor-api:v3 thì API chết liên tục. Bản v2 chạy tốt hôm qua và image v2 vẫn còn trên VPS. Cần phục hồi dịch vụ ngay, sửa lỗi v3 sau. Thư mục: ~/tutor/gateway.',
    goal: 'tutor-api chạy bằng image `tutor-api:v2`.',
    hints: ['`docker images` cho thấy v2 và v3 đều còn. Xem compose đang dùng tag nào.', 'Rollback = đổi `image:` về tag cũ rồi tạo lại container. Không cần build lại.', "`sed -i 's/tutor-api:v3/tutor-api:v2/' docker-compose.yml` rồi `docker compose --env-file docker.env up -d`."],
    fix: ['docker images', 'grep -n image docker-compose.yml', "sed -i 's/tutor-api:v3/tutor-api:v2/' docker-compose.yml", 'docker compose --env-file docker.env up -d'],
    cause: 'Ghim tag theo phiên bản (v2, v3) biến rollback thành việc đổi một dòng. Điều kiện: giữ lại image cũ (đừng `prune -a` ngay sau deploy) và tránh dùng `latest`. Với thay đổi có migration DB, rollback code có thể cần thêm bước xử lý dữ liệu.',
    setup: function (s) {
      C.vpsBase(s);
      s.silent('docker images');
      s.W.images.push({ repo: 'tutor-api', tag: 'v2', id: 'c0ffee000002', size: '410MB' });
      s.W.images.push({ repo: 'tutor-api', tag: 'v3', id: 'c0ffee000003', size: '413MB', crash: ["TypeError: Cannot read properties of undefined (reading 'split')", '    at AppService.onModuleInit (/app/dist/app.service.js:21:44)', '    at Module.callInitHook (node_modules/@nestjs/core/hooks/on-module-init.hook.js:51:35)'] });
      C.gateway(s, { compose: C.composeFile.replace('tutor-api:latest', 'tutor-api:v3') });
      s.cwd = GW(s); s.silent('docker compose --env-file docker.env up -d');
    },
    check: function (s) { var c = ct(s, 'tutor-api'); return !!c && c.state === 'running' && c.image === 'tutor-api:v2'; }
  },
  {
    id: 'c5d17', hard: true, title: 'Sự cố tổng hợp: domain API trả 502 (không gợi ý sẵn)',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ curl -sSI -H "Host: api-tutor.haiphan.org" http://127.0.0.1', 'HTTP/1.1 502 Bad Gateway'),
    story: 'Khách báo "API không vào được". Bạn chỉ có một dòng triệu chứng ở trên. Tuần này có hai thay đổi: một lần rotate mật khẩu DB trong docker.env, và một lần dọn cấu hình Nginx. Không có lời giải sẵn: hãy chẩn đoán từng lớp từ ngoài vào trong. Thư mục: ~/tutor/gateway.',
    goal: 'Request qua Nginx tới api-tutor.haiphan.org trả 200. (Có thể có nhiều hơn một nguyên nhân.)',
    hints: ['Đi từ trong ra ngoài: `docker ps` (container có Up không?), rồi `sudo ss -tlnp` (cổng nào đang nghe?), rồi `grep proxy_pass` (Nginx trỏ đâu?). Sửa một lớp có thể chưa đủ vì còn lớp khác.', 'Có hai lỗi độc lập: API không đăng nhập được DB (xem `docker logs tutor-api`) và Nginx trỏ nhầm cổng. Sửa cả hai.', 'Lớp DB: mật khẩu trong DB khác docker.env, dùng ALTER USER rồi `restart api`. Lớp Nginx: đổi cổng cho đúng 8888, `nginx -t`, reload.'],
    fix: ['docker ps', 'docker logs tutor-api --tail 3', 'sudo ss -tlnp', 'grep proxy_pass /etc/nginx/sites-enabled/api-tutor.haiphan.org', 'docker exec tutor-postgres psql -U postgres -c "ALTER USER app WITH PASSWORD \'Rotated789xyz\';"', 'docker compose --env-file docker.env restart api', "sudo sed -i 's/127.0.0.1:3001/127.0.0.1:8888/' /etc/nginx/sites-available/api-tutor.haiphan.org", 'sudo nginx -t && sudo systemctl reload nginx'],
    cause: 'Hai nguyên nhân chồng nhau: (1) mật khẩu DB được đổi trong docker.env nhưng không đổi trong chính DB, nên API restart liên tục và không nghe cổng nào; (2) Nginx trỏ cổng 3001 thay vì 8888. Chẩn đoán theo bậc thang từ container, cổng, Nginx giúp không bỏ sót lớp nào: sửa một lớp mà vẫn 502 là tín hiệu còn lớp khác.',
    setup: function (s) {
      C.vpsBase(s);
      C.gateway(s, { env: 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=Rotated789xyz\nDB_PASSWORD=Rotated789xyz\nDB_HOST=postgres\n', db: { initialized: true, password: 'Ab12cd34ef56', user: 'app', hasData: true }, up: true });
      C.site(s, 'api-tutor.haiphan.org', SITE('http://127.0.0.1:3001'));
      V.ngReload(s, false);
      s.cwd = GW(s);
    },
    check: function (s) { return V.probe(s, 'http://api-tutor.haiphan.org', true).status === 200; }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
