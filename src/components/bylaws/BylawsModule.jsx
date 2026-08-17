import React, { useState, useMemo, useEffect } from 'react';

const DEFAULT_BYLAWS_RULES = [
  { id: 'b1', title: 'التأخير عن موعد الشيفت من 15 إلى 30 دقيقة', impactType: 'deduction_days', impactVal: 0.25, category: 'حضور وانصراف' },
  { id: 'b2', title: 'التأخير عن موعد الشيفت أكثر من 30 دقيقة', impactType: 'deduction_days', impactVal: 0.5, category: 'حضور وانصراف' },
  { id: 'b3', title: 'الغياب عن الوردية بدون إذن مسبق', impactType: 'deduction_days', impactVal: 1.0, category: 'حضور وانصراف' },
  { id: 'b4', title: 'عدم الالتزام بالزي الرسمي للصيدلية', impactType: 'fixed_amount', impactVal: 50, category: 'سلوك وانضباط' },
  { id: 'b5', title: 'عدم الالتزام بنظافة وترتيب الصيدلية والرفوف', impactType: 'warning', impactVal: 0, category: 'نظافة وجودة' },
  { id: 'b6', title: 'خطأ أو عجز في تسليم الكاشير نهاية الوردية', impactType: 'fixed_amount', impactVal: 100, category: 'ماليات وخزينة' }
];

