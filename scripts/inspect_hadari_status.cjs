const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');
  
  const hadariShifts = (state.shifts || []).filter(s => s.employeeCode === '112' || s.employeeId === 'emp_1789240567148');
  console.log('Hadari shifts count:', hadariShifts.length);
  hadariShifts.slice(0, 5).forEach(s => console.log(s.date, s.timeIn, s.timeOut, s.hours, s.branchName));

  console.log('Hadari in activeShifts:', state.activeShifts?.['112'] || state.activeShifts?.['emp_1789240567148']);
  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
