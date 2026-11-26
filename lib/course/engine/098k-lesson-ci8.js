(function (G) {
'use strict';
/* Chương ci8: symlink trong CI/CD: dùng chung source giữa nhiều project, cách git lưu link, và các bẫy khi build, artifact, Docker. */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI;
var WF = '.github/workflows/';
var T = {
  id: 'ci8', group: CI.GROUP, short: 'Symlink và source dùng chung',
  title: 'Symlink trong CI/CD: dùng chung source giữa các project',
  dek: 'Symlink là gì, khi nào dùng để chia sẻ source giữa nhiều project trong một repo, vì sao đường dẫn đích nên tương đối, và các bẫy khi checkout, build, upload artifact và Docker trên CI.'
};
C.lessons.push(T);

var TYPES = ['export type User = { id: number; name: string };'];
var CI8 = ['name: CI', 'on:', '  push:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '          cache: npm', '      - name: Kiểm tra symlink còn trỏ đúng', '        run: test -L apps/api/shared && test -e apps/api/shared/types.ts', '      - run: npm ci', '      - run: npm test'];
function linkOf(s, rel) { var n = s.fs.n[CI.proj(s) + '/' + rel]; return n && n.t === 'l' ? n.target : null; }

T.theory = [
  { tag: 'Khái niệm', title: 'Symlink là gì: một đường dẫn trỏ tới đường dẫn khác', body: [
    'Symlink (symbolic link) là một mục trong hệ thống file chỉ chứa **đường dẫn đích**. Mở nó thì hệ điều hành đi tới đích. Tạo bằng `ln -s <đích> <tên link>`:',
    { pre: ['mkdir -p shared apps/api', 'ln -s ../../shared apps/api/shared', 'ls -l apps/api', '# shared -> ../../shared'], cap: 'Thư mục apps/api/shared là một link tới shared/ ở gốc repo' },
    { tbl: [['Loại', 'Bản chất', 'Ghi chú'], ['**Symlink**', 'Chứa đường dẫn đích', 'Đích bị xoá thì link thành "gãy" (broken)'], ['**Hard link**', 'Hai tên cùng trỏ tới một nội dung', 'Không dùng được cho thư mục, khác filesystem'], ['**Bản sao (copy)**', 'Hai bản độc lập', 'Dễ lệch nhau theo thời gian']] }
  ] },
  { tag: 'Dùng chung', title: 'Khi nào dùng symlink để chia sẻ source', body: [
    'Trong monorepo, `apps/api` và `apps/web` cùng cần kiểu dữ liệu, hàm tiện ích hoặc cấu hình. Copy-paste thì sớm muộn sẽ lệch. Symlink cho phép **một nguồn duy nhất**, hai project nhìn thấy cùng file.',
    { ul: ['Phù hợp: thư mục types, cấu hình lint, script dùng chung trong một repo.', 'Không nên: chia sẻ qua symlink giữa các repo khác nhau (khó theo dõi, dễ gãy). Với trường hợp đó dùng package nội bộ hoặc workspaces.', 'Nếu công cụ build không đi theo link (xem bẫy bên dưới), đây là lý do chọn workspaces thay vì symlink.'] }
  ] },
  { tag: 'Git', title: 'Git lưu symlink như thế nào, và vì sao đường dẫn đích nên tương đối', body: [
    'Git không lưu nội dung thư mục đích cho link. Nó lưu **một mục đặc biệt** (mode 120000) có nội dung là chuỗi đường dẫn đích. Khi checkout, runner tạo lại link đó.',
    { tbl: [['Đích', 'Trên máy bạn', 'Trên runner', 'Kết quả'], ['`../../shared` (tương đối)', 'Đúng', 'Đúng, vì cùng vị trí trong repo', 'Chạy được'], ['`/home/haidangphan/work/shared` (tuyệt đối)', 'Đúng', 'Đường dẫn không tồn tại', 'Link gãy, lỗi ENOENT']] },
    { note: 'Quy tắc: link trong repo phải trỏ tương đối, và đích phải nằm trong repo. Đường dẫn tuyệt đối chỉ đúng trên máy của bạn.', kind: 'warn' }
  ] },
  { tag: 'Bẫy CI', title: 'Các bẫy khi build, artifact và Docker', body: [
    { ul: ['**Windows runner:** git cần bật `core.symlinks`, nếu không link thành file văn bản. Nên dùng `ubuntu-latest` cho job có symlink.', '**Docker build context:** lệnh `COPY` không theo link ra ngoài context. File đích nằm ngoài thư mục build sẽ thiếu trong image. Đưa đích vào context hoặc copy nội dung trước.', '**Artifact và nén:** một số công cụ nén lưu link, không lưu nội dung. Muốn lấy nội dung, dùng tuỳ chọn "theo link" (ví dụ `tar -h`) và kiểm tra lại bằng `ls -l` trong artifact.', '**Link gãy không báo lỗi ngay:** nhiều công cụ chỉ lỗi khi đọc đúng file đó. Thêm bước kiểm tra sớm.'] },
    { pre: ['- name: Kiểm tra symlink', '  run: |', '    test -L apps/api/shared', '    test -e apps/api/shared/types.ts', '    find . -xtype l -print | tee broken.txt', '    test ! -s broken.txt'], cap: 'test -L: là link; test -e: đích tồn tại; find -xtype l: liệt kê link gãy' },
    { note: 'Lệnh `test -e` đi theo link, nên nó thất bại khi đích không tồn tại. Đó chính là cách bắt link gãy.', kind: 'tip' }
  ] },
  { tag: 'Quy trình', title: 'Quy trình an toàn khi dùng symlink trong repo', body: [
    { ul: ['**1.** Tạo link bằng đường dẫn tương đối, kiểm tra `ls -l` trước khi commit.', '**2.** Commit link cùng đích trong một commit, để không có lúc repo có link gãy.', '**3.** Thêm bước CI kiểm tra link (`test -L`, `test -e`) chạy trước npm ci.', '**4.** Ghi vào README: link nào dùng chung, đích ở đâu, vì sao không copy.'] }
  ] }
];

T.quiz = C.QZ(8, [
  ['Symlink là gì?', 'Một mục hệ thống file chứa đường dẫn đích, mở ra sẽ đi tới đó', ['Một bản sao độc lập của file', 'Một nén file để tiết kiệm dung lượng', 'Một quyền truy cập đặc biệt'], 'Symlink không chứa nội dung, chỉ chứa đường dẫn. Đích thay đổi thì link đi theo.'],
  ['Vì sao chia sẻ source bằng symlink tốt hơn copy-paste trong monorepo?', 'Chỉ có một nguồn duy nhất, không bị lệch theo thời gian', ['Chạy nhanh hơn trong mọi trường hợp', 'Không cần git', 'Tự động viết test'], 'Copy thì mỗi bản sửa riêng, sớm muộn sẽ khác nhau. Symlink giữ một bản duy nhất.'],
  ['Git lưu một symlink như thế nào?', 'Một mục đặc biệt có nội dung là chuỗi đường dẫn đích', ['Toàn bộ nội dung thư mục đích', 'Một file nhị phân ẩn', 'Không lưu gì cả'], 'Vì vậy đích phải nằm trong repo, và checkout sẽ tạo lại link.'],
  ['Đích tuyệt đối `/home/haidangphan/work/shared` gây lỗi gì trên runner?', 'Đường dẫn không tồn tại trên máy runner, link gãy', ['Runner không cho phép symlink', 'Lỗi quyền ghi', 'Git từ chối commit'], 'Đường dẫn tuyệt đối chỉ đúng trên máy đã tạo ra nó. Dùng đường dẫn tương đối.'],
  ['Lệnh nào kiểm tra một mục là symlink?', '`test -L đường_dẫn`', ['`test -d đường_dẫn`', '`test -x đường_dẫn`', '`cat đường_dẫn`'], '`-L` kiểm tra mục có phải symlink không. `-d` chỉ kiểm tra thư mục và đi theo link.'],
  ['Vì sao `test -e` hữu ích để bắt link gãy?', 'Nó đi theo link tới đích, thất bại nếu đích không tồn tại', ['Nó xoá link gãy', 'Nó chỉ kiểm tra quyền đọc', 'Nó chạy nhanh hơn ls'], 'Dùng `test -L` và `test -e` cùng nhau: link có mặt nhưng đích mất thì vẫn bắt được.'],
  ['Docker `COPY` có vấn đề gì với symlink trỏ ra ngoài build context?', 'Đích nằm ngoài context không được copy, image thiếu file', ['Docker không hỗ trợ mọi symlink', 'COPY luôn lỗi', 'Không ảnh hưởng gì'], 'Context là phạm vi Docker nhìn thấy. Đưa đích vào context hoặc copy nội dung trước.'],
  ['Khi nào không nên chia sẻ source bằng symlink?', 'Giữa các repo khác nhau, vì khó theo dõi và dễ gãy', ['Trong cùng một monorepo', 'Với file cấu hình lint', 'Với thư mục types dùng chung'], 'Giữa repo, hãy dùng package nội bộ hoặc workspaces để có phiên bản rõ ràng.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.repo(s); },
  items: [
    { text: 'Tạo thư mục `shared` và `apps/api` (mkdir -p).', hint: 'mkdir -p shared apps/api', check: function (s) { return s.fs.isD(CI.proj(s) + '/shared') && s.fs.isD(CI.proj(s) + '/apps/api'); } },
    { text: 'Ghi `shared/types.ts` (heredoc) với kiểu `User`.', hint: C.HCU('shared/types.ts', TYPES), check: function (s) { return /export type User/.test(ftxt(s, CI.proj(s) + '/shared/types.ts')); } },
    { text: 'Tạo symlink `apps/api/shared` trỏ tới `../../shared` bằng `ln -s`.', hint: 'ln -s ../../shared apps/api/shared', check: function (s) { return linkOf(s, 'apps/api/shared') === '../../shared'; } },
    { text: 'Kiểm tra bằng `ls -l apps/api`: phải thấy `shared -> ../../shared`.', hint: 'ls -l apps/api', check: OK(/^ls -l apps\/api$/) },
    { text: 'Ghi `.github/workflows/ci.yml` (heredoc) với bước `test -L apps/api/shared && test -e apps/api/shared/types.ts` trước `npm ci`.', hint: C.HCU(WF + 'ci.yml', CI8), check: function (s) { var j = CI.job(s, 'ci.yml', 'test'); return !!j && CI.runs(j, /test -L apps\/api\/shared/) && CI.lint(s, 'ci.yml'); } },
    { text: 'Đưa mọi thay đổi vào staging (`git add .`), commit `Dùng chung types qua symlink`.', hint: 'git add .\ngit commit -m "Dùng chung types qua symlink"', check: function (s) { return OK(/^git commit /)(s) && CI.R(s).commits.length >= 2; } },
    { text: 'Đẩy lên bằng `git push`, rồi xem `gh run list`. Lần chạy mới nhất phải xanh, và git phải lưu link dạng `->../../shared`.', hint: 'git push\ngh run list', check: function (s) { return CI.runCount(s) >= 2 && CI.headHas(s, 'apps/api/shared', /^->\.\.\/\.\.\/shared$/) && CI.greenLast(s); } },
    { text: 'Chạy `actionlint` để chắc workflow hợp lệ.', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'ci.yml'); } }
  ]
};

T.debugs = [
  {
    id: 'ci8d1', title: 'Link gãy vì đường dẫn tuyệt đối',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view --log-failed', 'test / Kiểm tra symlink: ls: cannot access \'apps/api/shared/types.ts\': No such file or directory', 'test / Kiểm tra symlink: ##[error]Process completed with exit code 1.', '$ ls -l apps/api   (trên máy bạn: shared -> /home/haidangphan/work/shared)'),
    story: 'Trên máy bạn link chạy tốt. Trên runner, thư mục đích không tồn tại, vì link được tạo bằng đường dẫn tuyệt đối từ máy cá nhân.',
    goal: 'Link `apps/api/shared` dùng đường dẫn tương đối tới `../../shared`, và lần chạy mới nhất xanh.',
    hints: ['Đọc `ls -l`: đích bắt đầu bằng `/home` nghĩa là tuyệt đối.', 'Đích nên nằm trong repo và tính từ vị trí của link.', 'Tạo lại link bằng `ln -sf ../../shared apps/api/shared`, commit, push.'],
    fix: ['ln -sf ../../shared apps/api/shared', 'git commit -am "Đổi symlink sang đường dẫn tương đối"', 'git push', 'gh run list'],
    cause: 'Git lưu chuỗi đích nguyên văn. Đường dẫn tuyệt đối không tồn tại trên runner, nên link gãy và các bước đọc file lỗi.',
    setup: function (s) { CI.repo(s, { yml: CI8, after: ['mkdir -p shared apps/api', C.HCU('shared/types.ts', TYPES), 'ln -s /home/haidangphan/work/shared apps/api/shared', 'git add .', 'git commit -m "Dùng chung types"', 'git push'] }); },
    check: function (s) { return linkOf(s, 'apps/api/shared') === '../../shared' && CI.greenLast(s); }
  },
  {
    id: 'ci8d2', title: 'Artifact thiếu file vì symlink ra ngoài thư mục',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run download', 'dist/ contains: index.js, apps/api/shared (link)', '$ node dist/index.js', "Error: Cannot find module './shared/types'", '(artifact lưu link nhưng không kèm nội dung đích)'),
    story: 'Job build tạo artifact từ thư mục dist. Link bên trong trỏ ra ngoài dist, nên artifact chỉ có link gãy khi tải về.',
    goal: 'Bước build copy nội dung thật (cp -rL) vào dist trước khi upload, và lần chạy mới nhất xanh.',
    hints: ['Artifact được đóng gói từ thư mục dist, đích của link không nằm trong đó.', 'Tuỳ chọn `-L` của cp hoặc tar theo link, lấy nội dung thật.', 'Sửa bước build thành `mkdir -p dist && cp -rL src/. dist/`, commit, push.'],
    fix: ['mkdir -p dist && cp -rL src/. dist/', 'git commit -am "Copy nội dung thật vào dist"', 'git push'],
    cause: 'Công cụ đóng gói lưu link như link. Khi giải nén ở chỗ khác, đích không có, nên module không load được.',
    setup: function (s) { CI.repo(s, { yml: CI8.slice(0, 8).concat(['      - uses: actions/checkout@v4', '      - run: mkdir -p dist && cp -r src/. dist/'], ['      - uses: actions/upload-artifact@v4', '        with:', '          name: dist', '          path: dist/'], ['      - run: npm ci', '      - run: npm test']), after: ['mkdir -p src/apps/api apps/api shared', C.HCU('shared/types.ts', TYPES), 'ln -s ../../shared apps/api/shared', 'git add .', 'git commit -m "Thêm symlink"', 'git push'] }); },
    check: function (s) { return /cp -rL/.test(ftxt(s, CI.wfPath(s, 'ci.yml'))) && CI.greenLast(s); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
