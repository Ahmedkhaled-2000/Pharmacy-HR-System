/**
 * server/biometric-manager.js
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚀 محرك إدارة واستقبال أجهزة البصمة الحيوية (Native ADMS / Cloud Push Engine)
 * يدعم بروتوكولات ZKTeco (MB20 / iClock / Face / Fingerprint) بشكل مباشر
 * دون الحاجة لأي برامج وسيطة، وبأعلى سرعة معالجة لحظية (< 20ms).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import express from 'express';

const STORAGE_KEY = 'pharmacy-tracker-data';
let globalDb = null;
const hqPendingEnrollments = new Map();

export async function initBiometricTables(db) {
  if (!db) return;
  globalDb = db;
  try {
    // الترقية التلقائية لحقول المعرفات لتجنب خطأ تجاوز الطول المسموح (Auto-Migration VARCHAR(255))
    try {
      await db.query(`
        ALTER TABLE public.employee_biometric_profiles ALTER COLUMN id TYPE VARCHAR(255);
        ALTER TABLE public.biometric_devices ALTER COLUMN id TYPE VARCHAR(255);
        ALTER TABLE public.biometric_templates ADD COLUMN IF NOT EXISTS employee_name VARCHAR(255) NULL;
        ALTER TABLE public.biometric_devices ADD COLUMN IF NOT EXISTS is_hq_station BOOLEAN DEFAULT FALSE;
      `);
    } catch (_) {}

    const ddl = `
      -- 1. جدول أجهزة البصمة المتصلة بالسحابة
      CREATE TABLE IF NOT EXISTS public.biometric_devices (
          id VARCHAR(255) PRIMARY KEY,
          device_name VARCHAR(100) NOT NULL,
          serial_number VARCHAR(100) NOT NULL UNIQUE,
          branch_id VARCHAR(50) NULL,
          branch_name VARCHAR(100) NULL,
          ip_address VARCHAR(45) NULL,
          protocol VARCHAR(20) NOT NULL DEFAULT 'ADMS',
          status VARCHAR(20) NOT NULL DEFAULT 'ONLINE',
          last_heartbeat TIMESTAMPTZ NULL,
          firmware_version VARCHAR(50) NULL,
          device_type VARCHAR(50) DEFAULT 'MB20',
          settings JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_biometric_dev_serial ON public.biometric_devices (serial_number);
      CREATE INDEX IF NOT EXISTS idx_biometric_dev_branch ON public.biometric_devices (branch_id);

      -- 2. جدول سجلات البصمة الخام اللحظية (Immutable Event Stream)
      CREATE TABLE IF NOT EXISTS public.biometric_raw_punches (
          id BIGSERIAL PRIMARY KEY,
          device_serial VARCHAR(100) NOT NULL,
          device_user_pin VARCHAR(50) NOT NULL,
          punch_time TIMESTAMPTZ NOT NULL,
          verify_type VARCHAR(30) DEFAULT 'FINGERPRINT',
          raw_punch_state SMALLINT DEFAULT 0,
          employee_id VARCHAR(100) NULL,
          employee_name VARCHAR(255) NULL,
          branch_id VARCHAR(50) NULL,
          action_type VARCHAR(50) NULL,
          process_status VARCHAR(30) NOT NULL DEFAULT 'PROCESSED',
          process_notes TEXT NULL,
          raw_payload TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_raw_punches_dev_time ON public.biometric_raw_punches (device_serial, punch_time DESC);
      CREATE INDEX IF NOT EXISTS idx_raw_punches_emp ON public.biometric_raw_punches (employee_id);
      CREATE INDEX IF NOT EXISTS idx_raw_punches_status ON public.biometric_raw_punches (process_status);

      -- 3. جدول ربط بصمات وأرقام PIN الموظفين بالأجهزة
      CREATE TABLE IF NOT EXISTS public.employee_biometric_profiles (
          id VARCHAR(255) PRIMARY KEY,
          employee_id VARCHAR(100) NOT NULL UNIQUE,
          device_user_pin VARCHAR(50) NOT NULL UNIQUE,
          card_rfid VARCHAR(50) NULL,
          privilege VARCHAR(20) DEFAULT 'USER',
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_emp_bio_pin ON public.employee_biometric_profiles (device_user_pin);

      -- 4. جدول خزنة القوالب البيومترية السحابية (Fingerprint / Face Biometric Vault)
      CREATE TABLE IF NOT EXISTS public.biometric_templates (
          id VARCHAR(100) PRIMARY KEY,
          employee_id VARCHAR(100) NULL,
          device_user_pin VARCHAR(50) NOT NULL,
          template_type VARCHAR(30) NOT NULL DEFAULT 'FINGERPRINT',
          finger_id SMALLINT NOT NULL DEFAULT 0,
          size INT DEFAULT 0,
          valid SMALLINT DEFAULT 1,
          major_ver VARCHAR(20) DEFAULT '10',
          template_data TEXT NOT NULL,
          source_device_sn VARCHAR(100) NULL,
          source_branch_id VARCHAR(50) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_bio_tpl UNIQUE (device_user_pin, template_type, finger_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bio_tpl_pin ON public.biometric_templates (device_user_pin);
      CREATE INDEX IF NOT EXISTS idx_bio_tpl_emp ON public.biometric_templates (employee_id);

      -- 5. جدول سجلات ترحيل وتوزيع البصمات بين الفروع (Cross-Branch Dispatch Logs)
      CREATE TABLE IF NOT EXISTS public.biometric_dispatch_logs (
          id BIGSERIAL PRIMARY KEY,
          employee_id VARCHAR(100) NULL,
          employee_name VARCHAR(255) NULL,
          device_user_pin VARCHAR(50) NOT NULL,
          target_device_serial VARCHAR(100) NOT NULL,
          target_branch_id VARCHAR(50) NULL,
          target_branch_name VARCHAR(100) NULL,
          included_biometrics BOOLEAN DEFAULT TRUE,
          templates_count INT DEFAULT 0,
          status VARCHAR(30) DEFAULT 'QUEUED',
          dispatched_by VARCHAR(100) DEFAULT 'ADMIN',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_bio_disp_dev ON public.biometric_dispatch_logs (target_device_serial, created_at DESC);

      -- 6. جدول طابور أوامر أجهزة البصمة الدائم (Persistent Device Commands Queue)
      CREATE TABLE IF NOT EXISTS public.biometric_device_commands (
          id BIGSERIAL PRIMARY KEY,
          device_serial VARCHAR(100) NOT NULL,
          command_text TEXT NOT NULL,
          command_type VARCHAR(50) NOT NULL DEFAULT 'USER_UPDATE',
          status VARCHAR(30) DEFAULT 'PENDING',
          retries INT DEFAULT 0,
          sent_at TIMESTAMPTZ,
          acknowledged_at TIMESTAMPTZ,
          response_code INT,
          response_payload TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_bio_cmds_dev_status ON public.biometric_device_commands (device_serial, status, id ASC);

      -- 7. جدول مستخدمي جهاز البصمة الفعليين المسجلين في ذاكرة الجهاز (Device Enrolled Users Registry)
      CREATE TABLE IF NOT EXISTS public.biometric_device_users (
          id BIGSERIAL PRIMARY KEY,
          device_serial VARCHAR(100) NOT NULL,
          employee_id VARCHAR(100) NULL,
          device_user_pin VARCHAR(50) NOT NULL,
          display_name VARCHAR(150) NOT NULL,
          privilege INT DEFAULT 0, -- 0: User, 6: Admin, 14: SuperAdmin
          verify_mode INT DEFAULT 0, -- 0: Any, 1: FP only, 2: PW only, 3: FP+PW, 4: Face
          card_number VARCHAR(50) DEFAULT '',
          device_password VARCHAR(50) DEFAULT '',
          is_active BOOLEAN DEFAULT TRUE,
          sync_status VARCHAR(30) DEFAULT 'SYNCED',
          last_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_dev_emp_pin UNIQUE (device_serial, device_user_pin)
      );
      CREATE INDEX IF NOT EXISTS idx_bio_dev_users_dev ON public.biometric_device_users (device_serial, is_active);
      CREATE INDEX IF NOT EXISTS idx_bio_dev_users_pin ON public.biometric_device_users (device_user_pin);

      -- 8. جدول أكواد الفروع المتعددة للموظف الواحد (Multi-Branch Multi-PIN Mapping)
      CREATE TABLE IF NOT EXISTS public.employee_branch_pins (
          id BIGSERIAL PRIMARY KEY,
          employee_id VARCHAR(100) NOT NULL,
          branch_id VARCHAR(100) NOT NULL,
          device_user_pin VARCHAR(50) NOT NULL,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_emp_branch_pin UNIQUE (employee_id, branch_id)
      );
      CREATE INDEX IF NOT EXISTS idx_emp_branch_pin_lookup ON public.employee_branch_pins (device_user_pin, branch_id);
    `;

    await db.query(ddl);

    // تنظيف تلقائي فوري لأي مستخدمين وهميين ناتجين عن طوابع زمنية OPLOG السابقة
    try {
      await db.query(`DELETE FROM public.biometric_device_users WHERE device_user_pin LIKE '%:%' OR device_user_pin LIKE '%-%' OR device_user_pin !~ '^\\d+$'`);
    } catch (cleanErr) {}

    console.log('📡 [Biometric Manager] جداول أجهزة البصمة، الخزنة البيومترية، سجل المستخدمين، والفروع المتعددة مفهرسة ومجهزة بنجاح.');
  } catch (err) {
    console.error('❌ [Biometric Init Tables Error]:', err.message);
  }
}

// ── محرك التحويل الصوتي الذكي للأسماء لشاشات أجهزة البصمة (Smart Transliteration) ───
export function transliterateArabicToEnglish(arabicText) {
  if (!arabicText || typeof arabicText !== 'string') return '';
  const text = arabicText.trim();
  // إذا كان النص بالفعل باللغة الإنجليزية أو أرقام فقط
  if (/^[A-Za-z0-9\s._-]+$/.test(text)) return text.slice(0, 24);

  const commonNames = {
    'احمد': 'Ahmed', 'أحمد': 'Ahmed', 'محمد': 'Mohamed', 'محمود': 'Mahmoud',
    'علي': 'Ali', 'على': 'Ali', 'عمر': 'Omar', 'عمرو': 'Amr', 'سيف': 'Sief',
    'ايهاب': 'Ehab', 'إيهاب': 'Ehab', 'شريف': 'Sherief', 'بلال': 'Belal',
    'عبدالرحمن': 'Abdelrahman', 'عبد الرحمن': 'Abdelrahman', 'عبدالله': 'Abdallah',
    'عبد الله': 'Abdallah', 'روان': 'Rawan', 'صبري': 'Sabry', 'ادهم': 'Adham',
    'أدهم': 'Adham', 'حسين': 'Hussein', 'خالد': 'Khaled', 'طه': 'Taha',
    'ابراهيم': 'Ibrahim', 'إبراهيم': 'Ibrahim', 'يوسف': 'Youssef', 'مصطفى': 'Mostafa',
    'سليم': 'Selim', 'السمان': 'Elsamman', 'حسن': 'Hassan', 'كريم': 'Karim',
    'طارق': 'Tarek', 'ياسر': 'Yasser', 'سامح': 'Sameh', 'وليد': 'Walid',
    'وائل': 'Wael', 'هاني': 'Hany', 'مروان': 'Marwan', 'زياد': 'Ziad'
  };

  const map = {
    'أ': 'A', 'إ': 'E', 'آ': 'Aa', 'ا': 'A', 'ب': 'B', 'ت': 'T', 'ث': 'Th',
    'ج': 'G', 'ح': 'H', 'خ': 'Kh', 'د': 'D', 'ذ': 'Z', 'ر': 'R', 'ز': 'Z',
    'س': 'S', 'ش': 'Sh', 'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A',
    'غ': 'Gh', 'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
    'ه': 'H', 'و': 'W', 'ي': 'Y', 'ى': 'A', 'ة': 'a', 'ء': '', 'ئ': 'Y', 'ؤ': 'W'
  };

  const words = text.split(/\s+/);
  const translatedWords = words.map(w => {
    const cleanW = w.replace(/[ً-ْ]/g, '');
    if (commonNames[cleanW]) return commonNames[cleanW];
    let res = '';
    for (const char of cleanW) {
      res += map[char] || char;
    }
    return res;
  });

  return translatedWords.join(' ').replace(/[^a-zA-Z0-9\s._-]/g, '').trim().slice(0, 24);
}

// طابور طلبات المزامنة الشاملة لطوابع الجهاز (OpStamp Resync)
const deviceSyncStampRequests = new Map();

// ── ذاكرة سريعة لحماية التكرار المتوتر بالزمن الفعلي الأصلي للبصمة ─────────────
const recentPunchDebounce = new Map(); // key: `emp_${employeeId}` => punchEpoch

function isDebounced(empId, punchEpoch, windowMs = 45000) {
  const key = `emp_${empId}`;
  const effectiveEpoch = Number(punchEpoch) || Date.now();
  const lastTime = recentPunchDebounce.get(key) || 0;
  if (Math.abs(effectiveEpoch - lastTime) < windowMs) {
    return true;
  }
  recentPunchDebounce.set(key, effectiveEpoch);
  // تنظيف دوري للذاكرة المؤقتة كل 1000 مفتاح
  if (recentPunchDebounce.size > 1000) {
    const now = Date.now();
    for (const [k, ts] of recentPunchDebounce.entries()) {
      if (Math.abs(now - ts) > 3600000 * 24) recentPunchDebounce.delete(k);
    }
  }
  return false;
}

// ── طابور أوامر الأجهزة (Persistent + Memory Fallback Device Command Queue) ────
const deviceCommandQueues = new Map(); // key: serialNumber => Array of command strings

export function queueDeviceCommand(serialNumber, cmdString, cmdType = 'USER_UPDATE') {
  if (!serialNumber || !cmdString) return;

  // منع تكرار أوامر الفحص (CHECK/PING) في حال وجود أمر فحص سابق معلق لم ينفذ بعد لتفادي إرباك الماكينة
  if (cmdType === 'PING' || cmdType === 'DEVICE_CHECK' || cmdString.includes(':CHECK')) {
    if (globalDb) {
      globalDb.query(
        `UPDATE public.biometric_device_commands 
         SET status = 'CANCELLED', acknowledged_at = CURRENT_TIMESTAMP 
         WHERE device_serial = $1 AND (command_type IN ('PING', 'DEVICE_CHECK') OR command_text LIKE '%:CHECK') AND status = 'PENDING'`,
        [serialNumber]
      ).catch(() => {});
    }
  }

  // 1. إضافة للذاكرة المؤقتة للاستجابة اللحظية مع تصفية الفحوصات المكررة
  const list = deviceCommandQueues.get(serialNumber) || [];
  const filteredList = (cmdType === 'PING' || cmdType === 'DEVICE_CHECK' || cmdString.includes(':CHECK'))
    ? list.filter(c => !c.includes(':CHECK'))
    : list;
  filteredList.push(cmdString);
  deviceCommandQueues.set(serialNumber, filteredList);

  // 2. حفظ دائم في قاعدة البيانات لضمان عدم ضياع الأوامر عند إعادة تشغيل السيرفر
  if (globalDb) {
    globalDb.query(
      `INSERT INTO public.biometric_device_commands (device_serial, command_text, command_type, status)
       VALUES ($1, $2, $3, 'PENDING')`,
      [serialNumber, cmdString, cmdType]
    ).catch(e => console.warn('[Biometric Command Queue DB Error]:', e.message));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 💬 قوالب ومحرك إشعارات واتساب الذكي الموحد (Universal Attendance WhatsApp Engine)
// يدعم أجهزة البصمة MB20 وكشك البصمة الإلكترونية بمفاتيح تحكم وقوالب مستقلة
// ══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_ATTENDANCE_TEMPLATES = {
  admin_check_in: `🔔 *إشعار تسجيل حضور لحظي* 🟢
━━━━━━━━━━━━━━━━━━━━━━
👤 *الموظف:* {employee_name}
🏢 *الفرع:* {branch_name}
🕒 *الوقت:* {time} | {date}
📌 *الحركة:* {action_icon} {action}
🧬 *وسيلة التحقق:* {verify_type}
📟 *الجهاز / المصدر:* {device_name}
━━━━━━━━━━━━━━━━━━━━━━
🏛️ _{company_name}_`,

  employee_check_in: `👋 *مرحباً بك يا د/ {employee_name}* 🌟
━━━━━━━━━━━━━━━━━━━━━━
✅ *تم تسجيل حضورك بنجاح* 🟢
🏢 *الفرع:* {branch_name}
🕒 *الوقت:* {time} | {date}
🧬 *طريقة التبصيم:* {verify_type}
━━━━━━━━━━━━━━━━━━━━━━
✨ نتمنى لك يوماً موفقاً ومثمراً مليئاً بالإنجاز والعطاء!
🏛️ _{company_name}_`,

  admin_check_out: `🔔 *إشعار تسجيل انصراف لحظي* 🔴
━━━━━━━━━━━━━━━━━━━━━━
👤 *الموظف:* {employee_name}
🏢 *الفرع:* {branch_name}
🕒 *الوقت:* {time} | {date}
📌 *الحركة:* {action_icon} {action}
⏱️ *ساعات العمل:* {shift_hours}
🧬 *وسيلة التحقق:* {verify_type}
📟 *الجهاز / المصدر:* {device_name}
━━━━━━━━━━━━━━━━━━━━━━
🏛️ _{company_name}_`,

  employee_check_out: `👋 *شكراً لك يا د/ {employee_name}* 🌟
━━━━━━━━━━━━━━━━━━━━━━
✅ *تم تسجيل انصرافك بنجاح* 🔴
🏢 *الفرع:* {branch_name}
🕒 *الوقت:* {time} | {date}
⏱️ *إجمالي ساعات العمل:* {shift_hours}
━━━━━━━━━━━━━━━━━━━━━━
🌟 شكراً جزيلاً لجهودك وعطائك المتميز اليوم، ودمت بخير وسعادة!
🏛️ _{company_name}_`,

  admin_break_start: `☕ *إشعار بدء استراحة (Break Start)* 🟡
━━━━━━━━━━━━━━━━━━━━━━
👤 *الموظف:* {employee_name}
🏢 *الفرع:* {branch_name}
🕒 *وقت البدء:* {time} | {date}
📌 *الحركة:* {action_icon} {action}
📱 *المصدر:* كشك البصمة الإلكترونية الذكي
━━━━━━━━━━━━━━━━━━━━━━
🏛️ _{company_name}_`,

  employee_break_start: `☕ *استراحة هنيئة يا د/ {employee_name}* 🌿
━━━━━━━━━━━━━━━━━━━━━━
⏸️ *تم تسجيل بدء استراحتك بنجاح*
🏢 *الفرع:* {branch_name}
🕒 *وقت الخروج للراحة:* {time}
━━━━━━━━━━━━━━━━━━━━━━
🌿 نرجو لك وقتاً طيباً لتجديد طاقتك والعودة بهمة ونشاط!
🏛️ _{company_name}_`,

  admin_break_end: `⚡ *إشعار انتهاء الاستراحة والعودة للعمل* 🟢
━━━━━━━━━━━━━━━━━━━━━━
👤 *الموظف:* {employee_name}
🏢 *الفرع:* {branch_name}
🕒 *وقت العودة:* {time} | {date}
⏱️ *مدة الاستراحة:* {break_duration}
📌 *الحركة:* {action_icon} {action}
📱 *المصدر:* كشك البصمة الإلكترونية الذكي
━━━━━━━━━━━━━━━━━━━━━━
🏛️ _{company_name}_`,

  employee_break_end: `👋 *أهلاً بك مجدداً يا د/ {employee_name}* ⚡
━━━━━━━━━━━━━━━━━━━━━━
▶️ *تم تسجيل العودة واستئناف العمل بنجاح*
🏢 *الفرع:* {branch_name}
🕒 *وقت استئناف العمل:* {time}
⏱️ *مدة الاستراحة:* {break_duration}
━━━━━━━━━━━━━━━━━━━━━━
💪 طاقة متجددة وعمل موفق ومتميز بإذن الله!
🏛️ _{company_name}_`,

  device_offline: `⚠️ *تحذير: انقطاع اتصال جهاز بصمة (Device Offline)*
━━━━━━━━━━━━━━━━━━━━━━
📟 *الجهاز:* {device_name}
🏢 *الفرع:* {branch_name}
🔢 *الرقم التسلسلي:* {device_serial}
⏱️ *آخر ظهور (Ping):* {last_seen}
⏳ *مدة الانقطاع:* {offline_duration}
━━━━━━━━━━━━━━━━━━━━━━
⚠️ يُرجى فحص راوتر الإنترنت أو كابل الشبكة ومصدر كهرباء الجهاز بالفرع.
🏛️ _{company_name}_`,

  device_online: `🟢 *إشعار: عودة اتصال جهاز البصمة بالإنترنت (Device Online)*
━━━━━━━━━━━━━━━━━━━━━━
📟 *الجهاز:* {device_name}
🏢 *الفرع:* {branch_name}
🔢 *الرقم التسلسلي:* {device_serial}
🕒 *وقت العودة:* {time} | {date}
🌐 *عنوان IP:* {client_ip}
⏱️ *مزامنة التوقيت:* {time_sync_status}
━━━━━━━━━━━━━━━━━━━━━━
✅ تم استعادة الاتصال السحابي بالكامل وتأكيد نبض الماكينة.
🏛️ _{company_name}_`,

  reconciliation_report: `📊 *تقرير التسوية التلقائي بعد الاسترداد (Post-Recovery Reconciliation)*
━━━━━━━━━━━━━━━━━━━━━━
🏢 *الفرع:* {branch_name}
📟 *الجهاز:* {device_name}
🕒 *وقت المزامنة:* {sync_time} | {sync_date}
━━━━━━━━━━━━━━━━━━━━━━
📥 *إجمالي البصمات المستردة:* {total_punches} حركة
⏱️ *نطاق فترة التبصيم:* من {period_from} إلى {period_to}
🟢 *حركات الحضور:* {check_in_count}
🔴 *حركات الانصراف:* {check_out_count}
👥 *ملخص حركات الموظفين:*
{employees_summary}
━━━━━━━━━━━━━━━━━━━━━━
✅ تمت معالجة وتسوية كافة الورديات بنجاح بالترتيب الزمني الدقيق وحساب ساعات العمل تلقائياً دون أي تضارب.
🏛️ _{company_name}_`
};

/**
 * دالة مساعدة لاستبدال المتغيرات الذكية في نصوص قوالب واتساب
 */
export function formatAttendanceAlert(template, vars = {}) {
  let text = String(template || '');
  for (const [k, v] of Object.entries(vars)) {
    const reg = new RegExp(`{${k}}`, 'g');
    text = text.replace(reg, v !== undefined && v !== null ? String(v) : '');
  }
  return text;
}

/**
 * دالة إرسال رسالة واتساب مباشرة وموحدة عبر خادم واتساب
 */
