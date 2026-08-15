import React, { useState } from 'react';
import RosterPreviewModal from './RosterPreviewModal';

export function getResolvedEmployeeRoster(employee, targetBranchId, state) {
  if (!employee || !state) return null;
  const rosters = state.rosters || [];
  const requests = state.requests || [];
  const empIdStr = String(employee.id);
  const branchIdStr = targetBranchId ? String(targetBranchId) : null;

  // 1. Check state.rosters
  const foundRoster = rosters.find((r) => {
    if (String(r.employeeId) !== empIdStr) return false;
    if (r.status !== 'approved') return false;
    if (branchIdStr) {
      return String(r.branchId || '') === branchIdStr || (!r.branchId && (String(employee.branchId || '') === branchIdStr || String(employee.branchesDetails?.[0]?.branchId || '') === branchIdStr));
    }
    return true;
  });

  if (foundRoster) return foundRoster;

  // 2. Check approved requests in state.requests
  const approvedReq = requests.find((req) => {
    if (String(req.employeeId) !== empIdStr) return false;
    if (req.type !== 'roster_update' && req.type !== 'roster_edit' && req.type !== 'roster_edit_request') return false;
    if (req.status !== 'approved' && !req.adminApproved) return false;
    if (branchIdStr) {
      return String(req.branchId || '') === branchIdStr || (!req.branchId && (String(employee.branchId || '') === branchIdStr || String(employee.branchesDetails?.[0]?.branchId || '') === branchIdStr));
    }
    return true;
  });

  if (approvedReq) {
    return {
      id: approvedReq.id,
      employeeId: approvedReq.employeeId,
      branchId: approvedReq.branchId || targetBranchId || employee.branchId,
      month: approvedReq.month,
      fromDate: approvedReq.fromDate,
      toDate: approvedReq.toDate,
      schedule: approvedReq.schedule,
      status: 'approved',
      approvedAt: approvedReq.createdAt
    };
  }

  return null;
}

export default function RosterModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRosterEmp, setSelectedRosterEmp] = useState(null);

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (selectedBranch && emp.branchId !== selectedBranch && (!emp.branchesDetails || !emp.branchesDetails.some(bd => String(bd.branchId) === String(selectedBranch)))) return false;
    if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase()) && !emp.code.includes(searchQuery)) return false;
    return true;
  });

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📅 إدارة معاينة الجداول الشهرية لموظفي الصيدليات
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            مراجعة شفتات وأيام الراحة الأسبوعية لكل موظف عبر النافذة المنبثقة
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>👥 جميع موظفي الصيدليات (اضغط على الموظف لمعاينة الجدول)</h4>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
          />
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
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
              <th>المسمى الوظيفي</th>
              <th>حالة اعتماد الجدول الشهري</th>
              <th>معاينة الجدول</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => String(br.id) === String(emp.branchId));
                const empRoster = getResolvedEmployeeRoster(emp, selectedBranch, state);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{emp.name}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td>
                      {empRoster?.status === 'approved' ? (
                        (!empRoster?.schedule || Object.keys(empRoster.schedule).length === 0) ? (
                          <span className="badge badge-danger" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #ef4444', fontWeight: 'bold' }}>
                            ⚠️ معتمد (بدون جدول تفصيلي!)
                          </span>
                        ) : (
                          <span className="badge badge-success">🟢 معتمد من الإدارة والفرع</span>
                        )
                      ) : (
                        <span className="badge badge-warning">⏳ قيد المراجعة</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedRosterEmp(emp)}
                      >
                        👁️ معاينة الجدول الشهري
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Roster Preview Modal */}
      {selectedRosterEmp && (
        <RosterPreviewModal
          employee={selectedRosterEmp}
          state={state}
          onClose={() => setSelectedRosterEmp(null)}
        />
      )}
    </div>
  );
}
