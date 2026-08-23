import React, { useState } from 'react';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

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
  const [activeTab, setActiveTab] = useState('evaluations'); // 'evaluations' | 'notes' | 'complaints' | 'requests'

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

  // Complaint Filters State
  const [complaintFilterStatus, setComplaintFilterStatus] = useState('all'); // 'all' | 'pending' | 'resolved' | 'closed'
  const [complaintBranchFilter, setComplaintBranchFilter] = useState('all');
  const [complaintSearch, setComplaintSearch] = useState('');
  const [complaintReplyText, setComplaintReplyText] = useState({});
  const [complaintStatusChoice, setComplaintStatusChoice] = useState({});

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

  const complaintsCount = (state.requests || []).filter((r) => r.type === 'complaint').length;

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

        {/* Dropdown Selector for Evaluation Sections */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface, #f8fafc)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--muted)' }}>
              📑 القسم المعروض:
            </span>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1.5px solid var(--primary, #0f766e)',
                background: '#ffffff',
                color: 'var(--text)',
                fontFamily: 'Cairo, Tajawal, sans-serif',
                fontWeight: 'bold',
                fontSize: '13.5px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15,118,110,0.1)',
                outline: 'none',
                minWidth: '250px'
              }}
            >
              <option value="evaluations">
                ⭐ تقييم الأداء والدرجات ({evaluations.length})
              </option>
              <option value="notes">
                💬 ملاحظات الفروع والردود ({notes.length})
              </option>
              <option value="complaints">
                📋 شكاوى الموظفين والردود ({complaintsCount})
              </option>
              {evalEditRequests.length > 0 && (
                <option value="requests">
                  🔔 طلبات تعديل التقييم ({evalEditRequests.length})
                </option>
              )}
            </select>
          </div>
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
                  {employees.filter(isEmployeeActive).map((e) => (
                    <option key={e.id} value={e.id}>
                      {getEmpDisplayName(e)} (كود: {e.code})
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

      {/* TAB: Employee Complaints & Top Management Replies (Requirement 15) */}
      {activeTab === 'complaints' && (() => {
        const allComplaints = (state.requests || []).filter(r => r.type === 'complaint' || r.type === 'eval_edit_request');
        const branches = state.branches || [];

        // Metrics
        const pendingComplaintsCount = allComplaints.filter(c => c.status === 'pending' || c.status === 'pending_admin' || !c.adminApproved).length;
        const resolvedComplaintsCount = allComplaints.filter(c => c.status === 'resolved').length;
        const closedComplaintsCount = allComplaints.filter(c => c.status === 'closed').length;

        // Filtering
        const filteredComplaints = allComplaints.filter((comp) => {
          const empObj = employees.find(e => String(e.id) === String(comp.employeeId));
          // Status filter
          if (complaintFilterStatus === 'pending' && (comp.status === 'resolved' || comp.status === 'closed')) return false;
          if (complaintFilterStatus === 'resolved' && comp.status !== 'resolved') return false;
          if (complaintFilterStatus === 'closed' && comp.status !== 'closed') return false;

          // Branch filter
          if (complaintBranchFilter !== 'all') {
            const compBranchId = comp.branchId || empObj?.branchId;
            if (String(compBranchId) !== String(complaintBranchFilter)) return false;
          }

          // Search text
          if (complaintSearch.trim()) {
            const q = complaintSearch.toLowerCase();
            const name = (comp.employeeName || (empObj ? getEmpDisplayName(empObj) : '')).toLowerCase();
            const nickname = (empObj?.nickname || '').toLowerCase();
            const subject = (comp.subject || '').toLowerCase();
            const details = (comp.details || comp.reason || '').toLowerCase();
            if (!name.includes(q) && !nickname.includes(q) && !subject.includes(q) && !details.includes(q)) return false;
          }

          return true;
        });

        const handleSendAdminReply = async (comp) => {
          const text = (complaintReplyText[comp.id] || '').trim();
          if (!text) {
            showToast?.('يرجى كتابة نص الرد أولاً');
            return;
          }

          const chosenStatus = complaintStatusChoice[comp.id] || 'resolved';

          const newReply = {
            id: `rep_${Date.now()}`,
            authorRole: 'الإدارة العليا',
            authorId: 'admin',
            content: text,
            createdAt: new Date().toISOString()
          };

          const updatedRequests = (state.requests || []).map((r) => {
            if (r.id === comp.id) {
              const curReplies = r.replies || (r.adminReply ? [{ authorRole: 'الإدارة العليا', content: r.adminReply, createdAt: r.adminRepliedAt }] : []);
              return {
                ...r,
                status: chosenStatus,
                adminApproved: true,
                adminRepliedAt: new Date().toISOString(),
                replies: [...curReplies, newReply]
              };
            }
            return r;
          });

          // Create notification for employee
          const newNotif = {
            id: `notif_rep_${comp.id}_${Date.now()}`,
            type: 'admin_complaint_reply',
            title: `🏥 رد جديد من الإدارة العليا بخصوص: ${comp.subject || 'شكواك'}`,
            message: `قامت الإدارة العليا بالرد على شكواك/ملاحظتك: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`,
            timestamp: new Date().toISOString(),
            read: false,
            targetRole: 'employee',
            employeeId: comp.employeeId
          };

          const updatedNotifications = [newNotif, ...(state.notifications || [])];
          const updatedState = { ...state, requests: updatedRequests, notifications: updatedNotifications };

          if (setState) setState(updatedState);
          if (saveState) await saveState(updatedState);

          setComplaintReplyText((prev) => ({ ...prev, [comp.id]: '' }));
          showToast?.('✅ تم إرسال رد الإدارة العليا الرسمي وتنبيه الموظف بنجاح');
        };

        const handleChangeComplaintStatus = async (compId, newStatus) => {
          const updatedRequests = (state.requests || []).map((r) =>
            r.id === compId ? { ...r, status: newStatus } : r
          );
          const updatedState = { ...state, requests: updatedRequests };
          if (setState) setState(updatedState);
          if (saveState) await saveState(updatedState);
          showToast?.('✅ تم تحديث حالة الشكوى');
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>📋 إجمالي الشكاوى والملاحظات</span>
                <h3 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '900', color: 'var(--text)' }}>
                  {allComplaints.length} شكوى
                </h3>
              </div>

              <div style={{ background: '#fef3c7', padding: '14px 18px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                <span style={{ fontSize: '12.5px', color: '#92400e', fontWeight: 'bold' }}>⏳ شكاوى بحاجة لرد / تعقيب</span>
                <h3 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '900', color: '#b45309' }}>
                  {pendingComplaintsCount} بانتظار الرد
                </h3>
              </div>

              <div style={{ background: '#dcfce7', padding: '14px 18px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: 'bold' }}>💬 تم الرد والمتابعة</span>
                <h3 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '900', color: '#15803d' }}>
                  {resolvedComplaintsCount} شكوى
                </h3>
              </div>

              <div style={{ background: '#f1f5f9', padding: '14px 18px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '12.5px', color: '#475569' }}>🔒 شكاوى مغلقة ومحسومة</span>
                <h3 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '900', color: '#334155' }}>
                  {closedComplaintsCount} شكوى
                </h3>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <input
                type="text"
                placeholder="🔍 بحث باسم الموظف أو موضوع الشكوى..."
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px' }}
              />

              <select
                value={complaintFilterStatus}
                onChange={(e) => setComplaintFilterStatus(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold', fontSize: '13px' }}
              >
                <option value="all">📂 جميع الحالات</option>
                <option value="pending">⏳ بحاجة لرد (جديدة / تعقيب)</option>
                <option value="resolved">✅ تم الرد والمتابعة</option>
                <option value="closed">🔒 مغلقة ومحسومة</option>
              </select>

              <select
                value={complaintBranchFilter}
                onChange={(e) => setComplaintBranchFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold', fontSize: '13px' }}
              >
                <option value="all">🏢 جميع الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Complaints List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredComplaints.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  🎉 لا توجد شكاوى مطابقة للبحث أو التصفية الحالية.
                </div>
              ) : (
                filteredComplaints.map((comp) => {
                  const empObj = employees.find(e => String(e.id) === String(comp.employeeId));
                  const branchObj = branches.find(b => b.id === (comp.branchId || empObj?.branchId));
                  const replies = comp.replies || (comp.adminReply ? [{ authorRole: 'الإدارة العليا', content: comp.adminReply, createdAt: comp.adminRepliedAt }] : []);

                  const isPending = comp.status === 'pending' || comp.status === 'pending_admin' || !comp.adminApproved;
                  const isResolved = comp.status === 'resolved';
                  const isClosed = comp.status === 'closed';

                  return (
                    <div key={comp.id} className="card" style={{ padding: '20px', borderRadius: '14px', border: isPending ? '2px solid #fdba74' : '1px solid var(--border)', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      {/* Complaint Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fee2e2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' }}>
                            {empObj?.name?.charAt(0) || 'م'}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong style={{ fontSize: '15px', color: '#1e293b' }}>
                                {comp.employeeName || empObj?.name || 'موظف'}
                              </strong>
                              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                ({comp.employeeCode || empObj?.code || '—'})
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                              💼 {empObj?.jobTitle || 'كادر'} • 📍 {branchObj?.name ? `فرع ${branchObj.name}` : 'الفرع الرئيسي'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {isPending ? (
                            <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', padding: '4px 12px', borderRadius: '8px', fontWeight: 'bold' }}>
                              ⏳ بانتظار رد الإدارة
                            </span>
                          ) : isResolved ? (
                            <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: '8px', fontWeight: 'bold' }}>
                              ✅ تم الرد والمتابعة
                            </span>
                          ) : (
                            <span className="badge badge-secondary" style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '8px', fontWeight: 'bold' }}>
                              🔒 شكوى مغلقة
                            </span>
                          )}

                          <span style={{ fontSize: '12px', color: 'var(--muted)', background: '#f8fafc', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            🕒 {comp.createdAt ? new Date(comp.createdAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : (comp.date || '—')}
                          </span>
                        </div>
                      </div>

                      {/* Complaint Subject & Original Details */}
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '14px 16px', borderRadius: '10px', marginBottom: '14px' }}>
                        <h4 style={{ margin: '0 0 6px', color: '#9a3412', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          📌 موضوع الشكوى: {comp.subject || 'شكوى عامة'}
                        </h4>
                        <div style={{ color: '#334155', fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {comp.details || comp.reason || 'لا تفاصيل مضافة'}
                        </div>
                      </div>

                      {/* Interactive Conversation Stream (Threaded Replies) */}
                      {replies.length > 0 && (
                        <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                          <h5 style={{ margin: '0 0 10px', color: '#334155', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            💬 سلسلة الردود والمحادثة المتبادلة ({replies.length}):
                          </h5>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {replies.map((rep, rIdx) => {
                              const isAdmin = rep.authorRole === 'الإدارة العليا' || rep.authorId === 'admin';
                              return (
                                <div
                                  key={rIdx}
                                  style={{
                                    alignSelf: isAdmin ? 'flex-start' : 'flex-end',
                                    maxWidth: '85%',
                                    background: isAdmin ? '#f0fdf4' : '#eff6ff',
                                    border: `1px solid ${isAdmin ? '#bbf7d0' : '#bfdbfe'}`,
                                    padding: '12px 14px',
                                    borderRadius: '10px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: '4px' }}>
                                    <strong style={{ fontSize: '12.5px', color: isAdmin ? '#166534' : '#1e40af' }}>
                                      {isAdmin ? '🏥 رد الإدارة العليا الرسمي' : `👤 تعقيب الموظف (${rep.authorRole || comp.employeeName})`}
                                    </strong>
                                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                      {rep.createdAt ? new Date(rep.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '13.5px', color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {rep.content}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Admin Reply & Action Box */}
                      <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
                            ✍️ كتابة رد رسمي من الإدارة العليا للموظف:
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>الحالة بعد الرد:</span>
                            <select
                              value={complaintStatusChoice[comp.id] || 'resolved'}
                              onChange={(e) => setComplaintStatusChoice((prev) => ({ ...prev, [comp.id]: e.target.value }))}
                              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: 'bold' }}
                            >
                              <option value="resolved">✅ تم الرد والمتابعة</option>
                              <option value="pending_admin">🟡 قيد المتابعة</option>
                              <option value="closed">🔒 إغلاق الشكوى</option>
                            </select>
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          placeholder="اكتب رد وتوجيهات الإدارة العليا الرسمية..."
                          value={complaintReplyText[comp.id] || ''}
                          onChange={(e) => setComplaintReplyText((prev) => ({ ...prev, [comp.id]: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                          {!isClosed && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '12.5px', padding: '6px 12px', border: '1px solid #cbd5e1' }}
                              onClick={() => handleChangeComplaintStatus(comp.id, 'closed')}
                            >
                              🔒 إغلاق الشكوى
                            </button>
                          )}
                          {isClosed && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '12.5px', padding: '6px 12px', border: '1px solid #cbd5e1' }}
                              onClick={() => handleChangeComplaintStatus(comp.id, 'resolved')}
                            >
                              🔓 إعادة فتح الشكوى
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ padding: '7px 18px', fontSize: '13px' }}
                            onClick={() => handleSendAdminReply(comp)}
                          >
                            💬 إرسال الرد للموظف وتحديث الحالة
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

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
                  {employees.filter(isEmployeeActive).map((e) => (
                    <option key={e.id} value={e.id}>
                      {getEmpDisplayName(e)} (كود: {e.code} - {e.jobTitle})
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
                        👤 الموظف: {emp ? getEmpDisplayName(emp) : (ev.employeeName || 'غير محدد')} ({ev.employeeCode || emp?.code})
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
          <div className="modal-content card" style={{ maxWidth: '1050px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
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
