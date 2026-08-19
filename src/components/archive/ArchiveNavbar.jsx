import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  ShieldCheck,
  Scan,
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
  onOpenScanModal,
  onLogout,
  settings = {}
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentUsername = getArchiveUsername();
  const displayName = settings.pharmacyName || pharmacyName || 'صيدلية الفلاي';

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
    <header className="sticky top-0 z-40" style={{
      background: '#070b14',
      borderBottom: '1px solid #1e293b',
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.6)'
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Right Logo & Institution Branding */}
          <div 
            onClick={() => setActiveTab('invoices')}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            {pharmacyLogo ? (
              <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-700/80 p-1 flex items-center justify-center shadow-lg shadow-blue-500/10 shrink-0 overflow-hidden">
                <img src={pharmacyLogo} alt={displayName} className="w-full h-full object-contain rounded-lg" />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0" style={{ background: '#2563eb' }}>
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-100 tracking-wide truncate" style={{ margin: 0 }}>
                {displayName}
              </h1>
              <p className="text-[11px] text-blue-400 font-semibold" style={{ margin: 0 }}>أرشيف الفواتير الرقمي</p>
            </div>
          </div>

          {/* Center Navigation Links Pills */}
          <nav className="hidden md:flex items-center gap-1.5 p-1.5 rounded-2xl" style={{ background: '#0b1120', border: '1px solid #1e293b' }}>
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = activeTab === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer ${
                    isActive
                      ? 'text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 bg-transparent'
                  }`}
                  style={isActive ? { background: '#2563eb', color: '#ffffff', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' } : {}}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Left Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenEmployeeModal}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
              style={{ background: '#0f172a', border: '1px solid #334155' }}
            >
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              <span>إضافة موظف</span>
            </button>

            <button
              type="button"
              onClick={onOpenUploadModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg cursor-pointer transition transform hover:scale-[1.02]"
              style={{ background: '#2563eb', border: '1px solid #3b82f6', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}
            >
              <FilePlus className="w-4 h-4" />
              <span className="hidden sm:inline">رفع فاتورة جديدة</span>
              <span className="sm:hidden">رفع فاتورة</span>
            </button>

            <button
              type="button"
              onClick={handleSystemLogout}
              title={`تسجيل الخروج (${currentUsername})`}
              className="p-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition cursor-pointer"
              style={{ background: '#0f172a', border: '1px solid #1e293b' }}
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-xl border border-slate-700/60 transition cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900/95 border-b border-slate-800 backdrop-blur-xl px-4 pt-2 pb-5 space-y-2 animate-fade-in">
          <nav className="space-y-1">
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
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition border-0 cursor-pointer text-right ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white bg-transparent'
                  }`}
                  style={isActive ? { background: '#2563eb', color: '#ffffff' } : {}}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenEmployeeModal();
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 border border-slate-700 cursor-pointer"
            >
              <Users className="w-4 h-4 text-blue-400" />
              <span>إدارة الموظفين</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                handleSystemLogout();
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-950/40 border border-red-800/40 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
