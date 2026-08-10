import React, { useState, useMemo } from 'react';
import EmployeeLeaveModule from '../employee-portal/EmployeeLeaveModule';
import EmployeePermissionsModule from '../employee-portal/EmployeePermissionsModule';
import EmployeeLoansModule from '../employee-portal/EmployeeLoansModule';
import EmployeeEvaluationsModule from '../employee-portal/EmployeeEvaluationsModule';
import PayslipPrintModal from '../payroll/PayslipPrintModal';

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function getArabicWeekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return WEEKDAYS_AR[d.getDay()] || '';
}

function formatMoney(num) {
  return (parseFloat(num) || 0).toFixed(2);
}

export default function BranchManagerView({
  state,
  setState,
  saveState,
  currentBranch,
  activeTab = 'dashboard',
  setActiveTab,
  showToast,
  onExportExcel
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedPunchEmpId, setSelectedPunchEmpId] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  
  // Roster Modal Preview state
  const [previewRosterEmp, setPreviewRosterEmp] = useState(null);

  // Propose Employee Adjustment Form state
  const [adjEmpId, setAdjEmpId] = useState('');
  const [adjType, setAdjType] = useState('bonus'); // 'bonus' | 'penalty'
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Roster Edit Request to Admin state
  const [showRosterEditModal, setShowRosterEditModal] = useState(false);
  const [rosterEditEmpId, setRosterEditEmpId] = useState('');
  const [rosterEditDetails, setRosterEditDetails] = useState('');

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
      salary: 8000,
      annualLeaveBalance: 21,
      workHoursPerDay: 8,
      workDaysPerMonth: 26
    };
  }, [state.employees, currentBranch]);

  // Branch Employees
  const branchEmployees = useMemo(() => {
    return (state.employees || []).filter((e) => e.branchId === currentBranch?.id);
  }, [state.employees, currentBranch]);

  // Branch Requests
  const branchRequests = useMemo(() => {
    const branchEmpIds = new Set(branchEmployees.map((e) => e.id));
    return (state.requests || []).filter(
      (r) => branchEmpIds.has(r.employeeId) || r.branchId === currentBranch?.id
    );
  }, [state.requests, branchEmployees, currentBranch]);

  // ── Calculate Manager Salary Metrics ──
  const managerSalaryMetrics = useMemo(() => {
    const salary = managerEmp.salary || 8000;
    const workHoursPerDay = managerEmp.workHoursPerDay || 8;
    const workDaysPerMonth = managerEmp.workDaysPerMonth || 26;
    const dailyRate = Math.round((salary / workDaysPerMonth) * 100) / 100;
    const hourlyRate = Math.round((dailyRate / workHoursPerDay) * 100) / 100;

    const managerShifts = (state.shifts || []).filter(
      (s) => s.employeeId === managerEmp.id && s.date.startsWith(selectedMonth)
    );
    const totalHours = Math.round(managerShifts.reduce((acc, s) => acc + (s.hours || 0), 0) * 100) / 100;
    const baseEarnings = Math.round(totalHours * hourlyRate * 100) / 100;

    const managerAdjs = (state.adjustments || []).filter(
      (a) => (a.employeeId === managerEmp.id || a.employeeId === 'all') && a.date.startsWith(selectedMonth)
    );

    const totalBonus = managerAdjs
      .filter((a) => a.type === 'bonus')
      .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    const totalDeduction = managerAdjs
      .filter((a) => a.type === 'deduction' || a.type === 'penalty')
      .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    const netSalary = Math.round((baseEarnings + totalBonus - totalDeduction) * 100) / 100;

    return {
      salary,
      workHoursPerDay,
      workDaysPerMonth,
      dailyRate,
      hourlyRate,
      totalHours,
      baseEarnings,
      totalBonus,
      totalDeduction,
      netSalary,
      shiftsCount: managerShifts.length,
      totalBreakHours: Math.round(managerShifts.reduce((acc, s) => acc + (s.breakHours || 0), 0) * 100) / 100,
      shiftsList: managerShifts
    };
  }, [managerEmp, state.shifts, state.adjustments, selectedMonth]);

  // ── Handlers ──
  const handleManagerApproveRequest = async (reqId) => {
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === reqId) {
        const requiresAdmin = r.targetApproval !== 'branch_only';
        const isAdminApproved = r.adminApproved || r.status === 'pending_admin';
        const finalStatus = requiresAdmin ? 'pending_admin' : 'approved';
        return {
          ...r,
          branchApproved: true,
          status: isAdminApproved && r.adminApproved ? 'approved' : finalStatus
        };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم الموافقة المبدئية على الطلب وتحويله للإدارة العليا');
  };

  const handleManagerRejectRequest = async (reqId) => {
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === reqId) {
        return { ...r, branchApproved: false, status: 'rejected' };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🔴 تم رفض الطلب');
  };

  const handleApproveRoster = async (rosterId) => {
    const updatedRosters = (state.rosters || []).map((r) => {
      if (r.id === rosterId) {
        const adminApproved = r.adminApproved;
        const newStatus = adminApproved ? 'approved' : 'pending_admin';
        return {
          ...r,
          branchApproved: true,
          status: newStatus
        };
      }
      return r;
    });

    const updatedState = { ...state, rosters: updatedRosters };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم التوقيع والموافقة على الجدول من مدير الفرع');
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
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
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
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    setAdjAmount('');
    setAdjReason('');
    showToast?.('📤 تم رفع طلب المكافأة/الخصم للإدارة العليا (لن يُطبق على أجر الموظف إلا بعد موافقة الإدارة العليا)');
  };

  // Dynamic evaluation criteria handlers
  const handleAddEvalItem = () => {
    const newId = String(Date.now());
    setEvalItems([...evalItems, { id: newId, title: '', score: 10, maxScore: 10 }]);
  };

  const handleRemoveEvalItem = (id) => {
    setEvalItems(evalItems.filter(item => item.id !== id));
  };

  const handleUpdateEvalItem = (id, field, value) => {
    setEvalItems(evalItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // Submit Monthly Evaluation by Branch Manager
  const handleSubmitEvaluation = async (e) => {
    e.preventDefault();
    if (!evalEmpId) {
      showToast?.('يرجى اختيار الموظف المراد تقييمه');
      return;
    }

    const totalScore = evalItems.reduce((acc, item) => acc + (parseFloat(item.score) || 0), 0);
    const maxTotalScore = evalItems.reduce((acc, item) => acc + (parseFloat(item.maxScore) || 10), 0);
    const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;
    
    let rating = 'ممتاز';
    if (percentage < 60) rating = 'ضعيف';
    else if (percentage < 75) rating = 'مقبول';
    else if (percentage < 85) rating = 'جيد';
    else if (percentage < 95) rating = 'جيد جداً';

    const empObj = branchEmployees.find((e) => e.id === evalEmpId);

    const newEval = {
      id: `eval_${Date.now()}`,
      employeeId: evalEmpId,
      employeeName: empObj?.name || '',
      employeeCode: empObj?.code || '',
      branchId: currentBranch?.id,
      managerId: managerEmp.id,
      managerName: managerEmp.name,
      month: evalMonth,
      items: evalItems,
      totalScore,
      maxTotalScore,
      percentage,
      score: percentage,
      rating,
      notes: evalNotes.trim(),
      evaluatorRole: 'مدير الفرع',
      employeeStatus: 'pending',
      employeeComment: '',
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };

    const updatedEvals = [newEval, ...(state.evaluations || [])];
    const updatedState = { ...state, evaluations: updatedEvals };

    setState(updatedState);
    if (saveState) await saveState(updatedState);

    setEvalNotes('');
    showToast?.('✅ تم حفظ التقييم الشهري وإرساله للموظف وللإدارة العليا بنجاح');
  };

  const handleSaveMgrEvalEdit = async (e) => {
    e.preventDefault();
    if (!mgrEditingEval) return;

    const totalScore = mgrEditItems.reduce((acc, item) => acc + (parseFloat(item.score) || 0), 0);
    const maxTotalScore = mgrEditItems.reduce((acc, item) => acc + (parseFloat(item.maxScore) || 10), 0);
    const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;

    let rating = 'ممتاز';
    if (percentage < 60) rating = 'ضعيف';
    else if (percentage < 75) rating = 'مقبول';
    else if (percentage < 85) rating = 'جيد';
    else if (percentage < 95) rating = 'جيد جداً';

    const isApprovedOrRejected = mgrEditingEval.employeeStatus === 'approved' || mgrEditingEval.employeeStatus === 'rejected';

    if (!isApprovedOrRejected) {
      // Direct edit if employee has NOT responded yet
      const updatedEvals = (state.evaluations || []).map((ev) => {
        if (ev.id === mgrEditingEval.id) {
          return {
            ...ev,
            items: mgrEditItems,
            score: percentage,
            percentage,
            totalScore,
            maxTotalScore,
            rating,
            notes: mgrEditNotes.trim(),
            updatedAt: new Date().toISOString()
          };
        }
        return ev;
      });

      const updatedState = { ...state, evaluations: updatedEvals };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      setMgrEditingEval(null);
      showToast?.('✅ تم تعديل التقييم بنجاح قبل رد الموظف');
    } else {
      // Send Edit Request to Super Admin if employee ALREADY responded
      const newReq = {
        id: `req_eval_edit_${Date.now()}`,
        type: 'eval_edit_request',
        typeLabel: 'طلب تعديل تقييم (بعد رد الموظف)',
        evalId: mgrEditingEval.id,
        employeeId: mgrEditingEval.employeeId,
        employeeName: mgrEditingEval.employeeName,
        newItems: mgrEditItems,
        newNotes: mgrEditNotes.trim(),
        newPercentage: percentage,
        status: 'pending_admin',
        branchApproved: true,
        adminApproved: false,
        targetApproval: 'admin_only',
        createdAt: new Date().toISOString()
      };

      const updatedRequests = [newReq, ...(state.requests || [])];
      const updatedState = { ...state, requests: updatedRequests };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      setMgrEditingEval(null);
      showToast?.('📤 تم إرسال طلب تعديل التقييم إلى الإدارة العليا للاعتماد رسمياً');
    }
  };

  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif" }} className="fade-in-page">

      {/* ── Top Header Profile Card for Branch Manager ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
        borderRadius: '16px',
        padding: '20px 24px',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        boxShadow: '0 6px 20px rgba(13,148,136,0.25)',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#ffffff',
            color: '#0d9488',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            fontWeight: '800',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            flexShrink: 0
          }}>
            {managerEmp.photoUrl ? (
              <img src={managerEmp.photoUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              managerEmp.name.trim().charAt(0)
            )}
          </div>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>
              {managerEmp.name}
            </h2>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '13.5px', fontWeight: '500' }}>
              👔 {managerEmp.jobTitle} &nbsp;|&nbsp; 📍 فرع: {currentBranch?.name || 'الفرع الرئيسي'} &nbsp;|&nbsp; 🆔 كود: {managerEmp.code}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', textAlign: 'center' }}>
            <span style={{ fontSize: '12px', display: 'block', opacity: 0.85 }}>عدد موظفي الفرع</span>
            <span style={{ fontSize: '18px', fontWeight: '800' }}>{branchEmployees.length} موظف</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', textAlign: 'center' }}>
            <span style={{ fontSize: '12px', display: 'block', opacity: 0.85 }}>طلبات تنتظر الاعتماد</span>
            <span style={{ fontSize: '18px', fontWeight: '800' }}>
              {branchRequests.filter((r) => r.status === 'pending' || r.status === 'pending_admin').length}
            </span>
          </div>
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              style={{
                background: '#ffffff',
                color: '#0d9488',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '10px',
                fontWeight: '800',
                fontSize: '13.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
              }}
            >
              📊 تصدير Excel
            </button>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 1. DASHBOARD TAB ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Branch Employees Live Punch Status Grid */}
          <div className="card settings-card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              👥 موظفو الفرع وتتبع البصمة الحية اليوم
            </h3>
            
            {branchEmployees.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا يوجد موظفين مسجلين بهذا الفرع حتى الآن.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {branchEmployees.map((emp) => {
                  const activeShift = state.activeShifts?.[emp.id];
                  const statusLabel = activeShift
                    ? (activeShift.isOnBreak ? '⏸️ في استراحة' : '🟢 على رأس العمل')
                    : '🔴 لم يبصم / خارج الوردية';
                  const statusBg = activeShift
                    ? (activeShift.isOnBreak ? '#fef3c7' : '#dcfce7')
                    : '#fef2f2';
                  const statusColor = activeShift
                    ? (activeShift.isOnBreak ? '#d97706' : '#15803d')
                    : '#b91c1c';

                  return (
                    <div
                      key={emp.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '16px',
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s, box-shadow 0.15s'
                      }}
                      onClick={() => {
                        setSelectedPunchEmpId(emp.id);
                        setActiveTab('emp-punches');
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e6f7f5', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {emp.name.charAt(0)}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</h4>
                          <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{emp.jobTitle} (كود: {emp.code})</span>
                        </div>
                      </div>
                      <div style={{ background: statusBg, color: statusColor, padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '700', textAlign: 'center' }}>
                        {statusLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Branch Requests Summary Card */}
          <div className="card settings-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>📋 طلبات موظفي الفرع وحالتها لدى الإدارة العليا</h3>
              <button className="btn btn-start" onClick={() => setActiveTab('requests')} style={{ fontSize: '13px', padding: '6px 14px' }}>
                انتقال لصفحة الطلبات الكاملة ➔
              </button>
            </div>

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
                        <td><span className="badge badge-primary">{r.typeLabel || r.type}</span></td>
                        <td style={{ fontSize: '13px' }}>{r.reason || r.details || '—'}</td>
                        <td>
                          {r.branchApproved ? (
                            <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 تم اعتمادك</span>
                          ) : (
                            <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ بانتظار موافقتك</span>
                          )}
                        </td>
                        <td>
                          {r.status === 'approved' && <span className="approval-status-badge approved">🟢 معتمد نهائياً</span>}
                          {r.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 بانتظار الإدارة العليا</span>}
                          {r.status === 'pending' && <span className="approval-status-badge pending">⏳ قيد المراجعة</span>}
                          {r.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 2. REQUESTS TAB ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '17px', color: '#1e293b' }}>
            📋 جميع طلبات موظفي الفرع (إجازات - سلف - أذونات - تبديل شفتات)
          </h3>

          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الموظف</th>
                  <th>نوع الطلب</th>
                  <th>التفاصيل والسبب</th>
                  <th>موافقتك (مدير الفرع)</th>
                  <th>حالة الإدارة العليا</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {branchRequests.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      لا توجد طلبات لموظفي الفرع في الوقت الحالي.
                    </td>
                  </tr>
                ) : (
                  branchRequests.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontSize: '12.5px' }}>{r.createdAt ? r.createdAt.slice(0, 10) : r.startDate || '—'}</td>
                      <td style={{ fontWeight: '700' }}>{r.employeeName || 'موظف'}</td>
                      <td><span className="badge badge-primary">{r.typeLabel || r.leaveType || r.type}</span></td>
                      <td style={{ fontSize: '13px' }}>{r.reason || r.details || '—'}</td>
                      <td>
                        {r.branchApproved ? (
                          <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 تم الاعتماد</span>
                        ) : r.status === 'rejected' ? (
                          <span style={{ color: '#dc2626', fontWeight: '700' }}>🔴 مرفوض</span>
                        ) : (
                          <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ مطلوب موافقتك</span>
                        )}
                      </td>
                      <td>
                        {r.status === 'approved' && <span className="approval-status-badge approved">🟢 معتمد نهائياً</span>}
                        {r.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 قيد اعتماد الإدارة العليا</span>}
                        {r.status === 'pending' && <span className="approval-status-badge pending">⏳ قيد المراجعة</span>}
                        {r.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض</span>}
                      </td>
                      <td>
                        {(!r.branchApproved && r.status !== 'rejected') ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-start"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              onClick={() => handleManagerApproveRequest(r.id)}
                            >
                              ✓ موافقة
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }}
                              onClick={() => handleManagerRejectRequest(r.id)}
                            >
                              ✕ رفض
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── 3. BRANCH ROSTER TAB (With Preview Modal) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'branch-roster' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '17px', color: '#1e293b' }}>📅 الجدول الشهري لموظفي الفرع والموافقات</h3>
            <button className="btn btn-start" onClick={() => setShowRosterEditModal(true)}>
              ✏️ طلب من الإدارة العليا تعديل جدول موظف
            </button>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
            ⚠️ تنبيه: أي تعديل أو إدخال لجدول موظف يتطلب موافقة كلاً من مدير الفرع والإدارة العليا معاً ليعتمد رسمياً.
          </p>

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
                    const roster = (state.rosters || []).find((r) => r.employeeId === emp.id && r.month === selectedMonth);
                    return (
                      <tr key={emp.id}>
                        <td style={{ fontWeight: '700' }}>{emp.name} ({emp.code})</td>
                        <td>{selectedMonth}</td>
                        <td>
                          {roster?.branchApproved ? (
                            <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد من مدير الفرع</span>
                          ) : roster ? (
                            <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ يحتاج توقيعك</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>لم يتم إنشاء جدول</span>
                          )}
                        </td>
                        <td>
                          {roster?.adminApproved ? (
                            <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد من الإدارة العليا</span>
                          ) : roster ? (
                            <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ بانتظار الإدارة العليا</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {roster?.status === 'approved' ? (
                            <span className="approval-status-badge approved">🟢 معتمد ونشط</span>
                          ) : roster ? (
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
                            {roster && !roster.branchApproved && (
                              <button className="btn btn-start" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleApproveRoster(roster.id)}>
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

          {/* Roster Preview Modal */}
          {previewRosterEmp && (
            <div className="modal-backdrop">
              <div className="modal-content card" style={{ maxWidth: '650px', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
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
              <div className="modal-content card" style={{ maxWidth: '500px', padding: '24px' }}>
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
                {(state.adjustments || []).filter((a) => a.employeeId === managerEmp.id).length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>لا توجد مكافآت أو خصومات مسجلة باسمك حتى الآن.</td></tr>
                ) : (
                  (state.adjustments || []).filter((a) => a.employeeId === managerEmp.id).map((a) => (
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
                {branchRequests.filter((r) => r.type === 'bonus' || r.type === 'penalty').length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>لا توجد طلبات مكافآت أو خصومات مسجلة.</td></tr>
                ) : (
                  branchRequests.filter((r) => r.type === 'bonus' || r.type === 'penalty').map((r) => (
                    <tr key={r.id}>
                      <td>{r.createdAt ? r.createdAt.slice(0, 10) : '—'}</td>
                      <td style={{ fontWeight: '700' }}>{r.employeeName || 'موظف'}</td>
                      <td><span className={`badge ${r.type === 'bonus' ? 'badge-success' : 'badge-danger'}`}>{r.type === 'bonus' ? 'مكافأة' : 'خصم'}</span></td>
                      <td style={{ fontWeight: '700' }}>{r.amount} ج.م</td>
                      <td>{r.reason || r.details || '—'}</td>
                      <td>
                        {r.status === 'approved' && <span className="approval-status-badge approved">🟢 معتمد وتم تطبيقه على الأجر</span>}
                        {r.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 بانتظار موافقة الإدارة العليا</span>}
                        {r.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض من الإدارة العليا</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '17px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 سجل البصمات والورديات — موظفي الفرع ({selectedMonth})
            </h3>
            <div style={{ maxWidth: '240px' }}>
              <select value={selectedPunchEmpId} onChange={(e) => setSelectedPunchEmpId(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <option value="">-- جميع موظفي الفرع --</option>
                {branchEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const filteredShifts = (state.shifts || []).filter((s) => {
              const empObj = branchEmployees.find((e) => e.id === s.employeeId);
              if (!empObj) return false;
              if (selectedPunchEmpId && s.employeeId !== selectedPunchEmpId) return false;
              return s.date.startsWith(selectedMonth);
            }).sort((a, b) => a.date.localeCompare(b.date));

            const totalBreak = filteredShifts.reduce((acc, s) => acc + (s.breakHours || 0), 0);
            const totalHours = filteredShifts.reduce((acc, s) => acc + (s.hours || 0), 0);

            return (
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
                    {filteredShifts.length === 0 ? (
                      <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد بصمات مسجلة لهؤلاء الموظفين لهذا الشهر.</td></tr>
                    ) : (
                      filteredShifts.map((s, idx) => (
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
                            {formatMoney(s.hours)} ساعة
                          </td>
                          <td>
                            <span style={{ color: '#0d9488', fontWeight: '700' }}>🔒 مقيد</span>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{s.note || 'تسجيل بصمة عادية'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredShifts.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: '800', background: '#f8fafc' }}>
                        <td colSpan="5" style={{ textAlign: 'right', paddingRight: '12px' }}>
                          الإجمالي ({filteredShifts.length} وردية)
                        </td>
                        <td>
                          <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px' }}>
                            {formatMoney(totalBreak)} س
                          </span>
                        </td>
                        <td style={{ color: '#0d9488' }}>{formatMoney(totalHours)} ساعة</td>
                        <td><span style={{ color: '#0d9488' }}>🔒 مقيد</span></td>
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
            {onExportExcel && (
              <button className="btn btn-start" onClick={onExportExcel} style={{ fontSize: '13px', padding: '6px 14px' }}>
                📊 تصدير Excel
              </button>
            )}
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
                        {formatMoney(s.hours)} ساعة
                      </td>
                      <td style={{ fontWeight: '700', color: '#16a34a' }}>
                        {formatMoney(s.hours * managerSalaryMetrics.hourlyRate)} ج.م
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-start" onClick={() => setShowPrintModal(true)} style={{ fontSize: '13px', padding: '6px 14px' }}>
                📄 تصدير PDF / طباعة كشف المرتب
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
          />

          {/* 1. احتساب سعر الساعة اليومي */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#f0fdf4', padding: '12px 16px', color: '#166534', fontWeight: '800', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ احتساب سعر الساعة اليومي
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>سعر الساعة الشهرية (الراتب الأساسي)</span>
                <span style={{ fontWeight: '700' }}>{formatMoney(managerSalaryMetrics.salary)} ج.م</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>ساعات العمل اليومية المحددة</span>
                <span style={{ fontWeight: '700' }}>{managerSalaryMetrics.workHoursPerDay} ساعة / يوم</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>أيام العمل الشهرية المحددة</span>
                <span style={{ fontWeight: '700' }}>{managerSalaryMetrics.workDaysPerMonth} يوم / شهر</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px dashed #e2e8f0', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>سعر اليوم (المحسوب)</span>
                <span style={{ fontWeight: '700' }}>{formatMoney(managerSalaryMetrics.dailyRate)} ج.م / يوم</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', fontSize: '14px', color: '#16a34a', fontWeight: '800' }}>
                <span>✅ سعر الساعة اليومي المحسوب</span>
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
      {/* ── 12. EVALUATIONS AND COMPLAINTS TAB (With Custom Criteria) ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'evaluations' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '17px', color: '#1e293b' }}>
            ⭐️ التقييمات الشهرية لموظفي الفرع وإرسالها للموظف والإدارة العليا
          </h3>

          {/* Form to submit evaluation */}
          <form onSubmit={handleSubmitEvaluation} style={{ background: 'var(--surface-muted)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 14px', fontSize: '15px', color: '#0d9488', fontWeight: '800' }}>
              ➕ إنشـاء تقيـيم أداء شـهري جديـد لموظـف
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
              <div className="field">
                <label>اختر الموظف</label>
                <select value={evalEmpId} onChange={(e) => setEvalEmpId(e.target.value)} required>
                  <option value="">-- اختر الموظف بالفرع --</option>
                  {branchEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>شهر التقييم</label>
                <input type="month" value={evalMonth} onChange={(e) => setEvalMonth(e.target.value)} required />
              </div>
            </div>

            {/* Dynamic Evaluation Criteria Rows */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontWeight: '700', fontSize: '13.5px' }}>بنود الدرجات والتقييم التفصيلية (Criteria):</label>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={handleAddEvalItem}>
                  ➕ إضافة بند تقييم جديد
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {evalItems.map((item, index) => (
                  <div key={item.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--muted)' }}>#{index + 1}</span>
                    <input
                      type="text"
                      placeholder="عنوان بند التقييم..."
                      value={item.title}
                      onChange={(e) => handleUpdateEvalItem(item.id, 'title', e.target.value)}
                      style={{ flex: '2 1 200px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                      required
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px' }}>الدرجة:</span>
                      <input
                        type="number"
                        min="0"
                        max={item.maxScore}
                        value={item.score}
                        onChange={(e) => handleUpdateEvalItem(item.id, 'score', e.target.value)}
                        style={{ width: '60px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', textAlign: 'center' }}
                        required
                      />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>من {item.maxScore}</span>
                    </div>
                    {evalItems.length > 1 && (
                      <button type="button" onClick={() => handleRemoveEvalItem(item.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '16px' }}>
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: '16px' }}>
              <label>ملاحظات ومبررات مدير الفرع على التقييم</label>
              <textarea rows="3" placeholder="اكتب الملاحظات والتوجيهات للموظف والإدارة..." value={evalNotes} onChange={(e) => setEvalNotes(e.target.value)} />
            </div>

            <button type="submit" className="btn btn-start">
              📤 إرسال التقييم للموظف وللإدارة العليا
            </button>
          </form>

          {/* Sent Evaluations List */}
          <h4 style={{ margin: '20px 0 12px', fontSize: '15px' }}>📋 سجل التقييمات المرسلة ودعم التعديل وردود الموظفين</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {(state.evaluations || []).filter((e) => e.branchId === currentBranch?.id || e.managerId === managerEmp.id).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                لا توجد تقييمات سابقة صادرة لهذا الفرع.
              </div>
            ) : (
              (state.evaluations || [])
                .filter((e) => e.branchId === currentBranch?.id || e.managerId === managerEmp.id)
                .map((ev) => {
                  const isApproved = ev.employeeStatus === 'approved' || ev.employeeStatus === 'rejected';
                  const hasPendingEditRequest = (state.requests || []).some(
                    (r) => r.type === 'eval_edit_request' && r.evalId === ev.id && r.status === 'pending_admin'
                  );

                  return (
                    <div key={ev.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: '800' }}>
                            👤 الموظف: {ev.employeeName || 'غير محدد'} ({ev.employeeCode})
                          </h4>
                          <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                            الشهر: {ev.month || ev.date} &nbsp;|&nbsp; المقيم: {ev.managerName || 'مدير الفرع'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '18px', fontWeight: '900', color: '#0d9488' }}>
                            {ev.percentage || ev.score}% ({ev.rating || 'ممتاز'})
                          </span>
                          
                          {hasPendingEditRequest ? (
                            <span className="badge warning">⏳ طلب التعديل بانتظار موافقة الإدارة العليا</span>
                          ) : (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '5px 12px', fontSize: '12.5px' }}
                              onClick={() => {
                                setMgrEditingEval(ev);
                                setMgrEditNotes(ev.notes || '');
                                setMgrEditItems(ev.items && ev.items.length > 0 ? [...ev.items] : [
                                  { id: '1', title: 'الالتزام بالمواعيد والحضور', score: Math.round((ev.score || 80) / 10), maxScore: 10 }
                                ]);
                              }}
                            >
                              {isApproved ? '✏️ طلب تعديل التقييم (يلزم موافقة الإدارة)' : '✏️ تعديل التقييم'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Criteria items table */}
                      {ev.items && ev.items.length > 0 && (
                        <div className="table-responsive" style={{ margin: '12px 0' }}>
                          <table className="bylaws-table" style={{ fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: 'var(--surface-muted)' }}>
                                <th>بند التقييم</th>
                                <th>الدرجة المكتسبة</th>
                                <th>الدرجة القصوى</th>
                                <th>النسبة والتعديل</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ev.items.map((item, idx) => {
                                const itemScore = parseFloat(item.score) || 0;
                                const itemMax = parseFloat(item.maxScore) || 10;
                                const pct = itemMax > 0 ? Math.round((itemScore / itemMax) * 100) : 0;
                                return (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: '700' }}>{item.title || `بند #${idx + 1}`}</td>
                                    <td style={{ color: '#0d9488', fontWeight: '800' }}>{itemScore}</td>
                                    <td style={{ color: 'var(--muted)' }}>{itemMax}</td>
                                    <td>
                                      <span className={`badge ${pct >= 85 ? 'badge-success' : pct >= 70 ? 'badge-warning' : 'badge-danger'}`}>
                                        {pct}%
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {ev.notes && (
                        <div style={{ fontSize: '13px', background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '8px' }}>
                          <strong>ملاحظات المدير:</strong> {ev.notes}
                        </div>
                      )}

                      <div style={{ fontSize: '12.5px', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                        <span>
                          حالة الموظف:{' '}
                          {ev.employeeStatus === 'approved' ? (
                            <strong style={{ color: '#16a34a' }}>🟢 وافق الموظف على التقييم</strong>
                          ) : ev.employeeStatus === 'rejected' ? (
                            <strong style={{ color: '#dc2626' }}>🔴 الموظف اعترض على التقييم</strong>
                          ) : (
                            <strong style={{ color: '#d97706' }}>⏳ بانتظار رد الموظف</strong>
                          )}
                        </span>
                        {ev.employeeComment && (
                          <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>
                            💬 رد الموظف: "{ev.employeeComment}"
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Branch Manager Evaluation Edit Modal */}
          {mgrEditingEval && (
            <div className="modal-backdrop">
              <div className="modal-content card" style={{ maxWidth: '600px', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 12px', color: '#0d9488' }}>
                  ✏️ تعديل التقييم للموظف: {mgrEditingEval.employeeName}
                </h3>

                {(mgrEditingEval.employeeStatus === 'approved' || mgrEditingEval.employeeStatus === 'rejected') ? (
                  <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#b45309', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                    ⚠️ ملاحظة: هذا التقييم تمت مراجعته من الموظف بالفعل. سيتم إرسال التعديل كطلب للإدارة العليا للاعتماد قبل تطبيقه.
                  </div>
                ) : (
                  <div style={{ background: '#e6f7f5', border: '1px solid #0d9488', color: '#0f766e', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                    ℹ️ الموظف لم يقم بالرد بعد، يمكنك تعديل درجات وبنود التقييم مباشرة.
                  </div>
                )}

                <form onSubmit={handleSaveMgrEvalEdit}>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ fontWeight: '700', fontSize: '13.5px' }}>بنود التقييم والدرجات:</label>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '2px 8px' }} onClick={() => setMgrEditItems([...mgrEditItems, { id: String(Date.now()), title: '', score: 10, maxScore: 10 }])}>
                        ➕ إضافة بند
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {mgrEditItems.map((item, idx) => (
                        <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            placeholder="اسم البند..."
                            value={item.title}
                            onChange={(e) => setMgrEditItems(mgrEditItems.map(i => i.id === item.id ? { ...i, title: e.target.value } : i))}
                            style={{ flex: '2 1 180px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            required
                          />
                          <input
                            type="number"
                            min="0"
                            max={item.maxScore}
                            value={item.score}
                            onChange={(e) => setMgrEditItems(mgrEditItems.map(i => i.id === item.id ? { ...i, score: e.target.value } : i))}
                            style={{ width: '65px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', textAlign: 'center' }}
                            required
                          />
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>/ {item.maxScore}</span>
                          {mgrEditItems.length > 1 && (
                            <button type="button" onClick={() => setMgrEditItems(mgrEditItems.filter(i => i.id !== item.id))} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}>
                              🗑️
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="field" style={{ marginBottom: '16px' }}>
                    <label>ملاحظات التقييم</label>
                    <textarea rows="3" value={mgrEditNotes} onChange={(e) => setMgrEditNotes(e.target.value)} />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setMgrEditingEval(null)}>إلغاء</button>
                    <button type="submit" className="btn btn-start">
                      {(mgrEditingEval.employeeStatus === 'approved' || mgrEditingEval.employeeStatus === 'rejected')
                        ? '📤 إرسال طلب التعديل للإدارة العليا'
                        : '💾 حفظ التعديل مباشرة'
                      }
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
