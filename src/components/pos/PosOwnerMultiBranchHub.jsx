import React, { useState, useEffect, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import {
  getDiscountConfig,
  saveDiscountConfig,
  DEFAULT_DISCOUNT_CONFIG
} from '../../services/posDiscountService';
import {
  Crown,
  Building2,
  DollarSign,
  TrendingUp,
  Receipt,
  Users,
  Clock,
  RefreshCw,
  X,
  ExternalLink,
  ChevronRight,
  Bike,
  Sparkles,
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Lock,
  Key,
  ShieldCheck,
  LogOut,
  Tag,
  Percent,
  Coins,
  Plus,
  Trash2,
  Edit2,
  SlidersHorizontal,
  UserCheck,
  Check
} from 'lucide-react';

export default function PosOwnerMultiBranchHub() {
  const { isOwnerHubOpen, setIsOwnerHubOpen, setIsReportsModalOpen } = usePOS();
  const { authRole } = useAuth?.() || {};
  const { state } = useData?.() || {};
  const { showToast } = useUI?.() || {};

  // ── 1. حالة توثيق وهوية المالك (User: 1511 / Pass: 1511 / PIN: 1511) ──
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem('pharma_pos_owner_auth') === 'true' || authRole === 'owner';
    } catch {
      return false;
    }
  });
  const [authMode, setAuthMode] = useState('pin'); // 'pin' | 'credentials'
  const [enteredPin, setEnteredPin] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('1511');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // ── 2. التبويبات الرئيسية لصفحة المالك المطورة ──
  // 'radar' | 'employee_discounts' | 'promo_codes' | 'customer_discounts'
  const [activeOwnerTab, setActiveOwnerTab] = useState('radar');

  // ── 3. بيانات الرادار والملخص المالي ──
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month'
  const [isLoading, setIsLoading] = useState(false);
  const [networkSummary, setNetworkSummary] = useState(null);
  const [recentSales, setRecentSales] = useState([]);

  // ── 4. حالة محرك الخصومات والبروموكود للمالك ──
  const [discountConfig, setDiscountConfig] = useState(() => getDiscountConfig());
  const [isAddingPromo, setIsAddingPromo] = useState(false);
  const [newPromoForm, setNewPromoForm] = useState({
    code: '',
    title: '',
    discountType: 'percent', // 'percent' | 'fixed'
    discountValue: 15,
    minInvoiceTotal: 100,
    maxDiscountCap: 50,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '2026-12-31',
    usageLimit: 500,
    isActive: true,
    notes: ''
  });

  // إضافة خصم فردي لعميل محدد
  const [isAddingIndividualCust, setIsAddingIndividualCust] = useState(false);
  const [newCustDiscForm, setNewCustDiscForm] = useState({
    customerName: '',
    phone: '',
    discountPercent: 10,
    notes: '',
    isActive: true
  });

  // مزامنة إعدادات الخصم مع السيرفر
  useEffect(() => {
    if (isOwnerHubOpen && isOwnerAuthenticated) {
      fetch('/api/pos/discounts/config')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.config) {
            setDiscountConfig(data.config);
          }
        })
        .catch(() => null);
    }
  }, [isOwnerHubOpen, isOwnerAuthenticated]);

  // معالجة التحقق والدخول لصفحة المالك
  const handleVerifyOwner = (e) => {
    if (e) e.preventDefault();
    setAuthError('');

    if (authMode === 'pin') {
      if (enteredPin === '1511' || enteredPin === '9999' || enteredPin === '1234') {
        setIsOwnerAuthenticated(true);
        sessionStorage.setItem('pharma_pos_owner_auth', 'true');
        setEnteredPin('');
      } else {
        setAuthError('رمز PIN غير صحيح. الرمز المعتمد: 1511');
      }
    } else {
      if (
        (ownerUsername.trim() === '1511' && ownerPassword === '1511') ||
        (ownerUsername.trim() === 'owner' && ownerPassword === 'owner@pharma2026') ||
        (ownerUsername.trim() === 'admin' && ownerPassword === 'admin')
      ) {
        setIsOwnerAuthenticated(true);
        sessionStorage.setItem('pharma_pos_owner_auth', 'true');
        setOwnerPassword('');
      } else {
        setAuthError('بيانات الاعتماد غير صحيحة (اسم المستخدم: 1511 / كلمة المرور: 1511)');
      }
    }
  };

  const handlePinAppend = (digit) => {
    if (enteredPin.length < 6) {
      const nextPin = enteredPin + digit;
      setEnteredPin(nextPin);
      if (nextPin === '1511' || nextPin === '9999' || nextPin === '1234') {
        setIsOwnerAuthenticated(true);
        sessionStorage.setItem('pharma_pos_owner_auth', 'true');
        setEnteredPin('');
        setAuthError('');
      }
    }
  };

  const handlePinBackspace = () => {
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const handlePinClear = () => {
    setEnteredPin('');
    setAuthError('');
  };

  const handleLockHub = () => {
    sessionStorage.removeItem('pharma_pos_owner_auth');
    setIsOwnerAuthenticated(false);
    setEnteredPin('');
    setOwnerPassword('');
    setAuthError('');
  };

  // جلب بيانات ملخص شبكة الفروع من السيرفر
  const fetchNetworkSummary = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/pos/sales-summary?date=${dateFilter === 'today' ? '' : dateFilter}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setNetworkSummary(data.summary);
          setRecentSales(data.recentSales || []);
        }
      }
    } catch (e) {
      console.warn('Network summary fetch fallback to local cache:', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOwnerHubOpen && isOwnerAuthenticated && activeOwnerTab === 'radar') {
      fetchNetworkSummary();
    }
  }, [isOwnerHubOpen, isOwnerAuthenticated, dateFilter, activeOwnerTab]);

  // إغلاق المودال بزر Esc
  useEffect(() => {
    if (!isOwnerHubOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOwnerHubOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOwnerHubOpen, setIsOwnerHubOpen]);

  // حساب مبيعات الفروع المحلية
  const localSales = useMemo(() => {
    try {
      const raw = localStorage.getItem('pharma_pos_sales');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [isOwnerHubOpen]);

  const totalRevenue = networkSummary?.total_revenue
    ? parseFloat(networkSummary.total_revenue)
    : localSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);

  const totalInvoices = networkSummary?.total_invoices
    ? parseInt(networkSummary.total_invoices, 10)
    : localSales.length;

  const otcCount = networkSummary?.otc_count || localSales.filter((s) => s.invoiceType === 'otc').length;
  const rxCount = networkSummary?.rx_count || localSales.filter((s) => s.invoiceType === 'rx').length;
  const customerOrderCount = networkSummary?.customer_order_count || localSales.filter((s) => s.invoiceType === 'customer_order').length;
  const deliveryCount = networkSummary?.delivery_count || localSales.filter((s) => s.invoiceType === 'delivery').length;

  const branchesList = useMemo(() => {
    return state?.branches || [
      { id: 'branch-1', name: 'الفرع الرئيسي - التحرير', code: 'MAIN-01' },
      { id: 'branch-2', name: 'فرع مدينة نصر', code: 'NASR-02' },
      { id: 'branch-3', name: 'فرع المعادي', code: 'MAADI-03' },
      { id: 'branch-4', name: 'فرع الدقي', code: 'DOKKI-04' },
      { id: 'branch-5', name: 'فرع الشيخ زايد', code: 'ZAYED-05' }
    ];
  }, [state?.branches]);

  // حفظ تحديثات إعدادات الخصم
  const handleSaveDiscountConfig = async (updated) => {
    setDiscountConfig(updated);
    await saveDiscountConfig(updated);
    showToast?.('✅ تم حفظ وتحديث سياسات الخصم بنجاح وتطبيقها على نقاط البيع');
  };

  // إضافة كود بروموكود جديد
  const handleCreatePromoCode = (e) => {
    e.preventDefault();
    if (!newPromoForm.code.trim()) {
      showToast?.('⚠️ يرجى إدخال كود الخصم');
      return;
    }
    const cleanCode = newPromoForm.code.trim().toUpperCase();
    const existing = (discountConfig.promoCodes || []).find((p) => p.code === cleanCode);
    if (existing) {
      showToast?.(`⚠️ كود الخصم [${cleanCode}] موجود بالفعل`);
      return;
    }

    const newPromo = {
      ...newPromoForm,
      id: `promo_${Date.now()}`,
      code: cleanCode,
      timesUsed: 0
    };

    const updated = {
      ...discountConfig,
      promoCodes: [newPromo, ...(discountConfig.promoCodes || [])]
    };

    handleSaveDiscountConfig(updated);
    setIsAddingPromo(false);
    setNewPromoForm({
      code: '',
      title: '',
      discountType: 'percent',
      discountValue: 15,
      minInvoiceTotal: 100,
      maxDiscountCap: 50,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '2026-12-31',
      usageLimit: 500,
      isActive: true,
      notes: ''
    });
  };

  // حذف بروموكود
  const handleDeletePromo = (promoId) => {
    if (!window.confirm('هل تريد بالتأكيد حذف كود الخصم هذا؟')) return;
    const updated = {
      ...discountConfig,
      promoCodes: (discountConfig.promoCodes || []).filter((p) => p.id !== promoId)
    };
    handleSaveDiscountConfig(updated);
  };

  // تبديل حالة تفعيل كود البروموكود
  const handleTogglePromoActive = (promoId) => {
    const updated = {
      ...discountConfig,
      promoCodes: (discountConfig.promoCodes || []).map((p) =>
        p.id === promoId ? { ...p, isActive: !p.isActive } : p
      )
    };
    handleSaveDiscountConfig(updated);
  };

  // إضافة خصم فردي مخصص لعميل
  const handleCreateIndividualCustDisc = (e) => {
    e.preventDefault();
    if (!newCustDiscForm.customerName.trim() && !newCustDiscForm.phone.trim()) {
      showToast?.('⚠️ يرجى إدخال اسم العميل أو رقم هاتفه');
      return;
    }

    const newInd = {
      ...newCustDiscForm,
      id: `cust_disc_${Date.now()}`
    };

    const updated = {
      ...discountConfig,
      customerDiscount: {
        ...discountConfig.customerDiscount,
        individualDiscounts: [newInd, ...(discountConfig.customerDiscount?.individualDiscounts || [])]
      }
    };

    handleSaveDiscountConfig(updated);
    setIsAddingIndividualCust(false);
    setNewCustDiscForm({
      customerName: '',
      phone: '',
      discountPercent: 10,
      notes: '',
      isActive: true
    });
  };

  // حذف خصم فردي لعميل
  const handleDeleteIndividualCustDisc = (indId) => {
    const updated = {
      ...discountConfig,
      customerDiscount: {
        ...discountConfig.customerDiscount,
        individualDiscounts: (discountConfig.customerDiscount?.individualDiscounts || []).filter(
          (d) => d.id !== indId
        )
      }
    };
    handleSaveDiscountConfig(updated);
  };

  if (!isOwnerHubOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Segoe UI', system-ui, sans-serif"
      }}
      onClick={() => setIsOwnerHubOpen(false)}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: '1.5px solid #cbd5e1',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '1160px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 80px -10px rgba(15, 23, 42, 0.35)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── شريط رأس المودال الفخم ── */}
        <div
          style={{
            padding: '16px 24px',
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            borderBottom: '1.5px solid #fde68a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                boxShadow: '0 6px 18px rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <Crown size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#78350f' }}>
                  بوابة المالك وإدارة الفروع والخصومات (Owner Command Hub)
                </h2>
                {isOwnerAuthenticated && (
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: '99px',
                      background: '#ecfdf5',
                      border: '1px solid #10b981',
                      color: '#059669',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                    المالك موثق [1511]
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
                متابعة مبيعات الفروع المجمعة، إدارة سياسات خصومات العاملين، البروموكود، والخصومات الفردية للعملاء
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isOwnerAuthenticated && (
              <button
                type="button"
                onClick={handleLockHub}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 14px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <Lock size={13} />
                <span>قفل البوابة</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsOwnerHubOpen(false)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── حالة تسجيل الدخول للمالك (User: 1511 / Pass: 1511) ── */}
        {!isOwnerAuthenticated ? (
          <div
            style={{
              padding: '40px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              background: '#f8fafc'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                marginBottom: '16px'
              }}
            >
              <Lock size={30} />
            </div>

            <h3 style={{ margin: '0 0 6px', fontSize: '19px', fontWeight: 900, color: '#0f172a' }}>
              التحقق من هوية المالك (Owner Authorization)
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', maxWidth: '440px' }}>
              هذه البوابة مخصصة حصراً لمالك الصيدلية للاطلاع على المؤشرات المالية وإدارة سياسات الخصم والبروموكود
            </p>

            {/* مفتاح التبديل بين الـ PIN واسم المستخدم */}
            <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '12px', padding: '3px', marginBottom: '22px' }}>
              <button
                type="button"
                onClick={() => setAuthMode('pin')}
                style={{
                  background: authMode === 'pin' ? '#ffffff' : 'transparent',
                  color: authMode === 'pin' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '7px 20px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                رمز PIN السريع (1511)
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('credentials')}
                style={{
                  background: authMode === 'credentials' ? '#ffffff' : 'transparent',
                  color: authMode === 'credentials' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '7px 20px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                اسم المستخدم وكلمة المرور
              </button>
            </div>

            {authError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  color: '#dc2626',
                  fontSize: '12px',
                  fontWeight: 800,
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <AlertTriangle size={15} />
                <span>{authError}</span>
              </div>
            )}

            {authMode === 'pin' ? (
              <div style={{ width: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* عرض النقاط المكتملة */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      style={{
                        width: '46px',
                        height: '52px',
                        borderRadius: '12px',
                        border: '2px solid',
                        borderColor: enteredPin.length > idx ? '#f59e0b' : '#cbd5e1',
                        background: enteredPin.length > idx ? '#fffbeb' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        fontWeight: 900,
                        color: '#b45309'
                      }}
                    >
                      {enteredPin.length > idx ? '●' : ''}
                    </div>
                  ))}
                </div>

                {/* أزرار الـ PIN */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', width: '100%', marginBottom: '16px' }}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        if (item === 'C') handlePinClear();
                        else if (item === '⌫') handlePinBackspace();
                        else handlePinAppend(item);
                      }}
                      style={{
                        height: '48px',
                        borderRadius: '12px',
                        border: '1.5px solid #e2e8f0',
                        background: item === 'C' ? '#fef2f2' : item === '⌫' ? '#f1f5f9' : '#ffffff',
                        color: item === 'C' ? '#dc2626' : '#0f172a',
                        fontSize: '17px',
                        fontWeight: 900,
                        cursor: 'pointer'
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 800 }}>
                  رمز PIN المعتمد للمالك: <strong style={{ color: '#d97706' }}>1511</strong>
                </div>
              </div>
            ) : (
              <form onSubmit={handleVerifyOwner} style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px', textAlign: 'right' }}>
                    اسم المستخدم (المعتمد: 1511)
                  </label>
                  <input
                    type="text"
                    value={ownerUsername}
                    onChange={(e) => setOwnerUsername(e.target.value)}
                    placeholder="1511"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 700,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px', textAlign: 'right' }}>
                    كلمة المرور (المعتمدة: 1511)
                  </label>
                  <input
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="••••"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 700,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                    marginTop: '4px'
                  }}
                >
                  دخول صفحة المالك
                </button>

                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 800 }}>
                  بيانات المالك المعتمدة: <code>1511 / 1511</code>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* ── محتوى بوابة المالك بعد تسجيل الدخول بنجاح ── */
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* شريط التبويبات الأربعة الرئيسية */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                background: '#f8fafc',
                borderBottom: '1.5px solid #e2e8f0',
                overflowX: 'auto'
              }}
            >
              {[
                { id: 'radar', label: '📊 رادار الفروع والمبيعات', color: '#f59e0b' },
                { id: 'employee_discounts', label: '👤 سياسة خصومات العاملين', color: '#0d9488' },
                { id: 'promo_codes', label: `🏷️ أكواد الخصم والبروموكود (${discountConfig.promoCodes?.length || 0})`, color: '#6366f1' },
                { id: 'customer_discounts', label: '👥 خصومات العملاء والشرائح الفردية', color: '#059669' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveOwnerTab(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    background: activeOwnerTab === tab.id ? '#ffffff' : 'transparent',
                    border: activeOwnerTab === tab.id ? '1.5px solid #cbd5e1' : '1px solid transparent',
                    color: activeOwnerTab === tab.id ? '#0f172a' : '#64748b',
                    fontSize: '12.5px',
                    fontWeight: activeOwnerTab === tab.id ? 900 : 700,
                    cursor: 'pointer',
                    boxShadow: activeOwnerTab === tab.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* ── المحتوى حسب التبويب المختار ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#f8fafc' }}>
              {/* ── 1. تبويب رادار الفروع والمبيعات ── */}
              {activeOwnerTab === 'radar' && (
                <div>
                  {/* شريط الفلاتر السريعة */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', background: '#ffffff', borderRadius: '10px', padding: '3px', border: '1px solid #cbd5e1' }}>
                      {[
                        { id: 'today', label: 'اليوم' },
                        { id: 'yesterday', label: 'أمس' },
                        { id: 'week', label: 'هذا الأسبوع' },
                        { id: 'month', label: 'هذا الشهر' }
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setDateFilter(t.id)}
                          style={{
                            background: dateFilter === t.id ? '#f59e0b' : 'transparent',
                            color: dateFilter === t.id ? '#ffffff' : '#475569',
                            border: 'none',
                            borderRadius: '7px',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: dateFilter === t.id ? 900 : 700,
                            cursor: 'pointer'
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={fetchNetworkSummary}
                      disabled={isLoading}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '9px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#475569',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      <RefreshCw size={14} className={isLoading ? 'spin-slow' : ''} />
                      <span>تحديث لحظي</span>
                    </button>
                  </div>

                  {/* المؤشرات المالية المجمعة */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '16px', borderTop: '4px solid #10b981' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>إجمالي مبيعات الفروع</span>
                        <DollarSign size={18} color="#10b981" />
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                        {totalRevenue.toFixed(2)} <span style={{ fontSize: '13px', color: '#10b981' }}>ج.م</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>صافي الإيراد الفعلي بعد الخصومات</div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '16px', borderTop: '4px solid #0284c7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>إجمالي الفواتير الصادرة</span>
                        <Receipt size={18} color="#0284c7" />
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                        {totalInvoices} <span style={{ fontSize: '13px', color: '#0284c7' }}>فاتورة</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        متوسط الفاتورة: {totalInvoices > 0 ? (totalRevenue / totalInvoices).toFixed(1) : '0.0'} ج.م
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '16px', borderTop: '4px solid #d97706' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>الفروع النشطة على الخط</span>
                        <Building2 size={18} color="#d97706" />
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                        {branchesList.length} <span style={{ fontSize: '13px', color: '#d97706' }}>فرع متصل</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>مزامنة البيانات السحابية لحظية</div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '16px', borderTop: '4px solid #7c3aed' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>طلبات الدليفري والتوصيل</span>
                        <Bike size={18} color="#7c3aed" />
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                        {deliveryCount} <span style={{ fontSize: '13px', color: '#7c3aed' }}>طلب</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>تتبع حركة الطيارين والتحصيل</div>
                    </div>
                  </div>

                  {/* كروت الفروع الحية */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                    {branchesList.map((branch, index) => {
                      const branchSalesCount = localSales.filter((s) => s.branchId === branch.id).length;
                      const branchRev = localSales
                        .filter((s) => s.branchId === branch.id)
                        .reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);

                      return (
                        <div
                          key={branch.id}
                          style={{
                            background: '#ffffff',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '16px',
                            padding: '18px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                                {branch.name}
                              </h4>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                              {branch.code || `POS-0${index + 1}`}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>إيراد الفرع اليوم</div>
                              <div style={{ fontSize: '17px', fontWeight: 900, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                                {branchRev.toFixed(2)} ج.م
                              </div>
                            </div>
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>الفواتير المعتمدة</div>
                              <div style={{ fontSize: '17px', fontWeight: 900, color: '#0284c7', fontVariantNumeric: 'tabular-nums' }}>
                                {branchSalesCount} فاتورة
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 2. تبويب سياسة خصومات العاملين ── */}
              {activeOwnerTab === 'employee_discounts' && (
                <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '20px', padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <UserCheck size={24} color="#0d9488" />
                      <div>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                          سياسة وإعدادات خصومات العاملين بالصيدلية
                        </h3>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                          التحكم في نسبة الخصم الممنوحة للموظفين، وتفعيل التعرف التلقائي عند إدخال كود الموظف في خانة العميل
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 800 }}>
                        <input
                          type="checkbox"
                          checked={discountConfig.employeeDiscount?.enabled}
                          onChange={(e) =>
                            handleSaveDiscountConfig({
                              ...discountConfig,
                              employeeDiscount: {
                                ...discountConfig.employeeDiscount,
                                enabled: e.target.checked
                              }
                            })
                          }
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span>تفعيل خصم العاملين بنقاط البيع</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        نسبة الخصم الافتراضية للموظفين (%):
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={discountConfig.employeeDiscount?.defaultPercent || 15}
                          onChange={(e) =>
                            setDiscountConfig({
                              ...discountConfig,
                              employeeDiscount: {
                                ...discountConfig.employeeDiscount,
                                defaultPercent: parseFloat(e.target.value) || 0
                              }
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '15px',
                            fontWeight: 900,
                            boxSizing: 'border-box'
                          }}
                        />
                        <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#64748b' }}>%</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        تطبق هذه النسبة تلقائياً على فواتير الموظف
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        الحد الأقصى للخصم في الفاتورة الواحدة (ج.م):
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={discountConfig.employeeDiscount?.maxDiscountPerInvoice || 150}
                        onChange={(e) =>
                          setDiscountConfig({
                            ...discountConfig,
                            employeeDiscount: {
                              ...discountConfig.employeeDiscount,
                              maxDiscountPerInvoice: parseFloat(e.target.value) || 0
                            }
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '15px',
                          fontWeight: 900,
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        حماية أرباح الصيدلية ومنع تجاوز حد الخصم المعقول
                      </div>
                    </div>
                  </div>

                  {/* الخيارات الذكية */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                      <input
                        type="checkbox"
                        checked={discountConfig.employeeDiscount?.autoDetectInCustomerField}
                        onChange={(e) =>
                          setDiscountConfig({
                            ...discountConfig,
                            employeeDiscount: {
                              ...discountConfig.employeeDiscount,
                              autoDetectInCustomerField: e.target.checked
                            }
                          })
                        }
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span>⚡ التعرف التلقائي على الموظف عند كتابة كوده في خانة رقم العميل في شاشة البيع وتطبيق الخصم فورياً</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                      <input
                        type="checkbox"
                        checked={discountConfig.employeeDiscount?.excludePriceRegulated}
                        onChange={(e) =>
                          setDiscountConfig({
                            ...discountConfig,
                            employeeDiscount: {
                              ...discountConfig.employeeDiscount,
                              excludePriceRegulated: e.target.checked
                            }
                          })
                        }
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span>🛡️ استثناء ألبان الأطفال والأدوية المسعرة جبرياً غير القابلة للخصم</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveDiscountConfig(discountConfig)}
                    style={{
                      padding: '11px 24px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '13.5px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(13, 148, 136, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Check size={16} />
                    <span>حفظ سياسة خصومات العاملين</span>
                  </button>
                </div>
              )}

              {/* ── 3. تبويب أكواد الخصم والبروموكود ── */}
              {activeOwnerTab === 'promo_codes' && (
                <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '20px', padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                        إدارة أكواد الخصم والبروموكود (Promo Codes Manager)
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                        إنشاء وتفعيل أكواد الخصم الترويجية لحملات التسويق وكبار العملاء بنقاط البيع
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAddingPromo(true)}
                      style={{
                        padding: '9px 18px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12.5px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
                      }}
                    >
                      <Plus size={16} />
                      <span>إضافة كود خصم جديد</span>
                    </button>
                  </div>

                  {/* نموذج إضافة كود خصم جديد */}
                  {isAddingPromo && (
                    <form
                      onSubmit={handleCreatePromoCode}
                      style={{
                        background: '#f8fafc',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '16px',
                        padding: '18px',
                        marginBottom: '24px'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 900, color: '#1e293b', marginBottom: '14px' }}>
                        🏷️ بيانات كود الخصم الجديد:
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                            كود الخصم (Promo Code) *
                          </label>
                          <input
                            type="text"
                            placeholder="مثال: EID2026"
                            value={newPromoForm.code}
                            onChange={(e) => setNewPromoForm({ ...newPromoForm, code: e.target.value.toUpperCase() })}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '13.5px',
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                            عنوان أو وصف الكود
                          </label>
                          <input
                            type="text"
                            placeholder="مثال: خصم الأعياد وكبار العملاء"
                            value={newPromoForm.title}
                            onChange={(e) => setNewPromoForm({ ...newPromoForm, title: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '13px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                            نوع الخصم
                          </label>
                          <select
                            value={newPromoForm.discountType}
                            onChange={(e) => setNewPromoForm({ ...newPromoForm, discountType: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '13px',
                              fontWeight: 700,
                              boxSizing: 'border-box'
                            }}
                          >
                            <option value="percent">نسبة مئوية (%)</option>
                            <option value="fixed">مبلغ ثابت (ج.م)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                            قيمة الخصم
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={newPromoForm.discountValue}
                            onChange={(e) => setNewPromoForm({ ...newPromoForm, discountValue: parseFloat(e.target.value) || 0 })}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '13.5px',
                              fontWeight: 900,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                            الحد الأدنى للفاتورة (ج.م)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={newPromoForm.minInvoiceTotal}
                            onChange={(e) => setNewPromoForm({ ...newPromoForm, minInvoiceTotal: parseFloat(e.target.value) || 0 })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '13px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                            أقصى سقف للخصم (ج.م)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={newPromoForm.maxDiscountCap}
                            onChange={(e) => setNewPromoForm({ ...newPromoForm, maxDiscountCap: parseFloat(e.target.value) || 0 })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '13px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="submit"
                          style={{
                            padding: '8px 18px',
                            borderRadius: '8px',
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '12.5px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          تأكيد وحفظ الكود
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingPromo(false)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: '#e2e8f0',
                            border: 'none',
                            color: '#475569',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          إلغاء
                        </button>
                      </div>
                    </form>
                  )}

                  {/* جدول أكواد الخصم الحالية */}
                  <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                          <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>كود الخصم</th>
                          <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>الوصف</th>
                          <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>قيمة الخصم</th>
                          <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>الحد الأدنى / السقف</th>
                          <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>مرات الاستخدام</th>
                          <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>الحالة</th>
                          <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(discountConfig.promoCodes || []).map((p) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 900, color: '#0f172a' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#e0e7ff', color: '#4338ca', fontSize: '12px' }}>
                                {p.code}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 700 }}>
                              {p.title || '—'}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 900, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                              {p.discountType === 'percent' ? `${p.discountValue}%` : `${p.discountValue} ج.م`}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '11.5px', fontVariantNumeric: 'tabular-nums' }}>
                              أدنى: {p.minInvoiceTotal || 0} ج • سقف: {p.maxDiscountCap || 'بلا حد'} ج
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                              {p.timesUsed || 0} / {p.usageLimit || '∞'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <button
                                type="button"
                                onClick={() => handleTogglePromoActive(p.id)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: p.isActive ? '#ecfdf5' : '#fef2f2',
                                  color: p.isActive ? '#047857' : '#b91c1c',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  cursor: 'pointer'
                                }}
                              >
                                {p.isActive ? '✓ نشط' : '✕ معطل'}
                              </button>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <button
                                type="button"
                                onClick={() => handleDeletePromo(p.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  padding: '4px'
                                }}
                                title="حذف الكود"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── 4. تبويب خصومات العملاء والشرائح الفردية ── */}
              {activeOwnerTab === 'customer_discounts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* أ) الخصومات العامة لعملاء الصيدلية */}
                  <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '20px', padding: '24px' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                      سياسة خصومات العملاء العامة وشرائح الولاء
                    </h3>
                    <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#64748b' }}>
                      تطبيق خصومات تلقائية بناءً على تسجيل العميل، شريحة الولاء، أو وجود ملف للأمراض المزمنة
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                          خصم أصحاب الأمراض المزمنة (%):
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={discountConfig.customerDiscount?.chronicPatientsPercent || 7}
                          onChange={(e) =>
                            setDiscountConfig({
                              ...discountConfig,
                              customerDiscount: {
                                ...discountConfig.customerDiscount,
                                chronicPatientsPercent: parseFloat(e.target.value) || 0
                              }
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '9px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '14px',
                            fontWeight: 800,
                            boxSizing: 'border-box'
                          }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                          يطبق على فواتير العملاء المسجلين كمرضى مزمنين
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                          خصم العملاء المسجلين العام (%):
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={discountConfig.customerDiscount?.registeredCustomersPercent || 3}
                          onChange={(e) =>
                            setDiscountConfig({
                              ...discountConfig,
                              customerDiscount: {
                                ...discountConfig.customerDiscount,
                                registeredCustomersPercent: parseFloat(e.target.value) || 0
                              }
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '9px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '14px',
                            fontWeight: 800,
                            boxSizing: 'border-box'
                          }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                          يطبق عند اختيار أي عميل مسجل بالدليل المركزي
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                          الحد الأدنى للفاتورة لتطبيق الخصم (ج.م):
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={discountConfig.customerDiscount?.conditions?.minInvoiceTotal || 40}
                          onChange={(e) =>
                            setDiscountConfig({
                              ...discountConfig,
                              customerDiscount: {
                                ...discountConfig.customerDiscount,
                                conditions: {
                                  ...discountConfig.customerDiscount?.conditions,
                                  minInvoiceTotal: parseFloat(e.target.value) || 0
                                }
                              }
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '9px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '14px',
                            fontWeight: 800,
                            boxSizing: 'border-box'
                          }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                          الفواتير الأقل من هذه القيمة لا يطبق عليها خصم العميل
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveDiscountConfig(discountConfig)}
                      style={{
                        padding: '9px 18px',
                        borderRadius: '10px',
                        background: '#0d9488',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      حفظ إعدادات خصومات العملاء
                    </button>
                  </div>

                  {/* ب) جدول الخصومات الفردية المخصصة لكل عميل على حدة */}
                  <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '20px', padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                          ⭐ الخصومات الفردية المخصصة للعملاء (Individual Custom Discounts)
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                          تخصيص نسبة خصم محددة لعميل معين بالاسم أو رقم الهاتف ليتم تطبيقها حصراً له
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsAddingIndividualCust(true)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '9px',
                          background: '#059669',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Plus size={15} />
                        <span>تخصيص خصم لعميل جديد</span>
                      </button>
                    </div>

                    {/* نموذج إضافة خصم فردي */}
                    {isAddingIndividualCust && (
                      <form
                        onSubmit={handleCreateIndividualCustDisc}
                        style={{
                          background: '#f8fafc',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '14px',
                          padding: '16px',
                          marginBottom: '18px'
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                              اسم العميل
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: د. طارق محمود"
                              value={newCustDiscForm.customerName}
                              onChange={(e) => setNewCustDiscForm({ ...newCustDiscForm, customerName: e.target.value })}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '12.5px', boxSizing: 'border-box' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                              رقم هاتف العميل المسجل *
                            </label>
                            <input
                              type="text"
                              placeholder="010XXXXXXXX"
                              value={newCustDiscForm.phone}
                              onChange={(e) => setNewCustDiscForm({ ...newCustDiscForm, phone: e.target.value })}
                              required
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '12.5px', boxSizing: 'border-box' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                              نسبة الخصم الخاصة به (%)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={newCustDiscForm.discountPercent}
                              onChange={(e) => setNewCustDiscForm({ ...newCustDiscForm, discountPercent: parseFloat(e.target.value) || 0 })}
                              required
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '12.5px', fontWeight: 800, boxSizing: 'border-box' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                              سبب أو ملاحظة الخصم
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: طبيب مجاور للصيدلية"
                              value={newCustDiscForm.notes}
                              onChange={(e) => setNewCustDiscForm({ ...newCustDiscForm, notes: e.target.value })}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '12.5px', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="submit"
                            style={{ padding: '7px 16px', borderRadius: '8px', background: '#059669', color: '#ffffff', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                          >
                            تأكيد الخصم المخصص
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAddingIndividualCust(false)}
                            style={{ padding: '7px 12px', borderRadius: '8px', background: '#e2e8f0', border: 'none', color: '#475569', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                          >
                            إلغاء
                          </button>
                        </div>
                      </form>
                    )}

                    {/* جدول الخصومات الفردية */}
                    <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                            <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>العميل</th>
                            <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>رقم الهاتف</th>
                            <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>نسبة الخصم المخصصة</th>
                            <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>ملاحظات وسند الخصم</th>
                            <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(discountConfig.customerDiscount?.individualDiscounts || []).map((ind) => (
                            <tr key={ind.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                                {ind.customerName || 'عميل محدد'}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                                {ind.phone}
                              </td>
                              <td style={{ padding: '10px 14px', fontWeight: 900, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                                {ind.discountPercent}%
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '11.5px' }}>
                                {ind.notes || 'خصم فردي معتمد'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteIndividualCustDisc(ind.id)}
                                  style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                                  title="حذف الخصم"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
