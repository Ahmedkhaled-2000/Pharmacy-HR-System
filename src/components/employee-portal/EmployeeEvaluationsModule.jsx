import React, { useState } from 'react';
import { todayStr } from '../../utils/formatters';

export default function EmployeeEvaluationsModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth,
  selectedBranchId
}) {
  const [activeTab, setActiveTab] = useState('evaluations'); // 'evaluations' | 'complaints'
  const [empComment, setEmpComment] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState(null);

  // Complaint Form State
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('رواتب واستحقاقات');
  const [complaintDetails, setComplaintDetails] = useState('');
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [empReplyInputs, setEmpReplyInputs] = useState({});

  const employeeEvals = (state.evaluations || []).filter(
    (e) => String(e.employeeId) === String(emp.id)
  );

  const employeeComplaints = (state.requests || []).filter(
    (r) => String(r.employeeId) === String(emp.id) && (r.type === 'complaint' || r.type === 'eval_edit_request')
  );

  // Respond to Evaluation (Approve or Reject with Comment)
  const handleRespondEval = async (evalId, responseType) => {
    if (!empComment.trim() && responseType === 'reject') {
      showToast('يرجى كتابة سبب عدم الموافقة في التعليق');
      return;
    }

    const updatedEvals = (state.evaluations || []).map((e) => {
      if (e.id === evalId) {
        return {
          ...e,
          employeeStatus: responseType === 'approve' ? 'approved' : 'rejected',
          employeeComment: empComment.trim(),
          respondedAt: new Date().toISOString()
        };
      }
      return e;
    });

    const updatedState = { ...state, evaluations: updatedEvals };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    setSelectedEvalId(null);
    setEmpComment('');
    showToast(
      responseType === 'approve'
        ? 'تمت الموافقة على التقييم بنجاح ✅'
        : 'تم تقديم الاعتراض على التقييم بنجاح 📝'
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
      targetApproval: 'admin_only', // للإدارة العليا فقط
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

    setState(updatedState);
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
          <span style={{ fontSize: '24px' }}>📋</span>
          <div>
            <h3 style={{ margin: 0 }}>التقييمات الشهرية والشكاوى</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              مراجعة تقييم مدير الفرع وإرسال الملاحظات والشكاوى للإدارة العليا
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
            📮 الشكاوى والملاحظات
          </button>
        </div>
      </div>

      {/* ── SubTab 1: Monthly Evaluations ── */}
      {activeTab === 'evaluations' && (
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '15px' }}>سجل تقييمات الأداء الصادرة من مدير الفرع</h4>

          {employeeEvals.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '12px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
              <p style={{ color: 'var(--muted)', margin: 0 }}>لا توجد تقييمات مسجلة لك حتى الآن</p>
            </div>
          ) : (
            employeeEvals.map((ev) => (
              <div key={ev.id} className="card settings-card fade-in" style={{ padding: '16px', marginBottom: '16px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <h5 style={{ margin: 0, fontSize: '16px', color: 'var(--primary)' }}>
                      📅 تقييم شهر: {ev.month || selectedMonth}
                    </h5>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                      الدرجة الإجمالية: <strong style={{ color: 'var(--success)', fontSize: '16px' }}>{ev.score || ev.overallScore || '90'}/100</strong>
                    </div>
                  </div>

                  <div>
                    {ev.employeeStatus === 'approved' && <span className="badge success">✅ وافقت على التقييم</span>}
                    {ev.employeeStatus === 'rejected' && <span className="badge danger">❌ اعترضت على التقييم</span>}
                    {(!ev.employeeStatus || ev.employeeStatus === 'pending') && (
                      <span className="badge warning">⏳ بانتظار مراجعتك</span>
                    )}
                  </div>
                </div>

                {/* Criteria breakdown if available */}
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
                  <div style={{ fontSize: '13.5px', background: 'rgba(59,130,246,0.06)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                    <strong>ملاحظات مدير الفرع: </strong> {ev.notes}
                  </div>
                )}

                {ev.employeeComment && (
                  <div style={{ fontSize: '13px', color: 'var(--primary)', fontStyle: 'italic', marginBottom: '10px' }}>
                    💬 <strong>تعليقك السابق:</strong> {ev.employeeComment}
                  </div>
                )}

                {/* Action Controls for Employee */}
                {(!ev.employeeStatus || ev.employeeStatus === 'pending' || selectedEvalId === ev.id) && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '10px' }}>
                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label style={{ fontWeight: '700' }}>تعليق الموظف على التقييم (اختياري عند الموافقة / مطلوب عند الرفض)</label>
                      <input
                        type="text"
                        placeholder="اكتب تعليقك على هذا التقييم..."
                        value={selectedEvalId === ev.id ? empComment : ''}
                        onChange={(e) => {
                          setSelectedEvalId(ev.id);
                          setEmpComment(e.target.value);
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-start"
                        onClick={() => {
                          setSelectedEvalId(ev.id);
                          handleRespondEval(ev.id, 'approve');
                        }}
                      >
                        👍 موافقة على التقييم
                      </button>
                      <button
                        className="del-btn"
                        onClick={() => {
                          setSelectedEvalId(ev.id);
                          handleRespondEval(ev.id, 'reject');
                        }}
                      >
                        👎 اعتراض / رفض
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── SubTab 2: Complaints & Direct Notes ── */}
      {activeTab === 'complaints' && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>
                📮 الشكاوى والمقترحات المباشرة للإدارة العليا
              </h4>
              <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                تقديم شكاوى أو استفسارات ومتابعة ردود الإدارة العليا وإمكانية التعقيب والرد المستمر
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
            <form onSubmit={handleSubmitComplaint} className="card settings-card fade-in" style={{ padding: '18px', background: 'var(--surface)', border: '1px solid var(--primary-tint)', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <h5 style={{ margin: '0 0 14px', fontSize: '15px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✍️ نموذج تقديم شكوى / مقترح جديد للإدارة العليا
              </h5>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: '700', fontSize: '13px' }}>تصنيف الشكوى / الموضوع</label>
                  <select
                    value={complaintCategory}
                    onChange={(e) => setComplaintCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                  >
                    <option value="رواتب واستحقاقات">💰 رواتب ومستحقات مالية</option>
                    <option value="جدول وورديات">📅 مواعيد وجدول الورديات</option>
                    <option value="بيئة العمل والأجهزة">🏢 بيئة العمل وتجهيزات الفرع</option>
                    <option value="تعامل وسلوك">🤝 سلوك وتعامل وظيفي</option>
                    <option value="مقترح وتطوير">💡 مقترح تطويري</option>
                    <option value="أخرى">📝 موضوع آخر</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontWeight: '700', fontSize: '13px' }}>عنوان الشكوى / الملاحظة</label>
                  <input
                    type="text"
                    placeholder="اكتب عنواناً مختصراً للشكوى..."
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
                  placeholder="يرجى كتابة التفاصيل كاملة والتواريخ إن وجدت لمساعدة الإدارة في اتخاذ القرار المناسب..."
                  value={complaintDetails}
                  onChange={(e) => setComplaintDetails(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ fontSize: '12px', color: '#1e40af', background: 'rgba(59,130,246,0.08)', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                🔒 <strong>خصوصية وسرية تامة:</strong> هذه الشكوى تُحال مباشرة إلى <strong>الإدارة العليا فقط</strong> دون اطلاع أحد غير مصرح له.
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowComplaintForm(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start" style={{ padding: '8px 20px' }}>💾 إرسال الشكوى للإدارة العليا</button>
              </div>
            </form>
          )}

          {/* List of Sent Complaints with Threaded Replies */}
          <h4 style={{ margin: '20px 0 12px', fontSize: '15px', color: 'var(--text)' }}>
            📋 سجل شكاواك ومتابعة محادثة الردود مع الإدارة ({employeeComplaints.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {employeeComplaints.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                🎉 لا توجد لديك أي شكاوى مسجلة حالياً.
              </div>
            ) : (
              employeeComplaints.map((c, idx) => {
                const replies = c.replies || (c.adminReply ? [{ authorRole: 'الإدارة العليا', content: c.adminReply, createdAt: c.adminRepliedAt }] : []);
                const isPending = c.status === 'pending' || c.status === 'pending_admin';
                const isResolved = c.status === 'resolved' || replies.length > 0;
                const isClosed = c.status === 'closed';

                const handleSendEmpReply = async (complaintId) => {
                  const text = (empReplyInputs[complaintId] || '').trim();
                  if (!text) {
                    showToast('يرجى كتابة نص التعقيب أولاً');
                    return;
                  }

                  const newReply = {
                    id: `rep_${Date.now()}`,
                    authorRole: emp.name || 'الموظف',
                    authorId: emp.id,
                    content: text,
                    createdAt: new Date().toISOString()
                  };

                  const updatedReqs = (state.requests || []).map((req) => {
                    if (req.id === complaintId) {
                      const curReplies = req.replies || (req.adminReply ? [{ authorRole: 'الإدارة العليا', content: req.adminReply, createdAt: req.adminRepliedAt }] : []);
                      return { ...req, replies: [...curReplies, newReply], status: 'pending_admin' };
                    }
                    return req;
                  });

                  // Notification for Admin
                  const newAdminNotif = {
                    id: `notif_rep_${complaintId}_${Date.now()}`,
                    type: 'complaint_reply',
                    title: `💬 تعقيب جديد من الموظف: ${emp.name}`,
                    message: `قام الموظف ${emp.name} بالرد والتعقيب على الشكوى "${c.subject || 'شكوى'}": "${text.slice(0, 70)}"`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    targetRole: 'admin'
                  };

                  const updatedNotifications = [newAdminNotif, ...(state.notifications || [])];
                  const updatedState = { ...state, requests: updatedReqs, notifications: updatedNotifications };

                  setState(updatedState);
                  if (saveState) await saveState(updatedState);

                  setEmpReplyInputs((prev) => ({ ...prev, [complaintId]: '' }));
                  showToast('✅ تم إرسال تعقيبك وردك للإدارة العليا بنجاح');
                };

                return (
                  <div key={c.id} className="card" style={{ padding: '18px', borderRadius: '14px', border: isPending ? '2px solid #fdba74' : '1px solid var(--border)', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                            #{idx + 1} {c.subject || 'شكوى / استفسار'}
                          </span>
                          {c.category && (
                            <span className="badge badge-secondary" style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569' }}>
                              🏷️ {c.category}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                          🕒 تاريخ التقديم: {c.createdAt ? new Date(c.createdAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : (c.date || '—')}
                        </div>
                      </div>

                      <div>
                        {c.status === 'closed' ? (
                          <span className="badge badge-secondary" style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                            🔒 مغلقة ومحسومة
                          </span>
                        ) : c.status === 'pending_admin' ? (
                          <span className="badge badge-info" style={{ background: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                            🔄 تم إرسال تعقيبك (بانتظار رد الإدارة)
                          </span>
                        ) : replies.length > 0 ? (
                          <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                            💬 تم الرد من الإدارة العليا
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                            ⏳ بانتظار مراجعة ورد الإدارة
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Original Complaint Content */}
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '12px 14px', borderRadius: '10px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#9a3412', marginBottom: '4px' }}>
                        📌 نص الشكوى المقدمة منك:
                      </div>
                      <div style={{ color: '#334155', fontSize: '13.5px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {c.details || c.reason || '—'}
                      </div>
                    </div>

                    {/* Threaded Conversation Stream */}
                    {replies.length > 0 && (
                      <div style={{ marginTop: '12px', background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                        <h6 style={{ margin: '0 0 10px', color: '#334155', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          💬 محادثة وردود الإدارة العليا المتبادلة ({replies.length}):
                        </h6>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {replies.map((r, rIdx) => {
                            const isAdmin = r.authorRole === 'الإدارة العليا' || r.authorId === 'admin';
                            return (
                              <div
                                key={rIdx}
                                style={{
                                  alignSelf: isAdmin ? 'flex-start' : 'flex-end',
                                  maxWidth: '90%',
                                  background: isAdmin ? '#f0fdf4' : '#eff6ff',
                                  border: `1px solid ${isAdmin ? '#bbf7d0' : '#bfdbfe'}`,
                                  padding: '12px 14px',
                                  borderRadius: '10px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                                  <strong style={{ fontSize: '12.5px', color: isAdmin ? '#166534' : '#1e40af' }}>
                                    {isAdmin ? '🏥 رد الإدارة العليا الرسمي:' : '👤 ردك / تعقيبك:'}
                                  </strong>
                                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                    {r.createdAt ? new Date(r.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                  </span>
                                </div>
                                <div style={{ fontSize: '13.5px', color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                  {r.content}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Employee Follow-up Reply Input */}
                    {!isClosed && (
                      <div style={{ marginTop: '12px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                          ✍️ هل ترغب في إضافة رد أو تعقيب آخر للإدارة العليا؟
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            placeholder="اكتب تعقيبك أو توضيحك الإضافي للإدارة العليا هنا..."
                            value={empReplyInputs[c.id] || ''}
                            onChange={(e) => setEmpReplyInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSendEmpReply(c.id);
                              }
                            }}
                            style={{ flex: '1 1 240px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                          />
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ padding: '8px 16px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                            onClick={() => handleSendEmpReply(c.id)}
                          >
                            📤 إرسال التعقيب للإدارة
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
