import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  ShieldCheck,
  FilePlus,
  LogOut,
  X,
  Menu,
  Plus
} from 'lucide-react';
import { getArchiveUsername, clearArchiveSession } from '../../utils/archiveApiClient';

export default function ArchiveNavbar({
  activeTab,
  setActiveTab,
  pharmacyName = 'صيدلية الفلاي',
  pharmacyLogo = '',
  onOpenUploadModal,
  onOpenEmployeeModal,
  onLogout,
  settings = {}
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentUsername = getArchiveUsername();
  const displayName = settings.PHARMACY_NAME || settings.pharmacyName || pharmacyName || 'صيدلية الفلاي';
  const displayLogo = settings.PHARMACY_LOGO || settings.pharmacyLogo || pharmacyLogo;

  const handleSystemLogout = () => {
    if (!window.confirm('هل تريد بالتأكيد تسجيل الخروج من نظام الأرشيف؟')) return;
    clearArchiveSession();
    if (onLogout) onLogout();
    else window.location.reload();
  };

  const navLinks = [
    { id: 'invoices', name: 'الأرشيف ولوحة التحكم', icon: LayoutDashboard },
    { id: 'employees', name: 'الموظفين', icon: Users },
    { id: 'suppliers', name: 'الموردين', icon: Building2 },
    { id: 'settings', name: 'إعدادات النظام', icon: Settings },
  ];

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 40,
      backgroundColor: '#070b14',
      borderBottom: '1px solid #1e293b',
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.6)'
    }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '76px' }}>
          
          {/* Right Logo & Branding (Match Screenshot 2) */}
          <div 
            onClick={() => setActiveTab('invoices')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}
          >
            {displayLogo ? (
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#0b1120',
                border: '1px solid #1e293b',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)'
              }}>
                <img src={displayLogo} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
              </div>
            ) : (
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                border: '1px solid #3b82f6'
              }}>
                <ShieldCheck style={{ width: '22px', height: '22px', color: '#ffffff' }} />
              </div>
            )}
            <div>
              <h1 style={{ fontSize: '1.125rem', fontWeight: 900, color: '#f8fafc', margin: 0, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                {displayName}
              </h1>
              <p style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600, margin: 0, marginTop: '2px' }}>
                أرشيف الفواتير الرقمي
              </p>
            </div>
          </div>

          {/* Center Navigation Links Pills (Match Screenshots 2, 3, 4, 5) */}
          <nav className="hidden md:flex" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem',
            borderRadius: '16px',
            backgroundColor: '#0b1120',
            border: '1px solid #1e293b'
          }}>
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = activeTab === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.55rem 1.15rem',
                    borderRadius: '12px',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: isActive ? '#2563eb' : 'transparent',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.4)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#ffffff';
                      e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.6)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Icon style={{ width: '16px', height: '16px' }} />
                  <span>{link.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Left Action Buttons (Match Screenshot 2) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <button
              type="button"
              onClick={onOpenEmployeeModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.55rem 1rem',
                borderRadius: '12px',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: '#cbd5e1',
                backgroundColor: '#0b1120',
                border: '1px solid #1e293b',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1e293b';
                e.currentTarget.style.color = '#cbd5e1';
              }}
            >
              <Plus style={{ width: '14px', height: '14px', color: '#60a5fa' }} />
              <span>إضافة موظف</span>
            </button>

            <button
              type="button"
              onClick={onOpenUploadModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '12px',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: '#ffffff',
                backgroundColor: '#2563eb',
                border: '1px solid #3b82f6',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1d4ed8';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <FilePlus style={{ width: '16px', height: '16px' }} />
              <span>رفع فاتورة جديدة</span>
            </button>

            <button
              type="button"
              onClick={handleSystemLogout}
              title={`تسجيل الخروج (${currentUsername})`}
              style={{
                padding: '0.55rem',
                borderRadius: '12px',
                backgroundColor: '#0b1120',
                border: '1px solid #1e293b',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#94a3b8';
                e.currentTarget.style.borderColor = '#1e293b';
                e.currentTarget.style.backgroundColor = '#0b1120';
              }}
            >
              <LogOut style={{ width: '16px', height: '16px' }} />
            </button>

            {/* Mobile Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden"
              style={{
                padding: '0.5rem',
                color: '#cbd5e1',
                backgroundColor: '#0b1120',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {mobileMenuOpen ? <X style={{ width: '18px', height: '18px' }} /> : <Menu style={{ width: '18px', height: '18px' }} />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div style={{
          backgroundColor: '#0b1120',
          borderBottom: '1px solid #1e293b',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = activeTab === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => {
                  setActiveTab(link.id);
                  setMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  textAlign: 'right',
                  width: '100%'
                }}
              >
                <Icon style={{ width: '18px', height: '18px' }} />
                <span>{link.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
