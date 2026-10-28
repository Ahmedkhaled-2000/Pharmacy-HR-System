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
    
    // Let's inspect getEmployeeDaySchedule logic
    const emp1152 = (state.employees || []).find(e => String(e.code) === '1152');
    const empId = emp1152.id;
    console.log('Employee 1152:', emp1152.name, empId, 'branch:', emp1152.branchId);

    const rosters = (state.rosters || []).filter(r => r.employeeId === empId);
    console.log('Rosters count:', rosters.length);
    rosters.forEach(r => {
      console.log('Roster id:', r.id, 'branch:', r.branchId, 'status:', r.status, 'fromDate:', r.fromDate, 'toDate:', r.toDate);
      console.log('Roster schedule keys:', Object.keys(r.schedule || {}));
    });

    // Let's test a few dates: 2026-10-01, 2026-10-03, 2026-10-04, 2026-10-06, 2026-10-14, 2026-10-16
    const testDates = ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-14', '2026-10-16'];
    const daysArabic = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    
    testDates.forEach(d => {
      const dt = new Date(d);
      const dayName = daysArabic[dt.getDay()];
      console.log('\\nDate:', d, 'Day:', dayName);
      // Matching roster:
      const matchingRosters = rosters.filter(r => {
        if (r.status !== 'approved') return false;
        if (r.fromDate && d < r.fromDate) return false;
        if (r.toDate && d > r.toDate) return false;
        return true;
      });
      console.log('Matching rosters count:', matchingRosters.length);
      matchingRosters.forEach(mr => {
        console.log('mr schedule[dayName]:', mr.schedule ? mr.schedule[dayName] : 'no schedule');
        console.log('mr schedule[d]:', mr.schedule ? mr.schedule[d] : 'no specific date');
      });
    });
  });
});
`;

fs.writeFileSync('temp_test_neama.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_test_neama.cjs ${host}:/tmp/temp_test_neama.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_test_neama.cjs hr-backend-server:/app/temp_test_neama.cjs && sudo docker exec hr-backend-server node /app/temp_test_neama.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_test_neama.cjs'); } catch {}
}
