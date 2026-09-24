import React, { useState } from 'react';
import { isApprovedPermissionForDate, getEffectiveShiftHours, recalculateEmployeeCycleLateness } from '../../utils/latePenaltyEngine';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { getEmployeeManualPunchesCount, isShiftManualPunch, arabicWeekday } from '../../utils/formatters';
import { useUI } from '../../context/UIContext';
import { isBranchMatch } from '../../utils/branchMatcher';

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
  const activeShift =
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
  const hasActiveShift = Boolean(activeShift && activePeriodFilter(activeShift.date));
  const activeElapsedHours = hasActiveShift
    ? Math.max(0, Math.round(((Date.now() - (activeShift.startEpoch || Date.now())) / 3600000) * 10) / 10)
    : 0;

  const livePunch = hasActiveShift ? {
    id: activeShift.id || `active_${employee.id}_${activeShift.date}`,
    employeeId: employee.id,
    employeeCode: employee.code || '',
    employeeName: employee.name || '',
    branchId: activeShift.branchId || employee.branchId || '',
    date: activeShift.date,
    timeIn: activeShift.timeIn,
    timeOut: 'قيد العمل الآن',
    isLiveActive: true,
    hours: activeElapsedHours,
    netHours: activeElapsedHours,
    workHours: activeElapsedHours,
    breakHours: activeShift.breakHours || 0,
    note: '🟢 وردية نشطة مستمرة حالياً (حضور حي)',
    statusLabel: 'حضور حي',
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

  // إثراء الورديات الحية في القائمة بالساعات المنقضية الحية ووسم "قيد العمل الآن"
  const enrichedMonthPunches = rawMonthPunches.map(p => {
    const isLive = p.isLiveActive || (!p.timeOut || p.timeOut === '—' || p.timeOut === '' || p.timeOut === 'قيد العمل الآن');
    if (isLive) {
      const liveElapsed = p.createdAt ? Math.max(0, Math.round(((Date.now() - new Date(p.createdAt).getTime()) / 3600000) * 10) / 10) : activeElapsedHours;
      return {
        ...p,
        isLiveActive: true,
        timeOut: 'قيد العمل الآن',
        hours: p.hours || liveElapsed,
        netHours: p.netHours || liveElapsed
      };
    }
    return p;
  });

  // فحص ما إذا كان السجل الحي موجوداً بالفعل لتجنب التكرار
  const alreadyHasLivePunch = enrichedMonthPunches.some(p => p.isLiveActive || (activeShift && p.date === activeShift.date && p.timeIn === activeShift.timeIn));
  const monthPunches = (livePunch && !alreadyHasLivePunch) ? [livePunch, ...enrichedMonthPunches] : enrichedMonthPunches;

  // البحث عن أي وردية غير منتهية في قائمة ورديات هذا الشهر
  const unclosedShift = enrichedMonthPunches.find(p => p.isLiveActive || (!p.timeOut || p.timeOut === '' || p.timeOut === '—' || p.timeOut === 'قيد العمل الآن'));
  const showLiveBanner = Boolean(livePunch || unclosedShift);

  // Group or process punches into rows
  const shiftsCount = monthPunches.length;

  // إنهاء الوردية الحية من البنر الرئيسي أو صف محدد في الجدول
  const handleStopShiftForRow = async (targetPunch) => {
    if (isStoppingShift) return;
    setIsStoppingShift(true);
    try {
      const p = targetPunch || unclosedShift || livePunch;
      const todayStr = getRealTodayStr ? getRealTodayStr() : new Date().toISOString().slice(0, 10);
      const isPastDate = p && p.date && p.date < todayStr;

      // 1. إذا كانت الوردية لليوم الحالي ونشطة في activeShifts، نستدعي stopShift الأساسي
      if (!isPastDate && typeof stopShift === 'function' && state.activeShifts && (state.activeShifts[employee.id] || (employee.code && state.activeShifts[String(employee.code)]))) {
        const res = await stopShift(employee.id);
        if (res && res.success) {
          showToast?.('⏹ تم إنهاء وردية الموظف بنجاح وتسجيل وقت الانصراف');
          setIsStoppingShift(false);
          return;
        }
      }

      // 2. معالجة وإنهاء الوردية المفتوحة مباشرة وتحديث shifts
      const nowStr = new Date().toTimeString().slice(0, 5);
      let calculatedTimeOut = nowStr;
      if (isPastDate && p) {
        const schedH = p.scheduledHours || employee.workHoursPerDay || 8;
        const [inH, inM] = String(p.timeIn || '09:00').split(':').map(Number);
        if (!isNaN(inH)) {
          let outTotalMins = (inH * 60 + (inM || 0) + schedH * 60) % (24 * 60);
          const outH = Math.floor(outTotalMins / 60);
          const outM = outTotalMins % 60;
          calculatedTimeOut = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
        } else {
          calculatedTimeOut = '17:00';
        }
      }

      const inTime = p?.timeIn || '09:00';
      const [iH, iM] = String(inTime).split(':').map(Number);
      const [oH, oM] = String(calculatedTimeOut).split(':').map(Number);
      let durMins = (oH * 60 + (oM || 0)) - (iH * 60 + (iM || 0));
      if (durMins <= 0) durMins += 24 * 60;
      const bHours = parseFloat(p?.breakHours) || 0;
      const calcHours = Math.max(0, Math.round(((durMins / 60) - bHours) * 100) / 100);
      const profileHours = parseFloat(employee.workHoursPerDay || employee.workHours || 8);
      const regHours = Math.min(calcHours, profileHours);

      const targetShiftId = p?.id;
      const updatedShifts = (state.shifts || []).map(s => {
        const isMatch = s.id === targetShiftId || (
          p && (String(s.employeeId) === String(p.employeeId) || (employee.code && String(s.employeeCode) === String(employee.code))) &&
          s.date === p.date &&
          (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive)
        );
        if (isMatch) {
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
            note: 'تم إنهاء الوردية واعتماد ساعات العمل من قِبل الإدارة',
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      // تنظيف شامل للموظف من activeShifts
      const updatedActive = { ...(state.activeShifts || {}) };
      delete updatedActive[employee.id];
      delete updatedActive[String(employee.id)];
      if (employee.code) delete updatedActive[String(employee.code)];

      const nextState = {
        ...state,
        shifts: updatedShifts,
        activeShifts: updatedActive
      };

      if (typeof saveState === 'function') {
        await saveState(nextState);
      } else if (typeof setState === 'function') {
        setState(nextState);
      }
      showToast?.('⏹ تم إنهاء وردية الموظف بنجاح وتسجيل وقت الانصراف');
    } catch (err) {
      console.error('Error ending shift from modal:', err);
      showToast?.('❌ حدث خطأ أثناء إنهاء الوردية');
    } finally {
      setIsStoppingShift(false);
    }
  };

  const handleStopLiveShift = () => handleStopShiftForRow(unclosedShift || livePunch);
  const manualCount = getEmployeeManualPunchesCount(employee.id, state, activePeriodFilter);

  const totalBreakHours = monthPunches
    .reduce((acc, p) => acc + (parseFloat(p.breakHours) || 0), 0)
    .toFixed(2);

  const getApprovedOtHours = (p) => {
    if (!p) return 0;
    const isApproved = p.overtimeStatus === 'approved' || (parseFloat(p.overtimeHours) > 0 && (p.adminApproved || p.isAdminCreated));
    return isApproved ? (parseFloat(p.overtimeHours) || 0) : 0;
  };

  const totalRegularHours = monthPunches
    .reduce((acc, p) => acc + getEffectiveShiftHours(p, state), 0);

  const totalApprovedOtHours = monthPunches
    .reduce((acc, p) => acc + getApprovedOtHours(p), 0);

  const totalWorkHours = (totalRegularHours + totalApprovedOtHours).toFixed(2);

  const branches = state?.branches || [];
  const getBranchName = (bId) => {
    if (!bId) return '';
    const b = branches.find(br => isBranchMatch(bId, br));
    return b ? b.name : `فرع ${bId}`;
  };

  const isMultiBranch = Boolean(employee.branchesDetails && employee.branchesDetails.length > 1);
  const employeeBranchName = isMultiBranch
    ? employee.branchesDetails.map(bd => bd.branchName || getBranchName(bd.branchId)).filter(Boolean).join(' + ')
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

    const performSave = async () => {
      const inParts = (editTimeIn || '09:00').split(':').map(Number);
      const outParts = (editTimeOut || '17:00').split(':').map(Number);
      let diff = ((outParts[0] || 0) + (outParts[1] || 0) / 60) - ((inParts[0] || 0) + (inParts[1] || 0) / 60);
      if (diff <= 0) diff += 24;
      const bH = parseFloat(editBreakHours) || 0;
      const calculatedHours = Math.max(0, Math.round((diff - bH) * 100) / 100);

      const daySched = getEmployeeDaySchedule(employee.id, editDate, state);
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

      const editedBObj = (state.branches || []).find(b => isBranchMatch(editBranchId, b));
      const canonicalBranchId = editedBObj ? editedBObj.id : (editBranchId || employee.branchId || '');
      const canonicalBranchName = editedBObj ? editedBObj.name : getBranchName(canonicalBranchId);

      let updatedShifts;
      if (isAddingNewPunch) {
        const newShift = {
          id: `punch_manual_${Date.now()}`,
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: canonicalBranchId,
          branchName: canonicalBranchName,
          date: editDate,
          timeIn: editTimeIn,
          timeOut: editTimeOut,
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
          note: (editNotes.trim() ? editNotes.trim() + ' | ' : '') + 'تسجيل بصمة يدوية بواسطة الإدارة العليا' + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
          createdAt: new Date().toISOString()
        };
        updatedShifts = [newShift, ...(state.shifts || [])];
      } else {
        updatedShifts = (state.shifts || []).map((s) => {
          if (String(s.id) === String(editingPunch.id)) {
            return {
              ...s,
              date: editDate,
              timeIn: editTimeIn,
              timeOut: editTimeOut,
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
              note: (editNotes.trim() ? editNotes.trim() + ' | ' : '') + (s.note || 'تم تعديل البصمة بواسطة الإدارة العليا') + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
              notes: (editNotes.trim() ? editNotes.trim() + ' | ' : '') + (s.notes || 'تم تعديل البصمة بواسطة الإدارة العليا') + (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
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
      }

      // إذا كانت البصمة المعدلة هي الوردية الحية النشطة، نقوم بتحديث فرعها وتوقيتها في activeShifts أيضاً
      let updatedActiveShifts = { ...(state.activeShifts || {}) };
      const curActive = updatedActiveShifts[employee.id] || updatedActiveShifts[String(employee.id)] || (employee.code && updatedActiveShifts[employee.code]);
      if (curActive && (editingPunch.isLiveActive || String(curActive.shiftId) === String(editingPunch.id) || curActive.date === editingPunch.date)) {
        const updatedActiveItem = {
          ...curActive,
          branchId: canonicalBranchId,
          branchName: canonicalBranchName,
          timeIn: editTimeIn || curActive.timeIn,
          date: editDate || curActive.date
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
        payrollCycleId: editDate.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      const wasAdding = isAddingNewPunch;
      setEditingPunch(null);
      setIsAddingNewPunch(false);

      if (wasAdding) {
        showToast?.(`✅ تم تسجيل البصمة اليدوية بنجاح: ${regularHours} س أساسي${overtimeHours > 0 ? ` + ${overtimeHours} س إضافي معتمد تلقائياً` : ''}`);
        return;
      }

      const lateInc = (recRes.incidents || []).find((inc) => (String(inc.shiftId) === String(editingPunch.id) || inc.date === editDate) && inc.lateMinutes > 0);
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
        lockKey: 'lockEditPastShifts',
        actionTitle: `تعديل بصمة الموظف (${employee.name})`,
        actionDetails: `تاريخ البصمة: ${editDate} | التوقيت الجديد: من ${editTimeIn} إلى ${editTimeOut}`,
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

      const inParts = inTime.split(':').map(Number);
      const outParts = outTime.split(':').map(Number);
      let diffMinutes = ((outParts[0] || 0) * 60 + (outParts[1] || 0)) - ((inParts[0] || 0) * 60 + (inParts[1] || 0));
      if (diffMinutes <= 0) diffMinutes += 24 * 60;
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                  {livePunch ? 'الموظف على رأس العمل حالياً (حضور حي نشط)' : 'توجد وردية مفتوحة للموظف بانتظار إنهاء الانصراف'}
                </strong>
                <div style={{ fontSize: '13px', color: '#047857', marginTop: '3px' }}>
                  تاريخ الوردية: <strong>{(livePunch || unclosedShift)?.date}</strong> | وقت الدخول: <strong>{(livePunch || unclosedShift)?.timeIn}</strong>
                  {livePunch ? ` | المنقضي حتى الآن: ${activeElapsedHours} ساعة` : ' | الحالة: غير منتهية (قيد العمل)'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#10b981', color: '#fff', padding: '5px 14px', borderRadius: '20px', fontWeight: '800', fontSize: '12px' }}>
                {(livePunch || unclosedShift)?.source === 'kiosk' ? 'بصمة كشك الفرع' : 'تسجيل حي'}
              </span>
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

        {isMultiBranch ? (
          <div>
            {employee.branchesDetails.map((bd) => {
              const bId = bd.branchId;
              const bObj = (state.branches || []).find((b) => isBranchMatch(bId, b));
              const bName = bObj ? bObj.name : (bd.branchName || `فرع ${bId}`);
              const targetB = bObj || { id: bId, branchId: bId, name: bd.branchName };
              const bPunches = monthPunches.filter((p) => {
                const isMatch = isBranchMatch(p.branchId, targetB) || (p.branchName && bObj?.name && p.branchName.trim() === bObj.name.trim());
                if (isMatch) return true;
                if (!p.branchId && !p.branchName) {
                  return isBranchMatch(employee.branchesDetails[0]?.branchId, targetB);
                }
                return false;
              });

              const bShiftsCount = bPunches.length;
              const bTotalBreak = bPunches.reduce((acc, p) => acc + (parseFloat(p.breakHours) || 0), 0).toFixed(2);
              const bTotalWork = bPunches.reduce((acc, p) => acc + (getEffectiveShiftHours(p, state) || 0) + getApprovedOtHours(p), 0).toFixed(2);
              const bRate = getBranchRate(bId);
              const bTotalEarned = bPunches.reduce((acc, p) => {
                const isRej = p.isRejectedPhoto || p.status === 'rejected_photo' || (typeof p.statusLabel === 'string' && p.statusLabel.includes('رفض الصورة'));
                if (isRej) return acc;
                return acc + ((getEffectiveShiftHours(p, state) || 0) + getApprovedOtHours(p)) * bRate;
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
                          <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                          <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                          <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                          <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                          <th style={{ textAlign: 'center' }}>المبلغ المستحق</th>
                          <th>الملاحظات</th>
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
                            const regH = getEffectiveShiftHours(p, state);
                            const otH = getApprovedOtHours(p);
                            const totalH = (regH + otH).toFixed(2);
                            const breakH = p.breakHours ? parseFloat(p.breakHours).toFixed(2) : null;
                            const shiftEarned = isRejectedPhoto ? '0.00' : ((regH + otH) * bRate).toFixed(2);

                            const perm = isApprovedPermissionForDate(employee?.id, dateStr, state);
                            const hasPerm = p.hasApprovedPermission || !!perm;
                            const permHours = p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);

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
                                </td>
                                <td style={{ fontWeight: '600' }}>{dayName}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '12.5px', display: 'inline-block' }}>
                                    {p.timeIn || p.checkIn || p.inTime || '09:00'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {p.isLiveActive ? (
                                    <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '11.5px', display: 'inline-block' }}>
                                      🟢 قيد العمل الآن
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
                                <td style={{ textAlign: 'center', color: isRejectedPhoto ? '#dc2626' : '#0d9488', fontWeight: '800' }}>
                                  {isRejectedPhoto ? (
                                    <div>
                                      <span style={{ textDecoration: 'line-through', opacity: 0.65 }}>0.00 ساعة</span>
                                      <div style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: 800 }}>مستبعدة من الأجور</div>
                                    </div>
                                  ) : (
                                    <>
                                      {totalH} ساعة
                                      {otH > 0 && (
                                        <div style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700, marginTop: '2px' }}>
                                          (أساسي: {regH.toFixed(2)} س + إضافي: {otH.toFixed(2)} س)
                                        </div>
                                      )}
                                      {hasPerm && permHours > 0 && (
                                        <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, marginTop: '2px' }}>
                                          (فعلي: {(Math.max(0, regH - permHours)).toFixed(2)} س + إذن: {permHours} س)
                                        </div>
                                      )}
                                      {p.overtimeStatus === 'approved' && parseFloat(p.overtimeHours) > 0 && (
                                        <div style={{ marginTop: '3px' }}>
                                          <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, display: 'inline-block' }}>
                                            ✅ إضافي معتمد (+{parseFloat(p.overtimeHours).toFixed(2)} س)
                                          </span>
                                        </div>
                                      )}
                                      {p.overtimeStatus === 'rejected' && (
                                        <div style={{ marginTop: '3px' }}>
                                          <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, display: 'inline-block' }}>
                                            ❌ إضافي مرفوض {parseFloat(p.overtimeHours || p.rejectedOvertimeHours || 0) > 0 ? `(${parseFloat(p.overtimeHours || p.rejectedOvertimeHours).toFixed(2)} س)` : ''}
                                          </span>
                                        </div>
                                      )}
                                      {p.overtimeStatus === 'pending' && parseFloat(p.overtimeHours) > 0 && (
                                        <div style={{ marginTop: '3px' }}>
                                          <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, display: 'inline-block' }}>
                                            ⏳ إضافي قيد الاعتماد (+{parseFloat(p.overtimeHours).toFixed(2)} س)
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center', color: isRejectedPhoto ? '#dc2626' : '#16a34a', fontWeight: '700' }}>
                                  {isRejectedPhoto ? (
                                    <div>
                                      <span style={{ fontWeight: 800 }}>0.00 ج.م</span>
                                      <div style={{ fontSize: '10px', color: '#dc2626' }}>ملغاة من الراتب</div>
                                    </div>
                                  ) : (
                                    `${shiftEarned} ج.م`
                                  )}
                                </td>
                                <td style={{ fontSize: '12px', color: isRejectedPhoto ? '#b91c1c' : (hasPerm ? '#047857' : 'var(--muted)') }}>
                                  {isRejectedPhoto ? (
                                    <div>
                                      <strong style={{ color: '#dc2626', display: 'block' }}>⚠️ تم رفض البصمة بسبب رفض الصورة</strong>
                                      <span style={{ fontSize: '11px', color: '#7f1d1d' }}>{p.notes || p.note || 'مستبعدة تماماً من احتساب الأجور'}</span>
                                    </div>
                                  ) : hasPerm ? (
                                    <div>
                                      <span style={{ fontWeight: 700 }}>⏰ معدلة باحتساب ساعات الإذن المعتمد ({perm?.startTime || '—'} إلى {perm?.endTime || '—'})</span>
                                      {p.notes && !p.notes.includes('⏰ تم تعديل البصمة') && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.notes}</div>}
                                    </div>
                                  ) : p.overtimeStatus === 'rejected' ? (
                                    <div>
                                      <strong style={{ color: '#dc2626', display: 'block' }}>❌ تم رفض الساعات الإضافية من قِبل الإدارة</strong>
                                      <span style={{ fontSize: '11px', color: '#7f1d1d' }}>{p.notes || p.note || `احتساب ساعات الوردية الأساسية فقط (${p.regularHours || p.hours} س)`}</span>
                                    </div>
                                  ) : p.overtimeStatus === 'approved' && parseFloat(p.overtimeHours) > 0 ? (
                                    <div>
                                      <strong style={{ color: '#16a34a', display: 'block' }}>✅ ساعات إضافية معتمدة (+{parseFloat(p.overtimeHours).toFixed(2)} س)</strong>
                                      <span style={{ fontSize: '11px', color: '#047857' }}>{p.notes || p.note || 'تمت إضافة الساعات لصافي الاستحقاق'}</span>
                                    </div>
                                  ) : (
                                    p.notes || p.note || p.statusLabel || 'تسجيل بصمة عادية'
                                  )}
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
                            <td colSpan="3" style={{ textAlign: 'right', padding: '12px 16px' }}>الإجمالي ({bShiftsCount} وردية)</td>
                            <td></td>
                            <td></td>
                            <td style={{ textAlign: 'center' }}><span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '8px' }}>{bTotalBreak} س</span></td>
                            <td style={{ textAlign: 'center', color: '#0d9488' }}>{bTotalWork} ساعة</td>
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
                  <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                  <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                  <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                  <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                  <th style={{ textAlign: 'center' }}>المبلغ المستحق</th>
                  <th>الملاحظات</th>
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
                    const regH = getEffectiveShiftHours(p, state);
                    const otH = getApprovedOtHours(p);
                    const totalH = (regH + otH).toFixed(2);
                    const breakH = p.breakHours ? parseFloat(p.breakHours).toFixed(2) : null;
                    const shiftRate = getBranchRate(p.branchId || employee.branchId);
                    const shiftEarned = isRejectedPhoto ? '0.00' : ((regH + otH) * shiftRate).toFixed(2);

                    const perm = isApprovedPermissionForDate(employee?.id, dateStr, state);
                    const hasPerm = p.hasApprovedPermission || !!perm;
                    const permHours = p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);

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
                        </td>
                        <td style={{ fontWeight: '600' }}>{dayName}</td>
                        
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
                            <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '11.5px', display: 'inline-block' }}>
                              🟢 قيد العمل الآن
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
                        <td style={{ textAlign: 'center', color: isRejectedPhoto ? '#dc2626' : '#0d9488', fontWeight: '800' }}>
                          {isRejectedPhoto ? (
                            <div>
                              <span style={{ textDecoration: 'line-through', opacity: 0.65 }}>0.00 ساعة</span>
                              <div style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: 800 }}>مستبعدة من الأجور</div>
                            </div>
                          ) : (
                            <>
                              {totalH} ساعة
                              {otH > 0 && (
                                <div style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700, marginTop: '2px' }}>
                                  (أساسي: {regH.toFixed(2)} س + إضافي: {otH.toFixed(2)} س)
                                </div>
                              )}
                              {hasPerm && permHours > 0 && (
                                <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, marginTop: '2px' }}>
                                  (فعلي: {(Math.max(0, regH - permHours)).toFixed(2)} س + إذن: {permHours} س)
                                </div>
                              )}
                              {p.overtimeStatus === 'approved' && parseFloat(p.overtimeHours) > 0 && (
                                <div style={{ marginTop: '3px' }}>
                                  <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, display: 'inline-block' }}>
                                    ✅ إضافي معتمد (+{parseFloat(p.overtimeHours).toFixed(2)} س)
                                  </span>
                                </div>
                              )}
                              {p.overtimeStatus === 'rejected' && (
                                <div style={{ marginTop: '3px' }}>
                                  <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, display: 'inline-block' }}>
                                    ❌ إضافي مرفوض {parseFloat(p.overtimeHours || p.rejectedOvertimeHours || 0) > 0 ? `(${parseFloat(p.overtimeHours || p.rejectedOvertimeHours).toFixed(2)} س)` : ''}
                                  </span>
                                </div>
                              )}
                              {p.overtimeStatus === 'pending' && parseFloat(p.overtimeHours) > 0 && (
                                <div style={{ marginTop: '3px' }}>
                                  <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, display: 'inline-block' }}>
                                    ⏳ إضافي قيد الاعتماد (+{parseFloat(p.overtimeHours).toFixed(2)} س)
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </td>

                        {/* Amount Due */}
                        <td style={{ textAlign: 'center', color: isRejectedPhoto ? '#dc2626' : '#16a34a', fontWeight: '700' }}>
                          {isRejectedPhoto ? (
                            <div>
                              <span style={{ fontWeight: 800 }}>0.00 ج.م</span>
                              <div style={{ fontSize: '10px', color: '#dc2626' }}>ملغاة من الراتب</div>
                            </div>
                          ) : (
                            `${shiftEarned} ج.م`
                          )}
                        </td>

                        {/* Notes */}
                        <td style={{ fontSize: '12px', color: isRejectedPhoto ? '#b91c1c' : (hasPerm ? '#047857' : 'var(--muted)') }}>
                          {isRejectedPhoto ? (
                            <div>
                              <strong style={{ color: '#dc2626', display: 'block' }}>⚠️ تم رفض البصمة بسبب رفض الصورة</strong>
                              <span style={{ fontSize: '11px', color: '#7f1d1d' }}>{p.notes || p.note || 'مستبعدة تماماً من احتساب الأجور'}</span>
                            </div>
                          ) : hasPerm ? (
                            <div>
                              <span style={{ fontWeight: 700 }}>⏰ معدلة باحتساب ساعات الإذن المعتمد ({perm?.startTime || '—'} إلى {perm?.endTime || '—'})</span>
                              {p.notes && !p.notes.includes('⏰ تم تعديل البصمة') && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.notes}</div>}
                            </div>
                          ) : p.overtimeStatus === 'rejected' ? (
                            <div>
                              <strong style={{ color: '#dc2626', display: 'block' }}>❌ تم رفض الساعات الإضافية من قِبل الإدارة</strong>
                              <span style={{ fontSize: '11px', color: '#7f1d1d' }}>{p.notes || p.note || `احتساب ساعات الوردية الأساسية فقط (${p.regularHours || p.hours} س)`}</span>
                            </div>
                          ) : p.overtimeStatus === 'approved' && parseFloat(p.overtimeHours) > 0 ? (
                            <div>
                              <strong style={{ color: '#16a34a', display: 'block' }}>✅ ساعات إضافية معتمدة (+{parseFloat(p.overtimeHours).toFixed(2)} س)</strong>
                              <span style={{ fontSize: '11px', color: '#047857' }}>{p.notes || p.note || 'تمت إضافة الساعات لصافي الاستحقاق'}</span>
                            </div>
                          ) : (
                            p.notes || p.note || p.statusLabel || 'تسجيل بصمة عادية'
                          )}
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
                    <td colSpan="3" style={{ textAlign: 'right', padding: '12px 16px' }}>
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
                      {totalWorkHours} ساعة
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
                <button className="btn btn-ghost" onClick={() => setEditingPunch(null)}>✕</button>
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
                  </div>

                  {isMultiBranch && (
                    <div className="field">
                      <label>الفرع</label>
                      <select
                        value={editBranchId}
                        onChange={(e) => setEditBranchId(e.target.value)}
                      >
                        {employee.branchesDetails.map((bd) => {
                          const br = (state.branches || []).find((b) => isBranchMatch(bd.branchId, b));
                          return (
                            <option key={bd.branchId} value={bd.branchId}>
                              {br?.name || bd.branchName || `فرع ${bd.branchId}`}
                            </option>
                          );
                        })}
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
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingPunch(null)}>
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
      </div>
    </div>
  );
}
