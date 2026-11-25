(function (G) {
'use strict';
/* Phần dùng chung cho loạt bài CI/CD GitHub (ci1 đến ci4): môi trường lab, bộ đọc workflow. */
var V = G.VPS, C = G.COURSE, LB = C.LB, GH = C.GH, ftxt = C.ftxt, OK = C.OK;
var CI = C.CI = {};
CI.GROUP = 'CI/CD GitHub';
CI.REMOTE = 'git@github.com:haidangphan1506/course-vps.git';
var PROJ = CI.proj = function (s) { return s.home + '/work/projects/tutor'; };
CI.wfPath = function (s, f) { return PROJ(s) + '/.github/workflows/' + f; };

CI.BASIC = ['name: CI', 'on:', '  push:', '    branches: [main]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 22', '      - run: npm ci', '      - run: npm test'];

function runq(s, cmds) { cmds.forEach(function (c) { try { s.run(c); } catch (e) {} }); s.hist.length = 0; s.cwd = PROJ(s); }
CI.runq = runq;
/* môi trường nền: dự án tutor-api có script test và package-lock.json, đã cài git */
CI.base = function (s, o) {
  o = o || {};
  LB.base(s, {});
  s.fs.put('/usr/bin/git', 'ELF', { owner: 'root', mode: 493 });
  var p = PROJ(s);
  LB.put(s, p + '/package.json', '{\n  "name": "tutor-api",\n  "version": "1.4.2",\n  "scripts": {\n    "start": "node src/app.js",\n    "test": "node --test"\n  }\n}\n');
  if (!o.nolock) LB.put(s, p + '/package-lock.json', '{ "name": "tutor-api", "lockfileVersion": 3, "packages": {} }\n');
  LB.put(s, p + '/src/app.test.js', "const test = require('node:test');\ntest('sum', () => {});\n");
  s.cwd = p;
};
/* kho git đã có: danh tính, ci.yml (BASIC hoặc o.yml), commit, remote và push lên main */
CI.repo = function (s, o) {
  o = o || {};
  CI.base(s, o);
  var cmds = ['git init', 'git config --global user.name "Dang Phan"', 'git config --global user.email "dang@haiphan.org"', 'mkdir -p .github/workflows'];
  cmds.push(C.HCU('.github/workflows/' + (o.file || 'ci.yml'), o.yml || CI.BASIC));
  (o.extraFiles || []).forEach(function (f) { cmds.push(C.HCU(f[0], f[1])); });
  cmds.push('git add .', 'git commit -m "Khởi tạo dự án và workflow CI"', 'git remote add origin ' + CI.REMOTE);
  if (!o.nopush) cmds.push('git push -u origin main');
  if (o.after) o.after.forEach(function (c) { cmds.push(c); });
  runq(s, cmds);
};
/* đọc workflow đã parse (null nếu lỗi cú pháp hoặc không có file) */
CI.doc = function (s, f) {
  var t = ftxt(s, CI.wfPath(s, f)); if (!t) return null;
  var P = GH.yparse(t); return P.errs.length ? null : P.doc;
};
CI.job = function (s, f, j) { var d = CI.doc(s, f); return d && d.jobs && typeof d.jobs === 'object' ? d.jobs[j] || null : null; };
CI.onKeys = function (d) {
  if (!d) return [];
  var on = d.on !== undefined ? d.on : d['true'];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.slice();
  return on && typeof on === 'object' ? Object.keys(on) : [];
};
CI.uses = function (job, re) { return !!job && Array.isArray(job.steps) && job.steps.some(function (st) { return typeof st.uses === 'string' && re.test(st.uses); }); };
CI.runs = function (job, re) { return !!job && Array.isArray(job.steps) && job.steps.some(function (st) { return typeof st.run === 'string' && re.test(st.run); }); };
CI.R = function (s) { return GH.repoOf(s, PROJ(s)); };
CI.st = function (s) { return GH.state(s); };
CI.lint = function (s, f) { return GH.lint(f, ftxt(s, CI.wfPath(s, f))).length === 0; };
CI.lastOK = function (s, re) { var r = null; s.hist.forEach(function (h) { if (re.test(h.cmd)) r = h.code === 0; }); return r === true; };
CI.anyFail = function (s, re) { return s.hist.some(function (h) { return h.code !== 0 && re.test(h.cmd); }); };
CI.runCount = function (s) { return CI.st(s).runs.length; };
CI.lastRun = function (s) { var r = CI.st(s).runs; return r.length ? r[r.length - 1] : null; };
CI.greenLast = function (s) { var r = CI.lastRun(s); return !!r && r.conclusion === 'success'; };
CI.headHas = function (s, path, re) { var t = CI.R(s).head[path]; return t != null && re.test(t); };
CI.pushed = function (s) { var R = CI.R(s); return Object.keys(R.pushed).length > 0; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
