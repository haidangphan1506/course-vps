(function (G) {
'use strict';
/* Lệnh bổ sung cho shell mô phỏng: base64, cal, split, help, sudo -i / sudo -s (sort -R nằm trong 026-sim.js). */
var V = G.VPS, cmds = V.cmds, B = V.builtins, CmdErr = V.CmdErr;
function out(l) { return l.length ? l.join('\n') + '\n' : ''; }
function readFiles(c, files, who) {
  if (!files.length || (files.length === 1 && files[0] === '-')) return String(c.stdin || '');
  return files.map(function (p) { return p === '-' ? String(c.stdin || '') : c.sh.readFile(c.sh.abs(p), c, who); }).join('');
}

/* ---------- base64 ---------- */
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
function enc64(bytes) {
  var o = '', i;
  for (i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2], n = (b0 << 16) | ((b1 || 0) << 8) | (b2 || 0);
    o += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) + (b1 == null ? '=' : B64.charAt((n >> 6) & 63)) + (b2 == null ? '=' : B64.charAt(n & 63));
  }
  return o;
}
function dec64(s, ignore) {
  var t = s.replace(/\s+/g, '');
  if (ignore) t = t.replace(/[^A-Za-z0-9+\/=]/g, '');
  if (/[^A-Za-z0-9+\/=]/.test(t) || t.length % 4 || /=[^=]/.test(t) || /===/.test(t)) return null;
  var bytes = [], i;
  for (i = 0; i < t.length; i += 4) {
    var q = t.substr(i, 4), pad = (q.match(/=/g) || []).length;
    var n = (B64.indexOf(q.charAt(0)) << 18) | (B64.indexOf(q.charAt(1)) << 12) | ((q.charAt(2) === '=' ? 0 : B64.indexOf(q.charAt(2))) << 6) | (q.charAt(3) === '=' ? 0 : B64.indexOf(q.charAt(3)));
    bytes.push((n >> 16) & 255); if (pad < 2) bytes.push((n >> 8) & 255); if (pad < 1) bytes.push(n & 255);
  }
  return bytes;
}
cmds.base64 = function (a, c) {
  var decode = false, wrap = 76, ignore = false, files = [], i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-d' || x === '-D' || x === '--decode') decode = true;
    else if (x === '-i' || x === '--ignore-garbage') ignore = true;
    else if (x === '-w' || x === '--wrap') wrap = parseInt(a[++i], 10);
    else if (/^-w\d+$/.test(x)) wrap = parseInt(x.slice(2), 10);
    else if (/^--wrap=\d+$/.test(x)) wrap = parseInt(x.slice(7), 10);
    else if (x.charAt(0) === '-' && x.length > 1 && !/^-[di]+$/.test(x)) throw new CmdErr("base64: invalid option -- '" + x.replace(/^-+/, '') + "'\nTry 'base64 --help' for more information.", 1);
    else if (/^-[di]+$/.test(x)) { if (x.indexOf('d') >= 0) decode = true; if (x.indexOf('i') >= 0) ignore = true; }
    else files.push(x);
  }
  if (isNaN(wrap) || wrap < 0) throw new CmdErr("base64: invalid wrap size: '" + a[a.indexOf('-w') + 1] + "'", 1);
  var text = readFiles(c, files, 'base64');
  if (decode) {
    var bytes = dec64(text, ignore);
    if (!bytes) { c.err('base64: invalid input\n'); return 1; }
    c.out(new TextDecoder().decode(new Uint8Array(bytes))); return 0;
  }
  var e = enc64(utf8(text));
  if (!e) return 0;
  if (!wrap) { c.out(e + '\n'); return 0; }
  var rows = []; for (i = 0; i < e.length; i += wrap) rows.push(e.slice(i, i + wrap));
  c.out(out(rows)); return 0;
};

