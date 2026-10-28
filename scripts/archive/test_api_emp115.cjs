const { execSync } = require('child_process');

const testScript = `
const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(raw);
      const payload = data.value || data;
      console.log('API /api/settings OK. Payload keys:', Object.keys(payload));
      const emp = (payload.employees || []).find(e => String(e.code) === '115');
      const shifts = (payload.shifts || []).filter(s => String(s.employeeId) === String(emp?.id) || String(s.employeeCode) === '115');
      const octShifts = shifts.filter(s => s.date && s.date.startsWith('2026-10'));
      console.log('October shifts count for 115:', octShifts.length);

      const s15 = octShifts.find(s => s.date === '2026-10-15');
      const s16 = octShifts.find(s => s.date === '2026-10-16');
      console.log('Shift on 2026-10-15:', s15 ? { id: s15.id, timeIn: s15.timeIn, timeOut: s15.timeOut, hours: s15.hours, ot: s15.overtimeHours, otStatus: s15.overtimeStatus } : 'NONE');
      console.log('Shift on 2026-10-16 (Friday):', s16 ? { id: s16.id, timeIn: s16.timeIn, timeOut: s16.timeOut } : 'NONE (CORRECT - REST DAY)');
    } catch (err) {
      console.error('Parse error:', err.message);
    }
  });
}).on('error', (e) => {
  console.error('HTTP error:', e.message);
});
`;

const b64 = Buffer.from(testScript, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-backend-server node -`;

const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
