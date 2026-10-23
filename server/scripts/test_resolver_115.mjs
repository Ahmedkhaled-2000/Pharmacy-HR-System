import { Pool } from 'pg';
import { getEmployeeScheduledDayDetails, resolveOvernightOperationalDate } from '../biometric-manager.js';

const pool = new Pool({
  connectionString: 'postgres://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
    const state = res.rows[0].value_data;
    const emp = (state.employees || []).find(e => String(e.code) === '115');

    const sched15 = getEmployeeScheduledDayDetails(emp, '2026-10-15', state);
    console.log('Sched 2026-10-15:', sched15);

    const sched16 = getEmployeeScheduledDayDetails(emp, '2026-10-16', state);
    console.log('Sched 2026-10-16:', sched16);

    const overnightRes = resolveOvernightOperationalDate({
      empObj: emp,
      datePart: '2026-10-15',
      timePart: '23:57',
      stateData: state,
      currentShifts: state.shifts || []
    });
    console.log('OvernightRes for 2026-10-15 23:57:', overnightRes);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
