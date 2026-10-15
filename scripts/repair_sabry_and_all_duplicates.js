import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const isDryRun = !process.argv.includes('--execute');

async function main() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  console.log('1. Fetching live state from VPS...');
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
  const shifts = state.shifts || [];

  console.log(`Initial total shifts in DB: ${shifts.length}`);

  // ── 1. Fix Sabry Ibrahim (102) ──────────────────────────────────────────────
  const sabryId = 'emp_1789143997322';
  const sabryCode = '102';

  // Shifts to update for Sabry:
  const shiftsToUpdateMap = new Map();

  // A. Move Wednesday night shift (00:59 -> 09:00) to 2026-10-07
  shiftsToUpdateMap.set('shift_emp_1789143997322_1791410365097', {
    date: '2026-10-07',
    actualPunchDate: '2026-10-08',
    hours: 8.02,
    netHours: 8.02,
    regularHours: 8.02,
    actualWorkedHours: 8.02,
    scheduledHours: 9,
    note: 'وردية الأربعاء 07-10 المعتمدة (حضور 00:59 صباحاً · انصراف 09:00)'
  });

  // B. Fix hours for 2026-10-06 shift (21:55 -> 11:53) which had hours: 0
  shiftsToUpdateMap.set('shift_emp_1789143997322_1791312903195', {
    hours: 13.97,
    netHours: 13.97,
    regularHours: 9,
    overtimeHours: 4.97,
    actualWorkedHours: 13.97,
    scheduledHours: 9,
    status: 'completed',
    note: 'وردية الثلاثاء 06-10 المعتمدة (21:55 -> 11:53) — إجمالي الساعات: 13.97 س'
  });

  // C. Ensure Thursday active shift (2026-10-08 20:29) has proper label
  shiftsToUpdateMap.set('shift_emp_1789143997322_1791480588323', {
    date: '2026-10-08',
    scheduledHours: 9,
    note: 'تسجيل حضور حي في تمام الساعة 20:29 - قيد العمل الآن (وردية ليلية)'
  });

  // ── 2. Remove Duplicate & Ghost Shifts Company-Wide ────────────────────────
  const idsToDelete = new Set([
    // Adham Samir (104): duplicate manual punch on 2026-09-30
    'punch_manual_1791220347226',

    // Mohamed Ahmed (105): stale unclosed biometric on 2026-09-30 & duplicate manual on 2026-09-28
    'shift_emp_1789231275270_1790763392000',
    'shift_manual_1791308464990_0n4e',

    // Sherif Ashraf (121): duplicate biometric start on 2026-09-29
    'shift_emp_1789244412592_1790703517000',

    // Ahmed Yasser (1151): duplicate manual shift on 2026-09-27
    'shift_manual_1790620799462_owh1',

    // Youssef Hani (1003): duplicate auto-closed stale shift on 2026-09-25
    'mujeyosaxdm87',

    // Neama Mohamed (1152): 10-minute ghost punch on 2026-09-30
    'shift_emp_1789405811945_q0y1k_1790729255000',

    // Eyad Amr (156): 30-minute ghost punch on 2026-09-30
    'shift_emp_1789251322104_1790692946000',

    // Ahmed Khaled (00): ghost punches on 2026-09-22
    'shift_emp_1789278305966_1790027159825',
    'shift_emp_1789278305966_1790027327982'
  ]);

  // Apply shifts deletions and updates
  let updatedShifts = shifts.filter(s => !idsToDelete.has(s.id));
  updatedShifts = updatedShifts.map(s => {
    if (shiftsToUpdateMap.has(s.id)) {
      return { ...s, ...shiftsToUpdateMap.get(s.id) };
    }
    return s;
  });

  console.log(`\nShifts after deletions and updates: ${updatedShifts.length} (removed ${idsToDelete.size} duplicates/ghosts)`);

  // ── 3. Purge Bogus Late Incidents for Sabry (102) ───────────────────────────
  const falseLateIncidentIds = new Set([
    'late_inc_emp_1789143997322_2026-10-01_2152',
    'late_inc_emp_1789143997322_2026-10-02_1847'
  ]);

  const updatedLateIncidents = (state.lateIncidents || []).filter(inc => !falseLateIncidentIds.has(inc.id));
  console.log(`Late incidents: ${state.lateIncidents?.length} -> ${updatedLateIncidents.length}`);

  // Purge any associated penalty requests for Sabry
  const updatedRequests = (state.requests || []).filter(req => {
    if (falseLateIncidentIds.has(req.incidentId) || falseLateIncidentIds.has(req.id)) return false;
    if (req.id === 'req_late_inc_emp_1789143997322_2026-10-01_2152' || req.id === 'req_late_inc_emp_1789143997322_2026-10-02_1847') return false;
    return true;
  });
  console.log(`Requests: ${state.requests?.length} -> ${updatedRequests.length}`);

  // ── 4. Fix Sabry Ibrahim's Roster to Night Shift at Saeed Bakry ─────────────
  let updatedRosters = state.rosters || [];
  if (Array.isArray(updatedRosters)) {
    updatedRosters = updatedRosters.map(r => {
      if (r.id === 'roster_emp_1789143997322_2026-10_1791135834701') {
        return {
          ...r,
          branchName: 'صيدليه سعيد بكري - قناه السويس',
          branchId: 'branch_1789241974051',
          notes: 'جدول الوردية الليلية المعتمد لصيدلية سعيد بكري',
          schedule: {
            "الأحد": { "type": "shift", "start": "00:00", "end": "09:00", "hours": 9, "isOff": false },
            "الاثنين": { "type": "shift", "start": "00:00", "end": "09:00", "hours": 9, "isOff": false },
            "الثلاثاء": { "type": "shift", "start": "00:00", "end": "09:00", "hours": 9, "isOff": false },
            "الأربعاء": { "type": "shift", "start": "00:00", "end": "09:00", "hours": 9, "isOff": false },
            "الخميس": { "type": "shift", "start": "00:00", "end": "09:00", "hours": 9, "isOff": false },
            "الجمعة": { "type": "off", "start": "", "end": "", "hours": 0, "isOff": true },
            "السبت": { "type": "shift", "start": "00:00", "end": "09:00", "hours": 9, "isOff": false }
          }
        };
      }
      return r;
    });
  }

  // ── 5. Verify Sabry Ibrahim's Shifts Sequence ─────────────────────────────
  const sabryShiftsAfter = updatedShifts.filter(s =>
    String(s.employeeId) === sabryId || String(s.employeeCode) === sabryCode
  );
  sabryShiftsAfter.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timeIn || '').localeCompare(a.timeIn || ''));

  console.log('\n=== SABRY IBRAHIM (102) VERIFIED SHIFTS AFTER FIX ===');
  sabryShiftsAfter.forEach((s, idx) => {
    console.log(`[#${idx + 1}] Date: ${s.date} | In: ${s.timeIn} | Out: ${s.timeOut || 'ACTIVE'} | Hrs: ${s.hours} | Note: ${s.note || ''}`);
  });

  const sabryTotalHrs = sabryShiftsAfter.reduce((sum, s) => sum + (parseFloat(s.hours) || 0), 0);
  console.log(`\nTotal verified work hours for Sabry: ${sabryTotalHrs.toFixed(2)} hrs across ${sabryShiftsAfter.length} shifts.`);

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] Run with --execute to commit changes to VPS.');
    return;
  }

  // ── 6. Commit to Live VPS ──────────────────────────────────────────────────
  state.shifts = updatedShifts;
  state.lateIncidents = updatedLateIncidents;
  state.requests = updatedRequests;
  state.rosters = updatedRosters;
  state.updatedAt = new Date().toISOString();

  console.log('\nSaving repaired state to VPS...');
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

  console.log('✅ Successfully committed repairs to live VPS!');
}

main().catch(console.error);
