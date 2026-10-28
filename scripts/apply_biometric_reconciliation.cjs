const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';

const reconciliationLogic = `
const Redis = require('ioredis');
const { Pool } = require('pg');

async function run() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const pool = new Pool({
    host: process.env.DB_HOST || 'hr-postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres_hr_2026_super_secure'
  });

  console.log('🔄 Loading current state from Redis...');
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);

  state.activeShifts = state.activeShifts || {};
  state.shifts = Array.isArray(state.shifts) ? state.shifts : [];

  // ==========================================
  // 1. ادهم سمير محمد ابراهيم (كود 104)
  // بصمة انصراف 00:22 بتاريخ 2026-10-21
  // ==========================================
  console.log('1. Reconciling Adham Samir (Code 104)...');
  // إغلاق ورديته في shifts
  let adhamShiftFound = false;
  state.shifts = state.shifts.map(s => {
    if ((s.employeeId === 'emp_1789231088793' || String(s.employeeCode) === '104') && s.date === '2026-10-20' && s.timeIn === '14:02') {
      adhamShiftFound = true;
      return {
        ...s,
        timeOut: '00:22',
        timeOutDate: '2026-10-21',
        hours: 10.33,
        actualWorkedHours: 10.33,
        netHours: 10.33,
        regularHours: 10,
        overtimeHours: 0.33,
        overtimeStatus: 'pending',
        isLiveActive: false,
        status: 'completed',
        statusLabel: 'حضور حي (وردية عابرة لمنتصف الليل)',
        punchOutSource: 'biometric_device',
        punchOutDeviceSerial: 'EUF7242701802',
        punchOutDeviceName: 'جهاز بصمة منار الكومي',
        punchOutVerifyType: 'FINGERPRINT',
        notes: ((s.notes || '') + ' [انصراف مسجل 00:22 عبر جهاز بصمة منار الكومي]').trim(),
        updatedAt: '2026-10-20T21:22:14.543Z'
      };
    }
    return s;
  });
  // حذفه من activeShifts
  delete state.activeShifts['104'];
  delete state.activeShifts['emp_1789231088793'];
  console.log('   ✅ Adham Samir updated: shift completed (14:02 -> 00:22), removed from activeShifts');

  // ==========================================
  // 2. صبري إبراهيم خليل ابراهيم (كود 102)
  // بصمة حضور 00:28 بتاريخ 2026-10-21
  // ==========================================
  console.log('2. Reconciling Sabry Ibrahim (Code 102)...');
  const sabryShiftId = 'shift_emp_1789143997322_1792531730000';
  const sabryShift = {
    id: sabryShiftId,
    employeeId: 'emp_1789143997322',
    employeeCode: '102',
    employeeName: 'صبري إبراهيم خليل ابراهيم',
    date: '2026-10-21',
    actualPunchDate: '2026-10-21',
    isEarlyOvernightIn: false,
    isPostMidnightInForYesterday: false,
    isOvernight: false,
    timeIn: '00:28',
    timeOut: '',
    branchId: 'branch_1789241974051',
    branchName: 'صيدليه سعيد بكري - قناه السويس',
    actualBranchId: 'branch_1789241974051',
    actualBranchName: 'صيدليه سعيد بكري - قناه السويس',
    primaryBranchId: 'branch_1789241974051',
    primaryBranchName: 'صيدليه سعيد بكري - قناه السويس',
    isCrossBranch: false,
    isCoverageShift: false,
    isFloatingEmp: false,
    isSuspiciousTravel: false,
    isLiveActive: true,
    status: 'active',
    statusLabel: 'حضور حي 🌙 (وردية ليلية بدأت 00:28)',
    punchSource: 'biometric_device',
    source: 'biometric_device',
    biometricDeviceSerial: 'EUF7242701598',
    biometricDeviceName: 'جهاز بصمة سعيد',
    verifyType: 'FINGERPRINT',
    startEpoch: 1792531730000,
    scheduledHours: 8,
    regularHours: 0,
    overtimeHours: 0,
    isOvertimeApproved: false,
    overtimeStatus: 'none',
    hours: 0,
    actualWorkedHours: 0,
    note: '',
    notes: 'تسجيل حضور حي في تمام الساعة 00:28 عبر جهاز بصمة سعيد'
  };

  // إزالة أي وردية مكررة لنفس المعرف إن وجدت ثم إضافتها
  state.shifts = state.shifts.filter(s => s.id !== sabryShiftId);
  state.shifts.unshift(sabryShift);

  const sabryActivePayload = {
    shiftId: sabryShiftId,
    branchId: 'branch_1789241974051',
    branchName: 'صيدليه سعيد بكري - قناه السويس',
    actualBranchId: 'branch_1789241974051',
    actualBranchName: 'صيدليه سعيد بكري - قناه السويس',
    primaryBranchId: 'branch_1789241974051',
    primaryBranchName: 'صيدليه سعيد بكري - قناه السويس',
    isCrossBranch: false,
    isCoverageShift: false,
    isFloatingEmp: false,
    date: '2026-10-21',
    actualPunchDate: '2026-10-21',
    isEarlyOvernightIn: false,
    isPostMidnightInForYesterday: false,
    isOvernight: false,
    timeIn: '00:28',
    startEpoch: 1792531730000,
    isPaused: false,
    isOnBreak: false,
    updatedAt: 1792531730000,
    source: 'biometric_device',
    punchSource: 'biometric_device',
    verifyType: 'FINGERPRINT',
    biometricDeviceSerial: 'EUF7242701598',
    biometricDeviceName: 'جهاز بصمة سعيد'
  };
  state.activeShifts['102'] = sabryActivePayload;
  state.activeShifts['emp_1789143997322'] = sabryActivePayload;
  console.log('   ✅ Sabry Ibrahim updated: active shift added (00:28), added to activeShifts');

  // ==========================================
  // 3. عبد الرحمن حسام الدين جلال (كود 107)
  // بصمة انصراف 01:37 بتاريخ 2026-10-21
  // ==========================================
  console.log('3. Reconciling Abdel Rahman Hossam (Code 107)...');
  state.shifts = state.shifts.map(s => {
    if ((s.employeeId === 'emp_1789231413527' || String(s.employeeCode) === '107') && s.date === '2026-10-20' && s.timeIn === '18:03') {
      return {
        ...s,
        timeOut: '01:37',
        timeOutDate: '2026-10-21',
        hours: 7.57,
        actualWorkedHours: 7.57,
        netHours: 7.57,
        regularHours: 7.57,
        overtimeHours: 0,
        overtimeStatus: 'none',
        isLiveActive: false,
        status: 'completed',
        statusLabel: 'حضور حي (وردية عابرة لمنتصف الليل)',
        punchOutSource: 'biometric_device',
        punchOutDeviceSerial: 'EUF7242701802',
        punchOutDeviceName: 'جهاز بصمة منار الكومي',
        punchOutVerifyType: 'FINGERPRINT',
        notes: ((s.notes || '') + ' [انصراف مسجل 01:37 عبر جهاز بصمة منار الكومي]').trim(),
        updatedAt: '2026-10-20T22:37:31.383Z'
      };
    }
    return s;
  });
  delete state.activeShifts['107'];
  delete state.activeShifts['emp_1789231413527'];
  console.log('   ✅ Abdel Rahman Hossam updated: shift completed (18:03 -> 01:37), removed from activeShifts');

  // ==========================================
  // 4. على شعبان عباس سليمان (كود 115)
  // بصمة حضور 01:37 بتاريخ 2026-10-21
  // ==========================================
  console.log('4. Reconciling Ali Shaaban (Code 115)...');
  const aliShiftId = 'shift_emp_1789242190413_1792535824000';
  const aliShift = {
    id: aliShiftId,
    employeeId: 'emp_1789242190413',
    employeeCode: '115',
    employeeName: 'على شعبان عباس سليمان',
    date: '2026-10-21',
    actualPunchDate: '2026-10-21',
    isEarlyOvernightIn: false,
    isPostMidnightInForYesterday: false,
    isOvernight: false,
    timeIn: '01:37',
    timeOut: '',
    branchId: 'branch_1789142992139',
    branchName: 'منار الكومي-الحضره الجديده',
    actualBranchId: 'branch_1789142992139',
    actualBranchName: 'منار الكومي-الحضره الجديده',
    primaryBranchId: 'branch_1789142992139',
    primaryBranchName: 'منار الكومي-الحضره الجديده',
    isCrossBranch: false,
    isCoverageShift: false,
    isFloatingEmp: false,
    isSuspiciousTravel: false,
    isLiveActive: true,
    status: 'active',
    statusLabel: 'حضور حي 🌙 (وردية بدأت 01:37)',
    punchSource: 'biometric_device',
    source: 'biometric_device',
    biometricDeviceSerial: 'EUF7242701802',
    biometricDeviceName: 'جهاز بصمة منار الكومي',
    verifyType: 'FINGERPRINT',
    startEpoch: 1792535824000,
    scheduledHours: 8,
    regularHours: 0,
    overtimeHours: 0,
    hours: 0,
    actualWorkedHours: 0,
    notes: 'تسجيل حضور حي في تمام الساعة 01:37 عبر جهاز بصمة منار الكومي'
  };
  state.shifts = state.shifts.filter(s => s.id !== aliShiftId);
  state.shifts.unshift(aliShift);

  const aliActivePayload = {
    shiftId: aliShiftId,
    branchId: 'branch_1789142992139',
    branchName: 'منار الكومي-الحضره الجديده',
    actualBranchId: 'branch_1789142992139',
    actualBranchName: 'منار الكومي-الحضره الجديده',
    primaryBranchId: 'branch_1789142992139',
    primaryBranchName: 'منار الكومي-الحضره الجديده',
    isCrossBranch: false,
    isCoverageShift: false,
    isFloatingEmp: false,
    date: '2026-10-21',
    actualPunchDate: '2026-10-21',
    timeIn: '01:37',
    startEpoch: 1792535824000,
    isPaused: false,
    isOnBreak: false,
    updatedAt: 1792535824000,
    source: 'biometric_device',
    punchSource: 'biometric_device',
    verifyType: 'FINGERPRINT',
    biometricDeviceSerial: 'EUF7242701802',
    biometricDeviceName: 'جهاز بصمة منار الكومي'
  };
  state.activeShifts['115'] = aliActivePayload;
  state.activeShifts['emp_1789242190413'] = aliActivePayload;
  console.log('   ✅ Ali Shaaban updated: active shift added (01:37), added to activeShifts');

  // ==========================================
  // 5. اسلام عبد الحكيم جلال حسن (كود 111 / pin 14)
  // حضور 17:32 وانصراف 00:41 بتاريخ 2026-10-21
  // ==========================================
  console.log('5. Reconciling Islam Abdel-Hakim (Code 111 / Pin 14)...');
  const islamShiftId = 'shift_emp_1789240369018_1792506765000';
  const islamShift = {
    id: islamShiftId,
    employeeId: 'emp_1789240369018',
    employeeCode: '111',
    employeeName: 'اسلام عبد الحكيم جلال حسن',
    date: '2026-10-20',
    actualPunchDate: '2026-10-20',
    timeIn: '17:32',
    timeOut: '00:41',
    timeOutDate: '2026-10-21',
    branchId: 'branch_1789142992139',
    branchName: 'منار الكومي-الحضره الجديده',
    actualBranchId: 'branch_1789142992139',
    actualBranchName: 'منار الكومي-الحضره الجديده',
    hours: 7.15,
    actualWorkedHours: 7.15,
    netHours: 7.15,
    regularHours: 7.15,
    overtimeHours: 0,
    overtimeStatus: 'none',
    isLiveActive: false,
    status: 'completed',
    statusLabel: 'حضور حي (وردية عابرة لمنتصف الليل)',
    punchSource: 'biometric_device',
    source: 'biometric_device',
    biometricDeviceSerial: 'EUF7242701802',
    biometricDeviceName: 'جهاز بصمة منار الكومي',
    verifyType: 'FINGERPRINT',
    startEpoch: 1792506765000,
    scheduledHours: 8,
    notes: 'حضور 17:32 وانصراف 00:41 عبر جهاز بصمة منار الكومي'
  };
  state.shifts = state.shifts.filter(s => s.id !== islamShiftId);
  state.shifts.unshift(islamShift);
  delete state.activeShifts['111'];
  delete state.activeShifts['14'];
  delete state.activeShifts['emp_1789240369018'];
  console.log('   ✅ Islam Abdel-Hakim updated: completed shift added (17:32 -> 00:41)');

  // ==========================================
  // التحقق من سلامة الجزاءات الـ 13 للموظف 107 وبقية الموظفين
  // ==========================================
  const emp107Incs = (state.lateIncidents || []).filter(i =>
    i.employeeId === 'emp_1789231413527' &&
    i.status !== 'cancelled' &&
    !i.isCancelled &&
    (i.deductionMinutes > 0 || i.penaltyAmount > 0)
  );
  console.log('🔍 Verified Emp 107 active penalty incidents:', emp107Incs.length);
  const totalIncs = (state.lateIncidents || []).filter(i =>
    i.status !== 'cancelled' &&
    !i.isCancelled &&
    (i.deductionMinutes > 0 || i.penaltyAmount > 0)
  );
  console.log('🔍 Verified Total active penalty incidents across org:', totalIncs.length);

  // ==========================================
  // الحفظ في Redis و PostgreSQL
  // ==========================================
  await redis.set('hr:settings:pharmacy-tracker-data', JSON.stringify(state));
  console.log('💾 Saved reconciled state to Redis key hr:settings:pharmacy-tracker-data');

  await pool.query(
    "INSERT INTO public.app_settings (key_name, value_data, updated_at) VALUES ('pharmacy-tracker-data', $1::jsonb, CURRENT_TIMESTAMP) ON CONFLICT (key_name) DO UPDATE SET value_data = $1::jsonb, updated_at = CURRENT_TIMESTAMP",
    [JSON.stringify(state)]
  );
  console.log('💾 Saved reconciled state to PostgreSQL table app_settings');

  console.log('🎉 RECONCILIATION COMPLETE SUCCESSFULLY!');

  redis.disconnect();
  await pool.end();
}

run().catch(err => {
  console.error('Fatal error during reconciliation:', err);
  process.exit(1);
});
`;

