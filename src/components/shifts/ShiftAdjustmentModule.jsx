import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { arabicWeekday, fmt } from '../../utils/formatters';
import { getRealTodayStr } from '../../utils/timeEngine';
import { findEmployeeRoster, getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { calculateLatenessMinutes } from '../../utils/latePenaltyEngine';
import { dispatchEmployeeRequest } from '../../utils/requestSubmissionHelper';
import { shouldRouteDirectToAdmin, isBranchWithoutManager } from '../../utils/jobsHelper';
import { getCycleDateRange } from '../../utils/periodEngine';

/**
 * دالة مساعدة لحساب الفارق بالساعات بين وقتين بصيغة HH:mm
 */
function calculateHoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  let diff = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
  if (diff <= 0) diff += 24 * 60; // في حال تخطي منتصف الليل
  return parseFloat((diff / 60).toFixed(2));
}

/**
 * دالة مساعدة لإضافة عدد ساعات لتوقيت معين بصيغة HH:mm
 */
function addHoursToTime(timeStr, hoursToAdd = 8) {
  if (!timeStr) return '16:00';
  const [h, m] = timeStr.split(':').map(Number);
  const endH = (h + hoursToAdd) % 24;
  return `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

/**
 * ShiftAdjustmentModule.jsx
 * وحدة تعديل الشيفت والجدول الشهري المتطورة
 * 
 * الميزات المطورة (البنود 21، 22، 23، 24):
 * 1. المطابقة البصرية الذكية (Visual Punch vs Roster Reconciliation) بين البصمات والجدول المعتمد
 * 2. البند 21: تسوية العمل في يوم راحة مع تحديد أوقات بداية ونهاية الوردية في يوم الراحة واليوم البديل
 * 3. البند 22: تسوية على البصمة لأكثر من يوم دفعة واحدة (Bulk Punch Alignment) للأيام المختارة
 * 4. البند 23: إمكانية تعديل كل يوم على حدة عند اختيار أكثر من يوم مع قسم معاينة تفاعلي مباشر قبل الإرسال
 * 5. البند 24: إمكانية معاينة الطلب المرسل بكامل تفاصيله وجدوله المقارن ومسار اعتماده بنافذة كاملة Portal
 * 6. كشف تلقائي لجزاءات التأخير مع التنبيه بالإلغاء والإسقاط الفوري عند الاعتماد
 * 7. دورة اعتماد متكاملة (مدير الفرع ثم الإدارة العليا)
 */
export default function ShiftAdjustmentModule({
  mode = 'employee', // 'employee' | 'admin' | 'branch'
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth: initialSelectedMonth,
  selectedBranchId
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return initialSelectedMonth || getRealTodayStr().slice(0, 7);
  });

  const [selectedDates, setSelectedDates] = useState([]);
  const [actionType, setActionType] = useState('modify_hours'); // 'modify_hours' | 'set_rest_day' | 'compensate_worked_rest'
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('16:00');

  // البند 21: تحديد مواعيد بداية ونهاية العمل في يوم الراحة واليوم البديل
  const [workedRestStartTime, setWorkedRestStartTime] = useState('08:00');
  const [workedRestEndTime, setWorkedRestEndTime] = useState('16:00');
  const [replacementRestDate, setReplacementRestDate] = useState('');

  // البند 23: إعدادات مخصصة لكل يوم على حدة { [dateStr]: { dateStr, actionType, startTime, endTime, workedRestStartTime, workedRestEndTime, replacementRestDate, hours } }
  const [dayCustomConfigs, setDayCustomConfigs] = useState({});

  // البند 24: معاينة الطلب المرسل في نافذة منبثقة
  const [previewAdjustmentReq, setPreviewAdjustmentReq] = useState(null);

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'late_only' | 'worked_rest'

  const activeEmp = emp || (state?.employees || [])[0];
  const activeBranchId = selectedBranchId || activeEmp?.branchesDetails?.[0]?.branchId || activeEmp?.branchId || '';
  const branchObj = (state?.branches || []).find((b) => b && String(b.id) === String(activeBranchId));
  const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

  // دورة الشهر المعتمدة للرواتب والتشغيل
  const cycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, state?.orgSettings);
  }, [selectedMonth, state?.orgSettings]);

  // 1. حساب قائمة أيام دورة الشهر وبياناتها
  const daysInMonth = useMemo(() => {
    if (!selectedMonth || !cycleRange?.startDate || !cycleRange?.endDate) return [];
    const list = [];
    const empIdStr = String(activeEmp?.id || '');

    // جلب البصمات والورديات وحالات التأخير الواقعة ضمن مجال دورة الشهر
    const shifts = (state?.shifts || []).filter(
      (s) => String(s.employeeId) === empIdStr && s.date && s.date >= cycleRange.startDate && s.date <= cycleRange.endDate
    );
    const lateIncidents = (state?.lateIncidents || []).filter(
      (inc) => String(inc.employeeId) === empIdStr && inc.date && inc.date >= cycleRange.startDate && inc.date <= cycleRange.endDate
    );

    const curr = new Date(cycleRange.startDate + 'T00:00:00');
    const end = new Date(cycleRange.endDate + 'T00:00:00');

    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const dayName = arabicWeekday(dateStr);
      const jsDay = curr.getDay();

      // الجدول المعتمد لليوم
      const daySchedule = getEmployeeDaySchedule(activeEmp?.id, dateStr, state);
      const isOff = daySchedule?.type === 'off' || daySchedule?.isOff === true;

      // البصمات المسجلة لليوم
      const dayShifts = shifts.filter((s) => s.date === dateStr);
      const punchIn = dayShifts.length > 0 ? (dayShifts[0].timeIn || dayShifts[0].inTime || '') : '';
      const punchOut = dayShifts.length > 0 ? (dayShifts[dayShifts.length - 1].timeOut || dayShifts[dayShifts.length - 1].outTime || '') : '';
      const totalHoursWorked = dayShifts.reduce((sum, s) => sum + (parseFloat(s.hours || s.totalHours) || 0), 0);

      // وقائع التأخير لليوم
      const dayLates = lateIncidents.filter((inc) => inc.date === dateStr);
      const activeLate = dayLates.find((inc) => inc.status !== 'cancelled' && !inc.isCancelled && (parseFloat(inc.penaltyAmount) > 0 || parseFloat(inc.deductionMinutes) > 0));
      const waivedLate = dayLates.find((inc) => inc.status === 'cancelled' || inc.isCancelled || inc.status === 'waived');

      // دقائق التأخير المحسوبة
      let latenessMins = 0;
      if (punchIn && daySchedule?.start && !isOff) {
        latenessMins = calculateLatenessMinutes(daySchedule.start, punchIn);
      }

      // هل نزل في يوم راحة؟
      const isWorkedRestDay = isOff && dayShifts.length > 0;

      list.push({
        dateStr,
        dayName,
        jsDay,
        scheduledShift: daySchedule,
        isOff,
        punchIn,
        punchOut,
        totalHoursWorked,
        latenessMins,
        activeLate,
        waivedLate,
        isWorkedRestDay,
        hasPunches: dayShifts.length > 0
      });

      curr.setDate(curr.getDate() + 1);
    }

    return list;
  }, [selectedMonth, cycleRange, activeEmp, state, activeBranchId]);

  // تصفية الأيام بناءً على الفلتر
  const filteredDays = useMemo(() => {
    if (filterMode === 'late_only') {
      return daysInMonth.filter((d) => d.activeLate || d.latenessMins > 0);
    }
    if (filterMode === 'worked_rest') {
      return daysInMonth.filter((d) => d.isWorkedRestDay);
    }
    return daysInMonth;
  }, [daysInMonth, filterMode]);

  // قائمة الأيام المختارة التي بها بصمات فعلية
  const selectedDaysWithPunches = useMemo(() => {
    return selectedDates
      .map((dStr) => daysInMonth.find((d) => d.dateStr === dStr))
      .filter((d) => d && Boolean(d.punchIn));
  }, [selectedDates, daysInMonth]);

  // طلبات تعديل الشيفت السابقة لهذا الموظف
  const adjustmentRequests = useMemo(() => {
    const empIdStr = String(activeEmp?.id || '');
    return (state?.requests || [])
      .filter((r) => {
        if (!r) return false;
        const isMatchEmp = String(r.employeeId) === empIdStr || (activeEmp?.code && String(r.employeeCode) === String(activeEmp.code));
        const isAdjType = r.type === 'shift_adjustment' || r.type === 'roster_edit' || r.type === 'roster_edit_request';
        return isMatchEmp && isAdjType;
      })
      .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
  }, [state?.requests, activeEmp]);

  // دالة مساعدة لإنشاء التكوين الافتراضي ليوم معين
  const getDefaultConfigForDate = (dateStr, actType = actionType) => {
    const dayItem = daysInMonth.find((d) => d.dateStr === dateStr);
    const targetAction = actType || (dayItem?.isWorkedRestDay ? 'compensate_worked_rest' : 'modify_hours');

    if (targetAction === 'compensate_worked_rest') {
      const start = dayItem?.punchIn || workedRestStartTime || '08:00';
      const end = dayItem?.punchOut || addHoursToTime(start, 8);
      return {
        dateStr,
        actionType: 'compensate_worked_rest',
        workedRestStartTime: start,
        workedRestEndTime: end,
        replacementRestDate: replacementRestDate || '',
        hours: calculateHoursBetween(start, end)
      };
    }

    if (targetAction === 'set_rest_day') {
      return {
        dateStr,
        actionType: 'set_rest_day',
        startTime: '',
        endTime: '',
        hours: 0
      };
    }

    // modify_hours
    const start = dayItem?.punchIn || newStartTime || '08:00';
    const end = dayItem?.punchOut || (dayItem?.punchIn ? addHoursToTime(dayItem.punchIn, 8) : newEndTime || '16:00');
    return {
      dateStr,
      actionType: 'modify_hours',
      startTime: start,
      endTime: end,
      hours: calculateHoursBetween(start, end)
    };
  };

  // دالة تحديث تكوين يوم فردي مخصص
  const updateDayConfig = (dateStr, patch) => {
    setDayCustomConfigs((prev) => {
      const curr = prev[dateStr] || getDefaultConfigForDate(dateStr);
      const updated = { ...curr, ...patch };

      if (updated.actionType === 'set_rest_day') {
        updated.hours = 0;
      } else if (updated.actionType === 'compensate_worked_rest') {
        updated.hours = calculateHoursBetween(
          updated.workedRestStartTime || '08:00',
          updated.workedRestEndTime || '16:00'
        );
      } else {
        updated.hours = calculateHoursBetween(
          updated.startTime || '08:00',
          updated.endTime || '16:00'
        );
      }

      return {
        ...prev,
        [dateStr]: updated
      };
    });
  };

  // تبديل اختيار تاريخ محدد
  const handleToggleDate = (dateStr) => {
    setSelectedDates((prev) => {
      if (prev.includes(dateStr)) {
        return prev.filter((d) => d !== dateStr);
      } else {
        setDayCustomConfigs((cfgs) => ({
          ...cfgs,
          [dateStr]: cfgs[dateStr] || getDefaultConfigForDate(dateStr)
        }));
        return [...prev, dateStr];
      }
    });
  };

  // اختيار الكل / إلغاء الكل
  const handleSelectAll = () => {
    if (selectedDates.length === filteredDays.length) {
      setSelectedDates([]);
    } else {
      const allDates = filteredDays.map((d) => d.dateStr);
      setSelectedDates(allDates);
      setDayCustomConfigs((cfgs) => {
        const next = { ...cfgs };
        allDates.forEach((dStr) => {
          if (!next[dStr]) {
            next[dStr] = getDefaultConfigForDate(dStr);
          }
        });
        return next;
      });
    }
  };

  // البند 22: تسوية مجمعة على البصمة لأكثر من يوم دفعة واحدة (Bulk Punch Alignment)
  const handleBulkAlignToPunches = (targetDates = selectedDates) => {
    const datesToProcess = targetDates.length > 0 ? targetDates : filteredDays.map((d) => d.dateStr);
    const daysWithPunches = datesToProcess
      .map((dStr) => daysInMonth.find((d) => d.dateStr === dStr))
      .filter((d) => d && Boolean(d.punchIn));

    if (daysWithPunches.length === 0) {
      showToast?.('⚠️ لم يتم العثور على أي بصمات مسجلة للأيام المحددة لتسويتها');
      return;
    }

    const mergedDates = Array.from(new Set([...selectedDates, ...daysWithPunches.map((d) => d.dateStr)]));
    setSelectedDates(mergedDates);
    setActionType('modify_hours');

    setDayCustomConfigs((prev) => {
      const next = { ...prev };
      daysWithPunches.forEach((d) => {
        const start = d.punchIn;
        const end = d.punchOut || addHoursToTime(d.punchIn, 8);
        next[d.dateStr] = {
          dateStr: d.dateStr,
          actionType: 'modify_hours',
          startTime: start,
          endTime: end,
          hours: calculateHoursBetween(start, end)
        };
      });
      return next;
    });

    if (daysWithPunches[0]) {
      setNewStartTime(daysWithPunches[0].punchIn);
      setNewEndTime(daysWithPunches[0].punchOut || addHoursToTime(daysWithPunches[0].punchIn, 8));
    }

    setReason(`تسوية مواعيد الشيفت لـ (${daysWithPunches.length}) أيام لتتطابق بدقة مع البصمات الفعلية المسجلة وإسقاط جزاءات التأخير`);
    showToast?.(`⚡ تم مطابقة وتسوية (${daysWithPunches.length}) أيام بنجاح على أوقات البصمات الفعلية!`);
  };

  // تسوية فورية على وقت البصمة لصف محدد (Auto-Align to Punch)
  const handleAutoAlignToPunch = (dayItem) => {
    if (!dayItem.punchIn) {
      showToast?.('⚠️ لا توجد بصمة مسجلة لهذا اليوم للتسوية عليها');
      return;
    }

    // إذا كان الموظف محدد أكثر من يوم والصف المنقور جزء من التحديد، نقوم بتسوية كافة الأيام المحددة ذات البصمات
    if (selectedDates.length > 1 && selectedDates.includes(dayItem.dateStr)) {
      handleBulkAlignToPunches(selectedDates);
      return;
    }

    // وإلا يتم تسوية هذا اليوم فقط مع تحديده
    setSelectedDates([dayItem.dateStr]);
    setActionType('modify_hours');
    const start = dayItem.punchIn;
    const end = dayItem.punchOut || addHoursToTime(dayItem.punchIn, 8);
    setNewStartTime(start);
    setNewEndTime(end);

    setDayCustomConfigs((prev) => ({
      ...prev,
      [dayItem.dateStr]: {
        dateStr: dayItem.dateStr,
        actionType: 'modify_hours',
        startTime: start,
        endTime: end,
        hours: calculateHoursBetween(start, end)
      }
    }));

    setReason(`تسوية موعد الحضور ليتطابق مع بصمة الحضور الفعلية (${dayItem.punchIn}) لإسقاط جزاء التأخير`);
    showToast?.(`⚡ تم ضبط الميعاد تلقائياً على وقت البصمة (${dayItem.punchIn})`);
  };

  // تحويل سريع لراحة
  const handleQuickSetRest = (dayItem) => {
    setSelectedDates((prev) => (prev.includes(dayItem.dateStr) ? prev : [...prev, dayItem.dateStr]));
    updateDayConfig(dayItem.dateStr, {
      actionType: 'set_rest_day',
      startTime: '',
      endTime: '',
      hours: 0
    });
    setReason(`تحديد يوم ${dayItem.dayName} الموافق ${dayItem.dateStr} كيوم راحة أسبوعية`);
    showToast?.(`🛋️ تم تحديد يوم ${dayItem.dateStr} كـ راحة`);
  };

  // تطبيق الإعدادات العامة على كافة الأيام المختارة
  const handleApplyGlobalToAll = () => {
    if (selectedDates.length === 0) return;
    setDayCustomConfigs((prev) => {
      const next = { ...prev };
      selectedDates.forEach((dStr) => {
        next[dStr] = getDefaultConfigForDate(dStr, actionType);
      });
      return next;
    });
    showToast?.(`🔄 تم تعميم الإعدادات العامة على كافة الأيام المختارة (${selectedDates.length})`);
  };

  // تحويل كافة الأيام المختارة لراحة دفعة واحدة
  const handleSetAllSelectedAsRest = () => {
    if (selectedDates.length === 0) return;
    setDayCustomConfigs((prev) => {
      const next = { ...prev };
      selectedDates.forEach((dStr) => {
        next[dStr] = {
          dateStr: dStr,
          actionType: 'set_rest_day',
          startTime: '',
          endTime: '',
          hours: 0
        };
      });
      return next;
    });
    showToast?.(`🛋️ تم تحويل كافة الأيام المختارة (${selectedDates.length}) إلى أيام راحة`);
  };

  // فحص ما إذا كانت الأيام المختارة تحتوي على جزاءات تأخير معلقة
  const selectedDaysPenalties = useMemo(() => {
    const list = [];
    selectedDates.forEach((dStr) => {
      const dayInfo = daysInMonth.find((d) => d.dateStr === dStr);
      if (dayInfo && dayInfo.activeLate) {
        list.push({ date: dStr, late: dayInfo.activeLate });
      }
    });
    return list;
  }, [selectedDates, daysInMonth]);

  // إحصائيات المعاينة المباشرة للأيام المختارة
  const previewSummary = useMemo(() => {
    let totalWorkHours = 0;
    let restDaysCount = 0;
    let workDaysCount = 0;

    selectedDates.forEach((dStr) => {
      const cfg = dayCustomConfigs[dStr] || getDefaultConfigForDate(dStr);
      if (cfg.actionType === 'set_rest_day') {
        restDaysCount += 1;
      } else {
        workDaysCount += 1;
        totalWorkHours += (cfg.hours || 0);
      }
    });

    return {
      totalDays: selectedDates.length,
      totalWorkHours: parseFloat(totalWorkHours.toFixed(2)),
      restDaysCount,
      workDaysCount
    };
  }, [selectedDates, dayCustomConfigs]);

  // إرسال طلب تعديل الشيفت
  const handleSubmitAdjustment = async (e) => {
    if (e) e.preventDefault();
    if (!activeEmp) {
      showToast?.('❌ خطأ: لم يتم تحديد بيانات الموظف');
      return;
    }
    if (selectedDates.length === 0) {
      showToast?.('⚠️ يرجى اختيار يوم واحد على الأقل من الجدول لتعديل الشيفت');
      return;
    }

    // التحقق من الحقول الإلزامية لكل يوم على حدة
    for (const dStr of selectedDates) {
      // التحقق الصارم من وقوع التواريخ داخل دورة الشهر السارية
      if (dStr < cycleRange.startDate || dStr > cycleRange.endDate) {
        showToast?.(`⚠️ تاريخ اليوم المحدد (${dStr}) يقع خارج نطاق دورة الشهر السارية (${cycleRange.startDate} إلى ${cycleRange.endDate}). يُسمح بالتعديل فقط ضمن دورة الشهر الحالية.`);
        return;
      }

      const cfg = dayCustomConfigs[dStr] || getDefaultConfigForDate(dStr);
      if (cfg.actionType === 'modify_hours') {
        if (!cfg.startTime || !cfg.endTime) {
          showToast?.(`يرجى تحديد وقت بداية ونهاية العمل ليوم ${dStr}`);
          return;
        }
      } else if (cfg.actionType === 'compensate_worked_rest') {
        if (!cfg.replacementRestDate) {
          showToast?.(`يرجى تحديد تاريخ يوم الراحة البديل ليوم ${dStr}`);
          return;
        }
        if (cfg.replacementRestDate < cycleRange.startDate || cfg.replacementRestDate > cycleRange.endDate) {
          showToast?.(`⚠️ تاريخ يوم الراحة البديل (${cfg.replacementRestDate}) يقع خارج نطاق دورة الشهر السارية (${cycleRange.startDate} إلى ${cycleRange.endDate}).`);
          return;
        }
        if (!cfg.workedRestStartTime || !cfg.workedRestEndTime) {
          showToast?.(`يرجى تحديد بداية ونهاية الوردية ليوم الراحة ${dStr}`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const reqBranchId = activeBranchId || activeEmp.branchesDetails?.[0]?.branchId || activeEmp.branchId;
      const noBranchMgr = isBranchWithoutManager(reqBranchId, state);
      const isDirectAdmin = noBranchMgr || shouldRouteDirectToAdmin(activeEmp, reqBranchId, state);
      const targetApproval = isDirectAdmin ? 'admin_only' : 'branch_and_admin';

      // بناء خريطة الجداول الجديدة والسابقة للأيام المختارة بدقة من التخصيص الفردي
      const newScheduleMap = {};
      const oldScheduleMap = {};

      selectedDates.forEach((dStr) => {
        // تسجيل الجدول السابق الدقيق لهذا التاريخ
        const existingDaySched = getEmployeeDaySchedule(activeEmp?.id, dStr, state);
        if (existingDaySched) {
          oldScheduleMap[dStr] = existingDaySched;
        }

        const cfg = dayCustomConfigs[dStr] || getDefaultConfigForDate(dStr);

        if (cfg.actionType === 'modify_hours') {
          const s = cfg.startTime || newStartTime || '08:00';
          const e = cfg.endTime || newEndTime || '16:00';
          const hrs = cfg.hours || calculateHoursBetween(s, e);
          newScheduleMap[dStr] = {
            type: 'shift',
            isOff: false,
            start: s,
            end: e,
            hours: hrs
          };
        } else if (cfg.actionType === 'set_rest_day') {
          newScheduleMap[dStr] = {
            type: 'off',
            isOff: true,
            start: '',
            end: '',
            hours: 0
          };
        } else if (cfg.actionType === 'compensate_worked_rest') {
          // اليوم الذي نزل فيه يصبح وردية عمل بالأوقات المحددة بالبند 21
          const s = cfg.workedRestStartTime || workedRestStartTime || '08:00';
          const e = cfg.workedRestEndTime || workedRestEndTime || '16:00';
          const hrs = cfg.hours || calculateHoursBetween(s, e);

          newScheduleMap[dStr] = {
            type: 'shift',
            isOff: false,
            start: s,
            end: e,
            hours: hrs,
            isWorkedRestDay: true,
            replacementRestDate: cfg.replacementRestDate || replacementRestDate
          };

          // واليوم البديل يصبح راحة
          const repDate = cfg.replacementRestDate || replacementRestDate;
          if (repDate) {
            newScheduleMap[repDate] = {
              type: 'off',
              isOff: true,
              start: '',
              end: '',
              hours: 0,
              isReplacementOff: true,
              replacedWorkDate: dStr
            };
          }
        }
      });

      const actionTitle =
        selectedDates.length === 1
          ? (dayCustomConfigs[selectedDates[0]]?.actionType === 'set_rest_day'
              ? 'تحويل إلى يوم راحة (Off Day)'
              : dayCustomConfigs[selectedDates[0]]?.actionType === 'compensate_worked_rest'
              ? `تسوية عمل في يوم راحة مع تعيين يوم راحة بديل`
              : `تعديل مواعيد العمل`)
          : `تعديل وتخصيص مواعيد لـ (${selectedDates.length}) أيام`;

      const penaltyWaiverNote =
        selectedDaysPenalties.length > 0
          ? ` (يتضمن إسقاط جزاءات تأخير مسجلة لـ ${selectedDaysPenalties.length} يوم بإجمالي خصم ${selectedDaysPenalties.reduce((sum, p) => sum + (parseFloat(p.late.penaltyAmount) || 0), 0)} ج.م)`
          : '';

      const fullDetails = `${actionTitle} للأيام (${selectedDates.join(', ')})${penaltyWaiverNote}. ${reason ? 'السبب: ' + reason.trim() : ''}`;

      const requestId = 'REQ-SHIFT-ADJ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

      const requestPayload = {
        id: requestId,
        type: 'shift_adjustment',
        requestType: 'shift_adjustment',
        typeLabel: 'طلب تعديل الشيفت والجدول',
        employeeId: activeEmp.id,
        employeeName: activeEmp.name,
        employeeCode: activeEmp.code || '',
        branchId: reqBranchId,
        branchName: branchName,
        date: selectedDates[0],
        dates: selectedDates,
        actionType,
        newStartTime: actionType === 'modify_hours' ? newStartTime : '',
        newEndTime: actionType === 'modify_hours' ? newEndTime : '',
        workedRestStartTime,
        workedRestEndTime,
        replacementRestDate,
        dayCustomConfigs,
        schedule: newScheduleMap,
        newSchedule: newScheduleMap,
        oldSchedule: oldScheduleMap,
        previousSchedule: oldScheduleMap,
        month: selectedMonth,
        fromDate: cycleRange?.startDate,
        toDate: cycleRange?.endDate,
        cycleRangeLabel: cycleRange?.label,
        daysCount: selectedDates.length,
        hasPenaltiesToWaive: selectedDaysPenalties.length > 0,
        penaltiesToWaive: selectedDaysPenalties.map((p) => p.late.id),
        details: fullDetails,
        reason: reason.trim(),
        targetApproval,
        isDirectToAdmin: isDirectAdmin,
        branchNotRequired: isDirectAdmin,
        managerStatus: noBranchMgr ? 'skipped' : (isDirectAdmin ? 'skipped' : 'pending'),
        branchApproved: false,
        adminApproved: false,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // استخدام محرك إرسال الطلبات الموحد
      await dispatchEmployeeRequest({
        request: requestPayload,
        employee: activeEmp,
        state,
        setState,
        saveState,
        showToast
      });

      showToast?.(`✅ تم إرسال طلب تعديل الشيفت لـ (${selectedDates.length}) يوم إلى مدير الفرع والإدارة بنجاح`);

      // إعادة ضبط النموذج
      setSelectedDates([]);
      setDayCustomConfigs({});
      setReason('');
      setReplacementRestDate('');
    } catch (err) {
      console.error('Error submitting shift adjustment request:', err);
      showToast?.('❌ حدث خطأ أثناء إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  // التنقل بين الشهور
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="card ep-tab-content fade-in" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* ── 1. ترويسة الصفحة والمعلومات الأساسية ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #064e3b 100%)',
        borderRadius: '16px',
        padding: '20px 24px',
        color: '#ffffff',
        marginBottom: '20px',
        boxShadow: '0 8px 24px rgba(15, 118, 110, 0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '30px' }}>🔄</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#ffffff', fontFamily: 'Cairo' }}>
                تعديل الشيفت والجدول الشهري
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.9 }}>
                تعديل مواعيد العمل، تحديد الراحات، وتسوية البصمات وإلغاء الجزاءات طبقاً لدورة الشهر ({cycleRange?.shortLabel || selectedMonth})
              </p>
            </div>
          </div>

          {/* محدد الشهر */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '12px' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer', padding: '2px 8px' }}
              title="الشهر السابق"
            >
              ◀
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              style={{
                background: '#ffffff',
                color: '#0f766e',
                border: 'none',
                borderRadius: '8px',
                padding: '4px 10px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            />
            <button
              type="button"
              onClick={handleNextMonth}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer', padding: '2px 8px' }}
              title="الشهر التالي"
            >
              ▶
            </button>
          </div>
        </div>

        {/* بطاقة معلومات الموظف */}
        <div style={{ display: 'flex', gap: '20px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', flexWrap: 'wrap', fontSize: '12.5px' }}>
          <span>👤 الموظف: <strong>{activeEmp?.name || '—'}</strong> ({activeEmp?.code || '—'})</span>
          <span>💼 المسمى: <strong>{activeEmp?.jobTitle || '—'}</strong></span>
          <span>🏢 الفرع: <strong>{branchName}</strong></span>
          <span>📅 دورة الشهر المعروضة: <strong>{cycleRange?.label || selectedMonth}</strong> ({daysInMonth.length} يوم)</span>
        </div>
      </div>

      {/* ── 2. تبويبات تصفية الأيام والمطابقة البصرية ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${filterMode === 'all' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setFilterMode('all')}
            style={{ fontSize: '12px', padding: '5px 12px' }}
          >
            📋 كافة أيام دورة الشهر ({daysInMonth.length})
          </button>
          <button
            type="button"
            className={`btn ${filterMode === 'late_only' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setFilterMode('late_only')}
            style={{ fontSize: '12px', padding: '5px 12px', background: filterMode === 'late_only' ? '#ea580c' : undefined }}
          >
            ⚠️ أيام التأخير والجزاءات ({daysInMonth.filter((d) => d.activeLate || d.latenessMins > 0).length})
          </button>
          <button
            type="button"
            className={`btn ${filterMode === 'worked_rest' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setFilterMode('worked_rest')}
            style={{ fontSize: '12px', padding: '5px 12px', background: filterMode === 'worked_rest' ? '#7c3aed' : undefined }}
          >
            ⭐ عمل في يوم راحة ({daysInMonth.filter((d) => d.isWorkedRestDay).length})
          </button>
        </div>

        {/* أزرار التحديد والعمليات المجمعة (البند 22) */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* البند 22: زر تسوية على البصمة للأيام المحددة */}
          {selectedDaysWithPunches.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => handleBulkAlignToPunches(selectedDates)}
              style={{
                fontSize: '12px',
                padding: '5px 14px',
                background: '#ecfdf5',
                color: '#065f46',
                border: '1.5px solid #10b981',
                borderRadius: '8px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
              title="تسوية مواعيد كافة الأيام المحددة تلقائياً لتطابق بصماتها الفعلية المسجلة"
            >
              <span>⚡ تسوية ع البصمة للأيام المحددة</span>
              <span style={{ background: '#059669', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '10.5px' }}>
                {selectedDaysWithPunches.length}
              </span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleSelectAll}
            style={{ fontSize: '12px', padding: '5px 12px', border: '1px solid var(--border)' }}
          >
            {selectedDates.length === filteredDays.length ? '✕ إلغاء تحديد الكل' : '✓ تحديد كافة الأيام المعروضة'}
          </button>

          {selectedDates.length > 0 && (
            <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
              تم اختيار {selectedDates.length} يوم
            </span>
          )}
        </div>
      </div>

      {/* ── 3. جدول المطابقة البصرية الذكية (Visual Reconciliation Table) ── */}
      <div className="table-responsive" style={{
        background: 'var(--surface)',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        maxHeight: '420px',
        overflowY: 'auto',
        marginBottom: '20px'
      }}>
        <table className="bylaws-table" style={{ fontSize: '12.5px', borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-muted)' }}>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>اختيار</th>
              <th>اليوم والتاريخ</th>
              <th>الجدول الشهري المعتمد</th>
              <th>البصمة الفعلية (دخول - خروج)</th>
              <th>ساعات العمل</th>
              <th>حالة التأخير والجزاء</th>
              <th style={{ textAlign: 'center' }}>إجراءات تسوية سريعة</th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                  لا توجد أيام تطابق الفلتر المحدد.
                </td>
              </tr>
            ) : (
              filteredDays.map((dayItem) => {
                const isSelected = selectedDates.includes(dayItem.dateStr);
                const hasLate = Boolean(dayItem.activeLate || dayItem.latenessMins > 0);
                const isRest = dayItem.isOff;

                return (
                  <tr
                    key={dayItem.dateStr}
                    style={{
                      background: isSelected
                        ? 'rgba(15, 118, 110, 0.08)'
                        : hasLate
                        ? 'rgba(234, 88, 12, 0.04)'
                        : dayItem.isWorkedRestDay
                        ? 'rgba(124, 58, 237, 0.04)'
                        : 'transparent',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleDate(dayItem.dateStr)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>

                    {/* اليوم والتاريخ */}
                    <td style={{ fontWeight: 800 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{dayItem.dayName}</span>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>({dayItem.dateStr})</span>
                      </div>
                    </td>

                    {/* الجدول الشهري المعتمد */}
                    <td>
                      {isRest ? (
                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                          🛋️ يوم راحة
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {dayItem.scheduledShift?.start || '08:00'} - {dayItem.scheduledShift?.end || '16:00'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            ({dayItem.scheduledShift?.hours || 8} س)
                          </span>
                        </div>
                      )}
                    </td>

                    {/* البصمة الفعلية */}
                    <td>
                      {dayItem.punchIn ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, color: '#047857' }}>
                            {dayItem.punchIn}
                          </span>
                          <span>إلى</span>
                          <span style={{ fontWeight: 800, color: dayItem.punchOut ? '#047857' : '#94a3b8' }}>
                            {dayItem.punchOut || 'جاري الدوام'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>— لم تسجل بصمة</span>
                      )}
                    </td>

                    {/* ساعات العمل */}
                    <td style={{ fontWeight: 700 }}>
                      {dayItem.totalHoursWorked > 0 ? (
                        <span>{fmt(dayItem.totalHoursWorked)} س</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>0 س</span>
                      )}
                    </td>

                    {/* حالة التأخير والجزاء */}
                    <td>
                      {dayItem.activeLate ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, width: 'fit-content' }}>
                            ⚠️ تأخير {dayItem.activeLate.deductionMinutes || dayItem.latenessMins} دقيقة (خصم: {fmt(dayItem.activeLate.penaltyAmount)} ج.م)
                          </span>
                          <span style={{ fontSize: '10px', color: '#dc2626' }}>
                            • سيتم إسقاطه فور اعتماد هذا الطلب
                          </span>
                        </div>
                      ) : dayItem.waivedLate ? (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                          ✅ تم إعفاؤه بموجب تعديل سابق
                        </span>
                      ) : dayItem.latenessMins > 0 ? (
                        <span style={{ color: '#ea580c', fontSize: '11.5px', fontWeight: 700 }}>
                          ⏱️ تأخير {dayItem.latenessMins} دقيقة
                        </span>
                      ) : dayItem.isWorkedRestDay ? (
                        <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                          ⭐ عمل في يوم راحة
                        </span>
                      ) : dayItem.hasPunches ? (
                        <span style={{ color: '#16a34a', fontSize: '11.5px', fontWeight: 700 }}>
                          ✓ حضور منضبط
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>—</span>
                      )}
                    </td>

                    {/* أزرار الإجراء السريع (البند 22: التسوية الذكية للمفرد أو المجمع) */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {dayItem.punchIn && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleAutoAlignToPunch(dayItem)}
                            title={selectedDates.length > 1 && selectedDates.includes(dayItem.dateStr) ? "تسوية كافة الأيام المحددة على أوقات بصماتها" : "تسوية موعد الشيفت ليتطابق مع وقت البصمة وإلغاء التأخير"}
                            style={{ padding: '2px 8px', fontSize: '11px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '6px', fontWeight: 700 }}
                          >
                            {selectedDates.length > 1 && selectedDates.includes(dayItem.dateStr) ? `⚡ تسوية المحددة (${selectedDaysWithPunches.length})` : '⚡ تسوية ع البصمة'}
                          </button>
                        )}
                        {!isRest && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleQuickSetRest(dayItem)}
                            title="تحويل اليوم إلى راحة أسبوعية"
                            style={{ padding: '2px 8px', fontSize: '11px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px' }}
                          >
                            🛋️ راحة
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── 4. نموذج تقديم طلب تعديل الشيفت ── */}
      <div style={{
        background: 'var(--surface-muted)',
        border: '1.5px solid var(--border)',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--primary-dark)', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📝 نموذج طلب التعديل والاعتماد للأيام المختارة</span>
            {selectedDates.length > 0 ? (
              <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px' }}>
                ({selectedDates.length} يوم محدد)
              </span>
            ) : (
              <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                (يرجى اختيار يوم أو أكثر من الجدول أعلاه)
              </span>
            )}
          </h3>

          {/* زر تعميم الإعدادات في حال اختيار عدة أيام */}
          {selectedDates.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleApplyGlobalToAll}
              style={{ fontSize: '12px', padding: '4px 12px', border: '1px dashed var(--primary)', color: 'var(--primary)', fontWeight: 700 }}
              title="تطبيق الخيارات العامة المحددة بالأسفل على كافة الأيام المختارة بالجدول"
            >
              🔄 تطبيق الإعدادات العامة على كافة الأيام المحددة
            </button>
          )}
        </div>

        {/* تنبيه بالجزاءات المسجلة التي ستسقط تلقائياً */}
        {selectedDaysPenalties.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
            border: '1.5px solid #fdba74',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            <div>
              <strong style={{ color: '#c2410c', fontSize: '13.5px', display: 'block' }}>
                تنبيه الإعفاء المالي واللائحي التلقائي:
              </strong>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9a3412' }}>
                يوجد جزاءات تأخير مسجلة في الأيام المختارة لـ ({selectedDaysPenalties.length}) يوم بإجمالي خصم (
                {selectedDaysPenalties.reduce((sum, p) => sum + (parseFloat(p.late.penaltyAmount) || 0), 0)} ج.م).
                عند اعتماد هذا الطلب من قِبل مدير الفرع والإدارة العليا، سيتم <strong>إسقاط الخصم وتصفير دقائق التأخير نهائياً</strong> وتحديث مسير الرواتب والجدول الشهري فوراً.
              </p>
            </div>
          </div>
        )}

        {/* خيارات الإجراء العامة */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
              نوع التعديل المطلوب *
            </label>
            <select
              value={actionType}
              onChange={(e) => {
                const newAct = e.target.value;
                setActionType(newAct);
                // مزامنة التكوين الافتراضي للأيام المختارة
                if (selectedDates.length > 0) {
                  setDayCustomConfigs((prev) => {
                    const next = { ...prev };
                    selectedDates.forEach((dStr) => {
                      next[dStr] = getDefaultConfigForDate(dStr, newAct);
                    });
                    return next;
                  });
                }
              }}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
            >
              <option value="modify_hours">✏️ تعديل مواعيد العمل (وقت الحضور والانصراف)</option>
              <option value="set_rest_day">🛋️ تحويل اليوم / الأيام إلى يوم راحة (Off Day)</option>
              <option value="compensate_worked_rest">⭐ تسوية عمل في يوم راحة (تعيين يوم راحة بديل)</option>
            </select>
          </div>

          {/* في حال تعديل الساعات */}
          {actionType === 'modify_hours' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  وقت بداية العمل الجديد *
                </label>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => {
                    setNewStartTime(e.target.value);
                    selectedDates.forEach((dStr) => {
                      updateDayConfig(dStr, { startTime: e.target.value });
                    });
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  وقت نهاية العمل الجديد *
                </label>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => {
                    setNewEndTime(e.target.value);
                    selectedDates.forEach((dStr) => {
                      updateDayConfig(dStr, { endTime: e.target.value });
                    });
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
                />
              </div>
            </>
          )}

          {/* البند 21: في حال تسوية عمل في يوم راحة واختيار يوم بديل مع تحديد بداية ونهاية الوردية في يوم الراحة */}
          {actionType === 'compensate_worked_rest' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  وقت بداية الوردية في يوم الراحة *
                </label>
                <input
                  type="time"
                  value={workedRestStartTime}
                  onChange={(e) => {
                    setWorkedRestStartTime(e.target.value);
                    selectedDates.forEach((dStr) => {
                      updateDayConfig(dStr, { workedRestStartTime: e.target.value });
                    });
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  وقت نهاية الوردية في يوم الراحة *
                </label>
                <input
                  type="time"
                  value={workedRestEndTime}
                  onChange={(e) => {
                    setWorkedRestEndTime(e.target.value);
                    selectedDates.forEach((dStr) => {
                      updateDayConfig(dStr, { workedRestEndTime: e.target.value });
                    });
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  تاريخ يوم الراحة البديل *
                </label>
                <input
                  type="date"
                  value={replacementRestDate}
                  onChange={(e) => {
                    setReplacementRestDate(e.target.value);
                    selectedDates.forEach((dStr) => {
                      updateDayConfig(dStr, { replacementRestDate: e.target.value });
                    });
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
                />
              </div>
            </>
          )}
        </div>

        {/* سبب التعديل */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
            سبب التعديل والتفاصيل (لتوضيح الموقف لمدير الفرع والإدارة)
          </label>
          <textarea
            rows="2"
            placeholder="مثال: تغطية زميل في نوبة مسائية / تكليف إضافي من مدير الفرع / تسوية وقت البصمة..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)', resize: 'vertical' }}
          />
        </div>

        {/* ── البند 23: المعاينة التفصيلية والتخصيص لكل يوم على حدة قبل الإرسال ── */}
        {selectedDates.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '1.5px solid #0d9488',
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '20px',
            boxShadow: '0 4px 16px rgba(13, 148, 136, 0.08)'
          }}>
            {/* Header المعاينة والتخصيص */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f766e', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔍 معاينة تفصيلية وتخصيص لكل يوم على حدة قبل الإرسال</span>
                  <span style={{ background: '#ccfbf1', color: '#0f766e', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 800 }}>
                    {selectedDates.length} يوم مختار
                  </span>
                </h4>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  يمكنك تخصيص توقيت ونوع التعديل لكل يوم بشكل مستقل تماماً، ومطابقة البصمة أو استبعاد أي يوم قبل الاعتماد.
                </p>
              </div>

              {/* شريط الإجراءات السريعة داخل المعاينة */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleBulkAlignToPunches(selectedDates)}
                  style={{ fontSize: '11.5px', padding: '4px 10px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '6px', fontWeight: 700 }}
                  title="مطابقة كافة الأيام المحددة مع بصماتها المسجلة"
                >
                  ⚡ مطابقة الكل مع البصمة
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleApplyGlobalToAll}
                  style={{ fontSize: '11.5px', padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '6px', fontWeight: 700 }}
                  title="توحيد كافة الأيام بالإعدادات العامة أعلاه"
                >
                  🔄 توحيد بالإعدادات العامة
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleSetAllSelectedAsRest}
                  style={{ fontSize: '11.5px', padding: '4px 10px', background: '#f8fafc', color: '#475569', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 700 }}
                  title="تحويل كافة الأيام المختارة إلى راحة"
                >
                  🛋️ تحويل الكل لراحة
                </button>
              </div>
            </div>

            {/* بطاقة ملخص المؤشرات الإحصائية */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '14px',
              fontSize: '12.5px'
            }}>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>إجمالي الأيام:</span>
                <strong style={{ color: 'var(--text)', fontSize: '14px' }}>📅 {previewSummary.totalDays} يوم</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>ساعات العمل المقررة:</span>
                <strong style={{ color: '#0f766e', fontSize: '14px' }}>⏱️ {previewSummary.totalWorkHours} ساعة</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>أيام العمل vs الراحة:</span>
                <strong style={{ color: 'var(--text)' }}>💼 {previewSummary.workDaysCount} عمل / 🛋️ {previewSummary.restDaysCount} راحة</strong>
              </div>
              {selectedDaysPenalties.length > 0 && (
                <div style={{ background: '#fee2e2', padding: '4px 8px', borderRadius: '6px' }}>
                  <span style={{ color: '#b91c1c', fontSize: '11px', display: 'block', fontWeight: 700 }}>جزاءات سيتم إسقاطها:</span>
                  <strong style={{ color: '#dc2626' }}>🛡️ {selectedDaysPenalties.length} جزاء ({selectedDaysPenalties.reduce((sum, p) => sum + (parseFloat(p.late.penaltyAmount) || 0), 0)} ج.م)</strong>
                </div>
              )}
            </div>

            {/* جدول التخصيص والمعاينة التفاعلي لكل يوم على حدة */}
            <div className="table-responsive" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="bylaws-table" style={{ fontSize: '12px', width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-muted)' }}>
                  <tr>
                    <th style={{ width: '140px' }}>اليوم والتاريخ</th>
                    <th>الجدول الحالي المعتمد</th>
                    <th>البصمة الفعلية</th>
                    <th style={{ minWidth: '150px' }}>نوع التعديل المطلوب</th>
                    <th style={{ minWidth: '220px' }}>المواعيد / الراحة المخصصة لهذا اليوم</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>إجراءات سريعة</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDates.map((dStr) => {
                    const dayItem = daysInMonth.find((d) => d.dateStr === dStr) || {};
                    const cfg = dayCustomConfigs[dStr] || getDefaultConfigForDate(dStr);

                    return (
                      <tr key={dStr} style={{ borderBottom: '1px solid var(--border)' }}>
                        {/* اليوم والتاريخ */}
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--text)' }}>{dayItem.dayName || arabicWeekday(dStr)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{dStr}</div>
                        </td>

                        {/* الجدول الحالي المعتمد */}
                        <td>
                          {dayItem.isOff ? (
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                              🛋️ يوم راحة
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {dayItem.scheduledShift?.start || '08:00'} - {dayItem.scheduledShift?.end || '16:00'}
                            </span>
                          )}
                        </td>

                        {/* البصمة الفعلية */}
                        <td>
                          {dayItem.punchIn ? (
                            <div style={{ color: '#047857', fontWeight: 700 }}>
                              {dayItem.punchIn} ➔ {dayItem.punchOut || 'دوام جارٍ'}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '11px' }}>— لم تسجل</span>
                          )}
                        </td>

                        {/* محدد نوع التعديل لليوم */}
                        <td>
                          <select
                            value={cfg.actionType || 'modify_hours'}
                            onChange={(e) => {
                              const nextAct = e.target.value;
                              updateDayConfig(dStr, {
                                actionType: nextAct,
                                ...(nextAct === 'set_rest_day'
                                  ? { startTime: '', endTime: '', hours: 0 }
                                  : nextAct === 'compensate_worked_rest'
                                  ? {
                                      workedRestStartTime: dayItem.punchIn || workedRestStartTime || '08:00',
                                      workedRestEndTime: dayItem.punchOut || addHoursToTime(dayItem.punchIn || '08:00', 8),
                                      replacementRestDate: replacementRestDate || ''
                                    }
                                  : {
                                      startTime: dayItem.punchIn || newStartTime || '08:00',
                                      endTime: dayItem.punchOut || newEndTime || '16:00'
                                    })
                              });
                            }}
                            style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--surface)' }}
                          >
                            <option value="modify_hours">✏️ تعديل مواعيد العمل</option>
                            <option value="set_rest_day">🛋️ تحويل لراحة (Off)</option>
                            <option value="compensate_worked_rest">⭐ عمل في يوم راحة</option>
                          </select>
                        </td>

                        {/* التوقيتات المخصصة لليوم */}
                        <td>
                          {cfg.actionType === 'modify_hours' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <input
                                type="time"
                                value={cfg.startTime || '08:00'}
                                onChange={(e) => updateDayConfig(dStr, { startTime: e.target.value })}
                                style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11.5px' }}
                              />
                              <span>إلى</span>
                              <input
                                type="time"
                                value={cfg.endTime || '16:00'}
                                onChange={(e) => updateDayConfig(dStr, { endTime: e.target.value })}
                                style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11.5px' }}
                              />
                              <span style={{ fontSize: '11px', color: '#0f766e', fontWeight: 700 }}>
                                ({cfg.hours || calculateHoursBetween(cfg.startTime || '08:00', cfg.endTime || '16:00')} س)
                              </span>
                            </div>
                          ) : cfg.actionType === 'set_rest_day' ? (
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              🛋️ يوم راحة أسبوعية (0 ساعة)
                            </span>
                          ) : (
                            /* compensate_worked_rest */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>وردية الراحة:</span>
                                <input
                                  type="time"
                                  value={cfg.workedRestStartTime || '08:00'}
                                  onChange={(e) => updateDayConfig(dStr, { workedRestStartTime: e.target.value })}
                                  style={{ padding: '2px 5px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px' }}
                                />
                                <span>-</span>
                                <input
                                  type="time"
                                  value={cfg.workedRestEndTime || '16:00'}
                                  onChange={(e) => updateDayConfig(dStr, { workedRestEndTime: e.target.value })}
                                  style={{ padding: '2px 5px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px' }}
                                />
                                <span style={{ fontSize: '10.5px', color: '#7c3aed', fontWeight: 700 }}>
                                  ({cfg.hours || calculateHoursBetween(cfg.workedRestStartTime || '08:00', cfg.workedRestEndTime || '16:00')} س)
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>الراحة البديلة:</span>
                                <input
                                  type="date"
                                  value={cfg.replacementRestDate || ''}
                                  onChange={(e) => updateDayConfig(dStr, { replacementRestDate: e.target.value })}
                                  style={{ padding: '2px 5px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px' }}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        {/* إجراءات سريعة لكل يوم */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            {dayItem.punchIn && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => {
                                  const s = dayItem.punchIn;
                                  const e = dayItem.punchOut || addHoursToTime(dayItem.punchIn, 8);
                                  updateDayConfig(dStr, {
                                    actionType: 'modify_hours',
                                    startTime: s,
                                    endTime: e,
                                    hours: calculateHoursBetween(s, e)
                                  });
                                  showToast?.(`⚡ تم مطابقة ميعاد ${dStr} على البصمة (${s})`);
                                }}
                                title="مطابقة ميعاد هذا اليوم على بصمته الفعلية"
                                style={{ padding: '2px 6px', fontSize: '11px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '4px' }}
                              >
                                ⚡ البصمة
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                updateDayConfig(dStr, {
                                  actionType: 'set_rest_day',
                                  startTime: '',
                                  endTime: '',
                                  hours: 0
                                });
                              }}
                              title="تحويل هذا اليوم لراحة"
                              style={{ padding: '2px 6px', fontSize: '11px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '4px' }}
                            >
                              🛋️
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => handleToggleDate(dStr)}
                              title="استبعاد هذا اليوم من الطلب"
                              style={{ padding: '2px 6px', fontSize: '11px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '4px' }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* زر الإرسال */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
            {selectedDates.length > 0 && (
              <span>📌 سيتم إرسال التعديلات التفصيلية لـ <strong>{selectedDates.length} يوم</strong> لمدير الفرع والإدارة العليا.</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-start"
            disabled={submitting || selectedDates.length === 0}
            onClick={handleSubmitAdjustment}
            style={{
              padding: '9px 24px',
              fontSize: '13.5px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
            }}
          >
            {submitting ? '⏳ جاري إرسال الطلب...' : '🚀 إرسال طلب تعديل الشيفت للاعتماد'}
          </button>
        </div>
      </div>

      {/* ── 5. سجل ومتابعة طلبات التعديل السابقة ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋 سجل طلبات تعديل الشيفت والجدول السابقة</span>
            <span style={{ background: 'var(--surface-muted)', padding: '2px 8px', borderRadius: '99px', fontSize: '11px' }}>
              {adjustmentRequests.length} طلب
            </span>
          </h4>
        </div>

        {adjustmentRequests.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '12px', color: 'var(--muted)', fontSize: '13px' }}>
            لا توجد طلبات تعديل شيفت مرسلة سابقاً.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="bylaws-table" style={{ fontSize: '12.5px' }}>
              <thead>
                <tr>
                  <th>تاريخ الطلب</th>
                  <th>الأيام المطلوبة</th>
                  <th>نوع التعديل والتفاصيل</th>
                  <th>حالة مدير الفرع</th>
                  <th>حالة الإدارة العليا</th>
                  <th>الحالة النهائية</th>
                  {/* البند 24: عمود المعاينة */}
                  <th style={{ textAlign: 'center' }}>معاينة وتفاصيل الطلب</th>
                </tr>
              </thead>
              <tbody>
                {adjustmentRequests.map((req) => {
                  const isApproved = req.status === 'approved' || req.adminApproved;
                  const isRejected = req.status === 'rejected' || req.isRejected;
                  const isPending = !isApproved && !isRejected;

                  return (
                    <tr key={req.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {req.createdAt ? req.createdAt.slice(0, 10) : req.date}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {Array.isArray(req.dates) ? req.dates.join(', ') : req.date}
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        <div>{req.details || req.reason || 'تعديل شيفت'}</div>
                        {req.hasPenaltiesToWaive && (
                          <div style={{ fontSize: '11px', color: isApproved ? '#15803d' : '#ea580c', fontWeight: 700 }}>
                            {isApproved ? '✅ تم إسقاط جزاء التأخير المرتبط بنجاح' : '⚠️ يتضمن إسقاط جزاء تأخير عند الموافقة'}
                          </div>
                        )}
                      </td>
                      <td>
                        {req.managerStatus === 'skipped' || req.isDirectToAdmin ? (
                          <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>— تم التوجيه المباشر للإدارة</span>
                        ) : req.branchApproved ? (
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>✓ تمت الموافقة</span>
                        ) : req.branchRejected ? (
                          <span style={{ color: '#dc2626', fontWeight: 800 }}>✕ مرفوض</span>
                        ) : (
                          <span style={{ color: '#d97706', fontWeight: 700 }}>⏳ قيد المراجعة</span>
                        )}
                      </td>
                      <td>
                        {req.adminApproved ? (
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>✓ معتمد رسمياً</span>
                        ) : req.adminRejected ? (
                          <span style={{ color: '#dc2626', fontWeight: 800 }}>✕ مرفوض</span>
                        ) : (
                          <span style={{ color: '#d97706', fontWeight: 700 }}>⏳ بانتظار الاعتماد</span>
                        )}
                      </td>
                      <td>
                        {isApproved ? (
                          <span className="badge badge-success">🟢 معتمد وتم تحديث الجدول</span>
                        ) : isRejected ? (
                          <span className="badge badge-danger">🔴 مرفوض</span>
                        ) : (
                          <span className="badge badge-warning">🟡 قيد الانتظار</span>
                        )}
                      </td>

                      {/* البند 24: زر معاينة الطلب المرسل */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setPreviewAdjustmentReq(req)}
                          style={{
                            padding: '4px 12px',
                            fontSize: '11.5px',
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1px solid #86efac',
                            borderRadius: '8px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                          title="معاينة تفاصيل الطلب المرسل ومقارنة الجدول ومسار الاعتماد"
                        >
                          👁️ معاينة الطلب
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── البند 24: نافذة معاينة الطلب المرسل المنبثقة عبر Portal ── */}
      {previewAdjustmentReq &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={() => setPreviewAdjustmentReq(null)}
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
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(6px)',
              padding: '14px'
            }}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--surface, #ffffff)',
                borderRadius: '20px',
                width: '100%',
                maxWidth: 'min(1250px, 98vw)',
                height: 'calc(100dvh - 28px)',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
                border: '1.5px solid var(--border)',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {/* Sticky Header */}
              <div style={{
                padding: '18px 24px',
                background: 'linear-gradient(135deg, #0f766e 0%, #064e3b 100%)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                borderBottom: '1px solid rgba(255,255,255,0.15)',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '26px' }}>📋</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, fontFamily: 'Cairo', color: '#fff' }}>
                      معاينة تفاصيل طلب تعديل الشيفت والجدول المعتمد
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '12px', opacity: 0.9 }}>
                      <span>رقم الطلب: <strong>{previewAdjustmentReq.id}</strong></span>
                      <span>•</span>
                      <span>تاريخ الإرسال: <strong>{previewAdjustmentReq.createdAt ? previewAdjustmentReq.createdAt.slice(0, 16).replace('T', ' ') : previewAdjustmentReq.date}</strong></span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* شارة الحالة النهائية */}
                  {previewAdjustmentReq.status === 'approved' || previewAdjustmentReq.adminApproved ? (
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 14px', borderRadius: '30px', fontWeight: 900, fontSize: '12.5px' }}>
                      🟢 معتمد رسمياً وتم تحديث الجدول
                    </span>
                  ) : previewAdjustmentReq.status === 'rejected' || previewAdjustmentReq.isRejected ? (
                    <span style={{ background: '#fee2e2', color: '#dc2626', padding: '6px 14px', borderRadius: '30px', fontWeight: 900, fontSize: '12.5px' }}>
                      🔴 طلب مرفوض
                    </span>
                  ) : (
                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '6px 14px', borderRadius: '30px', fontWeight: 900, fontSize: '12.5px' }}>
                      🟡 قيد المراجعة والاعتماد
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setPreviewAdjustmentReq(null)}
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none',
                      color: '#fff',
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="إغلاق المعاينة"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                background: 'var(--surface-muted, #f8fafc)'
              }}>
                {/* 1. بطاقة معلومات الموظف ومسار الطلب */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '14px',
                  background: 'var(--surface, #ffffff)',
                  padding: '16px 20px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)'
                }}>
                  <div>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>اسم الموظف:</span>
                    <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '14px', marginTop: '2px' }}>
                      👤 {previewAdjustmentReq.employeeName || activeEmp?.name}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>الكود الوظيفي والفرع:</span>
                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '13.5px', marginTop: '2px' }}>
                      🏢 {previewAdjustmentReq.branchName || branchName} ({previewAdjustmentReq.employeeCode || activeEmp?.code || '—'})
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>دورة الشهر المعتمدة:</span>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '13.5px', marginTop: '2px' }}>
                      📅 {previewAdjustmentReq.cycleRangeLabel || previewAdjustmentReq.month || selectedMonth}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>عدد الأيام المتأثرة:</span>
                    <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '14px', marginTop: '2px' }}>
                      📊 {previewAdjustmentReq.daysCount || (Array.isArray(previewAdjustmentReq.dates) ? previewAdjustmentReq.dates.length : 1)} يوم
                    </div>
                  </div>
                </div>

                {/* 2. متتبع دورة ومسار الاعتماد (Approval Workflow Tracker) */}
                <div style={{
                  background: 'var(--surface, #ffffff)',
                  padding: '16px 20px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)'
                }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔄 دورة ومسار اعتماد التعديل:</span>
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {/* المرحلة 1: التقديم */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#166534', fontWeight: 800 }}>1. تقديم الطلب من الموظف</div>
                      <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '4px' }}>
                        ✓ تم الإرسال بتاريخ {previewAdjustmentReq.createdAt?.slice(0, 10) || previewAdjustmentReq.date}
                      </div>
                    </div>

                    {/* المرحلة 2: موافقة مدير الفرع */}
                    <div style={{
                      background: previewAdjustmentReq.managerStatus === 'skipped' || previewAdjustmentReq.isDirectToAdmin
                        ? '#f1f5f9'
                        : previewAdjustmentReq.branchApproved
                        ? '#f0fdf4'
                        : previewAdjustmentReq.branchRejected
                        ? '#fef2f2'
                        : '#fffbeb',
                      border: `1px solid ${
                        previewAdjustmentReq.managerStatus === 'skipped' || previewAdjustmentReq.isDirectToAdmin
                          ? '#cbd5e1'
                          : previewAdjustmentReq.branchApproved
                          ? '#bbf7d0'
                          : previewAdjustmentReq.branchRejected
                          ? '#fecaca'
                          : '#fde68a'
                      }`,
                      borderRadius: '10px',
                      padding: '12px'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)' }}>2. موافقة مدير الفرع</div>
                      <div style={{ fontSize: '11.5px', marginTop: '4px', fontWeight: 700 }}>
                        {previewAdjustmentReq.managerStatus === 'skipped' || previewAdjustmentReq.isDirectToAdmin ? (
                          <span style={{ color: '#475569' }}>— تم التوجيه المباشر للإدارة</span>
                        ) : previewAdjustmentReq.branchApproved ? (
                          <span style={{ color: '#15803d' }}>✓ تمت الموافقة من مدير الفرع</span>
                        ) : previewAdjustmentReq.branchRejected ? (
                          <span style={{ color: '#dc2626' }}>✕ تم الرفض من مدير الفرع</span>
                        ) : (
                          <span style={{ color: '#b45309' }}>⏳ بانتظار مراجعة مدير الفرع</span>
                        )}
                      </div>
                    </div>

                    {/* المرحلة 3: اعتماد الإدارة العليا والـ HR */}
                    <div style={{
                      background: previewAdjustmentReq.adminApproved
                        ? '#f0fdf4'
                        : previewAdjustmentReq.adminRejected
                        ? '#fef2f2'
                        : '#fffbeb',
                      border: `1px solid ${
                        previewAdjustmentReq.adminApproved
                          ? '#bbf7d0'
                          : previewAdjustmentReq.adminRejected
                          ? '#fecaca'
                          : '#fde68a'
                      }`,
                      borderRadius: '10px',
                      padding: '12px'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)' }}>3. اعتماد الإدارة العليا والموارد البشرية</div>
                      <div style={{ fontSize: '11.5px', marginTop: '4px', fontWeight: 700 }}>
                        {previewAdjustmentReq.adminApproved ? (
                          <span style={{ color: '#15803d' }}>✓ تم الاعتماد الرسمي وتطبيق الجدول</span>
                        ) : previewAdjustmentReq.adminRejected ? (
                          <span style={{ color: '#dc2626' }}>✕ مرفوض من الإدارة العليا</span>
                        ) : (
                          <span style={{ color: '#b45309' }}>⏳ بانتظار الاعتماد النهائي</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. تنبيه إسقاط الجزاءات المالية واللائحية */}
                {previewAdjustmentReq.hasPenaltiesToWaive && (
                  <div style={{
                    background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                    border: '1.5px solid #fdba74',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '26px' }}>🛡️</span>
                    <div>
                      <strong style={{ color: '#c2410c', fontSize: '13.5px', display: 'block' }}>
                        إسقاط وإعفاء جزاءات التأخير المرتبطة:
                      </strong>
                      <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#9a3412' }}>
                        {previewAdjustmentReq.status === 'approved' || previewAdjustmentReq.adminApproved
                          ? '✅ تم إسقاط وتصفير كافة جزاءات التأخير والخصومات المالية المرتبطة بهذه الأيام وتحديث مسير الرواتب تلقائياً.'
                          : '⚠️ يتضمن هذا الطلب إسقاطاً وتصفير جزاءات تأخير مسجلة للموظف، وسيتم تطبيق الإعفاء المالي فور اعتماد الإدارة العليا.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. الجدول المقارن المفصل للأيام المعدلة (الجدول المعتمد السابق vs الجديد المطلوب) */}
                <div style={{
                  background: 'var(--surface, #ffffff)',
                  padding: '18px 20px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📊 الجدول المقارن للأيام المعدلة بالطلب:</span>
                    </h4>
                    <span style={{ fontSize: '11.5px', background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>
                      مقارنة دقيقة قبل وبعد التعديل
                    </span>
                  </div>

                  <div className="table-responsive">
                    <table className="bylaws-table" style={{ fontSize: '12.5px', width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-muted)' }}>
                          <th>اليوم والتاريخ</th>
                          <th>نوع التعديل</th>
                          <th style={{ background: '#fef2f2', color: '#b91c1c' }}>⏮️ الجدول السابق (قبل التعديل)</th>
                          <th style={{ background: '#f0fdf4', color: '#15803d' }}>⏭️ الجدول الجديد المطلوب (بعد التعديل)</th>
                          <th>البصمة الفعلية المسجلة</th>
                          <th>ساعات العمل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const newSched = previewAdjustmentReq.newSchedule || previewAdjustmentReq.schedule || {};
                          const oldSched = previewAdjustmentReq.oldSchedule || previewAdjustmentReq.previousSchedule || {};
                          const allDates = Array.from(
                            new Set([
                              ...(Array.isArray(previewAdjustmentReq.dates) ? previewAdjustmentReq.dates : []),
                              ...Object.keys(newSched).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)),
                              ...Object.keys(oldSched).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)),
                              ...(previewAdjustmentReq.date ? [previewAdjustmentReq.date] : [])
                            ])
                          ).sort();

                          if (allDates.length === 0) {
                            return (
                              <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
                                  لا توجد تفاصيل تواريخ مخزنة لهذا الطلب.
                                </td>
                              </tr>
                            );
                          }

                          return allDates.map((dStr) => {
                            const newDay = newSched[dStr] || {};
                            let oldDay = oldSched[dStr];
                            if (!oldDay) {
                              oldDay = getEmployeeDaySchedule(previewAdjustmentReq.employeeId, dStr, state);
                            }

                            // جلب بصمات هذا اليوم من الـ state
                            const dayShifts = (state?.shifts || []).filter(
                              (s) => String(s.employeeId) === String(previewAdjustmentReq.employeeId) && s.date === dStr
                            );
                            const pIn = dayShifts.length > 0 ? (dayShifts[0].timeIn || dayShifts[0].inTime) : null;
                            const pOut = dayShifts.length > 0 ? (dayShifts[dayShifts.length - 1].timeOut || dayShifts[dayShifts.length - 1].outTime) : null;

                            const isNewOff = newDay.type === 'off' || newDay.isOff;
                            const isOldOff = oldDay?.type === 'off' || oldDay?.isOff;

                            const actionLabel =
                              newDay.isReplacementOff
                                ? '🛋️ يوم راحة بديلة'
                                : newDay.isWorkedRestDay
                                ? '⭐ عمل في يوم راحة'
                                : isNewOff
                                ? '🛋️ تحويل لراحة'
                                : '✏️ تعديل مواعيد العمل';

                            return (
                              <tr key={dStr} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ fontWeight: 800 }}>
                                  <div>{arabicWeekday(dStr)}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{dStr}</div>
                                </td>
                                <td>
                                  <span style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: isNewOff ? '#f1f5f9' : '#e0f2fe',
                                    color: isNewOff ? '#475569' : '#0369a1'
                                  }}>
                                    {actionLabel}
                                  </span>
                                </td>
                                {/* السابق */}
                                <td style={{ background: 'rgba(254, 242, 242, 0.4)' }}>
                                  {isOldOff ? (
                                    <span style={{ color: '#475569', fontWeight: 600 }}>🛋️ يوم راحة</span>
                                  ) : oldDay?.start ? (
                                    <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                                      {oldDay.start} - {oldDay.end} ({oldDay.hours || 8} س)
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--muted)' }}>— غير محدد</span>
                                  )}
                                </td>
                                {/* الجديد */}
                                <td style={{ background: 'rgba(240, 253, 244, 0.4)' }}>
                                  {isNewOff ? (
                                    <div>
                                      <span style={{ color: '#047857', fontWeight: 700 }}>🛋️ يوم راحة</span>
                                      {newDay.replacedWorkDate && (
                                        <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                                          (بدل عمل في يوم {newDay.replacedWorkDate})
                                        </div>
                                      )}
                                    </div>
                                  ) : newDay.start ? (
                                    <span style={{ color: '#15803d', fontWeight: 800 }}>
                                      {newDay.start} - {newDay.end} ({newDay.hours || calculateHoursBetween(newDay.start, newDay.end)} س)
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--muted)' }}>—</span>
                                  )}
                                </td>
                                {/* البصمة الفعلية */}
                                <td>
                                  {pIn ? (
                                    <span style={{ color: '#047857', fontWeight: 700 }}>
                                      {pIn} ➔ {pOut || 'جاري'}
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>— لم تسجل</span>
                                  )}
                                </td>
                                {/* الساعات */}
                                <td style={{ fontWeight: 800 }}>
                                  {isNewOff ? '0 س' : `${newDay.hours || calculateHoursBetween(newDay.start, newDay.end) || 8} س`}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 5. بطاقة السبب والتفاصيل وملاحظات الإدارة */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '14px'
                }}>
                  <div style={{
                    background: 'var(--surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '14px',
                    border: '1px solid var(--border)'
                  }}>
                    <h5 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                      📝 مبررات وتفاصيل الطلب من الموظف:
                    </h5>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {previewAdjustmentReq.reason || previewAdjustmentReq.details || 'لا توجد ملاحظات إضافية مسجلة.'}
                    </div>
                  </div>

                  {(previewAdjustmentReq.managerNotes || previewAdjustmentReq.adminNotes || previewAdjustmentReq.rejectionReason) && (
                    <div style={{
                      background: 'var(--surface, #ffffff)',
                      padding: '16px 20px',
                      borderRadius: '14px',
                      border: '1px solid var(--border)'
                    }}>
                      <h5 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                        👔 ملاحظات وقرار الإدارة:
                      </h5>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                        {previewAdjustmentReq.managerNotes && (
                          <div style={{ marginBottom: '6px' }}>
                            <strong>مدير الفرع:</strong> {previewAdjustmentReq.managerNotes}
                          </div>
                        )}
                        {previewAdjustmentReq.adminNotes && (
                          <div style={{ marginBottom: '6px' }}>
                            <strong>الإدارة العليا:</strong> {previewAdjustmentReq.adminNotes}
                          </div>
                        )}
                        {previewAdjustmentReq.rejectionReason && (
                          <div style={{ color: '#dc2626', fontWeight: 700 }}>
                            <strong>سبب الرفض:</strong> {previewAdjustmentReq.rejectionReason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky Footer */}
              <div style={{
                padding: '14px 24px',
                background: 'var(--surface, #ffffff)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
              }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => window.print()}
                  style={{ fontSize: '12.5px', padding: '6px 14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>🖨️</span>
                  <span>طباعة تفاصيل الطلب</span>
                </button>

                <button
                  type="button"
                  className="btn btn-start"
                  onClick={() => setPreviewAdjustmentReq(null)}
                  style={{ fontSize: '13px', padding: '6px 20px', fontWeight: 800 }}
                >
                  ✕ إغلاق النافذة
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

