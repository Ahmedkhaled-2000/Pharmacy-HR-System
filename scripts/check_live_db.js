import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgres://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
  });

  try {
    await client.connect();
    const res = await client.query("SELECT * FROM public.sync_logs WHERE entity_key LIKE '%113%' OR entity_key LIKE '%1789240708342%' ORDER BY created_at DESC LIMIT 15");
    console.log('Sync logs for Belal:', res.rows);
  } catch (err) {
    console.error('PG Error:', err);
  } finally {
    await client.end();
  }
}

run();
