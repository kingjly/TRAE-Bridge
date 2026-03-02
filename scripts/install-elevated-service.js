const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SERVICE_NAME = 'TRAEBridgeElevator';
const SERVICE_DESC = 'Privileged helper to install CA, write hosts, and enable 443->PORT portproxy';
const TASK_NAME = SERVICE_NAME;
const programData = process.env.ProgramData || 'C:/ProgramData';
const targetDir = path.join(programData, SERVICE_NAME);
const sourceScriptPath = path.join(__dirname, '..', 'elevated-service.js');
const bootstrapPath = path.join(targetDir, 'elevated-service.bootstrap.js');
const installLogFile = path.join(targetDir, 'install.log');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.appendFileSync(installLogFile, line, 'utf8');
  } catch {}
}

function run(args, allowFail = false) {
  const cmdLine = `sc.exe ${args.join(' ')}`;
  log(`RUN: ${cmdLine}`);
  try {
    const r = spawnSync('sc.exe', args, { encoding: 'utf8' });
    const output = String((r.stdout || '') + (r.stderr || '')).trim();
    if (r.status !== 0) {
      if (output) log(`ERR: ${output}`);
      if (allowFail) return { ok: false, output };
      throw new Error(output || `sc.exe exit ${r.status}`);
    }
    if (output) log(`OUT: ${output}`);
    return { ok: true, output };
  } catch (e) {
    const output = String(e.message || '').trim();
    if (output) log(`ERR: ${output}`);
    if (allowFail) {
      return {
        ok: false,
        output,
      };
    }
    throw e;
  }
}

function serviceExists() {
  return run(['query', SERVICE_NAME], true).ok;
}

function runTask(args, allowFail = false) {
  const cmdLine = `schtasks ${args.join(' ')}`;
  log(`RUN: ${cmdLine}`);
  const r = spawnSync('schtasks', args, { encoding: 'utf8' });
  const output = String((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0) {
    if (output) log(`ERR: ${output}`);
    if (allowFail) return { ok: false, output };
    throw new Error(output || `schtasks exit ${r.status}`);
  }
  if (output) log(`OUT: ${output}`);
  return { ok: true, output };
}

function writeBootstrap() {
  try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
  const content = [
    "'use strict';",
    `require(${JSON.stringify(sourceScriptPath)});`,
    '',
  ].join('\n');
  fs.writeFileSync(bootstrapPath, content, 'utf8');
}

function ensureInstalled() {
  log(`node exe: ${process.execPath}`);
  log(`bootstrap: ${bootstrapPath}`);

  // Cleanup any previous failed SCM service attempt.
  if (serviceExists()) {
    log('service exists, recreate to refresh binPath');
    run(['stop', SERVICE_NAME], true);
    const deleted = run(['delete', SERVICE_NAME], true);
    if (!deleted.ok) {
      throw new Error(`delete failed: ${deleted.output}`);
    }
  }

  // Create startup task as a robust elevated host for the helper process.
  const taskCmd = `\"${process.execPath}\" \"${bootstrapPath}\"`;
  runTask(['/Delete', '/TN', TASK_NAME, '/F'], true);
  runTask(['/Create', '/TN', TASK_NAME, '/TR', taskCmd, '/SC', 'ONSTART', '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F']);
  console.log('Task installed');
}

function ensureStarted() {
  // Start immediately; if already running, schtasks may return a warning message.
  runTask(['/Run', '/TN', TASK_NAME], true);
  console.log('Task started');
}

writeBootstrap();
try {
  log('install start');
  ensureInstalled();
  ensureStarted();
  log('install success');
} catch (e) {
  log(`FATAL: ${String(e && e.stack ? e.stack : e)}`);
  throw e;
}