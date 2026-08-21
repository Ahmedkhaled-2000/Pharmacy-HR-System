import React, { useState, useEffect, useRef } from 'react';

export default function DesktopLayout({
  currentRole,
  currentBranch,
  userProfile,
  activeTab,
  setActiveTab,
  activeSubTab = 'cards',
  setActiveSubTab,
  onLogout,
  pendingCount = 0,
  resignationCount = 0,
  bylawsCount = 0,
  notifications = [],
  themeMode,
  toggleTheme,
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
  const [openDropdown, setOpenDropdown] = useState(null);
  const menuContainerRef = useRef(null);

  const unreadNotificationsCount = (notifications || []).filter(n => !n.read).length;

  // Define Desktop Menu Structure for Super Admin
  const adminMenuItems = [
    {
      id: 'dashboard',
      label: 'لوحة التحكم',
      icon: '📊',
      isSingle: true,
      targetTab: 'dashboard'
    },
    {
      id: 'employees',
      label: 'شؤون الموظفين',
      icon: '👥',
      children: [
        {
          id: 'employees:cards',
          targetTab: 'employees',
          targetSubTab: 'cards',
          label: 'دليل وبطاقات الموظفين',
          icon: '👤',
          desc: 'إدارة ملفات الموظفين، العقود، والأرصدة'
        },
        {
          id: 'employees:attendance',
          targetTab: 'employees',
          targetSubTab: 'attendance',
          label: 'سجل الحضور والانصراف والبصمات',
          icon: '⏱️',
          desc: 'سجل الحضور اليومي، البصمات، والتسجيل اليدوي'
        },
        {
          id: 'employees:biometrics',
          targetTab: 'employees',
          targetSubTab: 'biometrics',
          label: 'البصمة الإلكترونية الحيوية (AI)',
          icon: '📸',
          desc: 'إدارة وتدريب بصمة الوجه واليد بالذكاء الاصطناعي'
        },
        {
          id: 'employees:roster',
          targetTab: 'employees',
          targetSubTab: 'roster',
          label: 'الجداول والورديات الشهرية',
          icon: '📅',
          desc: 'توزيع شفتات العمل ومناوبات الكادر الطبي'
        }
      ]
    },
    {
      id: 'branches',
      label: 'الفروع',
      icon: '🏢',
      isSingle: true,
      targetTab: 'branches'
    },
    {
      id: 'requests-group',
      label: 'الطلبات والموافقات',
      icon: '📋',
      badge: pendingCount + resignationCount,
      children: [
        {
          id: 'requests',
          targetTab: 'requests',
          label: 'مركز إدارة واعتماد الطلبات',
          icon: '📋',
          badge: pendingCount,
          desc: 'مراجعة واعتماد طلبات الإجازات والأذونات والسلف'
        },
        {
          id: 'leaves-tracking',
          targetTab: 'leaves-tracking',
          label: 'سجل الإجازات السنوية',
          icon: '🏖️',
          desc: 'تتبع رصيد الإجازات والأيام المستهلكة'
        },
        {
          id: 'permissions-management',
          targetTab: 'permissions-management',
          label: 'أذونات وساعات الاستئذان',
          icon: '⏰',
          desc: 'ساعات الاستئذان الرسمية المعتمدة'
        },
        {
          id: 'resignation',
          targetTab: 'resignation',
          label: 'طلبات استقالة الموظفين',
          icon: '🚪',
          badge: resignationCount,
          desc: 'طلبات الاستقالة وإخلاء الطرف والتسوية'
        }
      ]
    },
    {
      id: 'payroll-group',
      label: 'الرواتب والمالية',
      icon: '💰',
      children: [
        {
          id: 'payroll',
          targetTab: 'payroll',
          label: 'مسير الرواتب المعتمد',
          icon: '💰',
          desc: 'حساب صافي الأجور وطباعة قسائم الرواتب'
        },
        {
          id: 'adjustments-module',
          targetTab: 'adjustments-module',
          label: 'المكافآت والخصومات',
          icon: '📝',
          desc: 'تسجيل الحوافز والجزاءات والخصومات المالية'
        },
        {
          id: 'loans-meds',
          targetTab: 'loans-meds',
          label: 'السلف ومشتريات الأدوية',
          icon: '💳',
          desc: 'متابعة السلف النقدية ومسحوبات الأدوية والتقسيط'
        },
        {
          id: 'income-expenses',
          targetTab: 'income-expenses',
          label: 'المصروفات والإيرادات',
          icon: '📈',
          desc: 'سجل الإيرادات والمصروفات النقدية اليومية'
        }
      ]
    },
    {
      id: 'system-group',
      label: 'الاتصالات واللائحة',
      icon: '💬',
      badge: bylawsCount,
      children: [
        {
          id: 'whatsapp-center',
          targetTab: 'whatsapp-center',
          label: 'مركز مراسلات الواتساب',
          icon: '💬',
          desc: 'إرسال الرسائل التلقائية وكشوف الرواتب'
        },
        {
          id: 'bylaws',
          targetTab: 'bylaws',
          label: 'لائحة العمل والجزاءات',
          icon: '📜',
          badge: bylawsCount,
          desc: 'تطبيق بنود لائحة العمل واحتساب الغرامات'
        },
        {
          id: 'evaluations',
          targetTab: 'evaluations',
          label: 'تقييمات الأداء والشكاوى',
          icon: '⭐',
          desc: 'تقييم أداء الكوادر وملاحظات المديرين'
        },
        {
          id: 'pharmacy-archive',
          targetTab: 'pharmacy-archive',
          label: 'أرشيف الفواتير والمستندات',
          icon: '🗄️',
          desc: 'فتح المنظومة السحابية للأرشفة والمستندات',
          openInNewTab: true
        }
      ]
    },
    {
      id: 'settings-group',
      label: 'الإعدادات والتنبيهات',
      icon: '⚙️',
      badge: unreadNotificationsCount,
      children: [
        {
          id: 'notifications',
          targetTab: 'notifications',
          label: 'مركز الإشعارات والتنبيهات',
          icon: '🔔',
          badge: unreadNotificationsCount,
          desc: 'سجل التنبيهات والأحداث اللحظية'
        },
        {
          id: 'settings',
          targetTab: 'settings',
          label: 'إعدادات المؤسسة والنظام',
          icon: '⚙️',
          desc: 'تخصيص القواعد، كلمات المرور، وربط Gmail'
        }
      ]
    }
  ];

  // Define Desktop Menu Structure for Branch Manager
  const branchMenuItems = [
    {
      id: 'dashboard',
      label: 'لوحة التحكم',
      icon: '📊',
      isSingle: true,
      targetTab: 'dashboard'
    },
    {
      id: 'branch-ops',
      label: 'متابعة الفرع والحضور',
      icon: '👥',
      children: [
        {
          id: 'emp-punches',
          targetTab: 'emp-punches',
          label: 'متابعة حضور وبصمات الفرع',
          icon: '👥',
          desc: 'متابعة الحضور الحي والبصمات لموظفي الفرع'
        },
        {
          id: 'branch-roster',
          targetTab: 'branch-roster',
          label: 'الجدول الشهري للموظفين',
          icon: '📅',
          desc: 'جدول ورديات وشفتات الفرع المعتمدة'
        }
      ]
    },
    {
      id: 'branch-reqs',
      label: 'الطلبات والموافقات',
      icon: '📋',
      badge: pendingCount + resignationCount,
      children: [
        {
          id: 'requests',
          targetTab: 'requests',
          label: 'مركز موافقات الطلبات',
          icon: '📋',
          badge: pendingCount,
          desc: 'موافقة وتوقيع طلبات موظفي الفرع'
        },
        {
          id: 'permissions-management',
          targetTab: 'permissions-management',
          label: 'أذونات الموظفين',
          icon: '⏰',
          desc: 'تسجيل ومتابعة أذونات وساعات الاستئذان'
        },
        {
          id: 'resignation',
          targetTab: 'resignation',
          label: 'طلبات استقالة الموظفين',
          icon: '📝',
          badge: resignationCount,
          desc: 'مراجعة طلبات استقالة موظفي الفرع'
        }
      ]
    },
    {
      id: 'branch-fin',
      label: 'التقييمات والمالية',
      icon: '⭐',
      children: [
        {
          id: 'evaluations',
          targetTab: 'evaluations',
          label: 'التقييمات والشكاوى',
          icon: '⭐',
          desc: 'تقييم أداء موظفي الفرع وتقديم الملاحظات'
        },
        {
          id: 'income-expenses',
          targetTab: 'income-expenses',
          label: 'المصروفات والإيرادات',
          icon: '📈',
          desc: 'تسجيل المصروفات النثرية والإيرادات بالفرع'
        }
      ]
    },
    {
      id: 'bylaws',
      label: 'لائحة العمل والجزاءات',
      icon: '📜',
      badge: bylawsCount,
      isSingle: true,
      targetTab: 'bylaws'
    }
  ];

  const currentMenuItems = currentRole === 'branch' ? branchMenuItems : adminMenuItems;

  // Helper to check if a main menu is active
  const isMenuGroupActive = (menu) => {
    if (menu.isSingle) {
      return activeTab === menu.targetTab;
    }
    if (menu.children) {
      return menu.children.some(child => {
        if (child.targetTab === activeTab) {
          if (child.targetSubTab) {
            return activeSubTab === child.targetSubTab;
          }
          return true;
        }
        return false;
      });
    }
    return false;
  };

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMenuClick = (menu) => {
    if (menu.isSingle) {
      if (menu.openInNewTab || menu.targetTab === 'pharmacy-archive') {
        window.open(window.location.origin + '/archive', '_blank');
      } else {
        setActiveTab(menu.targetTab);
      }
      setOpenDropdown(null);
    } else {
      setOpenDropdown(prev => (prev === menu.id ? null : menu.id));
    }
  };

  const handleSubItemClick = (subItem) => {
    if (subItem.openInNewTab || subItem.targetTab === 'pharmacy-archive') {
      window.open(window.location.origin + '/archive', '_blank');
      setOpenDropdown(null);
      return;
    }

    setActiveTab(subItem.targetTab);
    if (subItem.targetSubTab && setActiveSubTab) {
      setActiveSubTab(subItem.targetSubTab);
    }
    setOpenDropdown(null);
  };

  // Breadcrumb current label generator
  const getActiveBreadcrumb = () => {
    for (const menu of currentMenuItems) {
      if (menu.isSingle && menu.targetTab === activeTab) {
        return { group: menu.label, item: null, icon: menu.icon };
      }
      if (menu.children) {
        const foundChild = menu.children.find(c => {
          if (c.targetTab === activeTab) {
            if (c.targetSubTab) return activeSubTab === c.targetSubTab;
            return true;
          }
          return false;
        });
        if (foundChild) {
          return { group: menu.label, item: foundChild.label, icon: foundChild.icon };
        }
      }
    }
    return { group: 'النظام', item: 'لوحة التحكم', icon: '📊' };
  };

  const breadcrumb = getActiveBreadcrumb();
  const profileName = userProfile?.name || (currentRole === 'admin' ? 'الإدارة العليا' : (currentBranch?.name ? `مدير فرع - ${currentBranch.name}` : 'مدير الفرع'));
  const profileTitle = userProfile?.jobTitle || (currentRole === 'admin' ? 'المدير العام' : 'مدير الفرع');
  const firstLetter = profileName.trim().charAt(0) || 'م';

  return (
    <div className="desktop-app-layout" style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--background)',
      color: 'var(--text)',
      fontFamily: "'Cairo', 'Tajawal', sans-serif"
    }}>

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 1. TOP DESKTOP TITLE BAR (Window Title & Global Status & Quick Controls) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      <header className="desktop-titlebar" style={{
        height: '50px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        userSelect: 'none',
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
      }}>
        {/* Left Side: System Title & Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* App Logo/Icon Indicator */}
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 900,
            boxShadow: '0 2px 6px rgba(13,148,136,0.3)'
          }}>
            🏥
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>
              منظومة الموارد البشرية
            </span>
            <span style={{ color: 'var(--border)', fontSize: '16px' }}>/</span>
            {/* Active Breadcrumb Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--muted)' }}>
              <span>{breadcrumb.icon}</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{breadcrumb.group}</span>
              {breadcrumb.item && (
                <>
                  <span style={{ fontSize: '11px' }}>›</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{breadcrumb.item}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Quick Action Toolbar & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* Payroll Cycle / Month Filter */}
          {setAdminFilterMode && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-muted)',
              padding: '3px 8px',
              borderRadius: '8px',
              border: '1px solid var(--border)'
            }}>
              <select
                value={adminFilterMode}
                onChange={(e) => setAdminFilterMode(e.target.value)}
                style={{
                  padding: '3px 6px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  fontSize: '11.5px',
                  fontWeight: 'bold',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                <option value="month">📅 شهر الـ 26</option>
                <option value="custom">📆 فترة مخصصة</option>
              </select>

              {adminFilterMode === 'month' ? (
                setMonthPicker && (
                  <input
                    type="month"
                    value={monthPicker}
                    onChange={(e) => setMonthPicker(e.target.value)}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontSize: '11.5px',
                      fontWeight: 'bold',
                      background: 'var(--surface)',
                      color: 'var(--text)'
                    }}
                  />
                )
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <input
                    type="date"
                    value={adminCustomFrom}
                    onChange={(e) => setAdminCustomFrom?.(e.target.value)}
                    style={{
                      padding: '2px 4px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontSize: '10.5px',
                      background: 'var(--surface)',
                      color: 'var(--text)'
                    }}
                  />
                  <span>إلى</span>
                  <input
                    type="date"
                    value={adminCustomTo}
                    onChange={(e) => setAdminCustomTo?.(e.target.value)}
                    style={{
                      padding: '2px 4px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontSize: '10.5px',
                      background: 'var(--surface)',
                      color: 'var(--text)'
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Quick Excel Export */}
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              title="تصدير كشف الرواتب Excel"
              style={{
                background: 'var(--success-light)',
                color: 'var(--success-dark)',
                border: '1px solid var(--success-border)',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span>📥</span>
              <span>تصدير Excel</span>
            </button>
          )}

          {/* Notifications Button */}
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            title="الإشعارات والتنبيهات"
            style={{
              position: 'relative',
              border: '1px solid var(--border)',
              background: activeTab === 'notifications' ? 'var(--primary-light)' : 'var(--surface)',
              padding: '5px 9px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>🔔</span>
            {unreadNotificationsCount > 0 && (
              <span style={{
                background: 'var(--danger)',
                color: '#fff',
                padding: '1px 5px',
                borderRadius: '99px',
                fontSize: '10px',
                fontWeight: 800
              }}>
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Dark/Light Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={themeMode === 'dark' ? 'التحويل للوضع الفاتح' : 'التحويل للوضع الداكن'}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              padding: '5px 9px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <span>{themeMode === 'dark' ? '☀️' : '🌙'}</span>
          </button>

          {/* User Profile & Quick Logout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingRight: '6px',
            borderRight: '1px solid var(--border)',
            marginRight: '4px'
          }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              border: '1.5px solid var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '13px',
              overflow: 'hidden'
            }}>
              {userProfile?.photoUrl ? (
                <img src={userProfile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                firstLetter
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
                {profileName}
              </span>
              <span style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                {profileTitle}
              </span>
            </div>

            <button
              type="button"
              onClick={onLogout}
              title="تسجيل الخروج"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: '6px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-light)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 2. TOP DESKTOP MENU BAR (Ribbon Style Horizontal Navigation & Dropdowns) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      <nav
        ref={menuContainerRef}
        className="desktop-menubar"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '4px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          position: 'sticky',
          top: 0,
          zIndex: 90,
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}
      >
        {currentMenuItems.map((menu) => {
          const isActive = isMenuGroupActive(menu);
          const isOpen = openDropdown === menu.id;

          return (
            <div key={menu.id} style={{ position: 'relative' }}>
              {/* Menu Trigger Button */}
              <button
                type="button"
                onClick={() => handleMenuClick(menu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive
                    ? 'var(--primary)'
                    : isOpen
                    ? 'var(--hover)'
                    : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text)',
                  fontSize: '13px',
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !isOpen) {
                    e.currentTarget.style.background = 'var(--hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive && !isOpen) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '15px' }}>{menu.icon}</span>
                <span>{menu.label}</span>

                {/* Dropdown Indicator */}
                {!menu.isSingle && (
                  <span style={{
                    fontSize: '10px',
                    opacity: isActive ? 0.9 : 0.6,
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s ease'
                  }}>
                    ▼
                  </span>
                )}

                {/* Badge Count */}
                {menu.badge > 0 && (
                  <span style={{
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--danger)',
                    color: '#ffffff',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '99px',
                    marginRight: '2px'
                  }}>
                    {menu.badge}
                  </span>
                )}
              </button>

              {/* ── Dropdown Popup Menu ── */}
              {!menu.isSingle && isOpen && menu.children && (
                <div
                  className="desktop-dropdown-animate"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    minWidth: '280px',
                    maxWidth: '340px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                    padding: '6px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px'
                  }}
                >
                  {menu.children.map((child) => {
                    const isChildActive = child.targetTab === activeTab && (!child.targetSubTab || activeSubTab === child.targetSubTab);

                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => handleSubItemClick(child)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: isChildActive ? 'var(--primary-light)' : 'transparent',
                          color: isChildActive ? 'var(--primary-dark)' : 'var(--text)',
                          cursor: 'pointer',
                          textAlign: 'right',
                          width: '100%',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isChildActive) {
                            e.currentTarget.style.background = 'var(--hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isChildActive) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <span style={{ fontSize: '18px', marginTop: '1px', flexShrink: 0 }}>
                          {child.icon}
                        </span>

                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px'
                          }}>
                            <span style={{
                              fontWeight: isChildActive ? 800 : 700,
                              fontSize: '13px',
                              color: isChildActive ? 'var(--primary)' : 'var(--text)'
                            }}>
                              {child.label}
                            </span>
                            {child.badge > 0 && (
                              <span style={{
                                background: 'var(--danger)',
                                color: '#ffffff',
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '99px'
                              }}>
                                {child.badge}
                              </span>
                            )}
                          </div>

                          {child.desc && (
                            <p style={{
                              margin: '2px 0 0',
                              fontSize: '11px',
                              color: 'var(--muted)',
                              lineHeight: 1.3,
                              whiteSpace: 'normal'
                            }}>
                              {child.desc}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 3. MAIN WORKSPACE (Full-Width Desktop Canvas) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      <main className="desktop-workspace" style={{
        flex: 1,
        padding: '20px 24px',
        overflowY: 'auto',
        background: 'var(--background)'
      }}>
        {children}
      </main>
    </div>
  );
}
