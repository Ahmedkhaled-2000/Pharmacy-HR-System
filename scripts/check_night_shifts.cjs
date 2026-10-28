const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);
  
  const targetIds = [
    'emp_1789384253233_zwo6b',
    'emp_1789231088793',
    'emp_1789240369018',
    'emp_1789231533592',
    'emp_1789328807202_aogrm',
    'emp_1789244412592',
    'emp_1789231413527'
  ];

  console.log('=== SHIFTS FOR 2026-10-20 FOR NIGHT SHIFTS ===');
  (state.shifts || []).filter(s => targetIds.includes(String(s.employeeId)) && (s.date === '2026-10-20' || s.date === '2026-10-21')).forEach(s => {
    console.log(s.id, s.date, s.employeeCode, s.employeeName, s.timeIn, s.timeOut, s.hours);
  });

  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
