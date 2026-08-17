import React, { useState } from 'react';

export default function IncomeExpensesModule({
  state,
  setState,
  saveState,
  showToast,
  currentBranch,
  userRole
}) {
  const isBranchRole = userRole === 'branch' || !!currentBranch;
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'expense' | 'income'
  const [selectedBranch, setSelectedBranch] = useState(currentBranch?.id || '');
  
  // New Entry Form State
  const [type, setType] = useState('expense'); // 'expense' | 'income'
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [branchId, setBranchId] = useState(currentBranch?.id || '');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const branches = state.branches || [];
  const transactions = state.finances || state.transactions || [];

  const filteredList = transactions.filter((t) => {
    if (activeTab !== 'all' && t.type !== activeTab) return false;
    const activeBranchFilter = currentBranch?.id || selectedBranch;
    if (activeBranchFilter && t.branchId !== activeBranchFilter) return false;
    return true;
  });

  const totalIncome = (isBranchRole ? filteredList : transactions)
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const totalExpenses = (isBranchRole ? filteredList : transactions)
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const netBalance = totalIncome - totalExpenses;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !category.trim()) {
      showToast?.('يرجى تحديد المبلغ والتصنيف بشكل صحيح');
      return;
    }

    const targetBranchId = currentBranch?.id || branchId || '';
    const branchObj = branches.find((b) => b.id === targetBranchId) || currentBranch;
    const branchName = branchObj?.name || 'المركز الرئيسي / عام';

    const newTransaction = {
      id: `tx_${Date.now()}`,
      type,
      category: category.trim(),
      amount: parsedAmount,
      branchId: targetBranchId,
      branchName: branchName,
      createdBy: isBranchRole ? `مدير فرع ${branchName}` : 'admin',
      notes: notes.trim(),
      date,
      createdAt: new Date().toISOString()
    };

    // If added by branch manager, also create an alert/notification for Top Management!
    let updatedNotifs = state.notifications || [];
    if (isBranchRole) {
      const newNotif = {
        id: `notif_fin_${Date.now()}`,
        type: 'financial_alert',
        title: `📈 قيد مالي جديد: فرع ${branchName}`,
        message: `قام مدير فرع ${branchName} بإدراج ${type === 'expense' ? 'مصروف' : 'إيراد'} بقيمة ${parsedAmount} ج.م (البند: ${category.trim()})`,
        date,
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: 'admin',
        branchId: targetBranchId
      };
      updatedNotifs = [newNotif, ...updatedNotifs];
    }

    const updated = [newTransaction, ...transactions];
    const updatedState = { ...state, finances: updated, transactions: updated, notifications: updatedNotifs };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast?.('✅ تم إضافة البند وتعديل الإجماليات وإشعار الإدارة العليا بنجاح!');
    setCategory('');
    setAmount('');
    setNotes('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا البند المالي؟')) return;
    const updated = transactions.filter((t) => t.id !== id);
    const updatedDeleted = [...(state._deletedIds || []), String(id)];
    const updatedState = { ...state, finances: updated, transactions: updated, _deletedIds: updatedDeleted };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف البند المالي بنجاح');
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📈 إدارة المصروفات والإيرادات للشركة
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            تسجيل وإدارة حركة المصروفات والإيرادات اليومية وتأثيرها المباشر على الحسابات العامة
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'all' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('all')}
          >
            📋 الكشف الشامل ({transactions.length})
          </button>
          <button
            className={`btn ${activeTab === 'income' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('income')}
          >
            🟢 الإيرادات فقط
          </button>
          <button
            className={`btn ${activeTab === 'expense' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('expense')}
          >
            🔴 المصروفات فقط
          </button>
        </div>
      </div>

      {/* Summary Financial Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>🟢 إجمالي الإيرادات المسجلة</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{totalIncome.toLocaleString()} ج.م</h3>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>🔴 إجمالي المصروفات المسجلة</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{totalExpenses.toLocaleString()} ج.م</h3>
        </div>

        <div style={{ background: netBalance >= 0 ? 'linear-gradient(135deg, #0d9488, #0f766e)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>📊 صافي الرصيد المالي</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{netBalance.toLocaleString()} ج.م</h3>
        </div>
      </div>

      {/* Add New Transaction Form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
          ➕ تسجيل حركة مالية جديدة (إيراد / مصروف)
        </h4>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div className="field">
            <label>نوع الحركة</label>
            <select value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="expense">🔴 مصروفات (تخصم)</option>
              <option value="income">🟢 إيرادات (تضاف)</option>
            </select>
          </div>

          <div className="field">
            <label>التصنيف / البيان</label>
            <input
              type="text"
              placeholder="مثال: فواتير كهرباء، إيجار، مبيعات..."
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>المبلغ (ج.م)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="أدخل المبلغ..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>الفرع المعني</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">-- عام / المركز الرئيسي --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>ملاحظات بيانية</label>
            <input type="text" placeholder="اكتب أي ملاحظات إضافية..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start">💾 تسجيل وحفظ الحركة المالية</button>
          </div>
        </form>
      </div>

      {/* Filter and Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>📋 سجل الحركة المالية الحالية</h4>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>تصفية بالفرع:</label>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
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
              <th>#</th>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>التصنيف / البيان</th>
              <th>الفرع</th>
              <th>المبلغ</th>
              <th>الملاحظات</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredList.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد حركات مالية مسجلة حتى الآن.</td></tr>
            ) : (
              filteredList.map((t, idx) => (
                <tr key={t.id}>
                  <td>{idx + 1}</td>
                  <td>{t.date}</td>
                  <td>
                    {t.type === 'income' ? (
                      <span className="badge badge-success">🟢 إيراد</span>
                    ) : (
                      <span className="badge badge-danger">🔴 مصروف</span>
                    )}
                  </td>
                  <td style={{ fontWeight: '700' }}>{t.category}</td>
                  <td>{t.branchName || 'عام'}</td>
                  <td style={{ fontWeight: '800', color: t.type === 'income' ? '#16a34a' : '#dc2626' }}>
                    {t.type === 'income' ? '+' : '-'}{parseFloat(t.amount).toLocaleString()} ج.م
                  </td>
                  <td style={{ fontSize: '12.5px' }}>{t.notes || '—'}</td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--danger)' }}
                      onClick={() => handleDelete(t.id)}
                    >
                      🗑️ حذف
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
}
