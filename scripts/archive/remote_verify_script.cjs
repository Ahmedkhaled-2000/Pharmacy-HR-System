const http = require('http');

function fetchState() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:5000/api/settings', (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw).value || {});
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function verify() {
  const state = await fetchState();
  const org = state.orgSettings || {};
  console.log('--- ORG SETTINGS ---');
  console.log('Payroll StartDay:', org.payrollPayoutStartDay);
  console.log('Payroll EndDay:', org.payrollPayoutEndDay);
  console.log('Payroll PayoutDay:', org.payrollPayoutDay);
  console.log('Payroll EndTime:', org.payrollPayoutEndTime);

  // 1. Rawan (103)
  const emp103 = (state.employees || []).find(e => String(e.code) === '103');
  const inc103 = (state.lateIncidents || []).filter(i => String(i.employeeCode) === '103' || (emp103 && String(i.employeeId) === String(emp103.id)));
  const oct13 = inc103.find(i => i.date === '2026-10-13');
  console.log('--- RAWAN (103) 2026-10-13 ---');
  console.log('Penalty Amount:', oct13 ? oct13.penaltyAmount : 'NOT FOUND', 'EGP');
  console.log('Deduction Mins:', oct13 ? oct13.deductionMinutes : 'NOT FOUND');
  console.log('Status:', oct13 ? oct13.status : 'NOT FOUND');

  // 2. Mohamed (105)
  const emp105 = (state.employees || []).find(e => String(e.code) === '105');
  const incs105 = (state.lateIncidents || []).filter(i => (String(i.employeeCode) === '105' || (emp105 && String(i.employeeId) === String(emp105.id))) && !i.isCancelled && i.status === 'approved');
  const reqs105 = (state.requests || []).filter(r => (String(r.employeeCode) === '105' || (emp105 && String(r.employeeId) === String(emp105.id))) && r.subType === 'lateness' && r.status === 'approved' && !r.isCancelled);
  const incTotal105 = incs105.reduce((sum, i) => sum + (parseFloat(i.penaltyAmount) || 0), 0);
  const reqTotal105 = reqs105.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  console.log('--- MOHAMED (105) ---');
  console.log('Approved Incidents Total:', incTotal105.toFixed(2), 'EGP (' + incs105.length + ' incidents)');
  console.log('Approved Requests Total:', reqTotal105.toFixed(2), 'EGP (' + reqs105.length + ' requests)');

  // 3. Neama (1152)
  const emp1152 = (state.employees || []).find(e => String(e.code) === '1152');
  const shifts1152 = (state.shifts || []).filter(s => (String(s.employeeCode) === '1152' || (emp1152 && String(s.employeeId) === String(emp1152.id))) && s.date >= '2026-09-21' && s.date <= '2026-10-20');
  const offDayShifts = shifts1152.filter(s => s.isOffDayWork || s.isScheduledOffDay);
  const regularShifts = shifts1152.filter(s => !s.isOffDayWork && !s.isScheduledOffDay);
  console.log('--- NEAMA (1152) ---');
  console.log('Total Shifts in Cycle (2026-09-21 to 2026-10-20):', shifts1152.length);
  console.log('Regular Workday Shifts:', regularShifts.length);
  console.log('Off-day (Sunday) Shifts:', offDayShifts.length);
  if (regularShifts[0]) {
    console.log('Sample Regular Shift:', {
      date: regularShifts[0].date,
      scheduledHours: regularShifts[0].scheduledHours,
      regularHours: regularShifts[0].regularHours,
      overtimeHours: regularShifts[0].overtimeHours,
      statusLabel: regularShifts[0].statusLabel
    });
  }

  // 4. Overall Shifts in Cycle
  const allCycleShifts = (state.shifts || []).filter(s => s.date >= '2026-09-21' && s.date <= '2026-10-20');
  console.log('--- OVERALL SYSTEM STATS ---');
  console.log('Total Shifts in Oct Cycle (2026-09-21 to 2026-10-20):', allCycleShifts.length);
  console.log('Total Employees:', (state.employees || []).length);
}

verify().catch(console.error);
