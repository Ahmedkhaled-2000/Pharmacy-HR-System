import React, { useState, useEffect, useMemo } from 'react';
import { isApprovedPermissionForDate, getEffectiveShiftHours, getShiftHoursMetrics, recalculateEmployeeCycleLateness, reconcileEmployeeScheduleOrPunchChange } from '../../utils/latePenaltyEngine';
import { calcRawDurationMinutes, checkShiftConflicts, buildUnifiedAttendanceTimeline } from '../../utils/workHoursEngine';
import { getCycleDateRange, getActivePayrollMonth, buildCycleAttendanceTimeline, getCycleProgress } from '../../utils/periodEngine';
import { getEmployeeDaySchedule, findEmployeeRoster } from '../../utils/rosterEngine';
import { getRealTodayStr } from '../../utils/timeEngine';
import {
  getEmployeeManualPunchesCount,
  isShiftManualPunch,
  arabicWeekday,
  getPunchMethodDetails,
  getShiftStartEpoch,
  isEmployeeOnApprovedLeave,
  getEmployeeCurrentApprovedLeave
} from '../../utils/formatters';
import { useUI } from '../../context/UIContext';
import { isBranchMatch } from '../../utils/branchMatcher';
import { apiSaveSettingsSlice } from '../../utils/apiClient';
import { saveStateLocally, broadcastStateChange } from '../../utils/offlineSync';
import DayDetailsModal from './DayDetailsModal';

