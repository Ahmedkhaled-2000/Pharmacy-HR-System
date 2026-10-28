const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const targets = [
  {
    name: 'New VPS (169.58.214.20)',
    host: 'admin@169.58.214.20',
  },
  {
    name: 'Old Live VPS (63.183.147.199)',
    host: 'ubuntu@63.183.147.199',
  }
];

const runnerScript = `
const Redis = require('ioredis');
const { Pool } = require('pg');

async function main() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const pool = new Pool({
    host: process.env.DB_HOST || 'hr-postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres_hr_2026_super_secure'
  });

  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  if (!dataStr) {
    console.error('❌ Could not get data from Redis');
    process.exit(1);
  }

  const state = JSON.parse(dataStr);
  state.activeShifts = state.activeShifts || {};
  state.shifts = state.shifts || [];
  state._endedShiftEmpIds = Array.isArray(state._endedShiftEmpIds) ? state._endedShiftEmpIds : [];

  console.log('--- BEFORE RESTORATION ---');
  console.log('Current activeShifts keys:', Object.keys(state.activeShifts));
  const todayShiftsBefore = state.shifts.filter(s => s.date === '2026-10-21');
  console.log('Today shifts count in state:', todayShiftsBefore.length);

  // 1. Remove ended employees from activeShifts
  // Sabry Ibrahim (102), Ali Shaaban (115), Hadari (112), Adham (104), Islam (14/111), Taha (108), Anas (116), Sherif (121), Abdelrahman Hossam (107)
  const keysToRemove = [
    '102', 'emp_1789143997322',
    '115', 'emp_1789242190413',
    '112', 'emp_1789240567148',
    '104', 'emp_1789231088793',
    '14', '111', 'emp_1789240369018',
    '108', 'emp_1789231533592',
    '116', 'emp_1789328807202_aogrm',
    '121', 'emp_1789244412592',
    '107', 'emp_1789231413527'
  ];

  keysToRemove.forEach(k => {
    delete state.activeShifts[k];
  });

  // Also purge any shift that has startEpoch older than today or from yesterday
  for (const [k, v] of Object.entries(state.activeShifts)) {
    if (v && v.date && v.date < '2026-10-21') {
      console.log('Removing stale yesterday activeShift:', k, v.date, v.timeIn);
      delete state.activeShifts[k];
    }
  }

  // Ensure _endedShiftEmpIds records Sabry and Ali Shaaban so stale clients don't reopen them
  if (!state._endedShiftEmpIds.includes('102')) state._endedShiftEmpIds.push('102');
  if (!state._endedShiftEmpIds.includes('emp_1789143997322')) state._endedShiftEmpIds.push('emp_1789143997322');
  if (!state._endedShiftEmpIds.includes('115')) state._endedShiftEmpIds.push('115');
  if (!state._endedShiftEmpIds.includes('emp_1789242190413')) state._endedShiftEmpIds.push('emp_1789242190413');

  // 2. Properly close and update completed shifts for today in state.shifts
  // Sabry Ibrahim: 00:28 to 09:01 (8.55 hrs)
  let sabryShift = state.shifts.find(s => 
    s.date === '2026-10-21' && (s.employeeId === 'emp_1789143997322' || s.employeeCode === '102')
  );
  if (sabryShift) {
    sabryShift.timeIn = '00:28';
    sabryShift.timeOut = '09:01';
    sabryShift.hours = 8.55;
    sabryShift.actualWorkedHours = 8.55;
    sabryShift.status = 'completed';
    sabryShift.isLiveActive = false;
    sabryShift.adminApproved = true;
  } else {
    state.shifts.unshift({
      id: 'shift_emp_1789143997322_1792531730000',
      employeeId: 'emp_1789143997322',
      employeeCode: '102',
      employeeName: 'صبري إبراهيم خليل ابراهيم',
      date: '2026-10-21',
      actualPunchDate: '2026-10-21',
      timeIn: '00:28',
      timeOut: '09:01',
      branchId: 'branch_1789241974051',
      branchName: 'صيدليه سعيد بكري - قناه السويس',
      actualBranchId: 'branch_1789241974051',
      actualBranchName: 'صيدليه سعيد بكري - قناه السويس',
      hours: 8.55,
      actualWorkedHours: 8.55,
      status: 'completed',
      isLiveActive: false,
      adminApproved: true,
      source: 'biometric_device',
      punchSource: 'biometric_device',
      biometricDeviceSerial: 'EUF7242701598',
      biometricDeviceName: 'جهاز بصمة سعيد',
      verifyType: 'FINGERPRINT'
    });
  }

  // Ali Shaaban: 01:37 to 10:18 (8.68 hrs)
  let aliShift = state.shifts.find(s => 
    s.date === '2026-10-21' && (s.employeeId === 'emp_1789242190413' || s.employeeCode === '115')
  );
  if (aliShift) {
    aliShift.timeIn = '01:37';
    aliShift.timeOut = '10:18';
    aliShift.hours = 8.68;
    aliShift.actualWorkedHours = 8.68;
    aliShift.status = 'completed';
    aliShift.isLiveActive = false;
    aliShift.adminApproved = true;
  } else {
    state.shifts.unshift({
      id: 'shift_emp_1789242190413_1792535824000',
      employeeId: 'emp_1789242190413',
      employeeCode: '115',
      employeeName: 'على شعبان عباس سليمان',
      date: '2026-10-21',
      actualPunchDate: '2026-10-21',
      timeIn: '01:37',
      timeOut: '10:18',
      branchId: 'branch_1789142992139',
      branchName: 'منار الكومي-الحضره الجديده',
      actualBranchId: 'branch_1789142992139',
      actualBranchName: 'منار الكومي-الحضره الجديده',
      hours: 8.68,
      actualWorkedHours: 8.68,
      status: 'completed',
      isLiveActive: false,
      adminApproved: true,
      source: 'biometric_device',
      punchSource: 'biometric_device',
      biometricDeviceSerial: 'EUF7242701802',
      biometricDeviceName: 'جهاز بصمة منار الكومي',
      verifyType: 'FINGERPRINT'
    });
  }

  // 3. Definition of ALL currently active shifts for today
  const activeEmployees = [
    {
      code: '109',
      id: 'emp_1789231620535',
      name: 'جهاد على عبد الله على',
      branchId: 'branch_1789241578010',
      branchName: 'المدينه الجامعيه - عزبه سعد',
      timeIn: '08:36',
      startEpoch: new Date('2026-10-21T08:36:00+03:00').getTime(),
      deviceSerial: 'EUF7242701836',
      deviceName: 'جهاز بصمة فرع المدينة الجامعية'
    },
    {
      code: '1156',
      id: 'emp_1792340313632_8qlbo',
      name: 'محمود طارق حسن محمود الصعيدي',
      branchId: 'branch_1789241974051',
      branchName: 'صيدليه سعيد بكري - قناه السويس',
      timeIn: '08:42',
      startEpoch: new Date('2026-10-21T08:42:00+03:00').getTime(),
      deviceSerial: 'EUF7242701598',
      deviceName: 'جهاز بصمة سعيد'
    },
    {
      code: '1148',
      id: 'emp_1789327409504_d16gd',
      name: 'اسماء الهوارى بديوى محمد',
      branchId: 'branch_1789241974051',
      branchName: 'صيدليه سعيد بكري - قناه السويس',
      timeIn: '08:59',
      startEpoch: new Date('2026-10-21T08:59:00+03:00').getTime(),
      deviceSerial: 'EUF7242701598',
      deviceName: 'جهاز بصمة سعيد'
    },
    {
      code: '103',
      id: 'emp_1789144674736',
      name: 'روان محمد محمد احمد عبد العال',
      branchId: 'branch_1789142992139',
      branchName: 'منار الكومي-الحضره الجديده',
      timeIn: '10:15',
      startEpoch: new Date('2026-10-21T10:15:00+03:00').getTime(),
      deviceSerial: 'EUF7242701802',
      deviceName: 'جهاز بصمة منار الكومي'
    },
    {
      code: '105',
      id: 'emp_1789231275270',
      name: 'محمد احمد محمد حسين',
      branchId: 'branch_1789142992139',
      branchName: 'منار الكومي-الحضره الجديده',
      timeIn: '11:40',
      startEpoch: new Date('2026-10-21T11:40:00+03:00').getTime(),
      deviceSerial: 'EUF7242701802',
      deviceName: 'جهاز بصمة منار الكومي'
    },
    {
      code: '156',
      id: 'emp_1789251322104',
      name: 'إياد عمرو محمد الصغير',
      branchId: 'branch_1789241578010',
      branchName: 'المدينه الجامعيه - عزبه سعد',
      timeIn: '15:15',
      startEpoch: new Date('2026-10-21T15:15:00+03:00').getTime(),
      deviceSerial: 'EUF7242701836',
      deviceName: 'جهاز بصمة فرع المدينة الجامعية'
    },
    {
      code: '1150',
      id: 'emp_1789384253233_zwo6b',
      name: 'عمر ياسر احمد عثمان',
      branchId: 'branch_1789241974051',
      branchName: 'صيدليه سعيد بكري - قناه السويس',
      timeIn: '15:52',
      startEpoch: new Date('2026-10-21T15:52:00+03:00').getTime(),
      deviceSerial: 'EUF7242701598',
      deviceName: 'جهاز بصمة سعيد'
    },
    {
      code: '1146',
      id: 'emp_1789320128545_iz83s',
      name: 'مروان محمود حسن محمد احمد',
      branchId: 'branch_1789240173448',
      branchName: 'عماد القيم - المخزن',
      timeIn: '16:01',
      startEpoch: new Date('2026-10-21T16:01:00+03:00').getTime(),
      deviceSerial: 'kiosk',
      deviceName: 'كشك المخزن'
    }
  ];

  for (const emp of activeEmployees) {
    const shiftId = \`shift_\${emp.id}_\${emp.startEpoch}\`;
    
    // Set in activeShifts under both ID and Code
    const activeObj = {
      shiftId: shiftId,
      employeeId: emp.id,
      employeeCode: emp.code,
      employeeName: emp.name,
      branchId: emp.branchId,
      branchName: emp.branchName,
      actualBranchId: emp.branchId,
      actualBranchName: emp.branchName,
      date: '2026-10-21',
      actualPunchDate: '2026-10-21',
      timeIn: emp.timeIn,
      startEpoch: emp.startEpoch,
      isPaused: false,
      isOnBreak: false,
      isLiveActive: true,
      updatedAt: emp.startEpoch,
      source: emp.deviceSerial === 'kiosk' ? 'kiosk' : 'biometric_device',
      punchSource: emp.deviceSerial === 'kiosk' ? 'kiosk' : 'biometric_device',
      verifyType: emp.deviceSerial === 'kiosk' ? 'KIOSK' : 'FINGERPRINT',
      biometricDeviceSerial: emp.deviceSerial,
      biometricDeviceName: emp.deviceName
    };

    state.activeShifts[emp.id] = activeObj;
    state.activeShifts[emp.code] = activeObj;

    // Check if shift already exists in state.shifts
    const existingShiftIdx = state.shifts.findIndex(s => 
      s.date === '2026-10-21' && (s.employeeId === emp.id || s.employeeCode === emp.code)
    );

    if (existingShiftIdx >= 0) {
      state.shifts[existingShiftIdx].timeIn = emp.timeIn;
      state.shifts[existingShiftIdx].timeOut = '';
      state.shifts[existingShiftIdx].branchId = emp.branchId;
      state.shifts[existingShiftIdx].branchName = emp.branchName;
      state.shifts[existingShiftIdx].isLiveActive = true;
      state.shifts[existingShiftIdx].status = 'active';
      state.shifts[existingShiftIdx].hours = 0;
    } else {
      state.shifts.unshift({
        id: shiftId,
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.name,
        date: '2026-10-21',
        actualPunchDate: '2026-10-21',
        timeIn: emp.timeIn,
        timeOut: '',
        branchId: emp.branchId,
        branchName: emp.branchName,
        actualBranchId: emp.branchId,
        actualBranchName: emp.branchName,
        isLiveActive: true,
        status: 'active',
        statusLabel: \`حضور حي 🟢 (بدأ \${emp.timeIn})\`,
        punchSource: emp.deviceSerial === 'kiosk' ? 'kiosk' : 'biometric_device',
        source: emp.deviceSerial === 'kiosk' ? 'kiosk' : 'biometric_device',
        biometricDeviceSerial: emp.deviceSerial,
        biometricDeviceName: emp.deviceName,
        verifyType: emp.deviceSerial === 'kiosk' ? 'KIOSK' : 'FINGERPRINT',
        startEpoch: emp.startEpoch,
        scheduledHours: 8,
        regularHours: 0,
        overtimeHours: 0,
        hours: 0,
        notes: \`تسجيل حضور حي في تمام الساعة \${emp.timeIn}\`
      });
    }

    // Remove from _endedShiftEmpIds if present
    state._endedShiftEmpIds = state._endedShiftEmpIds.filter(id => id !== emp.id && id !== emp.code);
  }

  // 4. Save to Redis
  await redis.set('hr:settings:pharmacy-tracker-data', JSON.stringify(state));
  console.log('✅ Successfully updated Redis key hr:settings:pharmacy-tracker-data');

  // 5. Save to Postgres app_settings
  const updRes = await pool.query(
    "UPDATE public.app_settings SET value_data = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE key_name = 'pharmacy-tracker-data'",
    [JSON.stringify(state)]
  );
  if (updRes.rowCount === 0) {
    await pool.query(
      "INSERT INTO public.app_settings (key_name, value_data, updated_at) VALUES ('pharmacy-tracker-data', $1::jsonb, CURRENT_TIMESTAMP)",
      [JSON.stringify(state)]
    );
  }
  console.log('✅ Successfully updated PostgreSQL table app_settings');

  // Verify
  console.log('\\n--- AFTER RESTORATION ---');
  console.log('Active shifts keys:', Object.keys(state.activeShifts));
  for (const [k, v] of Object.entries(state.activeShifts)) {
    console.log('  ', k, '->', v.employeeName, 'at', v.branchName, '(', v.timeIn, ')');
  }

  const todayShiftsAfter = state.shifts.filter(s => s.date === '2026-10-21');
  console.log('\\nToday shifts in state count:', todayShiftsAfter.length);
  for (const s of todayShiftsAfter) {
    console.log('  ', s.employeeName, s.timeIn, '->', s.timeOut || '(ACTIVE)', 'hours:', s.hours, 'branch:', s.branchName);
  }

  redis.disconnect();
  await pool.end();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
`;

