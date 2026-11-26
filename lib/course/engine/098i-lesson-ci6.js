(function (G) {
'use strict';
/* Chương ci6: kiểm tra kiểu TypeScript (typecheck), build, và workflow nhiều job nối nhau bằng needs. */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI;
var WF = '.github/workflows/';
var T = {
  id: 'ci6', group: CI.GROUP, short: 'Typecheck và build',
  title: 'Kiểm tra kiểu (typecheck) và build trong CI',
  dek: 'Phân biệt lint, typecheck, test và build; bật TypeScript strict, viết script typecheck và build, tách thành nhiều job có needs, dùng cache npm và artifact cho bản build.'
};
C.lessons.push(T);

var TSCONFIG = ['{', '  "compilerOptions": {', '    "target": "ES2022",', '    "module": "commonjs",', '    "strict": true,', '    "noEmit": true,', '    "skipLibCheck": true', '  },', '  "include": ["src"]', '}'];
var INDEX_TS = ['export function add(a: number, b: number): number {', '  return a + b;', '}'];
var PKG = ['{', '  "name": "tutor-api",', '  "version": "1.4.2",', '  "scripts": {', '    "start": "node src/app.js",', '    "test": "node --test",', '    "typecheck": "tsc --noEmit",', '    "build": "tsc"', '  }', '}'];
var CI6 = ['name: CI', 'on:', '  pull_request:', '  push:', '    branches: [main]', 'jobs:', '  typecheck:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '          cache: npm', '      - run: npm ci', '      - run: npm run typecheck', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '          cache: npm', '      - run: npm ci', '      - run: npm test', '  build:', '    needs: [typecheck, test]', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '          cache: npm', '      - run: npm ci', '      - run: npm run build', '      - uses: actions/upload-artifact@v4', '        with:', '          name: dist', '          path: dist/', '          retention-days: 7'];
function jobsOK(s) { var d = CI.doc(s, 'ci.yml'); return !!d && !!d.jobs && !!d.jobs.typecheck && !!d.jobs.test && !!d.jobs.build; }

T.theory = [
  { tag: 'Khái niệm', title: 'Bốn lớp kiểm tra và vì sao không gộp chúng lại', body: [
    { tbl: [['Bước', 'Công cụ ví dụ', 'Bắt được lỗi gì', 'Nhanh hay chậm'], ['**Lint**', 'ESLint', 'Phong cách code, biến không dùng, lỗi tiềm ẩn', 'Nhanh'], ['**Typecheck**', 'tsc --noEmit', 'Sai kiểu dữ liệu, gọi hàm sai tham số, thiếu thuộc tính', 'Nhanh vừa'], ['**Test**', 'node --test, Jest, Vitest', 'Hành vi sai so với kỳ vọng', 'Vừa'], ['**Build**', 'tsc, next build, esbuild', 'Không tạo được sản phẩm chạy được', 'Chậm nhất']] },
    'Build **không** thay thế typecheck. Nhiều công cụ build (esbuild, Babel) chỉ xoá kiểu rồi đóng gói, không kiểm tra kiểu nên build vẫn xanh dù code sai kiểu.'
  ] },
  { tag: 'Typecheck', title: 'TypeScript: bật strict và viết script typecheck', body: [
    'Cấu hình nằm trong `tsconfig.json`. Các khoá quan trọng:',
    { pre: TSCONFIG, cap: 'tsconfig.json: strict bật toàn bộ kiểm tra nghiêm ngặt, noEmit chỉ kiểm tra, không sinh file' },
    { tbl: [['Khoá', 'Ý nghĩa'], ['`strict: true`', 'Bật nhóm kiểm tra nghiêm: `noImplicitAny`, `strictNullChecks`...'], ['`noEmit: true`', 'Chỉ kiểm tra kiểu, không tạo file JS (dùng cho bước typecheck)'], ['`include`', 'Thư mục chứa mã nguồn cần kiểm tra']] },
    'Đưa lệnh vào `scripts` để CI và máy bạn chạy cùng một lệnh:',
    { pre: ['"scripts": {', '  "typecheck": "tsc --noEmit"', '}', '# chạy: npm run typecheck', '# lỗi mẫu:', "# src/index.ts(2,3): error TS2322: Type 'string' is not assignable to type 'number'."], cap: 'Script typecheck và một lỗi mẫu' },
    { note: 'Mã lỗi TS2xxx là tra cứu được. TS2322 luôn nghĩa là gán giá trị sai kiểu. Đọc đúng dòng và cột trong thông báo trước khi sửa.', kind: 'tip' }
  ] },
  { tag: 'Build', title: 'Build: tạo sản phẩm và lưu thành artifact', body: [
    'Build biến mã nguồn thành thứ sẽ chạy thật (thư mục `dist/`, `.next/`, image Docker). Trên CI, bản build nên được **lưu lại** để job sau hoặc người dùng tải về, không build lại từ đầu.',
    { pre: ['- uses: actions/upload-artifact@v4', '  with:', '    name: dist', '    path: dist/', '    retention-days: 7'], cap: 'Lưu thư mục dist thành artifact trong 7 ngày' },
    { note: 'Artifact là file cho người đọc lại (tải về, kiểm tra). Để chuyển file giữa các job, dùng upload và download artifact, vì mỗi job chạy trên máy riêng.', kind: 'warn' }
  ] },
  { tag: 'Workflow', title: 'Nhiều job nối nhau bằng needs', body: [
    'Ba job chạy **song song** mặc định. Muốn build chỉ chạy khi typecheck và test đều xanh, khai báo `needs`:',
    { pre: CI6.slice(5, 9).concat(['  # ...', '  build:', '    needs: [typecheck, test]', '    runs-on: ubuntu-latest']), cap: 'build chờ typecheck và test' },
    { ul: ['`needs` có thể là một tên hoặc danh sách. Tên sai là lỗi ngay khi push (actionlint báo job không tồn tại).', 'Job bị chặn khi job cha đỏ sẽ có trạng thái **skipped**, không chạy.', 'Mỗi job có máy ảo riêng, nên muốn dùng chung file phải qua artifact.'] }
  ] },
  { tag: 'Tăng tốc', title: 'Cache npm và thứ tự chạy để tiết kiệm phút', body: [
    'Khoá `cache: npm` trong `actions/setup-node` lưu thư mục cache của npm. Khoá cache được tính từ hash của `package-lock.json`: đổi lockfile thì cache mới được tạo.',
    { tbl: [['Tình huống', 'Hành động'], ['Thêm thư viện mới', 'Commit cả `package.json` và `package-lock.json`'], ['Cache không bao giờ hit', 'Kiểm tra có `package-lock.json` trong repo không'], ['Muốn chạy lệnh rẻ trước', 'Đặt typecheck, lint đầu tiên; build cuối cùng']] }
  ] },
  { tag: 'Quy trình', title: 'Chạy đủ bộ kiểm tra trên máy trước khi push', body: [
    { pre: ['npm ci', 'npm run typecheck && npm test && npm run build', 'git add . && git commit -m "..." && git push'], cap: 'Thứ tự chạy cục bộ giống hệt CI' },
    { note: 'Nếu cục bộ đã có lỗi, CI cũng sẽ đỏ. Chạy sẵn trên máy giúp bạn không tốn lượt push và chờ runner.', kind: 'tip' }
  ] }
];

T.quiz = C.QZ(6, [
  ['`tsc --noEmit` làm gì?', 'Kiểm tra kiểu trên toàn bộ dự án mà không sinh file JavaScript', ['Biên dịch và đóng gói dự án', 'Chạy test', 'Xoá file trong dist'], 'noEmit chỉ kiểm tra, phù hợp cho bước typecheck trong CI vì không tạo file thừa.'],
  ['Bật `"strict": true` trong tsconfig có ý nghĩa gì?', 'Bật nhóm kiểm tra nghiêm ngặt như noImplicitAny và strictNullChecks', ['Bắt buộc dùng biến `let` thay cho `const`', 'Tắt mọi cảnh báo của ESLint', 'Chỉ cho phép một file trong dự án'], 'Strict giúp bắt lỗi null và kiểu ẩn sớm, khi sửa thì rẻ hơn rất nhiều.'],
  ['Build có xanh nhưng code sai kiểu, vì sao?', 'Nhiều công cụ build chỉ xoá kiểu rồi đóng gói, không kiểm tra kiểu', ['Build luôn bỏ qua file TypeScript', 'GitHub không chạy build', 'Build chỉ chạy trên nhánh main'], 'Vì thế cần bước typecheck riêng. Build xanh không có nghĩa là kiểu đúng.'],
  ['`needs: [typecheck, test]` ở job build nghĩa là gì?', 'Build chỉ chạy sau khi cả typecheck và test thành công', ['Build chạy song song với typecheck', 'Build chạy trước typecheck', 'Build chạy hai lần'], 'needs là quan hệ phụ thuộc. Job cha đỏ thì job con bị skipped.'],
  ['`actions/upload-artifact` dùng để làm gì?', 'Lưu file (ví dụ thư mục dist) để job khác hoặc người dùng tải về', ['Tải code từ GitHub về runner', 'Cài Node.js', 'Đặt secret cho repo'], 'Mỗi job là một máy riêng, artifact là cách chuyển kết quả giữa các job.'],
  ['Khoá cache của `setup-node` (`cache: npm`) dựa trên gì?', 'Hash của package-lock.json', ['Tên nhánh', 'Giờ chạy workflow', 'Số lần push trong ngày'], 'Lockfile đổi thì bộ thư viện đổi, nên cache phải đổi theo.'],
  ['Log báo `TS2322: Type \'string\' is not assignable to type \'number\'`. Ý nghĩa?', 'Một giá trị kiểu chuỗi đang được gán cho biến kiểu số', ['Thiếu file tsconfig', 'Lỗi mạng khi tải package', 'Node phiên bản quá cũ'], 'Đọc đúng dòng và cột trong thông báo, sửa giá trị hoặc kiểu khai báo cho khớp.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.repo(s); },
  items: [
    { text: 'Tạo `tsconfig.json` (heredoc) với `strict` và `noEmit` đều là true, `include` là `["src"]`.', hint: C.HCU('tsconfig.json', TSCONFIG), check: function (s) { var t = ftxt(s, CI.proj(s) + '/tsconfig.json'); return /"strict"\s*:\s*true/.test(t) && /"noEmit"\s*:\s*true/.test(t) && /"include"/.test(t); } },
    { text: 'Tạo `src/index.ts` có hàm `add(a: number, b: number): number`.', hint: C.HCU('src/index.ts', INDEX_TS), check: function (s) { return /function add\(a: number, b: number\): number/.test(ftxt(s, CI.proj(s) + '/src/index.ts')); } },
    { text: 'Ghi lại package.json (heredoc) với script `typecheck` là `tsc --noEmit` và `build` là `tsc`, giữ `start` và `test`.', hint: C.HCU('package.json', PKG), check: function (s) { var t = ftxt(s, CI.proj(s) + '/package.json'); return /"typecheck"\s*:\s*"tsc --noEmit"/.test(t) && /"build"\s*:\s*"tsc"/.test(t) && /"test"\s*:/.test(t); } },
    { text: 'Ghi `.github/workflows/ci.yml` gồm ba job: `typecheck`, `test`, `build`. Job `build` có `needs: [typecheck, test]`, bước upload artifact `dist`. Dùng heredoc.', hint: C.HCU(WF + 'ci.yml', CI6), check: function (s) { var d = CI.doc(s, 'ci.yml'), j = CI.job(s, 'ci.yml', 'build'); return jobsOK(s) && !!j && Array.isArray(j.needs) && j.needs.indexOf('typecheck') >= 0 && j.needs.indexOf('test') >= 0 && CI.uses(j, /^actions\/upload-artifact@v4$/); } },
    { text: 'Kiểm tra workflow bằng `actionlint`, không in gì nghĩa là đạt.', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'ci.yml'); } },
    { text: 'Đưa mọi file vào staging bằng `git add .`, commit với `Thêm typecheck, test và build`, rồi `git push`.', hint: 'git add .\ngit commit -m "Thêm typecheck, test và build"\ngit push', check: function (s) { return OK(/^git push/)(s) && CI.runCount(s) >= 2; } },
    { text: 'Lần chạy mới nhất phải xanh và có đủ các job.', hint: 'gh run list\ngh run view', check: function (s) { return CI.greenLast(s); } },
    { text: 'Mô phỏng sai thứ tự: sửa `needs: [typecheck, test]` thành `needs: [typecheck, tset]` bằng `sed -i`.', hint: "sed -i 's#needs: \\[typecheck, test\\]#needs: [typecheck, tset]#' .github/workflows/ci.yml", check: function (s) { return /tset/.test(ftxt(s, CI.wfPath(s, 'ci.yml'))); } },
    { text: 'Chạy `actionlint` và đọc lỗi: nó phải báo job `build` cần job `tset` không tồn tại.', hint: 'actionlint', check: function (s) { return CI.anyFail(s, /^actionlint$/) && !CI.lint(s, 'ci.yml'); } },
    { text: 'Sửa lại `tset` thành `test` bằng `sed -i`, chạy `actionlint` lần nữa cho sạch lỗi.', hint: "sed -i 's#tset#test#' .github/workflows/ci.yml\nactionlint", check: function (s) { return CI.lint(s, 'ci.yml') && CI.lastOK(s, /^actionlint$/); } },
    { text: 'Commit `Sửa needs của build` bằng `git commit -am`, rồi `git push`.', hint: 'git commit -am "Sửa needs của build"\ngit push', check: function (s) { return CI.greenLast(s) && CI.headHas(s, WF + 'ci.yml', /needs: \[typecheck, test\]/); } },
    { text: 'Xem lại file workflow bằng `cat .github/workflows/ci.yml` để chắc chắn các job đúng thứ tự.', hint: 'cat .github/workflows/ci.yml', check: function (s) { return s.hist.some(function (h) { return /^cat .*ci\.yml/.test(h.cmd); }); } }
  ]
};

T.debugs = [
  {
    id: 'ci6d1', title: 'Build xanh nhưng tsc báo lỗi kiểu',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ npm run typecheck', 'src/index.ts(2,3): error TS2322: Type \'string\' is not assignable to type \'number\'.', 'Found 1 error in src/index.ts:2', '(Job build vẫn xanh: build không kiểm tra kiểu)'),
    story: 'Một hàm được truyền chuỗi thay vì số. Job build vẫn xanh, nên nhóm tưởng code ổn. Đến khi deploy mới thấy hành vi sai.',
    goal: 'src/index.ts không còn lỗi kiểu, và lần chạy mới nhất xanh cùng bước typecheck.',
    hints: ['Đọc thông báo TS2322: giá trị chuỗi đang được gán vào biến kiểu số.', 'Build không kiểm tra kiểu. Lỗi chỉ được bắt bởi `tsc --noEmit`.', 'Sửa giá trị thành số trong src/index.ts, commit và push, xem gh run list.'],
    fix: ["sed -i 's#\"2\"#2#' src/index.ts", 'git commit -am "Sửa kiểu dữ liệu"', 'git push', 'gh run list'],
    cause: 'Build bằng tsc thường xoá kiểu khi sinh JS nên có thể thành công dù code sai kiểu. Typecheck phải là một bước riêng và bắt buộc.',
    setup: function (s) { CI.repo(s, { yml: CI6, extraFiles: [['tsconfig.json', TSCONFIG], ['src/index.ts', ['export function add(a: number, b: number): number {', '  return a + b;', '}', 'export const total: number = "2";']]], after: ['git add .', 'git commit -m "Thêm typecheck"', 'git push'] }); },
    check: function (s) { var t = ftxt(s, CI.proj(s) + '/src/index.ts'); return !/: number = "/.test(t) && CI.greenLast(s); }
  },
  {
    id: 'ci6d2', title: 'Build chạy khi typecheck còn đỏ',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view', 'X CI · 9120', '  ✓ test in 42s', '  X typecheck in 21s', '  ✓ build in 58s', '(build không bị skipped vì không khai báo needs)'),
    story: 'Job build chạy xong và upload được dist, nhưng typecheck đã đỏ. Artifact được lưu từ một commit có lỗi kiểu.',
    goal: 'Job build có needs chứa typecheck, và cả ba job chạy đúng quan hệ phụ thuộc.',
    hints: ['Mở ci.yml và tìm khoá needs trong job build.', 'Không có needs thì mọi job chạy song song và độc lập nhau.', 'Thêm needs: [typecheck, test] vào build, commit và push.'],
    fix: [C.HCU(WF + 'ci.yml', CI6), 'git commit -am "build cần typecheck và test"', 'git push'],
    cause: 'Các job độc lập chạy song song. Khi cần thứ tự và điều kiện thành công, phải khai báo needs để GitHub chặn job con.',
    setup: function (s) { CI.repo(s, { yml: CI6.filter(function (l) { return l.indexOf('needs:') < 0; }) }); },
    check: function (s) { var j = CI.job(s, 'ci.yml', 'build'); return !!j && Array.isArray(j.needs) && j.needs.indexOf('typecheck') >= 0 && CI.greenLast(s); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
