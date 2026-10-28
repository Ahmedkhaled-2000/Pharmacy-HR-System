const fs = require('fs');
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));

// Let's test the complete fix
const emp = state.employees.find(e => String(e.code) === '107');
console.log('Testing employee:', emp.name, emp.id, emp.code);

// Let's check all incidents for 107 before fix
console.log('\n--- BEFORE FIX: lateIncidents for 107 ---');
const beforeIncs = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp.id) || String(i.employeeCode) === '107');
beforeIncs.forEach(i => console.log('  ', i.id, i.date, 'schedStart:', i.scheduledStartTime, 'punch:', i.actualPunchInTime, 'lateMin:', i.lateMinutes, 'dedMin:', i.deductionMinutes, 'status:', i.status));

// Let's check requests for 107 before fix
console.log('\n--- BEFORE FIX: penalty requests for 107 ---');
const beforeReqs = (state.requests || []).filter(r => (String(r.employeeId) === String(emp.id) || String(r.employeeCode) === '107') && (r.subType === 'lateness' || r.type === 'penalty'));
beforeReqs.forEach(r => console.log('  ', r.id, r.date, 'dedMin:', r.deductionMinutes, 'status:', r.status));
