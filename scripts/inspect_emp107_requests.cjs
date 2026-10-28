const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';

const runner = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const s = JSON.parse(raw);
  
  const reqs = (s.requests || []).filter(r => r.employeeId === 'emp_1789231413527' || String(r.employeeCode) === '107');
  console.log('Total requests for Emp 107:', reqs.length);
  console.table(reqs.map(r => ({
    id: r.id,
    type: r.type,
    date: r.date,
    status: r.status,
    adminApproved: r.adminApproved,
    penaltyId: r.penaltyId
  })));

  const permissions = (s.permissions || []).filter(p => p.employeeId === 'emp_1789231413527' || String(p.employeeCode) === '107');
  console.log('Total permissions for Emp 107 in s.permissions:', permissions.length);

  redis.disconnect();
}
run();
`;

fs.writeFileSync('scratch_check_reqs.cjs', runner, 'utf8');

const targets = [
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' },
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199', userHome: '/home/ubuntu' }
];

for (const target of targets) {
  console.log(`=== ${target.name} ===`);
  try {
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_check_reqs.cjs ${target.host}:${target.userHome}/check_reqs.cjs`, { stdio: 'inherit' });
    const shCmd = [
      `sudo docker cp ${target.userHome}/check_reqs.cjs hr-backend-server:/app/check_reqs.cjs`,
      `sudo docker exec -w /app hr-backend-server node /app/check_reqs.cjs`,
      `sudo docker exec -w /app hr-backend-server rm -f /app/check_reqs.cjs`,
      `rm -f ${target.userHome}/check_reqs.cjs`
    ].join(' && ');
    console.log(execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' }));
  } catch(e) {
    console.error(e.message);
  }
}

fs.unlinkSync('scratch_check_reqs.cjs');
