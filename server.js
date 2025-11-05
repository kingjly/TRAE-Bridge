const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const forge = require('node-forge');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.use(morgan('tiny'));

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const PORT = Number(process.env.PORT || 3000);
const HTTPS_ENABLED = String(process.env.HTTPS_ENABLED || 'false').toLowerCase() === 'true';
const SSL_CERT_FILE = process.env.SSL_CERT_FILE || '';
const SSL_KEY_FILE = process.env.SSL_KEY_FILE || '';
const EXPECTED_API_KEY = process.env.EXPECTED_API_KEY || '';
const ACCEPT_ANY_API_KEY = String(process.env.ACCEPT_ANY_API_KEY || 'true').toLowerCase() === 'true';
const STRIP_THINK_TAGS = String(process.env.STRIP_THINK_TAGS || 'false').toLowerCase() === 'true';
const ELEVATOR_PORT = Number(process.env.ELEVATOR_PORT || 55055);

const DATA_DIR = path.join(__dirname, 'data');
const CERTS_DIR = path.join(__dirname, 'certs');
const CA_CERT_FILE = path.join(CERTS_DIR, 'local-ca.pem');
const CA_KEY_FILE = path.join(CERTS_DIR, 'local-ca-key.pem');
const MODELS_FILE = path.join(DATA_DIR, 'models.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MODELS_FILE)) fs.writeFileSync(MODELS_FILE, JSON.stringify({ mappings: [] }, null, 2));
}
ensureDataDir();

function ensureCertsDir() {
  if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });
}
ensureCertsDir();

function readMappings() {
  try {
    const raw = fs.readFileSync(MODELS_FILE, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j.mappings) ? j.mappings : [];
  } catch (e) {
    return [];
  }
}

function writeMappings(mappings) {
  fs.writeFileSync(MODELS_FILE, JSON.stringify({ mappings }, null, 2));
}

function stripThink(content) {
  if (!STRIP_THINK_TAGS || typeof content !== 'string') return content;
  return content.replace(/<think>[\s\S]*?<\/think>/g, '');
}

function authMiddleware(req, res, next) {
  if (ACCEPT_ANY_API_KEY) return next();
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.substring('Bearer '.length) : '';
  if (!EXPECTED_API_KEY || token === EXPECTED_API_KEY) return next();
  return res.status(401).json({ error: { message: 'Unauthorized', type: 'invalid_api_key' } });
}

// Static Web UI
app.use('/assets', express.static(path.join(__dirname, 'scripts')));
// Serve brand and background images
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/', express.static(path.join(__dirname, 'web')));

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Admin: list current mappings
app.get('/bridge/models', (req, res) => {
  res.json({ mappings: readMappings() });
});

// Admin: add/update mapping { id, model, options }
app.post('/bridge/models', (req, res) => {
  const { id, model, options } = req.body || {};
  if (!id || !model) return res.status(400).json({ error: 'id and model are required' });
  const mappings = readMappings();
  const idx = mappings.findIndex(m => m.id === id);
  const payload = { id, model, options: options || {} };
  if (idx >= 0) mappings[idx] = payload; else mappings.push(payload);
  writeMappings(mappings);
  res.json({ ok: true, mapping: payload });
});

// Admin: delete mapping
app.delete('/bridge/models/:id', (req, res) => {
  const id = req.params.id;
  const mappings = readMappings().filter(m => m.id !== id);
  writeMappings(mappings);
  res.json({ ok: true });
});

