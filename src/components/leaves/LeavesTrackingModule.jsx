import React, { useState } from 'react';
import { calculateEmployeeLeaveStats, getEmployeeApprovedLeaves, getEmpDisplayName } from '../../utils/formatters';

export default function LeavesTrackingModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [selectedEmpModal, setSelectedEmpModal] = useState(null);
  const [filterBranch, setFilterBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const employees = state.employees || [];
  const branches = state.branches || [];

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
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

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            🏖️ متابعة كشوف وإجازات الموظفين ورصيد الإجازات السنوية
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            استعراض سجل الإجازات المأخوذة بكل موظف وتحديد رصيد الإجازات السنوية المتبقي بدقة متناهية ودائمة
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '220px' }}
          />
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}
          >
            <option value="">-- جميع الفروع --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>رصيد الإجازات السنوية الكلي</th>
              <th>الإجازات المأخوذة (المعتمدة)</th>
              <th>الرصيد المتبقي</th>
              <th>حالة الرصيد</th>
              <th>معاينة سجل الإجازات التفصيلي</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const empBranch = branches.find((b) => b.id === emp.branchId);
                const { annualTotal, takenAnnualDays, remainingAnnualDays } = calculateEmployeeLeaveStats(emp, state);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{empBranch?.name || 'المركز الرئيسي'}</td>
                    <td style={{ fontWeight: '800' }}>{annualTotal} يوم</td>
                    <td style={{ color: '#d97706', fontWeight: '800' }}>{takenAnnualDays} يوم</td>
                    <td style={{ color: remainingAnnualDays > 0 ? '#16a34a' : '#dc2626', fontWeight: '900', fontSize: '15px' }}>
                      {remainingAnnualDays} يوم
                    </td>
                    <td>
                      {remainingAnnualDays === 0 ? (
                        <span className="badge badge-danger">🔒 رصيد مستنفذ (0 يوم)</span>
                      ) : remainingAnnualDays <= 5 ? (
                        <span className="badge badge-warning">⚠️ رصيد منخفض ({remainingAnnualDays} يوم)</span>
                      ) : (
                        <span className="badge badge-success">🟢 رصيد متاح</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedEmpModal(emp)}
                      >
                        👁️ عرض كشف إجازات الموظف
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detailed Leaves Modal for Employee */}
      {selectedEmpModal && (() => {
        const empLeaves = getEmployeeApprovedLeaves(selectedEmpModal, state);
        const { annualTotal, takenAnnualDays, remainingAnnualDays } = calculateEmployeeLeaveStats(selectedEmpModal, state);

        return (
          <div className="modal-backdrop">
            <div className="modal-content card" style={{ maxWidth: '1050px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#0d9488' }}>
                    🏖️ سجل وكشف إجازات الموظف: {getEmpDisplayName(selectedEmpModal)}
                  </h3>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    كود: {selectedEmpModal.code}
                    {selectedEmpModal.nickname && selectedEmpModal.nickname.trim() !== selectedEmpModal.name?.trim() && ` | الاسم الرسمي: ${selectedEmpModal.name}`}
                    {' '}| الرصيد الكلي: <strong>{annualTotal} يوم</strong> | المأخوذ: <strong style={{ color: '#d97706' }}>{takenAnnualDays} يوم</strong> | المتبقي: <strong style={{ color: remainingAnnualDays > 0 ? '#16a34a' : '#dc2626' }}>{remainingAnnualDays} يوم</strong>
                  </span>
                </div>
                <button className="btn btn-ghost" onClick={() => setSelectedEmpModal(null)}>✕ إغلاق</button>
              </div>

              {/* Taken leaves table */}
              {empLeaves.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', background: 'var(--surface-muted)', borderRadius: '10px', color: 'var(--muted)' }}>
                  لا توجد إجازات مسجلة أو معتمدة لهذا الموظف حتى الآن.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="bylaws-table" style={{ fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-muted)' }}>
                        <th>تاريخ التقديم / التسجيل</th>
                        <th>نوع الإجازة</th>
                        <th>تاريخ البداية والنهاية</th>
                        <th>عدد الأيام</th>
                        <th>السبب والبيان</th>
                        <th>حالة الاعتماد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empLeaves.map((r, idx) => (
                        <tr key={r.id || idx}>
                          <td>{r.createdAt ? r.createdAt.slice(0, 10) : (r.startDate || '—')}</td>
                          <td>
                            {r.leaveType === 'annual' || (!r.leaveType && r.type === 'leave') ? (
                              <span className="badge badge-success">🏖️ سنوية اعتيادية</span>
                            ) : r.leaveType === 'unpaid' ? (
                              <span className="badge badge-warning">⏱️ غير مدفوعة الأجر</span>
                            ) : r.leaveType === 'sick' ? (
                              <span className="badge badge-danger">🏥 إجازة مرضية</span>
                            ) : (
                              <span className="badge badge-primary">{r.leaveType || 'إجازة رسمية'}</span>
                            )}
                          </td>
                          <td style={{ fontWeight: '700' }}>{r.startDate} إلى {r.endDate || r.startDate}</td>
                          <td style={{ fontWeight: '800', color: '#d97706' }}>{r.daysCount || r.days || 1} يوم</td>
                          <td style={{ fontSize: '12px' }}>{r.reason || r.details || '—'}</td>
                          <td>
                            <span className="approval-status-badge approved">🟢 معتمد ومسجل</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