/* ---------- cal ---------- */
var MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function calMonth(y, m, mondayFirst) {
  var head = MN[m] + ' ' + y, w = 20, pad = Math.floor((w - head.length) / 2);
  var rows = [new Array(Math.max(0, pad) + 1).join(' ') + head, mondayFirst ? 'Mo Tu We Th Fr Sa Su' : 'Su Mo Tu We Th Fr Sa'];
  var first = new Date(Date.UTC(y, m, 1)).getUTCDay(), off = mondayFirst ? (first + 6) % 7 : first, days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  var cells = [], i; for (i = 0; i < off; i++) cells.push('  ');
  for (i = 1; i <= days; i++) cells.push((i < 10 ? ' ' : '') + i);
  for (i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(' '));
  return rows;
}
cmds.cal = function (a, c) {
  var nums = [], mon = false, three = false, one = false, year = false, i;
  a.forEach(function (x) {
    if (x === '-m' || x === '--monday') mon = true; else if (x === '-3' || x === '--three') three = true; else if (x === '-1' || x === '--one') one = true;
    else if (x === '-y' || x === '--year') year = true; else if (x === '-s' || x === '--sunday') mon = false;
    else if (/^\d+$/.test(x)) nums.push(parseInt(x, 10));
    else if (x.charAt(0) === '-') throw new CmdErr("cal: invalid option -- '" + x.replace(/^-+/, '') + "'", 1);
    else { var k = MN.findIndex(function (n) { return n.toLowerCase().indexOf(x.toLowerCase()) === 0; }); if (k < 0) throw new CmdErr("cal: illegal month value: use 1-12", 1); nums.unshift(k + 1); nums.length === 1 && nums.push(2026); }
  });
  var Y = 2026, M = 9;                       /* ngày mô phỏng: 27/10/2026 */
  if (nums.length === 1) { Y = nums[0]; year = true; M = null; }
  else if (nums.length >= 2) { M = nums[0] - 1; Y = nums[1]; if (M < 0 || M > 11) throw new CmdErr('cal: illegal month value: use 1-12', 1); }
  if (Y < 1 || Y > 9999) throw new CmdErr('cal: illegal year value: use 1-9999', 1);
  if (year && (M == null || nums.length === 0)) {
    var res = [new Array(Math.floor((62 - String(Y).length) / 2) + 1).join(' ') + Y, ''], m;
    for (m = 0; m < 12; m += 3) {
      var cols = [calMonth(Y, m, mon), calMonth(Y, m + 1, mon), calMonth(Y, m + 2, mon)], r, h = Math.max(cols[0].length, cols[1].length, cols[2].length);
      for (r = 0; r < h; r++) res.push(cols.map(function (cc) { var s = cc[r] || ''; return s + new Array(Math.max(0, 20 - s.length) + 1).join(' '); }).join('  ').replace(/\s+$/, ''));
      res.push('');
    }
    c.out(out(res)); return 0;
  }
  if (three) {
    var ms = [-1, 0, 1].map(function (d) { var t = M + d, yy = Y + Math.floor(t / 12); return calMonth(yy, ((t % 12) + 12) % 12, mon); }), o3 = [], r2;
    for (r2 = 0; r2 < 8; r2++) o3.push(ms.map(function (cc) { var s = cc[r2] || ''; return s + new Array(Math.max(0, 20 - s.length) + 1).join(' '); }).join('  ').replace(/\s+$/, ''));
    c.out(out(o3)); return 0;
  }
  c.out(out(calMonth(Y, M, mon))); return 0;
};

/* ---------- split ---------- */
function sizeOf(s) {
  var m = /^(\d+)([KMG]?)(B?)$/i.exec(s || '');
  if (!m) throw new CmdErr("split: invalid number of bytes: '" + s + "'", 1);
  return parseInt(m[1], 10) * ({ '': 1, K: 1024, M: 1048576, G: 1073741824 }[m[2].toUpperCase()]);
}
function suffix(i, len, numeric) {
  var s = '', base = numeric ? 10 : 26, k;
  for (k = 0; k < len; k++) { var d = i % base; i = Math.floor(i / base); s = (numeric ? String(d) : String.fromCharCode(97 + d)) + s; }
  return s;
}
cmds.split = function (a, c) {
  var sh = c.sh, lines = 1000, bytes = null, chunks = null, numeric = false, alen = 2, rest = [], verbose = false, i;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-l' || x === '--lines') lines = parseInt(a[++i], 10);
    else if (/^-l\d+$/.test(x)) lines = parseInt(x.slice(2), 10);
    else if (/^--lines=\d+$/.test(x)) lines = parseInt(x.slice(8), 10);
    else if (x === '-b' || x === '--bytes') bytes = sizeOf(a[++i]);
    else if (/^-b./.test(x)) bytes = sizeOf(x.slice(2));
    else if (/^--bytes=/.test(x)) bytes = sizeOf(x.slice(8));
    else if (x === '-n' || x === '--number') chunks = parseInt(a[++i], 10);
    else if (/^--number=\d+$/.test(x)) chunks = parseInt(x.slice(9), 10);
    else if (x === '-d' || x === '--numeric-suffixes') numeric = true;
    else if (x === '-a' || x === '--suffix-length') alen = parseInt(a[++i], 10);
    else if (x === '--verbose') verbose = true;
    else if (x.charAt(0) === '-' && x.length > 1) throw new CmdErr("split: invalid option -- '" + x.replace(/^-+/, '') + "'\nTry 'split --help' for more information.", 1);
    else rest.push(x);
  }
  if (!rest.length) throw new CmdErr("split: missing operand\nTry 'split --help' for more information.", 1);
  if ((lines != null && (isNaN(lines) || lines < 1)) && bytes == null && chunks == null) throw new CmdErr("split: invalid number of lines: '" + lines + "'", 1);
  var text = rest[0] === '-' ? String(c.stdin || '') : sh.readFile(sh.abs(rest[0]), c, 'split'), prefix = rest[1] != null ? rest[1] : 'x', parts = [], p;
  if (chunks != null) {
    if (isNaN(chunks) || chunks < 1) throw new CmdErr("split: invalid number of chunks: '" + chunks + "'", 1);
    var all = text, per = Math.ceil(all.length / chunks) || 1;
    for (p = 0; p < chunks; p++) parts.push(all.slice(p * per, (p + 1) * per));
  } else if (bytes != null) {
    for (p = 0; p < text.length; p += bytes) parts.push(text.slice(p, p + bytes));
  } else {
    var ls = text.split('\n'), trail = text.slice(-1) === '\n'; if (trail) ls.pop();
    for (p = 0; p < ls.length; p += lines) parts.push(ls.slice(p, p + lines).join('\n') + (p + lines < ls.length || trail ? '\n' : ''));
  }
  if (numeric && !a.some(function (x) { return x === '-a' || x === '--suffix-length'; })) alen = Math.max(alen, String(Math.max(parts.length - 1, 0)).length);   /* như GNU: hậu tố số tự giãn rộng */
  var cap = numeric ? Math.pow(10, alen) : Math.pow(26, alen);
  if (parts.length > cap) throw new CmdErr('split: output file suffixes exhausted', 1);
  parts.forEach(function (t, k) {
    var name = prefix + suffix(k, alen, numeric);
    sh.writeFile(sh.abs(name), t, c, 'split');
    if (verbose) c.out("creating file '" + name + "'\n");
  });
  return 0;
};

