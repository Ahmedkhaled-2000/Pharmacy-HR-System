const { execSync } = require('child_process');

const remoteCheck = `
const Redis = require('ioredis');
const r = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
r.get('hr:settings:pharmacy-tracker-data').then(raw => {
  const s = JSON.parse(raw);
  const emp = s.employees.find(e => String(e.code) === '107');
  const incs = (s.lateIncidents || []).filter(i => 
    String(i.employeeId) === String(emp.id) &&
    i.status !== 'cancelled' &&
    !i.isCancelled &&
    (i.deductionMinutes > 0 || i.penaltyAmount > 0)
  );
  console.log('Emp 107 active deduction incidents count:', incs.length);
  incs.forEach((i, idx) => {
    console.log(idx+1 + '. ' + i.date + ' | ' + i.branchName + ' | late: ' + i.lateMinutes + 'm | deduct: ' + i.deductionMinutes + 'm | amt: ' + i.penaltyAmount);
  });
  r.disconnect();
  process.exit(0);
});
`;

const b64 = Buffer.from(remoteCheck).toString('base64');

console.log('--- Checking New VPS (169.58.214.20) ---');
try {
  const out1 = execSync(`ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`).toString();
  console.log(out1);
} catch (e) {
  console.error(e.message);
}

console.log('--- Checking Old Live VPS (63.183.147.199) ---');
try {
  const out2 = execSync(`ssh -i vps-p-spark-1803.pem ubuntu@63.183.147.199 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`).toString();
  console.log(out2);
} catch (e) {
  console.error(e.message);
}
