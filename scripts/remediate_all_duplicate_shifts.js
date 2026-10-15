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

  const json = await res.json();
  const state = json?.value || json;
  const shifts = state.shifts || [];
  const employees = state.employees || [];

  console.log(`Loaded ${shifts.length} total shifts in database.`);

  const toDelete = new Set();
  const toUpdate = [];

  // ── RULE 1: Remove Exact Clones & Approval Double-Trigger Shifts ───────────
  // A. Mohamed Ahmed (105) on 2026-10-04 (13:22 -> 00:24)
  toDelete.add('shift_manual_1791308456833_j4pa');
  toDelete.add('shift_manual_1791305341319_skaw');

  // B. Mohamed Ahmed (105) on 2026-09-30 (10:00 -> 17:40)
  toDelete.add('shift_manual_1791305357891_fgyq'); // Duplicate of shift_manual_1791308462542_4kwf

  // C. Mohamed Ahmed (105) on 2026-09-28
  toDelete.add('shift_manual_1790868675446_mk6p'); // Duplicate of shift_manual_1791133978071_3zw4 (12:40 -> 00:30)
  toDelete.add('shift_manual_1791305359323_7x73'); // Duplicate of shift_manual_1791308464990_0n4e (11:00 -> 17:00)

  // D. Ahmed Yasser (1151) on 2026-09-28 (16:00 -> 23:00)
  toDelete.add('shift_manual_1790868651400_x50j'); // Duplicate of shift_manual_1791133972240_nef3

  // E. Youssef Hani (1003) on 2026-09-23 (09:04 -> 01:53)
  toDelete.add('shift_emp_1789297533363_o4ybs_1790143451115'); // Duplicate of shift_emp_1789297533363_o4ybs_1790172498609

  // F. Mohamed Ahmed (105) on 2026-09-20 (stale shift vs real biometric)
  toDelete.add('stale_1789978417170'); // Duplicate stale shift of shift_bio_1789898173127_fp82

  // G. Anas Khaled (116) on 2026-09-20 (duplicate start 17:29)
  toDelete.add('mubbvl7z8phzq'); // Duplicate of shift_emp_1789328807202_aogrm_1789914562331

  // H. Yassin Mohamed (1153) on 2026-10-04 (stale closed by sweeper vs approved manual punch)
  toDelete.add('shift_emp_1789405981815_igmg9_1791118247000'); // Stale sweeper shift, superseded by shift_emp_..._1791073324000

  // I. Yassin Mohamed (1153) on 2026-09-21 (duplicate biometric for manual approval)
  toDelete.add('shift_emp_1789405981815_igmg9_1790001831844'); // Duplicate biometric of approved manual mubrsqzy5u71e

  // ── RULE 2: Ghost / 0-minute Accidental Punches ─────────────────────────────
  // Sherif Ashraf (121) on 2026-09-22: 20:44 -> 20:46 (0.04 hr)
  toDelete.add('shift_emp_1789244412592_1790099087288');

  // Belal Mohamed (113) on 2026-09-22: 20:44 -> 20:46 (0.04 hr)
  toDelete.add('shift_emp_1789240708342_1790099087287');

  // Yassin Mohamed (1153) on 2026-09-22: 00:41 -> 00:41 (0 hr)
  toDelete.add('shift_emp_1789405981815_igmg9_1790026899118');

  // Toqa Ahmed (1149) on 2026-09-30: 21:14 -> 21:15 (0 hr)
  toDelete.add('shift_emp_1789340155101_iwns1_1790792095137');

  // ── RULE 3: Night Shift Date Adjustments ────────────────────────────────────
  // Sabry Ibrahim (102) on 2026-09-23 (In 23:57, Out 09:23 on 09-24) -> belongs to 2026-09-24
  toUpdate.push({
    id: 'shift_emp_1789143997322_1790197035268',
    changes: {
      date: '2026-09-24',
      isEarlyOvernightIn: true,
      actualPunchDate: '2026-09-23',
      note: 'وردية 24-09 المعتمدة (حضور مبكر 23:57 ليلة الأربعاء/الخميس)'
    }
  });

  // Sabry Ibrahim (102) on 2026-10-01 (In 21:52, Out 09:01 on 10-02) -> belongs to 2026-10-02
  toUpdate.push({
    id: 'shift_emp_1789143997322_1790880777157',
    changes: {
      date: '2026-10-02',
      isEarlyOvernightIn: true,
      actualPunchDate: '2026-10-01',
      note: 'وردية 02-10 المعتمدة (حضور مبكر 21:52 ليلة الخميس/الجمعة)'
    }
  });

  console.log(`\n=== REMEDIATION PLAN SUMMARY ===`);
  console.log(`Shifts to Delete (Duplicates / Ghost punches): ${toDelete.size}`);
  Array.from(toDelete).forEach((id, idx) => {
    const s = shifts.find(sh => sh.id === id);
    console.log(`  [DEL #${idx + 1}] ID: ${id} | Emp: ${s?.employeeName} | Date: ${s?.date} | In: ${s?.timeIn} | Out: ${s?.timeOut} | Note: ${s?.note || s?.notes || '—'}`);
  });

  console.log(`\nShifts to Update (Overnight date reallocation): ${toUpdate.length}`);
  toUpdate.forEach((u, idx) => {
    const s = shifts.find(sh => sh.id === u.id);
    console.log(`  [UPD #${idx + 1}] ID: ${u.id} | Emp: ${s?.employeeName} | Current Date: ${s?.date} -> New Date: ${u.changes.date}`);
  });

  // Apply updates & deletions
  let newShifts = shifts.filter(s => !toDelete.has(s.id));
  newShifts = newShifts.map(s => {
    const upd = toUpdate.find(u => u.id === s.id);
    if (upd) {
      return { ...s, ...upd.changes };
    }
    return s;
  });

  // Filter out bogus late incidents (> 700 mins) caused by circular 24h clock comparison
  const bogusIncidentIds = new Set();
  const newLateIncidents = (state.lateIncidents || []).filter(inc => {
    if (!inc) return false;
    if (inc.lateMinutes > 700) {
      bogusIncidentIds.add(inc.id);
      return false;
    }
    return true;
  });

  const newRequests = (state.requests || []).filter(req => {
    if (!req) return false;
    if (req.type === 'penalty') {
      if (bogusIncidentIds.has(req.incidentId) || bogusIncidentIds.has(req.id)) return false;
      if (req.reason && (req.reason.includes('7') || req.reason.includes('8') || req.reason.includes('9') || req.reason.includes('14')) && req.reason.includes('دقيقة عن موعد ورديته')) {
        const match = req.reason.match(/تأخر الموظف بمقدار (\d+) دقيقة/);
        if (match && parseInt(match[1], 10) > 700) {
          return false;
        }
      }
    }
    return true;
  });

  console.log(`\nFiltered out ${bogusIncidentIds.size} bogus late incidents (> 700 mins) and related penalty requests.`);
  console.log(`Total shifts count after cleanup: ${newShifts.length} (reduced from ${shifts.length})`);

  if (isDryRun) {
    console.log(`\n[DRY RUN MODE] No changes saved to VPS. Run with --execute to commit.`);
    return;
  }

  // Commit to VPS
  state.shifts = newShifts;
  state.lateIncidents = newLateIncidents;
  state.requests = newRequests;
  state.updatedAt = new Date().toISOString();

  console.log(`\n2. Committing cleaned dataset to VPS database...`);
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
    console.error('Commit failed:', saveRes.status, saveRes.statusText);
    const txt = await saveRes.text();
    console.error('Response:', txt);
    return;
  }

  console.log('3. Successfully committed to VPS! Database cleaned and healed.');
}

main().catch(console.error);