// Admin: list Ollama models
app.get('/bridge/ollama/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const j = await r.json();
    const list = (j.models || []).map(m => ({ name: m.name, size: m.size, modified_at: m.modified_at }));
    res.json({ models: list });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// OpenAI-compatible: GET /v1/models
app.get('/v1/models', authMiddleware, (req, res) => {
  const mappings = readMappings();
  const data = mappings.map(m => ({ id: m.id, object: 'model', owned_by: 'ollama' }));
  res.json({ object: 'list', data });
});

// Utility: translate OpenAI Chat payload to Ollama payload
function toOllamaChatPayload(body) {
  const { model, messages, temperature, top_p, max_tokens, stop } = body || {};
  const mappings = readMappings();
  const mapping = mappings.find(m => m.id === model);
  const localModel = mapping ? mapping.model : model; // allow direct pass-through if no mapping
  const options = Object.assign({}, mapping?.options || {}, {
    temperature: temperature ?? mapping?.options?.temperature,
    top_p: top_p ?? mapping?.options?.top_p,
    num_predict: typeof max_tokens === 'number' ? max_tokens : (mapping?.options?.num_predict),
    stop: stop ?? mapping?.options?.stop,
  });
  // remove undefineds
  Object.keys(options).forEach(k => options[k] === undefined && delete options[k]);
  return {
    model: localModel,
    messages: (messages || []).map(m => ({ role: m.role, content: m.content })),
    stream: Boolean(body.stream),
    options,
  };
}

// SSE helpers
function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

function writeSSE(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// OpenAI-compatible: POST /v1/chat/completions
app.post('/v1/chat/completions', authMiddleware, async (req, res) => {
  const body = req.body || {};
  const stream = Boolean(body.stream);
  const created = Math.floor(Date.now() / 1000);
  const id = uuidv4().replace(/-/g, '');
  const modelId = body.model || 'unknown';

  const ollamaPayload = toOllamaChatPayload(body);

  if (stream) {
    res.set(sseHeaders());

    // Initial frame with role: assistant and empty content
    writeSSE(res, {
      id,
      object: 'chat.completion.chunk',
      created,
      model: modelId,
      choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
    });

    try {
      const r = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, ollamaPayload, { stream: true })),
      });

      if (!r.body) throw new Error('No stream from Ollama');
      const reader = r.body;
      reader.on('data', (chunk) => {
        const lines = chunk.toString().split(/\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            const deltaText = stripThink(j?.message?.content || '');
            if (deltaText) {
              writeSSE(res, {
                id,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: modelId,
                choices: [{ index: 0, delta: { content: deltaText }, finish_reason: null }],
              });
            }
            if (j?.done) {
              // final empty content frame with finish_reason
              writeSSE(res, {
                id,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: modelId,
                choices: [{ index: 0, delta: { content: '' }, finish_reason: j.done_reason || 'stop' }],
              });
              res.write('data: [DONE]\n\n');
              res.end();
            }
          } catch (e) {
            // ignore parse errors on partial lines
          }
        }
      });
      reader.on('end', () => {
        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      });
      reader.on('error', (err) => {
        if (!res.headersSent) res.status(500);
        res.end();
      });
    } catch (e) {
      if (!res.headersSent) res.status(500);
      res.end();
    }
    return;
  }

  // Non-streaming path
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, ollamaPayload, { stream: false })),
    });
    const j = await r.json();
    const text = stripThink(j?.message?.content || '');
    const finish = j?.done_reason || 'stop';
    const resp = {
      id,
      object: 'chat.completion',
      created,
      model: modelId,
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finish }],
    };
    res.json(resp);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --- Setup helpers ---
function execAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, opts, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

