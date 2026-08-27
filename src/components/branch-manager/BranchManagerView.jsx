import React, { useState, useMemo, useEffect } from 'react';
import EmployeeLeaveModule from '../employee-portal/EmployeeLeaveModule';
import EmployeePermissionsModule from '../employee-portal/EmployeePermissionsModule';
import EmployeeLoansModule from '../employee-portal/EmployeeLoansModule';
import EmployeeEvaluationsModule from '../employee-portal/EmployeeEvaluationsModule';
import PayslipPrintModal from '../payroll/PayslipPrintModal';
import { printEmployeePayslipDirect } from '../../utils/printHelper';
import BylawsModule from '../bylaws/BylawsModule';
import IncomeExpensesModule from '../finance/IncomeExpensesModule';
import { getFormattedRequestBadge } from '../requests/RequestsModule';
import EvaluationsModule, { getJobEvaluationCriteria } from '../evaluations/EvaluationsModule';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import BranchResignationModule from '../resignation/BranchResignationModule';
import { normalizeSchedule } from '../roster/RosterModule';
import { shouldShowRequestToBranch, getEmpDisplayName, isEmployeeActive, getEmployeeManualPunchesCount, isShiftManualPunch, calculateEmployeeLeaveStats, getEmployeeApprovedLeaves, fmt } from '../../utils/formatters';
import { recalculateEmployeeCycleLateness, applyApprovedPermissionsToShifts, isApprovedPermissionForDate, getEffectiveShiftHours } from '../../utils/latePenaltyEngine';
import EmployeePermissionsManagementModule from '../permissions/EmployeePermissionsManagementModule';
import { getCycleDateRange, createDatePredicate, getActivePayrollMonth } from '../../utils/periodEngine';
import { getRealDate, getRealTodayStr } from '../../utils/timeEngine';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function getArabicWeekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return WEEKDAYS_AR[d.getDay()] || '';
}

function formatMoney(num) {
  return (parseFloat(num) || 0).toFixed(2);
}

function getActiveElapsedStr(activeShift) {
  if (!activeShift || !activeShift.timeIn) return '';
  try {
    const now = new Date();
    const [h, m] = activeShift.timeIn.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    let diffMs = now - start;
    if (diffMs < 0) diffMs += 24 * 3600 * 1000;
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `${hrs}س و ${mins}د`;
  } catch {
    return '';
  }
}

function getActiveBreakStr(activeShift) {
  if (!activeShift || !activeShift.breakStartTime) return '';
  try {
    const now = new Date();
    const [h, m] = activeShift.breakStartTime.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    let diffMs = now - start;
    if (diffMs < 0) diffMs += 24 * 3600 * 1000;
    const mins = Math.floor(diffMs / 60000);
    return `${mins}د`;
  } catch {
    return '';
  }
}

export function getArabicStatusBadge(status, adminApproved, branchApproved, req = null) {
  if (status === 'rejected') {
    return <span className="approval-status-badge rejected" style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>🔴 مرفوض نهائياً</span>;
  }
  if (status === 'approved' && (adminApproved || branchApproved)) {
    return <span className="approval-status-badge approved" style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>🟢 معتمد نهائياً</span>;
  }
  if (req?.branchDecision === 'rejected' || req?.branchRejected) {
    return <span className="approval-status-badge pending" style={{ background: '#ffedd5', color: '#c2410c', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>⏳ قيد نظر الإدارة (لم يوافق الفرع)</span>;
  }
  if (status === 'pending_admin' || branchApproved || (status === 'approved' && !adminApproved)) {
    return <span className="approval-status-badge pending" style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>🟡 بانتظار الإدارة العليا</span>;
  }
  if (status === 'partial') {
    return <span className="approval-status-badge pending" style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>🔵 سداد جزئي</span>;
  }
  return <span className="approval-status-badge pending" style={{ background: '#fef9c3', color: '#a16207', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>⏳ قيد المراجعة</span>;
}

export function getArabicBranchApprovalBadge(branchApproved, status, req = null) {
  if (branchApproved) {
    return <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '12.5px' }}>🟢 تم اعتمادك</span>;
  }
  if (req?.branchDecision === 'rejected' || req?.branchRejected) {
    return <span style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '12.5px' }}>❌ لم توافق (محال للإدارة)</span>;
  }
  if (status === 'rejected') {
    return <span style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '12.5px' }}>🔴 مرفوض</span>;
  }
  return <span style={{ color: '#d97706', fontWeight: 'bold', fontSize: '12.5px' }}>⏳ بانتظار موافقتك</span>;
}

