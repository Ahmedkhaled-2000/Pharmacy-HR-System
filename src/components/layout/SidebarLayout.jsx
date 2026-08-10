import React, { useState } from 'react';

export default function SidebarLayout({
  currentRole,
  currentBranch,
  userProfile,
  activeTab,
  setActiveTab,
  onLogout,
  pendingCount = 0,
  themeMode,
  toggleTheme,
  customItems,
  onExportExcel,
  children
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const defaultAdminItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: '📊' },
    { id: 'employees', label: 'الموظفين', icon: '👥' },
    { id: 'branches', label: 'الفروع', icon: '🏢' },
    { id: 'attendance', label: 'الحضور والانصراف', icon: '⏱️' },
    { id: 'electronic-attendance', label: 'البصمة الإلكترونية', icon: '📸' },
    { id: 'roster', label: 'الجداول الشهرية', icon: '📅' },
    { id: 'requests', label: 'الطلبات', icon: '📋' },
    { id: 'leaves-tracking', label: 'الإجازات', icon: '🏖️' },
    { id: 'payroll', label: 'رواتب الموظفين', icon: '💰' },
    { id: 'adjustments-module', label: 'المكافآت والخصومات', icon: '📝' },
    { id: 'whatsapp-center', label: 'مركز مراسلات الواتساب', icon: '💬' },
    { id: 'bylaws', label: 'لائحة العمل والجزاءات', icon: '📜' },
    { id: 'evaluations', label: 'التقييمات', icon: '⭐️' },
    { id: 'loans-meds', label: 'السلف والأجل', icon: '💳' },
    { id: 'income-expenses', label: 'المصروفات والإيرادات', icon: '📈' },
    { id: 'settings', label: 'الإعدادات', icon: '⚙️' },
  ];

  const menuItems = customItems || defaultAdminItems;
  const currentLabel = menuItems.find(m => m.id === activeTab)?.label || 'لوحة التحكم';

  // Profile data fallback
  const profileName = userProfile?.name || (currentRole === 'admin' ? 'الإدارة العليا' : (currentBranch?.name ? `مدير فرع - ${currentBranch.name}` : 'مدير الفرع'));
  const profileTitle = userProfile?.jobTitle || (currentRole === 'admin' ? 'المدير العام' : 'مدير الفرع');
  const profileCode = userProfile?.code ? `· ${userProfile.code}` : '';
  const firstLetter = profileName.trim().charAt(0) || 'م';

  return (
    <div className="ep-layout" style={{
      display: 'flex',
      gap: 0,
      minHeight: '100vh',
      background: 'var(--background)',
      overflow: 'hidden',
    }}>

      {/* ── Sidebar ── */}
      <aside
        className="ep-sidebar"
        style={{
          width: sidebarOpen ? '240px' : '65px',
          minWidth: sidebarOpen ? '240px' : '65px',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.25s ease, min-width 0.25s ease',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        {/* Sidebar Header (Employee Info) */}
        <div style={{
          padding: sidebarOpen ? '18px 16px 14px' : '18px 8px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'nowrap',
          overflow: 'hidden'
        }}>
          <div
            className="emp-avatar-circle"
            style={{ width: '44px', height: '44px', fontSize: '18px', flexShrink: 0, cursor: 'pointer', background: 'var(--primary-light)', color: 'var(--primary)', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? 'طيّ القائمة' : 'توسيع القائمة'}
          >
            {userProfile?.photoUrl
              ? <img src={userProfile.photoUrl} alt={profileName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : <span>{firstLetter}</span>
            }
          </div>
          {sidebarOpen && (
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profileName}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profileTitle} {profileCode}
              </div>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto', overflowX: 'hidden' }}>
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            let badgeCount = 0;
            if ((item.id === 'requests' || item.id === 'approval-rules') && pendingCount > 0) badgeCount = pendingCount;
            if (item.badge !== undefined && item.badge > 0) badgeCount = item.badge;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: sidebarOpen ? '10px 16px' : '10px',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text)',
                  border: 'none',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 600,
                  transition: 'all 0.2s ease',
                  textAlign: 'right',
                  position: 'relative',
                  borderRight: isActive ? '3px solid var(--primary-dark)' : '3px solid transparent',
                }}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--primary)'; } }}
                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text)'; } }}
              >
                <span style={{ fontSize: '17px', flexShrink: 0, filter: isActive ? 'brightness(1.5)' : 'none' }}>{item.icon}</span>
                {sidebarOpen && (
                  <>
                    <span style={{ flex: 1, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="ep-nav-badge" style={{
                        background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--danger)',
                        color: '#fff',
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '99px',
                        fontWeight: 700
                      }}>{badgeCount}</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Action Buttons */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              title="تصدير كشف المرتب"
              style={{
                width: '100%',
                background: 'var(--success-light)',
                color: 'var(--success-dark)',
                border: '1px solid var(--success-border)',
                padding: '8px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <span>📥</span>
              {sidebarOpen && <span>تصدير Excel</span>}
            </button>
          )}

          <button
            onClick={onLogout}
            title="تسجيل الخروج"
            style={{
              width: '100%',
              background: 'var(--danger-light)',
              color: 'var(--danger-dark)',
              border: '1px solid var(--danger-border)',
              padding: '8px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <span>🚪</span>
            {sidebarOpen && <span>خروج</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div className="ep-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Topbar matching Employee Portal design but styled for Admin */}
        <header className="ep-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={() => setSidebarOpen(v => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '22px',
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: '8px'
              }}
              title={sidebarOpen ? 'إخفاء القائمة' : 'إظهار القائمة'}
            >
              ☰
            </button>
            <div className="ep-header-date" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>
              <span style={{ fontSize: '16px' }}>📅</span>
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
              {currentLabel}
            </h2>
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--background)',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{themeMode === 'dark' ? '☀️' : '🌙'}</span>
              <span>{themeMode === 'dark' ? 'فاتح' : 'داكن'}</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </div>

      </div>
    </div>
  );
}
