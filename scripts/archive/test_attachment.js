import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function testAttachment() {
  await client.connect();
  const res = await client.query("SELECT id, entity_type, entity_id, field_name, file_size, length(file_data) as len FROM public.app_attachments LIMIT 5");
  console.log('Sample attachments in DB:');
  console.table(res.rows);
  await client.end();
}
testAttachment().catch(console.error);
