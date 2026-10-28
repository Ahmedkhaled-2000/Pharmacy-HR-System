const fs = require('fs');
const { execSync } = require('child_process');

console.log('Fetching live Redis data...');
const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "docker exec hr-redis redis-cli get 'hr:settings:pharmacy-tracker-data'"`;
const raw = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 }).toString();
const state = JSON.parse(raw);

const { getEmployeeDaySchedule, findEmployeeRoster } = require('../src/utils/rosterEngine.js');
const { calculateLatenessMinutes, classifyLateTier, getEffectiveLatePolicy } = require('../src/utils/latePenaltyEngine.js');

console.log('Auditing all employees in cycle 2026-11 (2026-10-21 to 2026-11-20)...');

const employees = state.employees || [];
const shifts = state.shifts || [];
const rosters = state.rosters || [];
const lateIncidents = state.lateIncidents || [];

const affectedEmployees = [];

employees.forEach(emp => {
  if (!emp || emp.status === 'resigned' || emp.isResigned) return;
  const empId = String(emp.id);
  const empCode = String(emp.code || '');
  const empName = emp.name || '';

  const empShifts = shifts.filter(s =>
    s && (String(s.employeeId) === empId || (empCode && String(s.employeeCode) === empCode)) &&
    s.date >= '2026-10-21' && s.date <= '2026-11-20'
  );

  let hasMismatch = false;
  const shiftMismatches = [];

  empShifts.forEach(s => {
    if (!s.date || !s.timeIn) return;
    const daySched = getEmployeeDaySchedule(empId, s.date, state, s.branchId);
    if (!daySched) return;

    const schedStart = daySched.isOff ? '' : (daySched.start || '');
    const schedEnd = daySched.isOff ? '' : (daySched.end || '');

    // Check if shift recorded schedStart differs from daySched.start
    if (schedStart && s.scheduledStart && s.scheduledStart !== schedStart) {
      hasMismatch = true;
      shiftMismatches.push({
        date: s.date,
        timeIn: s.timeIn,
        recordedSchedStart: s.scheduledStart,
        actualSchedStart: schedStart,
        recordedLateMins: s.lateMinutes,
        expectedLateMins: calculateLatenessMinutes(schedStart, s.timeIn)
      });
    }
  });

  if (hasMismatch) {
    affectedEmployees.push({
      id: empId,
      code: empCode,
      name: empName,
      mismatchesCount: shiftMismatches.length,
      details: shiftMismatches
    });
  }
});

console.log(`\nFound ${affectedEmployees.length} employees with shift/schedule mismatches:`);
affectedEmployees.forEach(ae => {
  console.log(`\nEmployee: ${ae.name} (Code: ${ae.code}, ID: ${ae.id}) - ${ae.mismatchesCount} mismatched shifts:`);
  ae.details.forEach(d => {
    console.log(`  Date: ${d.date} | In: ${d.timeIn} | Recorded Sched: ${d.recordedSchedStart} (Late: ${d.recordedLateMins}m) | Actual Sched: ${d.actualSchedStart} (Expected Late: ${d.expectedLateMins}m)`);
  });
});
