import React, { useState, useMemo, useEffect } from 'react';

// حساب المسافة بين نقطتين جغرافيتين بالكيلومتر عبر معادلة Haversine
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10; // رقم عشري واحد (مثل: 2.4 كم)
}

export default function EmployeeBranchAddressesTab({
  branches = [],
  employees = [],
  currentEmp = null,
  showToast = null
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'my-branch' | 'has-gps' | 'nearest'
  const [copiedKey, setCopiedKey] = useState(null);

  // حالة الرادار وتحديد الموقع الجغرافي للموظف
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  // استخراج بيانات الفرع مع هواتفه ومديره واللوكيشن
  const enrichedBranches = useMemo(() => {
    return (branches || []).map((b) => {
      // إيجاد المدير المسؤول
      const manager = (employees || []).find((e) => String(e.id) === String(b.managerId));

      // استخراج رقم الهاتف الأساسي للفرع
      let primaryPhone = '';
      if (Array.isArray(b.phones) && b.phones.length > 0) {
        primaryPhone = b.phones[0]?.number || '';
      } else if (b.phone) {
        primaryPhone = String(b.phone).trim();
      }

      // التحقق من توفر الموقع الجغرافي (GPS أو رابط خرائط)
      const latNum = parseFloat(b.latitude);
      const lngNum = parseFloat(b.longitude);
      const hasValidCoords = !isNaN(latNum) && !isNaN(lngNum);
      const hasLocation = Boolean(hasValidCoords || (b.locationUrl && b.locationUrl.trim()));

      // توليد رابط الخريطة الفعلي
      let mapUrl = (b.locationUrl && b.locationUrl.trim()) || '';
      if (!mapUrl && hasValidCoords) {
        mapUrl = `https://www.google.com/maps?q=${latNum},${lngNum}`;
      }

      // رابط الملاحة الحية المباشرة (Turn-by-turn Navigation)
      let navUrl = '';
      if (hasValidCoords) {
        navUrl = `https://www.google.com/maps/dir/?api=1&destination=${latNum},${lngNum}`;
      } else if (mapUrl) {
        navUrl = mapUrl;
      } else if (b.address) {
        navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((b.name ? b.name + ' - ' : '') + b.address)}`;
      }

      // حساب المسافة إذا كان موقع المستخدم متاحاً
      let distanceKm = null;
      if (userLocation && hasValidCoords) {
        distanceKm = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, latNum, lngNum);
      }

      const isCurrentEmpBranch = currentEmp?.branchId && String(b.id) === String(currentEmp.branchId);

      return {
        ...b,
        primaryPhone,
        managerName: manager?.name || b.managerName || 'غير محدد',
        managerPhone: manager?.phone || '',
        hasLocation,
        hasValidCoords,
        latNum: hasValidCoords ? latNum : null,
        lngNum: hasValidCoords ? lngNum : null,
        mapUrl,
        navUrl,
        distanceKm,
        isCurrentEmpBranch
      };
    });
  }, [branches, employees, currentEmp?.branchId, userLocation]);

  // تشغيل رادار أقرب فرع وتحديد موقع الجوال الحالي
  const handleLocateNearest = () => {
    if (!navigator.geolocation) {
      const err = 'خاصية تحديد الموقع الجغرافي غير مدعومة في متصفحك.';
      setLocationError(err);
      showToast?.(err);
      return;
    }

    setIsLocating(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0)
        });
        setIsLocating(false);
        setActiveFilter('nearest');
        showToast?.(`🧭 تم تحديد موقعك الحالي بنجاح (دقة: ±${Math.round(pos.coords.accuracy || 0)} متر) وترتيب الفروع حسب الأقرب لك`);
      },
      (err) => {
        setIsLocating(false);
        let msg = 'تعذر الحصول على موقعك الحالي.';
        if (err.code === 1) {
          msg = 'تم رفض الإذن للوصول للموقع. يرجى تفعيل إذن الموقع الجغرافي من إعدادات المتصفح.';
        } else if (err.code === 2) {
          msg = 'إشارة GPS غير متوفرة في الوقت الحالي.';
        } else if (err.code === 3) {
          msg = 'استغرق تحديد الموقع وقتاً طويلاً. يرجى المحاولة مرة ثانية.';
        }
        setLocationError(msg);
        showToast?.(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  };

  // نسخ العنوان
  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast?.('📋 تم نسخ العنوان بنجاح');
    setTimeout(() => setCopiedKey(null), 2200);
  };

  // مشاركة بيانات الفرع عبر الواتساب
  const handleShareWhatsapp = (branch) => {
    const text = [
      `📍 *${branch.name || 'فرع الصيدلية'}*`,
      branch.address ? `🏢 *العنوان:* ${branch.address}` : '',
      branch.primaryPhone ? `📞 *هاتف الفرع:* ${branch.primaryPhone}` : '',
      branch.managerName && branch.managerName !== 'غير محدد' ? `👔 *مسؤول الفرع:* ${branch.managerName}` : '',
      branch.mapUrl ? `🗺️ *الموقع على الخريطة:* ${branch.mapUrl}` : ''
    ].filter(Boolean).join('\n');

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  // تصفية وترتيب الفروع
  const filteredBranches = useMemo(() => {
    let list = enrichedBranches.filter((b) => {
      // بحث نصي
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (b.name || '').toLowerCase().includes(q);
        const matchAddress = (b.address || '').toLowerCase().includes(q);
        const matchPhone = (b.primaryPhone || '').includes(q);
        const matchManager = (b.managerName || '').toLowerCase().includes(q);
        if (!matchName && !matchAddress && !matchPhone && !matchManager) {
          return false;
        }
      }

      // فلترة الأزرار
      if (activeFilter === 'my-branch') {
        return b.isCurrentEmpBranch;
      }
      if (activeFilter === 'has-gps') {
        return b.hasLocation;
      }
      return true;
    });

    // إذا كان فلتر الأقرب مفعل وموقع المستخدم معروف، نرتب حسب المسافة
    if (activeFilter === 'nearest' && userLocation) {
      list.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    } else {
      // افتراضياً: جعل فرع الموظف الأساسي في أول القائمة
      list.sort((a, b) => {
        if (a.isCurrentEmpBranch) return -1;
        if (b.isCurrentEmpBranch) return 1;
        return 0;
      });
    }

    return list;
  }, [enrichedBranches, searchQuery, activeFilter, userLocation]);

  // إحصائيات سريعة
  const totalCount = branches.length;
  const gpsCount = enrichedBranches.filter((b) => b.hasLocation).length;
  const myBranch = enrichedBranches.find((b) => b.isCurrentEmpBranch);

  return (
    <div className="ep-addresses-tab" style={{ animation: 'fadeIn 0.25s ease-out' }}>
      {/* ── العنوان والبانر التعريفي ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #065f46 100%)',
        color: '#fff',
        borderRadius: '16px',
        padding: '22px 24px',
        marginBottom: '20px',
        boxShadow: '0 8px 24px rgba(13, 148, 136, 0.22)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          left: '-20px',
          bottom: '-25px',
          fontSize: '110px',
          opacity: 0.12,
          userSelect: 'none',
          pointerEvents: 'none'
        }}>
          🛵
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', position: 'relative', zIndex: 2 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '26px' }}>📍</span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, fontFamily: 'Cairo, sans-serif' }}>
                دليل وعناوين ومواقع الفروع
              </h2>
              <span style={{
                background: 'rgba(255, 255, 255, 0.22)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '99px',
                backdropFilter: 'blur(6px)'
              }}>
                خاص بالدليفري وخدمة التوصيل 🛵
              </span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '13px', opacity: 0.92, maxWidth: '620px', lineHeight: 1.6 }}>
              تصفح عناوين الفروع المعتمدة، احصل على أرقام الهواتف للتواصل المباشر، واستخدم الملاحة السريعة للوصول إلى أقرب صيدلية لخدمة العملاء ونقل النواقص بأقصى سرعة.
            </p>
          </div>

          {/* أزرار الإحصائيات السريعة */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.16)',
              backdropFilter: 'blur(8px)',
              padding: '8px 14px',
              borderRadius: '12px',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              minWidth: '85px'
            }}>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>إجمالي الفروع</div>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{totalCount}</div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.16)',
              backdropFilter: 'blur(8px)',
              padding: '8px 14px',
              borderRadius: '12px',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              minWidth: '85px'
            }}>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>موقع GPS معتمد</div>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{gpsCount}</div>
            </div>

            {myBranch && (
              <div style={{
                background: 'rgba(251, 191, 36, 0.25)',
                backdropFilter: 'blur(8px)',
                padding: '8px 14px',
                borderRadius: '12px',
                textAlign: 'center',
                border: '1px solid rgba(251, 191, 36, 0.45)',
                minWidth: '105px'
              }}>
                <div style={{ fontSize: '11px', color: '#fef3c7', fontWeight: 700 }}>فرع عملك الحالي</div>
                <div style={{ fontSize: '13px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                  {myBranch.name}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── شريط البحث والفلاتر ورادار الـ GPS ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '16px',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* حقل البحث */}
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '15px' }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="ابحث باسم الفرع، العنوان، رقم الهاتف، أو اسم المدير..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 38px 10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                color: 'var(--text)',
                fontSize: '13.5px',
                fontWeight: 600
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
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* زر رادار تحديد أقرب فرع بالـ GPS */}
          <button
            type="button"
            onClick={handleLocateNearest}
            disabled={isLocating}
            className="btn"
            style={{
              background: userLocation ? '#0284c7' : 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.28)',
              whiteSpace: 'nowrap'
            }}
            title="تحديد موقعك الجغرافي لحساب المسافة وترتيب الفروع من الأقرب للأبعد"
          >
            <span style={{ fontSize: '16px' }}>{isLocating ? '⏳' : '🧭'}</span>
            <span>{isLocating ? 'جاري تحديد موقعك...' : userLocation ? 'تحديث رادار أقرب فرع' : 'رادار أقرب فرع لموقعي'}</span>
          </button>
        </div>

        {/* فلاتر الأزرار */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginLeft: '4px' }}>
            تصفية:
          </span>

          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              background: activeFilter === 'all' ? 'var(--primary)' : 'var(--surface-muted)',
              color: activeFilter === 'all' ? '#fff' : 'var(--text)',
              borderColor: activeFilter === 'all' ? 'var(--primary)' : 'var(--border)'
            }}
          >
            🏢 الكل ({branches.length})
          </button>

          {myBranch && (
            <button
              type="button"
              onClick={() => setActiveFilter('my-branch')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid',
                background: activeFilter === 'my-branch' ? '#b45309' : 'var(--surface-muted)',
                color: activeFilter === 'my-branch' ? '#fff' : '#b45309',
                borderColor: activeFilter === 'my-branch' ? '#b45309' : 'var(--border)'
              }}
            >
              ⭐ فرع عملي الأساسي
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveFilter('has-gps')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              background: activeFilter === 'has-gps' ? '#0d9488' : 'var(--surface-muted)',
              color: activeFilter === 'has-gps' ? '#fff' : 'var(--text)',
              borderColor: activeFilter === 'has-gps' ? '#0d9488' : 'var(--border)'
            }}
          >
            📍 بموقع معتمد ({gpsCount})
          </button>

          {userLocation && (
            <button
              type="button"
              onClick={() => setActiveFilter('nearest')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid',
                background: activeFilter === 'nearest' ? '#0284c7' : 'var(--surface-muted)',
                color: activeFilter === 'nearest' ? '#fff' : '#0284c7',
                borderColor: activeFilter === 'nearest' ? '#0284c7' : 'var(--border)'
              }}
            >
              🧭 الأقرب لموقعي (حسب المسافة)
            </button>
          )}
        </div>

        {/* شريط معلومات الرادار إن وُجد */}
        {userLocation && (
          <div style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            color: '#0369a1',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <span>
              🎯 تم التقاط موقعك الجغرافي (دقة: ±{userLocation.accuracy} متر) · يتم الآن عرض المسافة لكل فرع بالكيلومترات
            </span>
            <button
              type="button"
              onClick={() => setUserLocation(null)}
              style={{ background: 'none', border: 'none', color: '#0369a1', textDecoration: 'underline', cursor: 'pointer', fontSize: '11.5px', fontWeight: 800 }}
            >
              إلغاء الرادار
            </button>
          </div>
        )}

        {locationError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700 }}>
            ⚠️ {locationError}
          </div>
        )}
      </div>

      {/* ── شبكة بطاقات الفروع (Branch Delivery Cards) ── */}
      {filteredBranches.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '45px 20px',
          textAlign: 'center',
          color: 'var(--muted)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📍</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: '17px', fontWeight: 800 }}>
            لا توجد فروع مطابقة لمعايير البحث
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '13px' }}>
            يرجى مراجعة كلمة البحث أو إعادة تعيين الفلتر للاطلاع على كافة فروع المؤسسة.
          </p>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}
            style={{ fontSize: '13px', padding: '7px 18px' }}
          >
            🔄 استعراض كافة الفروع
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {filteredBranches.map((branch) => {
            return (
              <div
                key={branch.id}
                style={{
                  background: 'var(--surface)',
                  border: branch.isCurrentEmpBranch ? '2px solid #0d9488' : '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px',
                  boxShadow: branch.isCurrentEmpBranch
                    ? '0 6px 20px rgba(13, 148, 136, 0.16)'
                    : '0 2px 10px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  position: 'relative'
                }}
              >
                {/* الجزء العلوي: الاسم والشارات */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🏥</span>
                      <span>{branch.name}</span>
                    </h3>

                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {branch.isCurrentEmpBranch && (
                        <span style={{
                          background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                          color: '#fff',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '99px',
                          boxShadow: '0 2px 5px rgba(13, 148, 136, 0.3)'
                        }}>
                          ⭐ فرعك الأساسي
                        </span>
                      )}

                      {branch.distanceKm !== null && (
                        <span style={{
                          background: branch.distanceKm <= 5 ? '#dcfce7' : branch.distanceKm <= 15 ? '#fef3c7' : '#e0f2fe',
                          color: branch.distanceKm <= 5 ? '#166534' : branch.distanceKm <= 15 ? '#92400e' : '#0369a1',
                          border: `1px solid ${branch.distanceKm <= 5 ? '#86efac' : branch.distanceKm <= 15 ? '#fcd34d' : '#7dd3fc'}`,
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '99px'
                        }}>
                          🧭 يبعد {branch.distanceKm} كم
                        </span>
                      )}
                    </div>
                  </div>

                  {/* صندوق العنوان والتفاصيل */}
                  <div style={{
                    background: 'var(--surface-muted)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    marginBottom: '10px',
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                        <span style={{ fontWeight: 800, color: 'var(--muted)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>
                          🏢 العنوان المعتمد:
                        </span>
                        {branch.address ? branch.address : <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>العنوان غير مسجل بالتفصيل</span>}
                      </div>

                      {branch.address && (
                        <button
                          type="button"
                          onClick={() => handleCopy(branch.address, `addr_${branch.id}`)}
                          style={{
                            background: copiedKey === `addr_${branch.id}` ? '#dcfce7' : 'var(--surface)',
                            color: copiedKey === `addr_${branch.id}` ? '#166534' : 'var(--text)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="نسخ العنوان للحافظة"
                        >
                          {copiedKey === `addr_${branch.id}` ? '✓ تم' : '📋 نسخ'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* بيانات التواصل والمدير */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    {branch.primaryPhone && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: 'var(--muted)', fontWeight: 700 }}>
                          📞 هاتف الفرع:
                        </span>
                        <a
                          href={`tel:${branch.primaryPhone}`}
                          style={{
                            color: 'var(--primary)',
                            fontWeight: 800,
                            direction: 'ltr',
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            textDecoration: 'none',
                            background: 'var(--primary-tint, #f0fdfa)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(13, 148, 136, 0.2)'
                          }}
                        >
                          📞 {branch.primaryPhone}
                        </a>
                      </div>
                    )}

                    {branch.managerName && branch.managerName !== 'غير محدد' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: 'var(--muted)', fontWeight: 700 }}>
                          👔 مدير / كابتن الفرع:
                        </span>
                        <span style={{ fontWeight: 800, color: 'var(--text)' }}>
                          {branch.managerName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* أزرار العمليات السريعة (الملاحة + الخريطة + الواتساب) */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderTop: '1px solid var(--border)',
                  paddingTop: '12px'
                }}>
                  {/* زر الملاحة السريعة والتوجيه المباشر */}
                  {branch.navUrl ? (
                    <a
                      href={branch.navUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                        color: '#fff',
                        textDecoration: 'none',
                        padding: '9px 14px',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 3px 10px rgba(13, 148, 136, 0.25)'
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>🚗</span>
                      <span>توجيه وملاحة فورية (Google Maps)</span>
                    </a>
                  ) : (
                    <div style={{
                      background: 'var(--surface-muted)',
                      color: 'var(--muted)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      textAlign: 'center',
                      fontWeight: 700
                    }}>
                      ⚠️ لا يتوفر موقع GPS مباشر لهذا الفرع
                    </div>
                  )}

                  {/* أزرار إضافية: اتصال مباشر + مشاركة واتساب */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {branch.primaryPhone && (
                      <a
                        href={`tel:${branch.primaryPhone}`}
                        style={{
                          flex: 1,
                          background: '#f8fafc',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          textDecoration: 'none',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>📞</span>
                        <span>اتصال بالفرع</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleShareWhatsapp(branch)}
                      style={{
                        flex: 1,
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      title="إرسال لوكيشن وعنوان الفرع عبر الواتساب"
                    >
                      <span>💬</span>
                      <span>مشاركة واتساب</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
