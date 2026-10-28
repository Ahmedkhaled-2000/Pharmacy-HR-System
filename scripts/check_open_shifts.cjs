const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);
  
  console.log('=== OPEN SHIFTS IN STATE.SHIFTS ===');
  const open = (state.shifts || []).filter(s => !s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive);
  console.log('Total open shifts count:', open.length);
  open.forEach(s => console.log(s.id, s.date, s.employeeCode, s.employeeName, s.branchName, s.timeIn, s.timeOut));

  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
