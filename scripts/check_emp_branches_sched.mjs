import fs from 'fs';

const state = JSON.parse(fs.readFileSync('./scratch_live_vps_state.json', 'utf8'));
const emp = state.employees.find(e => String(e.code) === '107');

console.log('Branches in branchesDetails:', emp.branchesDetails?.map(b => ({
  branchId: b.branchId,
  hasSchedule: Boolean(b.schedule),
  scheduleKeysCount: b.schedule ? Object.keys(b.schedule).length : 0
})));

if (emp.branchesDetails?.[0]?.schedule) {
  console.log('\nSample dates in branchesDetails[0].schedule:');
  const entries = Object.entries(emp.branchesDetails[0].schedule);
  entries.slice(0, 5).forEach(([k, v]) => {
    console.log(k, JSON.stringify(v));
  });
}
