const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';

console.log('1. Dumping state inside container on Old Live VPS (63.183.147.199)...');
const remoteScript = `
const Redis = require('ioredis');
const fs = require('fs');
const r = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
r.get('hr:settings:pharmacy-tracker-data').then(data => {
  fs.writeFileSync('/tmp/full_state.json', data);
  console.log('State written to /tmp/full_state.json in container. Size:', data.length);
  process.exit(0);
});
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const cmd = `ssh -i ${sshKey} ubuntu@63.183.147.199 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\" && sudo docker cp hr-backend-server:/tmp/full_state.json /home/ubuntu/full_state.json"`;
execSync(cmd, { stdio: 'inherit' });

console.log('2. Downloading via SCP...');
execSync(`scp -i ${sshKey} ubuntu@63.183.147.199:/home/ubuntu/full_state.json ./scratch_reconciled_full_state.json`, { stdio: 'inherit' });

const rawState = fs.readFileSync('./scratch_reconciled_full_state.json', 'utf8');
const state = JSON.parse(rawState);
console.log('✅ State successfully parsed.');
console.log('Total employees:', (state.employees || []).length);
console.log('Total shifts:', (state.shifts || []).length);
console.log('Total lateIncidents:', (state.lateIncidents || []).length);

const emp107 = (state.employees || []).find(e => String(e.code) === '107');
const incs107 = (state.lateIncidents || []).filter(i => 
  String(i.employeeId) === String(emp107.id) &&
  i.status !== 'cancelled' &&
  !i.isCancelled &&
  (i.deductionMinutes > 0 || i.penaltyAmount > 0)
);

console.log('✅ Emp 107 active deduction incidents count:', incs107.length);
const totalDedMins = incs107.reduce((s, i) => s + (i.deductionMinutes || 0), 0);
const totalDedAmt = incs107.reduce((s, i) => s + (parseFloat(i.penaltyAmount) || 0), 0);
console.log('✅ Emp 107 total deduction minutes:', totalDedMins);
console.log('✅ Emp 107 total deduction amount:', totalDedAmt.toFixed(2));

if (incs107.length !== 13 || totalDedMins !== 1530) {
  console.error('❌ Mismatch in Emp 107 penalties from Old VPS! Expected 13 incidents and 1530 minutes.');
  process.exit(1);
}

console.log('🎉 State verified perfectly! All 13 incidents and 1530 minutes are intact.');
