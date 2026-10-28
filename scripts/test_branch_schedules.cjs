const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const empId = 'emp_1789231413527';
  const emp = (state.employees || []).find(e => e.id === empId);
  const selectedMonth = '2026-10';

  console.log('Employee branches:', emp.branchesDetails.map(b => b.branchId));

  // Let's test for each branch:
  for (const bd of emp.branchesDetails) {
    const bId = bd.branchId;
    console.log('\\n------------------------------------');
    console.log('Testing branch:', bId);

    // Let's find rosters matching this branch
    const matchingRosters = (state.rosters || []).filter(r => (r.employeeId === empId || r.employeeCode === '107') && r.branchId === bId && r.month === selectedMonth);
    console.log('Matching rosters count:', matchingRosters.length);
    if (matchingRosters.length > 0) {
      const r = matchingRosters[0];
      console.log('Roster ID:', r.id, 'status:', r.status);
      const sch = r.schedule || {};
      const sampleDays = Object.entries(sch).slice(0, 3);
      console.log('Schedule sample days:', sampleDays.map(([k, v]) => ({
        day: k,
        type: v.type,
        isOff: v.isOff,
        start: v.start,
        end: v.end,
        hours: v.hours,
        shifts: v.shifts,
        otherBranchShifts: v.otherBranchShifts
      })));
    }
  }

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