export function getRequestSortTime(r) {
  if (!r) return 0;
  if (r.createdAt) {
    const t = new Date(r.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (r.timestamp) {
    const t = new Date(r.timestamp).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (r.updatedAt) {
    const t = new Date(r.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (r.id) {
    const parts = String(r.id).split('_');
    for (const p of parts) {
      const num = parseInt(p, 10);
      if (!isNaN(num) && num > 1000000000000) return num;
    }
  }
  if (r.date) {
    const t = new Date(r.date).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (r.startDate) {
    const t = new Date(r.startDate).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

export default function BranchManagerView({
  state,
  setState,
  saveState,
  currentBranch,
  activeTab = 'dashboard',
  setActiveTab,
  showToast,
  onExportExcel,
  startShift,
  pauseShift,
  resumeShift,
  stopShift,
  monthPicker: propMonthPicker,
  setMonthPicker: propSetMonthPicker,
  filterMode: propFilterMode,
  setFilterMode: propSetFilterMode,
  customFrom: propCustomFrom,
  setCustomFrom: propSetCustomFrom,
  customTo: propCustomTo,
  setCustomTo: propSetCustomTo,
  filterFn: propFilterFn,
  getEmpPermission
}) {
  const [selectedPunchEmpId, setSelectedPunchEmpId] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Roster & Request Modal Preview states
  const [previewRosterEmp, setPreviewRosterEmp] = useState(null);
  const [previewModalReq, setPreviewModalReq] = useState(null);
  const [branchReqEmpFilter, setBranchReqEmpFilter] = useState('all');
  const [branchReqDateFilter, setBranchReqDateFilter] = useState('');

  // 1. Manual Punch Request State
  const [showManualPunchModal, setShowManualPunchModal] = useState(false);
  const [manualPunchData, setManualPunchData] = useState({
    employeeId: '',
    date: getRealTodayStr(),
    punchType: 'full', // 'full' | 'in' | 'out' | 'correction'
    timeIn: '09:00',
    timeOut: '17:00',
    breakHours: '0',
    reason: ''
  });

  // 2. Bonus Request State
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusData, setBonusData] = useState({
    employeeId: '',
    amount: '',
    reason: ''
  });

  // 3. Leave Request by Manager State
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState({
    employeeId: '',
    leaveType: 'annual', // 'annual' | 'sick' | 'unpaid' | 'casual' | 'marriage' | 'maternity' | 'bereavement'
    startDate: getRealTodayStr(),
    endDate: getRealTodayStr(),
    reason: ''
  });
  const [leaveEmpFilter, setLeaveEmpFilter] = useState('all');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');

  // Propose Employee Adjustment Form state
  const [adjEmpId, setAdjEmpId] = useState('');
  const [adjType, setAdjType] = useState('bonus'); // 'bonus' | 'penalty'
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Roster Edit Request to Admin state
  const [showRosterEditModal, setShowRosterEditModal] = useState(false);
  const [rosterEditEmpId, setRosterEditEmpId] = useState('');
  const [rosterEditDetails, setRosterEditDetails] = useState('');

  // 4. Branch Manager Evaluation Modal State (Requirement 28)
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [bmEvalEmpId, setBmEvalEmpId] = useState('');
  const [bmEvalMonth, setBmEvalMonth] = useState('');
  const [bmEvalNotes, setBmEvalNotes] = useState('');
  const [bmEvalItems, setBmEvalItems] = useState([]);

  // ── State for "طلبات الفرع المرسلة للإدارة" Tab ──
  const [sentCategoryFilter, setSentCategoryFilter] = useState('all');
  const [sentStatusFilter, setSentStatusFilter] = useState('all');
  const [sentEmpFilter, setSentEmpFilter] = useState('all');
  const [sentDateFilter, setSentDateFilter] = useState('');
  const [sentSearchQuery, setSentSearchQuery] = useState('');

  // Branch Manager Date Range & Month Filter State (Persistent & Synchronized with App header)
  const activeCycleMonth = useMemo(() => {
    return getActivePayrollMonth(state?.orgSettings, getRealDate());
  }, [state?.orgSettings]);

  const [internalFilterMode, setInternalFilterMode] = useState(() => {
    try { return localStorage.getItem('bm_filter_mode') || 'month'; } catch { return 'month'; }
  });
  const [internalSelectedMonth, setInternalSelectedMonth] = useState(() => {
    try { return localStorage.getItem('bm_selected_month') || activeCycleMonth || getRealTodayStr().slice(0, 7); } catch { return activeCycleMonth || getRealTodayStr().slice(0, 7); }
  });
  const [internalCustomFromDate, setInternalCustomFromDate] = useState(() => {
    try { return localStorage.getItem('bm_custom_from') || ''; } catch { return ''; }
  });
  const [internalCustomToDate, setInternalCustomToDate] = useState(() => {
    try { return localStorage.getItem('bm_custom_to') || ''; } catch { return ''; }
  });

  const filterMode = propFilterMode || internalFilterMode;
  const setFilterMode = propSetFilterMode || setInternalFilterMode;
  const selectedMonth = propMonthPicker || internalSelectedMonth;
  const setSelectedMonth = propSetMonthPicker || setInternalSelectedMonth;
  const customFromDate = propCustomFrom !== undefined ? propCustomFrom : internalCustomFromDate;
  const setCustomFromDate = propSetCustomFrom || setInternalCustomFromDate;
  const customToDate = propCustomTo !== undefined ? propCustomTo : internalCustomToDate;
  const setCustomToDate = propSetCustomTo || setInternalCustomToDate;

  useEffect(() => {
    try {
      localStorage.setItem('bm_filter_mode', filterMode);
      localStorage.setItem('bm_selected_month', selectedMonth);
      localStorage.setItem('bm_custom_from', customFromDate);
      localStorage.setItem('bm_custom_to', customToDate);
    } catch {}
  }, [filterMode, selectedMonth, customFromDate, customToDate]);

  const cycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, state?.orgSettings);
  }, [selectedMonth, state?.orgSettings]);

  const matchesDateRange = (dateStr) => {
    return createDatePredicate({
      filterMode,
      selectedMonth,
      customFrom: customFromDate,
      customTo: customToDate,
      orgSettings: state?.orgSettings
    })(dateStr);
  };

  const renderDateFilterBar = () => (
    <div style={{
      display: 'flex',
      gap: isMobileScreen ? '8px' : '12px',
      alignItems: 'center',
      flexWrap: 'wrap',
      background: 'var(--surface)',
      padding: isMobileScreen ? '10px 12px' : '12px 16px',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: isMobileScreen ? '100%' : 'auto' }}>
        <label style={{ fontSize: '12.5px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>الفترة:</label>
        <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} style={{ flex: isMobileScreen ? 1 : 'none', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px', fontWeight: 'bold' }}>
          <option value="month">📅 دورة الشهر المالية</option>
          <option value="custom">📆 فترة مخصصة (من - إلى)</option>
        </select>
      </div>

      {filterMode === 'month' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', width: isMobileScreen ? '100%' : 'auto' }}>
          <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>الشهر:</label>
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px', fontWeight: 'bold' }} />
          <span style={{
            fontSize: '11.5px',
            background: 'var(--surface-muted)',
            padding: '3px 8px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            color: 'var(--primary)',
            fontWeight: 'bold'
          }}>
            من {cycleRange.startDate} إلى {cycleRange.endDate} ({cycleRange.daysCount} يوم)
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: isMobileScreen ? '100%' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>من:</label>
            <input type="date" value={customFromDate} onChange={(e) => setCustomFromDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>إلى:</label>
            <input type="date" value={customToDate} onChange={(e) => setCustomToDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }} />
          </div>
        </div>
      )}
    </div>
  );

  // Branch Manager New Evaluation Form State
  const [evalEmpId, setEvalEmpId] = useState('');
  const [evalMonth, setEvalMonth] = useState(new Date().toISOString().slice(0, 7));
  const [evalNotes, setEvalNotes] = useState('');
  const [evalItems, setEvalItems] = useState([
    { id: '1', title: 'الالتزام بمواعيد الحضور والانصراف', score: 10, maxScore: 10 },
    { id: '2', title: 'جودة وتنسيق تنفيذ المهام', score: 9, maxScore: 10 },
    { id: '3', title: 'التعاون مع فريق العمل والعملاء', score: 9, maxScore: 10 },
    { id: '4', title: 'المظهر العام والالتزام بالتعليمات', score: 10, maxScore: 10 }
  ]);

  // Branch Manager Evaluation Edit State
  const [mgrEditingEval, setMgrEditingEval] = useState(null);
  const [mgrEditNotes, setMgrEditNotes] = useState('');
  const [mgrEditItems, setMgrEditItems] = useState([]);

  // Identify Branch Manager Employee Profile
  const managerEmp = useMemo(() => {
    const found = (state.employees || []).find((e) => e.id === currentBranch?.managerId);
    if (found) return found;
    const branchEmp = (state.employees || []).find((e) => e.branchId === currentBranch?.id);
    if (branchEmp) return branchEmp;
    return {
      id: `mgr_${currentBranch?.id || 'default'}`,
      name: currentBranch?.name ? `مدير فرع ${currentBranch.name}` : 'مدير الفرع',
      code: 'MGR',
      jobTitle: 'مدير فرع',
      branchId: currentBranch?.id,
      salary: 650,
      annualLeaveBalance: 21,
      workHoursPerDay: 8,
      workDaysPerMonth: 26
    };
  }, [state.employees, currentBranch]);

  // Branch Employees (matching primary branch OR listed in branchesDetails, AND active)
  const branchEmployees = useMemo(() => {
    const list = (state.employees || []).filter(isEmployeeActive);
    if (!currentBranch?.id) return list;
    const cIdStr = String(currentBranch.id);
    return list.filter((e) => {
      if (e.branchId && String(e.branchId) === cIdStr) return true;
      if (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === cIdStr)) return true;
      return false;
    });
  }, [state.employees, currentBranch]);

  const deletedIdsSet = useMemo(() => {
    return new Set((state._deletedIds || []).map(String));
  }, [state._deletedIds]);

  // Branch Requests (Filtered by Higher Management Double Approval Rules & Sorted newest first)
  const branchRequests = useMemo(() => {
    const cIdStr = currentBranch?.id ? String(currentBranch.id) : null;
    const branchEmpIdSet = new Set(
      branchEmployees.flatMap((e) => [String(e.id), String(e.code || '')]).filter(Boolean)
    );

    const rawList = [...(state.requests || [])];
    const existingIds = new Set(rawList.map((r) => String(r.id)));

    (state.leaveRequests || []).forEach((lr) => {
      if (lr && !existingIds.has(String(lr.id))) {
        rawList.push({ ...lr, type: lr.type || 'leave' });
        existingIds.add(String(lr.id));
      }
    });

    (state.shiftSwaps || []).forEach((sw) => {
      if (sw && !existingIds.has(String(sw.id))) {
        rawList.push({ ...sw, type: 'swap' });
        existingIds.add(String(sw.id));
      }
    });

    (state.resignationRequests || []).forEach((res) => {
      if (res && !existingIds.has(String(res.id))) {
        rawList.push({ ...res, type: 'resignation' });
        existingIds.add(String(res.id));
      }
    });

    const list = rawList.filter((r) => {
      if (!r || !r.id) return false;
      const idStr = String(r.id);
      const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
      if (deletedIdsSet.has(idStr) || (rawId && (deletedIdsSet.has(rawId) || deletedIdsSet.has(`req_${rawId}`)))) {
        return false;
      }

      // 1. Must adhere strictly to Higher Management Double Approval Rules (Loans, advances, admin-only are excluded)
      if (!shouldShowRequestToBranch(r, state)) return false;

      if (!cIdStr) return true;

      // 2. Direct branch match on request
      if (r.branchId && String(r.branchId) === cIdStr) return true;
      // 3. Request employee belongs to this branch
      if (r.employeeId && branchEmpIdSet.has(String(r.employeeId))) return true;
      if (r.employeeCode && branchEmpIdSet.has(String(r.employeeCode))) return true;
      
      const empObj = (state.employees || []).find((e) => String(e.id) === String(r.employeeId) || (r.employeeCode && String(e.code) === String(r.employeeCode)));
      if (empObj) {
        if (empObj.branchId && String(empObj.branchId) === cIdStr) return true;
        if (empObj.branchesDetails && empObj.branchesDetails.some((bd) => String(bd.branchId) === cIdStr)) return true;
      }
      return false;
    });

    return list.sort((a, b) => getRequestSortTime(b) - getRequestSortTime(a));
  }, [state.requests, state.leaveRequests, state.shiftSwaps, state.resignationRequests, state.employees, state.approvalRules, branchEmployees, currentBranch, deletedIdsSet]);

  const filteredBranchRequests = useMemo(() => {
    const list = branchRequests.filter((r) => {
      if (branchReqEmpFilter !== 'all' && String(r.employeeId) !== String(branchReqEmpFilter)) return false;
      if (branchReqDateFilter) {
        const rDate = (r.createdAt ? r.createdAt.slice(0, 10) : (r.startDate || r.date || ''));
        if (!rDate.startsWith(branchReqDateFilter)) return false;
      }
      return true;
    });

    return list.sort((a, b) => getRequestSortTime(b) - getRequestSortTime(a));
  }, [branchRequests, branchReqEmpFilter, branchReqDateFilter]);

  // ── All Requests Sent from this Branch Manager to Higher Management (Punches, Leaves, Permissions, Penalties, Bonuses, Evaluations, Roster Edits, Resignations) ──
  const branchSentRequests = useMemo(() => {
    const cIdStr = currentBranch?.id ? String(currentBranch.id) : null;
    const branchEmpIdSet = new Set(
      branchEmployees.flatMap((e) => [String(e.id), String(e.code || '')]).filter(Boolean)
    );

    const rawList = [];
    const seenIds = new Set();

    // 1. From state.requests (Only requests sent by the branch manager to Higher Management)
    (state.requests || []).forEach((r) => {
      if (!r || !r.id || seenIds.has(String(r.id))) return;
      const idStr = String(r.id);
      const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
      if (deletedIdsSet.has(idStr) || (rawId && (deletedIdsSet.has(rawId) || deletedIdsSet.has(`req_${rawId}`)))) return;

      // Strictly exclude system automated lateness incidents & employee penalty objections
      if (
        r.subType === 'lateness' ||
        r.type === 'late_penalty' ||
        r.type === 'penalty_objection' ||
        r.type === 'objection' ||
        idStr.startsWith('req_late_inc_') ||
        idStr.startsWith('late_inc_') ||
        idStr.startsWith('obj_')
      ) {
        return;
      }

      const isMatchBranch = (r.branchId && String(r.branchId) === cIdStr) ||
                            (r.employeeId && branchEmpIdSet.has(String(r.employeeId))) ||
                            (r.employeeCode && branchEmpIdSet.has(String(r.employeeCode))) ||
                            branchEmployees.some(e => String(e.id) === String(r.employeeId));

      if (!isMatchBranch) return;

      // Check if sent by branch manager:
      const isSentByBranch = Boolean(
        r.submittedByBranchManager ||
        r.createdBy === 'branch' ||
        r.creatorRole === 'branch' ||
        r.requestedBy === 'branch' ||
        r.senderRole === 'branch' ||
        r.subType === 'manual_punch_request' ||
        r.type === 'punch_correction' ||
        r.type === 'roster_edit_request' ||
        r.type === 'roster_edit' ||
        r.type === 'eval_edit_request' ||
        r.type === 'bonus' ||
        (r.type === 'penalty' && r.subType !== 'lateness' && !idStr.startsWith('req_late_inc_')) ||
        (r.branchApproved && r.targetApproval !== 'branch_only')
      );

      if (isSentByBranch) {
        rawList.push(r);
        seenIds.add(String(r.id));
      }
    });

    // 2. From state.leaveRequests (Leaves submitted/forwarded by branch manager)
    (state.leaveRequests || []).forEach((lr) => {
      if (!lr || !lr.id || seenIds.has(String(lr.id))) return;
      const isMatchBranch = (lr.branchId && String(lr.branchId) === cIdStr) ||
                            (lr.employeeId && branchEmpIdSet.has(String(lr.employeeId))) ||
                            branchEmployees.some(e => String(e.id) === String(lr.employeeId));
      if (!isMatchBranch) return;

      const isSentByBranch = Boolean(
        lr.submittedByBranchManager ||
        lr.createdBy === 'branch' ||
        lr.creatorRole === 'branch' ||
        lr.requestedBy === 'branch' ||
        (lr.branchApproved && lr.targetApproval !== 'branch_only')
      );

      if (isSentByBranch) {
        rawList.push({ ...lr, type: lr.type || 'leave' });
        seenIds.add(String(lr.id));
      }
    });

    // 3. From state.evaluations (Evaluations submitted by branch manager)
    (state.evaluations || []).forEach((ev) => {
      if (!ev || !ev.id || seenIds.has(String(ev.id))) return;
      const isMatchBranch = (ev.branchId && String(ev.branchId) === cIdStr) ||
                            (ev.employeeId && branchEmpIdSet.has(String(ev.employeeId))) ||
                            branchEmployees.some(e => String(e.id) === String(ev.employeeId));
      if (!isMatchBranch) return;

      const isSentByBranch = Boolean(
        ev.evaluatorRole === 'مدير الفرع' ||
        ev.managerId === managerEmp?.id ||
        ev.createdBy === 'branch' ||
        ev.branchId
      );

      if (isSentByBranch) {
        rawList.push({
          ...ev,
          type: ev.type || 'evaluation',
          typeLabel: 'تقييم أداء موظف',
          status: ev.status || (ev.adminApproved ? 'approved' : 'pending_admin'),
          details: ev.notes || (ev.items ? `تقييم بمجموع ${ev.totalScore || 0}/${ev.maxTotalScore || 100}` : 'تقييم أداء شهري')
        });
        seenIds.add(String(ev.id));
      }
    });

    return rawList.sort((a, b) => getRequestSortTime(b) - getRequestSortTime(a));
  }, [state.requests, state.leaveRequests, state.evaluations, branchEmployees, currentBranch, managerEmp, deletedIdsSet]);

  const getSentReqMeta = (r) => {
    if (!r) return { cat: 'other', label: 'طلب إداري', icon: '📋', bg: '#f8fafc', border: '#e2e8f0', text: '#334155' };
    const type = String(r.type || '').toLowerCase();
    const title = String(r.title || r.typeLabel || '').toLowerCase();

    if (type.includes('punch') || title.includes('بصم') || r.punchType) {
      return { cat: 'punch', label: '🖐️ طلب بصمة يدوي', icon: '🖐️', bg: '#fdf2f8', border: '#fbcfe8', text: '#9d174d' };
    }
    if (type.includes('perm') || title.includes('إذن') || title.includes('اذن') || title.includes('استئذان')) {
      return { cat: 'permission', label: '⏰ طلب إذن موظف', icon: '⏰', bg: '#fffbeb', border: '#fde68a', text: '#b45309' };
    }
    if (type.includes('leave') || title.includes('إجاز') || title.includes('اجاز') || r.leaveType) {
      return { cat: 'leave', label: '🏖️ طلب إجازة موظف', icon: '🏖️', bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' };
    }
    if (type === 'bonus' || title.includes('مكافأ') || title.includes('مكافأة') || title.includes('حافز')) {
      return { cat: 'adjustment', label: '🎁 طلب مكافأة / حافز', icon: '🎁', bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' };
    }
    if (type === 'penalty' || type.includes('pen') || title.includes('خصم') || title.includes('جزاء')) {
      return { cat: 'adjustment', label: '⚠️ طلب تطبيق جزاء', icon: '⚠️', bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' };
    }
    if (type.includes('eval') || title.includes('تقييم') || title.includes('شكو') || r.evalItems || r.items) {
      return { cat: 'evaluation', label: '⭐️ تقييم أداء موظف', icon: '⭐️', bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce' };
    }
    if (type.includes('roster') || title.includes('جدول')) {
      return { cat: 'roster', label: '📅 طلب تعديل جدول', icon: '📅', bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' };
    }
    if (type.includes('resign') || title.includes('استقال')) {
      return { cat: 'resignation', label: '🚪 طلب استقالة', icon: '🚪', bg: '#fff1f2', border: '#fecdd3', text: '#be123c' };
    }
    return { cat: 'other', label: r.typeLabel || '📋 طلب إداري', icon: '📋', bg: '#f8fafc', border: '#e2e8f0', text: '#334155' };
  };

  const filteredSentRequests = useMemo(() => {
    return branchSentRequests.filter((r) => {
      const meta = getSentReqMeta(r);
      // Category filter
      if (sentCategoryFilter !== 'all' && meta.cat !== sentCategoryFilter) return false;

      // Status filter
      const isApproved = r.status === 'approved' || r.adminApproved;
      const isRejected = r.status === 'rejected' || r.adminDecision === 'rejected';
      const isPending = !isApproved && !isRejected;

      if (sentStatusFilter === 'pending' && !isPending) return false;
      if (sentStatusFilter === 'approved' && !isApproved) return false;
      if (sentStatusFilter === 'rejected' && !isRejected) return false;

      // Employee filter
      if (sentEmpFilter !== 'all' && String(r.employeeId) !== String(sentEmpFilter)) return false;

      // Date filter
      if (sentDateFilter) {
        const rDate = (r.createdAt ? r.createdAt.slice(0, 10) : (r.startDate || r.date || ''));
        if (!rDate.startsWith(sentDateFilter)) return false;
      }

      // Search query
      if (sentSearchQuery.trim()) {
        const q = sentSearchQuery.trim().toLowerCase();
        const empName = (r.employeeName || '').toLowerCase();
        const empCode = (r.employeeCode || '').toLowerCase();
        const reason = (r.reason || r.details || r.notes || '').toLowerCase();
        const typeLabel = (meta.label || '').toLowerCase();
        if (!empName.includes(q) && !empCode.includes(q) && !reason.includes(q) && !typeLabel.includes(q)) return false;
      }

      return true;
    });
  }, [branchSentRequests, sentCategoryFilter, sentStatusFilter, sentEmpFilter, sentDateFilter, sentSearchQuery]);

  const sentStats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    branchSentRequests.forEach(r => {
      if (r.status === 'approved' || r.adminApproved) approved++;
      else if (r.status === 'rejected' || r.adminDecision === 'rejected') rejected++;
      else pending++;
    });
    return {
      total: branchSentRequests.length,
      pending,
      approved,
      rejected
    };
  }, [branchSentRequests]);

  // ── Calculate Manager Salary Metrics ──
  const managerSalaryMetrics = useMemo(() => {
    const hourlyBase = parseFloat(managerEmp?.salary) || 0;
    const workHoursPerDay = parseFloat(managerEmp?.workHoursPerDay) || 8;
    const workDaysPerMonth = parseFloat(managerEmp?.workDaysPerMonth) || 26;
    
    // 1. احتساب سعر اليوم = (سعر الساعة الشهري * ساعات العمل المدخلة) / أيام العمل المدخلة
    const dailyRate = workDaysPerMonth > 0 ? (hourlyBase * workHoursPerDay) / workDaysPerMonth : 0;
    // 2. احتساب سعر الساعة اليومي = سعر اليوم / ساعات العمل المدخلة
    const rate = workHoursPerDay > 0 ? dailyRate / workHoursPerDay : (workDaysPerMonth > 0 ? hourlyBase / workDaysPerMonth : hourlyBase);
    const monthlySalary = dailyRate * workDaysPerMonth;

    const managerShifts = (state.shifts || []).filter(
      (s) => s && s.employeeId === managerEmp?.id && matchesDateRange(s.date)
    );
    const totalHours = Math.round(managerShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0) * 100) / 100;
    // 3. أجر الساعات والمستحقات
    const baseEarnings = Math.round(totalHours * rate * 100) / 100;

    const managerAdjs = (state.adjustments || []).filter(
      (a) => (a.employeeId === managerEmp.id || a.employeeId === 'all') && matchesDateRange(a.date)
    );

    const totalBonus = managerAdjs
      .filter((a) => a.type === 'bonus')
      .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    const totalDeduction = managerAdjs
      .filter((a) => a.type === 'deduction' || a.type === 'penalty')
      .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    const netSalary = Math.round((baseEarnings + totalBonus - totalDeduction) * 100) / 100;

    return {
      salary: hourlyBase,
      workHoursPerDay,
      workDaysPerMonth,
      dailyRate,
      hourlyRate: rate,
      totalHours,
      baseEarnings,
      totalBonus,
      totalDeduction,
      netSalary,
      shiftsCount: managerShifts.length,
      totalBreakHours: Math.round(managerShifts.reduce((acc, s) => acc + (s.breakHours || 0), 0) * 100) / 100,
      shiftsList: managerShifts
    };
  }, [managerEmp, state.shifts, state.adjustments, selectedMonth, filterMode, customFromDate, customToDate]);

  // ── Handlers ──
  const handleManagerApproveRequest = async (reqId) => {
    let foundReq = (state.requests || []).find(r => r.id === reqId) ||
                   (state.leaveRequests || []).find(r => r.id === reqId) ||
                   (state.shiftSwaps || []).find(r => r.id === reqId) ||
                   (state.loans || []).find(r => r.id === reqId);

    if (!foundReq) {
      showToast?.('لم يتم العثور على الطلب');
      return;
    }

    const isAdminApproved = Boolean(foundReq.adminApproved);
    const isFullyApproved = isAdminApproved; // Fully approved if admin already approved

    const updatedTargetReq = {
      ...foundReq,
      branchApproved: true,
      branchDecision: 'approved',
      branchRejected: false,
      branchApprovedAt: new Date().toISOString(),
      status: isFullyApproved ? 'approved' : 'pending',
      approvedAt: isFullyApproved ? new Date().toISOString() : foundReq.approvedAt
    };

    let updatedRequests = [...(state.requests || [])];
    const reqIdx = updatedRequests.findIndex(r => r.id === reqId);
    if (reqIdx >= 0) {
      updatedRequests[reqIdx] = updatedTargetReq;
    } else {
      updatedRequests.unshift(updatedTargetReq);
    }

    let updatedRosters = [...(state.rosters || [])];
    let updatedShifts = [...(state.shifts || [])];
    let updatedLeaveRequests = [...(state.leaveRequests || [])];
    let updatedSwaps = [...(state.shiftSwaps || [])];

    // 1. If fully approved roster edit/update (only if admin approved)
    if (isFullyApproved && (updatedTargetReq.type === 'roster_update' || updatedTargetReq.type === 'roster_edit' || updatedTargetReq.type === 'roster_edit_request')) {
      const targetEmp = (state.employees || []).find(e => String(e.id) === String(updatedTargetReq.employeeId));
      const targetBStr = updatedTargetReq.branchId ? String(updatedTargetReq.branchId) : (targetEmp?.branchId ? String(targetEmp.branchId) : (currentBranch?.id ? String(currentBranch.id) : ''));
      const normalizedSch = normalizeSchedule(updatedTargetReq.schedule || updatedTargetReq.newSchedule);

      const activeRosterObj = {
        id: updatedTargetReq.id || `roster_${Date.now()}`,
        employeeId: updatedTargetReq.employeeId,
        branchId: targetBStr || updatedTargetReq.branchId || currentBranch?.id || null,
        month: updatedTargetReq.month || new Date().toISOString().slice(0, 7),
        fromDate: updatedTargetReq.fromDate,
        toDate: updatedTargetReq.toDate,
        schedule: normalizedSch,
        status: 'approved',
        approvedAt: new Date().toISOString()
      };

      const existingIdx = updatedRosters.findIndex(
        (ros) => String(ros.employeeId) === String(updatedTargetReq.employeeId) && 
                 (ros.month === updatedTargetReq.month || !updatedTargetReq.month || !ros.month) && 
                 (String(ros.branchId || '') === targetBStr || (!ros.branchId && !targetBStr))
      );

      if (existingIdx >= 0) {
        updatedRosters[existingIdx] = activeRosterObj;
      } else {
        updatedRosters = updatedRosters.filter(
          (ros) => !(String(ros.employeeId) === String(updatedTargetReq.employeeId) && String(ros.branchId || '') === targetBStr && (ros.month === updatedTargetReq.month || !updatedTargetReq.month || !ros.month))
        );
        updatedRosters.unshift(activeRosterObj);
      }
    }

    // 2. If leave request
    if (updatedTargetReq.type === 'leave' || updatedTargetReq.type === 'leave_request' || updatedTargetReq.leaveType) {
      const lIdx = updatedLeaveRequests.findIndex(lr => lr.id === reqId || (String(lr.employeeId) === String(updatedTargetReq.employeeId) && lr.startDate === updatedTargetReq.startDate));
      if (lIdx >= 0) {
        updatedLeaveRequests[lIdx] = { ...updatedLeaveRequests[lIdx], branchApproved: true, status: isFullyApproved ? 'approved' : 'pending' };
      } else {
        updatedLeaveRequests.unshift({ ...updatedTargetReq, branchApproved: true, status: isFullyApproved ? 'approved' : 'pending' });
      }
    }

    // 3. If overtime request (only if admin approved)
    if (isFullyApproved && updatedTargetReq.type === 'overtime') {
      const targetDate = updatedTargetReq.date || updatedTargetReq.startDate;
      const extraHours = parseFloat(updatedTargetReq.hours) || parseFloat(updatedTargetReq.amount) || 0;
      const existingShiftIdx = updatedShifts.findIndex(s => s.employeeId === updatedTargetReq.employeeId && s.date === targetDate);
      if (existingShiftIdx >= 0 && extraHours > 0) {
        updatedShifts[existingShiftIdx] = {
          ...updatedShifts[existingShiftIdx],
          hours: Math.round(((updatedShifts[existingShiftIdx].hours || 0) + extraHours) * 100) / 100,
          overtimeHours: extraHours
        };
      }
    }

    // 4. If shift swap request
    if (updatedTargetReq.type === 'swap' || updatedTargetReq.type === 'shift_swap') {
      const sIdx = updatedSwaps.findIndex(s => s.id === reqId);
      if (sIdx >= 0) {
        updatedSwaps[sIdx] = { ...updatedSwaps[sIdx], branchApproved: true, status: isFullyApproved ? 'approved' : 'pending' };
      } else {
        updatedSwaps.unshift({ ...updatedTargetReq, branchApproved: true, status: isFullyApproved ? 'approved' : 'pending' });
      }
    }

    // 5. If permission request approved
    if (updatedTargetReq.type === 'permission' || updatedTargetReq.type === 'إذن' || updatedTargetReq.type === 'late_permission' || updatedTargetReq.type === 'early_leave' || updatedTargetReq.permType === 'late' || updatedTargetReq.permType === 'early') {
      const permDate = updatedTargetReq.date || updatedTargetReq.startDate;
      updatedRequests = updatedRequests.map((r) => {
        if (
          String(r.employeeId) === String(updatedTargetReq.employeeId) &&
          r.date === permDate &&
          (r.subType === 'lateness' || r.type === 'late_penalty' || String(r.id).startsWith('req_late_inc_'))
        ) {
          return {
            ...r,
            status: 'approved_permission_exempt',
            isCancelled: true,
            amount: 0,
            deductionMinutes: 0,
            actionType: 'grace',
            cancellationReason: `تم إلغاء الجزاء تلقائياً لوجود إذن معتمد بتاريخ ${permDate}`
          };
        }
        return r;
      });
    }

    // Dismiss or update notification
    const updatedNotifications = (state.notifications || []).map((n) => {
      if (n.requestId === reqId) return { ...n, isRead: true, status: isFullyApproved ? 'approved' : 'pending_admin' };
      return n;
    });

    let updatedLateIncidents = [...(state.lateIncidents || [])];
    if (updatedTargetReq && updatedTargetReq.employeeId) {
      try {
        const { incidents, updatedRequests: recalcedRequests } = recalculateEmployeeCycleLateness({
          employeeId: updatedTargetReq.employeeId,
          cycleFilterFn: null,
          state: { ...state, requests: updatedRequests, shifts: updatedShifts },
          payrollCycleId: (updatedTargetReq.date || new Date().toISOString()).slice(0, 7)
        });
        if (recalcedRequests) {
          updatedRequests = recalcedRequests;
        }
        const incidentIds = new Set(incidents.map((i) => i.id));
        updatedLateIncidents = [
          ...updatedLateIncidents.filter((i) => !incidentIds.has(i.id) && String(i.employeeId) !== String(updatedTargetReq.employeeId)),
          ...incidents
        ];
      } catch (e) {
        console.error('Error auto-syncing late incidents upon manager request approval:', e);
      }
    }

    const updatedState = {
      ...state,
      requests: updatedRequests,
      rosters: updatedRosters,
      shifts: updatedShifts,
      leaveRequests: updatedLeaveRequests,
      shiftSwaps: updatedSwaps,
      notifications: updatedNotifications,
      lateIncidents: updatedLateIncidents
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(isFullyApproved ? '✅ تم اعتماد وقبول الطلب بنجاح وتطبيقه بالنظام' : '✅ تم توقيع وموافقة مدير الفرع، والطلب الآن بانتظار الاعتماد النهائي من الإدارة العليا');
  };

  const handleManagerRejectRequest = async (reqId) => {
    let foundReq = (state.requests || []).find(r => r.id === reqId) ||
                   (state.leaveRequests || []).find(r => r.id === reqId) ||
                   (state.shiftSwaps || []).find(r => r.id === reqId) ||
                   (state.loans || []).find(r => r.id === reqId);

    if (!foundReq) {
      showToast?.('لم يتم العثور على الطلب');
      return;
    }

    // Branch manager rejection: marks branchApproved: false, branchDecision: 'rejected', and stays 'pending' for Higher Management final review
    const updatedTargetReq = {
      ...foundReq,
      branchApproved: false,
      branchDecision: 'rejected',
      branchRejected: true,
      branchRejectedAt: new Date().toISOString(),
      status: 'pending' // Remains pending for Upper Management final verdict
    };

    let updatedRequests = [...(state.requests || [])];
    const reqIdx = updatedRequests.findIndex(r => r.id === reqId);
    if (reqIdx >= 0) {
      updatedRequests[reqIdx] = updatedTargetReq;
    } else {
      updatedRequests.unshift(updatedTargetReq);
    }

    let updatedLeaveRequests = [...(state.leaveRequests || [])];
    if (updatedTargetReq.type === 'leave' || updatedTargetReq.type === 'leave_request' || updatedTargetReq.leaveType) {
      const lIdx = updatedLeaveRequests.findIndex(lr => lr.id === reqId || (String(lr.employeeId) === String(updatedTargetReq.employeeId) && lr.startDate === updatedTargetReq.startDate));
      if (lIdx >= 0) {
        updatedLeaveRequests[lIdx] = { ...updatedLeaveRequests[lIdx], branchApproved: false, branchDecision: 'rejected', status: 'pending' };
      } else {
        updatedLeaveRequests.unshift(updatedTargetReq);
      }
    }

    let updatedSwaps = [...(state.shiftSwaps || [])];
    if (updatedTargetReq.type === 'swap' || updatedTargetReq.type === 'shift_swap') {
      const sIdx = updatedSwaps.findIndex(s => s.id === reqId);
      if (sIdx >= 0) {
        updatedSwaps[sIdx] = { ...updatedSwaps[sIdx], branchApproved: false, branchDecision: 'rejected', status: 'pending' };
      } else {
        updatedSwaps.unshift(updatedTargetReq);
      }
    }

    const updatedNotifications = (state.notifications || []).map((n) => {
      if (n.requestId === reqId) return { ...n, isRead: true, status: 'pending' };
      return n;
    });

    const updatedState = {
      ...state,
      requests: updatedRequests,
      leaveRequests: updatedLeaveRequests,
      shiftSwaps: updatedSwaps,
      notifications: updatedNotifications
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('⚠️ تم تسجيل عدم موافقة مدير الفرع، وتم تحويل الطلب للإدارة العليا للبت النهائي');
  };

  const handleApproveRoster = async (targetId) => {
    const updatedRosters = (state.rosters || []).map((r) => {
      if (r.id === targetId || String(r.employeeId) === String(targetId)) {
        const adminApproved = Boolean(r.adminApproved);
        return {
          ...r,
          branchApproved: true,
          status: adminApproved ? 'approved' : 'pending_admin'
        };
      }
      return r;
    });

    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === targetId || (r.employeeId === targetId && (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request'))) {
        const isAdminApproved = Boolean(r.adminApproved);
        return {
          ...r,
          branchApproved: true,
          status: isAdminApproved ? 'approved' : 'pending_admin'
        };
      }
      return r;
    });

    const updatedState = { ...state, rosters: updatedRosters, requests: updatedRequests };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم التوقيع والموافقة على الجدول من مدير الفرع، وبانتظار الاعتماد النهائي من الإدارة العليا');
  };

  const handleSubmitRosterEditRequest = async (e) => {
    e.preventDefault();
    if (!rosterEditEmpId || !rosterEditDetails.trim()) {
      showToast?.('يرجى تحديد الموظف وإدخال التفاصيل');
      return;
    }
    const emp = branchEmployees.find((e) => e.id === rosterEditEmpId);
    const newReq = {
      id: `req_roster_edit_${Date.now()}`,
      employeeId: rosterEditEmpId,
      employeeName: emp?.name || '',
      employeeCode: emp?.code || '',
      branchId: currentBranch?.id,
      type: 'roster_edit_request',
      typeLabel: 'طلب تعديل جدول شهري',
      details: rosterEditDetails.trim(),
      status: 'pending_admin',
      branchApproved: true,
      adminApproved: false,
      targetApproval: 'admin_only',
      submittedByBranchManager: true,
      createdBy: 'branch',
      creatorRole: 'branch',
      createdAt: new Date().toISOString()
    };

    const newRosterNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      requestId: newReq.id,
      type: 'roster_edit_request',
      title: `📅 طلب تعديل جدول شهري: ${currentBranch?.name || ''}`,
      message: `طلب مدير فرع ${currentBranch?.name || ''} تعديل الجدول للموظف ${emp?.name || ''}. التفاصيل: ${rosterEditDetails.trim()}`,
      employeeId: rosterEditEmpId,
      employeeName: emp?.name,
      employeeCode: emp?.code,
      branchId: currentBranch?.id,
      branchName: currentBranch?.name,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      notifications: [newRosterNotif, ...(state.notifications || [])]
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newReq, empName: emp?.name, branchName: currentBranch?.name });

    setShowRosterEditModal(false);
    setRosterEditDetails('');
    showToast?.('📤 تم إرسال طلب تعديل الجدول إلى الإدارة العليا بنجاح');
  };

  const handleSubmitEmployeeAdjustment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(adjAmount);
    if (!adjEmpId || !amount || amount <= 0 || !adjReason.trim()) {
      showToast?.('يرجى ملء بيانات المكافأة/الخصم بشكل صحيح');
      return;
    }

    const emp = branchEmployees.find((e) => e.id === adjEmpId);
    const newReq = {
      id: `req_adj_${Date.now()}`,
      employeeId: adjEmpId,
      employeeName: emp?.name || '',
      employeeCode: emp?.code || '',
      branchId: currentBranch?.id,
      type: adjType === 'bonus' ? 'bonus' : 'penalty',
      typeLabel: adjType === 'bonus' ? 'إضافة مكافأة / حافز' : 'خصم / جزاء مالي',
      amount,
      reason: adjReason.trim(),
      details: adjReason.trim(),
      status: 'pending_admin',
      branchApproved: true,
      adminApproved: false,
      targetApproval: 'admin_only',
      submittedByBranchManager: true,
      createdBy: 'branch',
      creatorRole: 'branch',
      createdAt: new Date().toISOString()
    };

    const newAdjNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      requestId: newReq.id,
      type: adjType === 'bonus' ? 'bonus' : 'penalty',
      title: `${adjType === 'bonus' ? '🎁 طلب مكافأة' : '⚠️ طلب خصم/جزاء'}: ${emp?.name || ''}`,
      message: `طلب مدير فرع ${currentBranch?.name || ''} ${adjType === 'bonus' ? 'صرف مكافأة' : 'تطبيق خصم'} بقيمة ${amount} ج.م للموظف ${emp?.name || ''} - السبب: ${adjReason.trim()}`,
      employeeId: adjEmpId,
      employeeName: emp?.name,
      employeeCode: emp?.code,
      branchId: currentBranch?.id,
      branchName: currentBranch?.name,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin'
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      notifications: [newAdjNotif, ...(state.notifications || [])]
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newReq, empName: emp?.name, branchName: currentBranch?.name });
    setAdjAmount('');
    setAdjReason('');
    showToast?.('📤 تم رفع طلب المكافأة/الخصم للإدارة العليا (لن يُطبق على أجر الموظف إلا بعد موافقة الإدارة العليا)');
  };

  // Handle Manual Punch Request Submission
  const handleSubmitManualPunchRequest = async (e) => {
    e.preventDefault();
    if (!manualPunchData.employeeId || !manualPunchData.date || !manualPunchData.reason.trim()) {
      showToast?.('يرجى ملء كافة حقول طلب البصمة اليدوية وكتابة السبب');
      return;
    }

    const emp = (state.employees || []).find((e) => String(e.id) === String(manualPunchData.employeeId));
    if (!emp) return;

    let calcGrossHours = 0;
    let calcNetHours = 0;
    const bH = Math.max(0, parseFloat(manualPunchData.breakHours) || 0);
    if (manualPunchData.timeIn && manualPunchData.timeOut) {
      const [inH, inM] = manualPunchData.timeIn.split(':').map(Number);
      const [outH, outM] = manualPunchData.timeOut.split(':').map(Number);
      let diff = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
      if (diff < 0) diff += 24 * 60;
      calcGrossHours = Math.round((diff / 60) * 100) / 100;
      calcNetHours = Math.max(0, Math.round((calcGrossHours - bH) * 100) / 100);
    }

    const reqId = `req_punch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newReq = {
      id: reqId,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: currentBranch?.id || emp.branchId,
      branchName: currentBranch?.name || 'الفرع',
      type: 'punch_correction',
      subType: 'manual_punch_request',
      typeLabel: 'طلب إضافة/تعديل بصمة يدوي',
      date: manualPunchData.date,
      timeIn: manualPunchData.timeIn || '',
      timeOut: manualPunchData.timeOut || '',
      hours: calcNetHours,
      grossHours: calcGrossHours,
      breakHours: bH,
      punchType: manualPunchData.punchType,
      reason: manualPunchData.reason.trim(),
      details: `طلب تسجيل بصمة يدوي من مدير الفرع (${manualPunchData.punchType === 'full' ? 'وردية كاملة' : manualPunchData.punchType === 'in' ? 'حضور فقط' : manualPunchData.punchType === 'out' ? 'انصراف فقط' : 'تعديل بصمة'}) | التاريخ: ${manualPunchData.date} | من ${manualPunchData.timeIn || '—'} إلى ${manualPunchData.timeOut || '—'} (صافي: ${calcNetHours} س - بريك: ${bH} س) | السبب: ${manualPunchData.reason.trim()}`,
      status: 'pending_admin',
      branchApproved: true,
      adminApproved: false,
      targetApproval: 'admin_only',
      submittedByBranchManager: true,
      createdAt: new Date().toISOString()
    };

    const newNotif = {
      id: `notif_${reqId}`,
      requestId: reqId,
      type: 'punch_correction',
      title: `🖐️ طلب تسجيل بصمة يدوي: ${emp.name}`,
      message: `طلب مدير فرع ${currentBranch?.name || ''} اعتماد بصمة يدوي للموظف ${emp.name} بتاريخ ${manualPunchData.date} (${manualPunchData.timeIn} ➔ ${manualPunchData.timeOut} | صافي: ${calcNetHours} س) - السبب: ${manualPunchData.reason.trim()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: currentBranch?.id,
      branchName: currentBranch?.name,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin'
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      notifications: [newNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newReq, empName: emp.name, branchName: currentBranch?.name });

    setShowManualPunchModal(false);
    setManualPunchData({ employeeId: '', date: getRealTodayStr(), punchType: 'full', timeIn: '09:00', timeOut: '17:00', breakHours: '0', reason: '' });
    showToast?.('📤 تم إرسال طلب البصمة اليدوية إلى الإدارة العليا للاعتماد بنجاح');
    showToast?.('📤 تم إرسال طلب البصمة اليدوية إلى الإدارة العليا للاعتماد بنجاح');
  };

  // Handle Bonus Request Submission
  const handleSubmitBonusRequest = async (e) => {
    e.preventDefault();
    const amount = parseFloat(bonusData.amount);
    if (!bonusData.employeeId || !amount || amount <= 0 || !bonusData.reason.trim()) {
      showToast?.('يرجى تحديد الموظف والمبلغ والسبب بشكل صحيح');
      return;
    }

    const emp = (state.employees || []).find((e) => String(e.id) === String(bonusData.employeeId));
    if (!emp) return;

    const reqId = `req_bonus_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newReq = {
      id: reqId,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: currentBranch?.id || emp.branchId,
      branchName: currentBranch?.name || 'الفرع',
      type: 'bonus',
      typeLabel: 'طلب صرف مكافأة / حافز',
      amount,
      reason: bonusData.reason.trim(),
      details: bonusData.reason.trim(),
      status: 'pending_admin',
      branchApproved: true,
      adminApproved: false,
      targetApproval: 'admin_only',
      submittedByBranchManager: true,
      createdAt: new Date().toISOString()
    };

    const newNotif = {
      id: `notif_${reqId}`,
      requestId: reqId,
      type: 'bonus',
      title: `🎁 طلب مكافأة موظف: ${emp.name}`,
      message: `طلب مدير فرع ${currentBranch?.name || ''} صرف مكافأة بقيمة ${amount} ج.م للموظف ${emp.name} - السبب: ${bonusData.reason.trim()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: currentBranch?.id,
      branchName: currentBranch?.name,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin'
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      notifications: [newNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newReq, empName: emp.name, branchName: currentBranch?.name });

    setShowBonusModal(false);
    setBonusData({ employeeId: '', amount: '', reason: '' });
    showToast?.('📤 تم إرسال طلب المكافأة إلى الإدارة العليا للاعتماد بنجاح');
  };

  // Handle Leave Request Submission by Branch Manager
  const handleSubmitLeaveRequest = async (e) => {
    e.preventDefault();
    if (!leaveData.employeeId || !leaveData.startDate || !leaveData.endDate || !leaveData.reason.trim()) {
      showToast?.('يرجى ملء كافة بيانات طلب الإجازة');
      return;
    }

    const emp = (state.employees || []).find((e) => String(e.id) === String(leaveData.employeeId));
    if (!emp) return;

    const start = new Date(leaveData.startDate);
    const end = new Date(leaveData.endDate);
    if (end < start) {
      showToast?.('تاريخ نهاية الإجازة يجب أن يكون بعد تاريخ البداية');
      return;
    }

    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const reqId = `req_leave_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const newReq = {
      id: reqId,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: currentBranch?.id || emp.branchId,
      branchName: currentBranch?.name || 'الفرع',
      type: 'leave',
      leaveType: leaveData.leaveType,
      typeLabel: `طلب إجازة (${leaveData.leaveType === 'annual' ? 'سنوية' : leaveData.leaveType === 'sick' ? 'مرضية' : leaveData.leaveType === 'unpaid' ? 'بدون أجر' : 'اعتيادية'})`,
      startDate: leaveData.startDate,
      endDate: leaveData.endDate,
      daysCount: diffDays,
      days: diffDays,
      reason: leaveData.reason.trim(),
      details: leaveData.reason.trim(),
      status: 'pending_admin',
      branchApproved: true,
      adminApproved: false,
      targetApproval: 'admin_only',
      submittedByBranchManager: true,
      createdAt: new Date().toISOString()
    };

    const newNotif = {
      id: `notif_${reqId}`,
      requestId: reqId,
      type: 'leave',
      title: `🏖️ طلب إجازة لموظف: ${emp.name}`,
      message: `رفع مدير فرع ${currentBranch?.name || ''} طلب إجازة (${diffDays} يوم) للموظف ${emp.name} من ${leaveData.startDate} إلى ${leaveData.endDate} - السبب: ${leaveData.reason.trim()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: currentBranch?.id,
      branchName: currentBranch?.name,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin'
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedLeaveRequests = [newReq, ...(state.leaveRequests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      leaveRequests: updatedLeaveRequests,
      notifications: [newNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newReq, empName: emp.name, branchName: currentBranch?.name });

    setShowLeaveModal(false);
    setLeaveData({ employeeId: '', leaveType: 'annual', startDate: getRealTodayStr(), endDate: getRealTodayStr(), reason: '' });
    showToast?.('📤 تم إرسال طلب الإجازة إلى الإدارة العليا للاعتماد بنجاح');
  };

  // Dynamic evaluation criteria handlers
  const handleAddEvalItem = () => {
    const newId = String(Date.now());
    setEvalItems([...evalItems, { id: newId, title: '', score: 10, maxScore: 10 }]);
  };

  // Load Job Criteria automatically when employee is selected in Branch Evaluation Modal
  useEffect(() => {
    if (!bmEvalEmpId) {
      setBmEvalItems([]);
      return;
    }
    const emp = branchEmployees.find((e) => String(e.id) === String(bmEvalEmpId)) || (state.employees || []).find((e) => String(e.id) === String(bmEvalEmpId));
    const job = emp?.jobTitle || 'general';
    const criteria = getJobEvaluationCriteria(job, state?.orgSettings || {});
    setBmEvalItems(criteria.map((c) => ({
      id: c.id || String(Date.now() + Math.random()),
      title: c.title,
      description: c.description || '',
      maxScore: c.maxScore || 20,
      score: c.maxScore || 20
    })));
  }, [bmEvalEmpId, state?.orgSettings, branchEmployees, state?.employees]);

  // Submit Monthly Evaluation by Branch Manager (Requirement 28)
  const handleSubmitBranchEvaluation = async (e) => {
    e.preventDefault();
    if (!bmEvalEmpId) {
      showToast?.('يرجى اختيار الموظف المراد تقييمه');
      return;
    }

    const empObj = branchEmployees.find((e) => String(e.id) === String(bmEvalEmpId)) || (state.employees || []).find((e) => String(e.id) === String(bmEvalEmpId));
    if (!empObj) {
      showToast?.('بيانات الموظف غير متوفرة');
      return;
    }

    const totalScore = bmEvalItems.reduce((acc, item) => acc + (parseFloat(item.score) || 0), 0);
    const maxTotalScore = bmEvalItems.reduce((acc, item) => acc + (parseFloat(item.maxScore) || 20), 0);
    const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;

    let rating = 'ممتاز';
    if (percentage < 60) rating = 'ضعيف';
    else if (percentage < 75) rating = 'مقبول';
    else if (percentage < 85) rating = 'جيد';
    else if (percentage < 95) rating = 'جيد جداً';

    const evaluatorName = currentBranch?.managerName || state.currentUserName || 'مدير الفرع';
    const targetMonth = bmEvalMonth || selectedMonth || activeCycleMonth || getRealTodayStr().slice(0, 7);

    const evalData = {
      id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      employeeId: String(empObj.id),
      employeeName: empObj.name,
      employeeCode: empObj.code,
      jobTitle: empObj.jobTitle || 'موظف',
      branchId: currentBranch?.id || empObj.branchId,
      branchName: currentBranch?.name || 'الفرع',
      evaluatorId: currentBranch?.managerId || state.currentUserId || '',
      evaluatorName: evaluatorName,
      evaluatorCode: currentBranch?.managerCode || '',
      evaluatorRole: 'مدير الفرع',
      month: targetMonth,
      date: getRealTodayStr(),
      createdAt: new Date().toISOString(),
      items: bmEvalItems,
      score: percentage,
      percentage,
      totalScore,
      maxTotalScore,
      rating,
      managerNotes: bmEvalNotes.trim(),
      notes: bmEvalNotes.trim(),
      stage: 'pending_employee',
      status: 'pending_employee',
      employeeStatus: 'pending',
      employeeComment: '',
      respondedAt: null,
      adminStatus: 'pending',
      adminComment: '',
      adminApproved: false,
      approvedAt: null
    };

    const empNotif = {
      id: `notif_eval_emp_${Date.now()}`,
      employeeId: empObj.id,
      type: 'eval_pending_employee',
      title: `⭐ تقييم شهري جديد لشهر (${targetMonth})`,
      message: `قام مدير الفرع (${evaluatorName}) برصد تقييم أدائك لشهر (${targetMonth}) بنسبة ${percentage}% (${rating}). يرجى مراجعة تفاصيل التقييم والرد بالموافقة أو إبداء الملاحظات.`,
      timestamp: new Date().toISOString(),
      read: false,
      linkTab: 'evaluations',
      evalId: evalData.id
    };

    const updatedEvals = [evalData, ...(state.evaluations || [])];
    const updatedNotifications = [empNotif, ...(state.notifications || [])];
    const updatedState = { ...state, evaluations: updatedEvals, notifications: updatedNotifications };

    setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast?.(`✅ تم حفظ تقييم الموظف (${empObj.name}) وإرساله لبوابته للمراجعة والرد الأول`);
    setShowEvalModal(false);
    setBmEvalEmpId('');
    setBmEvalNotes('');
  };


  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif" }} className="fade-in-page">

      {/* ── Top Header Profile Card for Branch (Branch Manager View) ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
        borderRadius: isMobileScreen ? '12px' : '16px',
        padding: isMobileScreen ? '14px 16px' : '20px 24px',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: isMobileScreen ? '14px' : '24px',
        boxShadow: '0 4px 16px rgba(13,148,136,0.2)',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobileScreen ? '10px' : '16px' }}>
          <div style={{
            width: isMobileScreen ? '44px' : '64px',
            height: isMobileScreen ? '44px' : '64px',
            borderRadius: '50%',
            background: '#ffffff',
            color: '#0d9488',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isMobileScreen ? '22px' : '32px',
            fontWeight: '800',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            flexShrink: 0
          }}>
            🏢
          </div>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: isMobileScreen ? '17px' : '22px', fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {currentBranch?.name ? (currentBranch.name.startsWith('فرع') ? currentBranch.name : `فرع ${currentBranch.name}`) : 'الفرع الرئيسي'}
            </h2>
            <p style={{ margin: 0, opacity: 0.95, fontSize: isMobileScreen ? '12px' : '13.5px', fontWeight: '500', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span>🏷️ كود الفرع: <strong>{currentBranch?.branchCode || currentBranch?.code || currentBranch?.id || '—'}</strong></span>
              <span>•</span>
              <span>👤 مدير الفرع: <strong>{managerEmp && managerEmp.id !== 'none' ? (managerEmp.name || getEmpDisplayName(managerEmp)) : 'لا يوجد مدير معين (مباشر للإدارة)'}</strong></span>
              {currentBranch?.address && (
                <>
                  <span>•</span>
                  <span>📍 {currentBranch.address}</span>
                </>
              )}
              {(currentBranch?.phone || currentBranch?.phones?.[0]?.number) && (
                <>
                  <span>•</span>
                  <span>📞 {currentBranch.phone || currentBranch.phones[0].number}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: isMobileScreen ? '8px' : '12px', flexWrap: 'wrap', alignItems: 'center', width: isMobileScreen ? '100%' : 'auto' }}>
          <div style={{ flex: isMobileScreen ? 1 : 'none', background: 'rgba(255,255,255,0.15)', padding: isMobileScreen ? '6px 10px' : '8px 16px', borderRadius: '10px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', display: 'block', opacity: 0.85 }}>عدد موظفي الفرع</span>
            <span style={{ fontSize: isMobileScreen ? '15px' : '18px', fontWeight: '800' }}>{branchEmployees.length} موظف</span>
          </div>
          <div style={{ flex: isMobileScreen ? 1 : 'none', background: 'rgba(255,255,255,0.15)', padding: isMobileScreen ? '6px 10px' : '8px 16px', borderRadius: '10px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', display: 'block', opacity: 0.85 }}>طلبات تنتظر الاعتماد</span>
            <span style={{ fontSize: isMobileScreen ? '15px' : '18px', fontWeight: '800' }}>
              {branchRequests.filter((r) => {
                if (r.submittedByBranchManager || r.createdRole === 'branch' || r.createdRole === 'branch_manager') return false;
                if (r.branchApproved || r.branchApprovalStatus === 'approved' || r.branchApprovalStatus === 'rejected') return false;
                if (r.status === 'pending_admin' || r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled') return false;
                return r.status === 'pending';
              }).length}
            </span>
          </div>
        </div>
      </div>

      {/* Date Range & Month Filter Bar */}
      {renderDateFilterBar()}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 1. DASHBOARD TAB ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: isMobileScreen ? '16px' : '24px' }}>
          
          {/* Quick Actions Bar */}
          <div className="card settings-card" style={{ padding: isMobileScreen ? '12px 14px' : '16px 20px', background: 'linear-gradient(135deg, #f0fdf4, #e6f7f5)', border: '1px solid #99f6e4', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ margin: '0 0 2px', fontSize: isMobileScreen ? '14px' : '15px', color: '#0f766e', fontWeight: '800' }}>
                ⚡ الإجراءات والطلبات السريعة لمدير الفرع
              </h4>
              <p style={{ margin: 0, fontSize: isMobileScreen ? '11.5px' : '12.5px', color: '#115e59' }}>
                رفع طلبات البصمات اليدوية، المكافآت، والإجازات مباشرة للاعتماد من الإدارة العليا
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobileScreen ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'auto auto auto', gap: '8px', width: isMobileScreen ? '100%' : 'auto' }}>
              <button
                className="btn btn-start"
                style={{ padding: isMobileScreen ? '8px 10px' : '8px 16px', fontSize: isMobileScreen ? '12px' : '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: '#0d9488' }}
                onClick={() => setShowManualPunchModal(true)}
              >
                🖐️ طلب بصمة يدوي
              </button>
              <button
                className="btn btn-start"
                style={{ padding: isMobileScreen ? '8px 10px' : '8px 16px', fontSize: isMobileScreen ? '12px' : '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: '#16a34a' }}
                onClick={() => setShowBonusModal(true)}
              >
                🎁 طلب مكافأة
              </button>
              <button
                className="btn btn-start"
                style={{ padding: isMobileScreen ? '8px 10px' : '8px 16px', fontSize: isMobileScreen ? '12px' : '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: '#0284c7' }}
                onClick={() => setShowLeaveModal(true)}
              >
                🏖️ طلب إجازة
              </button>
            </div>
          </div>

          {/* Branch Employees Live Punch Status Grid */}
          <div className="card settings-card" style={{ padding: isMobileScreen ? '14px' : '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: isMobileScreen ? '15px' : '16px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              👥 موظفو الفرع وتتبع البصمة الحية اليوم
            </h3>
            
            {branchEmployees.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا يوجد موظفين مسجلين بهذا الفرع حتى الآن.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobileScreen ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: isMobileScreen ? '10px' : '14px' }}>
                {branchEmployees.map((emp) => {
                  const activeShift = state.activeShifts?.[emp.id];
                  const cIdStr = String(currentBranch?.id || '');
                  const activeInThisBranch = activeShift && (String(activeShift.branchId || emp.branchId) === cIdStr);
                  const activeInOtherBranch = activeShift && !activeInThisBranch;

                  const todayStrVal = getRealTodayStr();
                  const todayShiftsInThisBranch = (state.shifts || []).filter(
                    (s) => String(s.employeeId) === String(emp.id) && s.date === todayStrVal && (String(s.branchId || emp.branchId) === cIdStr)
                  );
                  const allLeaves = [...(state.leaveRequests || []), ...(state.requests || [])];
                  const onLeaveToday = allLeaves.some(
                    (r) => String(r.employeeId) === String(emp.id) && (r.status === 'approved' || r.adminApproved) && (r.type === 'leave' || r.type === 'leave_request') && r.startDate <= todayStrVal && r.endDate >= todayStrVal
                  );

                  const daySched = getEmployeeDaySchedule(emp.id, todayStrVal, state);
                  const isOffToday = daySched && (daySched.type === 'off' || daySched.isOff);
                  const isSwappedToday = daySched?.isSwapped;

                  let statusLabel = '🔴 لم يبصم بهذا الفرع / خارج الوردية';
                  let statusBg = '#fef2f2';
                  let statusColor = '#b91c1c';

                  if (activeInThisBranch) {
                    if (activeShift.isOnBreak || activeShift.isPaused) {
                      const breakTime = getActiveBreakStr ? getActiveBreakStr(activeShift) : '';
                      statusLabel = `⏸️ في استراحة ${breakTime ? `(منذ ${breakTime})` : ''}`;
                      statusBg = '#fef3c7';
                      statusColor = '#d97706';
                    } else {
                      const workTime = getActiveElapsedStr ? getActiveElapsedStr(activeShift) : '';
                      statusLabel = `🟢 حاضر وعلى رأس العمل ${workTime ? `(${workTime})` : ''}`;
                      statusBg = '#dcfce7';
                      statusColor = '#15803d';
                    }
                  } else if (activeInOtherBranch) {
                    const otherBranch = (state.branches || []).find((b) => String(b.id) === String(activeShift.branchId));
                    statusLabel = `🏢 في وردية بفرع آخر (${otherBranch ? otherBranch.name : 'فرع آخر'})`;
                    statusBg = '#f1f5f9';
                    statusColor = '#475569';
                  } else if (todayShiftsInThisBranch.length > 0) {
                    const totalHrs = todayShiftsInThisBranch.reduce((acc, s) => acc + (s.hours || 0), 0);
                    statusLabel = `🟢 تم الحضور بهذا الفرع (${totalHrs.toFixed(2)} س)`;
                    statusBg = '#e0f2fe';
                    statusColor = '#0369a1';
                  } else if (onLeaveToday) {
                    statusLabel = '🏖️ في إجازة معتمدة';
                    statusBg = '#f0fdf4';
                    statusColor = '#16a34a';
                  } else if (isSwappedToday && isOffToday) {
                    statusLabel = `🔄 🛋️ راحة متبدلة مع ${daySched.swappedWithName || 'الزميل'}`;
                    statusBg = '#fef3c7';
                    statusColor = '#b45309';
                  } else if (isOffToday) {
                    statusLabel = '🛋️ راحة أسبوعية (OFF)';
                    statusBg = '#f8fafc';
                    statusColor = '#64748b';
                  } else if (isSwappedToday) {
                    statusLabel = `🔄 وردية متبدلة لتغطية ${daySched.swappedWithName || 'الزميل'} (${daySched.start} - ${daySched.end})`;
                    statusBg = '#fef3c7';
                    statusColor = '#b45309';
                  }

                  return (
                    <div
                      key={emp.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: isMobileScreen ? '12px' : '16px',
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s, box-shadow 0.15s'
                      }}
                      onClick={() => {
                        setSelectedPunchEmpId(emp.id);
                        setActiveTab('emp-punches');
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#e6f7f5', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '15px' }}>
                          {emp.name.charAt(0)}
                        </div>
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                          <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</h4>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{emp.jobTitle} (كود: {emp.code})</span>
                        </div>
                      </div>
                      <div style={{ background: statusBg, color: statusColor, padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', textAlign: 'center' }}>
                        {statusLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Branch Requests Summary Card */}
          <div className="card settings-card" style={{ padding: isMobileScreen ? '14px' : '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: isMobileScreen ? '15px' : '16px', color: '#1e293b' }}>📋 طلبات موظفي الفرع وحالتها لدى الإدارة العليا</h3>
              <button className="btn btn-start" onClick={() => setActiveTab('requests')} style={{ fontSize: '12px', padding: '5px 12px' }}>
                انتقال للطلبات ➔
              </button>
            </div>

            {isMobileScreen ? (
              /* Mobile Requests Card View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {branchRequests.length === 0 ? (
                  <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '16px', fontSize: '13px' }}>لا توجد طلبات مسجلة لموظفي هذا الفرع.</p>
                ) : (
                  branchRequests.slice(0, 5).map((r) => (
                    <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', background: 'var(--surface-muted)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: '800', fontSize: '13px' }}>{r.employeeName || 'موظف'}</span>
                        <span>{getFormattedRequestBadge(r.type, r.leaveType)}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '8px', lineHeight: 1.4 }}>
                        {r.reason || r.details || '—'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px' }}>
                        <span>مدير الفرع: {getArabicBranchApprovalBadge(r.branchApproved, r.status)}</span>
                        <span>الإدارة: {getArabicStatusBadge(r.status, r.adminApproved, r.branchApproved)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Desktop Table View */
              <div className="table-responsive">
                <table className="bylaws-table">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>نوع الطلب</th>
                      <th>التفاصيل / البيان</th>
                      <th>موافقة مدير الفرع</th>
                      <th>حالة الإدارة العليا</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchRequests.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>لا توجد طلبات مسجلة لموظفي هذا الفرع.</td>
                      </tr>
                    ) : (
                      branchRequests.slice(0, 5).map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: '700' }}>{r.employeeName || 'موظف'}</td>
                          <td>{getFormattedRequestBadge(r.type, r.leaveType)}</td>
                          <td style={{ fontSize: '13px' }}>{r.reason || r.details || '—'}</td>
                          <td>{getArabicBranchApprovalBadge(r.branchApproved, r.status)}</td>
                          <td>{getArabicStatusBadge(r.status, r.adminApproved, r.branchApproved)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 2. REQUESTS TAB ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <div className="card settings-card fade-in" style={{ padding: isMobileScreen ? '14px' : '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: isMobileScreen ? '15.5px' : '17px', color: '#1e293b' }}>
              📋 جميع طلبات موظفي الفرع (إجازات - أذونات - تبديل شفتات - جداول عمل)
            </h3>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', width: isMobileScreen ? '100%' : 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: isMobileScreen ? 1 : 'none' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>👤 الموظف:</label>
                <select
                  value={branchReqEmpFilter}
                  onChange={(e) => setBranchReqEmpFilter(e.target.value)}
                  style={{ flex: isMobileScreen ? 1 : 'none', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px' }}
                >
                  <option value="all">-- جميع موظفي الفرع --</option>
                  {branchEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>📅 التاريخ:</label>
                <input
                  type="date"
                  value={branchReqDateFilter}
                  onChange={(e) => setBranchReqDateFilter(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
                />
                {branchReqDateFilter && (
                  <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => setBranchReqDateFilter('')}>✕</button>
                )}
              </div>
            </div>
          </div>

          {isMobileScreen ? (
            /* Mobile Request Approval Cards View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredBranchRequests.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px', fontSize: '13px' }}>
                  لا توجد طلبات لموظفي الفرع تطابق خيارات البحث.
                </p>
              ) : (
                filteredBranchRequests.map((r) => (
                  <div key={r.id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '14px',
                    background: 'var(--surface)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800' }}>{r.employeeName || 'موظف'}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>📅 {r.createdAt ? r.createdAt.slice(0, 10) : r.startDate || '—'}</span>
                      </div>
                      <div>
                        {getFormattedRequestBadge(r.type, r.leaveType)}
                      </div>
                    </div>

                    {/* Reason / Details */}
                    {(r.reason || r.details) && (
                      <div style={{ background: 'var(--surface-muted)', padding: '8px 10px', borderRadius: '8px', fontSize: '12px', color: 'var(--text)', marginBottom: '10px', lineHeight: 1.35 }}>
                        {r.reason || r.details}
                      </div>
                    )}

                    {/* Status Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '11.5px' }}>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px' }}>موافقتك (مدير الفرع):</span>
                        {getArabicBranchApprovalBadge(r.branchApproved, r.status, r)}
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px' }}>حالة الإدارة العليا:</span>
                        {getArabicStatusBadge(r.status, r.adminApproved, r.branchApproved, r)}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid var(--border-light, #f1f5f9)', paddingTop: '10px' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ flex: 1, padding: '7px 0', fontSize: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => setPreviewModalReq(r)}
                      >
                        <span>👁️</span>
                        <span>معاينة</span>
                      </button>
                      {(!r.branchApproved && !r.branchRejected && r.status !== 'rejected') && (
                        <>
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ flex: 1.2, padding: '7px 0', fontSize: '12px', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            onClick={() => handleManagerApproveRequest(r.id)}
                          >
                            <span>✓</span>
                            <span>موافقة</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ flex: 1, padding: '7px 0', fontSize: '12px', color: 'var(--danger)', border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            onClick={() => handleManagerRejectRequest(r.id)}
                          >
                            <span>✕</span>
                            <span>رفض</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Desktop Requests Table View */
            <div className="table-responsive">
              <table className="bylaws-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الموظف</th>
                    <th>نوع الطلب</th>
                    <th>موافقتك (مدير الفرع)</th>
                    <th>حالة الإدارة العليا</th>
                    <th>الإجراءات والمعاينة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBranchRequests.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                        لا توجد طلبات لموظفي الفرع تطابق خيارات البحث.
                      </td>
                    </tr>
                  ) : (
                    filteredBranchRequests.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontSize: '12.5px' }}>{r.createdAt ? r.createdAt.slice(0, 10) : r.startDate || '—'}</td>
                        <td style={{ fontWeight: '700' }}>{r.employeeName || 'موظف'}</td>
                        <td>{getFormattedRequestBadge(r.type, r.leaveType)}</td>
                        <td>{getArabicBranchApprovalBadge(r.branchApproved, r.status, r)}</td>
                        <td>{getArabicStatusBadge(r.status, r.adminApproved, r.branchApproved, r)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                              onClick={() => setPreviewModalReq(r)}
                            >
                              👁️ معاينة الطلب
                            </button>
                            {(!r.branchApproved && !r.branchRejected && r.status !== 'rejected') && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-start"
                                  style={{ padding: '4px 10px', fontSize: '12px' }}
                                  onClick={() => handleManagerApproveRequest(r.id)}
                                >
                                  ✓ موافقة
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }}
                                  onClick={() => handleManagerRejectRequest(r.id)}
                                >
                                  ✕ رفض
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Request Details & Preview Modal for Branch Manager ── */}
      {previewModalReq && (() => {
        const empObj = (state.employees || []).find(e => String(e.id) === String(previewModalReq.employeeId));
        const branchObj = (state.branches || []).find(b => b.id === (previewModalReq.branchId || empObj?.branchId));
        const targetEmpObj = (state.employees || []).find(e => String(e.id) === String(previewModalReq.targetEmpId || previewModalReq.targetEmployeeId || previewModalReq.peerEmployeeId));

        const calculateLeaveDays = () => {
          if (previewModalReq.daysCount) return previewModalReq.daysCount;
          if (previewModalReq.days) return previewModalReq.days;
          if (previewModalReq.startDate && previewModalReq.endDate) {
            const s = new Date(previewModalReq.startDate);
            const e = new Date(previewModalReq.endDate);
            if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
              const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
              return diff > 0 ? diff : 1;
            }
          }
          return 1;
        };

        const isLeave = ['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave'].includes(previewModalReq.type);
        const isLoan = ['loan', 'advance', 'meds', 'credit_medicine'].includes(previewModalReq.type);
        const isPermission = previewModalReq.type === 'permission' || previewModalReq.type === 'permission_request';
        const isSwap = ['swap', 'shift_swap', 'shift_edit'].includes(previewModalReq.type);
        const isPunch = ['punch_correction', 'تأكيد بصمة الوجه', 'تأكيد بصمة اليد', 'manual_punch', 'attendance_punch'].includes(previewModalReq.type) || Boolean(previewModalReq.punchType);
        const isPenalty = previewModalReq.type === 'penalty';
        const isBonus = previewModalReq.type === 'bonus';
        const isEvaluation = ['evaluation', 'emp_evaluation', 'manager_eval'].includes(previewModalReq.type) || Boolean(previewModalReq.evalItems || previewModalReq.items);
        const isRoster = ['roster_update', 'roster_edit', 'roster_edit_request'].includes(previewModalReq.type);

        const totalAmount = parseFloat(previewModalReq.amount) || 0;
        const monthlyDed = parseFloat(previewModalReq.monthlyDeduction || previewModalReq.installmentAmount) || 0;
        const isInstallment = previewModalReq.loanType === 'installments' || previewModalReq.isInstallment || (monthlyDed > 0 && monthlyDed < totalAmount) || (parseInt(previewModalReq.installmentsCount, 10) > 1);
        const installmentsCount = previewModalReq.installmentsCount || previewModalReq.monthsCount || (monthlyDed > 0 ? Math.ceil(totalAmount / monthlyDed) : 1);
        const isBranchNotReq = previewModalReq.targetApproval === 'admin_only' || previewModalReq.targetApproval === 'admin' || isLoan || previewModalReq.branchNotRequired || previewModalReq.isDirectToAdmin;

        return (
          <div className="modal-overlay" onClick={() => setPreviewModalReq(null)} style={{ zIndex: 1100 }}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px', width: '92%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
              
              {/* Modal Top Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '2px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>👁️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                      تفاصيل ومعاينة الطلب الكاملة
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      معرف الطلب: #{previewModalReq.id}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getFormattedRequestBadge(previewModalReq.type, previewModalReq.leaveType)}
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '14px' }} onClick={() => setPreviewModalReq(null)}>✕ إغلاق</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13.5px' }}>
                
                {/* 1. Employee Info Card */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    👤 بيانات الموظف ومقدم الطلب:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>اسم الموظف:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)', fontSize: '14px' }}>
                        {empObj ? getEmpDisplayName(empObj) : (previewModalReq.employeeName || 'غير معروف')}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>الكود الوظيفي:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                        {previewModalReq.employeeCode || empObj?.code || '—'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>الفرع:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                        🏢 {branchObj?.name ? `فرع ${branchObj.name}` : (currentBranch?.name ? `فرع ${currentBranch.name}` : 'الفرع')}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>المسمى الوظيفي:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                        💼 {empObj?.jobTitle || 'كادر وظيفي'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>تاريخ ووقت الإرسال:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                        📅 {previewModalReq.createdAt ? previewModalReq.createdAt.slice(0, 10) : previewModalReq.date || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Approvals Status Bar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>موقف موافقتك (مدير الفرع):</span>
                    <div style={{ marginTop: '4px', fontWeight: 'bold', fontSize: '13.5px' }}>
                      {isBranchNotReq ? (
                        <span style={{ color: '#475569' }}>🔒 موجهة للإدارة العليا مباشرة</span>
                      ) : previewModalReq.branchApproved ? (
                        <span style={{ color: '#16a34a' }}>🟢 معتمد وموافق عليه من طرفك</span>
                      ) : (
                        <span style={{ color: '#d97706' }}>⏳ بانتظار قرارك واعتمادك</span>
                      )}
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>موقف اعتماد الإدارة العليا:</span>
                    <div style={{ marginTop: '4px', fontWeight: 'bold', fontSize: '13.5px' }}>
                      {previewModalReq.status === 'approved' ? (
                        <span style={{ color: '#16a34a' }}>🟢 معتمد نهائياً ومطبق بالنظام</span>
                      ) : previewModalReq.status === 'rejected' ? (
                        <span style={{ color: '#dc2626' }}>🔴 مرفوض من الإدارة</span>
                      ) : (
                        <span style={{ color: '#d97706' }}>🟡 بانتظار قرار واعتماد الإدارة العليا</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Type-Specific Details */}
                {/* ── LEAVE DETAILS ── */}
                {isLeave && (
                  <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏖️ تفاصيل الإجازة المطلوبة:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>نوع الإجازة:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d', fontSize: '14px' }}>
                          {previewModalReq.leaveType === 'annual' ? 'إجازة سنوية اعتيادية' : previewModalReq.leaveType === 'sick' ? 'إجازة مرضية' : previewModalReq.leaveType === 'unpaid' ? 'إجازة بدون أجر' : 'إجازة رسمية'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>تاريخ البدء:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          📅 {previewModalReq.startDate || '—'} {previewModalReq.startDate && `(${getArabicWeekday(previewModalReq.startDate)})`}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>تاريخ الانتهاء:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          📅 {previewModalReq.endDate || '—'} {previewModalReq.endDate && `(${getArabicWeekday(previewModalReq.endDate)})`}
                        </div>
                      </div>
                      <div style={{ background: '#dcfce7', padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>إجمالي عدد أيام الإجازة:</span>
                        <div style={{ fontWeight: '900', color: '#15803d', fontSize: '16px' }}>
                          ⏱️ {calculateLeaveDays()} أيام
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── LOAN / ADVANCE / MEDS DETAILS ── */}
                {isLoan && (
                  <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#1e40af', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      💳 تفاصيل السلفة / الدواء الآجل:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div style={{ background: '#dbeafe', padding: '10px 14px', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                        <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 'bold' }}>إجمالي المبلغ المطلوب:</span>
                        <div style={{ fontWeight: '900', color: '#1d4ed8', fontSize: '17px' }}>
                          💰 {totalAmount} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>نظام السداد والخصم:</span>
                        <div style={{ fontWeight: 'bold', color: '#1e3a8a', fontSize: '13.5px' }}>
                          {isInstallment ? '📆 سلفة مقسطة على عدة شهور' : '💵 سلفة شهرية (خصم دفعة واحدة)'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>عدد الأقساط الشهرية:</span>
                        <div style={{ fontWeight: 'bold', color: '#1e3a8a' }}>
                          {installmentsCount} شهر / قسط
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>قيمة الخصم الشهري (القسط):</span>
                        <div style={{ fontWeight: 'bold', color: '#1d4ed8', fontSize: '14px' }}>
                          {monthlyDed > 0 ? `${monthlyDed} ج.م / شهر` : `${totalAmount} ج.م`}
                        </div>
                      </div>
                    </div>

                    {/* Medicines Detail Table if Credit Medicine */}
                    {(() => {
                      const medItemsList = previewModalReq.medicines || previewModalReq.medsItems || previewModalReq.items || previewModalReq.medsDetails || [];
                      if (medItemsList.length === 0) return null;

                      return (
                        <div style={{ marginTop: '14px', background: '#fff', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #0d9488', boxShadow: '0 2px 5px rgba(13,148,136,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            <h5 style={{ margin: 0, color: '#0f766e', fontSize: '13.5px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>💊</span>
                              <span>بيان وقائمة الأصناف والأدوية المطلوبة بالآجل ({medItemsList.length} صنف):</span>
                            </h5>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f766e', background: '#ccfbf1', padding: '3px 10px', borderRadius: '6px' }}>
                              إجمالي تكلفة الأصناف: {fmt(previewModalReq.totalAmount || previewModalReq.amount || totalAmount)} ج.م
                            </span>
                          </div>
                          <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                              <thead>
                                <tr style={{ background: '#f0fdfa', color: '#134e4a', fontWeight: 'bold' }}>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '6%' }}>#</th>
                                  <th style={{ padding: '6px 12px', border: '1px solid #99f6e4', width: '42%', textAlign: 'right' }}>اسم الدواء / الصنف</th>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '18%' }}>سعر الوحدة</th>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '14%' }}>الكمية</th>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '20%' }}>الإجمالي الصافي</th>
                                </tr>
                              </thead>
                              <tbody>
                                {medItemsList.map((item, idx) => {
                                  const itemPrice = parseFloat(item.price) || 0;
                                  const itemQty = parseFloat(item.qty || item.quantity) || 1;
                                  const itemTotal = itemPrice * itemQty;
                                  return (
                                    <tr key={item.id || idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f0fdfa' }}>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4' }}>{idx + 1}</td>
                                      <td style={{ padding: '6px 12px', border: '1px solid #99f6e4', textAlign: 'right', fontWeight: 'bold', color: '#0f766e' }}>
                                        {item.name || item.title || 'دواء / صنف'}
                                      </td>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4' }}>{fmt(itemPrice)} ج.م</td>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: 'bold' }}>{itemQty}</td>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: 'bold', color: '#0d9488' }}>
                                        {fmt(itemTotal)} ج.م
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: '#ccfbf1', fontWeight: 'bold', color: '#0f766e', fontSize: '12.5px' }}>
                                  <td colSpan="4" style={{ padding: '6px 12px', border: '1px solid #99f6e4', textAlign: 'right' }}>
                                    المجموع الكلي المطلوب للأدوية:
                                  </td>
                                  <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: '900', color: '#0f766e' }}>
                                    {fmt(previewModalReq.totalAmount || previewModalReq.amount || totalAmount)} ج.م
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── PERMISSION DETAILS ── */}
                {isPermission && (() => {
                  const permDurationTxt = (() => {
                    if (previewModalReq.durationText) return previewModalReq.durationText;
                    if (previewModalReq.durationMinutes) {
                      const hrs = Math.floor(previewModalReq.durationMinutes / 60);
                      const mins = previewModalReq.durationMinutes % 60;
                      let txt = '';
                      if (hrs > 0) txt += `${hrs} ساعة `;
                      if (mins > 0) txt += `${mins} دقيقة`;
                      return txt || `${previewModalReq.durationMinutes} دقيقة`;
                    }
                    if (previewModalReq.hours) return `${previewModalReq.hours} ساعة`;
                    const st = previewModalReq.startTime || previewModalReq.fromTime;
                    const et = previewModalReq.endTime || previewModalReq.toTime;
                    if (st && et) {
                      const [h1, m1] = st.split(':').map(Number);
                      const [h2, m2] = et.split(':').map(Number);
                      let start = (h1 || 0) * 60 + (m1 || 0);
                      let end = (h2 || 0) * 60 + (m2 || 0);
                      if (end <= start) end += 24 * 60;
                      const diff = end - start;
                      const hrs = Math.floor(diff / 60);
                      const mins = diff % 60;
                      let txt = '';
                      if (hrs > 0) txt += `${hrs} ساعة `;
                      if (mins > 0) txt += `${mins} دقيقة`;
                      return txt || `${diff} دقيقة`;
                    }
                    return '—';
                  })();

                  const permTypeLabel = previewModalReq.permType === 'early' ? 'إذن انصراف مبكر' : (previewModalReq.permType === 'late' ? 'إذن تأخير عن الوردية' : 'إذن خروج / تأخير');

                  return (
                    <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h4 style={{ margin: 0, color: '#92400e', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          ⏰ تفاصيل إذن الخروج / التأخير:
                        </h4>
                        <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          {permTypeLabel}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: '#92400e' }}>يوم وتاريخ الإذن:</span>
                          <div style={{ fontWeight: 'bold', color: '#78350f' }}>
                            📅 {previewModalReq.date || previewModalReq.startDate || '—'} { (previewModalReq.date || previewModalReq.startDate) && `(${getArabicWeekday(previewModalReq.date || previewModalReq.startDate)})` }
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: '#92400e' }}>فترة الإذن بالساعات:</span>
                          <div style={{ fontWeight: 'bold', color: '#78350f', fontSize: '14px' }}>
                            من <strong>{previewModalReq.startTime || previewModalReq.fromTime || '09:00'}</strong> إلى <strong>{previewModalReq.endTime || previewModalReq.toTime || '17:00'}</strong>
                          </div>
                        </div>
                        <div style={{ background: '#fef3c7', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                          <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 'bold' }}>إجمالي مدة الإذن:</span>
                          <div style={{ fontWeight: '900', color: '#b45309', fontSize: '16px' }}>
                            ⏱️ {permDurationTxt}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── SHIFT SWAP DETAILS ── */}
                {isSwap && (
                  <div style={{ background: '#f5f3ff', padding: '16px', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#5b21b6', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🔄 تفاصيل تبديل الشيفت والراحات بين الموظفين:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                      <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #c4b5fd' }}>
                        <span style={{ fontSize: '12px', color: '#5b21b6', fontWeight: 'bold' }}>1. الموظف الطالب (الطرف الأول):</span>
                        <div style={{ fontWeight: 'bold', color: '#4c1d95', marginTop: '2px' }}>
                          {previewModalReq.employeeName || empObj?.name || 'مقدم الطلب'} {empObj?.code ? `(كود: ${empObj.code})` : ''}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6d28d9', marginTop: '4px' }}>
                          📅 تاريخ شيفت الموظف: <strong>{previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date || '—'}</strong> { (previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date) && `(${getArabicWeekday(previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date)})` }
                        </div>
                      </div>

                      <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #c4b5fd' }}>
                        <span style={{ fontSize: '12px', color: '#5b21b6', fontWeight: 'bold' }}>2. الزميل البديل (الطرف الثاني):</span>
                        <div style={{ fontWeight: 'bold', color: '#4c1d95', marginTop: '2px' }}>
                          {previewModalReq.targetEmpName || targetEmpObj?.name || 'الزميل البديل'} {targetEmpObj?.code ? `(كود: ${targetEmpObj.code})` : ''}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6d28d9', marginTop: '4px' }}>
                          📅 تاريخ شيفت الزميل: <strong>{previewModalReq.targetDate || previewModalReq.peerDate || '—'}</strong> { (previewModalReq.targetDate || previewModalReq.peerDate) && `(${getArabicWeekday(previewModalReq.targetDate || previewModalReq.peerDate)})` }
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PUNCH CORRECTION DETAILS ── */}
                {isPunch && (
                  <div style={{ background: '#fdf2f8', padding: '16px', borderRadius: '12px', border: '1px solid #fbcfe8' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#9d174d', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📸 تفاصيل بصمة الوجه / الحضور:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>نوع العملية:</span>
                        <div style={{ fontWeight: 'bold', color: '#831843' }}>
                          {previewModalReq.targetAction === 'shift_start' ? 'تسجيل بداية وردية (حضور)' : previewModalReq.targetAction === 'shift_end' ? 'تسجيل نهاية وردية (انصراف)' : previewModalReq.targetAction === 'break_start' ? 'بدء استراحة' : previewModalReq.targetAction === 'break_end' ? 'عودة من استراحة' : 'بصمة حضور وانصراف'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>توقيت التقاط البصمة:</span>
                        <div style={{ fontWeight: 'bold', color: '#831843' }}>
                          ⏰ {previewModalReq.time || (previewModalReq.createdAt ? previewModalReq.createdAt.slice(11, 16) : '—')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PENALTY DETAILS ── */}
                {isPenalty && (
                  <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#991b1b', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⚠️ تفاصيل الخصم / الجزاء الإداري:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#991b1b' }}>نوع البند:</span>
                        <div style={{ fontWeight: 'bold', color: '#7f1d1d' }}>
                          {previewModalReq.subType === 'lateness' ? '🏃‍♂️ تأخير عن موعد العمل المجدول' : 'مخالفة لائحة'}
                        </div>
                      </div>
                      {previewModalReq.latenessMinutes && (
                        <div>
                          <span style={{ fontSize: '12px', color: '#991b1b' }}>مدة التأخير:</span>
                          <div style={{ fontWeight: 'bold', color: '#7f1d1d' }}>
                            ⏱️ {previewModalReq.latenessMinutes} دقيقة
                          </div>
                        </div>
                      )}
                      <div>
                        <span style={{ fontSize: '12px', color: '#991b1b' }}>مبلغ الخصم المقترح:</span>
                        <div style={{ fontWeight: '900', color: '#b91c1c', fontSize: '16px' }}>
                          💸 {previewModalReq.amount || '0'} ج.م
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── BONUS DETAILS ── */}
                {isBonus && (
                  <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#047857', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🎁 تفاصيل طلب المكافأة / الحافز:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#047857' }}>نوع الإجراء:</span>
                        <div style={{ fontWeight: 'bold', color: '#065f46' }}>
                          ➕ إضافة مكافأة / حافز للموظف
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#047857' }}>قيمة المكافأة المقترحة:</span>
                        <div style={{ fontWeight: '900', color: '#047857', fontSize: '18px' }}>
                          💰 +{previewModalReq.amount || '0'} ج.م
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── MANUAL PUNCH DETAILS ── */}
                {Boolean(previewModalReq.punchType || previewModalReq.type === 'manual_punch') && (
                  <div style={{ background: '#fdf2f8', padding: '16px', borderRadius: '12px', border: '1px solid #fbcfe8' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#9d174d', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🖐️ تفاصيل طلب البصمة اليدوية:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>تاريخ البصمة:</span>
                        <div style={{ fontWeight: 'bold', color: '#831843' }}>
                          📅 {previewModalReq.date || '—'} {previewModalReq.date && `(${getArabicWeekday(previewModalReq.date)})`}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>نوع التسجيل:</span>
                        <div style={{ fontWeight: 'bold', color: '#831843' }}>
                          {previewModalReq.punchType === 'full' ? 'وردية كاملة (حضور وانصراف)' : previewModalReq.punchType === 'in' ? 'حضور فقط' : previewModalReq.punchType === 'out' ? 'انصراف فقط' : 'تصحيح بصمة'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>وقت الحضور:</span>
                        <div style={{ fontWeight: 'bold', color: '#15803d' }}>
                          🟢 {previewModalReq.timeIn || previewModalReq.time || '—'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>وقت الانصراف:</span>
                        <div style={{ fontWeight: 'bold', color: '#dc2626' }}>
                          🔴 {previewModalReq.timeOut || '—'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>ساعات البريك:</span>
                        <div style={{ fontWeight: 'bold', color: '#831843' }}>
                          ☕ {previewModalReq.breakHours || '0'} ساعة
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── EVALUATION DETAILS ── */}
                {isEvaluation && (
                  <div style={{ background: '#faf5ff', padding: '16px', borderRadius: '12px', border: '1px solid #e9d5ff' }}>
                    <h4 style={{ margin: '0 0 12px', color: '#6b21a8', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⭐️ تفاصيل تقييم الأداء والدرجات:
                    </h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f3e8ff', padding: '10px 14px', borderRadius: '10px', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 'bold', color: '#581c87', fontSize: '13px' }}>
                        📅 شهر التقييم: {previewModalReq.month || previewModalReq.evalMonth || 'الشهر الحالي'}
                      </span>
                      <span style={{ background: '#7e22ce', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontWeight: '900', fontSize: '14px' }}>
                        الدرجة الإجمالية: {previewModalReq.totalScore || previewModalReq.score || '—'} / {previewModalReq.maxTotalScore || previewModalReq.maxScore || '100'}
                      </span>
                    </div>

                    {Array.isArray(previewModalReq.items || previewModalReq.evalItems) && (previewModalReq.items || previewModalReq.evalItems).length > 0 && (
                      <div className="table-responsive" style={{ maxHeight: '250px', overflowY: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                        <table className="table" style={{ fontSize: '12.5px', width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f5f3ff', color: '#6b21a8' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'right' }}>#</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right' }}>بند التقييم</th>
                              <th style={{ padding: '6px 10px', textAlign: 'center' }}>الدرجة المستحقة</th>
                              <th style={{ padding: '6px 10px', textAlign: 'center' }}>الدرجة العظمى</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(previewModalReq.items || previewModalReq.evalItems).map((it, i) => (
                              <tr key={it.id || i} style={{ borderBottom: '1px solid #f3e8ff' }}>
                                <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{i + 1}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 'bold', color: '#334155' }}>{it.title || it.name}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 'bold', color: '#7e22ce' }}>{it.score}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--muted)' }}>{it.maxScore || 10}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ROSTER EDIT DETAILS & COMPARISON (الجدول السابق مقابل الجديد) ── */}
                {isRoster && (() => {
                  const existingRoster = (state.rosters || []).find(r => 
                    String(r.employeeId) === String(previewModalReq.employeeId) &&
                    (!previewModalReq.month || r.month === previewModalReq.month) &&
                    (String(r.branchId || '') === String(previewModalReq.branchId || '') || !previewModalReq.branchId)
                  );

                  const prevSchedule = normalizeSchedule(previewModalReq.oldSchedule || previewModalReq.previousSchedule || existingRoster?.schedule);
                  const newSchedule = normalizeSchedule(previewModalReq.schedule || previewModalReq.newSchedule);

                  const standardDays = [
                    { key: 'السبت', label: 'السبت' },
                    { key: 'الأحد', label: 'الأحد' },
                    { key: 'الاثنين', label: 'الاثنين' },
                    { key: 'الثلاثاء', label: 'الثلاثاء' },
                    { key: 'الأربعاء', label: 'الأربعاء' },
                    { key: 'الخميس', label: 'الخميس' },
                    { key: 'الجمعة', label: 'الجمعة' },
                  ];

                  const isIsoDate = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);
                  const customDateKeys = Object.keys(previewModalReq.schedule || {}).filter(isIsoDate);
                  const hasCustomDates = customDateKeys.length > 0;

                  const displayList = hasCustomDates 
                    ? customDateKeys.sort().map(dateKey => {
                        const d = new Date(dateKey);
                        const arDay = !isNaN(d.getTime()) ? d.toLocaleDateString('ar-EG', { weekday: 'long' }) : '';
                        return { key: dateKey, label: arDay ? `${dateKey} (${arDay})` : dateKey };
                      })
                    : standardDays;

                  return (
                    <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid #cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          📅 مقارنة ومعاينة تعديل الجدول الشهري (الجدول السابق مقابل الجديد):
                        </h4>
                        <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                          الشهر: {previewModalReq.month || 'الشهر الحالي'}
                        </span>
                      </div>

                      {previewModalReq.details && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', color: '#334155' }}>
                          <strong>📝 تفاصيل التعديل المطلوبة: </strong> {previewModalReq.details}
                        </div>
                      )}

                      <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                        <table className="table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                              <th style={{ padding: '8px 10px' }}>اليوم</th>
                              <th style={{ padding: '8px 10px', background: '#fee2e2', color: '#991b1b' }}>⏮️ الجدول السابق (قبل التعديل)</th>
                              <th style={{ padding: '8px 10px', background: '#dcfce7', color: '#166534' }}>⏭️ الجدول الجديد (بعد التعديل)</th>
                              <th style={{ padding: '8px 10px' }}>موقف التغيير</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayList.map((dayItem) => {
                              const oldDay = prevSchedule[dayItem.key] || { type: dayItem.key === 'الجمعة' ? 'off' : 'shift', start: '08:00', end: '16:00' };
                              const newDay = newSchedule[dayItem.key] || oldDay;

                              const isOldOff = oldDay.type === 'off' || oldDay.isOff === true;
                              const isNewOff = newDay.type === 'off' || newDay.isOff === true;

                              const oldStart = oldDay.start || oldDay.checkIn || (isOldOff ? '—' : '08:00');
                              const oldEnd = oldDay.end || oldDay.checkOut || (isOldOff ? '—' : '16:00');

                              const newStart = newDay.start || newDay.checkIn || (isNewOff ? '—' : '08:00');
                              const newEnd = newDay.end || newDay.checkOut || (isNewOff ? '—' : '16:00');

                              const isChanged = (isOldOff !== isNewOff) || (oldStart !== newStart) || (oldEnd !== newEnd);

                              return (
                                <tr key={dayItem.key} style={{ background: isChanged ? '#fffbeb' : '#fff', borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ fontWeight: 'bold', color: '#334155' }}>{dayItem.label}</td>
                                  
                                  {/* Previous Schedule */}
                                  <td style={{ background: isOldOff ? '#fef2f2' : 'transparent' }}>
                                    {isOldOff ? (
                                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>🔴 راحة أسبوعية</span>
                                    ) : (
                                      <div>
                                        <span className="badge badge-success" style={{ fontSize: '11px' }}>🟢 وردية عمل</span>
                                        <div style={{ fontSize: '12px', marginTop: '3px', color: '#475569' }}>
                                          من <strong>{oldStart}</strong> إلى <strong>{oldEnd}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* New Schedule */}
                                  <td style={{ background: isNewOff ? '#fef2f2' : 'transparent' }}>
                                    {isNewOff ? (
                                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>🔴 راحة أسبوعية</span>
                                    ) : (
                                      <div>
                                        <span className="badge badge-success" style={{ fontSize: '11px' }}>🟢 وردية عمل</span>
                                        <div style={{ fontSize: '12px', marginTop: '3px', color: '#15803d', fontWeight: 'bold' }}>
                                          من <strong>{newStart}</strong> إلى <strong>{newEnd}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* Change Status */}
                                  <td>
                                    {isChanged ? (
                                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', display: 'inline-block' }}>
                                        ⚡ تم التعديل
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>مطابق</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Reason & Notes Card */}
                <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 8px', color: 'var(--primary-dark)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📝 شرح الطلب والسبب المذكور:
                  </h4>
                  <div style={{ lineHeight: 1.7, color: '#334155', background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                    {previewModalReq.reason || previewModalReq.details || previewModalReq.notes || previewModalReq.subject || 'لا يوجد شرح أو سبب إضافي مذكور'}
                  </div>

                  {previewModalReq.photoUrl && (
                    <div style={{ marginTop: '14px' }}>
                      <h5 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--primary)' }}>📷 المرفقات والصور المسجلة:</h5>
                      <div style={{ textAlign: 'center', background: '#000', padding: '8px', borderRadius: '8px' }}>
                        <img src={previewModalReq.photoUrl} alt="صورة المرفق" style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain', borderRadius: '6px' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '8px 18px', fontSize: '13px' }}
                  onClick={() => setPreviewModalReq(null)}
                >
                  إغلاق النافذة
                </button>

                {(!previewModalReq.branchApproved && previewModalReq.status !== 'rejected') && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-start"
                      style={{ padding: '8px 20px', fontSize: '13.5px' }}
                      onClick={async () => {
                        const id = previewModalReq.id;
                        setPreviewModalReq(null);
                        await handleManagerApproveRequest(id);
                      }}
                    >
                      ✓ موافقة واعتماد مدير الفرع
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '8px 18px', fontSize: '13.5px', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                      onClick={async () => {
                        const id = previewModalReq.id;
                        setPreviewModalReq(null);
                        await handleManagerRejectRequest(id);
                      }}
                    >
                      ✕ رفض الطلب
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 3. BRANCH ROSTER TAB (With Preview Modal) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'branch-roster' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '17px', color: '#1e293b' }}>📅 الجدول الشهري لموظفي الفرع والموافقات</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold' }}>تحديد الشهر:</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                  style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold' }}
                />
              </div>
              <button className="btn btn-start" onClick={() => setShowRosterEditModal(true)}>
                ✏️ طلب من الإدارة العليا تعديل جدول موظف
              </button>
            </div>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
            ⚠️ تنبيه: أي تعديل أو إدخال لجدول موظف يتطلب موافقة كلاً من مدير الفرع والإدارة العليا معاً ليعتمد رسمياً.
          </p>

          {isMobileScreen ? (
            /* Mobile Roster Cards View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {branchEmployees.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px', fontSize: '13px' }}>لا يوجد موظفين بالفرع.</p>
              ) : (
                branchEmployees.map((emp) => {
                  const empIdStr = String(emp.id);
                  const roster = (state.rosters || []).find(
                    (r) => String(r.employeeId) === empIdStr && (r.month === selectedMonth || !r.month)
                  );
                  const req = (state.requests || []).find(
                    (r) =>
                      String(r.employeeId) === empIdStr &&
                      (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
                      (r.month === selectedMonth || !r.month)
                  );

                  const hasData = !!(roster || req);
                  const isApprovedReq = req?.status === 'approved' || req?.adminApproved;
                  const isApprovedRoster = roster?.status === 'approved' || roster?.adminApproved;

                  const isBranchApproved = roster?.branchApproved || req?.branchApproved || isApprovedReq || isApprovedRoster;
                  const isAdminApproved = roster?.adminApproved || req?.adminApproved || req?.status === 'approved' || roster?.status === 'approved';
                  const isFullyApproved = isApprovedReq || isApprovedRoster || (isBranchApproved && isAdminApproved);

                  return (
                    <div key={emp.id} style={{
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '14px',
                      background: 'var(--surface)',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800' }}>{emp.name}</h4>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>كود: {emp.code} | شهر: {selectedMonth}</span>
                        </div>
                        <div>
                          {isFullyApproved ? (
                            <span className="approval-status-badge approved" style={{ fontSize: '11px' }}>🟢 معتمد ونشط</span>
                          ) : hasData ? (
                            <span className="approval-status-badge pending" style={{ fontSize: '11px' }}>🟡 قيد الاعتماد</span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>غير مدخل</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--surface-muted)', padding: '8px 10px', borderRadius: '8px', marginBottom: '10px', fontSize: '11.5px' }}>
                        <div>
                          <span style={{ color: 'var(--muted)' }}>موافقة مدير الفرع: </span>
                          {isBranchApproved ? (
                            <strong style={{ color: '#16a34a' }}>🟢 معتمد</strong>
                          ) : hasData ? (
                            <strong style={{ color: '#d97706' }}>⏳ بانتظار توقيعك</strong>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </div>
                        <div>
                          <span style={{ color: 'var(--muted)' }}>موافقة الإدارة العليا: </span>
                          {isAdminApproved || isFullyApproved ? (
                            <strong style={{ color: '#16a34a' }}>🟢 معتمد</strong>
                          ) : hasData ? (
                            <strong style={{ color: '#d97706' }}>⏳ بانتظار الإدارة العليا</strong>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ flex: 1, padding: '6px 0', fontSize: '12px', border: '1px solid var(--border)' }}
                          onClick={() => setPreviewRosterEmp(emp)}
                        >
                          👁️ معاينة الجدول
                        </button>
                        {hasData && !isBranchApproved && (
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ flex: 1, padding: '6px 0', fontSize: '12px' }}
                            onClick={() => handleApproveRoster(roster?.id || req?.id || emp.id)}
                          >
                            ✓ توقيع بالموافقة
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Desktop Roster Table View */
            <div className="table-responsive">
              <table className="bylaws-table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>الشهر</th>
                    <th>موافقة مدير الفرع</th>
                    <th>موافقة الإدارة العليا</th>
                    <th>الحالة النهائية</th>
                    <th>الإجراءات والمعاينة</th>
                  </tr>
                </thead>
                <tbody>
                  {branchEmployees.length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>لا يوجد موظفين بالفرع.</td></tr>
                  ) : (
                    branchEmployees.map((emp) => {
                      const empIdStr = String(emp.id);

                      // 1. Check in state.rosters
                      const roster = (state.rosters || []).find(
                        (r) => String(r.employeeId) === empIdStr && (r.month === selectedMonth || !r.month)
                      );

                      // 2. Check in state.requests
                      const req = (state.requests || []).find(
                        (r) =>
                          String(r.employeeId) === empIdStr &&
                          (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
                          (r.month === selectedMonth || !r.month)
                      );

                      const hasData = !!(roster || req);
                      const isApprovedReq = req?.status === 'approved' || req?.adminApproved;
                      const isApprovedRoster = roster?.status === 'approved' || roster?.adminApproved;

                      const isBranchApproved = roster?.branchApproved || req?.branchApproved || isApprovedReq || isApprovedRoster;
                      const isAdminApproved = roster?.adminApproved || req?.adminApproved || req?.status === 'approved' || roster?.status === 'approved';
                      const isFullyApproved = isApprovedReq || isApprovedRoster || (isBranchApproved && isAdminApproved);

                      return (
                        <tr key={emp.id}>
                          <td style={{ fontWeight: '700' }}>{emp.name} ({emp.code})</td>
                          <td>{selectedMonth}</td>
                          <td>
                            {isBranchApproved ? (
                              <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد من مدير الفرع</span>
                            ) : hasData ? (
                              <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ يحتاج توقيعك</span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>لم يتم إنشاء جدول</span>
                            )}
                          </td>
                          <td>
                            {isAdminApproved || isFullyApproved ? (
                              <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد من الإدارة العليا</span>
                            ) : hasData ? (
                              <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ بانتظار الإدارة العليا</span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>—</span>
                            )}
                          </td>
                          <td>
                            {isFullyApproved ? (
                              <span className="approval-status-badge approved">🟢 معتمد ونشط</span>
                            ) : hasData ? (
                              <span className="approval-status-badge pending">🟡 قيد الاعتماد الثنائي</span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>غير مدخل</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                onClick={() => setPreviewRosterEmp(emp)}
                              >
                                👁️ معاينة الجدول
                              </button>
                              {hasData && !isBranchApproved && (
                                <button className="btn btn-start" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleApproveRoster(roster?.id || req?.id || emp.id)}>
                                  ✓ توقيع بالموافقة
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Roster Preview Modal */}
          {previewRosterEmp && (
            <div className="modal-backdrop">
              <div className="modal-content card" style={{ maxWidth: '1050px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>📅 معاينة جدول الموظف: {previewRosterEmp.name} ({selectedMonth})</h3>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setPreviewRosterEmp(null)}>✕ إغلاق</button>
                </div>

                {(() => {
                  const roster = (state.rosters || []).find((r) => r.employeeId === previewRosterEmp.id && r.month === selectedMonth);
                  if (!roster || !roster.schedule) {
                    return <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لم يتم إدخال جدول شهري لهذا الموظف عن شهر {selectedMonth}.</p>;
                  }
                  return (
                    <div className="table-responsive">
                      <table className="bylaws-table">
                        <thead>
                          <tr>
                            <th>اليوم</th>
                            <th>نوع اليوم / الحضور</th>
                            <th>وقت الحضور</th>
                            <th>وقت الانصراف</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(roster.schedule).map(([dayName, sch]) => (
                            <tr key={dayName} style={{ background: sch.type === 'off' ? '#fef2f2' : 'transparent' }}>
                              <td style={{ fontWeight: '700' }}>{dayName}</td>
                              <td>
                                {sch.type === 'off' ? (
                                  <span style={{ color: '#dc2626', fontWeight: '700' }}>🔴 راحة أسبوعية</span>
                                ) : (
                                  <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 يوم عمل</span>
                                )}
                              </td>
                              <td>{sch.type === 'off' ? '—' : sch.start}</td>
                              <td>{sch.type === 'off' ? '—' : sch.end}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Roster Edit Modal */}
          {showRosterEditModal && (
            <div className="modal-backdrop">
              <div className="modal-content card" style={{ maxWidth: '850px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 16px' }}>✏️ طلب تعديل جدول موظف من الإدارة العليا</h3>
                <form onSubmit={handleSubmitRosterEditRequest}>
                  <div className="field" style={{ marginBottom: '14px' }}>
                    <label>اختر الموظف</label>
                    <select value={rosterEditEmpId} onChange={(e) => setRosterEditEmpId(e.target.value)} required>
                      <option value="">-- اختر الموظف --</option>
                      {branchEmployees.map((e) => (
                        <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: '16px' }}>
                    <label>التعديلات المطلوبة والأسباب</label>
                    <textarea rows="4" placeholder="اكتب التفاصيل المطلوبة لتعديل الجدول..." value={rosterEditDetails} onChange={(e) => setRosterEditDetails(e.target.value)} required />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowRosterEditModal(false)}>إلغاء</button>
                    <button type="submit" className="btn btn-start">إرسال الطلب للإدارة</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 4. MANAGER LEAVES TAB (Personal) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'leaves' && (
        <EmployeeLeaveModule
          emp={managerEmp}
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          selectedMonth={selectedMonth}
          targetApproval="admin_only"
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 5. MANAGER PERMISSIONS TAB (Personal) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'permissions' && (
        <EmployeePermissionsModule
          emp={managerEmp}
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          selectedMonth={selectedMonth}
          targetApproval="admin_only"
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 6. MANAGER VIOLATIONS / ADJUSTMENTS TAB (Personal) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'violations' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '17px', color: '#1e293b' }}>⚖️ سجل المكافآت والخصومات الخاصة بك (مدير الفرع)</h3>
          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>نوع الإجراء</th>
                  <th>المبلغ / الساعات</th>
                  <th>السبب / البيان</th>
                </tr>
              </thead>
              <tbody>
                {(state.adjustments || []).filter((a) => a.employeeId === managerEmp.id && matchesDateRange(a.date)).length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>لا توجد مكافآت أو خصومات مسجلة باسمك في هذه الفترة.</td></tr>
                ) : (
                  (state.adjustments || []).filter((a) => a.employeeId === managerEmp.id && matchesDateRange(a.date)).map((a) => (
                    <tr key={a.id}>
                      <td>{a.date}</td>
                      <td><span className={`badge ${a.type === 'bonus' ? 'badge-success' : 'badge-danger'}`}>{a.type === 'bonus' ? 'مكافأة' : 'خصم'}</span></td>
                      <td style={{ fontWeight: '700' }}>{a.amount} ج.م</td>
                      <td>{a.reason || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 7. EMPLOYEES ADJUSTMENTS TAB (Manage Staff Bonuses/Penalties) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'emp-violations' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '17px', color: '#1e293b' }}>📑 مكافآت وجزاءات موظفي الفرع (تتطلب موافقة الإدارة العليا)</h3>

          <form onSubmit={handleSubmitEmployeeAdjustment} style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700' }}>➕ تقديم طلب مكافأة أو خصم لموظف</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div className="field">
                <label>الموظف</label>
                <select value={adjEmpId} onChange={(e) => setAdjEmpId(e.target.value)} required>
                  <option value="">-- اختر الموظف --</option>
                  {branchEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>نوع الإجراء</label>
                <select value={adjType} onChange={(e) => setAdjType(e.target.value)}>
                  <option value="bonus">➕ إضافة مكافأة / حافز</option>
                  <option value="penalty">➖ خصم / جزاء مالى</option>
                </select>
              </div>
              <div className="field">
                <label>المبلغ (ج.م)</label>
                <input type="number" min="1" placeholder="مثال: 100" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} required />
              </div>
            </div>
            <div className="field" style={{ marginBottom: '14px' }}>
              <label>سبب وتفاصيل الطلب</label>
              <input type="text" placeholder="اكتب السبب بالتفصيل..." value={adjReason} onChange={(e) => setAdjReason(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-start">📤 إرسال الطلب للإدارة العليا للاعتماد</button>
          </form>

          <h4 style={{ margin: '16px 0 10px', fontSize: '14px' }}>سجل الطلبات المرسلة وحالتها لدى الإدارة العليا</h4>
          {isMobileScreen ? (
            /* Mobile Adjustments Cards View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {branchRequests.filter((r) => (r.type === 'bonus' || r.type === 'penalty' || r.type === 'adjustment') && matchesDateRange(r.date || r.createdAt)).length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px', fontSize: '13px' }}>لا توجد طلبات مكافآت أو خصومات مسجلة في هذه الفترة.</p>
              ) : (
                branchRequests.filter((r) => (r.type === 'bonus' || r.type === 'penalty' || r.type === 'adjustment') && matchesDateRange(r.date || r.createdAt)).map((r) => (
                  <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800' }}>{r.employeeName || 'موظف'}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>📅 {r.createdAt ? r.createdAt.slice(0, 10) : '—'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`badge ${r.type === 'bonus' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '12px', fontWeight: 800 }}>
                          {r.type === 'bonus' ? '➕ مكافأة' : '➖ خصم'}
                        </span>
                        <strong style={{ fontSize: '14px', color: r.type === 'bonus' ? '#16a34a' : '#dc2626' }}>{r.amount} ج.م</strong>
                      </div>
                    </div>
                    {r.reason && (
                      <div style={{ background: 'var(--surface-muted)', padding: '8px 10px', borderRadius: '8px', fontSize: '12px', marginBottom: '8px' }}>
                        {r.reason}
                      </div>
                    )}
                    <div style={{ fontSize: '11px' }}>
                      {(r.status === 'approved' || r.adminApproved) && <span className="approval-status-badge approved">🟢 معتمد وتم تطبيقه على الأجر</span>}
                      {r.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 بانتظار موافقة الإدارة العليا</span>}
                      {r.status === 'pending_branch' && <span className="approval-status-badge pending">🟡 بانتظار موافقة مدير الفرع</span>}
                      {r.status === 'pending' && <span className="approval-status-badge pending">🟡 قيد الاعتماد والمراجعة</span>}
                      {r.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض من الإدارة العليا</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Desktop Adjustments Table View */
            <div className="table-responsive">
              <table className="bylaws-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الموظف</th>
                    <th>نوع الإجراء</th>
                    <th>المبلغ</th>
                    <th>السبب</th>
                    <th>حالة الإدارة العليا</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRequests.filter((r) => (r.type === 'bonus' || r.type === 'penalty' || r.type === 'adjustment') && matchesDateRange(r.date || r.createdAt)).length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>لا توجد طلبات مكافآت أو خصومات مسجلة في هذه الفترة.</td></tr>
                  ) : (
                    branchRequests.filter((r) => (r.type === 'bonus' || r.type === 'penalty' || r.type === 'adjustment') && matchesDateRange(r.date || r.createdAt)).map((r) => (
                      <tr key={r.id}>
                        <td>{r.createdAt ? r.createdAt.slice(0, 10) : '—'}</td>
                        <td style={{ fontWeight: '700' }}>{r.employeeName || 'موظف'}</td>
                        <td><span className={`badge ${r.type === 'bonus' ? 'badge-success' : 'badge-danger'}`}>{r.type === 'bonus' ? 'مكافأة' : 'خصم'}</span></td>
                        <td style={{ fontWeight: '700' }}>{r.amount} ج.م</td>
                        <td>{r.reason || r.details || '—'}</td>
                        <td>
                          {(r.status === 'approved' || r.adminApproved) && <span className="approval-status-badge approved">🟢 معتمد وتم تطبيقه على الأجر</span>}
                          {r.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 بانتظار موافقة الإدارة العليا</span>}
                          {r.status === 'pending_branch' && <span className="approval-status-badge pending">🟡 بانتظار موافقة مدير الفرع</span>}
                          {r.status === 'pending' && <span className="approval-status-badge pending">🟡 قيد الاعتماد والمراجعة</span>}
                          {r.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض من الإدارة العليا</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 8. MANAGER LOANS TAB (Personal) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'loans' && (
        <EmployeeLoansModule
          emp={managerEmp}
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          targetApproval="admin_only"
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 9. EMPLOYEES PUNCHES LOG TAB (Matching Image 1 Exact Layout) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'emp-punches' && (
        <div className="card settings-card fade-in" style={{ padding: isMobileScreen ? '14px' : '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: isMobileScreen ? '15.5px' : '17px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 سجل البصمات والورديات — موظفي الفرع ({selectedMonth})
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', width: isMobileScreen ? '100%' : 'auto' }}>
              <button
                className="btn btn-start"
                style={{ padding: isMobileScreen ? '6px 10px' : '6px 14px', fontSize: isMobileScreen ? '12px' : '13px', display: 'flex', alignItems: 'center', gap: '5px', flex: isMobileScreen ? 1 : 'none', justifyContent: 'center' }}
                onClick={() => setShowManualPunchModal(true)}
              >
                🖐️ طلب بصمة يدوي
              </button>
              <div style={{ maxWidth: isMobileScreen ? '100%' : '240px', flex: isMobileScreen ? 1 : 'none' }}>
                <select value={selectedPunchEmpId} onChange={(e) => setSelectedPunchEmpId(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px' }}>
                  <option value="">-- جميع موظفي الفرع --</option>
                  {branchEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {(() => {
            const allEmps = state.employees || [];
            const cIdStr = String(currentBranch?.id || '');
            const filteredShifts = (state.shifts || []).filter((s) => {
              if (!s || !s.date) return false;
              const empObj = allEmps.find((e) => String(e.id) === String(s.employeeId)) || branchEmployees.find((e) => String(e.id) === String(s.employeeId));
              if (!empObj) return false;
              if (selectedPunchEmpId && String(s.employeeId) !== String(selectedPunchEmpId)) return false;
              // Check if shift strictly belongs to this branch
              const isThisBranchShift = String(s.branchId) === cIdStr || (!s.branchId && String(empObj.branchId) === cIdStr);
              if (!isThisBranchShift) return false;
              return matchesDateRange(s.date);
            }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            const totalBreak = filteredShifts.reduce((acc, s) => acc + (s.breakHours || 0), 0);
            const totalHours = filteredShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0);

            if (isMobileScreen) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Mobile Summary Stats Pill */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    background: 'linear-gradient(135deg, #f0fdf4, #e6f7f5)',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #99f6e4',
                    textAlign: 'center'
                  }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#0f766e', display: 'block' }}>الورديات</span>
                      <strong style={{ fontSize: '14px', color: '#115e59' }}>{filteredShifts.length}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#0f766e', display: 'block' }}>إجمالي الساعات</span>
                      <strong style={{ fontSize: '14px', color: '#0d9488' }}>{formatMoney(totalHours)} س</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#0f766e', display: 'block' }}>البريك</span>
                      <strong style={{ fontSize: '14px', color: '#b45309' }}>{formatMoney(totalBreak)} س</strong>
                    </div>
                  </div>

                  {/* Shifts Cards List */}
                  {filteredShifts.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>
                      لا توجد بصمات مسجلة لهؤلاء الموظفين بهذا الفرع لهذه الفترة.
                    </p>
                  ) : (
                    filteredShifts.map((s, idx) => {
                      const empObj = allEmps.find((e) => String(e.id) === String(s.employeeId)) || branchEmployees.find((e) => String(e.id) === String(s.employeeId));
                      const perm = isApprovedPermissionForDate(s.employeeId, s.date, state);
                      const hasPerm = s.hasApprovedPermission || !!perm;
                      const permHours = s.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);
                      const effHours = getEffectiveShiftHours(s, state);
                      const manualPunchesMonthCount = getEmployeeManualPunchesCount(s.employeeId, state, matchesDateRange);
                      const isManualShift = isShiftManualPunch(s);

                      return (
                        <div key={s.id} style={{
                          border: hasPerm ? '1px solid #fde68a' : '1px solid var(--border)',
                          borderRadius: '12px',
                          padding: '14px',
                          background: hasPerm ? 'rgba(254, 243, 199, 0.15)' : 'var(--surface)',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                        }}>
                          {/* Card Top: Employee Name, Code & Date */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e6f7f5', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px' }}>
                                {empObj?.name ? empObj.name.charAt(0) : 'م'}
                              </div>
                              <div>
                                <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '800' }}>
                                  {empObj ? empObj.name : (s.employeeName || 'موظف')}
                                </h4>
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                  كود: {empObj?.code || '—'}
                                </span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'left' }}>
                              <strong style={{ fontSize: '12px', color: 'var(--text)', display: 'block' }}>{s.date}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{getArabicWeekday(s.date)}</span>
                            </div>
                          </div>

                          {/* Time & Hours Stats Grid */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '6px',
                            background: 'var(--surface-muted)',
                            padding: '8px',
                            borderRadius: '10px',
                            textAlign: 'center',
                            marginBottom: (hasPerm || isManualShift || s.note) ? '8px' : '0'
                          }}>
                            <div>
                              <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>الدخول</span>
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', display: 'inline-block' }}>
                                {s.timeIn || '—'}
                              </span>
                            </div>
                            <div>
                              <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>الخروج</span>
                              <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', display: 'inline-block' }}>
                                {s.timeOut || '—'}
                              </span>
                            </div>
                            <div>
                              <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>البريك</span>
                              <span style={{ fontSize: '11.5px', fontWeight: '700', color: (s.breakHours || 0) > 0 ? '#b45309' : 'var(--muted)' }}>
                                {(s.breakHours || 0) > 0 ? `${formatMoney(s.breakHours)} س` : '0'}
                              </span>
                            </div>
                            <div>
                              <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>الصافي</span>
                              <span style={{ fontSize: '12px', fontWeight: '800', color: '#0d9488' }}>
                                {formatMoney(effHours)} س
                              </span>
                            </div>
                          </div>

                          {/* Badges & Notes */}
                          {(hasPerm || isManualShift || manualPunchesMonthCount > 0 || s.note) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                              {hasPerm && (
                                <div style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                  ⏰ معدلة بإذن (+{permHours} س) {perm?.startTime && `(${perm.startTime} إلى ${perm.endTime})`}
                                </div>
                              )}
                              {isManualShift && (
                                <div style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                  🖐️ بصمة يدوية
                                </div>
                              )}
                              {manualPunchesMonthCount > 0 && !isManualShift && (
                                <div style={{ fontSize: '10.5px', color: '#b45309' }}>
                                  🖐️ للموظف {manualPunchesMonthCount} بصمة يدوية هذا الشهر
                                </div>
                              )}
                              {s.note && !s.note.includes('⏰ تم تعديل البصمة') && (
                                <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                                  📝 {s.note}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            }

            return (
              <div className="table-responsive">
                <table className="bylaws-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                      <th>#</th>
                      <th>اسم الموظف</th>
                      <th>بصمات يدوية هذا الشهر</th>
                      <th>التاريخ</th>
                      <th>اليوم</th>
                      <th>وقت الدخول</th>
                      <th>وقت الخروج</th>
                      <th>ساعات البريك</th>
                      <th>صافي ساعات العمل</th>
                      <th>الملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShifts.length === 0 ? (
                      <tr><td colSpan="10" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد بصمات مسجلة لهؤلاء الموظفين بهذا الفرع لهذه الفترة.</td></tr>
                    ) : (
                      filteredShifts.map((s, idx) => {
                        const empObj = allEmps.find((e) => String(e.id) === String(s.employeeId)) || branchEmployees.find((e) => String(e.id) === String(s.employeeId));
                        const perm = isApprovedPermissionForDate(s.employeeId, s.date, state);
                        const hasPerm = s.hasApprovedPermission || !!perm;
                        const permHours = s.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);
                        const effHours = getEffectiveShiftHours(s, state);
                        const manualPunchesMonthCount = getEmployeeManualPunchesCount(s.employeeId, state, matchesDateRange);
                        const isManualShift = isShiftManualPunch(s);

                        return (
                          <tr key={s.id} style={{ background: hasPerm ? 'rgba(254, 243, 199, 0.25)' : 'transparent' }}>
                            <td style={{ color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                            <td style={{ fontWeight: '800', color: 'var(--primary-dark)' }}>
                              {empObj ? `${empObj.name} (${empObj.code})` : (s.employeeName || 'موظف')}
                            </td>
                            <td>
                              {manualPunchesMonthCount > 0 ? (
                                <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800 }}>
                                  🖐️ {manualPunchesMonthCount} يدوي
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>0</span>
                              )}
                            </td>
                            <td style={{ fontWeight: '700' }}>
                              {s.date}
                              {hasPerm && (
                                <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                  ⏰ معدلة بإذن (+{permHours} س)
                                </span>
                              )}
                              {isManualShift && (
                                <span style={{ display: 'block', marginTop: '2px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                  🖐️ بصمة يدوية
                                </span>
                              )}
                            </td>
                            <td>{getArabicWeekday(s.date)}</td>
                            <td>
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                                {s.timeIn || '—'}
                              </span>
                            </td>
                            <td>
                              <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                                {s.timeOut || '—'}
                              </span>
                            </td>
                            <td>
                              {(s.breakHours || 0) > 0 ? (
                                <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                                  {formatMoney(s.breakHours)} س
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                            <td style={{ fontWeight: '700', color: '#0d9488' }}>
                              {formatMoney(effHours)} ساعة
                              {hasPerm && permHours > 0 && (
                                <div style={{ fontSize: '10.5px', color: '#b45309', fontWeight: 700, marginTop: '2px' }}>
                                  (فعلي: {formatMoney(Math.max(0, effHours - permHours))} س + إذن: {formatMoney(permHours)} س)
                                </div>
                              )}
                            </td>
                            <td style={{ fontSize: '12px', color: hasPerm ? '#047857' : 'var(--muted)' }}>
                              {hasPerm ? (
                                <div>
                                  <span style={{ fontWeight: 700 }}>⏰ معدلة باحتساب ساعات الإذن المعتمد ({perm?.startTime || '—'} إلى {perm?.endTime || '—'})</span>
                                  {s.note && !s.note.includes('⏰ تم تعديل البصمة') && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.note}</div>}
                                </div>
                              ) : (
                                s.note || (isManualShift ? 'بصمة يدوية مسجلة' : 'تسجيل بصمة عادية')
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredShifts.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: '800', background: '#f8fafc' }}>
                        <td colSpan="7" style={{ textAlign: 'right', paddingRight: '12px' }}>
                          الإجمالي ({filteredShifts.length} وردية)
                        </td>
                        <td>
                          <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px' }}>
                            {formatMoney(totalBreak)} س
                          </span>
                        </td>
                        <td style={{ color: '#0d9488', fontWeight: '800' }}>{formatMoney(totalHours)} ساعة</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 10. MANAGER PUNCHES LOG TAB (Personal - Image 1 Exact Layout) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'manager-punches' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '17px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 سجل البصمات والورديات — مدير الفرع ({managerSalaryMetrics.shiftsCount} وردية)
            </h3>
          </div>

          <div className="table-responsive">
            <table className="bylaws-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                  <th>#</th>
                  <th>التاريخ</th>
                  <th>اليوم</th>
                  <th>وقت الدخول</th>
                  <th>وقت الخروج</th>
                  <th>ساعات البريك</th>
                  <th>صافي ساعات العمل</th>
                  <th>المبلغ المستحق</th>
                  <th>الملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {managerSalaryMetrics.shiftsList.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد بصمات مسجلة باسمك عن هذا الشهر.</td></tr>
                ) : (
                  managerSalaryMetrics.shiftsList.map((s, idx) => (
                    <tr key={s.id}>
                      <td style={{ color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                      <td style={{ fontWeight: '700' }}>{s.date}</td>
                      <td>{getArabicWeekday(s.date)}</td>
                      <td>
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                          {s.timeIn || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                          {s.timeOut || '—'}
                        </span>
                      </td>
                      <td>
                        {(s.breakHours || 0) > 0 ? (
                          <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                            {formatMoney(s.breakHours)} س
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: '700', color: '#0d9488' }}>
                        {formatMoney(getEffectiveShiftHours(s, state))} ساعة
                      </td>
                      <td style={{ fontWeight: '700', color: '#16a34a' }}>
                        {formatMoney(getEffectiveShiftHours(s, state) * managerSalaryMetrics.hourlyRate)} ج.م
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{s.note || 'تسجيل بصمة حية'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {managerSalaryMetrics.shiftsList.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: '800', background: '#f8fafc' }}>
                    <td colSpan="5" style={{ textAlign: 'right', paddingRight: '12px' }}>
                      الإجمالي ({managerSalaryMetrics.shiftsCount} وردية)
                    </td>
                    <td>
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px' }}>
                        {formatMoney(managerSalaryMetrics.totalBreakHours)} س
                      </span>
                    </td>
                    <td style={{ color: '#0d9488' }}>{formatMoney(managerSalaryMetrics.totalHours)} ساعة</td>
                    <td style={{ color: '#16a34a' }}>{formatMoney(managerSalaryMetrics.baseEarnings)} ج.م</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 11. MANAGER SALARY TAB (Personal - Image 2 Exact Layout) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'salary' && (
        <div className="card settings-card fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '17px', color: '#1e293b' }}>
              💼 تفاصيل المرتب — مدير الفرع ({selectedMonth})
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-start"
                onClick={() => {
                  printEmployeePayslipDirect({
                    emp: managerEmp,
                    month: selectedMonth,
                    shifts: state.shifts || [],
                    adjustments: state.adjustments || [],
                    branches: state.branches || [],
                    orgSettings: state.orgSettings || {},
                    computeEmpSummary: state.computeEmpSummary,
                    selectedBranchId: null,
                    state
                  });
                }}
                style={{ fontSize: '13px', padding: '6px 14px' }}
              >
                🖨️ طباعة كشف المرتب (PDF)
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowPrintModal(true)}
                style={{ fontSize: '12.5px', padding: '6px 12px' }}
              >
                👁️ معاينة
              </button>
              {onExportExcel && (
                <button className="btn btn-ghost" onClick={onExportExcel} style={{ fontSize: '13px', padding: '6px 14px' }}>
                  📊 تصدير شيت Excel
                </button>
              )}
            </div>
          </div>

          <PayslipPrintModal
            isOpen={showPrintModal}
            onClose={() => setShowPrintModal(false)}
            emp={managerEmp}
            month={selectedMonth}
            shifts={state.shifts}
            adjustments={state.adjustments}
            orgSettings={state.orgSettings}
            state={state}
          />

          {/* 1. احتساب سعر الساعة اليومي */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#f0fdf4', padding: '12px 16px', color: '#166534', fontWeight: '800', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ احتساب سعر الساعة اليومي
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>1. سعر الساعة الشهري (الراتب الأساسي المدخل)</span>
                <span style={{ fontWeight: '700' }}>{formatMoney(managerEmp?.salary || 0)} ج.م</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>2. ساعات العمل اليومية المدخلة</span>
                <span style={{ fontWeight: '700' }}>{managerSalaryMetrics.workHoursPerDay} ساعة / يوم</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>3. أيام العمل الشهرية المدخلة</span>
                <span style={{ fontWeight: '700' }}>{managerSalaryMetrics.workDaysPerMonth} يوم / شهر</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>4. سعر اليوم = ({formatMoney(managerEmp?.salary || 0)} × {managerSalaryMetrics.workHoursPerDay}) ÷ {managerSalaryMetrics.workDaysPerMonth}</span>
                <span style={{ fontWeight: '700', color: 'var(--primary-dark)' }}>{formatMoney(managerSalaryMetrics.dailyRate)} ج.م / يوم</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', fontSize: '14px', color: '#16a34a', fontWeight: '800' }}>
                <span>✅ 5. سعر الساعة اليومي = {formatMoney(managerSalaryMetrics.dailyRate)} ÷ {managerSalaryMetrics.workHoursPerDay}</span>
                <span>{formatMoney(managerSalaryMetrics.hourlyRate)} ج.م / ساعة</span>
              </div>
            </div>
          </div>

          {/* 2. ساعات العمل والمستحقات */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#f0fdf4', padding: '12px 16px', color: '#166534', fontWeight: '800', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⏱️ ساعات العمل والمستحقات
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>عدد ساعات العمل الفعلية المسجلة</span>
                <span style={{ fontWeight: '700' }}>{formatMoney(managerSalaryMetrics.totalHours)} ساعة</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', fontSize: '14px', color: '#16a34a', fontWeight: '800' }}>
                <span>✅ المستحقات الأساسية الفعلية</span>
                <span>{formatMoney(managerSalaryMetrics.baseEarnings)} ج.م</span>
              </div>
            </div>
          </div>

          {/* 3. الملخص المالي النهائي (Big Solid Teal Card) */}
          <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', borderRadius: '14px', padding: '20px 24px', color: '#ffffff', boxShadow: '0 6px 20px rgba(13,148,136,0.25)' }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🏆 الملخص المالي النهائي
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.9, fontSize: '14px' }}>
                <span>المستحقات الأساسية</span>
                <span style={{ fontWeight: '700' }}>{formatMoney(managerSalaryMetrics.baseEarnings)} ج.م</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.9, fontSize: '14px' }}>
                <span>+ المكافآت والحوافز</span>
                <span style={{ fontWeight: '700' }}>+{formatMoney(managerSalaryMetrics.totalBonus)} ج.م</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.9, fontSize: '14px' }}>
                <span>- الخصومات والجزاءات</span>
                <span style={{ fontWeight: '700' }}>-{formatMoney(managerSalaryMetrics.totalDeduction)} ج.م</span>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: '12px', padding: '16px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>
              <span style={{ fontSize: '13px', display: 'block', opacity: 0.9, marginBottom: '4px' }}>صافي المرتب المستحق لشهر {selectedMonth}</span>
              <span style={{ fontSize: '28px', fontWeight: '900', color: '#ffffff' }}>
                {formatMoney(managerSalaryMetrics.netSalary)} ج.م
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 12. EVALUATIONS AND COMPLAINTS TAB (Unified Evaluations) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'evaluations' && (
        <div className="fade-in">
          <EvaluationsModule
            state={state}
            setState={setState}
            saveState={saveState}
            showToast={showToast}
            currentRole="branch"
            currentBranchId={currentBranch?.id}
          />
        </div>
      )}

      {/* ── 8.5. PERMISSIONS MANAGEMENT TAB ── */}
      {activeTab === 'permissions-management' && (
        <EmployeePermissionsManagementModule
          state={state}
          setState={setState}
          saveState={saveState}
          currentBranch={currentBranch}
          authRole="branch"
          hidePolicySettings={true}
          currentEmployee={null}
          showToast={showToast}
        />
      )}

      {/* ── 9. BYLAWS TAB ── */}
      {activeTab === 'bylaws' && (
        <BylawsModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          userRole="branch"
          currentBranchId={currentBranch?.id}
          filterFn={matchesDateRange}
          monthPicker={selectedMonth}
          filterMode={filterMode}
          customFrom={customFromDate}
          customTo={customToDate}
        />
      )}

      {/* ── 10. INCOME & EXPENSES TAB ── */}
      {activeTab === 'income-expenses' && (
        <IncomeExpensesModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          currentBranch={currentBranch}
          userRole="branch"
          filterFn={matchesDateRange}
          monthPicker={selectedMonth}
          filterMode={filterMode}
          customFrom={customFromDate}
          customTo={customToDate}
        />
      )}

      {/* ── 11. RESIGNATION TAB ── */}
      {activeTab === 'resignation' && (
        <BranchResignationModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          currentBranch={currentBranch}
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 12. BRANCH LEAVES MANAGEMENT TAB ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'leaves' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🏖️ كشوف وإجازات موظفي الفرع ورصيد الإجازات السنوية
              </h3>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                متابعة سجل الإجازات المأخوذة بكل موظف بالفرع، الاستعلام عن الرصيد، ورفع طلب إجازة جديد للإدارة العليا
              </p>
            </div>
            <button
              className="btn btn-start"
              style={{ padding: '8px 18px', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px', background: '#0284c7' }}
              onClick={() => setShowLeaveModal(true)}
            >
              ➕ طلب إجازة لموظف
            </button>
          </div>

          {/* Employee Balances Cards Grid */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px', color: '#0369a1', fontWeight: '800' }}>
              📊 أرصدة الإجازات السنوية لموظفي الفرع ({branchEmployees.length} موظف):
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {branchEmployees.map((emp) => {
                const { annualTotal, takenAnnualDays, remainingAnnualDays } = calculateEmployeeLeaveStats(emp, state);
                return (
                  <div key={emp.id} style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '800', color: 'var(--text)', fontSize: '14px' }}>{emp.name}</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{emp.code}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px dashed #e2e8f0', paddingTop: '6px' }}>
                      <span style={{ color: 'var(--muted)' }}>الرصيد الكلي:</span>
                      <span style={{ fontWeight: '700' }}>{annualTotal} يوم</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#d97706' }}>المأخوذ:</span>
                      <span style={{ fontWeight: '700', color: '#d97706' }}>{takenAnnualDays} يوم</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', background: remainingAnnualDays > 0 ? '#dcfce7' : '#fee2e2', padding: '4px 8px', borderRadius: '6px' }}>
                      <span style={{ color: remainingAnnualDays > 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>المتبقي:</span>
                      <span style={{ fontWeight: '900', color: remainingAnnualDays > 0 ? '#15803d' : '#b91c1c' }}>{remainingAnnualDays} يوم</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filters Bar for Requests */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>📋 سجل طلبات إجازات موظفي الفرع:</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select
                value={leaveEmpFilter}
                onChange={(e) => setLeaveEmpFilter(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              >
                <option value="all">-- جميع موظفي الفرع --</option>
                {branchEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                ))}
              </select>
              <select
                value={leaveStatusFilter}
                onChange={(e) => setLeaveStatusFilter(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              >
                <option value="all">-- جميع الحالات --</option>
                <option value="pending">قيد المراجعة والانتظار</option>
                <option value="approved">معتمدة ومقبولة</option>
                <option value="rejected">مرفوضة</option>
              </select>
            </div>
          </div>

          {/* Leave Requests Table */}
          {(() => {
            const allLeavesList = [...(state.leaveRequests || []), ...(state.requests || []).filter(r => r.type === 'leave' || r.type === 'leave_request')];
            const map = new Map();
            allLeavesList.forEach(lr => {
              if (!lr) return;
              const isMatchBranch = String(lr.branchId) === String(currentBranch?.id) || branchEmployees.some(e => String(e.id) === String(lr.employeeId));
              if (!isMatchBranch) return;
              if (leaveEmpFilter !== 'all' && String(lr.employeeId) !== String(leaveEmpFilter)) return;
              if (leaveStatusFilter === 'approved' && !(lr.status === 'approved' || lr.adminApproved)) return;
              if (leaveStatusFilter === 'rejected' && lr.status !== 'rejected') return;
              if (leaveStatusFilter === 'pending' && (lr.status === 'approved' || lr.adminApproved || lr.status === 'rejected')) return;

              const key = lr.id || `${lr.employeeId}_${lr.startDate}_${lr.endDate}`;
              if (!map.has(key)) map.set(key, lr);
            });

            const displayedLeaves = Array.from(map.values()).sort((a, b) => (b.createdAt || b.startDate || '').localeCompare(a.createdAt || a.startDate || ''));

            return isMobileScreen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {displayedLeaves.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    لا توجد طلبات إجازات مسجلة تطابق خيارات البحث.
                  </div>
                ) : (
                  displayedLeaves.map((lr, idx) => {
                    const empObj = branchEmployees.find(e => String(e.id) === String(lr.employeeId)) || (state.employees || []).find(e => String(e.id) === String(lr.employeeId));
                    const days = lr.daysCount || lr.days || 1;
                    const leaveTypeLabel = lr.leaveType === 'annual' ? 'إجازة سنوية' : lr.leaveType === 'sick' ? 'إجازة مرضية' : lr.leaveType === 'unpaid' ? 'بدون أجر' : lr.leaveType === 'casual' ? 'إجازة عارضة' : 'إجازة اعتيادية';

                    return (
                      <div
                        key={lr.id || idx}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '14px',
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                          <div>
                            <strong style={{ fontSize: '13.5px', color: 'var(--primary-dark)' }}>
                              {empObj ? `${empObj.name} (${empObj.code})` : (lr.employeeName || 'موظف')}
                            </strong>
                            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                              #{idx + 1} | {lr.createdAt ? lr.createdAt.slice(0, 10) : '—'}
                            </span>
                          </div>
                          <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '11.5px' }}>
                            {leaveTypeLabel}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: '10px' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>فترة الإجازة</span>
                            <strong style={{ fontSize: '12.5px', color: 'var(--text)' }}>
                              {lr.startDate} ➔ {lr.endDate}
                            </strong>
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>المدة</span>
                            <strong style={{ fontSize: '13.5px', color: '#15803d' }}>⏱️ {days} يوم</strong>
                          </div>
                        </div>

                        {lr.reason && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--surface)', padding: '6px 10px', borderRadius: '6px', border: '1px dashed var(--border)' }}>
                            💬 {lr.reason}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', paddingTop: '2px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 'bold' }}>
                            موقف الفرع: {lr.branchApproved ? <span style={{ color: '#16a34a' }}>🟢 معتمد</span> : <span style={{ color: '#d97706' }}>⏳ بانتظار قرارك</span>}
                          </span>
                          <div>
                            {(lr.status === 'approved' || lr.adminApproved) ? (
                              <span className="approval-status-badge approved" style={{ fontSize: '11px' }}>🟢 معتمد ومخصوم</span>
                            ) : lr.status === 'rejected' ? (
                              <span className="approval-status-badge rejected" style={{ fontSize: '11px' }}>🔴 مرفوض</span>
                            ) : (
                              <span className="approval-status-badge pending" style={{ fontSize: '11px' }}>🟡 بانتظار الإدارة العليا</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="bylaws-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                      <th>#</th>
                      <th>اسم الموظف</th>
                      <th>نوع الإجازة</th>
                      <th>من تاريخ</th>
                      <th>إلى تاريخ</th>
                      <th>عدد الأيام</th>
                      <th>السبب والملاحظات</th>
                      <th>موقف الفرع</th>
                      <th>موقف الإدارة العليا</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedLeaves.length === 0 ? (
                      <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد طلبات إجازات مسجلة تطابق خيارات البحث.</td></tr>
                    ) : (
                      displayedLeaves.map((lr, idx) => {
                        const empObj = branchEmployees.find(e => String(e.id) === String(lr.employeeId)) || (state.employees || []).find(e => String(e.id) === String(lr.employeeId));
                        const days = lr.daysCount || lr.days || 1;
                        const leaveTypeLabel = lr.leaveType === 'annual' ? 'إجازة سنوية' : lr.leaveType === 'sick' ? 'إجازة مرضية' : lr.leaveType === 'unpaid' ? 'بدون أجر' : lr.leaveType === 'casual' ? 'إجازة عارضة' : 'إجازة اعتيادية';

                        return (
                          <tr key={lr.id || idx}>
                            <td style={{ color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                            <td style={{ fontWeight: '800', color: 'var(--primary-dark)' }}>{empObj ? `${empObj.name} (${empObj.code})` : (lr.employeeName || 'موظف')}</td>
                            <td><span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>{leaveTypeLabel}</span></td>
                            <td style={{ fontWeight: '700' }}>📅 {lr.startDate || '—'} {lr.startDate && `(${getArabicWeekday(lr.startDate)})`}</td>
                            <td style={{ fontWeight: '700' }}>📅 {lr.endDate || '—'} {lr.endDate && `(${getArabicWeekday(lr.endDate)})`}</td>
                            <td style={{ fontWeight: '900', color: '#15803d' }}>⏱️ {days} يوم</td>
                            <td style={{ fontSize: '12px' }}>{lr.reason || lr.details || '—'}</td>
                            <td>
                              {lr.branchApproved ? (
                                <span style={{ color: '#16a34a', fontWeight: 'bold' }}>🟢 معتمد ومقدم من الفرع</span>
                              ) : (
                                <span style={{ color: '#d97706', fontWeight: 'bold' }}>⏳ بانتظار قرارك</span>
                              )}
                            </td>
                            <td>
                              {(lr.status === 'approved' || lr.adminApproved) ? (
                                <span className="approval-status-badge approved">🟢 معتمد ومخصوم من الرصيد</span>
                              ) : lr.status === 'rejected' ? (
                                <span className="approval-status-badge rejected">🔴 مرفوض من الإدارة</span>
                              ) : (
                                <span className="approval-status-badge pending">🟡 بانتظار اعتماد الإدارة العليا</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 13. BRANCH SENT REQUESTS TO ADMIN TAB (سجل الطلبات المرسلة للإدارة) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'branch-sent-requests' && (
        <div className="card settings-card fade-in" style={{ padding: isMobileScreen ? '14px' : '22px' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: isMobileScreen ? '16px' : '18.5px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📤 سجل ومتابعة كافة الطلبات المرسلة إلى الإدارة العليا
              </h3>
              <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                متابعة فورية وحالة كافة الطلبات والالتماسات المرفوعة للإدارة العليا (بصمات يدوية، أذونات، إجازات، مكافآت وجزاءات، تقييمات، وتعديل الجداول)
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-start"
                style={{ padding: '7px 12px', fontSize: '12.5px', background: '#0d9488', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => setShowManualPunchModal(true)}
              >
                🖐️ طلب بصمة يدوي
              </button>
              <button
                type="button"
                className="btn btn-start"
                style={{ padding: '7px 12px', fontSize: '12.5px', background: '#0284c7', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => setShowLeaveModal(true)}
              >
                🏖️ طلب إجازة لموظف
              </button>
              <button
                type="button"
                className="btn btn-start"
                style={{ padding: '7px 12px', fontSize: '12.5px', background: '#7c3aed', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => {
                  if (setActiveTab) setActiveTab('emp-violations');
                }}
              >
                ⚖️ طلب مكافأة / جزاء
              </button>
              <button
                type="button"
                className="btn btn-start"
                style={{ padding: '7px 12px', fontSize: '12.5px', background: '#d97706', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => setShowRosterEditModal(true)}
              >
                📅 طلب تعديل جدول
              </button>
              <button
                type="button"
                className="btn btn-start"
                style={{ padding: '7px 14px', fontSize: '12.5px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 8px rgba(245,158,11,0.25)', fontWeight: 'bold' }}
                onClick={() => {
                  setBmEvalMonth(selectedMonth || activeCycleMonth || getRealTodayStr().slice(0, 7));
                  setShowEvalModal(true);
                }}
              >
                ⭐ رصد تقييم أداء موظف
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '20px'
          }}>
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>إجمالي الطلبات المرسلة</span>
              <strong style={{ fontSize: '20px', color: 'var(--primary-dark)' }}>{sentStats.total}</strong>
            </div>
            <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: '#854d0e', display: 'block', marginBottom: '4px' }}>⏳ قيد انتظار الإدارة العليا</span>
              <strong style={{ fontSize: '20px', color: '#ca8a04' }}>{sentStats.pending}</strong>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: '#166534', display: 'block', marginBottom: '4px' }}>🟢 معتمدة ومطبقة</span>
              <strong style={{ fontSize: '20px', color: '#16a34a' }}>{sentStats.approved}</strong>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: '#991b1b', display: 'block', marginBottom: '4px' }}>🔴 مرفوضة من الإدارة</span>
              <strong style={{ fontSize: '20px', color: '#dc2626' }}>{sentStats.rejected}</strong>
            </div>
          </div>

          {/* Category Tabs Pills */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'all', label: '🌐 جميع الطلبات', count: branchSentRequests.length },
              { id: 'punch', label: '🖐️ بصمات يدوية', count: branchSentRequests.filter(r => getSentReqMeta(r).cat === 'punch').length },
              { id: 'permission', label: '⏰ أذونات الموظفين', count: branchSentRequests.filter(r => getSentReqMeta(r).cat === 'permission').length },
              { id: 'leave', label: '🏖️ طلبات الإجازات', count: branchSentRequests.filter(r => getSentReqMeta(r).cat === 'leave').length },
              { id: 'adjustment', label: '⚖️ مكافآت وجزاءات', count: branchSentRequests.filter(r => getSentReqMeta(r).cat === 'adjustment').length },
              { id: 'evaluation', label: '⭐️ تقييمات الأداء', count: branchSentRequests.filter(r => getSentReqMeta(r).cat === 'evaluation').length },
              { id: 'roster', label: '📅 تعديل الجداول', count: branchSentRequests.filter(r => getSentReqMeta(r).cat === 'roster').length },
              { id: 'resignation', label: '🚪 طلبات الاستقالة', count: branchSentRequests.filter(r => getSentReqMeta(r).cat === 'resignation').length }
            ].map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSentCategoryFilter(cat.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '20px',
                  border: sentCategoryFilter === cat.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: sentCategoryFilter === cat.id ? 'var(--primary)' : 'var(--surface)',
                  color: sentCategoryFilter === cat.id ? '#fff' : 'var(--text)',
                  fontWeight: sentCategoryFilter === cat.id ? '800' : '600',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{cat.label}</span>
                <span style={{
                  background: sentCategoryFilter === cat.id ? 'rgba(255,255,255,0.25)' : 'var(--surface-muted)',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  fontSize: '11px'
                }}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filters Row */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', background: 'var(--surface-muted)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ flex: '1 1 200px' }}>
              <input
                type="text"
                placeholder="🔍 بحث باسم الموظف أو الكود أو تفاصيل الطلب..."
                value={sentSearchQuery}
                onChange={(e) => setSentSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={sentStatusFilter}
                onChange={(e) => setSentStatusFilter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px' }}
              >
                <option value="all">-- جميع الحالات --</option>
                <option value="pending">⏳ قيد انتظار الإدارة العليا</option>
                <option value="approved">🟢 معتمد من الإدارة العليا</option>
                <option value="rejected">🔴 مرفوض من الإدارة</option>
              </select>

              <select
                value={sentEmpFilter}
                onChange={(e) => setSentEmpFilter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px' }}
              >
                <option value="all">-- جميع الموظفين --</option>
                {branchEmployees.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                ))}
              </select>

              <input
                type="date"
                value={sentDateFilter}
                onChange={(e) => setSentDateFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' }}
              />
              {sentDateFilter && (
                <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => setSentDateFilter('')}>✕ مسح التاريخ</button>
              )}
            </div>
          </div>

          {/* Data List View */}
          {filteredSentRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📭</span>
              <h4 style={{ margin: '0 0 6px', fontSize: '15px' }}>لا توجد طلبات تطابق خيارات البحث</h4>
              <p style={{ margin: 0, fontSize: '12.5px' }}>جرب تغيير تصنيف الطلبات أو الفلاتر أعلاه.</p>
            </div>
          ) : isMobileScreen ? (
            /* Mobile Cards View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredSentRequests.map((r, idx) => {
                const meta = getSentReqMeta(r);
                const empObj = branchEmployees.find(e => String(e.id) === String(r.employeeId)) || (state.employees || []).find(e => String(e.id) === String(r.employeeId));
                const dateStr = r.createdAt ? r.createdAt.slice(0, 10) : (r.date || r.startDate || '—');

                return (
                  <div
                    key={r.id || idx}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: meta.bg,
                          border: `1px solid ${meta.border}`,
                          color: meta.text,
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '800'
                        }}>
                          {meta.label}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        📅 {dateStr}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: 'var(--primary-dark)' }}>
                          {empObj ? `${empObj.name}` : (r.employeeName || 'موظف')}
                        </strong>
                        <span style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'block' }}>
                          كود: {empObj?.code || r.employeeCode || '—'}
                        </span>
                      </div>

                      <div>
                        {(r.status === 'approved' || r.adminApproved) ? (
                          <span className="approval-status-badge approved" style={{ fontSize: '11.5px' }}>🟢 معتمد نهائياً</span>
                        ) : (r.status === 'rejected' || r.adminDecision === 'rejected') ? (
                          <span className="approval-status-badge rejected" style={{ fontSize: '11.5px' }}>🔴 مرفوض</span>
                        ) : (
                          <span className="approval-status-badge pending" style={{ fontSize: '11.5px' }}>🟡 بانتظار الإدارة</span>
                        )}
                      </div>
                    </div>

                    {(r.reason || r.details || r.notes) && (
                      <div style={{ background: 'var(--surface-muted)', padding: '8px 10px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        💬 {r.reason || r.details || r.notes}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '6px 14px', fontSize: '12.5px', border: '1px solid var(--border)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onClick={() => setPreviewModalReq(r)}
                      >
                        👁️ معاينة تفاصيل الطلب
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop Table View */
            <div className="table-responsive">
              <table className="bylaws-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#1e293b' }}>
                    <th>#</th>
                    <th>نوع الطلب</th>
                    <th>اسم الموظف</th>
                    <th>تاريخ الإرسال / الموعد</th>
                    <th>بيان وتفاصيل الطلب</th>
                    <th>موقف الإدارة العليا</th>
                    <th style={{ textAlign: 'center' }}>معاينة الطلب</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSentRequests.map((r, idx) => {
                    const meta = getSentReqMeta(r);
                    const empObj = branchEmployees.find(e => String(e.id) === String(r.employeeId)) || (state.employees || []).find(e => String(e.id) === String(r.employeeId));
                    const dateStr = r.createdAt ? r.createdAt.slice(0, 10) : (r.date || r.startDate || '—');

                    return (
                      <tr key={r.id || idx}>
                        <td style={{ color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td>
                          <span style={{
                            background: meta.bg,
                            border: `1px solid ${meta.border}`,
                            color: meta.text,
                            padding: '3px 9px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '800',
                            whiteSpace: 'nowrap'
                          }}>
                            {meta.label}
                          </span>
                        </td>
                        <td style={{ fontWeight: '800', color: 'var(--primary-dark)' }}>
                          {empObj ? `${empObj.name} (${empObj.code})` : (r.employeeName || 'موظف')}
                        </td>
                        <td style={{ fontWeight: '700', fontSize: '12px' }}>
                          📅 {dateStr} {dateStr !== '—' && `(${getArabicWeekday(dateStr)})`}
                        </td>
                        <td style={{ fontSize: '12.5px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.reason || r.details || r.notes || '—'}
                        </td>
                        <td>
                          {(r.status === 'approved' || r.adminApproved) ? (
                            <span className="approval-status-badge approved">🟢 معتمد من الإدارة العليا</span>
                          ) : (r.status === 'rejected' || r.adminDecision === 'rejected') ? (
                            <span className="approval-status-badge rejected">🔴 مرفوض من الإدارة</span>
                          ) : (
                            <span className="approval-status-badge pending">🟡 بانتظار اعتماد الإدارة العليا</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            onClick={() => setPreviewModalReq(r)}
                          >
                            👁️ معاينة
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── MODAL 1: MANUAL PUNCH REQUEST MODAL ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showManualPunchModal && (
        <div className="modal-backdrop" onClick={() => setShowManualPunchModal(false)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '92%', padding: '24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', color: '#0d9488', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🖐️ طلب إضافة / تعديل بصمة يدوي لموظف
              </h3>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setShowManualPunchModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmitManualPunchRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الموظف:</label>
                <select
                  value={manualPunchData.employeeId}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const emp = branchEmployees.find(em => String(em.id) === String(empId));
                    const bH = emp?.breakHours || emp?.defaultBreakHours || emp?.branchesDetails?.[0]?.breakHours || '0';
                    setManualPunchData({ ...manualPunchData, employeeId: empId, breakHours: String(bH) });
                  }}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- اختر موظف من الفرع --</option>
                  {branchEmployees.map((e) => {
                    const count = getEmployeeManualPunchesCount(e.id, state, matchesDateRange);
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.code}) — [مسجل له {count} بصمة يدوية هذا الشهر]
                      </option>
                    );
                  })}
                </select>
              </div>

              {manualPunchData.employeeId && (() => {
                const count = getEmployeeManualPunchesCount(manualPunchData.employeeId, state, matchesDateRange);
                return (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ color: '#166534', fontWeight: 'bold' }}>🖐️ إجمالي البصمات اليدوية المسجلة للموظف خلال دورة الشهر الحالية:</span>
                    <span style={{ background: '#16a34a', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontWeight: '900' }}>
                      {count} مرات
                    </span>
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>تاريخ البصمة:</label>
                  <input
                    type="date"
                    value={manualPunchData.date}
                    onChange={(e) => setManualPunchData({ ...manualPunchData, date: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>نوع التسجيل:</label>
                  <select
                    value={manualPunchData.punchType}
                    onChange={(e) => setManualPunchData({ ...manualPunchData, punchType: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  >
                    <option value="full">حضور وانصراف (وردية كاملة)</option>
                    <option value="in">تسجيل حضور فقط</option>
                    <option value="out">تسجيل انصراف فقط</option>
                    <option value="correction">تعديل توقيت بصمة سابقة</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>وقت الحضور (الدخول):</label>
                  <input
                    type="time"
                    value={manualPunchData.timeIn}
                    onChange={(e) => setManualPunchData({ ...manualPunchData, timeIn: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>وقت الانصراف (الخروج):</label>
                  <input
                    type="time"
                    value={manualPunchData.timeOut}
                    onChange={(e) => setManualPunchData({ ...manualPunchData, timeOut: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>ساعات البريك (تخصم):</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="12"
                    value={manualPunchData.breakHours}
                    onChange={(e) => setManualPunchData({ ...manualPunchData, breakHours: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              {manualPunchData.timeIn && manualPunchData.timeOut && (() => {
                const [inH, inM] = manualPunchData.timeIn.split(':').map(Number);
                const [outH, outM] = manualPunchData.timeOut.split(':').map(Number);
                let diff = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
                if (diff < 0) diff += 24 * 60;
                const gross = Math.round((diff / 60) * 100) / 100;
                const bH = Math.max(0, parseFloat(manualPunchData.breakHours) || 0);
                const net = Math.max(0, Math.round((gross - bH) * 100) / 100);
                return (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span>⏱️ إجمالي التواجد: <strong>{gross} س</strong> (بريك: {bH} س)</span>
                    <span style={{ color: '#16a34a', fontWeight: '900' }}>✅ صافي ساعات العمل: {net} ساعة</span>
                  </div>
                );
              })()}

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>سبب التسجيل / التعديل اليدوي وملاحظات مدير الفرع:</label>
                <textarea
                  rows="3"
                  placeholder="مثال: نسيان تسجيل البصمة بجهاز الفرع، عطل فني مؤقت بالجهاز، تكليف رسمي من الإدارة..."
                  value={manualPunchData.reason}
                  onChange={(e) => setManualPunchData({ ...manualPunchData, reason: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowManualPunchModal(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start" style={{ background: '#0d9488' }}>
                  📤 إرسال طلب البصمة للإدارة العليا للاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── MODAL 2: BONUS REQUEST MODAL ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showBonusModal && (
        <div className="modal-backdrop" onClick={() => setShowBonusModal(false)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px', width: '92%', padding: '24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🎁 طلب مكافأة / حافز لموظف بالفرع
              </h3>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setShowBonusModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmitBonusRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الموظف:</label>
                <select
                  value={bonusData.employeeId}
                  onChange={(e) => setBonusData({ ...bonusData, employeeId: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- اختر موظف من الفرع --</option>
                  {branchEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>مبلغ المكافأة المقترح (ج.م):</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="مثال: 500"
                  value={bonusData.amount}
                  onChange={(e) => setBonusData({ ...bonusData, amount: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>سبب استحقاق المكافأة ومبررات مدير الفرع:</label>
                <textarea
                  rows="3"
                  placeholder="اكتب أسباب تميز الموظف، تغطية نوبتجية، تحقيق تارجت مبيعات..."
                  value={bonusData.reason}
                  onChange={(e) => setBonusData({ ...bonusData, reason: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowBonusModal(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start" style={{ background: '#16a34a' }}>
                  📤 إرسال طلب المكافأة للإدارة العليا للاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── MODAL 3: LEAVE REQUEST ON BEHALF OF EMPLOYEE MODAL ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showLeaveModal && (
        <div className="modal-backdrop" onClick={() => setShowLeaveModal(false)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '92%', padding: '24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🏖️ طلب إجازة لموظف بالفرع
              </h3>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setShowLeaveModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmitLeaveRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الموظف:</label>
                <select
                  value={leaveData.employeeId}
                  onChange={(e) => setLeaveData({ ...leaveData, employeeId: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- اختر موظف من الفرع --</option>
                  {branchEmployees.map((e) => {
                    const stats = calculateEmployeeLeaveStats(e, state);
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.code}) — [الرصيد المتبقي: {stats.remainingAnnualDays} يوم]
                      </option>
                    );
                  })}
                </select>
              </div>

              {leaveData.employeeId && (() => {
                const selectedEmp = branchEmployees.find(e => String(e.id) === String(leaveData.employeeId));
                const stats = calculateEmployeeLeaveStats(selectedEmp, state);
                return (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '10px 14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ color: '#0369a1', fontWeight: 'bold' }}>رصيد الإجازات السنوية المتبقي للموظف:</span>
                    <span style={{ background: stats.remainingAnnualDays > 0 ? '#0284c7' : '#dc2626', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontWeight: '900' }}>
                      {stats.remainingAnnualDays} يوم متبقي (من إجمالي {stats.annualTotal})
                    </span>
                  </div>
                );
              })()}

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>نوع الإجازة:</label>
                <select
                  value={leaveData.leaveType}
                  onChange={(e) => setLeaveData({ ...leaveData, leaveType: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="annual">إجازة سنوية اعتيادية (تُخصم من الرصيد السنوي)</option>
                  <option value="sick">إجازة مرضية (بتقرير طبي)</option>
                  <option value="casual">إجازة عارضة</option>
                  <option value="unpaid">إجازة بدون أجر</option>
                  <option value="marriage">إجازة زواج</option>
                  <option value="maternity">إجازة وضع / رعاية طفل</option>
                  <option value="bereavement">إجازة وفاة</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>من تاريخ (بداية الإجازة):</label>
                  <input
                    type="date"
                    value={leaveData.startDate}
                    onChange={(e) => setLeaveData({ ...leaveData, startDate: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>إلى تاريخ (نهاية الإجازة):</label>
                  <input
                    type="date"
                    value={leaveData.endDate}
                    onChange={(e) => setLeaveData({ ...leaveData, endDate: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              {leaveData.startDate && leaveData.endDate && (() => {
                const s = new Date(leaveData.startDate);
                const e = new Date(leaveData.endDate);
                const days = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
                if (days > 0) {
                  return (
                    <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 'bold', color: '#0284c7' }}>
                      ⏱️ إجمالي مدة الإجازة المحسوبة: {days} يوم
                    </div>
                  );
                }
                return null;
              })()}

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>سبب وسبب طلب الإجازة:</label>
                <textarea
                  rows="3"
                  placeholder="اكتب أسباب الإجازة أو تفاصيل التنسيق مع الفرع..."
                  value={leaveData.reason}
                  onChange={(e) => setLeaveData({ ...leaveData, reason: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowLeaveModal(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start" style={{ background: '#0284c7' }}>
                  📤 إرسال طلب الإجازة للإدارة العليا للاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── MODAL 5: BRANCH MANAGER EMPLOYEE EVALUATION MODAL ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showEvalModal && (
        <div className="modal-backdrop" onClick={() => setShowEvalModal(false)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', width: '94%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', borderRadius: '18px', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1.5px solid #ccfbf1', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '17.5px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⭐</span>
                <span>رصد تقييم أداء موظف بالفرع</span>
              </h3>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '14px' }} onClick={() => setShowEvalModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmitBranchEvaluation} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Month Switcher System (Requirement 28) */}
              <div style={{
                background: 'linear-gradient(135deg, #f0fdfa, #f8fafc)',
                border: '1.5px solid #99f6e4',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🗓️</span>
                  <span>شهر التقييم المستهدف:</span>
                </span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      const cur = bmEvalMonth || selectedMonth || getRealTodayStr().slice(0, 7);
                      const [y, m] = cur.split('-').map(Number);
                      const d = new Date(y, m - 2, 1);
                      setBmEvalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                    }}
                    style={{ padding: '3px 8px', fontSize: '12px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '6px' }}
                    title="الشهر السابق"
                  >
                    ◀
                  </button>

                  <input
                    type="month"
                    value={bmEvalMonth || selectedMonth || getRealTodayStr().slice(0, 7)}
                    onChange={(e) => setBmEvalMonth(e.target.value)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: '1.5px solid #0d9488',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      color: '#0f766e',
                      background: '#fff',
                      cursor: 'pointer'
                    }}
                    required
                  />

                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      const cur = bmEvalMonth || selectedMonth || getRealTodayStr().slice(0, 7);
                      const [y, m] = cur.split('-').map(Number);
                      const d = new Date(y, m, 1);
                      setBmEvalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                    }}
                    style={{ padding: '3px 8px', fontSize: '12px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '6px' }}
                    title="الشهر التالي"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* Employee Selector (Requirement 28) */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e293b' }}>اختر الموظف المراد تقييمه *</label>
                <select
                  value={bmEvalEmpId}
                  onChange={(e) => setBmEvalEmpId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #0d9488', fontWeight: 'bold', fontSize: '13.5px', background: '#fff' }}
                >
                  <option value="">-- اختر موظف من طاقم الفرع --</option>
                  {branchEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (كود: {e.code} — الوظيفة: {e.jobTitle || 'موظف'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Immediate Job Title & Employee Info Card (Requirement 28) */}
              {bmEvalEmpId && (() => {
                const selEmp = branchEmployees.find((e) => String(e.id) === String(bmEvalEmpId)) || (state.employees || []).find((e) => String(e.id) === String(bmEvalEmpId));
                const totalSc = bmEvalItems.reduce((acc, i) => acc + (parseFloat(i.score) || 0), 0);
                const maxSc = bmEvalItems.reduce((acc, i) => acc + (parseFloat(i.maxScore) || 20), 0);
                const pct = maxSc > 0 ? Math.round((totalSc / maxSc) * 100) : 0;

                return (
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdfa, #e6fffa)',
                    border: '2px solid #0d9488',
                    padding: '14px 18px',
                    borderRadius: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 3px 10px rgba(13,148,136,0.08)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>👤</span>
                        <strong style={{ fontSize: '15.5px', color: '#0f172a' }}>{selEmp?.name}</strong>
                        <span style={{ fontSize: '12px', background: '#ccfbf1', color: '#0f766e', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                          كود: {selEmp?.code}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#475569' }}>📍 الفرع:</span>
                        <strong style={{ color: '#0f766e', fontSize: '13px' }}>{currentBranch?.name || 'الفرع'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid #99f6e4', paddingTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 'bold' }}>الوظيفة المعتمدة:</span>
                        <span style={{
                          background: '#0d9488',
                          color: '#ffffff',
                          padding: '4px 14px',
                          borderRadius: '8px',
                          fontWeight: '900',
                          fontSize: '14px',
                          boxShadow: '0 2px 6px rgba(13,148,136,0.2)'
                        }}>
                          👔 {selEmp?.jobTitle || 'موظف'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          ({bmEvalItems.length} معايير محملة)
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12.5px', color: '#0f766e', fontWeight: 'bold' }}>الدرجة والنسبة:</span>
                        <span style={{
                          background: pct >= 85 ? '#dcfce7' : pct >= 70 ? '#fef3c7' : '#fee2e2',
                          color: pct >= 85 ? '#15803d' : pct >= 70 ? '#b45309' : '#b91c1c',
                          border: `1px solid ${pct >= 85 ? '#86efac' : pct >= 70 ? '#fde68a' : '#fca5a5'}`,
                          padding: '3px 12px',
                          borderRadius: '8px',
                          fontWeight: '900',
                          fontSize: '15px'
                        }}>
                          {totalSc} / {maxSc} ({pct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Dynamic Job Criteria Rows */}
              {bmEvalItems.length > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ fontWeight: '800', fontSize: '13.5px', color: '#1e293b' }}>
                      📋 بنود التقييم المعتمدة لوظيفة الموظف ({bmEvalItems.length} معايير):
                    </label>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      الدرجة من 0 إلى الدرجة القصوى
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {bmEvalItems.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        style={{
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          background: '#ffffff',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1'
                        }}
                      >
                        <div style={{ flex: '3 1 250px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>
                            #{idx + 1} — {item.title}
                          </div>
                          {item.description && (
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                              {item.description}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold' }}>الدرجة:</label>
                          <input
                            type="number"
                            min="0"
                            max={item.maxScore}
                            value={item.score}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setBmEvalItems(bmEvalItems.map((i) => i.id === item.id ? { ...i, score: Math.min(val, item.maxScore) } : i));
                            }}
                            style={{ width: '75px', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #0d9488', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', color: '#0f766e' }}
                            required
                          />
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>
                            / {item.maxScore}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manager Notes */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>📝 ملاحظات وتوصيات مدير الفرع على أداء الموظف</label>
                <textarea
                  rows="2"
                  placeholder="اكتب ملاحظاتك التوجيهية وتوصياتك الإدارية..."
                  value={bmEvalNotes}
                  onChange={(e) => setBmEvalNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEvalModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-start" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', padding: '10px 22px', fontSize: '13.5px' }}>
                  🚀 إرسال التقييم للموظف للمراجعة والرد الأول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
