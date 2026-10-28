const { execSync } = require('child_process');

console.log('Dumping state to file on VPS...');
const remoteScript = `
const Redis = require('ioredis');
const fs = require('fs');
const r = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });
r.get('hr:settings:pharmacy-tracker-data').then(data => {
  fs.writeFileSync('/tmp/full_state.json', data);
  console.log('State written to /tmp/full_state.json in container. Size:', data.length);
  process.exit(0);
});
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\" && sudo docker cp hr-backend-server:/tmp/full_state.json /home/admin/full_state.json"`;
execSync(cmd, { stdio: 'inherit' });

console.log('Downloading via SCP...');
execSync(`scp -i vps-p-spark-1803.pem admin@169.58.214.20:/home/admin/full_state.json ./scratch_live_vps_state.json`, { stdio: 'inherit' });
console.log('Done!');
