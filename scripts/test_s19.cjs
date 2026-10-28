const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const empId = 'emp_1789231413527';
  const shifts107 = (state.shifts || []).filter(s => s.employeeId === empId || s.employeeCode === '107');
  const s19 = shifts107.find(s => s.date === '2026-10-19');
  console.log('Shift for 2026-10-19:', s19);

  // Check if there is an approved permission or request for 2026-10-19
  const reqs19 = (state.requests || []).filter(r => (r.employeeId === empId || r.employeeCode === '107') && (r.date === '2026-10-19' || r.startDate <= '2026-10-19' && r.endDate >= '2026-10-19'));
  console.log('Requests for 2026-10-19:', reqs19);

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
