import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data'");
  if (res.rows.length > 0) {
    let state = res.rows[0].value_data;
    if (typeof state === 'string') state = JSON.parse(state);
    const employees = state.employees || [];
    console.log('Total employees in DB:', employees.length);
    employees.slice(0, 10).forEach(e => {
      console.log('Emp:', { id: e.id, code: e.code, name: e.name, username: e.username, password: e.password, status: e.status });
    });
  }
  await client.end();
}
run().catch(console.error);
