import React, { useState } from 'react';
import BranchPhonesDirectoryModal from './BranchPhonesDirectoryModal';
import BranchAddressesModal from './BranchAddressesModal';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export default function BranchManagementModule({
  state,
  onSaveBranch,
  onDeleteBranch,
  onSwitchSubTab,
  onOpenBranchRoster,
  showToast
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPhonesModalOpen, setIsPhonesModalOpen] = useState(false);
  const [showAddressesModal, setShowAddressesModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchLocationUrl, setBranchLocationUrl] = useState('');
  const [branchLatitude, setBranchLatitude] = useState(null);
  const [branchLongitude, setBranchLongitude] = useState(null);
  const [isFormGpsLoading, setIsFormGpsLoading] = useState(false);
  const [formGpsError, setFormGpsError] = useState('');
  const [branchLogo, setBranchLogo] = useState('');
  // Multiple phone numbers state: array of { id, number, type: 'mobile' | 'landline' | 'whatsapp' }
  const [phones, setPhones] = useState([
    { id: '1', number: '', type: 'landline' }
  ]);
  const [managerId, setManagerId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const handleBranchLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('⚠️ يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setBranchLogo(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  const branches = state.branches || [];
  const employees = state.employees || [];

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
      (e) => (e.code && String(e.code).trim().toLowerCase() === cleanVal) ||
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

  const handleFormCaptureLiveGps = () => {
    if (!navigator.geolocation) {
      setFormGpsError('متصفحك لا يدعم خاصية تحديد المواقع الجغرافية (Geolocation).');
      return;
    }

    setIsFormGpsLoading(true);
    setFormGpsError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 0);

        setBranchLatitude(lat);
        setBranchLongitude(lng);
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        setBranchLocationUrl(mapUrl);
        setIsFormGpsLoading(false);
        showToast?.(`🎯 تم التقاط موقع الفرع الحالي بنجاح (دقة: ±${accuracy} متر)`);
      },
      (err) => {
        setIsFormGpsLoading(false);
        let msg = 'تعذر التقاط الموقع الجغرافي.';
        if (err.code === 1) {
          msg = 'تم رفض إذن تحديد الموقع. يرجى السماح بالوصول للموقع في إعدادات المتصفح.';
        } else if (err.code === 2) {
          msg = 'إشارة الموقع الجغرافي (GPS) غير متوفرة حالياً.';
        } else if (err.code === 3) {
          msg = 'استغرق تحديد الموقع وقتاً طويلاً. يرجى المحاولة ثانية.';
        }
        setFormGpsError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  };

  const handleOpenAdd = () => {
    setEditingBranch(null);
    setBranchCode(`BR-${branches.length + 101}`);
    setBranchName('');
    setBranchAddress('');
    setBranchLocationUrl('');
    setBranchLatitude(null);
    setBranchLongitude(null);
    setFormGpsError('');
    setIsFormGpsLoading(false);
    setBranchLogo('');
    setPhones([
      { id: Date.now().toString(), number: '', type: 'landline' }
    ]);
    setManagerId('');
    
    // Auto-generate safe username that doesn't conflict with existing branches or employee codes
    let bIndex = branches.length + 1;
    let candidateUser = `branch_${bIndex}`;
    const isUserTaken = (cand) => {
      const u = cand.toLowerCase();
      const bTaken = branches.some(b => b.username && b.username.trim().toLowerCase() === u);
      const eTaken = employees.some(e => 
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
    setUsernameError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (branch) => {
    setEditingBranch(branch);
    setBranchCode(branch.branchCode || '');
    setBranchName(branch.name || '');
    setBranchAddress(branch.address || '');
    setBranchLocationUrl(branch.locationUrl || (branch.latitude && branch.longitude ? `https://www.google.com/maps?q=${branch.latitude},${branch.longitude}` : ''));
    setBranchLatitude(branch.latitude !== undefined ? branch.latitude : null);
    setBranchLongitude(branch.longitude !== undefined ? branch.longitude : null);
    setFormGpsError('');
    setIsFormGpsLoading(false);
    setBranchLogo(branch.logoUrl || branch.photoUrl || branch.image || '');
    
    // Load phones array or fallback to legacy single phone string
    if (Array.isArray(branch.phones) && branch.phones.length > 0) {
      setPhones(branch.phones.map(p => ({
        id: p.id || Math.random().toString(),
        number: p.number || '',
        type: p.type || 'landline'
      })));
    } else if (branch.phone && branch.phone.trim()) {
      setPhones([
        { id: '1', number: branch.phone.trim(), type: 'landline' }
      ]);
    } else {
      setPhones([
        { id: '1', number: '', type: 'landline' }
      ]);
    }

    setManagerId(branch.managerId || '');
    setUsername(branch.username || '');
    setPassword(branch.password || '');
    setUsernameError('');
    setIsModalOpen(true);
  };

  const handleAddPhoneField = () => {
    setPhones([
      ...phones,
      { id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4), number: '', type: 'mobile' }
    ]);
  };

  const handlePhoneChange = (id, field, value) => {
    setPhones(phones.map(p => {
      if (p.id === id) {
        if (field === 'number') {
          // Numbers only validation
          const numericOnly = value.replace(/\D/g, '');
          return { ...p, number: numericOnly };
        }
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const handleRemovePhoneField = (id) => {
    if (phones.length <= 1) {
      setPhones([{ id: '1', number: '', type: 'landline' }]);
      return;
    }
    setPhones(phones.filter(p => p.id !== id));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!branchName.trim()) {
      alert('يرجى إدخال اسم الفرع');
      return;
    }

    if (usernameError) {
      alert('يرجى اختيار اسم مستخدم غير مكرر للفرع');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const currentBranchId = editingBranch ? editingBranch.id : null;
    const duplicate = branches.find(
      (b) => b.id !== currentBranchId && b.username && b.username.trim().toLowerCase() === cleanUsername
    );
    if (duplicate) {
      alert(`⚠️ اسم المستخدم مستخدم بالفعل لفرع "${duplicate.name}"`);
      return;
    }

    const duplicateEmp = employees.find(
      (e) => (e.code && String(e.code).trim().toLowerCase() === cleanUsername) ||
             (e.username && String(e.username).trim().toLowerCase() === cleanUsername)
    );
    if (duplicateEmp) {
      alert(`⚠️ لا يمكن استخدام اسم المستخدم هذا لأنه مستخدم بالفعل ككود للموظف "${duplicateEmp.name}" (كود: ${duplicateEmp.code})`);
      return;
    }

    // Clean valid phones
    const validPhones = phones.filter(p => p.number && p.number.trim());
    const primaryPhone = validPhones[0]?.number || '';

    const branchData = {
      id: editingBranch ? editingBranch.id : `branch_${Date.now()}`,
      branchCode,
      name: branchName,
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
    setIsModalOpen(false);
  };

  const getPhoneBadge = (p) => {
    const isWhatsapp = p.type === 'whatsapp';
    const isLandline = p.type === 'landline';
    const icon = isLandline ? '☎️' : isWhatsapp ? '💬' : '📱';
    const bg = isLandline ? '#e0f2fe' : isWhatsapp ? '#dcfce7' : '#f0fdf4';
    const color = isLandline ? '#0369a1' : isWhatsapp ? '#15803d' : '#166534';
    const border = isLandline ? '#bae6fd' : isWhatsapp ? '#86efac' : '#bbf7d0';

    return (
      <span
        key={p.id || p.number}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: bg,
          color: color,
          border: `1px solid ${border}`,
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 700,
          margin: '2px 3px'
        }}
      >
        <span>{icon}</span>
        <span style={{ direction: 'ltr' }}>{p.number}</span>
      </span>
    );
  };

  return (
    <div className="bylaws-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>🏢 إدارة الفروع وتعيين المديرين</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            إنشاء وإدارة الفروع وتكليف الموظفين كمديري فروع وإدارة أرقام الهواتف والتواصل
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onSwitchSubTab && onSwitchSubTab('roster')}
            style={{
              background: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📅</span> الجدول الشهري للفرع
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onSwitchSubTab && onSwitchSubTab('sales')}
            style={{
              background: '#eff6ff',
              color: '#1e40af',
              border: '1px solid #bfdbfe',
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📈</span> مبيعات الفروع والتارجت
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowAddressesModal(true)}
            style={{
              background: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
              fontWeight: 800,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📍</span> عناوين الفروع
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsPhonesModalOpen(true)}
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary-dark)',
              border: '1px solid var(--primary-tint)',
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📞</span> أرقام الفروع
          </button>
          <button type="button" className="btn btn-start" onClick={handleOpenAdd}>
            ➕ إضافة فرع جديد
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الفرع (Branch ID)</th>
              <th>اسم الفرع</th>
              <th>الهواتف والتواصل</th>
              <th>مدير الفرع المكلف</th>
              <th>اسم المستخدم (صفحة الفرع)</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                  لا توجد فروع مسجلة حتى الآن. انقر على "إضافة فرع جديد" للبدء.
                </td>
              </tr>
            ) : (
              branches.map((b) => {
                const manager = employees.find((e) => String(e.id) === String(b.managerId));
                
                // Get all phones
                let branchPhones = [];
                if (Array.isArray(b.phones) && b.phones.length > 0) {
                  branchPhones = b.phones.filter(p => p && p.number);
                } else if (b.phone && b.phone.trim()) {
                  branchPhones = [{ id: '1', number: b.phone.trim(), type: 'landline' }];
                }

                return (
                  <tr key={b.id}>
                    <td>
                      <span className="badge badge-primary">{b.branchCode || b.id}</span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {b.logoUrl || b.photoUrl || b.image ? (
                          <img
                            src={b.logoUrl || b.photoUrl || b.image}
                            alt={b.name}
                            style={{ width: '34px', height: '34px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }}
                          />
                        ) : (
                          <span style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🏢</span>
                        )}
                        <span>{b.name}</span>
                      </div>
                    </td>
                    <td>
                      {branchPhones.length === 0 ? (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: '260px' }}>
                          {branchPhones.map((p) => getPhoneBadge(p))}
                        </div>
                      )}
                    </td>
                    <td>
                      {manager ? (
                        <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                          👤 {manager.name} ({manager.code})
                        </span>
                      ) : (
                        <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🚫 بدون مدير (مباشر للإدارة)
                        </span>
                      )}
                    </td>
                    <td>
                      <code style={{ background: 'var(--primary-tint)', padding: '2px 8px', borderRadius: '6px' }}>
                        {b.username}
                      </code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{
                            fontSize: '12px',
                            background: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          onClick={() => {
                            if (onOpenBranchRoster) {
                              onOpenBranchRoster(b.id);
                            } else if (onSwitchSubTab) {
                              onSwitchSubTab('roster');
                            }
                          }}
                        >
                          📅 جدول الفرع
                        </button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => handleOpenEdit(b)}>
                          ✏️ تعديل
                        </button>
                        <button type="button" className="del-btn" style={{ fontSize: '12px' }} onClick={() => onDeleteBranch(b.id)}>
                          🗑️ حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Create/Edit Branch */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '580px', width: '95%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '18px' }}>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, fontSize: '17px', color: 'var(--text)' }}>
                {editingBranch ? '✏️ تعديل بيانات الفرع' : '🏢 إضافة فرع جديد'}
              </h3>
              <button
                type="button"
                className="btn btn-ghost modal-close-btn"
                data-action="close"
                onClick={() => setIsModalOpen(false)}
                style={{ fontSize: '18px', width: '34px', height: '34px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label>كود الفرع (Branch Code / ID)</label>
                <input type="text" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} required />
              </div>

              <div className="field">
                <label>اسم الفرع</label>
                <input type="text" placeholder="مثال: الفرع الرئيسي - المقطم" value={branchName} onChange={(e) => setBranchName(e.target.value)} required />
              </div>

              {/* Branch Address & Location / GPS Section */}
              <div className="field">
                <label style={{ fontWeight: 'bold' }}>🏢 عنوان الفرع بالتفصيل</label>
                <input
                  type="text"
                  placeholder="مثال: شارع الجلاء، بجوار بنك مصر، برج الصفوة"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                />
              </div>

              <div className="field" style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '12px 14px' }}>
                <label style={{ fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span>📍</span> الموقع الجغرافي للفرع (Google Maps / GPS Live)
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="https://maps.google.com/?q=... أو التقط الـ GPS لايف"
                    value={branchLocationUrl}
                    onChange={(e) => setBranchLocationUrl(e.target.value)}
                    style={{ flex: '1 1 220px', direction: 'ltr', fontSize: '13px', padding: '8px 10px', border: '1px solid #a7f3d0', borderRadius: '8px' }}
                  />
                  <button
                    type="button"
                    onClick={handleFormCaptureLiveGps}
                    disabled={isFormGpsLoading}
                    style={{
                      background: isFormGpsLoading ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: isFormGpsLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isFormGpsLoading ? (
                      <>
                        <span className="spinner" style={{ width: '12px', height: '12px' }}></span>
                        <span>جاري تحديد GPS...</span>
                      </>
                    ) : (
                      <>
                        <span>🎯</span>
                        <span>التقاط الموقع المباشر (GPS Live)</span>
                      </>
                    )}
                  </button>
                </div>

                {formGpsError && (
                  <span style={{ fontSize: '11.5px', color: '#dc2626', fontWeight: 700, marginTop: '5px', display: 'block' }}>
                    ⚠️ {formGpsError}
                  </span>
                )}

                {(branchLatitude && branchLongitude) && (
                  <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 700, marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span>✅ تم تحديد إحداثيات GPS: {Number(branchLatitude).toFixed(5)}, {Number(branchLongitude).toFixed(5)}</span>
                    {branchLocationUrl && (
                      <a href={branchLocationUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                        🗺️ معاينة بالخرائط ↗
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Branch Photo / Logo Upload Section */}
              <div className="field">
                <label style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🏢</span> صورة أو شعار الفرع (Branch Photo / Logo)
                </label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="رابط الصورة أو اختر صورة مباشرة من جهازك..."
                    value={branchLogo}
                    onChange={(e) => setBranchLogo(e.target.value)}
                    style={{ flex: '1 1 240px' }}
                  />
                  <label
                    className="btn btn-ghost"
                    style={{
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      background: 'var(--primary-light)',
                      color: 'var(--primary-dark)',
                      fontWeight: 'bold',
                      borderRadius: '8px',
                      border: '1px solid var(--primary)',
                      fontSize: '12.5px'
                    }}
                  >
                    📁 رفع صورة الفرع
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBranchLogoUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                {branchLogo && (
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <img
                      src={branchLogo}
                      alt="Branch Preview"
                      style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)' }}>✅ معاينة صورة الفرع</span>
                      <button
                        type="button"
                        className="del-btn"
                        style={{ width: 'fit-content', padding: '2px 8px', fontSize: '11.5px' }}
                        onClick={() => setBranchLogo('')}
                      >
                        🗑️ حذف الصورة
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Multiple Phone Numbers Section */}
              <div className="field" style={{ background: 'var(--surface-muted)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontWeight: 800, margin: 0 }}>📞 أرقام هواتف وتواصل الفرع</label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleAddPhoneField}
                    style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontWeight: 'bold' }}
                  >
                    ➕ إضافة رقم آخر
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {phones.map((p, idx) => (
                    <div key={p.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        value={p.type || 'mobile'}
                        onChange={(e) => handlePhoneChange(p.id, 'type', e.target.value)}
                        style={{ width: '130px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '12.5px', fontWeight: 'bold' }}
                      >
                        <option value="mobile">📱 محمول / هاتف</option>
                        <option value="landline">☎️ خط أرضي</option>
                        <option value="whatsapp">💬 واتساب</option>
                      </select>

                      <input
                        type="text"
                        placeholder="أرقام فقط (مثال: 0221234567)"
                        value={p.number}
                        onChange={(e) => handlePhoneChange(p.id, 'number', e.target.value)}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '13px', direction: 'ltr', textAlign: 'right' }}
                      />

                      {phones.length > 1 && (
                        <button
                          type="button"
                          className="del-btn"
                          onClick={() => handleRemovePhoneField(p.id)}
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          title="حذف هذا الرقم"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
                  * حقول الأرقام تقبل الأرقام فقط (0-9). يمكنك إضافة خط أرضي، هاتف محمول، أو رقم واتساب.
                </div>
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold' }}>مدير الفرع (يتم جلبه من قاعدة بيانات الموظفين)</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border)',
                    background: managerId ? 'var(--surface)' : '#fefce8',
                    fontWeight: 700
                  }}
                >
                  <option value="">🚫 فرع بدون مدير (تحويل كافة الطلبات للإدارة العليا مباشرة)</option>
                  {employees.filter(isEmployeeActive).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      👤 {getEmpDisplayName(emp)} (كود: {emp.code} - {emp.jobTitle || 'موظف'})
                    </option>
                  ))}
                </select>
                {!managerId && (
                  <div style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '6px 10px', borderRadius: '6px', fontSize: '11.5px', marginTop: '6px', fontWeight: 'bold' }}>
                    ⚡ في حال اختيار (فرع بدون مدير): سيتم إرسال كافة طلبات موظفي هذا الفرع (إجازات، أذونات، سلف، استقالات، إلخ) مباشرة إلى الإدارة العليا للاعتماد النهائي.
                  </div>
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
              <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                🔑 بيانات تسجيل الدخول لصفحة مدير الفرع
              </h4>

              <div className="field">
                <label>اسم المستخدم (صفحة الفرع)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  style={usernameError ? { borderColor: 'var(--danger)' } : {}}
                  required
                />
                {usernameError && (
                  <span style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>
                    {usernameError}
                  </span>
                )}
              </div>

              <div className="field">
                <label>كلمة المرور (صفحة الفرع)</label>
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <div className="modal-actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-start">
                  حفظ الفرع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branch Phones Directory Modal */}
      <BranchPhonesDirectoryModal
        isOpen={isPhonesModalOpen}
        onClose={() => setIsPhonesModalOpen(false)}
        branches={branches}
        employees={employees}
      />

      {/* Branch Addresses & Locations Directory Modal */}
      <BranchAddressesModal
        isOpen={showAddressesModal}
        onClose={() => setShowAddressesModal(false)}
        branches={branches}
        employees={employees}
        onSaveBranch={onSaveBranch}
        showToast={showToast}
      />
    </div>
  );
}
