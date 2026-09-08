/**
 * branchMatcher.js
 * وحدة مركزية ذكية وموحدة لمطابقة الفروع وحساب معدلات الأجور والرواتب
 * تحل مشاكل تباين المعرفات (id, branchCode, branchName, سوابق branch_ و BR-)
 * وتحسب سعر الساعة وسعر اليوم والراتب الأساسي بدقة تامة وبأعلى معايير الحوكمة المالية
 */

/**
 * تنظيف وتوحيد معرّف أو كود الفرع للمقارنة المرنة
 */
export function cleanBranchKey(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/^branch_/, '')
    .replace(/^br-?/i, '')
    .replace(/[-_\s]+/g, '');
}

/**
 * استخراج كافة المعرّفات المحتملة لكائن الفرع
 */
export function getBranchIdentifiers(branch) {
  if (!branch) return { ids: new Set(), codes: new Set(), names: new Set(), cleanKeys: new Set() };

  const ids = new Set([
    String(branch.id || '').trim(),
    String(branch.branchId || '').trim()
  ].filter(Boolean));

  const codes = new Set([
    String(branch.branchCode || '').trim().toLowerCase(),
    String(branch.code || '').trim().toLowerCase()
  ].filter(Boolean));

  const names = new Set([
    String(branch.name || '').trim().toLowerCase(),
    String(branch.branchName || '').trim().toLowerCase()
  ].filter(Boolean));

  const cleanKeys = new Set();
  ids.forEach(id => cleanKeys.add(cleanBranchKey(id)));
  codes.forEach(c => cleanKeys.add(cleanBranchKey(c)));

  return { ids, codes, names, cleanKeys };
}

/**
 * التحقق الحازم والمرن مما إذا كان المعرّف يطابق كائن الفرع المحدد
 * @param {string|number|object} candidate - معرّف أو كود أو اسم أو كائن فرع
 * @param {object} branch - كائن الفرع الرئيسي من state.branches
 */
export function isBranchMatch(candidate, branch) {
  if (!candidate || !branch) return false;

  // إذا كان المرشح كائناً
  const candId = typeof candidate === 'object' ? (candidate.branchId || candidate.id || candidate.code || candidate.name) : candidate;
  if (!candId && typeof candId !== 'number') return false;

  const candStr = String(candId).trim();
  const candLower = candStr.toLowerCase();
  const candClean = cleanBranchKey(candStr);

  const bId = String(branch.id || '').trim();
  const bCode = String(branch.branchCode || branch.code || '').trim();
  const bName = String(branch.name || branch.branchName || '').trim();

  // 1. مطابقة مباشرة للمعّرف أو الكود
  if (candStr === bId || candLower === bId.toLowerCase()) return true;
  if (bCode && (candStr === bCode || candLower === bCode.toLowerCase())) return true;

  // 2. مطابقة المفتاح المنظف (مثل 101 يطابق BR-101 و branch_101)
  if (candClean) {
    if (cleanBranchKey(bId) === candClean) return true;
    if (bCode && cleanBranchKey(bCode) === candClean) return true;
  }

  // 3. مطابقة الاسم
  if (bName && (candLower === bName.toLowerCase() || (candLower.length >= 4 && bName.toLowerCase().includes(candLower)))) {
    return true;
  }

  return false;
}

/**
 * استخراج بيانات تعيين الموظف في فرع محدد (الراتب، الساعات، أيام العمل، البريك)
 * تبحث في emp.branchesDetails أولاً، ثم في البيانات الأساسية للموظف emp
 */
