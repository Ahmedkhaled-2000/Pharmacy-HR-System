import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgres://postgres:postgres_hr_2026_super_secure@63.183.147.199:5000/postgres'
  });

  try {
    await client.connect();
    console.log('Connected to PG.');

    // 1. Check raw punches
    const raw = await client.query(`
      SELECT id, device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_name, action_type, process_status, process_notes
      FROM public.biometric_raw_punches 
      WHERE device_user_pin = '102' OR employee_id = 'emp_1789143997322' 
      ORDER BY punch_time DESC 
      LIMIT 30
    `);
    console.log(`\nRaw punches for 102 (${raw.rows.length}):`);
    raw.rows.forEach(r => {
      console.log(`${r.punch_time.toISOString ? r.punch_time.toISOString() : r.punch_time} | State: ${r.raw_punch_state} | Action: ${r.action_type} | Status: ${r.process_status} | Notes: ${r.process_notes}`);
    });

    // 2. Check employee record in employees table or settings
    const empRes = await client.query(`
      SELECT * FROM public.biometric_employees WHERE device_user_pin = '102'
    `);
    console.log('\nBiometric employee:', empRes.rows);

  } catch (err) {
    console.error('PG Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
