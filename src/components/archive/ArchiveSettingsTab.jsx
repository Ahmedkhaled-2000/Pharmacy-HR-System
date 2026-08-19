import React, { useState, useEffect } from 'react';
import {
  Settings,
  ShieldCheck,
  RotateCcw,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  KeyRound,
  Sparkles,
  Folder,
  Image as ImageIcon
} from 'lucide-react';
import { apiArchiveSaveSettings, apiArchiveTestDrive } from '../../utils/archiveApiClient';

export default function ArchiveSettingsTab({
  settings = {},
  onSettingsSaved = () => {}
}) {
  const [pharmacyName, setPharmacyName] = useState(settings.PHARMACY_NAME || settings.pharmacyName || 'صيدلية الفلاي');
  const [pharmacyLogo, setPharmacyLogo] = useState(settings.PHARMACY_LOGO || settings.pharmacyLogo || '');
  const [geminiKey, setGeminiKey] = useState(settings.GEMINI_API_KEY || settings.geminiApiKey || '');
  const [groqKey, setGroqKey] = useState(settings.GROQ_API_KEY || settings.groqApiKey || '');
  const [driveEmail, setDriveEmail] = useState(settings.GOOGLE_CLIENT_EMAIL || settings.googleClientEmail || '');
  const [driveKey, setDriveKey] = useState(settings.GOOGLE_PRIVATE_KEY || settings.googlePrivateKey || '');
  const [driveFolder, setDriveFolder] = useState(settings.GOOGLE_DRIVE_PARENT_FOLDER_ID || settings.googleDriveParentFolderId || '');
  const [scanFolder, setScanFolder] = useState(settings.AUTO_SCAN_FOLDER_PATH || settings.autoScanFolderPath || '');

  // Connection test state
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveStatus, setDriveStatus] = useState(settings.isDriveConnected ? 'connected' : 'disconnected'); // 'connected' | 'disconnected' | 'testing'
  const [testResultMsg, setTestResultMsg] = useState('');

  // Settings Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveIsError, setSaveIsError] = useState(false);

  useEffect(() => {
    setPharmacyName(settings.PHARMACY_NAME || settings.pharmacyName || 'صيدلية الفلاي');
    setPharmacyLogo(settings.PHARMACY_LOGO || settings.pharmacyLogo || '');
    setGeminiKey(settings.GEMINI_API_KEY || settings.geminiApiKey || '');
    setGroqKey(settings.GROQ_API_KEY || settings.groqApiKey || '');
    setDriveEmail(settings.GOOGLE_CLIENT_EMAIL || settings.googleClientEmail || '');
    setDriveKey(settings.GOOGLE_PRIVATE_KEY || settings.googlePrivateKey || '');
    setDriveFolder(settings.GOOGLE_DRIVE_PARENT_FOLDER_ID || settings.googleDriveParentFolderId || '');
    setScanFolder(settings.AUTO_SCAN_FOLDER_PATH || settings.autoScanFolderPath || '');
    if (settings.GOOGLE_CLIENT_EMAIL && settings.GOOGLE_PRIVATE_KEY) {
      setDriveStatus('connected');
    }
  }, [settings]);

  const handleTestConnection = async () => {
    setIsTestingDrive(true);
    setTestResultMsg('');
    try {
      if (!driveEmail || !driveKey) {
        setDriveStatus('disconnected');
        setTestResultMsg('يرجى إدخال البريد والمفتاح الخاص لـ Google Drive أولاً');
        return;
      }
      const res = await apiArchiveTestDrive();
      if (res.success || res.connected) {
        setDriveStatus('connected');
        setTestResultMsg('✅ الاتصال بـ Google Drive سليم ويعمل بنجاح!');
      } else {
        setDriveStatus('disconnected');
        setTestResultMsg(res.error || '❌ تعذر الاتصال، يرجى مراجعة الصلاحيات والمفاتيح');
      }
    } catch {
      setDriveStatus('disconnected');
      setTestResultMsg('❌ فشل فحص الاتصال');
    } finally {
      setIsTestingDrive(false);
    }
  };

  const handleSaveAllSettings = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMsg('');
    setSaveIsError(false);

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
        setSaveMsg('تم حفظ وتطبيق كافة إعدادات النظام بنجاح!');
        onSettingsSaved(payload);
      } else {
        setSaveIsError(true);
        setSaveMsg(res.error || 'فشل حفظ الإعدادات');
      }
    } catch {
      setSaveIsError(true);
      setSaveMsg('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPharmacyLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.75rem 1.5rem 3.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── 1. Top Hero Header Card (Match Screenshot 3) ── */}
      <div style={{
        backgroundColor: '#0b1120',
        border: '1px solid #1e293b',
        borderRadius: '24px',
        padding: '2.25rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexDirection: 'row-reverse',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          backgroundColor: '#1e3a8a',
          border: '1px solid #2563eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#60a5fa',
          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
          flexShrink: 0
        }}>
          <Settings style={{ width: '28px', height: '28px' }} />
        </div>

        <div style={{ textAlign: 'right' }}>
          <h1 style={{
            fontSize: '1.65rem',
            fontWeight: 900,
            color: '#c084fc',
            margin: 0,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #c084fc 0%, #60a5fa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            إعدادات النظام والتخزين السحابي
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: 0, marginTop: '0.375rem', fontWeight: 500 }}>
            إدارة هوية الصيدلية، التوصيل المباشر مع Google Drive، وإعدادات الأمان
          </p>
        </div>
      </div>

      {/* ── 2. Google Drive Status Card (Match Screenshot 3) ── */}
      <div style={{
        backgroundColor: '#0b1120',
        border: '1px solid #1e293b',
        borderRadius: '20px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: driveStatus === 'connected' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            border: '1px solid ' + (driveStatus === 'connected' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: driveStatus === 'connected' ? '#34d399' : '#fbbf24'
          }}>
            <ShieldCheck style={{ width: '22px', height: '22px' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#f8fafc' }}>
                حالة الاتصال بـ Google Drive:
              </span>
              <span style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: driveStatus === 'connected' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: driveStatus === 'connected' ? '#34d399' : '#fbbf24',
                border: '1px solid ' + (driveStatus === 'connected' ? '#10b981' : '#f59e0b')
              }}>
                {driveStatus === 'connected' ? 'متصل بنجاح' : 'غير متصل'}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, marginTop: '2px' }}>
              {testResultMsg || 'أدخل بيانات الاعتماد أدناه للتوصيل بنجاح'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTestingDrive}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1.25rem',
            borderRadius: '12px',
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: '#f8fafc',
            backgroundColor: '#070b14',
            border: '1px solid #334155',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#60a5fa';
            e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#334155';
            e.currentTarget.style.backgroundColor = '#070b14';
          }}
        >
          {isTestingDrive ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} /> : <RotateCcw style={{ width: '14px', height: '14px' }} />}
          <span>اختبار الاتصال</span>
        </button>
      </div>

      {/* ── 3. Main Settings Form (Match Screenshot 3) ── */}
      <form onSubmit={handleSaveAllSettings} style={{
        backgroundColor: '#0b1120',
        border: '1px solid #1e293b',
        borderRadius: '24px',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
      }}>
        
        {saveMsg && (
          <div style={{
            padding: '0.875rem 1rem',
            borderRadius: '12px',
            backgroundColor: saveIsError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            border: '1px solid ' + (saveIsError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'),
            color: saveIsError ? '#f87171' : '#34d399',
            fontSize: '0.8125rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {saveIsError ? <AlertCircle style={{ width: '16px', height: '16px' }} /> : <CheckCircle2 style={{ width: '16px', height: '16px' }} />}
            <span>{saveMsg}</span>
          </div>
        )}

        {/* Field 1: Pharmacy Name */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.375rem' }}>
            📱 اسم الصيدلية / المؤسسة (PHARMACY_NAME):
          </label>
          <input
            type="text"
            required
            value={pharmacyName}
            onChange={(e) => setPharmacyName(e.target.value)}
            placeholder="صيدلية الفلاي"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              fontSize: '0.875rem',
              color: '#f8fafc',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
          <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
            يُستخدم هذا الاسم لإنشاء المجلد الرئيسي للفواتير في Google Drive وتحديث عنوان الموقع.
          </span>
        </div>

        {/* Field 2: Pharmacy Logo */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.375rem' }}>
            🖼️ شعار الصيدلية / اللوجو (PHARMACY_LOGO):
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {pharmacyLogo ? (
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                backgroundColor: '#070b14',
                border: '1px solid #334155',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                <img src={pharmacyLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ) : null}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={{
                flex: 1,
                padding: '0.625rem 1rem',
                borderRadius: '12px',
                backgroundColor: '#070b14',
                border: '1px solid #1e293b',
                fontSize: '0.75rem',
                color: '#94a3b8'
              }}
            />
          </div>
        </div>

        {/* Field 3: Google Client Email */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.375rem' }}>
            📧 البريد الإلكتروني لحساب الخدمة (GOOGLE_CLIENT_EMAIL):
          </label>
          <input
            type="text"
            value={driveEmail}
            onChange={(e) => setDriveEmail(e.target.value)}
            placeholder="archive-service@project.iam.gserviceaccount.com"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              fontSize: '0.875rem',
              color: '#f8fafc',
              outline: 'none',
              fontFamily: 'monospace',
              direction: 'ltr',
              textAlign: 'left'
            }}
          />
        </div>

        {/* Field 4: Google Private Key */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.375rem' }}>
            🔐 المفتاح الخاص للتخزين (GOOGLE_PRIVATE_KEY):
          </label>
          <textarea
            rows={3}
            value={driveKey}
            onChange={(e) => setDriveKey(e.target.value)}
            placeholder="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              fontSize: '0.75rem',
              color: '#f8fafc',
              outline: 'none',
              fontFamily: 'monospace',
              direction: 'ltr',
              textAlign: 'left',
              resize: 'vertical'
            }}
          />
        </div>

        {/* Field 5: Google Drive Parent Folder ID */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.375rem' }}>
            📁 معرّف مجلد جوجل درايف الرئيسي (GOOGLE_DRIVE_PARENT_FOLDER_ID):
          </label>
          <input
            type="text"
            value={driveFolder}
            onChange={(e) => setDriveFolder(e.target.value)}
            placeholder="1A2B3C4D5E6F7G8H9I0J..."
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              fontSize: '0.875rem',
              color: '#f8fafc',
              outline: 'none',
              fontFamily: 'monospace',
              direction: 'ltr',
              textAlign: 'left'
            }}
          />
        </div>

        {/* Field 6: Gemini API Key */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.375rem' }}>
            ✨ مفتاح Gemini AI للتحليل الذكي (GEMINI_API_KEY):
          </label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIzaSy..."
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              fontSize: '0.875rem',
              color: '#f8fafc',
              outline: 'none',
              fontFamily: 'monospace',
              direction: 'ltr',
              textAlign: 'left'
            }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSaving}
          style={{
            width: '100%',
            padding: '0.875rem 1.5rem',
            borderRadius: '12px',
            fontSize: '0.875rem',
            fontWeight: 800,
            color: '#ffffff',
            backgroundColor: '#2563eb',
            border: '1px solid #3b82f6',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            opacity: isSaving ? 0.6 : 1,
            marginTop: '0.5rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1d4ed8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb';
          }}
        >
          {isSaving ? <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> : <Save style={{ width: '16px', height: '16px' }} />}
          <span>حفظ كافة إعدادات النظام والتخزين</span>
        </button>

      </form>

    </div>
  );
}
