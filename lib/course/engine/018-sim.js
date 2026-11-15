(function (G) {
'use strict';
/* Lỗi build Dockerfile và npm cục bộ (bật bằng W.dkb): cú pháp, tag không tồn tại, npm ci/lockfile, script build, TypeScript, apt/apk. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr;
var prevDocker = cmds.docker, prevNpm = cmds.npm;
var OPS = 'FROM RUN CMD LABEL MAINTAINER EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL'.split(' ');
var TAGS = {
  node: /^(18|20|22|24|lts|latest|current)?(-(alpine|slim|bookworm|bookworm-slim|alpine3\.\d+))?$/,
  postgres: /^(14|15|16|17|latest)(-alpine)?$/, redis: /^(6|7|8|latest)(-alpine)?$/,
  nginx: /^(1\.\d+(\.\d+)?|stable|latest|alpine|mainline)(-alpine)?$/, alpine: /^(3\.\d+|latest|edge)$/, ubuntu: /^(20\.04|22\.04|24\.04|latest|noble|jammy)$/
};
function parseDf(text) {
  var raw = String(text).split('\n'), out = [], i = 0;
  while (i < raw.length) {
    var ln = i + 1, l = raw[i]; i++;
    if (/^\s*(#.*)?$/.test(l)) continue;
    var full = l.replace(/\s+$/, '');
    while (/\\$/.test(full) && i < raw.length) { full = full.replace(/\\$/, '') + ' ' + raw[i].trim(); i++; }
    var m = /^\s*([A-Za-z]+)\s*(.*)$/.exec(full); if (!m) continue;
    var rest = m[2], flags = {};
    rest = rest.replace(/^(--[\w-]+(?:=\S+)?\s+)+/, function (fl) { fl.trim().split(/\s+/).forEach(function (f) { var kv = /^--([\w-]+)(?:=(.*))?$/.exec(f); if (kv) flags[kv[1]] = kv[2] || true; }); return ''; });
    out.push({ op: m[1].toUpperCase(), rawOp: m[1], rest: rest.trim(), flags: flags, line: ln });
  }
  return out;
}
function globRe(p) { return new RegExp('^' + p.replace(/[.+^${}()|\[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0001/g, '.*') + '$'); }
function ignoreList(sh, dir) {
  var n = sh.fs.get(dir + '/.dockerignore'); if (!n || !n.c) return [];
  return String(n.c).split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x && x.charAt(0) !== '#'; }).map(function (x) { var neg = x.charAt(0) === '!'; if (neg) x = x.slice(1); x = x.replace(/^\/+/, '').replace(/\/+$/, ''); return { neg: neg, re: globRe(x) }; });
}
function isIgnored(rel, pats) {
  var res = false, parts = rel.split('.dockerignore').join('.dockerignore').split('/');
  pats.forEach(function (p) { for (var j = 1; j <= parts.length; j++) if (p.re.test(parts.slice(0, j).join('/'))) { res = !p.neg; return; } });
  return res;
}
function ctxFiles(sh, dir) {
  var pats = ignoreList(sh, dir), pre = dir + '/', out = [];
  Object.keys(sh.fs.n).sort().forEach(function (k) { if (k.indexOf(pre) !== 0) return; var n = sh.fs.n[k]; if (n.t !== 'f') return; var rel = k.slice(pre.length); if (isIgnored(rel, pats)) return; out.push({ rel: rel, c: n.c || '' }); });
  return out;
}
function jparse(t) { try { return JSON.parse(t); } catch (e) { return null; } }
function lockMissing(pkg, lock) {
  var l = jparse(lock); if (!pkg || !l || !l.packages) return null;
  var deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {}), miss = null;
  Object.keys(deps).forEach(function (d) { if (!miss && !l.packages['node_modules/' + d]) miss = d + '@' + deps[d]; });
  return miss;
}
function tsError(files) {
  var hit = null;
  files.forEach(function (f) { if (hit || !/^src\/.*\.ts$/.test(f.rel)) return; var ls = f.c.split('\n'); for (var i = 0; i < ls.length; i++) { var m = /(\w+)\s*:\s*number\s*=\s*(["'])/.exec(ls[i]); if (m) { hit = { file: f.rel, line: i + 1, col: ls[i].indexOf(m[1]) + 1, name: m[1] }; return; } } });
  return hit;
}
function npmCi(hasPkg, pkg, lockTxt, hasLock, wd) {
  if (!hasPkg) return ['npm error code ENOENT', 'npm error syscall open', 'npm error path ' + wd + '/package.json', 'npm error errno -2', 'npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open \'' + wd + '/package.json\''];
  if (!hasLock) return ['npm error code EUSAGE', 'npm error', 'npm error The `npm ci` command can only install with an existing package-lock.json or', 'npm error npm-shrinkwrap.json with lockfileVersion >= 1. Run an install with npm@5 or', 'npm error later to generate a package-lock.json file, then try again.'];
  var miss = lockMissing(pkg, lockTxt);
  if (miss) return ['npm error code EUSAGE', 'npm error', 'npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.', 'npm error', 'npm error Missing: ' + miss + ' from lock file'];
  return null;
}
function runBuildErr(script, st, pkg, pkgName) {
  var scripts = (pkg && pkg.scripts) || {};
  if (!scripts[script]) return { code: 1, log: ['npm error Missing script: "' + script + '"', 'npm error', 'npm error To see a list of scripts, run:', 'npm error   npm run'] };
  var head = ['', '> ' + pkgName + '@1.0.0 ' + script, '> ' + scripts[script], ''];
  if (/nest build|tsc/.test(scripts[script]) && !st.nm) return { code: 127, log: head.concat(['sh: 1: nest: not found']) };
  if (/nest build|tsc/.test(scripts[script])) {
    if (!st.src) return { code: 1, log: head.concat(['error TS18003: No inputs were found in config file \'/app/tsconfig.json\'. Specified \'include\' paths were \'["**/*"]\' and \'exclude\' paths were \'["./dist"]\'.']) };
    if (!st.ts) return { code: 1, log: head.concat(['error TS5083: Cannot read file \'/app/tsconfig.json\'.']) };
    var te = tsError(st.srcFiles || []);
    if (te) return { code: 1, log: head.concat([te.file + ':' + te.line + ':' + te.col + ' - error TS2322: Type \'string\' is not assignable to type \'number\'.', '', ' ' + te.line + ' ' + (st.srcFiles.filter(function (f) { return f.rel === te.file; })[0].c.split('\n')[te.line - 1] || '').trim(), '   ~~~~~~', '', 'Found 1 error(s).'])};
  }
  return null;
}

