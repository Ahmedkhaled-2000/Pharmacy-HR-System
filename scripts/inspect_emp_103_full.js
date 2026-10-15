const https = require('https');

async function inspect103() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'owner',
      'X-App-Password': 'owner123',
      'X-Api-Key': 'pharmacy-system-core-jwt-secret-2026-v1'
    }
  });

  if (!res.ok) {
    console.error('Fetch error:', res.status, await res.text());
    return;
  }

  const data = await res.json();
  const state = data?.value || data;

  const emp103 = (state.employees || []).find(e => 
    String(e.id) === '103' || String(e.code) === '103' || (e.name && e.name.includes('روان'))
  );

  console.log('=== EMP 103 PROFILE ===');
  console.log(emp103);

  if (!emp103) {
    console.error('Employee 103 not found!');
    return;
  }

  const empId = String(emp103.id);
  const empCode = String(emp103.code);

  console.log('\n=== SHIFTS FOR 103 ===');
  const shifts = (state.shifts || []).filter(s => 
    String(s.employeeId) === empId || String(s.employeeCode) === empCode
  );
  console.log(`Total shifts found: ${shifts.length}`);
  shifts.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  shifts.forEach(s => {
    console.log(`Shift: [${s.date}] in: ${s.timeIn} out: ${s.timeOut} hrs: ${s.hours} schHrs: ${s.scheduledHours} OT: ${s.overtimeHours} otStatus: ${s.overtimeStatus} reqOT: ${s.requestedOvertimeHours} id: ${s.id} branchId: ${s.branchId} isLive: ${s.isLiveActive}`);
  });

  console.log('\n=== PUNCHES (state.punches) FOR 103 ===');
  const punches = (state.punches || []).filter(p => 
    String(p.employeeId) === empId || String(p.employeeCode) === empCode
  );
  console.log(`Total punches found: ${punches.length}`);
  punches.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  punches.forEach(p => {
    console.log(`Punch: [${p.date} ${p.time}] type: ${p.type} branch: ${p.branchId} id: ${p.id}`);
  });

  console.log('\n=== REQUESTS FOR 103 ===');
  const requests = (state.requests || []).filter(r => 
    String(r.employeeId) === empId || String(r.employeeCode) === empCode ||
    (r.details && r.details.includes('103')) || (r.reason && r.reason.includes('103'))
  );
  console.log(`Total requests found: ${requests.length}`);
  requests.forEach(r => {
    console.log(`Request: [${r.date || r.createdAt}] type: ${r.type} subType: ${r.subType} status: ${r.status} adminApproved: ${r.adminApproved} otHours: ${r.overtimeHours || r.hours || r.amount} id: ${r.id} reason: ${r.reason || r.details}`);
  });

  console.log('\n=== ADJUSTMENTS FOR 103 ===');
  const adjustments = (state.adjustments || []).filter(a => 
    String(a.employeeId) === empId || String(a.employeeCode) === empCode
  );
  console.log(`Total adjustments found: ${adjustments.length}`);
  adjustments.forEach(a => {
    console.log(`Adjustment: [${a.date}] type: ${a.type} subType: ${a.subType} amt: ${a.amount} hrs: ${a.hours} status: ${a.status} id: ${a.id} reason: ${a.reason || a.notes}`);
  });

  console.log('\n=== ROSTER FOR 103 ===');
  const rosters = (state.rosters || []).filter(r => 
    String(r.employeeId) === empId || String(r.employeeCode) === empCode ||
    (r.schedule && (r.schedule[empId] || r.schedule[empCode]))
  );
  console.log(`Rosters found: ${rosters.length}`);
  rosters.forEach(r => {
    console.log('Roster:', r.month, r.branchId, Object.keys(r.schedule || {}));
  });
}

inspect103();
