const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';

const runner = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const s = JSON.parse(raw);
  const incs = (s.lateIncidents || []).filter(i => i.employeeId === 'emp_1789231413527' || String(i.employeeCode) === '107');
  console.log('Total lateIncidents for Emp 107 in Redis:', incs.length);
  console.table(incs.map(i => ({
    id: i.id,
    date: i.date,
    branch: i.branchName || i.branchId,
    sched: i.scheduledStartTime,
    actual: i.actualPunchInTime,
    lateM: i.lateMinutes,
    deductM: i.deductionMinutes,
    amt: i.penaltyAmount,
    occ: i.occurrenceNumber,
    status: i.status,
    cancelled: i.status === 'cancelled' || i.isCancelled
  })));
  redis.disconnect();
}
run();
`;

fs.writeFileSync('scratch_check_redis_incs.cjs', runner, 'utf8');

const targets = [
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' },
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199', userHome: '/home/ubuntu' }
];

for (const target of targets) {
  console.log(`=== ${target.name} ===`);
  try {
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_check_redis_incs.cjs ${target.host}:${target.userHome}/check_incs.cjs`, { stdio: 'inherit' });
    const shCmd = [
      `sudo docker cp ${target.userHome}/check_incs.cjs hr-backend-server:/app/check_incs.cjs`,
      `sudo docker exec -w /app hr-backend-server node /app/check_incs.cjs`,
      `sudo docker exec -w /app hr-backend-server rm -f /app/check_incs.cjs`,
      `rm -f ${target.userHome}/check_incs.cjs`
    ].join(' && ');
    console.log(execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' }));
  } catch(e) {
    console.error(e.message);
  }
}

fs.unlinkSync('scratch_check_redis_incs.cjs');