function fail(c, o) {
  var steps = o.steps, n = steps.length, t = (2.4 + n * 1.7).toFixed(1);
  var s = '[+] Building ' + t + 's (' + (o.done + 6) + '/' + (o.total + 8) + ') FAILED                                    docker:default\n => [internal] load build definition from Dockerfile                          0.0s\n => => transferring dockerfile: ' + o.dfLen + 'B                                          0.0s\n => [internal] load metadata for docker.io/library/' + o.base + '          1.1s\n => [internal] load .dockerignore                                            0.0s\n => [internal] load build context                                           0.4s\n';
  steps.forEach(function (x) { s += ' => ' + x + '  0.' + (1 + (x.length % 8)) + 's\n'; });
  s += ' => ERROR ' + o.tag + ' ' + o.text + '                                           1.3s\n------\n > ' + o.tag + ' ' + o.text + ':\n';
  o.log.forEach(function (l, i) { s += (1 + i * 0.12).toFixed(3) + ' ' + l + '\n'; });
  s += '------\n\nDockerfile:' + o.line + '\n--------------------\n';
  var lines = o.dfLines, a = Math.max(1, o.line - 2), b = Math.min(lines.length, o.line + 2);
  for (var i = a; i <= b; i++) s += (i === o.line ? ' >>> ' : '     ') + (i < 10 ? ' ' : '') + i + ' | ' + lines[i - 1] + '\n';
  s += '--------------------\nERROR: failed to solve: process "/bin/sh -c ' + o.cmd + '" did not complete successfully: exit code: ' + o.code + '\n';
  c.err(s); return 1;
}

