import fs from 'fs';
import {
  recalculateEmployeeCycleLateness,
  getScheduledShiftForDate,
  calculateLatenessMinutes,
  classifyLateTier,
  getPenaltyForOccurrence,
  computeLatenessFinancialAmount,
  getEffectiveLatePolicy
} from '../src/utils/latePenaltyEngine.js';

const state = JSON.parse(fs.readFileSync('./scratch_live_vps_state.json', 'utf8'));

const emp = state.employees.find(e => String(e.code) === '107' || e.name.includes('عبد الرحمن'));
console.log('Employee:', emp.id, emp.name, 'Code:', emp.code);

console.log('\n--- 1. CURRENT STATE.LATEINCIDENTS IN DB FOR EMP 107 ---');
const dbIncs = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp.id));
console.log('Count:', dbIncs.length);
dbIncs.forEach(i => {
  console.log(`- ${i.date} | branch: ${i.branchId} | sched: ${i.scheduledStartTime} | punch: ${i.actualPunchInTime} | late: ${i.lateMinutes}m | deduct: ${i.deductionMinutes}m | amt: ${i.penaltyAmount} | status: ${i.status} | cancelled: ${i.isCancelled}`);
});

console.log('\n--- 2. RUN RECALCULATE ON UNMODIFIED CURRENT STATE ---');
const cycleFilter = (d) => d >= '2026-09-21' && d <= '2026-10-20';
const resUnmodified = recalculateEmployeeCycleLateness({
  employeeId: emp.id,
  cycleFilterFn: cycleFilter,
  state: state,
  payrollCycleId: '2026-10'
});

console.log('Recalculate produced incidents count:', resUnmodified.incidents.length);
resUnmodified.incidents.forEach(i => {
  console.log(`- ${i.date} | branch: ${i.branchId} | sched: ${i.scheduledStartTime} | punch: ${i.actualPunchInTime} | late: ${i.lateMinutes}m | tier: ${i.tierName} | occ: #${i.occurrenceNumber} | action: ${i.actionLabel} | deduct: ${i.deductionMinutes}m | amt: ${i.penaltyAmount} | status: ${i.status} | cancelled: ${i.isCancelled}`);
});

console.log('\n--- 3. CHECK EACH SHIFT OF EMP 107 AND HOW GETSCHEDULEDSHIFTFORDATE EVALUATES IT ---');
const empShifts = (state.shifts || [])
  .filter(s => (s.employeeId === emp.id || s.employeeCode === '107') && cycleFilter(s.date))
  .sort((a, b) => (a.date === b.date ? (a.timeIn || '').localeCompare(b.timeIn || '') : a.date.localeCompare(b.date)));

empShifts.forEach(s => {
  const sched = getScheduledShiftForDate(emp.id, s.date, state, s.branchId);
  const diff = sched && sched.start ? calculateLatenessMinutes(sched.start, s.timeIn) : 0;
  console.log(`Shift ${s.date} [branch: ${s.branchId}]: punchIn=${s.timeIn} -> sched=${sched?.start}-${sched?.end} (source: ${sched?.source}, isOff: ${sched?.isOff}) -> diff=${diff}m (shift.latePenaltyExempt: ${s.latePenaltyExempt})`);
});
