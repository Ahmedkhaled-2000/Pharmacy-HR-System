/**
 * loansEngine.js
 * المحرك المركزي الموحد لإدارة واحتساب وتسوية السلف والأقساط الشهرية
 * يضمن:
 * 1. الخصم التلقائي الكامل للسلف الشهرية في دورة شهرها فقط
 * 2. الخصم التلقائي الدقيق لأقساط السلف المقسطة شهراً بشهر حتى استيفاء كامل المبلغ
 * 3. التوقف التلقائي للخصم بمجرد استيفاء الأقساط
 * 4. التسوية المحاسبية الآلية الموثقة عند تجميد دورة الرواتب (Auto-Settlement)
 * 5. التطابق التام عبر كشف الرواتب، وكشف مفردات المرتب الرسمي، وشيت الإكسيل، وبوابة الموظف
 */

import { getCycleDateRange, getPayrollMonthForDate, getActivePayrollMonth } from './periodEngine.js';

/**
 * حساب الفرق بالأشهر بين شهرين بصيغة YYYY-MM
 */
export function getMonthDiff(startMonthStr, targetMonthStr) {
  if (!startMonthStr || !targetMonthStr) return 0;
  const [y1, m1] = String(startMonthStr).slice(0, 7).split('-').map(Number);
  const [y2, m2] = String(targetMonthStr).slice(0, 7).split('-').map(Number);
  if (isNaN(y1) || isNaN(m1) || isNaN(y2) || isNaN(m2)) return 0;
  return (y2 - y1) * 12 + (m2 - m1);
}

/**
 * استخراج ودمج كافة السلف والأدوية الآجل المعتمدة لموظف من state.loans و state.requests
 * مع استبعاد التكرار والطلبات المرفوضة أو الملغاة
 */
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

  const isApprovedStatus = (status, adminApproved) => {
    return status === 'approved' || status === 'partial' || status === 'paid' || Boolean(adminApproved);
  };

  const isLoanType = (type) => {
    return type === 'loan' || type === 'advance' || type === 'meds' || type === 'credit_medicine';
  };

  const loanMap = new Map();

  // 1. فحص state.requests
  (state.requests || [])
    .filter((r) => isEmpMatch(r) && isLoanType(r.type) && isApprovedStatus(r.status, r.adminApproved))
    .forEach((r) => {
      loanMap.set(String(r.id), { ...r });
    });

  // 2. فحص state.loans ودمج الأحدث
  (state.loans || [])
    .filter((l) => isEmpMatch(l) && isApprovedStatus(l.status, l.adminApproved) && l.status !== 'rejected' && l.status !== 'cancelled')
    .forEach((l) => {
      const existing = loanMap.get(String(l.id)) || (l.requestId ? loanMap.get(String(l.requestId)) : null);
      loanMap.set(String(l.id), { ...(existing || {}), ...l });
    });

  return Array.from(loanMap.values()).map((l) => {
    const totalAmount = parseFloat(l.amount || l.totalAmount) || 0;
    const isMeds = l.type === 'meds' || l.type === 'credit_medicine';
    const monthsCount = Math.max(1, parseInt(l.monthsCount || l.installmentsCount, 10) || 1);
    const isInstallment = l.loanType === 'installment' || l.loanType === 'installments' || monthsCount > 1 || (
      parseFloat(l.monthlyDeduction || l.installmentAmount) > 0 &&
      parseFloat(l.monthlyDeduction || l.installmentAmount) < totalAmount
    );

    const monthlyDeduction = parseFloat(l.monthlyDeduction || l.installmentAmount) || (
      isInstallment ? Math.ceil(totalAmount / monthsCount) : totalAmount
    );

    const history = (l.paymentsHistory && l.paymentsHistory.length > 0)
      ? l.paymentsHistory
      : (l.payments || l.paidHistory || []);

    const historySum = history.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const rawPaid = parseFloat(l.paidAmount) || 0;
    const paidAmount = totalAmount > 0
      ? Math.min(totalAmount, history.length > 0 ? historySum : rawPaid)
      : (history.length > 0 ? historySum : rawPaid);

    const loanDate = l.date || (l.createdAt ? l.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    const startMonth = l.startMonth || getPayrollMonthForDate(loanDate, orgSettings);

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
      startMonth,
      status: paidAmount >= totalAmount && totalAmount > 0 ? 'paid' : (paidAmount > 0 ? 'partial' : (l.status || 'approved'))
    };
  });
}

