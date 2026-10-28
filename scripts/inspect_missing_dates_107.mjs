import fs from 'fs';

const state = JSON.parse(fs.readFileSync('./scratch_live_state.json', 'utf8'));
const empId = 'emp_1789231413527';

const targetDates = [
  '2026-09-22',
  '2026-09-24',
  '2026-09-26',
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-03',
  '2026-10-11',
  '2026-10-12',
  '2026-10-18',
  '2026-10-19'
];

console.log('=== SHIFTS FOR EMP 107 ===');
(state.shifts || [])
  .filter(s => (s.employeeId === empId || s.employeeCode === '107') && targetDates.includes(s.date))
  .forEach(s => {
    console.log(`Shift: ${s.date} | branch: ${s.branchName || s.branchId} | timeIn: ${s.timeIn} | timeOut: ${s.timeOut} | sched: ${s.shiftStart}-${s.shiftEnd} | exempt: ${s.latePenaltyExempt}`);
  });

console.log('\n=== REQUESTS FOR EMP 107 ===');
(state.requests || [])
  .filter(r => (r.employeeId === empId || r.employeeCode === '107') && (targetDates.includes(r.date) || targetDates.includes(r.startDate)))
  .forEach(r => {
    console.log(`Req: ${r.id} | type: ${r.type} | date: ${r.date || r.startDate} | status: ${r.status} | adminApproved: ${r.adminApproved} | penaltyId: ${r.penaltyId}`);
  });

console.log('\n=== LATE INCIDENTS IN STATE FOR EMP 107 ===');
(state.lateIncidents || [])
  .filter(inc => (inc.employeeId === empId || inc.employeeCode === '107'))
  .forEach(inc => {
    console.log(`Inc: ${inc.id} | date: ${inc.date} | branch: ${inc.branchName} | late: ${inc.lateMinutes} | ded: ${inc.deductionMinutes} | amt: ${inc.penaltyAmount} | stat: ${inc.status} | obj: ${inc.objection?.status}`);
  });
