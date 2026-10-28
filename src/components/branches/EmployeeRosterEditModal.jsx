import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { arabicWeekday, fmt, isEmployeeActive } from '../../utils/formatters';
import { DAYS_OF_WEEK, formatTime12H, formatShiftRange12H } from './BranchMonthlyRosterModule';
import { getCycleDateRange, getActivePayrollMonth } from '../../utils/periodEngine';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { getEmployeeDaySchedule, getResolvedEmployeeRoster, projectRosterToMonth, splitUnifiedRosterForBranches, checkShiftsOverlap, getDayShiftsList, checkAnyShiftsOverlap } from '../../utils/rosterEngine';
import { reconcileEmployeeScheduleOrPunchChange } from '../../utils/latePenaltyEngine';
import { apiSaveSettingsSlice, apiSaveRosterAtomic, apiSubmitRequestAtomic } from '../../utils/apiClient';
import { saveStateLocally, broadcastStateChange } from '../../utils/offlineSync';

const DEFAULT_SCHEDULE = {
  'السبت': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الأحد': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الاثنين': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الثلاثاء': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الأربعاء': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الخميس': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الجمعة': { type: 'off', isOff: true, start: '', end: '', hours: 0 }
};

export default function EmployeeRosterEditModal({
  isOpen,
  onClose,
  employee,
  employees = [],
  branchId,
  branchName,
  selectedMonth,
  state,
  setState,
  saveState,
  showToast,
  isBranchManager = false
}) {
  // ── 1. قائمة الفروع والموظفين النشطين ──
  const allBranches = useMemo(() => state?.branches || [], [state?.branches]);
  const allEmployees = useMemo(() => {
    if (isBranchManager && employees && employees.length > 0) {
      return employees.filter(isEmployeeActive);
    }
    const list = state?.employees || employees || [];
    return list.filter(isEmployeeActive);
  }, [state?.employees, employees, isBranchManager]);

  // ── 2. حالة الفلاتر: فلتر بالفرع + فلتر بالموظفين الذين ليس لديهم جدول ──
  const [branchFilter, setBranchFilter] = useState(branchId || '');
  const [onlyWithoutRoster, setOnlyWithoutRoster] = useState(false);

  // تحديث فلتر الفرع إذا تغير المدخل
  useEffect(() => {
    if (branchId) {
      setBranchFilter(branchId);
    }
  }, [branchId]);

  // دورة الشهر المعتمدة للرواتب والتشغيل
  const effectiveMonth = selectedMonth || getActivePayrollMonth(state?.orgSettings || {});
  const cycleRange = useMemo(() => {
    return getCycleDateRange(effectiveMonth, state?.orgSettings);
  }, [effectiveMonth, state?.orgSettings]);

  const [fromDate, setFromDate] = useState(cycleRange?.startDate || `${effectiveMonth}-01`);
  const [toDate, setToDate] = useState(cycleRange?.endDate || `${effectiveMonth}-30`);

  useEffect(() => {
    if (cycleRange?.startDate && cycleRange?.endDate) {
      setFromDate(cycleRange.startDate);
      setToDate(cycleRange.endDate);
    }
  }, [cycleRange]);

  // ── 3. تصفية الموظفين وفق الفلاتر النشطة ──
  const filteredEmployees = useMemo(() => {
    let list = (isBranchManager && employees && employees.length > 0)
      ? employees.filter(isEmployeeActive)
      : allEmployees;

    // تصفية حسب الفرع (إذا كان محدد للإدارة العليا)
    if (!isBranchManager && branchFilter) {
      list = list.filter(e =>
        String(e.branchId || '') === String(branchFilter) ||
        (e.branchesDetails && e.branchesDetails.some(bd => 
          String(bd.branchId) === String(branchFilter) &&
          !bd.isResigned && !bd.resigned && bd.status !== 'resigned' && bd.status !== 'cycle_terminated' && bd.status !== 'terminated' && !bd.isTerminatedInCycle
        ))
      );
    }

    // تصفية حسب الموظفين الذين ليس لديهم جدول شهري معتمد
    if (onlyWithoutRoster) {
      list = list.filter(e => {
        const hasApproved = (state?.rosters || []).some(
          r =>
            (String(r.employeeId) === String(e.id) || (e.code && String(r.employeeCode) === String(e.code))) &&
            (r.month === selectedMonth || !r.month) &&
            (r.status === 'approved' || r.adminApproved) &&
            r.schedule && Object.keys(r.schedule).length > 0
        );
        return !hasApproved;
      });
    }

    return list;
  }, [allEmployees, employees, isBranchManager, branchFilter, onlyWithoutRoster, state?.rosters, selectedMonth]);

  // إحصائية عدد الموظفين بدون جدول لهذا النطاق
  const unassignedCount = useMemo(() => {
    let pool = (isBranchManager && employees && employees.length > 0)
      ? employees.filter(isEmployeeActive)
      : allEmployees;
    if (!isBranchManager && branchFilter) {
      pool = pool.filter(e =>
        String(e.branchId || '') === String(branchFilter) ||
        (e.branchesDetails && e.branchesDetails.some(bd => 
          String(bd.branchId) === String(branchFilter) &&
          !bd.isResigned && !bd.resigned && bd.status !== 'resigned' && bd.status !== 'cycle_terminated' && bd.status !== 'terminated' && !bd.isTerminatedInCycle
        ))
      );
    }
    return pool.filter(e => {
      const hasApproved = (state?.rosters || []).some(
        r =>
          (String(r.employeeId) === String(e.id) || (e.code && String(r.employeeCode) === String(e.code))) &&
          (r.month === selectedMonth || !r.month) &&
          (r.status === 'approved' || r.adminApproved) &&
          r.schedule && Object.keys(r.schedule).length > 0
      );
      return !hasApproved;
    }).length;
  }, [allEmployees, employees, isBranchManager, branchFilter, state?.rosters, selectedMonth]);

  // ── 4. الموظف المستهدف ──
  const [selectedEmpId, setSelectedEmpId] = useState(employee?.id || '');

  const targetEmp = useMemo(() => {
    if (selectedEmpId) {
      const found = filteredEmployees.find(e => String(e.id) === String(selectedEmpId));
      if (found) return found;
    }
    return filteredEmployees[0] || employee || null;
  }, [selectedEmpId, filteredEmployees, employee]);

  // ── تحديد صفة الموظف: متعدد الفروع أو موظف حر طوارئ ──
  const isMultiBranchEmp = Boolean(
    targetEmp?.isMultiBranch ||
    targetEmp?.isFloatingStaff ||
    (Array.isArray(targetEmp?.branchesDetails) && targetEmp.branchesDetails.length > 1)
  );

  const availableBranchesForEmp = useMemo(() => {
    if (!targetEmp) return allBranches;
    // إذا كان الموظف متعدد الفروع وله فروع متعددة معتمدة
    if (isMultiBranchEmp && Array.isArray(targetEmp.branchesDetails) && targetEmp.branchesDetails.length > 0) {
      const activeBranches = targetEmp.branchesDetails.filter(bd => bd && bd.branchId && !bd.isResigned && !bd.resigned && bd.status !== 'resigned');
      if (activeBranches.length > 0) {
        return activeBranches.map((bd, idx) => {
          const bObj = allBranches.find(b => String(b.id) === String(bd.branchId));
          const roleLabel = targetEmp.isFloatingStaff
            ? 'تغطية طوارئ'
            : (idx === 0 || bd.isPrimary ? 'الأساسي' : 'منتدب');
          return {
            id: bd.branchId,
            name: bObj ? bObj.name : (bd.branchName || `فرع ${bd.branchId}`),
            roleLabel
          };
        });
      }
    }
    // إذا كان موظفاً عادياً يعمل في فرع واحد محدد، نعرض فرعه الوحيد فقط
    const singleBId = targetEmp.branchId || targetEmp.primaryBranchId || branchId;
    if (singleBId) {
      const bObj = allBranches.find(b => String(b.id) === String(singleBId));
      if (bObj) {
        return [{ id: bObj.id, name: bObj.name, roleLabel: 'الأساسي' }];
      }
    }
    return allBranches;
  }, [targetEmp, allBranches, isMultiBranchEmp, branchId]);

  const defaultBranchId = useMemo(() => {
    return targetEmp?.primaryBranchId || (targetEmp?.branchesDetails?.[0]?.branchId) || targetEmp?.branchId || branchId || allBranches[0]?.id || '';
  }, [targetEmp, branchId, allBranches]);

  useEffect(() => {
    if (employee?.id && (!selectedEmpId || !filteredEmployees.some(e => String(e.id) === String(selectedEmpId)))) {
      setSelectedEmpId(employee.id);
    } else if (filteredEmployees.length > 0 && !filteredEmployees.some(e => String(e.id) === String(selectedEmpId))) {
      setSelectedEmpId(filteredEmployees[0].id);
    }
  }, [employee, filteredEmployees, selectedEmpId]);

  // جلب الجدول المعتمد الحالي للموظف المستهدف لهذا الشهر إن وجد
  const existingRoster = useMemo(() => {
    if (!targetEmp) return null;

    // 🌟 للموظف متعدد الفروع: البحث عن الجدول الموحد الشامل أولاً لمنع تجزئة أو تفريغ فروع الموظف
    if (isMultiBranchEmp) {
      const unifiedApproved = (state?.rosters || []).find(
        (r) =>
          (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
          (r.month === selectedMonth || !r.month) &&
          (r.isUnifiedMaster || r.id?.includes('unified')) &&
          (r.status === 'approved' || r.adminApproved || !r.status) &&
          r.schedule && Object.keys(r.schedule).length > 0
      );
      if (unifiedApproved) return unifiedApproved;

      // استرجاع الجدول الموحد الكامل بدون تقييد بفرع محدد
      const resolvedMaster = getResolvedEmployeeRoster(targetEmp, null, state, selectedMonth);
      if (resolvedMaster && resolvedMaster.schedule && typeof resolvedMaster.schedule === 'object' && Object.keys(resolvedMaster.schedule).length > 0) {
        return resolvedMaster;
      }
    }

    const resolved = getResolvedEmployeeRoster(targetEmp, targetEmp.branchId || branchId, state, selectedMonth);
    if (resolved && resolved.schedule && typeof resolved.schedule === 'object' && Object.keys(resolved.schedule).length > 0) {
      return resolved;
    }
    return (state?.rosters || []).find(
      (r) =>
        (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
        (r.month === selectedMonth || !r.month) &&
        (String(r.branchId || '') === String(targetEmp.branchId || branchId || '') || !r.branchId)
    );
  }, [state, targetEmp, selectedMonth, branchId, isMultiBranchEmp]);

  // حالة المدخلات للـ 7 أيام مع ضمان تطبيع مصفوفة الورديات shifts
  const [scheduleInputs, setScheduleInputs] = useState(() => {
    const res = {};
    const base = existingRoster?.schedule && typeof existingRoster.schedule === 'object'
      ? existingRoster.schedule
      : DEFAULT_SCHEDULE;
    DAYS_OF_WEEK.forEach((d) => {
      const item = base[d.label] || DEFAULT_SCHEDULE[d.label];
      const sList = getDayShiftsList(item);
      res[d.label] = {
        ...item,
        shifts: sList
      };
    });
    return res;
  });

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const initializedWeeklyKeyRef = useRef('');

  // تحديث المدخلات عند تبديل الموظف المستهدف أو دورة الشهر فقط مع حماية تعديلات المستخدم الحالية
  useEffect(() => {
    if (!targetEmp?.id) return;
    const currentKey = `${targetEmp.id}_${selectedMonth}`;
    if (initializedWeeklyKeyRef.current === currentKey) {
      // 🛡️ الحصانة المطلقة: تم تحميل النمط الأسبوعي لهذا الموظف والشهر مسبقاً، نمنع مسح أي تعديلات نشطة
      return;
    }
    initializedWeeklyKeyRef.current = currentKey;

    const res = {};
    const base = existingRoster?.schedule && typeof existingRoster.schedule === 'object'
      ? existingRoster.schedule
      : DEFAULT_SCHEDULE;
    DAYS_OF_WEEK.forEach((d) => {
      const item = base[d.label] || DEFAULT_SCHEDULE[d.label];
      const sList = getDayShiftsList(item);
      res[d.label] = {
        ...item,
        shifts: sList
      };
    });
    setScheduleInputs(res);
    if (existingRoster?.fromDate) setFromDate(existingRoster.fromDate);
    if (existingRoster?.toDate) setToDate(existingRoster.toDate);
    else if (cycleRange?.startDate) {
      setFromDate(cycleRange.startDate);
      if (cycleRange.endDate) setToDate(cycleRange.endDate);
    }
  }, [targetEmp?.id, selectedMonth, cycleRange]);

  // ── دوال مساعدة لحساب الساعات واسترجاع الورديات ──
  const calculateShiftHours = (start, end) => {
    if (!start || !end) return 0;
    const [sH, sM] = String(start).slice(0, 5).split(':').map(Number);
    const [eH, eM] = String(end).slice(0, 5).split(':').map(Number);
    if (isNaN(sH) || isNaN(eH)) return 0;
    const sMins = sH * 60 + (sM || 0);
    const eMins = eH * 60 + (eM || 0);
    if (sMins === eMins) return 0;
    let diff = eMins - sMins;
    if (diff < 0) diff += 24 * 60;
    return Math.round((diff / 60) * 10) / 10;
  };

  const getShiftsForDay = (item) => {
    return getDayShiftsList(item);
  };

  // ── دوال إدارة الورديات المتعددة للنمط الأسبوعي (7 أيام) ──
  const handleAddWeeklyShift = (dayLabel, preferredBranchId) => {
    let nextDayConfig = null;
    setScheduleInputs((prev) => {
      const cur = prev[dayLabel] || { type: 'shift', isOff: false, branchId: defaultBranchId };
      const curShifts = [...getDayShiftsList(cur)];
      const usedBIds = new Set(curShifts.map(s => String(s.branchId)));
      const unusedBranch = availableBranchesForEmp.find(b => !usedBIds.has(String(b.id)));
      const targetB = preferredBranchId
        ? (allBranches.find(b => String(b.id) === String(preferredBranchId)) || availableBranchesForEmp[0])
        : (unusedBranch || availableBranchesForEmp[1] || availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName });

      let newStart = '16:00';
      let newEnd = '22:00';
      if (curShifts.length > 0) {
        const lastShift = curShifts[curShifts.length - 1];
        if (lastShift.end) {
          newStart = lastShift.end;
          const [eH, eM] = lastShift.end.split(':').map(Number);
          const nextH = (eH + 6) % 24;
          newEnd = `${String(nextH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;
        }
      }
      const newHours = calculateShiftHours(newStart, newEnd);

      const newShift = {
        id: `weekly_shift_${dayLabel}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        shiftIndex: curShifts.length + 1,
        branchId: String(targetB?.id || defaultBranchId),
        branchName: targetB?.name || '',
        start: newStart,
        end: newEnd,
        hours: newHours
      };

      const nextShifts = [...curShifts, newShift];
      const totalHours = nextShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

      const updated = {
        ...cur,
        type: 'shift',
        isOff: false,
        shifts: nextShifts,
        start: nextShifts[0]?.start || '',
        end: nextShifts[0]?.end || '',
        hours: Math.round(totalHours * 10) / 10,
        branchId: nextShifts[0]?.branchId || defaultBranchId,
        branchName: nextShifts[0]?.branchName || '',
        hasSecondShift: nextShifts.length > 1,
        secondShift: nextShifts[1] ? { ...nextShifts[1] } : null
      };

      nextDayConfig = updated;
      return {
        ...prev,
        [dayLabel]: updated
      };
    });

    setMonthlyDaysSchedule((prevMonth) => {
      if (!cycleDays || cycleDays.length === 0 || !nextDayConfig) return prevMonth;
      const updatedMonth = { ...prevMonth };
      cycleDays.forEach((day) => {
        if (day.isPreHire) return;
        if (day.dayLabel === dayLabel) {
          updatedMonth[day.dateStr] = {
            ...(updatedMonth[day.dateStr] || {}),
            ...nextDayConfig
          };
        }
      });
      return updatedMonth;
    });
  };

  const handleUpdateWeeklyShift = (dayLabel, shiftIdx, field, value) => {
    let nextDayConfig = null;
    setScheduleInputs((prev) => {
      const cur = prev[dayLabel] || { type: 'shift', isOff: false, branchId: defaultBranchId };
      const curShifts = [...getDayShiftsList(cur)];
      if (!curShifts[shiftIdx]) return prev;

      const targetShift = { ...curShifts[shiftIdx] };
      if (field === 'branchId') {
        const bObj = allBranches.find(b => String(b.id) === String(value));
        targetShift.branchId = String(value);
        targetShift.branchName = bObj ? bObj.name : '';
      } else if (field === 'start') {
        targetShift.start = value;
        targetShift.hours = calculateShiftHours(value, targetShift.end);
      } else if (field === 'end') {
        targetShift.end = value;
        targetShift.hours = calculateShiftHours(targetShift.start, value);
      }

      curShifts[shiftIdx] = targetShift;
      const totalHours = curShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

      const updated = {
        ...cur,
        type: 'shift',
        isOff: false,
        shifts: curShifts,
        start: curShifts[0]?.start || '',
        end: curShifts[0]?.end || '',
        hours: Math.round(totalHours * 10) / 10,
        branchId: curShifts[0]?.branchId || defaultBranchId,
        branchName: curShifts[0]?.branchName || '',
        hasSecondShift: curShifts.length > 1,
        secondShift: curShifts[1] ? { ...curShifts[1] } : null
      };

      nextDayConfig = updated;
      return {
        ...prev,
        [dayLabel]: updated
      };
    });

    setMonthlyDaysSchedule((prevMonth) => {
      if (!cycleDays || cycleDays.length === 0 || !nextDayConfig) return prevMonth;
      const updatedMonth = { ...prevMonth };
      cycleDays.forEach((day) => {
        if (day.isPreHire) return;
        if (day.dayLabel === dayLabel) {
          updatedMonth[day.dateStr] = {
            ...(updatedMonth[day.dateStr] || {}),
            ...nextDayConfig
          };
        }
      });
      return updatedMonth;
    });
  };

  const handleRemoveWeeklyShift = (dayLabel, shiftIdx) => {
    let nextDayConfig = null;
    setScheduleInputs((prev) => {
      const cur = prev[dayLabel] || { type: 'shift', isOff: false, branchId: defaultBranchId };
      const curShifts = [...getDayShiftsList(cur)];
      if (curShifts.length <= 1) {
        const updated = {
          ...cur,
          type: 'off',
          isOff: true,
          hours: 0,
          start: '',
          end: '',
          hasSecondShift: false,
          secondShift: null,
          shifts: []
        };
        nextDayConfig = updated;
        return { ...prev, [dayLabel]: updated };
      }

      const nextShifts = curShifts.filter((_, idx) => idx !== shiftIdx);
      const totalHours = nextShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

      const updated = {
        ...cur,
        type: 'shift',
        isOff: false,
        shifts: nextShifts,
        start: nextShifts[0]?.start || '',
        end: nextShifts[0]?.end || '',
        hours: Math.round(totalHours * 10) / 10,
        branchId: nextShifts[0]?.branchId || defaultBranchId,
        branchName: nextShifts[0]?.branchName || '',
        hasSecondShift: nextShifts.length > 1,
        secondShift: nextShifts[1] ? { ...nextShifts[1] } : null
      };

      nextDayConfig = updated;
      return { ...prev, [dayLabel]: updated };
    });

    setMonthlyDaysSchedule((prevMonth) => {
      if (!cycleDays || cycleDays.length === 0 || !nextDayConfig) return prevMonth;
      const updatedMonth = { ...prevMonth };
      cycleDays.forEach((day) => {
        if (day.isPreHire) return;
        if (day.dayLabel === dayLabel) {
          updatedMonth[day.dateStr] = {
            ...(updatedMonth[day.dateStr] || {}),
            ...nextDayConfig
          };
        }
      });
      return updatedMonth;
    });
  };

  const handleToggleWeeklyDayType = (dayLabel, newType) => {
    const isOff = newType === 'off';
    let nextDayConfig = null;
    setScheduleInputs((prev) => {
      const cur = prev[dayLabel] || {};
      let updated;
      if (isOff) {
        updated = {
          ...cur,
          type: 'off',
          isOff: true,
          hours: 0,
          start: '',
          end: '',
          hasSecondShift: false,
          secondShift: null
        };
      } else {
        const existingShifts = getDayShiftsList(cur);
        const defBId = defaultBranchId;
        const bObj = allBranches.find(b => String(b.id) === String(defBId));
        const initShifts = existingShifts.length > 0 ? existingShifts : [{
          id: `weekly_shift_${dayLabel}_1`,
          shiftIndex: 1,
          branchId: String(defBId),
          branchName: bObj?.name || branchName || '',
          start: cur.start || '08:00',
          end: cur.end || '16:00',
          hours: calculateShiftHours(cur.start || '08:00', cur.end || '16:00')
        }];
        const totalHours = initShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);
        updated = {
          ...cur,
          type: 'shift',
          isOff: false,
          shifts: initShifts,
          start: initShifts[0]?.start || '08:00',
          end: initShifts[0]?.end || '16:00',
          hours: Math.round(totalHours * 10) / 10,
          branchId: initShifts[0]?.branchId || defBId,
          branchName: initShifts[0]?.branchName || (bObj ? bObj.name : ''),
          hasSecondShift: initShifts.length > 1,
          secondShift: initShifts[1] ? { ...initShifts[1] } : null
        };
      }
      nextDayConfig = updated;
      return { ...prev, [dayLabel]: updated };
    });

    setMonthlyDaysSchedule((prevMonth) => {
      if (!cycleDays || cycleDays.length === 0 || !nextDayConfig) return prevMonth;
      const updatedMonth = { ...prevMonth };
      cycleDays.forEach((day) => {
        if (day.isPreHire) return;
        if (day.dayLabel === dayLabel) {
          updatedMonth[day.dateStr] = {
            ...(updatedMonth[day.dateStr] || {}),
            ...nextDayConfig
          };
        }
      });
      return updatedMonth;
    });
  };

  // تعديل يوم محدد في النمط الأسبوعي مع الحفاظ على التوافق الرجعي 100%
  const handleDayChange = (dayLabel, field, value) => {
    if (field === 'type') {
      handleToggleWeeklyDayType(dayLabel, value);
    } else if (field === 'start') {
      handleUpdateWeeklyShift(dayLabel, 0, 'start', value);
    } else if (field === 'end') {
      handleUpdateWeeklyShift(dayLabel, 0, 'end', value);
    } else if (field === 'branchId') {
      handleUpdateWeeklyShift(dayLabel, 0, 'branchId', value);
    } else if (field === 'toggleSecondShift') {
      const curShifts = getDayShiftsList(scheduleInputs[dayLabel] || {});
      if (curShifts.length > 1) {
        handleRemoveWeeklyShift(dayLabel, 1);
      } else {
        handleAddWeeklyShift(dayLabel);
      }
    } else if (field === 'secondShiftBranchId') {
      handleUpdateWeeklyShift(dayLabel, 1, 'branchId', value);
    } else if (field === 'secondShiftStart') {
      handleUpdateWeeklyShift(dayLabel, 1, 'start', value);
    } else if (field === 'secondShiftEnd') {
      handleUpdateWeeklyShift(dayLabel, 1, 'end', value);
    }
  };

  // ── نمط العرض النشط: التقويم الشهري التفاعلي الكامل vs النمط الأسبوعي ──
  const [activeTabMode, setActiveTabMode] = useState('monthly_calendar');
  const [activeBranchTab, setActiveBranchTab] = useState('all');
  const [defaultShiftStart, setDefaultShiftStart] = useState('08:00');
  const [defaultShiftEnd, setDefaultShiftEnd] = useState('16:00');
  const [defaultApplyBranchId, setDefaultApplyBranchId] = useState('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const targetEmpHireDate = targetEmp?.hireDate || targetEmp?.hiring_date || targetEmp?.contractStartDate;

  // توليد كافة أيام دورة الرواتب الفعلية للشهر المحدد مع تدقيق تاريخ التعيين
  const cycleDays = useMemo(() => {
    if (!cycleRange?.startDate || !cycleRange?.endDate) return [];
    const days = [];
    try {
      const cur = new Date(cycleRange.startDate + 'T00:00:00');
      const end = new Date(cycleRange.endDate + 'T00:00:00');
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const dayLabel = arabicWeekday(dateStr) || arabicWeekday(cur);
        const isPreHire = Boolean(targetEmpHireDate && dateStr < targetEmpHireDate);
        days.push({
          dateStr,
          dayLabel,
          dayNumber: cur.getDate(),
          monthNumber: cur.getMonth() + 1,
          jsDayIndex: cur.getDay(),
          isPreHire,
          hireDate: targetEmpHireDate
        });
        cur.setDate(cur.getDate() + 1);
      }
    } catch (e) {
      console.warn('Error generating cycle days:', e);
    }
    return days;
  }, [cycleRange, targetEmpHireDate]);

  // خريطة أيام الشهر التفاعلية المفصلة (YYYY-MM-DD -> { type, start, end, hours, isOff, shifts: [] })
  const [monthlyDaysSchedule, setMonthlyDaysSchedule] = useState(() => {
    const map = {};
    if (existingRoster?.schedule && typeof existingRoster.schedule === 'object') {
      Object.keys(existingRoster.schedule).forEach((key) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          const item = existingRoster.schedule[key];
          map[key] = {
            ...item,
            shifts: getDayShiftsList(item)
          };
        }
      });
    }
    return map;
  });

  const lastEmpIdRef = useRef(targetEmp?.id);
  const initializedScheduleKeyRef = useRef('');

  // مزامنة أيام الشهر عند تغيير الموظف أو دورة الشهر مع تحصين ضد تسرب بيانات موظف سابق وضمان عدم ارتداد التعديلات الحالية
  useEffect(() => {
    if (!cycleDays || cycleDays.length === 0 || !targetEmp?.id) return;
    const currentKey = `${targetEmp.id}_${selectedMonth}_${defaultBranchId}`;
    const isDifferentKey = initializedScheduleKeyRef.current !== currentKey;

    setMonthlyDaysSchedule((prev) => {
      // 🛡️ الحصانة المطلقة: إذا كان الموظف والشهر والفرع كما هم، وتمت تهيئة الجدول من قبل، ولدينا أيام مسجلة في الحالة الحالية:
      // احتفظ بحالة المستخدم الحالية prev ولا تعد ضبطها نهائياً لمنع أي ارتداد للتعديلات الحالية!
      if (!isDifferentKey && prev && Object.keys(prev).length >= cycleDays.length) {
        return prev;
      }

      initializedScheduleKeyRef.current = currentKey;
      lastEmpIdRef.current = targetEmp.id;

      const updated = {};
      const defBId = defaultBranchId;
      const defBObj = allBranches.find(b => String(b.id) === String(defBId));
      const defBName = defBObj ? defBObj.name : (branchName || '');

      cycleDays.forEach((day) => {
        if (day.isPreHire) {
          updated[day.dateStr] = {
            type: 'off',
            isOff: true,
            isPreHire: true,
            hours: 0,
            start: '',
            end: '',
            shifts: [],
            label: `خارج نطاق التعاقد (تاريخ التعيين: ${day.hireDate})`
          };
          return;
        }

        // إذا كان نفس الموظف والشهر ولديه تعديل مسبق في prev، الأولوية القصوى لتعديل المستخدم في prev!
        if (!isDifferentKey && prev && prev[day.dateStr]) {
          let sList = getDayShiftsList(prev[day.dateStr]);
          if (!isMultiBranchEmp) {
            sList = sList.filter(s => !s.branchId || String(s.branchId) === String(defBId));
          }
          const isDayOff = prev[day.dateStr].type === 'off' || prev[day.dateStr].isOff === true;
          const cleanHours = isDayOff ? 0 : (!isMultiBranchEmp ? (calculateShiftHours(prev[day.dateStr].start, prev[day.dateStr].end) || 8) : (Number(prev[day.dateStr].hours) || 8));
          updated[day.dateStr] = {
            branchId: prev[day.dateStr].branchId || defBId,
            branchName: prev[day.dateStr].branchName || defBName,
            ...prev[day.dateStr],
            hours: cleanHours,
            shifts: sList,
            ...(!isMultiBranchEmp ? {
              hasSecondShift: false,
              secondShift: null,
              otherBranchShifts: [],
              otherBranchSecondShift: null,
              isMultiShiftDay: false
            } : {})
          };
        } else if (existingRoster?.schedule && existingRoster.schedule[day.dateStr]) {
          const rawItem = existingRoster.schedule[day.dateStr];
          const bObj = allBranches.find(b => String(b.id) === String(rawItem.branchId));
          let sList = getDayShiftsList(rawItem);
          if (!isMultiBranchEmp) {
            sList = sList.filter(s => !s.branchId || String(s.branchId) === String(defBId));
          }
          const isDayOff = rawItem.type === 'off' || rawItem.isOff === true;
          const cleanHours = isDayOff ? 0 : (!isMultiBranchEmp ? (calculateShiftHours(rawItem.start, rawItem.end) || 8) : (Number(rawItem.hours) || 8));
          updated[day.dateStr] = {
            branchId: rawItem.branchId || defBId,
            branchName: rawItem.branchName || (bObj ? bObj.name : defBName),
            ...rawItem,
            hours: cleanHours,
            shifts: sList,
            ...(!isMultiBranchEmp ? {
              hasSecondShift: false,
              secondShift: null,
              otherBranchShifts: [],
              otherBranchSecondShift: null,
              isMultiShiftDay: false
            } : {})
          };
        } else {
          const weeklyConf = (existingRoster?.schedule && existingRoster.schedule[day.dayLabel]) || scheduleInputs[day.dayLabel] || DEFAULT_SCHEDULE[day.dayLabel];
          if (weeklyConf) {
            const sList = getDayShiftsList(weeklyConf);
            updated[day.dateStr] = {
              branchId: weeklyConf.branchId || defBId,
              branchName: weeklyConf.branchName || defBName,
              ...weeklyConf,
              shifts: sList
            };
          } else {
            const isFri = day.dayLabel === 'الجمعة';
            const initShifts = isFri ? [] : [{
              id: `shift_${day.dateStr}_1`,
              shiftIndex: 1,
              branchId: String(defBId),
              branchName: defBName,
              start: '08:00',
              end: '16:00',
              hours: 8
            }];
            updated[day.dateStr] = {
              type: isFri ? 'off' : 'shift',
              isOff: isFri,
              start: isFri ? '' : '08:00',
              end: isFri ? '' : '16:00',
              hours: isFri ? 0 : 8,
              branchId: defBId,
              branchName: defBName,
              shifts: initShifts
            };
          }
        }
      });
      return updated;
    });
  }, [cycleDays, targetEmp?.id, selectedMonth, defaultBranchId]);

  // ── دوال إدارة الورديات المتعددة لأيام الشهر التفاعلي (دعم N فروع وورديات متعددة باليوم) ──
  const handleAddDayShift = (dateStr, preferredBranchId) => {
    setMonthlyDaysSchedule((prev) => {
      const cur = prev[dateStr] || { type: 'shift', isOff: false, branchId: defaultBranchId };
      const curShifts = [...getDayShiftsList(cur)];
      const usedBIds = new Set(curShifts.map(s => String(s.branchId)));
      const unusedBranch = availableBranchesForEmp.find(b => !usedBIds.has(String(b.id)));
      const targetB = preferredBranchId
        ? (allBranches.find(b => String(b.id) === String(preferredBranchId)) || availableBranchesForEmp[0])
        : (unusedBranch || availableBranchesForEmp[1] || availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName });

      let newStart = '16:00';
      let newEnd = '22:00';
      if (curShifts.length > 0) {
        const lastShift = curShifts[curShifts.length - 1];
        if (lastShift.end) {
          newStart = lastShift.end;
          const [eH, eM] = lastShift.end.split(':').map(Number);
          const nextH = (eH + 6) % 24;
          newEnd = `${String(nextH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;
        }
      }
      const newHours = calculateShiftHours(newStart, newEnd);

      const newShift = {
        id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        shiftIndex: curShifts.length + 1,
        branchId: String(targetB?.id || defaultBranchId),
        branchName: targetB?.name || '',
        start: newStart,
        end: newEnd,
        hours: newHours
      };

      const nextShifts = [...curShifts, newShift];
      const totalHours = nextShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

      return {
        ...prev,
        [dateStr]: {
          ...cur,
          type: 'shift',
          isOff: false,
          shifts: nextShifts,
          start: nextShifts[0]?.start || '',
          end: nextShifts[0]?.end || '',
          hours: Math.round(totalHours * 10) / 10,
          branchId: nextShifts[0]?.branchId || defaultBranchId,
          branchName: nextShifts[0]?.branchName || '',
          hasSecondShift: nextShifts.length > 1,
          secondShift: nextShifts[1] ? { ...nextShifts[1] } : null
        }
      };
    });
  };

  const handleUpdateDayShift = (dateStr, shiftIdx, field, value) => {
    setMonthlyDaysSchedule((prev) => {
      const cur = prev[dateStr] || { type: 'shift', isOff: false, branchId: defaultBranchId };
      let curShifts = [...getDayShiftsList(cur)];
      if (!isMultiBranchEmp) {
        curShifts = curShifts.filter(s => !s.branchId || String(s.branchId) === String(defaultBranchId));
        if (curShifts.length === 0) {
          curShifts = [{
            id: `shift_${dateStr}_1`,
            shiftIndex: 1,
            branchId: String(defaultBranchId),
            branchName: branchName || '',
            start: cur.start || '08:00',
            end: cur.end || '16:00',
            hours: calculateShiftHours(cur.start || '08:00', cur.end || '16:00')
          }];
        }
      }
      if (!curShifts[shiftIdx]) return prev;

      const targetShift = { ...curShifts[shiftIdx] };
      if (field === 'branchId') {
        const bObj = allBranches.find(b => String(b.id) === String(value));
        targetShift.branchId = String(value);
        targetShift.branchName = bObj ? bObj.name : '';
      } else if (field === 'start') {
        targetShift.start = value;
        targetShift.hours = calculateShiftHours(value, targetShift.end);
      } else if (field === 'end') {
        targetShift.end = value;
        targetShift.hours = calculateShiftHours(targetShift.start, value);
      }

      curShifts[shiftIdx] = targetShift;
      const totalHours = !isMultiBranchEmp
        ? (calculateShiftHours(curShifts[0]?.start, curShifts[0]?.end) || 0)
        : curShifts.reduce((acc, s) => acc + (calculateShiftHours(s.start, s.end) || Number(s.hours) || 0), 0);

      return {
        ...prev,
        [dateStr]: {
          ...cur,
          type: 'shift',
          isOff: false,
          shifts: curShifts,
          start: curShifts[0]?.start || '',
          end: curShifts[0]?.end || '',
          hours: Math.round(totalHours * 10) / 10,
          branchId: curShifts[0]?.branchId || defaultBranchId,
          branchName: curShifts[0]?.branchName || '',
          hasSecondShift: !isMultiBranchEmp ? false : (curShifts.length > 1),
          secondShift: !isMultiBranchEmp ? null : (curShifts[1] ? { ...curShifts[1] } : null),
          ...(!isMultiBranchEmp ? {
            otherBranchShifts: [],
            otherBranchSecondShift: null,
            isMultiShiftDay: false
          } : {})
        }
      };
    });
  };

  const handleRemoveDayShift = (dateStr, shiftIdx) => {
    setMonthlyDaysSchedule((prev) => {
      const cur = prev[dateStr] || { type: 'shift', isOff: false, branchId: defaultBranchId };
      const curShifts = [...getDayShiftsList(cur)];
      if (curShifts.length <= 1) {
        return {
          ...prev,
          [dateStr]: {
            ...cur,
            type: 'off',
            isOff: true,
            hours: 0,
            start: '',
            end: '',
            hasSecondShift: false,
            secondShift: null,
            shifts: []
          }
        };
      }

      const nextShifts = curShifts.filter((_, idx) => idx !== shiftIdx);
      const totalHours = nextShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

      return {
        ...prev,
        [dateStr]: {
          ...cur,
          type: 'shift',
          isOff: false,
          shifts: nextShifts,
          start: nextShifts[0]?.start || '',
          end: nextShifts[0]?.end || '',
          hours: Math.round(totalHours * 10) / 10,
          branchId: nextShifts[0]?.branchId || defaultBranchId,
          branchName: nextShifts[0]?.branchName || '',
          hasSecondShift: nextShifts.length > 1,
          secondShift: nextShifts[1] ? { ...nextShifts[1] } : null
        }
      };
    });
  };

  const handleToggleDayType = (dateStr, newType) => {
    const isOff = newType === 'off';
    setMonthlyDaysSchedule((prev) => {
      const cur = prev[dateStr] || {};
      if (isOff) {
        return {
          ...prev,
          [dateStr]: {
            ...cur,
            type: 'off',
            isOff: true,
            hours: 0,
            start: '',
            end: '',
            hasSecondShift: false,
            secondShift: null
          }
        };
      } else {
        const existingShifts = getDayShiftsList(cur);
        const defBId = activeBranchTab !== 'all' ? activeBranchTab : (cur.branchId || defaultBranchId);
        const bObj = allBranches.find(b => String(b.id) === String(defBId));
        const initShifts = existingShifts.length > 0 ? existingShifts : [{
          id: `shift_${Date.now()}_1`,
          shiftIndex: 1,
          branchId: String(defBId),
          branchName: bObj?.name || branchName || '',
          start: cur.start || '08:00',
          end: cur.end || '16:00',
          hours: calculateShiftHours(cur.start || '08:00', cur.end || '16:00')
        }];
        const totalHours = initShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);
        return {
          ...prev,
          [dateStr]: {
            ...cur,
            type: 'shift',
            isOff: false,
            shifts: initShifts,
            start: initShifts[0]?.start || '08:00',
            end: initShifts[0]?.end || '16:00',
            hours: Math.round(totalHours * 10) / 10,
            branchId: initShifts[0]?.branchId || defBId,
            branchName: initShifts[0]?.branchName || (bObj ? bObj.name : ''),
            hasSecondShift: initShifts.length > 1,
            secondShift: initShifts[1] ? { ...initShifts[1] } : null
          }
        };
      }
    });
  };

  // تعديل يوم محدد في التقويم الشهري (توافق رجعي كامل)
  const handleMonthlyDayChange = (dateStr, field, value) => {
    if (field === 'type') {
      handleToggleDayType(dateStr, value);
    } else if (field === 'start') {
      handleUpdateDayShift(dateStr, 0, 'start', value);
    } else if (field === 'end') {
      handleUpdateDayShift(dateStr, 0, 'end', value);
    } else if (field === 'branchId') {
      handleUpdateDayShift(dateStr, 0, 'branchId', value);
    } else if (field === 'toggleSecondShift') {
      const curShifts = getDayShiftsList(monthlyDaysSchedule[dateStr] || {});
      if (curShifts.length > 1) {
        handleRemoveDayShift(dateStr, 1);
      } else {
        handleAddDayShift(dateStr);
      }
    } else if (field === 'secondShiftBranchId') {
      handleUpdateDayShift(dateStr, 1, 'branchId', value);
    } else if (field === 'secondShiftStart') {
      handleUpdateDayShift(dateStr, 1, 'start', value);
    } else if (field === 'secondShiftEnd') {
      handleUpdateDayShift(dateStr, 1, 'end', value);
    }
  };

  // تطبيق النمط الأسبوعي على كامل أيام الشهر
  const applyWeeklyPatternToAllMonth = () => {
    const updated = {};
    const defBId = defaultBranchId;
    const defBObj = allBranches.find(b => String(b.id) === String(defBId));
    const defBName = defBObj ? defBObj.name : (branchName || '');

    cycleDays.forEach((day) => {
      if (day.isPreHire) {
        updated[day.dateStr] = {
          type: 'off',
          isOff: true,
          isPreHire: true,
          hours: 0,
          start: '',
          end: '',
          label: `خارج نطاق التعاقد (تاريخ التعيين: ${day.hireDate})`
        };
        return;
      }
      const pattern = scheduleInputs[day.dayLabel] || DEFAULT_SCHEDULE[day.dayLabel];
      const sList = getDayShiftsList(pattern);
      updated[day.dateStr] = {
        ...pattern,
        shifts: sList,
        branchId: pattern.branchId || defBId,
        branchName: pattern.branchName || defBName,
        hasSecondShift: Boolean(pattern.hasSecondShift),
        secondShift: pattern.hasSecondShift && pattern.secondShift ? { ...pattern.secondShift } : null
      };
    });
    setMonthlyDaysSchedule(updated);
    showToast?.('⚡ تم تطبيق النمط الأسبوعي على كامل أيام الشهر بنجاح');
  };

  // تطبيق قوالب الورديات السريعة على كامل أيام الشهر
  const applyMonthlyPreset = (presetType) => {
    const updated = {};
    const b1 = availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName };
    const b2 = availableBranchesForEmp[1] || availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName };
    const b3 = availableBranchesForEmp[2] || availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName };

    cycleDays.forEach((day, idx) => {
      const isFri = day.dayLabel === 'الجمعة';
      if (presetType === 'morning') {
        const s1 = { id: `shift_${day.dateStr}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '08:00', end: '16:00', hours: 8 };
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8, branchId: b1.id, branchName: b1.name, shifts: [s1] };
      } else if (presetType === 'evening') {
        const s1 = { id: `shift_${day.dateStr}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '16:00', end: '00:00', hours: 8 };
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '16:00', end: '00:00', hours: 8, branchId: b1.id, branchName: b1.name, shifts: [s1] };
      } else if (presetType === 'night') {
        const s1 = { id: `shift_${day.dateStr}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '00:00', end: '08:00', hours: 8 };
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '00:00', end: '08:00', hours: 8, branchId: b1.id, branchName: b1.name, shifts: [s1] };
      } else if (presetType === 'dual_branch') {
        const s1 = { id: `shift_${day.dateStr}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '08:00', end: '14:00', hours: 6 };
        const s2 = { id: `shift_${day.dateStr}_2`, shiftIndex: 2, branchId: b2.id, branchName: b2.name, start: '16:00', end: '22:00', hours: 6 };
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : {
              type: 'shift',
              isOff: false,
              branchId: b1.id,
              branchName: b1.name,
              start: '08:00',
              end: '14:00',
              hours: 12,
              hasSecondShift: true,
              secondShift: {
                type: 'shift',
                isOff: false,
                branchId: b2.id,
                branchName: b2.name,
                start: '16:00',
                end: '22:00',
                hours: 6
              },
              shifts: [s1, s2]
            };
      } else if (presetType === 'tri_branch') {
        const s1 = { id: `shift_${day.dateStr}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '08:00', end: '12:00', hours: 4 };
        const s2 = { id: `shift_${day.dateStr}_2`, shiftIndex: 2, branchId: b2.id, branchName: b2.name, start: '13:00', end: '17:00', hours: 4 };
        const s3 = { id: `shift_${day.dateStr}_3`, shiftIndex: 3, branchId: b3.id, branchName: b3.name, start: '18:00', end: '22:00', hours: 4 };
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : {
              type: 'shift',
              isOff: false,
              branchId: b1.id,
              branchName: b1.name,
              start: '08:00',
              end: '12:00',
              hours: 12,
              hasSecondShift: true,
              secondShift: {
                type: 'shift',
                isOff: false,
                branchId: b2.id,
                branchName: b2.name,
                start: '13:00',
                end: '17:00',
                hours: 4
              },
              shifts: [s1, s2, s3]
            };
      } else if (presetType === 'alternate_branches') {
        const targetB = idx % 2 === 0 ? b1 : b2;
        const s1 = { id: `shift_${day.dateStr}_1`, shiftIndex: 1, branchId: targetB.id, branchName: targetB.name, start: '08:00', end: '16:00', hours: 8 };
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: targetB.id, branchName: targetB.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8, branchId: targetB.id, branchName: targetB.name, shifts: [s1] };
      } else if (presetType === 'all_off') {
        updated[day.dateStr] = { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] };
      }
    });
    setMonthlyDaysSchedule(updated);
  };

  // تطبيق قوالب الورديات السريعة للنمط الأسبوعي وتطبيقه تلقائياً وفورياً على كامل أيام الشهر
  const applyPreset = (presetType) => {
    const newInputs = {};
    const b1 = availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName };
    const b2 = availableBranchesForEmp[1] || availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName };
    const b3 = availableBranchesForEmp[2] || availableBranchesForEmp[0] || { id: defaultBranchId, name: branchName };

    DAYS_OF_WEEK.forEach((d, idx) => {
      const isFri = d.label === 'الجمعة';
      if (presetType === 'morning') {
        const s1 = { id: `weekly_${d.key}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '08:00', end: '16:00', hours: 8 };
        newInputs[d.label] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8, branchId: b1.id, branchName: b1.name, shifts: [s1] };
      } else if (presetType === 'evening') {
        const s1 = { id: `weekly_${d.key}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '16:00', end: '00:00', hours: 8 };
        newInputs[d.label] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '16:00', end: '00:00', hours: 8, branchId: b1.id, branchName: b1.name, shifts: [s1] };
      } else if (presetType === 'night') {
        const s1 = { id: `weekly_${d.key}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '00:00', end: '08:00', hours: 8 };
        newInputs[d.label] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '00:00', end: '08:00', hours: 8, branchId: b1.id, branchName: b1.name, shifts: [s1] };
      } else if (presetType === 'dual_branch') {
        const s1 = { id: `weekly_${d.key}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '08:00', end: '14:00', hours: 6 };
        const s2 = { id: `weekly_${d.key}_2`, shiftIndex: 2, branchId: b2.id, branchName: b2.name, start: '16:00', end: '22:00', hours: 6 };
        newInputs[d.label] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : {
              type: 'shift',
              isOff: false,
              branchId: b1.id,
              branchName: b1.name,
              start: '08:00',
              end: '14:00',
              hours: 12,
              hasSecondShift: true,
              secondShift: {
                type: 'shift',
                isOff: false,
                branchId: b2.id,
                branchName: b2.name,
                start: '16:00',
                end: '22:00',
                hours: 6
              },
              shifts: [s1, s2]
            };
      } else if (presetType === 'tri_branch') {
        const s1 = { id: `weekly_${d.key}_1`, shiftIndex: 1, branchId: b1.id, branchName: b1.name, start: '08:00', end: '12:00', hours: 4 };
        const s2 = { id: `weekly_${d.key}_2`, shiftIndex: 2, branchId: b2.id, branchName: b2.name, start: '13:00', end: '17:00', hours: 4 };
        const s3 = { id: `weekly_${d.key}_3`, shiftIndex: 3, branchId: b3.id, branchName: b3.name, start: '18:00', end: '22:00', hours: 4 };
        newInputs[d.label] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] }
          : {
              type: 'shift',
              isOff: false,
              branchId: b1.id,
              branchName: b1.name,
              start: '08:00',
              end: '12:00',
              hours: 12,
              hasSecondShift: true,
              secondShift: {
                type: 'shift',
                isOff: false,
                branchId: b2.id,
                branchName: b2.name,
                start: '13:00',
                end: '17:00',
                hours: 4
              },
              shifts: [s1, s2, s3]
            };
      } else if (presetType === 'alternate_branches') {
        const targetB = idx % 2 === 0 ? b1 : b2;
        const s1 = { id: `weekly_${d.key}_1`, shiftIndex: 1, branchId: targetB.id, branchName: targetB.name, start: '08:00', end: '16:00', hours: 8 };
        newInputs[d.label] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: targetB.id, branchName: targetB.name, shifts: [] }
          : { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8, branchId: targetB.id, branchName: targetB.name, shifts: [s1] };
      } else if (presetType === 'all_off') {
        newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0, branchId: b1.id, branchName: b1.name, shifts: [] };
      }
    });
    setScheduleInputs(newInputs);

    // تطبيق فوري وتلقائي على كافة تواريخ أيام الشهر
    setMonthlyDaysSchedule((prevMonth) => {
      if (!cycleDays || cycleDays.length === 0) return prevMonth;
      const updatedMonth = { ...prevMonth };
      cycleDays.forEach((day) => {
        const pattern = newInputs[day.dayLabel];
        if (pattern) {
          const cur = updatedMonth[day.dateStr] || {};
          const sList = getDayShiftsList(pattern);
          updatedMonth[day.dateStr] = {
            ...cur,
            type: pattern.type,
            isOff: pattern.isOff,
            shifts: sList,
            start: pattern.start,
            end: pattern.end,
            hours: pattern.hours,
            branchId: pattern.branchId || cur.branchId,
            branchName: pattern.branchName || cur.branchName,
            hasSecondShift: Boolean(pattern.hasSecondShift),
            secondShift: pattern.hasSecondShift && pattern.secondShift ? { ...pattern.secondShift } : null
          };
        }
      });
      return updatedMonth;
    });
  };

  // تطبيق مواعيد الوردية الافتراضية على أيام العمل (سواء لكافة الفروع أو لفرع محدد) مع الحفاظ على الراحات
  const handleApplyDefaultShiftTimes = () => {
    if (!defaultShiftStart || !defaultShiftEnd) {
      showToast?.('⚠️ يرجى تحديد وقت البداية ووقت النهاية');
      return;
    }
    const hours = calculateShiftHours(defaultShiftStart, defaultShiftEnd);

    const isTargetAll = !defaultApplyBranchId || defaultApplyBranchId === 'all';
    const targetBObj = allBranches.find(b => String(b.id) === String(defaultApplyBranchId));
    const targetBName = targetBObj ? targetBObj.name : '';

    // تطبيق على الأيام في التقويم الشهري (مع استثناء أيام ما قبل التعيين)
    setMonthlyDaysSchedule((prev) => {
      const updated = { ...prev };
      cycleDays.forEach((day) => {
        if (day.isPreHire) return;
        const cur = updated[day.dateStr] || { type: 'shift', isOff: false, branchId: defaultBranchId };
        if (cur.type === 'off' || cur.isOff) return;

        let curShifts = [...getShiftsForDay(cur)];
        if (isTargetAll) {
          if (curShifts.length === 0) {
            curShifts.push({
              id: `shift_${Date.now()}_1`,
              shiftIndex: 1,
              branchId: defaultBranchId,
              branchName: branchName || '',
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            });
          } else {
            curShifts = curShifts.map((s) => ({
              ...s,
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            }));
          }
        } else {
          const matchIdx = curShifts.findIndex(s => String(s.branchId) === String(defaultApplyBranchId));
          if (matchIdx >= 0) {
            curShifts[matchIdx] = {
              ...curShifts[matchIdx],
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            };
          } else {
            curShifts.push({
              id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              shiftIndex: curShifts.length + 1,
              branchId: String(defaultApplyBranchId),
              branchName: targetBName,
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            });
          }
        }

        let totalDayHours = 0;
        curShifts.forEach(s => { totalDayHours += Number(s.hours || 0); });

        updated[day.dateStr] = {
          ...cur,
          type: 'shift',
          isOff: false,
          shifts: curShifts,
          hours: Math.round(totalDayHours * 10) / 10,
          branchId: curShifts[0]?.branchId,
          branchName: curShifts[0]?.branchName,
          start: curShifts[0]?.start,
          end: curShifts[0]?.end,
          hasSecondShift: curShifts.length > 1,
          secondShift: curShifts[1] ? { ...curShifts[1] } : null
        };
      });
      return updated;
    });

    // تطبيق على النمط الأسبوعي أيضاً
    setScheduleInputs((prev) => {
      const updated = { ...prev };
      DAYS_OF_WEEK.forEach((d) => {
        const cur = updated[d.label] || { type: 'shift', isOff: false, branchId: defaultBranchId };
        if (cur.type === 'off' || cur.isOff) return;

        let curShifts = [...getShiftsForDay(cur)];
        if (isTargetAll) {
          if (curShifts.length === 0) {
            curShifts.push({
              id: `weekly_shift_${d.key}_1`,
              shiftIndex: 1,
              branchId: defaultBranchId,
              branchName: branchName || '',
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            });
          } else {
            curShifts = curShifts.map((s) => ({
              ...s,
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            }));
          }
        } else {
          const matchIdx = curShifts.findIndex(s => String(s.branchId) === String(defaultApplyBranchId));
          if (matchIdx >= 0) {
            curShifts[matchIdx] = {
              ...curShifts[matchIdx],
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            };
          } else {
            curShifts.push({
              id: `weekly_shift_${d.key}_${Date.now()}`,
              shiftIndex: curShifts.length + 1,
              branchId: String(defaultApplyBranchId),
              branchName: targetBName,
              start: defaultShiftStart,
              end: defaultShiftEnd,
              hours
            });
          }
        }

        let totalDayHours = 0;
        curShifts.forEach(s => { totalDayHours += Number(s.hours || 0); });

        updated[d.label] = {
          ...cur,
          type: 'shift',
          isOff: false,
          shifts: curShifts,
          hours: Math.round(totalDayHours * 10) / 10,
          branchId: curShifts[0]?.branchId,
          branchName: curShifts[0]?.branchName,
          start: curShifts[0]?.start,
          end: curShifts[0]?.end,
          hasSecondShift: curShifts.length > 1,
          secondShift: curShifts[1] ? { ...curShifts[1] } : null
        };
      });
      return updated;
    });

    const targetBranchName = isTargetAll
      ? 'كافة الفروع'
      : (targetBName || 'الفرع المحدد');
    showToast?.(`⚡ تم تطبيق المواعيد (${defaultShiftStart} - ${defaultShiftEnd}) على أيام (${targetBranchName}) بنجاح`);
  };

  // نسخ جدول الشهر السابق للموظف وتطبيقه
  const handleCopyPreviousMonthRoster = () => {
    if (!targetEmp) {
      showToast?.('⚠️ يرجى اختيار الموظف أولاً');
      return;
    }
    let prevMonthStr = '';
    if (effectiveMonth && /^\d{4}-\d{2}$/.test(effectiveMonth)) {
      const [y, m] = effectiveMonth.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      const py = d.getFullYear();
      const pm = String(d.getMonth() + 1).padStart(2, '0');
      prevMonthStr = `${py}-${pm}`;
    }

    const prevRoster = (state?.rosters || []).find((r) =>
      (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
      (r.month === prevMonthStr || (prevMonthStr && r.fromDate && r.fromDate.startsWith(prevMonthStr)))
    );

    if (!prevRoster || !prevRoster.schedule || Object.keys(prevRoster.schedule).length === 0) {
      showToast?.(`⚠️ لم يتم العثور على جدول سابق للموظف لشهر (${prevMonthStr || 'السابق'})`);
      return;
    }

    let appliedWeekly = false;
    const newScheduleInputs = { ...scheduleInputs };
    DAYS_OF_WEEK.forEach((d) => {
      if (prevRoster.schedule[d.label]) {
        newScheduleInputs[d.label] = { ...prevRoster.schedule[d.label] };
        appliedWeekly = true;
      }
    });
    if (appliedWeekly) {
      setScheduleInputs(newScheduleInputs);
    }

    const newMonthlyDays = {};
    cycleDays.forEach((day) => {
      if (prevRoster.schedule[day.dateStr]) {
        newMonthlyDays[day.dateStr] = { ...prevRoster.schedule[day.dateStr] };
      } else if (prevRoster.schedule[day.dayLabel]) {
        newMonthlyDays[day.dateStr] = { ...prevRoster.schedule[day.dayLabel] };
      } else {
        const prevDateMatch = Object.keys(prevRoster.schedule).find(
          (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && new Date(k + 'T00:00:00').getDay() === day.jsDayIndex
        );
        if (prevDateMatch && prevRoster.schedule[prevDateMatch]) {
          newMonthlyDays[day.dateStr] = { ...prevRoster.schedule[prevDateMatch] };
        } else {
          newMonthlyDays[day.dateStr] = newScheduleInputs[day.dayLabel] || DEFAULT_SCHEDULE[day.dayLabel];
        }
      }
    });

    setMonthlyDaysSchedule(newMonthlyDays);
    showToast?.(`✅ تم نسخ جدول شهر (${prevMonthStr}) بنجاح وتطبيقه على هذا الشهر`);
  };

  // إحصائيات الشهر التفاعلية
  const monthlyStats = useMemo(() => {
    let totalMonthHours = 0;
    let workDaysCount = 0;
    let offDaysCount = 0;
    let multiShiftsCount = 0;

    cycleDays.forEach((day) => {
      const conf = monthlyDaysSchedule[day.dateStr];
      if (!conf || conf.type === 'off' || conf.isOff === true) {
        offDaysCount++;
      } else {
        workDaysCount++;
        let shifts = getDayShiftsList(conf);
        if (!isMultiBranchEmp) {
          shifts = shifts.filter(s => !s.branchId || String(s.branchId) === String(defaultBranchId));
        }
        if (shifts.length > 1) multiShiftsCount++;
        let dayHours = 0;
        if (!isMultiBranchEmp) {
          const sStart = conf.start || shifts[0]?.start || '08:00';
          const sEnd = conf.end || shifts[0]?.end || '16:00';
          dayHours = calculateShiftHours(sStart, sEnd) || 8;
        } else {
          shifts.forEach((s) => {
            const sh = calculateShiftHours(s.start, s.end) || (s.hours !== undefined ? Number(s.hours) : 8);
            dayHours += sh;
          });
        }
        totalMonthHours += dayHours;
      }
    });

    return {
      totalMonthHours: Math.round(totalMonthHours * 10) / 10,
      workDaysCount,
      offDaysCount,
      dualShiftsCount: multiShiftsCount,
      totalDays: cycleDays.length
    };
  }, [cycleDays, monthlyDaysSchedule, isMultiBranchEmp, defaultBranchId]);

  // حساب توزيع ساعات العمل والورديات لكل فرع للموظف متعدد الفروع
  const branchDistributionStats = useMemo(() => {
    if (!isMultiBranchEmp) return [];
    const map = {};
    availableBranchesForEmp.forEach((b) => {
      map[String(b.id)] = {
        id: String(b.id),
        name: b.name,
        roleLabel: b.roleLabel,
        hours: 0,
        shiftsCount: 0
      };
    });

    cycleDays.forEach((day) => {
      const conf = monthlyDaysSchedule[day.dateStr];
      if (conf && conf.type !== 'off' && !conf.isOff) {
        const shifts = getDayShiftsList(conf);
        shifts.forEach((s) => {
          const bId = String(s.branchId || defaultBranchId);
          if (!map[bId]) {
            const bObj = allBranches.find((b) => String(b.id) === bId);
            map[bId] = {
              id: bId,
              name: bObj?.name || s.branchName || `فرع ${bId}`,
              roleLabel: '',
              hours: 0,
              shiftsCount: 0
            };
          }
          map[bId].shiftsCount++;
          const h = s.hours !== undefined ? Number(s.hours) : 8;
          map[bId].hours = Math.round((map[bId].hours + h) * 10) / 10;
        });
      }
    });

    return Object.values(map);
  }, [isMultiBranchEmp, availableBranchesForEmp, cycleDays, monthlyDaysSchedule, defaultBranchId, allBranches]);

  // إحصائيات الجدول الأسبوعي المعد
  const stats = useMemo(() => {
    let totalWeeklyHours = 0;
    let workDaysCount = 0;
    let offDaysCount = 0;
    let multiShiftsCount = 0;

    DAYS_OF_WEEK.forEach((d) => {
      const conf = scheduleInputs[d.label];
      if (!conf || conf.type === 'off' || conf.isOff === true) {
        offDaysCount++;
      } else {
        workDaysCount++;
        const shifts = getDayShiftsList(conf);
        if (shifts.length > 1) multiShiftsCount++;
        let dayHours = 0;
        shifts.forEach((s) => {
          dayHours += s.hours !== undefined ? Number(s.hours) : 8;
        });
        totalWeeklyHours += dayHours;
      }
    });

    return { totalWeeklyHours: Math.round(totalWeeklyHours * 10) / 10, workDaysCount, offDaysCount, dualShiftsCount: multiShiftsCount };
  }, [scheduleInputs]);

  // ── 🌟 المعاينة الذكية اللحظية لأثر تعديل الجدول على الجزاءات والتأخيرات ──
  const reconciliationPreview = useMemo(() => {
    if (!targetEmp || !isOpen) return null;
    try {
      const candidateRoster = {
        id: 'preview_roster_reconcile',
        employeeId: targetEmp.id,
        employeeCode: targetEmp.code || '',
        month: selectedMonth,
        fromDate: fromDate || cycleRange?.startDate,
        toDate: toDate || cycleRange?.endDate,
        schedule: { ...scheduleInputs, ...monthlyDaysSchedule },
        status: 'approved',
        adminApproved: true
      };
      const tempState = {
        ...state,
        rosters: [candidateRoster, ...(state?.rosters || []).filter(r => String(r.employeeId) !== String(targetEmp.id))]
      };
      const candidateSchedule = { ...scheduleInputs, ...monthlyDaysSchedule };
      const candidateDateKeys = Object.keys(candidateSchedule).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
      const { summary } = reconcileEmployeeScheduleOrPunchChange({
        employeeId: targetEmp.id,
        changedDates: candidateDateKeys,
        state: tempState,
        options: { clearPenaltiesOnChangedDates: false }
      });
      return summary;
    } catch {
      return null;
    }
  }, [targetEmp, isOpen, scheduleInputs, monthlyDaysSchedule, state, selectedMonth, fromDate, toDate, cycleRange]);

  // حفظ وإرسال الجدول
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetEmp) {
      showToast?.('⚠️ يرجى اختيار الموظف أولاً');
      return;
    }

    if (stats.workDaysCount === 0 && monthlyStats.workDaysCount === 0) {
      showToast?.('⚠️ يرجى تحديد وردية عمل واحدة على الأقل');
      return;
    }

    setSubmitting(true);
    try {
      // مزامنة القالب الأسبوعي القياسي (السبت..الجمعة) مع النمط الفعلي لأيام الشهر
      const syncedWeeklyInputs = { ...scheduleInputs };
      if (cycleDays && cycleDays.length > 0) {
        DAYS_OF_WEEK.forEach((d) => {
          const dayLabel = d.label || d;
          const matchingDays = cycleDays.filter((cd) => cd.dayLabel === dayLabel);
          if (matchingDays.length > 0) {
            let offCount = 0;
            let shiftCount = 0;
            let sampleShift = null;
            matchingDays.forEach((cd) => {
              const conf = monthlyDaysSchedule[cd.dateStr];
              if (conf) {
                if (conf.type === 'off' || conf.isOff === true) {
                  offCount++;
                } else {
                  shiftCount++;
                  if (!sampleShift && conf.start && conf.end) sampleShift = conf;
                }
              }
            });
            if (offCount > shiftCount) {
              syncedWeeklyInputs[dayLabel] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
            } else if (shiftCount >= offCount && sampleShift) {
              syncedWeeklyInputs[dayLabel] = {
                type: 'shift',
                isOff: false,
                start: sampleShift.start || '08:00',
                end: sampleShift.end || '16:00',
                hours: sampleShift.hours !== undefined ? sampleShift.hours : 8,
                branchId: sampleShift.branchId || defaultBranchId,
                branchName: sampleShift.branchName || '',
                hasSecondShift: Boolean(sampleShift.hasSecondShift),
                secondShift: sampleShift.hasSecondShift && sampleShift.secondShift ? { ...sampleShift.secondShift } : null
              };
            }
          }
        });
      }

      // دمج وإسقاط النمط الأسبوعي وكامل تواريخ الشهر لضمان التزامن التام 100%
      const combinedInputs = {
        ...syncedWeeklyInputs,
        ...monthlyDaysSchedule
      };

      const safeInputs = projectRosterToMonth(combinedInputs, cycleRange || selectedMonth, {
        hireDate: targetEmpHireDate,
        branchId: defaultBranchId,
        branchName: branchName || '',
        orgSettings: state?.orgSettings
      }) || combinedInputs;

      // ضمان حفظ وإدراج بيانات الفرع والورديات لكافة أيام الشهر بدقة
      Object.keys(monthlyDaysSchedule).forEach((k) => {
        if (monthlyDaysSchedule[k] && !safeInputs[k]?.isPreHire) {
          safeInputs[k] = {
            ...(safeInputs[k] || {}),
            ...monthlyDaysSchedule[k]
          };
        }
      });

      // ضمان تطبيع مصفوفة الورديات shifts والمرايا الرجعية لكافة أيام الشهر والنمط الأسبوعي
      Object.keys(safeInputs).forEach((k) => {
        const item = safeInputs[k];
        if (item && !item.isPreHire && item.type !== 'off' && !item.isOff) {
          let sList = getDayShiftsList(item);
          if (!isMultiBranchEmp) {
            sList = sList.filter(s => !s.branchId || String(s.branchId) === String(defaultBranchId));
            const primaryStart = item.start || sList[0]?.start || '08:00';
            const primaryEnd = item.end || sList[0]?.end || '16:00';
            const dayH = calculateShiftHours(primaryStart, primaryEnd) || 8;
            safeInputs[k] = {
              ...item,
              shifts: [{
                id: `shift_${k}_1`,
                shiftIndex: 1,
                branchId: defaultBranchId,
                branchName: branchName || '',
                start: primaryStart,
                end: primaryEnd,
                hours: dayH
              }],
              start: primaryStart,
              end: primaryEnd,
              hours: dayH,
              branchId: defaultBranchId,
              branchName: branchName || '',
              hasSecondShift: false,
              secondShift: null,
              otherBranchShifts: [],
              otherBranchSecondShift: null,
              isMultiShiftDay: false
            };
          } else {
            safeInputs[k] = {
              ...item,
              shifts: sList,
              start: sList[0]?.start || item.start || '',
              end: sList[0]?.end || item.end || '',
              hours: Math.round(sList.reduce((acc, s) => acc + (calculateShiftHours(s.start, s.end) || Number(s.hours) || 0), 0) * 10) / 10,
              branchId: sList[0]?.branchId || item.branchId || defaultBranchId,
              branchName: sList[0]?.branchName || item.branchName || '',
              hasSecondShift: sList.length > 1,
              secondShift: sList[1] ? { ...sList[1] } : null
            };
          }
        }
      });
      // 🛡️ الحصانة المطلقة: تأمين وتثبيت أيام ما قبل التعيين كأيام راحة خارج نطاق التعاقد
      if (cycleDays && cycleDays.length > 0) {
        cycleDays.forEach((cd) => {
          if (cd.isPreHire) {
            safeInputs[cd.dateStr] = {
              type: 'off',
              isOff: true,
              isPreHire: true,
              hours: 0,
              start: '',
              end: '',
              label: `خارج نطاق التعاقد (تاريخ التعيين: ${cd.hireDate})`
            };
          }
        });
      }
      const effectiveBranchId = targetEmp.isFloatingStaff
        ? (defaultBranchId || 'floating')
        : (targetEmp.primaryBranchId || targetEmp.branchId || branchId || '');
      const effectiveBranchName = targetEmp.isFloatingStaff
        ? 'موظف متنقل حر (كافة الفروع)'
        : (branchName || allBranches.find(b => String(b.id) === String(effectiveBranchId))?.name || 'الفرع الرئيسي');

      if (!isBranchManager) {
        // ─────────────────────────────────────────────────────────────
        // الحالة الأولى: الإدارة العليا (Admin) ➔ اعتماد وحفظ فوري مباشر
        // ─────────────────────────────────────────────────────────────
        // 🌟 حصر شامل ودقيق لأي روستر سابق لهذا الموظف لنفس الدورة/الشهر لمنع التضارب نهائياً
        const isTargetEmpRosterForSameCycle = (r) => {
          if (!r) return false;
          const isTargetEmp = (
            String(r.employeeId) === String(targetEmp.id) ||
            String(r.employeeId) === String(targetEmp.code) ||
            (targetEmp.code && String(r.employeeCode) === String(targetEmp.code)) ||
            (targetEmp.id && String(r.employeeCode) === String(targetEmp.id))
          );
          if (!isTargetEmp) return false;

          const rMonth = String(r.month || '').trim().slice(0, 7);
          const targetMonth = String(selectedMonth || '').trim().slice(0, 7);

          const monthMatches = !rMonth || (targetMonth && rMonth === targetMonth);
          const idMatches = Boolean(targetMonth && typeof r.id === 'string' && r.id.includes(targetMonth));
          const dateOverlaps = Boolean(
            cycleRange && r.fromDate && r.toDate &&
            r.fromDate <= cycleRange.endDate && r.toDate >= cycleRange.startDate
          );

          return monthMatches || idMatches || dateOverlaps;
        };

        // 🌟 حصر معرفات الروستر القديمة لتسجيلها في شواهد القبور وحذفها ذرياً من السيرفر
        const replacedRosterIds = (state?.rosters || [])
          .filter(isTargetEmpRosterForSameCycle)
          .map(r => r.id)
          .filter(Boolean);

        let updatedRosters;
        let masterRosterObj = null;
        let branchRosterObjs = [];
        let newRosterObj = null;

        if (isMultiBranchEmp) {
          // 🌟 تقسيم ذكي وتلقائي لكل فرع على حدة مع جدول موحد رئيسي متكامل
          const branchSplits = splitUnifiedRosterForBranches(safeInputs, targetEmp, allBranches);

          // حذف أي جداول سابقة لهذا الموظف لنفس الدورة لمنع التكرار أو التضارب
          const otherEmpRosters = (state?.rosters || []).filter((r) => !isTargetEmpRosterForSameCycle(r));

          // 1. الجدول الموحد الرئيسي الشامل
          masterRosterObj = {
            id: `roster_${targetEmp.id}_${selectedMonth}_unified`,
            employeeId: targetEmp.id,
            employeeCode: targetEmp.code || '',
            employeeName: targetEmp.name,
            branchId: effectiveBranchId,
            branchName: effectiveBranchName,
            isUnifiedMaster: true,
            isMultiBranch: true,
            month: selectedMonth,
            fromDate: fromDate || cycleRange?.startDate,
            toDate: toDate || cycleRange?.endDate,
            schedule: safeInputs,
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            approvedAt: new Date().toISOString(),
            approvedBy: 'الإدارة العليا (جدول موحد متعدد الفروع)',
            notes: notes.trim(),
            updatedAt: new Date().toISOString()
          };

          // 2. جداول الفروع المستقلة المخصصة لكل فرع
          branchRosterObjs = branchSplits.map((bs) => ({
            id: `roster_${targetEmp.id}_${selectedMonth}_b_${bs.branchId}`,
            employeeId: targetEmp.id,
            employeeCode: targetEmp.code || '',
            employeeName: targetEmp.name,
            branchId: bs.branchId,
            branchName: bs.branchName,
            isMultiBranch: true,
            month: selectedMonth,
            fromDate: fromDate || cycleRange?.startDate,
            toDate: toDate || cycleRange?.endDate,
            schedule: bs.schedule,
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            approvedAt: new Date().toISOString(),
            approvedBy: `الإدارة العليا (جدول فرع ${bs.branchName})`,
            notes: notes.trim(),
            updatedAt: new Date().toISOString()
          }));

          updatedRosters = [masterRosterObj, ...branchRosterObjs, ...otherEmpRosters];
        } else {
          // موظف عادي فرع واحد
          // حذف كافة الجداول السابقة لهذا الموظف لنفس الدورة لمنع التكرار والتضارب
          const otherEmpRosters = (state?.rosters || []).filter((r) => !isTargetEmpRosterForSameCycle(r));

          const rosterId = `roster_${targetEmp.id}_${selectedMonth}`;
          newRosterObj = {
            id: rosterId,
            employeeId: targetEmp.id,
            employeeCode: targetEmp.code || '',
            employeeName: targetEmp.name,
            branchId: effectiveBranchId,
            branchName: effectiveBranchName,
            isFloatingStaff: Boolean(targetEmp.isFloatingStaff),
            isUnifiedMaster: true,
            month: selectedMonth,
            fromDate: fromDate || cycleRange?.startDate,
            toDate: toDate || cycleRange?.endDate,
            schedule: safeInputs,
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            approvedAt: new Date().toISOString(),
            approvedBy: 'الإدارة العليا (اعتماد وتعيين مباشر)',
            notes: notes.trim(),
            updatedAt: new Date().toISOString()
          };

          updatedRosters = [newRosterObj, ...otherEmpRosters];
        }

        // 🌟 حسم وتجاوز أي طلبات روستر أو تعديل شيفت سابقة لهذا الموظف لنفس الشهر كي لا تعود لتخطف الجدول المعتمد
        const updatedRequests = (state?.requests || []).map((r) => {
          if (
            r &&
            (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
            (r.month === selectedMonth || !r.month || (r.date && r.date.startsWith(selectedMonth))) &&
            (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request' || r.type === 'schedule_edit' || r.type === 'shift_adjustment')
          ) {
            return {
              ...r,
              status: 'superseded',
              supersededByAdmin: true,
              supersededAt: new Date().toISOString(),
              supersededReason: 'تم استبداله وتعيين جدول رسمي جديد ومباشر من الإدارة العليا'
            };
          }
          return r;
        });

        // إنشاء إشعار رسمي للموظف
        const newNotification = {
          id: `notif_roster_${Date.now()}`,
          employeeId: targetEmp.id,
          title: '📅 تم اعتماد وتعيين جدولك الشهري',
          message: `قامت الإدارة العليا باعتماد وتعيين جدولك الشهري لشهر (${selectedMonth}) للفرع (${effectiveBranchName}) بنجاح.`,
          type: 'roster_approved',
          createdAt: new Date().toISOString(),
          read: false
        };

        let updatedEmployees = state?.employees || [];
        if (isMultiBranchEmp && targetEmp) {
          const branchSplits = splitUnifiedRosterForBranches(safeInputs, targetEmp, allBranches);
          updatedEmployees = (state?.employees || []).map((emp) => {
            if (String(emp.id) === String(targetEmp.id)) {
              const newDetails = (emp.branchesDetails || []).map((bd) => {
                const sp = branchSplits.find((s) => String(s.branchId) === String(bd.branchId));
                if (sp) {
                  return { ...bd, schedule: sp.schedule };
                }
                return bd;
              });
              return {
                ...emp,
                branchesDetails: newDetails,
                roster: { ...(emp.roster || {}), schedule: safeInputs }
              };
            }
            return emp;
          });
        } else if (targetEmp) {
          updatedEmployees = (state?.employees || []).map((emp) => {
            if (String(emp.id) === String(targetEmp.id)) {
              const cleanedBranches = (emp.branchesDetails || []).map((bd) => {
                if (String(bd.branchId) === String(defaultBranchId)) {
                  return { ...bd, schedule: safeInputs };
                }
                return bd;
              });
              return {
                ...emp,
                branchesDetails: cleanedBranches.length > 0 ? cleanedBranches : emp.branchesDetails,
                roster: { ...(emp.roster || {}), schedule: safeInputs }
              };
            }
            return emp;
          });
        }

        const updatedState = {
          ...state,
          employees: updatedEmployees,
          rosters: updatedRosters,
          requests: updatedRequests,
          notifications: [newNotification, ...(state?.notifications || [])]
        };

        // 🌟 رصد التواريخ التي تم تعيينها في الجدول لمقارنة جميع أيام الدورة بالبصمات الفعلية
        const cycleDateKeys = Object.keys(safeInputs).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
        const effectiveChangedDates = cycleDateKeys;

        // 🌟 التسوية الذكية التلقائية اللحظية بين المواعيد الجديدة وبصمات الحضور السابقة
        const { updatedState: reconciledState, summary: reconSummary } = reconcileEmployeeScheduleOrPunchChange({
          employeeId: targetEmp.id,
          changedDates: effectiveChangedDates,
          state: updatedState,
          options: { reason: 'تعديل واعتماد الجدول الشهري', clearPenaltiesOnChangedDates: false }
        });

        // ⚡ 1. تحديث الحالة فوراً على الشاشة (Optimistic UI)
        setState?.(reconciledState);

        // ⚡ 2. بث التغيير وحفظه في الذاكرة المحلية فوراً
        saveStateLocally(reconciledState).catch(() => {});
        broadcastStateChange(reconciledState);

        // ⚡ 3. إظهار إشعار النجاح فوراً للمستخدم
        if (reconSummary?.waivedDeductionMinutes > 0) {
          showToast?.(`✅ تم اعتماد الجدول وإسقاط ${reconSummary.waivedDeductionMinutes} دقيقة خصم (${reconSummary.waivedAmount} ج.م) تلقائياً لتطابق الحضور!`, 'success');
        } else {
          showToast?.(`✅ تم تعيين واعتماد الجدول الشهري للموظف (${targetEmp.name}) بنجاح!`, 'success');
        }

        // ⚡ 4. إغلاق النافذة فوراً وبشكل لحظي دون أي انتظار (< 10ms)
        onClose?.();

        // ⚡ 5. المزامنة الذرية في الخلفية مع الخادم دون تجميد واجهة المستخدم إطلاقاً
        (async () => {
          let atomicSaveSuccess = false;
          try {
            const newRostersList = isMultiBranchEmp ? [masterRosterObj, ...branchRosterObjs].filter(Boolean) : [newRosterObj].filter(Boolean);
            const newRosterIds = new Set(newRostersList.map(r => r?.id).filter(Boolean));
            const safeDeletedRosterIds = (replacedRosterIds || []).filter(id => !newRosterIds.has(id));

            const effectiveFromDate = fromDate || cycleRange?.startDate || (cycleDateKeys.length > 0 ? cycleDateKeys.slice().sort()[0] : null);
            const effectiveToDate = toDate || cycleRange?.endDate || (cycleDateKeys.length > 0 ? cycleDateKeys.slice().sort().reverse()[0] : null);

            const isDateInRosterCycle = (d) => {
              if (!d) return false;
              if (effectiveFromDate && effectiveToDate) {
                return d >= effectiveFromDate && d <= effectiveToDate;
              }
              return !selectedMonth || String(d).slice(0, 7) === selectedMonth;
            };

            // ⚡ حمولة مركزة ودقيقة للغاية تشمل كامل نطاق دورة الروستر (من 21 السابق إلى 20 الحالي)
            const changedShifts = (reconciledState.shifts || []).filter(s =>
              s && (String(s.employeeId) === String(targetEmp.id) || (targetEmp.code && String(s.employeeCode) === String(targetEmp.code))) &&
              isDateInRosterCycle(s.date)
            );
            const changedEmployees = (reconciledState.employees || []).filter(e =>
              e && (String(e.id) === String(targetEmp.id) || (targetEmp.code && String(e.code) === String(targetEmp.code)))
            );
            const changedLateIncidents = (reconciledState.lateIncidents || []).filter(inc =>
              inc && (String(inc.employeeId) === String(targetEmp.id) || (targetEmp.code && String(inc.employeeCode) === String(targetEmp.code))) &&
              isDateInRosterCycle(inc.date)
            );

            await apiSaveRosterAtomic({
              employeeId: targetEmp.id,
              employeeCode: targetEmp.code || '',
              employeeName: targetEmp.name,
              month: selectedMonth,
              fromDate: effectiveFromDate,
              toDate: effectiveToDate,
              branchId: effectiveBranchId,
              branchName: effectiveBranchName,
              roster: isMultiBranchEmp ? masterRosterObj : newRosterObj,
              rosters: newRostersList,
              employees: changedEmployees,
              shifts: changedShifts,
              lateIncidents: changedLateIncidents,
              requests: reconciledState.requests,
              notifications: reconciledState.notifications,
              deletedRosterIds: safeDeletedRosterIds
            });
            atomicSaveSuccess = true;
          } catch (atomicErr) {
            console.warn('[RosterAtomicSave] Background sync fallback:', atomicErr);
          }

          if (!atomicSaveSuccess && saveState) {
            saveState(reconciledState, { entityType: 'rosters' }).catch(err => {
              console.error('[RosterSave] Fallback failed:', err);
              showToast?.('⚠️ تعذر المزامنة السحابية، تم حفظ الجدول محلياً', 'warning');
            });
          }
        })();
      } else {
        // ─────────────────────────────────────────────────────────────
        // الحالة الثانية: مدير الفرع (Branch Manager) ➔ إنشاء طلب اعتماد للإدارة
        // ─────────────────────────────────────────────────────────────
        const reqId = `roster_req_${targetEmp.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        const newRosterReq = {
          id: reqId,
          type: 'roster_update',
          requestType: 'roster_update',
          typeLabel: 'طلب اعتماد جدول شهري لموظف',
          employeeId: targetEmp.id,
          employeeName: targetEmp.name,
          employeeCode: targetEmp.code || '',
          jobTitle: targetEmp.jobTitle || '',
          branchId: effectiveBranchId,
          branchName: effectiveBranchName,
          month: selectedMonth,
          fromDate: fromDate || cycleRange?.startDate,
          toDate: toDate || cycleRange?.endDate,
          schedule: safeInputs,
          newSchedule: safeInputs,
          oldSchedule: existingRoster?.schedule || null,
          previousSchedule: existingRoster?.schedule || null,
          submittedBy: 'branch_manager',
          submittedByBranchManager: true,
          createdBy: 'branch',
          createdRole: 'branch',
          creatorRole: 'branch',
          senderRole: 'branch',
          managerStatus: 'approved',
          branchApproved: true,
          branchApprovalStatus: 'approved',
          targetApproval: 'admin_only',
          status: 'pending_admin',
          details: `قام مدير فرع (${effectiveBranchName}) بإعداد الجدول الشهري للموظف (${targetEmp.name}) لشهر (${selectedMonth}) وبانتظار الاعتماد النهائي من الإدارة العليا. ${notes ? 'ملاحظات: ' + notes.trim() : ''}`,
          reason: notes.trim(),
          createdAt: new Date().toISOString()
        };

        const updatedRequests = [newRosterReq, ...(state?.requests || [])];
        const updatedState = {
          ...state,
          requests: updatedRequests
        };

        // ⚡ 1. تحديث الحالة فوراً على الشاشة (Optimistic UI)
        setState?.(updatedState);
        saveStateLocally(updatedState).catch(() => {});
        broadcastStateChange(updatedState);
        showToast?.(`✅ تم إعداد الجدول للموظف (${targetEmp.name}) وإرسال طلب الاعتماد للإدارة العليا بنجاح`, 'success');

        // ⚡ 2. إغلاق النافذة فوراً وبشكل لحظي دون أي انتظار (< 10ms)
        onClose?.();

        // ⚡ 3. المزامنة السحابية وإرسال الإشعار في الخلفية
        (async () => {
          try {
            await apiSubmitRequestAtomic(newRosterReq);
          } catch (atomicReqErr) {
            console.warn('[BranchManager RosterReq] Fallback to saveState:', atomicReqErr);
            if (saveState) saveState(updatedState, { entityType: 'requests' }).catch(() => {});
          }

          // إشعار الإدارة العليا عبر Gmail
          try {
            notifyAdminOnNewRequest({
              state: updatedState,
              newRequest: newRosterReq,
              empName: targetEmp.name
            });
          } catch (mailErr) {
            console.warn('Mail notification error:', mailErr);
          }
        })();
      }
    } catch (err) {
      console.error('Error saving employee roster:', err);
      showToast?.('❌ حدث خطأ أثناء حفظ الجدول الشهري');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        height: '100dvh',
        zIndex: 999999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '12px 10px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="modal-content card fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: isFullscreen ? '100vw' : 'min(1680px, 98vw)',
          width: isFullscreen ? '100vw' : '98vw',
          height: isFullscreen ? '100vh' : 'calc(100dvh - 20px)',
          maxHeight: isFullscreen ? '100vh' : 'calc(100dvh - 20px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0,
          borderRadius: isFullscreen ? '0' : '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          fontFamily: "'Tajawal', sans-serif",
          margin: 'auto',
          background: 'var(--surface, #ffffff)',
          transition: 'all 0.2s ease-in-out'
        }}
      >
        {/* ── 1. ترويسة المودال المثبتة (Sticky Header) ── */}
        <div
          style={{
            padding: '14px 22px',
            borderBottom: '1.5px solid var(--border)',
            background: 'var(--surface, #ffffff)',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>{isBranchManager ? '📝' : '⚡'}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--text)' }}>
                {isBranchManager ? 'إعداد وتصميم جدول شهري لموظف (طلب اعتماد للإدارة)' : 'تعيين واعتماد الجدول الشهري للموظف فورياً'}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                {isBranchManager
                  ? 'يقوم مدير الفرع بضبط مواعيد العمل الأسبوعية، وترسل للإدارة العليا لاعتمادها رسمياً.'
                  : 'صلاحية الإدارة العليا: يتم تطبيق واعتماد الجدول فورياً في ملف الموظف ومسير الرواتب.'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'تصغير النافذة' : 'توسيع للشاشة الكاملة'}
              style={{
                fontSize: '12.5px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1.5px solid var(--border)',
                background: isFullscreen ? '#eff6ff' : '#ffffff',
                color: isFullscreen ? '#0284c7' : 'var(--text)',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <span>{isFullscreen ? '🗗 تصغير النافذة' : '⛶ ملء الشاشة'}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ fontSize: '18px', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── 2. النموذج بكامل مكوناته مع شريط سفلي مثبت ── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
          
          {/* جسم المودال القابل للتمرير الرأسي السلس (Scrollable Body) */}
          <div
            className="modal-card-body"
            style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '18px 22px', WebkitOverflowScrolling: 'touch' }}
          >
            
            {/* ── شريط الفلاتر: فلتر الفرع + فلتر الموظفين بدون جدول + اختيار الموظف ── */}
            <div
              style={{
                background: 'var(--surface-muted, #f8fafc)',
                padding: '14px 18px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                marginBottom: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {/* السطر الأول من الفلاتر */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                
                {/* 1. فلتر الفرع */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px', flex: '1 1 220px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>🏢 الفرع:</label>
                  {isBranchManager ? (
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary, #0f766e)', background: '#fff', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      {branchName || 'الفرع المحدد'}
                    </span>
                  ) : (
                    <select
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      style={{ width: '100%', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontWeight: 700, fontSize: '13px', background: '#fff' }}
                    >
                      <option value="">🏢 جميع الفروع ({allBranches.length})</option>
                      {allBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 2. فلتر الموظفين الذين لم يتم وضع جدول لهم */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: onlyWithoutRoster ? '#fef2f2' : '#ffffff',
                      border: `1.5px solid ${onlyWithoutRoster ? '#f87171' : 'var(--border)'}`,
                      padding: '6px 12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: onlyWithoutRoster ? '#dc2626' : 'var(--text)',
                      transition: 'all 0.2s',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={onlyWithoutRoster}
                      onChange={(e) => setOnlyWithoutRoster(e.target.checked)}
                      style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                    <span>⚠️ إظهار فقط من ليس لديهم جدول معتمد ({unassignedCount})</span>
                  </label>
                </div>

                {/* 3. دورة الشهر */}
                <span style={{ background: 'var(--primary-light, #e0f2fe)', color: 'var(--primary, #0369a1)', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
                  📅 دورة الشهر: {cycleRange?.label || selectedMonth}
                </span>
              </div>

              {/* السطر الثاني: اختيار الموظف وحالته */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px dashed var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 320px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>👤 الموظف المستهدف:</label>
                  {filteredEmployees.length > 0 ? (
                    <select
                      value={selectedEmpId}
                      onChange={(e) => setSelectedEmpId(e.target.value)}
                      style={{ width: '100%', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--primary-light, #bfdbfe)', fontWeight: 800, fontSize: '13px', background: '#fff' }}
                    >
                      {filteredEmployees.map((e) => {
                        const hasAppr = (state?.rosters || []).some(
                          r => (String(r.employeeId) === String(e.id) || (e.code && String(r.employeeCode) === String(e.code))) &&
                               (r.month === selectedMonth || !r.month) &&
                               (r.status === 'approved' || r.adminApproved) &&
                               r.schedule && Object.keys(r.schedule).length > 0
                        );
                        return (
                          <option key={e.id} value={e.id}>
                            {hasAppr ? '🟢' : '⚪'} {e.name} ({e.code || 'بدون كود'}) — {e.jobTitle || 'موظف'} {hasAppr ? '[معتمد]' : '[بدون جدول]'}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <span style={{ fontSize: '12.5px', color: '#dc2626', fontWeight: 800 }}>
                      🚫 لا يوجد موظفين يطابقون خيارات الفلتر المحددة
                    </span>
                  )}
                </div>

                <div>
                  {existingRoster ? (
                    <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 800 }}>
                      ✓ يوجد جدول معتمد لشهر ({selectedMonth})
                    </span>
                  ) : (
                    <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 800 }}>
                      ⚠️ لم يتم اعتماد جدول لهذا الشهر بعد
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── 🌟 المعاينة الذكية للأثر المالي والتأخيرات (Smart Impact Preview Banner) ── */}
            {reconciliationPreview && reconciliationPreview.waivedDeductionMinutes > 0 && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1.5px solid #10b981',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  color: '#065f46',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.12)',
                  animation: 'fadeIn 0.3s ease-in-out'
                }}
              >
                <span style={{ fontSize: '24px' }}>✨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#047857' }}>
                    المعاينة الذكية للتأخيرات والخصومات (Smart Live Reconciliation):
                  </div>
                  <div style={{ fontSize: '12.5px', marginTop: '2px', lineHeight: '1.5' }}>
                    تعديل مواعيد الجدول الحالي سيسقط تلقائياً <strong>{reconciliationPreview.waivedDeductionMinutes} دقيقة خصم</strong> {reconciliationPreview.waivedAmount > 0 && <span>(حوالي <strong>{reconciliationPreview.waivedAmount} ج.م</strong>)</span>} عن الموظف لتطابق أوقات حضوره الفعلي مع المواعيد الجديدة!
                  </div>
                </div>
                <span
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                  }}
                >
                  إسقاط خصم آلي
                </span>
              </div>
            )}

            {/* ── أزرار تبديل العرض: التقويم الشهري التفاعلي الكامل vs النمط الأسبوعي ── */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1.5px solid var(--border)', paddingBottom: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setActiveTabMode('monthly_calendar')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  border: activeTabMode === 'monthly_calendar' ? '2px solid #0284c7' : '1px solid var(--border)',
                  background: activeTabMode === 'monthly_calendar' ? '#eff6ff' : '#ffffff',
                  color: activeTabMode === 'monthly_calendar' ? '#0369a1' : 'var(--text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>📅 التقويم الشهري التفاعلي الكامل ({cycleDays.length} يوم)</span>
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => setActiveTabMode('weekly_pattern')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  border: activeTabMode === 'weekly_pattern' ? '2px solid #0284c7' : '1px solid var(--border)',
                  background: activeTabMode === 'weekly_pattern' ? '#eff6ff' : '#ffffff',
                  color: activeTabMode === 'weekly_pattern' ? '#0369a1' : 'var(--text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>⚡ ضبط النمط الأسبوعي الأساسي (السبت - الجمعة)</span>
              </button>
            </div>

            {/* ── شريط الأدوات والتعيين السريع لمواعيد الوردية ونسخ الشهر السابق ── */}
            <div
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
                border: '1.5px solid #bae6fd',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1' }}>⏰ وقت البداية:</span>
                  <input
                    type="time"
                    value={defaultShiftStart}
                    onChange={(e) => setDefaultShiftStart(e.target.value)}
                    style={{
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: '1.5px solid #7dd3fc',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      background: '#fff'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1' }}>⏰ وقت النهاية:</span>
                  <input
                    type="time"
                    value={defaultShiftEnd}
                    onChange={(e) => setDefaultShiftEnd(e.target.value)}
                    style={{
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: '1.5px solid #7dd3fc',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      background: '#fff'
                    }}
                  />
                </div>

                {isMultiBranchEmp && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1' }}>🏢 تطبيق على:</span>
                    <select
                      value={defaultApplyBranchId}
                      onChange={(e) => setDefaultApplyBranchId(e.target.value)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1.5px solid #7dd3fc',
                        fontSize: '12px',
                        fontWeight: 800,
                        background: '#fff',
                        color: '#0369a1'
                      }}
                    >
                      <option value="all">🌐 كافة الفروع</option>
                      {availableBranchesForEmp.map((b) => (
                        <option key={b.id} value={b.id}>
                          🏢 {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  className="btn"
                  onClick={handleApplyDefaultShiftTimes}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 900,
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  title={defaultApplyBranchId === 'all' ? 'تطبيق موعد البداية والنهاية على كافة أيام العمل' : 'تطبيق موعد البداية والنهاية على أيام هذا الفرع فقط'}
                >
                  <span>
                    ⚡ {defaultApplyBranchId === 'all' ? 'تطبيق على جميع أيام العمل' : `تطبيق على أيام ${availableBranchesForEmp.find(b => String(b.id) === String(defaultApplyBranchId))?.name || 'الفرع المحدد'}`}
                  </span>
                </button>
              </div>

              <div>
                <button
                  type="button"
                  className="btn"
                  onClick={handleCopyPreviousMonthRoster}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 900,
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  title="نسخ جدول الموظف من الشهر السابق مباشرة وتطبيقه على هذا الشهر"
                >
                  <span>📋 نسخ جدول الشهر السابق</span>
                </button>
              </div>
            </div>

            {/* ── أولاً: عرض التقويم الشهري التفاعلي الكامل لكافة أيام الشهر ── */}
            {activeTabMode === 'monthly_calendar' && (
              <>
                {/* شريط الإجراءات والقوالب السريعة لكامل الشهر */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={applyWeeklyPatternToAllMonth}
                      style={{ fontSize: '12px', padding: '6px 12px', background: '#ecfdf5', color: '#047857', border: '1.5px solid #a7f3d0', borderRadius: '8px', fontWeight: 900 }}
                      title="نسخ النمط الأسبوعي وتطبيقه على كافة أيام دورة هذا الشهر"
                    >
                      ⚡ تطبيق النمط الأسبوعي على كامل أيام الشهر
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {isMultiBranchEmp && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => applyMonthlyPreset('dual_branch')}
                          style={{ fontSize: '11px', padding: '4px 10px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '6px', fontWeight: 800 }}
                          title="ورديتان يومياً: صباحي بفرع ومسائي بفرع آخر"
                        >
                          ☀️/🌆 ورديتان بالفرعين
                        </button>
                        {availableBranchesForEmp.length >= 3 && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => applyMonthlyPreset('tri_branch')}
                            style={{ fontSize: '11px', padding: '4px 10px', background: '#faf5ff', color: '#7e22ce', border: '1px solid #d8b4fe', borderRadius: '6px', fontWeight: 800 }}
                            title="3 ورديات يومياً مقسمة على ثلاثة فروع"
                          >
                            🏢 3 ورديات (بـ 3 فروع)
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => applyMonthlyPreset('alternate_branches')}
                          style={{ fontSize: '11px', padding: '4px 10px', background: '#fdf4ff', color: '#86198f', border: '1px solid #f0abfc', borderRadius: '6px', fontWeight: 800 }}
                          title="تبادل الفروع يوم ويوم"
                        >
                          🔄 تبادل الفروع (يوم ويوم)
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyMonthlyPreset('all_off')}
                      style={{ fontSize: '11px', padding: '4px 10px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', fontWeight: 700 }}
                    >
                      🧹 راحة للكل
                    </button>
                  </div>
                </div>

                {/* بطاقات ملخص إحصائيات الشهر */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⏱️</span>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#166534', fontWeight: 700 }}>ساعات الشهر المخططة</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#15803d' }}>{monthlyStats.totalMonthHours} ساعة</div>
                    </div>
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>💼</span>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#1e40af', fontWeight: 700 }}>أيام العمل بالشهر</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#1d4ed8' }}>{monthlyStats.workDaysCount} يوم</div>
                    </div>
                  </div>

                  <div style={{ background: '#fefce8', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🏖️</span>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#854d0e', fontWeight: 700 }}>أيام الراحة بالشهر</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#a16207' }}>{monthlyStats.offDaysCount} يوم</div>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📅</span>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#475569', fontWeight: 700 }}>أيام دورة الراتب</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#334155' }}>{cycleDays.length} يوم</div>
                    </div>
                  </div>
                </div>

                {/* ── شريط تبويبات الفروع ومؤشر توازن الساعات للموظف متعدد الفروع ── */}
                {isMultiBranchEmp && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                      marginBottom: '14px',
                      padding: '10px 14px',
                      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 900, color: 'var(--text)' }}>
                        🏢 إعداد جدول الفرع:
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveBranchTab('all')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: activeBranchTab === 'all' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#ffffff',
                          color: activeBranchTab === 'all' ? '#ffffff' : '#334155',
                          border: activeBranchTab === 'all' ? 'none' : '1px solid #cbd5e1',
                          boxShadow: activeBranchTab === 'all' ? '0 2px 4px rgba(13, 148, 136, 0.2)' : 'none'
                        }}
                      >
                        🌐 الجدول الموحد الكامل
                      </button>
                      {availableBranchesForEmp.map((b) => {
                        const bStats = branchDistributionStats.find((s) => String(s.id) === String(b.id));
                        const isSel = activeBranchTab === String(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setActiveBranchTab(String(b.id));
                              setDefaultApplyBranchId(String(b.id));
                            }}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              background: isSel ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#ffffff',
                              color: isSel ? '#ffffff' : '#334155',
                              border: isSel ? 'none' : '1px solid #cbd5e1',
                              boxShadow: isSel ? '0 2px 4px rgba(2, 132, 199, 0.2)' : 'none'
                            }}
                          >
                            🏢 {b.name} ({bStats?.hours || 0} س - {bStats?.shiftsCount || 0} وردية)
                          </button>
                        );
                      })}
                    </div>

                    {/* مؤشر توازن ساعات العمل بين الفروع */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#0369a1' }}>
                        ⚖️ توازن الساعات:
                      </span>
                      {branchDistributionStats.map((bs, i) => (
                        <span
                          key={bs.id}
                          style={{
                            background: i === 0 ? '#eff6ff' : '#ecfdf5',
                            color: i === 0 ? '#1e40af' : '#047857',
                            border: `1px solid ${i === 0 ? '#bfdbfe' : '#a7f3d0'}`,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 800
                          }}
                        >
                          {bs.name}: {bs.hours} س ({bs.shiftsCount} وردية)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* جدول أيام دورة الشهر التفاعلي الكامل مع دعم الورديات والفروع المتعددة */}
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '12px', maxHeight: isFullscreen ? 'calc(100vh - 350px)' : 'min(580px, 62vh)', overflowY: 'auto', marginBottom: '16px', WebkitOverflowScrolling: 'touch' }}>
                  <table className="bylaws-table" style={{ margin: 0, fontSize: '12.5px', width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-muted, #f1f5f9)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <tr>
                        {isMultiBranchEmp ? (
                          <>
                            <th style={{ width: '11%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>التاريخ</th>
                            <th style={{ width: '9%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>اليوم</th>
                            <th style={{ width: '11%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>نوع اليوم</th>
                            <th style={{ width: '61%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box', color: '#0369a1' }}>
                              🏢 الورديات المخصصة والفروع (دعم الورديات والفروع المتعددة في نفس اليوم)
                            </th>
                            <th style={{ width: '8%', textAlign: 'center', padding: '10px 4px', boxSizing: 'border-box' }}>الساعات</th>
                          </>
                        ) : (
                          <>
                            <th style={{ width: '14%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>التاريخ</th>
                            <th style={{ width: '14%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>اليوم</th>
                            <th style={{ width: '18%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>نوع اليوم</th>
                            <th style={{ width: '23%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>موعد البداية (دخول)</th>
                            <th style={{ width: '23%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>موعد النهاية (خروج)</th>
                            <th style={{ width: '8%', textAlign: 'center', padding: '10px 4px', boxSizing: 'border-box' }}>الساعات</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {cycleDays.map((day) => {
                        if (day.isPreHire) {
                          return (
                            <tr
                              key={day.dateStr}
                              style={{
                                background: '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                                opacity: 0.8
                              }}
                            >
                              <td style={{ fontWeight: 800, padding: '7px 8px', direction: 'ltr', textAlign: 'center', boxSizing: 'border-box' }}>
                                <span style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#64748b' }}>
                                  {day.dateStr}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700, padding: '7px 8px', textAlign: 'center', color: '#64748b', fontSize: '12.5px', boxSizing: 'border-box' }}>
                                {day.dayLabel || arabicWeekday(day.dateStr)}
                              </td>
                              <td colSpan={isMultiBranchEmp ? 3 : 4} style={{ padding: '6px 12px', textAlign: 'center', boxSizing: 'border-box' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '4px 12px',
                                  borderRadius: '20px',
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                  fontSize: '11.5px',
                                  fontWeight: 800,
                                  border: '1px solid #bae6fd'
                                }}>
                                  🔒 خارج نطاق التعاقد (تاريخ التعيين الرسمي: {day.hireDate})
                                </span>
                              </td>
                            </tr>
                          );
                        }

                        const conf = monthlyDaysSchedule[day.dateStr] || { type: 'shift', start: '08:00', end: '16:00', hours: 8, branchId: defaultBranchId };
                        const isOff = conf.type === 'off' || conf.isOff === true;
                        const isFri = day.dayLabel === 'الجمعة';
                        const dayShifts = getDayShiftsList(conf);
                        const hasOverlap = checkAnyShiftsOverlap(dayShifts);
                        const hasShiftInActiveBranch = activeBranchTab === 'all' || dayShifts.some(s => String(s.branchId) === activeBranchTab);

                        return (
                          <tr
                            key={day.dateStr}
                            style={{
                              background: isOff ? (isFri ? '#fffbeb' : '#fefce8') : (!hasShiftInActiveBranch ? '#f8fafc' : isFri ? '#fafafa' : 'transparent'),
                              borderBottom: '1px solid var(--border)',
                              opacity: (!hasShiftInActiveBranch && activeBranchTab !== 'all') ? 0.75 : 1
                            }}
                          >
                            <td style={{ fontWeight: 800, padding: '7px 6px', direction: 'ltr', textAlign: 'center', boxSizing: 'border-box' }}>
                              <span style={{ background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px', fontSize: '11px', color: '#475569' }}>
                                {day.dateStr}
                              </span>
                            </td>

                            <td style={{ fontWeight: 800, padding: '7px 6px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <span style={{ color: isFri ? '#b45309' : isOff ? '#854d0e' : 'var(--text)', fontSize: '12px', fontWeight: 800 }}>
                                {day.dayLabel || arabicWeekday(day.dateStr)}
                              </span>
                              {isOff && <span style={{ marginRight: '3px', fontSize: '11px' }}>🏖️</span>}
                            </td>

                            <td style={{ padding: '6px 6px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <select
                                value={isOff ? 'off' : 'shift'}
                                onChange={(e) => handleToggleDayType(day.dateStr, e.target.value)}
                                style={{
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  padding: '5px 6px',
                                  borderRadius: '6px',
                                  border: `1.5px solid ${isOff ? '#fde68a' : 'var(--border)'}`,
                                  background: isOff ? '#fefce8' : '#fff',
                                  fontWeight: 700,
                                  fontSize: '11.5px',
                                  color: isOff ? '#92400e' : 'var(--text)'
                                }}
                              >
                                <option value="shift">🟢 وردية</option>
                                <option value="off">🏖️ راحة</option>
                              </select>
                            </td>

                            {isMultiBranchEmp ? (
                              <td style={{ padding: '6px 8px', boxSizing: 'border-box' }}>
                                {isOff ? (
                                  <span style={{ color: '#b45309', fontSize: '11.5px', fontWeight: 700 }}>— يوم راحة أسبوعية (🏖️)</span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {dayShifts.map((shift, idx) => {
                                      const isShiftActiveTab = activeBranchTab === 'all' || String(shift.branchId) === activeBranchTab;
                                      return (
                                        <div
                                          key={shift.id || `shift_${idx}`}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: idx === 0 ? '#f0f9ff' : idx === 1 ? '#f0fdf4' : '#faf5ff',
                                            border: `1.5px solid ${!isShiftActiveTab ? '#e2e8f0' : idx === 0 ? '#bae6fd' : idx === 1 ? '#bbf7d0' : '#e9d5ff'}`,
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            flexWrap: 'wrap',
                                            opacity: (!isShiftActiveTab && activeBranchTab !== 'all') ? 0.6 : 1
                                          }}
                                        >
                                          <span style={{
                                            fontSize: '10px',
                                            fontWeight: 900,
                                            color: idx === 0 ? '#0369a1' : idx === 1 ? '#15803d' : '#7e22ce',
                                            background: '#ffffff',
                                            padding: '2px 5px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(0,0,0,0.08)',
                                            whiteSpace: 'nowrap'
                                          }}>
                                            وردية {idx + 1}
                                          </span>

                                          <select
                                            value={shift.branchId || defaultBranchId}
                                            onChange={(e) => handleUpdateDayShift(day.dateStr, idx, 'branchId', e.target.value)}
                                            style={{
                                              padding: '3px 6px',
                                              fontSize: '11px',
                                              fontWeight: 800,
                                              borderRadius: '5px',
                                              border: '1px solid #cbd5e1',
                                              color: '#1e293b',
                                              background: '#ffffff',
                                              minWidth: '130px',
                                              flex: 1
                                            }}
                                          >
                                            {availableBranchesForEmp.map((b) => (
                                              <option key={b.id} value={b.id}>
                                                {b.name} {b.roleLabel ? `(${b.roleLabel})` : ''}
                                              </option>
                                            ))}
                                          </select>

                                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                            <input
                                              type="time"
                                              value={shift.start || '08:00'}
                                              onChange={(e) => handleUpdateDayShift(day.dateStr, idx, 'start', e.target.value)}
                                              style={{
                                                padding: '3px 4px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                borderRadius: '4px',
                                                border: '1px solid #cbd5e1',
                                                textAlign: 'center',
                                                background: '#ffffff',
                                                width: '72px'
                                              }}
                                            />
                                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>-</span>
                                            <input
                                              type="time"
                                              value={shift.end || '16:00'}
                                              onChange={(e) => handleUpdateDayShift(day.dateStr, idx, 'end', e.target.value)}
                                              style={{
                                                padding: '3px 4px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                borderRadius: '4px',
                                                border: '1px solid #cbd5e1',
                                                textAlign: 'center',
                                                background: '#ffffff',
                                                width: '72px'
                                              }}
                                            />
                                          </div>

                                          <span style={{
                                            fontSize: '11px',
                                            fontWeight: 900,
                                            color: '#0f766e',
                                            background: '#ffffff',
                                            padding: '2px 5px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(0,0,0,0.08)',
                                            whiteSpace: 'nowrap'
                                          }}>
                                            {shift.hours || 0} س
                                          </span>

                                          {dayShifts.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveDayShift(day.dateStr, idx)}
                                              style={{
                                                background: '#fee2e2',
                                                color: '#dc2626',
                                                border: '1px solid #fecaca',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                padding: '2px 6px'
                                              }}
                                              title="حذف هذه الوردية"
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleAddDayShift(day.dateStr, activeBranchTab !== 'all' ? activeBranchTab : null)}
                                        style={{
                                          fontSize: '10.5px',
                                          padding: '3px 8px',
                                          borderRadius: '6px',
                                          background: '#eff6ff',
                                          color: '#1d4ed8',
                                          border: '1px dashed #93c5fd',
                                          cursor: 'pointer',
                                          fontWeight: 800,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px'
                                        }}
                                        title="إضافة وردية لفرع آخر في هذا اليوم"
                                      >
                                        ➕ إضافة وردية فرع آخر لهذا اليوم
                                      </button>
                                      {hasOverlap && (
                                        <span style={{
                                          fontSize: '10px',
                                          fontWeight: 900,
                                          color: '#dc2626',
                                          background: '#fef2f2',
                                          border: '1px solid #fca5a5',
                                          padding: '2px 6px',
                                          borderRadius: '4px'
                                        }}>
                                          ⚠️ تنبيه: تداخل زمني بين الورديات!
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>
                            ) : (
                              <>
                                <td style={{ padding: '6px 6px', textAlign: 'center', boxSizing: 'border-box' }}>
                                  {isOff ? (
                                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>— راحة</span>
                                  ) : (
                                    <input
                                      type="time"
                                      value={conf.start || '08:00'}
                                      onChange={(e) => handleUpdateDayShift(day.dateStr, 0, 'start', e.target.value)}
                                      required={!isOff}
                                      style={{
                                        padding: '5px 6px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border)',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        textAlign: 'center'
                                      }}
                                    />
                                  )}
                                </td>

                                <td style={{ padding: '6px 6px', textAlign: 'center', boxSizing: 'border-box' }}>
                                  {isOff ? (
                                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>— راحة</span>
                                  ) : (
                                    <input
                                      type="time"
                                      value={conf.end || '16:00'}
                                      onChange={(e) => handleUpdateDayShift(day.dateStr, 0, 'end', e.target.value)}
                                      required={!isOff}
                                      style={{
                                        padding: '5px 6px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border)',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        textAlign: 'center'
                                      }}
                                    />
                                  )}
                                </td>
                              </>
                            )}

                            <td style={{ textAlign: 'center', fontWeight: 800, padding: '6px 4px', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: '#b45309', fontSize: '11px' }}>0 س</span>
                              ) : (
                                (() => {
                                  const displayRowHours = !isMultiBranchEmp
                                    ? calculateShiftHours(conf.start || '08:00', conf.end || '16:00')
                                    : (activeBranchTab === 'all'
                                        ? Math.round(dayShifts.reduce((acc, s) => acc + (calculateShiftHours(s.start, s.end) || Number(s.hours) || 0), 0) * 10) / 10
                                        : Math.round(dayShifts.filter(s => String(s.branchId) === String(activeBranchTab)).reduce((acc, s) => acc + (calculateShiftHours(s.start, s.end) || Number(s.hours) || 0), 0) * 10) / 10
                                      );
                                  const shiftCount = !isMultiBranchEmp ? 1 : (activeBranchTab === 'all' ? dayShifts.length : dayShifts.filter(s => String(s.branchId) === String(activeBranchTab)).length);

                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <span style={{ color: 'var(--primary, #0f766e)', fontSize: '12.5px', fontWeight: 900 }}>
                                        {displayRowHours} س
                                      </span>
                                      {isMultiBranchEmp && shiftCount > 1 && (
                                        <span style={{ fontSize: '9px', color: '#0369a1', fontWeight: 800 }}>
                                          ({shiftCount} ورديات)
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── ثانياً: عرض النمط الأسبوعي الأساسي (7 أيام) ── */}
            {activeTabMode === 'weekly_pattern' && (
              <>
                {/* قوالب الورديات السريعة */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                    ⚡ قوالب ضبط سريعة:
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {/* إزالة القوالب الثابتة صباحي/مسائي/ليلي حسب الرغبة والاحتفاظ بأدوات التناوب والتفريغ */}
                    {isMultiBranchEmp && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => applyPreset('dual_branch')}
                          style={{ fontSize: '11.5px', padding: '4px 10px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '6px', fontWeight: 800 }}
                          title="ورديتان يومياً: صباحي بفرع ومسائي بفرع آخر"
                        >
                          ☀️/🌆 ورديتان بالفرعين
                        </button>
                        {availableBranchesForEmp.length >= 3 && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => applyPreset('tri_branch')}
                            style={{ fontSize: '11.5px', padding: '4px 10px', background: '#faf5ff', color: '#7e22ce', border: '1px solid #d8b4fe', borderRadius: '6px', fontWeight: 800 }}
                            title="3 ورديات يومياً مقسمة على ثلاثة فروع"
                          >
                            🏢 3 ورديات (بـ 3 فروع)
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => applyPreset('alternate_branches')}
                          style={{ fontSize: '11.5px', padding: '4px 10px', background: '#fdf4ff', color: '#86198f', border: '1px solid #f0abfc', borderRadius: '6px', fontWeight: 800 }}
                          title="تبادل الفروع يوم ويوم"
                        >
                          🔄 تبادل الفروع (يوم ويوم)
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyPreset('all_off')}
                      style={{ fontSize: '11.5px', padding: '4px 10px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px' }}
                      title="تفريغ كافة الأيام وجعلها راحة"
                    >
                      🧹 تفريغ (راحة للكل)
                    </button>
                  </div>
                </div>

                {/* جدول الأيام السبعة مع دعم الورديات والفروع المتعددة */}
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                  <table className="bylaws-table" style={{ margin: 0, fontSize: '12.5px', width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-muted)' }}>
                        {isMultiBranchEmp ? (
                          <>
                            <th style={{ width: '12%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>اليوم</th>
                            <th style={{ width: '12%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>نوع اليوم</th>
                            <th style={{ width: '66%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box', color: '#0369a1' }}>
                              🏢 الورديات المخصصة والفروع (دعم الورديات والفروع المتعددة في نفس اليوم)
                            </th>
                            <th style={{ width: '10%', textAlign: 'center', padding: '10px 6px', boxSizing: 'border-box' }}>ساعات العمل</th>
                          </>
                        ) : (
                          <>
                            <th style={{ width: '18%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>اليوم</th>
                            <th style={{ width: '26%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>نوع اليوم</th>
                            <th style={{ width: '22%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>موعد البداية (دخول)</th>
                            <th style={{ width: '22%', padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>موعد النهاية (خروج)</th>
                            <th style={{ width: '12%', textAlign: 'center', padding: '10px 6px', boxSizing: 'border-box' }}>ساعات العمل</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS_OF_WEEK.map((d) => {
                        const conf = scheduleInputs[d.label] || { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
                        const isOff = conf.type === 'off' || conf.isOff === true;
                        const dayShifts = getDayShiftsList(conf);
                        const hasOverlap = checkAnyShiftsOverlap(dayShifts);

                        return (
                          <tr
                            key={d.key}
                            style={{
                              background: isOff ? 'rgba(245, 158, 11, 0.04)' : 'transparent',
                              borderBottom: '1px solid var(--border)'
                            }}
                          >
                            <td style={{ fontWeight: 800, padding: '10px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <span style={{ display: 'inline-block', marginLeft: '6px' }}>{isOff ? '🏖️' : '🟢'}</span>
                              {d.label}
                            </td>

                            <td style={{ padding: '8px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <select
                                value={isOff ? 'off' : 'shift'}
                                onChange={(e) => handleToggleWeeklyDayType(d.label, e.target.value)}
                                style={{
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  padding: '6px 8px',
                                  borderRadius: '8px',
                                  border: `1.5px solid ${isOff ? '#fde68a' : 'var(--border)'}`,
                                  background: isOff ? '#fefce8' : '#fff',
                                  fontWeight: 700,
                                  color: isOff ? '#92400e' : 'var(--text)'
                                }}
                              >
                                <option value="shift">🟢 وردية</option>
                                <option value="off">🏖️ راحة</option>
                              </select>
                            </td>

                            {isMultiBranchEmp ? (
                              <td style={{ padding: '6px 8px', boxSizing: 'border-box' }}>
                                {isOff ? (
                                  <span style={{ color: '#b45309', fontSize: '11.5px', fontWeight: 700 }}>— يوم راحة أسبوعية (🏖️)</span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {dayShifts.map((shift, idx) => (
                                      <div
                                        key={shift.id || `weekly_shift_${idx}`}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          background: idx === 0 ? '#f0f9ff' : idx === 1 ? '#f0fdf4' : '#faf5ff',
                                          border: `1.5px solid ${idx === 0 ? '#bae6fd' : idx === 1 ? '#bbf7d0' : '#e9d5ff'}`,
                                          borderRadius: '6px',
                                          padding: '4px 8px',
                                          flexWrap: 'wrap'
                                        }}
                                      >
                                        <span style={{
                                          fontSize: '10px',
                                          fontWeight: 900,
                                          color: idx === 0 ? '#0369a1' : idx === 1 ? '#15803d' : '#7e22ce',
                                          background: '#ffffff',
                                          padding: '2px 5px',
                                          borderRadius: '4px',
                                          border: '1px solid rgba(0,0,0,0.08)',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          وردية {idx + 1}
                                        </span>

                                        <select
                                          value={shift.branchId || defaultBranchId}
                                          onChange={(e) => handleUpdateWeeklyShift(d.label, idx, 'branchId', e.target.value)}
                                          style={{
                                            padding: '3px 6px',
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            borderRadius: '5px',
                                            border: '1px solid #cbd5e1',
                                            color: '#1e293b',
                                            background: '#ffffff',
                                            minWidth: '130px',
                                            flex: 1
                                          }}
                                        >
                                          {availableBranchesForEmp.map((b) => (
                                            <option key={b.id} value={b.id}>
                                              {b.name} {b.roleLabel ? `(${b.roleLabel})` : ''}
                                            </option>
                                          ))}
                                        </select>

                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                          <input
                                            type="time"
                                            value={shift.start || '08:00'}
                                            onChange={(e) => handleUpdateWeeklyShift(d.label, idx, 'start', e.target.value)}
                                            style={{
                                              padding: '3px 4px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              borderRadius: '4px',
                                              border: '1px solid #cbd5e1',
                                              textAlign: 'center',
                                              background: '#ffffff',
                                              width: '72px'
                                            }}
                                          />
                                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>-</span>
                                          <input
                                            type="time"
                                            value={shift.end || '16:00'}
                                            onChange={(e) => handleUpdateWeeklyShift(d.label, idx, 'end', e.target.value)}
                                            style={{
                                              padding: '3px 4px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              borderRadius: '4px',
                                              border: '1px solid #cbd5e1',
                                              textAlign: 'center',
                                              background: '#ffffff',
                                              width: '72px'
                                            }}
                                          />
                                        </div>

                                        <span style={{
                                          fontSize: '11px',
                                          fontWeight: 900,
                                          color: '#0f766e',
                                          background: '#ffffff',
                                          padding: '2px 5px',
                                          borderRadius: '4px',
                                          border: '1px solid rgba(0,0,0,0.08)',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {shift.hours || 0} س
                                        </span>

                                        {dayShifts.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveWeeklyShift(d.label, idx)}
                                            style={{
                                              background: '#fee2e2',
                                              color: '#dc2626',
                                              border: '1px solid #fecaca',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              fontSize: '11px',
                                              fontWeight: 800,
                                              padding: '2px 6px'
                                            }}
                                            title="حذف هذه الوردية"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    ))}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleAddWeeklyShift(d.label)}
                                        style={{
                                          fontSize: '10.5px',
                                          padding: '3px 8px',
                                          borderRadius: '6px',
                                          background: '#eff6ff',
                                          color: '#1d4ed8',
                                          border: '1px dashed #93c5fd',
                                          cursor: 'pointer',
                                          fontWeight: 800,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px'
                                        }}
                                        title="إضافة وردية لفرع آخر في هذا اليوم"
                                      >
                                        ➕ إضافة وردية فرع آخر لهذا اليوم
                                      </button>
                                      {hasOverlap && (
                                        <span style={{
                                          fontSize: '10px',
                                          fontWeight: 900,
                                          color: '#dc2626',
                                          background: '#fef2f2',
                                          border: '1px solid #fca5a5',
                                          padding: '2px 6px',
                                          borderRadius: '4px'
                                        }}>
                                          ⚠️ تنبيه: تداخل زمني بين الورديات!
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>
                            ) : (
                              <>
                                <td style={{ padding: '8px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                                  {isOff ? (
                                    <span style={{ color: 'var(--muted)', fontSize: '12px' }}>— غير محدد</span>
                                  ) : (
                                    <input
                                      type="time"
                                      value={conf.start || '08:00'}
                                      onChange={(e) => handleDayChange(d.label, 'start', e.target.value)}
                                      required={!isOff}
                                      style={{
                                        padding: '6px 8px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        textAlign: 'center'
                                      }}
                                    />
                                  )}
                                </td>

                                <td style={{ padding: '8px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                                  {isOff ? (
                                    <span style={{ color: 'var(--muted)', fontSize: '12px' }}>— غير محدد</span>
                                  ) : (
                                    <input
                                      type="time"
                                      value={conf.end || '16:00'}
                                      onChange={(e) => handleDayChange(d.label, 'end', e.target.value)}
                                      required={!isOff}
                                      style={{
                                        padding: '6px 8px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        textAlign: 'center'
                                      }}
                                    />
                                  )}
                                </td>
                              </>
                            )}

                            <td style={{ textAlign: 'center', fontWeight: 800, padding: '8px 6px', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: '#b45309', fontSize: '12px' }}>0 س</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--primary)', fontSize: '13px' }}>
                                    {Math.round(dayShifts.reduce((acc, s) => acc + (Number(s.hours) || 0), 0) * 10) / 10} س
                                  </span>
                                  {isMultiBranchEmp && dayShifts.length > 1 && (
                                    <span style={{ fontSize: '9.5px', color: '#0369a1', fontWeight: 800 }}>
                                      ({dayShifts.length} ورديات)
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* بطاقة ملخص ساعات الأسبوع */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>⏱️</span>
                    <div>
                      <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>ساعات العمل الأسبوعية</div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#15803d' }}>{stats.totalWeeklyHours} ساعة</div>
                    </div>
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>💼</span>
                    <div>
                      <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700 }}>أيام العمل بالجدول</div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#1d4ed8' }}>{stats.workDaysCount} أيام</div>
                    </div>
                  </div>

                  <div style={{ background: '#fefce8', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>🏖️</span>
                    <div>
                      <div style={{ fontSize: '11px', color: '#854d0e', fontWeight: 700 }}>أيام الراحة الأسبوعية</div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#a16207' }}>{stats.offDaysCount} أيام</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── ملاحظات إضافية ── */}
            <div className="field" style={{ marginBottom: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 700 }}>ملاحظات أو توجيهات خاصة بالجدول (اختياري):</label>
              <input
                type="text"
                placeholder="اكتب أي ملاحظة أو سبب للتعديل..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* ── 3. شريط أزرار الإجراء والاعتماد المثبت بالسفل (Fixed Rigid Footer) ── */}
          <div
            className="modal-card-footer"
            style={{
              padding: '14px 22px',
              borderTop: '1.5px solid var(--border)',
              background: 'var(--surface, #ffffff)',
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.03)',
              position: 'relative',
              marginTop: 'auto',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '8px 18px', fontSize: '13px' }}
            >
              إلغاء التراجع
            </button>

            <button
              type="submit"
              className="btn btn-start"
              disabled={submitting || !targetEmp}
              style={{
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 900,
                background: isBranchManager
                  ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#fff',
                borderRadius: '10px',
                boxShadow: isBranchManager
                  ? '0 4px 14px rgba(2, 132, 199, 0.3)'
                  : '0 4px 14px rgba(5, 150, 105, 0.3)',
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting
                ? 'جاري المعالجة...'
                : isBranchManager
                ? '📤 حفظ وإرسال طلب اعتماد الجدول للإدارة العليا'
                : '⚡ اعتماد وحفظ الجدول الشهري فورياً'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
