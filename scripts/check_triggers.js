import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function checkTriggers() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  await client.connect();
  const fnRes = await client.query(`SELECT proname, prosrc FROM pg_proc WHERE proname LIKE '%request%' OR proname LIKE '%change%'`);
  for (const r of fnRes.rows) {
    console.log(`=== ${r.proname} ===\n`, r.prosrc);
  }
  await client.end();
}
checkTriggers().catch(console.error);
