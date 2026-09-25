import React from 'react';

export default function AdminCredentialsCard({
  orgAdminUser,
  setOrgAdminUser,
  orgAdminPass,
  setOrgAdminPass
}) {
  return (
    <div className="admin-sec-card settings-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontSize: '20px' }}>🔐</span>
        <h3 style={{ margin: 0, fontSize: '18px' }}>بيانات دخول الأدمن (حماية اللوحة)</h3>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 20px' }}>
        تعيين واسم مستخدم وكلمة المرور الخاصة بدخول لوحة الإدارة.
      </p>

      <div className="form-row" style={{ flexDirection: 'column', gap: '16px', width: '100%' }}>
        <div className="field grow" style={{ width: '100%' }}>
          <label>اسم مستخدم الأدمن (Admin Username)</label>
          <input
            type="text"
            value={orgAdminUser}
            onChange={(e) => setOrgAdminUser(e.target.value)}
            placeholder="admin"
            style={{ width: '100%' }}
          />
        </div>
        <div className="field grow" style={{ width: '100%' }}>
          <label>كلمة سر الأدمن (Admin Password)</label>
          <input
            type="password"
            value={orgAdminPass}
            onChange={(e) => setOrgAdminPass(e.target.value)}
            placeholder="123"
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
