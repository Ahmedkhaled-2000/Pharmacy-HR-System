const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);
  
  (state.employees || []).filter(e => e.name && (e.name.includes('خضر') || e.name.includes('محمود') || e.name.includes('بلال'))).forEach(e => {
    console.log(e.id, e.code, e.name, e.branchId);
  });

  console.log('=== ALL ACTIVE SHIFTS IN REDIS ===');
  console.log(state.activeShifts);

  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
