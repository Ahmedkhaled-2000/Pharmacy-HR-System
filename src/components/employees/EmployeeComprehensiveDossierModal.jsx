import React, { useState, useMemo, useCallback } from 'react';
import {
  fmt,
  getRealTodayStr,
  getEmpDisplayName,
  getPunchMethodDetails,
  arabicWeekday,
  isEmployeeActive,
  getEmployeeApprovedLeaves
} from '../../utils/formatters';
import {
  getEffectiveShiftHours,
  getShiftHoursMetrics,
  isApprovedPermissionForDate,
  recalculateEmployeeCycleLateness
} from '../../utils/latePenaltyEngine';
import {
  getResolvedEmployeeRoster,
  getEmployeeDaySchedule,
  normalizeSchedule,
  DEFAULT_WEEKLY_SCHEDULE
} from '../../utils/rosterEngine';
import {
  getActivePayrollMonth,
  getCycleDateRange
} from '../../utils/periodEngine';
import { computeEmployeeFinalSettlement } from '../../utils/settlementHelper';
import { triggerDirectPrint, generateClearanceSlipHTML } from '../../utils/printHelper';
import { compressImage } from '../../utils/imageCompressor';
import { useUI } from '../../context/UIContext';
import { apiSaveSettingsSlice } from '../../utils/apiClient';
import { checkShiftConflicts } from '../../utils/workHoursEngine';
import { isBranchMatch } from '../../utils/branchMatcher';

