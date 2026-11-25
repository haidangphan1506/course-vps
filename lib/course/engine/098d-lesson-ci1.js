(function (G) {
'use strict';
/* Chương ci1: GitHub Actions cơ bản, workflow CI đầu tiên. */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI, GH = C.GH;
function after(s, a, b) { var ia = -1, ib = -1; s.hist.forEach(function (h, i) { if (a.test(h.cmd)) ia = i; if (b.test(h.cmd) && h.code === 0) ib = i; }); return ia >= 0 && ib > ia; }
var F = '.github/workflows/ci.yml';
var T = {
  id: 'ci1', group: CI.GROUP, short: 'Actions cơ bản',
  title: 'GitHub Actions cơ bản: viết workflow CI đầu tiên',
  dek: 'CI/CD là gì, một workflow gồm on, jobs, steps; viết ci.yml chạy test mỗi lần push, kiểm tra bằng actionlint, đẩy lên GitHub và đọc kết quả bằng gh. Nền tảng cho cả loạt bài CI/CD.'
};
C.lessons.push(T);

T.theory = [
  { tag: 'Khái niệm', title: 'CI/CD là gì và GitHub Actions nằm ở đâu', body: [
    'Mỗi lần bạn push code, một **máy chủ tự động** nên kiểm tra giúp: cài thư viện, chạy test, build. Việc đó gọi là **CI** (Continuous Integration, tích hợp liên tục). Bước tiếp theo, **CD**, là tự động đưa bản đã qua kiểm tra lên server (delivery hoặc deployment).',
    { tbl: [['Thuật ngữ', 'Nghĩa', 'Ví dụ trong khoá này'], ['**Workflow**', 'Một quy trình tự động, mô tả bằng một file YAML', '`.github/workflows/ci.yml`'], ['**Event** (sự kiện)', 'Điều kiện kích hoạt workflow', '`push`, `pull_request`, `schedule`'], ['**Job**', 'Một nhóm bước chạy trên cùng một máy', '`test`, `deploy`'], ['**Step**', 'Một bước trong job: gọi action hoặc chạy lệnh', '`npm ci`, `actions/checkout@v4`'], ['**Runner**', 'Máy ảo chạy job, do GitHub cấp hoặc tự dựng', '`ubuntu-latest`']] },
    { note: 'Mỗi job chạy trên một **máy ảo mới tinh**: chưa có mã nguồn, chưa có Node, chưa có gì của bạn. Vì vậy hầu như workflow nào cũng bắt đầu bằng bước lấy code về (`actions/checkout`) và bước cài công cụ.', kind: 'tip' }
  ] },
  { tag: 'Cú pháp', title: 'Cấu trúc một workflow: on, jobs, steps', body: [
    'Workflow nằm trong thư mục `.github/workflows/` của repo (đuôi `.yml` hoặc `.yaml`). Đây là workflow CI tối thiểu cho dự án Node:',
    { pre: ['name: CI', 'on:', '  push:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '      - run: npm ci', '      - run: npm test'], cap: 'ci.yml: mỗi lần push lên main, cài thư viện và chạy test' },
    { tbl: [['Khoá', 'Ý nghĩa', 'Lưu ý'], ['`name`', 'Tên hiển thị trong tab Actions', 'Không bắt buộc'], ['`on`', 'Sự kiện kích hoạt', 'Không ghi `branches` thì mọi nhánh đều chạy'], ['`jobs.<id>`', 'Danh sách job, chạy song song nếu không có `needs`', 'id chỉ dùng chữ, số, gạch'], ['`runs-on`', 'Loại runner', '`ubuntu-latest` là lựa chọn mặc định hợp lý'], ['`uses`', 'Dùng một action dựng sẵn, ghi kèm phiên bản `@v4`', 'Thiếu phiên bản là lỗi'], ['`run`', 'Chạy lệnh shell', 'Nhiều dòng thì dùng `run: |`'], ['`with`', 'Tham số truyền cho action', '`node-version`, `cache`...']] },
    { note: 'YAML chỉ thụt lề bằng **dấu cách** (thường 2). Một ký tự Tab hoặc thụt lề lệch một cột là đủ để GitHub báo `Invalid workflow file`.', kind: 'warn' }
  ] },
  { tag: 'Quy trình', title: 'Từ máy bạn tới tab Actions', body: [
    'Workflow chỉ chạy khi file đã nằm **trong kho trên GitHub**. Quy trình chuẩn:',
    { ul: ['**1.** Viết hoặc sửa `.github/workflows/ci.yml` trên máy.', '**2.** Kiểm tra cú pháp ngay tại máy bằng `actionlint` (nhanh hơn nhiều so với push rồi chờ).', '**3.** `git add`, `git commit`, `git push`. Sự kiện `push` kích hoạt workflow.', '**4.** Xem kết quả: tab **Actions** trên web, hoặc `gh run list` và `gh run view` ở terminal.', '**5.** Đỏ thì đọc log bằng `gh run view <id> --log-failed`, sửa, push lại.'] },
    { pre: ['git add .github/workflows/ci.yml', 'git commit -m "Thêm workflow CI"', 'git push -u origin main', 'gh run list', 'gh run view --log-failed'], cap: 'Vòng lặp thường ngày' },
    { note: 'Lần đầu `git commit` có thể báo `Author identity unknown`: hãy đặt `git config --global user.name` và `user.email` trước.', kind: 'tip' }
  ] },
  { tag: 'Chẩn đoán', title: 'Bảng triệu chứng hay gặp ở bài này', body: [
    { tbl: [['Triệu chứng', 'Nguyên nhân thường gặp', 'Cách xử lý'], ['Tab Actions trống, không có lần chạy nào', 'File không nằm trong `.github/workflows/` (gõ thiếu chữ s, sai tên thư mục) hoặc chưa push', '`ls -R .github`, chuyển đúng chỗ, commit, push'], ['`Invalid workflow file`', 'Sai YAML: thụt lề, thiếu `runs-on`, `uses` không có phiên bản', '`actionlint` chỉ đúng dòng và cột'], ['Bước `npm ci` báo không tìm thấy `package.json`', 'Thiếu bước `actions/checkout`', 'Thêm `uses: actions/checkout@v4` làm bước đầu tiên'], ['`Missing script: "test"`', '`package.json` chưa có script `test`', 'Thêm `"test"` vào `scripts`'], ['`git commit` báo `Author identity unknown`', 'Chưa đặt tên và email cho git', '`git config --global user.name "..."` và `user.email`']] }
  ] }
];

T.quiz = C.QZ(1, [
  ['File workflow của GitHub Actions nằm ở đâu trong repo?', '`.github/workflows/` (đuôi `.yml` hoặc `.yaml`)', ['`.github/actions/`', '`workflows/` ở thư mục gốc', '`.git/hooks/`'], 'GitHub chỉ quét đúng đường dẫn `.github/workflows/`. Gõ thiếu chữ s hoặc đặt sai chỗ thì workflow âm thầm không chạy.'],
  ['Mỗi job của workflow chạy trên môi trường nào?', 'Một máy ảo (runner) mới tinh, tạo riêng cho job đó', ['Chính VPS của bạn', 'Máy tính của người vừa push', 'Một container dùng chung, giữ nguyên file giữa các lần chạy'], 'Runner không nhớ gì từ lần trước, nên cần `checkout` để lấy code và cài lại công cụ ở mỗi lần chạy.'],
  ['`on: push: branches: [main]` có nghĩa là gì?', 'Chỉ chạy khi có commit được push lên nhánh main', ['Chạy mỗi khi có pull request vào main', 'Chạy khi tạo mới nhánh main', 'Chạy khi push lên bất kỳ nhánh nào'], 'Bỏ phần `branches` thì mọi nhánh đều kích hoạt. Muốn chạy cả pull request, thêm khoá `pull_request`.'],
  ['Khác nhau giữa `uses` và `run` trong một step?', '`uses` gọi một action dựng sẵn, `run` chạy lệnh shell', ['`uses` chạy lệnh trên VPS, `run` chạy trên runner', 'Hai khoá giống nhau, chỉ khác tên', '`uses` chỉ dùng được ở đầu file'], 'Ví dụ `uses: actions/checkout@v4` lấy code, còn `run: npm test` chạy lệnh test.'],
  ['Vì sao hầu hết workflow bắt đầu bằng `actions/checkout`?', 'Runner mới tinh chưa có mã nguồn, checkout kéo code của repo về', ['Để cấp quyền ghi cho runner', 'Để cài Node.js', 'Để tắt kiểm tra bảo mật'], 'Thiếu bước này, các lệnh như `npm ci` sẽ báo không tìm thấy `package.json`.'],
  ['Push xong, GitHub báo `Invalid workflow file`. Nguyên nhân thường gặp nhất?', 'Lỗi cú pháp YAML hoặc thiếu khoá bắt buộc như `runs-on`', ['Runner hết bộ nhớ', 'Repo bị khoá', 'Test bị lỗi'], 'Đây là lỗi **trước khi** job bắt đầu chạy. Chạy `actionlint` ở máy để thấy đúng dòng và cột lỗi.'],
  ['Vì sao phải ghi phiên bản như `actions/checkout@v4`?', 'Cố định phiên bản action để kết quả lặp lại được; thiếu phiên bản là lỗi', ['Để action chạy nhanh hơn', 'Để dùng được bản mới nhất mọi lúc', 'Vì GitHub tính tiền theo phiên bản'], 'Không cố định phiên bản thì một bản phát hành mới của action có thể làm hỏng pipeline mà bạn không đổi gì.'],
  ['Ký tự nào KHÔNG được dùng để thụt lề trong YAML?', 'Ký tự Tab; chỉ dùng dấu cách (thường 2 dấu cách mỗi cấp)', ['Dấu cách', 'Hai dấu cách', 'Bốn dấu cách'], 'Trình soạn thảo hay tự chèn Tab. Bật hiển thị ký tự trắng hoặc để `actionlint` bắt lỗi.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.base(s); },
  items: [
    { text: 'Bạn đang ở thư mục dự án `tutor-api`. Biến nó thành kho git bằng `git init`.', hint: 'git init', check: function (s) { return OK(/^git init$/)(s) && !!s.fs.get(CI.proj(s) + '/.git'); } },
    { text: 'Đặt tên cho git: `git config --global user.name "Dang Phan"`.', hint: 'git config --global user.name "Dang Phan"', check: function (s) { return !!GH.state(s).cfg['user.name']; } },
    { text: 'Đặt email cho git: `git config --global user.email "dang@haiphan.org"`.', hint: 'git config --global user.email "dang@haiphan.org"', check: function (s) { return !!GH.state(s).cfg['user.email']; } },
    { text: 'Xem trạng thái kho bằng `git status` (mọi file đang là untracked).', hint: 'git status', check: OK(/^git status$/) },
    { text: 'Tạo thư mục `.github/workflows` (nhớ chữ s).', hint: 'mkdir -p .github/workflows', check: function (s) { return s.fs.isD(CI.proj(s) + '/.github/workflows'); } },
    { text: 'Tạo `.github/workflows/ci.yml`: chạy khi push lên main; job `test` trên `ubuntu-latest` gồm checkout@v4, setup-node@v4 (node 22), `npm ci`, `npm test`.', hint: C.HCU(F, CI.BASIC), check: function (s) { var d = CI.doc(s, 'ci.yml'), j = CI.job(s, 'ci.yml', 'test'); return !!d && CI.onKeys(d).indexOf('push') >= 0 && !!j && j['runs-on'] === 'ubuntu-latest' && CI.uses(j, /^actions\/checkout@v4$/) && CI.runs(j, /npm test/); } },
    { text: 'Kiểm tra workflow bằng `actionlint` (không in gì nghĩa là đạt).', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'ci.yml'); } },
    { text: 'Cố ý làm hỏng: bỏ `@v4` khỏi dòng `actions/checkout` bằng `sed -i`.', hint: "sed -i 's#actions/checkout@v4#actions/checkout#' .github/workflows/ci.yml", check: function (s) { var t = ftxt(s, CI.wfPath(s, 'ci.yml')); return /actions\/checkout\s*$/m.test(t); } },
    { text: 'Chạy `actionlint` và đọc lỗi (nó chỉ ra dòng, cột và lý do).', hint: 'actionlint', check: function (s) { return CI.anyFail(s, /^actionlint$/); } },
    { text: 'Sửa lại: thêm `@v4` vào `actions/checkout` bằng `sed -i`.', hint: "sed -i 's#uses: actions/checkout$#uses: actions/checkout@v4#' .github/workflows/ci.yml", check: function (s) { return CI.anyFail(s, /^actionlint$/) && /actions\/checkout@v4/.test(ftxt(s, CI.wfPath(s, 'ci.yml'))); } },
    { text: 'Chạy `actionlint` lần nữa cho tới khi sạch lỗi.', hint: 'actionlint', check: function (s) { return CI.anyFail(s, /^actionlint$/) && CI.lastOK(s, /^actionlint$/) && CI.lint(s, 'ci.yml'); } },
    { text: 'Đưa mọi file vào vùng staging bằng `git add .`.', hint: 'git add .', check: OK(/^git add (\.|-A|--all)$/) },
    { text: 'Commit với thông điệp `Thêm workflow CI`.', hint: 'git commit -m "Thêm workflow CI"', check: function (s) { return OK(/^git commit /)(s) && CI.headHas(s, F, /runs-on: ubuntu-latest/); } },
    { text: 'Nối kho với GitHub: `git remote add origin git@github.com:haidangphan1506/course-vps.git`.', hint: 'git remote add origin ' + CI.REMOTE, check: function (s) { var R = CI.R(s); return !!R.remote && R.remote.url === CI.REMOTE; } },
    { text: 'Đẩy lên GitHub: `git push -u origin main`. Sự kiện push kích hoạt workflow.', hint: 'git push -u origin main', check: function (s) { return OK(/^git push /)(s) && CI.runCount(s) >= 1; } },
    { text: 'Xem danh sách các lần chạy bằng `gh run list`.', hint: 'gh run list', check: function (s) { return OK(/^gh run list/)(s) && CI.runCount(s) >= 1; } },
    { text: 'Xem chi tiết lần chạy gần nhất bằng `gh run view` (job `test` và từng step).', hint: 'gh run view', check: OK(/^gh run view/) },
    { text: 'Đổi tên workflow thành `CI tutor-api` bằng `sed -i`.', hint: "sed -i 's#^name: CI$#name: CI tutor-api#' .github/workflows/ci.yml", check: function (s) { return /^name: CI tutor-api$/m.test(ftxt(s, CI.wfPath(s, 'ci.yml'))); } },
    { text: 'Commit nhanh file đã theo dõi bằng `git commit -am`, thông điệp `Đổi tên workflow`.', hint: 'git commit -am "Đổi tên workflow"', check: function (s) { return CI.R(s).commits.length >= 2 && CI.headHas(s, F, /name: CI tutor-api/); } },
    { text: 'Đẩy lần hai bằng `git push`, rồi xem lại `gh run list`: phải có hai lần chạy.', hint: 'git push\ngh run list', check: function (s) { return CI.runCount(s) >= 2 && after(s, /^git push/, /^gh run list/); } }
  ]
};

T.debugs = [
  {
    id: 'ci1d1', title: 'Push rồi mà tab Actions trống',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ git push', ' * [new branch]      main -> main', '$ gh run list', '(không có lần chạy nào)', '$ ls -R .github', '.github/workflow:', 'ci.yml'),
    story: 'Bạn viết `ci.yml` cẩn thận, commit và push thành công, nhưng GitHub không chạy gì cả. Trong tab Actions cũng không thấy workflow nào.',
    goal: '`ci.yml` nằm đúng `.github/workflows/`, đã commit và push, và lần chạy mới nhất của CI thành công.',
    hints: ['Xem cây thư mục bằng `ls -R .github`. Tên thư mục có đúng không?', 'GitHub chỉ đọc `.github/workflows/` (có chữ s). Thư mục `workflow` bị bỏ qua hoàn toàn.', 'Tạo thư mục đúng, `mv` file sang, `git add -A`, commit, push, rồi `gh run list`.'],
    fix: ['mkdir -p .github/workflows', 'mv .github/workflow/ci.yml .github/workflows/ci.yml', 'git add -A', 'git commit -m "Chuyển ci.yml vào đúng thư mục"', 'git push', 'gh run list'],
    cause: 'GitHub chỉ quét đường dẫn chính xác `.github/workflows/`. File ở `.github/workflow/` chỉ là một file YAML bình thường, không sinh lỗi mà cũng không chạy.',
    setup: function (s) { CI.base(s); CI.runq(s, ['git init', 'git config --global user.name "Dang Phan"', 'git config --global user.email "dang@haiphan.org"', 'mkdir -p .github/workflow', C.HCU('.github/workflow/ci.yml', CI.BASIC), 'git add .', 'git commit -m "Thêm workflow CI"', 'git remote add origin ' + CI.REMOTE, 'git push -u origin main']); },
    check: function (s) { return CI.R(s).head[F] != null && CI.greenLast(s); }
  },
  {
    id: 'ci1d2', title: 'Invalid workflow file',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view', 'X main CI · 9100', 'X Invalid workflow file', '  Invalid workflow file: .github/workflows/ci.yml:6:3: "runs-on" section is missing in job "test" [syntax-check]'),
    story: 'Vừa push, lần chạy đỏ ngay lập tức mà không có job nào kịp chạy. Log chỉ nói file workflow không hợp lệ.',
    goal: '`actionlint` không còn lỗi, workflow đã sửa được push và lần chạy mới nhất thành công.',
    hints: ['Chạy `actionlint` ngay trong thư mục dự án: nó chỉ ra dòng 6 và job `test`.', 'Job thiếu khoá `runs-on`, nên GitHub không biết chạy trên máy nào.', 'Viết lại `ci.yml` có `runs-on: ubuntu-latest`, kiểm tra bằng `actionlint`, commit, push.'],
    fix: [C.HCU(F, CI.BASIC), 'actionlint', 'git add .', 'git commit -m "Thêm runs-on cho job test"', 'git push'],
    cause: 'Mỗi job (trừ job gọi reusable workflow) bắt buộc có `runs-on`. Thiếu khoá bắt buộc là lỗi cấu trúc, GitHub từ chối cả file trước khi chạy bất kỳ bước nào.',
    setup: function (s) { var bad = CI.BASIC.filter(function (l) { return l.indexOf('runs-on') < 0; }); CI.repo(s, { yml: bad }); },
    check: function (s) { return CI.lint(s, 'ci.yml') && CI.greenLast(s); }
  },
  {
    id: 'ci1d3', title: 'npm không tìm thấy package.json',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view --log-failed', 'test / Run npm ci: ##[error]npm error code ENOENT: no such file or directory, open \'package.json\'. Thiếu bước actions/checkout trước bước này.'),
    story: 'Máy bạn chạy `npm ci` bình thường, nhưng trên GitHub bước này lỗi ENOENT ngay lập tức.',
    goal: 'Workflow có bước `actions/checkout@v4` trước `npm ci`, đã push và lần chạy mới nhất thành công.',
    hints: ['Đọc log lỗi: runner báo không có `package.json` ở thư mục làm việc.', 'Runner là máy ảo mới, chưa có mã nguồn của repo.', 'Thêm `- uses: actions/checkout@v4` làm step đầu tiên của job, commit và push.'],
    fix: [C.HCU(F, CI.BASIC), 'git add .', 'git commit -m "Thêm bước checkout"', 'git push'],
    cause: 'Job chạy trên VM trống. Không có `actions/checkout` thì thư mục làm việc rỗng, mọi lệnh cần file của dự án đều lỗi. Checkout luôn phải đứng trước các bước dùng code.',
    setup: function (s) { var bad = CI.BASIC.filter(function (l) { return l.indexOf('actions/checkout') < 0; }); CI.repo(s, { yml: bad }); },
    check: function (s) { return CI.greenLast(s) && CI.headHas(s, F, /actions\/checkout@v4/); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
