import React, { useState, useEffect } from 'react';
import { isEmployeeActive, getEmpDisplayName } from '../../utils/formatters';

export default function BranchEditorModal({
  isOpen = false,
  onClose,
  editingBranch = null,
  branches = [],
  employees = [],
  onSaveBranch,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'location' | 'phones' | 'security'

  // Form States
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchLocationUrl, setBranchLocationUrl] = useState('');
  const [branchLatitude, setBranchLatitude] = useState(null);
  const [branchLongitude, setBranchLongitude] = useState(null);
  const [branchLogo, setBranchLogo] = useState('');
  const [managerId, setManagerId] = useState('');
  const [phones, setPhones] = useState([{ id: '1', number: '', type: 'landline' }]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // UI / Validation States
  const [usernameError, setUsernameError] = useState('');
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Initialize or reset form when modal opens or editingBranch changes
  useEffect(() => {
    if (!isOpen) return;

    if (editingBranch) {
      setBranchCode(editingBranch.branchCode || editingBranch.id || '');
      setBranchName(editingBranch.name || '');
      setBranchAddress(editingBranch.address || '');
      setBranchLocationUrl(
        editingBranch.locationUrl ||
        (editingBranch.latitude && editingBranch.longitude
          ? `https://www.google.com/maps?q=${editingBranch.latitude},${editingBranch.longitude}`
          : '')
      );
      setBranchLatitude(editingBranch.latitude !== undefined ? editingBranch.latitude : null);
      setBranchLongitude(editingBranch.longitude !== undefined ? editingBranch.longitude : null);
      setBranchLogo(editingBranch.logoUrl || editingBranch.photoUrl || editingBranch.image || '');

      // Phones initialization
      if (Array.isArray(editingBranch.phones) && editingBranch.phones.length > 0) {
        setPhones(
          editingBranch.phones.map((p) => ({
            id: p.id || Math.random().toString(),
            number: p.number || '',
            type: p.type || 'landline'
          }))
        );
      } else if (editingBranch.phone && editingBranch.phone.trim()) {
        setPhones([{ id: '1', number: editingBranch.phone.trim(), type: 'landline' }]);
      } else {
        setPhones([{ id: '1', number: '', type: 'landline' }]);
      }

      setManagerId(editingBranch.managerId || '');
      setUsername(editingBranch.username || '');
      setPassword(editingBranch.password || '');
    } else {
      // New Branch auto-defaults
      setBranchCode(`BR-${branches.length + 101}`);
      setBranchName('');
      setBranchAddress('');
      setBranchLocationUrl('');
      setBranchLatitude(null);
      setBranchLongitude(null);
      setBranchLogo('');
      setPhones([{ id: Date.now().toString(), number: '', type: 'landline' }]);
      setManagerId('');

      // Auto-generate unique username
      let bIndex = branches.length + 1;
      let candidateUser = `branch_${bIndex}`;
      const isUserTaken = (cand) => {
        const u = cand.toLowerCase();
        const bTaken = branches.some((b) => b.username && b.username.trim().toLowerCase() === u);
        const eTaken = employees.some(
          (e) =>
            (e.code && String(e.code).trim().toLowerCase() === u) ||
            (e.username && String(e.username).trim().toLowerCase() === u)
        );
        return bTaken || eTaken;
      };
      while (isUserTaken(candidateUser)) {
        bIndex++;
        candidateUser = `branch_${bIndex}`;
      }

      setUsername(candidateUser);
      setPassword('123456');
    }

    setUsernameError('');
    setGpsError('');
    setIsGpsLoading(false);
    setGpsAccuracy(null);
    setActiveTab('general');
  }, [isOpen, editingBranch, branches, employees]);

  // Real-time username collision check
  const handleUsernameChange = (val) => {
    setUsername(val);
    const cleanVal = val.trim().toLowerCase();
    if (!cleanVal) {
      setUsernameError('');
      return;
    }
    const currentBranchId = editingBranch ? editingBranch.id : null;
    const duplicateBranch = branches.find(
      (b) => b.id !== currentBranchId && b.username && b.username.trim().toLowerCase() === cleanVal
    );
    const duplicateEmp = employees.find(
      (e) =>
        (e.code && String(e.code).trim().toLowerCase() === cleanVal) ||
        (e.username && String(e.username).trim().toLowerCase() === cleanVal)
    );

    if (duplicateBranch) {
      setUsernameError(`⚠️ اسم المستخدم مستخدم بالفعل لفرع "${duplicateBranch.name}"`);
    } else if (duplicateEmp) {
      setUsernameError(`⚠️ اسم المستخدم مستخدم بالفعل ككود للموظف "${duplicateEmp.name}" (كود: ${duplicateEmp.code})`);
    } else {
      setUsernameError('');
    }
  };

  // Generate safe random password
  const handleGeneratePassword = () => {
    const chars = '0123456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    let res = '';
    for (let i = 0; i < 8; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(res);
    showToast?.('🔑 تم توليد كلمة مرور عشوائية جديدة');
  };

  // Live GPS Capture via navigator.geolocation
  const handleCaptureLiveGps = () => {
    if (!navigator.geolocation) {
      const msg = 'متصفحك لا يدعم خاصية تحديد المواقع الجغرافية (Geolocation).';
      setGpsError(msg);
      showToast?.(msg);
      return;
    }

    setIsGpsLoading(true);
    setGpsError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 0);

        setBranchLatitude(lat);
        setBranchLongitude(lng);
        setGpsAccuracy(accuracy);
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        setBranchLocationUrl(mapUrl);
        setIsGpsLoading(false);
        showToast?.(`🎯 تم التقاط موقع الفرع الحالي بنجاح (دقة: ±${accuracy} متر)`);
      },
      (err) => {
        setIsGpsLoading(false);
        let msg = 'تعذر التقاط الموقع الجغرافي.';
        if (err.code === 1) {
          msg = 'تم رفض إذن تحديد الموقع. يرجى السماح بالوصول للموقع في إعدادات المتصفح.';
        } else if (err.code === 2) {
          msg = 'إشارة الموقع الجغرافي (GPS) غير متوفرة حالياً.';
        } else if (err.code === 3) {
          msg = 'استغرق تحديد الموقع وقتاً طويلاً. يرجى المحاولة ثانية.';
        }
        setGpsError(msg);
        showToast?.(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  };

  // Upload logo/photo from local device
  const handleLogoUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 2 ميجابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      setBranchLogo(loadEvt.target.result);
      showToast?.('✅ تم تحميل صورة الفرع بنجاح');
    };
    reader.readAsDataURL(file);
  };

  // Phones management
  const handleAddPhone = () => {
    setPhones([
      ...phones,
      { id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4), number: '', type: 'mobile' }
    ]);
  };

  const handlePhoneChange = (id, field, value) => {
    setPhones(
      phones.map((p) => {
        if (p.id === id) {
          if (field === 'number') {
            const numericOnly = value.replace(/\D/g, '');
            return { ...p, number: numericOnly };
          }
          return { ...p, [field]: value };
        }
        return p;
      })
    );
  };

  const handleRemovePhone = (id) => {
    if (phones.length <= 1) {
      setPhones([{ id: '1', number: '', type: 'landline' }]);
      return;
    }
    setPhones(phones.filter((p) => p.id !== id));
  };

  // Submit Handler
  const handleSubmit = (e) => {
    if (e) e.preventDefault();

    if (!branchName.trim()) {
      setActiveTab('general');
      alert('يرجى إدخال اسم الفرع');
      return;
    }

    if (usernameError) {
      setActiveTab('security');
      alert('يرجى اختيار اسم مستخدم غير مكرر للفرع');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const currentBranchId = editingBranch ? editingBranch.id : null;
    const duplicate = branches.find(
      (b) => b.id !== currentBranchId && b.username && b.username.trim().toLowerCase() === cleanUsername
    );
    if (duplicate) {
      setActiveTab('security');
      alert(`⚠️ اسم المستخدم مستخدم بالفعل لفرع "${duplicate.name}"`);
      return;
    }

    const duplicateEmp = employees.find(
      (emp) =>
        (emp.code && String(emp.code).trim().toLowerCase() === cleanUsername) ||
        (emp.username && String(emp.username).trim().toLowerCase() === cleanUsername)
    );
    if (duplicateEmp) {
      setActiveTab('security');
      alert(`⚠️ لا يمكن استخدام اسم المستخدم هذا لأنه مستخدم بالفعل ككود للموظف "${duplicateEmp.name}" (كود: ${duplicateEmp.code})`);
      return;
    }

    // Clean valid phones
    const validPhones = phones.filter((p) => p.number && p.number.trim());
    const primaryPhone = validPhones[0]?.number || '';

    const branchData = {
      id: editingBranch ? editingBranch.id : `branch_${Date.now()}`,
      branchCode: branchCode.trim(),
      name: branchName.trim(),
      address: branchAddress.trim(),
      locationUrl: branchLocationUrl.trim(),
      latitude: branchLatitude,
      longitude: branchLongitude,
      logoUrl: branchLogo,
      photoUrl: branchLogo,
      image: branchLogo,
      phone: primaryPhone,
      phones: validPhones,
      managerId,
      username: username.trim(),
      password,
      createdAt: editingBranch ? editingBranch.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSaveBranch(branchData);
    showToast?.(editingBranch ? `✅ تم تعديل بيانات فرع "${branchName}" بنجاح` : `🎉 تم إنشاء فرع "${branchName}" بنجاح`);
    onClose();
  };

  if (!isOpen) return null;

  // Selected manager object for preview
  const selectedManager = employees.find((e) => String(e.id) === String(managerId));

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(6px)'
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '840px',
          width: '95%',
          height: '88vh',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #ffffff)',
          borderRadius: '20px',
          padding: 0,
          boxShadow: '0 25px 60px -12px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* ── Modal Header Pro ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 24px 14px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            background: 'linear-gradient(to left, var(--surface), var(--surface-muted))',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: editingBranch
                  ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
                  : 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                color: editingBranch ? '#b45309' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                border: editingBranch ? '1.5px solid #fcd34d' : '1.5px solid #a7f3d0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}
            >
              {editingBranch ? '✏️' : '🏢'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text, #0f172a)', fontWeight: 800, fontFamily: 'Cairo' }}>
                  {editingBranch ? `تعديل بيانات فرع: ${editingBranch.name}` : 'إضافة فرع جديد للمؤسسة'}
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '99px',
                    fontWeight: 700,
                    background: editingBranch ? '#fef3c7' : '#dcfce7',
                    color: editingBranch ? '#92400e' : '#166534',
                    border: editingBranch ? '1px solid #fde68a' : '1px solid #86efac'
                  }}
                >
                  {editingBranch ? 'تحديث السجل' : 'فرع جديد'}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--muted, #64748b)' }}>
                إدارة هوية الفرع، الموقع الجغرافي والـ GPS، أرقام التواصل المعتمدة، وحساب تسجيل الدخول لصفحة الفرع
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost modal-close-btn"
            data-action="close"
            onClick={onClose}
            style={{
              fontSize: '18px',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Segmented Navigation Tabs ── */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 24px',
            background: 'var(--surface-muted, #f8fafc)',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            flexShrink: 0,
            overflowX: 'auto'
          }}
        >
          {[
            { id: 'general', label: 'البيانات الأساسية والهوية', icon: '🏢' },
            { id: 'location', label: 'العنوان والموقع (GPS)', icon: '📍', badge: branchLatitude ? 'معتمد' : null },
            { id: 'phones', label: 'أرقام التواصل', icon: '📞', count: phones.filter((p) => p.number).length },
            { id: 'security', label: 'حساب الدخول لصفحة الفرع', icon: '🔐' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  background: isActive ? 'var(--surface, #ffffff)' : 'transparent',
                  color: isActive ? 'var(--primary-dark, #0d9488)' : 'var(--muted, #64748b)',
                  borderColor: isActive ? 'var(--primary, #0d9488)' : 'transparent',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    style={{
                      background: isActive ? 'var(--primary, #0d9488)' : '#cbd5e1',
                      color: '#ffffff',
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '99px',
                      fontWeight: 800
                    }}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span
                    style={{
                      background: '#dcfce7',
                      color: '#166534',
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '99px',
                      fontWeight: 800,
                      border: '1px solid #86efac'
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Modal Body (Scrollable Container) ── */}
        <div
          className="modal-card-body"
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            minHeight: 0,
            padding: '22px 24px',
            boxSizing: 'border-box'
          }}
        >
          {/* ═════════ Tab 1: General & Identity ═════════ */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                {/* كود الفرع */}
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🆔</span> كود الفرع (Branch Code / ID)
                  </label>
                  <input
                    type="text"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    placeholder="مثال: BR-101"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      background: 'var(--surface-muted)'
                    }}
                    required
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                    كود الفرع التعريفي المعتمد بالنظام والتقارير المالية.
                  </span>
                </div>

                {/* اسم الفرع */}
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🏥</span> اسم الفرع الرسمي <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: صيدلية منار الكومي - الحضرة الجديدة"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid var(--primary)',
                      fontWeight: 800,
                      background: 'var(--surface)'
                    }}
                    required
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                    الاسم الذي يظهر للجمهور، الموظفين، وقوائم التقارير.
                  </span>
                </div>
              </div>

              {/* تعيين مدير الفرع */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>👔</span> مدير / كابتن الفرع المكلف
                </label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--border)',
                    background: managerId ? 'var(--surface)' : '#fffbeb',
                    fontWeight: 700,
                    fontSize: '13.5px'
                  }}
                >
                  <option value="">🚫 فرع بدون مدير مباشر (تحويل كافة الطلبات للإدارة العليا)</option>
                  {employees.filter(isEmployeeActive).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      👤 {getEmpDisplayName(emp)} (كود: {emp.code} · وظيفة: {emp.jobTitle || 'موظف'})
                    </option>
                  ))}
                </select>

                {selectedManager ? (
                  <div
                    style={{
                      marginTop: '8px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <div style={{ fontSize: '24px' }}>👨‍💼</div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#166534' }}>
                        تم تعيين {getEmpDisplayName(selectedManager)} كمدير مسؤول عن هذا الفرع
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#15803d' }}>
                        كود: {selectedManager.code} · الوظيفة: {selectedManager.jobTitle} {selectedManager.phone ? `· هاتف: ${selectedManager.phone}` : ''}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: '8px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      color: '#b45309',
                      fontSize: '12px',
                      fontWeight: 700,
                      lineHeight: 1.5
                    }}
                  >
                    ⚡ في حال اختيار (فرع بدون مدير): سيتم إرسال كافة طلبات موظفي هذا الفرع (إجازات، أذونات، سلف، استقالات، إلخ) مباشرة إلى الإدارة العليا للاعتماد النهائي.
                  </div>
                )}
              </div>

              {/* صورة أو شعار الفرع مع معاينة فورية */}
              <div
                style={{
                  background: 'var(--surface-muted, #f8fafc)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: '14px',
                  padding: '16px 18px'
                }}
              >
                <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <span>🖼️</span> صورة أو شعار واجهة الفرع (Branch Photo)
                </label>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* صندوق المعاينة */}
                  <div
                    style={{
                      width: '74px',
                      height: '74px',
                      borderRadius: '14px',
                      border: '2px dashed var(--border, #cbd5e1)',
                      background: 'var(--surface, #ffffff)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}
                  >
                    {branchLogo ? (
                      <img src={branchLogo} alt="Branch Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '32px', opacity: 0.5 }}>🏢</span>
                    )}
                  </div>

                  {/* أزرار الإجراءات وحقل الرابط */}
                  <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <label
                        className="btn"
                        style={{
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                          color: '#ffffff',
                          fontWeight: 700,
                          borderRadius: '8px',
                          fontSize: '12.5px',
                          boxShadow: '0 2px 6px rgba(13, 148, 136, 0.2)'
                        }}
                      >
                        📁 اختيار صورة من جهازك
                        <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                      </label>

                      {branchLogo && (
                        <button
                          type="button"
                          className="del-btn"
                          onClick={() => setBranchLogo('')}
                          style={{ padding: '7px 12px', fontSize: '12px', borderRadius: '8px' }}
                        >
                          🗑️ إزالة الصورة
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder="أو الصق رابط صورة خارجية مباشرة (URL)..."
                      value={branchLogo}
                      onChange={(e) => setBranchLogo(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '12px',
                        direction: 'ltr',
                        background: 'var(--surface)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═════════ Tab 2: Address & Live GPS ═════════ */}
          {activeTab === 'location' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* العنوان بالتفصيل */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🏢</span> عنوان الفرع بالتفصيل وأقرب نقطة دالة
                </label>
                <textarea
                  rows={3}
                  placeholder="مثال: 115 شارع قناة السويس الرئيسي، بجوار حلواني أبو عمر، محرم بك، الإسكندرية"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    background: 'var(--surface)',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                  العنوان الواضح يساعد موظفي الدليفري والعملاء في سرعة الوصول وتوجيه الشحنات.
                </span>
              </div>

              {/* قسم الموقع الجغرافي والـ GPS الحي */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                  border: '1.5px solid #86efac',
                  borderRadius: '14px',
                  padding: '18px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                  <label style={{ fontWeight: 800, color: '#166534', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    <span>📍</span> إحداثيات وموقع خرائط جوجل (Google Maps / GPS Live)
                  </label>

                  <button
                    type="button"
                    onClick={handleCaptureLiveGps}
                    disabled={isGpsLoading}
                    style={{
                      background: isGpsLoading ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: isGpsLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                    }}
                  >
                    {isGpsLoading ? (
                      <>
                        <span className="spinner" style={{ width: '12px', height: '12px' }}></span>
                        <span>جاري تحديد الموقع...</span>
                      </>
                    ) : (
                      <>
                        <span>🎯</span>
                        <span>التقاط الموقع المباشر (GPS Live)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* حقل الرابط */}
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="https://maps.google.com/?q=... أو استخدم زر الالتقاط المباشر"
                    value={branchLocationUrl}
                    onChange={(e) => setBranchLocationUrl(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #a7f3d0',
                      direction: 'ltr',
                      fontSize: '12.5px',
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {gpsError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
                    ⚠️ {gpsError}
                  </div>
                )}

                {/* بطاقة الإحداثيات المعتمدة إن وُجدت */}
                {branchLatitude && branchLongitude ? (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #86efac',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>✅</span>
                      <div style={{ fontSize: '12.5px', color: '#166534', fontWeight: 700 }}>
                        الإحداثيات الجغرافية: <code style={{ direction: 'ltr', display: 'inline-block' }}>{Number(branchLatitude).toFixed(5)}, {Number(branchLongitude).toFixed(5)}</code>
                        {gpsAccuracy && <span style={{ color: '#047857', marginRight: '6px' }}>(دقة: ±{gpsAccuracy} متر)</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {branchLocationUrl && (
                        <a
                          href={branchLocationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>🗺️</span>
                          <span>معاينة بالخرائط ↗</span>
                        </a>
                      )}

                      <button
                        type="button"
                        className="del-btn"
                        onClick={() => {
                          setBranchLatitude(null);
                          setBranchLongitude(null);
                          setBranchLocationUrl('');
                          setGpsAccuracy(null);
                        }}
                        style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '6px' }}
                      >
                        إلغاء الإحداثيات
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#047857', opacity: 0.85 }}>
                    💡 اضغط على زر "التقاط الموقع المباشر" أثناء وجودك داخل الفرع لتسجيل خطوط الطول والعرض بدقة وحفظها للسائقين والعملاء.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═════════ Tab 3: Branch Phones ═════════ */}
          {activeTab === 'phones' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'var(--surface-muted, #f8fafc)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: '14px',
                  padding: '16px 18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
                      📞 قائمة أرقام هواتف وتواصل الفرع
                    </h4>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      يمكنك تسجيل عدة خطوط أرضية، هواتف محمولة، أو أرقام مخصصة لطلبيات الواتساب.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddPhone}
                    style={{
                      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 6px rgba(13, 148, 136, 0.2)'
                    }}
                  >
                    <span>➕</span>
                    <span>إضافة رقم آخر</span>
                  </button>
                </div>

                {/* قائمة الحقول */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {phones.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        background: 'var(--surface, #ffffff)',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <select
                        value={p.type || 'landline'}
                        onChange={(e) => handlePhoneChange(p.id, 'type', e.target.value)}
                        style={{
                          width: '140px',
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          fontSize: '12.5px',
                          fontWeight: 700
                        }}
                      >
                        <option value="landline">☎️ خط أرضي</option>
                        <option value="mobile">📱 هاتف محمول</option>
                        <option value="whatsapp">💬 واتساب طلبيات</option>
                      </select>

                      <input
                        type="text"
                        placeholder="أرقام فقط (مثال: 034265774 أو 01156036080)"
                        value={p.number}
                        onChange={(e) => handlePhoneChange(p.id, 'number', e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          fontSize: '13.5px',
                          direction: 'ltr',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          fontWeight: 700
                        }}
                      />

                      {phones.length > 1 && (
                        <button
                          type="button"
                          className="del-btn"
                          onClick={() => handleRemovePhone(p.id)}
                          style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px' }}
                          title="حذف هذا الرقم"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>
                  * الرقم الأول المسجل في القائمة سيتم اعتماده كرقم رئيسي ومباشر للاتصال في دليل هواتف الفروع.
                </div>
              </div>
            </div>
          )}

          {/* ═════════ Tab 4: Branch Security & Login ═════════ */}
          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '16px 18px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px' }}>🔐</span>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
                    بيانات تسجيل الدخول لحساب صفحة الفرع
                  </h4>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                  تُستخدم هذه البيانات لدخول مدير الفرع أو الكاشير المسؤول إلى لوحة تحكم الفرع الخاصة لإدارة حضور وانصراف الموظفين والطلبات التشغيلية اليومية.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                {/* اسم المستخدم */}
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👤</span> اسم المستخدم (Username) <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: usernameError ? '1.5px solid var(--danger, #ef4444)' : '1px solid var(--border)',
                      fontWeight: 700,
                      direction: 'ltr',
                      background: 'var(--surface)'
                    }}
                    required
                  />
                  {usernameError ? (
                    <span style={{ color: '#dc2626', fontSize: '11.5px', fontWeight: 800, marginTop: '4px', display: 'block' }}>
                      {usernameError}
                    </span>
                  ) : (
                    <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                      ✓ اسم المستخدم متاح وفريد
                    </span>
                  )}
                </div>

                {/* كلمة المرور */}
                <div className="field" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <span>🔑</span> كلمة المرور (Password) <span style={{ color: 'red' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary, #0d9488)',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      ⚡ توليد كلمة سر
                    </button>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 38px 10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        fontWeight: 700,
                        direction: 'ltr',
                        background: 'var(--surface)',
                        boxSizing: 'border-box'
                      }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: 'var(--muted)'
                      }}
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer Pro ── */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 24px',
            borderTop: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface, #ffffff)',
            flexShrink: 0,
            marginTop: 'auto',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* التنقل السريع بين التبويبات */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeTab !== 'general' && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const tabs = ['general', 'location', 'phones', 'security'];
                  const idx = tabs.indexOf(activeTab);
                  if (idx > 0) setActiveTab(tabs[idx - 1]);
                }}
                style={{ fontSize: '12.5px', padding: '7px 12px', fontWeight: 700 }}
              >
                ‹ السابق
              </button>
            )}

            {activeTab !== 'security' && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const tabs = ['general', 'location', 'phones', 'security'];
                  const idx = tabs.indexOf(activeTab);
                  if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
                }}
                style={{ fontSize: '12.5px', padding: '7px 12px', fontWeight: 700, color: 'var(--primary)' }}
              >
                التالي ›
              </button>
            )}
          </div>

          {/* أزرار الإلغاء والحفظ */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ padding: '8px 18px', fontWeight: 700, fontSize: '13px' }}
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              style={{
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '9px 24px',
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: '13.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
              }}
            >
              <span>💾</span>
              <span>{editingBranch ? 'حفظ تعديلات الفرع' : 'تأكيد إضافة الفرع'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
