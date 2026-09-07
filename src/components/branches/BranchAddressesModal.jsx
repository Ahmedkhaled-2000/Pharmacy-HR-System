import React, { useState, useMemo } from 'react';

export default function BranchAddressesModal({
  isOpen = true,
  onClose,
  branches = [],
  employees = [],
  onSaveBranch,
  showToast
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('all'); // 'all' | 'has-location' | 'no-location'
  const [copiedKey, setCopiedKey] = useState(null);

  // Quick edit state for a specific branch inside the modal
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [editAddress, setEditAddress] = useState('');
  const [editLocationUrl, setEditLocationUrl] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast?.('📋 تم النسخ بنجاح');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleStartEdit = (b) => {
    setEditingBranchId(b.id);
    setEditAddress(b.address || '');
    setEditLocationUrl(b.locationUrl || '');
    setEditLat(b.latitude ? String(b.latitude) : '');
    setEditLng(b.longitude ? String(b.longitude) : '');
    setGpsError('');
  };

  const handleCancelEdit = () => {
    setEditingBranchId(null);
    setGpsError('');
    setIsGpsLoading(false);
  };

  // Live GPS Capture via navigator.geolocation
  const handleCaptureLiveGps = () => {
    if (!navigator.geolocation) {
      setGpsError('متصفحك لا يدعم تحديد المواقع الجغرافية (Geolocation).');
      return;
    }

    setIsGpsLoading(true);
    setGpsError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy || 0);

        setEditLat(String(lat));
        setEditLng(String(lng));
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        setEditLocationUrl(mapsUrl);
        setIsGpsLoading(false);
        showToast?.(`🎯 تم التقاط الموقع الجغرافي الحي بنجاح (دقة: ±${accuracy} متر)`);
      },
      (err) => {
        setIsGpsLoading(false);
        let msg = 'تعذر التقاط الموقع الجغرافي.';
        if (err.code === 1) {
          msg = 'تم رفض الإذن لتحديد الموقع. يرجى تفعيل إذن الموقع الجغرافي بالمتصفح.';
        } else if (err.code === 2) {
          msg = 'إشارة الموقع الجغرافي (GPS) غير متوفرة حالياً.';
        } else if (err.code === 3) {
          msg = 'استغرق تحديد الموقع وقتاً طويلاً. يرجى المحاولة ثانية.';
        }
        setGpsError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  };

  const handleSaveLocation = (branch) => {
    if (!onSaveBranch) return;

    let finalLocationUrl = editLocationUrl.trim();
    const latNum = parseFloat(editLat);
    const lngNum = parseFloat(editLng);

    // If user entered coordinates but no URL, generate standard Google Maps URL
    if (!finalLocationUrl && !isNaN(latNum) && !isNaN(lngNum)) {
      finalLocationUrl = `https://www.google.com/maps?q=${latNum},${lngNum}`;
    }

    const updated = {
      ...branch,
      address: editAddress.trim(),
      locationUrl: finalLocationUrl,
      latitude: !isNaN(latNum) ? latNum : null,
      longitude: !isNaN(lngNum) ? lngNum : null,
      updatedAt: new Date().toISOString()
    };

    onSaveBranch(updated);
    showToast?.(`✅ تم حفظ موقع وعنوان فرع "${branch.name}" بنجاح`);
    setEditingBranchId(null);
  };

  // Normalize list with manager and phones
  const branchList = useMemo(() => {
    return (branches || []).map((b) => {
      const manager = employees.find((e) => String(e.id) === String(b.managerId));
      let primaryPhone = '';
      if (Array.isArray(b.phones) && b.phones.length > 0) {
        primaryPhone = b.phones[0]?.number || '';
      } else if (b.phone) {
        primaryPhone = b.phone;
      }

      // Check if location is present
      const hasLocation = Boolean(
        (b.locationUrl && b.locationUrl.trim()) ||
        (b.latitude !== undefined && b.latitude !== null && b.longitude !== undefined && b.longitude !== null)
      );

      const effectiveMapUrl = b.locationUrl && b.locationUrl.trim()
        ? b.locationUrl.trim()
        : (b.latitude && b.longitude ? `https://www.google.com/maps?q=${b.latitude},${b.longitude}` : '');

      return {
        ...b,
        managerName: manager?.name || 'غير محدد',
        managerCode: manager?.code || '',
        primaryPhone,
        hasLocation,
        effectiveMapUrl
      };
    });
  }, [branches, employees]);

  // Filtered branches
  const filteredBranches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return branchList.filter((b) => {
      // 1. Search Query
      const matchesSearch = !q || (
        (b.name && b.name.toLowerCase().includes(q)) ||
        (b.branchCode && b.branchCode.toLowerCase().includes(q)) ||
        (b.address && b.address.toLowerCase().includes(q)) ||
        (b.managerName && b.managerName.toLowerCase().includes(q)) ||
        (b.primaryPhone && b.primaryPhone.includes(q))
      );
      if (!matchesSearch) return false;

      // 2. Location filter
      if (locationFilter === 'has-location' && !b.hasLocation) return false;
      if (locationFilter === 'no-location' && b.hasLocation) return false;

      return true;
    });
  }, [branchList, searchQuery, locationFilter]);

  const countWithLocation = useMemo(() => branchList.filter((b) => b.hasLocation).length, [branchList]);
  const countWithoutLocation = useMemo(() => branchList.filter((b) => !b.hasLocation).length, [branchList]);

  // Construct WhatsApp Share URL
  const getWhatsAppShareUrl = (b) => {
    let text = `📍 *موقع فرع: ${b.name}*`;
    if (b.branchCode) text += ` (كود: ${b.branchCode})`;
    text += `\n🏢 *العنوان بالتفصيل:* ${b.address || 'غير محدد'}`;
    if (b.effectiveMapUrl) {
      text += `\n🗺️ *رابط خرائط جوجل (Google Maps):*\n${b.effectiveMapUrl}`;
    }
    if (b.primaryPhone) {
      text += `\n📞 *هاتف التواصل:* ${b.primaryPhone}`;
    }
    if (b.managerName && b.managerName !== 'غير محدد') {
      text += `\n👤 *مدير الفرع:* ${b.managerName}`;
    }
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  };

  if (isOpen === false) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(5px)'
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '960px',
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #ffffff)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1.5px solid #a7f3d0' }}>
              📍
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18.5px', color: 'var(--text, #0f172a)', fontWeight: 800, fontFamily: 'Cairo' }}>
                  دليل عناوين ومواقع الفروع الجغرافية
                </h3>
                <span className="badge badge-primary" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  {branches.length} فروع مسجلة
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--muted, #64748b)' }}>
                استعراض العناوين التفصيلية، روابط خرائط جوجل، التقاط الموقع المباشر (GPS Live)، وإرسال ومشاركة اللوكيشن
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
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Search and Filters Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ flex: '1 1 260px', position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 ابحث باسم الفرع، كود الفرع، العنوان، أو اسم المدير..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 36px 10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border, #cbd5e1)',
                  fontSize: '13.5px',
                  boxSizing: 'border-box'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    fontSize: '14px'
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLocationFilter('all')}
                style={{
                  padding: '7px 12px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: locationFilter === 'all' ? '1.5px solid var(--primary, #2563eb)' : '1px solid var(--border, #cbd5e1)',
                  background: locationFilter === 'all' ? 'var(--primary-light, #eff6ff)' : 'var(--surface, #ffffff)',
                  color: locationFilter === 'all' ? 'var(--primary-dark, #1e40af)' : 'var(--text, #334155)'
                }}
              >
                جميع الفروع ({branches.length})
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLocationFilter('has-location')}
                style={{
                  padding: '7px 12px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: locationFilter === 'has-location' ? '1.5px solid #059669' : '1px solid var(--border, #cbd5e1)',
                  background: locationFilter === 'has-location' ? '#ecfdf5' : 'var(--surface, #ffffff)',
                  color: locationFilter === 'has-location' ? '#047857' : 'var(--text, #334155)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>📍</span> مسجل له لوكيشن ({countWithLocation})
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLocationFilter('no-location')}
                style={{
                  padding: '7px 12px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: locationFilter === 'no-location' ? '1.5px solid #d97706' : '1px solid var(--border, #cbd5e1)',
                  background: locationFilter === 'no-location' ? '#fffbeb' : 'var(--surface, #ffffff)',
                  color: locationFilter === 'no-location' ? '#b45309' : 'var(--text, #334155)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>⚠️</span> بدون لوكيشن ({countWithoutLocation})
              </button>
            </div>
          </div>
        </div>

        {/* Branch Cards Content List */}
        <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredBranches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', background: 'var(--surface-muted, #f8fafc)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>🔍</span>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>لم يتم العثور على فروع مطابقة للبحث أو التصفية</h4>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px' }}>جرب تغيير نص البحث أو اختيار تصفية أخرى</p>
            </div>
          ) : (
            filteredBranches.map((b) => {
              const isEditing = editingBranchId === b.id;

              return (
                <div
                  key={b.id}
                  style={{
                    background: 'var(--surface, #ffffff)',
                    border: '1.5px solid var(--border, #e2e8f0)',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'box-shadow 0.2s, border-color 0.2s',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}
                >
                  {/* Top Bar of Card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {b.logoUrl || b.photoUrl || b.image ? (
                        <img
                          src={b.logoUrl || b.photoUrl || b.image}
                          alt={b.name}
                          style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }}
                        />
                      ) : (
                        <span style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--primary-light, #eff6ff)', color: 'var(--primary-dark, #1e40af)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🏢</span>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                            {b.name}
                          </span>
                          <span className="badge badge-primary" style={{ fontSize: '11.5px', padding: '2px 8px', fontWeight: 700 }}>
                            {b.branchCode || b.id}
                          </span>
                          {b.hasLocation ? (
                            <span style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>📍</span> موقع معتمد
                            </span>
                          ) : (
                            <span style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>⚠️</span> بدون لوكيشن
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span>👤 مدير الفرع: <strong style={{ color: 'var(--text)' }}>{b.managerName}</strong></span>
                          {b.primaryPhone && (
                            <span>📞 هاتف الفرع: <strong style={{ color: 'var(--text)', direction: 'ltr', display: 'inline-block' }}>{b.primaryPhone}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Edit Toggle Button */}
                    <div>
                      {!isEditing ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleStartEdit(b)}
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <span>✏️</span> تعديل / تسجيل اللوكيشن
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={handleCancelEdit}
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #fca5a5',
                            color: '#b91c1c',
                            background: '#fee2e2'
                          }}
                        >
                          ✕ إلغاء
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Body View Mode (When not inline editing) */}
                  {!isEditing && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', background: 'var(--surface-muted, #f8fafc)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border, #f1f5f9)' }}>
                      {/* Address Details */}
                      <div>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                          🏢 العنوان بالتفصيل:
                        </span>
                        <div style={{ fontSize: '13px', color: b.address ? 'var(--text)' : 'var(--muted)', lineHeight: '1.6', fontWeight: 600 }}>
                          {b.address ? (
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                              <span>{b.address}</span>
                              <button
                                type="button"
                                title="نسخ العنوان"
                                onClick={() => handleCopy(b.address, `addr_${b.id}`)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: 0, color: '#64748b' }}
                              >
                                {copiedKey === `addr_${b.id}` ? '✅' : '📋'}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontStyle: 'italic' }}>لم يتم تسجيل عنوان تفصيلي للفرع بعد.</span>
                          )}
                        </div>
                      </div>

                      {/* Location & Map Link */}
                      <div>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                          📍 الموقع الجغرافي ورابط الخرائط:
                        </span>
                        {b.effectiveMapUrl ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <a
                                href={b.effectiveMapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '12.5px',
                                  color: 'var(--primary, #2563eb)',
                                  textDecoration: 'none',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  maxWidth: '240px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <span>🗺️</span> فتح في خرائط جوجل ↗
                              </a>
                              <button
                                type="button"
                                title="نسخ رابط الموقع"
                                onClick={() => handleCopy(b.effectiveMapUrl, `loc_${b.id}`)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: 0, color: '#64748b' }}
                              >
                                {copiedKey === `loc_${b.id}` ? '✅' : '📋'}
                              </button>
                            </div>
                            {(b.latitude && b.longitude) && (
                              <span style={{ fontSize: '11px', color: '#047857', direction: 'ltr', textAlign: 'right', display: 'block' }}>
                                🌐 GPS: {Number(b.latitude).toFixed(5)}, {Number(b.longitude).toFixed(5)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12.5px', color: '#b45309', fontWeight: 600 }}>
                            <span>⚠️ لم يتم ربط موقع جوجل لهذا الفرع.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Inline Edit Form for Branch Location & Address */}
                  {isEditing && (
                    <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📍</span>
                        <span>تعديل وحفظ موقع وعنوان فرع "{b.name}":</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                        {/* Address Field */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#14532d', marginBottom: '4px' }}>
                            العنوان بالتفصيل:
                          </label>
                          <input
                            type="text"
                            placeholder="مثال: شارع الجلاء، بجوار بنك مصر، برج الصفوة"
                            value={editAddress}
                            onChange={(e) => setEditAddress(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '13px', boxSizing: 'border-box' }}
                          />
                        </div>

                        {/* Location URL Field */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#14532d', marginBottom: '4px' }}>
                            رابط خرائط جوجل (Google Maps Link):
                          </label>
                          <input
                            type="text"
                            placeholder="https://maps.google.com/?q=..."
                            value={editLocationUrl}
                            onChange={(e) => setEditLocationUrl(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '13px', boxSizing: 'border-box', direction: 'ltr' }}
                          />
                        </div>
                      </div>

                      {/* GPS Live Capture Bar */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                              boxShadow: '0 2px 6px rgba(5,150,105,0.25)'
                            }}
                          >
                            {isGpsLoading ? (
                              <>
                                <span className="spinner" style={{ width: '12px', height: '12px' }}></span>
                                <span>جاري التقاط إشارة GPS الحية...</span>
                              </>
                            ) : (
                              <>
                                <span>🎯</span>
                                <span>التقاط موقع الفرع الحالي لايف (GPS Live)</span>
                              </>
                            )}
                          </button>

                          {(editLat && editLng) && (
                            <span style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 700, direction: 'ltr' }}>
                              ✅ GPS: {parseFloat(editLat).toFixed(5)}, {parseFloat(editLng).toFixed(5)}
                            </span>
                          )}
                        </div>

                        {gpsError && (
                          <span style={{ fontSize: '11.5px', color: '#dc2626', fontWeight: 700 }}>
                            ⚠️ {gpsError}
                          </span>
                        )}

                        {editLocationUrl && (
                          <a
                            href={editLocationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <span>🗺️</span> تجربة الرابط بالخرائط ↗
                          </a>
                        )}
                      </div>

                      {/* Save & Cancel Action buttons */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={handleCancelEdit}
                          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700 }}
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleSaveLocation(b)}
                          style={{
                            background: '#16a34a',
                            color: '#ffffff',
                            border: 'none',
                            padding: '7px 18px',
                            borderRadius: '8px',
                            fontWeight: 800,
                            fontSize: '12.5px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>💾</span>
                          <span>حفظ موقع الفرع</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions Footer: WhatsApp Send, Copy, and Open Map */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {/* WhatsApp Share Button */}
                      <a
                        href={getWhatsAppShareUrl(b)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '12px',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 8px rgba(16,185,129,0.2)'
                        }}
                      >
                        <span>💬</span>
                        <span>إرسال ومشاركة عبر واتساب</span>
                      </a>

                      {/* Copy Address & Location Info Button */}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          const fullText = `📍 موقع فرع ${b.name}\n🏢 العنوان: ${b.address || 'غير محدد'}\n🗺️ الخريطة: ${b.effectiveMapUrl || 'لا يوجد رابط'}\n📞 هاتف: ${b.primaryPhone || '—'}`;
                          handleCopy(fullText, `full_${b.id}`);
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <span>{copiedKey === `full_${b.id}` ? '✅' : '📋'}</span>
                        <span>{copiedKey === `full_${b.id}` ? 'تم النسخ' : 'نسخ العنوان واللوكيشن'}</span>
                      </button>
                    </div>

                    {/* Direct Map Launch Button */}
                    {b.effectiveMapUrl && (
                      <a
                        href={b.effectiveMapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost"
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          borderRadius: '8px',
                          color: 'var(--primary, #2563eb)',
                          border: '1px solid var(--primary-tint, #bfdbfe)',
                          background: 'var(--primary-light, #eff6ff)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <span>🗺️</span>
                        <span>فتح الخريطة ↗</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: '14px', marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            يتم تخزين ومزامنة العناوين والمواقع الجغرافية لكافة الفروع لحظياً مع قاعدة البيانات السحابية
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ padding: '8px 20px', fontWeight: 700, fontSize: '13px' }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
