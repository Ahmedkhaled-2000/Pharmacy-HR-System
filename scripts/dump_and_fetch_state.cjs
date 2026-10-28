const { execSync } = require('child_process');
const fs = require('fs');

const remoteScript = `
const fs = require('fs');
const Redis = require('ioredis');
const r = new Redis({ host: process.env.REDIS_HOST || 'redis', port: 6379 });
r.get('hr:settings:pharmacy-tracker-data').then(d => {
  fs.writeFileSync('/tmp/hr_state.json', d, 'utf8');
  console.log('Successfully wrote /tmp/hr_state.json, bytes:', d.length);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  console.log(execSync(cmd).toString());

  // Copy from container to host /tmp
  execSync('ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker cp hr-backend-server:/tmp/hr_state.json /tmp/hr_state.json && sudo chmod 644 /tmp/hr_state.json"');

  // scp from remote to local
  execSync('scp -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20:/tmp/hr_state.json ./scratch_live_state.json');

  const stats = fs.statSync('./scratch_live_state.json');
  console.log('✅ Downloaded scratch_live_state.json successfully, size:', (stats.size / 1024).toFixed(1), 'KB');
} catch (e) {
  console.error('Error:', e.message);
}
