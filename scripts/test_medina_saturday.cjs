const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const empId = 'emp_1789231413527';
  const medinaBranchId = 'branch_1789241578010';
  const komiBranchId = 'branch_1789142992139';

  const medinaRoster = (state.rosters || []).find(r => (r.employeeId === empId || r.employeeCode === '107') && r.branchId === medinaBranchId && r.month === '2026-10');
  console.log('Medina Roster Saturday:');
  console.log(JSON.stringify(medinaRoster.schedule['السبت'], null, 2));

  console.log('Medina Roster fromDate:', medinaRoster.fromDate, 'toDate:', medinaRoster.toDate);

  // Check how getResolvedEmployeeRoster handles this:
  // Let's import or simulate getResolvedEmployeeRoster
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
