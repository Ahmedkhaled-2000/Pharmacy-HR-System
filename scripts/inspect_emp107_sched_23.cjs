const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const emp = (state.employees || []).find(e => String(e.code) === '107');
  const komiSched = emp?.branchesDetails?.[0]?.schedule;
  console.log('Komi schedule for 2026-09-23:');
  console.log(JSON.stringify(komiSched?.['2026-09-23'], null, 2));

  console.log('Medina schedule for 2026-09-23:');
  console.log(JSON.stringify(emp?.branchesDetails?.[1]?.schedule?.['2026-09-23'], null, 2));

  // Check rosters
  const rosters23 = (state.rosters || []).filter(r => JSON.stringify(r).includes('107') || JSON.stringify(r).includes(emp.id));
  rosters23.forEach(r => {
    console.log('Roster id:', r.id, 'branchId:', r.branchId, 'month:', r.month, 'sched23:', r.schedule?.['2026-09-23']);
  });

  // Check all shifts for 2026-09-23
  const shifts23 = (state.shifts || []).filter(s => (s.employeeId === emp.id || s.employeeCode === '107') && s.date === '2026-09-23');
  console.log('Shifts on 2026-09-23:', JSON.stringify(shifts23, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString();
  console.log(out);
} catch (e) {
  console.error(e.message);
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
}
