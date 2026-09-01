import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const host = process.env.DB_HOST || 'aws-0-eu-west-1.pooler.supabase.com';
const port = parseInt(process.env.DB_PORT || '6543', 10);
const user = process.env.DB_USER || 'postgres.jjosopujlxgkhrragumj';
const password = process.env.DB_PASS || 'cnzrd6YvE0N8tMOa';
const database = process.env.DB_NAME || 'postgres';

const client = new Client({
  host,
  port,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false }
});

async function purge() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL at', host);

    // 1. Truncate all tables
    const tables = [
      'public.archive_invoice_items',
      'public.archive_invoices',
      'public.archive_import_logs',
      'public.archive_column_mappings',
      'public.archive_employees',
      'public.archive_suppliers',
      'public.employee_faces',
      'public.app_settings_backups',
      'public.sync_logs'
    ];

    for (const t of tables) {
      try {
        await client.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE;`);
        console.log('🧹 Truncated:', t);
      } catch (e) {
        console.warn('Truncate error on', t, e.message);
      }
    }

    // 2. Fetch current app_settings
    const getRes = await client.query("SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data'");
    let val = getRes.rows[0]?.value_data || {};
    val.employees = [];
    val.branches = [];
    val.shifts = [];
    val.activeShifts = {};
    val.requests = [];
    val.loans = [];
    val.logs = [];
    val.adjustments = [];
    val.rosters = [];
    val.shiftSwaps = [];
    val.leaveRequests = [];
    val.leaveHistory = [];
    val.resignationRequests = [];
    val.evaluations = [];
    val.employeeNotes = [];
    val._deletedIds = [];
    val.orgSettings = val.orgSettings || {};
    val.orgSettings.sessionInvalidationEpoch = Date.now();

    await client.query(
      "UPDATE app_settings SET value_data = $1::jsonb, version = version + 1000, updated_at = NOW() WHERE key_name = 'pharmacy-tracker-data'",
      [JSON.stringify(val)]
    );
    console.log('✅ app_settings updated with 0 employees and elevated version.');

    const verify = await client.query("SELECT jsonb_array_length(value_data->'employees') as emp_count, version, updated_at FROM app_settings WHERE key_name = 'pharmacy-tracker-data'");
    console.log('Verified Employee Count in Supabase DB:', verify.rows[0]?.emp_count, 'Version:', verify.rows[0]?.version);

  } catch (err) {
    console.error('Purge error:', err);
  } finally {
    await client.end();
  }
}

purge();
