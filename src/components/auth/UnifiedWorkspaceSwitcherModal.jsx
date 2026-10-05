import React from 'react';

export default function UnifiedWorkspaceSwitcherModal({
  isOpen,
  onClose,
  employeeName = '',
  unifiedAccess,
  branches = [],
  onSelectWorkspace
}) {
  if (!isOpen) return null;

  const perms = unifiedAccess?.permissions || unifiedAccess || {};
  const availableWorkspaces = [];

  // 1. بوابته الشخصية بالـ HR
  if (perms.hrPersonalPortal?.enabled !== false) {
    availableWorkspaces.push({
      id: 'hr_portal',
      title: 'بوابتي الشخصية (HR Employee Portal)',
      icon: '👤',
      badge: 'الخدمات الذاتية',
      desc: 'سجل الحضور والانصراف، الورديات، تفاصيل مسير الراتب الشهري، وتقديم طلبات الإجازات والأذونات والسلف.',
      gradient: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
      lightBg: 'rgba(13, 148, 136, 0.08)',
      borderColor: 'rgba(13, 148, 136, 0.3)'
    });
  }

  // 2. صفحة مدير الفرع
  if (perms.branchManager?.enabled) {
    const assignedBranchId = perms.branchManager.assignedBranchId;
    const branchObj = branches.find(b => String(b.id) === String(assignedBranchId));
    const branchName = branchObj?.name || 'الفرع المخصص';

    availableWorkspaces.push({
      id: 'branch_manager',
      title: `لوحة مدير الفرع (${branchName})`,
      icon: '🏢',
      badge: `مدير فرع: ${branchName}`,
      desc: `متابعة شفتات وجداول موظفي ${branchName}، الحضور اللحظي، واعتماد وتمرير طلبات الفرع للإدارة.`,
      branch: branchObj,
      gradient: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
      lightBg: 'rgba(147, 51, 234, 0.08)',
      borderColor: 'rgba(147, 51, 234, 0.3)'
    });
  }

  // 3. صفحة الإدارة العليا
  if (perms.topManagement?.enabled) {
    const allowed = perms.topManagement.allowedModules || ['dashboard'];
    availableWorkspaces.push({
      id: 'top_management',
      title: 'لوحة الإدارة العليا (Top Management)',
      icon: '🛡️',
      badge: `مصرح لـ (${allowed.length}) شاشات`,
      desc: 'لوحة القيادة، شؤون الموظفين، واعتمادات ومتابعة عمليات المنظومة وفق الصلاحيات الممنوحة لك.',
      allowedModules: allowed,
      gradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
      lightBg: 'rgba(234, 88, 12, 0.08)',
      borderColor: 'rgba(234, 88, 12, 0.3)'
    });
  }

  // 4. نظام نواقص الأدوية والمشتريات OutStock
  if (perms.outstockHandling?.enabled) {
    const role = perms.outstockHandling.role || 'branch';
    const bId = perms.outstockHandling.assignedBranchId;
    const bObj = branches.find(b => String(b.id) === String(bId));
    const roleLabel = role === 'procurement_manager' ? 'مدير مشتريات' : role === 'cosmetics_officer' ? 'مسؤول مستحضرات تجميل 💄' : role === 'procurement_team' ? 'فريق مشتريات' : `صيدلية (${bObj?.name || 'الفرع'})`;

    availableWorkspaces.push({
      id: 'outstock',
      title: 'نظام نواقص وطلبات أدوية العملاء (OutStock)',
      icon: '💊',
      badge: roleLabel,
      desc: `تسجيل ومتابعة طلبيات أدوية المرضى والفروع ومتابعة التوريد بصفة (${roleLabel}).`,
      role,
      branch: bObj,
      gradient: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
      lightBg: 'rgba(225, 29, 72, 0.08)',
      borderColor: 'rgba(225, 29, 72, 0.3)'
    });
  }

  // 5. منظومة الحسابات العامة
  if (perms.accountsSystem?.enabled) {
    availableWorkspaces.push({
      id: 'accounts',
      title: 'منظومة الحسابات العامة (ERP)',
      icon: '🏛️',
      badge: 'المالية والحسابات',
      desc: 'شجرة الحسابات، قيود اليومية، سندات الصرف والقبض، ومتابعة القوائم المالية.',
      gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      lightBg: 'rgba(5, 150, 105, 0.08)',
      borderColor: 'rgba(5, 150, 105, 0.3)'
    });
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Cairo, sans-serif'
    }}>
      <div style={{
        background: 'var(--surface, #ffffff)',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '94vh',
        overflowY: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        border: '1px solid var(--border, #e2e8f0)',
        padding: '30px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px', position: 'relative' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(13, 148, 136, 0.1)',
            color: 'var(--primary, #0d9488)',
            padding: '3px 12px',
            borderRadius: '99px',
            fontSize: '11.5px',
            fontWeight: 800,
            marginBottom: '8px'
          }}>
            <span>🔐</span>
            <span>بوابة الصلاحيات والصفحات المتاحة · Workspace Selector</span>
          </div>

          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: 'var(--text, #0f172a)' }}>
            مرحباً بك يا {employeeName}
          </h2>
          <p style={{ margin: '6px auto 0', fontSize: '13.5px', color: 'var(--muted, #64748b)', maxWidth: '520px' }}>
            لديك صلاحيات معتمدة من المالك للوصول لأكثر من قسم أو نظام. يرجى اختيار الصفحة التي ترغب في الدخول عليها:
          </p>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="إغلاق"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                background: 'var(--surface-muted, #f1f5f9)',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                fontSize: '16px',
                cursor: 'pointer',
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Workspace Cards */}
        {availableWorkspaces.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)', background: 'var(--surface-muted, #f8fafc)', borderRadius: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔒</div>
            <h4 style={{ margin: '0 0 6px', color: 'var(--text)', fontSize: '16px', fontWeight: 800 }}>لا توجد صفحات أو أنظمة مصرح بها إضافية</h4>
            <p style={{ margin: 0, fontSize: '13px' }}>حسابك مفعل بصلاحيات أساسية. يمكنك مراجعة المالك لمنحك تراخيص إضافية.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '14px',
            marginBottom: '20px'
          }}>
            {availableWorkspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws)}
                style={{
                  background: ws.lightBg,
                  border: `1.5px solid ${ws.borderColor}`,
                  borderRadius: '16px',
                  padding: '18px',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '28px' }}>{ws.icon}</span>
                    <span style={{
                      background: '#fff',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      border: '1px solid var(--border)'
                    }}>
                      {ws.badge}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 4px', fontSize: '15.5px', fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                    {ws.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #475569)', lineHeight: 1.45 }}>
                    {ws.desc}
                  </p>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{
                    background: ws.gradient,
                    color: '#fff',
                    padding: '6px 14px',
                    borderRadius: '7px',
                    fontSize: '12px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>دخول مباشر</span>
                    <span>←</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
