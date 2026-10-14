import React, { useState, useMemo } from 'react';
import { isApprovedPermissionForDate, getEffectiveShiftHours, getShiftHoursMetrics, recalculateEmployeeCycleLateness } from '../../utils/latePenaltyEngine';
import { calcRawDurationMinutes } from '../../utils/workHoursEngine';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';
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
  filterMode = 'month',
  customFrom = '',
  customTo = '',
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

  if (!employee) return null;

  const activePeriodFilter = (d) => {
    if (!d) return false;
    const dateStr = String(d).slice(0, 10);
    if (typeof filterFn === 'function') return filterFn(dateStr);
    return true;
  };

  const isCustom = (filterMode === 'custom' || filterMode === 'range') && customFrom && customTo;
  const periodLabel = isCustom ? `الفترة المخصصة: من ${customFrom} إلى ${customTo}` : (monthPicker ? `دورة شهر (${monthPicker})` : '');

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
    // صمام الأمان: الورديات المفتوحة لا تتجاوز 16 ساعة كحد أقصى تماشياً مع صمام أمان الـ 15 ساعة
    const isWithinSafetyValve = pEpoch > 0 && (Date.now() - pEpoch < 16 * 3600 * 1000);
    // الوردية تكون حية فقط إذا كانت غير مكتملة وضمن صمام الأمان (أقل من 16 ساعة)
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
  // إذا وجد سجلان لنفس الموظف في نفس التاريخ: يتم دمج السجل واختيار الوردية الأصح لمنع الازدواج في الكشف وحساب الساعات
  const monthPunches = useMemo(() => {
    const seenByDate = new Map();
    rawSortedPunches.forEach(p => {
      if (!p || !p.date) return;
      const key = p.date;
      if (!seenByDate.has(key)) {
        seenByDate.set(key, p);
      } else {
        const existing = seenByDate.get(key);
        const pIsManual = Boolean(p.isManual || p.manualPunch || p.adminApproved);
        const exIsManual = Boolean(existing.isManual || existing.manualPunch || existing.adminApproved);

        // إذا كان أحدهما يدوياً معتمداً من الإدارة: اليدوي المعتمد يفوز ويستبدل البيومتري القديم
        if (pIsManual && !exIsManual) {
          seenByDate.set(key, p);
        } else if (!pIsManual && exIsManual) {
          // keep existing manual
        } else {
          // إذا كان كلاهما بنفس الصفة: تفضيل من له وقت انصراف حقيقي وساعات أكبر من 0
          const pHasOut = Boolean(p.timeOut && p.timeOut !== '—' && p.timeOut !== '' && p.timeOut !== 'غير مسجل');
          const exHasOut = Boolean(existing.timeOut && existing.timeOut !== '—' && existing.timeOut !== '' && existing.timeOut !== 'غير مسجل');
          const pHrs = parseFloat(p.hours || p.actualWorkedHours || 0);
          const exHrs = parseFloat(existing.hours || existing.actualWorkedHours || 0);
          if (pHasOut && !exHasOut) {
            seenByDate.set(key, p);
          } else if (pHrs > 0 && exHrs === 0) {
            seenByDate.set(key, p);
          }
        }
      }
    });
    return Array.from(seenByDate.values()).sort((a, b) => {
      const dateA = String(a?.date || '').trim();
      const dateB = String(b?.date || '').trim();
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(b?.timeIn || '').localeCompare(String(a?.timeIn || ''));
    });
  }, [rawSortedPunches]);

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

      // دفع ذري مباشر ومتسلسل إلى السيرفر عبر apiSaveSettingsSlice
      try {
        await apiSaveSettingsSlice('activeShifts', updatedActive);
        await apiSaveSettingsSlice('shifts', updatedShifts);
        await apiSaveSettingsSlice('_endedShiftEmpIds', endedEmpIds);
      } catch (sliceErr) {
        console.warn('[AttendancePunchesModal] Direct slice save error:', sliceErr);
      }

      if (typeof saveState === 'function') {
        await saveState(nextState);
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
      if (p.branchId) {
        const bObj = (branches || []).find(b => isBranchMatch(p.branchId, b));
        const resolvedId = bObj ? bObj.id : p.branchId;
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

  const handleOpenAddPunch = () => {
    setIsAddingNewPunch(true);
    setEditingPunch({ id: `new_${Date.now()}` });
    setEditDate(new Date().toISOString().slice(0, 10));
    setEditTimeIn('09:00');
    setEditTimeOut('17:00');
    setEditBreakHours('0');
    setEditBranchId(employee.branchId || (employee.branchesDetails && employee.branchesDetails[0]?.branchId) || '');
    setEditNotes('');
  };

  const handleOpenEdit = (punch) => {
    setIsAddingNewPunch(false);
    setEditingPunch(punch);
    setEditDate(punch.date || new Date().toISOString().slice(0, 10));
    setEditTimeIn(punch.timeIn && punch.timeIn !== '—' ? punch.timeIn.slice(0, 5) : '09:00');
    const safeTimeOut = (punch.timeOut && punch.timeOut !== '—' && punch.timeOut !== 'قيد العمل الآن' && punch.timeOut !== 'قيد العمل') ? punch.timeOut.slice(0, 5) : '';
    setEditTimeOut(safeTimeOut);
    setEditBreakHours(String(punch.breakHours || 0));
    
    // مطابقة فرع البصمة مع قائمة فروع الموظف بدقة
    const currentBId = punch.branchId || employee.branchId || '';
    const matchingDetail = (employee.branchesDetails || []).find(bd => isBranchMatch(currentBId, { id: bd.branchId, branchId: bd.branchId, name: bd.branchName }));
    setEditBranchId(matchingDetail ? matchingDetail.branchId : currentBId);
    setEditNotes(punch.note || punch.notes || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPunch) return;

    // 0ms إغلاق فوري وقفل كامل لنافذة تسجيل/تعديل البصمة فور الضغط على زر الحفظ
    const snapIsAdding = Boolean(isAddingNewPunch);
    const snapEditingPunch = { ...editingPunch };
    const snapDate = editDate;
    const snapTimeIn = editTimeIn;
    const snapTimeOut = editTimeOut;
    const snapBreakHours = editBreakHours;
    const snapBranchId = editBranchId;
    const snapNotes = editNotes;

    setEditingPunch(null);
    setIsAddingNewPunch(false);

    const performSave = async () => {
      const inParts = (snapTimeIn || '09:00').split(':').map(Number);
      const outParts = (snapTimeOut || '17:00').split(':').map(Number);
      let diff = ((outParts[0] || 0) + (outParts[1] || 0) / 60) - ((inParts[0] || 0) + (inParts[1] || 0) / 60);
      if (diff <= 0) diff += 24;
      const bH = parseFloat(snapBreakHours) || 0;
      const calculatedHours = Math.max(0, Math.round((diff - bH) * 100) / 100);

      const daySched = getEmployeeDaySchedule(employee.id, snapDate, state);
      const profileHours = parseFloat(employee.workHoursPerDay || employee.workHours) || 8;
      let scheduledShiftHours = profileHours;
      if (daySched && daySched.start && daySched.end && daySched.type !== 'off') {
        const [sH, sM] = daySched.start.split(':').map(Number);
        const [eH, eM] = daySched.end.split(':').map(Number);
        let sMins = sH * 60 + (sM || 0);
        let eMins = eH * 60 + (eM || 0);
        if (eMins <= sMins) eMins += 24 * 60;
        scheduledShiftHours = Math.round(((eMins - sMins) / 60) * 100) / 100;
      } else if (daySched && daySched.hours && daySched.type !== 'off') {
        scheduledShiftHours = parseFloat(daySched.hours) || profileHours;
      }
      const regularHours = Math.min(calculatedHours, scheduledShiftHours);
      const overtimeHours = Math.max(0, Math.round((calculatedHours - scheduledShiftHours) * 100) / 100);
      const otStatus = overtimeHours > 0 ? 'approved' : 'none';

      const editedBObj = (state.branches || []).find(b => isBranchMatch(snapBranchId, b));
      const canonicalBranchId = editedBObj ? editedBObj.id : (snapBranchId || employee.branchId || '');
      const canonicalBranchName = editedBObj ? editedBObj.name : getBranchName(canonicalBranchId);

      let updatedShifts;
      let finalSavedShiftId = '';

      if (snapIsAdding) {
        const existingIdx = (state.shifts || []).findIndex(s =>
          (String(s.employeeId) === String(employee.id) || (employee.code && String(s.employeeCode) === String(employee.code))) &&
          s.date === snapDate &&
          s.status !== 'cancelled' && !s.isCancelled
        );

        finalSavedShiftId = existingIdx >= 0 ? state.shifts[existingIdx].id : `punch_manual_${Date.now()}`;
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
          hours: regularHours,
          workHours: regularHours,
          regularHours: regularHours,
          scheduledHours: scheduledShiftHours,
          actualWorkedHours: calculatedHours,
          netHours: calculatedHours,
          overtimeHours: overtimeHours,
          overtimeStatus: otStatus,
          isManual: true,
          manualPunch: true,
          createdBy: 'admin',
          creatorRole: 'admin',
          isAdminCreated: true,
          adminApproved: true,
          statusLabel: overtimeHours > 0 ? 'تسجيل يدوي (مع إضافي معتمد)' : 'تسجيل يدوي من الإدارة',
          note: (snapNotes.trim() ? snapNotes.trim() + ' | ' : '') + 'تسجيل بصمة يدوية بواسطة الإدارة العليا' + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
          createdAt: existingIdx >= 0 ? (state.shifts[existingIdx].createdAt || new Date().toISOString()) : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (existingIdx >= 0) {
          updatedShifts = (state.shifts || []).map((s, idx) => idx === existingIdx ? { ...s, ...newShiftPayload } : s);
        } else {
          updatedShifts = [newShiftPayload, ...(state.shifts || [])];
        }

        // صمام الأمان لمنع تكرار أي وردية أخرى لنفس الموظف في نفس اليوم
        updatedShifts = updatedShifts.filter(s => {
          if (!s) return false;
          if (s.id === finalSavedShiftId) return true;
          const isSameDay = (String(s.employeeId) === String(employee.id) || (employee.code && String(s.employeeCode) === String(employee.code))) && s.date === snapDate;
          return !isSameDay;
        });
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
              hours: regularHours,
              workHours: regularHours,
              regularHours: regularHours,
              scheduledHours: scheduledShiftHours,
              actualWorkedHours: calculatedHours,
              netHours: calculatedHours,
              overtimeHours: overtimeHours,
              overtimeStatus: otStatus,
              adminApproved: true,
              branchId: canonicalBranchId,
              branchName: canonicalBranchName,
              note: (snapNotes.trim() ? snapNotes.trim() + ' | ' : '') + (s.note || 'تم تعديل البصمة بواسطة الإدارة العليا') + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
              notes: (snapNotes.trim() ? snapNotes.trim() + ' | ' : '') + (s.notes || 'تم تعديل البصمة بواسطة الإدارة العليا') + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
              statusLabel: overtimeHours > 0 ? 'معدلة من الإدارة (مع إضافي معتمد)' : 'معدلة من الإدارة',
              isManual: true,
              manualPunch: true,
              editedByAdmin: true,
              editedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
          return s;
        });

        // صمام الأمان لمنع تكرار أي وردية أخرى لنفس الموظف في نفس اليوم
        updatedShifts = updatedShifts.filter(s => {
          if (!s) return false;
          if (String(s.id) === finalSavedShiftId) return true;
          const isSameDay = (String(s.employeeId) === String(employee.id) || (employee.code && String(s.employeeCode) === String(employee.code))) && s.date === snapDate;
          return !isSameDay;
        });
      }

      // إذا كانت البصمة المعدلة هي الوردية الحية النشطة، نقوم بتحديث فرعها وتوقيتها في activeShifts أيضاً
      let updatedActiveShifts = { ...(state.activeShifts || {}) };
      const curActive = updatedActiveShifts[employee.id] || updatedActiveShifts[String(employee.id)] || (employee.code && updatedActiveShifts[employee.code]);
      if (curActive && (snapEditingPunch.isLiveActive || String(curActive.shiftId) === String(finalSavedShiftId) || curActive.date === snapDate)) {
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

      let updatedState = { ...state, shifts: updatedShifts, activeShifts: updatedActiveShifts };

      // Auto recalculate late incidents
      const recRes = recalculateEmployeeCycleLateness({
        employeeId: employee.id,
        state: updatedState,
        payrollCycleId: snapDate.slice(0, 7)
      });
      let finalRequests = (recRes.updatedRequests || state.requests || []).map(r => {
        const isMatch = (
          (String(r.employeeId) === String(employee.id) || (employee.code && String(r.employeeCode) === String(employee.code))) &&
          (r.date === snapDate || r.targetDate === snapDate || r.details?.shiftDate === snapDate) &&
          (r.type === 'overtime' || r.type === 'طلب اضافي' || r.type === 'إضافي')
        );
        if (isMatch) {
          return {
            ...r,
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            hours: overtimeHours > 0 ? overtimeHours : r.hours,
            resolvedAt: new Date().toISOString(),
            adminNote: 'تم اعتماد وتحديث الإضافي تلقائياً من تعديل البصمة بالإدارة'
          };
        }
        return r;
      });

      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: finalRequests
      };

      if (setState) setState(updatedState);

      try {
        await apiSaveSettingsSlice('shifts', updatedShifts);
        await apiSaveSettingsSlice('requests', finalRequests);
      } catch (sliceErr) {
        console.warn('[AttendancePunchesModal] Slice save in handleSaveEdit:', sliceErr);
      }

      try {
        if (saveState) await saveState(updatedState);
      } catch (saveErr) {
        console.warn('[AttendancePunchesModal] saveState error in handleSaveEdit:', saveErr);
      }

      if (snapIsAdding) {
        showToast?.(`✅ تم تسجيل البصمة اليدوية بنجاح: ${regularHours} س أساسي${overtimeHours > 0 ? ` + ${overtimeHours} س إضافي معتمد تلقائياً` : ''}`);
        return;
      }

      const lateInc = (recRes.incidents || []).find((inc) => (String(inc.shiftId) === String(finalSavedShiftId) || inc.date === snapDate) && inc.lateMinutes > 0);
      if (lateInc && lateInc.deductionMinutes > 0) {
        showToast?.(`✅ تم حفظ التعديل وتطبيق لائحة الجزاءات تلقائياً: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.tierName} (${lateInc.actionLabel} - خصم ${lateInc.penaltyAmount} ج.م)`);
      } else if (lateInc && lateInc.lateMinutes > 0) {
        showToast?.(`✅ تم حفظ التعديل: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.actionLabel || 'فترة سماح'}`);
      } else if (overtimeHours > 0) {
        showToast?.(`✅ تم حفظ تعديل البصمة واحتساب الإضافي تلقائياً: ${regularHours} س أساسي + ${overtimeHours} س إضافي معتمد`);
      } else {
        showToast?.('✅ تم حفظ وتعديل بيانات البصمة وإعادة احتساب الجزاءات بنجاح!');
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
        requests: updatedRequests,
        activeShifts: updatedActiveShifts,
        _deletedIds: updatedDeletedIds
      };

      // 6. إعادة احتساب وقائع التأخير للدورة المحاسبية
      const recRes = recalculateEmployeeCycleLateness({
        employeeId: employee.id,
        state: updatedState,
        payrollCycleId: (punch.date || '').slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

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

      // إعادة احتساب الجزاءات والتأخيرات تلقائياً
      const recRes = recalculateEmployeeCycleLateness({
        employeeId: employee.id,
        state: updatedState,
        payrollCycleId: punchDate.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

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

      try {
        await apiSaveSettingsSlice('shifts', updatedShifts);
        if (hasUpdatedReq) {
          await apiSaveSettingsSlice('requests', updatedRequests);
        }
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning:', err);
      }

      if (saveState) await saveState(nextState);

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

      try {
        await apiSaveSettingsSlice('shifts', updatedShifts);
        await apiSaveSettingsSlice('requests', updatedRequests);
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning:', err);
      }

      if (saveState) await saveState(nextState);

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

      try {
        await apiSaveSettingsSlice('shifts', updatedShifts);
        if (hasUpdatedReq) {
          await apiSaveSettingsSlice('requests', updatedRequests);
        }
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning in handleQuickRejectOvertime:', err);
      }

      if (saveState) await saveState(nextState);

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

      try {
        await apiSaveSettingsSlice('shifts', updatedShifts);
        if (hasUpdatedReq) {
          await apiSaveSettingsSlice('requests', updatedRequests);
        }
      } catch (err) {
        console.warn('[AttendancePunchesModal] Slice save warning in handleRejectAllPendingOvertime:', err);
      }

      if (saveState) await saveState(nextState);

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
              className="btn btn-start"
              onClick={handleOpenAddPunch}
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
            <button className="btn btn-ghost" onClick={onClose}>✕ إغلاق Window</button>
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
                      🏢 بصمات فرع: {bName} ({bShiftsCount} وردية)
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
                          <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>طريقة البصمة</th>
                          <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                          <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                          <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                          <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                          <th style={{ textAlign: 'center' }}>الملاحظات</th>
                          <th style={{ textAlign: 'center' }}>الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bPunches.length === 0 ? (
                          <tr>
                            <td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                              لا توجد بصمات مسجلة بهذا الفرع في هذا الشهر.
                            </td>
                          </tr>
                        ) : (
                          bPunches.map((p, index) => {
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

                            const perm = isApprovedPermissionForDate(employee?.id, dateStr, state);
                            const hasPerm = p.hasApprovedPermission || !!perm;
                            const permHours = p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);

                            const linkedOtReq = (state?.requests || []).find(r => 
                              (r.id && (r.id === p.linkedRequestId || r.id === p.overtimeRequestId)) ||
                              ((String(r.employeeId) === String(employee?.id) || String(r.empId) === String(employee?.id)) &&
                               (r.date === dateStr || r.targetDate === dateStr || r.details?.shiftDate === dateStr) &&
                               (r.type === 'overtime' || r.type === 'طلب اضافي' || r.type === 'إضافي'))
                            );
                            const effectiveOtStatus = (p.overtimeStatus === 'approved' || p.overtimeStatus === 'rejected')
                              ? p.overtimeStatus
                              : (linkedOtReq ? (linkedOtReq.status === 'approved' ? 'approved' : linkedOtReq.status === 'rejected' ? 'rejected' : 'pending') : (p.overtimeStatus || (shiftMetrics.isOvertimeApproved ? 'approved' : shiftMetrics.overtimeStatus) || 'none'));
                            const effectiveOtHours = parseFloat(linkedOtReq?.hours || p.overtimeHours || (effectiveOtStatus === 'approved' ? otH : 0) || 0);

                            const linkedPenaltyReq = (state?.requests || []).find(r => 
                              (r.id && (r.id === p.penaltyRequestId || r.id === p.linkedPenaltyId)) ||
                              ((String(r.employeeId) === String(employee?.id) || String(r.empId) === String(employee?.id)) &&
                               (r.date === dateStr || r.targetDate === dateStr || r.details?.shiftDate === dateStr) &&
                               (r.type === 'penalty' || r.type === 'جزاء' || r.type === 'خصم' || r.type === 'إنذار' || r.type === 'disciplinary'))
                            );
                            const effectivePenaltyStatus = linkedPenaltyReq ? (linkedPenaltyReq.status === 'approved' ? 'approved' : linkedPenaltyReq.status === 'rejected' ? 'rejected' : 'pending') : (p.penaltyStatus || null);

                            let cleanNotes = p.notes || p.note || p.statusLabel || '';
                            if (effectiveOtStatus === 'approved') {
                              cleanNotes = cleanNotes.replace(/إضافي\s*قيد\s*الاعتماد/g, 'إضافي معتمد').replace(/قيد\s*الاعتماد/g, 'معتمد');
                            } else if (effectiveOtStatus === 'rejected') {
                              cleanNotes = cleanNotes.replace(/إضافي\s*قيد\s*الاعتماد/g, 'إضافي مرفوض').replace(/قيد\s*الاعتماد/g, 'مرفوض');
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
                                      📴 مزامنة أوفلاين {p.syncedAt ? `(${p.syncedAt.slice(11, 16)})` : ''}
                                    </span>
                                  )}
                                  {p.isEmergencyCover && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      🚨 تغطية طوارئ {p.surgeAllowance ? `(+${p.surgeAllowance} ج.م)` : ''}
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
                                    {p.timeIn || p.checkIn || p.inTime || '09:00'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {p.isLiveActive ? (
                                    <span style={{ background: p.isOvernight ? '#ecfdf5' : '#dcfce7', color: '#15803d', border: `1px solid ${p.isOvernight ? '#6ee7b7' : '#86efac'}`, padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      {p.isOvernight ? '🟢 🌙 وردية ليلية جارية' : '🟢 قيد العمل الآن'}
                                    </span>
                                  ) : (
                                    <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '12.5px', display: 'inline-block' }}>
                                      {p.timeOut || p.checkOut || p.outTime || '17:00'}
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
                                  {!isRejectedPhoto && otH > 0 && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                      ⭐ +{otH.toFixed(2)} س إضافي معتمد
                                    </span>
                                  )}
                                  {!isRejectedPhoto && !shiftMetrics.isOvertimeApproved && (shiftMetrics.overtimeStatus === 'pending' || effectiveOtStatus === 'pending') && shiftMetrics.overtimeHours > 0 && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                      ⏳ +{shiftMetrics.overtimeHours.toFixed(2)} س إضافي معلق
                                    </span>
                                  )}
                                  {!isRejectedPhoto && (shiftMetrics.overtimeStatus === 'rejected' || p.overtimeStatus === 'rejected' || p.rejectedOvertime || effectiveOtStatus === 'rejected') && shiftMetrics.overtimeHours > 0 && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                      ❌ إضافي مرفوض (+{shiftMetrics.overtimeHours.toFixed(2)} س)
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
                                        {!shiftMetrics.isOvertimeApproved && (shiftMetrics.overtimeStatus === 'pending' || effectiveOtStatus === 'pending') && shiftMetrics.overtimeHours > 0 && (
                                          <>
                                            <button
                                              className="btn btn-success"
                                              style={{ padding: '3px 8px', fontSize: '11px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                              title="اعتماد الساعات الإضافية فوراً في نظام الرواتب"
                                              onClick={() => handleQuickApproveOvertime(p)}
                                            >
                                              ✅ اعتماد الإضافي (+{shiftMetrics.overtimeHours.toFixed(2)} س)
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
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>طريقة البصمة</th>
                  <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                  <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                  <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                  <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                  <th style={{ textAlign: 'center' }}>الملاحظات</th>
                  <th style={{ textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {monthPunches.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      لا توجد بصمات مسجلة لهذا الموظف في هذا الشهر.
                    </td>
                  </tr>
                ) : (
                  monthPunches.map((p, index) => {
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

                    const perm = isApprovedPermissionForDate(employee?.id, dateStr, state);
                    const hasPerm = p.hasApprovedPermission || !!perm;
                    const permHours = p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);

                    const linkedOtReq = (state?.requests || []).find(r => r && (r.id === p.requestId || r.id === p.linkedRequestId || r.id === p.overtimeRequestId || r.shiftId === p.id || (String(r.employeeId) === String(employee.id) && r.date === dateStr && (r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي'))));
                    const effectiveOtStatus = (p.overtimeStatus === 'approved' || p.overtimeStatus === 'rejected')
                      ? p.overtimeStatus
                      : (linkedOtReq
                        ? (linkedOtReq.status === 'approved' ? 'approved' : linkedOtReq.status === 'rejected' ? 'rejected' : 'pending')
                        : (p.overtimeStatus || (shiftMetrics.isOvertimeApproved ? 'approved' : shiftMetrics.overtimeStatus) || 'none'));

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
                              📴 مزامنة أوفلاين {p.syncedAt ? `(${p.syncedAt.slice(11, 16)})` : ''}
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
                            {p.timeIn || p.checkIn || p.inTime || '09:00'}
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
                              {p.timeOut || p.checkOut || p.outTime || '17:00'}
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
                          {!isRejectedPhoto && otH > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              ⭐ +{otH.toFixed(2)} س إضافي معتمد
                            </span>
                          )}
                          {!isRejectedPhoto && !shiftMetrics.isOvertimeApproved && (shiftMetrics.overtimeStatus === 'pending' || effectiveOtStatus === 'pending') && shiftMetrics.overtimeHours > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              ⏳ +{shiftMetrics.overtimeHours.toFixed(2)} س إضافي معلق
                            </span>
                          )}
                          {!isRejectedPhoto && (shiftMetrics.overtimeStatus === 'rejected' || p.overtimeStatus === 'rejected' || p.rejectedOvertime || effectiveOtStatus === 'rejected') && shiftMetrics.overtimeHours > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '3px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              ❌ إضافي مرفوض (+{shiftMetrics.overtimeHours.toFixed(2)} س)
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
                              effectiveOtStatus: p.overtimeStatus,
                              effectiveOtHours: parseFloat(p.overtimeHours || otH || 0),
                              effectivePenaltyStatus: p.penaltyStatus,
                              linkedPenaltyReq: null,
                              linkedOtReq: null,
                              isManualShift: isShiftManualPunch(p),
                              isRejectedPhoto,
                              cleanNotes: p.notes || p.note || p.statusLabel || '',
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
                                {!shiftMetrics.isOvertimeApproved && (shiftMetrics.overtimeStatus === 'pending' || effectiveOtStatus === 'pending') && shiftMetrics.overtimeHours > 0 && (
                                  <>
                                    <button
                                      className="btn btn-success"
                                      style={{ padding: '3px 8px', fontSize: '11px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                      title="اعتماد الساعات الإضافية فوراً في نظام الرواتب"
                                      onClick={() => handleQuickApproveOvertime(p)}
                                    >
                                      ✅ اعتماد الإضافي (+{shiftMetrics.overtimeHours.toFixed(2)} س)
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

                <div className="field">
                  <label>ملاحظات ومبرر التعديل</label>
                  <input
                    type="text"
                    placeholder="سبب تعديل أوقات البصمة..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => { setEditingPunch(null); setIsAddingNewPunch(false); }}>
                    إلغاء
                  </button>
                  <button type="submit" className="btn btn-start">
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
