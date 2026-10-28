import fs from 'fs';
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));

const emp = state.employees.find(e => String(e.code) === '1146');
console.log('Employee:', emp.name, emp.id, emp.code);

const shifts = (state.shifts || []).filter(s => s && (String(s.employeeId) === String(emp.id) || String(s.employeeCode) === '1146') && s.date === '2026-10-24');
console.log('Shifts on 2026-10-24:', shifts);

const incs = (state.lateIncidents || []).filter(i => (String(i.employeeId) === String(emp.id) || String(i.employeeCode) === '1146') && i.date === '2026-10-24');
console.log('Incidents on 2026-10-24:', incs);

import { getScheduledShiftForDate, reconcileEmployeeScheduleOrPunchChange } from '../src/utils/latePenaltyEngine.js';
const sched = getScheduledShiftForDate(emp.id, '2026-10-24', state, emp.branchId);
console.log('Sched on 2026-10-24:', sched);

const { summary } = reconcileEmployeeScheduleOrPunchChange({
  employeeId: emp.id,
  changedDates: ['2026-10-24'],
  state: state,
  options: { reason: 'فحص وتسوية حضور الموظف', clearPenaltiesOnChangedDates: true }
});
console.log('Recon summary for 1146:', summary);
