import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { arabicWeekday, fmt, isEmployeeActive } from '../../utils/formatters';
import { DAYS_OF_WEEK, formatTime12H, formatShiftRange12H } from './BranchMonthlyRosterModule';
import { getCycleDateRange, getActivePayrollMonth } from '../../utils/periodEngine';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';

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
        (e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === String(branchFilter)))
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
        (e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === String(branchFilter)))
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
    if (Array.isArray(targetEmp.branchesDetails) && targetEmp.branchesDetails.length > 0) {
      return targetEmp.branchesDetails.map((bd, idx) => {
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
    return allBranches;
  }, [targetEmp, allBranches]);

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
    return (state?.rosters || []).find(
      (r) =>
        (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
        (r.month === selectedMonth || !r.month) &&
        (String(r.branchId || '') === String(targetEmp.branchId || branchId || '') || !r.branchId)
    );
  }, [state?.rosters, targetEmp, selectedMonth, branchId]);

  // حالة المدخلات للـ 7 أيام
  const [scheduleInputs, setScheduleInputs] = useState(() => {
    if (existingRoster?.schedule && typeof existingRoster.schedule === 'object') {
      return { ...existingRoster.schedule };
    }
    return { ...DEFAULT_SCHEDULE };
  });

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // تحديث المدخلات عند تبديل الموظف المستهدف
  useEffect(() => {
    if (existingRoster?.schedule && typeof existingRoster.schedule === 'object') {
      setScheduleInputs({ ...existingRoster.schedule });
      if (existingRoster.fromDate) setFromDate(existingRoster.fromDate);
      if (existingRoster.toDate) setToDate(existingRoster.toDate);
    } else {
      setScheduleInputs({ ...DEFAULT_SCHEDULE });
      if (cycleRange?.startDate) setFromDate(cycleRange.startDate);
      if (cycleRange?.endDate) setToDate(cycleRange.endDate);
    }
  }, [targetEmp?.id, existingRoster, cycleRange]);

  // تعديل يوم محدد
  const handleDayChange = (dayLabel, field, value) => {
    setScheduleInputs((prev) => {
      const current = prev[dayLabel] || { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
      let updated = { ...current };

      if (field === 'type') {
        const isOff = value === 'off';
        updated = {
          ...updated,
          type: isOff ? 'off' : 'shift',
          isOff,
          start: isOff ? '' : (updated.start || '08:00'),
          end: isOff ? '' : (updated.end || '16:00'),
          hours: isOff ? 0 : (updated.hours || 8)
        };
      } else if (field === 'start') {
        updated.start = value;
        if (updated.end) {
          const [sH, sM] = value.split(':').map(Number);
          const [eH, eM] = updated.end.split(':').map(Number);
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff <= 0) diff += 24 * 60;
          updated.hours = Math.round((diff / 60) * 10) / 10;
        }
      } else if (field === 'end') {
        updated.end = value;
        if (updated.start) {
          const [sH, sM] = updated.start.split(':').map(Number);
          const [eH, eM] = value.split(':').map(Number);
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff <= 0) diff += 24 * 60;
          updated.hours = Math.round((diff / 60) * 10) / 10;
        }
      }

      return {
        ...prev,
        [dayLabel]: updated
      };
    });
  };

  // ── نمط العرض النشط: التقويم الشهري التفاعلي الكامل vs النمط الأسبوعي ──
  const [activeTabMode, setActiveTabMode] = useState('monthly_calendar');
  const [defaultShiftStart, setDefaultShiftStart] = useState('08:00');
  const [defaultShiftEnd, setDefaultShiftEnd] = useState('16:00');

  // توليد كافة أيام دورة الرواتب الفعلية للشهر المحدد
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
        days.push({
          dateStr,
          dayLabel,
          dayNumber: cur.getDate(),
          monthNumber: cur.getMonth() + 1,
          jsDayIndex: cur.getDay()
        });
        cur.setDate(cur.getDate() + 1);
      }
    } catch (e) {
      console.warn('Error generating cycle days:', e);
    }
    return days;
  }, [cycleRange]);

  // خريطة أيام الشهر التفاعلية المفصلة (YYYY-MM-DD -> { type, start, end, hours, isOff })
  const [monthlyDaysSchedule, setMonthlyDaysSchedule] = useState(() => {
    const map = {};
    if (existingRoster?.schedule && typeof existingRoster.schedule === 'object') {
      Object.keys(existingRoster.schedule).forEach((key) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          map[key] = { ...existingRoster.schedule[key] };
        }
      });
    }
    return map;
  });

  // مزامنة أيام الشهر عند تغيير الموظف أو دورة الشهر
  useEffect(() => {
    if (!cycleDays || cycleDays.length === 0) return;
    setMonthlyDaysSchedule((prev) => {
      const updated = {};
      const defBId = defaultBranchId;
      const defBObj = allBranches.find(b => String(b.id) === String(defBId));
      const defBName = defBObj ? defBObj.name : (branchName || '');

      cycleDays.forEach((day) => {
        if (existingRoster?.schedule && existingRoster.schedule[day.dateStr]) {
          const rawItem = existingRoster.schedule[day.dateStr];
          const bObj = allBranches.find(b => String(b.id) === String(rawItem.branchId));
          updated[day.dateStr] = {
            branchId: rawItem.branchId || defBId,
            branchName: rawItem.branchName || (bObj ? bObj.name : defBName),
            ...rawItem
          };
        } else if (prev[day.dateStr]) {
          updated[day.dateStr] = {
            branchId: prev[day.dateStr].branchId || defBId,
            branchName: prev[day.dateStr].branchName || defBName,
            ...prev[day.dateStr]
          };
        } else {
          const weeklyConf = (existingRoster?.schedule && existingRoster.schedule[day.dayLabel]) || scheduleInputs[day.dayLabel] || DEFAULT_SCHEDULE[day.dayLabel];
          if (weeklyConf) {
            updated[day.dateStr] = {
              branchId: weeklyConf.branchId || defBId,
              branchName: weeklyConf.branchName || defBName,
              ...weeklyConf
            };
          } else {
            const isFri = day.dayLabel === 'الجمعة';
            updated[day.dateStr] = {
              type: isFri ? 'off' : 'shift',
              isOff: isFri,
              start: isFri ? '' : '08:00',
              end: isFri ? '' : '16:00',
              hours: isFri ? 0 : 8,
              branchId: defBId,
              branchName: defBName
            };
          }
        }
      });
      return updated;
    });
  }, [cycleDays, existingRoster, targetEmp?.id, defaultBranchId, allBranches]);

  // تعديل يوم محدد في التقويم الشهري
  const handleMonthlyDayChange = (dateStr, field, value) => {
    setMonthlyDaysSchedule((prev) => {
      const current = prev[dateStr] || { type: 'shift', start: '08:00', end: '16:00', hours: 8, branchId: defaultBranchId };
      let updated = { ...current };

      if (field === 'type') {
        const isOff = value === 'off';
        updated = {
          ...updated,
          type: isOff ? 'off' : 'shift',
          isOff,
          start: isOff ? '' : (updated.start || '08:00'),
          end: isOff ? '' : (updated.end || '16:00'),
          hours: isOff ? 0 : (updated.hours || 8)
        };
      } else if (field === 'start') {
        updated.start = value;
        if (updated.end) {
          const [sH, sM] = value.split(':').map(Number);
          const [eH, eM] = updated.end.split(':').map(Number);
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff <= 0) diff += 24 * 60;
          updated.hours = Math.round((diff / 60) * 10) / 10;
        }
      } else if (field === 'end') {
        updated.end = value;
        if (updated.start) {
          const [sH, sM] = updated.start.split(':').map(Number);
          const [eH, eM] = value.split(':').map(Number);
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff <= 0) diff += 24 * 60;
          updated.hours = Math.round((diff / 60) * 10) / 10;
        }
      } else if (field === 'branchId') {
        const bObj = allBranches.find(b => String(b.id) === String(value));
        updated.branchId = value;
        updated.branchName = bObj ? bObj.name : '';
      }

      return {
        ...prev,
        [dateStr]: updated
      };
    });
  };

  // تطبيق النمط الأسبوعي على كامل أيام الشهر
  const applyWeeklyPatternToAllMonth = () => {
    const updated = {};
    cycleDays.forEach((day) => {
      const pattern = scheduleInputs[day.dayLabel] || DEFAULT_SCHEDULE[day.dayLabel];
      updated[day.dateStr] = { ...pattern };
    });
    setMonthlyDaysSchedule(updated);
    showToast?.('⚡ تم تطبيق النمط الأسبوعي على كامل أيام الشهر بنجاح');
  };

  // تطبيق قوالب الورديات السريعة على كامل أيام الشهر
  const applyMonthlyPreset = (presetType) => {
    const updated = {};
    cycleDays.forEach((day) => {
      const isFri = day.dayLabel === 'الجمعة';
      if (presetType === 'morning') {
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0 }
          : { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8 };
      } else if (presetType === 'evening') {
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0 }
          : { type: 'shift', isOff: false, start: '16:00', end: '00:00', hours: 8 };
      } else if (presetType === 'night') {
        updated[day.dateStr] = isFri
          ? { type: 'off', isOff: true, start: '', end: '', hours: 0 }
          : { type: 'shift', isOff: false, start: '00:00', end: '08:00', hours: 8 };
      } else if (presetType === 'all_off') {
        updated[day.dateStr] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
      }
    });
    setMonthlyDaysSchedule(updated);
  };

  // تطبيق قوالب الورديات السريعة للنمط الأسبوعي
  const applyPreset = (presetType) => {
    const newInputs = {};
    DAYS_OF_WEEK.forEach((d) => {
      if (presetType === 'morning') {
        if (d.label === 'الجمعة') {
          newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
        } else {
          newInputs[d.label] = { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8 };
        }
      } else if (presetType === 'evening') {
        if (d.label === 'الجمعة') {
          newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
        } else {
          newInputs[d.label] = { type: 'shift', isOff: false, start: '16:00', end: '00:00', hours: 8 };
        }
      } else if (presetType === 'night') {
        if (d.label === 'الجمعة') {
          newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
        } else {
          newInputs[d.label] = { type: 'shift', isOff: false, start: '00:00', end: '08:00', hours: 8 };
        }
      } else if (presetType === 'all_off') {
        newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
      }
    });
    setScheduleInputs(newInputs);
  };

  // تطبيق مواعيد الوردية الافتراضية على جميع أيام العمل مع الحفاظ على الراحات
  const handleApplyDefaultShiftTimes = () => {
    if (!defaultShiftStart || !defaultShiftEnd) {
      showToast?.('⚠️ يرجى تحديد وقت البداية ووقت النهاية');
      return;
    }
    const [sH, sM] = defaultShiftStart.split(':').map(Number);
    const [eH, eM] = defaultShiftEnd.split(':').map(Number);
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff <= 0) diff += 24 * 60;
    const hours = Math.round((diff / 60) * 10) / 10;

    // تطبيق على الأيام في التقويم الشهري
    setMonthlyDaysSchedule((prev) => {
      const updated = { ...prev };
      cycleDays.forEach((day) => {
        const cur = updated[day.dateStr] || { type: 'shift', isOff: false };
        if (cur.type !== 'off' && !cur.isOff) {
          updated[day.dateStr] = {
            ...cur,
            start: defaultShiftStart,
            end: defaultShiftEnd,
            hours
          };
        }
      });
      return updated;
    });

    // تطبيق على النمط الأسبوعي أيضاً
    setScheduleInputs((prev) => {
      const updated = { ...prev };
      DAYS_OF_WEEK.forEach((d) => {
        const cur = updated[d.label] || { type: 'shift', isOff: false };
        if (cur.type !== 'off' && !cur.isOff) {
          updated[d.label] = {
            ...cur,
            start: defaultShiftStart,
            end: defaultShiftEnd,
            hours
          };
        }
      });
      return updated;
    });

    showToast?.('⚡ تم تطبيق مواعيد الوردية على جميع أيام العمل بنجاح');
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

    cycleDays.forEach((day) => {
      const conf = monthlyDaysSchedule[day.dateStr];
      if (!conf || conf.type === 'off' || conf.isOff === true) {
        offDaysCount++;
      } else if (conf.start && conf.end) {
        workDaysCount++;
        const [sH, sM] = conf.start.split(':').map(Number);
        const [eH, eM] = conf.end.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff <= 0) diff += 24 * 60;
        totalMonthHours += Math.round((diff / 60) * 10) / 10;
      }
    });

    return {
      totalMonthHours: Math.round(totalMonthHours * 10) / 10,
      workDaysCount,
      offDaysCount,
      totalDays: cycleDays.length
    };
  }, [cycleDays, monthlyDaysSchedule]);

  // إحصائيات الجدول الأسبوعي المعد
  const stats = useMemo(() => {
    let totalWeeklyHours = 0;
    let workDaysCount = 0;
    let offDaysCount = 0;

    DAYS_OF_WEEK.forEach((d) => {
      const conf = scheduleInputs[d.label];
      if (!conf || conf.type === 'off' || conf.isOff === true) {
        offDaysCount++;
      } else if (conf.start && conf.end) {
        workDaysCount++;
        const [sH, sM] = conf.start.split(':').map(Number);
        const [eH, eM] = conf.end.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff <= 0) diff += 24 * 60;
        totalWeeklyHours += Math.round((diff / 60) * 10) / 10;
      }
    });

    return { totalWeeklyHours: Math.round(totalWeeklyHours * 10) / 10, workDaysCount, offDaysCount };
  }, [scheduleInputs]);

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
      const safeInputs = {
        ...scheduleInputs,
        ...monthlyDaysSchedule
      };
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
        const updatedRosters = [...(state?.rosters || [])];
        const existingIdx = updatedRosters.findIndex(
          (r) =>
            (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
            (r.month === selectedMonth || !r.month) &&
            (String(r.branchId || '') === String(effectiveBranchId) || (!r.branchId && !effectiveBranchId) || r.isFloatingStaff || targetEmp.isFloatingStaff)
        );

        const rosterId = existingIdx >= 0 ? updatedRosters[existingIdx].id : `roster_${targetEmp.id}_${selectedMonth}_${Date.now()}`;
        const newRosterObj = {
          id: rosterId,
          employeeId: targetEmp.id,
          employeeCode: targetEmp.code || '',
          employeeName: targetEmp.name,
          branchId: effectiveBranchId,
          branchName: effectiveBranchName,
          isFloatingStaff: Boolean(targetEmp.isFloatingStaff),
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

        if (existingIdx >= 0) {
          updatedRosters[existingIdx] = newRosterObj;
        } else {
          updatedRosters.unshift(newRosterObj);
        }

        // أيضاً اعتماد أي طلبات روستر معلقة لهذا الموظف لنفس الشهر لإبقاء النظام متسقاً
        const updatedRequests = (state?.requests || []).map((r) => {
          if (
            (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
            (r.month === selectedMonth || !r.month) &&
            (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
            (r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_branch')
          ) {
            return {
              ...r,
              status: 'approved',
              adminApproved: true,
              branchApproved: true,
              approvedAt: new Date().toISOString(),
              approvedBy: 'الإدارة العليا'
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

        const updatedState = {
          ...state,
          rosters: updatedRosters,
          requests: updatedRequests,
          notifications: [newNotification, ...(state?.notifications || [])]
        };

        setState?.(updatedState);
        if (saveState) await saveState(updatedState);

        showToast?.(`✅ تم تعيين واعتماد الجدول الشهري للموظف (${targetEmp.name}) بنجاح!`);
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

        setState?.(updatedState);
        if (saveState) await saveState(updatedState);

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

        showToast?.(`✅ تم إعداد الجدول للموظف (${targetEmp.name}) وإرسال طلب الاعتماد للإدارة العليا بنجاح`);
      }

      onClose?.();
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
          maxWidth: 'min(1360px, 98vw)',
          width: '98vw',
          height: 'calc(100dvh - 20px)',
          maxHeight: 'calc(100dvh - 20px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0,
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          fontFamily: "'Tajawal', sans-serif",
          margin: 'auto',
          background: 'var(--surface, #ffffff)'
        }}
      >
        {/* ── 1. ترويسة المودال المثبتة (Sticky Header) ── */}
        <div
          style={{
            padding: '16px 22px',
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: '18px', padding: '4px 10px', borderRadius: '8px' }}
          >
            ✕
          </button>
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
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1' }}>⏰ وقت البداية الافتراضي:</span>
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
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1' }}>⏰ وقت النهاية الافتراضي:</span>
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
                  title="تطبيق موعد البداية والنهاية على كافة أيام العمل مع الحفاظ على أيام الراحة"
                >
                  <span>⚡ تطبيق على جميع أيام العمل</span>
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

                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyMonthlyPreset('morning')}
                      style={{ fontSize: '11px', padding: '4px 8px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '6px', fontWeight: 700 }}
                    >
                      ☀️ صباحي كامل الشهر
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyMonthlyPreset('evening')}
                      style={{ fontSize: '11px', padding: '4px 8px', background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '6px', fontWeight: 700 }}
                    >
                      🌆 مسائي كامل الشهر
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyMonthlyPreset('night')}
                      style={{ fontSize: '11px', padding: '4px 8px', background: '#faf5ff', color: '#6b21a8', border: '1px solid #d8b4fe', borderRadius: '6px', fontWeight: 700 }}
                    >
                      🌙 ليلي كامل الشهر
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyMonthlyPreset('all_off')}
                      style={{ fontSize: '11px', padding: '4px 8px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', fontWeight: 700 }}
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

                {/* جدول أيام دورة الشهر التفاعلي الكامل مع تنسيق متوازن وتثبيت العرض */}
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '12px', maxHeight: '360px', overflowY: 'auto', marginBottom: '16px', WebkitOverflowScrolling: 'touch' }}>
                  <table className="bylaws-table" style={{ margin: 0, fontSize: '12.5px', width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-muted, #f1f5f9)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <tr>
                        <th style={{ width: isMultiBranchEmp ? '14%' : '16%', padding: '9px 10px', textAlign: 'center', boxSizing: 'border-box' }}>التاريخ</th>
                        <th style={{ width: isMultiBranchEmp ? '12%' : '14%', padding: '9px 10px', textAlign: 'center', boxSizing: 'border-box' }}>اليوم</th>
                        {isMultiBranchEmp && (
                          <th style={{ width: '22%', padding: '9px 10px', textAlign: 'center', boxSizing: 'border-box', color: '#0369a1' }}>
                            🏢 الفرع المخصص
                          </th>
                        )}
                        <th style={{ width: isMultiBranchEmp ? '18%' : '22%', padding: '9px 10px', textAlign: 'center', boxSizing: 'border-box' }}>نوع اليوم</th>
                        <th style={{ width: isMultiBranchEmp ? '17%' : '20%', padding: '9px 10px', textAlign: 'center', boxSizing: 'border-box' }}>موعد البداية (دخول)</th>
                        <th style={{ width: isMultiBranchEmp ? '17%' : '20%', padding: '9px 10px', textAlign: 'center', boxSizing: 'border-box' }}>موعد النهاية (خروج)</th>
                        <th style={{ width: '8%', textAlign: 'center', padding: '9px 10px', boxSizing: 'border-box' }}>الساعات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycleDays.map((day) => {
                        const conf = monthlyDaysSchedule[day.dateStr] || { type: 'shift', start: '08:00', end: '16:00', hours: 8, branchId: defaultBranchId };
                        const isOff = conf.type === 'off' || conf.isOff === true;
                        const isFri = day.dayLabel === 'الجمعة';

                        return (
                          <tr
                            key={day.dateStr}
                            style={{
                              background: isOff ? (isFri ? '#fffbeb' : '#fefce8') : (isFri ? '#fafafa' : 'transparent'),
                              borderBottom: '1px solid var(--border)'
                            }}
                          >
                            <td style={{ fontWeight: 800, padding: '7px 8px', direction: 'ltr', textAlign: 'center', boxSizing: 'border-box' }}>
                              <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '11.5px', color: '#475569' }}>
                                {day.dateStr}
                              </span>
                            </td>

                            <td style={{ fontWeight: 800, padding: '7px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <span style={{ color: isFri ? '#b45309' : isOff ? '#854d0e' : 'var(--text)', fontSize: '13px', fontWeight: 800 }}>
                                {day.dayLabel || arabicWeekday(day.dateStr)}
                              </span>
                              {isOff && <span style={{ marginRight: '4px', fontSize: '11px' }}>🏖️</span>}
                            </td>

                            {isMultiBranchEmp && (
                              <td style={{ padding: '6px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                                <select
                                  value={conf.branchId || defaultBranchId}
                                  onChange={(e) => handleMonthlyDayChange(day.dateStr, 'branchId', e.target.value)}
                                  disabled={isOff}
                                  style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: `1.5px solid ${isOff ? '#e2e8f0' : '#0284c7'}`,
                                    background: isOff ? '#f8fafc' : '#f0f9ff',
                                    fontWeight: 800,
                                    fontSize: '11.5px',
                                    color: isOff ? '#94a3b8' : '#0369a1'
                                  }}
                                  title={isOff ? 'اليوم محدد كراحة' : 'اختر الفرع الذي سيعمل به الموظف في هذا اليوم'}
                                >
                                  {availableBranchesForEmp.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name} {b.roleLabel ? `(${b.roleLabel})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )}

                            <td style={{ padding: '6px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <select
                                value={isOff ? 'off' : 'shift'}
                                onChange={(e) => handleMonthlyDayChange(day.dateStr, 'type', e.target.value)}
                                style={{
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  border: `1.5px solid ${isOff ? '#fde68a' : 'var(--border)'}`,
                                  background: isOff ? '#fefce8' : '#fff',
                                  fontWeight: 700,
                                  fontSize: '12px',
                                  color: isOff ? '#92400e' : 'var(--text)'
                                }}
                              >
                                <option value="shift">🟢 وردية (Shift)</option>
                                <option value="off">🏖️ راحة (OFF)</option>
                              </select>
                            </td>

                            <td style={{ padding: '6px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>— راحة</span>
                              ) : (
                                <input
                                  type="time"
                                  value={conf.start || '08:00'}
                                  onChange={(e) => handleMonthlyDayChange(day.dateStr, 'start', e.target.value)}
                                  required={!isOff}
                                  style={{
                                    padding: '5px 8px',
                                    borderRadius: '6px',
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

                            <td style={{ padding: '6px 8px', textAlign: 'center', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>— راحة</span>
                              ) : (
                                <input
                                  type="time"
                                  value={conf.end || '16:00'}
                                  onChange={(e) => handleMonthlyDayChange(day.dateStr, 'end', e.target.value)}
                                  required={!isOff}
                                  style={{
                                    padding: '5px 8px',
                                    borderRadius: '6px',
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

                            <td style={{ textAlign: 'center', fontWeight: 800, padding: '6px 8px', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: '#b45309', fontSize: '11.5px' }}>0 س</span>
                              ) : (
                                <span style={{ color: 'var(--primary, #0f766e)', fontSize: '12px' }}>
                                  {conf.hours || 8} س
                                </span>
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
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyPreset('morning')}
                      style={{ fontSize: '11.5px', padding: '4px 10px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '6px' }}
                      title="وردية صباحية 8 ص - 4 م (الجمعة راحة)"
                    >
                      ☀️ صباحي (08:00 - 16:00)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyPreset('evening')}
                      style={{ fontSize: '11.5px', padding: '4px 10px', background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '6px' }}
                      title="وردية مسائية 4 م - 12 ص (الجمعة راحة)"
                    >
                      🌆 مسائي (16:00 - 00:00)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => applyPreset('night')}
                      style={{ fontSize: '11.5px', padding: '4px 10px', background: '#faf5ff', color: '#6b21a8', border: '1px solid #d8b4fe', borderRadius: '6px' }}
                      title="وردية ليلية 12 ص - 8 ص (الجمعة راحة)"
                    >
                      🌙 ليلي (00:00 - 08:00)
                    </button>
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

                {/* جدول الأيام السبعة */}
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                  <table className="bylaws-table" style={{ margin: 0, fontSize: '13px', width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-muted)' }}>
                        <th style={{ width: '18%', padding: '10px 10px', textAlign: 'center', boxSizing: 'border-box' }}>اليوم</th>
                        <th style={{ width: '26%', padding: '10px 10px', textAlign: 'center', boxSizing: 'border-box' }}>نوع اليوم</th>
                        <th style={{ width: '22%', padding: '10px 10px', textAlign: 'center', boxSizing: 'border-box' }}>موعد البداية (دخول)</th>
                        <th style={{ width: '22%', padding: '10px 10px', textAlign: 'center', boxSizing: 'border-box' }}>موعد النهاية (خروج)</th>
                        <th style={{ width: '12%', textAlign: 'center', padding: '10px 10px', boxSizing: 'border-box' }}>ساعات العمل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS_OF_WEEK.map((d) => {
                        const conf = scheduleInputs[d.label] || { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
                        const isOff = conf.type === 'off' || conf.isOff === true;

                        return (
                          <tr
                            key={d.key}
                            style={{
                              background: isOff ? 'rgba(245, 158, 11, 0.04)' : 'transparent',
                              borderBottom: '1px solid var(--border)'
                            }}
                          >
                            <td style={{ fontWeight: 800, padding: '10px 10px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <span style={{ display: 'inline-block', marginLeft: '6px' }}>{isOff ? '🏖️' : '🟢'}</span>
                              {d.label}
                            </td>

                            <td style={{ padding: '8px 10px', textAlign: 'center', boxSizing: 'border-box' }}>
                              <select
                                value={isOff ? 'off' : 'shift'}
                                onChange={(e) => handleDayChange(d.label, 'type', e.target.value)}
                                style={{
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: `1.5px solid ${isOff ? '#fde68a' : 'var(--border)'}`,
                                  background: isOff ? '#fefce8' : '#fff',
                                  fontWeight: 700,
                                  color: isOff ? '#92400e' : 'var(--text)'
                                }}
                              >
                                <option value="shift">🟢 وردية (Shift)</option>
                                <option value="off">🏖️ راحة (OFF)</option>
                              </select>
                            </td>

                            <td style={{ padding: '8px 10px', textAlign: 'center', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>— غير محدد</span>
                              ) : (
                                <input
                                  type="time"
                                  value={conf.start || '08:00'}
                                  onChange={(e) => handleDayChange(d.label, 'start', e.target.value)}
                                  required={!isOff}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    textAlign: 'center'
                                  }}
                                />
                              )}
                            </td>

                            <td style={{ padding: '8px 10px', textAlign: 'center', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>— غير محدد</span>
                              ) : (
                                <input
                                  type="time"
                                  value={conf.end || '16:00'}
                                  onChange={(e) => handleDayChange(d.label, 'end', e.target.value)}
                                  required={!isOff}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    textAlign: 'center'
                                  }}
                                />
                              )}
                            </td>

                            <td style={{ textAlign: 'center', fontWeight: 800, padding: '8px 10px', boxSizing: 'border-box' }}>
                              {isOff ? (
                                <span style={{ color: '#b45309', fontSize: '12px' }}>0 س</span>
                              ) : (
                                <span style={{ color: 'var(--primary)', fontSize: '13px' }}>
                                  {conf.hours || 8} س
                                </span>
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
