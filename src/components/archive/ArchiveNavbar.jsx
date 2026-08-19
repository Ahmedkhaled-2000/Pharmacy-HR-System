import React, { useState } from 'react';

export default function ArchiveNavbar({
  activeTab,
  setActiveTab,
  onOpenUploadModal,
  onOpenEmployeeModal,
  onLogout,
  settings = {}
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pharmacyName = settings.PHARMACY_NAME || 'صيدليات مداواة';
  const pharmacyLogo = settings.PHARMACY_LOGO || '';

  const navLinks = [
    { id: 'invoices', label: 'الفواتير والأرشيف', icon: '📊' },
    { id: 'suppliers', label: 'الموردين', icon: '🏢' },
    { id: 'employees', label: 'الموظفين', icon: '👥' },
    { id: 'settings', label: 'إعدادات النظام', icon: '⚙️' },
  ];

  return (
    <header className="arch-navbar">
      <div className="arch-nav-container">
        
        {/* Brand Logo & Name */}
        <div className="arch-brand" onClick={() => setActiveTab('invoices')}>
          <div className="arch-brand-logo">
            {pharmacyLogo ? (
              <img src={pharmacyLogo} alt={pharmacyName} />
            ) : (
              <span style={{ fontSize: '1.4rem' }}>🗄️</span>
            )}
          </div>
          <div>
            <div className="arch-brand-title">{pharmacyName}</div>
            <div className="arch-brand-sub">نظام الأرشيف وإدارة الفواتير</div>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="arch-nav-links" style={{ display: 'flex' }}>
          {navLinks.map((link) => {
            const isActive = activeTab === link.id;
            return (
              <button
                key={link.id}
                className={`arch-nav-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(link.id)}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quick Actions */}
        <div className="arch-nav-actions">
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={onOpenEmployeeModal}
            title="إدارة موظفي الأرشيف"
          >
            <span>👥</span>
            <span style={{ fontSize: '0.8rem' }}>إدارة موظف</span>
          </button>

          <button
            type="button"
            className="arch-btn-primary"
            onClick={onOpenUploadModal}
          >
            <span>➕</span>
            <span>رفع فاتورة جديدة</span>
          </button>

          <button
            type="button"
            className="arch-btn-icon"
            onClick={onLogout}
            title="تسجيل الخروج من الأرشيف"
          >
            🚪
          </button>
        </div>

      </div>
    </header>
  );
}
