import React, { useState, useEffect, useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { arabicWeekday } from '../../utils/formatters';
import { getDeliveryOrders } from '../../services/posDeliveryService';
import {
  ShoppingCart,
  Zap,
  TrendingUp,
  Clock,
  Building2,
  User,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Package,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  DollarSign,
  BarChart3,
  Bike,
  Crown,
  BookOpen,
  LogOut,
  ChevronDown
} from 'lucide-react';

export default function PosDashboard() {
  const {
    salesWindows,
    openNewSalesWindow,
    currentShift,
    setIsShiftModalOpen,
    setIsReturnsModalOpen,
    setIsSubstitutesModalOpen,
    setIsDeadStockModalOpen,
    setIsChronicModalOpen,
    setIsOcrModalOpen,
    setIsShortcutsGuideOpen,
    setIsReportsModalOpen,
    reportsActiveTab,
    setReportsActiveTab,
    setIsDeliveryModalOpen,
    setIsBranchStockModalOpen,
    setIsOwnerHubOpen,
    setIsWhatsAppModalOpen,
    setIsCustomerModalOpen,
    pendingSyncCount
  } = usePOS();

  const { currentBranch, currentEmpUser, authRole } = useAuth?.() || {};
  const terminalCode = localStorage.getItem('app_pos_terminal') || 'POS-01';

  // ── قائمة التقارير المنسدلة الذكية ──
  const [showReportsDropdown, setShowReportsDropdown] = useState(false);
  const reportsDropdownRef = useRef(null);

  useEffect(() => {
    if (!showReportsDropdown) return;
    const handleClickOutside = (e) => {
      if (reportsDropdownRef.current && !reportsDropdownRef.current.contains(e.target)) {
        setShowReportsDropdown(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowReportsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showReportsDropdown]);

  const handleSelectReport = (tabId) => {
    setReportsActiveTab?.(tabId);
    setIsReportsModalOpen(true);
    setShowReportsDropdown(false);
  };

  // ── الساعة الرقمية اللحظية ──
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeHoursMins = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const timeSeconds = String(currentTime.getSeconds()).padStart(2, '0');
  const dateFormatted = currentTime.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const dayName = arabicWeekday(currentTime.toISOString().slice(0, 10));

  const todayTotalSales = (currentShift?.totalSalesAmount || 0).toFixed(2);
  const todayInvoicesCount = currentShift?.salesCount || 0;
  const activeWindowsCount = salesWindows.filter((w) => !w.isMinimized).length;

  const isOwnerOrAdmin = authRole === 'owner' || authRole === 'admin' || localStorage.getItem('app_auth_role') === 'owner';

  // عداد طلبات الدليفري النشطة
  const [activeDeliveryCount, setActiveDeliveryCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const orders = getDeliveryOrders();
        const active = orders.filter((o) => (o.deliveryStatus || 'pending') === 'pending' || o.deliveryStatus === 'on_way').length;
        setActiveDeliveryCount(active);
      } catch {}
    };
    updateCount();
    window.addEventListener('pos:delivery-updated', updateCount);
    window.addEventListener('pos:sale-committed', updateCount);
    return () => {
      window.removeEventListener('pos:delivery-updated', updateCount);
      window.removeEventListener('pos:sale-committed', updateCount);
    };
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem('app_pos_authenticated');
    } catch {}
    window.location.href = '/';
  };

  return (
    <header
      style={{
        width: '100%',
        direction: 'rtl',
        zIndex: 100,
        background: '#ffffff',
        borderBottom: '1.5px solid #e2e8f0',
        boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '56px',
        boxSizing: 'border-box',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        userSelect: 'none'
      }}
    >
      {/* ── الجانب الأيمن: الهوية والفرع والكاشير ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 3px 8px rgba(13, 148, 136, 0.3)',
              fontSize: '17px'
            }}
          >
            💊
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.2px', lineHeight: 1.2 }}>
              PharmaOS <span style={{ color: '#0d9488' }}>POS</span>
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>
              {currentBranch?.name || 'الفرع الرئيسي'} • {terminalCode}
            </div>
          </div>
        </div>

        {/* كاشير الوردية */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: '11.5px',
            color: '#334155',
            fontWeight: 800
          }}
        >
          <User size={13} color="#0d9488" />
          <span>{currentEmpUser?.name || currentShift?.cashierName || 'صيدلي الكاشير'}</span>
        </div>
      </div>

      {/* ── المنتصف: أزرار العمليات والاختصارات الحيوية ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          margin: '0 12px',
          overflowX: 'auto',
          padding: '2px 0'
        }}
      >
        {/* F1: فتح شاشة بيع جديدة */}
        <button
          type="button"
          onClick={() => openNewSalesWindow()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 16px',
            borderRadius: '10px',
            background: '#059669',
            border: 'none',
            color: '#ffffff',
            fontSize: '12.5px',
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(5, 150, 105, 0.25)',
            transition: 'all 0.15s ease'
          }}
        >
          <ShoppingCart size={15} />
          <span>+ بيع جديد [F1]</span>
        </button>

        {/* F7: إدارة ومتابعة الدليفري */}
        <button
          type="button"
          onClick={() => setIsDeliveryModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '9px',
            background: '#f5f3ff',
            border: '1.5px solid #c4b5fd',
            color: '#6d28d9',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Bike size={14} color="#7c3aed" />
          <span>الدليفري [F7]</span>
          {activeDeliveryCount > 0 && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: '99px',
                background: '#7c3aed',
                color: '#ffffff',
                fontSize: '10.5px',
                fontWeight: 900
              }}
            >
              {activeDeliveryCount}
            </span>
          )}
        </button>

        {/* العملاء المسجلين في النظام */}
        <button
          type="button"
          onClick={() => setIsCustomerModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '9px',
            background: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            color: '#065f46',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="عرض وإدارة وسجل العملاء المسجلين في النظام ورصيد المحافظ"
        >
          <User size={14} color="#059669" />
          <span>العملاء المسجلين</span>
        </button>

        {/* F11: مركز واتساب الفرع لخدمة العملاء والفواتير الإلكترونية */}
        <button
          type="button"
          onClick={() => setIsWhatsAppModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '9px',
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            color: '#16a34a',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 6px rgba(34, 197, 94, 0.12)'
          }}
          title="فتح مركز واتساب الفرع لإرسال الفواتير وتنبيهات الأدوية المزمنة وتحديثات الدليفري (F11)"
        >
          <span style={{ fontSize: '13px' }}>💬</span>
          <span>واتساب الفرع [F11]</span>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#22c55e',
              display: 'inline-block',
              boxShadow: '0 0 6px #22c55e'
            }}
          />
        </button>

        {/* F4: مركز التقارير والرقابة مع القائمة المنسدلة الذكية */}
        <div style={{ position: 'relative' }} ref={reportsDropdownRef}>
          <button
            type="button"
            onClick={() => setShowReportsDropdown((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '9px',
              background: showReportsDropdown ? '#ccfbf1' : '#f0fdfa',
              border: '1.5px solid #99f6e4',
              color: '#0f766e',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: showReportsDropdown ? '0 0 0 3px rgba(13, 148, 136, 0.15)' : 'none'
            }}
            title="فتح قائمة تقارير الصيدلية السريعة أو مركز التقارير الشامل [F4]"
          >
            <BarChart3 size={14} color="#0d9488" />
            <span>التقارير [F4]</span>
            <ChevronDown
              size={13}
              style={{
                transform: showReportsDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            />
          </button>

          {/* القائمة المنسدلة للتقارير السريعة */}
          {showReportsDropdown && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 99999,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '16px',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                width: '340px',
                padding: '12px',
                direction: 'rtl',
                animation: 'posFadeIn 0.15s ease-out',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {/* رأس القائمة */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #f1f5f9'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BarChart3 size={16} color="#0d9488" />
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>
                    تقارير الصيدلية والرقابة المالية
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background: '#f0fdfa',
                    color: '#0d9488',
                    fontWeight: 800,
                    border: '1px solid #ccfbf1'
                  }}
                >
                  F4
                </span>
              </div>

              {/* قسم 1: المبيعات والورديات */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px', paddingRight: '4px' }}>
                  📊 المبيعات وحركة الورديات
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectReport('shifts')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>⏱️</span>
                      <span>تقرير الوردية ودرج النقدية (X/Z Report)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('sales')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🧾</span>
                      <span>شريط فواتير المبيعات اليومية</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('kpis')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🎯</span>
                      <span>إنتاجية الكاشير ومتوسط السلة</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* قسم 2: حركة الأصناف والأدوية */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px', paddingRight: '4px' }}>
                  💊 حركة الأصناف والمخزون
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectReport('items')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>💊</span>
                      <span>مبيعات الأصناف وتجزئة الشرائط</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('items')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📉</span>
                      <span>حركة النواقص والطلب الذكي</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('items')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>⏳</span>
                      <span>رادار الصلاحيات والهلاك</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* قسم 3: الرقابة وكشف التلاعب والضرائب */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px', paddingRight: '4px' }}>
                  🛡️ الرقابة والامتثال المالي
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectReport('security')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🛡️</span>
                      <span>سجل الرقابة ورادار التلاعب (Anti-Skimming)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('traffic')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📈</span>
                      <span>ساعات الذروة والكثافة الشرائية</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('sales')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🏛️</span>
                      <span>إقرار ضريبة القيمة المضافة (VAT)</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* زر سفلي لفتح المركز الشامل */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsReportsModalOpen(true);
                    setShowReportsDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '9px',
                    background: '#0d9488',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <BarChart3 size={14} />
                  <span>فتح لوحة التقارير الشاملة [F4]</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* F9: مرتجع مبيعات */}
        <button
          type="button"
          onClick={() => setIsReturnsModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 12px',
            borderRadius: '9px',
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            color: '#e11d48',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={13} color="#e11d48" />
          <span>مرتجع [F9]</span>
        </button>

        {/* F2: رادار البدائل الذكية */}
        <button
          type="button"
          onClick={() => setIsSubstitutesModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 12px',
            borderRadius: '9px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#b45309',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <Sparkles size={14} color="#d97706" />
          <span>البدائل [F2]</span>
        </button>

        {/* فحص رصيد الفروع */}
        <button
          type="button"
          onClick={() => setIsBranchStockModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 12px',
            borderRadius: '9px',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            color: '#0369a1',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <Building2 size={13} color="#0284c7" />
          <span>أرصدة الفروع</span>
        </button>

        {/* تسليم وإغلاق الوردية */}
        <button
          type="button"
          onClick={() => setIsShiftModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 12px',
            borderRadius: '9px',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            color: '#334155',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <Clock size={13} color="#475569" />
          <span>تسليم الوردية</span>
        </button>

        {/* دليل الاختصارات */}
        <button
          type="button"
          onClick={() => setIsShortcutsGuideOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            borderRadius: '9px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#64748b',
            fontSize: '11.5px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
          title="دليل اختصارات الكيبورد السريعة"
        >
          <BookOpen size={13} />
          <span>الاختصارات</span>
        </button>
      </div>

      {/* ── الجانب الأيسر: الإحصائيات والساعة والاتصال ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* ملخص مبيعات الوردية */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0'
          }}
        >
          <span style={{ fontSize: '11px', color: '#047857', fontWeight: 700 }}>الوردية:</span>
          <span style={{ fontSize: '13px', fontWeight: 900, color: '#065f46' }}>
            {todayTotalSales} ج.م
          </span>
          <span style={{ fontSize: '10.5px', color: '#059669' }}>({todayInvoicesCount})</span>
        </div>

        {/* مؤشر المزامنة السحابية */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 8px',
            borderRadius: '8px',
            background: pendingSyncCount > 0 ? '#fffbeb' : '#f0fdf4',
            border: `1px solid ${pendingSyncCount > 0 ? '#fde68a' : '#bbf7d0'}`,
            fontSize: '11px',
            fontWeight: 800,
            color: pendingSyncCount > 0 ? '#b45309' : '#15803d'
          }}
          title={pendingSyncCount > 0 ? 'توجد عمليات قيد المزامنة' : 'متصل ومحمي بالسحابة'}
        >
          {pendingSyncCount > 0 ? (
            <>
              <RefreshCw size={11} className="spin-slow" />
              <span>معلق ({pendingSyncCount})</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={11} color="#16a34a" />
              <span>متزامن</span>
            </>
          )}
        </div>

        {/* الساعة الرقمية المصغرة */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontFamily: "'Segoe UI', Tahoma, monospace",
            fontSize: '12.5px',
            fontWeight: 800,
            color: '#0f172a'
          }}
        >
          <span>{timeHoursMins}</span>
          <span style={{ fontSize: '11px', color: '#0d9488' }}>:{timeSeconds}</span>
        </div>

        {/* زر تسجيل الخروج */}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '11.5px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
          title="تسجيل خروج من الطرفية"
        >
          <LogOut size={13} />
          <span>خروج</span>
        </button>
      </div>
    </header>
  );
}
