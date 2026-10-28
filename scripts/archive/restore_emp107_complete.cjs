const { Client } = require('pg');

async function restoreEmp107() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
  });
  await client.connect();

  console.log('1. Fetching pharmacy-tracker-data from DB...');
  const res = await client.query("SELECT value_data, version FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
  if (!res.rows || res.rows.length === 0) {
    throw new Error('Data not found');
  }

  const rawData = res.rows[0].value_data;
  const state = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
  const oldVersion = res.rows[0].version || 1;

  const empId = 'emp_1789231413527';
  const empCode = '107';
  const medinaBranchId = 'branch_1789241578010';
  const medinaBranchName = 'المدينه الجامعيه - عزبه سعد';
  const manarBranchId = 'branch_1789142992139';
  const manarBranchName = 'منار الكومي-الحضره الجديده';

  console.log(`Shifts count before: ${(state.shifts || []).length}`);

  // 1. Ensure employee branchesDetails
  const emp = (state.employees || []).find(e => e && (e.id === empId || e.code === empCode));
  if (emp) {
    console.log(`Configuring employee: ${emp.name} (${emp.code})`);
    if (!emp.branchesDetails || emp.branchesDetails.length === 0) {
      emp.branchesDetails = [
        { branchId: manarBranchId, branchName: manarBranchName, hourlyRate: 46.15, role: 'primary' },
        { branchId: medinaBranchId, branchName: medinaBranchName, hourlyRate: 46.15, role: 'secondary' }
      ];
    } else {
      const hasMedina = emp.branchesDetails.some(b => b.branchId === medinaBranchId || (b.branchName && b.branchName.includes('المدينه')));
      if (!hasMedina) {
        emp.branchesDetails.push({ branchId: medinaBranchId, branchName: medinaBranchName, hourlyRate: 46.15, role: 'secondary' });
      }
    }
  }

  // 2. Remove old duplicate / restored placeholders on 2026-09-24 and 2026-09-29 in Medina
  state.shifts = (state.shifts || []).filter(s => {
    if (!s) return false;
    const isEmp = (s.employeeId === empId || s.employeeCode === empCode);
    const isMedina = (s.branchId === medinaBranchId || (s.branchName && s.branchName.includes('المدينه')));
    if (isEmp && isMedina && (s.date === '2026-09-24' || s.date === '2026-09-29')) {
      console.log(`Replacing old Medina shift on ${s.date}: ${s.id}`);
      return false;
    }
    return true;
  });

  // 3. Insert canonical shifts for Medina
  const restoredShifts = [
    {
      id: 'shift_restored_107_medina_20260924',
      employeeId: empId,
      employeeCode: empCode,
      employeeName: 'عبد الرحمن حسام الدين جلال مرسي محمد بكر',
      branchId: medinaBranchId,
      branchName: medinaBranchName,
      date: '2026-09-24',
      timeIn: '12:12',
      timeOut: '17:56',
      hours: 5.73,
      netHours: 5.73,
      regularHours: 5.73,
      actualWorkedHours: 5.73,
      workHours: 5.73,
      breakHours: 0,
      overtimeHours: 0,
      isOvertimeApproved: false,
      overtimeStatus: 'none',
      status: 'completed',
      source: 'kiosk',
      isManual: true,
      manualPunch: true,
      isOfflineSynced: true,
      statusLabel: 'كشك البصمة الإلكتروني',
      note: '[١٦‏/١٠‏/٢٠٢٦ ١١:٥٩ ص] ✏️ تسجيل بصمة يدوية بواسطة الإدارة العليا: التوقيت: 12:12 إلى 17:56 | صافي ساعات العمل: 5.73 س',
      isRestored: true,
      createdAt: '2026-09-24T09:12:00.000Z',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'shift_restored_107_medina_20260929',
      employeeId: empId,
      employeeCode: empCode,
      employeeName: 'عبد الرحمن حسام الدين جلال مرسي محمد بكر',
      branchId: medinaBranchId,
      branchName: medinaBranchName,
      date: '2026-09-29',
      timeIn: '12:15',
      timeOut: '17:54',
      hours: 5.65,
      netHours: 5.65,
      regularHours: 5.65,
      actualWorkedHours: 5.65,
      workHours: 5.65,
      breakHours: 0,
      overtimeHours: 0,
      isOvertimeApproved: false,
      overtimeStatus: 'none',
      status: 'completed',
      source: 'device',
      deviceSerial: 'EUF7242701836',
      statusLabel: 'جهاز بصمة الإصبع',
      note: 'جهاز بصمة الإصبع - فرع المدينة الجامعية (EUF7242701836)',
      isRestored: true,
      createdAt: '2026-09-29T09:15:00.000Z',
      updatedAt: new Date().toISOString()
    }
  ];

  state.shifts = [...state.shifts, ...restoredShifts];

  // 4. Clean _deletedIds from any 107 / Medina shift tombstones
  const oldDeleted = state._deletedIds || [];
  state._deletedIds = oldDeleted.filter(d => {
    const str = String(d || '').toLowerCase();
    if (
      str.includes('107') ||
      str.includes(empId.toLowerCase()) ||
      str.includes('1790705725000') ||
      str.includes('medina') ||
      str.includes('shift_restored_107')
    ) {
      console.log(`Purging tombstone: ${d}`);
      return false;
    }
    return true;
  });

  state.lastUpdated = new Date().toISOString();
  state.version = (oldVersion || 1) + 1;

  console.log(`Shifts count after: ${state.shifts.length}`);

  // Count check
  const empShifts = state.shifts.filter(s => s && (s.employeeId === empId || s.employeeCode === empCode));
  const medinaCount = empShifts.filter(s => s.branchId === medinaBranchId || (s.branchName && s.branchName.includes('المدينه'))).length;
  const manarCount = empShifts.filter(s => s.branchId === manarBranchId || (s.branchName && s.branchName.includes('منار'))).length;
  console.log(`Verification: Employee 107 Total Shifts = ${empShifts.length} (Medina: ${medinaCount}, Manar: ${manarCount})`);

  // 5. Update DB
  await client.query(
    "UPDATE public.app_settings SET value_data = $1, version = version + 1, updated_at = NOW() WHERE key_name = 'pharmacy-tracker-data'",
    [JSON.stringify(state)]
  );
  console.log('Database updated successfully!');

  await client.end();
}

restoreEmp107().catch(console.error);
