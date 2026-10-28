import fs from 'fs';
import { recalculateEmployeeCycleLateness } from '../src/utils/latePenaltyEngine.js';

async function main() {
  const scratchState = JSON.parse(fs.readFileSync('./scratch_live_state.json', 'utf8'));
  const res = await fetch('http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data');
  const vpsState = (await res.json()).value;

  const empId = 'emp_1789231413527';

  const scratchRes = recalculateEmployeeCycleLateness({ employeeId: empId, state: scratchState, payrollCycleId: '2026-10' });
  const vpsRes = recalculateEmployeeCycleLateness({ employeeId: empId, state: vpsState, payrollCycleId: '2026-10' });

  const sDeduct = scratchRes.incidents.filter(i => (i.deductionMinutes > 0 || i.penaltyAmount > 0) && i.actionType !== 'grace');
  const vDeduct = vpsRes.incidents.filter(i => (i.deductionMinutes > 0 || i.penaltyAmount > 0) && i.actionType !== 'grace');

  console.log('Scratch deduction count:', sDeduct.length);
  console.log('VPS deduction count:', vDeduct.length);

  console.log('\nIncidents in scratch deductions:');
  sDeduct.forEach(d => console.log(d.date, d.branchName, 'sched:', d.scheduledStartTime, 'in:', d.actualPunchInTime, 'late:', d.lateMinutes, 'deduct:', d.deductionMinutes, 'status:', d.status, 'actionType:', d.actionType));

  console.log('\nIncidents in VPS deductions:');
  vDeduct.forEach(d => console.log(d.date, d.branchName, 'sched:', d.scheduledStartTime, 'in:', d.actualPunchInTime, 'late:', d.lateMinutes, 'deduct:', d.deductionMinutes, 'status:', d.status, 'actionType:', d.actionType));

  console.log('\nChecking what happened to the missing dates in VPS:');
  sDeduct.forEach(sd => {
    const vd = vpsRes.incidents.find(i => i.date === sd.date && i.branchName === sd.branchName);
    if (!vd) {
      console.log(`Missing completely in VPS: ${sd.date} ${sd.branchName}`);
    } else if (vd.actionType === 'grace' || vd.deductionMinutes === 0 || vd.status !== sd.status) {
      console.log(`Diff on ${sd.date} ${sd.branchName}: scratch=(deduct:${sd.deductionMinutes}, act:${sd.actionType}, st:${sd.status}) vs vps=(deduct:${vd.deductionMinutes}, act:${vd.actionType}, st:${vd.status}, label:${vd.actionLabel})`);
    }
  });
}

main().catch(console.error);
