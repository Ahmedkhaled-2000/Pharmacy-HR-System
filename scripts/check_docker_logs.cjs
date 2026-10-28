const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const cmd = `sudo docker logs --tail 3000 hr-backend-server 2>&1 | grep -iE 'kiosk|punch|activeShift|112|102|115|103|109|156|1148|1156' | tail -n 60`;
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "${cmd}"`).toString().trim();
console.log(out);
