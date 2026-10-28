const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

const remoteCode = `
const http = require('http');
http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    const state = JSON.parse(raw).value || {};
    console.log('_deletedIds count:', (state._deletedIds || []).length);
    console.log('Is 2026-10-11 in _deletedIds?', (state._deletedIds || []).filter(id => id.includes('2026-10-11')));
    console.log('_penaltiesClearedAt:', state._penaltiesClearedAt);
    const emp105 = (state.employees || []).find(e => String(e.code) === '105');
    console.log('Employee 105:', emp105.name, emp105.id, 'salary:', emp105.salary);

    const lates105 = (state.lateIncidents || []).filter(i => i.employeeId === emp105.id || String(i.employeeCode) === '105');
    console.log('\\n=== MOHAMED LATE INCIDENTS (count: ' + lates105.length + ') ===');
    let totalLateIncMins = 0;
    let totalLateIncAmt = 0;
    lates105.forEach(i => {
      const amt = parseFloat(i.penaltyAmount) || 0;
      const ded = parseFloat(i.deductionMinutes) || 0;
      totalLateIncMins += ded;
      totalLateIncAmt += amt;
      console.log(i.date, 'lateMins:', i.lateMinutes, 'dedMins:', ded, 'amt:', amt, 'action:', i.actionType, 'status:', i.status, 'id:', i.id);
    });
    console.log('Total lateIncidents dedMins:', totalLateIncMins, 'Total penaltyAmount:', totalLateIncAmt);

    const reqs105 = (state.requests || []).filter(r => (r.employeeId === emp105.id || String(r.employeeCode) === '105'));
    console.log('\\n=== MOHAMED REQUESTS (count: ' + reqs105.length + ') ===');
    reqs105.forEach(r => {
      console.log(r.date, r.type, r.subType, 'amt:', r.amount, 'dedMins:', r.deductionMinutes, 'status:', r.status, 'id:', r.id);
    });

    const adjs105 = (state.adjustments || []).filter(a => a.employeeId === emp105.id || String(a.employeeCode) === '105');
    console.log('\\n=== MOHAMED ADJUSTMENTS (count: ' + adjs105.length + ') ===');
    adjs105.forEach(a => console.log(a.date, a.type, 'amt:', a.amount, 'reason:', a.reason, 'id:', a.id));
  });
});
`;

fs.writeFileSync('temp_mohamed.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_mohamed.cjs ${host}:/tmp/temp_mohamed.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_mohamed.cjs hr-backend-server:/app/temp_mohamed.cjs; sudo docker exec hr-backend-server node /app/temp_mohamed.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_mohamed.cjs'); } catch {}
}
