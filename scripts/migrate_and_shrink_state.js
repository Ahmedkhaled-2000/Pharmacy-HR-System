import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000
});

async function runOptimization(isDryRun = false) {
  await client.connect();
  console.log(`=== STARTING DEEP STATE OPTIMIZATION (DryRun: ${isDryRun}) ===`);

  const res = await client.query("SELECT value_data, version, updated_at FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data' LIMIT 1");
  if (!res.rows.length) {
    console.error('No record found for pharmacy-tracker-data');
    await client.end();
    return;
  }

  const rawData = res.rows[0].value_data;
  const originalSize = JSON.stringify(rawData).length;
  console.log(`Original state size: ${(originalSize / 1024).toFixed(1)} KB (${originalSize} chars)`);

  // Backup to disk
  const backupPath = path.join(process.cwd(), `pharmacy_data_backup_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(rawData, null, 2), 'utf-8');
  console.log(`Safety backup saved to: ${backupPath}`);

  // Create attachments table
  await client.query(`
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
  `);

  const clone = JSON.parse(JSON.stringify(rawData));
  const attachmentsToInsert = [];

  function processDeep(obj, pathParts = []) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      if (obj.startsWith('data:image/') || obj.startsWith('data:application/pdf') || (obj.length > 500 && obj.startsWith('data:'))) {
        const matchMime = obj.match(/^data:([^;]+);base64,/);
        const mimeType = matchMime ? matchMime[1] : 'image/jpeg';
        const cleanPath = pathParts.join('_').replace(/[^a-zA-Z0-9_]/g, '_').slice(-40);
        const attId = `att_${cleanPath}_${Math.random().toString(36).slice(2, 7)}`;

        attachmentsToInsert.push({
          id: attId,
          entity_type: pathParts[0] || 'general',
          entity_id: pathParts[1] || 'item',
          field_name: pathParts[pathParts.length - 1] || 'file',
          file_data: obj,
          mime_type: mimeType,
          file_size: obj.length
        });

        // Use standard universal attachment endpoint with raw=1 for <img> compatibility
        return `https://nodejs-test.apexthunder.com/api/attachments?id=${attId}&raw=1`;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, idx) => {
        const idHint = (item && typeof item === 'object' && (item.id || item.code)) ? (item.id || item.code) : idx;
        return processDeep(item, [...pathParts, String(idHint)]);
      });
    }

    if (typeof obj === 'object') {
      const newObj = {};
      for (const k of Object.keys(obj)) {
        newObj[k] = processDeep(obj[k], [...pathParts, k]);
      }
      return newObj;
    }

    return obj;
  }

  const optimizedState = processDeep(clone);
  const newSize = JSON.stringify(optimizedState).length;

  console.log(`\nExtracted attachments count: ${attachmentsToInsert.length}`);
  console.log(`New state size: ${(newSize / 1024).toFixed(1)} KB (${newSize} chars)`);
  console.log(`Total Size reduction: -${((originalSize - newSize) / 1024).toFixed(1)} KB (-${(((originalSize - newSize) / originalSize) * 100).toFixed(1)}%)`);

  if (!isDryRun && attachmentsToInsert.length > 0) {
    console.log(`\nInserting ${attachmentsToInsert.length} attachments into public.app_attachments in batches...`);
    for (let i = 0; i < attachmentsToInsert.length; i += 5) {
      const batch = attachmentsToInsert.slice(i, i + 5);
      for (const att of batch) {
        await client.query(`
          INSERT INTO public.app_attachments (id, entity_type, entity_id, field_name, file_data, mime_type, file_size, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE
          SET file_data = EXCLUDED.file_data, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, updated_at = NOW()
        `, [att.id, att.entity_type, att.entity_id, att.field_name, att.file_data, att.mime_type, att.file_size]);
      }
    }
    console.log('All attachments inserted successfully into database.');

    // Save shrunk state to app_settings
    console.log('Updating public.app_settings with optimized lightweight payload...');
    await client.query(`
      UPDATE public.app_settings
      SET value_data = $1::jsonb,
          version = version + 1,
          updated_at = NOW()
      WHERE key_name = 'pharmacy-tracker-data'
    `, [JSON.stringify(optimizedState)]);
    console.log('State updated successfully in Supabase PostgreSQL!');

    // Also update server_backup
    try {
      await client.query(`
        INSERT INTO public.app_settings_backups (key_name, value_data, version, client_ip, created_at)
        VALUES ('pharmacy-tracker-data', $1::jsonb, 10575, '127.0.0.1', NOW())
      `, [JSON.stringify(optimizedState)]);
      console.log('Backup record saved in app_settings_backups.');
    } catch (e) {
      console.warn('Backup record warn:', e.message);
    }
  }

  await client.end();
  console.log('=== OPTIMIZATION COMPLETED SUCCESSFULLY ===');
}

const isDry = process.argv.includes('--dry');
runOptimization(isDry).catch(console.error);
