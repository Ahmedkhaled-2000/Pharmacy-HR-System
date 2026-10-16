const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'ubuntu@63.183.147.199';

console.log('1. Packaging web app assets into frontend_update.tar.gz...');
execSync('tar --exclude="*.wasm" -czf frontend_update.tar.gz -C dist index.html assets sw.js registerSW.js manifest.webmanifest');

console.log('2. Uploading frontend_update.tar.gz to VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no frontend_update.tar.gz ${host}:/tmp/frontend_update.tar.gz`);

console.log('3. Extracting to /var/www/pharmacy_frontend on VPS...');
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo tar -xzf /tmp/frontend_update.tar.gz -C /var/www/pharmacy_frontend/ && sudo chown -R www-data:www-data /var/www/pharmacy_frontend/ && sudo chmod -R 755 /var/www/pharmacy_frontend/ && sudo systemctl reload nginx"`);

console.log('4. Verifying live deployment...');
const liveIndex = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /var/www/pharmacy_frontend/index.html | grep -o 'assets/index-[^\\\"]*'"`).toString().trim();
console.log('Live index bundle:', liveIndex);

if (fs.existsSync('frontend_update.tar.gz')) {
  fs.unlinkSync('frontend_update.tar.gz');
}

console.log('FRONTEND DEPLOYMENT COMPLETE!');
