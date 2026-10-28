const { execSync } = require('child_process');
const sshKey = 'vps-p-spark-1803.pem';

console.log('--- 1. Check Old VPS hr-backend-server container status ---');
try {
  console.log(execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "sudo docker ps"`, { encoding: 'utf8' }));
} catch(e) { console.error(e.message); }

console.log('--- 2. Check Old VPS biometric-manager syntax inside container ---');
try {
  console.log(execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "sudo docker exec hr-backend-server node -c /app/server/biometric-manager.js"`, { encoding: 'utf8' }));
  console.log('Syntax OK inside container on Old VPS');
} catch(e) { console.error('Syntax error on Old VPS:', e.message); }

console.log('--- 3. Check New VPS hr-backend-server container status ---');
try {
  console.log(execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker ps"`, { encoding: 'utf8' }));
} catch(e) { console.error(e.message); }

console.log('--- 4. Check New VPS biometric-manager syntax inside container ---');
try {
  console.log(execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -c /app/server/biometric-manager.js"`, { encoding: 'utf8' }));
  console.log('Syntax OK inside container on New VPS');
} catch(e) { console.error('Syntax error on New VPS:', e.message); }
