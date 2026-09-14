import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function checkReqs() {
  await client.connect();
  const res = await client.query("SELECT id, request_type, employee_name, status, created_at FROM requests ORDER BY created_at DESC LIMIT 10");
  console.log('Recent requests in DB:');
  console.table(res.rows);

  const changes = await client.query("SELECT sequence, entity_id, operation, timestamp FROM change_log ORDER BY sequence DESC LIMIT 10");
  console.log('\nRecent changes in change_log:');
  console.table(changes.rows);

  await client.end();
}
checkReqs().catch(console.error);
