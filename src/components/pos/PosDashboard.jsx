import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { arabicWeekday, getRealTodayStr } from '../../utils/formatters';
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
  BarChart3
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
    pendingSyncCount
  } = usePOS();

  const { currentBranch, currentEmpUser } = useAuth?.() || {};
  const terminalCode = localStorage.getItem('app_pos_terminal') || 'POS-01';

  // ── 1. الساعة الرقمية اللحظية (Digital Real-Time Clock with Seconds) ──
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

  // ── 2. إحصائيات المبيعات والورديات ──
  const todayTotalSales = (currentShift?.totalSalesAmount || 0).toFixed(2);
  const todayInvoicesCount = currentShift?.salesCount || 0;
  const activeWindowsCount = salesWindows.filter((w) => !w.isMinimized).length;

  return (
    <div className="pos-dashboard-container">
      {/* ── كارت الساعة الرقمية والهوية المركزية ── */}
      <div className="pos-hero-clock-card">
        <div className="pos-hero-clock-display">
          <div className="pos-digital-clock-time">
            {timeHoursMins}
            <span className="pos-digital-clock-seconds">:{timeSeconds}</span>
          </div>
          <div className="pos-digital-clock-date">
            <span>📅 {dayName}، {dateFormatted}</span>
            <span>•</span>
            <span style={{ color: 'var(--primary, #0d9488)', fontWeight: 800 }}>
              ⏱️ وردية مفتوحة منذ {currentShift?.startTime ? new Date(currentShift.startTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'الآن'}
            </span>
          </div>
        </div>

        <div className="pos-hero-user-info">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <span className="pos-branch-badge">
                <Building2 size={15} />
                {currentBranch?.name || currentShift?.branchName || 'الفرع الرئيسي'}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  background: 'rgba(13, 148, 136, 0.1)',
                  color: 'var(--primary, #0d9488)',
                  borderRadius: '99px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  border: '1px solid var(--primary, #0d9488)'
                }}
              >
                🖥️ {terminalCode}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  background: pendingSyncCount > 0 ? '#fef3c7' : '#ecfdf5',
                  color: pendingSyncCount > 0 ? '#b45309' : '#047857',
                  border: '1px solid currentColor',
                  borderRadius: '99px',
                  fontSize: '11.5px',
                  fontWeight: 800
                }}
              >
                {pendingSyncCount > 0 ? (
                  <>
                    <RefreshCw size={13} className="spin-slow" />
                    مزامنة معلقة ({pendingSyncCount})
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} />
                    سحابي متزامن 100%
                  </>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text, #0b132b)' }}>
                {currentEmpUser?.name || currentShift?.cashierName || 'صيدلي الكاشير'}
              </span>
              <User size={16} color="var(--primary, #0d9488)" />
            </div>
          </div>
        </div>
      </div>

      {/* ── مؤشرات الأداء الحية (POS KPIs) ── */}
      <div className="pos-kpi-grid">
        <div className="pos-kpi-card">
          <div className="pos-kpi-icon-bubble" style={{ background: 'rgba(13, 148, 136, 0.1)', color: '#0d9488' }}>
            <DollarSign size={26} />
          </div>
          <div>
            <div className="pos-kpi-val">{todayTotalSales} <span style={{ fontSize: '15px' }}>ج</span></div>
            <div className="pos-kpi-label">مبيعات الوردية الحالية</div>
          </div>
        </div>

        <div className="pos-kpi-card">
          <div className="pos-kpi-icon-bubble" style={{ background: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
            <ShoppingCart size={26} />
          </div>
          <div>
            <div className="pos-kpi-val">{todayInvoicesCount}</div>
            <div className="pos-kpi-label">إجمالي الفواتير المعتمدة</div>
          </div>
        </div>

        <div className="pos-kpi-card">
          <div className="pos-kpi-icon-bubble" style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
            <Layers size={26} />
          </div>
          <div>
            <div className="pos-kpi-val">{activeWindowsCount}</div>
            <div className="pos-kpi-label">شاشات بيع منبثقة نشطة</div>
          </div>
        </div>

        <div className="pos-kpi-card">
          <div className="pos-kpi-icon-bubble" style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
            <AlertTriangle size={26} />
          </div>
          <div>
            <div className="pos-kpi-val">2</div>
            <div className="pos-kpi-label">رواكد أوشكت على الصلاحية</div>
          </div>
        </div>
      </div>

      {/* ── لوحة الاختصارات والوصول السريع (Quick Shortcuts Pad) ── */}
      <div className="pos-shortcuts-palette-card">
        <div className="pos-shortcuts-title-bar">
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'var(--text, #0b132b)' }}>
              ⚡ لوحة الاختصارات السريعة والعمليات الفورية (Zero-Mouse Launchpad)
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted, #475569)' }}>
              يمكنك الضغط على الأزرار مباشرة أو استخدام مفاتيح الكيبورد من أي شاشة داخل النظام
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsShortcutsGuideOpen(true)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border, #cbd5e1)',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              color: 'var(--primary, #0d9488)'
            }}
          >
            📖 دليل الاختصارات الكامل [F1]
          </button>
        </div>

        <div className="pos-shortcuts-grid">
          {/* F1: فتح شاشة بيع جديدة */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => openNewSalesWindow()}
            style={{ borderColor: 'var(--primary, #0d9488)', background: 'var(--primary-light, #f0fdfa)' }}
          >
            <span className="pos-shortcut-key-badge" style={{ background: '#0d9488' }}>F1</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>فتح شاشة بيع جديدة</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>نافذة منبثقة عائمة متعددة</div>
            </div>
            <ShoppingCart size={18} color="#0d9488" />
          </button>

          {/* F2: رادار البدائل الذكية */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => setIsSubstitutesModalOpen(true)}
          >
            <span className="pos-shortcut-key-badge">F2</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>رادار البدائل والربحية</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>ترتيب بهامش الربح والصلاحية</div>
            </div>
            <Sparkles size={18} color="#d97706" />
          </button>

          {/* F4: مركز التقارير والرقابة الحصرية */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => setIsReportsModalOpen(true)}
            style={{ borderColor: 'rgba(13, 148, 136, 0.4)', background: 'rgba(13, 148, 136, 0.05)' }}
          >
            <span className="pos-shortcut-key-badge" style={{ background: '#0f766e' }}>F4</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>مركز التقارير والرقابة</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>تقارير X و Z واليومية وحركة الأصناف</div>
            </div>
            <BarChart3 size={18} color="#0d9488" />
          </button>

          {/* F9: مرتجع الفاتورة */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => setIsReturnsModalOpen(true)}
          >
            <span className="pos-shortcut-key-badge">F9</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>مرتجع مبيعات فوري</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>برقم الفاتورة والباركود</div>
            </div>
            <RotateCcw size={18} color="#dc2626" />
          </button>

          {/* F10: بورصة تصفير الرواكد */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => setIsDeadStockModalOpen(true)}
          >
            <span className="pos-shortcut-key-badge">F10</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>بورصة الرواكد التبادلية</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>تحويل المخزون بين الفروع P2P</div>
            </div>
            <Package size={18} color="#059669" />
          </button>

          {/* F11: أتمتة الواتساب للأمراض المزمنة */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => setIsChronicModalOpen(true)}
          >
            <span className="pos-shortcut-key-badge">F11</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>أتمتة أدوية المزمنة</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>إعادة الصرف عبر الواتساب</div>
            </div>
            <MessageSquare size={18} color="#25D366" />
          </button>

          {/* F12: تسوية وإغلاق الوردية */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => setIsShiftModalOpen(true)}
          >
            <span className="pos-shortcut-key-badge">F12</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>تسوية وإغلاق الوردية</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>جرد النقدية وتقرير Z-Report</div>
            </div>
            <Clock size={18} color="#6366f1" />
          </button>

          {/* قارئ الفواتير بالذكاء الاصطناعي */}
          <button
            type="button"
            className="pos-shortcut-btn"
            onClick={() => setIsOcrModalOpen(true)}
          >
            <span className="pos-shortcut-key-badge">OCR</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>قارئ فواتير الشركات (AI)</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>قراءة فواتير الموزعين آلياً</div>
            </div>
            <FileSpreadsheet size={18} color="#0284c7" />
          </button>
        </div>
      </div>
    </div>
  );
}
