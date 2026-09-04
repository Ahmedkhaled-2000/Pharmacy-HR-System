import { arabicWeekday } from './formatters';
import { getRealTodayStr } from './timeEngine';
import { getActivePayrollMonth, getCycleDateRange, extractPayrollSettings } from './periodEngine';

export const AR_WEEKDAYS_MAP = {
  0: ['sunday', ' الأحد', 'الأحد', 'الاحد'],
  1: ['monday', 'الاثنين', 'الإثنين', ' الاثنين'],
  2: ['tuesday', 'الثلاثاء', ' الثلاثاء'],
  3: ['wednesday', 'الأربعاء', 'الاربعاء', ' الأربعاء'],
  4: ['thursday', 'الخميس', ' الخميس'],
  5: ['friday', 'الجمعة', ' الجمعة'],
  6: ['saturday', 'السبت', ' السبت']
};

export const DEFAULT_WEEKLY_SCHEDULE = {
  'السبت': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الأحد': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الاثنين': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الثلاثاء': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الأربعاء': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الخميس': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الجمعة': { type: 'off', isOff: true, start: '', end: '', hours: 0 }
};

/**
 * دالة استخراج جدول يوم محدد من خريطة الجدول (سواء كانت بالتواريخ أو أيام الأسبوع بالعربي أو الإنجليزي)
 */
