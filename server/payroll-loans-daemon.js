/**
 * payroll-loans-daemon.js
 * شيطان السيرفر الآلي للخصم والتسوية المحاسبية التلقائية للسلف والأقساط عند انتهاء دورة الرواتب
 * يعمل في الخلفية على مدار الساعة (24/7) دون الحاجة لفتح المتصفح أو أي تدخل بشري
 */

import { getEgyptDate, getEgyptDateTime } from './egypt-time.js';

export function getDaysInMonth(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return 30;
  return new Date(y, m, 0).getDate();
}

export function clampDayToMonth(year, month, targetDay) {
  const maxDays = getDaysInMonth(year, month);
  const day = parseInt(targetDay, 10) || 1;
  return Math.min(Math.max(1, day), maxDays);
}

export function extractPayrollSettings(orgSettings = {}) {
  const sDay = orgSettings?.payrollPayoutStartDay !== undefined ? parseInt(orgSettings.payrollPayoutStartDay, 10) : 21;
  const rawEnd = orgSettings?.payrollPayoutEndDay !== undefined
    ? parseInt(orgSettings.payrollPayoutEndDay, 10)
    : (orgSettings?.payrollPayoutDay !== undefined ? parseInt(orgSettings.payrollPayoutDay, 10) : 20);

  const startDay = isNaN(sDay) ? 21 : sDay;
  let endDay = isNaN(rawEnd) ? 20 : rawEnd;

  if (startDay > 1 && endDay === startDay) {
    endDay = startDay - 1;
  }

  const sTime = orgSettings?.payrollPayoutStartTime || '00:00';
  const eTime = orgSettings?.payrollPayoutEndTime || '23:59';
  const pType = orgSettings?.payrollPeriodType || 'cycle';

  return {
    startDay,
    endDay,
    startTime: sTime,
    endTime: eTime,
    periodType: pType,
    customFrom: orgSettings?.payrollCustomFrom || '',
    customTo: orgSettings?.payrollCustomTo || ''
  };
}

export function getCycleDateRange(monthStr, orgSettings = {}) {
  const settings = extractPayrollSettings(orgSettings);

  if (settings.periodType === 'custom' && settings.customFrom && settings.customTo) {
    const from = settings.customFrom <= settings.customTo ? settings.customFrom : settings.customTo;
    const to = settings.customFrom <= settings.customTo ? settings.customTo : settings.customFrom;
    return {
      startDate: from,
      endDate: to,
      month: from.slice(0, 7),
      isCustom: true
    };
  }

  let targetMonth = monthStr;
  if (!targetMonth || typeof targetMonth !== 'string' || targetMonth.length < 7) {
    targetMonth = getActivePayrollMonth(orgSettings);
  }

  const [yStr, mStr] = targetMonth.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const { startDay, endDay } = settings;

  const isCrossMonth = startDay > endDay || (startDay > 1 && (endDay - startDay) < 20);
  let startDate = '';
  let endDate = '';

  if (isCrossMonth) {
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY = y - 1;
    }
    const clampedStart = clampDayToMonth(prevY, prevM, startDay);
    const clampedEnd = clampDayToMonth(y, m, endDay);
    startDate = `${prevY}-${String(prevM).padStart(2, '0')}-${String(clampedStart).padStart(2, '0')}`;
    endDate = `${y}-${String(m).padStart(2, '0')}-${String(clampedEnd).padStart(2, '0')}`;
  } else {
    const clampedStart = clampDayToMonth(y, m, startDay);
    const clampedEnd = clampDayToMonth(y, m, endDay);
    startDate = `${y}-${String(m).padStart(2, '0')}-${String(clampedStart).padStart(2, '0')}`;
    endDate = `${y}-${String(m).padStart(2, '0')}-${String(clampedEnd).padStart(2, '0')}`;
  }

  return {
    startDate,
    endDate,
    month: targetMonth,
    startDay,
    endDay,
    isCustom: false
  };
}

