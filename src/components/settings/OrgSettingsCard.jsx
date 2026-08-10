import React from 'react';

export default function OrgSettingsCard({
  orgNameInput,
  setOrgNameInput,
  orgLogoUrlInput,
  setOrgLogoUrlInput,
  handleFileUpload,
  biometricType,
  setBiometricType
}) {
  return (
    <div className="org-settings-card settings-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <span style={{ fontSize: '20px' }}>🏢</span>
        <h3 style={{ margin: 0, fontSize: '18px' }}>اسم وشعار المؤسسة</h3>
      </div>

      <div className="form-row" style={{ flexDirection: 'column', gap: '16px', width: '100%' }}>
        <div className="field grow" style={{ width: '100%' }}>
          <label>اسم المؤسسة / الصيدلية / الشركة</label>
          <input
            type="text"
            value={orgNameInput}
            onChange={(e) => setOrgNameInput(e.target.value)}
            placeholder="مثال: مؤسسة الموارد البشرية والبصمات"
            style={{ width: '100%' }}
          />
        </div>

        <div className="field grow" style={{ width: '100%' }}>
          <label>شعار المؤسسة (Upload Company Logo)</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={orgLogoUrlInput}
              onChange={(e) => setOrgLogoUrlInput(e.target.value)}
              placeholder="رابط الصورة أو اختر صورة مباشرة..."
              style={{ flex: '1 1 240px', width: '100%' }}
            />
            <label className="btn btn-ghost" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
              📁 اختر صورة من الجهاز
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, (dataUrl) => setOrgLogoUrlInput(dataUrl))}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          {orgLogoUrlInput && (
            <div style={{ marginTop: '10px', textAlign: 'right' }}>
              <img src={orgLogoUrlInput} alt="Logo Preview" style={{ maxHeight: '70px', borderRadius: '10px', border: '1px solid var(--border)' }} />
              <button
                type="button"
                className="del-btn"
                style={{ display: 'block', margin: '4px 0 0' }}
                onClick={() => setOrgLogoUrlInput('')}
              >
                حذف الشعار
              </button>
            </div>
          )}
        </div>

        <div className="field grow" style={{ width: '100%', marginTop: '16px' }}>
          <label>طريقة البصمة الافتراضية (Biometric Type)</label>
          <select
            value={biometricType}
            onChange={(e) => setBiometricType(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
          >
            <option value="face">بصمة الوجه (Face Recognition & Liveness)</option>
            <option value="hand">بصمة اليد (Hand Geometry 3D)</option>
          </select>
          <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            اختر التقنية المعتمدة لتوثيق حضور الموظفين في المنصة.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontSize: '20px' }}>📟</span>
          <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--primary)' }}>رابط البصمة الإلكترونية المستقل (Kiosk Terminal)</h4>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 12px 0' }}>
          يمكنك نسخ الرابط الخاص بصفحة البصمة الإلكترونية وتثبيته على أجهزة الصيدليات والفروع لتمكين الموظفين من توثيق الحضور والانصراف.
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            readOnly
            value={window.location.origin + '/kiosk'}
            style={{ flex: '1 1 260px', background: 'var(--surface-muted)', fontWeight: 600, direction: 'ltr', textAlign: 'left' }}
          />
          <button
            type="button"
            className="btn btn-start"
            onClick={() => {
              const link = window.location.origin + '/kiosk';
              navigator.clipboard.writeText(link);
              alert('✅ تم نسخ رابط البصمة الإلكترونية إلى الحافظة بنجاح!\n' + link);
            }}
          >
            📋 نسخ رابط البصمة الإلكترونية
          </button>
        </div>
      </div>
    </div>
  );
}
