const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

const remoteCode = `
const http = require('http');
http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(raw);
      const state = parsed.value || {};
      
      console.log('=== EMPLOYEES INSPECTION ===');
      const emps = state.employees || [];
      const emp103 = emps.find(e => String(e.code) === '103' || (e.name && e.name.includes('روان')));
      const emp105 = emps.find(e => String(e.code) === '105' || (e.name && e.name.includes('محمد احمد محمد حسين')));
      const emp1152 = emps.find(e => String(e.code) === '1152' || (e.name && e.name.includes('نعمه')));

      console.log('Emp 103 (Rawan):', emp103 ? { id: emp103.id, code: emp103.code, name: emp103.name, branchId: emp103.branchId, salary: emp103.salary, noMonthlySchedule: emp103.noMonthlySchedule } : 'NOT FOUND');
      console.log('Emp 105 (Mohamed):', emp105 ? { id: emp105.id, code: emp105.code, name: emp105.name, branchId: emp105.branchId, salary: emp105.salary, noMonthlySchedule: emp105.noMonthlySchedule } : 'NOT FOUND');
      console.log('Emp 1152 (Neama):', emp1152 ? { id: emp1152.id, code: emp1152.code, name: emp1152.name, branchId: emp1152.branchId, salary: emp1152.salary, noMonthlySchedule: emp1152.noMonthlySchedule, weeklyRestDays: emp1152.weeklyRestDays } : 'NOT FOUND');

      console.log('\\n=== 1. RAWAN (103) LATE INCIDENTS & ADJUSTMENTS ===');
      const lates103 = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp103?.id) || String(i.employeeCode) === '103');
      console.log('Late incidents for 103:', JSON.stringify(lates103, null, 2));
      const adjs103 = (state.adjustments || []).filter(a => String(a.employeeId) === String(emp103?.id) || String(a.employeeCode) === '103');
      console.log('Adjustments for 103:', JSON.stringify(adjs103, null, 2));

      console.log('\\n=== 2. MOHAMED (105) LATE INCIDENTS & ADJUSTMENTS ===');
      const lates105 = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp105?.id) || String(i.employeeCode) === '105');
      console.log('Late incidents for 105 (count ' + lates105.length + '):', JSON.stringify(lates105.map(i => ({ id: i.id, date: i.date, lateMinutes: i.lateMinutes, deductionMinutes: i.deductionMinutes, penaltyAmount: i.penaltyAmount, status: i.status })), null, 2));
      const adjs105 = (state.adjustments || []).filter(a => String(a.employeeId) === String(emp105?.id) || String(a.employeeCode) === '105');
      console.log('Adjustments for 105 (count ' + adjs105.length + '):', JSON.stringify(adjs105, null, 2));
      const reqs105 = (state.requests || []).filter(r => (String(r.employeeId) === String(emp105?.id) || String(r.employeeCode) === '105') && (r.type === 'penalty' || r.type === 'violation' || r.type === 'deduction' || r.type === 'lateness'));
      console.log('Penalty requests for 105 (count ' + reqs105.length + '):', JSON.stringify(reqs105, null, 2));

      console.log('\\n=== 3. NEAMA (1152) ROSTERS, SHIFTS, LEAVES ===');
      const rosters1152 = (state.rosters || []).filter(r => String(r.employeeId) === String(emp1152?.id) || String(r.employeeCode) === '1152');
      console.log('Rosters for 1152 (count ' + rosters1152.length + '):', JSON.stringify(rosters1152.map(r => ({ id: r.id, branchId: r.branchId, status: r.status, fromDate: r.fromDate, toDate: r.toDate, hasSchedule: Boolean(r.schedule), scheduleKeys: r.schedule ? Object.keys(r.schedule) : [] })), null, 2));
      if (rosters1152.length > 0 && rosters1152[0].schedule) {
        console.log('Roster 0 schedule sample:', JSON.stringify(rosters1152[0].schedule, null, 2));
      }
      const leaves1152 = (state.requests || []).filter(r => (String(r.employeeId) === String(emp1152?.id) || String(r.employeeCode) === '1152') && (r.type?.includes('leave') || r.leaveType));
      console.log('Leaves for 1152:', JSON.stringify(leaves1152, null, 2));
      const shifts1152 = (state.shifts || []).filter(s => String(s.employeeId) === String(emp1152?.id) || String(s.employeeCode) === '1152');
      console.log('Shifts for 1152 (count ' + shifts1152.length + '):', JSON.stringify(shifts1152.slice(0, 5).map(s => ({ id: s.id, date: s.date, timeIn: s.timeIn, timeOut: s.timeOut, hours: s.hours, actualWorkedHours: s.actualWorkedHours, branchId: s.branchId, status: s.status, isOffDayWork: s.isOffDayWork, overtimeHours: s.overtimeHours })), null, 2));

    } catch (e) {
      console.error('Error:', e.message);
    }
  });
}).on('error', e => console.error(e.message));
`;

fs.writeFileSync('temp_inspect_issues.cjs', remoteCode);
try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_inspect_issues.cjs ${host}:/tmp/temp_inspect_issues.cjs`);
  const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_inspect_issues.cjs hr-backend-server:/app/temp_inspect_issues.cjs && sudo docker exec hr-backend-server node /app/temp_inspect_issues.cjs"`).toString();
  console.log(output);
} finally {
  try { fs.unlinkSync('temp_inspect_issues.cjs'); } catch {}
}
