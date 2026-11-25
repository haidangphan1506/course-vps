(function (G) {
'use strict';
/* Chương ci2: CI thực tế: trigger, matrix, cache, artifact, secrets, pull request. */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI, GH = C.GH;
function after(s, a, b) { var ia = -1, ib = -1; s.hist.forEach(function (h, i) { if (a.test(h.cmd)) ia = i; if (b.test(h.cmd) && h.code === 0) ib = i; }); return ia >= 0 && ib > ia; }
function hasRun(s, ev) { return CI.st(s).runs.some(function (r) { return r.event === ev; }); }
var WF = '.github/workflows/';
var MATRIX = ['name: Matrix', 'on:', '  pull_request:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    strategy:', '      fail-fast: false', '      matrix:', '        node: [22, 24]', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: ${{ matrix.node }}', '          cache: npm', '      - run: npm ci', '      - run: npm test'];
var NIGHTLY = ['name: Nightly', 'on:', '  schedule:', "    - cron: '0 2 * * *'", '  workflow_dispatch:', 'jobs:', '  audit:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm audit --audit-level=high'];
var BUILDJOB = ['  build:', '    needs: test', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: mkdir -p dist && cp -r src dist/', '      - uses: actions/upload-artifact@v4', '        with:', '          name: dist', '          path: dist/', '          retention-days: 7'];
var PUBLISH = ['name: Publish', 'on:', '  push:', '    branches: [main]', 'jobs:', '  publish:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '          registry-url: https://registry.npmjs.org', '      - run: npm ci', '      - run: npm publish --dry-run', '        env:', '          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}'];
function pathsYml(paths) { return ['name: CI', 'on:', '  push:', '    branches: [main]', '    paths: ' + paths, 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm ci', '      - run: npm test']; }
var NEEDSBAD = ['name: CI', 'on:', '  push:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm ci', '      - run: npm test', '  build:', '    needs: tests', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: echo build'];
var NEEDSOK = NEEDSBAD.map(function (l) { return l === '    needs: tests' ? '    needs: test' : l; });

var T = {
  id: 'ci2', group: CI.GROUP, short: 'CI thực tế',
  title: 'CI thực tế: trigger, matrix, cache, artifact và secrets',
  dek: 'Chọn đúng lúc chạy workflow (push, pull_request, schedule, workflow_dispatch, paths), chạy nhiều phiên bản Node bằng matrix, tăng tốc bằng cache, lưu kết quả bằng artifact, dùng secrets và biến, rồi chặn merge khi CI đỏ.'
};
C.lessons.push(T);

T.theory = [
  { tag: 'Trigger', title: 'Khi nào workflow chạy: các sự kiện và bộ lọc', body: [
    { tbl: [['Sự kiện', 'Kích hoạt khi', 'Lưu ý'], ['`push`', 'Có commit hoặc tag được đẩy lên', 'Lọc bằng `branches`, `tags`, `paths`'], ['`pull_request`', 'Mở, cập nhật pull request', 'Chạy trên bản **đã merge thử** với nhánh đích'], ['`workflow_dispatch`', 'Bấm chạy tay (tab Actions hoặc `gh workflow run`)', 'Có thể khai báo `inputs`'], ['`schedule`', 'Theo cron', 'Giờ **UTC**, chỉ chạy từ nhánh mặc định, có thể trễ vài phút'], ['`workflow_call`', 'Được workflow khác gọi', 'Dùng cho workflow tái sử dụng (bài ci4)']] },
    { pre: ['on:', '  push:', '    branches: [main]', '    paths: [\'src/**\', \'package*.json\']', '  pull_request:', '    branches: [main]', '  workflow_dispatch:', '  schedule:', '    - cron: \'0 2 * * *\'   # 02:00 UTC = 09:00 giờ Việt Nam'], cap: 'Bốn sự kiện hay dùng cùng lúc' },
    { note: '`paths` rất tiện để khỏi chạy CI khi chỉ sửa tài liệu, nhưng dễ **quên** file quan trọng (như `package.json` hoặc chính file workflow). Quên là push xong mà không có lần chạy nào.', kind: 'warn' }
  ] },
  { tag: 'Tăng tốc', title: 'Matrix, cache và artifact', body: [
    { pre: ['jobs:', '  test:', '    runs-on: ubuntu-latest', '    strategy:', '      fail-fast: false', '      matrix:', '        node: [22, 24]', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: ${{ matrix.node }}', '          cache: npm', '      - run: npm ci', '      - run: npm test', '      - uses: actions/upload-artifact@v4', '        with:', '          name: report-${{ matrix.node }}', '          path: reports/'], cap: 'Chạy test trên hai phiên bản Node, có cache và lưu báo cáo' },
    { tbl: [['Tính năng', 'Tác dụng', 'Bẫy thường gặp'], ['`matrix`', 'Tạo nhiều job song song từ một định nghĩa (phiên bản Node, hệ điều hành...)', 'Mặc định `fail-fast: true`: một job đỏ sẽ huỷ các job còn lại'], ['`cache: npm`', 'Lưu cache npm giữa các lần chạy, khoá theo `package-lock.json`', 'Thiếu lockfile thì không cache được'], ['`upload-artifact@v4`', 'Giữ file kết quả (build, báo cáo) để tải về hoặc chuyển cho job khác', 'Tên artifact trùng nhau giữa các job matrix sẽ xung đột, hãy thêm hậu tố'], ['`needs`', 'Job này chạy sau job kia và chỉ khi job kia thành công', 'Gõ sai tên job là lỗi ngay khi push']] }
  ] },
  { tag: 'Bí mật', title: 'Biến, secrets, điều kiện và thứ tự job', body: [
    { tbl: [['Ngữ cảnh', 'Dùng cho', 'Ví dụ'], ['`secrets.X`', 'Giá trị nhạy cảm, mã hoá, bị che trong log', '${{ secrets.NPM_TOKEN }}'], ['`vars.X`', 'Cấu hình không nhạy cảm, xem được', '${{ vars.NODE_VERSION }}'], ['`env.X`', 'Biến môi trường khai báo trong workflow', '`env: NODE_ENV: test`'], ['`github.*`', 'Thông tin về lần chạy: nhánh, sự kiện, commit', '${{ github.ref }}, ${{ github.sha }}']] },
    { pre: ['gh secret set NPM_TOKEN --body "npm_xxx"', 'gh secret list', 'gh variable set NODE_VERSION --body 22'], cap: 'Thêm secret và biến cho repo bằng gh' },
    { ul: ['**`if:`** chạy step hoặc job có điều kiện, ví dụ `if: github.ref == \'refs/heads/main\'`.', '**`needs:`** ép thứ tự job: `build` chỉ chạy khi `test` xanh.', '**Secret không có trong PR từ fork**: GitHub không đưa secrets cho code lạ để tránh bị in ra log.', '**Không bao giờ `echo` secret.** GitHub che giá trị trong log, nhưng chỉ khi nó khớp **nguyên văn**; chuỗi bị biến đổi sẽ lọt ra.'] },
    { note: 'Secret chưa tạo không gây lỗi cú pháp: ${{ secrets.NPM_TOKEN }} chỉ trở thành chuỗi rỗng, và job lỗi ở bước dùng nó (ví dụ 401 hoặc "Input required").', kind: 'tip' }
  ] },
  { tag: 'Quy trình nhóm', title: 'Pull request và chặn merge khi CI đỏ', body: [
    'CI có giá trị nhất khi nó **canh cửa** nhánh main. Quy trình nhóm điển hình:',
    { ul: ['Làm việc trên nhánh riêng: `git switch -c feat/ten-tinh-nang`.', 'Push nhánh và mở pull request: `gh pr create --title "..."`.', 'Workflow có `pull_request` tự chạy; xem kết quả bằng `gh pr checks`.', 'Bật **branch protection** cho main: bắt buộc status check CI phải xanh mới được merge.', 'Commit chỉ sửa tài liệu có thể thêm `[skip ci]` vào thông điệp để GitHub bỏ qua workflow `push`.'] },
    { note: 'Nhánh `feat/…` vừa push **không** tự chạy workflow chỉ lọc `branches: [main]`. Chỉ khi mở PR (sự kiện `pull_request`) thì workflow có khoá này mới chạy.', kind: 'tip' }
  ] }
];

T.quiz = C.QZ(2, [
  ['Muốn workflow cũng chạy khi mở pull request vào main, ngoài push, cần làm gì?', 'Thêm khoá `pull_request:` (với `branches: [main]`) vào `on`', ['Đổi `runs-on` thành `pull_request`', 'Thêm `needs: main` vào job', 'Không cần làm gì, push đã bao gồm PR'], 'Mỗi sự kiện là một khoá riêng trong `on`. Push lên nhánh và mở PR là hai sự kiện khác nhau.'],
  ['Muốn bấm chạy tay một workflow (tab Actions hoặc `gh workflow run`), workflow phải khai báo trigger nào?', '`workflow_dispatch`', ['`manual`', '`schedule`', '`workflow_run`'], 'Không có `workflow_dispatch`, `gh workflow run` trả lỗi HTTP 422: workflow does not have a workflow_dispatch trigger.'],
  ['Cron trong `schedule` tính theo múi giờ nào?', 'UTC (02:00 UTC là 09:00 giờ Việt Nam)', ['Giờ Việt Nam', 'Múi giờ cài trong repo', 'Giờ của runner'], 'Schedule chỉ chạy từ nhánh mặc định và có thể trễ vài phút khi GitHub đang tải cao.'],
  ['`matrix: node: [22, 24]` tạo ra gì?', 'Hai job chạy song song, mỗi job một phiên bản Node', ['Một job chạy lần lượt hai phiên bản', 'Hai workflow riêng biệt', 'Chỉ chạy phiên bản mới nhất'], 'Matrix nhân job theo từng tổ hợp giá trị. Dùng `${{ matrix.node }}` để đọc giá trị của job hiện tại.'],
  ['`cache: npm` trong `actions/setup-node` giúp gì?', 'Lưu cache npm giữa các lần chạy, nên `npm ci` tải ít hơn và nhanh hơn', ['Lưu kết quả test để bỏ qua test', 'Lưu secrets', 'Tự cập nhật thư viện lên bản mới nhất'], 'Khoá cache dựa trên `package-lock.json`. Đổi lockfile thì cache được tạo mới.'],
  ['Artifact dùng để làm gì?', 'Giữ file kết quả của job (build, báo cáo) để tải về hoặc chuyển cho job khác', ['Lưu secrets lâu dài', 'Tăng tốc cài thư viện', 'Cấp quyền ghi cho runner'], 'Runner bị huỷ khi job xong, nên file muốn giữ lại phải được upload thành artifact.'],
  ['Vì sao pull request từ fork không đọc được secrets của repo?', 'Để code lạ không thể in secrets ra log; fork chỉ nhận token chỉ-đọc', ['Vì fork chạy trên máy chậm hơn', 'Vì secrets chỉ dùng được ở nhánh main', 'Đó là lỗi cần báo cho GitHub'], 'Đây là chủ ý bảo mật. Workflow dùng secrets cho PR fork phải thiết kế cực kỳ cẩn thận (xem bài ci4).'],
  ['Secret khác biến (`vars`) ở điểm nào?', 'Secret được mã hoá và bị che trong log; `vars` là giá trị thường, xem được', ['Secret dùng được ở mọi repo', '`vars` chỉ đọc được bằng gh', 'Không khác, chỉ khác tên'], 'Chỉ cất thứ nhạy cảm (token, khoá riêng) vào secrets, còn cấu hình như phiên bản Node nên là `vars`.'],
  ['Job `build` phải chạy sau job `test` và chỉ khi `test` thành công. Dùng khoá nào?', '`needs: test` trong job `build`', ['`after: test`', '`depends: [test]`', '`if: test`'], 'Thiếu `needs` thì các job chạy song song. Tên trong `needs` gõ sai là lỗi ngay khi push.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.repo(s); },
  items: [
    { text: 'Kho đã có workflow CI cơ bản và một lần chạy. Xem bằng `gh run list`.', hint: 'gh run list', check: OK(/^gh run list/) },
    { text: 'Tạo nhánh làm việc `feat/ci-upgrade` bằng `git switch -c`.', hint: 'git switch -c feat/ci-upgrade', check: function (s) { return CI.R(s).branch === 'feat/ci-upgrade'; } },
    { text: 'Tạo `matrix.yml`: chạy khi có pull_request vào main, test trên Node 22 và 24 bằng `strategy.matrix`, có `cache: npm`.', hint: C.HCU(WF + 'matrix.yml', MATRIX), check: function (s) { var d = CI.doc(s, 'matrix.yml'), j = CI.job(s, 'matrix.yml', 'test'); var m = j && j.strategy && j.strategy.matrix; var st = j && Array.isArray(j.steps) ? j.steps.filter(function (x) { return /setup-node/.test(String(x.uses)); })[0] : null; return !!d && CI.onKeys(d).indexOf('pull_request') >= 0 && !!m && Array.isArray(m.node) && m.node.length === 2 && !!st && !!st.with && st.with.cache === 'npm'; } },
    { text: 'Tạo `nightly.yml` chạy lúc 02:00 UTC mỗi ngày (`schedule`) và cho phép chạy tay (`workflow_dispatch`), chạy `npm audit`.', hint: C.HCU(WF + 'nightly.yml', NIGHTLY), check: function (s) { var d = CI.doc(s, 'nightly.yml'), k = CI.onKeys(d); return !!d && k.indexOf('schedule') >= 0 && k.indexOf('workflow_dispatch') >= 0 && /^0 2 \* \* \*$/.test(String(d.on.schedule && d.on.schedule[0] && d.on.schedule[0].cron)); } },
    { text: 'Nối thêm job `build` vào cuối `ci.yml` bằng `cat >>`: `needs: test` và upload artifact `dist` với `actions/upload-artifact@v4`.', hint: "cat >> .github/workflows/ci.yml <<'EOF'\n" + BUILDJOB.join('\n') + '\nEOF', check: function (s) { var j = CI.job(s, 'ci.yml', 'build'); return !!j && j.needs === 'test' && CI.uses(j, /^actions\/upload-artifact@v4$/); } },
    { text: 'Kiểm tra cả ba file workflow bằng `actionlint`.', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'ci.yml') && CI.lint(s, 'matrix.yml') && CI.lint(s, 'nightly.yml'); } },
    { text: 'Thêm secret `NPM_TOKEN` bằng `gh secret set NPM_TOKEN --body "npm_demo_token"`.', hint: 'gh secret set NPM_TOKEN --body "npm_demo_token"', check: function (s) { return !!CI.st(s).secrets.NPM_TOKEN; } },
    { text: 'Liệt kê secrets của repo bằng `gh secret list` (giá trị không bao giờ hiện lại).', hint: 'gh secret list', check: function (s) { return OK(/^gh secret list/)(s) && !!CI.st(s).secrets.NPM_TOKEN; } },
    { text: 'Thêm biến thường `NODE_VERSION=22` bằng `gh variable set`.', hint: 'gh variable set NODE_VERSION --body 22', check: function (s) { return CI.st(s).vars.NODE_VERSION === '22'; } },
    { text: 'Thêm mọi thay đổi và commit: `Nâng cấp CI: matrix, nightly, artifact`.', hint: 'git add .\ngit commit -m "Nâng cấp CI: matrix, nightly, artifact"', check: function (s) { return CI.R(s).commits.length >= 2 && CI.headHas(s, WF + 'matrix.yml', /matrix/) && CI.headHas(s, WF + 'ci.yml', /upload-artifact/); } },
    { text: 'Đẩy nhánh lên GitHub: `git push -u origin feat/ci-upgrade`.', hint: 'git push -u origin feat/ci-upgrade', check: function (s) { return !!CI.R(s).pushed['feat/ci-upgrade']; } },
    { text: 'Xem `gh run list`: push lên nhánh này KHÔNG sinh lần chạy mới (ci.yml chỉ lọc main, matrix.yml chỉ chạy với pull_request).', hint: 'gh run list', check: function (s) { return CI.runCount(s) === 1 && after(s, /^git push/, /^gh run list/); } },
    { text: 'Mở pull request: `gh pr create --title "Nâng cấp CI"`. Sự kiện pull_request kích hoạt `matrix.yml`.', hint: 'gh pr create --title "Nâng cấp CI"', check: function (s) { return CI.st(s).prs.length >= 1 && hasRun(s, 'pull_request'); } },
    { text: 'Xem kết quả kiểm tra của PR bằng `gh pr checks`.', hint: 'gh pr checks', check: OK(/^gh pr checks/) },
    { text: 'Quay về nhánh chính: `git switch main`.', hint: 'git switch main', check: function (s) { return CI.R(s).branch === 'main' && OK(/^git switch main$/)(s); } },
    { text: 'Chạy tay workflow đêm bằng `gh workflow run nightly.yml`.', hint: 'gh workflow run nightly.yml', check: function (s) { return hasRun(s, 'workflow_dispatch'); } },
    { text: 'Xem lại `gh run list`: có lần chạy với sự kiện `workflow_dispatch`.', hint: 'gh run list', check: function (s) { return hasRun(s, 'workflow_dispatch') && after(s, /^gh workflow run/, /^gh run list/); } }
  ]
};

T.debugs = [
  {
    id: 'ci2d1', title: 'Bước publish lỗi vì secret rỗng',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view --log-failed', 'publish / Run npm publish --dry-run: ##[error]Secret NPM_TOKEN is empty. Hãy thêm secret: gh secret set NPM_TOKEN', '$ gh secret list', '(trống)'),
    story: 'Workflow Publish chạy ngon ở máy bạn, nhưng trên GitHub bước `npm publish` lỗi. Workflow dùng ${{ secrets.NPM_TOKEN }} mà bạn chưa tạo secret này.',
    goal: 'Secret `NPM_TOKEN` đã được tạo, workflow chạy lại và lần chạy mới nhất thành công.',
    hints: ['`gh secret list` cho biết repo đã có secret nào.', 'Secret chưa tồn tại thì ${{ secrets.NPM_TOKEN }} thành chuỗi rỗng, bước dùng nó sẽ lỗi.', 'Tạo secret bằng `gh secret set NPM_TOKEN --body "..."` rồi chạy lại bằng `gh run rerun`.'],
    fix: ['gh secret set NPM_TOKEN --body "npm_demo_token"', 'gh run rerun', 'gh run view'],
    cause: 'Secret là cấu hình nằm ngoài code. Workflow tham chiếu một secret chưa tạo không báo lỗi cú pháp, chỉ lỗi lúc bước đó chạy. Luôn tạo secret trước khi push workflow cần nó.',
    setup: function (s) { CI.repo(s, { yml: PUBLISH, file: 'publish.yml' }); },
    check: function (s) { return !!CI.st(s).secrets.NPM_TOKEN && CI.runCount(s) >= 2 && CI.greenLast(s); }
  },
  {
    id: 'ci2d2', title: 'Sửa package.json mà CI không chạy',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ git log --oneline -2', 'a41f0c2 (HEAD -> main) Nâng phiên bản lên 1.4.3', 'c93b7d1 Khởi tạo dự án và workflow CI', '$ gh run list', '(chỉ có lần chạy cũ của commit đầu tiên)'),
    story: 'Bạn nâng phiên bản trong `package.json` rồi push, nhưng GitHub không chạy CI cho commit mới. Workflow có `paths` chỉ gồm `src/**`.',
    goal: 'Workflow lọc cả `package.json` trong `paths`; sau khi push, có lần chạy mới thành công.',
    hints: ['Đọc phần `on.push.paths` trong `ci.yml`: commit mới chỉ đổi `package.json`.', 'Khi có `paths`, workflow chỉ chạy nếu commit đụng tới file khớp mẫu. `package.json` không khớp `src/**`.', 'Thêm `package*.json` và chính file workflow vào `paths`, commit, push.'],
    fix: [C.HCU(WF + 'ci.yml', pathsYml("['src/**', 'package*.json', '.github/workflows/**']")), 'git add .', 'git commit -m "Thêm package.json vào paths"', 'git push', 'gh run list'],
    cause: '`paths` là bộ lọc chặt: không file nào trong commit khớp thì workflow bị bỏ qua, và không có thông báo nào. Hãy luôn đưa file định nghĩa thư viện và chính file workflow vào danh sách.',
    setup: function (s) { CI.repo(s, { yml: pathsYml("['src/**']"), after: ["sed -i 's#\"version\": \"1.4.2\"#\"version\": \"1.4.3\"#' package.json", 'git commit -am "Nâng phiên bản lên 1.4.3"', 'git push'] }); },
    check: function (s) { return CI.runCount(s) >= 2 && CI.greenLast(s) && CI.headHas(s, WF + 'ci.yml', /package\*?\.json/); }
  },
  {
    id: 'ci2d3', title: 'needs trỏ tới job không tồn tại',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ actionlint', '.github/workflows/ci.yml:13:12: job "build" needs job "tests" which does not exist in this workflow [job-needs]'),
    story: 'Bạn thêm job `build` chạy sau `test` nhưng gõ `needs: tests`. Lần chạy đỏ ngay lập tức, không job nào chạy.',
    goal: '`actionlint` sạch lỗi; workflow đã sửa được push và lần chạy mới nhất thành công.',
    hints: ['Chạy `actionlint` để thấy lỗi ở dòng 13.', 'Tên trong `needs` phải trùng khít id của job, ở đây là `test` (không có chữ s).', 'Sửa thành `needs: test`, `actionlint` cho sạch, commit và push.'],
    fix: [C.HCU(WF + 'ci.yml', NEEDSOK), 'actionlint', 'git add .', 'git commit -m "Sửa needs"', 'git push'],
    cause: '`needs` dùng id của job (khoá dưới `jobs:`), không phải tên hiển thị. Sai id thì cả workflow bị coi là không hợp lệ và không job nào được phép chạy.',
    setup: function (s) { CI.repo(s, { yml: NEEDSBAD }); },
    check: function (s) { return CI.lint(s, 'ci.yml') && CI.greenLast(s); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