export function getDayScheduleFromMap(schedule, jsDayIndex, dateStr = null) {
  if (!schedule || typeof schedule !== 'object') {
    return jsDayIndex === 5 
      ? { type: 'off', isOff: true, start: '', end: '', hours: 0 }
      : { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
  }

  // 1. فحص التاريخ الدقيق أولاً (للتبديلات أو التعديلات المخصصة ليوم بعينه)
  if (dateStr && schedule[dateStr]) {
    const item = schedule[dateStr];
    return normalizeScheduleItem(item, jsDayIndex);
  }

  // 2. فحص مفاتيح أيام الأسبوع
  const keys = AR_WEEKDAYS_MAP[jsDayIndex] || [];
  for (const k of keys) {
    if (schedule[k]) {
      return normalizeScheduleItem(schedule[k], jsDayIndex);
    }
  }

  // 3. فحص المفاتيح المرقمة (0..6)
  if (schedule[String(jsDayIndex)]) {
    return normalizeScheduleItem(schedule[String(jsDayIndex)], jsDayIndex);
  }

  // 4. مطابقة تقريبية باللغة العربية
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const targetAr = dayNames[jsDayIndex] || '';
  const normTarget = targetAr.replace(/[\u0625\u0623\u0622]/g, 'ا');
  for (const [k, v] of Object.entries(schedule)) {
    if (k.replace(/[\u0625\u0623\u0622]/g, 'ا') === normTarget) {
      return normalizeScheduleItem(v, jsDayIndex);
    }
  }

  return jsDayIndex === 5 
    ? { type: 'off', isOff: true, start: '', end: '', hours: 0 }
    : { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
}

function normalizeScheduleItem(item, jsDayIndex) {
  if (!item) {
    return jsDayIndex === 5 
      ? { type: 'off', isOff: true, start: '', end: '', hours: 0 }
      : { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
  }
  const isOff = item.type === 'off' || item.isOff === true;
  return {
    ...item,
    type: isOff ? 'off' : (item.type || 'shift'),
    isOff,
    start: item.start || (isOff ? '' : '08:00'),
    end: item.end || (isOff ? '' : '16:00'),
    hours: item.hours !== undefined ? item.hours : (isOff ? 0 : 8)
  };
}

/**
 * البحث عن جدول الموظف المعتمد لشهر أو فترة محددة
 */
export function findEmployeeRoster(empId, monthOrDate, state, targetBranchId = null) {
  if (!empId || !state) return null;
  const empIdStr = String(empId);
  const emp = (state.employees || []).find(e => String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr));
  const empCodeStr = emp?.code ? String(emp.code) : '';
  const dateStr = monthOrDate && monthOrDate.length >= 10 ? String(monthOrDate).slice(0, 10) : null;
  const monthStr = monthOrDate ? (monthOrDate.length === 7 ? monthOrDate : monthOrDate.slice(0, 7)) : null;

  let cycleMonth = monthStr;
  if (dateStr) {
    try {
      cycleMonth = getActivePayrollMonth(state.orgSettings || {}, new Date(dateStr + 'T00:00:00'));
    } catch {
      cycleMonth = monthStr;
    }
  }

  const matchesEmployee = (item) => {
    if (!item) return false;
    const itemEmpId = String(item.employeeId || '');
    const itemEmpCode = String(item.employeeCode || '');
    return (
      (empIdStr && itemEmpId === empIdStr) ||
      (empCodeStr && itemEmpCode === empCodeStr) ||
      (empCodeStr && itemEmpId === empCodeStr) ||
      (empIdStr && itemEmpCode === empIdStr)
    );
  };

  const matchesBranch = (item) => {
    if (!targetBranchId) return true;
    const bStr = String(item.branchId || '').trim();
    if (!bStr) return true;
    return bStr === String(targetBranchId).trim();
  };

  const matchesDateOrMonth = (item) => {
    if (dateStr && item.fromDate && item.toDate) {
      if (dateStr >= item.fromDate && dateStr <= item.toDate) return true;
    }
    if (item.month) {
      if (cycleMonth && item.month === cycleMonth) return true;
      if (monthStr && item.month === monthStr) return true;
    }
    if (!item.month && !item.fromDate) return true;
    return false;
  };

  // 1. البحث في state.rosters
  const approvedRosters = (state.rosters || []).filter(r =>
    matchesEmployee(r) &&
    matchesBranch(r) &&
    (r.status === 'approved' || r.adminApproved || !r.status) &&
    matchesDateOrMonth(r)
  );

  if (approvedRosters.length > 0) {
    const exactDateMatch = dateStr ? approvedRosters.find(r => r.fromDate && r.toDate && dateStr >= r.fromDate && dateStr <= r.toDate) : null;
    if (exactDateMatch) return exactDateMatch;
    return approvedRosters[0];
  }

  // 2. البحث في طلبات تعديل الجداول المعتمدة
  const approvedReqs = (state.requests || []).filter(req =>
    matchesEmployee(req) &&
    matchesBranch(req) &&
    (req.type === 'roster_update' || req.type === 'roster_edit' || req.type === 'roster_edit_request') &&
    (req.status === 'approved' || req.adminApproved) &&
    (req.schedule || req.newSchedule) &&
    matchesDateOrMonth(req)
  );

  if (approvedReqs.length > 0) {
    const exactDateMatch = dateStr ? approvedReqs.find(r => r.fromDate && r.toDate && dateStr >= r.fromDate && dateStr <= r.toDate) : null;
    if (exactDateMatch) return { ...exactDateMatch, schedule: exactDateMatch.schedule || exactDateMatch.newSchedule };
    return { ...approvedReqs[0], schedule: approvedReqs[0].schedule || approvedReqs[0].newSchedule };
  }

  // 3. الجدول الافتراضي المرفق ببيانات الموظف إن وجد
  if (emp?.roster && emp.roster.schedule) {
    return emp.roster;
  }

  return null;
}

/**
 * استخراج جدول الموظف الأساسي ليوم محدد بدون حساب التبديلات
 */
export function getEmployeeBaseDaySchedule(empId, dateStr, state) {
  const roster = findEmployeeRoster(empId, dateStr, state);
  const jsDay = new Date(dateStr + 'T00:00:00').getDay();
  return getDayScheduleFromMap(roster?.schedule, jsDay, dateStr);
}

/**
 * المحرك المركزي لاستخراج جدول الموظف ليوم محدد مع الأخذ بعين الاعتبار:
 * 1. طلبات تبديل الشيفتات المعتمدة (Shift Swaps) سواء كانت في نفس اليوم أو أيام مختلفة
 * 2. تبديل الراحات (Off Days) إذا كان أحد الطرفين في إجازة/راحة
 * 3. الجداول الشهرية المعتمدة
 */
export function getEmployeeDaySchedule(empId, dateStr, state) {
  if (!empId || !dateStr) {
    return { type: 'shift', start: '08:00', end: '16:00', hours: 8, isOff: false };
  }

  const empIdStr = String(empId);
  const emp = (state?.employees || []).find(e => String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr));
  const empCodeStr = emp?.code ? String(emp.code) : '';

  // 1. فحص طلبات تبديل الشيفت المعتمدة التي يكون هذا الموظف طرفاً فيها وتخص هذا التاريخ
  const allSwapRequests = [
    ...(state?.requests || []),
    ...(state?.shiftSwaps || [])
  ];

  const approvedSwap = allSwapRequests.find(r => {
    if (!r) return false;
    const isSwapType = r.type === 'shift_swap' || r.type === 'swap';
    if (!isSwapType) return false;
    const isApproved = r.status === 'approved' || r.adminApproved === true || (r.branchApproved && r.isDirectToAdmin);
    if (!isApproved) return false;

    const isRequester = String(r.requesterEmpId || r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode || r.requesterEmpCode) === empCodeStr);
    const isTarget = String(r.targetEmpId || r.targetEmployeeId || r.peerEmployeeId) === empIdStr || (empCodeStr && String(r.targetEmpCode) === empCodeStr);

    const reqDate = r.requesterDate || r.date || r.startDate;
    const tgtDate = r.targetDate || r.targetSwapDate || reqDate;

    if (isRequester && (reqDate === dateStr || (reqDate !== tgtDate && tgtDate === dateStr))) {
      return true;
    }
    if (isTarget && (tgtDate === dateStr || (reqDate !== tgtDate && reqDate === dateStr))) {
      return true;
    }
    return false;
  });

  if (approvedSwap) {
    const reqEmpId = approvedSwap.requesterEmpId || approvedSwap.employeeId;
    const tgtEmpId = approvedSwap.targetEmpId || approvedSwap.targetEmployeeId || approvedSwap.peerEmployeeId;
    const reqDate = approvedSwap.requesterDate || approvedSwap.date || approvedSwap.startDate;
    const tgtDate = approvedSwap.targetDate || approvedSwap.targetSwapDate || reqDate;

    const isRequester = String(reqEmpId) === empIdStr || (empCodeStr && String(approvedSwap.employeeCode) === empCodeStr);
    const otherEmpId = isRequester ? tgtEmpId : reqEmpId;
    const otherEmp = (state?.employees || []).find(e => String(e.id) === String(otherEmpId) || (e.code && String(e.code) === String(otherEmpId)));
    const otherEmpName = otherEmp?.name || (isRequester ? approvedSwap.targetEmpName : approvedSwap.requesterEmpName) || 'الزميل';

    // الحالة الأولى: التبديل في نفس التاريخ (Same Date Swap)
    if (reqDate === tgtDate) {
      // الموظف الحالي يأخذ جدول الزميل في هذا اليوم
      const otherBaseSched = getEmployeeBaseDaySchedule(otherEmpId, dateStr, state);
      const isOtherOff = otherBaseSched?.type === 'off' || otherBaseSched?.isOff === true;
      return {
        ...otherBaseSched,
        type: isOtherOff ? 'off' : (otherBaseSched?.type || 'shift'),
        isOff: isOtherOff,
        start: isOtherOff ? '' : (otherBaseSched?.start || '08:00'),
        end: isOtherOff ? '' : (otherBaseSched?.end || '16:00'),
        hours: isOtherOff ? 0 : (otherBaseSched?.hours !== undefined ? otherBaseSched.hours : 8),
        isSwapped: true,
        swapRequestId: approvedSwap.id,
        swappedWithId: otherEmpId,
        swappedWithName: otherEmpName,
        swapDate: dateStr,
        swapNote: isOtherOff ? `🛋️ راحة متبدلة مع ${otherEmpName}` : `🔄 شيفت متبدل مع: ${otherEmpName}`
      };
    }

    // الحالة الثانية: التبديل في تواريخ مختلفة (Cross-Date Swap)
    // 1. في تاريخ طلب الموظف الأصلي (reqDate):
    if (dateStr === reqDate) {
      if (isRequester) {
        // مقدم الطلب في يومه الأصلي reqDate: يتنازل عنه ويصبح راحة
        return {
          type: 'off',
          isOff: true,
          start: '',
          end: '',
          hours: 0,
          isSwapped: true,
          swapRequestId: approvedSwap.id,
          swappedWithId: otherEmpId,
          swappedWithName: otherEmpName,
          swapDate: reqDate,
          targetCoverDate: tgtDate,
          swapNote: `🛋️ راحة متبدلة مع ${otherEmpName} (مقابل تغطية يوم ${tgtDate})`
        };
      } else {
        // الزميل المستهدف في يوم reqDate: يغطي جدول مقدم الطلب
        const reqBaseSched = getEmployeeBaseDaySchedule(reqEmpId, reqDate, state);
        const isReqOff = reqBaseSched?.type === 'off' || reqBaseSched?.isOff === true;
        return {
          ...reqBaseSched,
          type: isReqOff ? 'off' : (reqBaseSched?.type || 'shift'),
          isOff: isReqOff,
          start: isReqOff ? '' : (reqBaseSched?.start || '08:00'),
          end: isReqOff ? '' : (reqBaseSched?.end || '16:00'),
          hours: isReqOff ? 0 : (reqBaseSched?.hours !== undefined ? reqBaseSched.hours : 8),
          isSwapped: true,
          swapRequestId: approvedSwap.id,
          swappedWithId: otherEmpId,
          swappedWithName: otherEmpName,
          swapDate: reqDate,
          originalShiftDate: tgtDate,
          swapNote: isReqOff ? `🛋️ راحة متبدلة مع ${otherEmpName}` : `🔄 وردية عمل بديلة لتغطية ${otherEmpName}`
        };
      }
    }

    // 2. في تاريخ الزميل المستهدف (tgtDate):
    if (dateStr === tgtDate) {
      if (!isRequester) {
        // الزميل المستهدف في يومه الأصلي tgtDate: يتنازل عنه ويصبح راحة
        return {
          type: 'off',
          isOff: true,
          start: '',
          end: '',
          hours: 0,
          isSwapped: true,
          swapRequestId: approvedSwap.id,
          swappedWithId: otherEmpId,
          swappedWithName: otherEmpName,
          swapDate: tgtDate,
          targetCoverDate: reqDate,
          swapNote: `🛋️ راحة متبدلة مع ${otherEmpName} (مقابل تغطية يوم ${reqDate})`
        };
      } else {
        // مقدم الطلب في يوم tgtDate: يغطي جدول الزميل المستهدف
        const tgtBaseSched = getEmployeeBaseDaySchedule(tgtEmpId, tgtDate, state);
        const isTgtOff = tgtBaseSched?.type === 'off' || tgtBaseSched?.isOff === true;
        return {
          ...tgtBaseSched,
          type: isTgtOff ? 'off' : (tgtBaseSched?.type || 'shift'),
          isOff: isTgtOff,
          start: isTgtOff ? '' : (tgtBaseSched?.start || '08:00'),
          end: isTgtOff ? '' : (tgtBaseSched?.end || '16:00'),
          hours: isTgtOff ? 0 : (tgtBaseSched?.hours !== undefined ? tgtBaseSched.hours : 8),
          isSwapped: true,
          swapRequestId: approvedSwap.id,
          swappedWithId: otherEmpId,
          swappedWithName: otherEmpName,
          swapDate: tgtDate,
          originalShiftDate: reqDate,
          swapNote: isTgtOff ? `🛋️ راحة متبدلة مع ${otherEmpName}` : `🔄 وردية عمل بديلة لتغطية ${otherEmpName}`
        };
      }
    }
  }

  // 2. في حال عدم وجود تبديل معتمد، استخراج الجدول الطبيعي للموظف
  return getEmployeeBaseDaySchedule(empId, dateStr, state);
}

