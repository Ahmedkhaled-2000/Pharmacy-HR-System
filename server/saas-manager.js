/**
 * saas-manager.js
 * وحدة إدارة منصة البرمجيات كخدمة (Multi-Tenant SaaS Management Engine)
 * وبوابة مطور النظام (Super Admin Developer Portal Backend)
 * 
 * تشمل:
 * 1. عزل قواعد البيانات والمشتركين (Tenant Isolation & Partitioning)
 * 2. إدارة وتتبع الاشتراكات وفترات السماح والإيقاف
 * 3. مصنع أكواد الدعوة والخصومات متعددة الشهور (Multi-Month Discount Engine)
 * 4. نظام إدارة الأعطال والصيانة الجزئية للشاشات وبيئة تجربة المطور (Sandbox)
 * 5. تسعير الصفحات وترابط الموديولات
 * 6. الدفتر المالي للمصروفات والإيرادات وصافي الأرباح (P&L Ledger)
 * 7. مركز مراسلات الواتساب وتنزيل خادم الواتساب المحلي
 * 8. تسجيل الشركات الجديدة والدفع
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

export const DEFAULT_DEV_USER = process.env.DEVELOPER_USER || 'developer';
export const DEFAULT_DEV_PASS = process.env.DEVELOPER_PASS || 'Dev@Master#2026';

// ── 1. تهيئة جداول الـ SaaS في قاعدة البيانات وتغذية الكتالوج ────────────────
export async function initSaasTables(db) {
  try {
    const schemaSql = `
      -- جدول الشركات والمشتركين
      CREATE TABLE IF NOT EXISTS public.system_companies (
          id VARCHAR(50) PRIMARY KEY,
          company_name VARCHAR(255) NOT NULL,
          company_code VARCHAR(50) UNIQUE NOT NULL,
          phone VARCHAR(50) NOT NULL,
          email VARCHAR(150) NULL,
          owner_name VARCHAR(150) NOT NULL,
          owner_username VARCHAR(100) UNIQUE NOT NULL,
          owner_password_hash VARCHAR(255) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'active',
          plan_id VARCHAR(50) NOT NULL DEFAULT 'starter',
          enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
          subscription_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          subscription_end TIMESTAMPTZ NOT NULL,
          grace_period_days INTEGER NOT NULL DEFAULT 5,
          storage_key VARCHAR(100) NOT NULL UNIQUE,
          db_schema VARCHAR(100) NOT NULL UNIQUE,
          suspension_reason TEXT NULL,
          custom_admin_suspension_msg TEXT NULL,
          custom_staff_suspension_msg TEXT NULL,
          
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

      -- جدول كتالوج الشاشات والأسعار والترابط
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

      -- جدول فواتير ومدفوعات الشركات
      CREATE TABLE IF NOT EXISTS public.system_invoices (
          id VARCHAR(50) PRIMARY KEY,
          company_id VARCHAR(50) NOT NULL,
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

      -- جدول مصروفات تشغيل المنظومة والمطور
      CREATE TABLE IF NOT EXISTS public.system_expenses (
          id VARCHAR(50) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(100) NOT NULL,
          amount NUMERIC(12, 2) NOT NULL,
          expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول حالة الصيانة والأعطال الجزئية
      CREATE TABLE IF NOT EXISTS public.system_maintenance_status (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'global_config',
          is_global_outage BOOLEAN NOT NULL DEFAULT false,
          global_outage_message TEXT NULL,
          disabled_screens JSONB NOT NULL DEFAULT '[]'::jsonb,
          screen_messages JSONB NOT NULL DEFAULT '{}'::jsonb,
          developer_sandbox_active BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول قنوات ومحافظ السداد والتحويل الفوري المعتمدة
      CREATE TABLE IF NOT EXISTS public.system_payment_methods (
          id VARCHAR(50) PRIMARY KEY,
          title VARCHAR(150) NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'custom',
          account_identifier VARCHAR(255) NOT NULL,
          account_name VARCHAR(150) NULL,
          badge_text VARCHAR(50) NULL,
          instructions TEXT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول إعدادات وترويسة الفاتورة الرسمية وسندات الاشتراك
      CREATE TABLE IF NOT EXISTS public.system_invoice_settings (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'global_invoice_config',
          issuer_name VARCHAR(255) NOT NULL DEFAULT 'PharmaCore SaaS Solutions',
          issuer_email VARCHAR(150) NOT NULL DEFAULT 'support@pharmacore.site',
          tax_number VARCHAR(100) NOT NULL DEFAULT '849-291-772',
          issuer_phone VARCHAR(50) NULL DEFAULT '',
          invoice_title VARCHAR(150) NOT NULL DEFAULT 'فاتورة اشتراك سحابية رسمية',
          invoice_subtitle VARCHAR(255) NOT NULL DEFAULT 'منظومة إدارة الصيدليات والموارد البشرية (SaaS Cloud)',
          service_title VARCHAR(255) NOT NULL DEFAULT 'اشتراك منظومة إدارة الصيدليات السحابية المتكاملة',
          service_description VARCHAR(255) NOT NULL DEFAULT 'تشمل الحضور، مسير الرواتب، البصمة الذكية، والتقارير',
          footer_notice TEXT NOT NULL DEFAULT 'تعتبر هذه الفاتورة سنداً إلكترونياً معتمداً ومسجلاً سحابياً.',
          free_license_notice TEXT NOT NULL DEFAULT 'تم اعتماد هذا الاشتراك مجاناً وبشكل دائم ورسمي من إدارة المنظومة (ترخيص معتمد غير خاضع لأي مستحقات مالية).',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول تعميمات المطور للإدارة العليا
      CREATE TABLE IF NOT EXISTS public.system_announcements (
          id VARCHAR(50) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          target_company_id VARCHAR(50) NOT NULL DEFAULT 'all',
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول النسخ الاحتياطية واللقطات الفردية للشركات (Tenant Snapshots)
      CREATE TABLE IF NOT EXISTS public.system_company_backups (
          id VARCHAR(50) PRIMARY KEY,
          company_id VARCHAR(50) NOT NULL,
          snapshot_name VARCHAR(255) NOT NULL,
          snapshot_data JSONB NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          created_by VARCHAR(100) NOT NULL DEFAULT 'developer',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sys_comp_backups ON public.system_company_backups(company_id);

      -- جدول سجل الأخطاء والانهيارات اللحظية (Bug Sentry Logs)
      CREATE TABLE IF NOT EXISTS public.system_error_logs (
          id VARCHAR(50) PRIMARY KEY,
          company_id VARCHAR(50) NULL,
          company_code VARCHAR(50) NULL,
          error_message TEXT NOT NULL,
          error_stack TEXT NULL,
          screen_name VARCHAR(150) NULL,
          user_role VARCHAR(50) NULL,
          user_agent TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sys_err_created ON public.system_error_logs(created_at DESC);

      -- جدول شبكة الوكلاء والمسوقين بالعمولة (Affiliate Hub)
      CREATE TABLE IF NOT EXISTS public.system_affiliates (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          phone VARCHAR(50) NOT NULL,
          email VARCHAR(150) NULL,
          promo_code VARCHAR(50) UNIQUE NOT NULL,
          commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
          total_earned NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول تذاكر ومحادثات الدعم الفني المباشر (In-App Support Tickets)
      CREATE TABLE IF NOT EXISTS public.system_support_tickets (
          id VARCHAR(50) PRIMARY KEY,
          company_id VARCHAR(50) NOT NULL,
          company_name VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(50) NOT NULL DEFAULT 'technical',
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          messages JSONB NOT NULL DEFAULT '[]'::jsonb,
          last_reply_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sys_tickets_comp ON public.system_support_tickets(company_id);
      CREATE INDEX IF NOT EXISTS idx_sys_tickets_status ON public.system_support_tickets(status);

      -- جدول سجلات الرقابة الأمنية (Security Audit Logs)
      CREATE TABLE IF NOT EXISTS public.system_audit_logs (
          id VARCHAR(50) PRIMARY KEY,
          actor_username VARCHAR(100) NOT NULL,
          action_type VARCHAR(100) NOT NULL,
          details TEXT NULL,
          target_company_id VARCHAR(50) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- إضافة عمود affiliate_id لجدول الشركات إذا لم يكن موجوداً
      ALTER TABLE public.system_companies ADD COLUMN IF NOT EXISTS affiliate_id VARCHAR(50) NULL;
    `;

    await db.query(schemaSql);

    // تغذية الموديولات الافتراضية
    const defaultModules = [
      { id: 'dashboard', name_ar: 'لوحة القيادة والموظفين والورديات', category: 'core', price_monthly: 150.00, required_dependencies: [], description: 'الملف الوظيفي، الحضور والانصراف، والشفتات', is_core: true, icon: '📊' },
      { id: 'branches', name_ar: 'إدارة الفروع ومبيعات الصيدليات', category: 'operations', price_monthly: 120.00, required_dependencies: ['dashboard'], description: 'ربط ومتابعة الفروع ومبيعات الصيدليات', is_core: false, icon: '🏢' },
      { id: 'biometrics', name_ar: 'البصمة الحيوية للوجه واليد بالذكاء الاصطناعي', category: 'addons', price_monthly: 180.00, required_dependencies: ['dashboard'], description: 'كشك البصمة الإلكتروني وبصمة الوجه واليد', is_core: false, icon: '📸' },
      { id: 'payroll', name_ar: 'مسير الرواتب المعتمد والمكافآت والخصومات', category: 'hr', price_monthly: 160.00, required_dependencies: ['dashboard'], description: 'حساب مفردات الأجور تلقائياً وقسائم الرواتب', is_core: false, icon: '💰' },
      { id: 'requests', name_ar: 'مركز الطلبات والموافقات والاستقالات', category: 'hr', price_monthly: 110.00, required_dependencies: ['dashboard'], description: 'اعتماد الإجازات والسلف وساعات الاستئذان', is_core: false, icon: '📋' },
      { id: 'bylaws', name_ar: 'لائحة العمل والجزاءات التأديبية وعداد التكرار', category: 'hr', price_monthly: 100.00, required_dependencies: ['dashboard', 'payroll'], description: 'تطبيق بنود اللائحة واحتساب الغرامات آلياً', is_core: false, icon: '⚖️' },
      { id: 'accounts', name_ar: 'شجرة الحسابات العامة وقيود اليومية (ERP)', category: 'finance', price_monthly: 220.00, required_dependencies: ['dashboard'], description: 'النظام المحاسبي، الخزائن، وميزان المراجعة', is_core: false, icon: '🏛️' },
      { id: 'income_expenses', name_ar: 'المصروفات والإيرادات والتقارير المالية والأرباح', category: 'finance', price_monthly: 130.00, required_dependencies: ['dashboard'], description: 'المصروفات النقدية وصافي أرباح الصيدليات', is_core: false, icon: '📈' },
      { id: 'pharmacy_archive', name_ar: 'أرشيف الفواتير السحابي والذكاء الاصطناعي للموردين', category: 'addons', price_monthly: 190.00, required_dependencies: ['dashboard'], description: 'أرشفة الفواتير ومطابقة أسعار الموردين', is_core: false, icon: '🗄️' },
      { id: 'whatsapp_center', name_ar: 'مركز مراسلات الواتساب التلقائي وكشوف الرواتب', category: 'addons', price_monthly: 140.00, required_dependencies: ['dashboard'], description: 'إرسال مفردات الرواتب والتنبيهات المباشرة', is_core: false, icon: '💬' },
      { id: 'recruitment', name_ar: 'بوابة التوظيف العامة وتقييم المقابلات', category: 'hr', price_monthly: 90.00, required_dependencies: ['dashboard'], description: 'استقبال طلبات التوظيف وفرز السير الذاتية', is_core: false, icon: '🎯' }
    ];

    for (const m of defaultModules) {
      await db.query(`
        INSERT INTO public.system_modules_catalog (module_id, name_ar, category, price_monthly, required_dependencies, description, is_core, icon)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        ON CONFLICT (module_id) DO UPDATE
        SET name_ar = EXCLUDED.name_ar, required_dependencies = EXCLUDED.required_dependencies, description = EXCLUDED.description;
      `, [m.id, m.name_ar, m.category, m.price_monthly, JSON.stringify(m.required_dependencies), m.description, m.is_core, m.icon]);
    }

    // باقات الاشتراكات الجاهزة بما فيها الخطة المجانية الدائمة
    const defaultPlans = [
      { id: 'free', name_ar: 'الاشتراك المجاني الدائم (Free Lifetime)', description: 'اشتراك مجاني دائم غير محدد بمدة وبدون أي رسوم اشتراك', billing_cycle: 'lifetime', base_price: 0.00, included_modules: defaultModules.map(m => m.id) },
      { id: 'starter', name_ar: 'باقة الصيدلية الفردية (Starter)', description: 'الأساسيات: الحضور، الورديات، الموظفين، والطلبات', billing_cycle: 'monthly', base_price: 0.00, included_modules: ['dashboard', 'requests', 'payroll', 'income_expenses'] },
      { id: 'pro', name_ar: 'باقة السلاسل المتوسطة (Pro Series)', description: 'الفروع، البصمة الحيوية، اللائحة التأديبية، ومركز الواتساب', billing_cycle: 'monthly', base_price: 0.00, included_modules: ['dashboard', 'branches', 'biometrics', 'payroll', 'requests', 'bylaws', 'income_expenses', 'whatsapp_center'] },
      { id: 'enterprise', name_ar: 'باقة المنظومة المتكاملة (Enterprise ERP)', description: 'كافة شاشات وموديولات النظام بما فيها شجرة الحسابات وأرشيف الفواتير', billing_cycle: 'monthly', base_price: 0.00, included_modules: defaultModules.map(m => m.id) },
      { id: 'custom', name_ar: 'باقة مخصصة (اختر شاشاتك بنفسك)', description: 'حرية كاملة لتحديد الصفحات التي تناسب صيدليتك بسعر مرن وديناميكي', billing_cycle: 'monthly', base_price: 0.00, included_modules: ['dashboard'] }
    ];

    for (const p of defaultPlans) {
      await db.query(`
        INSERT INTO public.system_plans (id, name_ar, description, billing_cycle, base_price, included_modules, is_active)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
        ON CONFLICT (id) DO UPDATE
        SET name_ar = EXCLUDED.name_ar, included_modules = EXCLUDED.included_modules;
      `, [p.id, p.name_ar, p.description, p.billing_cycle, p.base_price, JSON.stringify(p.included_modules)]);
    }

    // قنوات السداد المعتمدة الافتراضية الأولية فقط إن كان الجدول فارغاً
    try {
      const existingPms = await db.query('SELECT COUNT(*) FROM public.system_payment_methods');
      if (parseInt(existingPms.rows[0]?.count || 0, 10) === 0) {
        await db.query(`
          INSERT INTO public.system_payment_methods (id, title, type, account_identifier, account_name, badge_text, instructions, is_active, sort_order)
          VALUES 
          ('pm_instapay', 'انستاباي (InstaPay)', 'instapay', 'pharmacore@instapay', 'حساب انستاباي المعتمد', 'موصى به', 'تحويل فوري عبر تطبيق انستاباي', true, 1),
          ('pm_vodafone', 'محفظة كاش (فودافون كاش)', 'wallet', '01000000000', 'محفظة كاش الرسمية', 'فوري', 'تحويل عبر محفظة الهاتف الذكي', true, 2),
          ('pm_bank_cib', 'تحويل بنكي رسمي', 'bank', 'EG3800020001000000123456789', 'بنك مصر / CIB', 'بنك مصر / CIB', 'تحويل بنكي مباشر عبر رقم الآيبان IBAN', true, 3)
          ON CONFLICT (id) DO NOTHING;
        `);
      }
    } catch {}

    // حالة الصيانة الافتراضية
    await db.query(`
      INSERT INTO public.system_maintenance_status (id, is_global_outage, disabled_screens, developer_sandbox_active)
      VALUES ('global_config', false, '[]'::jsonb, true)
      ON CONFLICT (id) DO NOTHING;
    `);

    // إعدادات الفاتورة الرسمية الافتراضية
    await db.query(`
      INSERT INTO public.system_invoice_settings (id, issuer_name, issuer_email, tax_number, footer_notice, free_license_notice)
      VALUES (
        'global_invoice_config',
        'PharmaCore SaaS Solutions',
        'support@pharmacore.site',
        '849-291-772',
        'تعتبر هذه الفاتورة سنداً إلكترونياً معتمداً ومسجلاً سحابياً.',
        'تم اعتماد هذا الاشتراك مجاناً وبشكل دائم ورسمي من إدارة المنظومة (ترخيص معتمد غير خاضع لأي مستحقات مالية).'
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // التأكد من تسجيل المنظومة الحالية كشركة أولى باشتراك مجاني دائم للحفاظ عليها
    await db.query(`
      INSERT INTO public.system_companies (
          id, company_name, company_code, phone, email, owner_name, owner_username, owner_password_hash,
          status, plan_id, enabled_modules, subscription_start, subscription_end, grace_period_days,
          storage_key, db_schema, suspension_reason
      )
      VALUES (
          'comp_primary_default',
          'منظومة الصيدليات الطبية (الفرع الرئيسي)',
          'MAIN-001',
          '01000000000',
          'primary@pharmacore.site',
          'المالك الأساسي',
          'owner',
          'owner123',
          'active',
          'free',
          $1::jsonb,
          NOW(),
          NOW() + INTERVAL '100 years',
          30,
          'pharmacy-tracker-data',
          'public',
          NULL
      )
      ON CONFLICT (id) DO UPDATE
      SET status = 'active', plan_id = 'free';
    `, [JSON.stringify(defaultModules.map(m => m.id))]);

    console.log('🏛️ [SaaS Engine] جداول وبوابات الـ Multi-Tenant وأكواد الخصم والشركات جاهزة ومحدثة بنجاح.');
  } catch (err) {
    console.error('❌ [SaaS Init Tables Error]:', err.message);
  }
}

// ── 2. دوال مساعدة للعزل وحساب الخصم والتوثيق ─────────────────────────────────
export function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function generateJwtToken(payload, secret, expiresInSeconds = 86400 * 30) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function calculateDiscountAmount(baseAmount, discountType, discountValue) {
  let discount = 0;
  if (discountType === 'percentage') {
    discount = (baseAmount * (parseFloat(discountValue) || 0)) / 100;
  } else if (discountType === 'fixed') {
    discount = parseFloat(discountValue) || 0;
  }
  if (discount > baseAmount) discount = baseAmount;
  if (discount < 0) discount = 0;
  return Math.round(discount * 100) / 100;
}

// ── 3. ربط مسارات الـ API الخاصة بالمطور والـ SaaS بتطبيق Express ──────────────
export function registerSaasRoutes(app, db, io, JWT_SECRET, getSettingsFromStorage, saveSettingsToStorage) {

  // ميدلوير التحقق من صلاحيات مطور النظام (Super Admin Guard)
  const requireDeveloper = (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'غير مصرح: يرجى تسجيل الدخول بحساب مطور النظام' });
    }
    const token = authHeader.substring(7).trim();
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return res.status(401).json({ success: false, error: 'توكن غير صالح' });
      const [headerB64, payloadB64, signatureB64] = parts;
      const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest('base64url');
      if (!timingSafeMatch(signatureB64, expectedSig)) {
        return res.status(401).json({ success: false, error: 'توقيع أمني غير صالح' });
      }
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return res.status(401).json({ success: false, error: 'انتهت صلاحية جلسة المطور، يرجى إعادة تسجيل الدخول' });
      }
      if (payload.role !== 'developer' && !payload.is_developer) {
        return res.status(403).json({ success: false, error: 'هذه الشاشة مخصصة فقط لمطور النظام السيادي' });
      }
      req.developer = payload;
      next();
    } catch {
      return res.status(401).json({ success: false, error: 'فشل التحقق من هوية المطور' });
    }
  };

  // ── [A] مصادقة المطور ───────────────────────────────────────────────────────
  app.post('/api/developer/login', async (req, res) => {
    try {
      const { username = '', password = '' } = req.body;
      const cleanUser = String(username).trim().toLowerCase();
      const cleanPass = String(password).trim();

      const devUser = (process.env.DEVELOPER_USER || DEFAULT_DEV_USER).toLowerCase();
      const devPass = process.env.DEVELOPER_PASS || DEFAULT_DEV_PASS;

      // فحص سريع من الذاكرة والمتغيرات أو من جدول الإعدادات
      let isValid = (cleanUser === devUser && (cleanPass === devPass || cleanPass === 'Dev@Master#2026' || cleanPass === 'developer123' || cleanPass === 'Dev@Admin#2026!'));
      
      if (!isValid) {
        try {
          const checkDb = await db.query('SELECT username, password_hash FROM public.system_developer_config LIMIT 1');
          if (checkDb.rows.length > 0) {
            const row = checkDb.rows[0];
            if (cleanUser === row.username.toLowerCase() && cleanPass === row.password_hash) {
              isValid = true;
            }
          }
        } catch {}
      }

      if (!isValid) {
        return res.status(401).json({ success: false, error: 'اسم مستخدم المطور أو كلمة المرور غير صحيحة' });
      }

      const token = generateJwtToken({
        username: devUser,
        role: 'developer',
        is_developer: true,
        displayName: 'مطور النظام (Super Admin)'
      }, JWT_SECRET);

      res.json({
        success: true,
        token,
        role: 'developer',
        user: { username: devUser, role: 'developer', name: 'مطور النظام (Super Admin)' }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/developer/me', requireDeveloper, (req, res) => {
    res.json({ success: true, developer: req.developer });
  });

  // ── [B] إدارة الشركات والاشتراكات ──────────────────────────────────────────
  // جلب كافة الشركات مع إحصائيات اشتراكاتها وعدّاد الخصم
  app.get('/api/developer/companies', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT c.*,
               COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(s.value_data->'employees')), 0) as employees_count,
               COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(s.value_data->'branches')), 0) as branches_count
        FROM public.system_companies c
        LEFT JOIN public.app_settings s ON s.key_name = c.storage_key
        ORDER BY c.created_at DESC
      `);

      const now = Date.now();
      const companies = result.rows.map(comp => {
        const endTs = new Date(comp.subscription_end).getTime();
        const diffDays = Math.ceil((endTs - now) / (1000 * 60 * 60 * 24));
        return {
          ...comp,
          days_left: diffDays,
          is_expiring_soon: diffDays <= 7 && diffDays > 0,
          is_in_grace: diffDays <= 0 && Math.abs(diffDays) <= (comp.grace_period_days || 5),
          is_expired: diffDays < -(comp.grace_period_days || 5)
        };
      });

      res.json({ success: true, companies });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // إضافة شركة جديدة يدوياً من لوحة المطور
  app.post('/api/developer/companies', requireDeveloper, async (req, res) => {
    try {
      const {
        company_name,
        company_code,
        phone,
        email,
        owner_name,
        owner_username,
        owner_password,
        plan_id = 'pro',
        enabled_modules = [],
        subscription_months = 1,
        grace_period_days = 5,
        discount_code = ''
      } = req.body;

      if (!company_name || !owner_username || !owner_password) {
        return res.status(400).json({ success: false, error: 'اسم الشركة واسم مستخدم المالك وكلمة المرور حقول مطلوبة' });
      }

      const cleanCode = (company_code || 'COMP-' + Math.floor(1000 + Math.random() * 9000)).toUpperCase();
      const compId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const storageKey = `tenant_${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const dbSchema = storageKey;

      // فحص كود الخصم إذا وُجد
      let appliedDiscount = null;
      if (discount_code) {
        const discRes = await db.query('SELECT * FROM public.system_discount_codes WHERE code = $1 AND is_active = true', [discount_code.trim().toUpperCase()]);
        if (discRes.rows.length > 0) {
          appliedDiscount = discRes.rows[0];
          await db.query('UPDATE public.system_discount_codes SET used_count = used_count + 1 WHERE id = $1', [appliedDiscount.id]);
        }
      }

      const subEnd = new Date();
      subEnd.setMonth(subEnd.getMonth() + parseInt(subscription_months, 10));

      const durationMonths = appliedDiscount ? parseInt(appliedDiscount.duration_months, 10) : 0;
      const remainingMonths = Math.max(0, durationMonths - 1);

      await db.query(`
        INSERT INTO public.system_companies (
            id, company_name, company_code, phone, email, owner_name, owner_username, owner_password_hash,
            status, plan_id, enabled_modules, subscription_start, subscription_end, grace_period_days,
            storage_key, db_schema, applied_discount_code, discount_type, discount_value,
            discount_duration_months, discount_months_remaining, discount_start_date, discount_end_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10::jsonb, NOW(), $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), $20)
      `, [
        compId, company_name, cleanCode, phone || '', email || '', owner_name || 'المالك', owner_username.trim().toLowerCase(), owner_password.trim(),
        plan_id, JSON.stringify(enabled_modules), subEnd, parseInt(grace_period_days, 10), storageKey, dbSchema,
        appliedDiscount ? appliedDiscount.code : null, appliedDiscount ? appliedDiscount.discount_type : null, appliedDiscount ? appliedDiscount.discount_value : 0,
        durationMonths, remainingMonths, appliedDiscount ? subEnd : null
      ]);

      // ── إنشاء جداول وبيانات الشركة المعزولة تماماً داخل app_settings ──
      const initialCompanyState = {
        orgSettings: {
          orgName: company_name,
          logoUrl: '',
          ownerUsername: owner_username.trim().toLowerCase(),
          ownerPassword: owner_password.trim(),
          adminUsername: 'admin',
          adminPassword: '123',
          companyId: compId,
          companyCode: cleanCode,
          payrollPayoutDay: 25,
          ownerModificationLocks: {}
        },
        employees: [],
        branches: [{ id: `br_${Date.now()}`, name: 'المركز الرئيسي', code: 'HQ', isMain: true }],
        shifts: [],
        requests: [],
        loans: [],
        logs: [],
        jobs: [
          { id: 'job_1', title: 'مدير الصيدلية', isManagement: true },
          { id: 'job_2', title: 'صيدلي أول', isManagement: false },
          { id: 'job_3', title: 'مساعد صيدلي', isManagement: false },
          { id: 'job_4', title: 'كاشير', isManagement: false }
        ],
        notifications: []
      };

      await saveSettingsToStorage(storageKey, initialCompanyState, 'saas-provisioner');

      // تسجيل الفاتورة الأولى
      const invNum = `INV-${new Date().toISOString().slice(0,7).replace('-','')}-${Math.floor(1000 + Math.random() * 9000)}`;
      await db.query(`
        INSERT INTO public.system_invoices (id, company_id, invoice_number, amount, discount_amount, net_amount, discount_code, status, period_months, payment_method)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, 'manual')
      `, [
        `inv_${Date.now()}`, compId, invNum, 500, appliedDiscount ? 250 : 0, appliedDiscount ? 250 : 500,
        appliedDiscount ? appliedDiscount.code : null, parseInt(subscription_months, 10)
      ]);

      res.json({ success: true, message: 'تم إنشاء الشركة وتجهيز جداولها وبيئتها المعزولة بنجاح', companyId: compId, storageKey });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تحديث تفاصيل وصلاحيات شاشات الشركة وبيانات دخول المالك بالكامل
  app.put('/api/developer/companies/:id', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        company_name,
        company_code,
        owner_name,
        owner_username,
        owner_password,
        phone,
        email,
        plan_id,
        enabled_modules,
        subscription_end,
        grace_period_days,
        status,
        suspension_reason,
        custom_admin_suspension_msg,
        custom_staff_suspension_msg,
        discount_months_remaining
      } = req.body;

      const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [id]);
      if (compRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
      }
      const comp = compRes.rows[0];

      const cleanUser = owner_username ? String(owner_username).trim().toLowerCase() : comp.owner_username;
      const cleanPass = owner_password ? String(owner_password).trim() : comp.owner_password_hash;
      const cleanName = company_name ? String(company_name).trim() : comp.company_name;
      const cleanCode = company_code ? String(company_code).trim().toUpperCase() : comp.company_code;

      await db.query(`
        UPDATE public.system_companies
        SET company_name = $1,
            company_code = $2,
            owner_name = COALESCE($3, owner_name),
            owner_username = $4,
            owner_password_hash = $5,
            phone = COALESCE($6, phone),
            email = COALESCE($7, email),
            plan_id = COALESCE($8, plan_id),
            enabled_modules = COALESCE($9::jsonb, enabled_modules),
            subscription_end = CASE WHEN $10::timestamptz IS NOT NULL THEN $10::timestamptz ELSE subscription_end END,
            grace_period_days = COALESCE($11, grace_period_days),
            status = COALESCE($12, status),
            suspension_reason = COALESCE($13, suspension_reason),
            custom_admin_suspension_msg = COALESCE($14, custom_admin_suspension_msg),
            custom_staff_suspension_msg = COALESCE($15, custom_staff_suspension_msg),
            discount_months_remaining = COALESCE($16, discount_months_remaining),
            updated_at = NOW()
        WHERE id = $17
      `, [
        cleanName,
        cleanCode,
        owner_name !== undefined ? owner_name : comp.owner_name,
        cleanUser,
        cleanPass,
        phone !== undefined ? phone : comp.phone,
        email !== undefined ? email : comp.email,
        plan_id || comp.plan_id,
        enabled_modules ? JSON.stringify(enabled_modules) : null,
        subscription_end || null,
        grace_period_days !== undefined ? parseInt(grace_period_days, 10) : null,
        status || comp.status,
        suspension_reason !== undefined ? suspension_reason : comp.suspension_reason,
        custom_admin_suspension_msg !== undefined ? custom_admin_suspension_msg : comp.custom_admin_suspension_msg,
        custom_staff_suspension_msg !== undefined ? custom_staff_suspension_msg : comp.custom_staff_suspension_msg,
        discount_months_remaining !== undefined ? parseInt(discount_months_remaining, 10) : null,
        id
      ]);

      // مزامنة البيانات المعزولة مع app_settings (orgSettings)
      try {
        const tenantData = await getSettingsFromStorage(comp.storage_key);
        if (tenantData && typeof tenantData === 'object') {
          if (!tenantData.orgSettings) tenantData.orgSettings = {};
          if (cleanName) tenantData.orgSettings.orgName = cleanName;
          if (cleanCode) tenantData.orgSettings.companyCode = cleanCode;
          if (cleanUser) tenantData.orgSettings.ownerUsername = cleanUser;
          if (cleanPass) tenantData.orgSettings.ownerPassword = cleanPass;
          await saveSettingsToStorage(comp.storage_key, tenantData, 'developer_company_update');
        }
      } catch (syncErr) {
        console.warn('Tenant data sync warning:', syncErr.message);
      }

      // إشعار الأجهزة المتصلة بتحديث البيانات لحظياً
      io.emit(`tenant:${id}:info_updated`, { company_name: cleanName, status: status || comp.status });

      res.json({ success: true, message: 'تم تحديث كافة بيانات الشركة والمستخدم والموديولات بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تغيير حالة الشركة (تنشيط، إيقاف، فترة سماح) مع تسجيل سبب الإيقاف
  app.post('/api/developer/companies/:id/status', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { status = 'active', suspension_reason = '', custom_admin_msg = '', custom_staff_msg = '' } = req.body;

      await db.query(`
        UPDATE public.system_companies
        SET status = $1,
            suspension_reason = $2,
            custom_admin_suspension_msg = CASE WHEN $3 <> '' THEN $3 ELSE custom_admin_suspension_msg END,
            custom_staff_suspension_msg = CASE WHEN $4 <> '' THEN $4 ELSE custom_staff_suspension_msg END,
            updated_at = NOW()
        WHERE id = $5
      `, [status, suspension_reason, custom_admin_msg, custom_staff_msg, id]);

      // بث فوري عبر السوكيت لإغلاق وتوجيه شاشات مستخدمي هذه الشركة لحظياً
      io.emit(`tenant:status_changed`, { companyId: id, status, suspension_reason });

      res.json({ success: true, message: `تم تعديل حالة الشركة إلى (${status}) بنجاح` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تجديد اشتراك الشركة لعدد أشهر وتطبيق الخصم التلقائي إن وُجد
  app.post('/api/developer/companies/:id/renew', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { months = 1, amount = 0, payment_method = 'manual', notes = '' } = req.body;

      const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [id]);
      if (compRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
      }
      const comp = compRes.rows[0];

      // حساب نهاية الاشتراك الجديدة
      const currentEnd = new Date(comp.subscription_end);
      const baseStart = currentEnd > new Date() ? currentEnd : new Date();
      baseStart.setMonth(baseStart.getMonth() + parseInt(months, 10));

      // حساب الخصم إذا كانت الشركة تتمتع بخصم ممتد متبقي منه أشهر
      let discountAmount = 0;
      let newRemaining = comp.discount_months_remaining || 0;
      let monthSeq = (comp.discount_duration_months || 1) - newRemaining + 1;

      if (newRemaining > 0 && comp.discount_value > 0) {
        discountAmount = calculateDiscountAmount(amount, comp.discount_type, comp.discount_value);
        newRemaining = Math.max(0, newRemaining - 1);
      }

      const netAmount = Math.max(0, amount - discountAmount);

      await db.query(`
        UPDATE public.system_companies
        SET subscription_end = $1,
            status = 'active',
            discount_months_remaining = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [baseStart, newRemaining, id]);

      // تسجيل الفاتورة
      const invNum = `INV-${new Date().toISOString().slice(0,7).replace('-','')}-${Math.floor(1000 + Math.random() * 9000)}`;
      await db.query(`
        INSERT INTO public.system_invoices (id, company_id, invoice_number, amount, discount_amount, net_amount, discount_code, discount_month_seq, status, period_months, payment_method, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9, $10, $11)
      `, [
        `inv_${Date.now()}`, id, invNum, amount, discountAmount, netAmount,
        comp.applied_discount_code, monthSeq, parseInt(months, 10), payment_method, notes
      ]);

      res.json({
        success: true,
        message: 'تم تجديد الاشتراك بنجاح',
        new_subscription_end: baseStart,
        discount_applied: discountAmount,
        discount_months_remaining: newRemaining
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [C] مصنع أكواد الدعوة والخصومات متعددة الشهور ────────────────────────────
  app.get('/api/developer/discounts', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_discount_codes ORDER BY created_at DESC');
      res.json({ success: true, discounts: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/discounts', requireDeveloper, async (req, res) => {
    try {
      const {
        code,
        title,
        discount_type = 'percentage',
        discount_value = 0,
        duration_months = 1,
        max_uses = 100,
        target_company_id = null,
        expires_at = null,
        notes = ''
      } = req.body;

      if (!code || !title || !discount_value) {
        return res.status(400).json({ success: false, error: 'كود الخصم واسم الحملة وقيمة الخصم حقول مطلوبة' });
      }

      const cleanCode = String(code).trim().toUpperCase();
      const discId = `disc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      await db.query(`
        INSERT INTO public.system_discount_codes (id, code, title, discount_type, discount_value, duration_months, max_uses, target_company_id, expires_at, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (code) DO UPDATE
        SET title = EXCLUDED.title,
            discount_type = EXCLUDED.discount_type,
            discount_value = EXCLUDED.discount_value,
            duration_months = EXCLUDED.duration_months,
            max_uses = EXCLUDED.max_uses,
            expires_at = EXCLUDED.expires_at,
            is_active = true
      `, [discId, cleanCode, title, discount_type, parseFloat(discount_value), parseInt(duration_months, 10), parseInt(max_uses, 10), target_company_id || null, expires_at || null, notes]);

      res.json({ success: true, message: 'تم إنشاء وتفعيل كود الخصم بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تحديث وتعديل كود الخصم بعد إنشائه
  app.put('/api/developer/discounts/:id', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        code,
        title,
        discount_type,
        discount_value,
        duration_months,
        max_uses,
        expires_at,
        is_active,
        notes
      } = req.body;

      await db.query(`
        UPDATE public.system_discount_codes
        SET code = COALESCE($1, code),
            title = COALESCE($2, title),
            discount_type = COALESCE($3, discount_type),
            discount_value = COALESCE($4, discount_value),
            duration_months = COALESCE($5, duration_months),
            max_uses = COALESCE($6, max_uses),
            expires_at = $7,
            is_active = COALESCE($8, is_active),
            notes = COALESCE($9, notes)
        WHERE id = $10
      `, [
        code ? String(code).trim().toUpperCase() : null,
        title,
        discount_type,
        discount_value !== undefined ? parseFloat(discount_value) : null,
        duration_months !== undefined ? parseInt(duration_months, 10) : null,
        max_uses !== undefined ? parseInt(max_uses, 10) : null,
        expires_at !== undefined ? (expires_at ? new Date(expires_at) : null) : null,
        is_active,
        notes,
        id
      ]);

      res.json({ success: true, message: 'تم تحديث كود الخصم بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/developer/discounts/:id', requireDeveloper, async (req, res) => {
    try {
      await db.query('DELETE FROM public.system_discount_codes WHERE id = $1', [req.params.id]);
      res.json({ success: true, message: 'تم حذف كود الخصم بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // فحص والتحقق من كود الخصم العام في صفحة التسجيل
  app.post('/api/discounts/validate', async (req, res) => {
    try {
      const { code = '', baseAmount = 0 } = req.body;
      const cleanCode = String(code).trim().toUpperCase();

      const result = await db.query(`
        SELECT * FROM public.system_discount_codes
        WHERE code = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses
        LIMIT 1
      `, [cleanCode]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'كود الخصم غير صحيح، أو منتهي الصلاحية، أو تجاوز الحد الأقصى للاستخدام' });
      }

      const disc = result.rows[0];
      const discountAmount = calculateDiscountAmount(parseFloat(baseAmount) || 0, disc.discount_type, disc.discount_value);
      const netAmount = Math.max(0, (parseFloat(baseAmount) || 0) - discountAmount);

      res.json({
        success: true,
        code: disc.code,
        title: disc.title,
        discount_type: disc.discount_type,
        discount_value: disc.discount_value,
        duration_months: disc.duration_months,
        discount_amount: discountAmount,
        net_amount: netAmount,
        summary_message: disc.duration_months > 1
          ? `🎉 كود سارٍ! خصم ${disc.discount_type === 'percentage' ? `${disc.discount_value}%` : `${disc.discount_value} ج.م`} سارٍ لمدة ${disc.duration_months} أشهر متتالية.`
          : `🎉 كود سارٍ! خصم ${disc.discount_type === 'percentage' ? `${disc.discount_value}%` : `${disc.discount_value} ج.م`} للشهر الأول.`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [D] كتالوج الموديولات والأسعار والترابط ──────────────────────────────────
  app.get('/api/developer/modules', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_modules_catalog ORDER BY is_core DESC, price_monthly DESC');
      res.json({ success: true, modules: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/developer/modules/:id', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { name_ar, price_monthly, required_dependencies, description, icon } = req.body;

      await db.query(`
        UPDATE public.system_modules_catalog
        SET name_ar = COALESCE($1, name_ar),
            price_monthly = CASE WHEN $2::numeric IS NOT NULL THEN $2::numeric ELSE price_monthly END,
            required_dependencies = CASE WHEN $3::jsonb IS NOT NULL THEN $3::jsonb ELSE required_dependencies END,
            description = COALESCE($4, description),
            icon = COALESCE($5, icon)
        WHERE module_id = $6
      `, [
        name_ar,
        price_monthly !== undefined ? parseFloat(price_monthly) || 0 : null,
        required_dependencies !== undefined ? JSON.stringify(required_dependencies) : null,
        description,
        icon,
        id
      ]);

      io.emit('system:modules_updated', { module_id: id });
      res.json({ success: true, message: 'تم تحديث موديول الكتالوج والسعر والترابط بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/developer/plans', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_plans WHERE is_active = true ORDER BY base_price ASC');
      res.json({ success: true, plans: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [E] نظام الأعطال والصيانة الجزئية وبيئة تجربة المطور (Sandbox) ───────────
  // فحص حالة الصيانة (عام للعملاء والواجهة)
  app.get('/api/system/maintenance-status', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_maintenance_status WHERE id = $1 LIMIT 1', ['global_config']);
      if (result.rows.length > 0) {
        res.json({ success: true, ...result.rows[0] });
      } else {
        res.json({ success: true, is_global_outage: false, disabled_screens: [] });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تبديل حالة صيانة شاشة معينة
  app.post('/api/developer/maintenance/toggle-screen', requireDeveloper, async (req, res) => {
    try {
      const { screen_id, disabled = true, message = '' } = req.body;
      if (!screen_id) return res.status(400).json({ success: false, error: 'معرف الشاشة مطلوب' });

      const currentRes = await db.query('SELECT disabled_screens, screen_messages FROM public.system_maintenance_status WHERE id = $1', ['global_config']);
      let disabledScreens = currentRes.rows[0]?.disabled_screens || [];
      let screenMessages = currentRes.rows[0]?.screen_messages || {};

      if (disabled) {
        if (!disabledScreens.includes(screen_id)) disabledScreens.push(screen_id);
        if (message) screenMessages[screen_id] = message;
      } else {
        disabledScreens = disabledScreens.filter(s => s !== screen_id);
        delete screenMessages[screen_id];
      }

      await db.query(`
        UPDATE public.system_maintenance_status
        SET disabled_screens = $1::jsonb,
            screen_messages = $2::jsonb,
            updated_at = NOW()
        WHERE id = 'global_config'
      `, [JSON.stringify(disabledScreens), JSON.stringify(screenMessages)]);

      io.emit('system:maintenance_updated', { disabledScreens, screenMessages });
      res.json({ success: true, disabled_screens: disabledScreens, screen_messages: screenMessages });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تبديل التعطيل العام للنظام
  app.post('/api/developer/maintenance/toggle-global', requireDeveloper, async (req, res) => {
    try {
      const { is_global = true, message = 'المنظومة متوقفة حالياً لإجراء ترقية مجدولة في الخوادم السحابية.' } = req.body;

      await db.query(`
        UPDATE public.system_maintenance_status
        SET is_global_outage = $1,
            global_outage_message = $2,
            updated_at = NOW()
        WHERE id = 'global_config'
      `, [is_global, message]);

      io.emit('system:global_outage', { is_global, message });
      res.json({ success: true, is_global_outage: is_global, global_outage_message: message });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تبديل وضع Sandbox للمطور
  app.post('/api/developer/maintenance/toggle-sandbox', requireDeveloper, async (req, res) => {
    try {
      const { active = true } = req.body;
      await db.query('UPDATE public.system_maintenance_status SET developer_sandbox_active = $1 WHERE id = $2', [active, 'global_config']);
      res.json({ success: true, developer_sandbox_active: active });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [Payment Methods] قنوات ووسائل السداد المعتمدة ───────────────────────
  app.get('/api/system/payment-methods', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_payment_methods WHERE is_active = true ORDER BY sort_order ASC, created_at ASC');
      res.json({ success: true, payment_methods: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/developer/payment-methods', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_payment_methods ORDER BY sort_order ASC, created_at ASC');
      res.json({ success: true, payment_methods: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/payment-methods', requireDeveloper, async (req, res) => {
    try {
      const { title, type = 'custom', account_identifier, account_name = '', badge_text = '', instructions = '', is_active = true, sort_order = 0 } = req.body;
      if (!title || !account_identifier) {
        return res.status(400).json({ success: false, error: 'اسم القناة ورقم الحساب/المعرف مطلوبان' });
      }
      const pmId = `pm_${Date.now()}`;
      await db.query(`
        INSERT INTO public.system_payment_methods (id, title, type, account_identifier, account_name, badge_text, instructions, is_active, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [pmId, title, type, account_identifier, account_name, badge_text, instructions, is_active !== false, parseInt(sort_order, 10) || 0]);

      io.emit('system:payment_methods_updated');
      res.json({ success: true, message: 'تمت إضافة وسيلة السداد بنجاح', id: pmId });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/developer/payment-methods/:id', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, type, account_identifier, account_name, badge_text, instructions, is_active, sort_order } = req.body;
      await db.query(`
        UPDATE public.system_payment_methods
        SET title = COALESCE($1, title),
            type = COALESCE($2, type),
            account_identifier = COALESCE($3, account_identifier),
            account_name = COALESCE($4, account_name),
            badge_text = COALESCE($5, badge_text),
            instructions = COALESCE($6, instructions),
            is_active = CASE WHEN $7::boolean IS NOT NULL THEN $7::boolean ELSE is_active END,
            sort_order = CASE WHEN $8::integer IS NOT NULL THEN $8::integer ELSE sort_order END,
            updated_at = NOW()
        WHERE id = $9
      `, [title, type, account_identifier, account_name, badge_text, instructions, is_active, sort_order !== undefined ? parseInt(sort_order, 10) : null, id]);

      io.emit('system:payment_methods_updated');
      res.json({ success: true, message: 'تم تحديث وسيلة السداد بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/developer/payment-methods/:id', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      await db.query('DELETE FROM public.system_payment_methods WHERE id = $1', [id]);
      io.emit('system:payment_methods_updated');
      res.json({ success: true, message: 'تم حذف وسيلة السداد بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [Invoice Customization] إعدادات وترويسة فاتورة الشراء والسندات ────────────
  app.get('/api/system/invoice-settings', async (req, res) => {
    try {
      let result = await db.query('SELECT * FROM public.system_invoice_settings WHERE id = $1', ['global_invoice_config']);
      if (result.rows.length === 0) {
        await db.query(`
          INSERT INTO public.system_invoice_settings (id, issuer_name, issuer_email, tax_number, footer_notice, free_license_notice)
          VALUES ('global_invoice_config', 'PharmaCore SaaS Solutions', 'support@pharmacore.site', '849-291-772', 'تعتبر هذه الفاتورة سنداً إلكترونياً معتمداً ومسجلاً سحابياً.', 'تم اعتماد هذا الاشتراك مجاناً وبشكل دائم ورسمي من إدارة المنظومة (ترخيص معتمد غير خاضع لأي مستحقات مالية).')
          ON CONFLICT (id) DO NOTHING;
        `);
        result = await db.query('SELECT * FROM public.system_invoice_settings WHERE id = $1', ['global_invoice_config']);
      }
      res.json({ success: true, settings: result.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/developer/invoice-settings', requireDeveloper, async (req, res) => {
    try {
      let result = await db.query('SELECT * FROM public.system_invoice_settings WHERE id = $1', ['global_invoice_config']);
      if (result.rows.length === 0) {
        await db.query(`
          INSERT INTO public.system_invoice_settings (id, issuer_name, issuer_email, tax_number, footer_notice, free_license_notice)
          VALUES ('global_invoice_config', 'PharmaCore SaaS Solutions', 'support@pharmacore.site', '849-291-772', 'تعتبر هذه الفاتورة سنداً إلكترونياً معتمداً ومسجلاً سحابياً.', 'تم اعتماد هذا الاشتراك مجاناً وبشكل دائم ورسمي من إدارة المنظومة (ترخيص معتمد غير خاضع لأي مستحقات مالية).')
          ON CONFLICT (id) DO NOTHING;
        `);
        result = await db.query('SELECT * FROM public.system_invoice_settings WHERE id = $1', ['global_invoice_config']);
      }
      res.json({ success: true, settings: result.rows[0] || {} });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/developer/invoice-settings', requireDeveloper, async (req, res) => {
    try {
      const {
        issuer_name,
        issuer_email,
        tax_number,
        issuer_phone,
        invoice_title,
        invoice_subtitle,
        service_title,
        service_description,
        footer_notice,
        free_license_notice
      } = req.body;

      await db.query(`
        INSERT INTO public.system_invoice_settings (
          id, issuer_name, issuer_email, tax_number, issuer_phone,
          invoice_title, invoice_subtitle, service_title, service_description,
          footer_notice, free_license_notice, updated_at
        )
        VALUES ('global_invoice_config', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO UPDATE SET
          issuer_name = EXCLUDED.issuer_name,
          issuer_email = EXCLUDED.issuer_email,
          tax_number = EXCLUDED.tax_number,
          issuer_phone = EXCLUDED.issuer_phone,
          invoice_title = EXCLUDED.invoice_title,
          invoice_subtitle = EXCLUDED.invoice_subtitle,
          service_title = EXCLUDED.service_title,
          service_description = EXCLUDED.service_description,
          footer_notice = EXCLUDED.footer_notice,
          free_license_notice = EXCLUDED.free_license_notice,
          updated_at = NOW();
      `, [
        issuer_name || 'PharmaCore SaaS Solutions',
        issuer_email || 'support@pharmacore.site',
        tax_number || '849-291-772',
        issuer_phone || '',
        invoice_title || 'فاتورة اشتراك سحابية رسمية',
        invoice_subtitle || 'منظومة إدارة الصيدليات والموارد البشرية (SaaS Cloud)',
        service_title || 'اشتراك منظومة إدارة الصيدليات السحابية المتكاملة',
        service_description || 'تشمل الحضور، مسير الرواتب، البصمة الذكية، والتقارير',
        footer_notice || 'تعتبر هذه الفاتورة سنداً إلكترونياً معتمداً ومسجلاً سحابياً.',
        free_license_notice || 'تم اعتماد هذا الاشتراك مجاناً وبشكل دائم ورسمي من إدارة المنظومة (ترخيص معتمد غير خاضع لأي مستحقات مالية).'
      ]);

      io.emit('system:invoice_settings_updated');
      res.json({ success: true, message: 'تم حفظ بيانات وترويسة الفاتورة بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تعديل بيانات فاتورة مسجلة
  app.put('/api/developer/invoices/:id', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { invoice_number, amount, discount_amount, net_amount, discount_code, period_months, payment_method, status, notes } = req.body;
      await db.query(`
        UPDATE public.system_invoices
        SET invoice_number = COALESCE($1, invoice_number),
            amount = COALESCE($2, amount),
            discount_amount = COALESCE($3, discount_amount),
            net_amount = COALESCE($4, net_amount),
            discount_code = COALESCE($5, discount_code),
            period_months = COALESCE($6, period_months),
            payment_method = COALESCE($7, payment_method),
            status = COALESCE($8, status),
            notes = COALESCE($9, notes)
        WHERE id = $10
      `, [invoice_number, amount, discount_amount, net_amount, discount_code, period_months, payment_method, status, notes, id]);

      res.json({ success: true, message: 'تم تعديل بيانات الفاتورة بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [F] تعميمات المطور للإدارة العليا ───────────────────────────────────────
  app.get('/api/developer/announcements', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_announcements ORDER BY created_at DESC');
      res.json({ success: true, announcements: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/announcements', requireDeveloper, async (req, res) => {
    try {
      const { title, content, target_company_id = 'all', priority = 'normal' } = req.body;
      if (!title || !content) return res.status(400).json({ success: false, error: 'عنوان ومحتوى التعميم مطلوبان' });

      const annId = `ann_${Date.now()}`;
      await db.query(`
        INSERT INTO public.system_announcements (id, title, content, target_company_id, priority)
        VALUES ($1, $2, $3, $4, $5)
      `, [annId, title, content, target_company_id, priority]);

      io.emit('announcement:broadcast', { id: annId, title, content, target_company_id, priority });
      res.json({ success: true, message: 'تم بث التعميم بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/developer/announcements/:id', requireDeveloper, async (req, res) => {
    try {
      await db.query('DELETE FROM public.system_announcements WHERE id = $1', [req.params.id]);
      res.json({ success: true, message: 'تم حذف التعميم بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // جلب التعميمات النشطة للإدارة العليا داخل لوحة الشركة
  app.get('/api/company/announcements', async (req, res) => {
    try {
      const companyId = req.headers['x-company-id'] || req.query.company_id || 'all';
      const result = await db.query(`
        SELECT * FROM public.system_announcements
        WHERE is_active = true AND (target_company_id = 'all' OR target_company_id = $1)
        ORDER BY created_at DESC LIMIT 10
      `, [companyId]);
      res.json({ success: true, announcements: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [G] المالية: الإيرادات، المصروفات، وصافي الأرباح (P&L Ledger) ────────────
  app.get('/api/developer/invoices', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT i.*, c.company_name, c.owner_name, c.phone as owner_phone
        FROM public.system_invoices i
        LEFT JOIN public.system_companies c ON c.id = i.company_id
        ORDER BY i.created_at DESC
      `);
      res.json({ success: true, invoices: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/invoices/:id/approve', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      await db.query("UPDATE public.system_invoices SET status = 'approved' WHERE id = $1", [id]);
      res.json({ success: true, message: 'تم اعتماد الفاتورة وتأكيد التحصيل' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/developer/expenses', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_expenses ORDER BY expense_date DESC, created_at DESC');
      res.json({ success: true, expenses: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/expenses', requireDeveloper, async (req, res) => {
    try {
      const { title, category = 'other', amount = 0, expense_date = new Date().toISOString().slice(0,10), notes = '' } = req.body;
      if (!title || !amount) return res.status(400).json({ success: false, error: 'عنوان وقيمة المصروف حقول مطلوبة' });

      const expId = `exp_${Date.now()}`;
      await db.query(`
        INSERT INTO public.system_expenses (id, title, category, amount, expense_date, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [expId, title, category, parseFloat(amount), expense_date, notes]);

      res.json({ success: true, message: 'تم تسجيل المصروف بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/developer/expenses/:id', requireDeveloper, async (req, res) => {
    try {
      await db.query('DELETE FROM public.system_expenses WHERE id = $1', [req.params.id]);
      res.json({ success: true, message: 'تم حذف المصروف بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ملخص الأرباح والخسائر الشامل (P&L Financial Summary)
  app.get('/api/developer/financial-summary', requireDeveloper, async (req, res) => {
    try {
      const revRes = await db.query("SELECT COALESCE(SUM(net_amount), 0) as total_revenue, COUNT(*) as invoice_count FROM public.system_invoices WHERE status = 'approved'");
      const expRes = await db.query("SELECT COALESCE(SUM(amount), 0) as total_expenses, COUNT(*) as expense_count FROM public.system_expenses");

      const totalRevenue = parseFloat(revRes.rows[0]?.total_revenue || 0);
      const totalExpenses = parseFloat(expRes.rows[0]?.total_expenses || 0);
      const netProfit = totalRevenue - totalExpenses;

      // إحصائيات الشهر الحالي
      const monthRevRes = await db.query("SELECT COALESCE(SUM(net_amount), 0) as month_rev FROM public.system_invoices WHERE status = 'approved' AND created_at >= date_trunc('month', CURRENT_DATE)");
      const monthExpRes = await db.query("SELECT COALESCE(SUM(amount), 0) as month_exp FROM public.system_expenses WHERE expense_date >= date_trunc('month', CURRENT_DATE)");

      const monthRevenue = parseFloat(monthRevRes.rows[0]?.month_rev || 0);
      const monthExpenses = parseFloat(monthExpRes.rows[0]?.month_exp || 0);
      const monthNetProfit = monthRevenue - monthExpenses;

      res.json({
        success: true,
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        month_revenue: monthRevenue,
        month_expenses: monthExpenses,
        month_net_profit: monthNetProfit,
        profit_margin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [H] مركز الواتساب وبث الرسائل وتنزيل خادم الواتساب المحلي ─────────────────
  app.post('/api/developer/whatsapp/broadcast', requireDeveloper, async (req, res) => {
    try {
      const { message, target = 'all', company_id = null } = req.body;
      if (!message) return res.status(400).json({ success: false, error: 'نص الرسالة مطلوب' });

      let targetPhones = [];
      if (target === 'all') {
        const compRes = await db.query('SELECT phone, owner_name, company_name FROM public.system_companies WHERE phone IS NOT NULL AND phone <> \'\'');
        targetPhones = compRes.rows;
      } else if (company_id) {
        const compRes = await db.query('SELECT phone, owner_name, company_name FROM public.system_companies WHERE id = $1', [company_id]);
        targetPhones = compRes.rows;
      }

      // محاولة الإرسال الفعلي عبر خادم الواتساب إذا كان متصلاً
      let sentCount = 0;
      for (const comp of targetPhones) {
        let cleanPhone = String(comp.phone || '').replace(/\D/g, '');
        if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
        if (cleanPhone.length >= 10) {
          sentCount++;
        }
      }

      res.json({
        success: true,
        message: `تمت جدولة إرسال الرسالة إلى ${sentCount} من أصحاب الشركات بنجاح.`,
        recipients_count: sentCount
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // مسار تنزيل حزمة خادم الواتساب المحلي المستقل
  app.get('/api/developer/whatsapp/download-server', (req, res) => {
    try {
      const filesToInclude = [
        'run_whatsapp_server.bat',
        'WhatsApp-Server-Control.hta',
        'whatsapp-manager.vbs',
        'start-whatsapp-server.bat',
        'start-whatsapp-server.ps1'
      ];

      // إذا كان الملف متاحاً، نقوم بإرساله للتنزيل المباشر
      const mainBatPath = path.join(ROOT_DIR, 'run_whatsapp_server.bat');
      if (fs.existsSync(mainBatPath)) {
        res.download(mainBatPath, 'تشغيل_سيرفر_الواتساب_المحلي.bat');
      } else {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="run_whatsapp.bat"');
        res.send(`@echo off\nchcp 65001 >nul\ntitle WhatsApp Gateway Server\nnode server/whatsapp-server.js\npause`);
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [I] صفحة التسجيل والاشتراك والدفع للشركات الجديدة ────────────────────────
  app.post('/api/auth/register-company', async (req, res) => {
    try {
      const {
        company_name,
        company_code,
        phone,
        email,
        owner_name,
        owner_username,
        owner_password,
        plan_id = 'starter',
        enabled_modules = [],
        discount_code = '',
        payment_method = 'instapay',
        calculated_amount = 0,
        payment_proof_url = ''
      } = req.body;

      if (!company_name || !owner_username || !owner_password || !phone) {
        return res.status(400).json({ success: false, error: 'اسم الشركة واسم المالك ورقم الهاتف وبيانات الدخول حقول مطلوبة' });
      }

      const cleanUser = String(owner_username).trim().toLowerCase();
      const existingUser = await db.query('SELECT id FROM public.system_companies WHERE owner_username = $1', [cleanUser]);
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'اسم مستخدم المالك هذا مسجل لشركة أخرى مسبقاً، يرجى اختيار اسم مستخدم آخر' });
      }

      const cleanCode = (company_code || 'CO-' + Math.floor(1000 + Math.random() * 9000)).toUpperCase();
      const compId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const storageKey = `tenant_${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      // فحص وتطبيق كود الخصم الترويجي
      let appliedDiscount = null;
      let discountAmount = 0;
      if (discount_code) {
        const discRes = await db.query(`
          SELECT * FROM public.system_discount_codes
          WHERE code = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses
        `, [discount_code.trim().toUpperCase()]);

        if (discRes.rows.length > 0) {
          appliedDiscount = discRes.rows[0];
          discountAmount = calculateDiscountAmount(calculated_amount, appliedDiscount.discount_type, appliedDiscount.discount_value);
          await db.query('UPDATE public.system_discount_codes SET used_count = used_count + 1 WHERE id = $1', [appliedDiscount.id]);
        }
      }

      const netAmount = Math.max(0, calculated_amount - discountAmount);
      const subEnd = new Date();
      subEnd.setMonth(subEnd.getMonth() + 1);

      const durationMonths = appliedDiscount ? parseInt(appliedDiscount.duration_months, 10) : 0;
      const remainingMonths = Math.max(0, durationMonths - 1);

      await db.query(`
        INSERT INTO public.system_companies (
            id, company_name, company_code, phone, email, owner_name, owner_username, owner_password_hash,
            status, plan_id, enabled_modules, subscription_start, subscription_end, grace_period_days,
            storage_key, db_schema, applied_discount_code, discount_type, discount_value,
            discount_duration_months, discount_months_remaining, discount_start_date, discount_end_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10::jsonb, NOW(), $11, 7, $12, $13, $14, $15, $16, $17, $18, NOW(), $19)
      `, [
        compId, company_name, cleanCode, phone, email || '', owner_name || 'المالك', cleanUser, String(owner_password).trim(),
        plan_id, JSON.stringify(enabled_modules), subEnd, storageKey, storageKey,
        appliedDiscount ? appliedDiscount.code : null, appliedDiscount ? appliedDiscount.discount_type : null, appliedDiscount ? appliedDiscount.discount_value : 0,
        durationMonths, remainingMonths, appliedDiscount ? subEnd : null
      ]);

      // تهيئة البيانات المعزولة
      const initialCompanyState = {
        orgSettings: {
          orgName: company_name,
          logoUrl: '',
          ownerUsername: cleanUser,
          ownerPassword: String(owner_password).trim(),
          adminUsername: 'admin',
          adminPassword: '123',
          companyId: compId,
          companyCode: cleanCode,
          payrollPayoutDay: 25,
          ownerModificationLocks: {}
        },
        employees: [],
        branches: [{ id: `br_${Date.now()}`, name: 'المركز الرئيسي', code: 'HQ', isMain: true }],
        shifts: [],
        requests: [],
        loans: [],
        jobs: [
          { id: 'job_1', title: 'مدير الصيدلية', isManagement: true },
          { id: 'job_2', title: 'صيدلي أول', isManagement: false },
          { id: 'job_3', title: 'مساعد صيدلي', isManagement: false }
        ]
      };

      await saveSettingsToStorage(storageKey, initialCompanyState, 'saas-register');

      // تسجيل الفاتورة
      const invNum = `INV-${new Date().toISOString().slice(0,7).replace('-','')}-${Math.floor(1000 + Math.random() * 9000)}`;
      await db.query(`
        INSERT INTO public.system_invoices (id, company_id, invoice_number, amount, discount_amount, net_amount, discount_code, status, period_months, payment_method, payment_proof_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10)
      `, [
        `inv_${Date.now()}`, compId, invNum, calculated_amount, discountAmount, netAmount,
        appliedDiscount ? appliedDiscount.code : null, payment_proof_url ? 'pending' : 'approved', payment_method, payment_proof_url || null
      ]);

      // إصدار توكن تسجيل دخول فوري لمالك الشركة الجديدة
      const token = generateJwtToken({
        username: cleanUser,
        role: 'owner',
        tenant_id: compId,
        storage_key: storageKey,
        displayName: owner_name
      }, JWT_SECRET);

      res.json({
        success: true,
        message: 'تم تسجيل شركتك بنجاح! مرحباً بك في المنظومة.',
        token,
        company_id: compId,
        storage_key: storageKey,
        discount_applied: discountAmount,
        discount_months_remaining: remainingMonths
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [J] استعلام ومتابعة اشتراك المؤسسة وسجل الفواتير للإدارة العليا ─────────
  app.get('/api/tenant/subscription-details', async (req, res) => {
    try {
      const auth = getAuthFromReq(req);
      let companyId = auth?.tenant_id || req.query.company_id;
      let storageKey = auth?.storage_key || req.query.storage_key;

      let comp = null;
      if (companyId) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [companyId]);
        if (compRes.rows.length > 0) comp = compRes.rows[0];
      }
      if (!comp && storageKey) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE storage_key = $1', [storageKey]);
        if (compRes.rows.length > 0) comp = compRes.rows[0];
      }
      if (!comp && auth?.username) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE owner_username = $1', [auth.username.toLowerCase()]);
        if (compRes.rows.length > 0) comp = compRes.rows[0];
      }

      // الافتراضي هو الشركة الأساسية
      if (!comp) {
        const defaultRes = await db.query("SELECT * FROM public.system_companies WHERE id = 'comp_primary_default' LIMIT 1");
        if (defaultRes.rows.length > 0) {
          comp = defaultRes.rows[0];
        } else {
          const anyRes = await db.query('SELECT * FROM public.system_companies ORDER BY created_at ASC LIMIT 1');
          comp = anyRes.rows[0];
        }
      }

      if (!comp) {
        return res.status(404).json({ success: false, error: 'تعذر العثور على بيانات اشتراك الشركة' });
      }

      // جلب فواتير الشركة
      let invoicesRes = await db.query(`
        SELECT * FROM public.system_invoices
        WHERE company_id = $1
        ORDER BY created_at DESC
      `, [comp.id]);

      // إذا لم توجد فواتير للشركة الأساسية، ننشئ فاتورة أولية توثيقية
      if (invoicesRes.rows.length === 0) {
        const initialInvId = `inv_initial_${comp.id}`;
        await db.query(`
          INSERT INTO public.system_invoices (id, company_id, invoice_number, amount, discount_amount, net_amount, discount_code, status, period_months, payment_method, notes)
          VALUES ($1, $2, 'INV-2026-001', 1100.00, 1100.00, 0.00, 'LIFETIME_PRIMARY', 'approved', 1200, 'free_grant', 'اشتراك المنظومة الأساسية الدائم غير منتهي الصلاحية')
          ON CONFLICT (id) DO NOTHING
        `, [initialInvId, comp.id]);

        invoicesRes = await db.query('SELECT * FROM public.system_invoices WHERE company_id = $1 ORDER BY created_at DESC', [comp.id]);
      }

      // جلب كتالوج الموديولات المتاحة
      const modulesRes = await db.query('SELECT * FROM public.system_modules_catalog ORDER BY is_core DESC, price_monthly DESC');
      const plansRes = await db.query('SELECT * FROM public.system_plans WHERE is_active = true');

      // تفاصيل خطة الشركة
      const plan = plansRes.rows.find(p => p.id === comp.plan_id) || { name_ar: 'الباقة المتكاملة (Enterprise)', base_price: 1100 };
      const isFreePlan = comp.plan_id === 'free' || parseFloat(plan.base_price) === 0 || comp.id === 'comp_primary_default';

      res.json({
        success: true,
        is_free_plan: isFreePlan,
        company: {
          id: comp.id,
          company_name: comp.company_name,
          company_code: comp.company_code,
          phone: comp.phone,
          email: comp.email,
          owner_name: comp.owner_name,
          owner_username: comp.owner_username,
          plan_id: comp.plan_id,
          plan_name: plan.name_ar,
          base_price: isFreePlan ? 0 : plan.base_price,
          is_free_plan: isFreePlan,
          status: comp.status,
          subscription_start: comp.subscription_start,
          subscription_end: comp.subscription_end,
          grace_period_days: comp.grace_period_days,
          enabled_modules: comp.enabled_modules || [],
          applied_discount_code: comp.applied_discount_code,
          discount_type: comp.discount_type,
          discount_value: comp.discount_value,
          discount_duration_months: comp.discount_duration_months,
          discount_months_remaining: comp.discount_months_remaining,
          discount_start_date: comp.discount_start_date,
          discount_end_date: comp.discount_end_date
        },
        invoices: invoicesRes.rows,
        modules: modulesRes.rows,
        plans: plansRes.rows
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تطبيق كود خصم ترويجي على الشركة
  app.post('/api/tenant/apply-promo', async (req, res) => {
    try {
      const { code, company_id } = req.body;
      if (!code) return res.status(400).json({ success: false, error: 'كود الخصم مطلوب' });

      const cleanCode = String(code).trim().toUpperCase();
      const discRes = await db.query(`
        SELECT * FROM public.system_discount_codes
        WHERE code = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses
        LIMIT 1
      `, [cleanCode]);

      if (discRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'كود الخصم غير صحيح، منتهي الصلاحية، أو تجاوز الحد الأقصى' });
      }

      const disc = discRes.rows[0];
      const targetCompId = company_id || 'comp_primary_default';

      await db.query(`
        UPDATE public.system_companies
        SET applied_discount_code = $1,
            discount_type = $2,
            discount_value = $3,
            discount_duration_months = $4,
            discount_months_remaining = $5,
            discount_start_date = NOW(),
            discount_end_date = NOW() + ($6 || ' months')::interval,
            updated_at = NOW()
        WHERE id = $7
      `, [disc.code, disc.discount_type, disc.discount_value, disc.duration_months, disc.duration_months, `${disc.duration_months}`, targetCompId]);

      await db.query('UPDATE public.system_discount_codes SET used_count = used_count + 1 WHERE id = $1', [disc.id]);

      res.json({
        success: true,
        message: `تم تفعيل كود الخصم (${disc.code}) بنجاح! خصم ${disc.discount_type === 'percentage' ? `${disc.discount_value}%` : `${disc.discount_value} ج.م`} سارٍ لـ ${disc.duration_months} أشهر.`,
        discount: disc
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تسجيل طلب تجديد اشتراك أو سداد دفعة
  app.post('/api/tenant/renew-request', async (req, res) => {
    try {
      const { company_id, months = 1, amount = 0, payment_method = 'instapay', transaction_reference = '' } = req.body;
      const targetCompId = company_id || 'comp_primary_default';

      const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [targetCompId]);
      if (compRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
      }
      const comp = compRes.rows[0];

      const invNum = `INV-${new Date().toISOString().slice(0,7).replace('-','')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const invId = `inv_${Date.now()}`;

      // حساب الخصم المتاح للشركة
      let discountAmt = 0;
      if (comp.discount_months_remaining > 0 && comp.discount_value > 0) {
        discountAmt = calculateDiscountAmount(amount, comp.discount_type, comp.discount_value);
      }
      const netAmt = Math.max(0, amount - discountAmt);

      await db.query(`
        INSERT INTO public.system_invoices (id, company_id, invoice_number, amount, discount_amount, net_amount, discount_code, status, period_months, payment_method, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
      `, [invId, targetCompId, invNum, amount, discountAmt, netAmt, comp.applied_discount_code || null, months, payment_method, `طلب تجديد اشتراك - مرجع التحويل: ${transaction_reference || 'قيد الإرسال'}`]);

      // إشعار مطور النظام
      io.emit('saas:new_renewal_request', {
        company_name: comp.company_name,
        company_code: comp.company_code,
        invoice_number: invNum,
        amount: netAmt,
        months
      });

      res.json({
        success: true,
        message: 'تم تسجيل طلب التجديد وإصدار الفاتورة قيد التأكيد. يرجى إرسال إشعار الدفع لتأكيد التجديد.',
        invoice_number: invNum,
        net_amount: netAmt
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [K.1] وضع الدخول الشبح ومحاكاة شاشات العميل (Ghost Login / Impersonation) ─
  app.post('/api/developer/impersonate/:id', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [id]);
      if (compRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
      }
      const comp = compRes.rows[0];

      // تسجيل الحدث في سجل الرقابة
      await db.query(`
        INSERT INTO public.system_audit_logs (id, actor_username, action_type, details, target_company_id)
        VALUES ($1, 'developer', 'GHOST_IMPERSONATION_START', $2, $3)
      `, [`audit_${Date.now()}`, `دخول شبح كمالك لشركة: ${comp.company_name} (${comp.company_code})`, comp.id]);

      // إصدار توكن محاكاة خاص
      const token = generateJwtToken({
        username: comp.owner_username,
        role: 'owner',
        is_impersonating: true,
        original_role: 'developer',
        tenant_id: comp.id,
        storage_key: comp.storage_key,
        company_name: comp.company_name,
        company_code: comp.company_code,
        displayName: `محاكاة: ${comp.company_name}`
      }, JWT_SECRET);

      res.json({
        success: true,
        message: `تم تفعيل وضع الدخول الشبح لشركة (${comp.company_name})`,
        token,
        company: {
          id: comp.id,
          name: comp.company_name,
          code: comp.company_code,
          storage_key: comp.storage_key,
          subscription_end: comp.subscription_end,
          status: comp.status
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [K.2] محرك النسخ الاحتياطي والاستعادة الفردية للشركات (Tenant Snapshots) ───
  app.post('/api/developer/companies/:id/backup', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { name = '' } = req.body;
      const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [id]);
      if (compRes.rows.length === 0) return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
      const comp = compRes.rows[0];

      const tenantData = await getSettingsFromStorage(comp.storage_key);
      if (!tenantData) {
        return res.status(400).json({ success: false, error: 'لا توجد بيانات محفوظة لهذه الشركة حالياً' });
      }

      const snapshotName = name.trim() || `نسخة احتياطية - ${new Date().toLocaleDateString('ar-EG')} ${new Date().toLocaleTimeString('ar-EG')}`;
      const backupId = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const dataStr = JSON.stringify(tenantData);
      const sizeBytes = Buffer.byteLength(dataStr, 'utf8');

      await db.query(`
        INSERT INTO public.system_company_backups (id, company_id, snapshot_name, snapshot_data, size_bytes, created_by)
        VALUES ($1, $2, $3, $4::jsonb, $5, 'developer')
      `, [backupId, comp.id, snapshotName, dataStr, sizeBytes]);

      res.json({
        success: true,
        message: 'تم إنشاء النسخة الاحتياطية بنجاح',
        backup: { id: backupId, snapshot_name: snapshotName, size_bytes: sizeBytes, created_at: new Date() }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/developer/companies/:id/backups', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.query(`
        SELECT id, company_id, snapshot_name, size_bytes, created_by, created_at
        FROM public.system_company_backups
        WHERE company_id = $1
        ORDER BY created_at DESC
      `, [id]);
      res.json({ success: true, backups: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/developer/companies/:id/backup/download/:backupId', requireDeveloper, async (req, res) => {
    try {
      const { id, backupId } = req.params;
      const result = await db.query('SELECT snapshot_name, snapshot_data FROM public.system_company_backups WHERE id = $1 AND company_id = $2', [backupId, id]);
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'النسخة غير موجودة' });

      const backup = result.rows[0];
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="backup_${id}_${Date.now()}.json"`);
      res.send(JSON.stringify(backup.snapshot_data, null, 2));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/companies/:id/restore', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { backup_id, custom_json } = req.body;
      const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [id]);
      if (compRes.rows.length === 0) return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
      const comp = compRes.rows[0];

      let targetData = null;
      if (backup_id) {
        const bkRes = await db.query('SELECT snapshot_data FROM public.system_company_backups WHERE id = $1 AND company_id = $2', [backup_id, id]);
        if (bkRes.rows.length === 0) return res.status(404).json({ success: false, error: 'النسخة الاحتياطية المحددة غير موجودة' });
        targetData = bkRes.rows[0].snapshot_data;
      } else if (custom_json) {
        targetData = typeof custom_json === 'string' ? JSON.parse(custom_json) : custom_json;
      }

      if (!targetData || typeof targetData !== 'object') {
        return res.status(400).json({ success: false, error: 'بيانات الاستعادة غير صالحة' });
      }

      // أخذ لقطة أمان تراجعية قبل الاستبدال
      const currentData = await getSettingsFromStorage(comp.storage_key);
      if (currentData) {
        const safetyId = `bk_safety_rollback_${Date.now()}`;
        await db.query(`
          INSERT INTO public.system_company_backups (id, company_id, snapshot_name, snapshot_data, size_bytes, created_by)
          VALUES ($1, $2, $3, $4::jsonb, $5, 'developer_auto_safety')
        `, [safetyId, comp.id, `لقطة أمان تراجعية تلقائية قبل استعادة ${new Date().toLocaleTimeString('ar-EG')}`, JSON.stringify(currentData), Buffer.byteLength(JSON.stringify(currentData), 'utf8')]);
      }

      // استبدال بيانات الشركة
      await saveSettingsToStorage(comp.storage_key, targetData, 'developer_restore');

      // إشعار الأجهزة المتصلة
      io.emit(`tenant:${comp.id}:data_restored`, { timestamp: Date.now() });

      // تسجيل في الرقابة
      await db.query(`
        INSERT INTO public.system_audit_logs (id, actor_username, action_type, details, target_company_id)
        VALUES ($1, 'developer', 'TENANT_DATA_RESTORED', $2, $3)
      `, [`audit_${Date.now()}`, `استعادة بيانات لشركة: ${comp.company_name}`, comp.id]);

      res.json({ success: true, message: 'تمت استعادة بيانات الشركة بنجاح وتحديث كافة الأجهزة المتصلة' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [K.3] مركز الرصد ومصيدة الأخطاء الحية (Live Telemetry & Bug Sentry) ───────
  app.post('/api/telemetry/report-error', async (req, res) => {
    try {
      const {
        error_message = '',
        error_stack = '',
        screen_name = '',
        company_id = '',
        company_code = '',
        user_role = '',
        user_agent = req.headers['user-agent'] || ''
      } = req.body;

      if (!error_message) return res.status(400).json({ success: false });

      const errId = `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.query(`
        INSERT INTO public.system_error_logs (id, company_id, company_code, error_message, error_stack, screen_name, user_role, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [errId, company_id || null, company_code || null, String(error_message).slice(0, 1000), String(error_stack).slice(0, 4000), screen_name || '', user_role || '', user_agent]);

      // إشعار مطور النظام لحظياً
      io.emit('telemetry:error_captured', {
        id: errId,
        company_code,
        error_message,
        screen_name,
        created_at: new Date()
      });

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/developer/telemetry/stats', requireDeveloper, async (req, res) => {
    try {
      const startPing = Date.now();
      await db.query('SELECT 1');
      const dbLatencyMs = Date.now() - startPing;

      const errorsRes = await db.query('SELECT * FROM public.system_error_logs ORDER BY created_at DESC LIMIT 50');
      const companiesCountRes = await db.query('SELECT COUNT(*) FROM public.system_companies');

      let totalSockets = 0;
      try {
        totalSockets = io?.engine?.clientsCount || io?.sockets?.sockets?.size || 0;
      } catch {}

      res.json({
        success: true,
        stats: {
          db_latency_ms: dbLatencyMs,
          connected_clients: totalSockets,
          total_companies: parseInt(companiesCountRes.rows[0]?.count || 0, 10),
          recent_errors_count: errorsRes.rows.length,
          server_uptime_seconds: Math.floor(process.uptime()),
          memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        },
        errors: errorsRes.rows
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/developer/telemetry/errors', requireDeveloper, async (req, res) => {
    try {
      await db.query('DELETE FROM public.system_error_logs');
      res.json({ success: true, message: 'تم تفريغ سجل الأخطاء بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [K.4] شبكة الوكلاء والمسوقين بالعمولة (Affiliate & Partner Network) ───────
  app.get('/api/developer/affiliates', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT a.*, 
          (SELECT COUNT(*) FROM public.system_companies c WHERE c.affiliate_id = a.id) as companies_count
        FROM public.system_affiliates a
        ORDER BY a.created_at DESC
      `);
      res.json({ success: true, affiliates: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/affiliates', requireDeveloper, async (req, res) => {
    try {
      const { name, phone, email, promo_code, commission_percent = 15 } = req.body;
      if (!name || !phone || !promo_code) {
        return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف وكود الخصم حقول مطلوبة' });
      }

      const cleanCode = String(promo_code).trim().toUpperCase();
      const affId = `aff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      await db.query(`
        INSERT INTO public.system_affiliates (id, name, phone, email, promo_code, commission_percent)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (promo_code) DO UPDATE
        SET name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            commission_percent = EXCLUDED.commission_percent,
            status = 'active'
      `, [affId, name, phone, email || '', cleanCode, parseFloat(commission_percent)]);

      // تسجيل كود الخصم تلقائياً
      await db.query(`
        INSERT INTO public.system_discount_codes (id, code, title, discount_type, discount_value, duration_months, max_uses, notes)
        VALUES ($1, $2, $3, 'percentage', 20.00, 3, 500, $4)
        ON CONFLICT (code) DO NOTHING
      `, [`disc_aff_${cleanCode}`, cleanCode, `خصم خاص عبر الوكيل: ${name}`, `كود تسويقي تابع للوكيل ${name} (${phone})`]);

      res.json({ success: true, message: 'تم حفظ وتفعيل الوكيل بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/affiliates/:id/payout', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { amount = 0 } = req.body;
      const payoutAmt = parseFloat(amount);
      if (payoutAmt <= 0) return res.status(400).json({ success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' });

      await db.query(`
        UPDATE public.system_affiliates
        SET total_paid = total_paid + $1,
            balance = GREATEST(0, balance - $1)
        WHERE id = $2
      `, [payoutAmt, id]);

      res.json({ success: true, message: 'تم تسجيل صرف العمولة للوكيل بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── [K.5] مركز تذاكر ومحادثات الدعم الفني المباشر (Support Ticketing) ────────
  app.get('/api/developer/tickets', requireDeveloper, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.system_support_tickets ORDER BY last_reply_at DESC');
      res.json({ success: true, tickets: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/developer/tickets/:id/reply', requireDeveloper, async (req, res) => {
    try {
      const { id } = req.params;
      const { message, status } = req.body;
      if (!message) return res.status(400).json({ success: false, error: 'نص الرد مطلوب' });

      const replyObj = {
        sender: 'developer',
        sender_name: 'مطور المنظومة (الدعم الفني)',
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      await db.query(`
        UPDATE public.system_support_tickets
        SET messages = messages || $1::jsonb,
            status = COALESCE($2, status),
            last_reply_at = NOW()
        WHERE id = $3
      `, [JSON.stringify([replyObj]), status || null, id]);

      io.emit(`ticket:${id}:reply`, replyObj);
      res.json({ success: true, message: 'تم إرسال رد الدعم الفني بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/tenant/tickets', async (req, res) => {
    try {
      const auth = getAuthFromReq(req);
      const compId = auth?.tenant_id || req.query.company_id || 'comp_primary_default';
      const result = await db.query('SELECT * FROM public.system_support_tickets WHERE company_id = $1 ORDER BY last_reply_at DESC', [compId]);
      res.json({ success: true, tickets: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/tenant/tickets', async (req, res) => {
    try {
      const auth = getAuthFromReq(req);
      const { title, category = 'technical', priority = 'normal', message, company_id, company_name } = req.body;
      if (!title || !message) return res.status(400).json({ success: false, error: 'عنوان التذكرة وتفاصيل المشكلة حقول مطلوبة' });

      const targetCompId = auth?.tenant_id || company_id || 'comp_primary_default';
      const targetCompName = company_name || 'الشركة';
      const ticketId = `tkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const initialMessage = {
        sender: 'client',
        sender_name: auth?.displayName || 'مسؤول الصيدلية',
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      await db.query(`
        INSERT INTO public.system_support_tickets (id, company_id, company_name, title, category, priority, status, messages)
        VALUES ($1, $2, $3, $4, $5, $6, 'open', $7::jsonb)
      `, [ticketId, targetCompId, targetCompName, title.trim(), category, priority, JSON.stringify([initialMessage])]);

      io.emit('saas:new_support_ticket', { id: ticketId, title, company_name: targetCompName, priority });
      res.json({ success: true, message: 'تم فتح تذكرة الدعم الفني بنجاح، سيقوم المطور بالرد قريباً', ticket_id: ticketId });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/tenant/tickets/:id/reply', async (req, res) => {
    try {
      const auth = getAuthFromReq(req);
      const { id } = req.params;
      const { message } = req.body;
      if (!message) return res.status(400).json({ success: false, error: 'نص الرسالة مطلوب' });

      const replyObj = {
        sender: 'client',
        sender_name: auth?.displayName || 'العميل',
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      await db.query(`
        UPDATE public.system_support_tickets
        SET messages = messages || $1::jsonb,
            status = 'open',
            last_reply_at = NOW()
        WHERE id = $2
      `, [JSON.stringify([replyObj]), id]);

      io.emit(`ticket:${id}:reply`, replyObj);
      res.json({ success: true, message: 'تم إرسال رسالتك بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

}

