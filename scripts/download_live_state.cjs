const { execSync } = require('child_process');
const fs = require('fs');

const remoteCode = `
const Redis = require('ioredis');
const fs = require('fs');
const r = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });
r.get('hr:settings:pharmacy-tracker-data').then(d => {
  fs.writeFileSync('/tmp/live_state.json', d);
  console.log('DUMP_SUCCESS');
  process.exit(0);
});
`;

const b64 = Buffer.from(remoteCode).toString('base64');
const cmd1 = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\" && sudo docker cp hr-backend-server:/tmp/live_state.json /tmp/live_state.json && sudo chmod 644 /tmp/live_state.json"`;

console.log('Dumping live state inside VPS...');
execSync(cmd1, { stdio: 'inherit' });

console.log('Downloading via scp...');
execSync(`scp -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20:/tmp/live_state.json scratch_live_state.json`, { stdio: 'inherit' });

const stats = fs.statSync('scratch_live_state.json');
console.log('Saved scratch_live_state.json successfully, size:', (stats.size / 1024).toFixed(1), 'KB');
