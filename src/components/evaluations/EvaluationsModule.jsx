import React, { useState } from 'react';

export default function EvaluationsModule({
  state,
  setState,
  saveState,
  currentRole = 'admin', // 'admin' | 'branch'
  currentBranchId,
  onSaveEvaluation,
  onSaveEmployeeNote,
  onReplyToNote,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('notes'); // 'notes' | 'evaluations' | 'requests'

  // Evaluation Form State
  const [evalEmpId, setEvalEmpId] = useState('');
  const [evalNotes, setEvalNotes] = useState('');
  const [evalItems, setEvalItems] = useState([
    { id: '1', title: 'الالتزام بمواعيد الحضور والانصراف', score: 10, maxScore: 10 },
    { id: '2', title: 'جودة وتنسيق تنفيذ المهام', score: 9, maxScore: 10 },
    { id: '3', title: 'التعاون مع فريق العمل والعملاء', score: 9, maxScore: 10 },
    { id: '4', title: 'المظهر العام والالتزام بالتعليمات', score: 10, maxScore: 10 }
  ]);

  // Direct Edit Evaluation Modal State for Super Admin
  const [editingEval, setEditingEval] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState([]);

  // Note Form State
  const [noteEmpId, setNoteEmpId] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [replyTextMap, setReplyTextMap] = useState({});

  const employees = state.employees || [];
  const evaluations = state.evaluations || [];
  const notes = state.employeeNotes || [];

  // Filter requests for evaluation edit proposals from branch managers
  const evalEditRequests = (state.requests || []).filter(
    (r) => r.type === 'eval_edit_request' && r.status === 'pending_admin'
  );

  // Criteria Items dynamic list handlers
  const handleAddEvalItem = () => {
    setEvalItems([...evalItems, { id: String(Date.now()), title: '', score: 10, maxScore: 10 }]);
  };
  const handleRemoveEvalItem = (id) => {
    setEvalItems(evalItems.filter((i) => i.id !== id));
  };
  const handleUpdateEvalItem = (id, field, value) => {
    setEvalItems(evalItems.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  // Edit Modal Criteria Handlers
  const handleAddEditItem = () => {
    setEditItems([...editItems, { id: String(Date.now()), title: '', score: 10, maxScore: 10 }]);
  };
  const handleRemoveEditItem = (id) => {
    setEditItems(editItems.filter((i) => i.id !== id));
  };
  const handleUpdateEditItem = (id, field, value) => {
    setEditItems(editItems.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  // Create New Evaluation by Admin
  const handleEvaluationSubmit = (e) => {
    e.preventDefault();
    if (!evalEmpId) {
      alert('يرجى تحديد الموظف المراد تقييمه');
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

    const empObj = employees.find((e) => e.id === evalEmpId);

    const evalData = {
      id: `eval_${Date.now()}`,
      employeeId: evalEmpId,
      employeeName: empObj?.name || '',
      employeeCode: empObj?.code || '',
      items: evalItems,
      score: percentage,
      percentage,
      totalScore,
      maxTotalScore,
      rating,
      notes: evalNotes,
      evaluatorRole: 'الإدارة العليا',
      employeeStatus: 'pending',
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };

    if (onSaveEvaluation) {
      onSaveEvaluation(evalData);
    } else if (setState) {
      const updatedEvals = [evalData, ...evaluations];
      const updatedState = { ...state, evaluations: updatedEvals };
      setState(updatedState);
      if (saveState) saveState(updatedState);
    }

    if (showToast) showToast('✅ تم حفظ التقييم بنجاح وإرساله للموظف');
    else alert('✅ تم حفظ التقييم بنجاح!');
    setEvalNotes('');
  };

  // Super Admin Direct Edit Evaluation (Anytime)
  const handleOpenEditModal = (ev) => {
    setEditingEval(ev);
    setEditNotes(ev.notes || '');
    setEditItems(ev.items && ev.items.length > 0 ? [...ev.items] : [
      { id: '1', title: 'الالتزام بمواعيد الحضور والانصراف', score: Math.round((ev.score || 80) / 10), maxScore: 10 }
    ]);
  };

  const handleSaveDirectAdminEdit = async (e) => {
    e.preventDefault();
    if (!editingEval) return;

    const totalScore = editItems.reduce((acc, item) => acc + (parseFloat(item.score) || 0), 0);
    const maxTotalScore = editItems.reduce((acc, item) => acc + (parseFloat(item.maxScore) || 10), 0);
    const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;
    
    let rating = 'ممتاز';
    if (percentage < 60) rating = 'ضعيف';
    else if (percentage < 75) rating = 'مقبول';
    else if (percentage < 85) rating = 'جيد';
    else if (percentage < 95) rating = 'جيد جداً';

    const updatedEvals = (state.evaluations || []).map((ev) => {
      if (ev.id === editingEval.id) {
        return {
          ...ev,
          items: editItems,
          score: percentage,
          percentage,
          totalScore,
          maxTotalScore,
          rating,
          notes: editNotes.trim(),
          updatedByAdminAt: new Date().toISOString()
        };
      }
      return ev;
    });

    const updatedState = { ...state, evaluations: updatedEvals };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    setEditingEval(null);
    if (showToast) showToast('✅ تم تعديل التقييم بواسطة الإدارة العليا بنجاح');
    else alert('✅ تم تعديل التقييم بنجاح!');
  };

  // Super Admin Approves Evaluation Edit Request from Branch Manager
  const handleApproveEvalEditRequest = async (req) => {
    const updatedEvals = (state.evaluations || []).map((ev) => {
      if (ev.id === req.evalId) {
        return {
          ...ev,
          items: req.newItems || ev.items,
          score: req.newPercentage || ev.score,
          percentage: req.newPercentage || ev.percentage,
          notes: req.newNotes || ev.notes,
          adminApprovedEdit: true,
          updatedAt: new Date().toISOString()
        };
      }
      return ev;
    });

    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === req.id) {
        return { ...r, status: 'approved', adminApproved: true };
      }
      return r;
    });

    const updatedState = { ...state, evaluations: updatedEvals, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (showToast) showToast('✅ تم اعتماد تعديل التقييم المقدم من مدير الفرع وتطبيقه');
    else alert('✅ تم اعتماد تعديل التقييم!');
  };

  const handleRejectEvalEditRequest = async (reqId) => {
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === reqId) {
        return { ...r, status: 'rejected', adminApproved: false };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (showToast) showToast('🔴 تم رفض طلب تعديل التقييم');
    else alert('🔴 تم رفض طلب التعديل');
  };

  const handleNoteSubmit = (e) => {
    e.preventDefault();
    if (!noteEmpId || !noteContent.trim()) {
      alert('يرجى اختيار الموظف وإدخال نص الملاحظة');
      return;
    }
    const noteData = {
      id: `note_${Date.now()}`,
      employeeId: noteEmpId,
      content: noteContent,
      branchId: currentBranchId || '',
      createdRole: currentRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع',
      createdAt: new Date().toISOString(),
      replies: []
    };
    if (onSaveEmployeeNote) onSaveEmployeeNote(noteData);
    alert('✅ تم تسجيل الملاحظة بنجاح!');
    setNoteContent('');
  };

  const handleReplySubmit = (noteId) => {
    const text = replyTextMap[noteId];
    if (!text || !text.trim()) return;

    if (onReplyToNote) {
      onReplyToNote(noteId, {
        id: `reply_${Date.now()}`,
        authorRole: currentRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع',
        content: text.trim(),
        createdAt: new Date().toISOString()
      });
    }
    setReplyTextMap({ ...replyTextMap, [noteId]: '' });
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            ⭐ تقييم الموظفين وملاحظات الإدارة العليا ومديري الفروع
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            متابعة وتعديل التقييمات الشهرية، واستعراض بنود التقييم وردود الموظفين
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'notes' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('notes')}
          >
            💬 ملاحظات الموظفين والردود ({notes.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'evaluations' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('evaluations')}
          >
            ⭐ تقييم الأداء والدرجات ({evaluations.length})
          </button>
          {evalEditRequests.length > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'requests' ? 'btn-start' : 'btn-ghost'}`}
              onClick={() => setActiveTab('requests')}
              style={{ background: '#f59e0b', color: '#fff' }}
            >
              🔔 طلبات تعديل التقييم ({evalEditRequests.length})
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: Branch Manager Notes & Higher Management Replies */}
      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Add Note Form */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
              📝 إضافة ملاحظة جديدة على موظف
            </h4>
            <form onSubmit={handleNoteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="field">
                <label>اختر الموظف</label>
                <select value={noteEmpId} onChange={(e) => setNoteEmpId(e.target.value)} required>
                  <option value="">-- اختر الموظف --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (كود: {e.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>نص الملاحظة</label>
                <textarea
                  rows="3"
                  placeholder="أدخل الملاحظات السلوكية أو الإدارية..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-start" style={{ alignSelf: 'flex-start' }}>
                💾 حفظ الملاحظة
              </button>
            </form>
          </div>

          {/* Notes Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                لا توجد ملاحظات مسجلة حتى الآن.
              </div>
            ) : (
              notes.map((note) => {
                const emp = employees.find((e) => e.id === note.employeeId);
                return (
                  <div key={note.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="badge badge-primary">{note.createdRole || 'الإدارة العليا'}</span>
                        <strong style={{ fontSize: '15px' }}>👤 الموظف: {emp ? emp.name : 'غير محدد'} ({emp?.code})</strong>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {new Date(note.createdAt).toLocaleString('ar-EG')}
                      </span>
                    </div>

                    <p style={{ margin: '8px 0 12px 0', fontSize: '14.5px', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                      {note.content}
                    </p>

                    {/* Replies */}
                    {note.replies && note.replies.length > 0 && (
                      <div style={{ marginTop: '12px', paddingRight: '16px', borderRight: '3px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {note.replies.map((reply) => (
                          <div key={reply.id} style={{ background: 'var(--primary-tint)', padding: '10px 14px', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                              <span>💬 رد: {reply.authorRole}</span>
                              <span>{new Date(reply.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ fontSize: '13.5px', color: 'var(--text)' }}>{reply.content}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply Input Box */}
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="اكتب رداً على هذه الملاحظة..."
                        value={replyTextMap[note.id] || ''}
                        onChange={(e) => setReplyTextMap({ ...replyTextMap, [note.id]: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={() => handleReplySubmit(note.id)}>
                        إرسال الرد
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Performance Evaluation Creation and Display */}
      {activeTab === 'evaluations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* New Evaluation Form */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
            <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
              ⭐ إنشاء تقييم أداء جديد للموظف (من قِبل الإدارة العليا)
            </h4>
            <form onSubmit={handleEvaluationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label>اختر الموظف المراد تقييمه</label>
                <select value={evalEmpId} onChange={(e) => setEvalEmpId(e.target.value)} required>
                  <option value="">-- اختر الموظف --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (كود: {e.code} - {e.jobTitle})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Criteria Rows */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: '700', fontSize: '13px' }}>بنود التقييم والدرجات:</label>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '2px 8px' }} onClick={handleAddEvalItem}>
                    ➕ إضافة بند
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {evalItems.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="اسم البند..."
                        value={item.title}
                        onChange={(e) => handleUpdateEvalItem(item.id, 'title', e.target.value)}
                        style={{ flex: '2 1 180px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                        required
                      />
                      <input
                        type="number"
                        min="0"
                        max={item.maxScore}
                        value={item.score}
                        onChange={(e) => handleUpdateEvalItem(item.id, 'score', e.target.value)}
                        style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', textAlign: 'center' }}
                        required
                      />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>/ {item.maxScore}</span>
                      {evalItems.length > 1 && (
                        <button type="button" onClick={() => handleRemoveEvalItem(item.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}>
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>ملاحظات التقييم والتوصيات الإدارية</label>
                <textarea rows="2" placeholder="ملاحظات على الأداء والانضباط..." value={evalNotes} onChange={(e) => setEvalNotes(e.target.value)} />
              </div>

              <button type="submit" className="btn btn-start" style={{ alignSelf: 'flex-start' }}>
                ⭐ حفظ ورصد التقييم
              </button>
            </form>
          </div>

          {/* Evaluations Display List with Criteria Table */}
          <h4 style={{ margin: '10px 0 0', fontSize: '16px', color: '#1e293b' }}>
            📋 جميع تقييمات الأداء المسجلة (يمكن للإدارة العليا تعديلها في أي وقت)
          </h4>

          {evaluations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              لا توجد تقييمات مسجلة حتى الآن.
            </div>
          ) : (
            evaluations.map((ev) => {
              const emp = employees.find((e) => e.id === ev.employeeId);
              return (
                <div key={ev.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: '800' }}>
                        👤 الموظف: {ev.employeeName || emp?.name || 'غير محدد'} ({ev.employeeCode || emp?.code})
                      </h4>
                      <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                        المقيم: {ev.evaluatorRole || 'الإدارة العليا'} &nbsp;|&nbsp; التاريخ/الشهر: {ev.month || ev.date}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px', fontWeight: '900', color: '#0d9488' }}>
                        {ev.percentage || ev.score}% ({ev.rating || 'ممتاز'})
                      </span>
                      <button
                        className="btn btn-start"
                        style={{ padding: '5px 12px', fontSize: '12.5px' }}
                        onClick={() => handleOpenEditModal(ev)}
                      >
                        ✏️ تعديل التقييم
                      </button>
                    </div>
                  </div>

                  {/* Render Detailed Criteria Items Table */}
                  {ev.items && ev.items.length > 0 && (
                    <div className="table-responsive" style={{ margin: '12px 0' }}>
                      <table className="bylaws-table" style={{ fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-muted)' }}>
                            <th>بند التقييم (Criteria)</th>
                            <th>الدرجة المكتسبة</th>
                            <th>الدرجة القصوى</th>
                            <th>النسبة</th>
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
                      <strong>ملاحظات التقييم:</strong> {ev.notes}
                    </div>
                  )}

                  {/* Employee status & comment */}
                  <div style={{ fontSize: '12.5px', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <span>
                      حالة رد الموظف:{' '}
                      {ev.employeeStatus === 'approved' ? (
                        <strong style={{ color: '#16a34a' }}>🟢 موافق ومعتمد</strong>
                      ) : ev.employeeStatus === 'rejected' ? (
                        <strong style={{ color: '#dc2626' }}>🔴 معترض على التقييم</strong>
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
      )}

      {/* TAB 3: Requests for Evaluation Edits from Branch Managers */}
      {activeTab === 'requests' && (
        <div className="card settings-card fade-in" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '17px', color: '#1e293b' }}>
            🔔 طلبات تعديل التقييمات المقدمة من مديري الفروع (بعد موافقة الموظف)
          </h3>

          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>تاريخ الطلب</th>
                  <th>تفاصيل التعديل والدرجة الجديدة</th>
                  <th>السبب والملاحظات</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {evalEditRequests.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا توجد طلبات تعديل تقييمات قيد الانتظار.</td></tr>
                ) : (
                  evalEditRequests.map((req) => (
                    <tr key={req.id}>
                      <td style={{ fontWeight: '700' }}>{req.employeeName} ({req.employeeCode})</td>
                      <td>{req.createdAt ? req.createdAt.slice(0, 10) : '—'}</td>
                      <td>
                        <span style={{ color: '#0d9488', fontWeight: '800' }}>النسبة الجديدة: {req.newPercentage}%</span>
                      </td>
                      <td style={{ fontSize: '12.5px' }}>{req.newNotes || req.details || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-start" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleApproveEvalEditRequest(req)}>
                            ✓ اعتماد التعديل
                          </button>
                          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }} onClick={() => handleRejectEvalEditRequest(req.id)}>
                            ✕ رفض
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Super Admin Direct Evaluation Edit Modal */}
      {editingEval && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '600px', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', color: '#0d9488' }}>
              ✏️ تعديل التقييم للموظف: {editingEval.employeeName} (الإدارة العليا)
            </h3>
            <form onSubmit={handleSaveDirectAdminEdit}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontWeight: '700', fontSize: '13.5px' }}>بنود التقييم والدرجات:</label>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '2px 8px' }} onClick={handleAddEditItem}>
                    ➕ إضافة بند
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {editItems.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="اسم البند..."
                        value={item.title}
                        onChange={(e) => handleUpdateEditItem(item.id, 'title', e.target.value)}
                        style={{ flex: '2 1 180px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                        required
                      />
                      <input
                        type="number"
                        min="0"
                        max={item.maxScore}
                        value={item.score}
                        onChange={(e) => handleUpdateEditItem(item.id, 'score', e.target.value)}
                        style={{ width: '65px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', textAlign: 'center' }}
                        required
                      />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>/ {item.maxScore}</span>
                      {editItems.length > 1 && (
                        <button type="button" onClick={() => handleRemoveEditItem(item.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}>
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label>ملاحظات التقييم</label>
                <textarea rows="3" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingEval(null)}>إلغاء</button>
                <button type="submit" className="btn btn-start">💾 حفظ التعديل فوراً</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
