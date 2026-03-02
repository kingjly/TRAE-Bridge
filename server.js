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
const { exec, spawn } = require('child_process');
const forge = require('node-forge');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.use(morgan('tiny'));

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const UPSTREAM_TYPE = process.env.UPSTREAM_TYPE || '';
const UPSTREAM_BASE_URL = process.env.UPSTREAM_BASE_URL || '';
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || '';
const UPSTREAM_CHAT_PATH = process.env.UPSTREAM_CHAT_PATH || '';
const UPSTREAM_MODELS_PATH = process.env.UPSTREAM_MODELS_PATH || '';
const FORWARD_CLIENT_API_KEY = String(process.env.FORWARD_CLIENT_API_KEY || 'true').toLowerCase() === 'true';
const PORT = Number(process.env.PORT || 30000);
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
const UPSTREAM_FILE = path.join(DATA_DIR, 'upstream.json');

function normalizeUpstreamType(type) {
  const t = String(type || '').trim().toLowerCase();
  return (t === 'openai' || t === 'openai_compatible') ? 'openai' : 'ollama';
}

function normalizePathValue(input, fallbackValue) {
  const raw = String(input || fallbackValue || '').trim();
  if (!raw) return String(fallbackValue || '');
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function defaultUpstreamConfig() {
  const type = normalizeUpstreamType(UPSTREAM_TYPE || 'ollama');
  const defaultBase = type === 'openai' ? 'https://api.openai.com' : OLLAMA_BASE_URL;
  return {
    type,
    base_url: String(UPSTREAM_BASE_URL || defaultBase).trim().replace(/\/+$/, ''),
    api_key: String(UPSTREAM_API_KEY || ''),
    chat_path: normalizePathValue(UPSTREAM_CHAT_PATH, type === 'openai' ? '/v1/chat/completions' : '/api/chat'),
    models_path: normalizePathValue(UPSTREAM_MODELS_PATH, type === 'openai' ? '/v1/models' : '/api/tags'),
  };
}

function sanitizeUpstreamConfig(input, baseConfig) {
  const base = Object.assign({}, baseConfig || defaultUpstreamConfig());
  const type = normalizeUpstreamType(input?.type ?? base.type);
  const defaultBase = type === 'openai' ? 'https://api.openai.com' : OLLAMA_BASE_URL;
  const cfg = {
    type,
    base_url: String(input?.base_url ?? base.base_url ?? defaultBase).trim().replace(/\/+$/, ''),
    api_key: String(input?.api_key ?? base.api_key ?? ''),
    chat_path: normalizePathValue(input?.chat_path ?? base.chat_path, type === 'openai' ? '/v1/chat/completions' : '/api/chat'),
    models_path: normalizePathValue(input?.models_path ?? base.models_path, type === 'openai' ? '/v1/models' : '/api/tags'),
  };
  if (type === 'openai') cfg.models_path = '/v1/models';
  if (!cfg.base_url) cfg.base_url = defaultBase;
  return cfg;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MODELS_FILE)) fs.writeFileSync(MODELS_FILE, JSON.stringify({ mappings: [] }, null, 2));
  if (!fs.existsSync(UPSTREAM_FILE)) {
    fs.writeFileSync(UPSTREAM_FILE, JSON.stringify({ config: defaultUpstreamConfig() }, null, 2));
  }
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

function readUpstreamConfig() {
  const fallback = defaultUpstreamConfig();
  try {
    const raw = fs.readFileSync(UPSTREAM_FILE, 'utf8');
    const j = JSON.parse(raw);
    return sanitizeUpstreamConfig(j?.config || {}, fallback);
  } catch (e) {
    return fallback;
  }
}

function writeUpstreamConfig(config) {
  const safe = sanitizeUpstreamConfig(config, defaultUpstreamConfig());
  const persisted = Object.assign({}, safe);
  if (persisted.type === 'openai') {
    // For OpenAI-compatible upstreams, models endpoint is fixed at runtime.
    // Keep persisted config minimal to avoid confusing users with hidden fields.
    delete persisted.models_path;
  }
  fs.writeFileSync(UPSTREAM_FILE, JSON.stringify({ config: persisted }, null, 2));
  return safe;
}

function resolveModelAlias(requestedModelId) {
  const mappings = readMappings();
  const mapping = mappings.find(m => m.id === requestedModelId);
  return {
    mapping,
    upstreamModel: mapping ? mapping.model : requestedModelId,
  };
}

function buildUpstreamUrl(baseUrl, endpointPath) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const p = normalizePathValue(endpointPath, '/');
  if (!base) throw new Error('Upstream base_url is required');
  if (/\/v1$/i.test(base) && /^\/v1\//i.test(p)) {
    return base + p.replace(/^\/v1/i, '');
  }
  return base + p;
}

