import React, { useState, useEffect } from 'react';
import { fmt, getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export default function LoansMedsModule({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const [selectedEmpModal, setSelectedEmpModal] = useState(null);
  const [filterBranch, setFilterBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for Adding New Loan/Meds Debt
  const [targetEmpId, setTargetEmpId] = useState('');
  const [entryType, setEntryType] = useState('loan'); // 'loan' | 'meds'
  const [loanRepayPlan, setLoanRepayPlan] = useState('single'); // 'single' | 'installment'
  const [loanMonthsCount, setLoanMonthsCount] = useState('2');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Loan Rules & Thresholds State
  const orgSettings = state.orgSettings || {};
  const [ruleStartDay, setRuleStartDay] = useState(orgSettings.loanRequestStartDay || 1);
  const [ruleEndDay, setRuleEndDay] = useState(orgSettings.loanRequestEndDay || 10);
  const [ruleMaxMonthlyPercent, setRuleMaxMonthlyPercent] = useState(orgSettings.maxMonthlyLoanSalaryPercent || 50);
  const [ruleMaxInstallmentMultiplier, setRuleMaxInstallmentMultiplier] = useState(
    orgSettings.maxInstallmentLoanSalaryMultiplier !== undefined ? orgSettings.maxInstallmentLoanSalaryMultiplier : 2
  );

  useEffect(() => {
    if (state.orgSettings) {
      if (state.orgSettings.loanRequestStartDay !== undefined) setRuleStartDay(state.orgSettings.loanRequestStartDay);
      if (state.orgSettings.loanRequestEndDay !== undefined) setRuleEndDay(state.orgSettings.loanRequestEndDay);
      if (state.orgSettings.maxMonthlyLoanSalaryPercent !== undefined) setRuleMaxMonthlyPercent(state.orgSettings.maxMonthlyLoanSalaryPercent);
      if (state.orgSettings.maxInstallmentLoanSalaryMultiplier !== undefined) setRuleMaxInstallmentMultiplier(state.orgSettings.maxInstallmentLoanSalaryMultiplier);
    }
  }, [state.orgSettings]);

  const handleSaveLoanSettings = async () => {
    const performSaveLoanSettings = async () => {
      const updatedSettings = {
        ...(state.orgSettings || {}),
        loanRequestStartDay: parseInt(ruleStartDay) || 1,
        loanRequestEndDay: parseInt(ruleEndDay) || 10,
        maxMonthlyLoanSalaryPercent: parseFloat(ruleMaxMonthlyPercent) || 50,
        maxInstallmentLoanSalaryMultiplier: parseFloat(ruleMaxInstallmentMultiplier) || 2
      };
      const updatedState = { ...state, orgSettings: updatedSettings };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.('✅ تم حفظ ضوابط وشروط السلف للموظفين وتطبيقها فوراً!');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditCutoffRules',
        actionTitle: 'تعديل ضوابط ومواعيد السلف',
        actionDetails: `النافذة: من يوم ${ruleStartDay} إلى ${ruleEndDay}`,
        onExecute: performSaveLoanSettings
      });
    } else {
      await performSaveLoanSettings();
    }
  };

  const employees = state.employees || [];
  const branches = state.branches || [];

  const loansList = React.useMemo(() => {
    const directLoans = state.loans || [];
    const allLoanRequests = (state.requests || [])
      .filter(
        (r) =>
          (r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine') &&
          (r.status === 'approved' || r.adminApproved || r.status === 'partial' || r.status === 'paid')
      )
      .map((r) => {
        const directLoan = directLoans.find((l) => String(l.id) === String(r.id));
        const history = (directLoan?.paymentsHistory && directLoan.paymentsHistory.length > 0)
          ? directLoan.paymentsHistory
          : (r.paymentsHistory || r.payments || r.paidHistory || []);
        const paidAmount = directLoan?.paidAmount !== undefined
          ? Math.max(parseFloat(directLoan.paidAmount) || 0, parseFloat(r.paidAmount) || 0)
          : (parseFloat(r.paidAmount) || 0);

        const isMeds = r.type === 'meds' || r.type === 'credit_medicine';

        return {
          id: r.id,
          employeeId: r.employeeId,
          employeeName: r.employeeName || (employees.find((e) => e.id === r.employeeId)?.name || 'موظف'),
          employeeCode: r.employeeCode || (employees.find((e) => e.id === r.employeeId)?.code || 'CODE'),
          type: isMeds ? 'meds' : 'loan',
          loanType: r.loanType || 'monthly',
          typeLabel: isMeds
            ? (r.status === 'approved' ? 'أدوية ومشتريات آجل معتمدة' : 'طلب أدوية آجل')
            : (r.status === 'approved' ? (r.loanType === 'installment' ? 'سلفة مقسطة معتمدة' : 'سلفة مالية معتمدة') : 'طلب سلفة مالية'),
          amount: parseFloat(r.amount || r.totalAmount) || 0,
          paidAmount: parseFloat(paidAmount) || 0,
          paymentsHistory: history,
          medsItems: r.medsItems || r.items || r.medsDetails || [],
          monthlyDeduction: r.monthlyDeduction || r.installmentAmount || null,
          status: r.status || 'approved',
          notes: r.reason || r.details || r.notes || (isMeds ? 'طلب أدوية آجل' : 'طلب سلفة مالية'),
          date: r.date || (r.createdAt ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          createdAt: r.createdAt || new Date().toISOString()
        };
      });

    const map = new Map();
    allLoanRequests.forEach((item) => {
      map.set(String(item.id), item);
    });
    directLoans.forEach((l) => {
      if (l.status === 'rejected' || l.status === 'cancelled' || l.status === 'pending' || l.status === 'pending_admin') return;
      const idStr = String(l.id);
      const existing = map.get(idStr);
      const paid = Math.max(parseFloat(l.paidAmount) || 0, parseFloat(existing?.paidAmount) || 0);
      const history = (l.paymentsHistory && l.paymentsHistory.length > 0) ? l.paymentsHistory : (existing?.paymentsHistory || []);
      const total = parseFloat(l.amount || existing?.amount) || 0;
      map.set(idStr, {
        ...(existing || {}),
        ...l,
        paidAmount: paid,
        paymentsHistory: history,
        status: paid >= total && total > 0 ? 'paid' : (paid > 0 ? 'partial' : (l.status || existing?.status || 'approved'))
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      const getT = (r) => {
        if (!r) return 0;
        if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.timestamp) { const t = new Date(r.timestamp).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.updatedAt) { const t = new Date(r.updatedAt).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.id) {
          const parts = String(r.id).split('_');
          for (const p of parts) {
            const num = parseInt(p, 10);
            if (!isNaN(num) && num > 1000000000000) return num;
          }
        }
        if (r.startDate) { const t = new Date(r.startDate).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.date) { const t = new Date(r.date).getTime(); if (!isNaN(t) && t > 0) return t; }
        return 0;
      };
      return getT(b) - getT(a);
    });
  }, [state.loans, state.requests, employees]);

  const filteredEmployees = employees.filter((emp) => {
    if (!isEmployeeActive(emp)) return false;
    if (filterBranch && emp.branchId !== filterBranch) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name?.toLowerCase().includes(q);
      const matchNickname = emp.nickname?.toLowerCase().includes(q);
      const matchCode = emp.code?.includes(q);
      if (!matchName && !matchNickname && !matchCode) return false;
    }
    return true;
  });

  // Calculate overall financial stats
  const totalLoansGiven = loansList
    .filter((l) => l.type === 'loan' || !l.type)
    .reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);

  const totalMedsGiven = loansList
    .filter((l) => l.type === 'meds')
    .reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);

  const totalRemaining = loansList.reduce((acc, l) => {
    const total = parseFloat(l.amount) || 0;
    const paid = parseFloat(l.paidAmount) || 0;
    return acc + Math.max(0, total - paid);
  }, 0);

  const handleAddEntry = async (e) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!targetEmpId || !parsed || parsed <= 0) {
      showToast?.('يرجى اختيار الموظف وإدخال المبلغ بشكل صحيح');
      return;
    }

    const empObj = employees.find((e) => e.id === targetEmpId);
    const months = (entryType === 'loan' && loanRepayPlan === 'installment') ? Math.max(2, parseInt(loanMonthsCount, 10) || 2) : 1;
    const monthlyDeduction = (entryType === 'loan' && loanRepayPlan === 'installment') ? Math.round((parsed / months) * 100) / 100 : parsed;
    const entryId = `loan_${Date.now()}`;

    const performAddEntry = async () => {
      const newLoan = {
        id: entryId,
        employeeId: targetEmpId,
        employeeName: empObj?.name || '',
        employeeCode: empObj?.code || '',
        branchId: empObj?.branchId || '',
        type: entryType,
        loanType: entryType === 'loan' ? (loanRepayPlan === 'installment' ? 'installment' : 'monthly') : 'monthly',
        typeLabel: entryType === 'loan' ? (loanRepayPlan === 'installment' ? 'سلفة مقسطة معتمدة' : 'سلفة مالية معتمدة') : 'أدوية ومشتريات آجل معتمدة',
        amount: parsed,
        paidAmount: 0,
        monthsCount: months,
        monthlyDeduction: monthlyDeduction,
        status: 'approved',
        adminApproved: true,
        branchApproved: true,
        notes: notes.trim() || (entryType === 'loan' ? 'سلفة مالية مسجلة من الإدارة العليا' : 'مشتريات أدوية آجل'),
        reason: notes.trim() || (entryType === 'loan' ? 'سلفة مالية مسجلة من الإدارة العليا' : 'مشتريات أدوية آجل'),
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        paymentsHistory: []
      };

      const updatedLoans = [newLoan, ...(state.loans || [])];
      const updatedRequests = [newLoan, ...(state.requests || [])];
      const updatedState = { ...state, loans: updatedLoans, requests: updatedRequests };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.(`✅ تم تسجيل واعتماد ${entryType === 'loan' ? 'السلفة' : 'الأدوية الآجل'} للموظف ${empObj?.name} بنجاح!`);
      setAmount('');
      setNotes('');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveLoans',
        actionTitle: entryType === 'loan' ? 'صرف وتسجيل سلفة مالية' : 'صرف وتسجيل أدوية آجل',
        actionDetails: `الموظف: ${empObj?.name} - المبلغ: ${parsed} ج.م`,
        onExecute: performAddEntry
      });
    } else {
      await performAddEntry();
    }
  };

  // Form State for Payment Modal
  const [payingLoanId, setPayingLoanId] = useState(null);
  const [payInputAmount, setPayInputAmount] = useState('');
  const [payInputNotes, setPayInputNotes] = useState('');
  const [expandedPaymentsLoanId, setExpandedPaymentsLoanId] = useState(null);

  const handleRecordPayment = async (targetLoanId, payAmountStr, noteStr = '') => {
    const parsedPay = parseFloat(payAmountStr);
    if (!targetLoanId || !parsedPay || parsedPay <= 0) {
      showToast?.('يرجى إدخال مبلغ دفع صحيح أكبر من صفر');
      return;
    }

    const performRecordPayment = async () => {
      const payRecord = {
        id: 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        date: new Date().toISOString().slice(0, 10),
        amount: parsedPay,
        note: noteStr.trim() || 'سداد دفعة سلفة مالية/آجل',
        type: 'manual',
        createdAt: new Date().toISOString()
      };

      // Update in state.loans
      let loansArr = [...(state.loans || [])];
      let foundInLoans = false;
      loansArr = loansArr.map((l) => {
        if (String(l.id) === String(targetLoanId)) {
          foundInLoans = true;
          const total = parseFloat(l.amount) || 0;
          const newPaid = (parseFloat(l.paidAmount) || 0) + parsedPay;
          const history = [...(l.paymentsHistory || []), payRecord];
          return {
            ...l,
            paidAmount: newPaid,
            paymentsHistory: history,
            status: newPaid >= total ? 'paid' : 'partial',
            updatedAt: new Date().toISOString()
          };
        }
        return l;
      });

      // Update in state.requests
      let reqsArr = [...(state.requests || [])];
      let foundInRequests = false;
      reqsArr = reqsArr.map((r) => {
        if (String(r.id) === String(targetLoanId)) {
          foundInRequests = true;
          const total = parseFloat(r.amount) || 0;
          const newPaid = (parseFloat(r.paidAmount) || 0) + parsedPay;
          const history = [...(r.paymentsHistory || []), payRecord];
          return {
            ...r,
            paidAmount: newPaid,
            paymentsHistory: history,
            status: newPaid >= total ? 'paid' : 'partial',
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });

      // If item was an approved request not yet in state.loans, add it to state.loans
      if (!foundInLoans && foundInRequests) {
        const targetReq = reqsArr.find((r) => String(r.id) === String(targetLoanId));
        if (targetReq) {
          loansArr.unshift({
            ...targetReq,
            id: targetReq.id,
            employeeId: targetReq.employeeId,
            amount: parseFloat(targetReq.amount) || 0,
            paidAmount: parseFloat(targetReq.paidAmount) || 0,
            paymentsHistory: targetReq.paymentsHistory || [payRecord],
            status: (parseFloat(targetReq.paidAmount) || 0) >= (parseFloat(targetReq.amount) || 0) ? 'paid' : 'partial',
            updatedAt: new Date().toISOString()
          });
        }
      }

      const updatedState = { ...state, loans: loansArr, requests: reqsArr };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.(`✅ تم تسجيل سداد مبلغ ${parsedPay} ج.م بنجاح وتحديث مديونية الموظف!`);
      setPayingLoanId(null);
      setPayInputAmount('');
      setPayInputNotes('');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveLoans',
        actionTitle: 'تسجيل سداد دفعة سلفة/آجل',
        actionDetails: `المبلغ: ${parsedPay} ج.م`,
        onExecute: performRecordPayment
      });
    } else {
      await performRecordPayment();
    }
  };

  const handleAutoCloseMonthlyInstallments = async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const sDay = state.orgSettings?.payrollPayoutStartDay || 26;
    const eDay = state.orgSettings?.payrollPayoutEndDay || 25;
    const [y, m] = currentMonth.split('-').map(Number);
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(eDay).padStart(2, '0')}`;
    const startDate = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-${String(sDay).padStart(2, '0')}`;

    if (!window.confirm(`هل ترغب في تطبيق الخصم التلقائي لأقساط السلف في نهاية فترة الرواتب المحددة (${startDate} إلى ${endDate})؟`)) {
      return;
    }

    const performAutoClose = async () => {
      let processedCount = 0;
      let loansArr = [...(state.loans || [])];
      let reqsArr = [...(state.requests || [])];

      const processItem = (item) => {
        const total = parseFloat(item.amount || item.totalAmount) || 0;
        const paid = parseFloat(item.paidAmount) || 0;
        const rem = Math.max(0, total - paid);
        if (rem <= 0) return item;

        const history = item.paymentsHistory || item.payments || item.paidHistory || [];
        const alreadyPaidThisMonth = history.some((p) => p.month === currentMonth || p.date === endDate || p.note?.includes(currentMonth));
        if (alreadyPaidThisMonth) return item;

        const installmentVal = Math.min(rem, parseFloat(item.monthlyDeduction || item.installmentAmount) || rem);
        const roundedInstallment = Math.round(installmentVal * 100) / 100;
        const autoPayRecord = {
          id: `auto_pay_${currentMonth}_${item.id}_${Date.now()}`,
          month: currentMonth,
          date: endDate,
          amount: roundedInstallment,
          note: `خصم قسط شهري تلقائي في نهاية فترة الرواتب (${startDate} إلى ${endDate})`,
          type: 'auto_payroll'
        };

        processedCount++;
        const newPaid = Math.round((paid + roundedInstallment) * 100) / 100;
        return {
          ...item,
          paidAmount: newPaid,
          paymentsHistory: [...history, autoPayRecord],
          status: newPaid >= total ? 'paid' : 'partial'
        };
      };

      loansArr = loansArr.map(processItem);
      reqsArr = reqsArr.map((r) => {
        if (r.status === 'approved' || r.adminApproved || r.status === 'partial') {
          return processItem(r);
        }
        return r;
      });

      const updatedState = { ...state, loans: loansArr, requests: reqsArr };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      if (processedCount > 0) {
        showToast?.(`✅ تم خصم وتأكيد سداد الأقساط التلقائية لعدد ${processedCount} سلفة عن دورة ${currentMonth} (${endDate})!`);
      } else {
        showToast?.(`ℹ️ جميع الأقساط لسلف هذه الدورة (${currentMonth}) مخصومة ومسددة بالكامل مسبقاً.`);
      }
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockApproveLoans',
        actionTitle: 'الخصم التلقائي لأقساط السلف',
        actionDetails: `دورة الرواتب: ${currentMonth}`,
        onExecute: performAutoClose
      });
    } else {
      await performAutoClose();
    }
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            💳 إدارة السلف والأدوية الآجل للموظفين
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            متابعة إجمالي المبالغ الممنوحة كسلف وأدوية آجل ورصيد المتبقي وحالات السداد
          </p>
        </div>
      </div>

      {/* Top Banner Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>💰 إجمالي السلف الممنوحة للموظفين</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{totalLoansGiven.toLocaleString()} ج.م</h3>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>💊 إجمالي الأدوية الآجل المسجلة</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{totalMedsGiven.toLocaleString()} ج.م</h3>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>⚠️ إجمالي الرصيد المتبقي للتحصيل</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{totalRemaining.toLocaleString()} ج.م</h3>
        </div>
      </div>

      <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-start" onClick={handleAutoCloseMonthlyInstallments} style={{ background: '#0f766e', padding: '8px 16px', fontSize: '13.5px' }}>
          ⚡ تطبيق الخصم وسداد الأقساط الشهري التلقائي
        </button>
      </div>

      {/* ── Loan Application Rules & Thresholds ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
              💳 ضوابط وشروط تقديم السلف للموظفين
            </h4>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
              تحديد نافذة التقديم الشهرية، والنسبة القصوى للسلف الشهرية، ومضاعف الراتب المسموح به للسلف المقسطة.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-start"
            style={{ padding: '8px 20px', fontSize: '13.5px' }}
            onClick={handleSaveLoanSettings}
          >
            💾 حفظ وتطبيق الضوابط
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
          <div className="field">
            <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>📅 بداية فترة السلف الشهرية (يوم)</label>
            <input
              type="number"
              min="1"
              max="31"
              value={ruleStartDay}
              onChange={(e) => setRuleStartDay(e.target.value)}
              placeholder="1"
            />
            <small style={{ color: 'var(--muted)', fontSize: '11px' }}>يوم الشهر الذي يفتح فيه باب التقديم</small>
          </div>

          <div className="field">
            <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>📅 نهاية فترة السلف الشهرية (يوم)</label>
            <input
              type="number"
              min="1"
              max="31"
              value={ruleEndDay}
              onChange={(e) => setRuleEndDay(e.target.value)}
              placeholder="10"
            />
            <small style={{ color: 'var(--muted)', fontSize: '11px' }}>يوم الشهر الذي يغلق بعده التقديم</small>
          </div>

          <div className="field">
            <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>📊 نسبة السلفة الشهرية (% من الراتب الكامل)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={ruleMaxMonthlyPercent}
              onChange={(e) => setRuleMaxMonthlyPercent(e.target.value)}
              placeholder="50"
            />
            <small style={{ color: 'var(--muted)', fontSize: '11px' }}>نسبة من الراتب الشهري (سعر الساعة × ساعات العمل)</small>
          </div>

          <div className="field">
            <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>💰 الحد الأقصى للسلفة المقسطة (أضعاف الراتب)</label>
            <input
              type="number"
              min="1"
              max="20"
              step="0.5"
              value={ruleMaxInstallmentMultiplier}
              onChange={(e) => setRuleMaxInstallmentMultiplier(e.target.value)}
              placeholder="2"
            />
            <small style={{ color: 'var(--muted)', fontSize: '11px' }}>عدد أضعاف الراتب الشهري الكامل (مثال: 2 أو 3 أضعاف)</small>
          </div>
        </div>
      </div>

      {/* Add New Loan / Meds Entry */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
          ➕ إدراج سلفة أو مشتريات أدوية آجل لموظف
        </h4>
        <form onSubmit={handleAddEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div className="field">
            <label>اختر الموظف</label>
            <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)} required>
              <option value="">-- اختر الموظف --</option>
              {employees.filter(isEmployeeActive).map((e) => (
                <option key={e.id} value={e.id}>{getEmpDisplayName(e)} ({e.code})</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>نوع المديونية</label>
            <select value={entryType} onChange={(e) => setEntryType(e.target.value)} required>
              <option value="loan">💰 سلفة شخصية مادية</option>
              <option value="meds">💊 أدوية / مشتريات آجل</option>
            </select>
          </div>

          {entryType === 'loan' && (
            <>
              <div className="field">
                <label>نظام الخصم والسداد</label>
                <select value={loanRepayPlan} onChange={(e) => setLoanRepayPlan(e.target.value)}>
                  <option value="single">💵 سلفة شهرية (دفعة واحدة مع أقرب راتب)</option>
                  <option value="installment">📅 سلفة مقسطة على عدة شهور</option>
                </select>
              </div>

              {loanRepayPlan === 'installment' && (
                <div className="field">
                  <label>عدد شهور التقسيط</label>
                  <select value={loanMonthsCount} onChange={(e) => setLoanMonthsCount(e.target.value)}>
                    <option value="2">شهرين (2 شهور)</option>
                    <option value="3">3 شهور</option>
                    <option value="4">4 شهور</option>
                    <option value="5">5 شهور</option>
                    <option value="6">6 شهور</option>
                    <option value="10">10 شهور</option>
                    <option value="12">سنة كاملة (12 شهر)</option>
                  </select>
                </div>
              )}
            </>
          )}

          <div className="field">
            <label>المبلغ الإجمالي (ج.م)</label>
            <input type="number" min="1" placeholder="أدخل المبلغ..." value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>

          <div className="field">
            <label>ملاحظات البيان والسبب</label>
            <input type="text" placeholder="سبب السلفة أو أصناف الأدوية..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button type="submit" className="btn btn-start" style={{ padding: '8px 20px', fontSize: '14px' }}>
              💾 تسجيل واعتماد المديونية فوراً
            </button>
          </div>
        </form>
      </div>

      {/* Filter and Employee Cards */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>👥 سجل مديونيات الموظفين والسلف المسجلة</h4>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
          />
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <option value="">-- جميع الفروع --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>إجمالي السلف والأجل</th>
              <th>المبلغ المدفوع</th>
              <th>المتبقي للتحصيل</th>
              <th>الحالة</th>
              <th>التفاصيل والمعاينة</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const empBranch = branches.find((b) => b.id === emp.branchId);
                const empLoans = loansList.filter((l) => l.employeeId === emp.id);

                const totalEmpDebt = empLoans.reduce((a, l) => a + (parseFloat(l.amount) || 0), 0);
                const totalEmpPaid = empLoans.reduce((a, l) => a + (parseFloat(l.paidAmount) || 0), 0);
                const remaining = Math.max(0, totalEmpDebt - totalEmpPaid);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{empBranch?.name || 'المركز الرئيسي'}</td>
                    <td style={{ fontWeight: '800', color: '#0d9488' }}>{totalEmpDebt.toLocaleString()} ج.م</td>
                    <td style={{ color: '#16a34a', fontWeight: '700' }}>{totalEmpPaid.toLocaleString()} ج.م</td>
                    <td style={{ color: remaining > 0 ? '#dc2626' : '#16a34a', fontWeight: '900' }}>{remaining.toLocaleString()} ج.م</td>
                    <td>
                      {totalEmpDebt === 0 ? (
                        <span className="badge">لا توجد سلف</span>
                      ) : remaining === 0 ? (
                        <span className="badge badge-success">🟢 مسدد بالكامل</span>
                      ) : (
                        <span className="badge badge-danger">🔴 متبقي مستحق</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => setSelectedEmpModal(emp)}
                      >
                        👁️ عرض كشف السلف والأجل
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Employee Loans & Meds Detail Modal */}
      {selectedEmpModal && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '1150px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0d9488' }}>
                  💳 تفاصيل السلف والأدوية الآجل للموظف: {selectedEmpModal.name}
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>الكود: {selectedEmpModal.code}</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setSelectedEmpModal(null)}>✕ إغلاق</button>
            </div>

            {/* List of loans for this employee */}
            {loansList.filter((l) => l.employeeId === selectedEmpModal.id).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', background: 'var(--surface-muted)', borderRadius: '10px', color: 'var(--muted)' }}>
                لا توجد أي سلف أو أدوية آجل مسجلة لهذا الموظف.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="bylaws-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      <th>التاريخ</th>
                      <th>النوع</th>
                      <th>المبلغ الكلي</th>
                      <th>المدفوع</th>
                      <th>المتبقي</th>
                      <th>البيان والملاحظات</th>
                      <th>تسديد جزء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loansList
                      .filter((l) => l.employeeId === selectedEmpModal.id)
                      .map((l) => {
                        const total = parseFloat(l.amount) || 0;
                        const paid = parseFloat(l.paidAmount) || 0;
                        const rem = Math.max(0, total - paid);
                        const history = l.paymentsHistory || [];

                        return (
                          <React.Fragment key={l.id}>
                            <tr style={{ background: payingLoanId === l.id ? '#f0fdf4' : 'transparent' }}>
                              <td>{l.date || '—'}</td>
                              <td>
                                {l.type === 'meds' ? (
                                  <span className="badge badge-warning">💊 أدوية آجل</span>
                                ) : (
                                  <span className="badge badge-primary">💰 سلفة مادية</span>
                                )}
                              </td>
                              <td style={{ fontWeight: '800' }}>{fmt(total)} ج.م</td>
                              <td style={{ color: '#16a34a', fontWeight: 'bold' }}>{fmt(paid)} ج.م</td>
                              <td style={{ color: rem > 0 ? '#dc2626' : '#16a34a', fontWeight: '900' }}>{fmt(rem)} ج.م</td>
                              <td style={{ fontSize: '12px' }}>
                                <div>{l.notes || l.reason || '—'}</div>
                                {(l.medsItems || l.medicines || []).length > 0 && (
                                  <div style={{ marginTop: '6px', background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <div style={{ fontWeight: 'bold', color: '#0d9488', fontSize: '11px', marginBottom: '4px' }}>💊 تفاصيل الأصناف والأدوية:</div>
                                    {(l.medsItems || l.medicines).map((item, idx) => (
                                      <div key={idx} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                        <span>• {item.name || item.title} (كمية: {item.qty || 1})</span>
                                        <strong style={{ color: '#0f766e' }}>{fmt((parseFloat(item.price) || 0) * (parseFloat(item.qty) || 1))} ج.م</strong>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {rem > 0 && (
                                    <button
                                      className="btn btn-start"
                                      style={{ padding: '3px 8px', fontSize: '11.5px' }}
                                      onClick={() => {
                                        setPayingLoanId(payingLoanId === l.id ? null : l.id);
                                        setPayInputAmount(rem.toString());
                                      }}
                                    >
                                      💵 سداد مبلغ
                                    </button>
                                  )}
                                  <button
                                    className="btn btn-ghost"
                                    style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0f766e', fontWeight: 'bold' }}
                                    onClick={() => setExpandedPaymentsLoanId(expandedPaymentsLoanId === l.id ? null : l.id)}
                                  >
                                    📜 الدفعات ({history.length})
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Inline Payment Form */}
                            {payingLoanId === l.id && (
                              <tr>
                                <td colSpan="7" style={{ background: '#f0fdf4', padding: '12px 16px', border: '1px solid #86efac', borderRadius: '8px' }}>
                                  <div style={{ fontWeight: 'bold', color: '#166534', marginBottom: '8px', fontSize: '13px' }}>
                                    💵 إدخال دفعة جديدة لسداد السلفة (الرصيد المتبقي: {rem} ج.م)
                                  </div>
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                      type="number"
                                      step="0.01"
                                      max={rem}
                                      placeholder="مبلغ السداد (ج.م)"
                                      value={payInputAmount}
                                      onChange={(e) => setPayInputAmount(e.target.value)}
                                      style={{ width: '140px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                    <input
                                      type="text"
                                      placeholder="ملاحظات البيان..."
                                      value={payInputNotes}
                                      onChange={(e) => setPayInputNotes(e.target.value)}
                                      style={{ flex: 1, minWidth: '160px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                    <button
                                      className="btn btn-start"
                                      style={{ padding: '6px 14px', fontSize: '12.5px' }}
                                      onClick={() => handleRecordPayment(l.id, payInputAmount, payInputNotes)}
                                    >
                                      💾 تأكيد الحفظ والسداد
                                    </button>
                                    <button
                                      className="btn btn-ghost"
                                      style={{ padding: '6px 10px', fontSize: '12px' }}
                                      onClick={() => setPayingLoanId(null)}
                                    >
                                      إلغاء
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* Payment History Breakdown Table */}
                            {expandedPaymentsLoanId === l.id && (
                              <tr>
                                <td colSpan="7" style={{ background: '#f8fafc', padding: '12px 16px', border: '1px solid #cbd5e1' }}>
                                  <div style={{ fontWeight: 'bold', color: '#0f766e', marginBottom: '6px', fontSize: '12.5px' }}>
                                    📜 سجل الدفعات المسددة لهذه السلفة ({history.length} دفعة):
                                  </div>
                                  {history.length === 0 ? (
                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>لم يتم تسجيل أي دفعات مسددة لهذه السلفة بعد.</span>
                                  ) : (
                                    <table style={{ width: '100%', fontSize: '11.5px', background: '#fff', borderCollapse: 'collapse', textAlign: 'center' }}>
                                      <thead>
                                        <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                                          <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>#</th>
                                          <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>تاريخ الدفعة</th>
                                          <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>المبلغ المسدد</th>
                                          <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>نوع الدفعة والبيان</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {history.map((p, pIdx) => (
                                          <tr key={p.id || pIdx}>
                                            <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{pIdx + 1}</td>
                                            <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{p.date}</td>
                                            <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#16a34a', fontWeight: 'bold' }}>+{p.amount} ج.م</td>
                                            <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{p.note || (p.type === 'auto_payroll' ? 'خصم شهري آلي مع تقفيل الرواتب' : 'سداد مباشر')}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
