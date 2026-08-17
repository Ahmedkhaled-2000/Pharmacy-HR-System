import React, { useState } from 'react';

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
  const requests = state.requests || [];

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
    if (filterBranch && emp.branchId !== filterBranch) return false;
    if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase()) && !emp.code.includes(searchQuery)) return false;
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
            استعراض سجل الإجازات المأخوذة بكل موظف وتحديد رصيد الإجازات السنوية المتبقي
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
                const annualTotal = emp.annualLeaveBalance !== undefined ? parseInt(emp.annualLeaveBalance) : 21;

                // Taken approved leave requests
                const takenLeaves = requests.filter(
                  (r) => (r.employeeId === emp.id || r.employeeCode === emp.code) &&
                    r.type === 'leave' &&
                    r.status === 'approved'
                );

                const takenDaysCount = takenLeaves.reduce((acc, r) => acc + (parseInt(r.daysCount || r.days || 1)), 0);
                const remainingDays = Math.max(0, annualTotal - takenDaysCount);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{emp.name}</td>
                    <td>{empBranch?.name || 'المركز الرئيسي'}</td>
                    <td style={{ fontWeight: '800' }}>{annualTotal} يوم</td>
                    <td style={{ color: '#d97706', fontWeight: '800' }}>{takenDaysCount} يوم</td>
                    <td style={{ color: remainingDays > 0 ? '#16a34a' : '#dc2626', fontWeight: '900', fontSize: '15px' }}>
                      {remainingDays} يوم
                    </td>
                    <td>
                      {remainingDays === 0 ? (
                        <span className="badge badge-danger">🔒 رصيد مستنفذ (0 يوم)</span>
                      ) : remainingDays <= 5 ? (
                        <span className="badge badge-warning">⚠️ رصيد منخفض ({remainingDays} يوم)</span>
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
      {selectedEmpModal && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '1050px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0d9488' }}>
                  🏖️ سجل كشف الإجازات للموظف: {selectedEmpModal.name}
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  كود: {selectedEmpModal.code} | الرصيد المتبقي: <strong>{selectedEmpModal.annualLeaveBalance || 21} يوم</strong>
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setSelectedEmpModal(null)}>✕ إغلاق</button>
            </div>

            {/* Taken leaves table */}
            {requests.filter((r) => (r.employeeId === selectedEmpModal.id || r.employeeCode === selectedEmpModal.code) && r.type === 'leave').length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', background: 'var(--surface-muted)', borderRadius: '10px', color: 'var(--muted)' }}>
                لا توجد طلبات إجازة مسجلة لهذا الموظف.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="bylaws-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      <th>تاريخ التقديم</th>
                      <th>نوع الإجازة</th>
                      <th>تاريخ البداية والنهاية</th>
                      <th>السبب والبيان</th>
                      <th>موافقة مدير الفرع</th>
                      <th>حالة الإدارة العليا</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests
                      .filter((r) => (r.employeeId === selectedEmpModal.id || r.employeeCode === selectedEmpModal.code) && r.type === 'leave')
                      .map((r) => (
                        <tr key={r.id}>
                          <td>{r.createdAt ? r.createdAt.slice(0, 10) : '—'}</td>
                          <td>
                            {r.leaveType === 'annual' ? (
                              <span className="badge badge-success">🏖️ سنوية</span>
                            ) : r.leaveType === 'unpaid' ? (
                              <span className="badge badge-warning">⏱️ إذن / غير مدفوعة الأجر</span>
                            ) : (
                              <span className="badge badge-primary">🌴 راحة أسبوعية</span>
                            )}
                          </td>
                          <td style={{ fontWeight: '700' }}>{r.startDate} إلى {r.endDate || r.startDate}</td>
                          <td style={{ fontSize: '12px' }}>{r.reason || r.details || '—'}</td>
                          <td>
                            {r.branchApproved ? (
                              <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد</span>
                            ) : (
                              <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ قيد المراجعة</span>
                            )}
                          </td>
                          <td>
                            {r.status === 'approved' && <span className="approval-status-badge approved">🟢 معتمد نهائياً</span>}
                            {r.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 بانتظار الإدارة العليا</span>}
                            {r.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض</span>}
                          </td>
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