function buildUpstreamHeaders(req, upstream, includeContentType = true) {
  const headers = {};
  if (includeContentType) headers['Content-Type'] = 'application/json';
  if (upstream.api_key) {
    headers['Authorization'] = `Bearer ${upstream.api_key}`;
  } else if (FORWARD_CLIENT_API_KEY && typeof req.headers.authorization === 'string' && req.headers.authorization.trim()) {
    headers['Authorization'] = req.headers.authorization.trim();
  }
  return headers;
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

async function parseResponsePayload(response) {
  const text = await response.text();
  if (!text) return { text: '', json: null };
  try {
    return { text, json: JSON.parse(text) };
  } catch (e) {
    return { text, json: null };
  }
}

async function fetchUpstreamModelList(req, upstream) {
  const upstreamUrl = buildUpstreamUrl(upstream.base_url, upstream.models_path);
  const r = await fetch(upstreamUrl, {
    method: 'GET',
    headers: buildUpstreamHeaders(req, upstream, false),
  });
  const { text, json } = await parseResponsePayload(r);
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: json || text || `Upstream request failed (${r.status})`,
    };
  }

  if (upstream.type === 'openai') {
    const data = Array.isArray(json?.data) ? json.data : [];
    const models = data
      .map(m => ({
        id: String(m?.id || m?.name || '').trim(),
        name: String(m?.id || m?.name || '').trim(),
        owned_by: m?.owned_by || 'openai',
      }))
      .filter(m => m.id);
    return { ok: true, status: r.status, raw: json, models };
  }

  const models = Array.isArray(json?.models)
    ? json.models.map(m => ({ id: m.name, name: m.name, size: m.size, modified_at: m.modified_at, owned_by: 'ollama' }))
    : [];
  return { ok: true, status: r.status, raw: json, models };
}

// Admin: read/write active upstream settings
app.get('/bridge/upstream', (req, res) => {
  res.json({ config: readUpstreamConfig() });
});

