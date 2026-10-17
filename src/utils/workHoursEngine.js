/**
 * workHoursEngine.js
 * المحرك المركزي الموحد لحساب ساعات العمل وتفصيل الورديات (Authoritative Work Hours Engine)
 * 
 * المرجع الرياضي والبرمجي الوحيد للمنظومة لاحتساب:
 * 1. فرق التوقيت الصافي بين الدخول والخروج مع تحصين ضد أخطاء البصمات المزدوجة المتطابقة (Zero-Duration Guard).
 * 2. معالجة الورديات الليلية العابرة لمنتصف الليل بدقة وأمان.
 * 3. القواعد الموحدة لخصم ساعات الراحة (Break Deduction) لإنهاء التضارب بين الخادم والواجهة.
 * 4. توزيع الساعات (أساسي، إضافي معتمد، معلق، مرفوض) ومنع تسمم الحسابات بقيم غير رقمية (NaN).
 */

import { findEmployeeRoster, getEmployeeDaySchedule } from './rosterEngine.js';
import { isBranchMatch } from './branchMatcher.js';
import { getCycleDateRange } from './periodEngine.js';
import { getEmployeeCurrentApprovedLeave, getRealTodayStr } from './formatters.js';

/**
 * فحص ما إذا كان للموظف جدول شهري معتمد رسمي
 */
export function hasEmployeeApprovedRoster(employeeId, dateStr, state) {
  if (!employeeId || !state) return false;
  const emp = (state.employees || []).find((e) => e && (String(e.id) === String(employeeId) || (e.code && String(e.code) === String(employeeId))));
  if (!emp) return false;

  // إذا كان الموظف مصنفاً كدوام مرن أو بدون جدول شهري
  if (emp.noMonthlySchedule || emp.isVariableHours || emp.variableHours || emp.hasNoRoster || emp.scheduleType === 'flexible' || emp.scheduleType === 'variable') {
    return false;
  }

  // البحث عن جدول معتمد رسمي لهذا الموظف
  const roster = findEmployeeRoster(emp.id, dateStr, state);
  return Boolean(roster && (roster.status === 'approved' || roster.adminApproved === true || roster.isApproved === true));
}

/**
 * فحص ما إذا كان هناك إذن معتمد رسمي للموظف لتاريخ معين
 */
