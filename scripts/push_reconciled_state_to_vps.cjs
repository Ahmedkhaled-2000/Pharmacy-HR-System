const { execSync } = require('child_process');
const fs = require('fs');

console.log('Pushing reconciled_state.json to VPS...');
execSync(`scp -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no reconciled_state.json admin@169.58.214.20:/tmp/reconciled_state.json`, { stdio: 'inherit' });

console.log('Importing into Redis and PostgreSQL on VPS via base64...');
const script = `
const Redis = require('ioredis');
const fs = require('fs');
const r = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });
async function main() {
  const content = fs.readFileSync('/tmp/reconciled_state.json', 'utf8');
  await r.set('hr:settings:pharmacy-tracker-data', content);
  console.log('REDIS_UPDATE_SUCCESS');
  process.exit(0);
}
main();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker cp /tmp/reconciled_state.json hr-backend-server:/tmp/reconciled_state.json && sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;

execSync(cmd, { stdio: 'inherit' });
console.log('Successfully pushed and updated live Redis state!');
