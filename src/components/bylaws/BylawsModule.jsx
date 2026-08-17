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

    const emp = (state.employees || []).find(e => e.id === targetEmpId);
    const rule = bylawsRules.find(r => r.id === selectedRuleId);
    if (!emp || !rule) return;

    // Construct Penalty Request for Top Management Approval
    const newReq = {
      id: 'pen_' + Date.now(),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: emp.branchId,
      type: 'penalty',
      ruleId: rule.id,
      ruleTitle: rule.title,
      impactType: rule.impactType,
      impactVal: rule.impactVal,
      reason: customReason || rule.title,
      details: `مخالفة لائحية: ${rule.title} | التأثير: ${getImpactDesc(rule)}`,
      createdAt: new Date().toISOString(),
      targetApproval: 'admin_only',
      branchApproved: true,
      status: 'pending'
    };

    const updatedRequests = [newReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setShowRecordModal(false);
    setTargetEmpId('');
    setCustomReason('');
    showToast?.('✅ تم تسجيل المخالفة وإرسال طلب الجزاء فوراً للإدارة العليا للاعتماد والخصم');
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
              ⚠️ توثيق مخالفة لائحية جديدة
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
                  <th>حالة الاعتماد وتطبيق الخصم</th>
                </tr>
              </thead>
              <tbody>
                {appliedPenalties.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد مخالفات مسجلة حالياً.</td></tr>
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
                        {req.status === 'approved' ? (
                          <span className="badge badge-success">🟢 معتمد وتم تطبيق الخصم بالراتب</span>
                        ) : req.status === 'rejected' ? (
                          <span className="badge badge-danger">🔴 مرفوض من الإدارة العليا</span>
                        ) : (
                          <span className="badge badge-warning">⏳ بانتظار موافقة الإدارة العليا</span>
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
              ⚠️ توثيق مخالفة لائحية جديدة وإرسال طلب الخصم
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
                <button type="submit" className="btn btn-start" style={{ background: '#dc2626' }}>
                  📤 إرسال طلب الجزاء للإدارة العليا
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
    </div>
  );
}
