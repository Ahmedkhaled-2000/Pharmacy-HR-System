import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres_hr_2026_super_secure@127.0.0.1:5432/postgres';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const pool = new Pool({ connectionString: dbUrl });
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });

let extractedCount = 0;
let totalBytesSaved = 0;

async function extractBase64Recursive(obj, pathParts = []) {
  if (!obj) return obj;

  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/') || obj.startsWith('data:application/pdf') || (obj.length > 2000 && obj.startsWith('data:'))) {
      const matchMime = obj.match(/^data:([^;]+);base64,/);
      const mimeType = matchMime ? matchMime[1] : 'image/jpeg';
      const cleanPath = pathParts.join('_').replace(/[^a-zA-Z0-9_]/g, '_').slice(-40);
      const attId = `att_${cleanPath}_${crypto.randomBytes(3).toString('hex')}`;
      const size = Buffer.byteLength(obj, 'utf8');

      try {
        await pool.query(`
          INSERT INTO public.app_attachments (id, entity_type, entity_id, field_name, file_data, mime_type, file_size, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE
          SET file_data = EXCLUDED.file_data, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, updated_at = NOW()
        `, [
          attId,
          pathParts[0] || 'auto',
          pathParts[1] || 'item',
          pathParts[pathParts.length - 1] || 'file',
          obj,
          mimeType,
          size
        ]);

        extractedCount++;
        totalBytesSaved += size;
        return `/api/attachments?id=${attId}&raw=1`;
      } catch (err) {
        console.warn(`[Extract Error on ${attId}]:`, err.message);
        return obj;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    const arr = [];
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      const idHint = (item && typeof item === 'object' && (item.id || item.code)) ? (item.id || item.code) : i;
      arr.push(await extractBase64Recursive(item, [...pathParts, String(idHint)]));
    }
    return arr;
  }

  if (typeof obj === 'object') {
    const newObj = {};
    for (const [k, v] of Object.entries(obj)) {
      newObj[k] = await extractBase64Recursive(v, [...pathParts, k]);
    }
    return newObj;
  }

  return obj;
}

async function run() {
  console.log('🚀 بدء فحص وتطهير كائنات الحالة واستخراج الصور...');
  
  try {
    await redis.connect();
    console.log('✅ تم الاتصال بـ Redis');
  } catch (e) {
    console.warn('⚠️ تعذر الاتصال بـ Redis، سيتم المتابعة مع PostgreSQL فقط:', e.message);
  }

  const targetKeys = ['pharmacy-tracker-data', 'pharmacy_data_store', 'hr_pharmacy_data_live'];

  for (const key of targetKeys) {
    console.log(`\n🔍 فحص المفتاح: ${key}...`);
    const res = await pool.query('SELECT value_data, version FROM public.app_settings WHERE key_name = $1', [key]);
    if (res.rows.length === 0) {
      console.log(`⏭️ المفتاح ${key} غير موجود، تخطي.`);
      continue;
    }

    const row = res.rows[0];
    const originalJsonStr = JSON.stringify(row.value_data);
    const originalSizeMB = (originalJsonStr.length / 1024 / 1024).toFixed(2);
    console.log(`📊 الحجم الأصلي: ${originalSizeMB} MB`);

    let data = row.value_data;

    // استخراج المرفقات
    extractedCount = 0;
    totalBytesSaved = 0;
    data = await extractBase64Recursive(data, [key]);

    // تنظيف _deletedIds
    if (data && Array.isArray(data._deletedIds) && data._deletedIds.length > 500) {
      const oldCount = data._deletedIds.length;
      data._deletedIds = data._deletedIds.slice(-500);
      console.log(`🧹 تم تقليص _deletedIds من ${oldCount} إلى 500 عنصر.`);
    }

    const cleanedJsonStr = JSON.stringify(data);
    const cleanedSizeMB = (cleanedJsonStr.length / 1024 / 1024).toFixed(2);
    const savedMB = (totalBytesSaved / 1024 / 1024).toFixed(2);

    console.log(`✨ تم استخراج ${extractedCount} صورة/مرفق بنجاح.`);
    console.log(`📉 الحجم بعد التنظيف: ${cleanedSizeMB} MB (توفير ${savedMB} MB)`);

    // الحفظ في PostgreSQL
    const newVersion = (parseInt(row.version, 10) || 1) + 1;
    await pool.query(`
      UPDATE public.app_settings 
      SET value_data = $1::jsonb, 
          version = $2, 
          updated_at = NOW() 
      WHERE key_name = $3
    `, [cleanedJsonStr, newVersion, key]);
    console.log(`💾 تم حفظ الحالة المحدثة في PostgreSQL بنجاح (الإصدار: ${newVersion}).`);

    // تحديث Redis
    try {
      if (redis.status === 'ready') {
        await redis.set(`hr:settings:${key}`, cleanedJsonStr, 'EX', 86400 * 7);
        await redis.set(`hr:version:${key}`, JSON.stringify({ version: newVersion, updated_at: new Date().toISOString() }));
        console.log(`⚡ تم تحديث كاش Redis للمفتاح ${key}.`);
      }
    } catch (e) {
      console.warn('⚠️ تحذير تحديث Redis:', e.message);
    }
  }

  // تنظيف جداول الـ attachments إن لزم الأمر
  const countAttRes = await pool.query('SELECT count(*), pg_size_pretty(sum(file_size)::bigint) as total_size FROM public.app_attachments');
  console.log(`\n📦 إجمالي المرفقات في app_attachments الآن: ${countAttRes.rows[0].count} ملف (الحجم: ${countAttRes.rows[0].total_size})`);

  console.log('\n✅ اكتملت عملية التطهير واستخراج الصور بنجاح تام!');
  await pool.end();
  redis.disconnect();
}

run().catch((err) => {
  console.error('❌ خطأ فادح أثناء التطهير:', err);
  process.exit(1);
});
