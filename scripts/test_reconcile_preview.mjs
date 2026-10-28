import fs from 'fs';
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));

import {
  reconcileEmployeeScheduleOrPunchChange,
  getScheduledShiftForDate,
  recalculateEmployeeCycleLateness
} from '../src/utils/latePenaltyEngine.js';

const emp = state.employees.find(e => String(e.code) === '107');

const dates = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];

console.log('\n--- Running reconcileEmployeeScheduleOrPunchChange ---');
const { updatedState, summary } = reconcileEmployeeScheduleOrPunchChange({
  employeeId: emp.id,
  changedDates: dates,
  state: state,
  options: { reason: 'تعديل واعتماد الجدول الشهري', clearPenaltiesOnChangedDates: true }
});

console.log('Summary:', summary);

console.log('\n--- Incidents AFTER Reconciliation for 107 ---');
const afterIncs = (updatedState.lateIncidents || []).filter(i => String(i.employeeId) === String(emp.id) || String(i.employeeCode) === '107');
afterIncs.forEach(i => console.log('  ', i.id, i.date, 'lateMin:', i.lateMinutes, 'dedMin:', i.deductionMinutes, 'amt:', i.penaltyAmount, 'status:', i.status));

console.log('\n--- Requests AFTER Reconciliation for 107 (Lateness/Penalty) ---');
const afterReqs = (updatedState.requests || []).filter(r => (String(r.employeeId) === String(emp.id) || String(r.employeeCode) === '107') && (r.subType === 'lateness' || r.type === 'penalty'));
afterReqs.forEach(r => console.log('  ', r.id, r.date, 'dedMin:', r.deductionMinutes, 'status:', r.status));
