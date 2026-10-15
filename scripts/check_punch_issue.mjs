import pg from 'pg';
const { Client } = pg;

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
  });
  await client.connect();

  const res = await client.query("SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
  const data = res.rows[0]?.value_data || {};
  
  // Find employee
  const employees = data.employees || [];
  const emp = employees.find(e => (e.name || '').includes('الحضري'));
  console.log('EMPLOYEE:', emp ? { id: emp.id, code: emp.code, name: emp.name } : 'NOT FOUND');

  const empId = emp?.id;
  const empCode = emp?.code;

  // Check all shifts for emp
  const hadari13 = (data.shifts || []).filter(s => (String(s.employeeId) === empId || String(s.employeeCode) === empCode) && s.date === '2026-10-13');
  console.log('HADARI_13_SHIFTS:', JSON.stringify(hadari13, null, 2));
  console.log('HADARI_ACTIVE:', data.activeShifts?.[empId] || data.activeShifts?.[empCode] || null);
  await client.end();
  return;
  // Check app_settings_backups
  try {
    const backups = await client.query("SELECT id, key_name, version, created_at FROM public.app_settings_backups WHERE key_name = 'pharmacy-tracker-data' AND created_at >= '2026-10-13 09:30:00' ORDER BY created_at ASC");
    console.log('APP_SETTINGS_BACKUPS (count=' + backups.rows.length + '):', JSON.stringify(backups.rows, null, 2));

    // For each backup around 10:00 - 12:00, check if it had the 13:00 shift
    for (const b of backups.rows.slice(0, 10)) {
      const bRes = await client.query("SELECT value_data FROM public.app_settings_backups WHERE id = $1", [b.id]);
      const bData = bRes.rows[0]?.value_data || {};
      const s13 = (bData.shifts || []).filter(s => (String(s.employeeId) === String(empId) || (s.employeeName || '').includes('الحضري')) && s.date === '2026-10-13');
      const act13 = bData.activeShifts?.[String(empId)] || bData.activeShifts?.[String(empCode)];
      console.log(`BACKUP ver=${b.version} time=${b.created_at}: shifts_2026-10-13=${s13.length}, active=${JSON.stringify(act13)}`);
    }
  } catch (e) {
    console.log('BACKUPS_ERR:', e.message);
  }

  await client.end();
  return;

  // Check dispatch logs
  try {
    const dispatchLogs = await client.query("SELECT * FROM biometric_dispatch_logs WHERE employee_id IN ('112', 'emp_1789240567148') ORDER BY created_at DESC LIMIT 20");
    console.log('BIOMETRIC_DISPATCH_LOGS:', JSON.stringify(dispatchLogs.rows, null, 2));
  } catch (e) {
    console.log('DISPATCH_LOGS_ERR:', e.message);
  }

  // Check change_log
  try {
    const changeLogs = await client.query("SELECT * FROM change_log WHERE entity_key LIKE '%emp_1789240567148%' OR entity_key LIKE '%112%' ORDER BY created_at DESC LIMIT 20");
    console.log('CHANGE_LOGS:', JSON.stringify(changeLogs.rows, null, 2));
  } catch (e) {
    console.log('CHANGE_LOGS_ERR:', e.message);
  }

  // Check system_company_backups if any
  try {
    const backups = await client.query("SELECT id, company_id, created_at FROM system_company_backups ORDER BY created_at DESC LIMIT 5");
    console.log('BACKUPS:', JSON.stringify(backups.rows, null, 2));
  } catch (e) {
    console.log('BACKUPS_ERR:', e.message);
  }

  await client.end();
  return;

  // Check sync_logs for emp
  const syncLogs = await client.query("SELECT * FROM sync_logs WHERE created_at > '2026-10-13 18:00:00' ORDER BY created_at DESC LIMIT 30");
  console.log('RECENT_SYNC_LOGS:', JSON.stringify(syncLogs.rows, null, 2));

  await client.end();
}

check().catch(console.error);
