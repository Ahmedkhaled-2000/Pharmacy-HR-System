import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const res = await pool.query('SELECT value_data FROM public.app_settings WHERE key_name = $1', ['pharmacy-tracker-data']);
  const data = res.rows[0].value_data;

  const found = [];
  function scan(val, path = '') {
    if (!val) return;
    if (typeof val === 'string') {
      if (val.startsWith('data:') || (val.length > 500 && /^[A-Za-z0-9+/=]+$/.test(val.slice(0, 100)))) {
        found.push({ path, length: val.length, preview: val.slice(0, 50) });
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, idx) => scan(item, `${path}[${idx}]`));
    } else if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        scan(v, path ? `${path}.${k}` : k);
      }
    }
  }

  scan(data);
  console.log(`Found ${found.length} large/base64 strings:`);
  console.table(found.slice(0, 50));

  await pool.end();
}

main().catch(console.error);
