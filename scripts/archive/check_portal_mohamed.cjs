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
    const emp105 = (state.employees || []).find(e => String(e.code) === '105');
    
    // Check late incidents for 105 in current payroll cycle (2026-10)
    // Payroll cycle 2026-10 is usually from 2026-09-21 to 2026-10-20
    const lates105 = (state.lateIncidents || []).filter(i => {
      const matchEmp = i.employeeId === emp105.id || String(i.employeeCode) === '105';
      if (!matchEmp) return false;
      if (i.status === 'cancelled') return false;
      const d = i.date;
      return d >= '2026-09-21' && d <= '2026-10-20';
    });

    console.log('=== LATE INCIDENTS IN CYCLE 2026-10 FOR MOHAMED ===');
    let sumLateDeduction = 0;
    let sumLateMins = 0;
    lates105.forEach(i => {
      const amt = parseFloat(i.penaltyAmount) || 0;
      const mins = parseFloat(i.deductionMinutes) || 0;
      sumLateDeduction += amt;
      sumLateMins += mins;
      console.log(i.date, 'mins:', mins, 'amt:', amt, 'action:', i.actionType, 'id:', i.id);
    });
    console.log('Total lateDeduction in computeEmpSummary:', sumLateDeduction, 'mins:', sumLateMins);

    // Now what about unmappedPenaltyRequests in computeEmpSummary?
    const reqs105 = (state.requests || []).filter(r => {
      if (r.employeeId !== emp105.id && String(r.employeeCode) !== '105') return false;
      const isApproved = (r.status === 'approved' || r.adminApproved === true) && !r.isCancelled && r.status !== 'cancelled' && r.status !== 'rejected';
      return isApproved;
    });
    console.log('\\n=== APPROVED REQUESTS FOR MOHAMED ===');
    reqs105.forEach(r => console.log(r.date, r.type, r.subType, 'amt:', r.amount, 'dedMins:', r.deductionMinutes, 'id:', r.id));

    // What does EmployeePortalView compute?
    // Let's check EmployeePortalView deductions for Mohamed
  });
});
`;

fs.writeFileSync('temp_portal_mohamed.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_portal_mohamed.cjs ${host}:/tmp/temp_portal_mohamed.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_portal_mohamed.cjs hr-backend-server:/app/temp_portal_mohamed.cjs; sudo docker exec hr-backend-server node /app/temp_portal_mohamed.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_portal_mohamed.cjs'); } catch {}
}
