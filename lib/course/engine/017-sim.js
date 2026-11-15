(function (G) {
'use strict';
/* Chứng chỉ, DNS mở rộng: certbot renew/expand/delete, openssl x509, curl TLS, dig nhiều loại, cfctl dns. Chỉ chạy khi W.cert2 bật. */
var V = G.VPS, cmds = V.cmds, CmdErr = V.CmdErr, M = function (o) { return parseInt(o, 8); };
var prevCertbot = cmds.certbot, prevCurl = cmds.curl, prevOpenssl = cmds.openssl, prevDig = cmds.dig, prevCfctl = cmds.cfctl, prevSystemctl = cmds.systemctl;
var BASE = Date.UTC(2026, 9, 27, 4, 20, 0), DAY = 86400000;
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function p2(n) { return (n < 10 ? '0' : '') + n; }
function opensslDate(ms) { var d = new Date(ms); return MON[d.getUTCMonth()] + ' ' + (d.getUTCDate() < 10 ? ' ' : '') + d.getUTCDate() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' ' + d.getUTCFullYear() + ' GMT'; }
function isoDate(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + '+00:00'; }
function cm(W) { return W.cm = W.cm || {}; }
function ensure(W, sh) { Object.keys(W.certs || {}).forEach(function (d) { if (W.certs[d] && !cm(W)[d]) W.cm[d] = { doms: [d], days: 89, auth: 'nginx', installer: 'nginx' }; }); if (sh) { ['deploy', 'pre', 'post'].forEach(function (h) { if (!sh.fs.ex('/etc/letsencrypt/renewal-hooks/' + h)) sh.fs.mkdirp('/etc/letsencrypt/renewal-hooks/' + h, 'root', 493); }); } if (sh) Object.keys(W.cm || {}).forEach(function (n) { writeConf(sh, n, W.cm[n]); }); }
function writeConf(sh, n, e) {
  var p = '/etc/letsencrypt/renewal/' + n + '.conf';
  if (sh.fs.get(p)) return;
  sh.fs.put(p, ['# renew_before_expiry = 30 days', 'version = 2.9.0', 'archive_dir = /etc/letsencrypt/archive/' + n, 'cert = /etc/letsencrypt/live/' + n + '/cert.pem', 'privkey = /etc/letsencrypt/live/' + n + '/privkey.pem', 'chain = /etc/letsencrypt/live/' + n + '/chain.pem', 'fullchain = /etc/letsencrypt/live/' + n + '/fullchain.pem', '', '# Options used in the renewal process', '[renewalparams]', 'account = 7b2c1f0a9d3e4c58', 'authenticator = ' + (e.auth === 'dns' ? 'dns-cloudflare' : e.auth), e.installer ? 'installer = ' + e.installer : '', e.auth === 'dns' && e.cred ? 'dns_cloudflare_credentials = ' + e.cred : '', 'server = https://acme-v02.api.letsencrypt.org/directory', 'key_type = ecdsa', ''].filter(function (l, i, a) { return l !== '' || i === 7 || i === a.length - 1 || a[i - 1] !== ''; }).join('\n'), { owner: 'root' });
}
function covers(doms, host) {
  return doms.some(function (d) { if (d === host) return true; if (d.charAt(0) === '*') { var suf = d.slice(1); return host.slice(-suf.length) === suf && host.slice(0, -suf.length).indexOf('.') < 0 && host.length > suf.length; } return false; });
}
function certNameFromPath(p) { var m = /\/letsencrypt\/live\/([^\/]+)\//.exec(p || ''); return m ? m[1] : null; }

/* ---- ảnh chụp chứng chỉ mà Nginx đang phục vụ (cập nhật mỗi lần nạp lại) ---- */
V.certSync = function (sh) {
  var W = sh.W, live = W.nginx && W.nginx.live; W.served = {};
  if (!live) return; ensure(W);
  live.servers.forEach(function (s) {
    if (!s.certs || !s.certs.length) return;
    var nm = certNameFromPath(s.certs[0].path), e = nm && W.cm[nm];
    if (!e) { if (nm) s.names.forEach(function (n) { W.served[n] = { name: nm, doms: [nm], days: 89, missing: true }; }); return; }
    s.names.forEach(function (n) { W.served[n] = { name: nm, doms: e.doms.slice(), days: e.days }; });
  });
};
V.certBad = function (sh, host) { var sv = sh.W.served && sh.W.served[host]; return !!sv && (sv.days <= 0 || !covers(sv.doms, host)); };

/* ---- certbot ---- */
function validDays(d) { return d > 0 ? 'VALID: ' + d + ' day' + (d === 1 ? '' : 's') : 'INVALID: EXPIRED'; }
function fail80(sh, doms, auth) {
  var W = sh.W, ufwOff = W.ufw && W.ufw.active && !W.ufw.rules.some(function (r) { return r.action !== 'DENY' && r.action !== 'REJECT' && r.from === 'Anywhere' && (r.to === '80' || r.to === '80/tcp' || /^Nginx (HTTP|Full)/.test(r.to)); });
  var out = null;
  doms.forEach(function (d) {
    if (out) return;
    var base = d.replace(/^\*\./, ''), parts = base.split('.'), k, caa = null, cname = null;
    for (k = 0; k < parts.length - 1 && !caa; k++) { var nm = parts.slice(k).join('.'), cc = W.dnsrec2 && W.dnsrec2[nm] && W.dnsrec2[nm].CAA; if (cc && cc.length) { caa = cc; cname = nm; } }
    if (caa && !caa.some(function (x) { return /letsencrypt\.org/.test(x); })) out = { d: d, type: 'caa', detail: 'CAA record for ' + cname + ' prevents issuance' };
    if (out || auth === 'dns') return;
    var rec = W.dns[d];
    if (!rec && W.dnsrec2 && W.dnsrec2[d] && W.dnsrec2[d].CNAME) rec = W.dns[W.dnsrec2[d].CNAME[0]];
    if (!rec) out = { d: d, type: 'dns', detail: 'DNS problem: NXDOMAIN looking up A for ' + d + ' - check that a DNS record exists for this domain' };
    else if (!rec.proxied && rec.ip !== W.ip) out = { d: d, type: 'connection', detail: rec.ip + ': Fetching http://' + d + '/.well-known/acme-challenge/Xq2: Timeout during connect (likely firewall problem)' };
    else if (ufwOff) out = { d: d, type: 'connection', detail: W.ip + ': Fetching http://' + d + '/.well-known/acme-challenge/Xq2: Timeout during connect (likely firewall problem)' };
    else if (!W.nginx.active && auth !== 'standalone') out = { d: d, type: 'connection', detail: W.ip + ': Fetching http://' + d + '/.well-known/acme-challenge/Xq2: Connection refused' };
  });
  return out;
}
function authFail(o, auth) { return 'Certbot failed to authenticate some domains (authenticator: ' + auth + '). The Certificate Authority reported these problems:\n  Domain: ' + o.d + '\n  Type:   ' + o.type + '\n  Detail: ' + o.detail + '\n\nHint: Ensure that the listed domains point to this machine, that port 80 is reachable from the internet and that the web server serves them.\n'; }
function optVal(a, k) { var i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; }
function hookReloads(sh, a) {
  var hooks = [], dh = optVal(a, '--deploy-hook');
  if (dh) hooks.push({ txt: dh, src: '--deploy-hook' });
  var dir = '/etc/letsencrypt/renewal-hooks/deploy', ents = [];
  try { ents = sh.fs.ex(dir) ? sh.fs.list(dir) : []; } catch (e) { ents = []; }
  return { cli: dh, files: ents };
}
cmds.certbot = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.cert2) return prevCertbot(a, c);
  if (!sh.isRoot(c) && sh.user !== 'root') return prevCertbot(a, c);
  ensure(W, sh);
  var sub = a[0], E = cm(W);
  var cn = optVal(a, '--cert-name');
  if (sub === 'certificates') {
    var names = Object.keys(E).filter(function (n) { return !cn || n === cn; });
    if (!names.length) { c.out('No certificates found.\n'); return 0; }
    c.out('Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nFound the following certs:\n');
    names.forEach(function (n, i) {
      var e = E[n];
      c.out('  Certificate Name: ' + n + '\n    Serial Number: 4' + (i + 3) + 'f1c9a07be2d5530' + (i + 1) + '\n    Key Type: ECDSA\n    Domains: ' + e.doms.join(' ') + '\n    Expiry Date: ' + isoDate(BASE + e.days * DAY) + ' (' + validDays(e.days) + ')\n    Certificate Path: /etc/letsencrypt/live/' + n + '/fullchain.pem\n    Private Key Path: /etc/letsencrypt/live/' + n + '/privkey.pem\n');
    });
    c.out('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\n');
    return 0;
  }
  if (sub === 'delete') {
    if (!cn || !E[cn]) throw new CmdErr('Error: No certificate found with name ' + (cn || '') + (cn ? '' : '(cần --cert-name TÊN)') + '.');
    delete E[cn]; delete W.certs[cn]; try { sh.fs.rm('/etc/letsencrypt/renewal/' + cn + '.conf'); } catch (e2) { }
    ['fullchain.pem', 'privkey.pem'].forEach(function (f) { try { sh.fs.rm('/etc/letsencrypt/live/' + cn + '/' + f); } catch (e) { } });
    c.out('Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\nDeleted all files relating to certificate ' + cn + '.\n'); return 0;
  }
  if (sub === 'renew') {
    var dry = a.indexOf('--dry-run') >= 0, force = a.indexOf('--force-renewal') >= 0;
    var names2 = Object.keys(E).filter(function (n) { return !cn || n === cn; });
    if (!names2.length) { c.out('No renewals were attempted.\n'); return 0; }
    var okL = [], badL = [], skipL = [], reloaded = false, hk = hookReloads(sh, a), out = '';
    names2.forEach(function (n) {
      var e = E[n], due = e.days <= 30 || force || dry;
      out += '\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nProcessing /etc/letsencrypt/renewal/' + n + '.conf\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\n';
      if (!due) { out += 'Certificate not yet due for renewal\n'; skipL.push(n); return; }
      var prob = null;
      if (e.auth === 'dns') { if (!e.cred || !sh.fs.isF(e.cred)) prob = 'Missing property in credentials configuration file ' + (e.cred || '/root/.cloudflare.ini'); }
      else {
        if (e.auth === 'nginx' && V.ngLoad(sh).errors.length) prob = 'nginx.conf test failed: ' + V.ngLoad(sh).errors[0];
        else { var f = fail80(sh, e.doms, e.auth); if (f) prob = authFail(f, e.auth); }
      }
      if (prob) { out += (dry ? 'Failed to renew certificate ' + n + ' with error: ' : 'Failed to renew certificate ' + n + ' with error: ') + prob + (/\n$/.test(prob) ? '' : '\n'); badL.push(n); return; }
      if (dry) { out += 'Account registered.\nSimulating renewal of an existing certificate for ' + e.doms.join(' and ') + '\n'; okL.push(n); return; }
      e.days = 89; okL.push(n);
      out += 'Renewing an existing certificate for ' + e.doms.join(' and ') + '\n';
      if (e.installer === 'nginx') { V.ngReload(sh, false); reloaded = true; }
      var run = false;
      if (hk.cli && /(reload|restart)\s+nginx|nginx\s+-s\s+reload/.test(hk.cli)) { out += 'Running deploy-hook command: ' + hk.cli + '\n'; run = true; }
      hk.files.forEach(function (f) {
        var path = '/etc/letsencrypt/renewal-hooks/deploy/' + f, nd = sh.fs.get(path);
        if (!nd) return;
        if (!(nd.mode & 73)) { out += 'Hook command "' + path + '" is not executable, skipping\n'; return; }
        out += 'Running deploy-hook command: ' + path + '\n';
        if (/(reload|restart)\s+nginx|nginx\s+-s\s+reload/.test(nd.c || '')) run = true;
      });
      if (run) { V.ngReload(sh, false); reloaded = true; W.certHookRuns = (W.certHookRuns || 0) + 1; }
    });
    out += '\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\n';
    if (badL.length) {
      out += (okL.length ? 'The following certs were renewed:\n' + okL.map(function (n) { return '  /etc/letsencrypt/live/' + n + '/fullchain.pem (success)\n'; }).join('') : '') + 'All renewals failed. The following certs could not be renewed:\n' + badL.map(function (n) { return '  /etc/letsencrypt/live/' + n + '/fullchain.pem (failure)\n'; }).join('') + '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\n\n' + badL.length + ' renew failure(s), 0 parse failure(s)\n';
      c.out('Saving debug log to /var/log/letsencrypt/letsencrypt.log\n' + out); return 1;
    }
    if (okL.length) out += dry ? 'Congratulations, all simulated renewals succeeded: \n' + okL.map(function (n) { return '  /etc/letsencrypt/live/' + n + '/fullchain.pem (success)\n'; }).join('') : 'Congratulations, all renewals succeeded: \n' + okL.map(function (n) { return '  /etc/letsencrypt/live/' + n + '/fullchain.pem (success)\n'; }).join('');
    else out += 'No renewals were attempted.\n';
    c.out('Saving debug log to /var/log/letsencrypt/letsencrypt.log\n' + out + '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\n');
    return 0;
  }
  /* cấp mới / mở rộng */
  var doms = []; for (var i = 0; i < a.length; i++) if (a[i] === '-d' || a[i] === '--domain') doms.push(a[++i]);
  if (!doms.length) return prevCertbot(a, c);
  var useDns = a.indexOf('--dns-cloudflare') >= 0, useNginx = a.indexOf('--nginx') >= 0, standalone = a.indexOf('--standalone') >= 0, webroot = a.indexOf('--webroot') >= 0;
  if (!useDns && !useNginx && !standalone && !webroot) return prevCertbot(a, c);
  var wild = doms.some(function (d) { return d.charAt(0) === '*'; });
  if (wild && !useDns) throw new CmdErr('Client with the currently selected authenticator does not support creating wildcard certificates.');
  var plain = doms.map(function (d) { return d.replace(/^\*\./, ''); });
  var name = cn || plain[0], old = E[name];
  var auth = useDns ? 'dns' : useNginx ? 'nginx' : standalone ? 'standalone' : 'webroot';
  if (old && doms.some(function (d) { return old.doms.indexOf(d) < 0; }) && a.indexOf('--expand') < 0 && a.indexOf('--force-renewal') < 0) {
    c.err('You have an existing certificate that contains a portion of the domains you requested (ref: /etc/letsencrypt/renewal/' + name + '.conf)\n\nIt contains these names: ' + old.doms.join(', ') + '\n\nYou requested these names for the new certificate: ' + doms.join(', ') + '.\n\nDo you want to expand and replace this existing certificate with the new\ncertificate?\nAn unexpected error occurred:\nError: Unable to ask for confirmation: no terminal. Re-run with --expand (or -n/--non-interactive --expand) to expand the certificate.\n');
    return 1;
  }
  var cp = optVal(a, '--dns-cloudflare-credentials');
  if (useDns && (!cp || !sh.fs.isF(sh.abs(cp)))) return prevCertbot(a, c);
  var f = fail80(sh, doms, auth);
  if (f) { c.err('Saving debug log to /var/log/letsencrypt/letsencrypt.log\nRequesting a certificate for ' + doms.join(' and ') + '\n'); c.err(authFail(f, auth).replace(/\n$/, '') + '\nSome challenges have failed.\n'); return 1; }
  if (useNginx) {
    var t = V.ngLoad(sh);
    if (!t.errors.length) {
      var miss = plain.filter(function (d) { return !t.servers.some(function (s) { return s.names.indexOf(d) >= 0 && s.listens.some(function (l) { return l.port === 80; }); }); });
      if (miss.length) throw new CmdErr('Could not automatically find a matching server block for ' + miss[0] + '. Set the `server_name` directive to use the Nginx installer.');
    }
  }
  var args2 = []; for (i = 0; i < a.length; i++) { if (a[i] === '-d' || a[i] === '--domain') { i++; continue; } if (a[i] === '--cert-name') { i++; continue; } if (a[i] === '--expand') continue; args2.push(a[i]); }
  args2.push('-d', name);
  var buf0 = '', c2 = Object.create(c); c2.out = function (t) { buf0 += t; }; var rc;
  try { rc = prevCertbot(args2, c2); } finally { c.out(buf0.replace('Requesting a certificate for ' + name + '\n', 'Requesting a certificate for ' + doms.join(' and ') + '\n').replace(/This certificate expires on [^\n]*\n/, 'This certificate expires on 2027-01-24.\n')); }
  if (rc !== 0) return rc;
  var certonly = a.indexOf('certonly') >= 0;
  try { sh.fs.rm('/etc/letsencrypt/renewal/' + name + '.conf'); } catch (e3) { }
  E[name] = { doms: doms.slice(), days: 89, auth: auth, installer: certonly ? null : 'nginx', cred: cp ? sh.abs(cp) : null };
  writeConf(sh, name, E[name]);
  if (name !== plain[0] && !certonly) { /* giữ nguyên */ }
  if (!certonly && useNginx && doms.length > 1) {
    var tt = V.ngLoad(sh), sv = tt.servers.filter(function (s) { return s.names.indexOf(name) >= 0 && s.certs && s.certs.length; })[0];
    if (sv) { var nd = sh.fs.get(sv.file); if (nd) { sh.fs.put(sv.file, nd.c.replace(new RegExp('server_name ' + name.replace(/\./g, '\\.') + ';', 'g'), 'server_name ' + doms.join(' ') + ';'), { owner: 'root' }); V.ngReload(sh, false); } }
  } else if (!certonly && V.certSync) V.certSync(sh);
  return 0;
};

/* ---- systemctl: certbot.timer ---- */
cmds.systemctl = function (a, c) {
  var W = c.sh.W;
  if (!W.cert2) return prevSystemctl(a, c);
  var rest = a.filter(function (x) { return x.charAt(0) !== '-'; }), act = rest[0], unit = (rest[1] || '').replace(/\.(service|timer)$/, '');
  if (W.certTimer === undefined) W.certTimer = true;
  if (act === 'list-timers') {
    c.out('NEXT                        LEFT      LAST                        PASSED  UNIT           ACTIVATES\n' + (W.certTimer ? 'Tue 2026-10-27 14:22:00 +07 5h left   Tue 2026-10-27 02:22:00 +07 2h ago certbot.timer  certbot.service\n' : '') + '\n' + (W.certTimer ? '1 timers listed.\n' : '0 timers listed.\n')); return 0;
  }
  if (unit === 'certbot' && rest[1] && /\.timer$/.test(rest[1]) || (unit === 'certbot' && (act === 'enable' || act === 'disable' || act === 'status' || act === 'is-enabled' || act === 'is-active' || act === 'start' || act === 'stop') && /timer/.test(a.join(' ')))) {
    if (!c.sh.isRoot(c) && c.sh.user !== 'root' && (act === 'enable' || act === 'disable' || act === 'start' || act === 'stop')) { c.err('Failed to ' + act + ' unit: Access denied\n'); return 1; }
    if (act === 'enable') { W.certTimer = true; c.out('Created symlink /etc/systemd/system/timers.target.wants/certbot.timer → /lib/systemd/system/certbot.timer.\n'); return 0; }
    if (act === 'disable') { W.certTimer = false; c.out('Removed /etc/systemd/system/timers.target.wants/certbot.timer.\n'); return 0; }
    if (act === 'start') { W.certTimer = true; return 0; }
    if (act === 'stop') { W.certTimer = false; return 0; }
    if (act === 'is-enabled') { c.out(W.certTimer ? 'enabled\n' : 'disabled\n'); return W.certTimer ? 0 : 1; }
    if (act === 'is-active') { c.out(W.certTimer ? 'active\n' : 'inactive\n'); return W.certTimer ? 0 : 3; }
    if (act === 'status') {
      c.out((W.certTimer ? '● ' : '○ ') + 'certbot.timer - Run certbot twice daily\n     Loaded: loaded (/lib/systemd/system/certbot.timer; ' + (W.certTimer ? 'enabled' : 'disabled') + '; preset: enabled)\n     Active: ' + (W.certTimer ? 'active (waiting) since Mon 2026-10-26 09:12:03 +07; 19h ago\n    Trigger: Tue 2026-10-27 14:22:00 +07; 5h left\n' : 'inactive (dead)\n'));
      return W.certTimer ? 0 : 3;
    }
  }
  return prevSystemctl(a, c);
};

/* ---- openssl x509 / s_client ---- */
function pemFor(name, days) { return '-----BEGIN CERTIFICATE-----\nSIM:' + name + (days != null ? ':' + days : '') + '\n-----END CERTIFICATE-----\n'; }
cmds.openssl = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.cert2) return prevOpenssl(a, c);
  ensure(W);
  if (a[0] === 'x509') {
    var fi = a.indexOf('-in'), f = fi >= 0 ? a[fi + 1] : null, text, e, name, days;
    if (f) { var n = sh.fs.get(sh.abs(f)); if (!n) { c.err('Could not open file or uri for loading certificate from ' + f + '\n'); return 1; } text = n.c || ''; }
    else text = c.stdin || '';
    var m = /SIM:([^:\n]+)(?::(-?\d+))?/.exec(text);
    if (!m) { c.err('Could not read certificate from <stdin>\nUnable to load certificate\n'); return 1; }
    name = m[1]; e = W.cm[name] || { doms: [name], days: 89 }; days = m[2] != null ? +m[2] : e.days;
    var end = BASE + days * DAY, start = end - 90 * DAY, o = '';
    var ce = a.indexOf('-checkend');
    if (a.indexOf('-subject') >= 0) o += 'subject=CN = ' + e.doms[0] + '\n';
    if (a.indexOf('-issuer') >= 0) o += 'issuer=C = US, O = Let\'s Encrypt, CN = R11\n';
    if (a.indexOf('-dates') >= 0) o += 'notBefore=' + opensslDate(start) + '\nnotAfter=' + opensslDate(end) + '\n';
    if (a.indexOf('-enddate') >= 0) o += 'notAfter=' + opensslDate(end) + '\n';
    if (a.indexOf('-startdate') >= 0) o += 'notBefore=' + opensslDate(start) + '\n';
    if (a.indexOf('-ext') >= 0 && /subjectAltName/.test(a[a.indexOf('-ext') + 1] || '')) o += 'X509v3 Subject Alternative Name: \n    ' + e.doms.map(function (d) { return 'DNS:' + d; }).join(', ') + '\n';
    if (a.indexOf('-text') >= 0) o += 'Certificate:\n    Data:\n        Version: 3 (0x2)\n        Issuer: C = US, O = Let\'s Encrypt, CN = R11\n        Validity\n            Not Before: ' + opensslDate(start) + '\n            Not After : ' + opensslDate(end) + '\n        Subject: CN = ' + e.doms[0] + '\n        X509v3 extensions:\n            X509v3 Subject Alternative Name: \n                ' + e.doms.map(function (d) { return 'DNS:' + d; }).join(', ') + '\n';
    if (ce >= 0) {
      var sec = +a[ce + 1] || 0, will = (end - BASE) / 1000 < sec;
      c.out(o + (will ? 'Certificate will expire\n' : 'Certificate will not expire\n')); return will ? 1 : 0;
    }
    c.out(o); return 0;
  }
  if (a[0] === 's_client') {
    var buf = '', c2 = Object.create(c); c2.out = function (t) { buf += t; };
    var rc = prevOpenssl(a, c2);
    if (rc !== 0 || buf.indexOf('Certificate chain') < 0) { c.out(buf); return rc; }
    var sn = optVal(a, '-servername') || ((optVal(a, '-connect') || '').split(':')[0]), sv = W.served && W.served[sn];
    if (!sv) { c.out(buf); return rc; }
    var bad = sv.days <= 0, wrong = !covers(sv.doms, sn);
    buf = buf.replace(/ 0 s:CN = [^\n]*/, ' 0 s:CN = ' + sv.doms[0]);
    buf = buf.replace('---\nNew,', '---\nServer certificate\n' + pemFor(sv.name, sv.days) + 'subject=CN = ' + sv.doms[0] + '\nissuer=C = US, O = Let\'s Encrypt, CN = R11\n\n---\nNew,');
    buf = buf.replace('Verification: OK', bad ? 'Verification error: certificate has expired' : wrong ? 'Verification error: Hostname mismatch' : 'Verification: OK');
    buf += 'Verify return code: ' + (bad ? '10 (certificate has expired)' : wrong ? '62 (Hostname mismatch, certificate is not valid for \'' + sn + '\')' : '0 (ok)') + '\n';
    c.out(buf); return 0;
  }
  return prevOpenssl(a, c);
};

