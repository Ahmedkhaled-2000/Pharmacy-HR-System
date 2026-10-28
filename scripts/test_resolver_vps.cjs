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

  // Let's import biometric-manager functions
  const bm = await import('/app/server/biometric-manager.js');
  
  const sched15 = bm.getEmployeeScheduledDayDetails(emp, '2026-10-15', state);
  console.log('Sched 2026-10-15 (Thursday):', sched15);

  const sched16 = bm.getEmployeeScheduledDayDetails(emp, '2026-10-16', state);
  console.log('Sched 2026-10-16 (Friday):', sched16);

  const sched17 = bm.getEmployeeScheduledDayDetails(emp, '2026-10-17', state);
  console.log('Sched 2026-10-17 (Saturday):', sched17);

  const overnightRes15 = bm.resolveOvernightOperationalDate({
    empObj: emp,
    datePart: '2026-10-15',
    timePart: '23:57',
    stateData: state,
    currentShifts: state.shifts || []
  });
  console.log('OvernightRes for 2026-10-15 23:57:', overnightRes15);

  const overnightRes17 = bm.resolveOvernightOperationalDate({
    empObj: emp,
    datePart: '2026-10-17',
    timePart: '00:00',
    stateData: state,
    currentShifts: state.shifts || []
  });
  console.log('OvernightRes for 2026-10-17 00:00:', overnightRes17);

  await pool.end();
}

main().catch(console.error);
`;

const b64 = Buffer.from(script, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-backend-server node -`;

const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