async function isElevatorAvailable(timeoutMs = 800) {
  try {
    const ac = new (global.AbortController || require('abort-controller'))();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch(`http://127.0.0.1:${ELEVATOR_PORT}/health`, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return false;
    const j = await r.json();
    return Boolean(j && j.ok);
  } catch { return false; }
}

async function elevatorApply({ domain, port }) {
  try {
    const r = await fetch(`http://127.0.0.1:${ELEVATOR_PORT}/apply`, {
      method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ domain, port })
    });
    const j = await r.json();
    return j;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function elevatorRevoke({ domain }) {
  try {
    const r = await fetch(`http://127.0.0.1:${ELEVATOR_PORT}/revoke`, {
      method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ domain })
    });
    const j = await r.json();
    return j;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function ensureEnv(updates) {
  const envPath = path.join(__dirname, '.env');
  let content = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8')
    : (fs.existsSync(path.join(__dirname, '.env.example'))
        ? fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8')
        : '');
  const map = {};
  content.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) map[m[1].trim()] = m[2].trim();
  });
  Object.assign(map, updates || {});
  const out = Object.entries(map).map(([k,v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(envPath, out);
}

function readHosts() {
  try {
    return fs.readFileSync('C:/Windows/System32/drivers/etc/hosts', 'utf8');
  } catch (e) {
    return '';
  }
}


// Single elevated script to install CA, write hosts, and enable 443→PORT portproxy (MTGA-like)
async function runElevatedSetup({ domain, connectPort, caCertPath }) {
  const tmp = path.join(os.tmpdir(), `trae_bridge_elevated_${Date.now()}.ps1`);
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `Write-Host '>> 安装 CA 至受信任根...'`,
    `certutil -addstore -f "Root" "${caCertPath}"`,
    `Write-Host '>> 修改 hosts 文件...'`,
    `$hosts='C:\\Windows\\System32\\drivers\\etc\\hosts'`,
    `$line='127.0.0.1 ${domain}'`,
    `$content = Get-Content -Raw $hosts`,
    `if (-not $content.Contains($line)) { Set-Content -Path $hosts -Value ($content.TrimEnd() + [Environment]::NewLine + $line) }`,
    `Write-Host 'hosts 已更新'`,
    `Write-Host '>> 启用 443 → ${connectPort} 端口代理（并确保 iphlpsvc 服务）...'`,
    `Try { Start-Service -Name iphlpsvc -ErrorAction SilentlyContinue } Catch { }`,
    `netsh interface portproxy delete v4tov4 listenport=443 listenaddress=0.0.0.0`,
    `$rc = $LASTEXITCODE`,
    `netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=${connectPort} connectaddress=127.0.0.1`,
    `$rc2 = $LASTEXITCODE`,
    `if ($rc2 -ne 0) { netsh interface portproxy add v4tov4 listenport=443 listenaddress=127.0.0.1 connectport=${connectPort} connectaddress=127.0.0.1 }`,
    `netsh advfirewall firewall add rule name="TRAE-Ollama-Bridge HTTPS" dir=in action=allow protocol=TCP localport=443`,
  ].join('\n');
  fs.writeFileSync(tmp, script, 'utf8');
  const ps = `Start-Process PowerShell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"${tmp}\"'`;
  await execAsync(`powershell -Command ${ps}`);
  const hostsOk = readHosts().includes(`127.0.0.1 ${domain}`);
  let proxyOk = false; let raw = '';
  try {
    const r = await execAsync('netsh interface portproxy show v4tov4');
    raw = r.stdout || '';
    proxyOk = (raw.toLowerCase().includes('listenport: 443'));
  } catch (e) {
    raw = e.stdout || e.stderr || String(e.err || e);
  }
  return { hostsOk, proxyOk, portproxyRaw: raw, tmpScript: tmp };
}

// Elevated script to revoke interception: remove hosts entries and delete 443 portproxy/firewall
async function runElevatedRevoke({ domain }) {
  const tmp = path.join(os.tmpdir(), `trae_bridge_revoke_${Date.now()}.ps1`);
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `Write-Host '>> 清理 hosts 条目...'`,
    `$hosts='C:\\Windows\\System32\\drivers\\etc\\hosts'`,
    `$lines = Get-Content -Path $hosts`,
    `$rx4 = '^\s*127\.0\.0\.1\s+${domain}\s*$'`,
    `$rx6 = '^\s*::1\s+${domain}\s*$'`,
    `$filtered = $lines | Where-Object { ($_ -notmatch $rx4) -and ($_ -notmatch $rx6) }`,
    `Set-Content -Path $hosts -Value ($filtered -join [Environment]::NewLine)`,
    `Write-Host 'hosts 已清理'`,
    `Write-Host '>> 删除 443 端口代理与防火墙规则...'`,
    `Try { netsh interface portproxy delete v4tov4 listenport=443 listenaddress=0.0.0.0 } Catch { }`,
    `Try { netsh interface portproxy delete v4tov4 listenport=443 listenaddress=127.0.0.1 } Catch { }`,
    `Try { netsh advfirewall firewall delete rule name="TRAE-Ollama-Bridge HTTPS" } Catch { }`
  ];
  fs.writeFileSync(tmp, script.join('\n'));
  const result = { steps: [] };
  try {
    const psCmd = `Start-Process PowerShell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${tmp.replace(/\\/g,'/')}"'`;
    await execAsync(`powershell -Command ${psCmd}`);
    result.steps.push({ name: 'uac_triggered', ok: true, detail: '已触发 UAC 撤销脚本，请在系统弹窗中确认' });
  } catch (e) {
    result.steps.push({ name: 'revoke', ok: false, detail: '撤销脚本执行失败', error: e.stderr || e.stdout || String(e.err || e) });
  }
  // 保留临时脚本以避免在未等待的情况下被过早删除
  return result;
}

