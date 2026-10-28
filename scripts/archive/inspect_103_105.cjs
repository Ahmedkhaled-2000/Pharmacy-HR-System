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
    try {
      const parsed = JSON.parse(raw);
      const state = parsed.value || {};
      
      const emps = state.employees || [];
      const emp103 = emps.find(e => String(e.code) === '103' || (e.name && e.name.includes('روان')));
      const emp105 = emps.find(e => String(e.code) === '105' || (e.name && e.name.includes('محمد احمد محمد حسين')));

      console.log('=== RAWAN (103) ===');
      console.log('Emp:', emp103);
      const lates103 = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp103?.id) || String(i.employeeCode) === '103');
      console.log('Late incidents for 103:', lates103);
      const reqs103 = (state.requests || []).filter(r => String(r.employeeId) === String(emp103?.id) || String(r.employeeCode) === '103');
      console.log('Requests for 103 count:', reqs103.length);
      console.log('Requests sample for 103:', reqs103.filter(r => r.type?.includes('late') || r.type?.includes('penalty')));
      const adjs103 = (state.adjustments || []).filter(a => String(a.employeeId) === String(emp103?.id) || String(a.employeeCode) === '103');
      console.log('Adjustments for 103:', adjs103);

      console.log('\\n=== MOHAMED (105) ===');
      console.log('Emp:', emp105);
      const lates105 = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp105?.id) || String(i.employeeCode) === '105');
      console.log('Late incidents for 105 count:', lates105.length);
      console.log('Late incidents for 105:', lates105.map(i => ({ id: i.id, date: i.date, status: i.status, lateMinutes: i.lateMinutes, deductionMinutes: i.deductionMinutes, penaltyAmount: i.penaltyAmount, penaltyAction: i.penaltyAction })));
      const adjs105 = (state.adjustments || []).filter(a => String(a.employeeId) === String(emp105?.id) || String(a.employeeCode) === '105');
      console.log('Adjustments for 105 count:', adjs105.length);
      console.log('Adjustments for 105:', adjs105);
      const reqs105 = (state.requests || []).filter(r => (String(r.employeeId) === String(emp105?.id) || String(r.employeeCode) === '105') && (r.type === 'penalty' || r.type === 'violation' || r.type === 'deduction' || r.type === 'lateness'));
      console.log('Penalty requests for 105 count:', reqs105.length);
      console.log('Penalty requests for 105:', reqs105.map(r => ({ id: r.id, date: r.date, type: r.type, status: r.status, amount: r.amount, penaltyAmount: r.penaltyAmount, deductionFixedAmount: r.deductionFixedAmount, details: r.details, reason: r.reason })));

    } catch (e) {
      console.error('Error:', e.message);
    }
  });
}).on('error', e => console.error(e.message));
`;

fs.writeFileSync('temp_inspect_103_105.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_inspect_103_105.cjs ${host}:/tmp/temp_inspect_103_105.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_inspect_103_105.cjs hr-backend-server:/app/temp_inspect_103_105.cjs && sudo docker exec hr-backend-server node /app/temp_inspect_103_105.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_inspect_103_105.cjs'); } catch {}
}
