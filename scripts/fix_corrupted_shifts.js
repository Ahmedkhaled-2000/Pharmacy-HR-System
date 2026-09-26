import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function main() {
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
  const shifts = state.shifts || [];

  console.log('Total shifts in database:', shifts.length);

  // Focus specifically on employee 107 shift on 2026-09-25
  const s107 = shifts.find(s => s.id === 'shift_emp_1789231413527_1790350081178');
  if (s107) {
    console.log('Found shift for emp 107 on 2026-09-25. Current hours:', s107.hours, 'reg:', s107.regularHours);
    s107.hours = 6.30;
    s107.actualWorkedHours = 6.30;
    s107.regularHours = 6.30;
    s107.scheduledHours = 6;
    s107.overtimeHours = 0;
    s107.overtimeStatus = 'none';
    s107.statusLabel = 'حضور حي';
    s107.deviationStatus = 'approved';
    s107.isScheduleDeviation = false;
    console.log('Updated shift 107 to 6.30 hours!');
  }

  // Also fix the other 4 shifts corrupted by the same UTC 3-hour loss
  const otherFixes = [
    { id: 'shift_emp_1789231533592_1790411651291', h: 5.72, reg: 5.72 },
    { id: 'shift_emp_1789242190413_1790369782601', h: 10.32, reg: 8.00 },
    { id: 'shift_emp_1789328807202_aogrm_1790345484782', h: 7.88, reg: 7.88 },
    { id: 'shift_emp_1789328935407_nadp8_1790315634466', h: 9.18, reg: 8.00 }
  ];

  otherFixes.forEach(fix => {
    const s = shifts.find(sh => sh.id === fix.id);
    if (s) {
      console.log(`Fixing shift ${fix.id} (${s.employeeName}): ${s.hours} -> ${fix.h}`);
      s.hours = fix.h;
      s.actualWorkedHours = fix.h;
      if (s.regularHours !== undefined) s.regularHours = fix.reg;
    }
  });

  console.log('2. Saving updated state back to VPS database...');
  const saveRes = await fetch(url, {
    method: 'POST',
    // @ts-ignore
    agent,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123'
    },
    body: JSON.stringify({ value: state })
  });

  if (!saveRes.ok) {
    console.error('Save failed:', saveRes.status, saveRes.statusText);
    const txt = await saveRes.text();
    console.error('Response:', txt);
    return;
  }

  console.log('3. Successfully saved to VPS! Verifying...');
  const verifyRes = await fetch(url, {
    // @ts-ignore
    agent,
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123'
    }
  });

  const verifyJson = await verifyRes.json();
  const vState = verifyJson?.value || verifyJson;
  const verifiedS107 = (vState.shifts || []).find(s => s.id === 'shift_emp_1789231413527_1790350081178');
  console.log('Verified emp 107 shift:', {
    id: verifiedS107?.id,
    date: verifiedS107?.date,
    branchName: verifiedS107?.branchName,
    timeIn: verifiedS107?.timeIn,
    timeOut: verifiedS107?.timeOut,
    hours: verifiedS107?.hours,
    actualWorkedHours: verifiedS107?.actualWorkedHours,
    regularHours: verifiedS107?.regularHours,
    statusLabel: verifiedS107?.statusLabel
  });
}

main().catch(console.error);
