/**
 * digestDataEngine.js
 * محرك تجميع وتحليل بيانات المنظومة الحية للتقرير والملخص الشامل
 * يضمن التطابق التام 100% بين ما يظهر في شاشة الـ Dashboard وما يرسل في بريد الجيميل
 */

import { getRealTodayStr, getRealNowTimeStr } from './timeEngine';
import { fmt } from './formatters';

/**
 * قاموس تعريب وتوحيد مسميات كافة أنواع الطلبات في المنظومة لضمان عدم ظهور أي نصوص إنجليزية في التقارير
 */
export const DIGEST_REQUEST_TYPE_MAP = {
  // إجازات
  leave: '🏖️ طلب إجازة',
  leave_request: '🏖️ طلب إجازة',
  annual_leave: '🏖️ إجازة سنوية',
  sick_leave: '🩺 إجازة مرضية',
  emergency_leave: '🚨 إجازة عارضة',
  unpaid_leave: '🏖️ إجازة بدون راتب',
  casual_leave: '🌴 إجازة عارضة',
  marriage_leave: '💍 إجازة زواج',
  maternity_leave: '👶 إجازة وضع',
  bereavement_leave: '🖤 إجازة وفاة',

  // أذونات ومواعيد
  permission: '⏰ أذونات وخروج',
  permission_request: '⏰ أذونات وخروج',
  early_exit: '⏰ خروج مبكر',
  early_leave: '⏰ خروج مبكر',
  late_permission: '⏰ إذن تأخير',
  late_excuse: '⏰ عذر تأخير',
  lateness: '⏱️ تأخير',

  // ماليات وسلف
  loan: '💳 سلف نقدية',
  advance: '💳 سلف نقدية',
  meds: '💊 سحب أدوية آجل',
  credit_medicine: '💊 سحب أدوية آجل',
  medicine_request: '💊 سحب أدوية آجل',
  bonus: '🎁 مكافأة مالية',
  reward: '🏆 مكافأة مالية',
  deduction: '⚠️ خصم مالي',
  adjustment: '⚖️ تسوية مالية',
  overtime: '⏱️ ساعات إضافية',
  overtime_request: '⏱️ ساعات إضافية',

  // جزاءات وتأديب وتظلمات
  penalty: '⚖️ جزاء تأديبي',
  disciplinary_penalty: '⚖️ جزاء تأديبي',
  violation: '⚠️ مخالفة تأديبية',
  disciplinary_violation: '⚠️ مخالفة تأديبية',
  penalty_objection: '⚖️ تظلم من جزاء',
  objection: '⚖️ تظلم من جزاء',
  late_penalty: '⏱️ جزاء تأخير',

  // جداول وورديات
  swap: '🔄 تبديل ورديات',
  shift_swap: '🔄 تبديل ورديات',
  shift_edit: '🔄 تعديل وردية',
  roster: '📅 الجدول الشهري',
  roster_update: '📅 تعديل الجدول الشهري',
  roster_edit: '📅 تعديل الجدول الشهري',
  roster_edit_request: '📅 طلب تعديل جدول',
  schedule_edit: '📅 تعديل الجدول',

  // بصمات
  punch_correction: '📸 تعديل بصمة',
  manual_punch: '📸 بصمة يدوية',
  attendance_punch: '📸 تأكيد بصمة',
  biometric_registration: '🔐 تسجيل بصمة',
  biometric_reset: '🔄 إعادة ضبط بصمة',
  biometric_verification: '📸 اعتماد بصمة وجه',

  // بيانات وتقييم
  profile_update: '👤 تحديث بيانات',
  profile_edit: '👤 تحديث بيانات',
  evaluation: '⭐ تقييم أداء',
  emp_evaluation: '⭐ تقييم أداء',
  manager_eval: '⭐ تقييم أداء',
  eval_edit_request: '⭐ مراجعة تقييم',

  // استقالات وشكاوى وتوظيف
  resignation: '🚪 طلب استقالة',
  resignation_request: '🚪 طلب استقالة',
  withdraw: '↩️ تراجع عن استقالة',
  resignation_withdraw: '↩️ تراجع عن استقالة',
  complaint: '📨 شكاوى ومقترحات',
  recruitment: '📝 طلب توظيف',
  recruitment_application: '📝 طلب توظيف',
  job_application: '📝 طلب توظيف'
};

