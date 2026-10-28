import fs from 'fs';

const state = JSON.parse(fs.readFileSync('./scratch_live_state.json', 'utf8'));
const empId = 'emp_1789231413527';
const emp = (state.employees || []).find(e => e.id === empId || e.code === '107');

console.log('=== EMPLOYEE 107 SHIFTS IN LIVE STATE ===');
const shifts = (state.shifts || []).filter(s => s && (s.employeeId === empId || s.employeeCode === '107'));
shifts.sort((a,b) => (a.date || '').localeCompare(b.date || ''));

console.log(`Found ${shifts.length} shifts:`);
shifts.slice(-20).forEach(s => {
  console.log({
    date: s.date,
    branchName: s.branchName,
    branchId: s.branchId,
    timeIn: s.timeIn,
    timeOut: s.timeOut,
    schedStart: s.scheduledStart,
    schedEnd: s.scheduledEnd,
    lateMinutes: s.lateMinutes,
    latenessMinutes: s.latenessMinutes,
    latePenaltyExempt: s.latePenaltyExempt,
    penaltyAmount: s.penaltyAmount,
    overtimeHours: s.overtimeHours
  });
});

console.log('\n=== LATE INCIDENTS FOR 107 ===');
const incidents = (state.lateIncidents || []).filter(i => i.employeeId === empId || i.employeeCode === '107');
console.log(`Found ${incidents.length} late incidents:`);
incidents.forEach(i => console.log(i));

console.log('\n=== LATE PENALTY POLICY & BYLAWS ===');
console.log('latePenaltyPolicy:', state.latePenaltyPolicy);
console.log('bylaws late tiers count:', state.bylaws?.lateTiers?.length);
console.log('bylaws sample:', state.bylaws?.lateTiers?.slice(0, 3));
