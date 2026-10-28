const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'ubuntu@63.183.147.199';

const remoteCode = `
import http from 'http';
import fs from 'fs';

http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    fs.writeFileSync('/tmp/live_state.json', raw);
    console.log('Saved live state to /tmp/live_state.json');
  });
});
`;

fs.writeFileSync('temp_fetch.js', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_fetch.js ${host}:/tmp/temp_fetch.js`);
  execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_fetch.js hr-backend-server:/app/temp_fetch.js; sudo docker exec hr-backend-server node /app/temp_fetch.js; sudo docker cp hr-backend-server:/tmp/live_state.json /tmp/live_state.json"`);
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no ${host}:/tmp/live_state.json ./live_state.json`);
  console.log('Downloaded live_state.json locally!');
} finally {
  try { fs.unlinkSync('temp_fetch.js'); } catch {}
}
