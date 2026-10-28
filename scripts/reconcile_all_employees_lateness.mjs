import fs from 'fs';
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));

import {
  reconcileEmployeeScheduleOrPunchChange,
  getScheduledShiftForDate,
  calculateLatenessMinutes
} from '../src/utils/latePenaltyEngine.js';

console.log('Total employees:', state.employees?.length);

const discrepancies = [];

(state.employees || []).forEach(emp => {
  const empIncs = (state.lateIncidents || []).filter(i => 
    i && (String(i.employeeId) === String(emp.id) || (emp.code && String(i.employeeCode) === String(emp.code))) &&
    i.status !== 'cancelled' && !i.isCancelled && (parseFloat(i.deductionMinutes) > 0 || parseFloat(i.penaltyAmount) > 0)
  );

  empIncs.forEach(inc => {
    const shift = (state.shifts || []).find(s => 
      s && (String(s.employeeId) === String(emp.id) || (emp.code && String(s.employeeCode) === String(emp.code))) &&
      s.date === inc.date
    );
    const sched = getScheduledShiftForDate(emp.id, inc.date, state, inc.branchId || emp.branchId);
    
    if (!sched || sched.isOff || !sched.start) {
      discrepancies.push({
        empId: emp.id,
        code: emp.code,
        name: emp.name,
        date: inc.date,
        issue: 'Scheduled is OFF/none but active late incident exists',
        incDed: inc.deductionMinutes,
        incSched: inc.scheduledStartTime
      });
    } else if (shift && shift.timeIn) {
      const diff = calculateLatenessMinutes(sched.start, shift.timeIn);
      if (diff <= 0) {
        discrepancies.push({
          empId: emp.id,
          code: emp.code,
          name: emp.name,
          date: inc.date,
          issue: 'Actual punch was ON TIME for current schedule',
          schedStart: sched.start,
          punchIn: shift.timeIn,
          diffMinutes: diff,
          incDed: inc.deductionMinutes,
          incSched: inc.scheduledStartTime
        });
      } else if (inc.scheduledStartTime && inc.scheduledStartTime !== sched.start) {
        discrepancies.push({
          empId: emp.id,
          code: emp.code,
          name: emp.name,
          date: inc.date,
          issue: 'Incident scheduledStartTime does not match current schedule',
          schedStart: sched.start,
          incSched: inc.scheduledStartTime,
          punchIn: shift.timeIn,
          diffMinutes: diff,
          incDed: inc.deductionMinutes
        });
      }
    }
  });
});

console.log('Total discrepancies found across all employees:', discrepancies.length);
console.log(JSON.stringify(discrepancies, null, 2));
