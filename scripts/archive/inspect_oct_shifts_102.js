import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function run() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
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

  const empShifts = (state.shifts || []).filter(s =>
    String(s.employeeCode) === '102' || String(s.employeeId) === 'emp_1789143997322'
  );

  empShifts.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timeIn || '').localeCompare(b.timeIn || ''));

  console.log('=== OCTOBER SHIFTS FOR SABRY IBRAHIM (102) ===');
  empShifts.filter(s => s.date >= '2026-10-01').forEach(s => {
    console.log(JSON.stringify({
      id: s.id,
      date: s.date,
      timeIn: s.timeIn,
      timeOut: s.timeOut,
      hours: s.hours,
      regularHours: s.regularHours,
      overtimeHours: s.overtimeHours,
      scheduledHours: s.scheduledHours,
      actualPunchDate: s.actualPunchDate,
      isEarlyOvernightIn: s.isEarlyOvernightIn,
      isManual: s.isManual,
      note: s.note,
      timestamp: s.timestamp ? new Date(s.timestamp).toISOString() : null,
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null
    }, null, 2));
  });
}

run().catch(console.error);
