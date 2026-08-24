import React, { useState } from 'react';
import { shouldShowRequestToBranch } from '../../utils/formatters';

export default function ApprovalCenterModule({
  state,
  currentRole, // 'admin' | 'branch'
  currentBranchId,
  onApproveRequest,
  onRejectRequest,
  onSaveApprovalRules,
  onAddManualPunch,
  onAddDirectAdjustment
}) {
  const [activeSubTab, setActiveSubTab] = useState('requests'); // 'requests' | 'rules' | 'quick-actions'

  // Quick Action Modal States
  const [manualPunchEmpId, setManualPunchEmpId] = useState('');
  const [manualPunchType, setManualPunchType] = useState('in');
  const [manualPunchTime, setManualPunchTime] = useState('');
  const [manualPunchDate, setManualPunchDate] = useState(new Date().toISOString().slice(0, 10));

  const [directAdjEmpId, setDirectAdjEmpId] = useState('');
  const [directAdjType, setDirectAdjType] = useState('bonus'); // 'bonus' | 'penalty'
  const [directAdjAmount, setDirectAdjAmount] = useState('');
  const [directAdjNotes, setDirectAdjNotes] = useState('');

  // Rules Editor State
  const [rules, setRules] = useState(state.approvalRules || [
    {
      id: 'rule_general',
      name: 'طلبات المكافآت والجزاءات وتعديل البصمات والأذون وتأخير/خروج وإجازات <= 3 أيام والإضافي وتبديل الشفتات',
      requiresBranchManager: true,
      requiresSuperAdmin: true,
      autoExecuteOnBoth: true
    },
    {
      id: 'rule_long_leave',
      name: 'طلبات الإجازة أكثر من ثلاث أيام في الشهر (سنوية أو بدون أجر)',
      requiresBranchManager: false,
      requiresSuperAdmin: true,
      autoExecuteOnBoth: false
    },
    {
      id: 'rule_loans',
      name: 'طلبات السلف الشهرية والتعليمات والآجل',
      requiresBranchManager: false,
      requiresSuperAdmin: true,
      autoExecuteOnBoth: false
    }
  ]);

  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleReqBranch, setNewRuleReqBranch] = useState(true);
  const [newRuleReqAdmin, setNewRuleReqAdmin] = useState(true);

  const employees = state.employees || [];
  const branches = state.branches || [];
  const deletedIdsSet = React.useMemo(() => {
    return new Set((state._deletedIds || []).map(String));
  }, [state._deletedIds]);

  const requests = React.useMemo(() => {
    const list = [...(state.requests || [])];
    const seen = new Set(list.map((r) => String(r.id)));
    (state.leaveRequests || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: r.type || 'leave' }); seen.add(String(r.id)); } });
    (state.shiftSwaps || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: 'swap' }); seen.add(String(r.id)); } });
    (state.loans || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: r.type || 'loan' }); seen.add(String(r.id)); } });
    (state.resignationRequests || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: 'resignation' }); seen.add(String(r.id)); } });
    
    return list.filter((r) => {
      if (!r || !r.id) return false;
      const idStr = String(r.id);
      const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
      if (deletedIdsSet.has(idStr) || (rawId && (deletedIdsSet.has(rawId) || deletedIdsSet.has(`req_${rawId}`)))) {
        return false;
      }
      return true;
    });
  }, [state.requests, state.leaveRequests, state.shiftSwaps, state.loans, state.resignationRequests, deletedIdsSet]);

  // Filter requests based on role and double approval rules
  const filteredRequests = requests.filter(req => {
    if (currentRole === 'branch') {
      if (!shouldShowRequestToBranch(req, state)) return false;
      if (currentBranchId) {
        const cIdStr = String(currentBranchId);
        if (req.branchId && String(req.branchId) === cIdStr) return true;
        const emp = employees.find(e => String(e.id) === String(req.employeeId) || (req.employeeCode && String(e.code) === String(req.employeeCode)));
        if (emp) {
          if (emp.branchId && String(emp.branchId) === cIdStr) return true;
          if (emp.branchesDetails && emp.branchesDetails.some(bd => String(bd.branchId) === cIdStr)) return true;
        }
        return false;
      }
    }
    return true;
  });

  const handleAddRule = () => {
    if (!newRuleName.trim()) return;
    const newRule = {
      id: `rule_${Date.now()}`,
      name: newRuleName.trim(),
      requiresBranchManager: newRuleReqBranch,
      requiresSuperAdmin: newRuleReqAdmin,
      autoExecuteOnBoth: newRuleReqBranch && newRuleReqAdmin
    };
    const updated = [...rules, newRule];
    setRules(updated);
    onSaveApprovalRules(updated);
    setNewRuleName('');
  };

  const handleManualPunchSubmit = (e) => {
    e.preventDefault();
    if (!manualPunchEmpId || !manualPunchTime) {
      alert('يرجى تحديد الموظف والوقت');
      return;
    }
    onAddManualPunch({
      employeeId: manualPunchEmpId,
      type: manualPunchType,
      date: manualPunchDate,
      time: manualPunchTime
    });
    alert('✅ تم تسجيل البصمة اليدوية للموظف بنجاح!');
    setManualPunchTime('');
  };

  const handleDirectAdjSubmit = (e) => {
    e.preventDefault();
    if (!directAdjEmpId || !directAdjAmount) {
      alert('يرجى تحديد الموظف والمبلغ');
      return;
    }
    onAddDirectAdjustment({
      employeeId: directAdjEmpId,
      type: directAdjType,
      amount: parseFloat(directAdjAmount) || 0,
      notes: directAdjNotes
    });
    alert('✅ تم إضافة المعاملة المالية وإدراجها مباشرة في نظام الرواتب!');
    setDirectAdjAmount('');
    setDirectAdjNotes('');
  };

  return (
    <div className="bylaws-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            🔐 مركز الاعتمادات وقواعد الموافقة على الطلبات
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            إدارة تسلسل الموافقات المزدوجة بين مدير الفرع والإدارة العليا والاعتماد المباشر في نظام الرواتب
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn ${activeSubTab === 'requests' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveSubTab('requests')}
          >
            📋 الطلبات بانتظار الاعتماد ({filteredRequests.filter(r => r.status === 'pending').length})
          </button>
          <button
            type="button"
            className={`btn ${activeSubTab === 'rules' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveSubTab('rules')}
          >
            ⚙️ قواعد الموافقة
          </button>
          <button
            type="button"
            className={`btn ${activeSubTab === 'quick-actions' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveSubTab('quick-actions')}
          >
            ⚡ إجراءات سريعة (بصمة / حافز يدوي)
          </button>
        </div>
      </div>

      {/* SUBTAB 1: Pending Requests Queue */}
      {activeSubTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
              🎉 لا توجد طلبات معلقة بانتظار الاعتماد حالياً.
            </div>
          ) : (
            filteredRequests.map((req) => {
              const emp = employees.find((e) => e.id === req.employeeId);
              const branch = branches.find((b) => b.id === emp?.branchId);

              const isBranchApproved = req.branchApproved;
              const isAdminApproved = req.adminApproved;

              return (
                <div key={req.id} className="approval-card-item">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="badge badge-primary" style={{ fontSize: '13px' }}>
                        {req.typeLabel || req.type}
                      </span>
                      <strong style={{ fontSize: '16px', color: 'var(--text)' }}>
                        {emp ? emp.name : 'موظف غير محدد'} ({emp?.code})
                      </strong>
                      {branch && (
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          📍 {branch.name}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '4px' }}>
                      📝 البيان: <strong>{req.details || req.reason || 'طلب إداري'}</strong>
                      {req.amount && ` | المبلغ/الساعات: ${req.amount}`}
                      {req.date && ` | التاريخ: ${req.date}`}
                    </div>

                    {/* Dual Approval Status Indicators */}
                    {(() => {
                      const isBranchNotReq = req.targetApproval === 'admin_only' || req.targetApproval === 'admin' || ['loan', 'advance', 'credit_medicine', 'eval_edit_request', 'complaint'].includes(req.type) || req.branchNotRequired || req.isDirectToAdmin;
                      return (
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                          <div className={`approval-status-badge ${isBranchNotReq ? 'na' : isBranchApproved ? 'approved' : 'pending'}`}>
                            {isBranchNotReq
                              ? '🔒 مدير الفرع: غير موجهة إليه'
                              : isBranchApproved
                                ? '✅ مدير الفرع: معتمد'
                                : '⏳ مدير الفرع: بانتظار الموافقة'}
                          </div>
                          <div className={`approval-status-badge ${isAdminApproved ? 'approved' : 'pending'}`}>
                            {isAdminApproved ? '✅ الإدارة العليا: معتمدة' : '⏳ الإدارة العليا: بانتظار الموافقة'}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions based on role */}
                  {req.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {((currentRole === 'branch' && !isBranchApproved) ||
                        (currentRole === 'admin' && !isAdminApproved)) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ fontSize: '13px' }}
                            onClick={() => onApproveRequest(req.id, currentRole)}
                          >
                            ✅ موافقة واعتماد
                          </button>
                          <button
                            type="button"
                            className="del-btn"
                            style={{ fontSize: '13px' }}
                            onClick={() => onRejectRequest(req.id, currentRole)}
                          >
                            ❌ رفض الطلب
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 2: Rules Configuration */}
      {activeSubTab === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--primary-tint)', padding: '16px', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
              ➕ إضافة قاعدة موافقة جديدة وتحديد تسلسل الموافقة
            </h4>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="اسم القاعدة أو نوع الطلب (مثال: طلبات الأدوية الآجل)"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                style={{ flex: 1, minWidth: '240px' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={newRuleReqBranch}
                  onChange={(e) => setNewRuleReqBranch(e.target.checked)}
                />
                يتطلب موافقة مدير الفرع
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={newRuleReqAdmin}
                  onChange={(e) => setNewRuleReqAdmin(e.target.checked)}
                />
                يتطلب موافقة الإدارة العليا
              </label>
              <button type="button" className="btn btn-start" onClick={handleAddRule}>
                حفظ القاعدة
              </button>
            </div>
          </div>

          <table className="bylaws-table">
            <thead>
              <tr>
                <th>نوع الطلب / القاعدة</th>
                <th>موافقة مدير الفرع</th>
                <th>موافقة الإدارة العليا</th>
                <th>طبيعة التنفيذ</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ fontWeight: 'bold' }}>{rule.name}</td>
                  <td>{rule.requiresBranchManager ? '✅ مطلوبة' : '➖ غير مطلوبة'}</td>
                  <td>{rule.requiresSuperAdmin ? '✅ مطلوبة' : '➖ غير مطلوبة'}</td>
                  <td>
                    {rule.requiresBranchManager && rule.requiresSuperAdmin
                      ? 'موافقة مزدوجة (لا ينفذ إلا بموافقة الاثنين معا)'
                      : 'موافقة الإدارة العليا فقط'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SUBTAB 3: Quick Direct Actions */}
      {activeSubTab === 'quick-actions' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Quick Manual Fingerprint */}
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'Cairo', color: 'var(--primary-dark)', margin: '0 0 14px 0' }}>
              ⏱️ إضافة بصمة يدوية لأي موظف
            </h3>
            <form onSubmit={handleManualPunchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="field">
                <label>اختر الموظف</label>
                <select value={manualPunchEmpId} onChange={(e) => setManualPunchEmpId(e.target.value)} required>
                  <option value="">-- اختر الموظف --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (كود: {e.code})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="field">
                  <label>نوع البصمة</label>
                  <select value={manualPunchType} onChange={(e) => setManualPunchType(e.target.value)}>
                    <option value="in">🟢 بصمة دخول</option>
                    <option value="out">🔴 بصمة خروج</option>
                  </select>
                </div>

                <div className="field">
                  <label>التاريخ</label>
                  <input type="date" value={manualPunchDate} onChange={(e) => setManualPunchDate(e.target.value)} required />
                </div>
              </div>

              <div className="field">
                <label>وقت البصمة</label>
                <input type="time" value={manualPunchTime} onChange={(e) => setManualPunchTime(e.target.value)} required />
              </div>

              <button type="submit" className="btn btn-start" style={{ marginTop: '8px' }}>
                ➕ تسجيل البصمة اليدوية
              </button>
            </form>
          </div>

          {/* Quick Bonus / Penalty Direct Addition */}
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'Cairo', color: 'var(--primary-dark)', margin: '0 0 14px 0' }}>
              💰 إضافة مكافأة أو جزاء مباشر
            </h3>
            <form onSubmit={handleDirectAdjSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="field">
                <label>اختر الموظف</label>
                <select value={directAdjEmpId} onChange={(e) => setDirectAdjEmpId(e.target.value)} required>
                  <option value="">-- اختر الموظف --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (كود: {e.code})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="field">
                  <label>نوع المعاملة</label>
                  <select value={directAdjType} onChange={(e) => setDirectAdjType(e.target.value)}>
                    <option value="bonus">➕ حافز / مكافأة (إضافة للأجر)</option>
                    <option value="penalty">➖ جزاء / خصم (خصم من الأجر)</option>
                  </select>
                </div>

                <div className="field">
                  <label>المبلغ (ج.م)</label>
                  <input type="number" placeholder="100" value={directAdjAmount} onChange={(e) => setDirectAdjAmount(e.target.value)} required />
                </div>
              </div>

              <div className="field">
                <label>السبب / الملاحظات</label>
                <input type="text" placeholder="سبب المكافأة أو الخصم" value={directAdjNotes} onChange={(e) => setDirectAdjNotes(e.target.value)} />
              </div>

              <button type="submit" className="btn btn-start" style={{ marginTop: '8px' }}>
                💾 إضافة وتنفيذ على الأجور
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