app.post('/bridge/upstream', (req, res) => {
  try {
    const current = readUpstreamConfig();
    const next = writeUpstreamConfig({
      type: req.body?.type ?? current.type,
      base_url: req.body?.base_url ?? current.base_url,
      api_key: req.body?.api_key ?? current.api_key,
      chat_path: req.body?.chat_path ?? current.chat_path,
      models_path: req.body?.models_path ?? current.models_path,
    });
    res.json({ ok: true, config: next });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

// Admin: list upstream models (works for Ollama and OpenAI-compatible services)
app.get('/bridge/upstream/models', async (req, res) => {
  try {
    const upstream = readUpstreamConfig();
    const result = await fetchUpstreamModelList(req, upstream);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ upstream: upstream.type, models: result.models });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Backward compatibility for existing UI path
app.get('/bridge/ollama/models', async (req, res) => {
  try {
    const upstream = readUpstreamConfig();
    const result = await fetchUpstreamModelList(req, upstream);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ upstream: upstream.type, models: result.models });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// OpenAI-compatible: GET /v1/models
app.get('/v1/models', authMiddleware, async (req, res) => {
  const upstream = readUpstreamConfig();
  const mappings = readMappings();
  if (mappings.length > 0) {
    const data = mappings.map(m => ({ id: m.id, object: 'model', owned_by: upstream.type }));
    return res.json({ object: 'list', data });
  }

  try {
    const result = await fetchUpstreamModelList(req, upstream);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const data = (result.models || []).map(m => ({ id: m.id || m.name, object: 'model', owned_by: m.owned_by || upstream.type }));
    return res.json({ object: 'list', data });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Utility: translate OpenAI Chat payload to Ollama payload
function toOllamaChatPayload(body, mappingResult) {
  const { messages, temperature, top_p, max_tokens, stop } = body || {};
  const mapping = mappingResult?.mapping;
  const localModel = mappingResult?.upstreamModel || body?.model;
  const options = Object.assign({}, mapping?.options || {}, {
    temperature: temperature ?? mapping?.options?.temperature,
    top_p: top_p ?? mapping?.options?.top_p,
    num_predict: typeof max_tokens === 'number' ? max_tokens : (mapping?.options?.num_predict),
    stop: stop ?? mapping?.options?.stop,
  });
  Object.keys(options).forEach(k => options[k] === undefined && delete options[k]);
  return {
    model: localModel,
    messages: (messages || []).map(m => ({ role: m.role, content: m.content })),
    stream: Boolean(body.stream),
    options,
  };
}

async function proxyOpenAICompatibleChat(req, res, upstream, body, modelAlias) {
  const targetBody = Object.assign({}, body, { model: modelAlias.upstreamModel || body.model });
  const stream = Boolean(body.stream);
  const upstreamUrl = buildUpstreamUrl(upstream.base_url, upstream.chat_path);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: 'POST',
    headers: buildUpstreamHeaders(req, upstream, true),
    body: JSON.stringify(targetBody),
  });

  if (stream) {
    if (!upstreamResponse.ok) {
      const { text, json } = await parseResponsePayload(upstreamResponse);
      return res.status(upstreamResponse.status).json(json || { error: text || 'Upstream stream request failed' });
    }

    res.status(upstreamResponse.status);
    res.set({
      'Content-Type': upstreamResponse.headers.get('content-type') || 'text/event-stream',
      'Cache-Control': upstreamResponse.headers.get('cache-control') || 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (!upstreamResponse.body) return res.end();
    upstreamResponse.body.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    upstreamResponse.body.pipe(res);
    return;
  }

  const { text, json } = await parseResponsePayload(upstreamResponse);
  if (!upstreamResponse.ok) {
    return res.status(upstreamResponse.status).json(json || { error: text || 'Upstream request failed' });
  }

  if (json && typeof json === 'object') {
    if (typeof body.model === 'string' && typeof json.model === 'string') {
      json.model = body.model;
    }
    return res.status(upstreamResponse.status).json(json);
  }
  return res.status(upstreamResponse.status).send(text);
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
  const upstream = readUpstreamConfig();
  const modelAlias = resolveModelAlias(modelId);

  // For OpenAI-compatible third-party providers, proxy request/response directly.
  if (upstream.type === 'openai') {
    try {
      return await proxyOpenAICompatibleChat(req, res, upstream, body, modelAlias);
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  const ollamaPayload = toOllamaChatPayload(body, modelAlias);

  if (stream) {
    try {
      const r = await fetch(buildUpstreamUrl(upstream.base_url, upstream.chat_path), {
        method: 'POST',
        headers: buildUpstreamHeaders(req, upstream, true),
        body: JSON.stringify(Object.assign({}, ollamaPayload, { stream: true })),
      });
      if (!r.ok) {
        const { text, json } = await parseResponsePayload(r);
        return res.status(r.status).json(json || { error: text || 'Upstream request failed' });
      }
      if (!r.body) throw new Error('No stream from upstream');

      res.set(sseHeaders());
      writeSSE(res, {
        id,
        object: 'chat.completion.chunk',
        created,
        model: modelId,
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      });

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
      reader.on('error', () => {
        if (!res.writableEnded) res.end();
      });
    } catch (e) {
      if (!res.headersSent) res.status(500);
      res.end();
    }
    return;
  }

  // Non-streaming path for Ollama-compatible upstream
  try {
    const r = await fetch(buildUpstreamUrl(upstream.base_url, upstream.chat_path), {
      method: 'POST',
      headers: buildUpstreamHeaders(req, upstream, true),
      body: JSON.stringify(Object.assign({}, ollamaPayload, { stream: false })),
    });
    const { text, json } = await parseResponsePayload(r);
    if (!r.ok) {
      return res.status(r.status).json(json || { error: text || 'Upstream request failed' });
    }
    const j = json || {};
    const resp = {
      id,
      object: 'chat.completion',
      created,
      model: modelId,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: stripThink(j?.message?.content || '') },
        finish_reason: j?.done_reason || 'stop',
      }],
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

async function getElevatorHealth(timeoutMs = 800) {
  try {
    const ac = new (global.AbortController || require('abort-controller'))();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch(`http://127.0.0.1:${ELEVATOR_PORT}/health`, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, error: `http_${r.status}` };
    const j = await r.json();
    return { ok: Boolean(j && j.ok), payload: j };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function isElevatorAvailable(timeoutMs = 800) {
  const s = await getElevatorHealth(timeoutMs);
  return s.ok;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForElevatorReady(totalMs = 25000, intervalMs = 1000) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt <= totalMs) {
    const s = await getElevatorHealth(Math.min(intervalMs, 1200));
    if (s.ok) return { ok: true, payload: s.payload };
    lastError = s.error || lastError;
    await sleep(intervalMs);
  }
  return { ok: false, error: lastError || 'timeout' };
}

async function waitForElevatorStop(totalMs = 15000, intervalMs = 800) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= totalMs) {
    const ok = await isElevatorAvailable(Math.min(intervalMs, 1200));
    if (!ok) return true;
    await sleep(intervalMs);
  }
  return false;
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

function restartBridgeProcess() {
  try {
    const args = process.argv.slice(1);
    const nextEnv = Object.assign({}, process.env);
    // Let dotenv in the new process re-read current .env values.
    delete nextEnv.HTTPS_ENABLED;
    delete nextEnv.SSL_CERT_FILE;
    delete nextEnv.SSL_KEY_FILE;
    delete nextEnv.PORT;

    const child = spawn(process.execPath, args, {
      cwd: __dirname,
      env: nextEnv,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    setTimeout(() => {
      process.exit(0);
    }, 400);
  } catch (e) {
    console.error('Auto-restart failed:', e);
  }
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

  const runtimeHttps = HTTPS_ENABLED && fs.existsSync(SSL_CERT_FILE) && fs.existsSync(SSL_KEY_FILE);
  const restartRequired = !runtimeHttps;
  const autoRestart = String(req.body?.auto_restart ?? 'true').toLowerCase() !== 'false';
  const autoRestartTriggered = restartRequired && autoRestart;
  if (restartRequired) {
    result.steps.push({
      name: 'restart_required',
      ok: false,
      detail: '已写入 HTTPS 配置，但当前进程仍是 HTTP，请重启主桥接服务后再进行透明拦截测试',
    });
    if (autoRestartTriggered) {
      result.steps.push({
        name: 'auto_restart',
        ok: true,
        detail: '已触发主桥接服务自动重启，约 5-10 秒后请刷新页面重试',
      });
    }
  }

  res.json(Object.assign({ certPath, keyPath, port: PORT, runtime_https: runtimeHttps, restart_required: restartRequired, auto_restart_triggered: autoRestartTriggered }, result));

  if (autoRestartTriggered) {
    setTimeout(() => {
      restartBridgeProcess();
    }, 200);
  }
});

// Install and start the elevator service (requires admin once)
app.post('/bridge/setup/install-elevated-service', async (req, res) => {
  try {
    const installerScript = path.join(__dirname, 'scripts', 'install-elevated-service.js').replace(/\\/g, '/');
    const nodeExe = process.execPath.replace(/\\/g, '/');
    const psCmd = `$arg = '"${installerScript}"'; $p = Start-Process -FilePath '${nodeExe}' -Verb RunAs -Wait -PassThru -ArgumentList $arg; exit $p.ExitCode`;
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
    const ready = await waitForElevatorReady(25000, 1000);
    if (ready.ok) return res.json({ ok: true, detail: '服务安装并启动成功' });

    let serviceQuery = '';
    let taskQuery = '';
    try {
      const q = await execAsync('sc.exe query TRAEBridgeElevator');
      serviceQuery = (q.stdout || q.stderr || '').trim();
    } catch (e) {
      serviceQuery = (e.stdout || e.stderr || String(e.err || e)).trim();
    }
    try {
      const tq = await execAsync('schtasks /Query /TN TRAEBridgeElevator /V /FO LIST');
      taskQuery = (tq.stdout || tq.stderr || '').trim();
    } catch (e) {
      taskQuery = (e.stdout || e.stderr || String(e.err || e)).trim();
    }
    res.json({ ok: false, detail: '服务安装后不可用', diagnostics: { service: serviceQuery, task: taskQuery, health_error: ready.error || '' } });
  } catch (e) {
    // If install script exits non-zero but helper becomes healthy, treat as idempotent success.
    const installError = e.stderr || e.stdout || String(e.err || e);
    const ready = await waitForElevatorReady(12000, 600);
    if (ready.ok) {
      return res.json({
        ok: true,
        detail: '服务已在运行（提权命令返回非零，已按可用状态处理）',
        diagnostics: { install_error: installError }
      });
    }

    let healthAfterError = false;
    try {
      healthAfterError = await isElevatorAvailable(1500);
    } catch {}
    if (healthAfterError) {
      return res.json({
        ok: true,
        detail: '服务已在运行（检测到健康状态，忽略提权命令错误）',
        diagnostics: { install_error: installError }
      });
    }

    res.status(500).json({ ok: false, detail: '服务安装失败', error: installError });
  }
});

// Uninstall the elevator service and cleanup artifacts
app.post('/bridge/setup/uninstall-elevated-service', async (req, res) => {
  try {
    const uninstallScript = path.join(__dirname, 'scripts', 'uninstall-elevated-service.js').replace(/\\/g,'/');
    const nodeExe = process.execPath.replace(/\\/g, '/');
    const psCmd = `$arg = '"${uninstallScript}"'; $p = Start-Process -FilePath '${nodeExe}' -Verb RunAs -Wait -PassThru -ArgumentList $arg; exit $p.ExitCode`;
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
    const stopped = await waitForElevatorStop(15000, 800);
    res.json({ ok: stopped, detail: stopped ? '服务已卸载并清理' : '服务仍在运行或未成功卸载' });
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
