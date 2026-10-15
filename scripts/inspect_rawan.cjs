async function main() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'owner',
      'X-App-Password': 'owner123',
      'X-Api-Key': 'pharmacy-system-core-jwt-secret-2026-v1'
    }
  });
  const data = await res.json();
  const state = data?.value || data;

  const empId = 'emp_1789144674736';
  const empCode = '103';

  console.log('=== ALL SHIFTS MATCHING ID OR CODE OR NAME ===');
  const allShifts = (state.shifts || []).filter(s => 
    String(s.employeeId) === empId || String(s.employeeCode) === empCode ||
    String(s.employeeId) === '103' || String(s.employeeCode) === empId ||
    (s.employeeName && s.employeeName.includes('روان'))
  );
  allShifts.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  console.log('Shifts found:', allShifts.length);
  allShifts.forEach(s => {
    console.log('[' + s.date + '] ID: ' + s.id + ' | empId: ' + s.employeeId + ' | empCode: ' + s.employeeCode + ' | In: ' + s.timeIn + ' | Out: ' + s.timeOut + ' | Hrs: ' + s.hours + ' | OT: ' + s.overtimeHours + ' | otStat: ' + s.overtimeStatus);
  });

  console.log('\n=== ALL PUNCHES (state.punches) MATCHING ID OR CODE OR NAME ===');
  const allPunches = (state.punches || []).filter(p => 
    String(p.employeeId) === empId || String(p.employeeCode) === empCode ||
    String(p.employeeId) === '103' || String(p.employeeCode) === empId ||
    (p.employeeName && p.employeeName.includes('روان'))
  );
  allPunches.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  console.log('Punches found:', allPunches.length);
  allPunches.forEach(p => {
    console.log('[' + p.date + ' ' + p.time + '] ID: ' + p.id + ' | empId: ' + p.employeeId + ' | empCode: ' + p.employeeCode + ' | type: ' + p.type + ' | punchType: ' + p.punchType + ' | branch: ' + p.branchId);
  });
}
main();
