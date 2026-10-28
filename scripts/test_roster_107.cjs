const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const empId = 'emp_1789231413527';
  const medinaBranchId = 'branch_1789241578010';
  const komiBranchId = 'branch_1789142992139';

  // Let's inspect getResolvedEmployeeRoster candidates when targetBranchId = medinaBranchId
  const employee = (state.employees || []).find(e => e.id === empId);
  const targetBIdStr = medinaBranchId;
  const targetBObj = (state.branches || []).find(b => String(b.id) === targetBIdStr);

  const rosters = state.rosters || [];
  console.log('Testing candidates for Medina:');
  const candidates = [];
  rosters.forEach((r) => {
    const itemEmpId = String(r.employeeId || r.empId || r.id || '').trim();
    const itemEmpCode = String(r.employeeCode || r.empCode || r.code || '').trim();
    const matches = (itemEmpId === empId || itemEmpCode === '107');
    if (!matches) return;
    if (r.status === 'rejected' || r.status === 'draft') return;
    
    // Check branchMatches
    let bMatches = false;
    const itemBStr = String(r.branchId || '').trim();
    if (itemBStr.toLowerCase() === targetBIdStr.toLowerCase()) bMatches = true;
    if (targetBObj && (itemBStr === String(targetBObj.id) || itemBStr.toLowerCase() === String(targetBObj.branchCode).toLowerCase())) bMatches = true;
    
    console.log('Roster:', r.id, 'branchId:', r.branchId, 'month:', r.month, 'status:', r.status, 'bMatches:', bMatches);
  });

  // What is the primary branch of emp 107?
  console.log('emp.branch:', employee.branch, 'emp.branchId:', employee.branchId);
  console.log('emp.branchesDetails:', (employee.branchesDetails || []).map(b => ({ branchId: b.branchId, branchName: b.branchName })));

  // Now let's test EmployeeBranchesDetails:
  console.log('branchesDetails[1] (Medina) has schedule?', !!employee.branchesDetails?.[1]?.schedule);
  console.log('branchesDetails[0] (Komi) has schedule?', !!employee.branchesDetails?.[0]?.schedule);

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
