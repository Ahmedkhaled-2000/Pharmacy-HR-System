const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');
  const emp = (state.employees || []).find(e => String(e.code) === '107');
  
  console.log('=== EMP 107 ROSTERS IN STATE ===');
  const rosters = (state.rosters || []).filter(r => r && (String(r.employeeId) === String(emp?.id) || String(r.employeeCode) === '107'));
  console.log('Rosters count:', rosters.length);
  rosters.forEach(r => {
    console.log('Roster ID:', r.id, 'branchId:', r.branchId, 'month:', r.month, 'status:', r.status);
    ['2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27'].forEach(d => {
      console.log('  ', d, r.schedule ? JSON.stringify(r.schedule[d]) : 'none');
    });
  });

  console.log('=== EMP monthlySchedule on employee object ===');
  if (emp.monthlySchedule) {
    ['2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27'].forEach(d => {
      console.log('  ', d, JSON.stringify(emp.monthlySchedule[d]));
    });
  } else {
    console.log('None');
  }

  console.log('=== EMP branchesDetails schedules ===');
  (emp.branchesDetails || []).forEach(bd => {
    console.log('BranchDetail for branchId:', bd.branchId);
    ['2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27'].forEach(d => {
      console.log('  ', d, bd.schedule ? JSON.stringify(bd.schedule[d]) : 'none');
    });
  });

  process.exit(0);
}
main();
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
console.log(execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString());