export function getDigestRequestTypeLabel(type) {
  if (!type) return '📋 طلب عام';
  const clean = String(type).trim().toLowerCase();
  if (DIGEST_REQUEST_TYPE_MAP[clean]) return DIGEST_REQUEST_TYPE_MAP[clean];

  // Normalized fallback matching based on keywords
  if (clean.includes('penalty') || clean.includes('disc') || clean.includes('violation')) return '⚖️ جزاء تأديبي';
  if (clean.includes('meds') || clean.includes('medicine') || clean.includes('credit')) return '💊 سحب أدوية آجل';
  if (clean.includes('loan') || clean.includes('advance') || clean.includes('سلف')) return '💳 سلف نقدية';
  if (clean.includes('roster') || clean.includes('schedule')) return '📅 تعديل الجدول';
  if (clean.includes('leave') || clean.includes('إجاز')) return '🏖️ طلب إجازة';
  if (clean.includes('permis') || clean.includes('exit') || clean.includes('خروج') || clean.includes('إذن')) return '⏰ أذونات وخروج';
  if (clean.includes('punch') || clean.includes('biometric') || clean.includes('بصم')) return '📸 تعديل بصمة';
  if (clean.includes('swap') || clean.includes('shift') || clean.includes('ورد')) return '🔄 تبديل ورديات';
  if (clean.includes('profile') || clean.includes('update') || clean.includes('بيان')) return '👤 تحديث بيانات';
  if (clean.includes('bonus') || clean.includes('reward') || clean.includes('مكاف')) return '🎁 مكافأة مالية';
  if (clean.includes('deduct') || clean.includes('خصم')) return '⚠️ خصم مالي';
  if (clean.includes('overtime') || clean.includes('إضاف')) return '⏱️ ساعات إضافية';
  if (clean.includes('resign') || clean.includes('استقال')) return '🚪 طلب استقالة';
  if (clean.includes('eval') || clean.includes('تقييم')) return '⭐ تقييم أداء';
  if (clean.includes('complaint') || clean.includes('شكو')) return '📨 شكاوى ومقترحات';

  return `📋 ${String(type).replace(/[_-]/g, ' ')}`;
}

/**
 * فحص انتماء الموظف للفرع
 */
export function empBelongsToBranch(emp, branchId) {
  if (!emp || !branchId) return false;
  if (String(emp.branchId) === String(branchId)) return true;
  if (emp.branchesDetails && Array.isArray(emp.branchesDetails)) {
    return emp.branchesDetails.some((bd) => bd && String(bd.branchId) === String(branchId));
  }
  return false;
}

/**
 * تجميع البيانات الكاملة والمحدثة لحظياً للملخص اليومي الشامل
 */
