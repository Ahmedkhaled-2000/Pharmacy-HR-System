import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const connectionString = process.env.SUPABASE_POOLER_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  const res = await pool.query('SELECT version, updated_at, pg_column_size(value_data) as col_size, length(value_data::text) as len_chars, value_data FROM public.app_settings WHERE key_name = $1', ['pharmacy-tracker-data']);
  const row = res.rows[0];
  console.log({ version: row.version, updated_at: row.updated_at, col_size: row.col_size, len_chars: row.len_chars });
  const data = row.value_data;
  console.log('Top level keys and sizes in KB:');
  const sizes = [];
  for (const k of Object.keys(data)) {
    const str = JSON.stringify(data[k]);
    const sz = Buffer.byteLength(str, 'utf8');
    sizes.push({
      key: k,
      sizeKB: parseFloat((sz / 1024).toFixed(1)),
      type: Array.isArray(data[k]) ? `array (${data[k].length})` : typeof data[k]
    });
  }
  sizes.sort((a, b) => b.sizeKB - a.sizeKB);
  console.table(sizes);

  // Check if there are still any inline base64 strings
  let base64Count = 0;
  function checkB64(obj) {
    if (!obj) return;
    if (typeof obj === 'string') {
      if (obj.startsWith('data:image') || (obj.length > 500 && /^[A-Za-z0-9+/=]+$/.test(obj.slice(0, 100)))) {
        base64Count++;
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(checkB64);
    } else if (typeof obj === 'object') {
      for (const val of Object.values(obj)) {
        checkB64(val);
      }
    }
  }
  checkB64(data);
  console.log(`Remaining potential base64 strings: ${base64Count}`);

  await pool.end();
}

main().catch(console.error);
