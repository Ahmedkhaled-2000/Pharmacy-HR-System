import React, { useState } from 'react';

export default function BylawsModule({
  state,
  setState,
  saveState,
  showToast,
  userRole = 'admin',
  currentEmpId = null
}) {
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'rules' | 'records'
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

  // State for Penalty Rules
  const [bylawsRules, setBylawsRules] = useState(
    state.bylawsRules || [
      { id: 'b1', title: 'التأخير عن موعد الشيفت من 15 إلى 30 دقيقة', impactType: 'deduction_days', impactVal: 0.25, category: 'حضور وانصراف' },
      { id: 'b2', title: 'التأخير عن موعد الشيفت أكثر من 30 دقيقة', impactType: 'deduction_days', impactVal: 0.5, category: 'حضور وانصراف' },
      { id: 'b3', title: 'الغياب عن الوردية بدون إذن مسبق', impactType: 'deduction_days', impactVal: 1.0, category: 'حضور وانصراف' },
      { id: 'b4', title: 'عدم الالتزام بالزي الرسمي للصيدلية', impactType: 'fixed_amount', impactVal: 50, category: 'سلوك وانضباط' },
      { id: 'b5', title: 'عدم الالتزام بنظافة وترتيب الصيدلية والرفوف', impactType: 'warning', impactVal: 0, category: 'نظافة وجودة' },
      { id: 'b6', title: 'خطأ أو عجز في تسليم الكاشير نهاية الوردية', impactType: 'fixed_amount', impactVal: 100, category: 'ماليات وخزينة' }
    ]
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
    const updated = [...bylawsRules, newRule];
    setBylawsRules(updated);
    setShowAddRuleModal(false);
    setNewRuleTitle('');

    const updatedState = { ...state, bylawsRules: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم إضافة بند جزاء جديد إلى لائحة العمل');
  };

  const handleDeleteRule = async (id) => {
    const updated = bylawsRules.filter(r => r.id !== id);
    setBylawsRules(updated);
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

  const getImpactDesc = (rule) => {
    if (rule.impactType === 'deduction_days') return `خصم ${rule.impactVal} يوم من الراتب`;
    if (rule.impactType === 'fixed_amount') return `خصم مبلغ ${rule.impactVal} ج.م`;
    if (rule.impactType === 'warning') return `إنذار كتابي رسمي`;
    return `تنبيه شفهي`;
  };

  const appliedPenalties = (state.requests || []).filter(r => r.type === 'penalty' && (!currentEmpId || r.employeeId === currentEmpId));

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
          <h3 style={{ fontFamily: 'Cairo', margin: '0 0 16px', color: 'var(--primary-dark)' }}>
            📋 سجل الجزاءات والمخالفات الموثقة
          </h3>

          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>تاريخ المخالفة</th>
                  <th>الموظف</th>
                  <th>نوع المخالفة اللائحية</th>
                  <th>سبب وتفاصيل الخصم</th>
                  <th>حالة الاعتماد</th>
                  <th>الاعتراض / الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {appliedPenalties.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد مخالفات مسجلة حالياً.</td></tr>
                ) : (
                  appliedPenalties.map((req) => (
                    <tr key={req.id}>
                      <td style={{ fontSize: '13px' }}>
                        📅 {new Date(req.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td style={{ fontWeight: '800' }}>{req.employeeName} ({req.employeeCode})</td>
                      <td><span className="badge badge-danger">⚠️ {req.ruleTitle || 'مخالفة لائحية'}</span></td>
                      <td style={{ fontSize: '13px' }}>{req.reason || req.details}</td>
                      <td>
                        {req.status === 'cancelled' ? (
                          <span className="badge badge-secondary" style={{ background: '#f1f5f9', color: '#64748b' }}>⚪ ملغي (تم قبول الاعتراض)</span>
                        ) : req.status === 'approved' ? (
                          <span className="badge badge-success">🟢 معتمد وتم تطبيق الخصم بالراتب</span>
                        ) : req.status === 'rejected' ? (
                          <span className="badge badge-danger">🔴 مرفوض من الإدارة العليا</span>
                        ) : (
                          <span className="badge badge-warning">⏳ بانتظار موافقة الإدارة العليا</span>
                        )}
                      </td>
                      <td>
                        {/* Employee View */}
                        {!isAdmin && userRole === 'employee' ? (
                          req.objection ? (
                            req.objection.status === 'pending' ? (
                              <div style={{ fontSize: '12px', color: '#b45309', background: '#fef3c7', padding: '6px 10px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                ⏳ <strong>اعتراضك قيد المراجعة:</strong> "{req.objection.reason}"
                              </div>
                            ) : req.objection.status === 'approved' ? (
                              <div style={{ fontSize: '12px', color: '#15803d', background: '#f0fdf4', padding: '6px 10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                ✅ <strong>تم قبول اعتراضك وإلغاء الخصم بنجاح</strong>
                              </div>
                            ) : (
                              <div style={{ fontSize: '12px', color: '#b91c1c', background: '#fef2f2', padding: '6px 10px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                ❌ <strong>تم رفض الاعتراض:</strong> {req.objection.adminReply || 'تم تثبيت الجزاء وفق اللائحة'}
                              </div>
                            )
                          ) : req.status !== 'cancelled' ? (
                            <button
                              className="btn btn-outline"
                              style={{ color: '#dc2626', borderColor: '#dc2626', fontSize: '12px', padding: '5px 12px', fontWeight: 'bold' }}
                              onClick={() => { setObjectionTargetReq(req); setObjectionReason(''); }}
                            >
                              ✋ تقديم اعتراض للإدارة العليا
                            </button>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                          )
                        ) : (
                          /* Admin / Branch Manager View */
                          req.objection ? (
                            req.objection.status === 'pending' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ fontSize: '12px', color: '#b45309', background: '#fef3c7', padding: '6px 10px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                  ⚠️ <strong>اعتراض الموظف:</strong> "{req.objection.reason}"
                                </div>
                                {isAdmin && (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      className="btn btn-start"
                                      style={{ background: '#16a34a', fontSize: '11.5px', padding: '4px 10px' }}
                                      onClick={() => handleAdminApproveObjection(req.id)}
                                    >
                                      ✅ قبول الاعتراض وإلغاء الخصم
                                    </button>
                                    <button
                                      className="btn btn-start"
                                      style={{ background: '#dc2626', fontSize: '11.5px', padding: '4px 10px' }}
                                      onClick={() => { setAdminRejectReplyReq(req); setAdminRejectReplyText(''); }}
                                    >
                                      ❌ رفض الاعتراض
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : req.objection.status === 'approved' ? (
                              <span className="badge badge-success">✅ تم قبول الاعتراض وإلغاء الجزاء</span>
                            ) : (
                              <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                                ❌ تم رفض الاعتراض ({req.objection.adminReply || 'مثبت'})
                              </div>
                            )
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>لا يوجد اعتراض</span>
                          )
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
