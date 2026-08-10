import React, { useState } from 'react';
import PayslipPrintModal from './PayslipPrintModal';

export default function PayrollModule({
  state,
  setState,
  saveState,
  monthPicker,
  setMonthPicker,
  exportAllPayrollExcel,
  exportEmpExcel,
  showToast
}) {
  const [selectedEmpModal, setSelectedEmpModal] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBranch, setFilterBranch] = useState('');

  // Fixed Monthly Payout Day State
  const [payoutDay, setPayoutDay] = useState(state.orgSettings?.payrollPayoutDay || 25);

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (filterBranch && emp.branchId !== filterBranch) return false;
    if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase()) && !emp.code.includes(searchQuery)) return false;
    return true;
  });

  const handleSavePayoutDay = async (newDay) => {
    const val = parseInt(newDay);
    if (!val || val < 1 || val > 31) return;
    setPayoutDay(val);

    const updatedSettings = { ...state.orgSettings, payrollPayoutDay: val };
    const updatedState = { ...state, orgSettings: updatedSettings };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(`✅ تم ضبط يوم ${val} من كل شهر كيوم ثابت لإصدار الرواتب بالشركة`);
  };

  const handlePrintPDF = (emp) => {
    window.print();
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            💰 إدارة كشوف رواتب الموظفين وإصدار الـ PDF
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            احتساب الاستحقاقات والخصومات والمكافآت وتحديد يوم إصدار الرواتب الشهري
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-start" onClick={exportAllPayrollExcel}>
            📊 تصدير شيت إكسيل الرواتب الشامل
          </button>
        </div>
      </div>

      {/* Payout Day Setting Card */}
      <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '18px 22px', borderRadius: '14px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>🗓️ موعد إصدار وتقفيل الرواتب الشهري الثابت</h4>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>يتم تقفيل واحتساب خصومات ومكافآت الشهر يوم <strong>{payoutDay}</strong> من كل شهر ميلادي.</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>تغيير اليوم الثابت:</label>
          <select
            value={payoutDay}
            onChange={(e) => handleSavePayoutDay(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold' }}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>يوم {d} من الشهر</option>
            ))}
          </select>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>👥 جميع كشوف رواتب الموظفين (اضغط لمعاينة مفردات المرتب)</h4>
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
              <th>الراتب الأساسي</th>
              <th>أيام العمل</th>
              <th>المكافآت</th>
              <th>الخصومات</th>
              <th>صافي المرتب المستحق</th>
              <th>العمليات والطباعة</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => br.id === emp.branchId);
                const salary = parseFloat(emp.salary) || 4000;
                const bonus = 0;
                const penalty = 0;
                const netSalary = salary + bonus - penalty;

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{emp.name}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td style={{ fontWeight: '700' }}>{salary.toLocaleString()} ج.م</td>
                    <td>{emp.workDaysPerMonth || 26} يوم</td>
                    <td style={{ color: '#16a34a', fontWeight: '700' }}>+{bonus} ج.م</td>
                    <td style={{ color: '#dc2626', fontWeight: '700' }}>-{penalty} ج.م</td>
                    <td style={{ color: '#0d9488', fontWeight: '900', fontSize: '15px' }}>{netSalary.toLocaleString()} ج.م</td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedEmpModal(emp)}
                      >
                        💵 تفاصيل المرتب وتصدير PDF
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Salary Detail & PDF Modal */}
      {selectedEmpModal && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '750px', padding: '24px', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0d9488' }}>
                  💵 كشف مفردات راتب الموظف: {selectedEmpModal.name}
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  كود الموظف: {selectedEmpModal.code} | المسمى الوظيفي: {selectedEmpModal.jobTitle}
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setSelectedEmpModal(null)}>✕ إغلاق</button>
            </div>

            {/* Salary Breakdown (Matching Image 2 Design) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>الراتب الأساسي المعتمد</span>
                <h4 style={{ margin: '4px 0 0 0', color: 'var(--primary-dark)' }}>{selectedEmpModal.salary || 4000} ج.م</h4>
              </div>

              <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12px', color: '#166534' }}>سعر الساعة المحسوب</span>
                <h4 style={{ margin: '4px 0 0 0', color: '#15803d' }}>
                  {((selectedEmpModal.salary || 4000) / ((selectedEmpModal.workDaysPerMonth || 26) * (selectedEmpModal.workHoursPerDay || 8))).toFixed(2)} ج.م/ساعة
                </h4>
              </div>

              <div style={{ background: '#fef2f2', padding: '14px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: '12px', color: '#991b1b' }}>الخصومات والجزاءات المالية</span>
                <h4 style={{ margin: '4px 0 0 0', color: '#b91c1c' }}>-0.00 ج.م</h4>
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '18px', borderRadius: '12px', textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '13px', opacity: 0.9 }}>صافي المرتب المستحق للصرف</span>
              <h2 style={{ margin: '6px 0 0 0', fontSize: '28px', fontWeight: '900' }}>
                {(selectedEmpModal.salary || 4000).toLocaleString()} ج.م
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => exportEmpExcel(selectedEmpModal.id, 'month')}>
                📊 تصدير شيت إكسيل فردي
              </button>
              <button className="btn btn-start" onClick={() => setShowPrintModal(true)}>
                🖨️ تصدير وطباعة كشف المرتب (PDF)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official PDF Print Modal */}
      <PayslipPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        emp={selectedEmpModal}
        month={monthPicker}
        shifts={state.shifts || []}
        adjustments={state.adjustments || []}
        orgSettings={state.orgSettings || {}}
      />

    </div>
  );
}
