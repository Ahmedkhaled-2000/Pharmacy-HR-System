import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  Bot,
  Sparkles,
  HardDrive,
  FolderSync,
  Lock,
  ShieldCheck,
  Save,
  KeyRound,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';
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

  // Auth State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  const [authIsError, setAuthIsError] = useState(false);
  const [isSavingAuth, setIsSavingAuth] = useState(false);

  // Settings Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveIsError, setSaveIsError] = useState(false);

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

  const handleChangeAuth = async (e) => {
    e.preventDefault();
    setAuthMsg('');
    setAuthIsError(false);

    if (newPassword && newPassword !== confirmPassword) {
      setAuthIsError(true);
      setAuthMsg('كلمة المرور الجديدة غير متطابقة مع تأكيد كلمة المرور');
      return;
    }

    setIsSavingAuth(true);
    try {
      const res = await apiArchiveChangeCredentials(currentPassword, newUsername, newPassword);
      if (res.success) {
        setAuthMsg('تم تحديث بيانات الدخول بنجاح!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setAuthIsError(true);
        setAuthMsg(res.error || 'فشل تحديث بيانات الدخول، تأكد من كلمة المرور الحالية');
      }
    } catch {
      setAuthIsError(true);
      setAuthMsg('حدث خطأ أثناء محاولة تحديث بيانات الدخول');
    } finally {
      setIsSavingAuth(false);
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
    <div className="space-y-6 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Top Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
            <Settings className="w-6 h-6 text-blue-400" />
            إعدادات وتهيئة نظام الأرشيف الذكي
          </h1>
          <p className="text-xs text-slate-400 mt-1" style={{ margin: '4px 0 0' }}>
            تخصيص هوية الصيدلية، مفاتيح الذكاء الاصطناعي (AI)، ومسارات الفحص التلقائي
          </p>
        </div>
      </div>

      {/* Global Settings Form */}
      <form onSubmit={handleSaveAllSettings} className="space-y-6">
        
        {/* Card 1: Pharmacy Identity */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
            <Building className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-slate-100" style={{ margin: 0 }}>هوية الصيدلية والشعار</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">اسم الصيدلية أو المجموعة *</label>
              <input
                type="text"
                required
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                placeholder="صيدليات مداواة"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <span className="text-[11px] text-slate-500 block">يظهر الاسم في ترويسة تقارير الفواتير وشيتات الطباعة A4</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">شعار الصيدلية (Logo)</label>
              <div className="flex items-center gap-4">
                {pharmacyLogo ? (
                  <div className="w-14 h-14 rounded-xl border border-slate-700 overflow-hidden bg-slate-900 flex items-center justify-center p-1 relative group">
                    <img src={pharmacyLogo} alt="Logo" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setPharmacyLogo('')}
                      className="absolute inset-0 bg-black/70 text-red-400 text-xs font-bold opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer"
                    >
                      إزالة
                    </button>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 flex items-center justify-center text-slate-500">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}

                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-950 file:text-blue-300 hover:file:bg-blue-900 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">يُفضل ملف PNG بخلفية شفافة</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: AI OCR Engine Settings */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-slate-100" style={{ margin: 0 }}>
              محركات الذكاء الاصطناعي لاستخراج وقراءة الفواتير (AI OCR Engine)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Google Gemini API Key</span>
                <span className="text-[10px] text-indigo-400 font-normal">المحرك الأساسي لقراءة الصور وPDF</span>
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Groq API Key (Llama-3 Vision)</span>
                <span className="text-[10px] text-purple-400 font-normal">المحرك السريع الاحتياطي</span>
              </label>
              <input
                type="password"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Card 3: Google Drive & Auto Scan Folder */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
            <FolderSync className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100" style={{ margin: 0 }}>
              المزامنة السحابية ومسار الفحص التلقائي المحلي
            </h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                مسار مجلد الفحص التلقائي المحلي (Auto Scan Folder Path)
              </label>
              <input
                type="text"
                value={scanFolder}
                onChange={(e) => setScanFolder(e.target.value)}
                placeholder="C:\Scanned_Invoices أو D:\Archive_Input"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <span className="text-[11px] text-slate-500 block">
                المسار المحلي على جهاز الصيدلية الذي يتم وضع صور وفواتير الإكسل به للفحص الفوري
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Google Drive Folder ID (اختياري)</label>
                <input
                  type="text"
                  value={driveFolder}
                  onChange={(e) => setDriveFolder(e.target.value)}
                  placeholder="1A2B3C4D5E..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Google Client Email (اختياري)</label>
                <input
                  type="text"
                  value={driveEmail}
                  onChange={(e) => setDriveEmail(e.target.value)}
                  placeholder="service-account@project.iam.gserviceaccount.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Global Save Button & Alert */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          {saveMsg && (
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border ${saveIsError ? 'bg-red-950/60 border-red-800 text-red-400' : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'}`}>
              {saveIsError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{saveMsg}</span>
            </div>
          )}

          <div className="mr-auto">
            <button
              type="submit"
              disabled={isSaving}
              className="px-8 py-3 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-2 shadow-xl cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ وتطبيق إعدادات الأرشيف</span>
            </button>
          </div>
        </div>

      </form>

      {/* Card 4: Change Password / Auth */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-xl mt-8">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-slate-100" style={{ margin: 0 }}>
            تغيير بيانات الدخول وحماية نظام الأرشيف
          </h2>
        </div>

        <form onSubmit={handleChangeAuth} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">اسم المستخدم الجديد (اختياري)</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="اتركه فارغاً للإبقاء على الاسم الحالي"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">كلمة المرور الحالية *</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="كلمة المرور الحالية لتأكيد الهوية"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">كلمة المرور الجديدة</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="كلمة المرور الجديدة"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 pl-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">تأكيد كلمة المرور الجديدة</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور الجديدة"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            {authMsg && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border ${authIsError ? 'bg-red-950/60 border-red-800 text-red-400' : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'}`}>
                {authIsError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{authMsg}</span>
              </div>
            )}

            <div className="mr-auto">
              <button
                type="submit"
                disabled={isSavingAuth || !currentPassword}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {isSavingAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                <span>تحديث بيانات الدخول</span>
              </button>
            </div>
          </div>
        </form>
      </div>

    </div>
  );
}
