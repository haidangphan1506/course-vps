(function (G) {
'use strict';
/* Chương ci5: viết test tự động và đưa vào CI (node:test, npm test, đọc lỗi test trong log). */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI;
var WF = '.github/workflows/';
var T = {
  id: 'ci5', group: CI.GROUP, short: 'Viết test tự động',
  title: 'Viết test tự động và đưa vào CI',
  dek: 'Vì sao cần test, phân loại unit/integration/e2e, viết test đầu tiên bằng node:test, đặt test vào workflow đúng thứ tự, và đọc log khi test đỏ.'
};
C.lessons.push(T);

var SUM = ['function sum(a, b) {', '  return a + b;', '}', '', 'module.exports = { sum };'];
var SUM_TEST = ["const test = require('node:test');", "const assert = require('node:assert/strict');", "const { sum } = require('./sum');", '', "test('sum cộng hai số dương', () => {", '  assert.equal(sum(2, 3), 5);', '});', '', "test('sum với số âm', () => {", '  assert.equal(sum(-1, 1), 0);', '});'];

T.theory = [
  { tag: 'Khái niệm', title: 'Vì sao cần test và test nằm ở đâu trong pipeline', body: [
    'Test là đoạn code **kiểm tra code khác**: chạy một hành vi, so sánh kết quả với kỳ vọng. Khi test được chạy tự động trong CI, mọi commit đều bị kiểm tra, không cần ai nhớ chạy tay.',
    { tbl: [['Loại test', 'Kiểm tra cái gì', 'Chạy nhanh hay chậm', 'Ví dụ'], ['**Unit**', 'Một hàm hoặc một module, cô lập', 'Rất nhanh (mili-giây)', '`sum(2, 3)` trả về 5'], ['**Integration**', 'Nhiều phần làm việc cùng nhau', 'Vừa (giây)', 'API gọi được database thật'], ['**E2E**', 'Cả hệ thống qua giao diện hoặc HTTP', 'Chậm (phút)', 'Đăng nhập rồi làm bài trên trình duyệt']] },
    { note: 'Nên có **nhiều unit test, vừa phải integration test, ít e2e**. Hình kim tự tháp này giữ cho CI nhanh, và khi đỏ thì biết ngay lỗi ở đâu.', kind: 'tip' }
  ] },
  { tag: 'Viết test', title: 'Viết test đầu tiên bằng node:test', body: [
    'Dự án của khoá này dùng **node:test** có sẵn trong Node 22, không cần cài thêm thư viện. Bước 1: viết hàm cần kiểm tra.',
    { pre: ['// src/sum.js', 'function sum(a, b) {', '  return a + b;', '}', '', 'module.exports = { sum };'], cap: 'src/sum.js: hàm cần kiểm tra' },
    'Bước 2: viết file test. Quy ước: tên kết thúc bằng `.test.js`, để runner tự tìm và chạy.',
    { pre: ["// src/sum.test.js", "const test = require('node:test');", "const assert = require('node:assert/strict');", "const { sum } = require('./sum');", '', "test('sum cộng hai số dương', () => {", '  assert.equal(sum(2, 3), 5);', '});'], cap: 'src/sum.test.js: mỗi test() là một ca kiểm tra' },
    { tbl: [['Thành phần', 'Vai trò'], ['`test(tên, hàm)`', 'Khai báo một ca kiểm tra, tên hiển thị khi lỗi'], ['`assert.equal(thực, kỳ vọng)`', 'Ném lỗi nếu hai giá trị khác nhau; bản `/strict` so sánh cả kiểu'], ['`npm test`', 'Chạy script `"test"` trong package.json, ở đây là `node --test`']] },
    { note: 'Nên viết ít nhất một ca cho trường hợp **biên** (số âm, 0, chuỗi rỗng, giá trị null), không chỉ ca "đường đi đẹp".', kind: 'tip' }
  ] },
  { tag: 'Đọc lỗi', title: 'Test đỏ thì đọc gì trước', body: [
    'Khi `npm test` có ca thất bại, runner in ra tên ca, kỳ vọng và giá trị thực, rồi thoát với mã khác 0. CI thấy mã lỗi nên đánh dấu job **X** và bỏ qua các bước sau.',
    { tbl: [['Dòng trong log', 'Ý nghĩa', 'Việc cần làm'], ['`AssertionError`', 'Giá trị thực khác kỳ vọng', 'So sánh `expected` với `actual`, xem logic hay test sai'], ['`Missing script: "test"`', 'package.json không có script test (hoặc tên bị đổi)', 'Kiểm tra khoá `scripts`'], ['`ERR_MODULE_NOT_FOUND`', 'Require sai đường dẫn hoặc thiếu file', 'Sửa đường dẫn trong `require`'], ['`Process completed with exit code 1`', 'Lệnh cuối trả mã lỗi', 'Xem dòng ngay phía trên để biết lệnh nào']] }
  ] },
  { tag: 'Workflow', title: 'Đặt bước test vào workflow đúng thứ tự', body: [
    'Thứ tự trong job quyết định tốc độ phản hồi: **cài** → **test**. Test thất bại thì các bước phía sau (build, deploy) không chạy, đúng như mong muốn.',
    { pre: ['jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '          cache: npm', '      - name: Cài thư viện', '        run: npm ci', '      - name: Chạy unit test', '        run: npm test'], cap: 'Job test có tên cho từng bước, dễ đọc log' },
    { note: 'Khoá `name:` cho từng step không bắt buộc, nhưng giúp đọc log nhanh hơn nhiều khi job có năm, sáu bước.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Vòng lặp an toàn khi viết test', body: [
    { ul: ['**1.** Viết hàm và test cho hành vi mới, chạy thử cục bộ bằng `npm test`.', '**2.** Commit nhỏ, một thay đổi một commit, để dễ tìm commit gây đỏ.', '**3.** Push, xem `gh run list`. Đỏ thì đọc `gh run view <id> --log-failed` trước khi sửa.', '**4.** Sửa code (hoặc test, nếu chính test sai), push lại, xác nhận xanh.'] },
    { note: 'Đừng xoá hoặc `skip` một test đỏ chỉ để CI xanh. Test đỏ là thông tin quý, hãy sửa nguyên nhân.', kind: 'warn' }
  ] }
];

T.quiz = C.QZ(5, [
  ['Unit test kiểm tra điều gì?', 'Một đơn vị nhỏ như một hàm, tách khỏi database và mạng', ['Cả hệ thống chạy trên trình duyệt', 'Server thật có sẵn dữ liệu production', 'Tốc độ mạng của runner'], 'Unit test chạy nhanh vì không phụ thuộc thành phần bên ngoài. Đó là lý do nên có nhiều unit test nhất.'],
  ['Runner của node:test tự tìm file test theo quy ước nào?', 'Tên kết thúc bằng `.test.js` (hoặc nằm trong thư mục test)', ['Tên bắt đầu bằng `test_` và đuôi `.txt`', 'Mọi file có chữ test trong nội dung', 'Chỉ file nằm ở thư mục gốc'], 'Quy ước đặt tên giúp runner tìm đúng file, không cần khai báo từng file.'],
  ['`assert.equal(sum(2, 3), 6)` thất bại. Điều gì xảy ra trên CI?', 'Lệnh `npm test` trả mã lỗi, job đỏ và các bước sau bị bỏ qua', ['CI tự sửa kỳ vọng thành 5', 'Commit bị xoá', 'Job vẫn xanh vì chỉ là cảnh báo'], 'Mọi ca thất bại đều làm lệnh thoát với mã khác 0. CI dựa vào mã này để quyết định.'],
  ['Vì sao nên đặt bước test trước bước build?', 'Test nhanh và rẻ, lỗi logic được bắt sớm, không phải tốn thời gian build', ['Vì build cần test để chạy', 'Vì GitHub bắt buộc như vậy', 'Để test chạy hai lần'], 'Nguyên tắc fail fast: đặt kiểm tra rẻ và nhanh lên đầu pipeline.'],
  ['Muốn test chạy trên mỗi pull request trước khi merge, dùng trigger nào?', '`pull_request`', ['`workflow_dispatch`', '`schedule`', '`release`'], '`pull_request` chạy khi PR được mở hoặc cập nhật, đúng thời điểm cần chặn lỗi trước khi merge.'],
  ['Test "flaky" là gì?', 'Test lúc pass lúc fail dù code không đổi, thường do thời gian, mạng hoặc dữ liệu dùng chung', ['Test chạy quá lâu', 'Test không có assert', 'Test chỉ chạy trên Windows'], 'Flaky làm mất niềm tin vào CI. Hãy tìm nguyên nhân (chờ cố định, thứ tự chạy, state chung) thay vì chạy lại cho đến khi xanh.'],
  ['Log báo `expected 6, actual 5`. Bước đầu tiên nên làm gì?', 'Xem logic hàm và kỳ vọng của test, xác định bên nào sai rồi mới sửa', ['Tăng timeout của job', 'Xoá ca test đó', 'Đổi runner sang máy mạnh hơn'], 'Chênh lệch giá trị là tín hiệu logic. Không phải lỗi hạ tầng, nên đổi runner không giải quyết gì.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.repo(s); },
  items: [
    { text: 'Tạo `src/sum.js` với hàm `sum(a, b)` và `module.exports = { sum };` (dùng heredoc với `cat >`).', hint: C.HCU('src/sum.js', SUM), check: function (s) { var t = ftxt(s, CI.proj(s) + '/src/sum.js'); return /function sum\(a, b\)/.test(t) && /module\.exports = \{ sum \}/.test(t); } },
    { text: 'Tạo `src/sum.test.js`: `require` node:test và node:assert/strict, kiểm tra `sum(2, 3)` bằng 5 và `sum(-1, 1)` bằng 0.', hint: C.HCU('src/sum.test.js', SUM_TEST), check: function (s) { var t = ftxt(s, CI.proj(s) + '/src/sum.test.js'); return /require\('node:test'\)/.test(t) && /node:assert\/strict/.test(t) && (t.match(/^test\(/gm) || []).length >= 2; } },
    { text: 'Xem trạng thái kho bằng `git status`: hai file mới phải đang là untracked.', hint: 'git status', check: OK(/^git status$/) },
    { text: 'Đưa file vào staging bằng `git add .`, rồi commit với thông điệp `Thêm hàm sum và test`.', hint: 'git add .\ngit commit -m "Thêm hàm sum và test"', check: function (s) { return OK(/^git commit /)(s) && CI.R(s).commits.length >= 2; } },
    { text: 'Đẩy lên GitHub bằng `git push`, rồi xem kết quả bằng `gh run list`.', hint: 'git push\ngh run list', check: function (s) { return CI.runCount(s) >= 2 && OK(/^gh run list/)(s); } },
    { text: 'Lần chạy mới nhất phải xanh (job `test` chạy `npm test` thành công).', hint: 'gh run list', check: function (s) { return CI.greenLast(s); } },
    { text: 'Cố ý làm hỏng: đổi khoá `"test"` trong package.json thành `"tests"`. Ghi lại toàn bộ file bằng heredoc: `cat > package.json`, giữ script `start`.', hint: C.HCU('package.json', ['{', '  "name": "tutor-api",', '  "version": "1.4.2",', '  "scripts": {', '    "start": "node src/app.js",', '    "tests": "node --test"', '  }', '}']), check: function (s) { var t = ftxt(s, CI.proj(s) + '/package.json'); return /"tests"\s*:/.test(t) && !/"test"\s*:/.test(t); } },
    { text: 'Commit thay đổi đó bằng `git commit -am "Đổi tên script test (lỗi cố ý)"`, rồi `git push`.', hint: 'git commit -am "Đổi tên script test (lỗi cố ý)"\ngit push', check: function (s) { return CI.runCount(s) >= 3 && CI.lastRun(s) && CI.lastRun(s).conclusion === 'failure'; } },
    { text: 'Đọc lỗi bằng `gh run view --log-failed`. Log phải nhắc tới `Missing script: "test"`.', hint: 'gh run view --log-failed', check: function (s) { return OK(/^gh run view/)(s) && s.hist.some(function (h) { return /--log-failed/.test(h.cmd); }); } },
    { text: 'Khôi phục khoá `"test": "node --test"` trong package.json (heredoc), commit bằng `git commit -am "Khôi phục script test"`, rồi push.', hint: C.HCU('package.json', ['{', '  "name": "tutor-api",', '  "version": "1.4.2",', '  "scripts": {', '    "start": "node src/app.js",', '    "test": "node --test"', '  }', '}']) + '\ngit commit -am "Khôi phục script test"\ngit push', check: function (s) { return /"test"\s*:\s*"node --test"/.test(ftxt(s, CI.proj(s) + '/package.json')) && CI.greenLast(s); } },
    { text: 'Ghi lại `.github/workflows/ci.yml` với bước đặt tên `name: Chạy unit test` trước `run: npm test` (heredoc), rồi commit và push.', hint: C.HCU(WF + 'ci.yml', ['name: CI', 'on:', '  push:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '          cache: npm', '      - run: npm ci', '      - name: Chạy unit test', '        run: npm test']) + '\ngit commit -am "Đặt tên bước test"\ngit push', check: function (s) { var j = CI.job(s, 'ci.yml', 'test'); return !!j && CI.runs(j, /npm test/) && j.steps.some(function (st) { return st.name === 'Chạy unit test'; }) && CI.greenLast(s); } },
    { text: 'Kiểm tra workflow bằng `actionlint` (không in gì nghĩa là đạt).', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'ci.yml'); } }
  ]
};

T.debugs = [
  {
    id: 'ci5d1', title: 'CI đỏ vì test sai đường dẫn require',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view --log-failed', 'test / Chạy unit test: Error: Cannot find module \'./sun\'', 'Require stack:', '  /home/runner/work/tutor-api/src/sum.test.js', 'Error: process completed with exit code 1.'),
    story: 'Bạn đổi tên `sum.js` thành `sum-utils.js` cho gọn, nhưng quên sửa dòng `require` trong file test. Máy bạn chưa chạy test nên không thấy lỗi.',
    goal: 'File test require đúng module, workflow xanh trở lại.',
    hints: ['Đọc dòng `Cannot find module` và xem tên file thật trong thư mục `src/`.', 'Đường dẫn trong `require` phải khớp tên file (không có đuôi cũng được).', 'Sửa `require(\'./sum\')` cho đúng tên, commit và push.'],
    fix: ["sed -i \"s#require('./sun')#require('./sum-utils')#\" src/sum.test.js", 'git commit -am "Sửa đường dẫn require"', 'git push', 'gh run list'],
    cause: 'Runner không có gì ngoài repo. Đường dẫn sai chỉ lộ ra khi chạy test, nên chạy test cục bộ trước khi push là cách bắt lỗi sớm nhất.',
    setup: function (s) { CI.repo(s, { extraFiles: [['src/sum-utils.js', ['function sum(a, b) { return a + b; }', 'module.exports = { sum };']], ['src/sum.test.js', ["const test = require('node:test');", "const assert = require('node:assert/strict');", "const { sum } = require('./sun');", "test('sum', () => { assert.equal(sum(2, 3), 5); });"]]], after: ['git add .', 'git commit -m "Thêm sum và test"', 'git push'] }); },
    check: function (s) { return CI.greenLast(s) && /require\('\.\/sum-utils'\)/.test(ftxt(s, CI.proj(s) + '/src/sum.test.js')); }
  },
  {
    id: 'ci5d2', title: 'Test chạy trước khi cài thư viện',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view --log-failed', 'test / Chạy unit test: Error: Cannot find package \'supertest\' imported from /home/runner/work/tutor-api/src/app.test.js', 'test / Chạy unit test: ##[error]Process completed with exit code 1.', '(Bước npm ci nằm SAU bước test nên node_modules chưa tồn tại)'),
    story: 'Workflow của nhóm có bước test trước bước `npm ci`. Log báo lỗi thiếu module dù code không sai.',
    goal: 'Bước `npm ci` nằm trước `npm test` trong job test, workflow xanh.',
    hints: ['Đọc thứ tự các step trong file: step nào chạy trước?', 'Thư viện phải được cài trước khi chạy lệnh cần chúng. Bước `npm ci` là điều kiện của `npm test`.', 'Đổi thứ tự hai step: `npm ci` lên trước, `npm test` xuống sau, commit và push.'],
    fix: [C.HCU(WF + 'ci.yml', ['name: CI', 'on:', '  push:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '      - run: npm ci', '      - run: npm test']), 'git commit -am "Cài thư viện trước khi test"', 'git push'],
    cause: 'Step chạy theo đúng thứ tự khai báo, không tự sắp xếp lại. Một lệnh chỉ dùng được khi bước tạo ra điều kiện của nó đã chạy trước.',
    setup: function (s) { CI.repo(s, { yml: ['name: CI', 'on:', '  push:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '      - run: npm test', '      - run: npm ci'] }); },
    check: function (s) { var j = CI.job(s, 'ci.yml', 'test'); if (!j || !Array.isArray(j.steps)) return false; var ci = -1, nt = -1; j.steps.forEach(function (st, i) { if (typeof st.run === 'string' && /npm ci/.test(st.run)) ci = i; if (typeof st.run === 'string' && /npm test/.test(st.run)) nt = i; }); return ci >= 0 && nt > ci && CI.greenLast(s); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
