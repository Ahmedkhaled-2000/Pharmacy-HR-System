import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const dbReqs = await pool.query('SELECT id, request_type, employee_name, status, created_at, updated_at FROM public.requests ORDER BY updated_at DESC LIMIT 15');
  console.log('--- Top 15 from public.requests table ---');
  console.table(dbReqs.rows);

  const stateRes = await pool.query('SELECT value_data FROM public.app_settings WHERE key_name = $1', ['pharmacy-tracker-data']);
  const stateReqs = stateRes.rows[0].value_data.requests || [];
  console.log('\n--- Top 15 from app_settings.requests array ---');
  console.table(stateReqs.slice(0, 15).map(r => ({
    id: r.id,
    type: r.type,
    name: r.employeeName,
    status: r.status,
    adminApproved: r.adminApproved,
    branchApproved: r.branchApproved,
    updated: (r.updatedAt || r.createdAt || '').slice(0, 19)
  })));

  // Count statuses in app_settings
  const statusCounts = {};
  for (const r of stateReqs) {
    const s = r.status || 'undefined';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log('\nStatus counts in app_settings.requests:', statusCounts);

  await pool.end();
}

main().catch(console.error);
