import React, { useState } from 'react';

export default function LoansMedsModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [selectedEmpModal, setSelectedEmpModal] = useState(null);
  const [filterBranch, setFilterBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for Adding New Loan/Meds Debt
  const [targetEmpId, setTargetEmpId] = useState('');
  const [entryType, setEntryType] = useState('loan'); // 'loan' | 'meds'
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const employees = state.employees || [];
  const branches = state.branches || [];
  const loansList = state.loans || [];

  const filteredEmployees = employees.filter((emp) => {
    if (filterBranch && emp.branchId !== filterBranch) return false;
    if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase()) && !emp.code.includes(searchQuery)) return false;
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

    const newLoan = {
      id: `loan_${Date.now()}`,
      employeeId: targetEmpId,
      employeeName: empObj?.name || '',
      employeeCode: empObj?.code || '',
      type: entryType,
      typeLabel: entryType === 'loan' ? 'سلفة مالية شخصية' : 'أدوية ومشتريات آجل',
      amount: parsed,
      paidAmount: 0,
      status: 'pending',
      notes: notes.trim(),
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };

    const updatedLoans = [newLoan, ...loansList];
    const updatedState = { ...state, loans: updatedLoans };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast?.('✅ تم إضافة المعاملة بنجاح وتحديث مديونية الموظف!');
    setAmount('');
    setNotes('');
  };

  const handleRecordPayment = async (loanId, payAmount) => {
    const parsedPay = parseFloat(payAmount);
    if (!parsedPay || parsedPay <= 0) return;

    const updatedLoans = loansList.map((l) => {
      if (l.id === loanId) {
        const newPaid = (parseFloat(l.paidAmount) || 0) + parsedPay;
        const total = parseFloat(l.amount) || 0;
        return {
          ...l,
          paidAmount: newPaid,
          status: newPaid >= total ? 'paid' : 'partial'
        };
      }
      return l;
    });

    const updatedState = { ...state, loans: updatedLoans };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم تسجيل مبلغ الدفع وتحديث مديونية الموظف');
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

      {/* Add New Loan / Meds Entry */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
          ➕ إدراج سلفة أو مشتريات أدوية آجل لموظف
        </h4>
        <form onSubmit={handleAddEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div className="field">
            <label>اختر الموظف</label>
            <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)} required>
              <option value="">-- اختر الموظف --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
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

          <div className="field">
            <label>المبلغ (ج.م)</label>
            <input type="number" min="1" placeholder="أدخل المبلغ..." value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>

          <div className="field">
            <label>ملاحظات البيان</label>
            <input type="text" placeholder="سبب السلفة أو أصناف الأدوية..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start">💾 تسجيل المديونية وتأكيد الإدراج</button>
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
                    <td style={{ fontWeight: '800' }}>{emp.name}</td>
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
          <div className="modal-content card" style={{ maxWidth: '700px', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
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

                        return (
                          <tr key={l.id}>
                            <td>{l.date || '—'}</td>
                            <td>
                              {l.type === 'meds' ? (
                                <span className="badge badge-warning">💊 أدوية آجل</span>
                              ) : (
                                <span className="badge badge-primary">💰 سلفة مادية</span>
                              )}
                            </td>
                            <td style={{ fontWeight: '800' }}>{total} ج.م</td>
                            <td style={{ color: '#16a34a' }}>{paid} ج.م</td>
                            <td style={{ color: rem > 0 ? '#dc2626' : '#16a34a', fontWeight: '900' }}>{rem} ج.م</td>
                            <td style={{ fontSize: '12px' }}>{l.notes || '—'}</td>
                            <td>
                              {rem > 0 ? (
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '2px 8px', fontSize: '11.5px', color: '#0d9488' }}
                                  onClick={() => {
                                    const val = prompt(`أدخل مبلغ الدفع المخصوم لصالح السلفة (المتبقي ${rem} ج.م):`);
                                    if (val) handleRecordPayment(l.id, val);
                                  }}
                                >
                                  💵 سداد مبلغ
                                </button>
                              ) : (
                                <span style={{ color: '#16a34a', fontSize: '12px' }}>✓ تم السداد</span>
                              )}
                            </td>
                          </tr>
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
