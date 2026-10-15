import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = pg;
const useSsl = process.env.DB_SSL === 'true';

const connectionString = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL ||
  (process.env.DB_HOST ? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASS || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 5000}/${process.env.DB_NAME || 'postgres'}${useSsl ? '?sslmode=require' : ''}` : null);

console.log('Connecting to:', connectionString ? connectionString.replace(/:[^:@]+@/, ':****@') : 'No connection string');

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

async function run() {
  console.log('Connecting to database...');
  
  // 1. Raw punches
  const rawPunches = await pool.query(`
    SELECT id, device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, process_notes
    FROM public.biometric_raw_punches
    WHERE device_user_pin = '115' OR employee_name LIKE '%على شعبان%'
    ORDER BY punch_time DESC
    LIMIT 25
  `);
  console.log('=== RAW PUNCHES ===');
  console.table(rawPunches.rows);

  // 2. Employee profile
  const profiles = await pool.query(`
    SELECT * FROM public.employee_biometric_profiles
    WHERE device_user_pin = '115' OR employee_id LIKE '%115%'
  `);
  console.log('=== BIOMETRIC PROFILES ===');
  console.table(profiles.rows);

  // 3. Settings / shifts
  const settingsRes = await pool.query(`
    SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'
  `);
  if (settingsRes.rows.length > 0) {
    const data = settingsRes.rows[0].value_data || {};
    const shifts = Array.isArray(data.shifts) ? data.shifts : [];
    const empShifts = shifts.filter(s => 
      String(s.employeeCode) === '115' || 
      String(s.employeeId) === '115' || 
      (s.employeeName && s.employeeName.includes('على شعبان'))
    );
    console.log(`=== EMPLOYEE SHIFTS (${empShifts.length} found) ===`);
    console.table(empShifts.slice(-15).map(s => ({
      date: s.date,
      timeIn: s.timeIn,
      timeOut: s.timeOut,
      hours: s.hours,
      status: s.status,
      branchId: s.branchId,
      branchName: s.branchName,
      isLiveActive: s.isLiveActive,
      notes: s.notes
    })));

    // Active shifts object
    const activeShifts = data.activeShifts || {};
    console.log('=== ACTIVE SHIFTS KEYS ===', Object.keys(activeShifts));
    for (const [k, v] of Object.entries(activeShifts)) {
      if (k.includes('115') || (v?.name && v.name.includes('على شعبان'))) {
        console.log('MATCHED ACTIVE SHIFT:', k, v);
      }
    }

    // Employees object
    const employees = Array.isArray(data.employees) ? data.employees : [];
    const emp = employees.find(e => String(e.code) === '115' || String(e.id) === '115' || (e.name && e.name.includes('على شعبان')));
    console.log('=== EMPLOYEE DATA ===', emp ? { id: emp.id, name: emp.name, code: emp.code, branchId: emp.branchId, branch: emp.branch, workHours: emp.workHours, shift: emp.shift } : 'NOT FOUND');
  }

  await pool.end();
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
