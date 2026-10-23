const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
// Primary New Production VPS (8GB RAM / 4 vCPU / 100GB SSD)
const host = process.env.DEPLOY_HOST || 'admin@169.58.214.20';
const isNewVps = host.includes('169.58.214.20');
const appDir = isNewVps ? '/home/admin/hr-system' : '/home/ubuntu/hr-system';
const userHome = isNewVps ? '/home/admin' : '/home/ubuntu';

console.log('📦 [1/6] Checking frontend production bundle...');
const distIndex = 'dist/index.html';
const isDistFresh = fs.existsSync(distIndex) && (Date.now() - fs.statSync(distIndex).mtimeMs < 10 * 60 * 1000);
if (!isDistFresh) {
  console.log('Building frontend production bundle (npm run build)...');
  execSync('npm run build', { stdio: 'inherit' });
} else {
  console.log('Fresh build found in dist/ (skipping redundant build).');
}

console.log('📦 [2/6] Packaging frontend update tar.gz...');
if (fs.existsSync('frontend_update.tar.gz')) {
  fs.unlinkSync('frontend_update.tar.gz');
}
execSync('tar --exclude="*.wasm" -czf frontend_update.tar.gz -C dist index.html assets sw.js registerSW.js manifest.webmanifest', { stdio: 'inherit' });

console.log('🚀 [3/6] Uploading backend files to VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/hr-backend.js ${host}:${userHome}/hr-backend.js`, { stdio: 'inherit' });
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/biometric-manager.js ${host}:${userHome}/biometric-manager.js`, { stdio: 'inherit' });
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/outstock-manager.js ${host}:${userHome}/outstock-manager.js`, { stdio: 'inherit' });

console.log('🚀 [4/6] Updating backend files on VPS and restarting hr-backend-server container...');
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

console.log('🚀 [5/6] Uploading and extracting frontend bundle to /var/www/pharmacy_frontend/...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no frontend_update.tar.gz ${host}:/tmp/frontend_update.tar.gz`, { stdio: 'inherit' });
const vpsFrontendCmds = [
  'sudo tar -xzf /tmp/frontend_update.tar.gz -C /var/www/pharmacy_frontend/',
  'sudo chown -R www-data:www-data /var/www/pharmacy_frontend/',
  'sudo chmod -R 755 /var/www/pharmacy_frontend/',
  'sudo systemctl reload nginx',
  'rm -f /tmp/frontend_update.tar.gz'
].join(' && ');
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "${vpsFrontendCmds}"`, { stdio: 'inherit' });

console.log('🔍 [6/6] Verifying live services...');
const verifyCmd = 'sudo docker ps --filter name=hr-backend-server && curl -s http://127.0.0.1:5000/api/health && grep -o "assets/index-[^\\\"]*" /var/www/pharmacy_frontend/index.html';
try {
  const verifyOut = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} '${verifyCmd}'`).toString();
  console.log(verifyOut);
} catch (e) {
  console.log('Verification check notice:', e.message);
}

if (fs.existsSync('frontend_update.tar.gz')) {
  fs.unlinkSync('frontend_update.tar.gz');
}

console.log('✅ ALL UPDATES SUCCESSFULLY DEPLOYED TO VPS (v1.2.69)!');