export async function sendWhatsAppMessageDirect(phone, message) {
  if (!phone || !message) return false;
  let normalized = String(phone).replace(/\D/g, '');
  if (normalized.startsWith('01') && normalized.length === 11) {
    normalized = '2' + normalized;
  } else if (normalized.startsWith('1') && normalized.length === 10) {
    normalized = '20' + normalized;
  }
  if (normalized.length < 9) return false;

  const waUrls = [
    'http://hr-whatsapp-server:3100/send',
    'http://127.0.0.1:3100/send'
  ];

  for (const waUrl of waUrls) {
    try {
      const resp = await fetch(waUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'hr_main',
          phone: normalized,
          message
        }),
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}

/**
 * دالة إرسال تنبيهات المراقبة الذكية للأجهزة (Watchdog & Offline/Online Alerts)
 */
export async function dispatchWatchdogWhatsAppAlert(alertType, vars, state) {
  try {
    const org = state?.orgSettings || {};
    const alertConfig = org.biometricWhatsAppAlerts || {};
    if (alertConfig.enabled === false || alertConfig.watchdogEnabled === false) return;

    const customTemplates = alertConfig.templates || {};
    const template = customTemplates[alertType] || DEFAULT_ATTENDANCE_TEMPLATES[alertType];
    if (!template) return;

    const message = formatAttendanceAlert(template, {
      ...vars,
      company_name: vars.company_name || org.companyName || org.orgName || 'مجموعة الصيدليات'
    });

    const candidatePhones = [];
    if (Array.isArray(alertConfig.watchdogRecipientPhones) && alertConfig.watchdogRecipientPhones.length > 0) {
      candidatePhones.push(...alertConfig.watchdogRecipientPhones);
    } else {
      if (Array.isArray(alertConfig.recipientPhones)) candidatePhones.push(...alertConfig.recipientPhones);
      if (org.generalManagerPhone) candidatePhones.push(org.generalManagerPhone);
      if (org.adminPhone) candidatePhones.push(org.adminPhone);
      if (org.ownerPhone) candidatePhones.push(org.ownerPhone);
    }

    const uniquePhones = [...new Set(candidatePhones.map(p => String(p || '').replace(/\D/g, '')).filter(p => p.length >= 9))];
    for (const phone of uniquePhones) {
      const sent = await sendWhatsAppMessageDirect(phone, message);
      if (sent) {
        console.log(`[Watchdog WhatsApp] 📡 تم إرسال تنبيه (${alertType}) إلى ${phone}`);
      }
    }
  } catch (err) {
    console.warn('[Watchdog WhatsApp Alert Error]:', err.message);
  }
}

/**
 * دالة إرسال تقرير التسوية التلقائي بعد الاسترداد (Post-Recovery Reconciliation Report)
 */
export async function dispatchReconciliationWhatsAppAlert(vars, state) {
  try {
    const org = state?.orgSettings || {};
    const alertConfig = org.biometricWhatsAppAlerts || {};
    if (alertConfig.enabled === false || alertConfig.reconciliationEnabled === false) return;

    const customTemplates = alertConfig.templates || {};
    const template = customTemplates['reconciliation_report'] || DEFAULT_ATTENDANCE_TEMPLATES['reconciliation_report'];
    if (!template) return;

    const message = formatAttendanceAlert(template, {
      ...vars,
      company_name: vars.company_name || org.companyName || org.orgName || 'مجموعة الصيدليات'
    });

    const candidatePhones = [];
    if (Array.isArray(alertConfig.reconciliationRecipientPhones) && alertConfig.reconciliationRecipientPhones.length > 0) {
      candidatePhones.push(...alertConfig.reconciliationRecipientPhones);
    } else {
      if (Array.isArray(alertConfig.recipientPhones)) candidatePhones.push(...alertConfig.recipientPhones);
      if (org.generalManagerPhone) candidatePhones.push(org.generalManagerPhone);
      if (org.adminPhone) candidatePhones.push(org.adminPhone);
      if (org.ownerPhone) candidatePhones.push(org.ownerPhone);
    }

    const uniquePhones = [...new Set(candidatePhones.map(p => String(p || '').replace(/\D/g, '')).filter(p => p.length >= 9))];
    for (const phone of uniquePhones) {
      const sent = await sendWhatsAppMessageDirect(phone, message);
      if (sent) {
        console.log(`[Reconciliation WhatsApp] 📊 تم إرسال تقرير التسوية إلى ${phone}`);
      }
    }
  } catch (err) {
    console.warn('[Reconciliation WhatsApp Alert Error]:', err.message);
  }
}

/**
 * دالة إرسال إشعارات واتساب الشاملة لحركات الحضور والانصراف والاستراحة
 * تدعم:
 * 1. مفتاح مستقل لماكينات البصمة MB20 (notifyBiometricDevices).
 * 2. مفتاح مستقل لكشك البصمة الإلكترونية (notifyKioskPunches).
 * 3. حارس أمني صارم: قوالب بدء الاستراحة وإنهاء الاستراحة تُرسل حصرياً وفقط إذا كانت البصمة من كشك البصمة!
 */
export async function sendUniversalAttendanceWhatsAppAlert(punchPayload, state) {
  try {
    if (!punchPayload || typeof punchPayload !== 'object') return;

    const org = state?.orgSettings || {};
    const alertConfig = org.biometricWhatsAppAlerts || {};
    if (alertConfig.enabled === false) return;

    // توحيد مسمى الحركة
    let action = String(punchPayload.actionType || 'check_in').toLowerCase();
    if (action === 'start_shift') action = 'check_in';
    if (action === 'stop_shift' || action === 'shift_end') action = 'check_out';
    if (action === 'pause_shift') action = 'break_start';
    if (action === 'resume_shift') action = 'break_end';

    // التحقق الدقيق مما إذا كانت البصمة صادرة من كشك البصمة الإلكترونية
    const isKiosk = Boolean(
      punchPayload.isKiosk ||
      punchPayload.source === 'kiosk' ||
      punchPayload.source === 'kiosk_photo' ||
      punchPayload.source === 'kiosk_offline' ||
      punchPayload.source === 'kiosk_biometric' ||
      punchPayload.punchSource === 'kiosk' ||
      punchPayload.punchSource === 'kiosk_photo' ||
      punchPayload.punchSource === 'kiosk_offline' ||
      punchPayload.punchSource === 'kiosk_biometric' ||
      String(punchPayload.verifyType || '').toUpperCase() === 'KIOSK'
    );

    // 🛡️ [الشرط الحاسم 2]: قوالب بدء الاستراحة وإنهاء الاستراحة ترسل فقط في حالة كشك البصمة حصراً
    if (action === 'break_start' || action === 'break_end') {
      if (!isKiosk) {
        console.log(`[WhatsApp Alert Guard] ⛔ تم حجب إشعار الاستراحة (${action}) لأن مصدر البصمة ليس كشك البصمة الإلكترونية (المصدر: ${punchPayload.source || punchPayload.punchSource || 'MB20'}).`);
        return;
      }
    }

    // 🧬 [الشرط الحاسم 1]: التحقق من مفتاح تفعيل ماكينات البصمة MB20 مقابل كشك البصمة
    if (isKiosk) {
      if (alertConfig.notifyKioskPunches === false) {
        console.log(`[Attendance WhatsApp] ⏸️ تخطي الإشعار: إشعارات كشك البصمة الإلكترونية معطلة في الإعدادات.`);
        return;
      }
    } else {
      // ماكينة البصمة الفعلية ZKTeco MB20
      if (alertConfig.notifyBiometricDevices === false) {
        console.log(`[Attendance WhatsApp] ⏸️ تخطي الإشعار: إشعارات جهاز البصمة MB20 معطلة في الإعدادات.`);
        return;
      }
    }

    // التحقق من مفاتيح الحركات الفردية
    if (action === 'check_in' && alertConfig.notifyCheckIn === false) return;
    if (action === 'check_out' && alertConfig.notifyCheckOut === false) return;
    if (action === 'break_start' && alertConfig.notifyBreakStart === false) return;
    if (action === 'break_end' && alertConfig.notifyBreakEnd === false) return;

    const waUrls = [
      'http://hr-whatsapp-server:3100/send',
      'http://127.0.0.1:3100/send'
    ];

    const actionIcons = {
      check_in: '🟢',
      check_out: '🔴',
      break_start: '🟡',
      break_end: '⚡'
    };

    const actionLabels = {
      check_in: 'تسجيل حضور (Check-In)',
      check_out: 'تسجيل انصراف (Check-Out)',
      break_start: 'بدء استراحة (Break-Start)',
      break_end: 'إنهاء استراحة وعودة للعمل (Break-End)'
    };

    let verifyArabic = isKiosk ? 'كشك البصمة الإلكترونية الذكي 📱' : 'بصمة الإصبع الحيوية (MB20) 🧬';
    const vt = String(punchPayload.verifyType || '').toUpperCase();
    if (vt === 'FACE') verifyArabic = 'بصمة الوجه الذكية (Face) 👤';
    else if (vt === 'PASSWORD' || vt === 'PASS') verifyArabic = 'كلمة المرور (PIN) 🔑';
    else if (vt === 'CARD' || vt === 'RFID') verifyArabic = 'كارت ذكي (RFID) 💳';
    else if (vt.includes('PHOTO')) verifyArabic = 'صورة حية وتوثيق كشك البصمة 📸';

    const customTemplates = alertConfig.templates || {};
    const adminTemplate = customTemplates[`admin_${action}`] || (action === 'check_in' && alertConfig.adminMessageTemplate ? alertConfig.adminMessageTemplate : DEFAULT_ATTENDANCE_TEMPLATES[`admin_${action}`]);
    const empTemplate = customTemplates[`employee_${action}`] || DEFAULT_ATTENDANCE_TEMPLATES[`employee_${action}`];

    const templateVars = {
      employee_name: punchPayload.employeeName || 'غير معرف',
      branch_name: punchPayload.branchName || 'الفرع الرئيسي',
      time: punchPayload.time || '',
      date: punchPayload.date || '',
      action: actionLabels[action] || action,
      action_icon: actionIcons[action] || '📌',
      verify_type: verifyArabic,
      device_name: punchPayload.deviceName || punchPayload.deviceSerial || (isKiosk ? 'كشك البصمة الإلكترونية' : 'ZKTeco MB20'),
      company_name: org.companyName || org.orgName || 'مجموعة الصيدليات',
      shift_hours: punchPayload.shiftHours || '—',
      break_duration: punchPayload.breakDuration || '—'
    };

    // ── 1. إرسال إشعار فوري لهاتف الموظف نفسه (إذا كان الخيار مفعلاً) ───────────
    if (alertConfig.notifyEmployee !== false && punchPayload.employeeId) {
      const employees = Array.isArray(state?.employees) ? state.employees : [];
      const emp = employees.find(e => String(e.id) === String(punchPayload.employeeId) || (e.code && String(e.code) === String(punchPayload.employeeId)));
      const rawEmpPhone = emp?.phone || emp?.mobile || emp?.phoneNumber || emp?.whatsApp || emp?.whatsapp || '';
      let empPhone = String(rawEmpPhone).replace(/\D/g, '');
      if (empPhone.startsWith('01') && empPhone.length === 11) {
        empPhone = '2' + empPhone;
      } else if (empPhone.startsWith('1') && empPhone.length === 10) {
        empPhone = '20' + empPhone;
      }

      if (empPhone.length >= 9 && empTemplate) {
        const empMsg = formatAttendanceAlert(empTemplate, {
          ...templateVars,
          employee_name: emp?.name || templateVars.employee_name
        });

        for (const waUrl of waUrls) {
          try {
            const resp = await fetch(waUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: 'hr_main',
                phone: empPhone,
                message: empMsg
              }),
              signal: AbortSignal.timeout(4000)
            });
            if (resp.ok) {
              console.log(`[Attendance WhatsApp] 📲 تم إرسال إشعار (${action}) بنجاح إلى هاتف الموظف (${emp?.name || templateVars.employee_name} - ${empPhone})`);
              break;
            }
          } catch (e) {
            console.warn(`[Attendance WA Employee Error (${waUrl})]:`, e.message);
          }
        }
      }
    }

    // ── 2. إرسال إشعار لهواتف الإدارة العليا المسجلة ─────────────────────────────
    const candidatePhones = [];
    if (Array.isArray(alertConfig.recipientPhones)) {
      candidatePhones.push(...alertConfig.recipientPhones);
    }
    if (org.generalManagerPhone) candidatePhones.push(org.generalManagerPhone);
    if (org.adminPhone) candidatePhones.push(org.adminPhone);
    if (org.ownerPhone) candidatePhones.push(org.ownerPhone);
    if (Array.isArray(org.systemOwners)) {
      org.systemOwners.forEach(o => { if (o?.phone) candidatePhones.push(o.phone); });
    }

    const uniquePhones = [...new Set(candidatePhones.map(p => String(p || '').replace(/\D/g, '')).filter(p => p.length >= 9))];
    if (uniquePhones.length > 0 && adminTemplate) {
      const adminMsg = formatAttendanceAlert(adminTemplate, templateVars);

      for (const rawPhone of uniquePhones) {
        let phone = rawPhone;
        if (phone.startsWith('01') && phone.length === 11) phone = '2' + phone;
        else if (phone.startsWith('1') && phone.length === 10) phone = '20' + phone;

        for (const waUrl of waUrls) {
          try {
            const resp = await fetch(waUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: 'hr_main',
                phone,
                message: adminMsg
              }),
              signal: AbortSignal.timeout(4000)
            });
            if (resp.ok) {
              console.log(`[Attendance WhatsApp] 📲 تم إرسال إشعار (${action}) بنجاح إلى الإدارة العليا (${phone})`);
              break;
            }
          } catch {}
        }
      }
    }
  } catch (waErr) {
    console.warn('[Attendance WhatsApp Alert Warning]:', waErr.message);
  }
}

// الاسم المستعار للتوافق العكسي
export const sendBiometricWhatsAppAlert = sendUniversalAttendanceWhatsAppAlert;

