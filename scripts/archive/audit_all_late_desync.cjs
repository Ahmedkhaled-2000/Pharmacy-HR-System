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
    const employees = state.employees || [];
    const lateIncidents = state.lateIncidents || [];
    const requests = state.requests || [];
    
    console.log('=== AUDITING ALL EMPLOYEES FOR LATE PENALTY DESYNC ===');
    
    employees.forEach(emp => {
      const empId = String(emp.id);
      const empCode = String(emp.code || '');

      const empLates = lateIncidents.filter(i => (String(i.employeeId) === empId || (empCode && String(i.employeeCode) === empCode)));
      const empLateReqs = requests.filter(r => (String(r.employeeId) === empId || (empCode && String(r.employeeCode) === empCode)) && 
        (r.subType === 'lateness' || r.type === 'late_penalty' || String(r.id || '').startsWith('req_late_inc_') || (r.type === 'penalty' && r.subType === 'lateness'))
      );

      // Check discrepancies:
      // 1. Approved requests with amount > 0 where matching incident has amount = 0 or status = grace/cancelled
      // 2. Incident with amount > 0 where matching request has different amount or status = cancelled
      // 3. Request approved but missing from lateIncidents
      // 4. Incident approved with amount > 0 but missing from requests
      
      const issues = [];

      empLateReqs.forEach(r => {
        const rAmt = parseFloat(r.amount) || 0;
        const rMins = parseFloat(r.deductionMinutes) || 0;
        const rDate = r.date;
        const matchingInc = empLates.find(i => i.date === rDate || (r.id && i.id && String(r.id).replace('req_', '') === String(i.id)));
        
        if (r.status === 'approved' && rAmt > 0) {
          if (!matchingInc) {
            issues.push(\`[Req without Inc] date \${rDate}: req approved for \${rAmt} EGP (\${rMins}m) but NO lateIncident exists!\`);
          } else if (matchingInc.status === 'cancelled' || matchingInc.actionType === 'grace' || (parseFloat(matchingInc.penaltyAmount) || 0) === 0) {
            issues.push(\`[Req/Inc Mismatch] date \${rDate}: req approved for \${rAmt} EGP (\${rMins}m), but lateIncident has amt \${matchingInc.penaltyAmount} (\${matchingInc.deductionMinutes}m, action: \${matchingInc.actionType}, status: \${matchingInc.status})\`);
          } else if (Math.abs((parseFloat(matchingInc.penaltyAmount) || 0) - rAmt) > 0.05) {
            issues.push(\`[Amt Diff] date \${rDate}: req has \${rAmt} EGP, but lateIncident has \${matchingInc.penaltyAmount} EGP\`);
          }
        } else if (r.status === 'cancelled' || r.isCancelled) {
          if (matchingInc && matchingInc.status !== 'cancelled' && (parseFloat(matchingInc.penaltyAmount) || 0) > 0) {
            issues.push(\`[Cancelled Req Still Active in Inc] date \${rDate}: req cancelled, but lateIncident still has amt \${matchingInc.penaltyAmount} EGP\`);
          }
        }
      });

      empLates.forEach(i => {
        const iAmt = parseFloat(i.penaltyAmount) || 0;
        const iMins = parseFloat(i.deductionMinutes) || 0;
        if (i.status === 'approved' && iAmt > 0) {
          const matchingReq = empLateReqs.find(r => r.date === i.date || (r.id && i.id && String(r.id).replace('req_', '') === String(i.id)));
          if (!matchingReq) {
            issues.push(\`[Inc without Req] date \${i.date}: lateIncident has \${iAmt} EGP (\${iMins}m), but NO request exists in state.requests\`);
          }
        }
      });

      if (issues.length > 0) {
        console.log(\`\\n>>> Employee \${emp.name} (Code: \${emp.code}, ID: \${emp.id}) has \${issues.length} issue(s):\`);
        issues.forEach(iss => console.log('   *', iss));
      }
    });

    console.log('\\nAudit completed.');
  });
});
`;

fs.writeFileSync('temp_audit_all_lates.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_audit_all_lates.cjs ${host}:/tmp/temp_audit_all_lates.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_audit_all_lates.cjs hr-backend-server:/app/temp_audit_all_lates.cjs; sudo docker exec hr-backend-server node /app/temp_audit_all_lates.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_audit_all_lates.cjs'); } catch {}
}
