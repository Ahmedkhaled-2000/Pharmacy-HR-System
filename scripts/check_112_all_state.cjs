const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);
  
  const empId = 'emp_1789240567148';
  for (const [key, val] of Object.entries(state)) {
    if (Array.isArray(val)) {
      const found = val.filter(item => item && (item.employeeId === empId || item.employeeCode === '112'));
      if (found.length > 0) {
        console.log('Found in array state.' + key + ':', found.length, 'items');
        if (key === 'shifts' || key === 'punches' || key === 'requests') {
          found.filter(x => (x.date === '2026-10-21' || x.date === '2026-10-20')).forEach(x => console.log('   ', x.id, x.date, x.timeIn, x.timeOut, x.isLiveActive, x.status));
        }
      }
    } else if (typeof val === 'object' && val !== null) {
      if (val[empId] || val['112']) {
        console.log('Found in object state.' + key + ':', val[empId] || val['112']);
      }
    }
  }

  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
