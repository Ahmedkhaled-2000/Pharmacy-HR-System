const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const cmd = `sudo docker logs --tail 10000 hr-backend-server 2>&1 | grep -C 2 -i 'Kiosk Outbox Sync' | tail -n 80`;
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "${cmd}"`).toString().trim();
console.log(out);
