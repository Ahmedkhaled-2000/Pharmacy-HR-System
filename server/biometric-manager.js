/**
 * server/biometric-manager.js
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚀 محرك إدارة واستقبال أجهزة البصمة الحيوية (Native ADMS / Cloud Push Engine)
 * يدعم بروتوكولات ZKTeco (MB20 / iClock / Face / Fingerprint) بشكل مباشر
 * دون الحاجة لأي برامج وسيطة، وبأعلى سرعة معالجة لحظية (< 20ms).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import express from 'express';

export async function initBiometricTables(db) {
  if (!db) return;
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
    `;

    await db.query(ddl);
    console.log('📡 [Biometric Manager] جداول أجهزة البصمة (MB20 / ADMS) مفهرسة ومجهزة بنجاح.');
  } catch (err) {
    console.error('❌ [Biometric Init Tables Error]:', err.message);
  }
}

// ── ذاكرة سريعة لحماية التكرار المتوتر (Debounce Cache: 60 ثانية) ─────────────
const recentPunchDebounce = new Map(); // key: `emp_${employeeId}` => timestamp

function isDebounced(empId, windowMs = 60000) {
  const key = `emp_${empId}`;
  const now = Date.now();
  const lastTime = recentPunchDebounce.get(key) || 0;
  if (now - lastTime < windowMs) {
    return true;
  }
  recentPunchDebounce.set(key, now);
  // تنظيف دوري للذاكرة المؤقتة كل 100 مفتاح
  if (recentPunchDebounce.size > 500) {
    for (const [k, ts] of recentPunchDebounce.entries()) {
      if (now - ts > windowMs) recentPunchDebounce.delete(k);
    }
  }
  return false;
}

// ── طابور أوامر الأجهزة (Device Command Queue) ───────────────────────────────
const deviceCommandQueues = new Map(); // key: serialNumber => Array of command strings

export function queueDeviceCommand(serialNumber, cmdString) {
  if (!serialNumber || !cmdString) return;
  const list = deviceCommandQueues.get(serialNumber) || [];
  list.push(cmdString);
  deviceCommandQueues.set(serialNumber, list);
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

        // استخراج التاريخ والوقت
        let datePart = new Date().toISOString().slice(0, 10);
        let timePart = new Date().toTimeString().slice(0, 5);

        try {
          const parsed = new Date(punchDateTimeStr);
          if (!isNaN(parsed.getTime())) {
            datePart = parsed.toISOString().slice(0, 10);
            timePart = punchDateTimeStr.slice(11, 16);
          }
        } catch {}

        // 1. البحث عن الموظف المطابق لـ PIN
        // أ. فحص جدول ملفات البصمة employee_biometric_profiles
        let matchedEmpId = null;
        let matchedEmpName = null;
        let matchedBranchId = devObj?.branch_id || '';

        const profRes = await db.query(
          'SELECT employee_id FROM public.employee_biometric_profiles WHERE device_user_pin = $1 LIMIT 1',
          [pin]
        );
        if (profRes.rows && profRes.rows.length > 0) {
          matchedEmpId = profRes.rows[0].employee_id;
        }

        // ب. إذا لم يوجد، فحص قائمة الموظفين في الـ HR
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

        // 3. درع منع التكرار المتوتر (Debounce Protection: 60 ثانية)
        if (isDebounced(matchedEmpId, 60000)) {
          console.log(`[Biometric Debounce] تم تجاهل تكرار سريع للبصمة للموظف ${matchedEmpName || matchedEmpId} (خلال 60 ثانية)`);
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
        // فحص هل لدى الموظف وردية نشطة حالياً
        const activeShift = currentActiveShifts[matchedEmpId];
        let actionType = 'check_in';

        if (activeShift && activeShift.date === datePart) {
          // الموظف لديه وردية نشطة اليوم:
          const shiftDurationMs = Date.now() - (activeShift.startEpoch || Date.now());
          // إذا كانت الوردية مفتوحة منذ أكثر من 15 دقيقة -> تعتبر انصرافاً
          if (shiftDurationMs > 15 * 60 * 1000) {
            actionType = 'check_out';
          } else {
            // بصمة بعد الحضور بأقل من 15 دقيقة -> تجاهل ذكي
            console.log(`[Biometric Resolver] الموظف ${matchedEmpName} سجل حضوراً للتو منذ ${Math.round(shiftDurationMs / 60000)} دقيقة.`);
            actionType = 'check_in'; // لا تكسر شيئاً
          }
        } else {
          // لا توجد وردية نشطة -> تسجيل حضور جديد
          actionType = 'check_in';
        }

        // 5. تطبيق الحركة عبر المحرك الذري القائم
        const shiftId = activeShift?.shiftId || `shift_${matchedEmpId}_${Date.now()}`;
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
            startEpoch: Date.now(),
            isPaused: false,
            isOnBreak: false,
            updatedAt: Date.now(),
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

        // 6. بث لحظي عبر Socket.io (Multi-Room Multiplexing < 5ms)
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

      // 7. حفظ التحديثات في Redis و PostgreSQL
      state.activeShifts = currentActiveShifts;
      state.shifts = currentShifts;
      state._punchSource = 'biometric_adms';
      await saveSettingsToStorage(STORAGE_KEY, state, clientIp);

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

      const queue = deviceCommandQueues.get(sn) || [];
      if (queue.length > 0) {
        const nextCmd = queue.shift();
        deviceCommandQueues.set(sn, queue);
        console.log(`[Biometric Manager] 📤 إرسال أمر للجهاز ${sn}: ${nextCmd}`);
        return res.status(200).send(nextCmd);
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
      return res.status(200).send('OK');
    } catch {
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
      res.json({ success: true, devices: q.rows || [] });
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
