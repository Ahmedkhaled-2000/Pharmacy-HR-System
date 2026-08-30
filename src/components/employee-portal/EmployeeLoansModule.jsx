import React, { useState } from 'react';
import { fmt } from '../../utils/formatters';
import { getRealTodayStr } from '../../utils/timeEngine';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';

export default function EmployeeLoansModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedBranchId
}) {
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  React.useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [activeTab, setActiveTab] = useState('loans'); // 'loans' | 'medicines'
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showMedForm, setShowMedForm] = useState(false);

  // Loan Form State
  const [loanType, setLoanType] = useState('monthly'); // 'monthly' | 'installment'
  const [loanAmount, setLoanAmount] = useState('');
  const [monthsCount, setMonthsCount] = useState('2');
  const [loanReason, setLoanReason] = useState('');

  // Credit Medicine Form State
  const [medItems, setMedItems] = useState([
    { id: 'med_1', name: '', price: '', qty: '1' }
  ]);
  const [medNotes, setMedNotes] = useState('');
  const [medRepayPlan, setMedRepayPlan] = useState('monthly'); // 'monthly' | 'installment'
  const [medMonthsCount, setMedMonthsCount] = useState('2');

  const [viewingPaymentsReq, setViewingPaymentsReq] = useState(null);

  // Combine state.requests and state.loans for this employee
  const employeeRequests = React.useMemo(() => {
    const empIdStr = String(emp.id || '').trim();
    const empCodeStr = String(emp.code || '').trim();
    const isEmpMatch = (item) => {
      if (!item) return false;
      const itemId = String(item.employeeId || '').trim();
      return itemId === empIdStr || (empCodeStr && itemId === empCodeStr);
    };

    const reqs = (state.requests || []).filter(
      (r) => isEmpMatch(r) && (r.type === 'loan' || r.type === 'credit_medicine' || r.type === 'advance' || r.type === 'meds')
    );
    const directLoans = (state.loans || []).filter(isEmpMatch);

    const map = new Map();
    reqs.forEach((r) => {
      map.set(String(r.id), r);
    });
    directLoans.forEach((item) => {
      const existing = map.get(String(item.id));
      const history = (item?.paymentsHistory && item.paymentsHistory.length > 0) ? item.paymentsHistory : (existing?.paymentsHistory || existing?.payments || existing?.paidHistory || []);
      const paidVal = item?.paidAmount !== undefined ? item.paidAmount : (existing?.paidAmount || 0);
      map.set(String(item.id), {
        ...(existing || {}),
        ...item,
        paidAmount: parseFloat(paidVal) || 0,
        paymentsHistory: history
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      const getT = (r) => {
        if (!r) return 0;
        if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.timestamp) { const t = new Date(r.timestamp).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.updatedAt) { const t = new Date(r.updatedAt).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.date) { const t = new Date(r.date).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.startDate) { const t = new Date(r.startDate).getTime(); if (!isNaN(t) && t > 0) return t; }
        return 0;
      };
      return getT(b) - getT(a);
    });
  }, [state.requests, state.loans, emp.id]);

  // Handle Medicine Item Row Add/Remove/Update
  const handleAddMedRow = () => {
    setMedItems((prev) => [
      ...prev,
      { id: 'med_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), name: '', price: '', qty: '1' }
    ]);
  };

  const handleRemoveMedRow = (id) => {
    if (medItems.length === 1) return;
    setMedItems((prev) => prev.filter((m) => m.id !== id));
  };

  const handleMedChange = (id, field, value) => {
    setMedItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const calcMedTotal = () => {
    return medItems.reduce((acc, item) => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.qty, 10) || 1;
      return acc + price * qty;
    }, 0);
  };

  // Monthly & Installment Loan Rule Calculations from Settings
  const isMultiBranch = emp?.branchesDetails && emp.branchesDetails.length > 1;
  const [loanTargetBranchId, setLoanTargetBranchId] = useState(() => {
    if (selectedBranchId) return selectedBranchId;
    if (emp?.branchesDetails && emp.branchesDetails.length > 0) return emp.branchesDetails[0].branchId;
    return emp?.branchId || '';
  });

  const currentDay = new Date().getDate();
  const startDay = state.orgSettings?.loanRequestStartDay !== undefined ? parseInt(state.orgSettings.loanRequestStartDay, 10) : 1;
  const endDay = state.orgSettings?.loanRequestEndDay !== undefined ? parseInt(state.orgSettings.loanRequestEndDay, 10) : 10;
  
  const isWithinLoanWindow = (startDay <= endDay) 
    ? (currentDay >= startDay && currentDay <= endDay)
    : (currentDay >= startDay || currentDay <= endDay);

  // Full monthly salary calculation based on the selected target branch: (سعر الساعة للفرع × عدد ساعات العمل للفرع)
  const activeBranchDetail = (emp?.branchesDetails && emp.branchesDetails.length > 0)
    ? (emp.branchesDetails.find((bd) => String(bd.branchId) === String(loanTargetBranchId)) || emp.branchesDetails[0])
    : null;

  const hourlyRate = activeBranchDetail ? (parseFloat(activeBranchDetail.salary) || 0) : (parseFloat(emp?.salary) || 0);
  const workHours = activeBranchDetail ? (parseFloat(activeBranchDetail.workHoursPerDay) || 8) : (parseFloat(emp?.workHoursPerDay) || 8);
  const fullMonthlySalary = hourlyRate * workHours;

  const targetBranchObj = (state.branches || []).find((b) => String(b.id) === String(loanTargetBranchId || emp?.branchId));
  const branchNameDisplay = targetBranchObj ? targetBranchObj.name : (activeBranchDetail?.branchName || 'الفرع الرئيسي');

  const maxSalaryPercent = state.orgSettings?.maxMonthlyLoanSalaryPercent !== undefined ? parseFloat(state.orgSettings.maxMonthlyLoanSalaryPercent) : 50;
  const maxAllowedMonthlyLoan = Math.round((fullMonthlySalary * maxSalaryPercent) / 100);

  const maxInstallmentMultiplier = state.orgSettings?.maxInstallmentLoanSalaryMultiplier !== undefined ? parseFloat(state.orgSettings.maxInstallmentLoanSalaryMultiplier) : 2;
  const maxAllowedInstallmentLoan = Math.round(fullMonthlySalary * maxInstallmentMultiplier);

  // Submit Loan Request
  const handleSubmitLoan = async (e) => {
    e.preventDefault();

    if (!isWithinLoanWindow) {
      showToast(`⚠️ لا يمكن إرسال طلب سلفة الآن! فترة التقديم المسموح بها هي من يوم ${startDay} إلى يوم ${endDay} من كل شهر.`);
      return;
    }

    const amount = parseFloat(loanAmount);
    if (!amount || amount <= 0) {
      showToast('يرجى إدخال مبلغ سلفة صحيح');
      return;
    }

    if (loanType === 'monthly' && maxAllowedMonthlyLoan > 0 && amount > maxAllowedMonthlyLoan) {
      showToast(`⚠️ المبلغ المطلوب (${amount} ج.م) يتجاوز الحد الأقصى المسموح به للسلفة الشهرية (${maxAllowedMonthlyLoan} ج.م - نسبة ${maxSalaryPercent}% من الراتب الشهري للفرع ${fullMonthlySalary} ج.م). يرجى طلب مبلغ في حدود النسبة المسموحة.`);
      return;
    }

    if (loanType === 'installment' && maxAllowedInstallmentLoan > 0 && amount > maxAllowedInstallmentLoan) {
      showToast(`⚠️ المبلغ المطلوب (${amount} ج.م) يتجاوز الحد الأقصى المسموح به للسلفة المقسطة (${maxAllowedInstallmentLoan} ج.م - يمثل ${maxInstallmentMultiplier} أضعاف الراتب الشهري للفرع ${fullMonthlySalary} ج.م). يرجى طلب مبلغ في حدود الحد الأقصى.`);
      return;
    }

    const effectiveBranchId = loanTargetBranchId || selectedBranchId || emp.branchId;

    const newLoanReq = {
      id: 'loan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: effectiveBranchId,
      branchName: branchNameDisplay,
      hourlyRate,
      workHours,
      fullMonthlySalary,
      type: 'loan',
      loanType, // 'monthly' or 'installment'
      amount,
      monthsCount: loanType === 'installment' ? Math.max(2, parseInt(monthsCount, 10) || 2) : 1,
      monthlyDeduction: loanType === 'installment' ? Math.round((amount / (parseInt(monthsCount, 10) || 2)) * 100) / 100 : amount,
      reason: loanReason.trim() || 'طلب سلفة',
      details: loanReason.trim() || 'طلب سلفة',
      targetApproval: 'admin_only', // للإدارة العليا فقط
      status: 'pending',
      adminApproved: false,
      paidAmount: 0,
      paymentsHistory: [],
      date: getRealTodayStr(),
      createdAt: new Date().toISOString()
    };

    const newLoanNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      requestId: newLoanReq.id,
      type: 'loan',
      targetRole: 'admin',
      title: `💳 طلب سلفة مالية جديد: ${emp.name}`,
      message: `طلب سلفة مالية بقيمة ${parseFloat(loanAmount).toLocaleString()} ج.م - السبب: ${loanReason.trim() || 'طلب سلفة'}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: emp.branchId,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false
    };

    const updatedRequests = [newLoanReq, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      notifications: [newLoanNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    setShowLoanForm(false);
    setLoanAmount('');
    setLoanReason('');
    showToast('تم إرسال طلب السلفة إلى الإدارة العليا فقط 💳');

    // مزامنة خلفية فورية دون تأخير استجابة الزر
    if (saveState) {
      saveState(updatedState).catch((err) => {
        console.warn('[Loan] Background sync warning:', err);
      });
    }
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newLoanReq, empName: emp.name });
  };

  // Submit Credit Medicine Request
  const handleSubmitMed = async (e) => {
    e.preventDefault();
    const validItems = medItems.filter((i) => i.name.trim() && parseFloat(i.price) > 0);
    if (validItems.length === 0) {
      showToast('يرجى إضافة دواء واحد على الأقل مع الاسم والسعر الصحيح');
      return;
    }

    const totalCost = calcMedTotal();
    const allowCreditMedicineInstallments = state.orgSettings?.allowCreditMedicineInstallments !== false;
    const creditMedicineInstallmentMinAmount = state.orgSettings?.creditMedicineInstallmentMinAmount !== undefined ? parseFloat(state.orgSettings.creditMedicineInstallmentMinAmount) : 500;
    const isInstallment = allowCreditMedicineInstallments && medRepayPlan === 'installment' && totalCost >= creditMedicineInstallmentMinAmount;
    const months = isInstallment ? Math.max(2, parseInt(medMonthsCount, 10) || 2) : 1;
    const monthlyDeduction = isInstallment ? Math.round((totalCost / months) * 100) / 100 : totalCost;

    const newMedReq = {
      id: 'medreq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: selectedBranchId || emp.branchId,
      type: 'credit_medicine',
      loanType: isInstallment ? 'installment' : 'monthly',
      monthsCount: months,
      installmentsCount: months,
      monthlyDeduction,
      installmentAmount: monthlyDeduction,
      medicines: validItems,
      medsItems: validItems,
      totalAmount: totalCost,
      amount: totalCost,
      notes: medNotes.trim(),
      reason: medNotes.trim() || `طلب أدوية بالآجل (${validItems.length} صنف)`,
      details: medNotes.trim() || `طلب أدوية بالآجل (${validItems.length} صنف)`,
      targetApproval: 'admin_only', // للإدارة العليا فقط
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const newMedNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      requestId: newMedReq.id,
      type: 'credit_medicine',
      targetRole: 'admin',
      title: `💊 طلب أدوية آجل جديد: ${emp.name}`,
      message: `طلب أدوية بالآجل بإجمالي مبلغ ${totalCost.toLocaleString()} ج.م (${validItems.length} صنف)${isInstallment ? ` - مقسطة على ${months} شهور` : ''}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: selectedBranchId || emp.branchId,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false
    };

    const updatedRequests = [newMedReq, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      notifications: [newMedNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    setShowMedForm(false);
    setMedItems([{ id: 'med_1', name: '', price: '', qty: '1' }]);
    setMedNotes('');
    showToast('تم إرسال طلب الأدوية بالآجل إلى الإدارة العليا فقط 💊');

    // مزامنة خلفية فورية دون تأخير استجابة الزر
    if (saveState) {
      saveState(updatedState).catch((err) => {
        console.warn('[MedRequest] Background sync warning:', err);
      });
    }
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newMedReq, empName: emp.name });
  };

  return (
    <div className="card ep-tab-content fade-in">
      <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>💳</span>
          <div>
            <h3 style={{ margin: 0 }}>السلف والأدوية الآجل</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              طلب سلفة شهرية أو مقسمة وطلب أدوية بالآجل (موجهة للإدارة العليا فقط)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'loans' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('loans')}
          >
            💳 السلف المالية
          </button>
          <button
            className={`btn ${activeTab === 'medicines' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('medicines')}
          >
            💊 الأدوية بالآجل
          </button>
        </div>
      </div>

      {/* ── SubTab 1: Loans ── */}
      {activeTab === 'loans' && (
        <div style={{ marginTop: '16px' }}>
          {/* Loan Window Notice */}
          {!isWithinLoanWindow ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <strong style={{ color: '#991b1b', fontSize: '13.5px' }}>باب التقديم على السلف مغلق حالياً:</strong>
                <p style={{ margin: '2px 0 0', color: '#b91c1c', fontSize: '12.5px' }}>
                  فترة التقديم على السلف المسموح بها هي من يوم <strong>{startDay}</strong> إلى يوم <strong>{endDay}</strong> من كل شهر ميلادي (تاريخ اليوم: {currentDay} من الشهر).
                </p>
              </div>
            </div>
          ) : (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>🟢</span>
              <span style={{ color: '#166534', fontSize: '13px', fontWeight: 'bold' }}>
                باب التقديم على السلف مفتوح حالياً (من يوم {startDay} حتى يوم {endDay} من الشهر).
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '15px' }}>طلب سلفة مالية (شهرية / مقسمة)</h4>
            <button
              className={`btn ${isWithinLoanWindow ? 'btn-start' : 'btn-ghost'}`}
              onClick={() => {
                if (!isWithinLoanWindow) {
                  showToast(`⚠️ التقديم متاح فقط من يوم ${startDay} إلى يوم ${endDay} من كل شهر.`);
                  return;
                }
                setShowLoanForm(!showLoanForm);
              }}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              {showLoanForm ? '✕ إغلاق' : '+ طلب سلفة جديد'}
            </button>
          </div>

          {showLoanForm && (
            <form onSubmit={handleSubmitLoan} className="card settings-card fade-in" style={{ padding: '16px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', marginBottom: '20px' }}>
              <h5 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>💳 تقديم طلب سلفة جديد</h5>

              {loanType === 'monthly' ? (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#1e40af' }}>
                  💵 <strong>الحد الأقصى المسموح به للسلفة الشهرية {isMultiBranch ? `(لفرع ${branchNameDisplay})` : ''}:</strong>{' '}
                  <span style={{ color: '#1d4ed8', fontWeight: '900', fontSize: '14px' }}>{maxAllowedMonthlyLoan.toLocaleString()} ج.م</span>{' '}
                  (يمثل نسبة {maxSalaryPercent}% من راتبك الشهري للفرع {fullMonthlySalary.toLocaleString()} ج.م [سعر الساعة {hourlyRate} ج.م × {workHours} س]). يمكنك طلب هذا المبلغ أو أقل.
                </div>
              ) : (
                <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#0f766e' }}>
                  💰 <strong>الحد الأقصى المسموح به للسلفة المقسطة {isMultiBranch ? `(لفرع ${branchNameDisplay})` : ''}:</strong>{' '}
                  <span style={{ color: '#0d9488', fontWeight: '900', fontSize: '14px' }}>{maxAllowedInstallmentLoan.toLocaleString()} ج.م</span>{' '}
                  (يمثل {maxInstallmentMultiplier} أضعاف راتبك الشهري للفرع {fullMonthlySalary.toLocaleString()} ج.م). يمكنك طلب هذا المبلغ أو أقل.
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {isMultiBranch && (
                  <div className="field" style={{ flex: '1 1 200px' }}>
                    <label style={{ fontWeight: '700' }}>📍 الفرع المعني بطلب السلفة</label>
                    <select
                      value={loanTargetBranchId}
                      onChange={(e) => setLoanTargetBranchId(e.target.value)}
                      style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}
                    >
                      {emp.branchesDetails.map((bd) => {
                        const brObj = (state.branches || []).find((b) => String(b.id) === String(bd.branchId));
                        const bName = brObj ? brObj.name : (bd.branchName || `فرع ${bd.branchId}`);
                        const bRate = parseFloat(bd.salary) || 0;
                        const bHours = parseFloat(bd.workHoursPerDay) || 8;
                        return (
                          <option key={bd.branchId} value={bd.branchId}>
                            {bName} (سعر الساعة: {bRate} ج.م | {bHours} س)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div className="field" style={{ flex: '1 1 180px' }}>
                  <label style={{ fontWeight: '700' }}>نظام السلفة</label>
                  <select value={loanType} onChange={(e) => setLoanType(e.target.value)}>
                    <option value="monthly">⚡ سلفة شهرية (تخصم بالكامل الشهر القادم)</option>
                    <option value="installment">📅 سلفة مقسمة (تخصم على أقساط شهرية)</option>
                  </select>
                </div>

                <div className="field" style={{ flex: '1 1 140px' }}>
                  <label style={{ fontWeight: '700' }}>مبلغ السلفة المطلوبة (ج.م)</label>
                  <input
                    type="number"
                    min="50"
                    max={loanType === 'monthly' ? (maxAllowedMonthlyLoan > 0 ? maxAllowedMonthlyLoan : undefined) : (maxAllowedInstallmentLoan > 0 ? maxAllowedInstallmentLoan : undefined)}
                    step="50"
                    placeholder={`مثال: ${loanType === 'monthly' && maxAllowedMonthlyLoan > 0 ? Math.min(1000, maxAllowedMonthlyLoan) : 1000}`}
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    required
                  />
                </div>

                {loanType === 'installment' && (
                  <div className="field" style={{ flex: '1 1 140px' }}>
                    <label style={{ fontWeight: '700' }}>عدد شهور التقسيط</label>
                    <select value={monthsCount} onChange={(e) => setMonthsCount(e.target.value)}>
                      <option value="2">2 شهر (نصف المبلغ شهرياً)</option>
                      <option value="3">3 شهور</option>
                      <option value="4">4 شهور</option>
                      <option value="5">5 شهور</option>
                      <option value="6">6 شهور</option>
                    </select>
                  </div>
                )}
              </div>

              {loanType === 'installment' && parseFloat(loanAmount) > 0 && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--primary)', fontWeight: '700' }}>
                  💡 القسط الشهرى المحسوب: {fmt(parseFloat(loanAmount) / parseInt(monthsCount, 10))} ج.م / شهر لمده {monthsCount} أشهر.
                </div>
              )}

              <div className="field" style={{ marginTop: '10px' }}>
                <label style={{ fontWeight: '700' }}>السبب / ملاحظات</label>
                <input
                  type="text"
                  placeholder="سبب طلب السلفة..."
                  value={loanReason}
                  onChange={(e) => setLoanReason(e.target.value)}
                />
              </div>

              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)', background: 'rgba(59,130,246,0.08)', padding: '8px 12px', borderRadius: '6px' }}>
                🏢 يتم إرسال طلبات السلف إلى <strong>الإدارة العليا فقط</strong> للاعتماد المالي.
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowLoanForm(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start">💾 إرسال طلب السلفة</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── SubTab 2: Deferred Medicines ── */}
      {activeTab === 'medicines' && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '15px' }}>طلب أدوية بنظام الأجل (خصم من الراتب)</h4>
            <button className="btn btn-start" onClick={() => setShowMedForm(!showMedForm)} style={{ fontSize: '13px', padding: '6px 14px' }}>
              {showMedForm ? '✕ إغلاق' : '+ طلب أدوية جديد'}
            </button>
          </div>

          {showMedForm && (
            <form onSubmit={handleSubmitMed} className="card settings-card fade-in" style={{ padding: '16px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', marginBottom: '20px' }}>
              <h5 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>💊 إضافة أدوية بالآجل</h5>

              {medItems.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 'bold', width: '24px', fontSize: '13px' }}>#{idx + 1}</div>
                  <input
                    type="text"
                    placeholder="اسم الدواء..."
                    value={item.name}
                    onChange={(e) => handleMedChange(item.id, 'name', e.target.value)}
                    style={{ flex: '2 1 180px' }}
                    required
                  />
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    placeholder="السعر (ج.م)"
                    value={item.price}
                    onChange={(e) => handleMedChange(item.id, 'price', e.target.value)}
                    style={{ flex: '1 1 100px' }}
                    required
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="الكمية"
                    value={item.qty}
                    onChange={(e) => handleMedChange(item.id, 'qty', e.target.value)}
                    style={{ flex: '1 1 70px' }}
                    required
                  />
                  <div style={{ fontWeight: 'bold', minWidth: '80px', fontSize: '13px', color: 'var(--success)' }}>
                    {fmt((parseFloat(item.price) || 0) * (parseInt(item.qty, 10) || 1))} ج.م
                  </div>
                  {medItems.length > 1 && (
                    <button type="button" className="btn btn-ghost" onClick={() => handleRemoveMedRow(item.id)} style={{ color: 'var(--danger)', padding: '4px 8px' }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <button type="button" className="btn btn-ghost" onClick={handleAddMedRow} style={{ fontSize: '12.5px', marginTop: '4px' }}>
                + إضافة دواء آخر للطلب
              </button>

              {(() => {
                const totalCost = calcMedTotal();
                const allowCreditMedicineInstallments = state.orgSettings?.allowCreditMedicineInstallments !== false;
                const creditMedicineInstallmentMinAmount = state.orgSettings?.creditMedicineInstallmentMinAmount !== undefined ? parseFloat(state.orgSettings.creditMedicineInstallmentMinAmount) : 500;
                const creditMedicineMaxInstallments = state.orgSettings?.creditMedicineMaxInstallments !== undefined ? parseInt(state.orgSettings.creditMedicineMaxInstallments, 10) : 6;
                const canInstallment = allowCreditMedicineInstallments && totalCost >= creditMedicineInstallmentMinAmount;

                return (
                  <>
                    <div style={{ marginTop: '14px', padding: '12px 16px', borderRadius: '10px', background: '#f0fdfa', border: '1.5px solid #0d9488', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: '800', color: '#0f766e', fontSize: '14px' }}>الإجمالي الكلي للأدوية:</span>
                        <div style={{ fontSize: '11px', color: '#134e4a' }}>عدد الأصناف: {medItems.filter(i => i.name.trim()).length} صنف</div>
                      </div>
                      <span style={{ fontSize: '20px', fontWeight: '900', color: '#0d9488' }}>{fmt(totalCost)} ج.م</span>
                    </div>

                    {/* Credit Medicine Installment Selector */}
                    {canInstallment ? (
                      <div style={{ marginTop: '14px', background: '#fff', border: '1.5px solid #3b82f6', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 6px rgba(59,130,246,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontWeight: 'bold', color: '#1d4ed8', fontSize: '13.5px' }}>
                          <span>🎉</span>
                          <span>متاح لك خيار تقسيط ثمن الأدوية على دفعات شهرية!</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
                          <div className="field">
                            <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>طريقة سداد وخصم الأدوية</label>
                            <select value={medRepayPlan} onChange={(e) => setMedRepayPlan(e.target.value)}>
                              <option value="monthly">💵 خصم دفعة واحدة (مع أقرب راتب)</option>
                              <option value="installment">📅 تقسيط على عدة شهور</option>
                            </select>
                          </div>

                          {medRepayPlan === 'installment' && (
                            <div className="field">
                              <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>عدد شهور التقسيط</label>
                              <select value={medMonthsCount} onChange={(e) => setMedMonthsCount(e.target.value)}>
                                {Array.from({ length: Math.max(1, creditMedicineMaxInstallments - 1) }, (_, i) => i + 2).map((m) => (
                                  <option key={m} value={m}>{m} شهور ({fmt(Math.round((totalCost / m) * 100) / 100)} ج.م / شهر)</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {medRepayPlan === 'installment' && (
                          <div style={{ marginTop: '10px', padding: '8px 12px', background: '#dbeafe', borderRadius: '6px', fontSize: '12.5px', color: '#1e40af', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                            <span>القسط الشهري المستحق:</span>
                            <span>{fmt(Math.round((totalCost / (parseInt(medMonthsCount, 10) || 2)) * 100) / 100)} ج.م / شهر</span>
                          </div>
                        )}
                      </div>
                    ) : allowCreditMedicineInstallments ? (
                      <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#64748b', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                        💡 ملاحظة: خيار التقسيط متاح تلقائياً لمشتريات الأدوية من <strong>{creditMedicineInstallmentMinAmount} ج.م</strong> فأكثر وفق ضوابط الإدارة العليا (سيتم خصم طلبك دفعة واحدة مع أقرب مرتب).
                      </div>
                    ) : (
                      <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#64748b', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                        🔒 تقسيط الأدوية غير مفعل حالياً من الإدارة العليا (سيتم خصم كامل المبلغ دفعة واحدة مع أقرب مرتب).
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="field" style={{ marginTop: '12px' }}>
                <label style={{ fontWeight: '700' }}>ملاحظات إضافية على الطلب</label>
                <input
                  type="text"
                  placeholder="ملاحظات للطلب..."
                  value={medNotes}
                  onChange={(e) => setMedNotes(e.target.value)}
                />
              </div>

              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)', background: 'rgba(59,130,246,0.08)', padding: '8px 12px', borderRadius: '6px' }}>
                🏢 يتم إرسال طلبات الأدوية الآجل إلى <strong>الإدارة العليا فقط</strong> للاعتماد المالي.
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowMedForm(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start">💾 إرسال طلب الأدوية</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Table of Loan & Medicine Requests ── */}
      <h4 style={{ margin: '20px 0 12px', fontSize: '15px' }}>📋 سجل السلف والأدوية الآجل المسجلة للدفع والتحصيل</h4>
      {isMobileScreen ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {employeeRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              لا توجد طلبات سلف أو أدوية آجل مسجلة سابقاً
            </div>
          ) : (
            employeeRequests.map((r, idx) => {
              const total = parseFloat(r.amount || r.totalAmount) || 0;
              const paid = parseFloat(r.paidAmount) || 0;
              const rem = Math.max(0, total - paid);
              const history = r.paymentsHistory || [];
              const isLoan = r.type === 'loan' || r.type === 'advance';
              const isMeds = r.type === 'meds' || r.type === 'credit_medicine';
              const medsList = r.medicines || r.medsItems || r.items || [];

              return (
                <div
                  key={r.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--muted)' }}>#{idx + 1}</span>
                      {isLoan ? (
                        <span className="badge info" style={{ fontSize: '11.5px' }}>💳 سلفة ({r.loanType === 'installment' ? `${r.monthsCount || 2} أقساط` : 'شهرية'})</span>
                      ) : (
                        <span className="badge success" style={{ fontSize: '11.5px' }}>💊 أدوية آجل ({r.loanType === 'installment' ? `${r.monthsCount || 2} أقساط` : 'شهرية'})</span>
                      )}
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                      {r.createdAt ? r.createdAt.slice(0, 10) : (r.date || '—')}
                    </span>
                  </div>

                  {/* 3 Stats Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--surface-muted)', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>المبلغ الكلي</span>
                      <strong style={{ fontSize: '13px', color: 'var(--text)' }}>{fmt(total)} ج.م</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#16a34a', display: 'block' }}>المدفوع</span>
                      <strong style={{ fontSize: '13px', color: '#16a34a' }}>{fmt(paid)} ج.م</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: rem > 0 ? '#dc2626' : '#16a34a', display: 'block' }}>المتبقي</span>
                      <strong style={{ fontSize: '13px', color: rem > 0 ? '#dc2626' : '#16a34a', fontWeight: 900 }}>{fmt(rem)} ج.م</strong>
                    </div>
                  </div>

                  {/* Medicines Preview Items for credit meds */}
                  {isMeds && medsList.length > 0 && (
                    <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', padding: '8px 10px', borderRadius: '8px', fontSize: '11.5px' }}>
                      <div style={{ fontWeight: 'bold', color: '#0f766e', marginBottom: '3px' }}>💊 الأصناف المطلوبة ({medsList.length} صنف):</div>
                      {medsList.map((m, mIdx) => (
                        <div key={m.id || mIdx} style={{ display: 'flex', justifyContent: 'space-between', color: '#134e4a', padding: '1px 0' }}>
                          <span>• {m.name} (كمية: {m.qty || 1})</span>
                          <strong>{fmt((parseFloat(m.price) || 0) * (parseFloat(m.qty) || 1))} ج.م</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Status and Action */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
                    <div>
                      {(r.status === 'approved' || r.adminApproved) && rem > 0 && <span className="badge warning" style={{ fontSize: '11px' }}>⏳ جاري سداد الأقساط</span>}
                      {(r.status === 'approved' || r.adminApproved) && rem === 0 && <span className="badge success" style={{ fontSize: '11px' }}>✅ مسددة بالكامل</span>}
                      {r.status === 'rejected' && <span className="badge danger" style={{ fontSize: '11px' }}>❌ مرفوضة</span>}
                      {(r.status === 'pending' || r.status === 'pending_admin' || !r.status) && (
                        <span className="badge warning" style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', fontWeight: 'bold' }}>
                          ⏳ قيد مراجعة الإدارة
                        </span>
                      )}
                    </div>

                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 10px', fontSize: '12px', color: '#0f766e', fontWeight: 'bold', background: 'var(--primary-tint)' }}
                      onClick={() => setViewingPaymentsReq(r)}
                    >
                      📜 تفاصيل الدفعات والأصناف ({history.length})
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="bylaws-table">
            <thead>
              <tr style={{ background: 'var(--surface-muted)' }}>
                <th>#</th>
                <th>نوع الطلب والأصناف</th>
                <th>المبلغ الكلي</th>
                <th>المدفوع</th>
                <th>المتبقي للسداد</th>
                <th>حالة الاعتماد والسداد</th>
                <th>تفاصيل الدفعات والأصناف</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {employeeRequests.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan="8">لا توجد طلبات سلف أو أدوية آجل مسجلة سابقاً</td>
                </tr>
              ) : (
                employeeRequests.map((r, idx) => {
                  const total = parseFloat(r.amount || r.totalAmount) || 0;
                  const paid = parseFloat(r.paidAmount) || 0;
                  const rem = Math.max(0, total - paid);
                  const history = r.paymentsHistory || [];
                  const isMeds = r.type === 'meds' || r.type === 'credit_medicine';
                  const medsList = r.medicines || r.medsItems || r.items || [];

                  return (
                    <tr key={r.id}>
                      <td>{idx + 1}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r.type === 'loan' || r.type === 'advance' ? (
                          <span className="badge info">💳 سلفة مالية ({r.loanType === 'installment' ? `${r.monthsCount || 2} أقساط` : 'شهرية'})</span>
                        ) : (
                          <div>
                            <span className="badge success">💊 أدوية بالآجل ({r.loanType === 'installment' ? `${r.monthsCount || 2} أقساط` : 'شهرية'})</span>
                            {medsList.length > 0 && (
                              <div style={{ fontSize: '11px', color: '#0f766e', marginTop: '2px' }}>
                                {medsList.map(m => m.name).join('، ')}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: '800' }}>{fmt(total)} ج.م</td>
                      <td style={{ color: '#16a34a', fontWeight: 'bold' }}>{fmt(paid)} ج.م</td>
                      <td style={{ color: rem > 0 ? '#dc2626' : '#16a34a', fontWeight: '900' }}>{fmt(rem)} ج.م</td>
                      <td>
                        {(r.status === 'approved' || r.adminApproved) && rem > 0 && <span className="badge warning">⏳ جاري سداد الأقساط</span>}
                        {(r.status === 'approved' || r.adminApproved) && rem === 0 && <span className="badge success">✅ مسددة بالكامل</span>}
                        {r.status === 'rejected' && <span className="badge danger">❌ مرفوضة</span>}
                        {(r.status === 'pending' || r.status === 'pending_admin' || !r.status) && (
                          <span className="badge warning" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 'bold' }}>
                            ⏳ قيد مراجعة الإدارة
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0f766e', fontWeight: 'bold' }}
                          onClick={() => setViewingPaymentsReq(r)}
                        >
                          📜 عرض الأصناف والدفعات ({history.length})
                        </button>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                        {r.createdAt ? r.createdAt.slice(0, 10) : (r.date || '—')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee Payments & Medicine Details Modal */}
      {viewingPaymentsReq && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '950px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0d9488', fontSize: '16px' }}>
                  📜 تفاصيل {viewingPaymentsReq.type === 'credit_medicine' || viewingPaymentsReq.type === 'meds' ? 'طلب الأدوية الآجل' : 'السلفة المالية'}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  إجمالي المبلغ: {fmt(parseFloat(viewingPaymentsReq.amount || viewingPaymentsReq.totalAmount) || 0)} ج.م · المتبقي للسداد: {fmt(Math.max(0, (parseFloat(viewingPaymentsReq.amount || viewingPaymentsReq.totalAmount) || 0) - (parseFloat(viewingPaymentsReq.paidAmount) || 0)))} ج.م
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setViewingPaymentsReq(null)}>✕ إغلاق</button>
            </div>

            {/* If Credit Medicine, Render Table of Medicines */}
            {(viewingPaymentsReq.medicines || viewingPaymentsReq.medsItems || []).length > 0 && (
              <div style={{ marginBottom: '20px', background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: '10px', padding: '12px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#0f766e', fontSize: '13.5px', fontWeight: 'bold' }}>
                  💊 قائمة الأصناف والأدوية المطلوبة:
                </h4>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center', background: '#fff' }}>
                    <thead>
                      <tr style={{ background: '#ccfbf1', color: '#134e4a', fontWeight: 'bold' }}>
                        <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '6%' }}>#</th>
                        <th style={{ padding: '6px 12px', border: '1px solid #99f6e4', width: '44%', textAlign: 'right' }}>اسم الدواء / الصنف</th>
                        <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '16%' }}>سعر الوحدة</th>
                        <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '14%' }}>الكمية</th>
                        <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '20%' }}>الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingPaymentsReq.medicines || viewingPaymentsReq.medsItems).map((m, mIdx) => {
                        const pr = parseFloat(m.price) || 0;
                        const qt = parseFloat(m.qty) || 1;
                        return (
                          <tr key={m.id || mIdx}>
                            <td style={{ padding: '6px', border: '1px solid #99f6e4' }}>{mIdx + 1}</td>
                            <td style={{ padding: '6px 12px', border: '1px solid #99f6e4', textAlign: 'right', fontWeight: 'bold', color: '#0f766e' }}>
                              {m.name || 'صنف دواء'}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #99f6e4' }}>{fmt(pr)} ج.م</td>
                            <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: 'bold' }}>{qt}</td>
                            <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: 'bold', color: '#0d9488' }}>
                              {fmt(pr * qt)} ج.م
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payments History Table */}
            <h4 style={{ margin: '0 0 8px', color: '#334155', fontSize: '13px', fontWeight: 'bold' }}>
              💳 سجل الدفعات والخصومات المسددة:
            </h4>
            {(!viewingPaymentsReq.paymentsHistory || viewingPaymentsReq.paymentsHistory.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '20px', background: 'var(--surface-muted)', borderRadius: '10px', color: 'var(--muted)', fontSize: '13px' }}>
                لم يتم خصم أو تسديد أي دفعات مالية لهذه السلفة بعد.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="bylaws-table" style={{ fontSize: '12px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      <th>#</th>
                      <th>تاريخ الدفعة</th>
                      <th>المبلغ المسدد</th>
                      <th>البيان ونوع السداد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingPaymentsReq.paymentsHistory.map((p, pIdx) => (
                      <tr key={p.id || pIdx}>
                        <td>{pIdx + 1}</td>
                        <td style={{ fontWeight: 'bold' }}>{p.date}</td>
                        <td style={{ color: '#16a34a', fontWeight: 'bold' }}>+{fmt(p.amount)} ج.م</td>
                        <td>{p.note || (p.type === 'auto_payroll' ? 'خصم شهري آلي مع الرواتب' : 'سداد مباشر')}</td>
                      </tr>
                    ))}
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
