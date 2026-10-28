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

  const emp103 = (state.employees || []).find(e => String(e.code) === '103' || (e.name && e.name.includes('روان')));
  console.log('Emp 103:', emp103 ? { id: emp103.id, code: emp103.code, name: emp103.name, salary: emp103.salary, branchId: emp103.branchId } : 'NOT FOUND');

  const lates103 = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp103?.id) || String(i.employeeCode) === '103');
  console.log('Late incidents for 103 (count ' + lates103.length + '):', JSON.stringify(lates103, null, 2));

  const adjs103 = (state.adjustments || []).filter(a => String(a.employeeId) === String(emp103?.id) || String(a.employeeCode) === '103');
  console.log('Adjustments for 103 (count ' + adjs103.length + '):', JSON.stringify(adjs103, null, 2));

  const reqs103 = (state.requests || []).filter(r => String(r.employeeId) === String(emp103?.id) || String(r.employeeCode) === '103');
  console.log('Penalty requests for 103:', JSON.stringify(reqs103.filter(r => r.type?.includes('penalty') || r.type?.includes('late')), null, 2));
}
main();