// One-click HTTPS + hosts setup (CA-based)
app.post('/bridge/setup/https-hosts', async (req, res) => {
  const domain = (req.body && req.body.domain) || 'api.openai.com';
  ensureCertsDir();
  const certPath = path.join(CERTS_DIR, `${domain}.pem`);
  const keyPath = path.join(CERTS_DIR, `${domain}-key.pem`);

  const result = { steps: [] };

  // Step 1: ensure local CA and domain cert
  try {
    let caCertPem, caKeyPem;
    if (fs.existsSync(CA_CERT_FILE) && fs.existsSync(CA_KEY_FILE)) {
      caCertPem = fs.readFileSync(CA_CERT_FILE, 'utf8');
      caKeyPem = fs.readFileSync(CA_KEY_FILE, 'utf8');
      result.steps.push({ name: 'ca_exists', ok: true, detail: '已存在本地 CA' });
    } else {
      const ca = generateLocalCA();
      caCertPem = ca.certPem; caKeyPem = ca.keyPem;
      fs.writeFileSync(CA_CERT_FILE, caCertPem);
      fs.writeFileSync(CA_KEY_FILE, caKeyPem);
      result.steps.push({ name: 'ca_generate', ok: true, detail: '已生成本地 CA' });
    }
    const d = generateDomainCert(caCertPem, caKeyPem, domain);
    fs.writeFileSync(certPath, d.certPem);
    fs.writeFileSync(keyPath, d.keyPem);
    result.steps.push({ name: 'cert_issue', ok: true, detail: `已签发 ${domain} 证书` });
  } catch (e) {
    return res.status(500).json({ error: '证书签发失败', detail: String(e) });
  }

  // Step 2: update .env
  try {
    ensureEnv({ HTTPS_ENABLED: 'true', SSL_CERT_FILE: path.relative(__dirname, certPath).replace(/\\/g,'/'), SSL_KEY_FILE: path.relative(__dirname, keyPath).replace(/\\/g,'/'), PORT: String(PORT) });
    result.steps.push({ name: 'env', ok: true, detail: '.env 已更新为启用 HTTPS' });
  } catch (e) {
    result.steps.push({ name: 'env', ok: false, detail: '更新 .env 失败', error: String(e) });
  }

  // Step 3~5: Elevate once to install CA, write hosts(v4/v6), and enable 443→PORT（优先：转发器；回退：portproxy）
  try {
    if (await isElevatorAvailable()) {
      const ej = await elevatorApply({ domain, port: PORT });
      (ej.steps || []).forEach(s => result.steps.push(s));
      result.steps.push({ name: 'elevator', ok: true, detail: '已通过零交互服务执行' });
    } else {
      const elev = await runElevatedSetup({ domain, connectPort: PORT, caCertPath: CA_CERT_FILE });
      result.steps.push({ name: 'ca_install', ok: true, detail: '已尝试安装 CA 到受信任根（UAC 一次确认）' });
      result.steps.push({ name: 'hosts', ok: elev.hostsOk, detail: elev.hostsOk ? 'hosts 映射已写入' : 'hosts 写入失败（需要管理员）' });
      result.steps.push({ name: 'forwarder', ok: false, detail: '服务不可用，已跳过转发器' });
      result.steps.push({ name: 'portproxy', ok: elev.proxyOk, detail: elev.proxyOk ? `已创建 443 → ${PORT} 端口代理并开放防火墙` : '端口代理创建失败', raw: elev.portproxyRaw });
      result.steps.push({ name: 'elevator', ok: false, detail: '未检测到零交互服务，已回退到 UAC 提权脚本' });
    }
  } catch (e) {
    result.steps.push({ name: 'elevation', ok: false, detail: '提权流程失败', error: e.stderr || e.stdout || String(e.err || e) });
  }

  res.json(Object.assign({ certPath, keyPath, port: PORT }, result));
});