export function findApprovedPermission(employeeId, dateStr, state) {
  if (!employeeId || !dateStr || !state) return null;
  const empIdStr = String(employeeId);
  const targetDate = String(dateStr).slice(0, 10);
  const emp = (state.employees || []).find((e) => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  const empCodeStr = emp?.code ? String(emp.code) : '';

  const allReqs = [
    ...(state.requests || []),
    ...(state.permissions || []),
    ...(state.employeePermissions || [])
  ];

  return allReqs.find((r) => {
    if (!r) return false;
    const rEmpId = String(r.employeeId || r.empId || '');
    if (rEmpId !== empIdStr && (!empCodeStr || rEmpId !== empCodeStr)) return false;

    const rDate = String(r.date || r.startDate || r.effectiveDate || r.reqDate || (r.createdAt ? r.createdAt.slice(0, 10) : '')).slice(0, 10);
    if (rDate !== targetDate) return false;

    const t = String(r.type || r.requestType || r.subType || '').toLowerCase();
    const isPermType =
      t.includes('perm') ||
      t.includes('إذن') ||
      t.includes('اذن') ||
      r.permType === 'late' ||
      r.permType === 'early' ||
      t === 'late_permission' ||
      t === 'early_leave' ||
      t === 'permission';

    if (!isPermType) return false;
    if (r.voidedOnShiftDelete || r.isCancelled || r.status === 'cancelled' || r.status === 'rejected') return false;

    return r.status === 'approved' || r.adminApproved || r.managerApproved;
  }) || null;
}

/**
 * حساب مدة التواجد بالدقائق الصافية بين وقتي الدخول والخروج
 * محمي بالكامل ضد:
 * - البصمات المزدوجة في نفس التوقيت (19:30 ➔ 19:30 تعطي 0 دقيقة وليس 1440 دقيقة).
 * - الانقلاب الزمني عبر منتصف الليل.
 */
export function calcRawDurationMinutes(timeIn, timeOut, options = {}) {
  if (!timeIn || !timeOut || String(timeOut).trim() === '' || String(timeOut).trim() === '—') {
    return 0;
  }

  // 1. إذا توفرت طوابع زمنية دقيقة بالمللي ثانية (Epoch)
  if (options.startEpoch && options.endEpoch && Number(options.endEpoch) >= Number(options.startEpoch)) {
    const epochDiffMins = Math.round((Number(options.endEpoch) - Number(options.startEpoch)) / 60000);
    // حماية البصمة المزدوجة اللحظية (أقل من 60 ثانية)
    if (epochDiffMins <= 0) return 0;
    // حماية الحد الأقصى المنطقي للوردية الواحدة (24 ساعة)
    return Math.min(24 * 60, epochDiffMins);
  }

  // 2. تحليل الساعات والدقائق النصية
  const [inH, inM] = String(timeIn).trim().slice(0, 5).split(':').map(Number);
  const [outH, outM] = String(timeOut).trim().slice(0, 5).split(':').map(Number);

  if (isNaN(inH) || isNaN(outH)) return 0;

  const sMins = inH * 60 + (inM || 0);
  let eMins = outH * 60 + (outM || 0);

  // 🛡️ صمام الأمان الحاسم (Zero-Duration Anti-Bounce Guard):
  // إذا تطابق وقت الدخول والانصراف تماماً في نفس الدقيقة:
  // تعود 0 دقيقة فوراً لتفادي كارثة اعتبارها 24 ساعة عمل
  if (sMins === eMins) {
    return 0;
  }

  // فحص الورديات الليلية العابرة لمنتصف الليل:
  // تحدث الوردية الليلية إذا كان وقت الخروج أقل من الدخول (مثلاً 06:00 < 22:00)
  // أو إذا كان تاريخ الخروج يختلف صراحة عن تاريخ الدخول وتاريخ الخروج لاحق له
  const isDateCrossing = Boolean(
    options.startDate &&
    options.endDate &&
    String(options.endDate) > String(options.startDate)
  );

  const isOvernight = Boolean(
    eMins < sMins ||
    options.isOvernight ||
    isDateCrossing
  );

  if (isOvernight && eMins < sMins) {
    eMins += 24 * 60;
  }

  let durationMinutes = Math.max(0, eMins - sMins);

  // حماية السقف الزمني للوردية (لا يمكن لوردية واحدة أن تتجاوز 24 ساعة)
  if (durationMinutes > 24 * 60) {
    durationMinutes = durationMinutes % (24 * 60);
  }

  return durationMinutes;
}

/**
 * تحديد ساعات الاستراحة المعتمدة للوردية وفق سياسة المنظومة الموحدة
 */
export function resolveEffectiveBreakHours(shift, employee, rawTotalHours) {
  // 1. إذا كان الموظف لديه استراحة مسجلة صراحة في الوردية
  const hasExplicitBreak = shift && shift.breakHours !== undefined &&
    shift.breakHours !== null &&
    String(shift.breakHours).trim() !== '' &&
    String(shift.breakHours).trim() !== '—';

  if (hasExplicitBreak) {
    return Math.max(0, parseFloat(shift.breakHours) || 0);
  }

  // 2. إذا كانت هناك فترات توقف فعلية مسجلة بالمللي ثانية (Kiosk pause)
  if (shift && (shift.accumulatedPauseMs || shift.trackedBreakMs)) {
    const pauseMs = shift.accumulatedPauseMs || shift.trackedBreakMs || 0;
    const trackedBreak = Math.round((pauseMs / 3600000) * 100) / 100;
    if (trackedBreak > 0) return trackedBreak;
  }

  // 3. الاستراحة التلقائية التعاقدية من ملف الموظف:
  // تطبق فقط إذا تجاوزت مدة العمل 4.5 ساعة والموظف ليس ذا جدول مرن (noMonthlySchedule)
  const empBreak = parseFloat(
    employee?.breakHours ||
    employee?.defaultBreakHours ||
    (employee?.branchesDetails && employee.branchesDetails[0]?.breakHours) ||
    0
  );

  if (empBreak > 0 && rawTotalHours >= 4.5 && !employee?.noMonthlySchedule) {
    return Math.min(empBreak, Math.max(0, rawTotalHours - 1));
  }

  return 0;
}

/**
 * المحرك الشامل لحساب وتفصيل ساعات الوردية (الأساسية، الإضافية، المستحقة، البريك)
 * خالي تماماً من أخطاء NaN ومحصن ضد كافة حالات الحافة.
 */
export function calculateShiftMetrics(shift, state) {
  if (!shift) {
    return {
      actualWorkedHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      overtimeStatus: 'none',
      isOvertimeApproved: false,
      payableHours: 0,
      permissionHours: 0,
      displayNetHours: 0,
      breakHours: 0,
      rawElapsedHours: 0,
      isCancelled: false,
      isRejectedPhoto: false,
      scheduledHours: 8,
      auditExplanation: 'لا توجد بيانات وردية'
    };
  }

  // 1. فحص حالات الإلغاء والرفض الصريح للبصمة / الوردية بأكملها (وليس مجرد رفض الساعات الإضافية)
  const statusLabelStr = typeof shift.statusLabel === 'string' ? shift.statusLabel : '';
  const isOvertimeOnlyRejection = Boolean(
    shift.rejectedOvertime ||
    shift.overtimeStatus === 'rejected' ||
    statusLabelStr.includes('إضافي مرفوض') ||
    statusLabelStr.includes('إضافي مستبعد')
  );

  const isRejected = Boolean(
    shift.status === 'cancelled' ||
    shift.status === 'rejected_photo' ||
    shift.isRejectedPhoto ||
    shift.isCancelled ||
    shift.attendanceRejected ||
    (shift.status === 'rejected' && !isOvertimeOnlyRejection) ||
    (statusLabelStr && (
      statusLabelStr.includes('ملغي') ||
      statusLabelStr.includes('بصمة مرفوضة') ||
      statusLabelStr.includes('حضور مرفوض') ||
      statusLabelStr.includes('رفض الصورة')
    ) && !statusLabelStr.includes('إضافي مرفوض') && !statusLabelStr.includes('إضافي مستبعد'))
  );

  if (isRejected) {
    return {
      actualWorkedHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      overtimeStatus: 'rejected',
      isOvertimeApproved: false,
      payableHours: 0,
      permissionHours: 0,
      displayNetHours: 0,
      breakHours: parseFloat(shift.breakHours) || 0,
      rawElapsedHours: 0,
      isCancelled: true,
      isRejectedPhoto: Boolean(shift.isRejectedPhoto || shift.status === 'rejected_photo'),
      scheduledHours: 8,
      auditExplanation: 'وردية ملغاة أو مرفوضة (0 ساعة)'
    };
  }

  // 2. البحث عن الموظف
  const emp = (state?.employees || []).find(
    (e) => e && (String(e.id) === String(shift.employeeId) || (shift.employeeCode && String(e.code) === String(shift.employeeCode)))
  );

  const timeIn = shift.timeIn || shift.checkIn || shift.inTime || shift.startTime;
  const timeOut = shift.timeOut || shift.checkOut || shift.outTime || shift.endTime;

  let rawElapsedHours = 0;
  let effectiveBreak = 0;
  let actualWorkedHours = 0;

  const hasRealTimeOut = Boolean(
    timeOut &&
    String(timeOut).trim() !== '' &&
    String(timeOut).trim() !== '—' &&
    !String(timeOut).includes('قيد العمل') &&
    !String(timeOut).includes('غير مسجل')
  );

  if (timeIn && hasRealTimeOut) {
    const rawMins = calcRawDurationMinutes(timeIn, timeOut, {
      startDate: shift.date,
      endDate: shift.timeOutDate || shift.endDate || shift.date,
      isOvernight: shift.isOvernight,
      startEpoch: shift.startEpoch,
      endEpoch: shift.endEpoch || shift.punchEpoch
    });

    rawElapsedHours = Math.round((rawMins / 60) * 100) / 100;
    effectiveBreak = resolveEffectiveBreakHours(shift, emp, rawElapsedHours);
    actualWorkedHours = Math.max(0, Math.round((rawElapsedHours - effectiveBreak) * 100) / 100);
  } else {
    // الاعتماد على الساعات المحفوظة مسبقاً في حال عدم وجود أوقات نصية صريحة
    const base = parseFloat(
      shift._baseRawHours !== undefined
        ? shift._baseRawHours
        : shift.actualWorkedHours !== undefined
        ? shift.actualWorkedHours
        : shift.netHours !== undefined
        ? shift.netHours
        : shift.hours !== undefined
        ? shift.hours
        : shift.workHours || 0
    ) || 0;

    effectiveBreak = resolveEffectiveBreakHours(shift, emp, base);
    actualWorkedHours = (shift.actualWorkedHours !== undefined || shift.netHours !== undefined)
      ? Math.max(0, base)
      : Math.max(0, Math.round((base - effectiveBreak) * 100) / 100);
    rawElapsedHours = actualWorkedHours + effectiveBreak;
  }

  // 3. فحص ساعات الإذن المعتمد
  let permHours = 0;
  // فحص ما إذا كانت الوردية يدوية معتمدة من الإدارة (تعتمد ساعات العمل من فرق البصمتين فقط دون دمج أذونات قديمة ما لم يُطلب صراحة)
  const isManualAdminShift = Boolean(
    shift.isManual ||
    shift.manualPunch ||
    shift.editedByAdmin ||
    shift.isAdminCreated ||
    shift.unlinkPriorRequests ||
    shift.decoupledDay
  );
  const shouldDecouplePerm = isManualAdminShift && (shift.ignorePermissions !== false);

  if (!shouldDecouplePerm) {
    try {
      const perm = findApprovedPermission(shift.employeeId, shift.date, state);
      if (perm && !perm.decoupledFromPunch && !perm.voidedOnManualPunch) {
        permHours = parseFloat(perm.hours) || 0;
        if (!permHours && perm.durationMinutes) {
          permHours = Math.round((perm.durationMinutes / 60) * 100) / 100;
        }
        if (!permHours && perm.startTime && perm.endTime) {
          const pMins = calcRawDurationMinutes(perm.startTime, perm.endTime);
          permHours = Math.round((pMins / 60) * 100) / 100;
        }
      } else if (shift.permissionHours) {
        permHours = parseFloat(shift.permissionHours) || 0;
      }
    } catch {
      permHours = parseFloat(shift.permissionHours) || 0;
    }
  } else if (shift.includePermissionHours && shift.permissionHours) {
    permHours = parseFloat(shift.permissionHours) || 0;
  }

  // 4. الساعات المقررة للوردية (Scheduled Hours)
  const isFlexibleSchedule = Boolean(
    emp?.noMonthlySchedule === true ||
    emp?.noMonthlySchedule === 'true' ||
    emp?.noMonthlySchedule === 'yes' ||
    emp?.noMonthlySchedule === 1 ||
    emp?.noMonthlySchedule === '1' ||
    emp?.isVariableHours === true ||
    emp?.isVariableHours === 'true' ||
    emp?.variableHours === true ||
    emp?.hasNoRoster === true ||
    emp?.scheduleType === 'flexible' ||
    emp?.scheduleType === 'variable'
  );

  let branchProfileHours = null;
  if (shift.branchId && Array.isArray(emp?.branchesDetails)) {
    const bd = emp.branchesDetails.find(b => String(b.branchId) === String(shift.branchId));
    if (bd && bd.workHoursPerDay) branchProfileHours = parseFloat(bd.workHoursPerDay);
  }
  const profileHours = branchProfileHours || parseFloat(emp?.workHoursPerDay || emp?.workHours || (emp?.branchesDetails && emp.branchesDetails[0]?.workHoursPerDay) || 8);
  
  // فحص ما إذا كان للموظف جدول شهري معتمد رسمي لهذا اليوم
  const hasApprovedRoster = !isFlexibleSchedule && hasEmployeeApprovedRoster(shift.employeeId || emp?.id, shift.date, state);
  const daySchedule = hasApprovedRoster ? getEmployeeDaySchedule(shift.employeeId || emp?.id, shift.date, state, shift.branchId) : null;
  const isScheduledOffDay = Boolean(hasApprovedRoster && daySchedule && (daySchedule.type === 'off' || daySchedule.isOff === true));
  const hasScheduledShiftWindow = Boolean(hasApprovedRoster && !isScheduledOffDay && daySchedule && daySchedule.start && daySchedule.end);

  const schedStartStr = (hasApprovedRoster && !isScheduledOffDay && (shift.scheduledStart || daySchedule?.start)) || '';
  const schedEndStr = (hasApprovedRoster && !isScheduledOffDay && (shift.scheduledEnd || daySchedule?.end)) || '';

  let scheduledHours = profileHours;
  if (isScheduledOffDay) {
    scheduledHours = 0;
  } else if (hasApprovedRoster && hasScheduledShiftWindow && schedStartStr && schedEndStr) {
    const [sH, sM] = schedStartStr.split(':').map(Number);
    let [eH, eM] = schedEndStr.split(':').map(Number);
    if (!isNaN(sH) && !isNaN(eH)) {
      let sMins = sH * 60 + (sM || 0);
      let eMins = eH * 60 + (eM || 0);
      if (eMins <= sMins) eMins += 24 * 60;
      scheduledHours = Math.round(((eMins - sMins) / 60) * 100) / 100;
    }
  } else if (!isFlexibleSchedule && shift.scheduledHours !== undefined) {
    scheduledHours = parseFloat(shift.scheduledHours) || profileHours;
  }

  // 5. الساعات الأساسية والإضافية
  let regularHours = 0;
  let overtimeHours = 0;

  if (actualWorkedHours === 0) {
    regularHours = 0;
    overtimeHours = 0;
  } else {
    // التحقق مما إذا كان هناك إضافي مسجل صراحة أو معتمد على الوردية
    const rawOtHours = parseFloat(shift.overtimeHours) || 0;

    // ── الحالة الأولى: موظف لديه جدول شهري معتمد (Approved Monthly Schedule) ──
    // أ) إذا حضر في يوم راحته الأسبوعية المقررة بالجدول الشهري: كافة الساعات تحتسب إضافي
    if (hasApprovedRoster && isScheduledOffDay) {
      regularHours = 0;
      let calculatedOt = actualWorkedHours;
      if (rawOtHours > 0) {
        calculatedOt = Math.max(rawOtHours, calculatedOt);
      }
      overtimeHours = calculatedOt;
    }
    // ب) إذا حضر في يوم عمل مجدول: يتم احتساب الساعات الإضافية حصراً خارج مواعيد الوردية المجدولة (قبل البداية وبعد النهاية)
    else if (hasApprovedRoster && hasScheduledShiftWindow && schedStartStr && schedEndStr && timeIn && hasRealTimeOut) {
      const [sH, sM] = schedStartStr.split(':').map(Number);
      let [eH, eM] = schedEndStr.split(':').map(Number);
      let schedStartMins = sH * 60 + (sM || 0);
      let schedEndMins = eH * 60 + (eM || 0);
      if (schedEndMins <= schedStartMins) schedEndMins += 24 * 60;

      const [inH, inM] = String(timeIn).trim().slice(0, 5).split(':').map(Number);
      let [outH, outM] = String(timeOut).trim().slice(0, 5).split(':').map(Number);
      let actInMins = inH * 60 + (inM || 0);
      let actOutMins = outH * 60 + (outM || 0);
      if (actOutMins <= actInMins) actOutMins += 24 * 60;

      // الساعات الإضافية خارج ساعات عمل الجدول: قبل الموعد + بعد الموعد
      const earlyArrivalMins = actInMins < schedStartMins ? (schedStartMins - actInMins) : 0;
      const lateDepartureMins = actOutMins > schedEndMins ? (actOutMins - schedEndMins) : 0;

      const earlyOtHours = Math.round((earlyArrivalMins / 60) * 100) / 100;
      const lateOtHours = Math.round((lateDepartureMins / 60) * 100) / 100;
      let calculatedOt = Math.round((earlyOtHours + lateOtHours) * 100) / 100;

      if (rawOtHours > 0) {
        calculatedOt = Math.max(rawOtHours, calculatedOt);
      }
      overtimeHours = calculatedOt;

      // الساعات الأساسية: ساعات العمل المنفذة داخل نافذة الوردية المجدولة
      regularHours = Math.max(0, Math.round((actualWorkedHours - overtimeHours) * 100) / 100);
    }
    // ── الحالة الثانية: موظفون ليس لديهم جدول شهري معتمد / دوام حر (No Monthly Schedule) ──
    // يتم احتساب الساعات الإضافية عندما تكون ساعات العمل الفعلية أكبر من ساعات ملف الموظف
    else {
      if (actualWorkedHours > profileHours) {
        regularHours = profileHours;
        overtimeHours = Math.round((actualWorkedHours - profileHours) * 100) / 100;
        if (rawOtHours > 0) {
          overtimeHours = Math.max(rawOtHours, overtimeHours);
        }
      } else {
        regularHours = actualWorkedHours;
        overtimeHours = rawOtHours > 0 ? rawOtHours : 0;
      }
    }
  }

  // 6. تحديد حالة الوقت الإضافي (Overtime Status) والاعتماد المركزي
  let overtimeStatus = 'none';
  if (overtimeHours > 0) {
    const dateStr = shift.date;
    const sEmpId = String(shift.employeeId || '');
    const sEmpCode = String(shift.employeeCode || emp?.code || '');
    const linkedOtReq = (state?.requests || []).find(r => {
      if (!r) return false;
      const isOtType = r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي' || (parseFloat(r.overtimeHours) > 0 && String(r.id || '').includes('ot'));
      if (!isOtType) return false;
      if (r.id && (r.id === shift.linkedRequestId || r.id === shift.overtimeRequestId)) return true;
      if (shift.id && r.shiftId === shift.id) return true;
      const rEmpId = String(r.employeeId || r.empId || '');
      const rEmpCode = String(r.employeeCode || '');
      const empMatch = (
        (sEmpId && (rEmpId === sEmpId || rEmpCode === sEmpId)) ||
        (sEmpCode && (rEmpId === sEmpCode || rEmpCode === sEmpCode)) ||
        (emp?.id && (rEmpId === String(emp.id) || rEmpCode === String(emp.id))) ||
        (emp?.code && (rEmpId === String(emp.code) || rEmpCode === String(emp.code)))
      );
      const dateMatch = r.date === dateStr || r.targetDate === dateStr || r.details?.shiftDate === dateStr;
      return empMatch && dateMatch;
    });

    // 🛡️ السيادة المطلقة للتعديل اليدوي للإدارة: إذا كانت الوردية يدوية ومعتمدة من الإدارة
    // يتم فك الارتباط التام بأي طلبات رفض سابقة في مصفوفة الطلبات وتغليب قرار الإدارة
    const isManualAdminShift = Boolean(
      shift.isManual ||
      shift.manualPunch ||
      shift.editedByAdmin ||
      shift.isAdminCreated ||
      shift.unlinkPriorRequests ||
      shift.decoupledDay
    );

    // إذا كانت الوردية يدوية ولم ترفضها الإدارة صراحة على مستوى الوردية نفسها، نتجاهل أي رفض قديم خارجي في linkedOtReq
    const isShiftRejected = isManualAdminShift
      ? Boolean(shift.overtimeStatus === 'rejected' && shift.rejectedOvertime === true)
      : Boolean(shift.overtimeStatus === 'rejected' || shift.rejectedOvertime === true);
    const isReqRejected = !isManualAdminShift && Boolean(linkedOtReq && (linkedOtReq.status === 'rejected' || linkedOtReq.adminRejected === true));

    const isShiftApproved = !isShiftRejected && (
      shift.overtimeStatus === 'approved' ||
      shift.isOvertimeApproved === true ||
      (isManualAdminShift && shift.adminApproved && !isShiftRejected)
    );
    const isReqApproved = !isShiftRejected && !isReqRejected && Boolean(linkedOtReq && (linkedOtReq.status === 'approved' || linkedOtReq.adminApproved === true));

    if (isShiftRejected || isReqRejected) {
      overtimeStatus = 'rejected';
    } else if (isShiftApproved || isReqApproved) {
      overtimeStatus = 'approved';
    } else if (shift.overtimeStatus === 'pending' || (linkedOtReq && (linkedOtReq.status === 'pending' || linkedOtReq.status === 'pending_admin'))) {
      overtimeStatus = 'pending';
    } else {
      overtimeStatus = isManualAdminShift && shift.adminApproved ? 'approved' : 'pending';
    }
  }

  const isOtApproved = (overtimeStatus === 'approved');


  // 7. معالجة طلبات عدم الالتزام بالجدول (Schedule Deviation)
  if (shift.deviationStatus === 'rejected') {
    if (shift.scheduledEnd && timeIn) {
      const devMins = calcRawDurationMinutes(timeIn, shift.scheduledEnd, {
        startDate: shift.date,
        endDate: shift.date
      });
      const devHours = Math.max(0, Math.round((devMins / 60) * 100) / 100);
      actualWorkedHours = Math.max(0, Math.round((devHours - effectiveBreak) * 100) / 100);
      regularHours = actualWorkedHours;
      overtimeHours = 0;
      overtimeStatus = 'rejected';
    } else if (shift.regularHours !== undefined) {
      actualWorkedHours = parseFloat(shift.regularHours) || 0;
      regularHours = actualWorkedHours;
      overtimeHours = 0;
    }
  }

  // 8. الساعات المستحقة للصرف المالي (Payable Hours)
  let payableHours = regularHours;
  if (isOtApproved) {
    payableHours = Math.round((regularHours + overtimeHours) * 100) / 100;
  }
  if (permHours > 0) {
    payableHours = Math.round((payableHours + permHours) * 100) / 100;
  }

  // 9. الساعات الصافية للعرض (Display Hours)
  let displayNetHours = Math.round((actualWorkedHours + permHours) * 100) / 100;
  if (overtimeStatus === 'rejected') {
    displayNetHours = Math.round((regularHours + permHours) * 100) / 100;
  }

  // 10. الشرح الرياضي التوثيقي
  const auditExplanation = `الحضور: ${timeIn || '—'} ➔ الانصراف: ${timeOut || '—'} (إجمالي: ${rawElapsedHours.toFixed(2)} س) - بريك: ${effectiveBreak.toFixed(2)} س + إذن: ${permHours.toFixed(2)} س = الصافي الفعلي: ${actualWorkedHours.toFixed(2)} س (المستحق: ${payableHours.toFixed(2)} س)`;

  return {
    actualWorkedHours: Math.max(0, actualWorkedHours),
    regularHours: Math.max(0, regularHours),
    overtimeHours: Math.max(0, overtimeHours),
    overtimeStatus,
    isOvertimeApproved: isOtApproved,
    payableHours: Math.max(0, payableHours),
    permissionHours: Math.max(0, permHours),
    displayNetHours: Math.max(0, displayNetHours),
    breakHours: effectiveBreak,
    rawElapsedHours,
    isCancelled: false,
    isRejectedPhoto: false,
    scheduledHours,
    auditExplanation
  };
}

/**
 * الدالة المركزية الموحدة لاحتساب الساعات الفعلية المستحقة للوردية
 * استبدال كامل وآمن لـ getEffectiveShiftHours
 */
export function getAuthoritativeShiftHours(shift, state) {
  const metrics = calculateShiftMetrics(shift, state);

  // في حال وجود موظف مرن: تحسب كامل ساعاته الفعلية
  const emp = (state?.employees || []).find(
    (e) => e && (String(e.id) === String(shift?.employeeId) || (shift?.employeeCode && String(e.code) === String(shift?.employeeCode)))
  );
  const isFlex = Boolean(
    emp?.noMonthlySchedule ||
    emp?.isVariableHours ||
    emp?.variableHours ||
    emp?.hasNoRoster ||
    emp?.scheduleType === 'flexible'
  );
  if (isFlex && metrics.overtimeHours === 0) {
    return metrics.actualWorkedHours;
  }

  // للموظف العادي: ترجع الساعات الأساسية المستحقة (مع إضافة الإذن المعتمد إن وجد)
  // حيث يُحسب الإضافي في عمود الإضافي المستقل لمنع الازدواج
  return Math.round((metrics.regularHours + metrics.permissionHours) * 100) / 100;
}

/**
 * دالة فحص وتدقيق تعارضات الورديات لموظف:
 * 1. تمنع تكرار الوردية في نفس اليوم لنفس الفرع.
 * 2. تمنع التداخل الزمني التام بين أي ورديتين للموظف (سواء في نفس الفرع أو في فرعين مختلفين).
 * 3. تسمح بتسجيل أكثر من وردية في نفس اليوم طالما كانت في فروع مختلفة وبمواعيد غير متداخلة.
 */
export function checkShiftConflicts({
  employeeId,
  employeeCode = '',
  branchId = '',
  branchName = '',
  date,
  timeIn,
  timeOut,
  excludeShiftId = null,
  shifts = [],
  branches = []
}) {
  if (!employeeId || !date || !timeIn || !timeOut) {
    return { hasConflict: false };
  }

  const cleanTime = (t) => String(t || '').trim().slice(0, 5);
  const tIn = cleanTime(timeIn);
  const tOut = cleanTime(timeOut);
  if (!tIn.includes(':') || !tOut.includes(':')) {
    return { hasConflict: false };
  }

  const [candInH, candInM] = tIn.split(':').map(Number);
  const [candOutH, candOutM] = tOut.split(':').map(Number);
  let candInMins = candInH * 60 + (candInM || 0);
  let candOutMins = candOutH * 60 + (candOutM || 0);
  if (candOutMins <= candInMins) {
    candOutMins += 24 * 60; // وردية ليلية عابرة لمنتصف الليل
  }

  const targetDateStr = String(date).slice(0, 10);
  const targetDateEpoch = new Date(`${targetDateStr}T00:00:00Z`).getTime();
  const candStartEpoch = targetDateEpoch + candInMins * 60 * 1000;
  const candEndEpoch = targetDateEpoch + candOutMins * 60 * 1000;

  const targetBranchObj = (branches || []).find(
    (b) => isBranchMatch(branchId, b) || (branchName && isBranchMatch(branchName, b))
  );
  const effectiveBranchName = targetBranchObj?.name || branchName || branchId || 'الفرع المحدد';

  const empIdStr = String(employeeId);
  const empCodeStr = employeeCode ? String(employeeCode) : '';

  const otherShifts = (shifts || []).filter((s) => {
    if (!s) return false;
    if (excludeShiftId && String(s.id) === String(excludeShiftId)) return false;
    if (s.status === 'cancelled' || s.isCancelled) return false;

    const sEmpId = String(s.employeeId || '');
    const sEmpCode = s.employeeCode ? String(s.employeeCode) : '';
    const isEmpMatch = sEmpId === empIdStr || (empCodeStr && (sEmpCode === empCodeStr || sEmpId === empCodeStr));
    return isEmpMatch;
  });

  for (const s of otherShifts) {
    const sDate = String(s.date || '').slice(0, 10);
    if (!sDate) continue;

    const sIn = cleanTime(s.timeIn);
    const sOut = cleanTime(s.timeOut);
    if (!sIn.includes(':') || !sOut.includes(':')) continue;

    const [sInH, sInM] = sIn.split(':').map(Number);
    const [sOutH, sOutM] = sOut.split(':').map(Number);
    let sInMins = sInH * 60 + (sInM || 0);
    let sOutMins = sOutH * 60 + (sOutM || 0);
    if (sOutMins <= sInMins) {
      sOutMins += 24 * 60;
    }

    const sDateEpoch = new Date(`${sDate}T00:00:00Z`).getTime();
    const sStartEpoch = sDateEpoch + sInMins * 60 * 1000;
    const sEndEpoch = sDateEpoch + sOutMins * 60 * 1000;

    const sBranchObj = (branches || []).find(
      (b) => isBranchMatch(s.branchId, b) || (s.branchName && isBranchMatch(s.branchName, b))
    );
    const sBranchName = sBranchObj?.name || s.branchName || s.branchId || 'فرع آخر';

    const isSameBranch = targetBranchObj && sBranchObj
      ? targetBranchObj.id === sBranchObj.id
      : (isBranchMatch(s.branchId, targetBranchObj || { id: branchId }) || String(s.branchId) === String(branchId));

    // ── 1. التحقق الحازم من عدم تكرار الوردية في نفس اليوم وفي نفس الفرع ──
    if (isSameBranch && sDate === targetDateStr) {
      const hasDirectOverlap = candStartEpoch < sEndEpoch && sStartEpoch < candEndEpoch;
      if (hasDirectOverlap || (sIn === tIn && sOut === tOut)) {
        return {
          hasConflict: true,
          conflictType: 'same_branch_duplicate',
          conflictingShift: s,
          message: `الموظف لديه بالفعل وردية مسجلة في هذا الفرع ("${effectiveBranchName}") في نفس اليوم (${targetDateStr}) من ${sIn} إلى ${sOut}. لتعديل مواعيدها يرجى استخدام زر التعديل المخصص ✏️.`
        };
      }
    }

    // ── 2. التحقق من منع التداخل الزمني التام بين الورديات في أي فرع ──
    const hasTimeOverlap = candStartEpoch < sEndEpoch && sStartEpoch < candEndEpoch;
    if (hasTimeOverlap) {
      return {
        hasConflict: true,
        conflictType: 'time_overlap',
        conflictingShift: s,
        message: `تعذر التسجيل: يوجد تداخل زمني بين موعد هذه الوردية (${tIn} إلى ${tOut}) في فرع "${effectiveBranchName}" ووردية مسجلة للموظف في فرع "${sBranchName}" من (${sIn} إلى ${sOut}). لا يمكن تواجد الموظف في فرعين في نفس التوقيت.`
      };
    }

    // ── 3. صمام الفارق الزمني الإلزامي بين الفروع المختلفة (لا يقل عن 10 دقائق) ──
    if (!isSameBranch) {
      const MIN_TRANSIT_BUFFER_MINUTES = 10;

      // أ. إذا كانت الوردية المراد تسجيلها تبدأ بعد انتهاء وردية الفرع الآخر
      if (candStartEpoch >= sEndEpoch) {
        const gapMins = Math.round((candStartEpoch - sEndEpoch) / 60000);
        if (gapMins < MIN_TRANSIT_BUFFER_MINUTES) {
          return {
            hasConflict: true,
            conflictType: 'transit_buffer_violation',
            conflictingShift: s,
            gapMinutes: gapMins,
            message: `تعذر التسجيل: الفارق الزمني بين انصراف الموظف من فرع "${sBranchName}" (${sOut}) وحضوره في فرع "${effectiveBranchName}" (${tIn}) هو (${gapMins} دقيقة)، وهو أقل من الحد الأدنى الإلزامي للتنقل بين الفروع (${MIN_TRANSIT_BUFFER_MINUTES} دقائق على الأقل).`
          };
        }
      }

      // ب. إذا كانت الوردية المراد تسجيلها تنتهي قبل بدء وردية الفرع الآخر
      if (candEndEpoch <= sStartEpoch) {
        const gapMins = Math.round((sStartEpoch - candEndEpoch) / 60000);
        if (gapMins < MIN_TRANSIT_BUFFER_MINUTES) {
          return {
            hasConflict: true,
            conflictType: 'transit_buffer_violation',
            conflictingShift: s,
            gapMinutes: gapMins,
            message: `تعذر التسجيل: الفارق الزمني بين انصراف الموظف من فرع "${effectiveBranchName}" (${tOut}) وحضوره بفرع "${sBranchName}" (${sIn}) هو (${gapMins} دقيقة)، وهو أقل من الحد الأدنى الإلزامي للتنقل بين الفروع (${MIN_TRANSIT_BUFFER_MINUTES} دقائق على الأقل).`
          };
        }
      }
    }
  }

  return { hasConflict: false };
}

/**
 * 🌟 المحرك المركزي الموحد لبناء السجل الزمني التراكمي الشامل للحضور والانصراف
 * يدمج بصمات الورديات الفعلية مع أيام الإجازات بجميع أنواعها وأيام الراحة الأسبوعية
 * لضمان ظهور الشهر كاملاً متصلاً في شاشات الإدارة وشاشات الموظف دون أي فراغات
 */
export function buildUnifiedAttendanceTimeline(employee, shifts = [], state = {}, options = {}) {
  if (!employee) return [];
  const {
    filterFn = null,
    monthPicker = null,
    selectedMonth = null,
    filterMode = 'month',
    customFrom = '',
    customTo = '',
    includeAbsences = false
  } = options;

  const targetMonth = selectedMonth || monthPicker || (getRealTodayStr ? getRealTodayStr().slice(0, 7) : new Date().toISOString().slice(0, 7));
  const orgSettings = state?.orgSettings || {};

  // 1. تحديد نطاق الدورة وتواريخها
  let startDate = '';
  let endDate = '';

  const isCustom = (filterMode === 'custom' || filterMode === 'range') && customFrom && customTo;
  if (isCustom) {
    startDate = customFrom <= customTo ? customFrom : customTo;
    endDate = customFrom <= customTo ? customTo : customFrom;
  } else {
    try {
      const rng = getCycleDateRange(targetMonth, orgSettings);
      if (rng?.startDate && rng?.endDate) {
        startDate = rng.startDate;
        endDate = rng.endDate;
      }
    } catch {
      const parts = targetMonth.split('-').map(Number);
      if (parts.length >= 2) {
        const lastDay = new Date(parts[0], parts[1], 0).getDate();
        startDate = `${targetMonth}-01`;
        endDate = `${targetMonth}-${String(lastDay).padStart(2, '0')}`;
      }
    }
  }

  const activePeriodFilter = (d) => {
    if (!d) return false;
    const dateStr = String(d).slice(0, 10);
    if (typeof filterFn === 'function') return filterFn(dateStr);
    if (startDate && endDate) return dateStr >= startDate && dateStr <= endDate;
    return true;
  };

  const datesList = [];
  if (startDate && endDate) {
    let curr = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (activePeriodFilter(dateStr)) {
        datesList.push(dateStr);
      }
      curr.setDate(curr.getDate() + 1);
    }
  }

  // 2. تجميع الورديات الفعلية المفلترة
  const shiftsByDate = new Map();
  (shifts || []).forEach(s => {
    if (!s || !s.date || !activePeriodFilter(s.date)) return;
    if (s.status === 'cancelled' || s.isCancelled) return;
    const d = s.date;
    if (!shiftsByDate.has(d)) shiftsByDate.set(d, []);
    shiftsByDate.get(d).push(s);
  });

  const timeline = [];
  const rawHireDate = employee.hireDate || employee.hiring_date || employee.contractStartDate;
  const hireDate = rawHireDate ? String(rawHireDate).slice(0, 10) : '';
  const resignationDate = employee.resignationDate || employee.terminationDate ? String(employee.resignationDate || employee.terminationDate).slice(0, 10) : '';

  // فحص كل تاريخ في الدورة
  datesList.forEach((dateStr) => {
    // حصانة ما قبل التعيين وما بعد انتهاء الخدمة
    if (hireDate && dateStr < hireDate) return;
    if (resignationDate && dateStr > resignationDate) return;

    const dayShifts = shiftsByDate.get(dateStr);
    const daySchedule = getEmployeeDaySchedule(employee.id, dateStr, state);
    const isScheduledOff = Boolean(daySchedule?.isOff === true || daySchedule?.type === 'off');
    const approvedLeave = getEmployeeCurrentApprovedLeave(employee, dateStr, state);

    if (dayShifts && dayShifts.length > 0) {
      // يوجد وردية أو أكثر في هذا اليوم
      dayShifts.forEach(s => {
        timeline.push({
          ...s,
          recordType: 'shift',
          isScheduledOffDay: isScheduledOff,
          isWorkOnOffDay: isScheduledOff,
          isOnApprovedLeave: Boolean(approvedLeave),
          approvedLeaveObj: approvedLeave,
          daySchedule
        });
      });
    } else {
      // لا توجد بصمات في هذا اليوم
      if (approvedLeave) {
        // إجازة معتمدة
        const lType = approvedLeave.leaveType || 'annual';
        let typeName = 'إجازة سنوية';
        let badgeColor = '#0284c7';
        let badgeBg = '#e0f2fe';
        let badgeBorder = '#bae6fd';
        let icon = '🏖️';

        if (lType === 'sick' || approvedLeave.type === 'sick_leave') {
          typeName = 'إجازة مرضية';
          icon = '🩺';
          badgeColor = '#7c3aed';
          badgeBg = '#f5f3ff';
          badgeBorder = '#ddd6fe';
        } else if (lType === 'casual' || approvedLeave.type === 'casual_leave') {
          typeName = 'إجازة عارضة';
          icon = '📋';
          badgeColor = '#b45309';
          badgeBg = '#fef3c7';
          badgeBorder = '#fde68a';
        } else if (lType === 'mission' || approvedLeave.type === 'mission') {
          typeName = 'مأمورية عمل';
          icon = '🚗';
          badgeColor = '#0369a1';
          badgeBg = '#f0f9ff';
          badgeBorder = '#bae6fd';
        } else if (lType === 'unpaid' || approvedLeave.type === 'unpaid_leave') {
          typeName = 'إجازة بدون راتب';
          icon = '⏸️';
          badgeColor = '#475569';
          badgeBg = '#f1f5f9';
          badgeBorder = '#cbd5e1';
        } else if (lType === 'holiday' || approvedLeave.type === 'official_holiday') {
          typeName = 'إجازة رسمية / أعياد';
          icon = '🎈';
          badgeColor = '#059669';
          badgeBg = '#ecfdf5';
          badgeBorder = '#a7f3d0';
        }

        const isUnpaid = lType === 'unpaid' || approvedLeave.type === 'unpaid_leave';
        const paidHrs = isUnpaid ? 0 : parseFloat(employee.workHoursPerDay || employee.workHours || 8);

        timeline.push({
          id: `leave_${employee.id}_${dateStr}_${approvedLeave.id || 'leave'}`,
          date: dateStr,
          recordType: 'leave',
          isApprovedLeaveDay: true,
          leaveType: lType,
          leaveTypeName: typeName,
          leaveBadge: { color: badgeColor, bg: badgeBg, border: badgeBorder, icon },
          leaveObj: approvedLeave,
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: approvedLeave.branchId || employee.branchId || '',
          branchName: approvedLeave.branchName || employee.branchName || '',
          timeIn: '—',
          timeOut: '—',
          hours: paidHrs,
          regularHours: paidHrs,
          payableHours: paidHrs,
          netHours: paidHrs,
          breakHours: 0,
          overtimeHours: 0,
          status: 'approved_leave',
          statusLabel: `${icon} ${typeName} معتمدة`,
          note: approvedLeave.reason || approvedLeave.notes || `${typeName} معتمدة رسمياً`,
          notes: approvedLeave.reason || approvedLeave.notes || `${typeName} معتمدة رسمياً`,
          source: 'leave_system'
        });
      } else if (isScheduledOff) {
        // راحة أسبوعية مجدولة
        const bId = daySchedule?.branchId || employee.branchId || '';
        const bObj = (state?.branches || []).find(b => String(b.id) === String(bId));
        const bName = bObj ? bObj.name : (daySchedule?.branchName || employee.branchName || '');

        timeline.push({
          id: `off_${employee.id}_${dateStr}`,
          date: dateStr,
          recordType: 'off_day',
          isScheduledOffDay: true,
          isOtherBranchShift: Boolean(daySchedule?.isOtherBranchShift),
          otherBranchName: daySchedule?.otherBranchName || '',
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: bId,
          branchName: bName,
          timeIn: '—',
          timeOut: '—',
          hours: 0,
          regularHours: 0,
          payableHours: 0,
          netHours: 0,
          breakHours: 0,
          overtimeHours: 0,
          status: 'scheduled_off',
          statusLabel: daySchedule?.isOtherBranchShift
            ? `🏢 مجدول بفرع ${daySchedule.otherBranchName}`
            : '☕ راحة أسبوعية (Off)',
          note: daySchedule?.label || daySchedule?.note || (daySchedule?.isOtherBranchShift ? `مجدول بفرع ${daySchedule.otherBranchName}` : 'راحة أسبوعية حسب جدول الروستر'),
          notes: daySchedule?.label || daySchedule?.note || (daySchedule?.isOtherBranchShift ? `مجدول بفرع ${daySchedule.otherBranchName}` : 'راحة أسبوعية حسب جدول الروستر'),
          source: 'roster_schedule',
          daySchedule
        });
      } else if (includeAbsences) {
        // غياب غير مسجل
        timeline.push({
          id: `abs_${employee.id}_${dateStr}`,
          date: dateStr,
          recordType: 'absence',
          isAbsenceDay: true,
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: employee.branchId || '',
          branchName: employee.branchName || '',
          timeIn: '—',
          timeOut: '—',
          hours: 0,
          payableHours: 0,
          status: 'absence',
          statusLabel: '🚫 غياب غير مسجل',
          notes: 'غياب بدون إذن عن وردية العمل المقررة',
          source: 'absence_calculator',
          daySchedule
        });
      }
    }
  });

  // ترتيب السجلات من الأحدث إلى الأقدم تنازلياً
  return timeline.sort((a, b) => {
    const dA = String(a.date || '');
    const dB = String(b.date || '');
    if (dA !== dB) return dB.localeCompare(dA);
    if (a.isLiveActive && !b.isLiveActive) return -1;
    if (!a.isLiveActive && b.isLiveActive) return 1;
    return 0;
  });
}


