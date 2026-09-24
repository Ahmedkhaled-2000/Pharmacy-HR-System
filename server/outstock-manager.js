/**
 * outstock-manager.js
 * نظام إدارة ومتابعة نواقص وطلبات أدوية العملاء والفروع وإدارة المشتريات (OutStock Handling System)
 * صُمم بأعلى المعايير الهندسية للمزامنة الفورية وقواعد البيانات المعزولة
 */

import crypto from 'crypto';

// ── توليد توكن مصادقة آمن ──────────────────────────────────────────────────
function generateToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 * 30 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// ── التحقق من التوكن ───────────────────────────────────────────────────────
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function toStdDigits(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0]/g, '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
}

// ── 1. تهيئة جداول النظام في قاعدة بيانات PostgreSQL ─────────────────────────
export async function initOutstockTables(db) {
  try {
    const schemaSql = `
      -- 1. جدول مستخدمي نظام النواقص (معزول عن يوزرات الرواتب)
      CREATE TABLE IF NOT EXISTS public.outstock_users (
          id VARCHAR(36) PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          full_name VARCHAR(150) NOT NULL,
          role VARCHAR(50) NOT NULL, -- 'owner', 'procurement', 'branch'
          branch_id VARCHAR(50) NULL,
          phone VARCHAR(50) NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_users_user ON public.outstock_users (username);
      CREATE INDEX IF NOT EXISTS idx_outstock_users_branch ON public.outstock_users (branch_id);

      -- 2. جدول صلاحيات مسؤولي المشتريات المساعدين (فروع محددة)
      CREATE TABLE IF NOT EXISTS public.outstock_user_branch_access (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL REFERENCES public.outstock_users(id) ON DELETE CASCADE,
          branch_id VARCHAR(50) NOT NULL,
          assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_outstock_user_branch UNIQUE (user_id, branch_id)
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_user_branch ON public.outstock_user_branch_access (user_id, branch_id);

      -- 3. جدول فروع النواقص والمشتريات (مربوط بفروع المنظومة الرئيسية)
      CREATE TABLE IF NOT EXISTS public.outstock_branches (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(50) NULL,
          phone VARCHAR(50) NULL,
          address TEXT NULL,
          username VARCHAR(100) NULL,
          password VARCHAR(255) NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 4. جدول العملاء المسجلين (رقم الواتساب فريد قطيعاً)
      CREATE TABLE IF NOT EXISTS public.outstock_customers (
          id VARCHAR(36) PRIMARY KEY,
          customer_code VARCHAR(50) NOT NULL UNIQUE,
          full_name VARCHAR(150) NOT NULL,
          whatsapp_phone VARCHAR(30) NOT NULL UNIQUE,
          landline_phone VARCHAR(30) NULL,
          address TEXT NULL,
          primary_branch_id VARCHAR(50) NOT NULL,
          notes TEXT NULL,
          total_orders_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_cust_phone ON public.outstock_customers (whatsapp_phone);
      CREATE INDEX IF NOT EXISTS idx_outstock_cust_name ON public.outstock_customers (full_name);
      CREATE INDEX IF NOT EXISTS idx_outstock_cust_branch ON public.outstock_customers (primary_branch_id);

      -- 5. جدول طلبات العملاء الرئيسية
      CREATE TABLE IF NOT EXISTS public.outstock_orders (
          id VARCHAR(36) PRIMARY KEY,
          order_number VARCHAR(50) NOT NULL UNIQUE,
          branch_id VARCHAR(50) NOT NULL,
          customer_id VARCHAR(36) NOT NULL REFERENCES public.outstock_customers(id) ON DELETE RESTRICT,
          total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          remaining_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          discount_type VARCHAR(20) NOT NULL DEFAULT 'none',
          discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          net_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          order_status VARCHAR(50) NOT NULL DEFAULT 'pending_procurement',
          expected_pickup_date DATE NULL,
          expected_pickup_time VARCHAR(50) NULL,
          responsible_pharmacist VARCHAR(100) NOT NULL,
          customer_notes TEXT NULL,
          barcode_data VARCHAR(100) NOT NULL,
          delivered_at TIMESTAMPTZ NULL,
          whatsapp_notified_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_orders_branch ON public.outstock_orders (branch_id, order_status);
      CREATE INDEX IF NOT EXISTS idx_outstock_orders_cust ON public.outstock_orders (customer_id);
      CREATE INDEX IF NOT EXISTS idx_outstock_orders_barcode ON public.outstock_orders (barcode_data);
      CREATE INDEX IF NOT EXISTS idx_outstock_orders_status ON public.outstock_orders (order_status);

      -- 6. جدول بنود الأدوية بالطلب
      CREATE TABLE IF NOT EXISTS public.outstock_order_items (
          id VARCHAR(36) PRIMARY KEY,
          order_id VARCHAR(36) NOT NULL REFERENCES public.outstock_orders(id) ON DELETE CASCADE,
          medication_name VARCHAR(255) NOT NULL,
          unit_type VARCHAR(20) NOT NULL DEFAULT 'pack', -- 'pack', 'strip'
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          item_status VARCHAR(50) NOT NULL DEFAULT 'pending',
          procurement_notes TEXT NULL,
          pruned_from_bill BOOLEAN NOT NULL DEFAULT false,
          pruned_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_items_order ON public.outstock_order_items (order_id);
      CREATE INDEX IF NOT EXISTS idx_outstock_items_med ON public.outstock_order_items (medication_name);
      CREATE INDEX IF NOT EXISTS idx_outstock_items_status ON public.outstock_order_items (item_status);

      -- 7. جدول أدوية النواقص والعملاء المرتبطين
      CREATE TABLE IF NOT EXISTS public.outstock_deficiencies (
          id VARCHAR(36) PRIMARY KEY,
          branch_id VARCHAR(50) NOT NULL,
          medication_name VARCHAR(255) NOT NULL,
          unit_type VARCHAR(20) NOT NULL DEFAULT 'pack',
          customer_id VARCHAR(36) NOT NULL REFERENCES public.outstock_customers(id) ON DELETE CASCADE,
          original_order_id VARCHAR(36) NOT NULL REFERENCES public.outstock_orders(id) ON DELETE CASCADE,
          original_item_id VARCHAR(36) NOT NULL REFERENCES public.outstock_order_items(id) ON DELETE CASCADE,
          requested_quantity INTEGER NOT NULL DEFAULT 1,
          status VARCHAR(50) NOT NULL DEFAULT 'market_shortage',
          restocked_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_defic_branch ON public.outstock_deficiencies (branch_id);
      CREATE INDEX IF NOT EXISTS idx_outstock_defic_med ON public.outstock_deficiencies (medication_name);
      CREATE INDEX IF NOT EXISTS idx_outstock_defic_cust ON public.outstock_deficiencies (customer_id);

      -- 8. جدول رصيد أصناف النواقص المستلمة بالفرع
      CREATE TABLE IF NOT EXISTS public.outstock_branch_stock (
          id VARCHAR(36) PRIMARY KEY,
          branch_id VARCHAR(50) NOT NULL,
          medication_name VARCHAR(255) NOT NULL,
          unit_type VARCHAR(20) NOT NULL DEFAULT 'pack',
          available_quantity INTEGER NOT NULL DEFAULT 0,
          delivered_quantity INTEGER NOT NULL DEFAULT 0,
          last_procured_at TIMESTAMPTZ NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_outstock_branch_stock UNIQUE (branch_id, medication_name, unit_type)
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_stock_branch ON public.outstock_branch_stock (branch_id);

      -- 9. جدول سجل الرقابة والعمليات
      CREATE TABLE IF NOT EXISTS public.outstock_audit_logs (
          id BIGSERIAL PRIMARY KEY,
          user_id VARCHAR(36) NULL,
          username VARCHAR(100) NULL,
          branch_id VARCHAR(50) NULL,
          action_type VARCHAR(100) NOT NULL,
          target_entity VARCHAR(50) NOT NULL,
          target_id VARCHAR(100) NOT NULL,
          details_json JSONB NULL,
          client_ip VARCHAR(45) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_audit_created ON public.outstock_audit_logs (created_at DESC);
    `;

    await db.query(schemaSql);
    console.log('✅ [OutStock Engine] تم إنشاء والتحقق من جداول نظام النواقص والمشتريات بنجاح.');

    // غرس حساب المالك الافتراضي (out / 123)
    const checkOwner = await db.query("SELECT id FROM public.outstock_users WHERE username = 'out'");
    if (checkOwner.rows.length === 0) {
      await db.query(`
        INSERT INTO public.outstock_users (id, username, password, full_name, role, is_active)
        VALUES ('outstock_owner_root', 'out', '123', 'المالك والمشرف العام (OutStock Master)', 'owner', true)
      `);
      console.log('👑 [OutStock Engine] تم إنشاء حساب المالك المبدئي بنجاح (المستخدم: out / كلمة المرور: 123)');
    }

    // مزامنة فروع الـ HR المسجلة في app_settings تلقائياً (دليل الفروع فقط دون لمس بيانات الدخول)
    try {
      const settingsRes = await db.query("SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
      const settingsData = settingsRes.rows[0]?.value_data;
      if (settingsData && Array.isArray(settingsData.branches)) {
        for (const b of settingsData.branches) {
          if (!b || !b.id || !b.name) continue;
          const bCode = b.branchCode || b.code || b.id;
          const bPhone = b.phone || (Array.isArray(b.phones) && b.phones[0]?.number) || null;

          // مزامنة معلومات الفرع الأساسية فقط دون لمس أو نسخ يوزر وباسورد الـ HR إطلاقاً
          await db.query(`
            INSERT INTO public.outstock_branches (id, name, code, phone, address, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              code = EXCLUDED.code,
              phone = COALESCE(EXCLUDED.phone, public.outstock_branches.phone),
              address = COALESCE(EXCLUDED.address, public.outstock_branches.address),
              updated_at = CURRENT_TIMESTAMP
          `, [String(b.id), String(b.name), bCode, bPhone, b.address || null]);
        }
        console.log(`🏢 [OutStock Engine] تمت مزامنة دليل ${settingsData.branches.length} فروع من منظومة الرواتب بنجاح (مع عزل بيانات الدخول).`);
      }
    } catch (syncErr) {
      console.warn('⚠️ [OutStock Sync Startup Warn]:', syncErr.message);
    }
  } catch (err) {
    console.error('❌ [OutStock Engine] خطأ في تهيئة جداول النواقص:', err.message);
  }
}

// ── فحص تعارض اسم المستخدم مع منظومة الـ HR ──────────────────────────────
export async function checkUsernameCollisionWithHr(username, db, getSettingsFromStorage) {
  if (!username) return null;
  const cleanUser = String(username).trim().toLowerCase();
  const stdUser = toStdDigits(cleanUser);

  // 1. فحص أسماء الحسابات الأساسية في HR
  if (['admin', 'owner', 'developer', 'superadmin', 'root'].includes(cleanUser)) {
    return `اسم المستخدم "${username}" محجوز لإدارة المنظومة الرئيسية (HR).`;
  }

  // 2. فحص إعدادات المنظومة (فروع وموظفي الـ HR)
  try {
    let settings = null;
    if (typeof getSettingsFromStorage === 'function') {
      settings = await getSettingsFromStorage('pharmacy-tracker-data');
    }
    if (!settings && db) {
      const res = await db.query("SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
      settings = res.rows[0]?.value_data;
    }

    if (settings) {
      const org = settings.orgSettings || {};
      const ownerUser = String(org.ownerUsername || 'owner').toLowerCase();
      const adminUser = String(org.adminUsername || org.adminUser || 'admin').toLowerCase();
      if (cleanUser === ownerUser || (stdUser && toStdDigits(ownerUser) === stdUser)) {
        return `اسم المستخدم "${username}" محجوز لحساب مالك المنظومة (Owner).`;
      }
      if (cleanUser === adminUser || (stdUser && toStdDigits(adminUser) === stdUser)) {
        return `اسم المستخدم "${username}" محجوز لحساب أدمن المنظومة (Admin).`;
      }

      // فحص فروع الـ HR
      if (Array.isArray(settings.branches)) {
        const foundHrBranch = settings.branches.find(b => {
          if (!b) return false;
          const bUser = String(b.username || '').trim().toLowerCase();
          const bCode = String(b.branchCode || b.code || '').trim().toLowerCase();
          const bId = String(b.id || '').trim().toLowerCase();
          return (
            bUser === cleanUser ||
            bCode === cleanUser ||
            bId === cleanUser ||
            (stdUser && (toStdDigits(bUser) === stdUser || toStdDigits(bCode) === stdUser || toStdDigits(bId) === stdUser))
          );
        });
        if (foundHrBranch) {
          return `⛔ لا يمكن استخدام اسم المستخدم "${username}" لأنه مستخدم بالفعل لفرع (${foundHrBranch.name}) في نظام الـ HR. يرجى تخصيص اسم مستخدم مستقل لنظام النواقص والمشتريات (OutStock) مثل: out_${cleanUser}`;
        }
      }

      // فحص موظفي الـ HR
      if (Array.isArray(settings.employees)) {
        const foundEmp = settings.employees.find(e => {
          if (!e) return false;
          const eCode = String(e.code || e.employeeCode || '').trim().toLowerCase();
          const eUser = String(e.username || '').trim().toLowerCase();
          return (
            eCode === cleanUser ||
            eUser === cleanUser ||
            (stdUser && (toStdDigits(eCode) === stdUser || toStdDigits(eUser) === stdUser))
          );
        });
        if (foundEmp) {
          return `⛔ لا يمكن استخدام اسم المستخدم "${username}" لأنه كود/اسم مستخدم لموظف (${foundEmp.name || foundEmp.fullName}) في نظام الـ HR.`;
        }
      }
    }
  } catch (err) {
    console.warn('[checkUsernameCollisionWithHr Warn]:', err.message);
  }

  return null; // لا يوجد تعارض
}

// ── 2. تسجيل مسارات الـ API وخادم المزامنة ────────────────────────────────────
export function registerOutstockRoutes(app, db, io, JWT_SECRET, getSettingsFromStorage) {
  // دالة بث موحدة وآمنة عبر Socket.io
  const broadcastOutstock = (event, data) => {
    try {
      if (io && typeof io.emit === 'function') {
        io.emit(event, data);
      }
    } catch (err) {
      console.warn(`[Outstock Socket Warning ${event}]:`, err.message);
    }
  };

  // فحص صحة جلسة التوكن
  const authMiddleware = async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'غير مصرح - مطلوب توكن صالح' });
      }
      const token = authHeader.substring(7).trim();
      const payload = verifyToken(token, JWT_SECRET);
      if (!payload || (!payload.id && !payload.username && !payload.userId)) {
        return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة' });
      }

      // توحيد المعرف id إذا كان قادماً من أي نوع توكن صادرة عن المنظومة
      if (!payload.id) {
        payload.id = payload.userId || payload.username;
      }

      // توحيد الأدوار العليا (المالك، الأدمن، المطور) لتعمل بصلاحيات المالك كاملة في النواقص
      if (['owner', 'admin', 'developer'].includes(payload.role)) {
        payload.role = 'owner';
      }

      // في حال كان المستخدم فرعاً ولم يتم تعيين branchId في التوكن
      if (!payload.branchId && (payload.role === 'outstock_branch' || payload.role === 'branch')) {
        try {
          const bCheck = await db.query(
            'SELECT * FROM public.outstock_branches WHERE LOWER(username) = $1 OR username = $2 OR id = $3 LIMIT 1',
            [String(payload.username || '').toLowerCase(), toStdDigits(payload.username), payload.id]
          );
          if (bCheck.rows.length > 0) {
            payload.branchId = bCheck.rows[0].id;
            payload.branchData = bCheck.rows[0];
            payload.role = 'outstock_branch';
          } else {
            payload.branchId = payload.id;
          }
        } catch (bErr) {
          console.warn('[Outstock authMiddleware Branch Enrich Err]:', bErr.message);
          payload.branchId = payload.id;
        }
      }

      req.outstockUser = payload;
      next();
    } catch (err) {
      return res.status(401).json({ success: false, error: 'خطأ في التحقق من الهوية' });
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. مسارات المصادقة وتسجيل الدخول
  // ───────────────────────────────────────────────────────────────────────────
  app.post('/api/outstock/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanPass = String(password || '').trim();
      const stdUser = toStdDigits(cleanUser);
      const stdPass = toStdDigits(cleanPass);

      if (!cleanUser || !cleanPass) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
      }

      // 1. البحث في جدول outstock_users أولاً
      const userRes = await db.query(
        'SELECT * FROM public.outstock_users WHERE (LOWER(username) = $1 OR username = $2) AND is_active = true',
        [cleanUser, stdUser]
      );

      if (userRes.rows.length > 0) {
        const user = userRes.rows[0];
        const uPass = String(user.password || '').trim();
        if (cleanPass === uPass || (stdPass && toStdDigits(uPass) === stdPass)) {
          let allowedBranches = [];
          if (user.role === 'procurement') {
            const accessRes = await db.query(
              'SELECT branch_id FROM public.outstock_user_branch_access WHERE user_id = $1',
              [user.id]
            );
            allowedBranches = accessRes.rows.map(r => r.branch_id);
          }

          let branchData = null;
          if (user.branch_id) {
            const bDbRes = await db.query('SELECT * FROM public.outstock_branches WHERE id = $1', [user.branch_id]);
            if (bDbRes.rows.length > 0) {
              branchData = bDbRes.rows[0];
            }
          }

          const targetRole = user.role === 'branch' ? 'outstock_branch' : user.role;

          const token = generateToken({
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            role: targetRole,
            branchId: user.branch_id,
            allowedBranches,
            branchData
          }, JWT_SECRET);

          return res.json({
            success: true,
            token,
            user: {
              id: user.id,
              username: user.username,
              fullName: user.full_name,
              name: user.full_name,
              role: targetRole,
              branchId: user.branch_id,
              allowedBranches,
              branchData
            }
          });
        }
      }

      // 2. البحث في فروع النواقص المسجلة مباشرة (outstock_branches)
      const branchRes = await db.query(
        'SELECT * FROM public.outstock_branches WHERE (LOWER(username) = $1 OR username = $2) AND is_active = true',
        [cleanUser, stdUser]
      );

      if (branchRes.rows.length > 0) {
        const branch = branchRes.rows[0];
        const bPass = String(branch.password || '').trim();
        if (cleanPass === bPass || (stdPass && toStdDigits(bPass) === stdPass)) {
          const token = generateToken({
            id: `branch_user_${branch.id}`,
            username: branch.username || branch.code || branch.id,
            fullName: branch.name,
            role: 'outstock_branch',
            branchId: branch.id,
            branchData: branch
          }, JWT_SECRET);

          return res.json({
            success: true,
            token,
            user: {
              id: `branch_user_${branch.id}`,
              username: branch.username || branch.code || branch.id,
              fullName: branch.name,
              name: branch.name,
              role: 'outstock_branch',
              branchId: branch.id,
              branchData: branch
            }
          });
        }
      }

      // ⚠️ لا يوجد Fallback لفروع الـ HR! كل نظام له بيانات دخول منفصلة تماماً
      return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة في نظام النواقص' });
    } catch (err) {
      console.error('[OutStock Login Error]:', err);
      res.status(500).json({ success: false, error: 'حدث خطأ في الخادم أثناء تسجيل الدخول لنظام النواقص' });
    }
  });

  // فحص الجلسة الحالية
  app.get('/api/outstock/me', authMiddleware, async (req, res) => {
    try {
      res.json({ success: true, user: req.outstockUser });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تغيير كلمة المرور
  app.post('/api/outstock/change-password', authMiddleware, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body || {};
      if (!newPassword || String(newPassword).trim().length < 3) {
        return res.status(400).json({ success: false, error: 'كلمة المرور الجديدة يجب أن تكون 3 أحرف على الأقل' });
      }

      const userId = req.outstockUser.id;
      const userRes = await db.query('SELECT * FROM public.outstock_users WHERE id = $1', [userId]);
      if (userRes.rows.length > 0) {
        const user = userRes.rows[0];
        if (user.password !== oldPassword) {
          return res.status(400).json({ success: false, error: 'كلمة المرور الحالية غير صحيحة' });
        }
        await db.query('UPDATE public.outstock_users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newPassword, userId]);
        return res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
      }

      res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. إدارة الفروع ومزامنتها من منظومة الرواتب
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/outstock/branches', authMiddleware, async (req, res) => {
    try {
      // جلب فروع النواقص المسجلة
      const outstockBranchesRes = await db.query('SELECT * FROM public.outstock_branches ORDER BY name ASC');
      const outstockBranches = outstockBranchesRes.rows;

      // جلب الفروع المسجلة مسبقاً في منظومة الرواتب من app_settings
      let hrBranches = [];
      try {
        if (typeof getSettingsFromStorage === 'function') {
          const mainState = await getSettingsFromStorage('pharmacy-tracker-data');
          if (mainState && Array.isArray(mainState.branches)) {
            hrBranches = mainState.branches;
          }
        }
      } catch (e) {
        console.warn('[OutStock Sync HR Branches Warning]:', e.message);
      }

      res.json({
        success: true,
        branches: outstockBranches,
        hrBranches
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // حفظ أو تعديل فرع في نظام النواقص (مع الفصل التام عن يوزرات الـ HR)
  app.post('/api/outstock/branches', authMiddleware, async (req, res) => {
    try {
      const { id, name, code, phone, address, username, password, isActive } = req.body || {};
      if (!id || !name) {
        return res.status(400).json({ success: false, error: 'معرّف واسم الفرع مطلوبان' });
      }

      const cleanUser = username ? String(username).trim().toLowerCase() : null;
      const cleanPass = password ? String(password).trim() : null;

      if (cleanUser) {
        // 1. التحقق الصارم من عدم التعارض مع أي حساب في نظام الـ HR (فروع وموظفين وإدارة)
        const hrCollision = await checkUsernameCollisionWithHr(cleanUser, db, getSettingsFromStorage);
        if (hrCollision) {
          return res.status(400).json({ success: false, error: hrCollision });
        }

        // 2. التحقق من عدم تكرار اسم المستخدم في فروع النواقص الأخرى
        const dupBranchRes = await db.query(
          'SELECT id FROM public.outstock_branches WHERE LOWER(username) = $1 AND id <> $2',
          [cleanUser, id]
        );
        if (dupBranchRes.rows.length > 0) {
          return res.status(400).json({ success: false, error: 'اسم المستخدم هذا مستخدم بالفعل لفرع آخر في نظام النواقص' });
        }

        // 3. التحقق من عدم تكرار اسم المستخدم في جدول مستخدمي النواقص
        const dupUserRes = await db.query(
          'SELECT id FROM public.outstock_users WHERE LOWER(username) = $1 AND id <> $2 AND (branch_id IS NULL OR branch_id <> $3)',
          [cleanUser, `usr_branch_${id}`, id]
        );
        if (dupUserRes.rows.length > 0) {
          return res.status(400).json({ success: false, error: 'اسم المستخدم هذا مستخدم بالفعل لمستخدم آخر في نظام النواقص' });
        }
      }

      await db.query(`
        INSERT INTO public.outstock_branches (id, name, code, phone, address, username, password, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          username = EXCLUDED.username,
          password = CASE WHEN $7 IS NOT NULL AND $7 <> '' THEN $7 ELSE public.outstock_branches.password END,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
      `, [id, name, code || null, phone || null, address || null, cleanUser, cleanPass, isActive !== false]);

      // أيضاً إضافة/تحديث حساب الفرع في outstock_users برتبة 'branch' لتسجيل الدخول السلس
      if (cleanUser && cleanPass) {
        await db.query(`
          INSERT INTO public.outstock_users (id, username, password, full_name, role, branch_id, is_active, updated_at)
          VALUES ($1, $2, $3, $4, 'branch', $5, true, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            password = EXCLUDED.password,
            full_name = EXCLUDED.full_name,
            role = 'branch',
            branch_id = EXCLUDED.branch_id,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
        `, [`usr_branch_${id}`, cleanUser, cleanPass, `فرع: ${name}`, id]);
      }

      res.json({ success: true, message: 'تم حفظ بيانات وحساب الفرع في نظام النواقص بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. إدارة مستخدمي المشتريات ومسؤولي الفروع
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/outstock/users', authMiddleware, async (req, res) => {
    try {
      const usersRes = await db.query(`
        SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.phone, u.is_active, u.created_at,
               COALESCE(json_agg(a.branch_id) FILTER (WHERE a.branch_id IS NOT NULL), '[]') as allowed_branches
        FROM public.outstock_users u
        LEFT JOIN public.outstock_user_branch_access a ON u.id = a.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `);
      res.json({ success: true, users: usersRes.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/outstock/users', authMiddleware, async (req, res) => {
    try {
      const { id, username, password, fullName, role, branchId, phone, isActive, allowedBranches } = req.body || {};
      if (!username || !fullName) {
        return res.status(400).json({ success: false, error: 'اسم المستخدم والاسم الكامل مطلوبان' });
      }

      const cleanUser = String(username).trim().toLowerCase();
      const cleanPass = password ? String(password).trim() : '123';
      const targetId = id || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // 1. التحقق الصارم من عدم التعارض مع أي حساب في نظام الـ HR
      const hrCollision = await checkUsernameCollisionWithHr(cleanUser, db, getSettingsFromStorage);
      if (hrCollision) {
        return res.status(400).json({ success: false, error: hrCollision });
      }

      // 2. التحقق من عدم التكرار في جدول مستخدمي النواقص
      const dupUser = await db.query(
        'SELECT id FROM public.outstock_users WHERE LOWER(username) = $1 AND id <> $2',
        [cleanUser, targetId]
      );
      if (dupUser.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'اسم المستخدم مستخدم بالفعل في نظام النواقص' });
      }

      // 3. التحقق من عدم التكرار كاسم مستخدم لفرع في جدول فروع النواقص
      const dupBranch = await db.query(
        'SELECT id FROM public.outstock_branches WHERE LOWER(username) = $1 AND id <> $2',
        [cleanUser, branchId || '']
      );
      if (dupBranch.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'اسم المستخدم مستخدم كاسم مستخدم لفرع في نظام النواقص' });
      }

      await db.query(`
        INSERT INTO public.outstock_users (id, username, password, full_name, role, branch_id, phone, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          password = CASE WHEN $3 <> '' THEN $3 ELSE public.outstock_users.password END,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          branch_id = EXCLUDED.branch_id,
          phone = EXCLUDED.phone,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
      `, [targetId, cleanUser, cleanPass, fullName, role || 'procurement', branchId || null, phone || null, isActive !== false]);

      // تحديث الفروع المصرح بها لمسؤول المشتريات المساعد
      if (Array.isArray(allowedBranches)) {
        await db.query('DELETE FROM public.outstock_user_branch_access WHERE user_id = $1', [targetId]);
        for (const bId of allowedBranches) {
          if (bId) {
            await db.query(
              'INSERT INTO public.outstock_user_branch_access (id, user_id, branch_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
              [`acc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, targetId, bId]
            );
          }
        }
      }

      res.json({ success: true, message: 'تم حفظ المستخدم بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. إدارة العملاء ومنع تكرار رقم الهاتف
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/outstock/customers', authMiddleware, async (req, res) => {
    try {
      const { search, branchId } = req.query;
      let query = `
        SELECT c.*, b.name as branch_name,
               (SELECT COUNT(*) FROM public.outstock_orders o WHERE o.customer_id = c.id) as real_orders_count
        FROM public.outstock_customers c
        LEFT JOIN public.outstock_branches b ON c.primary_branch_id = b.id
        WHERE 1=1
      `;
      const params = [];

      if (search && String(search).trim()) {
        params.push(`%${String(search).trim()}%`);
        query += ` AND (c.full_name ILIKE $${params.length} OR c.whatsapp_phone ILIKE $${params.length} OR c.customer_code ILIKE $${params.length})`;
      }

      if (branchId) {
        params.push(branchId);
        query += ` AND c.primary_branch_id = $${params.length}`;
      }

      query += ' ORDER BY c.created_at DESC LIMIT 200';
      const result = await db.query(query, params);
      res.json({ success: true, customers: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // جلب سجل العميل التفصيلي وطلباته السابقة
  app.get('/api/outstock/customers/:id/history', authMiddleware, async (req, res) => {
    try {
      const customerId = req.params.id;
      const custRes = await db.query('SELECT * FROM public.outstock_customers WHERE id = $1', [customerId]);
      if (custRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'العميل غير موجود' });
      }

      const ordersRes = await db.query(`
        SELECT o.*, b.name as branch_name,
               json_agg(json_build_object(
                 'id', i.id,
                 'medicationName', i.medication_name,
                 'unitType', i.unit_type,
                 'quantity', i.quantity,
                 'unitPrice', i.unit_price,
                 'totalPrice', i.total_price,
                 'itemStatus', i.item_status,
                 'prunedFromBill', i.pruned_from_bill
               )) as items
        FROM public.outstock_orders o
        LEFT JOIN public.outstock_branches b ON o.branch_id = b.id
        LEFT JOIN public.outstock_order_items i ON o.id = i.order_id
        WHERE o.customer_id = $1
        GROUP BY o.id, b.name
        ORDER BY o.created_at DESC
      `, [customerId]);

      res.json({
        success: true,
        customer: custRes.rows[0],
        orders: ordersRes.rows
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // إضافة أو تعديل عميل مع فرض فرادة رقم الواتساب
  app.post('/api/outstock/customers', authMiddleware, async (req, res) => {
    try {
      const { id, fullName, whatsappPhone, landlinePhone, address, branchId, notes } = req.body || {};
      if (!fullName || !whatsappPhone) {
        return res.status(400).json({ success: false, error: 'اسم العميل ورقم الواتساب مطلوبان' });
      }

      // تنقية رقم الهاتف
      const cleanPhone = String(whatsappPhone).replace(/\D/g, '');
      if (cleanPhone.length < 9) {
        return res.status(400).json({ success: false, error: 'رقم هاتف الواتساب غير صالح' });
      }

      // فحص عدم التكرار
      const targetId = id || `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const dupRes = await db.query(
        'SELECT id, full_name FROM public.outstock_customers WHERE whatsapp_phone = $1 AND id <> $2',
        [cleanPhone, targetId]
      );

      if (dupRes.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: `رقم الهاتف هذا (${cleanPhone}) مسجل بالفعل للعميل "${dupRes.rows[0].full_name}"!`
        });
      }

      const custCode = `CUST-${cleanPhone.slice(-4)}-${Math.floor(100 + Math.random() * 900)}`;

      const insertRes = await db.query(`
        INSERT INTO public.outstock_customers (id, customer_code, full_name, whatsapp_phone, landline_phone, address, primary_branch_id, notes, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          whatsapp_phone = EXCLUDED.whatsapp_phone,
          landline_phone = EXCLUDED.landline_phone,
          address = EXCLUDED.address,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [targetId, custCode, fullName, cleanPhone, landlinePhone || null, address || null, branchId || 'main', notes || null]);

      // ⚡ بث فوري لتحديث بيانات العملاء
      broadcastOutstock('outstock:customer_updated', { customer: insertRes.rows[0], branchId });

      res.json({ success: true, customer: insertRes.rows[0], message: 'تم حفظ بيانات العميل بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. إدارة طلبات العملاء (إنشاء، استعلام، تسليم، وبث لحظي)
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/outstock/orders', authMiddleware, async (req, res) => {
    try {
      const { branchId, status, search, limit } = req.query;
      let query = `
        SELECT o.*, c.full_name as customer_name, c.whatsapp_phone as customer_phone, c.address as customer_address,
               b.name as branch_name,
               COALESCE(json_agg(
                 json_build_object(
                   'id', i.id,
                   'medicationName', i.medication_name,
                   'unitType', i.unit_type,
                   'quantity', i.quantity,
                   'unitPrice', i.unit_price,
                   'totalPrice', i.total_price,
                   'itemStatus', i.item_status,
                   'procurementNotes', i.procurement_notes,
                   'prunedFromBill', i.pruned_from_bill
                 ) ORDER BY i.created_at ASC
               ) FILTER (WHERE i.id IS NOT NULL), '[]') as items
        FROM public.outstock_orders o
        LEFT JOIN public.outstock_customers c ON o.customer_id = c.id
        LEFT JOIN public.outstock_branches b ON o.branch_id = b.id
        LEFT JOIN public.outstock_order_items i ON o.id = i.order_id
        WHERE 1=1
      `;
      const params = [];

      if (branchId) {
        params.push(branchId);
        query += ` AND o.branch_id = $${params.length}`;
      }

      if (status) {
        if (status === 'active') {
          query += ` AND o.order_status <> 'delivered' AND o.order_status <> 'cancelled'`;
        } else {
          params.push(status);
          query += ` AND o.order_status = $${params.length}`;
        }
      }

      if (search && String(search).trim()) {
        params.push(`%${String(search).trim()}%`);
        query += ` AND (o.order_number ILIKE $${params.length} OR o.barcode_data ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR c.whatsapp_phone ILIKE $${params.length})`;
      }

      query += ` GROUP BY o.id, c.full_name, c.whatsapp_phone, c.address, b.name ORDER BY o.created_at DESC LIMIT ${parseInt(limit || 200, 10)}`;

      const result = await db.query(query, params);
      res.json({ success: true, orders: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // إنشاء طلب عميل جديد
  app.post('/api/outstock/orders', authMiddleware, async (req, res) => {
    try {
      const {
        branchId: bodyBranchId,
        customer, // { id, fullName, whatsappPhone, landlinePhone, address }
        items,    // [ { medicationName, unitType, quantity, unitPrice } ]
        paidAmount,
        discountType,
        discountValue,
        expectedPickupDate,
        expectedPickupTime,
        responsiblePharmacist,
        customerNotes
      } = req.body || {};

      let branchId = bodyBranchId;
      if (!branchId || branchId === 'main') {
        branchId = req.outstockUser?.branchId || req.outstockUser?.branchData?.id || req.outstockUser?.id || bodyBranchId;
      }

      if (!branchId || !customer || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'البيانات غير مكتملة: مطلوب تحديد الفرع والعميل والأصناف' });
      }

      // 1. ضمان وجود أو إنشاء العميل
      let customerId = customer.id;
      const cleanPhone = String(customer.whatsappPhone || '').replace(/\D/g, '');

      if (!customerId) {
        // فحص هل العميل موجود برقم الهاتف
        const existingCust = await db.query(
          'SELECT id FROM public.outstock_customers WHERE whatsapp_phone = $1',
          [cleanPhone]
        );
        if (existingCust.rows.length > 0) {
          customerId = existingCust.rows[0].id;
        } else {
          customerId = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          const custCode = `CUST-${cleanPhone.slice(-4)}-${Math.floor(100 + Math.random() * 900)}`;
          await db.query(`
            INSERT INTO public.outstock_customers (id, customer_code, full_name, whatsapp_phone, landline_phone, address, primary_branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [customerId, custCode, customer.fullName, cleanPhone, customer.landlinePhone || null, customer.address || null, branchId]);
        }
      }

      // 2. احتساب إجمالي الأصناف
      let totalAmount = 0;
      items.forEach(item => {
        const qty = parseInt(item.quantity || 1, 10);
        const price = parseFloat(item.unitPrice || 0);
        totalAmount += qty * price;
      });

      // احتساب الخصم
      const discVal = parseFloat(discountValue || 0);
      let discountAmount = 0;
      if (discountType === 'percentage') {
        discountAmount = (totalAmount * discVal) / 100;
      } else if (discountType === 'amount') {
        discountAmount = discVal;
      }
      const netAmount = Math.max(0, totalAmount - discountAmount);
      const paid = parseFloat(paidAmount || 0);
      const remaining = Math.max(0, netAmount - paid);

      // توليد رقم الطلب والباركود
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const orderNumber = `ORD-${branchId.slice(0, 4).toUpperCase()}-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const barcodeData = cleanPhone ? `${cleanPhone}-${orderNumber.slice(-4)}` : orderNumber;

      // إدراج رأس الطلب
      await db.query(`
        INSERT INTO public.outstock_orders (
          id, order_number, branch_id, customer_id, total_amount, paid_amount, remaining_amount,
          discount_type, discount_value, net_amount, order_status, expected_pickup_date,
          expected_pickup_time, responsible_pharmacist, customer_notes, barcode_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_procurement', $11, $12, $13, $14, $15)
      `, [
        orderId, orderNumber, branchId, customerId, totalAmount, paid, remaining,
        discountType || 'none', discVal, netAmount,
        expectedPickupDate || null, expectedPickupTime || null,
        responsiblePharmacist || 'الصيدلي المسؤول', customerNotes || null, barcodeData
      ]);

      // إدراج بنود الأصناف
      const insertedItems = [];
      for (const it of items) {
        const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const qty = parseInt(it.quantity || 1, 10);
        const price = parseFloat(it.unitPrice || 0);
        const total = qty * price;
        await db.query(`
          INSERT INTO public.outstock_order_items (
            id, order_id, medication_name, unit_type, quantity, unit_price, total_price, item_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        `, [itemId, orderId, it.medicationName, it.unitType || 'pack', qty, price, total]);

        insertedItems.push({
          id: itemId,
          orderId,
          medicationName: it.medicationName,
          unitType: it.unitType || 'pack',
          quantity: qty,
          unitPrice: price,
          totalPrice: total,
          itemStatus: 'pending'
        });
      }

      // زيادة عداد طلبات العميل
      await db.query('UPDATE public.outstock_customers SET total_orders_count = total_orders_count + 1 WHERE id = $1', [customerId]);

      const fullOrder = {
        id: orderId,
        orderNumber,
        branchId,
        customerId,
        customerName: customer.fullName,
        customerPhone: cleanPhone,
        customerAddress: customer.address,
        totalAmount,
        paidAmount: paid,
        remainingAmount: remaining,
        netAmount,
        orderStatus: 'pending_procurement',
        expectedPickupDate,
        expectedPickupTime,
        responsiblePharmacist,
        barcodeData,
        items: insertedItems,
        createdAt: new Date().toISOString()
      };

      // ⚡ بث فوري عبر الـ Socket.io لإدارة المشتريات والمالك والفروع
      broadcastOutstock('outstock:order_created', { order: fullOrder, branchId });

      res.json({
        success: true,
        order: fullOrder,
        message: 'تم تسجيل طلب العميل وإرساله لإدارة المشتريات بنجاح'
      });
    } catch (err) {
      console.error('[OutStock Create Order Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تسليم الطلب للعميل
  app.post('/api/outstock/orders/:id/deliver', authMiddleware, async (req, res) => {
    try {
      const orderId = req.params.id;
      const orderRes = await db.query('SELECT * FROM public.outstock_orders WHERE id = $1', [orderId]);
      if (orderRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
      }

      const order = orderRes.rows[0];
      await db.query(`
        UPDATE public.outstock_orders
        SET order_status = 'delivered', delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [orderId]);

      await db.query(`
        UPDATE public.outstock_order_items
        SET item_status = 'delivered', updated_at = CURRENT_TIMESTAMP
        WHERE order_id = $1 AND pruned_from_bill = false
      `, [orderId]);

      // خصم الكميات من رصيد الفرع المؤقت
      const itemsRes = await db.query(
        'SELECT * FROM public.outstock_order_items WHERE order_id = $1 AND pruned_from_bill = false',
        [orderId]
      );
      for (const item of itemsRes.rows) {
        await db.query(`
          UPDATE public.outstock_branch_stock
          SET available_quantity = GREATEST(0, available_quantity - $1),
              delivered_quantity = delivered_quantity + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE branch_id = $2 AND LOWER(medication_name) = LOWER($3) AND unit_type = $4
        `, [item.quantity, order.branch_id, item.medication_name, item.unit_type]);
      }

      // ⚡ بث فوري
      broadcastOutstock('outstock:order_delivered', { orderId, branchId: order.branch_id });

      res.json({ success: true, message: 'تم تسليم الطلب للعميل واكتمال المعاملة بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // تسجيل إرسال رسالة واتساب
  app.post('/api/outstock/orders/:id/whatsapp', authMiddleware, async (req, res) => {
    try {
      const orderId = req.params.id;
      await db.query('UPDATE public.outstock_orders SET whatsapp_notified_at = CURRENT_TIMESTAMP WHERE id = $1', [orderId]);
      res.json({ success: true, message: 'تم تسجيل إرسال الواتساب بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. إدارة المشتريات (تجميع الأصناف، قرار التوفير، شطب الصنف، والأصناف غير المتوفرة)
  // ───────────────────────────────────────────────────────────────────────────

  // جلب طلبات الفروع مجمعة حسب الصنف والفرع
  app.get('/api/outstock/procurement/aggregated', authMiddleware, async (req, res) => {
    try {
      const user = req.outstockUser;
      let branchFilter = '';
      const params = [];

      // إذا كان مسؤول مشتريات مساعد وله فروع محددة
      if (user.role === 'procurement' && Array.isArray(user.allowedBranches) && user.allowedBranches.length > 0) {
        params.push(user.allowedBranches);
        branchFilter = ` AND o.branch_id = ANY($1)`;
      }

      const query = `
        SELECT i.medication_name, i.unit_type, o.branch_id, b.name as branch_name,
               SUM(i.quantity) as total_requested_qty,
               COUNT(DISTINCT o.id) as orders_count,
               json_agg(json_build_object(
                 'itemId', i.id,
                 'orderId', o.id,
                 'orderNumber', o.order_number,
                 'quantity', i.quantity,
                 'unitPrice', i.unit_price,
                 'itemStatus', i.item_status,
                 'createdAt', o.created_at,
                 'customerName', c.full_name,
                 'customerPhone', c.whatsapp_phone
               )) as item_details
        FROM public.outstock_order_items i
        JOIN public.outstock_orders o ON i.order_id = o.id
        LEFT JOIN public.outstock_branches b ON o.branch_id = b.id
        LEFT JOIN public.outstock_customers c ON o.customer_id = c.id
        WHERE i.item_status = 'pending' AND i.pruned_from_bill = false AND o.order_status <> 'delivered'
        ${branchFilter}
        GROUP BY i.medication_name, i.unit_type, o.branch_id, b.name
        ORDER BY total_requested_qty DESC
      `;

      const result = await db.query(query, params);
      res.json({ success: true, aggregated: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // اتخاذ قرار من المشتريات (توفير / عدم توفر بالسوق)
  app.post('/api/outstock/procurement/item-action', authMiddleware, async (req, res) => {
    try {
      const { branchId, medicationName, unitType, action, notes, itemIds } = req.body || {};
      // action: 'available' أو 'unavailable'

      if (!branchId || !medicationName || !action) {
        return res.status(400).json({ success: false, error: 'الفرع واسم الصنف والإجراء مطلوبان' });
      }

      // جلب جميع البنود المعلقة المطابقة
      let itemsToUpdate = [];
      if (Array.isArray(itemIds) && itemIds.length > 0) {
        const itmRes = await db.query(
          `SELECT i.*, o.branch_id, o.customer_id, o.total_amount, o.paid_amount, o.discount_type, o.discount_value, o.net_amount
           FROM public.outstock_order_items i
           JOIN public.outstock_orders o ON i.order_id = o.id
           WHERE i.id = ANY($1)`,
          [itemIds]
        );
        itemsToUpdate = itmRes.rows;
      } else {
        const itmRes = await db.query(
          `SELECT i.*, o.branch_id, o.customer_id, o.total_amount, o.paid_amount, o.discount_type, o.discount_value, o.net_amount
           FROM public.outstock_order_items i
           JOIN public.outstock_orders o ON i.order_id = o.id
           WHERE o.branch_id = $1 AND LOWER(i.medication_name) = LOWER($2) AND i.unit_type = $3 AND i.item_status = 'pending'`,
          [branchId, medicationName, unitType || 'pack']
        );
        itemsToUpdate = itmRes.rows;
      }

      if (itemsToUpdate.length === 0) {
        return res.status(404).json({ success: false, error: 'لم يتم العثور على بنود معلقة لهذا الصنف' });
      }

      let totalProcuredQty = 0;

      for (const item of itemsToUpdate) {
        if (action === 'available') {
          // 1. تحديد الصنف كمتوفر
          await db.query(`
            UPDATE public.outstock_order_items
            SET item_status = 'available_by_procurement', procurement_notes = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [notes || 'تم التوفير من إدارة المشتريات', item.id]);

          totalProcuredQty += item.quantity;

          // تحديث حالة الطلب
          await updateOrderStatusByItems(db, item.order_id);
        } else if (action === 'unavailable') {
          // 2. صنف غير متوفر بالسوق:
          // أ) شطب الصنف من فاتورة العميل
          await db.query(`
            UPDATE public.outstock_order_items
            SET item_status = 'unavailable_in_market',
                pruned_from_bill = true,
                pruned_at = CURRENT_TIMESTAMP,
                procurement_notes = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [notes || 'غير متوفر بالسوق المحلي حالياً', item.id]);

          // ب) إعادة احتساب إجمالي الفاتورة والمتبقي
          await recalculateOrderTotals(db, item.order_id);

          // ج) إدراج الصنف في جدول أدوية النواقص
          const defId = `def_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          await db.query(`
            INSERT INTO public.outstock_deficiencies (
              id, branch_id, medication_name, unit_type, customer_id, original_order_id, original_item_id, requested_quantity, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'market_shortage')
          `, [defId, item.branch_id, item.medication_name, item.unit_type, item.customer_id, item.order_id, item.id, item.quantity]);
        }
      }

      // إذا كان الإجراء هو توفير، نضيف الكمية إلى رصيد الفرع المؤقت (Branch Stock)
      if (action === 'available' && totalProcuredQty > 0) {
        const stockId = `stk_${branchId}_${Buffer.from(medicationName).toString('hex').slice(0, 16)}_${unitType}`;
        await db.query(`
          INSERT INTO public.outstock_branch_stock (
            id, branch_id, medication_name, unit_type, available_quantity, last_procured_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (branch_id, medication_name, unit_type) DO UPDATE SET
            available_quantity = public.outstock_branch_stock.available_quantity + EXCLUDED.available_quantity,
            last_procured_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `, [stockId, branchId, medicationName, unitType || 'pack', totalProcuredQty]);
      }

      // ⚡ بث فوري عبر Socket.io للفرع والمالك والمشتريات
      const itemUpdatePayload = {
        branchId,
        medicationName,
        unitType,
        action,
        count: itemsToUpdate.length
      };
      broadcastOutstock('outstock:item_status_updated', itemUpdatePayload);
      broadcastOutstock('outstock:items_status_updated', itemUpdatePayload);

      res.json({
        success: true,
        message: action === 'available' ? 'تم توفير الصنف بنجاح وإرساله لرصيد الفرع' : 'تم شطب الصنف لعدم التوفر وتحويله لصفحة النواقص'
      });
    } catch (err) {
      console.error('[OutStock Item Action Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // متابعة تسليم الأصناف بالفروع (Undelivered Aging Analysis)
  app.get('/api/outstock/procurement/delivery-tracking', authMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT b.id as branch_id, b.name as branch_name,
               COUNT(DISTINCT o.id) as pending_delivery_orders,
               SUM(i.quantity) as undelivered_items_count,
               COALESCE(json_agg(json_build_object(
                 'orderId', o.id,
                 'orderNumber', o.order_number,
                 'customerName', c.full_name,
                 'customerPhone', c.whatsapp_phone,
                 'createdAt', o.created_at,
                 'medicationName', i.medication_name,
                 'quantity', i.quantity,
                 'unitType', i.unit_type
               )) FILTER (WHERE o.id IS NOT NULL), '[]') as pending_items
        FROM public.outstock_branches b
        LEFT JOIN public.outstock_orders o ON b.id = o.branch_id AND o.order_status <> 'delivered' AND o.order_status <> 'cancelled'
        LEFT JOIN public.outstock_order_items i ON o.id = i.order_id AND i.item_status = 'available_by_procurement'
        LEFT JOIN public.outstock_customers c ON o.customer_id = c.id
        GROUP BY b.id, b.name
        ORDER BY pending_delivery_orders DESC
      `);
      res.json({ success: true, tracking: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // شاشة الأصناف غير المتوفرة وإشعار الفرع عند توفرها مع استرجاع العملاء
  app.get('/api/outstock/procurement/unavailable-items', authMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT d.medication_name, d.unit_type, d.branch_id, b.name as branch_name,
               COUNT(d.id) as customers_waiting_count,
               SUM(d.requested_quantity) as total_wanted_qty,
               json_agg(json_build_object(
                 'deficiencyId', d.id,
                 'customerId', c.id,
                 'customerName', c.full_name,
                 'customerPhone', c.whatsapp_phone,
                 'customerAddress', c.address,
                 'requestedQuantity', d.requested_quantity,
                 'createdAt', d.created_at
               )) as waiting_customers
        FROM public.outstock_deficiencies d
        LEFT JOIN public.outstock_branches b ON d.branch_id = b.id
        LEFT JOIN public.outstock_customers c ON d.customer_id = c.id
        WHERE d.status = 'market_shortage'
        GROUP BY d.medication_name, d.unit_type, d.branch_id, b.name
        ORDER BY customers_waiting_count DESC
      `);
      res.json({ success: true, unavailableItems: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // إرسال إشعار للفرع عند توفر صنف كان ناقصاً مع استرجاع بيانات العملاء
  app.post('/api/outstock/procurement/notify-restocked', authMiddleware, async (req, res) => {
    try {
      const { branchId, medicationName, unitType } = req.body || {};
      if (!branchId || !medicationName) {
        return res.status(400).json({ success: false, error: 'الفرع واسم الصنف مطلوبان' });
      }

      // جلب العملاء الذين طلبوا هذا الصنف
      const defRes = await db.query(`
        SELECT d.id, c.id as customer_id, c.full_name, c.whatsapp_phone, d.requested_quantity
        FROM public.outstock_deficiencies d
        JOIN public.outstock_customers c ON d.customer_id = c.id
        WHERE d.branch_id = $1 AND LOWER(d.medication_name) = LOWER($2) AND d.unit_type = $3 AND d.status = 'market_shortage'
      `, [branchId, medicationName, unitType || 'pack']);

      // تحديث حالة النواقص
      await db.query(`
        UPDATE public.outstock_deficiencies
        SET status = 'restocked_available', restocked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE branch_id = $1 AND LOWER(medication_name) = LOWER($2) AND unit_type = $3 AND status = 'market_shortage'
      `, [branchId, medicationName, unitType || 'pack']);

      const waitingCustomers = defRes.rows;

      // ⚡ بث فوري للفرع مع بيانات العملاء كاملة
      const restockPayload = {
        branchId,
        medicationName,
        unitType,
        waitingCustomers,
        message: `الصنف (${medicationName}) أصبح متوفراً الآن! يمكنك التواصل مع العملاء لحجزه.`
      };
      broadcastOutstock('outstock:restocked_alert', restockPayload);
      broadcastOutstock('outstock:item_restocked', restockPayload);

      res.json({
        success: true,
        waitingCustomers,
        message: 'تم إشعار الفرع بنجاح واسترجاع بيانات العملاء للتواصل معهم'
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. صفحة أدوية النواقص والرصيد بالفرع
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/outstock/deficiencies', authMiddleware, async (req, res) => {
    try {
      const { branchId, search } = req.query;
      let query = `
        SELECT d.medication_name, d.unit_type, d.branch_id, b.name as branch_name,
               COUNT(d.id) as requests_count,
               SUM(d.requested_quantity) as total_qty,
               COALESCE(s.available_quantity, 0) as current_branch_stock,
               json_agg(json_build_object(
                 'id', d.id,
                 'customerId', c.id,
                 'customerName', c.full_name,
                 'customerPhone', c.whatsapp_phone,
                 'customerAddress', c.address,
                 'requestedQuantity', d.requested_quantity,
                 'status', d.status,
                 'createdAt', d.created_at
               )) as customers
        FROM public.outstock_deficiencies d
        LEFT JOIN public.outstock_branches b ON d.branch_id = b.id
        LEFT JOIN public.outstock_customers c ON d.customer_id = c.id
        LEFT JOIN public.outstock_branch_stock s ON d.branch_id = s.branch_id AND LOWER(d.medication_name) = LOWER(s.medication_name) AND d.unit_type = s.unit_type
        WHERE 1=1
      `;
      const params = [];

      if (branchId) {
        params.push(branchId);
        query += ` AND d.branch_id = $${params.length}`;
      }

      if (search && String(search).trim()) {
        params.push(`%${String(search).trim()}%`);
        query += ` AND (d.medication_name ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR c.whatsapp_phone ILIKE $${params.length})`;
      }

      query += ' GROUP BY d.medication_name, d.unit_type, d.branch_id, b.name, s.available_quantity ORDER BY requests_count DESC';

      const result = await db.query(query, params);
      res.json({ success: true, deficiencies: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // إعادة طلب صنف ناقص لصالح عميل
  app.post('/api/outstock/deficiencies/reorder', authMiddleware, async (req, res) => {
    try {
      const { deficiencyId, responsiblePharmacist } = req.body || {};
      const defRes = await db.query(`
        SELECT d.*, c.full_name, c.whatsapp_phone
        FROM public.outstock_deficiencies d
        JOIN public.outstock_customers c ON d.customer_id = c.id
        WHERE d.id = $1
      `, [deficiencyId]);

      if (defRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'بند النواقص غير موجود' });
      }

      const def = defRes.rows[0];
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const newOrderId = `ord_re_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const orderNumber = `ORD-${def.branch_id.slice(0, 4).toUpperCase()}-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const barcodeData = `${def.whatsapp_phone}-${orderNumber.slice(-4)}`;

      // إنشاء طلب جديد
      await db.query(`
        INSERT INTO public.outstock_orders (
          id, order_number, branch_id, customer_id, total_amount, paid_amount, remaining_amount,
          order_status, responsible_pharmacist, customer_notes, barcode_data
        ) VALUES ($1, $2, $3, $4, 0.00, 0.00, 0.00, 'pending_procurement', $5, 'إعادة طلب من صفحة النواقص', $6)
      `, [newOrderId, orderNumber, def.branch_id, def.customer_id, responsiblePharmacist || 'الصيدلي المسؤول', barcodeData]);

      // إدراج الصنف
      const newItemId = `item_re_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.query(`
        INSERT INTO public.outstock_order_items (
          id, order_id, medication_name, unit_type, quantity, item_status
        ) VALUES ($1, $2, $3, $4, $5, 'pending')
      `, [newItemId, newOrderId, def.medication_name, def.unit_type, def.requested_quantity]);

      // تحديث حالة بند النواقص
      await db.query("UPDATE public.outstock_deficiencies SET status = 'reordered_by_branch', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [deficiencyId]);

      // ⚡ بث فوري
      const reorderPayload = {
        order: {
          id: newOrderId,
          orderNumber,
          branchId: def.branch_id,
          customerId: def.customer_id,
          customerName: def.full_name,
          customerPhone: def.whatsapp_phone,
          items: [{ medicationName: def.medication_name, quantity: def.requested_quantity, unitType: def.unit_type }]
        },
        branchId: def.branch_id
      };
      broadcastOutstock('outstock:order_created', reorderPayload);
      broadcastOutstock('outstock:deficiency_reordered', { deficiencyId, branchId: def.branch_id });

      res.json({ success: true, message: 'تم إعادة طلب الصنف وظهوره في صفحة طلبات العملاء وإرساله للمشتريات بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // رصيد أصناف النواقص بالفرع
  app.get('/api/outstock/branch-stock', authMiddleware, async (req, res) => {
    try {
      const { branchId } = req.query;
      let query = 'SELECT s.*, b.name as branch_name FROM public.outstock_branch_stock s LEFT JOIN public.outstock_branches b ON s.branch_id = b.id';
      const params = [];
      if (branchId) {
        params.push(branchId);
        query += ' WHERE s.branch_id = $1';
      }
      query += ' ORDER BY s.available_quantity DESC';
      const result = await db.query(query, params);
      res.json({ success: true, stock: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. لوحة المالك والإشراف العام (KPIs, SLAs, Enterprise Overview)
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/outstock/owner/overview', authMiddleware, async (req, res) => {
    try {
      // 1. إحصائيات عامة
      const totalsRes = await db.query(`
        SELECT
          COUNT(DISTINCT o.id) as total_orders,
          COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'delivered') as delivered_orders,
          COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'pending_procurement') as pending_procurement_orders,
          COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'ready_for_pickup') as ready_orders,
          COALESCE(SUM(o.paid_amount), 0) as total_deposits_collected,
          COALESCE(SUM(o.remaining_amount) FILTER (WHERE o.order_status <> 'delivered'), 0) as pending_receivables,
          (SELECT COUNT(*) FROM public.outstock_customers) as total_customers,
          (SELECT COUNT(*) FROM public.outstock_deficiencies WHERE status = 'market_shortage') as active_deficiencies_count
        FROM public.outstock_orders o
      `);

      // 2. إحصائيات كل فرع
      const branchStatsRes = await db.query(`
        SELECT b.id, b.name, b.phone,
               COUNT(DISTINCT o.id) as total_orders,
               COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'delivered') as delivered_orders,
               COUNT(DISTINCT o.id) FILTER (WHERE o.order_status <> 'delivered' AND o.order_status <> 'cancelled') as active_orders,
               COALESCE(SUM(s.available_quantity), 0) as staging_stock_qty,
               COALESCE(SUM(o.paid_amount), 0) as paid_amount,
               COALESCE(SUM(o.remaining_amount), 0) as remaining_amount
        FROM public.outstock_branches b
        LEFT JOIN public.outstock_orders o ON b.id = o.branch_id
        LEFT JOIN public.outstock_branch_stock s ON b.id = s.branch_id
        GROUP BY b.id, b.name, b.phone
        ORDER BY total_orders DESC
      `);

      // 3. أداء المشتريات (الأصناف المتوفرة مقابل غير المتوفرة)
      const procurementKpisRes = await db.query(`
        SELECT
          COUNT(i.id) as total_items_handled,
          COUNT(i.id) FILTER (WHERE i.item_status = 'available_by_procurement' OR i.item_status = 'delivered') as fulfilled_items,
          COUNT(i.id) FILTER (WHERE i.item_status = 'unavailable_in_market') as unavailable_items,
          COUNT(i.id) FILTER (WHERE i.item_status = 'pending') as pending_procurement_items
        FROM public.outstock_order_items i
      `);

      res.json({
        success: true,
        summary: totalsRes.rows[0],
        branches: branchStatsRes.rows,
        procurementKpi: procurementKpisRes.rows[0]
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// ── دوال مساعدة لإعادة الحساب وتحديث حالات الطلبات ─────────────────────────
async function updateOrderStatusByItems(db, orderId) {
  try {
    const itemsRes = await db.query(
      'SELECT item_status, pruned_from_bill FROM public.outstock_order_items WHERE order_id = $1',
      [orderId]
    );
    const validItems = itemsRes.rows.filter(i => !i.pruned_from_bill);
    if (validItems.length === 0) return;

    const allAvailable = validItems.every(i => i.item_status === 'available_by_procurement' || i.item_status === 'delivered');
    const someAvailable = validItems.some(i => i.item_status === 'available_by_procurement' || i.item_status === 'delivered');

    let newStatus = 'pending_procurement';
    if (allAvailable) {
      newStatus = 'ready_for_pickup';
    } else if (someAvailable) {
      newStatus = 'partially_available';
    }

    await db.query(
      'UPDATE public.outstock_orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND order_status <> $3',
      [newStatus, orderId, 'delivered']
    );
  } catch (e) {
    console.warn('[OutStock Update Order Status Warning]:', e.message);
  }
}

async function recalculateOrderTotals(db, orderId) {
  try {
    const itemsRes = await db.query(
      'SELECT quantity, unit_price FROM public.outstock_order_items WHERE order_id = $1 AND pruned_from_bill = false',
      [orderId]
    );

    let newTotal = 0;
    itemsRes.rows.forEach(it => {
      newTotal += parseInt(it.quantity || 1, 10) * parseFloat(it.unit_price || 0);
    });

    const orderRes = await db.query('SELECT paid_amount, discount_type, discount_value FROM public.outstock_orders WHERE id = $1', [orderId]);
    if (orderRes.rows.length === 0) return;

    const order = orderRes.rows[0];
    const discVal = parseFloat(order.discount_value || 0);
    let discountAmount = 0;
    if (order.discount_type === 'percentage') {
      discountAmount = (newTotal * discVal) / 100;
    } else if (order.discount_type === 'amount') {
      discountAmount = discVal;
    }

    const net = Math.max(0, newTotal - discountAmount);
    const paid = parseFloat(order.paid_amount || 0);
    const remaining = Math.max(0, net - paid);

    await db.query(`
      UPDATE public.outstock_orders
      SET total_amount = $1, net_amount = $2, remaining_amount = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [newTotal, net, remaining, orderId]);
  } catch (e) {
    console.warn('[OutStock Recalculate Order Totals Warning]:', e.message);
  }
}
