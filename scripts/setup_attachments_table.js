import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function setupAttachmentsTable() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL.');

  const sql = `
    CREATE TABLE IF NOT EXISTS public.app_attachments (
      id VARCHAR(120) PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100) NOT NULL,
      field_name VARCHAR(50) NOT NULL,
      file_data TEXT NOT NULL,
      mime_type VARCHAR(50) DEFAULT 'image/jpeg',
      file_size INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.app_attachments (entity_type, entity_id);
  `;

  await client.query(sql);
  console.log('Table public.app_attachments verified/created successfully.');

  const countRes = await client.query('SELECT count(*) FROM public.app_attachments');
  console.log('Current attachments count:', countRes.rows[0].count);

  await client.end();
}
setupAttachmentsTable().catch(console.error);
