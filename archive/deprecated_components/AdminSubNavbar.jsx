import React from 'react';

export default function AdminSubNavbar({
  adminSubTab,
  setAdminSubTab,
  setIsAdminLoggedIn
}) {
  return (
    <div className="admin-sub-navbar">
      <button
        className={`sub-nav-btn ${adminSubTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => setAdminSubTab('dashboard')}
      >
        📊 لوحة الموظفين والبصمات
      </button>
      <button
        className={`sub-nav-btn ${adminSubTab === 'whatsapp' ? 'active' : ''}`}
        onClick={() => setAdminSubTab('whatsapp')}
      >
        💬 مراسلات الواتساب والرواتب
      </button>
      <button
        className={`sub-nav-btn ${adminSubTab === 'settings' ? 'active' : ''}`}
        onClick={() => setAdminSubTab('settings')}
      >
        ⚙️ إعدادات المؤسسة والأدمن
      </button>
      <button
        className="del-btn"
        style={{ marginRight: 'auto', marginLeft: '0', fontSize: '13px' }}
        onClick={() => setIsAdminLoggedIn(false)}
      >
        🔒 خروج الأدمن
      </button>
    </div>
  );
}
