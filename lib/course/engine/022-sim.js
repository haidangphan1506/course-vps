(function (G) {
'use strict';
/* Chương 1C (phần 2): mạng (ping, curl, wget, dig, traceroute, mtr, ip route), nén (tar, gzip, zip), truyền file (scp, rsync, sftp, ssh lệnh đơn) tới máy backup giả lập. Bật bằng W.lin2. */
var V = G.VPS, SP = V.Shell.prototype, cmds = V.cmds, CmdErr = V.CmdErr, LIN = V.lin, L2 = V.lin2, IMPL = L2.impl;
function pad(s, n, right) { s = String(s); while (s.length < n) s = right ? ' ' + s : s + ' '; return s; }
function on(sh) { return !!(sh && sh.W && sh.W.lin2); }
function S2(sh) { return sh.W.lin2; }
function lines(t) { return String(t || '').split('\n').filter(function (x) { return x !== ''; }); }
function fileText(sh, p) { var n = sh.fs.get(p); return n && n.t === 'f' ? String(n.c || '') : ''; }
function nowMs(sh) { return sh.W.lin ? sh.W.lin.now : Date.UTC(2026, 9, 27, 3, 20, 0); }
function p2(n) { return (n < 10 ? '0' : '') + n; }
function stamp(sh) { var d = new Date(nowMs(sh) + 7 * 3600000); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); }
function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; }
function isIP(s) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(s); }
function fmtN(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ============ DNS, mạng ============ */
var OKNS = ['127.0.0.53', '1.1.1.1', '8.8.8.8', '8.8.4.4', '9.9.9.9', '10.0.0.2', '127.0.0.1'];
function netDefaults(sh) {
  var S = S2(sh);
  if (!S.net) S.net = {
    dns: { 'example.com': '93.184.216.34', 'www.example.com': '93.184.216.34', 'google.com': '142.250.66.46', 'github.com': '20.205.243.166', 'deb.nodesource.com': '104.18.26.138', 'registry.npmjs.org': '104.16.1.35', 'archive.ubuntu.com': '91.189.91.83', 'cloudflare.com': '104.16.132.229', 'tutor.example.com': sh.W.ip || V.IP, 'api.example.com': sh.W.ip || V.IP, 'backup.example.com': '10.0.0.20', 'down.example.com': '203.0.113.50', 'quiet.example.com': '203.0.113.60' },
    icmpBlock: ['quiet.example.com', '203.0.113.60'], down: ['203.0.113.50'], lat: { '93.184.216.34': 24, '142.250.66.46': 11, '20.205.243.166': 38, '1.1.1.1': 6, '8.8.8.8': 8, '10.0.0.20': 1, '10.0.0.1': 0.6, '91.189.91.83': 190 },
    web: { 'example.com': { code: 200, body: '<!doctype html>\n<html><head><title>Example Domain</title></head>\n<body><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents.</p></body></html>\n', server: 'ECS (sed/58AB)', type: 'text/html; charset=UTF-8' }, 'www.example.com': { code: 301, loc: 'https://example.com/' }, 'github.com': { code: 200, body: '<!DOCTYPE html><html><title>GitHub</title></html>\n', server: 'GitHub.com', type: 'text/html; charset=utf-8' }, 'tutor.example.com': 'local', 'api.example.com': 'local' }
  };
  return S.net;
}

function dnsServers(sh) { return lines(fileText(sh, '/etc/resolv.conf')).map(function (l) { var m = /^\s*nameserver\s+(\S+)/.exec(l); return m ? m[1] : null; }).filter(Boolean); }
function hostsLookup(sh, name) {
  var out = null;
  lines(fileText(sh, '/etc/hosts')).forEach(function (l) { var t = l.replace(/#.*/, '').trim().split(/\s+/); if (t.length >= 2 && t.slice(1).indexOf(name) >= 0 && !out) out = t[0]; });
  return out;
}
function resolve(sh, name, via) {
  if (isIP(name)) return { ip: name };
  var h = hostsLookup(sh, name); if (h) return { ip: h };
  if (name === 'localhost') return { ip: '127.0.0.1' };
  var servers = via ? [via] : dnsServers(sh), ok = servers.filter(function (s) { return OKNS.indexOf(s) >= 0; });
  if (!ok.length) return { err: 'temp', ns: servers[0] || '127.0.0.53' };
  var ip = netDefaults(sh).dns[name];
  return ip ? { ip: ip, ns: ok[0] } : { err: 'nx', ns: ok[0] };
}
L2.resolve = resolve;
function isLocal(sh, ip) { return ip === '127.0.0.1' || ip === (sh.W.ip || V.IP) || ip === '::1'; }
function latency(sh, ip) { var n = netDefaults(sh); return n.lat[ip] != null ? n.lat[ip] : 18 + hash(ip) % 40; }
function reach(sh, name, ip) { var n = netDefaults(sh); if (isLocal(sh, ip)) return 'ok'; if (n.down.indexOf(ip) >= 0) return 'down'; if (n.icmpBlock.indexOf(ip) >= 0 || n.icmpBlock.indexOf(name) >= 0) return 'drop'; if (/^(10\.0\.0\.|93\.|142\.|20\.|104\.|91\.|1\.1\.1|8\.8\.|9\.9\.|203\.0\.113\.60)/.test(ip)) return 'ok'; return 'drop'; }
IMPL.ping = null;
cmds.ping = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: ping: command not found', 127);
  var cnt = 0, host = null, i, W = 1;
  for (i = 0; i < a.length; i++) { if (a[i] === '-c') cnt = parseInt(a[++i], 10); else if (a[i] === '-W' || a[i] === '-i' || a[i] === '-s') i++; else if (/^-c\d+$/.test(a[i])) cnt = +a[i].slice(2); else if (a[i].charAt(0) !== '-') host = a[i]; }
  if (!host) throw new CmdErr('ping: usage error: Destination address required', 2);
  var r = resolve(sh, host);
  if (r.err) { c.err('ping: ' + host + (r.err === 'temp' ? ': Temporary failure in name resolution' : ': Name or service not known') + '\n'); return 2; }
  var ip = r.ip, st = reach(sh, host, ip), n = cnt || 4, base = latency(sh, ip), out = 'PING ' + host + ' (' + ip + ') 56(84) bytes of data.\n', got = 0, rtts = [];
  if (!cnt) n = 3;
  for (i = 1; i <= n; i++) {
    if (st === 'ok') { var t = base + ((hash(ip + i) % 10) / 10 - 0.3); t = Math.max(0.05, t); rtts.push(t); got++; out += '64 bytes from ' + ip + ': icmp_seq=' + i + ' ttl=' + (isLocal(sh, ip) ? 64 : 56) + ' time=' + t.toFixed(isLocal(sh, ip) ? 3 : 1) + ' ms\n'; }
    else if (st === 'down') out += 'From ' + (sh.W.ip || V.IP) + ' icmp_seq=' + i + ' Destination Host Unreachable\n';
  }
  if (!cnt) out += '^C\n';
  out += '--- ' + host + ' ping statistics ---\n' + n + ' packets transmitted, ' + got + ' received, ' + (st === 'down' ? '+' + n + ' errors, ' : '') + Math.round((n - got) / n * 100) + '% packet loss, time ' + (st === 'ok' ? (n - 1) * 1001 + 4 : n * 1000 + 1000 + (st === 'down' ? 0 : -1000 + 9)) + 'ms\n';
  if (got) { var mn = Math.min.apply(null, rtts), mx = Math.max.apply(null, rtts), av = rtts.reduce(function (x, y) { return x + y; }, 0) / rtts.length; out += 'rtt min/avg/max/mdev = ' + mn.toFixed(3) + '/' + av.toFixed(3) + '/' + mx.toFixed(3) + '/' + ((mx - mn) / 3).toFixed(3) + ' ms\n'; }
  c.out(out); return got ? 0 : 1;
};
function hopsTo(sh, ip) {
  if (isLocal(sh, ip)) return [{ ip: '127.0.0.1', ms: 0.04 }];
  if (/^10\.0\.0\./.test(ip)) return [{ ip: '10.0.0.1', ms: 0.5 }, { ip: ip, ms: latency(sh, ip) }];
  var d = latency(sh, ip), down = netDefaults(sh).down.indexOf(ip) >= 0, drop = reach(sh, ip, ip) === 'drop';
  var h = [{ ip: '10.0.0.1', ms: 0.6 }, { ip: '118.69.240.1', ms: 1.9 }, { ip: '14.241.250.17', ms: 3.4 }, { ip: '??', ms: null }, { ip: '203.113.131.22', ms: d * 0.5 }, { ip: '4.68.111.9', ms: d * 0.8 }];
  if (down || drop) { h.push({ ip: '??', ms: null }); } else h.push({ ip: ip, ms: d });
  return h;
}
IMPL.traceroute = function (a, c) {
  var sh = c.sh, host = a.filter(function (x) { return x.charAt(0) !== '-'; })[0];
  if (!host) throw new CmdErr('Usage: traceroute [options] host', 2);
  var r = resolve(sh, host); if (r.err) { c.err(host + ': ' + (r.err === 'temp' ? 'Temporary failure in name resolution' : 'Name or service not known') + '\nCannot handle "host" cmdline arg `' + host + '\' on position 1 (argc 1)\n'); return 2; }
  var hops = hopsTo(sh, r.ip), out = 'traceroute to ' + host + ' (' + r.ip + '), 30 hops max, 60 byte packets\n';
  hops.forEach(function (h, i) { out += pad(i + 1, 2, true) + '  ' + (h.ip === '??' ? '* * *' : h.ip + '  ' + h.ms.toFixed(3) + ' ms  ' + (h.ms * 1.03).toFixed(3) + ' ms  ' + (h.ms * 1.07).toFixed(3) + ' ms') + '\n'; });
  c.out(out); return reach(sh, host, r.ip) === 'ok' ? 0 : 0;
};
IMPL.mtr = function (a, c) {
  var sh = c.sh, cnt = 10, host = null, rep = false, i;
  for (i = 0; i < a.length; i++) { var x = a[i]; if (/^-[a-zA-Z]*c$/.test(x)) { cnt = parseInt(a[++i], 10); if (/r/.test(x)) rep = true; } else if (/^-c\d+$/.test(x)) cnt = +x.slice(2); else if (x === '--report') rep = true; else if (/^-[a-zA-Z]+$/.test(x)) { if (/r/.test(x)) rep = true; } else if (x.charAt(0) !== '-') host = x; }
  if (!host) throw new CmdErr('usage: mtr [options] hostname', 1);
  if (!rep) { c.out('mtr chạy màn hình tương tác nên không dùng được trong khung này. Dùng chế độ báo cáo: mtr -rc 10 ' + host + '\n'); return 1; }
  var r = resolve(sh, host); if (r.err) { c.err('mtr: Failed to resolve host: ' + host + (r.err === 'temp' ? ': Temporary failure in name resolution' : ': Name or service not known') + '\n'); return 1; }
  var hops = hopsTo(sh, r.ip), out = 'Start: ' + stamp(sh).replace(' ', 'T') + '+0700\nHOST: ' + pad(sh.hostName, 28) + 'Loss%   Snt   Last   Avg  Best  Wrst StDev\n';
  hops.forEach(function (h, i) {
    if (h.ip === '??') out += pad(i + 1, 3, true) + '.|-- ' + pad('???', 26) + '100.0%  ' + pad(cnt, 4, true) + '   0.0   0.0   0.0   0.0   0.0\n';
    else { var m = h.ms; out += pad(i + 1, 3, true) + '.|-- ' + pad(h.ip, 26) + ' 0.0%  ' + pad(cnt, 4, true) + ' ' + pad(m.toFixed(1), 6, true) + ' ' + pad((m * 1.05).toFixed(1), 5, true) + ' ' + pad((m * 0.9).toFixed(1), 5, true) + ' ' + pad((m * 1.3).toFixed(1), 5, true) + ' ' + pad((m * 0.1).toFixed(1), 5, true) + '\n'; }
  });
  c.out(out); return 0;
};
var prevIp = cmds.ip;
cmds.ip = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevIp(a, c);
  var ip = sh.W.ip || V.IP, args = a.filter(function (x) { return x.charAt(0) !== '-'; }), sub = args[0] || '';
  if (/^r(oute)?$/.test(sub)) {
    if (args[1] === 'get' && args[2]) { var r = resolve(sh, args[2]); if (r.err) { c.err('Error: any valid prefix is expected rather than "' + args[2] + '".\n'); return 1; } c.out(r.ip + ' via 10.0.0.1 dev eth0 src ' + ip + ' uid 1000 \n    cache \n'); return 0; }
    c.out('default via 10.0.0.1 dev eth0 proto dhcp src ' + ip + ' metric 100 \n10.0.0.0/24 dev eth0 proto kernel scope link src ' + ip + ' metric 100 \n10.0.0.2 dev eth0 proto dhcp scope link src ' + ip + ' metric 100 \n172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown \n'); return 0;
  }
  if (/^l(ink)?$/.test(sub)) { c.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000\n    link/ether 52:54:00:3a:91:b2 brd ff:ff:ff:ff:ff:ff\n'); return 0; }
  if (a.indexOf('-br') >= 0 || a.indexOf('-brief') >= 0) return prevIp(['-br', 'a'], c);
  if (/^a(ddr(ess)?)?$/.test(sub) || !sub) {
    if (a.indexOf('-br') >= 0) return prevIp(a, c);
    c.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    link/ether 52:54:00:3a:91:b2 brd ff:ff:ff:ff:ff:ff\n    inet ' + ip + '/24 metric 100 brd ' + ip.replace(/\.\d+$/, '.255') + ' scope global dynamic eth0\n       valid_lft 86212sec preferred_lft 86212sec\n    inet6 fe80::5054:ff:fe3a:91b2/64 scope link \n       valid_lft forever preferred_lft forever\n'); return 0;
  }
  return prevIp(a, c);
};

/* curl, wget */
var prevCurl = cmds.curl;
function localResponse(sh, port, path) {
  var ls = LIN.listeners ? LIN.listeners(sh) : [], hit = ls.filter(function (s) { return s.port === port; })[0];
  if (!hit) return null;
  var p = hit.proc;
  if (p.name === 'node') return path === '/health' ? { code: 200, body: '{"status":"ok","uptime":' + (Math.round((sh.W.lin.now - p.start) / 1000)) + '}\n', server: null, type: 'application/json; charset=utf-8' } : (path === '/' ? { code: 200, body: 'Hello from tutor-api\n', server: null, type: 'text/html; charset=utf-8' } : { code: 404, body: '{"statusCode":404,"message":"Cannot GET ' + path + '","error":"Not Found"}\n', server: null, type: 'application/json; charset=utf-8' });
  if (p.name === 'nginx') {
    var up = ls.filter(function (s) { return s.port === 8888; })[0];
    if (S2(sh).proxyTo && !up) return { code: 502, body: '<html>\n<head><title>502 Bad Gateway</title></head>\n<body>\n<center><h1>502 Bad Gateway</h1></center>\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\n</body>\n</html>\n', server: 'nginx/1.24.0 (Ubuntu)', type: 'text/html' };
    if (S2(sh).proxyTo && up) return localResponse(sh, S2(sh).proxyTo, path) ? Object.assign({}, localResponse(sh, S2(sh).proxyTo, path), { server: 'nginx/1.24.0 (Ubuntu)' }) : null;
    return { code: 200, body: '<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n</head>\n<body>\n<h1>Welcome to nginx!</h1>\n</body>\n</html>\n', server: 'nginx/1.24.0 (Ubuntu)', type: 'text/html' };
  }
  return { code: 0, empty: true };
}
function httpFetch(sh, url) {
  var m = /^(?:(https?):\/\/)?([^\/:?#]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?/.exec(url);
  if (!m) return { err: 3, msg: "curl: (3) URL rejected: Bad hostname" };
  var scheme = m[1] || 'http', host = m[2], port = m[3] ? +m[3] : (scheme === 'https' ? 443 : 80), path = m[4] || '/';
  var r = resolve(sh, host);
  if (r.err) return { err: 6, msg: 'curl: (6) Could not resolve host: ' + host, host: host };
  var net = netDefaults(sh), ent = net.web[host];
  var out = { scheme: scheme, host: host, port: port, path: path, ip: r.ip };
  if (isLocal(sh, r.ip) || ent === 'local') {
    var lp = isLocal(sh, r.ip) && !(ent === 'local') ? port : (scheme === 'https' ? 80 : port);
    var lr = localResponse(sh, lp, path);
    if (!lr) return { err: 7, msg: 'curl: (7) Failed to connect to ' + host + ' port ' + port + ' after 0 ms: Couldn\'t connect to server', host: host };
    if (lr.empty) return { err: 52, msg: 'curl: (52) Empty reply from server', host: host };
    return Object.assign(out, lr);
  }
  if (ent && typeof ent === 'object') {
    if (path !== '/' && ent.code === 200) return Object.assign(out, { code: 404, body: '<!doctype html><html><title>404 Not Found</title></html>\n', server: ent.server, type: 'text/html' });
    return Object.assign(out, ent);
  }
  if (reach(sh, host, r.ip) !== 'ok' && !ent) return { err: 28, msg: 'curl: (28) Failed to connect to ' + host + ' port ' + port + ' after 130000 ms: Timeout was reached', host: host };
  return Object.assign(out, { code: 200, body: '<html><title>' + host + '</title></html>\n', server: 'nginx', type: 'text/html' });
}
var STATUS = { 200: 'OK', 301: 'Moved Permanently', 302: 'Found', 404: 'Not Found', 502: 'Bad Gateway', 403: 'Forbidden', 500: 'Internal Server Error' };
function nodesourceScript(ver) {
  return '#!/bin/bash\n# NodeSource setup (mô phỏng) cho Node.js ' + ver + '.x\necho "## Installing the NodeSource Node.js ' + ver + '.x repo..."\nmkdir -p /etc/apt/keyrings\necho "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_' + ver + '.x nodistro main" > /etc/apt/sources.list.d/nodesource.list\necho "## Running apt-get update..."\napt-get update\necho "## Run \\`sudo apt-get install -y nodejs\\` to install Node.js ' + ver + '.x and npm"\n';
}
cmds.curl = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevCurl(a, c);
  var o = { s: false, S: false, f: false, L: false, I: false, v: false, k: false }, url = null, outF = null, wfmt = null, i, method = null, remoteName = false;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '-o') outF = a[++i]; else if (x === '-O' || x === '--remote-name') remoteName = true; else if (x === '-w' || x === '--write-out') wfmt = a[++i];
    else if (x === '-X' || x === '-H' || x === '-d' || x === '-m' || x === '--max-time' || x === '-u' || x === '-A' || x === '-e' || x === '--connect-timeout' || x === '--data') { if (x === '-X') method = a[i + 1]; i++; }
    else if (/^-[a-zA-Z]+$/.test(x)) { x.slice(1).split('').forEach(function (ch) { if (o[ch] !== undefined) o[ch] = true; if (ch === 'O') remoteName = true; }); }
    else if (/^--(silent|fail|location|head|verbose|insecure)$/.test(x)) { var mp = { silent: 's', fail: 'f', location: 'L', head: 'I', verbose: 'v', insecure: 'k' }; o[mp[x.slice(2)]] = true; }
    else if (x.charAt(0) !== '-') url = x;
  }
  if (!url) throw new CmdErr("curl: try 'curl --help' for more information", 2);
  var ns = /deb\.nodesource\.com\/setup_(\d+)\.x/.exec(url);
  if (ns) {
    var r0 = resolve(sh, 'deb.nodesource.com'); if (r0.err) { if (!o.s || o.S) c.err('curl: (6) Could not resolve host: deb.nodesource.com\n'); return 6; }
    if (['18', '20', '22', '24'].indexOf(ns[1]) < 0) { if (o.f) { if (!o.s || o.S) c.err('curl: (22) The requested URL returned error: 404\n'); return 22; } c.out('404: Not Found\n'); return 0; }
    var body = nodesourceScript(ns[1]);
    if (outF) { try { sh.writeFile(sh.abs(outF), body, c, 'curl', false); } catch (e) { c.err('curl: (23) Failure writing output to destination\n'); return 23; } return 0; }
    c.out(body); return 0;
  }
  var cleanUrl = url.replace(/^\/\//, '');
  var r = httpFetch(sh, cleanUrl);
  var verbose = [];
  if (r.err) {
    if (o.v) { var h0 = /^(?:https?:\/\/)?([^\/:]+)/.exec(cleanUrl)[1]; if (r.err === 6) c.err('* Could not resolve host: ' + h0 + '\n* Closing connection\n'); else c.err('*   Trying ' + (resolve(sh, h0).ip) + ':' + (/:(\d+)/.exec(cleanUrl) || [0, 80])[1] + '...\n* connect to ' + resolve(sh, h0).ip + ' port ' + ((/:(\d+)/.exec(cleanUrl) || [0, 80])[1]) + ' failed: Connection refused\n'); }
    if (!o.s || o.S) c.err(r.msg + '\n'); return r.err;
  }
  var code = r.code, st = STATUS[code] || '';
  if (o.v) {
    verbose.push('*   Trying ' + r.ip + ':' + r.port + '...', '* Connected to ' + r.host + ' (' + r.ip + ') port ' + r.port);
    if (r.scheme === 'https') verbose.push('* TLSv1.3 (OUT), TLS handshake, Client hello (1):', '* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384');
    verbose.push('> ' + (method || (o.I ? 'HEAD' : 'GET')) + ' ' + r.path + ' HTTP/1.1', '> Host: ' + r.host + (r.port !== 80 && r.port !== 443 ? ':' + r.port : ''), '> User-Agent: curl/8.5.0', '> Accept: */*', '>', '< HTTP/1.1 ' + code + ' ' + st);
    if (r.server) verbose.push('< Server: ' + r.server);
    verbose.push('< Content-Type: ' + (r.type || 'text/html'), '< Content-Length: ' + (r.body || '').length);
    if (r.loc) verbose.push('< Location: ' + r.loc);
    verbose.push('<', '* Connection #0 to host ' + r.host + ' left intact');
    c.err(verbose.join('\n') + '\n');
  }
  if (r.loc && o.L) { var r2 = httpFetch(sh, r.loc.replace(/^https?:\/\//, '')); if (!r2.err) { r = Object.assign(r, r2); code = r.code; } }
  var text = '';
  if (o.I) text = 'HTTP/1.1 ' + code + ' ' + st + '\n' + (r.server ? 'Server: ' + r.server + '\n' : '') + 'Date: Tue, 27 Oct 2026 03:20:00 GMT\nContent-Type: ' + (r.type || 'text/html') + '\nContent-Length: ' + (r.body || '').length + '\nConnection: keep-alive\n' + (r.loc ? 'Location: ' + r.loc + '\n' : '') + '\n';
  else if (o.f && code >= 400) { if (!o.s || o.S) c.err('curl: (22) The requested URL returned error: ' + code + '\n'); return 22; }
  else text = r.body || '';
  if (remoteName) outF = (r.path.replace(/\/$/, '').split('/').pop() || 'index.html');
  if (outF && outF !== '/dev/null') { try { sh.writeFile(sh.abs(outF), text, c, 'curl', false); } catch (e) { c.err('curl: (23) Failure writing output to destination\n'); return 23; } }
  else if (!outF) c.out(text);
  if (wfmt) c.out(wfmt.replace(/\\n/g, '\n').replace(/%\{http_code\}/g, String(code)).replace(/%\{size_download\}/g, String((r.body || '').length)).replace(/%\{remote_ip\}/g, r.ip).replace(/%\{time_total\}/g, '0.042').replace(/%\{url_effective\}/g, url));
  return 0;
};
IMPL.wget = null;
cmds.wget = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: wget: command not found', 127);
  var q = false, outF = null, url = null, i, toStd = false;
  for (i = 0; i < a.length; i++) { var x = a[i]; if (x === '-O') { outF = a[++i]; if (outF === '-') toStd = true; } else if (/^-q+O-?$/.test(x)) { q = true; if (/O-$/.test(x)) toStd = true; else outF = a[++i]; } else if (x === '-q' || x === '--quiet') q = true; else if (/^-qO/.test(x)) { q = true; outF = x.slice(3) || a[++i]; if (outF === '-') toStd = true; } else if (x === '-P' || x === '-t' || x === '-T') i++; else if (x.charAt(0) !== '-') url = x; }
  if (!url) throw new CmdErr('wget: missing URL\nUsage: wget [OPTION]... [URL]...', 1);
  var r = httpFetch(sh, url.replace(/^\/\//, ''));
  var host = (/^(?:https?:\/\/)?([^\/:]+)/.exec(url) || [0, url])[1];
  if (r.err) { if (r.err === 6) c.err('wget: unable to resolve host address ‘' + host + '’\n'); else c.err('--' + stamp(sh) + '--  ' + url + '\nConnecting to ' + host + '... failed: ' + (r.err === 7 ? 'Connection refused.' : 'Connection timed out.') + '\n'); return 4; }
  if (r.code >= 400) { if (!q) c.err('--' + stamp(sh) + '--  ' + url + '\nResolving ' + host + ' (' + host + ')... ' + r.ip + '\nHTTP request sent, awaiting response... ' + r.code + ' ' + STATUS[r.code] + '\n' + stamp(sh) + ' ERROR ' + r.code + ': ' + STATUS[r.code] + '.\n'); return 8; }
  var name = outF || (r.path.replace(/\/$/, '').split('/').pop() || 'index.html'), body = r.body || '';
  if (toStd) { c.out(body); return 0; }
  try { sh.writeFile(sh.abs(name), body, c, 'wget', false); } catch (e) { c.err(name + ': Permission denied\n'); return 3; }
  if (!q) c.err('--' + stamp(sh) + '--  ' + url + '\nResolving ' + host + ' (' + host + ')... ' + r.ip + '\nConnecting to ' + host + ' (' + host + ')|' + r.ip + '|:' + r.port + '... connected.\nHTTP request sent, awaiting response... 200 OK\nLength: ' + body.length + ' (' + body.length + ') [' + (r.type || 'text/html') + ']\nSaving to: ‘' + name + '’\n\n' + pad(name, 20) + '100%[===================>] ' + pad(body.length, 6, true) + '  --.-KB/s    in 0s\n\n' + stamp(sh) + ' (45.2 MB/s) - ‘' + name + '’ saved [' + body.length + '/' + body.length + ']\n\n');
  return 0;
};
function digImpl(a, c) {
  var sh = c.sh, short = a.indexOf('+short') >= 0, via = null, name = null, type = 'A', i;
  for (i = 0; i < a.length; i++) { if (a[i].charAt(0) === '@') via = a[i].slice(1); else if (a[i].charAt(0) === '+') {} else if (/^(A|AAAA|MX|TXT|NS|CNAME)$/.test(a[i]) && name) type = a[i]; else name = a[i]; }
  if (!name) { c.out('; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>>\n;; global options: +cmd\n'); return 0; }
  if (type !== 'A') { c.out(short ? '' : ';; (mô phỏng chỉ hỗ trợ bản ghi A trong bài này)\n'); return 0; }
  var r = resolve(sh, name, via), srv = via || dnsServers(sh)[0] || '127.0.0.53';
  if (r.err === 'temp') { c.out(';; communications error to ' + srv + '#53: timed out\n;; communications error to ' + srv + '#53: timed out\n;; no servers could be reached\n'); return 9; }
  if (short) { if (r.ip) c.out(r.ip + '\n'); return 0; }
  c.out('; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>> ' + name + '\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: ' + (r.ip ? 'NOERROR' : 'NXDOMAIN') + ', id: 31337\n;; flags: qr rd ra; QUERY: 1, ANSWER: ' + (r.ip ? 1 : 0) + ', AUTHORITY: 0, ADDITIONAL: 1\n\n;; QUESTION SECTION:\n;' + name + '.\t\t\tIN\tA\n\n' + (r.ip ? ';; ANSWER SECTION:\n' + name + '.\t\t300\tIN\tA\t' + r.ip + '\n\n' : '') + ';; Query time: 12 msec\n;; SERVER: ' + srv + '#53(' + srv + ') (UDP)\n;; MSG SIZE  rcvd: 56\n');
  return 0;
}
IMPL.dig = digImpl;
IMPL.nslookup = function (a, c) {
  var sh = c.sh, pos = a.filter(function (x) { return x.charAt(0) !== '-'; }), name = pos[0], via = pos[1] || null;
  if (!name) throw new CmdErr('nslookup: chế độ tương tác không có trong bài này. Dùng: nslookup tên-miền', 1);
  var r = resolve(sh, name, via), srv = via || dnsServers(sh)[0] || '127.0.0.53';
  if (r.err === 'temp') { c.out(';; communications error to ' + srv + '#53: timed out\n;; communications error to ' + srv + '#53: timed out\n;; no servers could be reached\n\n'); return 1; }
  var head = 'Server:\t\t' + srv + '\nAddress:\t' + srv + '#53\n\n';
  if (r.err) { c.out(head + "** server can't find " + name + ': NXDOMAIN\n\n'); return 1; }
  c.out(head + (isIP(name) ? '' : 'Non-authoritative answer:\n') + 'Name:\t' + name + '\nAddress: ' + r.ip + '\n\n'); return 0;
};

/* ============ nén: tar, gzip, zip ============ */
function globRe(pat) { return new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); }
function excluded(rel, pats) { var parts = rel.split('/'); return pats.some(function (p) { var re = globRe(p); return re.test(rel) || parts.some(function (s) { return re.test(s); }); }); }
function gather(sh, baseDir, members, pats, skipAbs) {
  var out = [];
  members.forEach(function (m) {
    var ap = sh.fs.norm((m.charAt(0) === '/' ? '' : baseDir + '/') + m), n = sh.fs.get(ap, true);
    if (!n) { out.push({ missing: m }); return; }
    var name = m.replace(/^\/+/, '').replace(/^\.\//, '') || '.';
    if (m === '.') name = '.';
    function add(p, nm) {
      if (skipAbs && p === skipAbs) { out.push({ self: nm }); return; }
      if (excluded(nm, pats)) return;
      var nn = sh.fs.get(p, true); out.push({ name: nm, node: JSON.parse(JSON.stringify(nn)), abs: p });
      if (nn.t === 'd') sh.fs.list(p).sort().forEach(function (k) { add((p === '/' ? '' : p) + '/' + k, (nm === '.' ? '.' : nm) + '/' + k); });
    }
    add(ap, name);
  });
  return out;
}
function bytesOf(ents) { var b = 0; ents.forEach(function (e) { if (e.node && e.node.t === 'f') b += e.node.size != null ? e.node.size : (e.node.c || '').length; }); return b; }
function ensureArc(sh) { var S = S2(sh); S.arcs = S.arcs || {}; return S.arcs; }
function writeArc(sh, c, path, data, who) {
  if (!sh.canWrite(path, c)) throw new CmdErr(who + ': ' + path.replace(/^.*\//, '') + ': Cannot open: Permission denied', 2);
  var mnt = sh.fs; var nodeSize = Math.max(1024, Math.round(bytesOf(data.ents) * 0.35) + 200 * data.ents.length);
  sh.fs.put(path, 'archive:' + data.kind + ' (' + data.ents.length + ' mục, mô phỏng)\n', { owner: c.sudo || sh.forceRoot ? 'root' : sh.user, mode: 420, size: nodeSize });
  ensureArc(sh)[path] = data;
}
function restoreEnts(sh, c, ents, target, strip, only, verbose, who) {
  var rc = 0, out = '';
  ents.forEach(function (e) {
    var nm = e.name; if (nm === '.') return;
    if (strip) { var parts = nm.split('/'); if (parts.length <= strip) return; nm = parts.slice(strip).join('/'); }
    if (only.length && !only.some(function (o) { return nm === o || nm.indexOf(o.replace(/\/$/, '') + '/') === 0; })) return;
    var dest = sh.fs.norm(target + '/' + nm), asRoot = sh.isRoot(c);
    var ex = sh.fs.get(dest, true);
    if (!asRoot && !sh.canWrite(dest, c)) { c.err(who + ': ' + nm + ': Cannot open: Permission denied\n'); rc = 2; return; }
    var owner = asRoot ? e.node.owner : sh.user;
    if (e.node.t === 'd') { sh.fs.mkdirp(dest, owner, e.node.mode); var dn = sh.fs.get(dest, true); if (dn && !ex) { dn.owner = owner; if (e.node.group && asRoot) dn.group = e.node.group; } }
    else sh.fs.put(dest, e.node.c, { owner: owner, mode: e.node.mode, size: e.node.size });
    if (verbose) out += nm + (e.node.t === 'd' ? '/' : '') + '\n';
  });
  if (out) c.out(out);
  return rc;
}
cmds.tar = (function (prev) {
  return function (a, c) {
    var sh = c.sh; if (!on(sh)) return prev(a, c);
    var mode = null, z = false, v = false, f = null, dir = null, pats = [], strip = 0, rest = [], i, bundle = null, fNext = false, x;
    for (i = 0; i < a.length; i++) {
      x = a[i];
      if (x === '-C' || x === '--directory') dir = a[++i]; else if (/^--exclude=/.test(x)) pats.push(x.slice(10).replace(/^['"]|['"]$/g, '')); else if (x === '--exclude') pats.push(a[++i]);
      else if (/^--strip-components=/.test(x)) strip = parseInt(x.slice(19), 10); else if (x === '-f' || x === '--file') f = a[++i];
      else if (/^--(gzip|auto-compress)$/.test(x)) z = true; else if (x === '--verbose') v = true; else if (x === '--create') mode = 'c'; else if (x === '--extract' || x === '--get') mode = 'x'; else if (x === '--list') mode = 't';
      else if (/^-?[cxtzjJvfpPkO]+$/.test(x) && (i === 0 || /^-/.test(x)) && /[cxt]/.test(x)) {
        var fl = x.replace(/^-/, ''); fl.split('').forEach(function (ch) { if (ch === 'c' || ch === 'x' || ch === 't') mode = ch; else if (ch === 'z' || ch === 'j' || ch === 'J') z = true; else if (ch === 'v') v = true; else if (ch === 'f') fNext = true; });
        if (fNext) { f = a[++i]; fNext = false; }
      } else if (/^-[zvjJp]+$/.test(x)) { if (/z|j|J/.test(x)) z = true; if (/v/.test(x)) v = true; } else rest.push(x);
    }
    if (!mode) throw new CmdErr("tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\nTry 'tar --help' or 'tar --usage' for more information.", 2);
    if (!f) { f = rest.shift(); }
    if (!f) throw new CmdErr(mode === 'c' ? 'tar: Refusing to write archive contents to terminal (missing -f option?)\ntar: Error is not recoverable: exiting now' : 'tar: Refusing to read archive contents from terminal (missing -f option?)\ntar: Error is not recoverable: exiting now', 2);
    var arc = sh.abs(f), base = dir ? sh.abs(dir) : sh.cwd;
    if (dir && !sh.fs.isD(base) && mode !== 'c') { throw new CmdErr('tar: ' + dir + ': Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now', 2); }
    if (mode === 'c') {
      if (!rest.length) throw new CmdErr("tar: Cowardly refusing to create an empty archive\nTry 'tar --help' or 'tar --usage' for more information.", 2);
      if (dir && !sh.fs.isD(base)) throw new CmdErr('tar: ' + dir + ': Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now', 2);
      var lead = rest.some(function (m) { return m.charAt(0) === '/'; }); if (lead) c.err("tar: Removing leading `/' from member names\n");
      var ents = gather(sh, base, rest, pats, arc), rc = 0, outv = '';
      ents.forEach(function (e) { if (e.missing) { c.err('tar: ' + e.missing + ': Cannot stat: No such file or directory\n'); rc = 2; } else if (e.self) { c.err('tar: ' + e.self + ': file is the archive; not dumped\n'); } });
      ents = ents.filter(function (e) { return e.name; });
      if (v) ents.forEach(function (e) { outv += e.name + (e.node.t === 'd' ? '/' : '') + '\n'; });
      if (outv) c.out(outv);
      if (!ents.length && rc) { c.err('tar: Exiting with failure status due to previous errors\n'); return 2; }
      writeArc(sh, c, arc, { kind: z ? 'tar.gz' : 'tar', z: z, ents: ents }, 'tar');
      if (rc) { c.err('tar: Exiting with failure status due to previous errors\n'); return 2; }
      return 0;
    }
    var an = sh.fs.get(arc), data = ensureArc(sh)[arc];
    if (!an) throw new CmdErr('tar: ' + f + ': Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now', 2);
    if (!data) throw new CmdErr('tar: This does not look like a tar archive\ntar: Skipping to next header\ntar: Exiting with failure status due to previous errors', 2);
    if (data.kind === 'zip') throw new CmdErr('tar: This does not look like a tar archive\ntar: Skipping to next header\ntar: Exiting with failure status due to previous errors', 2);
    if (z && !data.z) throw new CmdErr('gzip: stdin: not in gzip format\ntar: Child returned status 1\ntar: Error is not recoverable: exiting now', 2);
    if (mode === 't') { c.out(data.ents.map(function (e) { return e.name + (e.node.t === 'd' ? '/' : ''); }).join('\n') + '\n'); return 0; }
    return restoreEnts(sh, c, data.ents, base, strip, rest, v, 'tar');
  };
})(cmds.tar);
function gzFile(sh, c, p, keep, dec, who) {
  var ap = sh.abs(p), S = S2(sh), n = sh.fs.get(ap, true);
  if (!n) { c.err(who + ': ' + p + ': No such file or directory\n'); return 1; }
  if (!dec) {
    if (n.t === 'd') { c.err(who + ': ' + p + ' is a directory -- ignored\n'); return 1; }
    if (/\.gz$/.test(ap)) { c.err(who + ': ' + p + ' already has .gz suffix -- unchanged\n'); return 2; }
    if (!sh.canWrite(ap + '.gz', c)) { c.err(who + ': ' + p + '.gz: Permission denied\n'); return 1; }
    var sz = n.size != null ? n.size : (n.c || '').length;
    S.gz = S.gz || {}; S.gz[ap + '.gz'] = JSON.parse(JSON.stringify(n));
    sh.fs.put(ap + '.gz', 'gzip compressed data (mô phỏng)\n', { owner: n.owner, mode: n.mode, size: Math.max(60, Math.round(sz * 0.3)) });
    var gn = sh.fs.get(ap + '.gz', true); if (n.group) gn.group = n.group;
    if (!keep) sh.fs.rm(ap); return 0;
  }
  var src = (S.gz || {})[ap];
  if (!/\.gz$/.test(ap)) { c.err(who + ': ' + p + ': unknown suffix -- ignored\n'); return 2; }
  if (!src) { c.err(who + ': ' + p + ': not in gzip format\n'); return 1; }
  var dest = ap.replace(/\.gz$/, '');
  if (sh.fs.get(dest, true)) { c.err(who + ': ' + p.replace(/\.gz$/, '') + ' already exists; not overwritten\n'); return 2; }
  sh.fs.put(dest, src.c, { owner: src.owner, mode: src.mode, size: src.size }); if (!keep) { sh.fs.rm(ap); delete S.gz[ap]; } return 0;
}
cmds.gzip = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: gzip: command not found', 127);
  var fl = a.filter(function (x) { return x.charAt(0) === '-'; }).join(''), files = a.filter(function (x) { return x.charAt(0) !== '-'; }), rc = 0;
  if (/c/.test(fl) && !/d/.test(fl)) { files.forEach(function (p) { var n = sh.fs.get(sh.abs(p)); if (n) c.out('(dữ liệu gzip nhị phân của ' + p + ')\n'); }); return 0; }
  files.forEach(function (p) { var r = gzFile(sh, c, p, /k/.test(fl), /d/.test(fl), 'gzip'); if (r) rc = r; });
  return rc;
};
cmds.gunzip = function (a, c) { var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: gunzip: command not found', 127); var rc = 0, keep = a.indexOf('-k') >= 0; a.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) { var r = gzFile(sh, c, p, keep, true, 'gzip'); if (r) rc = r; }); return rc; };
cmds.zcat = function (a, c) { var sh = c.sh; var rc = 0; a.forEach(function (p) { var src = (S2(sh).gz || {})[sh.abs(p)]; if (!src) { c.err('gzip: ' + p + ': not in gzip format\n'); rc = 1; return; } c.out(src.c || ''); }); return rc; };
IMPL.zip = function (a, c) {
  var sh = c.sh, rec = a.indexOf('-r') >= 0, xs = [], pos = [], i;
  for (i = 0; i < a.length; i++) { if (a[i] === '-x') { while (a[i + 1] && a[i + 1].charAt(0) !== '-') xs.push(a[++i]); } else if (a[i].charAt(0) !== '-') pos.push(a[i]); }
  var out = pos.shift(); if (!out || !pos.length) throw new CmdErr('zip error: Nothing to do!', 15);
  if (!/\.zip$/.test(out)) out += '.zip';
  var ents = gather(sh, sh.cwd, pos, xs, sh.abs(out)), o = '', rc = 0;
  ents = ents.filter(function (e) { if (e.missing) { c.err('\tzip warning: name not matched: ' + e.missing + '\n'); rc = 12; return false; } return !!e.name; });
  var dirNoR = pos.filter(function (p) { return sh.fs.isD(sh.abs(p)); }).length && !rec;
  if (dirNoR) ents = ents.filter(function (e) { return e.node.t === 'd' && e.name === pos[0].replace(/\/$/, ''); });
  ents.forEach(function (e) { o += '  adding: ' + e.name + (e.node.t === 'd' ? '/' : '') + ' (' + (e.node.t === 'd' ? 'stored 0%' : 'deflated 38%') + ')\n'; });
  if (!ents.length) { c.err('zip error: Nothing to do! (' + out + ')\n'); return 12; }
  writeArc(sh, c, sh.abs(out), { kind: 'zip', z: true, ents: ents }, 'zip'); c.out(o); return rc;
};
IMPL.unzip = function (a, c) {
  var sh = c.sh, list = a.indexOf('-l') >= 0, di = a.indexOf('-d'), dir = di >= 0 ? a[di + 1] : null, f = a.filter(function (x, i) { return x.charAt(0) !== '-' && a[i - 1] !== '-d'; })[0];
  if (!f) throw new CmdErr('UnZip 6.00 of 20 April 2009. Usage: unzip [-d dir] file.zip', 1);
  var ap = sh.abs(f.indexOf('.') < 0 ? f + '.zip' : f), data = ensureArc(sh)[ap];
  if (!sh.fs.get(ap)) { c.err('unzip:  cannot find or open ' + f + ', ' + f + '.zip or ' + f + '.ZIP.\n'); return 9; }
  if (!data || data.kind !== 'zip') { c.err('Archive:  ' + f + '\n  End-of-central-directory signature not found.  Either this file is not\n  a zipfile, or it constitutes one disk of a multi-part archive.\n'); return 9; }
  if (a.indexOf('-t') >= 0) { c.out('Archive:  ' + f + '\n' + data.ents.filter(function (e) { return e.node.t !== 'd'; }).map(function (e) { return '    testing: ' + (e.name + '                              ').slice(0, Math.max(e.name.length + 2, 30)) + 'OK'; }).join('\n') + '\nNo errors detected in compressed data of ' + f + '.\n'); return 0; }
  if (list) { var tot = 0; c.out('Archive:  ' + f + '\n  Length      Date    Time    Name\n---------  ---------- -----   ----\n' + data.ents.map(function (e) { var s = e.node.t === 'd' ? 0 : (e.node.size != null ? e.node.size : (e.node.c || '').length); tot += s; return pad(s, 9, true) + '  2026-10-27 10:20   ' + e.name + (e.node.t === 'd' ? '/' : ''); }).join('\n') + '\n---------                     -------\n' + pad(tot, 9, true) + '                     ' + data.ents.length + ' files\n'); return 0; }
  var target = dir ? sh.abs(dir) : sh.cwd; if (dir) sh.fs.mkdirp(target, sh.user);
  if (a.indexOf('-q') < 0) c.out('Archive:  ' + f + '\n' + data.ents.map(function (e) { return (e.node.t === 'd' ? '   creating: ' : '  inflating: ') + (dir ? dir.replace(/\/$/, '') + '/' : '') + e.name + (e.node.t === 'd' ? '/' : ''); }).join('\n') + '\n');
  return restoreEnts(sh, c, data.ents, target, 0, [], false, 'unzip');
};

/* ============ máy backup giả lập: scp, rsync, sftp, ssh ============ */
function remotes(sh) { var S = S2(sh); if (!S.remotes) S.remotes = { backup: { ip: '10.0.0.20', user: 'backup', dns: ['backup.example.com', 'backup.local', 'backup', '10.0.0.20'] } }; return S.remotes; }
function findRemote(sh, host) { var r = remotes(sh), k; for (k in r) { if (r[k].dns.indexOf(host) >= 0 || r[k].ip === host) return { key: k, r: r[k] }; } return null; }
var RRE = /^(?:([^@\/:\s]+)@)?([^:\/\s][^:\/\s]*):(.*)$/;
function parseRemote(spec) { if (/^\.{0,2}\//.test(spec) || /^[A-Za-z]:\\/.test(spec)) return null; var m = RRE.exec(spec); return m ? { user: m[1] || null, host: m[2], path: m[3] } : null; }
function connect(sh, c, who, rp, optPort) {
  var host = rp.host, res = resolve(sh, host);
  if (res.err) { c.err('ssh: Could not resolve hostname ' + host + (res.err === 'temp' ? ': Temporary failure in name resolution' : ': Name or service not known') + '\n'); return null; }
  var rm = findRemote(sh, host) || findRemote(sh, res.ip);
  if (!rm) { c.err('ssh: connect to host ' + host + ' port ' + (optPort || 22) + ': Connection timed out\n'); return null; }
  if (optPort && optPort !== 22) { c.err('ssh: connect to host ' + host + ' port ' + optPort + ': Connection refused\n'); return null; }
  var keyOk = sh.fs.get(sh.home + '/.ssh/id_ed25519') || sh.fs.get(sh.home + '/.ssh/id_rsa');
  var user = rp.user || sh.user;
  if (user !== rm.r.user || !keyOk) { c.err(user + '@' + res.ip + ': Permission denied (publickey).\n'); return null; }
  var kh = sh.home + '/.ssh/known_hosts', ex = fileText(sh, kh);
  if (ex.indexOf(res.ip) < 0) { c.err("Warning: Permanently added '" + res.ip + "' (ED25519) to the list of known hosts.\n"); sh.fs.put(kh, ex + res.ip + ' ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIbackupHostKey\n', { owner: sh.user, mode: 420 }); }
  return { key: rm.key, user: user, root: '/__r/' + rm.key, ip: res.ip };
}
function rmap(conn, p) { if (!p) p = '.'; if (p.charAt(0) === '~') p = '/home/' + conn.user + p.slice(1); if (p.charAt(0) !== '/') p = '/home/' + conn.user + '/' + p; var r = conn.root + p; r = r.replace(/\/\.$/, '').replace(/\/+$/, ''); return r || conn.root; }
function rcanWrite(sh, conn, path) {
  var fsx = sh.fs, p = fsx.real(path), n = fsx.n[p];
  function ok(nd) { return nd.owner === conn.user ? !!(nd.mode & 128) : !!(nd.mode & 2); }
  if (n) return ok(n);
  var pp = fsx.parent(p), d = fsx.n[pp];
  while (!d && pp !== '/') { pp = fsx.parent(pp); d = fsx.n[pp]; }
  return !!d && ok(d);
}
function unmapOut(text, conn) { return String(text).split(conn.root).join(''); }
function copyNode(sh, srcPath, dstPath, owner, recursive, onFile) {
  var n = sh.fs.get(srcPath, true);
  if (n.t === 'd') {
    sh.fs.mkdirp(dstPath, owner, n.mode); var dn = sh.fs.get(dstPath, true); if (dn) dn.owner = owner;
    sh.fs.list(srcPath).sort().forEach(function (k) { copyNode(sh, srcPath + '/' + k, dstPath + '/' + k, owner, true, onFile); });
  } else { sh.fs.put(dstPath, n.c, { owner: owner, mode: n.mode, size: n.size }); var fn = sh.fs.get(dstPath, true); fn.owner = owner; if (onFile) onFile(srcPath, dstPath, n); }
}
function sizeOfNode(sh, p) { return sh.fs.size(sh.fs.real(p)); }
function humSz(b) { return b < 1024 ? String(b) : b < 1048576 ? (b / 1024).toFixed(1) + 'KB' : (b / 1048576).toFixed(1) + 'MB'; }
cmds.scp = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: scp: command not found', 127);
  var rec = false, port = null, q = false, pos = [], i;
  for (i = 0; i < a.length; i++) { var x = a[i]; if (x === '-P') port = parseInt(a[++i], 10); else if (x === '-i' || x === '-o' || x === '-J') i++; else if (/^-[a-zA-Z]+$/.test(x)) { if (/r/.test(x)) rec = true; if (/q/.test(x)) q = true; } else pos.push(x); }
  if (pos.length < 2) throw new CmdErr('usage: scp [-346BCpqrTv] [-c cipher] [-F ssh_config] [-i identity_file]\n           [-J destination] [-l limit] [-o ssh_option] [-P port] [-S program]\n           source ... target', 1);
  var dst = pos.pop(), srcs = pos, rdst = parseRemote(dst), rsrc = srcs.map(parseRemote), anyR = rsrc.some(Boolean);
  if (rdst && anyR) { c.err('scp: cả hai đầu đều là máy ở xa: bản mô phỏng chỉ hỗ trợ local <-> remote\n'); return 1; }
  var conn = null;
  if (rdst) { conn = connect(sh, c, 'scp', rdst, port); if (!conn) { c.err('scp: Connection closed\n'); return 255; } }
  else if (anyR) { var first = rsrc.filter(Boolean)[0]; conn = connect(sh, c, 'scp', first, port); if (!conn) { c.err('scp: Connection closed\n'); return 255; } }
  var rc = 0, asRoot = false, lines2 = '';
  function prog(name, size) { if (!q) lines2 += pad(name, 38) + '100% ' + pad(size, 5, true) + '   ' + pad(humSz(size * 40), 8, true) + '/s   00:00\n'; }
  var upload = !!rdst;
  var dstAbs = upload ? rmap(conn, rdst.path) : sh.abs(dst.replace(/\/$/, '') || '/');
  var dstEx = sh.fs.get(dstAbs, true), dstIsDir = (dstEx && dstEx.t === 'd') || /\/$/.test(dst) || srcs.length > 1;
  srcs.forEach(function (s, k) {
    var src = rsrc[k], sp;
    if (upload) sp = sh.abs(s); else if (src) { sp = rmap(conn, src.path); } else sp = sh.abs(s);
    var n = sh.fs.get(sp, true);
    if (!n) { c.err('scp: ' + (upload ? sh.abs(s) : (src ? src.path : s)) + ': No such file or directory\n'); rc = 1; return; }
    if (n.t === 'd' && !rec) { c.err('scp: ' + (upload ? sh.abs(s) : src.path) + ': not a regular file\n'); rc = 1; return; }
    if (!upload && !src && false) {}
    if (!upload && !sh.canRead(sp, { sudo: false }) && !src) { c.err('scp: ' + s + ': Permission denied\n'); rc = 1; return; }
    var base = sp.replace(/\/$/, '').split('/').pop(), target = dstIsDir ? dstAbs + '/' + base : dstAbs;
    if (dstIsDir && !sh.fs.isD(dstAbs) && srcs.length > 1) { c.err('scp: ' + dst + ': Not a directory\n'); rc = 1; return; }
    var ok = upload ? rcanWrite(sh, conn, target) : sh.canWrite(target, c);
    if (!ok) { c.err('scp: ' + (upload ? rdst.path : dst) + (dstIsDir ? '/' + base : '') + ': Permission denied\n'); rc = 1; return; }
    var owner = upload ? conn.user : (c.sudo ? 'root' : sh.user);
    copyNode(sh, sp, target, owner, true, function (s1, d1, nn) { prog(n.t !== 'd' ? s : base + d1.slice(target.length), nn.size != null ? nn.size : (nn.c || '').length); });
  });
  if (lines2) c.out(lines2);
  return rc;
};
function rsyncExcl(pats, rel) { return pats.length && excluded(rel, pats); }
cmds.rsync = (function (prev) {
  return function (a, c) { return cmds.__rsync(a, c); };
})(cmds.rsync);
cmds.__rsync = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: rsync: command not found', 127);
  if (!S2(sh).pkgs.rsync) { c.err("Command 'rsync' not found, but can be installed with:\nsudo apt install rsync\n"); return 127; }
  var fl = { v: false, n: false, del: false, z: false, a: false, r: false, progress: false, u: false }, pats = [], pos = [], i, port = null;
  for (i = 0; i < a.length; i++) {
    var x = a[i];
    if (x === '--delete' || x === '--delete-after' || x === '--delete-before' || x === '--delete-excluded') fl.del = true; else if (x === '--dry-run') fl.n = true;
    else if (/^--exclude=/.test(x)) pats.push(x.slice(10).replace(/^['"]|['"]$/g, '')); else if (x === '--exclude') pats.push(a[++i]);
    else if (x === '-e' || x === '--rsh') { var e = a[++i]; var pm = /-p\s*(\d+)/.exec(e || ''); if (pm) port = +pm[1]; } else if (x === '--progress' || x === '-P') { fl.progress = true; }
    else if (x === '--verbose') fl.v = true; else if (x === '--archive') { fl.a = true; fl.r = true; } else if (x === '--recursive') fl.r = true; else if (x === '--compress') fl.z = true; else if (x === '--update') fl.u = true;
    else if (/^--(stats|partial|human-readable|bwlimit|info|itemize-changes|checksum|times|perms)(=.*)?$/.test(x)) {}
    else if (/^-[a-zA-Z]+$/.test(x)) { x.slice(1).split('').forEach(function (ch) { if (ch === 'v') fl.v = true; else if (ch === 'n') fl.n = true; else if (ch === 'a') { fl.a = true; fl.r = true; } else if (ch === 'r') fl.r = true; else if (ch === 'z') fl.z = true; else if (ch === 'u') fl.u = true; else if (ch === 'P') fl.progress = true; }); }
    else pos.push(x);
  }
  if (pos.length < 2) throw new CmdErr('Usage: rsync [OPTION]... SRC [SRC]... DEST\nrsync error: syntax or usage error (code 1) at main.c(1830) [client=3.2.7]', 1);
  var dst = pos.pop(), src = pos[0], rs = parseRemote(src), rd = parseRemote(dst);
  if (rs && rd) { c.err('rsync: cả hai đầu đều là máy ở xa: bản mô phỏng chỉ hỗ trợ local <-> remote\n'); return 1; }
  var conn = null;
  if (rs || rd) { conn = connect(sh, c, 'rsync', rs || rd, port); if (!conn) { c.err('rsync: connection unexpectedly closed (0 bytes received so far) [' + (rs ? 'Receiver' : 'sender') + ']\nrsync error: unexplained error (code 255) at io.c(231) [' + (rs ? 'Receiver' : 'sender') + '=3.2.7]\n'); return 255; } }
  var srcAbs = rs ? rmap(conn, rs.path) : sh.abs(src.replace(/\/$/, '') || '/'), dstAbs = rd ? rmap(conn, rd.path) : sh.abs(dst.replace(/\/$/, '') || '/');
  var srcRaw = rs ? rs.path : src, trailing = /\/$/.test(srcRaw), sn = sh.fs.get(srcAbs, true);
  if (!sn) { c.err('rsync: [sender] link_stat "' + (rs ? rs.path : sh.abs(src)) + '" failed: No such file or directory (2)\nrsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1338) [sender=3.2.7]\n'); return 23; }
  if (sn.t === 'd' && !fl.r) { c.out('skipping directory ' + src.replace(/\/$/, '') + '\n'); return 0; }
  var canW = function (p) { return rd ? rcanWrite(sh, conn, p) : sh.canWrite(p, c); };
  var owner = rd ? conn.user : (c.sudo ? 'root' : sh.user);
  // dựng danh sách nguồn: rel -> {abs,node}
  var items = [], destRoot;
  function walk(p, rel) { var n = sh.fs.get(p, true); if (rsyncExcl(pats, rel)) return; items.push({ rel: rel, abs: p, node: n }); if (n.t === 'd') sh.fs.list(p).sort().forEach(function (k) { walk(p + '/' + k, rel ? rel + '/' + k : k); }); }
  var base = srcAbs.replace(/\/$/, '').split('/').pop();
  if (sn.t === 'd') {
    if (trailing) { destRoot = dstAbs; items.push({ rel: '', abs: srcAbs, node: sn, root: true }); sh.fs.list(srcAbs).sort().forEach(function (k) { walk(srcAbs + '/' + k, k); }); }
    else { destRoot = dstAbs.replace(/\/$/, ''); var dd = sh.fs.get(destRoot, true); destRoot = destRoot; items.push({ rel: base, abs: srcAbs, node: sn }); sh.fs.list(srcAbs).sort().forEach(function (k) { walk(srcAbs + '/' + k, base + '/' + k); }); destRoot = dstAbs; }
  } else {
    var dnode = sh.fs.get(dstAbs, true), intoDir = (dnode && dnode.t === 'd') || /\/$/.test(dst);
    destRoot = intoDir ? dstAbs : dstAbs.replace(/\/[^\/]*$/, '') || '/';
    items.push({ rel: intoDir ? base : dstAbs.split('/').pop(), abs: srcAbs, node: sn });
  }
  var out = 'sending incremental file list\n', sent = 0, nfiles = 0, total = 0, rc = 0, del = [];
  // thư mục đích tồn tại?
  var rootN = sh.fs.get(destRoot, true);
  if (!rootN && sn.t === 'd') { if (!canW(destRoot)) { c.err('rsync: [receiver] mkdir "' + (rd ? rd.path : dst) + '" failed: Permission denied (13)\nrsync error: error in file IO (code 11) at main.c(795) [Receiver=3.2.7]\n'); return 11; } }
  if (fl.del && sn.t === 'd') {
    var keep = {}; items.forEach(function (it) { keep[it.rel] = 1; });
    (function scan(d, rel) { if (!sh.fs.get(d, true)) return; sh.fs.list(d).sort().forEach(function (k) { var r = rel ? rel + '/' + k : k, p = d + '/' + k; if (!keep[r] && !rsyncExcl(pats, r)) { del.push({ rel: r, abs: p, dir: sh.fs.get(p, true).t === 'd' }); } else if (sh.fs.get(p, true).t === 'd') scan(p, r); }); })(destRoot, '');
  }
  del.forEach(function (d) { out += 'deleting ' + d.rel + (d.dir ? '/' : '') + '\n'; });
  var changes = [];
  items.forEach(function (it) {
    var dpath = it.root ? destRoot : sh.fs.norm(destRoot + '/' + it.rel), dn = sh.fs.get(dpath, true), n = it.node;
    if (n.t === 'd') { if (!dn) { changes.push({ it: it, dpath: dpath, kind: 'd', name: it.rel ? it.rel + '/' : './' }); } else if (it.root) { if (fl.v) {} } return; }
    var same = dn && dn.t === 'f' && String(dn.c || '') === String(n.c || '') && (dn.size == null ? 0 : dn.size) === (n.size == null ? 0 : n.size);
    if (fl.u && dn && dn.t === 'f') same = true;
    if (!same) changes.push({ it: it, dpath: dpath, kind: 'f', name: it.rel });
  });
  if (!rootN && sn.t === 'd' && trailing && !changes.some(function (x) { return x.name === './'; })) changes.unshift({ it: items[0], dpath: destRoot, kind: 'd', name: './' });
  else if (rootN && trailing && sn.t === 'd' && changes.length && !fl.n) { changes.unshift({ it: items[0], dpath: destRoot, kind: 'dr', name: './' }); }
  else if (rootN && trailing && sn.t === 'd' && changes.length) { changes.unshift({ it: items[0], dpath: destRoot, kind: 'dr', name: './' }); }
  var idx = 0;
  changes.forEach(function (ch) {
    if (ch.kind === 'f') { var sz = ch.it.node.size != null ? ch.it.node.size : (ch.it.node.c || '').length; total += sz; nfiles++; }
  });
  changes.forEach(function (ch) {
    idx++;
    out += ch.name + '\n';
    if (fl.progress && ch.kind === 'f') { var sz2 = ch.it.node.size != null ? ch.it.node.size : (ch.it.node.c || '').length; out += pad(fmtN(sz2), 15, true) + ' 100%   ' + pad(humSz(sz2 * 50), 9, true) + '/s    0:00:00 (xfr#' + idx + ', to-chk=' + (changes.length - idx) + '/' + items.length + ')\n'; }
    if (fl.n) return;
    if (ch.kind === 'd') {
      if (!canW(ch.dpath)) { c.err('rsync: [receiver] mkdir "' + ch.dpath.replace(conn ? conn.root : '', '') + '" failed: Permission denied (13)\n'); rc = 23; return; }
      sh.fs.mkdirp(ch.dpath, owner, ch.it.node.mode); var dn2 = sh.fs.get(ch.dpath, true); if (dn2) dn2.owner = owner;
    } else if (ch.kind === 'f') {
      if (!canW(ch.dpath)) { c.err('rsync: [receiver] mkstemp "' + ch.dpath.replace(conn ? conn.root : '', '').replace(/\/([^\/]*)$/, '/.$1.XXXXXX') + '" failed: Permission denied (13)\n'); rc = 23; return; }
      sh.fs.put(ch.dpath, ch.it.node.c, { owner: owner, mode: ch.it.node.mode, size: ch.it.node.size }); var fn2 = sh.fs.get(ch.dpath, true); fn2.owner = owner;
    }
  });
  if (!fl.n) del.forEach(function (d) { if (canW(d.abs)) sh.fs.rm(d.abs); else { c.err('rsync: [deleter] delete_file: unlink("' + d.rel + '") failed: Permission denied (13)\n'); rc = 23; } });
  var sentB = total + 80 * changes.length + 60, recvB = 20 + 30 * changes.length;
  out += '\nsent ' + fmtN(sentB) + ' bytes  received ' + fmtN(recvB) + ' bytes  ' + fmtN((sentB + recvB) / 1.5) + '.00 bytes/sec\ntotal size is ' + fmtN(total) + '  speedup is ' + (total ? (total / (sentB + recvB)).toFixed(2) : '0.00') + (fl.n ? ' (DRY RUN)' : '') + '\n';
  if (fl.v || fl.progress || fl.n) c.out(out);
  if (rc) c.err('rsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1338) [sender=3.2.7]\n');
  return rc;
};
cmds.sftp = function (a, c) {
  var sh = c.sh; if (!on(sh)) throw new CmdErr('bash: sftp: command not found', 127);
  var bi = a.indexOf('-b'), batch = bi >= 0 ? a[bi + 1] : null, spec = a.filter(function (x, i) { return x.charAt(0) !== '-' && a[i - 1] !== '-b' && a[i - 1] !== '-P'; })[0];
  if (!spec) throw new CmdErr('usage: sftp [-46aCfNpqrv] [-B buffer_size] [-b batchfile] [-c cipher]\n           destination', 1);
  var rp = parseRemote(spec.indexOf(':') < 0 ? spec + ':' : spec); if (!rp) throw new CmdErr('sftp: destino không hợp lệ', 1);
  var conn = connect(sh, c, 'sftp', rp, null); if (!conn) { c.err('Connection closed\n'); return 255; }
  var script = batch ? (batch === '-' ? c.stdin : fileText(sh, sh.abs(batch))) : c.stdin;
  if (!script) { c.out('sftp: shell tương tác không chạy được trong khung này. Dùng chế độ lô: printf "put file\\nls\\nbye\\n" | sftp -b - ' + spec + '\n'); return 1; }
  var rcwd = '/home/' + conn.user, out = 'Connected to ' + rp.host + '.\n', rc = 0;
  lines(script).forEach(function (l) {
    var t = l.trim().split(/\s+/), cmd = t[0]; if (!cmd || cmd === 'bye' || cmd === 'exit' || cmd === 'quit') return;
    out += 'sftp> ' + l.trim() + '\n';
    function rp2(p) { return sh.fs.norm(p.charAt(0) === '/' ? p : rcwd + '/' + p); }
    if (cmd === 'pwd') out += 'Remote working directory: ' + rcwd + '\n';
    else if (cmd === 'cd') { var np = rp2(t[1] || '.'); if (sh.fs.isD(conn.root + np)) rcwd = sh.fs.norm(np); else { out += 'Couldn\'t stat remote file: No such file or directory\n'; rc = 1; } }
    else if (cmd === 'ls') { var d = rp2(t[1] || '.'); if (!sh.fs.isD(conn.root + d)) { out += 'Can\'t ls: "' + d + '" not found\n'; rc = 1; } else out += sh.fs.list(conn.root + d).sort().join('\n') + '\n'; }
    else if (cmd === 'mkdir') { var md = rp2(t[1]); if (!rcanWrite(sh, conn, conn.root + md)) { out += 'Couldn\'t create directory: Permission denied\n'; rc = 1; } else sh.fs.mkdirp(conn.root + md, conn.user); }
    else if (cmd === 'put') {
      var lf = sh.abs(t[1] || ''), ln = sh.fs.get(lf);
      if (!ln) { out += 'stat ' + t[1] + ': No such file or directory\n'; rc = 1; return; }
      var tgt = rp2(t[2] || lf.split('/').pop());
      if (!rcanWrite(sh, conn, conn.root + tgt)) { out += 'remote open("' + tgt + '"): Permission denied\n'; rc = 1; return; }
      out += 'Uploading ' + t[1] + ' to ' + tgt + '\n'; copyNode(sh, lf, conn.root + tgt, conn.user, true, null);
      out += pad(t[1], 40) + '100% ' + pad((ln.c || '').length, 5, true) + '   1.0KB/s   00:00\n';
    } else if (cmd === 'get') {
      var rf = rp2(t[1] || ''), rn = sh.fs.get(conn.root + rf);
      if (!rn) { out += 'File "' + rf + '" not found.\n'; rc = 1; return; }
      var loc = sh.abs(t[2] || rf.split('/').pop()); if (!sh.canWrite(loc, c)) { out += 'local open("' + loc + '"): Permission denied\n'; rc = 1; return; }
      out += 'Fetching ' + rf + ' to ' + loc + '\n'; copyNode(sh, conn.root + rf, loc, sh.user, true, null); out += pad(rf, 40) + '100% ' + pad((rn.c || '').length, 5, true) + '   1.0KB/s   00:00\n';
    } else if (cmd === 'rm') { var rr = rp2(t[1] || ''); if (!sh.fs.get(conn.root + rr)) { out += 'Couldn\'t delete file: No such file or directory\n'; rc = 1; } else { sh.fs.rm(conn.root + rr); out += 'Removing ' + rr + '\n'; } }
    else { out += 'Invalid command.\n'; rc = 1; }
  });
  c.out(out); return rc;
};
var prevSsh = cmds.ssh;
cmds.ssh = function (a, c) {
  var sh = c.sh; if (!on(sh)) return prevSsh(a, c);
  var pos = [], i, port = null;
  for (i = 0; i < a.length; i++) { if (a[i] === '-p') port = parseInt(a[++i], 10); else if (a[i] === '-i' || a[i] === '-o' || a[i] === '-L' || a[i] === '-J') i++; else if (a[i].charAt(0) !== '-') pos.push(a[i]); }
  if (!pos.length) return prevSsh(a, c);
  var target = pos[0], m = /^(?:([^@]+)@)?(.+)$/.exec(target), host = m[2], user = m[1] || null;
  var res = resolve(sh, host), rm = (!res.err && (findRemote(sh, host) || findRemote(sh, res.ip))) || (res.err ? findRemote(sh, host) && null : null);
  if (!res.err && !rm) return prevSsh(a, c);
  if (res.err && host !== 'backup') return prevSsh(a, c);
  var conn = connect(sh, c, 'ssh', { user: user, host: host, path: '' }, port); if (!conn) return 255;
  var cmdline = pos.slice(1).join(' ');
  if (!cmdline) { c.out('ssh: đăng nhập tương tác không chạy trong khung này. Chạy lệnh đơn: ssh ' + target + " 'ls -l /backups'\n"); return 1; }
  var argv = cmdline.split(/\s+/), cm = argv[0], args2 = argv.slice(1).map(function (x) { return x.charAt(0) === '/' || x.charAt(0) === '~' || (x.charAt(0) !== '-' && cm !== 'echo' && cm !== 'hostname') ? rmap(conn, x) : x; });
  if (/^(ls|du|find|tree)$/.test(cm) && !args2.filter(function (x) { return x.charAt(0) !== '-'; }).length) args2.push(rmap(conn, '.'));
  if (cm === 'hostname') { c.out('backup-host\n'); return 0; }
  if (cm === 'whoami') { c.out(conn.user + '\n'); return 0; }
  if (cm === 'echo') { c.out(argv.slice(1).join(' ') + '\n'); return 0; }
  if (cm === 'df') { c.out('Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1       197G   41G  147G  22% /\n'); return 0; }
  if (cm === 'mkdir') { var okc = 0; args2.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) { if (!rcanWrite(sh, conn, p)) { c.err('mkdir: cannot create directory ‘' + p.replace(conn.root, '') + '’: Permission denied\n'); okc = 1; } else sh.fs.mkdirp(p, conn.user); }); return okc; }
  if (cm === 'rm') { args2.filter(function (x) { return x.charAt(0) !== '-'; }).forEach(function (p) { if (!sh.fs.get(p)) c.err("rm: cannot remove '" + p.replace(conn.root, '') + "': No such file or directory\n"); else if (rcanWrite(sh, conn, p)) sh.fs.rm(p); else c.err("rm: cannot remove '" + p.replace(conn.root, '') + "': Permission denied\n"); }); return 0; }
  if (/^(ls|cat|du|stat|wc|head|tail|find|tree)$/.test(cm)) {
    var cc = Object.create(c), buf = '', ebuf = ''; cc.out = function (s) { buf += s; }; cc.err = function (s) { ebuf += s; };
    var sv = sh.user; sh.user = conn.user; var rcx;
    try { rcx = cmds[cm](args2, cc); } finally { sh.user = sv; }
    c.out(unmapOut(buf, conn)); if (ebuf) c.err(unmapOut(ebuf, conn)); return rcx || 0;
  }
  c.err('bash: ' + cm + ': command not found\n'); return 127;
};

/* khởi tạo máy backup khi dựng thế giới */
var prevBase = L2.base;
L2.base = function (s, o) {
  prevBase(s, o);
  var f = s.fs, S = s.W.lin2;
  remotes(s); netDefaults(s);
  ['/__r', '/__r/backup', '/__r/backup/home', '/__r/backup/etc', '/__r/backup/var', '/__r/backup/usr'].forEach(function (d) { f.mkdirp(d, 'root', 493); });
  ['/__r/backup/home/backup', '/__r/backup/backups'].forEach(function (d) { f.mkdirp(d, 'backup', 493); });
  f.mkdirp('/__r/backup/tmp', 'root', 1023);
  f.put('/__r/backup/home/backup/readme.txt', 'Máy backup. Thư mục /backups dành cho bản sao lưu.\n', { owner: 'backup', mode: 420 });
  f.mkdirp('/__r/backup/root', 'root', 448);
  if (o && o.setup3) o.setup3(s, S);
  s.cwd = s.home; s.hist.length = 0;
};

/* git: chỉ chạy sau khi đã cài bằng apt (có /usr/bin/git). Mô phỏng các lệnh bài học hay gặp. */
function gitRepoRoot(sh) {
  var p = sh.cwd;
  while (true) {
    if (sh.fs.get((p === '/' ? '' : p) + '/.git')) return p;
    if (p === '/' || p === '') return null;
    p = p.replace(/\/[^\/]*$/, '') || '/';
  }
}
cmds.git = function (a, c) {
  var sh = c.sh;
  if (!sh.fs.get('/usr/bin/git')) throw new CmdErr('bash: git: command not found', 127);
  var sub = a[0];
  if (!sub || sub === '--version' || sub === 'version') { c.out('git version 2.43.0\n'); return 0; }
  if (sub === 'init') {
    var dir = sh.cwd.replace(/\/$/, '') + '/.git';
    sh.fs.mkdirp(dir, sh.user, 493);
    c.out('Initialized empty Git repository in ' + dir + '/\n');
    return 0;
  }
  var root = gitRepoRoot(sh);
  if (!root) throw new CmdErr('fatal: not a git repository (or any of the parent directories): .git', 128);
  if (sub === 'pull') { c.out('Already up to date.\n'); return 0; }
  c.err('git: lệnh "' + sub + '" chưa được mô phỏng trong khung này\n');
  return 1;
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
export {};
