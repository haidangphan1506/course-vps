(function (G) {
'use strict';
/* Mô phỏng CI/CD GitHub: git (add, commit, status, log, branch, tag, remote, push), actionlint, gh (run, workflow, secret, variable, pr).
   Trạng thái nằm ở sh.W.gh. Workflow chạy khi "push" tới remote giả lập. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr;
var origGit = cmds.git;

function ftext(sh, p) { var n = sh.fs.get(p); return n && n.t === 'f' ? String(n.c || '') : ''; }
function G0(sh) { if (!sh.W.gh) sh.W.gh = { repos: {}, secrets: {}, vars: {}, runs: [], nextRun: 9100, prs: [], cfg: {} }; return sh.W.gh; }
function root(sh) {
  var p = sh.cwd;
  while (true) { if (sh.fs.get((p === '/' ? '' : p) + '/.git')) return p; if (p === '/' || p === '') return null; p = p.replace(/\/[^\/]*$/, '') || '/'; }
}
function sha(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; var x = h.toString(16); while (x.length < 7) x = '0' + x; return x.slice(0, 7); }
function esc(p) { return p.replace(/[.+^${}()|\\]/g, '\\$&'); }

/* ---------- YAML nhỏ (đủ cho workflow) ---------- */
function stripComment(t) {
  var q = '', out = '';
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    if (q) { if (ch === q) q = ''; out += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(t.charAt(i - 1)))) break;
    out += ch;
  }
  return out.replace(/\s+$/, '');
}
function splitTop(s) {
  var out = [], cur = '', d = 0, q = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{') d++; if (ch === ']' || ch === '}') d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}
