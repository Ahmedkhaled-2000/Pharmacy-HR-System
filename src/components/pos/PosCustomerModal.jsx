import React, { useState, useEffect, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { saveUnifiedCustomer, searchUnifiedCustomers } from '../../services/posCustomerService';
import {
  User,
  Phone,
  MapPin,
  Heart,
  X,
  CheckCircle2,
  Building2,
  FileText,
  Save,
  Clock,
  Sparkles,
  Wallet,
  Search,
  Plus,
  Edit,
  RotateCcw
} from 'lucide-react';

/**
 * PosCustomerModal
 * نافذة تسجيل وتعديل بيانات العميل والمحفظة ودليل العملاء المسجلين
 * تدعم التبديل بين:
 * 1. تعديل بيانات العميل والمحفظة (مع إمكانية ضبط رصيد المحفظة)
 * 2. دليل العملاء المسجلين مع البحث والربط الفوري بالنافذة الحالية
 */
export default function PosCustomerModal() {
  const {
    isCustomerModalOpen,
    setIsCustomerModalOpen,
    activeWindowId,
    updateWindowCustomer,
    salesWindows
  } = usePOS();

  const currentWindow = salesWindows?.find((w) => w.id === activeWindowId);
  const activeCustomer = currentWindow?.customer || {};

  const [activeTab, setActiveTab] = useState('edit'); // 'edit' | 'directory'

  // بيانات نموذج التعديل
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [landlinePhone, setLandlinePhone] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('');
  const [notes, setNotes] = useState('');
  const [isChronic, setIsChronic] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // دليل العملاء
  const [directorySearch, setDirectorySearch] = useState('');
  const [registeredCustomers, setRegisteredCustomers] = useState([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  // تحميل العملاء المسجلين من LocalStorage و OutStock
  const loadRegisteredCustomers = async () => {
    try {
      setIsLoadingDirectory(true);
      const rawPos = localStorage.getItem('pharma_pos_customers');
      const posList = rawPos ? JSON.parse(rawPos) : [];
      const rawGen = localStorage.getItem('pharma_customers');
      const genList = rawGen ? JSON.parse(rawGen) : [];

      const combinedMap = new Map();
      [...posList, ...genList].forEach((c) => {
        const key = (c.phone || '').replace(/\D/g, '') || c.id || c.name;
        if (key && !combinedMap.has(key)) {
          combinedMap.set(key, {
            id: c.id || `c_${Date.now()}_${Math.random()}`,
            name: c.name || c.full_name || 'عميل',
            phone: c.phone || c.whatsapp_phone || '',
            address: c.address || '',
            isChronic: Boolean(c.isChronic ?? c.is_chronic),
            walletBalance: parseFloat(c.walletBalance ?? c.wallet_balance ?? 0)
          });
        }
      });

      setRegisteredCustomers(Array.from(combinedMap.values()));
    } catch (err) {
      console.warn('Failed to load registered customers list:', err);
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  // ملء الحقول تلقائياً إذا كان هناك عميل محدد في شاشة البيع
  useEffect(() => {
    if (isCustomerModalOpen) {
      setName(activeCustomer.name || '');
      setPhone(activeCustomer.phone || '');
      setAddress(activeCustomer.address || '');
      setIsChronic(Boolean(activeCustomer.isChronic));
      setWalletBalance(parseFloat(activeCustomer.walletBalance || 0));
      setErrorMsg('');
      setIsSaved(false);
      loadRegisteredCustomers();
    }
  }, [isCustomerModalOpen, activeCustomer]);

  // إغلاق المودال بزر Escape
  useEffect(() => {
    if (!isCustomerModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setIsCustomerModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isCustomerModalOpen, setIsCustomerModalOpen]);

  // تصفية قائمة العملاء في الدليل
  const filteredCustomers = useMemo(() => {
    if (!directorySearch.trim()) return registeredCustomers;
    const q = directorySearch.toLowerCase().trim();
    return registeredCustomers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  }, [directorySearch, registeredCustomers]);

  if (!isCustomerModalOpen) return null;

  // حفظ بيانات العميل وتعديل المحفظة
  const handleSave = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('⚠️ يرجى إدخال اسم العميل');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('⚠️ يرجى إدخال رقم هاتف صحيح (11 رقم للموبايل)');
      return;
    }

    setIsSaving(true);
    try {
      const branchId = localStorage.getItem('app_pos_branch_id') || 'main';
      const balNum = Math.max(0, parseFloat(walletBalance) || 0);

      const result = await saveUnifiedCustomer({
        name: name.trim(),
        phone: cleanPhone,
        landlinePhone: landlinePhone.trim(),
        address: address.trim(),
        zone: zone.trim(),
        notes: notes.trim(),
        isChronic,
        walletBalance: balNum
      }, branchId);

      const unifiedCust = {
        id: result?.customer?.id || `cust_${Date.now()}`,
        name: result?.customer?.full_name || name.trim(),
        phone: result?.customer?.whatsapp_phone || cleanPhone,
        address: result?.customer?.address || address.trim(),
        isChronic: Boolean(result?.customer?.is_chronic ?? isChronic),
        walletBalance: balNum,
        customerCode: result?.customer?.customer_code || '100'
      };

      // تحديث التخزين المحلي فورياً
      try {
        const rawPos = localStorage.getItem('pharma_pos_customers');
        let list = rawPos ? JSON.parse(rawPos) : [];
        const existingIdx = list.findIndex((c) => (c.phone || '').replace(/\D/g, '') === cleanPhone);
        if (existingIdx >= 0) {
          list[existingIdx] = { ...list[existingIdx], ...unifiedCust };
        } else {
          list.push(unifiedCust);
        }
        localStorage.setItem('pharma_pos_customers', JSON.stringify(list));
      } catch {}

      // ربط العميل فورياً بنافذة البيع النشطة
      if (activeWindowId) {
        updateWindowCustomer(activeWindowId, unifiedCust);
      }

      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        setIsCustomerModalOpen(false);
      }, 700);
    } catch (err) {
      console.error('Customer save error:', err);
      setErrorMsg('تعذر حفظ بيانات العميل، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSaving(false);
    }
  };

  // اختيار عميل من الدليل لربطه بالنافذة الحالية
  const handleSelectCustomerFromDirectory = (cust) => {
    if (activeWindowId) {
      updateWindowCustomer(activeWindowId, {
        id: cust.id,
        name: cust.name,
        phone: cust.phone,
        address: cust.address,
        isChronic: cust.isChronic,
        walletBalance: cust.walletBalance
      });
    }
    setIsCustomerModalOpen(false);
  };

  // تحميل عميل من الدليل إلى نموذج التعديل
  const handleEditCustomerFromDirectory = (cust) => {
    setName(cust.name);
    setPhone(cust.phone);
    setAddress(cust.address || '');
    setIsChronic(cust.isChronic);
    setWalletBalance(cust.walletBalance || 0);
    setActiveTab('edit');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        direction: 'rtl',
        animation: 'posFadeIn 0.15s ease-out',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsCustomerModalOpen(false);
      }}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: '1.5px solid #0d9488',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden',
          animation: 'posPopScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          margin: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط رأس المودال مع التبويبات */}
        <div
          style={{
            padding: '14px 20px',
            background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 3px 8px rgba(13, 148, 136, 0.25)'
              }}
            >
              <User size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                إدارة وبيانات العملاء والمحفظة
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                قاعدة البيانات المركزية الموحدة لنقاط البيع والنواقص
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCustomerModalOpen(false)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* أزرار التبديل بين التبويبات */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            padding: '4px 16px 0',
            gap: '8px'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'edit' ? '2.5px solid #0d9488' : '2.5px solid transparent',
              background: 'transparent',
              color: activeTab === 'edit' ? '#0d9488' : '#64748b',
              fontSize: '12.5px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Edit size={14} />
            <span>تعديل بيانات العميل والمحفظة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('directory');
              loadRegisteredCustomers();
            }}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'directory' ? '2.5px solid #0d9488' : '2.5px solid transparent',
              background: 'transparent',
              color: activeTab === 'directory' ? '#0d9488' : '#64748b',
              fontSize: '12.5px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <User size={14} />
            <span>دليل العملاء المسجلين ({registeredCustomers.length})</span>
          </button>
        </div>

        {/* محتوى التبويب */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {activeTab === 'edit' ? (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {errorMsg && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    fontSize: '12px',
                    fontWeight: 700
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* اسم العميل */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '5px' }}>
                  اسم العميل بالكامل <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    required
                    placeholder="أدخل اسم العميل..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 34px 0 10px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: '12.5px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* الهاتف والأرضي */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '5px' }}>
                    رقم الهاتف / واتساب <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={15} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="tel"
                      required
                      placeholder="01xxxxxxxxx"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 34px 0 10px',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '12.5px',
                        direction: 'ltr',
                        textAlign: 'right',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '5px' }}>
                    العنوان بالتفصيل
                  </label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={15} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder="الشارع، العمارة، الشقة..."
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 34px 0 10px',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '12.5px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* ── إدارة رصيد محفظة العميل بالنظام ── */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%)',
                  border: '1.5px solid #a7f3d0',
                  borderRadius: '12px',
                  padding: '12px 14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wallet size={16} color="#0d9488" />
                    <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#065f46' }}>
                      رصيد محفظة العميل في الصيدلية (ج.م)
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#047857', fontWeight: 800 }}>
                    الرصيد المتاح للخصم
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={walletBalance}
                    onChange={(e) => setWalletBalance(parseFloat(e.target.value) || 0)}
                    style={{
                      width: '130px',
                      height: '38px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      border: '1.5px solid #0d9488',
                      background: '#ffffff',
                      color: '#065f46',
                      fontSize: '15px',
                      fontWeight: 900,
                      outline: 'none',
                      boxSizing: 'border-box',
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ fontWeight: 800, color: '#065f46', fontSize: '13px' }}>ج.م</span>

                  <div style={{ display: 'flex', gap: '5px', marginRight: 'auto' }}>
                    <button
                      type="button"
                      onClick={() => setWalletBalance((b) => b + 50)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#ffffff',
                        border: '1px solid #99f6e4',
                        color: '#0d9488',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      +50 ج
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalletBalance((b) => b + 100)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#ffffff',
                        border: '1px solid #99f6e4',
                        color: '#0d9488',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      +100 ج
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalletBalance(0)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#ffffff',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                      title="تصفير رصيد المحفظة"
                    >
                      تصفير
                    </button>
                  </div>
                </div>
              </div>

              {/* عميل مزمن */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: isChronic ? '#f0fdfa' : '#f8fafc',
                  border: isChronic ? '1.5px solid #0d9488' : '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
                onClick={() => setIsChronic(!isChronic)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Heart size={18} color={isChronic ? '#0d9488' : '#94a3b8'} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                      عميل علاج شهري ومزمن (Chronic Refill)
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isChronic}
                  onChange={(e) => setIsChronic(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0d9488' }}
                />
              </div>

              {/* أزرار الحفظ والإلغاء */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="submit"
                  disabled={isSaving || isSaved}
                  style={{
                    flex: 1,
                    height: '40px',
                    borderRadius: '10px',
                    background: isSaved
                      ? '#059669'
                      : 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
                  }}
                >
                  {isSaved ? (
                    <>
                      <CheckCircle2 size={16} />
                      <span>تم الحفظ والربط بنجاح!</span>
                    </>
                  ) : isSaving ? (
                    <>
                      <Clock size={16} />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>حفظ العميل والمحفظة وربطه بالفاتورة</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  style={{
                    padding: '0 16px',
                    height: '40px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          ) : (
            // تبويب دليل العملاء المسجلين
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="ابحث في العملاء بالاسم أو رقم الهاتف..."
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 32px 0 10px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '12.5px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredCustomers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', fontSize: '13px' }}>
                    لا توجد نتائج مطابقة لبحثك
                  </div>
                ) : (
                  filteredCustomers.map((cust) => (
                    <div
                      key={cust.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 900, fontSize: '13px', color: '#0f172a' }}>
                            {cust.name}
                          </span>
                          {cust.isChronic && (
                            <span style={{ fontSize: '10px', color: '#0d9488', background: '#f0fdfa', padding: '1px 5px', borderRadius: '4px', border: '1px solid #99f6e4', fontWeight: 800 }}>
                              مزمن
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '10px', marginTop: '2px' }}>
                          <span>📱 {cust.phone}</span>
                          {cust.address && <span>📍 {cust.address}</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>رصيد المحفظة</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 900, color: cust.walletBalance > 0 ? '#059669' : '#64748b' }}>
                            {cust.walletBalance.toFixed(2)} ج
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectCustomerFromDirectory(cust)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '7px',
                            background: '#0d9488',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                          title="اختيار هذا العميل وربطه بنافذة البيع الحالية"
                        >
                          ربط بالفاتورة
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEditCustomerFromDirectory(cust)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '7px',
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                          title="تعديل بيانات العميل أو رصيد المحفظة"
                        >
                          تعديل
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
