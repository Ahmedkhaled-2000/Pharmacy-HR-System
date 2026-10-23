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

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

async function run() {
  console.log('--- INSPECTING EMPLOYEE 107 ---');
  
  // 1. Raw punches for pin '107'
  const rawPunches = await pool.query(`
    SELECT id, device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, process_notes
    FROM public.biometric_raw_punches
    WHERE device_user_pin = '107' OR employee_name LIKE '%عبد الرحمن حسام%'
    ORDER BY punch_time DESC
    LIMIT 30
  `);
  console.log(`=== RAW PUNCHES (${rawPunches.rows.length}) ===`);
  console.table(rawPunches.rows);

  // 2. Biometric profile
  const profiles = await pool.query(`
    SELECT * FROM public.employee_biometric_profiles
    WHERE device_user_pin = '107' OR employee_name LIKE '%عبد الرحمن حسام%'
  `);
  console.log('=== BIOMETRIC PROFILES ===');
  console.table(profiles.rows);

  // 3. Settings / pharmacy-tracker-data
  const settingsRes = await pool.query(`
    SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'
  `);
  if (settingsRes.rows.length > 0) {
    const data = settingsRes.rows[0].value_data || {};
    const employees = Array.isArray(data.employees) ? data.employees : [];
    const emp = employees.find(e => String(e.code) === '107' || String(e.id) === '107' || (e.name && e.name.includes('عبد الرحمن حسام')));
    console.log('=== EMPLOYEE 107 DATA ===');
    console.log(JSON.stringify(emp, null, 2));

    const branches = Array.isArray(data.branches) ? data.branches : [];
    console.log('=== BRANCHES ===');
    console.table(branches.map(b => ({ id: b.id, name: b.name, code: b.code })));

    const rosters = Array.isArray(data.rosters) ? data.rosters : [];
    const empRosters = rosters.filter(r => 
      String(r.employeeId) === String(emp?.id) || 
      String(r.employeeCode) === '107' || 
      (r.employeeName && r.employeeName.includes('عبد الرحمن حسام'))
    );
    console.log(`=== ROSTERS IN STATE FOR 107 (${empRosters.length}) ===`);
    console.log(JSON.stringify(empRosters, null, 2));

    const shifts = Array.isArray(data.shifts) ? data.shifts : [];
    const empShifts = shifts.filter(s => 
      String(s.employeeId) === String(emp?.id) || 
      String(s.employeeCode) === '107' || 
      (s.employeeName && s.employeeName.includes('عبد الرحمن حسام'))
    );
    console.log(`=== SHIFTS FOR 107 (Total: ${empShifts.length}, showing last 15) ===`);
    console.table(empShifts.slice(-15).map(s => ({
      date: s.date,
      timeIn: s.timeIn,
      timeOut: s.timeOut,
      hours: s.hours,
      scheduledHours: s.scheduledHours,
      scheduledStart: s.scheduledStart,
      scheduledEnd: s.scheduledEnd,
      lateMinutes: s.lateMinutes,
      overtimeHours: s.overtimeHours,
      overtimeMinutes: s.overtimeMinutes,
      status: s.status,
      branchId: s.branchId,
      branchName: s.branchName
    })));
  }

  await pool.end();
}

run().catch(console.error);