export function getEmployeeBranchAssignment(emp, branch) {
  if (!emp || !branch) return null;

  // 1. البحث في مصفوفة الفروع المتعددة branchesDetails
  if (Array.isArray(emp.branchesDetails) && emp.branchesDetails.length > 0) {
    const matchedDetail = emp.branchesDetails.find(bd => isBranchMatch(bd.branchId || bd.id || bd.code, branch));
    if (matchedDetail) {
      return {
        branchId: matchedDetail.branchId || branch.id,
        salary: parseFloat(matchedDetail.salary) || 0,
        workHours: parseFloat(matchedDetail.workHours || matchedDetail.workHoursPerDay) || 8,
        workDays: parseFloat(matchedDetail.workDays || matchedDetail.workDaysPerMonth) || 26,
        breakHours: parseFloat(matchedDetail.breakHours) || 0,
        source: 'branchesDetails'
      };
    }
  }

  // 2. فحص ما إذا كان الفرع الأساسي للموظف يطابق الفرع المطلوب
  const isPrimaryMatch = isBranchMatch(emp.branchId || emp.branchCode || emp.branchName || emp.branch, branch);
  if (isPrimaryMatch) {
    return {
      branchId: emp.branchId || branch.id,
      salary: parseFloat(emp.salary) || 0,
      workHours: parseFloat(emp.workHours || emp.workHoursPerDay) || 8,
      workDays: parseFloat(emp.workDays || emp.workDaysPerMonth) || 26,
      breakHours: parseFloat(emp.breakHours || emp.defaultBreakHours) || 0,
      source: 'primary'
    };
  }

  return null;
}

/**
 * المعادلة المحاسبية المعتمدة لحساب سعر الساعة واليوم والراتب الأساسي الشهري
 * تدعم 3 أنماط من المدخلات:
 * 1. الراتب الشهري الصريح (مثل 6000 أو 16400 ج.م): يحسب سعر اليوم = الراتب / أيام العمل، وسعر الساعة = سعر اليوم / ساعات العمل
 * 2. سعر الساعة الشهري (المعيار الصيدلي 150 - 2000 ج.م، مثل 650 ج.م): الراتب = سعر الساعة الشهري × ساعات العمل اليومية
 * 3. سعر الساعة المباشر (< 150 ج.م، مثل 25 أو 40 ج.م): سعر الساعة المباشر
 */
export function calculateRatesAndSalaries(input = {}) {
  const salaryInput = input?.salaryInput ?? input?.salary ?? input?.baseSalary ?? 0;
  const workHoursPerDay = input?.workHoursPerDay ?? input?.workHours ?? 8;
  const workDaysPerMonth = input?.workDaysPerMonth ?? input?.workDays ?? 26;
  const breakHours = input?.breakHours ?? input?.defaultBreakHours ?? 0;

  const rawSalary = parseFloat(salaryInput) || 0;
  const hours = parseFloat(workHoursPerDay) || 8;
  const days = parseFloat(workDaysPerMonth) || 26;
  const breakH = parseFloat(breakHours) || 0;
  const netHours = Math.max(1, hours - breakH);

  let monthlySalary = 0;
  let dailyRate = 0;
  let hourlyRate = 0;

  if (rawSalary <= 0 || days <= 0 || hours <= 0) {
    return { monthlySalary: 0, dailyRate: 0, hourlyRate: 0, netHours, workHoursPerDay: hours, workDaysPerMonth: days };
  }

  if (rawSalary >= 2000) {
    // النمط 1: إدخال الراتب الشهري الكلي الصريح (مثال: 6000 أو 16400 ج.م)
    monthlySalary = rawSalary;
    dailyRate = Math.round((monthlySalary / days) * 100) / 100;
    hourlyRate = Math.round((dailyRate / netHours) * 100) / 100;
  } else if (rawSalary >= 150) {
    // النمط 2: المعيار المعتمد بنظام الصيدليات (سعر الساعة الشهري، مثال: 600 أو 650 ج.م)
    // الراتب الأساسي الشهري = سعر الساعة الشهري × ساعات العمل اليومية
    monthlySalary = Math.round(rawSalary * hours * 100) / 100;
    // سعر اليوم المعتمد = الراتب الأساسي الشهري / أيام العمل
    dailyRate = Math.round((monthlySalary / days) * 100) / 100;
    // سعر الساعة اليومي الصافي = سعر اليوم / صافي ساعات العمل
    hourlyRate = Math.round((dailyRate / netHours) * 100) / 100;
  } else {
    // النمط 3: إدخال سعر الساعة المباشر (أقل من 150، مثال: 25 ج.م / س)
    hourlyRate = rawSalary;
    dailyRate = Math.round(hourlyRate * netHours * 100) / 100;
    monthlySalary = Math.round(dailyRate * days * 100) / 100;
  }

  return {
    monthlySalary,
    dailyRate,
    hourlyRate,
    netHours,
    workHoursPerDay: hours,
    workDaysPerMonth: days
  };
}
