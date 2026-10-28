const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const empId = 'emp_1789231413527';

  const found = (state.rosters || []).filter(r => r.employeeId === empId || r.employeeCode === '107');
  console.log('Count of rosters for 107:', found.length);
  found.forEach((r, idx) => {
    console.log('=== ROSTER ' + idx + ' ===');
    console.log('ID:', r.id);
    console.log('Branch ID:', r.branchId);
    console.log('Branch Name:', r.branchName);
    console.log('Month:', r.month);
    console.log('Status:', r.status);
    console.log('IsMultiBranch:', r.isMultiBranch);
    console.log('Schedule keys (days count):', Object.keys(r.schedule || {}).length);
    const daysSample = Object.entries(r.schedule || {}).slice(0, 5);
    console.log('Days sample:', JSON.stringify(daysSample, null, 2));
  });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
