const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'ubuntu@63.183.147.199';

const remoteCode = `
const http = require('http');
http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(raw);
      const val = parsed.value || {};
      console.log('Employees count:', (val.employees || []).length);
      console.log('Branches count:', (val.branches || []).length);
      (val.branches || []).forEach(b => console.log(' Branch:', b.id, b.name, b.code));
      
      const multiBranchEmps = (val.employees || []).filter(e => e.branchesDetails && e.branchesDetails.length > 1);
      console.log('Multi-branch employees count:', multiBranchEmps.length);
      multiBranchEmps.forEach(e => {
        console.log('--- Multi-branch Emp:', e.id, 'Code:', e.code, 'Name:', e.name);
        console.log('    BranchesDetails:', JSON.stringify(e.branchesDetails));
        const empShifts = (val.shifts || []).filter(s => s && (String(s.employeeId) === String(e.id) || String(s.employeeCode) === String(e.code)));
        console.log('    Total raw shifts in state:', empShifts.length);
        const bCounts = {};
        empShifts.forEach(s => {
          const k = 'ID:' + (s.branchId || 'None') + ' | Name:' + (s.branchName || 'None');
          bCounts[k] = (bCounts[k] || 0) + 1;
        });
        console.log('    Shifts by branchId/name:', JSON.stringify(bCounts, null, 2));
      });
    } catch (e) {
      console.error('Error:', e.message);
    }
  });
}).on('error', e => console.error(e.message));
`;

fs.writeFileSync('temp_remote.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_remote.cjs ${host}:/tmp/temp_remote.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_remote.cjs hr-backend-server:/app/temp_remote.cjs && sudo docker exec hr-backend-server node /app/temp_remote.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_remote.cjs'); } catch {}
}
