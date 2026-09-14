import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function testLatency() {
  await client.connect();
  console.log('Connected.');

  // Test 1: Fast ping
  const t0 = Date.now();
  await client.query("SELECT 1");
  console.log('Ping latency:', Date.now() - t0, 'ms');

  // Test 2: Fetch version only
  const t1 = Date.now();
  const v = await client.query("SELECT version, updated_at FROM app_settings WHERE key_name = 'pharmacy-tracker-data'");
  console.log('Fetch version latency:', Date.now() - t1, 'ms. Version:', v.rows[0].version);

  // Test 3: Fetch the full 5.4 MB value_data
  const t2 = Date.now();
  const full = await client.query("SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data'");
  console.log('Fetch FULL 5.4MB payload latency:', Date.now() - t2, 'ms. Length:', JSON.stringify(full.rows[0].value_data).length);

  await client.end();
}
testLatency().catch(console.error);
