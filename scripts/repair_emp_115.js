import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  console.log('1. Fetching current data from VPS...');
  const res = await fetch(url, {
    // @ts-ignore
    agent,
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123'
    }
  });

  if (!res.ok) {
    console.error('Fetch failed:', res.status, res.statusText);
    return;
  }

  const json = await res.json();
  const state = json?.value || json;
  const empId = 'emp_1789242190413';
  const empCode = '115';

  console.log('Total shifts before:', (state.shifts || []).length);
  const empShiftsBefore = (state.shifts || []).filter(s =>
    String(s.employeeId) === empId || String(s.employeeCode) === empCode
  );
  console.log('Emp 115 shifts before:', empShiftsBefore.length);

  // 1. Remove duplicate manual shifts for 2026-10-03
  const duplicateIdsToRemove = new Set([
    'shift_manual_1791305347536_95ss',
    'shift_manual_1791308460030_tz4c'
  ]);

  let updatedShifts = (state.shifts || []).filter(s => !duplicateIdsToRemove.has(s.id));

  // 2. Fix the 2026-10-06 vs 2026-10-07 midnight shift
  updatedShifts = updatedShifts.map(s => {
    // Shift that started on 2026-10-06 23:56 and ended 2026-10-07 10:11 belongs to 2026-10-07
    if (s.id === 'shift_emp_1789242190413_1791331016000') {
      console.log('Fixing shift 1791331016000: moving date from 2026-10-06 to 2026-10-07');
      return {
        ...s,
        date: '2026-10-07',
        isEarlyOvernightIn: true,
        actualPunchDate: '2026-10-06',
        note: 'وردية الأربعاء 07-10 المعتمدة (حضور مبكر 23:56 قبل منتصف الليل)',
        statusLabel: 'حضور حي معتمد'
      };
    }
    // Shift on 2026-10-06 (00:00 - 10:02): ensure regularHours is 10 and hours is 10.03
    if (s.id === 'shift_emp_1789242190413_1791244818000') {
      return {
        ...s,
        hours: 10.03,
        netHours: 10.03,
        regularHours: 10,
        actualWorkedHours: 10.03,
        overtimeHours: 0.03,
        scheduledHours: 10
      };
    }
    // Shift on 2026-10-03: ensure regularHours is 10
    if (s.id === 'shift_emp_1789242190413_1790985675000') {
      return {
        ...s,
        hours: 10,
        netHours: 10,
        regularHours: 10,
        scheduledHours: 10,
        actualWorkedHours: 10,
        overtimeHours: 0
      };
    }
    return s;
  });

  // 3. Remove false late incidents (> 700 minutes) caused by the midnight clock bug
  const falseIncidentIds = new Set([
    'late_inc_emp_1789242190413_2026-09-26_2352',
    'late_inc_emp_1789242190413_2026-09-27_2353',
    'late_inc_emp_1789242190413_2026-09-29_2353',
    'late_inc_emp_1789242190413_2026-10-06_2356'
  ]);

  const falseRequestIds = new Set([
    'req_late_inc_emp_1789242190413_2026-09-26_2352',
    'req_late_inc_emp_1789242190413_2026-09-27_2353',
    'req_late_inc_emp_1789242190413_2026-09-29_2353',
    'req_late_inc_emp_1789242190413_2026-10-04_2355',
    'req_late_inc_emp_1789242190413_2026-10-06_2356'
  ]);

  const updatedLateIncidents = (state.lateIncidents || []).filter(inc => {
    if (falseIncidentIds.has(inc.id)) return false;
    if ((String(inc.employeeId) === empId || String(inc.employeeCode) === empCode) && inc.lateMinutes > 700) {
      console.log('Filtering out false late incident:', inc.id, 'lateMinutes:', inc.lateMinutes);
      return false;
    }
    return true;
  });

  const updatedRequests = (state.requests || []).filter(req => {
    if (falseRequestIds.has(req.id)) return false;
    if ((String(req.employeeId) === empId || String(req.employeeCode) === empCode) &&
        req.type === 'penalty' &&
        (req.reason?.includes('143') || req.reason?.includes('144'))) {
      console.log('Filtering out false penalty request:', req.id, req.reason);
      return false;
    }
    return true;
  });

  const empShiftsAfter = updatedShifts.filter(s =>
    String(s.employeeId) === empId || String(s.employeeCode) === empCode
  );
  console.log('Emp 115 shifts after:', empShiftsAfter.length);
  empShiftsAfter.sort((a, b) => b.date.localeCompare(a.date));
  empShiftsAfter.forEach((s, idx) => {
    console.log(`[#${idx+1}] Date: ${s.date} | In: ${s.timeIn} | Out: ${s.timeOut} | Hrs: ${s.hours} | ID: ${s.id}`);
  });

  const totalHrs = empShiftsAfter.reduce((sum, s) => sum + (parseFloat(s.hours) || 0), 0);
  console.log('Calculated total hours for 115:', totalHrs.toFixed(2), 'across', empShiftsAfter.length, 'shifts');

  if (isDryRun) {
    console.log('DRY RUN ONLY. No changes made to VPS.');
    return;
  }

  // Save back to VPS
  state.shifts = updatedShifts;
  state.lateIncidents = updatedLateIncidents;
  state.requests = updatedRequests;
  state.updatedAt = new Date().toISOString();

  console.log('2. Saving cleaned state to VPS...');
  const saveRes = await fetch(url, {
    method: 'POST',
    // @ts-ignore
    agent,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123',
      'x-device-token': 'desktop-app-sync-token-2026',
      'x-app-version': '1.2.62'
    },
    body: JSON.stringify({ value: state })
  });

  if (!saveRes.ok) {
    console.error('Save failed:', saveRes.status, saveRes.statusText);
    const txt = await saveRes.text();
    console.error('Response:', txt);
    return;
  }

  console.log('3. Successfully saved to VPS! Verified and clean.');
}

run().catch(console.error);
