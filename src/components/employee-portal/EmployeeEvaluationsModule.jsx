import React, { useState } from 'react';
import { todayStr } from '../../utils/formatters';

export default function EmployeeEvaluationsModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth
}) {
  const [activeTab, setActiveTab] = useState('evaluations'); // 'evaluations' | 'complaints'
  const [empComment, setEmpComment] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState(null);

  // Complaint Form State
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDetails, setComplaintDetails] = useState('');
  const [showComplaintForm, setShowComplaintForm] = useState(false);

  const employeeEvals = (state.evaluations || []).filter(
    (e) => e.employeeId === emp.id
  );

  const employeeComplaints = (state.requests || []).filter(
    (r) => r.employeeId === emp.id && r.type === 'complaint'
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
      branchId: emp.branchId,
      subject: complaintSubject.trim(),
      details: complaintDetails.trim(),
      targetApproval: 'admin_only', // للإدارة العليا فقط
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newComplaint, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '15px' }}>تقديم شكوى أو ملاحظة مباشرة للإدارة العليا</h4>
            <button className="btn btn-start" onClick={() => setShowComplaintForm(!showComplaintForm)} style={{ fontSize: '13px', padding: '6px 14px' }}>
              {showComplaintForm ? '✕ إغلاق' : '+ تقديم شكوى جديدة'}
            </button>
          </div>

          {showComplaintForm && (
            <form onSubmit={handleSubmitComplaint} className="card settings-card fade-in" style={{ padding: '16px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', marginBottom: '20px' }}>
              <h5 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>📮 شكوى / ملاحظة للإدارة العليا</h5>

              <div className="field" style={{ marginBottom: '10px' }}>
                <label style={{ fontWeight: '700' }}>موضوع الشكوى / الملاحظة</label>
                <input
                  type="text"
                  placeholder="عنوان الشكوى..."
                  value={complaintSubject}
                  onChange={(e) => setComplaintSubject(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label style={{ fontWeight: '700' }}>تفاصيل الشكوى</label>
                <textarea
                  rows="3"
                  placeholder="اكتب جميع تفاصيل وملاحظات الشكوى..."
                  value={complaintDetails}
                  onChange={(e) => setComplaintDetails(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  required
                />
              </div>

              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)', background: 'rgba(59,130,246,0.08)', padding: '8px 12px', borderRadius: '6px' }}>
                🔒 هذه الشكوى تُرسل بشرية تامة إلى <strong>الإدارة العليا فقط</strong>.
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowComplaintForm(false)}>إلغاء</button>
                <button type="submit" className="btn btn-start">💾 إرسال الشكوى</button>
              </div>
            </form>
          )}

          {/* Table of Sent Complaints */}
          <h4 style={{ margin: '20px 0 12px', fontSize: '15px' }}>📋 سجل الشكاوى والملاحظات المرسلة</h4>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>الموضوع</th>
                  <th>التفاصيل</th>
                  <th>الوجهة</th>
                  <th>حالة الشكوى</th>
                  <th>تاريخ الإرسال</th>
                </tr>
              </thead>
              <tbody>
                {employeeComplaints.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan="6">لا توجد شكاوى مسجلة سابقاً</td>
                  </tr>
                ) : (
                  employeeComplaints.map((c, idx) => (
                    <tr key={c.id}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 'bold' }}>{c.subject}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{c.details}</td>
                      <td><span className="badge warning" style={{ fontSize: '11px' }}>🏢 الإدارة العليا فقط</span></td>
                      <td>
                        {c.status === 'resolved' && <span className="badge success">✅ تم المعالجة</span>}
                        {c.status === 'pending' && <span className="badge warning">⏳ قيد النظر</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                        {c.createdAt ? c.createdAt.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
