const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'ubuntu@63.183.147.199';

const remoteCode = `
import http from 'http';

http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    const val = JSON.parse(raw).value || {};
    console.log('OrgSettings payroll:', {
      startDay: val.orgSettings?.payrollPayoutStartDay,
      endDay: val.orgSettings?.payrollPayoutEndDay,
      periodType: val.orgSettings?.payrollPeriodType
    });
    const emp = (val.employees || []).find(e => e.code === '107' || e.id === 'emp_1789231413527');
    const shifts107 = (val.shifts || []).filter(s => s && (s.employeeId === emp.id || s.employeeCode === emp.code));
    console.log('All 20 shifts dates and branches:');
    shifts107.forEach(s => console.log('  Date:', s.date, 'branchId:', s.branchId, 'branchName:', s.branchName, 'timeIn:', s.timeIn, 'hours:', s.hours));
  });
});
`;

fs.writeFileSync('temp_test.js', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_test.js ${host}:/tmp/temp_test.js`);
  const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_test.js hr-backend-server:/app/temp_test.js && sudo docker exec hr-backend-server node /app/temp_test.js"`).toString();
  console.log(out);
} finally {
  try { fs.unlinkSync('temp_test.js'); } catch {}
}