function parseBuildArgs(rest) {
  var ctx = null, file = null, i;
  var VAL = { '-t': 1, '--tag': 1, '--build-arg': 1, '--secret': 1, '--target': 1, '--progress': 1, '--platform': 1, '--label': 1, '--cache-from': 1, '--cache-to': 1, '--network': 1, '-o': 1, '--output': 1, '--build-context': 1 };
  for (i = 0; i < rest.length; i++) {
    var x = rest[i], eq = x.indexOf('='), long = eq > 0 && x.indexOf('--') === 0;
    var nm = long ? x.slice(0, eq) : x;
    if (nm === '-f' || nm === '--file') { file = long ? x.slice(eq + 1) : rest[++i]; continue; }
    if (VAL[nm]) { if (!long) i++; continue; }
    if (x.charAt(0) === '-') continue;
    ctx = x;
  }
  return { ctx: ctx, file: file };
}
/* trả về null nếu build sẽ qua phần kiểm tra của chương này; ném CmdErr hoặc trả về thông tin bước RUN thất bại */
function analyze(sh, ctx, file) {
  var dir = sh.abs(ctx);
  if (!sh.fs.isD(dir)) throw new CmdErr('ERROR: unable to prepare context: path "' + dir + '" not found');
  var dfPath = file ? sh.abs(file) : dir + '/Dockerfile', dfNode = sh.fs.get(dfPath);
  if (!dfNode) throw new CmdErr('ERROR: failed to solve: failed to read dockerfile: open ' + (file || 'Dockerfile') + ': no such file or directory');
  var dfLines = String(dfNode.c).split('\n'); if (dfLines[dfLines.length - 1] === '') dfLines.pop();
  var ins = parseDf(dfNode.c), j;
  // 1) cú pháp
  var seenFrom = false;
  for (j = 0; j < ins.length; j++) {
    var it = ins[j];
    if (OPS.indexOf(it.op) < 0) throw new CmdErr('ERROR: failed to solve: dockerfile parse error on line ' + it.line + ': unknown instruction: ' + it.rawOp);
    if (it.op === 'FROM') seenFrom = true;
    else if (!seenFrom && it.op !== 'ARG') throw new CmdErr('ERROR: failed to solve: dockerfile parse error on line ' + it.line + ': no build stage in current context');
    if ((it.op === 'COPY' || it.op === 'ADD') && !/^\[/.test(it.rest) && it.rest.split(/\s+/).filter(Boolean).length < 2) throw new CmdErr('ERROR: failed to solve: dockerfile parse error on line ' + it.line + ': ' + it.op + ' requires at least two arguments, but only one was provided. Destination could not be determined.');
    if (it.op === 'FROM' && !it.rest) throw new CmdErr('ERROR: failed to solve: dockerfile parse error on line ' + it.line + ': FROM requires either one or three arguments');
  }
  if (!ins.length) return null;
  // 2) tag base không tồn tại
  var names = {};
  ins.forEach(function (x) {
    if (x.op !== 'FROM') return;
    var m = /^(\S+)(?:\s+AS\s+(\S+))?$/i.exec(x.rest);
    if (!m) return;
    var ref = m[1];
    if (!/\$/.test(ref) && !names[ref]) {
      var rm = /^([a-z]+):(.+)$/.exec(ref);
      if (rm && TAGS[rm[1]] && !TAGS[rm[1]].test(rm[2])) throw new CmdErr('ERROR: failed to solve: ' + ref + ': failed to resolve source metadata for docker.io/library/' + ref + ': docker.io/library/' + ref + ': not found');
    }
    if (m[2]) names[m[2]] = true;
  });
  // 3) mô phỏng từng stage để tìm bước RUN thất bại
  var files = ctxFiles(sh, dir), stages = [], cur = null;
  var pkgFile = files.filter(function (f) { return f.rel === 'package.json'; })[0], pkg = pkgFile ? jparse(pkgFile.c) : null;
  var lockFile = files.filter(function (f) { return f.rel === 'package-lock.json'; })[0];
  ins.forEach(function (x) { if (x.op === 'FROM') { var m = /^(\S+)(?:\s+AS\s+(\S+))?/i.exec(x.rest) || [0, x.rest]; var parent = stages.filter(function (s) { return s.name === m[1]; })[0]; cur = { ref: m[1], name: m[2] || null, parent: parent || null, ins: [], line: x.line }; stages.push(cur); } else if (cur) cur.ins.push(x); });
  var multi = stages.length > 1;
  var failed = null;
  stages.forEach(function (st, si) {
    if (failed) return;
    var state = st.parent ? Object.assign({}, st.parent.state, { srcFiles: (st.parent.state.srcFiles || []).slice() }) : { pkg: false, lock: false, src: false, ts: false, nm: false, srcFiles: [], alpine: false };
    if (!st.parent) state.alpine = /alpine/.test(st.ref);
    st.state = state;
    var execs = [], wd = '/app';
    var exec = [{ text: 'FROM docker.io/library/' + st.ref }];
    st.ins.forEach(function (x) { if (/^(WORKDIR|COPY|ADD|RUN)$/.test(x.op)) exec.push(x); });
    var total = exec.length, idx = 1, label = multi ? (st.name || 'stage-' + si) + ' ' : '', done = ['[' + label + '1/' + total + '] FROM docker.io/library/' + st.ref];
    st.ins.forEach(function (x) {
      if (failed) return;
      if (!/^(WORKDIR|COPY|ADD|RUN)$/.test(x.op)) return;
      idx++;
      var text = x.op + ' ' + (x.flags.from ? '--from=' + x.flags.from + ' ' : '') + x.rest, tag = '[' + label + idx + '/' + total + ']';
      if (x.op === 'WORKDIR') { wd = x.rest; done.push(tag + ' ' + text); return; }
      if (x.op === 'COPY' || x.op === 'ADD') {
        if (!x.flags.from) {
          var toks = x.rest.replace(/^\[|\]$/g, '').replace(/"/g, '').replace(/,/g, ' ').trim().split(/\s+/), srcs = toks.slice(0, -1);
          srcs.forEach(function (sp) {
            var re = sp === '.' || sp === './' ? /.*/ : globRe(sp.replace(/^\.\//, '').replace(/\/$/, '')), nhit = 0;
            files.forEach(function (f) {
              var parts = f.rel.split('/'), hit = false, k;
              if (sp === '.' || sp === './') hit = true; else for (k = 1; k <= parts.length; k++) if (re.test(parts.slice(0, k).join('/'))) { hit = true; break; }
              if (!hit) return;
              nhit++;
              if (f.rel === 'package.json') state.pkg = true;
              if (f.rel === 'package-lock.json') state.lock = true;
              if (f.rel === 'tsconfig.json') state.ts = true;
              if (/^src\//.test(f.rel)) { state.src = true; state.srcFiles.push(f); }
            });
            if (!nhit && sp !== '.' && sp !== './') throw new CmdErr('ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref 7c1e0a9b3d5f4a28c6e1b09d::4f8a2c6e0b1d3a57e9c2f180: "/' + sp.replace(/^\.\//, '') + '": not found');
          });
        }
        done.push(tag + ' ' + text); return;
      }
      // RUN
      var cmdText = x.rest, log = null, code = 1, cmdShown = cmdText;
      var parts = cmdText.split(/\s*&&\s*/);
      for (var p = 0; p < parts.length && !log; p++) {
        var pc = parts[p].trim();
        if (/^apt(-get)?\b/.test(pc) && state.alpine) { log = ['/bin/sh: 1: ' + pc.split(/\s+/)[0] + ': not found'.replace('/bin/sh: 1: ', '')]; log = ['/bin/sh: ' + pc.split(/\s+/)[0] + ': not found']; code = 127; }
        else if (/^apk\b/.test(pc) && !state.alpine) { log = ['/bin/sh: 1: apk: not found']; code = 127; }
        else if (/^npm ci\b/.test(pc)) { var e1 = npmCi(state.pkg, pkg, lockFile ? lockFile.c : '', state.lock && !!lockFile, wd); if (e1) log = e1; else state.nm = true; }
        else if (/^(npm (install|i)\b|yarn( install)?$)/.test(pc)) { if (!state.pkg) log = npmCi(false, pkg, '', false, wd); else state.nm = true; }
        else if (/^npm run (\S+)/.test(pc)) { if (!state.pkg) log = npmCi(false, pkg, '', false, wd); else { var m2 = /^npm run (\S+)/.exec(pc), rb = runBuildErr(m2[1], state, pkg, (pkg && pkg.name) || 'app'); if (rb) { log = rb.log; code = rb.code; } } }
        else if (/^(npx )?nest build\b|^npx tsc\b/.test(pc) && !state.nm) { log = ['sh: 1: nest: not found']; code = 127; }
      }
      if (log) failed = { st: st, tag: tag, text: text, cmd: cmdShown, log: log, code: code, line: x.line, steps: done.slice(), total: total, base: st.ref };
      else done.push(tag + ' ' + text);
    });
    st.done = done;
  });
  if (failed) return { steps: failed.steps, done: failed.steps.length, total: failed.total, base: failed.base, tag: failed.tag, text: failed.text, cmd: failed.cmd, log: failed.log, code: failed.code, line: failed.line, dfLines: dfLines, dfLen: String(dfNode.c).length };
  return null;
}
V.dkbCheck = function (sh, ctx, file) { try { return analyze(sh, ctx, file) || null; } catch (e) { if (e instanceof CmdErr) return { type: 'throw', msg: e.msg }; throw e; } };
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.dkb || a[0] !== 'build') return prevDocker(a, c);
  var pa = parseBuildArgs(a.slice(1));
  if (!pa.ctx) return prevDocker(a, c);
  var dir = sh.abs(pa.ctx), dfp = pa.file ? sh.abs(pa.file) : dir + '/Dockerfile';
  if (sh.fs.isD(dir) && !sh.fs.get(dfp)) return prevDocker(a, c);
  var f = analyze(sh, pa.ctx, pa.file);
  if (f) return fail(c, f);
  return prevDocker(a, c);
};

cmds.npm = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.dkb || !sh.fs.isF(sh.cwd + '/package.json')) return prevNpm(a, c);
  var pk = jparse(sh.fs.get(sh.cwd + '/package.json').c);
  if (a[0] === 'ci') {
    var ln = sh.fs.get(sh.cwd + '/package-lock.json'), e = npmCi(true, pk, ln ? ln.c : '', !!ln, sh.cwd);
    if (e) { c.err(e.join('\n') + '\n'); return 1; }
    return prevNpm(a, c);
  }
  if ((a[0] === 'install' || a[0] === 'i') && a.length === 1 && pk) {
    var deps = Object.assign({}, pk.dependencies || {}, pk.devDependencies || {}), pk2 = { '': { name: pk.name, version: pk.version } };
    Object.keys(deps).forEach(function (d) { pk2['node_modules/' + d] = { version: String(deps[d]).replace(/^[\^~]/, '') }; });
    sh.fs.put(sh.cwd + '/package-lock.json', JSON.stringify({ name: pk.name, version: pk.version, lockfileVersion: 3, packages: pk2 }, null, 2) + '\n', { owner: sh.user });
    c.out('added ' + (Object.keys(deps).length * 14 + 3) + ' packages, and audited ' + (Object.keys(deps).length * 14 + 4) + ' packages in 9s\n'); return 0;
  }
  if (a[0] === 'run' && a[1]) {
    var files = ctxFiles(sh, sh.cwd), st = { nm: true, src: files.some(function (f) { return /^src\//.test(f.rel); }), ts: files.some(function (f) { return f.rel === 'tsconfig.json'; }), srcFiles: files.filter(function (f) { return /^src\//.test(f.rel); }) };
    var rb = runBuildErr(a[1], st, pk, (pk && pk.name) || 'app');
    if (rb) { c.err(rb.log.join('\n') + '\n'); return rb.code; }
  }
  return prevNpm(a, c);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
