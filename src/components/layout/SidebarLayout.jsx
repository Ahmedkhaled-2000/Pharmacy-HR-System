import React, { useState, useMemo } from 'react';
import { useLiveRealTime } from '../../hooks/useLiveRealTime';
import { getCycleDateRange } from '../../utils/periodEngine';

export default function SidebarLayout({
  currentRole,
  currentBranch,
  userProfile,
  orgSettings = {},
  activeTab,
  setActiveTab,
  onLogout,
  pendingCount = 0,
  resignationCount = 0,
  bylawsCount = 0,
  notifications = [],
  themeMode,
  toggleTheme,
  customItems,
  onExportExcel,
  adminFilterMode = 'month',
  setAdminFilterMode,
  monthPicker,
  setMonthPicker,
  adminCustomFrom,
  setAdminCustomFrom,
  adminCustomTo,
  setAdminCustomTo,
  children
}) {
  const liveTime = useLiveRealTime(1000);
  const currentCycleRange = useMemo(() => {
    return getCycleDateRange(monthPicker, orgSettings);
  }, [monthPicker, orgSettings]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const defaultAdminItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: '📊' },
    { id: 'notifications', label: 'الإشعارات والتنبيهات', icon: '🔔', badge: ((notifications || []).filter(n => !n.read).length) + bylawsCount },
    { id: 'requests', label: 'الطلبات', icon: '📋', badge: pendingCount },
    { id: 'employees', label: 'الموظفين', icon: '👥' },
    { id: 'branches', label: 'الفروع', icon: '🏢' },
    { id: 'attendance', label: 'الحضور والانصراف', icon: '⏱️' },
    { id: 'electronic-attendance', label: 'البصمة الإلكترونية', icon: '📸' },
    { id: 'roster', label: 'الجداول الشهرية', icon: '📅' },
    { id: 'leaves-tracking', label: 'الإجازات', icon: '🏖️' },
    { id: 'permissions-management', label: 'أذونات الموظفين', icon: '⏰' },
    { id: 'payroll', label: 'رواتب الموظفين', icon: '💰' },
    { id: 'adjustments-module', label: 'المكافآت والخصومات', icon: '📝' },
    { id: 'resignation', label: 'طلبات استقالة الموظفين', icon: '📝', badge: resignationCount },
    { id: 'whatsapp-center', label: 'مركز مراسلات الواتساب', icon: '💬' },
    { id: 'bylaws', label: 'لائحة العمل والجزاءات', icon: '📜' },
    { id: 'evaluations', label: 'التقييمات', icon: '⭐️' },
    { id: 'loans-meds', label: 'السلف والأجل', icon: '💳' },
    { id: 'income-expenses', label: 'المصروفات والإيرادات', icon: '📈' },
    { id: 'financial-reports', label: 'التقارير المالية', icon: '📊' },
    { id: 'pharmacy-archive', label: 'أرشيف الفواتير والمستندات', icon: '🗄️', openInNewTab: true },
    { id: 'settings', label: 'الإعدادات', icon: '⚙️' },
  ];

  const menuItems = customItems || defaultAdminItems;
  const currentLabel = menuItems.find(m => m.id === activeTab)?.label || 'لوحة التحكم';

  // Profile data fallback
  const profileName = userProfile?.name || ((currentRole === 'owner' || userProfile?.isOwner) ? '👑 المالك' : (currentRole === 'admin' ? 'الإدارة العليا' : (currentBranch?.name ? `مدير فرع - ${currentBranch.name}` : 'مدير الفرع')));
  const profileTitle = userProfile?.jobTitle || ((currentRole === 'owner' || userProfile?.isOwner) ? 'Super Root / Owner' : (currentRole === 'admin' ? 'المدير العام' : 'مدير الفرع'));
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

        {/* Nav Items & Direct Actions */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {menuItems.map((item) => {
              const isActive = activeTab === item.id;
              let badgeCount = 0;
              if ((item.id === 'requests' || item.id === 'approval-rules') && pendingCount > 0) badgeCount = pendingCount;
              if (item.badge !== undefined && item.badge > 0) badgeCount = item.badge;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.openInNewTab || item.id === 'pharmacy-archive') {
                      window.open(window.location.origin + '/archive', '_blank');
                    } else {
                      setActiveTab(item.id);
                    }
                  }}
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
          </div>

          {/* Action Buttons directly below menu items */}
          <div style={{
            padding: sidebarOpen ? '14px 12px 10px' : '12px 6px 10px',
            marginTop: '8px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            {onExportExcel && currentRole !== 'branch' && (
              <button
                onClick={onExportExcel}
                title="تصدير كشف المرتب"
                style={{
                  width: '100%',
                  background: 'var(--success-light)',
                  color: 'var(--success-dark)',
                  border: '1px solid var(--success-border)',
                  padding: sidebarOpen ? '8px 12px' : '8px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
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
                padding: sidebarOpen ? '8px 12px' : '8px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span>🚪</span>
              {sidebarOpen && <span>خروج</span>}
            </button>
          </div>
        </nav>
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
            <div className="ep-header-date" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--surface-muted)',
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              fontSize: '12px'
            }} title={liveTime.isServerSynced ? '🌐 التوقيت الفعلي الموثق من الخادم' : '⏱️ التوقيت المباشر'}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: liveTime.isServerSynced ? '#22c55e' : '#f59e0b',
                boxShadow: liveTime.isServerSynced ? '0 0 6px #22c55e' : 'none'
              }} />
              <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontFamily: 'monospace' }}>
                ⏰ {liveTime.formatted12Time}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                {liveTime.fullArabicDate}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
              {currentLabel}
            </h2>

            {/* Topbar Date Range & Month Filter (Persistent in localStorage) */}
            {setAdminFilterMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-muted)', padding: '4px 10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <select value={adminFilterMode} onChange={(e) => setAdminFilterMode(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 'bold' }}>
                  <option value="month">📅 دورة الرواتب</option>
                  <option value="custom">📆 فترة مخصصة</option>
                </select>

                {adminFilterMode === 'month' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {setMonthPicker && (
                      <input type="month" value={monthPicker} onChange={(e) => setMonthPicker(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 'bold' }} />
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    <input type="date" value={adminCustomFrom} onChange={(e) => setAdminCustomFrom?.(e.target.value)} style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px' }} />
                    <span>إلى</span>
                    <input type="date" value={adminCustomTo} onChange={(e) => setAdminCustomTo?.(e.target.value)} style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px' }} />
                  </div>
                )}
              </div>
            )}

            {/* Bell Icon Notification Button */}
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              title="الإشعارات والتنبيهات"
              style={{
                position: 'relative',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '700',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>🔔</span>
              {(notifications || []).filter(n => !n.read).length > 0 && (
                <span className="badge danger" style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '11px' }}>
                  {(notifications || []).filter(n => !n.read).length}
                </span>
              )}
            </button>

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
