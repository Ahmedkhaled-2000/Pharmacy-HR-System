import React, { useState } from 'react';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export default function LoansAndCreditModule({
  state,
  currentRole,
  onSubmitLoanRequest,
  onApproveLoan,
  onRejectLoan
}) {
  const [activeTab, setActiveTab] = useState('loans'); // 'loans' | 'meds'
  const [empId, setEmpId] = useState('');
  const [loanType, setLoanType] = useState('monthly'); // 'monthly' | 'installment'
  const [amount, setAmount] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('3');
  const [reason, setReason] = useState('');

  const employees = state.employees || [];
  const loans = state.loans || [];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!empId || !amount) {
      alert('يرجى تحديد الموظف والمبلغ');
      return;
    }
    const loanData = {
      id: `loan_${Date.now()}`,
      employeeId: empId,
      type: activeTab === 'loans' ? (loanType === 'monthly' ? 'سلفة شهرية' : 'سلفة مقسطة') : 'أدوية آجل',
      amount: parseFloat(amount) || 0,
      installmentsCount: loanType === 'installment' ? parseInt(installmentsCount) || 1 : 1,
      monthlyDeduction: loanType === 'installment'
        ? Math.round((parseFloat(amount) || 0) / (parseInt(installmentsCount) || 1))
        : parseFloat(amount) || 0,
      reason,
      status: 'pending',
      requestedAt: new Date().toISOString().slice(0, 10),
      adminOnlyApproval: true // Sent directly to Higher Management
    };

    onSubmitLoanRequest(loanData);
    alert('✅ تم تقديم الطلب بنجاح وهو قيد مراجعة واعتماد الإدارة العليا!');
    setAmount('');
    setReason('');
  };

  return (
    <div className="bylaws-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            💳 إدارة السلف والأدوية الآجل للموظفين
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            تقديم ومعالجة السلف الشهرية، السلف المقسطة، ومشتريات الأدوية الآجل (ترسل للإدارة العليا مباشرة)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'loans' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('loans')}
          >
            💰 السلف (شهرية / مقسطة)
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'meds' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('meds')}
          >
            💊 الأدوية الآجل
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
        {/* Form Box */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
            ➕ طلب {activeTab === 'loans' ? 'سلفة جديدة' : 'أدوية آجل'}
          </h4>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="field">
              <label>اختر الموظف</label>
              <select value={empId} onChange={(e) => setEmpId(e.target.value)} required>
                <option value="">-- اختر الموظف --</option>
                {employees.filter(isEmployeeActive).map((e) => (
                  <option key={e.id} value={e.id}>
                    {getEmpDisplayName(e)} (كود: {e.code})
                  </option>
                ))}
              </select>
            </div>

            {activeTab === 'loans' && (
              <div className="field">
                <label>نوع السلفة</label>
                <select value={loanType} onChange={(e) => setLoanType(e.target.value)}>
                  <option value="monthly">سلفة شهرية (خصم كامل الشهر القادم)</option>
                  <option value="installment">سلفة مقسطة (خصم أقساط شهرياً)</option>
                </select>
              </div>
            )}

            <div className="field">
              <label>مبلغ الطلب (ج.م)</label>
              <input type="number" placeholder="500" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>

            {activeTab === 'loans' && loanType === 'installment' && (
              <div className="field">
                <label>عدد أشهر التقسيط</label>
                <input type="number" min="2" max="12" value={installmentsCount} onChange={(e) => setInstallmentsCount(e.target.value)} required />
                {amount && installmentsCount && (
                  <span style={{ fontSize: '12px', color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                    * القسط الشهري المتوقع: {Math.round((parseFloat(amount) || 0) / (parseInt(installmentsCount) || 1))} ج.م/شهر
                  </span>
                )}
              </div>
            )}

            <div className="field">
              <label>السبب / الملاحظات</label>
              <input type="text" placeholder="سبب طلب السلفة..." value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <button type="submit" className="btn btn-start" style={{ marginTop: '8px' }}>
              📤 تقديم الطلب للإدارة العليا
            </button>
          </form>
        </div>

        {/* Requests List Table */}
        <div>
          <table className="bylaws-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>نوع الطلب</th>
                <th>المبلغ الإجمالي</th>
                <th>الأقساط / الخصم</th>
                <th>حالة الطلب</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                    لا توجد طلبات سلف أو آجل مسجلة.
                  </td>
                </tr>
              ) : (
                loans.map((loan) => {
                  const emp = employees.find((e) => e.id === loan.employeeId);
                  return (
                    <tr key={loan.id}>
                      <td style={{ fontWeight: 'bold' }}>{emp ? emp.name : 'غير محدد'}</td>
                      <td>
                        <span className="badge badge-primary">{loan.type}</span>
                      </td>
                      <td style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>{loan.amount} ج.م</td>
                      <td>
                        {loan.installmentsCount > 1
                          ? `${loan.monthlyDeduction} ج.م × ${loan.installmentsCount} أشهر`
                          : 'خصم كامل'}
                      </td>
                      <td>
                        <span className={`approval-status-badge ${loan.status === 'approved' ? 'approved' : loan.status === 'rejected' ? 'rejected' : 'pending'}`}>
                          {loan.status === 'approved' ? '✅ معتمدة' : loan.status === 'rejected' ? '❌ مرفوضة' : '⏳ قيد المراجعة'}
                        </span>
                      </td>
                      <td>
                        {loan.status === 'pending' && currentRole === 'admin' ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button type="button" className="btn btn-start" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => onApproveLoan(loan.id)}>
                              موافقة
                            </button>
                            <button type="button" className="del-btn" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => onRejectLoan(loan.id)}>
                              رفض
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