export default function EmployeeComprehensiveDossierModal({
  emp,
  state,
  setState,
  saveState,
  showToast,
  monthPicker,
  computeEmpSummary,
  executeWithOwnerGuard,
  initialTab = 'summary',
  onClose,
  onOpenRehireModal,
  onOpenEditModal,
  onOpenIDCardModal,
  onSaveSignedClearance
}) {
  const { showConfirm } = useUI();

  // ── 1. إدارة دورة الشهر المحددة والتنقل الزمني ──
  const orgSettings = state?.orgSettings || {};
  const activeCycleDefault = useMemo(() => {
    return getActivePayrollMonth(orgSettings);
  }, [orgSettings]);

  const [selectedMonth, setSelectedMonth] = useState(() => (
    monthPicker || activeCycleDefault || (getRealTodayStr ? getRealTodayStr().slice(0, 7) : new Date().toISOString().slice(0, 7))
  ));

  const cycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, orgSettings);
  }, [selectedMonth, orgSettings]);

  // قائمة خيارات دورات الرواتب المتاحة (6 أشهر سابقة + شهرين قادمين)
  const availableCycleOptions = useMemo(() => {
    const baseMonth = activeCycleDefault || (getRealTodayStr ? getRealTodayStr().slice(0, 7) : new Date().toISOString().slice(0, 7));
    const [y, m] = baseMonth.split('-').map(Number);
    const options = [];
    for (let offset = -5; offset <= 2; offset++) {
      let targetM = m + offset;
      let targetY = y;
      while (targetM < 1) {
        targetM += 12;
        targetY -= 1;
      }
      while (targetM > 12) {
        targetM -= 12;
        targetY += 1;
      }
      const mStr = `${targetY}-${String(targetM).padStart(2, '0')}`;
      const rng = getCycleDateRange(mStr, orgSettings);
      options.push({
        month: mStr,
        label: rng.label || mStr,
        shortRange: `${rng.startDate} إلى ${rng.endDate}`,
        isCurrent: mStr === baseMonth
      });
    }
    return options;
  }, [activeCycleDefault, orgSettings]);

  // فلتر التاريخ حسب الدورة المحددة
  const activeCycleFilter = useCallback((dateStr) => {
    if (!dateStr) return false;
    const d = String(dateStr).slice(0, 10);
    if (cycleRange?.startDate && cycleRange?.endDate) {
      return d >= cycleRange.startDate && d <= cycleRange.endDate;
    }
    return d.startsWith(selectedMonth);
  }, [cycleRange, selectedMonth]);

  // ── 2. حالة التبويب النشط ──
  const [activeTab, setActiveTab] = useState(initialTab || 'summary');
  const [shiftsViewScope, setShiftsViewScope] = useState('cycle'); // 'cycle' | 'all'
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [previewDocModal, setPreviewDocModal] = useState(null);

  // ── 3. حالات نوافذ التعديل والإضافة المباشرة (Sub-Modals) ──
  // أ. تعديل / إضافة بصمة
  const [editingShiftModal, setEditingShiftModal] = useState(null); // { isNew, shift, date, timeIn, timeOut, breakHours, branchId, notes }
  // ب. تعديل الجدول الشهري لليوم
  const [editingRosterDayModal, setEditingRosterDayModal] = useState(null); // { dayName, dateStr, type, start, end, hours, isOff }
  const [showRosterBatchModal, setShowRosterBatchModal] = useState(false);
  const [batchWeeklyRoster, setBatchWeeklyRoster] = useState(() => ({ ...DEFAULT_WEEKLY_SCHEDULE }));
  // ج. إضافة / تعديل مكافأة أو خصم
  const [adjustmentModal, setAdjustmentModal] = useState(null); // { isNew, adj, type: 'bonus'|'deduction', amount, date, reason }
  // د. توثيق جزاء إداري جديد
  const [newPenaltyModal, setNewPenaltyModal] = useState(null); // { date, category, impactType: 'deduction_days'|'fixed_amount', impactVal, branchId, reason, notes }
  // هـ. إلغاء جزاء / إعفاء
  const [waivePenaltyModal, setWaivePenaltyModal] = useState(null); // { penaltyItem, reason }
  // و. تعديل جزاء قائم
  const [editPenaltyModal, setEditPenaltyModal] = useState(null); // { penaltyItem, amount, reason }

  if (!emp) return null;

  const empIdStr = String(emp.id || '').trim();
  const empCodeStr = String(emp.code || '').trim();
  const isMatchEmp = (item) => {
    if (!item) return false;
    const iEmpId = String(item.employeeId || '').trim();
    const iEmpCode = String(item.employeeCode || '').trim();
    return iEmpId === empIdStr || (empCodeStr && iEmpId === empCodeStr) || (empCodeStr && iEmpCode === empCodeStr);
  };

  // ── 4. تجهيز وفلترة البيانات المركزية للموظف ──

  // الفروع
  const branches = state?.branches || [];
  const getBranchName = (bId) => {
    if (!bId) return 'الفرع الرئيسي';
    const b = branches.find((br) => String(br.id) === String(bId) || br.branchId === bId || br.code === bId);
    return b ? b.name : (bId === 'main' ? 'المركز الرئيسي' : `فرع ${bId}`);
  };

  const isTerminated = emp.status === 'تم الاستقالة' || emp.is_active === false;
  const isFlexibleSchedule = Boolean(emp.noMonthlySchedule);

  // حساب أجر اليوم والساعة التقريبي للموظف
  const empSalary = parseFloat(emp.salary) || 0;
  const empWorkHours = parseFloat(emp.workHoursPerDay) || 8;
  const empWorkDays = parseFloat(emp.workDaysPerMonth) || 26;
  const empDailyRate = empWorkDays > 0 ? (empSalary * empWorkHours) / empWorkDays : (empSalary * empWorkHours);
  const empHourlyRate = empWorkHours > 0 ? empDailyRate / empWorkHours : (empSalary / empWorkDays);

  // 1. الورديات والبصمات (Shifts)
  const allEmpShifts = (state?.shifts || [])
    .filter(isMatchEmp)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const cycleEmpShifts = allEmpShifts.filter((s) => activeCycleFilter(s.date));
  const activeShiftsToDisplay = shiftsViewScope === 'cycle' ? cycleEmpShifts : allEmpShifts;

  const cycleTotalRegularHours = cycleEmpShifts.reduce((acc, s) => acc + (getEffectiveShiftHours(s, state) || 0), 0);
  const cycleTotalApprovedOtHours = cycleEmpShifts.reduce((acc, s) => {
    const m = getShiftHoursMetrics(s, state);
    return acc + (m.isOvertimeApproved ? m.overtimeHours : 0);
  }, 0);
  const cycleTotalWorkedHours = cycleTotalRegularHours + cycleTotalApprovedOtHours;

  // 2. الجدول الشهري المعتمد (Rosters)
  const resolvedRoster = useMemo(() => {
    return getResolvedEmployeeRoster(emp.id, selectedMonth, state);
  }, [emp.id, selectedMonth, state?.rosters]);

  const scheduleMap = resolvedRoster?.schedule || DEFAULT_WEEKLY_SCHEDULE;

  // أيام الدورة الشهرية مع تفاصيل الوردية لكل يوم
  const cycleDaysList = useMemo(() => {
    if (!cycleRange?.startDate || !cycleRange?.endDate) return [];
    const list = [];
    let cur = new Date(cycleRange.startDate);
    const end = new Date(cycleRange.endDate);
    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      const dayIdx = cur.getDay(); // 0: Sunday ... 6: Saturday
      const dayName = arabicWeekday(dateStr);
      const sched = getEmployeeDaySchedule(emp.id, dateStr, state);
      const isOff = sched?.type === 'off' || sched?.isOff;
      list.push({
        date: dateStr,
        dayName,
        dayIdx,
        schedule: sched,
        isOff,
        shiftTimeStr: isOff ? 'راحة أسبوعية' : (sched?.start && sched?.end ? `${sched.start} إلى ${sched.end} (${sched.hours || empWorkHours} س)` : 'دوام عادي'),
        hours: isOff ? 0 : (sched?.hours || empWorkHours)
      });
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [cycleRange, emp.id, state, empWorkHours]);

  // 3. الإجازات (Leaves)
  const empLeaves = useMemo(() => {
    const list = [];
    const seen = new Set();
    (state?.leaves || state?.leaveRequests || []).filter(isMatchEmp).forEach((l) => {
      const id = String(l.id || `${l.startDate}_${l.type}`);
      if (!seen.has(id)) {
        seen.add(id);
        list.push(l);
      }
    });
    (state?.requests || []).filter((r) => isMatchEmp(r) && r.type === 'leave').forEach((r) => {
      const id = String(r.id);
      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          id: r.id,
          employeeId: r.employeeId,
          type: r.subType || r.leaveType || 'إجازة اعتيادية',
          startDate: r.startDate || r.date,
          endDate: r.endDate || r.date,
          daysCount: r.daysCount || r.days || 1,
          reason: r.reason || r.notes || '',
          status: r.status,
          adminApproved: r.adminApproved,
          attachmentUrl: r.attachmentUrl || r.photoUrl || null,
          createdAt: r.createdAt
        });
      }
    });
    return list.sort((a, b) => new Date(b.startDate || b.date || 0) - new Date(a.startDate || a.date || 0));
  }, [state?.leaves, state?.leaveRequests, state?.requests, empIdStr]);

  // رصيد الإجازات السنوي والمستهلك
  const annualTotalBalance = parseFloat(emp.annualLeaveBalance) || 21;
  const annualUsedDays = empLeaves
    .filter((l) => (l.status === 'approved' || l.adminApproved) && (!l.type || !l.type.includes('بدون مرتب')))
    .reduce((acc, l) => acc + (parseFloat(l.daysCount || l.days) || 1), 0);
  const annualRemainingDays = Math.max(0, annualTotalBalance - annualUsedDays);

  // 4. الاستئذانات والأذونات (Permissions)
  const empPermissions = useMemo(() => {
    const list = [];
    const seen = new Set();
    (state?.permissions || state?.permissionRequests || []).filter(isMatchEmp).forEach((p) => {
      const id = String(p.id || `${p.date}_${p.type}`);
      if (!seen.has(id)) {
        seen.add(id);
        list.push(p);
      }
    });
    (state?.requests || []).filter((r) => isMatchEmp(r) && (r.type === 'permission' || r.type === 'late_permission' || r.type === 'early_exit')).forEach((r) => {
      const id = String(r.id);
      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          id: r.id,
          employeeId: r.employeeId,
          type: r.permType === 'early' ? 'إذن انصراف مبكر' : (r.permType === 'late' ? 'إذن تأخير عن الوردية' : 'إذن استئذان شخصي'),
          date: r.date || r.createdAt?.slice(0, 10),
          hours: r.hours || (r.durationMinutes ? r.durationMinutes / 60 : 1),
          startTime: r.startTime,
          endTime: r.endTime,
          reason: r.reason || r.notes || '',
          status: r.status,
          adminApproved: r.adminApproved,
          createdAt: r.createdAt
        });
      }
    });
    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [state?.permissions, state?.permissionRequests, state?.requests, empIdStr]);

  const cycleUsedPermissionHours = empPermissions
    .filter((p) => (p.status === 'approved' || p.adminApproved) && activeCycleFilter(p.date))
    .reduce((acc, p) => acc + (parseFloat(p.hours) || 0), 0);

  // 5. السلف والقروض والأدوية بالآجل (Loans & Meds)
  const empLoans = useMemo(() => {
    const loanMap = new Map();
    (state?.requests || [])
      .filter((r) => isMatchEmp(r) && (r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine'))
      .forEach((r) => loanMap.set(String(r.id), r));

    (state?.loans || [])
      .filter((l) => isMatchEmp(l) && (l.type === 'loan' || l.type === 'advance' || l.type === 'meds' || l.type === 'credit_medicine'))
      .forEach((l) => {
        const ex = loanMap.get(String(l.id));
        loanMap.set(String(l.id), { ...(ex || {}), ...l });
      });

    return Array.from(loanMap.values()).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }, [state?.requests, state?.loans, empIdStr]);

  const totalOriginalLoans = empLoans.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);
  const totalPaidLoans = empLoans.reduce((acc, l) => acc + (parseFloat(l.paidAmount) || 0), 0);
  const totalRemainingDebt = Math.max(0, totalOriginalLoans - totalPaidLoans);

  // 6. المكافآت والخصومات (Adjustments)
  const empAdjustments = useMemo(() => {
    const list = [];
    const seen = new Set();
    // من جدول adjustments
    (state?.adjustments || []).filter(isMatchEmp).forEach((a) => {
      const id = String(a.id);
      if (!seen.has(id)) {
        seen.add(id);
        list.push(a);
      }
    });
    // من جدول requests (حوافز ومكافآت وخصومات إدارية)
    (state?.requests || [])
      .filter((r) => isMatchEmp(r) && (r.type === 'adjustment' || r.type === 'bonus' || (r.type === 'deduction' && r.subType !== 'penalty')) && (r.status === 'approved' || r.adminApproved))
      .forEach((r) => {
        const id = String(r.id);
        if (!seen.has(id)) {
          seen.add(id);
          list.push({
            id: r.id,
            employeeId: r.employeeId,
            type: r.subType === 'bonus' || r.type === 'bonus' ? 'bonus' : 'deduction',
            amount: parseFloat(r.amount) || 0,
            date: r.date || r.createdAt?.slice(0, 10),
            reason: r.reason || r.notes || (r.type === 'bonus' ? 'مكافأة إدارية' : 'خصم إداري'),
            createdAt: r.createdAt,
            createdByName: r.createdByName || 'الإدارة'
          });
        }
      });
    return list.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }, [state?.adjustments, state?.requests, empIdStr]);

  const totalBonusesAmount = empAdjustments
    .filter((a) => a.type === 'bonus')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const totalManualDeductionsAmount = empAdjustments
    .filter((a) => a.type === 'deduction')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  // 7. الجزاءات والمخالفات اللائحية (Penalties & Late Incidents)
  const empPenalties = useMemo(() => {
    const list = [];
    const seen = new Set();

    // أ. وقائع التأخير التلقائية
    (state?.lateIncidents || []).filter(isMatchEmp).forEach((inc) => {
      const id = String(inc.id || `late_${inc.date}`);
      if (!seen.has(id)) {
        seen.add(id);
        const isWaived = inc.isCancelled || inc.status === 'cancelled' || inc.waived || inc.actionType === 'grace';
        list.push({
          id: inc.id,
          sourceType: 'late_incident',
          date: inc.date,
          branchId: inc.branchId,
          branchName: getBranchName(inc.branchId),
          title: `تأخير عن موعد العمل (${inc.lateMinutes || inc.minutes || 0} دقيقة)`,
          category: 'تأخير لائحي',
          penaltyAmount: isWaived ? 0 : (parseFloat(inc.penaltyAmount) || 0),
          originalAmount: parseFloat(inc.penaltyAmount) || 0,
          deductionMinutes: isWaived ? 0 : (parseFloat(inc.deductionMinutes) || 0),
          actionLabel: inc.actionLabel || inc.tierName || 'خصم لائحي',
          status: isWaived ? 'cancelled' : 'active',
          isCancelled: isWaived,
          cancellationReason: inc.cancellationReason || (inc.actionType === 'grace' ? 'سماح لائحي' : ''),
          notes: inc.notes || inc.overrideReason || '',
          raw: inc
        });
      }
    });

    // ب. الجزاءات الإدارية والمخالفات
    (state?.requests || [])
      .filter((r) => isMatchEmp(r) && (r.type === 'penalty' || r.type === 'disciplinary_penalty' || r.type === 'violation' || r.subType === 'disciplinary_penalty'))
      .forEach((r) => {
        const id = String(r.id);
        if (!seen.has(id)) {
          seen.add(id);
          const isCancelled = r.status === 'cancelled' || r.isCancelled || r.waived;
          let calculatedAmount = parseFloat(r.amount) || 0;
          if (!calculatedAmount && r.impactType === 'deduction_days') {
            calculatedAmount = Math.round(empDailyRate * (parseFloat(r.impactVal) || 1) * 100) / 100;
          }
          list.push({
            id: r.id,
            sourceType: 'disciplinary_request',
            date: r.date || r.createdAt?.slice(0, 10),
            branchId: r.branchId || emp.branchId,
            branchName: getBranchName(r.branchId || emp.branchId),
            title: r.ruleTitle || r.category || 'جزاء إداري تأديبي',
            category: r.category || 'مخالفة إدارية',
            penaltyAmount: isCancelled ? 0 : calculatedAmount,
            originalAmount: calculatedAmount,
            deductionMinutes: 0,
            actionLabel: r.impactType === 'deduction_days' ? `خصم ${r.impactVal} يوم عمل` : (calculatedAmount > 0 ? `خصم ${fmt(calculatedAmount)} ج.م` : 'إنذار وتنبيه'),
            status: isCancelled ? 'cancelled' : (r.status || 'approved'),
            isCancelled: isCancelled,
            cancellationReason: r.cancellationReason || r.waivedReason || '',
            notes: r.reason || r.notes || '',
            raw: r
          });
        }
      });

    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [state?.lateIncidents, state?.requests, empIdStr, empDailyRate]);

  const activePenaltiesCount = empPenalties.filter((p) => !p.isCancelled).length;
  const totalActivePenaltiesAmount = empPenalties
    .filter((p) => !p.isCancelled)
    .reduce((acc, p) => acc + (parseFloat(p.penaltyAmount) || 0), 0);

  // 8. التقييمات ومؤشرات الأداء (Evaluations)
  const empEvaluations = useMemo(() => {
    return (state?.evaluations || [])
      .filter(isMatchEmp)
      .sort((a, b) => new Date(b.month || b.date || 0) - new Date(a.month || a.date || 0));
  }, [state?.evaluations, empIdStr]);

  const avgEvaluationScore = useMemo(() => {
    if (empEvaluations.length === 0) return 100;
    const sum = empEvaluations.reduce((acc, ev) => acc + (parseFloat(ev.score || ev.rating) || 100), 0);
    return Math.round((sum / empEvaluations.length) * 10) / 10;
  }, [empEvaluations]);

  // 9. ملخص استحقاقات المرتب للشهر من computeEmpSummary
  const empCycleSummary = useMemo(() => {
    if (typeof computeEmpSummary === 'function') {
      try {
        return computeEmpSummary(emp.id, null, selectedMonth);
      } catch (err) {
        console.warn('Error computing emp summary for dossier:', err);
      }
    }
    return null;
  }, [computeEmpSummary, emp.id, selectedMonth, state]);

  // 10. شريط الأحداث الزمني الشامل 360° (Unified Activity Timeline)
  const timelineEvents = useMemo(() => {
    const events = [];

    // أ. البصمات الأخيرة
    allEmpShifts.slice(0, 15).forEach((s) => {
      events.push({
        date: s.date,
        type: 'shift',
        icon: '⏱️',
        title: `وردية عمل - ${getBranchName(s.branchId)}`,
        detail: `حضور: ${s.timeIn || '—'} | انصراف: ${s.timeOut || '—'} (${fmt(getEffectiveShiftHours(s, state))} س)`,
        badge: s.overtimeHours > 0 ? `+${fmt(s.overtimeHours)} س إضافي` : 'مكتملة',
        badgeBg: '#f0fdf4',
        badgeColor: '#166534'
      });
    });

    // ب. الإجازات
    empLeaves.forEach((l) => {
      events.push({
        date: l.startDate || l.date,
        type: 'leave',
        icon: '🏖️',
        title: `إجازة (${l.type})`,
        detail: `من ${l.startDate} إلى ${l.endDate} [${l.daysCount || 1} يوم] - ${l.reason || 'إجازة معتمدة'}`,
        badge: l.status === 'approved' || l.adminApproved ? 'معتمدة' : 'معلقة',
        badgeBg: '#e0f2fe',
        badgeColor: '#0369a1'
      });
    });

    // ج. الاستئذانات
    empPermissions.forEach((p) => {
      events.push({
        date: p.date,
        type: 'permission',
        icon: '⏰',
        title: `إذن عمل (${p.type})`,
        detail: `المدة: ${p.hours || 1} س - ${p.reason || 'إذن معتمد'}`,
        badge: p.status === 'approved' || p.adminApproved ? 'معتمد' : 'معلق',
        badgeBg: '#fef3c7',
        badgeColor: '#92400e'
      });
    });

    // د. السلف والأدوية
    empLoans.forEach((l) => {
      events.push({
        date: l.date || l.createdAt?.slice(0, 10),
        type: 'loan',
        icon: l.type === 'meds' || l.type === 'credit_medicine' ? '💊' : '💳',
        title: l.type === 'meds' || l.type === 'credit_medicine' ? 'شراء أدوية بالآجل' : 'سلفة نقدية',
        detail: `المبلغ: ${fmt(l.amount)} ج.م (المسدد: ${fmt(l.paidAmount || 0)} ج.م)`,
        badge: (parseFloat(l.amount) - (parseFloat(l.paidAmount) || 0)) <= 0 ? 'مسدد' : 'قيد السداد',
        badgeBg: '#fdf2f8',
        badgeColor: '#9d174d'
      });
    });

    // هـ. المكافآت
    empAdjustments.filter((a) => a.type === 'bonus').forEach((a) => {
      events.push({
        date: a.date,
        type: 'bonus',
        icon: '🎁',
        title: 'مكافأة / حافز إداري',
        detail: `مبلغ: +${fmt(a.amount)} ج.م - السبب: ${a.reason || 'مكافأة أداء'}`,
        badge: `+${fmt(a.amount)} ج.م`,
        badgeBg: '#dcfce7',
        badgeColor: '#15803d'
      });
    });

    // و. الجزاءات
    empPenalties.forEach((p) => {
      events.push({
        date: p.date,
        type: 'penalty',
        icon: '⚖️',
        title: p.title,
        detail: p.isCancelled ? `[ملغى]: ${p.cancellationReason || 'إعفاء'}` : `الخصم: ${fmt(p.penaltyAmount)} ج.م - ${p.notes || ''}`,
        badge: p.isCancelled ? 'ملغى ومعفى' : `-${fmt(p.penaltyAmount)} ج.م`,
        badgeBg: p.isCancelled ? '#f1f5f9' : '#fee2e2',
        badgeColor: p.isCancelled ? '#475569' : '#991b1b'
      });
    });

    return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [allEmpShifts, empLeaves, empPermissions, empLoans, empAdjustments, empPenalties, state]);

  // المخالصة النهائية إن وجدت
  const finalSettlement = emp.finalSettlement || emp.settlementRecord || null;
  const effectiveSettlement = finalSettlement || (isTerminated ? computeEmployeeFinalSettlement(emp.id, state, emp.terminationDate || getRealTodayStr()) : null);

  // ── 5. دوال الإجراءات والعمليات الهندسية ──

  // حفظ وتحديث الحالة مع المزامنة
  const commitStateChange = async (nextState, successMsg, sliceKey = null, sliceValue = null) => {
    if (typeof setState === 'function') {
      setState(nextState);
    }
    if (sliceKey && sliceValue) {
      try {
        await apiSaveSettingsSlice(sliceKey, sliceValue);
      } catch (err) {
        console.warn(`[Dossier API Slice Warn] ${sliceKey}:`, err);
      }
    }
    if (typeof saveState === 'function') {
      await saveState(nextState);
    }
    showToast?.(successMsg);
  };

  // ── أ. دوال البصمات (Shifts CRUD) ──
  const handleOpenAddShift = () => {
    setEditingShiftModal({
      isNew: true,
      shift: null,
      date: getRealTodayStr(),
      timeIn: '09:00',
      timeOut: '17:00',
      breakHours: String(emp.breakHours || 0),
      branchId: emp.branchId || 'main',
      notes: ''
    });
  };

  const handleOpenEditShift = (shift) => {
    setEditingShiftModal({
      isNew: false,
      shift,
      date: shift.date || getRealTodayStr(),
      timeIn: shift.timeIn && shift.timeIn !== '—' ? shift.timeIn.slice(0, 5) : '09:00',
      timeOut: shift.timeOut && shift.timeOut !== '—' ? shift.timeOut.slice(0, 5) : '17:00',
      breakHours: String(shift.breakHours || 0),
      branchId: shift.branchId || emp.branchId || 'main',
      notes: shift.notes || shift.note || ''
    });
  };

  const handleSaveShiftModal = async (e) => {
    e.preventDefault();
    if (!editingShiftModal) return;

    const { isNew, shift, date, timeIn, timeOut, breakHours, branchId, notes } = editingShiftModal;

    // 🛡️ التحقق الاحترافي من عدم تكرار الوردية لنفس الفرع ومنع أي تداخل زمني
    const conflictResult = checkShiftConflicts({
      employeeId: emp.id,
      employeeCode: emp.code,
      branchId: branchId || emp.branchId || 'main',
      branchName: (state.branches || []).find((b) => isBranchMatch(branchId || emp.branchId, b))?.name,
      date,
      timeIn,
      timeOut,
      excludeShiftId: isNew ? null : shift?.id,
      shifts: state?.shifts || [],
      branches: state?.branches || []
    });

    if (conflictResult.hasConflict) {
      showToast?.(`⚠️ ${conflictResult.message}`);
      return;
    }

    setEditingShiftModal(null);

    // حساب الساعات
    const [inH, inM] = (timeIn || '09:00').split(':').map(Number);
    const [outH, outM] = (timeOut || '17:00').split(':').map(Number);
    let diff = (outH + (outM || 0) / 60) - (inH + (inM || 0) / 60);
    if (diff <= 0) diff += 24;
    const bH = parseFloat(breakHours) || 0;
    const netH = Math.max(0, Math.round((diff - bH) * 100) / 100);

    const profileHours = parseFloat(emp.workHoursPerDay) || 8;
    const otHours = netH > profileHours ? Math.round((netH - profileHours) * 100) / 100 : 0;
    const regHours = Math.min(netH, profileHours);

    const targetShiftId = isNew ? `shift_manual_${emp.id}_${Date.now()}` : shift.id;
    const updatedShiftObj = {
      ...(shift || {}),
      id: targetShiftId,
      employeeId: emp.id,
      employeeCode: emp.code || '',
      employeeName: emp.name || '',
      date,
      timeIn,
      timeOut,
      breakHours: bH,
      hours: netH,
      workHours: netH,
      netHours: netH,
      regularHours: regHours,
      overtimeHours: otHours,
      overtimeStatus: otHours > 0 ? 'approved' : 'none',
      adminApproved: true,
      branchId: branchId || emp.branchId || 'main',
      isManualPunch: true,
      manualPunchStatus: 'approved',
      note: notes || (isNew ? 'بصمة يدوية معتمدة من السجل الشامل' : 'بصمة معدلة من السجل الشامل'),
      updatedAt: new Date().toISOString()
    };

    let updatedShifts = [...(state?.shifts || [])];
    if (isNew) {
      updatedShifts = [updatedShiftObj, ...updatedShifts];
    } else {
      updatedShifts = updatedShifts.map((s) => (s.id === targetShiftId ? updatedShiftObj : s));
    }

    const nextState = { ...state, shifts: updatedShifts };

    // إعادة حساب التأخير لدورة الشهر
    try {
      recalculateEmployeeCycleLateness({
        employeeId: emp.id,
        cycleFilterFn: activeCycleFilter,
        state: nextState,
        payrollCycleId: selectedMonth
      });
    } catch (err) {
      console.warn('Recalculate lateness error:', err);
    }

    await commitStateChange(
      nextState,
      isNew ? '✅ تم إضافة البصمة اليدوية بنجاح' : '✅ تم تعديل وحفظ بيانات الوردية بنجاح',
      'shifts',
      updatedShifts
    );
  };

  const handleDeleteShift = async (shiftId) => {
    const isConfirmed = await showConfirm({
      title: 'حذف الوردية من سجل البصمات',
      message: 'هل أنت متأكد من حذف هذه الوردية نهائياً من سجل الموظف؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;

    const updatedShifts = (state?.shifts || []).filter((s) => s.id !== shiftId);
    const existingDeletedSet = new Set(Array.isArray(state?._deletedIds) ? state._deletedIds.map(String) : []);
    existingDeletedSet.add(String(shiftId));
    existingDeletedSet.add(`shift_${shiftId}`);
    const updatedDeletedIds = Array.from(existingDeletedSet);

    const nextState = { ...state, shifts: updatedShifts, _deletedIds: updatedDeletedIds };
    await commitStateChange(nextState, '🗑️ تم حذف الوردية بنجاح', 'shifts', updatedShifts);
    try {
      await apiSaveSettingsSlice('_deletedIds', updatedDeletedIds);
    } catch (sliceErr) {
      console.warn('[EmployeeDossier] Failed to save _deletedIds slice:', sliceErr);
    }
  };

  // ── ب. دوال الجدول الشهري (Roster Editing) ──
  const handleOpenEditRosterDay = (dayItem) => {
    const currentSched = dayItem.schedule || { start: '08:00', end: '16:00', hours: 8, isOff: false };
    setEditingRosterDayModal({
      dayName: dayItem.dayName,
      dateStr: dayItem.date,
      type: dayItem.isOff ? 'off' : 'shift',
      start: currentSched.start || '08:00',
      end: currentSched.end || '16:00',
      hours: currentSched.hours || empWorkHours,
      isOff: Boolean(dayItem.isOff)
    });
  };

  const handleSaveRosterDayModal = async (e) => {
    e.preventDefault();
    if (!editingRosterDayModal) return;

    const { dateStr, dayName, type, start, end, hours } = editingRosterDayModal;
    setEditingRosterDayModal(null);

    const isOff = type === 'off';
    const dayEntry = {
      type: isOff ? 'off' : 'shift',
      isOff,
      start: isOff ? '' : start,
      end: isOff ? '' : end,
      hours: isOff ? 0 : (parseFloat(hours) || empWorkHours)
    };

    // جلب أو إنشاء سجل الرستر للموظف والشهر
    const currentRosterList = [...(state?.rosters || [])];
    const rosterIdx = currentRosterList.findIndex(
      (r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) && r.month === selectedMonth
    );

    let updatedRoster;
    if (rosterIdx >= 0) {
      const existing = currentRosterList[rosterIdx];
      const updatedSchedule = { ...(existing.schedule || {}) };
      // حفظ بالتاريخ الدقيق وأيضاً باسم اليوم
      if (dateStr) updatedSchedule[dateStr] = dayEntry;
      if (dayName) updatedSchedule[dayName] = dayEntry;
      updatedRoster = {
        ...existing,
        schedule: updatedSchedule,
        updatedAt: new Date().toISOString()
      };
      currentRosterList[rosterIdx] = updatedRoster;
    } else {
      updatedRoster = {
        id: `roster_${emp.id}_${selectedMonth}`,
        employeeId: emp.id,
        employeeCode: emp.code || '',
        month: selectedMonth,
        status: 'approved',
        adminApproved: true,
        schedule: {
          ...DEFAULT_WEEKLY_SCHEDULE,
          ...(dateStr ? { [dateStr]: dayEntry } : {}),
          ...(dayName ? { [dayName]: dayEntry } : {})
        },
        createdAt: new Date().toISOString()
      };
      currentRosterList.push(updatedRoster);
    }

    const nextState = { ...state, rosters: currentRosterList };
    await commitStateChange(nextState, `✅ تم تحديث جدول يوم (${dayName} ${dateStr}) بنجاح`, 'rosters', currentRosterList);
  };

  const handleApplyBatchWeeklyRoster = async () => {
    setShowRosterBatchModal(false);
    const currentRosterList = [...(state?.rosters || [])];
    const rosterIdx = currentRosterList.findIndex(
      (r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) && r.month === selectedMonth
    );

    const newRosterObj = {
      id: `roster_${emp.id}_${selectedMonth}`,
      employeeId: emp.id,
      employeeCode: emp.code || '',
      month: selectedMonth,
      status: 'approved',
      adminApproved: true,
      schedule: { ...batchWeeklyRoster },
      updatedAt: new Date().toISOString()
    };

    if (rosterIdx >= 0) {
      currentRosterList[rosterIdx] = { ...currentRosterList[rosterIdx], schedule: { ...batchWeeklyRoster } };
    } else {
      currentRosterList.push(newRosterObj);
    }

    const nextState = { ...state, rosters: currentRosterList };
    await commitStateChange(nextState, '✅ تم تعميم وتطبيق الجدول الأسبوعي على كامل دورة الشهر بنجاح', 'rosters', currentRosterList);
  };

  // ── ج. دوال المكافآت والخصومات (Adjustments CRUD) ──
  const handleOpenAddAdjustment = (type = 'bonus') => {
    setAdjustmentModal({
      isNew: true,
      adj: null,
      type,
      amount: '',
      date: getRealTodayStr(),
      reason: ''
    });
  };

  const handleOpenEditAdjustment = (adj) => {
    setAdjustmentModal({
      isNew: false,
      adj,
      type: adj.type || 'bonus',
      amount: String(adj.amount || ''),
      date: adj.date || getRealTodayStr(),
      reason: adj.reason || adj.notes || ''
    });
  };

  const handleSaveAdjustmentModal = async (e) => {
    e.preventDefault();
    if (!adjustmentModal) return;

    const { isNew, adj, type, amount, date, reason } = adjustmentModal;
    setAdjustmentModal(null);

    const amtNum = parseFloat(amount) || 0;
    if (amtNum <= 0) {
      showToast?.('⚠️ يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }

    const targetId = isNew ? `adj_${Date.now()}` : adj.id;
    const newAdjObj = {
      ...(adj || {}),
      id: targetId,
      employeeId: emp.id,
      employeeName: emp.name || '',
      employeeCode: emp.code || '',
      branchId: emp.branchId || 'main',
      type,
      amount: amtNum,
      date,
      reason: reason || (type === 'bonus' ? 'مكافأة إدارية' : 'خصم إداري'),
      createdAt: adj?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByName: 'الإدارة العليا'
    };

    let updatedAdjs = [...(state?.adjustments || [])];
    if (isNew) {
      updatedAdjs = [newAdjObj, ...updatedAdjs];
    } else {
      updatedAdjs = updatedAdjs.map((a) => (a.id === targetId ? newAdjObj : a));
    }

    const nextState = { ...state, adjustments: updatedAdjs };
    await commitStateChange(
      nextState,
      type === 'bonus' ? '🎁 تم حفظ المكافأة بنجاح' : '🔻 تم حفظ الخصم الإداري بنجاح',
      'adjustments',
      updatedAdjs
    );
  };

  const handleDeleteAdjustment = async (adjId) => {
    const isConfirmed = await showConfirm({
      title: 'حذف المكافأة / الخصم',
      message: 'هل أنت متأكد من حذف هذا البند من سجل الموظف؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'تراجع',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;

    const updatedAdjs = (state?.adjustments || []).filter((a) => a.id !== adjId);
    const updatedReqs = (state?.requests || []).filter((r) => r.id !== adjId);
    const nextState = { ...state, adjustments: updatedAdjs, requests: updatedReqs };
    await commitStateChange(nextState, '🗑️ تم الحذف بنجاح', 'adjustments', updatedAdjs);
  };

  // ── د. دوال الجزاءات وتوثيق الجزاءات والإلغاء (Penalties Hub) ──
  const handleOpenAddPenalty = () => {
    setNewPenaltyModal({
      date: getRealTodayStr(),
      category: 'مخالفة تعليمات العمل',
      impactType: 'deduction_days', // 'deduction_days' | 'fixed_amount'
      impactVal: '0.5',
      branchId: emp.branchId || 'main',
      reason: '',
      notes: ''
    });
  };

  const handleSaveNewPenalty = async (e) => {
    e.preventDefault();
    if (!newPenaltyModal) return;

    const { date, category, impactType, impactVal, branchId, reason, notes } = newPenaltyModal;
    setNewPenaltyModal(null);

    let calculatedAmount = 0;
    if (impactType === 'deduction_days') {
      const days = parseFloat(impactVal) || 0.5;
      calculatedAmount = Math.round(empDailyRate * days * 100) / 100;
    } else {
      calculatedAmount = parseFloat(impactVal) || 0;
    }

    const penaltyReqId = `req_pen_${Date.now()}`;
    const newPenaltyRequest = {
      id: penaltyReqId,
      employeeId: emp.id,
      employeeName: emp.name || '',
      employeeCode: emp.code || '',
      branchId: branchId || emp.branchId || 'main',
      type: 'penalty',
      subType: 'disciplinary_penalty',
      category: category || 'جزاء إداري تأديبي',
      amount: calculatedAmount,
      impactType,
      impactVal: parseFloat(impactVal) || 1,
      daysDeducted: impactType === 'deduction_days' ? parseFloat(impactVal) : 0,
      date,
      reason: reason || category,
      ruleTitle: category,
      notes: notes || reason,
      status: 'approved',
      adminApproved: true,
      createdAt: new Date().toISOString(),
      createdBy: 'الإدارة العليا'
    };

    const updatedRequests = [newPenaltyRequest, ...(state?.requests || [])];
    const nextState = { ...state, requests: updatedRequests };

    await commitStateChange(
      nextState,
      `⚖️ تم توثيق واحتساب الجزاء الإداري بنجاح (${fmt(calculatedAmount)} ج.م)`,
      'requests',
      updatedRequests
    );
  };

  // تأكيد إلغاء الجزاء / الإعفاء
  const handleConfirmWaivePenalty = async (e) => {
    e.preventDefault();
    if (!waivePenaltyModal) return;

    const { penaltyItem, reason } = waivePenaltyModal;
    setWaivePenaltyModal(null);

    const waiveReasonText = reason?.trim() || 'إعفاء واستثناء بقرار من الإدارة العليا';

    let updatedRequests = [...(state?.requests || [])];
    let updatedLateIncidents = [...(state?.lateIncidents || [])];

    if (penaltyItem.sourceType === 'late_incident') {
      // تعديل أو وسم واقعة التأخير بالإلغاء
      updatedLateIncidents = updatedLateIncidents.map((inc) => {
        if (inc.id === penaltyItem.id) {
          return {
            ...inc,
            status: 'cancelled',
            isCancelled: true,
            waived: true,
            actionType: 'grace',
            actionLabel: `سماح (تم إلغاء الجزاء)`,
            deductionMinutes: 0,
            deductionHours: 0,
            penaltyAmount: 0,
            cancellationReason: waiveReasonText,
            waivedAt: new Date().toISOString()
          };
        }
        return inc;
      });
    } else {
      // تعديل الجزاء الإداري في requests
      updatedRequests = updatedRequests.map((r) => {
        if (r.id === penaltyItem.id) {
          return {
            ...r,
            status: 'cancelled',
            isCancelled: true,
            waived: true,
            cancellationReason: waiveReasonText,
            waivedAt: new Date().toISOString(),
            amount: 0
          };
        }
        return r;
      });
    }

    const nextState = {
      ...state,
      requests: updatedRequests,
      lateIncidents: updatedLateIncidents
    };

    // إعادة حساب التأخيرات لدورة الشهر بعد الإلغاء
    try {
      recalculateEmployeeCycleLateness({
        employeeId: emp.id,
        cycleFilterFn: activeCycleFilter,
        state: nextState,
        payrollCycleId: selectedMonth
      });
    } catch (err) {
      console.warn('Lateness recalc error on waive:', err);
    }

    await commitStateChange(
      nextState,
      `✅ تم إلغاء الجزاء وإسقاط الخصم المالي بنجاح (${waiveReasonText})`,
      penaltyItem.sourceType === 'late_incident' ? 'lateIncidents' : 'requests',
      penaltyItem.sourceType === 'late_incident' ? updatedLateIncidents : updatedRequests
    );
  };

  // تعديل قيمة الجزاء
  const handleSaveEditPenalty = async (e) => {
    e.preventDefault();
    if (!editPenaltyModal) return;

    const { penaltyItem, amount, reason } = editPenaltyModal;
    setEditPenaltyModal(null);

    const newAmt = parseFloat(amount) || 0;

    let updatedRequests = [...(state?.requests || [])];
    let updatedLateIncidents = [...(state?.lateIncidents || [])];

    if (penaltyItem.sourceType === 'late_incident') {
      updatedLateIncidents = updatedLateIncidents.map((inc) => {
        if (inc.id === penaltyItem.id) {
          return {
            ...inc,
            penaltyAmount: newAmt,
            notes: reason || inc.notes,
            overrideReason: reason || inc.overrideReason,
            status: 'overridden'
          };
        }
        return inc;
      });
    } else {
      updatedRequests = updatedRequests.map((r) => {
        if (r.id === penaltyItem.id) {
          return {
            ...r,
            amount: newAmt,
            reason: reason || r.reason,
            notes: reason || r.notes
          };
        }
        return r;
      });
    }

    const nextState = { ...state, requests: updatedRequests, lateIncidents: updatedLateIncidents };
    await commitStateChange(nextState, '✅ تم تعديل قيمة الجزاء بنجاح');
  };

  // ── هـ. دوال تقييمات الأداء (Evaluations) ──
  const [newEvalModal, setNewEvalModal] = useState(false);
  const [evalMonth, setEvalMonth] = useState(selectedMonth);
  const [evalScore, setEvalScore] = useState('95');
  const [evalNotes, setEvalNotes] = useState('');

  const handleSaveEvaluation = async (e) => {
    e.preventDefault();
    setNewEvalModal(false);

    const newEval = {
      id: `eval_${emp.id}_${evalMonth}_${Date.now()}`,
      employeeId: emp.id,
      employeeName: emp.name || '',
      employeeCode: emp.code || '',
      month: evalMonth,
      date: getRealTodayStr(),
      score: parseFloat(evalScore) || 100,
      notes: evalNotes,
      createdAt: new Date().toISOString()
    };

    const updatedEvals = [newEval, ...(state?.evaluations || [])];
    const nextState = { ...state, evaluations: updatedEvals };
    await commitStateChange(nextState, '⭐ تم تسجيل واعتماد تقييم الأداء بنجاح', 'evaluations', updatedEvals);
  };

  // ── و. طباعة السجل العام الكامل للموظف (Print Master Dossier) ──
  const handlePrintMasterDossier = () => {
    try {
      const html = `
        <div style="font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; color: #0f172a;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 18px;">
            <div>
              <h1 style="margin: 0; font-size: 20px; color: #0f766e;">سجل الموظف العام الشامل - Dossier 360°</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">نظام الموارد البشرية وإدارة شؤون الموظفين</p>
            </div>
            <div style="text-align: left; font-size: 12px; color: #475569;">
              <div>تاريخ الطباعة: <strong>${getRealTodayStr()}</strong></div>
              <div>دورة الشهر: <strong>${selectedMonth}</strong></div>
            </div>
          </div>

          <!-- بطاقة التعريف الأساسية -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 12.5px;">
              <div>الاسم الرسمي: <strong>${emp.name}</strong></div>
              <div>اسم الشهرة: <strong>${emp.nickname || emp.name}</strong></div>
              <div>كود الموظف: <strong>${emp.code}</strong></div>
              <div>المسمى الوظيفي: <strong>${emp.jobTitle}</strong></div>
              <div>القسم: <strong>${emp.department || 'عام'}</strong></div>
              <div>الفرع: <strong>${getBranchName(emp.branchId)}</strong></div>
              <div>رقم الهاتف: <strong>${emp.phone || '—'}</strong></div>
              <div>الرقم القومي: <strong>${emp.nationalId || '—'}</strong></div>
              <div>تاريخ التعيين: <strong>${emp.hireDate || emp.hiring_date || '—'}</strong></div>
              <div>أجر الساعة: <strong>${fmt(empHourlyRate)} ج.م</strong></div>
              <div>ساعات اليوم: <strong>${empWorkHours} س</strong></div>
              <div>نظام الدوام: <strong>${isFlexibleSchedule ? 'دوام حر ومواعيد متغيرة' : 'جدول شهري مقيد'}</strong></div>
            </div>
          </div>

          <!-- ملخص المؤشرات الحيوية -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px;">
            <div style="border: 1px solid #86efac; background: #f0fdf4; padding: 10px; border-radius: 6px; text-align: center;">
              <span style="font-size: 11px; color: #166534; display: block;">ساعات عمل الدورة</span>
              <strong style="font-size: 16px; color: #15803d;">${fmt(cycleTotalWorkedHours)} س</strong>
            </div>
            <div style="border: 1px solid #93c5fd; background: #eff6ff; padding: 10px; border-radius: 6px; text-align: center;">
              <span style="font-size: 11px; color: #1e40af; display: block;">الراتب التقديري للدورة</span>
              <strong style="font-size: 16px; color: #1d4ed8;">${fmt(empCycleSummary?.netSalary || 0)} ج.م</strong>
            </div>
            <div style="border: 1px solid #fca5a5; background: #fef2f2; padding: 10px; border-radius: 6px; text-align: center;">
              <span style="font-size: 11px; color: #991b1b; display: block;">المديونية المتبقية</span>
              <strong style="font-size: 16px; color: #b91c1c;">${fmt(totalRemainingDebt)} ج.م</strong>
            </div>
            <div style="border: 1px solid #fde68a; background: #fefce8; padding: 10px; border-radius: 6px; text-align: center;">
              <span style="font-size: 11px; color: #854d0e; display: block;">رصيد الإجازات المتبقي</span>
              <strong style="font-size: 16px; color: #a16207;">${annualRemainingDays} يوم</strong>
            </div>
          </div>

          <!-- جدول البصمات الأخيرة -->
          <h3 style="font-size: 14px; color: #0f172a; margin: 16px 0 8px;">⏱️ سجل البصمات والورديات (${cycleEmpShifts.length} وردية):</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; margin-bottom: 18px;">
            <thead>
              <tr style="background: #e2e8f0;">
                <th style="padding: 6px; border: 1px solid #cbd5e1;">التاريخ</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">الفرع</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">الحضور</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">الانصراف</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">الساعات</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">الإضافي</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              ${cycleEmpShifts.slice(0, 31).map((s) => `
                <tr>
                  <td style="padding: 5px; border: 1px solid #e2e8f0;">${s.date}</td>
                  <td style="padding: 5px; border: 1px solid #e2e8f0;">${getBranchName(s.branchId)}</td>
                  <td style="padding: 5px; border: 1px solid #e2e8f0;">${s.timeIn || '—'}</td>
                  <td style="padding: 5px; border: 1px solid #e2e8f0;">${s.timeOut || '—'}</td>
                  <td style="padding: 5px; border: 1px solid #e2e8f0;">${fmt(getEffectiveShiftHours(s, state))} س</td>
                  <td style="padding: 5px; border: 1px solid #e2e8f0;">${s.overtimeHours > 0 ? '+' + fmt(s.overtimeHours) + ' س' : '—'}</td>
                  <td style="padding: 5px; border: 1px solid #e2e8f0;">${s.note || s.notes || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- جدول الجزاءات والخصومات -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px;">
            <div>
              <h4 style="margin: 0 0 6px; font-size: 13px; color: #991b1b;">⚖️ الجزاءات والمخالفات (${empPenalties.length}):</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: center;">
                <tr style="background: #fee2e2;">
                  <th style="padding: 4px; border: 1px solid #fca5a5;">التاريخ</th>
                  <th style="padding: 4px; border: 1px solid #fca5a5;">الواقعة</th>
                  <th style="padding: 4px; border: 1px solid #fca5a5;">الخصم</th>
                  <th style="padding: 4px; border: 1px solid #fca5a5;">الحالة</th>
                </tr>
                ${empPenalties.slice(0, 10).map((p) => `
                  <tr>
                    <td style="padding: 4px; border: 1px solid #fecaca;">${p.date}</td>
                    <td style="padding: 4px; border: 1px solid #fecaca;">${p.title}</td>
                    <td style="padding: 4px; border: 1px solid #fecaca; color: #dc2626;">${fmt(p.penaltyAmount)} ج.م</td>
                    <td style="padding: 4px; border: 1px solid #fecaca;">${p.isCancelled ? 'ملغى' : 'سارٍ'}</td>
                  </tr>
                `).join('')}
              </table>
            </div>

            <div>
              <h4 style="margin: 0 0 6px; font-size: 13px; color: #166534;">🎁 المكافآت والبدلات (${empAdjustments.length}):</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: center;">
                <tr style="background: #dcfce7;">
                  <th style="padding: 4px; border: 1px solid #86efac;">التاريخ</th>
                  <th style="padding: 4px; border: 1px solid #86efac;">النوع</th>
                  <th style="padding: 4px; border: 1px solid #86efac;">المبلغ</th>
                  <th style="padding: 4px; border: 1px solid #86efac;">البيان</th>
                </tr>
                ${empAdjustments.slice(0, 10).map((a) => `
                  <tr>
                    <td style="padding: 4px; border: 1px solid #bbf7d0;">${a.date}</td>
                    <td style="padding: 4px; border: 1px solid #bbf7d0;">${a.type === 'bonus' ? 'مكافأة' : 'خصم'}</td>
                    <td style="padding: 4px; border: 1px solid #bbf7d0; font-weight: bold; color: ${a.type === 'bonus' ? '#16a34a' : '#dc2626'};">${fmt(a.amount)} ج.م</td>
                    <td style="padding: 4px; border: 1px solid #bbf7d0;">${a.reason || '—'}</td>
                  </tr>
                `).join('')}
              </table>
            </div>
          </div>

          <!-- توقيعات الاعتماد -->
          <div style="margin-top: 30px; display: flex; justify-content: space-between; text-align: center; font-size: 12px; border-top: 1px dashed #cbd5e1; padding-top: 18px;">
            <div>توقيع الموظف للعلم: ............................</div>
            <div>مسؤول الموارد البشرية: ............................</div>
            <div>اعتماد الإدارة العليا: ............................</div>
          </div>
        </div>
      `;
      triggerDirectPrint(html, `سجل الموظف الشامل - ${emp.name}`);
    } catch (err) {
      console.error('Error printing master dossier:', err);
      window.print();
    }
  };

  // دوال إخلاء الطرف
  const handleUploadSignedDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    try {
      const isImage = file.type.startsWith('image/');
      const dataUrl = await compressImage(file, isImage ? 1400 : undefined, 0.85);
      const newDoc = {
        dataUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        notes: ''
      };
      if (onSaveSignedClearance) {
        await onSaveSignedClearance(emp.id, newDoc);
      }
    } catch (err) {
      console.error('Error uploading clearance doc:', err);
      showToast?.('❌ حدث خطأ أثناء رفع المستند');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteSignedDoc = async () => {
    const isConfirmed = await showConfirm({
      title: 'حذف مستند إخلاء الطرف',
      message: 'هل أنت متأكد من حذف مستند إخلاء الطرف المؤرشف؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;
    if (onSaveSignedClearance) {
      await onSaveSignedClearance(emp.id, null);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '1380px',
          width: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          padding: '24px',
          background: 'var(--bg, #f8fafc)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* ── HEADER BAR ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px', flexWrap: 'wrap', gap: '14px', flexShrink: 0 }}>
          {/* Employee Avatar & Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              className="emp-avatar-circle"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '26px',
                fontWeight: 'bold',
                flexShrink: 0,
                boxShadow: '0 4px 10px rgba(15,118,110,0.25)'
              }}
            >
              {emp.photoUrl ? (
                <img src={emp.photoUrl} alt={getEmpDisplayName(emp)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                getEmpDisplayName(emp)?.charAt(0) || '👤'
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontFamily: 'Cairo', fontWeight: 800, color: 'var(--text)' }}>
                  {getEmpDisplayName(emp)}
                </h2>
                {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                  <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                    الرسمي: {emp.name}
                  </span>
                )}
                <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                  كود: {emp.code}
                </span>

                {isTerminated ? (
                  <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                    🔴 تم إنهاء الخدمة / مستقيل
                  </span>
                ) : (
                  <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                    🟢 على رأس العمل
                  </span>
                )}

                {isFlexibleSchedule ? (
                  <span style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '3px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 'bold' }}>
                    🟣 مواعيد متغيرة (دوام حر)
                  </span>
                ) : (
                  <span style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', padding: '3px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 'bold' }}>
                    📋 جدول شهري مقيد
                  </span>
                )}
              </div>

              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span>💼 {emp.jobTitle || 'موظف'}</span>
                <span>🏢 {getBranchName(emp.branchId)}</span>
                {emp.department && <span>🏷️ قسم: {emp.department}</span>}
                {emp.phone && <span>📞 {emp.phone}</span>}
              </div>
            </div>
          </div>

          {/* Header Actions & Cycle Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* دورة الرواتب والشهور */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px 10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>📅 الدورة:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  color: 'var(--primary-dark)',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {availableCycleOptions.map((opt) => (
                  <option key={opt.month} value={opt.month}>
                    {opt.label} {opt.isCurrent ? '⭐' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handlePrintMasterDossier}
              title="طباعة التقرير والسجل العام الكامل للموظف"
              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 'bold', fontSize: '12.5px', padding: '7px 12px' }}
            >
              🖨️ طباعة السجل
            </button>

            {onOpenEditModal && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onOpenEditModal(emp)}
                title="تعديل الملف الشخصي والتعاقدي"
                style={{ fontSize: '12.5px', padding: '7px 12px' }}
              >
                ✏️ تعديل الملف
              </button>
            )}

            <button
              type="button"
              className="del-btn"
              onClick={onClose}
              title="إغلاق السجل"
              style={{ width: '34px', height: '34px', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── VITAL SIGNS PULSE BAR (4 Quick KPI Cards) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px', flexShrink: 0 }}>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>ساعات عمل دورة ({selectedMonth})</span>
              <strong style={{ fontSize: '17px', color: '#0f766e', fontWeight: 800 }}>{fmt(cycleTotalWorkedHours)} س</strong>
              {cycleTotalApprovedOtHours > 0 && (
                <span style={{ fontSize: '10.5px', color: '#16a34a', marginRight: '6px' }}>+{fmt(cycleTotalApprovedOtHours)} س إضافي</span>
              )}
            </div>
            <div style={{ fontSize: '24px' }}>⏱️</div>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>الراتب التقديري للدورة</span>
              <strong style={{ fontSize: '17px', color: '#1d4ed8', fontWeight: 800 }}>
                {fmt(empCycleSummary?.netSalary || 0)} ج.م
              </strong>
            </div>
            <div style={{ fontSize: '24px' }}>💵</div>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>المديونية المتبقية (سلف/أدوية)</span>
              <strong style={{ fontSize: '17px', color: totalRemainingDebt > 0 ? '#b91c1c' : '#15803d', fontWeight: 800 }}>
                {fmt(totalRemainingDebt)} ج.م
              </strong>
            </div>
            <div style={{ fontSize: '24px' }}>💳</div>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>رصيد الإجازات السنوي المتاح</span>
              <strong style={{ fontSize: '17px', color: '#854d0e', fontWeight: 800 }}>
                {annualRemainingDays} يوم
              </strong>
              <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginRight: '4px' }}>/ {annualTotalBalance} يوم</span>
            </div>
            <div style={{ fontSize: '24px' }}>🏖️</div>
          </div>
        </div>

        {/* ── TOP TABS NAVIGATION BAR ── */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '14px', overflowX: 'auto', flexShrink: 0 }}>
          {[
            { id: 'summary', label: '👤 البيانات والملف المالي', count: null },
            { id: 'shifts', label: '⏱️ سجل البصمات والورديات', count: activeShiftsToDisplay.length },
            { id: 'roster', label: '📅 الجدول الشهري', count: isFlexibleSchedule ? 'حر' : `${cycleDaysList.length} يوم` },
            { id: 'leaves', label: '🏖️ سجل الإجازات', count: empLeaves.length },
            { id: 'permissions', label: '⏰ سجل الاستئذانات', count: empPermissions.length },
            { id: 'loans', label: '💳 السلف والأدوية بالآجل', count: empLoans.length },
            { id: 'adjustments', label: '🎁 المكافآت والخصومات', count: empAdjustments.length },
            { id: 'penalties', label: '⚖️ سجل الجزاءات والمخالفات', count: activePenaltiesCount },
            { id: 'evaluations', label: '⭐ تقييمات الأداء', count: empEvaluations.length },
            { id: 'timeline', label: '🌟 الشريط الزمني 360°', count: timelineEvents.length },
            { id: 'settlement', label: '📜 المخالصة وإخلاء الطرف', count: finalSettlement ? '✅' : null }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === tab.id ? 'var(--primary, #0f766e)' : '#fff',
                color: activeTab === tab.id ? '#fff' : 'var(--text)',
                fontWeight: activeTab === tab.id ? 'bold' : '500',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: activeTab === tab.id ? '0 2px 8px rgba(15,118,110,0.25)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span
                  style={{
                    background: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                    color: activeTab === tab.id ? '#fff' : '#475569',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontSize: '10.5px',
                    fontWeight: 'bold'
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT BODY (SCROLLABLE AREA) ── */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 1: 👤 البيانات الشخصية والمالية والتعاقدية
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Notice for flexible schedule */}
              {isFlexibleSchedule && (
                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '12px', padding: '12px 16px', color: '#5b21b6', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }}>🟣</span>
                  <div>
                    <strong style={{ fontSize: '13.5px', display: 'block' }}>نظام دوام حر / مواعيد متغيرة للموظف:</strong>
                    <span style={{ fontSize: '12px', color: '#6d28d9' }}>
                      هذا الموظف غير مقيد بجدول شهري ثابت، ولا يُحتسب عليه أي جزاءات تأخير أو خروج مبكر تلقائية، ويتم احتساب ساعاته الإضافية بناءً على ساعات ملفه الشخصي التعاقدية ({empWorkHours} س/يوم).
                    </span>
                  </div>
                </div>
              )}

              {/* Grid Cards of Personal & Financial Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                {/* 1. Identity & Personal Details */}
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#0f766e', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    🪪 الهوية والبيانات الشخصية:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                    <div>الاسم الرسمي: <strong>{emp.name}</strong></div>
                    <div>اسم الشهرة: <strong>{emp.nickname || '—'}</strong></div>
                    <div>الرقم القومي: <strong>{emp.nationalId || emp.national_id || '—'}</strong></div>
                    <div>تاريخ الميلاد: <strong>{emp.birthDate || emp.birth_date || '—'}</strong></div>
                    <div>رقم الهاتف: <strong>{emp.phone || '—'}</strong></div>
                    <div>هاتف الطوارئ: <strong>{emp.emergencyPhone || emp.emergency_phone || '—'}</strong></div>
                    <div>المؤهل الدراسي: <strong>{emp.qualification || emp.education || '—'}</strong></div>
                    <div>الحالة الاجتماعية: <strong>{emp.maritalStatus || '—'}</strong></div>
                    <div style={{ gridColumn: '1 / -1' }}>العنوان: <strong>{emp.address || '—'}</strong></div>
                  </div>
                </div>

                {/* 2. Employment & Contract Info */}
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#0f766e', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    💼 البيانات الوظيفية والتعاقدية:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                    <div>المسمى الوظيفي: <strong>{emp.jobTitle}</strong></div>
                    <div>القسم: <strong>{emp.department || 'عام'}</strong></div>
                    <div>الفرع الرئيسي: <strong>{getBranchName(emp.branchId)}</strong></div>
                    <div>تاريخ التعيين: <strong>{emp.hireDate || emp.hiring_date || '—'}</strong></div>
                    <div>اسم المستخدم: <strong>{emp.username || '—'}</strong></div>
                    <div>الحالة الوظيفية: <strong>{isTerminated ? 'مستقيل' : 'على رأس العمل'}</strong></div>
                    {emp.driveFolderUrl && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        مجلد المستندات: <a href={emp.driveFolderUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 'bold' }}>📁 فتح مجلد Google Drive</a>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Financial Structure & Hourly Rate */}
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#0f766e', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    💵 الهيكل المالي وأجر الساعة:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                    <div>الراتب الأساسي / أجر الساعة: <strong style={{ color: '#0f766e' }}>{fmt(emp.salary)} ج.م</strong></div>
                    <div>أجر الساعة الفعلي: <strong>{fmt(empHourlyRate)} ج.م/ساعة</strong></div>
                    <div>ساعات العمل اليومية: <strong>{empWorkHours} ساعات</strong></div>
                    <div>أيام العمل الشهرية: <strong>{empWorkDays} يوماً</strong></div>
                    <div>ساعات البريك اليومية: <strong>{emp.breakHours || 0} ساعات</strong></div>
                    <div>أجر اليوم التقديري: <strong>{fmt(empDailyRate)} ج.م</strong></div>
                  </div>
                </div>

                {/* 4. Allowances & Additional Perks */}
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#0f766e', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    🎁 البدلات الثابتة والحوافز التعاقدية:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                    <div>بدل الإدارة: <strong>{fmt(emp.managementAllowance || 0)} ج.م</strong></div>
                    <div>بدل الانتقال: <strong>{fmt(emp.transportAllowance || 0)} ج.م</strong></div>
                    <div>بدل الحضور اليومي: <strong>{fmt(emp.dailyAllowanceAmount || 0)} ج.م/يوم</strong></div>
                    <div>
                      البدلات الإضافية المخصصة: <strong>{fmt(emp.extraAllowance || 0)} ج.م</strong>
                      {Array.isArray(emp.extraAllowances) && emp.extraAllowances.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '2px' }}>
                          ({emp.extraAllowances.map(a => `${a.title}: ${fmt(a.amount)} ج.م`).join(' + ')})
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 2: ⏱️ سجل البصمات والورديات مع التعديل
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'shifts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Header Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <strong style={{ fontSize: '14px' }}>⏱️ سجل الورديات:</strong>
                  <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '2px', borderRadius: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShiftsViewScope('cycle')}
                      style={{
                        border: 'none',
                        background: shiftsViewScope === 'cycle' ? '#fff' : 'transparent',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        color: shiftsViewScope === 'cycle' ? '#0f766e' : '#64748b'
                      }}
                    >
                      دورة ({selectedMonth}) [{cycleEmpShifts.length}]
                    </button>
                    <button
                      type="button"
                      onClick={() => setShiftsViewScope('all')}
                      style={{
                        border: 'none',
                        background: shiftsViewScope === 'all' ? '#fff' : 'transparent',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        color: shiftsViewScope === 'all' ? '#0f766e' : '#64748b'
                      }}
                    >
                      كامل السجل التاريخي [{allEmpShifts.length}]
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-start"
                  onClick={handleOpenAddShift}
                  style={{ background: '#0f766e', color: '#fff', fontSize: '12.5px', padding: '7px 14px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  ➕ إضافة بصمة يدوية معتمدة
                </button>
              </div>

              {/* Table of shifts */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', overflowX: 'auto' }}>
                {activeShiftsToDisplay.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>لا توجد ورديات مسجلة في هذا النطاق</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px' }}>التاريخ واليوم</th>
                        <th style={{ padding: '8px' }}>الفرع</th>
                        <th style={{ padding: '8px' }}>طريقة البصمة</th>
                        <th style={{ padding: '8px' }}>الحضور</th>
                        <th style={{ padding: '8px' }}>الانصراف</th>
                        <th style={{ padding: '8px' }}>البريك</th>
                        <th style={{ padding: '8px' }}>صافي الساعات</th>
                        <th style={{ padding: '8px' }}>الوقت الإضافي</th>
                        <th style={{ padding: '8px' }}>ملاحظات البصمة</th>
                        <th style={{ padding: '8px' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeShiftsToDisplay.map((s) => {
                        const meth = getPunchMethodDetails(s);
                        const effectiveH = getEffectiveShiftHours(s, state);
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px', fontWeight: 'bold' }}>
                              <div>{s.date}</div>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{arabicWeekday(s.date)}</span>
                            </td>
                            <td style={{ padding: '8px' }}>{getBranchName(s.branchId)}</td>
                            <td style={{ padding: '8px' }}>
                              <span style={{ background: meth.bg, color: meth.color, border: `1px solid ${meth.border}`, padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span>{meth.icon}</span>
                                <span>{meth.label}</span>
                              </span>
                            </td>
                            <td style={{ padding: '8px', fontWeight: 'bold', color: '#0f766e' }}>{s.timeIn || '—'}</td>
                            <td style={{ padding: '8px', fontWeight: 'bold', color: '#0369a1' }}>{s.timeOut || '—'}</td>
                            <td style={{ padding: '8px' }}>{s.breakHours ? `${s.breakHours} س` : '—'}</td>
                            <td style={{ padding: '8px', fontWeight: 800, color: '#0f172a' }}>{fmt(effectiveH)} س</td>
                            <td style={{ padding: '8px' }}>
                              {parseFloat(s.overtimeHours) > 0 ? (
                                <span style={{ color: '#16a34a', fontWeight: 'bold' }}>+{fmt(s.overtimeHours)} س</span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '8px', maxWidth: '200px', fontSize: '11px', color: '#64748b' }}>
                              {s.note || s.notes || '—'}
                            </td>
                            <td style={{ padding: '8px' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => handleOpenEditShift(s)}
                                  title="تعديل وقت وتفاصيل البصمة"
                                  style={{ padding: '4px 8px', fontSize: '11px' }}
                                >
                                  ✏️ تعديل
                                </button>
                                <button
                                  type="button"
                                  className="del-btn"
                                  onClick={() => handleDeleteShift(s.id)}
                                  title="حذف الوردية"
                                  style={{ padding: '4px 6px', fontSize: '11px' }}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 3: 📅 الجدول الشهري للموظف مع التعديل
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'roster' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Notice & Batch Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14.5px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📅 جدول مواعيد العمل لدورة شهر ({selectedMonth}):
                  </h4>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {cycleRange?.startDate} إلى {cycleRange?.endDate}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setBatchWeeklyRoster({ ...DEFAULT_WEEKLY_SCHEDULE, ...(resolvedRoster?.schedule || {}) });
                      setShowRosterBatchModal(true);
                    }}
                    style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', fontWeight: 'bold', fontSize: '12px', padding: '7px 12px' }}
                  >
                    ✏️ تخصيص وتعميم جدول أسبوعي كامل
                  </button>
                </div>
              </div>

              {/* Roster Days Calendar Matrix */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '8px' }}>التاريخ</th>
                      <th style={{ padding: '8px' }}>اليوم</th>
                      <th style={{ padding: '8px' }}>نوع اليوم</th>
                      <th style={{ padding: '8px' }}>مواعيد الوردية</th>
                      <th style={{ padding: '8px' }}>ساعات العمل المقررة</th>
                      <th style={{ padding: '8px' }}>تعديل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycleDaysList.map((d) => (
                      <tr key={d.date} style={{ borderBottom: '1px solid var(--border)', background: d.isOff ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{d.date}</td>
                        <td style={{ padding: '8px', fontWeight: '500' }}>{d.dayName}</td>
                        <td style={{ padding: '8px' }}>
                          {d.isOff ? (
                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              🛑 راحة أسبوعية
                            </span>
                          ) : (
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              🟢 وردية عمل
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', color: d.isOff ? '#94a3b8' : '#0f766e', fontWeight: d.isOff ? 'normal' : 'bold' }}>
                          {d.shiftTimeStr}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{d.hours} س</td>
                        <td style={{ padding: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleOpenEditRosterDay(d)}
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                          >
                            ✏️ تعديل
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 4: 🏖️ سجل الإجازات والرصيد
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'leaves' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Balance Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>رصيد الإجازات السنوي التعاقدي</span>
                  <strong style={{ fontSize: '20px', color: '#0f766e' }}>{annualTotalBalance} يوماً</strong>
                </div>
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>الإجازات المستهلكة المعتمدة</span>
                  <strong style={{ fontSize: '20px', color: '#ea580c' }}>{annualUsedDays} يوماً</strong>
                </div>
                <div style={{ background: '#fff', border: '1px solid #86efac', background: '#f0fdf4', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#166534', display: 'block' }}>الرصيد المتبقي المتاح</span>
                  <strong style={{ fontSize: '20px', color: '#15803d' }}>{annualRemainingDays} يوماً</strong>
                </div>
              </div>

              {/* Leaves Table */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', overflowX: 'auto' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>🏖️ سجل طلبات الإجازات ({empLeaves.length}):</h4>
                {empLeaves.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد إجازات مسجلة للموظف</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px' }}>نوع الإجازة</th>
                        <th style={{ padding: '8px' }}>من تاريخ</th>
                        <th style={{ padding: '8px' }}>إلى تاريخ</th>
                        <th style={{ padding: '8px' }}>عدد الأيام</th>
                        <th style={{ padding: '8px' }}>السبب</th>
                        <th style={{ padding: '8px' }}>الحالة</th>
                        <th style={{ padding: '8px' }}>المرفق الطبي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empLeaves.map((l, idx) => (
                        <tr key={l.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px', fontWeight: 'bold' }}>{l.type || 'إجازة اعتيادية'}</td>
                          <td style={{ padding: '8px' }}>{l.startDate || l.date || '—'}</td>
                          <td style={{ padding: '8px' }}>{l.endDate || l.date || '—'}</td>
                          <td style={{ padding: '8px', fontWeight: 'bold' }}>{l.daysCount || l.days || 1} يوم</td>
                          <td style={{ padding: '8px' }}>{l.reason || '—'}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ background: l.status === 'approved' || l.adminApproved ? '#dcfce7' : '#fee2e2', color: l.status === 'approved' || l.adminApproved ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              {l.status === 'approved' || l.adminApproved ? 'معتمدة' : (l.status || 'معلقة')}
                            </span>
                          </td>
                          <td style={{ padding: '8px' }}>
                            {l.attachmentUrl ? (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setPreviewDocModal({ url: l.attachmentUrl, name: 'مرفق الإجازة' })}
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                              >
                                📎 معاينة
                              </button>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 5: ⏰ سجل الاستئذانات والأذونات
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'permissions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px' }}>⏰ ساعات الاستئذان المستهلكة في دورة ({selectedMonth}):</h4>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>يتم تعويض الساعات في البصمة تلقائياً بدون خصم عند اعتماد الإذن</span>
                </div>
                <strong style={{ fontSize: '18px', color: '#0f766e' }}>{fmt(cycleUsedPermissionHours)} ساعة</strong>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', overflowX: 'auto' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>سجل الأذونات والاستئذانات ({empPermissions.length}):</h4>
                {empPermissions.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد استئذانات مسجلة</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px' }}>التاريخ</th>
                        <th style={{ padding: '8px' }}>نوع الإذن</th>
                        <th style={{ padding: '8px' }}>المدة بالساعات</th>
                        <th style={{ padding: '8px' }}>الفترة الزمنية</th>
                        <th style={{ padding: '8px' }}>السبب</th>
                        <th style={{ padding: '8px' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empPermissions.map((p, idx) => (
                        <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px' }}>{p.date}</td>
                          <td style={{ padding: '8px', fontWeight: 'bold' }}>{p.type}</td>
                          <td style={{ padding: '8px', fontWeight: 'bold', color: '#0f766e' }}>{p.hours || 1} س</td>
                          <td style={{ padding: '8px' }}>{p.startTime && p.endTime ? `${p.startTime} إلى ${p.endTime}` : '—'}</td>
                          <td style={{ padding: '8px' }}>{p.reason || '—'}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ background: p.status === 'approved' || p.adminApproved ? '#dcfce7' : '#fee2e2', color: p.status === 'approved' || p.adminApproved ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              {p.status === 'approved' || p.adminApproved ? 'معتمد' : (p.status || 'معلق')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 6: 💳 سجل السلف والأدوية بالآجل
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'loans' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>إجمالي أصل السلف والأدوية</span>
                  <strong style={{ fontSize: '18px', color: '#0f766e' }}>{fmt(totalOriginalLoans)} ج.م</strong>
                </div>
                <div style={{ background: '#fff', border: '1px solid #86efac', background: '#f0fdf4', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#166534', display: 'block' }}>إجمالي المبالغ المسددة</span>
                  <strong style={{ fontSize: '18px', color: '#15803d' }}>{fmt(totalPaidLoans)} ج.م</strong>
                </div>
                <div style={{ background: '#fff', border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#991b1b', display: 'block' }}>صافي المديونية المتبقية</span>
                  <strong style={{ fontSize: '18px', color: '#b91c1c' }}>{fmt(totalRemainingDebt)} ج.م</strong>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', overflowX: 'auto' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>سجل السلف النقدية ومسحوبات الأدوية بالآجل ({empLoans.length}):</h4>
                {empLoans.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد سلف أو مسحوبات أدوية مسجلة</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px' }}>النوع</th>
                        <th style={{ padding: '8px' }}>التاريخ</th>
                        <th style={{ padding: '8px' }}>المبلغ الأصلي</th>
                        <th style={{ padding: '8px' }}>المسدد</th>
                        <th style={{ padding: '8px' }}>المتبقي للسداد</th>
                        <th style={{ padding: '8px' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empLoans.map((l, idx) => {
                        const total = parseFloat(l.amount) || 0;
                        const paid = parseFloat(l.paidAmount) || 0;
                        const rem = Math.max(0, total - paid);
                        const isMeds = l.type === 'meds' || l.type === 'credit_medicine';
                        return (
                          <tr key={l.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px', fontWeight: 'bold' }}>
                              {isMeds ? '💊 أدوية بالآجل' : '💵 سلفة نقدية'}
                            </td>
                            <td style={{ padding: '8px' }}>{l.date || l.createdAt?.slice(0, 10)}</td>
                            <td style={{ padding: '8px' }}>{fmt(total)} ج.م</td>
                            <td style={{ padding: '8px', color: '#16a34a' }}>{fmt(paid)} ج.م</td>
                            <td style={{ padding: '8px', fontWeight: 'bold', color: rem > 0 ? '#b91c1c' : '#16a34a' }}>
                              {fmt(rem)} ج.م
                            </td>
                            <td style={{ padding: '8px' }}>
                              {rem <= 0 ? (
                                <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                                  ✅ مسدد بالكامل
                                </span>
                              ) : (
                                <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                                  🔴 متبقي مديونية
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 7: 🎁 سجل المكافآت والخصومات مع التعديل
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'adjustments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#166534', display: 'block' }}>إجمالي المكافآت والحوافز:</span>
                    <strong style={{ fontSize: '16px', color: '#15803d' }}>+{fmt(totalBonusesAmount)} ج.م</strong>
                  </div>
                  <div style={{ height: '30px', width: '1px', background: '#cbd5e1' }} />
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#991b1b', display: 'block' }}>إجمالي الخصومات الإدارية:</span>
                    <strong style={{ fontSize: '16px', color: '#b91c1c' }}>-{fmt(totalManualDeductionsAmount)} ج.م</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={() => handleOpenAddAdjustment('bonus')}
                    style={{ background: '#16a34a', color: '#fff', fontSize: '12px', padding: '7px 12px', borderRadius: '8px', fontWeight: 'bold' }}
                  >
                    ➕ إضافة مكافأة
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => handleOpenAddAdjustment('deduction')}
                    style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '12px', padding: '7px 12px', borderRadius: '8px', fontWeight: 'bold' }}
                  >
                    ➖ إضافة خصم إداري
                  </button>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', overflowX: 'auto' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>سجل المكافآت والخصومات ({empAdjustments.length}):</h4>
                {empAdjustments.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد مكافآت أو خصومات مسجلة</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px' }}>التاريخ</th>
                        <th style={{ padding: '8px' }}>النوع</th>
                        <th style={{ padding: '8px' }}>المبلغ</th>
                        <th style={{ padding: '8px' }}>البيان والسبب</th>
                        <th style={{ padding: '8px' }}>المسؤول</th>
                        <th style={{ padding: '8px' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empAdjustments.map((a) => (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px' }}>{a.date}</td>
                          <td style={{ padding: '8px' }}>
                            {a.type === 'bonus' ? (
                              <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                                🎁 مكافأة وحافز
                              </span>
                            ) : (
                              <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                                🔻 خصم إداري
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px', fontWeight: 800, color: a.type === 'bonus' ? '#16a34a' : '#dc2626' }}>
                            {a.type === 'bonus' ? '+' : '-'}{fmt(a.amount)} ج.م
                          </td>
                          <td style={{ padding: '8px' }}>{a.reason || '—'}</td>
                          <td style={{ padding: '8px', color: '#64748b' }}>{a.createdByName || 'الإدارة'}</td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => handleOpenEditAdjustment(a)}
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                              >
                                ✏️ تعديل
                              </button>
                              <button
                                type="button"
                                className="del-btn"
                                onClick={() => handleDeleteAdjustment(a.id)}
                                style={{ padding: '3px 6px', fontSize: '11px' }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 8: ⚖️ سجل الجزاءات والمخالفات مع التعديل وإلغاء الجزاء
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'penalties' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Header Action & Top KPI */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#991b1b', display: 'block' }}>إجمالي الجزاءات النشطة:</span>
                    <strong style={{ fontSize: '16px', color: '#b91c1c' }}>{activePenaltiesCount} واقعة (-{fmt(totalActivePenaltiesAmount)} ج.م)</strong>
                  </div>
                  <div style={{ height: '30px', width: '1px', background: '#cbd5e1' }} />
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#475569', display: 'block' }}>الجزاءات الملغاة والمعفى عنها:</span>
                    <strong style={{ fontSize: '16px', color: '#166534' }}>{empPenalties.filter(p => p.isCancelled).length} واقعة</strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-start"
                  onClick={handleOpenAddPenalty}
                  style={{ background: '#b91c1c', color: '#fff', fontSize: '12.5px', padding: '7px 14px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  ⚖️ توثيق جزاء إداري جديد للموظف
                </button>
              </div>

              {/* Penalties List Table */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', overflowX: 'auto' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>سجل الجزاءات التأديبية ووقائع التأخير ({empPenalties.length}):</h4>
                {empPenalties.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>سجل الموظف نظيف من الجزاءات والمخالفات 👍</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px' }}>التاريخ</th>
                        <th style={{ padding: '8px' }}>الفرع</th>
                        <th style={{ padding: '8px' }}>نوع الجزاء / الواقعة</th>
                        <th style={{ padding: '8px' }}>التأخير (دقيقة)</th>
                        <th style={{ padding: '8px' }}>الخصم المالي</th>
                        <th style={{ padding: '8px' }}>الإجراء اللائحي</th>
                        <th style={{ padding: '8px' }}>حالة الجزاء</th>
                        <th style={{ padding: '8px' }}>الملاحظات والسبب</th>
                        <th style={{ padding: '8px' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empPenalties.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: p.isCancelled ? '#f8fafc' : '#fff' }}>
                          <td style={{ padding: '8px', fontWeight: 'bold' }}>{p.date}</td>
                          <td style={{ padding: '8px' }}>{p.branchName}</td>
                          <td style={{ padding: '8px', fontWeight: 'bold' }}>{p.title}</td>
                          <td style={{ padding: '8px' }}>{p.deductionMinutes > 0 ? `${p.deductionMinutes} د` : '—'}</td>
                          <td style={{ padding: '8px', fontWeight: 800, color: p.isCancelled ? '#94a3b8' : '#dc2626' }}>
                            {p.isCancelled ? <del>{fmt(p.originalAmount)} ج.م</del> : `-${fmt(p.penaltyAmount)} ج.م`}
                          </td>
                          <td style={{ padding: '8px' }}>{p.actionLabel}</td>
                          <td style={{ padding: '8px' }}>
                            {p.isCancelled ? (
                              <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                                ⚪ ملغى / معفى
                              </span>
                            ) : (
                              <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                                🔴 سارٍ ومطبق
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px', fontSize: '11px', color: '#64748b', maxWidth: '220px' }}>
                            {p.isCancelled ? (
                              <span style={{ color: '#0369a1' }}>سبب الإلغاء: {p.cancellationReason || 'إعفاء'}</span>
                            ) : (
                              p.notes || '—'
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              {!p.isCancelled ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setWaivePenaltyModal({ penaltyItem: p, reason: '' })}
                                    style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                    title="إلغاء الجزاء وإسقاط الخصم المالي"
                                  >
                                    🚫 إلغاء الجزاء
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setEditPenaltyModal({ penaltyItem: p, amount: String(p.penaltyAmount), reason: p.notes })}
                                    style={{ padding: '4px 8px', fontSize: '11px' }}
                                    title="تعديل قيمة الخصم المالي للجزاء"
                                  >
                                    ✏️ تعديل
                                  </button>
                                </>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>✅ تم الإلغاء</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 9: ⭐ تقييمات الأداء ومؤشرات النجاح
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'evaluations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px' }}>⭐ متوسط تقييم الأداء العام للموظف:</h4>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>متوسط تقييمات الفترات المسجلة</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <strong style={{ fontSize: '20px', color: avgEvaluationScore >= 90 ? '#16a34a' : '#d97706' }}>
                    {avgEvaluationScore}%
                  </strong>
                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={() => setNewEvalModal(true)}
                    style={{ background: '#0f766e', color: '#fff', fontSize: '12px', padding: '7px 12px', borderRadius: '8px', fontWeight: 'bold' }}
                  >
                    ➕ تسجيل تقييم أداء جديد
                  </button>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>سجل التقييمات الشهرية ({empEvaluations.length}):</h4>
                {empEvaluations.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد تقييمات مسجلة</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {empEvaluations.map((ev, idx) => (
                      <div key={ev.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '13.5px' }}>الفترة / الشهر: {ev.month || ev.date}</span>
                          <span style={{ background: '#fef08a', color: '#854d0e', padding: '3px 12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px' }}>
                            ⭐ التقييم: {ev.score || ev.rating}%
                          </span>
                        </div>
                        {ev.notes && <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>ملاحظات المشرف: {ev.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 10: 🌟 الشريط الزمني الشامل 360° (Timeline Feed)
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'timeline' && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🌟 الشريط الزمني التفاعلي الموحد (360° Timeline Feed)
                  </h4>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    تسلسل زمني كرونولوجي يدمج كافة حركات الموظف (ورديات، استئذانات، إجازات، سلف، مكافآت، جزاءات)
                  </span>
                </div>
                <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                  {timelineEvents.length} حدث مسجل
                </span>
              </div>

              {timelineEvents.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>لا توجد أحداث مسجلة</p>
              ) : (
                <div style={{ position: 'relative', paddingRight: '24px', borderRight: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {timelineEvents.map((ev, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      {/* Node Bullet */}
                      <div
                        style={{
                          position: 'absolute',
                          right: '-32px',
                          top: '2px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#fff',
                          border: '2px solid #0f766e',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px'
                        }}
                      >
                        •
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '16px' }}>{ev.icon}</span>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>{ev.title}</strong>
                            <span style={{ fontSize: '11.5px', color: '#64748b' }}>({ev.date})</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>
                            {ev.detail}
                          </div>
                        </div>

                        {ev.badge && (
                          <span style={{ background: ev.badgeBg, color: ev.badgeColor, padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                            {ev.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 11: 📜 المخالصة والتصفية المالية وإخلاء الطرف
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'settlement' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {effectiveSettlement ? (
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '15px' }}>
                        📜 كشف المخالصة والتصفية المالية الرسمية:
                      </h3>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        تاريخ التصفية: <strong>{effectiveSettlement.terminationDate || effectiveSettlement.settlementDate || getRealTodayStr()}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const html = generateClearanceSlipHTML({
                            emp,
                            state,
                            terminationDate: effectiveSettlement.terminationDate || getRealTodayStr(),
                            effectiveReason: emp.terminationReason || 'مخالصة معتمدة',
                            clearanceNotes: emp.terminationNotes || '',
                            settlement: effectiveSettlement
                          });
                          triggerDirectPrint(html, `إخلاء طرف - ${emp.name}`);
                        } catch (err) {
                          console.error(err);
                          window.print();
                        }
                      }}
                      style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      🖨️ طباعة نموذج إخلاء الطرف والمخالصة
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px', borderRadius: '10px', fontSize: '12px' }}>
                      <div style={{ color: '#166534', fontWeight: 'bold', marginBottom: '6px' }}>➕ المستحقات المكتسبة: +{fmt(effectiveSettlement.totalEarnings)} ج.م</div>
                      <div>أجر الساعات الأساسية: <strong>{fmt(effectiveSettlement.totalBaseEarnings)} ج.م</strong></div>
                      {effectiveSettlement.totalOvertimeEarnings > 0 && <div>أجر الإضافي: <strong>+{fmt(effectiveSettlement.totalOvertimeEarnings)} ج.م</strong></div>}
                      {effectiveSettlement.totalBonus > 0 && <div>المكافآت: <strong>+{fmt(effectiveSettlement.totalBonus)} ج.م</strong></div>}
                    </div>

                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '10px', fontSize: '12px' }}>
                      <div style={{ color: '#991b1b', fontWeight: 'bold', marginBottom: '6px' }}>➖ الاستقطاعات والديون: -{fmt(effectiveSettlement.totalDeductions)} ج.م</div>
                      <div>مديونية السلف والأدوية: <strong>-{fmt(effectiveSettlement.totalRemainingLoansDebt)} ج.م</strong></div>
                      {effectiveSettlement.lateDeduction > 0 && <div>خصم التأخير: <strong>-{fmt(effectiveSettlement.lateDeduction)} ج.م</strong></div>}
                    </div>
                  </div>

                  <div style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: '#fff', padding: '12px 18px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
                    <span>صافي المخالصة والتصفية النهائية المستحقة:</span>
                    <span style={{ fontSize: '20px', fontWeight: 900 }}>{fmt(Math.abs(effectiveSettlement.netSettlement || 0))} ج.م</span>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', textAlign: 'center', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                  📄 لم يتم تسجيل مخالصة مالية مسبقة لهذا الموظف
                </div>
              )}

              {/* Clearance Doc Upload/Archiving */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '14px' }}>📑 مستند إخلاء الطرف الورقي الموقع والمؤرشف:</h4>
                {emp.signedClearanceDoc ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px' }}>📄</span>
                      <div>
                        <strong>{emp.signedClearanceDoc.fileName || 'إخلاء طرف موقع'}</strong>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>تم الرفع بتاريخ: {emp.signedClearanceDoc.uploadedAt?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" className="btn btn-ghost" onClick={() => setPreviewDocModal({ url: emp.signedClearanceDoc.dataUrl, name: 'إخلاء طرف موقع' })} style={{ fontSize: '11.5px' }}>
                        👁️ معاينة
                      </button>
                      <button type="button" className="del-btn" onClick={handleDeleteSignedDoc} style={{ fontSize: '11.5px', padding: '4px 8px' }}>
                        🗑️ حذف
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ border: '2px dashed #cbd5e1', padding: '20px', textAlign: 'center', borderRadius: '10px', background: '#f8fafc' }}>
                    <label className="btn btn-start" style={{ cursor: isUploadingDoc ? 'not-allowed' : 'pointer', background: '#0f766e', color: '#fff', fontWeight: 'bold', fontSize: '12.5px', padding: '8px 16px' }}>
                      {isUploadingDoc ? '⏳ جاري الرفع...' : '📁 رفع صورة إخلاء الطرف الموقع'}
                      <input type="file" accept="image/*,application/pdf" onChange={handleUploadSignedDoc} style={{ display: 'none' }} disabled={isUploadingDoc} />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DIALOGS FOR INLINE EDITING & CREATION
        ══════════════════════════════════════════════════════════════════════ */}

        {/* 1. EDIT / ADD SHIFT MODAL */}
        {editingShiftModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '460px', width: '92%', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f766e' }}>
                  {editingShiftModal.isNew ? '➕ إضافة بصمة / وردية يدوية معتمدة' : '✏️ تعديل بيانات الوردية والبصمة'}
                </h3>
                <button type="button" className="del-btn" onClick={() => setEditingShiftModal(null)}>✕</button>
              </div>

              <form onSubmit={handleSaveShiftModal} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>التاريخ:</label>
                  <input
                    type="date"
                    required
                    value={editingShiftModal.date}
                    onChange={(e) => setEditingShiftModal({ ...editingShiftModal, date: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>وقت الحضور:</label>
                    <input
                      type="time"
                      required
                      value={editingShiftModal.timeIn}
                      onChange={(e) => setEditingShiftModal({ ...editingShiftModal, timeIn: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>وقت الانصراف:</label>
                    <input
                      type="time"
                      required
                      value={editingShiftModal.timeOut}
                      onChange={(e) => setEditingShiftModal({ ...editingShiftModal, timeOut: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>ساعات البريك:</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={editingShiftModal.breakHours}
                      onChange={(e) => setEditingShiftModal({ ...editingShiftModal, breakHours: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>الفرع:</label>
                    <select
                      value={editingShiftModal.branchId}
                      onChange={(e) => setEditingShiftModal({ ...editingShiftModal, branchId: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>سبب التعديل / ملاحظات:</label>
                  <input
                    type="text"
                    placeholder="ملاحظات توثيق البصمة..."
                    value={editingShiftModal.notes}
                    onChange={(e) => setEditingShiftModal({ ...editingShiftModal, notes: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingShiftModal(null)}>إلغاء</button>
                  <button type="submit" className="btn btn-start" style={{ background: '#0f766e', color: '#fff', fontWeight: 'bold' }}>
                    حفظ واعتماد البصمة
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. EDIT ROSTER DAY MODAL */}
        {editingRosterDayModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '440px', width: '92%', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f766e' }}>
                  ✏️ تعديل وردية يوم ({editingRosterDayModal.dayName} {editingRosterDayModal.dateStr})
                </h3>
                <button type="button" className="del-btn" onClick={() => setEditingRosterDayModal(null)}>✕</button>
              </div>

              <form onSubmit={handleSaveRosterDayModal} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>نوع اليوم:</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="rosterDayType"
                        checked={editingRosterDayModal.type === 'shift'}
                        onChange={() => setEditingRosterDayModal({ ...editingRosterDayModal, type: 'shift' })}
                      />
                      🟢 وردية عمل
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="rosterDayType"
                        checked={editingRosterDayModal.type === 'off'}
                        onChange={() => setEditingRosterDayModal({ ...editingRosterDayModal, type: 'off' })}
                      />
                      🛑 راحة أسبوعية (Off Day)
                    </label>
                  </div>
                </div>

                {editingRosterDayModal.type === 'shift' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>بداية الوردية:</label>
                        <input
                          type="time"
                          required
                          value={editingRosterDayModal.start}
                          onChange={(e) => setEditingRosterDayModal({ ...editingRosterDayModal, start: e.target.value })}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>نهاية الوردية:</label>
                        <input
                          type="time"
                          required
                          value={editingRosterDayModal.end}
                          onChange={(e) => setEditingRosterDayModal({ ...editingRosterDayModal, end: e.target.value })}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>ساعات العمل المقررة:</label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={editingRosterDayModal.hours}
                        onChange={(e) => setEditingRosterDayModal({ ...editingRosterDayModal, hours: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingRosterDayModal(null)}>إلغاء</button>
                  <button type="submit" className="btn btn-start" style={{ background: '#0f766e', color: '#fff', fontWeight: 'bold' }}>
                    حفظ التعديل
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. BATCH WEEKLY ROSTER MODAL */}
        {showRosterBatchModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '640px', width: '94%', borderRadius: '16px', padding: '22px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f766e' }}>
                  📋 تخصيص وتعميم جدول الأسبوع على دورة شهر ({selectedMonth})
                </h3>
                <button type="button" className="del-btn" onClick={() => setShowRosterBatchModal(false)}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                {Object.keys(DEFAULT_WEEKLY_SCHEDULE).map((dayName) => {
                  const dayObj = batchWeeklyRoster[dayName] || { type: 'shift', start: '08:00', end: '16:00', hours: 8, isOff: false };
                  const isOff = dayObj.type === 'off' || dayObj.isOff;
                  return (
                    <div key={dayName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isOff ? '#f8fafc' : '#f0fdfa', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', width: '80px' }}>{dayName}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isOff}
                          onChange={(e) => {
                            const newIsOff = e.target.checked;
                            setBatchWeeklyRoster({
                              ...batchWeeklyRoster,
                              [dayName]: {
                                ...dayObj,
                                type: newIsOff ? 'off' : 'shift',
                                isOff: newIsOff,
                                start: newIsOff ? '' : (dayObj.start || '08:00'),
                                end: newIsOff ? '' : (dayObj.end || '16:00'),
                                hours: newIsOff ? 0 : (dayObj.hours || 8)
                              }
                            });
                          }}
                        />
                        راحة (Off)
                      </label>
                      {!isOff ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="time"
                            value={dayObj.start || '08:00'}
                            onChange={(e) => setBatchWeeklyRoster({
                              ...batchWeeklyRoster,
                              [dayName]: { ...dayObj, start: e.target.value }
                            })}
                            style={{ padding: '4px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
                          />
                          <span>إلى</span>
                          <input
                            type="time"
                            value={dayObj.end || '16:00'}
                            onChange={(e) => setBatchWeeklyRoster({
                              ...batchWeeklyRoster,
                              [dayName]: { ...dayObj, end: e.target.value }
                            })}
                            style={{ padding: '4px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
                          />
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#64748b' }}>يوم راحة أسبوعية</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowRosterBatchModal(false)}>إلغاء</button>
                <button type="button" className="btn btn-start" onClick={handleApplyBatchWeeklyRoster} style={{ background: '#0f766e', color: '#fff', fontWeight: 'bold' }}>
                  تطبيق وتعميم على جميع أيام الشهر
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. ADD / EDIT ADJUSTMENT MODAL (BONUS / DEDUCTION) */}
        {adjustmentModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '440px', width: '92%', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: adjustmentModal.type === 'bonus' ? '#16a34a' : '#dc2626' }}>
                  {adjustmentModal.isNew ? (adjustmentModal.type === 'bonus' ? '🎁 إضافة مكافأة / حافز' : '🔻 إضافة خصم إداري') : '✏️ تعديل البند المالي'}
                </h3>
                <button type="button" className="del-btn" onClick={() => setAdjustmentModal(null)}>✕</button>
              </div>

              <form onSubmit={handleSaveAdjustmentModal} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>النوع:</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="adjTypeRadio"
                        checked={adjustmentModal.type === 'bonus'}
                        onChange={() => setAdjustmentModal({ ...adjustmentModal, type: 'bonus' })}
                      />
                      🎁 مكافأة وحافز (+ج.م)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="adjTypeRadio"
                        checked={adjustmentModal.type === 'deduction'}
                        onChange={() => setAdjustmentModal({ ...adjustmentModal, type: 'deduction' })}
                      />
                      🔻 خصم إداري (-ج.م)
                    </label>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>المبلغ (ج.م):</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      placeholder="مثال: 150"
                      value={adjustmentModal.amount}
                      onChange={(e) => setAdjustmentModal({ ...adjustmentModal, amount: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>التاريخ:</label>
                    <input
                      type="date"
                      required
                      value={adjustmentModal.date}
                      onChange={(e) => setAdjustmentModal({ ...adjustmentModal, date: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>البيان والسبب:</label>
                  <input
                    type="text"
                    required
                    placeholder="سبب المكافأة أو الخصم..."
                    value={adjustmentModal.reason}
                    onChange={(e) => setAdjustmentModal({ ...adjustmentModal, reason: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setAdjustmentModal(null)}>إلغاء</button>
                  <button
                    type="submit"
                    className="btn btn-start"
                    style={{
                      background: adjustmentModal.type === 'bonus' ? '#16a34a' : '#dc2626',
                      color: '#fff',
                      fontWeight: 'bold'
                    }}
                  >
                    حفظ وتوثيق البند
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 5. ADD NEW DISCIPLINARY PENALTY MODAL (توثيق جزاء إداري جديد) */}
        {newPenaltyModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '480px', width: '92%', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#b91c1c' }}>
                  ⚖️ توثيق جزاء إداري جديد للموظف
                </h3>
                <button type="button" className="del-btn" onClick={() => setNewPenaltyModal(null)}>✕</button>
              </div>

              <form onSubmit={handleSaveNewPenalty} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>تاريخ الواقعة:</label>
                    <input
                      type="date"
                      required
                      value={newPenaltyModal.date}
                      onChange={(e) => setNewPenaltyModal({ ...newPenaltyModal, date: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>تصنيف المخالفة:</label>
                    <select
                      value={newPenaltyModal.category}
                      onChange={(e) => setNewPenaltyModal({ ...newPenaltyModal, category: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    >
                      <option value="مخالفة تعليمات العمل">مخالفة تعليمات العمل</option>
                      <option value="غياب بدون إذن مسبق">غياب بدون إذن مسبق</option>
                      <option value="تأخير غير مبرر عن الوردية">تأخير غير مبرر عن الوردية</option>
                      <option value="انصراف مبكر بدون إذن">انصراف مبكر بدون إذن</option>
                      <option value="إهمال في العهدة أو الدواء">إهمال في العهدة أو الدواء</option>
                      <option value="سلوك غير لائق أو مشادة">سلوك غير لائق أو مشادة</option>
                      <option value="عدم الالتزام بالزي الرسمي">عدم الالتزام بالزي الرسمي</option>
                      <option value="جزاء إداري مخصص">جزاء إداري مخصص</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>طريقة تطبيق الخصم:</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="penaltyImpactType"
                        checked={newPenaltyModal.impactType === 'deduction_days'}
                        onChange={() => setNewPenaltyModal({ ...newPenaltyModal, impactType: 'deduction_days', impactVal: '0.5' })}
                      />
                      خصم أيام عمل (يوم / نصف يوم)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="penaltyImpactType"
                        checked={newPenaltyModal.impactType === 'fixed_amount'}
                        onChange={() => setNewPenaltyModal({ ...newPenaltyModal, impactType: 'fixed_amount', impactVal: '100' })}
                      />
                      مبلغ مالي ثابت (ج.م)
                    </label>
                  </div>
                </div>

                {newPenaltyModal.impactType === 'deduction_days' ? (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                      عدد الأيام المخصومة (أجر اليوم: {fmt(empDailyRate)} ج.م):
                    </label>
                    <select
                      value={newPenaltyModal.impactVal}
                      onChange={(e) => setNewPenaltyModal({ ...newPenaltyModal, impactVal: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
                    >
                      <option value="0.25">ربع يوم (0.25 يوم = {fmt(empDailyRate * 0.25)} ج.م)</option>
                      <option value="0.5">نصف يوم (0.5 يوم = {fmt(empDailyRate * 0.5)} ج.م)</option>
                      <option value="1">يوم كامل (1 يوم = {fmt(empDailyRate)} ج.م)</option>
                      <option value="2">يومان (2 يوم = {fmt(empDailyRate * 2)} ج.م)</option>
                      <option value="3">ثلاثة أيام (3 أيام = {fmt(empDailyRate * 3)} ج.م)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>قيمة الخصم المالي الثابت (ج.م):</label>
                    <input
                      type="number"
                      step="10"
                      min="1"
                      required
                      placeholder="مثال: 150"
                      value={newPenaltyModal.impactVal}
                      onChange={(e) => setNewPenaltyModal({ ...newPenaltyModal, impactVal: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>تفاصيل الواقعة وسبب الجزاء:</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="شرح موجز لأسباب توقيع الجزاء..."
                    value={newPenaltyModal.reason}
                    onChange={(e) => setNewPenaltyModal({ ...newPenaltyModal, reason: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setNewPenaltyModal(null)}>إلغاء</button>
                  <button type="submit" className="btn btn-start" style={{ background: '#b91c1c', color: '#fff', fontWeight: 'bold' }}>
                    توثيق وتطبيق الجزاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 6. WAIVE PENALTY MODAL (إلغاء الجزاء / إعفاء) */}
        {waivePenaltyModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '440px', width: '92%', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0369a1' }}>
                  🚫 إلغاء الجزاء وإسقاط الخصم المالي
                </h3>
                <button type="button" className="del-btn" onClick={() => setWaivePenaltyModal(null)}>✕</button>
              </div>

              <form onSubmit={handleConfirmWaivePenalty} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 12px', fontSize: '12.5px' }}>
                  <div>الواقعة: <strong>{waivePenaltyModal.penaltyItem.title}</strong></div>
                  <div>التاريخ: <strong>{waivePenaltyModal.penaltyItem.date}</strong></div>
                  <div>قيمة الخصم المالي المسترد: <strong style={{ color: '#059669' }}>+{fmt(waivePenaltyModal.penaltyItem.originalAmount)} ج.م</strong></div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>سبب الإلغاء / الإعفاء (إلزامي للتوثيق):</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: عذر طبي مقبول / استثناء إداري / خطأ في البصمة..."
                    value={waivePenaltyModal.reason}
                    onChange={(e) => setWaivePenaltyModal({ ...waivePenaltyModal, reason: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setWaivePenaltyModal(null)}>تراجع</button>
                  <button type="submit" className="btn btn-start" style={{ background: '#0284c7', color: '#fff', fontWeight: 'bold' }}>
                    تأكيد إلغاء الجزاء وإسقاط الخصم
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 7. EDIT PENALTY AMOUNT MODAL */}
        {editPenaltyModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '420px', width: '92%', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f766e' }}>
                  ✏️ تعديل قيمة الجزاء المالي
                </h3>
                <button type="button" className="del-btn" onClick={() => setEditPenaltyModal(null)}>✕</button>
              </div>

              <form onSubmit={handleSaveEditPenalty} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>قيمة الخصم المالي (ج.م):</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={editPenaltyModal.amount}
                    onChange={(e) => setEditPenaltyModal({ ...editPenaltyModal, amount: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>ملاحظات التعديل:</label>
                  <input
                    type="text"
                    value={editPenaltyModal.reason}
                    onChange={(e) => setEditPenaltyModal({ ...editPenaltyModal, reason: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditPenaltyModal(null)}>إلغاء</button>
                  <button type="submit" className="btn btn-start" style={{ background: '#0f766e', color: '#fff', fontWeight: 'bold' }}>
                    حفظ التعديل
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 8. NEW EVALUATION MODAL */}
        {newEvalModal && (
          <div className="modal-backdrop" style={{ zIndex: 1350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '440px', width: '92%', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f766e' }}>
                  ⭐ تسجيل تقييم أداء جديد
                </h3>
                <button type="button" className="del-btn" onClick={() => setNewEvalModal(false)}>✕</button>
              </div>

              <form onSubmit={handleSaveEvaluation} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>الشهر:</label>
                    <input
                      type="month"
                      required
                      value={evalMonth}
                      onChange={(e) => setEvalMonth(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>نسبة التقييم (100%):</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="100"
                      required
                      value={evalScore}
                      onChange={(e) => setEvalScore(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>ملاحظات وتقييم المشرف:</label>
                  <textarea
                    rows={2}
                    placeholder="تقييم الأداء ونقاط التميز أو التطوير..."
                    value={evalNotes}
                    onChange={(e) => setEvalNotes(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setNewEvalModal(false)}>إلغاء</button>
                  <button type="submit" className="btn btn-start" style={{ background: '#0f766e', color: '#fff', fontWeight: 'bold' }}>
                    حفظ التقييم
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 9. DOCUMENT PREVIEW MODAL */}
        {previewDocModal && (
          <div className="modal-backdrop" style={{ zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '850px', width: '92%', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0 }}>{previewDocModal.name || 'معاينة المستند'}</h4>
                <button type="button" className="del-btn" onClick={() => setPreviewDocModal(null)}>✕</button>
              </div>
              <img src={previewDocModal.url} alt="معاينة" style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px' }} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
