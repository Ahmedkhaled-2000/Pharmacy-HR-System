import React, { useState } from 'react';

export default function ArchiveNavbar({
  activeTab,
  setActiveTab,
  pharmacyName = 'صيدليات مداواة',
  pharmacyLogo = '',
  onOpenUploadModal,
  onOpenEmployeeModal,
  onOpenScanModal,
  onLogout
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentUsername = getArchiveUsername();

  const handleSystemLogout = () => {
    if (!window.confirm('هل تريد بالتأكيد تسجيل الخروج من نظام الأرشيف؟')) return;
    clearArchiveSession();
    if (onLogout) onLogout();
    else window.location.reload();
  };

  const navLinks = [
    { id: 'invoices', name: 'الفواتير والأرشيف العام', icon: LayoutDashboard },
    { id: 'suppliers', name: 'الموردين', icon: Building2 },
    { id: 'employees', name: 'الموظفين', icon: Users },
    { id: 'settings', name: 'إعدادات النظام', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 glass-nav shadow-lg" style={{
      background: 'rgba(15, 23, 42, 0.9)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo & Institution Branding */}
          <div 
            onClick={() => setActiveTab('invoices')}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            {pharmacyLogo ? (
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-900 border border-slate-700/80 p-1 flex items-center justify-center shadow-md shadow-blue-500/10 shrink-0 overflow-hidden">
                <img src={pharmacyLogo} alt={pharmacyName} className="w-full h-full object-contain rounded-lg" />
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0" style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}>
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-sm sm:text-lg font-bold text-slate-100 tracking-wide truncate max-w-[170px] sm:max-w-none" style={{ margin: 0 }}>
                {pharmacyName}
              </h1>
              <p className="text-[10px] sm:text-[11px] text-blue-400 font-semibold" style={{ margin: 0 }}>نظام الأرشيف الإلكتروني الذكي</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/50">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = activeTab === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50 bg-transparent'
                  }`}
                  style={isActive ? { background: '#2563eb', color: '#ffffff' } : {}}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            {onOpenScanModal && (
              <button
                type="button"
                onClick={onOpenScanModal}
                className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
                title="فحص مجلد الفواتير تلقائياً"
              >
                <Scan className="w-3.5 h-3.5 text-cyan-400" />
                <span>فحص مجلد</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenEmployeeModal}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>إضافة موظف</span>
            </button>

            <button
              type="button"
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold text-white gradient-btn shadow-md cursor-pointer"
            >
              <FilePlus className="w-4 h-4" />
              <span className="hidden sm:inline">رفع فاتورة جديدة</span>
              <span className="sm:hidden">رفع فاتورة</span>
            </button>

            <button
              type="button"
              onClick={handleSystemLogout}
              title={`تسجيل الخروج (${currentUsername})`}
              className="hidden sm:flex p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-slate-800 transition cursor-pointer"
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
