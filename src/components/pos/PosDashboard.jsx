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
  ChevronDown,
  Warehouse,
  Boxes,
  Users,
  FileText,
  Printer,
  History,
  Trash2,
  HeartPulse,
  CreditCard,
  Pill,
  ArrowRightLeft
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

  // ── القوائم المنسدلة الأربعة (Warehouse, Branch Stock, Customers, Reports) ──
  const [activeDropdown, setActiveDropdown] = useState(null); // 'warehouse' | 'stock' | 'customers' | 'reports' | null
  const menuContainerRef = useRef(null);

  useEffect(() => {
    if (!activeDropdown) return;
    const handleClickOutside = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDropdown]);

  const toggleDropdown = (name) => {
    setActiveDropdown((prev) => (prev === name ? null : name));
  };

  const handleSelectReport = (tabId) => {
    setReportsActiveTab?.(tabId);
    setIsReportsModalOpen(true);
    setActiveDropdown(null);
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

  // عداد طلبات الدليفري النشطة
  const [activeDeliveryCount, setActiveDeliveryCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const orders = getDeliveryOrders();
        const active = orders.filter((o) => ['pending', 'assigned', 'on_way'].includes(o.status)).length;
        setActiveDeliveryCount(active);
      } catch {}
    };
    updateCount();
    window.addEventListener('pos:delivery-updated', updateCount);
    return () => window.removeEventListener('pos:delivery-updated', updateCount);
  }, []);

  const handleLogout = () => {
    if (!window.confirm('هل تريد بالتأكيد تسجيل الخروج من شاشة نقطة البيع؟')) return;
    try {
      localStorage.removeItem('app_pos_authenticated');
      localStorage.removeItem('app_pos_terminal');
      localStorage.removeItem('app_pos_terminal_data');
      localStorage.removeItem('app_pos_branch_id');
      localStorage.removeItem('app_pos_branch_name');
    } catch {}
    window.location.href = '/';
  };

  return (
    <header
      style={{
        width: '100%',
        direction: 'rtl',
        zIndex: 1000,
        background: '#ffffff',
        borderBottom: '1.5px solid #e2e8f0',
        boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '56px',
        boxSizing: 'border-box',
        overflow: 'visible', // حل حاسم لعدم قص القوائم المنسدلة نهائياً
        userSelect: 'none',
        position: 'relative'
      }}
    >
      {/* ── الجانب الأيمن: الهوية والفرع والكاشير ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
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
            padding: '4px 8px',
            borderRadius: '8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: '11px',
            color: '#334155',
            fontWeight: 800
          }}
        >
          <User size={13} color="#0d9488" />
          <span>{currentEmpUser?.name || currentShift?.cashierName || 'صيدلي الكاشير'}</span>
        </div>
      </div>

      {/* ── المنتصف: أزرار العمليات والقوائم المنسدلة المنظمة ── */}
      <div
        ref={menuContainerRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          margin: '0 8px',
          overflow: 'visible',
          position: 'relative'
        }}
      >
        {/* F1: فتح شاشة بيع جديدة */}
        <button
          type="button"
          onClick={() => openNewSalesWindow()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '7px 14px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            border: 'none',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(5, 150, 105, 0.25)',
            transition: 'all 0.15s ease'
          }}
        >
          <ShoppingCart size={14} />
          <span>+ بيع جديد [F1]</span>
        </button>

        {/* ── 1. القائمة المنسدلة: المخزن والتوريد ── */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => toggleDropdown('warehouse')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '9px',
              background: activeDropdown === 'warehouse' ? '#e0f2fe' : '#f0f9ff',
              border: '1.5px solid #bae6fd',
              color: '#0369a1',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Warehouse size={13} color="#0284c7" />
            <span>المخزن والتوريد</span>
            <ChevronDown size={12} style={{ transform: activeDropdown === 'warehouse' ? 'rotate(180deg)' : 'none' }} />
          </button>

          {activeDropdown === 'warehouse' && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 99999,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '14px',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.25)',
                width: '280px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                animation: 'posFadeIn 0.15s ease-out'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', padding: '4px 8px' }}>
                📦 توريدات وتحويلات المخزن
              </div>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('pos:open-transfer-receive'));
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <ArrowRightLeft size={14} color="#0284c7" />
                <span>استلام الأصناف من المخزن الرئيسي</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('pos:open-label-print'));
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Printer size={14} color="#0d9488" />
                <span>طباعة الملصقات والباركود الحراري</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('pos:open-received-invoices'));
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FileText size={14} color="#059669" />
                <span>سجل الفواتير وأذون الوارد المستلمة</span>
              </button>
            </div>
          )}
        </div>

        {/* ── 2. القائمة المنسدلة: مخزون الفرع والرقابة ── */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => toggleDropdown('stock')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '9px',
              background: activeDropdown === 'stock' ? '#fef3c7' : '#fffbeb',
              border: '1.5px solid #fde68a',
              color: '#b45309',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Boxes size={13} color="#d97706" />
            <span>مخزون الفرع</span>
            <ChevronDown size={12} style={{ transform: activeDropdown === 'stock' ? 'rotate(180deg)' : 'none' }} />
          </button>

          {activeDropdown === 'stock' && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 99999,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '14px',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.25)',
                width: '280px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                animation: 'posFadeIn 0.15s ease-out'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', padding: '4px 8px' }}>
                📊 رقابة مخزون الفرع والأصناف
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsBranchStockModalOpen(true);
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Boxes size={14} color="#0284c7" />
                <span>مخزون الفرع الحالي ورصيد الصيدلية</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('pos:open-item-cardex'));
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <History size={14} color="#7c3aed" />
                <span>مراجعة حركة الأصناف (Cardex)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDeadStockModalOpen(true);
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Clock size={14} color="#d97706" />
                <span>تواريخ الصلاحية والرواكد (FEFO)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('pos:open-scrap-stock'));
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Trash2 size={14} color="#dc2626" />
                <span>مخزون هوالك وتوالف الفرع</span>
              </button>
            </div>
          )}
        </div>

        {/* ── 3. القائمة المنسدلة: العملاء والحسابات ── */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => toggleDropdown('customers')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '9px',
              background: activeDropdown === 'customers' ? '#dcfce7' : '#f0fdf4',
              border: '1.5px solid #86efac',
              color: '#166534',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Users size={13} color="#16a34a" />
            <span>العملاء والحسابات</span>
            <ChevronDown size={12} style={{ transform: activeDropdown === 'customers' ? 'rotate(180deg)' : 'none' }} />
          </button>

          {activeDropdown === 'customers' && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 99999,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '14px',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.25)',
                width: '280px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                animation: 'posFadeIn 0.15s ease-out'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', padding: '4px 8px' }}>
                👥 خدمات العملاء وقاعدة البيانات المركزية
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsCustomerModalOpen(true);
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <User size={14} color="#059669" />
                <span>دليل العملاء المسجلين (مركزي)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('pos:open-customer-debts'));
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <CreditCard size={14} color="#d97706" />
                <span>حسابات الآجل والديون للعملاء</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsChronicModalOpen(true);
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Pill size={14} color="#2563eb" />
                <span>الأدوية الشهرية للعملاء المزمنين</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('pos:open-patient-history'));
                  setActiveDropdown(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'right'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <HeartPulse size={14} color="#dc2626" />
                <span>السجل المرضي وملف العميل الصحي</span>
              </button>
            </div>
          )}
        </div>

        {/* ── 4. القائمة المنسدلة: التقارير والرقابة [F4] ── */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => toggleDropdown('reports')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '9px',
              background: activeDropdown === 'reports' ? '#ccfbf1' : '#f0fdfa',
              border: '1.5px solid #99f6e4',
              color: '#0f766e',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <BarChart3 size={13} color="#0d9488" />
            <span>التقارير [F4]</span>
            <ChevronDown size={12} style={{ transform: activeDropdown === 'reports' ? 'rotate(180deg)' : 'none' }} />
          </button>

          {activeDropdown === 'reports' && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 99999,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '16px',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.25)',
                width: '320px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                animation: 'posFadeIn 0.15s ease-out'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>تقارير الصيدلية والرقابة المالية</span>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#f0fdfa', color: '#0d9488', fontWeight: 800 }}>F4</span>
              </div>

              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>📊 المبيعات والورديات</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectReport('shifts')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 8px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>⏱️</span>
                    <span>تقرير الوردية ودرج النقدية (X/Z Report)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('sales')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 8px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>🧾</span>
                    <span>شريط فواتير المبيعات اليومية</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('kpis')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 8px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>🎯</span>
                    <span>إنتاجية الكاشير ومتوسط السلة</span>
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>💊 حركة الأصناف والأدوية</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectReport('items')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 8px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>💊</span>
                    <span>مبيعات الأصناف وتجزئة الشرائط</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectReport('security')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 8px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#1e293b',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'right'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>🛡️</span>
                    <span>سجل الرقابة ورادار التلاعب المالي</span>
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsReportsModalOpen(true);
                    setActiveDropdown(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
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
                  <span>فتح مركز التقارير الشامل [F4]</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* F7: الدليفري */}
        <button
          type="button"
          onClick={() => setIsDeliveryModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            borderRadius: '9px',
            background: '#f5f3ff',
            border: '1.5px solid #c4b5fd',
            color: '#6d28d9',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <Bike size={13} color="#7c3aed" />
          <span>الدليفري [F7]</span>
          {activeDeliveryCount > 0 && (
            <span style={{ padding: '1px 5px', borderRadius: '99px', background: '#7c3aed', color: '#fff', fontSize: '10px', fontWeight: 900 }}>
              {activeDeliveryCount}
            </span>
          )}
        </button>

        {/* F9: مرتجع */}
        <button
          type="button"
          onClick={() => setIsReturnsModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            borderRadius: '9px',
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            color: '#e11d48',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={12} color="#e11d48" />
          <span>مرتجع [F9]</span>
        </button>

        {/* F2: البدائل */}
        <button
          type="button"
          onClick={() => setIsSubstitutesModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            borderRadius: '9px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#b45309',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <Sparkles size={13} color="#d97706" />
          <span>البدائل [F2]</span>
        </button>

        {/* F12: تسليم الوردية */}
        <button
          type="button"
          onClick={() => setIsShiftModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            borderRadius: '9px',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            color: '#334155',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          <Clock size={12} color="#475569" />
          <span>الوردية [F12]</span>
        </button>

        {/* بوابة المالك [1511] */}
        <button
          type="button"
          onClick={() => setIsOwnerHubOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 11px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '1.5px solid #475569',
            color: '#fbbf24',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)',
            transition: 'all 0.15s ease'
          }}
          title="بوابة المالك: الرادار وسياسات الخصومات والبروموكود [Alt+O | كود 1511]"
        >
          <Crown size={13} color="#f59e0b" />
          <span style={{ color: '#f8fafc' }}>المالك</span>
          <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fbbf24', padding: '1px 5px', borderRadius: '4px', fontWeight: 900 }}>1511</span>
        </button>

        {/* دليل الاختصارات */}
        <button
          type="button"
          onClick={() => setIsShortcutsGuideOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 8px',
            borderRadius: '9px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#64748b',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
          title="دليل اختصارات الكيبورد الشامل"
        >
          <BookOpen size={12} />
          <span>الاختصارات</span>
        </button>
      </div>

      {/* ── الجانب الأيسر: الإحصائيات والساعة والاتصال ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* ملخص مبيعات الوردية */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 8px',
            borderRadius: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0'
          }}
        >
          <span style={{ fontSize: '10.5px', color: '#047857', fontWeight: 700 }}>مبيعات:</span>
          <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#065f46' }}>
            {todayTotalSales} ج.م
          </span>
          <span style={{ fontSize: '10px', color: '#059669' }}>({todayInvoicesCount})</span>
        </div>

        {/* مؤشر المزامنة */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 7px',
            borderRadius: '8px',
            background: pendingSyncCount > 0 ? '#fffbeb' : '#f0fdf4',
            border: `1px solid ${pendingSyncCount > 0 ? '#fde68a' : '#bbf7d0'}`,
            fontSize: '10.5px',
            fontWeight: 800,
            color: pendingSyncCount > 0 ? '#b45309' : '#15803d'
          }}
        >
          {pendingSyncCount > 0 ? (
            <>
              <RefreshCw size={10} className="spin-slow" />
              <span>معلق ({pendingSyncCount})</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={10} color="#16a34a" />
              <span>متزامن</span>
            </>
          )}
        </div>

        {/* الساعة */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '3px',
            padding: '3px 7px',
            borderRadius: '8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontFamily: "'Segoe UI', Tahoma, monospace",
            fontSize: '12px',
            fontWeight: 800,
            color: '#0f172a'
          }}
        >
          <span>{timeHoursMins}</span>
          <span style={{ fontSize: '10px', color: '#0d9488' }}>:{timeSeconds}</span>
        </div>

        {/* خروج */}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            padding: '5px 8px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '11px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
          title="تسجيل خروج من الطرفية"
        >
          <LogOut size={12} />
          <span>خروج</span>
        </button>
      </div>
    </header>
  );
}
