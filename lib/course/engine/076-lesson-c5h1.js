(function (G) {
'use strict';
/* Chương c5h: kiểm tra (lint) và tối ưu Dockerfile. */
var V = G.VPS, C = G.COURSE, L = C.L, ran = C.ran, B = C.DKG, DK = V.dk;
function R(re) { return function (s) { return ran(s, re); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function RF(re) { return function (s) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function HC(path, ls) { return 'cat > ' + path + " <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
var TD = '/home/haidangphan/tutor';
function T(s, f) { return txt(s, TD + '/' + f); }
function ord(t, a, b) { var i = t.indexOf(a), j = t.indexOf(b); return i >= 0 && j >= 0 && i < j; }
function img(s, ref) { var p = DK.split(ref); return DK.imgs(s.W).filter(function (x) { return x.repo === p[0] && x.tag === p[1]; })[0]; }
function okBuild(s) { return !V.dkbCheck(s, '.', null); }
function lintN(s) { return V.dkLint(T(s, 'Dockerfile')).length; }
function ct(s, n) { return (s.W.containers || []).filter(function (c) { return c.name === n; })[0]; }

var BAD = ['FROM node', 'WORKDIR /app', 'ADD . .', 'RUN apt-get update && apt-get install -y curl', 'RUN npm install', 'RUN npm run build', 'ENV API_TOKEN=npm_SECRET123', 'ENV NODE_ENV production', 'EXPOSE 8888', 'USER root', 'CMD node dist/main.js'];
var OPT = ['FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build && npm prune --omit=dev', '', 'FROM node:22-alpine', 'WORKDIR /app', 'ENV NODE_ENV=production', 'RUN apk add --no-cache curl', 'COPY --from=build /app/dist ./dist', 'COPY --from=build /app/node_modules ./node_modules', 'COPY --from=build /app/package.json ./', 'USER node', 'EXPOSE 8888', 'HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8888/health || exit 1', 'CMD ["node", "dist/main.js"]'];
var IGN = B.IGN_GOOD;

var D = { id: 'c5h', group: 'Ứng dụng', short: 'Kiểm tra và tối ưu Dockerfile', title: 'Kiểm tra và tối ưu Dockerfile: hadolint, build --check, dung lượng và cache', dek: 'Bắt lỗi Dockerfile trước khi build bằng hadolint và docker build --check, đọc mã DLxxxx, rồi tối ưu thật sự: base alpine, multi-stage, thứ tự cache, bỏ bí mật khỏi image, chạy bằng user thường. Có bảng so sánh trước và sau để thấy hiệu quả.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c5g') idx = i; });
C.lessons.splice(idx + 1, 0, D);

D.theory = [
  { tag: 'Khái niệm', title: 'Vì sao phải kiểm tra Dockerfile trước khi build', body: [
    'Một Dockerfile vẫn **build được** dù có nhiều lỗi thiết kế: image nặng gần 2GB, mật khẩu nằm trong lớp, chạy bằng root, cache mất sau mỗi lần sửa một dòng mã. Build thành công chỉ chứng minh cú pháp đúng, không chứng minh Dockerfile tốt.',
    { tbl: [['Công cụ', 'Làm gì', 'Khi nào dùng'], ['`hadolint Dockerfile`', 'Linter: phân tích file, in mã `DLxxxx` kèm số dòng', 'Trước mỗi commit, trong CI'], ['`docker build --check .`', 'BuildKit kiểm tra quy tắc có sẵn (JSON, bí mật, viết hoa) mà không build', 'Ngay trên máy, không cần cài thêm'], ['`docker history`', 'Xem từng lớp và dung lượng của image đã build', 'Sau khi build, tìm lớp nặng hoặc lớp lộ bí mật'], ['`docker images`', 'So sánh dung lượng giữa các tag', 'Đo hiệu quả trước và sau tối ưu']] },
    { note: 'Linter bắt được lỗi **thiết kế** mà trình build bỏ qua. Nhưng nó không biết ứng dụng của bạn: vẫn phải tự chạy thử và đo.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'hadolint: đọc kết quả', body: [
    'Mỗi dòng kết quả có dạng `file:dòng MÃ mức: mô tả`. Mức `error` > `warning` > `info`; lệnh trả về mã thoát **1** khi có phát hiện (dùng được trong CI để chặn merge).',
    { pre: ['hadolint Dockerfile', 'hadolint --ignore DL3059 --ignore DL3009 Dockerfile    # bỏ qua một số mã có chủ đích', 'echo $?                                                 # 0 = sạch, 1 = có phát hiện'], cap: 'Dùng hadolint' },
    { pre: ['Dockerfile:1 DL3006 warning: Always tag the version of an image explicitly', 'Dockerfile:3 DL3020 error: Use COPY instead of ADD for files and folders', 'Dockerfile:12 DL3025 warning: Use arguments JSON notation for CMD and ENTRYPOINT arguments'], cap: 'Ví dụ đầu ra' },
    { ul: ['Số sau dấu hai chấm là **số dòng**; mở `cat -n Dockerfile` đối chiếu', 'Sửa từ trên xuống, chạy lại sau mỗi lần sửa để thấy số phát hiện giảm', 'Chỉ `--ignore` khi bạn hiểu mã đó và có lý do; ghi chú lý do vào commit'] }
  ] },
  { tag: 'Bảng tra', title: 'Các mã DL thường gặp', body: [
    { tbl: [['Mã', 'Ý nghĩa', 'Cách sửa'], ['`DL3006`', 'Image nền không có tag', '`FROM node:22-alpine`'], ['`DL3007`', 'Dùng tag `latest`', 'Ghim phiên bản cụ thể'], ['`DL3020`', '`ADD` cho file/thư mục thường', 'Đổi sang `COPY` (`ADD` chỉ cho tar tự giải nén hoặc URL)'], ['`DL3025`', '`CMD node app.js` dạng shell', '`CMD ["node", "app.js"]`'], ['`DL3002`', '`USER root` ở cuối', 'Thêm `USER node` (user thường)'], ['`DL3059`', 'Nhiều `RUN` liên tiếp', 'Gộp bằng `&&` nếu chúng thuộc cùng một việc'], ['`DL3009`', 'Cài apt xong không xoá danh sách', '`&& rm -rf /var/lib/apt/lists/*` cùng một `RUN`'], ['`DL3015`', 'Cài thêm gói khuyến nghị không cần', '`apt-get install -y --no-install-recommends`'], ['`DL3019`', '`apk add` không có `--no-cache`', '`apk add --no-cache curl`'], ['`DL3003`', 'Dùng `cd` trong RUN', 'Dùng `WORKDIR`'], ['`DL3000`', '`WORKDIR` tương đối', 'Dùng đường dẫn tuyệt đối `/app`']] }
  ] },
  { tag: 'Cú pháp', title: 'docker build --check: kiểm tra có sẵn của BuildKit', body: [
    'Không cần cài gì thêm: thêm cờ `--check` vào lệnh build. Docker chỉ phân tích Dockerfile và liệt kê cảnh báo, **không build**.',
    { pre: ['docker build --check .', 'docker build --check -f Dockerfile.dev .'], cap: 'Chạy kiểm tra' },
    { tbl: [['Quy tắc', 'Nghĩa là'], ['`JSONArgsRecommended`', '`CMD` dạng shell: tiến trình không nhận SIGTERM, `docker stop` chờ 10 giây rồi bị giết'], ['`SecretsUsedInArgOrEnv`', 'Tên `ENV`/`ARG` như `API_TOKEN`, `DB_PASSWORD`: giá trị nằm vĩnh viễn trong lớp image'], ['`LegacyKeyValueFormat`', '`ENV NODE_ENV production` kiểu cũ, nên viết `ENV NODE_ENV=production`'], ['`ConsistentInstructionCasing`', 'Lẫn chữ hoa và thường (`run` và `RUN`)'], ['`MultipleInstructionsDisallowed`', 'Hai `CMD` trong cùng một stage: chỉ cái cuối có tác dụng']] },
    { note: 'Thêm dòng đầu `# check=error=true` vào Dockerfile để cảnh báo làm **build thất bại**. Hợp để chặn trong CI.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Đo trước khi tối ưu', body: [
    'Tối ưu không đo là đoán. Luôn build **bản gốc** với một tag riêng (`:bad`) để có số so sánh, rồi mới sửa.',
    { pre: ['docker build -t tutor-api:bad .', "docker images tutor-api --format '{{.Tag}} {{.Size}}'", 'docker history tutor-api:bad                        # lớp nào nặng', 'docker build --no-cache --progress=plain . 2>&1 | grep -E "DONE|CACHED"   # thời gian từng bước'], cap: 'Bốn con số cần ghi lại' },
    { tbl: [['Chỉ số', 'Cách đo', 'Mục tiêu hợp lý (NestJS)'], ['Dung lượng image', '`docker images`', 'dưới 250MB'], ['Kích thước context', 'dòng `transferring context:` khi build', 'vài MB'], ['Số bước CACHED sau khi sửa một dòng mã', 'đếm `CACHED` trong log', 'mọi bước trước `COPY . .`'], ['Bí mật trong lớp', '`docker history --no-trunc <image> | grep -i token`', 'không có kết quả']] }
  ] },
  { tag: 'Mẹo', title: 'Năm biện pháp tối ưu, xếp theo hiệu quả', body: [
    { tbl: [['Biện pháp', 'Tác động', 'Ví dụ'], ['1. Base nhỏ', 'Giảm vài trăm MB', '`node:22` (~1.1GB) sang `node:22-alpine` (~160MB)'], ['2. Multi-stage', 'Bỏ công cụ build và devDependencies', 'Tầng cuối chỉ chép `dist` và `node_modules` production'], ['3. Chỉ dependency production', 'Giảm ~240MB node_modules', '`npm prune --omit=dev` hoặc `npm ci --omit=dev`'], ['4. `.dockerignore`', 'Context từ ~350MB xuống vài MB', 'Loại `node_modules`, `.git`, `.env`'], ['5. Thứ tự lớp', 'Build lại từ ~25 giây xuống vài giây', '`COPY package*.json` → `npm ci` → `COPY . .`']] },
    { note: 'Gộp lệnh `RUN` để **dọn rác cùng lớp** (`apt-get install ... && rm -rf /var/lib/apt/lists/*`). Xoá ở `RUN` sau không làm image nhỏ lại: lớp trước đã lưu cả rồi.', kind: 'warn' }
  ] },
  { tag: 'Khái niệm', title: 'Lớp là bất biến: vì sao xoá ở lệnh sau không có tác dụng', body: [
    'Mỗi lệnh `RUN`, `COPY`, `ADD` tạo một lớp **chỉ đọc**. Lệnh sau chỉ có thể *che* file ở lớp trước chứ không xoá khỏi image. Hai ví dụ hay gặp:',
    { pre: ['COPY . .                      # chép cả .env', 'RUN rm .env                    # chỉ che, .env vẫn nằm trong lớp COPY', '', 'ENV API_TOKEN=abc123           # lưu vĩnh viễn trong metadata', 'ENV API_TOKEN=                 # ghi đè, giá trị cũ vẫn còn trong docker history'], cap: 'Xoá muộn không an toàn' },
    { ul: ['Bí mật: **không bao giờ** đưa vào image. Truyền lúc chạy bằng `--env-file` hoặc secret của Compose', 'Tệp nhạy cảm: ngăn từ đầu bằng `.dockerignore`', 'Công cụ build: dùng multi-stage để tầng cuối không bao giờ chứa chúng'] }
  ] },
  { tag: 'Lưu ý', title: 'An toàn: chạy bằng user thường và HEALTHCHECK', body: [
    { ul: ['`USER node` (image node có sẵn user này, uid 1000): nếu ứng dụng bị khai thác, kẻ tấn công không có quyền root trong container', 'Đặt `USER` **sau** các lệnh cần quyền root (`apk add`, `chown`) và trước `CMD`', 'File ứng dụng phải đọc được bởi user đó: dùng `COPY --chown=node:node` khi cần ghi', '`HEALTHCHECK` giúp `docker ps` hiện `(healthy)` hay `(unhealthy)` và để `depends_on: condition: service_healthy` và `docker compose up --wait` biết khi nào dịch vụ sẵn sàng. Docker Engine và Compose không tự khởi động lại container `unhealthy` (Swarm thì có)', 'Alpine không có `bash`, chỉ có `sh`; `curl` phải cài thêm bằng `apk add --no-cache curl`'] },
    { pre: ['docker image inspect tutor-api:opt --format \'{{.Config.User}}\'', 'docker exec tutor-api id'], cap: 'Kiểm chứng' }
  ] },
  { tag: 'Quy trình', title: 'Checklist trước khi gắn tag release', body: [
    { ul: ['**1.** `hadolint Dockerfile` không còn phát hiện (hoặc `--ignore` có lý do)', '**2.** `docker build --check .` báo `no warnings found`', '**3.** `.dockerignore` có `node_modules`, `.git`, `.env`', '**4.** Base đã ghim phiên bản và nhỏ (`-alpine` hoặc `-slim`)', '**5.** Multi-stage, tầng cuối chỉ có thứ cần để chạy', '**6.** `docker history --no-trunc | grep -i -E "token|password"` trống', '**7.** `USER` không phải root, `CMD` dạng JSON, có `HEALTHCHECK`', '**8.** Sửa một dòng mã rồi build lại: các bước trước `COPY . .` đều `CACHED`', '**9.** `docker images`: dung lượng đạt mục tiêu, ghi lại vào commit message'] }
  ] }
];

D.quiz = [
  { q: 'Dockerfile build thành công. Điều này chứng minh gì?', opts: ['Dockerfile tối ưu và an toàn', 'Chỉ cú pháp và các bước chạy được; chưa nói gì về dung lượng, bảo mật, cache', 'Container chắc chắn chạy đúng', 'Image dưới 100MB'], ans: 1, why: 'Linter và các phép đo mới đánh giá được chất lượng thiết kế.' },
  { q: '`hadolint Dockerfile` in `Dockerfile:3 DL3020 error`. Nên làm gì?', opts: ['Bỏ qua vì chỉ là gợi ý', 'Đổi `ADD` thành `COPY` ở dòng 3', 'Xoá dòng 3', 'Đổi sang `RUN`'], ans: 1, why: 'DL3020: dùng COPY cho file và thư mục thường. ADD chỉ hợp cho tar tự giải nén hoặc URL.' },
  { q: 'Mã thoát của `hadolint` khi có phát hiện, và ý nghĩa trong CI?', opts: ['0, luôn thành công', '1, có thể chặn merge', '127', '137'], ans: 1, why: 'Khác 0 nghĩa là bước CI thất bại, buộc sửa trước khi merge.' },
  { q: '`docker build --check .` khác `docker build .` thế nào?', opts: ['Build nhanh hơn bằng cache', 'Chỉ phân tích Dockerfile và in cảnh báo, không build', 'Đẩy image lên registry', 'Xoá cache'], ans: 1, why: '`--check` là chế độ kiểm tra quy tắc của BuildKit.' },
  { q: 'Cảnh báo `SecretsUsedInArgOrEnv` cho `ENV API_TOKEN=...` nghĩa là gì?', opts: ['Biến bị thiếu', 'Giá trị nằm vĩnh viễn trong lớp image và lộ qua docker history', 'Biến quá dài', 'Chỉ là phong cách'], ans: 1, why: 'Ai kéo được image đều đọc được. Truyền bí mật lúc chạy, không lúc build.' },
  { q: 'Bạn `COPY . .` (có `.env`) rồi `RUN rm .env`. `.env` còn trong image không?', opts: ['Không, đã xoá', 'Còn, nằm ở lớp COPY; lớp sau chỉ che', 'Chỉ còn khi chạy', 'Tuỳ hệ điều hành'], ans: 1, why: 'Lớp bất biến. Cách đúng: `.dockerignore` loại `.env` từ đầu.' },
  { q: 'Cách nào làm image nhỏ lại thật sự khi cài gói apt?', opts: ['`RUN apt-get install -y curl` rồi `RUN rm -rf /var/lib/apt/lists/*` ở lệnh sau', 'Gộp: `apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*` trong một RUN', 'Dùng `ADD`', 'Thêm `EXPOSE`'], ans: 1, why: 'Dọn trong cùng lớp với lúc cài thì rác mới không được lưu.' },
  { q: 'Thứ tự nào giúp `npm ci` không chạy lại khi chỉ sửa mã?', opts: ['`COPY . .` rồi `RUN npm ci`', '`COPY package*.json ./` → `RUN npm ci` → `COPY . .`', '`RUN npm ci` rồi `COPY package.json`', 'Không quan trọng'], ans: 1, why: 'Lớp npm ci chỉ phụ thuộc package*.json; mã nguồn chép sau.' },
  { q: '`CMD node dist/main.js` (dạng shell) có vấn đề gì?', opts: ['Không chạy được', 'Tiến trình chạy qua /bin/sh, không nhận SIGTERM đúng, `docker stop` chờ 10 giây rồi SIGKILL', 'Chạy chậm', 'Không đọc được biến môi trường'], ans: 1, why: 'Dùng dạng JSON `CMD ["node", "dist/main.js"]` để node là PID 1 và nhận tín hiệu trực tiếp.' },
  { q: 'Vì sao chuyển `FROM node:22` sang `FROM node:22-alpine` là bước tối ưu lớn nhất?', opts: ['Alpine nhanh hơn CPU', 'Image nền nhỏ hơn hàng trăm MB', 'Alpine có nhiều công cụ hơn', 'Không cần npm'], ans: 1, why: 'Alpine rất nhỏ. Đổi lại dùng `apk` thay `apt`, không có bash.' },
  { q: 'Muốn chặn `USER root` nằm lại ở cuối Dockerfile, hadolint báo mã nào?', opts: ['DL3006', 'DL3002', 'DL3059', 'DL3019'], ans: 1, why: 'DL3002: Last USER should not be root.' },
  { q: 'Kiểm tra token có lọt vào image `opt` không?', opts: ['`docker ps`', '`docker history --no-trunc tutor-api:opt | grep -i token`', '`docker logs`', '`docker stats`'], ans: 1, why: 'history --no-trunc hiện đủ câu lệnh tạo từng lớp, kể cả ENV.' }
];

D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, { dockerfile: BAD }); },
  items: [
    { text: 'Đọc Dockerfile hiện tại có đánh số dòng. Bạn thấy bao nhiêu điều đáng ngờ?', hint: 'cat -n Dockerfile', check: R(/^cat -n Dockerfile/) },
    { text: 'Chạy linter: phải có nhiều phát hiện, mã thoát 1.', hint: 'hadolint Dockerfile', check: RF(/^hadolint Dockerfile$/) },
    { text: 'Bỏ qua tạm hai mã `DL3059` và `DL3009` để xem phần còn lại.', hint: 'hadolint --ignore DL3059 --ignore DL3009 Dockerfile', check: RF(/--ignore DL3059/) },
    { text: 'Chạy kiểm tra có sẵn của BuildKit: xem cảnh báo về bí mật, JSON, ENV.', hint: 'docker build --check .', check: function (s) { return cnt(s, /^docker build --check/) >= 1; } },
    { text: 'Build bản gốc làm mốc đo: tag `bad`.', hint: 'docker build -t tutor-api:bad .', check: function (s) { return cnt(s, /^docker build -t tutor-api:bad \.$/) >= 1; } },
    { text: 'Ghi lại dung lượng bản gốc.', hint: "docker images tutor-api --format '{{.Tag}} {{.Size}}'", check: R(/^docker images tutor-api --format/) },
    { text: 'Xem từng lớp của bản gốc: lớp nào nặng nhất?', hint: 'docker history tutor-api:bad', check: R(/^docker history tutor-api:bad$/) },
    { text: 'Tìm bí mật trong lịch sử image (phải thấy `API_TOKEN`).', hint: 'docker history --no-trunc tutor-api:bad | grep API_TOKEN', check: R(/^grep API_TOKEN/) },
    { text: 'Tạo `.dockerignore` để loại `node_modules`, `.git`, `.env` khỏi context.', hint: HC('.dockerignore', IGN), check: function (s) { var t = T(s, '.dockerignore'); return /^node_modules$/m.test(t) && /^\.env$/m.test(t); } },
    { text: 'Sửa lỗi 1 (DL3020): đổi `ADD` thành `COPY`.', hint: "sed -i 's/^ADD /COPY /' Dockerfile", check: function (s) { return /^COPY \. \./m.test(T(s, 'Dockerfile')) && !/^ADD /m.test(T(s, 'Dockerfile')); } },
    { text: 'Sửa lỗi 2 (DL3006): ghim base thành `node:22-alpine`.', hint: "sed -i 's/^FROM node$/FROM node:22-alpine/' Dockerfile", check: function (s) { return /^FROM node:22-alpine$/m.test(T(s, 'Dockerfile')); } },
    { text: 'Build thử: phải lỗi vì `apt-get` không có trên alpine (mã 127).', hint: 'docker build -t tutor-api:try . 2>&1 | tail -n 8', check: RF(/tutor-api:try/) },
    { text: 'Sửa: thay dòng apt bằng `apk add --no-cache curl`.', hint: "sed -i 's/^RUN apt-get.*/RUN apk add --no-cache curl/' Dockerfile", check: function (s) { return /^RUN apk add --no-cache curl$/m.test(T(s, 'Dockerfile')); } },
    { text: 'Lint lại: số phát hiện còn lại là bao nhiêu? (vẫn còn `DL3059`, `DL3002`, `DL3025`).', hint: 'hadolint Dockerfile', check: function (s) { return s.hist.filter(function (h) { return h.code !== 0 && /^hadolint Dockerfile$/.test(h.cmd); }).length >= 2; } },
    { text: 'Viết lại Dockerfile hoàn chỉnh: multi-stage, `npm ci`, prune devDependencies, `USER node`, `HEALTHCHECK`, `CMD` dạng JSON.', hint: HC('Dockerfile', OPT), check: function (s) { var t = T(s, 'Dockerfile'); return (t.match(/^FROM /gm) || []).length === 2 && /^USER node/m.test(t) && /^CMD \[/m.test(t) && /HEALTHCHECK/.test(t) && ord(t, 'COPY package', 'npm ci') && ord(t, 'npm ci', 'COPY . .'); } },
    { text: 'Lint lại: không còn gì in ra, mã thoát 0.', hint: 'hadolint Dockerfile', check: function (s) { return cnt(s, /^hadolint Dockerfile$/) >= 1; } },
    { text: 'Kiểm tra BuildKit: `no warnings found`.', hint: 'docker build --check .', check: function (s) { return cnt(s, /^docker build --check/) >= 2 && V.dkChecks(T(s, 'Dockerfile')).length === 0; } },
    { text: 'Build bản tối ưu: tag `opt`. Quan sát `[build n/m]` và `[stage-1 n/m]`.', hint: 'docker build -t tutor-api:opt .', check: function (s) { return cnt(s, /^docker build -t tutor-api:opt \.$/) >= 1; } },
    { text: 'So sánh dung lượng hai bản `bad` và `opt`.', hint: "docker images tutor-api --format '{{.Tag}} {{.Size}}'", check: function (s) { return cnt(s, /^docker images tutor-api --format/) >= 2; } },
    { text: 'Tìm bí mật trong lịch sử của `opt`: không còn gì (đếm bằng 0).', hint: 'docker history --no-trunc tutor-api:opt | grep -c API_TOKEN', check: function (s) { return s.hist.some(function (h) { return /^grep -c API_TOKEN/.test(h.cmd); }); } },
    { text: 'Sửa mã nguồn một dòng để thử cache.', hint: 'echo "// v2" >> src/main.ts', check: function (s) { return /\/\/ v2/.test(T(s, 'src/main.ts')); } },
    { text: 'Build `opt2` và đếm số bước `CACHED`: `npm ci` phải dùng lại cache.', hint: 'docker build -t tutor-api:opt2 . 2>&1 | grep -c CACHED', check: function (s) { return cnt(s, /^docker build -t tutor-api:opt2 /) >= 1; } },
    { text: 'Kiểm tra user của image: phải là `node`, không phải root.', hint: "docker image inspect tutor-api:opt --format '{{.Config.User}}'", check: R(/^docker image inspect tutor-api:opt --format/) },
    { text: 'Chạy bản tối ưu, chỉ publish ở loopback.', hint: 'docker run -d --name tutor-api -p 127.0.0.1:8888:8888 tutor-api:opt', check: function (s) { var c = ct(s, 'tutor-api'); return !!c && c.state === 'running'; } },
    { text: 'Xác nhận tiến trình trong container chạy bằng user thường.', hint: 'docker exec tutor-api id', check: R(/^docker exec tutor-api id/) },
    { text: 'Xem tổng dung lượng Docker đang dùng và phần có thể dọn.', hint: 'docker system df', check: R(/^docker system df/) }
  ]
};

var OPTHINT = HC('Dockerfile', OPT);
D.debugs = [
  {
    id: 'c5h1', title: 'Image 1.9GB, kéo về mất vài phút',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker images tutor-api', 'REPOSITORY   TAG   IMAGE ID       CREATED          SIZE', 'tutor-api    v1    3f2a9c1d7e44   2 minutes ago    1.9GB'),
    story: 'Mỗi lần deploy VPS phải kéo image gần 2GB và ổ đĩa đầy rất nhanh. Dockerfile chỉ có một stage trên `node:22`, chạy `npm install` đủ devDependencies và giữ nguyên toàn bộ mã nguồn.',
    goal: 'Build lại `tutor-api:v1` với dung lượng dưới 400MB mà ứng dụng vẫn chạy bằng `node dist/main.js`.',
    hints: ['Đo trước: `docker history tutor-api:v1` cho thấy base và `node_modules` chiếm gần hết.', 'Hai thay đổi lớn nhất: base `node:22-alpine` và multi-stage để tầng cuối chỉ có `dist` cùng node_modules production.', 'Viết lại Dockerfile (heredoc, mẫu ở bài lab), lint, rồi `docker build -t tutor-api:v1 .` và xem `docker images tutor-api`.'],
    fix: ['docker history tutor-api:v1', OPTHINT, 'hadolint Dockerfile', 'docker build -t tutor-api:v1 .', 'docker images tutor-api'],
    cause: 'Base Debian đầy đủ (~1.1GB) cộng devDependencies và công cụ build tạo ra image 1.9GB. Alpine + multi-stage + prune cho bản cuối khoảng 250MB mà chạy y hệt.',
    setup: function (s) { B.base(s, { ignore: IGN, dockerfile: ['FROM node:22', 'WORKDIR /app', 'COPY . .', 'RUN npm install', 'RUN npm run build', 'EXPOSE 8888', 'USER node', 'CMD ["node", "dist/main.js"]'] }); s.silent('docker build -t tutor-api:v0 .'); },
    check: function (s) { var im = img(s, 'tutor-api:v1'); return okBuild(s) && !!im && im.sizeMB < 400; }
  },
  {
    id: 'c5h2', title: 'Token và .env nằm trong image',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker build --check .', 'SecretsUsedInArgOrEnv - https://docs.docker.com/go/dockerfile/rule/secrets-used-in-arg-or-env/', 'Do not use ARG or ENV instructions for sensitive data (ENV "DB_PASSWORD")', 'Dockerfile:6', '', '$ docker run --rm tutor-api:v1 cat .env', 'DB_PASSWORD=...'),
    story: 'Đồng nghiệp kéo image về và đọc được mật khẩu database trong metadata, thậm chí cả file `.env`. Không có `.dockerignore`, và Dockerfile đặt mật khẩu bằng `ENV`.',
    goal: 'Dockerfile không còn bí mật trong `ENV`, `.dockerignore` loại `.env`, build lại `tutor-api:v1` và image không chứa `.env`.',
    hints: ['Hai nguồn rò: `ENV DB_PASSWORD=...` (lưu trong lớp) và `COPY . .` chép luôn `.env` vì không có `.dockerignore`.', 'Xoá dòng `ENV DB_PASSWORD` khỏi Dockerfile (mật khẩu truyền lúc chạy bằng `--env-file .env`) và tạo `.dockerignore` có `.env`.', 'Sau đó `docker build --check .` phải sạch và build lại bản `v1`.'],
    fix: ['docker build --check .', "sed -i '/^ENV DB_PASSWORD/d' Dockerfile", HC('.dockerignore', IGN), 'docker build --check .', 'docker build -t tutor-api:v1 .'],
    cause: 'Lớp image bất biến: bí mật trong `ENV` hay file `.env` đã COPY sẽ tồn tại mãi và ai cũng đọc được. Ngăn từ đầu bằng `.dockerignore`, truyền bí mật lúc chạy.',
    setup: function (s) { B.base(s, { dockerfile: ['FROM node:22-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'ENV DB_PASSWORD=Sup3rS3cret!', 'RUN npm run build', 'EXPOSE 8888', 'USER node', 'CMD ["node", "dist/main.js"]'] }); },
    check: function (s) { var im = img(s, 'tutor-api:v1'); return okBuild(s) && !/^ENV\s+DB_PASSWORD/m.test(T(s, 'Dockerfile')) && /^\.env$/m.test(T(s, '.dockerignore')) && !!im && !im.hasEnv; }
  },
  {
    id: 'c5h3', title: 'Sửa một dòng mã mà phải chờ npm ci chạy lại',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ echo "// fix" >> src/main.ts', '$ docker build -t tutor-api:v2 .', ' => [4/6] COPY . .                    0.4s', ' => [5/6] RUN npm ci                 24.1s', ' => [6/6] RUN npm run build           5.0s'),
    story: 'Cứ sửa một dòng trong `src` là build mất ~30 giây vì `npm ci` luôn tải lại 600 gói, dù `package.json` không đổi. Image chạy đúng nhưng vòng lặp sửa và thử quá chậm.',
    goal: 'Sắp lại Dockerfile để sửa mã chỉ chạy lại `COPY . .` và build; `npm ci` phải ở trạng thái CACHED.',
    hints: ['`COPY . .` ở trên `RUN npm ci`: mỗi lần mã đổi, mọi lớp sau nó bị làm mới.', 'Chép riêng `package*.json` trước, chạy `npm ci`, rồi mới `COPY . .`.', 'Viết lại các dòng theo đúng thứ tự (heredoc) rồi build hai lần, sửa mã giữa hai lần để thấy `CACHED`.'],
    fix: ['cat -n Dockerfile', HC('Dockerfile', B.DF_GOOD), 'docker build -t tutor-api:v2 .', 'echo "// v3" >> src/main.ts', 'docker build -t tutor-api:v3 .'],
    cause: 'Cache theo lớp: một lớp đổi thì mọi lớp sau chạy lại. Đặt thứ hiếm đổi (dependency) lên trên, thứ hay đổi (mã) xuống dưới.',
    setup: function (s) { B.base(s, { ignore: IGN, dockerfile: ['FROM node:22-alpine', 'WORKDIR /app', 'COPY . .', 'RUN npm ci', 'RUN npm run build', 'EXPOSE 8888', 'USER node', 'CMD ["node", "dist/main.js"]'] }); },
    check: function (s) { var t = T(s, 'Dockerfile'); return okBuild(s) && ord(t, 'COPY package', 'npm ci') && ord(t, 'npm ci', 'COPY . .') && ord(t, 'COPY . .', 'npm run build'); }
  },
  {
    id: 'c5h4', title: 'Container chạy bằng root',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker exec tutor-api id', 'uid=0(root) gid=0(root)', '', '$ hadolint Dockerfile', 'Dockerfile:9 DL3002 warning: Last USER should not be root'),
    story: 'Báo cáo bảo mật chỉ ra tiến trình NestJS chạy với quyền root trong container. Nếu ứng dụng bị khai thác, kẻ tấn công có quyền cao nhất trong container.',
    goal: 'Image `tutor-api:v1` chạy bằng user `node`, hadolint không còn DL3002.',
    hints: ['Xem dòng USER cuối Dockerfile: `cat -n Dockerfile`.', 'Đổi `USER root` thành `USER node` (đứng sau các lệnh cần root, trước CMD).', 'Sửa bằng sed, chạy `hadolint Dockerfile`, build `tutor-api:v1` và xem `docker image inspect` ở mục User.'],
    fix: ['hadolint Dockerfile', "sed -i 's/^USER root/USER node/' Dockerfile", 'hadolint Dockerfile', 'docker build -t tutor-api:v1 .', "docker image inspect tutor-api:v1 --format '{{.Config.User}}'"],
    cause: 'Không đặt `USER` nghĩa là root. Image node có sẵn user `node`; đặt `USER node` sau mọi lệnh cần quyền root.',
    setup: function (s) { B.base(s, { ignore: IGN, dockerfile: ['FROM node:22-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', 'EXPOSE 8888', 'USER root', 'CMD ["node", "dist/main.js"]'] }); },
    check: function (s) { var im = img(s, 'tutor-api:v1'); return okBuild(s) && !/^USER root/m.test(T(s, 'Dockerfile')) && lintN(s) === 0 && !!im && /node/.test(im.user || ''); }
  },
  {
    id: 'c5h5', title: 'CI chặn merge: hadolint báo 6 lỗi', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ hadolint Dockerfile', 'Dockerfile:1 DL3006 warning: Always tag the version of an image explicitly', 'Dockerfile:3 DL3020 error: Use COPY instead of ADD for files and folders', 'Dockerfile:4 DL3015 info: Avoid additional packages by specifying `--no-install-recommends`', 'Dockerfile:4 DL3009 info: Delete the apt-get lists after installing something', 'Dockerfile:6 DL3059 info: Multiple consecutive `RUN` instructions. Consider consolidation.', 'Dockerfile:10 DL3002 warning: Last USER should not be root', 'Dockerfile:11 DL3025 warning: Use arguments JSON notation for CMD and ENTRYPOINT arguments'),
    story: 'Pipeline CI chạy `hadolint` và `docker build --check` rồi từ chối merge. Dockerfile hiện build được nhưng vi phạm nhiều quy tắc, và đổi sang alpine sẽ làm lệnh apt hỏng.',
    goal: 'Viết lại để `hadolint` sạch, `docker build --check` báo no warnings, không còn bí mật trong ENV, build thành công `tutor-api:v1`, và `v1` chạy bằng user `node` trên base alpine.',
    hints: ['Đừng sửa từng mã: viết lại cả file. Giữ ý nghĩa nhưng đổi: base `node:22-alpine`, `COPY` thay `ADD`, `npm ci`, bỏ ENV chứa token.', 'Cài curl bằng `apk add --no-cache curl` (không phải apt). Gộp lệnh build, `USER node`, `CMD` dạng JSON.', 'Dùng mẫu multi-stage trong bài lab, ghi bằng heredoc rồi lint, check, build.'],
    fix: ['hadolint Dockerfile', 'docker build --check .', OPTHINT, 'hadolint Dockerfile', 'docker build --check .', 'docker build -t tutor-api:v1 .'],
    cause: 'Nhiều quy tắc cùng vi phạm nên cách nhanh nhất là dựng lại theo mẫu đã kiểm chứng. Lưu ý đổi base sang alpine kéo theo đổi `apt` thành `apk`: sửa mã DL mà không hiểu hệ quả dễ làm build hỏng.',
    setup: function (s) { B.base(s, { dockerfile: BAD }); },
    check: function (s) { var t = T(s, 'Dockerfile'), im = img(s, 'tutor-api:v1'); return okBuild(s) && lintN(s) === 0 && V.dkChecks(t).length === 0 && /^FROM node:22-alpine/m.test(t) && !/API_TOKEN/.test(t) && !!im && /node/.test(im.user || ''); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
