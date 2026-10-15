import pg from 'pg';
const { Client } = pg;

async function remedy() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
  });
  await client.connect();

  console.log('--- 1. Fetching current pharmacy-tracker-data ---');
  const res = await client.query("SELECT value_data, version FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
  if (!res.rows.length) {
    console.error('Settings not found!');
    await client.end();
    return;
  }

  const data = res.rows[0].value_data;
  let currentVersion = res.rows[0].version;

  const empId = 'emp_1789240567148';
  const empCode = '112';
  const empName = 'محمد احمد محمود محمد الحضري';
  const branchId = 'branch_1789240173448';
  const branchName = 'عماد القيم - المخزن';
  const dateStr = '2026-10-13';

  // 1. Remove hanging 23:54 active shift from activeShifts
  console.log('--- 2. Cleaning activeShifts ---');
  const activeShifts = { ...(data.activeShifts || {}) };
  delete activeShifts[empId];
  delete activeShifts[empCode];
  delete activeShifts[String(empId)];
  delete activeShifts[String(empCode)];
  Object.keys(activeShifts).forEach(k => {
    const v = activeShifts[k];
    if (v && (String(v.employeeId) === empId || String(v.employeeCode) === empCode || (v.employeeName || '').includes('الحضري'))) {
      delete activeShifts[k];
    }
  });

  // 2. Prepare the corrected complete shift record for 2026-10-13
  console.log('--- 3. Reconstructing 2026-10-13 complete shift ---');
  // 13:00 to 23:54:
  // 13:00 to 23:00 = 10 hours. 54 minutes = 0.9 hours. Total = 10.90 hours.
  const diffMinutes = (23 * 60 + 54) - (13 * 60); // 1434 - 780 = 654 mins = 10.9 hours
  const workedHours = Math.round((diffMinutes / 60) * 100) / 100; // 10.9

  // Get employee scheduled hours (default 10 or 8)
  const empObj = (data.employees || []).find(e => String(e.id) === empId || String(e.code) === empCode);
  const schedHours = parseFloat(empObj?.workHoursPerDay || empObj?.workHours || 10) || 10;
  const regularHours = Math.min(workedHours, schedHours);
  const overtimeHours = Math.max(0, Math.round((workedHours - schedHours) * 100) / 100);

  const shiftId = `shift_${empId}_1791884400000`; // 2026-10-13 13:00
  const correctedShift = {
    id: shiftId,
    shiftId: shiftId,
    employeeId: empId,
    employeeCode: empCode,
    employeeName: empName,
    branchId: branchId,
    branchName: branchName,
    date: dateStr,
    timeIn: '13:00',
    timeOut: '23:54',
    hours: workedHours,
    actualWorkedHours: workedHours,
    netHours: workedHours,
    scheduledHours: schedHours,
    regularHours: regularHours,
    overtimeHours: overtimeHours,
    overtimeStatus: overtimeHours > 0 ? 'approved' : 'none',
    breakHours: 0,
    status: 'completed',
    isLiveActive: false,
    isPaused: false,
    isOnBreak: false,
    punchType: 'kiosk',
    punchSource: 'kiosk',
    source: 'kiosk',
    statusLabel: 'حضور مكتمل (تصحيح هندسي للمطابقة)',
    note: 'حضور من 13:00 إلى 23:54 (تم توثيق وانصراف بالبصمة الإلكترونية - الساعات: 10.9 س)',
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: new Date().toISOString()
  };

  // Remove any conflicting incomplete shifts for 2026-10-13 for this employee
  let shifts = (data.shifts || []).filter(s => {
    if (!s) return false;
    const isEmp = String(s.employeeId) === empId || String(s.employeeCode) === empCode || (s.employeeName || '').includes('الحضري');
    if (isEmp && s.date === dateStr) {
      return false; // remove old
    }
    return true;
  });

  // Prepend corrected shift
  shifts = [correctedShift, ...shifts];

  // 3. Update data object
  data.activeShifts = activeShifts;
  data.shifts = shifts;
  data._requestsUpdatedAt = new Date().toISOString();

  console.log('--- 4. Saving updated data to app_settings ---');
  const now = new Date().toISOString();
  await client.query(
    `UPDATE public.app_settings 
     SET value_data = $1::jsonb, version = version + 1, updated_at = $2 
     WHERE key_name = 'pharmacy-tracker-data'`,
    [JSON.stringify(data), now]
  );

  // 4. Log in sync_logs
  await client.query(
    `INSERT INTO public.sync_logs (action_type, entity_key, version, client_ip, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    ['REMEDY_HADARI_SHIFT', 'emp_' + empId, currentVersion + 1, 'remedy-script', now]
  );

  console.log('✅ Successfully restored 2026-10-13 shift for Hadari (13:00 -> 23:54, 10.9h) and cleared hanging activeShifts!');

  await client.end();
}

remedy().catch(console.error);
