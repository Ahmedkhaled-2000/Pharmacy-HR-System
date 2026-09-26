import React, { useState, useEffect } from 'react';
import {
  Building2,
  UserPlus,
  Users,
  Key,
  Save,
  Edit2,
  Shield,
  Check,
  Keyboard,
  RotateCcw,
  Image as ImageIcon,
  Upload,
  Trash2,
  Eye,
  Receipt,
  Sparkles,
  Phone,
  MapPin
} from 'lucide-react';
import {
  outstockGetBranches,
  outstockSaveBranch,
  outstockGetUsers,
  outstockSaveUser,
  outstockChangePassword,
  outstockGetSettings,
  outstockSaveSettings
} from '../../../utils/outstockApiClient';
import {
  getActiveShortcuts,
  STORAGE_SHORTCUTS_KEY,
  formatShortcutDisplay,
  formatShortcutFallback
} from '../../../utils/shortcutsConfig';

/**
 * OwnerSettingsTab.jsx
 * شاشة الإعدادات والتحكم والصلاحيات للمالك والمشرف العام
 * 1. تخصيص وإدارة شعار وهوية الصيدلية بالفاتورة الرسمية A4 والإيصالات الحرارية
 * 2. إنشاء الفروع وجلب بياناتها من منظومة الرواتب وتعيين اسم مستخدم وكلمة مرور فريدين
 * 3. إنشاء وتعديل يوزرات إدارة المشتريات
 * 4. تخصيص صلاحيات فروع محددة لمسؤولي المشتريات المساعدين (Sub-Purchasing Scope)
 * 5. تعديل كلمة مرور المالك وتأمين الحساب
 * 6. تخصيص وإدارة اختصارات لوحة المفاتيح
 */
const DEFAULT_DELIVERY_ZONES = [
  'المعادي', 'المعادي الجديدة', 'زهراء المعادي', 'مدينة نصر', 'مصر الجديدة',
  'التجمع الأول', 'التجمع الخامس', 'الدقي', 'المهندسين', 'وسط البلد',
  'شبرا', 'الهرم', 'فيصل', 'المقطم', 'حلوان', 'العاشر من رمضان', 'الشيخ زايد', '6 أكتوبر'
];

const SETTINGS_SECTIONS = [
  { id: 'pharmacy_identity', title: 'هوية وشعار الصيدلية بالفاتورة', iconText: '🖼️' },
  { id: 'delivery_zones', title: 'إدارة مناطق وأحياء التوصيل', iconText: '📍' },
  { id: 'branches', title: 'إدارة وتفعيل الفروع والصيدليات', iconText: '🏢' },
  { id: 'procurement_users', title: 'يوزرات إدارة المشتريات والصلاحيات', iconText: '👥' },
  { id: 'security', title: 'تأمين حساب المالك وكلمة المرور', iconText: '🔑' },
  { id: 'shortcuts', title: 'تخصيص اختصارات لوحة المفاتيح', iconText: '⌨️' }
];

