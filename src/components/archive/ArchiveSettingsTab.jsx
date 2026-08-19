import React, { useState, useEffect } from 'react';
import { apiArchiveSaveSettings, apiArchiveChangeCredentials } from '../../utils/archiveApiClient';

export default function ArchiveSettingsTab({
  settings = {},
  onSettingsSaved = () => {}
}) {
  const [pharmacyName, setPharmacyName] = useState(settings.PHARMACY_NAME || 'صيدليات مداواة');
  const [pharmacyLogo, setPharmacyLogo] = useState(settings.PHARMACY_LOGO || '');
  const [geminiKey, setGeminiKey] = useState(settings.GEMINI_API_KEY || '');
  const [groqKey, setGroqKey] = useState(settings.GROQ_API_KEY || '');
  const [driveEmail, setDriveEmail] = useState(settings.GOOGLE_CLIENT_EMAIL || '');
  const [driveKey, setDriveKey] = useState(settings.GOOGLE_PRIVATE_KEY || '');
  const [driveFolder, setDriveFolder] = useState(settings.GOOGLE_DRIVE_PARENT_FOLDER_ID || '');
  const [scanFolder, setScanFolder] = useState(settings.AUTO_SCAN_FOLDER_PATH || '');

  // Auth Changer State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [authIsError, setAuthIsError] = useState(false);
  const [isSavingAuth, setIsSavingAuth] = useState(false);

  // Settings Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    setPharmacyName(settings.PHARMACY_NAME || 'صيدليات مداواة');
    setPharmacyLogo(settings.PHARMACY_LOGO || '');
    setGeminiKey(settings.GEMINI_API_KEY || '');
    setGroqKey(settings.GROQ_API_KEY || '');
    setDriveEmail(settings.GOOGLE_CLIENT_EMAIL || '');
    setDriveKey(settings.GOOGLE_PRIVATE_KEY || '');
    setDriveFolder(settings.GOOGLE_DRIVE_PARENT_FOLDER_ID || '');
    setScanFolder(settings.AUTO_SCAN_FOLDER_PATH || '');
  }, [settings]);

  const handleSaveAllSettings = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMsg('');

    try {
      const payload = {
        PHARMACY_NAME: pharmacyName,
        PHARMACY_LOGO: pharmacyLogo,
        GEMINI_API_KEY: geminiKey,
        GROQ_API_KEY: groqKey,
        GOOGLE_CLIENT_EMAIL: driveEmail,
        GOOGLE_PRIVATE_KEY: driveKey,
        GOOGLE_DRIVE_PARENT_FOLDER_ID: driveFolder,
        AUTO_SCAN_FOLDER_PATH: scanFolder,
      };

      const res = await apiArchiveSaveSettings(payload);
      if (res.success) {
        setSaveMsg('✅ تم حفظ كافة الإعدادات بنجاح!');
        onSettingsSaved();
      } else {
        setSaveMsg('❌ فشل حفظ الإعدادات');
      }
    } catch (err) {
      setSaveMsg('❌ حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeAuth = async (e) => {
    e.preventDefault();
    setAuthMsg('');
    setAuthIsError(false);

    if (newPassword && newPassword !== confirmPassword) {
      setAuthMsg('❌ كلمة المرور الجديدة وتأكيدها غير متطابقين');
      setAuthIsError(true);
      return;
    }

    if (!currentPassword) {
      setAuthMsg('❌ يرجى إدخال كلمة المرور الحالية للتأكيد');
      setAuthIsError(true);
      return;
    }

    setIsSavingAuth(true);
    try {
      const res = await apiArchiveChangeCredentials(currentPassword, newUsername, newPassword);
      if (res.success) {
        setAuthMsg('✅ تم تحديث بيانات دخول المشرف بنجاح!');
        setAuthIsError(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setAuthMsg(`❌ ${res.error || 'فشل التحديث'}`);
        setAuthIsError(true);
      }
    } catch (err) {
      setAuthMsg('❌ حدث خطأ أثناء الاتصال بالخادم');
      setAuthIsError(true);
    } finally {
      setIsSavingAuth(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* 1. Main Settings Form */}
      <form onSubmit={handleSaveAllSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {saveMsg && (
          <div style={{
            background: saveMsg.startsWith('✅') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${saveMsg.startsWith('✅') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: '14px',
            padding: '12px 18px',
            color: saveMsg.startsWith('✅') ? '#34d399' : '#f87171',
            fontSize: '0.9rem',
            fontWeight: 700
          }}>
            {saveMsg}
          </div>
        )}

        {/* Branding Card */}
        <div className="arch-table-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '1.4rem' }}>🏥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
                هوية واسم الصيدلية
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                تظهر في رأس الصفحات والتقارير المطبوعة
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="arch-input-group">
              <label className="arch-input-label">اسم الصيدلية أو المؤسسة</label>
              <input
                type="text"
                className="arch-input"
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                placeholder="صيدليات مداواة"
              />
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">رابط أو مسار الشعار (Logo URL)</label>
              <input
                type="text"
                className="arch-input"
                value={pharmacyLogo}
                onChange={(e) => setPharmacyLogo(e.target.value)}
                placeholder="https://... أو /logo.png"
              />
            </div>
          </div>
        </div>

        {/* AI Configurations Card */}
        <div className="arch-table-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '1.4rem' }}>✨</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
                محركات الذكاء الاصطناعي لاستخراج الفواتير (AI Vision OCR)
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                دعم كامل لـ Google Gemini 2.5 Flash و Groq Llama 3.2 Vision
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="arch-input-group">
              <label className="arch-input-label">
                Google Gemini API Key (Gemini 2.5 Flash / 2.0 Flash OCR)
              </label>
              <input
                type="password"
                className="arch-input"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                يمكنك الحصول عليه مجاناً من Google AI Studio
              </span>
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">
                Groq Vision API Key (Llama 3.2 11B Vision - فائق السرعة)
              </label>
              <input
                type="password"
                className="arch-input"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="gsk_..."
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                يوفر استجابة فورية أقل من ثانية واحدة لاستخراج الفواتير المعقدة
              </span>
            </div>
          </div>
        </div>

        {/* Cloud & Auto-Scan Card */}
        <div className="arch-table-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '1.4rem' }}>☁️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
                التخزين السحابي والفحص الآلي (Google Drive & Folders)
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                ربط Google Drive لحفظ نسخ الفواتير وتحديد مجلد الفحص الآلي
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="arch-input-group">
              <label className="arch-input-label">Google Client Email (Service Account)</label>
              <input
                type="email"
                className="arch-input"
                value={driveEmail}
                onChange={(e) => setDriveEmail(e.target.value)}
                placeholder="service-account@project.iam.gserviceaccount.com"
              />
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">Google Drive Parent Folder ID</label>
              <input
                type="text"
                className="arch-input"
                value={driveFolder}
                onChange={(e) => setDriveFolder(e.target.value)}
                placeholder="1a2b3c4d5e..."
              />
            </div>

            <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
              <label className="arch-input-label">Google Private Key</label>
              <textarea
                className="arch-input"
                rows="2"
                value={driveKey}
                onChange={(e) => setDriveKey(e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
              />
            </div>

            <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
              <label className="arch-input-label">مسار مجلد الفحص الآلي المحلي (Auto-Scan Local Folder)</label>
              <input
                type="text"
                className="arch-input"
                value={scanFolder}
                onChange={(e) => setScanFolder(e.target.value)}
                placeholder="C:\Invoices_Inbox أو /var/invoices"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="arch-btn-primary"
          disabled={isSaving}
          style={{ padding: '12px 24px', fontSize: '1rem', alignSelf: 'flex-start' }}
        >
          {isSaving ? 'جاري حفظ الإعدادات...' : '💾 حفظ كافة إعدادات الأرشيف'}
        </button>

      </form>

      {/* 2. Change Archive Admin Login Credentials */}
      <div className="arch-table-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '1.4rem' }}>🔐</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
              تغيير بيانات تسجيل الدخول لأرشيف الصيدلية
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              بيانات دخول مستقلة خاصة بمشرف الأرشيف
            </span>
          </div>
        </div>

        {authMsg && (
          <div style={{
            background: authIsError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${authIsError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            borderRadius: '12px',
            padding: '10px 16px',
            color: authIsError ? '#f87171' : '#34d399',
            fontSize: '0.85rem',
            marginBottom: '16px'
          }}>
            {authMsg}
          </div>
        )}

        <form onSubmit={handleChangeAuth} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
          <div className="arch-input-group">
            <label className="arch-input-label">كلمة المرور الحالية *</label>
            <input
              type="password"
              className="arch-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••"
              required
            />
          </div>

          <div className="arch-input-group">
            <label className="arch-input-label">اسم المستخدم الجديد</label>
            <input
              type="text"
              className="arch-input"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="اتركه فارغاً للإبقاء على الحالي"
            />
          </div>

          <div className="arch-input-group">
            <label className="arch-input-label">كلمة المرور الجديدة</label>
            <input
              type="password"
              className="arch-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••"
            />
          </div>

          <div className="arch-input-group">
            <label className="arch-input-label">تأكيد كلمة المرور الجديدة</label>
            <input
              type="password"
              className="arch-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••"
            />
          </div>

          <button
            type="submit"
            className="arch-btn-secondary"
            disabled={isSavingAuth}
            style={{ padding: '10px 18px', height: '42px' }}
          >
            {isSavingAuth ? 'جاري التحديث...' : '🔒 تحديث كلمة المرور'}
          </button>
        </form>
      </div>

    </div>
  );
}