/* ---------- help (builtin của bash) ---------- */
var HELP = {
  cd: ['cd: cd [-L|[-P [-e]] [-@]] [dir]', '    Change the shell working directory.', '', '    Change the current directory to DIR.  The default DIR is the value of the', '    HOME shell variable.'],
  pwd: ['pwd: pwd [-LP]', '    Print the name of the current working directory.'],
  echo: ['echo: echo [-neE] [arg ...]', '    Write arguments to the standard output.'],
  exit: ['exit: exit [n]', '    Exit the shell.', '', '    Exits the shell with a status of N.  If N is omitted, the exit status', '    is that of the last command executed.'],
  export: ['export: export [-fn] [name[=value] ...] or export -p', '    Set export attribute for shell variables.'],
  alias: ['alias: alias [-p] [name[=value] ... ]', '    Define or display aliases.'],
  unalias: ['unalias: unalias [-a] name [name ...]', '    Remove each NAME from the list of defined aliases.'],
  history: ['history: history [-c] [-d offset] [n] or history -anrw [filename] or history -ps arg [arg...]', '    Display or manipulate the history list.'],
  type: ['type: type [-afptP] name [name ...]', '    Display information about command type.'],
  source: ['source: source filename [arguments]', '    Execute commands from a file in the current shell.'],
  read: ['read: read [-ers] [-a array] [-d delim] [-i text] [-n nchars] [-N nchars] [-p prompt] [-t timeout] [-u fd] [name ...]', '    Read a line from the standard input and split it into fields.'],
  set: ['set: set [-abefhkmnptuvxBCHP] [-o option-name] [--] [arg ...]', '    Set or unset values of shell options and positional parameters.'],
  unset: ['unset: unset [-f] [-v] [-n] [name ...]', '    Unset values and attributes of shell variables and functions.'],
  test: ['test: test [expr]', '    Evaluate conditional expression.'],
  jobs: ['jobs: jobs [-lnprs] [jobspec ...] or jobs -x command [args]', '    Display status of jobs.'],
  fg: ['fg: fg [job_spec]', '    Move job to the foreground.'],
  bg: ['bg: bg [job_spec ...]', '    Move jobs to the background.'],
  kill: ['kill: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', '    Send a signal to a job.'],
  umask: ['umask: umask [-p] [-S] [mode]', '    Display or set file mode mask.'],
  ulimit: ['ulimit: ulimit [-SHabcdefiklmnpqrstuvxPT] [limit]', '    Modify shell resource limits.'],
  help: ['help: help [-dms] [pattern ...]', '    Display information about builtin commands.'],
  wait: ['wait: wait [-fn] [-p var] [id ...]', '    Wait for job completion and return exit status.'],
  trap: ['trap: trap [-lp] [[arg] signal_spec ...]', '    Trap signals and other events.'],
  shift: ['shift: shift [n]', '    Shift positional parameters.'],
  eval: ['eval: eval [arg ...]', '    Execute arguments as a shell command.'],
  exec: ['exec: exec [-cl] [-a name] [command [argument ...]] [redirection ...]', '    Replace the shell with the given command.'],
  pushd: ['pushd: pushd [-n] [+N | -N | dir]', '    Add directories to stack.'],
  popd: ['popd: popd [-n] [+N | -N]', '    Remove directories from stack.'],
  declare: ['declare: declare [-aAfFgiIlnrtux] [name[=value] ...] or declare -p [-aAfFilnrtux] [name ...]', '    Set variable values and attributes.'],
  local: ['local: local [option] name[=value] ...', '    Define local variables.'],
  return: ['return: return [n]', '    Return from a shell function.'],
  break: ['break: break [n]', '    Exit for, while, or until loops.'],
  continue: ['continue: continue [n]', '    Resume for, while, or until loops.'],
  command: ['command: command [-pVv] command [arg ...]', '    Execute a simple command or display information about commands.'],
  builtin: ['builtin: builtin [shell-builtin [arg ...]]', '    Execute shell builtins.'],
  getopts: ['getopts: getopts optstring name [arg ...]', '    Parse option arguments.']
};
cmds.help = function (a, c) {
  var short = false, names = [];
  a.forEach(function (x) { if (x === '-d' || x === '-s') short = x === '-s' ? 'syn' : 'd'; else if (x === '-m') short = 'man'; else names.push(x); });
  if (!names.length) {
    c.out('GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)\nThese shell commands are defined internally.  Type \'help\' to see this list.\nType \'help name\' to find out more about the function \'name\'.\nUse \'info bash\' to find out more about the shell in general.\nUse \'man -k\' or \'info\' to find out more about commands not in this list.\n\n');
    c.out(Object.keys(HELP).sort().map(function (k) { return HELP[k][0].replace(/^[^:]+: /, ''); }).join('\n') + '\n'); return 0;
  }
  var rc = 0;
  names.forEach(function (n) {
    var keys = HELP[n] ? [n] : Object.keys(HELP).filter(function (k) { return n.indexOf('*') >= 0 ? new RegExp('^' + n.replace(/\*/g, '.*') + '$').test(k) : false; });
    if (!keys.length) { c.err("bash: help: no help topics match `" + n + "'.  Try `help help' or `man -k " + n + "' or `info " + n + "'.\n"); rc = 1; return; }
    keys.forEach(function (k) {
      var t = HELP[k];
      if (short === 'd') c.out(k + ' - ' + t[1].trim().replace(/\.$/, '') + '\n');
      else if (short === 'syn') c.out(k + ': ' + t[0].replace(/^[^:]+: /, '') + '\n');
      else c.out(t.join('\n') + '\n');
    });
  });
  return rc;
};

