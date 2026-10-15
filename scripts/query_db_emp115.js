import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgres://postgres:postgres_hr_2026_super_secure@63.183.147.199:5000/postgres'
  });

  try {
    await client.connect();
    console.log('Connected to PG successfully.');

    const raw = await client.query(`
      SELECT id, device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_name, action_type, process_status, process_notes
      FROM public.biometric_raw_punches 
      WHERE device_user_pin = '115' OR employee_id = 'emp_1789242190413' 
      ORDER BY punch_time DESC 
      LIMIT 25
    `);
    console.log('Raw punches for 115 count:', raw.rows.length);
    raw.rows.forEach(r => {
      console.log(`Punch: ${r.punch_time} | Pin: ${r.device_user_pin} | State: ${r.raw_punch_state} | Action: ${r.action_type} | Status: ${r.process_status} | Notes: ${r.process_notes}`);
    });
  } catch (err) {
    console.error('PG Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
