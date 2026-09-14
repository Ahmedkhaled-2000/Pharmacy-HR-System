import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function check() {
  await client.connect();
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('Tables:', tables.rows.map(r => r.table_name));
  
  const settings = await client.query("SELECT key_name, version, updated_at, pg_column_size(value_data) as val_bytes, length(value_data::text) as val_chars FROM app_settings");
  console.log('Settings in DB:', settings.rows);
  
  const reqCount = await client.query("SELECT count(*) FROM requests");
  console.log('Requests count in requests table:', reqCount.rows[0].count);

  try {
    const deltaCount = await client.query("SELECT count(*) FROM request_delta_events");
    console.log('Delta events count:', deltaCount.rows[0].count);
  } catch (e) {
    console.log('No request_delta_events table:', e.message);
  }
  
  await client.end();
}
check().catch(console.error);
