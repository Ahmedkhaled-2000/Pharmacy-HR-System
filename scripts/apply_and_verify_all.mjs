import fs from 'fs';
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));

import {
  reconcileEmployeeScheduleOrPunchChange,
  getScheduledShiftForDate,
  calculateLatenessMinutes
} from '../src/utils/latePenaltyEngine.js';

console.log('--- RECONCILING ALL EMPLOYEES ---');
let totalWaivedMinutes = 0;
let totalWaivedAmount = 0;
let totalEliminatedIncidents = 0;
let currentState = state;

const targetEmps = [
  state.employees.find(e => String(e.code) === '107'),
  state.employees.find(e => String(e.code) === '1146')
].filter(Boolean);

targetEmps.forEach(emp => {
  console.log(`Reconciling employee: ${emp.name} (${emp.code})...`);
  const changedDates = emp.code === '107'
    ? ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']
    : ['2026-10-24'];

  const { updatedState, summary } = reconcileEmployeeScheduleOrPunchChange({
    employeeId: emp.id,
    changedDates,
    state: currentState,
    options: { reason: 'تسوية الجدول ومطابقة الحضور الفعلي مع البصمة', clearPenaltiesOnChangedDates: true }
  });

  currentState = updatedState;
  totalWaivedMinutes += summary.waivedDeductionMinutes || 0;
  totalWaivedAmount += summary.waivedAmount || 0;
  totalEliminatedIncidents += summary.eliminatedIncidentsCount || 0;
  console.log('  Summary:', summary);
});

console.log(`\nTOTALS: Waived Minutes: ${totalWaivedMinutes}, Waived Amount: ${totalWaivedAmount.toFixed(2)} EGP, Eliminated Incidents: ${totalEliminatedIncidents}`);

// Save to reconciled_state.json
fs.writeFileSync('reconciled_state.json', JSON.stringify(currentState), 'utf8');
console.log('Saved reconciled_state.json successfully!');
