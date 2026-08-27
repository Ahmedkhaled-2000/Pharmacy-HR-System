import { getRealTodayStr } from '../../utils/timeEngine';
import React, { useState, useEffect, useRef } from 'react';
import { fmt, arabicWeekday, AR_MONTHS, getEmployeeApprovedLeaves } from '../../utils/formatters';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { computeLatenessFinancialAmount, isApprovedPermissionForDate, getEffectiveShiftHours } from '../../utils/latePenaltyEngine';
import { triggerDirectPrint, generateOfficialPayslipHTML } from '../../utils/printHelper';
import { getCycleDateRange } from '../../utils/periodEngine';

export default function PayslipPrintModal({
  isOpen,
  onClose,
  emp,
  month,
  shifts = [],
  adjustments = [],
  branches = [],
  orgSettings = {},
  computeEmpSummary,
  selectedBranchId = null,
  state
}) {
  if (!isOpen || !emp) return null;

  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const gmName = orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
  const logoUrl = orgSettings.logoUrl || '';

  // Month label
  const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-');
  const monthName = AR_MONTHS[parseInt(m, 10) - 1] || m;
  const fullMonthLabel = `${monthName} ${y}`;

  // Branches list for multi-branch employee
  const isMultiBranch = (emp.branchesDetails && emp.branchesDetails.length > 1);
  const [activeBranchFilter, setActiveBranchFilter] = useState(selectedBranchId || 'all');
  const currentBranchId = activeBranchFilter === 'all' ? null : activeBranchFilter;

  const assignedBranches = (emp.branchesDetails && emp.branchesDetails.length > 0)
    ? emp.branchesDetails
    : [{ branchId: emp.branchId || 'default', salary: emp.salary, workHoursPerDay: emp.workHoursPerDay || 8, workDaysPerMonth: emp.workDaysPerMonth || 26 }];

  const targetBranchDetails = currentBranchId
    ? emp.branchesDetails?.find((b) => String(b.branchId) === String(currentBranchId))
    : (emp.branchesDetails?.[0] || null);

  const baseSalary = targetBranchDetails ? (parseFloat(targetBranchDetails.salary) || 0) : (parseFloat(emp.salary) || 0);
  const workHoursPerDay = targetBranchDetails ? (parseFloat(targetBranchDetails.workHoursPerDay) || 8) : (parseFloat(emp.workHoursPerDay) || 8);
  const workDaysPerMonth = targetBranchDetails ? (parseFloat(targetBranchDetails.workDaysPerMonth) || 26) : (parseFloat(emp.workDaysPerMonth) || 26);

  // Calculate cutoff range for this month via Period Engine
  const cycleRange = getCycleDateRange(month || new Date().toISOString().slice(0, 7), orgSettings || state?.orgSettings);
  const startCutoff = cycleRange.startDate;
  const endCutoff = cycleRange.endDate;

  // Filter shifts and adjustments for this cutoff period
  const empShifts = shifts.filter((s) =>
    String(s.employeeId) === String(emp.id) &&
    s.date >= startCutoff &&
    s.date <= endCutoff &&
    (!currentBranchId || String(s.branchId) === String(currentBranchId))
  );

  const empAdjs = adjustments.filter((a) =>
    (String(a.employeeId) === String(emp.id) || a.employeeId === 'all') &&
    a.date >= startCutoff &&
    a.date <= endCutoff
  );

  // Use computeEmpSummary for accurate calculations including branch selection
  const summary = computeEmpSummary
    ? computeEmpSummary(emp.id, null, month, currentBranchId)
    : { hours: 0, dailyRate: 0, rate: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, perBranch: {} };

  const totalHours = summary.hours || 0;
  const totalBreakHours = Math.round(empShifts.reduce((acc, s) => acc + (parseFloat(s.breakHours) || 0), 0) * 100) / 100;

  const hourlyRate = summary.rate || (parseFloat(baseSalary) || 0);
  const dailyRate = summary.dailyRate || (hourlyRate * workHoursPerDay);
  const baseEarnings = summary.baseEarnings || 0;

  const totalBonus = summary.totalBonus || 0;
  const totalDeduction = summary.totalDeduction || 0;
  const netSalary = summary.netSalary || 0;

  const mgmtAllowance = summary.managementAllowance !== undefined ? summary.managementAllowance : (parseFloat(emp.managementAllowance) || 0);
  const transAllowance = summary.transportAllowance !== undefined ? summary.transportAllowance : (parseFloat(emp.transportAllowance) || 0);
  const extAllowance = summary.extraAllowance !== undefined ? summary.extraAllowance : (parseFloat(emp.extraAllowance) || 0);
  const extTitle = summary.extraAllowanceTitle || emp.extraAllowanceTitle || 'أجر إضافي';
  const totalAllowances = summary.totalAllowances !== undefined ? summary.totalAllowances : (mgmtAllowance + transAllowance + extAllowance);

  // Page Scale Fit Mode: 'single_page' (Compact Single A4) vs 'full' (Normal Extended)
  const [printFitMode, setPrintFitMode] = useState('single_page');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen, activeBranchFilter, printFitMode]);

  const getBranchName = (bId) => {
    if (!bId || bId === 'undefined' || bId === 'null') return emp?.branchName || 'الفرع الرئيسي';
    const b = (branches || orgSettings.branches || state?.branches || []).find((br) => String(br.id) === String(bId));
    return b ? b.name : (String(bId) === String(emp.branchId) ? (emp.branchName || 'الفرع الرئيسي') : `فرع ${bId}`);
  };

  const branchNames = currentBranchId
    ? getBranchName(currentBranchId)
    : (isMultiBranch
      ? emp.branchesDetails.map(bd => getBranchName(bd.branchId)).join(' + ')
      : (emp.branchName || 'المركز الرئيسي'));

  const showPerBranchBreakdown = isMultiBranch && !currentBranchId;

  // Prepared mapped shifts for print helper
  const mappedShiftsForPrint = empShifts.map((s) => {
    const effHours = getEffectiveShiftHours(s, state);
    const hasPerm = isApprovedPermissionForDate(emp.id, s.date, state);
    return {
      ...s,
      dayName: arabicWeekday(s.date),
      hours: effHours,
      regularHours: effHours,
      hasPermission: hasPerm
    };
  });

  // 1. Allowances breakdown
  const allowanceItems = [];
  if (mgmtAllowance > 0) {
    allowanceItems.push({
      id: 'allowance_mgmt',
      date: `${month} (شهري)`,
      typeLabel: '👔 بدل إدارة شهري',
      amount: mgmtAllowance,
      isPositive: true,
      details: `بدل إدارة معتمد لشغل وظيفة (${emp.jobTitle || 'موظف'})`,
      color: '#15803d'
    });
  }
  if (transAllowance > 0) {
    allowanceItems.push({
      id: 'allowance_trans',
      date: `${month} (شهري)`,
      typeLabel: '🚗 بدل مواصلات شهري',
      amount: transAllowance,
      isPositive: true,
      details: 'بدل انتقال ومواصلات شهري ثابت',
      color: '#15803d'
    });
  }
  const extraAllowancesList = summary.extraAllowances || emp.extraAllowances || [];
  if (Array.isArray(extraAllowancesList) && extraAllowancesList.length > 0) {
    extraAllowancesList.forEach((ea, idx) => {
      if ((parseFloat(ea.amount) || 0) > 0) {
        allowanceItems.push({
          id: `allowance_extra_${ea.id || idx}`,
          date: `${month} (شهري)`,
          typeLabel: `🏷️ ${ea.title || 'أجر إضافي'}`,
          amount: parseFloat(ea.amount) || 0,
          isPositive: true,
          details: 'أجر وبدل إضافي مخصص من قبل الإدارة',
          color: '#15803d'
        });
      }
    });
  } else if (extAllowance > 0) {
    allowanceItems.push({
      id: 'allowance_extra',
      date: `${month} (شهري)`,
      typeLabel: `🏷️ ${extTitle}`,
      amount: extAllowance,
      isPositive: true,
      details: 'أجر وبدل إضافي مخصص من قبل الإدارة',
      color: '#15803d'
    });
  }

  // 2. Adjustments (Bonuses and Penalties)
  const manualItems = (empAdjs || [])
    .filter((a) => !String(a.id).startsWith('adj_loan_') && !String(a.description || a.notes || a.reason || '').includes('خصم سلفة'))
    .map((a) => ({
      id: a.id,
      date: a.date || month,
      typeLabel: a.type === 'bonus' ? '➕ مكافأة / حافز تميز' : '➖ خصم / جزاء إداري',
      amount: parseFloat(a.amount) || 0,
      isPositive: a.type === 'bonus',
      details: a.reason || a.details || a.description || '—',
      color: a.type === 'bonus' ? '#16a34a' : '#dc2626'
    }));

  // 3. Late Incidents (التأخيرات)
  const empLateIncidents = (state?.lateIncidents || []).filter(
    (inc) =>
      String(inc.employeeId) === String(emp.id) &&
      inc.status !== 'cancelled' &&
      !inc.isCancelled &&
      inc.objection?.status !== 'approved' &&
      inc.status !== 'approved_permission_exempt' &&
      inc.actionType !== 'grace' &&
      !(state?.requests || []).some(
        (r) =>
          (r.type === 'penalty_objection' || r.type === 'objection') &&
          (r.status === 'approved' || r.adminApproved) &&
          (r.penaltyId === inc.id || r.id === `obj_inc_${inc.id}` || (String(r.employeeId) === String(emp.id) && r.date === inc.date))
      ) &&
      (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
      (!currentBranchId || String(inc.branchId) === String(currentBranchId)) &&
      (inc.date >= startCutoff && inc.date <= endCutoff)
  );

  const latePenaltyItems = empLateIncidents.map((inc) => {
    const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId || currentBranchId);
    const penaltyVal = dayAmt > 0 ? dayAmt : (parseFloat(inc.penaltyAmount) || 0);
    return {
      id: inc.id,
      date: inc.date,
      scheduledStartTime: inc.scheduledStartTime || '—',
      actualPunchInTime: inc.actualPunchInTime || '—',
      lateMinutes: inc.lateMinutes || 0,
      tierName: inc.tierName || 'فئة عامة',
      occurrenceNumber: inc.occurrenceNumber || 1,
      actionLabel: inc.actionLabel || 'خصم لائحي',
      deductionMinutes: inc.deductionMinutes || 0,
      amount: penaltyVal
    };
  });

  // 4. Loans & Credit Medicine (السلف ومشتريات الأدوية)
  const cyclePredicate = (d) => d && d >= cycleRange.startDate && d <= cycleRange.endDate;

  const loanBreakdownMap = new Map();
  (state?.requests || [])
    .filter(
      (r) =>
        String(r.employeeId) === String(emp.id) &&
        (r.status === 'approved' || r.adminApproved || r.status === 'partial') &&
        (r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine')
    )
    .forEach((r) => loanBreakdownMap.set(String(r.id), r));

  (state?.loans || [])
    .filter(
      (l) =>
        String(l.employeeId) === String(emp.id) &&
        l.status !== 'pending' &&
        l.status !== 'pending_admin' &&
        l.status !== 'rejected' &&
        l.status !== 'cancelled' &&
        (l.type === 'loan' || l.type === 'advance' || l.type === 'meds' || l.type === 'credit_medicine')
    )
    .forEach((l) => {
      const existing = loanBreakdownMap.get(String(l.id));
      loanBreakdownMap.set(String(l.id), { ...(existing || {}), ...l });
    });

  const empLoans = Array.from(loanBreakdownMap.values()).map((l) => {
    const total = parseFloat(l.amount || l.totalAmount) || 0;
    const paid = parseFloat(l.paidAmount) || 0;
    const rem = Math.max(0, total - paid);
    if (rem <= 0) return null;

    const isInstallment = l.loanType === 'installment' || parseInt(l.installmentsCount || l.monthsCount, 10) > 1 || (parseFloat(l.monthlyDeduction || l.installmentAmount) > 0 && parseFloat(l.monthlyDeduction || l.installmentAmount) < total);
    const monthlyDeduction = parseFloat(l.monthlyDeduction || l.installmentAmount) || (isInstallment ? Math.ceil(total / (parseInt(l.installmentsCount || l.monthsCount, 10) || 1)) : rem);
    const itemDate = l.date || (l.createdAt ? l.createdAt.slice(0, 10) : '');

    if (!isInstallment && !cyclePredicate(itemDate) && rem <= 0) {
      return null;
    }

    const deductedThisMonth = Math.min(rem, isInstallment ? monthlyDeduction : rem);
    if (deductedThisMonth <= 0) return null;

    return {
      id: l.id,
      date: itemDate || cycleRange.startDate,
      typeLabel: (l.type === 'meds' || l.type === 'credit_medicine')
        ? '💊 مشتريات أدوية بالآجل'
        : isInstallment
        ? `💳 قسط سلفة مقسطة (${l.currentInstallmentNumber || 1}/${l.installmentsCount || l.monthsCount || 1})`
        : '💳 سلفة نقدية شهرية',
      totalAmount: total,
      paidAmount: paid,
      deductedThisMonth,
      remainingBalance: Math.max(0, rem - deductedThisMonth),
      notes: l.reason || l.details || l.notes || '—'
    };
  }).filter(Boolean);

  // 5. Absence deductions (الغياب)
  const absenceDaysCount = summary.absenceDaysCount || 0;
  const absenceDeductionTotal = summary.absenceDeduction || 0;
  const absenceItem = absenceDaysCount > 0 ? [{
    id: 'absence_summary',
    date: `${month} (غيابات الشهر)`,
    typeLabel: '🚫 غياب بدون إذن رسمي',
    amount: absenceDeductionTotal,
    isPositive: false,
    details: `خصم عدد (${absenceDaysCount}) يوم غياب بدون إذن عن الورديات بسعر اليوم (${fmt(dailyRate)} ج.م)`,
    color: '#b91c1c'
  }] : [];

  // 6. Leaves and Rest Days (سجل أيام الإجازات والراحات المأخوذة بالشهر) - تجريد دقيق يمنع التكرار
  const empApprovedLeaves = getEmployeeApprovedLeaves(emp, state, (d) => {
    if (startCutoff && endCutoff) {
      return d >= startCutoff && d <= endCutoff;
    }
    return d.startsWith(month);
  });

  // Generate date list for cycle
  const cycleDates = [];
  if (startCutoff && endCutoff) {
    let cur = new Date(startCutoff);
    const endD = new Date(endCutoff);
    if (!isNaN(cur) && !isNaN(endD) && cur <= endD) {
      while (cur <= endD) {
        const cy = cur.getFullYear();
        const cm = cur.getMonth() + 1;
        const cd = cur.getDate();
        cycleDates.push(`${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`);
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  const empIdStr = String(emp?.id || '');
  const empCodeStr = String(emp?.code || '');
  const empRoster = (state?.rosters || []).find(
    r => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) &&
         (r.month === month || !r.month) && r.status === 'approved'
  ) || (state?.rosters || []).find(
    r => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) &&
         (r.month === month || !r.month)
  ) || (state?.requests || []).find(
    r => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) &&
         (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
         (r.month === month || !r.month) && (r.status === 'approved' || r.adminApproved)
  );

  // 1. Rest days (الراحات الأسبوعية والمجدولة المأخوذة بما فيها التبديلات المعتمدة)
  const restDayItems = [];
  const shiftDatesSet = new Set((empShifts || []).map(s => s.date));
  const leaveDatesSet = new Set();

  empApprovedLeaves.forEach(l => {
    const lStart = l.startDate || l.date;
    const lEnd = l.endDate || l.date || lStart;
    if (lStart && lEnd) {
      let cur = new Date(lStart);
      const endD = new Date(lEnd);
      while (cur <= endD) {
        const cy = cur.getFullYear();
        const cm = cur.getMonth() + 1;
        const cd = cur.getDate();
        leaveDatesSet.add(`${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`);
        cur.setDate(cur.getDate() + 1);
      }
    }
  });

  cycleDates.forEach(dateStr => {
    if (shiftDatesSet.has(dateStr) || leaveDatesSet.has(dateStr)) return;
    const daySched = getEmployeeDaySchedule(emp.id, dateStr, state);
    if (daySched && (daySched.type === 'off' || daySched.isOff)) {
      const isSwapRest = !!daySched.isSwapped;
      restDayItems.push({
        id: `rest_${dateStr}`,
        date: dateStr,
        dateRangeLabel: `${arabicWeekday(dateStr)} ${dateStr}`,
        dayName: arabicWeekday(dateStr),
        category: 'rest',
        categoryBadge: isSwapRest ? (
          <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '9px' }}>🔄 راحة متبدلة مع {daySched.swappedWithName || 'الزميل'}</span>
        ) : (
          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '9px' }}>🛋️ راحة أسبوعية</span>
        ),
        typeLabel: isSwapRest ? `راحة متبدلة مع ${daySched.swappedWithName || 'الزميل'}` : 'راحة أسبوعية / مجدولة',
        daysCount: 1,
        effectLabel: isSwapRest ? '🟢 راحة متبدلة معتمدة' : '🟢 راحة مجدولة معتمدة',
        effectColor: isSwapRest ? '#d97706' : '#0284c7',
        financialStatus: 'مدفوعة (ضمن الراتب)',
        reason: daySched.swapNote || 'يوم راحة أسبوعية مجدولة بالجدول الشهري'
      });
    }
  });

  // 2. Approved leave days (سنوي / اعتيادي / بدون أجر / مرضي)
  const leaveDayItems = [];
  empApprovedLeaves.forEach(l => {
    const isUnpaid = l.leaveType === 'unpaid' || l.type === 'unpaid_leave' || l.isUnpaid === true;
    const isSick = l.leaveType === 'sick' || l.type === 'sick_leave';
    const isAnnual = !isUnpaid && !isSick;
    const days = parseFloat(l.daysCount || l.days || 1) || 1;
    const deductionAmt = isUnpaid ? Math.round(days * dailyRate * 100) / 100 : 0;

    let category = 'annual';
    let categoryBadge = <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '9px' }}>🌴 إجازة سنوية</span>;
    let typeLabel = 'إجازة سنوية / اعتيادية';
    let effectLabel = '🟢 مدفوعة الأجر (لا خصم)';
    let effectColor = '#15803d';
    let financialStatus = 'مدفوعة الأجر بالكامل';

    if (isUnpaid) {
      category = 'unpaid';
      categoryBadge = <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '9px' }}>💸 إجازة بدون أجر</span>;
      typeLabel = 'إجازة بدون أجر';
      effectLabel = `🔴 مخصوم (-${fmt(deductionAmt)} ج.م)`;
      effectColor = '#dc2626';
      financialStatus = `مخصومة (-${fmt(deductionAmt)} ج.م)`;
    } else if (isSick) {
      category = 'sick';
      categoryBadge = <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '9px' }}>🤒 إجازة مرضية</span>;
      typeLabel = 'إجازة مرضية معتمدة';
      effectLabel = '🟢 مدفوعة الأجر معتمدة';
      effectColor = '#b45309';
      financialStatus = 'مدفوعة الأجر';
    }

    const startDateStr = l.startDate || l.date || '—';
    const endDateStr = l.endDate || l.date || startDateStr;
    const dateRangeLabel = startDateStr === endDateStr ? `${arabicWeekday(startDateStr)} ${startDateStr}` : `من ${startDateStr} إلى ${endDateStr}`;

    leaveDayItems.push({
      id: l.id,
      date: startDateStr,
      dateRangeLabel,
      dayName: arabicWeekday(startDateStr),
      category,
      categoryBadge,
      typeLabel,
      daysCount: days,
      deductionAmt,
      isUnpaid,
      effectLabel,
      effectColor,
      financialStatus,
      reason: l.reason || l.details || l.notes || (isAnnual ? 'إجازة سنوية اعتيادية معتمدة' : (isUnpaid ? 'إجازة بدون أجر معتمدة' : 'إجازة مرضية معتمدة'))
    });
  });

  const allTakenDays = [...restDayItems, ...leaveDayItems].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const totalRestDaysCount = restDayItems.length;
  const totalAnnualLeaveDays = leaveDayItems.filter(l => l.category === 'annual').reduce((acc, l) => acc + l.daysCount, 0);
  const totalUnpaidLeaveDays = leaveDayItems.filter(l => l.category === 'unpaid').reduce((acc, l) => acc + l.daysCount, 0);
  const totalSickLeaveDays = leaveDayItems.filter(l => l.category === 'sick').reduce((acc, l) => acc + l.daysCount, 0);

  // 3. Absence days (أيام الغياب غير المبرر عن الورديات المجدولة - للأيام المنقضية فقط)
  const absenceDayItems = [];
  const today = getRealTodayStr();
  cycleDates.forEach(dateStr => {
    if (dateStr >= today) return; // لا تحتسب الأيام الحالية أو المستقبلية كغياب
    if (shiftDatesSet.has(dateStr) || leaveDatesSet.has(dateStr)) return;
    const daySched = getEmployeeDaySchedule(emp.id, dateStr, state);
    if (daySched && daySched.type !== 'off' && !daySched.isOff) {
      const shiftBranch = daySched.branchId ? (state?.branches || []).find(b => String(b.id) === String(daySched.branchId))?.name : '';
      const shiftTime = (daySched.start && daySched.end) ? `${daySched.start} - ${daySched.end}` : 'وردية كاملة';
      absenceDayItems.push({
        id: `abs_${dateStr}`,
        date: dateStr,
        dateRangeLabel: `${arabicWeekday(dateStr)} ${dateStr}`,
        dayName: arabicWeekday(dateStr),
        scheduledShift: `${shiftTime}${daySched.isSwapped ? ` (بديل عن ${daySched.swappedWithName || 'الزميل'})` : ''}${shiftBranch ? ` (${shiftBranch})` : ''}`,
        deductionAmt: dailyRate,
        effectLabel: `🔴 مخصوم (-${fmt(dailyRate)} ج.م)`,
        effectColor: '#dc2626',
        reason: daySched.isSwapped ? `غياب عن وردية متبدلة معتمدة لتغطية ${daySched.swappedWithName || 'الزميل'}` : 'غياب بدون إذن رسمي / لم يتم تسجيل بصمة حضور أو تقديم طلب إجازة'
      });
    }
  });

  const totalAbsenceDaysCount = summary.absenceDaysCount !== undefined ? summary.absenceDaysCount : absenceDayItems.length;
  const totalAbsenceDeductionAmt = summary.absenceDeduction !== undefined ? summary.absenceDeduction : Math.round(totalAbsenceDaysCount * dailyRate * 100) / 100;

  if (absenceDayItems.length === 0 && totalAbsenceDaysCount > 0) {
    for (let i = 0; i < totalAbsenceDaysCount; i++) {
      absenceDayItems.push({
        id: `abs_sum_${i + 1}`,
        date: `${month}`,
        dateRangeLabel: `يوم غياب مسجل بالشهر (#${i + 1})`,
        dayName: 'غياب',
        scheduledShift: 'وردية عمل مجدولة',
        deductionAmt: dailyRate,
        effectLabel: `🔴 مخصوم (-${fmt(dailyRate)} ج.م)`,
        effectColor: '#dc2626',
        reason: 'غياب بدون إذن رسمي مسجل في نظام المرتبات'
      });
    }
  }

  const unpaidLeavesCount = summary.unpaidLeaveDaysCount || totalUnpaidLeaveDays;
  const unpaidLeaveDeductionTotal = summary.unpaidLeaveDeduction !== undefined ? summary.unpaidLeaveDeduction : Math.round(unpaidLeavesCount * dailyRate * 100) / 100;

  const unpaidLeaveItem = (unpaidLeavesCount > 0 || unpaidLeaveDeductionTotal > 0) ? [{
    id: 'unpaid_leave_summary',
    date: `${month} (إجازة غير مدفوعة)`,
    typeLabel: '💸 إجازة غير مدفوعة الأجر',
    amount: unpaidLeaveDeductionTotal,
    isPositive: false,
    details: `خصم عدد (${unpaidLeavesCount}) يوم إجازة غير مدفوعة الأجر بسعر اليوم (${fmt(dailyRate)} ج.م)`,
    color: '#dc2626'
  }] : [];

  const generalFinancialItems = [...allowanceItems, ...manualItems, ...absenceItem, ...unpaidLeaveItem];

  const handlePrint = () => {
    try {
      const html = generateOfficialPayslipHTML({
        emp,
        month,
        shifts: mappedShiftsForPrint,
        adjustments: empAdjs,
        branches,
        orgSettings,
        summary,
        startCutoff,
        endCutoff,
        fullMonthLabel,
        selectedBranchId: currentBranchId,
        state,
        printFitMode
      });
      triggerDirectPrint(html, `كشف مرتب - ${emp.name} - ${fullMonthLabel}`);
    } catch (err) {
      console.error('Error generating official payslip print:', err);
      window.print();
    }
  };

  return (
    <div className="modal-backdrop payslip-print-backdrop" style={{ zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="modal-content payslip-modal-container"
        style={{
          maxWidth: '880px',
          width: '95%',
          background: '#ffffff',
          padding: '0',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border)'
        }}
      >
        {/* ── Modal Action Bar (Fixed, Crisp & Clean) ── */}
        <div
          className="no-print"
          style={{
            background: 'var(--surface-muted, #f8fafc)',
            padding: '12px 20px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: '16px 16px 0 0',
            flexShrink: 0,
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '20px' }}>📄</span>
            <div>
              <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--text, #0f172a)', fontSize: '15px', fontWeight: 800 }}>
                كشف المرتب والبصمات الرسمي (A4)
              </h4>
              <span style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>
                شهر {fullMonthLabel} · {emp.name} {isMultiBranch && <strong style={{ color: '#0f766e' }}>· (موظف متعدد الفروع)</strong>}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Multi-Branch Selector if employee works in multiple branches */}
            {isMultiBranch && (
              <select
                value={activeBranchFilter}
                onChange={(e) => setActiveBranchFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1.5px solid #0f766e',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  background: '#fff',
                  color: '#0f766e',
                  fontFamily: 'Cairo, sans-serif'
                }}
              >
                <option value="all">🏛️ كافة الفروع مجمعة ومفصلة</option>
                {assignedBranches.map(bd => (
                  <option key={bd.branchId} value={bd.branchId}>
                    📍 {getBranchName(bd.branchId)}
                  </option>
                ))}
              </select>
            )}

            {/* Print Scale Selector */}
            <div style={{ display: 'flex', background: 'var(--surface, #ffffff)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border, #cbd5e1)' }}>
              <button
                type="button"
                onClick={() => setPrintFitMode('single_page')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: printFitMode === 'single_page' ? 'var(--primary, #0f766e)' : 'transparent',
                  color: printFitMode === 'single_page' ? '#ffffff' : 'var(--text, #334155)',
                  fontWeight: printFitMode === 'single_page' ? 'bold' : 'normal',
                  transition: 'all 0.15s ease'
                }}
                title="ملاءمة كامل المحتوى في حدود صفحة A4 واحدة مدمجة"
              >
                📄 صفحة A4 واحدة مدمجة
              </button>
              <button
                type="button"
                onClick={() => setPrintFitMode('full')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: printFitMode === 'full' ? 'var(--primary, #0f766e)' : 'transparent',
                  color: printFitMode === 'full' ? '#ffffff' : 'var(--text, #334155)',
                  fontWeight: printFitMode === 'full' ? 'bold' : 'normal',
                  transition: 'all 0.15s ease'
                }}
                title="عرض وطباعة بالمقاس الطبيعي الممتد"
              >
                📜 المقاس الطبيعي الممتد
              </button>
            </div>

            <button
              type="button"
              className="btn btn-start"
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                fontWeight: 'bold',
                fontSize: '13px',
                background: '#0f766e',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 118, 110, 0.25)'
              }}
            >
              🖨️ طباعة كشف المرتب (PDF)
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: '1px solid var(--border, #cbd5e1)',
                background: 'transparent',
                color: 'var(--text, #334155)'
              }}
            >
              ✕ إغلاق
            </button>
          </div>
        </div>

        {/* ── Printable Payslip Layout Body (Preview Area) ── */}
        <div
          ref={scrollRef}
          className="payslip-scroll-area"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: 1,
            padding: '16px 20px',
            background: '#f1f5f9',
            scrollBehavior: 'smooth'
          }}
        >
          <div
            id="printable-payslip"
            style={{
              maxWidth: '820px',
              width: '100%',
              margin: '0 auto',
              background: '#ffffff',
              padding: printFitMode === 'single_page' ? '18px 22px' : '24px 28px',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              fontFamily: "'Cairo', 'Tajawal', sans-serif",
              color: '#1e293b',
              direction: 'rtl',
              boxSizing: 'border-box'
            }}
          >
            {/* Header Banner */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '3px double #0f766e',
                paddingBottom: '10px',
                marginBottom: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ height: '50px', borderRadius: '8px' }} />
                ) : (
                  <div style={{ width: '46px', height: '46px', background: '#0f766e', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                    🏥
                  </div>
                )}
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'Cairo', color: '#0f766e', fontSize: '18px', fontWeight: 800 }}>{orgName}</h2>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{gmName}</span>
                </div>
              </div>

              <div style={{ textAlign: 'left' }}>
                <div style={{ background: '#0f766e', color: '#fff', padding: '4px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13.5px', fontFamily: 'Cairo' }}>
                  كشف مرتب شهر {fullMonthLabel}
                </div>
                <div style={{ fontSize: '11px', color: '#0f766e', marginTop: '3px', fontWeight: 'bold' }}>
                  الفترة: من {startCutoff} إلى {endCutoff}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                  تاريخ الطباعة: {new Date().toISOString().slice(0, 10)}
                </div>
              </div>
            </div>

            {/* Employee Info Card */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '8px 14px',
                marginBottom: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '6px',
                fontSize: '11.5px'
              }}
            >
              <div>الموظف: <strong style={{ color: '#0f766e', fontSize: '13px' }}>{emp.name}</strong></div>
              <div>كود الموظف: <strong>{emp.code}</strong></div>
              <div>المسمى الوظيفي: <strong>{emp.jobTitle}</strong></div>
              <div>الفرع / الفروع: <strong>{branchNames}</strong></div>
              <div>رقم الهاتف: <strong>{emp.phone || '—'}</strong></div>
              <div>هاتف الطوارئ: <strong>{emp.relativePhone || emp.emergencyPhone || '—'}</strong></div>
            </div>

            {/* Calculation & Earnings Section (Multi-Branch Breakdown or Single Branch Card) */}
            {showPerBranchBreakdown ? (
              /* Multi-Branch Detailed Breakdown Grid */
              <div style={{ marginBottom: '12px' }}>
                <div style={{ background: '#0f766e', color: '#fff', padding: '6px 12px', borderRadius: '8px 8px 0 0', fontWeight: 800, fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🏢 تفاصيل احتساب الأجر وسعر الساعة وساعات العمل لكل فرع على حدة ({assignedBranches.length} فروع):</span>
                  <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px' }}>موظف متعدد الفروع</span>
                </div>
                <div style={{ border: '1.5px solid #0f766e', borderTop: 'none', padding: '8px', background: '#f8fafc', display: 'grid', gridTemplateColumns: `repeat(${assignedBranches.length > 2 ? '3' : '2'}, 1fr)`, gap: '8px' }}>
                  {assignedBranches.map((bd, idx) => {
                    const bId = bd.branchId;
                    const bName = getBranchName(bId);
                    const bSum = summary.perBranch?.[bId] || {};
                    const bSalary = parseFloat(bd.salary) || (parseFloat(emp.salary) || 0);
                    const bWorkHours = parseFloat(bd.workHours || bd.workHoursPerDay) || (parseFloat(emp.workHoursPerDay) || 8);
                    const bWorkDays = parseFloat(bd.workDays || bd.workDaysPerMonth) || (parseFloat(emp.workDaysPerMonth) || 26);
                    const bDailyRate = bSum.dailyRate || (bWorkDays > 0 ? (bSalary * bWorkHours) / bWorkDays : 0);
                    const bHourlyRate = bSum.rate || bSum.hourlyRate || (bWorkHours > 0 ? bDailyRate / bWorkHours : bSalary);
                    const bHours = bSum.hours || 0;
                    const bBaseEarn = bSum.baseEarnings || (bHours * bHourlyRate);
                    const bOtHours = bSum.approvedOvertimeHours || 0;
                    const bOtEarn = bSum.overtimeEarnings || 0;

                    return (
                      <div key={bId || idx} style={{ border: '1.5px solid #bbf7d0', borderRadius: '8px', overflow: 'hidden', background: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                        <div style={{ background: '#f0fdf4', padding: '5px 10px', color: '#047857', fontWeight: 800, fontSize: '11px', borderBottom: '1.5px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>📍 {bName}</span>
                          <span style={{ fontSize: '9.5px', background: '#dcfce7', padding: '1px 6px', borderRadius: '4px', color: '#166534' }}>فرع #{idx + 1}</span>
                        </div>
                        <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #cbd5e1', paddingBottom: '3px' }}>
                            <span>1. سعر الساعة الشهري (الإدارة):</span>
                            <strong>{fmt(bSalary)} ج.م</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #cbd5e1', paddingBottom: '3px' }}>
                            <span>2. ساعات اليوم / أيام الشهر:</span>
                            <strong>{bWorkHours} س · {bWorkDays} يوم</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #cbd5e1', paddingBottom: '3px' }}>
                            <span>3. سعر اليوم = ({fmt(bSalary)} × {bWorkHours}) ÷ {bWorkDays}:</span>
                            <strong style={{ color: '#047857' }}>{fmt(bDailyRate)} ج.م / يوم</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #cbd5e1', paddingBottom: '3px', color: '#047857', fontWeight: 'bold' }}>
                            <span>✅ 4. سعر الساعة المعتمد:</span>
                            <span>{fmt(bHourlyRate)} ج.م / ساعة</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #cbd5e1', paddingBottom: '3px', color: '#1e293b' }}>
                            <span>5. الساعات المسجلة بالفرع:</span>
                            <strong style={{ fontSize: '11px' }}>{fmt(bHours)} ساعة</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857', fontWeight: 800, fontSize: '11px', ...(bOtHours > 0 ? { borderBottom: '1px dotted #cbd5e1', paddingBottom: '3px' } : {}) }}>
                            <span>6. المستحقات بالفرع:</span>
                            <span>{fmt(bBaseEarn)} ج.م</span>
                          </div>
                          {bOtHours > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#166534', fontWeight: 800, fontSize: '10px' }}>
                              <span>⭐ إضافي الفرع ({fmt(bOtHours)} س):</span>
                              <span>+{fmt(bOtEarn)} ج.م</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Overall Strip */}
                <div style={{ background: '#f0fdf4', border: '1.5px solid #0f766e', borderTop: 'none', padding: '6px 12px', borderRadius: '0 0 8px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: 800, color: '#047857' }}>
                  <span>إجمالي ساعات العمل بكافة الفروع: <strong style={{ color: '#0f172a' }}>{fmt(totalHours)} ساعة</strong></span>
                  <span>إجمالي المستحقات الأساسية: <strong style={{ color: '#0f172a' }}>{fmt(baseEarnings)} ج.م</strong></span>
                  {summary.approvedOvertimeHours > 0 && <span>إجمالي الإضافي: <strong>+{fmt(summary.overtimeEarnings)} ج.م</strong></span>}
                </div>
              </div>
            ) : (
              /* Single Branch Side-by-Side Calculation Boxes */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px', direction: 'rtl' }}>
                {/* Right Box */}
                <div style={{ border: '1.5px solid #bbf7d0', borderRadius: '10px', overflow: 'hidden', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ background: '#f0fdf4', padding: '7px 14px', color: '#047857', fontWeight: 800, fontSize: '12px', borderBottom: '1.5px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Cairo' }}>
                    <span>⚙️</span>
                    <span>احتساب سعر الساعة وأجر اليوم وفق المعادلة المعتمدة</span>
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dotted #cbd5e1', paddingBottom: '5px' }}>
                      <span style={{ color: '#334155' }}>1. سعر الساعة الشهري (المدخل من الإدارة)</span>
                      <strong style={{ color: '#0f172a' }}>{fmt(baseSalary)} ج.م</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dotted #cbd5e1', paddingBottom: '5px' }}>
                      <span style={{ color: '#334155' }}>2. ساعات العمل اليومية المدخلة</span>
                      <strong style={{ color: '#0f172a' }}>{workHoursPerDay} س / يوم</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dotted #cbd5e1', paddingBottom: '5px' }}>
                      <span style={{ color: '#334155' }}>3. أيام العمل الشهرية المدخلة</span>
                      <strong style={{ color: '#0f172a' }}>{workDaysPerMonth} يوم / شهر</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dotted #cbd5e1', paddingBottom: '5px' }}>
                      <span style={{ color: '#334155' }}>4. سعر اليوم = ({fmt(baseSalary)} × {workHoursPerDay}) ÷ {workDaysPerMonth}</span>
                      <strong style={{ color: '#047857' }}>{fmt(dailyRate)} ج.م / يوم</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#047857', fontWeight: 800, fontSize: '11.5px', paddingTop: '2px' }}>
                      <span>✅ 5. سعر الساعة اليومي = {fmt(dailyRate)} ÷ {workHoursPerDay}</span>
                      <span>{fmt(hourlyRate)} ج.م / ساعة</span>
                    </div>
                  </div>
                </div>

                {/* Left Box */}
                <div style={{ border: '1.5px solid #bbf7d0', borderRadius: '10px', overflow: 'hidden', background: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ background: '#f0fdf4', padding: '7px 14px', color: '#047857', fontWeight: 800, fontSize: '12px', borderBottom: '1.5px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Cairo' }}>
                    <span>⏱️</span>
                    <span>ساعات العمل وأجر اليوم / المستحقات</span>
                  </div>
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px', flex: 1, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dotted #cbd5e1', paddingBottom: '8px' }}>
                      <span style={{ color: '#334155', fontWeight: 600 }}>عدد ساعات العمل الأساسية المسجلة</span>
                      <strong style={{ color: '#0f172a', fontSize: '11.5px' }}>{fmt(totalHours)} ساعة</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#047857', fontWeight: 800, fontSize: '11.5px', ...(summary.approvedOvertimeHours > 0 ? { borderBottom: '1px dotted #cbd5e1', paddingBottom: '8px' } : {}) }}>
                      <span>المستحقات الأساسية ({fmt(totalHours)} س × {fmt(hourlyRate)} ج.م)</span>
                      <span style={{ fontSize: '12px' }}>{fmt(baseEarnings)} ج.م</span>
                    </div>
                    {summary.approvedOvertimeHours > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#166534', fontWeight: 800, fontSize: '11.5px' }}>
                        <span>⭐ أجر الوقت الإضافي المعتمد ({fmt(summary.approvedOvertimeHours)} س × {fmt(hourlyRate)} ج.م)</span>
                        <span>+{fmt(summary.overtimeEarnings)} ج.م</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Punches Section (Separate Table for each branch if Multi-Branch) */}
            {showPerBranchBreakdown ? (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#0f766e', borderRight: '3px solid #0f766e', paddingRight: '6px', fontSize: '13px', fontWeight: 800 }}>
                    📋 أولاً: سجلات وبصمات الحضور مفصلة لكل فرع على حدة ({empShifts.length} وردية)
                  </h4>
                  <span style={{ fontSize: '11px', color: '#0f766e', fontWeight: 'bold' }}>
                    إجمالي كافة الفروع: {fmt(totalHours)} س | {fmt(baseEarnings)} ج.م
                  </span>
                </div>

                {(() => {
                  const branchMap = {};
                  assignedBranches.forEach(bd => {
                    branchMap[String(bd.branchId)] = [];
                  });
                  empShifts.forEach(s => {
                    const bKey = String(s.branchId || emp.branchId || assignedBranches[0]?.branchId || 'default');
                    if (!branchMap[bKey]) branchMap[bKey] = [];
                    branchMap[bKey].push(s);
                  });

                  return Object.entries(branchMap).map(([bId, bShifts]) => {
                    if (!bShifts || bShifts.length === 0) return null;
                    const bName = getBranchName(bId);
                    const bSum = summary.perBranch?.[bId] || {};
                    const bRate = bSum.rate || bSum.hourlyRate || hourlyRate;
                    const bTotalHours = bShifts.reduce((acc, s) => acc + (getEffectiveShiftHours(s, state) || 0), 0);
                    const bTotalBreak = bShifts.reduce((acc, s) => acc + (parseFloat(s.breakHours) || 0), 0);
                    const bTotalEarn = bShifts.reduce((acc, s) => acc + ((getEffectiveShiftHours(s, state) || 0) * bRate), 0);

                    return (
                      <div key={bId} style={{ marginBottom: '10px', border: '1.5px solid #0f766e', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
                        <div style={{ background: '#f0fdf4', padding: '6px 12px', borderBottom: '1.5px solid #0f766e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, color: '#0f766e', fontSize: '11.5px', fontFamily: 'Cairo' }}>
                            🏢 جدول بصمات وحضور: <strong>{bName}</strong> ({bShifts.length} وردية)
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#166534', fontWeight: 'bold' }}>
                            سعر الساعة المعتمد بالفرع: {fmt(bRate)} ج.م/س
                          </span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', color: '#334155' }}>
                              <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '5%' }}>#</th>
                              <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '25%' }}>اليوم والتاريخ</th>
                              <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '15%' }}>وقت الدخول</th>
                              <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '15%' }}>وقت الخروج</th>
                              <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '12%' }}>البريك</th>
                              <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '13%' }}>ساعات العمل</th>
                              <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '15%' }}>الأجر المستحق بالفرع</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bShifts.map((s, sIdx) => {
                              const effHours = getEffectiveShiftHours(s, state);
                              const hasPerm = isApprovedPermissionForDate(emp.id, s.date, state);
                              return (
                                <tr key={s.id || sIdx} style={{ background: hasPerm ? '#fefce8' : (sIdx % 2 === 0 ? '#fff' : '#f8fafc') }}>
                                  <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{sIdx + 1}</td>
                                  <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                                    {arabicWeekday(s.date)} {s.date}
                                    {hasPerm && <span style={{ display: 'block', color: '#b45309', fontSize: '9px' }}>⏰ إذن معتمد</span>}
                                  </td>
                                  <td style={{ padding: '3px', border: '1px solid #cbd5e1', color: '#16a34a' }}>{s.timeIn || '—'}</td>
                                  <td style={{ padding: '3px', border: '1px solid #cbd5e1', color: '#dc2626' }}>{s.timeOut || '—'}</td>
                                  <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{fmt(s.breakHours)} س</td>
                                  <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{fmt(effHours)} س</td>
                                  <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0f766e' }}>{fmt(effHours * bRate)} ج.م</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: '#e2e8f0', fontWeight: 'bold', fontSize: '10.5px' }}>
                              <td colSpan={4} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#0f766e' }}>
                                إجمالي فرع ({bName}):
                              </td>
                              <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{fmt(bTotalBreak)} س</td>
                              <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#0f766e' }}>{fmt(bTotalHours)} س</td>
                              <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#0f766e' }}>{fmt(bTotalEarn)} ج.م</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  });
                })()}

                {/* Multi-Branch Grand Summary Strip */}
                <div style={{ background: '#0f766e', color: '#ffffff', padding: '6px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: '11px' }}>
                  <span>📊 إجمالي البصمات وساعات العمل بكافة الفروع ({empShifts.length} وردية):</span>
                  <span>إجمالي الساعات: {fmt(totalHours)} س | إجمالي المستحق: {fmt(baseEarnings)} ج.م</span>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#0f766e', borderRight: '3px solid #0f766e', paddingRight: '6px', fontSize: '12.5px', fontWeight: 800 }}>
                    📋 أولاً: تفاصيل سجل الحضور والبصمات ({empShifts.length} وردية)
                  </h4>
                  <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                    إجمالي الساعات: <strong>{fmt(totalHours)} س</strong> · البريك: <strong>{fmt(totalBreakHours)} س</strong>
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#334155' }}>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '5%' }}>#</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '25%' }}>اليوم والتاريخ</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '15%' }}>وقت الدخول</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '15%' }}>وقت الخروج</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '12%' }}>البريك</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '13%' }}>ساعات العمل</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '15%' }}>الأجر المستحق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empShifts.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '10px', border: '1px solid #cbd5e1', color: '#94a3b8' }}>
                          لا توجد بصمات مسجلة للموظف عن هذا الشهر
                        </td>
                      </tr>
                    ) : (
                      empShifts.map((s, idx) => {
                        const shiftRate = (summary.perBranch?.[s.branchId]?.rate) || hourlyRate;
                        const effHours = getEffectiveShiftHours(s, state);
                        const hasPerm = isApprovedPermissionForDate(emp.id, s.date, state);
                        return (
                          <tr key={s.id || idx} style={{ background: hasPerm ? '#fefce8' : (idx % 2 === 0 ? '#fff' : '#f8fafc') }}>
                            <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{idx + 1}</td>
                            <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                              {arabicWeekday(s.date)} {s.date}
                              {hasPerm && <span style={{ display: 'block', color: '#b45309', fontSize: '9px' }}>⏰ إذن معتمد</span>}
                            </td>
                            <td style={{ padding: '3px', border: '1px solid #cbd5e1', color: '#16a34a' }}>{s.timeIn || '—'}</td>
                            <td style={{ padding: '3px', border: '1px solid #cbd5e1', color: '#dc2626' }}>{s.timeOut || '—'}</td>
                            <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{fmt(s.breakHours)} س</td>
                            <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{fmt(effHours)} س</td>
                            <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0f766e' }}>{fmt(effHours * shiftRate)} ج.م</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {empShifts.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#e2e8f0', fontWeight: 'bold', fontSize: '11px' }}>
                        <td colSpan={4} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>الإجمالي:</td>
                        <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{fmt(totalBreakHours)} س</td>
                        <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#0f766e' }}>{fmt(totalHours)} س</td>
                        <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#0f766e' }}>{fmt(baseEarnings)} ج.م</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Late Penalties Table (If exists) */}
            {latePenaltyItems.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#c2410c', borderRight: '3px solid #ea580c', paddingRight: '6px', fontSize: '12.5px', fontWeight: 800 }}>
                    ⏱️ ثانياً: وقائع وجزاءات التأخير اللائحي ({latePenaltyItems.length} واقعة)
                  </h4>
                  <span style={{ fontSize: '10.5px', color: '#c2410c', fontWeight: 'bold' }}>
                    إجمالي الخصم: -{fmt(summary.lateDeduction || 0)} ج.م ({summary.lateDeductionMinutes || 0} دقيقة)
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#ffedd5', color: '#9a3412', fontWeight: 800 }}>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>التاريخ</th>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>الشيفت</th>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>الحضور</th>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>التأخير</th>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>الفئة</th>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>الجزاء اللائحي</th>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>دقائق الخصم</th>
                      <th style={{ padding: '4px', border: '1px solid #fed7aa' }}>مبلغ الخصم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latePenaltyItems.map((inc) => (
                      <tr key={inc.id}>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa', fontWeight: 'bold' }}>{inc.date}</td>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa', color: '#2563eb' }}>{inc.scheduledStartTime}</td>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa', fontWeight: 'bold' }}>{inc.actualPunchInTime}</td>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa', color: '#ea580c', fontWeight: 'bold' }}>{inc.lateMinutes} د</td>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa' }}>{inc.tierName} (#{inc.occurrenceNumber})</td>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa', color: inc.deductionMinutes > 0 ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>{inc.actionLabel}</td>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa' }}>{inc.deductionMinutes > 0 ? `${inc.deductionMinutes} د` : '—'}</td>
                        <td style={{ padding: '3px', border: '1px solid #fed7aa', fontWeight: 'bold', color: '#dc2626' }}>-{fmt(inc.amount)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Loans and Credit Meds Table (If exists) */}
            {empLoans.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#991b1b', borderRight: '3px solid #dc2626', paddingRight: '6px', fontSize: '12.5px', fontWeight: 800 }}>
                    💳 ثالثاً: السلف ومشتريات الأدوية والأقساط ({empLoans.length} بند)
                  </h4>
                  <span style={{ fontSize: '10.5px', color: '#991b1b', fontWeight: 'bold' }}>
                    إجمالي المخصوم بالشهر: -{fmt(summary.loansDeduction || 0)} ج.م
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#fee2e2', color: '#991b1b', fontWeight: 800 }}>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>البيان</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>التاريخ</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>أصل المبلغ</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>المسدد سابقاً</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>المخصوم بهذا الشهر</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>المتبقي بعد الخصم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empLoans.map((l) => (
                      <tr key={l.id}>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5', fontWeight: 'bold' }}>{l.typeLabel}</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5' }}>{l.date}</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5' }}>{fmt(l.totalAmount)} ج.م</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5', color: '#16a34a' }}>{fmt(l.paidAmount)} ج.م</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5', fontWeight: 'bold', color: '#dc2626' }}>-{fmt(l.deductedThisMonth)} ج.م</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5', fontWeight: 'bold', color: '#b91c1c' }}>{fmt(l.remainingBalance)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Leaves and Rest Days Table */}
            {allTakenDays.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#0284c7', borderRight: '3px solid #0284c7', paddingRight: '6px', fontSize: '12.5px', fontWeight: 800 }}>
                    🌴 رابعاً: سجل أيام الإجازات والراحات الأسبوعية المأخوذة بالشهر ({allTakenDays.length} يوم/بند)
                  </h4>
                  <span style={{ fontSize: '10px', color: '#0369a1', fontWeight: 'bold', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>
                    🛋️ راحة: {totalRestDaysCount} يوم · 🌴 سنوي: {totalAnnualLeaveDays} يوم · 💸 بدون أجر: {totalUnpaidLeaveDays} يوم {totalSickLeaveDays > 0 ? `· 🤒 مرضي: ${totalSickLeaveDays} يوم` : ''}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 800 }}>
                      <th style={{ padding: '4px', border: '1px solid #bae6fd', width: '5%' }}>#</th>
                      <th style={{ padding: '4px', border: '1px solid #bae6fd', width: '24%' }}>اليوم والتاريخ / الفترة</th>
                      <th style={{ padding: '4px', border: '1px solid #bae6fd', width: '18%' }}>نوع الإجازة / الراحة</th>
                      <th style={{ padding: '4px', border: '1px solid #bae6fd', width: '10%' }}>المدة</th>
                      <th style={{ padding: '4px', border: '1px solid #bae6fd', width: '18%' }}>الأثر المالي</th>
                      <th style={{ padding: '4px', border: '1px solid #bae6fd', width: '25%' }}>البيان / ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTakenDays.map((item, idx) => (
                      <tr key={item.id || idx} style={{ background: item.category === 'unpaid' ? '#fef2f2' : (item.category === 'rest' ? '#f0f9ff' : '#f0fdf4') }}>
                        <td style={{ padding: '3px', border: '1px solid #bae6fd' }}>{idx + 1}</td>
                        <td style={{ padding: '3px', border: '1px solid #bae6fd', fontWeight: 'bold' }}>{item.dateRangeLabel || `${item.dayName} ${item.date}`}</td>
                        <td style={{ padding: '3px', border: '1px solid #bae6fd' }}>{item.categoryBadge}</td>
                        <td style={{ padding: '3px', border: '1px solid #bae6fd', fontWeight: 'bold' }}>{item.daysCount} يوم</td>
                        <td style={{ padding: '3px', border: '1px solid #bae6fd', fontWeight: 'bold', color: item.effectColor }}>{item.effectLabel}</td>
                        <td style={{ padding: '3px', border: '1px solid #bae6fd', fontSize: '10px' }}>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Absences Record Table */}
            {absenceDayItems.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#b91c1c', borderRight: '3px solid #b91c1c', paddingRight: '6px', fontSize: '12.5px', fontWeight: 800 }}>
                    🚫 خامساً: سجل أيام الغياب غير المبرر عن العمل ({absenceDayItems.length} يوم)
                  </h4>
                  <span style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: 'bold', background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                    إجمالي خصم الغياب: -{fmt(totalAbsenceDeductionAmt)} ج.م ({totalAbsenceDaysCount} يوم)
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#fee2e2', color: '#991b1b', fontWeight: 800 }}>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5', width: '5%' }}>#</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5', width: '25%' }}>اليوم والتاريخ</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5', width: '22%' }}>الوردية المجدولة</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5', width: '18%' }}>قيمة الخصم</th>
                      <th style={{ padding: '4px', border: '1px solid #fca5a5', width: '30%' }}>البيان / السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absenceDayItems.map((item, idx) => (
                      <tr key={item.id || idx} style={{ background: '#fff5f5' }}>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5' }}>{idx + 1}</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5', fontWeight: 'bold', color: '#b91c1c' }}>{item.dateRangeLabel || `${item.dayName} ${item.date}`}</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5' }}>{item.scheduledShift}</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5', fontWeight: 'bold', color: item.effectColor }}>{item.effectLabel}</td>
                        <td style={{ padding: '3px', border: '1px solid #fca5a5', fontSize: '10px', textAlign: 'right', paddingRight: '8px', color: '#7f1d1d' }}>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Allowances, Bonuses, & Deductions Table (If exists) */}
            {generalFinancialItems.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#0f766e', borderRight: '3px solid #0f766e', paddingRight: '6px', fontSize: '12.5px', fontWeight: 800 }}>
                    📝 {absenceDayItems.length > 0 ? 'سادساً' : 'خامساً'}: بيان البدلات الثابتة والمكافآت والجزاءات والغياب والإجازات ({generalFinancialItems.length} بند)
                  </h4>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#334155', fontWeight: 800 }}>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '22%' }}>نوع البند</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '18%' }}>الفترة / التاريخ</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '18%' }}>المبلغ</th>
                      <th style={{ padding: '4px', border: '1px solid #cbd5e1', width: '42%' }}>البيان والتفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generalFinancialItems.map((item) => (
                      <tr key={item.id}>
                        <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: item.color }}>{item.typeLabel}</td>
                        <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{item.date}</td>
                        <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: item.isPositive ? '#16a34a' : '#dc2626' }}>
                          {item.isPositive ? '+' : '-'}{fmt(item.amount)} ج.م
                        </td>
                        <td style={{ padding: '3px', border: '1px solid #cbd5e1', textAlign: 'right', paddingRight: '8px' }}>{item.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Salary Financial Summary Box */}
            <div style={{ background: '#0f766e', color: '#fff', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.25)', paddingBottom: '5px', marginBottom: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '12.5px', fontFamily: 'Cairo', color: '#fff', fontWeight: 800 }}>
                  🏆 الملخص المالي النهائي لشهر {fullMonthLabel}
                </h4>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 12px', borderRadius: '6px', fontSize: '14px', fontWeight: 900 }}>
                  صافي المرتب المستحق: {fmt(netSalary)} ج.م
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '11px' }}>
                <div>الأساسي: <strong>{fmt(baseEarnings)} ج.م</strong></div>
                {summary.approvedOvertimeHours > 0 && (
                  <div style={{ color: '#86efac' }}>+ الإضافي: <strong>+{fmt(summary.overtimeEarnings)} ج.م</strong></div>
                )}
                {totalAllowances > 0 && (
                  <div>+ البدلات: <strong>+{fmt(totalAllowances)} ج.م</strong></div>
                )}
                <div>+ المكافآت: <strong>+{fmt(totalBonus)} ج.م</strong></div>
                {summary.lateDeduction > 0 && (
                  <div style={{ color: '#fed7aa' }}>- تأخيرات: <strong>-{fmt(summary.lateDeduction)} ج.م</strong></div>
                )}
                {summary.absenceDeduction > 0 && (
                  <div style={{ color: '#fecaca' }}>- غيابات: <strong>-{fmt(summary.absenceDeduction)} ج.م</strong></div>
                )}
                <div>- سلف وأدوية: <strong>-{fmt(summary.loansDeduction || 0)} ج.م</strong></div>
                <div>- إجمالي الخصومات: <strong>-{fmt(totalDeduction)} ج.م</strong></div>
              </div>
            </div>

            {/* Footer Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center', fontSize: '11px', borderTop: '1px solid #cbd5e1', paddingTop: '8px' }}>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '22px' }}>توقيع الموظف المستلم</div>
                <div style={{ borderTop: '1px dotted #94a3b8', paddingTop: '2px', fontSize: '10.5px' }}>{emp.name}</div>
              </div>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '22px' }}>توقيع الإدارة المالية</div>
                <div style={{ borderTop: '1px dotted #94a3b8', paddingTop: '2px', fontSize: '10.5px' }}>المحاسب المالي والختم</div>
              </div>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '22px' }}>اعتماد المدير العام</div>
                <div style={{ borderTop: '1px dotted #94a3b8', paddingTop: '2px', fontSize: '10.5px' }}>{gmName}</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
