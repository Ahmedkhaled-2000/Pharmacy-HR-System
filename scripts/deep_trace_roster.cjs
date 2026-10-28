import fs from 'fs';
const stateJson = fs.readFileSync('scratch_live_state.json', 'utf8');
const state = JSON.parse(stateJson);
const emp = state.employees.find(e => String(e.code) === '107');

import { getEmployeeDaySchedule } from '../src/utils/rosterEngine.js';

console.log('--- Step 1: Approved shift adjustments in state.requests ---');
const empIdStr = String(emp.id);
const dateStr = '2026-10-22';
const approvedShiftAdj = (state.requests || []).filter(
  (r) => (String(r.employeeId) === empIdStr || (emp.code && String(r.employeeId) === String(emp.code))) &&
    (r.type === 'shift_adjustment' || r.type === 'roster_edit' || r.type === 'roster_update' || r.type === 'roster_edit_request' || r.type === 'schedule_edit')
);
console.log('Approved shift adjustments found:', approvedShiftAdj.length);
approvedShiftAdj.forEach(r => console.log('  Adj:', r.id, r.type, r.status, r.date, r.schedule ? Object.keys(r.schedule) : 'no sched'));

console.log('--- Step 2: Shift swaps in state.shiftSwaps / requests ---');

console.log('--- Step 3: getEmployeeDaySchedule from rosterEngine ---');
['2026-10-22', '2026-10-25', '2026-10-27'].forEach(d => {
  const sched = getEmployeeDaySchedule(emp.id, d, state, emp.branchId);
  console.log(`getEmployeeDaySchedule(${d}) = `, sched);
});
