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
    const r1 = (state.rosters || []).find(r => r.id === 'roster_req_emp_1789405811945_q0y1k_1791122902041_dzzz');
    console.log('Roster 1 schedule:', JSON.stringify(r1, null, 2));
    
    // Also let's check one shift for Neama and see how workHoursEngine calculates it!
    const shifts1152 = (state.shifts || []).filter(s => s.employeeId === 'emp_1789405811945_q0y1k');
    console.log('Total shifts for Neama:', shifts1152.length);
    console.log('Sample shift:', JSON.stringify(shifts1152[0], null, 2));
  });
});
`;

fs.writeFileSync('temp_r1.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_r1.cjs ${host}:/tmp/temp_r1.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_r1.cjs hr-backend-server:/app/temp_r1.cjs && sudo docker exec hr-backend-server node /app/temp_r1.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_r1.cjs'); } catch {}
}
