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
    emp?.noMonthlySchedule === 1 ||
    emp?.isVariableHours === true ||
    emp?.variableHours === true ||
    emp?.hasNoRoster === true ||
    emp?.scheduleType === 'flexible' ||
    emp?.scheduleType === 'variable'
  );
  const profileHours = parseFloat(emp?.workHoursPerDay || emp?.workHours || (emp?.branchesDetails && emp.branchesDetails[0]?.workHoursPerDay) || 8);
  
  // فحص ما إذا كان للموظف جدول شهري معتمد رسمي لهذا اليوم
  const hasApprovedRoster = !isFlexibleSchedule && hasEmployeeApprovedRoster(shift.employeeId || emp?.id, shift.date, state);
  const daySchedule = hasApprovedRoster ? getEmployeeDaySchedule(shift.employeeId || emp?.id, shift.date, state) : null;
  const hasScheduledShiftWindow = Boolean(daySchedule && daySchedule.start && daySchedule.end && daySchedule.type !== 'off');

  const schedStartStr = (hasApprovedRoster && (shift.scheduledStart || daySchedule?.start)) || '';
  const schedEndStr = (hasApprovedRoster && (shift.scheduledEnd || daySchedule?.end)) || '';

  let scheduledHours = profileHours;
  if (hasApprovedRoster && hasScheduledShiftWindow && schedStartStr && schedEndStr) {
    const [sH, sM] = schedStartStr.split(':').map(Number);
    let [eH, eM] = schedEndStr.split(':').map(Number);
    if (!isNaN(sH) && !isNaN(eH)) {
      let sMins = sH * 60 + (sM || 0);
      let eMins = eH * 60 + (eM || 0);
      if (eMins <= sMins) eMins += 24 * 60;
      scheduledHours = Math.round(((eMins - sMins) / 60) * 100) / 100;
    }
  } else if (!isFlexibleSchedule && shift.scheduledHours) {
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
    // يتم احتساب الساعات الإضافية حصراً خارج مواعيد الوردية المجدولة (قبل البداية وبعد النهاية)
    if (hasApprovedRoster && hasScheduledShiftWindow && schedStartStr && schedEndStr && timeIn && hasRealTimeOut) {
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
      return {
        hasConflict: true,
        conflictType: 'same_branch_duplicate',
        conflictingShift: s,
        message: `الموظف لديه بالفعل وردية مسجلة في هذا الفرع ("${effectiveBranchName}") في نفس اليوم (${targetDateStr}) من ${sIn} إلى ${sOut}. لتعديل مواعيدها يرجى استخدام زر التعديل المخصص ✏️.`
      };
    }

    // ── 2. التحقق من منع التداخل الزمني التام بين الورديات ──
    const hasTimeOverlap = candStartEpoch < sEndEpoch && sStartEpoch < candEndEpoch;
    if (hasTimeOverlap) {
      return {
        hasConflict: true,
        conflictType: 'time_overlap',
        conflictingShift: s,
        message: `تعذر التسجيل: يوجد تداخل زمني بين موعد هذه الوردية (${tIn} إلى ${tOut}) ووردية مسجلة للموظف في فرع "${sBranchName}" من (${sIn} إلى ${sOut}). لا يمكن حضور الموظف في نفس التوقيت.`
      };
    }
  }

  return { hasConflict: false };
}

