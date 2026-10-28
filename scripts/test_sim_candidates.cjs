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

  // Let's import rosterEngine from frontend dist or simulate buildMonthCalendar
  // Let's see what getResolvedEmployeeRoster returns for:
  // 1. targetBranchId = null (Unified)
  // 2. targetBranchId = medinaBranchId
  // 3. targetBranchId = komiBranchId

  // Let's trace getResolvedEmployeeRoster when targetBranchId = null:
  const rosters = state.rosters || [];
  const candidatesNull = [];
  rosters.forEach(r => {
    if (r.employeeId !== empId && r.employeeCode !== '107') return;
    if (r.status !== 'approved') return;
    let score = 0;
    if (r.month === '2026-10') score = 100;
    if (r.isUnifiedMaster || r.id.includes('unified') || (r.isMultiBranch && !r.id.includes('_b_'))) {
      score += 250;
    }
    candidatesNull.push({ id: r.id, branchId: r.branchId, isUnifiedMaster: r.isUnifiedMaster, score });
  });
  console.log('Candidates for targetBranchId = null:');
  console.log(candidatesNull);

  // Notice:
  // roster_emp_1789231413527_2026-10_b_branch_1789142992139 has isUnifiedMaster: true!
  // So it scored 350 and WON!
  // And its branchId is 'branch_1789142992139' (Komi).
  // Now in getResolvedEmployeeRoster:
  // Since targetBIdStr is null, it does NOT customize schedule.
  // It returns Komi's roster!
  // In Komi's roster:
  // start is '18:00', end is '00:00'!
  // Medina's shift (11:00 - 17:00) is ONLY in otherBranchShifts!
  // It is NOT in 'start' and 'end' of the day!
  // AND what about the employee's portal when viewing Medina branch?
  
  // Let's check what happened when Employee viewed Medina branch in the employee portal:
  // In EmployeePortalView.jsx:
  // When an employee switches branches using the top bar:
  // selectedBranchId changes to medinaBranchId.
  // BUT does activeViewBranchId in EmployeeRosterModule change?
  // NO! activeViewBranchId is internal state inside EmployeeRosterModule, initialized to 'all'!
  // And when activeViewBranchId is 'all', curBranch is null!
  // So even if the employee selected Medina in the top bar, EmployeeRosterModule STILL queried targetBranchId = null!
  // And targetBranchId = null returned Komi's roster (because Komi had isUnifiedMaster: true)!
  // AND in Komi's roster, all shifts were for Komi!
  
  // NOW WHAT IF THE EMPLOYEE CLICKED THE BUTTON "المدينة الجامعية" INSIDE EmployeeRosterModule?
  // When activeViewBranchId is set to medinaBranchId:
  // curBranch is medinaBranchId.
  // What did currentRoster become?
  // Let's see: medinaRoster won (score 300).
  // BUT look at lines 1576-1636 of rosterEngine.js!
  // In lines 1576-1636:
  // const allShifts = getDayShiftsList(dayItem);
  // for medinaRoster, what does dayItem have?
  // In medinaRoster:
  // dayItem has:
  // shifts: [ { id: 'shift_2', branchId: 'branch_1789241578010', start: '11:00', end: '17:00' } ]
  // WAIT! Why did the user report that Medina showed ALL DAYS OFF?
  // Let's check if medinaRoster WAS approved or draft at the time the user looked!
  console.log('Medina roster status:', (state.rosters || []).find(r => r.branchId === medinaBranchId)?.status);

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
