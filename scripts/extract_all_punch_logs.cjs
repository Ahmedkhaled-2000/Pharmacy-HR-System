const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const cmd = `sudo docker logs hr-backend-server 2>&1 | grep -E 'Attendance WhatsApp|punch:recorded|PUNCH_|Smart Direction|Biometric Resolver' | tail -n 120`;
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "${cmd}"`).toString().trim();
console.log(out);
