const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const targets = [
  { name: 'Old Live VPS', host: 'ubuntu@63.183.147.199' },
  { name: 'New VPS', host: 'admin@169.58.214.20' }
];

targets.forEach(t => {
  try {
    const health = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${t.host} curl -s http://127.0.0.1:5000/api/health`, { stdio: 'pipe' }).toString().trim();
    const asset = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${t.host} grep -o "assets/index-[^\\\"]*" /var/www/pharmacy_frontend/index.html`, { stdio: 'pipe' }).toString().trim().split('\n')[0];
    console.log(`✅ [${t.name}] Health: ${health} | Frontend Asset: ${asset}`);
  } catch (e) {
    console.error(`❌ [${t.name}] Error:`, e.message);
  }
});
