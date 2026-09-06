import React, { useState, useMemo } from 'react';
import { getRealTodayStr, getEmpDisplayName } from '../../utils/formatters';

export default function BranchDirectivesModule({
  state,
  setState,
  saveState,
  showToast,
  currentBranch
}) {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedDirectiveId, setExpandedDirectiveId] = useState(null);

  // Form State for creating new directive
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('urgent'); // 'urgent' | 'normal'
  const [scope, setScope] = useState('all'); // 'all' | 'job' | 'employee'
  const [targetJobTitle, setTargetJobTitle] = useState('');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [requireKioskConfirm, setRequireKioskConfirm] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const branchId = currentBranch?.id;
  const branchName = currentBranch?.name || 'الفرع';

  // Filter employees strictly to current branch
  const branchEmployees = useMemo(() => {
    if (!branchId) return [];
    return (state.employees || []).filter(e => {
      if (e.status === 'تم الاستقالة' || e.is_active === false) return false;
      const matchesMain = String(e.branchId) === String(branchId);
      const matchesSecondary = e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === String(branchId));
      return matchesMain || matchesSecondary;
    });
  }, [state.employees, branchId]);

  // Extract jobs available among current branch employees
  const branchJobs = useMemo(() => {
    const set = new Set();
    branchEmployees.forEach(e => {
      const job = (e.jobTitle || '').trim();
      if (job) set.add(job);
    });
    return Array.from(set).sort();
  }, [branchEmployees]);

  // Directives for current branch
  const branchDirectives = useMemo(() => {
    if (!branchId) return [];
    return (state.branchDirectives || []).filter(d => String(d.branchId) === String(branchId));
  }, [state.branchDirectives, branchId]);

  const activeDirectives = useMemo(() => {
    return branchDirectives
      .filter(d => d.status !== 'archived')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [branchDirectives]);

  const archivedDirectives = useMemo(() => {
    return branchDirectives
      .filter(d => d.status === 'archived')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [branchDirectives]);

  // Compute targeted employees for a specific directive
  const getTargetedEmployees = (d) => {
    if (d.scope === 'employee') {
      return branchEmployees.filter(e => String(e.id) === String(d.targetEmployeeId));
    }
    if (d.scope === 'job') {
      const jTitle = String(d.targetJobTitle || '').trim().toLowerCase();
      return branchEmployees.filter(e => String(e.jobTitle || '').trim().toLowerCase() === jTitle);
    }
    return branchEmployees;
  };

  // Handle Create Directive
  const handleCreateDirective = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showToast?.('⚠️ يرجى إدخال عنوان ونص التعليمات');
      return;
    }
    if (scope === 'job' && !targetJobTitle) {
      showToast?.('⚠️ يرجى اختيار الوظيفة المستهدفة');
      return;
    }
    if (scope === 'employee' && !targetEmployeeId) {
      showToast?.('⚠️ يرجى اختيار الموظف المستهدف');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetEmp = branchEmployees.find(e => String(e.id) === String(targetEmployeeId));
      const managerEmp = (state.employees || []).find(e => e.id === currentBranch?.managerId);
      const managerName = managerEmp ? getEmpDisplayName(managerEmp) : 'مدير الفرع';

      const newDirective = {
        id: 'bdir_' + Date.now(),
        branchId: String(branchId),
        branchName: branchName,
        managerId: currentBranch?.managerId || null,
        managerName: managerName,
        title: title.trim(),
        content: content.trim(),
        priority,
        scope, // 'all' | 'job' | 'employee'
        targetJobTitle: scope === 'job' ? targetJobTitle : null,
        targetEmployeeId: scope === 'employee' ? targetEmployeeId : null,
        targetEmployeeName: targetEmp ? getEmpDisplayName(targetEmp) : null,
        targetEmployeeCode: targetEmp ? targetEmp.code : null,
        requireKioskConfirm,
        status: 'active',
        readConfirmations: [], // [{ employeeId, employeeName, employeeCode, confirmedAt }]
        createdAt: new Date().toISOString(),
        date: getRealTodayStr()
      };

      // Notification for target users
      const newNotif = {
        id: 'notif_bdir_' + Date.now(),
        type: 'broadcast',
        targetRole: 'employee',
        targetEmployeeId: scope === 'employee' ? targetEmployeeId : null,
        branchId: String(branchId),
        targetJobTitle: scope === 'job' ? targetJobTitle : null,
        title: `📢 ${priority === 'urgent' ? 'عاجل وهام: ' : ''}تعليمات من مدير الفرع (${branchName}): ${title.trim()}`,
        message: content.trim().slice(0, 140) + '...',
        linkTab: 'dashboard',
        date: getRealTodayStr(),
        timestamp: new Date().toISOString(),
        read: false
      };

      const updatedBranchDirectives = [newDirective, ...(state.branchDirectives || [])];
      const updatedState = {
        ...state,
        branchDirectives: updatedBranchDirectives,
        notifications: [newNotif, ...(state.notifications || [])]
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('✅ تم إرسال وبث تعليمات مدير الفرع بنجاح');
      setTitle('');
      setContent('');
      setPriority('urgent');
      setScope('all');
      setTargetJobTitle('');
      setTargetEmployeeId('');
      setRequireKioskConfirm(true);
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      showToast?.('❌ حدث خطأ أثناء حفظ التعليمات');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle archive status
  const handleToggleArchive = async (directiveId) => {
    const updated = (state.branchDirectives || []).map(d => {
      if (d.id === directiveId) {
        const isArchiving = d.status !== 'archived';
        return {
          ...d,
          status: isArchiving ? 'archived' : 'active',
          archivedAt: isArchiving ? new Date().toISOString() : null
        };
      }
      return d;
    });

    const updatedState = { ...state, branchDirectives: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('تم تعديل حالة التعليمات بنجاح');
  };

  // Delete directive
  const handleDeleteDirective = async (directiveId) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا التوجيه نهائياً؟')) return;

    const updated = (state.branchDirectives || []).filter(d => d.id !== directiveId);
    const updatedState = { ...state, branchDirectives: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف التوجيه بنجاح');
  };

  // Compute Overall Stats
  const stats = useMemo(() => {
    const total = branchDirectives.length;
    const active = activeDirectives.length;
    const urgent = activeDirectives.filter(d => d.priority === 'urgent').length;

    let totalTargetedCount = 0;
    let totalConfirmedCount = 0;

    activeDirectives.forEach(d => {
      const targeted = getTargetedEmployees(d);
      totalTargetedCount += targeted.length;
      totalConfirmedCount += (d.readConfirmations || []).length;
    });

    const rate = totalTargetedCount > 0
      ? Math.round((totalConfirmedCount / totalTargetedCount) * 100)
      : 100;

    return { total, active, urgent, rate, totalTargetedCount, totalConfirmedCount };
  }, [branchDirectives, activeDirectives, branchEmployees]);

  return (
    <div className="branch-directives-module" style={{ padding: '20px', direction: 'rtl' }}>
      {/* 1. Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        padding: '20px 24px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#fff',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>📢</span>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>
              تعليمات وتوجيهات مدير الفرع ({branchName})
            </h2>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
            إصدار التوجيهات التشغيلية والتعليمات الميدانية لموظفي الفرع، مع الإلزام بالإقرار عليها في كشك البصمة عند إدخال الكود الوظيفي.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#fff',
            border: 'none',
            padding: '12px 22px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '14.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            transition: 'transform 0.15s ease'
          }}
        >
          <span>➕</span>
          <span>إصدار تعليمات جديدة لموظفي الفرع</span>
        </button>
      </div>

      {/* 2. Top Stats Overview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'var(--surface)',
          padding: '18px 20px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
        }}>
          <span style={{ fontSize: '28px', background: 'rgba(37, 99, 235, 0.12)', padding: '12px', borderRadius: '12px' }}>📋</span>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>إجمالي التعليمات الصادرة</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>{stats.total}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--surface)',
          padding: '18px 20px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
        }}>
          <span style={{ fontSize: '28px', background: 'rgba(16, 185, 129, 0.12)', padding: '12px', borderRadius: '12px' }}>🟢</span>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>التعليمات النشطة حالياً</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981' }}>{stats.active}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--surface)',
          padding: '18px 20px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
        }}>
          <span style={{ fontSize: '28px', background: 'rgba(239, 68, 68, 0.12)', padding: '12px', borderRadius: '12px' }}>🚨</span>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>تعليمات عاجلة وهامة</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#ef4444' }}>{stats.urgent}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--surface)',
          padding: '18px 20px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
        }}>
          <span style={{ fontSize: '28px', background: 'rgba(245, 158, 11, 0.12)', padding: '12px', borderRadius: '12px' }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>نسبة إقرار الطاقم النشط</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b' }}>{stats.rate}%</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {stats.totalConfirmedCount} من {stats.totalTargetedCount} إقرار
            </div>
          </div>
        </div>
      </div>

      {/* 3. Sub Tabs Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '2px solid var(--border)',
        marginBottom: '20px',
        paddingBottom: '8px'
      }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'active' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'active' ? '#fff' : 'var(--muted)',
            fontWeight: 800,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span>🟢 التعليمات النشطة</span>
          <span style={{
            background: activeTab === 'active' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
            padding: '2px 8px',
            borderRadius: '8px',
            fontSize: '12px'
          }}>
            {activeDirectives.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('archived')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'archived' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'archived' ? '#fff' : 'var(--muted)',
            fontWeight: 800,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span>📁 أرشيف التعليمات</span>
          <span style={{
            background: activeTab === 'archived' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
            padding: '2px 8px',
            borderRadius: '8px',
            fontSize: '12px'
          }}>
            {archivedDirectives.length}
          </span>
        </button>
      </div>

      {/* 4. Directives List View */}
      {((activeTab === 'active' ? activeDirectives : archivedDirectives).length === 0) ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'var(--surface)',
          borderRadius: '16px',
          border: '1px dashed var(--border)',
          color: 'var(--muted)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '14px' }}>
            {activeTab === 'active' ? '✨' : '📁'}
          </div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>
            {activeTab === 'active'
              ? 'لا توجد تعليمات نشطة حالياً لموظفي الفرع'
              : 'أرشيف التعليمات فارغ'}
          </h3>
          <p style={{ margin: 0, fontSize: '13.5px' }}>
            {activeTab === 'active'
              ? 'يمكنك إصدار توجيهات جديدة في أي وقت لتظهر لموظفيك عند تسجيل بصماتهم.'
              : 'التعليمات المؤرشفة والمنتهية ستظهر هنا.'}
          </p>
          {activeTab === 'active' && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                marginTop: '16px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '10px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ➕ إصدار أول توجيه الآن
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(activeTab === 'active' ? activeDirectives : archivedDirectives).map((dir) => {
            const targeted = getTargetedEmployees(dir);
            const confirmedCount = (dir.readConfirmations || []).length;
            const targetTotal = targeted.length;
            const percent = targetTotal > 0 ? Math.round((confirmedCount / targetTotal) * 100) : 100;
            const isExpanded = expandedDirectiveId === dir.id;
            const confirmedEmpIds = new Set((dir.readConfirmations || []).map(c => String(c.employeeId)));

            return (
              <div
                key={dir.id}
                style={{
                  background: 'var(--surface)',
                  borderRadius: '16px',
                  border: dir.priority === 'urgent' ? '2px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                  padding: '20px',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Directive Card Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {dir.priority === 'urgent' ? (
                      <span style={{
                        background: '#fee2e2',
                        color: '#b91c1c',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span>🚨</span> عاجل وهام
                      </span>
                    ) : (
                      <span style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span>📢</span> توجيه عام
                      </span>
                    )}

                    <span style={{
                      background: 'rgba(0,0,0,0.05)',
                      color: 'var(--text)',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      🎯 المستهدف: {
                        dir.scope === 'all'
                          ? 'كامل موظفي الفرع (' + targetTotal + ' موظف)'
                          : dir.scope === 'job'
                          ? `وظيفة (${dir.targetJobTitle})`
                          : `موظف محدد (${dir.targetEmployeeName})`
                      }
                    </span>

                    {dir.requireKioskConfirm && (
                      <span style={{
                        background: '#fef3c7',
                        color: '#b45309',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        📸 إقرار إلزامي في كشك البصمة
                      </span>
                    )}

                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      🗓️ {dir.date || (dir.createdAt ? dir.createdAt.split('T')[0] : '')}
                    </span>
                  </div>

                  {/* Actions buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleToggleArchive(dir.id)}
                      title={dir.status === 'archived' ? 'استعادة للتعليمات النشطة' : 'أرشفة التوجيه'}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        color: 'var(--text)'
                      }}
                    >
                      {dir.status === 'archived' ? '🔄 استعادة' : '📁 أرشفة'}
                    </button>

                    <button
                      onClick={() => handleDeleteDirective(dir.id)}
                      title="حذف نهائي"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      🗑️ حذف
                    </button>
                  </div>
                </div>

                {/* Directive Title & Content */}
                <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>
                  {dir.title}
                </h3>
                <div style={{
                  fontSize: '14px',
                  color: 'var(--text)',
                  whiteSpace: 'pre-line',
                  lineHeight: '1.6',
                  background: 'rgba(0,0,0,0.02)',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  marginBottom: '16px'
                }}>
                  {dir.content}
                </div>

                {/* Progress bar and details toggle */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  borderTop: '1px solid var(--border)',
                  paddingTop: '14px'
                }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      marginBottom: '6px',
                      fontWeight: 700
                    }}>
                      <span style={{ color: 'var(--muted)' }}>
                        نسبة إقرار موظفي الفرع:
                      </span>
                      <span style={{ color: percent === 100 ? '#10b981' : 'var(--primary)' }}>
                        {confirmedCount} من {targetTotal} موظف ({percent}%)
                      </span>
                    </div>
                    <div style={{
                      height: '8px',
                      background: 'rgba(0,0,0,0.08)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${percent}%`,
                        background: percent === 100
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                        borderRadius: '4px',
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedDirectiveId(isExpanded ? null : dir.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{isExpanded ? '🔼 إخفاء تفاصيل الإقرار' : '🔽 تفاصيل من قرأ ومن لم يقرأ'}</span>
                  </button>
                </div>

                {/* Expanded Employee Confirmation List */}
                {isExpanded && (
                  <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)'
                  }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '13.5px', fontWeight: 800 }}>
                      📋 سجل إقرار موظفي الفرع المستهدفين:
                    </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                      {targeted.map(emp => {
                        const isConfirmed = confirmedEmpIds.has(String(emp.id));
                        const confirmation = (dir.readConfirmations || []).find(c => String(c.employeeId) === String(emp.id));

                        return (
                          <div
                            key={emp.id}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              background: 'var(--surface)',
                              border: isConfirmed ? '1px solid rgba(16, 185, 129, 0.4)' : '1px dashed rgba(239, 68, 68, 0.4)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '12.5px'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                                {getEmpDisplayName(emp)}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {emp.jobTitle || 'موظف'} · كود: {emp.code}
                              </div>
                            </div>

                            {isConfirmed ? (
                              <div style={{ textAlign: 'left' }}>
                                <span style={{
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontWeight: 800,
                                  fontSize: '11px'
                                }}>
                                  ✅ تم الإقرار
                                </span>
                                {confirmation?.confirmedAt && (
                                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                                    {new Date(confirmation.confirmedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{
                                background: '#fee2e2',
                                color: '#b91c1c',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontWeight: 800,
                                fontSize: '11px'
                              }}>
                                ⏳ لم يقرأ بعد
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modal: Create New Branch Directive */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            border: '1px solid var(--border)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            direction: 'rtl'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), transparent)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>📢</span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                  إصدار تعليمات وتوجيهات لفرع ({branchName})
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: 'var(--muted)'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateDirective} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Title */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  عنوان التوجيه / التعليمات *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الالتزام بارتداء الزي الرسمي والبالطو الطبي خلال الشيفت"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Priority & Scope Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                    درجة الأهمية
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--text)',
                      fontSize: '13.5px'
                    }}
                  >
                    <option value="urgent">🚨 عاجل وهام</option>
                    <option value="normal">📢 توجيه عام</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                    نطاق الاستهداف بالفرع
                  </label>
                  <select
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value);
                      setTargetJobTitle('');
                      setTargetEmployeeId('');
                    }}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--text)',
                      fontSize: '13.5px'
                    }}
                  >
                    <option value="all">👥 كامل موظفي الفرع ({branchEmployees.length} موظف)</option>
                    <option value="job">👔 مسمى وظيفي محدد بالفرع</option>
                    <option value="employee">👤 موظف بعينه بالفرع</option>
                  </select>
                </div>
              </div>

              {/* Conditional Target: Job Title */}
              {scope === 'job' && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                    اختر الوظيفة المستهدفة بالفرع *
                  </label>
                  <select
                    required
                    value={targetJobTitle}
                    onChange={(e) => setTargetJobTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--text)',
                      fontSize: '13.5px'
                    }}
                  >
                    <option value="">-- اختر الوظيفة بالفرع --</option>
                    {branchJobs.map(job => (
                      <option key={job} value={job}>
                        {job} ({branchEmployees.filter(e => (e.jobTitle || '').trim() === job).length} موظف)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional Target: Employee */}
              {scope === 'employee' && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                    اختر الموظف المستهدف *
                  </label>
                  <select
                    required
                    value={targetEmployeeId}
                    onChange={(e) => setTargetEmployeeId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--text)',
                      fontSize: '13.5px'
                    }}
                  >
                    <option value="">-- اختر موظف من الفرع --</option>
                    {branchEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {getEmpDisplayName(emp)} ({emp.jobTitle || 'موظف'} - كود: {emp.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Content */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  نص التعليمات والتوجيهات *
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="اكتب التوجيهات بالتفصيل هنا، ستظهر للموظف المستهدف على شاشة البصمة ولا يمكنه تسجيل الحضور أو الانصراف إلا بعد قراءتها والإقرار عليها..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Kiosk Requirement Checkbox */}
              <div style={{
                background: 'rgba(37, 99, 235, 0.05)',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  id="requireKioskConfirmCheck"
                  checked={requireKioskConfirm}
                  onChange={(e) => setRequireKioskConfirm(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="requireKioskConfirmCheck" style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>
                  إلزام الإقرار في كشك البصمة الإلكترونية عند وضع كود الموظف
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '11px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '11px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  {isSubmitting ? 'جاري الإرسال...' : '📢 إرسال وبث التعليمات الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
