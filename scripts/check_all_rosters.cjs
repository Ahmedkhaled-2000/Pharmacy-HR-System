const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const rosters = state.rosters || [];
  console.log('Total rosters count:', rosters.length);
  
  const unified = rosters.filter(r => r.isUnifiedMaster || (r.id && r.id.includes('unified')));
  console.log('Unified rosters count:', unified.length);
  unified.forEach(u => console.log('Unified roster:', u.id, u.employeeId, u.employeeName, u.month));

  const multiBranch = rosters.filter(r => r.isMultiBranch || (r.id && r.id.includes('_b_')));
  console.log('Multi-branch split rosters count:', multiBranch.length);
  multiBranch.forEach(m => console.log('Split roster:', m.id, m.employeeId, m.employeeName, m.branchName, m.month));

  // Find all employees who have multiple branches
  const multiEmps = (state.employees || []).filter(e => Array.isArray(e.branchesDetails) && e.branchesDetails.length > 1);
  console.log('\\nAll multi-branch employees count:', multiEmps.length);
  multiEmps.forEach(e => {
    console.log({
      id: e.id,
      code: e.code,
      name: e.name,
      branchesCount: e.branchesDetails.length,
      branches: e.branchesDetails.map(b => ({ id: b.branchId, name: b.branchName, hasSchedule: !!b.schedule }))
    });
  });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
