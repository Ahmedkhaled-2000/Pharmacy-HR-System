import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;
const resolvedHost = process.env.DB_HOST || process.env.POSTGRES_HOST || 'aws-0-eu-west-2.pooler.supabase.com';
const isLocalHost = ['localhost', '127.0.0.1', 'postgres'].includes(resolvedHost);
const useSsl = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && !isLocalHost);

const connectionString = process.env.SUPABASE_POOLER_URL ||
  (process.env.DB_HOST ? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASS || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 6543}/${process.env.DB_NAME || 'postgres'}?sslmode=${process.env.DB_SSLMODE || (useSsl ? 'require' : 'disable')}` : null);

const pgConfig = connectionString ? {
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
} : {
  host: resolvedHost,
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '6543', 10),
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'postgres',
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.DB_PASS || process.env.POSTGRES_PASSWORD || '',
  ssl: useSsl ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(pgConfig);

async function run() {
  console.log('Querying app_settings...');
  const res = await pool.query(`SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'`);
  if (!res.rows.length) {
    console.log('No data found in app_settings');
    await pool.end();
    return;
  }
  const data = res.rows[0].value_data || {};
  
  // 1. Employee
  const employees = data.employees || [];
  const emp = employees.find(e => String(e.code) === '113' || (e.name && e.name.includes('بلال')));
  console.log('=== EMPLOYEE 113 FULL ===', JSON.stringify(emp, null, 2));

  // Check how many employees have workHoursPerDay
  const stats = employees.map(e => ({ code: e.code, name: e.name, workHours: e.workHours, workHoursPerDay: e.workHoursPerDay, branch: e.branch }));
  console.log('=== EMPLOYEES SAMPLE ===', stats.slice(0, 10));


  // 2. Shift on 2026-10-15
  const shift15 = (data.shifts || []).find(s => 
    (String(s.employeeCode) === '113' || String(s.employeeId) === String(emp?.id) || (s.employeeName && s.employeeName.includes('بلال'))) &&
    s.date === '2026-10-15'
  );
  console.log('=== SHIFT 2026-10-15 ===', JSON.stringify(shift15, null, 2));

  // 3. Roster for emp 113 on 2026-10-15
  const rosters = data.monthlyRosters || data.roster || [];
  const empRoster = rosters.find(r => 
    (String(r.employeeId) === String(emp?.id) || String(r.employeeCode) === '113') &&
    (r.cycle === '2026-10' || r.month === '2026-10')
  );
  console.log('=== ROSTER 2026-10-15 ===', empRoster?.days ? empRoster.days['2026-10-15'] || empRoster.days['15'] : 'NO ROSTER');

  // 4. Requests for emp 113
  const requests = (data.requests || []).filter(r =>
    String(r.employeeId) === String(emp?.id) || String(r.employeeCode) === '113' || (r.employeeName && r.employeeName.includes('بلال'))
  );
  console.log('=== REQUESTS FOR EMP 113 ===', requests.length);
  requests.forEach(r => {
    console.log(JSON.stringify({
      id: r.id,
      type: r.type,
      status: r.status,
      date: r.date,
      hours: r.hours,
      overtimeHours: r.overtimeHours,
      reason: r.reason,
      createdAt: r.createdAt
    }, null, 2));
  });

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });

