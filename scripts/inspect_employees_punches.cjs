const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';

const runnerCode = `
const Redis = require('ioredis');
const { Pool } = require('pg');

async function run() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);

  console.log('--- Finding employees ---');
  const sabry = (state.employees || []).find(e => e.name && e.name.includes('صبري'));
  const adham = (state.employees || []).find(e => e.name && e.name.includes('ادهم'));

  console.log('Sabry:', sabry ? { id: sabry.id, code: sabry.code, name: sabry.name, branch: sabry.branch } : 'Not found');
  console.log('Adham:', adham ? { id: adham.id, code: adham.code, name: adham.name, branch: adham.branch } : 'Not found');

  if (sabry) {
    const sabryPunches = (state.punches || []).filter(p => p.employeeId === sabry.id || p.employeeCode === sabry.code || (p.employeeName && p.employeeName.includes('صبري')));
    console.log('Sabry punches in state.punches (last 5):', JSON.stringify(sabryPunches.slice(-5), null, 2));
  }

  if (adham) {
    const adhamPunches = (state.punches || []).filter(p => p.employeeId === adham.id || p.employeeCode === adham.code || (p.employeeName && p.employeeName.includes('ادهم')));
    console.log('Adham punches in state.punches (last 5):', JSON.stringify(adhamPunches.slice(-5), null, 2));
  }

  // Check biometric devices registered in state
  console.log('Biometric devices in state:', (state.biometricDevices || []).map(d => ({ name: d.name, ip: d.ip, branch: d.branchName || d.branchId, sn: d.sn || d.serialNumber })));

  redis.disconnect();
}

run().catch(console.error);
`;

fs.writeFileSync('scratch_runner_inspect.cjs', runnerCode, 'utf8');

const targets = [
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' },
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199', userHome: '/home/ubuntu' }
];

for (const target of targets) {
  console.log(`\n====================================================`);
  console.log(`Inspecting on ${target.name}`);
  console.log(`====================================================`);
  try {
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_runner_inspect.cjs ${target.host}:${target.userHome}/runner_inspect.cjs`, { stdio: 'inherit' });
    const shCmd = [
      `sudo docker cp ${target.userHome}/runner_inspect.cjs hr-backend-server:/app/runner_inspect.cjs`,
      `sudo docker exec -w /app hr-backend-server node /app/runner_inspect.cjs`,
      `sudo docker exec -w /app hr-backend-server rm -f /app/runner_inspect.cjs`,
      `rm -f ${target.userHome}/runner_inspect.cjs`
    ].join(' && ');
    const res = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' });
    console.log(res);
  } catch(e) {
    console.error('Error on', target.name, e.message);
  }
}
fs.unlinkSync('scratch_runner_inspect.cjs');
