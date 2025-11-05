const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const net = require('net');
const fetch = require('node-fetch');
require('dotenv').config();

// This service is intended to be installed as a Windows Service (LocalSystem).
// It listens only on 127.0.0.1 and performs privileged operations without UAC prompts.

const app = express();
app.use(express.json({ limit: '1mb' }));

const CERTS_DIR = path.join(__dirname, 'certs');
const CA_CERT_FILE = path.join(CERTS_DIR, 'local-ca.pem');
const HOSTS_PATH = 'C:/Windows/System32/drivers/etc/hosts';
const LISTEN_PORT = Number(process.env.ELEVATOR_PORT || 55055);
const BRIDGE_PORT = Number(process.env.PORT || 3001);
let forwarderServer = null;

function execAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, opts, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

function readHosts() {
  try { return fs.readFileSync(HOSTS_PATH, 'utf8'); } catch (e) { return ''; }
}

function ensureLineInHosts(line) {
  const cur = readHosts();
  if (cur.includes(line)) return { ok: true, existed: true };
  try {
    // Remove read-only attribute if present
    try { execSyncSafe(`attrib -R "${HOSTS_PATH}"`); } catch {}
    fs.writeFileSync(HOSTS_PATH, (cur.trimEnd() + `\n${line}\n`));
    return { ok: true, existed: false };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function execSyncSafe(cmd) {
  return execAsync(cmd).catch(() => ({}));
}

async function installCA(caPath) {
  const cmd = `certutil -addstore -f "Root" "${caPath}"`;
  await execAsync(cmd);
  return { ok: true };
}

async function enablePortProxy(connectPort) {
  // Ensure iphlpsvc is running
  await execSyncSafe('powershell -Command "Try { Start-Service -Name iphlpsvc -ErrorAction SilentlyContinue } Catch { }"');
  const delCmd = `netsh interface portproxy delete v4tov4 listenport=443 listenaddress=0.0.0.0`;
  const addAllCmd = `netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=${connectPort} connectaddress=127.0.0.1`;
  const addLoopCmd = `netsh interface portproxy add v4tov4 listenport=443 listenaddress=127.0.0.1 connectport=${connectPort} connectaddress=127.0.0.1`;
  const fwCmd = `netsh advfirewall firewall add rule name=\"TRAE-Ollama-Bridge HTTPS\" dir=in action=allow protocol=TCP localport=443`;
  await execSyncSafe(delCmd);
  try {
    await execAsync(addAllCmd);
  } catch (e) {
    // Fallback: only bind to loopback if 0.0.0.0 fails
    await execAsync(addLoopCmd);
  }
  await execSyncSafe(fwCmd);
  let raw = '';
  try {
    const r = await execAsync('netsh interface portproxy show v4tov4');
    raw = r.stdout || '';
  } catch {}
  const ok = raw.toLowerCase().includes('listenport: 443');
  return { ok, raw };
}

function startForwarder(connectPort) {
  return new Promise((resolve) => {
    if (forwarderServer) return resolve({ ok: true, detail: 'forwarder 已在运行' });
    const server = net.createServer((clientSocket) => {
      const targetSocket = net.createConnection({ host: '127.0.0.1', port: connectPort });
      clientSocket.pipe(targetSocket);
      targetSocket.pipe(clientSocket);
      clientSocket.on('error', () => {});
      targetSocket.on('error', () => {});
    });
    server.on('error', (err) => {
      resolve({ ok: false, error: String(err) });
    });
    // 优先监听回环地址，结合 hosts 映射保证稳定性
    server.listen(443, '127.0.0.1', () => {
      forwarderServer = server;
      resolve({ ok: true, detail: 'forwarder 已监听 127.0.0.1:443' });
    });
  });
}

function forwarderStatus() {
  return Boolean(forwarderServer);
}

function stopForwarder() {
  return new Promise((resolve) => {
    if (!forwarderServer) return resolve({ ok: true, detail: 'forwarder 未运行' });
    try {
      const srv = forwarderServer;
      forwarderServer = null;
      srv.close(() => resolve({ ok: true, detail: 'forwarder 已停止' }));
    } catch (e) {
      resolve({ ok: false, detail: 'forwarder 停止失败', error: String(e) });
    }
  });
}

function removeHostsEntries(domain) {
  const cur = readHosts();
  const lines = cur.split(/\r?\n/);
  const rx4 = new RegExp('^\\s*127\\.0\\.0\\.1\\s+' + domain.replace(/\./g, '\\.') + '\\s*$', 'i');
  const rx6 = new RegExp('^\\s*::1\\s+' + domain.replace(/\./g, '\\.') + '\\s*$', 'i');
  const filtered = lines.filter(l => !rx4.test(l) && !rx6.test(l));
  try {
    // Remove read-only attribute if present
    try { execSyncSafe(`attrib -R "${HOSTS_PATH}"`); } catch {}
    fs.writeFileSync(HOSTS_PATH, filtered.join('\n'));
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function disablePortProxyAndFirewall() {
  await execSyncSafe('netsh interface portproxy delete v4tov4 listenport=443 listenaddress=0.0.0.0');
  await execSyncSafe('netsh interface portproxy delete v4tov4 listenport=443 listenaddress=127.0.0.1');
  await execSyncSafe('netsh advfirewall firewall delete rule name="TRAE-Ollama-Bridge HTTPS"');
  let raw = '';
  try { const r = await execAsync('netsh interface portproxy show v4tov4'); raw = r.stdout || ''; } catch {}
  const ok = !raw.toLowerCase().includes('listenport: 443');
  return { ok, raw };
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'TRAE-Ollama-Bridge-Elevator', port: LISTEN_PORT, forwarder: forwarderStatus(), bridge_port: BRIDGE_PORT });
});

app.post('/apply', async (req, res) => {
  const domain = (req.body && req.body.domain) || 'api.openai.com';
  const connectPort = Number((req.body && req.body.port) || BRIDGE_PORT);
  const result = { steps: [] };
  try {
    // Install CA
    if (fs.existsSync(CA_CERT_FILE)) {
      try {
        await installCA(CA_CERT_FILE);
        result.steps.push({ name: 'ca_install', ok: true, detail: 'CA 已安装到受信任根' });
      } catch (e) {
        result.steps.push({ name: 'ca_install', ok: false, detail: 'CA 安装失败', error: e.stderr || e.stdout || String(e.err || e) });
      }
    } else {
      result.steps.push({ name: 'ca_install', ok: false, detail: '未找到 CA 证书，请先生成', error: CA_CERT_FILE });
    }

    // Write hosts
    const line4 = `127.0.0.1 ${domain}`;
    const h4 = ensureLineInHosts(line4);
    result.steps.push({ name: 'hosts_v4', ok: h4.ok, detail: h4.ok ? 'hosts(v4) 已更新' : 'hosts(v4) 写入失败', error: h4.error });
    const line6 = `::1 ${domain}`;
    const h6 = ensureLineInHosts(line6);
    result.steps.push({ name: 'hosts_v6', ok: h6.ok, detail: h6.ok ? 'hosts(v6) 已更新' : 'hosts(v6) 写入失败', error: h6.error });

    // Prefer stable TCP forwarder (127.0.0.1:443 → 127.0.0.1:connectPort), fallback to portproxy
    const f = await startForwarder(connectPort);
    result.steps.push({ name: 'forwarder', ok: f.ok, detail: f.detail || (f.ok ? `已创建 443 → ${connectPort} 转发器` : '转发器创建失败'), error: f.error });
    if (!f.ok) {
      try {
        const p = await enablePortProxy(connectPort);
        result.steps.push({ name: 'portproxy', ok: p.ok, detail: p.ok ? `已创建 443 → ${connectPort} 端口代理并开放防火墙` : '端口代理创建失败', raw: p.raw });
      } catch (e) {
        result.steps.push({ name: 'portproxy', ok: false, detail: '端口代理创建失败', error: e.stderr || e.stdout || String(e.err || e) });
      }
    } else {
      result.steps.push({ name: 'portproxy', ok: true, detail: '已由转发器接管，无需 portproxy（可选回退）' });
    }
  } catch (e) {
    result.error = e.stderr || e.stdout || String(e.err || e);
  }
  res.json(Object.assign({ ok: true }, result));
});

app.post('/revoke', async (req, res) => {
  const domain = (req.body && req.body.domain) || 'api.openai.com';
  const result = { steps: [] };
  try {
    const sf = await stopForwarder();
    result.steps.push({ name: 'forwarder_stop', ok: sf.ok, detail: sf.detail, error: sf.error });
    const pr = await disablePortProxyAndFirewall();
    result.steps.push({ name: 'portproxy_remove', ok: pr.ok, detail: pr.ok ? '已删除 443 端口代理并清理防火墙' : '未完全删除或不存在', raw: pr.raw });
    const rh = removeHostsEntries(domain);
    result.steps.push({ name: 'hosts_remove', ok: rh.ok, detail: rh.ok ? 'hosts 条目已清理' : 'hosts 清理失败', error: rh.error });
  } catch (e) {
    result.error = e.stderr || e.stdout || String(e.err || e);
  }
  res.json(Object.assign({ ok: true }, result));
});

app.get('/forwarder/status', (req, res) => {
  res.json({ ok: true, running: forwarderStatus(), port: 443, target_port: BRIDGE_PORT });
});

app.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[Elevator] Listening on http://127.0.0.1:${LISTEN_PORT}/`);
});