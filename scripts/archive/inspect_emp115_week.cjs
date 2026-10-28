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
  
  console.log('Employee roster schedule:', emp?.roster?.schedule);

  const shifts = (state.shifts || []).filter(s => 
    (String(s.employeeId) === String(emp?.id) || String(s.employeeCode) === '115') &&
    s.date >= '2026-10-12' && s.date <= '2026-10-18'
  );
  shifts.sort((a,b) => a.date.localeCompare(b.date));

  for (const s of shifts) {
    console.log({
      id: s.id,
      date: s.date,
      actualPunchDate: s.actualPunchDate,
      timeIn: s.timeIn,
      timeOut: s.timeOut,
      timeOutDate: s.timeOutDate,
      hours: s.hours,
      overtimeHours: s.overtimeHours,
      overtimeStatus: s.overtimeStatus,
      status: s.status,
      source: s.source,
      punchSource: s.punchSource,
      isLiveActive: s.isLiveActive,
      isOvernight: s.isOvernight,
      isEarlyOvernightIn: s.isEarlyOvernightIn,
      notes: s.notes || s.note
    });
  }

  // Active shifts:
  console.log('Active shifts:', state.activeShifts?.[emp?.id] || state.activeShifts?.['115']);

  await pool.end();
}

main().catch(console.error);
`;

const b64 = Buffer.from(script, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-backend-server node -`;

const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