/* ---------- sudo -i / sudo -s ---------- */
var prevSudo = cmds.sudo, prevExit = B.exit;
cmds.sudo = function (a, c) {
  var sh = c.sh, k = -1, i;
  for (i = 0; i < a.length && a[i].charAt(0) === '-'; i++) {
    if (a[i] === '-u') { i++; continue; }
    if (/^(-i|-s|--login|--shell)$/.test(a[i])) { k = i; break; }
  }
  if (k < 0) return prevSudo(a, c);
  var login = /^(-i|--login)$/.test(a[k]), rest = a.slice(0, k).concat(a.slice(k + 1));
  var probe = prevSudo(['true'], c);                          /* cùng kiểm tra quyền sudo như bình thường */
  if (probe) return probe;
  if (rest.length) {                                          /* sudo -i lệnh...: chạy như root (login shell bắt đầu ở /root) */
    var cwd = sh.cwd; if (login) sh.cwd = '/root';
    try { return prevSudo(rest, c); } finally { sh.cwd = cwd; }
  }
  if (sh.user === 'root') { if (login) sh.cwd = '/root'; return 0; }
  (sh.rootStack = sh.rootStack || []).push({ user: sh.user, home: sh.home, cwd: sh.cwd, env: sh.env, forceRoot: sh.forceRoot });
  sh.env = Object.assign({}, sh.env, { HOME: '/root', USER: 'root', LOGNAME: 'root' });
  sh.user = 'root'; sh.home = '/root'; sh.forceRoot = true;
  if (login) sh.cwd = '/root';
  return 0;
};
B.exit = function (a, c) {                                    /* exit thoát shell root mở bằng sudo -i/-s, về lại user cũ */
  var sh = c.sh;
  if (sh.rootStack && sh.rootStack.length && !sh.sdepth && !(sh.fstack && sh.fstack.length)) {
    var sv = sh.rootStack.pop();
    sh.user = sv.user; sh.home = sv.home; sh.cwd = sv.cwd; sh.env = sv.env; sh.forceRoot = sv.forceRoot;
    c.out('logout\n'); return 0;
  }
  return prevExit(a, c);
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
