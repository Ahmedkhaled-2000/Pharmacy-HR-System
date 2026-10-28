const { execSync } = require('child_process');

const remoteCode = `
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
  console.log('Old VPS Emp 107 active deduction count:', incs.length);
  let totalMins = 0;
  let totalAmt = 0;
  incs.forEach((i, idx) => {
    totalMins += (i.deductionMinutes || 0);
    totalAmt += (parseFloat(i.penaltyAmount) || 0);
    console.log((idx+1) + '. ' + i.date + ' | ' + i.branchName + ' | late: ' + i.lateMinutes + 'm | ded: ' + i.deductionMinutes + 'm | amt: ' + i.penaltyAmount + ' | occ: #' + i.occurrenceNumber + ' | ' + i.actionLabel);
  });
  console.log('--- SUMMARY ---');
  console.log('TOTAL MINS:', totalMins, 'TOTAL AMT:', totalAmt.toFixed(2));
  
  const orgActivePenalties = (s.lateIncidents || []).filter(i => i.status !== 'cancelled' && !i.isCancelled && (i.deductionMinutes > 0 || i.penaltyAmount > 0));
  console.log('Total Active Late Penalties in entire organization:', orgActivePenalties.length);
  
  r.disconnect();
  process.exit(0);
});
`;

const b64 = Buffer.from(remoteCode).toString('base64');
console.log(execSync(`ssh -i vps-p-spark-1803.pem ubuntu@63.183.147.199 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`).toString());
