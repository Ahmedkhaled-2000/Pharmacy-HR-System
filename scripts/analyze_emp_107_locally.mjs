import fs from 'fs';
import { getResolvedEmployeeRoster, getEmployeeDaySchedule } from '../src/utils/rosterEngine.js';

const state = JSON.parse(fs.readFileSync('./scratch_live_state.json', 'utf8'));

const empId = 'emp_1789231413527';
const emp = (state.employees || []).find(e => e.id === empId || e.code === '107');

console.log('=== EMPLOYEE 107 INFO ===');
console.log('ID:', emp.id);
console.log('Code:', emp.code);
console.log('Name:', emp.name);
console.log('Primary branchId:', emp.branchId);
console.log('branchesDetails:', JSON.stringify(emp.branchesDetails, null, 2));

const medinaBranchId = 'branch_1789241578010';
const komiBranchId = 'branch_1789142992139';

console.log('\n=== TESTING getResolvedEmployeeRoster ===');

const rNull = getResolvedEmployeeRoster(emp, null, '2026-10', state);
console.log('1. For targetBranch = null:');
console.log('  Winner ID:', rNull?.id);
console.log('  Winner branchId:', rNull?.branchId);
console.log('  Winner schedule sample (السبت):', rNull?.schedule?.['السبت']);
console.log('  Winner schedule sample (الخميس):', rNull?.schedule?.['الخميس']);

const rMedina = getResolvedEmployeeRoster(emp, medinaBranchId, '2026-10', state);
console.log('2. For targetBranch = Medina (branch_1789241578010):');
console.log('  Winner ID:', rMedina?.id);
console.log('  Winner branchId:', rMedina?.branchId);
console.log('  Winner schedule sample (السبت):', rMedina?.schedule?.['السبت']);
console.log('  Winner schedule sample (الخميس):', rMedina?.schedule?.['الخميس']);
console.log('  Winner schedule sample (2026-10-15):', rMedina?.schedule?.['2026-10-15']);
console.log('  Winner schedule sample (2026-10-17):', rMedina?.schedule?.['2026-10-17']);

const rKomi = getResolvedEmployeeRoster(emp, komiBranchId, '2026-10', state);
console.log('3. For targetBranch = Komi (branch_1789142992139):');
console.log('  Winner ID:', rKomi?.id);
console.log('  Winner branchId:', rKomi?.branchId);
console.log('  Winner schedule sample (السبت):', rKomi?.schedule?.['السبت']);
console.log('  Winner schedule sample (الخميس):', rKomi?.schedule?.['الخميس']);

console.log('\n=== TESTING getEmployeeDaySchedule for multiple dates ===');
const testDates = ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];
for (const d of testDates) {
  console.log(`\nDate: ${d}`);
  const sAll = getEmployeeDaySchedule(emp.id, d, state, null);
  const sMed = getEmployeeDaySchedule(emp.id, d, state, medinaBranchId);
  const sKom = getEmployeeDaySchedule(emp.id, d, state, komiBranchId);
  console.log('  Null branch:', sAll ? { type: sAll.type, start: sAll.start, end: sAll.end, isOff: sAll.isOff, branchId: sAll.branchId, branchName: sAll.branchName } : null);
  console.log('  Medina:     ', sMed ? { type: sMed.type, start: sMed.start, end: sMed.end, isOff: sMed.isOff, branchId: sMed.branchId, branchName: sMed.branchName, label: sMed.label } : null);
  console.log('  Komi:       ', sKom ? { type: sKom.type, start: sKom.start, end: sKom.end, isOff: sKom.isOff, branchId: sKom.branchId, branchName: sKom.branchName, label: sKom.label } : null);
}
