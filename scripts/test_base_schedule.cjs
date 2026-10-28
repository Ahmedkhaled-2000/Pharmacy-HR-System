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

  // Let's test the EXACT code of getEmployeeBaseDaySchedule from src/utils/rosterEngine.js:
  // 1. roster = findEmployeeRoster(empId, '2026-10-15', state, medinaBranchId)
  
  // What does findEmployeeRoster do?
  // cycleMonth = getActivePayrollMonth(...) -> '2026-10'
  // resolved = getResolvedEmployeeRoster(empId, targetBranchId, '2026-10', state)
  // Let's see what resolved is!
  
  // We can evaluate getResolvedEmployeeRoster directly:
  // Let's read dist/assets/*.js or let's run the exact logic:
  
  const targetBIdStr = medinaBranchId;
  const targetBObj = (state.branches || []).find(b => String(b.id) === targetBIdStr);
  const isMultiBranch = true;
  const normSelectedMonth = '2026-10';

  // Finding winner roster:
  const rosters = state.rosters || [];
  const candidates = [];
  rosters.forEach(r => {
    if (String(r.employeeId) !== empId && String(r.employeeCode) !== '107') return;
    if (r.status === 'rejected' || r.status === 'draft') return;
    let bMatches = false;
    const itemBStr = String(r.branchId || '').trim();
    if (itemBStr.toLowerCase() === targetBIdStr.toLowerCase()) bMatches = true;

    let score = 0;
    if (r.month === '2026-10') score = 100;
    if (bMatches) score += 200;
    candidates.push({ ...r, score, bMatches });
  });

  candidates.sort((a,b) => b.score - a.score);
  const winner = candidates[0];
  console.log('Winner ID for targetBranch = Medina:', winner?.id);

  // Now, what did getEmployeeBaseDaySchedule do after finding roster?
  // Lines 308-352 of rosterEngine.js:
  const jsDay = new Date('2026-10-15T00:00:00').getDay();
  console.log('jsDay for 2026-10-15:', jsDay); // 4 = Thursday
  
  const sched = winner.schedule['2026-10-15'] || winner.schedule['الخميس'];
  console.log('Raw sched from winner:', sched);

  // Now lines 315-352:
  const defaultBranch = winner.branchId || emp.branchId || null;
  const defaultBranchIdStr = String(defaultBranch || '').trim();
  console.log('defaultBranchIdStr:', defaultBranchIdStr);

  // getDayShiftsList(sched, defaultBranch):
  function getDayShiftsList(item, fallbackBId) {
    if (!item || item.type === 'off' || item.isOff) return [];
    if (Array.isArray(item.shifts) && item.shifts.length > 0) {
      return item.shifts.filter(s => !s.isOff && s.type !== 'off').map((s, idx) => ({
        ...s,
        branchId: String(s.branchId || fallbackBId).trim()
      }));
    }
    return [];
  }

  const allShifts = getDayShiftsList(sched, defaultBranch);
  console.log('allShifts:', allShifts);

  const tgtBId = String(targetBIdStr).trim();
  const branchShifts = allShifts.filter(s => {
    const sBId = String(s.branchId || defaultBranchIdStr).trim();
    return sBId === tgtBId || (!sBId && (!defaultBranchIdStr || defaultBranchIdStr === tgtBId));
  });
  console.log('branchShifts:', branchShifts);

  if (branchShifts.length > 0) {
    console.log('-> Found branchShift for Medina!');
  } else if (allShifts.length > 0 && allShifts.some(s => s.branchId && String(s.branchId).trim() !== tgtBId)) {
    console.log('-> Marked as isOtherBranchShift = true and type = off!');
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
  console.error(e.message);
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
}
