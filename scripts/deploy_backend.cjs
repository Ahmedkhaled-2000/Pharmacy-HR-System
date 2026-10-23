const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'ubuntu@63.183.147.199';

console.log('1. Uploading server/hr-backend.js to VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/hr-backend.js ${host}:/home/ubuntu/hr-system/server/hr-backend.js`);
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/hr-backend.js ${host}:/home/ubuntu/hr-backend.js`);

console.log('2. Copying into hr-backend-server docker container...');
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /home/ubuntu/hr-system/server/hr-backend.js hr-backend-server:/app/server/hr-backend.js"`);

console.log('3. Restarting hr-backend-server container...');
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker restart hr-backend-server"`);

console.log('4. Waiting 4 seconds for backend to initialize...');
execSync('powershell -Command "Start-Sleep -Seconds 4"');

console.log('5. Checking backend container status and health...');
const status = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker ps --filter name=hr-backend-server --format '{{.Status}}'"`).toString().trim();
console.log('Container Status:', status);

console.log('BACKEND DEPLOYMENT COMPLETE!');
