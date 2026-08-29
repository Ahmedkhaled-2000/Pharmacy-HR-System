import { useState, useEffect, useCallback } from 'react';
import { uid, arabicWeekday, nowTimeStr, parseArabicFloat } from '../utils/formatters';
import { getRealTodayStr } from '../utils/timeEngine';
import { playFingerprintChime } from './useAudio';
import {
  recalculateEmployeeCycleLateness,
  getScheduledShiftForDate,
  calculateLatenessMinutes,
  getEffectiveLatePolicy,
  classifyLateTier,
  getPenaltyForOccurrence,
  computeLatenessFinancialAmount
} from '../utils/latePenaltyEngine';
import {
  notifyAdminOnLateness,
  notifyAdminOnEarlyExit,
  notifyAdminOnOvertime
} from '../utils/gmailService';
import { shouldRouteDirectToAdmin } from '../utils/jobsHelper';
import { apiArchiveDeleteEmployee } from '../utils/archiveApiClient';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';

export function useAttendanceEngine() {
  const { state, setState, saveState, getEmp, getEmpPermission } = useData();
  const {
    currentFilterFn,
    showToast,
    executeWithOwnerGuard,
    setKioskConfirmModal,
    editingShift,
    setEditingShift
  } = useUI();

  const [now, setNow] = useState(Date.now());

  // Clock tick for active elapsed/break timer calculations
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. حساب الوقت المنقضي للوردية الحية
  const getActiveElapsedStr = useCallback((empId) => {
    const active = state.activeShifts?.[empId];
    if (!active) return '—';
    const accumulatedPauseMs = active.accumulatedPauseMs || 0;
    let elapsedMs = 0;
    if (active.isPaused && active.pauseStartEpoch) {
      elapsedMs = active.pauseStartEpoch - active.startEpoch - accumulatedPauseMs;
    } else {
      elapsedMs = now - active.startEpoch - accumulatedPauseMs;
    }
    if (elapsedMs < 0) elapsedMs = 0;
    const h = Math.floor(elapsedMs / 3600000);
    const m = Math.floor((elapsedMs % 3600000) / 60000);
    const s = Math.floor((elapsedMs % 60000) / 1000);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }, [state.activeShifts, now]);

  // 2. حساب وقت الاستراحة (البريك) الحالي
  const getActiveBreakStr = useCallback((empId) => {
    const active = state.activeShifts?.[empId];
    if (!active) return null;
    let totalPauseMs = active.accumulatedPauseMs || 0;
    if (active.isPaused && active.pauseStartEpoch) {
      totalPauseMs += (now - active.pauseStartEpoch);
    }
    if (totalPauseMs <= 0) return null;
    const h = Math.floor(totalPauseMs / 3600000);
    const m = Math.floor((totalPauseMs % 3600000) / 60000);
    const s = Math.floor((totalPauseMs % 60000) / 1000);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }, [state.activeShifts, now]);

  // 3. فحص وتسجيل وقائع التأخير اللائحية
  const checkAndRecordLateness = (empId, dateStr, timeInStr, currentState) => {
    if (!empId || !timeInStr) return currentState;
    const emp = (currentState.employees || []).find((e) => String(e.id) === String(empId));
    if (!emp) return currentState;

    const sched = getScheduledShiftForDate(empId, dateStr, currentState);
    if (!sched || !sched.start) return currentState;

    const diffMinutes = calculateLatenessMinutes(sched.start, timeInStr);
    if (diffMinutes <= 0) return currentState;

    const policy = getEffectiveLatePolicy(currentState);
    if (!policy.enabled) return currentState;

    const tier = classifyLateTier(diffMinutes, policy);

    const { incidents, updatedRequests } = recalculateEmployeeCycleLateness({
      employeeId: empId,
      cycleFilterFn: currentFilterFn,
      state: currentState,
      payrollCycleId: (dateStr || getRealTodayStr()).slice(0, 7)
    });

    const currentIncident = incidents.find((i) => i.date === dateStr) || incidents[incidents.length - 1];
    const occurrenceNumber = currentIncident ? currentIncident.occurrenceNumber : 1;
    const rule = getPenaltyForOccurrence(tier, occurrenceNumber);
    const penaltyAmount = computeLatenessFinancialAmount(rule.deductionMinutes || 0, emp);
    const actionTitle = rule.label || 'سماح';

    const branchObj = (currentState.branches || []).find((b) => b.id === (sched.branchId || emp.branchId));
    const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

    const notifId = `notif_late_${emp.id}_${dateStr}`;
    const alreadyHasNotif = (currentState.notifications || []).some((n) => n.id === notifId);
    let updatedNotifs = currentState.notifications || [];
    if (!alreadyHasNotif) {
      const newNotif = {
        id: notifId,
        type: 'lateness_alert',
        title: `🚨 تنبيه تأخير: ${emp.name} (${emp.jobTitle})`,
        message: `تأخر الموظف ${emp.name} (${emp.jobTitle}) بفرع ${branchName} بمقدار ${diffMinutes} دقيقة عن موعد ورديته (${sched.start}) - [${tier.name} / المرة #${occurrenceNumber}] - الجزاء: ${actionTitle}`,
        date: dateStr,
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: 'all',
        branchId: sched.branchId || emp.branchId,
        requestId: `req_late_inc_${emp.id}_${dateStr}_${timeInStr.replace(':', '')}`,
        empId: emp.id,
        latenessMinutes: diffMinutes,
        suggestedAmount: penaltyAmount,
        suggestedAction: actionTitle
      };
      updatedNotifs = [newNotif, ...updatedNotifs];
    }

    notifyAdminOnLateness({
      state: currentState,
      emp,
      branchName,
      latenessMinutes: diffMinutes,
      scheduledStart: sched.start,
      timeIn: timeInStr,
      dateStr,
      suggestedAction: actionTitle,
      suggestedAmount: penaltyAmount
    }).catch((e) => console.warn('Lateness email alert error:', e));

    return {
      ...currentState,
      lateIncidents: incidents,
      requests: updatedRequests,
      notifications: updatedNotifs
    };
  };

  // 4. فحص وتسجيل الانصراف المبكر
  const checkAndRecordEarlyExit = (empId, dateStr, timeOutStr, currentState) => {
    if (!empId || !timeOutStr) return currentState;
    const emp = (currentState.employees || []).find((e) => String(e.id) === String(empId));
    if (!emp) return currentState;

    const monthKey = (dateStr || getRealTodayStr()).slice(0, 7);
    const approvedRosters = (currentState.rosters || []).filter(
      (r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month) && r.status === 'approved'
    );
    if (approvedRosters.length === 0) return currentState;

    const arDay = arabicWeekday(dateStr);
    let daySchedule = null;
    let targetRoster = null;
    for (const ros of approvedRosters) {
      if (ros.schedule) {
        const sched = ros.schedule[arDay] || Object.entries(ros.schedule).find(([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === arDay.replace(/[\u0625\u0623\u0622]/g, 'ا'))?.[1];
        if (sched && sched.type !== 'off' && sched.end) {
          daySchedule = sched;
          targetRoster = ros;
          break;
        }
      }
    }

    if (!daySchedule || !daySchedule.end) return currentState;

    const [sH, sM] = daySchedule.end.split(':').map(Number);
    const schedEndMinutes = sH * 60 + sM;
    const [outH, outM] = timeOutStr.split(':').map(Number);
    const actualOutMinutes = outH * 60 + outM;

    const earlyMinutes = schedEndMinutes - actualOutMinutes;
    const gracePeriod = currentState.orgSettings?.earlyExitGracePeriodMinutes !== undefined
      ? parseInt(currentState.orgSettings.earlyExitGracePeriodMinutes)
      : 5;

    if (earlyMinutes > gracePeriod) {
      const resetDays = currentState.bylaws?.resetPeriodDays || 30;
      const cutoffDate = new Date(Date.now() - resetDays * 86400000).toISOString().slice(0, 10);
      const pastOccurrences = (currentState.requests || []).filter(
        (r) => String(r.employeeId) === String(empId) && (r.type === 'early_exit' || r.subType === 'early_exit') && (r.date >= cutoffDate || r.createdAt >= cutoffDate)
      ).length;

      const occurrenceNumber = pastOccurrences + 1;
      const penaltyRules = currentState.bylaws?.earlyExitPenalties || [
        { occurrence: 1, action: 'إنذار', deductionFraction: 0 },
        { occurrence: 2, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
        { occurrence: 3, action: 'خصم ½ يوم', deductionFraction: 0.5 },
        { occurrence: 4, action: 'خصم يوم', deductionFraction: 1.0 }
      ];

      const rule = penaltyRules.find((p) => p.occurrence === occurrenceNumber) || penaltyRules[penaltyRules.length - 1];
      const deductionFraction = rule ? rule.deductionFraction : 0.25;
      const actionTitle = rule ? rule.action : 'خصم جزاء انصراف مبكر';

      const salary = parseFloat(emp.salary) || 0;
      const workHours = parseFloat(emp.workHoursPerDay) || 8;
      const workDays = parseFloat(emp.workDaysPerMonth) || 26;
      const dailyRate = workDays > 0 ? (salary * workHours) / workDays : 0;
      const penaltyAmount = Math.round(dailyRate * deductionFraction * 100) / 100;

      const reqId = `req_early_${emp.id}_${dateStr}_${timeOutStr.replace(':', '')}`;
      const alreadyHasReq = (currentState.requests || []).some((r) => r.id === reqId);

      const branchObj = (currentState.branches || []).find((b) => b.id === (targetRoster?.branchId || emp.branchId));
      const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

      let updatedReqs = currentState.requests || [];
      if (!alreadyHasReq) {
        const newReq = {
          id: reqId,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.code,
          jobTitle: emp.jobTitle,
          branchId: targetRoster?.branchId || emp.branchId,
          branchName: branchName,
          type: 'early_exit',
          subType: 'early_exit',
          ruleTitle: `انصراف مبكر (${earlyMinutes} دقيقة مبكراً - الموعد: ${daySchedule.end} / الخروج: ${timeOutStr})`,
          impactType: 'deduction_days',
          impactVal: deductionFraction,
          amount: penaltyAmount,
          scheduledEnd: daySchedule.end,
          actualOut: timeOutStr,
          earlyMinutes: earlyMinutes,
          occurrenceNumber: occurrenceNumber,
          suggestedAction: actionTitle,
          reason: `انصرف الموظف ${emp.name} (${emp.jobTitle}) بفرع ${branchName} قبل موعد انتهاء ورديته المحدد بالجدول (${daySchedule.end}) بمقدار ${earlyMinutes} دقيقة (الخروج: ${timeOutStr}).`,
          details: `خروج مبكر ${earlyMinutes} دقيقة | المرة: رقم ${occurrenceNumber} | الإجراء اللائحي: ${actionTitle} ${penaltyAmount > 0 ? `(خصم ${penaltyAmount} ج.م)` : '(بدون خصم مالي)'}`,
          date: dateStr,
          createdAt: new Date().toISOString(),
          targetApproval: 'admin_only',
          branchApproved: true,
          adminApproved: false,
          status: 'pending',
          source: 'system_early_exit_tracker'
        };
        updatedReqs = [newReq, ...updatedReqs];
      }

      const notifId = `notif_early_${emp.id}_${dateStr}_${timeOutStr.replace(':', '')}`;
      const alreadyHasNotif = (currentState.notifications || []).some((n) => n.id === notifId);
      let updatedNotifs = currentState.notifications || [];
      if (!alreadyHasNotif) {
        const newNotif = {
          id: notifId,
          type: 'early_exit_alert',
          title: `⚠️ تنبيه انصراف مبكر: ${emp.name} (${emp.jobTitle})`,
          message: `انصرف الموظف ${emp.name} بفرع ${branchName} قبل موعد ورديته المحدد بالجدول (${daySchedule.end}) بمقدار ${earlyMinutes} دقيقة (وقت الخروج: ${timeOutStr}).`,
          date: dateStr,
          timestamp: new Date().toISOString(),
          read: false,
          targetRole: 'admin',
          branchId: targetRoster?.branchId || emp.branchId,
          requestId: reqId,
          empId: emp.id,
          earlyMinutes: earlyMinutes,
          suggestedAmount: penaltyAmount
        };
        updatedNotifs = [newNotif, ...updatedNotifs];
      }

      notifyAdminOnEarlyExit({
        state: currentState,
        emp,
        branchName,
        earlyMinutes,
        scheduledEnd: daySchedule.end,
        timeOut: timeOutStr,
        dateStr,
        suggestedAction: actionTitle,
        suggestedAmount: penaltyAmount
      }).catch((e) => console.warn('Early exit email alert error:', e));

      return {
        ...currentState,
        requests: updatedReqs,
        notifications: updatedNotifs
      };
    }

    return currentState;
  };

  // 5. بدء الوردية (Start Shift)
  const startShift = async (empId, source = 'admin', branchId = null) => {
    const emp = getEmp(empId);
    if (emp && (emp.is_active === false || emp.fingerprint_active === false || emp.status === 'تم الاستقالة' || emp.isTerminated || emp.resignationStatus === 'approved')) {
      showToast(`❌ لا يمكن تسجيل الحضور: تم إنهاء خدمة هذا الموظف (استقالة أو إنهاء تعاقد${emp.terminationReason ? `: ${emp.terminationReason}` : ''})`);
      return;
    }
    if (emp && (emp.biometricSuspended || emp.punchDisabled)) {
      showToast(`⛔ لا يمكن تسجيل الحضور: تم إيقاف بصمة الموظف مؤقتاً (${emp.suspensionReason || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق'})`);
      return;
    }
    if (!getEmpPermission(empId, 'canStartEnd') || !getEmpPermission(empId, 'canLivePunch')) {
      showToast('❌ تم تقييد الصلاحيات: لا تمتلك صلاحية لبدء أو إنهاء الوردية عن طريق البصمة الحية');
      return;
    }
    if (state.activeShifts?.[empId]) {
      showToast('⚠️ الموظف لديه وردية عمل نشطة بالفعل');
      return;
    }
    const punchDate = getRealTodayStr();
    const punchTime = nowTimeStr().slice(0, 5);
    const effectiveBranchId = branchId || emp?.branchId || (emp?.branchesDetails && emp.branchesDetails[0]?.branchId) || '';

    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        branchId: effectiveBranchId,
        date: punchDate,
        timeIn: punchTime,
        startEpoch: Date.now(),
        isPaused: false,
        isOnBreak: false,
        breakStartTime: null,
        pauseStartEpoch: null,
        accumulatedPauseMs: 0,
        updatedAt: Date.now()
      }
    };
    let updatedState = { ...state, activeShifts: updatedActive };
    updatedState = checkAndRecordLateness(empId, punchDate, punchTime, updatedState);

    setState(updatedState);
    await saveState(updatedState);

    const bObj = (state.branches || []).find((b) => String(b.id) === String(effectiveBranchId));
    const branchNameStr = bObj ? ` (فرع ${bObj.name})` : '';
    const msg = `تم تسجيل حضور ${emp ? emp.name : ''}${branchNameStr} بنجاح الساعة ${punchTime}`;
    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'checkin',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: `تم تسجيل الدخول بنجاح! أهلاً بك على رأس العمل${branchNameStr}.`,
        timestamp: `${punchDate} · ${punchTime}`
      });
    } else {
      showToast(msg);
    }
  };

  // 6. الإيقاف المؤقت للوردية (Pause Shift)
  const pauseShift = async (empId, source = 'admin') => {
    const active = state.activeShifts?.[empId];
    if (!active || active.isPaused) return;
    const emp = getEmp(empId);
    const nowTime = nowTimeStr().slice(0, 5);
    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        ...active,
        isPaused: true,
        isOnBreak: true,
        breakStartTime: nowTime,
        pauseStartEpoch: Date.now(),
        updatedAt: Date.now()
      }
    };
    const updatedState = { ...state, activeShifts: updatedActive };
    setState(updatedState);
    await saveState(updatedState);

    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'pause',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: 'تم بدء الاستراحة (البريك) بنجاح.',
        timestamp: `${getRealTodayStr()} · ${nowTime}`
      });
    } else {
      showToast(`تم إيقاف وردية ${emp ? emp.name : ''} مؤقتاً (بريك)`);
    }
  };

  // 7. استئناف الوردية (Resume Shift)
  const resumeShift = async (empId, source = 'admin') => {
    const active = state.activeShifts?.[empId];
    if (!active || !active.isPaused) return;
    const emp = getEmp(empId);
    const pauseDuration = Date.now() - (active.pauseStartEpoch || Date.now());
    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        ...active,
        isPaused: false,
        isOnBreak: false,
        breakStartTime: null,
        pauseStartEpoch: null,
        accumulatedPauseMs: (active.accumulatedPauseMs || 0) + pauseDuration,
        updatedAt: Date.now()
      }
    };
    const updatedState = { ...state, activeShifts: updatedActive };
    setState(updatedState);
    await saveState(updatedState);

    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'resume',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: 'تم إنهاء البريك واستئناف العمل بنجاح.',
        timestamp: `${getRealTodayStr()} · ${nowTimeStr().slice(0, 5)}`
      });
    } else {
      showToast(`تم استئناف وردية ${emp ? emp.name : ''}`);
    }
  };

  // 8. إنهاء الوردية (Stop Shift)
  const stopShift = async (empId, source = 'admin') => {
    const active = state.activeShifts?.[empId];
    if (!active) return;
    const emp = getEmp(empId);
    const timeOut = nowTimeStr().slice(0, 5);
    const nowMs = Date.now();
    let currentPauseMs = active.accumulatedPauseMs || 0;
    if (active.isPaused && active.pauseStartEpoch) {
      currentPauseMs += (nowMs - active.pauseStartEpoch);
    }
    const totalElapsedMs = nowMs - (active.startEpoch || (nowMs - 60000));
    const totalElapsedHours = Math.round((totalElapsedMs / 3600000) * 100) / 100;
    const trackedBreak = Math.round((currentPauseMs / 3600000) * 100) / 100;
    const configuredBreak = parseFloat(emp?.breakHours || emp?.defaultBreakHours || emp?.branchesDetails?.[0]?.breakHours) || 0;
    const effectiveBreak = trackedBreak > 0 ? trackedBreak : (totalElapsedHours > configuredBreak ? configuredBreak : 0);
    const breakHours = effectiveBreak;
    const netHours = Math.max(0, Math.round((totalElapsedHours - effectiveBreak) * 100) / 100);

    const bId = active.branchId || emp?.branchId || (emp?.branchesDetails && emp.branchesDetails[0]?.branchId) || '';
    const bObj = (state.branches || []).find((b) => String(b.id) === String(bId));

    const monthKey = (active.date || getRealTodayStr()).slice(0, 7);
    const approvedRosters = (state.rosters || []).filter(
      (r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month) && r.status === 'approved'
    );
    const arDay = arabicWeekday(active.date);
    let daySchedule = null;
    for (const ros of approvedRosters) {
      if (ros.schedule) {
        const sched = ros.schedule[arDay] || Object.entries(ros.schedule).find(([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === arDay.replace(/[\u0625\u0623\u0622]/g, 'ا'))?.[1];
        if (sched && sched.type !== 'off' && sched.start && sched.end) {
          daySchedule = sched;
          break;
        }
      }
    }

    let scheduledHours = parseFloat(emp?.workHoursPerDay) || 8;
    if (daySchedule && daySchedule.start && daySchedule.end) {
      const [sH, sM] = daySchedule.start.split(':').map(Number);
      const [eH, eM] = daySchedule.end.split(':').map(Number);
      let sMinutes = sH * 60 + sM;
      let eMinutes = eH * 60 + eM;
      if (eMinutes < sMinutes) eMinutes += 24 * 60;
      scheduledHours = Math.round(((eMinutes - sMinutes) / 60) * 100) / 100;
    }

    let regularHours = netHours;
    let overtimeHours = 0;
    let overtimeStatus = 'none';

    if (netHours > scheduledHours) {
      overtimeHours = Math.round((netHours - scheduledHours) * 100) / 100;
      regularHours = scheduledHours;
      overtimeStatus = 'pending';
    }

    const shiftId = uid();
    const newShift = {
      id: shiftId,
      employeeId: empId,
      employeeCode: emp?.code || '',
      employeeName: emp?.name || '',
      branchId: bId,
      branchName: bObj?.name || '',
      date: active.date,
      timeIn: active.timeIn,
      timeOut,
      hours: overtimeStatus === 'pending' ? regularHours : netHours,
      actualWorkedHours: netHours,
      scheduledHours,
      regularHours,
      overtimeHours,
      overtimeStatus,
      breakHours,
      note: overtimeHours > 0 ? `ساعات إضافية (+${overtimeHours} س) بانتظار الاعتماد` : 'تسجيل انصراف بلمسة واحدة',
      statusLabel: 'حضور حي',
      createdAt: new Date().toISOString()
    };

    let updatedRequests = state.requests || [];
    let updatedNotifications = state.notifications || [];

    if (overtimeHours > 0) {
      const isDirectAdmin = shouldRouteDirectToAdmin(emp, bId, state);
      const targetApproval = isDirectAdmin ? 'admin_only' : 'both';
      const reqId = `req_ot_${empId}_${active.date}_${shiftId}`;

      const overtimeReq = {
        id: reqId,
        shiftId: shiftId,
        employeeId: empId,
        employeeName: emp?.name || '',
        employeeCode: emp?.code || '',
        jobTitle: emp?.jobTitle || '',
        branchId: bId,
        branchName: bObj?.name || 'الفرع الرئيسي',
        type: 'overtime',
        subType: 'extra_hours',
        hours: overtimeHours,
        regularHours: regularHours,
        totalShiftHours: netHours,
        scheduledStart: daySchedule?.start || '09:00',
        scheduledEnd: daySchedule?.end || '17:00',
        actualIn: active.timeIn,
        actualOut: timeOut,
        date: active.date,
        reason: `عمل الموظف ${emp?.name} عدد ${overtimeHours} ساعات إضافية فوق ساعات الوردية المحددة بالجدول (${scheduledHours} س).`,
        details: `الوردية المقررة: ${scheduledHours} س | الساعات الفعلية: ${netHours} س | الساعات الإضافية المطلوب اعتمادها: +${overtimeHours} س`,
        targetApproval,
        isDirectToAdmin: isDirectAdmin,
        branchNotRequired: isDirectAdmin,
        branchApproved: false,
        adminApproved: false,
        status: 'pending',
        createdAt: new Date().toISOString(),
        source: 'system_overtime_tracker'
      };
      updatedRequests = [overtimeReq, ...updatedRequests];

      const notifId = `notif_ot_${empId}_${active.date}_${shiftId}`;
      const newNotif = {
        id: notifId,
        type: 'overtime_alert',
        title: `⏱️ طلب اعتماد ساعات إضافية: ${emp?.name} (+${overtimeHours} س)`,
        message: isDirectAdmin
          ? `عمل الموظف ${emp?.name} بفرع ${bObj?.name || 'الفرع'} عدد ${overtimeHours} ساعات إضافية وتم توجيه الطلب للإدارة العليا مباشرة.`
          : `عمل الموظف ${emp?.name} بفرع ${bObj?.name || 'الفرع'} عدد ${overtimeHours} ساعات إضافية بعد انتهاء ورديته المقررة (${scheduledHours} س).`,
        date: active.date,
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: isDirectAdmin ? 'admin' : 'all',
        branchId: bId,
        requestId: reqId
      };
      updatedNotifications = [newNotif, ...updatedNotifications];

      notifyAdminOnOvertime({
        state,
        emp,
        branchName: bObj?.name || 'الفرع الرئيسي',
        overtimeHours,
        regularHours,
        totalHours: netHours,
        scheduledStart: daySchedule?.start || '09:00',
        scheduledEnd: daySchedule?.end || '17:00',
        actualIn: active.timeIn,
        actualOut: timeOut,
        dateStr: active.date
      }).catch((e) => console.warn('Overtime email alert error:', e));
    }

    const updatedShifts = [newShift, ...(state.shifts || [])];
    const updatedActive = { ...state.activeShifts };
    delete updatedActive[empId];

    let updatedState = {
      ...state,
      shifts: updatedShifts,
      activeShifts: updatedActive,
      requests: updatedRequests,
      notifications: updatedNotifications
    };

    updatedState = checkAndRecordEarlyExit(empId, active.date, timeOut, updatedState);

    setState(updatedState);
    await saveState(updatedState);

    const msg = `تم تسجيل انصراف ${emp ? emp.name : ''} بنجاح الساعة ${timeOut} (إجمالي الساعات: ${netHours} س)`;
    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'checkout',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: `تم تسجيل الانصراف بنجاح! إجمالي ساعات الشيفت: ${netHours} ساعة.`,
        timestamp: `${getRealTodayStr()} · ${timeOut}`
      });
    } else {
      showToast(msg);
    }
  };

  // 9. إضافة وردية يدوية (Add Manual Shift)
  const addManualShift = async ({ mEmpId, mDate, mIn, mOut, mBreak = '0', mNote = '' }) => {
    if (!mEmpId || !mDate || !mIn || !mOut) {
      showToast('يرجى اختيار الموظف والتاريخ ووقتي الدخول والخروج');
      return;
    }
    if (!getEmpPermission(mEmpId, 'allowManualShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لتسجيل الورديات يدوياً');
      return;
    }

    const [inH, inM] = mIn.split(':').map(Number);
    const [outH, outM] = mOut.split(':').map(Number);
    let start = inH * 60 + inM;
    let end = outH * 60 + outM;
    if (end <= start) end += 24 * 60;
    const parsedBreak = Math.max(0, parseFloat(mBreak) || 0);
    const totalHours = (end - start) / 60;
    const hours = Math.max(0, Math.round((totalHours - parsedBreak) * 100) / 100);
    const emp = getEmp(mEmpId);

    const performAddManual = async () => {
      const newShift = {
        id: uid(),
        employeeId: mEmpId,
        date: mDate,
        timeIn: mIn,
        timeOut: mOut,
        hours,
        breakHours: Math.round(parsedBreak * 100) / 100,
        note: mNote.trim()
      };
      const updatedShifts = [...(state.shifts || []), newShift];
      let updatedState = { ...state, shifts: updatedShifts };
      const recRes = recalculateEmployeeCycleLateness({
        employeeId: mEmpId,
        cycleFilterFn: currentFilterFn,
        state: updatedState,
        payrollCycleId: mDate.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };
      setState(updatedState);
      await saveState(updatedState);
      showToast('تمت إضافة الوردية بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManualShiftEntry',
      actionTitle: `تسجيل وردية يدوية للموظف (${emp?.name || mEmpId})`,
      actionDetails: `تاريخ: ${mDate} · الساعات: ${hours} س`,
      onExecute: performAddManual
    });
  };

  // 10. حفظ تعديل وردية (Save Edit Shift)
  const saveEditShift = async () => {
    if (!editingShift) return;
    if (!getEmpPermission(editingShift.employeeId, 'allowEditShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لتعديل الورديات المحفوظة');
      return;
    }
    const { id, employeeId, date, timeIn, timeOut, breakHours, note } = editingShift;
    if (!date || !timeIn || !timeOut) {
      showToast('يرجى تعبئة الحقول المطلوبة');
      return;
    }

    const [inH, inM] = timeIn.split(':').map(Number);
    const [outH, outM] = timeOut.split(':').map(Number);
    let start = inH * 60 + inM;
    let end = outH * 60 + outM;
    if (end <= start) end += 24 * 60;
    const parsedBreak = Math.max(0, parseFloat(breakHours) || 0);
    const totalHours = (end - start) / 60;
    const netHours = Math.max(0, Math.round((totalHours - parsedBreak) * 100) / 100);

    const performSaveEdit = async () => {
      const updatedShifts = (state.shifts || []).map((s) =>
        s.id === id
          ? {
              ...s,
              date,
              timeIn,
              timeOut,
              hours: netHours,
              breakHours: Math.round(parsedBreak * 100) / 100,
              note: (note || '').trim()
            }
          : s
      );
      let updatedState = { ...state, shifts: updatedShifts };
      const recRes = recalculateEmployeeCycleLateness({
        employeeId,
        cycleFilterFn: currentFilterFn,
        state: updatedState,
        payrollCycleId: date.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };
      setState(updatedState);
      await saveState(updatedState);
      setEditingShift(null);
      showToast('تم تعديل الوردية بنجاح وتحديث وقائع التأخير');
    };

    executeWithOwnerGuard({
      lockKey: 'lockEditPastShifts',
      actionTitle: `تعديل وردية سابقة (${editingShift.employeeName || editingShift.employeeId})`,
      actionDetails: `تاريخ: ${editingShift.date} · الساعات: ${netHours} س`,
      onExecute: performSaveEdit
    });
  };

  // 11. حذف وردية (Delete Shift)
  const deleteShift = async (id) => {
    const shift = (state.shifts || []).find((s) => s.id === id);
    if (shift && !getEmpPermission(shift.employeeId, 'allowEditShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لحذف الورديات المحفوظة');
      return;
    }

    const performDelete = async () => {
      const updatedShifts = (state.shifts || []).filter((s) => s.id !== id);
      const updatedDeletedIds = Array.from(new Set([...(state._deletedIds || []), String(id), `shift_${id}`])).slice(-2000);
      let updatedState = { ...state, shifts: updatedShifts, _deletedIds: updatedDeletedIds };
      if (shift?.employeeId) {
        const recRes = recalculateEmployeeCycleLateness({
          employeeId: shift.employeeId,
          cycleFilterFn: currentFilterFn,
          state: updatedState,
          payrollCycleId: shift.date?.slice(0, 7)
        });
        updatedState = {
          ...updatedState,
          lateIncidents: recRes.incidents,
          requests: recRes.updatedRequests
        };
      }
      setState(updatedState);
      await saveState(updatedState);
      showToast('تم حذف الوردية وتحديث وقائع التأخير');
    };

    executeWithOwnerGuard({
      lockKey: 'lockDeleteShifts',
      actionTitle: `حذف سجل وردية الموظف (${shift?.employeeName || id})`,
      actionDetails: `تاريخ الوردية: ${shift?.date || ''} · الساعات: ${shift?.hours || 0} س`,
      onExecute: performDelete
    });
  };

  // 12. إدارة البصمة والأجهزة
  const handleSaveBiometric = async (empId, credential) => {
    const duplicateEmp = (state.employees || []).find(
      (e) =>
        e.id !== empId &&
        e.biometricCredential &&
        (e.biometricCredential.credentialId === credential.credentialId ||
          (e.biometricCredential.rawId && credential.rawId && e.biometricCredential.rawId === credential.rawId))
    );

    if (duplicateEmp) {
      showToast(`❌ تعذر الحفظ: هذه البصمة مسجلة بالفعل للموظف (${duplicateEmp.name})`);
      return { success: false, duplicate: true };
    }

    const updatedEmps = (state.employees || []).map((e) =>
      e.id === empId ? { ...e, biometricCredential: credential, hasBiometric: true } : e
    );
    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
    showToast('✅ تم تسجيل وتحديث البصمة الحيوية بنجاح');
    return { success: true };
  };

  const handleAdminDeviceStatus = async (empId, deviceId, newStatus) => {
    const updatedEmps = (state.employees || []).map((emp) => {
      if (emp.id === empId) {
        let updatedDevices = emp.devices || [];
        if (newStatus === 'deleted' || newStatus === 'rejected') {
          updatedDevices = updatedDevices.filter((d) => d.deviceId !== deviceId);
        } else {
          updatedDevices = updatedDevices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: newStatus } : d
          );
        }
        return { ...emp, devices: updatedDevices };
      }
      return emp;
    });

    let updatedDeletedIds = state._deletedIds || [];
    if (newStatus === 'deleted' || newStatus === 'rejected') {
      updatedDeletedIds = Array.from(new Set([...updatedDeletedIds, String(deviceId), `dev_${deviceId}`])).slice(-2000);
    }

    const updatedState = { ...state, employees: updatedEmps, _deletedIds: updatedDeletedIds };
    setState(updatedState);
    await saveState(updatedState);
    showToast(newStatus === 'approved' ? '✅ تم اعتماد الجهاز بنجاح' : '🗑 تم حذف/رفض الجهاز');
  };

  const handleKioskDeviceRequest = async (empId, deviceId, deviceInfo, credentialId) => {
    let hasError = false;
    let errorMessage = '';

    const updatedEmps = (state.employees || []).map((emp) => {
      if (emp.id === empId) {
        const existingDevice = (emp.devices || []).find((d) => d.deviceId === deviceId);
        if (existingDevice) return emp;
        
        if (emp.devices && emp.devices.length > 0) {
          hasError = true;
          errorMessage = 'لا يمكن إضافة جهاز جديد. الرجاء مراجعة الإدارة لحذف جهازك القديم أولاً.';
          return emp;
        }
        
        const newDevice = {
          deviceId,
          deviceInfo,
          credentialId,
          status: 'pending',
          requestedAt: getRealTodayStr()
        };
        return { ...emp, devices: [...(emp.devices || []), newDevice] };
      }
      return emp;
    });

    if (hasError) {
      throw new Error(errorMessage);
    }

    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
  };

  // 13. حذف ملف الموظف نهائياً
  const handleDeleteEmp = async (empId) => {
    const emp = getEmp(empId);
    if (!emp) return;
    if ((state.employees || []).length <= 1) {
      showToast('لا يمكن حذف الموظف الوحيد المتبقي بالنظام');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف الموظف "${emp.name}" نهائياً من كافة سجلات النظام؟`)) return;

    const performDelete = async () => {
      const empIdStr = String(empId);
      const empCodeStr = String(emp.code || '');

      const updatedEmps = (state.employees || []).filter((e) => String(e.id) !== empIdStr && String(e.code) !== empCodeStr);
      const updatedActive = { ...state.activeShifts };
      delete updatedActive[empId];
      delete updatedActive[empIdStr];

      const updatedShifts = (state.shifts || []).filter((s) => String(s.employeeId) !== empIdStr);
      const updatedRequests = (state.requests || []).filter((r) => String(r.employeeId) !== empIdStr);
      const updatedResignations = (state.resignationRequests || []).filter((r) => String(r.employeeId) !== empIdStr);
      const updatedLeaves = (state.leaveRequests || []).filter((l) => String(l.employeeId) !== empIdStr);
      const updatedLoans = (state.loans || []).filter((l) => String(l.employeeId) !== empIdStr);
      const updatedAdjs = (state.adjustments || []).filter((a) => String(a.employeeId) !== empIdStr);
      const updatedRosters = (state.rosters || []).filter((r) => String(r.employeeId) !== empIdStr);
      const updatedLateIncidents = (state.lateIncidents || []).filter((i) => String(i.employeeId) !== empIdStr);
      const updatedNotes = (state.employeeNotes || []).filter((n) => String(n.employeeId) !== empIdStr);
      const updatedEvals = (state.evaluations || []).filter((ev) => String(ev.employeeId) !== empIdStr);

      const updatedDeletedIds = Array.from(new Set([
        ...(state._deletedIds || []),
        empIdStr,
        empCodeStr,
        `emp_${empIdStr}`,
        `emp_${empCodeStr}`
      ])).filter(Boolean).slice(-2000);

      try {
        apiArchiveDeleteEmployee(empId).catch(() => {});
      } catch {}

      const updatedState = {
        ...state,
        employees: updatedEmps,
        activeShifts: updatedActive,
        shifts: updatedShifts,
        requests: updatedRequests,
        resignationRequests: updatedResignations,
        leaveRequests: updatedLeaves,
        loans: updatedLoans,
        adjustments: updatedAdjs,
        rosters: updatedRosters,
        lateIncidents: updatedLateIncidents,
        employeeNotes: updatedNotes,
        evaluations: updatedEvals,
        _deletedIds: updatedDeletedIds
      };

      setState(updatedState);
      await saveState(updatedState);
      showToast(`✅ تم حذف ملف الموظف "${emp.name}" وجميع سجلاته نهائياً`);
    };

    executeWithOwnerGuard({
      lockKey: 'lockDeleteEmployee',
      actionTitle: `حذف ملف الموظف (${emp.name}) نهائياً`,
      actionDetails: `كود الموظف: ${emp.code} · الوظيفة: ${emp.jobTitle}`,
      onExecute: performDelete
    });
  };

  return {
    getActiveElapsedStr,
    getActiveBreakStr,
    startShift,
    pauseShift,
    resumeShift,
    stopShift,
    addManualShift,
    saveEditShift,
    deleteShift,
    handleSaveBiometric,
    handleAdminDeviceStatus,
    handleKioskDeviceRequest,
    handleDeleteEmp
  };
}
