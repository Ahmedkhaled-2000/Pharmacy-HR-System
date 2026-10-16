const fs = require('fs');
const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'ubuntu@63.183.147.199';

console.log('1. Exporting current state from VPS PostgreSQL...');
const fetchSql = `
SELECT value_data
FROM app_settings
WHERE key_name = 'pharmacy-tracker-data';
`;
fs.writeFileSync('temp_fetch.sql', fetchSql, 'utf8');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_fetch.sql ${host}:/tmp/temp_fetch.sql`);
const stateJsonStr = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /tmp/temp_fetch.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"`, { maxBuffer: 50 * 1024 * 1024 }).toString().trim();
fs.unlinkSync('temp_fetch.sql');

if (!stateJsonStr) {
  throw new Error('Failed to fetch state from DB');
}

const state = JSON.parse(stateJsonStr);
console.log('Fetched state successfully. Shifts count before:', (state.shifts || []).length);

const empId = 'emp_1789231413527';
const empCode = '107';
const medinaBranchId = 'branch_1789241578010';
const medinaBranchName = 'المدينه الجامعيه - عزبه سعد';
const manarBranchId = 'branch_1789142992139';
const manarBranchName = 'منار الكومي-الحضره الجديده';

// 1. Ensure employee branchesDetails
const emp = (state.employees || []).find(e => e && (e.id === empId || e.code === empCode));
if (emp) {
  console.log('Found employee:', emp.name, 'code:', emp.code);
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

// 2. Adjust Manar El-Komy shift on 2026-09-27 if it has 06:37 instead of 18:37
state.shifts = (state.shifts || []).map(s => {
  if (!s) return s;
  const isTargetEmp = (s.employeeId === empId || s.employeeCode === empCode);
  if (!isTargetEmp) return s;

  if (s.date === '2026-09-27' && (s.branchId === manarBranchId || s.branchName?.includes('منار'))) {
    console.log('Normalizing Manar El-Komy shift on 2026-09-27:', s.timeIn, '->', s.timeOut);
    return {
      ...s,
      timeIn: '18:37',
      timeOut: '00:00',
      hours: 5.38,
      netHours: 5.38,
      workHours: 5.38,
      regularHours: 5.38,
      actualWorkedHours: 5.38,
      overtimeHours: 0,
      isOvertimeApproved: false,
      overtimeStatus: 'none',
      isOvernight: true,
      note: '[١٦‏/١٠‏/٢٠٢٦ ١٢:٠١ م] ✏️ تسجيل بصمة يدوية بواسطة الإدارة العليا: التوقيت: 18:37 إلى 00:00 | صافي ساعات العمل: 5.38 س'
    };
  }

  if (s.date === '2026-09-24' && (s.branchId === manarBranchId || s.branchName?.includes('منار'))) {
    console.log('Normalizing Manar El-Komy shift on 2026-09-24:', s.timeIn, '->', s.timeOut);
    return {
      ...s,
      timeIn: '06:18',
      timeOut: '12:12',
      hours: 5.90,
      netHours: 5.90,
      workHours: 5.90,
      regularHours: 5.90,
      actualWorkedHours: 5.90,
      overtimeHours: 0,
      isOvertimeApproved: false,
      overtimeStatus: 'none',
      note: '[١٦‏/١٠‏/٢٠٢٦ ١١:٥٩ ص] ✏️ تسجيل بصمة يدوية بواسطة الإدارة العليا: التوقيت: 06:18 إلى 12:12 | صافي ساعات العمل: 5.90 س'
    };
  }

  return s;
});

// 3. Remove existing Medina shifts on 23, 24, 27 to prevent duplicates, then insert canonical ones
state.shifts = state.shifts.filter(s => {
  if (!s) return false;
  const isTargetEmp = (s.employeeId === empId || s.employeeCode === empCode);
  const isMedina = (s.branchId === medinaBranchId || s.branchName?.includes('المدينه'));
  if (isTargetEmp && isMedina && ['2026-09-23', '2026-09-24', '2026-09-27'].includes(s.date)) {
    console.log('Removing old/duplicate Medina shift for replacement:', s.date, s.id);
    return false;
  }
  return true;
});

const restoredShifts = [
  {
    id: 'shift_restored_107_medina_20260923',
    employeeId: empId,
    employeeCode: empCode,
    employeeName: 'عبد الرحمن حسام الدين جلال مرسي محمد بكر',
    branchId: medinaBranchId,
    branchName: medinaBranchName,
    date: '2026-09-23',
    timeIn: '11:16',
    timeOut: '17:33',
    hours: 6.28,
    netHours: 6.28,
    regularHours: 6.28,
    actualWorkedHours: 6.28,
    workHours: 6.28,
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
    note: 'مزامنة أوفلاين (14:33)',
    isRestored: true,
    createdAt: '2026-09-23T08:16:00.000Z',
    updatedAt: new Date().toISOString()
  },
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
    note: 'مزامنة أوفلاين (14:56)',
    isRestored: true,
    createdAt: '2026-09-24T09:12:00.000Z',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'shift_restored_107_medina_20260927',
    employeeId: empId,
    employeeCode: empCode,
    employeeName: 'عبد الرحمن حسام الدين جلال مرسي محمد بكر',
    branchId: medinaBranchId,
    branchName: medinaBranchName,
    date: '2026-09-27',
    timeIn: '11:19',
    timeOut: '18:17',
    hours: 6.97,
    netHours: 6.97,
    regularHours: 6.69,
    actualWorkedHours: 6.97,
    workHours: 6.97,
    breakHours: 0,
    overtimeHours: 0.28,
    isOvertimeApproved: true,
    overtimeStatus: 'approved',
    status: 'completed',
    source: 'manual',
    isManual: true,
    manualPunch: true,
    statusLabel: 'تسجيل يدوي إداري',
    note: 'لوحة تحكم الإدارة',
    isRestored: true,
    createdAt: '2026-09-27T08:19:00.000Z',
    updatedAt: new Date().toISOString()
  }
];

