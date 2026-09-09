/**
 * digestDataEngine.js
 * محرك تجميع وتحليل بيانات المنظومة الحية للتقرير والملخص الشامل
 * يضمن التطابق التام 100% بين ما يظهر في شاشة الـ Dashboard وما يرسل في بريد الجيميل
 */

import { getRealTodayStr, getRealNowTimeStr } from './timeEngine';
import { fmt } from './formatters';

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
        timeIn: act.startTime ? act.startTime.slice(11, 16) || act.startTime : '—',
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

  // تصنيف الطلبات بحسب النوع
  const reqTypeLabels = {
    leave: '🏖️ إجازات',
    leave_request: '🏖️ إجازات',
    permission: '⏰ أذونات وخروج',
    permission_request: '⏰ أذونات وخروج',
    early_exit: '⏰ خروج مبكر',
    loan: '💳 سلف نقدية',
    meds: '💊 أدوية آجل',
    swap: '🔄 تبديل ورديات',
    shift_swap: '🔄 تبديل ورديات',
    resignation: '🚪 استقالات',
    resignation_request: '🚪 استقالات',
    penalty_objection: '⚖️ تظلمات وجزاءات',
    objection: '⚖️ تظلمات وجزاءات',
    punch_correction: '📸 تعديل بصمة',
    profile_update: '👤 تحديث بيانات',
    overtime: '⏱️ ساعات إضافية'
  };

  const requestsByType = {};
  allUniqueRequests.forEach((r) => {
    const cat = reqTypeLabels[r.type] || '📋 طلبات عامة';
    requestsByType[cat] = (requestsByType[cat] || 0) + 1;
  });

  // تجهيز قائمة تفصيلية بأهم وأحدث الطلبات لعرضها في جدول التقرير
  const detailedRequests = allUniqueRequests.slice(0, 20).map((r) => {
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
      typeLabel: reqTypeLabels[r.type] || r.type || 'طلب عام',
      details: detailsText,
      statusLabel,
      statusColor,
      date: r.date || (r.createdAt ? String(r.createdAt).slice(0, 10) : targetDate)
    };
  });

  // 4. الحركة المالية ومبيعات الفروع
  const finances = state.finances || state.transactions || [];
  const todayFinances = finances.filter((f) => {
    if (!f) return false;
    const fDate = f.date || (f.timestamp ? String(f.timestamp).slice(0, 10) : '');
    return fDate === targetDate;
  });

  let totalSales = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  const branchFinanceMap = {};
  branches.forEach((b) => {
    branchFinanceMap[b.id] = { name: b.name, sales: 0, income: 0, expense: 0 };
  });

  todayFinances.forEach((item) => {
    const amount = parseFloat(item.amount) || 0;
    const bId = item.branchId || 'main';

    if (item.type === 'sale' || item.category === 'sales' || item.type === 'revenue') {
      totalSales += amount;
      if (branchFinanceMap[bId]) branchFinanceMap[bId].sales += amount;
    } else if (item.type === 'income' || amount > 0) {
      totalIncome += amount;
      if (branchFinanceMap[bId]) branchFinanceMap[bId].income += amount;
    } else if (item.type === 'expense' || amount < 0) {
      const posExp = Math.abs(amount);
      totalExpense += posExp;
      if (branchFinanceMap[bId]) branchFinanceMap[bId].expense += posExp;
    }
  });

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
      totalSales,
      totalIncome,
      totalExpense,
      netCashFlow: totalSales + totalIncome - totalExpense,
      bonusTotalToday,
      deductionTotalToday,
      byBranch: Object.values(branchFinanceMap)
    }
  };
}
