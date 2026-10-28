import fs from 'fs';
const stateJson = fs.readFileSync('scratch_live_state.json', 'utf8');
const state = JSON.parse(stateJson);
const emp = state.employees.find(e => String(e.code) === '107');

import { getScheduledShiftForDate } from '../src/utils/latePenaltyEngine.js';

// Let's see what getScheduledShiftForDate actually returns right now
const res22 = getScheduledShiftForDate(emp.id, '2026-10-22', state, emp.branchId);
console.log('2026-10-22 result:', res22);

const res25 = getScheduledShiftForDate(emp.id, '2026-10-25', state, emp.branchId);
console.log('2026-10-25 result:', res25);

const res27 = getScheduledShiftForDate(emp.id, '2026-10-27', state, emp.branchId);
console.log('2026-10-27 result:', res27);
