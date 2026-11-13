(function (G) {
'use strict';
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, K = C.DKC, B = C.DKD, DK = V.dk;
function R(re) { return function (s) { return ran(s, re); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function sawAny(s, re) { return s.hist.some(function (h) { return re.test(h.cmd); }); }
function failedCmd(s, re) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }
function txt(s, p) { var n = s.fs.get(p); return n ? n.c : ''; }
function HU(path, ls) { return 'tee ' + path + " > /dev/null <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
function ct(s, name) { return (s.W.containers || []).filter(function (c) { return c.name === name; })[0]; }
function imgExists(s, tag) { return DK.imgs(s.W).some(function (i) { return i.repo + ':' + i.tag === tag; }); }
function healthy(s, name) { var c = ct(s, name); return !!c && c.state === 'running' && /\(healthy\)/.test(c.status || ''); }
var HOME = '/home/haidangphan', TD = HOME + '/tutor', SITE = '/etc/nginx/sites-enabled/api-tutor.haiphan.org', CFGJ = HOME + '/.docker/config.json';
var GH = 'ghcr.io/haidangphan/tutor-api';
function siteHas(s, port) { return new RegExp('proxy_pass http://127\\.0\\.0\\.1:' + port + ';').test(txt(s, SITE)); }
function webStatus(s) { try { var r = V.ngReq(s, 'http', 'api-tutor.haiphan.org', 80, '/'); return r.kind === 'resp' ? r.status : 0; } catch (e) { return 0; } }
function webVersion(s) { var port = (/proxy_pass http:\/\/127\.0\.0\.1:(\d+);/.exec(txt(s, SITE)) || [0, 0])[1]; var u = V.upInfo(s, +port); return u ? ((/"version":"([^"]+)"/.exec(u.body) || [])[1] || '') : ''; }
function registryHas(s, key) { var D = s.W.dk4; return !!(D && D.registry && D.registry[key]); }
function loggedIn(s) { try { var j = JSON.parse(txt(s, CFGJ)); return !!(j.auths && j.auths['ghcr.io']); } catch (e) { return false; } }

var D = { id: 'c5e', group: 'Ứng dụng', short: 'Image và deploy', title: 'Quản lý image và deploy không downtime', dek: 'Tag, digest, image mồ côi và các lệnh prune; đẩy/kéo image qua registry (ghcr.io); lưu và nạp image offline; rồi deploy blue/green: build bản mới, chờ khoẻ (`--wait`), chuyển Nginx, rollback trong vài giây khi bản mới hỏng.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c5c') idx = i; });
C.lessons.splice(idx + 1, 0, D);
D.theory = [
  { tag: 'Khái niệm', title: 'Image, tag, digest và ID: bốn cách gọi cùng một thứ', body: [
    'Một image gồm các lớp (layer) bất biến. Bạn có thể trỏ tới nó bằng nhiều cách, và mỗi cách có độ tin cậy khác nhau:',
    { tbl: [['Cách gọi', 'Ví dụ', 'Bản chất', 'Có đổi được không'], ['**ID**', '`1674d2309efc`', 'Mã băm cấu hình image, chỉ có trên máy này', 'Không'], ['**Tag**', '`tutor-api:1.0.0`', 'Nhãn dán vào một image, ai cũng chuyển được sang image khác', '**CÓ**: `latest` hôm nay khác hôm qua'], ['**Digest**', '`tutor-api@sha256:5cc5...`', 'Mã băm nội dung manifest trên registry', 'Không (đổi nội dung thì digest đổi)'], ['**Tên đầy đủ**', '`ghcr.io/haidangphan/tutor-api:1.0.0`', 'Registry + chủ sở hữu + tên + tag', 'Tag vẫn đổi được']] },
    { pre: ['docker images                                  # mỗi dòng là một TAG, không phải một image', 'docker tag tutor-api:1.0.0 tutor-api:stable   # thêm tag: cùng IMAGE ID, không tốn thêm dung lượng', 'docker images --digests                       # xem thêm cột DIGEST (chỉ có với image đã push/pull)', "docker images --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}'"], cap: 'Hai tag cùng ID nghĩa là cùng một image' },
    { ul: ['`latest` chỉ là **tên tag mặc định**, không phải "bản mới nhất". Nó là bản gần nhất ai đó gắn nhãn `latest`.', 'Production nên chạy tag **cố định** (`1.2.0`, hoặc mã commit ngắn như `a1b2c3d`), để biết chính xác đang chạy gì và quay lại được.', 'Muốn bất biến tuyệt đối: ghim theo digest (`image: ghcr.io/x/y@sha256:...`). Tag có thể bị ghi đè, digest thì không.', 'Hai tag cùng ID thì xoá một tag chỉ làm mất nhãn, image vẫn còn cho tag kia.'] }
  ] },
  { tag: 'Quy trình', title: 'Kiểm kê: image nào đang chiếm ổ đĩa', body: [
    'Mỗi lần build lại cùng một tag, tag chuyển sang image mới và image cũ mất nhãn: nó thành **dangling** (mồ côi), hiện `<none>:<none>`. Không có gì tự dọn chúng. Qua vài tháng deploy, ổ đĩa đầy mà không ai hiểu vì sao.',
    { pre: ['docker images -f dangling=true            # chỉ image mồ côi', 'docker system df                            # tổng quan: Images, Containers, Volumes, Build Cache', 'docker ps -a                                # container đã dừng vẫn giữ image', 'docker history tutor-api:0.8.0              # từng lớp chiếm bao nhiêu', 'df -h /                                     # ổ đĩa của máy chủ'], cap: 'Bộ lệnh kiểm kê' },
    { pre: ['TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE', 'Images          11        4         3.74GB    2.82GB (75%)', 'Containers      4         4         80MB      0B (0%)', 'Local Volumes   1         1         67MB      0B (0%)', 'Build Cache     25        0         1.21GB    1.21GB'], cap: 'Cách đọc `docker system df`: RECLAIMABLE là phần dọn được mà không ảnh hưởng gì đang chạy' },
    { tbl: [['Nơi chiếm dung lượng', 'Vì sao tăng', 'Cách dọn'], ['Image cũ có tag', 'Mỗi phiên bản deploy để lại một image', 'Giữ vài bản gần nhất, `docker rmi` các bản cũ'], ['Image mồ côi (`<none>`)', 'Build lại cùng tag', '`docker image prune`'], ['Build cache', 'Mỗi lần build thêm các lớp trung gian', '`docker builder prune`'], ['Container đã dừng', 'Chạy `docker run` không `--rm`', '`docker container prune` hoặc `docker rm`'], ['Volume mồ côi', 'Container xoá nhưng volume còn', 'Cẩn thận, có thể là dữ liệu thật (chương trước)'], ['Log container', 'JSON log mặc định không xoay vòng', 'Đặt `logging: max-size` trong compose']] }
  ] },
  { tag: 'Cú pháp', title: 'docker rmi: untag và delete khác nhau', body: [
    { pre: ['docker tag tutor-api:1.0.0 tutor-api:stable', 'docker rmi tutor-api:stable            # Untagged: tutor-api:stable   (image vẫn còn vì tag 1.0.0 giữ nó)', 'docker rmi tutor-api:0.8.0             # Untagged + Deleted: sha256:...   (tag cuối cùng: image bị xoá)'], cap: 'Xoá tag cuối cùng mới xoá image thật' },
    { tbl: [['Thông báo', 'Nghĩa là', 'Cách xử lý'], ['`conflict: unable to remove repository reference "X" (must force) - container ... is using its referenced image`', 'Một container (kể cả đã dừng) đang dùng image này', 'Xoá container trước (`docker rm`), hoặc dừng việc xoá nếu nó đang chạy production'], ['`conflict: unable to delete ID (must be forced) - image is referenced in multiple repositories`', 'Bạn gọi theo ID nhưng image có nhiều tag', 'Xoá theo tên tag, hoặc `-f` để xoá tất cả tag'], ['`No such image: X`', 'Sai tên hoặc đã xoá', '`docker images` để xem lại'], ['`Untagged: X` rồi không có `Deleted`', 'Image còn tag khác', 'Bình thường']] },
    { note: 'Đừng dùng `docker rmi -f` để "cho xong". Cờ `-f` xoá image ngay cả khi container còn dùng nó: container đang chạy vẫn sống, nhưng lần tạo lại container sau đó sẽ không còn image để chạy.', kind: 'warn' }
  ] },
  { tag: 'Mẹo', title: 'Họ lệnh prune: mỗi lệnh xoá gì, mất gì', body: [
    { tbl: [['Lệnh', 'Xoá gì', 'Có thể mất gì'], ['`docker image prune`', 'Chỉ image mồ côi `<none>`', 'Gần như không'], ['`docker image prune -a`', 'MỌI image không có container nào dùng, kể cả có tag', '**Các bản cũ dùng để rollback**'], ['`docker container prune`', 'Mọi container đã dừng', 'Container dừng có chủ đích (ví dụ bản chờ rollback)'], ['`docker builder prune`', 'Build cache', 'Lần build sau chậm (không `CACHED`)'], ['`docker network prune`', 'Mạng không container nào dùng', 'Mạng tạo sẵn cho stack chưa bật'], ['`docker volume prune`', 'Volume ẩn danh không dùng; thêm `-a` thì cả volume có tên', '**Dữ liệu** nếu stack đang tắt'], ['`docker system prune`', 'Container dừng, mạng, image mồ côi, build cache', 'Như các dòng trên'], ['`docker system prune -a --volumes`', 'Tất cả những gì "không dùng", cả volume', '**Rất nhiều**, kể cả dữ liệu']] },
    { pre: ['docker image prune -f                 # -f: không hỏi xác nhận (không có -f thì chương trình chờ trả lời y/N)', 'docker builder prune -f', 'docker system df                       # kiểm tra kết quả'], cap: 'Dọn an toàn hằng tuần' },
    { ul: ['**Quy tắc**: chạy `docker system df` và `docker images` để xem sẽ mất gì **trước khi** prune `-a`.', 'Đẩy các bản cần giữ lên registry rồi mới `prune -a`: có chỗ khác để kéo về khi cần quay lại.', 'Đặt lịch (cron) cho `docker image prune -f` và `docker builder prune -f` là đủ cho hầu hết VPS nhỏ.', 'Không bao giờ chạy `rm -rf /var/lib/docker/...` để giải phóng ổ: nó xoá cả volume dữ liệu và làm hỏng trạng thái của Docker.'] }
  ] },
  { tag: 'Quy trình', title: 'Registry: đẩy image lên ghcr.io và kéo về', body: [
    'Registry là kho chứa image. GitHub Container Registry (`ghcr.io`) miễn phí cho gói công khai; gói riêng tư có hạn mức theo loại tài khoản. Quy trình: **đặt tên đúng**, **đăng nhập**, **push**.',
    { pre: ['# 1) Tên phải có registry và tên người dùng GitHub của bạn', 'docker tag tutor-api:1.0.0 ghcr.io/haidangphan/tutor-api:1.0.0', '', '# 2) Đăng nhập bằng token (không gõ mật khẩu vào dòng lệnh)', 'cat ~/ghcr-token.txt | docker login ghcr.io -u haidangphan --password-stdin', '', '# 3) Đẩy', 'docker push ghcr.io/haidangphan/tutor-api:1.0.0', '', '# Máy khác: kéo về', 'docker pull ghcr.io/haidangphan/tutor-api:1.0.0'], cap: 'Ba bước và lệnh kéo' },
    { tbl: [['Lỗi', 'Nguyên nhân', 'Cách chữa'], ['`An image does not exist locally with the tag: ...`', 'Chưa `docker tag` sang tên đầy đủ', 'Tag lại với `ghcr.io/<user>/<tên>:<tag>`'], ['`denied: requested access to the resource is denied`', 'Push vào `docker.io/library/...` hoặc không có quyền', 'Dùng tên đầy đủ, đúng chủ sở hữu, đã đăng nhập'], ['`unauthorized: unauthenticated`', 'Chưa đăng nhập ghcr.io', '`docker login ghcr.io ...`'], ['`denied: permission_denied: The token provided does not match expected scopes`', 'Token thiếu quyền `write:packages` hoặc sai chủ sở hữu', 'Tạo token mới với đúng scope'], ['`Head ".../manifests/<tag>": unauthorized` khi pull', 'Gói riêng tư mà chưa đăng nhập', 'Đăng nhập rồi kéo lại'], ['`manifest unknown`', 'Tag không tồn tại trên registry', '`docker images --digests`, kiểm tra tag đã push chưa']] },
    { ul: ['Token GitHub dùng loại **Personal Access Token (classic)**, vì ghcr.io chưa nhận token fine-grained cho việc đẩy/kéo gói, với quyền `write:packages` (đẩy) hoặc `read:packages` (chỉ kéo). Máy production chỉ cần `read:packages`.', '`docker login` ghi thông tin vào `~/.docker/config.json` ở dạng **base64 (không phải mã hoá)**. Giữ file này ở quyền `600` và dùng credential helper nếu có thể.', '`docker logout ghcr.io` xoá thông tin đăng nhập: làm khi dùng máy chung.', 'Trong CI (GitHub Actions) dùng token tạm của workflow, không lưu token cá nhân vào file.'] },
    { note: 'Chỉ cần ghi nhớ: **tag trước, login sau, push cuối**. Phần lớn lỗi push đều do thiếu một trong ba.', kind: 'tip' }
  ] },
  { tag: 'Khái niệm', title: 'Lưu giữ và quay lại: registry, docker save và số bản cần giữ', body: [
    'Để rollback được, bản cũ phải còn ở đâu đó. Có ba nơi:',
    { tbl: [['Nơi giữ', 'Ưu', 'Nhược', 'Dùng khi'], ['Trên VPS (tag cũ)', 'Quay lại tức thì, không cần mạng', 'Tốn ổ đĩa, bị `prune -a` xoá', 'Giữ 2 đến 3 bản gần nhất'], ['Registry (ghcr.io)', 'Bền vững, nhiều máy dùng chung', 'Cần đăng nhập và mạng', 'Nguồn sự thật, mọi bản phát hành'], ['File `docker save`', 'Chuyển được giữa máy không có registry', 'File lớn, quản lý thủ công', 'Máy không có mạng hoặc chuyển thử']] },
    { pre: ['docker save -o ~/backups/tutor-api-1.0.0.tar tutor-api:1.0.0   # đóng gói image (kèm các lớp và tag)', 'ls -lh ~/backups', 'docker load -i ~/backups/tutor-api-1.0.0.tar                       # nạp lại trên máy này hoặc máy khác', '# chuyển sang máy khác: scp ~/backups/tutor-api-1.0.0.tar user@host:~/'], cap: 'Chuyển image không qua registry' },
    { ul: ['`docker save` đóng gói **image**, không phải **container** hay volume. Dữ liệu vẫn phải sao lưu riêng (chương volume).', 'Đặt tên release có ý nghĩa (`1.2.0`) và **không ghi đè** tag đã phát hành. Cần sửa thì tăng số phiên bản.', 'Khi cần xoá để lấy chỗ, hãy xoá các bản **cũ hơn bản đang chạy hai nấc**: luôn giữ bản đang chạy và bản trước nó.'] }
  ] },
  { tag: 'Khái niệm', title: 'Vì sao deploy thông thường gây downtime', body: [
    'Với một container duy nhất, `docker compose up -d` sau khi đổi image làm như sau: **dừng** container cũ, **xoá** nó, **tạo** container mới, **khởi động**. Trong khoảng từ lúc dừng cho đến lúc ứng dụng mới sẵn sàng nhận request, Nginx không có upstream và trả `502`.',
    { pre: ['t=0s    docker compose up -d     container cũ nhận SIGTERM', 't=1s    cũ dừng                  Nginx: 502 Bad Gateway   <-- downtime bắt đầu', 't=2s    container mới khởi động', 't=9s    Nest nối DB xong         <-- app sẵn sàng, downtime kết thúc'], cap: 'Khoảng trống khoảng 8 giây (có thể lâu hơn nhiều khi chạy migration)' },
    { tbl: [['Cách', 'Downtime', 'Độ phức tạp', 'Ghi chú'], ['`up -d` đổi image (recreate)', 'Vài giây đến vài chục giây', 'Thấp nhất', 'Chấp nhận được với dịch vụ nội bộ'], ['Blue/green hai cổng + Nginx', '~0', 'Trung bình', 'Phù hợp VPS đơn, bài này'], ['Rolling nhiều bản sao sau load balancer', '~0', 'Cao hơn', 'Cần proxy biết thêm bớt bản sao'], ['Orchestrator (Swarm, Kubernetes)', '~0', 'Cao', 'Dành cho hệ thống lớn']] },
    { note: '`docker compose up -d --scale api=2` **không** giải quyết vấn đề khi `ports:` cố định: hai container cùng muốn cổng `8888` của host nên container thứ hai báo `port is already allocated`. Muốn nhiều bản sao cần một proxy đứng trước và bỏ `ports:` cố định cho từng bản sao.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Blue/green với hai cổng và Nginx', body: [
    'Ý tưởng: luôn có **hai** bản sao của API, gọi là blue và green, chạy trên hai cổng khác nhau (8881 và 8882). Nginx chỉ trỏ tới **một**. Deploy = khởi động bản mới ở màu đang rảnh, kiểm tra kỹ, rồi mới chuyển Nginx sang.',
    { pre: ['Khách ──> Nginx ──> 127.0.0.1:8881  api-blue   (bản 1.0.0, đang phục vụ)', '                  └──> 127.0.0.1:8882  api-green  (bản 1.1.0, vừa khởi động, CHƯA có khách)', '', 'Kiểm tra green trực tiếp: curl http://127.0.0.1:8882/health', 'Khoẻ → đổi proxy_pass sang 8882 → reload Nginx (không rớt kết nối đang xử lý)', 'Blue vẫn chạy để rollback tức thì'], cap: 'Luồng một lần deploy' },
    { pre: ['# docker-compose.yml: hai dịch vụ cùng image, khác tag đọc từ .env', 'api-blue:', '  image: tutor-api:${BLUE_TAG:-latest}', '  container_name: tutor-api-blue', '  ports:', '    - "127.0.0.1:8881:8888"', 'api-green:', '  image: tutor-api:${GREEN_TAG:-latest}', '  container_name: tutor-api-green', '  ports:', '    - "127.0.0.1:8882:8888"', '', '# .env', 'BLUE_TAG=1.0.0', 'GREEN_TAG=1.1.0'], cap: 'Hai dịch vụ, tag nằm trong .env nên đổi version không cần sửa compose' },
    { tbl: [['Bước', 'Lệnh', 'Kiểm chứng'], ['1. Build bản mới', '`docker build -t tutor-api:1.1.0 .`', '`docker images`'], ['2. Đặt tag cho màu rảnh', "`sed -i 's/^GREEN_TAG=.*/GREEN_TAG=1.1.0/' .env`", '`cat .env`'], ['3. Khởi động màu rảnh và chờ khoẻ', '`docker compose up -d --no-deps --wait api-green`', 'Mã thoát 0; `docker compose ps` thấy `healthy`'], ['4. Thử trực tiếp', '`curl -s http://127.0.0.1:8882/health`', 'Có `"version":"1.1.0"`'], ['5. Chuyển Nginx', "`sudo sed -i 's/8881/8882/' <file site>`", '`sudo nginx -t`'], ['6. Reload', '`sudo systemctl reload nginx`', '`curl` qua Nginx thấy `1.1.0`'], ['7. Giữ blue chờ soak', 'Không làm gì trong 10 đến 30 phút', 'Theo dõi log và lỗi'], ['8. Rollback (nếu cần)', 'Đổi 8882 về 8881 rồi reload', 'Mất vài giây']] }
  ] },
  { tag: 'Cú pháp', title: 'docker compose up: --no-deps, --wait và các cờ liên quan', body: [
    { tbl: [['Cờ', 'Tác dụng', 'Khi nào dùng'], ['`api-green` (tên dịch vụ)', 'Chỉ tạo/cập nhật dịch vụ đó (và các dịch vụ nó phụ thuộc)', 'Deploy một màu'], ['`--no-deps`', 'Không đụng tới các dịch vụ mà nó `depends_on`', 'Tránh khởi động lại Postgres khi deploy API'], ['`--wait`', 'Chờ container `healthy` (hoặc `running` nếu không có healthcheck) rồi mới trả về; mã thoát khác 0 nếu hỏng', 'Làm cổng chặn trước khi chuyển Nginx'], ['`--force-recreate`', 'Tạo lại container dù cấu hình không đổi', 'Khi cần làm mới'], ['`--build`', 'Build lại image có phần `build:` trong compose', 'Khi build trong compose'], ['`-d`', 'Chạy nền', 'Hầu như luôn dùng']] },
    { pre: ['docker compose up -d --no-deps --wait api-green && \\', '  sudo sed -i \'s/8881/8882/\' /etc/nginx/sites-enabled/api-tutor.haiphan.org && \\', '  sudo nginx -t && sudo systemctl reload nginx'], cap: 'Chuỗi && làm "cổng chặn": nếu `--wait` thất bại (mã thoát 1) thì các lệnh sau KHÔNG chạy, Nginx vẫn trỏ bản cũ' },
    { tbl: [['Kết quả của `--wait`', 'Thông báo', 'Chẩn đoán'], ['Thành công', '`Container X  Healthy`', 'Có thể chuyển Nginx'], ['Healthcheck thất bại', '`dependency failed to start: container X is unhealthy`', '`docker inspect X --format "{{json .State.Health}}"`'], ['Container sập liên tục', '`container X is restarting, wait until the container is running`', '`docker logs X --tail 20`'], ['Container thoát', '`dependency failed to start: container X exited (1)`', '`docker logs X`']] },
    { note: 'Compose chỉ **tạo lại** dịch vụ khi cấu hình hoặc image của nó đổi. Nếu bạn chạy lại cùng lệnh mà không đổi gì, bạn thấy `Container X  Running` và không có gì xảy ra: đó là hành vi mong muốn.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Cổng kiểm tra và kế hoạch rollback', body: [
    'Blue/green chỉ đáng giá nếu bạn **không chuyển Nginx khi bản mới chưa khoẻ**. Ba lớp kiểm tra, từ rẻ đến đắt:',
    { tbl: [['Lớp', 'Kiểm tra', 'Bắt được'], ['1. Khởi động', '`--wait` (trạng thái container)', 'Sập khi khởi động (thiếu module, sai cấu hình)'], ['2. Sức khoẻ', 'Healthcheck `/health` trong container', 'Ứng dụng chạy nhưng không nối được DB hoặc trả 500'], ['3. Nghiệp vụ', '`curl` thử một đường dẫn thật (đăng nhập thử, API chính)', 'Lỗi logic mà `/health` không thấy']] },
    { tbl: [['Sự cố', 'Hành động', 'Thời gian'], ['Bản mới không khoẻ trước khi chuyển', 'Không chuyển. Đặt lại tag màu rảnh về bản cũ, `up -d --no-deps --wait`', 'Khách không bị ảnh hưởng'], ['Đã chuyển, thấy lỗi tăng', 'Đổi `proxy_pass` về màu cũ, `nginx -t`, reload', 'Vài giây'], ['Bản cũ đã bị `prune`', 'Đăng nhập registry, `docker pull` bản cũ, dựng lại màu rảnh', 'Vài phút'], ['Không có bản cũ ở đâu cả', 'Build lại từ mã nguồn ở commit cũ', 'Lâu nhất: hãy tránh tình huống này']] },
    { ul: ['**Cơ sở dữ liệu là điểm yếu của rollback.** Nếu bản mới đã chạy migration phá cấu trúc (xoá cột), bản cũ có thể không chạy được. Hãy chia migration thành các bước tương thích: thêm cột trước, triển khai mã mới, xoá cột ở đợt sau.', 'Reload Nginx (`systemctl reload`) là **graceful**: worker mới nhận kết nối mới, worker cũ hoàn tất request đang xử lý. Đừng dùng `restart` khi chuyển màu.', 'Sau khi bản mới ổn định (soak), cập nhật màu còn lại lên cùng phiên bản để màu rảnh luôn là bản sao hợp lệ của bản đang chạy.', 'Ghi lại phiên bản đang chạy: phản hồi `/health` có trường `version` giúp bạn biết khách đang gặp bản nào.'] }
  ] },
  { tag: 'Mẹo', title: 'Mẫu script deploy và danh sách kiểm tra', body: [
    'Khi đã quen các bước, gói chúng thành một script có kiểm soát lỗi. Terminal trong khoá học chưa chạy được script nhiều dòng, nhưng bạn nên viết quen tay:',
    { pre: ['#!/bin/bash', 'set -euo pipefail                      # dừng ngay khi có lệnh lỗi hoặc biến chưa đặt', 'TAG="$1"; cd ~/tutor', '', '# xác định màu đang phục vụ và màu rảnh', 'if grep -q 8881 /etc/nginx/sites-enabled/api-tutor.haiphan.org; then LIVE=8881; IDLE=blue; NEW=8882; else LIVE=8882; IDLE=green; NEW=8881; fi', '[ "$IDLE" = blue ] && IDLE_VAR=BLUE_TAG || IDLE_VAR=GREEN_TAG', '', 'docker build -t tutor-api:"$TAG" .', 'sed -i "s/^$IDLE_VAR=.*/$IDLE_VAR=$TAG/" .env', 'docker compose up -d --no-deps --wait api-"$IDLE"      # lỗi ở đây thì set -e dừng, Nginx giữ nguyên', 'curl -fs http://127.0.0.1:"$NEW"/health > /dev/null', 'sudo sed -i "s/$LIVE/$NEW/" /etc/nginx/sites-enabled/api-tutor.haiphan.org', 'sudo nginx -t && sudo systemctl reload nginx', 'echo "Đã chuyển sang $TAG ($IDLE). Màu cũ giữ lại để rollback."'], cap: 'Script deploy mẫu (đọc để hiểu; chạy trên máy thật của bạn)' },
    { tbl: [['Trước deploy', 'Trong deploy', 'Sau deploy'], ['Đã build và chạy thử bản mới', 'Dùng `--wait`, không bỏ qua', 'Theo dõi log 10 phút'], ['Còn đủ ổ đĩa (`df -h`)', 'Không `restart` Nginx, chỉ `reload`', 'Giữ màu cũ để rollback'], ['Biết bản đang chạy và cách quay lại', 'Một người, một lúc, một thay đổi', 'Ghi phiên bản đã deploy'], ['Đã sao lưu cơ sở dữ liệu nếu có migration', 'Kiểm tra `curl` qua Nginx sau khi chuyển', 'Dọn image cũ SAU khi bản mới ổn định']] }
  ] },
  { tag: 'Mẹo', title: 'Bảng chẩn đoán nhanh cho chương này', body: [
    { tbl: [['Triệu chứng', 'Nghi ngờ đầu tiên', 'Lệnh kiểm tra'], ['Ổ đĩa đầy dần sau mỗi lần deploy', 'Image mồ côi, build cache', '`docker system df`, `docker images -f dangling=true`'], ['`rmi` báo `conflict ... is using its referenced image`', 'Container (kể cả đã dừng) còn dùng image', '`docker ps -a`'], ['`push` báo `unauthorized` hoặc `denied`', 'Chưa tag đúng tên hoặc chưa login', '`docker images`, `cat ~/.docker/config.json`'], ['`pull` báo `unauthorized` khi gói riêng tư', 'Chưa đăng nhập hoặc token thiếu `read:packages`', '`docker login`'], ['Sau deploy thấy 502 vài giây', 'Recreate một container duy nhất', 'Chuyển sang blue/green'], ['Khách thấy 500 sau khi chuyển Nginx', 'Chuyển khi bản mới chưa khoẻ', 'Đổi `proxy_pass` về màu cũ, reload'], ['`--wait` báo `is unhealthy`', 'Bản mới lỗi hoặc healthcheck sai', '`docker inspect ... .State.Health`, `docker logs`'], ['`--wait` báo `is restarting`', 'Ứng dụng sập khi khởi động', '`docker logs --tail 20`'], ['Cần rollback nhưng `No such image`', 'Bản cũ đã bị `prune -a`', 'Đăng nhập registry và `docker pull`'], ['`port is already allocated` khi `--scale`', 'Hai bản sao cùng cổng host cố định', 'Blue/green hai cổng hoặc proxy trước']] }
  ] }
];

D.quiz = [
  { q: 'Hôm nay `tutor-api:latest` và `tutor-api:1.0.0` có cùng IMAGE ID. Bạn chạy `docker rmi tutor-api:latest`. Điều gì xảy ra?', opts: ['Image bị xoá hoàn toàn', 'Chỉ nhãn `latest` bị gỡ (`Untagged`); image vẫn còn vì `1.0.0` giữ nó', 'Lỗi vì hai tag chung ID', 'Cả hai tag cùng mất'], ans: 1, why: 'Image chỉ bị xoá thật khi tag cuối cùng trỏ tới nó bị gỡ và không container nào dùng nó.' },
  { q: 'Vì sao image cũ thành `<none>:<none>` sau khi build lại cùng tag?', opts: ['Docker lỗi', 'Tag chuyển sang image mới; image cũ mất nhãn nên thành dangling', 'Do hết hạn', 'Do build cache'], ans: 1, why: 'Tag chỉ là con trỏ. Build lại cùng tag chuyển con trỏ sang image mới, image cũ không còn nhãn nào.' },
  { q: '`docker rmi tutor-api:1.0.0` báo `conflict: unable to remove repository reference ... container ... is using its referenced image`. Nên làm gì?', opts: ['Chạy ngay `docker rmi -f` cho xong', 'Xem `docker ps -a`; nếu là container đã dừng không cần thì `docker rm` nó; nếu đang chạy production thì đừng xoá image', 'Xoá thư mục /var/lib/docker', 'Khởi động lại máy'], ans: 1, why: 'Cờ -f bỏ qua bảo vệ. Hãy hiểu container nào đang giữ image trước khi xoá.' },
  { q: '`docker image prune -a -f` khác `docker image prune -f` ở điểm nào quan trọng nhất cho việc rollback?', opts: ['Không khác', '`-a` xoá cả image có tag mà không container nào dùng, nên các bản cũ để quay lại sẽ mất', '`-a` chạy nhanh hơn', '`-a` chỉ xoá image mồ côi'], ans: 1, why: 'Prune thường chỉ xoá image mồ côi. Có -a thì mọi image không dùng đều đi, kể cả bản trước đó.' },
  { q: '`docker system df` cho thấy Build Cache 64GB. Cách dọn phù hợp nhất mà không động tới dữ liệu?', opts: ['`docker volume prune -a`', '`docker builder prune -f`', '`rm -rf /var/lib/docker/volumes`', '`docker rm -f $(docker ps -aq)`'], ans: 1, why: 'Build cache chỉ làm lần build sau chậm hơn, không chứa dữ liệu ứng dụng. Đụng vào volume mới là nguy hiểm.' },
  { q: 'Tag nào phù hợp nhất để chạy trên production?', opts: ['`latest`', '`1.2.0` hoặc mã commit (cố định, truy vết được)', '`stable` được ghi đè mỗi tuần', '`new`'], ans: 1, why: 'Tag cố định giúp biết chính xác đang chạy gì và quay lại bản trước. Tag di động như latest thì không.' },
  { q: 'Bạn `docker push tutor-api:1.0.0` và nhận `denied: requested access to the resource is denied`. Nguyên nhân hợp lý nhất?', opts: ['Registry đang bảo trì', 'Tên không có registry/chủ sở hữu nên Docker đẩy tới docker.io/library/tutor-api', 'Thiếu RAM', 'Cổng 443 bị đóng'], ans: 1, why: 'Hãy `docker tag` sang `ghcr.io/<user>/tutor-api:1.0.0`, đăng nhập rồi push.' },
  { q: 'Cách đăng nhập registry an toàn hơn trong dòng lệnh?', opts: ['`docker login -p <token>`', '`cat token.txt | docker login ghcr.io -u user --password-stdin`', 'Viết token vào Dockerfile', 'Dán token vào tên image'], ans: 1, why: '`-p` làm token lộ trong lịch sử shell và danh sách tiến trình. `--password-stdin` thì không.' },
  { q: 'File `~/.docker/config.json` sau khi `docker login` chứa gì và nên xử lý thế nào?', opts: ['Token đã mã hoá mạnh, không cần lo', 'Chuỗi base64 của user:token (có thể giải ngược); giữ quyền 600 và dùng `docker logout` khi không cần', 'Chỉ chứa tên registry', 'Khoá riêng SSH'], ans: 1, why: 'Base64 không phải mã hoá. Ai đọc được file thì dùng được token.' },
  { q: 'Với một container duy nhất sau Nginx, vì sao `docker compose up -d` đổi image gây vài giây 502?', opts: ['Nginx tự khởi động lại', 'Container cũ bị dừng và xoá trước khi container mới sẵn sàng nên không có upstream trong khoảng đó', 'Do cache DNS', 'Do tường lửa'], ans: 1, why: 'Recreate = dừng, xoá, tạo, khởi động. Nếu không có bản sao khác thì có khoảng trống.' },
  { q: 'Vì sao `docker compose up -d --scale api=2` thất bại khi compose khai báo `ports: "127.0.0.1:8888:8888"`?', opts: ['Compose không hỗ trợ scale', 'Hai container cùng muốn cổng 8888 trên host: `port is already allocated`', 'Thiếu RAM', 'Thiếu healthcheck'], ans: 1, why: 'Cổng host chỉ gán được cho một container. Cần proxy đứng trước hoặc dùng hai cổng khác nhau (blue/green).' },
  { q: '`docker compose up -d --no-deps --wait api-green && sudo systemctl reload nginx`. Nếu green không khoẻ thì sao?', opts: ['Nginx vẫn reload', '`--wait` thoát với mã khác 0 nên `&&` ngăn không reload; khách vẫn dùng bản cũ', 'Nginx tự rollback', 'Compose xoá blue'], ans: 1, why: 'Đó là mục đích của `&&` và `--wait`: biến kiểm tra sức khoẻ thành cổng chặn.' },
  { q: '`--wait` báo `container tutor-api-blue is restarting, wait until the container is running`. Bước tiếp theo?', opts: ['Chuyển Nginx sang blue ngay', 'Xem `docker logs tutor-api-blue --tail 20` để biết vì sao sập khi khởi động, đặt lại tag bản cũ', 'Tăng `--wait-timeout`', 'Xoá Postgres'], ans: 1, why: 'Container sập liên tục thường do lỗi khởi động (thiếu module, sai cấu hình). Log cho biết nguyên nhân.' },
  { q: 'Bản mới đã chuyển Nginx và khách báo lỗi 500. Cách rollback nhanh nhất trong blue/green?', opts: ['Build lại bản cũ', 'Đổi `proxy_pass` về cổng màu cũ (vẫn chạy), `nginx -t`, reload', 'Khởi động lại VPS', 'Xoá image bản mới'], ans: 1, why: 'Màu cũ vẫn chạy nên chuyển lại chỉ mất vài giây.' },
  { q: 'Vì sao nên dùng `systemctl reload nginx` thay cho `restart` khi chuyển màu?', opts: ['Reload mạnh hơn', 'Reload là graceful: worker mới nhận kết nối mới, worker cũ xử lý nốt request đang dở; restart làm rớt kết nối', 'Không khác', 'Restart không áp dụng cấu hình'], ans: 1, why: 'Graceful reload giữ nguyên các request đang xử lý.' },
  { q: 'Lúc cần rollback, bạn phát hiện `docker image prune -a` hôm trước đã xoá bản `1.0.0` khỏi VPS. Cách cứu nhanh nhất?', opts: ['Viết lại ứng dụng', '`docker login` registry rồi `docker pull ghcr.io/<user>/tutor-api:1.0.0`, dựng lại container bằng bản đó', 'Chờ đến sáng', 'Tắt Nginx'], ans: 1, why: 'Registry là nơi bản phát hành sống lâu. Hãy đẩy mọi bản phát hành lên đó trước khi prune.' }
];

var SW = 'sudo sed -i \'s/8881/8882/\' ' + SITE, SB = 'sudo sed -i \'s/8882/8881/\' ' + SITE, RL = 'sudo nginx -t && sudo systemctl reload nginx';
var CURLW = 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/';
function curlWebCount(s) { return cnt(s, /^curl -s -H Host: api-tutor\.haiphan\.org http:\/\/127\.0\.0\.1\/$/); }
D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, { junk: true }); },
  items: [
    /* ---- A. Kiểm kê và dọn image ---- */
    { text: 'Liệt kê image trên máy: để ý mỗi dòng là một TAG, và cột IMAGE ID có thể lặp.', hint: 'docker images', check: R(/^docker images\s*$/) },
    { text: 'Lọc riêng image mồ côi (`<none>`): chúng sinh ra khi build lại cùng một tag.', hint: 'docker images -f dangling=true', check: R(/^docker images -f dangling=true/) },
    { text: 'Xem tổng quan dung lượng Docker: image, container, volume và build cache.', hint: 'docker system df', check: R(/^docker system df\s*$/) },
    { text: 'Liệt kê cả container đã dừng: `old-job` là một container chạy một lần còn sót lại.', hint: 'docker ps -a', check: R(/^docker ps -a\s*$/) },
    { text: 'Thử xoá image `tutor-api:1.0.0` đang chạy production: Docker từ chối.', hint: 'docker rmi tutor-api:1.0.0', check: function (s) { return sawAny(s, /^docker rmi tutor-api:1\.0\.0\s*$/); } },
    { text: 'Gắn thêm tag `stable` cho `tutor-api:1.0.0` (cùng IMAGE ID, không tốn thêm ổ đĩa).', hint: 'docker tag tutor-api:1.0.0 tutor-api:stable', check: function (s) { return imgExists(s, 'tutor-api:stable'); }, transient: true },
    { text: 'Xác nhận hai tag chung một ID.', hint: 'docker images tutor-api', check: R(/^docker images tutor-api\s*$/) },
    { text: 'Xoá tag `stable`: chỉ `Untagged`, không có `Deleted` vì tag `1.0.0` còn giữ image.', hint: 'docker rmi tutor-api:stable', check: function (s) { return !imgExists(s, 'tutor-api:stable') && cnt(s, /^docker rmi tutor-api:stable/) >= 1; } },
    { text: 'Xoá container thừa `old-job`.', hint: 'docker rm old-job', check: function (s) { return !ct(s, 'old-job') && cnt(s, /^docker rm old-job/) >= 1; } },
    { text: 'Xoá image `tutor-api:0.8.0` nặng 1.4GB: lần này có cả `Deleted`.', hint: 'docker rmi tutor-api:0.8.0', check: function (s) { return !imgExists(s, 'tutor-api:0.8.0') && cnt(s, /^docker rmi tutor-api:0\.8\.0/) >= 1; } },
    { text: 'Dọn image mồ côi bằng `prune` (có `-f` để không chờ xác nhận).', hint: 'docker image prune -f', check: function (s) { return cnt(s, /^docker image prune -f$/) >= 1 && !DK.imgs(s.W).some(function (i) { return i.repo === '<none>'; }); } },
    { text: 'Lưu image đang chạy ra file tar để mang đi nơi khác (`docker save`).', hint: 'docker save -o ~/backups/tutor-api-1.0.0.tar tutor-api:1.0.0', check: function (s) { return s.fs.isF(HOME + '/backups/tutor-api-1.0.0.tar'); } },
    { text: 'Kiểm tra kích thước file vừa lưu.', hint: 'ls -lh ~/backups', check: R(/^ls -lh .*backups/) },

    /* ---- B. Registry ---- */
    { text: 'Đặt tên đầy đủ cho registry ghcr.io (registry + tên GitHub + image + tag).', hint: 'docker tag tutor-api:1.0.0 ' + GH + ':1.0.0', check: function (s) { return imgExists(s, GH + ':1.0.0'); }, transient: true },
    { text: 'Thử push khi chưa đăng nhập: bị từ chối (`unauthorized`).', hint: 'docker push ' + GH + ':1.0.0', check: function (s) { return failedCmd(s, /^docker push ghcr\.io/); } },
    { text: 'Đăng nhập ghcr.io bằng token trong file, qua stdin (không để token trên dòng lệnh).', hint: 'cat ~/ghcr-token.txt | docker login ghcr.io -u haidangphan --password-stdin', check: function (s) { return loggedIn(s); }, transient: true },
    { text: 'Xem file lưu thông tin đăng nhập: quyền phải là `600`.', hint: 'ls -l ~/.docker/config.json', check: R(/^ls -l .*\.docker\/config\.json/) },
    { text: 'Đọc nội dung `config.json`: chuỗi `auth` chỉ là base64 của `user:token`, không phải mã hoá.', hint: 'cat ~/.docker/config.json', check: R(/^cat .*\.docker\/config\.json/) },
    { text: 'Push lại: lần này các lớp được đẩy lên và Docker in ra digest.', hint: 'docker push ' + GH + ':1.0.0', check: function (s) { return registryHas(s, GH + ':1.0.0'); } },
    { text: 'Xem cột DIGEST của image đã push (mã băm bất biến).', hint: 'docker images --digests ' + GH, check: R(/^docker images --digests/) },
    { text: 'Kéo lại bản vừa đẩy: nội dung giống nhau nên báo `Image is up to date`.', hint: 'docker pull ' + GH + ':1.0.0', check: R(/^docker pull ghcr\.io/) },
    { text: 'Đăng xuất để xoá thông tin đăng nhập khỏi máy.', hint: 'docker logout ghcr.io', check: function (s) { return !loggedIn(s) && cnt(s, /^docker logout ghcr\.io/) >= 1; }, transient: true },
    { text: 'Kéo khi chưa đăng nhập: gói riêng tư trả `unauthorized`.', hint: 'docker pull ' + GH + ':1.0.0', check: function (s) { return failedCmd(s, /^docker pull ghcr\.io/); } },

    /* ---- C. Blue/green ---- */
    { text: 'Xem hai màu: blue đang chạy `1.0.0`, green chưa được tạo.', hint: 'docker compose ps', check: R(/^docker compose ps\s*$/) },
    { text: 'Hỏi qua Nginx xem khách đang gặp bản nào (trường `version` và `container`).', hint: CURLW, check: function (s) { return curlWebCount(s) >= 1; } },
    { text: 'Đọc `.env`: tag của hai màu nằm ở đây.', hint: 'cat .env', check: R(/^cat \.env/) },
    { text: 'Mô phỏng một thay đổi mã nguồn để làm bản `1.1.0`.', hint: 'echo "// release 1.1.0" >> src/main.ts', check: function (s) { return /release 1\.1\.0/.test(txt(s, TD + '/src/main.ts')); } },
    { text: 'Build bản `1.1.0` (multi-stage, có HEALTHCHECK).', hint: 'docker build -t tutor-api:1.1.0 .', check: function (s) { return imgExists(s, 'tutor-api:1.1.0'); } },
    { text: 'Đặt tag cho màu rảnh (green) là `1.1.0`.', hint: "sed -i 's/^GREEN_TAG=.*/GREEN_TAG=1.1.0/' .env", check: function (s) { return /^GREEN_TAG=1\.1\.0$/m.test(txt(s, TD + '/.env')); } },
    { text: 'Khởi động riêng green và chờ khoẻ: `--no-deps` không đụng Postgres, `--wait` chặn tới khi healthy.', hint: 'docker compose up -d --no-deps --wait api-green', check: function (s) { var g = ct(s, 'tutor-api-green'); return !!g && g.image === 'tutor-api:1.1.0' && healthy(s, 'tutor-api-green'); } },
    { text: 'Thử green TRỰC TIẾP trên cổng 8882, chưa qua Nginx.', hint: 'curl -s http://127.0.0.1:8882/health', check: R(/^curl -s http:\/\/127\.0\.0\.1:8882\/health/) },
    { text: 'Khách vẫn đang vào blue (`1.0.0`): hỏi lại qua Nginx.', hint: CURLW, check: function (s) { return curlWebCount(s) >= 2; } },
    { text: 'Chuyển Nginx sang cổng green (8882) trong file site.', hint: SW, check: function (s) { return siteHas(s, 8882); } },
    { text: 'Kiểm tra cấu hình và reload (graceful, không rớt kết nối).', hint: RL, check: R(/^sudo systemctl reload nginx/) },
    { text: 'Khách đã sang `1.1.0` / `tutor-api-green` chưa?', hint: CURLW, check: function (s) { return curlWebCount(s) >= 3 && webVersion(s) === '1.1.0' && webStatus(s) === 200; } },
    { text: 'Diễn tập rollback: đổi `proxy_pass` về 8881, kiểm tra và reload.', hint: SB + ' && ' + RL, check: function (s) { return siteHas(s, 8881) && cnt(s, /^sudo systemctl reload nginx/) >= 2; }, transient: true },
    { text: 'Xác nhận khách quay về blue chỉ trong vài giây.', hint: CURLW, check: function (s) { return curlWebCount(s) >= 4; } },
    { text: 'Chuyển tiếp sang green (rollback chỉ là diễn tập).', hint: SW + ' && ' + RL, check: function (s) { return siteHas(s, 8882) && cnt(s, /^sudo systemctl reload nginx/) >= 3; } },
    { text: 'Blue giờ là màu rảnh: dừng nó (giữ container để khởi động lại nhanh).', hint: 'docker compose stop api-blue', check: function (s) { var b = ct(s, 'tutor-api-blue'); return !!b && b.state === 'exited'; }, transient: true },
    { text: 'Bản "hỏng": thêm đoạn mã khiến `/health` trả 500, rồi build `1.2.0`.', hint: 'echo "// BUG_HEALTH" >> src/main.ts && docker build -t tutor-api:1.2.0 .', check: function (s) { return imgExists(s, 'tutor-api:1.2.0'); }, transient: true },
    { text: 'Gán tag `1.2.0` cho blue (màu rảnh).', hint: "sed -i 's/^BLUE_TAG=.*/BLUE_TAG=1.2.0/' .env", check: function (s) { return /^BLUE_TAG=1\.2\.0$/m.test(txt(s, TD + '/.env')); }, transient: true },
    { text: 'Deploy blue với `--wait`: thất bại (`is unhealthy`), mã thoát khác 0.', hint: 'docker compose up -d --no-deps --wait api-blue', check: function (s) { return failedCmd(s, /^docker compose up -d --no-deps --wait api-blue/); } },
    { text: 'Đọc trạng thái sức khoẻ của blue.', hint: "docker inspect tutor-api-blue --format '{{.State.Health.Status}}'", check: R(/^docker inspect tutor-api-blue --format .*Health\.Status/) },
    { text: 'Khách có bị ảnh hưởng không? Nginx vẫn trỏ green `1.1.0`.', hint: CURLW, check: function (s) { return curlWebCount(s) >= 5 && webStatus(s) === 200; } },
    { text: 'Rollback phía màu rảnh: đặt lại tag blue là `1.1.0` rồi deploy với `--wait`.', hint: "sed -i 's/^BLUE_TAG=.*/BLUE_TAG=1.1.0/' .env && docker compose up -d --no-deps --wait api-blue", check: function (s) { var b = ct(s, 'tutor-api-blue'); return !!b && b.image === 'tutor-api:1.1.0' && healthy(s, 'tutor-api-blue'); }, transient: true },
    { text: 'Kiểu hỏng thứ hai: bỏ dòng BUG_HEALTH, thêm lỗi làm ứng dụng sập khi khởi động, rồi build `1.3.0`.', hint: "sed -i '/BUG_HEALTH/d' src/main.ts && echo \"// BUG_CRASH\" >> src/main.ts && docker build -t tutor-api:1.3.0 .", check: function (s) { return imgExists(s, 'tutor-api:1.3.0'); }, transient: true },
    { text: 'Deploy blue với `1.3.0`: lần này `--wait` báo `is restarting`.', hint: "sed -i 's/^BLUE_TAG=.*/BLUE_TAG=1.3.0/' .env && docker compose up -d --no-deps --wait api-blue", check: function (s) { return s.hist.filter(function (h) { return h.code !== 0 && /^docker compose up -d --no-deps --wait api-blue/.test(h.cmd); }).length >= 2; }, transient: true },
    { text: 'Đọc log để biết vì sao sập (thiếu module).', hint: 'docker logs tutor-api-blue --tail 5', check: R(/^docker logs tutor-api-blue --tail 5/) },
    { text: 'Đặt lại blue về `1.1.0` và deploy với `--wait`: blue khoẻ trở lại, làm bản sao dự phòng.', hint: "sed -i 's/^BLUE_TAG=.*/BLUE_TAG=1.1.0/' .env && docker compose up -d --no-deps --wait api-blue", check: function (s) { var b = ct(s, 'tutor-api-blue'); return !!b && b.image === 'tutor-api:1.1.0' && healthy(s, 'tutor-api-blue') && /^BLUE_TAG=1\.1\.0$/m.test(txt(s, TD + '/.env')) && cnt(s, /--wait api-blue/) >= 2; } },

    /* ---- D. Dọn dẹp sau deploy ---- */
    { text: 'Xem mức dùng ổ đĩa và tổng quan Docker sau các lần build.', hint: 'df -h / && docker system df', check: R(/^df -h \//) },
    { text: 'Bản `1.0.0`, `1.2.0`, `1.3.0` không còn container nào dùng. Bản `1.0.0` đã có trên ghcr.io, nên dọn mọi image không dùng.', hint: 'docker image prune -a -f', check: function (s) { return cnt(s, /^docker image prune -a -f$/) >= 1 && !imgExists(s, 'tutor-api:1.2.0') && !imgExists(s, 'tutor-api:1.3.0') && imgExists(s, 'tutor-api:1.1.0'); } },
    { text: 'Dọn build cache (không đụng dữ liệu).', hint: 'docker builder prune -f', check: function (s) { return s.W.dk4.cacheMB === 0 && cnt(s, /^docker builder prune -f$/) >= 1; } },
    { text: 'So sánh lại: RECLAIMABLE đã về gần 0.', hint: 'docker system df', check: function (s) { return cnt(s, /^docker system df\s*$/) >= 3; } },
    { text: 'Kiểm tra cuối: hai màu cùng chạy `1.1.0`, khoẻ, và khách vào được qua Nginx.', hint: 'docker compose ps', check: function (s) { return cnt(s, /^docker compose ps\s*$/) >= 2 && healthy(s, 'tutor-api-blue') && healthy(s, 'tutor-api-green') && webStatus(s) === 200; } }
  ]
};

function appendSrc(s, line) { s.fs.put(TD + '/src/main.ts', txt(s, TD + '/src/main.ts') + line + '\n', { owner: s.user }); }
function setEnv(s, key, val) { var t = txt(s, TD + '/.env').replace(new RegExp('^' + key + '=.*$', 'm'), key + '=' + val); s.fs.put(TD + '/.env', t, { owner: s.user }); }
function backToTd(s) { s.cwd = TD; s.hist.length = 0; }
var WEB = 'curl -s -H "Host: api-tutor.haiphan.org" http://127.0.0.1/';

D.debugs = [
  {
    id: 'c5e1', title: 'Pipeline CI không đẩy được image: "denied: requested access to the resource is denied"',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker push tutor-api:1.0.0', 'The push refers to repository [docker.io/library/tutor-api]', 'denied: requested access to the resource is denied', '', 'Bước CI "publish" đỏ từ sáng. Token GitHub nằm ở ~/ghcr-token.txt (đã có quyền write:packages).'),
    story: 'Bạn muốn lưu bản phát hành `1.0.0` lên GitHub Container Registry để các máy khác kéo về và để có bản rollback ngoài VPS. Lệnh `docker push` cứ bị từ chối. Hãy đọc thông báo lỗi: Docker đang đẩy tới đâu?',
    goal: 'Image `tutor-api:1.0.0` có mặt trên `ghcr.io/haidangphan/tutor-api:1.0.0`, đăng nhập bằng token qua stdin (không để token trên dòng lệnh).',
    hints: ['Dòng đầu của lỗi cho biết đích: `docker.io/library/tutor-api`. Tên image không có phần registry và chủ sở hữu nên Docker coi đó là gói chính thức trên Docker Hub, nơi bạn không có quyền.', 'Đặt tên đầy đủ bằng `docker tag tutor-api:1.0.0 ghcr.io/haidangphan/tutor-api:1.0.0`. Khi push tiếp bạn sẽ gặp `unauthorized: unauthenticated`: cần đăng nhập.', 'Đăng nhập bằng `cat ~/ghcr-token.txt | docker login ghcr.io -u haidangphan --password-stdin`, rồi `docker push ghcr.io/haidangphan/tutor-api:1.0.0`. Kiểm tra bằng `docker images --digests`.'],
    fix: ['docker push tutor-api:1.0.0', 'docker tag tutor-api:1.0.0 ' + GH + ':1.0.0', 'docker push ' + GH + ':1.0.0', 'cat ~/ghcr-token.txt | docker login ghcr.io -u haidangphan --password-stdin', 'docker push ' + GH + ':1.0.0', 'docker images --digests ' + GH],
    cause: 'Tên image quyết định đích đến. Không có tiền tố registry thì Docker đẩy tới Docker Hub, namespace `library`. Mỗi lỗi chỉ ra một thiếu sót: tên (`denied` vào docker.io), đăng nhập (`unauthorized`), hoặc quyền của token (`permission_denied`). Quy tắc: tag trước, login sau, push cuối.',
    setup: function (s) { B.base(s, {}); },
    check: function (s) { return registryHas(s, GH + ':1.0.0') && loggedIn(s); }
  },
  {
    id: 'c5e2', title: 'Ổ đĩa VPS đầy 91%: cảnh báo từ giám sát và build mới bắt đầu thất bại',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ df -h /', 'Filesystem      Size  Used Avail Use% Mounted on', '/dev/vda1        90G   82G  8.1G  91% /', '', 'Cảnh báo: "no space left on device" khi build image lúc 02:14.', 'Hệ thống đang chạy bình thường (API và Postgres vẫn phục vụ).'),
    story: 'Mỗi lần deploy lại thêm vài GB. Đồng nghiệp đề nghị `sudo rm -rf /var/lib/docker/*` cho nhanh. Bạn biết trong đó có volume Postgres. Hãy tìm thứ chiếm chỗ và dọn có chọn lọc, không động tới dữ liệu và các container đang chạy.',
    goal: 'Giải phóng ổ đĩa (build cache và image không dùng), giữ nguyên Postgres, dữ liệu và các container đang chạy.',
    hints: ['Chạy `docker system df` để xem Images, Containers, Local Volumes và Build Cache chiếm bao nhiêu và RECLAIMABLE là bao nhiêu. Cũng xem `docker images -f dangling=true` và `docker ps -a`.', 'Build cache chiếm phần lớn (hàng chục GB) và dọn nó không ảnh hưởng gì đang chạy: `docker builder prune -f`. Image mồ côi dọn bằng `docker image prune -f`.', 'Chỉ dọn image có tag không dùng (`prune -a`) khi chắc chắn bản cũ còn ở registry hoặc không cần rollback. KHÔNG đụng tới volume. Kiểm tra lại bằng `docker system df` và `df -h /`.'],
    fix: ['df -h /', 'docker system df', 'docker images -f dangling=true', 'docker builder prune -f', 'docker image prune -f', 'docker system df'],
    cause: 'Build cache và image mồ côi tích luỹ qua mỗi lần deploy. `docker system df` cho thấy ngay phần dọn được. Dọn theo từng loại (`builder prune`, `image prune`) an toàn hơn `system prune -a --volumes` hay xoá tay thư mục dữ liệu của Docker. Hãy đặt cron dọn định kỳ và đặt cảnh báo ổ đĩa ở mức 80%.',
    setup: function (s) { B.base(s, { junk: true }); s.W.dk4.cacheMB = 48000; backToTd(s); },
    check: function (s) { var b = ct(s, 'tutor-api-blue'), p = ct(s, 'tutor-postgres'); return !!b && b.state === 'running' && !!p && p.state === 'running' && s.W.db.hasData === true && s.W.dk4.cacheMB < 1000; }
  },
  {
    id: 'c5e3', title: 'Deploy bản 1.1.0 xong là toàn bộ khách gặp lỗi 500',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ' + WEB, '{"statusCode":500,"message":"Internal server error"}', '', '$ docker compose ps', 'tutor-api   tutor-api:1.1.0   Up 3 minutes (unhealthy)   127.0.0.1:8888->8888/tcp', '', 'Bản 1.0.0 chạy ổn trước đó và vẫn còn trên máy (docker images).'),
    story: 'Bạn deploy bản mới bằng cách đổi `API_TAG` trong `.env` rồi `docker compose up -d`. Bản mới khởi động nhưng `/health` trả 500. Khách đang bị ảnh hưởng ngay bây giờ: ưu tiên khôi phục dịch vụ, tìm nguyên nhân sau.',
    goal: 'Khôi phục dịch vụ về bản `1.0.0`: container `tutor-api` healthy, Nginx trả 200.',
    hints: ['Xác nhận nhanh: `docker compose ps` (trạng thái unhealthy), `curl` qua Nginx (500), `cat .env` để thấy `API_TAG=1.1.0`. Bản cũ còn trong `docker images`.', 'Rollback bằng cách đặt lại tag: sửa `API_TAG` trong `.env` về `1.0.0`. Image đã có sẵn nên không cần build hay pull.', 'Chạy `docker compose up -d --wait api`: Compose tạo lại container bằng bản `1.0.0` và chờ khoẻ. Xác nhận bằng `curl` qua Nginx (trường `version`).'],
    fix: ['docker compose ps', WEB, 'cat .env', "sed -i 's/^API_TAG=.*/API_TAG=1.0.0/' .env", 'docker compose up -d --wait api', WEB],
    cause: 'Tag cố định trong `.env` biến rollback thành một dòng sửa và một lệnh. Nếu bản cũ đã bị prune, quy trình sẽ chậm hơn nhiều (phải kéo từ registry). Lần sau dùng blue/green để bản mới được kiểm tra khi khách vẫn ở bản cũ: bạn sẽ thấy `--wait` báo lỗi trước khi chuyển Nginx.',
    setup: function (s) {
      B.base(s, { mode: 'single', tags: { api: '1.0.0' } });
      appendSrc(s, '// BUG_HEALTH'); s.silent('docker build -t tutor-api:1.1.0 .');
      setEnv(s, 'API_TAG', '1.1.0'); s.cwd = TD; s.silent('docker compose up -d'); backToTd(s);
    },
    check: function (s) { var a = ct(s, 'tutor-api'); return !!a && a.image === 'tutor-api:1.0.0' && healthy(s, 'tutor-api') && webStatus(s) === 200 && webVersion(s) === '1.0.0'; }
  },
  {
    id: 'c5e4', title: 'Blue/green: chuyển Nginx sang green xong khách báo lỗi 500',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ ' + WEB, '{"statusCode":500,"message":"Internal server error"}', '', '$ docker compose ps', 'tutor-api-blue    tutor-api:1.1.0   Up 20 minutes (healthy)     127.0.0.1:8881->8888/tcp', 'tutor-api-green   tutor-api:1.2.0   Up 2 minutes (unhealthy)    127.0.0.1:8882->8888/tcp', '', 'Nginx đã được reload cách đây 2 phút.'),
    story: 'Đồng nghiệp deploy `1.2.0` lên green rồi chuyển Nginx ngay mà không đợi kiểm tra. Blue vẫn đang chạy bản `1.1.0` khoẻ mạnh. Khách đang gặp lỗi: cứu khách trước, rồi xử lý green.',
    goal: 'Nginx lại phục vụ bản khoẻ (200), và bản hỏng `1.2.0` không còn chạy ở green.',
    hints: ['Kiểm tra từng màu trực tiếp: `curl -s http://127.0.0.1:8881/health` (khoẻ) và `curl -s http://127.0.0.1:8882/health` (500). Xem Nginx đang trỏ cổng nào: `cat /etc/nginx/sites-enabled/api-tutor.haiphan.org`.', 'Cách cứu nhanh nhất: đổi `proxy_pass` về cổng 8881 (blue vẫn chạy), `sudo nginx -t && sudo systemctl reload nginx`, rồi `curl` qua Nginx để xác nhận 200.', 'Sau khi khách an toàn, xử lý green: đặt `GREEN_TAG` về `1.1.0` trong `.env` rồi `docker compose up -d --no-deps --wait api-green` (hoặc dừng green). Lần sau luôn dùng `--wait` trước khi chuyển.'],
    fix: ['curl -s http://127.0.0.1:8881/health', 'curl -s http://127.0.0.1:8882/health', SB, RL, WEB, "sed -i 's/^GREEN_TAG=.*/GREEN_TAG=1.1.0/' .env", 'docker compose up -d --no-deps --wait api-green'],
    cause: 'Cổng kiểm tra (`--wait`, `curl /health` trực tiếp) tồn tại để chặn đúng tình huống này. Vì blue vẫn chạy, rollback chỉ là đổi cổng và reload, mất vài giây. Đây là lợi ích chính của blue/green so với recreate một container: bản cũ là nút "hoàn tác" sống.',
    setup: function (s) {
      B.base(s, { live: 'green', tags: { blue: '1.0.0', green: '1.0.0' }, up: false });
      appendSrc(s, '// release 1.1.0'); s.silent('docker build -t tutor-api:1.1.0 .');
      appendSrc(s, '// BUG_HEALTH'); s.silent('docker build -t tutor-api:1.2.0 .');
      setEnv(s, 'BLUE_TAG', '1.1.0'); setEnv(s, 'GREEN_TAG', '1.2.0'); s.cwd = TD; s.silent('docker compose up -d'); backToTd(s);
    },
    check: function (s) { var g = ct(s, 'tutor-api-green'); return webStatus(s) === 200 && webVersion(s) !== '1.2.0' && !(g && g.image === 'tutor-api:1.2.0' && g.state === 'running'); }
  },
  {
    id: 'c5e5', hard: true, title: 'Bản mới sập khi khởi động, và image bản cũ đã bị prune: cần quay lại (không gợi ý sẵn)',
    host: 'vps', user: 'haidangphan',
    symptom: L('Giám sát lúc 02:31:', '[ĐỎ] api-tutor.haiphan.org trả 502 từ 02:10', '[ĐỎ] tutor-api: Restarting (1)', '', 'Ghi chú ca trực: "Deploy 1.1.0 lúc 02:10. Tuần trước em chạy docker image prune -a để lấy chỗ trống."', 'Registry của dự án: ghcr.io/haidangphan/tutor-api (token ở ~/ghcr-token.txt).'),
    story: 'Không có gợi ý chi tiết. Bản `1.1.0` sập khi khởi động, bạn cần quay lại `1.0.0` ngay, nhưng bản đó không còn trên máy. Hãy xác nhận từng điều (log, image còn gì, registry có gì) rồi khôi phục và kiểm chứng qua Nginx.',
    goal: 'Dịch vụ chạy lại bằng đúng image `1.0.0` lấy từ registry; container `tutor-api` healthy; Nginx trả 200 với `version` là `1.0.0`.',
    hints: ['Ba việc cần biết: vì sao 1.1.0 sập (`docker logs`), máy còn image nào (`docker images`), và registry có bản nào (cần đăng nhập mới thấy).', 'Đăng nhập ghcr.io bằng token qua stdin, `docker pull ghcr.io/haidangphan/tutor-api:1.0.0`, rồi gắn tag cục bộ `tutor-api:1.0.0` để compose dùng được (hoặc sửa `image:` trong compose).', 'Đặt `API_TAG=1.0.0` trong `.env`, `docker compose up -d --wait api`, rồi `curl` qua Nginx. Cuối cùng ghi chú bài học: đẩy mọi bản phát hành lên registry TRƯỚC khi prune.'],
    fix: ['docker logs tutor-api --tail 3', 'docker images', 'cat ~/ghcr-token.txt | docker login ghcr.io -u haidangphan --password-stdin', 'docker pull ' + GH + ':1.0.0', 'docker tag ' + GH + ':1.0.0 tutor-api:1.0.0', "sed -i 's/^API_TAG=.*/API_TAG=1.0.0/' .env", 'docker compose up -d --wait api', WEB],
    cause: 'Rollback cần bản cũ ở đâu đó. `prune -a` xoá mọi image không dùng, kể cả bản vừa chạy tốt hôm trước, nên registry là bảo hiểm duy nhất. Quy trình đúng: mọi bản phát hành đã push lên registry, `prune -a` chỉ chạy khi biết chắc, và giữ ít nhất bản đang chạy cùng bản trước nó trên máy.',
    setup: function (s) {
      B.base(s, { mode: 'single', registry: true, tags: { api: '1.0.0' } });
      appendSrc(s, '// BUG_CRASH'); s.silent('docker build -t tutor-api:1.1.0 .');
      setEnv(s, 'API_TAG', '1.1.0'); s.cwd = TD; s.silent('docker compose up -d');
      s.silent('docker rmi tutor-api:1.0.0 tutor-api:latest'); backToTd(s);
    },
    check: function (s) {
      var a = ct(s, 'tutor-api'), reg = s.W.dk4.registry[GH + ':1.0.0'];
      return !!a && !!reg && a.imgId === reg.entry.id && healthy(s, 'tutor-api') && webStatus(s) === 200 && webVersion(s) === '1.0.0';
    }
  }
];

})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
