const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

function calculateRatesAndSalaries(input = {}) {
  const salaryInput = input?.salaryInput ?? input?.salary ?? input?.baseSalary ?? 0;
  const workHoursPerDay = input?.workHoursPerDay ?? input?.workHours ?? 8;
  const workDaysPerMonth = input?.workDaysPerMonth ?? input?.workDays ?? 26;
  const breakHours = input?.breakHours ?? input?.defaultBreakHours ?? 0;

  const rawSalary = parseFloat(salaryInput) || 0;
  const hours = parseFloat(workHoursPerDay) || 8;
  const days = parseFloat(workDaysPerMonth) || 26;
  const breakH = parseFloat(breakHours) || 0;
  const netHours = Math.max(1, hours - breakH);

  let monthlySalary = 0;
  let dailyRate = 0;
  let hourlyRate = 0;

  if (rawSalary <= 0 || days <= 0 || hours <= 0) {
    return { monthlySalary: 0, dailyRate: 0, hourlyRate: 0, netHours, workHoursPerDay: hours, workDaysPerMonth: days };
  }

  if (rawSalary >= 2000) {
    monthlySalary = rawSalary;
    dailyRate = Math.round((monthlySalary / days) * 100) / 100;
    hourlyRate = Math.round((dailyRate / netHours) * 100) / 100;
  } else if (rawSalary >= 150) {
    monthlySalary = Math.round(rawSalary * hours * 100) / 100;
    dailyRate = Math.round((monthlySalary / days) * 100) / 100;
    hourlyRate = Math.round((dailyRate / netHours) * 100) / 100;
  } else {
    hourlyRate = rawSalary;
    dailyRate = Math.round(hourlyRate * netHours * 100) / 100;
    monthlySalary = Math.round(dailyRate * days * 100) / 100;
  }

  return { monthlySalary, dailyRate, hourlyRate, netHours, workHoursPerDay: hours, workDaysPerMonth: days };
}

redis.get('hr:settings:pharmacy-tracker-data').then(data => {
  const state = JSON.parse(data);
  const emps = state.employees || [];
  
  console.log('AUDIT OF ALL ACTIVE EMPLOYEES HOURLY & DAILY RATES:');
  console.log('==================================================');

  emps.filter(e => e.status !== 'resigned' && e.status !== 'archived').slice(0, 15).forEach(e => {
    const targetBranch = e.branchesDetails?.[0] || {};
    const salary = targetBranch.salary || e.salary || 0;
    const workHours = targetBranch.workHoursPerDay || e.workHoursPerDay || 8;
    const workDays = targetBranch.workDaysPerMonth || e.workDaysPerMonth || 26;
    
    const rates = calculateRatesAndSalaries({
      salaryInput: salary,
      workHoursPerDay: workHours,
      workDaysPerMonth: workDays
    });

    const exampleShiftHours = parseFloat(workHours);
    const dayEarnings = (exampleShiftHours * rates.hourlyRate).toFixed(2);

    console.log(\`[\${e.code || '---'}] \${e.name}\`);
    console.log(\`    Input Salary: \${salary} EGP | WorkHours: \${workHours}h | Days: \${workDays}d\`);
    console.log(\`    Calculated: Hourly Rate = \${rates.hourlyRate.toFixed(2)} EGP/h | Daily Rate = \${rates.dailyRate.toFixed(2)} EGP/d\`);
    console.log(\`    One standard day (\${exampleShiftHours}h) earnings in Table 1 = \${dayEarnings} EGP\`);
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