fs.writeFileSync('scratch_biometric_reconcile.cjs', reconciliationLogic, 'utf8');

const targets = [
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' },
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199', userHome: '/home/ubuntu' }
];

for (const target of targets) {
  console.log(`====================================================`);
  console.log(`🌐 Pushing Biometric Reconciliation to: ${target.name} [${target.host}]`);
  console.log(`====================================================`);

  try {
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_biometric_reconcile.cjs ${target.host}:${target.userHome}/biometric_reconcile.cjs`, { stdio: 'inherit' });

    const shCmd = [
      `sudo docker cp ${target.userHome}/biometric_reconcile.cjs hr-backend-server:/app/biometric_reconcile.cjs`,
      `sudo docker exec -w /app hr-backend-server node /app/biometric_reconcile.cjs`,
      `sudo docker exec -w /app hr-backend-server rm -f /app/biometric_reconcile.cjs`,
      `rm -f ${target.userHome}/biometric_reconcile.cjs`,
      // Restart container so socket.io clients immediately reconnect and load fresh activeShifts and shifts!
      `sudo docker restart hr-backend-server`
    ].join(' && ');

    execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { stdio: 'inherit' });
    console.log(`   🎉 Successfully reconciled and restarted on ${target.name}!\n`);
  } catch (err) {
    console.error(`   ❌ Failed on ${target.name}:`, err.message);
  }
}

fs.unlinkSync('scratch_biometric_reconcile.cjs');
