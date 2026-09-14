import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function checkTriggers() {
  await client.connect();
  const res = await client.query(`
    SELECT event_object_table, trigger_name, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
  `);
  console.log('Triggers in public schema:');
  console.table(res.rows);
  await client.end();
}
checkTriggers().catch(console.error);
