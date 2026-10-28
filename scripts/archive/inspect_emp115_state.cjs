const { execSync } = require('child_process');

const script = `
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
});

async function main() {
  const res = await pool.query("SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
  const state = res.rows[0].value_data;
  const emp = (state.employees || []).find(e => String(e.code) === '115' || String(e.id) === '115' || (e.name && e.name.includes('على شعبان')));
  
  console.log('Employee:', {
    id: emp?.id,
    code: emp?.code,
    name: emp?.name,
    branch: emp?.branch,
    branchId: emp?.branchId,
    roster: emp?.roster
  });

  const rosters = (state.rosters || []).filter(r => String(r.employeeId) === String(emp.id) || String(r.employeeCode) === '115');
  console.log('Approved Rosters:', JSON.stringify(rosters, null, 2));

  const shifts = (state.shifts || []).filter(s => String(s.employeeId) === String(emp.id) || String(s.employeeCode) === '115' || (s.employeeName && s.employeeName.includes('على شعبان')));
  const octShifts = shifts.filter(s => s.date && s.date.startsWith('2026-10'));
  console.log('October Shifts count:', octShifts.length);
  octShifts.sort((a,b) => b.date.localeCompare(a.date));
  console.log('October Shifts:', JSON.stringify(octShifts.slice(0, 10), null, 2));

  await pool.end();
}

main().catch(console.error);
`;

const b64 = Buffer.from(script, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-backend-server node -`;

const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
