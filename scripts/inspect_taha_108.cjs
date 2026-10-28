const fs = require('fs');
const { execSync } = require('child_process');

// Fetch live state from Redis on VPS
console.log('Fetching live Redis data...');
const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "docker exec hr-redis redis-cli get 'hr:settings:pharmacy-tracker-data'"`;
const raw = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 }).toString();

const state = JSON.parse(raw);
console.log('Total employees:', state.employees?.length);

const taha = (state.employees || []).find(e => e && (String(e.code) === '108' || (e.name && e.name.includes('طه'))));
if (!taha) {
  console.log('Taha 108 not found!');
  process.exit(1);
}

console.log('Found Taha:');
console.log('ID:', taha.id, 'Code:', taha.code, 'Name:', taha.name, 'Branch:', taha.branchId);
console.log('Flexible / Variable:', taha.noMonthlySchedule, taha.isVariableHours, taha.variableHours);
console.log('BranchesDetails:', taha.branchesDetails);

// Find Taha rosters
const rosters = (state.rosters || []).filter(r => r && (String(r.employeeId) === String(taha.id) || String(r.employeeCode) === '108'));
console.log('\nRosters found:', rosters.length);
rosters.forEach(r => {
  console.log('Roster ID:', r.id, 'Month:', r.month, 'from:', r.fromDate, 'to:', r.toDate, 'isUnified:', r.isUnifiedMaster, 'Status:', r.status);
  console.log('Schedule keys:', Object.keys(r.schedule || {}));
  console.log('2026-10-21 to 2026-10-27 in roster:');
  ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'].forEach(d => {
    console.log(`  ${d}:`, (r.schedule || {})[d]);
  });
});

// Find Taha shifts / punches
const shifts = (state.shifts || []).filter(s => s && (String(s.employeeId) === String(taha.id) || String(s.employeeCode) === '108'));
console.log('\nShifts found:', shifts.length);
const cycleShifts = shifts.filter(s => s.date >= '2026-10-21' && s.date <= '2026-11-20');
console.log('Shifts in 2026-11 cycle (2026-10-21 to 2026-11-20):', cycleShifts.length);
cycleShifts.forEach(s => {
  console.log(`  Date: ${s.date}, in: ${s.timeIn}, out: ${s.timeOut}, schedStart: ${s.scheduledStart}, schedEnd: ${s.scheduledEnd}, lateMins: ${s.lateMinutes}, otHours: ${s.overtimeHours}, branch: ${s.branchId}`);
});

// Find Taha late incidents
const incs = (state.lateIncidents || []).filter(i => i && (String(i.employeeId) === String(taha.id) || String(i.employeeCode) === '108'));
console.log('\nLate incidents found:', incs.length);
const cycleIncs = incs.filter(i => i.date >= '2026-10-21' && i.date <= '2026-11-20');
console.log('Cycle incidents:', cycleIncs.length);
cycleIncs.forEach(i => {
  console.log(`  Date: ${i.date}, lateMins: ${i.lateMinutes}, dedMins: ${i.deductionMinutes}, amt: ${i.penaltyAmount}, status: ${i.status}, sched: ${i.scheduledStartTime}, actual: ${i.actualPunchInTime}`);
});
