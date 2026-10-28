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
import PosRightSidebar from './PosRightSidebar';
import PosWhatsAppModal from './PosWhatsAppModal';
import PosLabelPrintModal from './PosLabelPrintModal';
import PosBranchTransferReceiveModal from './PosBranchTransferReceiveModal';
import PosReceivedInvoicesModal from './PosReceivedInvoicesModal';
import PosItemCardexModal from './PosItemCardexModal';
import PosScrapStockModal from './PosScrapStockModal';
import PosCustomerDebtsModal from './PosCustomerDebtsModal';
import PosPatientHistoryModal from './PosPatientHistoryModal';

function PosSystemContent() {
  const [isLabelPrintModalOpen, setIsLabelPrintModalOpen] = React.useState(false);
  const [isTransferReceiveModalOpen, setIsTransferReceiveModalOpen] = React.useState(false);
  const [isReceivedInvoicesOpen, setIsReceivedInvoicesOpen] = React.useState(false);
  const [isItemCardexOpen, setIsItemCardexOpen] = React.useState(false);
  const [isScrapStockOpen, setIsScrapStockOpen] = React.useState(false);
  const [isCustomerDebtsOpen, setIsCustomerDebtsOpen] = React.useState(false);
  const [isPatientHistoryOpen, setIsPatientHistoryOpen] = React.useState(false);
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
    setIsWhatsAppModalOpen,
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

      // بوابة المالك ورادار الفروع والخصومات [Alt+O]
      if (e.altKey && (e.key === 'o' || e.key === 'O' || e.key === 'خ' || e.key === 'ه')) {
        e.preventDefault();
        e.stopPropagation();
        setIsOwnerHubOpen((prev) => !prev);
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
          // مركز واتساب الفرع لخدمة العملاء
          setIsWhatsAppModalOpen(true);
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

    const handleOpenLabelPrint = () => setIsLabelPrintModalOpen(true);
    const handleOpenTransferReceive = () => setIsTransferReceiveModalOpen(true);
    const handleOpenReceivedInvoices = () => setIsReceivedInvoicesOpen(true);
    const handleOpenItemCardex = () => setIsItemCardexOpen(true);
    const handleOpenScrapStock = () => setIsScrapStockOpen(true);
    const handleOpenCustomerDebts = () => setIsCustomerDebtsOpen(true);
    const handleOpenPatientHistory = () => setIsPatientHistoryOpen(true);

    window.addEventListener('pos:open-label-print', handleOpenLabelPrint);
    window.addEventListener('pos:open-transfer-receive', handleOpenTransferReceive);
    window.addEventListener('pos:open-received-invoices', handleOpenReceivedInvoices);
    window.addEventListener('pos:open-item-cardex', handleOpenItemCardex);
    window.addEventListener('pos:open-scrap-stock', handleOpenScrapStock);
    window.addEventListener('pos:open-customer-debts', handleOpenCustomerDebts);
    window.addEventListener('pos:open-patient-history', handleOpenPatientHistory);
    window.addEventListener('pos:trigger-action', handleTriggerAction);
    return () => {
      window.removeEventListener('pos:open-label-print', handleOpenLabelPrint);
      window.removeEventListener('pos:open-transfer-receive', handleOpenTransferReceive);
      window.removeEventListener('pos:open-received-invoices', handleOpenReceivedInvoices);
      window.removeEventListener('pos:open-item-cardex', handleOpenItemCardex);
      window.removeEventListener('pos:open-scrap-stock', handleOpenScrapStock);
      window.removeEventListener('pos:open-customer-debts', handleOpenCustomerDebts);
      window.removeEventListener('pos:open-patient-history', handleOpenPatientHistory);
      window.removeEventListener('pos:trigger-action', handleTriggerAction);
    };
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
    <div className="pos-system-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* لوحة التحكم الرئيسية العلوية */}
      <PosDashboard />

      {/* منطقة العمل الرئيسية: مساحة البيع والنوافذ المنبثقة + الشريط الجانبي الأيمن الدائم */}
      <div className="pos-main-workspace" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', width: '100%', height: '100%' }}>
        {/* الشريط الجانبي الأيمن: الشعار + الساعة + الفرع + الكاشير + الخزنة + الاختصارات */}
        <PosRightSidebar />

        {/* مساحة النوافذ العائمة تمتد حرة بكامل أبعاد الشاشة وفوق الشريط الجانبي */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
          <PosMultiWindowManager />
        </div>
      </div>

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
      <PosWhatsAppModal />

      {/* مودال طباعة ملصقات الباركود الحرارية */}
      <PosLabelPrintModal
        isOpen={isLabelPrintModalOpen}
        onClose={() => setIsLabelPrintModalOpen(false)}
      />

      {/* مودال استلام بضاعة وتحويلات المخزن المركزي بالكود */}
      <PosBranchTransferReceiveModal
        isOpen={isTransferReceiveModalOpen}
        onClose={() => setIsTransferReceiveModalOpen(false)}
      />

      {/* مركز التقارير والرقابة الحصري لنظام نقاط البيع */}
      <PosReportsCenter
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
      />

      {/* سجل الفواتير وأذون الاستلام */}
      <PosReceivedInvoicesModal
        isOpen={isReceivedInvoicesOpen}
        onClose={() => setIsReceivedInvoicesOpen(false)}
      />

      {/* مراجعة حركة الأصناف (Cardex) */}
      <PosItemCardexModal
        isOpen={isItemCardexOpen}
        onClose={() => setIsItemCardexOpen(false)}
      />

      {/* مخزون هوالك وتوالف الفرع */}
      <PosScrapStockModal
        isOpen={isScrapStockOpen}
        onClose={() => setIsScrapStockOpen(false)}
      />

      {/* حسابات الآجل والديون للعملاء */}
      <PosCustomerDebtsModal
        isOpen={isCustomerDebtsOpen}
        onClose={() => setIsCustomerDebtsOpen(false)}
      />

      {/* السجل المرضي للعملاء */}
      <PosPatientHistoryModal
        isOpen={isPatientHistoryOpen}
        onClose={() => setIsPatientHistoryOpen(false)}
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
        <PosSystemContent />
      </div>
    </POSProvider>
  );
}