state.shifts = [...state.shifts, ...restoredShifts];

// 4. Purge tombstones in _deletedIds
const oldDeleted = state._deletedIds || [];
state._deletedIds = oldDeleted.filter(d => {
  const str = String(d || '');
  if (str.startsWith('shift_restored_') || str.includes('107_medina') || str.includes('1789231413527_medina')) {
    return false;
  }
  return true;
});

state.lastUpdated = new Date().toISOString();
state.version = (state.version || 1) + 1;

console.log('Shifts count after:', state.shifts.length);

// Verify employee 107 counts
const empShifts = state.shifts.filter(s => s && (s.employeeId === empId || s.employeeCode === empCode));
const medinaCount = empShifts.filter(s => s.branchId === medinaBranchId || s.branchName?.includes('المدينه')).length;
const manarCount = empShifts.filter(s => s.branchId === manarBranchId || s.branchName?.includes('منار')).length;
console.log(`Verification: Employee 107 Total Shifts = ${empShifts.length} (Medina: ${medinaCount}, Manar: ${manarCount})`);

// 5. Upload updated state to PostgreSQL
fs.writeFileSync('updated_state.json', JSON.stringify(state), 'utf8');
console.log('Uploading updated_state.json to VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no updated_state.json ${host}:/tmp/updated_state.json`);
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/updated_state.json hr-postgres:/tmp/updated_state.json"`);

const updateSql = `
UPDATE app_settings
SET value_data = pg_read_file('/tmp/updated_state.json')::jsonb,
    version = version + 1,
    updated_at = NOW()
WHERE key_name = 'pharmacy-tracker-data';
`;

fs.writeFileSync('temp_update.sql', updateSql, 'utf8');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_update.sql ${host}:/tmp/temp_update.sql`);

const updateResult = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /tmp/temp_update.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres"`).toString();
console.log(updateResult);

fs.unlinkSync('updated_state.json');
fs.unlinkSync('temp_update.sql');
console.log('DONE!');
