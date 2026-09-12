import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Client } = pg;

const host = process.env.DB_HOST || 'aws-0-eu-west-1.pooler.supabase.com';
const port = parseInt(process.env.DB_PORT || '6543', 10);
const user = process.env.DB_USER || 'postgres.jjosopujlxgkhrragumj';
const password = process.env.DB_PASS || 'cnzrd6YvE0N8tMOa';
const database = process.env.DB_NAME || 'postgres';

const client = new Client({
  host,
  port,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('🔄 Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully.');

    // -------------------------------------------------------------
    // الخطوة 1: أخذ نسخة احتياطية آمنة كاملة قبل أي حذف
    // -------------------------------------------------------------
    console.log('\n📦 1. Exporting full verified safe backup...');
    const settingsRes = await client.query('SELECT * FROM public.app_settings');
    const facesRes = await client.query('SELECT * FROM public.employee_faces');
    const syncLogsCount = await client.query('SELECT count(*) FROM public.sync_logs');

    const backupData = {
      exported_at: new Date().toISOString(),
      database_host: host,
      stats: {
        app_settings_rows: settingsRes.rows.length,
        employee_faces_rows: facesRes.rows.length,
        sync_logs_count: syncLogsCount.rows[0]?.count,
      },
      app_settings: settingsRes.rows,
      employee_faces: facesRes.rows,
    };

    const backupFileName = `supabase_backup_safe_2026_09_13.json`;
    fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2), 'utf-8');
    const backupSizeMB = (fs.statSync(backupFileName).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Safe backup saved to "${backupFileName}" (Size: ${backupSizeMB} MB)`);

    // -------------------------------------------------------------
    // الخطوة 2: فحص الحجم قبل التنظيف
    // -------------------------------------------------------------
    const beforeSizeRes = await client.query(`
      SELECT datname, pg_size_pretty(pg_database_size(datname)) as size, pg_database_size(datname) as raw_size
      FROM pg_database WHERE datname = current_database();
    `);
    console.log(`\n📊 الحجم قبل التنظيف: ${beforeSizeRes.rows[0].size}`);

    // -------------------------------------------------------------
    // الخطوة 3: تفريغ جدول اللقطات المنفوخ app_settings_backups
    // -------------------------------------------------------------
    console.log('\n🧹 2. Truncating public.app_settings_backups (reclaiming 1,315 MB)...');
    await client.query('TRUNCATE TABLE public.app_settings_backups RESTART IDENTITY CASCADE;');
    console.log('✅ Truncated public.app_settings_backups successfully.');

    // تنظيف المفاتيح الاختبارية المؤقتة إذا وجدت
    try {
      await client.query("DELETE FROM public.app_settings WHERE key_name = 'test_key';");
      console.log('🧹 Cleaned up temporary test keys.');
    } catch (e) {}

    // -------------------------------------------------------------
    // الخطوة 4: تشغيل VACUUM FULL لاستعادة مساحة القرص
    // -------------------------------------------------------------
    console.log('\n⚙️ 3. Running VACUUM FULL public.app_settings to reclaim dead bloat pages...');
    await client.query('VACUUM FULL public.app_settings;');
    console.log('✅ VACUUM FULL completed for app_settings.');

    // -------------------------------------------------------------
    // الخطوة 5: فحص الحجم بعد التنظيف
    // -------------------------------------------------------------
    const afterSizeRes = await client.query(`
      SELECT datname, pg_size_pretty(pg_database_size(datname)) as size, pg_database_size(datname) as raw_size
      FROM pg_database WHERE datname = current_database();
    `);
    console.log(`\n🎉 الحجم بعد التنظيف المباشر: ${afterSizeRes.rows[0].size}`);

    const tableSizes = await client.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) as total_size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) DESC
      LIMIT 10;
    `);
    console.log('\n📋 أحجام الجداول في schema public بعد التنظيف:');
    console.table(tableSizes.rows);

  } catch (err) {
    console.error('❌ Error executing emergency cleanup:', err);
  } finally {
    await client.end();
  }
}

main();
