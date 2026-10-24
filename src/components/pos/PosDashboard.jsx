import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { arabicWeekday } from '../../utils/formatters';
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
  BookOpen
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
    setIsDeliveryModalOpen,
    setIsBranchStockModalOpen,
    setIsOwnerHubOpen,
    pendingSyncCount
  } = usePOS();

  const { currentBranch, currentEmpUser, authRole } = useAuth?.() || {};
  const terminalCode = localStorage.getItem('app_pos_terminal') || 'POS-01';

  // ── الساعة الرقمية اللحظية بالثواني الدقيقة ──
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
    month: 'long',
    day: 'numeric'
  });
  const dayName = arabicWeekday(currentTime.toISOString().slice(0, 10));

  const todayTotalSales = (currentShift?.totalSalesAmount || 0).toFixed(2);
  const todayInvoicesCount = currentShift?.salesCount || 0;
  const activeWindowsCount = salesWindows.filter((w) => !w.isMinimized).length;

  const isOwnerOrAdmin = authRole === 'owner' || authRole === 'admin' || localStorage.getItem('app_auth_role') === 'owner';

  return (
    <div style={{ width: '100%', direction: 'rtl', zIndex: 20 }}>
      {/* ── 1. شريط القوائم العلوي الموحد (Unified Sleek Top Navigation Bar) ── */}
      <div
        style={{
          background: 'linear-gradient(180deg, #0b1329 0%, #0f172a 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          overflowX: 'auto',
          whiteSpace: 'nowrap'
        }}
      >
        {/* أزرار العمليات والقوائم السريعة */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
          {/* F1: فتح شاشة بيع جديدة */}
          <button
            type="button"
            onClick={() => openNewSalesWindow()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(13, 148, 136, 0.4)'
            }}
          >
            <ShoppingCart size={15} />
            <span>+ شاشة بيع جديدة [F1]</span>
          </button>

          {/* F7: طلبات الدليفري والتوصيل */}
          <button
            type="button"
            onClick={() => setIsDeliveryModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.16)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              color: '#c4b5fd',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Bike size={14} color="#a78bfa" />
            <span>طلبات الدليفري [F7]</span>
          </button>

          {/* F4: مركز التقارير والرقابة الحصرية */}
          <button
            type="button"
            onClick={() => setIsReportsModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <BarChart3 size={14} color="#10b981" />
            <span>تقارير ورقابة الفروع [F4]</span>
          </button>

          {/* F9: مرتجع مبيعات فوري */}
          <button
            type="button"
            onClick={() => setIsReturnsModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={14} color="#ef4444" />
            <span>مرتجع مبيعات [F9]</span>
          </button>

          {/* F2: رادار البدائل الذكية */}
          <button
            type="button"
            onClick={() => setIsSubstitutesModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Sparkles size={14} color="#f59e0b" />
            <span>رادار البدائل [F2]</span>
          </button>

          {/* فحص رصيد الفروع */}
          <button
            type="button"
            onClick={() => setIsBranchStockModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Building2 size={14} color="#38bdf8" />
            <span>رصيد الفروع</span>
          </button>

          {/* F10: بورصة الرواكد التبادلية */}
          <button
            type="button"
            onClick={() => setIsDeadStockModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Package size={13} />
            <span>رواكد تبادلية [F10]</span>
          </button>

          {/* قارئ الفواتير بالذكاء الاصطناعي */}
          <button
            type="button"
            onClick={() => setIsOcrModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <FileSpreadsheet size={13} />
            <span>قارئ AI</span>
          </button>

          {/* F11: روشتات الأمراض المزمنة */}
          <button
            type="button"
            onClick={() => setIsChronicModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <MessageSquare size={13} color="#22c55e" />
            <span>مزمنة [F11]</span>
          </button>

          {/* F12: تسوية وإغلاق الوردية */}
          <button
            type="button"
            onClick={() => setIsShiftModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#a5b4fc',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Clock size={13} color="#818cf8" />
            <span>تسوية وردية [F12]</span>
          </button>

          {/* رادار المالك لكافة الفروع (متاح للمالك والمدير العام) */}
          {isOwnerOrAdmin && (
            <button
              type="button"
              onClick={() => setIsOwnerHubOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.35) 100%)',
                border: '1.5px solid #f59e0b',
                color: '#fbbf24',
                fontSize: '12px',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.25)'
              }}
            >
              <Crown size={14} color="#f59e0b" />
              <span>👑 رادار المالك لكافة الفروع</span>
            </button>
          )}
        </div>

        {/* دليل الاختصارات وزر المساعدة السريع */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setIsShortcutsGuideOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94a3b8',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="دليل اختصارات لوحة المفاتيح لنظام نقاط البيع"
          >
            <BookOpen size={13} />
            <span>الاختصارات</span>
          </button>
        </div>
      </div>

      {/* ── 2. الشريط الدقيق الأنيق للساعة وبيانات الوردية (Slim Telemetry Ribbon - 36px) ── */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          height: '36px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#cbd5e1',
          backdropFilter: 'blur(8px)'
        }}
      >
        {/* الساعة واليوم والتاريخ بنمط LED رقمي رفيع */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontWeight: 900,
              fontSize: '14.5px',
              color: '#34d399',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(16, 185, 129, 0.25)'
            }}
          >
            <span>{timeHoursMins}</span>
            <span style={{ color: '#10b981', animation: 'pulse 1s infinite' }}>:{timeSeconds}</span>
          </div>

          <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>
            📅 {dayName}، {dateFormatted}
          </span>
        </div>

        {/* بيانات الفرع والوردية والكاشير */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8', fontWeight: 800 }}>
            <Building2 size={13} />
            {currentBranch?.name || currentShift?.branchName || 'الفرع الرئيسي'} ({terminalCode})
          </span>

          <span style={{ color: '#64748b' }}>•</span>

          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1' }}>
            <User size={13} color="#94a3b8" />
            {currentEmpUser?.name || currentShift?.cashierName || 'صيدلي الكاشير'}
          </span>

          <span style={{ color: '#64748b' }}>•</span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '1px 8px',
              borderRadius: '99px',
              fontSize: '11px',
              fontWeight: 800,
              background: pendingSyncCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: pendingSyncCount > 0 ? '#fbbf24' : '#34d399',
              border: '1px solid currentColor'
            }}
          >
            {pendingSyncCount > 0 ? (
              <>
                <RefreshCw size={11} className="spin-slow" />
                مزامنة معلقة ({pendingSyncCount})
              </>
            ) : (
              <>
                <CheckCircle2 size={11} />
                متزامن سحابياً
              </>
            )}
          </span>
        </div>

        {/* ملخص المبيعات السريع للوردية الحالية */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>مبيعات الوردية:</span>
            <span style={{ color: '#10b981', fontWeight: 900, fontSize: '13px' }}>
              {todayTotalSales} ج.م
            </span>
            <span style={{ color: '#64748b', fontSize: '11px' }}>({todayInvoicesCount} فاتورة)</span>
          </div>

          {activeWindowsCount > 0 && (
            <span
              style={{
                background: 'rgba(13, 148, 136, 0.15)',
                border: '1px solid var(--primary, #0d9488)',
                color: 'var(--primary, #0d9488)',
                padding: '1px 7px',
                borderRadius: '99px',
                fontSize: '10.5px',
                fontWeight: 900
              }}
            >
              {activeWindowsCount} شاشات نشطة
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