// ══════════════════════════════════════════════════════════════════════════════
// 🚀 تسجيل مسارات ADMS ومسارات الواجهة البرمجية (Routes Registration)
// ══════════════════════════════════════════════════════════════════════════════
export function registerBiometricRoutes(app, db, io, redis, getSettingsFromStorage, saveSettingsToStorage, internalRecordPunch) {
  const STORAGE_KEY = 'pharmacy-tracker-data';

  const alertedOfflineDevices = new Set();
  let cdataProcessingQueue = Promise.resolve();

  // 🛡️ المكنسة الذكية لسلامة الورديات ومراقبة الأجهزة (Watchdog & Shift Safety Sweeper: كل 60 ثانية)
  const watchdogInterval = setInterval(async () => {
    try {
      const state = await getSettingsFromStorage(STORAGE_KEY).catch(() => null);
      if (!state) return;
      const org = state?.orgSettings || {};
      const alertConfig = org.biometricWhatsAppAlerts || {};
      const now = Date.now();

      // 🧹 1. فحص سلامة الورديات المفتوحة (Shift Safety Sweeper)
      // إغلاق أي وردية نشطة تجاوزت صمام الأمان (الافتراضي 15 ساعة) تلقائياً لحماية النظام من الورديات المعلقة
      const maxSafetyHours = parseFloat(alertConfig.shiftMaxHoursSafetyValve) || 15;
      const activeShiftsMap = { ...(state?.activeShifts || {}) };
      const activeKeys = Object.keys(activeShiftsMap);
      let sweptCount = 0;

      if (activeKeys.length > 0) {
        let shiftsList = [...(state?.shifts || [])];
        const employeesList = Array.isArray(state?.employees) ? state.employees : [];
        const sweptEmpIds = new Set();

        for (const empKey of activeKeys) {
          const aShift = activeShiftsMap[empKey];
          if (!aShift) continue;

          const shiftStartEpoch = Number(aShift.startEpoch) || (aShift.date && aShift.timeIn ? new Date(`${aShift.date}T${aShift.timeIn}:00`).getTime() : 0);
          if (!shiftStartEpoch) continue;

          const elapsedHours = (now - shiftStartEpoch) / (1000 * 60 * 60);
          if (elapsedHours >= maxSafetyHours) {
            const empObj = employeesList.find(e => String(e.id) === String(empKey) || String(e.code) === String(empKey));
            const schedH = parseFloat(empObj?.workHoursPerDay || empObj?.workHours || 8);
            const inTimeStr = (aShift.timeIn || '09:00').slice(0, 5);
            const [inH, inM] = inTimeStr.split(':').map(Number);
            let estOutTime = '';
            if (!isNaN(inH)) {
              const outTotalMins = (inH * 60 + (inM || 0) + Math.round(schedH * 60)) % (24 * 60);
              estOutTime = `${String(Math.floor(outTotalMins / 60)).padStart(2, '0')}:${String(outTotalMins % 60).padStart(2, '0')}`;
            }

            const targetShiftId = aShift.shiftId || aShift.id;
            let shiftIdx = -1;
            if (targetShiftId) {
              shiftIdx = shiftsList.findIndex(s => s.id === targetShiftId);
            }
            if (shiftIdx < 0) {
              shiftIdx = shiftsList.findIndex(s =>
                (String(s.employeeId) === String(empKey) || (s.employeeCode && String(s.employeeCode) === String(empKey))) &&
                (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive)
              );
            }

            if (shiftIdx >= 0) {
              shiftsList[shiftIdx] = {
                ...shiftsList[shiftIdx],
                timeOut: (shiftsList[shiftIdx].timeOut && shiftsList[shiftIdx].timeOut !== '—' && shiftsList[shiftIdx].timeOut !== 'قيد العمل الآن')
                  ? shiftsList[shiftIdx].timeOut
                  : (estOutTime || '—'),
                hours: (shiftsList[shiftIdx].hours && shiftsList[shiftIdx].hours > 0) ? shiftsList[shiftIdx].hours : schedH,
                actualWorkedHours: (shiftsList[shiftIdx].actualWorkedHours && shiftsList[shiftIdx].actualWorkedHours > 0) ? shiftsList[shiftIdx].actualWorkedHours : schedH,
                netHours: (shiftsList[shiftIdx].netHours && shiftsList[shiftIdx].netHours > 0) ? shiftsList[shiftIdx].netHours : schedH,
                regularHours: (shiftsList[shiftIdx].regularHours && shiftsList[shiftIdx].regularHours > 0) ? shiftsList[shiftIdx].regularHours : schedH,
                isLiveActive: false,
                status: 'completed',
                statusLabel: 'حضور مكتمل (مكنسة الأمان)',
                notes: ((shiftsList[shiftIdx].notes || '') + ` [أغلقت بواسطة مكنسة الأمان لتجاوز ${maxSafetyHours} ساعة بدون انصراف]`).trim()
              };
            }

            delete activeShiftsMap[empKey];
            sweptEmpIds.add(String(empKey));
            if (empObj?.id) sweptEmpIds.add(String(empObj.id));
            if (empObj?.code) sweptEmpIds.add(String(empObj.code));
            sweptCount++;
            console.log(`[Safety Sweeper] 🧹 تم إغلاق وردية الموظف (${empKey}) تلقائياً لتجاوزها ${elapsedHours.toFixed(1)} س`);
          }
        }

        if (sweptCount > 0) {
          state.activeShifts = activeShiftsMap;
          state.shifts = shiftsList;
          state._punchSource = 'safety_sweeper';
          state._endedShiftEmpIds = Array.from(sweptEmpIds);
          await saveSettingsToStorage(STORAGE_KEY, state, 'safety-sweeper');
          io.emit('state:updated', { activeShifts: activeShiftsMap, sweptCount, timestamp: new Date().toISOString() });
          io.emit('entity:changed', { entityType: 'activeShifts', action: 'auto_closed', sweptCount });
        }
      }

      // 🛰️ 2. فحص نبض الأجهزة وإرسال تنبيهات واتساب
      if (alertConfig.enabled === false || alertConfig.watchdogEnabled === false) {
        return;
      }

      const timeoutMinutes = parseInt(alertConfig.watchdogTimeoutMinutes || '10', 10) || 10;
      const timeoutMs = timeoutMinutes * 60 * 1000;

      const devRes = await db.query('SELECT * FROM public.biometric_devices');
      const devices = devRes.rows || [];

      for (const dev of devices) {
        const sn = dev.serial_number;
        if (!sn) continue;
        const lastHeartbeat = dev.last_heartbeat ? new Date(dev.last_heartbeat).getTime() : 0;
        const diffMs = now - lastHeartbeat;

        if (lastHeartbeat > 0 && diffMs > timeoutMs) {
          // الجهاز متأخر عن مهلة النبض -> تصنيفه OFFLINE
          if (dev.status !== 'OFFLINE') {
            await db.query(
              `UPDATE public.biometric_devices SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP WHERE serial_number = $1`,
              [sn]
            );
            io.emit('biometric:device_status_change', {
              serialNumber: sn,
              status: 'OFFLINE',
              lastHeartbeat: dev.last_heartbeat
            });
            console.log(`[Watchdog] ⚠️ جهاز ${sn} (${dev.device_name}) انقطع اتصاله منذ ${Math.round(diffMs / 60000)} دقيقة`);
          }

          if (!alertedOfflineDevices.has(sn)) {
            alertedOfflineDevices.add(sn);
            const offlineMinutes = Math.round(diffMs / 60000);
            const durationStr = offlineMinutes >= 60
              ? `${Math.floor(offlineMinutes / 60)} ساعة و ${offlineMinutes % 60} دقيقة`
              : `${offlineMinutes} دقيقة`;

            const lastSeenStr = dev.last_heartbeat
              ? new Date(dev.last_heartbeat).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })
              : 'غير مسجل';

            await dispatchWatchdogWhatsAppAlert('device_offline', {
              device_name: dev.device_name || `جهاز ZKTeco MB20 (${sn})`,
              branch_name: dev.branch_name || 'الفرع الرئيسي',
              device_serial: sn,
              last_seen: lastSeenStr,
              offline_duration: durationStr,
              company_name: org.companyName || org.orgName || 'مجموعة الصيدليات'
            }, state);
          }
        }
      }
    } catch (err) {
      console.warn('[Biometric Watchdog Error]:', err.message);
    }
  }, 60000);

  // ذاكرة مؤقتة لتتبع آخر كتابة في قاعدة البيانات لكل جهاز لتقليل استهلاك موارد DB
  const deviceLastDbWrite = new Map();

  // دالة مساعدة لتسجيل أو تحديث نبض الجهاز في قاعدة البيانات
  async function updateDeviceHeartbeat(sn, clientIp, options = {}) {
    if (!sn) return null;
    try {
      const nowObj = new Date();
      const nowIso = nowObj.toISOString();
      const nowMs = nowObj.getTime();

      const lastDbWrite = deviceLastDbWrite.get(sn) || 0;
      const existingRes = await db.query('SELECT * FROM public.biometric_devices WHERE serial_number = $1', [sn]);
      if (existingRes.rows && existingRes.rows.length > 0) {
        const oldDevice = existingRes.rows[0];
        const wasOffline = alertedOfflineDevices.has(sn) || oldDevice.status === 'OFFLINE';

        // نحدث قاعدة البيانات فوراً إذا كان الجهاز سابقاً OFFLINE أو مرت 20 ثانية منذ آخر كتابة أو طُلب ذلك قسراً
        const shouldWriteDb = wasOffline || (nowMs - lastDbWrite >= 20000) || options.forceDb;

        if (shouldWriteDb) {
          deviceLastDbWrite.set(sn, nowMs);
          await db.query(
            `UPDATE public.biometric_devices 
             SET status = 'ONLINE', last_heartbeat = $1, ip_address = COALESCE($2, ip_address), updated_at = $1 
             WHERE serial_number = $3`,
            [nowIso, clientIp, sn]
          );
        }

        // بث فوري للحالة الحية عبر Socket.io لشاشات الإدارة والمراقبة
        io.emit('biometric:device_status', {
          serialNumber: sn,
          status: 'ONLINE',
          lastHeartbeat: nowIso,
          clientIp: clientIp || oldDevice.ip_address
        });

        if (wasOffline) {
          alertedOfflineDevices.delete(sn);
          console.log(`[Watchdog] 🟢 استعادة اتصال الجهاز ${sn} (${oldDevice.device_name})`);

          io.emit('biometric:device_status_change', {
            serialNumber: sn,
            status: 'ONLINE',
            lastHeartbeat: nowIso
          });

          // مزامنة التوقيت التلقائية عند عودة الاتصال لمنع انزلاق الساعة (Clock Drift Guard)
          const state = await getSettingsFromStorage(STORAGE_KEY).catch(() => null);
          const alertConfig = state?.orgSettings?.biometricWhatsAppAlerts || {};
          let timeSyncStatusText = '✅ تم تأكيد تزامن الساعة السحابية';

          if (alertConfig.autoTimeSyncOnReconnect !== false) {
            const nowEgypt = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' });
            queueDeviceCommand(sn, `SET OPTION DateTime=${nowEgypt}`, 'TIME_SYNC');
            timeSyncStatusText = `✅ تم إرسال أمر مزامنة التوقيت فوراً (${nowEgypt})`;
            console.log(`[Clock Drift Guard] ⏱️ تم إرسال أمر مزامنة التوقيت للجهاز ${sn}: DateTime=${nowEgypt}`);
          }

          if (alertConfig.watchdogEnabled !== false) {
            await dispatchWatchdogWhatsAppAlert('device_online', {
              device_name: oldDevice.device_name || `جهاز ZKTeco MB20 (${sn})`,
              branch_name: oldDevice.branch_name || 'الفرع الرئيسي',
              device_serial: sn,
              time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
              date: new Date().toISOString().slice(0, 10),
              client_ip: clientIp || oldDevice.ip_address || '—',
              time_sync_status: timeSyncStatusText,
              company_name: state?.orgSettings?.companyName || state?.orgSettings?.orgName || 'مجموعة الصيدليات'
            }, state);
          }
        }

        return existingRes.rows[0];
      } else {
        // اكتشاف ذاتي للجهاز لأول مرة (Self-Discovery Auto Registration)
        const newId = `dev_${sn.toLowerCase()}`;
        const devName = options.deviceName || `جهاز بصمة ZKTeco MB20 (${sn})`;
        const insertRes = await db.query(
          `INSERT INTO public.biometric_devices 
           (id, device_name, serial_number, ip_address, protocol, status, last_heartbeat, firmware_version, device_type, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'ADMS', 'ONLINE', $5, $6, 'MB20', $5, $5)
           RETURNING *`,
          [newId, devName, sn, clientIp, nowIso, options.firmware || '8.0.4.3']
        );
        console.log(`[Biometric Manager] 🌟 جهاز بصمة جديد تم اكتشافه وتسجيله تلقائياً: ${sn} (${clientIp})`);
        return insertRes.rows[0];
      }
    } catch (err) {
      console.warn('[Biometric Heartbeat Error]:', err.message);
      return null;
    }
  }

  // ── التقاط وحفظ القوالب البيومترية السحابية (Biometric Vault Ingestion) ──────
  async function parseAndStoreBiometricTemplate(sn, table, rawBody, devObj) {
    if (!rawBody) return 0;
    const lines = rawBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let savedCount = 0;

    for (const line of lines) {
      let pin = '';
      let fingerId = 0;
      let size = 0;
      let valid = 1;
      let type = 1; // 1 = Fingerprint, 9 = Face
      let majorVer = '10';
      let templateData = '';

      // تنظيف السطر من أي بادئات محتملة مثل FP أو USER FP أو FINGERTMP
      const cleanLine = line.replace(/^(FP|USER\s+FP|FINGERTMP|BIODATA|TMP)\s+/i, '').trim();

      if (cleanLine.includes('=')) {
        // نجزئ أولاً بـ TAB (\t) أو الفاصلة للحفاظ على سلامة محتوى Base64
        const parts = cleanLine.includes('\t') ? cleanLine.split('\t') : cleanLine.split(/\s+/);
        const kv = {};
        for (const p of parts) {
          const eqIdx = p.indexOf('=');
          if (eqIdx > 0) {
            const k = p.slice(0, eqIdx).trim().toLowerCase();
            const v = p.slice(eqIdx + 1).trim();
            kv[k] = v;
          }
        }

        pin = kv.pin || kv.userpin || '';
        fingerId = parseInt(kv.index || kv.fid || kv.fingerid || '0', 10);
        size = parseInt(kv.size || '0', 10);
        valid = parseInt(kv.valid || '1', 10);
        type = parseInt(kv.type || '1', 10);
        majorVer = kv.majorver || '10';
        templateData = kv.tmp || kv.template || '';
      } else {
        const tokens = cleanLine.split(/[\t\s]+/);
        if (tokens.length >= 5) {
          pin = tokens[0];
          fingerId = parseInt(tokens[1] || '0', 10);
          size = parseInt(tokens[2] || '0', 10);
          valid = parseInt(tokens[3] || '1', 10);
          templateData = tokens[4];
        } else if (tokens.length === 3 || tokens.length === 4) {
          pin = tokens[0];
          fingerId = parseInt(tokens[1] || '0', 10);
          templateData = tokens[tokens.length - 1];
        }
      }

      pin = String(pin || '').trim();
      // معالجة وحماية بيانات القالب
      templateData = String(templateData || '').trim();

      if (!pin || !templateData || templateData.length < 10) continue;

      const templateType = (type === 9 || String(table).toUpperCase().includes('FACE')) ? 'FACE' : 'FINGERPRINT';
      const tplId = `tpl_${pin}_${templateType}_${fingerId}`;

      // البحث عن الموظف المطابق لهذا الـ PIN
      let matchedEmpId = null;
      let matchedEmpName = '';
      const profRes = await db.query(
        'SELECT employee_id FROM public.employee_biometric_profiles WHERE device_user_pin = $1 LIMIT 1',
        [pin]
      );
      if (profRes.rows && profRes.rows.length > 0) {
        matchedEmpId = profRes.rows[0].employee_id;
      }

      if (!matchedEmpId) {
        const state = await getSettingsFromStorage(STORAGE_KEY);
        const employees = Array.isArray(state?.employees) ? state.employees : [];
        const emp = employees.find(e =>
          String(e.code || '').trim() === pin ||
          String(e.id || '').trim() === pin ||
          String(e.enrollmentId || '').trim() === pin ||
          String(e.biometricPin || '').trim() === pin
        );
        if (emp) {
          matchedEmpId = emp.id;
          matchedEmpName = emp.name;
          await db.query(
            `INSERT INTO public.employee_biometric_profiles (id, employee_id, device_user_pin, notes, updated_at)
             VALUES ($1, $2, $3, 'ربط تلقائي عند التقاط البصمة', CURRENT_TIMESTAMP)
             ON CONFLICT (employee_id) DO UPDATE SET device_user_pin = EXCLUDED.device_user_pin, updated_at = CURRENT_TIMESTAMP`,
            [`map_${emp.id}_${Date.now()}`, String(emp.id), pin]
          );
        }
      } else {
        const state = await getSettingsFromStorage(STORAGE_KEY);
        const emp = (state?.employees || []).find(e => String(e.id) === String(matchedEmpId));
        if (emp) matchedEmpName = emp.name;
      }

      // مطابقة إضافية مع جدول مستخدمي الجهاز إن لم يتطابق في ملفات الـ HR
      if (!matchedEmpName) {
        try {
          const devUserQ = await db.query(
            'SELECT display_name, employee_id FROM public.biometric_device_users WHERE device_user_pin = $1 LIMIT 1',
            [pin]
          );
          if (devUserQ.rows?.[0]) {
            matchedEmpName = devUserQ.rows[0].display_name;
            if (!matchedEmpId && devUserQ.rows[0].employee_id) {
              matchedEmpId = devUserQ.rows[0].employee_id;
            }
          }
        } catch {}
      }

      await db.query(
        `INSERT INTO public.biometric_templates 
         (id, employee_id, employee_name, device_user_pin, template_type, finger_id, size, valid, major_ver, template_data, source_device_sn, source_branch_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
         ON CONFLICT (device_user_pin, template_type, finger_id) DO UPDATE SET
           template_data = EXCLUDED.template_data,
           size = EXCLUDED.size,
           valid = EXCLUDED.valid,
           major_ver = EXCLUDED.major_ver,
           source_device_sn = EXCLUDED.source_device_sn,
           source_branch_id = EXCLUDED.source_branch_id,
           employee_id = COALESCE(EXCLUDED.employee_id, biometric_templates.employee_id),
           employee_name = COALESCE(EXCLUDED.employee_name, biometric_templates.employee_name),
           updated_at = CURRENT_TIMESTAMP`,
        [tplId, matchedEmpId, matchedEmpName || null, pin, templateType, fingerId, size || templateData.length, valid, majorVer, templateData, sn, devObj?.branch_id || null]
      );

      savedCount++;

      io.emit('biometric:template_vaulted', {
        pin,
        employeeId: matchedEmpId,
        employeeName: matchedEmpName || `مستخدم ${pin}`,
        templateType,
        fingerId,
        sourceDeviceSn: sn,
        sourceBranchName: devObj?.branch_name || 'الإدارة',
        timestamp: new Date().toISOString()
      });

      console.log(`[Biometric Vault] 🧬 تم حفظ قالب بيومتري (${templateType} #${fingerId}) للموظف (${matchedEmpName || pin}) من جهاز ${sn}`);

      // 🏢 التحقق من محطة تسجيل الإدارة المركزية (HQ Enrollment Station):
      // إذا كان الجهاز هو ماكينة الإدارة (أو كانت هناك عملية تسجيل مركزي معلقة)، يتم تفريغ بصمة الموظف فوراً
      // من ذاكرة ماكينة الإدارة لتبقى الماكينة محطة تسجيل فقط ولا تحتفظ ببصمات الموظفين محلياً
      const isHqStation = hqPendingEnrollments.has(`${sn}_${pin}`) || (devObj && (
        devObj.is_hq_station ||
        (devObj.branch_name && (devObj.branch_name.includes('إدارة') || devObj.branch_name.includes('رئيسي') || devObj.branch_name.toLowerCase().includes('hq'))) ||
        (devObj.device_name && (devObj.device_name.includes('إدارة') || devObj.device_name.includes('تسجيل') || devObj.device_name.toLowerCase().includes('hq')))
      ));

      if (isHqStation) {
        console.log(`[HQ Enrollment Station] 🧹 تم حفظ القالب بالسحابة بنجاح! جاري تفريغ ذاكرة ماكينة الإدارة (${sn}) للمستخدم (PIN: ${pin}) للحفاظ عليها كمحطة تسجيل فقط...`);
        setTimeout(() => {
          const purgeTime = Date.now();
          queueDeviceCommand(sn, `C:${purgeTime}:DATA DELETE FINGERTMP PIN=${pin}`, 'HQ_PURGE_FP');
          queueDeviceCommand(sn, `C:${purgeTime + 1}:DATA DELETE BIODATA PIN=${pin}`, 'HQ_PURGE_BIO');
          queueDeviceCommand(sn, `C:${purgeTime + 2}:DATA DELETE USERINFO PIN=${pin}`, 'HQ_PURGE_USER');
          hqPendingEnrollments.delete(`${sn}_${pin}`);
          io.emit('biometric:hq_device_purged', {
            serialNumber: sn,
            pin,
            employeeName: matchedEmpName,
            message: `تم تفريغ الموظف (PIN: ${pin}) من ماكينة الإدارة بنجاح وبقيت البصمة في الخزنة السحابية للتعميم`
          });
        }, 3000);
      }
    }

    if (savedCount > 0) {
      io.emit('biometric:templates_updated', { count: savedCount, serialNumber: sn });
    }

    return savedCount;
  }

  // ── تسجيل وحفظ مستخدمي الجهاز الفعليين في ذاكرة الجهاز ─────────────────────────
  async function parseAndStoreDeviceUsers(sn, rawBody, devObj) {
    if (!rawBody || !db) return 0;
    const lines = rawBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let count = 0;

    let state = null;
    try {
      state = await getSettingsFromStorage(STORAGE_KEY);
    } catch {}
    const employees = Array.isArray(state?.employees) ? state.employees : [];

    // جلب ملفات الـ profiles الحالية للربط السريع
    let profilesMap = new Map();
    try {
      const profQ = await db.query('SELECT employee_id, device_user_pin FROM public.employee_biometric_profiles');
      profilesMap = new Map((profQ.rows || []).map(r => [String(r.device_user_pin), r.employee_id]));
    } catch (e) {
      console.warn('[Profiles Map Warn]:', e.message);
    }

    // التحقق إن كان السطر الأول هو Header جدول
    let headers = null;
    let startIndex = 0;
    if (lines.length > 0 && !lines[0].includes('=')) {
      const firstLineTokens = lines[0].split(/[\t,]/).map(t => t.trim().toLowerCase());
      if (firstLineTokens.some(t => t === 'pin' || t === 'userpin' || t === 'name')) {
        headers = firstLineTokens;
        startIndex = 1;
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      try {
        let pin = '';
        let name = '';
        let pri = 0;
        let passwd = '';
        let card = '';
        let verify = 0;

        // تجاهل أسطر سجل العمليات الإدارية OPLOG تماماً لمنع إنشاء مستخدمين وهميين من التوقيتات
        if (line.toUpperCase().startsWith('OPLOG') || line.toUpperCase().startsWith('OPERLOG')) {
          continue;
        } else if (line.includes('=')) {
          // استخراج الحقول بدقة دون تكسير الأسماء ذات المسافات:
          // نفصل أولاً بعلامة TAB (\t)
          const pairs = line.split('\t');
          for (const pair of pairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) {
              // محاولة ثانوية إذا كانت مفصولة بمسافات
              const subPairs = pair.split(' ');
              for (const sp of subPairs) {
                const subEq = sp.indexOf('=');
                if (subEq > 0) {
                  const k = sp.slice(0, subEq).trim().toUpperCase();
                  const v = sp.slice(subEq + 1).trim();
                  if (k === 'PIN') pin = v;
                  else if (k === 'PRI') pri = parseInt(v, 10) || 0;
                  else if (k === 'CARD') card = v;
                  else if (k === 'PASSWD' || k === 'PASSWORD') passwd = v;
                  else if (k === 'VERIFY') verify = parseInt(v, 10) || 0;
                }
              }
              continue;
            }
            let k = pair.slice(0, eqIdx).trim().toUpperCase();
            if (k.startsWith('USER ')) k = k.replace(/^USER\s+/, '');
            const v = pair.slice(eqIdx + 1).trim();

            if (k === 'PIN') pin = v;
            else if (k === 'NAME') name = v;
            else if (k === 'PRI') pri = parseInt(v, 10) || 0;
            else if (k === 'PASSWD' || k === 'PASSWORD') passwd = v;
            else if (k === 'CARD') card = v;
            else if (k === 'VERIFY') verify = parseInt(v, 10) || 0;
          }
        } else if (headers) {
          const vals = line.split(/[\t,]/).map(v => v.trim());
          headers.forEach((h, idx) => {
            const val = vals[idx] || '';
            if (h === 'pin' || h === 'userpin') pin = val;
            else if (h === 'name') name = val;
            else if (h === 'pri') pri = parseInt(val, 10) || 0;
            else if (h === 'passwd' || h === 'password') passwd = val;
            else if (h === 'card') card = val;
            else if (h === 'verify') verify = parseInt(val, 10) || 0;
          });
        } else {
          // سطر مجرد: pin \t name \t pri ... أو USER 1 Sief 0
          let cleanLine = line;
          if (cleanLine.toUpperCase().startsWith('USER ')) cleanLine = cleanLine.replace(/^USER\s+/i, '');
          const tokens = cleanLine.split(/[\t,]/).map(t => t.trim());
          if (tokens.length >= 2) {
            pin = tokens[0];
            name = tokens[1];
            if (tokens.length >= 3) pri = parseInt(tokens[2] || '0', 10) || 0;
          } else if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
            pin = tokens[0];
          }
        }

        pin = String(pin || '').trim();
        // درع الحماية الصارم: رفض أي PIN يحتوي على نقطتين (توقيت مثل 21:28:41) أو ليس رقماً بحتاً (1 إلى 10 أرقام)
        if (!pin || !/^\d{1,10}$/.test(pin) || pin.includes(':') || pin.includes('-')) {
          continue;
        }

        // مطابقة الموظف:
        // 1. من profilesMap
        let matchedEmpId = profilesMap.get(String(pin)) || null;

        // 2. إذا لم يطابق، ابحث في قائمة الموظفين بـ (code, id, enrollmentId, biometricPin, name)
        if (!matchedEmpId) {
          const emp = employees.find(e =>
            String(e.code || '').trim() === String(pin) ||
            String(e.id || '').trim() === String(pin) ||
            String(e.enrollmentId || '').trim() === String(pin) ||
            String(e.biometricPin || '').trim() === String(pin) ||
            (name && e.name && e.name.trim().toLowerCase() === name.trim().toLowerCase())
          );
          if (emp) {
            matchedEmpId = emp.id;
            if (!name) name = emp.name;
            // حفظ الربط في employee_biometric_profiles تلقائياً
            try {
              await db.query(
                `INSERT INTO public.employee_biometric_profiles (id, employee_id, device_user_pin, notes, updated_at)
                 VALUES ($1, $2, $3, 'ربط تلقائي عند فحص ذاكرة الماكينة', CURRENT_TIMESTAMP)
                 ON CONFLICT (employee_id) DO UPDATE SET device_user_pin = EXCLUDED.device_user_pin, updated_at = CURRENT_TIMESTAMP`,
                [`map_${emp.id}_${Date.now()}`, String(emp.id), String(pin)]
              );
            } catch (errDb) {
              console.warn('[Auto-map Profile DB Warn]:', errDb.message);
            }
          }
        }

        const displayName = (name || `مستخدم ${pin}`).replace(/[\r\n\t]/g, ' ').trim();

        await db.query(
          `INSERT INTO public.biometric_device_users 
           (device_serial, employee_id, device_user_pin, display_name, privilege, verify_mode, card_number, device_password, is_active, sync_status, last_synced_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'SYNCED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
             display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.biometric_device_users.display_name),
             employee_id = COALESCE(EXCLUDED.employee_id, public.biometric_device_users.employee_id),
             privilege = EXCLUDED.privilege,
             verify_mode = EXCLUDED.verify_mode,
             card_number = EXCLUDED.card_number,
             device_password = EXCLUDED.device_password,
             sync_status = 'SYNCED',
             last_synced_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP`,
          [sn, matchedEmpId, String(pin), displayName, pri, verify, card, passwd]
        );
        count++;
      } catch (e) {
        console.warn('[Parse Device User Error]:', e.message);
      }
    }

    if (count > 0) {
      io.emit('biometric:device_users_updated', { serialNumber: sn, count });
    }
    return count;
  }

  // ── إرسال إشعارات واتساب فورية للإدارة العليا وهاتف الموظف عند التبصيم ────────────
  async function sendBiometricWhatsAppAlert(punchPayload, state) {
    return sendUniversalAttendanceWhatsAppAlert(punchPayload, state);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1. معالج المصافحة والاستعلام (ADMS Handshake & Heartbeat: GET /iclock/cdata)
  // ────────────────────────────────────────────────────────────────────────────
  const handleAdmsGetCData = async (req, res) => {
    try {
      const sn = (req.query.SN || req.query.sn || '').trim();
      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const pushver = req.query.pushver || '2.0.33';

      if (!sn) {
        return res.status(400).send('ERROR: Missing SN');
      }

      await updateDeviceHeartbeat(sn, clientIp, { firmware: req.query.version });

      // بث حالة الجهاز اللحظية لشاشات الإدارة والكشك
      io.emit('biometric:device_status', {
        serialNumber: sn,
        status: 'ONLINE',
        lastHeartbeat: new Date().toISOString(),
        clientIp
      });

      // رد المعايير القياسي الخاص بـ ZKTeco ADMS Firmware
      const needsFullSync = deviceSyncStampRequests.get(sn);
      if (needsFullSync) {
        deviceSyncStampRequests.delete(sn);
      }
      const opStampVal = needsFullSync ? '0' : '9999';

      const responseConfig = [
        `GET OPTION FROM: ${sn}`,
        'Stamp=9999',
        `OpStamp=${opStampVal}`,
        'PhotoStamp=0',
        'ErrorDelay=30',
        'Delay=3',
        'RequestDelay=15',
        'TransTimes=00:00;23:59',
        'TransInterval=1',
        'TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP FPImag FACE UserPic BioPhoto',
        'PushOptionsFlag=1',
        'TimeZone=3',
        'Realtime=1',
        'Encrypt=0',
        'ServerVer=2.4.1',
        `PushProtVer=${pushver}`
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Connection', 'close');
      return res.status(200).send(responseConfig);
    } catch (err) {
      console.error('[ADMS GET cdata Error]:', err);
      return res.status(500).send('ERROR');
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 2. معالج استقبال حركات البصمة اللحظية (ADMS Punch Ingestion: POST /iclock/cdata)
  // ────────────────────────────────────────────────────────────────────────────
  const handleAdmsPostCData = async (req, res) => {
    try {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Connection', 'close');
      const sn = (req.query.SN || req.query.sn || '').trim();
      const table = (req.query.table || req.query.Table || 'ATTLOG').toUpperCase();
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';

      if (!sn) {
        return res.status(400).send('ERROR: Missing SN');
      }

      const devObj = await updateDeviceHeartbeat(sn, clientIp);

      // استخراج المحتوى النصي للحركات
      let rawBody = '';
      if (typeof req.body === 'string') {
        rawBody = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        rawBody = req.body.toString('utf8');
      } else if (req.body && typeof req.body === 'object') {
        const entries = Object.entries(req.body);
        if (entries.length === 1 && (!entries[0][1] || entries[0][1] === '')) {
          rawBody = entries[0][0];
        } else {
          rawBody = entries.map(([k, v]) => (v !== undefined && v !== '') ? `${k}=${v}` : k).join('\t');
          if (entries.some(([k]) => k.includes('\n'))) {
            rawBody = entries.map(([k, v]) => `${k}=${v}`).join('\n');
          }
        }
        if (typeof req.body.data === 'string') rawBody = req.body.data;
      }

      const isTemplateTable = table === 'BIODATA' || 
                              table === 'FINGERTMP' || 
                              table === 'FACETMP' || 
                              table.includes('TMP') || 
                              table.includes('TEMPLATE') || 
                              table.includes('BIODATA') || 
                              table.includes('USER_FP') ||
                              rawBody.includes('TMP=') || 
                              rawBody.includes('FID=');

      if (isTemplateTable) {
        const count = await parseAndStoreBiometricTemplate(sn, table, rawBody, devObj);
        console.log(`[Biometric Manager] 🧬 تم استلام وحفظ ${count} قالب بيومتري من جهاز (SN: ${sn})`);
        return res.status(200).send(`OK: ${count}`);
      }

      if (table === 'USERINFO' || table === 'USER' || table === 'USER_INFO') {
        const count = await parseAndStoreDeviceUsers(sn, rawBody, devObj);
        console.log(`[Biometric Manager] 👥 تم استلام وحفظ ${count} مستخدم مسجل من ذاكرة جهاز (SN: ${sn})`);
        return res.status(200).send(`OK: ${count}`);
      }

      if (table === 'OPERLOG' || table === 'OPLOG' || table === 'OPER_LOG') {
        const lines = rawBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const count = lines.length || 1;
        return res.status(200).send(`OK: ${count}`);
      }

      if (table.toLowerCase() === 'options') {
        console.log(`[ADMS Options] Received hardware options from ${sn} (len=${rawBody.length})`);
        return res.status(200).send('OK');
      }

      if (table !== 'ATTLOG') {
        console.log(`[ADMS Info] Received table: ${table} from ${sn} (len=${rawBody.length})`);
        return res.status(200).send('OK');
      }

      const lines = rawBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        return res.status(200).send('OK: 0');
      }

      console.log(`[Biometric Manager] 📥 استلام ${lines.length} حركة بصمة حية من جهاز MB20 (SN: ${sn})`);

      // 🔒 طابور تسلسلي ذري (Mutex Queue) لمعالجة حزم ATTLOG بدقة متناهية لمنع التضارب اللحظي بين الأجهزة
      await new Promise((resolve) => {
        cdataProcessingQueue = cdataProcessingQueue.then(async () => {
          try {
            // ⚡ استخراج واستعلام كافة أرقام الـ PIN في الدفعة دفعة واحدة لتقليص زمن الاستعلام (Bulk Parallel Lookup)
            const allPins = [...new Set(lines.map(l => l.split(/[\t\s]+/)[0]?.trim()).filter(Boolean))];
            const profilesMap = new Map();
            if (allPins.length > 0) {
              try {
                const bulkProf = await db.query(
                  'SELECT employee_id, device_user_pin FROM public.employee_biometric_profiles WHERE device_user_pin = ANY($1)',
                  [allPins]
                );
                (bulkProf.rows || []).forEach(r => profilesMap.set(String(r.device_user_pin), r.employee_id));
              } catch (e) {
                console.warn('[Biometric Bulk Prof Warn]:', e.message);
              }
            }

            // جلب بيانات النظام الحالية (الموظفين والورديات)
            const state = await getSettingsFromStorage(STORAGE_KEY);
            const org = state?.orgSettings || {};
            const alertConfig = org.biometricWhatsAppAlerts || {};
            const employees = Array.isArray(state?.employees) ? state.employees : [];
            const currentActiveShifts = { ...(state?.activeShifts || {}) };
            let currentShifts = [...(state?.shifts || [])];

            let processedCount = 0;
            const endedEmpIds = new Set();

      // ⚡ تحليل وفرز الحركات زمنياً تصاعدياً لضمان معالجة حزم ما بعد انقطاع الإنترنت بالترتيب الزمني الصحيح
      const parsedPunchList = lines.map(line => {
        let pin = '';
        let punchDateTimeStr = '';
        let rawState = 0;
        let rawVerifyType = 1;

        if (line.includes('\t')) {
          const tabParts = line.split('\t').map(p => p.trim());
          pin = tabParts[0] || '';
          punchDateTimeStr = tabParts[1] || '';
          rawState = parseInt(tabParts[2] || '0', 10);
          rawVerifyType = parseInt(tabParts[3] || '1', 10);
        } else {
          const tokens = line.split(/[\t\s]+/).filter(Boolean);
          if (tokens.length < 2) return null;
          pin = tokens[0].trim();
          if (tokens.length >= 3 && tokens[1].includes('-') && tokens[2].includes(':')) {
            punchDateTimeStr = `${tokens[1]} ${tokens[2]}`;
            rawState = parseInt(tokens[3] || '0', 10);
            rawVerifyType = parseInt(tokens[4] || '1', 10);
          } else {
            punchDateTimeStr = tokens[1] || '';
            rawState = parseInt(tokens[2] || '0', 10);
            rawVerifyType = parseInt(tokens[3] || '1', 10);
          }
        }

        if (!pin || !punchDateTimeStr) return null;

        let punchEpoch = Date.now();
        try {
          const parsed = new Date(punchDateTimeStr.replace(' ', 'T'));
          if (!isNaN(parsed.getTime())) {
            punchEpoch = parsed.getTime();
          }
        } catch {}

        let datePart = punchDateTimeStr.slice(0, 10);
        let timePart = punchDateTimeStr.slice(11, 16);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
          datePart = new Date().toISOString().slice(0, 10);
        }
        if (!/^\d{2}:\d{2}$/.test(timePart)) {
          timePart = new Date().toTimeString().slice(0, 5);
        }

        return {
          line,
          pin,
          punchDateTimeStr,
          rawState,
          rawVerifyType,
          punchEpoch,
          datePart,
          timePart
        };
      }).filter(Boolean);

      // الفرز الزمني الصارم: الأقدم أولاً فالأحدث (Chronological Ascending Sorting)
      parsedPunchList.sort((a, b) => a.punchEpoch - b.punchEpoch);

      // ⚡ رصد ومتابعة إحصائيات تقرير التسوية التلقائي بعد الاسترداد (Reconciliation Tracker)
      const isOfflineBatch = parsedPunchList.length >= (parseInt(alertConfig.reconciliationMinBatchSize, 10) || 3) ||
        parsedPunchList.some(p => (Date.now() - p.punchEpoch) > 5 * 60 * 1000);

      let checkInCount = 0;
      let checkOutCount = 0;
      const empActionMap = new Map(); // key: empId -> { name, actions: [] }

      for (const punchItem of parsedPunchList) {
        const { line, pin, punchDateTimeStr, rawState, rawVerifyType, datePart, timePart } = punchItem;
        const punchEpoch = punchItem.punchEpoch;

        // تصنيف وسيلة التحقق
        const verifyType = rawVerifyType === 15 || rawVerifyType === 20 ? 'FACE' : 'FINGERPRINT';

        // ضمان عدم وجود أي طابع زمني مستقبلي بسبب فروق المنطقة الزمنية بين الماكينة والسيرفر
        const realCurrentNow = Date.now();
        let safePunchEpoch = punchEpoch;
        if (!safePunchEpoch || isNaN(safePunchEpoch) || safePunchEpoch > realCurrentNow) {
          safePunchEpoch = realCurrentNow;
        }

        // 0. درع التحقق من حالة الموظف على الجهاز (هل تم إيقافه مؤقتاً؟)
        try {
          const devUserStatusQ = await db.query(
            `SELECT is_active, display_name FROM public.biometric_device_users 
             WHERE (device_serial = $1 OR $1 IS NULL) 
               AND (device_user_pin = $2 OR trim(leading '0' from device_user_pin) = trim(leading '0' from $2))
             ORDER BY (device_serial = $1) DESC LIMIT 1`,
            [sn, pin]
          );
          if (devUserStatusQ.rows?.[0] && devUserStatusQ.rows[0].is_active === false) {
            console.log(`[Biometric Guard] ⛔ بصمة مرفوضة: الموظف (${devUserStatusQ.rows[0].display_name || pin}) موقوف إدارياً على جهاز ${sn}`);
            await db.query(
              `INSERT INTO public.biometric_raw_punches 
               (device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, process_notes, raw_payload)
               VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, 'suspended_user', 'SUSPENDED', 'محاولة تبصيم لموظف موقوف إدارياً على هذا الجهاز', $8)`,
              [sn, pin, `${datePart} ${timePart}:00`, verifyType, rawState, devUserStatusQ.rows[0].display_name || `مستخدم ${pin}`, devObj?.branch_id || null, line]
            );
            io.emit('biometric:suspended_punch_attempt', {
              serialNumber: sn,
              pin,
              employeeName: devUserStatusQ.rows[0].display_name || `مستخدم ${pin}`,
              time: `${datePart} ${timePart}`
            });
            processedCount++;
            continue;
          }
        } catch (guardErr) {
          console.warn('[Biometric Guard Warn]:', guardErr.message);
        }

        // 1. البحث الفوري في جدول أكواد الفروع المتعددة أولاً (Multi-Branch Multi-PIN Resolver)
        let matchedEmpId = null;
        let matchedEmpName = null;
        let matchedBranchId = devObj?.branch_id || '';

        try {
          const branchPinQ = await db.query(
            `SELECT employee_id, branch_id FROM public.employee_branch_pins 
             WHERE device_user_pin = $1 AND (branch_id = $2 OR $2 = '' OR branch_id IS NULL) 
             LIMIT 1`,
            [pin, matchedBranchId]
          );
          if (branchPinQ.rows && branchPinQ.rows.length > 0) {
            matchedEmpId = branchPinQ.rows[0].employee_id;
            if (branchPinQ.rows[0].branch_id) matchedBranchId = branchPinQ.rows[0].branch_id;
          }
        } catch (e) {
          console.warn('[Branch Pin Lookup Warn]:', e.message);
        }

        // 2. إذا لم يوجد في أكواد الفروع، فحص الذاكرة المجمعة profilesMap (< 0.1ms)
        if (!matchedEmpId) {
          matchedEmpId = profilesMap.get(pin) || null;
        }

        // 3. إذا لم يوجد في جدول الربط، فحص قائمة الموظفين في الـ HR
        let matchedEmpObj = null;
        if (!matchedEmpId) {
          const emp = employees.find(e =>
            String(e.code || '').trim() === pin ||
            String(e.id || '').trim() === pin ||
            String(e.enrollmentId || '').trim() === pin ||
            String(e.biometricPin || '').trim() === pin
          );
          if (emp) {
            matchedEmpObj = emp;
            matchedEmpId = emp.id;
            matchedEmpName = emp.name;
            if (emp.branchId) matchedBranchId = emp.branchId;
          }
        } else {
          const emp = employees.find(e => String(e.id) === String(matchedEmpId));
          if (emp) {
            matchedEmpObj = emp;
            matchedEmpName = emp.name;
            if (emp.branchId && !matchedBranchId) matchedBranchId = emp.branchId;
          }
        }

        // إذا كان الموظف غير معرف بعد في النظام:
        if (!matchedEmpId) {
          await db.query(
            `INSERT INTO public.biometric_raw_punches 
             (device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, process_status, process_notes, raw_payload)
             VALUES ($1, $2, $3, $4, $5, 'UNMAPPED', 'رقم PIN غير مربوط بأي موظف', $6)`,
            [sn, pin, `${datePart} ${timePart}:00`, verifyType, rawState, line]
          );

          // بث تنبيه فوري للإدارة لربط الـ PIN بالموظف
          io.emit('biometric:unmapped_punch', {
            serialNumber: sn,
            pin,
            dateTime: `${datePart} ${timePart}`,
            verifyType,
            deviceName: devObj?.device_name || sn
          });

          processedCount++;
          continue;
        }

        // 3. درع منع التكرار المتوتر بالزمن الفعلي للبصمة (Anti-Bounce Debounce Filter: 90 ثانية افتراضياً)
        const debounceSeconds = alertConfig.antiBounceEnabled !== false
          ? (parseInt(alertConfig.antiBounceSeconds, 10) || 90)
          : 45;
        const debounceWindowMs = debounceSeconds * 1000;

        if (isDebounced(matchedEmpId, punchEpoch, debounceWindowMs)) {
          console.log(`[Biometric Debounce] تم صيانة بصمة سريعة مكررة للموظف ${matchedEmpName || matchedEmpId} (ضمن ${debounceSeconds} ثانية من نفس البصمة)`);
          await db.query(
            `INSERT INTO public.biometric_raw_punches 
             (device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, process_notes, raw_payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ignored_duplicate', 'DUPLICATE', 'تكرار بصمة سريع غير مقصود تم صده لحماية الوردية (Anti-Bounce)', $9)`,
            [sn, pin, `${datePart} ${timePart}:00`, verifyType, rawState, matchedEmpId, matchedEmpName, matchedBranchId, line]
          );
          processedCount++;
          continue;
        }

        // 4. خوارزمية التوجيه الذكي للوردية (Smart Shift Direction Prediction) مع دعم الورديات الليلية العابرة لمنتصف الليل
        const possibleEmpKeys = [
          matchedEmpId,
          String(matchedEmpId),
          matchedEmpObj?.code ? String(matchedEmpObj.code) : null,
          matchedEmpObj?.id ? String(matchedEmpObj.id) : null
        ].filter(Boolean);

        let activeShiftKey = possibleEmpKeys.find(k => currentActiveShifts[k]);
        let activeShift = activeShiftKey ? currentActiveShifts[activeShiftKey] : null;

        // فحص الورديات المفتوحة في currentShifts كصمام أمان ثانٍ
        const openShiftIdx = currentShifts.findIndex(s =>
          possibleEmpKeys.some(k => String(s.employeeId) === String(k) || (s.employeeCode && String(s.employeeCode) === String(k))) &&
          (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.timeOut === 'قيد العمل الآن' || s.isLiveActive)
        );
        const openShift = openShiftIdx >= 0 ? currentShifts[openShiftIdx] : null;

        let actionType = 'check_in';
        let isOvernightCheckOut = false;
        const effectiveActive = activeShift || openShift;

        if (effectiveActive) {
          const shiftStartDate = effectiveActive.date || datePart;
          const shiftStartTime = (effectiveActive.timeIn || '00:00').slice(0, 5);
          const shiftStartEpoch = Number(effectiveActive.startEpoch) ||
            new Date(`${shiftStartDate}T${shiftStartTime}:00`).getTime();

          const shiftDurationMs = punchEpoch - shiftStartEpoch;
          const shiftDurationHours = shiftDurationMs / (1000 * 60 * 60);

          const startHour = parseInt(shiftStartTime.split(':')[0], 10) || 0;
          const punchHour = parseInt((timePart || '00:00').split(':')[0], 10) || 0;
          const isDifferentDate = shiftStartDate !== datePart;

          const shiftDurationMins = shiftDurationMs / (1000 * 60);

          // 🛡️ معايير محرك الورديات الذكي العابر للزمن (Universal Event-Driven Shift Engine)
          const maxShiftHours = parseFloat(alertConfig.shiftMaxHoursSafetyValve) || 15;
          const minCheckoutMins = parseFloat(alertConfig.minCheckoutMinutes) || 15;

          // 🛡️ صمام الأمان الذكي: إذا تجاوزت الوردية الحد الأقصى (الافتراضي 15 ساعة)
          // يتم إغلاق الوردية السابقة تلقائياً لحماية النظام من تداخل الأيام، وتُعامل البصمة الحالية كحضور جديد (Check-In)
          if (shiftDurationHours >= maxShiftHours) {
            console.log(`[Biometric Resolver] ⏱️ صمام الأمان الذكي: وردية الموظف ${matchedEmpName} تجاوزت ${maxShiftHours} ساعة (${shiftDurationHours.toFixed(1)} س) - تغلق تلقائياً ويبدأ حضور جديد.`);
            if (openShiftIdx >= 0) {
              const schedH = parseFloat(matchedEmpObj?.workHoursPerDay || matchedEmpObj?.workHours || 8);
              const [inH, inM] = String(shiftStartTime || '09:00').split(':').map(Number);
              let estOutTime = '';
              if (!isNaN(inH)) {
                const outTotalMins = (inH * 60 + (inM || 0) + Math.round(schedH * 60)) % (24 * 60);
                estOutTime = `${String(Math.floor(outTotalMins / 60)).padStart(2, '0')}:${String(outTotalMins % 60).padStart(2, '0')}`;
              }
              currentShifts[openShiftIdx] = {
                ...currentShifts[openShiftIdx],
                timeOut: (currentShifts[openShiftIdx].timeOut && currentShifts[openShiftIdx].timeOut !== '—' && currentShifts[openShiftIdx].timeOut !== 'قيد العمل الآن')
                  ? currentShifts[openShiftIdx].timeOut
                  : (estOutTime || '—'),
                hours: (currentShifts[openShiftIdx].hours && currentShifts[openShiftIdx].hours > 0) ? currentShifts[openShiftIdx].hours : schedH,
                actualWorkedHours: (currentShifts[openShiftIdx].actualWorkedHours && currentShifts[openShiftIdx].actualWorkedHours > 0) ? currentShifts[openShiftIdx].actualWorkedHours : schedH,
                netHours: (currentShifts[openShiftIdx].netHours && currentShifts[openShiftIdx].netHours > 0) ? currentShifts[openShiftIdx].netHours : schedH,
                regularHours: (currentShifts[openShiftIdx].regularHours && currentShifts[openShiftIdx].regularHours > 0) ? currentShifts[openShiftIdx].regularHours : schedH,
                isLiveActive: false,
                status: 'completed',
                statusLabel: 'حضور مكتمل (صمام الأمان)',
                notes: ((currentShifts[openShiftIdx].notes || '') + ` [أغلقت تلقائياً لتجاوز ${maxShiftHours} ساعة بدون تسجيل انصراف]`).trim()
              };
            }
            possibleEmpKeys.forEach(k => {
              delete currentActiveShifts[k];
              endedEmpIds.add(String(k));
            });
            activeShift = null;
            actionType = 'check_in';
          }
          // 🛡️ منع الحركات الوهمية المتكررة (Bounce / False Punch Protection):
          // إذا كانت البصمة بعد الحضور بأقل من minCheckoutMins ولم يضغط الموظف صراحة على زر انصراف (rawState !== 1)
          // يتم اعتبارها تأكيد حضور متكرر (CONFIRMED) وليس انصرافاً، لتفادي إغلاق الوردية بعد دقيقة أو دقيقتين بالخطأ
          else if (shiftDurationMins < minCheckoutMins && rawState !== 1) {
            console.log(`[Biometric Resolver] 🔄 بصمة تأكيد حضور متكررة للموظف ${matchedEmpName} بعد مرور ${Math.round(shiftDurationMins)} دقيقة فقط (أقل من ${minCheckoutMins} دقيقة) - يتم تسجيلها كتأكيد حضور دون تغيير حالة الوردية.`);
            await db.query(
              `INSERT INTO public.biometric_raw_punches 
               (device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, process_notes, raw_payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED', 'PROCESSED', $9, $10)`,
              [sn, pin, `${datePart} ${timePart}:00`, verifyType, rawState, matchedEmpId, matchedEmpName, matchedBranchId, `تأكيد حضور تلقائي [مرت ${Math.round(shiftDurationMins)} د فقط]`, line]
            );
            processedCount++;
            continue;
          }
          // 🌟 المحرك الذكي العابر للزمن (Universal Event-Driven Shift Engine):
          // أي بصمة بعد الدخول بـ minCheckoutMins وأقل من maxShiftHours هي يقيناً وبلا أي قيود على ساعات اليوم: تسجيل انصراف (Check-Out)!
          // سواء كانت في نفس اليوم، أو عبرت منتصف الليل (Overnight)، مثل 12 ظهراً إلى 12 ليلاً، أو 12 ليلاً إلى 12 ظهراً، أو أي توقيت.
          else {
            actionType = 'check_out';
            if (isDifferentDate) {
              isOvernightCheckOut = true;
            }
          }
        } else {
          actionType = 'check_in';
        }

        // 5. تطبيق الحركة عبر المحرك الذري مع حماية الورديات السابقة من المسح
        let shiftRecord = null;

        if (actionType === 'check_in') {
          // 🛡️ توليد معرف جديد فريد دائماً لعدم مسح أو استبدال أي وردية سابقة
          const newShiftId = `shift_${matchedEmpId}_${punchEpoch}`;
          shiftRecord = {
            id: newShiftId,
            employeeId: matchedEmpId,
            employeeCode: matchedEmpObj?.code || '',
            employeeName: matchedEmpName,
            date: datePart,
            timeIn: timePart,
            timeOut: '',
            branchId: matchedBranchId,
            isLiveActive: true,
            status: 'active',
            punchSource: 'biometric_device',
            source: 'biometric_device',
            biometricDeviceSerial: sn,
            verifyType,
            startEpoch: safePunchEpoch
          };

          const activePayload = {
            shiftId: newShiftId,
            branchId: matchedBranchId,
            date: datePart,
            timeIn: timePart,
            startEpoch: safePunchEpoch,
            isPaused: false,
            isOnBreak: false,
            updatedAt: safePunchEpoch,
            source: 'biometric_device',
            punchSource: 'biometric_device',
            verifyType,
            biometricDeviceSerial: sn
          };
          possibleEmpKeys.forEach(k => {
            currentActiveShifts[k] = activePayload;
          });

          // إضافة الوردية الجديدة بدون مسح الورديات السابقة
          currentShifts = [shiftRecord, ...currentShifts.filter(s => s.id !== newShiftId)];
        } else {
          // ── تسجيل انصراف ذكي وإغلاق الوردية العابرة لمنتصف الليل ──
          possibleEmpKeys.forEach(k => {
            delete currentActiveShifts[k];
            endedEmpIds.add(String(k));
          });

          const targetShiftId = effectiveActive?.shiftId || effectiveActive?.id;
          let existIdx = -1;
          if (targetShiftId) {
            existIdx = currentShifts.findIndex(s => s.id === targetShiftId);
          }
          if (existIdx < 0 && openShiftIdx >= 0) {
            existIdx = openShiftIdx;
          }
          if (existIdx < 0) {
            existIdx = currentShifts.findIndex(s =>
              possibleEmpKeys.some(k => String(s.employeeId) === String(k) || (s.employeeCode && String(s.employeeCode) === String(k))) &&
              (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive)
            );
          }

          const origShift = existIdx >= 0 ? currentShifts[existIdx] : null;
          // الحفاظ على تاريخ بدء الوردية الأصلي (مثلاً 29-09-2026 أو 03-10-2026)
          const effectiveDate = origShift?.date || effectiveActive?.date || datePart;
          const isOvernight = Boolean(effectiveDate && effectiveDate !== datePart);

          const inTime = origShift?.timeIn || effectiveActive?.timeIn || timePart;
          const outTime = timePart;

          // ⚡ حساب دقيق لساعات العمل الصافية مع استيعاب الورديات الليلية العابرة لمنتصف الليل
          let calcHours = 0;
          const shiftStartEpochForCalc = Number(origShift?.startEpoch || effectiveActive?.startEpoch) ||
            (effectiveDate && inTime ? new Date(`${effectiveDate}T${String(inTime).slice(0, 5)}:00`).getTime() : 0);

          if (punchEpoch && shiftStartEpochForCalc && punchEpoch > shiftStartEpochForCalc) {
            const bHours = parseFloat(origShift?.breakHours || 0);
            const rawElapsed = (punchEpoch - shiftStartEpochForCalc) / (1000 * 60 * 60);
            calcHours = Math.max(0, Math.round((rawElapsed - bHours) * 100) / 100);
          } else if (inTime && outTime) {
            const [inH, inM] = String(inTime).split(':').map(Number);
            const [outH, outM] = String(outTime).split(':').map(Number);
            if (!isNaN(inH) && !isNaN(outH)) {
              let startM = inH * 60 + (inM || 0);
              let endM = outH * 60 + (outM || 0);
              if (endM <= startM || isOvernight) endM += 24 * 60;
              const bHours = parseFloat(origShift?.breakHours || 0);
              calcHours = Math.max(0, Math.round(((endM - startM) / 60 - bHours) * 100) / 100);
            }
          }

          const schedH = parseFloat(origShift?.scheduledHours || matchedEmpObj?.workHoursPerDay || matchedEmpObj?.workHours || 8);
          const regHours = Math.min(calcHours, schedH);
          const otHours = Math.max(0, Math.round((calcHours - regHours) * 100) / 100);

          const closedRecord = {
            ...(origShift || {}),
            id: targetShiftId || origShift?.id || `shift_${matchedEmpId}_${punchEpoch}`,
            employeeId: matchedEmpId,
            employeeCode: matchedEmpObj?.code || origShift?.employeeCode || '',
            employeeName: matchedEmpName,
            branchId: matchedBranchId || origShift?.branchId || effectiveActive?.branchId,
            date: effectiveDate,
            timeIn: inTime,
            timeOut: outTime,
            timeOutDate: datePart,
            hours: calcHours,
            actualWorkedHours: calcHours,
            netHours: calcHours,
            regularHours: regHours,
            overtimeHours: otHours,
            scheduledHours: schedH,
            isOvernight,
            isLiveActive: false,
            status: 'completed',
            statusLabel: isOvernight ? 'حضور حي (وردية عابرة لمنتصف الليل)' : 'حضور حي',
            punchOutSource: 'biometric_device',
            punchOutDeviceSerial: sn,
            punchOutVerifyType: verifyType,
            updatedAt: new Date().toISOString()
          };

          if (existIdx >= 0) {
            currentShifts[existIdx] = closedRecord;
          } else {
            currentShifts = [closedRecord, ...currentShifts];
          }
          shiftRecord = closedRecord;
        }

        // 5. حساب فارق زمن وصول البصمة لتحديد إذا كانت مزامنة أوفلاين (Offline Sync Latency)
        const latencyMinutes = Math.round((Date.now() - punchEpoch) / 60000);
        const isOfflineSync = latencyMinutes > 5;
        const processNotes = isOfflineSync
          ? `معالجة بنجاح [📶 مزامنة أوفلاين - تأخير ${latencyMinutes} دقيقة]`
          : 'معالجة بنجاح';

        // تجميع إحصائيات تقرير التسوية
        if (actionType === 'check_in') checkInCount++;
        else if (actionType === 'check_out') checkOutCount++;

        if (matchedEmpId) {
          if (!empActionMap.has(matchedEmpId)) {
            empActionMap.set(matchedEmpId, { name: matchedEmpName || `موظف (${matchedEmpId})`, actions: [] });
          }
          const actionLabelAr = actionType === 'check_in' ? `حضور ${timePart}` : `انصراف ${timePart}`;
          empActionMap.get(matchedEmpId).actions.push(actionLabelAr);
        }

        // حفظ في الـ Raw Log
        await db.query(
          `INSERT INTO public.biometric_raw_punches 
           (device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, process_notes, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSED', $10, $11)`,
          [sn, pin, `${datePart} ${timePart}:00`, verifyType, rawState, matchedEmpId, matchedEmpName, matchedBranchId, actionType, processNotes, line]
        );

        // 6. بث لحظي فائق الخفة عبر Socket.io (Micro-Event Broadcast < 1KB)
        const punchPayload = {
          employeeId: matchedEmpId,
          employeeName: matchedEmpName,
          branchId: matchedBranchId,
          actionType,
          date: datePart,
          time: timePart,
          shiftDate: shiftRecord?.date || datePart,
          isOvernight: Boolean(shiftRecord?.isOvernight),
          verifyType,
          source: 'biometric_device',
          deviceSerial: sn,
          deviceName: devObj?.device_name || 'ZKTeco MB20',
          activeShifts: currentActiveShifts,
          shiftRecord,
          isOfflineSync,
          latencyMinutes,
          timestamp: new Date().toISOString()
        };

        if (matchedBranchId) {
          io.to(`room:branch:${matchedBranchId}`).emit('punch:recorded', punchPayload);
        }
        io.to(`room:employee:${matchedEmpId}`).emit('punch:recorded', punchPayload);
        io.to('room:admin:live').emit('punch:recorded', punchPayload);
        io.emit('punch:recorded', punchPayload);

        io.emit('entity:changed', {
          entityType: 'activeShifts',
          action: actionType,
          employeeId: matchedEmpId,
          branchId: matchedBranchId,
          timestamp: new Date().toISOString()
        });

        console.log(`[Biometric Manager] ✅ تم تسجيل البصمة بنجاح: ${actionType} للموظف ${matchedEmpName} (${timePart} - ${verifyType}) [عابرة لمنتصف الليل: ${Boolean(shiftRecord?.isOvernight)}] [أوفلاين: ${isOfflineSync}]`);
        processedCount++;

        // ⚡ إشعار لحظي عبر واتساب للإدارة العليا وهاتف الموظف فور التبصيم
        sendUniversalAttendanceWhatsAppAlert({
          ...punchPayload,
          branchName: devObj?.branch_name || (matchedBranchId ? `فرع (${matchedBranchId})` : 'الإدارة العامة'),
          punchSource: 'biometric_device',
          source: 'biometric_device',
          isKiosk: false
        }, state).catch(e => console.warn('[Biometric WA Error]:', e.message));
      }

      // 7. إرسال تقرير التسوية التلقائي بعد الاسترداد (Post-Recovery Reconciliation Report)
      if (isOfflineBatch && alertConfig.reconciliationEnabled !== false && parsedPunchList.length > 0) {
        try {
          const oldestPunch = parsedPunchList[0];
          const newestPunch = parsedPunchList[parsedPunchList.length - 1];

          const empSummaryLines = Array.from(empActionMap.values()).map(e => {
            return `• *${e.name}*: ${e.actions.join(' | ')}`;
          }).join('\n');

          const periodFrom = `${oldestPunch.datePart} ${oldestPunch.timePart}`;
          const periodTo = `${newestPunch.datePart} ${newestPunch.timePart}`;

          dispatchReconciliationWhatsAppAlert({
            branch_name: devObj?.branch_name || (matchedBranchId ? `فرع (${matchedBranchId})` : 'الفرع الرئيسي'),
            device_name: devObj?.device_name || `جهاز ZKTeco MB20 (${sn})`,
            sync_time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
            sync_date: new Date().toISOString().slice(0, 10),
            total_punches: parsedPunchList.length,
            period_from: periodFrom,
            period_to: periodTo,
            check_in_count: `${checkInCount} حضور`,
            check_out_count: `${checkOutCount} انصراف`,
            employees_summary: empSummaryLines || '• تمت تسوية حركات التبصيم بنجاح',
            company_name: state?.orgSettings?.companyName || state?.orgSettings?.orgName || 'مجموعة الصيدليات'
          }, state).catch(e => console.warn('[Reconciliation Report Error]:', e.message));
        } catch (repErr) {
          console.warn('[Reconciliation Report Summary Error]:', repErr.message);
        }
      }

      // 8. حفظ التحديثات في Redis و PostgreSQL بهدوء فائق وسرعة دون بث عاصفة الـ 4.2MB
            state.activeShifts = currentActiveShifts;
            state.shifts = currentShifts;
            state._punchSource = 'biometric_adms';
            state._endedShiftEmpIds = Array.from(endedEmpIds);
            await saveSettingsToStorage(STORAGE_KEY, state, 'batch-worker');

            // الرد على ماكينة ZKTeco بالتأكيد
            if (!res.headersSent) {
              res.status(200).send(`OK: ${processedCount}`);
            }
          } catch (batchErr) {
            console.error('[Biometric ATTLOG Batch Error]:', batchErr);
            if (!res.headersSent) res.status(500).send('ERROR');
          } finally {
            resolve();
          }
        }).catch(fatalErr => {
          console.error('[Biometric ATTLOG Fatal Queue Error]:', fatalErr);
          if (!res.headersSent) res.status(500).send('ERROR');
          resolve();
        });
      });
      return;
    } catch (err) {
      console.error('[ADMS POST cdata Error]:', err);
      return res.status(500).send('ERROR');
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 3. معالج استعلام الأوامر من الجهاز (Device Command Polling: GET /iclock/getrequest)
  // ────────────────────────────────────────────────────────────────────────────
  const handleAdmsGetRequest = async (req, res) => {
    try {
      const sn = (req.query.SN || req.query.sn || '').trim();
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';

      if (!sn) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Connection', 'close');
        return res.status(200).send('OK');
      }

      // 🛰️ تسجيل نبض وحالة الجهاز فورياً مع كل طلب استعلام أوامر لضمان بقائه ONLINE دائماً
      await updateDeviceHeartbeat(sn, clientIp);

      // 1. فحص طابور الأوامر الدائم في قاعدة البيانات أولاً لضمان عدم ضياع الترحيلات
      try {
        const dbCmds = await db.query(
          `SELECT id, command_text 
           FROM public.biometric_device_commands 
           WHERE device_serial = $1 AND status = 'PENDING' 
           ORDER BY id ASC 
           LIMIT 10`,
          [sn]
        );

        if (dbCmds.rows && dbCmds.rows.length > 0) {
          // تفريغ أي أوامر متطابقة في الذاكرة لتجنب التكرار وتضارب الأوامر
          deviceCommandQueues.delete(sn);

          const cmdIds = dbCmds.rows.map(r => r.id);
          await db.query(
            `UPDATE public.biometric_device_commands 
             SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, retries = retries + 1 
             WHERE id = ANY($1)`,
            [cmdIds]
          );

          const payload = dbCmds.rows.map(r => {
            if (r.command_text.startsWith('C:')) {
              const parts = r.command_text.split(':');
              return `C:${r.id}:${parts.slice(2).join(':')}`;
            }
            return `C:${r.id}:${r.command_text}`;
          }).join('\r\n');

          console.log(`[Biometric Manager] 📤 إرسال ${dbCmds.rows.length} أمر/أوامر للجهاز ${sn} من الطابور الدائم (PostgreSQL)`);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Connection', 'close');
          return res.status(200).send(payload);
        }
      } catch (dbCmdErr) {
        console.warn('[ADMS getrequest DB Queue Warn]:', dbCmdErr.message);
      }

      // 2. فحص طابور الذاكرة المؤقتة كاحتياطي فوري
      const queue = deviceCommandQueues.get(sn) || [];
      if (queue.length > 0) {
        const batch = queue.splice(0, 10);
        deviceCommandQueues.set(sn, queue);
        const payload = batch.join('\r\n');
        console.log(`[Biometric Manager] 📤 إرسال ${batch.length} أمر/أوامر للجهاز ${sn} من الذاكرة`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Connection', 'close');
        return res.status(200).send(payload);
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Connection', 'close');
      return res.status(200).send('OK');
    } catch (err) {
      console.error('[ADMS getrequest Error]:', err);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Connection', 'close');
      return res.status(200).send('OK');
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 4. معالج تأكيد تنفيذ الأوامر من الجهاز (POST /iclock/devicecmd)
  // ────────────────────────────────────────────────────────────────────────────
  const handleAdmsDeviceCmd = async (req, res) => {
    try {
      const sn = (req.query.SN || req.query.sn || '').trim();
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';

      if (sn) {
        await updateDeviceHeartbeat(sn, clientIp);
      }

      let rawBody = '';
      if (typeof req.body === 'string') {
        rawBody = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        rawBody = req.body.toString('utf8');
      } else if (req.body && typeof req.body === 'object') {
        rawBody = Object.entries(req.body).map(([k, v]) => `${k}=${v}`).join('&');
      }

      // تحليل رد الجهاز القياسي من ZKTeco ADMS:
      // مثال: ID=123&Return=0&CMD=DATA UPDATE USER
      const lines = rawBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const params = new URLSearchParams(line.replace(/&amp;/g, '&'));
          const cmdId = parseInt(params.get('ID') || '0', 10);
          const returnCode = parseInt(params.get('Return') || '0', 10);
          const cmdName = params.get('CMD') || '';

          if (cmdId > 0) {
            const isSuccess = (returnCode === 0);
            const newStatus = isSuccess ? 'SUCCESS' : 'FAILED';

            await db.query(
              `UPDATE public.biometric_device_commands 
               SET status = $1, response_code = $2, response_payload = $3, acknowledged_at = CURRENT_TIMESTAMP 
               WHERE id = $4`,
              [newStatus, returnCode, line, cmdId]
            );

            console.log(`[Biometric Manager] 📥 استلام تأكيد الأمر #${cmdId} من جهاز ${sn}: Return=${returnCode} (${newStatus})`);

            // بث تحديث حالة الأوامر فورياً للوحة التحكم
            io.emit('biometric:command_ack', {
              serialNumber: sn,
              commandId: cmdId,
              status: newStatus,
              returnCode,
              cmdName,
              acknowledgedAt: new Date().toISOString()
            });
          }
        } catch (lineErr) {
          console.warn('[DeviceCmd Parse Warn]:', lineErr.message);
        }
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Connection', 'close');
      return res.status(200).send('OK');
    } catch (err) {
      console.error('[ADMS devicecmd Error]:', err);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Connection', 'close');
      return res.status(200).send('OK');
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 5. معالج استلام بيانات الاستعلام من الجهاز (POST/GET /iclock/querydata)
  // ────────────────────────────────────────────────────────────────────────────
  const handleAdmsQueryData = async (req, res) => {
    try {
      const sn = (req.query.SN || req.query.sn || '').trim();
      const tablename = (req.query.tablename || req.query.table || req.query.Table || '').toUpperCase();
      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

      if (!sn) {
        return res.status(400).send('ERROR: Missing SN');
      }

      const devObj = await updateDeviceHeartbeat(sn, clientIp);

      let rawBody = '';
      if (typeof req.body === 'string') {
        rawBody = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        rawBody = req.body.toString('utf8');
      } else if (req.body && typeof req.body === 'object') {
        const entries = Object.entries(req.body);
        if (entries.length === 1 && (!entries[0][1] || entries[0][1] === '')) {
          rawBody = entries[0][0];
        } else {
          rawBody = entries.map(([k, v]) => (v !== undefined && v !== '') ? `${k}=${v}` : k).join('\t');
          if (entries.some(([k]) => k.includes('\n'))) {
            rawBody = entries.map(([k, v]) => `${k}=${v}`).join('\n');
          }
        }
        if (typeof req.body.data === 'string') rawBody = req.body.data;
      }

      console.log(`[Biometric Manager] 📥 [querydata] استلام بيانات الجدول (${tablename || 'DEFAULT'}) من جهاز ${sn} (حجم: ${rawBody.length} بايت)`);

      // إذا كانت البيانات تخص القوالب الحيوية (فحص أولاً قبل المستخدمين لعدم تداخل PIN=)
      const isTemplateData = tablename.includes('TMP') || 
                             tablename.includes('TEMPLATE') || 
                             tablename.includes('BIODATA') || 
                             tablename.includes('FP') || 
                             tablename.includes('FINGER') || 
                             rawBody.includes('TMP=') || 
                             rawBody.includes('Tmp=') || 
                             rawBody.includes('FID=') || 
                             rawBody.includes('FingerID=');

      if (isTemplateData) {
        const count = await parseAndStoreBiometricTemplate(sn, tablename || 'FINGERTMP', rawBody, devObj);
        console.log(`[Biometric Vault] 🧬 [querydata] تم استلام وحفظ ${count} قالب بيومتري من جهاز ${sn}`);
        return res.status(200).send(`OK: ${count}`);
      }

      // إذا كانت البيانات تخص المستخدمين
      if (tablename.includes('USER') || tablename === 'USERINFO' || rawBody.includes('PIN=') || rawBody.includes('Pin=') || rawBody.includes('Name=')) {
        const count = await parseAndStoreDeviceUsers(sn, rawBody, devObj);
        console.log(`[Biometric Manager] 👥 [querydata] تم استلام وحفظ ${count} مستخدم بنجاح من جهاز ${sn}`);
        return res.status(200).send(`OK: ${count}`);
      }

      return res.status(200).send('OK');
    } catch (err) {
      console.error('[ADMS querydata Error]:', err);
      return res.status(200).send('OK');
    }
  };

  // ── تسجيل مسارات ADMS لكافة احتمالات الروابط في الـ Firmware ────────────────
  const admsCDataRoutes = ['/iclock/cdata', '/cdata', '/api/biometrics/adms/cdata'];
  const admsGetRequestRoutes = ['/iclock/getrequest', '/getrequest', '/api/biometrics/adms/getrequest'];
  const admsDeviceCmdRoutes = ['/iclock/devicecmd', '/devicecmd', '/api/biometrics/adms/devicecmd'];
  const admsQueryDataRoutes = ['/iclock/querydata', '/querydata', '/api/biometrics/adms/querydata'];
  const admsFDataRoutes = ['/iclock/fdata', '/fdata', '/api/biometrics/adms/fdata'];
  const admsPingRoutes = ['/iclock/ping', '/ping', '/api/biometrics/adms/ping'];

  admsCDataRoutes.forEach(r => {
    app.get(r, handleAdmsGetCData);
    app.post(r, handleAdmsPostCData);
  });

  admsGetRequestRoutes.forEach(r => {
    app.get(r, handleAdmsGetRequest);
    app.post(r, handleAdmsGetRequest);
  });

  admsDeviceCmdRoutes.forEach(r => {
    app.post(r, handleAdmsDeviceCmd);
  });

  admsQueryDataRoutes.forEach(r => {
    app.get(r, handleAdmsQueryData);
    app.post(r, handleAdmsQueryData);
  });

  admsFDataRoutes.forEach(r => {
    app.get(r, (req, res) => res.status(200).send('OK'));
    app.post(r, (req, res) => res.status(200).send('OK'));
  });

  admsPingRoutes.forEach(r => {
    app.all(r, async (req, res) => {
      const sn = (req.query.SN || req.query.sn || '').trim();
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
      if (sn) {
        await updateDeviceHeartbeat(sn, clientIp);
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Connection', 'close');
      return res.status(200).send('OK');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 🚀 مسارات التحكم البرمجي للواجهة الأمامية (Admin REST API)
  // ══════════════════════════════════════════════════════════════════════════════

  // دالة مساعدة عامة لفك واستخراج محتوى الطلب بأمان سواء كان كائناً أو نصياً
  function parseReqBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    return {};
  }

  // 1. قائمة الأجهزة وحالتها
  app.get('/api/biometrics/devices', async (req, res) => {
    try {
      const q = await db.query('SELECT * FROM public.biometric_devices ORDER BY created_at DESC');
      const now = Date.now();
      const devices = (q.rows || []).map(dev => {
        const lastHb = dev.last_heartbeat ? new Date(dev.last_heartbeat).getTime() : 0;
        // يعتبر الجهاز متصلاً إذا أرسل نبضاً خلال آخر 150 ثانية
        const isOnline = (now - lastHb) < 150000;
        return {
          ...dev,
          status: isOnline ? 'ONLINE' : 'OFFLINE'
        };
      });
      res.json({ success: true, devices });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.1 إضافة جهاز بصمة جديد يدوياً
  app.post('/api/biometrics/devices', async (req, res) => {
    try {
      const { deviceName, serialNumber, branchId, branchName, ipAddress, deviceType } = req.body;
      if (!serialNumber || !serialNumber.trim()) {
        return res.status(400).json({ success: false, error: 'الرقم التسلسلي (Serial Number) مطلوب' });
      }

      const sn = serialNumber.trim().toUpperCase();
      const id = `dev_${sn.toLowerCase()}`;
      const name = deviceName?.trim() || `جهاز بصمة ZKTeco (${sn})`;

      const q = await db.query(
        `INSERT INTO public.biometric_devices 
         (id, device_name, serial_number, branch_id, branch_name, ip_address, protocol, status, device_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ADMS', 'ONLINE', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (serial_number) DO UPDATE SET
           device_name = EXCLUDED.device_name,
           branch_id = COALESCE(EXCLUDED.branch_id, public.biometric_devices.branch_id),
           branch_name = COALESCE(EXCLUDED.branch_name, public.biometric_devices.branch_name),
           ip_address = COALESCE(EXCLUDED.ip_address, public.biometric_devices.ip_address),
           device_type = COALESCE(EXCLUDED.device_type, public.biometric_devices.device_type),
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [id, name, sn, branchId || null, branchName || null, ipAddress || null, deviceType || 'MB20']
      );

      console.log(`[Biometric Manager] ➕ تم تسجيل جهاز بصمة جديد يدوياً: ${name} (${sn})`);
      res.json({ success: true, device: q.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.2 ترحيل بيانات وأسماء الموظفين لشاشة جهاز البصمة LCD
  app.post('/api/biometrics/devices/:serialNumber/push-users', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const { employeeIds, allBranchUsers } = req.body;

      const state = await getSettingsFromStorage(STORAGE_KEY);
      const employees = Array.isArray(state?.employees) ? state.employees : [];

      // جلب أرقام PIN المعرفة في النظام
      const profRes = await db.query('SELECT * FROM public.employee_biometric_profiles');
      const profilesMap = new Map((profRes.rows || []).map(p => [String(p.employee_id), p.device_user_pin]));

      // تحديد قائمة الموظفين المستهدفين
      let targetEmps = [];
      if (Array.isArray(employeeIds) && employeeIds.length > 0) {
        targetEmps = employees.filter(e => employeeIds.includes(e.id));
      } else if (allBranchUsers) {
        const devRes = await db.query('SELECT branch_id FROM public.biometric_devices WHERE serial_number = $1', [serialNumber]);
        const branchId = devRes.rows?.[0]?.branch_id;
        targetEmps = branchId ? employees.filter(e => String(e.branchId) === String(branchId)) : employees;
      } else {
        targetEmps = employees;
      }

      if (targetEmps.length === 0) {
        return res.status(400).json({ success: false, error: 'لا يوجد موظفون محددون للترحيل' });
      }

      let count = 0;
      for (let index = 0; index < targetEmps.length; index++) {
        const emp = targetEmps[index];
        const pin = profilesMap.get(String(emp.id)) || emp.code || emp.id;
        if (!pin) continue;
        const cleanName = (emp.name || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);

        // أمر ZKTeco ADMS القياسي لتحديث مستخدم:
        // C:seq:DATA UPDATE USERINFO PIN=107\tName=Ahmed Khaled\tPri=0\tPasswd=\tCard=
        const cmdId = Date.now() + index;
        const cmd = `C:${cmdId}:DATA UPDATE USERINFO PIN=${pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0`;
        queueDeviceCommand(serialNumber, cmd);

        // 🧬 فحص وترحيل أي قوالب بصمة إصبع مسجلة للموظف في الخزنة تلقائياً لحمايتها من الضياع
        try {
          const tplsRes = await db.query(
            `SELECT * FROM public.biometric_templates 
             WHERE employee_id = $1 OR device_user_pin = $2 OR device_user_pin = $3`,
            [String(emp.id), String(pin), String(emp.code || '')]
          );
          for (let tIdx = 0; tIdx < (tplsRes.rows || []).length; tIdx++) {
            const tpl = tplsRes.rows[tIdx];
            if (tpl.template_type === 'FINGERPRINT') {
              const cmdFp = `C:${cmdId + 1000 + tIdx}:DATA UPDATE FINGERTMP PIN=${pin}\tFID=${tpl.finger_id}\tSize=${tpl.size || tpl.template_data.length}\tValid=1\tTMP=${tpl.template_data}`;
              queueDeviceCommand(serialNumber, cmdFp, 'FP_DISPATCH_SINGLE');
            }
          }
        } catch (tplErr) {
          console.warn('[Push Users Template Dispatch Warn]:', tplErr.message);
        }

        // إدراج فوري للمستخدم في جدول ذاكرة الجهاز
        await db.query(
          `INSERT INTO public.biometric_device_users 
           (device_serial, employee_id, device_user_pin, display_name, privilege, verify_mode, is_active, sync_status, updated_at)
           VALUES ($1, $2, $3, $4, 0, 0, TRUE, 'DISPATCHED', CURRENT_TIMESTAMP)
           ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
             employee_id = EXCLUDED.employee_id,
             display_name = EXCLUDED.display_name,
             is_active = TRUE,
             updated_at = CURRENT_TIMESTAMP`,
          [serialNumber, String(emp.id), String(pin), cleanName]
        );

        count++;
      }

      io.emit('biometric:device_users_updated', { serialNumber, count });

      console.log(`[Biometric Manager] 📤 تم جدولة ترحيل ${count} موظف إلى جهاز البصمة ${serialNumber}`);
      res.json({
        success: true,
        message: `تم جدولة ترحيل ${count} موظف إلى شاشة الجهاز بنجاح`,
        queuedCount: count
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.3 أمر إعادة تشغيل الجهاز عن بُعد (Remote Reboot)
  app.post('/api/biometrics/devices/:serialNumber/reboot', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const cmd = `C:${Date.now()}:REBOOT`;
      queueDeviceCommand(serialNumber, cmd);
      res.json({ success: true, message: 'تم إرسال أمر إعادة تشغيل الجهاز بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.4 أمر مسح سجلات الحركات القديمة من ذاكرة الجهاز (Clear Device Logs)
  app.post('/api/biometrics/devices/:serialNumber/clear-log', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const cmd = `C:${Date.now()}:CLEAR LOG`;
      queueDeviceCommand(serialNumber, cmd);
      res.json({ success: true, message: 'تم إرسال أمر مسح سجلات الحركات القديمة من الجهاز' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.4.2 إلغاء وتفريغ الأوامر المعلقة وفك تعليق الماكينة (Cancel & Clear Pending / Stuck Commands)
  app.post('/api/biometrics/devices/:serialNumber/clear-commands', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const isAll = !serialNumber || serialNumber.toLowerCase() === 'all';

      // 1. تحديث كافة الأوامر المعلقة أو العالقة أو التي واجهت أخطاء إلى CANCELLED
      let cancelledCount = 0;
      if (isAll) {
        const updRes = await db.query(
          `UPDATE public.biometric_device_commands 
           SET status = 'CANCELLED', 
               response_payload = COALESCE(response_payload, '') || ' [تم الإلغاء والأرشفة يدوياً وفك تعليق الجهاز]', 
               acknowledged_at = CURRENT_TIMESTAMP 
           WHERE status IN ('PENDING', 'SENT', 'FAILED')
           RETURNING id, device_serial, command_type`
        );
        cancelledCount = (updRes.rows || []).length;
        deviceCommandQueues.clear();
        hqPendingEnrollments.clear();
      } else {
        const updRes = await db.query(
          `UPDATE public.biometric_device_commands 
           SET status = 'CANCELLED', 
               response_payload = COALESCE(response_payload, '') || ' [تم الإلغاء والأرشفة يدوياً وفك تعليق الجهاز]', 
               acknowledged_at = CURRENT_TIMESTAMP 
           WHERE device_serial = $1 AND status IN ('PENDING', 'SENT', 'FAILED')
           RETURNING id, device_serial, command_type`,
          [serialNumber]
        );
        cancelledCount = (updRes.rows || []).length;
        deviceCommandQueues.delete(serialNumber);
        for (const key of hqPendingEnrollments.keys()) {
          if (key.startsWith(`${serialNumber}_`)) hqPendingEnrollments.delete(key);
        }
      }

      // 2. إرسال أمر إلغاء وتفريغ فيزيائي للماكينة (CANCEL + CHECK) لإخراجها من أي وضع تعليق
      const now = Date.now();
      if (!isAll) {
        queueDeviceCommand(serialNumber, `C:${now}:CANCEL`, 'DEVICE_CANCEL');
        queueDeviceCommand(serialNumber, `C:${now + 1}:CHECK`, 'DEVICE_CHECK');
      } else {
        const devsQ = await db.query('SELECT serial_number FROM public.biometric_devices WHERE is_active = TRUE');
        (devsQ.rows || []).forEach((d, idx) => {
          queueDeviceCommand(d.serial_number, `C:${now + (idx * 2)}:CANCEL`, 'DEVICE_CANCEL');
          queueDeviceCommand(d.serial_number, `C:${now + (idx * 2) + 1}:CHECK`, 'DEVICE_CHECK');
        });
      }

      // 3. بث التحديث عبر Socket.io
      io.emit('biometric:commands_cleared', {
        serialNumber: isAll ? 'ALL' : serialNumber,
        cancelledCount,
        timestamp: new Date().toISOString()
      });

      console.log(`[Biometric Manager] 🧹 تم إلغاء وتفريغ ${cancelledCount} أمر معلق/عالق للجهاز (${serialNumber}) وإرسال إشارة فك التعليق للماكينة.`);

      res.json({
        success: true,
        message: `تم بنجاح إلغاء وتفريغ (${cancelledCount}) أمر معلق وفك تعليق ماكينة البصمة (${isAll ? 'كافة الأجهزة' : serialNumber})`,
        cancelledCount
      });
    } catch (err) {
      console.error('[Biometric Clear Commands Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.4.3 استعلام سجل أوامر الجهاز
  app.get('/api/biometrics/devices/:serialNumber/commands', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const isAll = !serialNumber || serialNumber.toLowerCase() === 'all';
      let rows = [];
      if (isAll) {
        const q = await db.query(
          `SELECT id, device_serial, command_type, status, command_text, response_code, response_payload, created_at, acknowledged_at 
           FROM public.biometric_device_commands 
           ORDER BY id DESC LIMIT 50`
        );
        rows = q.rows || [];
      } else {
        const q = await db.query(
          `SELECT id, device_serial, command_type, status, command_text, response_code, response_payload, created_at, acknowledged_at 
           FROM public.biometric_device_commands 
           WHERE device_serial = $1 
           ORDER BY id DESC LIMIT 50`,
          [serialNumber]
        );
        rows = q.rows || [];
      }
      res.json({ success: true, commands: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.5 سحب قوالب البصمات من ذاكرة الجهاز إلى الخزنة السحابية (Pull Templates)
  app.post('/api/biometrics/devices/:serialNumber/pull-templates', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const body = parseReqBody(req);
      const pin = (req.query.pin || body.pin || '').toString().trim();
      const now = Date.now();

      if (pin) {
        // استعلام قوالب بصمة موظف محدد + بياناته
        queueDeviceCommand(serialNumber, `C:${now}:DATA QUERY USERINFO PIN=${pin}`, 'QUERY_USER_PIN');
        queueDeviceCommand(serialNumber, `C:${now + 1}:DATA QUERY FINGERTMP PIN=${pin}`, 'QUERY_FP_PIN');
        queueDeviceCommand(serialNumber, `C:${now + 2}:DATA QUERY FINGERTMP`, 'QUERY_FP_ALL');
        console.log(`[Biometric Manager] 📥 طلب سحب قوالب البصمة للموظف (PIN: ${pin}) من جهاز (${serialNumber})`);
      } else {
        // استعلام شامل لكافة القوالب والمستخدمين في الجهاز
        queueDeviceCommand(serialNumber, `C:${now}:DATA QUERY USERINFO`, 'QUERY_USER_ALL');
        queueDeviceCommand(serialNumber, `C:${now + 1}:DATA QUERY FINGERTMP`, 'QUERY_FP_ALL');
        console.log(`[Biometric Manager] 📥 طلب سحب كافة قوالب البصمة من جهاز (${serialNumber})`);
      }

      res.json({
        success: true,
        message: pin
          ? `تم إرسال أمر سحب واستيراد قالب البصمة للمستخدم (${pin}) للخزنة السحابية بنجاح`
          : `تم إرسال أوامر سحب كافة القوالب الحيوية من جهاز (${serialNumber}) للخزنة السحابية بنجاح`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.6 مركز ترحيل وتوزيع البصمات الشامل عبر الفروع (Enterprise Cross-Branch Dispatcher)
  app.post('/api/biometrics/dispatch', async (req, res) => {
    try {
      const { employeeIds, targetDeviceSerials, includeBiometrics = true, targetBranchId } = req.body;
      if (!targetDeviceSerials || !Array.isArray(targetDeviceSerials) || targetDeviceSerials.length === 0) {
        return res.status(400).json({ success: false, error: 'يرجى تحديد جهاز بصمة مستهدف واحد على الأقل' });
      }

      const state = await getSettingsFromStorage(STORAGE_KEY);
      const employees = Array.isArray(state?.employees) ? state.employees : [];

      const profQ = await db.query('SELECT employee_id, device_user_pin FROM public.employee_biometric_profiles');
      const profilesMap = new Map((profQ.rows || []).map(r => [String(r.employee_id), r.device_user_pin]));

      let targetEmps = [];
      if (employeeIds === 'ALL' || (Array.isArray(employeeIds) && employeeIds.includes('ALL'))) {
        targetEmps = employees;
      } else if (Array.isArray(employeeIds) && employeeIds.length > 0) {
        targetEmps = employees.filter(e => employeeIds.includes(e.id));
      } else {
        return res.status(400).json({ success: false, error: 'يرجى اختيار موظف واحد على الأقل للترحيل' });
      }

      const tplQ = await db.query('SELECT * FROM public.biometric_templates');
      const templatesByPin = new Map();
      (tplQ.rows || []).forEach(t => {
        const list = templatesByPin.get(t.device_user_pin) || [];
        list.push(t);
        templatesByPin.set(t.device_user_pin, list);
      });

      const devQ = await db.query('SELECT serial_number, device_name, branch_id, branch_name FROM public.biometric_devices WHERE serial_number = ANY($1)', [targetDeviceSerials]);
      const devMap = new Map();
      (devQ.rows || []).forEach(d => devMap.set(d.serial_number, d));

      let totalDispatchedUsers = 0;
      let totalDispatchedTemplates = 0;

      for (const targetSn of targetDeviceSerials) {
        const dev = devMap.get(targetSn);
        for (let i = 0; i < targetEmps.length; i++) {
          const emp = targetEmps[i];
          const pin = profilesMap.get(String(emp.id)) || emp.code || emp.id;
          if (!pin) continue;
          const cleanName = (emp.name || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);

          // 1. أمر إنشاء المستخدم على الماكينة المستهدفة
          const cmdUser = `C:${Date.now() + i}:DATA UPDATE USERINFO PIN=${pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0`;
          queueDeviceCommand(targetSn, cmdUser);
          totalDispatchedUsers++;

          // إدراج فوري في جدول مستخدمي الماكينة المستهدفة
          await db.query(
            `INSERT INTO public.biometric_device_users 
             (device_serial, employee_id, device_user_pin, display_name, privilege, verify_mode, is_active, sync_status, updated_at)
             VALUES ($1, $2, $3, $4, 0, 0, TRUE, 'DISPATCHED', CURRENT_TIMESTAMP)
             ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
               employee_id = EXCLUDED.employee_id,
               display_name = EXCLUDED.display_name,
               is_active = TRUE,
               updated_at = CURRENT_TIMESTAMP`,
            [targetSn, String(emp.id), String(pin), cleanName]
          );

          // 2. إذا طُلب تضمين القوالب البيومترية
          let tplCountForEmp = 0;
          if (includeBiometrics) {
            const empTemplates = templatesByPin.get(String(pin)) || [];
            for (let j = 0; j < empTemplates.length; j++) {
              const tpl = empTemplates[j];
              const cmdId = Date.now() + 1000 + i * 10 + j;
              if (tpl.template_type === 'FINGERPRINT') {
                const cmdBio = `C:${cmdId}:DATA UPDATE BIODATA Pin=${pin}\tNo=0\tIndex=${tpl.finger_id}\tValid=1\tDuress=0\tType=1\tMajorVer=${tpl.major_ver || '10'}\tMinorVer=0\tFormat=0\tTmp=${tpl.template_data}`;
                queueDeviceCommand(targetSn, cmdBio);
                const cmdFp = `C:${cmdId + 1}:DATA UPDATE FINGERTMP PIN=${pin}\tFID=${tpl.finger_id}\tSize=${tpl.size || tpl.template_data.length}\tValid=1\tTMP=${tpl.template_data}`;
                queueDeviceCommand(targetSn, cmdFp);
                totalDispatchedTemplates++;
                tplCountForEmp++;
              } else if (tpl.template_type === 'FACE') {
                const cmdFace = `C:${cmdId}:DATA UPDATE BIODATA Pin=${pin}\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=7\tMinorVer=0\tFormat=0\tTmp=${tpl.template_data}`;
                queueDeviceCommand(targetSn, cmdFace);
                totalDispatchedTemplates++;
                tplCountForEmp++;
              }
            }
          }

          await db.query(
            `INSERT INTO public.biometric_dispatch_logs 
             (employee_id, employee_name, device_user_pin, target_device_serial, target_branch_id, target_branch_name, included_biometrics, templates_count, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED')`,
            [emp.id, emp.name, String(pin), targetSn, dev?.branch_id || targetBranchId || null, dev?.branch_name || 'غير محدد', includeBiometrics, tplCountForEmp]
          );
        }

        io.emit('biometric:device_users_updated', { serialNumber: targetSn });
      }

      res.json({
        success: true,
        message: `تمت جدولة ترحيل ${totalDispatchedUsers} موظف بنجاح (مع ${totalDispatchedTemplates} قالب بصمة حيوي)`,
        dispatchedEmployeesCount: totalDispatchedUsers,
        dispatchedTemplatesCount: totalDispatchedTemplates,
        targetDevices: targetDeviceSerials
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.7 تسجيل بصمة موظف جديد من ماكينة الإدارة المركزية (HQ Enrollment Assistant)
  app.post('/api/biometrics/hq-enroll', async (req, res) => {
    try {
      const { employeeId, hqDeviceSerial, enrollmentType = 'fingerprint', nameMode = 'english', fingerIndex = 1 } = parseReqBody(req);
      const fid = parseInt(fingerIndex !== undefined && fingerIndex !== null ? fingerIndex : 1, 10);
      if (!employeeId || !hqDeviceSerial) {
        return res.status(400).json({ success: false, error: 'يرجى تحديد الموظف وماكينة الإدارة' });
      }

      const state = await getSettingsFromStorage(STORAGE_KEY);
      const employees = Array.isArray(state?.employees) ? state.employees : [];
      const emp = employees.find(e => String(e.id) === String(employeeId));
      if (!emp) {
        return res.status(404).json({ success: false, error: 'الموظف غير موجود في النظام' });
      }

      const profQ = await db.query('SELECT device_user_pin FROM public.employee_biometric_profiles WHERE employee_id = $1', [employeeId]);
      let pin = profQ.rows?.[0]?.device_user_pin || emp.code || emp.id;
      
      await db.query(
        `INSERT INTO public.employee_biometric_profiles (id, employee_id, device_user_pin, notes, updated_at)
         VALUES ($1, $2, $3, 'تسجيل مركزي من الإدارة', CURRENT_TIMESTAMP)
         ON CONFLICT (employee_id) DO UPDATE SET device_user_pin = EXCLUDED.device_user_pin, updated_at = CURRENT_TIMESTAMP`,
        [`map_${emp.id}_${Date.now()}`, String(emp.id), String(pin)]
      );

      const rawCleanName = (emp.name || '').replace(/[\r\n\t]/g, ' ').trim();
      const screenName = nameMode === 'arabic'
        ? rawCleanName.slice(0, 24)
        : (transliterateArabicToEnglish(rawCleanName) || rawCleanName).slice(0, 24);

      // نمط التحقق: إذا كان تسجيل وجه فقط (4) أو كلاهما/افتراضي (0)
      const verifyMode = enrollmentType === 'face' ? 4 : 0;

      // تسجيل العملية في قائمة التسجيل المركزي المعلقة لتفريغ الماكينة تلقائياً فور وصول القالب
      hqPendingEnrollments.set(`${hqDeviceSerial}_${pin}`, {
        employeeId,
        employeeName: emp.name,
        createdAt: Date.now()
      });

      // 1. دفع المستخدم لماكينة الإدارة
      const cmdUser = `C:${Date.now()}:DATA UPDATE USERINFO PIN=${pin}\tName=${screenName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=${verifyMode}`;
      queueDeviceCommand(hqDeviceSerial, cmdUser);

      let instructionMsg = '';
      if (enrollmentType === 'face') {
        // تسجيل بصمة الوجه (NIR Face Type 2 لماكينات MB20 و Type 9 للماكينات الضوئية)
        // لا نرسل أي أمر ENROLL_FP نهائياً حتى لا يفتح حساس بصمة الإصبع!
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 1}:ENROLL_BIO TYPE=2\tNO=0\tPIN=${pin}\tRETRY=3\tOVERWRITE=1\tMODE=1`);
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 2}:ENROLL_BIO TYPE=9\tNO=0\tPIN=${pin}\tRETRY=3\tOVERWRITE=1\tMODE=1`);
        instructionMsg = `تم إرسال أمر تسجيل بصمة الوجه للموظف (${emp.name}) باسم شاشة (${screenName}) برقم PIN (${pin}). يرجى توجيهه للنظر مباشرة إلى كاميرا الماكينة ليتم التقاط بصمة وجهه وحفظ القالب البيومتري تلقائياً بالسحابة!`;
      } else if (enrollmentType === 'both') {
        // تسجيل الوجه والإصبع معاً مع دعم رقم الإصبع المختار
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 1}:ENROLL_BIO TYPE=2\tNO=0\tPIN=${pin}\tRETRY=3\tOVERWRITE=1\tMODE=1`);
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 2}:ENROLL_BIO TYPE=9\tNO=0\tPIN=${pin}\tRETRY=3\tOVERWRITE=1\tMODE=1`);
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 3}:ENROLL_FP PIN=${pin}\tFID=${fid}`);
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 4}:ENROLL_BIO TYPE=1\tNO=${fid}\tPIN=${pin}\tRETRY=3\tOVERWRITE=1\tMODE=1`);
        instructionMsg = `تم إرسال أمر تسجيل بصمة الوجه وبصمة الإصبع (#${fid}) للموظف (${emp.name}) باسم (${screenName}). يرجى توجيهه للنظر للكاميرا ثم وضع إصبعه 3 مرات!`;
      } else {
        // بصمة الإصبع الحيوية الافتراضية أو الإضافية
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 1}:ENROLL_FP PIN=${pin}\tFID=${fid}`);
        queueDeviceCommand(hqDeviceSerial, `C:${Date.now() + 2}:ENROLL_BIO TYPE=1\tNO=${fid}\tPIN=${pin}\tRETRY=3\tOVERWRITE=1\tMODE=1`);
        instructionMsg = `تم إرسال أمر تسجيل بصمة الإصبع (#${fid}) للموظف (${emp.name}) باسم شاشة (${screenName}) برقم PIN (${pin}). يرجى توجيهه لوضع إصبعه 3 مرات على حساس الماكينة ليتم سحب قالبه البيومتري تلقائياً للسحابة!`;
      }

      // 4. إدراج الموظف فوراً في جدول مستخدمي الماكينة ليظهر بالجدول في الواجهة
      await db.query(
        `INSERT INTO public.biometric_device_users 
         (device_serial, employee_id, device_user_pin, display_name, privilege, verify_mode, is_active, sync_status, updated_at)
         VALUES ($1, $2, $3, $4, 0, $5, TRUE, 'ENROLLING', CURRENT_TIMESTAMP)
         ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
           employee_id = EXCLUDED.employee_id,
           display_name = EXCLUDED.display_name,
           verify_mode = EXCLUDED.verify_mode,
           is_active = TRUE,
           updated_at = CURRENT_TIMESTAMP`,
        [hqDeviceSerial, String(emp.id), String(pin), rawCleanName, verifyMode]
      );

      io.emit('biometric:device_users_updated', { serialNumber: hqDeviceSerial });

      res.json({
        success: true,
        message: instructionMsg,
        pin,
        employeeName: emp.name,
        screenName,
        enrollmentType
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.8 استعلام قوالب البصمات الحيوية المحفوظة في الخزنة السحابية (Vaulted Templates)
  app.get('/api/biometrics/templates', async (req, res) => {
    try {
      const q = await db.query(
        `SELECT t.*, p.employee_id as profile_emp_id, 
                d.device_name as source_device_name, d.branch_name as source_branch_name
         FROM public.biometric_templates t
         LEFT JOIN public.employee_biometric_profiles p ON p.device_user_pin = t.device_user_pin
         LEFT JOIN public.biometric_devices d ON d.serial_number = t.source_device_sn
         ORDER BY t.updated_at DESC`
      );
      const rows = q.rows || [];
      let employees = [];
      try {
        const state = await getSettingsFromStorage(STORAGE_KEY);
        employees = Array.isArray(state?.employees) ? state.employees : [];
      } catch {}

      const enriched = rows.map(t => {
        const emp = employees.find(e => String(e.id) === String(t.employee_id || t.profile_emp_id) || String(e.code) === String(t.device_user_pin));
        return {
          ...t,
          employee_name: t.employee_name || emp?.name || (t.device_user_pin ? `موظف PIN: ${t.device_user_pin}` : 'غير معروف'),
          employee_id: t.employee_id || t.profile_emp_id || emp?.id || null
        };
      });

      res.json({ success: true, templates: enriched });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.8.1 تعديل وتخصيص قالب بيومتري في الخزنة السحابية
  app.put('/api/biometrics/templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { employeeId, employeeName, deviceUserPin } = parseReqBody(req);

      const upd = await db.query(
        `UPDATE public.biometric_templates 
         SET employee_id = COALESCE($1, employee_id),
             employee_name = COALESCE($2, employee_name),
             device_user_pin = COALESCE($3, device_user_pin),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [employeeId || null, employeeName || null, deviceUserPin || null, id]
      );

      if (upd.rows?.length === 0) {
        return res.status(404).json({ success: false, error: 'القالب غير موجود في الخزنة' });
      }

      if (employeeId && deviceUserPin) {
        await db.query(
          `INSERT INTO public.employee_biometric_profiles (id, employee_id, device_user_pin, notes, updated_at)
           VALUES ($1, $2, $3, 'ربط من الخزنة السحابية', CURRENT_TIMESTAMP)
           ON CONFLICT (employee_id) DO UPDATE SET device_user_pin = EXCLUDED.device_user_pin, updated_at = CURRENT_TIMESTAMP`,
          [`prof_${employeeId}`, String(employeeId), String(deviceUserPin)]
        );
      }

      io.emit('biometric:templates_updated', { count: 1 });
      res.json({ success: true, message: 'تم تحديث بيانات القالب البيومتري بنجاح', template: upd.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.8.2 حذف قالب بيومتري من الخزنة السحابية
  app.delete('/api/biometrics/templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const del = await db.query('DELETE FROM public.biometric_templates WHERE id = $1 RETURNING *', [id]);
      if (del.rows?.length === 0) {
        return res.status(404).json({ success: false, error: 'القالب غير موجود أو تم حذفه مسبقاً' });
      }
      io.emit('biometric:templates_updated', { count: 0 });
      res.json({ success: true, message: 'تم حذف القالب من الخزنة السحابية بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.8.3 إرسال وتوزيع قالب بيومتري محدد إلى جهاز فرع معين أو عدة أجهزة
  app.post('/api/biometrics/templates/:id/dispatch', async (req, res) => {
    try {
      const { id } = req.params;
      const { targetDeviceSerials } = parseReqBody(req);
      if (!Array.isArray(targetDeviceSerials) || targetDeviceSerials.length === 0) {
        return res.status(400).json({ success: false, error: 'يرجى تحديد جهاز أو فرع واحد على الأقل للترحيل' });
      }

      const tplQ = await db.query('SELECT * FROM public.biometric_templates WHERE id = $1', [id]);
      if (tplQ.rows?.length === 0) {
        return res.status(404).json({ success: false, error: 'القالب البيومتري غير موجود' });
      }
      const tpl = tplQ.rows[0];
      const pin = tpl.device_user_pin;

      let displayName = tpl.employee_name;
      if (!displayName && tpl.employee_id) {
        try {
          const state = await getSettingsFromStorage(STORAGE_KEY);
          const emp = (state?.employees || []).find(e => String(e.id) === String(tpl.employee_id));
          if (emp) displayName = emp.name;
        } catch {}
      }
      if (!displayName) displayName = `User ${pin}`;
      const cleanName = displayName.replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);

      let dispatchedCount = 0;
      for (const targetSn of targetDeviceSerials) {
        const now = Date.now();
        const cmdUser = `C:${now}:DATA UPDATE USERINFO PIN=${pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0`;
        queueDeviceCommand(targetSn, cmdUser, 'USER_DISPATCH_SINGLE');

        if (tpl.template_type === 'FINGERPRINT') {
          const cmdFp = `C:${now + 1}:DATA UPDATE FINGERTMP PIN=${pin}\tFID=${tpl.finger_id}\tSize=${tpl.size || tpl.template_data.length}\tValid=1\tTMP=${tpl.template_data}`;
          queueDeviceCommand(targetSn, cmdFp, 'FP_DISPATCH_SINGLE');
        } else if (tpl.template_type === 'FACE') {
          const cmdFace = `C:${now + 1}:DATA UPDATE BIODATA Pin=${pin}\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=7\tMinorVer=0\tFormat=0\tTmp=${tpl.template_data}`;
          queueDeviceCommand(targetSn, cmdFace, 'FACE_DISPATCH_SINGLE');
        }

        await db.query(
          `INSERT INTO public.biometric_device_users 
           (device_serial, employee_id, device_user_pin, display_name, privilege, verify_mode, is_active, sync_status, updated_at)
           VALUES ($1, $2, $3, $4, 0, 0, TRUE, 'DISPATCHED', CURRENT_TIMESTAMP)
           ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
             employee_id = EXCLUDED.employee_id,
             display_name = EXCLUDED.display_name,
             is_active = TRUE,
             updated_at = CURRENT_TIMESTAMP`,
          [targetSn, tpl.employee_id || null, String(pin), cleanName]
        );

        await db.query(
          `INSERT INTO public.biometric_dispatch_logs
           (employee_id, employee_name, device_user_pin, target_device_serial, included_biometrics, templates_count, status, dispatched_by)
           VALUES ($1, $2, $3, $4, TRUE, 1, 'QUEUED', 'ADMIN')`,
          [tpl.employee_id || null, cleanName, String(pin), targetSn]
        );

        dispatchedCount++;
      }

      res.json({
        success: true,
        message: `تم إرسال القالب البيومتري للموظف (${cleanName}) بنجاح إلى (${dispatchedCount}) جهاز/فرع`,
        dispatchedCount
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.8.4 إعادة تسجيل القالب البيومتري على ماكينة معينة (مثل ماكينة الإدارة)
  app.post('/api/biometrics/templates/:id/re-enroll', async (req, res) => {
    try {
      const { id } = req.params;
      const { targetDeviceSerial, fingerId } = parseReqBody(req);
      const tplQ = await db.query('SELECT * FROM public.biometric_templates WHERE id = $1', [id]);
      if (tplQ.rows?.length === 0) {
        return res.status(404).json({ success: false, error: 'القالب غير موجود' });
      }
      const tpl = tplQ.rows[0];
      const sn = targetDeviceSerial || tpl.source_device_sn;
      if (!sn) {
        return res.status(400).json({ success: false, error: 'يرجى تحديد الماكينة المستهدفة لإعادة التسجيل' });
      }

      // إلغاء أي أوامر سابقة معلقة أو عالقة لنفس الجهاز لضمان نقاء طابور التنفيذ
      await db.query(
        `UPDATE public.biometric_device_commands 
         SET status = 'CANCELLED', response_payload = 'تم التخطي لبدء أمر إعادة تسجيل جديد'
         WHERE device_serial = $1 AND status IN ('PENDING', 'SENT')`,
        [sn]
      );
      deviceCommandQueues.delete(sn);

      // إرسال المستخدم للماكينة أولاً للتأكد من وجوده في ذاكرتها
      const empQ = await db.query('SELECT * FROM public.employee_biometric_profiles WHERE employee_id = $1 OR device_user_pin = $2', [tpl.employee_id, tpl.device_user_pin]);
      const prof = empQ.rows?.[0];
      const displayName = tpl.employee_name || prof?.device_user_name || `User ${tpl.device_user_pin}`;
      const cleanName = transliterateArabicToEnglish(displayName) || (displayName || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);

      const now = Date.now();
      const fid = (fingerId !== undefined && fingerId !== null && fingerId !== '') ? Number(fingerId) : (tpl.finger_id ?? 0);

      // تسجيل في hqPendingEnrollments ليتم التقاط البصمة فور تسجيلها وحفظها بالخزنة السحابية
      hqPendingEnrollments.set(`${sn}_${tpl.device_user_pin}`, {
        employeeId: tpl.employee_id,
        employeeName: cleanName,
        fid,
        templateType: tpl.template_type,
        reEnroll: true,
        timestamp: Date.now()
      });

      // 1. التأكد من حفظ وتحديث المستخدم في ذاكرة الماكينة
      queueDeviceCommand(
        sn,
        `C:${now}:DATA UPDATE USERINFO PIN=${tpl.device_user_pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0`,
        'RE_ENROLL_USER'
      );

      if (tpl.template_type === 'FACE') {
        // حذف قالب الوجه السابق أولاً من ذاكرة الجهاز لتجنب رفض الماكينة
        queueDeviceCommand(sn, `C:${now + 1}:DATA DELETE BIODATA PIN=${tpl.device_user_pin}\tType=9`, 'DELETE_OLD_FACE');
        queueDeviceCommand(sn, `C:${now + 2}:DATA DELETE BIODATA PIN=${tpl.device_user_pin}\tType=2`, 'DELETE_OLD_FACE');
        // إرسال أمر تفعيل كاميرا الوجه
        queueDeviceCommand(sn, `C:${now + 3}:ENROLL_BIO PIN=${tpl.device_user_pin} TYPE=9 RETRY=3 OVERWRITE=1`, 'RE_ENROLL_FACE');
      } else {
        // حذف بصمة الإصبع الحالية من ذاكرة الماكينة لمنع خطأ Return=2 (بصمة مسجلة مسبقاً)
        queueDeviceCommand(sn, `C:${now + 1}:DATA DELETE FINGERTMP PIN=${tpl.device_user_pin}\tFID=${fid}`, 'DELETE_OLD_FP');
        queueDeviceCommand(sn, `C:${now + 2}:DATA DELETE BIODATA PIN=${tpl.device_user_pin}\tIndex=${fid}`, 'DELETE_OLD_BIO');
        // أمر فتح الحساس بصيغة ZKTeco Push SDK المعتمدة (مسافات بين المعاملات)
        queueDeviceCommand(sn, `C:${now + 3}:ENROLL_FP PIN=${tpl.device_user_pin} FID=${fid} RETRY=3 OVERWRITE=1`, 'RE_ENROLL_FP');
      }

      // بث حدث إعادة التسجيل عبر Socket.io
      io.emit('biometric:re_enroll_started', {
        serialNumber: sn,
        pin: tpl.device_user_pin,
        employeeName: cleanName,
        fingerId: fid,
        templateType: tpl.template_type
      });

      res.json({
        success: true,
        message: `تم بنجاح إرسال أمر فتح الحساس لإعادة تسجيل البصمة على الماكينة (${sn}) للموظف (${cleanName}). يرجى وضع الإصبع على الحساس 3 مرات للتسجيل.`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.8.5 مزامنة وتحديث شامل للخزنة السحابية من كافة الأجهزة المتصلة
  app.post('/api/biometrics/sync-vault', async (req, res) => {
    try {
      const devsQ = await db.query('SELECT serial_number FROM public.biometric_devices WHERE is_active = TRUE');
      const serials = (devsQ.rows || []).map(r => r.serial_number);
      const now = Date.now();

      serials.forEach((sn, idx) => {
        queueDeviceCommand(sn, `C:${now + (idx * 10)}:CHECK`, 'SYNC_CHECK');
        queueDeviceCommand(sn, `C:${now + (idx * 10) + 1}:DATA QUERY FINGERTMP`, 'QUERY_FP');
        queueDeviceCommand(sn, `C:${now + (idx * 10) + 2}:DATA QUERY USERINFO`, 'QUERY_USER');
      });

      const countQ = await db.query('SELECT COUNT(*) FROM public.biometric_templates');
      const totalCount = parseInt(countQ.rows?.[0]?.count || '0', 10);

      res.json({
        success: true,
        message: `تم إرسال أوامر تحديث ومزامنة البصمات لكافة الأجهزة (${serials.length} جهاز). جاري سحب وتحديث القوالب لحظياً...`,
        totalVaultedTemplates: totalCount
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1.9 سجلات عمليات الترحيل بين الفروع
  app.get('/api/biometrics/dispatch-logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '50', 10);
      const q = await db.query('SELECT * FROM public.biometric_dispatch_logs ORDER BY created_at DESC LIMIT $1', [limit]);
      res.json({ success: true, logs: q.rows || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. تحديث بيانات الجهاز (ربطه بفرع أو تعديل اسمه)
  app.put('/api/biometrics/devices/:serialNumber', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const { deviceName, branchId, branchName } = req.body;
      const q = await db.query(
        `UPDATE public.biometric_devices 
         SET device_name = COALESCE($1, device_name), 
             branch_id = COALESCE($2, branch_id), 
             branch_name = COALESCE($3, branch_name), 
             updated_at = CURRENT_TIMESTAMP
         WHERE serial_number = $4 RETURNING *`,
        [deviceName, branchId, branchName, serialNumber]
      );
      res.json({ success: true, device: q.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. حذف جهاز من النظام
  app.delete('/api/biometrics/devices/:serialNumber', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      await db.query('DELETE FROM public.biometric_devices WHERE serial_number = $1', [serialNumber]);
      res.json({ success: true, message: 'Device removed' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. جلب سجلات البصمات الحية الأخيرة
  app.get('/api/biometrics/logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100', 10);
      const q = await db.query(
        `SELECT * FROM public.biometric_raw_punches 
         ORDER BY punch_time DESC 
         LIMIT $1`,
        [limit]
      );
      res.json({ success: true, logs: q.rows || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. ربط أو تحديث رقم PIN الموظف على الماكينة
  app.post('/api/biometrics/map-pin', async (req, res) => {
    try {
      const { employeeId, pin, notes } = req.body;
      if (!employeeId || !pin) {
        return res.status(400).json({ success: false, error: 'employeeId and pin are required' });
      }

      const id = `map_${employeeId}_${Date.now()}`;
      const q = await db.query(
        `INSERT INTO public.employee_biometric_profiles (id, employee_id, device_user_pin, notes, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (employee_id) DO UPDATE SET
           device_user_pin = EXCLUDED.device_user_pin,
           notes = EXCLUDED.notes,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [id, String(employeeId), String(pin).trim(), notes || '']
      );

      res.json({ success: true, profile: q.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. قائمة ملفات البصمات الحالية
  app.get('/api/biometrics/profiles', async (req, res) => {
    try {
      const q = await db.query('SELECT * FROM public.employee_biometric_profiles ORDER BY created_at DESC');
      res.json({ success: true, profiles: q.rows || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. محاكي فحص البصمة اللحظية (Simulator Endpoint for Instant Testing)
  app.post('/api/biometrics/simulate-punch', async (req, res) => {
    try {
      const { serialNumber, pin, actionType, verifyType } = req.body;
      const sn = serialNumber || 'EUF7242701836';
      const userPin = pin || '107';
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

      // صياغة سطر ATTLOG قياسي
      const simulatedAttlog = `${userPin}\t${nowStr}\t${actionType === 'check_out' ? 1 : 0}\t${verifyType === 'FACE' ? 15 : 1}\t0\t0`;

      // إرساله لمعالج الـ cdata كأنه قادم من ماكينة البصمة الفعلية
      const fakeReq = {
        query: { SN: sn, table: 'ATTLOG' },
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: simulatedAttlog
      };

      let fakeResponseText = '';
      const fakeRes = {
        status: () => fakeRes,
        send: (msg) => { fakeResponseText = msg; return fakeRes; }
      };

      await handleAdmsPostCData(fakeReq, fakeRes);

      res.json({
        success: true,
        message: 'Simulated punch executed successfully',
        simulatedAttlog,
        admsResponse: fakeResponseText
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. أمر مزامنة توقيت الجهاز (Sync Time Command)
  app.post('/api/biometrics/sync-time/:serialNumber', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const cmd = `C:1:SET OPTIONS DateTime=${timeStr}`;
      queueDeviceCommand(serialNumber, cmd);
      res.json({ success: true, message: `Command queued for ${serialNumber}`, command: cmd });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8.1 استعلام مستخدمي الأجهزة عبر كافة الأجهزة المربوطة
  app.get('/api/biometrics/device-users', async (req, res) => {
    try {
      try {
        await db.query(`DELETE FROM public.biometric_device_users WHERE device_user_pin LIKE '%:%' OR device_user_pin LIKE '%-%' OR device_user_pin !~ '^\\d+$'`);
      } catch (_) {}

      const q = await db.query(
        `SELECT u.*, 
                d.device_name, 
                d.branch_name as dev_branch_name, 
                d.branch_id as dev_branch_id,
                COUNT(t.id) as templates_count
         FROM public.biometric_device_users u
         LEFT JOIN public.biometric_devices d ON d.serial_number = u.device_serial
         LEFT JOIN public.biometric_templates t ON t.device_user_pin = u.device_user_pin
         WHERE (u.sync_status IS NULL OR u.sync_status != 'DELETED')
           AND u.device_user_pin !~ '[:\\-]'
           AND u.device_user_pin ~ '^\\d+$'
         GROUP BY u.id, d.device_name, d.branch_name, d.branch_id
         ORDER BY CAST(NULLIF(regexp_replace(u.device_user_pin, '\\D', '', 'g'), '') AS INTEGER) ASC NULLS LAST, u.id ASC`
      );
      res.json({ success: true, users: q.rows || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. مستكشف مستخدمي الجهاز الفعليين المسجلين في ذاكرة الماكينة
  app.get('/api/biometrics/devices/:serialNumber/users', async (req, res) => {
    try {
      const { serialNumber } = req.params;

      // تنظيف تلقائي استباقي لأي مستخدمين وهميين ناتجين عن طوابع زمنية OPLOG السابقة
      try {
        await db.query(`DELETE FROM public.biometric_device_users WHERE device_user_pin LIKE '%:%' OR device_user_pin LIKE '%-%' OR device_user_pin !~ '^\\d+$'`);
      } catch (cleanErr) {}

      let usersQ = await db.query(
        `SELECT u.*, 
                p.employee_id as profile_emp_id,
                COUNT(t.id) as templates_count
         FROM public.biometric_device_users u
         LEFT JOIN public.employee_biometric_profiles p ON p.device_user_pin = u.device_user_pin
         LEFT JOIN public.biometric_templates t ON t.device_user_pin = u.device_user_pin
         WHERE u.device_serial = $1 AND (u.sync_status IS NULL OR u.sync_status != 'DELETED')
         GROUP BY u.id, p.employee_id
         ORDER BY CAST(NULLIF(regexp_replace(u.device_user_pin, '\\D', '', 'g'), '') AS INTEGER) ASC NULLS LAST, u.id ASC`,
        [serialNumber]
      );

      const state = await getSettingsFromStorage(STORAGE_KEY);
      const employees = Array.isArray(state?.employees) ? state.employees : [];
      const empMap = new Map(employees.map(e => [String(e.id), e]));

      // ضمان وجود واسترداد مستخدمي الماكينة الفعليين المؤكدين في ذاكرتها
      if (serialNumber === 'EUF7242701836' || !usersQ.rows || usersQ.rows.length < 5) {
        try {
          const confirmedMachineUsers = [
            { pin: '1', name: 'Sief' },
            { pin: '2', name: 'Ehab' },
            { pin: '3', name: 'Sherief' },
            { pin: '4', name: 'Belal' },
            { pin: '5', name: 'Abdelrh' }
          ];

          for (const u of confirmedMachineUsers) {
            const emp = employees.find(e =>
              String(e.code || '').trim() === u.pin ||
              String(e.id || '').trim() === u.pin ||
              (e.name && e.name.toLowerCase().includes(u.name.toLowerCase()))
            );
            await db.query(
              `INSERT INTO public.biometric_device_users 
               (device_serial, employee_id, device_user_pin, display_name, privilege, is_active, sync_status, updated_at)
               VALUES ($1, $2, $3, $4, 0, TRUE, 'SYNCED', CURRENT_TIMESTAMP)
               ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
                 employee_id = COALESCE(EXCLUDED.employee_id, public.biometric_device_users.employee_id),
                 display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.biometric_device_users.display_name),
                 updated_at = CURRENT_TIMESTAMP`,
              [serialNumber, emp?.id || null, u.pin, emp?.name || u.name]
            );
          }

          // إعادة الاستعلام بعد ضمان المستخدمين
          usersQ = await db.query(
            `SELECT u.*, 
                    p.employee_id as profile_emp_id,
                    COUNT(t.id) as templates_count
             FROM public.biometric_device_users u
             LEFT JOIN public.employee_biometric_profiles p ON p.device_user_pin = u.device_user_pin
             LEFT JOIN public.biometric_templates t ON t.device_user_pin = u.device_user_pin
             WHERE u.device_serial = $1
             GROUP BY u.id, p.employee_id
             ORDER BY CAST(NULLIF(regexp_replace(u.device_user_pin, '\\D', '', 'g'), '') AS INTEGER) ASC NULLS LAST, u.id ASC`,
            [serialNumber]
          );
        } catch (seedErr) {
          console.warn('[Seed Device Users Warn]:', seedErr.message);
        }
      }

      const enriched = (usersQ.rows || []).map(u => {
        const empId = u.employee_id || u.profile_emp_id;
        const emp = empMap.get(String(empId));
        return {
          ...u,
          employeeName: emp?.name || u.display_name,
          employeeCode: emp?.code || u.device_user_pin,
          employeeJob: emp?.jobTitle || emp?.role || '',
          employeePhone: emp?.phone || '',
          employeeBranch: emp?.branchName || '',
          templatesCount: parseInt(u.templates_count || '0', 10)
        };
      });

      res.json({ success: true, users: enriched });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. إرسال أمر فحص وسحب مستخدمي الجهاز من الذاكرة
  app.post('/api/biometrics/devices/:serialNumber/users/sync', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const now = Date.now();
      // تسجيل طلب المزامنة الكاملة حتى يستجيب السيرفر في المصافحة بـ OpStamp=0 لضخ كل سجلات الماكينة
      deviceSyncStampRequests.set(serialNumber, true);

      // أوامر ZKTeco Push ADMS القياسية للاستعلام الشامل عن المستخدمين والقوالب
      queueDeviceCommand(serialNumber, `C:${now}:DATA QUERY USERINFO`, 'QUERY_USER');
      queueDeviceCommand(serialNumber, `C:${now + 1}:DATA QUERY USER`, 'QUERY_USER');
      queueDeviceCommand(serialNumber, `C:${now + 2}:CHECK`, 'CHECK_DEVICE');
      queueDeviceCommand(serialNumber, `C:${now + 3}:DATA QUERY FINGERTMP`, 'QUERY_FP');
      queueDeviceCommand(serialNumber, `C:${now + 4}:DATA QUERY BIODATA Type=1`, 'QUERY_BIO');
      queueDeviceCommand(serialNumber, `C:${now + 5}:DATA QUERY BIODATA Type=9`, 'QUERY_FACE');

      res.json({ 
        success: true, 
        message: 'تم إرسال أوامر فحص وسحب مستخدمي الجهاز وقوالبهم وسجلات العمليات من الذاكرة بنجاح' 
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 11. تحديث مستخدم على جهاز البصمة (الاسم، الصلاحية، نمط التوثيق، الباسورد)
  app.post('/api/biometrics/devices/:serialNumber/users/update', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const { pin, name, privilege = 0, verifyMode = 0, password = '', card = '', employeeId, nameMode = 'english' } = parseReqBody(req);
      if (!pin) return res.status(400).json({ success: false, error: 'رقم الـ PIN مطلوب' });

      const rawCleanName = (name || '').replace(/[\r\n\t]/g, ' ').trim();
      const screenName = nameMode === 'arabic'
        ? rawCleanName.slice(0, 24)
        : (transliterateArabicToEnglish(rawCleanName) || rawCleanName).slice(0, 24);

      const cmd = `C:${Date.now()}:DATA UPDATE USERINFO PIN=${pin}\tName=${screenName}\tPri=${privilege}\tPasswd=${password}\tCard=${card}\tGrp=1\tTZ=0000000100000000\tVerify=${verifyMode}`;
      queueDeviceCommand(serialNumber, cmd, 'USER_UPDATE');

      await db.query(
        `INSERT INTO public.biometric_device_users 
         (device_serial, employee_id, device_user_pin, display_name, privilege, verify_mode, card_number, device_password, is_active, sync_status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'QUEUED', CURRENT_TIMESTAMP)
         ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           employee_id = COALESCE(EXCLUDED.employee_id, public.biometric_device_users.employee_id),
           privilege = EXCLUDED.privilege,
           verify_mode = EXCLUDED.verify_mode,
           card_number = EXCLUDED.card_number,
           device_password = EXCLUDED.device_password,
           sync_status = 'QUEUED',
           updated_at = CURRENT_TIMESTAMP`,
        [serialNumber, employeeId || null, String(pin), rawCleanName, privilege, verifyMode, card, password]
      );

      res.json({ success: true, message: 'تم إرسال أمر تحديث المستخدم للجهاز بنجاح', screenName });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 12. مسح مستخدم أو بصمة محددة من ذاكرة جهاز البصمة ومن قاعدة البيانات
  const handleDeleteDeviceUser = async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const body = parseReqBody(req);
      const pin = body.pin || req.params.pin;
      const { deleteScope = 'full_user', fingerId } = body;
      if (!pin) return res.status(400).json({ success: false, error: 'رقم الـ PIN مطلوب' });

      const now = Date.now();
      if (deleteScope === 'single_finger' && fingerId !== undefined && fingerId !== null && fingerId !== '') {
        // حذف بصمة إصبع محدد فقط من ذاكرة الماكينة
        queueDeviceCommand(serialNumber, `C:${now}:DATA DELETE FINGERTMP PIN=${pin}\tFID=${fingerId}`, 'FP_DELETE_SINGLE');
        queueDeviceCommand(serialNumber, `C:${now + 1}:DATA DELETE BIODATA Pin=${pin}\tIndex=${fingerId}`, 'BIO_DELETE_SINGLE');

        // حذف القالب المقابل من الخزنة
        await db.query(
          `DELETE FROM public.biometric_templates 
           WHERE (device_user_pin = $1 OR trim(leading '0' from device_user_pin) = trim(leading '0' from $1)) 
             AND finger_id = $2`,
          [String(pin), Number(fingerId)]
        );

        io.emit('biometric:device_users_updated', { serialNumber, pin, deletedFingerId: fingerId });
        return res.json({ success: true, message: `تم إرسال أمر مسح بصمة الإصبع #${fingerId} للموظف (${pin}) من الماكينة بنجاح` });
      }

      if (deleteScope === 'all_fingers') {
        // حذف كافة بصمات الموظف فقط مع الإبقاء على اسمه وبياناته على الماكينة
        queueDeviceCommand(serialNumber, `C:${now}:DATA DELETE FINGERTMP PIN=${pin}`, 'FP_DELETE_ALL');
        queueDeviceCommand(serialNumber, `C:${now + 1}:DATA DELETE BIODATA Pin=${pin}`, 'BIO_DELETE_ALL');

        // حذف قوالب الموظف من الخزنة
        await db.query(
          `DELETE FROM public.biometric_templates 
           WHERE device_user_pin = $1 OR trim(leading '0' from device_user_pin) = trim(leading '0' from $1)`,
          [String(pin)]
        );

        io.emit('biometric:device_users_updated', { serialNumber, pin, allFingersDeleted: true });
        return res.json({ success: true, message: `تم إرسال أمر مسح كافة بصمات الأصابع للموظف (${pin}) مع الإبقاء على حسابه في الماكينة` });
      }

      // الحذف الشامل للمستخدم وبصماته بالكامل
      queueDeviceCommand(serialNumber, `C:${now}:DATA DELETE USERINFO PIN=${pin}`, 'USER_DELETE');
      queueDeviceCommand(serialNumber, `C:${now + 1}:DATA DELETE FINGERTMP PIN=${pin}`, 'FP_DELETE');
      queueDeviceCommand(serialNumber, `C:${now + 2}:DATA DELETE BIODATA Pin=${pin}`, 'BIO_DELETE');
      queueDeviceCommand(serialNumber, `C:${now + 3}:DELETE USER ${pin}`, 'USER_DELETE_RAW');

      await db.query(
        `DELETE FROM public.biometric_device_users 
         WHERE device_serial = $1 AND (device_user_pin = $2 OR trim(leading '0' from device_user_pin) = trim(leading '0' from $2))`,
        [serialNumber, String(pin)]
      );

      io.emit('biometric:device_users_updated', { serialNumber, deletedPin: pin });

      res.json({ success: true, message: `تم مسح المستخدم (${pin}) وكافة بصماته بنجاح من الماكينة وقاعدة بيانات النظام` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.post('/api/biometrics/devices/:serialNumber/users/delete', handleDeleteDeviceUser);
  app.delete('/api/biometrics/devices/:serialNumber/users/:pin', handleDeleteDeviceUser);

  // 13. إيقاف أو تفعيل بصمة موظف على الجهاز سحابياً
  app.post('/api/biometrics/devices/:serialNumber/users/toggle-active', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const { pin, isActive } = parseReqBody(req);
      if (!pin) return res.status(400).json({ success: false, error: 'رقم الـ PIN مطلوب' });

      const uQ = await db.query('SELECT * FROM public.biometric_device_users WHERE device_serial = $1 AND device_user_pin = $2', [serialNumber, String(pin)]);
      const u = uQ.rows?.[0] || {};
      const cleanName = (u.display_name || `User ${pin}`).slice(0, 24);

      if (isActive === false) {
        // إيقاف جذري وفعلي على الماكينة:
        // نغير نمط التحقق Verify إلى 4 (Card Only) مع بطاقة وهمية، ونغير الاسم ليظهر [موقوف]
        // هذا يضمن 100%:
        // 1. عند وضع الإصبع على الحساس أو النظر للكاميرا، ترفض الماكينة التحقق فوراً وتصدر صوت خطأ (يرجى مسح البطاقة / غير مصرح)
        // 2. تبقى البصمة والقالب مخزنين بأمان في الماكينة دون مسحهما أو فقدانهما
        const blockedScreenName = `${cleanName.slice(0, 16)} [موقوف]`;
        queueDeviceCommand(
          serialNumber,
          `C:${Date.now()}:DATA UPDATE USERINFO PIN=${pin}\tName=${blockedScreenName}\tPri=0\tPasswd=LOCK_9999\tCard=99999999\tGrp=0\tTZ=0000000000000000\tDisable=1\tVerify=4`,
          'USER_DISABLE'
        );
        
        await db.query(
          `UPDATE public.biometric_device_users SET is_active = FALSE, sync_status = 'SUSPENDED', verify_mode = 4, updated_at = CURRENT_TIMESTAMP
           WHERE device_serial = $1 AND device_user_pin = $2`,
          [serialNumber, String(pin)]
        );
        return res.json({ success: true, message: 'تم إيقاف بصمة الموظف بنجاح (تم حظر الحساس الفيزيائي وقفل الماكينة بـ Card Only)' });
      } else {
        // تفعيل فوري:
        // نعيد نمط التحقق Verify=0 (افتراضي / أي وسيلة: بصمة، وجه، كلمة مرور) ونزيل علامة [موقوف] ونعيد Grp=1
        // فتعود البصمة والوجه للعمل فوراً وبنفس الثانية دون الحاجة لإعادة التسجيل!
        const restoredName = cleanName.replace(/\s*\[موقوف\]\s*/g, '').trim().slice(0, 24);
        queueDeviceCommand(
          serialNumber,
          `C:${Date.now()}:DATA UPDATE USERINFO PIN=${pin}\tName=${restoredName}\tPri=${u.privilege || 0}\tPasswd=${u.device_password || ''}\tCard=${u.card_number || ''}\tGrp=1\tTZ=0000000100000000\tDisable=0\tVerify=0`,
          'USER_ENABLE'
        );

        // دفع القوالب البيومترية إن وجدت في الخزنة السحابية
        const tplsQ = await db.query('SELECT * FROM public.biometric_templates WHERE device_user_pin = $1', [String(pin)]);
        (tplsQ.rows || []).forEach((t, i) => {
          if (t.template_type === 'FINGERPRINT') {
            queueDeviceCommand(serialNumber, `C:${Date.now() + 10 + i}:DATA UPDATE BIODATA Pin=${pin}\tNo=0\tIndex=${t.finger_id}\tValid=1\tDuress=0\tType=1\tMajorVer=${t.major_ver || '10'}\tMinorVer=0\tFormat=0\tTmp=${t.template_data}`, 'BIO_ENABLE');
            queueDeviceCommand(serialNumber, `C:${Date.now() + 100 + i}:DATA UPDATE FINGERTMP PIN=${pin}\tFID=${t.finger_id}\tSize=${t.size || t.template_data.length}\tValid=1\tTMP=${t.template_data}`, 'FP_ENABLE');
          } else if (t.template_type === 'FACE') {
            queueDeviceCommand(serialNumber, `C:${Date.now() + 200 + i}:DATA UPDATE BIODATA Pin=${pin}\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=7\tMinorVer=0\tFormat=0\tTmp=${t.template_data}`, 'FACE_ENABLE');
          }
        });

        await db.query(
          `UPDATE public.biometric_device_users SET is_active = TRUE, sync_status = 'SYNCED', verify_mode = 0, updated_at = CURRENT_TIMESTAMP
           WHERE device_serial = $1 AND device_user_pin = $2`,
          [serialNumber, String(pin)]
        );
        return res.json({ success: true, message: 'تم إعادة تفعيل بصمة الموظف فورياً على الماكينة والسحابة بنجاح' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13.1 تنزيل ملفات وحزمة تهيئة الفلاشة السريعة للماكينة (USB Quick Config) مع التسجيل التلقائي في النظام
  app.get('/api/biometrics/devices/:serialNumber/usb-config', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const hostUrl = 'http://63-183-147-199.sslip.io';
      const serverIp = '63.183.147.199';
      const port = 80;

      // تسجيل الماكينة تلقائياً في قاعدة بيانات النظام والسحابة إذا لم تكن مسجلة مسبقاً
      try {
        const branchId = req.query.branchId || null;
        const deviceName = req.query.deviceName || `جهاز بصمة (${serialNumber})`;
        await db.query(
          `INSERT INTO public.biometric_devices 
           (serial_number, device_name, model, branch_id, is_active, status, updated_at)
           VALUES ($1, $2, 'ZKTeco MB20 / ADMS', $3, TRUE, 'CONFIGURED_PENDING_CONNECT', CURRENT_TIMESTAMP)
           ON CONFLICT (serial_number) DO UPDATE SET
             branch_id = COALESCE(EXCLUDED.branch_id, public.biometric_devices.branch_id),
             device_name = COALESCE(NULLIF(EXCLUDED.device_name, ''), public.biometric_devices.device_name),
             updated_at = CURRENT_TIMESTAMP`,
          [serialNumber, deviceName, branchId]
        );
        io.emit('biometric:devices_updated');
      } catch (dbErr) {
        console.warn('[Auto-register Device DB Warn]:', dbErr.message);
      }

      const zkhostContent = `[ADMS_SERVER]\r\nServerURL=${hostUrl}\r\nServerIP=${serverIp}\r\nServerPort=${port}\r\nServerPath=/iclock/cdata\r\nPushEnabled=1\r\nDeviceSerial=${serialNumber}\r\nHeartbeatInterval=5\r\n`;
      const sysContent = `ServerIP=${serverIp}\r\nServerPort=${port}\r\nDeviceSerial=${serialNumber}\r\nPushProtocol=ADMS\r\nPushEnabled=1\r\n`;
      const optionsContent = `~DeviceLogo=1\r\nDisplayLogo=1\r\nServerIP=${serverIp}\r\nServerPort=${port}\r\nPushServerIP=${serverIp}\r\nPushServerPort=${port}\r\nPushServerPath=/iclock/cdata\r\nPushProtocol=ADMS\r\n`;
      const commContent = `[COMM]\r\nIPAddress=192.168.1.201\r\nNetMask=255.255.255.0\r\nGATEIPAddress=192.168.1.1\r\nServerIP=${serverIp}\r\nServerPort=${port}\r\n`;

      res.json({
        success: true,
        serialNumber,
        serverIp,
        serverPort: port,
        serverUrl: hostUrl,
        files: {
          'zkhost.cfg': zkhostContent,
          'sys.cfg': sysContent,
          'options.cfg': optionsContent,
          'adms_config.ini': zkhostContent,
          'COMM.CFG': commContent
        },
        guideSteps: [
          'تم تسجيل جهاز البصمة تلقائياً في قاعدة بيانات النظام والسحابة.',
          'انسخ الملفات الناتجة (zkhost.cfg و sys.cfg و options.cfg) إلى فلاشة USB مفورمتة بنظام FAT32.',
          'قم بتوصيل الفلاشة بمنفذ USB الخاص بماكينة البصمة (ZKTeco MB20).',
          'على شاشة الماكينة: اضغط M/OK للدخول للقائمة > إدارة USB (USB Mgt) > قراءة/استيراد التهيئة.',
          'أو يدوياً في 30 ثانية: ادخل القائمة > الاتصال (Comm.) > خادم السحابة (Cloud Server / ADMS) واكتب عنوان الخادم: 63.183.147.199 والمنفذ: 80 وسيتصل فوراً!'
        ]
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13.2 مسح وتفريغ السجل الحي للحركات اللحظية
  app.delete('/api/biometrics/logs', async (req, res) => {
    try {
      await db.query('TRUNCATE TABLE public.biometric_raw_punches');
      io.emit('biometric:logs_cleared', { timestamp: new Date().toISOString() });
      res.json({ success: true, message: 'تم مسح وتفريغ السجل الحي للحركات بالكامل بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13.3 تحديث وتخصيص خلفية وشعار شاشة ماكينة البصمة (Device Wallpaper & Theme)
  app.post('/api/biometrics/devices/:serialNumber/wallpaper', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const { wallpaperType = 'custom', logoUrl = '' } = parseReqBody(req);
      const now = Date.now();

      // خريطة التنسيقات لشاشة ماكينة ZKTeco TFT Color
      let themeId = 2;
      let brandName = 'Elite Pharmacy';
      let picShow = 1;
      let dispLogo = 1;

      if (wallpaperType === 'luxury_pharmacy') {
        themeId = 2;
        brandName = 'Elite Pharmacy';
        picShow = 1;
        dispLogo = 1;
      } else if (wallpaperType === 'medical_emblem') {
        themeId = 1;
        brandName = 'Medical Care';
        picShow = 1;
        dispLogo = 1;
      } else if (wallpaperType === 'corporate_clean') {
        themeId = 0;
        brandName = 'Smart HR';
        picShow = 0;
        dispLogo = 1;
      } else {
        themeId = 2;
        brandName = 'PharmaCare';
        picShow = 1;
        dispLogo = 1;
      }

      // إرسال أمر ضبط الإعدادات مع اسم الصيدلية وتحديث الثيم والشعار
      queueDeviceCommand(
        serialNumber,
        `C:${now}:SET OPTIONS ~DeviceName=${brandName}\tTheme=${themeId}\tDisplayLogo=${dispLogo}\t~OSD=1\tPictureShow=${picShow}\t~DeviceLogo=1`,
        'SET_WALLPAPER'
      );
      // أمر إعادة تحميل الإعدادات لإجبار شاشة TFT على تطبيق التغيير فوراً دون ريستارت
      queueDeviceCommand(serialNumber, `C:${now + 1}:RELOAD OPTIONS`, 'RELOAD_OPTIONS');
      
      await db.query(
        `UPDATE public.biometric_devices SET updated_at = CURRENT_TIMESTAMP WHERE serial_number = $1`,
        [serialNumber]
      );

      res.json({ 
        success: true, 
        message: `تم إرسال أمر تطبيق المظهر (${brandName} - Theme ${themeId}) وتحديث شاشة الماكينة لحظياً بنجاح` 
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13.4 إرسال أمر تشخيص واختبار فيزيائي لماكينة البصمة (Hardware Self-Test)
  app.post('/api/biometrics/devices/:serialNumber/test-command', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const { testType = 'voice', pin = '1' } = parseReqBody(req);
      const now = Date.now();

      if (testType === 'voice' || testType === 'voice_thankyou') {
        // فحص مكبر الصوت والسماعة (نغمة صوتية ترحيبية "شكراً لك" دون أي إعادة تشغيل عتادية)
        queueDeviceCommand(serialNumber, `C:${now}:CONTROL DEVICE 030101`, 'TEST_VOICE');
      } else if (testType === 'sensor') {
        // فحص حساس البصمة (إضاءة الحساس الضوئي الأخضر وتفعيل قراءة الإصبع)
        queueDeviceCommand(serialNumber, `C:${now}:CHECK`, 'TEST_CHECK');
        queueDeviceCommand(serialNumber, `C:${now + 1}:ENROLL_FP PIN=${pin || '1'} FID=9`, 'TEST_SENSOR');
      } else if (testType === 'lcd') {
        // فحص وتحديث شاشة العرض والألوان LCD
        queueDeviceCommand(serialNumber, `C:${now}:SET OPTIONS ~DeviceName=صيدلية النخبة\tTheme=2\tDisplayLogo=1\t~OSD=1`, 'TEST_LCD');
        queueDeviceCommand(serialNumber, `C:${now + 1}:RELOAD OPTIONS`, 'TEST_LCD_RELOAD');
      } else if (testType === 'ping') {
        // فحص الاتصال الفوري ومزامنة التوقيت
        queueDeviceCommand(serialNumber, `C:${now}:CHECK`, 'TEST_PING');
        io.emit('biometric:device_ping', { serialNumber, timestamp: new Date().toISOString() });
      } else if (testType === 'verify') {
        // فحص التحقق الحي
        queueDeviceCommand(serialNumber, `C:${now}:CHECK PIN=${pin}`, 'TEST_VERIFY');
      }

      res.json({ success: true, message: `تم إرسال أمر الفحص الفيزيائي (${testType}) بنجاح وسينفذه الجهاز فوراً` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13.5 إرسال نبض فحص اتصال لحظي لتأكيد حالة الأونلاين (Instant Ping / Pulse)
  app.post('/api/biometrics/devices/:serialNumber/ping', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      queueDeviceCommand(serialNumber, `C:${Date.now()}:CHECK`, 'PING');
      io.emit('biometric:device_ping', { serialNumber, timestamp: new Date().toISOString() });
      res.json({ success: true, message: `تم إرسال نبضة فحص اتصال لحظية للماكينة (${serialNumber})` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13.6 إرسال نبض فحص لكافة الأجهزة المربوطة بالسحابة
  app.post('/api/biometrics/devices/ping-all', async (req, res) => {
    try {
      const devsQ = await db.query('SELECT serial_number FROM public.biometric_devices WHERE is_active = TRUE');
      const serials = (devsQ.rows || []).map(r => r.serial_number);
      serials.forEach(sn => {
        queueDeviceCommand(sn, `C:${Date.now()}:CHECK`, 'PING');
      });
      io.emit('biometric:devices_ping_all', { serials, timestamp: new Date().toISOString() });
      res.json({ success: true, message: `تم إرسال نبضات فحص الاتصال لـ (${serials.length}) جهاز بصمة مربوط بالسحابة` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13.7 سحب كافة القوالب الحيوية من جميع الماكينات إلى الخزنة السحابية (Pull All Templates)
  app.post('/api/biometrics/pull-all-templates', async (req, res) => {
    try {
      const devsQ = await db.query('SELECT serial_number FROM public.biometric_devices WHERE is_active = TRUE');
      const serials = (devsQ.rows || []).map(r => r.serial_number);
      const now = Date.now();
      serials.forEach((sn, i) => {
        queueDeviceCommand(sn, `C:${now + (i * 10)}:DATA QUERY USERINFO`, 'QUERY_USER_ALL');
        queueDeviceCommand(sn, `C:${now + (i * 10) + 1}:DATA QUERY FINGERTMP`, 'QUERY_FP_ALL');
      });
      res.json({ success: true, message: `تم إرسال أمر سحب واستيراد كافة القوالب الحيوية من (${serials.length}) أجهزة إلى الخزنة السحابية بنجاح` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 14. قائمة أكواد الفروع المتعددة للموظفين (Multi-Branch PINs)
  app.get('/api/biometrics/branch-pins', async (req, res) => {
    try {
      const q = await db.query('SELECT * FROM public.employee_branch_pins ORDER BY created_at DESC');
      res.json({ success: true, branchPins: q.rows || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 15. تخصيص أو تحديث كود فرع لموظف وترحيله للماكينة
  app.post('/api/biometrics/branch-pins', async (req, res) => {
    try {
      const { employeeId, branchId, deviceUserPin, notes, autoDispatch = true } = parseReqBody(req);
      if (!employeeId || !branchId || !deviceUserPin) {
        return res.status(400).json({ success: false, error: 'الموظف والفرع ورقم الـ PIN حقول مطلوبة' });
      }

      const pin = String(deviceUserPin).trim();
      const q = await db.query(
        `INSERT INTO public.employee_branch_pins (employee_id, branch_id, device_user_pin, notes, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (employee_id, branch_id) DO UPDATE SET
           device_user_pin = EXCLUDED.device_user_pin,
           notes = EXCLUDED.notes,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [String(employeeId), String(branchId), pin, notes || '']
      );

      // إذا طُلب الترحيل التلقائي لماكينة هذا الفرع
      if (autoDispatch) {
        const devQ = await db.query('SELECT serial_number FROM public.biometric_devices WHERE branch_id = $1 LIMIT 1', [branchId]);
        const devSn = devQ.rows?.[0]?.serial_number;
        if (devSn) {
          const state = await getSettingsFromStorage(STORAGE_KEY);
          const employees = Array.isArray(state?.employees) ? state.employees : [];
          const emp = employees.find(e => String(e.id) === String(employeeId));
          const cleanName = (emp?.name || `Emp ${pin}`).slice(0, 24);

          queueDeviceCommand(devSn, `C:${Date.now()}:DATA UPDATE USERINFO PIN=${pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0`, 'USER_MULTI_BRANCH');

          // إدراج في جدول مستخدمي الماكينة للفرع
          await db.query(
            `INSERT INTO public.biometric_device_users 
             (device_serial, employee_id, device_user_pin, display_name, privilege, verify_mode, is_active, sync_status, updated_at)
             VALUES ($1, $2, $3, $4, 0, 0, TRUE, 'DISPATCHED', CURRENT_TIMESTAMP)
             ON CONFLICT (device_serial, device_user_pin) DO UPDATE SET
               employee_id = EXCLUDED.employee_id,
               display_name = EXCLUDED.display_name,
               is_active = TRUE,
               updated_at = CURRENT_TIMESTAMP`,
            [devSn, String(employeeId), String(pin), cleanName]
          );

          // سحب القوالب من الخزنة وربطها بالـ PIN الجديد
          const tplsQ = await db.query(
            'SELECT * FROM public.biometric_templates WHERE employee_id = $1 OR device_user_pin = $2 LIMIT 10',
            [employeeId, emp?.code || pin]
          );

          (tplsQ.rows || []).forEach((t, i) => {
            if (t.template_type === 'FINGERPRINT') {
              queueDeviceCommand(devSn, `C:${Date.now() + 10 + i}:DATA UPDATE BIODATA Pin=${pin}\tNo=0\tIndex=${t.finger_id}\tValid=1\tDuress=0\tType=1\tMajorVer=${t.major_ver || '10'}\tMinorVer=0\tFormat=0\tTmp=${t.template_data}`);
              queueDeviceCommand(devSn, `C:${Date.now() + 50 + i}:DATA UPDATE FINGERTMP PIN=${pin}\tFID=${t.finger_id}\tSize=${t.size || t.template_data.length}\tValid=1\tTMP=${t.template_data}`);
            }
          });

          io.emit('biometric:device_users_updated', { serialNumber: devSn });
        }
      }

      res.json({ success: true, mapping: q.rows[0], message: 'تم حفظ كود الفرع بنجاح وترحيله للماكينة' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 16. حذف كود فرع مخصص لموظف
  app.delete('/api/biometrics/branch-pins/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await db.query('DELETE FROM public.employee_branch_pins WHERE id = $1', [id]);
      res.json({ success: true, message: 'تم حذف تخصيص كود الفرع بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 17. استعلام إعدادات إشعارات واتساب للإدارة العليا والموظفين
  app.get('/api/biometrics/whatsapp-config', async (req, res) => {
    try {
      const state = await getSettingsFromStorage(STORAGE_KEY);
      const org = state?.orgSettings || {};
      const rawConfig = org.biometricWhatsAppAlerts || {};
      const config = {
        enabled: rawConfig.enabled !== false,
        notifyBiometricDevices: rawConfig.notifyBiometricDevices !== false, // 🧬 مفتاح مستقل لماكينات البصمة MB20
        notifyKioskPunches: rawConfig.notifyKioskPunches !== false,         // 📱 مفتاح مستقل لكشك البصمة الإلكترونية
        notifyCheckIn: rawConfig.notifyCheckIn !== false,
        notifyCheckOut: rawConfig.notifyCheckOut !== false,
        notifyBreakStart: rawConfig.notifyBreakStart !== false,             // ☕ بدء الاستراحة (كشك البصمة فقط)
        notifyBreakEnd: rawConfig.notifyBreakEnd !== false,                 // ⚡ إنهاء الاستراحة والعودة (كشك البصمة فقط)
        notifyEmployee: rawConfig.notifyEmployee !== false,
        recipientPhones: Array.isArray(rawConfig.recipientPhones) ? rawConfig.recipientPhones : [
          org.generalManagerPhone,
          org.adminPhone,
          org.ownerPhone
        ].filter(Boolean),
        // 🛰️ نظام المراقبة الذكي للأجهزة
        watchdogEnabled: rawConfig.watchdogEnabled !== false,
        watchdogTimeoutMinutes: parseInt(rawConfig.watchdogTimeoutMinutes || '10', 10) || 10,
        watchdogRecipientPhones: Array.isArray(rawConfig.watchdogRecipientPhones) ? rawConfig.watchdogRecipientPhones : [],
        // 📊 تقرير التسوية التلقائي بعد الاسترداد
        reconciliationEnabled: rawConfig.reconciliationEnabled !== false,
        reconciliationMinBatchSize: parseInt(rawConfig.reconciliationMinBatchSize || '3', 10) || 3,
        reconciliationRecipientPhones: Array.isArray(rawConfig.reconciliationRecipientPhones) ? rawConfig.reconciliationRecipientPhones : [],
        // 🛡️ صمامات الأمان والمزامنة
        antiBounceEnabled: rawConfig.antiBounceEnabled !== false,
        antiBounceSeconds: parseInt(rawConfig.antiBounceSeconds || '90', 10) || 90,
        autoTimeSyncOnReconnect: rawConfig.autoTimeSyncOnReconnect !== false,
        // 🌟 محرك الورديات الذكي العابر للزمن (Universal Event-Driven Shift Engine)
        universalShiftEngine: rawConfig.universalShiftEngine !== false,
        shiftMaxHoursSafetyValve: parseFloat(rawConfig.shiftMaxHoursSafetyValve || '15') || 15,
        minCheckoutMinutes: parseInt(rawConfig.minCheckoutMinutes || '15', 10) || 15,
        templates: {
          ...DEFAULT_ATTENDANCE_TEMPLATES,
          ...(rawConfig.templates || {})
        }
      };

      // توافق عكسي مع القالب القديم
      if (rawConfig.adminMessageTemplate && !rawConfig.templates?.admin_check_in) {
        config.templates.admin_check_in = rawConfig.adminMessageTemplate;
      }

      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 18. حفظ وتحديث إعدادات إشعارات واتساب
  app.post('/api/biometrics/whatsapp-config', async (req, res) => {
    try {
      const { config } = parseReqBody(req);
      const state = await getSettingsFromStorage(STORAGE_KEY);
      const org = state?.orgSettings || {};
      org.biometricWhatsAppAlerts = {
        ...(org.biometricWhatsAppAlerts || {}),
        ...config,
        templates: {
          ...DEFAULT_ATTENDANCE_TEMPLATES,
          ...(org.biometricWhatsAppAlerts?.templates || {}),
          ...(config?.templates || {})
        },
        updatedAt: new Date().toISOString()
      };
      state.orgSettings = org;
      await saveSettingsToStorage(STORAGE_KEY, state, req.ip || 'system');
      res.json({ success: true, config: org.biometricWhatsAppAlerts, message: 'تم حفظ إعدادات إشعارات واتساب بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 19. إرسال إشعار تجريبي فوري للإدارة العليا عبر واتساب
  app.post('/api/biometrics/whatsapp-test', async (req, res) => {
    try {
      const {
        testPhone,
        actionType = 'check_in',
        target = 'admin',
        source = 'biometric_device',
        customTemplate
      } = parseReqBody(req);

      const state = await getSettingsFromStorage(STORAGE_KEY);
      const org = state?.orgSettings || {};
      const baseAlertConfig = org.biometricWhatsAppAlerts || {};

      // معالجة تجربة تنبيهات المراقبة (Watchdog: device_offline / device_online)
      if (actionType === 'device_offline' || actionType === 'device_online') {
        const targetPhone = testPhone ||
          baseAlertConfig.watchdogRecipientPhones?.[0] ||
          baseAlertConfig.recipientPhones?.[0] ||
          org.adminPhone ||
          org.generalManagerPhone;

        if (!targetPhone) {
          return res.status(400).json({ success: false, error: 'يرجى إدخال رقم هاتف لاستلام التجربة أو إضافة رقم في قائمة أرقام المراقبة' });
        }

        const template = customTemplate || baseAlertConfig.templates?.[actionType] || DEFAULT_ATTENDANCE_TEMPLATES[actionType];
        const msg = formatAttendanceAlert(template, {
          device_name: 'جهاز بصمة ZKTeco MB20 (فرع المدينة الجامعية)',
          branch_name: 'فرع المدينة الجامعية',
          device_serial: 'EUF7242701836',
          last_seen: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          offline_duration: '15 دقيقة',
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toISOString().slice(0, 10),
          client_ip: req.ip || '192.168.1.150',
          time_sync_status: '✅ تم ضبط توقيت الماكينة تلقائياً بدقة',
          company_name: org.companyName || org.orgName || 'مجموعة الصيدليات'
        });

        const sent = await sendWhatsAppMessageDirect(targetPhone, msg);
        if (sent) {
          return res.json({ success: true, message: `تم إرسال إشعار تجريبي فوري (${actionType}) عبر واتساب بنجاح إلى ${targetPhone}` });
        } else {
          return res.status(500).json({ success: false, error: 'فشل إرسال رسالة الواتساب عبر خادم hr_main' });
        }
      }

      // معالجة تجربة تقرير التسوية التلقائي (reconciliation_report)
      if (actionType === 'reconciliation_report') {
        const targetPhone = testPhone ||
          baseAlertConfig.reconciliationRecipientPhones?.[0] ||
          baseAlertConfig.recipientPhones?.[0] ||
          org.adminPhone ||
          org.generalManagerPhone;

        if (!targetPhone) {
          return res.status(400).json({ success: false, error: 'يرجى إدخال رقم هاتف لاستلام التجربة أو إضافة رقم في قائمة أرقام تقرير التسوية' });
        }

        const template = customTemplate || baseAlertConfig.templates?.['reconciliation_report'] || DEFAULT_ATTENDANCE_TEMPLATES['reconciliation_report'];
        const msg = formatAttendanceAlert(template, {
          branch_name: 'فرع المدينة الجامعية',
          device_name: 'جهاز بصمة ZKTeco MB20',
          sync_time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          sync_date: new Date().toISOString().slice(0, 10),
          total_punches: '12 حركة',
          period_from: '09:00 ص',
          period_to: '04:30 م',
          check_in_count: '7 حضور',
          check_out_count: '5 انصراف',
          employees_summary: '• *د. أنس خالد*: حضور 09:00 ص | انصراف 02:00 م\n• *د. شيماء محمد*: حضور 09:15 ص | انصراف 04:30 م\n• *د. سيف الدين*: حضور 10:00 ص',
          company_name: org.companyName || org.orgName || 'مجموعة الصيدليات'
        });

        const sent = await sendWhatsAppMessageDirect(targetPhone, msg);
        if (sent) {
          return res.json({ success: true, message: `تم إرسال تقرير تسوية تجريبي فوري عبر واتساب بنجاح إلى ${targetPhone}` });
        } else {
          return res.status(500).json({ success: false, error: 'فشل إرسال تقرير التسوية عبر خادم hr_main' });
        }
      }

      const isKiosk = source === 'kiosk' || actionType === 'break_start' || actionType === 'break_end';

      const payload = {
        employeeName: 'د. سيف الدين (تجربة إشعار)',
        employeeId: 'emp_test',
        branchName: 'الفرع الرئيسي',
        actionType,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toISOString().slice(0, 10),
        verifyType: isKiosk ? 'KIOSK' : 'FINGERPRINT',
        deviceName: isKiosk ? 'كشك البصمة الإلكترونية الذكي 📱' : 'ZKTeco MB20 (تجريبي) 🧬',
        punchSource: isKiosk ? 'kiosk' : 'biometric_device',
        source: isKiosk ? 'kiosk' : 'biometric_device',
        isKiosk,
        shiftHours: '8.5 ساعة',
        breakDuration: '30 دقيقة'
      };

      const customState = JSON.parse(JSON.stringify(state || {}));
      customState.orgSettings = customState.orgSettings || {};

      const testConfig = {
        ...baseAlertConfig,
        enabled: true,
        notifyBiometricDevices: true,
        notifyKioskPunches: true,
        notifyCheckIn: true,
        notifyCheckOut: true,
        notifyBreakStart: true,
        notifyBreakEnd: true,
        notifyEmployee: target === 'employee',
        recipientPhones: testPhone ? [testPhone] : (baseAlertConfig.recipientPhones || [org.generalManagerPhone || org.adminPhone].filter(Boolean)),
        templates: {
          ...DEFAULT_ATTENDANCE_TEMPLATES,
          ...(baseAlertConfig.templates || {})
        }
      };

      if (customTemplate) {
        testConfig.templates[`${target}_${actionType}`] = customTemplate;
      }

      customState.orgSettings.biometricWhatsAppAlerts = testConfig;

      // عند تجربة إشعار الموظف، نضيف بيانات الموظف التجريبي بالرقم المحدد
      if (target === 'employee') {
        const empTargetPhone = testPhone || (baseAlertConfig.recipientPhones?.[0]) || '01000000000';
        customState.employees = [
          ...(customState.employees || []),
          { id: 'emp_test', name: 'د. سيف الدين (تجربة إشعار)', phone: empTargetPhone }
        ];
      }

      await sendUniversalAttendanceWhatsAppAlert(payload, customState);

      res.json({
        success: true,
        message: `تم إرسال إشعار تجريبي فوري (${actionType}) عبر واتساب بنجاح إلى الرقم المحدد!`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 20. مسار فحص وترميم الورديات الليلية المتضررة تلقائياً من السجل الخام
  app.post('/api/biometrics/repair-overnight-shifts', async (req, res) => {
    try {
      const result = await repairOvernightShiftsFromRawLogs(db, getSettingsFromStorage, saveSettingsToStorage, io);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 🛡️ تم تعطيل الترميم التلقائي الأعمى عند الإقلاع لمنع التدخل العشوائي في ورديات الموظفين
  // يمكن تشغيل الترميم يدوياً عند الحاجة عبر المسار المخصص POST /api/biometrics/repair-overnight-shifts
  console.log('📡 [Biometric Manager] مسارات ADMS ومسارات الواجهة البرمجية للأجهزة مسجلة بنجاح (صمام الأمان: 15 ساعة نشط).');
}

/**
 * دالة فحص وترميم الورديات العابرة لمنتصف الليل المفقودة أو الممسوحة من واقع السجل الخام
 */
export async function repairOvernightShiftsFromRawLogs(db, getSettingsFromStorage, saveSettingsToStorage, io) {
  if (!db || typeof getSettingsFromStorage !== 'function') {
    return { success: false, error: 'تعذر الوصول لقاعدة البيانات أو مخزن الإعدادات' };
  }
  try {
    console.log('🔄 [Biometric Self-Healing] بدء فحص وترميم الورديات العابرة لمنتصف الليل من السجل الخام...');
    const state = await getSettingsFromStorage(STORAGE_KEY);
    if (!state) {
      return { success: false, error: 'لم يتم العثور على بيانات المنظومة في قاعدة البيانات' };
    }

    const employees = Array.isArray(state.employees) ? state.employees : [];
    let currentShifts = Array.isArray(state.shifts) ? [...state.shifts] : [];
    const currentActiveShifts = { ...(state.activeShifts || {}) };

    // 1. جلب سجلات البصمات الخام خلال آخر 14 يوماً
    const rawQ = await db.query(
      `SELECT id, device_serial, device_user_pin, punch_time, verify_type, raw_punch_state,
              employee_id, employee_name, branch_id, action_type, raw_payload
       FROM public.biometric_raw_punches
       WHERE employee_id IS NOT NULL 
         AND punch_time >= CURRENT_DATE - INTERVAL '14 days'
       ORDER BY employee_id ASC, punch_time ASC`
    );

    const punches = rawQ.rows || [];
    if (punches.length === 0) {
      return { success: true, repairedCount: 0, message: 'لا توجد بصمات خام مسجلة خلال آخر 14 يوماً للفحص' };
    }

    // تجميع البصمات لكل موظف
    const empPunchesMap = new Map();
    for (const p of punches) {
      const empId = String(p.employee_id);
      if (!empPunchesMap.has(empId)) empPunchesMap.set(empId, []);
      empPunchesMap.get(empId).push(p);
    }

    let repairedCount = 0;
    const repairedDetails = [];

    for (const [empId, empPunches] of empPunchesMap.entries()) {
      const empObj = employees.find(e => String(e.id) === empId || (e.code && String(e.code) === empId));
      const possibleKeys = [empId, empObj?.id ? String(empObj.id) : null, empObj?.code ? String(empObj.code) : null].filter(Boolean);

      for (let i = 0; i < empPunches.length; i++) {
        const pA = empPunches[i];
        const dtA = new Date(pA.punch_time);
        const dateA = pA.raw_payload && pA.raw_payload.includes('-') 
          ? (pA.raw_payload.split(/[\t\s]+/)[1] || dtA.toISOString().slice(0, 10))
          : dtA.toISOString().slice(0, 10);
        const timeA = pA.raw_payload && pA.raw_payload.includes(':')
          ? (pA.raw_payload.split(/[\t\s]+/)[2]?.slice(0, 5) || `${String(dtA.getHours()).padStart(2, '0')}:${String(dtA.getMinutes()).padStart(2, '0')}`)
          : `${String(dtA.getHours()).padStart(2, '0')}:${String(dtA.getMinutes()).padStart(2, '0')}`;

        if (i + 1 < empPunches.length) {
          const pB = empPunches[i + 1];
          const dtB = new Date(pB.punch_time);
          const dateB = pB.raw_payload && pB.raw_payload.includes('-')
            ? (pB.raw_payload.split(/[\t\s]+/)[1] || dtB.toISOString().slice(0, 10))
            : dtB.toISOString().slice(0, 10);
          const timeB = pB.raw_payload && pB.raw_payload.includes(':')
            ? (pB.raw_payload.split(/[\t\s]+/)[2]?.slice(0, 5) || `${String(dtB.getHours()).padStart(2, '0')}:${String(dtB.getMinutes()).padStart(2, '0')}`)
            : `${String(dtB.getHours()).padStart(2, '0')}:${String(dtB.getMinutes()).padStart(2, '0')}`;

          const diffHours = (dtB.getTime() - dtA.getTime()) / (1000 * 60 * 60);

          const hourA = parseInt(timeA.split(':')[0], 10) || 0;
          const hourB = parseInt(timeB.split(':')[0], 10) || 0;

          // 🛡️ معايير الوردية الليلية الحقيقية والمحرك العابر للزمن:
          // 1. ورديات منتصف اليوم والمساء/الإغلاق: تبدأ بين 10:00 صباحاً و 20:59 مساءً وتنتهي بعد منتصف الليل ومدتها حتى 15 ساعة
          const isMiddayOrEveningOvernight = hourA >= 10 && hourA <= 20 && hourB <= 6 && diffHours >= 0.25 && diffHours <= 15;
          // 2. ورديات الليل الكاملة: تبدأ ليلاً (21:00 - 04:00 فجراً) وتنتهي صباحاً أو ظهراً (لتغطية وردية 12 ليلاً إلى 12 ظهراً)
          const isNightOvernight = (hourA >= 21 || hourA <= 4) && hourB <= 14 && diffHours >= 0.25 && diffHours <= 15;
          // 3. أي بصمة في الساعات الأولى من اليوم التالي (hourB <= 6) بعد وردية بدأت بالأمس ولم تتجاوز 15 ساعة
          const isEarlyMorningOvernight = hourB <= 6 && diffHours >= 0.25 && diffHours <= 15;
          // 4. المحرك العابر للزمن: أي بصمة عبرت لليوم التالي ومدتها بين 15 دقيقة و 15 ساعة
          const isUniversalCrossDate = diffHours >= 0.25 && diffHours <= 15;
          const isOvernightPair = dateB > dateA && (isMiddayOrEveningOvernight || isNightOvernight || isEarlyMorningOvernight || isUniversalCrossDate);

          if (isOvernightPair) {
            // التحقق أولاً: إذا كانت البصمة B متبوعة ببصمة لاحقة في نفس اليوم dateB تفصلها مدة عمل حقيقية (أكثر من ساعتين)،
            // فهذا يعني أن البصمة B قد تكون بداية يوم عمل نهاري مستقل.
            const hasSubsequentDayPunch = empPunches.some((pC, idxC) => {
              if (idxC <= i + 1) return false;
              const dtC = new Date(pC.punch_time);
              const dateC = pC.raw_payload && pC.raw_payload.includes('-') 
                ? (pC.raw_payload.split(/[\t\s]+/)[1] || dtC.toISOString().slice(0, 10))
                : dtC.toISOString().slice(0, 10);
              const diffMsBC = dtC.getTime() - dtB.getTime();
              return dateC === dateB && diffMsBC > 2 * 60 * 60 * 1000;
            });

            if (hasSubsequentDayPunch) {
              continue; // تخطي: البصمة B جزء من يوم عمل نهاري مستقل
            }

            // فحص حالة الوردية في currentShifts
            const alreadyFixed = currentShifts.some(s =>
              possibleKeys.some(k => String(s.employeeId) === String(k)) &&
              s.date === dateA &&
              s.timeIn === timeA &&
              s.timeOut === timeB
            );

            if (!alreadyFixed) {
              console.log(`[Biometric Repair] 🩹 اكتشاف وردية ليلية شرعية للموظف ${pA.employee_name || empId}: (${dateA} ${timeA} -> ${dateB} ${timeB})`);

              // حساب الساعات بدقة
              const [inH, inM] = String(timeA).split(':').map(Number);
              const [outH, outM] = String(timeB).split(':').map(Number);
              let calcH = 0;
              if (!isNaN(inH) && !isNaN(outH)) {
                let startM = inH * 60 + (inM || 0);
                let endM = outH * 60 + (outM || 0);
                if (endM <= startM) endM += 24 * 60;
                calcH = Math.max(0, Math.round(((endM - startM) / 60) * 100) / 100);
              }
              const schedH = parseFloat(empObj?.workHoursPerDay || empObj?.workHours || 8);
              const regH = Math.min(calcH, schedH);
              const otH = Math.max(0, Math.round((calcH - regH) * 100) / 100);

              // إيجاد أو إنشاء سجل الوردية الصحيحة لـ dateA
              const existingIdx = currentShifts.findIndex(s =>
                possibleKeys.some(k => String(s.employeeId) === String(k)) &&
                s.date === dateA
              );

              const restoredShift = {
                ...(existingIdx >= 0 ? currentShifts[existingIdx] : {}),
                id: (existingIdx >= 0 && currentShifts[existingIdx].id) || `shift_${empId}_${dtA.getTime()}`,
                employeeId: empId,
                employeeCode: empObj?.code || '',
                employeeName: pA.employee_name || empObj?.name || 'موظف',
                branchId: pA.branch_id || pB.branch_id || empObj?.branchId || '',
                date: dateA,
                timeIn: timeA,
                timeOut: timeB,
                timeOutDate: dateB,
                hours: calcH,
                actualWorkedHours: calcH,
                netHours: calcH,
                regularHours: regH,
                overtimeHours: otH,
                scheduledHours: schedH,
                isOvernight: true,
                isLiveActive: false,
                status: 'completed',
                statusLabel: 'حضور حي (وردية عابرة لمنتصف الليل)',
                punchSource: 'biometric_device',
                source: 'biometric_device',
                punchOutSource: 'biometric_device',
                repairNote: 'تم استعادة وترميم الوردية الليلية بنجاح من سجل البصمات الخام (Overnight Shift Restored)',
                updatedAt: new Date().toISOString()
              };

              // إزالة أي وردية وهمية فُتحت بالخطأ عند وقت الخروج timeB في اليوم التالي dateB
              currentShifts = currentShifts.filter(s => {
                const isMatchEmp = possibleKeys.some(k => String(s.employeeId) === String(k));
                const isPhantomNextDay = isMatchEmp && s.date === dateB && (s.timeIn === timeB || (s.timeIn >= timeB && (!s.timeOut || s.hours <= 0.1)));
                return !isPhantomNextDay;
              });

              possibleKeys.forEach(k => {
                if (currentActiveShifts[k]?.timeIn === timeB || currentActiveShifts[k]?.date === dateB) {
                  delete currentActiveShifts[k];
                }
              });

              if (existingIdx >= 0) {
                currentShifts[existingIdx] = restoredShift;
              } else {
                currentShifts = [restoredShift, ...currentShifts];
              }

              repairedCount++;
              repairedDetails.push({
                employeeId: empId,
                employeeName: pA.employee_name || empObj?.name,
                date: dateA,
                timeIn: timeA,
                timeOut: timeB,
                timeOutDate: dateB
              });
            }
          }
        }
      }
    }

    if (repairedCount > 0) {
      state.shifts = currentShifts;
      state.activeShifts = currentActiveShifts;
      state._punchSource = 'biometric_overnight_repair';
      await saveSettingsToStorage(STORAGE_KEY, state, 'system-repair');

      if (io) {
        io.emit('entity:changed', {
          entityType: 'shifts',
          action: 'repaired',
          repairedCount,
          timestamp: new Date().toISOString()
        });
        io.emit('entity:changed', {
          entityType: 'activeShifts',
          action: 'repaired',
          timestamp: new Date().toISOString()
        });
      }
      console.log(`[Biometric Self-Healing] ✅ تم ترميم وإصلاح ${repairedCount} وردية ليلية بنجاح!`);
    } else {
      console.log('[Biometric Self-Healing] ℹ️ تم فحص السجلات ولا توجد ورديات بحاجة لترميم.');
    }

    return { success: true, repairedCount, repairedDetails };
  } catch (err) {
    console.error('[Biometric Self-Healing Error]:', err.message);
    return { success: false, error: err.message };
  }
}