/**
 * المحرك المركزي لحساب استقطاعات السلف والأقساط لموظف في دورة شهرية محددة
 * @param {string|number} empId - كود أو معرف الموظف
 * @param {string} targetMonth - الشهر المالي بصيغة YYYY-MM
 * @param {object} state - حالة النظام الشاملة
 * @param {string|null} targetBranchId - فلترة لفرع معين (إن وجدت)
 * @returns {object} { totalDeduction, items: Array, hasLoans: boolean }
 */
export function computeEmployeeLoanDeductionsForPeriod(empId, targetMonth, state = {}, targetBranchId = null) {
  const orgSettings = state.orgSettings || {};
  const activeMonth = targetMonth || getActivePayrollMonth(orgSettings);
  const cycleRange = getCycleDateRange(activeMonth, orgSettings);

  const unifiedLoans = getEmployeeUnifiedLoans(empId, state);
  if (unifiedLoans.length === 0) {
    return {
      totalDeduction: 0,
      items: [],
      hasLoans: false
    };
  }

  // فرز الفروع لتطبيق الخصم على الفرع الأساسي للموظف منعاً لتكرار الخصم إذا داوم بعدة فروع
  const emp = (state.employees || []).find((e) => String(e.id) === String(empId));
  const primaryBranchId = emp?.branchesDetails?.[0]?.branchId || emp?.branchId;

  if (targetBranchId && primaryBranchId && String(targetBranchId) !== String(primaryBranchId)) {
    // إذا كان الموظف متعدد الفروع والمستخدم يطالع فرعاً ثانوياً، لا نخصم السلفة من الفرع الثانوي
    return {
      totalDeduction: 0,
      items: [],
      hasLoans: false
    };
  }

  const items = [];
  let totalDeduction = 0;

  unifiedLoans.forEach((loan) => {
    const total = loan.totalAmount;
    if (total <= 0) return;

    const startMonth = loan.startMonth;
    const diff = getMonthDiff(startMonth, activeMonth);

    // الحالة 1: السلفة مسجلة في شهر مستقبلي بالنسبة للشهر المفحوص
    if (diff < 0) return;

    const isInstallment = loan.isInstallment;
    const monthsCount = loan.monthsCount;
    const monthlyInstallment = loan.monthlyDeduction;

    // 1. هل تم توثيق خصم مسير الرواتب لهذا الشهر مسبقاً (سند آلي payroll_auto)؟
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
      // تم توثيق السداد آلياً عند تجميد هذا الشهر مسبقاً
      deductedThisMonth = parseFloat(autoPayrollRecord.amount) || 0;
      // حساب ما تم سداده قبل هذا الشهر
      const paymentsBeforeThisMonth = (loan.paymentsHistory || []).filter((p) => {
        if (!p || p === autoPayrollRecord) return false;
        const pMonth = p.month || (p.date ? getPayrollMonthForDate(p.date, orgSettings) : '');
        return pMonth && getMonthDiff(pMonth, activeMonth) > 0;
      });
      previouslyPaid = paymentsBeforeThisMonth.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      currentInstallmentNum = isInstallment ? Math.min(monthsCount, diff + 1) : 1;
    } else {
      // حساب ديناميكي تلقائي مؤتمت بالكامل
      // فحص المدفوعات المسجلة قبل هذا الشهر
      const priorPayments = (loan.paymentsHistory || []).filter((p) => {
        if (!p) return false;
        const pMonth = p.month || (p.date ? getPayrollMonthForDate(p.date, orgSettings) : '');
        return pMonth && getMonthDiff(pMonth, activeMonth) > 0;
      }).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      // أي سداد نقدي يدوي مسجل خلال هذه الدورة
      const cycleManualPayments = (loan.paymentsHistory || []).filter((p) => {
        if (!p || p.type === 'payroll_auto') return false;
        const pMonth = p.month || (p.date ? getPayrollMonthForDate(p.date, orgSettings) : '');
        const isCycleDate = p.date && p.date >= cycleRange.startDate && p.date <= cycleRange.endDate;
        return pMonth === activeMonth || isCycleDate;
      }).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      if (!isInstallment) {
        // سلفة شهرية (Single Deduction):
        // تُخصم فقط في دورة شهرها (diff === 0)
        if (diff === 0) {
          previouslyPaid = priorPayments + cycleManualPayments;
          deductedThisMonth = Math.max(0, total - previouslyPaid);
        } else {
          // انقضت دورة الشهر: لا تُخصم في الشهور التالية لأنها سُددت بالفعل مع راتب شهرها
          return;
        }
      } else {
        // سلفة مقسطة (Installment Deduction):
        currentInstallmentNum = diff + 1;

        if (currentInstallmentNum > monthsCount) {
          // اكتملت كافة شهور الأقساط: التوقف التلقائي عن الخصم
          return;
        }

        // حساب ما كان يجب سداده في الشهور السابقة تلقائياً
        const autoPrevInstallments = (currentInstallmentNum - 1) * monthlyInstallment;
        previouslyPaid = Math.max(autoPrevInstallments, priorPayments);

        const remBefore = Math.max(0, total - previouslyPaid);
        if (remBefore <= 0) {
          // مسددة بالكامل
          return;
        }

        // قسط هذا الشهر (مخصوماً منه أي سداد نقدي يدوي تم خلال دورة الشهر)
        const installmentTarget = Math.min(remBefore, monthlyInstallment);
        deductedThisMonth = Math.max(0, installmentTarget - cycleManualPayments);
      }
    }

    if (deductedThisMonth <= 0) return;

    const remainingAfter = Math.max(0, total - (previouslyPaid + deductedThisMonth));

    let typeLabel = '';
    if (loan.type === 'meds') {
      typeLabel = isInstallment
        ? `💊 قسط أدوية آجل (${currentInstallmentNum}/${monthsCount})`
        : '💊 مشتريات أدوية بالآجل';
    } else {
      typeLabel = isInstallment
        ? `💳 قسط سلفة مقسطة (${currentInstallmentNum}/${monthsCount})`
        : '💳 سلفة نقدية شهرية';
    }

    items.push({
      id: loan.id,
      loanId: loan.id,
      date: loan.date,
      startMonth,
      targetMonth: activeMonth,
      type: loan.type,
      loanType: loan.loanType,
      isInstallment,
      currentInstallmentNumber: currentInstallmentNum,
      installmentsCount: monthsCount,
      typeLabel,
      totalAmount: total,
      paidAmount: previouslyPaid,
      deductedThisMonth,
      remainingBalance: remainingAfter,
      notes: loan.notes || loan.reason || '—'
    });

    totalDeduction += deductedThisMonth;
  });

  return {
    totalDeduction,
    items,
    hasLoans: items.length > 0
  };
}

