import fs from 'fs';
import { recalculateEmployeeCycleLateness } from '../src/utils/latePenaltyEngine.js';

const state = JSON.parse(fs.readFileSync('./scratch_reconciled_full_state.json', 'utf8'));
const empId = 'emp_1789231413527';

const cycleFilter = (d) => d >= '2026-09-21' && d <= '2026-10-20';

const res = recalculateEmployeeCycleLateness({
  employeeId: empId,
  cycleFilterFn: cycleFilter,
  state: state,
  payrollCycleId: '2026-10'
});

console.log('Recalculate produced incidents count:', res.incidents.length);
const activeDeducts = res.incidents.filter(i => 
  i.status !== 'cancelled' &&
  !i.isCancelled &&
  i.actionType !== 'grace' &&
  (i.deductionMinutes > 0 || i.penaltyAmount > 0)
);

console.log('Active deduct incidents count:', activeDeducts.length);
activeDeducts.forEach((i, idx) => {
  console.log(`${idx+1}. Date: ${i.date} | branch: ${i.branchName} | sched: ${i.scheduledStartTime} | punch: ${i.actualPunchInTime} | late: ${i.lateMinutes}m | deduct: ${i.deductionMinutes}m | amt: ${i.penaltyAmount}`);
});
