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

  // Let's test the EXACT logic of getEmployeeBaseDaySchedule in src/utils/rosterEngine.js:
  // When targetBranchId = medinaBranchId:
  const emp = (state.employees || []).find(e => e.id === empId);

  // Let's trace getResolvedEmployeeRoster(empId, medinaBranchId, '2026-10', state)
  // Which candidate is chosen?
  const rosters = state.rosters || [];
  
  // Let's see all candidates and their scores:
  const targetBIdStr = medinaBranchId;
  const targetBObj = (state.branches || []).find(b => String(b.id) === targetBIdStr);
  const isMultiBranch = true;
  const normSelectedMonth = '2026-10';

  console.log('Testing roster resolution for date 2026-10-15:');
  const matchingRosters = rosters.filter(r => (r.employeeId === empId || r.employeeCode === '107') && r.status === 'approved');
  console.log('Approved rosters for 107 count:', matchingRosters.length);
  matchingRosters.forEach(r => {
    console.log('Roster ID:', r.id, 'branchId:', r.branchId, 'month:', r.month);
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
