const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);
  
  const emp = (state.employees || []).find(e => e.name && e.name.includes('الخضري'));
  console.log('Employee Khodary:', emp ? { id: emp.id, name: emp.name, code: emp.code, branchId: emp.branchId } : 'Not found');
  
  if (emp) {
    const active = state.activeShifts || {};
    console.log('Active shift for Khodary:', active[emp.id] || active[String(emp.id)] || active[emp.code]);
    const shifts = (state.shifts || []).filter(s => String(s.employeeId) === String(emp.id) && s.date >= '2026-10-20');
    console.log('Recent shifts for Khodary:', shifts);
  }

  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
