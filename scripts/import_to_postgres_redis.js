/**
 * import_to_postgres_redis.js
 * سكربت استيراد البيانات الحالية والمحفوظة في supabase_extracted_data.json
 * مباشرة إلى خادم PostgreSQL وذاكرة Redis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const pgConfig = {
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres_hr_2026',
};

async function runImport() {
  console.log('========================================================');
  console.log('🚀 بدء استيراد البيانات إلى PostgreSQL + Redis...');
  console.log('========================================================\n');

  const backupFilePath = path.join(__dirname, '..', 'supabase_extracted_data.json');
  if (!fs.existsSync(backupFilePath)) {
    console.error(`❌ لم يتم العثور على ملف النسخ الاحتياطي: ${backupFilePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(backupFilePath, 'utf8');
  const backupData = JSON.parse(raw);

  const db = new Pool(pgConfig);
  let redis = null;

  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
    });
    await redis.connect();
    console.log('⚡ متصل بـ Redis لتحديث الكاش فورياً.');
  } catch (e) {
    console.warn('⚠️ لم يتم الاتصال بـ Redis، سيتم الحفظ في PostgreSQL فقط:', e.message);
    redis = null;
  }

  // 1. استيراد بيانات الإعدادات والحالة (app_settings)
  const appSettings = backupData.app_settings || [];
  if (appSettings.length > 0) {
    console.log(`⏳ جاري استيراد ${appSettings.length} سجل في app_settings...`);
    for (const item of appSettings) {
      const val = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
      const jsonStr = JSON.stringify(val);
      const now = new Date().toISOString();

      await db.query(
        `INSERT INTO public.app_settings (key, value, version, updated_at)
         VALUES ($1, $2::jsonb, 1, $3)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;`,
        [item.key, jsonStr, now]
      );

      if (redis) {
        await redis.set(`hr:settings:${item.key}`, jsonStr, 'EX', 86400 * 7);
        await redis.set(`hr:version:${item.key}`, JSON.stringify({ version: 1, updated_at: now }));
      }

      console.log(`✅ تم استيراد وحفظ "${item.key}" بنجاح في PostgreSQL و Redis.`);
    }
  }

  // 2. استيراد بيانات البصمات الحيوية (employee_faces)
  const employeeFaces = backupData.employee_faces || [];
  if (employeeFaces.length > 0) {
    console.log(`\n⏳ جاري استيراد ${employeeFaces.length} سجل في employee_faces...`);
    for (const face of employeeFaces) {
      await db.query(
        `INSERT INTO public.employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
         ON CONFLICT (employee_id) DO UPDATE
         SET descriptor = EXCLUDED.descriptor, hand_descriptor = EXCLUDED.hand_descriptor, biometric_type = EXCLUDED.biometric_type, updated_at = NOW();`,
        [
          face.employee_id,
          face.descriptor ? JSON.stringify(face.descriptor) : null,
          face.hand_descriptor ? JSON.stringify(face.hand_descriptor) : null,
          face.biometric_type || 'face',
        ]
      );
      console.log(`✅ تم استيراد بصمة الموظف "${face.employee_id}".`);
    }
  }

  if (redis) {
    await redis.quit();
  }
  await db.end();

  console.log('\n========================================================');
  console.log('🎉 اكتمل استيراد جميع البيانات بنجاح إلى PostgreSQL و Redis!');
  console.log('========================================================');
}

runImport().catch((err) => {
  console.error('❌ حدث خطأ أثناء الاستيراد:', err.message);
  process.exit(1);
});
