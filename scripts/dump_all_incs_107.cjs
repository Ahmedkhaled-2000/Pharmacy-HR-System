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
  console.log('COUNT:', incs.length);
  incs.forEach((i, idx) => {
    console.log(idx + ':', i.date, '|', i.branchName, '| late:', i.lateMinutes, '| deduct:', i.deductionMinutes, '| amt:', i.penaltyAmount, '| status:', i.status, '| occ:', i.occurrenceNumber);
  });
  redis.disconnect();
}
run();
`;

fs.writeFileSync('scratch_dump_incs.cjs', runner, 'utf8');

const targets = [
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' },
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199', userHome: '/home/ubuntu' }
];

for (const target of targets) {
  console.log(`=== ${target.name} ===`);
  try {
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_dump_incs.cjs ${target.host}:${target.userHome}/dump_incs.cjs`, { stdio: 'inherit' });
    const shCmd = [
      `sudo docker cp ${target.userHome}/dump_incs.cjs hr-backend-server:/app/dump_incs.cjs`,
      `sudo docker exec -w /app hr-backend-server node /app/dump_incs.cjs`,
      `sudo docker exec -w /app hr-backend-server rm -f /app/dump_incs.cjs`,
      `rm -f ${target.userHome}/dump_incs.cjs`
    ].join(' && ');
    console.log(execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' }));
  } catch(e) {
    console.error(e.message);
  }
}
fs.unlinkSync('scratch_dump_incs.cjs');
