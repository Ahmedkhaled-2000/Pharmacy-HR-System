const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');
  const emp = (state.employees || []).find(e => String(e.code) === '107');

  console.log('=== EMP ID:', emp.id, 'Code:', emp.code);

  const shifts = (state.shifts || []).filter(s => s && (String(s.employeeId) === String(emp.id) || String(s.employeeCode) === '107'));
  console.log('Shifts:');
  shifts.forEach(s => {
    if (['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'].includes(s.date)) {
      console.log('  Date:', s.date, 'in:', s.timeIn, 'out:', s.timeOut, 'shiftId:', s.id, 'branchId:', s.branchId);
    }
  });

  const lateIncs = (state.lateIncidents || []).filter(i => i && (String(i.employeeId) === String(emp.id) || String(i.employeeCode) === '107'));
  console.log('Existing lateIncidents:');
  lateIncs.forEach(i => {
    console.log('  Inc:', i.id, i.date, 'lateMin:', i.lateMinutes, 'dedMin:', i.deductionMinutes, 'amt:', i.penaltyAmount, 'status:', i.status, 'empId:', i.employeeId);
  });

  process.exit(0);
}
main();
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
console.log(execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString());
