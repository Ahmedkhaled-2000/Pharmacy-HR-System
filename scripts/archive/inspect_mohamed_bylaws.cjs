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
    
    // Simulate allPenalties logic from BylawsModule.jsx
    const list = [];
    const seenReqIds = new Set();
    const seenLateKeys = new Set();
    const deletedIdsSet = new Set((state._deletedIds || []).map(String));

    (state.requests || []).forEach((r) => {
      if (!r) return;
      if (r.employeeId !== emp105.id && String(r.employeeCode) !== '105') return;
      if (
        r.type === 'penalty' ||
        r.type === 'early_exit' ||
        r.subType === 'lateness' ||
        (r.type === 'adjustment' && r.subType === 'penalty') ||
        r.type === 'disciplinary_penalty' ||
        r.subType === 'disciplinary_penalty' ||
        r.type === 'violation' ||
        r.ruleTitle
      ) {
        const idStr = String(r.id);
        const cleanId = idStr.replace(/^req_/, '');
        seenReqIds.add(idStr);
        seenReqIds.add(cleanId);
        seenReqIds.add('req_' + cleanId);
        seenReqIds.add('late_inc_' + cleanId.replace(/^late_inc_/, ''));
        seenReqIds.add('req_late_inc_' + cleanId.replace(/^late_inc_/, ''));

        const isLateReq = r.subType === 'lateness' || r.type === 'late_penalty' || idStr.startsWith('req_late_inc_');
        if (isLateReq && r.employeeId && r.date) {
          seenLateKeys.add(r.employeeId + '_' + r.date);
        }

        list.push({
          source: 'request',
          id: r.id,
          date: r.date,
          amount: parseFloat(r.amount) || 0,
          status: r.status,
          title: r.ruleTitle || r.reason
        });
      }
    });

    (state.lateIncidents || []).forEach((inc) => {
      if (!inc) return;
      if (inc.employeeId !== emp105.id && String(inc.employeeCode) !== '105') return;
      if (inc.status === 'cancelled' || inc.isCancelled || inc.actionType === 'grace') return;
      
      const incIdStr = String(inc.id);
      const cleanIncId = incIdStr.replace(/^late_inc_/, '');
      if (
        seenReqIds.has(incIdStr) ||
        seenReqIds.has(cleanIncId) ||
        seenReqIds.has('req_' + incIdStr) ||
        seenReqIds.has('req_late_inc_' + cleanIncId) ||
        (inc.employeeId && inc.date && seenLateKeys.has(inc.employeeId + '_' + inc.date))
      ) {
        console.log('Skipped lateIncident:', inc.id, inc.date, 'because of seenReqIds or seenLateKeys!');
        return;
      }

      list.push({
        source: 'lateIncident',
        id: inc.id,
        date: inc.date,
        amount: parseFloat(inc.penaltyAmount) || 0,
        status: inc.status,
        title: inc.actionLabel
      });
    });

    console.log('\\nFinal allPenalties for Mohamed 105 (count: ' + list.length + '):');
    let totalAmt = 0;
    list.forEach(p => {
      totalAmt += p.amount;
      console.log(p.date, p.source, 'amt:', p.amount, p.status, p.id);
    });
    console.log('Total amount in allPenalties:', totalAmt);

    // Now let's see what lateIncidents for 105 has for 2026-10-11:
    const inc1011 = (state.lateIncidents || []).find(i => i.id.includes('2026-10-11') && (i.employeeId === emp105.id || String(i.employeeCode) === '105'));
    console.log('\\nIncident on 2026-10-11:', inc1011);
  });
});
`;

fs.writeFileSync('temp_check_105.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_check_105.cjs ${host}:/tmp/temp_check_105.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_check_105.cjs hr-backend-server:/app/temp_check_105.cjs; sudo docker exec hr-backend-server node /app/temp_check_105.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_check_105.cjs'); } catch {}
}