export function getActivePayrollMonth(orgSettings = {}, refDate = new Date()) {
  const settings = extractPayrollSettings(orgSettings);
  if (settings.periodType === 'custom' && settings.customFrom) {
    return settings.customFrom.slice(0, 7);
  }

  const now = refDate instanceof Date ? refDate : new Date(refDate);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const day = now.getDate();
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  const { startDay, endDay, endTime } = settings;
  const effectiveEndTime = (!endTime || endTime === '00:00' || endTime === '0:00') ? '23:59' : endTime;
  const isCrossMonth = startDay > endDay || (startDay > 1 && (endDay - startDay) < 20);

  const isPastCutoff = day > endDay || (day === endDay && timeStr >= effectiveEndTime);

  if (isCrossMonth) {
    if (isPastCutoff) {
      let nextY = y;
      let nextM = m + 1;
      if (nextM > 12) {
        nextM = 1;
        nextY = y + 1;
      }
      return `${nextY}-${String(nextM).padStart(2, '0')}`;
    } else {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  } else {
    if (isPastCutoff) {
      let nextY = y;
      let nextM = m + 1;
      if (nextM > 12) {
        nextM = 1;
        nextY = y + 1;
      }
      return `${nextY}-${String(nextM).padStart(2, '0')}`;
    } else {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }
}

export function getPayrollMonthForDate(dateStr, orgSettings = {}) {
  if (!dateStr) return getActivePayrollMonth(orgSettings);
  const cleanDate = String(dateStr).slice(0, 10);
  const [yStr, mStr, dStr] = cleanDate.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);

  if (isNaN(y) || isNaN(m) || isNaN(day)) return getActivePayrollMonth(orgSettings);

  const settings = extractPayrollSettings(orgSettings);
  const { startDay, endDay } = settings;
  const isCrossMonth = startDay > endDay || (startDay > 1 && (endDay - startDay) < 20);

  if (isCrossMonth) {
    if (day >= startDay) {
      let nextY = y;
      let nextM = m + 1;
      if (nextM > 12) {
        nextM = 1;
        nextY = y + 1;
      }
      return `${nextY}-${String(nextM).padStart(2, '0')}`;
    } else {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  } else {
    return `${y}-${String(m).padStart(2, '0')}`;
  }
}

export function getMonthDiff(startMonthStr, targetMonthStr) {
  if (!startMonthStr || !targetMonthStr) return 0;
  const [y1, m1] = String(startMonthStr).slice(0, 7).split('-').map(Number);
  const [y2, m2] = String(targetMonthStr).slice(0, 7).split('-').map(Number);
  if (isNaN(y1) || isNaN(m1) || isNaN(y2) || isNaN(m2)) return 0;
  return (y2 - y1) * 12 + (m2 - m1);
}

export function getEmployeeUnifiedLoans(empId, state = {}) {
  if (!empId) return [];
  const empIdStr = String(empId).trim();
  const orgSettings = state.orgSettings || {};

  const isEmpMatch = (item) => {
    if (!item) return false;
    const itemId = String(item.employeeId || '').trim();
    const itemCode = String(item.employeeCode || '').trim();
    return itemId === empIdStr || (itemCode && itemCode === empIdStr);
  };

  const rawLoans = Array.isArray(state.loans) ? state.loans.filter(isEmpMatch) : [];

  const rawLoanRequests = Array.isArray(state.requests)
    ? state.requests.filter((r) => {
        if (!r || !isEmpMatch(r)) return false;
        const type = String(r.type || r.requestType || '').toLowerCase();
        const isLoanType = type === 'loan' || type === 'advance' || type === 'meds' || type === 'medication';
        const isApproved = r.status === 'approved' || r.status === 'paid' || r.status === 'partial';
        return isLoanType && isApproved;
      })
    : [];

  const seenIds = new Set();
  const combined = [];

  rawLoans.forEach((l) => {
    if (!l) return;
    const key = String(l.id || l.loanId || '');
    if (key) seenIds.add(key);
    combined.push({ ...l, _source: 'loans' });
  });

  rawLoanRequests.forEach((r) => {
    if (!r) return;
    const key = String(r.id || '');
    if (key && !seenIds.has(key)) {
      seenIds.add(key);
      combined.push({
        id: r.id,
        employeeId: r.employeeId,
        branchId: r.branchId,
        type: String(r.type || r.requestType || '').toLowerCase().includes('med') ? 'meds' : 'loan',
        loanType: r.loanType || (r.installmentMonths || r.monthsCount > 1 ? 'installment' : 'monthly'),
        amount: parseFloat(r.amount || r.totalAmount || 0),
        totalAmount: parseFloat(r.totalAmount || r.amount || 0),
        paidAmount: parseFloat(r.paidAmount || 0),
        remainingAmount: parseFloat(r.remainingAmount !== undefined ? r.remainingAmount : (r.amount || 0)),
        monthsCount: parseInt(r.monthsCount || r.installmentMonths || 1, 10),
        monthlyDeduction: parseFloat(r.monthlyDeduction || r.monthlyAmount || 0),
        paymentsHistory: Array.isArray(r.paymentsHistory) ? r.paymentsHistory : [],
        date: r.date || r.createdAt ? String(r.date || r.createdAt).slice(0, 10) : getEgyptDate(),
        startMonth: r.startMonth || r.firstInstallmentMonth || null,
        firstInstallmentMonth: r.firstInstallmentMonth || r.startMonth || null,
        status: r.status || 'approved',
        _source: 'requests'
      });
    }
  });

  return combined.map((l) => {
    const isMeds = l.type === 'meds' || String(l.requestType || '').includes('med');
    const isInstallment = l.loanType === 'installment' || parseInt(l.monthsCount, 10) > 1;
    const totalAmount = parseFloat(l.totalAmount || l.amount || 0);

    const history = Array.isArray(l.paymentsHistory) ? l.paymentsHistory : [];
    const histPaid = history.reduce((acc, p) => acc + (parseFloat(p?.amount) || 0), 0);
    const paidAmount = l.paidAmount !== undefined ? Math.max(parseFloat(l.paidAmount) || 0, histPaid) : histPaid;

    const monthsCount = Math.max(1, parseInt(l.monthsCount || 1, 10));
    let monthlyDeduction = parseFloat(l.monthlyDeduction || 0);
    if (monthlyDeduction <= 0) {
      monthlyDeduction = isInstallment ? Math.ceil(totalAmount / monthsCount) : totalAmount;
    }

    const loanDate = l.date || (l.createdAt ? String(l.createdAt).slice(0, 10) : getEgyptDate());
    const firstInstallmentMonth = l.firstInstallmentMonth || (isInstallment ? l.startMonth : null);
    const startMonth = firstInstallmentMonth || l.startMonth || getPayrollMonthForDate(loanDate, orgSettings);

    return {
      ...l,
      id: l.id,
      employeeId: l.employeeId,
      branchId: l.branchId,
      type: isMeds ? 'meds' : 'loan',
      loanType: isInstallment ? 'installment' : 'monthly',
      isInstallment,
      amount: totalAmount,
      totalAmount,
      paidAmount,
      remainingAmount: Math.max(0, totalAmount - paidAmount),
      monthsCount: isInstallment ? monthsCount : 1,
      monthlyDeduction,
      paymentsHistory: history,
      date: loanDate,
      firstInstallmentMonth,
      startMonth,
      status: (paidAmount >= totalAmount && totalAmount > 0) || l.status === 'paid' ? 'paid' : (paidAmount > 0 ? 'partial' : (l.status || 'approved'))
    };
  });
}

export function computeEmployeeLoanDeductionsForPeriod(empId, targetMonth, state = {}) {
  const orgSettings = state.orgSettings || {};
  const activeMonth = targetMonth || getActivePayrollMonth(orgSettings);

  const unifiedLoans = getEmployeeUnifiedLoans(empId, state);
  if (unifiedLoans.length === 0) {
    return { totalDeduction: 0, items: [] };
  }

  const items = [];
  let totalDeduction = 0;

  unifiedLoans.forEach((loan) => {
    const total = loan.totalAmount;
    if (total <= 0) return;
    if (loan.status === 'paid' || (loan.remainingAmount !== undefined && loan.remainingAmount <= 0)) return;

    const startMonth = loan.firstInstallmentMonth || loan.startMonth;
    const diff = getMonthDiff(startMonth, activeMonth);

    if (diff < 0) return;

    const isInstallment = loan.isInstallment;
    const monthsCount = loan.monthsCount;
    const monthlyInstallment = loan.monthlyDeduction;

    const autoPayrollRecord = (loan.paymentsHistory || []).find((p) => {
      if (!p) return false;
      const isAutoType = p.type === 'payroll_auto' || (p.id && String(p.id).startsWith(`pay_auto_${activeMonth}`));
      const isMatchingMonth = p.month === activeMonth || (p.note && p.note.includes(activeMonth));
      return isAutoType && isMatchingMonth;
    });

    let deductedThisMonth = 0;
    let previouslyPaid = 0;
    let currentInstallmentNum = 1;

    if (autoPayrollRecord) {
      deductedThisMonth = parseFloat(autoPayrollRecord.amount) || 0;
      previouslyPaid = (loan.paymentsHistory || []).reduce((acc, p) => {
        if (!p || p === autoPayrollRecord) return acc;
        return acc + (parseFloat(p.amount) || 0);
      }, 0);
      currentInstallmentNum = Math.min(monthsCount, diff + 1);
    } else {
      previouslyPaid = parseFloat(loan.paidAmount) || 0;
      const remainingBeforeThisMonth = Math.max(0, total - previouslyPaid);

      if (remainingBeforeThisMonth <= 0) return;

      if (!isInstallment) {
        deductedThisMonth = remainingBeforeThisMonth;
        currentInstallmentNum = 1;
      } else {
        if (diff >= monthsCount) {
          deductedThisMonth = remainingBeforeThisMonth;
          currentInstallmentNum = monthsCount;
        } else {
          deductedThisMonth = Math.min(monthlyInstallment, remainingBeforeThisMonth);
          currentInstallmentNum = diff + 1;
        }
      }
    }

    if (deductedThisMonth > 0) {
      totalDeduction += deductedThisMonth;
      items.push({
        loanId: loan.id,
        loanType: loan.loanType,
        isInstallment,
        type: loan.type,
        totalAmount: total,
        deductedThisMonth,
        previouslyPaid,
        remainingAfterMonth: Math.max(0, total - (previouslyPaid + deductedThisMonth)),
        currentInstallmentNum,
        totalInstallments: isInstallment ? monthsCount : 1,
        isFullySettledAfterMonth: (previouslyPaid + deductedThisMonth) >= total,
        startMonth,
        alreadySettledInRecord: Boolean(autoPayrollRecord)
      });
    }
  });

  return {
    totalDeduction,
    items
  };
}

export function autoSettlePeriodLoans(monthStr, state = {}) {
  if (!monthStr || !Array.isArray(state.employees)) {
    return { updatedLoans: state.loans, updatedRequests: state.requests, settledCount: 0, totalAmountCollected: 0 };
  }

  const orgSettings = state.orgSettings || {};
  const cycleRange = getCycleDateRange(monthStr, orgSettings);
  const deductionDate = cycleRange.endDate || getEgyptDate();

  let updatedLoans = Array.isArray(state.loans) ? [...state.loans] : [];
  let updatedRequests = Array.isArray(state.requests) ? [...state.requests] : [];
  let settledCount = 0;
  let totalAmountCollected = 0;

  state.employees.forEach((emp) => {
    const { items } = computeEmployeeLoanDeductionsForPeriod(emp.id, monthStr, state);
    if (!items || items.length === 0) return;

    items.forEach((item) => {
      if (item.alreadySettledInRecord) return;

      const loanIdStr = String(item.loanId);
      const payRecord = {
        id: `pay_auto_${monthStr}_${loanIdStr.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`,
        date: deductionDate,
        amount: item.deductedThisMonth,
        type: 'payroll_auto',
        month: monthStr,
        note: `خصم قسط آلي من مسير الرواتب لدورة شهر ${monthStr} (${item.isInstallment ? `قسط ${item.currentInstallmentNum}/${item.totalInstallments}` : 'سداد كامل'})`,
        recordedAt: new Date().toISOString()
      };

      totalAmountCollected += item.deductedThisMonth;

      // 1. تحديث في state.loans
      const lIdx = updatedLoans.findIndex((l) => String(l.id) === loanIdStr);
      if (lIdx >= 0) {
        const targetLoan = updatedLoans[lIdx];
        const history = Array.isArray(targetLoan.paymentsHistory) ? [...targetLoan.paymentsHistory] : [];
        const existingPayIdx = history.findIndex((p) => p.id === payRecord.id || (p.month === monthStr && p.type === 'payroll_auto'));

        if (existingPayIdx >= 0) {
          history[existingPayIdx] = payRecord;
        } else {
          history.push(payRecord);
        }

        const total = parseFloat(targetLoan.amount || targetLoan.totalAmount) || 0;
        const histSum = history.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        const newPaid = total > 0 ? Math.min(total, histSum) : histSum;

        updatedLoans[lIdx] = {
          ...targetLoan,
          paidAmount: newPaid,
          remainingAmount: Math.max(0, total - newPaid),
          paymentsHistory: history,
          status: newPaid >= total && total > 0 ? 'paid' : (newPaid > 0 ? 'partial' : targetLoan.status),
          updatedAt: new Date().toISOString()
        };
        settledCount++;
      }

      // 2. تحديث في state.requests
      const rIdx = updatedRequests.findIndex((r) => String(r.id) === loanIdStr);
      if (rIdx >= 0) {
        const targetReq = updatedRequests[rIdx];
        const history = Array.isArray(targetReq.paymentsHistory) ? [...targetReq.paymentsHistory] : [];
        const existingPayIdx = history.findIndex((p) => p.id === payRecord.id || (p.month === monthStr && p.type === 'payroll_auto'));

        if (existingPayIdx >= 0) {
          history[existingPayIdx] = payRecord;
        } else {
          history.push(payRecord);
        }

        const total = parseFloat(targetReq.amount || targetReq.totalAmount) || 0;
        const histSum = history.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        const newPaid = total > 0 ? Math.min(total, histSum) : histSum;

        updatedRequests[rIdx] = {
          ...targetReq,
          paidAmount: newPaid,
          remainingAmount: Math.max(0, total - newPaid),
          paymentsHistory: history,
          status: newPaid >= total && total > 0 ? 'paid' : (newPaid > 0 ? 'partial' : targetReq.status),
          updatedAt: new Date().toISOString()
        };
      }
    });
  });

  return {
    updatedLoans,
    updatedRequests,
    settledCount,
    totalAmountCollected
  };
}

/**
 * الفحص الدوري الشامل لجميع دورات الرواتب المنتهية
 */
export function checkAndAutoSettleExpiredPayrollLoans(state = {}) {
  if (!state || typeof state !== 'object') {
    return { shouldUpdate: false, state };
  }

  const orgSettings = state.orgSettings || {};
  const activeMonth = getActivePayrollMonth(orgSettings);
  if (!activeMonth) return { shouldUpdate: false, state };

  // فحص آخر 3 أشهر سابقة على الأكثر في حال كان النظام متوقفاً
  const [yStr, mStr] = activeMonth.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  const candidateMonths = [];
  for (let offset = 1; offset <= 3; offset++) {
    let checkY = y;
    let checkM = m - offset;
    while (checkM < 1) {
      checkM += 12;
      checkY -= 1;
    }
    candidateMonths.push(`${checkY}-${String(checkM).padStart(2, '0')}`);
  }
  // الترتيب زمني تصاعدي (الأقدم فالأحدث)
  candidateMonths.reverse();

  let currentState = state;
  let totalSettledAcrossCycles = 0;
  let totalCollectedAcrossCycles = 0;
  const settlements = { ...(currentState.orgSettings?.payrollLoanSettlements || {}) };
  let anyCycleUpdated = false;

  const nowIso = new Date().toISOString();

  for (const monthStr of candidateMonths) {
    if (settlements[monthStr]?.settled) {
      continue;
    }

    const cycleRange = getCycleDateRange(monthStr, currentState.orgSettings || {});
    const cycleEndIso = `${cycleRange.endDate}T23:59:59`;

    if (nowIso < cycleEndIso) {
      continue; // الدورة لم تنتهِ بعد
    }

    // تنفيذ الخصم والتسوية
    const { updatedLoans, updatedRequests, settledCount, totalAmountCollected } = autoSettlePeriodLoans(monthStr, currentState);

    settlements[monthStr] = {
      settled: true,
      settledAt: new Date().toISOString(),
      settledCount,
      totalAmountCollected,
      cycleRange
    };

    currentState = {
      ...currentState,
      loans: updatedLoans,
      requests: updatedRequests,
      orgSettings: {
        ...(currentState.orgSettings || {}),
        payrollLoanSettlements: settlements
      }
    };

    totalSettledAcrossCycles += settledCount;
    totalCollectedAcrossCycles += totalAmountCollected;
    anyCycleUpdated = true;
  }

  return {
    shouldUpdate: anyCycleUpdated && totalSettledAcrossCycles > 0,
    settledCount: totalSettledAcrossCycles,
    totalAmountCollected: totalCollectedAcrossCycles,
    nextState: currentState
  };
}

/**
 * بدء تشغيل خدمة الشيطان الآلي لتسوية السلف والأقساط دورياً في السيرفر
 */
export function startPayrollLoansSettlementDaemon(STORAGE_KEY, getSettingsFromStorage, saveSettingsToStorage, io) {
  console.log('⏰ [Payroll Loans Daemon] تم تفعيل شيطان فحص وتسوية السلف والأقساط التلقائي 24/7');

  async function runDaemonCheck() {
    try {
      const state = await getSettingsFromStorage(STORAGE_KEY);
      if (!state || typeof state !== 'object') return;

      const result = checkAndAutoSettleExpiredPayrollLoans(state);
      if (result.shouldUpdate && result.nextState) {
        console.log(`💰 [Payroll Loans Daemon] تم رصد دورة منتهية! جاري الخصم التلقائي لـ ${result.settledCount} سلفة/قسط بإجمالي ${result.totalAmountCollected} ج.م...`);
        await saveSettingsToStorage(STORAGE_KEY, result.nextState, 'payroll-daemon');

        if (io) {
          io.emit('payroll:loans_auto_settled', {
            settledCount: result.settledCount,
            totalAmountCollected: result.totalAmountCollected,
            settledAt: new Date().toISOString()
          });
        }
        console.log('✅ [Payroll Loans Daemon] تم حفظ وتحديث حالة السلف والأقساط وبثها لجميع الأجهزة بنجاح.');
      }
    } catch (err) {
      console.error('❌ [Payroll Loans Daemon Error]:', err.message);
    }
  }

  // 1. تشغيل فحص أولي بعد 8 ثوانٍ من إقلاع السيرفر
  setTimeout(() => {
    runDaemonCheck();
  }, 8000);

  // 2. تكرار الفحص التلقائي كل 15 دقيقة بشكل دائم
  const DAEMON_INTERVAL_MS = 15 * 60 * 1000;
  setInterval(() => {
    runDaemonCheck();
  }, DAEMON_INTERVAL_MS);
}
