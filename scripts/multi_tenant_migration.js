/**
 * multi_tenant_migration.js
 * سكربت الترحيل والنسخ الاحتياطي الهندسي الآمن لمنظومة الاشتراكات السحابية وبوابة المطور
 * 1. يأخذ نسخة احتياطية فورية كاملة لبيانات المنظومة الحالية ويحفظها في ملف وزرعها في جدول دائم.
 * 2. ينشئ الجداول المركزية لإدارة الشركات، الاشتراكات، أكواد الخصم متعددة الشهور، الأعطال، والمصروفات.
 * 3. يسجل الشركة الحالية كشركة أساسية باشتراك مجاني دائم غير منتهي (LIFETIME_FREE).
 * 4. يغذي كتالوج موديولات النظام وأسعارها وترابطها البرمجي.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const { Pool } = pg;

const pgConfig = {
  host: process.env.DB_HOST || '63.183.147.199',
  port: parseInt(process.env.DB_PORT || '5000', 10),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres_hr_2026_super_secure',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(pgConfig);

async function runMigration() {
  console.log('🚀 [Migration] بدء الاتصال بقاعدة البيانات وتنفيذ الترحيل الآمن...');
  const client = await pool.connect();

  try {
    // ── 1. النسخ الاحتياطي الفوري الآمن للحالة الحالية ─────────────────────────
    console.log('📦 [1/5] جلب وفحص بيانات المنظومة الحالية لأخذ نسخة احتياطية...');
    const currentRes = await client.query("SELECT key_name, value_data, version, updated_at FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data' LIMIT 1");
    
    let currentState = null;
    let currentVersion = 1;
    if (currentRes.rows.length > 0) {
      currentState = currentRes.rows[0].value_data;
      currentVersion = currentRes.rows[0].version;
      const backupTimestamp = Date.now();
      const backupFileName = `pharmacy_data_backup_pre_saas_${backupTimestamp}.json`;
      const backupFilePath = path.join(ROOT_DIR, backupFileName);
      fs.writeFileSync(backupFilePath, JSON.stringify(currentState, null, 2), 'utf8');
      console.log(`✅ [1/5] تم حفظ ملف النسخة الاحتياطية بنجاح: ${backupFileName}`);
    } else {
      console.log('ℹ️ [1/5] لم يتم العثور على سجل pharmacy-tracker-data مسبق، سيتم إنشاء الهيكل النظيف.');
    }

    // ── 2. إنشاء جدول النسخ الاحتياطية الدائمة ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.system_initial_backup (
          id SERIAL PRIMARY KEY,
          key_name VARCHAR(191) NOT NULL,
          value_data JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          backed_up_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    if (currentState) {
      await client.query(`
        INSERT INTO public.system_initial_backup (key_name, value_data, version)
        VALUES ('pharmacy-tracker-data', $1, $2)
      `, [JSON.stringify(currentState), currentVersion]);
      console.log('🛡️ [2/5] تم تثبيت النسخة الاحتياطية داخل جدول system_initial_backup في قاعدة البيانات.');
    }

    // ── 3. إنشاء الجداول المركزية لمنظومة الـ SaaS ──────────────────────────────
    console.log('🏗️ [3/5] إنشاء جداول منصة الـ SaaS متعددة الشركات...');
    await client.query(`
      -- جدول الشركات والمشتركين مع تتبع الخصم الممتد
      CREATE TABLE IF NOT EXISTS public.system_companies (
          id VARCHAR(50) PRIMARY KEY,
          company_name VARCHAR(255) NOT NULL,
          company_code VARCHAR(50) UNIQUE NOT NULL,
          phone VARCHAR(50) NOT NULL,
          email VARCHAR(150) NULL,
          owner_name VARCHAR(150) NOT NULL,
          owner_username VARCHAR(100) UNIQUE NOT NULL,
          owner_password_hash VARCHAR(255) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'grace_period', 'suspended', 'maintenance'
          plan_id VARCHAR(50) NOT NULL,
          enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
          subscription_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          subscription_end TIMESTAMPTZ NOT NULL,
          grace_period_days INTEGER NOT NULL DEFAULT 5,
          storage_key VARCHAR(100) NOT NULL UNIQUE,
          db_schema VARCHAR(100) NOT NULL UNIQUE,
          suspension_reason TEXT NULL,
          custom_admin_suspension_msg TEXT NULL,
          custom_staff_suspension_msg TEXT NULL,
          
          -- حقول الخصم الممتد لعدة أشهر
          applied_discount_code VARCHAR(50) NULL,
          discount_type VARCHAR(20) NULL,
          discount_value NUMERIC(10, 2) DEFAULT 0.00,
          discount_duration_months INTEGER DEFAULT 1,
          discount_months_remaining INTEGER DEFAULT 0,
          discount_start_date TIMESTAMPTZ NULL,
          discount_end_date TIMESTAMPTZ NULL,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sys_comp_code ON public.system_companies(company_code);
      CREATE INDEX IF NOT EXISTS idx_sys_comp_status ON public.system_companies(status);
      CREATE INDEX IF NOT EXISTS idx_sys_comp_owner ON public.system_companies(owner_username);

      -- جدول كتالوج الشاشات والموديولات وأسعارها وترابطها
      CREATE TABLE IF NOT EXISTS public.system_modules_catalog (
          module_id VARCHAR(50) PRIMARY KEY,
          name_ar VARCHAR(150) NOT NULL,
          category VARCHAR(50) NOT NULL,
          price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          required_dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
          description TEXT NULL,
          is_core BOOLEAN NOT NULL DEFAULT false,
          icon VARCHAR(30) NULL
      );

      -- جدول باقات الاشتراكات الجاهزة
      CREATE TABLE IF NOT EXISTS public.system_plans (
          id VARCHAR(50) PRIMARY KEY,
          name_ar VARCHAR(100) NOT NULL,
          description TEXT NULL,
          billing_cycle VARCHAR(30) NOT NULL DEFAULT 'monthly',
          base_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          included_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول أكواد الدعوة والخصومات متعددة الشهور
      CREATE TABLE IF NOT EXISTS public.system_discount_codes (
          id VARCHAR(50) PRIMARY KEY,
          code VARCHAR(50) UNIQUE NOT NULL,
          title VARCHAR(150) NOT NULL,
          discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
          discount_value NUMERIC(10, 2) NOT NULL,
          duration_months INTEGER NOT NULL DEFAULT 1,
          max_uses INTEGER NOT NULL DEFAULT 100,
          used_count INTEGER NOT NULL DEFAULT 0,
          target_company_id VARCHAR(50) NULL,
          notes TEXT NULL,
          expires_at TIMESTAMPTZ NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sys_disc_code ON public.system_discount_codes(code);

      -- جدول فواتير وسجل مدفوعات اشتراكات الشركات
      CREATE TABLE IF NOT EXISTS public.system_invoices (
          id VARCHAR(50) PRIMARY KEY,
          company_id VARCHAR(50) NOT NULL REFERENCES public.system_companies(id) ON DELETE CASCADE,
          invoice_number VARCHAR(50) UNIQUE NOT NULL,
          amount NUMERIC(12, 2) NOT NULL,
          discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          net_amount NUMERIC(12, 2) NOT NULL,
          discount_code VARCHAR(50) NULL,
          discount_month_seq INTEGER NOT NULL DEFAULT 1,
          payment_method VARCHAR(50) NOT NULL,
          payment_proof_url TEXT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'approved',
          period_months INTEGER NOT NULL DEFAULT 1,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sys_inv_comp ON public.system_invoices(company_id);

      -- جدول مصروفات تشغيل المنظومة والمطور (حساب صافي الأرباح P&L)
      CREATE TABLE IF NOT EXISTS public.system_expenses (
          id VARCHAR(50) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(100) NOT NULL,
          amount NUMERIC(12, 2) NOT NULL,
          expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول حالة الصيانة والأعطال الجزئية للشاشات وبيئة المطور Sandbox
      CREATE TABLE IF NOT EXISTS public.system_maintenance_status (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'global_config',
          is_global_outage BOOLEAN NOT NULL DEFAULT false,
          global_outage_message TEXT NULL,
          disabled_screens JSONB NOT NULL DEFAULT '[]'::jsonb,
          screen_messages JSONB NOT NULL DEFAULT '{}'::jsonb,
          developer_sandbox_active BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول تعميمات وإعلانات المطور للشركات (تظهر في شاشات الإدارة العليا فقط)
      CREATE TABLE IF NOT EXISTS public.system_announcements (
          id VARCHAR(50) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          target_company_id VARCHAR(50) NOT NULL DEFAULT 'all',
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول بيانات وتكوين مطور النظام
      CREATE TABLE IF NOT EXISTS public.system_developer_config (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'developer_master',
          username VARCHAR(100) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(50) NULL,
          email VARCHAR(150) NULL,
          whatsapp_server_url TEXT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ [3/5] تم إنشاء كافة الجداول المركزية بنجاح.');

    // ── 4. تغذية كتالوج الموديولات والأسعار والترابط ─────────────────────────────
    console.log('🏷️ [4/5] تغذية كتالوج الشاشات والباقات الافتراضية وأكواد الخصم التجريبية...');
    const defaultModules = [
      {
        id: 'dashboard',
        name_ar: 'لوحة القيادة وإدارة الموظفين والورديات',
        category: 'core',
        price_monthly: 150.00,
        required_dependencies: [],
        description: 'الملف الوظيفي، الحضور والانصراف، شفتات العمل، وإحصائيات المنظومة',
        is_core: true,
        icon: '📊'
      },
      {
        id: 'branches',
        name_ar: 'إدارة الفروع ومبيعات الصيدليات',
        category: 'operations',
        price_monthly: 120.00,
        required_dependencies: ['dashboard'],
        description: 'ربط الفروع، شفتات الفروع، ومتابعة مبيعات الصيدليات والتارجت',
        is_core: false,
        icon: '🏢'
      },
      {
        id: 'biometrics',
        name_ar: 'البصمة الحيوية للوجه واليد بالذكاء الاصطناعي والكشك',
        category: 'addons',
        price_monthly: 180.00,
        required_dependencies: ['dashboard'],
        description: 'كشك البصمة الإلكتروني وتدريب بصمة الوجه واليد بالذكاء الاصطناعي',
        is_core: false,
        icon: '📸'
      },
      {
        id: 'payroll',
        name_ar: 'مسير الرواتب المعتمد والمكافآت والخصومات',
        category: 'hr',
        price_monthly: 160.00,
        required_dependencies: ['dashboard'],
        description: 'حساب مفردات الأجور تلقائياً، البدلات، الجزاءات، وقسائم القبض',
        is_core: false,
        icon: '💰'
      },
      {
        id: 'requests',
        name_ar: 'مركز الطلبات والموافقات المزدوجة والاستقالات',
        category: 'hr',
        price_monthly: 110.00,
        required_dependencies: ['dashboard'],
        description: 'اعتماد الإجازات، السلف، الأذونات، مع إشعارات الموافقة',
        is_core: false,
        icon: '📋'
      },
      {
        id: 'bylaws',
        name_ar: 'لائحة العمل والجزاءات التأديبية وعداد التكرار',
        category: 'hr',
        price_monthly: 100.00,
        required_dependencies: ['dashboard', 'payroll'],
        description: 'تطبيق شرائح التأخير وجزاءات المخالفات واحتساب الغرامات آلياً',
        is_core: false,
        icon: '⚖️'
      },
      {
        id: 'accounts',
        name_ar: 'شجرة الحسابات العامة وقيود اليومية (ERP)',
        category: 'finance',
        price_monthly: 220.00,
        required_dependencies: ['dashboard'],
        description: 'النظام المحاسبي المتكامل، مراكز التكلفة، الخزائن، وميزان المراجعة',
        is_core: false,
        icon: '🏛️'
      },
      {
        id: 'income_expenses',
        name_ar: 'المصروفات والإيرادات والتقارير المالية والأرباح',
        category: 'finance',
        price_monthly: 130.00,
        required_dependencies: ['dashboard'],
        description: 'تسجيل المصروفات النقدية والتحليلات المالية وصافي الأرباح',
        is_core: false,
        icon: '📈'
      },
      {
        id: 'pharmacy_archive',
        name_ar: 'أرشيف الفواتير السحابي والذكاء الاصطناعي للموردين',
        category: 'addons',
        price_monthly: 190.00,
        required_dependencies: ['dashboard'],
        description: 'استخراج أصناف الفواتير ومطابقة أسعار الموردين سحابياً',
        is_core: false,
        icon: '🗄️'
      },
      {
        id: 'whatsapp_center',
        name_ar: 'مركز مراسلات الواتساب التلقائي وكشوف الرواتب',
        category: 'addons',
        price_monthly: 140.00,
        required_dependencies: ['dashboard'],
        description: 'إرسال مفردات المرتبات والتنبيهات المباشرة للموظفين عبر الواتساب',
        is_core: false,
        icon: '💬'
      },
      {
        id: 'recruitment',
        name_ar: 'بوابة التوظيف العامة وتقييم المقابلات',
        category: 'hr',
        price_monthly: 90.00,
        required_dependencies: ['dashboard'],
        description: 'استقبال طلبات العمل، فرز السير الذاتية، وتقييم المرشحين',
        is_core: false,
        icon: '🎯'
      }
    ];

    for (const mod of defaultModules) {
      await client.query(`
        INSERT INTO public.system_modules_catalog (module_id, name_ar, category, price_monthly, required_dependencies, description, is_core, icon)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        ON CONFLICT (module_id) DO UPDATE
        SET name_ar = EXCLUDED.name_ar,
            price_monthly = EXCLUDED.price_monthly,
            required_dependencies = EXCLUDED.required_dependencies,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon;
      `, [mod.id, mod.name_ar, mod.category, mod.price_monthly, JSON.stringify(mod.required_dependencies), mod.description, mod.is_core, mod.icon]);
    }

    // إدراج باقات الاشتراكات الجاهزة
    const defaultPlans = [
      {
        id: 'starter',
        name_ar: 'باقة الصيدلية الفردية (Starter)',
        description: 'مناسبة للصيدليات الفردية: الحضور، الورديات، الموظفين، والطلبات',
        billing_cycle: 'monthly',
        base_price: 350.00,
        included_modules: ['dashboard', 'requests', 'payroll', 'income_expenses']
      },
      {
        id: 'pro',
        name_ar: 'باقة السلاسل المتوسطة (Pro Series)',
        description: 'تشمل الفروع، البصمة الحيوية، اللائحة التأديبية، ومركز الواتساب',
        billing_cycle: 'monthly',
        base_price: 650.00,
        included_modules: ['dashboard', 'branches', 'biometrics', 'payroll', 'requests', 'bylaws', 'income_expenses', 'whatsapp_center']
      },
      {
        id: 'enterprise',
        name_ar: 'باقة المنظومة المتكاملة (Enterprise ERP)',
        description: 'كافة شاشات وموديولات النظام بما فيها شجرة الحسابات العامة وأرشيف الفواتير والتوظيف',
        billing_cycle: 'monthly',
        base_price: 1100.00,
        included_modules: defaultModules.map(m => m.id)
      },
      {
        id: 'custom',
        name_ar: 'باقة مخصصة (اختر شاشاتك بنفسك)',
        description: 'حرية كاملة لتحديد الصفحات التي تناسب صيدليتك بسعر مرن وديناميكي',
        billing_cycle: 'monthly',
        base_price: 0.00,
        included_modules: ['dashboard']
      }
    ];

    for (const plan of defaultPlans) {
      await client.query(`
        INSERT INTO public.system_plans (id, name_ar, description, billing_cycle, base_price, included_modules, is_active)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
        ON CONFLICT (id) DO UPDATE
        SET name_ar = EXCLUDED.name_ar,
            description = EXCLUDED.description,
            base_price = EXCLUDED.base_price,
            included_modules = EXCLUDED.included_modules;
      `, [plan.id, plan.name_ar, plan.description, plan.billing_cycle, plan.base_price, JSON.stringify(plan.included_modules)]);
    }

    // إدراج حالة الصيانة الافتراضية
    await client.query(`
      INSERT INTO public.system_maintenance_status (id, is_global_outage, disabled_screens, developer_sandbox_active)
      VALUES ('global_config', false, '[]'::jsonb, true)
      ON CONFLICT (id) DO NOTHING;
    `);

    // إدراج أكواد خصم ترويجية أولية
    await client.query(`
      INSERT INTO public.system_discount_codes (id, code, title, discount_type, discount_value, duration_months, max_uses, notes, expires_at)
      VALUES 
      ('disc_welcome3m', 'PHARMA50', 'عرض انطلاقة الصيدليات (خصم 50% لمدة 3 أشهر)', 'percentage', 50.00, 3, 50, 'عرض ترويجي سارٍ لـ 3 أشهر متتالية عند الاشتراك', NOW() + INTERVAL '90 days'),
      ('disc_free1m', 'STARTFREE', 'شهر مجاني كامل عند بداية الاشتراك', 'percentage', 100.00, 1, 30, 'خصم كامل بنسبة 100% للشهر الأول', NOW() + INTERVAL '60 days'),
      ('disc_fixed200', 'SAVE200', 'خصم نقدي 200 ج.م شهرياً لمدة 6 أشهر', 'fixed', 200.00, 6, 25, 'خصم ثابت 200 جنيه على كل فاتورة تجديد لمدة 6 أشهر', NOW() + INTERVAL '180 days')
      ON CONFLICT (code) DO NOTHING;
    `);

    // إدراج حساب مطور النظام الافتراضي
    await client.query(`
      INSERT INTO public.system_developer_config (id, username, password_hash, phone, email)
      VALUES ('developer_master', 'developer', 'Dev@Master#2026', '01000000000', 'developer@pharmacore.site')
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── 5. تسجيل المنظومة الحالية كـ "الشركة الأساسية الأولى" باشتراك مجاني دائم ─────
    console.log('👑 [5/5] تسجيل المنظومة الحالية كشركة أساسية باشتراك مجاني دائم غير منتهي...');
    const currentOrgName = currentState?.orgSettings?.orgName || 'منظومة الصيدليات الطبية (الفرع الرئيسي)';
    const currentOwnerUser = currentState?.orgSettings?.ownerUsername || 'owner';
    const currentOwnerPass = currentState?.orgSettings?.ownerPassword || 'owner123';

    await client.query(`
      INSERT INTO public.system_companies (
          id, company_name, company_code, phone, email, owner_name, owner_username, owner_password_hash,
          status, plan_id, enabled_modules, subscription_start, subscription_end, grace_period_days,
          storage_key, db_schema, suspension_reason
      )
      VALUES (
          'comp_primary_default',
          $1,
          'MAIN-001',
          '01000000000',
          'primary@pharmacore.site',
          'المالك الأساسي',
          $2,
          $3,
          'active',
          'enterprise',
          $4::jsonb,
          NOW(),
          NOW() + INTERVAL '100 years', -- اشتراك دائم غير منتهي
          30,
          'pharmacy-tracker-data',
          'public',
          NULL
      )
      ON CONFLICT (id) DO UPDATE
      SET company_name = EXCLUDED.company_name,
          owner_username = EXCLUDED.owner_username,
          owner_password_hash = EXCLUDED.owner_password_hash,
          enabled_modules = EXCLUDED.enabled_modules,
          status = 'active';
    `, [currentOrgName, currentOwnerUser, currentOwnerPass, JSON.stringify(defaultModules.map(m => m.id))]);

    console.log('✨ [Success] تم إنجاز الترحيل الهندسي بنجاح 100%! المنظومة الحالية محمية بالكامل وجاهزة لدعم الشركات الجديدة.');
  } catch (err) {
    console.error('❌ [Migration Error]:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
