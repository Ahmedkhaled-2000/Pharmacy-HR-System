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
  const emp = (state.employees || []).find(e => e.id === empId || e.code === '107');

  // Let's import rosterEngine if possible, or simulate its exact code
  // Let's see what is in state.rosters for emp 107
  const rosters107 = (state.rosters || []).filter(r => r.employeeId === empId || r.employeeCode === '107');
  console.log('Rosters 107 in state.rosters:');
  rosters107.forEach(r => {
    console.log({
      id: r.id,
      branchId: r.branchId,
      month: r.month,
      isUnifiedMaster: r.isUnifiedMaster,
      isMultiBranch: r.isMultiBranch,
      status: r.status,
      keysCount: Object.keys(r.schedule || {}).length,
      firstDayKey: Object.keys(r.schedule || {})[0],
      firstDayVal: (r.schedule || {})[Object.keys(r.schedule || {})[0]]
    });
  });

  // Check what getCandidateScore does for each roster when targetBranchId = medinaBranchId
  rosters107.forEach(r => {
    const itemBStr = String(r.branchId || '').trim();
    const isTargetMatch = itemBStr.toLowerCase() === medinaBranchId.toLowerCase();
    console.log('Roster:', r.id, 'itemBStr:', itemBStr, 'isTargetMatch:', isTargetMatch);
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
  console.error(e.message);
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
}