export default function AttendancePunchesModal({
  employee,
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  filterFn = null,
  monthPicker = null,
  setMonthPicker = null,
  filterMode = 'month',
  setFilterMode = null,
  customFrom = '',
  setCustomFrom = null,
  customTo = '',
  setCustomTo = null,
  stopShift,
  onClose
}) {
  const { showConfirm } = useUI();
  const [isStoppingShift, setIsStoppingShift] = useState(false);
  const [selectedDayDetails, setSelectedDayDetails] = useState(null);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');

  const [editingPunch, setEditingPunch] = useState(null);
  const [isAddingNewPunch, setIsAddingNewPunch] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [editBreakHours, setEditBreakHours] = useState('0');
  const [editBranchId, setEditBranchId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editApproveOvertime, setEditApproveOvertime] = useState(true);
  const [editDecouplePriorDayRequests, setEditDecouplePriorDayRequests] = useState(true);

  // 🛡️ معالج زر Escape المخصص والآمن لنافذة سجل البصمات (يمنع أي تداخل أو ضغط بالخطأ على أزرار الحذف)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (selectedDayDetails) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedDayDetails(null);
          return;
        }
        if (editingPunch || isAddingNewPunch) {
          e.preventDefault();
          e.stopPropagation();
          setEditingPunch(null);
          setIsAddingNewPunch(false);
          return;
        }
        if (typeof onClose === 'function') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedDayDetails, editingPunch, isAddingNewPunch, onClose]);

  // Default active cycle from orgSettings or fallback to current month
  const autoActiveCycle = useMemo(() => {
    return getActivePayrollMonth(state?.orgSettings);
  }, [state?.orgSettings]);

  // Local month state synced with parent props or local storage
  const [modalMonth, setModalMonth] = useState(() => {
    return monthPicker || autoActiveCycle || new Date().toISOString().slice(0, 7);
  });

  const [modalFilterMode, setModalFilterMode] = useState(() => {
    return filterMode || 'month';
  });

  useEffect(() => {
    if (monthPicker && monthPicker !== modalMonth) {
      setModalMonth(monthPicker);
    }
  }, [monthPicker]);

  useEffect(() => {
    if (filterMode && filterMode !== modalFilterMode) {
      setModalFilterMode(filterMode);
    }
  }, [filterMode]);

  const handleModalMonthChange = (newMonth) => {
    if (!newMonth) return;
    setModalMonth(newMonth);
    setModalFilterMode('month');
    if (typeof setMonthPicker === 'function') {
      setMonthPicker(newMonth);
    }
    if (typeof setFilterMode === 'function') {
      setFilterMode('month');
    }
  };

  const handleModalPrevMonth = () => {
    const [y, m] = (modalMonth || autoActiveCycle).split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) { prevM = 12; prevY = y - 1; }
    handleModalMonthChange(`${prevY}-${String(prevM).padStart(2, '0')}`);
  };

  const handleModalNextMonth = () => {
    const [y, m] = (modalMonth || autoActiveCycle).split('-').map(Number);
    let nextY = y;
    let nextM = m + 1;
    if (nextM > 12) { nextM = 1; nextY = y + 1; }
    handleModalMonthChange(`${nextY}-${String(nextM).padStart(2, '0')}`);
  };

  const handleModalCurrentCycle = () => {
    handleModalMonthChange(autoActiveCycle);
  };

  const handleModalToggleAll = () => {
    const nextMode = modalFilterMode === 'all' ? 'month' : 'all';
    setModalFilterMode(nextMode);
    if (typeof setFilterMode === 'function') {
      setFilterMode(nextMode);
    }
  };

  const modalCycleRange = useMemo(() => {
    return getCycleDateRange(modalMonth, state?.orgSettings);
  }, [modalMonth, state?.orgSettings]);

  if (!employee) return null;

  const activePeriodFilter = (d) => {
    if (!d) return false;
    if (modalFilterMode === 'all') return true;
    if (modalFilterMode === 'custom' && customFrom && customTo) {
      const dateStr = String(d).slice(0, 10);
      return dateStr >= customFrom && dateStr <= customTo;
    }
    const dateStr = String(d).slice(0, 10);
    return Boolean(
      modalCycleRange?.startDate &&
      modalCycleRange?.endDate &&
      dateStr >= modalCycleRange.startDate &&
      dateStr <= modalCycleRange.endDate
    );
  };

  const isCustom = (modalFilterMode === 'custom' || modalFilterMode === 'range') && customFrom && customTo;
  const periodLabel = modalFilterMode === 'all'
    ? 'كافة السجلات المسجلة (بدون تقييد)'
    : (isCustom ? `الفترة المخصصة: من ${customFrom} إلى ${customTo}` : (modalCycleRange?.label || `دورة شهر (${modalMonth})`));

  // فحص بصمة الحضور النشطة الحالية للموظف (Live Active Shift)
  const todayStrNow = typeof getRealTodayStr === 'function' ? getRealTodayStr() : new Date().toISOString().slice(0, 10);
  const approvedLeaveToday = getEmployeeCurrentApprovedLeave(employee, todayStrNow, state);
  const hasActualPunchToday = (state.shifts || []).some(s =>
    (String(s.employeeId) === String(employee.id) || String(s.employeeCode) === String(employee.code)) &&
    s.date === todayStrNow &&
    Boolean(s.timeIn && s.timeIn !== '—') &&
    s.status !== 'cancelled' && !s.isCancelled
  );
  const isSuppressedByLeave = Boolean(approvedLeaveToday && !hasActualPunchToday);

  const rawActiveShift =
    state.activeShifts?.[employee.id] ||
    state.activeShifts?.[String(employee.id)] ||
    (employee.code && state.activeShifts?.[employee.code]) ||
    (employee.code && state.activeShifts?.[String(employee.code)]) ||
    Object.values(state.activeShifts || {}).find(s =>
      s && (
        String(s.employeeId) === String(employee.id) ||
        (employee.code && (String(s.employeeId) === String(employee.code) || String(s.employeeCode) === String(employee.code)))
      )
    );

  const activeShift = isSuppressedByLeave ? null : rawActiveShift;
  const actEpoch = activeShift ? getShiftStartEpoch(activeShift) : 0;
  const isOvernightActive = Boolean(
    activeShift &&
    activeShift.date &&
    activeShift.date < todayStrNow &&
    actEpoch > 0 &&
    (Date.now() - actEpoch) < 30 * 3600 * 1000
  );
  const hasActiveShift = Boolean(!isSuppressedByLeave && activeShift && (activePeriodFilter(activeShift.date) || isOvernightActive));
  const activeElapsedHours = hasActiveShift && actEpoch > 0
    ? Math.max(0, Math.round(((Date.now() - actEpoch) / 3600000) * 10) / 10)
    : 0;

  const livePunch = hasActiveShift ? {
    id: activeShift.id || activeShift.shiftId || `active_${employee.id}_${activeShift.date}`,
    employeeId: employee.id,
    employeeCode: employee.code || '',
    employeeName: employee.name || '',
    branchId: activeShift.branchId || employee.branchId || '',
    date: activeShift.date,
    timeIn: activeShift.timeIn,
    timeOut: 'قيد العمل الآن',
    isLiveActive: true,
    isOvernight: isOvernightActive,
    hours: activeElapsedHours,
    netHours: activeElapsedHours,
    workHours: activeElapsedHours,
    breakHours: activeShift.breakHours || 0,
    note: isOvernightActive
      ? '🟢 وردية ليلية نشطة مستمرة حالياً (عابرة لمنتصف الليل)'
      : '🟢 وردية نشطة مستمرة حالياً (حضور حي)',
    statusLabel: isOvernightActive ? 'حضور حي 🌙 (عابر لمنتصف الليل)' : 'حضور حي',
    source: activeShift.source || 'kiosk'
  } : null;

  const rawMonthPunches = (state.shifts || []).filter((p) => {
    if (!p) return false;
    if (p.status === 'cancelled' || p.isCancelled) return false;
    const isRejectedPhoto = p.isRejectedPhoto || p.status === 'rejected_photo' || (typeof p.statusLabel === 'string' && p.statusLabel.includes('رفض الصورة'));
    if (!isRejectedPhoto && (p.status === 'rejected' || p.rejected || (typeof p.statusLabel === 'string' && (p.statusLabel.includes('ملغي') || p.statusLabel.includes('مرفوض'))))) {
      return false;
    }
    const pEmpId = String(p.employeeId || '');
    const pEmpCode = String(p.employeeCode || '');
    const eId = String(employee.id || '');
    const eCode = String(employee.code || '');
    const isMatch = (
      pEmpId === eId ||
      (eCode && pEmpId === eCode) ||
      (eCode && pEmpCode === eCode) ||
      (eId && pEmpCode === eId)
    );
    return isMatch && activePeriodFilter(p.date);
  });

  // إثراء الورديات الحية في القائمة بالساعات المنقضية الحية ووسم الورديات غير المكتملة السابقة بدقة
  const enrichedMonthPunches = rawMonthPunches.map(p => {
    // 🛡️ حماية صارمة للورديات المكتملة: لا يجوز أبداً أن تظهر كوردية حية أو معلقة
    if (p.status === 'completed' || p.isCompleted) {
      const schedH = parseFloat(p.scheduledHours || employee.workHoursPerDay || employee.workHours || 8);
      let resolvedTimeOut = p.timeOut;
      if (!resolvedTimeOut || resolvedTimeOut === '—' || resolvedTimeOut === '' || resolvedTimeOut === 'قيد العمل الآن') {
        if (p.timeIn && p.timeIn !== '—') {
          const [inH, inM] = String(p.timeIn).split(':').map(Number);
          if (!isNaN(inH)) {
            const outTotalMins = (inH * 60 + (inM || 0) + Math.round(schedH * 60)) % (24 * 60);
            resolvedTimeOut = `${String(Math.floor(outTotalMins / 60)).padStart(2, '0')}:${String(outTotalMins % 60).padStart(2, '0')}`;
          }
        }
      }
      return {
        ...p,
        isLiveActive: false,
        isStaleUnclosed: false,
        timeOut: resolvedTimeOut || '—',
        hours: (p.hours && p.hours > 0) ? p.hours : schedH,
        netHours: (p.netHours && p.netHours > 0) ? p.netHours : schedH,
        regularHours: (p.regularHours && p.regularHours > 0) ? p.regularHours : schedH,
        actualWorkedHours: (p.actualWorkedHours && p.actualWorkedHours > 0) ? p.actualWorkedHours : schedH,
        statusLabel: (p.statusLabel && !p.statusLabel.includes('قيد العمل')) ? p.statusLabel : 'حضور مكتمل'
      };
    }

    const hasTimeOut = Boolean(p.timeOut && p.timeOut !== '—' && p.timeOut !== '' && p.timeOut !== 'قيد العمل الآن');
    const pEpoch = getShiftStartEpoch(p);
    // صمام الأمان: الورديات المفتوحة لا تتجاوز 20 ساعة كحد أقصى تماشياً مع صمام أمان الـ 20 ساعة الموحد
    const isWithinSafetyValve = pEpoch > 0 && (Date.now() - pEpoch < 20 * 3600 * 1000);
    // الوردية تكون حية فقط إذا كانت غير مكتملة وضمن صمام الأمان (أقل من 20 ساعة)
    const isLiveNow = !hasTimeOut && !isSuppressedByLeave && isWithinSafetyValve && (p.isLiveActive || p.date === todayStrNow);
    const isStaleUnclosed = !hasTimeOut && !isLiveNow;

    if (isLiveNow) {
      const isNight = Boolean(p.isOvernight || (p.date && p.date < todayStrNow));
      const liveElapsed = pEpoch > 0
        ? Math.max(0, Math.round(((Date.now() - pEpoch) / 3600000) * 10) / 10)
        : activeElapsedHours;
      return {
        ...p,
        isLiveActive: true,
        isStaleUnclosed: false,
        isOvernight: isNight,
        timeOut: 'قيد العمل الآن',
        hours: p.hours || liveElapsed,
        netHours: p.netHours || liveElapsed
      };
    }

    if (isStaleUnclosed) {
      return {
        ...p,
        isLiveActive: false,
        isStaleUnclosed: true,
        timeOut: p.timeOut || 'غير مسجل'
      };
    }

    return {
      ...p,
      isLiveActive: false
    };
  });

  // فحص ما إذا كان السجل الحي موجوداً بالفعل لتجنب التكرار
  const alreadyHasLivePunch = enrichedMonthPunches.some(p => p.isLiveActive || (activeShift && p.date === activeShift.date && p.timeIn === activeShift.timeIn));
  const rawMonthCombined = (livePunch && !alreadyHasLivePunch) ? [livePunch, ...enrichedMonthPunches] : enrichedMonthPunches;

  // 🔄 ترتيب السجلات دائماً من الأحدث إلى الأقدم (Newest to Oldest) مع صمام تنقية التكرار للعرض
  const rawSortedPunches = [...rawMonthCombined].sort((a, b) => {
    // 1. الترتيب الأساسي والقطعي: حسب التاريخ من الأحدث إلى الأقدم (تنازلي)
    const dateA = String(a?.date || '').trim();
    const dateB = String(b?.date || '').trim();
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }

    // 2. في نفس اليوم: الوردية الحية النشطة تكون دائماً في القمة أولاً
    if (a?.isLiveActive && !b?.isLiveActive) return -1;
    if (!a?.isLiveActive && b?.isLiveActive) return 1;

    // 3. في نفس اليوم: تفضيل الوردية المعتمدة يدوياً
    const aManual = Boolean(a?.isManual || a?.manualPunch || a?.adminApproved);
    const bManual = Boolean(b?.isManual || b?.manualPunch || b?.adminApproved);
    if (aManual && !bManual) return -1;
    if (!aManual && bManual) return 1;

    // 4. في نفس اليوم: الترتيب حسب وقت الدخول من الأحدث إلى الأقدم (تنازلي)
    const timeA = String(a?.timeIn || '').trim();
    const timeB = String(b?.timeIn || '').trim();
    if (timeA !== timeB) {
      return timeB.localeCompare(timeA);
    }

    // 5. في حالة التطابق: الترتيب حسب وقت الإنشاء تنازلياً
    const createdA = String(a?.createdAt || a?.id || '');
    const createdB = String(b?.createdAt || b?.id || '');
    return createdB.localeCompare(createdA);
  });

  // 🛡️ صمام إزالة التكرار الذكي للعرض (Display Deduplication Guard):
  // منع تكرار نفس الوردية في نفس الفرع في نفس اليوم مع السماح بتعدد الفروع للموظف في نفس اليوم (بدون تعارض زمني)
  const monthPunches = useMemo(() => {
    const seenByShiftKey = new Map();

    const getCanonicalBranchKey = (shift) => {
      if (!shift) return 'default';
      const bObj = (state.branches || []).find((b) => isBranchMatch(shift.branchId, b) || (shift.branchName && b.name && shift.branchName.trim() === b.name.trim()));
      if (bObj?.id) return String(bObj.id);
      if (shift.branchId) return String(shift.branchId);
      if (shift.branchName) return String(shift.branchName).trim();
      return 'default';
    };

    rawSortedPunches.forEach(p => {
      if (!p || !p.date) return;
      const bKey = getCanonicalBranchKey(p);
      const pInPrefix = p.timeIn ? String(p.timeIn).slice(0, 5) : '';
      const key = p.id ? `id_${p.id}` : `${bKey}_${p.date}_${pInPrefix || 'shift'}`;

      // فحص ما إذا كان هناك سجل سابق لنفس الفرع واليوم يتطابق معه
      let matchedKey = null;
      for (const [k, existing] of seenByShiftKey.entries()) {
        const exBKey = getCanonicalBranchKey(existing);
        const isSameBranch = (bKey !== 'default' && exBKey !== 'default' && bKey === exBKey) ||
          (p.branchId && existing.branchId && String(p.branchId) === String(existing.branchId)) ||
          (p.branchName && existing.branchName && p.branchName.trim() === existing.branchName.trim());

        if (isSameBranch && existing.date === p.date) {
          // تطابق في نفس الفرع واليوم: فقط إذا تطابق المعرف أو توقيت الدخول
          const exInPrefix = existing.timeIn ? String(existing.timeIn).slice(0, 5) : '';
          const isSameId = Boolean(p.id && existing.id && String(p.id) === String(existing.id));
          const isSameTime = Boolean(pInPrefix && exInPrefix && pInPrefix === exInPrefix);
          if (isSameId || isSameTime) {
            matchedKey = k;
            break;
          }
        }
      }

      if (!matchedKey) {
        seenByShiftKey.set(key, p);
      } else {
        const existing = seenByShiftKey.get(matchedKey);
        // الوردية الحية لليوم الحالي لها أولوية قصوى
        if (p.isLiveActive && !existing.isLiveActive) {
          seenByShiftKey.set(matchedKey, p);
          return;
        }
        if (!p.isLiveActive && existing.isLiveActive) {
          return;
        }

        const pIsManual = Boolean(p.isManual || p.manualPunch || p.adminApproved || p.editedByAdmin);
        const exIsManual = Boolean(existing.isManual || existing.manualPunch || existing.adminApproved || existing.editedByAdmin);

        // إذا كان أحدهما يدوياً معتمداً من الإدارة: اليدوي المعتمد يفوز ويستبدل البيومتري القديم في نفس الفرع
        if (pIsManual && !exIsManual) {
          seenByShiftKey.set(matchedKey, p);
        } else if (!pIsManual && exIsManual) {
          // keep existing manual
        } else {
          // تفضيل من له وقت انصراف حقيقي ثم من له ساعات عمل أكبر وأصح
          const pHasOut = Boolean(p.timeOut && p.timeOut !== '—' && p.timeOut !== '' && p.timeOut !== 'غير مسجل' && p.timeOut !== 'قيد العمل الآن');
          const exHasOut = Boolean(existing.timeOut && existing.timeOut !== '—' && existing.timeOut !== '' && existing.timeOut !== 'غير مسجل' && existing.timeOut !== 'قيد العمل الآن');
          const pHrs = parseFloat(p.actualWorkedHours || p.hours || 0);
          const exHrs = parseFloat(existing.actualWorkedHours || existing.hours || 0);

          if (pHasOut && !exHasOut) {
            seenByShiftKey.set(matchedKey, p);
          } else if (pHrs > 0 && exHrs === 0) {
            seenByShiftKey.set(matchedKey, p);
          } else if (pHrs > exHrs) {
            seenByShiftKey.set(matchedKey, p);
          }
        }
      }
    });
    return Array.from(seenByShiftKey.values()).sort((a, b) => {
      const dateA = String(a?.date || '').trim();
      const dateB = String(b?.date || '').trim();
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(b?.timeIn || '').localeCompare(String(a?.timeIn || ''));
    });
  }, [rawSortedPunches, state.branches]);

  // ── بناء الخط الزمني الموحد لسجل البصمات (ورديات فعلية + إجازات معتمدة + أيام راحة مجدولة) ──
  const [timelineFilter, setTimelineFilter] = useState('all'); // 'all' | 'shifts' | 'leaves' | 'off_days' | 'past_absences' | 'future_scheduled'
  const [timelineSortOrder, setTimelineSortOrder] = useState('asc'); // 'asc' = بالتسلسل الزمني التصاعدي من بداية الشهر حتى اليوم (الافتراضي) | 'desc' = من الأحدث إلى الأقدم

  const attendanceTimeline = useMemo(() => {
    let range = null;
    if (modalFilterMode === 'all') {
      range = null;
    } else if ((modalFilterMode === 'custom' || modalFilterMode === 'range') && customFrom && customTo) {
      range = { startDate: customFrom, endDate: customTo };
    } else if (modalCycleRange) {
      range = modalCycleRange;
    }
    return buildCycleAttendanceTimeline(employee, monthPunches, state, {
      cycleRange: range,
      selectedMonth: modalMonth,
      monthPicker: modalMonth,
      filterMode: modalFilterMode,
      customFrom,
      customTo,
      activePeriodFilter,
      sortOrder: timelineSortOrder,
      includeFutureScheduled: timelineFilter === 'future_scheduled',
      includePastAbsences: timelineFilter === 'past_absences'
    });
  }, [employee, monthPunches, state, modalFilterMode, customFrom, customTo, modalCycleRange, activePeriodFilter, modalMonth, timelineSortOrder, timelineFilter]);

  const timelineCounts = useMemo(() => {
    if (attendanceTimeline?.counts) {
      return attendanceTimeline.counts;
    }
    let shifts = 0;
    let leaves = 0;
    let offDays = 0;
    let pastAbsences = 0;
    (attendanceTimeline || []).forEach((item) => {
      if (item.recordType === 'shift') shifts++;
      else if (item.recordType === 'leave') leaves++;
      else if (item.recordType === 'off_day') offDays++;
      else if (item.recordType === 'past_absence' || item.recordType === 'missing_shift') pastAbsences++;
    });
    return {
      all: attendanceTimeline.length,
      shifts,
      leaves,
      offDays,
      pastAbsences,
      futureDays: attendanceTimeline?.futureScheduledDays?.length || 0,
      cycleTotalDays: 30,
      cycleElapsedDays: 0,
      cycleRemainingDays: 0,
      progressPercent: 0
    };
  }, [attendanceTimeline]);

  const displayedTimeline = useMemo(() => {
    if (timelineFilter === 'shifts') {
      return attendanceTimeline.filter((item) => item.recordType === 'shift');
    }
    if (timelineFilter === 'leaves') {
      return attendanceTimeline.filter((item) => item.recordType === 'leave');
    }
    if (timelineFilter === 'off_days') {
      return attendanceTimeline.filter((item) => item.recordType === 'off_day');
    }
    if (timelineFilter === 'past_absences') {
      return attendanceTimeline.filter((item) => item.recordType === 'past_absence' || item.recordType === 'missing_shift');
    }
    if (timelineFilter === 'future_scheduled') {
      return attendanceTimeline.filter((item) => item.recordType === 'future_scheduled' || item.isFuture);
    }
    return attendanceTimeline;
  }, [attendanceTimeline, timelineFilter]);

  // استخراج الورديات الحية وغير المكتملة
  const unclosedLiveShift = enrichedMonthPunches.find(p => p.isLiveActive);
  const unclosedPastShift = enrichedMonthPunches.find(p => p.isStaleUnclosed);
  const showLiveBanner = Boolean(livePunch || unclosedLiveShift);
  const showLeaveBanner = Boolean(approvedLeaveToday && !showLiveBanner);
  const showPastUnclosedBanner = Boolean(unclosedPastShift && !showLiveBanner);

  // Group or process punches into rows
  const shiftsCount = monthPunches.length;

  // إنهاء الوردية الحية من البنر الرئيسي أو صف محدد في الجدول
  const handleStopShiftForRow = async (targetPunch) => {
    if (isStoppingShift) return;
    setIsStoppingShift(true);
    try {
      const p = targetPunch || unclosedLiveShift || unclosedPastShift || livePunch;
      if (!p) {
        showToast?.('⚠️ لم يتم العثور على وردية مفتوحة لإنهائها');
        setIsStoppingShift(false);
        return;
      }
      const todayStr = getRealTodayStr ? getRealTodayStr() : new Date().toISOString().slice(0, 10);
      const isPastDate = Boolean(p.date && p.date < todayStr && !p.isLiveActive);
      const empActualId = String(employee.id || '');
      const empCode = employee.code ? String(employee.code) : '';

      // 1. إذا كانت الوردية نشطة في activeShifts أو محرك الحضور، نحاول أولاً عبر stopShift الأساسي
      if (!isPastDate && typeof stopShift === 'function' && state.activeShifts && (state.activeShifts[employee.id] || state.activeShifts[empActualId] || (empCode && state.activeShifts[empCode]))) {
        try {
          const res = await stopShift(employee.id);
          if (res && res.success) {
            showToast?.('⏹ تم إنهاء وردية الموظف بنجاح وتسجيل وقت الانصراف');
            setIsStoppingShift(false);
            return;
          }
        } catch (stopErr) {
          console.warn('[AttendancePunchesModal] stopShift engine call failed, continuing to direct closure:', stopErr);
        }
      }

      // 2. معالجة وإنهاء الوردية المفتوحة مباشرة وتحديث shifts
      const nowStr = new Date().toTimeString().slice(0, 5);
      const schedH = parseFloat(p?.scheduledHours || employee.workHoursPerDay || employee.workHours || 8);
      let calculatedTimeOut = nowStr;

      if (p && p.timeIn && p.timeIn !== '—') {
        const [inH, inM] = String(p.timeIn || '09:00').split(':').map(Number);
        if (!isNaN(inH)) {
          let outTotalMins = (inH * 60 + (inM || 0) + Math.round(schedH * 60)) % (24 * 60);
          const outH = Math.floor(outTotalMins / 60);
          const outM = outTotalMins % 60;
          calculatedTimeOut = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
        } else {
          calculatedTimeOut = '17:00';
        }
      }

      const inTime = p?.timeIn || '09:00';
      const durMins = calcRawDurationMinutes(inTime, calculatedTimeOut, {
        startDate: p?.date,
        endDate: p?.timeOutDate || p?.date,
        isOvernight: p?.isOvernight
      });
      const bHours = parseFloat(p?.breakHours) || 0;
      const calcHours = Math.max(0, Math.round(((durMins / 60) - bHours) * 100) / 100);
      const profileHours = parseFloat(employee.workHoursPerDay || employee.workHours || 8);
      const regHours = Math.min(calcHours, profileHours);

      const targetShiftId = p?.id ? String(p.id) : '';
      let shiftUpdated = false;

      let updatedShifts = (state.shifts || []).map(s => {
        const isMatch = (targetShiftId && String(s.id) === targetShiftId) || (
          p && (String(s.employeeId) === empActualId || (empCode && (String(s.employeeCode) === empCode || String(s.employeeId) === empCode))) &&
          (s.date === p.date || (!s.timeOut && !s.date)) &&
          (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.timeOut === 'قيد العمل الآن' || s.isLiveActive)
        );
        if (isMatch) {
          shiftUpdated = true;
          return {
            ...s,
            timeOut: calculatedTimeOut,
            hours: regHours,
            netHours: calcHours,
            actualWorkedHours: calcHours,
            regularHours: regHours,
            isLiveActive: false,
            status: 'completed',
            statusLabel: 'حضور مكتمل (إنهاء الإدارة)',
            note: p.date < todayStr ? 'تم إغلاق الوردية السابقة واعتماد ساعاتها من الإدارة' : 'تم إنهاء الوردية واعتماد ساعات العمل من قِبل الإدارة',
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      // إذا لم يكن السجل موجوداً أصلاً في state.shifts (مثلاً كان مسجلاً فقط في activeShifts) نضيفه
      if (!shiftUpdated && p) {
        const newClosedShift = {
          id: p.id && !String(p.id).startsWith('active_') ? p.id : `shift_${empActualId}_${Date.now()}`,
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: p.branchId || employee.branchId || '',
          branchName: p.branchName || employee.branchName || '',
          date: p.date || todayStr,
          timeIn: inTime,
          timeOut: calculatedTimeOut,
          hours: regHours,
          netHours: calcHours,
          actualWorkedHours: calcHours,
          regularHours: regHours,
          scheduledHours: schedH,
          breakHours: bHours,
          isLiveActive: false,
          status: 'completed',
          statusLabel: 'حضور مكتمل (إنهاء الإدارة)',
          note: 'تم إنهاء الوردية واعتماد ساعات العمل من قِبل الإدارة',
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        updatedShifts = [newClosedShift, ...updatedShifts];
      }

      // تنظيف شامل ومطلق لكافة مفاتيح الموظف في activeShifts
      const updatedActive = { ...(state.activeShifts || {}) };
      delete updatedActive[employee.id];
      delete updatedActive[empActualId];
      if (empCode) delete updatedActive[empCode];

      Object.keys(updatedActive).forEach((k) => {
        const v = updatedActive[k];
        if (
          k === empActualId ||
          (empCode && k === empCode) ||
          (v && (
            String(v.employeeId) === empActualId ||
            (empCode && (String(v.employeeId) === empCode || String(v.employeeCode) === empCode)) ||
            (v.id && (v.id === p?.id || v.id === targetShiftId)) ||
            (v.shiftId && (v.shiftId === p?.id || v.shiftId === targetShiftId)) ||
            (v.date === p?.date && (String(v.employeeId) === empActualId || String(v.employeeCode) === empCode))
          ))
        ) {
          delete updatedActive[k];
        }
      });

      const endedEmpIds = Array.from(new Set([
        ...(state._endedShiftEmpIds || []),
        employee.id,
        empActualId,
        empCode
      ].filter(Boolean)));

      const nextState = {
        ...state,
        shifts: updatedShifts,
        activeShifts: updatedActive,
        _endedShiftEmpIds: endedEmpIds
      };

      // تحديث فوري للحالة المحلية لتختفي شارة الوردية فوراً
      if (typeof setState === 'function') {
        setState(nextState);
      }

      // دفع ذري موحد للحزم إلى السيرفر دفعة واحدة عبر apiSaveSettingsSlice (< 15ms)
      saveStateLocally(nextState).catch(() => {});
      broadcastStateChange(nextState);

      try {
        await apiSaveSettingsSlice({
          activeShifts: updatedActive,
          shifts: updatedShifts,
          _endedShiftEmpIds: endedEmpIds
        });
      } catch (sliceErr) {
        console.warn('[AttendancePunchesModal] Batch slice save fallback:', sliceErr);
        if (typeof saveState === 'function') {
          saveState(nextState, { entityType: 'activeShifts' }).catch(() => {});
        }
      }

      showToast?.('⏹ تم إنهاء وردية الموظف بنجاح وتسجيل وقت الانصراف');
    } catch (err) {
      console.error('Error ending shift from modal:', err);
      showToast?.('❌ حدث خطأ أثناء إنهاء الوردية');
    } finally {
      setIsStoppingShift(false);
    }
  };

  const handleStopLiveShift = () => handleStopShiftForRow(unclosedLiveShift || livePunch || unclosedPastShift);
  const manualCount = getEmployeeManualPunchesCount(employee.id, state, activePeriodFilter);

  const totalBreakHours = monthPunches
    .reduce((acc, p) => acc + (parseFloat(p.breakHours) || 0), 0)
    .toFixed(2);

  const getApprovedOtHours = (p) => {
    if (!p) return 0;
    const m = getShiftHoursMetrics(p, state);
    return m.isOvertimeApproved ? m.overtimeHours : 0;
  };

  const totalRegularHours = monthPunches
    .reduce((acc, p) => acc + (getEffectiveShiftHours(p, state) || 0), 0);

  const totalApprovedOtHours = monthPunches
    .reduce((acc, p) => acc + (getShiftHoursMetrics(p, state).isOvertimeApproved ? getShiftHoursMetrics(p, state).overtimeHours : 0), 0);

  const totalPendingOtHours = monthPunches
    .reduce((acc, p) => {
      const m = getShiftHoursMetrics(p, state);
      return acc + (m.overtimeStatus === 'pending' ? m.overtimeHours : 0);
    }, 0);

  const totalWorkHours = (totalRegularHours + totalApprovedOtHours).toFixed(2);

  const branches = state?.branches || [];
  const getBranchName = (bId) => {
    if (!bId) return '';
    const b = branches.find(br => isBranchMatch(bId, br));
    return b ? b.name : `فرع ${bId}`;
  };

  // حصر كافة فروع الموظف سواء المعينة في ملفه أو التي سجل بها ورديات وبصمات
  const employeeBranchesList = (() => {
    const map = new Map();
    // 1. من تفاصيل الفروع المتعددة
    (employee?.branchesDetails || []).forEach(bd => {
      const bObj = (branches || []).find(b => isBranchMatch(bd.branchId, b));
      const bId = bObj ? bObj.id : bd.branchId;
      const bName = bObj ? bObj.name : (bd.branchName || `فرع ${bId}`);
      if (bId) map.set(String(bId), { branchId: bId, branchName: bName, ...bd });
    });
    // 2. من مصفوفة الفروع المصرح بها
    (employee?.branches || []).forEach(bId => {
      const bObj = (branches || []).find(b => isBranchMatch(bId, b));
      const resolvedId = bObj ? bObj.id : bId;
      const bName = bObj ? bObj.name : `فرع ${resolvedId}`;
      if (resolvedId && !map.has(String(resolvedId))) {
        map.set(String(resolvedId), { branchId: resolvedId, branchName: bName });
      }
    });
    // 3. الفرع الأساسي أو فرع الموظف
    const baseBranchId = employee?.primaryBranchId || employee?.branchId;
    if (baseBranchId) {
      const bObj = (branches || []).find(b => isBranchMatch(baseBranchId, b));
      const resolvedId = bObj ? bObj.id : baseBranchId;
      if (resolvedId && !map.has(String(resolvedId))) {
        map.set(String(resolvedId), { branchId: resolvedId, branchName: bObj ? bObj.name : `فرع ${resolvedId}` });
      }
    }
    // 4. أي فروع سجل بها ورديات أو بصمات خلال الشهر
    (monthPunches || []).forEach(p => {
      if (p.branchId || p.branchName) {
        const bObj = (branches || []).find(b => isBranchMatch(p.branchId, b) || (p.branchName && isBranchMatch(p.branchName, b)));
        const resolvedId = bObj ? bObj.id : (p.branchId || p.branchName);
        const bName = bObj ? bObj.name : (p.branchName || `فرع ${resolvedId}`);
        if (resolvedId && !map.has(String(resolvedId))) {
          map.set(String(resolvedId), { branchId: resolvedId, branchName: bName });
        }
      }
    });
    return Array.from(map.values());
  })();

  const isMultiBranch = Boolean(
    employeeBranchesList.length > 1 ||
    (employee.branchesDetails && employee.branchesDetails.length > 1) ||
    employee.isFloatingStaff ||
    (employee.branches && employee.branches.length > 1)
  );

  const employeeBranchName = isMultiBranch
    ? employeeBranchesList.map(bd => bd.branchName || getBranchName(bd.branchId)).filter(Boolean).join(' + ')
    : (getBranchName(employee.branchId || employee.branchesDetails?.[0]?.branchId) || employee.branchName || employee.branch || 'الفرع الرئيسي');

  // Helper to calculate hourly rate for employee per branch
  const getBranchRate = (branchId) => {
    const bd =
      (employee.branchesDetails || []).find((b) => isBranchMatch(branchId, { id: b.branchId, branchId: b.branchId, name: b.branchName })) ||
      (employee.branchesDetails && employee.branchesDetails[0]) || {
        salary: employee.salary || 0,
        workHoursPerDay: employee.workHoursPerDay || 8,
        workDaysPerMonth: employee.workDaysPerMonth || 26
      };
    const hourlyBase = parseFloat(bd.salary || employee.salary) || 0;
    const workHoursPerDay = parseFloat(bd.workHoursPerDay || bd.workHours || employee.workHoursPerDay) || 8;
    const workDaysPerMonth = parseFloat(bd.workDaysPerMonth || bd.workDays || employee.workDaysPerMonth) || 26;

    const dailyRate = workDaysPerMonth > 0 ? (hourlyBase * workHoursPerDay) / workDaysPerMonth : 0;
    const rate = workHoursPerDay > 0 ? dailyRate / workHoursPerDay : (workDaysPerMonth > 0 ? hourlyBase / workDaysPerMonth : hourlyBase);
    return rate;
  };

  const totalEarned = monthPunches
    .reduce((acc, p) => {
      const isRej = p.isRejectedPhoto || p.status === 'rejected_photo' || (typeof p.statusLabel === 'string' && p.statusLabel.includes('رفض الصورة'));
      if (isRej) return acc;
      const netH = getEffectiveShiftHours(p, state);
      const otH = getApprovedOtHours(p);
      const rate = getBranchRate(p.branchId || employee.branchId);
      return acc + ((netH + otH) * rate);
    }, 0)
    .toFixed(2);

  const handleOpenAddPunch = (initialDate = null, initialBranchId = null, initialTimeIn = null, initialTimeOut = null) => {
    setIsAddingNewPunch(true);
    setEditingPunch({ id: `new_${Date.now()}` });
    const safeDate = (typeof initialDate === 'string' && initialDate.length >= 10)
      ? initialDate.slice(0, 10)
      : (typeof getRealTodayStr === 'function' ? getRealTodayStr() : new Date().toISOString().slice(0, 10));
    setEditDate(safeDate);

    // استخراج مواعيد الوردية المجدولة بالروستر لهذا اليوم تلقائياً إن وُجدت
    const daySched = getEmployeeDaySchedule(employee.id, safeDate, state);
    const hasSched = daySched && daySched.type !== 'off' && daySched.start && daySched.end;
    const defaultIn = initialTimeIn || (hasSched ? daySched.start : '09:00');
    const defaultOut = initialTimeOut || (hasSched ? daySched.end : '17:00');

    setEditTimeIn(defaultIn);
    setEditTimeOut(defaultOut);
    setEditBreakHours('0');
    const safeBranchId = (typeof initialBranchId === 'string' || typeof initialBranchId === 'number')
      ? String(initialBranchId)
      : (daySched?.branchId || employee.branchId || (employee.branchesDetails && employee.branchesDetails[0]?.branchId) || '');
    setEditBranchId(safeBranchId);
    setEditNotes('');
    setEditApproveOvertime(true);
    setEditDecouplePriorDayRequests(true);
  };

  const handleOpenEdit = (punch) => {
    if (!punch) return;
    setIsAddingNewPunch(false);
    setEditingPunch(punch);
    const safeDate = punch.date ? String(punch.date).slice(0, 10) : (typeof getRealTodayStr === 'function' ? getRealTodayStr() : new Date().toISOString().slice(0, 10));
    setEditDate(safeDate);
    const pIn = String(punch.timeIn || '');
    setEditTimeIn(pIn && pIn !== '—' ? pIn.slice(0, 5) : '09:00');
    const pOut = String(punch.timeOut || '');
    const safeTimeOut = (pOut && pOut !== '—' && pOut !== 'قيد العمل الآن' && pOut !== 'قيد العمل') ? pOut.slice(0, 5) : '';
    setEditTimeOut(safeTimeOut);
    setEditBreakHours(String(punch.breakHours || 0));
    
    // مطابقة فرع البصمة مع قائمة فروع الموظف بدقة
    const currentBId = punch.branchId || employee.branchId || '';
    const matchingDetail = (employee.branchesDetails || []).find(bd => isBranchMatch(currentBId, { id: bd.branchId, branchId: bd.branchId, name: bd.branchName }));
    setEditBranchId(matchingDetail ? matchingDetail.branchId : currentBId);

    // تنظيف الملاحظات من أي نصوص رفض إضافي قديمة حتى لا تتكرر داخل حقل الإدخال
    const rawNotes = String(punch.note || punch.notes || '');
    const cleanedNotes = rawNotes
      .replace(/❌\s*(تم رفض الساعات الإضافية|إضافي مرفوض)[^|]*/g, '')
      .replace(/\|\s*\|/g, '|')
      .trim()
      .replace(/^\|\s*|\s*\|$/g, '');
    setEditNotes(cleanedNotes);

    // عند تعديل البصمة بواسطة الإدارة العليا، يتم تفعيل اعتماد الساعات الإضافية وفك الارتباط تلقائياً
    setEditApproveOvertime(true);
    setEditDecouplePriorDayRequests(true);
  };

  // ⚡ إعادة احتساب ومطابقة البصمات مع الجدول الشهري وتحديث الساعات الإضافية وإلغاء جزاءات التأخير تلقائياً
  const handleSyncAndRecalculateWithRoster = async () => {
    try {
      const { updatedState: reconState, summary: reconSummary } = reconcileEmployeeScheduleOrPunchChange({
        employeeId: employee.id,
        state,
        options: { reason: 'مطابقة وإعادة احتساب مع الجدول الشهري المعتمد' }
      });

      setState?.(reconState);
      if (saveState) await saveState(reconState);

      const waivedMsg = reconSummary?.waivedDeductionMinutes > 0
        ? ` وتم إلغاء جزاء تأخير (${reconSummary.waivedDeductionMinutes} دقيقة - ${reconSummary.waivedAmount} ج.م)`
        : '';
      showToast?.(`✅ تمت مطابقة البصمات مع الجدول الشهري وتحديث الساعات الإضافية بنجاح!${waivedMsg}`);
    } catch (err) {
      console.error('Error recalculating shifts:', err);
      showToast?.('❌ حدث خطأ أثناء إعادة احتساب السجلات');
    }
  };

  // ⚡ المحرك التفاعلي للمعاينة اللحظية لاحتساب ساعات العمل والإضافي في نافذة التعديل/التسجيل اليدوي
  const editPreviewMetrics = useMemo(() => {
    if (!editingPunch) return null;
    const inParts = (editTimeIn || '09:00').split(':').map(Number);
    const outParts = (editTimeOut || '17:00').split(':').map(Number);
    const inH = inParts[0] || 0;
    const inM = inParts[1] || 0;
    const outH = outParts[0] || 0;
    const outM = outParts[1] || 0;
    let diff = 0;
    if (inH === outH && inM === outM) {
      diff = 0;
    } else {
      diff = (outH + outM / 60) - (inH + inM / 60);
      if (diff < 0) diff += 24;
    }
    const bH = Math.max(0, parseFloat(editBreakHours) || 0);
    const actualWorked = Math.max(0, Math.round((diff - bH) * 100) / 100);

    const daySched = getEmployeeDaySchedule(employee.id, editDate, state);
    const profileHours = parseFloat(employee.workHoursPerDay || employee.workHours) || 8;
    let scheduledHours = profileHours;

    const isFlexEmp = employee.noMonthlySchedule || employee.isVariableHours || employee.variableHours || employee.hasNoRoster || employee.scheduleType === 'flexible' || employee.scheduleType === 'variable';
    const activeRoster = !isFlexEmp ? findEmployeeRoster(employee.id, editDate, state) : null;
    const hasApprovedRoster = !isFlexEmp && Boolean(activeRoster && (activeRoster.status === 'approved' || activeRoster.adminApproved === true || activeRoster.isApproved === true));

    let regular = actualWorked;
    let overtime = 0;
    const isOvernight = (outH < inH) || (outH === inH && outM < inM);

    if (hasApprovedRoster && daySched && (daySched.type === 'off' || daySched.isOff)) {
      regular = 0;
      overtime = actualWorked;
      scheduledHours = 0;
    } else if (hasApprovedRoster && daySched && daySched.start && daySched.end && daySched.type !== 'off' && editTimeIn && editTimeOut) {
      const [sH, sM] = daySched.start.split(':').map(Number);
      let [eH, eM] = daySched.end.split(':').map(Number);
      let schedStartMins = sH * 60 + (sM || 0);
      let schedEndMins = eH * 60 + (eM || 0);
      if (schedEndMins <= schedStartMins) schedEndMins += 24 * 60;
      scheduledHours = Math.round(((schedEndMins - schedStartMins) / 60) * 100) / 100;
      const targetHours = scheduledHours > 0 ? scheduledHours : profileHours;

      if (actualWorked > targetHours) {
        regular = targetHours;
        overtime = Math.round((actualWorked - targetHours) * 100) / 100;
      } else {
        regular = actualWorked;
        overtime = 0;
      }
    } else {
      if (actualWorked > profileHours) {
        regular = profileHours;
        overtime = Math.round((actualWorked - profileHours) * 100) / 100;
      } else {
        regular = actualWorked;
        overtime = 0;
      }
    }

    return {
      totalElapsed: Math.round(diff * 100) / 100,
      breakHours: bH,
      actualWorkedHours: actualWorked,
      scheduledHours: scheduledHours,
      regularHours: regular,
      overtimeHours: overtime,
      isOvernight,
      hasApprovedRoster
    };
  }, [editingPunch, editTimeIn, editTimeOut, editBreakHours, editDate, employee, state]);

  // 🛡️ فحص التعارض والتنقل اللحظي بين الفروع (Live Conflict & Transit Buffer Guard)
  const liveConflictResult = useMemo(() => {
    if (!editingPunch || !editDate || !editTimeIn || !editTimeOut) return null;
    return checkShiftConflicts({
      employeeId: employee?.id,
      employeeCode: employee?.code,
      branchId: editBranchId || employee?.branchId,
      branchName: (state.branches || []).find(b => isBranchMatch(editBranchId, b))?.name,
      date: editDate,
      timeIn: editTimeIn,
      timeOut: editTimeOut,
      excludeShiftId: isAddingNewPunch ? null : editingPunch?.id,
      shifts: state.shifts || [],
      branches: state.branches || []
    });
  }, [editingPunch, editDate, editTimeIn, editTimeOut, editBranchId, employee, state, isAddingNewPunch]);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPunch) return;

    // 0ms التحقق الاحترافي الفوري من عدم تكرار الوردية لنفس الفرع ومنع التداخل الزمني مع أي وردية أخرى
    const conflictResult = checkShiftConflicts({
      employeeId: employee.id,
      employeeCode: employee.code,
      branchId: editBranchId || employee.branchId,
      branchName: (state.branches || []).find(b => isBranchMatch(editBranchId, b))?.name,
      date: editDate,
      timeIn: editTimeIn,
      timeOut: editTimeOut,
      excludeShiftId: isAddingNewPunch ? null : editingPunch?.id,
      shifts: state.shifts || [],
      branches: state.branches || []
    });

    if (conflictResult.hasConflict) {
      showToast?.(`⚠️ ${conflictResult.message}`);
      return;
    }

    // إغلاق فوري وقفل لنافذة تسجيل/تعديل البصمة بعد التأكد من عدم وجود تعارض
    const snapIsAdding = Boolean(isAddingNewPunch);
    const snapEditingPunch = { ...editingPunch };
    const snapDate = editDate;
    const snapTimeIn = editTimeIn;
    const snapTimeOut = editTimeOut;
    const snapBreakHours = editBreakHours;
    const snapBranchId = editBranchId;
    const snapNotes = editNotes;
    const snapApproveOt = Boolean(editApproveOvertime);
    const snapDecouplePrior = Boolean(editDecouplePriorDayRequests);

    setEditingPunch(null);
    setIsAddingNewPunch(false);
    if (snapIsAdding) {
      setSelectedBranchFilter('all');
    }

    const performSave = async () => {
      const inParts = (snapTimeIn || '09:00').split(':').map(Number);
      const outParts = (snapTimeOut || '17:00').split(':').map(Number);
      const inH = inParts[0] || 0;
      const inM = inParts[1] || 0;
      const outH = outParts[0] || 0;
      const outM = outParts[1] || 0;
      let diff = 0;
      if (inH === outH && inM === outM) {
        diff = 0;
      } else {
        diff = (outH + outM / 60) - (inH + inM / 60);
        if (diff < 0) diff += 24;
      }
      const bH = parseFloat(snapBreakHours) || 0;
      const calculatedHours = Math.max(0, Math.round((diff - bH) * 100) / 100);

      const daySched = getEmployeeDaySchedule(employee.id, snapDate, state);
      const profileHours = parseFloat(employee.workHoursPerDay || employee.workHours) || 8;
      let scheduledShiftHours = profileHours;

      const isFlexEmp = employee.noMonthlySchedule || employee.isVariableHours || employee.variableHours || employee.hasNoRoster || employee.scheduleType === 'flexible' || employee.scheduleType === 'variable';
      const activeRoster = !isFlexEmp ? findEmployeeRoster(employee.id, snapDate, state) : null;
      const hasApprovedRoster = !isFlexEmp && Boolean(activeRoster && (activeRoster.status === 'approved' || activeRoster.adminApproved === true || activeRoster.isApproved === true));

      let regularHours = calculatedHours;
      let overtimeHours = 0;

      // ── الحالة الأولى: الموظفون الذين لديهم جدول شهري معتمد (حصراً) ──
      if (hasApprovedRoster && daySched && (daySched.type === 'off' || daySched.isOff)) {
        regularHours = 0;
        overtimeHours = calculatedHours;
        scheduledShiftHours = 0;
      } else if (hasApprovedRoster && daySched && daySched.start && daySched.end && daySched.type !== 'off' && snapTimeIn && snapTimeOut) {
        const [sH, sM] = daySched.start.split(':').map(Number);
        let [eH, eM] = daySched.end.split(':').map(Number);
        let schedStartMins = sH * 60 + (sM || 0);
        let schedEndMins = eH * 60 + (eM || 0);
        if (schedEndMins <= schedStartMins) schedEndMins += 24 * 60;
        scheduledShiftHours = Math.round(((schedEndMins - schedStartMins) / 60) * 100) / 100;
        const targetHours = scheduledShiftHours > 0 ? scheduledShiftHours : profileHours;

        if (calculatedHours > targetHours) {
          regularHours = targetHours;
          overtimeHours = Math.round((calculatedHours - targetHours) * 100) / 100;
        } else {
          regularHours = calculatedHours;
          overtimeHours = 0;
        }
      }
      // ── الحالة الثانية: الموظفون الذين ليس لديهم جدول شهري معتمد / دوام حر ──
      else {
        if (calculatedHours > profileHours) {
          regularHours = profileHours;
          overtimeHours = Math.round((calculatedHours - profileHours) * 100) / 100;
        } else {
          regularHours = calculatedHours;
          overtimeHours = 0;
        }
      }

      const isOtApproved = Boolean(overtimeHours > 0 && snapApproveOt);
      const otStatus = (overtimeHours > 0) ? (isOtApproved ? 'approved' : 'pending') : 'none';

      const editedBObj = (state.branches || []).find(b => isBranchMatch(snapBranchId, b));
      const canonicalBranchId = editedBObj ? editedBObj.id : (snapBranchId || employee.branchId || '');
      const canonicalBranchName = editedBObj ? editedBObj.name : getBranchName(canonicalBranchId);

      // التقاط الحالة السابقة للبصمة قبل التعديل لتوثيق الفروق وسجل الإجراءات بدقة
      const prevIn = snapEditingPunch.timeIn || '—';
      const prevOut = snapEditingPunch.timeOut || '—';
      const prevWorked = parseFloat(snapEditingPunch.actualWorkedHours || snapEditingPunch.hours || snapEditingPunch.netHours || 0);
      const prevOt = parseFloat(snapEditingPunch.overtimeHours || 0);
      const wasOtRejected = Boolean(
        snapEditingPunch.overtimeStatus === 'rejected' ||
        snapEditingPunch.rejectedOvertime === true ||
        (typeof snapEditingPunch.statusLabel === 'string' && snapEditingPunch.statusLabel.includes('إضافي مرفوض'))
      );

      // صياغة الختم الزمني للتدقيق باللغة العربية
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dateFormatted = now.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const timestampTag = `[${dateFormatted} ${timeStr}]`;

      // تنظيف أي ملاحظات يدوية مدخلة من نصوص الرفض السابقة
      const cleanInputNotes = (snapNotes || '')
        .replace(/❌\s*(تم رفض الساعات الإضافية|إضافي مرفوض)[^|]*/g, '')
        .replace(/\|\s*\|/g, '|')
        .trim()
        .replace(/^\|\s*|\s*\|$/g, '');

      const noteParts = [];
      if (cleanInputNotes) noteParts.push(cleanInputNotes);

      let auditText = `${timestampTag} ✏️ ${snapIsAdding ? 'تسجيل بصمة يدوية' : 'تعديل بصمة يدوي'} بواسطة الإدارة العليا: `;
      if (wasOtRejected) {
        if (overtimeHours > 0 && isOtApproved) {
          auditText += `تم فك رفض الإضافي السابق (${prevOt.toFixed(2)} س) واعتماد إضافي جديد معتمد (+${overtimeHours.toFixed(2)} س) | `;
        } else {
          auditText += `تم فك رفض الإضافي السابق (${prevOt.toFixed(2)} س) واستبعاد شارة الإضافي لعدم وجود ساعات زائدة | `;
        }
      }
      if (!snapIsAdding && (prevIn !== snapTimeIn || prevOut !== snapTimeOut)) {
        auditText += `التوقيت: من (${prevIn} -> ${snapTimeIn}) إلى (${prevOut} -> ${snapTimeOut}) | `;
      } else {
        auditText += `التوقيت: ${snapTimeIn} إلى ${snapTimeOut} | `;
      }
      auditText += `صافي ساعات العمل: ${calculatedHours.toFixed(2)} س (أساسي: ${regularHours.toFixed(2)} س${overtimeHours > 0 && isOtApproved ? ` + إضافي معتمد: ${overtimeHours.toFixed(2)} س` : ''})`;
      if (bH > 0) auditText += ` [استراحة: ${bH.toFixed(2)} س]`;
      if (snapDecouplePrior) auditText += ` — تم فك الارتباط التام بطلبات اليوم السابقة`;

      noteParts.push(auditText);
      const combinedNote = noteParts.join(' | ');

      let updatedShifts;
      let finalSavedShiftId = '';

      if (snapIsAdding) {
        finalSavedShiftId = `punch_manual_${Date.now()}`;

        const newShiftPayload = {
          id: finalSavedShiftId,
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: canonicalBranchId,
          branchName: canonicalBranchName,
          date: snapDate,
          timeIn: snapTimeIn,
          timeOut: snapTimeOut,
          breakHours: bH,
          hours: isOtApproved ? calculatedHours : regularHours,
          workHours: isOtApproved ? calculatedHours : regularHours,
          regularHours: regularHours,
          scheduledHours: scheduledShiftHours,
          actualWorkedHours: calculatedHours,
          netHours: calculatedHours,
          grossHours: Math.round(diff * 100) / 100,
          overtimeHours: overtimeHours,
          overtimeStatus: otStatus,
          isOvertimeApproved: isOtApproved,
          rejectedOvertime: false,
          rejectedBy: null,
          rejectedAt: null,
          isManual: true,
          manualPunch: true,
          createdBy: 'admin',
          creatorRole: 'admin',
          isAdminCreated: true,
          adminApproved: true,
          unlinkPriorRequests: snapDecouplePrior,
          decoupledDay: snapDecouplePrior,
          ignorePermissions: snapDecouplePrior,
          hasApprovedPermission: snapDecouplePrior ? false : undefined,
          permissionHours: 0,
          isOvernight: (outH < inH) || (outH === inH && outM < inM),
          statusLabel: overtimeHours > 0 ? (isOtApproved ? 'تسجيل يدوي (مع إضافي معتمد)' : 'تسجيل يدوي (إضافي قيد المراجعة)') : 'تسجيل يدوي من الإدارة',
          note: combinedNote,
          notes: combinedNote,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        updatedShifts = [newShiftPayload, ...(state.shifts || [])];
      } else {
        finalSavedShiftId = String(snapEditingPunch.id);
        updatedShifts = (state.shifts || []).map((s) => {
          if (String(s.id) === finalSavedShiftId) {
            return {
              ...s,
              date: snapDate,
              timeIn: snapTimeIn,
              timeOut: snapTimeOut,
              breakHours: bH,
              hours: isOtApproved ? calculatedHours : regularHours,
              workHours: isOtApproved ? calculatedHours : regularHours,
              regularHours: regularHours,
              scheduledHours: scheduledShiftHours,
              actualWorkedHours: calculatedHours,
              netHours: calculatedHours,
              grossHours: Math.round(diff * 100) / 100,
              overtimeHours: overtimeHours,
              overtimeStatus: otStatus,
              isOvertimeApproved: isOtApproved,
              rejectedOvertime: false,
              rejectedBy: null,
              rejectedAt: null,
              unlinkPriorRequests: snapDecouplePrior,
              decoupledDay: snapDecouplePrior,
              ignorePermissions: snapDecouplePrior,
              hasApprovedPermission: snapDecouplePrior ? false : s.hasApprovedPermission,
              permissionHours: snapDecouplePrior ? 0 : s.permissionHours,
              isOvernight: (outH < inH) || (outH === inH && outM < inM),
              adminApproved: true,
              branchId: canonicalBranchId,
              branchName: canonicalBranchName,
              note: combinedNote,
              notes: combinedNote,
              statusLabel: overtimeHours > 0 ? (isOtApproved ? 'معدلة من الإدارة (مع إضافي معتمد)' : 'معدلة من الإدارة (إضافي معلق)') : 'معدلة من الإدارة',
              isManual: true,
              manualPunch: true,
              editedByAdmin: true,
              editedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
          return s;
        });
      }

      // 🛡️ الحفاظ على كافة الورديات الأخرى دون حذف مع تطهير معرّف الوردية المحدثة/المضافة
      const cleanDeletedIds = (state._deletedIds || []).filter(d => {
        if (!d) return false;
        const dStr = String(d).toLowerCase();
        const fId = finalSavedShiftId.toLowerCase();
        return dStr !== fId && dStr !== `shift_${fId}` && dStr !== `punch_${fId}`;
      });

      // إذا كانت البصمة المعدلة هي الوردية الحية النشطة، نقوم بتحديث فرعها وتوقيتها في activeShifts أيضاً
      let updatedActiveShifts = { ...(state.activeShifts || {}) };
      const curActive = updatedActiveShifts[employee.id] || updatedActiveShifts[String(employee.id)] || (employee.code && updatedActiveShifts[employee.code]);
      if (curActive && (snapEditingPunch.isLiveActive || String(curActive.shiftId) === String(finalSavedShiftId))) {
        const updatedActiveItem = {
          ...curActive,
          branchId: canonicalBranchId,
          branchName: canonicalBranchName,
          timeIn: snapTimeIn || curActive.timeIn,
          date: snapDate || curActive.date
        };
        updatedActiveShifts[employee.id] = updatedActiveItem;
        updatedActiveShifts[String(employee.id)] = updatedActiveItem;
        if (employee.code) updatedActiveShifts[String(employee.code)] = updatedActiveItem;
      }

      let updatedState = { ...state, shifts: updatedShifts, activeShifts: updatedActiveShifts, _deletedIds: cleanDeletedIds };

      // Auto recalculate late incidents and reconcile via unified engine (removing penalties on changed date)
      const { updatedState: reconState } = reconcileEmployeeScheduleOrPunchChange({
        employeeId: employee.id,
        changedDates: snapDate ? [snapDate] : null,
        state: updatedState,
        options: { reason: 'تعديل بصمة يدوي بالإدارة', clearPenaltiesOnChangedDates: true }
      });

      // 🛡️ فك الارتباط وتطهير طلبات الإضافي والأذونات السابقة لهذا اليوم
      let finalRequests = (reconState.requests || state.requests || []).map(r => {
        if (!r) return r;
        const isEmp = (String(r.employeeId) === String(employee.id) || (employee.code && String(r.employeeCode) === String(employee.code)));
        const rDate = String(r.date || r.targetDate || r.details?.shiftDate || '').slice(0, 10);
        const isDateMatch = rDate === snapDate;

        if (isEmp && isDateMatch) {
          const isOtType = r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي' || String(r.id || '').includes('ot');
          const isPermType = r.type === 'permission' || r.type === 'late_permission' || r.type === 'early_leave' || r.type === 'إذن' || r.type === 'اذن' || r.permType === 'late' || r.permType === 'early';

          if (snapDecouplePrior) {
            // 1. فك ارتباط وتحديث أي طلب إضافي لهذا اليوم
            if (isOtType) {
              if (overtimeHours > 0 && snapApproveOt) {
                return {
                  ...r,
                  status: 'approved',
                  adminApproved: true,
                  branchApproved: true,
                  adminRejected: false,
                  rejected: false,
                  hours: overtimeHours,
                  overtimeHours: overtimeHours,
                  regularHours: regularHours,
                  totalShiftHours: calculatedHours,
                  resolvedAt: new Date().toISOString(),
                  adminNote: 'تم اعتماد وتحديث الإضافي تلقائياً وفق التعديل اليدوي للإدارة'
                };
              } else if (overtimeHours > 0 && !snapApproveOt) {
                return {
                  ...r,
                  status: 'pending',
                  adminApproved: false,
                  adminRejected: false,
                  rejected: false,
                  hours: overtimeHours,
                  overtimeHours: overtimeHours
                };
              } else {
                return {
                  ...r,
                  status: 'cancelled',
                  isCancelled: true,
                  adminRejected: false,
                  rejected: false,
                  adminNote: 'تم إلغاء الطلب بعد تعديل البصمة اليدوية لعدم وجود إضافي'
                };
              }
            }

            // 2. فك ارتباط أي إذن سابق لهذا اليوم حتى لا يشوه أو يضخم ساعات الوردية اليدوية
            if (isPermType) {
              return {
                ...r,
                decoupledFromPunch: true,
                voidedOnManualPunch: true,
                note: (r.note ? r.note + ' | ' : '') + 'تم فك الارتباط بالبصمة اليدوية المعتمدة من الإدارة'
              };
            }
          }
        }
        return r;
      });

      updatedState = {
        ...reconState,
        requests: finalRequests
      };

      if (setState) setState(updatedState);

      saveStateLocally(updatedState).catch(() => {});
      broadcastStateChange(updatedState);

      try {
        const slicesToSave = {
          shifts: updatedShifts,
          requests: finalRequests
        };
        if (updatedState.lateIncidents) slicesToSave.lateIncidents = updatedState.lateIncidents;
        if (updatedState._deletedIds) slicesToSave._deletedIds = updatedState._deletedIds;

        await apiSaveSettingsSlice(slicesToSave);
      } catch (sliceErr) {
        console.warn('[AttendancePunchesModal] Batch slice save fallback in handleSaveEdit:', sliceErr);
        if (saveState) saveState(updatedState, { entityType: 'shifts' }).catch(() => {});
      }

      if (snapIsAdding) {
        showToast?.(`✅ تم تسجيل البصمة اليدوية بنجاح: ${regularHours} س أساسي${overtimeHours > 0 ? (isOtApproved ? ` + ${overtimeHours} س إضافي معتمد تلقائياً` : ` + ${overtimeHours} س إضافي قيد المراجعة`) : ''}`);
        return;
      }

      const lateInc = (reconState.lateIncidents || []).find((inc) => (String(inc.shiftId) === String(finalSavedShiftId) || inc.date === snapDate) && inc.lateMinutes > 0);
      if (lateInc && lateInc.deductionMinutes > 0) {
        showToast?.(`✅ تم حفظ التعديل وتطبيق لائحة الجزاءات تلقائياً: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.tierName} (${lateInc.actionLabel} - خصم ${lateInc.penaltyAmount} ج.م)`);
      } else if (lateInc && lateInc.lateMinutes > 0) {
        showToast?.(`✅ تم حفظ التعديل: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.actionLabel || 'فترة سماح'}`);
      } else if (overtimeHours > 0) {
        showToast?.(`✅ تم حفظ تعديل البصمة واحتساب الإضافي تلقائياً: ${regularHours} س أساسي + ${overtimeHours} س إضافي ${isOtApproved ? 'معتمد ⭐' : 'معلق ⏳'}`);
      } else {
        showToast?.('✅ تم حفظ وتعديل بيانات البصمة واحتساب ساعات العمل بنجاح!');
      }
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: snapIsAdding ? 'lockApproveManualPunches' : 'lockEditPastShifts',
        actionTitle: snapIsAdding ? `تسجيل بصمة يدوية للموظف (${employee.name})` : `تعديل بصمة الموظف (${employee.name})`,
        actionDetails: `تاريخ البصمة: ${snapDate} | التوقيت: من ${snapTimeIn} إلى ${snapTimeOut}`,
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  const handleDeletePunch = async (punch) => {
    const performDelete = async () => {
      const punchIdStr = String(punch.id || '');
      const cleanRaw = punchIdStr.replace(/^(shift_|punch_)/, '');
      const punchDate = punch.date || '';
      const empIdStr = String(employee.id || punch.employeeId || '');
      const empCodeStr = employee.code ? String(employee.code) : '';

      // 1. فلترة الشفتات وحذف البصمة بدقة وبلا عودة
      const updatedShifts = (state.shifts || []).filter((s) => {
        if (!s) return false;
        if (punchIdStr && String(s.id) === punchIdStr) return false;
        if (cleanRaw && String(s.id) === cleanRaw) return false;
        if (punchDate && (String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode || s.employeeId) === empCodeStr)) && s.date === punchDate && s.timeIn === punch.timeIn) {
          return false;
        }
        return true;
      });

      // 2. إعداد شواهد القبور الصارمة لحظر استرجاع البصمة عند التزامن مع السحابة
      const tombstonesToAdd = [];
      if (punchIdStr) {
        tombstonesToAdd.push(punchIdStr);
        tombstonesToAdd.push(`shift_${punchIdStr}`);
        tombstonesToAdd.push(`punch_${punchIdStr}`);
      }
      if (cleanRaw) {
        tombstonesToAdd.push(cleanRaw);
        tombstonesToAdd.push(`shift_${cleanRaw}`);
        tombstonesToAdd.push(`punch_${cleanRaw}`);
      }
      if (punchDate && punch.timeIn) {
        tombstonesToAdd.push(`shift_${empIdStr}_${punchDate}_${punch.timeIn}`);
        tombstonesToAdd.push(`${empIdStr}_${punchDate}_${punch.timeIn}`);
        if (empCodeStr) {
          tombstonesToAdd.push(`shift_${empCodeStr}_${punchDate}_${punch.timeIn}`);
          tombstonesToAdd.push(`${empCodeStr}_${punchDate}_${punch.timeIn}`);
        }
      }

      // 3. حذف أي طلبات إضافي أو اعتمادات حضور مرتبطة بهذه البصمة
      const associatedReqIds = [];
      const updatedRequests = (state.requests || []).filter((r) => {
        if (!r) return false;
        const matchShiftId = (punchIdStr && String(r.shiftId) === punchIdStr) || (cleanRaw && String(r.shiftId) === cleanRaw) || (punchIdStr && String(r.id).includes(punchIdStr));
        const matchOtReq = r.type === 'overtime' && (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) && r.date === punchDate;
        if (matchShiftId || matchOtReq) {
          if (r.id) {
            const cleanReqId = String(r.id).replace(/^req_/, '');
            associatedReqIds.push(String(r.id));
            associatedReqIds.push(`req_${cleanReqId}`);
            associatedReqIds.push(cleanReqId);
          }
          return false;
        }
        return true;
      });

      // 3.5 عند حذف الوردية: تسقط ساعات الإذن لهذا اليوم ولا يتم جمعها مرة أخرى
      const voidedRequests = (updatedRequests || []).map((r) => {
        if (!r) return r;
        const isEmpMatch = String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr);
        const isDateMatch = r.date === punchDate || r.startDate === punchDate || (r.createdAt && r.createdAt.slice(0, 10) === punchDate);
        const t = String(r.type || r.requestType || r.subType || '').toLowerCase();
        const isPerm = t.includes('perm') || t.includes('إذن') || t.includes('اذن') || r.permType === 'late' || r.permType === 'early';
        if (isEmpMatch && isDateMatch && isPerm) {
          const origHours = r.originalHours || r.hours || (r.durationMinutes ? Math.round((r.durationMinutes / 60) * 100) / 100 : 0);
          return {
            ...r,
            voidedOnShiftDelete: true,
            hours: 0,
            effectiveHours: 0,
            durationMinutes: 0,
            originalHours: origHours,
            originalStartTime: r.originalStartTime || r.startTime || '',
            originalEndTime: r.originalEndTime || r.endTime || '',
            originalDurationText: r.originalDurationText || r.durationText || '',
            notes: (r.notes ? r.notes + ' | ' : '') + '[سقطت ساعات الإذن لحذف وردية اليوم ولن تُجمع مرة أخرى]'
          };
        }
        return r;
      });

      const voidedPermissions = (state.permissions || []).map((p) => {
        if (!p) return p;
        const isEmpMatch = String(p.employeeId) === empIdStr || (empCodeStr && String(p.employeeCode) === empCodeStr);
        const isDateMatch = p.date === punchDate || p.startDate === punchDate;
        if (isEmpMatch && isDateMatch) {
          const origHours = p.originalHours || p.hours || (p.durationMinutes ? Math.round((p.durationMinutes / 60) * 100) / 100 : 0);
          return {
            ...p,
            voidedOnShiftDelete: true,
            hours: 0,
            effectiveHours: 0,
            durationMinutes: 0,
            originalHours: origHours,
            originalStartTime: p.originalStartTime || p.startTime || '',
            originalEndTime: p.originalEndTime || p.endTime || '',
            notes: (p.notes ? p.notes + ' | ' : '') + '[سقطت ساعات الإذن لحذف وردية اليوم ولن تُجمع مرة أخرى]'
          };
        }
        return p;
      });

      // 4. حذف الشفت النشط إذا كان مسجلاً لهذا اليوم أو البصمة
      let updatedActiveShifts = { ...(state.activeShifts || {}) };
      if (updatedActiveShifts[empIdStr]) {
        const act = updatedActiveShifts[empIdStr];
        if (String(act.id) === punchIdStr || String(act.id) === cleanRaw || act.date === punchDate) {
          delete updatedActiveShifts[empIdStr];
        }
      }
      if (empCodeStr && updatedActiveShifts[empCodeStr]) {
        const act = updatedActiveShifts[empCodeStr];
        if (String(act.id) === punchIdStr || String(act.id) === cleanRaw || act.date === punchDate) {
          delete updatedActiveShifts[empCodeStr];
        }
      }

      // 5. دمج شواهد القبور في _deletedIds
      const updatedDeletedIds = Array.from(
        new Set([
          ...(state._deletedIds || []),
          ...tombstonesToAdd,
          ...associatedReqIds
        ])
      ).slice(-2000);

      let updatedState = {
        ...state,
        shifts: updatedShifts,
        requests: voidedRequests,
        permissions: voidedPermissions,
        activeShifts: updatedActiveShifts,
        _deletedIds: updatedDeletedIds
      };

      // 6. إعادة احتساب وقائع التأخير والتسوية للدورة المحاسبية (وإلغاء جزاءات التاريخ المحذوف)
      const { updatedState: reconState } = reconcileEmployeeScheduleOrPunchChange({
        employeeId: employee.id,
        changedDates: punchDate ? [punchDate] : null,
        state: updatedState,
        options: { reason: 'حذف بصمة', clearPenaltiesOnChangedDates: true }
      });
      updatedState = reconState;

      if (setState) setState(updatedState);
      saveStateLocally(updatedState).catch(() => {});
      broadcastStateChange(updatedState);

      try {
        const slicesToSave = {
          shifts: updatedState.shifts,
          requests: updatedState.requests
        };
        if (updatedState.lateIncidents) slicesToSave.lateIncidents = updatedState.lateIncidents;
        if (updatedState._deletedIds) slicesToSave._deletedIds = updatedState._deletedIds;

        await apiSaveSettingsSlice(slicesToSave);
      } catch (sliceErr) {
        console.warn('[AttendancePunchesModal] Batch slice save fallback in handleDeletePunch:', sliceErr);
        if (saveState) saveState(updatedState, { entityType: 'shifts' }).catch(() => {});
      }

      showToast?.('🗑️ تم حذف البصمة بنجاح واستبعاد هذا اليوم بالكامل من كشف المرتبات ونظام الأجور');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockDeleteShifts',
        actionTitle: `حذف بصمة الموظف (${employee.name})`,
        actionDetails: `تاريخ البصمة: ${punch.date} | ${punch.timeIn} - ${punch.timeOut}`,
        onExecute: performDelete
      });
    } else {
      const isConfirmed = await showConfirm({
        title: 'حذف بصمة الحضور',
        message: `هل أنت متأكد من حذف بصمة يوم ${punch.date} للموظف (${employee.name})؟ سيتم استبعاد هذا اليوم تماماً من كشف المرتبات والأجور.`,
        confirmText: 'تأكيد الحذف واستبعاد اليوم',
        cancelText: 'إلغاء وتراجع',
        type: 'danger',
        icon: '🗑️'
      });
      if (isConfirmed) {
        await performDelete();
      }
    }
  };

  const handleApproveAndCalculateShift = async (punch) => {
    if (!punch) return;
    const performApproveAndCalculate = async () => {
      const punchIdStr = String(punch.id || '');
      const punchDate = punch.date || new Date().toISOString().slice(0, 10);
      const inTime = punch.timeIn || punch.checkIn || punch.inTime || '09:00';
      const outTime = punch.timeOut && punch.timeOut !== '—' && punch.timeOut !== '' ? (punch.timeOut || punch.checkOut || punch.outTime) : '17:00';

      const diffMinutes = calcRawDurationMinutes(inTime, outTime, {
        startDate: punchDate,
        endDate: punch.timeOutDate || punchDate,
        isOvernight: punch.isOvernight
      });
      const totalElapsed = diffMinutes / 60;
      const bH = Math.max(0, parseFloat(punch.breakHours) || 0);
      const netHours = Math.max(0, Math.round((totalElapsed - bH) * 100) / 100);

      const daySched = getEmployeeDaySchedule(employee.id, punchDate, state);
      const profileHours = parseFloat(employee.workHoursPerDay || employee.workHours) || 8;
      let schedHours = profileHours;
      if (daySched && daySched.start && daySched.end && daySched.type !== 'off') {
        const [sH, sM] = daySched.start.split(':').map(Number);
        const [eH, eM] = daySched.end.split(':').map(Number);
        let sMins = sH * 60 + (sM || 0);
        let eMins = eH * 60 + (eM || 0);
        if (eMins <= sMins) eMins += 24 * 60;
        schedHours = Math.round(((eMins - sMins) / 60) * 100) / 100;
      } else if (daySched && daySched.hours && daySched.type !== 'off') {
        schedHours = parseFloat(daySched.hours) || profileHours;
      } else if (punch.scheduledHours) {
        schedHours = parseFloat(punch.scheduledHours);
      }

      const regularHours = Math.min(netHours, schedHours);
      const overtimeHours = Math.max(0, Math.round((netHours - schedHours) * 100) / 100);
      const otStatus = overtimeHours > 0 ? 'approved' : 'none';

      const updatedShifts = (state.shifts || []).map((s) => {
        const isMatch = (punchIdStr && String(s.id) === punchIdStr) ||
                        (punch.requestId && s.requestId === punch.requestId) ||
                        (String(s.employeeId) === String(employee.id) && s.date === punchDate && s.timeIn === inTime);

        if (isMatch) {
          return {
            ...s,
            status: 'approved',
            isRejectedPhoto: false,
            isCancelled: false,
            isRejected: false,
            rejected: false,
            timeIn: inTime,
            timeOut: outTime,
            hours: regularHours,
            workHours: regularHours,
            regularHours: regularHours,
            scheduledHours: schedHours,
            actualWorkedHours: netHours,
            netHours: netHours,
            overtimeHours: overtimeHours,
            overtimeStatus: otStatus,
            statusLabel: overtimeHours > 0 ? 'حضور معتمد (مع إضافي معتمد)' : 'حضور معتمد (تم احتساب البصمة يدوياً بواسطة الإدارة)',
            adminApproved: true,
            approvedBy: 'الإدارة العليا',
            approvedAt: new Date().toISOString(),
            note: (s.note ? s.note + ' | ' : '') + '✅ تم احتساب البصمة واعتماد الوردية بواسطة الإدارة العليا' + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
            notes: (s.notes ? s.notes + ' | ' : '') + '✅ تم احتساب البصمة واعتماد الوردية بواسطة الإدارة العليا' + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      // أيضاً تحديث الطلب المرتبط في state.requests إن وجد ليصبح معتمداً
      const updatedRequests = (state.requests || []).map((r) => {
        if ((punch.requestId && r.id === punch.requestId) || (r.shiftId && (String(r.shiftId) === punchIdStr || r.shiftId === punch.id))) {
          return {
            ...r,
            status: 'approved',
            adminApproved: true,
            resolvedAt: new Date().toISOString(),
            adminNote: 'تم احتساب البصمة واعتماد الوردية في نظام الأجور بواسطة الإدارة العليا'
          };
        }
        return r;
      });

      let updatedState = {
        ...state,
        shifts: updatedShifts,
        requests: updatedRequests
      };

      // إعادة احتساب الجزاءات والتأخيرات تلقائياً (وإلغاء جزاءات التاريخ المحتسب)
      const { updatedState: reconState } = reconcileEmployeeScheduleOrPunchChange({
        employeeId: employee.id,
        changedDates: punchDate ? [punchDate] : null,
        state: updatedState,
        options: { reason: 'تسجيل/اعتماد بصمة يدوية', clearPenaltiesOnChangedDates: true }
      });
      updatedState = reconState;

      if (setState) setState(updatedState);
      let atomicSaved = false;
      try {
        const slicesToSave = {
          shifts: updatedState.shifts,
          requests: updatedState.requests
        };
        if (updatedState.lateIncidents) {
          slicesToSave.lateIncidents = updatedState.lateIncidents;
        }
        if (updatedState._deletedIds) {
          slicesToSave._deletedIds = updatedState._deletedIds;
        }
        await apiSaveSettingsSlice(slicesToSave);
        atomicSaved = true;
      } catch (sliceErr) {
        console.warn('[AttendancePunchesModal] Slice save in performApproveAndCalculate:', sliceErr);
      }

      if (atomicSaved) {
        try {
          await saveStateLocally(updatedState);
          broadcastStateChange(updatedState);
        } catch (locErr) {
          console.warn('[AttendancePunchesModal] Local save error:', locErr);
        }
      } else if (saveState) {
        await saveState(updatedState);
      }

      showToast?.(`✅ تم احتساب البصمة وتفعيل الوردية (${netHours} س) في نظام الأجور والرواتب بنجاح!`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveManualPunches',
        actionTitle: `احتساب وتفعيل بصمة الوردية للموظف (${employee.name})`,
        actionDetails: `تفعيل وردية يوم ${punch.date || ''} (${punch.timeIn || ''} - ${punch.timeOut || ''}) في نظام الأجور والرواتب.`,
        onExecute: performApproveAndCalculate
      });
      return;
    }

    const isConfirmed = await showConfirm({
      title: 'احتساب وتفعيل البصمة في نظام الأجور',
      message: `هل تريد اعتماد واحتساب وردية يوم ${punch.date} للموظف (${employee.name}) وتفعيل ساعاتها وأجرها في نظام الرواتب تلقائياً؟`,
      confirmText: 'تأكيد واحتساب الوردية',
      cancelText: 'إلغاء',
      type: 'success',
      icon: '✅'
    });
    if (isConfirmed) {
      await performApproveAndCalculate();
    }
  };

  const handleQuickApproveOvertime = async (punch) => {
    if (!punch) return;
    const shiftMetrics = getShiftHoursMetrics(punch, state);
    const otHours = shiftMetrics.overtimeHours || parseFloat(punch.overtimeHours) || 0;
    if (otHours <= 0) {
      showToast?.('⚠️ لا توجد ساعات إضافية لاحتسابها في هذه الوردية');
      return;
    }

    const performQuickApprove = async () => {
      const punchIdStr = String(punch.id || '');
      const punchDate = punch.date;
      const empIdStr = String(employee.id || punch.employeeId || '');
      const empCodeStr = employee.code ? String(employee.code) : '';

      // 1. تحديث الوردية في shifts
      const updatedShifts = (state.shifts || []).map((s) => {
        const isMatch = (punchIdStr && String(s.id) === punchIdStr) ||
          ((String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode) === empCodeStr)) && s.date === punchDate && s.timeIn === punch.timeIn);
        if (isMatch) {
          const regHours = s.regularHours !== undefined ? s.regularHours : shiftMetrics.regularHours;
          const cleanExistingNotes = (s.notes || s.note || '')
            .replace(/⏳?\s*إضافي قيد الاعتماد\s*(\(\+?[0-9.]+\s*س\))?/g, '')
            .replace(/قيد الاعتماد/g, '')
            .trim();
          const newNote = cleanExistingNotes
            ? `${cleanExistingNotes} | ✅ إضافي معتمد (+${otHours} س)`
            : `✅ ساعات عمل وإضافي معتمد (أساسي: ${regHours} س + إضافي: ${otHours} س)`;

          return {
            ...s,
            overtimeHours: otHours,
            overtimeStatus: 'approved',
            isOvertimeApproved: true,
            rejectedOvertime: false,
            adminApproved: true,
            status: s.status === 'completed' ? 'completed' : 'approved',
            statusLabel: 'حضور معتمد (مع إضافي معتمد)',
            note: newNote,
            notes: newNote,
            approvedBy: 'الإدارة العليا',
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      // 2. تحديث أو اعتماد أي طلب إضافي مرتبط في requests
      let hasUpdatedReq = false;
      const updatedRequests = (state.requests || []).map((r) => {
        const isMatch = (r.id && (r.id === punch.requestId || r.id === punch.linkedRequestId || r.id === punch.overtimeRequestId || r.shiftId === punchIdStr || r.shiftId === punch.id)) ||
          ((String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) &&
           (r.date === punchDate || r.targetDate === punchDate || r.details?.shiftDate === punchDate) &&
           (r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي'));

        if (isMatch) {
          hasUpdatedReq = true;
          return {
            ...r,
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            adminRejected: false,
            hours: otHours,
            resolvedAt: new Date().toISOString(),
            adminNote: 'تم اعتماد الساعات الإضافية مباشرة من سجل البصمات'
          };
        }
        return r;
      });

      let nextState = {
        ...state,
        shifts: updatedShifts,
        requests: updatedRequests
      };

      if (setState) setState(nextState);

      let atomicSaved = false;
      try {
        const slicesToSave = { shifts: updatedShifts };
        if (hasUpdatedReq) {
          slicesToSave.requests = updatedRequests;
        }
        await apiSaveSettingsSlice(slicesToSave);
        atomicSaved = true;
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning:', err);
      }

      if (atomicSaved) {
        try {
          await saveStateLocally(nextState);
          broadcastStateChange(nextState);
        } catch (locErr) {
          console.warn('[AttendancePunchesModal] Local save error:', locErr);
        }
      } else if (saveState) {
        await saveState(nextState);
      }

      showToast?.(`✅ تم اعتماد الساعات الإضافية بنجاح: +${otHours} ساعة ليوم ${punchDate}`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveOvertime',
        actionTitle: `اعتماد إضافي للموظف (${employee.name})`,
        actionDetails: `تاريخ الوردية: ${punch.date} | ساعات الإضافي: ${otHours} س`,
        onExecute: performQuickApprove
      });
    } else {
      await performQuickApprove();
    }
  };

  const handleApproveAllPendingOvertime = async () => {
    const pendingPunches = monthPunches.filter(p => {
      const m = getShiftHoursMetrics(p, state);
      return !m.isOvertimeApproved && (m.overtimeStatus === 'pending' || p.overtimeStatus === 'pending') && m.overtimeHours > 0;
    });

    if (pendingPunches.length === 0) {
      showToast?.('ℹ️ لا توجد ساعات إضافية معلقة لاعتمادها');
      return;
    }

    const performApproveAll = async () => {
      const empIdStr = String(employee.id || '');
      const empCodeStr = employee.code ? String(employee.code) : '';
      const pendingDates = new Set(pendingPunches.map(p => p.date));
      const pendingIds = new Set(pendingPunches.map(p => String(p.id)));

      let totalApprovedHours = 0;

      const updatedShifts = (state.shifts || []).map((s) => {
        const isTarget = pendingIds.has(String(s.id)) ||
          ((String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode) === empCodeStr)) && pendingDates.has(s.date));

        if (isTarget) {
          const m = getShiftHoursMetrics(s, state);
          const otH = m.overtimeHours || parseFloat(s.overtimeHours) || 0;
          if (otH > 0 && (!m.isOvertimeApproved || s.overtimeStatus === 'pending')) {
            totalApprovedHours += otH;
            const regHours = s.regularHours !== undefined ? s.regularHours : m.regularHours;
            const cleanExistingNotes = (s.notes || s.note || '')
              .replace(/⏳?\s*إضافي قيد الاعتماد\s*(\(\+?[0-9.]+\s*س\))?/g, '')
              .replace(/قيد الاعتماد/g, '')
              .trim();
            const newNote = cleanExistingNotes
              ? `${cleanExistingNotes} | ✅ إضافي معتمد (+${otH} س)`
              : `✅ ساعات عمل وإضافي معتمد (أساسي: ${regHours} س + إضافي: ${otH} س)`;

            return {
              ...s,
              overtimeHours: otH,
              overtimeStatus: 'approved',
              isOvertimeApproved: true,
              rejectedOvertime: false,
              adminApproved: true,
              status: s.status === 'completed' ? 'completed' : 'approved',
              statusLabel: 'حضور معتمد (مع إضافي معتمد)',
              note: newNote,
              notes: newNote,
              approvedBy: 'الإدارة العليا',
              approvedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
        }
        return s;
      });

      const updatedRequests = (state.requests || []).map((r) => {
        const isMatch = (
          (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) &&
          (r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي') &&
          (pendingDates.has(r.date) || pendingDates.has(r.targetDate) || pendingDates.has(r.details?.shiftDate)) &&
          r.status !== 'rejected' && r.status !== 'cancelled'
        );

        if (isMatch) {
          return {
            ...r,
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            adminRejected: false,
            resolvedAt: new Date().toISOString(),
            adminNote: 'تم اعتماد الساعات الإضافية مجمعاً من سجل البصمات'
          };
        }
        return r;
      });

      let nextState = {
        ...state,
        shifts: updatedShifts,
        requests: updatedRequests
      };

      if (setState) setState(nextState);

      let atomicSaved = false;
      try {
        await apiSaveSettingsSlice({
          shifts: updatedShifts,
          requests: updatedRequests
        });
        atomicSaved = true;
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning:', err);
      }

      if (atomicSaved) {
        try {
          await saveStateLocally(nextState);
          broadcastStateChange(nextState);
        } catch (locErr) {
          console.warn('[AttendancePunchesModal] Local save error:', locErr);
        }
      } else if (saveState) {
        await saveState(nextState);
      }

      showToast?.(`⭐ تم اعتماد كافة الساعات الإضافية المعلقة بنجاح: ${totalApprovedHours.toFixed(2)} ساعة لـ ${pendingPunches.length} وردية`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveOvertime',
        actionTitle: `اعتماد كافة الساعات الإضافية المعلقة للموظف (${employee.name})`,
        actionDetails: `إجمالي الساعات المعلقة: ${totalPendingOtHours.toFixed(2)} س لعدد ${pendingPunches.length} وردية`,
        onExecute: performApproveAll
      });
    } else {
      const isConfirmed = await showConfirm({
        title: 'اعتماد كافة الساعات الإضافية المعلقة',
        message: `هل تريد اعتماد جميع الساعات الإضافية المعلقة (${totalPendingOtHours.toFixed(2)} ساعة) لـ ${pendingPunches.length} وردية للموظف (${employee.name}) وتثبيتها في كشف الرواتب؟`,
        confirmText: 'تأكيد واعتماد الكل',
        cancelText: 'إلغاء',
        type: 'success',
        icon: '⭐'
      });
      if (isConfirmed) {
        await performApproveAll();
      }
    }
  };

  const handleQuickRejectOvertime = async (punch) => {
    if (!punch) return;
    const shiftMetrics = getShiftHoursMetrics(punch, state);
    const otHours = shiftMetrics.overtimeHours || parseFloat(punch.overtimeHours) || 0;

    const performQuickReject = async () => {
      const punchIdStr = String(punch.id || '');
      const punchDate = punch.date;
      const empIdStr = String(employee.id || punch.employeeId || '');
      const empCodeStr = employee.code ? String(employee.code) : '';

      // 1. تحديث الوردية في shifts
      const updatedShifts = (state.shifts || []).map((s) => {
        const isMatch = (punchIdStr && String(s.id) === punchIdStr) ||
          ((String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode) === empCodeStr)) && s.date === punchDate && s.timeIn === punch.timeIn);
        if (isMatch) {
          const rawCalculatedReg = shiftMetrics.regularHours !== undefined ? shiftMetrics.regularHours : (s.regularHours !== undefined ? s.regularHours : shiftMetrics.actualWorkedHours);
          const safeRegHours = (rawCalculatedReg > 0)
            ? rawCalculatedReg
            : (shiftMetrics.actualWorkedHours > 0 ? shiftMetrics.actualWorkedHours : (parseFloat(s.hours) || 8));

          const cleanExistingNotes = (s.notes || s.note || '')
            .replace(/⏳?\s*إضافي قيد الاعتماد\s*(\(\+?[0-9.]+\s*س\))?/g, '')
            .replace(/قيد الاعتماد/g, '')
            .trim();
          const newNote = cleanExistingNotes
            ? `${cleanExistingNotes} | ❌ تم رفض الساعات الإضافية (+${otHours} س) واحتساب الساعات الأساسية (${safeRegHours} س)`
            : `ساعات الوردية الأساسية (${safeRegHours} س) — ❌ تم رفض الساعات الإضافية (+${otHours} س) بواسطة الإدارة العليا`;

          return {
            ...s,
            hours: safeRegHours,
            netHours: safeRegHours,
            regularHours: safeRegHours,
            overtimeHours: otHours,
            overtimeStatus: 'rejected',
            isOvertimeApproved: false,
            rejectedOvertime: true,
            adminApproved: true,
            status: s.status === 'completed' ? 'completed' : 'approved',
            statusLabel: 'حضور معتمد (إضافي مستبعد)',
            note: newNote,
            notes: newNote,
            rejectedBy: 'الإدارة العليا',
            rejectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      // 2. تحديث أو رفض أي طلب إضافي مرتبط في requests
      let hasUpdatedReq = false;
      const updatedRequests = (state.requests || []).map((r) => {
        const isMatch = (r.id && (r.id === punch.requestId || r.id === punch.linkedRequestId || r.id === punch.overtimeRequestId || r.shiftId === punchIdStr || r.shiftId === punch.id)) ||
          ((String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) &&
           (r.date === punchDate || r.targetDate === punchDate || r.details?.shiftDate === punchDate) &&
           (r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي'));

        if (isMatch) {
          hasUpdatedReq = true;
          return {
            ...r,
            status: 'rejected',
            adminApproved: false,
            branchApproved: false,
            adminRejected: true,
            resolvedAt: new Date().toISOString(),
            adminNote: 'تم رفض الساعات الإضافية بواسطة الإدارة العليا من سجل البصمات'
          };
        }
        return r;
      });

      let nextState = {
        ...state,
        shifts: updatedShifts,
        requests: updatedRequests
      };

      if (setState) setState(nextState);

      let atomicSaved = false;
      try {
        const slicesToSave = { shifts: updatedShifts };
        if (hasUpdatedReq) {
          slicesToSave.requests = updatedRequests;
        }
        await apiSaveSettingsSlice(slicesToSave);
        atomicSaved = true;
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning in handleQuickRejectOvertime:', err);
      }

      if (atomicSaved) {
        try {
          await saveStateLocally(nextState);
          broadcastStateChange(nextState);
        } catch (locErr) {
          console.warn('[AttendancePunchesModal] Local save error:', locErr);
        }
      } else if (saveState) {
        await saveState(nextState);
      }

      showToast?.(`❌ تم رفض الساعات الإضافية (+${otHours} س) ليوم ${punchDate} واحتساب الساعات الأساسية فقط`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveOvertime',
        actionTitle: `رفض إضافي للموظف (${employee.name})`,
        actionDetails: `تاريخ الوردية: ${punch.date} | ساعات الإضافي المستبعدة: ${otHours} س`,
        onExecute: performQuickReject
      });
    } else {
      await performQuickReject();
    }
  };

  const handleRejectAllPendingOvertime = async () => {
    const pendingPunches = monthPunches.filter(p => {
      const m = getShiftHoursMetrics(p, state);
      return !m.isOvertimeApproved && (m.overtimeStatus === 'pending' || p.overtimeStatus === 'pending') && m.overtimeHours > 0;
    });

    if (pendingPunches.length === 0) {
      showToast?.('ℹ️ لا توجد ساعات إضافية معلقة لرفضها');
      return;
    }

    const performRejectAll = async () => {
      const empIdStr = String(employee.id || '');
      const empCodeStr = employee.code ? String(employee.code) : '';
      const pendingDates = new Set(pendingPunches.map(p => p.date));
      const pendingIds = new Set(pendingPunches.map(p => String(p.id)));

      let totalRejectedHours = 0;

      const updatedShifts = (state.shifts || []).map((s) => {
        const isTarget = pendingIds.has(String(s.id)) ||
          ((String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode) === empCodeStr)) && pendingDates.has(s.date));

        if (isTarget) {
          const m = getShiftHoursMetrics(s, state);
          const otH = m.overtimeHours || parseFloat(s.overtimeHours) || 0;
          if (otH > 0 && (!m.isOvertimeApproved || s.overtimeStatus === 'pending')) {
            totalRejectedHours += otH;
            const regHours = s.regularHours !== undefined ? s.regularHours : m.regularHours;
            const cleanExistingNotes = (s.notes || s.note || '')
              .replace(/⏳?\s*إضافي قيد الاعتماد\s*(\(\+?[0-9.]+\s*س\))?/g, '')
              .replace(/قيد الاعتماد/g, '')
              .trim();
            const newNote = cleanExistingNotes
              ? `${cleanExistingNotes} | ❌ تم رفض الساعات الإضافية (+${otH} س) بواسطة الإدارة العليا`
              : `ساعات الوردية الأساسية (${regHours} س) — ❌ تم رفض الساعات الإضافية (+${otH} س) بواسطة الإدارة العليا`;

            return {
              ...s,
              hours: regHours,
              netHours: regHours,
              regularHours: regHours,
              overtimeHours: otH,
              overtimeStatus: 'rejected',
              adminApproved: false,
              rejectedOvertime: true,
              status: s.status === 'completed' ? 'completed' : 'approved',
              statusLabel: 'حضور معتمد (إضافي مرفوض)',
              note: newNote,
              notes: newNote,
              rejectedBy: 'الإدارة العليا',
              rejectedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
        }
        return s;
      });

      let hasUpdatedReq = false;
      const updatedRequests = (state.requests || []).map((r) => {
        const isTargetReq = (r.id && pendingIds.has(String(r.shiftId))) ||
          ((String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) &&
           (pendingDates.has(r.date) || pendingDates.has(r.targetDate) || pendingDates.has(r.details?.shiftDate)) &&
           (r.type === 'overtime' || r.type === 'طلب اضافي' || r.type === 'إضافي'));

        if (isTargetReq && (r.status === 'pending' || r.status === 'pending_admin' || !r.adminApproved)) {
          hasUpdatedReq = true;
          return {
            ...r,
            status: 'rejected',
            adminApproved: false,
            branchApproved: false,
            resolvedAt: new Date().toISOString(),
            adminNote: 'تم رفض كافة الساعات الإضافية المعلقة بواسطة الإدارة العليا'
          };
        }
        return r;
      });

      let nextState = {
        ...state,
        shifts: updatedShifts,
        requests: updatedRequests
      };

      if (setState) setState(nextState);

      let atomicSaved = false;
      try {
        const slicesToSave = { shifts: updatedShifts };
        if (hasUpdatedReq) {
          slicesToSave.requests = updatedRequests;
        }
        await apiSaveSettingsSlice(slicesToSave);
        atomicSaved = true;
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning in handleRejectAllPendingOvertime:', err);
      }

      if (atomicSaved) {
        try {
          await saveStateLocally(nextState);
          broadcastStateChange(nextState);
        } catch (locErr) {
          console.warn('[AttendancePunchesModal] Local save error:', locErr);
        }
      } else if (saveState) {
        await saveState(nextState);
      }

      showToast?.(`❌ تم رفض كافة الساعات الإضافية المعلقة (-${totalRejectedHours.toFixed(2)} س) بنجاح`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveOvertime',
        actionTitle: `رفض كافة الساعات الإضافية للموظف (${employee.name})`,
        actionDetails: `إجمالي الساعات المعلقة المراد رفضها: ${totalPendingOtHours.toFixed(2)} س`,
        onExecute: performRejectAll
      });
    } else {
      const isConfirmed = await showConfirm({
        title: 'رفض كافة الساعات الإضافية المعلقة',
        message: `هل تريد رفض جميع الساعات الإضافية المعلقة (${totalPendingOtHours.toFixed(2)} ساعة) لـ ${pendingPunches.length} وردية للموظف (${employee.name}) واستبعادها من الحساب المالي؟`,
        confirmText: 'تأكيد ورفض الكل',
        cancelText: 'إلغاء',
        type: 'danger',
        icon: '🚫'
      });
      if (isConfirmed) {
        await performRejectAll();
      }
    }
  };


  return (
    <div className="modal-backdrop">
      <div className="modal-content card" style={{ maxWidth: '1200px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0d9488', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              📋 سجل البصمات والورديات — {employee.name} (كود: {employee.code})
              <span style={{ background: manualCount > 0 ? '#fef3c7' : '#f1f5f9', color: manualCount > 0 ? '#b45309' : '#64748b', border: '1px solid ' + (manualCount > 0 ? '#fcd34d' : '#e2e8f0'), padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 800 }}>
                🖐️ بصمات يدوية هذا الشهر: {manualCount}
              </span>
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {isMultiBranch ? `الفروع: ${employeeBranchName}` : `الفرع: ${employeeBranchName}`} | المسمى الوظيفي: {employee.jobTitle} {periodLabel ? ` • (${periodLabel})` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {totalPendingOtHours > 0 && (
              <>
                <button
                  className="btn btn-success"
                  onClick={handleApproveAllPendingOvertime}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, #15803d, #16a34a)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                  }}
                  title="اعتماد كافة الساعات الإضافية المعلقة للموظف في هذا الشهر دفعة واحدة"
                >
                  ⭐ اعتماد الساعات الإضافية المعلقة ({totalPendingOtHours.toFixed(2)} س)
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleRejectAllPendingOvertime}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.25)'
                  }}
                  title="رفض كافة الساعات الإضافية المعلقة للموظف في هذا الشهر دفعة واحدة"
                >
                  🚫 رفض الساعات الإضافية المعلقة ({totalPendingOtHours.toFixed(2)} س)
                </button>
              </>
            )}
            <button
              className="btn btn-outline"
              onClick={handleSyncAndRecalculateWithRoster}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                padding: '6px 14px',
                background: '#f8fafc',
                color: '#0284c7',
                border: '1.5px solid #0284c7',
                borderRadius: '8px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
              title="إعادة فحص واحتساب بصمات الموظف لهذا الشهر ومطابقتها مع الجدول الشهري وتحديث الساعات الإضافية وإسقاط أي جزاءات تأخير ملغاة"
            >
              ⚡ مطابقة وإعادة احتساب مع الجدول الشهري
            </button>
            <button
              className="btn btn-start"
              onClick={() => handleOpenAddPunch()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                padding: '6px 14px',
                background: '#0d9488',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              ➕ تسجيل بصمة يدوية للموظف
            </button>
            <button
              className="btn btn-ghost modal-close-btn attendance-punches-close-btn"
              data-action="close"
              aria-label="إغلاق النافذة"
              onClick={onClose}
            >
              ✕ إغلاق Window
            </button>
          </div>
        </div>

        {/* ── Modal Month & Cycle Navigation Bar ── */}
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          border: '1.5px solid #a7f3d0',
          borderRadius: '12px',
          padding: '10px 16px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid #10b981', borderRadius: '8px', padding: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <button
                type="button"
                onClick={handleModalPrevMonth}
                title="الشهر السابق"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  color: '#065f46',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                ◀ الشهر السابق
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px', borderRight: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '14px' }}>📅</span>
                <input
                  type="month"
                  value={modalMonth}
                  onChange={(e) => handleModalMonthChange(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#065f46',
                    cursor: 'pointer',
                    background: 'transparent',
                    padding: '0 4px'
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleModalNextMonth}
                title="الشهر التالي"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  color: '#065f46',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                الشهر التالي ▶
              </button>
            </div>

            <button
              type="button"
              onClick={handleModalCurrentCycle}
              style={{
                background: (modalMonth === autoActiveCycle && modalFilterMode === 'month') ? '#059669' : '#fff',
                color: (modalMonth === autoActiveCycle && modalFilterMode === 'month') ? '#fff' : '#059669',
                border: '1.5px solid #059669',
                padding: '5px 12px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="العودة إلى دورة الرواتب الحالية"
            >
              <span>🎯</span>
              <span>الدورة الحالية</span>
            </button>

            <button
              type="button"
              onClick={handleModalToggleAll}
              style={{
                background: modalFilterMode === 'all' ? '#7c3aed' : '#fff',
                color: modalFilterMode === 'all' ? '#fff' : '#7c3aed',
                border: '1.5px solid #7c3aed',
                padding: '5px 12px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="عرض كافة بصمات الموظف المسجلة على الإطلاق بدون تقييد بالشهر"
            >
              <span>🌐</span>
              <span>{modalFilterMode === 'all' ? 'عرض الكل (نشط)' : 'كافة البصمات (الكل)'}</span>
            </button>
          </div>

          <div style={{
            background: modalFilterMode === 'all' ? '#ede9fe' : '#d1fae5',
            color: modalFilterMode === 'all' ? '#5b21b6' : '#065f46',
            border: `1px solid ${modalFilterMode === 'all' ? '#ddd6fe' : '#a7f3d0'}`,
            padding: '5px 14px',
            borderRadius: '8px',
            fontSize: '12.5px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>{modalFilterMode === 'all' ? '🌐' : '🗓️'}</span>
            <span>{periodLabel}</span>
            <span style={{ background: '#059669', color: '#fff', padding: '1px 7px', borderRadius: '6px', fontSize: '11px', marginRight: '6px' }}>
              {monthPunches.length} وردية
            </span>
          </div>
        </div>

        {showLiveBanner && (
          <div style={{ background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '26px' }}>🟢</span>
              <div>
                <strong style={{ color: '#065f46', fontSize: '15px' }}>
                  {livePunch?.isOvernight
                    ? 'الموظف على رأس العمل حالياً 🌙 (وردية ليلية عابرة لمنتصف الليل)'
                    : livePunch
                    ? 'الموظف على رأس العمل حالياً (حضور حي نشط)'
                    : 'توجد وردية مفتوحة للموظف بانتظار إنهاء الانصراف'}
                </strong>
                <div style={{ fontSize: '13px', color: '#047857', marginTop: '3px' }}>
                  {livePunch?.isOvernight && (
                    <span style={{ background: '#047857', color: '#fff', padding: '1px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, marginLeft: '6px', display: 'inline-block' }}>
                      🌙 وردية ليلية بدأت أمس
                    </span>
                  )}
                  تاريخ البدء: <strong>{(livePunch || unclosedLiveShift)?.date}</strong> | وقت الدخول: <strong>{(livePunch || unclosedLiveShift)?.timeIn}</strong>
                  {livePunch ? ` | المنقضي حتى الآن: ${activeElapsedHours} ساعة` : ' | الحالة: قيد العمل الآن'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {(() => {
                const liveObj = livePunch || unclosedLiveShift;
                const meth = getPunchMethodDetails(liveObj);
                return (
                  <span style={{
                    background: meth.bg,
                    color: meth.color,
                    border: `1px solid ${meth.border}`,
                    padding: '5px 14px',
                    borderRadius: '20px',
                    fontWeight: '800',
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <span>{meth.icon}</span>
                    <span>{meth.label}</span>
                    {meth.subText && (
                      <span style={{ fontSize: '10.5px', opacity: 0.85, borderRight: `1px solid ${meth.border}`, paddingRight: '6px', marginRight: '2px' }}>
                        {meth.subText}
                      </span>
                    )}
                  </span>
                );
              })()}
              <button
                className="btn btn-stop"
                style={{
                  padding: '7px 16px',
                  fontSize: '12.5px',
                  fontWeight: 'bold',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isStoppingShift ? 'not-allowed' : 'pointer',
                  opacity: isStoppingShift ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                disabled={isStoppingShift}
                onClick={handleStopLiveShift}
              >
                {isStoppingShift ? 'جاري الإنهاء...' : '⏹ إنهاء الوردية الآن'}
              </button>
            </div>
          </div>
        )}

        {showLeaveBanner && (
          <div style={{ background: '#f0f9ff', border: '1.5px solid #0284c7', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '26px' }}>🏖️</span>
              <div>
                <strong style={{ color: '#0369a1', fontSize: '15px' }}>
                  الموظف في إجازة معتمدة رسمية ({approvedLeaveToday.leaveType === 'unpaid' ? 'إجازة بدون أجر' : approvedLeaveToday.leaveType === 'sick' ? 'إجازة مرضية' : 'إجازة سنوية'})
                </strong>
                <div style={{ fontSize: '13px', color: '#0284c7', marginTop: '3px' }}>
                  فترة الإجازة: من <strong>{approvedLeaveToday.startDate}</strong> إلى <strong>{approvedLeaveToday.endDate || approvedLeaveToday.startDate}</strong> ({approvedLeaveToday.daysCount || 1} يوم) | الحالة: معتمدة ومسجلة بالنظام
                </div>
              </div>
            </div>
            <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', padding: '5px 14px', borderRadius: '20px', fontWeight: '800', fontSize: '12px' }}>
              🏖️ في إجازة معتمدة
            </span>
          </div>
        )}

        {showPastUnclosedBanner && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '26px' }}>⚠️</span>
              <div>
                <strong style={{ color: '#b45309', fontSize: '15px' }}>
                  توجد وردية سابقة غير مغلقة لم يتم تسجيل انصراف لها
                </strong>
                <div style={{ fontSize: '13px', color: '#92400e', marginTop: '3px' }}>
                  تاريخ البدء: <strong>{unclosedPastShift.date}</strong> | وقت الدخول: <strong>{unclosedPastShift.timeIn}</strong> | الحالة: معلقة (سابقة)
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="btn btn-warning"
                style={{ padding: '7px 16px', fontSize: '12.5px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: isStoppingShift ? 'not-allowed' : 'pointer' }}
                disabled={isStoppingShift}
                onClick={() => handleStopShiftForRow(unclosedPastShift)}
              >
                {isStoppingShift ? 'جاري الإغلاق...' : '⏹ إغلاق الوردية السابقة'}
              </button>
              <button
                className="del-btn"
                style={{ padding: '7px 14px', fontSize: '12.5px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                onClick={() => handleDeletePunch(unclosedPastShift)}
              >
                🗑️ حذف السجل غير المكتمل
              </button>
            </div>
          </div>
        )}

        {/* ── شريط فلاتر الخط الزمني لسجل البصمات (كافة الأيام / ورديات / إجازات / أيام راحة) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px 16px',
          background: 'var(--surface-muted, #f8fafc)',
          borderRadius: '12px',
          border: '1.5px solid var(--border)',
          marginBottom: '16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-secondary)' }}>
              📋 عرض السجل:
            </span>
            <button
              type="button"
              onClick={() => setTimelineFilter('all')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: timelineFilter === 'all' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#ffffff',
                color: timelineFilter === 'all' ? '#ffffff' : '#475569',
                border: timelineFilter === 'all' ? 'none' : '1px solid #cbd5e1'
              }}
              title="عرض أيام الحضور الفعلي والراحة المنقضية بالتسلسل"
            >
              🌐 كافة أيام الحضور والراحة ({timelineCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setTimelineFilter('shifts')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: timelineFilter === 'shifts' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#ffffff',
                color: timelineFilter === 'shifts' ? '#ffffff' : '#475569',
                border: timelineFilter === 'shifts' ? 'none' : '1px solid #cbd5e1'
              }}
            >
              ⏱️ الورديات الفعلية ({timelineCounts.shifts})
            </button>
            <button
              type="button"
              onClick={() => setTimelineFilter('leaves')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: timelineFilter === 'leaves' ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : '#ffffff',
                color: timelineFilter === 'leaves' ? '#ffffff' : '#475569',
                border: timelineFilter === 'leaves' ? 'none' : '1px solid #cbd5e1'
              }}
            >
              🏖️ الإجازات المعتمدة ({timelineCounts.leaves})
            </button>
            <button
              type="button"
              onClick={() => setTimelineFilter('off_days')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: timelineFilter === 'off_days' ? 'linear-gradient(135deg, #b45309, #92400e)' : '#ffffff',
                color: timelineFilter === 'off_days' ? '#ffffff' : '#475569',
                border: timelineFilter === 'off_days' ? 'none' : '1px solid #cbd5e1'
              }}
            >
              ☕ أيام الراحة المجدولة ({timelineCounts.offDays})
            </button>
            {timelineCounts.pastAbsences > 0 && (
              <button
                type="button"
                onClick={() => setTimelineFilter('past_absences')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: timelineFilter === 'past_absences' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#fef2f2',
                  color: timelineFilter === 'past_absences' ? '#ffffff' : '#dc2626',
                  border: timelineFilter === 'past_absences' ? 'none' : '1.5px solid #fca5a5'
                }}
                title="أيام عمل سابقة انقضت دون تسجيل حضور ودون عذر"
              >
                ⚠️ غياب سابق غير مسجل ({timelineCounts.pastAbsences})
              </button>
            )}
            {timelineCounts.futureDays > 0 && (
              <button
                type="button"
                onClick={() => setTimelineFilter('future_scheduled')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: timelineFilter === 'future_scheduled' ? 'linear-gradient(135deg, #0369a1, #0284c7)' : '#f0f9ff',
                  color: timelineFilter === 'future_scheduled' ? '#ffffff' : '#0369a1',
                  border: timelineFilter === 'future_scheduled' ? 'none' : '1.5px solid #bae6fd'
                }}
                title="معاينة جدول الورديات المجدولة للأيام القادمة حتى نهاية الشهر"
              >
                🔮 الأيام المتبقية بالدورة ({timelineCounts.futureDays})
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setTimelineSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: '#ffffff',
                color: '#0d9488',
                border: '1.5px solid #0d9488',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
              title={timelineSortOrder === 'asc' ? 'الترتيب الحالي: بالتسلسل الزمني المتصل من بداية الدورة حتى اليوم. اضغط للفرز التنازلي' : 'الترتيب الحالي: تنازلي من الأحدث إلى الأقدم. اضغط للفرز بالتسلسل'}
            >
              <span>{timelineSortOrder === 'asc' ? '⬆️ بالتسلسل (من البداية)' : '⬇️ تنازلي (من الأحدث)'}</span>
            </button>

            {attendanceTimeline?.progress?.isCurrentMonth && (
              <span style={{
                fontSize: '12px',
                background: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0',
                padding: '5px 12px',
                borderRadius: '20px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>📊</span>
                <span>اليوم {attendanceTimeline.progress.elapsedDays} من {attendanceTimeline.progress.totalDays}</span>
                <span style={{ opacity: 0.8 }}>(المتبقي: {attendanceTimeline.progress.remainingDays} يوم)</span>
              </span>
            )}

            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>
              📅 {periodLabel}
            </span>
          </div>
        </div>

        {isMultiBranch ? (
          <div>
            {/* شريط تصفية الفروع للموظف متعدد الفروع / حر */}
            {employeeBranchesList.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '18px', borderBottom: '1.5px solid var(--border)', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  🏢 تصفية حسب الفرع:
                </span>
                <button
                  type="button"
                  style={{
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    borderRadius: '20px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: selectedBranchFilter === 'all' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f1f5f9',
                    color: selectedBranchFilter === 'all' ? '#fff' : '#475569',
                    border: selectedBranchFilter === 'all' ? 'none' : '1px solid #cbd5e1'
                  }}
                  onClick={() => setSelectedBranchFilter('all')}
                >
                  🌐 كافة الفروع ({monthPunches.length})
                </button>
                {employeeBranchesList.map(b => {
                  const bPCount = monthPunches.filter(p => isBranchMatch(p.branchId, { id: b.branchId, branchId: b.branchId }) || (p.branchName && p.branchName.trim() === b.branchName.trim())).length;
                  const isSelected = selectedBranchFilter === String(b.branchId);
                  return (
                    <button
                      key={b.branchId}
                      type="button"
                      style={{
                        padding: '6px 14px',
                        fontSize: '12.5px',
                        borderRadius: '20px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        background: isSelected ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#f8fafc',
                        color: isSelected ? '#fff' : '#334155',
                        border: isSelected ? 'none' : '1px solid #e2e8f0'
                      }}
                      onClick={() => setSelectedBranchFilter(String(b.branchId))}
                    >
                      🏢 {b.branchName} ({bPCount})
                    </button>
                  );
                })}
              </div>
            )}

            {employeeBranchesList
              .filter(bd => selectedBranchFilter === 'all' || String(bd.branchId) === String(selectedBranchFilter))
              .map((bd) => {
                const bId = bd.branchId;
                const bObj = (state.branches || []).find((b) => isBranchMatch(bId, b));
                const bName = bObj ? bObj.name : (bd.branchName || `فرع ${bId}`);
                const targetB = bObj || { id: bId, branchId: bId, name: bd.branchName };
                const bPunches = monthPunches.filter((p) => {
                  const isMatch = isBranchMatch(p.branchId, targetB) || (p.branchName && bObj?.name && p.branchName.trim() === bObj.name.trim());
                  if (isMatch) return true;
                  if (!p.branchId && !p.branchName) {
                    return isBranchMatch(employeeBranchesList[0]?.branchId, targetB);
                  }
                  return false;
                });

                const bTimeline = displayedTimeline.filter((p) => {
                  if (p.recordType === 'off_day') {
                    if (p.isOtherBranchShift) return true;
                    if (p.branchId) {
                      return isBranchMatch(p.branchId, targetB) || (p.branchName && bObj?.name && p.branchName.trim() === bObj.name.trim());
                    }
                    return true;
                  }
                  if (p.recordType === 'missing_shift') {
                    if (p.branchId) {
                      return isBranchMatch(p.branchId, targetB) || (p.branchName && bObj?.name && p.branchName.trim() === bObj.name.trim());
                    }
                    return true;
                  }
                  if (p.recordType === 'leave') return true;
                  const isMatch = isBranchMatch(p.branchId, targetB) || (p.branchName && bObj?.name && p.branchName.trim() === bObj.name.trim());
                  if (isMatch) return true;
                  if (!p.branchId && !p.branchName) {
                    return isBranchMatch(employeeBranchesList[0]?.branchId, targetB);
                  }
                  return false;
                });

              const bShiftsCount = bPunches.length;
              const bTotalBreak = bPunches.reduce((acc, p) => acc + (parseFloat(p.breakHours) || 0), 0).toFixed(2);
              const bTotalWork = bPunches.reduce((acc, p) => acc + getShiftHoursMetrics(p, state).payableHours, 0).toFixed(2);
              const bTotalApprovedOt = bPunches.reduce((acc, p) => acc + (getShiftHoursMetrics(p, state).isOvertimeApproved ? getShiftHoursMetrics(p, state).overtimeHours : 0), 0);
              const bTotalPendingOt = bPunches.reduce((acc, p) => acc + (getShiftHoursMetrics(p, state).overtimeStatus === 'pending' ? getShiftHoursMetrics(p, state).overtimeHours : 0), 0);
              const bTotalRegHours = bPunches.reduce((acc, p) => acc + (getEffectiveShiftHours(p, state) || 0), 0);
              const bRate = getBranchRate(bId);
              const bTotalEarned = bPunches.reduce((acc, p) => {
                const isRej = p.isRejectedPhoto || p.status === 'rejected_photo' || (typeof p.statusLabel === 'string' && p.statusLabel.includes('رفض الصورة'));
                if (isRej) return acc;
                return acc + (getShiftHoursMetrics(p, state).payableHours * bRate);
              }, 0).toFixed(2);

              return (
                <div key={bId} style={{ marginBottom: '24px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--surface-muted)', padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '15px' }}>
                      🏢 سجل فرع: {bName} ({bShiftsCount} وردية فعلية)
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="badge info">إجمالي ساعات العمل: {bTotalWork} س</span>
                      <span className="badge success" style={{ background: '#dcfce7', color: '#15803d', fontWeight: '700', padding: '4px 10px', borderRadius: '8px' }}>
                        إجمالي المستحقات: {bTotalEarned} ج.م
                      </span>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="bylaws-table" style={{ fontSize: '13px', direction: 'rtl', margin: 0 }}>
                      <thead>
                        <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                          <th style={{ textAlign: 'center' }}>#</th>
                          <th>التاريخ</th>
                          <th>اليوم</th>
                          <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>نوع السجل / طريقة البصمة</th>
                          <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                          <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                          <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                          <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                          <th style={{ textAlign: 'center' }}>الملاحظات</th>
                          <th style={{ textAlign: 'center' }}>الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bTimeline.length === 0 ? (
                          <tr>
                            <td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                              لا توجد سجلات مطابقة في هذا الفرع لهذه الفترة.
                            </td>
                          </tr>
                        ) : (
                          bTimeline.map((p, index) => {
                            if (p.recordType === 'leave') {
                              return (
                                <tr key={p.id || `leave_${p.date}`} style={{ background: p.leaveBadge?.bg || '#f0f9ff', borderBottom: '1px solid ' + (p.leaveBadge?.border || '#bae6fd') }}>
                                  <td style={{ textAlign: 'center', fontWeight: 800, color: p.leaveBadge?.color || '#0284c7' }}>#{index + 1}</td>
                                  <td style={{ fontWeight: 800, color: p.leaveBadge?.color || '#0369a1' }}>{p.date}</td>
                                  <td style={{ fontWeight: 800 }}>{arabicWeekday(p.date)}</td>
                                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <span style={{
                                      background: p.leaveBadge?.bg || '#e0f2fe',
                                      color: p.leaveBadge?.color || '#0284c7',
                                      border: '1px solid ' + (p.leaveBadge?.border || '#bae6fd'),
                                      padding: '4px 10px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      <span>{p.leaveBadge?.icon || '🏖️'}</span>
                                      <span>{p.leaveTypeName || 'إجازة معتمدة'}</span>
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: '#0284c7', fontWeight: 800, fontSize: '12.5px' }}>
                                    {p.hours > 0 ? `${p.hours} س (مدفوعة)` : '0 س (بدون راتب)'}
                                  </td>
                                  <td style={{ textAlign: 'center', fontSize: '12px', color: '#0369a1', fontWeight: 700 }}>
                                    {p.notes || `${p.leaveTypeName} معتمدة رسمياً`}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      onClick={() => setSelectedDayDetails({ date: p.date, employee, record: p })}
                                      style={{ fontSize: '12px', padding: '3px 8px' }}
                                      title="عرض تفاصيل يوم الإجازة"
                                    >
                                      👁️ التفاصيل
                                    </button>
                                  </td>
                                </tr>
                              );
                            }

                            if (p.recordType === 'past_absence' || p.recordType === 'missing_shift') {
                              return (
                                <tr key={p.id || `absence_${p.date}`} style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                                  <td style={{ textAlign: 'center', fontWeight: 800, color: '#b45309' }}>#{index + 1}</td>
                                  <td style={{ fontWeight: 800, color: '#b45309' }}>{p.date}</td>
                                  <td style={{ fontWeight: 800, color: '#92400e' }}>{arabicWeekday(p.date)}</td>
                                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <span style={{
                                      background: '#fef3c7',
                                      color: '#92400e',
                                      border: '1px solid #fde68a',
                                      padding: '4px 10px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      <span>⚠️</span>
                                      <span>غياب سابق غير مسجل</span>
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center', color: '#b45309', fontWeight: 700 }}>
                                    {p.timeIn && p.timeIn !== '—' ? p.timeIn : '—'} <span style={{ fontSize: '10px', color: '#92400e' }}>(مقرر)</span>
                                  </td>
                                  <td style={{ textAlign: 'center', color: '#b45309', fontWeight: 700 }}>
                                    {p.timeOut && p.timeOut !== '—' ? p.timeOut : '—'} <span style={{ fontSize: '10px', color: '#92400e' }}>(مقرر)</span>
                                  </td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 800, fontSize: '12px' }}>
                                    0 س <span style={{ fontSize: '10.5px', color: '#92400e' }}>(مقرر {p.scheduledHours || 8} س)</span>
                                  </td>
                                  <td style={{ textAlign: 'center', fontSize: '11.5px', color: '#92400e', fontWeight: 700 }}>
                                    {p.notes || `يوم عمل ماضٍ (${p.date}) لم تسجل له بصمة ولم يكن راحة أو إجازة`}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      onClick={() => handleOpenAddPunch(p.date, p.branchId || (typeof bId !== 'undefined' ? bId : null), p.timeIn && p.timeIn !== '—' ? p.timeIn : '09:00', p.timeOut && p.timeOut !== '—' ? p.timeOut : '18:00')}
                                      style={{ fontSize: '11px', padding: '4px 10px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}
                                      title="تسجيل واحتساب بصمة يدوية لهذا اليوم"
                                    >
                                      ➕ تسجيل البصمة
                                    </button>
                                  </td>
                                </tr>
                              );
                            }

                            if (p.recordType === 'future_scheduled') {
                              return (
                                <tr key={p.id || `future_${p.date}`} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', opacity: 0.9 }}>
                                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b' }}>#{index + 1}</td>
                                  <td style={{ fontWeight: 700, color: '#475569' }}>{p.date}</td>
                                  <td style={{ fontWeight: 700, color: '#64748b' }}>{arabicWeekday(p.date)}</td>
                                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <span style={{
                                      background: '#f1f5f9',
                                      color: '#475569',
                                      border: '1px solid #cbd5e1',
                                      padding: '4px 10px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      <span>📅</span>
                                      <span>وردية مجدولة مستقبلاً</span>
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center', color: '#64748b' }}>{p.timeIn && p.timeIn !== '—' ? p.timeIn : '—'} <span style={{ fontSize: '10px' }}>(مقرر)</span></td>
                                  <td style={{ textAlign: 'center', color: '#64748b' }}>{p.timeOut && p.timeOut !== '—' ? p.timeOut : '—'} <span style={{ fontSize: '10px' }}>(مقرر)</span></td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>0 س <span style={{ fontSize: '10px' }}>(مقرر {p.scheduledHours || 8} س)</span></td>
                                  <td style={{ textAlign: 'center', fontSize: '11.5px', color: '#64748b' }}>وردية عمل مقررة بالجدول الشهري لم يحن موعدها بعد</td>
                                  <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11.5px' }}>—</td>
                                </tr>
                              );
                            }

                            if (p.recordType === 'off_day') {
                              return (
                                <tr key={p.id || `off_${p.date}`} style={{ background: p.isOtherBranchShift ? '#f8fafc' : '#fefce8', borderBottom: '1px solid ' + (p.isOtherBranchShift ? '#cbd5e1' : '#fde68a') }}>
                                  <td style={{ textAlign: 'center', fontWeight: 800, color: '#b45309' }}>#{index + 1}</td>
                                  <td style={{ fontWeight: 800, color: p.isOtherBranchShift ? '#1e40af' : '#b45309' }}>{p.date}</td>
                                  <td style={{ fontWeight: 800, color: p.isOtherBranchShift ? '#1e40af' : '#b45309' }}>{arabicWeekday(p.date)}</td>
                                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <span style={{
                                      background: p.isOtherBranchShift ? '#eff6ff' : '#fefce8',
                                      color: p.isOtherBranchShift ? '#1e40af' : '#92400e',
                                      border: '1px solid ' + (p.isOtherBranchShift ? '#bfdbfe' : '#fde68a'),
                                      padding: '4px 10px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      <span>{p.isOtherBranchShift ? '🏢' : '☕'}</span>
                                      <span>{p.isOtherBranchShift ? `مجدول بفرع ${p.otherBranchName}` : 'راحة أسبوعية (Off)'}</span>
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                                  <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>0 س</td>
                                  <td style={{ textAlign: 'center', fontSize: '11.5px', color: '#78350f' }}>
                                    {p.notes || (p.isOtherBranchShift ? `مجدول بفرع ${p.otherBranchName}` : 'راحة أسبوعية حسب جدول الروستر')}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      onClick={() => handleOpenAddPunch(p.date, p.branchId || (typeof bId !== 'undefined' ? bId : null))}
                                      style={{ fontSize: '11px', padding: '3px 8px', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '6px' }}
                                      title="تسجيل بصمة عمل يدوية في هذا اليوم"
                                    >
                                      ➕ إضافة بصمة
                                    </button>
                                  </td>
                                </tr>
                              );
                            }

                            const pDate = new Date(p.date || p.timestamp || Date.now());
                            const dayName = pDate.toLocaleDateString('ar-EG', { weekday: 'long' });
                            const dateStr = p.date || pDate.toISOString().slice(0, 10);
                            const isRejectedPhoto = p.isRejectedPhoto || p.status === 'rejected_photo' || (typeof p.statusLabel === 'string' && p.statusLabel.includes('رفض الصورة'));
                            const shiftMetrics = getShiftHoursMetrics(p, state);
                            const regH = shiftMetrics.regularHours;
                            const otH = shiftMetrics.isOvertimeApproved ? shiftMetrics.overtimeHours : 0;
                            const totalH = shiftMetrics.displayNetHours.toFixed(2);
                            const breakH = shiftMetrics.breakHours > 0 ? shiftMetrics.breakHours.toFixed(2) : (p.breakHours ? parseFloat(p.breakHours).toFixed(2) : null);
                            const shiftEarned = isRejectedPhoto ? '0.00' : (shiftMetrics.payableHours * bRate).toFixed(2);
                            const pendingOtAmount = (!shiftMetrics.isOvertimeApproved && shiftMetrics.overtimeStatus === 'pending' && shiftMetrics.overtimeHours > 0)
                              ? (shiftMetrics.overtimeHours * bRate).toFixed(2)
                              : null;

                            const isPermDecoupled = Boolean(p.unlinkPriorRequests || p.decoupledDay || p.ignorePermissions || p.hasApprovedPermission === false);
                            const perm = isPermDecoupled ? null : isApprovedPermissionForDate(employee?.id, dateStr, state);
                            const hasPerm = !isPermDecoupled && (Boolean(p.hasApprovedPermission) || !!perm);
                            const permHours = isPermDecoupled ? 0 : (p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0));

                            const linkedOtReq = (state?.requests || []).find(r => 
                              (r.id && (r.id === p.linkedRequestId || r.id === p.overtimeRequestId)) ||
                              ((String(r.employeeId) === String(employee?.id) || String(r.empId) === String(employee?.id)) &&
                               (r.date === dateStr || r.targetDate === dateStr || r.details?.shiftDate === dateStr) &&
                               (r.type === 'overtime' || r.type === 'طلب اضافي' || r.type === 'إضافي'))
                            );

                            const isManualAdminShift = Boolean(
                              p.isManual || p.manualPunch || p.editedByAdmin || p.isAdminCreated || p.unlinkPriorRequests || p.decoupledDay
                            );

                            // 🛡️ تحديد حالة الساعات الإضافية الموحدة:
                            // إذا كانت الوردية معدلة يدوياً من الإدارة، لا تسري عليها طلبات الرفض السابقة المعزولة
                            const isOtExplicitlyRejected = !isManualAdminShift
                              ? Boolean(
                                  p.overtimeStatus === 'rejected' ||
                                  p.rejectedOvertime === true ||
                                  shiftMetrics.overtimeStatus === 'rejected' ||
                                  (linkedOtReq && (linkedOtReq.status === 'rejected' || linkedOtReq.adminRejected === true))
                                )
                              : Boolean(p.overtimeStatus === 'rejected' && p.rejectedOvertime === true);

                            const isOtExplicitlyApproved = !isOtExplicitlyRejected && Boolean(
                              p.overtimeStatus === 'approved' ||
                              p.isOvertimeApproved === true ||
                              shiftMetrics.isOvertimeApproved === true ||
                              (!isManualAdminShift && linkedOtReq && (linkedOtReq.status === 'approved' || linkedOtReq.adminApproved === true))
                            );

                            const isOtPending = !isOtExplicitlyRejected && !isOtExplicitlyApproved && Boolean(
                              p.overtimeStatus === 'pending' ||
                              shiftMetrics.overtimeStatus === 'pending' ||
                              (!isManualAdminShift && linkedOtReq && (linkedOtReq.status === 'pending' || linkedOtReq.status === 'pending_admin'))
                            );

                            const finalOtHours = shiftMetrics.overtimeHours > 0 ? shiftMetrics.overtimeHours : (parseFloat(p.overtimeHours) || 0);

                            const effectiveOtStatus = isOtExplicitlyRejected
                              ? 'rejected'
                              : isOtExplicitlyApproved
                              ? 'approved'
                              : isOtPending
                              ? 'pending'
                              : (p.overtimeStatus || 'none');
                            const effectiveOtHours = isOtExplicitlyApproved ? finalOtHours : (linkedOtReq?.hours || p.overtimeHours || 0);

                            const linkedPenaltyReq = (state?.requests || []).find(r => 
                              (r.id && (r.id === p.penaltyRequestId || r.id === p.linkedPenaltyId)) ||
                              ((String(r.employeeId) === String(employee?.id) || String(r.empId) === String(employee?.id)) &&
                               (r.date === dateStr || r.targetDate === dateStr || r.details?.shiftDate === dateStr) &&
                               (r.type === 'penalty' || r.type === 'جزاء' || r.type === 'خصم' || r.type === 'إنذار' || r.type === 'disciplinary'))
                            );
                            const effectivePenaltyStatus = linkedPenaltyReq ? (linkedPenaltyReq.status === 'approved' ? 'approved' : linkedPenaltyReq.status === 'rejected' ? 'rejected' : 'pending') : (p.penaltyStatus || null);

                            let cleanNotes = p.notes || p.note || p.statusLabel || '';
                            if (effectiveOtStatus === 'approved') {
                              cleanNotes = cleanNotes
                                .replace(/❌\s*(تم رفض الساعات الإضافية|إضافي مرفوض)[^|]*/g, '')
                                .replace(/إضافي\s*قيد\s*الاعتماد/g, 'إضافي معتمد')
                                .replace(/قيد\s*الاعتماد/g, 'معتمد')
                                .replace(/\|\s*\|/g, '|')
                                .trim()
                                .replace(/^\|\s*|\s*\|$/g, '');
                            } else if (effectiveOtStatus === 'rejected') {
                              cleanNotes = cleanNotes.replace(/إضافي\s*قيد\s*الاعتماد/g, 'إضافي مرفوض').replace(/قيد\s*الاعتماد/g, 'مرفوض');
                            } else if (effectiveOtStatus === 'none') {
                              cleanNotes = cleanNotes
                                .replace(/❌\s*(تم رفض الساعات الإضافية|إضافي مرفوض)[^|]*/g, '')
                                .replace(/⏳?\s*إضافي\s*قيد\s*الاعتماد[^|]*/g, '')
                                .replace(/\|\s*\|/g, '|')
                                .trim()
                                .replace(/^\|\s*|\s*\|$/g, '');
                            }
                            if (effectivePenaltyStatus === 'approved') {
                              cleanNotes = cleanNotes.replace(/جزاء\s*قيد\s*الاعتماد/g, 'جزاء معتمد').replace(/خصم\s*قيد\s*الاعتماد/g, 'خصم معتمد');
                            } else if (effectivePenaltyStatus === 'rejected') {
                              cleanNotes = cleanNotes.replace(/جزاء\s*قيد\s*الاعتماد/g, 'جزاء مرفوض / ملغي').replace(/خصم\s*قيد\s*الاعتماد/g, 'خصم مرفوض / ملغي');
                            }

                            return (
                              <tr key={p.id || index} style={{ background: isRejectedPhoto ? '#fff1f2' : (hasPerm ? 'rgba(254, 243, 199, 0.25)' : 'transparent') }}>
                                <td style={{ textAlign: 'center', fontWeight: '700' }}>{index + 1}</td>
                                <td style={{ fontWeight: '700' }}>
                                  {dateStr}
                                  {isRejectedPhoto && (
                                    <span style={{ display: 'block', marginTop: '3px', background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      ⚠️ تم رفض البصمة بسبب رفض الصورة
                                    </span>
                                  )}
                                  {hasPerm && !isRejectedPhoto && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      ⏰ معدلة بإذن (+{permHours} س)
                                    </span>
                                  )}
                                  {isShiftManualPunch(p) && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      🖐️ بصمة يدوية
                                    </span>
                                  )}
                                  {p.isOfflineSynced && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }} title="سُجلت في وضع عدم الاتصال وموزامنة لاحقاً">
                                      📴 مزامنة أوفلاين {p.syncedAt ? `(${String(p.syncedAt).slice(11, 16)})` : ''}
                                    </span>
                                  )}
                                  {p.isEmergencyCover && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      🚨 تغطية طوارئ {p.surgeAllowance ? `(+${p.surgeAllowance} ج.م)` : ''}
                                    </span>
                                  )}
                                  {(p.isScheduledOffDay || p.isWorkOnOffDay) && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      ⚡ عمل في يوم راحة مجدول
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontWeight: '600' }}>{dayName}</td>
                                <td style={{ textAlign: 'center' }}>
                                  {(() => {
                                    const meth = getPunchMethodDetails(p);
                                    return (
                                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                        <span style={{
                                          background: meth.bg,
                                          color: meth.color,
                                          border: `1px solid ${meth.border}`,
                                          padding: '3px 8px',
                                          borderRadius: '8px',
                                          fontWeight: '800',
                                          fontSize: '11px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          <span>{meth.icon}</span>
                                          <span>{meth.label}</span>
                                        </span>
                                        {meth.subText && (
                                          <span style={{ fontSize: '9.5px', color: 'var(--muted)', opacity: 0.85, whiteSpace: 'nowrap' }}>
                                            {meth.subText}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '12.5px', display: 'inline-block' }}>
                                    {(p.timeIn && p.timeIn !== '—') ? p.timeIn : (p.checkIn || p.inTime || '—')}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {p.isLiveActive ? (
                                    <span style={{ background: p.isOvernight ? '#ecfdf5' : '#dcfce7', color: '#15803d', border: `1px solid ${p.isOvernight ? '#6ee7b7' : '#86efac'}`, padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      {p.isOvernight ? '🟢 🌙 وردية ليلية جارية' : '🟢 قيد العمل الآن'}
                                    </span>
                                  ) : (
                                    <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '12.5px', display: 'inline-block' }}>
                                      {(p.timeOut && p.timeOut !== '—' && p.timeOut !== 'قيد العمل الآن') ? p.timeOut : (p.checkOut || p.outTime || '—')}
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {breakH ? <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '10px', fontWeight: '700', fontSize: '12px' }}>{breakH} س</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ color: isRejectedPhoto ? '#dc2626' : '#0d9488', fontWeight: '800', fontSize: '13.5px' }}>
                                    {isRejectedPhoto ? '0.00 س' : `${parseFloat(totalH).toFixed(2)} س`}
                                  </div>
                                  {!isRejectedPhoto && isOtExplicitlyApproved && finalOtHours > 0 && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                      ⭐ +{finalOtHours.toFixed(2)} س إضافي معتمد
                                    </span>
                                  )}
                                  {!isRejectedPhoto && isOtPending && finalOtHours > 0 && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                      ⏳ +{finalOtHours.toFixed(2)} س إضافي معلق
                                    </span>
                                  )}
                                  {!isRejectedPhoto && isOtExplicitlyRejected && finalOtHours > 0 && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                      ❌ إضافي مرفوض (+{finalOtHours.toFixed(2)} س)
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDayDetails({
                                      punch: p,
                                      date: dateStr,
                                      dayName,
                                      employee,
                                      hourlyRate: bRate,
                                      regH,
                                      otH,
                                      totalH,
                                      breakH,
                                      shiftEarned,
                                      pendingOtAmount,
                                      hasPerm,
                                      perm,
                                      permHours,
                                      effectiveOtStatus,
                                      effectiveOtHours,
                                      effectivePenaltyStatus,
                                      linkedPenaltyReq,
                                      linkedOtReq,
                                      isManualShift: isShiftManualPunch(p),
                                      isRejectedPhoto,
                                      cleanNotes,
                                      source: p.source || 'kiosk'
                                    })}
                                    title="عرض تفاصيل اليوم"
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: '8px',
                                      border: '1px solid #cbd5e1',
                                      background: '#f8fafc',
                                      cursor: 'pointer',
                                      fontSize: '15px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#0f766e',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                    }}
                                  >
                                    📋
                                  </button>
                                </td>
                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                    {p.isLiveActive ? (
                                      <>
                                        <span style={{ color: '#059669', fontSize: '11px', fontWeight: '800', background: '#ecfdf5', padding: '3px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                          🟢 جاري الآن
                                        </span>
                                        <button
                                          className="btn btn-stop"
                                          style={{ padding: '3px 8px', fontSize: '11px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: isStoppingShift ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                          title="إنهاء الوردية وتسجيل وقت الانصراف"
                                          disabled={isStoppingShift}
                                          onClick={() => handleStopShiftForRow(p)}
                                        >
                                          ⏹ إنهاء
                                        </button>
                                        <button
                                          className="btn btn-ghost"
                                          style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                                          title="تعديل البصمة"
                                          onClick={() => handleOpenEdit(p)}
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          className="del-btn"
                                          style={{ padding: '3px 6px', fontSize: '11px' }}
                                          title="حذف البصمة"
                                          onClick={() => handleDeletePunch(p)}
                                        >
                                          🗑️
                                        </button>
                                      </>
                                    ) : p.isStaleUnclosed ? (
                                      <>
                                        <span style={{ color: '#b45309', fontSize: '11px', fontWeight: '800', background: '#fffbeb', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                          ⚠️ غير مكتملة
                                        </span>
                                        <button
                                          className="btn btn-warning"
                                          style={{ padding: '3px 8px', fontSize: '11px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: isStoppingShift ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                          title="إغلاق الوردية السابقة واعتماد ساعاتها"
                                          disabled={isStoppingShift}
                                          onClick={() => handleStopShiftForRow(p)}
                                        >
                                          ⏹ إغلاق
                                        </button>
                                        <button
                                          className="btn btn-ghost"
                                          style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                                          title="تعديل البصمة"
                                          onClick={() => handleOpenEdit(p)}
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          className="del-btn"
                                          style={{ padding: '3px 6px', fontSize: '11px' }}
                                          title="حذف البصمة"
                                          onClick={() => handleDeletePunch(p)}
                                        >
                                          🗑️
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        {isRejectedPhoto && (
                                          <button
                                            className="btn btn-success"
                                            style={{ padding: '3px 8px', fontSize: '11px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                            title="احتساب وتفعيل البصمة في نظام الأجور"
                                            onClick={() => handleApproveAndCalculateShift(p)}
                                          >
                                            ✅ احتساب البصمة
                                          </button>
                                        )}
                                        {!isRejectedPhoto && isOtPending && finalOtHours > 0 && (
                                          <>
                                            <button
                                              className="btn btn-success"
                                              style={{ padding: '3px 8px', fontSize: '11px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                              title="اعتماد الساعات الإضافية فوراً في نظام الرواتب"
                                              onClick={() => handleQuickApproveOvertime(p)}
                                            >
                                              ✅ اعتماد الإضافي (+{finalOtHours.toFixed(2)} س)
                                            </button>
                                            <button
                                              className="btn btn-danger"
                                              style={{ padding: '3px 8px', fontSize: '11px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                              title="رفض الساعات الإضافية واستبعادها من الحساب المالي"
                                              onClick={() => handleQuickRejectOvertime(p)}
                                            >
                                              ❌ رفض الإضافي
                                            </button>
                                          </>
                                        )}
                                        <button
                                          className="btn btn-ghost"
                                          style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                                          title="تعديل البصمة"
                                          onClick={() => handleOpenEdit(p)}
                                        >
                                          ✏️ تعديل
                                        </button>
                                        <button
                                          className="del-btn"
                                          style={{ padding: '3px 6px', fontSize: '11px' }}
                                          title="حذف البصمة"
                                          onClick={() => handleDeletePunch(p)}
                                        >
                                          🗑️
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {bPunches.length > 0 && (
                        <tfoot>
                          <tr style={{ background: '#f8fafc', fontWeight: '800', borderTop: '2px solid var(--border)' }}>
                            <td colSpan="4" style={{ textAlign: 'right', padding: '12px 16px' }}>الإجمالي ({bShiftsCount} وردية)</td>
                            <td></td>
                            <td></td>
                            <td style={{ textAlign: 'center' }}><span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '8px' }}>{bTotalBreak} س</span></td>
                            <td style={{ textAlign: 'center', color: '#0d9488' }}>
                              <div style={{ fontWeight: '800' }}>{bTotalWork} ساعة</div>
                              {bTotalApprovedOt > 0 && (
                                <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>
                                  ({bTotalRegHours.toFixed(2)} س أساسي + {bTotalApprovedOt.toFixed(2)} س إضافي معتمد)
                                </div>
                              )}
                              {bTotalPendingOt > 0 && (
                                <div style={{ fontSize: '10.5px', color: '#b45309', fontWeight: 'bold' }}>
                                  (+{bTotalPendingOt.toFixed(2)} س إضافي قيد المراجعة)
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: '800' }}>
                              {bTotalEarned} ج.م
                            </td>
                            <td></td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Single branch standard rendering */
          <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '10px' }}>
            <table className="bylaws-table" style={{ fontSize: '13px', direction: 'rtl', margin: 0 }}>
              <thead>
                <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                  <th style={{ textAlign: 'center' }}>#</th>
                  <th>التاريخ</th>
                  <th>اليوم</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>نوع السجل / طريقة البصمة</th>
                  <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                  <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                  <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                  <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                  <th style={{ textAlign: 'center' }}>الملاحظات</th>
                  <th style={{ textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {displayedTimeline.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      لا توجد سجلات مطابقة لهذا الموظف في هذه الفترة.
                    </td>
                  </tr>
                ) : (
                  displayedTimeline.map((p, index) => {
                    if (p.recordType === 'leave') {
                      return (
                        <tr key={p.id || `leave_${p.date}`} style={{ background: p.leaveBadge?.bg || '#f0f9ff', borderBottom: '1px solid ' + (p.leaveBadge?.border || '#bae6fd') }}>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: p.leaveBadge?.color || '#0284c7' }}>#{index + 1}</td>
                          <td style={{ fontWeight: 800, color: p.leaveBadge?.color || '#0369a1' }}>{p.date}</td>
                          <td style={{ fontWeight: 800 }}>{arabicWeekday(p.date)}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: p.leaveBadge?.bg || '#e0f2fe',
                              color: p.leaveBadge?.color || '#0284c7',
                              border: '1px solid ' + (p.leaveBadge?.border || '#bae6fd'),
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span>{p.leaveBadge?.icon || '🏖️'}</span>
                              <span>{p.leaveTypeName || 'إجازة معتمدة'}</span>
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: '#0284c7', fontWeight: 800, fontSize: '12.5px' }}>
                            {p.hours > 0 ? `${p.hours} س (مدفوعة)` : '0 س (بدون راتب)'}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#0369a1', fontWeight: 700 }}>
                            {p.notes || `${p.leaveTypeName} معتمدة رسمياً`}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setSelectedDayDetails({ date: p.date, employee, record: p })}
                              style={{ fontSize: '12px', padding: '3px 8px' }}
                              title="عرض تفاصيل يوم الإجازة"
                            >
                              👁️ التفاصيل
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    if (p.recordType === 'past_absence' || p.recordType === 'missing_shift') {
                      return (
                        <tr key={p.id || `absence_${p.date}`} style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#b45309' }}>#{index + 1}</td>
                          <td style={{ fontWeight: 800, color: '#b45309' }}>{p.date}</td>
                          <td style={{ fontWeight: 800, color: '#92400e' }}>{arabicWeekday(p.date)}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span>⚠️</span>
                              <span>غياب سابق غير مسجل</span>
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', color: '#b45309', fontWeight: 700 }}>
                            {p.timeIn && p.timeIn !== '—' ? p.timeIn : '—'} <span style={{ fontSize: '10px', color: '#92400e' }}>(مقرر)</span>
                          </td>
                          <td style={{ textAlign: 'center', color: '#b45309', fontWeight: 700 }}>
                            {p.timeOut && p.timeOut !== '—' ? p.timeOut : '—'} <span style={{ fontSize: '10px', color: '#92400e' }}>(مقرر)</span>
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 800, fontSize: '12px' }}>
                            0 س <span style={{ fontSize: '10.5px', color: '#92400e' }}>(مقرر {p.scheduledHours || 8} س)</span>
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '11.5px', color: '#92400e', fontWeight: 700 }}>
                            {p.notes || `يوم عمل ماضٍ (${p.date}) لم تسجل له بصمة ولم يكن راحة أو إجازة`}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleOpenAddPunch(p.date, p.branchId || null, p.timeIn && p.timeIn !== '—' ? p.timeIn : '09:00', p.timeOut && p.timeOut !== '—' ? p.timeOut : '18:00')}
                              style={{ fontSize: '11px', padding: '4px 10px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}
                              title="تسجيل واحتساب بصمة يدوية لهذا اليوم"
                            >
                              ➕ تسجيل البصمة
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    if (p.recordType === 'future_scheduled') {
                      return (
                        <tr key={p.id || `future_${p.date}`} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', opacity: 0.9 }}>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b' }}>#{index + 1}</td>
                          <td style={{ fontWeight: 700, color: '#475569' }}>{p.date}</td>
                          <td style={{ fontWeight: 700, color: '#64748b' }}>{arabicWeekday(p.date)}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: '#f1f5f9',
                              color: '#475569',
                              border: '1px solid #cbd5e1',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span>📅</span>
                              <span>وردية مجدولة مستقبلاً</span>
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{p.timeIn && p.timeIn !== '—' ? p.timeIn : '—'} <span style={{ fontSize: '10px' }}>(مقرر)</span></td>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{p.timeOut && p.timeOut !== '—' ? p.timeOut : '—'} <span style={{ fontSize: '10px' }}>(مقرر)</span></td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>0 س <span style={{ fontSize: '10px' }}>(مقرر {p.scheduledHours || 8} س)</span></td>
                          <td style={{ textAlign: 'center', fontSize: '11.5px', color: '#64748b' }}>وردية عمل مقررة بالجدول الشهري لم يحن موعدها بعد</td>
                          <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11.5px' }}>—</td>
                        </tr>
                      );
                    }

                    if (p.recordType === 'off_day') {
                      return (
                        <tr key={p.id || `off_${p.date}`} style={{ background: p.isOtherBranchShift ? '#f8fafc' : '#fefce8', borderBottom: '1px solid ' + (p.isOtherBranchShift ? '#cbd5e1' : '#fde68a') }}>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#b45309' }}>#{index + 1}</td>
                          <td style={{ fontWeight: 800, color: p.isOtherBranchShift ? '#1e40af' : '#b45309' }}>{p.date}</td>
                          <td style={{ fontWeight: 800, color: p.isOtherBranchShift ? '#1e40af' : '#b45309' }}>{arabicWeekday(p.date)}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: p.isOtherBranchShift ? '#eff6ff' : '#fefce8',
                              color: p.isOtherBranchShift ? '#1e40af' : '#92400e',
                              border: '1px solid ' + (p.isOtherBranchShift ? '#bfdbfe' : '#fde68a'),
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span>{p.isOtherBranchShift ? '🏢' : '☕'}</span>
                              <span>{p.isOtherBranchShift ? `مجدول بفرع ${p.otherBranchName}` : 'راحة أسبوعية (Off)'}</span>
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                          <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>0 س</td>
                          <td style={{ textAlign: 'center', fontSize: '11.5px', color: '#78350f' }}>
                            {p.notes || (p.isOtherBranchShift ? `مجدول بفرع ${p.otherBranchName}` : 'راحة أسبوعية حسب جدول الروستر')}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => handleOpenAddPunch(p.date, p.branchId || null)}
                              style={{ fontSize: '11px', padding: '3px 8px', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '6px' }}
                              title="تسجيل بصمة عمل يدوية في هذا اليوم"
                            >
                              ➕ إضافة بصمة
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const pDate = new Date(p.date || p.timestamp || Date.now());
                    const dayName = pDate.toLocaleDateString('ar-EG', { weekday: 'long' });
                    const dateStr = p.date || pDate.toISOString().slice(0, 10);
                    const isRejectedPhoto = p.isRejectedPhoto || p.status === 'rejected_photo' || (typeof p.statusLabel === 'string' && p.statusLabel.includes('رفض الصورة'));
                    const shiftMetrics = getShiftHoursMetrics(p, state);
                    const regH = shiftMetrics.regularHours;
                    const otH = shiftMetrics.isOvertimeApproved ? shiftMetrics.overtimeHours : 0;
                    const totalH = shiftMetrics.displayNetHours.toFixed(2);
                    const breakH = shiftMetrics.breakHours > 0 ? shiftMetrics.breakHours.toFixed(2) : (p.breakHours ? parseFloat(p.breakHours).toFixed(2) : null);
                    const shiftRate = getBranchRate(p.branchId || employee.branchId);
                    const shiftEarned = isRejectedPhoto ? '0.00' : (shiftMetrics.payableHours * shiftRate).toFixed(2);
                    const pendingOtAmount = (!shiftMetrics.isOvertimeApproved && shiftMetrics.overtimeStatus === 'pending' && shiftMetrics.overtimeHours > 0)
                      ? (shiftMetrics.overtimeHours * shiftRate).toFixed(2)
                      : null;

                    const isPermDecoupled = Boolean(p.unlinkPriorRequests || p.decoupledDay || p.ignorePermissions || p.hasApprovedPermission === false);
                    const perm = isPermDecoupled ? null : isApprovedPermissionForDate(employee?.id, dateStr, state);
                    const hasPerm = !isPermDecoupled && (Boolean(p.hasApprovedPermission) || !!perm);
                    const permHours = isPermDecoupled ? 0 : (p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0));

                    const linkedOtReq = (state?.requests || []).find(r => r && (r.id === p.requestId || r.id === p.linkedRequestId || r.id === p.overtimeRequestId || r.shiftId === p.id || (String(r.employeeId) === String(employee.id) && r.date === dateStr && (r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي'))));

                    const isManualAdminShift = Boolean(
                      p.isManual || p.manualPunch || p.editedByAdmin || p.isAdminCreated || p.unlinkPriorRequests || p.decoupledDay
                    );

                    // 🛡️ تحديد حالة الساعات الإضافية الموحدة:
                    // إذا كانت الوردية معدلة يدوياً من الإدارة، لا تسري عليها طلبات الرفض السابقة المعزولة
                    const isOtExplicitlyRejected = !isManualAdminShift
                      ? Boolean(
                          p.overtimeStatus === 'rejected' ||
                          p.rejectedOvertime === true ||
                          shiftMetrics.overtimeStatus === 'rejected' ||
                          (linkedOtReq && (linkedOtReq.status === 'rejected' || linkedOtReq.adminRejected === true))
                        )
                      : Boolean(p.overtimeStatus === 'rejected' && p.rejectedOvertime === true);

                    const isOtExplicitlyApproved = !isOtExplicitlyRejected && Boolean(
                      p.overtimeStatus === 'approved' ||
                      p.isOvertimeApproved === true ||
                      shiftMetrics.isOvertimeApproved === true ||
                      (!isManualAdminShift && linkedOtReq && (linkedOtReq.status === 'approved' || linkedOtReq.adminApproved === true))
                    );

                    const isOtPending = !isOtExplicitlyRejected && !isOtExplicitlyApproved && Boolean(
                      p.overtimeStatus === 'pending' ||
                      shiftMetrics.overtimeStatus === 'pending' ||
                      (!isManualAdminShift && linkedOtReq && (linkedOtReq.status === 'pending' || linkedOtReq.status === 'pending_admin'))
                    );

                    const finalOtHours = shiftMetrics.overtimeHours > 0 ? shiftMetrics.overtimeHours : (parseFloat(p.overtimeHours) || 0);

                    const effectiveOtStatus = isOtExplicitlyRejected
                      ? 'rejected'
                      : isOtExplicitlyApproved
                      ? 'approved'
                      : isOtPending
                      ? 'pending'
                      : (p.overtimeStatus || 'none');
                    const effectiveOtHours = isOtExplicitlyApproved ? finalOtHours : (linkedOtReq?.hours || p.overtimeHours || 0);

                    let cleanNotes = p.notes || p.note || p.statusLabel || '';
                    if (effectiveOtStatus === 'approved') {
                      cleanNotes = cleanNotes
                        .replace(/❌\s*(تم رفض الساعات الإضافية|إضافي مرفوض)[^|]*/g, '')
                        .replace(/إضافي\s*قيد\s*الاعتماد/g, 'إضافي معتمد')
                        .replace(/قيد\s*الاعتماد/g, 'معتمد')
                        .replace(/\|\s*\|/g, '|')
                        .trim()
                        .replace(/^\|\s*|\s*\|$/g, '');
                    } else if (effectiveOtStatus === 'rejected') {
                      cleanNotes = cleanNotes.replace(/إضافي\s*قيد\s*الاعتماد/g, 'إضافي مرفوض').replace(/قيد\s*الاعتماد/g, 'مرفوض');
                    } else if (effectiveOtStatus === 'none') {
                      cleanNotes = cleanNotes
                        .replace(/❌\s*(تم رفض الساعات الإضافية|إضافي مرفوض)[^|]*/g, '')
                        .replace(/⏳?\s*إضافي\s*قيد\s*الاعتماد[^|]*/g, '')
                        .replace(/\|\s*\|/g, '|')
                        .trim()
                        .replace(/^\|\s*|\s*\|$/g, '');
                    }

                    return (
                      <tr key={p.id || index} style={{ background: isRejectedPhoto ? '#fff1f2' : (hasPerm ? 'rgba(254, 243, 199, 0.25)' : 'transparent') }}>
                        <td style={{ textAlign: 'center', fontWeight: '700' }}>{index + 1}</td>
                        <td style={{ fontWeight: '700' }}>
                          {dateStr}
                          {isRejectedPhoto && (
                            <span style={{ display: 'block', marginTop: '3px', background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              ⚠️ تم رفض البصمة بسبب رفض الصورة
                            </span>
                          )}
                          {hasPerm && !isRejectedPhoto && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              ⏰ معدلة بإذن (+{permHours} س)
                            </span>
                          )}
                          {isShiftManualPunch(p) && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              🖐️ بصمة يدوية
                            </span>
                          )}
                          {p.isOfflineSynced && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }} title="سُجلت في وضع عدم الاتصال وموزامنة لاحقاً">
                              📴 مزامنة أوفلاين {p.syncedAt ? `(${String(p.syncedAt).slice(11, 16)})` : ''}
                            </span>
                          )}
                          {(p.branchId || p.branchName) && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              🏢 {getBranchName(p.branchId) || p.branchName}
                            </span>
                          )}
                          {p.isEmergencyCover && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              🚨 تغطية طوارئ {p.surgeAllowance ? `(+${p.surgeAllowance} ج.م)` : ''}
                            </span>
                          )}
                          {(p.isScheduledOffDay || p.isWorkOnOffDay) && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              ⚡ عمل في يوم راحة مجدول
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: '600' }}>{dayName}</td>
                        
                        {/* Punch Method / Source Badge */}
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const meth = getPunchMethodDetails(p);
                            return (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                <span style={{
                                  background: meth.bg,
                                  color: meth.color,
                                  border: `1px solid ${meth.border}`,
                                  padding: '3px 8px',
                                  borderRadius: '8px',
                                  fontWeight: '800',
                                  fontSize: '11px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span>{meth.icon}</span>
                                  <span>{meth.label}</span>
                                </span>
                                {meth.subText && (
                                  <span style={{ fontSize: '9.5px', color: 'var(--muted)', opacity: 0.85, whiteSpace: 'nowrap' }}>
                                    {meth.subText}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Entry Time Pill */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '12.5px',
                            display: 'inline-block'
                          }}>
                            {(p.timeIn && p.timeIn !== '—') ? p.timeIn : (p.checkIn || p.inTime || '—')}
                          </span>
                        </td>

                        {/* Exit Time Pill */}
                        <td style={{ textAlign: 'center' }}>
                          {p.isLiveActive ? (
                            <span style={{ background: p.isOvernight ? '#ecfdf5' : '#dcfce7', color: '#15803d', border: `1px solid ${p.isOvernight ? '#6ee7b7' : '#86efac'}`, padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {p.isOvernight ? '🟢 🌙 وردية ليلية جارية' : '🟢 قيد العمل الآن'}
                            </span>
                          ) : (
                            <span style={{
                              background: '#fee2e2',
                              color: '#b91c1c',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontWeight: '800',
                              fontSize: '12.5px',
                              display: 'inline-block'
                            }}>
                              {(p.timeOut && p.timeOut !== '—' && p.timeOut !== 'قيد العمل الآن') ? p.timeOut : (p.checkOut || p.outTime || '—')}
                            </span>
                          )}
                        </td>

                        {/* Break Hours Pill */}
                        <td style={{ textAlign: 'center' }}>
                          {breakH ? (
                            <span style={{
                              background: '#fef3c7',
                              color: '#b45309',
                              padding: '4px 8px',
                              borderRadius: '10px',
                              fontWeight: '700',
                              fontSize: '12px'
                            }}>
                              {breakH} س
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        {/* Net Hours */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ color: isRejectedPhoto ? '#dc2626' : '#0d9488', fontWeight: '800', fontSize: '13.5px' }}>
                            {isRejectedPhoto ? '0.00 س' : `${parseFloat(totalH).toFixed(2)} س`}
                          </div>
                          {!isRejectedPhoto && isOtExplicitlyApproved && finalOtHours > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              ⭐ +{finalOtHours.toFixed(2)} س إضافي معتمد
                            </span>
                          )}
                          {!isRejectedPhoto && isOtPending && finalOtHours > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              ⏳ +{finalOtHours.toFixed(2)} س إضافي معلق
                            </span>
                          )}
                          {!isRejectedPhoto && isOtExplicitlyRejected && finalOtHours > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              ❌ إضافي مرفوض (+{finalOtHours.toFixed(2)} س)
                            </span>
                          )}
                        </td>

                        {/* Notes - Icon-only button to open DayDetailsModal */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedDayDetails({
                              punch: p,
                              date: dateStr,
                              dayName,
                              employee,
                              hourlyRate: shiftRate,
                              regH,
                              otH,
                              totalH,
                              breakH,
                              shiftEarned,
                              pendingOtAmount,
                              hasPerm,
                              perm,
                              permHours,
                              effectiveOtStatus,
                              effectiveOtHours: isOtExplicitlyApproved ? finalOtHours : (linkedOtReq?.hours || p.overtimeHours || otH || 0),
                              effectivePenaltyStatus: p.penaltyStatus,
                              linkedPenaltyReq: null,
                              linkedOtReq,
                              isManualShift: isShiftManualPunch(p),
                              isRejectedPhoto,
                              cleanNotes,
                              source: p.source || 'kiosk'
                            })}
                            title="عرض تفاصيل اليوم"
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              cursor: 'pointer',
                              fontSize: '15px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#0f766e',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                          >
                            📋
                          </button>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                            {p.isLiveActive ? (
                              <>
                                <span style={{ color: '#059669', fontSize: '11px', fontWeight: '800', background: '#ecfdf5', padding: '3px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                  🟢 جاري الآن
                                </span>
                                <button
                                  className="btn btn-stop"
                                  style={{ padding: '3px 8px', fontSize: '11px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: isStoppingShift ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                  title="إنهاء الوردية وتسجيل وقت الانصراف"
                                  disabled={isStoppingShift}
                                  onClick={() => handleStopShiftForRow(p)}
                                >
                                  ⏹ إنهاء
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                                  title="تعديل البصمة"
                                  onClick={() => handleOpenEdit(p)}
                                >
                                  ✏️
                                </button>
                                <button
                                  className="del-btn"
                                  style={{ padding: '3px 6px', fontSize: '11px' }}
                                  title="حذف البصمة"
                                  onClick={() => handleDeletePunch(p)}
                                >
                                  🗑️
                                </button>
                              </>
                            ) : p.isStaleUnclosed ? (
                              <>
                                <span style={{ color: '#b45309', fontSize: '11px', fontWeight: '800', background: '#fffbeb', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                  ⚠️ غير مكتملة
                                </span>
                                <button
                                  className="btn btn-warning"
                                  style={{ padding: '3px 8px', fontSize: '11px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: isStoppingShift ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                  title="إغلاق الوردية السابقة واعتماد ساعاتها"
                                  disabled={isStoppingShift}
                                  onClick={() => handleStopShiftForRow(p)}
                                >
                                  ⏹ إغلاق
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                                  title="تعديل البصمة"
                                  onClick={() => handleOpenEdit(p)}
                                >
                                  ✏️
                                </button>
                                <button
                                  className="del-btn"
                                  style={{ padding: '3px 6px', fontSize: '11px' }}
                                  title="حذف البصمة"
                                  onClick={() => handleDeletePunch(p)}
                                >
                                  🗑️
                                </button>
                              </>
                            ) : (
                              <>
                                {isRejectedPhoto && (
                                  <button
                                    className="btn btn-success"
                                    style={{ padding: '3px 8px', fontSize: '11px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    title="احتساب وتفعيل البصمة في نظام الأجور"
                                    onClick={() => handleApproveAndCalculateShift(p)}
                                  >
                                    ✅ احتساب البصمة
                                  </button>
                                )}
                                {!isRejectedPhoto && isOtPending && finalOtHours > 0 && (
                                  <>
                                    <button
                                      className="btn btn-success"
                                      style={{ padding: '3px 8px', fontSize: '11px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                      title="اعتماد الساعات الإضافية فوراً في نظام الرواتب"
                                      onClick={() => handleQuickApproveOvertime(p)}
                                    >
                                      ✅ اعتماد الإضافي (+{finalOtHours.toFixed(2)} س)
                                    </button>
                                    <button
                                      className="btn btn-danger"
                                      style={{ padding: '3px 8px', fontSize: '11px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                      title="رفض الساعات الإضافية واستبعادها من الحساب المالي"
                                      onClick={() => handleQuickRejectOvertime(p)}
                                    >
                                      ❌ رفض الإضافي
                                    </button>
                                  </>
                                )}
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                                  title="تعديل البصمة"
                                  onClick={() => handleOpenEdit(p)}
                                >
                                  ✏️ تعديل
                                </button>
                                <button
                                  className="del-btn"
                                  style={{ padding: '3px 6px', fontSize: '11px' }}
                                  title="حذف البصمة"
                                  onClick={() => handleDeletePunch(p)}
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Footer Summary Row */}
              {monthPunches.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: '800', borderTop: '2px solid var(--border)' }}>
                    <td colSpan="4" style={{ textAlign: 'right', padding: '12px 16px' }}>
                      الإجمالي ({shiftsCount} وردية)
                    </td>
                    <td></td>
                    <td></td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '8px' }}>
                        {totalBreakHours} س
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#0d9488' }}>
                      <div style={{ fontWeight: '800' }}>{totalWorkHours} ساعة</div>
                      {totalApprovedOtHours > 0 && (
                        <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>
                          ({totalRegularHours.toFixed(2)} س أساسي + {totalApprovedOtHours.toFixed(2)} س إضافي معتمد)
                        </div>
                      )}
                      {totalPendingOtHours > 0 && (
                        <div style={{ fontSize: '10.5px', color: '#b45309', fontWeight: 'bold' }}>
                          (+{totalPendingOtHours.toFixed(2)} س إضافي قيد المراجعة)
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: '800' }}>
                      {totalEarned} ج.م
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Edit Punch Modal ── */}
        {editingPunch && (
          <div className="modal-backdrop" style={{ zIndex: 1100 }}>
            <div className="modal-content card" style={{ maxWidth: '520px', width: '90%', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, color: '#0284c7', fontSize: '16px' }}>
                  {isAddingNewPunch ? '➕ تسجيل بصمة يدوية جديدة للموظف' : '✏️ تعديل بصمة ووردية'} — {employee.name}
                </h4>
                <button className="btn btn-ghost" onClick={() => { setEditingPunch(null); setIsAddingNewPunch(false); }}>✕</button>
              </div>

              <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label>تاريخ البصمة</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label>وقت الحضور (الدخول)</label>
                    <input
                      type="time"
                      value={editTimeIn}
                      onChange={(e) => setEditTimeIn(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>وقت الانصراف (الخروج)</label>
                    <input
                      type="time"
                      value={editTimeOut}
                      onChange={(e) => setEditTimeOut(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMultiBranch ? '1fr 1fr' : '1fr', gap: '12px' }}>
                  <div className="field">
                    <label>ساعات البريك (استراحة)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="12"
                      value={editBreakHours}
                      onChange={(e) => setEditBreakHours(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setEditBreakHours('0')}
                        style={{ padding: '2px 6px', fontSize: '10.5px', background: editBreakHours === '0' ? '#0d9488' : '#f1f5f9', color: editBreakHours === '0' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        0 دقيقة
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditBreakHours('0.5')}
                        style={{ padding: '2px 6px', fontSize: '10.5px', background: editBreakHours === '0.5' ? '#0d9488' : '#f1f5f9', color: editBreakHours === '0.5' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        30 د (0.5 س)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditBreakHours('0.75')}
                        style={{ padding: '2px 6px', fontSize: '10.5px', background: editBreakHours === '0.75' ? '#0d9488' : '#f1f5f9', color: editBreakHours === '0.75' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        45 د (0.75 س)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditBreakHours('1')}
                        style={{ padding: '2px 6px', fontSize: '10.5px', background: editBreakHours === '1' ? '#0d9488' : '#f1f5f9', color: editBreakHours === '1' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        60 د (1.0 س)
                      </button>
                    </div>
                  </div>

                  {isMultiBranch && (
                    <div className="field">
                      <label>الفرع</label>
                      <select
                        value={editBranchId}
                        onChange={(e) => setEditBranchId(e.target.value)}
                      >
                        <option value="">-- اختر الفرع --</option>
                        {employeeBranchesList.length > 0 ? (
                          employeeBranchesList.map((bd) => (
                            <option key={bd.branchId} value={bd.branchId}>
                              {bd.branchName || getBranchName(bd.branchId)}
                            </option>
                          ))
                        ) : (
                          (state.branches || []).map((br) => (
                            <option key={br.id} value={br.id}>
                              {br.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  )}
                </div>

                {/* ── Live Reactive Calculation Card & Options ── */}
                {editPreviewMetrics && (
                  <div style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ⚡ احتساب الساعات اللحظي
                      </span>
                      {editPreviewMetrics.isOvernight && (
                        <span style={{ fontSize: '11px', fontWeight: '700', background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: '6px', border: '1px solid #ddd6fe' }}>
                          🌙 وردية ليلية (عابرة لمنتصف الليل)
                        </span>
                      )}
                    </div>

                    {/* Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                      <div style={{ background: '#fff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>إجمالي الفعلي</div>
                        <div style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>
                          {editPreviewMetrics.actualWorkedHours.toFixed(2)} س
                        </div>
                      </div>
                      <div style={{ background: '#fff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>الأساسي المقرر</div>
                        <div style={{ fontSize: '15px', fontWeight: '900', color: '#0284c7', marginTop: '2px' }}>
                          {editPreviewMetrics.regularHours.toFixed(2)} س
                        </div>
                      </div>
                      <div style={{ background: editPreviewMetrics.overtimeHours > 0 ? '#ecfdf5' : '#fff', padding: '8px', borderRadius: '8px', border: editPreviewMetrics.overtimeHours > 0 ? '1px solid #a7f3d0' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: editPreviewMetrics.overtimeHours > 0 ? '#047857' : '#64748b', fontWeight: '600' }}>الوقت الإضافي</div>
                        <div style={{ fontSize: '15px', fontWeight: '900', color: editPreviewMetrics.overtimeHours > 0 ? '#059669' : '#94a3b8', marginTop: '2px' }}>
                          {editPreviewMetrics.overtimeHours > 0 ? `+${editPreviewMetrics.overtimeHours.toFixed(2)} س` : '0.00 س'}
                        </div>
                      </div>
                    </div>

                    {/* Visual Timeline Bar */}
                    {editPreviewMetrics.totalElapsed > 0 && (
                      <div style={{ marginTop: '2px' }}>
                        <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#e2e8f0' }}>
                          <div
                            style={{
                              width: `${Math.min(100, (editPreviewMetrics.regularHours / (editPreviewMetrics.totalElapsed || 1)) * 100)}%`,
                              background: '#0284c7'
                            }}
                            title={`أساسي: ${editPreviewMetrics.regularHours} س`}
                          />
                          {editPreviewMetrics.overtimeHours > 0 && (
                            <div
                              style={{
                                width: `${Math.min(100, (editPreviewMetrics.overtimeHours / (editPreviewMetrics.totalElapsed || 1)) * 100)}%`,
                                background: '#10b981'
                              }}
                              title={`إضافي: ${editPreviewMetrics.overtimeHours} س`}
                            />
                          )}
                          {editPreviewMetrics.breakHours > 0 && (
                            <div
                              style={{
                                width: `${Math.min(100, (editPreviewMetrics.breakHours / (editPreviewMetrics.totalElapsed || 1)) * 100)}%`,
                                background: '#f59e0b'
                              }}
                              title={`بريك: ${editPreviewMetrics.breakHours} س`}
                            />
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: '700' }}>
                          <span style={{ color: '#0284c7' }}>■ أساسي ({editPreviewMetrics.regularHours.toFixed(2)} س)</span>
                          {editPreviewMetrics.overtimeHours > 0 && (
                            <span style={{ color: '#10b981' }}>■ إضافي (+{editPreviewMetrics.overtimeHours.toFixed(2)} س)</span>
                          )}
                          {editPreviewMetrics.breakHours > 0 && (
                            <span style={{ color: '#f59e0b' }}>■ استراحة ({editPreviewMetrics.breakHours.toFixed(2)} س)</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Smart Alert Banner when editing punch with prior rejected overtime */}
                    {Boolean(editingPunch && (editingPunch.overtimeStatus === 'rejected' || editingPunch.rejectedOvertime || (typeof editingPunch.statusLabel === 'string' && editingPunch.statusLabel.includes('إضافي مرفوض')))) && (
                      <div style={{
                        background: '#eff6ff',
                        border: '1.5px solid #93c5fd',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        color: '#1e40af',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}>
                        <span style={{ fontSize: '16px' }}>ℹ️</span>
                        <div>
                          <strong>تنبيه الإدارة الذكي:</strong> هذا اليوم كان يحتوي على إضافي مرفوض سابقاً. سيتم الآن فك الرفض تلقائياً، واعتماد الساعات الجديدة إن وُجدت، وتوثيق سجل التعديل بالكامل في ملاحظات اليوم.
                        </div>
                      </div>
                    )}

                    {/* Smart Decoupling & Approval Checkboxes */}
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                        <input
                          type="checkbox"
                          checked={editApproveOvertime}
                          onChange={(e) => setEditApproveOvertime(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                        />
                        <span>اعتماد الساعات الإضافية فوراً في الرواتب {editPreviewMetrics.overtimeHours > 0 ? `(+${editPreviewMetrics.overtimeHours.toFixed(2)} س)` : ''}</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                        <input
                          type="checkbox"
                          checked={editDecouplePriorDayRequests}
                          onChange={(e) => setEditDecouplePriorDayRequests(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#0284c7', cursor: 'pointer' }}
                        />
                        <span>فك ارتباط وتطهير أي طلبات أو أذونات سابقة لهذا اليوم (تصفير أي رفض سابق)</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="field">
                  <label>ملاحظات ومبرر التعديل</label>
                  <input
                    type="text"
                    placeholder="سبب تعديل أوقات البصمة..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>

                {/* ⚠️ تنبيه التعارض الزمني أو خرق مهلة التنقل بين الفروع */}
                {liveConflictResult?.hasConflict && (
                  <div style={{
                    background: '#fef2f2',
                    border: '1.5px solid #ef4444',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '12.5px',
                    color: '#991b1b',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.1)'
                  }}>
                    <div style={{ flex: 1, lineHeight: '1.5' }}>
                      <div>{liveConflictResult.message}</div>
                      {liveConflictResult.isSameBranch && liveConflictResult.conflictingShift && (
                        <div style={{ marginTop: '8px' }}>
                          <button
                            type="button"
                            style={{
                              background: '#b45309',
                              color: '#fff',
                              border: 'none',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                            onClick={() => {
                              handleOpenEdit(liveConflictResult.conflictingShift);
                            }}
                          >
                            <span>✏️</span>
                            <span>تعديل الوردية القائمة المذكورة وتحديث مواعيدها مباشرة</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => { setEditingPunch(null); setIsAddingNewPunch(false); }}>
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="btn btn-start"
                    style={{
                      opacity: liveConflictResult?.hasConflict ? 0.7 : 1,
                      cursor: liveConflictResult?.hasConflict ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isAddingNewPunch ? '💾 تسجيل واحتساب البصمة' : '💾 حفظ التعديلات'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Day Details Modal (نافذة تفاصيل اليوم) ── */}
        <DayDetailsModal details={selectedDayDetails} onClose={() => setSelectedDayDetails(null)} />
      </div>
    </div>
  );
}
