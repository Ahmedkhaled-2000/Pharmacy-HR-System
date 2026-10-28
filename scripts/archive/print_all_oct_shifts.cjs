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

  const shifts = (state.shifts || []).filter(s => 
    String(s.employeeId) === String(emp?.id) || String(s.employeeCode) === '115'
  );
  shifts.sort((a,b) => a.date.localeCompare(b.date));

  console.log('Total shifts for 115:', shifts.length);
  shifts.forEach(s => {
    if (s.date >= '2026-10-01') {
      console.log(\`[\${s.id}] Date: \${s.date} | ActualDate: \${s.actualPunchDate} | Time: \${s.timeIn} -> \${s.timeOut} (\${s.timeOutDate}) | Hours: \${s.hours} | OT: \${s.overtimeHours} (\${s.overtimeStatus}) | Source: \${s.source}/\${s.punchSource} | Notes: \${(s.notes || s.note || '').slice(0, 60)}\`);
    }
  });

  await pool.end();
}

main().catch(console.error);
`;

const b64 = Buffer.from(script, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-backend-server node -`;

const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