export default function OwnerSettingsTab({
  showToast,
  activeSubSectionProp = null,
  onSubSectionChange = null
}) {
  const [activeSubSection, setActiveSubSection] = useState(activeSubSectionProp || 'pharmacy_identity');

  useEffect(() => {
    if (activeSubSectionProp && activeSubSectionProp !== activeSubSection) {
      setActiveSubSection(activeSubSectionProp);
    }
  }, [activeSubSectionProp]);

  const changeSubSection = (secId) => {
    setActiveSubSection(secId);
    onSubSectionChange?.(secId);
  };

  const [deliveryZones, setDeliveryZones] = useState(() => {
    try {
      const cached = localStorage.getItem('outstock_delivery_zones');
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_DELIVERY_ZONES;
  });
  const [newZoneName, setNewZoneName] = useState('');
  const [isSavingZones, setIsSavingZones] = useState(false);

  const [shortcutsList, setShortcutsList] = useState(() => getActiveShortcuts());
  const [editingShortcutId, setEditingShortcutId] = useState(null);
  const [shortcutFormKey, setShortcutFormKey] = useState('');
  const [shortcutFormModifiers, setShortcutFormModifiers] = useState([]);

  const [branches, setBranches] = useState([]);
  const [hrBranches, setHrBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [_isLoading, setIsLoading] = useState(true);

  // إعدادات وهوية وشعار الصيدلية بالفاتورة
  const [pharmacyLogo, setPharmacyLogo] = useState('');
  const [pharmacyOrgName, setPharmacyOrgName] = useState('');
  const [pharmacySlogan, setPharmacySlogan] = useState('إدارة الصيدليات ورعاية العملاء - قسم توفير النواقص');
  const [pharmacyContactPhone, setPharmacyContactPhone] = useState('');
  const [pharmacyMainAddress, setPharmacyMainAddress] = useState('');
  const [pharmacyInvoiceFooter, setPharmacyInvoiceFooter] = useState('نسعد دائماً بخدمتكم وتوفير كافة احتياجاتكم الدوائية والطبية بأعلى معايير الجودة والسرعة ✨');
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);

  // فورم إضافة / تعديل فرع
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchUsername, setBranchUsername] = useState('');
  const [branchPassword, setBranchPassword] = useState('');
  const [isSavingBranch, setIsSavingBranch] = useState(false);

  // فورم إضافة / تعديل مستخدم مشتريات
  const [editingUser, setEditingUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('procurement');
  const [userPhone, setUserPhone] = useState('');
  const [userAllowedBranches, setUserAllowedBranches] = useState([]);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // فورم تغيير كلمة مرور المالك
  const [oldOwnerPassword, setOldOwnerPassword] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const fetchSettingsData = async () => {
    setIsLoading(true);
    try {
      const [branchRes, usersRes, settingsRes] = await Promise.all([
        outstockGetBranches(),
        outstockGetUsers(),
        outstockGetSettings()
      ]);

      if (branchRes?.success) {
        setBranches(branchRes.branches || []);
        setHrBranches(branchRes.hrBranches || []);
      }
      if (usersRes?.success) {
        setUsers(usersRes.users || []);
      }
      if (settingsRes?.success && settingsRes.settings) {
        const s = settingsRes.settings;
        setPharmacyLogo(s.pharmacyLogo || s.logoUrl || '');
        setPharmacyOrgName(s.pharmacyName || s.orgName || '');
        if (s.slogan) setPharmacySlogan(s.slogan);
        if (s.phone) setPharmacyContactPhone(s.phone);
        if (s.address) setPharmacyMainAddress(s.address);
        if (s.invoiceFooter) setPharmacyInvoiceFooter(s.invoiceFooter);
        if (Array.isArray(s.deliveryZones) && s.deliveryZones.length > 0) {
          setDeliveryZones(s.deliveryZones);
          try {
            localStorage.setItem('outstock_delivery_zones', JSON.stringify(s.deliveryZones));
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Fetch settings data error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, []);

  // حفظ قائمة مناطق التوصيل
  const persistDeliveryZones = async (updated) => {
    setDeliveryZones(updated);
    try {
      localStorage.setItem('outstock_delivery_zones', JSON.stringify(updated));
    } catch {}
    setIsSavingZones(true);
    try {
      await outstockSaveSettings({ deliveryZones: updated });
      showToast?.('✅ تم حفظ وتحديث قائمة مناطق التوصيل بنجاح');
    } catch (err) {
      console.warn('Save delivery zones error:', err);
      showToast?.('⚠️ تم الحفظ محلياً وتعذر الحفظ السحابي');
    } finally {
      setIsSavingZones(false);
    }
  };

  const handleAddDeliveryZone = (e) => {
    e.preventDefault();
    const clean = String(newZoneName || '').trim();
    if (!clean) return;
    if (deliveryZones.some(z => z.toLowerCase() === clean.toLowerCase())) {
      showToast?.('⚠️ هذه المنطقة مسجلة بالفعل بالقائمة');
      return;
    }
    const updated = [...deliveryZones, clean];
    persistDeliveryZones(updated);
    setNewZoneName('');
  };

  const handleDeleteDeliveryZone = (zoneToDelete) => {
    if (!window.confirm(`هل أنت متأكد من حذف منطقة "${zoneToDelete}" من قائمة التوصيل؟`)) return;
    const updated = deliveryZones.filter(z => z !== zoneToDelete);
    persistDeliveryZones(updated);
  };

  const handleResetDeliveryZones = () => {
    if (!window.confirm('هل تريد استعادة قائمة المناطق والأحياء الافتراضية؟')) return;
    persistDeliveryZones(DEFAULT_DELIVERY_ZONES);
  };

  // معالجة واختيار ملف الشعار وضغطه تلقائياً ليبقى فائق الجودة وخفيفاً
  const handleLogoFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast?.('⚠️ يرجى اختيار ملف صورة صالح (PNG, JPG, WebP, SVG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      if (!src) return;

      const img = new Image();
      img.onload = () => {
        const maxWidth = 550;
        const maxHeight = 300;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/png', 0.92);
        setPharmacyLogo(compressed);
        showToast?.('✅ تم استيراد وتحسين شعار الصيدلية بنجاح');
      };
      img.onerror = () => {
        setPharmacyLogo(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // حفظ هوية وشعار الصيدلية
  const handleSaveIdentitySubmit = async (e) => {
    e?.preventDefault();
    setIsSavingIdentity(true);
    try {
      const payload = {
        pharmacyLogo,
        logoUrl: pharmacyLogo,
        pharmacyName: pharmacyOrgName,
        slogan: pharmacySlogan,
        phone: pharmacyContactPhone,
        address: pharmacyMainAddress,
        invoiceFooter: pharmacyInvoiceFooter
      };

      const res = await outstockSaveSettings(payload);
      if (res?.success) {
        showToast?.('✅ تم حفظ هوية وشعار الصيدلية بنجاح، وسيظهر الشعار تلقائياً أعلى فواتير العملاء!');
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر حفظ الإعدادات'}`);
      }
    } catch {
      showToast?.('حدث خطأ أثناء حفظ هوية الصيدلية');
    } finally {
      setIsSavingIdentity(false);
    }
  };

  // عند اختيار صيدلية من قائمة فروع الرواتب
  const handleSelectHrBranch = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) return;

    const hrB = hrBranches.find(b => String(b.id) === String(selectedId));
    if (hrB) {
      // تفقد إذا كان مسجلاً بالفعل في outstock
      const existing = branches.find(b => String(b.id) === String(hrB.id));
      setEditingBranch(existing || { id: hrB.id });
      setBranchName(hrB.name || '');
      setBranchCode(hrB.branchCode || hrB.code || '');
      setBranchPhone(hrB.phone || '');
      setBranchAddress(hrB.address || '');
      // اقتراح يوزر مخصص لنظام النواقص يبدأ بـ out_ لمنع التكرار مع نظام الـ HR
      const suggestedUser = existing?.username || `out_${(hrB.branchCode || hrB.id || '').toLowerCase()}`;
      setBranchUsername(suggestedUser);
      setBranchPassword(existing?.password || '1234');
    }
  };

  // حفظ الفرع
  const handleSaveBranchSubmit = async (e) => {
    e.preventDefault();
    if (!branchName || !branchUsername) {
      showToast?.('⚠️ يرجى إدخال اسم الفرع واسم المستخدم');
      return;
    }

    const cleanU = String(branchUsername).trim().toLowerCase();
    const hrCollision = hrBranches.find(b => {
      const bU = String(b.username || '').trim().toLowerCase();
      const bC = String(b.branchCode || b.code || '').trim().toLowerCase();
      const bId = String(b.id || '').trim().toLowerCase();
      return bU === cleanU || bC === cleanU || bId === cleanU;
    });
    if (hrCollision) {
      showToast?.(`⛔ اسم المستخدم "${branchUsername}" مستخدم بالفعل لفرع (${hrCollision.name}) في نظام الـ HR. لا يمكن تكراره؛ يرجى اختيار اسم مستخدم مخصص لنظام النواقص مثل: out_${cleanU}`);
      return;
    }

    setIsSavingBranch(true);
    try {
      const branchId = editingBranch?.id || `branch_${Date.now()}`;
      const res = await outstockSaveBranch({
        id: branchId,
        name: branchName,
        code: branchCode,
        phone: branchPhone,
        address: branchAddress,
        username: branchUsername,
        password: branchPassword
      });

      if (res?.success) {
        showToast?.('✅ تم حفظ بيانات وحساب الفرع في نظام النواقص بنجاح');
        setEditingBranch(null);
        setBranchName('');
        setBranchCode('');
        setBranchPhone('');
        setBranchAddress('');
        setBranchUsername('');
        setBranchPassword('');
        fetchSettingsData();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر حفظ الفرع'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSavingBranch(false);
    }
  };

  // حفظ مستخدم المشتريات
  const handleSaveUserSubmit = async (e) => {
    e.preventDefault();
    if (!userName || !userFullName) {
      showToast?.('⚠️ يرجى إدخال اسم المستخدم والاسم الكامل');
      return;
    }

    const cleanU = String(userName).trim().toLowerCase();
    const hrCollision = hrBranches.find(b => {
      const bU = String(b.username || '').trim().toLowerCase();
      const bC = String(b.branchCode || b.code || '').trim().toLowerCase();
      return bU === cleanU || bC === cleanU;
    });
    if (hrCollision) {
      showToast?.(`⛔ اسم المستخدم "${userName}" مستخدم لفرع (${hrCollision.name}) في نظام الـ HR. يرجى اختيار اسم آخر.`);
      return;
    }

    setIsSavingUser(true);
    try {
      const res = await outstockSaveUser({
        id: editingUser?.id || null,
        username: userName,
        fullName: userFullName,
        password: userPassword,
        role: userRole,
        phone: userPhone,
        allowedBranches: userAllowedBranches
      });

      if (res?.success) {
        showToast?.('✅ تم حفظ مستخدم إدارة المشتريات وتحديد صلاحيات الفروع بنجاح');
        setEditingUser(null);
        setUserName('');
        setUserFullName('');
        setUserPassword('');
        setUserPhone('');
        setUserAllowedBranches([]);
        fetchSettingsData();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر حفظ المستخدم'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء حفظ المستخدم');
    } finally {
      setIsSavingUser(false);
    }
  };

  // تغيير كلمة مرور المالك
  const handleChangeOwnerPassSubmit = async (e) => {
    e.preventDefault();
    if (newOwnerPassword !== confirmOwnerPassword) {
      showToast?.('⚠️ كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }
    if (newOwnerPassword.length < 3) {
      showToast?.('⚠️ كلمة المرور يجب أن تكون 3 أحرف على الأقل');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await outstockChangePassword(oldOwnerPassword, newOwnerPassword);
      if (res?.success) {
        showToast?.('✅ تم تغيير كلمة مرور حساب المالك بنجاح');
        setOldOwnerPassword('');
        setNewOwnerPassword('');
        setConfirmOwnerPassword('');
      } else {
        showToast?.(`⚠️ ${res?.error || 'كلمة المرور الحالية غير صحيحة'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء التغيير');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div>
      {/* ── قائمة اختيار قسم الإعدادات (قائمة منسدلة حديثة ومدمجة) ── */}
      <div
        className="outstock-card"
        style={{
          padding: '14px 20px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#e0f2fe',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Shield size={20} color="#0d9488" />
          </div>
          <div>
            <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '700' }}>
              قسم الإعدادات والصلاحيات المعروض:
            </span>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#0f172a' }}>
              {SETTINGS_SECTIONS.find(s => s.id === activeSubSection)?.title || 'الإعدادات'}
            </h4>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '320px' }}>
          <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', whiteSpace: 'nowrap' }}>
            الانتقال إلى قسم إعدادات آخر :
          </label>
          <select
            value={activeSubSection}
            onChange={(e) => changeSubSection(e.target.value)}
            className="outstock-form-select"
            style={{
              flex: 1,
              fontWeight: '800',
              fontSize: '13.5px',
              padding: '8px 14px',
              borderColor: '#0d9488',
              backgroundColor: '#ffffff'
            }}
          >
            {SETTINGS_SECTIONS.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.iconText} {sec.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── 0. قسم هوية وشعار الصيدلية بالفاتورة ── */}
      {activeSubSection === 'pharmacy_identity' && (
        <div className="outstock-settings-grid">
          {/* بطاقة رفع الشعار وتخصيص البيانات */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '12px' }}>
              <ImageIcon size={18} color="#0d9488" />
              <span>شعار وهوية الصيدلية في الفواتير الرسمية</span>
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px', lineHeight: '1.5' }}>
              قم برفع الشعار الرسمي وتخصيص بيانات الترويسة والتذييل، وسيتم استخدام هذا الشعار تلقائياً أعلى فاتورة العميل PDF والإيصالات المطبوعة.
            </p>

            <form onSubmit={handleSaveIdentitySubmit}>
              {/* منطقة رفع ومعاينة الشعار */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'block', marginBottom: '8px' }}>
                  🖼️ شعار الصيدلية (Pharmacy Logo) *
                </label>

                <div style={{
                  border: '2px dashed #0d9488',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  position: 'relative'
                }}>
                  {pharmacyLogo ? (
                    <div>
                      <div style={{
                        maxWidth: '220px',
                        maxHeight: '120px',
                        margin: '0 auto 12px',
                        background: '#ffffff',
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img
                          src={pharmacyLogo}
                          alt="شعار الصيدلية"
                          style={{ maxHeight: '100px', maxWidth: '100%', objectFit: 'contain' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <label className="outstock-btn outstock-btn-secondary" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '12px' }}>
                          <Upload size={14} />
                          <span>تغيير الشعار</span>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleLogoFileSelect}
                          />
                        </label>
                        <button
                          type="button"
                          className="outstock-btn"
                          style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => setPharmacyLogo('')}
                        >
                          <Trash2 size={14} />
                          <span>حذف الشعار</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <ImageIcon size={38} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                      <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
                        لم يتم اختيار شعار للصيدلية بعد
                      </p>
                      <p style={{ margin: '0 0 12px', fontSize: '11.5px', color: '#64748b' }}>
                        صيغ مدعومة: PNG, JPG, WebP, SVG (يُفضل بخلفية شفافة أو بيضاء)
                      </p>
                      <label className="outstock-btn outstock-btn-primary" style={{ cursor: 'pointer', padding: '7px 16px', display: 'inline-flex' }}>
                        <Upload size={15} />
                        <span>اختيار صورة الشعار من الجهاز</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleLogoFileSelect}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* خيار إدخال رابط الشعار المباشر */}
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    أو لصق رابط الشعار المباشر (URL / Base64):
                  </label>
                  <input
                    type="text"
                    placeholder="https://... أو data:image/png;base64,..."
                    value={pharmacyLogo.startsWith('data:') ? 'بيانات الصورة مشفرة (Base64 Data)' : pharmacyLogo}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (v !== 'بيانات الصورة مشفرة (Base64 Data)') {
                        setPharmacyLogo(v);
                      }
                    }}
                    className="outstock-form-input"
                    style={{ fontSize: '11px' }}
                  />
                </div>
              </div>

              {/* حقول الهوية النصية */}
              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>اسم الصيدلية / الاسم التجاري العام *</label>
                <input
                  type="text"
                  placeholder="مثال: صيدليات الشفاء والنور"
                  value={pharmacyOrgName}
                  onChange={(e) => setPharmacyOrgName(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>الشعار النصي (Slogan) / سطر الوصف أعلى الفاتورة</label>
                <input
                  type="text"
                  placeholder="إدارة الصيدليات ورعاية العملاء - قسم توفير النواقص"
                  value={pharmacySlogan}
                  onChange={(e) => setPharmacySlogan(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-row" style={{ marginBottom: '12px' }}>
                <div className="outstock-form-group">
                  <label>هاتف خدمة العملاء الموحد</label>
                  <input
                    type="tel"
                    placeholder="01xxxxxxxxx"
                    value={pharmacyContactPhone}
                    onChange={(e) => setPharmacyContactPhone(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>
                <div className="outstock-form-group">
                  <label>العنوان الرئيسي / الإدارة</label>
                  <input
                    type="text"
                    placeholder="المقر الرئيسي - القاهرة"
                    value={pharmacyMainAddress}
                    onChange={(e) => setPharmacyMainAddress(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>
              </div>

              <div className="outstock-form-group" style={{ marginBottom: '18px' }}>
                <label>نص تذييل الفاتورة الرسمي (Footer Note)</label>
                <textarea
                  rows={2}
                  placeholder="نسعد دائماً بخدمتكم وتوفير كافة احتياجاتكم الدوائية والطبية بأعلى معايير الجودة والسرعة ✨"
                  value={pharmacyInvoiceFooter}
                  onChange={(e) => setPharmacyInvoiceFooter(e.target.value)}
                  className="outstock-form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSavingIdentity}
                className="outstock-btn outstock-btn-primary"
                style={{ width: '100%', padding: '10px 16px', fontWeight: '800' }}
              >
                <Save size={16} />
                <span>{isSavingIdentity ? 'جاري حفظ هوية الصيدلية...' : 'حفظ هوية وشعار الصيدلية بالفاتورة'}</span>
              </button>
            </form>
          </div>

          {/* بطاقة المعاينة الحية المباشرة لشكل الفاتورة */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '12px' }}>
              <Eye size={18} color="#0d9488" />
              <span>معاينة حية لترويسة فاتورة العميل (Live Invoice Preview)</span>
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>
              هكذا ستظهر الفاتورة للعميل في ملف الـ PDF وعلى الطابعة الحرارية:
            </p>

            {/* صندوق محاكاة ورقة الفاتورة A4 */}
            <div style={{
              border: '2px solid #0d9488',
              borderRadius: '12px',
              padding: '18px',
              background: '#ffffff',
              boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
            }}>
              {/* رأس الفاتورة المحاكي */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #0d9488',
                paddingBottom: '14px',
                marginBottom: '14px',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {pharmacyLogo ? (
                    <img
                      src={pharmacyLogo}
                      alt="شعار الصيدلية"
                      style={{
                        maxHeight: '65px',
                        maxWidth: '120px',
                        objectFit: 'contain',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        padding: '2px',
                        background: '#ffffff'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '65px',
                      height: '65px',
                      borderRadius: '8px',
                      background: '#f1f5f9',
                      border: '1px dashed #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94a3b8',
                      fontSize: '10px',
                      textAlign: 'center'
                    }}>
                      شعار الفاتورة
                    </div>
                  )}

                  <div>
                    <h4 style={{ margin: '0 0 3px', fontSize: '17px', fontWeight: '900', color: '#0f766e' }}>
                      {pharmacyOrgName || 'صيدلية النور والشفاء (اسم الفرع)'}
                    </h4>
                    <p style={{ margin: '2px 0', fontSize: '11px', color: '#475569' }}>
                      {pharmacySlogan}
                    </p>
                    {pharmacyContactPhone && (
                      <p style={{ margin: '2px 0', fontSize: '10.5px', color: '#64748b' }}>
                        📞 هاتف: {pharmacyContactPhone}
                      </p>
                    )}
                    {pharmacyMainAddress && (
                      <p style={{ margin: '2px 0', fontSize: '10.5px', color: '#64748b' }}>
                        📍 {pharmacyMainAddress}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                  color: '#ffffff',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  minWidth: '120px'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '800' }}>فاتورة حجز دواء</div>
                  <div style={{ fontSize: '10.5px', opacity: 0.9 }}>إيصال معتمد #1042</div>
                </div>
              </div>

              {/* عناصر وهمية داخل المعاينة */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px 12px',
                marginBottom: '10px'
              }}>
                <div>العميل: <strong>أحمد محمود</strong></div>
                <div>رقم الإيصال: <strong>#1042</strong></div>
                <div>التاريخ: <strong>{new Date().toLocaleDateString('ar-EG')}</strong></div>
                <div>الحالة: <strong style={{ color: '#0d9488' }}>قيد المتابعة والتجهيز</strong></div>
              </div>

              {/* جدول أصناف تجريبي */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '10px' }}>
                <thead>
                  <tr style={{ background: '#0f766e', color: '#fff' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>الصنف الدوائي</th>
                    <th style={{ padding: '4px 8px', textAlign: 'center' }}>الكمية</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '4px 8px' }}>Augmentin 1g Tablets</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>1 علبة</td>
                    <td style={{ padding: '4px 8px', textAlign: 'left' }}>95.00 ج.م</td>
                  </tr>
                </tbody>
              </table>

              {/* ذيل الفاتورة */}
              <div style={{
                borderTop: '1px dashed #cbd5e1',
                paddingTop: '8px',
                textAlign: 'center',
                fontSize: '10px',
                color: '#64748b'
              }}>
                {pharmacyInvoiceFooter}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 0.5 قسم إدارة مناطق وأحياء التوصيل للعملاء ── */}
      {activeSubSection === 'delivery_zones' && (
        <div className="outstock-card" style={{ maxWidth: '850px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
            <div>
              <h3 className="outstock-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <MapPin size={20} color="#0d9488" />
                <span>إدارة مناطق وأحياء التوصيل (Customer Delivery Zones)</span>
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                تظهر هذه المناطق تلقائياً في القائمة المنسدلة عند تسجيل طلب جديد لعميل في الصيدلية لتحديد موقع التوصيل بدقة وسرعة.
              </p>
            </div>
            <span style={{ background: '#f0fdfa', color: '#0d9488', border: '1px solid #ccfbf1', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>
              {deliveryZones.length} منطقة مسجلة
            </span>
          </div>

          {/* إضافة منطقة جديدة */}
          <form onSubmit={handleAddDeliveryZone} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input
              type="text"
              required
              placeholder="اكتب اسم الحي أو المنطقة الجديدة (مثل: التجمع الأول، الدقي، الشيخ زايد)..."
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              className="outstock-form-input"
              style={{ flex: 1, borderColor: '#0d9488' }}
            />
            <button
              type="submit"
              disabled={isSavingZones}
              className="outstock-btn outstock-btn-primary"
              style={{ padding: '0 20px', flexShrink: 0 }}
            >
              <span>+ إضافة المنطقة</span>
            </button>
          </form>

          {/* شبكة المناطق الحالية */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '120px', padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            {deliveryZones.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '24px 0' }}>
                لا توجد مناطق مسجلة حالياً. أضف منطقة من النموذج أعلاه أو استعد القائمة الافتراضية.
              </div>
            ) : (
              deliveryZones.map((zone, i) => (
                <div
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#0f172a',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                >
                  <MapPin size={13} color="#0d9488" />
                  <span>{zone}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteDeliveryZone(zone)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '0 2px',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: 0.75,
                      transition: 'opacity 0.15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75'; }}
                    title={`حذف منطقة ${zone}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* استعادة الافتراضي */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              onClick={handleResetDeliveryZones}
              className="outstock-btn outstock-btn-secondary"
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              <RotateCcw size={13} />
              <span>استعادة القائمة الافتراضية للمناطق</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 1. قسم إدارة الفروع وتكاملها مع نظام الرواتب ── */}
      {activeSubSection === 'branches' && (
        <div className="outstock-settings-grid">
          {/* نموذج إضافة وتعديل الفرع */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <Building2 size={18} color="#0d9488" />
              <span>{editingBranch ? `تعديل بيانات فرع (${branchName})` : 'إضافة أو ربط صيدلية جديدة'}</span>
            </h3>

            {/* قائمة جلب الصيدليات الموجودة في نظام منظومة الرواتب */}
            {hrBranches.length > 0 && (
              <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'block', marginBottom: '6px' }}>
                  📥 جلب بيانات صيدلية مسجلة في منظومة الرواتب تلقائياً:
                </label>
                <select onChange={handleSelectHrBranch} className="outstock-form-select">
                  <option value="">-- اختر صيدلية لجلب معلوماتها والتعديل عليها --</option>
                  {hrBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.branchCode || b.id})</option>
                  ))}
                </select>
              </div>
            )}

            <form onSubmit={handleSaveBranchSubmit}>
              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>اسم الصيدلية / الفرع *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: صيدلية فرع فيصل"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-row" style={{ marginBottom: '12px' }}>
                <div className="outstock-form-group">
                  <label>كود الصيدلية</label>
                  <input
                    type="text"
                    placeholder="BR-01"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>

                <div className="outstock-form-group">
                  <label>رقم هاتف الصيدلية</label>
                  <input
                    type="tel"
                    placeholder="01xxxxxxxxx"
                    value={branchPhone}
                    onChange={(e) => setBranchPhone(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>عنوان ومقر الصيدلية</label>
                <input
                  type="text"
                  placeholder="الشارع، المنطقة، المحافظة"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>
                  🔐 بيانات دخول فرع نظام النواقص (OutStock Login Credentials):
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', lineHeight: '1.5' }}>
                  💡 <b style={{ color: '#0f766e' }}>فصل تام:</b> هذا اليوزر مخصص حصرياً لدخول الفرع على نظام النواقص وطلبات الأدوية. لا يمكن استخدام نفس يوزر الفرع المسجل في الـ HR، ويُقترح استخدام البادئة <code>out_</code> (مثال: out_0).
                </div>

                <div className="outstock-form-row">
                  <div className="outstock-form-group">
                    <label>اسم المستخدم للفرع (OutStock) *</label>
                    <input
                      type="text"
                      required
                      placeholder="out_branch"
                      value={branchUsername}
                      onChange={(e) => setBranchUsername(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ textAlign: 'right' }}
                    />
                  </div>

                  <div className="outstock-form-group">
                    <label>كلمة المرور للفرع *</label>
                    <input
                      type="text"
                      required
                      placeholder="كلمة مرور الدخول"
                      value={branchPassword}
                      onChange={(e) => setBranchPassword(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ textAlign: 'right' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={isSavingBranch}
                  className="outstock-btn outstock-btn-primary"
                  style={{ flex: 1 }}
                >
                  <Save size={16} />
                  <span>{isSavingBranch ? 'جاري الحفظ...' : 'حفظ بيانات الفرع'}</span>
                </button>

                {editingBranch && (
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    onClick={() => {
                      setEditingBranch(null);
                      setBranchName('');
                      setBranchCode('');
                      setBranchPhone('');
                      setBranchAddress('');
                      setBranchUsername('');
                      setBranchPassword('');
                    }}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* قائمة الفروع الحالية المسجلة */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <span>الفروع والصيدليات المسجلة بالنظام ({branches.length})</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {branches.map(b => (
                <div
                  key={b.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{b.name}</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      اسم المستخدم: <strong dir="ltr">{b.username || '—'}</strong> | كود: {b.code || '—'}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    style={{ padding: '5px 12px', fontSize: '12px' }}
                    onClick={() => {
                      setEditingBranch(b);
                      setBranchName(b.name || '');
                      setBranchCode(b.code || '');
                      setBranchPhone(b.phone || '');
                      setBranchAddress(b.address || '');
                      setBranchUsername(b.username || '');
                      setBranchPassword(b.password || '');
                    }}
                  >
                    <Edit2 size={13} />
                    <span>تعديل</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. قسم يوزرات المشتريات وتحديد الصلاحيات المخصصة ── */}
      {activeSubSection === 'procurement_users' && (
        <div className="outstock-settings-grid">
          {/* نموذج إضافة وتعديل مستخدم مشتريات */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <UserPlus size={18} color="#0d9488" />
              <span>{editingUser ? `تعديل مستخدم (${userFullName})` : 'إنشاء يوزر جديد لإدارة المشتريات'}</span>
            </h3>

            <form onSubmit={handleSaveUserSubmit}>
              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>اسم الموظف / المسؤول الكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أ/ محمد عبد الرحمن"
                  value={userFullName}
                  onChange={(e) => setUserFullName(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-row" style={{ marginBottom: '12px' }}>
                <div className="outstock-form-group">
                  <label>اسم المستخدم للدخول (فريد) *</label>
                  <input
                    type="text"
                    required
                    placeholder="procurement_user"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>

                <div className="outstock-form-group">
                  <label>كلمة المرور *</label>
                  <input
                    type="text"
                    required
                    placeholder="كلمة مرور قوية"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>المستوى الوظيفي والصلاحية</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="outstock-form-select"
                >
                  <option value="procurement">مدير مشتريات (كامل الفروع والصلاحيات)</option>
                  <option value="procurement">مسؤول مشتريات مساعد (محدد بفروع معينة)</option>
                </select>
              </div>

              {/* اختيار الفروع المصرح بها لمسؤول المشتريات المساعد */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>
                  🏢 الفروع المصرح للمستخدم بمتابعتها والرد عليها:
                </div>
                <small style={{ color: '#64748b', display: 'block', marginBottom: '8px' }}>
                  (إذا لم تحدد فروعاً، سيتمكن المستخدم من متابعة جميع الفروع تلقائياً)
                </small>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                  {branches.map(b => {
                    const isChecked = userAllowedBranches.includes(b.id);
                    return (
                      <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUserAllowedBranches(prev => [...prev, b.id]);
                            } else {
                              setUserAllowedBranches(prev => prev.filter(id => id !== b.id));
                            }
                          }}
                        />
                        <span>{b.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="outstock-btn outstock-btn-primary"
                  style={{ flex: 1 }}
                >
                  <Save size={16} />
                  <span>{isSavingUser ? 'جاري الحفظ...' : 'حفظ بيانات المستخدم'}</span>
                </button>

                {editingUser && (
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    onClick={() => {
                      setEditingUser(null);
                      setUserName('');
                      setUserFullName('');
                      setUserPassword('');
                      setUserAllowedBranches([]);
                    }}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* قائمة مستخدمي المشتريات */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <span>فريق إدارة المشتريات</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {users.filter(u => u.role === 'procurement').map(u => (
                <div
                  key={u.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{u.full_name}</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      اسم المستخدم: <strong dir="ltr">{u.username}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }}>
                      الفروع المصرح بها:{' '}
                      {Array.isArray(u.allowed_branches) && u.allowed_branches.length > 0
                        ? `${u.allowed_branches.length} فروع مخصصة`
                        : 'جميع الفروع (صلاحية كاملة)'}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    style={{ padding: '5px 12px', fontSize: '12px' }}
                    onClick={() => {
                      setEditingUser(u);
                      setUserName(u.username || '');
                      setUserFullName(u.full_name || '');
                      setUserPassword('');
                      setUserRole(u.role || 'procurement');
                      setUserAllowedBranches(Array.isArray(u.allowed_branches) ? u.allowed_branches : []);
                    }}
                  >
                    <Edit2 size={13} />
                    <span>تعديل</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3. قسم تأمين حساب المالك ── */}
      {activeSubSection === 'security' && (
        <div className="outstock-card" style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h3 className="outstock-card-title" style={{ marginBottom: '12px' }}>
            <Key size={18} color="#0d9488" />
            <span>تأمين حساب المالك (OutStock Owner) وتغيير كلمة المرور</span>
          </h3>

          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
            الحساب الافتراضي المبدئي للمالك هو المستخدم: <strong>out</strong> وكلمة المرور: <strong>123</strong>.<br />
            لحماية المنظومة وصلاحيات التحكم، يُنصح بتعيين كلمة مرور قوية وخاصة بك الآن.
          </div>

          <form onSubmit={handleChangeOwnerPassSubmit}>
            <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
              <label>كلمة المرور الحالية *</label>
              <input
                type="password"
                required
                placeholder="كلمة المرور الحالية (123 للمرة الأولى)"
                value={oldOwnerPassword}
                onChange={(e) => setOldOwnerPassword(e.target.value)}
                className="outstock-form-input"
              />
            </div>

            <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
              <label>كلمة المرور الجديدة *</label>
              <input
                type="password"
                required
                placeholder="كلمة المرور الجديدة"
                value={newOwnerPassword}
                onChange={(e) => setNewOwnerPassword(e.target.value)}
                className="outstock-form-input"
              />
            </div>

            <div className="outstock-form-group" style={{ marginBottom: '16px' }}>
              <label>تأكيد كلمة المرور الجديدة *</label>
              <input
                type="password"
                required
                placeholder="أعد إدخال كلمة المرور الجديدة"
                value={confirmOwnerPassword}
                onChange={(e) => setConfirmOwnerPassword(e.target.value)}
                className="outstock-form-input"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingPassword}
              className="outstock-btn outstock-btn-primary"
              style={{ width: '100%', padding: '10px' }}
            >
              <Shield size={16} />
              <span>{isSavingPassword ? 'جاري التحديث...' : 'تحديث كلمة المرور وتأمين الحساب'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ── 4. قسم تخصيص وإدارة اختصارات لوحة المفاتيح ── */}
      {activeSubSection === 'shortcuts' && (
        <div className="outstock-card" style={{ maxWidth: '980px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 className="outstock-card-title" style={{ marginBottom: '4px' }}>
                <Keyboard size={18} color="#0d9488" />
                <span>إدارة وتخصيص اختصارات لوحة المفاتيح السريعة</span>
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                تسهيل وتسريع عمليات الكاشير وإدارة المشتريات بمفاتيح مختصرة قابلة للتخصيص دون التأثير على اختصارات المتصفح
              </p>
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={() => {
                localStorage.removeItem(STORAGE_SHORTCUTS_KEY);
                setShortcutsList(getActiveShortcuts());
                showToast?.('✅ تم استعادة الاختصارات الافتراضية بنجاح');
              }}
              title="استعادة الإعدادات الافتراضية"
              style={{ fontSize: '12px', padding: '7px 12px' }}
            >
              <RotateCcw size={14} />
              <span>استعادة الافتراضيات</span>
            </button>
          </div>

          <div className="outstock-table-responsive">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>الإجراء / الوظيفة</th>
                  <th style={{ width: '36%' }}>الوصف</th>
                  <th style={{ width: '20%' }}>الاختصار المخصص</th>
                  <th style={{ width: '12%' }}>البديل السريع</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>تعديل</th>
                </tr>
              </thead>
              <tbody>
                {shortcutsList.map((sc) => {
                  const isOutstock = sc.category === 'outstock';
                  const isEditing = editingShortcutId === sc.id;

                  return (
                    <tr key={sc.id} style={{ background: isOutstock ? 'rgba(13, 148, 136, 0.04)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 'bold', color: isOutstock ? '#0f766e' : '#1e293b' }}>
                          {sc.name}
                        </div>
                        {isOutstock && (
                          <span style={{ fontSize: '10px', background: '#ccfbf1', color: '#0f766e', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-block', marginTop: '2px' }}>
                            نظام النواقص
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>
                        {sc.desc}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <select
                              value={shortcutFormModifiers[0] || 'None'}
                              onChange={(e) => setShortcutFormModifiers(e.target.value === 'None' ? [] : [e.target.value])}
                              className="outstock-form-select"
                              style={{ padding: '2px 4px', fontSize: '11px', height: '28px' }}
                            >
                              <option value="None">مباشر (بدون Alt)</option>
                              <option value="Alt">Alt +</option>
                              <option value="Ctrl">Ctrl +</option>
                              <option value="Shift">Shift +</option>
                            </select>
                            <input
                              type="text"
                              value={shortcutFormKey}
                              onChange={(e) => setShortcutFormKey(e.target.value.toUpperCase())}
                              className="outstock-form-input"
                              style={{ width: '55px', height: '28px', padding: '2px 6px', textAlign: 'center', fontWeight: 'bold' }}
                              placeholder="F2"
                            />
                          </div>
                        ) : (
                          <span className="outstock-kbd-badge">
                            {formatShortcutDisplay(sc)}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {sc.fallbackKey ? (
                          <span className="outstock-kbd-badge fallback">
                            {formatShortcutFallback(sc)}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-primary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => {
                                if (!shortcutFormKey) return;
                                const updated = shortcutsList.map(item =>
                                  item.id === sc.id
                                    ? { ...item, key: shortcutFormKey, modifiers: shortcutFormModifiers }
                                    : item
                                );
                                setShortcutsList(updated);
                                localStorage.setItem(STORAGE_SHORTCUTS_KEY, JSON.stringify(updated));
                                setEditingShortcutId(null);
                                showToast?.('✅ تم حفظ الاختصار الجديد بنجاح');
                              }}
                              title="حفظ"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => setEditingShortcutId(null)}
                              title="إلغاء"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="outstock-btn outstock-btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={() => {
                              setEditingShortcutId(sc.id);
                              setShortcutFormKey(sc.key || '');
                              setShortcutFormModifiers(sc.modifiers || []);
                            }}
                            title="تعديل المفتاح"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
