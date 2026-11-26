(function (G) {
'use strict';
/* Chương ci7: CI nâng cao: matrix, cổng coverage, concurrency, timeout, test không ổn định và bảo vệ nhánh. */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI;
var WF = '.github/workflows/';
var T = {
  id: 'ci7', group: CI.GROUP, short: 'Nâng cao: matrix và coverage',
  title: 'CI nâng cao: matrix, cổng coverage và bảo vệ nhánh',
  dek: 'Chạy nhiều phiên bản Node song song bằng matrix, đặt cổng coverage cho test, chống treo và chồng lần chạy, xử lý test flaky đúng cách, và bắt PR phải xanh mới được merge.'
};
C.lessons.push(T);

var CI7 = ['name: CI', 'on:', '  pull_request:', '  push:', '    branches: [main]', 'concurrency:', '  group: ci-${{ github.ref }}', '  cancel-in-progress: true', 'permissions:', '  contents: read', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    timeout-minutes: 10', '    strategy:', '      fail-fast: false', '      matrix:', '        node: [20, 22]', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: ${{ matrix.node }}', '          cache: npm', '      - run: npm ci', '      - name: Test có coverage', '        run: npm run test:coverage', '      - uses: actions/upload-artifact@v4', '        if: always()', '        with:', '          name: coverage-node-${{ matrix.node }}', '          path: coverage/', '          retention-days: 7'];
var PKG7 = ['{', '  "name": "tutor-api",', '  "version": "1.4.2",', '  "scripts": {', '    "start": "node src/app.js",', '    "test": "node --test",', '    "test:coverage": "c8 --check-coverage --lines 80 node --test"', '  }', '}'];
function job7(s) { return CI.job(s, 'ci.yml', 'test'); }

T.theory = [
  { tag: 'Matrix', title: 'Matrix: chạy một job cho nhiều phiên bản', body: [
    'Thay vì viết lặp nhiều job, khai báo `strategy.matrix`. GitHub nhân job lên theo từng giá trị và chạy song song:',
    { pre: ['jobs:', '  test:', '    runs-on: ubuntu-latest', '    strategy:', '      fail-fast: false', '      matrix:', '        node: [20, 22]', '    steps:', '      - uses: actions/setup-node@v4', '        with:', '          node-version: ${{ matrix.node }}'], cap: 'Hai job: một cho Node 20, một cho Node 22' },
    { tbl: [['Khoá', 'Ý nghĩa'], ['`fail-fast: true` (mặc định)', 'Một job đỏ thì huỷ các job còn lại. Nhanh nhưng che mất lỗi ở phiên bản khác'], ['`fail-fast: false`', 'Để mọi tổ hợp chạy xong, thấy đủ bức tranh'], ['`include` / `exclude`', 'Thêm hoặc bỏ một tổ hợp cụ thể'], ['`max-parallel`', 'Giới hạn số job chạy cùng lúc']] }
  ] },
  { tag: 'Coverage', title: 'Cổng coverage: đặt ngưỡng để CI tự chặn', body: [
    'Coverage đo tỉ lệ dòng code được test chạy qua. Biến nó thành cổng: dưới ngưỡng thì job đỏ. Công cụ `c8` làm việc này với hầu hết chương trình Node:',
    { pre: ['"scripts": {', '  "test": "node --test",', '  "test:coverage": "c8 --check-coverage --lines 80 node --test"', '}'], cap: 'Dưới 80% số dòng thì lệnh thoát lỗi' },
    { note: 'Đừng đặt ngưỡng cao đột ngột. Đo mức hiện tại rồi đặt ngưỡng ngay dưới mức đó, sau đó tăng dần (cơ chế "ratchet"). Coverage cao mà test yếu vẫn là vô nghĩa.', kind: 'tip' }
  ] },
  { tag: 'Vận hành', title: 'Timeout, concurrency và quyền tối thiểu', body: [
    { tbl: [['Cấu hình', 'Tác dụng', 'Khi nào dùng'], ['`timeout-minutes: 10`', 'Ngắt job treo (mặc định 360 phút)', 'Mọi job'], ['`concurrency` + `cancel-in-progress: true`', 'Push mới huỷ lần chạy cũ cùng nhánh', 'CI của PR và nhánh'], ['`cancel-in-progress: false`', 'Không huỷ lần đang chạy dở', 'Deploy production'], ['`permissions: contents: read`', 'Giới hạn GITHUB_TOKEN chỉ đọc code', 'Mặc định cho mọi workflow']] },
    { note: 'Với job `if: always()` gửi báo cáo coverage, dùng nó để artifact vẫn được lưu kể cả khi test đỏ. Đó là lúc bạn cần báo cáo nhất.', kind: 'tip' }
  ] },
  { tag: 'Flaky', title: 'Test không ổn định (flaky): tìm nguyên nhân, đừng chạy lại mù quáng', body: [
    'Test flaky là test lúc đỏ lúc xanh dù code không đổi. Nguyên nhân hay gặp:',
    { ul: ['**Chờ bằng thời gian cố định** (`setTimeout 500ms`) thay vì chờ điều kiện.', '**Dùng chung state** giữa các test (biến toàn cục, file tạm trùng tên).', '**Phụ thuộc mạng hoặc dịch vụ ngoài** không ổn định.', '**Phụ thuộc thứ tự** chạy hoặc thời gian hiện tại.'] },
    { note: 'Tránh bật "chạy lại tự động" cho toàn bộ test: nó che lỗi thật. Nếu bắt buộc tạm cách ly một test, tách thành job riêng với continue-on-error và ghi rõ hạn sửa, đồng thời mở issue theo dõi.', kind: 'warn' }
  ] },
  { tag: 'Bảo vệ nhánh', title: 'Bắt PR phải xanh mới được merge', body: [
    'Trong cài đặt repo (Settings, Rulesets hoặc Branch protection) bật **Required status checks**, chọn đúng **tên job** (ví dụ `test`, `typecheck`). PR chưa có các check này xanh thì không merge được.',
    { ul: ['Tên check là tên **job** (hoặc tên của check run), nên đặt tên ổn định và đừng đổi tuỳ tiện.', 'Job bị skipped không được coi là xanh. Hãy kiểm tra cấu hình needs và if.', 'Chỉ cấp quyền admin cho người thật sự cần, và không cho bỏ qua check trong trường hợp thường.'] }
  ] }
];

T.quiz = C.QZ(7, [
  ['`strategy.matrix` với `node: [20, 22]` tạo ra bao nhiêu job?', 'Hai job, mỗi job chạy một phiên bản Node', ['Một job chạy hai lần liên tiếp', 'Bốn job vì nhân đôi tự động', 'Một job có hai runner dùng chung'], 'GitHub nhân job lên theo từng giá trị trong matrix, các job chạy song song.'],
  ['Vì sao nên đặt `fail-fast: false` khi dùng matrix?', 'Để mọi phiên bản chạy xong, không để một lỗi che mất lỗi ở phiên bản khác', ['Để job nhanh hơn trong mọi trường hợp', 'Để bỏ qua test', 'Để tiết kiệm secret'], 'Mặc định fail-fast huỷ các job khác khi một job đỏ, nên bạn có thể không biết lỗi ở phiên bản nào khác.'],
  ['`c8 --check-coverage --lines 80` làm gì khi coverage dòng là 62%?', 'Lệnh thoát với mã lỗi, job đỏ', ['Chỉ in cảnh báo rồi xanh', 'Tự viết thêm test', 'Bỏ qua file thiếu coverage'], 'Cổng coverage biến một con số thành điều kiện đỗ/trượt của CI.'],
  ['`concurrency` với `cancel-in-progress: true` phù hợp nhất với loại workflow nào?', 'CI của PR và nhánh, để kết quả luôn là của commit mới nhất', ['Deploy production đang chạy dở', 'Workflow chỉ chạy một lần mỗi năm', 'Job đăng ký khoá SSH'], 'Với deploy, huỷ giữa chừng có thể để server ở trạng thái nửa cũ nửa mới, nên đặt false.'],
  ['`timeout-minutes: 10` ở job giải quyết vấn đề gì?', 'Job treo không ngốn hết hạn mức 360 phút mặc định', ['Giới hạn số test chạy', 'Tăng tốc npm ci', 'Đặt lại mật khẩu runner'], 'Một job treo vì lỗi mạng hoặc vòng lặp vô hạn sẽ chạy rất lâu nếu không có timeout.'],
  ['Cách xử lý đúng khi một test flaky làm CI đỏ ngẫu nhiên?', 'Tìm nguyên nhân (chờ cố định, state dùng chung, mạng) và sửa, không chạy lại mù quáng', ['Chạy lại workflow cho đến khi xanh rồi thôi', 'Xoá test đó vĩnh viễn', 'Tắt CI trên nhánh main'], 'Chạy lại liên tục che lỗi thật và làm mất niềm tin vào CI.'],
  ['Vì sao cần bật "Required status checks" cho nhánh main?', 'Để PR không merge được khi các job bắt buộc chưa xanh', ['Để GitHub tự sửa lỗi test', 'Để tăng số runner miễn phí', 'Để xoá lịch sử commit'], 'Cổng này biến CI từ thông báo thành điều kiện thật của việc merge.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.repo(s); },
  items: [
    { text: 'Ghi `.github/workflows/ci.yml` (heredoc): PR và push vào main; `concurrency` theo `ci-${{ github.ref }}` với `cancel-in-progress: true`; job `test` có `timeout-minutes: 10`, `fail-fast: false`, matrix `node: [20, 22]`, bước upload coverage có `if: always()`.', hint: C.HCU(WF + 'ci.yml', CI7), check: function (s) { var d = CI.doc(s, 'ci.yml'), j = job7(s); return !!d && !!j && !!d.concurrency && String(d.concurrency['cancel-in-progress']) === 'true' && j['timeout-minutes'] === 10 && !!j.strategy && String(j.strategy['fail-fast']) === 'false' && Array.isArray(j.strategy.matrix.node) && j.strategy.matrix.node.length === 2; } },
    { text: 'Ghi `package.json` (heredoc) với script `test:coverage` là `c8 --check-coverage --lines 80 node --test`, giữ `test`.', hint: C.HCU('package.json', PKG7), check: function (s) { var t = ftxt(s, CI.proj(s) + '/package.json'); return /"test:coverage"\s*:\s*"c8 --check-coverage --lines 80/.test(t) && /"test"\s*:\s*"node --test"/.test(t); } },
    { text: 'Kiểm tra workflow bằng `actionlint`, không lỗi thì mới được push.', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'ci.yml'); } },
    { text: 'Commit tất cả với `Thêm matrix, cổng coverage và concurrency`, rồi `git push`.', hint: 'git add .\ngit commit -m "Thêm matrix, cổng coverage và concurrency"\ngit push', check: function (s) { return OK(/^git push/)(s) && CI.runCount(s) >= 2; } },
    { text: 'Lần chạy mới nhất phải xanh. Xem bằng `gh run list`.', hint: 'gh run list', check: function (s) { return CI.greenLast(s) && OK(/^gh run list/)(s); } },
    { text: 'Thử cổng coverage: thêm vào job `test`, trước bước upload, một bước `run: echo "Coverage lines 62% < 80%" && exit 1` (heredoc ghi lại file). Đây là mô phỏng khi c8 báo thiếu coverage.', hint: C.HCU(WF + 'ci.yml', CI7.slice(0, CI7.indexOf('      - uses: actions/upload-artifact@v4')).concat(['      - run: echo "Coverage lines 62% < 80%" && exit 1'], CI7.slice(CI7.indexOf('      - uses: actions/upload-artifact@v4'))), ), check: function (s) { return /62%/.test(ftxt(s, CI.wfPath(s, 'ci.yml'))); } },
    { text: 'Commit `Thử cổng coverage` bằng `git commit -am`, push, rồi xem kết quả: lần chạy phải đỏ.', hint: 'git commit -am "Thử cổng coverage"\ngit push\ngh run list', check: function (s) { return CI.lastRun(s) && CI.lastRun(s).conclusion === 'failure' && OK(/^gh run list/)(s); } },
    { text: 'Đọc log lỗi bằng `gh run view --log-failed`.', hint: 'gh run view --log-failed', check: function (s) { return s.hist.some(function (h) { return /--log-failed/.test(h.cmd); }); } },
    { text: 'Gỡ bước thử đó: ghi lại ci.yml không có dòng `62%` (heredoc giống bước trước nhưng bỏ bước echo), commit `Gỡ bước thử coverage`, push.', hint: C.HCU(WF + 'ci.yml', CI7) + '\ngit commit -am "Gỡ bước thử coverage"\ngit push', check: function (s) { return !/62%/.test(ftxt(s, CI.wfPath(s, 'ci.yml'))) && CI.greenLast(s); } },
    { text: 'Kiểm tra lại workflow bằng `actionlint` lần cuối.', hint: 'actionlint', check: function (s) { return CI.lastOK(s, /^actionlint$/) && CI.lint(s, 'ci.yml'); } }
  ]
};

T.debugs = [
  {
    id: 'ci7d1', title: 'Một phiên bản Node đỏ, phiên bản kia bị huỷ',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view', 'X CI · 9130', '  X test (20)  in 38s', '  - test (22)  cancelled', '(fail-fast đang bật: job Node 22 bị huỷ trước khi chạy xong)'),
    story: 'Test trên Node 20 đỏ, nên job Node 22 bị huỷ giữa chừng. Nhóm không biết Node 22 có lỗi hay không.',
    goal: 'Matrix có fail-fast: false để mọi phiên bản chạy xong, và lần chạy mới nhất xanh.',
    hints: ['Tìm khoá strategy trong job test.', 'Mặc định fail-fast là true, nó huỷ các job còn lại khi một job đỏ.', 'Thêm `fail-fast: false` dưới strategy, commit và push.'],
    fix: [C.HCU(WF + 'ci.yml', CI7), 'git commit -am "Thêm fail-fast false"', 'git push'],
    cause: 'Với matrix, fail-fast mặc định là true. Khi một tổ hợp đỏ, các tổ hợp khác bị huỷ, bạn mất thông tin về những phiên bản còn lại.',
    setup: function (s) { CI.repo(s, { yml: CI7.filter(function (l) { return l.indexOf('fail-fast') < 0; }) }); },
    check: function (s) { var j = job7(s); return !!j && !!j.strategy && String(j.strategy['fail-fast']) === 'false' && CI.greenLast(s); }
  },
  {
    id: 'ci7d2', title: 'Job treo suốt 6 tiếng',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view', 'X CI · 9131', '  X test (22) in 6h 0m', 'The job has exceeded the maximum execution time of 360 minutes.'),
    story: 'Một test mở kết nối mạng và không đóng. Job chạy đúng 360 phút rồi bị GitHub ngắt, tốn hết phút miễn phí trong tháng.',
    goal: 'Job test có timeout-minutes để không bao giờ chạy quá lâu, và lần chạy mới nhất xanh.',
    hints: ['Mặc định một job được chạy tối đa 360 phút.', 'Thêm khoá timeout-minutes ở cấp job, ví dụ 10 phút cho test.', 'Sửa ci.yml, commit và push.'],
    fix: [C.HCU(WF + 'ci.yml', CI7), 'git commit -am "Thêm timeout cho job test"', 'git push'],
    cause: 'Không có timeout, một job treo có thể chạy đến giới hạn mặc định 360 phút. Timeout ngắn hơn bảo vệ hạn mức và giúp phát hiện treo sớm.',
    setup: function (s) { CI.repo(s, { yml: CI7.filter(function (l) { return l.indexOf('timeout-minutes') < 0; }) }); },
    check: function (s) { var j = job7(s); return !!j && typeof j['timeout-minutes'] === 'number' && j['timeout-minutes'] <= 60 && CI.greenLast(s); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
