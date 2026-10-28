async function main() {
  const url = 'http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data';
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

  console.log('=== FIND LATE INCIDENTS FOR 2026-10-13 ===');
  const latesOct13 = (state.lateIncidents || []).filter(i => i.date === '2026-10-13');
  console.log('Total lates on 2026-10-13:', latesOct13.length);
  latesOct13.forEach(l => {
    console.log(l.id, '| Emp:', l.employeeId, l.employeeCode, l.employeeName, '| Late:', l.lateMinutes, '| Amount:', l.penaltyAmount, '| Status:', l.status, '| Waived:', l.waived);
  });

  console.log('\n=== ALL LATE INCIDENTS FOR RAWAN (103) ===');
  const allRawanLates = (state.lateIncidents || []).filter(i => 
    String(i.employeeCode) === '103' || 
    String(i.employeeId) === 'emp_1789144674736' ||
    (i.employeeName && i.employeeName.includes('روان'))
  );
  console.log('Total rawan lates:', allRawanLates.length);
  allRawanLates.forEach(l => {
    console.log(l.id, '| Date:', l.date, '| Late:', l.lateMinutes, '| Amount:', l.penaltyAmount, '| Status:', l.status, '| Waived:', l.waived, '| Cancelled:', l.isCancelled);
  });
}
main();
