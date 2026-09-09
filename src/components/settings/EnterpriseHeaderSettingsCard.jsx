import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';

export default function EnterpriseHeaderSettingsCard({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  ownerLocks,
  authRole,
  isOwner
}) {
  const orgSettings = state?.orgSettings || {};

  // Resolve contexts
  const authCtx = useAuth?.() || {};
  const uiCtx = useUI?.() || {};
  const effectiveAuthRole = authRole || authCtx.authRole;
  const guard = executeWithOwnerGuard || uiCtx.executeWithOwnerGuard;

  // Determine if the current session has permanent Owner authority
  const isSystemOwner = isOwner || effectiveAuthRole === 'owner' || (() => {
    try {
      return localStorage.getItem('app_auth_role') === 'owner' ||
             localStorage.getItem('app_owner_authenticated') === 'true' ||
             sessionStorage.getItem('app_owner_authenticated') === 'true' ||
             sessionStorage.getItem('app_settings_owner_tab_unlocked') === 'true';
    } catch { return false; }
  })();

  // State to track if an admin has unlocked the owner lock for this session
  const [isUnlockedByOwnerGuard, setIsUnlockedByOwnerGuard] = useState(false);
  const canEdit = isSystemOwner || isUnlockedByOwnerGuard;

  // Form State
  const [orgName, setOrgName] = useState(orgSettings.orgName || 'صيدليات مداواه');
  const [contractDept, setContractDept] = useState(orgSettings.contractDepartment || 'الإدارة العامة والشؤون القانونية والموارد البشرية');
  const [commercialReg, setCommercialReg] = useState(orgSettings.commercialRegister || '104859');
  const [taxNumber, setTaxNumber] = useState(orgSettings.taxNumber || '102-284-948');
  const [gmName, setGmName] = useState(orgSettings.generalManagerName || 'د. سيف مقرب - المدير العام للصيدليات');
  const [orgAddress, setOrgAddress] = useState(orgSettings.address || 'الفرع الرئيسي - مصر');
  const [phone, setPhone] = useState(orgSettings.phone || orgSettings.officialPhone || '');
  const [email, setEmail] = useState(orgSettings.email || orgSettings.officialEmail || '');
  const [contractTitle, setContractTitle] = useState(orgSettings.contractTitle || 'عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد');
  const [contractPrefix, setContractPrefix] = useState(orgSettings.contractNumberPrefix !== undefined ? orgSettings.contractNumberPrefix : 'CNT-Modawa@kane-');
  const [printFooterText, setPrintFooterText] = useState(orgSettings.printFooterText || 'وثيقة رسمية معتمدة صادرة آلياً من منظومة إدارة الموارد البشرية والرواتب');
  const [logoUrl, setLogoUrl] = useState(orgSettings.logoUrl || '');
  const [headerTheme, setHeaderTheme] = useState(orgSettings.headerTheme || 'emerald'); // 'emerald' | 'classic' | 'slate'
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orgSettings.orgName) setOrgName(orgSettings.orgName);
    if (orgSettings.contractDepartment) setContractDept(orgSettings.contractDepartment);
    if (orgSettings.commercialReg !== undefined || orgSettings.commercialRegister) setCommercialReg(orgSettings.commercialRegister || '');
    if (orgSettings.taxNumber) setTaxNumber(orgSettings.taxNumber);
    if (orgSettings.generalManagerName) setGmName(orgSettings.generalManagerName);
    if (orgSettings.address) setOrgAddress(orgSettings.address);
    if (orgSettings.phone || orgSettings.officialPhone) setPhone(orgSettings.phone || orgSettings.officialPhone);
    if (orgSettings.email || orgSettings.officialEmail) setEmail(orgSettings.email || orgSettings.officialEmail);
    if (orgSettings.contractTitle) setContractTitle(orgSettings.contractTitle);
    if (orgSettings.contractNumberPrefix !== undefined) setContractPrefix(orgSettings.contractNumberPrefix);
    if (orgSettings.printFooterText) setPrintFooterText(orgSettings.printFooterText);
    if (orgSettings.logoUrl) setLogoUrl(orgSettings.logoUrl);
    if (orgSettings.headerTheme) setHeaderTheme(orgSettings.headerTheme);
  }, [orgSettings]);

  // Request owner authorization to unlock editing
  const handleRequestOwnerUnlock = () => {
    if (guard) {
      guard({
        lockKey: 'lockEditEnterpriseHeader',
        actionTitle: 'تعديل ترويسة وبيانات المنشأة الرسمية',
        actionDetails: 'إدخال كلمة مرور المالك لإلغاء القفل وتعديل الترويسة وبيانات المنشأة الرسمية',
        onExecute: () => {
          setIsUnlockedByOwnerGuard(true);
          showToast?.('👑 تم فتح وتصريح تعديل الترويسة وبيانات المنشأة بصلاحيات المالك');
        }
      });
    } else {
      showToast?.('⚠️ يتطلب تعديل الترويسة تسجيل الدخول بحساب المالك (Owner)');
    }
  };

  const handleLogoUpload = (e) => {
    if (!canEdit) {
      handleRequestOwnerUnlock();
      return;
    }
    const file = e.target?.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      showToast?.('⚠️ حجم الشعار يجب أن يكون أقل من 2.5 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setLogoUrl(uploadEvent.target.result);
      showToast?.('📸 تم تحميل الشعار بنجاح');
    };
    reader.readAsDataURL(file);
  };

  const handleResetDefaults = () => {
    if (!canEdit) {
      handleRequestOwnerUnlock();
      return;
    }
    setOrgName('صيدليات مداواه');
    setContractDept('الإدارة العامة والشؤون القانونية والموارد البشرية');
    setCommercialReg('104859');
    setTaxNumber('102-284-948');
    setGmName('د. سيف مقرب - المدير العام للصيدليات');
    setOrgAddress('الفرع الرئيسي - مصر');
    setPhone('');
    setEmail('');
    setContractTitle('عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد');
    setContractPrefix('CNT-Modawa@kane-');
    setPrintFooterText('وثيقة رسمية معتمدة صادرة آلياً من منظومة إدارة الموارد البشرية والرواتب');
    setHeaderTheme('emerald');
    showToast?.('🔄 تمت استعادة القيم الافتراضية للترويسة');
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!canEdit) {
      handleRequestOwnerUnlock();
      return;
    }
    setSaving(true);

    const updatedOrgSettings = {
      ...(state?.orgSettings || {}),
      orgName: orgName.trim() || 'صيدليات مداواه',
      contractDepartment: contractDept.trim() || 'الإدارة العامة والشؤون القانونية والموارد البشرية',
      commercialRegister: commercialReg.trim() || '',
      taxNumber: taxNumber.trim() || '',
      generalManagerName: gmName.trim() || 'المدير العام',
      address: orgAddress.trim() || '',
      phone: phone.trim(),
      officialPhone: phone.trim(),
      email: email.trim(),
      officialEmail: email.trim(),
      contractTitle: contractTitle.trim() || 'عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد',
      contractNumberPrefix: contractPrefix.trim(),
      printFooterText: printFooterText.trim() || 'وثيقة رسمية معتمدة صادرة آلياً من منظومة إدارة الموارد البشرية والرواتب',
      logoUrl: logoUrl || '',
      headerTheme: headerTheme,
      updatedAt: Date.now()
    };

    const performSave = async () => {
      try {
        const updatedState = {
          ...state,
          orgSettings: updatedOrgSettings
        };
        if (setState) setState(updatedState);
        if (saveState) await saveState(updatedState);
        showToast?.('✅ تم حفظ واعتماد ترويسة وبيانات المنشأة الموحدة بنجاح');
      } catch (err) {
        console.error('Save header error:', err);
        showToast?.('❌ حدث خطأ أثناء الحفظ');
      } finally {
        setSaving(false);
      }
    };

    if (!isSystemOwner && guard) {
      guard({
        lockKey: 'lockEditEnterpriseHeader',
        actionTitle: 'حفظ واعتماد ترويسة وبيانات المنشأة الرسمية',
        actionDetails: `المنشأة: ${orgName}`,
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  const themeBorderColor = headerTheme === 'classic' ? '#334155' : headerTheme === 'slate' ? '#475569' : '#0f766e';
  const themeBgColor = headerTheme === 'classic' ? '#f8fafc' : headerTheme === 'slate' ? '#f1f5f9' : '#f0fdf4';

  const fieldInputStyle = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '13.5px',
    background: !canEdit ? 'var(--surface-muted, #f8fafc)' : 'var(--surface, #ffffff)',
    color: !canEdit ? 'var(--text-muted, #64748b)' : 'var(--text, #1e293b)',
    cursor: !canEdit ? 'not-allowed' : 'text',
    transition: 'all 0.2s ease'
  };

  return (
    <div className="card settings-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
      
      {/* Card Title & Description */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #0f766e, #0d9488)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 4px 10px rgba(15,118,110,0.25)' }}>
            🏥
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--primary-dark)' }}>
                ترويسة وبيانات المنشأة الموحدة (Universal Print Header & Enterprise Profile)
              </h3>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                background: canEdit ? '#f0fdf4' : '#fffbeb',
                color: canEdit ? '#166534' : '#b45309',
                border: `1px solid ${canEdit ? '#86efac' : '#fde68a'}`
              }}>
                {canEdit ? '👑 صلاحيات المالك' : '🔒 محمي بالمالك'}
              </span>
              {isUnlockedByOwnerGuard && !isSystemOwner && (
                <button
                  type="button"
                  onClick={() => setIsUnlockedByOwnerGuard(false)}
                  style={{
                    background: 'none',
                    border: '1px solid #fde68a',
                    color: '#b45309',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="إعادة قفل التعديل"
                >
                  🔒 قفل
                </button>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              المصدر المركزي لكافة البيانات الرسمية، الشعار، السجل التجاري، والترويسة في جميع العقود، كشوف المرتبات، والمطبوعات الإدارية.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleResetDefaults}
            disabled={!canEdit && !guard}
            style={{ fontSize: '12.5px', padding: '7px 14px', borderRadius: '8px', opacity: canEdit ? 1 : 0.7 }}
            title={canEdit ? 'استعادة القيم الافتراضية للترويسة' : 'مطلوب إذن المالك للاستعادة'}
          >
            {canEdit ? '🔄 الافتراضي' : '🔒 الافتراضي'}
          </button>
          <button
            type="button"
            className={canEdit ? "btn btn-start" : "btn btn-warning"}
            onClick={canEdit ? handleSave : handleRequestOwnerUnlock}
            disabled={saving}
            style={{
              fontSize: '13px',
              padding: '8px 20px',
              borderRadius: '8px',
              fontWeight: 800,
              background: canEdit ? undefined : 'linear-gradient(135deg, #d97706, #b45309)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {saving ? '⏳ جاري الحفظ...' : canEdit ? '💾 حفظ واعتماد الترويسة' : '🔒 فتح التعديل (إذن المالك)'}
          </button>
        </div>
      </div>



      {/* ── 1. LIVE PRINT HEADER PREVIEW (معاينة حية ومباشرة للترويسة) ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--primary-dark)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👁️</span> معاينة حية لشكل الترويسة المطبوعة (Live Print Header Preview):
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>نمط الترويسة:</span>
            <select
              value={headerTheme}
              onChange={(e) => setHeaderTheme(e.target.value)}
              disabled={!canEdit}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                fontSize: '12px',
                background: !canEdit ? 'var(--surface-muted)' : 'var(--surface)',
                cursor: !canEdit ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="emerald">🌲 زمردي حديث (Modern Emerald)</option>
              <option value="classic">🏛️ كلاسيكي معتمد (Official Classic)</option>
              <option value="slate">💼 رمادي أعمال (Executive Slate)</option>
            </select>
          </div>
        </div>

        {/* The Actual Simulated Paper Header */}
        <div style={{
          background: '#ffffff',
          border: `1.5px solid ${themeBorderColor}`,
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
          position: 'relative'
        }}>
          <div style={{ borderBottom: `2.5px double ${themeBorderColor}`, paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            
            {/* Right: Logo & Enterprise Info */}
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ maxHeight: '54px', maxWidth: '120px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <div style={{ width: '50px', height: '50px', borderRadius: '10px', background: themeBgColor, border: `1px solid ${themeBorderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>
                  🏥
                </div>
              )}
              <div>
                <h3 style={{ margin: 0, color: themeBorderColor, fontSize: '18px', fontWeight: 900, fontFamily: 'Cairo' }}>
                  {orgName || 'صيدليات مداواه'}
                </h3>
                <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, marginTop: '2px' }}>
                  {contractDept || 'الإدارة العامة والشؤون القانونية والموارد البشرية'}
                </div>
                <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                  س.ت: <strong>{commercialReg || '—'}</strong> &nbsp;|&nbsp; ب.ض: <strong>{taxNumber || '—'}</strong>
                  {phone && <>&nbsp;|&nbsp; ☎️ {phone}</>}
                </div>
              </div>
            </div>

            {/* Center: Document Badge Preview */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ background: themeBgColor, border: `2px solid ${themeBorderColor}`, padding: '5px 18px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h4 style={{ margin: 0, color: themeBorderColor, fontSize: '14px', fontWeight: 800 }}>
                  {contractTitle || 'عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد'}
                </h4>
              </div>
              <span style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                رقم المستند: <strong>{contractPrefix || 'DOC-'}1001-2026</strong>
              </span>
            </div>

            {/* Left: Signatory & Date */}
            <div style={{ textAlign: 'left', fontSize: '11px', color: '#475569', lineHeight: 1.6 }}>
              <div>تاريخ التحرير: <strong>{new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
              <div>المفوض بالتوقيع: <strong>{gmName || 'المدير العام'}</strong></div>
              <div>المقر: <strong>{orgAddress || 'المقر الرئيسي'}</strong></div>
            </div>

          </div>

          {/* Footer Preview Bar */}
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#94a3b8' }}>
            <span>🔒 ترويسة وبيانات رسمية مركزية موحدة</span>
            <span>{printFooterText}</span>
          </div>
        </div>
      </div>

      {/* ── 2. FORM FIELDS GRID (حقول الإدخال والبيانات الرسمية) ── */}
      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          
          {/* 1. Org Name */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏢</span> اسم المؤسسة / الصيدلية / الشركة:
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="مثال: صيدليات مداواه"
              required
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

          {/* 2. Department / Subtitle */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📑</span> الإدارة التابعة أو السطر التعريفي:
            </label>
            <input
              type="text"
              value={contractDept}
              onChange={(e) => setContractDept(e.target.value)}
              placeholder="مثال: الإدارة العامة والشؤون القانونية والموارد البشرية"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

          {/* 3. Commercial Register */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📄</span> رقم السجل التجاري (س.ت):
            </label>
            <input
              type="text"
              value={commercialReg}
              onChange={(e) => setCommercialReg(e.target.value)}
              placeholder="مثال: 104859"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

          {/* 4. Tax Number */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>💳</span> رقم البطاقة الضريبية (ب.ض):
            </label>
            <input
              type="text"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder="مثال: 102-284-948"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

          {/* 5. General Manager Name */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>✍️</span> المدير العام / المفوض بالتوقيع:
            </label>
            <input
              type="text"
              value={gmName}
              onChange={(e) => setGmName(e.target.value)}
              placeholder="مثال: د. سيف مقرب - المدير العام للصيدليات"
              required
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

          {/* 6. Headquarters Address */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📍</span> عنوان المقر الرئيسي للمنشأة:
            </label>
            <input
              type="text"
              value={orgAddress}
              onChange={(e) => setOrgAddress(e.target.value)}
              placeholder="مثال: الفرع الرئيسي - مصر"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

          {/* 7. Official Phone */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>☎️</span> الهاتف الرسمي للتواصل:
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="مثال: 01000000000 / 0222222222"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={{ ...fieldInputStyle, direction: 'ltr', textAlign: 'right' }}
            />
          </div>

          {/* 8. Official Email */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>✉️</span> البريد الإلكتروني الرسمي:
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@pharmacy-group.com"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={{ ...fieldInputStyle, direction: 'ltr', textAlign: 'right' }}
            />
          </div>

          {/* 9. Contract Title */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏷️</span> عنوان العقد الافتراضي في الترويسة:
            </label>
            <input
              type="text"
              value={contractTitle}
              onChange={(e) => setContractTitle(e.target.value)}
              placeholder="مثال: عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

          {/* 10. Document Prefix */}
          <div className="field">
            <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🔢</span> بادئة وصيغة ترقيم العقود:
            </label>
            <input
              type="text"
              value={contractPrefix}
              onChange={(e) => setContractPrefix(e.target.value)}
              placeholder="مثال: CNT-Modawa@kane-"
              disabled={!canEdit}
              readOnly={!canEdit}
              style={fieldInputStyle}
            />
          </div>

        </div>

        {/* 11. Print Footer Disclaimer */}
        <div className="field" style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span>📜</span> النص التذييلي الرسمي أسفل التقارير والمطبوعات (Print Footer Disclaimer):
          </label>
          <input
            type="text"
            value={printFooterText}
            onChange={(e) => setPrintFooterText(e.target.value)}
            placeholder="مثال: وثيقة رسمية معتمدة صادرة آلياً من منظومة إدارة الموارد البشرية والرواتب"
            disabled={!canEdit}
            readOnly={!canEdit}
            style={{ ...fieldInputStyle, fontSize: '13px' }}
          />
          <span style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            يظهر هذا النص كختم إلكتروني وتذييل قانوني في أسفل كل صفحة مطبوعة أو مسير رواتب يتم تصديره.
          </span>
        </div>

        {/* 12. LOGO UPLOADER SECTION */}
        <div style={{
          background: 'var(--surface-muted)',
          border: '1.5px dashed var(--border)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {logoUrl ? (
              <div style={{ position: 'relative' }}>
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ maxHeight: '56px', maxWidth: '130px', objectFit: 'contain', background: '#fff', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl('')}
                    style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="حذف الشعار"
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <div style={{ width: '54px', height: '54px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', color: 'var(--muted)' }}>
                🏥
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>
                شعار المنشأة الرسمي (Company Logo):
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                يدعم صيغ PNG, JPG, WEBP بدقة عالية ليظهر في ترويسة العقود والمطبوعات
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {!canEdit ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleRequestOwnerUnlock}
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px', color: '#b45309', background: '#fef3c7', borderColor: '#fde68a', cursor: 'pointer' }}
              >
                <span>🔒</span> رفع شعار جديد (إذن المالك)
              </button>
            ) : (
              <label className="btn btn-start" style={{ cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}>
                <span>📤</span> رفع شعار من الجهاز
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  style={{ display: 'none' }}
                />
              </label>
            )}
            {logoUrl && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={canEdit ? () => setLogoUrl('') : handleRequestOwnerUnlock}
                style={{ color: canEdit ? 'var(--danger)' : 'var(--muted)', fontSize: '12.5px', padding: '8px 14px', cursor: 'pointer' }}
              >
                {canEdit ? '🗑️ حذف الشعار' : '🔒 الشعار محمي'}
              </button>
            )}
          </div>
        </div>

        {/* Action Button Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <button
            type={canEdit ? "submit" : "button"}
            className={canEdit ? "btn btn-start" : "btn btn-warning"}
            onClick={canEdit ? undefined : handleRequestOwnerUnlock}
            disabled={saving}
            style={{
              padding: '10px 28px',
              fontSize: '14px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: canEdit ? '0 4px 12px rgba(15,118,110,0.2)' : '0 4px 12px rgba(217,119,6,0.2)',
              background: canEdit ? undefined : 'linear-gradient(135deg, #d97706, #b45309)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <span>{canEdit ? '💾' : '🔒'}</span>
            {saving ? 'جاري الحفظ...' : canEdit ? 'حفظ واعتماد الترويسة وبيانات المنشأة' : 'تعديل الترويسة والبيانات (مطلوب تفويض المالك)'}
          </button>
        </div>

      </form>

    </div>
  );
}
