(function (G) {
'use strict';
/* Chương c5g: tự viết Dockerfile và .dockerignore, đọc và debug lỗi build. */
var V = G.VPS, C = G.COURSE, L = C.L, M = C.M, ran = C.ran, B = C.DKG, DK = V.dk;
function R(re) { return function (s) { return ran(s, re); }; }
function cnt(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function RF(re) { return function (s) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); }; }
function txt(s, p) { var n = s.fs.get(p); return n && n.t === 'f' ? n.c : ''; }
function HC(path, ls) { return 'cat > ' + path + " <<'EOF'\n" + ls.join('\n') + '\nEOF'; }
var TD = '/home/haidangphan/tutor';
function T(s, f) { return txt(s, TD + '/' + f); }
function okBuild(s, file) { var r = V.dkbCheck(s, '.', file || null); return !r; }
function ct(s, name) { return (s.W.containers || []).filter(function (c) { return c.name === name; })[0]; }
function ord(t, a, b) { var i = t.indexOf(a), j = t.indexOf(b); return i >= 0 && j >= 0 && i < j; }

var D = { id: 'c5g', group: 'Ứng dụng', short: 'Dockerfile và debug build', title: 'Tự viết Dockerfile, .dockerignore và debug lỗi build', dek: 'Viết Dockerfile đầu tiên cho NestJS từ file trống, loại build context bằng .dockerignore, sắp thứ tự lệnh để tận dụng cache, rồi học cách đọc log và gỡ các lỗi build hay gặp: COPY, npm ci, lockfile, TypeScript, apt/apk, tag base.', theory: [], quiz: [], lab: null, debugs: [] };
var idx = -1; C.lessons.forEach(function (l, i) { if (l.id === 'c5f') idx = i; });
C.lessons.splice(idx + 1, 0, D);

D.theory = [
  { tag: 'Khái niệm', title: 'Dockerfile là công thức nấu image', body: [
    'Dockerfile là file văn bản liệt kê **từng bước** để dựng một image. `docker build` đọc từ trên xuống dưới; mỗi lệnh tạo một **lớp** (layer) được lưu và tái sử dụng. Với dự án tutor (NestJS ở cổng 8888), các lệnh bạn cần là:',
    { tbl: [['Lệnh', 'Làm gì', 'Ví dụ'], ['`FROM`', 'Chọn image nền (bắt buộc, đầu tiên)', '`FROM node:22-alpine`'], ['`WORKDIR`', 'Đặt thư mục làm việc, tạo nếu chưa có', '`WORKDIR /app`'], ['`COPY`', 'Chép file từ máy bạn (build context) vào image', '`COPY package*.json ./`'], ['`RUN`', 'Chạy lệnh **lúc build**, kết quả lưu thành lớp', '`RUN npm ci`'], ['`ENV`', 'Đặt biến môi trường cố định', '`ENV NODE_ENV=production`'], ['`EXPOSE`', 'Ghi chú cổng ứng dụng nghe (không mở cổng thật)', '`EXPOSE 8888`'], ['`USER`', 'Chạy các lệnh sau (và container) bằng user này', '`USER node`'], ['`CMD`', 'Lệnh mặc định lúc **container chạy**', '`CMD ["node", "dist/main.js"]`']] },
    { note: '`RUN` chạy một lần lúc build. `CMD` chạy mỗi lần container khởi động. Nhầm hai thứ này là lỗi người mới gặp nhiều nhất.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Từ thư mục dự án tới Dockerfile đầu tiên, sáu bước', body: [
    'Đừng chép Dockerfile của người khác. Hãy tự dịch những gì bạn gõ trên máy thành từng dòng:',
    { tbl: [['Trên máy bạn làm', 'Dòng Dockerfile'], ['Cần Node 22', '`FROM node:22-alpine`'], ['`cd /app`', '`WORKDIR /app`'], ['Có `package.json` và lock', '`COPY package*.json ./`'], ['`npm ci`', '`RUN npm ci`'], ['Chép phần còn lại (src, tsconfig)', '`COPY . .`'], ['`npm run build`', '`RUN npm run build`'], ['`node dist/main.js`', '`CMD ["node", "dist/main.js"]`']] },
    { pre: ['FROM node:22-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', 'ENV NODE_ENV=production', 'EXPOSE 8888', 'USER node', 'CMD ["node", "dist/main.js"]'], cap: 'Dockerfile hoàn chỉnh cho NestJS' },
    { note: 'Bản này đơn giản để học. Bản production nên dùng multi-stage (chương "Docker nâng cao") để image không chứa devDependencies và mã nguồn.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Tạo file bằng terminal: heredoc, nano, kiểm tra lại', body: [
    'File nằm trong thư mục của bạn (`~/tutor`) nên **không cần sudo**. Dùng heredoc với dấu nháy đơn để shell không đụng tới `$`:',
    { pre: ["cat > Dockerfile <<'EOF'", 'FROM node:22-alpine', 'WORKDIR /app', 'EOF', '', 'cat -n Dockerfile            # đánh số dòng: khớp với số dòng trong thông báo lỗi', 'nano Dockerfile              # sửa tay; Ctrl+O lưu, Ctrl+X thoát'], cap: 'Tạo và kiểm tra' },
    { ul: ['Tên file đúng là `Dockerfile` (chữ D hoa, **không đuôi**). `Dockerfile.txt` sẽ không được tìm thấy', '`cat > file` ghi **đè** cả file; `>>` mới là nối thêm cuối file', 'Muốn dùng file có tên khác: `docker build -f Dockerfile.slow -t ... .`', 'Thiếu dòng cuối `EOF` thì terminal đứng chờ thêm nhập; gõ lại cho đủ'] }
  ] },
  { tag: 'Cú pháp', title: 'Build context và .dockerignore', body: [
    'Lệnh `docker build -t tutor-api:v1 .` có dấu chấm cuối: đó là **build context**, thư mục được gửi cho Docker. Mặc định là **toàn bộ** thư mục, kể cả `node_modules` (300MB), `.git` (40MB) và `.env` (mật khẩu!). `COPY . .` sẽ chép hết vào image.',
    { pre: ['node_modules', '.git', '.env', '.env*', 'dist', '*.log', 'docker-compose*.yml'], cap: '~/tutor/.dockerignore' },
    { tbl: [['Mẫu', 'Loại trừ'], ['`node_modules`', 'Thư mục này ở gốc context'], ['`*.log`', 'File .log ở gốc'], ['`**/*.log`', 'File .log ở mọi cấp thư mục'], ['`.env*`', 'Mọi file bắt đầu bằng .env'], ['`!.env.example`', 'Ngoại lệ: **giữ lại** file này']] },
    { ul: ['Xem hiệu quả ở dòng `transferring context:` trong log build: từ ~350MB xuống vài MB', '`.env` trong image nghĩa là ai kéo được image đều đọc được bí mật. Luôn ignore `.env`, truyền biến lúc chạy bằng `--env-file`', '**Đừng ignore thứ Dockerfile cần.** Ignore `*.json` sẽ loại luôn `package.json`; ignore `src` thì không còn gì để build'] }
  ] },
  { tag: 'Mẹo', title: 'Thứ tự lệnh quyết định tốc độ build', body: [
    'Docker lưu cache cho từng lớp. Một lớp chỉ dùng lại cache nếu lệnh **và mọi file nó đọc** không đổi; một khi một lớp bị làm mới, **mọi lớp sau nó đều chạy lại**.',
    { tbl: [['Cách viết', 'Sửa một dòng trong src rồi build lại'], ['`COPY . .` rồi `RUN npm ci`', '`COPY . .` đổi, kéo theo `npm ci` chạy lại: **~25 giây** tải 600 gói'], ['`COPY package*.json ./`, `RUN npm ci`, rồi `COPY . .`', '`npm ci` ở trạng thái CACHED: chỉ build lại phần mã, **vài giây**']] },
    { pre: ['docker build -t tutor-api:v2 . 2>&1 | grep -c CACHED    # đếm số bước dùng lại cache'], cap: 'Kiểm tra cache' },
    'Quy tắc: đặt thứ **ít đổi nhất lên trên** (nền, dependency), thứ **hay đổi nhất xuống dưới** (mã nguồn).'
  ] },
  { tag: 'Quy trình', title: 'Đọc log build: tìm ba thứ', body: [
    'Khi build lỗi, BuildKit in một khối cố định. Đọc theo thứ tự:',
    { ul: ['**Dòng `ERROR [n/m] RUN ...`**: bước nào hỏng (n trên tổng m)', '**Khối `> [n/m] RUN ...:` kèm các dòng có mốc thời gian**: đầu ra thật của lệnh. Nguyên nhân nằm ở đây', '**Đoạn `Dockerfile:N` với dấu `>>>`**: đúng dòng trong file bạn viết', 'Dòng cuối `process "/bin/sh -c ..." did not complete successfully: exit code: 1` chỉ nhắc lại lệnh và mã thoát'] },
    { pre: ['docker build --progress=plain -t tutor-api:v3 . 2>&1 | tail -n 30    # log đầy đủ, không bị gộp', 'docker build --no-cache -t tutor-api:v3 .                          # bỏ qua cache để chắc chắn bước đó thật sự chạy'], cap: 'Hai cờ hữu ích khi gỡ lỗi' },
    { tbl: [['Mã thoát', 'Thường nghĩa là'], ['1', 'Lệnh chạy rồi báo lỗi (npm lỗi, TypeScript lỗi)'], ['127', 'Không tìm thấy lệnh (`apt-get` trên alpine, `nest` chưa cài)'], ['137', 'Bị giết vì hết bộ nhớ']] },
    { note: 'Mẹo vàng: lỗi của bước `RUN` hầu như luôn tái hiện được trên máy bạn bằng chính lệnh đó (`npm ci`, `npm run build`). Chạy thử ngoài Docker để thấy lỗi nhanh hơn.', kind: 'tip' }
  ] },
  { tag: 'Bảng tra', title: 'Lỗi build thường gặp: triệu chứng, nguyên nhân, cách sửa', body: [
    { tbl: [['Thông báo', 'Nguyên nhân', 'Cách sửa'], ['`unknown instruction: COPPY`', 'Gõ sai tên lệnh (số dòng nằm trong thông báo)', 'Sửa chính tả, `cat -n Dockerfile` để tìm dòng'], ['`failed to read dockerfile: open Dockerfile`', 'Sai thư mục, sai tên file, hoặc sai `-f`', '`ls`, `docker build -f ... .`'], ['`failed to compute cache key ... "/package*.json": not found`', 'File bị `.dockerignore` loại hoặc không có trong context', 'Xem `.dockerignore`, `ls`'], ['`node:22.alpine: not found`', 'Tag không tồn tại (khác với `pull access denied` là sai tên repo)', 'Dùng `node:22-alpine`'], ['`npm ci` báo `EUSAGE ... package-lock.json`', 'Lock không có trong image (chỉ `COPY package.json`) hoặc chưa commit', '`COPY package*.json ./`'], ['`npm ci` báo `Missing: x from lock file`', 'Thêm dependency vào package.json mà chưa cập nhật lock', 'Chạy `npm install` trên máy, commit lock'], ['`Missing script: "build"`', 'package.json không có script `build`', 'Thêm script, hoặc đổi lệnh'], ['`error TS2322` hoặc `TS18003`', 'Lỗi kiểu TypeScript, hoặc chưa có mã nguồn trong image lúc build', 'Sửa mã, hoặc đặt `COPY . .` **trước** `npm run build`'], ['`apt-get: not found` (mã 127)', 'Image alpine không có apt; alpine dùng `apk`', '`RUN apk add --no-cache curl`'], ['`nest: not found` (mã 127)', 'Chưa chạy `npm ci` trước `npm run build`', 'Thêm `RUN npm ci`']] }
  ] },
  { tag: 'Khái niệm', title: 'npm ci và lockfile', body: [
    '`npm install` có thể cập nhật lock; `npm ci` thì **chỉ cài đúng những gì lock ghi** và từ chối nếu `package.json` và `package-lock.json` lệch nhau. Chính vì vậy nó tái lập được bản build và là lệnh dùng trong Dockerfile.',
    { ul: ['`package-lock.json` phải **commit vào Git** và **được COPY vào image trước `npm ci`**', 'Vừa thêm gói (`npm install class-validator`) thì lock đã tự cập nhật; lỗi chỉ xảy ra khi bạn sửa tay `package.json`', 'Sửa lệch: chạy `npm install` trên máy (sinh lại lock), rồi build'] },
    { tbl: [['Image nền', 'Quản lý gói', 'Cài curl'], ['`node:22-alpine`', 'apk', '`apk add --no-cache curl`'], ['`node:22`, `node:22-slim` (Debian)', 'apt', '`apt-get update && apt-get install -y curl`']] },
    { note: 'Chọn base alpine thì mọi lệnh hệ thống phải theo kiểu alpine. Chép một dòng `apt-get` từ hướng dẫn cũ vào image alpine là mã thoát 127.', kind: 'warn' }
  ] },
  { tag: 'Lưu ý', title: 'Tag của image nền: ghim phiên bản và phân biệt hai kiểu lỗi', body: [
    { tbl: [['Thông báo', 'Ý nghĩa'], ['`pull access denied, repository does not exist or may require authorization`', 'Sai **tên repository** (ví dụ `nodee:22`) hoặc cần đăng nhập'], ['`node:22.alpine: not found`', 'Repository đúng nhưng **tag** không tồn tại (đúng là `22-alpine`)']] },
    { ul: ['Ghim phiên bản rõ ràng (`node:22-alpine`) thay vì `node:latest` để build hôm nay và tháng sau cho cùng kết quả', 'Trên Docker Hub tab "Tags" liệt kê đúng các tag hiện có'] }
  ] },
  { tag: 'Lưu ý', title: 'Build thành công chưa có nghĩa là chạy được', body: [
    'Một image build xong vẫn có thể thoát ngay khi chạy, vì lỗi nằm ở `CMD` hoặc đường dẫn. Kiểm tra lập tức sau mỗi lần build:',
    { pre: ['docker run -d --name tutor-api -p 127.0.0.1:8888:8888 tutor-api:v1', 'docker ps', 'docker logs tutor-api', 'docker exec tutor-api ls dist       # file build có thật sự nằm trong image?'], cap: 'Bốn lệnh kiểm tra sau build' },
    { ul: ['`Cannot find module /app/dist/main.js`: bước build không tạo ra `dist`, hoặc `CMD` trỏ sai tên', 'Cổng publish nên là `127.0.0.1:8888:8888`; chỉ Nginx mới đứng ra ngoài Internet', '`docker history tutor-api:v1` cho thấy từng lớp và dung lượng để phát hiện `.env` hay `node_modules` lọt vào'] }
  ] },
  { tag: 'Quy trình', title: 'Checklist khi build lỗi', body: [
    { ul: ['**1.** Đọc dòng `ERROR [n/m]` và khối đầu ra: lệnh nào, báo gì', '**2.** `cat -n Dockerfile` và đối chiếu số dòng với `>>>`', '**3.** Tái hiện ngoài Docker: chạy chính lệnh đó trên máy (`npm ci`, `npm run build`)', '**4.** Xem file nào thật sự vào context: `ls`, `cat .dockerignore`, `du -sh`', '**5.** Nghi ngờ cache cũ: `docker build --no-cache --progress=plain ...`', '**6.** Sửa **một** điều, build lại, đọc lỗi kế tiếp (lỗi build xuất hiện lần lượt)'] }
  ] }
];

D.quiz = [
  { q: 'Dockerfile của bạn có `COPPY . .` ở dòng 3. `docker build` báo gì?', opts: ['Bỏ qua dòng đó', 'dockerfile parse error on line 3: unknown instruction: COPPY', 'Build thành công nhưng thiếu file', 'Lỗi pull access denied'], ans: 1, why: 'Docker phân tích cú pháp trước khi chạy bất kỳ bước nào và dừng ở lệnh lạ đầu tiên, báo cả số dòng.' },
  { q: 'Vì sao cần `.dockerignore` khi `COPY . .`?', opts: ['Để Docker chạy nhanh hơn trên mọi máy', 'Để không gửi và không chép node_modules, .git, .env vào context và image', 'Để tạo tag', 'Để mở cổng'], ans: 1, why: 'Context mặc định là cả thư mục. `.dockerignore` giảm kích thước gửi đi và tránh để lộ `.env` trong image.' },
  { q: '`.dockerignore` có dòng `*.json`. Hệ quả với `COPY package*.json ./`?', opts: ['Không ảnh hưởng', 'Lỗi `failed to compute cache key ... "/package*.json": not found`', 'Chép được nhưng chậm', 'Chỉ chép package-lock.json'], ans: 1, why: 'Các file bị ignore không có trong context, nên COPY không tìm thấy gì để chép.' },
  { q: 'Thứ tự nào giúp `npm ci` không chạy lại khi bạn chỉ sửa mã trong src?', opts: ['COPY . . rồi RUN npm ci', 'COPY package*.json ./ → RUN npm ci → COPY . .', 'RUN npm ci rồi COPY package*.json', 'Thứ tự không quan trọng'], ans: 1, why: 'Lớp npm ci chỉ phụ thuộc package*.json. Mã nguồn chép sau, nên sửa src không làm mất cache của npm ci.' },
  { q: '`RUN npm ci` lỗi EUSAGE "can only install with an existing package-lock.json". Dockerfile có `COPY package.json ./`. Cách sửa?', opts: ['Đổi npm ci thành npm install trong mọi trường hợp', 'Đổi thành `COPY package*.json ./` để lock vào image', 'Xoá package.json', 'Tăng RAM'], ans: 1, why: 'Lock không được chép vào image. Dùng glob `package*.json` để chép cả hai.' },
  { q: '`npm ci` báo `Missing: class-validator@^0.14.1 from lock file`. Việc đúng?', opts: ['Xoá node_modules', 'Chạy `npm install` trên máy để cập nhật lock rồi build lại', 'Thêm --force vào Dockerfile', 'Đổi sang image khác'], ans: 1, why: 'package.json và lock lệch nhau. npm install ghi lại lock cho khớp; npm ci từ chối chạy khi lệch.' },
  { q: 'Build trên `node:22-alpine` báo `/bin/sh: apt-get: not found`, mã thoát 127. Sửa?', opts: ['Cài apt', 'Dùng `apk add --no-cache <gói>` (alpine dùng apk) hoặc đổi base sang Debian', 'Thêm sudo', 'Dùng USER root'], ans: 1, why: 'Alpine không có apt. 127 là "command not found".' },
  { q: '`FROM node:22.alpine` báo `not found`. Khác gì với `pull access denied`?', opts: ['Giống nhau hoàn toàn', 'not found: repository đúng, tag sai. pull access denied: tên repository sai hoặc cần đăng nhập', 'not found nghĩa là mạng lỗi', 'pull access denied là tag sai'], ans: 1, why: 'Đọc kỹ thông báo giúp biết nên sửa tag hay sửa tên image.' },
  { q: '`RUN npm run build` lỗi `error TS18003: No inputs were found in config file`. Nguyên nhân khả dĩ nhất?', opts: ['Thiếu RAM', 'Chưa có mã nguồn trong image tại thời điểm build (COPY . . đặt sau, hoặc src bị ignore)', 'Sai cổng', 'Lock lệch'], ans: 0 + 1, why: 'TS18003 nghĩa là tsc không thấy file .ts nào để biên dịch: kiểm tra thứ tự COPY và .dockerignore.' },
  { q: 'Log build có khối `> [4/6] RUN npm ci:` với nhiều dòng đầu ra. Đọc khối này để làm gì?', opts: ['Chỉ trang trí', 'Đó là đầu ra thật của lệnh lỗi, chứa nguyên nhân', 'Để biết tốc độ mạng', 'Để lấy tag'], ans: 1, why: 'Thông báo cuối chỉ nhắc mã thoát. Lý do thật nằm ở đầu ra của bước lỗi.' },
  { q: 'Muốn chắc một bước build thật sự chạy, không dùng lớp cache cũ, dùng cờ nào?', opts: ['--rm', '--no-cache', '--quiet', '--pull=never'], ans: 1, why: '`--no-cache` bỏ qua mọi lớp đã lưu. Kết hợp `--progress=plain` để thấy log đầy đủ.' },
  { q: 'Build xong, `docker run` thấy container thoát ngay với `Cannot find module /app/dist/main.js`. Hai nơi cần kiểm tra?', opts: ['`docker exec <name> ls dist` (nếu chạy được) hoặc `docker run --rm <image> ls /app` và dòng CMD trong Dockerfile', 'Chỉ cần xoá image', 'Cổng 80', 'Chứng chỉ SSL'], ans: 0, why: 'Hoặc build không tạo dist, hoặc CMD sai đường dẫn. Xem nội dung /app trong image và dòng CMD.' },
  { q: 'Vì sao không đưa `.env` vào image?', opts: ['File quá lớn', 'Ai kéo được image đều đọc được mật khẩu trong đó', '.env không chạy trong Docker', 'Làm chậm cache'], ans: 1, why: 'Lớp của image bất biến và có thể bị `docker history` hay giải nén xem. Truyền bí mật lúc chạy bằng env-file hoặc secret.' }
];
D.quiz[8].ans = 0;

var DF_SLOW = ['FROM node:22-alpine', 'WORKDIR /app', 'COPY . .', 'RUN npm ci', 'RUN npm run build', 'CMD ["node", "dist/main.js"]'];
D.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { B.base(s, { noDf: true }); },
  items: [
    { text: 'Xem thư mục dự án, kể cả file ẩn.', hint: 'ls -la', check: R(/^ls -\w*a/) },
    { text: 'Đọc `package.json`: tìm script `build` và danh sách dependencies.', hint: 'cat package.json', check: R(/^cat package\.json/) },
    { text: 'Đo dung lượng các thư mục sẽ bị gửi đi nếu không loại trừ.', hint: 'du -sh node_modules .git dist', check: R(/^du -sh node_modules/) },
    { text: 'Thử build khi **chưa có** Dockerfile: lệnh phải báo lỗi `failed to read dockerfile`.', hint: 'docker build -t tutor-api:v1 .', check: RF(/^docker build -t tutor-api:v1 \.$/) },
    { text: 'Tạo `.dockerignore` loại `node_modules`, `.git`, `.env`, `dist`, log và file compose.', hint: HC('.dockerignore', B.IGN_GOOD), check: function (s) { var t = T(s, '.dockerignore'); return /^node_modules$/m.test(t) && /^\.git$/m.test(t) && /^\.env$/m.test(t); } },
    { text: 'Đọc lại `.dockerignore` vừa tạo.', hint: 'cat .dockerignore', check: R(/^cat \.dockerignore/) },
    { text: 'Viết Dockerfile đầu tiên: nền alpine, chép `package*.json`, `npm ci`, rồi mới `COPY . .`, build, và `CMD` chạy `dist/main.js`.', hint: HC('Dockerfile', B.DF_GOOD), check: function (s) { var t = T(s, 'Dockerfile'); return /^FROM node:22/m.test(t) && ord(t, 'COPY package', 'npm ci') && ord(t, 'npm ci', 'COPY . .') && ord(t, 'COPY . .', 'npm run build') && /^CMD /m.test(t); } },
    { text: 'In Dockerfile có đánh số dòng: số này khớp số dòng trong thông báo lỗi.', hint: 'cat -n Dockerfile', check: R(/^cat -n Dockerfile/) },
    { text: 'Build image `tutor-api:v1`.', hint: 'docker build -t tutor-api:v1 .', check: function (s) { return cnt(s, /^docker build -t tutor-api:v1 \.$/) >= 1; } },
    { text: 'Liệt kê image `tutor-api` và xem dung lượng.', hint: 'docker images tutor-api', check: R(/^docker images tutor-api/) },
    { text: 'Build lại y hệt: mọi bước phải hiện `CACHED`.', hint: 'docker build -t tutor-api:v1 .', check: function (s) { return cnt(s, /^docker build -t tutor-api:v1 \.$/) >= 2; } },
    { text: 'Sửa mã nguồn: thêm một dòng ghi chú vào `src/main.ts`.', hint: 'echo "// v2" >> src/main.ts', check: function (s) { return /\/\/ v2/.test(T(s, 'src/main.ts')); } },
    { text: 'Build `tutor-api:v2`: chỉ `COPY . .` và `npm run build` chạy lại, `npm ci` vẫn `CACHED`.', hint: 'docker build -t tutor-api:v2 .', check: function (s) { return cnt(s, /^docker build -t tutor-api:v2 \.$/) >= 1; } },
    { text: 'Build lần nữa và đếm số bước dùng cache.', hint: 'docker build -t tutor-api:v2 . 2>&1 | grep -c CACHED', check: R(/^grep -c CACHED/) },
    { text: 'So sánh: tạo `Dockerfile.slow` viết kiểu sai thứ tự (`COPY . .` đứng trước `npm ci`).', hint: HC('Dockerfile.slow', DF_SLOW), check: function (s) { var t = T(s, 'Dockerfile.slow'); return ord(t, 'COPY . .', 'npm ci'); } },
    { text: 'Build `Dockerfile.slow` thành `tutor-api:slow`.', hint: 'docker build -f Dockerfile.slow -t tutor-api:slow .', check: function (s) { return cnt(s, /^docker build -f Dockerfile\.slow /) >= 1; } },
    { text: 'Sửa mã thêm lần nữa.', hint: 'echo "// v3" >> src/main.ts', check: function (s) { return /\/\/ v3/.test(T(s, 'src/main.ts')); } },
    { text: 'Build `Dockerfile.slow` lại: lần này `npm ci` chạy lại mất ~24 giây dù không đổi dependency.', hint: 'docker build -f Dockerfile.slow -t tutor-api:slow .', check: function (s) { return cnt(s, /^docker build -f Dockerfile\.slow /) >= 2; } },
    { text: 'Gây lỗi có chủ đích 1: tạo `Dockerfile.typo` với lệnh `COPPY` thay cho `COPY`.', hint: "sed 's/^COPY \\. \\./COPPY . ./' Dockerfile > Dockerfile.typo", check: function (s) { return /^COPPY /m.test(T(s, 'Dockerfile.typo')); } },
    { text: 'Build `Dockerfile.typo`: phải báo `unknown instruction` kèm số dòng.', hint: 'docker build -f Dockerfile.typo -t tutor-api:typo .', check: RF(/-f Dockerfile\.typo/) },
    { text: 'Gây lỗi 2: tạo `Dockerfile.tag` với tag sai `node:22.alpine`.', hint: "sed 's/node:22-alpine/node:22.alpine/' Dockerfile > Dockerfile.tag", check: function (s) { return /node:22\.alpine/.test(T(s, 'Dockerfile.tag')); } },
    { text: 'Build `Dockerfile.tag`: đọc kỹ `not found`.', hint: 'docker build -f Dockerfile.tag -t tutor-api:tag .', check: RF(/-f Dockerfile\.tag/) },
    { text: 'Gây lỗi 3: tạo `Dockerfile.apt` bằng cách thêm `RUN apt-get update` vào image alpine.', hint: "cp Dockerfile Dockerfile.apt && echo 'RUN apt-get update' >> Dockerfile.apt", check: function (s) { return /apt-get update/.test(T(s, 'Dockerfile.apt')); } },
    { text: 'Build `Dockerfile.apt`: mã thoát 127 `apt-get: not found`.', hint: 'docker build -f Dockerfile.apt -t tutor-api:apt . 2>&1 | tail -n 12', check: RF(/^docker build -f Dockerfile\.apt/) },
    { text: 'Gây lỗi 4: tạm đổi tên `package-lock.json` để mô phỏng việc quên commit lock.', hint: 'mv package-lock.json package-lock.json.bak', check: function (s) { return !s.fs.get(TD + '/package-lock.json') && !!s.fs.get(TD + '/package-lock.json.bak'); }, transient: true },
    { text: 'Tái hiện lỗi ngoài Docker bằng chính lệnh trong Dockerfile: `npm ci` phải báo EUSAGE.', hint: 'npm ci', check: RF(/^npm ci$/) },
    { text: 'Build và đọc đầu ra của bước `RUN npm ci` trong khối lỗi.', hint: 'docker build -t tutor-api:nolock . 2>&1 | tail -n 20', check: RF(/^docker build -t tutor-api:nolock/) },
    { text: 'Khôi phục lockfile.', hint: 'mv package-lock.json.bak package-lock.json', check: function (s) { return !!s.fs.get(TD + '/package-lock.json') && !s.fs.get(TD + '/package-lock.json.bak'); } },
    { text: 'Gây lỗi 5: thêm dòng `src` vào `.dockerignore` (ignore nhầm mã nguồn).', hint: 'echo src >> .dockerignore', check: function (s) { return /^src$/m.test(T(s, '.dockerignore')); }, transient: true },
    { text: 'Build: `npm run build` phải báo `TS18003 No inputs were found`.', hint: 'docker build -t tutor-api:nosrc . 2>&1 | tail -n 14', check: RF(/^docker build -t tutor-api:nosrc/) },
    { text: 'Sửa: xoá dòng `src` khỏi `.dockerignore`.', hint: "sed -i '/^src$/d' .dockerignore", check: function (s) { return !/^src$/m.test(T(s, '.dockerignore')); } },
    { text: 'Xem log build đầy đủ, không cache: `--progress=plain --no-cache`.', hint: 'docker build --progress=plain --no-cache -t tutor-api:v3 . 2>&1 | tail -n 12', check: R(/^docker build --progress=plain --no-cache/) },
    { text: 'Xem lịch sử lớp của `tutor-api:v3` để chắc `.env` không lọt vào.', hint: 'docker history tutor-api:v3', check: R(/^docker history tutor-api:v3/) },
    { text: 'Chạy thử image mới nhất, chỉ publish ở loopback.', hint: 'docker run -d --name tutor-api -p 127.0.0.1:8888:8888 tutor-api:v3', check: function (s) { var c = ct(s, 'tutor-api'); return !!c && c.state === 'running'; } },
    { text: 'Đọc log container để chắc ứng dụng khởi động.', hint: 'docker logs tutor-api', check: R(/^docker logs tutor-api/) },
    { text: 'Kiểm tra file build thật sự nằm trong image: liệt kê `dist`.', hint: 'docker exec tutor-api ls dist', check: R(/^docker exec tutor-api ls dist/) }
  ]
};

var GOODIGN = B.IGN_GOOD.slice();
D.debugs = [
  {
    id: 'c5g1', title: 'COPY báo không tìm thấy package*.json',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker build -t tutor-api:v1 .', 'ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref 7c1e...: "/package*.json": not found', '', '$ ls package.json', 'package.json'),
    story: 'Dockerfile chuẩn: `COPY package*.json ./` rồi `npm ci`. `package.json` rõ ràng có trong thư mục. Hôm qua bạn tạo `.dockerignore` để image gọn hơn và từ lúc đó build không chạy được.',
    goal: 'Build `tutor-api:v1` thành công (không còn lỗi COPY) mà `.env` và `node_modules` vẫn bị loại khỏi context.',
    hints: ['File có trên đĩa nhưng COPY không thấy: Docker chỉ gửi những gì **không** bị `.dockerignore` loại. Xem `cat .dockerignore`.', 'Có dòng `*.json` ignore luôn `package.json` và `package-lock.json`. Chỉ nên loại các file json không cần.', 'Xoá dòng đó: `sed -i \'/^\\*\\.json$/d\' .dockerignore`, kiểm tra lại bằng `cat .dockerignore`, rồi build.'],
    fix: ['cat .dockerignore', "sed -i '/^\\*\\.json$/d' .dockerignore", 'cat .dockerignore', 'docker build -t tutor-api:v1 .'],
    cause: 'Mọi file khớp mẫu trong `.dockerignore` biến mất khỏi build context, nên COPY báo "not found" dù file có trên đĩa. Khi COPY báo not found mà file tồn tại, nghi ngay `.dockerignore`.',
    setup: function (s) { B.base(s, { ignore: GOODIGN.concat(['*.json']) }); },
    check: function (s) { var t = T(s, '.dockerignore'); return okBuild(s) && !/^\*\.json$/m.test(t) && /^node_modules$/m.test(t) && /^\.env$/m.test(t); }
  },
  {
    id: 'c5g2', title: 'npm ci báo thiếu package-lock.json dù file có sẵn',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker build -t tutor-api:v1 .', ' => ERROR [4/6] RUN npm ci', '1.000 npm error code EUSAGE', '1.120 npm error The `npm ci` command can only install with an existing package-lock.json or', '1.240 npm error npm-shrinkwrap.json with lockfileVersion >= 1.', 'ERROR: failed to solve: process "/bin/sh -c npm ci" did not complete successfully: exit code: 1'),
    story: 'Trên máy bạn `npm ci` chạy tốt vì `package-lock.json` nằm cạnh `package.json`. Trong Docker thì báo thiếu lock. File lock đã commit và không bị `.dockerignore` loại.',
    goal: '`docker build -t tutor-api:v1 .` qua được bước `npm ci`.',
    hints: ['Bước hỏng là `RUN npm ci`; lệnh nó cần là lock **bên trong image**. Xem lệnh COPY ngay trước: `cat -n Dockerfile`.', 'Dòng 3 là `COPY package.json ./` chỉ chép package.json, lock không vào image.', 'Dùng glob: `sed -i \'s/COPY package.json/COPY package*.json/\' Dockerfile` rồi build.'],
    fix: ['cat -n Dockerfile', "sed -i 's/COPY package.json/COPY package*.json/' Dockerfile", 'docker build -t tutor-api:v1 .'],
    cause: 'Image chỉ chứa những gì bạn COPY vào. `npm ci` chạy trong image và không thấy lock vì Dockerfile chỉ chép package.json. Mẫu `package*.json` chép cả hai file.',
    setup: function (s) { B.base(s, { ignore: GOODIGN, dockerfile: B.DF_GOOD.map(function (l) { return l === 'COPY package*.json ./' ? 'COPY package.json ./' : l; }) }); },
    check: function (s) { return okBuild(s) && /COPY package\*\.json/.test(T(s, 'Dockerfile')); }
  },
  {
    id: 'c5g3', title: 'npm ci báo Missing: class-validator from lock file',
    host: 'vps', user: 'haidangphan',
    symptom: L(' => ERROR [4/6] RUN npm ci', '1.000 npm error code EUSAGE', '1.120 npm error `npm ci` can only install packages when your package.json and package-lock.json', '1.120 npm error or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install`', '1.240 npm error Missing: class-validator@^0.14.1 from lock file'),
    story: 'Đồng nghiệp sửa tay `package.json` thêm `class-validator` rồi push mà không chạy `npm install`. Dockerfile và `.dockerignore` đều đúng; package-lock.json có trong image nhưng lệch với package.json.',
    goal: 'Đồng bộ lock với package.json (không sửa Dockerfile) và `docker build -t tutor-api:v1 .` thành công.',
    hints: ['Thử tái hiện ngoài Docker: `npm ci` trên máy cho cùng lỗi, nhanh hơn build.', 'Lock không có `class-validator`. `npm install` (không đối số) đọc package.json và ghi lại lock cho khớp.', 'Chạy `npm install`, rồi `npm ci` để xác nhận, rồi build lại.'],
    fix: ['npm ci', 'npm install', 'npm ci', 'docker build -t tutor-api:v1 .'],
    cause: '`npm ci` kiểm tra package.json và lock khớp nhau để bản build tái lập được. Sửa tay package.json mà không chạy `npm install` làm lock cũ. Luôn commit lock cùng lúc với package.json.',
    setup: function (s) { B.base(s, { ignore: GOODIGN, skipLock: 'class-validator' }); },
    check: function (s) { return okBuild(s) && !!s.fs.get(TD + '/package-lock.json') && /class-validator/.test(T(s, 'package-lock.json')); }
  },
  {
    id: 'c5g4', title: 'npm run build lỗi TypeScript TS2322',
    host: 'vps', user: 'haidangphan',
    symptom: L(' => ERROR [6/8] RUN npm run build', '> tutor-api@1.0.0 build', '> nest build', '', 'src/auth/auth.service.ts:2:20 - error TS2322: Type \'string\' is not assignable to type \'number\'.', '', 'Found 1 error(s).', 'ERROR: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1'),
    story: 'Build image lỗi ở bước biên dịch. Trên máy bạn dùng `npm run start:dev` (không kiểm tra kiểu nghiêm ngặt) nên không thấy gì. File nằm ở src/auth/auth.service.ts.',
    goal: '`docker build -t tutor-api:v1 .` thành công.',
    hints: ['Tái hiện nhanh ngoài Docker: `npm run build` ngay trên máy cho cùng thông báo, có đủ file, dòng, cột.', 'Mở file: `cat -n src/auth/auth.service.ts`. Dòng 2 gán chuỗi `"3600"` cho biến kiểu `number`.', 'Bỏ nháy: `sed -i \'s/= "3600"/= 3600/\' src/auth/auth.service.ts`, chạy lại `npm run build` rồi build image.'],
    fix: ['npm run build', 'cat -n src/auth/auth.service.ts', "sed -i 's/= \"3600\"/= 3600/' src/auth/auth.service.ts", 'npm run build', 'docker build -t tutor-api:v1 .'],
    cause: 'Lỗi biên dịch xuất hiện trong Docker vì bước build chạy `nest build` đầy đủ. Dòng `file:dòng:cột` trong thông báo chỉ thẳng chỗ sai; sửa mã chứ không sửa Dockerfile.',
    setup: function (s) { B.base(s, { ignore: GOODIGN, extra: { 'src/auth/auth.service.ts': "export class AuthService {\n  private readonly expiresIn: number = \"3600\";\n  sign(id: number) { return `token-${id}-${this.expiresIn}`; }\n}\n" } }); },
    check: function (s) { return okBuild(s) && !/:\s*number\s*=\s*"/.test(T(s, 'src/auth/auth.service.ts')); }
  },
  {
    id: 'c5g5', title: 'Build báo TS18003: No inputs were found',
    host: 'vps', user: 'haidangphan',
    symptom: L(' => ERROR [4/6] RUN npm run build', '> nest build', '', 'error TS18003: No inputs were found in config file \'/app/tsconfig.json\'. Specified \'include\' paths were \'["**/*"]\' and \'exclude\' paths were \'["./dist"]\'.', 'ERROR: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1'),
    story: 'Bạn muốn tối ưu cache nên sắp lại Dockerfile. `npm ci` giờ chạy nhanh nhưng bước build báo không thấy mã nguồn nào, trong khi thư mục src có đầy đủ file.',
    goal: '`docker build -t tutor-api:v1 .` thành công và Dockerfile vẫn giữ thứ tự `COPY package*.json` → `npm ci` → `COPY . .`.',
    hints: ['Đọc thứ tự các lệnh: `cat -n Dockerfile`. Image chỉ có những gì đã COPY **đến lúc đó**.', '`RUN npm run build` đứng trước `COPY . .`, nên lúc build chưa có thư mục src.', 'Viết lại Dockerfile với thứ tự: `COPY package*.json`, `npm ci`, `COPY . .`, `npm run build` (dùng `cat > Dockerfile <<\'EOF\'`).'],
    fix: ['cat -n Dockerfile', HC('Dockerfile', B.DF_GOOD), 'docker build -t tutor-api:v1 .'],
    cause: 'Mỗi lệnh chỉ thấy các file đã được COPY trước nó. Bước build cần mã nguồn nên `COPY . .` phải đứng trước `RUN npm run build`, nhưng sau `npm ci` để giữ cache.',
    setup: function (s) { B.base(s, { ignore: GOODIGN, dockerfile: ['FROM node:22-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci', 'RUN npm run build', 'COPY . .', 'ENV NODE_ENV=production', 'EXPOSE 8888', 'USER node', 'CMD ["node", "dist/main.js"]'] }); },
    check: function (s) { var t = T(s, 'Dockerfile'); return okBuild(s) && ord(t, 'COPY package', 'npm ci') && ord(t, 'npm ci', 'COPY . .') && ord(t, 'COPY . .', 'npm run build'); }
  },
  {
    id: 'c5g6', title: 'Thêm curl vào image: hai lỗi build nối tiếp', hard: true,
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker build -t tutor-api:v1 .', ' => ERROR [3/7] RUN apt-get update && apt-get install -y curl', '/bin/sh: apt-get: not found', 'ERROR: failed to solve: process "/bin/sh -c apt-get update && apt-get install -y curl" did not complete successfully: exit code: 127'),
    story: 'Bạn cần `curl` trong image cho HEALTHCHECK nên chép dòng cài đặt từ một hướng dẫn cũ vào Dockerfile. Base là `node:22-alpine`. Sau khi sửa lỗi đầu tiên có thể còn lỗi thứ hai: tuần trước ai đó thêm `tsconfig.json` vào `.dockerignore`.',
    goal: 'Build thành công, image vẫn dựa trên `node:22-alpine`, có cài `curl` đúng kiểu alpine (không còn `apt-get`), và `tsconfig.json` được đưa vào context.',
    hints: ['Mã thoát 127 nghĩa là không có lệnh `apt-get`: image alpine dùng `apk`. Xem `cat -n Dockerfile` và tìm dòng RUN.', 'Thay bằng `RUN apk add --no-cache curl` (sed hoặc viết lại dòng). Build lại: sẽ có lỗi mới `TS5083 Cannot read file /app/tsconfig.json`.', 'Lỗi thứ hai do `.dockerignore` có dòng `tsconfig.json`. Xoá dòng đó khỏi `.dockerignore` rồi build lại.'],
    fix: ['cat -n Dockerfile', "sed -i 's/apt-get update \\&\\& apt-get install -y curl/apk add --no-cache curl/' Dockerfile", 'docker build -t tutor-api:v1 . 2>&1 | tail -n 8', "sed -i '/^tsconfig.json$/d' .dockerignore", 'docker build -t tutor-api:v1 .'],
    cause: 'Hai lỗi độc lập chồng lên nhau; sửa một lỗi mới thấy lỗi kế tiếp, vì build dừng ở lỗi đầu tiên. Alpine dùng apk (và musl), Debian dùng apt. Và bất cứ file nào Dockerfile cần (tsconfig, src, package*.json) đều không được nằm trong `.dockerignore`.',
    setup: function (s) {
      B.base(s, { ignore: GOODIGN.concat(['tsconfig.json']), dockerfile: ['FROM node:22-alpine', 'WORKDIR /app', 'RUN apt-get update && apt-get install -y curl', 'COPY package*.json ./', 'RUN npm ci', 'COPY . .', 'RUN npm run build', 'EXPOSE 8888', 'USER node', 'HEALTHCHECK CMD curl -f http://localhost:8888/health || exit 1', 'CMD ["node", "dist/main.js"]'] });
    },
    check: function (s) { var t = T(s, 'Dockerfile'); return okBuild(s) && /^FROM node:22-alpine/m.test(t) && /apk add[^\n]*curl/.test(t) && !/apt-get/.test(t) && !/^tsconfig\.json$/m.test(T(s, '.dockerignore')); }
  },
  {
    id: 'c5g7', title: 'FROM node:22.alpine báo not found',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ docker build -t tutor-api:v1 .', 'ERROR: failed to solve: node:22.alpine: failed to resolve source metadata for docker.io/library/node:22.alpine: docker.io/library/node:22.alpine: not found'),
    story: 'Bạn muốn dùng Node 22 bản nhỏ nên tự gõ tag cho image nền. Trước đây gặp lỗi `pull access denied` thì là sai tên image; lần này thông báo khác.',
    goal: 'Build thành công, image nền vẫn là bản alpine của Node 22.',
    hints: ['Thông báo là `not found` chứ không phải `pull access denied`: repository `node` đúng, **tag** không tồn tại.', 'Tag đúng ghép phiên bản và biến thể bằng **dấu gạch ngang**: `22-alpine`.', 'Sửa: `sed -i \'s/node:22.alpine/node:22-alpine/\' Dockerfile` rồi build.'],
    fix: ['head -n 1 Dockerfile', "sed -i 's/node:22.alpine/node:22-alpine/' Dockerfile", 'docker build -t tutor-api:v1 .'],
    cause: 'Hai thông báo cho hai lỗi khác nhau: `pull access denied` là sai tên repository, `not found` là tag không có. Kiểm tra tag trên Docker Hub (tab Tags) và ghim phiên bản cụ thể.',
    setup: function (s) { B.base(s, { ignore: GOODIGN, dockerfile: B.DF_GOOD.map(function (l) { return l === 'FROM node:22-alpine' ? 'FROM node:22.alpine' : l; }) }); },
    check: function (s) { return okBuild(s) && /^FROM node:22-alpine/m.test(T(s, 'Dockerfile')); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
