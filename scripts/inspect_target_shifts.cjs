const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';

const runnerCode = `
const Redis = require('ioredis');

async function run() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);

  console.log('=== Current activeShifts keys in Redis ===');
  console.log(Object.keys(state.activeShifts || {}));
  console.log(JSON.stringify(state.activeShifts, null, 2));

  const targetCodes = ['104', '102', '14', '108', '116', '121', '115', '107'];
  console.log('=== Shifts for target employees on 2026-10-20 & 2026-10-21 ===');
  const relevantShifts = (state.shifts || []).filter(s => 
    (s.date === '2026-10-20' || s.date === '2026-10-21') &&
    targetCodes.some(c => String(s.employeeCode) === c)
  );
  console.table(relevantShifts.map(s => ({
    id: s.id,
    emp: s.employeeName,
    code: s.employeeCode,
    date: s.date,
    timeIn: s.timeIn,
    timeOut: s.timeOut,
    status: s.status,
    hours: s.hours
  })));

  redis.disconnect();
}

run().catch(console.error);
`;

fs.writeFileSync('scratch_check_target_shifts.cjs', runnerCode, 'utf8');

const target = { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' };
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_check_target_shifts.cjs ${target.host}:${target.userHome}/check_target.cjs`, { stdio: 'inherit' });
const shCmd = [
  `sudo docker cp ${target.userHome}/check_target.cjs hr-backend-server:/app/check_target.cjs`,
  `sudo docker exec -w /app hr-backend-server node /app/check_target.cjs`,
  `sudo docker exec -w /app hr-backend-server rm -f /app/check_target.cjs`,
  `rm -f ${target.userHome}/check_target.cjs`
].join(' && ');
const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' });
console.log(output);
fs.unlinkSync('scratch_check_target_shifts.cjs');
