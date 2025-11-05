const fs = require('fs');
const path = require('path');
const { Service } = require('node-windows');

// Place service wrapper and logs outside the repository to avoid polluting the project
const programData = process.env.ProgramData || 'C:/ProgramData';
const targetDir = path.join(programData, 'TRAEBridgeElevator');
try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
try { process.chdir(targetDir); } catch {}

const scriptPath = path.join(__dirname, '..', 'elevated-service.js');

const svc = new Service({
  name: 'TRAEBridgeElevator',
  description: 'Privileged helper to install CA, write hosts, and enable 443->PORT portproxy',
  script: scriptPath,
  env: [{ name: 'ELEVATOR_PORT', value: '55055' }],
  workingDirectory: targetDir,
});

svc.on('install', () => {
  console.log('Service installed');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service already installed, restarting...');
  try { svc.stop(); } catch {}
});

svc.on('stop', () => {
  console.log('Service stopped, starting...');
  svc.start();
});

svc.on('start', () => console.log('Service started'));
svc.on('error', (e) => console.error('Service error:', e));

svc.install();