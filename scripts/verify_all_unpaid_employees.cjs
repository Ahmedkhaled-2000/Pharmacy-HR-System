const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

redis.get('hr:settings:pharmacy-tracker-data').then(data => {
  const state = JSON.parse(data);
  const requests = state.requests || [];
  const employees = state.employees || [];

  // Filter approved unpaid leaves
  const unpaidReqs = requests.filter(r => 
    (r.type === 'unpaid_leave' || r.type === 'leave' || r.leaveType === 'unpaid' || r.isUnpaid === true) &&
    (r.leaveType === 'unpaid' || r.type === 'unpaid_leave' || r.isUnpaid === true) &&
    (r.status === 'approved' || r.adminApproved === true)
  );

  const empMap = {};
  unpaidReqs.forEach(r => {
    const empId = String(r.employeeId);
    if (!empMap[empId]) empMap[empId] = [];
    empMap[empId].push(r);
  });

  console.log('--- AFFECTED EMPLOYEES AUDIT ---');
  Object.keys(empMap).forEach(empId => {
    const emp = employees.find(e => String(e.id) === String(empId));
    const name = emp ? emp.name : 'Unknown';
    const code = emp ? emp.code : empId;
    const baseSalary = parseFloat(emp?.baseSalary || 0);
    const workDays = parseFloat(emp?.workDaysPerMonth || 26);
    const workHoursPerDay = parseFloat(emp?.workHoursPerDay || 8);
    const dailyRate = workDays > 0 ? (baseSalary / workDays) : 0;
    const hourlyRate = (workDays > 0 && workHoursPerDay > 0) ? (baseSalary / (workDays * workHoursPerDay)) : 0;

    const leaves = empMap[empId];
    const leaveDates = leaves.map(l => l.date || (l.startDate + ' to ' + l.endDate));

    console.log(\`Employee: \${name} (Code: \${code}, ID: \${empId})\`);
    console.log(\`  Base Salary: \${baseSalary.toFixed(2)} EGP, Daily Rate: \${dailyRate.toFixed(2)} EGP, Hourly Rate: \${hourlyRate.toFixed(2)} EGP\`);
    console.log(\`  Unpaid Leaves Count: \${leaves.length} records -> \${leaveDates.join(', ')}\`);
    console.log(\`  Rule Applied: Deduction = 0.00 EGP (Only hours/earnings for the day are not counted/0 hours)\`);
    console.log('----------------------------------------------------');
  });

  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
