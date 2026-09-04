import React, { useState } from 'react';
import RosterPreviewModal from './RosterPreviewModal';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';
import { getCycleDateRange } from '../../utils/periodEngine';

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
    'الجمعة': 'الجمعة',
    '0': 'الأحد',
    '1': 'الاثنين',
    '2': 'الثلاثاء',
    '3': 'الأربعاء',
    '4': 'الخميس',
    '5': 'الجمعة',
    '6': 'السبت',
    'day_0': 'الأحد',
    'day_1': 'الاثنين',
    'day_2': 'الثلاثاء',
    'day_3': 'الأربعاء',
    'day_4': 'الخميس',
    'day_5': 'الجمعة',
    'day_6': 'السبت'
  };

  Object.entries(rawSchedule).forEach(([key, val]) => {
    const cleanKey = String(key).trim().toLowerCase();
    const mappedDay = dayKeyMap[cleanKey] || dayKeyMap[key];
    if (mappedDay && val && typeof val === 'object') {
      const isOff = val.type === 'off' || val.isOff === true || val.type === 'راحة';
      normalized[mappedDay] = {
        type: isOff ? 'off' : 'shift',
        start: isOff ? '' : (val.start || val.checkIn || '08:00'),
        end: isOff ? '' : (val.end || val.checkOut || '16:00')
      };
    }
  });

  return normalized;
}

