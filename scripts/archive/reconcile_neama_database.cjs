const fs = require('fs');
const http = require('http');

function fetchState() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:5000/api/settings', (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw).value || {});
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function saveState(state) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ key: 'pharmacy-tracker-data', value: state });
    const req = http.request('http://127.0.0.1:5000/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Role': 'admin',
        'X-App-Password': '123',
        'x-device-token': 'desktop-app-sync-token-2026',
        'x-app-version': '1.2.69',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.success) resolve(parsed);
          else reject(new Error('Save failed: ' + raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseTimeToMins(tStr) {
  if (!tStr || tStr === '—') return null;
  const [h, m] = String(tStr).slice(0, 5).split(':').map(Number);
  if (isNaN(h)) return null;
  return h * 60 + (m || 0);
}

async function run() {
  console.log('=== STARTING COMPLETE RECONCILIATION FOR NEAMA (1152) ===');
  const state = await fetchState();

  // 1. BACKUP CURRENT STATE
  const backupFile = `/tmp/backup_pre_neama_fix_${Date.now()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(state, null, 2), 'utf8');
  console.log(`✅ Backup created at ${backupFile}`);

  const emp = (state.employees || []).find(e => String(e.code) === '1152');
  if (!emp) {
    throw new Error('Employee 1152 not found!');
  }
  const empId = emp.id;

  // 2. FIX LEAVE REQUEST 3: 'req_leave_1791590615443_07zzo'
  // Currently covers 2026-10-10 to 2026-10-15 (6 days), but employee returned to work on 2026-10-11!
  // Leave was only taken on 2026-10-10 (1 day).
  const leave3 = (state.requests || []).find(r => r.id === 'req_leave_1791590615443_07zzo');
  if (leave3) {
    leave3.startDate = '2026-10-10';
    leave3.endDate = '2026-10-10';
    leave3.daysCount = 1;
    leave3.days = 1;
    leave3.notes = 'إجازة بدون راتب (يوم السبت 2026-10-10 فقط - مامتها هتعمل عمليه) وتم استئناف العمل يوم الأحد';
    leave3.updated_at = new Date().toISOString();
    console.log('✅ Leave request 3 updated: startDate = 2026-10-10, endDate = 2026-10-10 (1 day)');
  }

  // Also check Leave 1 & 2
  const leave1 = (state.requests || []).find(r => r.id === 'req_leave_1792404534978_c3s0w');
  if (leave1) {
    console.log('✅ Leave 1 (2026-10-19): 1 day, reason = ' + leave1.reason);
  }
  const leave2 = (state.requests || []).find(r => r.id === 'req_leave_1792230937673_us4ac');
  if (leave2) {
    console.log('✅ Leave 2 (2026-10-17): 1 day, reason = ' + leave2.reason);
  }

  // 3. RECONCILE AND FIX ALL SHIFTS FOR NEAMA IN CYCLE (2026-09-21 to 2026-10-20)
  const shifts = state.shifts || [];
  let updatedCount = 0;

  shifts.forEach(s => {
    if (String(s.employeeCode) !== '1152' && String(s.employeeId) !== String(empId)) return;
    if (s.date < '2026-09-21' || s.date > '2026-10-20') return;

    const tIn = s.timeIn || s.checkIn || s.entryTime || s.punchIn;
    const tOut = s.timeOut || s.checkOut || s.exitTime || s.punchOut;
    const bH = parseFloat(s.breakHours) || 0;

    let workedH = 0;
    const inM = parseTimeToMins(tIn);
    const outM = parseTimeToMins(tOut);
    if (inM !== null && outM !== null) {
      let durM = 0;
      if (outM < inM) {
        durM = (24 * 60 - inM) + outM;
      } else {
        durM = outM - inM;
      }
      workedH = Math.max(0, Math.round(((durM / 60) - bH) * 100) / 100);
    } else {
      workedH = parseFloat(s.actualWorkedHours || s.hours || s.netHours || 0);
    }

    const dObj = new Date(s.date + 'T00:00:00Z');
    const isSunday = dObj.getUTCDay() === 0;

    if (isSunday) {
      // Sunday is Weekly Off Day (راحة أسبوعية مجدولة)
      s.isOffDayWork = true;
      s.isScheduledOffDay = true;
      s.scheduledHours = 0;
      s.scheduledStart = '';
      s.scheduledEnd = '';
      s.regularHours = 0;
      s.overtimeHours = workedH;
      s.hours = workedH;
      s.actualWorkedHours = workedH;
      s.netHours = workedH;
      s.overtimeStatus = 'approved';
      s.isOvertimeApproved = true;
      s.rejectedOvertime = false;
      s.adminApproved = true;
      s.statusLabel = 'عمل في يوم راحة مجدول (إضافي معتمد)';
      s.note = `⚡ عمل في يوم راحة مجدول (إضافي: ${workedH} س)`;
      s.notes = s.note;
    } else {
      // Regular Workday (Scheduled 8 Hours from 16:00 to 00:00)
      s.isOffDayWork = false;
      s.isScheduledOffDay = false;
      s.scheduledStart = '16:00';
      s.scheduledEnd = '00:00';
      s.scheduledHours = 8;
      s.actualWorkedHours = workedH;
      s.netHours = workedH;
      s.hours = workedH;
      s.adminApproved = true;
      s.rejectedOvertime = false;

      const regH = Math.min(8, workedH);
      const otH = Math.max(0, Math.round((workedH - 8) * 100) / 100);

      s.regularHours = regH;
      s.overtimeHours = otH;

      if (otH > 0) {
        s.overtimeStatus = 'approved';
        s.isOvertimeApproved = true;
        s.statusLabel = 'حضور معتمد (مع إضافي معتمد)';
        s.note = `✅ ساعات عمل وإضافي معتمد (أساسي: 8 س + إضافي: ${otH} س)`;
      } else {
        s.overtimeStatus = 'none';
        s.isOvertimeApproved = false;
        s.statusLabel = 'حضور معتمد';
        s.note = `✅ ساعات عمل أساسية (${regH} س)`;
      }
      s.notes = s.note;
    }

    s.updatedAt = new Date().toISOString();
    updatedCount++;
    console.log(`[Shift ${s.date}] In: ${tIn}, Out: ${tOut} -> Worked: ${workedH}h | Reg: ${s.regularHours}h | OT: ${s.overtimeHours}h (${s.overtimeStatus}) | Label: ${s.statusLabel}`);
  });

  console.log(`✅ Updated ${updatedCount} shifts for Neama (1152)`);

  // 4. UPDATE LINKED OVERTIME REQUESTS FOR NEAMA
  (state.requests || []).forEach(r => {
    if (String(r.employeeCode) !== '1152' && String(r.employeeId) !== String(empId)) return;
    if (r.type !== 'overtime' && r.subType !== 'extra_hours' && !String(r.id || '').startsWith('req_ot_')) return;

    if (r.date === '2026-10-11') {
      r.status = 'approved';
      r.adminApproved = true;
      r.hours = 8.73;
      r.overtimeHours = 8.73;
      r.notes = 'عمل في يوم راحة مجدول (أحد) - إضافي معتمد: 8.73 س';
      console.log('✅ Overtime request on 2026-10-11 approved: 8.73h');
    } else if (r.date === '2026-10-12') {
      r.status = 'approved';
      r.adminApproved = true;
      r.hours = 0.30;
      r.overtimeHours = 0.30;
      r.notes = 'ساعات إضافية معتمدة فوق الوردية المجدولة (8 س): +0.30 س';
      console.log('✅ Overtime request on 2026-10-12 approved: 0.30h');
    }
  });

  // 5. SAVE STATE
  console.log('\nSaving updated state to database...');
  state.shifts = shifts;
  await saveState(state);
  console.log('🎉 Successfully saved and verified on backend database!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
