const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SERVICE_NAME = 'TRAEBridgeElevator';
const TASK_NAME = SERVICE_NAME;
const programData = process.env.ProgramData || 'C:/ProgramData';
const targetDir = path.join(programData, SERVICE_NAME);

function run(command, allowFail = false) {
  try {
    const out = execSync(command, { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output: String(out || '').trim() };
  } catch (e) {
    if (allowFail) {
      return {
        ok: false,
        output: String(e.stdout || e.stderr || e.message || '').trim(),
      };
    }
    throw e;
  }
}

function serviceExists() {
  return run(`sc.exe query ${SERVICE_NAME}`, true).ok;
}

function taskExists() {
  return run(`schtasks /Query /TN ${TASK_NAME}`, true).ok;
}

if (serviceExists()) {
  run(`sc.exe stop ${SERVICE_NAME}`, true);
  const del = run(`sc.exe delete ${SERVICE_NAME}`, true);
  if (!del.ok) throw new Error(`delete failed: ${del.output}`);
  console.log('Service deleted');
} else {
  console.log('Service not installed');
}

if (taskExists()) {
  run(`schtasks /End /TN ${TASK_NAME}`, true);
  const delTask = run(`schtasks /Delete /TN ${TASK_NAME} /F`, true);
  if (!delTask.ok) throw new Error(`delete task failed: ${delTask.output}`);
  console.log('Task deleted');
} else {
  console.log('Task not installed');
}

// Best-effort cleanup of any process still listening on helper port.
run('powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 55055 -State Listen -ErrorAction SilentlyContinue; if ($conn) { $conn | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"', true);

try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch {}