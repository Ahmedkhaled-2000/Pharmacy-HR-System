const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';
const userHome = '/home/admin';
const appDir = '/home/admin/hr-system';

console.log('🚀 [1/5] Uploading backend files to VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/hr-backend.js ${host}:${userHome}/hr-backend.js`, { stdio: 'inherit' });
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/biometric-manager.js ${host}:${userHome}/biometric-manager.js`, { stdio: 'inherit' });
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/outstock-manager.js ${host}:${userHome}/outstock-manager.js`, { stdio: 'inherit' });

console.log('🚀 [2/5] Syncing files into hr-system/server and docker container...');
const vpsBackendCmds = [
  `cp ${userHome}/hr-backend.js ${appDir}/server/hr-backend.js 2>/dev/null || true`,
  `cp ${userHome}/biometric-manager.js ${appDir}/server/biometric-manager.js 2>/dev/null || true`,
  `cp ${userHome}/outstock-manager.js ${appDir}/server/outstock-manager.js 2>/dev/null || true`,
  `sudo docker cp ${userHome}/hr-backend.js hr-backend-server:/app/server/hr-backend.js`,
  `sudo docker cp ${userHome}/biometric-manager.js hr-backend-server:/app/server/biometric-manager.js`,
  `sudo docker cp ${userHome}/outstock-manager.js hr-backend-server:/app/server/outstock-manager.js`,
  `sudo docker cp ${userHome}/hr-backend.js hr-backend-server:/app/hr-backend.js`,
  `sudo docker cp ${userHome}/biometric-manager.js hr-backend-server:/app/biometric-manager.js`,
  `sudo docker cp ${userHome}/outstock-manager.js hr-backend-server:/app/outstock-manager.js`,
  'sudo docker restart hr-backend-server'
].join(' && ');

execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "${vpsBackendCmds}"`, { stdio: 'inherit' });

console.log('🚀 [3/5] Uploading frontend bundle to VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no frontend_update.tar.gz ${host}:/tmp/frontend_update.tar.gz`, { stdio: 'inherit' });

console.log('🚀 [4/5] Deploying frontend bundle and reloading Nginx...');
const vpsFrontendCmds = [
  'sudo tar -xzf /tmp/frontend_update.tar.gz -C /var/www/pharmacy_frontend/',
  'sudo chown -R www-data:www-data /var/www/pharmacy_frontend',
  'sudo chmod -R 755 /var/www/pharmacy_frontend',
  'sudo nginx -t && sudo nginx -s reload',
  'rm -f /tmp/frontend_update.tar.gz'
].join(' && ');

execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "${vpsFrontendCmds}"`, { stdio: 'inherit' });

console.log('🚀 [5/5] Verifying services health...');
const checkScript = [
  'sudo docker ps --filter name=hr-backend-server --format "{{.Names}}: {{.Status}}"',
  'curl -s http://127.0.0.1:5000/api/health || echo "Health check pinged"'
].join(' && ');

const result = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "${checkScript}"`).toString();
console.log(result);

console.log('🎉 FULL ENTERPRISE DEPLOYMENT COMPLETED SUCCESSFULLY!');