/**
 * تطبيق التبديل في كائنات الجداول (Rosters) في الذاكرة لتخزين تواريخ التبديل بدقة
 * دون الإخلال بأسماء أيام الأسبوع المتكررة
 */
export function applyShiftSwapToRosters(targetReq, currentRosters = [], employees = []) {
  if (!targetReq || (targetReq.type !== 'swap' && targetReq.type !== 'shift_swap' && targetReq.type !== 'shift_edit')) {
    return currentRosters;
  }

  const empAId = String(targetReq.requesterEmpId || targetReq.employeeId || '');
  const empBId = String(targetReq.targetEmpId || targetReq.targetEmployeeId || targetReq.peerEmployeeId || '');
  const dateA = targetReq.requesterDate || targetReq.date || targetReq.startDate || getRealTodayStr();
  const dateB = targetReq.targetDate || targetReq.targetSwapDate || dateA;

  const monthKeyA = dateA.slice(0, 7);
  const monthKeyB = dateB.slice(0, 7);

  let updatedRosters = [...currentRosters];

  const ensureRoster = (empId, monthKey, targetDate = null) => {
    let ros = findEmployeeRoster(empId, targetDate || monthKey, { rosters: updatedRosters, employees });
    if (!ros) {
      ros = updatedRosters.find((r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month) && r.status === 'approved');
    }
    if (!ros) {
      ros = updatedRosters.find((r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month));
    }
    if (!ros) {
      const empObj = employees.find((e) => String(e.id) === String(empId));
      ros = {
        id: `ros_${empId}_${monthKey}_${Date.now()}`,
        employeeId: empId,
        branchId: empObj?.branchId || null,
        month: monthKey,
        schedule: { ...DEFAULT_WEEKLY_SCHEDULE },
        status: 'approved',
        approvedAt: new Date().toISOString()
      };
      updatedRosters.push(ros);
    }
    return ros;
  };

  if (targetReq.type === 'shift_edit') {
    const ros = ensureRoster(empAId, monthKeyA, dateA);
    const newSchedule = { ...(ros.schedule || {}) };
    const updatedDayItem = {
      type: targetReq.newDayType || (targetReq.isOff ? 'off' : 'shift'),
      start: targetReq.newStart || '08:00',
      end: targetReq.newEnd || '16:00',
      hours: targetReq.newHours || 8,
      isOff: targetReq.newDayType === 'off' || targetReq.isOff === true
    };
    newSchedule[dateA] = updatedDayItem;

    updatedRosters = updatedRosters.map((r) => r.id === ros.id ? { ...r, schedule: newSchedule, status: 'approved' } : r);
    return updatedRosters;
  }

  if (empAId && empBId) {
    const rosA = ensureRoster(empAId, monthKeyA, dateA);
    const rosB = ensureRoster(empBId, monthKeyB, dateB);

    const schedA = { ...(rosA.schedule || {}) };
    const schedB = { ...(rosB.schedule || {}) };

    const jsDayA = new Date(dateA + 'T00:00:00').getDay();
    const jsDayB = new Date(dateB + 'T00:00:00').getDay();

    const itemA_on_dateA = getDayScheduleFromMap(schedA, jsDayA, dateA);
    const itemB_on_dateB = getDayScheduleFromMap(schedB, jsDayB, dateB);

    if (dateA === dateB) {
      // نفس التاريخ: تبديل مباشر على مستوى التاريخ المحدد
      schedA[dateA] = { ...itemB_on_dateB, isSwapped: true, swappedWith: empBId };
      schedB[dateA] = { ...itemA_on_dateA, isSwapped: true, swappedWith: empAId };
    } else {
      // تواريخ مختلفة:
      // في يوم dateA: الموظف A راحة، والموظف B يغطي شيفت A
      schedA[dateA] = { type: 'off', isOff: true, start: '', end: '', hours: 0, isSwapped: true, swappedWith: empBId };
      schedB[dateA] = { ...itemA_on_dateA, isSwapped: true, swappedWith: empAId };

      // في يوم dateB: الموظف A يغطي شيفت B، والموظف B راحة
      schedA[dateB] = { ...itemB_on_dateB, isSwapped: true, swappedWith: empBId };
      schedB[dateB] = { type: 'off', isOff: true, start: '', end: '', hours: 0, isSwapped: true, swappedWith: empAId };
    }

    updatedRosters = updatedRosters.map((r) => {
      if (r.id === rosA.id) return { ...r, schedule: schedA, status: 'approved' };
      if (r.id === rosB.id) return { ...r, schedule: schedB, status: 'approved' };
      return r;
    });
  }

  return updatedRosters;
}

