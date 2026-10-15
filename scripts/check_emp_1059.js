import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function run() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  console.log('Fetching data from VPS...');
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

  const emp = (state.employees || []).find(e =>
    String(e.code) === '1059' ||
    String(e.deviceUserPin) === '1059' ||
    (e.name && e.name.includes('شيماء'))
  );

  console.log('Employee 1059:', emp ? {
    id: emp.id,
    name: emp.name,
    code: emp.code,
    branch: emp.branch,
    department: emp.department,
    shift: emp.shift,
    schedule: emp.schedule,
    workDays: emp.workDays,
    weeklyOff: emp.weeklyOff,
    workingDays: emp.workingDays,
    dailyHours: emp.dailyHours,
    baseSalary: emp.baseSalary,
    hourlyRate: emp.hourlyRate,
    calculatedHourlyRate: emp.calculatedHourlyRate,
    overtimeMultiplier: emp.overtimeMultiplier,
    customOvertimeRate: emp.customOvertimeRate,
    role: emp.role,
    jobTitle: emp.jobTitle,
    attendanceRules: emp.attendanceRules
  } : 'Not found');

  if (!emp) return;
  const empId = emp.id;

  // Shifts
  const empShifts = (state.shifts || []).filter(s =>
    String(s.employeeCode) === '1059' ||
    String(s.employeeId) === String(empId) ||
    (s.employeeName && s.employeeName.includes('شيماء'))
  );

  console.log(`\nFound ${empShifts.length} shifts for Shaymaa:`);
  empShifts.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timeIn || '').localeCompare(b.timeIn || ''));

  empShifts.forEach((s) => {
    console.log(`Date: ${s.date} | In: ${s.timeIn} | Out: ${s.timeOut} | Hrs: ${s.hours} | Basic: ${s.basicHours} | OT: ${s.overtimeHours} | OTApproved: ${s.approvedOvertimeHours} | OTPending: ${s.pendingOvertimeHours} | OTPaid: ${s.overtimePaid} | Status: ${s.status} | OTStatus: ${s.overtimeStatus} | reqId: ${s.overtimeRequestId || s.requestId} | note: ${s.note || ''} | id: ${s.id}`);
  });

  // Requests
  const allReqs = (state.requests || []).filter(r =>
    String(r.employeeCode) === '1059' ||
    String(r.employeeId) === String(empId) ||
    (r.employeeName && r.employeeName.includes('شيماء')) ||
    r.type?.toLowerCase().includes('overtime') ||
    r.title?.includes('إضافي')
  );

  console.log(`\nFound ${allReqs.length} requests for Shaymaa or overtime:`);
  allReqs.forEach(r => {
    console.log(`Req: ${r.id} | Type: ${r.type} | Date: ${r.date || r.shiftDate} | Hours: ${r.hours || r.overtimeHours} | Status: ${r.status} | Auto: ${r.autoApproved || r.isAuto} | Emp: ${r.employeeName} (${r.employeeCode}) | Details: ${JSON.stringify(r.details || {})}`);
  });

  // Settings for overtime
  console.log('\n--- System Overtime Settings ---');
  const orgSettings = state.orgSettings || state.settings || {};
  console.log({
    overtimePolicy: orgSettings.overtimePolicy,
    autoApproveOvertime: orgSettings.autoApproveOvertime,
    overtimeApprovalRule: orgSettings.overtimeApprovalRule,
    overtimeThreshold: orgSettings.overtimeThreshold,
    overtimeRate: orgSettings.overtimeRate,
    requireOvertimeApproval: orgSettings.requireOvertimeApproval,
    overtimeRequiresApproval: orgSettings.overtimeRequiresApproval,
    attendanceRules: orgSettings.attendanceRules
  });
}

run().catch(console.error);