// Install and start the elevator service (requires admin once)
app.post('/bridge/setup/install-elevated-service', async (req, res) => {
  try {
    const psCmd = `Start-Process PowerShell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command "node \"${path.join(__dirname, 'scripts', 'install-elevated-service.js').replace(/\\/g,'/')}\""'`;
    await execAsync(`powershell -Command ${psCmd}`);
    const ok = await isElevatorAvailable(2000);
    res.json({ ok, detail: ok ? '服务安装并启动成功' : '服务安装后不可用' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.stderr || e.stdout || String(e.err || e) });
  }
});

// Uninstall the elevator service and cleanup artifacts
app.post('/bridge/setup/uninstall-elevated-service', async (req, res) => {
  try {
    const psCmd = `Start-Process PowerShell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command "node \"${path.join(__dirname, 'scripts', 'uninstall-elevated-service.js').replace(/\\/g,'/')}\""'`;
    await execAsync(`powershell -Command ${psCmd}`);
    const ok = await isElevatorAvailable(1000);
    res.json({ ok: !ok, detail: !ok ? '服务已卸载并清理' : '服务仍在运行或未成功卸载' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.stderr || e.stdout || String(e.err || e) });
  }
});

app.get('/bridge/setup/elevated-service-status', async (req, res) => {
  const ok = await isElevatorAvailable();
  res.json({ ok, port: ELEVATOR_PORT });
});

// Setup status
app.get('/bridge/setup/status', (req, res) => {
  const domain = (req.query && req.query.domain) || 'api.openai.com';
  const status = {
    https_enabled: HTTPS_ENABLED,
    cert_exists: fs.existsSync(path.join(CERTS_DIR, `${domain}.pem`)),
    key_exists: fs.existsSync(path.join(CERTS_DIR, `${domain}-key.pem`)),
    hosts_contains: readHosts().includes(`127.0.0.1 ${domain}`),
  };
  res.json(status);
});

// Revoke interception policy: stop forwarder/portproxy and remove hosts entries
app.post('/bridge/setup/revoke', async (req, res) => {
  const domain = (req.body && req.body.domain) || 'api.openai.com';
  const result = { steps: [] };
  try {
    if (await isElevatorAvailable()) {
      const ej = await elevatorRevoke({ domain });
      (ej.steps || []).forEach(s => result.steps.push(s));
      result.steps.push({ name: 'elevator', ok: true, detail: '已通过零交互服务撤销' });
      return res.json(Object.assign({ ok: true }, result));
    } else {
      const rv = await runElevatedRevoke({ domain });
      (rv.steps || []).forEach(s => result.steps.push(s));
      result.steps.push({ name: 'elevator', ok: false, detail: '未检测到零交互服务，已回退到 UAC 提权脚本' });
      return res.json(Object.assign({ ok: true }, result));
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.stderr || e.stdout || String(e.err || e) });
  }
});

// --- One-click mkcert installation ---
// mkcert endpoints removed; using CA-based generation only.

// --- Local CA generation and domain cert signing (Windows-friendly) ---
function generateLocalCA() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 60000);
  cert.validity.notAfter = new Date(now.getTime());
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 3);
  const attrs = [
    { name: 'commonName', value: 'TRAE Bridge Local CA' },
    { name: 'organizationName', value: 'TRAE-Ollama-Bridge' },
    { name: 'countryName', value: 'CN' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', authorityCertIssuer: true, serialNumber: '01' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

function generateDomainCert(caCertPem, caKeyPem, domain) {
  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Math.floor(Date.now() / 1000));
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 60000);
  cert.validity.notAfter = new Date(now.getTime());
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);
  cert.setSubject([{ name: 'commonName', value: domain }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: domain }] },
  ]);
  cert.sign(caKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}



// Basic 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

function start() {
  if (HTTPS_ENABLED && fs.existsSync(SSL_CERT_FILE) && fs.existsSync(SSL_KEY_FILE)) {
    const opts = {
      cert: fs.readFileSync(SSL_CERT_FILE),
      key: fs.readFileSync(SSL_KEY_FILE),
    };
    const server = https.createServer(opts, app);
    // Listen on configured PORT; rely on portproxy to expose 443
    server.listen(PORT, () => {
      console.log('TRAE-Ollama-Bridge HTTPS listening on https://localhost:' + PORT + '/ (443->' + PORT + ' via portproxy if enabled)');
    });
  } else {
    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`TRAE-Ollama-Bridge HTTP listening on http://localhost:${PORT}/`);
    });
  }
}

start();
