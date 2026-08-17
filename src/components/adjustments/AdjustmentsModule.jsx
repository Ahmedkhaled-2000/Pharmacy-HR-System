import React, { useState } from 'react';
import { fmt } from '../../utils/formatters';

export default function AdjustmentsModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Modal for Viewing Employee Adjustments
  const [inspectEmp, setInspectEmp] = useState(null);

  // Form Modal for Adding Bonus/Deduction
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetEmpId, setTargetEmpId] = useState('');
  const [adjBranchId, setAdjBranchId] = useState('');
  const [adjType, setAdjType] = useState('bonus'); // 'bonus' | 'deduction' | 'penalty'
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));
  const [adjReason, setAdjReason] = useState('');

  const employees = state.employees || [];
  const branches = state.branches || [];
  const adjustments = state.adjustments || [];

  // Filtered employees list
  const filteredEmployees = employees.filter((emp) => {
    if (selectedBranchId && emp.branchId !== selectedBranchId && (!emp.branchesDetails || !emp.branchesDetails.some(bd => bd.branchId === selectedBranchId))) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const matchName = (emp.name || '').toLowerCase().includes(q);
      const matchCode = (emp.code || '').toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    return true;
  });

  // Calculate totals for month
  const monthAdjs = adjustments.filter((a) => a.date && a.date.startsWith(selectedMonth));
  const totalBonuses = monthAdjs.filter((a) => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
  const totalDeductions = monthAdjs.filter((a) => a.type === 'deduction' || a.type === 'penalty').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const handleAddAdjustment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(adjAmount);
    if (!targetEmpId || !amount || amount <= 0 || !adjReason.trim()) {
      showToast?.('يرجى اختيار الموظف وإدخال مبلغ وسبب المكافأة/الخصم');
      return;
    }

    const empObj = employees.find((item) => item.id === targetEmpId);
    const newAdj = {
      id: `adj_${Date.now()}`,
      employeeId: targetEmpId,
      employeeName: empObj?.name || '',
      employeeCode: empObj?.code || '',
      branchId: adjBranchId || null,
      type: adjType,
      amount,
      date: adjDate,
      reason: adjReason.trim(),
      details: adjReason.trim(),
      createdBy: 'admin',
      createdAt: new Date().toISOString()
    };

    const updatedAdjs = [newAdj, ...adjustments];
    const updatedState = { ...state, adjustments: updatedAdjs };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setShowAddModal(false);
    setAdjAmount('');
    setAdjReason('');
    showToast?.(`✅ تم تسجيل ${adjType === 'bonus' ? 'المكافأة' : 'الخصم'} بنجاح للموظف ${empObj?.name}`);
  };

  const handleDeleteAdjustment = async (adjId) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا البند الإداري؟')) return;
    const updatedAdjs = adjustments.filter((a) => a.id !== adjId);
    const updatedDeleted = [...(state._deletedIds || []), String(adjId)];
    const updatedState = { ...state, adjustments: updatedAdjs, _deletedIds: updatedDeleted };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف البند المالي بنجاح نهائياً');
  };

  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Top Banner & Action Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📝 إدارة المكافآت والخصومات الشاملة
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            تسجيل واستعراض كافة الحوافز والمكافآت والخصومات لكافة موظفي الصيدليات
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-start" onClick={() => setShowAddModal(true)}>
            ➕ إضافة مكافأة أو خصم لموظف
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px 20px', borderRadius: '14px' }}>
          <div style={{ fontSize: '13px', color: '#166534', fontWeight: 'bold' }}>🎁 إجمالي المكافآت ({selectedMonth})</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#15803d', marginTop: '4px' }}>
            +{fmt(totalBonuses)} ج.م
          </div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '16px 20px', borderRadius: '14px' }}>
          <div style={{ fontSize: '13px', color: '#991b1b', fontWeight: 'bold' }}>✂️ إجمالي الخصومات ({selectedMonth})</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#dc2626', marginTop: '4px' }}>
            -{fmt(totalDeductions)} ج.م
          </div>
        </div>

        <div style={{ background: '#e6f7f5', border: '1px solid #0d9488', padding: '16px 20px', borderRadius: '14px' }}>
          <div style={{ fontSize: '13px', color: '#0f766e', fontWeight: 'bold' }}>⚖️ صافي تسويات الشهر</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#0d9488', marginTop: '4px' }}>
            {fmt(totalBonuses - totalDeductions)} ج.م
          </div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px 18px', borderRadius: '14px', marginBottom: '20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
          />
        </div>

        <div>
          <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <option value="">-- جميع الفروع --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.branchCode})</option>
            ))}
          </select>
        </div>

        <div>
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }} />
        </div>
      </div>

      {/* Employees Grid List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {filteredEmployees.map((emp) => {
          const empAdjs = adjustments.filter((a) => (a.employeeId === emp.id || a.employeeId === 'all') && a.date && a.date.startsWith(selectedMonth));
          const empBonuses = empAdjs.filter((a) => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
          const empDeductions = empAdjs.filter((a) => a.type === 'deduction' || a.type === 'penalty').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

          return (
            <div
              key={emp.id}
              onClick={() => setInspectEmp(emp)}
              style={{
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div className="emp-avatar-circle" style={{ width: '46px', height: '46px' }}>
                  {emp.photoUrl ? <img src={emp.photoUrl} alt={emp.name} className="emp-img" /> : <span>{emp.name.charAt(0)}</span>}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '15px' }}>{emp.name}</h4>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{emp.jobTitle} · كود: {emp.code}</span>
                </div>
              </div>

              <div style={{ background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <div>مكافآت: <strong style={{ color: '#16a34a' }}>+{fmt(empBonuses)}</strong></div>
                <div>خصومات: <strong style={{ color: '#dc2626' }}>-{fmt(empDeductions)}</strong></div>
              </div>

              <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '12.5px', color: '#0d9488', fontWeight: 'bold' }}>
                👁️ انقر لمعاينة التفاصيل والتعديل ({empAdjs.length} بند)
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal 1: Employee Details Modal */}
      {inspectEmp && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '700px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontFamily: 'Cairo' }}>
                📝 سجل مكافآت وخصومات: {inspectEmp.name} ({inspectEmp.code})
              </h3>
              <button className="btn btn-ghost" onClick={() => setInspectEmp(null)}>✕ إغلاق</button>
            </div>

            {(() => {
              const empAdjs = adjustments.filter((a) => a.employeeId === inspectEmp.id || a.employeeId === 'all');
              return (
                <div>
                  <div className="table-responsive">
                    <table className="bylaws-table" style={{ fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th>التاريخ</th>
                          <th>نوع الإجراء</th>
                          <th>المبلغ (ج.م)</th>
                          <th>السبب والتفاصيل</th>
                          <th>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empAdjs.length === 0 ? (
                          <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>لا توجد مكافآت أو خصومات مسجلة لهذا الموظف.</td></tr>
                        ) : (
                          empAdjs.map((a) => (
                            <tr key={a.id}>
                              <td>{a.date}</td>
                              <td>
                                <span className={`badge ${a.type === 'bonus' ? 'badge-success' : 'badge-danger'}`}>
                                  {a.type === 'bonus' ? '➕ مكافأة' : '➖ خصم'}
                                </span>
                              </td>
                              <td style={{ fontWeight: 'bold' }}>{fmt(a.amount)} ج.م</td>
                              <td>{a.reason || a.details || '—'}</td>
                              <td>
                                <button className="icon-btn danger" title="حذف البند" onClick={() => handleDeleteAdjustment(a.id)}>
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal 2: Add New Adjustment Form */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '520px', width: '95%' }}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'Cairo' }}>➕ إضافة مكافأة أو خصم لموظف</h3>

            <form onSubmit={handleAddAdjustment}>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label>اختر الموظف</label>
                <select
                  value={targetEmpId}
                  onChange={(e) => {
                    setTargetEmpId(e.target.value);
                    setAdjBranchId('');
                  }}
                  required
                >
                  <option value="">-- اختر الموظف --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>

              {/* Branch selection dropdown for multi-branch employees */}
              {(() => {
                const empObj = employees.find((item) => item.id === targetEmpId);
                if (empObj && empObj.branchesDetails && empObj.branchesDetails.length > 1) {
                  return (
                    <div className="field" style={{ marginBottom: '14px' }}>
                      <label>تخصيص للفرع (أو الإدارة العليا)</label>
                      <select value={adjBranchId} onChange={(e) => setAdjBranchId(e.target.value)}>
                        <option value="">🏢 الإدارة العليا / جميع الفروع (كلي)</option>
                        {empObj.branchesDetails.map((bd) => {
                          const bObj = branches.find((b) => b.id === bd.branchId);
                          return (
                            <option key={bd.branchId} value={bd.branchId}>
                              فرع: {bObj ? bObj.name : bd.branchId}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                }
                return null;
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="field">
                  <label>نوع الإجراء</label>
                  <select value={adjType} onChange={(e) => setAdjType(e.target.value)}>
                    <option value="bonus">➕ إضافة مكافأة / حافز</option>
                    <option value="deduction">➖ إضافة خصم / جزاء مالى</option>
                  </select>
                </div>
                <div className="field">
                  <label>المبلغ (ج.م)</label>
                  <input type="number" min="1" placeholder="مثال: 150" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} required />
                </div>
              </div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>التاريخ</label>
                <input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} required />
              </div>

              <div className="field" style={{ marginBottom: '18px' }}>
                <label>سبب الإجراء والتفاصيل</label>
                <input type="text" placeholder="اكتب سبب المكافأة أو الخصم..." value={adjReason} onChange={(e) => setAdjReason(e.target.value)} required />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start">💾 تسجيل الإجراء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
