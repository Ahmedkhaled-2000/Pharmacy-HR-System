const { execSync } = require('child_process');

const script = `
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
});

async function main() {
  const res = await pool.query("SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
  const state = res.rows[0].value_data;
  const emp = (state.employees || []).find(e => String(e.code) === '115');

  // Check pending overtime requests for 115
  const otRequests = (state.requests || []).filter(r => 
    (String(r.employeeId) === String(emp?.id) || String(r.employeeCode) === '115') &&
    r.type === 'overtime'
  );
  console.log('OT Requests for 115:', JSON.stringify(otRequests, null, 2));

  // Also check if any shift has pending overtime
  const shiftsWithPendingOt = (state.shifts || []).filter(s =>
    (String(s.employeeId) === String(emp?.id) || String(s.employeeCode) === '115') &&
    (s.overtimeStatus === 'pending' || s.hasPendingOvertime || (s.overtimeHours > 0 && s.overtimeStatus !== 'approved' && s.overtimeStatus !== 'rejected'))
  );
  console.log('Shifts with pending OT:', shiftsWithPendingOt.map(s => ({
    id: s.id, date: s.date, hours: s.hours, overtimeHours: s.overtimeHours, overtimeStatus: s.overtimeStatus
  })));

  await pool.end();
}

main().catch(console.error);
`;

const b64 = Buffer.from(script, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-backend-server node -`;

const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