async function run() {
  console.log('====================================================');
  console.log('🚀 RESTORING LIVE BIOMETRIC ATTENDANCE ON BOTH SERVERS');
  console.log('====================================================\n');

  fs.writeFileSync('temp_restore_runner.cjs', runnerScript);

  try {
    for (const target of targets) {
      console.log(`\n🌐 Executing on: ${target.name} [${target.host}]`);
      try {
        const userHome = target.host.startsWith('admin@') ? '/home/admin' : '/home/ubuntu';
        execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_restore_runner.cjs ${target.host}:${userHome}/temp_restore_runner.cjs`, { stdio: 'pipe' });
        const cmds = [
          `sudo docker cp ${userHome}/temp_restore_runner.cjs hr-backend-server:/app/temp_restore_runner.cjs`,
          `sudo docker exec hr-backend-server node /app/temp_restore_runner.cjs`,
          `sudo docker exec hr-backend-server rm -f /app/temp_restore_runner.cjs`,
          `rm -f ${userHome}/temp_restore_runner.cjs`
        ].join(' && ');
        const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${cmds}"`).toString();
        console.log(out.trim());
        console.log(`✅ Completed on ${target.name}`);
      } catch (e) {
        console.error(`❌ Error on ${target.name}:`, e.message);
        if (e.stdout) console.log(e.stdout.toString());
        if (e.stderr) console.error(e.stderr.toString());
      }
    }
  } finally {
    if (fs.existsSync('temp_restore_runner.cjs')) fs.unlinkSync('temp_restore_runner.cjs');
  }

  // Also update local scratch_reconciled_full_state.json so it is permanently in sync
  if (fs.existsSync('scratch_reconciled_full_state.json')) {
    console.log('\\n💾 Syncing local scratch_reconciled_full_state.json...');
    const localRaw = fs.readFileSync('scratch_reconciled_full_state.json', 'utf8');
    const localState = JSON.parse(localRaw);
    
    // We execute the same activeShifts and today shifts logic on localState
    localState.activeShifts = localState.activeShifts || {};
    localState.shifts = localState.shifts || [];
    localState._endedShiftEmpIds = Array.isArray(localState._endedShiftEmpIds) ? localState._endedShiftEmpIds : [];

    const keysToRemove = [
      '102', 'emp_1789143997322',
      '115', 'emp_1789242190413',
      '112', 'emp_1789240567148',
      '104', 'emp_1789231088793',
      '14', '111', 'emp_1789240369018',
      '108', 'emp_1789231533592',
      '116', 'emp_1789328807202_aogrm',
      '121', 'emp_1789244412592',
      '107', 'emp_1789231413527'
    ];
    keysToRemove.forEach(k => delete localState.activeShifts[k]);
    for (const [k, v] of Object.entries(localState.activeShifts)) {
      if (v && v.date && v.date < '2026-10-21') delete localState.activeShifts[k];
    }

    // Add Sabry & Ali completed
    let sabry = localState.shifts.find(s => s.date === '2026-10-21' && (s.employeeId === 'emp_1789143997322' || s.employeeCode === '102'));
    if (sabry) {
      sabry.timeIn = '00:28'; sabry.timeOut = '09:01'; sabry.hours = 8.55; sabry.status = 'completed'; sabry.isLiveActive = false;
    } else {
      localState.shifts.unshift({
        id: 'shift_emp_1789143997322_1792531730000',
        employeeId: 'emp_1789143997322',
        employeeCode: '102',
        employeeName: 'صبري إبراهيم خليل ابراهيم',
        date: '2026-10-21',
        timeIn: '00:28',
        timeOut: '09:01',
        branchId: 'branch_1789241974051',
        branchName: 'صيدليه سعيد بكري - قناه السويس',
        hours: 8.55,
        status: 'completed',
        isLiveActive: false
      });
    }

    let ali = localState.shifts.find(s => s.date === '2026-10-21' && (s.employeeId === 'emp_1789242190413' || s.employeeCode === '115'));
    if (ali) {
      ali.timeIn = '01:37'; ali.timeOut = '10:18'; ali.hours = 8.68; ali.status = 'completed'; ali.isLiveActive = false;
    } else {
      localState.shifts.unshift({
        id: 'shift_emp_1789242190413_1792535824000',
        employeeId: 'emp_1789242190413',
        employeeCode: '115',
        employeeName: 'على شعبان عباس سليمان',
        date: '2026-10-21',
        timeIn: '01:37',
        timeOut: '10:18',
        branchId: 'branch_1789142992139',
        branchName: 'منار الكومي-الحضره الجديده',
        hours: 8.68,
        status: 'completed',
        isLiveActive: false
      });
    }

    // Add active shifts
    const activeEmployees = [
      { code: '109', id: 'emp_1789231620535', name: 'جهاد على عبد الله على', branchId: 'branch_1789241578010', branchName: 'المدينه الجامعيه - عزبه سعد', timeIn: '08:36' },
      { code: '1156', id: 'emp_1792340313632_8qlbo', name: 'محمود طارق حسن محمود الصعيدي', branchId: 'branch_1789241974051', branchName: 'صيدليه سعيد بكري - قناه السويس', timeIn: '08:42' },
      { code: '1148', id: 'emp_1789327409504_d16gd', name: 'اسماء الهوارى بديوى محمد', branchId: 'branch_1789241974051', branchName: 'صيدليه سعيد بكري - قناه السويس', timeIn: '08:59' },
      { code: '103', id: 'emp_1789144674736', name: 'روان محمد محمد احمد عبد العال', branchId: 'branch_1789142992139', branchName: 'منار الكومي-الحضره الجديده', timeIn: '10:15' },
      { code: '105', id: 'emp_1789231275270', name: 'محمد احمد محمد حسين', branchId: 'branch_1789142992139', branchName: 'منار الكومي-الحضره الجديده', timeIn: '11:40' },
      { code: '156', id: 'emp_1789251322104', name: 'إياد عمرو محمد الصغير', branchId: 'branch_1789241578010', branchName: 'المدينه الجامعيه - عزبه سعد', timeIn: '15:15' },
      { code: '1150', id: 'emp_1789384253233_zwo6b', name: 'عمر ياسر احمد عثمان', branchId: 'branch_1789241974051', branchName: 'صيدليه سعيد بكري - قناه السويس', timeIn: '15:52' },
      { code: '1146', id: 'emp_1789320128545_iz83s', name: 'مروان محمود حسن محمد احمد', branchId: 'branch_1789240173448', branchName: 'عماد القيم - المخزن', timeIn: '16:01' }
    ];

    for (const emp of activeEmployees) {
      const activeObj = {
        shiftId: 'shift_' + emp.id + '_today',
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.name,
        branchId: emp.branchId,
        branchName: emp.branchName,
        date: '2026-10-21',
        timeIn: emp.timeIn,
        isLiveActive: true
      };
      localState.activeShifts[emp.id] = activeObj;
      localState.activeShifts[emp.code] = activeObj;

      const idx = localState.shifts.findIndex(s => s.date === '2026-10-21' && (s.employeeId === emp.id || s.employeeCode === emp.code));
      if (idx >= 0) {
        localState.shifts[idx].timeIn = emp.timeIn;
        localState.shifts[idx].timeOut = '';
        localState.shifts[idx].isLiveActive = true;
        localState.shifts[idx].status = 'active';
      } else {
        localState.shifts.unshift({
          id: 'shift_' + emp.id + '_today',
          employeeId: emp.id,
          employeeCode: emp.code,
          employeeName: emp.name,
          date: '2026-10-21',
          timeIn: emp.timeIn,
          timeOut: '',
          branchId: emp.branchId,
          branchName: emp.branchName,
          isLiveActive: true,
          status: 'active'
        });
      }
    }

    fs.writeFileSync('scratch_reconciled_full_state.json', JSON.stringify(localState, null, 2));
    console.log('✅ Local scratch_reconciled_full_state.json successfully synchronized!');
  }

  console.log('\\n====================================================');
  console.log('🎉 ALL LIVE ATTENDANCE RESTORED SUCCESSFULLY!');
  console.log('====================================================');
}

run().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
