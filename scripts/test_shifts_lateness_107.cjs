const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const empId = 'emp_1789231413527';
  const emp = (state.employees || []).find(e => e.id === empId || e.code === '107');

  // Let's import latePenaltyEngine
  // We can write the test function importing src/utils/latePenaltyEngine.js or simulating it:
  
  // Shifts for 107:
  const shifts = (state.shifts || [])
    .filter(s => s.employeeId === empId || s.employeeCode === '107')
    .sort((a,b) => (a.date === b.date ? (a.timeIn || '').localeCompare(b.timeIn || '') : a.date.localeCompare(b.date)));

  console.log('Shifts count for 107:', shifts.length);

  // For each shift, check scheduled shift and diffMinutes
  shifts.forEach(s => {
    // Scheduled start for Komi branch (18:00)
    // Check late minutes
    if (s.timeIn) {
      const [inH, inM] = s.timeIn.split(':').map(Number);
      const scheduledStart = s.scheduledStart || '18:00';
      const [sH, sM] = scheduledStart.split(':').map(Number);
      const diff = (inH * 60 + inM) - (sH * 60 + sM);
      console.log('Date:', s.date, 'timeIn:', s.timeIn, 'schedStart:', scheduledStart, 'lateMinutes:', diff, 'branch:', s.branchName);
    }
  });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