/**
 * فحص اقتراب/انتهاء الدورة الشهرية وتوليد إشعار رسمي للموظف بوجوب إرسال جدوله الشهري
 * @param {object} state - حالة المنظومة
 * @param {object} emp - بيانات الموظف
 * @returns {object|null} - إشعار جديد إذا وجب الإرسال، أو null إذا كان مرسلاً بالفعل أو الموظف لديه جدول
 */
export function checkAndTriggerCycleEndRosterReminder(state, emp) {
  if (!emp || !state) return null;
  const empIdStr = String(emp.id || emp.code || '');
  if (!empIdStr) return null;

  const todayStr = getRealTodayStr();
  const orgSettings = state.orgSettings || {};
  const currentActiveMonth = getActivePayrollMonth(orgSettings);
  const currentCycle = getCycleDateRange(currentActiveMonth, orgSettings);

  // حساب موعد نهاية الدورة الحالية:
  // إذا كنا في آخر 5 أيام من الدورة الحالية أو بعدها، الهدف هو الدورة التالية أو الحالية إن لم يكن لها جدول
  const today = new Date(todayStr + 'T00:00:00');
  const cycleEnd = new Date(currentCycle.endDate + 'T00:00:00');
  const diffDays = Math.round((cycleEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // تحديد الشهر المستهدف للجدول
  let targetMonth = currentActiveMonth;
  if (diffDays <= 5) {
    const [y, m] = currentActiveMonth.split('-').map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    targetMonth = `${nextY}-${String(nextM).padStart(2, '0')}`;
  }

  const targetCycle = getCycleDateRange(targetMonth, orgSettings);

  // 1. فحص هل للموظف جدول معتمد لهذا الشهر المستهدف
  const targetBranch = emp.branchId || (emp.branchesDetails?.[0]?.branchId) || null;
  const approvedRoster = findEmployeeRoster(emp.id, targetCycle.startDate, state, targetBranch);
  if (approvedRoster && approvedRoster.schedule && Object.keys(approvedRoster.schedule).length > 0) {
    return null; // لديه جدول معتمد بالفعل
  }

  // 2. فحص هل الموظف لديه طلب تعديل/إنشاء جدول قيد المراجعة بالفعل لهذا الشهر
  const hasPendingReq = (state.requests || []).some(
    (r) =>
      (String(r.employeeId) === empIdStr || (emp.code && String(r.employeeCode) === String(emp.code))) &&
      (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
      (r.month === targetMonth || (r.fromDate && r.fromDate <= targetCycle.endDate && r.toDate >= targetCycle.startDate)) &&
      (r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_branch')
  );
  if (hasPendingReq) {
    return null; // الموظف أرسل طلبه وهو قيد المراجعة
  }

  // 3. فحص هل تم إرسال إشعار تذكير لهذا الموظف لنفس الدورة الشهرية مسبقاً (لمنع التكرار المزعج)
  const alreadyNotified = (state.notifications || []).some(
    (n) =>
      n.type === 'roster_reminder' &&
      (String(n.targetEmployeeId) === empIdStr || String(n.employeeId) === empIdStr) &&
      n.targetMonth === targetMonth
  );
  if (alreadyNotified) {
    return null; // تم إشعاره بالفعل لهذه الدورة
  }

  // 4. إنشاء إشعار تذكير رسمي للموظف
  const notifId = `notif_roster_reminder_${targetMonth}_${empIdStr}_${Date.now()}`;
  const newNotification = {
    id: notifId,
    type: 'roster_reminder',
    typeLabel: 'تذكير الجدول الشهري',
    icon: '📅',
    title: `📅 تذكير دورة الرواتب: مطلوب إرسال الجدول الشهري لشهر (${targetMonth})`,
    message: `اقتربت/انتهت دورة العمل الحالية، يرجى إعداد وإرسال جدول الشيفتات الشهري للدورة الجديدة (${targetCycle.shortLabel}) لمدير الفرع والإدارة العليا للاعتماد.`,
    targetEmployeeId: String(emp.id || emp.code),
    employeeId: String(emp.id || emp.code),
    targetRole: 'employee',
    targetMonth,
    linkTab: 'roster',
    autoOpenModal: true,
    actionRequired: true,
    read: false,
    date: todayStr,
    timestamp: new Date().toISOString()
  };

  return newNotification;
}

export function normalizeSchedule(rawSchedule) {
  if (!rawSchedule || typeof rawSchedule !== 'object') return null;
  const dayKeyMap = {
    'saturday': 'السبت',
    'sunday': 'الأحد',
    'monday': 'الاثنين',
    'tuesday': 'الثلاثاء',
    'wednesday': 'الأربعاء',
    'thursday': 'الخميس',
    'friday': 'الجمعة',
    'السبت': 'السبت',
    'الأحد': 'الأحد',
    'الاحد': 'الأحد',
    'الإثنين': 'الاثنين',
    'الاثنين': 'الاثنين',
    'الثلاثاء': 'الثلاثاء',
    'الأربعاء': 'الأربعاء',
    'الاربعاء': 'الأربعاء',
    'الخميس': 'الخميس',
    'الجمعة': 'الجمعة',
    '0': 'الأحد',
    '1': 'الاثنين',
    '2': 'الثلاثاء',
    '3': 'الأربعاء',
    '4': 'الخميس',
    '5': 'الجمعة',
    '6': 'السبت',
    'day_0': 'الأحد',
    'day_1': 'الاثنين',
    'day_2': 'الثلاثاء',
    'day_3': 'الأربعاء',
    'day_4': 'الخميس',
    'day_5': 'الجمعة',
    'day_6': 'السبت'
  };

  const normalized = {};
  Object.entries(rawSchedule).forEach(([key, val]) => {
    const cleanKey = String(key).trim().toLowerCase();
    const mappedDay = dayKeyMap[cleanKey] || dayKeyMap[key];
    if (mappedDay && val && typeof val === 'object') {
      const isOff = val.type === 'off' || val.isOff === true || val.type === 'راحة';
      normalized[mappedDay] = {
        type: isOff ? 'off' : 'shift',
        start: isOff ? '' : (val.start || val.checkIn || '08:00'),
        end: isOff ? '' : (val.end || val.checkOut || '16:00')
      };
    }
  });

  return Object.keys(normalized).length > 0 ? normalized : rawSchedule;
}

export function getResolvedEmployeeRoster(employee, targetBranchId, arg3, arg4 = null) {
  if (!employee) return null;

  // 1. Flexible Argument Normalization (handles both (emp, bId, state, month) and (emp, bId, month, state))
  let state = null;
  let selectedMonth = null;

  if (arg3 && typeof arg3 === 'object' && (arg3.rosters || arg3.requests || arg3.employees || arg3.branches || arg3.orgSettings !== undefined)) {
    state = arg3;
    selectedMonth = typeof arg4 === 'string' ? arg4 : null;
  } else if (arg4 && typeof arg4 === 'object' && (arg4.rosters || arg4.requests || arg4.employees || arg4.branches || arg4.orgSettings !== undefined)) {
    state = arg4;
    selectedMonth = typeof arg3 === 'string' ? arg3 : null;
  } else if (typeof arg3 === 'object' && arg3 !== null) {
    state = arg3;
    selectedMonth = typeof arg4 === 'string' ? arg4 : null;
  } else {
    selectedMonth = typeof arg3 === 'string' ? arg3 : null;
    state = typeof arg4 === 'object' ? arg4 : null;
  }

  if (!state) return null;

  const rosters = state.rosters || [];
  const requests = state.requests || [];
  const empIdStr = String(employee.id || '').trim();
  const empCodeStr = String(employee.code || '').trim();
  const targetBIdStr = targetBranchId ? String(targetBranchId).trim() : null;

  // Find target branch object in state.branches if available
  const targetBObj = targetBIdStr ? (state.branches || []).find(b => 
    String(b.id) === targetBIdStr || 
    String(b.branchCode || '') === targetBIdStr || 
    b.name === targetBIdStr
  ) : null;

  const isMultiBranch = Array.isArray(employee.branchesDetails) && employee.branchesDetails.length > 1;

  // Flexible Employee matching (by id or code in both directions)
  const matchesEmployee = (item) => {
    if (!item) return false;
    const itemEmpId = String(item.employeeId || '').trim();
    const itemEmpCode = String(item.employeeCode || '').trim();
    return (
      (empIdStr && itemEmpId === empIdStr) ||
      (empCodeStr && itemEmpCode === empCodeStr) ||
      (empCodeStr && itemEmpId === empCodeStr) ||
      (empIdStr && itemEmpCode === empIdStr)
    );
  };

  // Flexible Branch matching
  const branchMatches = (itemBranchId) => {
    if (!targetBIdStr) return true;
    const itemBStr = itemBranchId ? String(itemBranchId).trim() : '';

    if (itemBStr === targetBIdStr) return true;

    if (targetBObj) {
      if (itemBStr === String(targetBObj.id) || 
          (targetBObj.branchCode && itemBStr === String(targetBObj.branchCode)) || 
          itemBStr === targetBObj.name) {
        return true;
      }
    }

    // If item has no branch specified:
    if (!itemBStr) {
      const isAssigned = 
        String(employee.branchId || '') === targetBIdStr ||
        (targetBObj && String(employee.branchId || '') === String(targetBObj.id)) ||
        (Array.isArray(employee.branchesDetails) && employee.branchesDetails.some(bd => 
          String(bd.branchId) === targetBIdStr || 
          (targetBObj && String(bd.branchId) === String(targetBObj.id))
        ));
      if (isAssigned) return true;
      if (!isMultiBranch) return true;
    }

    return false;
  };

  // Determine Cycle Date Range if selectedMonth is provided
  let cycleRange = null;
  if (selectedMonth && typeof selectedMonth === 'string') {
    try {
      cycleRange = getCycleDateRange(selectedMonth, state?.orgSettings || {});
    } catch {
      const parts = selectedMonth.split('-').map(Number);
      if (parts.length >= 2) {
        const y = parts[0];
        const m = parts[1];
        const daysInM = new Date(y, m, 0).getDate();
        cycleRange = {
          startDate: `${selectedMonth}-01`,
          endDate: `${selectedMonth}-${String(daysInM).padStart(2, '0')}`
        };
      }
    }
  }

  // Scoring function to pick the most relevant approved roster
  const getCandidateScore = (item) => {
    let score = 0;
    const itemMonth = item.month || (item.fromDate ? String(item.fromDate).slice(0, 7) : null);

    if (selectedMonth) {
      // 1. Direct exact month match
      if (item.month === selectedMonth) {
        score = 100;
      }
      // 2. Date range overlaps with this month's payroll cycle
      else if (cycleRange && item.fromDate && item.toDate) {
        if (item.fromDate <= cycleRange.endDate && item.toDate >= cycleRange.startDate) {
          score = 95;
        }
      }
      // 3. fromDate starts within this cycle
      else if (cycleRange && item.fromDate && item.fromDate >= cycleRange.startDate && item.fromDate <= cycleRange.endDate) {
        score = 90;
      }
      // 4. fromDate starts with selectedMonth
      else if (item.fromDate && String(item.fromDate).slice(0, 7) === selectedMonth) {
        score = 85;
      }
      // 5. Standing / Recurring schedule (perpetual operational roster without month/date boundaries)
      else if (!item.month && !item.fromDate) {
        score = 80;
      }
      // 6. Most recent approved roster from an earlier month/cycle that carries forward
      else if (itemMonth && itemMonth < selectedMonth) {
        score = 70;
      }
      // 7. Approved roster starting earlier
      else if (cycleRange && item.fromDate && item.fromDate < cycleRange.startDate) {
        score = (!item.toDate || item.toDate >= cycleRange.startDate) ? 68 : 60;
      }
      // 8. General approved roster
      else {
        score = 50;
      }
    } else {
      // No selectedMonth filter requested -> prefer standing or newest
      if (!item.month && !item.fromDate) score = 90;
      else score = 75;
    }

    // Give priority to rosters with an actual schedule object and valid days
    if (item.schedule && typeof item.schedule === 'object' && Object.keys(item.schedule).length > 0) {
      score += 5;
    }

    return score;
  };

  const candidates = [];

  // 1. Gather all matching approved records from state.rosters
  rosters.forEach((r) => {
    if (!matchesEmployee(r)) return;
    const isApproved = r.status === 'approved' || r.status === 'active' || r.status === 'معتمد' || r.adminApproved === true || (!r.status && r.schedule);
    if (!isApproved) return;
    if (r.status === 'rejected' || r.status === 'draft') return;
    if (!branchMatches(r.branchId)) return;

    const score = getCandidateScore(r);
    candidates.push({
      ...r,
      score,
      approvedAt: r.approvedAt || r.updatedAt || r.createdAt || '2000-01-01',
      source: 'rosters'
    });
  });

  // 2. Gather all matching approved records from state.requests
  requests.forEach((req) => {
    if (!matchesEmployee(req)) return;
    const isRosterType = req.type === 'roster_update' || req.type === 'roster_edit' || req.type === 'roster_edit_request' || req.type === 'roster';
    if (!isRosterType) return;
    const isApproved = req.status === 'approved' || req.adminApproved === true;
    if (!isApproved) return;
    const rawSch = req.schedule || req.newSchedule;
    if (!rawSch) return;
    if (!branchMatches(req.branchId)) return;

    const reqItem = {
      id: req.id,
      employeeId: req.employeeId || employee.id,
      branchId: req.branchId || targetBranchId || employee.branchId,
      month: req.month,
      fromDate: req.fromDate,
      toDate: req.toDate,
      schedule: rawSch,
      status: 'approved',
      approvedAt: req.approvedAt || req.adminApprovedAt || req.updatedAt || req.createdAt || '2000-01-01',
      source: 'requests'
    };

    const score = getCandidateScore(reqItem);
    candidates.push({
      ...reqItem,
      score
    });
  });

  // 3. Fallback: Employee profile branch assignment schedule (employee.branchesDetails)
  if (Array.isArray(employee.branchesDetails)) {
    const bd = employee.branchesDetails.find(b => 
      String(b.branchId) === targetBIdStr || 
      (targetBObj && String(b.branchId) === String(targetBObj.id))
    );
    if (bd && bd.schedule && typeof bd.schedule === 'object' && Object.keys(bd.schedule).length > 0) {
      candidates.push({
        id: `emp_bd_${employee.id}_${bd.branchId}`,
        employeeId: employee.id,
        branchId: bd.branchId,
        schedule: bd.schedule,
        status: 'approved',
        score: 45,
        approvedAt: employee.updatedAt || employee.createdAt || '2000-01-01',
        source: 'employee_branchesDetails'
      });
    }
  }

  // 4. Fallback: Employee profile direct roster (employee.roster or employee.workSchedule or employee.schedule)
  const profileSchedule = employee.roster?.schedule || employee.workSchedule || employee.schedule;
  if (profileSchedule && typeof profileSchedule === 'object' && Object.keys(profileSchedule).length > 0) {
    const isBranchApplicable = !targetBIdStr || !isMultiBranch || branchMatches(employee.branchId);
    if (isBranchApplicable) {
      candidates.push({
        id: `emp_profile_${employee.id}`,
        employeeId: employee.id,
        branchId: employee.branchId || targetBranchId,
        schedule: profileSchedule,
        status: 'approved',
        score: 40,
        approvedAt: employee.roster?.approvedAt || employee.updatedAt || employee.createdAt || '2000-01-01',
        source: 'employee_profile'
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort candidates by score descending, then by approval timestamp descending
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const timeA = new Date(a.approvedAt || 0).getTime() || 0;
    const timeB = new Date(b.approvedAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const winner = candidates[0];
  return {
    ...winner,
    status: 'approved',
    schedule: normalizeSchedule(winner.schedule)
  };
}


