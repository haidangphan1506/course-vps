(function (G) {
'use strict';
/* Kiểm tra Dockerfile (bật bằng W.dkb): lệnh hadolint và docker build --check. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr;
var prevDocker = cmds.docker;
function parse(text) {
  var raw = String(text).split('\n'), out = [], i = 0;
  while (i < raw.length) {
    var ln = i + 1, l = raw[i]; i++;
    if (/^\s*(#.*)?$/.test(l)) continue;
    var full = l.replace(/\s+$/, '');
    while (/\\$/.test(full) && i < raw.length) { full = full.replace(/\\$/, '') + ' ' + raw[i].trim(); i++; }
    var m = /^\s*([A-Za-z]+)\s*(.*)$/.exec(full); if (!m) continue;
    var rest = m[2].replace(/^(--[\w-]+(?:=\S+)?\s+)+/, '').trim();
    out.push({ op: m[1].toUpperCase(), rawOp: m[1], rest: rest, line: ln, src: raw[ln - 1] });
  }
  return out;
}
/* hadolint */
function hadolint(text) {
  var ins = parse(text), f = [], prevRun = false, lastUser = null, lastUserLine = 0;
  function add(i, code, sev, msg) { f.push({ line: i.line, code: code, sev: sev, msg: msg }); }
  ins.forEach(function (i) {
    var isRun = i.op === 'RUN';
    if (i.op === 'FROM') {
      var ref = i.rest.split(/\s+/)[0];
      if (ref !== 'scratch' && !/^\$/.test(ref) && !ins.some(function (x) { return x.op === 'FROM' && x.line < i.line && new RegExp('\\bAS\\s+' + ref + '$', 'i').test(x.rest); })) {
        if (!/:/.test(ref) && !/@sha256/.test(ref)) add(i, 'DL3006', 'warning', 'Always tag the version of an image explicitly');
        else if (/:latest$/.test(ref)) add(i, 'DL3007', 'warning', 'Using latest is prone to errors if the image will ever update. Pin the version explicitly to a release tag');
      }
    }
    if (i.op === 'ADD' && !/\.(tar|tgz|tar\.gz|tar\.xz|tar\.bz2)\b/.test(i.rest) && !/^https?:\/\//.test(i.rest)) add(i, 'DL3020', 'error', 'Use COPY instead of ADD for files and folders');
    if ((i.op === 'CMD' || i.op === 'ENTRYPOINT') && !/^\[/.test(i.rest)) add(i, 'DL3025', 'warning', 'Use arguments JSON notation for CMD and ENTRYPOINT arguments');
    if (i.op === 'WORKDIR' && !/^(\/|\$|"\/|'\/|[A-Za-z]:)/.test(i.rest)) add(i, 'DL3000', 'error', 'Use absolute WORKDIR');
    if (i.op === 'USER') { lastUser = i.rest.split(':')[0]; lastUserLine = i.line; }
    if (i.op === 'FROM') { lastUser = null; }
    if (isRun) {
      if (prevRun) add(i, 'DL3059', 'info', 'Multiple consecutive `RUN` instructions. Consider consolidation.');
      if (/(^|&&|;)\s*cd\s/.test(i.rest)) add(i, 'DL3003', 'warning', 'Use WORKDIR to switch to a directory');
      if (/apt-get\s+install/.test(i.rest)) {
        if (!/--no-install-recommends|-o APT::Install-Recommends=false/.test(i.rest)) add(i, 'DL3015', 'info', 'Avoid additional packages by specifying `--no-install-recommends`');
        if (!/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(i.rest) && !/apt-get\s+clean/.test(i.rest)) add(i, 'DL3009', 'info', 'Delete the apt-get lists after installing something');
        if (!/\s-y\b|--yes|-qq|--assume-yes/.test(i.rest)) add(i, 'DL3014', 'warning', 'Use the `-y` switch to avoid manual input `apt-get -y install <package>`');
      }
      if (/\bapk\s+add\b/.test(i.rest) && !/--no-cache/.test(i.rest)) add(i, 'DL3019', 'info', 'Use the `--no-cache` switch to avoid the need to use `--update` and remove `/var/cache/apk/*` when done installing packages');
      if (/\bsudo\b/.test(i.rest)) add(i, 'DL3004', 'error', 'Do not use sudo as it leads to unpredictable behavior. Use a tool like gosu to enforce root');
      if (/\bnpm\s+install\b/.test(i.rest) && !/--production|--omit/.test(i.rest) && false) add(i, 'DL3016', 'warning', '');
    }
    prevRun = isRun;
  });
  if (lastUser === 'root') f.push({ line: lastUserLine, code: 'DL3002', sev: 'warning', msg: 'Last USER should not be root' });
  f.sort(function (a, b) { return a.line - b.line; });
  return f;
}
/* docker build --check (BuildKit) */
var RULES = {
  JSONArgsRecommended: 'JSON arguments recommended for %OP to prevent unintended behavior related to OS signals',
  SecretsUsedInArgOrEnv: 'Do not use ARG or ENV instructions for sensitive data (%OP "%NAME")',
  ConsistentInstructionCasing: 'Command \'%OP\' should be consistently uppercase',
  LegacyKeyValueFormat: '"%OP key=value" should be used instead of legacy "%OP key value" format',
  FromAsCasing: "'as' and 'FROM' keywords' casing do not match",
  MultipleInstructionsDisallowed: 'Multiple %OP instructions should not be used in the same stage because only the last one will be used'
};
function checks(text) {
  var ins = parse(text), w = [], stage = -1, seen = {};
  ins.forEach(function (i) {
    function add(rule, extra) { w.push({ rule: rule, line: i.line, msg: RULES[rule].replace('%OP', extra && extra.op || i.op).replace('%NAME', extra && extra.name || '') , src: i.src }); }
    if (i.op === 'FROM') { stage++; seen = {}; if (/\sas\s/i.test(i.rest) && (/\sAS\s/.test(i.rest)) !== (i.rawOp === i.rawOp.toUpperCase()) && /\bas\b/.test(i.rest) === (i.rawOp === i.rawOp.toUpperCase())) add('FromAsCasing'); }
    if ((i.op === 'CMD' || i.op === 'ENTRYPOINT')) {
      if (!/^\[/.test(i.rest)) add('JSONArgsRecommended');
      if (seen[i.op]) add('MultipleInstructionsDisallowed'); seen[i.op] = true;
    }
    if (i.op === 'ENV' || i.op === 'ARG') {
      var nm = i.rest.split(/[=\s]/)[0];
      if (/(PASSWORD|SECRET|TOKEN|PASSWD|API_?KEY|PRIVATE_?KEY)/i.test(nm)) add('SecretsUsedInArgOrEnv', { name: nm });
      if (i.op === 'ENV' && /^\w+\s+[^=\s]/.test(i.rest) && !/^\w+=/.test(i.rest)) add('LegacyKeyValueFormat');
    }
    if (i.rawOp !== i.rawOp.toUpperCase()) add('ConsistentInstructionCasing', { op: i.rawOp });
  });
  return w;
}
function readDf(sh, a) {
  var p = a.filter(function (x) { return x.charAt(0) !== '-'; })[0] || 'Dockerfile';
  var n = sh.fs.get(sh.abs(p)); if (!n || n.t !== 'f') return { err: p };
  return { text: n.c, name: p };
}
cmds.hadolint = function (a, c) {
  var sh = c.sh, ign = [], rest = [], i;
  for (i = 0; i < a.length; i++) { if (a[i] === '--ignore' && a[i + 1]) { ign.push(a[++i]); } else rest.push(a[i]); }
  if (!rest.length) rest = ['Dockerfile'];
  var rc = 0;
  rest.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) {
    var n = sh.fs.get(sh.abs(p)); if (!n || n.t !== 'f') { c.err('hadolint: ' + p + ': openFile: does not exist (No such file or directory)\n'); rc = 1; return; }
    hadolint(n.c).filter(function (x) { return ign.indexOf(x.code) < 0; }).forEach(function (x) { c.out(p + ':' + x.line + ' ' + x.code + ' ' + x.sev + ': ' + x.msg + '\n'); rc = 1; });
  });
  return rc;
};
V.dkLint = function (text, ign) { return hadolint(text).filter(function (x) { return !ign || ign.indexOf(x.code) < 0; }); };
V.dkChecks = checks;
cmds.docker = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.dkb || a[0] !== 'build' || a.indexOf('--check') < 0) return prevDocker(a, c);
  var rest = a.slice(1).filter(function (x) { return x !== '--check'; }), file = null, k;
  for (k = 0; k < rest.length; k++) if ((rest[k] === '-f' || rest[k] === '--file') && rest[k + 1]) { file = rest[k + 1]; rest.splice(k, 2); break; }
  var ctx = rest.filter(function (x) { return x.charAt(0) !== '-'; }).pop();
  var dir = sh.abs(ctx || '.'), n = sh.fs.get(file ? sh.abs(file) : dir + '/Dockerfile');
  if (!n || n.t !== 'f') { c.err('ERROR: failed to solve: failed to read dockerfile: open ' + (file || 'Dockerfile') + ': no such file or directory\n'); return 1; }
  var w = checks(n.c), lines = String(n.c).split('\n');
  c.out('[+] Building 0.3s (3/3) FINISHED                                    docker:default\n => [internal] load build definition from ' + (file || 'Dockerfile') + '   0.0s\n => => transferring dockerfile: ' + n.c.length + 'B   0.0s\n => [internal] load .dockerignore   0.0s\n');
  w.forEach(function (x) {
    c.out('\n' + x.rule + ' - https://docs.docker.com/go/dockerfile/rule/' + x.rule.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '/\n' + x.msg + '\n' + (file || 'Dockerfile') + ':' + x.line + '\n--------------------\n');
    for (var j = Math.max(1, x.line - 2); j <= Math.min(lines.length, x.line + 1); j++) c.out((j === x.line ? ' >>> ' : '     ') + j + ' | ' + lines[j - 1] + '\n');
    c.out('--------------------\n');
  });
  c.out(w.length ? '\nCheck complete, ' + w.length + ' warning' + (w.length > 1 ? 's' : '') + ' found.\n' : '\nCheck complete, no warnings found.\n');
  return w.length && /^#\s*check=error=true/m.test(n.c) ? 1 : 0;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
