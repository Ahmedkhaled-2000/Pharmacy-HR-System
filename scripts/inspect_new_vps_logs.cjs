const { execSync } = require('child_process');
const sshKey = 'vps-p-spark-1803.pem';

try {
  const logs = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker logs hr-backend-server --tail 150"`, { encoding: 'utf8' });
  console.log('=== LOGS ON NEW VPS ===');
  console.log(logs);
} catch(e) {
  console.error(e.message);
}
