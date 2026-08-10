export const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function arabicMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${AR_MONTHS[idx]} ${y} (الشهر ${m})`;
}

export function arabicWeekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return AR_WEEKDAYS[d.getDay()];
}

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function nowTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function parseArabicFloat(val) {
  if (val === undefined || val === null || val === '') return 0;
  const str = String(val)
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/,/g, '.');
  return parseFloat(str) || 0;
}

export function fmt(n) {
  const num = parseArabicFloat(n);
  return (Math.round(num * 100) / 100).toFixed(2);
}

export function normalizeState(parsed) {
  let employees = [];
  if (Array.isArray(parsed.employees) && parsed.employees.length > 0) {
    employees = parsed.employees.map((e) => ({
      ...e,
      phone: e.phone || '',
      username: e.username || e.code || ''
    }));
  } else if (parsed.jobs && typeof parsed.jobs === 'object') {
    Object.entries(parsed.jobs).forEach(([id, job], idx) => {
      employees.push({
        id,
        code: String(101 + idx),
        username: String(101 + idx),
        name: job.name || (id === 'dataentry' ? 'مدخل بيانات' : 'مساعد صيدلي'),
        phone: '01000000000',
        jobTitle: job.name || 'موظف',
        salary: typeof job.salary === 'number' ? job.salary : (parseFloat(job.salary) || 0),
        workHoursPerDay: parseFloat(job.workHoursPerDay) > 0 ? parseFloat(job.workHoursPerDay) : 8,
        workDaysPerMonth: parseFloat(job.workDaysPerMonth) > 0 ? parseFloat(job.workDaysPerMonth) : 26,
        password: '123',
        photoUrl: '',
        createdAt: todayStr()
      });
    });
  } else {
    employees = [
      {
        id: 'emp_101',
        code: '101',
        username: '101',
        name: 'أحمد محمود',
        phone: '01012345678',
        jobTitle: 'مساعد صيدلي',
        salary: 4000,
        workHoursPerDay: 8,
        workDaysPerMonth: 26,
        password: '123',
        photoUrl: '',
        createdAt: todayStr(),
        devices: []
      }
    ];
  }

  // Ensure existing employees have a devices array
  employees = employees.map(emp => ({
    ...emp,
    devices: emp.devices || []
  }));

  const orgSettings = {
    orgName: 'مؤسسة الموارد البشرية والبصمات',
    logoUrl: '',
    waServerUrl: 'https://funny-sloth-89.loca.lt',
    adminUsername: 'admin',
    adminPassword: '123',
    ...(parsed.orgSettings || {})
  };

  const shifts = (parsed.shifts || []).map((s) => ({
    ...s,
    employeeId: s.employeeId || s.jobId || (employees[0] ? employees[0].id : 'emp_101')
  }));

  const adjustments = (parsed.adjustments || []).map((a) => ({
    ...a,
    employeeId: a.employeeId || a.jobId || 'all'
  }));

  const activeShifts = parsed.activeShifts || {};
  const ipRestrictions = parsed.ipRestrictions || { enabled: false, allowedIps: [] };
  const authorizedDevices = parsed.authorizedDevices || [];

  return { ...parsed, orgSettings, employees, shifts, activeShifts, adjustments, ipRestrictions, authorizedDevices };
}
