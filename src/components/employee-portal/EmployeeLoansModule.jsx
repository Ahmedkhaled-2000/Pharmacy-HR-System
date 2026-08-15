import React, { useState } from 'react';
import { todayStr, fmt } from '../../utils/formatters';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';

export default function EmployeeLoansModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedBranchId
}) {
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

  const [viewingPaymentsReq, setViewingPaymentsReq] = useState(null);

  // Combine state.requests and state.loans for this employee
  const employeeRequests = React.useMemo(() => {
    const reqs = (state.requests || []).filter(
      (r) => String(r.employeeId) === String(emp.id) && (r.type === 'loan' || r.type === 'credit_medicine' || r.type === 'advance' || r.type === 'meds')
    );
    const directLoans = (state.loans || []).filter((l) => String(l.employeeId) === String(emp.id));

    const map = new Map();
    directLoans.forEach((item) => {
      map.set(item.id, item);
    });
    reqs.forEach((r) => {
      const direct = map.get(r.id);
      const history = (direct?.paymentsHistory && direct.paymentsHistory.length > 0) ? direct.paymentsHistory : (r.paymentsHistory || r.payments || r.paidHistory || []);
      const paidVal = direct?.paidAmount !== undefined ? direct.paidAmount : (r.paidAmount || 0);
      map.set(r.id, {
        ...r,
        paidAmount: parseFloat(paidVal) || 0,
        paymentsHistory: history
      });
    });
    return Array.from(map.values());
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

  // Submit Loan Request
  const handleSubmitLoan = async (e) => {
    e.preventDefault();
    const amount = parseFloat(loanAmount);
    if (!amount || amount <= 0) {
      showToast('يرجى إدخال مبلغ سلفة صحيح');
      return;
    }

    const newLoanReq = {
      id: 'loan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: selectedBranchId || emp.branchId,
      type: 'loan',
      loanType, // 'monthly' or 'installment'
      amount,
      monthsCount: loanType === 'installment' ? Math.max(2, parseInt(monthsCount, 10) || 2) : 1,
      monthlyDeduction: loanType === 'installment' ? Math.round((amount / (parseInt(monthsCount, 10) || 2)) * 100) / 100 : amount,
      reason: loanReason.trim(),
      targetApproval: 'admin_only', // للإدارة العليا فقط
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newLoanReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newLoanReq, empName: emp.name });

    setShowLoanForm(false);
    setLoanAmount('');
    setLoanReason('');
    showToast('تم إرسال طلب السلفة إلى الإدارة العليا فقط 💳');
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
    const newMedReq = {
      id: 'medreq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: selectedBranchId || emp.branchId,
      type: 'credit_medicine',
      medicines: validItems,
      totalAmount: totalCost,
      amount: totalCost,
      notes: medNotes.trim(),
      targetApproval: 'admin_only', // للإدارة العليا فقط
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newMedReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newMedReq, empName: emp.name });

    setShowMedForm(false);
    setMedItems([{ id: 'med_1', name: '', price: '', qty: '1' }]);
    setMedNotes('');
    showToast('تم إرسال طلب الأدوية بالآجل إلى الإدارة العليا فقط 💊');
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '15px' }}>طلب سلفة مالية (شهرية / مقسمة)</h4>
            <button className="btn btn-start" onClick={() => setShowLoanForm(!showLoanForm)} style={{ fontSize: '13px', padding: '6px 14px' }}>
              {showLoanForm ? '✕ إغلاق' : '+ طلب سلفة جديد'}
            </button>
          </div>

          {showLoanForm && (
            <form onSubmit={handleSubmitLoan} className="card settings-card fade-in" style={{ padding: '16px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', marginBottom: '20px' }}>
              <h5 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>💳 تقديم طلب سلفة جديد</h5>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
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
                    step="50"
                    placeholder="مثال: 1000"
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

              <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700' }}>الإجمالي الكلي للأدوية:</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary)' }}>{fmt(calcMedTotal())} ج.م</span>
              </div>

              <div className="field" style={{ marginTop: '10px' }}>
                <label style={{ fontWeight: '700' }}>ملاحظات أضافية</label>
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
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr style={{ background: 'var(--surface-muted)' }}>
              <th>#</th>
              <th>نوع الطلب</th>
              <th>المبلغ الكلي</th>
              <th>المدفوع</th>
              <th>المتبقي للسداد</th>
              <th>حالة الاعتماد والسداد</th>
              <th>تفاصيل الدفعات المسددة</th>
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

                return (
                  <tr key={r.id}>
                    <td>{idx + 1}</td>
                    <td>
                      {r.type === 'loan' || r.type === 'advance' ? (
                        <span className="badge info">💳 سلفة مالية ({r.loanType === 'installment' ? 'مقسمة' : 'شهرية'})</span>
                      ) : (
                        <span className="badge success">💊 أدوية بالآجل</span>
                      )}
                    </td>
                    <td style={{ fontWeight: '800' }}>{fmt(total)} ج.م</td>
                    <td style={{ color: '#16a34a', fontWeight: 'bold' }}>{fmt(paid)} ج.م</td>
                    <td style={{ color: rem > 0 ? '#dc2626' : '#16a34a', fontWeight: '900' }}>{fmt(rem)} ج.م</td>
                    <td>
                      {(r.status === 'approved' || r.adminApproved) && rem > 0 && <span className="badge warning">⏳ جاري سداد الأقساط</span>}
                      {(r.status === 'approved' || r.adminApproved) && rem === 0 && <span className="badge success">✅ مسددة بالكامل</span>}
                      {r.status === 'rejected' && <span className="badge danger">❌ مرفوضة</span>}
                      {r.status === 'pending' && <span className="badge warning">⏳ قيد الانتظار</span>}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0f766e', fontWeight: 'bold' }}
                        onClick={() => setViewingPaymentsReq(r)}
                      >
                        📜 كشف الدفعات ({history.length})
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

      {/* Employee Payments Detail Modal */}
      {viewingPaymentsReq && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '600px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#0d9488', fontSize: '16px' }}>
                📜 كشف وتفاصيل الدفعات المسددة للسلفة (المتبقي: {fmt(Math.max(0, (parseFloat(viewingPaymentsReq.amount || viewingPaymentsReq.totalAmount) || 0) - (parseFloat(viewingPaymentsReq.paidAmount) || 0)))} ج.م)
              </h3>
              <button className="btn btn-ghost" onClick={() => setViewingPaymentsReq(null)}>✕ إغلاق</button>
            </div>

            {(!viewingPaymentsReq.paymentsHistory || viewingPaymentsReq.paymentsHistory.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '24px', background: 'var(--surface-muted)', borderRadius: '10px', color: 'var(--muted)', fontSize: '13.5px' }}>
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
