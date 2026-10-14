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
  try {
    const perm = findApprovedPermission(shift.employeeId, shift.date, state);
    if (perm) {
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
  const scheduledHours = isFlexibleSchedule ? profileHours : parseFloat(shift.scheduledHours || profileHours);

  // 5. الساعات الأساسية والإضافية
  let regularHours = 0;
  let overtimeHours = 0;

  if (actualWorkedHours === 0) {
    regularHours = 0;
    overtimeHours = 0;
  } else {
    // التحقق مما إذا كان هناك إضافي مسجل صراحة أو معتمد على الوردية
    const rawOtHours = parseFloat(shift.overtimeHours) || 0;
    const hasExplicitOt = rawOtHours > 0 || shift.overtimeStatus === 'approved' || Boolean(shift.adminApproved);

    if (isFlexibleSchedule) {
      // للموظف المرن: يقارن العمل الفعلي مع ساعات ملفه الشخصي (profileHours)
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
    } else {
      regularHours = Math.round(Math.min(actualWorkedHours, scheduledHours) * 100) / 100;
      if (shift.regularHours !== undefined && parseFloat(shift.regularHours) > 0) {
        regularHours = Math.round(Math.min(actualWorkedHours, parseFloat(shift.regularHours)) * 100) / 100;
      }
      const maxPossibleOt = Math.max(0, Math.round((actualWorkedHours - regularHours) * 100) / 100);
      overtimeHours = maxPossibleOt;
      if (rawOtHours > 0) {
        overtimeHours = Math.max(rawOtHours, maxPossibleOt);
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

    const isShiftApproved = shift.overtimeStatus === 'approved' || shift.isOvertimeApproved === true;
    const isReqApproved = Boolean(linkedOtReq && (linkedOtReq.status === 'approved' || linkedOtReq.adminApproved === true));

    const isShiftRejected = shift.overtimeStatus === 'rejected' || shift.rejectedOvertime === true;
    const isReqRejected = Boolean(linkedOtReq && (linkedOtReq.status === 'rejected' || linkedOtReq.adminRejected === true));

    if (isShiftApproved || isReqApproved) {
      overtimeStatus = 'approved';
    } else if (isShiftRejected || isReqRejected) {
      overtimeStatus = 'rejected';
    } else if (shift.overtimeStatus === 'pending' || (linkedOtReq && (linkedOtReq.status === 'pending' || linkedOtReq.status === 'pending_admin'))) {
      overtimeStatus = 'pending';
    } else {
      overtimeStatus = 'pending';
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
