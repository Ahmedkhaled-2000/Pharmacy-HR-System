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

const dates = ['2026-09-26', '2026-09-27', '2026-10-01', '2026-10-03'];
res.incidents.filter(i => dates.includes(i.date)).forEach(i => {
  console.log(i.date, i.branchName, 'late:', i.lateMinutes, 'deduct:', i.deductionMinutes, 'status:', i.status, 'actionLabel:', i.actionLabel, 'overrideReason:', i.overrideReason, 'cancellationReason:', i.cancellationReason);
});