function scalar(v) {
  v = v.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if ((v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') || (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'")) return v.slice(1, -1);
  if (v.charAt(0) === '[' && v.charAt(v.length - 1) === ']') { var inner = v.slice(1, -1).trim(); return inner === '' ? [] : splitTop(inner).map(scalar); }
  if (v.charAt(0) === '{' && v.charAt(v.length - 1) === '}') {
    var o = {}; var in2 = v.slice(1, -1).trim();
    if (in2) splitTop(in2).forEach(function (kv) { var k = kv.indexOf(':'); if (k > 0) o[kv.slice(0, k).trim()] = scalar(kv.slice(k + 1)); });
    return o;
  }
  return v;
}
function keySplit(t) {
  var q = '';
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    if (q) { if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === ':' && (i === t.length - 1 || t.charAt(i + 1) === ' ')) return [t.slice(0, i), t.slice(i + 1)];
  }
  return null;
}
function yparse(text) {
  var errs = [], raw = String(text).split('\n'), L = [];
  raw.forEach(function (ln, i) {
    if (/^\s*\t/.test(ln)) { errs.push({ line: i + 1, col: 1, msg: "found character '\\t' that cannot start any token" }); }
    var s = ln.replace(/\t/g, '  ');
    L.push({ no: i + 1, raw: s, indent: s.match(/^ */)[0].length, text: stripComment(s).trim() });
  });
  var P = 0;
  function blank(i) { return L[i].text === ''; }
  function skip() { while (P < L.length && blank(P)) P++; }
  function parseBlock() {
    skip(); if (P >= L.length) return null;
    var cur = L[P];
    if (/^-( |$)/.test(cur.text)) return parseList(cur.indent);
    return parseMap(cur.indent);
  }
  function parseList(ind) {
    var arr = []; arr._l = [];
    while (true) {
      skip(); if (P >= L.length) break;
      var cur = L[P];
      if (cur.indent !== ind || !/^-( |$)/.test(cur.text)) break;
      var rest = cur.text.replace(/^-\s*/, '');
      arr._l.push(cur.no);
      if (rest === '') { P++; skip(); if (P < L.length && L[P].indent > ind) arr.push(parseBlock()); else arr.push(null); continue; }
      var ks = keySplit(rest);
      if (ks && !/^[\[{"']/.test(rest)) {
        var col = ind + (cur.text.length - rest.length);
        L[P] = { no: cur.no, raw: cur.raw, indent: col, text: rest };
        arr.push(parseMap(col));
      } else { P++; arr.push(scalar(rest)); }
    }
    return arr;
  }
  function parseMap(ind) {
    var o = {}, pos = {};
    Object.defineProperty(o, '_l', { value: pos, enumerable: false });
    while (true) {
      skip(); if (P >= L.length) break;
      var cur = L[P];
      if (cur.indent < ind) break;
      if (cur.indent > ind) { errs.push({ line: cur.no, col: cur.indent + 1, msg: 'unexpected indentation (did not find expected key)' }); P++; continue; }
      var ks = keySplit(cur.text);
      if (!ks) { if (/^-( |$)/.test(cur.text)) break; errs.push({ line: cur.no, col: cur.indent + 1, msg: 'could not find expected ":"' }); P++; continue; }
      var key = scalar(ks[0]); if (key == null) key = ks[0].trim();
      var val = ks[1].trim(); pos[key] = cur.no;
      if (/^[|>][+-]?$/.test(val)) {
        P++; var buf = [], bi = null;
        while (P < L.length && (blank(P) || L[P].indent > ind)) { if (!blank(P)) { if (bi == null) bi = L[P].indent; buf.push(L[P].raw.slice(bi)); } else buf.push(''); P++; }
        o[key] = buf.join('\n').replace(/\n+$/, '') + '\n';
      } else if (val === '') {
        P++; skip();
        if (P < L.length && L[P].indent > ind) o[key] = parseBlock();
        else if (P < L.length && L[P].indent === ind && /^-( |$)/.test(L[P].text)) o[key] = parseList(ind);
        else o[key] = null;
      } else { P++; o[key] = scalar(val); }
    }
    return o;
  }
  var doc = parseBlock();
  skip();
  if (P < L.length) errs.push({ line: L[P].no, col: L[P].indent + 1, msg: 'unexpected content after document' });
  return { doc: doc, errs: errs };
}

/* ---------- actionlint ---------- */
var OLD = { 'actions/checkout': 4, 'actions/setup-node': 4, 'actions/cache': 4, 'actions/upload-artifact': 4, 'actions/download-artifact': 4, 'actions/setup-python': 5, 'docker/build-push-action': 5, 'docker/login-action': 3, 'docker/setup-buildx-action': 3 };
var RUNNERS = /^(ubuntu-(latest|22\.04|24\.04)(-arm)?|windows-(latest|2022|2025)|macos-(latest|13|14|15)(-large|-xlarge)?|self-hosted|\$\{\{.*\}\})$/;
var CTX = ['github', 'env', 'vars', 'job', 'jobs', 'steps', 'runner', 'secrets', 'strategy', 'matrix', 'needs', 'inputs', 'always', 'failure', 'success', 'cancelled', 'format', 'contains', 'startsWith', 'endsWith', 'hashFiles', 'toJSON', 'fromJSON', 'join', 'true', 'false', 'null'];
function asList(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function lint(file, text) {
  var out = [], P = yparse(text), doc = P.doc;
  function e(line, col, msg, rule) { out.push(file + ':' + line + ':' + (col || 1) + ': ' + msg + ' [' + rule + ']'); }
  P.errs.forEach(function (x) { e(x.line, x.col, x.msg, 'syntax-check'); });
  if (P.errs.length) return out;
  if (!doc || Array.isArray(doc) || typeof doc !== 'object') { e(1, 1, 'workflow must be a mapping', 'syntax-check'); return out; }
  if (doc.on === undefined && doc['true'] === undefined) e(1, 1, '"on" section is missing in workflow', 'syntax-check');
  if (!doc.jobs || typeof doc.jobs !== 'object') { e(1, 1, '"jobs" section is missing in workflow', 'syntax-check'); return out; }
  var names = Object.keys(doc.jobs);
  names.forEach(function (jn) {
    var j = doc.jobs[jn], jl = doc.jobs._l[jn];
    if (!j || typeof j !== 'object') { e(jl, 3, 'job "' + jn + '" must be a mapping', 'syntax-check'); return; }
    var reusable = j.uses != null;
    if (!reusable && j['runs-on'] == null) e(jl, 3, '"runs-on" section is missing in job "' + jn + '"', 'syntax-check');
    var ro = j['runs-on']; if (typeof ro === 'string' && !RUNNERS.test(ro)) e(j._l['runs-on'], 14, 'label "' + ro + '" is unknown. available labels are "ubuntu-latest", "ubuntu-24.04", "ubuntu-22.04", "windows-latest", "macos-latest", "self-hosted"', 'runner-label');
    if (!reusable && !Array.isArray(j.steps)) e(jl, 3, '"steps" section is missing in job "' + jn + '"', 'syntax-check');
    asList(j.needs).forEach(function (nd) { if (names.indexOf(nd) < 0) e(j._l.needs || jl, 12, 'job "' + jn + '" needs job "' + nd + '" which does not exist in this workflow', 'job-needs'); });
    (Array.isArray(j.steps) ? j.steps : []).forEach(function (st, i) {
      var ln = j.steps._l[i];
      if (!st || typeof st !== 'object') { e(ln, 9, 'step must be a mapping', 'syntax-check'); return; }
      if (st.run == null && st.uses == null) e(ln, 9, 'step must run script with "run" section or run action with "uses" section', 'syntax-check');
      if (typeof st.uses === 'string' && !/^\.\//.test(st.uses) && !/^docker:/.test(st.uses)) {
        var m = /^([^@]+)(?:@(.+))?$/.exec(st.uses);
        if (!m[2]) e(st._l.uses, 15, 'specifying action "' + m[1] + '" in invalid format because version is missing. available formats are "{owner}/{repo}@{ref}" or "{owner}/{repo}/{path}@{ref}"', 'action');
        else {
          var base = m[1].split('/').slice(0, 2).join('/'), vm = /^v(\d+)/.exec(m[2]);
          if (OLD[base] && vm && +vm[1] < OLD[base]) e(st._l.uses, 15, 'the runner of "' + st.uses + '" action is too old to run on GitHub Actions. update the action\'s version to fix this issue', 'action');
        }
      }
      if (typeof st.run === 'string' && /::set-output/.test(st.run)) e(st._l.run || ln, 14, 'workflow command "set-output" was deprecated. use `echo "{name}={value}" >> $GITHUB_OUTPUT` instead', 'deprecated-commands');
    });
  });
  String(text).split('\n').forEach(function (ln, i) {
    var re = /\$\{\{\s*([a-zA-Z_]+)[.\[ \}]/g, m;
    while ((m = re.exec(ln))) {
      if (CTX.indexOf(m[1]) < 0) e(i + 1, m.index + 1, 'undefined variable "' + m[1] + '". available variables are "env", "github", "inputs", "job", "jobs", "matrix", "needs", "runner", "secrets", "steps", "strategy", "vars"', 'expression');
    }
  });
  return out;
}
cmds.actionlint = function (a, c) {
  var sh = c.sh, files = a.filter(function (x) { return x.charAt(0) !== '-'; }), rt = root(sh) || sh.cwd, list = [];
  if (!files.length) {
    var dir = rt + '/.github/workflows';
    Object.keys(sh.fs.n).forEach(function (p) { if (p.indexOf(dir + '/') === 0 && /\.ya?ml$/.test(p) && sh.fs.n[p].t === 'f') list.push(p); });
    list.sort();
    if (!list.length) { c.err('no workflow files found. Did you put them in .github/workflows?\n'); return 1; }
  } else list = files.map(function (f) { return sh.abs(f); });
  var bad = 0;
  list.forEach(function (p) {
    if (!sh.fs.get(p)) { c.err('actionlint: ' + p + ': no such file\n'); bad++; return; }
    var rel = p.indexOf(rt + '/') === 0 ? p.slice(rt.length + 1) : p;
    var errs = lint(rel, ftext(sh, p));
    errs.forEach(function (x) { c.out(x + '\n'); });
    bad += errs.length;
  });
  return bad ? 1 : 0;
};

/* ---------- git ---------- */
function repoOf(sh, rt) { var g = G0(sh); if (!g.repos[rt]) g.repos[rt] = { branch: 'main', branches: ['main'], commits: [], head: {}, staged: {}, tags: [], remote: null, pushed: {}, pushedTags: [] }; return g.repos[rt]; }
function ignored(igtxt, rel) {
  var pats = igtxt.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x && x.charAt(0) !== '#'; }), segs = rel.split('/');
  return pats.some(function (p) { p = p.replace(/\/$/, ''); if (p.indexOf('*') < 0) return segs.indexOf(p) >= 0; var re = new RegExp('^' + esc(p).replace(/\*/g, '[^/]*') + '$'); return segs.some(function (s) { return re.test(s); }); });
}
function worktree(sh, rt) {
  var out = {}, ig = ftext(sh, rt + '/.gitignore');
  Object.keys(sh.fs.n).forEach(function (p) {
    if (p.indexOf(rt + '/') !== 0) return;
    var n = sh.fs.n[p]; if (n.t !== 'f' && n.t !== 'l') return;
    var rel = p.slice(rt.length + 1);
    if (rel.indexOf('.git/') === 0 || rel === '.git') return;
    if (ignored(ig, rel)) return;
    /* symlink: git lưu đường dẫn đích (mode 120000), hiển thị dạng '->đích' */
    out[rel] = n.t === 'l' ? '->' + n.target : String(n.c || '');
  });
  return out;
}
function glob(pat) { return new RegExp('^' + esc(pat).replace(/\*\*\//g, '(.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'); }
function gitStatus(sh, rt, R) {
  var wt = worktree(sh, rt), staged = Object.keys(R.staged), modified = [], untracked = [];
  Object.keys(wt).sort().forEach(function (p) {
    if (R.staged[p] != null) { if (R.staged[p] !== wt[p]) modified.push(p); return; }
    if (R.head[p] == null) untracked.push(p); else if (R.head[p] !== wt[p]) modified.push(p);
  });
  return { staged: staged.sort(), modified: modified, untracked: untracked, wt: wt };
}
function gitCmd(a, c) {
  var sh = c.sh;
  if (!sh.fs.get('/usr/bin/git')) throw new CmdErr('bash: git: command not found', 127);
  var sub = a[0], rest = a.slice(1);
  var mine = ['init', 'config', 'status', 'add', 'commit', 'log', 'branch', 'checkout', 'switch', 'tag', 'remote', 'push', 'diff', 'rm'];
  if (mine.indexOf(sub) < 0) return origGit(a, c);
  if (sub === 'init') {
    var rc = origGit(['init'], c);
    var rt0 = sh.cwd.replace(/\/$/, ''); var R0 = repoOf(sh, rt0); R0.branch = 'main'; R0.branches = ['main'];
    return rc;
  }
  var g = G0(sh);
  if (sub === 'config') {
    var vals = rest.filter(function (x) { return x.charAt(0) !== '-'; });
    var glob0 = rest.indexOf('--global') >= 0, rt1 = root(sh);
    if (rest.indexOf('--list') >= 0 || rest.indexOf('-l') >= 0) { Object.keys(g.cfg).forEach(function (k) { c.out(k + '=' + g.cfg[k] + '\n'); }); return 0; }
    if (rest.indexOf('--get') >= 0 || vals.length === 1) { var v = g.cfg[vals[0]]; if (v == null) return 1; c.out(v + '\n'); return 0; }
    if (vals.length >= 2) { if (!glob0 && !rt1) throw new CmdErr('fatal: not in a git directory', 128); g.cfg[vals[0]] = vals.slice(1).join(' '); return 0; }
    return 0;
  }
  var rt = root(sh);
  if (!rt) throw new CmdErr('fatal: not a git repository (or any of the parent directories): .git', 128);
  var R = repoOf(sh, rt);
  if (sub === 'status') {
    var S = gitStatus(sh, rt, R), short = rest.indexOf('-s') >= 0 || rest.indexOf('--short') >= 0;
    if (short) { S.staged.forEach(function (p) { c.out((R.head[p] == null ? 'A ' : 'M ') + ' ' + p + '\n'); }); S.modified.forEach(function (p) { c.out(' M ' + p + '\n'); }); S.untracked.forEach(function (p) { c.out('?? ' + p + '\n'); }); return 0; }
    c.out('On branch ' + R.branch + '\n');
    if (!R.commits.length) c.out('\nNo commits yet\n');
    if (S.staged.length) { c.out('\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n'); S.staged.forEach(function (p) { c.out('\t' + (R.head[p] == null ? 'new file:   ' : 'modified:   ') + p + '\n'); }); }
    if (S.modified.length) { c.out('\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n'); S.modified.forEach(function (p) { c.out('\tmodified:   ' + p + '\n'); }); }
    if (S.untracked.length) { c.out('\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n'); var seen = {}; S.untracked.forEach(function (p) { var top = p.indexOf('/') > 0 ? p.split('/')[0] + '/' : p; if (!seen[top]) { seen[top] = 1; c.out('\t' + top + '\n'); } }); }
    if (!S.staged.length && !S.modified.length && !S.untracked.length) c.out('\nnothing to commit, working tree clean\n');
    else if (!S.staged.length) c.out('\nno changes added to commit (use "git add" and/or "git commit -a")\n');
    return 0;
  }
  if (sub === 'add') {
    var paths = rest.filter(function (x) { return x.charAt(0) !== '-'; });
    var all = rest.indexOf('-A') >= 0 || rest.indexOf('--all') >= 0;
    if (!paths.length && !all) { c.err('Nothing specified, nothing added.\nhint: Maybe you wanted to say \'git add .\'?\n'); return 0; }
    var wt = worktree(sh, rt);
    if (all) paths = ['.'];
    for (var i = 0; i < paths.length; i++) {
      var ap = sh.abs(paths[i]), rel = ap === rt ? '' : ap.slice(rt.length + 1), hit = 0;
      Object.keys(wt).forEach(function (p) { if (rel === '' || p === rel || p.indexOf(rel + '/') === 0) { hit++; if (R.head[p] !== wt[p] || R.staged[p] != null) R.staged[p] = wt[p]; } });
      Object.keys(R.head).forEach(function (p) { if (wt[p] == null && (rel === '' || p === rel || p.indexOf(rel + '/') === 0)) { hit++; R.staged[p] = null; } });
      if (!hit) { c.err("fatal: pathspec '" + paths[i] + "' did not match any files\n"); return 128; }
    }
    return 0;
  }
  if (sub === 'commit') {
    var msg = null, auto = false;
    for (var k = 0; k < rest.length; k++) { var x = rest[k]; if (x === '-m') { msg = rest[++k]; } else if (x === '-a' || x === '-am') { auto = true; if (x === '-am') msg = rest[++k]; } else if (x.indexOf('--message=') === 0) msg = x.slice(10); }
    if (msg == null) { c.err('Aborting commit due to empty commit message.\n'); return 1; }
    if (!g.cfg['user.name'] || !g.cfg['user.email']) {
      c.err('Author identity unknown\n\n*** Please tell me who you are.\n\nRun\n\n  git config --global user.email "you@example.com"\n  git config --global user.name "Your Name"\n\nto set your account\'s default identity.\nOmit --global to set the identity only in this repository.\n\nfatal: unable to auto-detect email address (got \'' + sh.user + '@vps.(none)\')\n'); return 128;
    }
    var S2 = gitStatus(sh, rt, R);
    if (auto) S2.modified.forEach(function (p) { if (R.head[p] != null) R.staged[p] = S2.wt[p]; });
    var keys = Object.keys(R.staged);
    if (!keys.length) { c.out('On branch ' + R.branch + '\n' + (S2.untracked.length ? 'Untracked files:\n  (use "git add <file>..." to include in what will be committed)\n' + S2.untracked.map(function (p) { return '\t' + p + '\n'; }).join('') + '\nnothing added to commit but untracked files present (use "git add" to track)\n' : 'nothing to commit, working tree clean\n')); return 1; }
    keys.forEach(function (p) { if (R.staged[p] == null) delete R.head[p]; else R.head[p] = R.staged[p]; });
    R.staged = {};
    var id = sha(msg + R.commits.length + keys.join(','));
    R.commits.push({ id: id, msg: msg, files: keys.slice(), branch: R.branch });
    c.out('[' + R.branch + (R.commits.length === 1 ? ' (root-commit)' : '') + ' ' + id + '] ' + msg + '\n ' + keys.length + ' file' + (keys.length > 1 ? 's' : '') + ' changed\n');
    return 0;
  }
  if (sub === 'log') {
    var one = rest.indexOf('--oneline') >= 0;
    if (!R.commits.length) { c.err("fatal: your current branch '" + R.branch + "' does not have any commits yet\n"); return 128; }
    R.commits.slice().reverse().forEach(function (cm, i) {
      if (one) c.out(cm.id + (i === 0 ? ' (HEAD -> ' + R.branch + (R.tags.length && R.tags[R.tags.length - 1].at === cm.id ? ', tag: ' + R.tags[R.tags.length - 1].name : '') + ')' : '') + ' ' + cm.msg + '\n');
      else c.out('commit ' + cm.id + '\nAuthor: ' + (g.cfg['user.name'] || 'unknown') + ' <' + (g.cfg['user.email'] || '') + '>\n\n    ' + cm.msg + '\n\n');
    });
    return 0;
  }
  if (sub === 'branch') {
    var nm = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
    if (!nm) { R.branches.slice().sort().forEach(function (b) { c.out((b === R.branch ? '* ' : '  ') + b + '\n'); }); return 0; }
    if (R.branches.indexOf(nm) >= 0) { c.err("fatal: a branch named '" + nm + "' already exists\n"); return 128; }
    R.branches.push(nm); return 0;
  }
  if (sub === 'checkout' || sub === 'switch') {
    var create = rest.indexOf('-b') >= 0 || rest.indexOf('-c') >= 0 || rest.indexOf('-B') >= 0;
    var tn = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
    if (!tn) return 0;
    if (create) { if (R.branches.indexOf(tn) >= 0) { c.err("fatal: a branch named '" + tn + "' already exists\n"); return 128; } R.branches.push(tn); R.branch = tn; c.err("Switched to a new branch '" + tn + "'\n"); return 0; }
    if (R.branches.indexOf(tn) < 0) { c.err("error: pathspec '" + tn + "' did not match any file(s) known to git\n"); return 1; }
    R.branch = tn; c.err("Switched to branch '" + tn + "'\n"); return 0;
  }
  if (sub === 'tag') {
    var mi = rest.indexOf('-m'), tv = rest.filter(function (x, ix) { return x.charAt(0) !== '-' && !(mi >= 0 && ix === mi + 1); });
    if (!tv.length) { R.tags.map(function (t) { return t.name; }).sort().forEach(function (t) { c.out(t + '\n'); }); return 0; }
    if (!R.commits.length) { c.err("fatal: Failed to resolve 'HEAD' as a valid ref.\n"); return 128; }
    if (R.tags.some(function (t) { return t.name === tv[0]; })) { c.err("fatal: tag '" + tv[0] + "' already exists\n"); return 128; }
    R.tags.push({ name: tv[0], at: R.commits[R.commits.length - 1].id }); return 0;
  }
  if (sub === 'remote') {
    if (rest[0] === 'add') { if (R.remote) { c.err('error: remote ' + rest[1] + ' already exists.\n'); return 3; } R.remote = { name: rest[1], url: rest[2] }; return 0; }
    if (rest[0] === 'remove' || rest[0] === 'rm') { R.remote = null; return 0; }
    if (rest[0] === 'set-url') { if (R.remote) R.remote.url = rest[2]; return 0; }
    if (R.remote) { if (rest[0] === '-v') c.out(R.remote.name + '\t' + R.remote.url + ' (fetch)\n' + R.remote.name + '\t' + R.remote.url + ' (push)\n'); else c.out(R.remote.name + '\n'); }
    return 0;
  }
  if (sub === 'diff') { var S3 = gitStatus(sh, rt, R); S3.modified.forEach(function (p) { c.out('diff --git a/' + p + ' b/' + p + '\n'); }); return 0; }
  if (sub === 'rm') { var tgt = rest.filter(function (x) { return x.charAt(0) !== '-'; }), cached = rest.indexOf('--cached') >= 0; tgt.forEach(function (t) { if (R.head[t] != null) { R.staged[t] = null; if (!cached) sh.fs.rm(rt + '/' + t); c.out("rm '" + t + "'\n"); } }); return 0; }
  if (sub === 'push') {
    var args = rest.filter(function (x) { return x.charAt(0) !== '-'; });
    var pushTags = rest.indexOf('--tags') >= 0;
    if (!R.remote) { c.err('fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>\n'); return 128; }
    if (!R.commits.length) { c.err("error: src refspec " + R.branch + " does not match any\nerror: failed to push some refs to '" + R.remote.url + "'\n"); return 1; }
    var ref = args[1] || R.branch, isTag = R.tags.some(function (t) { return t.name === ref; });
    if (!isTag && R.branches.indexOf(ref) < 0 && !pushTags) { c.err("error: src refspec " + ref + " does not match any\n"); return 1; }
    c.err('To ' + R.remote.url + '\n');
    var evs = [];
    if (pushTags) {
      R.tags.forEach(function (t) { if (R.pushedTags.indexOf(t.name) < 0) { R.pushedTags.push(t.name); c.err(' * [new tag]         ' + t.name + ' -> ' + t.name + '\n'); evs.push({ ev: 'push', tag: t.name }); } });
    } else if (isTag) {
      if (R.pushedTags.indexOf(ref) < 0) { R.pushedTags.push(ref); c.err(' * [new tag]         ' + ref + ' -> ' + ref + '\n'); evs.push({ ev: 'push', tag: ref }); } else c.err('Everything up-to-date\n');
    } else {
      var prev = R.pushed[ref] || 0, now = R.commits.length;
      if (prev === now) { c.err('Everything up-to-date\n'); return 0; }
      c.err(prev ? '   ' + R.commits[prev - 1].id + '..' + R.commits[now - 1].id + '  ' + ref + ' -> ' + ref + '\n' : ' * [new branch]      ' + ref + ' -> ' + ref + '\n');
      var changed = {}; R.commits.slice(prev).forEach(function (cm) { cm.files.forEach(function (f) { changed[f] = 1; }); });
      R.pushed[ref] = now; evs.push({ ev: 'push', branch: ref, changed: Object.keys(changed) });
    }
    evs.forEach(function (ev) { fireEvent(sh, R, ev); });
    return 0;
  }
  return origGit(a, c);
};
cmds.git = gitCmd;

/* ---------- chạy workflow ---------- */
function workflowFiles(R) { return Object.keys(R.head).filter(function (p) { return /^\.github\/workflows\/[^\/]+\.ya?ml$/.test(p); }).sort(); }
function eventSpec(doc, name) {
  var on = doc.on !== undefined ? doc.on : doc['true']; if (on == null) return null;
  if (typeof on === 'string') return on === name ? {} : null;
  if (Array.isArray(on)) return on.indexOf(name) >= 0 ? {} : null;
  if (typeof on === 'object' && Object.prototype.hasOwnProperty.call(on, name)) return on[name] || {};
  return null;
}
function fireEvent(sh, R, e) {
  workflowFiles(R).forEach(function (f) {
    var P = yparse(R.head[f]);
    if (P.errs.length || !P.doc || typeof P.doc !== 'object') { recordRun(sh, R, f, e.ev === 'pr' ? 'pull_request' : 'push', e, null, true); return; }
    var spec = eventSpec(P.doc, e.ev === 'pr' ? 'pull_request' : 'push'); if (!spec) return;
    if (e.ev === 'push' && e.tag) { var tg = asList(spec.tags); if (!tg.length || !tg.some(function (t) { return glob(String(t)).test(e.tag); })) return; }
    else if (e.ev === 'push') {
      if (asList(spec.tags).length && !asList(spec.branches).length) return;
      var br = asList(spec.branches); if (br.length && !br.some(function (b) { return glob(String(b)).test(e.branch); })) return;
      var bi = asList(spec['branches-ignore']); if (bi.length && bi.some(function (b) { return glob(String(b)).test(e.branch); })) return;
      var ps = asList(spec.paths); if (ps.length && !e.changed.some(function (f2) { return ps.some(function (p) { return glob(String(p)).test(f2); }); })) return;
    } else if (e.ev === 'pr') {
      var br2 = asList(spec.branches); if (br2.length && !br2.some(function (b) { return glob(String(b)).test(e.base); })) return;
    }
    recordRun(sh, R, f, e.ev === 'pr' ? 'pull_request' : 'push', e, P.doc);
  });
}
function evalIf(cond, ctx) {
  if (cond == null) return true;
  var t = String(cond).replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim(), m;
  if (t === 'always()') return true;
  if (t === 'failure()') return ctx.failed;
  if (t === 'success()') return !ctx.failed;
  if ((m = /^github\.ref\s*==\s*'([^']*)'$/.exec(t))) return ctx.ref === m[1];
  if ((m = /^github\.ref\s*!=\s*'([^']*)'$/.exec(t))) return ctx.ref !== m[1];
  if ((m = /^startsWith\(github\.ref,\s*'([^']*)'\)$/.exec(t))) return ctx.ref.indexOf(m[1]) === 0;
  if ((m = /^github\.event_name\s*==\s*'([^']*)'$/.exec(t))) return ctx.event === m[1];
  if ((m = /^github\.event_name\s*!=\s*'([^']*)'$/.exec(t))) return ctx.event !== m[1];
  return true;
}
function recordRun(sh, R, file, event, e, doc, invalid) {
  var g = G0(sh), id = g.nextRun++, name = doc && doc.name ? String(doc.name) : file.replace(/^.*\//, '');
  var ref = e.tag ? 'refs/tags/' + e.tag : 'refs/heads/' + (e.branch || e.head || R.branch);
  var run = { id: id, name: name, file: file.replace(/^.*\//, ''), event: event, branch: e.tag || e.branch || e.head || R.branch, title: (R.commits[R.commits.length - 1] || {}).msg || '', conclusion: 'success', jobs: [], log: [], when: id - 9100 + 1 };
  g.nextRun = id + 1;
  if (invalid || !doc) { run.conclusion = 'failure'; run.invalid = true; run.log.push('Invalid workflow file: ' + file + ' (xem lỗi bằng actionlint)'); g.runs.push(run); return run; }
  var lintErr = lint(file, R.head[file]);
  if (lintErr.length) { run.conclusion = 'failure'; run.invalid = true; lintErr.forEach(function (l) { run.log.push('Invalid workflow file: ' + l); }); g.runs.push(run); return run; }
  var jobs = doc.jobs, names = Object.keys(jobs), done = {}, failedAny = false;
  var pkg = R.head['package.json'] || R.head['projects/tutor/package.json'] || '';
  names.forEach(function (jn) {
    var j = jobs[jn], needs = asList(j.needs), jr = { name: j.name ? String(j.name) : jn, id: jn, conclusion: 'success', steps: [] };
    var blocked = needs.some(function (n) { return done[n] !== 'success'; });
    if (j.if != null ? !evalIf(j.if, { failed: blocked, ref: ref, event: event }) : (blocked)) { jr.conclusion = 'skipped'; done[jn] = 'skipped'; run.jobs.push(jr); return; }
    var steps = Array.isArray(j.steps) ? j.steps : [], hasCheckout = false, jobFailed = false;
    steps.forEach(function (st) {
      var sn = st.name ? String(st.name) : (st.uses ? 'Run ' + st.uses : 'Run ' + String(st.run || '').split('\n')[0].slice(0, 40));
      var sr = { name: sn, conclusion: 'success' };
      if (jobFailed && !(st.if && /always\(\)|failure\(\)/.test(String(st.if)))) { sr.conclusion = 'skipped'; jr.steps.push(sr); return; }
      if (st.if != null && !evalIf(st.if, { failed: jobFailed, ref: ref, event: event })) { sr.conclusion = 'skipped'; jr.steps.push(sr); return; }
      if (st.uses && /^actions\/checkout@/.test(String(st.uses))) hasCheckout = true;
      var sm = JSON.stringify(st).match(/\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}/g) || [];
      for (var q = 0; q < sm.length; q++) {
        var nm = /secrets\.([A-Za-z0-9_]+)/.exec(sm[q])[1];
        if (nm !== 'GITHUB_TOKEN' && g.secrets[nm] == null) { sr.conclusion = 'failure'; run.log.push(jr.name + ' / ' + sn + ': ##[error]Secret ' + nm + ' is empty. Hãy thêm secret: gh secret set ' + nm); break; }
      }
      var script = typeof st.run === 'string' ? st.run : '', wd = !!st['working-directory'] || !!(j.defaults && j.defaults.run);
      if (sr.conclusion === 'success' && script) {
        if (/(^|\n)\s*npm (ci|test|run|install)\b/.test(script) && !hasCheckout) { sr.conclusion = 'failure'; run.log.push(jr.name + ' / ' + sn + ': ##[error]npm error code ENOENT: no such file or directory, open \'package.json\'. Thiếu bước actions/checkout trước bước này.'); }
        else if (/(^|\n)\s*npm ci\b/.test(script) && !wd && R.head['package-lock.json'] == null) { sr.conclusion = 'failure'; run.log.push(jr.name + ' / ' + sn + ': ##[error]npm error The `npm ci` command can only install with an existing package-lock.json'); }
        else if (/(^|\s)exit [1-9]/.test(script)) { sr.conclusion = 'failure'; run.log.push(jr.name + ' / ' + sn + ': ##[error]Process completed with exit code 1.'); }
        else if (/(^|\n)\s*npm (run )?test\b/.test(script) && !wd && pkg && !/"test"\s*:/.test(pkg)) { sr.conclusion = 'failure'; run.log.push(jr.name + ' / ' + sn + ': ##[error]npm error Missing script: "test"'); }
      }
      if (sr.conclusion === 'failure') jobFailed = true;
      jr.steps.push(sr);
    });
    if (jobFailed) { jr.conclusion = 'failure'; failedAny = true; }
    if (j.environment) jr.env = typeof j.environment === 'string' ? j.environment : j.environment.name;
    done[jn] = jr.conclusion; run.jobs.push(jr);
  });
  if (failedAny) run.conclusion = 'failure';
  g.runs.push(run); return run;
}

/* ---------- gh ---------- */
function ago(g, r) { var d = g.nextRun - 9100 - r.when + 1; return d <= 1 ? 'just now' : d + 'm'; }
function sym(c) { return c === 'success' ? '✓' : (c === 'failure' ? 'X' : (c === 'skipped' ? '-' : '*')); }
cmds.gh = function (a, c) {
  var sh = c.sh, g = G0(sh), sub = a[0], act = a[1], rest = a.slice(2);
  if (!sub || sub === '--help') { c.out('Work seamlessly with GitHub from the command line.\n\nUSAGE\n  gh <command> <subcommand> [flags]\n\nCORE COMMANDS\n  pr:          Manage pull requests\n  run:         View details about workflow runs\n  secret:      Manage GitHub secrets\n  variable:    Manage GitHub Actions variables\n  workflow:    View details about GitHub Actions workflows\n'); return 0; }
  if (sub === 'auth') { c.out('github.com\n  ✓ Logged in to github.com account haidangphan1506 (keyring)\n  - Active account: true\n  - Git operations protocol: ssh\n  - Token scopes: \'repo\', \'workflow\', \'read:org\'\n'); return 0; }
  var rt = root(sh), R = rt ? repoOf(sh, rt) : null;
  if (!R || !R.remote) { c.err('failed to determine base repo: no git remotes found (hãy chạy git remote add origin <url>)\n'); return 1; }
  if (sub === 'secret' || sub === 'variable') {
    var bag = sub === 'secret' ? g.secrets : g.vars;
    if (act === 'set') {
      var nm = rest.filter(function (x, ix) { return x.charAt(0) !== '-' && !(ix > 0 && (rest[ix - 1] === '--body' || rest[ix - 1] === '-b')); })[0];
      var bi = rest.indexOf('--body'); if (bi < 0) bi = rest.indexOf('-b');
      var val = bi >= 0 ? rest[bi + 1] : c.stdin;
      if (!nm) { c.err('must pass name argument\n'); return 1; }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm) || /^GITHUB_/i.test(nm)) { c.err('X Failed to set ' + sub + ': ' + nm + ' has invalid name (chỉ chữ, số, gạch dưới; không bắt đầu bằng GITHUB_)\n'); return 1; }
      if (val == null || String(val) === '') { c.err('body cannot be blank (dùng --body hoặc đưa giá trị qua stdin)\n'); return 1; }
      bag[nm] = sub === 'secret' ? 'enc' : String(val).trim();
      c.out('✓ Set ' + (sub === 'secret' ? 'Actions secret ' : 'Actions variable ') + nm + ' for haidangphan1506/course-vps\n'); return 0;
    }
    if (act === 'list') { Object.keys(bag).sort().forEach(function (k) { c.out(k + '\t' + (sub === 'secret' ? 'Updated just now' : bag[k]) + '\n'); }); return 0; }
    if (act === 'delete') { delete bag[rest[0]]; c.out('✓ Deleted ' + sub + ' ' + rest[0] + '\n'); return 0; }
    return 0;
  }
  if (sub === 'workflow') {
    var files = R.pushed[R.branch] || Object.keys(R.pushed).length ? workflowFiles(R) : [];
    if (act === 'list') { files.forEach(function (f) { var P = yparse(R.head[f]); c.out((P.doc && P.doc.name ? P.doc.name : f.replace(/^.*\//, '')) + '\tactive\t' + (4000 + sha(f).charCodeAt(0)) + '\n'); }); return 0; }
    if (act === 'run') {
      var wf = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
      var hit = files.filter(function (f) { return f.replace(/^.*\//, '') === wf || (yparse(R.head[f]).doc || {}).name === wf; })[0];
      if (!hit) { c.err('could not find any workflows named ' + wf + ' (workflow phải được push lên GitHub trước)\n'); return 1; }
      var doc = yparse(R.head[hit]).doc;
      if (!doc || eventSpec(doc, 'workflow_dispatch') == null) { c.err("could not create workflow dispatch event: HTTP 422: Workflow does not have 'workflow_dispatch' trigger\n"); return 1; }
      recordRun(sh, R, hit, 'workflow_dispatch', { ev: 'push', branch: R.branch }, doc);
      c.out('✓ Created workflow_dispatch event for ' + hit.replace(/^.*\//, '') + ' at ' + R.branch + '\n\nTo see runs for this workflow, try: gh run list --workflow=' + hit.replace(/^.*\//, '') + '\n'); return 0;
    }
    return 0;
  }
  if (sub === 'run') {
    if (act === 'list') {
      if (!g.runs.length) { c.out('\n'); return 0; }
      c.out('STATUS\tTITLE\tWORKFLOW\tBRANCH\tEVENT\tID\tELAPSED\tAGE\n');
      g.runs.slice().reverse().forEach(function (r) { c.out((r.conclusion === 'success' ? '✓' : 'X') + '\t' + r.title + '\t' + r.name + '\t' + r.branch + '\t' + r.event + '\t' + r.id + '\t' + (12 + r.jobs.length * 9) + 's\t' + ago(g, r) + '\n'); });
      return 0;
    }
    if (act === 'view') {
      var rid = rest.filter(function (x) { return /^\d+$/.test(x); })[0];
      var r = rid ? g.runs.filter(function (x) { return String(x.id) === rid; })[0] : g.runs[g.runs.length - 1];
      if (!r) { c.err('could not find any workflow run\n'); return 1; }
      if (rest.indexOf('--log-failed') >= 0 || rest.indexOf('--log') >= 0) { if (!r.log.length) c.out('(không có bước nào lỗi)\n'); r.log.forEach(function (l) { c.out(l + '\n'); }); return 0; }
      c.out(sym(r.conclusion) + ' ' + r.branch + ' ' + r.name + ' · ' + r.id + '\nTriggered via ' + r.event + ' ' + ago(g, r) + '\n\nJOBS\n');
      if (r.invalid) c.out('X Invalid workflow file\n  ' + r.log[0] + '\n');
      r.jobs.forEach(function (j) { c.out(sym(j.conclusion) + ' ' + j.name + (j.env ? ' (environment: ' + j.env + ')' : '') + '\n'); j.steps.forEach(function (s) { c.out('  ' + sym(s.conclusion) + ' ' + s.name + '\n'); }); });
      if (r.conclusion === 'failure') c.out('\nTo see what failed, try: gh run view ' + r.id + ' --log-failed\n');
      return 0;
    }
    if (act === 'rerun') {
      var rr = g.runs[g.runs.length - 1]; if (!rr) return 1;
      c.out('✓ Requested rerun of run ' + rr.id + '\n');
      var f2 = workflowFiles(R).filter(function (f) { return f.replace(/^.*\//, '') === rr.file; })[0];
      if (f2) { var P2 = yparse(R.head[f2]); recordRun(sh, R, f2, rr.event, { ev: 'push', branch: rr.branch }, P2.doc, !!P2.errs.length); }
      return 0;
    }
    return 0;
  }
  if (sub === 'pr') {
    if (act === 'create') {
      var ti = rest.indexOf('--title'), title = ti >= 0 ? rest[ti + 1] : R.branch;
      if (R.branch === 'main') { c.err('X Pull request cần một nhánh khác main (git switch -c <nhánh>)\n'); return 1; }
      if (!R.pushed[R.branch]) { c.err('aborted: you must first push the current branch to a remote (git push -u origin ' + R.branch + ')\n'); return 1; }
      var n = g.prs.length + 1; g.prs.push({ n: n, title: title, head: R.branch, base: 'main', state: 'OPEN' });
      fireEvent(sh, R, { ev: 'pr', head: R.branch, base: 'main' });
      c.out('\nhttps://github.com/haidangphan1506/course-vps/pull/' + n + '\n'); return 0;
    }
    if (act === 'list') { g.prs.forEach(function (p) { c.out('#' + p.n + '\t' + p.title + '\t' + p.head + '\n'); }); return 0; }
    if (act === 'checks') { var lr = g.runs[g.runs.length - 1]; if (!lr) { c.out('no checks reported\n'); return 0; } c.out((lr.conclusion === 'success' ? '✓' : 'X') + '\t' + lr.name + '\t' + lr.id + '\n'); return lr.conclusion === 'success' ? 0 : 1; }
    return 0;
  }
  if (sub === 'release') {
    if (act === 'create') {
      var tg = rest.filter(function (x) { return x.charAt(0) !== '-'; })[0];
      if (!tg) { c.err('tag argument required\n'); return 1; }
      if (!R.commits.length) { c.err('X Không có commit nào để phát hành\n'); return 1; }
      if (!R.tags.some(function (t) { return t.name === tg; })) R.tags.push({ name: tg, at: R.commits[R.commits.length - 1].id });
      if (R.pushedTags.indexOf(tg) < 0) { R.pushedTags.push(tg); fireEvent(sh, R, { ev: 'push', tag: tg }); }
      c.out('https://github.com/haidangphan1506/course-vps/releases/tag/' + tg + '\n'); return 0;
    }
    if (act === 'list') { R.pushedTags.slice().sort().forEach(function (t) { c.out(t + '\tLatest\t' + t + '\n'); }); return 0; }
    return 0;
  }
  c.err('gh: lệnh "' + sub + '" chưa được mô phỏng trong khung này\n'); return 1;
};

G.COURSE.GH = { yparse: yparse, lint: lint, root: root, repoOf: repoOf, state: G0, workflowFiles: workflowFiles, asList: asList };
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
