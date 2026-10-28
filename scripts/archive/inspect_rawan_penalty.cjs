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
    const emp103 = (state.employees || []).find(e => String(e.code) === '103');
    console.log('Employee 103:', emp103.name, emp103.id);
    
    const lates103 = (state.lateIncidents || []).filter(i => i.employeeId === emp103.id || String(i.employeeCode) === '103');
    console.log('Late incidents for 103 (count ' + lates103.length + '):');
    lates103.forEach(i => console.log(i.date, 'lateMins:', i.lateMinutes, 'dedMins:', i.deductionMinutes, 'amt:', i.penaltyAmount, 'actionType:', i.actionType, 'status:', i.status, 'id:', i.id));
    
    const req1013 = (state.requests || []).find(r => r.id === 'req_late_inc_emp_1789144674736_2026-10-13_1013');
    console.log('Request 2026-10-13:', JSON.stringify(req1013, null, 2));

    const allApprovedReqs103 = (state.requests || []).filter(r => (r.employeeId === emp103.id || String(r.employeeCode) === '103') && r.status === 'approved' && (r.amount > 0 || r.type === 'penalty'));
    console.log('All approved penalty requests for 103:', JSON.stringify(allApprovedReqs103, null, 2));
  });
});
`;

fs.writeFileSync('temp_rawan.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_rawan.cjs ${host}:/tmp/temp_rawan.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_rawan.cjs hr-backend-server:/app/temp_rawan.cjs; sudo docker exec hr-backend-server node /app/temp_rawan.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_rawan.cjs'); } catch {}
}