/**
 * التسوية المحاسبية الآلية للسلف عند تجميد دورة الرواتب (Auto-Settlement)
 * تسجل إيصالات سداد دائمة في سجل السلف لتوثيقها تاريخياً في قاعدة البيانات
 * @param {string} monthStr - الشهر المجمد بصيغة YYYY-MM
 * @param {object} state - حالة النظام
 * @returns {object} { updatedLoans, updatedRequests, settledCount }
 */
export function autoSettlePeriodLoans(monthStr, state = {}) {
  if (!monthStr) return { updatedLoans: state.loans, updatedRequests: state.requests, settledCount: 0 };

  const orgSettings = state.orgSettings || {};
  const cycleRange = getCycleDateRange(monthStr, orgSettings);
  const cycleEndDate = cycleRange.endDate || `${monthStr}-25`;

  let updatedLoans = Array.isArray(state.loans) ? [...state.loans] : [];
  let updatedRequests = Array.isArray(state.requests) ? [...state.requests] : [];
  let settledCount = 0;

  const employees = state.employees || [];

  employees.forEach((emp) => {
    const loanCalc = computeEmployeeLoanDeductionsForPeriod(emp.id, monthStr, state);
    if (!loanCalc.hasLoans) return;

    loanCalc.items.forEach((item) => {
      const loanIdStr = String(item.loanId);
      const payAmount = item.deductedThisMonth;
      if (payAmount <= 0) return;

      const payRecord = {
        id: `pay_auto_${monthStr}_${loanIdStr}`,
        date: cycleEndDate,
        month: monthStr,
        amount: payAmount,
        note: `خصم آلي من مسير رواتب شهر (${monthStr})`,
        type: 'payroll_auto',
        createdAt: new Date().toISOString()
      };

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
    settledCount
  };
}

/**
 * التراجع عن التسوية المحاسبية الآلية عند فك تجميد دورة الرواتب
 * يزيل إيصالات السداد الآلية (payroll_auto) الخاصة بالشهر لتمكين إعادة الحساب الديناميكي
 * @param {string} monthStr - الشهر المفكوك تجميده بصيغة YYYY-MM
 * @param {object} state - حالة النظام
 * @returns {object} { updatedLoans, updatedRequests, revertedCount }
 */
export function revertPeriodLoanSettlements(monthStr, state = {}) {
  if (!monthStr) return { updatedLoans: state.loans, updatedRequests: state.requests, revertedCount: 0 };

  let updatedLoans = Array.isArray(state.loans) ? [...state.loans] : [];
  let updatedRequests = Array.isArray(state.requests) ? [...state.requests] : [];
  let revertedCount = 0;

  const filterHistory = (history) => {
    return (history || []).filter((p) => {
      if (!p) return false;
      const isAuto = p.type === 'payroll_auto' || (p.id && String(p.id).startsWith(`pay_auto_${monthStr}`));
      const isMonth = p.month === monthStr || (p.note && p.note.includes(monthStr));
      return !(isAuto && isMonth);
    });
  };

  updatedLoans = updatedLoans.map((loan) => {
    const origHistory = loan.paymentsHistory || [];
    const newHistory = filterHistory(origHistory);
    if (newHistory.length !== origHistory.length) {
      revertedCount++;
      const total = parseFloat(loan.amount || loan.totalAmount) || 0;
      const histSum = newHistory.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
      const newPaid = total > 0 ? Math.min(total, histSum) : histSum;
      return {
        ...loan,
        paidAmount: newPaid,
        remainingAmount: Math.max(0, total - newPaid),
        paymentsHistory: newHistory,
        status: newPaid >= total && total > 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'approved'),
        updatedAt: new Date().toISOString()
      };
    }
    return loan;
  });

  updatedRequests = updatedRequests.map((req) => {
    const origHistory = req.paymentsHistory || [];
    const newHistory = filterHistory(origHistory);
    if (newHistory.length !== origHistory.length) {
      const total = parseFloat(req.amount || req.totalAmount) || 0;
      const histSum = newHistory.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
      const newPaid = total > 0 ? Math.min(total, histSum) : histSum;
      return {
        ...req,
        paidAmount: newPaid,
        remainingAmount: Math.max(0, total - newPaid),
        paymentsHistory: newHistory,
        status: newPaid >= total && total > 0 ? 'paid' : (newPaid > 0 ? 'partial' : req.status),
        updatedAt: new Date().toISOString()
      };
    }
    return req;
  });

  return {
    updatedLoans,
    updatedRequests,
    revertedCount
  };
}