export function compileDailyDigestData(state, targetDate = getRealTodayStr()) {
  if (!state) {
    return {
      dateStr: targetDate,
      timeGenerated: getRealNowTimeStr(false),
      employeesCount: 0,
      presentCount: 0,
      absentCount: 0,
      activeShiftsCount: 0,
      completedShiftsCount: 0,
      totalHoursToday: 0,
      branchSummaries: [],
      requestsSummary: {
        totalToday: 0,
        pendingCount: 0,
        approvedTodayCount: 0,
        rejectedTodayCount: 0,
        byType: {},
        recentRequests: []
      },
      financeSummary: {
        totalSales: 0,
        totalIncome: 0,
        totalExpense: 0,
        netCashFlow: 0,
        bonusTotalToday: 0,
        deductionTotalToday: 0,
        byBranch: []
      }
    };
  }

  const employees = (state.employees || []).filter((e) => e && typeof e === 'object' && (e.id || e.code) && !e.isTerminated && e.status !== 'تم الاستقالة');
  const branches = (state.branches || []).filter((b) => b && typeof b === 'object' && b.id);
  const activeShiftsRaw = state.activeShifts || {};
  const activeShiftsMap = {};
  if (Array.isArray(activeShiftsRaw)) {
    activeShiftsRaw.forEach((s) => {
      if (s && (s.employeeId || s.id)) {
        activeShiftsMap[String(s.employeeId || s.id)] = s;
      }
    });
  } else if (typeof activeShiftsRaw === 'object' && activeShiftsRaw !== null) {
    Object.assign(activeShiftsMap, activeShiftsRaw);
  }

  // 1. الشفتات المسجلة اليوم (تطابق التاريخ أو الطابع الزمني)
  const allShifts = state.shifts || [];
  const todayCompletedShifts = allShifts.filter((s) => {
    if (!s) return false;
    const sDate = s.date || (s.timestamp ? String(s.timestamp).slice(0, 10) : '');
    return sDate === targetDate;
  });

  // الموظفون الذين لديهم شفتات نشطة جارية الآن
  const activeEmpIds = Object.keys(activeShiftsMap).filter((empId) => {
    const act = activeShiftsMap[empId];
    if (!act) return false;
    const actDate = act.date || (act.startTime ? String(act.startTime).slice(0, 10) : targetDate);
    return actDate === targetDate;
  });

  // معرفات الموظفين الحاضرين (منتهي + نشط حالياً)
  const presentEmpIdsSet = new Set([
    ...todayCompletedShifts.map((s) => String(s.employeeId)),
    ...activeEmpIds.map((id) => String(id))
  ]);

  const presentCount = presentEmpIdsSet.size;
  const absentCount = Math.max(0, employees.length - presentCount);
  const totalHoursToday = todayCompletedShifts.reduce((acc, s) => acc + (parseFloat(s.hours) || parseFloat(s.workHours) || 0), 0);

  // 2. تفصيل الحضور حسب الفروع
  const branchSummaries = branches.map((branch) => {
    const bId = String(branch.id);
    const branchEmps = employees.filter((e) => empBelongsToBranch(e, bId));
    
    // شفتات الفرع المكتملة
    const branchShifts = todayCompletedShifts.filter((s) => {
      if (s.branchId) return String(s.branchId) === bId;
      const emp = employees.find((e) => String(e.id) === String(s.employeeId));
      return emp && empBelongsToBranch(emp, bId);
    });

    // موظفو الفرع الذين هم على رأس عملهم حالياً
    const branchActiveEmps = branchEmps.filter((e) => {
      const act = activeShiftsMap[e.id];
      return act && String(act.branchId || e.branchId) === bId;
    });

    // قائمة الموظفين الحاضرين بالفرع
    const branchPresentEmpDetails = [];
    const recordedPresentEmpIds = new Set();

    branchActiveEmps.forEach((e) => {
      const act = activeShiftsMap[e.id];
      recordedPresentEmpIds.add(String(e.id));
      branchPresentEmpDetails.push({
        id: e.id,
        name: e.name,
        code: e.code || '—',
        role: e.jobTitle || 'موظف',
        status: 'على رأس العمل حالياً 🟢',
        timeIn: act.startTime ? (typeof act.startTime === 'string' ? (act.startTime.slice(11, 16) || act.startTime) : String(act.startTime)) : '—',
        punchType: act.source || 'بصمة حية'
      });
    });

    branchShifts.forEach((s) => {
      const empIdStr = String(s.employeeId);
      if (!recordedPresentEmpIds.has(empIdStr)) {
        const emp = employees.find((e) => String(e.id) === empIdStr);
        recordedPresentEmpIds.add(empIdStr);
        branchPresentEmpDetails.push({
          id: empIdStr,
          name: emp?.name || s.employeeName || 'موظف',
          code: emp?.code || '—',
          role: emp?.jobTitle || 'موظف',
          status: 'أتم الوردية ⏱️',
          timeIn: s.timeIn || '—',
          timeOut: s.timeOut || '—',
          hours: s.hours || 0,
          punchType: s.source || 'بصمة عادية'
        });
      }
    });

    // الموظفون الغائبون في هذا الفرع
    const branchAbsentEmps = branchEmps.filter((e) => !recordedPresentEmpIds.has(String(e.id)));

    return {
      id: bId,
      name: branch.name,
      address: branch.address || '',
      openingTime: branch.openingTime || '',
      closingTime: branch.closingTime || '',
      totalEmployees: branchEmps.length,
      presentCount: recordedPresentEmpIds.size,
      absentCount: branchAbsentEmps.length,
      presentEmployees: branchPresentEmpDetails,
      absentEmployees: branchAbsentEmps.map((e) => ({
        id: e.id,
        name: e.name,
        code: e.code || '—',
        role: e.jobTitle || 'موظف'
      }))
    };
  });

  // 3. جمع كافة الطلبات المتنوعة وتصنيفها
  const rawRequests = [
    ...(state.requests || []),
    ...(state.leaveRequests || [])
  ].filter((r) => r && typeof r === 'object');

  // إزالة التكرار إن وُجد
  const uniqueRequestsMap = new Map();
  rawRequests.forEach((r) => {
    const key = r.id || `${r.employeeId}_${r.date}_${r.type}`;
    if (!uniqueRequestsMap.has(key)) uniqueRequestsMap.set(key, r);
  });
  const allUniqueRequests = Array.from(uniqueRequestsMap.values());

  // طلبات اليوم أو المسجلة كمعلقة بانتظار الإدارة
  const pendingRequests = allUniqueRequests.filter((r) => 
    r.status === 'pending' || r.status === 'pending_admin' || !r.branchApproved || r.adminStatus === 'pending'
  );

  const approvedTodayRequests = allUniqueRequests.filter((r) => {
    const isApproved = r.status === 'approved' || r.adminStatus === 'approved';
    const isToday = r.date === targetDate || (r.approvedAt && String(r.approvedAt).startsWith(targetDate)) || (r.updatedAt && String(r.updatedAt).startsWith(targetDate));
    return isApproved && isToday;
  });

  const rejectedTodayRequests = allUniqueRequests.filter((r) => {
    const isRejected = r.status === 'rejected' || r.adminStatus === 'rejected';
    const isToday = r.date === targetDate || (r.rejectedAt && String(r.rejectedAt).startsWith(targetDate));
    return isRejected && isToday;
  });

  // 3. تصنيف وترجمة كافة الطلبات المتنوعة للغة العربية بدقة
  const requestsByType = {};
  allUniqueRequests.forEach((r) => {
    const cat = getDigestRequestTypeLabel(r.type || r.requestType);
    requestsByType[cat] = (requestsByType[cat] || 0) + 1;
  });

  // تجهيز قائمة تفصيلية بأهم وأحدث الطلبات لعرضها في جدول التقرير بمسميات عربية صريحة
  const detailedRequests = allUniqueRequests.slice(0, 25).map((r) => {
    const emp = employees.find((e) => String(e.id) === String(r.employeeId));
    let branchName = r.branchName || emp?.branchName || '';
    if (!branchName && (r.branchId || emp?.branchId)) {
      const bObj = branches.find((b) => String(b.id) === String(r.branchId || emp?.branchId));
      branchName = bObj ? bObj.name : '';
    }

    let statusLabel = 'معلق بالإدارة ⏳';
    let statusColor = '#d97706';
    if (r.status === 'approved' || r.adminStatus === 'approved') {
      statusLabel = 'معتمد ✅';
      statusColor = '#16a34a';
    } else if (r.status === 'rejected' || r.adminStatus === 'rejected') {
      statusLabel = 'مرفوض ❌';
      statusColor = '#dc2626';
    } else if (r.branchApproved && !r.adminApproved) {
      statusLabel = 'موافقة فرع (بانتظار الإدارة) 📝';
      statusColor = '#0284c7';
    }

    let detailsText = r.reason || r.notes || r.details || r.subject || '—';
    if (r.amount) detailsText += ` (${fmt(r.amount)} ج.م)`;
    if (r.daysCount) detailsText += ` (${r.daysCount} أيام)`;
    if (r.hours) detailsText += ` (${r.hours} ساعة)`;

    return {
      id: r.id,
      empName: emp?.name || r.employeeName || 'موظف',
      empCode: emp?.code || '—',
      branchName: branchName || 'المركز الرئيسي',
      typeLabel: getDigestRequestTypeLabel(r.type || r.requestType),
      details: detailsText,
      statusLabel,
      statusColor,
      date: r.date || (r.createdAt ? String(r.createdAt).slice(0, 10) : targetDate)
    };
  });

  // 4. الحركة المالية ومبيعات الفروع الحية
  const branchSales = state.branchSales || [];
  const currentMonth = targetDate.slice(0, 7);
  const monthTargets = (state.branchSalesTargets && typeof state.branchSalesTargets === 'object')
    ? (state.branchSalesTargets[currentMonth] || {})
    : {};

  // مبيعات تاريخ التقرير (اليوم)
  const todaySales = branchSales.filter((s) => s && s.date === targetDate);

  // مبيعات الشهر الحالي
  const monthSales = branchSales.filter((s) => s && s.date && s.date.slice(0, 7) === currentMonth);

  // تحديد آخر تاريخ سُجلت فيه مبيعات في النظام إذا لم تسجل مبيعات اليوم بعد
  let latestSalesDate = '';
  if (branchSales.length > 0) {
    const sortedDates = [...new Set(branchSales.map(s => s && s.date).filter(Boolean))].sort().reverse();
    latestSalesDate = sortedDates[0] || '';
  }

  const latestDateSales = (latestSalesDate && latestSalesDate !== targetDate)
    ? branchSales.filter(s => s && s.date === latestSalesDate)
    : [];

  let totalSalesToday = 0;
  let totalCashToday = 0;
  let totalVisaToday = 0;
  let totalWalletToday = 0;
  let totalInstapayToday = 0;
  let totalDeliveryToday = 0;
  let totalCreditToday = 0;
  let totalReceiptsToday = 0;

  let totalMonthSales = 0;
  let totalMonthTarget = 0;

  const branchFinanceMap = {};
  branches.forEach((b) => {
    const bId = String(b.id);
    const bTarget = parseFloat(monthTargets[bId] || monthTargets[b.code] || 0) || 0;
    totalMonthTarget += bTarget;

    branchFinanceMap[bId] = {
      id: bId,
      code: b.code || '',
      name: b.name || `فرع ${b.id}`,
      // اليوم المستهدف
      sales: 0,
      cash: 0,
      visa: 0,
      wallet: 0,
      instapay: 0,
      delivery: 0,
      credit: 0,
      receiptsCount: 0,
      hasRecordedSalesToday: false,
      // الشهر الحالي
      monthSales: 0,
      monthTarget: bTarget,
      achievementRate: 0,
      // آخر مبيعات مسجلة في حال عدم وجود مبيعات اليوم
      latestRecordedSale: null,
      income: 0,
      expense: 0
    };
  });

  // تجميع مبيعات اليوم
  todaySales.forEach((s) => {
    const bId = String(s.branchId || '');
    const c = parseFloat(s.cashSales) || 0;
    const v = parseFloat(s.visaSales) || 0;
    const w = parseFloat(s.walletSales ?? s.electronicWalletSales) || 0;
    const ip = parseFloat(s.instapaySales) || 0;
    const d = parseFloat(s.deliverySales) || 0;
    const cr = parseFloat(s.creditSales) || 0;
    const rc = parseInt(s.receiptsCount, 10) || 0;
    const sTotal = parseFloat(s.totalSales) || (c + v + w + ip + d + cr);

    totalSalesToday += sTotal;
    totalCashToday += c;
    totalVisaToday += v;
    totalWalletToday += w;
    totalInstapayToday += ip;
    totalDeliveryToday += d;
    totalCreditToday += cr;
    totalReceiptsToday += rc;

    let bEntry = branchFinanceMap[bId];
    if (!bEntry) {
      const foundB = branches.find(b => String(b.code || '') === bId || b.name === bId);
      if (foundB) bEntry = branchFinanceMap[String(foundB.id)];
    }

    if (bEntry) {
      bEntry.sales += sTotal;
      bEntry.cash += c;
      bEntry.visa += v;
      bEntry.wallet += w;
      bEntry.instapay += ip;
      bEntry.delivery += d;
      bEntry.credit += cr;
      bEntry.receiptsCount += rc;
      bEntry.hasRecordedSalesToday = true;
    }
  });

  // تجميع مبيعات الشهر الحالي لكل فرع
  monthSales.forEach((s) => {
    const bId = String(s.branchId || '');
    const c = parseFloat(s.cashSales) || 0;
    const v = parseFloat(s.visaSales) || 0;
    const w = parseFloat(s.walletSales ?? s.electronicWalletSales) || 0;
    const ip = parseFloat(s.instapaySales) || 0;
    const d = parseFloat(s.deliverySales) || 0;
    const cr = parseFloat(s.creditSales) || 0;
    const sTotal = parseFloat(s.totalSales) || (c + v + w + ip + d + cr);

    totalMonthSales += sTotal;

    let bEntry = branchFinanceMap[bId];
    if (!bEntry) {
      const foundB = branches.find(b => String(b.code || '') === bId || b.name === bId);
      if (foundB) bEntry = branchFinanceMap[String(foundB.id)];
    }

    if (bEntry) {
      bEntry.monthSales += sTotal;
    }
  });

  // رصد آخر مبيعات مسجلة إذا لم تسجل مبيعات اليوم
  if (latestDateSales.length > 0) {
    latestDateSales.forEach((s) => {
      const bId = String(s.branchId || '');
      let bEntry = branchFinanceMap[bId];
      if (!bEntry) {
        const foundB = branches.find(b => String(b.code || '') === bId || b.name === bId);
        if (foundB) bEntry = branchFinanceMap[String(foundB.id)];
      }
      if (bEntry && !bEntry.hasRecordedSalesToday) {
        const c = parseFloat(s.cashSales) || 0;
        const v = parseFloat(s.visaSales) || 0;
        const w = parseFloat(s.walletSales ?? s.electronicWalletSales) || 0;
        const ip = parseFloat(s.instapaySales) || 0;
        const d = parseFloat(s.deliverySales) || 0;
        const cr = parseFloat(s.creditSales) || 0;
        const sTotal = parseFloat(s.totalSales) || (c + v + w + ip + d + cr);
        bEntry.latestRecordedSale = {
          date: s.date,
          sales: sTotal,
          cash: c,
          electronic: v + w + ip,
          receipts: parseInt(s.receiptsCount, 10) || 0
        };
      }
    });
  }

  // حساب نسب الإنجاز
  Object.values(branchFinanceMap).forEach((b) => {
    if (b.monthTarget > 0) {
      b.achievementRate = Math.round((b.monthSales / b.monthTarget) * 100);
    }
  });

  // الحركات المالية الإضافية (finances/transactions) إن وجدت
  const finances = state.finances || state.transactions || [];
  const todayFinances = finances.filter((f) => {
    if (!f) return false;
    const fDate = f.date || (f.timestamp ? String(f.timestamp).slice(0, 10) : '');
    return fDate === targetDate;
  });

  let totalIncome = 0;
  let totalExpense = 0;

  todayFinances.forEach((item) => {
    const amount = parseFloat(item.amount) || 0;
    const bId = String(item.branchId || '');
    const bEntry = branchFinanceMap[bId];

    if (item.type === 'income' || (amount > 0 && item.type !== 'sale')) {
      totalIncome += amount;
      if (bEntry) bEntry.income += amount;
    } else if (item.type === 'expense' || amount < 0) {
      const posExp = Math.abs(amount);
      totalExpense += posExp;
      if (bEntry) bEntry.expense += posExp;
    }
  });

  const branchesWithSalesCount = Object.values(branchFinanceMap).filter(b => b.hasRecordedSalesToday || b.sales > 0).length;
  const overallAchievementRate = totalMonthTarget > 0 ? Math.round((totalMonthSales / totalMonthTarget) * 100) : 0;

  // التسويات والمكافآت والخصومات
  const adjustments = (state.adjustments || []).filter((a) => a && (a.date === targetDate || (a.createdAt && String(a.createdAt).startsWith(targetDate))));
  const bonusTotalToday = adjustments.filter((a) => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
  const deductionTotalToday = adjustments.filter((a) => a.type === 'deduction').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  return {
    dateStr: targetDate,
    timeGenerated: getRealNowTimeStr(false),
    employeesCount: employees.length,
    presentCount,
    absentCount,
    activeShiftsCount: activeEmpIds.length,
    completedShiftsCount: todayCompletedShifts.length,
    totalHoursToday,
    branchSummaries,
    requestsSummary: {
      totalToday: allUniqueRequests.length,
      pendingCount: pendingRequests.length,
      approvedTodayCount: approvedTodayRequests.length,
      rejectedTodayCount: rejectedTodayRequests.length,
      byType: requestsByType,
      recentRequests: detailedRequests
    },
    financeSummary: {
      totalSales: totalSalesToday,
      totalSalesToday,
      totalCashToday,
      totalElectronicToday: totalVisaToday + totalWalletToday + totalInstapayToday,
      totalDeliveryToday,
      totalCreditToday,
      totalReceiptsToday,
      totalMonthSales,
      totalMonthTarget,
      overallAchievementRate,
      branchesWithSalesCount,
      totalBranchesCount: branches.length,
      latestSalesDate,
      totalIncome,
      totalExpense,
      netCashFlow: totalSalesToday + totalIncome - totalExpense,
      bonusTotalToday,
      deductionTotalToday,
      byBranch: Object.values(branchFinanceMap)
    }
  };
}
