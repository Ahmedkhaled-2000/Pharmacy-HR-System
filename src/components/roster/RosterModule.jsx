import React, { useState } from 'react';
import RosterPreviewModal from './RosterPreviewModal';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export const DEFAULT_ROSTER_SCHEDULE = {
  'السبت': { type: 'shift', start: '08:00', end: '16:00' },
  'الأحد': { type: 'shift', start: '08:00', end: '16:00' },
  'الاثنين': { type: 'shift', start: '08:00', end: '16:00' },
  'الثلاثاء': { type: 'shift', start: '16:00', end: '00:00' },
  'الأربعاء': { type: 'shift', start: '08:00', end: '16:00' },
  'الخميس': { type: 'shift', start: '08:00', end: '16:00' },
  'الجمعة': { type: 'off', start: '', end: '' }
};

export function normalizeSchedule(rawSchedule) {
  if (!rawSchedule || typeof rawSchedule !== 'object') return DEFAULT_ROSTER_SCHEDULE;
  
  const normalized = { ...DEFAULT_ROSTER_SCHEDULE };
  
  const dayKeyMap = {
    'saturday': 'السبت',
    'sunday': 'الأحد',
    'monday': 'الاثنين',
    'tuesday': 'الثلاثاء',
    'wednesday': 'الأربعاء',
    'thursday': 'الخميس',
    'friday': 'الجمعة',
    'السبت': 'السبت',
    'الأحد': 'الأحد',
    'الاحد': 'الأحد',
    'الإثنين': 'الاثنين',
    'الاثنين': 'الاثنين',
    'الثلاثاء': 'الثلاثاء',
    'الأربعاء': 'الأربعاء',
    'الاربعاء': 'الأربعاء',
    'الخميس': 'الخميس',
    'الجمعة': 'الجمعة'
  };

  Object.entries(rawSchedule).forEach(([key, val]) => {
    const cleanKey = String(key).trim().toLowerCase();
    const mappedDay = dayKeyMap[cleanKey] || dayKeyMap[key];
    if (mappedDay && val && typeof val === 'object') {
      const isOff = val.type === 'off' || val.isOff === true;
      normalized[mappedDay] = {
        type: isOff ? 'off' : 'shift',
        start: val.start || val.checkIn || '08:00',
        end: val.end || val.checkOut || '16:00'
      };
    }
  });

  return normalized;
}

export function getResolvedEmployeeRoster(employee, targetBranchId, state, selectedMonth = null) {
  if (!employee || !state) return null;
  const rosters = state.rosters || [];
  const requests = state.requests || [];
  const empIdStr = String(employee.id);
  const branchIdStr = targetBranchId ? String(targetBranchId) : null;
  const isMultiBranch = employee.branchesDetails && employee.branchesDetails.length > 1;

  const branchMatches = (itemBranchId) => {
    if (!branchIdStr) return true;
    const itemBStr = itemBranchId ? String(itemBranchId) : '';
    if (itemBStr === branchIdStr) return true;
    
    // Check match against branch object ID and Name
    const targetBObj = (state.branches || []).find(b => String(b.id) === branchIdStr || b.name === branchIdStr);
    if (targetBObj && (itemBStr === String(targetBObj.id) || itemBStr === targetBObj.name)) return true;

    // If item has no branch specified and employee is single-branch, match primary branch
    if (!itemBStr && !isMultiBranch) {
      return String(employee.branchId || '') === branchIdStr || String(employee.branchesDetails?.[0]?.branchId || '') === branchIdStr;
    }
    return false;
  };

  const candidates = [];

  // 1. Gather all matching approved records from state.rosters
  rosters.forEach((r) => {
    if (String(r.employeeId) !== empIdStr) return;
    if (r.status !== 'approved') return;
    const rMonth = r.month || (r.fromDate ? r.fromDate.slice(0, 7) : (r.approvedAt ? String(r.approvedAt).slice(0, 7) : null));
    if (selectedMonth && (!rMonth || rMonth !== selectedMonth)) return;
    if (branchMatches(r.branchId)) {
      candidates.push({
        ...r,
        approvedAt: r.approvedAt || r.updatedAt || r.createdAt || '2000-01-01',
        source: 'rosters'
      });
    }
  });

  // 2. Gather all matching approved records from state.requests
  requests.forEach((req) => {
    if (String(req.employeeId) !== empIdStr) return;
    if (req.type !== 'roster_update' && req.type !== 'roster_edit' && req.type !== 'roster_edit_request') return;
    if (req.status !== 'approved' && !req.adminApproved) return;
    const reqMonth = req.month || (req.fromDate ? req.fromDate.slice(0, 7) : (req.approvedAt ? String(req.approvedAt).slice(0, 7) : null));
    if (selectedMonth && (!reqMonth || reqMonth !== selectedMonth)) return;
    if (branchMatches(req.branchId)) {
      candidates.push({
        id: req.id,
        employeeId: req.employeeId,
        branchId: req.branchId || targetBranchId || employee.branchId,
        month: req.month,
        fromDate: req.fromDate,
        toDate: req.toDate,
        schedule: req.schedule,
        status: 'approved',
        approvedAt: req.approvedAt || req.updatedAt || req.createdAt || '2000-01-01',
        source: 'requests'
      });
    }
  });

  if (candidates.length === 0) return null;

  // Always pick the MOST RECENT approved roster!
  candidates.sort((a, b) => {
    const timeA = new Date(a.approvedAt || 0).getTime() || 0;
    const timeB = new Date(b.approvedAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const latest = candidates[0];
  return {
    ...latest,
    schedule: normalizeSchedule(latest.schedule)
  };
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
    if (!isEmployeeActive(emp)) return false;
    if (selectedBranch && emp.branchId !== selectedBranch && (!emp.branchesDetails || !emp.branchesDetails.some(bd => String(bd.branchId) === String(selectedBranch)))) return false;
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
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
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