export function getResolvedEmployeeRoster(employee, targetBranchId, arg3, arg4 = null) {
  if (!employee) return null;

  // 1. Flexible Argument Normalization (handles both (emp, bId, state, month) and (emp, bId, month, state))
  let state = null;
  let selectedMonth = null;

  if (arg3 && typeof arg3 === 'object' && (arg3.rosters || arg3.requests || arg3.employees || arg3.branches || arg3.orgSettings !== undefined)) {
    state = arg3;
    selectedMonth = typeof arg4 === 'string' ? arg4 : null;
  } else if (arg4 && typeof arg4 === 'object' && (arg4.rosters || arg4.requests || arg4.employees || arg4.branches || arg4.orgSettings !== undefined)) {
    state = arg4;
    selectedMonth = typeof arg3 === 'string' ? arg3 : null;
  } else if (typeof arg3 === 'object' && arg3 !== null) {
    state = arg3;
    selectedMonth = typeof arg4 === 'string' ? arg4 : null;
  } else {
    selectedMonth = typeof arg3 === 'string' ? arg3 : null;
    state = typeof arg4 === 'object' ? arg4 : null;
  }

  if (!state) return null;

  const rosters = state.rosters || [];
  const requests = state.requests || [];
  const empIdStr = String(employee.id || '').trim();
  const empCodeStr = String(employee.code || '').trim();
  const targetBIdStr = targetBranchId ? String(targetBranchId).trim() : null;

  // Find target branch object in state.branches if available
  const targetBObj = targetBIdStr ? (state.branches || []).find(b => 
    String(b.id) === targetBIdStr || 
    String(b.branchCode || '') === targetBIdStr || 
    b.name === targetBIdStr
  ) : null;

  const isMultiBranch = Array.isArray(employee.branchesDetails) && employee.branchesDetails.length > 1;

  // Flexible Employee matching (by id or code in both directions)
  const matchesEmployee = (item) => {
    if (!item) return false;
    const itemEmpId = String(item.employeeId || '').trim();
    const itemEmpCode = String(item.employeeCode || '').trim();
    return (
      (empIdStr && itemEmpId === empIdStr) ||
      (empCodeStr && itemEmpCode === empCodeStr) ||
      (empCodeStr && itemEmpId === empCodeStr) ||
      (empIdStr && itemEmpCode === empIdStr)
    );
  };

  // Flexible Branch matching
  const branchMatches = (itemBranchId) => {
    if (!targetBIdStr) return true;
    const itemBStr = itemBranchId ? String(itemBranchId).trim() : '';

    if (itemBStr === targetBIdStr) return true;

    if (targetBObj) {
      if (itemBStr === String(targetBObj.id) || 
          (targetBObj.branchCode && itemBStr === String(targetBObj.branchCode)) || 
          itemBStr === targetBObj.name) {
        return true;
      }
    }

    // If item has no branch specified:
    if (!itemBStr) {
      const isAssigned = 
        String(employee.branchId || '') === targetBIdStr ||
        (targetBObj && String(employee.branchId || '') === String(targetBObj.id)) ||
        (Array.isArray(employee.branchesDetails) && employee.branchesDetails.some(bd => 
          String(bd.branchId) === targetBIdStr || 
          (targetBObj && String(bd.branchId) === String(targetBObj.id))
        ));
      if (isAssigned) return true;
      if (!isMultiBranch) return true;
    }

    return false;
  };

  // Determine Cycle Date Range if selectedMonth is provided
  let cycleRange = null;
  if (selectedMonth && typeof selectedMonth === 'string') {
    try {
      cycleRange = getCycleDateRange(selectedMonth, state?.orgSettings || {});
    } catch {
      const parts = selectedMonth.split('-').map(Number);
      if (parts.length >= 2) {
        const y = parts[0];
        const m = parts[1];
        const daysInM = new Date(y, m, 0).getDate();
        cycleRange = {
          startDate: `${selectedMonth}-01`,
          endDate: `${selectedMonth}-${String(daysInM).padStart(2, '0')}`
        };
      }
    }
  }

  // Scoring function to pick the most relevant approved roster
  const getCandidateScore = (item) => {
    let score = 0;
    const itemMonth = item.month || (item.fromDate ? String(item.fromDate).slice(0, 7) : null);

    if (selectedMonth) {
      // 1. Direct exact month match
      if (item.month === selectedMonth) {
        score = 100;
      }
      // 2. Date range overlaps with this month's payroll cycle
      else if (cycleRange && item.fromDate && item.toDate) {
        if (item.fromDate <= cycleRange.endDate && item.toDate >= cycleRange.startDate) {
          score = 95;
        }
      }
      // 3. fromDate starts within this cycle
      else if (cycleRange && item.fromDate && item.fromDate >= cycleRange.startDate && item.fromDate <= cycleRange.endDate) {
        score = 90;
      }
      // 4. fromDate starts with selectedMonth
      else if (item.fromDate && String(item.fromDate).slice(0, 7) === selectedMonth) {
        score = 85;
      }
      // 5. Standing / Recurring schedule (perpetual operational roster without month/date boundaries)
      else if (!item.month && !item.fromDate) {
        score = 80;
      }
      // 6. Most recent approved roster from an earlier month/cycle that carries forward
      else if (itemMonth && itemMonth < selectedMonth) {
        score = 70;
      }
      // 7. Approved roster starting earlier
      else if (cycleRange && item.fromDate && item.fromDate < cycleRange.startDate) {
        score = (!item.toDate || item.toDate >= cycleRange.startDate) ? 68 : 60;
      }
      // 8. General approved roster
      else {
        score = 50;
      }
    } else {
      // No selectedMonth filter requested -> prefer standing or newest
      if (!item.month && !item.fromDate) score = 90;
      else score = 75;
    }

    // Give priority to rosters with an actual schedule object and valid days
    if (item.schedule && typeof item.schedule === 'object' && Object.keys(item.schedule).length > 0) {
      score += 5;
    }

    return score;
  };

  const candidates = [];

  // 1. Gather all matching approved records from state.rosters
  rosters.forEach((r) => {
    if (!matchesEmployee(r)) return;
    const isApproved = r.status === 'approved' || r.status === 'active' || r.status === 'معتمد' || r.adminApproved === true || (!r.status && r.schedule);
    if (!isApproved) return;
    if (r.status === 'rejected' || r.status === 'draft') return;
    if (!branchMatches(r.branchId)) return;

    const score = getCandidateScore(r);
    candidates.push({
      ...r,
      score,
      approvedAt: r.approvedAt || r.updatedAt || r.createdAt || '2000-01-01',
      source: 'rosters'
    });
  });

  // 2. Gather all matching approved records from state.requests
  requests.forEach((req) => {
    if (!matchesEmployee(req)) return;
    const isRosterType = req.type === 'roster_update' || req.type === 'roster_edit' || req.type === 'roster_edit_request' || req.type === 'roster';
    if (!isRosterType) return;
    const isApproved = req.status === 'approved' || req.adminApproved === true;
    if (!isApproved) return;
    const rawSch = req.schedule || req.newSchedule;
    if (!rawSch) return;
    if (!branchMatches(req.branchId)) return;

    const reqItem = {
      id: req.id,
      employeeId: req.employeeId || employee.id,
      branchId: req.branchId || targetBranchId || employee.branchId,
      month: req.month,
      fromDate: req.fromDate,
      toDate: req.toDate,
      schedule: rawSch,
      status: 'approved',
      approvedAt: req.approvedAt || req.adminApprovedAt || req.updatedAt || req.createdAt || '2000-01-01',
      source: 'requests'
    };

    const score = getCandidateScore(reqItem);
    candidates.push({
      ...reqItem,
      score
    });
  });

  // 3. Fallback: Employee profile branch assignment schedule (employee.branchesDetails)
  if (Array.isArray(employee.branchesDetails)) {
    const bd = employee.branchesDetails.find(b => 
      String(b.branchId) === targetBIdStr || 
      (targetBObj && String(b.branchId) === String(targetBObj.id))
    );
    if (bd && bd.schedule && typeof bd.schedule === 'object' && Object.keys(bd.schedule).length > 0) {
      candidates.push({
        id: `emp_bd_${employee.id}_${bd.branchId}`,
        employeeId: employee.id,
        branchId: bd.branchId,
        schedule: bd.schedule,
        status: 'approved',
        score: 45,
        approvedAt: employee.updatedAt || employee.createdAt || '2000-01-01',
        source: 'employee_branchesDetails'
      });
    }
  }

  // 4. Fallback: Employee profile direct roster (employee.roster or employee.workSchedule or employee.schedule)
  const profileSchedule = employee.roster?.schedule || employee.workSchedule || employee.schedule;
  if (profileSchedule && typeof profileSchedule === 'object' && Object.keys(profileSchedule).length > 0) {
    const isBranchApplicable = !targetBIdStr || !isMultiBranch || branchMatches(employee.branchId);
    if (isBranchApplicable) {
      candidates.push({
        id: `emp_profile_${employee.id}`,
        employeeId: employee.id,
        branchId: employee.branchId || targetBranchId,
        schedule: profileSchedule,
        status: 'approved',
        score: 40,
        approvedAt: employee.roster?.approvedAt || employee.updatedAt || employee.createdAt || '2000-01-01',
        source: 'employee_profile'
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort candidates by score descending, then by approval timestamp descending
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const timeA = new Date(a.approvedAt || 0).getTime() || 0;
    const timeB = new Date(b.approvedAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const winner = candidates[0];
  return {
    ...winner,
    status: 'approved',
    schedule: normalizeSchedule(winner.schedule)
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
