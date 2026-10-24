const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';
const userHome = '/home/admin';
const appDir = '/home/admin/hr-system';

console.log('1. Uploading backend files to VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/hr-backend.js ${host}:${userHome}/hr-backend.js`);
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/biometric-manager.js ${host}:${userHome}/biometric-manager.js`);
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/outstock-manager.js ${host}:${userHome}/outstock-manager.js`);

console.log('2. Copying into hr-backend-server docker container and restarting...');
const cmds = [
  `cp ${userHome}/hr-backend.js ${appDir}/server/hr-backend.js 2>/dev/null || true`,
  `cp ${userHome}/biometric-manager.js ${appDir}/server/biometric-manager.js 2>/dev/null || true`,
  `cp ${userHome}/outstock-manager.js ${appDir}/server/outstock-manager.js 2>/dev/null || true`,
  `sudo docker cp ${userHome}/hr-backend.js hr-backend-server:/app/server/hr-backend.js`,
  `sudo docker cp ${userHome}/hr-backend.js hr-backend-server:/app/hr-backend.js`,
  `sudo docker cp ${userHome}/biometric-manager.js hr-backend-server:/app/server/biometric-manager.js`,
  `sudo docker cp ${userHome}/biometric-manager.js hr-backend-server:/app/biometric-manager.js`,
  `sudo docker cp ${userHome}/outstock-manager.js hr-backend-server:/app/server/outstock-manager.js`,
  `sudo docker cp ${userHome}/outstock-manager.js hr-backend-server:/app/outstock-manager.js`,
  'sudo docker restart hr-backend-server'
].join(' && ');
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "${cmds}"`);

console.log('3. Checking backend health...');
const status = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker ps --filter name=hr-backend-server --format '{{.Status}}'"`).toString().trim();
console.log('Container Status:', status);

console.log('BACKEND DEPLOYMENT COMPLETE!');