/* ---- curl: kiểm tra chứng chỉ khi kết nối thẳng vào origin ---- */
cmds.curl = function (a, c) {
  var sh = c.sh, W = sh.W;
  if (!W.cert2) return prevCurl(a, c);
  var url = a.filter(function (x) { return /^https:\/\//.test(x); })[0];
  if (!url) return prevCurl(a, c);
  var m = /^https:\/\/([^\/:]+)/.exec(url), host = m && m[1];
  var rec = W.dns[host], proxied = rec && rec.proxied && !a.some(function (x) { return x === '--resolve'; });
  var k = a.some(function (x) { return x === '-k' || x === '--insecure' || (/^-[a-zA-Z]+$/.test(x) && x.indexOf('k') > 0 && x.charAt(1) !== '-'); });
  var sv = host && W.served && W.served[host];
  var silent = a.some(function (x) { return x === '-s' || x === '--silent' || (/^-[a-zA-Z]+$/.test(x) && x.indexOf('s') > 0); }), showE = a.some(function (x) { return x === '-S' || x === '--show-error' || (/^-[a-zA-Z]+$/.test(x) && x.indexOf('S') > 0); });
  var isV = a.some(function (x) { return x === '-v' || x === '--verbose' || (/^-[a-zA-Z]+$/.test(x) && x.indexOf('v') > 0); });
  var live = W.nginx && W.nginx.active && W.nginx.live;
  if (!sv || proxied || !live) return prevCurl(a, c);
  var bad = sv.days <= 0, wrong = !covers(sv.doms, host), end = BASE + sv.days * DAY;
  if (isV) {
    c.err('* Server certificate:\n*  subject: CN=' + sv.doms[0] + '\n*  start date: ' + opensslDate(end - 90 * DAY) + '\n*  expire date: ' + opensslDate(end) + '\n*  issuer: C=US; O=Let\'s Encrypt; CN=R11\n' + (wrong ? '*  SSL: no alternative certificate subject name matches target host name \'' + host + '\'\n' : '*  subjectAltName: host "' + host + '" matched cert\'s "' + (sv.doms.filter(function (d) { return covers([d], host); })[0] || host) + '"\n') + (bad && !k ? '*  SSL certificate verify result: certificate has expired (10)\n' : ''));
  }
  if ((bad || wrong) && !k) {
    if (!silent || showE) c.err('curl: (60) ' + (wrong ? 'SSL: no alternative certificate subject name matches target host name \'' + host + '\'' : 'SSL certificate problem: certificate has expired') + '\nMore details here: https://curl.se/docs/sslcerts.html\n\ncurl failed to verify the legitimacy of the server and therefore could not\nestablish a secure connection to it. To learn more about this situation and\nhow to fix it, please visit the web page mentioned above.\n');
    return 60;
  }
  return prevCurl(a, c);
};

/* ---- DNS: dig nhiều loại bản ghi, host, cfctl dns ---- */
var TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA', 'SOA'];
function recs(W, name, type) {
  var r2 = W.dnsrec2 && W.dnsrec2[name] || {}, out = [], ttl = (W.dnsttl && W.dnsttl[name]) || 300;
  if (type === 'A' && r2.CNAME && r2.CNAME.length) return { ttl: (W.dnsttl && W.dnsttl[name]) || 300, cname: r2.CNAME[0] };
  if (type === 'A' || type === 'AAAA') {
    if (type === 'A') { var r = W.dns[name]; if (r) { if (r.proxied) return { ttl: 300, v: ['104.21.55.187', '172.67.172.34'] }; out.push(r.ip); } }
    (r2[type] || []).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    if (type === 'A' && !out.length && r2.CNAME && r2.CNAME.length) return { ttl: ttl, cname: r2.CNAME[0] };
    return { ttl: ttl, v: out };
  }
  return { ttl: ttl, v: (r2[type] || []).slice() };
}
cmds.dig = function (a, c) {
  var W = c.sh.W; if (!W.cert2) return prevDig(a, c);
  var short = a.indexOf('+short') >= 0, type = 'A', name = null, server = null;
  a.forEach(function (x) { if (x.charAt(0) === '+') return; if (x.charAt(0) === '@') { server = x.slice(1); return; } var up = x.toUpperCase(); if (TYPES.indexOf(up) >= 0 && x === up) { type = up; return; } if (/^-/.test(x)) return; name = x.replace(/\.$/, ''); });
  if (!name) { c.err('dig: usage: dig [@server] name [type] [+short]\n'); return 1; }
  var r = recs(W, name, type), v = r.v || [], lines = [];
  if (r.cname) { lines.push(name + '.\t' + r.ttl + '\tIN\tCNAME\t' + r.cname + '.'); var r3 = recs(W, r.cname, 'A'); (r3.v || []).forEach(function (ip) { lines.push(r.cname + '.\t' + r3.ttl + '\tIN\tA\t' + ip); }); v = [r.cname + '.'].concat(r3.v || []); }
  else v.forEach(function (x, i0) { if (type === 'TXT' && x.charAt(0) !== '"') { x = '"' + x + '"'; v[i0] = x; } lines.push(name + '.\t' + r.ttl + '\tIN\t' + type + '\t' + x); });
  if (short) { c.out(v.join('\n') + (v.length ? '\n' : '')); return 0; }
  var exists = v.length || Object.keys(W.dnsrec2 && W.dnsrec2[name] || {}).length || W.dns[name];
  c.out('; <<>> DiG 9.18.28 <<>> ' + name + ' ' + type + '\n;; ->>HEADER<<- opcode: QUERY, status: ' + (exists ? 'NOERROR' : 'NXDOMAIN') + ', id: 4412\n;; flags: qr rd ra; QUERY: 1, ANSWER: ' + lines.length + ', AUTHORITY: 0, ADDITIONAL: 1\n\n;; QUESTION SECTION:\n;' + name + '.\t\t\tIN\t' + type + '\n\n' + (lines.length ? ';; ANSWER SECTION:\n' + lines.join('\n') + '\n' : '') + '\n;; SERVER: ' + (server || '127.0.0.53') + '#53(' + (server || '127.0.0.53') + ') (UDP)\n');
  return 0;
};
cmds.host = function (a, c) {
  var W = c.sh.W, name = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (!name) { c.err('Usage: host [-t type] name\n'); return 1; }
  var r = recs(W, name, 'A');
  if (r.cname) { c.out(name + ' is an alias for ' + r.cname + '.\n'); r = recs(W, r.cname, 'A'); }
  if (!r.v || !r.v.length) { c.out('Host ' + name + ' not found: 3(NXDOMAIN)\n'); return 1; }
  r.v.forEach(function (ip) { c.out(name + ' has address ' + ip + '\n'); });
  return 0;
};
cmds.cfctl = function (a, c) {
  var W = c.sh.W; if (!W.cert2 || a[0] !== 'dns') return prevCfctl(a, c);
  W.dnsrec2 = W.dnsrec2 || {}; W.dnsttl = W.dnsttl || {};
  var act = a[1];
  function flag(k) { var i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; }
  if (act === 'list' || !act) {
    c.out('TYPE   NAME                          CONTENT                       PROXY   TTL\n');
    Object.keys(W.dns).forEach(function (n) { var r = W.dns[n]; if (r.cname) return; c.out(('A     ' + n + '                                    ').slice(0, 37) + (r.ip + '                              ').slice(0, 30) + (r.proxied ? 'proxied ' : 'dns-only') + ' ' + (r.proxied ? 'auto' : (W.dnsttl[n] || 300)) + '\n'); });
    Object.keys(W.dnsrec2).forEach(function (n) { Object.keys(W.dnsrec2[n]).forEach(function (t) { if (t === 'A') return; W.dnsrec2[n][t].forEach(function (v) { c.out((t + '      ' + n + '                                    ').slice(0, 37) + (v + '                              ').slice(0, 30) + 'dns-only ' + (W.dnsttl[n] || 300) + '\n'); }); }); });
    return 0;
  }
  var type = (a[2] || '').toUpperCase(), name = a[3], val = a[4];
  if (act === 'add' || act === 'set') {
    if (TYPES.indexOf(type) < 0 || !name || !val) throw new CmdErr('cfctl dns add|set TYPE NAME VALUE [--ttl N] [--proxied]');
    var ttl = flag('--ttl'), px = a.indexOf('--proxied') >= 0;
    if (type === 'A') { W.dns[name] = { ip: val, proxied: px }; if (W.dnsrec2[name]) delete W.dnsrec2[name].CNAME; }
    else {
      if (type === 'CNAME' && (W.dns[name] || (W.dnsrec2[name] && W.dnsrec2[name].A))) throw new CmdErr('Error 81053: An A, AAAA, or CNAME record with that host already exists.');
      var o = W.dnsrec2[name] = W.dnsrec2[name] || {};
      if (act === 'set') o[type] = [val]; else (o[type] = o[type] || []).push(val);
      if (type === 'CNAME') { var tg = W.dns[val.replace(/\.$/, '')]; if (tg) W.dns[name] = { ip: tg.ip, proxied: tg.proxied, cname: true }; }
    }
    if (ttl) W.dnsttl[name] = +ttl;
    c.out('OK: ' + type + ' ' + name + ' -> ' + val + (px ? ' (proxied)' : '') + (ttl ? ' ttl=' + ttl : '') + '\n'); return 0;
  }
  if (act === 'del') {
    if (type === 'A') { if (!W.dns[name]) throw new CmdErr('cfctl: không có bản ghi A cho ' + name); delete W.dns[name]; }
    else { if (!(W.dnsrec2[name] && W.dnsrec2[name][type])) throw new CmdErr('cfctl: không có bản ghi ' + type + ' cho ' + name); delete W.dnsrec2[name][type]; if (type === 'CNAME' && W.dns[name] && W.dns[name].cname) delete W.dns[name]; }
    c.out('Deleted ' + type + ' ' + name + '\n'); return 0;
  }
  if (act === 'proxy') {
    var rr = W.dns[a[2]]; if (!rr) throw new CmdErr('cfctl: không có bản ghi A cho ' + a[2]);
    rr.proxied = a[3] === 'on'; c.out(a[2] + ': ' + (rr.proxied ? 'proxied (đám mây cam)' : 'DNS only (đám mây xám)') + '\n'); return 0;
  }
  throw new CmdErr('cfctl dns list | add TYPE NAME VALUE | set TYPE NAME VALUE | del TYPE NAME | proxy NAME on|off');
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
