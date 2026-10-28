const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const emp = (state.employees || []).find(e => String(e.code) === '107' || (e.name && e.name.includes('عبد الرحمن')));
  console.log('=== EMP 107 BASIC INFO ===');
  console.log('ID:', emp?.id);
  console.log('Name:', emp?.name);
  console.log('Code:', emp?.code);
  console.log('Branch ID:', emp?.branchId);
  console.log('Branches Details:');
  console.log(JSON.stringify(emp?.branchesDetails, null, 2));

  console.log('\\n=== EMP 107 SHIFTS COUNT ===');
  const shifts = (state.shifts || []).filter(s => s && (String(s.employeeId) === String(emp?.id) || String(s.employeeCode) === '107'));
  console.log('Total shifts:', shifts.length);
  shifts.sort((a,b) => (a.date || '').localeCompare(b.date || ''));
  shifts.forEach(s => {
    console.log(\`Shift \${s.date}: in=\${s.timeIn} out=\${s.timeOut} branch=\${s.branchId} sched=\${s.scheduledStart}-\${s.scheduledEnd} lateMin=\${s.lateMinutes || s.latenessMinutes} exempt=\${s.latePenaltyExempt}\`);
  });

  console.log('\\n=== EMP 107 LATE INCIDENTS IN STATE ===');
  const incs = (state.lateIncidents || []).filter(i => i && (String(i.employeeId) === String(emp?.id) || String(i.employeeCode) === '107'));
  console.log('Total lateIncidents:', incs.length);
  incs.forEach(i => {
    console.log(JSON.stringify({
      id: i.id,
      date: i.date,
      branchId: i.branchId,
      branchName: i.branchName,
      scheduledStartTime: i.scheduledStartTime,
      actualPunchInTime: i.actualPunchInTime,
      lateMinutes: i.lateMinutes,
      tierName: i.tierName,
      occurrenceNumber: i.occurrenceNumber,
      actionLabel: i.actionLabel,
      deductionMinutes: i.deductionMinutes,
      penaltyAmount: i.penaltyAmount,
      status: i.status,
      actionType: i.actionType,
      isCancelled: i.isCancelled
    }));
  });

  console.log('\\n=== EMP 107 REQUESTS IN STATE ===');
  const reqs = (state.requests || []).filter(r => r && (String(r.employeeId) === String(emp?.id) || String(r.employeeCode) === '107'));
  console.log('Total requests for 107:', reqs.length);
  reqs.forEach(r => {
    console.log(JSON.stringify({
      id: r.id,
      type: r.type,
      subType: r.subType,
      status: r.status,
      date: r.date,
      ruleTitle: r.ruleTitle,
      amount: r.amount,
      deductionMinutes: r.deductionMinutes
    }));
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString();
  console.log(out);
} catch (e) {
  console.error(e.message);
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
}
