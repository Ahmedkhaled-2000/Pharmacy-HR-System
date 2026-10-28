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
    
    // We can inspect Mohamed's actual shifts between 2026-09-21 and 2026-10-20
    const shifts = (state.shifts || []).filter(s => 
      (s.employeeId === emp105.id || String(s.employeeCode) === '105') && 
      s.date >= '2026-09-21' && s.date <= '2026-10-20'
    ).sort((a,b) => a.date.localeCompare(b.date));

    console.log('Total shifts in cycle 2026-10 for Mohamed:', shifts.length);
    shifts.forEach(s => {
      console.log(s.date, 'timeIn:', s.timeIn, 'schedStart:', s.scheduledStart, 'status:', s.status, s.statusLabel);
    });
  });
});
`;

fs.writeFileSync('temp_mohamed_shifts.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_mohamed_shifts.cjs ${host}:/tmp/temp_mohamed_shifts.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_mohamed_shifts.cjs hr-backend-server:/app/temp_mohamed_shifts.cjs; sudo docker exec hr-backend-server node /app/temp_mohamed_shifts.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_mohamed_shifts.cjs'); } catch {}
}
