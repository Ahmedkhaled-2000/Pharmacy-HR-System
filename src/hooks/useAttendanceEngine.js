import { useState, useEffect, useCallback } from 'react';
import { uid, arabicWeekday, nowTimeStr, parseArabicFloat } from '../utils/formatters';
import { getRealTodayStr } from '../utils/timeEngine';
import { getEmployeeDaySchedule } from '../utils/rosterEngine';
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
  notifyAdminOnEarlyDepartureBeforeClosing,
  notifyAdminOnOvertime,
  notifyOnPenaltyApplied,
  getAuthoritativeGmailConfig
} from '../utils/gmailService';
import { shouldRouteDirectToAdmin, isBranchWithoutManager } from '../utils/jobsHelper';
import { apiArchiveDeleteEmployee } from '../utils/archiveApiClient';
import { hardDeleteEntityFast } from '../utils/offlineSync';
import { isBranchMatch } from '../utils/branchMatcher';
import { apiRecordPunch } from '../utils/apiClient';
import { enqueueKioskPunch } from '../utils/kioskOutbox';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';

export function useAttendanceEngine() {
  const { state, setState, saveState, getEmp, getEmpPermission } = useData();
  const {
    currentFilterFn,
    showToast,
    showConfirm,
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

    if (rule.action !== 'grace' && (penaltyAmount > 0 || (rule.deductionMinutes && rule.deductionMinutes > 0))) {
      notifyOnPenaltyApplied({
        state: currentState,
        emp,
        branchName,
        source: 'late_penalty',
        penalty: {
          actionTitle: actionTitle,
          amount: penaltyAmount,
          deductionMinutes: rule.deductionMinutes || 0,
          date: dateStr,
          reason: `تأخير بمقدار ${diffMinutes} دقيقة عن موعد الوردية المجدولة (${sched.start}) - [${tier.name} / المرة #${occurrenceNumber}]`
        }
      }).catch((e) => console.warn('Late penalty email error:', e));
    }

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
    let schedEndMinutes = sH * 60 + sM;
    const [startH, startM] = (daySchedule.start || '00:00').split(':').map(Number);
    const schedStartMinutes = startH * 60 + startM;

    const [outH, outM] = timeOutStr.split(':').map(Number);
    let actualOutMinutes = outH * 60 + outM;

    // معالجة الورديات الممتدة عبر منتصف الليل
    if (schedEndMinutes < schedStartMinutes) {
      schedEndMinutes += 24 * 60;
      if (actualOutMinutes < schedStartMinutes) {
        actualOutMinutes += 24 * 60;
      }
    } else {
      // وردية نهارية عادية، إذا كان وقت الخروج في الصباح الباكر بعد منتصف الليل (عمل إضافي ممتد)
      if (actualOutMinutes < schedStartMinutes && actualOutMinutes < 360) {
        actualOutMinutes += 24 * 60;
      }
    }

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

  // 4.1 فحص وتسجيل إنذار الانصراف المبكر قبل موعد إغلاق الفرع
  const checkAndRecordEarlyDepartureBeforeClosing = (empId, dateStr, timeOutStr, branchId, currentState) => {
    if (!empId || !timeOutStr) return currentState;
    const emp = (currentState.employees || []).find((e) => String(e.id) === String(empId));
    if (!emp) return currentState;

    const targetBranchId = branchId || emp.branchId || (emp.branchesDetails && emp.branchesDetails[0]?.branchId);
    const branch = (currentState.branches || []).find((b) => String(b.id) === String(targetBranchId));
    if (!branch || !branch.closingTime) return currentState;

    // شرط أساسي: إرسال تنبيه الانصراف المبكر قبل الإغلاق فقط إذا كان الموظف هو آخر من تبقى بالفرع
    // إذا كان هناك أي زميل آخر لديه وردية مفتوحة أو متواجد حالياً بالفرع، فلا يتم إرسال التنبيه
    const otherActiveInBranch = Object.entries(currentState.activeShifts || {}).some(([otherEmpId, activeData]) => {
      if (String(otherEmpId) === String(empId)) return false;
      if (!activeData) return false;
      return isBranchMatch(activeData.branchId, branch) || String(activeData.branchId) === String(targetBranchId);
    });

    const otherOpenShiftInBranch = (currentState.shifts || []).some((s) => {
      if (!s) return false;
      if (String(s.employeeId) === String(empId)) return false;
      if (!s.isOpen && s.timeOut) return false;
      return isBranchMatch(s.branchId, branch) || String(s.branchId) === String(targetBranchId);
    });

    if (otherActiveInBranch || otherOpenShiftInBranch) {
      return currentState;
    }

    try {
      const [cH, cM] = branch.closingTime.split(':').map(Number);
      const [oH, oM] = timeOutStr.split(':').map(Number);
      let closingTotal = (cH || 0) * 60 + (cM || 0);
      let outTotal = (oH || 0) * 60 + (oM || 0);
      if (closingTotal < 720 && outTotal >= 720) {
        closingTotal += 24 * 60;
      }
      const minutesBeforeClosing = closingTotal - outTotal;
      if (minutesBeforeClosing <= 0) return currentState;

      const authGmail = getAuthoritativeGmailConfig(currentState);
      const branchGrace = (branch.earlyDepartureBeforeClosingGraceMinutes !== undefined && branch.earlyDepartureBeforeClosingGraceMinutes !== '' && !isNaN(parseInt(branch.earlyDepartureBeforeClosingGraceMinutes, 10)))
        ? parseInt(branch.earlyDepartureBeforeClosingGraceMinutes, 10)
        : (authGmail?.earlyDepartureBeforeClosingGraceMinutes !== undefined && authGmail?.earlyDepartureBeforeClosingGraceMinutes !== '' && !isNaN(parseInt(authGmail?.earlyDepartureBeforeClosingGraceMinutes, 10))
          ? parseInt(authGmail.earlyDepartureBeforeClosingGraceMinutes, 10)
          : 0);

      if (minutesBeforeClosing > branchGrace) {
        const notifId = `notif_early_closing_${emp.id}_${dateStr}_${timeOutStr.replace(':', '')}`;
        const alreadyHasNotif = (currentState.notifications || []).some((n) => n.id === notifId);
        let updatedNotifs = currentState.notifications || [];
        if (!alreadyHasNotif) {
          const newNotif = {
            id: notifId,
            type: 'early_departure_before_closing_alert',
            title: `🚨 انصراف مبكر قبل إغلاق الفرع: ${emp.name} (${emp.jobTitle || 'موظف'})`,
            message: `سجل الموظف ${emp.name} بصمة انصراف بفرع ${branch.name} الساعة ${timeOutStr} قبل موعد إغلاق الفرع (${branch.closingTime}) بـ ${minutesBeforeClosing} دقيقة (المهلة المسموح بها: ${branchGrace} دقيقة).`,
            date: dateStr,
            timestamp: new Date().toISOString(),
            read: false,
            targetRole: 'admin',
            branchId: targetBranchId,
            empId: emp.id,
            minutesBeforeClosing,
            allowedGraceMinutes: branchGrace
          };
          updatedNotifs = [newNotif, ...updatedNotifs];
        }

        notifyAdminOnEarlyDepartureBeforeClosing({
          state: currentState,
          emp,
          branch,
          closingTime: branch.closingTime,
          punchTime: timeOutStr,
          minutesBeforeClosing,
          allowedGraceMinutes: branchGrace,
          dateStr
        }).catch((e) => console.warn('Early departure before closing email warning:', e));

        return {
          ...currentState,
          notifications: updatedNotifs
        };
      }
    } catch (err) {
      console.warn('Error in checkAndRecordEarlyDepartureBeforeClosing:', err);
    }

    return currentState;
  };

  // 5. بدء الوردية (Start Shift)
  const startShift = async (empId, source = 'admin', branchId = null) => {
    const emp = getEmp(empId);
    if (!emp) {
      const reason = '❌ الموظف غير مسجل بالنظام';
      showToast(reason);
      return { success: false, reason };
    }
    if (emp.is_active === false || emp.fingerprint_active === false || emp.status === 'تم الاستقالة' || emp.isTerminated || emp.resignationStatus === 'approved') {
      const reason = `❌ لا يمكن تسجيل الحضور: تم إنهاء خدمة هذا الموظف (استقالة أو إنهاء تعاقد${emp.terminationReason ? `: ${emp.terminationReason}` : ''})`;
      showToast(reason);
      return { success: false, reason };
    }
    if (emp.biometricSuspended || emp.punchDisabled || emp.accountSuspended || emp.status === 'معلق') {
      const reason = `⛔ لا يمكن تسجيل الحضور: تم إيقاف بصمة وحساب الموظف مؤقتاً (${emp.suspensionReason || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق'})`;
      showToast(reason);
      return { success: false, reason };
    }
    if (source !== 'kiosk') {
      if (!getEmpPermission(empId, 'canStartEnd') || !getEmpPermission(empId, 'canLivePunch')) {
        const reason = '❌ تم تقييد الصلاحيات: لا تمتلك صلاحية لبدء أو إنهاء الوردية عن طريق البصمة الحية';
        showToast(reason);
        return { success: false, reason };
      }
    }

    const punchDate = getRealTodayStr();
    const punchTime = nowTimeStr().slice(0, 5);
    const rawBranchId = branchId || emp?.branchId || (emp?.branchesDetails && emp.branchesDetails[0]?.branchId) || '';
    const bObj = (state.branches || []).find((b) => isBranchMatch(rawBranchId, b));
    const effectiveBranchId = bObj ? bObj.id : rawBranchId;
    const branchName = bObj ? bObj.name : '';

    // دالة قياسية دقيقة للتحقق مما إذا كانت الوردية مفتوحة حقاً وبدون انصراف
    const isShiftOpenForPunch = (s) => {
      if (!s || s.status === 'cancelled' || s.isCancelled) return false;
      const hasCheckout = Boolean(
        s.timeOut &&
        s.timeOut !== '—' &&
        s.timeOut !== '-' &&
        s.timeOut !== '' &&
        s.timeOut !== 'قيد العمل الآن' &&
        s.timeOut !== 'قيد العمل'
      );
      if (hasCheckout) return false; // الوردية مكتملة ولها انصراف
      return Boolean(s.timeIn && s.timeIn !== '—' && s.timeIn !== '');
    };

    // فحص ومعالجة الوردية النشطة السابقة إن وجدت
    let currentActiveShifts = { ...state.activeShifts };
    let currentShifts = [...(state.shifts || [])];
    let existingActive = currentActiveShifts[empId] || currentActiveShifts[String(empId)];

    // فحص إضافي في currentShifts إن وجد سجل مفتوح للموظف لليوم
    const existingOpenShiftInRecords = currentShifts.find(s =>
      (String(s.employeeId) === String(empId) || (emp.code && String(s.employeeCode) === String(emp.code))) &&
      s.date === punchDate &&
      isShiftOpenForPunch(s)
    );

    // إذا كانت الوردية النشطة بالذاكرة مسجل لها انصراف فعلي في السجلات، يتم تطهيرها فوراً
    if (existingActive) {
      const isAlreadyClosedInShifts = currentShifts.some(s =>
        (s.id === existingActive.shiftId || (String(s.employeeId) === String(empId) && s.date === existingActive.date && s.timeIn === existingActive.timeIn)) &&
        !isShiftOpenForPunch(s)
      );
      if (isAlreadyClosedInShifts) {
        delete currentActiveShifts[empId];
        delete currentActiveShifts[String(empId)];
        existingActive = null;
      }
    }

    if (existingActive || existingOpenShiftInRecords) {
      const activeDate = existingActive?.date || existingOpenShiftInRecords?.date;
      const activeTimeIn = existingActive?.timeIn || existingOpenShiftInRecords?.timeIn || '09:00';
      const activeStartEpoch = existingActive?.startEpoch || (existingOpenShiftInRecords?.startEpoch) || (activeDate && activeTimeIn ? new Date(`${activeDate}T${activeTimeIn.slice(0, 5)}:00`).getTime() : 0);
      const isVeryOldAbandoned = activeStartEpoch ? (Date.now() - activeStartEpoch > 30 * 3600 * 1000) : false;

      if (activeDate && activeDate !== punchDate && isVeryOldAbandoned) {
        // إغلاق الورديات المتروكة المهجورة لأكثر من 30 ساعة فقط
        console.warn(`[startShift] Auto-closing very old abandoned shift from ${activeDate} for emp ${empId}`);
        const staleShiftId = existingOpenShiftInRecords?.id || uid();
        const bObjOld = (state.branches || []).find((b) => String(b.id) === String(existingActive?.branchId || existingOpenShiftInRecords?.branchId || effectiveBranchId));
        const autoClosedShift = {
          ...(existingOpenShiftInRecords || {}),
          id: staleShiftId,
          employeeId: empId,
          employeeCode: emp.code || '',
          employeeName: emp.name || '',
          branchId: existingActive?.branchId || existingOpenShiftInRecords?.branchId || effectiveBranchId,
          branchName: bObjOld?.name || '',
          date: activeDate,
          timeIn: existingActive?.timeIn || existingOpenShiftInRecords?.timeIn || '09:00',
          timeOut: '17:00',
          hours: parseFloat(emp.workHoursPerDay) || 8,
          actualWorkedHours: parseFloat(emp.workHoursPerDay) || 8,
          scheduledHours: parseFloat(emp.workHoursPerDay) || 8,
          regularHours: parseFloat(emp.workHoursPerDay) || 8,
          overtimeHours: 0,
          overtimeStatus: 'none',
          breakHours: 0,
          note: 'إغلاق تلقائي لوردية قديمة مهجورة لم يتم تسجيل انصرافها',
          statusLabel: 'حضور حي',
          isLiveActive: false,
          status: 'completed',
          createdAt: existingOpenShiftInRecords?.createdAt || new Date().toISOString()
        };
        if (existingOpenShiftInRecords) {
          currentShifts = currentShifts.map(s => s.id === existingOpenShiftInRecords.id ? autoClosedShift : s);
        } else {
          currentShifts = [autoClosedShift, ...currentShifts];
        }
        delete currentActiveShifts[empId];
        delete currentActiveShifts[String(empId)];
      } else {
        const reason = `⚠️ الموظف لديه وردية عمل نشطة بالفعل (بدأت ${activeDate === punchDate ? 'اليوم' : activeDate} الساعة ${activeTimeIn}). يرجى تسجيل الانصراف أولاً.`;
        showToast(reason);
        return { success: false, reason };
      }
    }

    const newShiftId = 'shift_' + empId + '_' + Date.now();

    const shiftData = {
      shiftId: newShiftId,
      branchId: effectiveBranchId,
      branchName: branchName,
      date: punchDate,
      timeIn: punchTime,
      startEpoch: Date.now(),
      isPaused: false,
      isOnBreak: false,
      breakStartTime: null,
      pauseStartEpoch: null,
      accumulatedPauseMs: 0,
      updatedAt: Date.now()
    };

    const openShiftRecord = {
      id: newShiftId,
      employeeId: empId,
      employeeCode: emp.code || '',
      employeeName: emp.name || '',
      branchId: effectiveBranchId,
      branchName: branchName,
      date: punchDate,
      timeIn: punchTime,
      timeOut: '',
      hours: 0,
      actualWorkedHours: 0,
      scheduledHours: parseFloat(emp.workHoursPerDay) || 8,
      regularHours: 0,
      overtimeHours: 0,
      overtimeStatus: 'none',
      breakHours: 0,
      source: source || 'kiosk',
      isLiveActive: true,
      status: 'active',
      statusLabel: 'حضور حي (قيد العمل)',
      note: `تسجيل حضور حي في تمام الساعة ${punchTime} - قيد العمل الآن`,
      createdAt: new Date().toISOString()
    };

    currentShifts = [
      openShiftRecord,
      ...currentShifts.filter(s => !(String(s.employeeId) === String(empId) && s.date === punchDate && isShiftOpenForPunch(s)))
    ];

    const updatedActive = {
      ...currentActiveShifts,
      [empId]: shiftData,
      [String(empId)]: shiftData
    };
    const cleanedEndedIds = (state._endedShiftEmpIds || []).filter(id => {
      const idStr = String(id);
      return idStr !== String(empId) && (!emp || (idStr !== String(emp.id) && idStr !== String(emp.code)));
    });
    let updatedState = { ...state, activeShifts: updatedActive, shifts: currentShifts, _endedShiftEmpIds: cleanedEndedIds };

    try {
      updatedState = checkAndRecordLateness(empId, punchDate, punchTime, updatedState);
    } catch (lateErr) {
      console.error('[startShift] Error in checkAndRecordLateness (safely ignored):', lateErr);
    }

    setState(updatedState);

    const branchNameStr = bObj ? ` (فرع ${bObj.name})` : '';
    const msg = `تم تسجيل حضور ${emp ? emp.name : ''}${branchNameStr} بنجاح الساعة ${punchTime}`;
    
    if (source === 'kiosk') {
      try {
        playFingerprintChime('success');
      } catch {}
      setKioskConfirmModal({
        open: true,
        type: 'checkin',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: `تم تسجيل الدخول بنجاح! أهلاً بك على رأس العمل${branchNameStr}.`,
        timestamp: `${punchDate} · ${punchTime}`,
        branchName: bObj?.name || ''
      });
    } else {
      showToast(msg);
    }

    // ── حفظ فوري في صندوق إرسال الكشك (Kiosk Local Outbox) مع محاولة الإرسال الذري ──
    if (source === 'kiosk') {
      enqueueKioskPunch({
        employeeId: emp?.id || empId,
        employeeCode: emp?.code || '',
        employeeName: emp?.name || '',
        branchId: effectiveBranchId,
        branchName: bObj?.name || '',
        actionType: 'check_in',
        time: punchTime,
        date: punchDate,
        shiftId: openShiftRecord.id,
        shiftData: shiftData,
        shiftRecord: openShiftRecord,
        source: 'kiosk_biometric'
      }).catch(err => {
        console.warn('[startShift] Kiosk outbox enqueue warning:', err);
      });
    } else {
      apiRecordPunch({
        employeeId: emp?.id || empId,
        branchId: effectiveBranchId,
        actionType: 'check_in',
        time: punchTime,
        date: punchDate,
        shiftId: openShiftRecord.id,
        shiftData: shiftData,
        shiftRecord: openShiftRecord,
        requestId: `checkin_${empId}_${Date.now()}`
      }).catch(err => {
        console.warn('[startShift] Atomic punch call warning:', err.message);
      });
    }

    if (saveState) {
      saveState(updatedState).catch(err => console.error('[startShift] Background save error:', err));
    }

    return { success: true, punchTime, punchDate, branchName: bObj?.name || '' };
  };

  // 6. الإيقاف المؤقت للوردية (Pause Shift)
  const pauseShift = async (empId, source = 'admin') => {
    const active = state.activeShifts?.[empId] || state.activeShifts?.[String(empId)];
    if (!active || active.isPaused) {
      const reason = !active ? 'لا توجد وردية نشطة لهذا الموظف' : 'الوردية في فترة بريك بالفعل';
      showToast(reason);
      return { success: false, reason };
    }
    const emp = getEmp(empId);
    const nowTime = nowTimeStr().slice(0, 5);
    const pausedData = {
      ...active,
      isPaused: true,
      isOnBreak: true,
      breakStartTime: nowTime,
      pauseStartEpoch: Date.now(),
      updatedAt: Date.now()
    };
    const updatedActive = {
      ...state.activeShifts,
      [empId]: pausedData,
      [String(empId)]: pausedData
    };

    let currentShifts = [...(state.shifts || [])];
    const openIdx = currentShifts.findIndex(s =>
      (active.shiftId && s.id === active.shiftId) ||
      (String(s.employeeId) === String(empId) && s.date === active.date && (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive))
    );
    if (openIdx >= 0) {
      currentShifts[openIdx] = {
        ...currentShifts[openIdx],
        isPaused: true,
        isOnBreak: true,
        breakStartTime: nowTime,
        pauseStartEpoch: Date.now(),
        updatedAt: new Date().toISOString()
      };
    }

    const updatedState = { ...state, activeShifts: updatedActive, shifts: currentShifts };
    setState(updatedState);

    if (source === 'kiosk') {
      try {
        playFingerprintChime('success');
      } catch {}
      setKioskConfirmModal({
        open: true,
        type: 'pause',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: 'تم بدء الاستراحة (البريك) بنجاح.',
        timestamp: `${getRealTodayStr()} · ${nowTime}`,
        branchName: state.branches?.find(b => String(b.id) === String(active?.branchId))?.name || ''
      });

      enqueueKioskPunch({
        employeeId: emp?.id || empId,
        employeeCode: emp?.code || '',
        employeeName: emp?.name || '',
        branchId: active?.branchId || '',
        branchName: state.branches?.find(b => String(b.id) === String(active?.branchId))?.name || '',
        actionType: 'break_start',
        time: nowTime,
        date: active?.date || getRealTodayStr(),
        shiftId: active?.shiftId || null,
        shiftData: pausedData,
        shiftRecord: openIdx >= 0 ? currentShifts[openIdx] : null,
        source: 'kiosk_biometric'
      }).catch(err => {
        console.warn('[pauseShift] Kiosk outbox enqueue warning:', err);
      });
    } else {
      showToast(`تم إيقاف وردية ${emp ? emp.name : ''} مؤقتاً (بريك)`);
    }

    if (saveState) {
      saveState(updatedState, { entityType: 'activeShifts' }).catch(err => console.error('[pauseShift] Background save error:', err));
    }

    return { success: true, nowTime };
  };

  // 7. استئناف الوردية (Resume Shift)
  const resumeShift = async (empId, source = 'admin') => {
    const active = state.activeShifts?.[empId] || state.activeShifts?.[String(empId)];
    if (!active || !active.isPaused) {
      const reason = !active ? 'لا توجد وردية نشطة لهذا الموظف' : 'الموظف ليس في فترة بريك';
      showToast(reason);
      return { success: false, reason };
    }
    const emp = getEmp(empId);
    const pauseDuration = Date.now() - (active.pauseStartEpoch || Date.now());
    const resumedData = {
      ...active,
      isPaused: false,
      isOnBreak: false,
      breakStartTime: null,
      pauseStartEpoch: null,
      accumulatedPauseMs: (active.accumulatedPauseMs || 0) + pauseDuration,
      updatedAt: Date.now()
    };
    const updatedActive = {
      ...state.activeShifts,
      [empId]: resumedData,
      [String(empId)]: resumedData
    };

    let currentShifts = [...(state.shifts || [])];
    const openIdx = currentShifts.findIndex(s =>
      (active.shiftId && s.id === active.shiftId) ||
      (String(s.employeeId) === String(empId) && s.date === active.date && (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive))
    );
    if (openIdx >= 0) {
      currentShifts[openIdx] = {
        ...currentShifts[openIdx],
        isPaused: false,
        isOnBreak: false,
        breakStartTime: null,
        pauseStartEpoch: null,
        accumulatedPauseMs: (currentShifts[openIdx].accumulatedPauseMs || 0) + pauseDuration,
        updatedAt: new Date().toISOString()
      };
    }

    const updatedState = { ...state, activeShifts: updatedActive, shifts: currentShifts };
    setState(updatedState);

    if (source === 'kiosk') {
      try {
        playFingerprintChime('success');
      } catch {}
      setKioskConfirmModal({
        open: true,
        type: 'resume',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: 'تم إنهاء البريك واستئناف العمل بنجاح.',
        timestamp: `${getRealTodayStr()} · ${nowTimeStr().slice(0, 5)}`,
        branchName: state.branches?.find(b => String(b.id) === String(active?.branchId))?.name || ''
      });

      enqueueKioskPunch({
        employeeId: emp?.id || empId,
        employeeCode: emp?.code || '',
        employeeName: emp?.name || '',
        branchId: active?.branchId || '',
        branchName: state.branches?.find(b => String(b.id) === String(active?.branchId))?.name || '',
        actionType: 'break_end',
        time: nowTimeStr().slice(0, 5),
        date: active?.date || getRealTodayStr(),
        shiftId: active?.shiftId || null,
        shiftData: resumedData,
        shiftRecord: openIdx >= 0 ? currentShifts[openIdx] : null,
        source: 'kiosk_biometric'
      }).catch(err => {
        console.warn('[resumeShift] Kiosk outbox enqueue warning:', err);
      });
    } else {
      showToast(`تم استئناف وردية ${emp ? emp.name : ''}`);
    }

    if (saveState) {
      saveState(updatedState, { entityType: 'activeShifts' }).catch(err => console.error('[resumeShift] Background save error:', err));
    }

    return { success: true };
  };

  // 8. إنهاء الوردية (Stop Shift)
  const stopShift = async (empId, source = 'admin') => {
    const emp = getEmp(empId);
    const empActualId = emp?.id ? String(emp.id) : String(empId || '');
    const empCode = emp?.code ? String(emp.code) : '';

    const isEmpShiftMatch = (s) => {
      if (!s) return false;
      const sEmpId = String(s.employeeId || '');
      const sEmpCode = String(s.employeeCode || '');
      return (
        sEmpId === String(empId) ||
        (empActualId && sEmpId === empActualId) ||
        (empCode && sEmpId === empCode) ||
        (empCode && sEmpCode === empCode) ||
        (empActualId && sEmpCode === empActualId)
      );
    };

    const isShiftOpen = (s) => (
      !s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.timeOut === '-' || s.timeOut === 'قيد العمل الآن' || s.isLiveActive
    );

    // البحث الدقيق والشامل عن الوردية النشطة في activeShifts بكافة مفاتيح الموظف
    let active =
      state.activeShifts?.[empId] ||
      state.activeShifts?.[String(empId)] ||
      (empActualId && state.activeShifts?.[empActualId]) ||
      (empCode && state.activeShifts?.[empCode]) ||
      Object.values(state.activeShifts || {}).find(s =>
        s && (
          String(s.employeeId) === String(empId) ||
          (empActualId && String(s.employeeId) === empActualId) ||
          (empCode && String(s.employeeId) === empCode) ||
          (empCode && String(s.employeeCode) === empCode) ||
          (empActualId && String(s.employeeCode) === empActualId)
        )
      );

    // إذا لم تكن الوردية موجودة في activeShifts (بسبب إعادة تحميل الصفحة أو مزامنة)، نبحث في shifts عن أحدث وردية مفتوحة
    if (!active) {
      const todayStr = getRealTodayStr();
      const openCandidates = (state.shifts || [])
        .filter(s =>
          isEmpShiftMatch(s) &&
          isShiftOpen(s) &&
          s.status !== 'cancelled' && !s.isCancelled
        )
        .sort((a, b) => {
          const aEpoch = a.startEpoch || (a.createdAt ? new Date(a.createdAt).getTime() : (a.date && a.timeIn ? new Date(`${a.date}T${a.timeIn.slice(0, 5)}:00`).getTime() : 0));
          const bEpoch = b.startEpoch || (b.createdAt ? new Date(b.createdAt).getTime() : (b.date && b.timeIn ? new Date(`${b.date}T${b.timeIn.slice(0, 5)}:00`).getTime() : 0));
          return bEpoch - aEpoch; // الأحدث أولاً لتجنب التقاط ورديات متروكة قديمة
        });

      const openShift = openCandidates[0];
      if (openShift) {
        active = {
          shiftId: openShift.id,
          branchId: openShift.branchId || emp?.branchId || '',
          branchName: openShift.branchName || '',
          date: openShift.date || todayStr,
          timeIn: openShift.timeIn || '09:00',
          startEpoch: openShift.startEpoch || (openShift.createdAt ? new Date(openShift.createdAt).getTime() : Date.now() - 3600000),
          accumulatedPauseMs: openShift.accumulatedPauseMs || 0
        };
      }
    }

    if (!active) {
      const reason = '⚠️ لا توجد وردية نشطة مفتوحة لهذا الموظف لتسجيل الانصراف';
      showToast(reason);
      return { success: false, reason };
    }

    const nowMs = Date.now();
    const elapsedSinceStartMs = active.startEpoch ? (nowMs - Number(active.startEpoch)) : 999999;
    // حماية منع الانصراف السريع التلقائي (Anti-Bounce Guard): منع تسجيل انصراف في أقل من دقيقة واحدة
    if (source === 'kiosk' && elapsedSinceStartMs < 60000 && active.date === getRealTodayStr()) {
      const reason = '⚠️ تم تسجيل الدخول منذ لحظات قليلة (أقل من دقيقة). يرجى الانتظار لتفادي تسجيل انصراف خاطئ.';
      showToast(reason);
      return { success: false, reason };
    }

    const timeOut = nowTimeStr().slice(0, 5);
    let currentPauseMs = active.accumulatedPauseMs || 0;
    if (active.isPaused && active.pauseStartEpoch) {
      currentPauseMs += (nowMs - active.pauseStartEpoch);
    }
    let totalElapsedHours = 0;
    if (active.startEpoch && nowMs >= active.startEpoch) {
      totalElapsedHours = Math.round(((nowMs - active.startEpoch) / 3600000) * 100) / 100;
    } else {
      const [inH, inM] = String(active.timeIn || '09:00').split(':').map(Number);
      const [outH, outM] = String(timeOut).split(':').map(Number);
      let diffMinutes = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
      if (diffMinutes <= 0 || (active.date && active.date !== getRealTodayStr())) {
        diffMinutes += 24 * 60;
      }
      totalElapsedHours = Math.round((diffMinutes / 60) * 100) / 100;
    }
    const trackedBreak = Math.round((currentPauseMs / 3600000) * 100) / 100;
    const configuredBreak = parseFloat(emp?.breakHours || emp?.defaultBreakHours || emp?.branchesDetails?.[0]?.breakHours) || 0;
    const effectiveBreak = trackedBreak > 0 ? trackedBreak : (totalElapsedHours > configuredBreak ? configuredBreak : 0);
    const breakHours = effectiveBreak;
    const netHours = Math.max(0, Math.round((totalElapsedHours - effectiveBreak) * 100) / 100);

    const rawBId = active.branchId || emp?.branchId || (emp?.branchesDetails && emp.branchesDetails[0]?.branchId) || '';
    const bObj = (state.branches || []).find((b) => isBranchMatch(rawBId, b));
    const bId = bObj ? bObj.id : rawBId;

    const daySchedule = getEmployeeDaySchedule(empId, active.date, state, bId);
    const profileHours = parseFloat(emp?.workHoursPerDay || emp?.workHours || (emp?.branchesDetails && emp.branchesDetails[0]?.workHoursPerDay)) || 8;
    let scheduledHours = profileHours;

    let hasValidScheduledShift = false;
    let schedStartMins = 0;
    let schedEndMins = 0;

    if (daySchedule && daySchedule.start && daySchedule.end && daySchedule.type !== 'off' && !emp?.noMonthlySchedule) {
      const [sH, sM] = daySchedule.start.split(':').map(Number);
      const [eH, eM] = daySchedule.end.split(':').map(Number);
      if (!isNaN(sH) && !isNaN(eH)) {
        hasValidScheduledShift = true;
        schedStartMins = sH * 60 + (sM || 0);
        schedEndMins = eH * 60 + (eM || 0);
        if (schedEndMins <= schedStartMins) schedEndMins += 24 * 60;
        scheduledHours = Math.round(((schedEndMins - schedStartMins) / 60) * 100) / 100;
      }
    }

    // حساب دقائق الحضور والانصراف الفعلي
    const [inH, inM] = String(active.timeIn || '09:00').split(':').map(Number);
    const [outH, outM] = String(timeOut).split(':').map(Number);
    let actInMins = inH * 60 + (inM || 0);
    let actOutMins = outH * 60 + (outM || 0);
    if (actOutMins <= actInMins) actOutMins += 24 * 60;

    // حساب الفروقات بدقة بالغة بالدقائق مقارنة بالجدول
    let earlyArrivalMinutes = 0;
    let lateArrivalMinutes = 0;
    let lateDepartureMinutes = 0;

    if (hasValidScheduledShift) {
      if (actInMins < schedStartMins) {
        earlyArrivalMinutes = schedStartMins - actInMins;
      } else if (actInMins > schedStartMins) {
        lateArrivalMinutes = actInMins - schedStartMins;
      }

      if (actOutMins > schedEndMins) {
        lateDepartureMinutes = actOutMins - schedEndMins;
      }
    }

    let regularHours = netHours;
    let overtimeHours = 0;
    let overtimeStatus = 'none';
    let deviationStatus = 'none';
    let isScheduleDeviation = false;
    let earlyOtHours = 0;
    let lateOtHours = 0;

    // ── الحالة 1: عدم الالتزام بالجدول (حضور متأخر وانصراف متأخر) -> البند 4 ──
    if (hasValidScheduledShift && lateArrivalMinutes > 0 && lateDepartureMinutes > 0) {
      isScheduleDeviation = true;
      deviationStatus = 'pending';

      // قبل الاعتماد: تُحتسب الساعات فقط من وقت الدخول حتى موعد نهاية الوردية المجدولة
      // وتُستبعد الساعات التي بعد موعد الانصراف لحين موافقة الإدارة ومدير الفرع
      const windowEndMins = Math.min(actOutMins, schedEndMins);
      const windowHours = Math.max(0, Math.round(((windowEndMins - actInMins) / 60 - breakHours) * 100) / 100);
      regularHours = windowHours;
      overtimeHours = 0;
      overtimeStatus = 'pending';
    }
    // ── الحالة 2: حضور مبكر وانصراف متأخر عن الوردية المجدولة -> البند 3 ──
    else if (hasValidScheduledShift && earlyArrivalMinutes > 0 && lateDepartureMinutes > 0) {
      earlyOtHours = Math.round((earlyArrivalMinutes / 60) * 100) / 100;
      lateOtHours = Math.round((lateDepartureMinutes / 60) * 100) / 100;
      overtimeHours = Math.round((earlyOtHours + lateOtHours) * 100) / 100;
      regularHours = Math.min(netHours, scheduledHours);
      overtimeStatus = overtimeHours > 0 ? 'pending' : 'none';
    }
    // ── الحالة 3: زيادة ساعات عامة فوق الوردية المجدولة أو ملف الموظف ──
    else if (netHours > scheduledHours) {
      overtimeHours = Math.round((netHours - scheduledHours) * 100) / 100;
      regularHours = scheduledHours;
      overtimeStatus = 'pending';
      if (lateDepartureMinutes > 0) {
        lateOtHours = overtimeHours;
      } else if (earlyArrivalMinutes > 0) {
        earlyOtHours = overtimeHours;
      }
    } else {
      regularHours = netHours;
      overtimeHours = 0;
      overtimeStatus = 'none';
    }

    let existingShifts = [...(state.shifts || [])];
    const openShiftIdx = existingShifts.findIndex(
      (s) => (active.shiftId && s.id === active.shiftId) ||
             (isEmpShiftMatch(s) && isShiftOpen(s))
    );
    const shiftId = openShiftIdx >= 0 ? existingShifts[openShiftIdx].id : (active.shiftId || uid());

    // التحقق مما إذا كان للموظف وردية سابقة في نفس اليوم بفرع آخر لحصر البدل اليومي على أول فرع فقط
    const sameDateShifts = existingShifts.filter(
      (s) => isEmpShiftMatch(s) && s.date === active.date && s.id !== shiftId
    );
    const hasEarlierShiftInAnotherBranch = sameDateShifts.some(
      (s) => s.branchId && String(s.branchId) !== String(bId) && ((s.timeIn || '') <= (active.timeIn || ''))
    );

    const baseShift = openShiftIdx >= 0 ? existingShifts[openShiftIdx] : {};
    const newShift = {
      ...baseShift,
      id: shiftId,
      employeeId: empActualId || empId,
      employeeCode: emp?.code || baseShift.employeeCode || '',
      employeeName: emp?.name || baseShift.employeeName || '',
      branchId: bId,
      branchName: bObj?.name || '',
      date: active.date,
      timeIn: active.timeIn,
      timeOut,
      hours: overtimeStatus === 'pending' || isScheduleDeviation ? regularHours : netHours,
      actualWorkedHours: netHours,
      scheduledHours,
      scheduledStart: daySchedule?.start || '',
      scheduledEnd: daySchedule?.end || '',
      regularHours,
      overtimeHours,
      earlyOtHours,
      lateOtHours,
      overtimeStatus,
      deviationStatus,
      isScheduleDeviation,
      breakHours,
      excludeDailyAllowance: Boolean(hasEarlierShiftInAnotherBranch),
      note: isScheduleDeviation
        ? `طلب عدم الالتزام بالجدول (تأخير ${lateArrivalMinutes} د / خروج متأخر ${lateDepartureMinutes} د) بانتظار الاعتماد`
        : (overtimeHours > 0
            ? (earlyOtHours > 0 && lateOtHours > 0
                ? `ساعات إضافية (+${overtimeHours} س: قبل +${earlyOtHours} س / بعد +${lateOtHours} س) بانتظار الاعتماد`
                : `ساعات إضافية (+${overtimeHours} س) بانتظار الاعتماد`)
            : 'تسجيل انصراف بلمسة واحدة'),
      statusLabel: isScheduleDeviation ? 'عدم الالتزام بالجدول' : 'حضور حي',
      isLiveActive: false,
      status: 'completed',
      createdAt: baseShift.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // إغلاق كافة الورديات المفتوحة للموظف وضمان عدم بقاء أي وردية مفتوحة
    let updatedShifts = existingShifts.map((s, idx) => {
      if (idx === openShiftIdx || (isEmpShiftMatch(s) && isShiftOpen(s))) {
        return {
          ...s,
          ...newShift,
          id: s.id || newShift.id,
          timeOut,
          isLiveActive: false,
          status: 'completed',
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    if (openShiftIdx < 0) {
      updatedShifts = [newShift, ...updatedShifts];
    }

    let updatedRequests = state.requests || [];
    let updatedNotifications = state.notifications || [];

    // ── إنشاء طلب عدم الالتزام بالجدول (Schedule Deviation Request) ──
    if (isScheduleDeviation) {
      const noBranchMgr = isBranchWithoutManager(bId, state);
      const isDirectAdmin = noBranchMgr || shouldRouteDirectToAdmin(emp, bId, state);
      const targetApproval = isDirectAdmin ? 'admin_only' : 'both';
      const reqId = `req_dev_${empId}_${active.date}_${shiftId}`;
      const potentialOvertime = Math.max(0, Math.round((netHours - profileHours) * 100) / 100);

      const deviationReq = {
        id: reqId,
        shiftId: shiftId,
        employeeId: empActualId || empId,
        employeeName: emp?.name || '',
        employeeCode: emp?.code || '',
        jobTitle: emp?.jobTitle || '',
        branchId: bId,
        branchName: bObj?.name || 'الفرع الرئيسي',
        type: 'schedule_deviation',
        date: active.date,
        scheduledStart: daySchedule.start,
        scheduledEnd: daySchedule.end,
        scheduledHours: scheduledHours,
        profileHours: profileHours,
        actualIn: active.timeIn,
        actualOut: timeOut,
        lateArrivalMinutes: lateArrivalMinutes,
        lateDepartureMinutes: lateDepartureMinutes,
        actualWorkedHours: netHours,
        regularHours: regularHours,
        extraHoursBeyondProfile: potentialOvertime,
        reason: `حضور متأخر (${lateArrivalMinutes} د) وانصراف متأخر (${lateDepartureMinutes} د) عن موعد الشفت المجدول (${daySchedule.start} - ${daySchedule.end}).`,
        details: `الوردية المجدولة: ${daySchedule.start} إلى ${daySchedule.end} (${scheduledHours} س) | الحضور الفعلي: ${active.timeIn} | الانصراف الفعلي: ${timeOut} | الساعات الفعلية: ${netHours} س | الساعات الإضافية فوق ملف الموظف: +${potentialOvertime} س`,
        targetApproval,
        isDirectToAdmin: isDirectAdmin,
        branchNotRequired: isDirectAdmin,
        managerStatus: noBranchMgr ? 'skipped' : (isDirectAdmin ? 'skipped' : 'pending'),
        branchApprovalStatus: noBranchMgr ? 'skipped' : (isDirectAdmin ? 'skipped' : undefined),
        branchApproved: false,
        adminApproved: false,
        status: 'pending',
        createdAt: new Date().toISOString(),
        source: 'system_schedule_tracker'
      };
      updatedRequests = [deviationReq, ...updatedRequests];

      const notifId = `notif_dev_${empId}_${active.date}_${shiftId}`;
      const newNotif = {
        id: notifId,
        type: 'schedule_deviation_alert',
        title: `⚠️ عدم الالتزام بالجدول: ${emp?.name} (تأخير ${lateArrivalMinutes} د / خروج ${lateDepartureMinutes} د)`,
        message: `سجل الموظف ${emp?.name} بفرع ${bObj?.name || 'الفرع'} حضوراً متأخراً في ${active.timeIn} وانصرافاً متأخراً في ${timeOut}. يتطلب الطلب موافقة الإدارة والفرع.`,
        date: active.date,
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: isDirectAdmin ? 'admin' : 'all',
        branchId: bId,
        requestId: reqId
      };
      updatedNotifications = [newNotif, ...updatedNotifications];
    }

    // ── إنشاء طلب الساعات الإضافية (Overtime Request) عند عدم وجود مخالفة عدم الالتزام ──
    if (overtimeHours > 0 && !isScheduleDeviation) {
      const noBranchMgr = isBranchWithoutManager(bId, state);
      const isDirectAdmin = noBranchMgr || shouldRouteDirectToAdmin(emp, bId, state);
      const targetApproval = isDirectAdmin ? 'admin_only' : 'both';
      const reqId = `req_ot_${empId}_${active.date}_${shiftId}`;

      const reasonText = (earlyOtHours > 0 && lateOtHours > 0)
        ? `حضور مبكر قبل الوردية (+${earlyOtHours} س) وانصراف متأخر بعد الوردية (+${lateOtHours} س) بإجمالي إضافي (+${overtimeHours} س).`
        : `عمل الموظف ${emp?.name} عدد ${overtimeHours} ساعات إضافية فوق ساعات الوردية بالجدول (${scheduledHours} س).`;

      const detailsText = (earlyOtHours > 0 && lateOtHours > 0)
        ? `الوردية المقررة: ${daySchedule?.start || '—'} إلى ${daySchedule?.end || '—'} (${scheduledHours} س) | الحضور: ${active.timeIn} (تبكير ${earlyArrivalMinutes} د = +${earlyOtHours} س) | الانصراف: ${timeOut} (تأخير ${lateDepartureMinutes} د = +${lateOtHours} س) | إجمالي الساعات الفعلية: ${netHours} س | الإضافي المطلوب: +${overtimeHours} س`
        : `الوردية المقررة: ${scheduledHours} س | الساعات الفعلية: ${netHours} س | الساعات الإضافية المطلوب اعتمادها: +${overtimeHours} س`;

      const overtimeReq = {
        id: reqId,
        shiftId: shiftId,
        employeeId: empActualId || empId,
        employeeName: emp?.name || '',
        employeeCode: emp?.code || '',
        jobTitle: emp?.jobTitle || '',
        branchId: bId,
        branchName: bObj?.name || 'الفرع الرئيسي',
        type: 'overtime',
        subType: (earlyOtHours > 0 && lateOtHours > 0) ? 'early_and_late' : 'extra_hours',
        hours: overtimeHours,
        earlyOtHours,
        lateOtHours,
        regularHours: regularHours,
        totalShiftHours: netHours,
        scheduledStart: daySchedule?.start || '',
        scheduledEnd: daySchedule?.end || '',
        profileHours: profileHours,
        actualIn: active.timeIn,
        actualOut: timeOut,
        date: active.date,
        reason: reasonText,
        details: detailsText,
        targetApproval,
        isDirectToAdmin: isDirectAdmin,
        branchNotRequired: isDirectAdmin,
        managerStatus: noBranchMgr ? 'skipped' : (isDirectAdmin ? 'skipped' : 'pending'),
        branchApprovalStatus: noBranchMgr ? 'skipped' : (isDirectAdmin ? 'skipped' : undefined),
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
        message: (earlyOtHours > 0 && lateOtHours > 0)
          ? `حضور مبكر وانصراف متأخر للموظف ${emp?.name} بفرع ${bObj?.name || 'الفرع'} (+${overtimeHours} س إضافي قبل وبعد موعد الوردية).`
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

    // تنظيف شامل لكافة مفاتيح الموظف في activeShifts
    const updatedActive = { ...state.activeShifts };
    delete updatedActive[empId];
    delete updatedActive[String(empId)];
    if (empActualId) delete updatedActive[empActualId];
    if (empCode) delete updatedActive[empCode];
    Object.keys(updatedActive).forEach((k) => {
      const v = updatedActive[k];
      if (
        k === String(empId) ||
        k === empActualId ||
        k === empCode ||
        (v && (
          String(v.employeeId) === String(empId) ||
          String(v.employeeId) === empActualId ||
          (empCode && (String(v.employeeId) === empCode || String(v.employeeCode) === empCode)) ||
          (empActualId && String(v.employeeCode) === empActualId)
        ))
      ) {
        delete updatedActive[k];
      }
    });

    const endedEmpIds = Array.from(new Set([
      ...(state._endedShiftEmpIds || []),
      empId,
      String(empId),
      empActualId,
      empCode
    ].filter(Boolean)));

    let updatedState = {
      ...state,
      shifts: updatedShifts,
      activeShifts: updatedActive,
      requests: updatedRequests,
      notifications: updatedNotifications,
      _endedShiftEmpIds: endedEmpIds,
      _isShiftEndOperation: true
    };

    try {
      updatedState = checkAndRecordEarlyExit(empId, active.date, timeOut, updatedState);
    } catch (earlyErr) {
      console.error('[stopShift] Error in checkAndRecordEarlyExit (safely ignored):', earlyErr);
    }

    try {
      updatedState = checkAndRecordEarlyDepartureBeforeClosing(empId, active.date, timeOut, bId, updatedState);
    } catch (earlyClosingErr) {
      console.error('[stopShift] Error in checkAndRecordEarlyDepartureBeforeClosing (safely ignored):', earlyClosingErr);
    }

    setState(updatedState);

    const msg = `تم تسجيل انصراف ${emp ? emp.name : ''} بنجاح الساعة ${timeOut} (إجمالي الساعات: ${netHours} س)`;
    if (source === 'kiosk') {
      try {
        playFingerprintChime('success');
      } catch {}
      setKioskConfirmModal({
        open: true,
        type: 'checkout',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: `تم تسجيل الانصراف بنجاح! إجمالي ساعات الشيفت: ${netHours} ساعة.`,
        timestamp: `${getRealTodayStr()} · ${timeOut}`,
        branchName: bObj?.name || (state.branches || []).find(b => String(b.id) === String(active?.branchId))?.name || ''
      });
    } else {
      showToast(msg);
    }

    // ── 1. حفظ ذري في صندوق إرسال الكشك (Outbox) أو عبر apiRecordPunch للإدارة ──
    const finalShiftRecord = updatedState.shifts?.find(s => s.id === shiftId ||
      (isEmpShiftMatch(s) && s.date === active.date && s.timeOut === timeOut));

    if (source === 'kiosk') {
      enqueueKioskPunch({
        employeeId: empActualId || empId,
        employeeCode: empCode || '',
        employeeName: emp?.name || '',
        branchId: bId || active?.branchId || '',
        branchName: bObj?.name || '',
        actionType: 'check_out',
        time: timeOut,
        date: active.date || getRealTodayStr(),
        shiftId: shiftId,
        shiftData: null,
        shiftRecord: finalShiftRecord || newShift,
        source: 'kiosk_biometric'
      }).catch(err => {
        console.warn('[stopShift] Kiosk outbox enqueue warning:', err);
      });

      // حفظ محلي فوري لمنع بقاء الوردية نشطة في الكشك عند إعادة تحميل الصفحة أو انقطاع النت
      if (saveState) {
        saveState(updatedState).catch(err => console.error('[stopShift] Kiosk state save error:', err));
      }
    } else {
      apiRecordPunch({
        employeeId: empActualId || empId,
        branchId: bId || active?.branchId || '',
        actionType: 'check_out',
        time: timeOut,
        date: active.date || getRealTodayStr(),
        shiftId: shiftId,
        shiftData: null,
        shiftRecord: finalShiftRecord || newShift,
        requestId: `checkout_${empId}_${Date.now()}`
      }).catch(err => {
        console.warn('[stopShift] Atomic punch call warning (will rely on state sync):', err.message);
      });

      if (saveState) {
        saveState(updatedState).catch(err => console.error('[stopShift] Full state save error:', err));
      }
    }

    return { success: true, netHours, timeOut, date: active.date };
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
    const shift = (state.shifts || []).find((s) => String(s.id) === String(id));
    if (shift && !getEmpPermission(shift.employeeId, 'allowEditShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لحذف الورديات المحفوظة');
      return;
    }

    const performDelete = async () => {
      const shiftIdStr = String(id);
      const cleanRaw = shiftIdStr.replace(/^(shift_|punch_)/, '');
      const empIdStr = shift?.employeeId ? String(shift.employeeId) : '';
      const shiftDate = shift?.date || '';

      const updatedShifts = (state.shifts || []).filter((s) => {
        if (!s) return false;
        if (String(s.id) === shiftIdStr || (cleanRaw && String(s.id) === cleanRaw)) return false;
        if (shiftDate && empIdStr && String(s.employeeId) === empIdStr && s.date === shiftDate && s.timeIn === shift?.timeIn) return false;
        return true;
      });

      const tombstonesToAdd = [
        shiftIdStr,
        `shift_${shiftIdStr}`,
        `punch_${shiftIdStr}`
      ];
      if (cleanRaw) {
        tombstonesToAdd.push(cleanRaw, `shift_${cleanRaw}`, `punch_${cleanRaw}`);
      }
      if (empIdStr && shiftDate && shift?.timeIn) {
        tombstonesToAdd.push(`shift_${empIdStr}_${shiftDate}_${shift.timeIn}`);
        tombstonesToAdd.push(`${empIdStr}_${shiftDate}_${shift.timeIn}`);
      }

      // حذف طلبات الإضافي أو اعتمادات الحضور المرتبطة بهذه الوردية
      const associatedReqIds = [];
      const updatedRequests = (state.requests || []).filter((r) => {
        if (!r) return false;
        const matchShiftId = String(r.shiftId) === shiftIdStr || (cleanRaw && String(r.shiftId) === cleanRaw) || String(r.id).includes(shiftIdStr);
        const matchOtReq = r.type === 'overtime' && empIdStr && String(r.employeeId) === empIdStr && r.date === shiftDate;
        if (matchShiftId || matchOtReq) {
          if (r.id) {
            const cleanReqId = String(r.id).replace(/^req_/, '');
            associatedReqIds.push(String(r.id), `req_${cleanReqId}`, cleanReqId);
          }
          return false;
        }
        return true;
      });

      let updatedActiveShifts = { ...(state.activeShifts || {}) };
      if (empIdStr && updatedActiveShifts[empIdStr]) {
        const act = updatedActiveShifts[empIdStr];
        if (String(act.id) === shiftIdStr || String(act.id) === cleanRaw || act.date === shiftDate) {
          delete updatedActiveShifts[empIdStr];
        }
      }

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
      showToast('🗑️ تم حذف الوردية بنجاح وتحديث مسير الرواتب ووقائع التأخير');
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
    const isConfirmed = await showConfirm({
      title: 'حذف ملف الموظف نهائياً',
      message: `هل أنت متأكد من حذف الموظف "${emp.name}" نهائياً من كافة سجلات النظام؟\nسيتم حذف ملفه وبصماته ومعاملاته بالكامل.`,
      confirmText: 'تأكيد الحذف النهائي',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '👤'
    });
    if (!isConfirmed) return;

    const performDelete = async () => {
      const empIdStr = String(empId);
      const empCodeStr = String(emp.code || '').trim().toLowerCase();
      const empUserStr = String(emp.username || '').trim().toLowerCase();
      const empNid = String(emp.nationalId || '').replace(/\D/g, '');

      const isMatchingEmp = (e) => {
        if (!e) return false;
        if (String(e.id) === empIdStr) return true;
        if (empCodeStr && String(e.code || '').trim().toLowerCase() === empCodeStr) return true;
        if (empUserStr && String(e.username || '').trim().toLowerCase() === empUserStr) return true;
        if (empNid && String(e.nationalId || '').replace(/\D/g, '') === empNid) return true;
        return false;
      };

      const updatedEmps = (state.employees || []).filter((e) => !isMatchingEmp(e));
      const updatedActive = { ...state.activeShifts };
      delete updatedActive[empId];
      delete updatedActive[empIdStr];
      if (empCodeStr) delete updatedActive[empCodeStr];

      const isMatchingEmpItem = (item) => {
        if (!item) return false;
        const eId = String(item.employeeId || '');
        const eCode = String(item.employeeCode || '').trim().toLowerCase();
        if (eId === empIdStr) return true;
        if (empCodeStr && (eCode === empCodeStr || eId.toLowerCase() === empCodeStr)) return true;
        if (empUserStr && (eCode === empUserStr || eId.toLowerCase() === empUserStr)) return true;
        return false;
      };

      const updatedShifts = (state.shifts || []).filter((s) => !isMatchingEmpItem(s));
      const updatedRequests = (state.requests || []).filter((r) => !isMatchingEmpItem(r));
      const updatedResignations = (state.resignationRequests || []).filter((r) => !isMatchingEmpItem(r));
      const updatedLeaves = (state.leaveRequests || []).filter((l) => !isMatchingEmpItem(l));
      const updatedLoans = (state.loans || []).filter((l) => !isMatchingEmpItem(l));
      const updatedAdjs = (state.adjustments || []).filter((a) => !isMatchingEmpItem(a));
      const updatedRosters = (state.rosters || []).filter((r) => !isMatchingEmpItem(r));
      const updatedLateIncidents = (state.lateIncidents || []).filter((i) => !isMatchingEmpItem(i));
      const updatedNotes = (state.employeeNotes || []).filter((n) => !isMatchingEmpItem(n));
      const updatedEvals = (state.evaluations || []).filter((ev) => !isMatchingEmpItem(ev));

      const newDeleted = [
        `emp_${empIdStr}`,
        `emp_del_${empIdStr}`
      ];
      if (empIdStr.startsWith('emp_')) {
        newDeleted.push(empIdStr);
      }
      if (empCodeStr) {
        newDeleted.push(`emp_${empCodeStr}`, `emp_code_${empCodeStr}`);
      }
      if (empUserStr) {
        newDeleted.push(`emp_${empUserStr}`, `user_${empUserStr}`);
      }
      if (empNid) {
        newDeleted.push(`emp_nid_${empNid}`, `nid_${empNid}`);
      }

      const updatedDeletedIds = Array.from(new Set([
        ...(state._deletedIds || []),
        ...newDeleted
      ])).filter(Boolean).slice(-3000);

      try {
        apiArchiveDeleteEmployee(empId).catch(() => {});
        hardDeleteEntityFast('employee', empIdStr).catch(() => {});
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
