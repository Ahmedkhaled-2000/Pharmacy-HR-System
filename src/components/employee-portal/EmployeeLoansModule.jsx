import React, { useState } from 'react';
import { todayStr, fmt } from '../../utils/formatters';

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

  const employeeRequests = (state.requests || []).filter(
    (r) => r.employeeId === emp.id && (r.type === 'loan' || r.type === 'credit_medicine')
  );

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
      notes: medNotes.trim(),
      targetApproval: 'admin_only', // للإدارة العليا فقط
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newMedReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };

    setState(updatedState);
    if (saveState) await saveState(updatedState);

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
      <h4 style={{ margin: '20px 0 12px', fontSize: '15px' }}>📋 سجل الطلبات المالية السابقة</h4>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>نوع الطلب</th>
              <th>تفاصيل المبلغ / الأدوية</th>
              <th>نظام السداد</th>
              <th>مسار الاعتماد</th>
              <th>حالة الطلب</th>
              <th>ملاحظات</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {employeeRequests.length === 0 ? (
              <tr className="empty-row">
                <td colSpan="8">لا توجد طلبات سلف أو أدوية آجل مسجلة سابقاً</td>
              </tr>
            ) : (
              employeeRequests.map((r, idx) => (
                <tr key={r.id}>
                  <td>{idx + 1}</td>
                  <td>
                    {r.type === 'loan' ? (
                      <span className="badge info">💳 سلفة مالية ({r.loanType === 'installment' ? 'مقسمة' : 'شهرية'})</span>
                    ) : (
                      <span className="badge success">💊 أدوية بالآجل</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 'bold' }}>
                    {r.type === 'loan' ? (
                      `${fmt(r.amount)} ج.م`
                    ) : (
                      <div>
                        <div>إجمالي: {fmt(r.totalAmount)} ج.م</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'normal' }}>
                          {(r.medicines || []).map((m) => `${m.name} (${m.qty}×${m.price}ج.م)`).join('، ')}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    {r.type === 'loan' ? (
                      r.loanType === 'installment' ? `${fmt(r.monthlyDeduction)} ج.م × ${r.monthsCount} شهر` : 'تخصم بالكامل الشهر القادم'
                    ) : (
                      'خصم مباشر في المرتب'
                    )}
                  </td>
                  <td>
                    <span className="badge warning" style={{ fontSize: '11px' }}>🏢 الإدارة العليا فقط</span>
                  </td>
                  <td>
                    {r.status === 'approved' && <span className="badge success">✅ معتمد</span>}
                    {r.status === 'rejected' && <span className="badge danger">❌ مرفوض</span>}
                    {r.status === 'pending' && <span className="badge warning">⏳ قيد الانتظار</span>}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{r.reason || r.notes || '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                    {r.createdAt ? r.createdAt.slice(0, 10) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
