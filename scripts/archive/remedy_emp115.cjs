const { execSync } = require('child_process');

const remedyScript = `
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres'
});

async function main() {
  console.log('=== STARTING REMEDY FOR EMP 115 ===');
  const res = await pool.query("SELECT value_data, version FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
  if (!res.rows.length) throw new Error('Settings key not found');

  const state = res.rows[0].value_data;
  const currentVersion = res.rows[0].version;
  const emp = (state.employees || []).find(e => String(e.code) === '115');
  if (!emp) throw new Error('Employee 115 not found');

  const empId = String(emp.id);
  const empCode = String(emp.code);

  console.log('Found employee:', emp.name, '(', empId, empCode, ')');

  // 1. Remove duplicate manual shift on 2026-10-15 (shift_emp_1789242190413_1792050226000)
  const duplicateShiftId = 'shift_emp_1789242190413_1792050226000';
  
  // 2. Identify real overnight punch shift currently on 2026-10-16 (shift_emp_1789242190413_1792097861000)
  const realShiftId = 'shift_emp_1789242190413_1792097861000';

  let shifts = (state.shifts || []).filter(s => {
    if (!s) return false;
    // Remove the duplicate shift
    if (s.id === duplicateShiftId) {
      console.log('Removing duplicate manual shift:', s.id, s.date, s.timeIn, s.timeOut);
      return false;
    }
    return true;
  });

  // Now find and update the real shift to date: 2026-10-15
  let foundRealShift = false;
  shifts = shifts.map(s => {
    if (s.id === realShiftId || (s.employeeId === empId && s.date === '2026-10-16' && s.timeIn === '23:57')) {
      foundRealShift = true;
      console.log('Updating real shift from 2026-10-16 to 2026-10-15:', s.id);
      return {
        ...s,
        date: '2026-10-15',
        actualPunchDate: '2026-10-15',
        timeIn: '23:57',
        timeOut: '09:38',
        timeOutDate: '2026-10-16',
        hours: 10,
        netHours: 10,
        regularHours: 10,
        scheduledHours: 10,
        actualWorkedHours: 9.68,
        overtimeHours: 0,
        overtimeStatus: 'none',
        rejectedOvertime: false,
        isOvertimeApproved: false,
        isOvernight: true,
        isEarlyOvernightIn: true,
        isPostMidnightInForYesterday: false,
        hasApprovedPermission: true,
        permissionHours: 1,
        source: 'biometric_device',
        punchSource: 'biometric_device',
        status: 'completed',
        statusLabel: 'حضور معتمد (مع إذن معتمد)',
        note: 'وردية ليلية نظامية ليوم الخميس (حضور 23:57 وانصراف 09:38 صباح الجمعة مع إذن معتمد)',
        notes: 'وردية ليلية نظامية ليوم الخميس (حضور 23:57 وانصراف 09:38 صباح الجمعة مع إذن معتمد)',
        updatedAt: new Date().toISOString()
      };
    }
    return s;
  });

  if (!foundRealShift) {
    console.warn('Real shift was not found by exact ID, checking for date 2026-10-16...');
  }

  // 3. Update permission request perm_exc_1792177694218_3mh5g to link to 2026-10-15
  let requests = (state.requests || []).map(r => {
    if (r.id === 'perm_exc_1792177694218_3mh5g') {
      console.log('Updating permission request date to 2026-10-15');
      return {
        ...r,
        date: '2026-10-15',
        targetDate: '2026-10-15',
        timeOutDate: '2026-10-16',
        notes: 'إذن انصراف مبكر لوردية ليلة الخميس المنتهية صباح الجمعة (09:00 - 10:00)'
      };
    }
    if (r.id === 'req_ot_emp_1789242190413_2026-10-15_shift_emp_1789242190413_1792050226000') {
      return {
        ...r,
        status: 'rejected',
        notes: 'تم إلغاء واستبعاد الطلب بعد حذف الوردية المكررة وتصحيح الوردية الليلية'
      };
    }
    return r;
  });

  // 4. Update state object
  state.shifts = shifts;
  state.requests = requests;
  state._requestsUpdatedAt = new Date().toISOString();

  // Save to DB
  const now = new Date().toISOString();
  await pool.query(
    \`UPDATE public.app_settings 
     SET value_data = $1::jsonb, version = version + 1, updated_at = $2 
     WHERE key_name = 'pharmacy-tracker-data'\`,
    [JSON.stringify(state), now]
  );

  // Update raw punches notes in DB
  await pool.query(
    \`UPDATE public.biometric_raw_punches 
     SET process_notes = 'حضور وردية ليلية ليوم الخميس 2026-10-15 (23:57)' 
     WHERE id = 1391\`
  );
  await pool.query(
    \`UPDATE public.biometric_raw_punches 
     SET process_notes = 'انصراف وردية ليلية ليوم الخميس 2026-10-15 (09:38 صباح الجمعة)' 
     WHERE id = 1403\`
  );

  // Log in sync_logs
  await pool.query(
    \`INSERT INTO public.sync_logs (action_type, entity_key, version, client_ip, created_at)
     VALUES ($1, $2, $3, $4, $5)\`,
    ['REMEDY_EMP115_OVERNIGHT', 'emp_' + empId, currentVersion + 1, 'remedy-script', now]
  );

  console.log('=== REMEDY SAVED TO DATABASE SUCCESSFULLY! ===');
  await pool.end();
}

main().catch(console.error);
`;

const b64 = Buffer.from(remedyScript, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-backend-server node -`;

console.log('Executing remedy on VPS...');
const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
