const fs = require('fs');
const path = require('path');
const { Service } = require('node-windows');

const programData = process.env.ProgramData || 'C:/ProgramData';
const targetDir = path.join(programData, 'TRAEBridgeElevator');
try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
try { process.chdir(targetDir); } catch {}

const scriptPath = path.join(__dirname, '..', 'elevated-service.js');
const svc = new Service({
  name: 'TRAEBridgeElevator',
  description: 'Privileged helper to install CA, write hosts, and enable 443->PORT portproxy',
  script: scriptPath,
  workingDirectory: targetDir,
});

svc.on('uninstall', () => {
  console.log('Service uninstalled');
  try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch {}
});

svc.on('error', (e) => console.error('Service error:', e));

svc.uninstall();