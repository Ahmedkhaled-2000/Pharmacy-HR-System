import React, { useState, useMemo } from 'react';
import { getRealTodayStr, getEmpDisplayName } from '../../utils/formatters';
import { getJobsList } from '../../utils/jobsHelper';

export default function AdminDirectivesModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedDirectiveId, setExpandedDirectiveId] = useState(null);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('urgent'); // 'urgent' | 'normal'
  const [scope, setScope] = useState('all'); // 'all' | 'branch' | 'job' | 'employee'
  const [targetBranchId, setTargetBranchId] = useState('');
  const [targetJobTitle, setTargetJobTitle] = useState('');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [requireKioskConfirm, setRequireKioskConfirm] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const branches = state.branches || [];
  const jobs = getJobsList(state);
  const employees = (state.employees || []).filter(e => e.status !== 'تم الاستقالة' && e.is_active !== false);
  const allDirectives = state.adminDirectives || [];

  const activeDirectives = useMemo(() => {
    return allDirectives.filter(d => d.status !== 'archived').sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [allDirectives]);

  const archivedDirectives = useMemo(() => {
    return allDirectives.filter(d => d.status === 'archived').sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [allDirectives]);

  // Compute targeted employees for a directive
  const getTargetedEmployees = (d) => {
    if (d.scope === 'employee') {
      return employees.filter(e => String(e.id) === String(d.targetEmployeeId));
    }
    if (d.scope === 'branch') {
      const bId = String(d.targetBranchId);
      return employees.filter(e => String(e.branchId) === bId || (e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === bId)));
    }
    if (d.scope === 'job') {
      const jTitle = String(d.targetJobTitle || '').trim().toLowerCase();
      return employees.filter(e => String(e.jobTitle || '').trim().toLowerCase() === jTitle);
    }
    return employees;
  };

  // Handle Create Directive
  const handleCreateDirective = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showToast?.('⚠️ يرجى كتابة عنوان ونص التعليمات');
      return;
    }
    if (scope === 'branch' && !targetBranchId) {
      showToast?.('⚠️ يرجى تحديد الفرع المستهدف');
      return;
    }
    if (scope === 'job' && !targetJobTitle) {
      showToast?.('⚠️ يرجى اختيار الوظيفة / المسمى الوظيفي المستهدف');
      return;
    }
    if (scope === 'employee' && !targetEmployeeId) {
      showToast?.('⚠️ يرجى تحديد الموظف المستهدف');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetBranch = branches.find(b => String(b.id) === String(targetBranchId));
      const targetEmp = employees.find(e => String(e.id) === String(targetEmployeeId));

      const newDirective = {
        id: 'dir_' + Date.now(),
        title: title.trim(),
        content: content.trim(),
        priority,
        scope,
        targetBranchId: scope === 'branch' ? targetBranchId : null,
        targetBranchName: targetBranch ? targetBranch.name : null,
        targetJobTitle: scope === 'job' ? targetJobTitle : null,
        targetEmployeeId: scope === 'employee' ? targetEmployeeId : null,
        targetEmployeeName: targetEmp ? targetEmp.name : null,
        targetEmployeeCode: targetEmp ? targetEmp.code : null,
        requireKioskConfirm,
        status: 'active',
        readConfirmations: [], // Array of { employeeId, employeeName, employeeCode, confirmedAt }
        createdAt: new Date().toISOString(),
        date: getRealTodayStr()
      };

      // Notification for target users
      const notifRole = scope === 'branch' ? 'branch' : scope === 'employee' ? 'employee' : 'all_employees';
      const newNotif = {
        id: 'notif_dir_' + Date.now(),
        type: 'broadcast',
        targetRole: notifRole,
        targetEmployeeId: scope === 'employee' ? targetEmployeeId : null,
        branchId: scope === 'branch' ? targetBranchId : null,
        targetJobTitle: scope === 'job' ? targetJobTitle : null,
        title: `📢 ${priority === 'urgent' ? 'عاجل وهام: ' : ''}تعليمات إدارية جديدة: ${title.trim()}`,
        message: content.trim().slice(0, 140) + '...',
        linkTab: 'dashboard',
        date: getRealTodayStr(),
        timestamp: new Date().toISOString(),
        read: false
      };

      const updatedDirectives = [newDirective, ...allDirectives];
      const updatedState = {
        ...state,
        adminDirectives: updatedDirectives,
        notifications: [newNotif, ...(state.notifications || [])]
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('✅ تم بث التعليمات الإدارية وتفعيل الرقابة عليها بنجاح');
      setShowAddModal(false);
      setTitle('');
      setContent('');
      setPriority('urgent');
      setScope('all');
      setTargetBranchId('');
      setTargetJobTitle('');
      setTargetEmployeeId('');
    } catch {
      showToast?.('❌ حدث خطأ أثناء حفظ التعليمات');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Restore & Retarget Modal State
  const [restoringDirective, setRestoringDirective] = useState(null);
  const [restoreTitle, setRestoreTitle] = useState('');
  const [restoreContent, setRestoreContent] = useState('');
  const [restorePriority, setRestorePriority] = useState('urgent');
  const [restoreScope, setRestoreScope] = useState('all');
  const [restoreTargetBranchId, setRestoreTargetBranchId] = useState('');
  const [restoreTargetJobTitle, setRestoreTargetJobTitle] = useState('');
  const [restoreTargetEmployeeId, setRestoreTargetEmployeeId] = useState('');
  const [restoreRequireKiosk, setRestoreRequireKiosk] = useState(true);
  const [restoreResetConfirmations, setRestoreResetConfirmations] = useState(true);
  const [restoreSendNotif, setRestoreSendNotif] = useState(true);

  // Archive / Complete Directive (Strictly requires 100% of employees to have read)
  const handleToggleArchive = async (directiveId, toArchive = true) => {
    const directive = allDirectives.find(d => d.id === directiveId);
    if (!directive) return;

    if (toArchive) {
      const targeted = getTargetedEmployees(directive);
      const confirmedIds = new Set((directive.readConfirmations || []).map(c => String(c.employeeId)));
      const pendingCount = targeted.filter(e => !confirmedIds.has(String(e.id))).length;

      if (pendingCount > 0) {
        showToast?.(`⚠️ لا يمكن أرشفة التعليمات إلا بعد قراءتها والموافقة عليها من جميع الموظفين المستهدفين! (المتبقي: ${pendingCount} من إجمالي ${targeted.length} موظف لم يقرأوا بعد)`);
        return;
      }
    } else {
      openRestoreModal(directive);
      return;
    }

    const updated = allDirectives.map(d => {
      if (d.id === directiveId) {
        return { ...d, status: toArchive ? 'archived' : 'active', archivedAt: toArchive ? new Date().toISOString() : null };
      }
      return d;
    });
    const updatedState = { ...state, adminDirectives: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(toArchive ? '📁 تم نقل التعليمات إلى الأرشيف لاكتمال قراءتها من الجميع' : '🔄 تم استعادة وتنشيط التعليمات');
  };

  // Open Restore & Retarget Modal
  const openRestoreModal = (d) => {
    setRestoringDirective(d);
    setRestoreTitle(d.title || '');
    setRestoreContent(d.content || '');
    setRestorePriority(d.priority || 'urgent');
    setRestoreScope(d.scope || 'all');
    setRestoreTargetBranchId(d.targetBranchId || '');
    setRestoreTargetJobTitle(d.targetJobTitle || '');
    setRestoreTargetEmployeeId(d.targetEmployeeId || '');
    setRestoreRequireKiosk(d.requireKioskConfirm !== false);
    setRestoreResetConfirmations(true);
    setRestoreSendNotif(true);
  };

  // Handle Confirm Restore & Retarget
  const handleConfirmRestore = async (e) => {
    e.preventDefault();
    if (!restoringDirective) return;
    if (!restoreTitle.trim() || !restoreContent.trim()) {
      showToast?.('⚠️ يرجى كتابة عنوان ونص التعليمات');
      return;
    }
    if (restoreScope === 'branch' && !restoreTargetBranchId) {
      showToast?.('⚠️ يرجى تحديد الفرع المستهدف');
      return;
    }
    if (restoreScope === 'job' && !restoreTargetJobTitle) {
      showToast?.('⚠️ يرجى اختيار الوظيفة / المسمى الوظيفي المستهدف');
      return;
    }
    if (restoreScope === 'employee' && !restoreTargetEmployeeId) {
      showToast?.('⚠️ يرجى تحديد الموظف المستهدف');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetBranch = branches.find(b => String(b.id) === String(restoreTargetBranchId));
      const targetEmp = employees.find(e => String(e.id) === String(restoreTargetEmployeeId));

      const updated = allDirectives.map(d => {
        if (d.id === restoringDirective.id) {
          return {
            ...d,
            title: restoreTitle.trim(),
            content: restoreContent.trim(),
            priority: restorePriority,
            scope: restoreScope,
            targetBranchId: restoreScope === 'branch' ? restoreTargetBranchId : null,
            targetBranchName: targetBranch ? targetBranch.name : null,
            targetJobTitle: restoreScope === 'job' ? restoreTargetJobTitle : null,
            targetEmployeeId: restoreScope === 'employee' ? restoreTargetEmployeeId : null,
            targetEmployeeName: targetEmp ? targetEmp.name : null,
            targetEmployeeCode: targetEmp ? targetEmp.code : null,
            requireKioskConfirm: restoreRequireKiosk,
            status: 'active',
            archivedAt: null,
            restoredAt: new Date().toISOString(),
            readConfirmations: restoreResetConfirmations ? [] : (d.readConfirmations || [])
          };
        }
        return d;
      });

      let updatedNotifications = state.notifications || [];
      if (restoreSendNotif) {
        const notifRole = restoreScope === 'branch' ? 'branch' : restoreScope === 'employee' ? 'employee' : 'all_employees';
        const newNotif = {
          id: 'notif_dir_' + Date.now(),
          type: 'broadcast',
          targetRole: notifRole,
          targetEmployeeId: restoreScope === 'employee' ? restoreTargetEmployeeId : null,
          branchId: restoreScope === 'branch' ? restoreTargetBranchId : null,
          targetJobTitle: restoreScope === 'job' ? restoreTargetJobTitle : null,
          title: `📢 ${restorePriority === 'urgent' ? 'عاجل وهام: ' : ''}تعليمات إدارية: ${restoreTitle.trim()}`,
          message: restoreContent.trim().slice(0, 140) + '...',
          linkTab: 'dashboard',
          date: getRealTodayStr(),
          timestamp: new Date().toISOString(),
          read: false
        };
        updatedNotifications = [newNotif, ...updatedNotifications];
      }

      const updatedState = {
        ...state,
        adminDirectives: updated,
        notifications: updatedNotifications
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('✅ تم استعادة وإعادة توجيه التعليمات الإدارية وتفعيلها بنجاح');
      setRestoringDirective(null);
      setActiveTab('active');
    } catch {
      showToast?.('❌ حدث خطأ أثناء استعادة التعليمات');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Directive
  const handleDeleteDirective = async (directiveId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه التعليمات نهائياً؟')) return;
    const updated = allDirectives.filter(d => d.id !== directiveId);
    const updatedState = { ...state, adminDirectives: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف التعليمات بنجاح');
  };

  return (
    <div className="card fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>📢</span>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
              تعليمات وتوجيهات الإدارة العليا
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            بث التعليمات والقرارات الإدارية للموظفين والفروع، واشتراط قراءتها والموافقة عليها قبل البصمة
          </p>
        </div>

        <button
          type="button"
          className="btn btn-start"
          onClick={() => setShowAddModal(true)}
          style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', padding: '10px 20px', fontSize: '13.5px', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>➕</span> إصدار تعليمات جديدة
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'active' ? 'btn-start' : 'btn-ghost'}`}
          onClick={() => setActiveTab('active')}
          style={{ borderRadius: '10px 10px 0 0', padding: '9px 18px', fontSize: '13.5px' }}
        >
          🟢 التعليمات النشطة والمفعلة ({activeDirectives.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'archived' ? 'btn-start' : 'btn-ghost'}`}
          onClick={() => setActiveTab('archived')}
          style={{ borderRadius: '10px 10px 0 0', padding: '9px 18px', fontSize: '13.5px' }}
        >
          📁 تعليمات تم قراءتها / الأرشيف ({archivedDirectives.length})
        </button>
      </div>

      {/* Directives List */}
      {((activeTab === 'active' ? activeDirectives : archivedDirectives).length === 0) ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
          <p style={{ fontSize: '14px', margin: 0 }}>
            {activeTab === 'active' ? 'لا توجد تعليمات إدارية نشطة حالياً.' : 'الأرشيف فارغ.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {(activeTab === 'active' ? activeDirectives : archivedDirectives).map((d) => {
            const targeted = getTargetedEmployees(d);
            const confirmedIds = new Set((d.readConfirmations || []).map(c => String(c.employeeId)));
            const confirmedList = d.readConfirmations || [];
            const pendingList = targeted.filter(e => !confirmedIds.has(String(e.id)));
            const isExpanded = expandedDirectiveId === d.id;
            const completionPct = targeted.length > 0 ? Math.round((confirmedList.length / targeted.length) * 100) : 0;

            return (
              <div
                key={d.id}
                style={{
                  background: '#ffffff',
                  border: `1.5px solid ${d.priority === 'urgent' ? '#fca5a5' : '#cbd5e1'}`,
                  borderRadius: '14px',
                  padding: '18px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}
              >
                {/* Directive Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '18px' }}>{d.priority === 'urgent' ? '🚨' : '📌'}</span>
                      <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#0f172a' }}>
                        {d.title}
                      </h3>
                      {d.priority === 'urgent' ? (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800 }}>
                          عاجل وهام
                        </span>
                      ) : (
                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                          عادي
                        </span>
                      )}
                      
                      {/* Scope Badge */}
                      <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                        {d.scope === 'all' && '🌐 تعميم لكافة الموظفين والفروع'}
                        {d.scope === 'branch' && `🏢 فرع: ${d.targetBranchName || 'فرع محدد'}`}
                        {d.scope === 'job' && `💼 كادر / وظيفة: ${d.targetJobTitle || 'وظيفة محددة'}`}
                        {d.scope === 'employee' && `👤 موظف: ${d.targetEmployeeName || 'موظف محدد'}`}
                      </span>

                      {d.requireKioskConfirm && (
                        <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                          🔒 إلزامية في الكشك قبل البصمة
                        </span>
                      )}

                      {/* Incomplete read warning badge in archive tab */}
                      {activeTab === 'archived' && completionPct < 100 && (
                        <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                          ⚠️ غير مكتمل القراءة ({confirmedList.length}/{targeted.length}) — اضغط استعادة لإعادة التوجيه
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                      تاريخ الإصدار: <strong>{d.date || d.createdAt?.slice(0, 10)}</strong>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setExpandedDirectiveId(isExpanded ? null : d.id)}
                      style={{ fontSize: '12.5px', padding: '5px 12px', fontWeight: 700 }}
                    >
                      {isExpanded ? 'إخفاء سجل القراءة ▲' : `سجل القراءة (${confirmedList.length}/${targeted.length}) ▼`}
                    </button>
                    {activeTab === 'active' ? (
                      completionPct === 100 ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleToggleArchive(d.id, true)}
                          title="اكتملت القراءة من جميع الموظفين — أرشفة التعليمات الآن"
                          style={{ fontSize: '12.5px', padding: '5px 12px', color: '#059669', borderColor: '#10b981', background: '#ecfdf5', fontWeight: 800 }}
                        >
                          📁 أرشفة (مكتمل)
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => showToast?.(`⚠️ لا يمكن أرشفة التعليمات إلا بعد قراءتها والموافقة عليها من جميع الموظفين المستهدفين! (متبقي ${pendingList.length} من أصل ${targeted.length} موظف لم يقرأوا بعد)`)}
                          title={`قيد الانتظار: لم يقرأها الجميع بعد (${pendingList.length} موظف متبقي)`}
                          style={{ fontSize: '12px', padding: '5px 12px', color: '#64748b', background: '#f1f5f9', cursor: 'not-allowed', border: '1px dashed #cbd5e1' }}
                        >
                          ⏳ بانتظار اكتمال القراءة ({confirmedList.length}/${targeted.length})
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="btn btn-start"
                        onClick={() => openRestoreModal(d)}
                        title="استعادة وإعادة توجيه التعليمات الإدارية"
                        style={{ fontSize: '12.5px', padding: '5px 14px', fontWeight: 800, background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}
                      >
                        🔄 استعادة وتوجيه
                      </button>
                    )}
                    <button
                      type="button"
                      className="del-btn"
                      onClick={() => handleDeleteDirective(d.id)}
                      title="حذف نهائي"
                      style={{ fontSize: '12px', padding: '5px 10px' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Directive Content Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', margin: '12px 0', fontSize: '13.5px', color: '#334155', lineHeight: '1.7', whiteSpace: 'pre-line' }}>
                  {d.content}
                </div>

                {/* Progress Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ background: completionPct === 100 ? '#10b981' : '#0d9488', width: `${completionPct}%`, height: '100%', borderRadius: '999px', transition: 'width 0.3s' }}></div>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f766e', minWidth: '85px', textAlign: 'left' }}>
                    {confirmedList.length} من {targeted.length} ({completionPct}%)
                  </span>
                </div>

                {/* Expanded Read Log Details */}
                {isExpanded && (
                  <div style={{ marginTop: '16px', borderTop: '1.5px dashed #cbd5e1', paddingTop: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                      
                      {/* Confirmed List */}
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13.5px', color: '#166534', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>✅</span> موظفون تمت القراءة والموافقة ({confirmedList.length})
                        </h4>
                        {confirmedList.length === 0 ? (
                          <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '8px' }}>
                            لم يقم أي موظف بالموافقة بعد.
                          </div>
                        ) : (
                          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #bbf7d0', borderRadius: '8px', background: '#f0fdf4' }}>
                            {confirmedList.map((c, idx) => (
                              <div key={idx} style={{ padding: '6px 10px', borderBottom: '1px solid #dcfce7', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <strong style={{ color: '#0f172a' }}>{c.employeeName}</strong>
                                  <span style={{ color: '#64748b', marginRight: '6px' }}>(كود: {c.employeeCode})</span>
                                </div>
                                <span style={{ color: '#15803d', fontSize: '11px', direction: 'ltr' }}>
                                  {new Date(c.confirmedAt).toLocaleDateString('ar-EG')} {new Date(c.confirmedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Pending List */}
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13.5px', color: '#991b1b', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>⏳</span> موظفون في انتظار القراءة ({pendingList.length})
                        </h4>
                        {pendingList.length === 0 ? (
                          <div style={{ fontSize: '12px', color: '#166534', fontWeight: 700, padding: '8px' }}>
                            🎉 اكتملت قراءة كافة الكوادر المستهدفة!
                          </div>
                        ) : (
                          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #fecaca', borderRadius: '8px', background: '#fef2f2' }}>
                            {pendingList.map((e, idx) => (
                              <div key={idx} style={{ padding: '6px 10px', borderBottom: '1px solid #fee2e2', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <strong style={{ color: '#0f172a' }}>{getEmpDisplayName(e)}</strong>
                                  <span style={{ color: '#64748b', marginRight: '6px' }}>({e.jobTitle || 'موظف'})</span>
                                </div>
                                <span style={{ color: '#b91c1c', fontSize: '11px' }}>
                                  لم يقرأ بعد
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL: CREATE DIRECTIVE ── */}
      {showAddModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div
            className="modal-card fade-in"
            style={{
              maxWidth: '620px',
              width: '95%',
              borderRadius: '16px',
              border: '2px solid #0d9488',
              padding: '24px',
              background: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📢</span> إصدار تعليمات وتوجيهات إدارية جديدة
              </h3>
              <button type="button" className="icon-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateDirective} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>عنوان التوجيه / الموضوع *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: تعليمات الالتزام بزي العمل الرسمي وجرد الصندوق"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>درجة الأهمية:</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="urgent">🚨 عاجل وهام</option>
                    <option value="normal">📌 عادي / توجيه عام</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>النطاق والمستهدفون:</label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="all">🌐 تعميم لكافة الفروع والموظفين</option>
                    <option value="branch">🏢 فرع محدد فقط</option>
                    <option value="job">💼 وظيفة / مسمى وظيفي محدد</option>
                    <option value="employee">👤 موظف محدد فقط</option>
                  </select>
                </div>
              </div>

              {scope === 'branch' && (
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الفرع المستهدف *</label>
                  <select
                    value={targetBranchId}
                    onChange={(e) => setTargetBranchId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #0d9488' }}
                    required
                  >
                    <option value="">-- اختر الفرع --</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.branchCode})</option>
                    ))}
                  </select>
                </div>
              )}

              {scope === 'job' && (
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الوظيفة / المسمى الوظيفي المستهدف *</label>
                  <select
                    value={targetJobTitle}
                    onChange={(e) => setTargetJobTitle(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #0d9488' }}
                    required
                  >
                    <option value="">-- اختر المسمى الوظيفي --</option>
                    {jobs.map((j, idx) => {
                      const titleStr = typeof j === 'string' ? j : (j.title || j.name);
                      return (
                        <option key={idx} value={titleStr}>
                          {titleStr}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {scope === 'employee' && (
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الموظف المستهدف *</label>
                  <select
                    value={targetEmployeeId}
                    onChange={(e) => setTargetEmployeeId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #0d9488' }}
                    required
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{getEmpDisplayName(e)} ({e.code} — {e.jobTitle || 'موظف'})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>نص التعليمات والقرار الإداري التفصيلي *</label>
                <textarea
                  rows="4"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="اكتب بنود وتفاصيل التعليمات الإدارية بدقة..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', lineHeight: '1.6' }}
                  required
                />
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="chkKiosk"
                  checked={requireKioskConfirm}
                  onChange={(e) => setRequireKioskConfirm(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="chkKiosk" style={{ fontSize: '13px', fontWeight: 700, color: '#166534', cursor: 'pointer' }}>
                  🔒 إلزامية في الكشك الإلكتروني (حجب أزرار البصمة حتى يضغط الموظف "تمت القراءة والموافقة")
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-start"
                  disabled={isSubmitting}
                  style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', padding: '9px 24px' }}
                >
                  {isSubmitting ? 'جاري البث...' : '🚀 بث التعليمات وتفعيلها فوراً'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RESTORE & RETARGET DIRECTIVE ── */}
      {restoringDirective && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div
            className="modal-card fade-in"
            style={{
              maxWidth: '640px',
              width: '95%',
              borderRadius: '16px',
              border: '2px solid #0d9488',
              padding: '24px',
              background: '#fff',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>🔄</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    إعادة توجيه وتنشيط التعليمات الإدارية
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    تعديل نطاق المستهدفين وبدء دورة قراءة جديدة وإعادة البث
                  </span>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setRestoringDirective(null)}>✕</button>
            </div>

            {/* Previous Status Info */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '12.5px',
              color: '#475569',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div>
                <span>📊 حالة القراءة المسجلة سابقاً: </span>
                <strong style={{ color: '#0f766e' }}>
                  {restoringDirective.readConfirmations?.length || 0} موظف أكدوا القراءة
                </strong>
              </div>
              <div style={{ color: '#64748b', fontSize: '11.5px' }}>
                تاريخ الإصدار الأصلي: {restoringDirective.date || restoringDirective.createdAt?.slice(0, 10)}
              </div>
            </div>

            <form onSubmit={handleConfirmRestore} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>عنوان التوجيه / الموضوع *</label>
                <input
                  type="text"
                  value={restoreTitle}
                  onChange={(e) => setRestoreTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>درجة الأهمية:</label>
                  <select
                    value={restorePriority}
                    onChange={(e) => setRestorePriority(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="urgent">🚨 عاجل وهام</option>
                    <option value="normal">📌 عادي / توجيه عام</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>إعادة تحديد نطاق المستهدفين:</label>
                  <select
                    value={restoreScope}
                    onChange={(e) => setRestoreScope(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #0d9488', fontWeight: 700 }}
                  >
                    <option value="all">🌐 تعميم لكافة الفروع والموظفين</option>
                    <option value="branch">🏢 فرع محدد فقط</option>
                    <option value="job">💼 وظيفة / مسمى وظيفي محدد</option>
                    <option value="employee">👤 موظف محدد فقط</option>
                  </select>
                </div>
              </div>

              {restoreScope === 'branch' && (
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الفرع المستهدف *</label>
                  <select
                    value={restoreTargetBranchId}
                    onChange={(e) => setRestoreTargetBranchId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #0d9488' }}
                    required
                  >
                    <option value="">-- اختر الفرع --</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.branchCode})</option>
                    ))}
                  </select>
                </div>
              )}

              {restoreScope === 'job' && (
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الوظيفة / المسمى الوظيفي المستهدف *</label>
                  <select
                    value={restoreTargetJobTitle}
                    onChange={(e) => setRestoreTargetJobTitle(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #0d9488' }}
                    required
                  >
                    <option value="">-- اختر المسمى الوظيفي --</option>
                    {jobs.map((j, idx) => {
                      const titleStr = typeof j === 'string' ? j : (j.title || j.name);
                      return (
                        <option key={idx} value={titleStr}>
                          {titleStr}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {restoreScope === 'employee' && (
                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الموظف المستهدف *</label>
                  <select
                    value={restoreTargetEmployeeId}
                    onChange={(e) => setRestoreTargetEmployeeId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #0d9488' }}
                    required
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{getEmpDisplayName(e)} ({e.code} — {e.jobTitle || 'موظف'})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>نص التعليمات والقرار الإداري التفصيلي *</label>
                <textarea
                  rows="4"
                  value={restoreContent}
                  onChange={(e) => setRestoreContent(e.target.value)}
                  placeholder="اكتب بنود وتفاصيل التعليمات الإدارية بدقة..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', lineHeight: '1.6' }}
                  required
                />
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="chkRestoreKiosk"
                    checked={restoreRequireKiosk}
                    onChange={(e) => setRestoreRequireKiosk(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chkRestoreKiosk" style={{ fontSize: '13px', fontWeight: 700, color: '#166534', cursor: 'pointer' }}>
                    🔒 إلزامية في الكشك الإلكتروني (حجب أزرار البصمة حتى يضغط الموظف "تمت القراءة والموافقة")
                  </label>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="chkResetConfirm"
                    checked={restoreResetConfirmations}
                    onChange={(e) => setRestoreResetConfirmations(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chkResetConfirm" style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', cursor: 'pointer' }}>
                    🔄 تصفير سجل القراءات السابق وإلزام جميع الموظفين المستهدفين بالقراءة من جديد (موصى به عند إعادة التوجيه)
                  </label>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="chkSendNotif"
                    checked={restoreSendNotif}
                    onChange={(e) => setRestoreSendNotif(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chkSendNotif" style={{ fontSize: '13px', fontWeight: 700, color: '#1e40af', cursor: 'pointer' }}>
                    🔔 إرسال إشعار فوري جديد في بوابة الموظف لإبلاغهم بالتعليمات
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setRestoringDirective(null)}>
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-start"
                  disabled={isSubmitting}
                  style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', padding: '9px 24px', fontWeight: 800 }}
                >
                  {isSubmitting ? 'جاري التنشيط...' : '🚀 تأكيد إعادة التوجيه والتنشيط الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
