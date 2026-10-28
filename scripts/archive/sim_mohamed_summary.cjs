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
    
    // Let's test computeEmpSummary from DataContext.jsx for 105
    // We can simulate computeEmpSummary lines:
    const empAdjs = (state.adjustments || []).filter(a => a.employeeId === emp105.id || String(a.employeeCode) === '105');
    
    // unmappedPenaltyRequests:
    const unmappedPenaltyRequests = (state.requests || []).filter(r => {
      if (!r) return false;
      if (r.employeeId !== emp105.id && String(r.employeeCode) !== '105') return false;
      const isApproved = (r.status === 'approved' || r.adminApproved === true) && !r.isCancelled && r.status !== 'cancelled' && r.status !== 'rejected';
      if (!isApproved) return false;
      if (r.objection && r.objection.status === 'approved') return false;

      const idStr = String(r.id || '');
      const isAttendanceOrLate = (
        idStr.startsWith('req_late_inc_') ||
        idStr.startsWith('req_late_') ||
        idStr.startsWith('late_inc_') ||
        idStr.startsWith('req_early_') ||
        r.type === 'lateness' ||
        r.type === 'late_penalty' ||
        r.type === 'early_exit' ||
        r.subType === 'lateness' ||
        r.subType === 'early_exit' ||
        r.source === 'late_penalty_engine' ||
        r.source === 'system_lateness' ||
        (typeof r.ruleTitle === 'string' && r.ruleTitle.includes('تأخير')) ||
        (typeof r.reason === 'string' && (r.reason.includes('تأخر الموظف') || r.reason.includes('جزاء تأخير')))
      );
      if (isAttendanceOrLate) return false;
      return r.type === 'penalty' || r.type === 'violation' || r.type === 'deduction';
    });

    console.log('Unmapped penalty requests count for 105:', unmappedPenaltyRequests.length);

    // lateIncidents for 105:
    const empLateIncidents = (state.lateIncidents || []).filter(i => {
      if (i.employeeId !== emp105.id && String(i.employeeCode) !== '105') return false;
      if (i.status === 'cancelled') return false;
      return true;
    });

    const lateDeduction = empLateIncidents.reduce((acc, i) => acc + (parseFloat(i.penaltyAmount) || 0), 0);
    console.log('lateDeduction in computeEmpSummary:', lateDeduction);

    // Now let's check what allPenalties in BylawsModule.jsx produces for Mohamed!
    // In BylawsModule.jsx, when filteredPenalties is computed for Mohamed:
    // How is totalFilteredDeduction calculated?
  });
});
`;

fs.writeFileSync('temp_sim_summary.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_sim_summary.cjs ${host}:/tmp/temp_sim_summary.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_sim_summary.cjs hr-backend-server:/app/temp_sim_summary.cjs; sudo docker exec hr-backend-server node /app/temp_sim_summary.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_sim_summary.cjs'); } catch {}
}
