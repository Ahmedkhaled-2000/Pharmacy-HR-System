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

  // Let's test what getEmployeeDaySchedule returns for date 2026-10-15 (Thursday) with targetBranchId = medinaBranchId
  // We can write a script simulating getResolvedEmployeeRoster and getEmployeeBaseDaySchedule
  
  // 1. In state.rosters, find approved roster for Medina
  const medinaRoster = (state.rosters || []).find(r => (r.employeeId === empId || r.employeeCode === '107') && r.branchId === medinaBranchId && r.month === '2026-10');
  console.log('Medina Roster found:', !!medinaRoster);
  if (medinaRoster) {
    console.log('Keys count in medinaRoster.schedule:', Object.keys(medinaRoster.schedule || {}).length);
    console.log('Thursday (الخميس) in medinaRoster:', medinaRoster.schedule['الخميس']);
    console.log('Saturday (السبت) in medinaRoster:', medinaRoster.schedule['السبت']);
    console.log('2026-10-15 in medinaRoster:', medinaRoster.schedule['2026-10-15']);
  }

  // 2. Now let's trace:
  // When targetBranchId = medinaBranchId:
  // getEmployeeBaseDaySchedule calls:
  // const roster = findEmployeeRoster(empId, dateStr, state, targetBranchId);
  // findEmployeeRoster calls:
  // getResolvedEmployeeRoster(empId, targetBranchId, cycleMonth, state);
  
  // What are the candidates in getResolvedEmployeeRoster for empId and targetBranchId = medinaBranchId?
  // Let's compute candidates and scores:
  const targetBIdStr = medinaBranchId;
  const candidates = [];
  (state.rosters || []).forEach(r => {
    const itemEmpId = String(r.employeeId || '').trim();
    const itemEmpCode = String(r.employeeCode || '').trim();
    if (itemEmpId !== empId && itemEmpCode !== '107') return;
    if (r.status !== 'approved') return;

    let bMatches = false;
    const itemBStr = String(r.branchId || '').trim();
    if (itemBStr.toLowerCase() === targetBIdStr.toLowerCase()) bMatches = true;

    let score = 0;
    if (r.month === '2026-10') score = 100;
    if (bMatches) score += 200;
    if (!targetBIdStr && r.isUnifiedMaster) score += 250;

    candidates.push({ id: r.id, branchId: r.branchId, score, bMatches });
  });

  console.log('Candidates for targetBranchId = medinaBranchId:');
  console.log(candidates);

  // If medinaRoster wins, what does getResolvedEmployeeRoster do?
  // Look at lines 1576-1636 of rosterEngine:
  // if (isMultiBranch && targetBIdStr && resolvedSchedule)
  // Object.entries(resolvedSchedule).forEach(([key, dayItem]) => {
  //   const allShifts = getDayShiftsList(dayItem);
  //   ...
  //   const branchShifts = allShifts.filter(s => s.branchId === targetBIdStr);
  //   if (branchShifts.length > 0) { ... }
  //   else {
  //     customizedSchedule[key] = { type: 'off', isOff: true, isOtherBranchShift: true ... }
  //   }
  // });

  // Let's test this EXACT loop on medinaRoster.schedule:
  const dayItem = medinaRoster.schedule['السبت'];
  console.log('\\n--- Testing Saturday on Medina Roster ---');
  console.log('dayItem:', dayItem);
  console.log('dayItem.shifts:', dayItem.shifts);
  console.log('dayItem.otherBranchShifts:', dayItem.otherBranchShifts);

  // In getDayShiftsList(dayItem):
  // if (Array.isArray(item.shifts) && item.shifts.length > 0) return item.shifts.filter(...)
  // In dayItem.shifts:
  // item.shifts[0].branchId is 'branch_1789241578010'
  // So branchShifts has length 1.
  
  // BUT WHAT ABOUT '2026-10-15'?
  console.log('\\n--- What is in medinaRoster.schedule for 2026-10-15? ---');
  console.log('medinaRoster.schedule[\"2026-10-15\"]:', medinaRoster.schedule['2026-10-15']);
  
  // What are all the keys in medinaRoster.schedule?
  console.log('\\nAll keys in medinaRoster.schedule:');
  console.log(Object.keys(medinaRoster.schedule || {}));

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
