import { arabicWeekday } from './formatters';
import { getRealTodayStr } from './timeEngine';
import { getActivePayrollMonth } from './periodEngine';

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
      return {
        ...otherBaseSched,
        isSwapped: true,
        swapRequestId: approvedSwap.id,
        swappedWithId: otherEmpId,
        swappedWithName: otherEmpName,
        swapDate: dateStr,
        swapNote: `🔄 شيفت متبدل مع: ${otherEmpName}`
      };
    }

    // الحالة الثانية: التبديل في تواريخ مختلفة (Cross-Date Swap)
    // أ) إذا كان هذا تاريخ طلب الموظف الأصلي (reqDate للمقدم أو tgtDate للهدف)
    if (isRequester && dateStr === reqDate) {
      // مقدم الطلب في يومه الأصلي reqDate: يتنازل عنه للزميل، ويصبح راحة
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
    }

    if (!isRequester && dateStr === tgtDate) {
      // الزميل المستهدف في يومه الأصلي tgtDate: يتنازل عنه لمقدم الطلب، ويصبح راحة
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
    }

    // ب) إذا كان هذا تاريخ التغطية البديل (tgtDate للمقدم أو reqDate للمستهدف)
    if (isRequester && dateStr === tgtDate) {
      // مقدم الطلب يغطي يوم الزميل tgtDate: يأخذ شيفت عمل الزميل
      const otherBaseSched = getEmployeeBaseDaySchedule(otherEmpId, tgtDate, state);
      const effectiveShift = (!otherBaseSched || otherBaseSched.isOff || otherBaseSched.type === 'off')
        ? getEmployeeBaseDaySchedule(empId, reqDate, state)
        : otherBaseSched;

      return {
        ...effectiveShift,
        type: 'shift',
        isOff: false,
        isSwapped: true,
        swapRequestId: approvedSwap.id,
        swappedWithId: otherEmpId,
        swappedWithName: otherEmpName,
        swapDate: tgtDate,
        originalShiftDate: reqDate,
        swapNote: `🔄 وردية عمل بديلة لتغطية ${otherEmpName}`
      };
    }

    if (!isRequester && dateStr === reqDate) {
      // الزميل المستهدف يغطي يوم مقدم الطلب reqDate: يأخذ شيفت عمل مقدم الطلب
      const reqBaseSched = getEmployeeBaseDaySchedule(reqEmpId, reqDate, state);
      const effectiveShift = (!reqBaseSched || reqBaseSched.isOff || reqBaseSched.type === 'off')
        ? getEmployeeBaseDaySchedule(empId, tgtDate, state)
        : reqBaseSched;

      return {
        ...effectiveShift,
        type: 'shift',
        isOff: false,
        isSwapped: true,
        swapRequestId: approvedSwap.id,
        swappedWithId: otherEmpId,
        swappedWithName: otherEmpName,
        swapDate: reqDate,
        originalShiftDate: tgtDate,
        swapNote: `🔄 وردية عمل بديلة لتغطية ${otherEmpName}`
      };
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

  const ensureRoster = (empId, monthKey) => {
    let ros = updatedRosters.find((r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month) && r.status === 'approved');
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
    const ros = ensureRoster(empAId, monthKeyA);
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
    const rosA = ensureRoster(empAId, monthKeyA);
    const rosB = ensureRoster(empBId, monthKeyB);

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
      schedB[dateA] = { ...(itemA_on_dateA.isOff ? itemB_on_dateB : itemA_on_dateA), type: 'shift', isOff: false, isSwapped: true, swappedWith: empAId };

      // في يوم dateB: الموظف A يغطي شيفت B، والموظف B راحة
      schedA[dateB] = { ...(itemB_on_dateB.isOff ? itemA_on_dateA : itemB_on_dateB), type: 'shift', isOff: false, isSwapped: true, swappedWith: empBId };
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
