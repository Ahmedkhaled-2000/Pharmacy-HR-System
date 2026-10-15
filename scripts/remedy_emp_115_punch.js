import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('Fetching system state from https://63-183-147-199.sslip.io/api/settings ...');
  const res = await fetch('https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data', {
    // @ts-ignore
    agent,
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123'
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const state = json?.value || json;

  const empId = 'emp_1789242190413';
  const empCode = '115';

  const shifts = state.shifts || [];
  console.log(`Total shifts in system: ${shifts.length}`);

  // Find 00:45 shift and 10:43 shift
  const targetShift = shifts.find(s => s.id === 'shift_emp_1789242190413_1792014321000');
  const phantomShift = shifts.find(s => s.id === 'shift_emp_1789242190413_1792050226000');

  console.log('Target Shift (00:45):', targetShift ? { id: targetShift.id, in: targetShift.timeIn, out: targetShift.timeOut, status: targetShift.status } : 'NOT FOUND');
  console.log('Phantom Shift (10:43):', phantomShift ? { id: phantomShift.id, in: phantomShift.timeIn, out: phantomShift.timeOut, status: phantomShift.status } : 'NOT FOUND');

  if (!targetShift) {
    console.error('Target shift not found!');
    return;
  }

  // Update target shift with real 10:43 checkout
  targetShift.timeOut = '10:43';
  targetShift.timeOutDate = '2026-10-15';
  targetShift.hours = 9.97;
  targetShift.actualWorkedHours = 9.97;
  targetShift.netHours = 9.97;
  targetShift.regularHours = 9.97;
  targetShift.scheduledHours = 10;
  targetShift.isLiveActive = false;
  targetShift.status = 'completed';
  targetShift.statusLabel = 'حضور وانصراف مكتمل (بصمة ZKTeco MB20)';
  targetShift.notes = 'وردية ليلية مكتملة (حضور: 00:45 - انصراف: 10:43 عبر جهاز بصمة منار الكومي - تم تصحيح الانصراف)';

  // Remove phantom shift if present
  let newShifts = shifts.filter(s => s.id !== 'shift_emp_1789242190413_1792050226000');

  // Update target shift in array
  newShifts = newShifts.map(s => s.id === targetShift.id ? targetShift : s);

  // Clean activeShifts
  const activeShifts = { ...(state.activeShifts || {}) };
  let removedActiveCount = 0;
  if (activeShifts['115']) {
    delete activeShifts['115'];
    removedActiveCount++;
  }
  if (activeShifts['emp_1789242190413']) {
    delete activeShifts['emp_1789242190413'];
    removedActiveCount++;
  }
  console.log(`Removed ${removedActiveCount} active shift keys for 115.`);

  state.shifts = newShifts;
  state.activeShifts = activeShifts;
  state.updatedAt = new Date().toISOString();

  if (isDryRun) {
    console.log('DRY RUN: Updated target shift:', targetShift);
    console.log(`Shifts count before: ${shifts.length}, after: ${newShifts.length}`);
    return;
  }

  console.log('Saving updated state to VPS...');
  const saveRes = await fetch('https://63-183-147-199.sslip.io/api/settings', {
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
    body: JSON.stringify({
      key: 'pharmacy-tracker-data',
      value: state
    })
  });

  if (!saveRes.ok) {
    const errText = await saveRes.text();
    throw new Error(`Save failed (${saveRes.status}): ${errText}`);
  }

  const saveJson = await saveRes.json();
  console.log('Save response:', saveJson);
  console.log('SUCCESS: Employee 115 shift record repaired successfully in pharmacy-tracker-data!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
