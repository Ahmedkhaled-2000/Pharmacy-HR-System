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

  // Monthly Payout Cutoff Start/End Days
  const [payoutStartDay, setPayoutStartDay] = useState(state.orgSettings?.payrollPayoutStartDay || 26);
  const [payoutEndDay, setPayoutEndDay] = useState(state.orgSettings?.payrollPayoutEndDay || 25);

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (filterBranch && emp.branchId !== filterBranch && (!emp.branchesDetails || !emp.branchesDetails.some((bd) => bd.branchId === filterBranch))) return false;
    if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase()) && !emp.code.includes(searchQuery)) return false;
    return true;
  });

  const handleSavePayoutPeriod = async (startD, endD) => {
    const sVal = parseInt(startD, 10);
    const eVal = parseInt(endD, 10);
    if (!sVal || !eVal || sVal < 1 || sVal > 31 || eVal < 1 || eVal > 31) return;
    setPayoutStartDay(sVal);
    setPayoutEndDay(eVal);

    const updatedSettings = {
      ...state.orgSettings,
      payrollPayoutStartDay: sVal,
      payrollPayoutEndDay: eVal,
      payrollPayoutDay: eVal
    };
    const updatedState = { ...state, orgSettings: updatedSettings };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(`✅ تم تحديد فترة تقفيل الرواتب من يوم ${sVal} للشهر السابق حتى يوم ${eVal} للشهر الحالي`);
  };

  // Helper to compute date range description for monthPicker
  const getPeriodDesc = () => {
    if (!monthPicker || monthPicker.length !== 7) return '';
    const [y, m] = monthPicker.split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) { prevM = 12; prevY = y - 1; }
    const startStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(payoutStartDay).padStart(2, '0')}`;
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(payoutEndDay).padStart(2, '0')}`;
    return `من ${startStr} إلى ${endStr}`;
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            💰 إدارة كشوف رواتب الموظفين وإصدار الـ PDF
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            احتساب الاستحقاقات والخصومات والمكافآت وتحديد بداية ونهاية فترة تقفيل الرواتب الشهري
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-start" onClick={exportAllPayrollExcel}>
            📊 تصدير شيت إكسيل الرواتب الشامل
          </button>
        </div>
      </div>

      {/* Payout Period Cutoff Setting Card */}
      <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '18px 22px', borderRadius: '14px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>🗓️ تحديد فترة إصدار وتقفيل الرواتب الشهري الثابت</h4>
          <span style={{ fontSize: '13px', opacity: 0.95 }}>
            يتم تقفيل واحتساب خصومات ومكافآت وساعات شهر ({monthPicker}) بناءً على الفترة: <strong style={{ textDecoration: 'underline' }}>{getPeriodDesc()}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>من يوم (الشهر السابق):</label>
            <select
              value={payoutStartDay}
              onChange={(e) => handleSavePayoutPeriod(e.target.value, payoutEndDay)}
              style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold' }}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>يوم {d}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>إلى يوم (الشهر الحالي):</label>
            <select
              value={payoutEndDay}
              onChange={(e) => handleSavePayoutPeriod(payoutStartDay, e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold' }}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>يوم {d}</option>
              ))}
            </select>
          </div>
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
              <th>أيام العمل</th>
              <th>المكافآت</th>
              <th>الخصومات</th>
              <th>العمليات والطباعة</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;
                let branchNameDisplay = branches.find((br) => br.id === emp.branchId)?.name || 'المركز الرئيسي';

                if (isMultiBranch) {
                  if (filterBranch) {
                    const targetB = branches.find((br) => br.id === filterBranch);
                    branchNameDisplay = targetB?.name || 'فرع مخصص';
                  } else {
                    branchNameDisplay = emp.branchesDetails.map((bd) => {
                      const brObj = branches.find((br) => br.id === bd.branchId);
                      return brObj?.name || bd.branchId;
                    }).join(' + ');
                  }
                }

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{emp.name}</td>
                    <td>{branchNameDisplay}</td>
                    <td>{emp.workDaysPerMonth || 26} يوم</td>
                    <td style={{ color: '#16a34a', fontWeight: '700' }}>0 ج.م</td>
                    <td style={{ color: '#dc2626', fontWeight: '700' }}>0 ج.م</td>
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
      {selectedEmpModal && (() => {
        const empSalary = parseFloat(selectedEmpModal.salary) || 0;
        const empDays = parseFloat(selectedEmpModal.workDaysPerMonth) || 26;
        const empHours = parseFloat(selectedEmpModal.workHoursPerDay) || 8;
        const empDailyRate = empDays > 0 ? (empSalary * empHours) / empDays : 0;
        const empDailyHourly = empHours > 0 ? empDailyRate / empHours : (empDays > 0 ? empSalary / empDays : empSalary);
        const empMonthly = empDailyRate * empDays;

        return (
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

              {/* Salary Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>1. سعر الساعة الشهري (المدخل)</span>
                  <h4 style={{ margin: '4px 0 0 0', color: 'var(--primary-dark)' }}>{empSalary.toLocaleString()} ج.م</h4>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>2. سعر اليوم = ({empSalary} × {empHours}) ÷ {empDays}</span>
                  <h4 style={{ margin: '4px 0 0 0', color: 'var(--primary-dark)' }}>{empDailyRate.toLocaleString()} ج.م / يوم</h4>
                </div>

                <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '12px', color: '#166534' }}>3. سعر الساعة اليومي = {empDailyRate} ÷ {empHours}</span>
                  <h4 style={{ margin: '4px 0 0 0', color: '#15803d' }}>
                    {empDailyHourly.toLocaleString()} ج.م / ساعة
                  </h4>
                </div>
              </div>

              <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '18px', borderRadius: '12px', textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', opacity: 0.9 }}>صافي الراتب الأساسي الشهري المقدر ({empDailyRate.toLocaleString()} × {empDays} يوم)</span>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '28px', fontWeight: '900' }}>
                  {empMonthly.toLocaleString()} ج.م
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
      );})()}

      {/* Official PDF Print Modal */}
      <PayslipPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        emp={selectedEmpModal}
        month={monthPicker}
        shifts={state.shifts || []}
        adjustments={state.adjustments || []}
        branches={branches}
        orgSettings={state.orgSettings || {}}
        computeEmpSummary={state.computeEmpSummary}
        selectedBranchId={filterBranch || null}
        state={state}
      />

    </div>
  );
}
