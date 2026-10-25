import React, { useEffect } from 'react';
import './pos.css';
import { POSProvider, usePOS } from '../../context/POSContext';
import PosDashboard from './PosDashboard';
import PosMultiWindowManager from './PosMultiWindowManager';
import PosPaymentModal from './PosPaymentModal';
import PosSubstitutesModal from './PosSubstitutesModal';
import PosReturnsModal from './PosReturnsModal';
import PosShiftModal from './PosShiftModal';
import PosDeadStockExchangeModal from './PosDeadStockExchangeModal';
import PosChronicRefillModal from './PosChronicRefillModal';
import PosInvoiceOcrModal from './PosInvoiceOcrModal';
import PosShortcutsGuideModal from './PosShortcutsGuideModal';
import PosReportsCenter from './PosReportsCenter';
import PosBranchStockModal from './PosBranchStockModal';
import PosDeliveryModal from './PosDeliveryModal';
import PosCustomerModal from './PosCustomerModal';
import PosCustomerHistoryModal from './PosCustomerHistoryModal';
import PosOwnerMultiBranchHub from './PosOwnerMultiBranchHub';

function PosSystemContent() {
  const {
    openNewSalesWindow,
    setIsSubstitutesModalOpen,
    setIsReturnsModalOpen,
    setIsDeadStockModalOpen,
    setIsChronicModalOpen,
    setIsShiftModalOpen,
    setIsOcrModalOpen,
    setIsShortcutsGuideOpen,
    isReportsModalOpen,
    setIsReportsModalOpen,
    setIsDeliveryModalOpen,
    setIsBranchStockModalOpen,
    setIsCustomerModalOpen,
    setIsOwnerHubOpen,
    salesWindows,
    activeWindowId,
    toggleCartItemUnit,
    clearCart,
    setIsPaymentModalOpen,
    setActivePaymentSale
  } = usePOS();

  // ── الاستماع المركزي لاختصارات Zero-Mouse (F1..F12) داخل نظام نقاط البيع ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      // بيع نقدي سريع بدون ريسيت
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('pos:quick-cash-checkout'));
        return;
      }

      // إضافة صنف حر / غير مكود
      if (e.ctrlKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('pos:open-uncoded-modal'));
        return;
      }

      // حظر مفاتيح المساعدة والوظائف التقليدية في المتصفح
      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      switch (e.key) {
        case 'F1':
          // فتح شاشة بيع جديدة
          openNewSalesWindow();
          break;
        case 'F8':
          // إظهار وإخفاء الأصناف السريعة
          window.dispatchEvent(new CustomEvent('pos:toggle-quick-items'));
          break;
        case 'F2':
          // فحص البدائل الذكية
          setIsSubstitutesModalOpen(true);
          break;
        case 'F3':
          // تبديل وحدة الصنف المحدد
          if (activeWindowId) {
            const win = salesWindows.find((w) => w.id === activeWindowId);
            if (win && win.cart.length > 0) {
              toggleCartItemUnit(activeWindowId, win.cart.length - 1);
            }
          }
          break;
        case 'F4':
          // مركز التقارير والرقابة الحصرية لنقاط البيع
          setIsReportsModalOpen(true);
          break;
        case 'F5':
          // دفع نقدي سريع
          if (activeWindowId) {
            const win = salesWindows.find((w) => w.id === activeWindowId);
            if (win && win.cart.length > 0) {
              const subtotal = win.cart.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
              setActivePaymentSale({
                windowId: activeWindowId,
                cart: win.cart,
                subtotal,
                discountAmount: 0,
                totalAmount: subtotal,
                customer: win.customer,
                paymentMethod: 'cash'
              });
              setIsPaymentModalOpen(true);
            }
          }
          break;
        case 'F6':
          // دفع متعدد (فيزا / محفظة)
          if (activeWindowId) {
            const win = salesWindows.find((w) => w.id === activeWindowId);
            if (win && win.cart.length > 0) {
              const subtotal = win.cart.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
              setActivePaymentSale({
                windowId: activeWindowId,
                cart: win.cart,
                subtotal,
                discountAmount: 0,
                totalAmount: subtotal,
                customer: win.customer,
                paymentMethod: 'card'
              });
              setIsPaymentModalOpen(true);
            }
          }
          break;
        case 'F7':
          // شاشة طلبات الدليفري والتوصيل
          setIsDeliveryModalOpen(true);
          break;
        case 'F9':
          // مرتجع مبيعات
          setIsReturnsModalOpen(true);
          break;
        case 'F10':
          // بورصة تصفير الرواكد
          setIsDeadStockModalOpen(true);
          break;
        case 'F11':
          // أدوية الأمراض المزمنة
          setIsChronicModalOpen(true);
          break;
        case 'F12':
          // إغلاق وتسوية الوردية
          setIsShiftModalOpen(true);
          break;
        case 'Escape':
          // إلغاء السلة إذا لم يكن هناك مودال مفتوح
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [
    openNewSalesWindow,
    setIsSubstitutesModalOpen,
    setIsReturnsModalOpen,
    setIsDeadStockModalOpen,
    setIsChronicModalOpen,
    setIsShiftModalOpen,
    setIsShortcutsGuideOpen,
    setIsDeliveryModalOpen,
    setIsBranchStockModalOpen,
    setIsCustomerModalOpen,
    activeWindowId,
    salesWindows,
    toggleCartItemUnit,
    setActivePaymentSale,
    setIsPaymentModalOpen
  ]);

  // ── الاستماع لأوامر التنقل القادمة من القائمة العلوية DesktopLayout ──
  useEffect(() => {
    const handleTriggerAction = (e) => {
      const action = e.detail?.action;
      if (!action) return;
      switch (action) {
        case 'new-sale':
          openNewSalesWindow();
          break;
        case 'substitutes':
          setIsSubstitutesModalOpen(true);
          break;
        case 'delivery':
          setIsDeliveryModalOpen(true);
          break;
        case 'customer':
          setIsCustomerModalOpen(true);
          break;
        case 'returns':
          setIsReturnsModalOpen(true);
          break;
        case 'deadstock':
          setIsDeadStockModalOpen(true);
          break;
        case 'chronic':
          setIsChronicModalOpen(true);
          break;
        case 'shift':
          setIsShiftModalOpen(true);
          break;
        case 'ocr':
          setIsOcrModalOpen(true);
          break;
        case 'reports':
          setIsReportsModalOpen(true);
          break;
        case 'shortcuts':
          setIsShortcutsGuideOpen(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('pos:trigger-action', handleTriggerAction);
    return () => window.removeEventListener('pos:trigger-action', handleTriggerAction);
  }, [
    openNewSalesWindow,
    setIsSubstitutesModalOpen,
    setIsReturnsModalOpen,
    setIsDeadStockModalOpen,
    setIsChronicModalOpen,
    setIsShiftModalOpen,
    setIsOcrModalOpen,
    setIsReportsModalOpen,
    setIsShortcutsGuideOpen,
    setIsDeliveryModalOpen,
    setIsCustomerModalOpen
  ]);

  return (
    <div className="pos-system-root">
      {/* لوحة التحكم الرئيسية */}
      <PosDashboard />

      {/* لوحة النوافذ العائمة المنبثقة المتعددة */}
      <PosMultiWindowManager />

      {/* كافة المودالات الوظيفية */}
      <PosPaymentModal />
      <PosSubstitutesModal />
      <PosReturnsModal />
      <PosShiftModal />
      <PosDeadStockExchangeModal />
      <PosChronicRefillModal />
      <PosInvoiceOcrModal />
      <PosShortcutsGuideModal />
      <PosBranchStockModal />
      <PosDeliveryModal />
      <PosCustomerModal />
      <PosCustomerHistoryModal />
      <PosOwnerMultiBranchHub />

      {/* مركز التقارير والرقابة الحصري لنظام نقاط البيع */}
      <PosReportsCenter
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
      />
    </div>
  );
}

export default function PosSystemView({
  isStandalone = false,
  themeMode,
  toggleTheme,
  state,
  setState,
  saveState,
  showToast,
  currentBranch,
  authRole,
  currentEmpUser,
  onLogout
}) {
  const terminalCode = localStorage.getItem('app_pos_terminal') || 'POS-01';
  const posBranchName = localStorage.getItem('app_pos_branch_name') || currentBranch?.name || 'الفرع الرئيسي';

  // ⛔ تفعيل علم عزل اختصارات الـ POS لمنع أي تداخل مع نظام الـ HR
  useEffect(() => {
    window.__IS_POS_SYSTEM_ACTIVE__ = true;
    return () => {
      window.__IS_POS_SYSTEM_ACTIVE__ = false;
    };
  }, []);

  const handleTerminalLogout = () => {
    try {
      localStorage.removeItem('app_pos_authenticated');
      localStorage.removeItem('app_pos_terminal');
      localStorage.removeItem('app_pos_terminal_data');
      localStorage.removeItem('app_pos_branch_id');
      localStorage.removeItem('app_pos_branch_name');
      if (localStorage.getItem('app_auth_role') === 'pos') {
        localStorage.removeItem('app_auth_role');
      }
    } catch {}
    if (onLogout) onLogout();
    window.location.href = '/';
  };

  return (
    <POSProvider>
      <div
        id="pos-system-shell"
        className="pos-system-shell pos-container"
        data-pos-system="true"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#f1f5f9',
          color: '#0f172a'
        }}
      >
      {isStandalone && (
        <div
          style={{
            height: '46px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            direction: 'rtl',
            zIndex: 100,
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 900, color: 'var(--primary, #0d9488)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              💊 PharmaOS POS | {posBranchName} ({terminalCode})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('pos:trigger-action', { detail: { action: 'delivery' } }));
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: '#f5f3ff',
                border: '1px solid #c4b5fd',
                borderRadius: '8px',
                padding: '5px 12px',
                color: '#7c3aed',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 800
              }}
            >
              🛵 طلبات الدليفري [F7]
            </button>

            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('pos:trigger-action', { detail: { action: 'reports' } }));
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: '#f0fdfa',
                border: '1px solid #99f6e4',
                borderRadius: '8px',
                padding: '5px 12px',
                color: '#0d9488',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 800
              }}
            >
              📊 مركز التقارير والرقابة [F4]
            </button>

            {toggleTheme && (
              <button
                type="button"
                onClick={toggleTheme}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#64748b',
                  padding: '4px 6px'
                }}
              >
                {themeMode === 'dark' ? '☀️ نهار' : '🌙 ليل'}
              </button>
            )}

            <button
              type="button"
              onClick={handleTerminalLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '5px 12px',
                color: '#dc2626',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              🚪 تسجيل خروج
            </button>
          </div>
        </div>
      )}
        <PosSystemContent />
      </div>
    </POSProvider>
  );
}
