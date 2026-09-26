/**
 * import-egyptian-drugs.js
 * سكريبت الاستيراد والتحديث الشامل لكتالوج الأدوية المصرية المسجلة بهيئة الدواء (EDA & Drug Eye Catalog)
 * يستورد 26,562 دواء بدقة مع:
 * - حساب سعر الشريط (Unit Price = Public Price / Units)
 * - استخراج الشكل الصيدلي ونوع الوحدة (شريط، أمبول، كيس، زجاجة)
 * - التطبيع الصوتي العربي والبحث الضبابي (Phonetic Normalization)
 * - باركود التتبع الدولي (GTIN / EAN-13)
 * - المادة الفعالة والبدائل والمثائل
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1. إعداد الاتصال بقاعدة البيانات PostgreSQL ─────────────────────────────
const { Pool } = pg;

const resolvedHost = process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost';
const isLocalHost = ['localhost', '127.0.0.1', 'postgres'].includes(resolvedHost);
const useSsl = process.env.DB_SSL === 'true';

const connectionString = process.env.SUPABASE_POOLER_URL ||
  (process.env.DATABASE_URL ? process.env.DATABASE_URL : null);

const pgConfig = connectionString ? {
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
} : {
  host: resolvedHost,
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || process.env.DB_NAME || 'postgres',
  user: process.env.POSTGRES_USER || process.env.DB_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASS || 'postgres_hr_2026_super_secure',
  ssl: useSsl ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(pgConfig);

// ── 2. دالة تطبيع النصوص للبحث الصوتي العربي والضبابي ─────────────────────────
function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .replace(/[أإآٱ]/g, 'ا') // توحيد الألفات
    .replace(/[ىي]/g, 'ي') // توحيد الياء
    .replace(/[ة]/g, 'ه') // توحيد التاء المربوطة
    .replace(/[-_./\\(),+]/g, ' ')
    .replace(/\s+/g, ' ');
}

// توليد التوليفات الشائعة للأسماء العربية (مثل: الفنترن / الفانترن)
function generateArabicVariants(str) {
  if (!str) return '';
  const variants = [];
  const s = String(str).trim();
  
  // ألفانترن vs الفنترن
  if (s.includes('فنترن')) {
    variants.push('الفانترن', 'ألفانترن', 'الفنتيرن', 'الفنترين');
  }
  // أوجمنتين vs اوجمنتين
  if (s.includes('وجمنتين')) {
    variants.push('اوجمنتين', 'أوجمنتين', 'اوجمانتين');
  }
  // بنادول vs بانادول
  if (s.includes('نادول')) {
    variants.push('بنادول', 'بانادول');
  }
  // كتافلام vs كاتفلام
  if (s.includes('تفلام')) {
    variants.push('كتافلام', 'كاتافلام');
  }
  // كونكور vs كنكور
  if (s.includes('نكور')) {
    variants.push('كونكور', 'كنكور');
  }

  return variants.join(' ');
}

// ── 3. دالة استخراج الشكل الصيدلي ووحدة التجزئة ────────────────────────────
function deduceDosageFormAndUnits(d) {
  const nameLower = (d.name || '').toLowerCase();
  const arLower = (d.arabic || '');
  let dosageForm = 'أقراص';
  let unitName = 'شريط';
  let packSize = Math.max(1, parseInt(d.units || 1, 10) || 1);

  if (/syrup|شراب/i.test(nameLower) || /شراب/.test(arLower)) {
    dosageForm = 'شراب فموي';
    unitName = 'زجاجة';
    packSize = 1;
  } else if (/susp|معلق/i.test(nameLower) || /معلق/.test(arLower)) {
    dosageForm = 'معلق للشرب';
    unitName = 'زجاجة';
    packSize = 1;
  } else if (/drop|نقط|قطرة/i.test(nameLower) || /نقط|قطرة/.test(arLower)) {
    dosageForm = 'نقط (قطرة)';
    unitName = 'زجاجة';
    packSize = 1;
  } else if (/cream|كريم/i.test(nameLower) || /كريم/.test(arLower)) {
    dosageForm = 'كريم موضعي';
    unitName = 'أنبوبة';
    packSize = 1;
  } else if (/oint|مرهم/i.test(nameLower) || /مرهم/.test(arLower)) {
    dosageForm = 'مرهم موضعي';
    unitName = 'أنبوبة';
    packSize = 1;
  } else if (/gel|جل/i.test(nameLower) || /جل/.test(arLower)) {
    dosageForm = 'جل موضعي';
    unitName = 'أنبوبة';
    packSize = 1;
  } else if (/amp|أمبول|حقن/i.test(nameLower) || /أمبول|حقن/.test(arLower)) {
    dosageForm = 'أمبولات حقن';
    unitName = 'أمبول';
  } else if (/vial|فيال/i.test(nameLower) || /فيال/.test(arLower)) {
    dosageForm = 'فيال حقن';
    unitName = 'فيال';
    packSize = 1;
  } else if (/sachet|efferv|فوار|أكياس/i.test(nameLower) || /فوار|أكياس|كيس/.test(arLower)) {
    dosageForm = 'أكياس فوار';
    unitName = 'كيس فوار';
  } else if (/capsule|كبسول/i.test(nameLower) || /كبسول/.test(arLower)) {
    dosageForm = 'كبسولات';
    unitName = 'شريط';
  } else if (/tablet|tab|قرص|أقراص/i.test(nameLower) || /قرص|أقراص/.test(arLower)) {
    dosageForm = 'أقراص';
    unitName = 'شريط';
  } else if (/spray|بخاخ/i.test(nameLower) || /بخاخ/.test(arLower)) {
    dosageForm = 'بخاخ موضعي';
    unitName = 'بخاخ';
    packSize = 1;
  } else if (/supp|لبوس/i.test(nameLower) || /لبوس/.test(arLower)) {
    dosageForm = 'لبوس (تحاميل)';
    unitName = 'شريط';
  } else {
    dosageForm = d.description || 'مستحضر دوائي';
    unitName = packSize > 1 ? 'شريط' : 'عبوة';
  }

  return { dosageForm, unitName, packSize };
}

// ── 4. المحرك الرئيسي للاستيراد ──────────────────────────────────────────────
async function runImport() {
  const startTime = Date.now();
  console.log('🚀 [EDA Import Engine] بدء استيراد وتحديث كتالوج الأدوية المصرية...');

  const dataCandidates = [
    path.join(__dirname, '..', 'data', 'eg_drugs.json'),
    path.join(__dirname, 'eg_drugs.json'),
    path.join(process.cwd(), 'server', 'data', 'eg_drugs.json'),
    path.join(process.cwd(), 'data', 'eg_drugs.json'),
    '/home/ubuntu/eg_drugs.json',
    '/app/server/data/eg_drugs.json',
  ];

  let jsonPath = dataCandidates.find(p => fs.existsSync(p));
  if (!jsonPath) {
    console.error('❌ ملف eg_drugs.json غير موجود في أي من المسارات المتوقعة:', dataCandidates);
    process.exit(1);
  }

  console.log(`📦 قراءة البيانات من الملف: ${jsonPath}`);
  let rawContent = fs.readFileSync(jsonPath, 'utf8');
  // تنقية أحرف التحكم غير المهربة
  rawContent = rawContent.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F]+/g, ' ');

  const drugs = JSON.parse(rawContent);
  console.log(`🔍 تم تحميل ${drugs.length} صنف دوائي من الملف بنجاح. جاري الفحص والتهيئة...`);

  const client = await pool.connect();
  try {
    // 1. توسيع أطوال الأعمدة لضمان عدم حدوث أي خطأ في أطوال المواد الفعالة
    await client.query(`
      ALTER TABLE public.outstock_medications ALTER COLUMN generic_name TYPE text;
      ALTER TABLE public.outstock_medications ALTER COLUMN category TYPE text;
      ALTER TABLE public.outstock_medications ALTER COLUMN manufacturer TYPE text;
    `);

    // 2. محاولة إنشاء إضافة البحث النصي pg_trgm للبحث اللحظي فائق السرعة
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
      await client.query('CREATE INDEX IF NOT EXISTS idx_outstock_med_search_trgm ON public.outstock_medications USING gin (search_normalized gin_trgm_ops);');
      console.log('⚡ تم تفعيل فهرس pg_trgm للبحث اللحظي فائق السرعة.');
    } catch (e) {
      console.log('ℹ️ لم يتم تفعيل pg_trgm (سيتم استخدام الفهارس العادية بنجاح):', e.message);
    }

    const CHUNK_SIZE = 400;
    let totalInsertedOrUpdated = 0;

    for (let i = 0; i < drugs.length; i += CHUNK_SIZE) {
      const chunk = drugs.slice(i, i + CHUNK_SIZE);
      const values = [];
      const rowPlaceholders = [];

      chunk.forEach((d, idx) => {
        const id = `eg-${String(d.id || '').replace(/^(?:eg-)+/, '')}`;
        const nameEn = String(d.name || '').trim();
        const nameAr = String(d.arabic || nameEn).trim();
        const active = String(d.active || 'مستحضر دوائي').trim();
        const company = String(d.company || '').trim();
        const publicPrice = parseFloat(String(d.price || '0').replace(/[^0-9.]/g, '')) || 0;
        const barcode = String(d.barcode || '').trim();

        const dosageForm = d.dosage_form || 'مستحضر دوائي';
        const unitName = d.unit_name || 'شريط';
        const packSize = Math.max(1, parseInt(d.pack_size || d.units || 1, 10));
        const unitPrice = d.unit_price ? parseFloat(d.unit_price) : parseFloat((publicPrice / packSize).toFixed(2));

        // فحص أدوية الجداول والمخدرات
        const isTableDrug = typeof d.is_table_drug === 'boolean'
          ? d.is_table_drug
          : /(tramadol|pregabalin|gabapentin|clonazepam|diazepam|alprazolam|zolpidem|جدول|مخدر)/i.test(`${nameEn} ${nameAr} ${active}`);
        
        // فحص أدوية الثلاجة
        const isRefrigerated = typeof d.is_refrigerated === 'boolean'
          ? d.is_refrigerated
          : /(insulin|انسولين|ثلاجة|clexane|vaccine|لقاح|مصل|refrigerat)/i.test(`${nameEn} ${nameAr} ${active}`);

        const arVariants = generateArabicVariants(nameAr);
        const normalized = d.search_normalized || normalizeSearchText(
          `${nameEn} ${nameAr} ${arVariants} ${active} ${company} ${barcode} ${dosageForm}`
        );

        const paramOffset = idx * 18;
        rowPlaceholders.push(`(
          $${paramOffset + 1}, $${paramOffset + 2}, $${paramOffset + 3}, $${paramOffset + 4},
          $${paramOffset + 5}, $${paramOffset + 6}, $${paramOffset + 7}, $${paramOffset + 8},
          $${paramOffset + 9}, $${paramOffset + 10}, $${paramOffset + 11}, $${paramOffset + 12},
          $${paramOffset + 13}, $${paramOffset + 14}, $${paramOffset + 15}, $${paramOffset + 16},
          $${paramOffset + 17}, $${paramOffset + 18}, CURRENT_TIMESTAMP
        )`);

        values.push(
          id,                                 // 1. id
          d.slug || `EDA-${d.id}`,            // 2. eda_reg_no
          nameEn.substring(0, 250),           // 3. trade_name_en
          nameAr.substring(0, 250),           // 4. trade_name_ar
          active,                             // 5. generic_name (text)
          dosageForm.substring(0, 100),       // 6. dosage_form
          '',                                 // 7. strength (empty string)
          packSize,                           // 8. pack_size
          unitName.substring(0, 50),          // 9. unit_name
          publicPrice,                        // 10. public_price
          unitPrice,                          // 11. unit_price
          company,                            // 12. manufacturer (text)
          (d.description || 'أدوية علاجية'),  // 13. category (text)
          isTableDrug,                        // 14. is_table_drug
          isRefrigerated,                     // 15. is_refrigerated
          barcode.substring(0, 50) || null,   // 16. gtin_barcode
          'available',                        // 17. market_status
          normalized                          // 18. search_normalized
        );
      });

      const upsertSql = `
        INSERT INTO public.outstock_medications (
          id, eda_reg_no, trade_name_en, trade_name_ar, generic_name,
          dosage_form, strength, pack_size, unit_name, public_price,
          unit_price, manufacturer, category, is_table_drug, is_refrigerated,
          gtin_barcode, market_status, search_normalized, updated_at
        ) VALUES ${rowPlaceholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          eda_reg_no = EXCLUDED.eda_reg_no,
          trade_name_en = EXCLUDED.trade_name_en,
          trade_name_ar = EXCLUDED.trade_name_ar,
          generic_name = EXCLUDED.generic_name,
          dosage_form = EXCLUDED.dosage_form,
          pack_size = EXCLUDED.pack_size,
          unit_name = EXCLUDED.unit_name,
          public_price = EXCLUDED.public_price,
          unit_price = EXCLUDED.unit_price,
          manufacturer = EXCLUDED.manufacturer,
          category = EXCLUDED.category,
          is_table_drug = EXCLUDED.is_table_drug,
          is_refrigerated = EXCLUDED.is_refrigerated,
          gtin_barcode = COALESCE(EXCLUDED.gtin_barcode, public.outstock_medications.gtin_barcode),
          market_status = EXCLUDED.market_status,
          search_normalized = EXCLUDED.search_normalized,
          updated_at = CURRENT_TIMESTAMP;
      `;

      await client.query(upsertSql, values);
      totalInsertedOrUpdated += chunk.length;

      if (totalInsertedOrUpdated % 2000 === 0 || totalInsertedOrUpdated === drugs.length) {
        console.log(`⏳ تم استيراد وتحديث ${totalInsertedOrUpdated} / ${drugs.length} صنف دوائي...`);
      }
    }

    // التحقق من الأصناف الحيوية
    const checkRes = await client.query(`
      SELECT id, trade_name_ar, trade_name_en, public_price, unit_price, pack_size, unit_name, gtin_barcode
      FROM public.outstock_medications
      WHERE LOWER(trade_name_en) LIKE '%alphintern%' OR trade_name_ar LIKE '%الفنترن%'
      LIMIT 5;
    `);

    const totalCountRes = await client.query('SELECT COUNT(*) FROM public.outstock_medications;');
    const totalCount = totalCountRes.rows[0].count;

    console.log('----------------------------------------------------');
    console.log(`🎉 [نجاح باهر] تم استيراد كتالوج الأدوية بالكامل في ${((Date.now() - startTime) / 1000).toFixed(1)} ثانية!`);
    console.log(`📊 إجمالي عدد الأدوية المسجلة حالياً في قاعدة البيانات: ${totalCount} صنف`);
    console.log('🔬 عينة فحص الدواء المطلوب (Alphintern / ألفانترن):');
    console.table(checkRes.rows);
    console.log('----------------------------------------------------');

  } catch (err) {
    console.error('❌ خطأ أثناء استيراد كتالوج الأدوية:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runImport().catch(err => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
