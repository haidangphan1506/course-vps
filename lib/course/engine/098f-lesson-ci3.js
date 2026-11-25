(function (G) {
'use strict';
/* Chương ci3: CD, deploy lên VPS bằng GitHub Actions (SSH, environment, concurrency, GHCR, rollback). */
var C = G.COURSE, L = C.L, OK = C.OK, ftxt = C.ftxt, CI = C.CI, GH = C.GH;
var WF = '.github/workflows/';
function countOK(s, re) { return s.hist.filter(function (h) { return h.code === 0 && re.test(h.cmd); }).length; }
function runOf(s, name) { return CI.st(s).runs.filter(function (r) { return r.name === name; }); }
function deployYml(o) {
  o = o || {};
  var sec = o.typo ? 'secret' : 'secrets';
  var out = ['name: Deploy', 'on:', '  push:', "    tags: ['v*']", 'concurrency:', '  group: deploy-production', '  cancel-in-progress: false', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '      - run: npm ci'];
  out.push(o.failTest ? '      - run: echo "1 test failed" && exit 1' : '      - run: npm test');
  out = out.concat(['  deploy:'], o.noNeeds ? [] : ['    needs: test'], ['    runs-on: ubuntu-latest', '    environment: production', '    steps:', '      - name: Cấu hình SSH', '        run: |', '          install -m 700 -d ~/.ssh', '          echo "${{ secrets.VPS_SSH_KEY }}" > ~/.ssh/id_deploy', '          chmod 600 ~/.ssh/id_deploy', '          ssh-keyscan -H ${{ ' + sec + '.VPS_HOST }} >> ~/.ssh/known_hosts', '      - name: Triển khai', '        run: ssh -i ~/.ssh/id_deploy ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} "cd /srv/tutor && git fetch --tags && git checkout ${{ github.ref_name }} && npm ci --omit=dev && pm2 reload tutor-api"', '      - name: Kiểm tra sức khoẻ', '        run: curl --fail --retry 5 --retry-delay 3 https://tutor.haiphan.org/health']);
  return out;
}
var DOCKER = ['name: Docker', 'on:', '  push:', "    tags: ['v*']", 'permissions:', '  contents: read', '  packages: write', 'jobs:', '  image:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: docker/setup-buildx-action@v3', '      - uses: docker/login-action@v3', '        with:', '          registry: ghcr.io', '          username: ${{ github.actor }}', '          password: ${{ secrets.GITHUB_TOKEN }}', '      - uses: docker/build-push-action@v6', '        with:', '          context: .', '          push: true', '          tags: ghcr.io/haidangphan1506/tutor-api:${{ github.ref_name }}', '          cache-from: type=gha', '          cache-to: type=gha,mode=max'];
var KEYGEN = 'ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N "" -C "github-actions-deploy"';
function seedSecrets(extra) { return ['gh secret set VPS_HOST --body 116.118.9.210', 'gh secret set VPS_USER --body haidangphan'].concat(extra || []); }

var T = {
  id: 'ci3', group: CI.GROUP, short: 'CD: deploy lên VPS',
  title: 'CD: deploy lên VPS bằng GitHub Actions',
  dek: 'Từ tag phiên bản tới bản chạy thật trên VPS: khoá SSH riêng cho deploy, secrets, workflow test rồi deploy, environment production, concurrency, kiểm tra sức khoẻ, đẩy image Docker lên GHCR và cách rollback.'
};
C.lessons.push(T);

T.theory = [
  { tag: 'Quy trình', title: 'CD cho VPS: từ tag tới bản chạy thật', body: [
    'CI chỉ trả lời "code có chạy được không". **CD** làm bước tiếp theo: đưa đúng bản đã qua kiểm tra lên server. Quy trình gọn và an toàn cho một VPS riêng:',
    { ul: ['**1.** Bạn gắn tag phiên bản: `git tag v1.0.0 && git push origin v1.0.0`.', '**2.** Workflow `Deploy` chạy job `test`. Đỏ thì dừng, không deploy.', '**3.** Job `deploy` (cần `test` xanh) SSH vào VPS, lấy code đúng tag và nạp lại ứng dụng.', '**4.** Bước kiểm tra sức khoẻ gọi `/health`. Lỗi thì job đỏ và bạn biết ngay để rollback.'] },
    { tbl: [['Secret', 'Nội dung', 'Cất ở đâu'], ['`VPS_SSH_KEY`', 'Khoá **riêng** dành cho GitHub Actions', 'Secrets của repo (hoặc của environment)'], ['`VPS_HOST`', 'Địa chỉ VPS, ví dụ `116.118.9.210`', 'Secrets (hoặc vars nếu không muốn che)'], ['`VPS_USER`', 'User triển khai, **không phải root**', 'Secrets'], ['Khoá **công khai**', 'Nửa còn lại của cặp khoá', '`~/.ssh/authorized_keys` trên VPS']] },
    { note: 'Dùng một **cặp khoá riêng cho deploy**, không dùng khoá cá nhân. Khoá riêng này có thể thu hồi độc lập (xoá một dòng trong `authorized_keys`) mà không ảnh hưởng đăng nhập của bạn.', kind: 'tip' }
  ] },
  { tag: 'Khoá và secrets', title: 'Tạo khoá deploy và nạp vào GitHub', body: [
    { pre: ['ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N "" -C "github-actions-deploy"', 'cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys', 'chmod 600 ~/.ssh/authorized_keys', 'gh secret set VPS_SSH_KEY < ~/.ssh/deploy_key', 'gh secret set VPS_HOST --body 116.118.9.210', 'gh secret set VPS_USER --body haidangphan', 'gh secret list'], cap: 'Chạy trên VPS: tạo khoá, cho phép khoá vào, nạp secrets' },
    { ul: ['`-N ""` tạo khoá không passphrase vì runner không có người gõ. Bù lại khoá này **chỉ dùng cho deploy** và dễ thu hồi.', '`gh secret set X < file` đọc giá trị từ file qua stdin, tránh gõ khoá vào lịch sử lệnh.', 'Sau khi nạp xong có thể **xoá khoá riêng** khỏi VPS: GitHub đã giữ bản mã hoá.', 'Secret không đọc lại được: nhìn `gh secret list` chỉ thấy tên và thời điểm cập nhật.'] },
    { note: 'Muốn chặt hơn nữa, đặt tuỳ chọn trước khoá công khai trong `authorized_keys` (ví dụ `restrict,command="/srv/tutor/deploy.sh"`) để khoá này chỉ chạy được đúng một script.', kind: 'tip' }
  ] },
  { tag: 'Workflow', title: 'Workflow deploy: test, deploy, kiểm tra sức khoẻ', body: [
    { pre: ['on:', '  push:', '    tags: [\'v*\']', 'concurrency:', '  group: deploy-production', '  cancel-in-progress: false', 'jobs:', '  test:', '    # ... checkout, npm ci, npm test', '  deploy:', '    needs: test', '    runs-on: ubuntu-latest', '    environment: production', '    steps:', '      - name: Cấu hình SSH', '        run: |', '          install -m 700 -d ~/.ssh', '          echo "${{ secrets.VPS_SSH_KEY }}" > ~/.ssh/id_deploy', '          chmod 600 ~/.ssh/id_deploy', '          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts', '      - name: Triển khai', '        run: ssh -i ~/.ssh/id_deploy ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} "cd /srv/tutor && git fetch --tags && git checkout ${{ github.ref_name }} && npm ci --omit=dev && pm2 reload tutor-api"', '      - name: Kiểm tra sức khoẻ', '        run: curl --fail --retry 5 --retry-delay 3 https://tutor.haiphan.org/health'], cap: 'deploy.yml rút gọn' },
    { tbl: [['Thành phần', 'Tác dụng'], ['`tags: [\'v*\']`', 'Chỉ chạy khi đẩy tag bắt đầu bằng v, không chạy mỗi lần push main'], ['`needs: test`', 'Test đỏ thì job deploy bị **skipped**, không bao giờ chạm tới VPS'], ['`environment: production`', 'Gắn môi trường có luật riêng: người duyệt bắt buộc, secrets riêng, giới hạn nhánh/tag'], ['`concurrency`', 'Chỉ một lần deploy chạy cùng lúc; `cancel-in-progress: false` để lần sau xếp hàng chờ chứ không huỷ lần đang chạy dở'], ['`ssh-keyscan`', 'Ghi vân tay VPS vào `known_hosts` để SSH không hỏi yes/no']] },
    { note: 'Đừng `echo` secret ra log. Trong bước SSH, secret chỉ được ghi vào file có quyền `600` rồi dùng ngay.', kind: 'warn' }
  ] },
  { tag: 'Image và rollback', title: 'Đẩy image Docker lên GHCR và quay lui khi có sự cố', body: [
    { pre: ['permissions:', '  contents: read', '  packages: write', 'steps:', '  - uses: docker/login-action@v3', '    with:', '      registry: ghcr.io', '      username: ${{ github.actor }}', '      password: ${{ secrets.GITHUB_TOKEN }}', '  - uses: docker/build-push-action@v6', '    with:', '      push: true', '      tags: ghcr.io/haidangphan1506/tutor-api:${{ github.ref_name }}', '      cache-from: type=gha', '      cache-to: type=gha,mode=max'], cap: 'Build image, gắn tag theo phiên bản, đẩy lên GitHub Container Registry' },
    { tbl: [['Tình huống', 'Cách xử lý'], ['Bản v1.0.1 lỗi sau deploy', '**Rollback**: deploy lại tag cũ `v1.0.0` (chạy lại workflow của tag đó), hoặc `git revert` rồi gắn tag `v1.0.2`'], ['Image đã đẩy nhưng deploy lỗi', 'Image gắn tag theo phiên bản vẫn còn trong GHCR, deploy lại bằng đúng tag đó'], ['Hai người push tag cùng lúc', '`concurrency` xếp hàng, không deploy chồng nhau'], ['Cần người duyệt trước khi lên production', 'Environment `production` bật **Required reviewers**']] },
    { note: 'Dùng tag bất biến theo phiên bản (`v1.0.1`), đừng chỉ dùng `latest`: không có tag cũ để quay lui thì rollback thành bài toán đoán mò.', kind: 'warn' }
  ] }
];

T.quiz = C.QZ(3, [
  ['Vì sao nên tạo cặp khoá SSH **riêng** cho GitHub Actions thay vì dùng khoá cá nhân?', 'Khoá riêng thu hồi được độc lập, chỉ cấp quyền cần thiết và không lộ khoá cá nhân', ['Vì khoá cá nhân không dùng được trên runner', 'Vì GitHub chỉ nhận khoá ed25519 mới tạo', 'Không có lý do gì, chỉ là thói quen'], 'Nếu secret bị lộ, bạn chỉ cần xoá một dòng trong `authorized_keys`. Đăng nhập thường ngày của bạn không bị ảnh hưởng.'],
  ['Khoá nào cất vào secrets của repo, khoá nào đặt vào `authorized_keys` trên VPS?', 'Khoá **riêng** vào secrets; khoá **công khai** (`.pub`) vào `authorized_keys`', ['Khoá công khai vào secrets, khoá riêng vào authorized_keys', 'Cả hai vào secrets', 'Cả hai vào authorized_keys'], 'Khoá riêng là thứ chứng minh danh tính nên phải giữ kín. VPS chỉ cần khoá công khai để kiểm tra.'],
  ['`on: push: tags: [\'v*\']` nghĩa là gì?', 'Chạy khi đẩy một tag bắt đầu bằng chữ v, ví dụ `v1.0.0`', ['Chạy mỗi lần push lên nhánh có chữ v', 'Chạy khi tạo nhánh mới', 'Chạy mỗi giờ'], 'Tag được đẩy bằng `git push origin v1.0.0`. Push commit thường lên main không kích hoạt workflow này.'],
  ['`environment: production` trong một job cho phép làm gì?', 'Gắn job với môi trường có luật riêng: người duyệt bắt buộc, secrets riêng, giới hạn nhánh hoặc tag', ['Tự động nhân đôi job', 'Chạy job trên VPS production', 'Tắt kiểm tra cú pháp'], 'Environment là chốt chặn trước khi chạm vào production, rất hợp với bước deploy.'],
  ['`concurrency: group: deploy-production, cancel-in-progress: false` dùng để làm gì?', 'Chỉ cho một lần deploy chạy cùng lúc, lần sau xếp hàng chờ thay vì chạy chồng', ['Chạy mọi deploy song song cho nhanh', 'Huỷ mọi lần deploy cũ khi có lần mới', 'Giới hạn số secret'], 'Hai deploy chạy chồng lên nhau có thể để VPS ở trạng thái nửa cũ nửa mới. `false` nghĩa là không huỷ lần đang chạy dở.'],
  ['Vì sao sau deploy nên có bước `curl --fail ... /health`?', 'Biết ngay bản mới có phản hồi không; lệnh lỗi làm job đỏ để bạn rollback kịp', ['Để tăng tốc ứng dụng', 'Để xoá cache của Nginx', 'Để GitHub ghi nhận lượt truy cập'], '`--fail` khiến curl trả mã lỗi khi gặp 4xx hoặc 5xx, nên job báo đỏ thay vì im lặng.'],
  ['Bản `v1.0.1` vừa deploy bị lỗi. Cách rollback đơn giản và an toàn nhất?', 'Deploy lại tag cũ `v1.0.0` (hoặc `git revert` rồi gắn tag bản mới)', ['Xoá repo rồi tạo lại', 'Sửa trực tiếp file trên VPS cho đến khi chạy', 'Tắt CI'], 'Nhờ tag bất biến theo phiên bản, quay lui chỉ là chạy lại quy trình với tag cũ.'],
  ['Để đẩy image lên GHCR bằng `GITHUB_TOKEN`, job cần có quyền gì?', '`permissions: packages: write`', ['`permissions: issues: write`', '`permissions: id-token: read`', 'Không cần khai báo gì'], 'Nên khai báo tối thiểu: `contents: read` và `packages: write`, đừng dùng `write-all`.'],
  ['Deploy bằng SSH nên dùng user nào trên VPS?', 'User thường có quyền tối thiểu cho thư mục ứng dụng, không dùng root', ['root, cho đỡ bị Permission denied', 'Bất kỳ user nào có sudo không mật khẩu', 'User của người tạo repo'], 'Nếu khoá deploy bị lộ, kẻ tấn công chỉ có quyền của user đó. Dùng root là trao toàn bộ VPS.']
]);

T.lab = {
  host: 'vps', user: 'haidangphan',
  setup: function (s) { CI.repo(s); },
  items: [
    { text: 'Tạo cặp khoá riêng cho deploy: `ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N "" -C "github-actions-deploy"`.', hint: KEYGEN, check: function (s) { return !!s.fs.get(s.home + '/.ssh/deploy_key') && !!s.fs.get(s.home + '/.ssh/deploy_key.pub'); } },
    { text: 'Cho phép khoá này đăng nhập VPS: nối khoá công khai vào `~/.ssh/authorized_keys`.', hint: 'cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys', check: function (s) { return /github-actions-deploy/.test(ftxt(s, s.home + '/.ssh/authorized_keys')); } },
    { text: 'Siết quyền `authorized_keys` còn `600`.', hint: 'chmod 600 ~/.ssh/authorized_keys', check: function (s) { var n = s.fs.get(s.home + '/.ssh/authorized_keys'); return !!n && (n.mode & 511) === 384 && OK(/^chmod 600 /)(s); } },
    { text: 'Kiểm tra quyền thư mục `~/.ssh` bằng `ls -l ~/.ssh`.', hint: 'ls -l ~/.ssh', check: OK(/^ls -l \S*\.ssh\/?$/) },
    { text: 'Nạp khoá **riêng** vào secret `VPS_SSH_KEY` bằng `gh secret set VPS_SSH_KEY < ~/.ssh/deploy_key`.', hint: 'gh secret set VPS_SSH_KEY < ~/.ssh/deploy_key', check: function (s) { return !!CI.st(s).secrets.VPS_SSH_KEY; } },
    { text: 'Nạp địa chỉ VPS vào secret `VPS_HOST` (116.118.9.210).', hint: 'gh secret set VPS_HOST --body 116.118.9.210', check: function (s) { return !!CI.st(s).secrets.VPS_HOST; } },
    { text: 'Nạp tên user deploy vào secret `VPS_USER` (haidangphan).', hint: 'gh secret set VPS_USER --body haidangphan', check: function (s) { return !!CI.st(s).secrets.VPS_USER; } },
    { text: 'Xác nhận đủ ba secret bằng `gh secret list`.', hint: 'gh secret list', check: function (s) { var k = Object.keys(CI.st(s).secrets); return OK(/^gh secret list/)(s) && k.length >= 3; } },
    { text: 'Tạo `deploy.yml`: chạy khi push tag `v*`; job `test`; job `deploy` có `needs: test`, `environment: production` và `concurrency`.', hint: C.HCU(WF + 'deploy.yml', deployYml()), check: function (s) { var d = CI.doc(s, 'deploy.yml'), j = CI.job(s, 'deploy.yml', 'deploy'); return !!d && !!j && j.needs === 'test' && j.environment === 'production' && !!d.concurrency && /deploy/.test(String(d.concurrency.group)) && CI.runs(j, /VPS_SSH_KEY/) && CI.onKeys(d).indexOf('push') >= 0; } },
    { text: 'Kiểm tra cú pháp bằng `actionlint`.', hint: 'actionlint', check: function (s) { return OK(/^actionlint$/)(s) && CI.lint(s, 'deploy.yml'); } },
    { text: 'Thêm và commit: `Thêm workflow deploy`.', hint: 'git add .\ngit commit -m "Thêm workflow deploy"', check: function (s) { return CI.R(s).commits.length >= 2 && CI.headHas(s, WF + 'deploy.yml', /environment: production/); } },
    { text: 'Đẩy main lên GitHub: `git push` (workflow deploy chỉ chạy với tag nên chưa deploy gì).', hint: 'git push', check: function (s) { return OK(/^git push$/)(s) && (CI.R(s).pushed.main || 0) >= 2; } },
    { text: 'Gắn tag phiên bản: `git tag v1.0.0`.', hint: 'git tag v1.0.0', check: function (s) { return CI.R(s).tags.some(function (t) { return t.name === 'v1.0.0'; }); } },
    { text: 'Đẩy tag: `git push origin v1.0.0`. Sự kiện tag kích hoạt workflow Deploy.', hint: 'git push origin v1.0.0', check: function (s) { return runOf(s, 'Deploy').length >= 1; } },
    { text: 'Xem chi tiết lần deploy bằng `gh run view` (job deploy hiện kèm environment: production).', hint: 'gh run view', check: function (s) { var r = runOf(s, 'Deploy'); return OK(/^gh run view/)(s) && r.length >= 1 && r[r.length - 1].conclusion === 'success'; } },
    { text: 'Tạo `docker.yml`: khi push tag, đăng nhập GHCR bằng `GITHUB_TOKEN` (`packages: write`) và build rồi đẩy image gắn tag theo phiên bản.', hint: C.HCU(WF + 'docker.yml', DOCKER), check: function (s) { var d = CI.doc(s, 'docker.yml'), j = CI.job(s, 'docker.yml', 'image'); return !!d && !!d.permissions && d.permissions.packages === 'write' && CI.uses(j, /^docker\/build-push-action@v6$/) && CI.uses(j, /^docker\/login-action@v3$/); } },
    { text: 'Chạy `actionlint` lần nữa cho cả hai workflow mới.', hint: 'actionlint', check: function (s) { return countOK(s, /^actionlint$/) >= 2 && CI.lint(s, 'docker.yml') && CI.lint(s, 'deploy.yml'); } },
    { text: 'Commit và push workflow Docker: `Thêm workflow Docker`.', hint: 'git add .\ngit commit -m "Thêm workflow Docker"\ngit push', check: function (s) { return CI.headHas(s, WF + 'docker.yml', /build-push-action/) && (CI.R(s).pushed.main || 0) >= 3; } },
    { text: 'Phát hành bản tiếp theo: gắn tag `v1.0.1` và đẩy lên, hai workflow Deploy và Docker cùng chạy.', hint: 'git tag v1.0.1\ngit push origin v1.0.1', check: function (s) { return runOf(s, 'Deploy').length >= 2 && runOf(s, 'Docker').length >= 1; } },
    { text: 'Xem tất cả các lần chạy bằng `gh run list`.', hint: 'gh run list', check: function (s) { return OK(/^gh run list/)(s) && runOf(s, 'Docker').length >= 1; } }
  ]
};

T.debugs = [
  {
    id: 'ci3d1', title: 'Deploy lỗi vì thiếu khoá SSH trong secrets',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view --log-failed', 'deploy / Cấu hình SSH: ##[error]Secret VPS_SSH_KEY is empty. Hãy thêm secret: gh secret set VPS_SSH_KEY', '$ gh secret list', 'VPS_HOST\tUpdated just now', 'VPS_USER\tUpdated just now'),
    story: 'Bạn push tag `v1.0.0`, test xanh nhưng job deploy đỏ ngay ở bước cấu hình SSH. Repo mới có VPS_HOST và VPS_USER, chưa có khoá.',
    goal: 'Tạo cặp khoá deploy, cho phép khoá công khai vào VPS, nạp khoá riêng thành secret `VPS_SSH_KEY` rồi chạy lại: lần chạy mới nhất thành công.',
    hints: ['`gh secret list` cho thấy repo đang thiếu secret nào.', 'Cần cặp khoá mới: khoá riêng vào secret, khoá công khai vào `authorized_keys` của VPS.', '`ssh-keygen`, nối `.pub` vào `authorized_keys`, `gh secret set VPS_SSH_KEY < ~/.ssh/deploy_key`, rồi `gh run rerun`.'],
    fix: [KEYGEN, 'cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys', 'gh secret set VPS_SSH_KEY < ~/.ssh/deploy_key', 'gh run rerun', 'gh run view'],
    cause: 'Workflow cần ba secret; thiếu một cái thì bước dùng nó lỗi. Khoá riêng phải nằm trong secrets còn khoá công khai phải nằm trong `authorized_keys` của VPS, thiếu một trong hai nửa là không đăng nhập được.',
    setup: function (s) { CI.repo(s, { yml: deployYml(), file: 'deploy.yml', after: seedSecrets(['git tag v1.0.0', 'git push origin v1.0.0']) }); },
    check: function (s) { return !!CI.st(s).secrets.VPS_SSH_KEY && /github-actions-deploy/.test(ftxt(s, s.home + '/.ssh/authorized_keys')) && runOf(s, 'Deploy').length >= 2 && CI.greenLast(s); }
  },
  {
    id: 'ci3d2', title: 'Deploy chạy dù test đỏ',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ gh run view', 'X main Deploy · 9100', 'X test', '  X Run echo "1 test failed" && exit 1', '✓ deploy (environment: production)', '  ✓ Cấu hình SSH', '  ✓ Triển khai'),
    story: 'Test đang đỏ nhưng job deploy vẫn chạy và lên production. Hai job chạy song song vì deploy không khai báo phụ thuộc vào test.',
    goal: 'Job `deploy` có `needs: test`; sau khi push tag mới, job deploy bị skipped vì test vẫn đỏ.',
    hints: ['Đọc `gh run view`: job `deploy` xanh dù `test` đỏ. Hai job không liên quan nhau.', 'Mặc định các job chạy song song. Muốn đảo thứ tự và chặn deploy khi test đỏ, dùng `needs`.', 'Thêm `needs: test` vào job deploy, commit, push, gắn tag `v1.0.1` và đẩy tag.'],
    fix: [C.HCU(WF + 'deploy.yml', deployYml({ failTest: true })), 'git add .', 'git commit -m "deploy phải chờ test"', 'git push', 'git tag v1.0.1', 'git push origin v1.0.1', 'gh run view'],
    cause: 'Không có `needs`, job deploy độc lập với test. Với `needs: test`, test đỏ thì deploy bị skipped và production không bị chạm tới. Đây là chốt chặn quan trọng nhất của một pipeline CD.',
    setup: function (s) { CI.repo(s, { yml: deployYml({ failTest: true, noNeeds: true }), file: 'deploy.yml', after: seedSecrets(['gh secret set VPS_SSH_KEY --body demo-key', 'git tag v1.0.0', 'git push origin v1.0.0']) }); },
    check: function (s) { var r = CI.lastRun(s), j = CI.job(s, 'deploy.yml', 'deploy'); var d = r && r.jobs.filter(function (x) { return x.id === 'deploy'; })[0]; return !!j && j.needs === 'test' && !!d && d.conclusion === 'skipped'; }
  },
  {
    id: 'ci3d3', title: 'Gõ nhầm secret thành secrets',
    host: 'vps', user: 'haidangphan',
    symptom: L('$ actionlint', '.github/workflows/deploy.yml:25:34: undefined variable "secret". available variables are "env", "github", "inputs", "job", "jobs", "matrix", "needs", "runner", "secrets", "steps", "strategy", "vars" [expression]'),
    story: 'Push tag xong, lần chạy đỏ ngay mà không job nào chạy. Bạn đã gõ ${{ secret.VPS_HOST }} thay vì ${{ secrets.VPS_HOST }}.',
    goal: '`actionlint` sạch lỗi, workflow đã sửa được push, tag mới `v1.0.1` được đẩy và lần chạy mới nhất thành công.',
    hints: ['`actionlint` chỉ rõ dòng 25 và biến `secret` không tồn tại.', 'Tên ngữ cảnh đúng là `secrets` (số nhiều). `secret` không phải ngữ cảnh nào cả.', 'Sửa lại, `actionlint`, commit, push, rồi gắn tag `v1.0.1` và đẩy tag.'],
    fix: [C.HCU(WF + 'deploy.yml', deployYml()), 'actionlint', 'git add .', 'git commit -m "Sửa secrets"', 'git push', 'git tag v1.0.1', 'git push origin v1.0.1'],
    cause: 'Ngữ cảnh truy cập secret là `secrets`. Gõ sai tên làm biểu thức không hợp lệ và cả workflow bị từ chối. Nếu tên secret sai (đúng ngữ cảnh) thì lại khác: nó thành chuỗi rỗng và lỗi ở bước dùng nó.',
    setup: function (s) { CI.repo(s, { yml: deployYml({ typo: true }), file: 'deploy.yml', after: seedSecrets(['gh secret set VPS_SSH_KEY --body demo-key', 'git tag v1.0.0', 'git push origin v1.0.0']) }); },
    check: function (s) { return CI.lint(s, 'deploy.yml') && runOf(s, 'Deploy').length >= 2 && CI.greenLast(s); }
  }
];
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