export default function BylawsModule({
  state,
  setState,
  saveState,
  showToast,
  userRole = 'admin',
  currentEmpId = null,
  filterFn = null
}) {
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'rules' | 'records'
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'branch';
  const isAdmin = userRole === 'admin';

  // Dynamic bylaws rules from central state with default fallback
  const bylawsRules = React.useMemo(() => {
    if (state.bylawsRules && Array.isArray(state.bylawsRules) && state.bylawsRules.length > 0) {
      return state.bylawsRules;
    }
    return DEFAULT_BYLAWS_RULES;
  }, [state.bylawsRules]);

  // State for official bylaws text
  const [bylawsText, setBylawsText] = useState(
    state.bylawsText || `
📜 لائحة العمل والجزاءات الرسمية لمجموعة الصيدليات الطبية

البند الأول: الحضور والانصراف والورديات
1. التزام الموظف بالمواعيد المحددة للوردية وفقاً للجدول الشهري المعتمد.
2. التوقيع عبر بصمة الوجه / اليد عند الحضور والانصراف في النطاق الجغرافي للصيدلية.
3. التخلف عن الوردية بدون إذن مسبق يعتبر غياباً غير مبرر يخضع للجزاءات المالية.

البند الثاني: السلوك المهني والانضباط
1. الالتزام الكامل بالزي الرسمي والتأكد من مظهر الصيدلية والنظافة العامة.
2. حسن معاملة المرضى والعملاء وتقديم الاستشارة الدوائية بمهنية عالية.
3. عدم ترك الصيدلية أو الوردية بدون بديل معتمد وموافقة مدير الفرع.

البند الثالث: تسليم النقدية والأدوية
1. دقة تسليم الكاشير وجرد الخزينة نهاية كل وردية.
2. يمنع سحب أدوية بالآجل إلا وفق الإجراءات الرسمية والطلبات المعتمدة.
    `.trim()
  );

  // Record Violation Form State
  const [targetEmpId, setTargetEmpId] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [showRecordModal, setShowRecordModal] = useState(false);

  // Rule Addition State
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('حضور وانصراف');
  const [newRuleImpactType, setNewRuleImpactType] = useState('deduction_days');
  const [newRuleImpactVal, setNewRuleImpactVal] = useState('0.25');
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);

  // Penalty Objection State
  const [objectionTargetReq, setObjectionTargetReq] = useState(null);
  const [objectionReason, setObjectionReason] = useState('');
  const [adminRejectReplyReq, setAdminRejectReplyReq] = useState(null);
  const [adminRejectReplyText, setAdminRejectReplyText] = useState('');

  const handleSaveBylawsText = async () => {
    const updatedState = { ...state, bylawsText };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم حفظ وتحديث نصوص لائحة العمل الرسمية بنجاح');
  };

  const handleAddRule = async () => {
    if (!newRuleTitle.trim()) return;
    const newRule = {
      id: 'b_' + Date.now(),
      title: newRuleTitle.trim(),
      category: newRuleCategory,
      impactType: newRuleImpactType,
      impactVal: parseFloat(newRuleImpactVal) || 0
    };
    const currentList = (state.bylawsRules && Array.isArray(state.bylawsRules) && state.bylawsRules.length > 0)
      ? state.bylawsRules
      : DEFAULT_BYLAWS_RULES;
    const updated = [...currentList, newRule];
    
    const updatedState = { ...state, bylawsRules: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setShowAddRuleModal(false);
    setNewRuleTitle('');
    setNewRuleImpactVal('0.25');
    showToast?.('✅ تم إضافة بند جزاء جديد إلى لائحة العمل');
  };

  const handleDeleteRule = async (id) => {
    const currentList = (state.bylawsRules && Array.isArray(state.bylawsRules) && state.bylawsRules.length > 0)
      ? state.bylawsRules
      : DEFAULT_BYLAWS_RULES;
    const updated = currentList.filter(r => String(r.id) !== String(id));
    
    const updatedState = { ...state, bylawsRules: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف بند الجزاء من اللائحة');
  };

  const handleSubmitViolation = async (e) => {
    e.preventDefault();
    if (!targetEmpId || !selectedRuleId) {
      showToast?.('يرجى تحديد الموظف والمخالفة اللائحية');
      return;
    }

    const emp = (state.employees || []).find(e => String(e.id) === String(targetEmpId));
    const rule = bylawsRules.find(r => r.id === selectedRuleId);
    if (!emp || !rule) return;

    let amount = 0;
    if (rule.impactType === 'deduction_days') {
      const salary = parseFloat(emp.salary) || 0;
      const workHours = parseFloat(emp.workHoursPerDay) || 8;
      const workDays = parseFloat(emp.workDaysPerMonth) || 26;
      const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
      amount = Math.round(dailyRate * (parseFloat(rule.impactVal) || 1) * 100) / 100;
    } else if (rule.impactType === 'fixed_amount') {
      amount = parseFloat(rule.impactVal) || 0;
    }

    const reqId = 'pen_' + Date.now();
    const newReq = {
      id: reqId,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: emp.branchId,
      type: 'penalty',
      ruleId: rule.id,
      ruleTitle: rule.title,
      impactType: rule.impactType,
      impactVal: rule.impactVal,
      amount: amount,
      reason: customReason || rule.title,
      details: `مخالفة لائحية: ${rule.title} | التأثير: ${getImpactDesc(rule)}`,
      createdAt: new Date().toISOString(),
      targetApproval: 'admin_only',
      branchApproved: true,
      status: isAdmin ? 'approved' : 'pending',
      adminApproved: isAdmin ? true : false,
      approvedAt: isAdmin ? new Date().toISOString() : undefined
    };

    let updatedAdjustments = state.adjustments || [];
    if (isAdmin && amount > 0) {
      const penaltyDesc = `خصم جزاء لائحى: ${rule.title} (${rule.impactType === 'deduction_days' ? `خصم ${rule.impactVal} يوم` : `${amount} ج.م`})`;
      const newAdj = {
        id: `adj_pen_${reqId}`,
        employeeId: emp.id,
        employeeName: emp.name,
        type: 'deduction',
        amount: amount,
        description: penaltyDesc,
        notes: penaltyDesc,
        reason: penaltyDesc,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      };
      updatedAdjustments = [newAdj, ...updatedAdjustments];
    }

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests, adjustments: updatedAdjustments };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setShowRecordModal(false);
    setTargetEmpId('');
    setCustomReason('');
    
    if (isAdmin) {
      showToast?.('⚖️ تم توثيق وتطبيق الجزاء المالي وخصمه من الراتب فوراً بنجاح');
    } else {
      showToast?.('✅ تم تسجيل المخالفة وإرسال طلب الجزاء فوراً للإدارة العليا للاعتماد والخصم');
    }
  };

  const handleSubmitObjection = async (e) => {
    e.preventDefault();
    if (!objectionTargetReq || !objectionReason.trim()) {
      showToast?.('يرجى كتابة أسباب ومبررات الاعتراض');
      return;
    }

    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === objectionTargetReq.id) {
        return {
          ...r,
          objection: {
            status: 'pending',
            reason: objectionReason.trim(),
            submittedAt: new Date().toISOString()
          }
        };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setObjectionTargetReq(null);
    setObjectionReason('');
    showToast?.('✅ تم إرسال اعتراضك إلى الإدارة العليا بنجاح وجاري مراجعته');
  };

  const handleAdminApproveObjection = async (reqId) => {
    let empId = null;
    let ruleTitle = '';
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === reqId) {
        empId = r.employeeId;
        ruleTitle = r.ruleTitle;
        return {
          ...r,
          status: 'cancelled',
          isCancelled: true,
          cancelledAt: new Date().toISOString(),
          objection: {
            ...(r.objection || {}),
            status: 'approved',
            resolvedAt: new Date().toISOString()
          }
        };
      }
      return r;
    });

    // Automatically remove any corresponding deduction from adjustments
    const updatedAdjustments = (state.adjustments || []).filter((a) => {
      if (a.id === reqId || a.id === `adj_${reqId}` || a.id === `adj_penalty_${reqId}`) return false;
      if (empId && String(a.employeeId) === String(empId) && (a.type === 'penalty' || a.type === 'deduction') && (a.reason === ruleTitle || a.details === ruleTitle)) return false;
      return true;
    });

    const updatedState = { ...state, requests: updatedRequests, adjustments: updatedAdjustments };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast?.('✅ تم قبول الاعتراض وإلغاء الخصم والجزاء اللائحي تلقائياً');
  };

  const handleAdminRejectObjection = async (reqId, reply = '') => {
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === reqId) {
        return {
          ...r,
          objection: {
            ...(r.objection || {}),
            status: 'rejected',
            adminReply: reply || 'تمت مراجعة ودراسة الاعتراض وتثبيت الجزاء المالي وفق اللائحة',
            resolvedAt: new Date().toISOString()
          }
        };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setAdminRejectReplyReq(null);
    setAdminRejectReplyText('');
    showToast?.('❌ تم رفض الاعتراض وتثبيت الجزاء المالي');
  };

  // Penalty Records Filter State
  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsBranch, setRecordsBranch] = useState('');
  const [recordsStatus, setRecordsStatus] = useState('all'); // 'all' | 'approved' | 'pending' | 'rejected' | 'objection'
  const [recordsPeriodMode, setRecordsPeriodMode] = useState('all'); // 'all' | 'current' | 'custom'
  const [recordsCustomFrom, setRecordsCustomFrom] = useState('');
  const [recordsCustomTo, setRecordsCustomTo] = useState('');

  const employees = state.employees || [];
  const branches = state.branches || [];

  // Aggregated penalties from requests and adjustments
  const allPenalties = useMemo(() => {
    const list = [];
    const seenReqIds = new Set();

    // 1. From requests
    (state.requests || []).forEach((r) => {
      if (r.type === 'penalty' || r.type === 'early_exit' || r.subType === 'lateness' || (r.type === 'adjustment' && r.subType === 'penalty') || r.ruleTitle) {
        seenReqIds.add(String(r.id));
        const emp = employees.find((e) => String(e.id) === String(r.employeeId));
        const bObj = branches.find((b) => String(b.id) === String(r.branchId || emp?.branchId));
        
        let amount = parseFloat(r.amount) || 0;
        if (!amount && (r.impactType || r.impactVal)) {
          if (r.impactType === 'deduction_days') {
            const salary = emp ? parseFloat(emp.salary) || 0 : 0;
            const workHours = emp ? parseFloat(emp.workHoursPerDay) || 8 : 8;
            const workDays = emp ? parseFloat(emp.workDaysPerMonth) || 26 : 26;
            const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
            amount = Math.round(dailyRate * (parseFloat(r.impactVal) || 1) * 100) / 100;
          } else if (r.impactType === 'fixed_amount') {
            amount = parseFloat(r.impactVal) || 0;
          }
        }

        list.push({
          id: r.id,
          employeeId: r.employeeId,
          employeeName: emp?.name || r.employeeName || 'موظف',
          employeeCode: emp?.code || r.employeeCode || '—',
          branchId: r.branchId || emp?.branchId,
          branchName: bObj?.name || 'الفرع الرئيسي',
          ruleTitle: r.ruleTitle || (r.subType === 'lateness' ? `تأخير عن الشيفت (${r.latenessMinutes || ''} د)` : r.reason) || 'مخالفة لائحية',
          category: r.category || 'انضباط ولائحة',
          impactType: r.impactType || (r.impactVal ? 'deduction_days' : 'fixed_amount'),
          impactVal: r.impactVal || 0,
          amount: amount,
          date: r.date || (r.createdAt ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          createdAt: r.createdAt || new Date().toISOString(),
          reason: r.reason || r.ruleTitle || r.details || 'مخالفة لائحية',
          details: r.details || r.reason || 'مخالفة لائحية',
          status: r.status || (r.adminApproved ? 'approved' : 'pending'),
          adminApproved: r.adminApproved,
          objection: r.objection || null,
          sourceType: 'request'
        });
      }
    });

    // 2. From adjustments (direct deductions/penalties)
    (state.adjustments || []).forEach((a) => {
      const isLinkedToReq = Array.from(seenReqIds).some((reqId) => a.id === `adj_pen_${reqId}` || a.id === reqId || a.id === `adj_${reqId}`);
      if (!isLinkedToReq && (a.type === 'deduction' || a.type === 'penalty')) {
        const emp = employees.find((e) => String(e.id) === String(a.employeeId));
        const bObj = branches.find((b) => String(b.id) === String(a.branchId || emp?.branchId));
        
        list.push({
          id: a.id,
          employeeId: a.employeeId,
          employeeName: emp?.name || a.employeeName || 'موظف',
          employeeCode: emp?.code || a.employeeCode || '—',
          branchId: a.branchId || emp?.branchId,
          branchName: bObj?.name || 'الفرع الرئيسي',
          ruleTitle: a.reason || a.description || 'خصم مالي مباشر',
          category: 'ماليات وخصومات',
          impactType: 'fixed_amount',
          impactVal: parseFloat(a.amount) || 0,
          amount: parseFloat(a.amount) || 0,
          date: a.date || (a.createdAt ? a.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          createdAt: a.createdAt || new Date().toISOString(),
          reason: a.reason || a.description || 'خصم مباشر',
          details: a.description || a.reason || 'خصم مباشر',
          status: 'approved',
          adminApproved: true,
          objection: null,
          sourceType: 'adjustment'
        });
      }
    });

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [state.requests, state.adjustments, employees, branches]);

  // Filtered penalties list according to active UI controls
  const filteredPenalties = useMemo(() => {
    return allPenalties.filter((p) => {
      if (currentEmpId && String(p.employeeId) !== String(currentEmpId)) return false;
      if (recordsBranch && String(p.branchId) !== String(recordsBranch)) return false;
      if (recordsStatus !== 'all') {
        if (recordsStatus === 'objection') {
          if (!p.objection) return false;
        } else if (recordsStatus === 'approved') {
          if (p.status !== 'approved' && !p.adminApproved) return false;
        } else if (recordsStatus === 'pending') {
          if (p.status !== 'pending' && p.status !== 'pending_admin') return false;
        } else if (recordsStatus === 'rejected') {
          if (p.status !== 'rejected') return false;
        }
      }
      if (recordsSearch.trim()) {
        const q = recordsSearch.trim().toLowerCase();
        const matchName = (p.employeeName || '').toLowerCase().includes(q);
        const matchCode = (p.employeeCode || '').toLowerCase().includes(q);
        const matchBranch = (p.branchName || '').toLowerCase().includes(q);
        const matchRule = (p.ruleTitle || '').toLowerCase().includes(q);
        const matchReason = (p.reason || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchBranch && !matchRule && !matchReason) return false;
      }
      if (recordsPeriodMode === 'current') {
        if (filterFn) {
          if (!filterFn(p.date)) return false;
        } else if (monthPicker) {
          if (!p.date.startsWith(monthPicker)) return false;
        }
      } else if (recordsPeriodMode === 'custom') {
        if (recordsCustomFrom && p.date < recordsCustomFrom) return false;
        if (recordsCustomTo && p.date > recordsCustomTo) return false;
      }
      return true;
    });
  }, [allPenalties, currentEmpId, recordsBranch, recordsStatus, recordsSearch, recordsPeriodMode, recordsCustomFrom, recordsCustomTo, filterFn, monthPicker]);

  const totalFilteredDeduction = filteredPenalties
    .filter((p) => p.status === 'approved' || p.adminApproved)
    .reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

  const pendingCount = filteredPenalties.filter((p) => p.status === 'pending' || p.status === 'pending_admin').length;
  const approvedCount = filteredPenalties.filter((p) => p.status === 'approved' || p.adminApproved).length;
  const objectionCount = filteredPenalties.filter((p) => p.objection && p.objection.status === 'pending_admin').length;

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📜 لائحة العمل والجزاءات وحساب الخصومات اللائحية
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            استعراض نصوص اللائحة الرسمية، قواعد المخالفات، وتوثيق الخصومات المباشرة
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`btn ${activeTab === 'text' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('text')}>
            📖 نصوص اللائحة الرسمية
          </button>
          <button className={`btn ${activeTab === 'rules' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('rules')}>
            ⚖️ جدول المخالفات والجزاءات
          </button>
          <button className={`btn ${activeTab === 'records' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('records')}>
            📋 سجل الجزاءات والخصومات
          </button>
          {isManagerOrAdmin && (
            <button className="btn btn-start" style={{ background: '#dc2626' }} onClick={() => setShowRecordModal(true)}>
              {isAdmin ? '⚖️ توثيق وتطبيق جزاء لائحي' : '⚠️ توثيق مخالفة لائحية جديدة'}
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Bylaws Official Text */}
      {activeTab === 'text' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <h3 style={{ fontFamily: 'Cairo', margin: '0 0 14px', color: 'var(--primary-dark)' }}>
            📜 نصوص وسياسات لائحة العمل الرسمية للصيدلية
          </h3>

          {isAdmin ? (
            <div>
              <textarea
                value={bylawsText}
                onChange={(e) => setBylawsText(e.target.value)}
                rows={12}
                style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.8', background: 'var(--surface-muted)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button className="btn btn-start" onClick={handleSaveBylawsText}>
                  💾 حفظ وتحديث نصوص اللائحة
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--surface-muted)', padding: '20px', borderRadius: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.9', fontSize: '14.5px', border: '1px solid var(--border)' }}>
              {bylawsText}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Penalty Rules Table */}
      {activeTab === 'rules' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          {/* Grace Period Configuration for Upper Management */}
          {isAdmin && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '16px 20px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', color: '#166534', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⏱️ تحديد مدة السماح بالتأخير المعتمدة للإدارة العليا
                </h4>
                <p style={{ margin: 0, color: '#15803d', fontSize: '13px' }}>
                  الموظف مسموح له بهذا الوقت بعد موعد ورديته المحدد بالجدول. عند تجاوز هذه المدة يتم فوراً رفع طلب جزاء للإدارة العليا ومدير الفرع وتنبيه النظام.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={state.orgSettings?.latenessGracePeriodMinutes !== undefined ? state.orgSettings.latenessGracePeriodMinutes : 15}
                    onChange={async (e) => {
                      const val = parseInt(e.target.value) || 0;
                      const updatedOrg = { ...state.orgSettings, latenessGracePeriodMinutes: val };
                      const updatedState = { ...state, orgSettings: updatedOrg };
                      if (setState) setState(updatedState);
                      if (saveState) await saveState(updatedState);
                    }}
                    style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>دقيقة</span>
                </div>
                <button
                  className="btn btn-start"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                  onClick={() => showToast?.('✅ تم حفظ وتحديث مدة السماح بالتأخير بنجاح')}
                >
                  💾 حفظ المدة
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)' }}>
              ⚖️ جدول قواعد المخالفات والجزاءات اللائحية وتأثيرها على الأجور
            </h3>
            {isAdmin && (
              <button className="btn btn-start" onClick={() => setShowAddRuleModal(true)}>
                ➕ إضافة بند مخالفة جديد
              </button>
            )}
          </div>

          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>التصنيف</th>
                  <th>بند المخالفة اللائحية</th>
                  <th>نوع التأثير على الأجور</th>
                  <th>مقدار التأثير والخصم</th>
                  {isAdmin && <th>الإجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {bylawsRules.map((rule) => (
                  <tr key={rule.id}>
                    <td><span className="badge badge-primary">{rule.category}</span></td>
                    <td style={{ fontWeight: '800' }}>{rule.title}</td>
                    <td>
                      {rule.impactType === 'deduction_days' && <span className="badge badge-danger">خصم أيام من الراتب</span>}
                      {rule.impactType === 'fixed_amount' && <span className="badge badge-warning">خصم مبلغ ثابت</span>}
                      {rule.impactType === 'warning' && <span className="badge secondary">إنذار كتابي</span>}
                    </td>
                    <td style={{ fontWeight: '900', color: 'var(--primary-dark)' }}>
                      {getImpactDesc(rule)}
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
                          onClick={() => handleDeleteRule(rule.id)}
                          title="حذف البند"
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Applied Penalty Records */}
      {activeTab === 'records' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)' }}>
                📋 سجل الجزاءات والمخالفات اللائحية الموثقة
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                استعراض كافة الخصومات والجزاءات لجميع الموظفين بالفروع مع إمكانية التصفية المباشرة
              </p>
            </div>

            {isManagerOrAdmin && (
              <button className="btn btn-start" style={{ background: '#dc2626' }} onClick={() => setShowRecordModal(true)}>
                {isAdmin ? '⚖️ توثيق وتطبيق جزاء لائحي' : '⚠️ توثيق مخالفة لائحية جديدة'}
              </button>
            )}
          </div>

          {/* Metric Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>إجمالي الجزاءات بالسجل</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#1e293b' }}>{filteredPenalties.length} مخالفة</h4>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#166534' }}>مطبقة ومخصومة بالراتب</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#15803d' }}>{approvedCount} معتمدة</h4>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#991b1b' }}>بانتظار قرار الإدارة</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#dc2626' }}>{pendingCount} معلقة</h4>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#92400e' }}>إجمالي مبالغ الخصومات</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#b45309' }}>{totalFilteredDeduction.toFixed(2)} ج.م</h4>
            </div>
          </div>

          {/* Advanced Filter Bar */}
          <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '14px 16px', borderRadius: '12px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: '1 1 200px' }}>
              <input
                type="text"
                placeholder="🔍 بحث بالاسم، الكود، نوع الجزاء..."
                value={recordsSearch}
                onChange={(e) => setRecordsSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              />
            </div>

            {!currentEmpId && (
              <div>
                <select value={recordsBranch} onChange={(e) => setRecordsBranch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
                  <option value="">🏢 جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.branchCode})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <select value={recordsStatus} onChange={(e) => setRecordsStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
                <option value="all">📋 جميع الحالات</option>
                <option value="approved">🟢 المعتمدة والمخصومة</option>
                <option value="pending">⏳ المعلقة بانتظار الإدارة</option>
                <option value="rejected">🔴 المرفوعة المرفوضة</option>
                <option value="objection">✋ بها اعتراضات موظفين</option>
              </select>
            </div>

            <div>
              <select value={recordsPeriodMode} onChange={(e) => setRecordsPeriodMode(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold' }}>
                <option value="all">📅 كل الفترات (شامل)</option>
                <option value="current">📅 حسب فترة النظام الحالية</option>
                <option value="custom">📆 فترة مخصصة (من - إلى)</option>
              </select>
            </div>

            {recordsPeriodMode === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="date" value={recordsCustomFrom} onChange={(e) => setRecordsCustomFrom(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }} />
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>إلى</span>
                <input type="date" value={recordsCustomTo} onChange={(e) => setRecordsCustomTo(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }} />
              </div>
            )}

            {(recordsSearch || recordsBranch || recordsStatus !== 'all' || recordsPeriodMode !== 'all') && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => {
                  setRecordsSearch('');
                  setRecordsBranch('');
                  setRecordsStatus('all');
                  setRecordsPeriodMode('all');
                  setRecordsCustomFrom('');
                  setRecordsCustomTo('');
                }}
              >
                🔄 إعادة ضبط الفلاتر
              </button>
            )}
          </div>

          {/* Table */}
          <div className="table-responsive">
            <table className="bylaws-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>تاريخ المخالفة</th>
                  <th>الموظف والفرع</th>
                  <th>نوع المخالفة اللائحية</th>
                  <th>مقدار الخصم / الأثر المالي</th>
                  <th>السبب والتفاصيل</th>
                  <th>حالة الاعتماد</th>
                  <th>الإجراءات / الاعتراض</th>
                </tr>
              </thead>
              <tbody>
                {filteredPenalties.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px' }}>لا توجد جزاءات أو مخالفات مطابقة للفلاتر المحددة.</td></tr>
                ) : (
                  filteredPenalties.map((p) => {
                    const isApproved = p.status === 'approved' || p.adminApproved;
                    const isRejected = p.status === 'rejected';
                    const isCancelled = p.status === 'cancelled';
                    const isPending = !isApproved && !isRejected && !isCancelled;

                    return (
                      <tr key={p.id}>
                        <td>
                          📅 {p.date || (p.createdAt ? p.createdAt.slice(0, 10) : '—')}
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', color: 'var(--text)' }}>{p.employeeName}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>كود: {p.employeeCode} • {p.branchName}</div>
                        </td>
                        <td>
                          <span className="badge badge-danger">⚠️ {p.ruleTitle}</span>
                          {p.category && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{p.category}</div>}
                        </td>
                        <td style={{ fontWeight: '900', color: '#b91c1c' }}>
                          {p.impactType === 'deduction_days' && p.impactVal ? (
                            `خصم ${p.impactVal} يوم (${p.amount ? `${p.amount} ج.م` : ''})`
                          ) : p.amount > 0 ? (
                            `خصم ${p.amount} ج.م`
                          ) : (
                            'إنذار / بدون خصم'
                          )}
                        </td>
                        <td style={{ maxWidth: '220px', whiteSpace: 'normal', lineHeight: '1.5' }}>
                          {p.reason || p.details || '—'}
                        </td>
                        <td>
                          {isCancelled ? (
                            <span className="badge badge-secondary" style={{ background: '#f1f5f9', color: '#64748b' }}>⚪ ملغي (معفى)</span>
                          ) : isApproved ? (
                            <span className="badge badge-success">🟢 معتمد ومخصوم</span>
                          ) : isRejected ? (
                            <span className="badge badge-danger">🔴 مرفوض من الإدارة</span>
                          ) : (
                            <span className="badge badge-warning">⏳ بانتظار موافقة الإدارة</span>
                          )}
                        </td>
                        <td>
                          {/* Admin Actions */}
                          {isAdmin ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {isPending && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  <button
                                    className="btn btn-start"
                                    style={{ padding: '4px 10px', fontSize: '11.5px', background: '#dc2626' }}
                                    onClick={() => handleAdminApprovePenalty(p.id)}
                                    title="تطبيق الخصم فوراً"
                                  >
                                    ⚖️ تطبيق الخصم
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    style={{ padding: '4px 10px', fontSize: '11.5px', border: '1px solid #cbd5e1' }}
                                    onClick={() => handleAdminRejectPenalty(p.id)}
                                    title="رفض وتجاهل الجزاء"
                                  >
                                    ❌ رفض
                                  </button>
                                </div>
                              )}

                              {p.objection && (
                                <div style={{ background: '#fef3c7', padding: '6px 8px', borderRadius: '6px', border: '1px solid #fde68a', fontSize: '11.5px' }}>
                                  <div style={{ color: '#92400e', fontWeight: 'bold' }}>✋ اعتراض الموظف: "{p.objection.reason}"</div>
                                  {p.objection.status === 'pending_admin' && (
                                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                      <button className="btn btn-start" style={{ background: '#16a34a', padding: '2px 8px', fontSize: '11px' }} onClick={() => handleAdminApproveObjection(p.id)}>
                                        ✓ قبول وإلغاء الخصم
                                      </button>
                                      <button className="btn btn-start" style={{ background: '#dc2626', padding: '2px 8px', fontSize: '11px' }} onClick={() => { setAdminRejectReplyReq(p); setAdminRejectReplyText(''); }}>
                                        ✕ رفض الاعتراض
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Employee / Branch Manager View */
                            userRole === 'employee' ? (
                              p.objection ? (
                                <div style={{ fontSize: '11.5px', color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: '6px' }}>
                                  {p.objection.status === 'pending_admin' ? '⏳ اعتراضك قيد مراجعة الإدارة' : p.objection.status === 'approved' ? '✅ تم قبول اعتراضك وإلغاء الجزاء' : '❌ تم رفض الاعتراض'}
                                </div>
                              ) : !isCancelled ? (
                                <button
                                  className="btn btn-outline"
                                  style={{ color: '#dc2626', borderColor: '#dc2626', fontSize: '11.5px', padding: '4px 8px' }}
                                  onClick={() => { setObjectionTargetReq(p); setObjectionReason(''); }}
                                >
                                  ✋ تقديم اعتراض
                                </button>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                              )
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{isApproved ? 'معتمد' : isRejected ? 'مرفوض' : 'معلق'}</span>
                            )
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
      )}

      {/* Modal: Record Violation */}
      {showRecordModal && (
        <div className="modal-backdrop" onClick={() => setShowRecordModal(false)}>
          <div className="modal-card" style={{ maxWidth: '750px', width: '96%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Cairo', margin: '0 0 16px', color: 'var(--danger)' }}>
              {isAdmin ? '⚖️ توثيق وتطبيق جزاء لائحي مباشر على الموظف' : '⚠️ توثيق مخالفة لائحية جديدة وإرسال طلب الخصم'}
            </h3>

            <form onSubmit={handleSubmitViolation}>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label>اختر الموظف المخالف:</label>
                <select
                  value={targetEmpId}
                  onChange={(e) => setTargetEmpId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- اختر الموظف --</option>
                  {(state.employees || []).map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.code})</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label>اختر المخالفة اللائحية:</label>
                <select
                  value={selectedRuleId}
                  onChange={(e) => setSelectedRuleId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- اختر المخالفة من اللائحة --</option>
                  {bylawsRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.title} ({getImpactDesc(rule)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ marginBottom: '20px' }}>
                <label>تفاصيل وسبب الخصم اللائحي:</label>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="ملاحظات وتفاصيل إضافية حول المخالفة وتاريخ حدوثها..."
                  rows={3}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowRecordModal(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start" style={{ background: '#dc2626', fontWeight: 'bold' }}>
                  {isAdmin ? '⚖️ تطبيق الجزاء فوراً' : '📤 إرسال طلب الجزاء للإدارة العليا'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Rule */}
      {showAddRuleModal && (
        <div className="modal-backdrop" onClick={() => setShowAddRuleModal(false)}>
          <div className="modal-card" style={{ maxWidth: '750px', width: '96%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Cairo', margin: '0 0 16px', color: 'var(--primary-dark)' }}>
              ➕ إضافة بند جديد لجدول المخالفات والجزاءات
            </h3>

            <div className="field" style={{ marginBottom: '14px' }}>
              <label>عنوان المخالفة اللائحية:</label>
              <input type="text" value={newRuleTitle} onChange={(e) => setNewRuleTitle(e.target.value)} placeholder="مثال: التأخير عن تسليم الخزينة..." required />
            </div>

            <div className="field" style={{ marginBottom: '14px' }}>
              <label>التصنيف:</label>
              <select value={newRuleCategory} onChange={(e) => setNewRuleCategory(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <option value="حضور وانصراف">حضور وانصراف</option>
                <option value="سلوك وانضباط">سلوك وانضباط</option>
                <option value="نظافة وجودة">نظافة وجودة</option>
                <option value="ماليات وخزينة">ماليات وخزينة</option>
              </select>
            </div>

            <div className="field" style={{ marginBottom: '14px' }}>
              <label>نوع التأثير على الأجور:</label>
              <select value={newRuleImpactType} onChange={(e) => setNewRuleImpactType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <option value="deduction_days">خصم عدد أيام من الراتب</option>
                <option value="fixed_amount">خصم مبلغ مالي ثابت (ج.م)</option>
                <option value="warning">إنذار كتابي رسمي</option>
              </select>
            </div>

            {newRuleImpactType !== 'warning' && (
              <div className="field" style={{ marginBottom: '20px' }}>
                <label>مقدار الخصم (عدد الأيام أو المبلغ):</label>
                <input type="number" step="0.25" value={newRuleImpactVal} onChange={(e) => setNewRuleImpactVal(e.target.value)} required />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddRuleModal(false)}>إلغاء</button>
              <button type="button" className="btn btn-start" onClick={handleAddRule}>💾 حفظ البند</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Employee Submit Objection */}
      {objectionTargetReq && (
        <div className="modal-backdrop" onClick={() => setObjectionTargetReq(null)}>
          <div className="modal-card" style={{ maxWidth: '750px', width: '96%', padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, color: '#dc2626' }}>
                ✋ تقديم اعتراض للإدارة العليا على الجزاء اللائحي
              </h3>
              <button className="btn btn-ghost" onClick={() => setObjectionTargetReq(null)}>✕ إغلاق</button>
            </div>

            <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '13.5px', lineHeight: '1.7' }}>
              <div><strong>بند المخالفة:</strong> {objectionTargetReq.ruleTitle || 'جزاء لائحي'}</div>
              <div><strong>البيان والسبب:</strong> {objectionTargetReq.reason || objectionTargetReq.details}</div>
              <div><strong>تاريخ المخالفة:</strong> {new Date(objectionTargetReq.createdAt).toLocaleDateString('ar-EG')}</div>
            </div>

            <form onSubmit={handleSubmitObjection}>
              <div className="field" style={{ marginBottom: '20px' }}>
                <label style={{ fontWeight: '700', marginBottom: '8px', display: 'block' }}>
                  أسباب ومبررات الاعتراض على هذا الجزاء بالتفصيل:
                </label>
                <textarea
                  value={objectionReason}
                  onChange={(e) => setObjectionReason(e.target.value)}
                  placeholder="يرجى كتابة أسباب الاعتراض والمبررات أو الظروف التي حالت دون الالتزام..."
                  rows={4}
                  required
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13.5px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setObjectionTargetReq(null)}>إلغاء</button>
                <button type="submit" className="btn btn-start" style={{ background: '#dc2626' }}>
                  📤 إرسال الاعتراض للإدارة العليا
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Admin Reject Objection with Note */}
      {adminRejectReplyReq && (
        <div className="modal-backdrop" onClick={() => setAdminRejectReplyReq(null)}>
          <div className="modal-card" style={{ maxWidth: '650px', width: '96%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Cairo', margin: '0 0 16px', color: '#dc2626' }}>
              ❌ رفض الاعتراض وتثبيت الجزاء
            </h3>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
              <strong>اعتراض الموظف:</strong> "{adminRejectReplyReq.objection?.reason}"
            </div>

            <div className="field" style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: '700', marginBottom: '8px', display: 'block' }}>سبب رفض الاعتراض وملاحظات الإدارة العليا:</label>
              <textarea
                value={adminRejectReplyText}
                onChange={(e) => setAdminRejectReplyText(e.target.value)}
                placeholder="مثال: تمت دراسة المبررات ورؤي عدم كفايتها وتثبيت الجزاء المالي وفق لائحة العمل..."
                rows={3}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setAdminRejectReplyReq(null)}>إلغاء</button>
              <button
                type="button"
                className="btn btn-start"
                style={{ background: '#dc2626' }}
                onClick={() => handleAdminRejectObjection(adminRejectReplyReq.id, adminRejectReplyText)}
              >
                تأكيد الرفض وتثبيت الجزاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
