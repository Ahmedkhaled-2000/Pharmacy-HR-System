import { arabicWeekday } from './formatters.js';
import { getRealTodayStr } from './timeEngine.js';
import { getActivePayrollMonth, getCycleDateRange, extractPayrollSettings } from './periodEngine.js';

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

export function normalizeDateStr(d) {
  if (!d) return '';
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      const year = parts[2];
      if (parseInt(parts[0], 10) > 12) {
        return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else if (parseInt(parts[1], 10) > 12) {
        return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      } else {
        return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return s.slice(0, 10);
}

/**
 * دالة استخراج جدول يوم محدد من خريطة الجدول (سواء كانت بالتواريخ أو أيام الأسبوع بالعربي أو الإنجليزي)
 * تعيد null في حال عدم وجود جدول معتمد لهذا اليوم، منعاً لفرض مواعيد عمل افتراضية تلقائية
 */
export function getDayScheduleFromMap(schedule, jsDayIndex, dateStr = null) {
  if (!schedule || typeof schedule !== 'object' || Object.keys(schedule).length === 0) {
    return null;
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

  return null;
}

export function getDayShiftsList(item) {
  if (!item || typeof item !== 'object') return [];
  if (item.type === 'off' || item.isOff) return [];

  if (Array.isArray(item.shifts) && item.shifts.length > 0) {
    return item.shifts
      .filter(s => s && typeof s === 'object' && !s.isOff && s.type !== 'off' && s.start && s.end)
      .map((s, idx) => ({
        id: s.id || `shift_${idx + 1}`,
        shiftIndex: idx + 1,
        branchId: String(s.branchId || item.branchId || '').trim(),
        branchName: s.branchName || item.branchName || '',
        start: s.start || '08:00',
        end: s.end || '16:00',
        hours: s.hours !== undefined ? Number(s.hours) : 8,
        type: s.type || 'shift',
        isOff: false
      }));
  }

  const shifts = [];
  if (item.start && item.end && !item.isOff && item.type !== 'off') {
    shifts.push({
      id: 'shift_1',
      shiftIndex: 1,
      branchId: String(item.branchId || '').trim(),
      branchName: item.branchName || '',
      start: item.start,
      end: item.end,
      hours: item.hours !== undefined ? Number(item.hours) : 8,
      type: item.type || 'shift',
      isOff: false
    });
  }

  if (item.hasSecondShift && item.secondShift && item.secondShift.start && item.secondShift.end && !item.secondShift.isOff && item.secondShift.type !== 'off') {
    shifts.push({
      id: 'shift_2',
      shiftIndex: 2,
      branchId: String(item.secondShift.branchId || '').trim(),
      branchName: item.secondShift.branchName || '',
      start: item.secondShift.start,
      end: item.secondShift.end,
      hours: item.secondShift.hours !== undefined ? Number(item.secondShift.hours) : 6,
      type: item.secondShift.type || 'shift',
      isOff: false
    });
  }

  return shifts;
}

function normalizeScheduleItem(item, jsDayIndex) {
  if (!item) {
    return null;
  }
  const isOff = item.type === 'off' || item.isOff === true;
  const shifts = isOff ? [] : getDayShiftsList(item);
  const hasSecondShift = Boolean(shifts.length > 1 || (item.hasSecondShift && item.secondShift));
  const secondShift = shifts.length > 1 ? {
    ...shifts[1],
    type: shifts[1].type || 'shift',
    isOff: false,
    branchId: shifts[1].branchId || null,
    branchName: shifts[1].branchName || null
  } : (hasSecondShift && item.secondShift ? {
    ...item.secondShift,
    type: item.secondShift.type || 'shift',
    isOff: item.secondShift.isOff || false,
    start: item.secondShift.start || '',
    end: item.secondShift.end || '',
    hours: item.secondShift.hours !== undefined ? item.secondShift.hours : (item.secondShift.start && item.secondShift.end ? 8 : 0),
    branchId: item.secondShift.branchId || null,
    branchName: item.secondShift.branchName || null
  } : null);

  const primaryShift = shifts[0] || null;

  return {
    ...item,
    type: isOff ? 'off' : (item.type || 'shift'),
    isOff,
    start: isOff ? '' : (primaryShift ? primaryShift.start : (item.start || '')),
    end: isOff ? '' : (primaryShift ? primaryShift.end : (item.end || '')),
    hours: item.hours !== undefined ? item.hours : (isOff ? 0 : (item.start && item.end ? 8 : 0)),
    branchId: primaryShift ? primaryShift.branchId : (item.branchId || null),
    branchName: primaryShift ? primaryShift.branchName : (item.branchName || null),
    hasSecondShift,
    secondShift,
    shifts
  };
}

/**
 * البحث عن جدول الموظف المعتمد لشهر أو فترة محددة
 */
export function findEmployeeRoster(empId, monthOrDate, state, targetBranchId = null) {
  if (!empId || !state) return null;
  const safeStr = (typeof monthOrDate === 'string' || typeof monthOrDate === 'number') ? String(monthOrDate).trim() : '';
  const dateStr = safeStr.length >= 10 ? safeStr.slice(0, 10) : null;
  let cycleMonth = safeStr.length >= 7 ? safeStr.slice(0, 7) : null;

  if (dateStr) {
    try {
      cycleMonth = getActivePayrollMonth(state.orgSettings || {}, new Date(dateStr + 'T00:00:00'));
    } catch {
      cycleMonth = safeStr.slice(0, 7);
    }
  }

  // 🌟 توحيد المصدر: استخدام getResolvedEmployeeRoster كمرجع أعلى وأوحد في كافة الشاشات
  const resolved = getResolvedEmployeeRoster(empId, targetBranchId, cycleMonth || dateStr, state);
  if (resolved && resolved.schedule) {
    return resolved;
  }

  return null;
}

/**
 * استخراج جدول الموظف الأساسي ليوم محدد بدون حساب التبديلات
 */
export function getEmployeeBaseDaySchedule(empId, dateStr, state, targetBranchId = null) {
  const empIdStr = String(empId);
  const emp = (state?.employees || []).find(e => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));

  // 🛡️ القاعدة الذهبية المركزية: الحصانة المطلقة لما قبل تاريخ التعيين الرسمي للموظف
  const rawHireDate = emp?.hireDate || emp?.hiring_date || emp?.contractStartDate;
  const hireDate = rawHireDate ? normalizeDateStr(rawHireDate) : '';
  if (hireDate && dateStr && dateStr < hireDate) {
    return {
      type: 'off',
      isOff: true,
      isPreHire: true,
      hireDate,
      hours: 0,
      start: '',
      end: '',
      label: `خارج العمل (تاريخ التعيين: ${hireDate})`,
      disabled: true
    };
  }

  if (emp?.noMonthlySchedule || emp?.isVariableHours || emp?.variableHours || emp?.hasNoRoster) {
    const arDay = arabicWeekday(dateStr);
    const restDays = Array.isArray(emp.weeklyRestDays) && emp.weeklyRestDays.length > 0 ? emp.weeklyRestDays : ['الجمعة'];
    const isRest = restDays.some(d => String(d).trim().replace(/[إأآ]/g, 'ا') === arDay.replace(/[إأآ]/g, 'ا'));
    if (isRest) {
      return { type: 'off', isOff: true, hours: 0, start: '', end: '', label: 'راحة أسبوعية' };
    }
    return { type: 'shift', isOff: false, hours: parseFloat(emp.workHoursPerDay || emp.workHours) || 8, start: '', end: '', variable: true, label: 'دوام حر بالساعات' };
  }

  const roster = findEmployeeRoster(empId, dateStr, state, targetBranchId);
  if (!roster || !roster.schedule) {
    return null;
  }
  const jsDay = new Date(dateStr + 'T00:00:00').getDay();
  // الاستعلام بالتاريخ أولاً لجلب تعيينات الفروع والورديات المحددة ليوم بعينه، ثم التراجع للجدول الأسبوعي
  const sched = getDayScheduleFromMap(roster.schedule, jsDay, dateStr) || getDayScheduleFromMap(roster.schedule, jsDay, null);
  if (!sched) return null;

  // إذا تم طلب جدول لفرع محدد وكان في هذا اليوم ورديات متعددة عبر الفروع
  if (targetBranchId) {
    const allShifts = getDayShiftsList(sched);
    const tgtBId = String(targetBranchId).trim();
    const branchShifts = allShifts.filter(s => String(s.branchId || '').trim() === tgtBId);
    if (branchShifts.length > 0) {
      const prim = branchShifts[0];
      const otherShifts = allShifts.filter(s => !branchShifts.includes(s));
      return {
        ...sched,
        ...prim,
        branchId: targetBranchId,
        branchName: prim.branchName || sched.branchName || null,
        isBranchSpecificShift: true,
        shifts: branchShifts,
        otherBranchShifts: otherShifts
      };
    }
  }

  return {
    ...sched,
    branchId: sched.branchId || roster.branchId || emp?.branchId || null,
    branchName: sched.branchName || roster.branchName || null
  };
}

/**
 * المحرك المركزي لاستخراج جدول الموظف ليوم محدد مع الأخذ بعين الاعتبار:
 * 1. طلبات تبديل الشيفتات المعتمدة (Shift Swaps) سواء كانت في نفس اليوم أو أيام مختلفة
 * 2. تبديل الراحات (Off Days) إذا كان أحد الطرفين في إجازة/راحة
 * 3. الجداول الشهرية المعتمدة
 */
export function getEmployeeDaySchedule(empId, dateStr, state, targetBranchId = null) {
  if (!empId || !dateStr) {
    return null;
  }

  const empIdStr = String(empId);
  const emp = (state?.employees || []).find(e => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  const empCodeStr = emp?.code ? String(emp.code) : '';

  // 🛡️ القاعدة الذهبية المركزية: الحصانة المطلقة لما قبل تاريخ التعيين الرسمي للموظف
  const rawHireDate = emp?.hireDate || emp?.hiring_date || emp?.contractStartDate;
  const hireDate = rawHireDate ? normalizeDateStr(rawHireDate) : '';
  if (hireDate && dateStr && dateStr < hireDate) {
    return {
      type: 'off',
      isOff: true,
      isPreHire: true,
      hireDate,
      hours: 0,
      start: '',
      end: '',
      label: `خارج العمل (تاريخ التعيين: ${hireDate})`,
      disabled: true
    };
  }

  // الموظف الذي ليس له جدول شهري (مواعيد متغيرة): يعتمد على أيام الراحة المحددة له
  if (emp?.noMonthlySchedule || emp?.isVariableHours || emp?.variableHours || emp?.hasNoRoster) {
    const arDay = arabicWeekday(dateStr);
    const restDays = Array.isArray(emp.weeklyRestDays) && emp.weeklyRestDays.length > 0 ? emp.weeklyRestDays : ['الجمعة'];
    const isRest = restDays.some(d => String(d).trim().replace(/[إأآ]/g, 'ا') === arDay.replace(/[إأآ]/g, 'ا'));
    if (isRest) {
      return { type: 'off', isOff: true, hours: 0, start: '', end: '', label: 'راحة أسبوعية' };
    }
    return { type: 'shift', isOff: false, hours: parseFloat(emp.workHoursPerDay || emp.workHours) || 8, start: '', end: '', variable: true, label: 'دوام حر بالساعات' };
  }

  // 0. فحص طلبات تعديل الشيفت أو الجداول الشهرية المعتمدة لهذا الموظف والتاريخ
  const approvedShiftAdj = (state?.requests || []).find(r => {
    if (!r) return false;
    const isAdj = r.type === 'shift_adjustment' || r.type === 'roster_edit' || r.type === 'roster_update' || r.type === 'roster_edit_request' || r.type === 'schedule_edit';
    if (!isAdj) return false;
    const isApproved = r.status === 'approved' || r.adminApproved === true || (r.branchApproved && r.isDirectToAdmin);
    if (!isApproved) return false;
    const isEmpMatch = String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr);
    if (!isEmpMatch) return false;

    if (r.date === dateStr) return true;
    if (Array.isArray(r.dates) && r.dates.includes(dateStr)) return true;
    if (r.schedule && r.schedule[dateStr]) return true;
    if (r.newSchedule && r.newSchedule[dateStr]) return true;
    if (r.replacementRestDate === dateStr) return true;
    return false;
  });

  if (approvedShiftAdj) {
    const schedItem = (approvedShiftAdj.schedule && approvedShiftAdj.schedule[dateStr]) ||
                      (approvedShiftAdj.newSchedule && approvedShiftAdj.newSchedule[dateStr]);
    if (schedItem) {
      const isOff = schedItem.type === 'off' || schedItem.isOff === true;
      return {
        ...schedItem,
        type: isOff ? 'off' : 'shift',
        isOff,
        start: isOff ? '' : (schedItem.start || '08:00'),
        end: isOff ? '' : (schedItem.end || '16:00'),
        hours: isOff ? 0 : (schedItem.hours !== undefined ? schedItem.hours : 8),
        isAdjusted: true,
        adjustmentRequestId: approvedShiftAdj.id,
        adjustmentLabel: isOff ? '🛋️ راحة معتمدة بطلب رسمي' : '🔄 وردية معتمدة بطلب رسمي'
      };
    }

    if (approvedShiftAdj.actionType === 'set_rest_day' || approvedShiftAdj.replacementRestDate === dateStr) {
      return {
        type: 'off',
        isOff: true,
        hours: 0,
        start: '',
        end: '',
        isAdjusted: true,
        adjustmentRequestId: approvedShiftAdj.id,
        adjustmentLabel: '🛋️ راحة معتمدة بطلب تعديل شيفت'
      };
    }

    if (approvedShiftAdj.newStartTime && approvedShiftAdj.newEndTime) {
      return {
        type: 'shift',
        isOff: false,
        start: approvedShiftAdj.newStartTime,
        end: approvedShiftAdj.newEndTime,
        hours: 8,
        isAdjusted: true,
        adjustmentRequestId: approvedShiftAdj.id,
        adjustmentLabel: '🔄 شيفت معدل بطلب رسمي'
      };
    }
  }

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
    const swapTime = new Date(approvedSwap.approvedAt || approvedSwap.createdAt || 0).getTime();
    const activeRoster = findEmployeeRoster(empId, dateStr, state);
    const rosterTime = activeRoster ? new Date(activeRoster.approvedAt || activeRoster.updatedAt || activeRoster.createdAt || 0).getTime() : 0;
    const hasExplicitDateInRoster = Boolean(activeRoster && activeRoster.schedule && activeRoster.schedule[dateStr]);

    // إذا كان الروستر المعتمد أحدث من التبديل وله إعداد مخصص لهذا التاريخ، نعتمد الروستر الأحدث ونتخطى التبديل السابق
    if (rosterTime > swapTime && hasExplicitDateInRoster) {
      // تم إلغاء/تجاوز التبديل القديم بواسطة الجدول المعتمد الأحدث
    } else {
    const reqEmpId = approvedSwap.requesterEmpId || approvedSwap.employeeId;
    const tgtEmpId = approvedSwap.targetEmpId || approvedSwap.targetEmployeeId || approvedSwap.peerEmployeeId;
    const reqDate = approvedSwap.requesterDate || approvedSwap.date || approvedSwap.startDate;
    const tgtDate = approvedSwap.targetDate || approvedSwap.targetSwapDate || reqDate;

    const isRequester = String(reqEmpId) === empIdStr || (empCodeStr && String(approvedSwap.employeeCode) === empCodeStr);
    const otherEmpId = isRequester ? tgtEmpId : reqEmpId;
    const otherEmp = (state?.employees || []).find(e => e && (String(e.id) === String(otherEmpId) || (e.code && String(e.code) === String(otherEmpId))));
    const otherEmpName = otherEmp?.name || (isRequester ? approvedSwap.targetEmpName : approvedSwap.requesterEmpName) || 'الزميل';

    // استخراج جدول كل طرف الأصلي في هذا التاريخ dateStr
    const myBaseSched = getEmployeeBaseDaySchedule(empIdStr, dateStr, state);
    const otherBaseSched = getEmployeeBaseDaySchedule(otherEmpId, dateStr, state);

    const isOtherOff = !otherBaseSched || otherBaseSched.type === 'off' || otherBaseSched.isOff === true;
    const isMyOff = !myBaseSched || myBaseSched.type === 'off' || myBaseSched.isOff === true;

    const prevStart = myBaseSched?.start || '';
    const prevEnd = myBaseSched?.end || '';
    const prevHours = isMyOff ? 0 : (myBaseSched?.hours !== undefined ? myBaseSched.hours : 8);
    const prevType = isMyOff ? 'off' : 'shift';

    const newStart = isOtherOff ? '' : (otherBaseSched?.start || '08:00');
    const newEnd = isOtherOff ? '' : (otherBaseSched?.end || '16:00');
    const newHours = isOtherOff ? 0 : (otherBaseSched?.hours !== undefined ? otherBaseSched.hours : 8);

    const swapNote = isOtherOff
      ? `🛋️ راحة متبدلة مع ${otherEmpName}${!isMyOff && prevStart ? ` (سابقاً وردية: ${prevStart} – ${prevEnd})` : ''}`
      : `🔄 وردية متبدلة (${newStart} – ${newEnd}) مع ${otherEmpName}${isMyOff ? ' (سابقاً: راحة أسبوعية)' : ` (سابقاً: ${prevStart} – ${prevEnd})`}`;

    return {
      type: isOtherOff ? 'off' : 'shift',
      isOff: isOtherOff,
      start: newStart,
      end: newEnd,
      hours: newHours,
      isSwapped: true,
      swapRequestId: approvedSwap.id,
      swappedWithId: otherEmpId,
      swappedWithName: otherEmpName,
      swapDate: dateStr,
      prevType,
      prevStart,
      prevEnd,
      prevHours,
      swapNote
    };
    }
  }

  // 2. في حال عدم وجود تبديل معتمد، استخراج الجدول الطبيعي للموظف
  return getEmployeeBaseDaySchedule(empId, dateStr, state, targetBranchId);
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
      const empObj = (employees || []).find((e) => e && (String(e.id) === String(empId) || (e.code && String(e.code) === String(empId))));
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
    const empAObj = (employees || []).find((e) => e && (String(e.id) === empAId || (e.code && String(e.code) === empAId)));
    const empBObj = (employees || []).find((e) => e && (String(e.id) === empBId || (e.code && String(e.code) === empBId)));
    const empAName = empAObj?.name || targetReq.requesterEmpName || 'الموظف الأول';
    const empBName = empBObj?.name || targetReq.targetEmpName || 'الموظف الثاني';

    const rosA = ensureRoster(empAId, monthKeyA, dateA);
    const rosB = ensureRoster(empBId, monthKeyB, dateB);

    const schedA = { ...(rosA.schedule || {}) };
    const schedB = { ...(rosB.schedule || {}) };

    const jsDayA = new Date(dateA + 'T00:00:00').getDay();
    const jsDayB = new Date(dateB + 'T00:00:00').getDay();

    // استخراج الجدول الأساسي لكل طرف قبل التبديل في التاريخين dateA و dateB
    const getBase = (sched, jsDay, dStr) => {
      if (sched[dStr] && sched[dStr].prevType) {
        const isOffPrev = sched[dStr].prevType === 'off';
        return {
          type: isOffPrev ? 'off' : 'shift',
          isOff: isOffPrev,
          start: isOffPrev ? '' : (sched[dStr].prevStart || '08:00'),
          end: isOffPrev ? '' : (sched[dStr].prevEnd || '16:00'),
          hours: isOffPrev ? 0 : (sched[dStr].prevHours || 8)
        };
      }
      return getDayScheduleFromMap(sched, jsDay, null) || { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8 };
    };

    const origA_on_dateA = getBase(schedA, jsDayA, dateA);
    const origB_on_dateA = getBase(schedB, jsDayA, dateA);

    // 1. في تاريخ dateA:
    // الموظف A يأخذ ما كان مقرراً للموظف B في dateA
    const isOffB_dateA = origB_on_dateA.type === 'off' || origB_on_dateA.isOff === true;
    schedA[dateA] = {
      type: isOffB_dateA ? 'off' : 'shift',
      isOff: isOffB_dateA,
      start: isOffB_dateA ? '' : (origB_on_dateA.start || '08:00'),
      end: isOffB_dateA ? '' : (origB_on_dateA.end || '16:00'),
      hours: isOffB_dateA ? 0 : (origB_on_dateA.hours !== undefined ? origB_on_dateA.hours : 8),
      isSwapped: true,
      swappedWith: empBId,
      swappedWithName: empBName,
      swapRequestId: targetReq.id,
      prevType: origA_on_dateA.type === 'off' || origA_on_dateA.isOff ? 'off' : 'shift',
      prevStart: origA_on_dateA.start || '',
      prevEnd: origA_on_dateA.end || '',
      prevHours: origA_on_dateA.hours || 0
    };

    // الموظف B يأخذ ما كان مقرراً للموظف A في dateA
    const isOffA_dateA = origA_on_dateA.type === 'off' || origA_on_dateA.isOff === true;
    schedB[dateA] = {
      type: isOffA_dateA ? 'off' : 'shift',
      isOff: isOffA_dateA,
      start: isOffA_dateA ? '' : (origA_on_dateA.start || '08:00'),
      end: isOffA_dateA ? '' : (origA_on_dateA.end || '16:00'),
      hours: isOffA_dateA ? 0 : (origA_on_dateA.hours !== undefined ? origA_on_dateA.hours : 8),
      isSwapped: true,
      swappedWith: empAId,
      swappedWithName: empAName,
      swapRequestId: targetReq.id,
      prevType: origB_on_dateA.type === 'off' || origB_on_dateA.isOff ? 'off' : 'shift',
      prevStart: origB_on_dateA.start || '',
      prevEnd: origB_on_dateA.end || '',
      prevHours: origB_on_dateA.hours || 0
    };

    // 2. في تاريخ dateB (إذا كان مختلفاً عن dateA):
    if (dateA !== dateB) {
      const origA_on_dateB = getBase(schedA, jsDayB, dateB);
      const origB_on_dateB = getBase(schedB, jsDayB, dateB);

      // الموظف A يأخذ ما كان مقرراً للموظف B في dateB
      const isOffB_dateB = origB_on_dateB.type === 'off' || origB_on_dateB.isOff === true;
      schedA[dateB] = {
        type: isOffB_dateB ? 'off' : 'shift',
        isOff: isOffB_dateB,
        start: isOffB_dateB ? '' : (origB_on_dateB.start || '08:00'),
        end: isOffB_dateB ? '' : (origB_on_dateB.end || '16:00'),
        hours: isOffB_dateB ? 0 : (origB_on_dateB.hours !== undefined ? origB_on_dateB.hours : 8),
        isSwapped: true,
        swappedWith: empBId,
        swappedWithName: empBName,
        swapRequestId: targetReq.id,
        prevType: origA_on_dateB.type === 'off' || origA_on_dateB.isOff ? 'off' : 'shift',
        prevStart: origA_on_dateB.start || '',
        prevEnd: origA_on_dateB.end || '',
        prevHours: origA_on_dateB.hours || 0
      };

      // الموظف B يأخذ ما كان مقرراً للموظف A في dateB
      const isOffA_dateB = origA_on_dateB.type === 'off' || origA_on_dateB.isOff === true;
      schedB[dateB] = {
        type: isOffA_dateB ? 'off' : 'shift',
        isOff: isOffA_dateB,
        start: isOffA_dateB ? '' : (origA_on_dateB.start || '08:00'),
        end: isOffA_dateB ? '' : (origA_on_dateB.end || '16:00'),
        hours: isOffA_dateB ? 0 : (origA_on_dateB.hours !== undefined ? origA_on_dateB.hours : 8),
        isSwapped: true,
        swappedWith: empAId,
        swappedWithName: empAName,
        swapRequestId: targetReq.id,
        prevType: origB_on_dateB.type === 'off' || origB_on_dateB.isOff ? 'off' : 'shift',
        prevStart: origB_on_dateB.start || '',
        prevEnd: origB_on_dateB.end || '',
        prevHours: origB_on_dateB.hours || 0
      };
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
  if (emp.noMonthlySchedule) return null;
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

export function normalizeSchedule(rawSchedule, monthOrCycleRange = null, options = {}) {
  if (!rawSchedule || typeof rawSchedule !== 'object' || Object.keys(rawSchedule).length === 0) {
    return null;
  }
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
  const isoDates = [];
  const arDayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  Object.entries(rawSchedule).forEach(([key, val]) => {
    const rawKey = String(key).trim();
    const cleanKey = rawKey.toLowerCase();
    const mappedDay = dayKeyMap[cleanKey] || dayKeyMap[key];
    const isIso = /^\d{4}-\d{2}-\d{2}$/.test(rawKey);
    const targetKey = mappedDay || (isIso ? rawKey : null);

    if (targetKey && val && typeof val === 'object') {
      const isOff = val.type === 'off' || val.isOff === true || val.type === 'راحة';
      const item = {
        ...val,
        type: isOff ? 'off' : 'shift',
        isOff,
        start: isOff ? '' : (val.start || val.checkIn || ''),
        end: isOff ? '' : (val.end || val.checkOut || ''),
        hours: val.hours !== undefined ? val.hours : (isOff ? 0 : 8)
      };
      normalized[targetKey] = item;

      if (isIso) {
        isoDates.push({ dateStr: rawKey, item });
      }
    }
  });

  // إذا كانت هناك تواريخ رقمية ISO محددة في الجدول (مثل تقويم شهر كامل):
  // نقوم بمطابقة واستنتاج القالب الأسبوعي القياسي (السبت..الجمعة) من النمط الغالب لتلك التواريخ
  // لضمان التناسق التام بين تقويم الأيام والقالب الأسبوعي
  if (isoDates.length > 0) {
    const weekdayBuckets = {
      'الأحد': [], 'الاثنين': [], 'الثلاثاء': [], 'الأربعاء': [],
      'الخميس': [], 'الجمعة': [], 'السبت': []
    };

    isoDates.forEach(({ dateStr, item }) => {
      try {
        const jsDay = new Date(dateStr + 'T00:00:00').getDay();
        const arDay = arDayNames[jsDay];
        if (arDay) {
          weekdayBuckets[arDay].push(item);
        }
      } catch {}
    });

    Object.entries(weekdayBuckets).forEach(([arDay, items]) => {
      if (items.length > 0) {
        let offCount = 0;
        let shiftCount = 0;
        let sampleShift = null;

        items.forEach((it) => {
          if (it.type === 'off' || it.isOff) {
            offCount++;
          } else {
            shiftCount++;
            if (!sampleShift && it.start && it.end) {
              sampleShift = it;
            }
          }
        });

        // إذا كان هناك إجماع أو أغلبية واضحة للأيام في الشهر
        if (offCount > shiftCount) {
          normalized[arDay] = {
            type: 'off',
            isOff: true,
            start: '',
            end: '',
            hours: 0
          };
        } else if (shiftCount >= offCount && sampleShift) {
          normalized[arDay] = {
            ...sampleShift,
            type: 'shift',
            isOff: false,
            start: sampleShift.start || '08:00',
            end: sampleShift.end || '16:00',
            hours: sampleShift.hours !== undefined ? sampleShift.hours : 8
          };
        } else if (!normalized[arDay] && items[0]) {
          normalized[arDay] = items[0];
        }
      }
    });
  }

  if (monthOrCycleRange) {
    return projectRosterToMonth(normalized, monthOrCycleRange, options);
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

/**
 * 🌟 المحرك الشامل لإسقاط ومزامنة الجدول الأسبوعي على كامل أيام الشهر وتوليد خريطة متكاملة
 * يضمن التزامن التام 100% بين النمط الأسبوعي (السبت..الجمعة) والتواريخ الفعلية (YYYY-MM-DD)
 */
export function projectRosterToMonth(rawSchedule, cycleRangeOrMonth, options = {}) {
  if (!rawSchedule || typeof rawSchedule !== 'object') return null;

  // استخراج النمط الأساسي بدون تشويه
  let baseSchedule = rawSchedule;
  const dayKeyMap = {
    'saturday': 'السبت', 'sunday': 'الأحد', 'monday': 'الاثنين', 'tuesday': 'الثلاثاء',
    'wednesday': 'الأربعاء', 'thursday': 'الخميس', 'friday': 'الجمعة',
    'السبت': 'السبت', 'الأحد': 'الأحد', 'الاحد': 'الأحد', 'الإثنين': 'الاثنين',
    'الاثنين': 'الاثنين', 'الثلاثاء': 'الثلاثاء', 'الأربعاء': 'الأربعاء', 'الاربعاء': 'الأربعاء',
    'الخميس': 'الخميس', 'الجمعة': 'الجمعة'
  };

  const normalized = {};
  Object.entries(rawSchedule).forEach(([k, v]) => {
    if (!v || typeof v !== 'object') return;
    const cleanK = String(k).trim().toLowerCase();
    const mapped = dayKeyMap[cleanK] || dayKeyMap[k];
    const isIso = /^\d{4}-\d{2}-\d{2}$/.test(String(k).trim());
    const targetKey = mapped || (isIso ? String(k).trim() : null);
    if (targetKey) {
      const isOff = v.type === 'off' || v.isOff === true || v.type === 'راحة';
      normalized[targetKey] = {
        ...v,
        type: isOff ? 'off' : 'shift',
        isOff,
        start: isOff ? '' : (v.start || v.checkIn || ''),
        end: isOff ? '' : (v.end || v.checkOut || ''),
        hours: v.hours !== undefined ? v.hours : (isOff ? 0 : 8)
      };
    }
  });

  let startDate = null;
  let endDate = null;

  if (cycleRangeOrMonth && typeof cycleRangeOrMonth === 'object' && cycleRangeOrMonth.startDate && cycleRangeOrMonth.endDate) {
    startDate = cycleRangeOrMonth.startDate;
    endDate = cycleRangeOrMonth.endDate;
  } else if (typeof cycleRangeOrMonth === 'string' && cycleRangeOrMonth) {
    const monthStr = cycleRangeOrMonth.slice(0, 7);
    try {
      const cr = getCycleDateRange(monthStr, options.orgSettings || {});
      startDate = cr.startDate;
      endDate = cr.endDate;
    } catch {
      const parts = monthStr.split('-').map(Number);
      if (parts.length >= 2) {
        const y = parts[0];
        const m = parts[1];
        const daysInM = new Date(y, m, 0).getDate();
        startDate = `${monthStr}-01`;
        endDate = `${monthStr}-${String(daysInM).padStart(2, '0')}`;
      }
    }
  }

  if (!startDate || !endDate) {
    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  const projected = { ...normalized };
  const rawHireDate = options.hireDate || options.empHireDate;
  const hireDate = rawHireDate ? normalizeDateStr(rawHireDate) : '';

  try {
    const cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const dayLabel = arabicWeekday(dateStr) || arabicWeekday(cur);

      // حصانة ما قبل التعيين
      if (hireDate && dateStr < hireDate) {
        projected[dateStr] = {
          type: 'off',
          isOff: true,
          isPreHire: true,
          hours: 0,
          start: '',
          end: '',
          label: `خارج نطاق التعاقد (تاريخ التعيين: ${hireDate})`
        };
      } else if (options.overrideAllWithWeekly || !projected[dateStr]) {
        // تطبيق النمط الأسبوعي على هذا التاريخ إذا لم يكن مخصصاً سلفاً أو طُلب فرض النمط
        const weeklyItem = normalized[dayLabel] || DEFAULT_WEEKLY_SCHEDULE[dayLabel];
        if (weeklyItem) {
          projected[dateStr] = {
            ...weeklyItem,
            ...(options.branchId ? { branchId: options.branchId } : {}),
            ...(options.branchName ? { branchName: options.branchName } : {})
          };
        }
      }

      cur.setDate(cur.getDate() + 1);
    }
  } catch (err) {
    console.warn('projectRosterToMonth error:', err);
  }

  // التأكد من وجود مفاتيح الأيام الأسبوعية السبعة
  const weekdays = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  weekdays.forEach((wd) => {
    if (!projected[wd]) {
      projected[wd] = normalized[wd] || DEFAULT_WEEKLY_SCHEDULE[wd];
    }
  });

  return projected;
}

export function getResolvedEmployeeRoster(employee, targetBranchId, arg3, arg4 = null) {
  if (!employee) return null;

  // 1. Flexible Argument Normalization (handles any parameter order)
  let state = null;
  let selectedMonth = null;
  let explicitBranchId = targetBranchId;

  const isState = (val) => val && typeof val === 'object' && (val.rosters || val.requests || val.employees || val.branches || val.orgSettings !== undefined);
  const isMonth = (val) => typeof val === 'string' && /^\d{4}-\d{1,2}$/.test(val.trim());

  if (isState(arg3)) {
    state = arg3;
    if (typeof arg4 === 'string') selectedMonth = arg4;
  } else if (isState(arg4)) {
    state = arg4;
    if (typeof arg3 === 'string') selectedMonth = arg3;
  } else if (isState(explicitBranchId)) {
    state = explicitBranchId;
    explicitBranchId = null;
    if (typeof arg3 === 'string') selectedMonth = arg3;
  } else if (arg3 && typeof arg3 === 'object') {
    state = arg3;
    if (typeof arg4 === 'string') selectedMonth = arg4;
  }

  // If explicitBranchId is a month string (e.g., '2026-10'):
  if (isMonth(explicitBranchId)) {
    if (!selectedMonth) selectedMonth = explicitBranchId.trim();
    explicitBranchId = null;
  }
  if (!selectedMonth && isMonth(arg3)) {
    selectedMonth = arg3.trim();
  }
  if (!selectedMonth && isMonth(arg4)) {
    selectedMonth = arg4.trim();
  }

  if (!state) return null;

  // 2. Resolve Employee Record and Identifiers
  let empObj = null;
  let empIdStr = '';
  let empCodeStr = '';

  if (typeof employee === 'object' && employee !== null) {
    empObj = employee;
    empIdStr = String(employee.id || employee.employeeId || employee.empId || '').trim();
    empCodeStr = String(employee.code || employee.employeeCode || employee.empCode || '').trim();
  } else if (typeof employee === 'string' || typeof employee === 'number') {
    empIdStr = String(employee).trim();
  }

  // Look up in state.employees if empObj is missing or has missing branches
  if (!empObj || !empObj.branchesDetails) {
    const found = (state.employees || []).find(e => e && (
      (empIdStr && String(e.id).trim() === empIdStr) ||
      (empIdStr && e.code && String(e.code).trim() === empIdStr) ||
      (empCodeStr && String(e.code).trim() === empCodeStr) ||
      (empCodeStr && String(e.id).trim() === empCodeStr)
    ));
    if (found) {
      empObj = { ...found, ...(typeof employee === 'object' ? employee : {}) };
      empIdStr = String(found.id).trim();
      if (found.code) empCodeStr = String(found.code).trim();
    }
  }

  const effectiveEmp = empObj || (typeof employee === 'object' ? employee : { id: empIdStr, code: empCodeStr });

  // إذا كان الموظف بدون جدول شهري (دوام حر / مرن بالساعات)
  if (effectiveEmp && (effectiveEmp.noMonthlySchedule || effectiveEmp.isVariableHours || effectiveEmp.variableHours || effectiveEmp.hasNoRoster || effectiveEmp.scheduleType === 'flexible')) {
    return null;
  }

  const rosters = state.rosters || [];
  const requests = state.requests || [];
  const targetBIdStr = explicitBranchId ? String(explicitBranchId).trim() : null;

  // Find target branch object in state.branches if available
  const targetBObj = targetBIdStr ? (state.branches || []).find(b => 
    b && (
      String(b.id) === targetBIdStr || 
      String(b.branchCode || '') === targetBIdStr || 
      (b.name && String(b.name).trim().toLowerCase() === targetBIdStr.toLowerCase())
    )
  ) : null;

  const isMultiBranch = Array.isArray(effectiveEmp?.branchesDetails) && effectiveEmp.branchesDetails.length > 1;

  // Month Normalizer (e.g. '2026-9' -> '2026-09')
  const normalizeMonth = (m) => {
    if (!m) return null;
    const str = String(m).trim();
    const parts = str.split('-');
    if (parts.length === 2) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}`;
    }
    return str;
  };

  const normSelectedMonth = normalizeMonth(selectedMonth);

  // Flexible Employee matching (by id or code in both directions and across aliases)
  const matchesEmployee = (item) => {
    if (!item) return false;
    const itemEmpId = String(item.employeeId || item.empId || item.id || item.employee?.id || '').trim();
    const itemEmpCode = String(item.employeeCode || item.empCode || item.code || item.employee?.code || '').trim();
    return (
      (empIdStr && itemEmpId === empIdStr) ||
      (empCodeStr && itemEmpCode === empCodeStr) ||
      (empCodeStr && itemEmpId === empCodeStr) ||
      (empIdStr && itemEmpCode === empIdStr)
    );
  };

  // Safe Branch String Extractor
  const extractBranchStr = (val) => {
    if (!val) return '';
    if (typeof val === 'object') {
      return String(val.id || val.branchId || val.name || val.branchName || '').trim();
    }
    return String(val).trim();
  };

  // Flexible Branch matching
  const branchMatches = (itemBranchId) => {
    if (!targetBIdStr) return true;
    const itemBStr = extractBranchStr(itemBranchId);

    // If item explicitly has no branch specified, check if employee belongs to targetBranch
    if (!itemBStr || itemBStr === 'all' || itemBStr === 'all_branches') {
      return true;
    }

    // Direct string match (case-insensitive)
    if (itemBStr.toLowerCase() === targetBIdStr.toLowerCase()) return true;

    if (targetBObj) {
      if (itemBStr === String(targetBObj.id) || 
          (targetBObj.branchCode && itemBStr.toLowerCase() === String(targetBObj.branchCode).toLowerCase()) || 
          (targetBObj.name && itemBStr.toLowerCase() === String(targetBObj.name).trim().toLowerCase())) {
        return true;
      }
    }

    // Check against employee's primary branch or assigned branches
    if (!isMultiBranch) {
      const empPrimaryBStr = extractBranchStr(employee.branchId);
      if (empPrimaryBStr && (empPrimaryBStr === targetBIdStr || (targetBObj && empPrimaryBStr === String(targetBObj.id)))) {
        if (itemBStr === empPrimaryBStr) return true;
      }

      const isAssigned = 
        String(employee.branchId || '') === targetBIdStr ||
        (targetBObj && String(employee.branchId || '') === String(targetBObj.id)) ||
        (Array.isArray(employee.branchesDetails) && employee.branchesDetails.some(bd => {
          const bdStr = extractBranchStr(bd.branchId || bd.id);
          return bdStr === targetBIdStr || (targetBObj && bdStr === String(targetBObj.id));
        }));

      if (isAssigned) {
        if (itemBStr === empPrimaryBStr) return true;
        return true;
      }
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
    const rawMonth = item.month || (item.fromDate ? String(item.fromDate).slice(0, 7) : null);
    const itemMonth = normalizeMonth(rawMonth);

    if (normSelectedMonth) {
      // 1. Direct exact month match
      if (itemMonth === normSelectedMonth) {
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
      else if (item.fromDate && normalizeMonth(String(item.fromDate).slice(0, 7)) === normSelectedMonth) {
        score = 85;
      }
      // 5. Standing / Recurring schedule (perpetual operational roster without month/date boundaries)
      else if (!item.month && !item.fromDate) {
        score = 80;
      }
      // 6. Most recent approved roster from an earlier month/cycle that carries forward
      else if (itemMonth && itemMonth < normSelectedMonth) {
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
    const sch = item.schedule || item.shifts || item.workSchedule || item.newSchedule;
    if (sch && typeof sch === 'object' && Object.keys(sch).length > 0) {
      score += 5;
      // أولوية إضافية للجداول التي تحتوي على تواريخ تفصيلية للدورة الكاملة
      if (Object.keys(sch).some(k => /^\d{4}-\d{2}-\d{2}$/.test(k))) {
        score += 10;
      }
    }

    // أولوية مطلقة للسجلات المتطابقة صراحة مع الفرع المستهدف (+200 نقطة)
    if (targetBIdStr && item.branchId) {
      const itemBStr = extractBranchStr(item.branchId);
      if (itemBStr.toLowerCase() === targetBIdStr.toLowerCase() || (targetBObj && itemBStr === String(targetBObj.id))) {
        score += 200;
      }
    }

    // إذا لم يحدد فرع مستهدف وطلبنا جدولاً شاملاً، نمنح الأولوية للجدول الموحد الرئيسي (+250 نقطة)
    if (!targetBIdStr && (item.isUnifiedMaster || item.id?.includes('unified') || (item.isMultiBranch && !String(item.id || '').includes('_b_')))) {
      score += 250;
    }

    return score;
  };

  const candidates = [];

  // 1. Gather all matching approved records from state.rosters
  rosters.forEach((r) => {
    if (!matchesEmployee(r)) return;
    if (r.status === 'rejected' || r.status === 'draft') return;

    const rawSch = r.schedule || r.shifts || r.workSchedule || r.newSchedule;
    const hasValidSch = Boolean(rawSch && typeof rawSch === 'object' && Object.keys(rawSch).length > 0);

    const isApproved = 
      r.status === 'approved' || 
      r.status === 'active' || 
      r.status === 'معتمد' || 
      r.adminApproved === true || 
      r.branchApproved === true || 
      r.isApproved === true || 
      (!r.status && hasValidSch);

    if (!isApproved) return;
    if (!branchMatches(r.branchId)) return;

    const score = getCandidateScore({ ...r, schedule: rawSch });
    candidates.push({
      ...r,
      schedule: rawSch,
      score,
      approvedAt: r.approvedAt || r.adminApprovedAt || r.branchApprovedAt || r.updatedAt || r.createdAt || '2000-01-01',
      source: 'rosters'
    });
  });

  // 2. Gather all matching approved records from state.requests
  requests.forEach((req) => {
    if (!matchesEmployee(req)) return;
    if (req.status === 'rejected' || req.status === 'cancelled') return;

    const rawSch = req.schedule || req.newSchedule || req.details?.schedule || req.roster?.schedule || req.workSchedule;
    const hasValidSch = Boolean(rawSch && typeof rawSch === 'object' && Object.keys(rawSch).length > 0);
    if (!hasValidSch) return;

    const reqType = String(req.type || '').toLowerCase();
    const isRosterType = 
      !req.type || 
      reqType.includes('roster') || 
      reqType.includes('schedule') || 
      reqType.includes('shift') || 
      Boolean(req.schedule || req.newSchedule);

    if (!isRosterType) return;

    const isApproved = 
      req.status === 'approved' || 
      req.status === 'active' || 
      req.status === 'معتمد' || 
      req.adminApproved === true || 
      req.branchApproved === true || 
      req.isApproved === true || 
      (req.branchApproved && req.status === 'pending_admin');

    if (!isApproved) return;
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
      approvedAt: req.approvedAt || req.adminApprovedAt || req.branchApprovedAt || req.updatedAt || req.createdAt || '2000-01-01',
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

  if (candidates.length === 0) {
    // 5. صمام الأمان النهائي: توليد جدول افتراضي يستند إلى ساعات العمل المقررة في ملف الموظف وفرعه
    const rawHrs = parseFloat(employee.workHoursPerDay || employee.workHours || 8) || 8;
    const hours = Math.min(16, Math.max(4, rawHrs));
    
    // حساب مواعيد الوردية القياسية بناءً على الساعات (افتراضياً تبدأ 09:00 صباحاً)
    const startHour = 9;
    const endTotal = (startHour + Math.round(hours)) % 24;
    const startTimeStr = `${String(startHour).padStart(2, '0')}:00`;
    const endTimeStr = `${String(endTotal).padStart(2, '0')}:00`;
    
    const defaultTemplate = {
      'السبت': { type: 'shift', start: startTimeStr, end: endTimeStr, hours },
      'الأحد': { type: 'shift', start: startTimeStr, end: endTimeStr, hours },
      'الاثنين': { type: 'shift', start: startTimeStr, end: endTimeStr, hours },
      'الثلاثاء': { type: 'shift', start: startTimeStr, end: endTimeStr, hours },
      'الأربعاء': { type: 'shift', start: startTimeStr, end: endTimeStr, hours },
      'الخميس': { type: 'shift', start: startTimeStr, end: endTimeStr, hours },
      'الجمعة': { type: 'off', isOff: true, start: '', end: '', hours: 0 }
    };

    return {
      id: `default_roster_${effectiveEmp?.id || empIdStr}_${selectedMonth || 'active'}`,
      employeeId: effectiveEmp?.id || empIdStr,
      branchId: targetBIdStr || effectiveEmp?.branchId || null,
      month: selectedMonth || null,
      schedule: defaultTemplate,
      status: 'approved',
      source: 'profile_default_fallback',
      isFallback: true
    };
  }

  // Sort candidates by score descending, then by approval timestamp descending
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const timeA = new Date(a.approvedAt || a.updatedAt || a.createdAt || 0).getTime() || 0;
    const timeB = new Date(b.approvedAt || b.updatedAt || b.createdAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const winner = candidates[0];
  let resolvedSchedule = normalizeSchedule(winner.schedule, normSelectedMonth);

  // 🌟 حماية وتخصيص الموظف متعدد الفروع:
  // إذا تم طلب جدول لفرع محدد وكان الجدول يحتوي على ورديات مخصصة لفرع آخر،
  // يتم استخراج الوردية الخاصة بهذا الفرع فقط، مع تمييز الفترات الأخرى لمنع أي تضارب
  if (isMultiBranch && targetBIdStr && resolvedSchedule && typeof resolvedSchedule === 'object') {
    const customizedSchedule = {};
    Object.entries(resolvedSchedule).forEach(([key, dayItem]) => {
      if (!dayItem || typeof dayItem !== 'object') {
        customizedSchedule[key] = dayItem;
        return;
      }
      if (dayItem.isPreHire) {
        customizedSchedule[key] = dayItem;
        return;
      }

      const allShifts = getDayShiftsList(dayItem);
      if (allShifts.length === 0) {
        customizedSchedule[key] = dayItem;
        return;
      }

      // هل يوجد أي وردية لهذا الفرع المستهدف في هذا اليوم؟
      const branchShifts = allShifts.filter(s => 
        !s.branchId || 
        s.branchId === targetBIdStr || 
        (targetBObj && (s.branchId === String(targetBObj.id) || s.branchId === String(targetBObj.branchCode)))
      );
      const otherShifts = allShifts.filter(s => !branchShifts.includes(s));

      if (branchShifts.length > 0) {
        const prim = branchShifts[0];
        const sec = branchShifts[1] || null;
        customizedSchedule[key] = {
          ...dayItem,
          branchId: targetBIdStr,
          branchName: targetBObj ? targetBObj.name : (prim.branchName || dayItem.branchName || ''),
          type: 'shift',
          isOff: false,
          start: prim.start,
          end: prim.end,
          hours: prim.hours,
          shifts: branchShifts,
          hasSecondShift: Boolean(sec),
          secondShift: sec ? { ...sec } : null,
          otherBranchShifts: otherShifts
        };
      } else {
        const otherNames = otherShifts.map(s => s.branchName || `فرع ${s.branchId}`).filter(Boolean).join(' و ');
        customizedSchedule[key] = {
          ...dayItem,
          isOtherBranchShift: true,
          otherBranchShifts: otherShifts,
          type: 'off',
          isOff: true,
          hours: 0,
          label: `مجدول بـ ${otherNames || 'فرع آخر'} (${otherShifts.map(s => `${s.start || '—'} إلى ${s.end || '—'}`).join('، ')})`
        };
      }
    });
    resolvedSchedule = customizedSchedule;
  }

  return {
    ...winner,
    status: 'approved',
    schedule: resolvedSchedule
  };
}

/**
 * 🌟 محرك تقسيم الجدول الموحد متعدد الفروع إلى جداول فرعية متوافقة لكل فرع على حدة
 * يدعم أي عدد من الفروع (فرعين، 3 فروع، 4 فروع أو أكثر) وورديات متعددة في اليوم الواحد
 */
export function splitUnifiedRosterForBranches(unifiedSchedule, employee, allBranches = [], options = {}) {
  if (!unifiedSchedule || typeof unifiedSchedule !== 'object' || !employee) return [];
  const branchesDetails = Array.isArray(employee.branchesDetails) && employee.branchesDetails.length > 0
    ? employee.branchesDetails
    : (employee.branchId ? [{ branchId: employee.branchId }] : []);

  if (branchesDetails.length <= 1) {
    const bId = branchesDetails[0]?.branchId || employee.branchId || '';
    const bObj = allBranches.find(b => String(b.id) === String(bId));
    return [{
      branchId: bId,
      branchName: bObj ? bObj.name : (employee.branchName || 'الفرع الرئيسي'),
      schedule: unifiedSchedule
    }];
  }

  return branchesDetails.map((bd) => {
    const bId = String(bd.branchId).trim();
    const bObj = allBranches.find(b => String(b.id) === bId || (b.branchCode && String(b.branchCode) === bId));
    const bName = bObj ? bObj.name : (bd.branchName || `فرع ${bId}`);
    const branchSchedule = {};

    Object.entries(unifiedSchedule).forEach(([key, dayItem]) => {
      if (!dayItem || typeof dayItem !== 'object') {
        branchSchedule[key] = dayItem;
        return;
      }
      if (dayItem.isPreHire) {
        branchSchedule[key] = dayItem;
        return;
      }
      if (dayItem.type === 'off' || dayItem.isOff) {
        branchSchedule[key] = {
          ...dayItem,
          branchId: bId,
          branchName: bName,
          type: 'off',
          isOff: true,
          hours: 0,
          shifts: []
        };
        return;
      }

      // استخراج كافة الورديات المجدولة في هذا اليوم عبر كافة الفروع
      const allShifts = getDayShiftsList(dayItem);
      if (allShifts.length === 0) {
        branchSchedule[key] = {
          ...dayItem,
          branchId: bId,
          branchName: bName,
          type: 'off',
          isOff: true,
          hours: 0,
          shifts: []
        };
        return;
      }

      // الورديات التابعة لهذا الفرع تحديداً
      const branchShifts = allShifts.filter((s) => {
        const sBId = String(s.branchId || '').trim();
        return !sBId || sBId === bId || (bObj && (sBId === String(bObj.id) || sBId === String(bObj.branchCode)));
      });

      // الورديات التابعة لفروع أخرى في نفس اليوم
      const otherShifts = allShifts.filter((s) => !branchShifts.includes(s));

      if (branchShifts.length > 0) {
        // الموظف لديه وردية أو أكثر في هذا الفرع اليوم
        const prim = branchShifts[0];
        const sec = branchShifts[1] || null;
        let branchHoursSum = 0;
        branchShifts.forEach((s) => {
          branchHoursSum += s.hours !== undefined ? Number(s.hours) : 8;
        });
        branchHoursSum = Math.round(branchHoursSum * 10) / 10;

        branchSchedule[key] = {
          ...dayItem,
          branchId: bId,
          branchName: bName,
          type: 'shift',
          isOff: false,
          start: prim.start,
          end: prim.end,
          hours: prim.hours,
          totalBranchHours: branchHoursSum,
          shifts: branchShifts,
          hasSecondShift: Boolean(sec),
          secondShift: sec ? { ...sec } : null,
          otherBranchShifts: otherShifts,
          isMultiShiftDay: allShifts.length > 1
        };
      } else {
        // الموظف مجدول في فرع آخر في هذا اليوم -> راحة في هذا الفرع مع إيضاح موقعه
        const otherNames = otherShifts.map((s) => s.branchName || `فرع ${s.branchId}`).filter(Boolean).join(' و ');
        branchSchedule[key] = {
          ...dayItem,
          branchId: bId,
          branchName: bName,
          isOtherBranchShift: true,
          otherBranchShifts: otherShifts,
          type: 'off',
          isOff: true,
          hours: 0,
          shifts: [],
          hasSecondShift: false,
          secondShift: null,
          label: `مجدول بـ ${otherNames || 'فرع آخر'} (${otherShifts.map((s) => `${s.start || '—'} إلى ${s.end || '—'}`).join('، ')})`
        };
      }
    });

    return {
      branchId: bId,
      branchName: bName,
      schedule: branchSchedule
    };
  });
}

/**
 * دالة ذكية لفحص التداخل الزمني بين أي ورديات متعددة في نفس اليوم
 */
export function checkAnyShiftsOverlap(shifts = []) {
  if (!Array.isArray(shifts) || shifts.length < 2) return false;
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (checkShiftsOverlap(shifts[i]?.start, shifts[i]?.end, shifts[j]?.start, shifts[j]?.end)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * دالة ذكية لفحص التداخل الزمني بين ورديتين
 */
export function checkShiftsOverlap(start1, end1, start2, end2) {
  if (!start1 || !end1 || !start2 || !end2) return false;
  try {
    const [s1H, s1M] = String(start1).split(':').map(Number);
    let [e1H, e1M] = String(end1).split(':').map(Number);
    let s1 = s1H * 60 + (s1M || 0);
    let e1 = e1H * 60 + (e1M || 0);
    if (e1 <= s1) e1 += 24 * 60;

    const [s2H, s2M] = String(start2).split(':').map(Number);
    let [e2H, e2M] = String(end2).split(':').map(Number);
    let s2 = s2H * 60 + (s2M || 0);
    let e2 = e2H * 60 + (e2M || 0);
    if (e2 <= s2) e2 += 24 * 60;

    return s1 < e2 && s2 < e1;
  } catch {
    return false;
  }
}



