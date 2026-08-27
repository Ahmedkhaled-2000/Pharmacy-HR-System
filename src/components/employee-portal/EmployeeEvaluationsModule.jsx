import React, { useState, useMemo } from 'react';
import { getRealTodayStr } from '../../utils/timeEngine';

export default function EmployeeEvaluationsModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth: initialSelectedMonth,
  selectedBranchId
}) {
  const [activeTab, setActiveTab] = useState('evaluations'); // 'evaluations' | 'complaints'
  const [localMonth, setLocalMonth] = useState(initialSelectedMonth || new Date().toISOString().slice(0, 7));
  const [empCommentMap, setEmpCommentMap] = useState({});

  // Complaint Form State
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('رواتب واستحقاقات');
  const [complaintDetails, setComplaintDetails] = useState('');
  const [showComplaintForm, setShowComplaintForm] = useState(false);

  const empIdStr = String(emp?.id || '').trim();
  const empCodeStr = String(emp?.code || '').trim();

  // Month label calculation
  const monthLabelText = useMemo(() => {
    const [y, m] = (localMonth || '').split('-');
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const idx = parseInt(m, 10) - 1;
    return `${monthNames[idx] || m} ${y} (${localMonth})`;
  }, [localMonth]);

  const handlePrevMonth = () => {
    const [y, m] = localMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setLocalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = localMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setLocalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Filter employee evaluations by ID and selected month
  const employeeEvals = useMemo(() => {
    return (state?.evaluations || []).filter((e) => {
      const matchEmp = String(e.employeeId) === empIdStr || (empCodeStr && String(e.employeeId) === empCodeStr);
      if (!matchEmp) return false;
      if (localMonth) {
        const evMonth = e.month || (e.date ? e.date.slice(0, 7) : null);
        if (evMonth && evMonth !== localMonth) return false;
      }
      return true;
    }).sort((a, b) => {
      const getT = (e) => new Date(e.createdAt || e.date || 0).getTime();
      return getT(b) - getT(a);
    });
  }, [state?.evaluations, empIdStr, empCodeStr, localMonth]);

  const employeeComplaints = (state?.requests || []).filter(
    (r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) && r.type === 'complaint'
  ).sort((a, b) => {
    const getT = (r) => new Date(r.createdAt || r.timestamp || 0).getTime();
    return getT(b) - getT(a);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 1: Employee Responds to Evaluation (Approve or Reject with Comment)
  // ─────────────────────────────────────────────────────────────────────────
  const handleRespondEval = async (evalId, responseType) => {
    const comment = (empCommentMap[evalId] || '').trim();
    if (!comment && responseType === 'reject') {
      showToast('يرجى كتابة سبب عدم الموافقة أو التحفظ في مربع التعليق');
      return;
    }

    const targetEval = (state.evaluations || []).find(e => e.id === evalId);
    const evalMonth = targetEval?.month || localMonth;

    const updatedEvals = (state.evaluations || []).map((e) => {
      if (e.id === evalId) {
        return {
          ...e,
          stage: 'pending_admin',
          status: 'pending_admin',
          employeeStatus: responseType === 'approve' ? 'approved' : 'rejected',
          employeeComment: comment,
          respondedAt: new Date().toISOString()
        };
      }
      return e;
    });

    // Send Notification to Senior Management (Requirement 1)
    const adminNotif = {
      id: `notif_eval_resp_${Date.now()}`,
      type: 'eval_pending_admin',
      title: `📋 رد الموظف (${emp.name}) على تقييم شهر (${evalMonth})`,
      message: `قام الموظف ${emp.name} بالرد بـ (${responseType === 'approve' ? 'الموافقة ✅' : 'الاعتراض والتحفظ ⚠️'}) على تقييم شهر ${evalMonth} الصادر من مدير الفرع (${targetEval?.evaluatorName || 'مدير الفرع'}). ${comment ? `تعليق الموظف: "${comment}"` : ''} — يرجى مراجعة التقييم وإبداء تعليق واعتماد الإدارة العليا.`,
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin',
      linkTab: 'evaluations',
      evalId: evalId
    };

    const updatedNotifications = [adminNotif, ...(state.notifications || [])];
    const updatedState = { ...state, evaluations: updatedEvals, notifications: updatedNotifications };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setEmpCommentMap(prev => ({ ...prev, [evalId]: '' }));
    showToast(
      responseType === 'approve'
        ? 'تمت الموافقة على التقييم بنجاح وإحالته للإدارة العليا للاعتماد النهائي ✅'
        : 'تم تسجيل اعتراضك وملاحظاتك بنجاح وإحالتها للإدارة العليا للبت فيها 📝'
    );
  };

  // Submit Complaint / Note to High Management
  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    if (!complaintSubject.trim() || !complaintDetails.trim()) {
      showToast('يرجى تعبئة عنوان وتفاصيل الشكوى');
      return;
    }

    const newComplaint = {
      id: 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'complaint',
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: selectedBranchId || emp.branchId,
      category: complaintCategory,
      subject: complaintSubject.trim(),
      details: complaintDetails.trim(),
      targetApproval: 'admin_only',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const newNotif = {
      id: `notif_comp_${Date.now()}`,
      type: 'complaint',
      title: `📮 شكوى جديدة من الموظف: ${emp.name}`,
      message: `قدم الموظف ${emp.name} شكوى جديدة بعنوان "${complaintSubject.trim()}" في قسم ${complaintCategory}`,
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin'
    };

    const updatedRequests = [newComplaint, ...(state.requests || [])];
    const updatedNotifications = [newNotif, ...(state.notifications || [])];
    const updatedState = { ...state, requests: updatedRequests, notifications: updatedNotifications };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setShowComplaintForm(false);
    setComplaintSubject('');
    setComplaintDetails('');
    showToast('تم إرسال الشكوى / الملاحظة إلى الإدارة العليا بنجاح 📥');
  };

  return (
    <div className="card ep-tab-content fade-in">
      <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>⭐</span>
          <div>
            <h3 style={{ margin: 0 }}>التقييمات الشهرية للأداء والشكاوى</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              مراجعة تقييم مدير الفرع، إبداء الموافقة أو الاعتراض، والاطلاع على قرارات الإدارة العليا
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'evaluations' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('evaluations')}
          >
            📋 التقييمات الشهرية
          </button>
          <button
            className={`btn ${activeTab === 'complaints' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('complaints')}
          >
            📮 الشكاوى والمقترحات ({employeeComplaints.length})
          </button>
        </div>
      </div>

      {/* ── SubTab 1: Monthly Evaluations ── */}
      {activeTab === 'evaluations' && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Month Selector Bar (Requirement 4) */}
          <div style={{
            background: 'linear-gradient(135deg, #f0fdfa, #f8fafc)',
            border: '1.5px solid #ccfbf1',
            borderRadius: '14px',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f766e' }}>
                🗓️ استعراض تقييم شهر:
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handlePrevMonth}
                style={{ padding: '3px 8px', fontSize: '12px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '6px' }}
              >
                ◀
              </button>
              <input
                type="month"
                value={localMonth}
                onChange={(e) => setLocalMonth(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1.5px solid #0d9488',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  color: '#0f766e',
                  background: '#fff'
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleNextMonth}
                style={{ padding: '3px 8px', fontSize: '12px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '6px' }}
              >
                ▶
              </button>
            </div>

            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f766e', background: '#ccfbf1', padding: '4px 12px', borderRadius: '99px' }}>
              {monthLabelText}
            </span>
          </div>

          {employeeEvals.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '14px', border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📝</div>
              <h5 style={{ margin: '0 0 4px', color: 'var(--text)', fontSize: '15px' }}>لا يوجد تقييم مسجل لشهر ({monthLabelText})</h5>
              <p style={{ color: 'var(--muted)', margin: 0, fontSize: '13px' }}>
                سيظهر تقييمك هنا فور قيام مدير الفرع أو الإدارة برصده وإرساله لك للمراجعة والاعتماد
              </p>
            </div>
          ) : (
            employeeEvals.map((ev) => {
              const stage = ev.stage || (ev.status === 'approved' ? 'approved' : ev.employeeStatus === 'pending' ? 'pending_employee' : 'pending_admin');

              return (
                <div
                  key={ev.id}
                  style={{
                    background: '#ffffff',
                    border: stage === 'approved' ? '2px solid #86efac' : stage === 'pending_admin' ? '2px solid #93c5fd' : '2px solid #f59e0b',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>📅</span>
                        <h4 style={{ margin: 0, fontSize: '16.5px', fontWeight: '900', color: '#0f766e' }}>
                          تقييم أداء شهر: {ev.month || localMonth}
                        </h4>
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>
                        المقيِّم: <strong>{ev.evaluatorName || 'مدير الفرع'}</strong> ({ev.evaluatorRole || 'مدير الفرع'}) &nbsp;|&nbsp; تاريخ الرصد: {ev.date || ev.createdAt?.slice(0, 10)}
                      </div>
                    </div>

                    {/* Status Badge & Score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        padding: '5px 14px',
                        borderRadius: '99px',
                        fontSize: '12.5px',
                        fontWeight: 'bold',
                        background: stage === 'approved' ? '#dcfce7' : stage === 'pending_admin' ? '#dbeafe' : '#fef3c7',
                        color: stage === 'approved' ? '#166534' : stage === 'pending_admin' ? '#1e40af' : '#92400e',
                        border: `1px solid ${stage === 'approved' ? '#86efac' : stage === 'pending_admin' ? '#93c5fd' : '#fde68a'}`
                      }}>
                        {stage === 'approved' ? '✅ معتمد نهائياً من الإدارة العليا' : stage === 'pending_admin' ? '📋 تم إرسال ردك وبانتظار اعتماد الإدارة العليا' : '⏳ بانتظار مراجعتك وردك'}
                      </span>

                      <div style={{ textAlign: 'center', background: '#f0fdfa', border: '1.5px solid #99f6e4', padding: '4px 14px', borderRadius: '10px' }}>
                        <div style={{ fontSize: '19px', fontWeight: '900', color: '#0d9488' }}>
                          {ev.percentage || ev.score}%
                        </div>
                        <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: 'bold' }}>
                          {ev.rating || 'ممتاز'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Criteria Breakdown Table */}
                  {ev.items && ev.items.length > 0 && (
                    <div className="table-responsive" style={{ margin: '4px 0' }}>
                      <table className="bylaws-table" style={{ fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', color: '#334155' }}>
                            <th style={{ width: '50%' }}>بند التقييم</th>
                            <th style={{ textAlign: 'center' }}>الدرجة المكتسبة</th>
                            <th style={{ textAlign: 'center' }}>الدرجة العظمى</th>
                            <th style={{ textAlign: 'center' }}>النسبة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ev.items.map((item, idx) => {
                            const itemScore = parseFloat(item.score) || 0;
                            const itemMax = parseFloat(item.maxScore) || 20;
                            const pct = itemMax > 0 ? Math.round((itemScore / itemMax) * 100) : 0;
                            return (
                              <tr key={idx}>
                                <td style={{ fontWeight: 'bold' }}>#{idx + 1} — {item.title}</td>
                                <td style={{ textAlign: 'center', color: '#0d9488', fontWeight: '800' }}>{itemScore}</td>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>{itemMax}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`badge ${pct >= 85 ? 'badge-success' : pct >= 70 ? 'badge-warning' : 'badge-danger'}`}>
                                    {pct}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#f0fdfa', fontWeight: '900', color: '#0f766e' }}>
                            <td>المجموع الكلي:</td>
                            <td style={{ textAlign: 'center' }}>{ev.totalScore || ev.items.reduce((s, i) => s + (parseFloat(i.score) || 0), 0)}</td>
                            <td style={{ textAlign: 'center' }}>{ev.maxTotalScore || ev.items.reduce((s, i) => s + (parseFloat(i.maxScore) || 20), 0)}</td>
                            <td style={{ textAlign: 'center' }}>{ev.percentage || ev.score}%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Notes Section: Branch Manager Notes & High Management Comments (Requirement 1) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                    {/* 1. Branch Manager Notes */}
                    <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#0f766e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>📝</span>
                        <span>ملاحظات وتوصيات مدير الفرع:</span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#1e293b' }}>
                        {ev.managerNotes || ev.notes || 'لا توجد ملاحظات إضافية مسجلة.'}
                      </div>
                    </div>

                    {/* 2. Senior Management Comment & Decision */}
                    <div style={{
                      background: ev.adminComment ? '#eff6ff' : '#f8fafc',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: `1.5px solid ${ev.adminComment ? '#bfdbfe' : '#e2e8f0'}`
                    }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#1e40af', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🏛️</span>
                        <span>رأي وتعليق الإدارة العليا:</span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#1e3a8a', fontWeight: ev.adminComment ? 'bold' : 'normal' }}>
                        {ev.adminComment ? `"${ev.adminComment}"` : (stage === 'approved' ? 'تم اعتماد التقييم رسمياً دون ملاحظات إضافية.' : 'بانتظار مراجعة واعتماد الإدارة العليا بعد ردك.')}
                      </div>
                      {ev.approvedAt && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          تاريخ الاعتماد: {new Date(ev.approvedAt).toLocaleString('ar-EG')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Previous Employee Response Display if already responded */}
                  {ev.employeeStatus && ev.employeeStatus !== 'pending' && (
                    <div style={{
                      background: ev.employeeStatus === 'approved' ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${ev.employeeStatus === 'approved' ? '#86efac' : '#fca5a5'}`,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      fontSize: '13px'
                    }}>
                      <div style={{ fontWeight: 'bold', color: ev.employeeStatus === 'approved' ? '#166534' : '#991b1b', marginBottom: '2px' }}>
                        {ev.employeeStatus === 'approved' ? '🟢 قمت بالموافقة على هذا التقييم' : '🔴 قمت بتسجيل اعتراض وتحفظ على هذا التقييم'}
                        {ev.respondedAt && <span style={{ fontSize: '11px', color: '#64748b', marginRight: '8px' }}>({new Date(ev.respondedAt).toLocaleString('ar-EG')})</span>}
                      </div>
                      {ev.employeeComment && (
                        <div style={{ fontStyle: 'italic', color: '#334155' }}>
                          ملاحظاتك: "{ev.employeeComment}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Controls for Employee (When pending response) */}
                  {(!ev.employeeStatus || ev.employeeStatus === 'pending') && (
                    <div style={{
                      background: '#fffbeb',
                      border: '1.5px solid #fcd34d',
                      borderRadius: '12px',
                      padding: '14px',
                      marginTop: '4px'
                    }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13.5px', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✍️</span>
                        <span>مراجعة الموظف وإبداء الرأي (الموافقة أو الاعتراض):</span>
                      </div>

                      <div className="field" style={{ marginBottom: '10px' }}>
                        <textarea
                          rows="2"
                          placeholder="اكتب ملاحظاتك أو تعقيبك أو سبب الاعتراض إن وجد (اختياري عند الموافقة / مطلوب عند الاعتراض)..."
                          value={empCommentMap[ev.id] || ''}
                          onChange={(e) => setEmpCommentMap({ ...empCommentMap, [ev.id]: e.target.value })}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-start"
                          onClick={() => handleRespondEval(ev.id, 'approve')}
                          style={{ padding: '8px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          👍 موافقة وقبول التقييم
                        </button>
                        <button
                          type="button"
                          className="del-btn"
                          onClick={() => handleRespondEval(ev.id, 'reject')}
                          style={{ padding: '8px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          👎 اعتراض / تحفظ على التقييم
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── SubTab 2: Complaints & Direct Notes ── */}
      {activeTab === 'complaints' && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>
                📮 الشكاوى والمقترحات المباشرة للإدارة العليا
              </h4>
              <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                تقديم مقترح أو شكوى ومتابعة ردود وقرارات الإدارة العليا
              </p>
            </div>
            <button
              type="button"
              className="btn btn-start"
              onClick={() => setShowComplaintForm(!showComplaintForm)}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              {showComplaintForm ? '✕ إغلاق النموذج' : '+ تقديم شكوى / استفسار جديد'}
            </button>
          </div>

          {showComplaintForm && (
            <form onSubmit={handleSubmitComplaint} className="card settings-card fade-in" style={{ padding: '18px', background: 'var(--surface)', border: '1px solid var(--primary-tint)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <h5 style={{ margin: '0 0 14px', fontSize: '15px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✍️ نموذج تقديم شكوى / مقترح جديد للإدارة العليا
              </h5>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: '700', fontSize: '13px' }}>تصنيف الموضوع</label>
                  <select
                    value={complaintCategory}
                    onChange={(e) => setComplaintCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                  >
                    <option value="رواتب واستحقاقات">💰 رواتب ومستحقات مالية</option>
                    <option value="تقييمات وأداء">⭐ التقييمات الشهرية</option>
                    <option value="جدول وورديات">📅 مواعيد وجدول الورديات</option>
                    <option value="بيئة العمل والأجهزة">🏢 بيئة العمل وتجهيزات الفرع</option>
                    <option value="تعامل وسلوك">🤝 سلوك وتعامل وظيفي</option>
                    <option value="مقترح وتطوير">💡 مقترح تطويري</option>
                    <option value="أخرى">📝 موضوع آخر</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontWeight: '700', fontSize: '13px' }}>عنوان الشكوى / الموضوع</label>
                  <input
                    type="text"
                    placeholder="اكتب عنواناً مختصراً..."
                    value={complaintSubject}
                    onChange={(e) => setComplaintSubject(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                  />
                </div>
              </div>

              <div className="field" style={{ marginBottom: '12px' }}>
                <label style={{ fontWeight: '700', fontSize: '13px' }}>تفاصيل الشكوى والشرح الكامل</label>
                <textarea
                  rows="3"
                  placeholder="يرجى كتابة التفاصيل كاملة..."
                  value={complaintDetails}
                  onChange={(e) => setComplaintDetails(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn-start" style={{ padding: '8px 20px', fontSize: '13.5px' }}>
                  📤 إرسال للإدارة العليا
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowComplaintForm(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {employeeComplaints.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '12px' }}>
              <p style={{ color: 'var(--muted)', margin: 0 }}>لا توجد شكاوى أو مقترحات مسجلة من قبلك</p>
            </div>
          ) : (
            employeeComplaints.map((comp) => (
              <div key={comp.id} className="card settings-card fade-in" style={{ padding: '16px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <h5 style={{ margin: 0, fontSize: '15px' }}>{comp.subject}</h5>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                      القسم: <strong>{comp.category}</strong> &nbsp;|&nbsp; التاريخ: {new Date(comp.createdAt).toLocaleDateString('ar-EG')}
                    </div>
                  </div>
                  <span className={`badge ${comp.status === 'resolved' ? 'badge-success' : 'badge-warning'}`}>
                    {comp.status === 'resolved' ? 'تم الرد والحل' : 'قيد المتابعة'}
                  </span>
                </div>

                <p style={{ margin: '8px 0', fontSize: '13.5px', color: 'var(--text)' }}>
                  {comp.details}
                </p>

                {comp.adminReply && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: '#166534', marginTop: '10px' }}>
                    <strong>🏛️ رد الإدارة العليا: </strong> {comp.adminReply}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
