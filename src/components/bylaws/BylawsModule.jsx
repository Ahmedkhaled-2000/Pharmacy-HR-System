import React, { useState, useMemo, useEffect } from 'react';
import LatePenaltyPolicyModule from './LatePenaltyPolicyModule';
import DisciplinaryPenaltiesTab from './DisciplinaryPenaltiesTab';

export default function BylawsModule({
  state,
  setState,
  saveState,
  showToast,
  userRole = 'admin',
  currentEmpId = null,
  currentBranchId = null,
  filterFn = null,
  monthPicker = null,
  filterMode = 'all',
  customFrom = '',
  customTo = ''
}) {
  const [activeTab, setActiveTab] = useState('disciplinary_penalties'); // 'disciplinary_penalties' | 'text' | 'records' | 'late_penalties'
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'branch';
  const isAdmin = userRole === 'admin';

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

  const handleResetDefaultBylawsText = async () => {
    const defaultText = `
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
    `.trim();

    if (!window.confirm('هل ترغب في استعادة النص الافتراضي للائحة العمل الرسمية؟')) return;

    setBylawsText(defaultText);
    const updatedState = { ...state, bylawsText: defaultText };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🔄 تم استعادة النص الافتراضي للائحة العمل');
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
      if (a.id === reqId || a.id === `adj_${reqId}` || a.id === `adj_penalty_${reqId}` || a.requestId === reqId || a.id === `adj_disc_${reqId}`) return false;
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

  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsBranch, setRecordsBranch] = useState(currentBranchId ? String(currentBranchId) : '');
  const [recordsStatus, setRecordsStatus] = useState('all');
  const [recordsPeriodMode, setRecordsPeriodMode] = useState('all');
  const [recordsCustomFrom, setRecordsCustomFrom] = useState(customFrom || '');
  const [recordsCustomTo, setRecordsCustomTo] = useState(customTo || '');

  const employees = state.employees || [];
  const branches = state.branches || [];

  const allPenalties = useMemo(() => {
    const list = [];
    const seenReqIds = new Set();

    (state.requests || []).forEach((r) => {
      if (
        r.type === 'penalty' ||
        r.type === 'early_exit' ||
        r.subType === 'lateness' ||
        (r.type === 'adjustment' && r.subType === 'penalty') ||
        r.type === 'disciplinary_penalty' ||
        r.subType === 'disciplinary_penalty' ||
        r.ruleTitle
      ) {
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
          ruleTitle: r.ruleTitle || r.actionTitle || (r.subType === 'lateness' ? `تأخير عن الشيفت (${r.latenessMinutes || ''} د)` : r.reason) || 'مخالفة لائحية',
          category: r.categoryName || r.category || 'انضباط ولائحة',
          impactType: r.impactType || (r.impactVal ? 'deduction_days' : 'fixed_amount'),
          impactVal: r.impactVal || r.deductionDays || 0,
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

    (state.adjustments || []).forEach((a) => {
      const isLinkedToReq = Array.from(seenReqIds).some(
        (reqId) => a.id === `adj_pen_${reqId}` || a.id === `adj_disc_${reqId}` || a.id === reqId || a.id === `adj_${reqId}` || a.requestId === reqId
      );
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

  const filteredPenalties = useMemo(() => {
    const targetBranchStr = currentBranchId ? String(currentBranchId) : null;

    return allPenalties.filter((p) => {
      if (currentEmpId && String(p.employeeId) !== String(currentEmpId)) return false;

      if (targetBranchStr) {
        const emp = employees.find((e) => String(e.id) === String(p.employeeId));
        const isEmpInBranch = emp && (
          String(emp.branchId) === targetBranchStr ||
          (emp.branchesDetails && emp.branchesDetails.some((bd) => String(bd.branchId) === targetBranchStr))
        );
        const isDirectBranch = p.branchId && String(p.branchId) === targetBranchStr;
        if (!isEmpInBranch && !isDirectBranch) return false;
      } else if (recordsBranch && String(p.branchId) !== String(recordsBranch)) {
        return false;
      }

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

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📜 لائحة العمل والجزاءات التأديبية
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            نظام عداد تكرار المخالفات المستقل، سياسات العمل الرسمية، وسجل القرارات والخصومات
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'disciplinary_penalties' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('disciplinary_penalties')}
            style={{
              borderColor: '#dc2626',
              color: activeTab === 'disciplinary_penalties' ? '#fff' : '#dc2626',
              fontWeight: 700,
              background: activeTab === 'disciplinary_penalties' ? '#dc2626' : 'transparent'
            }}
          >
            ⚖️ لائحة الجزاءات التأديبية وعداد التكرار
          </button>
          <button
            className={`btn ${activeTab === 'text' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('text')}
          >
            📖 نصوص اللائحة الرسمية
          </button>
          <button
            className={`btn ${activeTab === 'records' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('records')}
          >
            📋 سجل الجزاءات والخصومات
          </button>
          <button
            className={`btn ${activeTab === 'late_penalties' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('late_penalties')}
            style={{
              borderColor: 'var(--primary)',
              color: activeTab === 'late_penalties' ? '#fff' : 'var(--primary-dark)',
              fontWeight: 700
            }}
          >
            ⏱️ جزاءات التأخير
          </button>
        </div>
      </div>

      {/* Tab 1: Disciplinary Penalties & Violation Counter Module */}
      {activeTab === 'disciplinary_penalties' && (
        <DisciplinaryPenaltiesTab
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          userRole={userRole}
          currentEmpId={currentEmpId}
          currentBranchId={currentBranchId}
          filterFn={filterFn}
          monthPicker={monthPicker}
          customFrom={customFrom}
          customTo={customTo}
        />
      )}

      {/* Tab 2: Bylaws Official Text */}
      {activeTab === 'text' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)' }}>
              📜 نصوص وسياسات لائحة العمل الرسمية للصيدلية
            </h3>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleResetDefaultBylawsText}
                style={{ fontSize: '12.5px', color: 'var(--muted)' }}
                title="إعادة ضبط النص إلى المحتوى الافتراضي المعتمد"
              >
                🔄 استعادة النص الافتراضي
              </button>
            )}
          </div>

          {isAdmin ? (
            <div>
              <textarea
                value={bylawsText}
                onChange={(e) => setBylawsText(e.target.value)}
                rows={14}
                style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.8', background: 'var(--surface-muted)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '10px' }}>
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
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="date"
                  value={recordsCustomFrom}
                  onChange={(e) => setRecordsCustomFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px' }}
                />
                <span>إلى</span>
                <input
                  type="date"
                  value={recordsCustomTo}
                  onChange={(e) => setRecordsCustomTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px' }}
                />
              </div>
            )}
          </div>

          {/* Records Table */}
          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الموظف</th>
                  <th>الفرع</th>
                  <th>بند ونوع الجزاء</th>
                  <th>المقدار المالي</th>
                  <th>البيان والتفاصيل</th>
                  <th>الحالة</th>
                  <th>الاعتراضات والإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredPenalties.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                      لا توجد جزاءات أو خصومات مسجلة في هذا النطاق.
                    </td>
                  </tr>
                ) : (
                  filteredPenalties.map((p) => {
                    const isApproved = p.status === 'approved' || p.adminApproved;
                    const isRejected = p.status === 'rejected';
                    const isCancelled = p.status === 'cancelled';
                    const hasObjection = Boolean(p.objection);
                    const objStatus = p.objection?.status;

                    return (
                      <tr key={p.id}>
                        <td>{p.date}</td>
                        <td>
                          <strong>{p.employeeName}</strong>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>
                            {p.employeeCode}
                          </span>
                        </td>
                        <td>{p.branchName}</td>
                        <td>
                          <span className="badge badge-primary">{p.category}</span>
                          <strong style={{ display: 'block', fontSize: '13px', marginTop: '2px' }}>{p.ruleTitle}</strong>
                        </td>
                        <td style={{ fontWeight: '800', color: p.amount > 0 ? '#dc2626' : 'var(--muted)' }}>
                          {p.amount > 0 ? `${p.amount} ج.م` : 'بدون خصم مالي'}
                        </td>
                        <td style={{ maxWidth: '240px', fontSize: '12.5px' }}>
                          <div>{p.reason}</div>
                          {p.details && p.details !== p.reason && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.details}</span>
                          )}
                        </td>
                        <td>
                          {isCancelled ? (
                            <span className="badge badge-danger">ملغي ومسترد</span>
                          ) : isRejected ? (
                            <span className="badge badge-danger">مرفوض</span>
                          ) : isApproved ? (
                            <span className="badge badge-success">معتمد ومخصوم</span>
                          ) : (
                            <span className="badge badge-warning">معلق بانتظار الإدارة</span>
                          )}
                        </td>
                        <td>
                          {isAdmin ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {hasObjection && objStatus === 'pending' && (
                                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 8px', borderRadius: '6px', fontSize: '11px' }}>
                                  <strong style={{ color: '#b45309', display: 'block' }}>اعتراض مقدم:</strong>
                                  <span style={{ display: 'block', margin: '2px 0' }}>"{p.objection.reason}"</span>
                                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                    <button
                                      className="btn btn-start"
                                      style={{ fontSize: '10.5px', padding: '2px 6px', background: '#16a34a' }}
                                      onClick={() => handleAdminApproveObjection(p.id)}
                                      title="قبول الاعتراض وإلغاء الجزاء"
                                    >
                                      قبول وإلغاء
                                    </button>
                                    <button
                                      className="btn btn-ghost"
                                      style={{ fontSize: '10.5px', padding: '2px 6px', color: '#dc2626' }}
                                      onClick={() => { setAdminRejectReplyReq(p); setAdminRejectReplyText(''); }}
                                      title="رفض الاعتراض وتثبيت الجزاء"
                                    >
                                      رفض
                                    </button>
                                  </div>
                                </div>
                              )}
                              {hasObjection && objStatus === 'approved' && (
                                <span className="badge badge-success" style={{ fontSize: '11px' }}>✅ تم قبول الاعتراض</span>
                              )}
                              {hasObjection && objStatus === 'rejected' && (
                                <span className="badge badge-danger" style={{ fontSize: '11px' }}>❌ تم رفض الاعتراض</span>
                              )}
                              {!hasObjection && (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                              )}
                            </div>
                          ) : (
                            userRole === 'employee' ? (
                              hasObjection ? (
                                <div>
                                  <span className={`badge ${objStatus === 'approved' ? 'badge-success' : objStatus === 'rejected' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                                    {objStatus === 'approved' ? 'تم قبول الاعتراض' : objStatus === 'rejected' ? 'تم رفض الاعتراض' : 'الاعتراض قيد المراجعة'}
                                  </span>
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

      {/* Tab 4: Late Penalties Module */}
      {activeTab === 'late_penalties' && (
        <LatePenaltyPolicyModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          userRole={userRole}
          currentEmpId={currentEmpId}
          currentBranchId={currentBranchId}
          filterFn={filterFn}
          monthPicker={monthPicker}
          customFrom={customFrom}
          customTo={customTo}
        />
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
