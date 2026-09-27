/**
 * server/biometric-manager.js
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚀 محرك إدارة واستقبال أجهزة البصمة الحيوية (Native ADMS / Cloud Push Engine)
 * يدعم بروتوكولات ZKTeco (MB20 / iClock / Face / Fingerprint) بشكل مباشر
 * دون الحاجة لأي برامج وسيطة، وبأعلى سرعة معالجة لحظية (< 20ms).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import express from 'express';

let globalDb = null;

export async function initBiometricTables(db) {
  if (!db) return;
  globalDb = db;
  try {
    const ddl = `
      -- 1. جدول أجهزة البصمة المتصلة بالسحابة
      CREATE TABLE IF NOT EXISTS public.biometric_devices (
          id VARCHAR(36) PRIMARY KEY,
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
          id VARCHAR(36) PRIMARY KEY,
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
    `;

    await db.query(ddl);
    console.log('📡 [Biometric Manager] جداول أجهزة البصمة والخزنة البيومترية وطابور الأوامر الدائم مفهرسة ومجهزة بنجاح.');
  } catch (err) {
    console.error('❌ [Biometric Init Tables Error]:', err.message);
  }
}

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
  // 1. إضافة للذاكرة المؤقتة للاستجابة اللحظية
  const list = deviceCommandQueues.get(serialNumber) || [];
  list.push(cmdString);
  deviceCommandQueues.set(serialNumber, list);

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
// 🚀 تسجيل مسارات ADMS ومسارات الواجهة البرمجية (Routes Registration)
// ══════════════════════════════════════════════════════════════════════════════
export function registerBiometricRoutes(app, db, io, redis, getSettingsFromStorage, saveSettingsToStorage, internalRecordPunch) {
  const STORAGE_KEY = 'pharmacy-tracker-data';

  // دالة مساعدة لتسجيل أو تحديث نبض الجهاز في قاعدة البيانات
  async function updateDeviceHeartbeat(sn, clientIp, options = {}) {
    if (!sn) return null;
    try {
      const now = new Date().toISOString();
      const existingRes = await db.query('SELECT * FROM public.biometric_devices WHERE serial_number = $1', [sn]);
      if (existingRes.rows && existingRes.rows.length > 0) {
        await db.query(
          `UPDATE public.biometric_devices 
           SET status = 'ONLINE', last_heartbeat = $1, ip_address = COALESCE($2, ip_address), updated_at = $1 
           WHERE serial_number = $3`,
          [now, clientIp, sn]
        );
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
          [newId, devName, sn, clientIp, now, options.firmware || '8.0.4.3']
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

      if (line.includes('=')) {
        const parts = line.split(/[\t\r\n\s]+/);
        const kv = {};
        parts.forEach(p => {
          const eqIdx = p.indexOf('=');
          if (eqIdx > 0) {
            const k = p.slice(0, eqIdx).trim().toLowerCase();
            const v = p.slice(eqIdx + 1).trim();
            kv[k] = v;
          }
        });

        pin = kv.pin || '';
        fingerId = parseInt(kv.index || kv.fid || kv.fingerid || '0', 10);
        size = parseInt(kv.size || '0', 10);
        valid = parseInt(kv.valid || '1', 10);
        type = parseInt(kv.type || '1', 10);
        majorVer = kv.majorver || '10';
        templateData = kv.tmp || kv.template || '';
      } else {
        const tokens = line.split(/[\t\s]+/);
        if (tokens.length >= 5) {
          pin = tokens[0];
          fingerId = parseInt(tokens[1] || '0', 10);
          size = parseInt(tokens[2] || '0', 10);
          valid = parseInt(tokens[3] || '1', 10);
          templateData = tokens[4];
        }
      }

      if (!pin || !templateData) continue;

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

      await db.query(
        `INSERT INTO public.biometric_templates 
         (id, employee_id, device_user_pin, template_type, finger_id, size, valid, major_ver, template_data, source_device_sn, source_branch_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
         ON CONFLICT (device_user_pin, template_type, finger_id) DO UPDATE SET
           template_data = EXCLUDED.template_data,
           size = EXCLUDED.size,
           valid = EXCLUDED.valid,
           major_ver = EXCLUDED.major_ver,
           source_device_sn = EXCLUDED.source_device_sn,
           source_branch_id = EXCLUDED.source_branch_id,
           employee_id = COALESCE(EXCLUDED.employee_id, biometric_templates.employee_id),
           updated_at = CURRENT_TIMESTAMP`,
        [tplId, matchedEmpId, pin, templateType, fingerId, size, valid, majorVer, templateData, sn, devObj?.branch_id || null]
      );

      savedCount++;

      io.emit('biometric:template_vaulted', {
        pin,
        employeeId: matchedEmpId,
        employeeName: matchedEmpName,
        templateType,
        fingerId,
        sourceDeviceSn: sn,
        sourceBranchName: devObj?.branch_name || 'الإدارة',
        timestamp: new Date().toISOString()
      });

      console.log(`[Biometric Vault] 🧬 تم حفظ قالب بيومتري (${templateType} #${fingerId}) للموظف (${matchedEmpName || pin}) من جهاز ${sn}`);
    }

    return savedCount;
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
      const responseConfig = [
        `GET OPTION FROM: ${sn}`,
        'Stamp=9999',
        'OpStamp=9999',
        'ErrorDelay=5',
        'Delay=5',
        'TransTimes=00:00;23:59',
        'TransInterval=1',
        'TransFlag=1111111111',
        'TimeZone=3',
        'Realtime=1',
        'Encrypt=0',
        'ServerVer=2.4.1',
        `PushProtVer=${pushver}`
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
      const sn = (req.query.SN || req.query.sn || '').trim();
      const table = (req.query.table || req.query.Table || 'ATTLOG').toUpperCase();
      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

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
        // في حال تم تحليله عبر form-urlencoded
        rawBody = Object.keys(req.body)[0] || '';
        if (typeof req.body.data === 'string') rawBody = req.body.data;
      }

      if (table === 'BIODATA' || table === 'FINGERTMP' || table === 'FACETMP') {
        const count = await parseAndStoreBiometricTemplate(sn, table, rawBody, devObj);
        console.log(`[Biometric Manager] 🧬 تم استلام وحفظ ${count} قالب بيومتري من جهاز (SN: ${sn})`);
        return res.status(200).send(`OK: ${count}`);
      }

      if (table !== 'ATTLOG') {
        // إذا كان جدول العمليات OPERLOG أو جدول المستخدمين
        console.log(`[ADMS Info] Received table: ${table} from ${sn}`);
        return res.status(200).send('OK');
      }

      const lines = rawBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        return res.status(200).send('OK: 0');
      }

      console.log(`[Biometric Manager] 📥 استلام ${lines.length} حركة بصمة حية من جهاز MB20 (SN: ${sn})`);

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
      const employees = Array.isArray(state?.employees) ? state.employees : [];
      const currentActiveShifts = { ...(state?.activeShifts || {}) };
      let currentShifts = [...(state?.shifts || [])];

      let processedCount = 0;

      for (const line of lines) {
        // صيغة السجل المعتمدة في ZKTeco:
        // PIN \t DateTime \t Status \t VerifyType \t WorkCode \t Reserved
        // مثال: 107 \t 2026-09-27 08:05:20 \t 0 \t 1 \t 0 \t 0
        const tokens = line.split(/[\t\s]+/);
        if (tokens.length < 2) continue;

        const pin = tokens[0].trim();
        const punchDateTimeStr = tokens.length >= 3 && tokens[1].includes('-') && tokens[2].includes(':')
          ? `${tokens[1]} ${tokens[2]}`
          : tokens[1];

        const rawState = parseInt(tokens[2] || '0', 10);
        const rawVerifyType = parseInt(tokens[3] || '1', 10);

        // تصنيف وسيلة التحقق
        const verifyType = rawVerifyType === 15 || rawVerifyType === 20 ? 'FACE' : 'FINGERPRINT';

        // استخراج التاريخ والوقت والتوقيت الأيبوكي الفعلي للبصمة
        let datePart = new Date().toISOString().slice(0, 10);
        let timePart = new Date().toTimeString().slice(0, 5);
        let punchEpoch = Date.now();

        try {
          const parsed = new Date(punchDateTimeStr);
          if (!isNaN(parsed.getTime())) {
            datePart = parsed.toISOString().slice(0, 10);
            timePart = punchDateTimeStr.slice(11, 16);
            punchEpoch = parsed.getTime();
          }
        } catch {}

        // 1. البحث الفوري عن الموظف المطابق لـ PIN من الذاكرة المجمعة (< 0.1ms)
        let matchedEmpId = profilesMap.get(pin) || null;
        let matchedEmpName = null;
        let matchedBranchId = devObj?.branch_id || '';

        // ب. إذا لم يوجد في جدول الربط، فحص قائمة الموظفين في الـ HR
        if (!matchedEmpId) {
          const emp = employees.find(e =>
            String(e.code || '').trim() === pin ||
            String(e.id || '').trim() === pin ||
            String(e.enrollmentId || '').trim() === pin ||
            String(e.biometricPin || '').trim() === pin
          );
          if (emp) {
            matchedEmpId = emp.id;
            matchedEmpName = emp.name;
            if (emp.branchId) matchedBranchId = emp.branchId;
          }
        } else {
          const emp = employees.find(e => String(e.id) === String(matchedEmpId));
          if (emp) {
            matchedEmpName = emp.name;
            if (emp.branchId) matchedBranchId = emp.branchId;
          }
        }

        // 2. إذا كان الموظف غير معرف بعد في النظام:
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

        // 3. درع منع التكرار المتوتر بالزمن الفعلي للبصمة (Debounce Protection: 45 ثانية)
        if (isDebounced(matchedEmpId, punchEpoch, 45000)) {
          console.log(`[Biometric Debounce] تم صيانة بصمة سريعة مكررة للموظف ${matchedEmpName || matchedEmpId} (ضمن 45 ثانية من نفس البصمة)`);
          await db.query(
            `INSERT INTO public.biometric_raw_punches 
             (device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, process_notes, raw_payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ignored_duplicate', 'DUPLICATE', 'تكرار بصمة سريع غير مقصود تم صده لحماية الوردية', $9)`,
            [sn, pin, `${datePart} ${timePart}:00`, verifyType, rawState, matchedEmpId, matchedEmpName, matchedBranchId, line]
          );
          processedCount++;
          continue;
        }

        // 4. خوارزمية التوجيه الذكي للوردية (Smart Shift Direction Prediction)
        const activeShift = currentActiveShifts[matchedEmpId];
        let actionType = 'check_in';

        if (activeShift && activeShift.date === datePart) {
          // الموظف لديه وردية نشطة اليوم: نقارن بالزمن الفعلي للبصمة مقابل وقت بدء الوردية
          const shiftStartEpoch = Number(activeShift.startEpoch) || (activeShift.timeIn ? new Date(`${datePart}T${activeShift.timeIn.slice(0,5)}:00`).getTime() : punchEpoch);
          const shiftDurationMs = punchEpoch - shiftStartEpoch;
          // إذا كانت الوردية مفتوحة منذ أكثر من دقيقتين -> تعتبر انصرافاً
          if (shiftDurationMs > 2 * 60 * 1000) {
            actionType = 'check_out';
          } else {
            console.log(`[Biometric Resolver] الموظف ${matchedEmpName} سجل حضوراً للتو منذ ${Math.round(shiftDurationMs / 60000)} دقيقة.`);
            actionType = 'check_in';
          }
        } else {
          // لا توجد وردية نشطة -> تسجيل حضور جديد
          actionType = 'check_in';
        }

        // 5. تطبيق الحركة عبر المحرك الذري القائم
        const shiftId = activeShift?.shiftId || `shift_${matchedEmpId}_${punchEpoch}`;
        const shiftRecord = {
          id: shiftId,
          employeeId: matchedEmpId,
          employeeName: matchedEmpName,
          date: datePart,
          timeIn: actionType === 'check_in' ? timePart : (activeShift?.timeIn || timePart),
          timeOut: actionType === 'check_out' ? timePart : '',
          branchId: matchedBranchId,
          isLiveActive: actionType === 'check_in',
          status: actionType === 'check_in' ? 'active' : 'completed',
          punchSource: 'biometric_device',
          biometricDeviceSerial: sn,
          verifyType
        };

        if (actionType === 'check_in') {
          currentActiveShifts[matchedEmpId] = {
            shiftId,
            branchId: matchedBranchId,
            date: datePart,
            timeIn: timePart,
            startEpoch: punchEpoch,
            isPaused: false,
            isOnBreak: false,
            updatedAt: punchEpoch,
            biometricDeviceSerial: sn
          };
          currentShifts = [shiftRecord, ...currentShifts.filter(s => s.id !== shiftId)];
        } else {
          delete currentActiveShifts[matchedEmpId];
          const existIdx = currentShifts.findIndex(s => s.id === shiftId || (s.employeeId === matchedEmpId && s.date === datePart && (!s.timeOut || s.isLiveActive)));
          if (existIdx >= 0) {
            currentShifts[existIdx] = {
              ...currentShifts[existIdx],
              timeOut: timePart,
              isLiveActive: false,
              status: 'completed',
              updatedAt: new Date().toISOString()
            };
          } else {
            currentShifts = [shiftRecord, ...currentShifts];
          }
        }

        // حفظ في الـ Raw Log
        await db.query(
          `INSERT INTO public.biometric_raw_punches 
           (device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, employee_id, employee_name, branch_id, action_type, process_status, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSED', $10)`,
          [sn, pin, `${datePart} ${timePart}:00`, verifyType, rawState, matchedEmpId, matchedEmpName, matchedBranchId, actionType, line]
        );

        // 6. بث لحظي فائق الخفة عبر Socket.io (Micro-Event Broadcast < 1KB)
        const punchPayload = {
          employeeId: matchedEmpId,
          employeeName: matchedEmpName,
          branchId: matchedBranchId,
          actionType,
          date: datePart,
          time: timePart,
          verifyType,
          source: 'biometric_device',
          deviceSerial: sn,
          deviceName: devObj?.device_name || 'ZKTeco MB20',
          activeShifts: currentActiveShifts,
          shiftRecord,
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

        console.log(`[Biometric Manager] ✅ تم تسجيل البصمة بنجاح: ${actionType} للموظف ${matchedEmpName} (${timePart} - ${verifyType})`);
        processedCount++;
      }

      // 7. حفظ التحديثات في Redis و PostgreSQL بهدوء فائق وسرعة دون بث عاصفة الـ 4.2MB
      state.activeShifts = currentActiveShifts;
      state.shifts = currentShifts;
      state._punchSource = 'biometric_adms';
      await saveSettingsToStorage(STORAGE_KEY, state, 'batch-worker');

      // الرد على ماكينة ZKTeco بالتأكيد
      return res.status(200).send(`OK: ${processedCount}`);
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
      if (!sn) return res.status(200).send('OK');

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
        return res.status(200).send(payload);
      }

      return res.status(200).send('OK');
    } catch (err) {
      console.error('[ADMS getrequest Error]:', err);
      return res.status(200).send('OK');
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 4. معالج تأكيد تنفيذ الأوامر من الجهاز (POST /iclock/devicecmd)
  // ────────────────────────────────────────────────────────────────────────────
  const handleAdmsDeviceCmd = async (req, res) => {
    try {
      const sn = (req.query.SN || req.query.sn || '').trim();
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

      return res.status(200).send('OK');
    } catch (err) {
      console.error('[ADMS devicecmd Error]:', err);
      return res.status(200).send('OK');
    }
  };

  // ── تسجيل مسارات ADMS لكافة احتمالات الروابط في الـ Firmware ────────────────
  const admsCDataRoutes = ['/iclock/cdata', '/cdata', '/api/biometrics/adms/cdata'];
  const admsGetRequestRoutes = ['/iclock/getrequest', '/getrequest', '/api/biometrics/adms/getrequest'];
  const admsDeviceCmdRoutes = ['/iclock/devicecmd', '/devicecmd', '/api/biometrics/adms/devicecmd'];
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

  admsFDataRoutes.forEach(r => {
    app.get(r, (req, res) => res.status(200).send('OK'));
    app.post(r, (req, res) => res.status(200).send('OK'));
  });

  admsPingRoutes.forEach(r => {
    app.all(r, (req, res) => res.status(200).send('OK'));
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 🚀 مسارات التحكم البرمجي للواجهة الأمامية (Admin REST API)
  // ══════════════════════════════════════════════════════════════════════════════

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
      targetEmps.forEach((emp, index) => {
        const pin = profilesMap.get(String(emp.id)) || emp.code || emp.id;
        if (!pin) return;
        const cleanName = (emp.name || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);

        // أمر ZKTeco ADMS القياسي لتحديث مستخدم:
        // C:seq:DATA UPDATE USER PIN=107\tName=Ahmed Khaled\tPri=0\tPasswd=\tCard=
        const cmdId = Date.now() + index;
        const cmd = `C:${cmdId}:DATA UPDATE USER PIN=${pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=`;
        queueDeviceCommand(serialNumber, cmd);
        count++;
      });

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

  // 1.5 سحب قوالب البصمات من ذاكرة الجهاز إلى الخزنة السحابية (Pull Templates)
  app.post('/api/biometrics/devices/:serialNumber/pull-templates', async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const cmd1 = `C:${Date.now()}:DATA QUERY USERINFO`;
      const cmd2 = `C:${Date.now() + 1}:DATA QUERY FINGERTMP`;
      const cmd3 = `C:${Date.now() + 2}:DATA QUERY BIODATA Type=1`;
      queueDeviceCommand(serialNumber, cmd1);
      queueDeviceCommand(serialNumber, cmd2);
      queueDeviceCommand(serialNumber, cmd3);
      res.json({
        success: true,
        message: `تم إرسال أمر سحب واستيراد كافة قوالب البصمات من جهاز (${serialNumber}) إلى الخزنة السحابية`
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
          const cmdUser = `C:${Date.now() + i}:DATA UPDATE USER PIN=${pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=`;
          queueDeviceCommand(targetSn, cmdUser);
          totalDispatchedUsers++;

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
      const { employeeId, hqDeviceSerial } = req.body;
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

      const cleanName = (emp.name || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);

      // 1. دفع المستخدم لماكينة الإدارة
      const cmdUser = `C:${Date.now()}:DATA UPDATE USER PIN=${pin}\tName=${cleanName}\tPri=0\tPasswd=\tCard=`;
      queueDeviceCommand(hqDeviceSerial, cmdUser);

      // 2. أمر تنشيط تسجيل البصمة على الماكينة
      const cmdEnroll = `C:${Date.now() + 1}:ENROLL_FP PIN=${pin}\tFID=0`;
      queueDeviceCommand(hqDeviceSerial, cmdEnroll);

      res.json({
        success: true,
        message: `تم إرسال بيانات (${emp.name}) لماكينة الإدارة بنجاح برقم PIN (${pin}). يرجى توجيهه لوضع إصبعه 3 مرات على حساس الماكينة ليتم سحب قالبه البيومتري تلقائياً للسحابة!`,
        pin,
        employeeName: emp.name
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
      res.json({ success: true, templates: q.rows || [] });
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
      // تنسيق أمر ZKTeco لضبط الساعة
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const cmd = `C:1:SET OPTIONS DateTime=${timeStr}`;
      queueDeviceCommand(serialNumber, cmd);
      res.json({ success: true, message: `Command queued for ${serialNumber}`, command: cmd });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log('📡 [Biometric Manager] مسارات ADMS ومسارات الواجهة البرمجية للأجهزة مسجلة بنجاح.');
}
