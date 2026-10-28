const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);
  
  const empId = 'emp_1789240567148';
  console.log('Active shift for 112:', state.activeShifts?.[empId] || state.activeShifts?.['112']);
  
  const shifts112 = (state.shifts || []).filter(s => String(s.employeeId) === empId && s.date >= '2026-10-15');
  console.log('Recent shifts for 112:', shifts112);

  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
