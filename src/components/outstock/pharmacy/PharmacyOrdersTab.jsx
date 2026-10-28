import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  Printer,
  CheckCircle,
  CheckCircle2,
  MessageSquare,
  AlertCircle,
  Clock,
  Check,
  Barcode,
  Phone,
  Calendar,
  RefreshCw,
  FileText,
  Scissors,
  Truck,
  Filter,
  X,
  XCircle,
  Send,
  Sparkles,
  Archive,
  AlertTriangle,
  ArrowRightLeft,
  Edit,
  Trash2,
  DollarSign,
  RotateCcw,
  MoreHorizontal,
  ChevronDown
} from 'lucide-react';
import {
  outstockGetOrders,
  outstockDeliverOrder,
  outstockMarkWhatsappNotified,
  outstockDeleteOrder,
  outstockDeleteOrderItem,
  outstockUpdateOrderDeposit,
  outstockGetOrderReturns,
  outstockGetSettings
} from '../../../utils/outstockApiClient';
import NewCustomerOrderModal from './NewCustomerOrderModal';
import DualCashierReceiptModal from './DualCashierReceiptModal';
import OrderDeliverySettlementModal from './OrderDeliverySettlementModal';
import OrderRemainingCompletionModal from './OrderRemainingCompletionModal';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';
import OrderComplaintModal from './OrderComplaintModal';
import OrderReturnModal from '../common/OrderReturnModal';
import MedicationSubstitutesModal from '../common/MedicationSubstitutesModal';
import OrderDepositRefundModal from '../common/OrderDepositRefundModal';
import { printReturnReceipt } from '../../../utils/printReturnReceipt';
import {
  calculateNetBusinessMinutes,
  formatSlaDuration,
  DEFAULT_SLA_WORKING_HOURS_CONFIG
} from '../../../utils/outstockSlaEngine';

/**
 * PharmacyOrdersTab.jsx
 * شاشة طلبات العملاء بالصيدلية
 * - إنشاء طلبات جديدة، بحث بالباركود/الهاتف/الاسم
 * - فلتر الطلبات قيد انتظار المشتريات
 * - فلتر الطلبات التي تم الرد عليها من قبل المشتريات
 * - تبويبة طلبات محولة من وإلى مع فلتر جهة التحويل 🔄
 * - زر تصعيد شكوى للمالك: تأخير الرد أو الصنف لم يتوفر ⚠️
 * - فلتر التاريخ (من تاريخ ... إلى تاريخ)
 * - تبويبة داخلية لأرشيف الطلبات المسلمة
 * - تسجيل وعرض تاريخ ووقت إرسال الطلب للمشتريات
 * - تسجيل وعرض تاريخ ووقت رد المشتريات وتتبع مدة الاستجابة
 * - التحقق الإجباري من كود الموظف المستلم والمسلّم (مستور كباسورد) 🔒
 */
export default function PharmacyOrdersTab({ branchId, branch, currentPharmacist = '', showToast, initialInnerTab = 'active' }) {
  // التبويبة الداخلية: 'active' (النشطة والمعلقة) | 'transferred' (محولة من وإلى) | 'delivered' (المسلمة)
  const [activeInnerTab, setActiveInnerTab] = useState(initialInnerTab);

  useEffect(() => {
    if (initialInnerTab) {
      setActiveInnerTab(initialInnerTab);
    }
  }, [initialInnerTab]);

  // فلاتر التبويبة النشطة: 'all' (افتراضي: كافة الطلبات) | 'waiting_procurement' | 'replied' | 'unavailable'
  const [activeSubFilter, setActiveSubFilter] = useState('all');

  // فلاتر الطلبات المحولة: 'all' (الكل) | 'to' (محولة إلى هذا الفرع - واردة) | 'from' (محولة من هذا الفرع - صادرة)
  const [transferredFilter, setTransferredFilter] = useState('all');
  const [transferredOrders, setTransferredOrders] = useState([]);
  const [isTransferredLoading, setIsTransferredLoading] = useState(false);

  // فلتر التاريخ
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [orders, setOrders] = useState([]);
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeliveredLoading, setIsDeliveredLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [printingOrder, setPrintingOrder] = useState(null);

  // ⚠️ نافذة شكوى تأخير الرد أو عدم توفر الصنف المصعدة للمالك
  const [complaintOrder, setComplaintOrder] = useState(null);

  // 🔒 حالة التحقق من كود الموظف المستلم لإنشاء الطلب
  const [isReceiverAuthOpen, setIsReceiverAuthOpen] = useState(false);
  const [authenticatedReceiver, setAuthenticatedReceiver] = useState(null);

  // ✏️ حالة تعديل الطلب وحذف الأصناف والعربون
  const [editingOrder, setEditingOrder] = useState(null);
  const [depositModalOrder, setDepositModalOrder] = useState(null);
  const [newDepositAmount, setNewDepositAmount] = useState('');
  const [isSavingDeposit, setIsSavingDeposit] = useState(false);

  // 🔒 حالة التحقق من كود الموظف المسلّم لتسليم الطلب
  const [deliveryAuthOrder, setDeliveryAuthOrder] = useState(null);
  const [authenticatedDeliverer, setAuthenticatedDeliverer] = useState(null);

  // ↩️ حالة مرتجعات طلبات العملاء بالفرع والتحقق من كود الموظف
  const [branchReturns, setBranchReturns] = useState([]);
  const [isReturnsLoading, setIsReturnsLoading] = useState(false);
  const [returningOrder, setReturningOrder] = useState(null);
  const [returnAuthOrder, setReturnAuthOrder] = useState(null);
  const [authenticatedReturnEmployee, setAuthenticatedReturnEmployee] = useState(null);
  const [returnsSubFilter, setReturnsSubFilter] = useState('all');

  // 🔄 حالة نافذة فحص البدائل والمثائل الدوائية الذكية (AI Drug Eye)
  const [substitutesModalData, setSubstitutesModalData] = useState(null);

  // 💵 حالة نافذة تسوية واسترداد العربون قبل حذف وإلغاء الطلب
  const [refundModalOrder, setRefundModalOrder] = useState(null);

  // 📦 حالة نافذة استكمال ومتابعة الطلب المنبثقة بعد التسليم الجزئي
  const [completionModalData, setCompletionModalData] = useState(null);

  // ⚙️ مهلة المرتجعات المحددة من المالك وإعدادات ساعات عمل المشتريات
  const [allowedReturnDays, setAllowedReturnDays] = useState(14);
  const [slaBusinessHoursConfig, setSlaBusinessHoursConfig] = useState(DEFAULT_SLA_WORKING_HOURS_CONFIG);
  const [openMoreMenuOrderId, setOpenMoreMenuOrderId] = useState(null);

  useEffect(() => {
    outstockGetSettings().then((res) => {
      if (res?.success && res.settings) {
        const s = res.settings;
        if (s.returns_allowed_days || s.returnsAllowedDays) {
          setAllowedReturnDays(parseInt(s.returns_allowed_days || s.returnsAllowedDays, 10));
        }
        if (s.procurementSlaWorkingHours || s.procurement_sla_working_hours) {
          setSlaBusinessHoursConfig(s.procurementSlaWorkingHours || s.procurement_sla_working_hours);
        }
      }
    }).catch(() => {});

    const handleSettingsUpdate = (e) => {
      const s = e?.detail?.settings;
      if (s) {
        if (s.returns_allowed_days || s.returnsAllowedDays) {
          setAllowedReturnDays(parseInt(s.returns_allowed_days || s.returnsAllowedDays, 10));
        }
        if (s.procurementSlaWorkingHours || s.procurement_sla_working_hours) {
          setSlaBusinessHoursConfig(s.procurementSlaWorkingHours || s.procurement_sla_working_hours);
        }
      }
    };
    window.addEventListener('outstock:settings_updated', handleSettingsUpdate);
    return () => window.removeEventListener('outstock:settings_updated', handleSettingsUpdate);
  }, []);

  // جلب الطلبات النشطة
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOrders({
        branchId,
        status: 'active',
        orderType: 'customer',
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      if (res?.success && Array.isArray(res.orders)) {
        setOrders(res.orders);
      }
    } catch (e) {
      console.warn('Fetch branch active orders error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, dateFrom, dateTo]);

  // جلب الطلبات المحولة من وإلى هذا الفرع
  const fetchTransferredOrders = useCallback(async () => {
    setIsTransferredLoading(true);
    try {
      const res = await outstockGetOrders({
        branchId,
        transferredOnly: true,
        transferDirection: transferredFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      if (res?.success && Array.isArray(res.orders)) {
        setTransferredOrders(res.orders);
      }
    } catch (e) {
      console.warn('Fetch transferred orders error:', e);
    } finally {
      setIsTransferredLoading(false);
    }
  }, [branchId, transferredFilter, dateFrom, dateTo]);

  // جلب أرشيف الطلبات المسلمة
  const fetchDeliveredOrders = useCallback(async () => {
    setIsDeliveredLoading(true);
    try {
      const res = await outstockGetOrders({
        branchId,
        status: 'delivered',
        orderType: 'customer',
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      if (res?.success && Array.isArray(res.orders)) {
        setDeliveredOrders(res.orders);
      }
    } catch (e) {
      console.warn('Fetch delivered orders error:', e);
    } finally {
      setIsDeliveredLoading(false);
    }
  }, [branchId, dateFrom, dateTo]);

  // جلب سجل مرتجعات الفرع
  const fetchBranchReturns = useCallback(async () => {
    setIsReturnsLoading(true);
    try {
      const res = await outstockGetOrderReturns({ branchId });
      if (res?.success && Array.isArray(res.returns)) {
        setBranchReturns(res.returns);
      } else {
        setBranchReturns([]);
      }
    } catch {
      setBranchReturns([]);
    } finally {
      setIsReturnsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (branchId) {
      if (activeInnerTab === 'active') {
        fetchOrders();
      } else if (activeInnerTab === 'transferred') {
        fetchTransferredOrders();
      } else if (activeInnerTab === 'returns') {
        fetchBranchReturns();
      } else {
        fetchDeliveredOrders();
      }

      // جلب عدد الطلبات المحولة والمرتجعات لتحديث العدادات
      if (activeInnerTab !== 'transferred') {
        outstockGetOrders({ branchId, transferredOnly: true, transferDirection: 'all' })
          .then((res) => {
            if (res?.success && Array.isArray(res.orders)) {
              setTransferredOrders(res.orders);
            }
          })
          .catch(() => {});
      }
      if (activeInnerTab !== 'returns') {
        outstockGetOrderReturns({ branchId })
          .then((res) => {
            if (res?.success && Array.isArray(res.returns)) {
              setBranchReturns(res.returns);
            }
          })
          .catch(() => {});
      }
    }
  }, [branchId, activeInnerTab, fetchOrders, fetchTransferredOrders, fetchDeliveredOrders, fetchBranchReturns]);

  // الاستماع المباشر لتحديثات المزامنة اللحظية والأوفلاين
  useEffect(() => {
    const handleSyncEvent = (e) => {
      const data = e?.detail || e;
      const isTargetBranch = data?.toBranchId && String(data.toBranchId) === String(branchId);
      const isTargetBranch2 = data?.targetBranchId && String(data.targetBranchId) === String(branchId);
      const isSourceBranch = data?.branchId && String(data.branchId) === String(branchId);

      if (!data?.branchId || isSourceBranch || isTargetBranch || isTargetBranch2) {
        if (activeInnerTab === 'active') fetchOrders();
        else if (activeInnerTab === 'transferred') fetchTransferredOrders();
        else fetchDeliveredOrders();
      }
    };

    window.addEventListener('outstock:order_created', handleSyncEvent);
    window.addEventListener('outstock:order_transferred', handleSyncEvent);
    window.addEventListener('outstock:item_status_updated', handleSyncEvent);
    window.addEventListener('outstock:items_status_updated', handleSyncEvent);
    window.addEventListener('outstock:order_synced', handleSyncEvent);
    window.addEventListener('outstock:order_delivered', handleSyncEvent);
    window.addEventListener('outstock:realtime_event', handleSyncEvent);

    return () => {
      window.removeEventListener('outstock:order_created', handleSyncEvent);
      window.removeEventListener('outstock:order_transferred', handleSyncEvent);
      window.removeEventListener('outstock:item_status_updated', handleSyncEvent);
      window.removeEventListener('outstock:items_status_updated', handleSyncEvent);
      window.removeEventListener('outstock:order_synced', handleSyncEvent);
      window.removeEventListener('outstock:order_delivered', handleSyncEvent);
      window.removeEventListener('outstock:realtime_event', handleSyncEvent);
    };
  }, [branchId, activeInnerTab, fetchOrders, fetchTransferredOrders, fetchDeliveredOrders]);

  // فتح عملية إنشاء طلب جديد بطلب كود الموظف المستلم أولاً 🔒
  const handleStartNewOrder = () => {
    setIsReceiverAuthOpen(true);
  };

  const handleReceiverAuthSuccess = (emp) => {
    setAuthenticatedReceiver(emp);
    setIsReceiverAuthOpen(false);
    setIsNewOrderModalOpen(true);
  };

  // حالة نافذة تأكيد تسليم الدواء
  const [deliveryConfirmOrder, setDeliveryConfirmOrder] = useState(null);
  const [isDelivering, setIsDelivering] = useState(false);

  // تسليم الطلب للعميل - طلب كود الموظف المسلّم أولاً 🔒
  const handleDeliver = (orderOrId) => {
    const targetOrder =
      typeof orderOrId === 'object'
        ? orderOrId
        : orders.find((o) => o.id === orderOrId) || transferredOrders.find((o) => o.id === orderOrId);

    const items = targetOrder?.items || [];

    // فحص الأصناف الجاهزة للتسليم (ردت المشتريات عليها بالتوفر الفعلي ولم تسلَّم بعد)
    const availableItems = items.filter((it) => {
      const isPruned = Boolean(it.pruned_from_bill || it.prunedFromBill);
      const itmStatus = String(it.item_status || it.itemStatus || it.status || '').toLowerCase();
      const isDelivered = itmStatus === 'delivered';
      const isInPreparation = itmStatus === 'in_preparation';
      const isAvailable = itmStatus === 'available_by_procurement' || itmStatus === 'available';
      return !isPruned && !isDelivered && !isInPreparation && isAvailable;
    });

    if (availableItems.length === 0) {
      const inPrepItems = items.filter((it) => String(it.item_status || it.itemStatus || it.status || '').toLowerCase() === 'in_preparation');
      if (inPrepItems.length > 0) {
        const itemNames = inPrepItems.map((it) => it.medication_name || it.item_name || it.medicationName).join(' ، ');
        showToast?.(`🚚 لا يمكن تسليم هذا الطلب الآن! يوجد (${inPrepItems.length}) أصناف قيد التجهيز والتوريد من إدارة المشتريات: (${itemNames})، يرجى انتظار وصول الشحنة وتأكيد التوفر.`);
        return;
      }

      const pendingItems = items.filter(
        (it) => !it.procurement_replied_at && (it.item_status === 'pending' || it.status === 'pending' || !it.item_status)
      );
      if (pendingItems.length > 0) {
        const itemNames = pendingItems.map((it) => it.medication_name || it.item_name || it.medicationName).join(' ، ');
        showToast?.(`⏳ لا توجد أصناف متوفرة جاهزة للتسليم حالياً! يوجد (${pendingItems.length}) أصناف قيد انتظار رد المشتريات: (${itemNames})`);
      } else {
        showToast?.('⚠️ لا توجد أي أصناف متوفرة جاهزة للتسليم في هذا الطلب.');
      }
      return;
    }

    setDeliveryAuthOrder(targetOrder || { id: orderOrId });
  };

  const handleDeliverAuthSuccess = (emp) => {
    const target = deliveryAuthOrder;
    setDeliveryAuthOrder(null);
    setAuthenticatedDeliverer(emp);
    setDeliveryConfirmOrder(target);
  };

  // إرسال واتساب للعميل يدوياً بنقرة الصيدلي
  const handleSendWhatsapp = async (order) => {
    const phone = order.customer_phone || order.customerPhone || '';
    if (!phone) {
      showToast?.('⚠️ لا يوجد رقم هاتف مسجل لهذا العميل');
      return;
    }

    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;

    const custName = order.customer_name || order.customerName || 'عميلنا العزيز';
    const bName = branch?.name || 'الصيدلية';
    const remaining = parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2);

    const items = order.items || [];
    const availableItems = items.filter((it) => it.itemStatus === 'available_by_procurement' || it.itemStatus === 'delivered');
    const unavailableItems = items.filter((it) => it.itemStatus === 'unavailable_in_market' || it.prunedFromBill || it.pruned_from_bill);
    const pendingItems = items.filter((it) => it.itemStatus === 'pending');

    let statusDetails = '';
    if (availableItems.length > 0 && unavailableItems.length === 0 && pendingItems.length === 0) {
      statusDetails = `نود إبلاغك بتوفر كامل أصناف طلبك الدوائي لدى ${bName}، وهو جاهز للتسليم الآن في أي وقت.`;
    } else if (availableItems.length > 0) {
      statusDetails = `نود إبلاغك بتوفر أصناف من طلبك الدوائي لدى ${bName} وجاهزة للاستلام.\n(الأصناف المتوفرة: ${availableItems.map((i) => i.medicationName || i.medication_name).join('، ')})`;
      if (unavailableItems.length > 0) {
        statusDetails += `\n(نعتذر لعدم توفر: ${unavailableItems.map((i) => i.medicationName || i.medication_name).join('، ')})`;
      }
    } else if (unavailableItems.length > 0) {
      statusDetails = `نعتذر لسيادتكم عن عدم توفر الصنف المطلوب بالأسواق حالياً (${unavailableItems.map((i) => i.medicationName || i.medication_name).join('، ')}). نرحب بزيارتكم لتوفير البديل الطبي المناسب أو استرداد العربون.`;
    } else {
      statusDetails = `نود إبلاغك بمستجدات طلبك الدوائي (إيصال: #${order.order_number || order.orderNumber}) لدى ${bName}.`;
    }

    const msg = `السلام عليكم ورحمة الله وبركاته،\n\nأهلاً بك أ/ ${custName}\n${statusDetails}\n\nرقم الطلب: #${order.order_number || order.orderNumber}\nالمتبقي عند الاستلام: ${remaining} ج.م\n\nنسعد دائماً بخدمتكم وتوفير كافة احتياجاتكم الطبية.`;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');

    outstockMarkWhatsappNotified(order.id).catch(() => {});
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, whatsapp_notified_at: new Date().toISOString() } : o))
    );
    setTransferredOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, whatsapp_notified_at: new Date().toISOString() } : o))
    );
    showToast?.('✅ تم فتح محادثة الواتساب بنجاح وتحديث حالة إشعار العميل');
  };

  // فتح نافذة تعديل العربون
  const handleOpenDepositModal = (order) => {
    setDepositModalOrder(order);
    setNewDepositAmount(String(order.paid_amount || order.paidAmount || 0));
  };

  // حفظ العربون الجديد
  const handleSaveDepositAmount = async () => {
    if (!depositModalOrder) return;
    const depVal = parseFloat(newDepositAmount);
    if (isNaN(depVal) || depVal < 0) {
      showToast?.('يرجى إدخال مبلغ عربون صالح');
      return;
    }
    setIsSavingDeposit(true);
    try {
      const res = await outstockUpdateOrderDeposit(depositModalOrder.id, {
        paidAmount: depVal,
        notes: `تعديل عربون من الصيدلية إلى ${depVal} ج.م`
      });
      if (res?.success) {
        showToast?.('✅ تم تحديث مبلغ العربون بنجاح');
        setDepositModalOrder(null);
        fetchOrders();
      } else {
        showToast?.(res?.error || 'تعذر تحديث مبلغ العربون');
      }
    } catch {
      showToast?.('تعذر تحديث مبلغ العربون');
    } finally {
      setIsSavingDeposit(false);
    }
  };

  // حذف وإلغاء الطلب بالكامل وتسوية العربون
  const handleDeleteOrder = async (orderId, orderNum) => {
    const targetOrder = orders.find((o) => o.id === orderId) || transferredOrders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const ordStatus = String(targetOrder.order_status || targetOrder.status || '').toLowerCase();
    if (ordStatus === 'delivered' || ordStatus === 'completed') {
      showToast?.('⚠️ لا يمكن حذف طلب تم تسليمه، يرجى استخدام نظام المرتجعات');
      return;
    }

    const items = targetOrder.items || [];
    const undeliveredAvailable = items.some(i => 
      !i.pruned_from_bill && !i.prunedFromBill &&
      i.item_status !== 'delivered' && i.itemStatus !== 'delivered' &&
      i.item_status !== 'returned' && i.itemStatus !== 'returned' &&
      (i.item_status === 'available_by_procurement' || i.itemStatus === 'available_by_procurement' || i.status === 'available')
    );

    // إذا قامت المشتريات بتوفير الصنف بنجاح بالفرع ولم يُسلَّم بعد، يُمنع الحذف ويُطلب تسليمه أو عمل مرتجع للأصناف المتوفرة
    if (undeliveredAvailable) {
      showToast?.('⚠️ لا يمكن حذف الطلب بعد أن قامت إدارة المشتريات بتوفيره بالفرع، يرجى تسليمه للعميل أو عمل مرتجع للأصناف المتوفرة');
      return;
    }

    // فحص العربون: إذا كان هناك عربون مدفوع، نفتح نافذة تسوية واسترداد العربون الفاخرة
    const paidAmount = parseFloat(targetOrder.paid_amount || targetOrder.paidAmount || 0);
    if (paidAmount > 0) {
      setRefundModalOrder(targetOrder);
      return;
    }

    const isPartial = String(targetOrder.order_status || targetOrder.status || '').toLowerCase() === 'partially_delivered';
    const confirmMsg = isPartial
      ? `هل أنت متأكد من إلغاء الصنف غير المتوفر بالطلب رقم (${orderNum}) وإتمام إغلاق الطلب وتثبيت الأصناف المستلمة؟`
      : `هل أنت متأكد من حذف وإلغاء الطلب رقم (${orderNum}) بالكامل؟ لا يمكن التراجع عن هذا الإجراء.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }
    try {
      const res = await outstockDeleteOrder(orderId, {});
      if (res?.success) {
        showToast?.(isPartial ? '✅ تم إلغاء الصنف غير المتوفر وإتمام إغلاق الطلب بنجاح' : '✅ تم إلغاء وحذف الطلب بنجاح');
        fetchOrders();
      } else {
        showToast?.(res?.error || 'تعذر معالجة الطلب');
      }
    } catch {
      showToast?.('تعذر حذف الطلب، تحقق من الاتصال');
    }
  };

  // تأكيد تسوية واسترداد العربون من نافذة OrderDepositRefundModal
  const handleConfirmOrderRefund = async (refundData) => {
    if (!refundModalOrder) return;
    try {
      const res = await outstockDeleteOrder(refundModalOrder.id, refundData);
      if (res?.success) {
        const destText = refundData.refundDestination === 'wallet' ? 'إيداع بمحفظة العميل' : 'استرداد نقدي فوري من درج الكاشير';
        showToast?.(`✅ تم إلغاء الطلب واسترداد العربون بنجاح (${refundData.paidAmount} ج.م - ${destText})`);
        setRefundModalOrder(null);
        fetchOrders();
      } else {
        alert(res?.error || 'تعذر تسوية واسترداد العربون');
      }
    } catch (err) {
      alert('خطأ أثناء تسوية العربون: ' + err.message);
    }
  };

  // حذف صنف واحد من الطلب قبل رد المشتريات
  const handleDeleteOrderItem = async (orderId, itemId, itemName) => {
    if (!window.confirm(`هل أنت متأكد من حذف الصنف "${itemName}" من هذا الطلب؟`)) {
      return;
    }
    try {
      const res = await outstockDeleteOrderItem(orderId, itemId);
      if (res?.success) {
        showToast?.('✅ تم حذف الصنف بنجاح');
        fetchOrders();
      } else {
        showToast?.(res?.error || 'تعذر حذف الصنف');
      }
    } catch {
      showToast?.('تعذر حذف الصنف');
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('ar-EG', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return isoString;
    }
  };

  // حساب زمن الاستجابة (SLA) الفعلي بين الإرسال والرد مستبعداً العطلات وساعات الإغلاق
  const calculateResponseTime = (sentIso, repliedIso) => {
    if (!sentIso || !repliedIso) return null;
    try {
      const netMinutes = calculateNetBusinessMinutes(sentIso, repliedIso, slaBusinessHoursConfig);
      return `خلال ${formatSlaDuration(netMinutes)}`;
    } catch {
      return null;
    }
  };

  // فحص دقيق وشامل هل تم الرد من إدارة المشتريات على الطلب (كلياً أو جزئياً)
  const isOrderReplied = useCallback((order) => {
    if (!order) return false;
    // 1. تسجيل تاريخ رد المشتريات على الطلب
    if (order.procurement_replied_at || order.procurementRepliedAt) return true;

    // 2. حالة الطلب تشير إلى الرد أو التجهيز
    const ordStatus = String(order.order_status || order.status || '').toLowerCase();
    if (['replied', 'partially_available', 'all_available', 'all_unavailable', 'ready_for_pickup', 'completed', 'delivered'].includes(ordStatus)) {
      return true;
    }

    // 3. فحص كافة بنود الطلب (بما فيها المشطوبة لعدم التوفر بالسوق)
    const items = order.items || [];
    return items.some((it) => {
      const hasItemReplyDate = Boolean(it.procurement_replied_at || it.procurementRepliedAt);
      const isPruned = Boolean(it.pruned_from_bill || it.prunedFromBill);
      const st = String(it.itemStatus || it.item_status || it.status || '').toLowerCase();
      return (
        hasItemReplyDate ||
        isPruned ||
        ['available', 'available_by_procurement', 'unavailable', 'unavailable_in_market', 'delivered'].includes(st)
      );
    });
  }, []);

  // فحص هل الطلب محول بين الفروع
  const isTransferredOrder = useCallback((o) => Boolean(
    o?.delivery_type === 'other_branch_pickup' ||
    o?.deliveryType === 'other_branch_pickup' ||
    o?.delivery_target_branch_id ||
    o?.deliveryTargetBranchId
  ), []);

  // فلترة الطلبات النشطة (استبعاد المحولة بين الفروع والطلبات المسلمة أو المرتجعة بالكامل)
  const filteredActiveOrders = useMemo(() => {
    const baseOrders = orders.filter((o) => {
      if (isTransferredOrder(o)) return false;
      const st = String(o.order_status || o.status || '').toLowerCase();
      if (st === 'delivered' || st === 'completed' || st === 'returned' || st === 'all_returned' || st === 'cancelled') return false;
      if (!o.items || o.items.length === 0) return false;
      return true;
    });

    // إذا وجد بحث نصي، نبحث في كافة الطلبات النشطة مباشرة لتسهيل العثور على أي طلب
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return baseOrders.filter((o) => {
        const num = String(o.order_number || o.orderNumber || '').toLowerCase();
        const barcode = String(o.barcode_data || o.barcodeData || '').toLowerCase();
        const name = String(o.customer_name || o.customerName || '').toLowerCase();
        const phone = String(o.customer_phone || o.customerPhone || '').toLowerCase();
        const matchItem = (o.items || []).some((it) =>
          String(it.medicationName || it.medication_name || '').toLowerCase().includes(q)
        );
        return num.includes(q) || barcode.includes(q) || name.includes(q) || phone.includes(q) || matchItem;
      }).sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
    }

    let result = baseOrders;

    // فلتر الحالة الفرعي
    if (activeSubFilter === 'waiting_procurement') {
      result = baseOrders.filter((o) => {
        const itemsList = o.items || [];
        const hasPendingItems = itemsList.some(
          (it) => !it.pruned_from_bill && !it.prunedFromBill && it.item_status !== 'returned' && it.itemStatus !== 'returned' && (it.item_status === 'pending' || !it.item_status || it.item_status === 'pending_procurement')
        );
        return !isOrderReplied(o) || hasPendingItems;
      });
    } else if (activeSubFilter === 'replied') {
      result = baseOrders.filter((o) => isOrderReplied(o));
    } else if (activeSubFilter === 'unavailable') {
      result = baseOrders.filter((o) => {
        const itemsList = o.items || [];
        const isAllUnavail = (itemsList.length > 0 && itemsList.every(i => i.prunedFromBill || i.pruned_from_bill || i.itemStatus === 'unavailable' || i.itemStatus === 'unavailable_in_market')) || String(o.order_status || o.status || '').toLowerCase() === 'all_unavailable';
        const hasUnavailItem = itemsList.some(i => i.prunedFromBill || i.pruned_from_bill || i.itemStatus === 'unavailable' || i.itemStatus === 'unavailable_in_market');
        return isAllUnavail || hasUnavailItem;
      });
    }

    return result.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
  }, [orders, activeSubFilter, searchQuery, isOrderReplied, isTransferredOrder]);

  // فلترة الطلبات المسلمة (استبعاد المحولة)
  const filteredDeliveredOrders = useMemo(() => {
    let result = deliveredOrders.filter((o) => !isTransferredOrder(o));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((o) => {
        const num = String(o.order_number || o.orderNumber || '').toLowerCase();
        const barcode = String(o.barcode_data || o.barcodeData || '').toLowerCase();
        const name = String(o.customer_name || o.customerName || '').toLowerCase();
        const phone = String(o.customer_phone || o.customerPhone || '').toLowerCase();
        const matchItem = (o.items || []).some((it) =>
          String(it.medicationName || it.medication_name || '').toLowerCase().includes(q)
        );
        return num.includes(q) || barcode.includes(q) || name.includes(q) || phone.includes(q) || matchItem;
      });
    }

    return result.sort((a, b) => new Date(b.delivered_at || b.deliveredAt || b.created_at || 0) - new Date(a.delivered_at || a.deliveredAt || a.created_at || 0));
  }, [deliveredOrders, searchQuery, isTransferredOrder]);

  // إحصائيات سريعة للطلبات النشطة (بدون المحولة والمرتجعة بالكامل)
  const activeStats = useMemo(() => {
    let waitingCount = 0;
    let repliedCount = 0;
    let readyCount = 0;
    let unavailableCount = 0;

    const nonTransferred = orders.filter((o) => {
      if (isTransferredOrder(o)) return false;
      const st = String(o.order_status || o.status || '').toLowerCase();
      if (st === 'delivered' || st === 'completed' || st === 'returned' || st === 'all_returned' || st === 'cancelled') return false;
      return Boolean(o.items && o.items.length > 0);
    });

    nonTransferred.forEach((o) => {
      const items = o.items || [];
      const hasReplied = isOrderReplied(o);
      const hasPendingItems = items.some(
        (it) => !it.pruned_from_bill && !it.prunedFromBill && it.item_status !== 'returned' && it.itemStatus !== 'returned' && (it.item_status === 'pending' || !it.item_status || it.item_status === 'pending_procurement')
      );
      const isAllUnavail = (items.length > 0 && items.every(i => i.prunedFromBill || i.pruned_from_bill || i.itemStatus === 'unavailable' || i.itemStatus === 'unavailable_in_market')) || String(o.order_status || o.status || '').toLowerCase() === 'all_unavailable';
      const hasUnavailItem = items.some(i => i.prunedFromBill || i.pruned_from_bill || i.itemStatus === 'unavailable' || i.itemStatus === 'unavailable_in_market');

      if (isAllUnavail || hasUnavailItem) {
        unavailableCount++;
      }

      const hasReady = items.some((it) =>
        (!it.pruned_from_bill && !it.prunedFromBill && it.item_status !== 'returned' && it.itemStatus !== 'returned') &&
        (it.status === 'available' || it.itemStatus === 'available_by_procurement' || it.status === 'delivered')
      );

      if (!hasReplied || hasPendingItems) waitingCount++;
      if (hasReplied) repliedCount++;
      if (hasReady) readyCount++;
    });

    return {
      total: nonTransferred.length,
      waiting: waitingCount,
      replied: repliedCount,
      ready: readyCount,
      unavailable: unavailableCount
    };
  }, [orders, isOrderReplied, isTransferredOrder]);

  // فلترة الطلبات المحولة (من وإلى الفرع)
  const filteredTransferredOrders = useMemo(() => {
    let result = transferredOrders;

    // فلتر الاتجاه
    if (transferredFilter === 'to') {
      result = result.filter((o) => {
        const isTarget = String(o.delivery_target_branch_id) === String(branchId) ||
          (o.delivery_target_branch && branch?.name && o.delivery_target_branch === branch.name);
        return isTarget && String(o.branch_id) !== String(branchId);
      });
    } else if (transferredFilter === 'from') {
      result = result.filter((o) => String(o.branch_id) === String(branchId));
    }

    // فلتر البحث النصي
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((o) => {
        const num = String(o.order_number || o.orderNumber || '').toLowerCase();
        const barcode = String(o.barcode_data || o.barcodeData || '').toLowerCase();
        const name = String(o.customer_name || o.customerName || '').toLowerCase();
        const phone = String(o.customer_phone || o.customerPhone || '').toLowerCase();
        const targetB = String(o.delivery_target_branch || o.target_branch_name || '').toLowerCase();
        const sourceB = String(o.branch_name || o.branchName || '').toLowerCase();
        const matchItem = (o.items || []).some((it) =>
          String(it.medicationName || it.medication_name || '').toLowerCase().includes(q)
        );
        return num.includes(q) || barcode.includes(q) || name.includes(q) || phone.includes(q) || targetB.includes(q) || sourceB.includes(q) || matchItem;
      });
    }

    return result;
  }, [transferredOrders, transferredFilter, searchQuery, branchId, branch]);

  // إحصائيات الطلبات المحولة
  const transferredStats = useMemo(() => {
    let incomingCount = 0;
    let outgoingCount = 0;

    transferredOrders.forEach((o) => {
      const isTarget = String(o.delivery_target_branch_id) === String(branchId) ||
        (o.delivery_target_branch && branch?.name && o.delivery_target_branch === branch.name);
      const isSource = String(o.branch_id) === String(branchId);

      if (isTarget && !isSource) {
        incomingCount++;
      } else if (isSource) {
        outgoingCount++;
      }
    });

    return {
      total: transferredOrders.length,
      incoming: incomingCount,
      outgoing: outgoingCount
    };
  }, [transferredOrders, branchId, branch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
      {/* ── شريط التبويبات الداخلية الرئيسية: الطلبات النشطة مقابل المحولة والمسلمة ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '12px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveInnerTab('active')}
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: '900',
              cursor: 'pointer',
              border: activeInnerTab === 'active' ? '2px solid #0d9488' : '1px solid #cbd5e1',
              background: activeInnerTab === 'active' ? '#f0fdfa' : '#ffffff',
              color: activeInnerTab === 'active' ? '#0f766e' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeInnerTab === 'active' ? '0 2px 6px rgba(13, 148, 136, 0.2)' : 'none'
            }}
          >
            <span>📋 الطلبات النشطة والمعلقة</span>
            <span style={{ background: '#0d9488', color: '#ffffff', fontSize: '11px', padding: '1px 7px', borderRadius: '10px' }}>
              {activeStats.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveInnerTab('delivered')}
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: '900',
              cursor: 'pointer',
              border: activeInnerTab === 'delivered' ? '2px solid #16a34a' : '1px solid #cbd5e1',
              background: activeInnerTab === 'delivered' ? '#f0fdf4' : '#ffffff',
              color: activeInnerTab === 'delivered' ? '#15803d' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeInnerTab === 'delivered' ? '0 2px 6px rgba(22, 163, 74, 0.2)' : 'none'
            }}
          >
            <CheckCircle2 size={16} color={activeInnerTab === 'delivered' ? '#16a34a' : '#64748b'} />
            <span>الطلبات المسلّمة (الأرشيف) ✅</span>
            <span style={{ background: '#16a34a', color: '#ffffff', fontSize: '11px', padding: '1px 7px', borderRadius: '10px' }}>
              {deliveredOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveInnerTab('returns')}
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: '900',
              cursor: 'pointer',
              border: activeInnerTab === 'returns' ? '2px solid #db2777' : '1px solid #cbd5e1',
              background: activeInnerTab === 'returns' ? '#fdf2f8' : '#ffffff',
              color: activeInnerTab === 'returns' ? '#be185d' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeInnerTab === 'returns' ? '0 2px 6px rgba(219, 39, 119, 0.2)' : 'none'
            }}
          >
            <RotateCcw size={16} color={activeInnerTab === 'returns' ? '#db2777' : '#64748b'} />
            <span>سجل المرتجعات ↩️</span>
            <span style={{ background: '#db2777', color: '#ffffff', fontSize: '11px', padding: '1px 7px', borderRadius: '10px' }}>
              {branchReturns.length}
            </span>
          </button>
        </div>

        {/* زر إنشاء طلب عميل جديد */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={
              activeInnerTab === 'active'
                ? fetchOrders
                : activeInnerTab === 'transferred'
                ? fetchTransferredOrders
                : fetchDeliveredOrders
            }
            title="تحديث البيانات"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={15} className={(isLoading || isDeliveredLoading || isTransferredLoading) ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            className="outstock-btn outstock-btn-primary"
            onClick={handleStartNewOrder}
            style={{ padding: '8px 18px', fontWeight: '800' }}
          >
            <Plus size={16} />
            <span>إنشاء طلب عميل جديد 💊</span>
          </button>
        </div>
      </div>

      {/* ── شريط الفلاتر والبحث وفلتر التاريخ ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '14px 18px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* فلاتر الحالات الفرعية (في تبويبة النشطة أو المحولة) */}
          {activeInnerTab === 'active' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '13px', fontWeight: '800' }}>
                <Filter size={15} />
                <span>فلتر الحالة:</span>
              </div>

              <button
                type="button"
                onClick={() => setActiveSubFilter('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: activeSubFilter === 'all' ? '2px solid #475569' : '1px solid #cbd5e1',
                  background: activeSubFilter === 'all' ? '#f1f5f9' : '#ffffff',
                  color: activeSubFilter === 'all' ? '#1e293b' : '#64748b'
                }}
              >
                كافة الطلبات النشطة ({activeStats.total})
              </button>

              <button
                type="button"
                onClick={() => setActiveSubFilter('waiting_procurement')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: activeSubFilter === 'waiting_procurement' ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                  background: activeSubFilter === 'waiting_procurement' ? '#fffbeb' : '#ffffff',
                  color: activeSubFilter === 'waiting_procurement' ? '#b45309' : '#64748b',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Clock size={13} color={activeSubFilter === 'waiting_procurement' ? '#f59e0b' : '#64748b'} />
                <span>قيد رد إدارة المشتريات ⏳</span>
                <span style={{ background: '#f59e0b', color: '#ffffff', fontSize: '10.5px', padding: '1px 6px', borderRadius: '8px' }}>
                  {activeStats.waiting}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubFilter('replied')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: activeSubFilter === 'replied' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                  background: activeSubFilter === 'replied' ? '#e0f2fe' : '#ffffff',
                  color: activeSubFilter === 'replied' ? '#0369a1' : '#64748b',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <MessageSquare size={13} color={activeSubFilter === 'replied' ? '#0284c7' : '#64748b'} />
                <span>تم الرد من قبل مدير المشتريات 💬</span>
                <span style={{ background: '#0284c7', color: '#ffffff', fontSize: '10.5px', padding: '1px 6px', borderRadius: '8px' }}>
                  {activeStats.replied}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubFilter('unavailable')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: activeSubFilter === 'unavailable' ? '2px solid #ef4444' : '1px solid #cbd5e1',
                  background: activeSubFilter === 'unavailable' ? '#fef2f2' : '#ffffff',
                  color: activeSubFilter === 'unavailable' ? '#dc2626' : '#64748b',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <AlertTriangle size={13} color={activeSubFilter === 'unavailable' ? '#ef4444' : '#64748b'} />
                <span>غير متوفر بالسوق ⚠️</span>
                <span style={{ background: '#dc2626', color: '#ffffff', fontSize: '10.5px', padding: '1px 6px', borderRadius: '8px' }}>
                  {activeStats.unavailable}
                </span>
              </button>
            </div>
          ) : activeInnerTab === 'transferred' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6d28d9', fontSize: '13px', fontWeight: '800' }}>
                <ArrowRightLeft size={15} />
                <span>فلتر التحويل:</span>
              </div>

              <button
                type="button"
                onClick={() => setTransferredFilter('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: transferredFilter === 'all' ? '2px solid #6d28d9' : '1px solid #cbd5e1',
                  background: transferredFilter === 'all' ? '#f5f3ff' : '#ffffff',
                  color: transferredFilter === 'all' ? '#6d28d9' : '#64748b'
                }}
              >
                كافة الطلبات المحولة ({transferredStats.total})
              </button>

              <button
                type="button"
                onClick={() => setTransferredFilter('to')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: transferredFilter === 'to' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: transferredFilter === 'to' ? '#f0fdf4' : '#ffffff',
                  color: transferredFilter === 'to' ? '#15803d' : '#64748b',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>📥 محولة إلى فرعنا ({transferredStats.incoming})</span>
              </button>

              <button
                type="button"
                onClick={() => setTransferredFilter('from')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: transferredFilter === 'from' ? '2px solid #d97706' : '1px solid #cbd5e1',
                  background: transferredFilter === 'from' ? '#fffbeb' : '#ffffff',
                  color: transferredFilter === 'from' ? '#b45309' : '#64748b',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>📤 محولة من فرعنا ({transferredStats.outgoing})</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: '800', fontSize: '13px' }}>
              <Archive size={16} />
              <span>أرشيف الطلبات المسلّمة للعملاء ومفردات السداد</span>
            </div>
          )}

          {/* مربع البحث */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search
              size={16}
              color="#94a3b8"
              style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="بحث بالعميل، الهاتف، الكود، أو الصنف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-form-input"
              style={{ paddingRight: '36px', height: '36px', fontSize: '12px' }}
            />
          </div>
        </div>

        {/* سطر فلتر التاريخ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0d9488', fontSize: '12.5px', fontWeight: '800' }}>
            <Calendar size={15} />
            <span>تصفية بالنطاق الزمني:</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>من:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="outstock-form-input"
              style={{ height: '32px', fontSize: '12px', padding: '2px 8px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>إلى:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="outstock-form-input"
              style={{ height: '32px', fontSize: '12px', padding: '2px 8px' }}
            />
          </div>

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444' }}
              title="مسح فلتر التاريخ"
            >
              <X size={12} />
              <span>مسح التاريخ</span>
            </button>
          )}
        </div>
      </div>

      {/* ── عرض القائمة (الطلبات النشطة أو المسلمة) ── */}
      {activeInnerTab === 'active' ? (
        /* قسم الطلبات النشطة والمعلقة */
        <div className="outstock-card">
          <div className="outstock-card-header">
            <h3 className="outstock-card-title">
              <span>📋 طلبات العملاء قيد المتابعة والتجهيز</span>
              <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
                ({filteredActiveOrders.length} طلب نشط)
              </span>
            </h3>
          </div>

          {/* تنبيه الصيدلي بوجود طلبات اعتذرت المشتريات عن توفير أصنافها */}
          {activeStats.unavailable > 0 && activeSubFilter !== 'unavailable' && (
            <div
              style={{
                background: '#fff1f2',
                border: '1.5px solid #fecdd3',
                borderRadius: '10px',
                padding: '10px 16px',
                margin: '12px 16px 0 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#e11d48" />
                <span style={{ color: '#9f1239', fontWeight: '800', fontSize: '13px' }}>
                  تنبيه: يوجد لديك ({activeStats.unavailable}) طلب أبلغت إدارة المشتريات بعدم توفر أصنافها بالسوق – تتطلب تواصلك مع العميل أو استعراض البدائل أو إلغاء الطلب واسترداد العربون.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubFilter('unavailable')}
                style={{
                  background: '#e11d48',
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: '800',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                عرض الطلبات غير المتوفرة ⬅️
              </button>
            </div>
          )}

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#0d9488' }} />
              <div>جاري تحميل طلبات العملاء...</div>
            </div>
          ) : filteredActiveOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🎉</div>
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
                لا توجد طلبات تطابق هذا الفلتر حالياً
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                {searchQuery ? 'لم يتم العثور على طلبات تطابق مدخلات البحث' : 'كافة الطلبات مكتملة أو تم تسليمها بنجاح'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredActiveOrders.map((order) => {
                const itemsList = order.items || [];
                const activeItems = itemsList.filter((i) => !i.prunedFromBill && !i.pruned_from_bill && i.itemStatus !== 'returned' && i.item_status !== 'returned');
                const prunedItems = itemsList.filter((i) => (i.prunedFromBill || i.pruned_from_bill) && i.itemStatus !== 'returned' && i.item_status !== 'returned');

                const hasReplied = isOrderReplied(order);
                const isAllUnavailable = (activeItems.length === 0 && prunedItems.length > 0) || String(order.order_status || order.status || '').toLowerCase() === 'all_unavailable';
                const allAvailable = !isAllUnavailable && activeItems.length > 0 && prunedItems.length === 0 && activeItems.every((i) => i.itemStatus === 'available_by_procurement' || i.status === 'available');
                const isPendingProcurement = !hasReplied && !isAllUnavailable;
                const hasUnavailableOrPending = itemsList.some((i) => {
                  const s = String(i.itemStatus || i.item_status || i.status || '').toLowerCase();
                  const isP = Boolean(i.prunedFromBill || i.pruned_from_bill);
                  return isP || s === 'unavailable' || s === 'unavailable_in_market' || s === 'pending';
                });
                const isPartiallyAvailable = !isAllUnavailable && (activeItems.some((i) => i.itemStatus === 'available_by_procurement' || i.status === 'available') && (prunedItems.length > 0 || activeItems.some((i) => i.status === 'pending' || i.itemStatus === 'pending')));
                const deliveredItemsList = activeItems.filter((i) => String(i.item_status || i.itemStatus || '').toLowerCase() === 'delivered' || i.is_delivered);
                const isPartiallyDelivered = String(order.order_status || order.status || '').toLowerCase() === 'partially_delivered' || (deliveredItemsList.length > 0 && activeItems.some((i) => !i.is_delivered && String(i.item_status || i.itemStatus || '').toLowerCase() !== 'delivered'));
                const hasUnavailableRemaining = (order.items || []).some(
                  (i) => (i.pruned_from_bill || i.prunedFromBill || i.item_status === 'unavailable_in_market' || i.itemStatus === 'unavailable_in_market' || i.itemStatus === 'unavailable') && String(i.item_status || i.itemStatus || '').toLowerCase() !== 'delivered'
                );
                const remainingDeposit = parseFloat(order.paid_amount || order.paidAmount || 0);
                const hasDeliverableItems = activeItems.some((i) => !i.is_delivered && String(i.item_status || i.itemStatus || '').toLowerCase() !== 'delivered' && (i.itemStatus === 'available_by_procurement' || i.status === 'available' || i.item_status === 'available'));
                const slaTime = calculateResponseTime(order.sent_to_procurement_at || order.created_at, order.procurement_replied_at);

                return (
                  <div
                    key={order.id}
                    className={`outstock-order-card ${allAvailable ? 'ready-state' : ''}`}
                    style={isAllUnavailable ? { border: '2px solid #ef4444', background: '#fffafa' } : (isPartiallyDelivered && hasUnavailableRemaining ? { border: '1.5px solid #f43f5e', background: '#fffcfc' } : {})}
                  >
                    {/* رأس بطاقة الطلب */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            background: '#f1f5f9',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontWeight: '900',
                            fontSize: '13px',
                            color: '#334155'
                          }}
                        >
                          {order.order_number || order.orderNumber}
                        </span>

                        <span style={{ fontWeight: '900', fontSize: '15.5px', color: '#0f172a' }}>
                          {order.customer_name || order.customerName}
                        </span>

                        <span style={{ fontSize: '13px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={13} />
                          <span>{order.customer_phone || order.customerPhone}</span>
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {order.has_complaint && (
                          <span
                            className="outstock-badge"
                            style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}
                            title={order.complaint_notes ? `تفاصيل الشكوى: ${order.complaint_notes}` : 'تم تصعيد شكوى للمالك'}
                          >
                            <AlertTriangle size={13} color="#b91c1c" />
                            <span>شكوى مرفوعة للمالك ⚠️</span>
                          </span>
                        )}

                        {isPartiallyDelivered ? (
                          hasUnavailableRemaining ? (
                            <span className="outstock-badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1.5px solid #f87171', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={13} color="#dc2626" />
                              <span>⚠️ تسليم جزئي (الصنف الآخر غير متوفر - معلق لتسوية العربون)</span>
                            </span>
                          ) : (
                            <span className="outstock-badge" style={{ background: '#ecfdf5', color: '#15803d', border: '1.5px solid #86efac', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={13} color="#16a34a" />
                              <span>🟢 تسليم جزئي (متبقي أصناف قيد المشتريات ⏳)</span>
                            </span>
                          )
                        ) : isAllUnavailable ? (
                          <span className="outstock-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1.5px solid #ef4444', fontWeight: '900' }}>
                            <XCircle size={13} color="#b91c1c" />
                            <span>🔴 اعتذار المشتريات: الصنف غير متوفر بالأسواق</span>
                          </span>
                        ) : allAvailable ? (
                          <span className="outstock-badge ready">
                            <CheckCircle size={13} />
                            <span>متوفر بالكامل - جاهز للتسليم 🟢</span>
                          </span>
                        ) : hasReplied ? (
                          <span className="outstock-badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                            <MessageSquare size={13} />
                            <span>تم رد مدير المشتريات {isPartiallyAvailable ? '(متوفر جزئياً 🔵)' : '💬'}</span>
                          </span>
                        ) : isPendingProcurement ? (
                          <span className="outstock-badge pending">
                            <Clock size={13} />
                            <span>قيد انتظار رد إدارة المشتريات 🟡</span>
                          </span>
                        ) : (
                          <span className="outstock-badge partial">
                            <span>متوفر جزئياً 🔵</span>
                          </span>
                        )}

                        {remainingDeposit > 0 && (
                          <span
                            className="outstock-badge"
                            style={{
                              background: '#fefce8',
                              color: '#854d0e',
                              border: '1.5px solid #facc15',
                              fontWeight: '900',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <DollarSign size={13} color="#ca8a04" />
                            <span>عربون معلق: {remainingDeposit.toFixed(2)} ج.م 💵</span>
                          </span>
                        )}

                        {order.delivery_type === 'home_delivery' || order.deliveryType === 'home_delivery' ? (
                          <span className="outstock-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '11.5px', padding: '3px 8px' }}>
                            🛵 توصيل منزلي
                          </span>
                        ) : (
                          <span className="outstock-badge" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', fontSize: '11.5px', padding: '3px 8px' }}>
                            🏪 بالفرع
                          </span>
                        )}

                        <span
                          style={{
                            background: '#f8fafc',
                            border: '1px dashed #cbd5e1',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: '#64748b'
                          }}
                        >
                          <Barcode size={12} style={{ display: 'inline' }} /> {order.barcode_data || order.barcodeData}
                        </span>
                      </div>
                    </div>

                    {/* تنبيه بارز في حالة تسليم جزئي ووجود صنف آخر غير متوفر بالأسواق */}
                    {isPartiallyDelivered && hasUnavailableRemaining && (
                      <div
                        style={{
                          background: '#fff1f2',
                          border: '1.5px solid #f43f5e',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '10px',
                          margin: '6px 0 8px 0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>⚠️</span>
                          <div>
                            <div style={{ color: '#9f1239', fontWeight: '900', fontSize: '13px' }}>
                              تسليم جزئي مكتمل، والصنف الآخر غير متوفر بالأسواق حالياً
                            </div>
                            <div style={{ color: '#881337', fontSize: '12px', marginTop: '2px' }}>
                              {remainingDeposit > 0
                                ? `يوجد عربون متبقي للعميل بقيمة (${remainingDeposit.toFixed(2)} ج.م) يجب استرداده نقداً أو بالمحفظة لإلغاء الصنف غير المتوفر وإتمام الطلب.`
                                : 'الصنف الآخر غير متوفر بالأسواق، يرجى التواصل مع العميل وإلغاء الصنف لإغلاق الطلب.'}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(order.id, order.order_number || order.orderNumber)}
                          className="outstock-btn"
                          style={{
                            padding: '7px 14px',
                            fontSize: '12.5px',
                            fontWeight: '900',
                            background: '#e11d48',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 4px rgba(225, 29, 72, 0.25)',
                            cursor: 'pointer'
                          }}
                          title="تسوية واسترداد العربون للعميل وإلغاء الصنف غير المتوفر رسمياً"
                        >
                          <DollarSign size={14} />
                          <span>{remainingDeposit > 0 ? 'تسوية العربون وإلغاء الصنف غير المتوفر 💵' : 'إلغاء الصنف غير المتوفر وإتمام الطلب ✕'}</span>
                        </button>
                      </div>
                    )}

                    {/* تنبيه بارز في حالة تعذر توفير الصنف من المشتريات */}
                    {isAllUnavailable && (
                      <div
                        style={{
                          background: '#fef2f2',
                          border: '1.5px solid #f87171',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '10px',
                          margin: '6px 0 8px 0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>🔴</span>
                          <div>
                            <div style={{ color: '#991b1b', fontWeight: '900', fontSize: '13px' }}>
                              اعتذار إدارة المشتريات: الصنف غير متوفر بالأسواق والمستودعات حالياً
                            </div>
                            {order.procurement_notes && (
                              <div style={{ color: '#7f1d1d', fontSize: '12px', marginTop: '2px' }}>
                                💬 ملاحظات المشتريات: <strong>{order.procurement_notes}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {order.items?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const targetItem = order.items.find(it => (it.suggested_substitutes?.length > 0) || (it.suggestedSubstitutes?.length > 0)) || order.items[0];
                                setSubstitutesModalData({
                                  medicationName: targetItem.medicationName || targetItem.medication_name || '',
                                  medicationId: targetItem.medication_id || targetItem.medicationId,
                                  customerPhone: order.customer_phone || order.customerPhone,
                                  customerName: order.customer_name || order.customerName,
                                  branchName: branch?.name,
                                  procurementSubstitutes: targetItem.suggested_substitutes || targetItem.suggestedSubstitutes || [],
                                  procurementNotes: targetItem.procurement_notes || targetItem.procurementNotes || order.procurement_notes || ''
                                });
                              }}
                              className="outstock-btn"
                              style={{
                                background: '#047857',
                                color: '#ffffff',
                                fontWeight: '900',
                                fontSize: '12px',
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="استعراض البدائل والمثائل المقترحة من إدارة المشتريات (AI Drug Eye)"
                            >
                              <span>استعراض البدائل المقترحة 🔄</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order.id, order.order_number || order.orderNumber)}
                            className="outstock-btn"
                            style={{
                              background: '#dc2626',
                              color: '#ffffff',
                              fontWeight: '900',
                              fontSize: '12px',
                              padding: '6px 12px',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <span>إلغاء الطلب وتسوية واسترداد العربون 💵</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* سطر تواريخ الإرسال والرد وتتبع SLA */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '11.5px',
                        color: '#64748b'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <span title="تاريخ ووقت إرسال الطلب للمشتريات">
                          <Send size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                          أُرسل للمشتريات: <strong style={{ color: '#334155' }}>{formatDateTime(order.sent_to_procurement_at || order.created_at)}</strong>
                        </span>

                        {order.procurement_replied_at && (
                          <span style={{ color: '#0369a1' }} title="تاريخ ووقت رد المشتريات">
                            <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                            رد المشتريات: <strong style={{ color: '#0284c7' }}>{formatDateTime(order.procurement_replied_at)}</strong>
                            {order.procurement_replied_by && ` (${order.procurement_replied_by})`}
                          </span>
                        )}

                        {order.procurement_replied_at ? (
                          slaTime && (
                            <span style={{ color: '#059669', background: '#dcfce7', border: '1px solid #86efac', padding: '1px 8px', borderRadius: '6px', fontWeight: '800' }}>
                              ⚡ استجابة: {slaTime}
                            </span>
                          )
                        ) : (() => {
                          const wHours = (Date.now() - new Date(order.sent_to_procurement_at || order.created_at).getTime()) / (1000 * 60 * 60);
                          if (wHours >= 4) {
                            return (
                              <span style={{ color: '#b91c1c', background: '#fee2e2', border: '1px solid #f87171', padding: '1px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                🔴 متأخر عن المهلة (+{Math.floor(wHours)} ساعة)
                              </span>
                            );
                          }
                          if (wHours >= 2) {
                            return (
                              <span style={{ color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', padding: '1px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                🟡 اقتراب المهلة ({Math.floor(wHours)} ساعة)
                              </span>
                            );
                          }
                          return (
                            <span style={{ color: '#047857', background: '#d1fae5', border: '1px solid #a7f3d0', padding: '1px 8px', borderRadius: '6px', fontWeight: '800' }}>
                              🟢 انتظار قياسي ({Math.max(1, Math.floor(wHours * 60))} دقيقة)
                            </span>
                          );
                        })()}

                        {order.items?.some(it => it.procurement_modified_qty || it.procurementModifiedQty) && (
                          <span style={{ color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', padding: '1px 8px', borderRadius: '6px', fontWeight: '800' }}>
                            ⚠️ يحتوي على أصناف تم تعديل كميتها من المشتريات
                          </span>
                        )}
                      </div>

                      {order.order_receiver_name && (
                        <div style={{ color: '#475569' }}>
                          الصيدلي المحرر: <strong>{order.order_receiver_name}</strong>
                        </div>
                      )}
                    </div>

                    {/* 📋 جدول الأصناف المطلوبة وتصنيفها المنظم والاحترافي */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: '800', color: '#475569' }}>
                        <span>📋 الأصناف المطلوبة وتصنيفها بالطلب:</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                          إجمالي البنود: {activeItems.length + prunedItems.length} صنف
                        </span>
                      </div>

                      <div className="outstock-items-table-container">
                        <table className="outstock-items-table">
                          <thead>
                            <tr>
                              <th style={{ width: '38px', textAlign: 'center' }}>#</th>
                              <th style={{ width: '85px', textAlign: 'center' }}>النوع</th>
                              <th>اسم الصنف والمواصفات</th>
                              <th style={{ width: '130px' }}>الكمية والوحدة</th>
                              <th style={{ width: '110px' }}>السعر التقديري</th>
                              <th style={{ width: '135px', textAlign: 'center' }}>حالة التوفر والرد</th>
                              <th style={{ minWidth: '150px' }}>ملاحظات المشتريات</th>
                              <th style={{ width: '140px', textAlign: 'center' }}>الإجراءات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeItems.map((item, idx) => {
                              const isEst = item.is_price_estimated || item.isPriceEstimated;
                              const pMin = parseFloat(item.price_min || item.priceMin || 0);
                              const pMax = parseFloat(item.price_max || item.priceMax || pMin || 0);
                              const isCosmetics = item.item_type === 'cosmetics';
                              const itmStatus = String(item.item_status || item.itemStatus || item.status || '').toLowerCase();
                              const isItemDelivered = itmStatus === 'delivered' || Boolean(item.is_delivered);
                              const isAvail = !isItemDelivered && (item.status === 'available' || itmStatus === 'available_by_procurement');
                              const isModified = Boolean(item.procurement_modified_qty || item.procurementModifiedQty);
                              const unitLabel = item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة';

                              return (
                                <tr key={`active_${idx}`} className={isItemDelivered ? 'is-delivered' : ''}>
                                  {/* # */}
                                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#64748b' }}>
                                    {idx + 1}
                                  </td>

                                  {/* النوع */}
                                  <td style={{ textAlign: 'center' }}>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: '800',
                                        padding: '2px 7px',
                                        borderRadius: '6px',
                                        background: isItemDelivered ? '#dcfce7' : (isCosmetics ? '#fce7f3' : '#e0f2fe'),
                                        color: isItemDelivered ? '#15803d' : (isCosmetics ? '#be185d' : '#0369a1'),
                                        display: 'inline-block',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {isItemDelivered ? '✓ مُسلَّم' : (isCosmetics ? '💄 مستحضر' : '💊 دوائي')}
                                    </span>
                                  </td>

                                  {/* اسم الصنف والمواصفات */}
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <strong
                                        style={{
                                          fontSize: '13px',
                                          color: isItemDelivered ? '#15803d' : '#0f172a',
                                          textDecoration: isItemDelivered ? 'line-through' : 'none'
                                        }}
                                      >
                                        {item.medicationName || item.medication_name}
                                      </strong>
                                      {item.medication_name_en && item.medication_name_en !== item.medicationName && (
                                        <span style={{ fontSize: '11px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                                          {item.medication_name_en}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* الكمية والوحدة */}
                                  <td>
                                    {isItemDelivered ? (
                                      <span style={{ fontWeight: '800', color: '#166534' }}>
                                        {item.quantity} {unitLabel} (تم التسليم)
                                      </span>
                                    ) : isModified ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b' }}>
                                          <s style={{ color: '#dc2626' }}>{item.original_quantity || item.originalQuantity}</s> ⬅️ <strong style={{ color: '#0d9488' }}>{item.quantity}</strong> {unitLabel}
                                        </span>
                                        <span style={{ fontSize: '10px', color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', width: 'fit-content', fontWeight: 'bold' }}>
                                          ⚠️ عُدلت الكمية
                                        </span>
                                      </div>
                                    ) : (
                                      <span style={{ fontWeight: '700', color: '#334155' }}>
                                        {item.quantity} {unitLabel}
                                      </span>
                                    )}
                                  </td>

                                  {/* السعر / التقدير */}
                                  <td>
                                    {isEst ? (
                                      <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '5px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold' }}>
                                        {pMin.toFixed(0)} - {pMax.toFixed(0)} ج.م
                                      </span>
                                    ) : (
                                      <span style={{ fontWeight: '700', color: '#0f172a' }}>
                                        {parseFloat(item.unit_price || item.unitPrice || item.price || 0) > 0
                                          ? `${parseFloat(item.unit_price || item.unitPrice || item.price || 0).toFixed(2)} ج.م`
                                          : 'سعر الكتالوج'}
                                      </span>
                                    )}
                                  </td>

                                  {/* حالة التوفر والرد */}
                                  <td style={{ textAlign: 'center' }}>
                                    {isItemDelivered ? (
                                      <span className="outstock-badge ready" style={{ fontSize: '11px' }}>✓ تم التسليم للعميل</span>
                                    ) : isAvail ? (
                                      <span className="outstock-badge available" style={{ fontSize: '11px' }}>✓ متوفر بالفرع</span>
                                    ) : item.status === 'unavailable' ? (
                                      <span className="outstock-badge unavailable" style={{ fontSize: '11px' }}>✕ غير متوفر بالسوق</span>
                                    ) : (
                                      <span className="outstock-badge pending" style={{ fontSize: '11px' }}>⏳ قيد الشراء</span>
                                    )}
                                  </td>

                                  {/* ملاحظات المشتريات */}
                                  <td>
                                    {Boolean(item.procurement_notes || item.procurementNotes) ? (
                                      <div style={{
                                        fontSize: '11.5px',
                                        color: '#78350f',
                                        background: 'rgba(254, 243, 199, 0.45)',
                                        borderRight: '3px solid #f59e0b',
                                        padding: '3px 8px',
                                        borderRadius: '4px'
                                      }}>
                                        {item.procurement_notes || item.procurementNotes}
                                      </div>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontSize: '11px' }}>-</span>
                                    )}
                                  </td>

                                  {/* الإجراءات */}
                                  <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                      <button
                                        type="button"
                                        onClick={() => setSubstitutesModalData({
                                          medicationName: item.medicationName || item.medication_name,
                                          medicationId: item.medication_id || item.medicationId,
                                          customerPhone: order.customer_phone || order.customerPhone,
                                          customerName: order.customer_name || order.customerName,
                                          branchName: branch?.name,
                                          procurementSubstitutes: item.suggested_substitutes || item.suggestedSubstitutes || [],
                                          procurementNotes: item.procurement_notes || item.procurementNotes || order.procurement_notes || ''
                                        })}
                                        style={{
                                          background: '#f0fdfa',
                                          border: '1px solid #99f6e4',
                                          borderRadius: '6px',
                                          color: '#0f766e',
                                          cursor: 'pointer',
                                          padding: '3px 8px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          fontSize: '11px',
                                          fontWeight: '700'
                                        }}
                                        title="فحص البدائل والمثائل المعتمدة بنفس المادة الفعالة"
                                      >
                                        <span>بدائل 🔄</span>
                                      </button>

                                      {!hasReplied && activeItems.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteOrderItem(order.id, item.id || idx, item.medicationName || item.medication_name)}
                                          style={{
                                            background: '#fee2e2',
                                            border: '1px solid #fecaca',
                                            borderRadius: '6px',
                                            color: '#dc2626',
                                            cursor: 'pointer',
                                            padding: '3px 6px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            fontSize: '11px'
                                          }}
                                          title="حذف هذا الصنف من الطلب قبل رد المشتريات"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* الأصناف المشطوبة لعدم التوفر */}
                            {prunedItems.map((item, idx) => (
                              <tr key={`pruned_${idx}`} className="is-unavailable">
                                <td style={{ textAlign: 'center', fontWeight: '700', color: '#dc2626' }}>
                                  {activeItems.length + idx + 1}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ fontSize: '10.5px', background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '5px', fontWeight: '800' }}>
                                    مشطوب
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ textDecoration: 'line-through', color: '#b91c1c', fontWeight: '700', fontSize: '12.5px' }}>
                                      {item.medicationName || item.medication_name}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#dc2626' }}>
                                      (غير متوفر بالسوق والمستودعات حالياً)
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ color: '#64748b', fontSize: '12px' }}>
                                    {item.quantity} {item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ color: '#94a3b8' }}>-</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="outstock-badge unavailable" style={{ fontSize: '11px' }}>✕ غير متوفر بالسوق</span>
                                </td>
                                <td>
                                  <span style={{ fontSize: '11.5px', color: '#b91c1c' }}>
                                    {item.procurement_notes || item.procurementNotes || 'تم الاعتذار لعدم توفره لدى الموردين'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    <button
                                      type="button"
                                      onClick={() => setSubstitutesModalData({
                                        medicationName: item.medicationName || item.medication_name,
                                        medicationId: item.medication_id || item.medicationId,
                                        customerPhone: order.customer_phone || order.customerPhone,
                                        customerName: order.customer_name || order.customerName,
                                        branchName: branch?.name,
                                        procurementSubstitutes: item.suggested_substitutes || item.suggestedSubstitutes || [],
                                        procurementNotes: item.procurement_notes || item.procurementNotes || order.procurement_notes || ''
                                      })}
                                      style={{
                                        background: '#ecfdf5',
                                        border: '1px solid #10b981',
                                        borderRadius: '6px',
                                        color: '#047857',
                                        cursor: 'pointer',
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title="إرسال البدائل والمثائل المعتمدة للعميل عبر الواتساب"
                                    >
                                      <span>📱 واتساب البدائل</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* تفاصيل المبالغ وموعد الاستلام وأزرار الإجراءات */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        borderTop: '1px solid var(--border-subtle, #f1f5f9)',
                        paddingTop: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '13px' }}>
                        {(() => {
                          let tMin = 0, tMax = 0, tAvg = 0, hasEst = false;
                          activeItems.forEach((it) => {
                            const qty = parseInt(it.quantity || 1, 10);
                            const isE = it.is_price_estimated || it.isPriceEstimated;
                            const pMin = parseFloat(it.price_min || it.priceMin || 0);
                            const pMax = parseFloat(it.price_max || it.priceMax || pMin || 0);
                            const p = parseFloat(it.unitPrice || it.unit_price || 0);
                            if (isE && (pMin > 0 || pMax > 0)) {
                              hasEst = true;
                              tMin += qty * pMin;
                              tMax += qty * pMax;
                              tAvg += qty * ((pMin + pMax) / 2);
                            } else {
                              tMin += qty * p;
                              tMax += qty * p;
                              tAvg += qty * p;
                            }
                          });

                          const dVal = parseFloat(order.discount_value || order.discountValue || 0);
                          const isPct = (order.discount_type || order.discountType) === 'percentage';
                          const paid = parseFloat(order.paid_amount || order.paidAmount || 0);
                          const discMin = isPct ? (tMin * dVal) / 100 : dVal;
                          const discMax = isPct ? (tMax * dVal) / 100 : dVal;
                          const discAvg = isPct ? (tAvg * dVal) / 100 : dVal;
                          const netMin = Math.max(0, tMin - discMin);
                          const netMax = Math.max(0, tMax - discMax);
                          const netAmount = parseFloat(order.net_amount ?? order.netAmount ?? (tAvg - discAvg) ?? 0);

                          const rMin = Math.max(0, netMin - paid);
                          const rMax = Math.max(0, netMax - paid);
                          const remAmount = Math.max(0, netAmount - paid);

                          const refundDue = Math.max(0, paid - netAmount);
                          const refundMin = Math.max(0, paid - netMax);
                          const refundMax = Math.max(0, paid - netMin);

                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <div>
                                الإجمالي: <strong>
                                  {hasEst ? `من ${tMin.toFixed(2)} إلى ${tMax.toFixed(2)} ج.م` : `${parseFloat(order.total_amount || order.totalAmount || tAvg || 0).toFixed(2)} ج.م`}
                                </strong>
                              </div>
                              <div>
                                المدفوع: <strong style={{ color: '#059669' }}>{paid.toFixed(2)} ج.م</strong>
                              </div>
                              <div style={{ fontSize: '14px' }}>
                                المتبقي: <strong style={{ color: '#dc2626' }}>
                                  {hasEst ? `من ${rMin.toFixed(2)} إلى ${rMax.toFixed(2)} ج.م` : `${parseFloat(order.remaining_amount || order.remainingAmount || remAmount || 0).toFixed(2)} ج.م`}
                                </strong>
                              </div>
                              {((!hasEst && refundDue > 0) || (hasEst && refundMax > 0)) && (
                                <div style={{ fontSize: '13.5px', background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                  المتبقي للعميل (مستحق رده): <strong style={{ color: '#059669' }}>
                                    {hasEst ? `من ${refundMin.toFixed(2)} إلى ${refundMax.toFixed(2)} ج.م` : `${refundDue.toFixed(2)} ج.م`}
                                  </strong>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {order.expected_pickup_date && (
                          <div style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <Calendar size={13} />
                            <span>الاستلام: {String(order.expected_pickup_date || order.expectedPickupDate).split('T')[0]}</span>
                          </div>
                        )}
                      </div>

                      {/* أزرار الإجراءات المنظمة هندسياً */}
                      <div className="outstock-order-actions-bar">
                        {/* الإجراءات الأساسية السريعة */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {!isAllUnavailable && hasDeliverableItems && (
                            <button
                              type="button"
                              onClick={() => handleDeliver(order.id)}
                              className="outstock-btn outstock-btn-success"
                              style={{ padding: '8px 18px', fontSize: '13px', fontWeight: '800' }}
                            >
                              <Check size={16} />
                              <span>تسليم للعميل</span>
                            </button>
                          )}

                          {isPartiallyDelivered && (
                            <button
                              type="button"
                              onClick={() => {
                                const delivered = activeItems.filter((it) => String(it.item_status || it.itemStatus || '').toLowerCase() === 'delivered' || it.is_delivered);
                                const remaining = activeItems.filter((it) => {
                                  const isDel = String(it.item_status || it.itemStatus || '').toLowerCase() === 'delivered' || it.is_delivered;
                                  return !isDel;
                                });
                                setCompletionModalData({
                                  order,
                                  deliveredItems: delivered,
                                  remainingItems: remaining,
                                  initialReservedDeposit: parseFloat(order.paid_amount || 0)
                                });
                              }}
                              className="outstock-btn"
                              style={{
                                padding: '7px 14px',
                                fontSize: '12px',
                                fontWeight: '800',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1.5px solid #93c5fd',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                              }}
                              title="إدارة عربون الأصناف المتبقية أو إلغاء الصنف فورياً من المشتريات أو مراسلة العميل"
                            >
                              <FileText size={14} />
                              <span>استكمال ومتابعة المتبقي 📋</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSendWhatsapp(order)}
                            className="outstock-btn"
                            style={{
                              padding: '7px 12px',
                              fontSize: '12px',
                              fontWeight: '700',
                              background: '#f0fdf4',
                              color: '#15803d',
                              border: '1px solid #bbf7d0',
                              borderRadius: '8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              cursor: 'pointer'
                            }}
                            title="إرسال رسالة واتساب للعميل بإشعار التوفر والموقف الدوائي"
                          >
                            <MessageSquare size={13} color="#15803d" />
                            <span>
                              {order.whatsapp_notified_at || order.whatsappNotifiedAt ? 'واتساب العميل (أُرسل ✅)' : 'واتساب العميل'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrintingOrder(order)}
                            className="outstock-btn outstock-btn-secondary"
                            style={{ padding: '7px 11px', fontSize: '12px' }}
                            title="إرسال أو عرض الفاتورة الرسمية PDF"
                          >
                            <FileText size={14} />
                            <span>فاتورة PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrintingOrder(order)}
                            className="outstock-btn outstock-btn-secondary"
                            style={{ padding: '7px 11px', fontSize: '12px' }}
                            title="طباعة إيصال الكاشير نسختين مع قص كل نسخة تلقائياً"
                          >
                            <Printer size={14} />
                            <span>طباعة وقص</span>
                          </button>
                        </div>

                        {/* قائمة الإجراءات الإضافية الذكية لمنع الازدحام */}
                        <div className="outstock-dropdown-container">
                          <button
                            type="button"
                            onClick={() => setOpenMoreMenuOrderId(openMoreMenuOrderId === order.id ? null : order.id)}
                            className="outstock-btn outstock-btn-secondary"
                            style={{
                              padding: '7px 12px',
                              fontSize: '12px',
                              fontWeight: '800',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <MoreHorizontal size={15} />
                            <span>المزيد من الإجراءات</span>
                            <ChevronDown size={13} />
                          </button>

                          {openMoreMenuOrderId === order.id && (
                            <div className="outstock-dropdown-menu">
                              {/* تعديل الطلب أو الصنف */}
                              {hasReplied ? (
                                hasUnavailableOrPending && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMoreMenuOrderId(null);
                                      setEditingOrder(order);
                                    }}
                                    className="outstock-dropdown-item"
                                  >
                                    <Edit size={14} />
                                    <span>تعديل الصنف غير المتوفر ✏️</span>
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMoreMenuOrderId(null);
                                    setEditingOrder(order);
                                  }}
                                  className="outstock-dropdown-item"
                                >
                                  <Edit size={14} />
                                  <span>تعديل الطلب كاملاً ✏️</span>
                                </button>
                              )}

                              {/* تعديل العربون */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMoreMenuOrderId(null);
                                  handleOpenDepositModal(order);
                                }}
                                className="outstock-dropdown-item"
                              >
                                <DollarSign size={14} />
                                <span>تعديل العربون 💵</span>
                              </button>

                              {/* شكوى للمالك */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMoreMenuOrderId(null);
                                  setComplaintOrder(order);
                                }}
                                className="outstock-dropdown-item"
                              >
                                <AlertTriangle size={14} color="#ea580c" />
                                <span>{order.has_complaint ? 'متابعة الشكوى المرفوعة ⚠️' : 'تصعيد شكوى للمالك ⚠️'}</span>
                              </button>

                              {/* المرتجع */}
                              {(() => {
                                const hasRepliedOrDeliveredItems = itemsList.some(it =>
                                  Boolean(
                                    it.procurement_replied_at ||
                                    it.procurementRepliedAt ||
                                    it.is_delivered ||
                                    ['available_by_procurement', 'available', 'delivered', 'unavailable', 'unavailable_in_market'].includes(String(it.item_status || it.itemStatus || '').toLowerCase())
                                  )
                                );

                                if (hasRepliedOrDeliveredItems) {
                                  const replyTime = order.procurement_replied_at || order.created_at;
                                  const replyDate = replyTime ? new Date(replyTime).getTime() : Date.now();
                                  const daysSinceReply = (Date.now() - replyDate) / (1000 * 60 * 60 * 24);
                                  const isReturnExpired = daysSinceReply > allowedReturnDays;

                                  if (!isReturnExpired) {
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMoreMenuOrderId(null);
                                          setReturnAuthOrder(order);
                                        }}
                                        className="outstock-dropdown-item"
                                      >
                                        <RotateCcw size={14} />
                                        <span>تسجيل مرتجع ↩️</span>
                                      </button>
                                    );
                                  }
                                }
                                return null;
                              })()}

                              {/* حذف الطلب / تسوية العربون */}
                              {(isAllUnavailable || !hasDeliverableItems || (isPartiallyDelivered && hasUnavailableRemaining) || !hasReplied) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMoreMenuOrderId(null);
                                    handleDeleteOrder(order.id, order.order_number || order.orderNumber);
                                  }}
                                  className="outstock-dropdown-item danger"
                                >
                                  <Trash2 size={14} />
                                  <span>
                                    {isPartiallyDelivered
                                      ? (remainingDeposit > 0 ? 'تسوية العربون وإلغاء الصنف 💵' : 'إلغاء الصنف غير المتوفر ✕')
                                      : 'إلغاء وحذف الطلب 🗑️'}
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeInnerTab === 'transferred' ? (
        /* قسم الطلبات المحولة بين الفروع (من وإلى) */
        <div className="outstock-card">
          <div className="outstock-card-header">
            <h3 className="outstock-card-title">
              <span>🔄 طلبات محولة من وإلى هذا الفرع</span>
              <span style={{ fontSize: '13px', color: '#7c3aed', fontWeight: '800' }}>
                ({filteredTransferredOrders.length} طلب محول)
              </span>
            </h3>
          </div>

          {isTransferredLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#7c3aed' }} />
              <div>جاري تحميل الطلبات المحولة...</div>
            </div>
          ) : filteredTransferredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
              <ArrowRightLeft size={42} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
                لا توجد طلبات محولة تطابق هذا الفلتر حالياً
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                {searchQuery ? 'لم يتم العثور على طلبات تطابق مدخلات البحث' : 'تظهر هنا الطلبات المحولة بين الفروع للاستلام والتجهيز والتسليم.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredTransferredOrders.map((order) => {
                const itemsList = order.items || [];
                const activeItems = itemsList.filter((i) => !i.prunedFromBill && !i.pruned_from_bill && i.itemStatus !== 'returned' && i.item_status !== 'returned');
                const prunedItems = itemsList.filter((i) => (i.prunedFromBill || i.pruned_from_bill) && i.itemStatus !== 'returned' && i.item_status !== 'returned');

                const isTargetBranch = String(order.delivery_target_branch_id) === String(branchId) ||
                  (order.delivery_target_branch && branch?.name && order.delivery_target_branch === branch.name);
                const isSourceBranch = String(order.branch_id) === String(branchId);
                const isDelivered = order.order_status === 'delivered';

                const hasReplied = isOrderReplied(order);
                const allAvailable = activeItems.length > 0 && prunedItems.length === 0 && activeItems.every((i) => i.itemStatus === 'available_by_procurement' || i.status === 'available');

                return (
                  <div
                    key={order.id}
                    className="outstock-order-card"
                    style={{
                      borderRight: isTargetBranch ? '4px solid #16a34a' : '4px solid #d97706',
                      background: '#ffffff'
                    }}
                  >
                    {/* رأس بطاقة الطلب المحول */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            background: '#f1f5f9',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontWeight: '900',
                            fontSize: '13px',
                            color: '#334155'
                          }}
                        >
                          {order.order_number || order.orderNumber}
                        </span>

                        {/* شارة اتجاه التحويل */}
                        {isTargetBranch ? (
                          <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span>📥 وارد للاستلام لدينا</span>
                            <span style={{ fontSize: '11px', color: '#166534' }}>(من فرع: {order.branch_name || 'الفرع المصدر'})</span>
                          </span>
                        ) : (
                          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span>📤 صادر لفرع آخر</span>
                            <span style={{ fontSize: '11px', color: '#78350f' }}>(إلى فرع: {order.delivery_target_branch || order.target_branch_name || 'فرع الاستلام'})</span>
                          </span>
                        )}

                        <span style={{ fontWeight: '900', fontSize: '15.5px', color: '#0f172a' }}>
                          {order.customer_name || order.customerName}
                        </span>

                        <span style={{ fontSize: '13px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={13} />
                          <span>{order.customer_phone || order.customerPhone}</span>
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {isDelivered ? (
                          <span className="outstock-badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                            تم التسليم بنجاح ✅
                          </span>
                        ) : allAvailable ? (
                          <span className="outstock-badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                            جاهز للتسليم 📦
                          </span>
                        ) : hasReplied ? (
                          <span className="outstock-badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                            تم رد المشتريات 💬
                          </span>
                        ) : (
                          <span className="outstock-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                            بانتظار المشتريات ⏳
                          </span>
                        )}
                      </div>
                    </div>

                    {/* الأصناف المطلوبة في الطلب المحول */}
                    <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {itemsList.map((item, idx) => {
                        const isPruned = Boolean(item.prunedFromBill || item.pruned_from_bill);
                        const itmStatus = String(item.itemStatus || item.item_status || item.status || '').toLowerCase();
                        const isAvail = itmStatus === 'available_by_procurement' || itmStatus === 'available';

                        return (
                          <div
                            key={item.id || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              background: isPruned ? '#f8fafc' : isAvail ? '#f0fdf4' : '#fffbeb',
                              border: `1px solid ${isPruned ? '#e2e8f0' : isAvail ? '#bbf7d0' : '#fef3c7'}`,
                              opacity: isPruned ? 0.6 : 1
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: '800', color: isPruned ? '#94a3b8' : '#1e293b', textDecoration: isPruned ? 'line-through' : 'none' }}>
                                {item.medicationName || item.medication_name}
                              </span>
                              {Boolean(item.procurement_modified_qty || item.procurementModifiedQty) ? (
                                <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: '800' }}>
                                  (<s style={{ color: '#dc2626' }}>{item.original_quantity || item.originalQuantity}</s> ⬅️ <strong style={{ color: '#0d9488' }}>{item.quantity}</strong> {item.unitType === 'pack' ? 'علبة' : 'شريط'})
                                </span>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                  × {item.quantity} {item.unitType === 'pack' ? 'علبة' : 'شريط'}
                                </span>
                              )}
                              {Boolean(item.procurement_modified_qty || item.procurementModifiedQty) && (
                                <span style={{ fontSize: '10.5px', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                  ⚠️ تم تعديل الكمية
                                </span>
                              )}
                              {(item.procurementNotes || item.procurement_notes) && (
                                <span style={{ fontSize: '11px', color: '#0284c7', background: '#f0f9ff', padding: '1px 6px', borderRadius: '4px' }}>
                                  ملاحظة المشتريات: {item.procurementNotes || item.procurement_notes}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '13px' }}>
                                {parseFloat(item.totalPrice || item.total_price || 0).toFixed(2)} ج.م
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* المبالغ والتفاصيل المالية */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '13px' }}>
                        <div>
                          الإجمالي: <strong>{parseFloat(order.total_amount || order.totalAmount || 0).toFixed(2)} ج.م</strong>
                        </div>
                        <div>
                          المدفوع (العربون): <strong style={{ color: '#059669' }}>{parseFloat(order.paid_amount || order.paidAmount || 0).toFixed(2)} ج.م</strong>
                        </div>
                        <div>
                          المتبقي: <strong style={{ color: '#dc2626' }}>{parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2)} ج.م</strong>
                        </div>
                      </div>

                      {/* أزرار الإجراءات للطلب المحول */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {!isDelivered && (
                          <button
                            type="button"
                            onClick={() => handleDeliver(order.id)}
                            className="outstock-btn outstock-btn-success"
                            style={{ padding: '6px 14px', fontSize: '12.5px' }}
                            title="تسليم الطلب للعميل وتصفية الحساب"
                          >
                            <Check size={14} />
                            <span>تسليم للعميل 📦</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenDepositModal(order)}
                          className="outstock-btn"
                          style={{
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: '800',
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="تعديل مبلغ العربون / المدفوع"
                        >
                          <DollarSign size={13} />
                          <span>تعديل العربون</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPrintingOrder(order)}
                          className="outstock-btn outstock-btn-whatsapp"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          title="إرسال الفاتورة الرسمية PDF للعميل عبر الواتساب"
                        >
                          <FileText size={13} />
                          <span>فاتورة PDF</span>
                        </button>

                        {/* زر يدوي يضغط عليه الصيدلي لإرسال رسالة واتساب للعميل */}
                        <button
                          type="button"
                          onClick={() => handleSendWhatsapp(order)}
                          className="outstock-btn"
                          style={{
                            padding: '6px 11px',
                            fontSize: '12px',
                            fontWeight: '800',
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                          }}
                          title="إرسال رسالة واتساب للعميل بإشعار التوفر والموقف الدوائي (يدوياً بنقرة الصيدلي)"
                        >
                          <MessageSquare size={13} color="#ffffff" />
                          <span>
                            {order.whatsapp_notified_at || order.whatsappNotifiedAt ? '📱 إرسال واتساب للعميل (أُرسل ✅)' : '📱 إرسال واتساب للعميل'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPrintingOrder(order)}
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          title="طباعة إيصال للعميل"
                        >
                          <Printer size={13} />
                          <span>طباعة</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeInnerTab === 'returns' ? (
        /* ── قسم مرتجعات طلبات العملاء بالفرع ↩️ ── */
        <div className="outstock-card">
          <div className="outstock-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 className="outstock-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={18} color="#db2777" />
              <span>سجل مرتجعات طلبات العملاء بالفرع ↩️</span>
              <span style={{ fontSize: '13px', color: '#db2777', fontWeight: '800' }}>
                ({branchReturns.length} طلب مرتجع)
              </span>
            </h3>

            {/* فلاتر حالات المرتجعات */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'الكل' },
                { id: 'pending_procurement', label: 'قيد انتظار المشتريات ⏳' },
                { id: 'approved', label: 'معتمدة ✅' },
                { id: 'rejected', label: 'مرفوضة ❌' }
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setReturnsSubFilter(f.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    border: returnsSubFilter === f.id ? '2px solid #db2777' : '1px solid #cbd5e1',
                    background: returnsSubFilter === f.id ? '#fdf2f8' : '#ffffff',
                    color: returnsSubFilter === f.id ? '#be185d' : '#64748b'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {isReturnsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#db2777' }} />
              <div>جاري استرجاع سجل المرتجعات...</div>
            </div>
          ) : branchReturns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
              <RotateCcw size={42} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
                لا توجد مرتجعات مسجلة لهذا الفرع
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                يمكنك الضغط على زر "مرتجع ↩️" في أي طلب عميل معتمد لطلب إرجاع كلي أو جزئي.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {branchReturns
                .filter((r) => {
                  if (returnsSubFilter === 'all') return true;
                  return r.status === returnsSubFilter;
                })
                .map((ret) => {
                  const items = Array.isArray(ret.items) ? ret.items : [];
                  const isPending = ret.status === 'pending_procurement';
                  const isApproved = ret.status === 'approved';
                  const isRejected = ret.status === 'rejected';

                  return (
                    <div
                      key={ret.id}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid',
                        borderColor: isPending ? '#fde68a' : isApproved ? '#bbf7d0' : '#fecaca',
                        borderRadius: '14px',
                        padding: '16px 20px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ background: '#0f172a', color: '#ffffff', padding: '4px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '13px' }}>
                            طلب #{ret.order_number}
                          </span>
                          <strong style={{ fontSize: '15.5px', color: '#0f172a' }}>
                            {ret.customer_name || 'العميل'}
                          </strong>
                          {ret.customer_phone && (
                            <span style={{ fontSize: '13px', color: '#0284c7' }} dir="ltr">
                              ({ret.customer_phone})
                            </span>
                          )}
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {new Date(ret.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>

                        <div>
                          {isPending && (
                            <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>
                              ⏳ قيد انتظار المشتريات (الأصناف بعهدة الفرع)
                            </span>
                          )}
                          {isApproved && (
                            <span style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>
                              ✅ معتمد من المشتريات (تمت التسوية)
                            </span>
                          )}
                          {isRejected && (
                            <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>
                              ❌ مرفوض: {ret.procurement_rejection_reason || 'غير محدد'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* جدول الأصناف المرتجعة */}
                      <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px', marginBottom: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'right' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569' }}>
                              <th style={{ padding: '6px 10px' }}>الصنف</th>
                              <th style={{ padding: '6px 10px', textAlign: 'center' }}>الكمية</th>
                              <th style={{ padding: '6px 10px', textAlign: 'center' }}>سعر الوحدة</th>
                              <th style={{ padding: '6px 10px', textAlign: 'center' }}>الإجمالي</th>
                              <th style={{ padding: '6px 10px' }}>سبب الإرجاع</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>{it.medicationName || it.name}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>{it.quantity}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>{parseFloat(it.unitPrice || 0).toFixed(2)} ج.م</td>
                                <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 'bold', color: '#0d9488' }}>
                                  {parseFloat(it.totalPrice || (it.unitPrice * it.quantity) || 0).toFixed(2)} ج.م
                                </td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{it.returnReason || ret.general_return_reason || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* سطر الإجماليات وزر الطباعة الحرارية */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12.5px' }}>
                          <div>
                            {parseFloat(ret.down_payment_refund || ret.total_refund_amount || 0) > 0 ? (
                              <span>العربون المسترد: <strong style={{ color: '#dc2626' }}>{parseFloat(ret.down_payment_refund || ret.total_refund_amount).toFixed(2)} ج.م</strong></span>
                            ) : (
                              <span style={{ color: '#64748b', fontWeight: '700' }}>بدون مسترد مالي (العربون 0)</span>
                            )}
                          </div>
                          {parseFloat(ret.down_payment_refund || 0) > 0 && ret.wallet_credited && (
                            <div style={{ color: '#059669', fontWeight: 'bold' }}>
                              (✓ تم الإيداع بمحفظة العميل)
                            </div>
                          )}
                          <div style={{ color: '#64748b', fontSize: '11.5px' }}>
                            مسجل المرتجع: {ret.created_by_name} ({ret.created_by_code})
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            printReturnReceipt({
                              returnId: ret.id,
                              orderNumber: ret.order_number,
                              branchName: branch?.name || ret.branch_name || 'الفرع',
                              customerName: ret.customer_name || '',
                              customerPhone: ret.customer_phone || '',
                              items,
                              totalRefundAmount: parseFloat(ret.total_refund_amount || 0),
                              downPaymentRefund: parseFloat(ret.down_payment_refund || 0),
                              generalReturnReason: ret.general_return_reason || '',
                              refundDestination: ret.refund_destination || 'wallet',
                              employeeCode: ret.created_by_code || '',
                              employeeName: ret.created_by_name || '',
                              date: ret.created_at
                            });
                          }}
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Printer size={13} />
                          <span>طباعة إيصال مرتجع 🖨️</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        /* قسم أرشيف الطلبات المسلّمة */
        <div className="outstock-card">
          <div className="outstock-card-header">
            <h3 className="outstock-card-title">
              <span>✅ أرشيف طلبات العملاء المسلّمة بنجاح</span>
              <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: '800' }}>
                ({filteredDeliveredOrders.length} طلب مسلّم)
              </span>
            </h3>
          </div>

          {isDeliveredLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#16a34a' }} />
              <div>جاري تحميل أرشيف الطلبات المسلمة...</div>
            </div>
          ) : filteredDeliveredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
              <Archive size={42} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
                لا توجد طلبات مسلّمة تطابق هذا الفلتر
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                تظهر هنا كافة الطلبات التي تم تسليمها للعملاء وتصفيتها مالياً.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredDeliveredOrders.map((order) => {
                const itemsList = order.items || [];

                // فحص إذا كان الطلب يتضمن أصناف غير متوفرة بالسوق أو تم شطبها ورد عربونها
                const hasUnavailableItems = itemsList.some((it) => {
                  const isPruned = Boolean(it.pruned_from_bill || it.prunedFromBill);
                  const itmStatus = String(it.item_status || it.itemStatus || it.status || '').toLowerCase();
                  return isPruned || ['unavailable', 'unavailable_in_market', 'cancelled_by_customer', 'cancelled', 'returned'].includes(itmStatus);
                });

                return (
                  <div
                    key={order.id}
                    style={{
                      background: '#ffffff',
                      border: hasUnavailableItems ? '1.5px solid #fed7aa' : '1.5px solid #bbf7d0',
                      borderRadius: '16px',
                      padding: '16px 20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '13px' }}>
                          {order.order_number || order.orderNumber}
                        </span>

                        <strong style={{ fontSize: '16px', color: '#0f172a' }}>
                          {order.customer_name || order.customerName}
                        </strong>

                        <span style={{ fontSize: '13px', color: '#0284c7' }}>
                          ({order.customer_phone || order.customerPhone})
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {hasUnavailableItems ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                background: '#fef2f2',
                                color: '#b91c1c',
                                border: '1px solid #fca5a5',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: '900',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <AlertCircle size={14} color="#b91c1c" />
                              <span>تسليم جزئي (مع صنف غير متوفر)</span>
                            </span>
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: '900',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <CheckCircle2 size={14} color="#15803d" />
                              <span>تم تسليم الأصناف المتاحة</span>
                            </span>
                          </div>
                        ) : (
                          <span
                            style={{
                              background: '#dcfce7',
                              color: '#15803d',
                              padding: '4px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '900',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <CheckCircle2 size={14} />
                            <span>تم التسليم للعميل بالكامل</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setPrintingOrder(order)}
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          title="إعادة طباعة إيصال الاستلام"
                        >
                          <Printer size={14} />
                          <span>طباعة إيصال</span>
                        </button>
                      </div>
                    </div>

                    {/* سطر التوقيتات وتفاصيل التسليم */}
                    <div
                      style={{
                        background: '#f8fafc',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        fontSize: '12px',
                        color: '#64748b',
                        marginBottom: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <span>
                          <Send size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                          أُرسل للمشتريات: {formatDateTime(order.sent_to_procurement_at || order.created_at)}
                        </span>

                        {order.procurement_replied_at && (
                          <span style={{ color: '#0369a1' }}>
                            <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                            رد المشتريات: {formatDateTime(order.procurement_replied_at)}
                          </span>
                        )}

                        {order.delivered_at && (
                          <span style={{ color: '#15803d', fontWeight: '800' }}>
                            <CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                            تاريخ ووقت التسليم: {formatDateTime(order.delivered_at)}
                            {order.delivered_by && ` (${order.delivered_by})`}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <div>
                          المبلغ الإجمالي المسدد: <strong style={{ color: '#0f172a' }}>{parseFloat(order.total_amount || order.totalAmount || 0).toFixed(2)} ج.م</strong>
                        </div>
                        {hasUnavailableItems && (
                          <span style={{ color: '#b91c1c', fontSize: '11px', fontWeight: '800', background: '#fef2f2', padding: '2px 8px', borderRadius: '5px', border: '1px solid #fecdd3' }}>
                            (تمت تصفية واسترداد عربون الأصناف غير المتوفرة)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* قائمة الأصناف مع تمييز الأصناف المسلمة بخلفية خضراء والأصناف غير المتوفرة بخط شطب أحمر بارز */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {itemsList.map((it, idx) => {
                        const isPruned = Boolean(it.pruned_from_bill || it.prunedFromBill);
                        const itmStatus = String(it.item_status || it.itemStatus || it.status || '').toLowerCase();
                        const isExplicitDelivered = (itmStatus === 'delivered' || it.is_item_delivered === true || it.isItemDelivered === true) && !isPruned;
                        const isUnavailable = isPruned || 
                          ['unavailable', 'unavailable_in_market', 'cancelled_by_customer', 'cancelled', 'returned'].includes(itmStatus) || 
                          (hasUnavailableItems && !isExplicitDelivered);

                        if (isUnavailable) {
                          return (
                            <div
                              key={it.id || idx}
                              style={{
                                background: '#fef2f2',
                                border: '1.5px dashed #f87171',
                                borderRadius: '8px',
                                padding: '5px 12px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 1px 3px rgba(220, 38, 38, 0.05)'
                              }}
                              title="هذا الصنف لم يتوفر بالسوق وتم استرداد العربون للعميل ولم يُسلَّم"
                            >
                              <span style={{ fontSize: '10px', background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                {it.item_type === 'cosmetics' ? '💄 مستحضر' : '💊 دواء'}
                              </span>
                              <strong
                                style={{
                                  textDecoration: 'line-through',
                                  textDecorationColor: '#dc2626',
                                  textDecorationThickness: '2.5px',
                                  color: '#991b1b',
                                  fontWeight: '900',
                                  fontSize: '13px'
                                }}
                              >
                                {it.medicationName || it.medication_name}
                              </strong>
                              <s style={{ color: '#ef4444', fontSize: '11px' }}>({it.quantity} علبة)</s>
                              <span
                                style={{
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10.5px',
                                  fontWeight: '800',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <XCircle size={11} color="#dc2626" />
                                <span>غير متوفر بالسوق (لم يُسلَّم - تم استرداد العربون)</span>
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={it.id || idx}
                            style={{
                              background: '#f0fdf4',
                              border: '1px solid #86efac',
                              borderRadius: '8px',
                              padding: '5px 12px',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            <span style={{ fontSize: '10px', background: it.item_type === 'cosmetics' ? '#fce7f3' : '#e0f2fe', color: it.item_type === 'cosmetics' ? '#be185d' : '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                              {it.item_type === 'cosmetics' ? '💄 مستحضر' : '💊 دواء'}
                            </span>
                            <strong style={{ color: '#166534', fontSize: '13px' }}>{it.medicationName || it.medication_name}</strong>
                            <span style={{ color: '#64748b' }}>({it.quantity} علبة)</span>
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <CheckCircle2 size={11} color="#15803d" />
                              <span>تم التسليم للعميل</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 🔒 نافذة التحقق من كود الصيدلي المستلم للطلب (مستور كباسورد) */}
      {isReceiverAuthOpen && (
        <EmployeeCodeAuthModal
          isOpen={isReceiverAuthOpen}
          title="التحقق من هوية محرر ومستلم الطلب 🔒"
          subtitle="يرجى إدخال كود الموظف السري (مستور كباسورد) لتوثيق هويتك كمحرر للطلب"
          branchId={branchId}
          onClose={() => setIsReceiverAuthOpen(false)}
          onSuccess={handleReceiverAuthSuccess}
        />
      )}

      {/* 🔒 نافذة التحقق من كود الصيدلي المسلّم للطلب (مستور كباسورد) */}
      {deliveryAuthOrder && (
        <EmployeeCodeAuthModal
          isOpen={Boolean(deliveryAuthOrder)}
          title="التحقق من هوية الموظف المسلّم للطلب 🔒"
          subtitle="يرجى إدخال كود الموظف السري (مستور كباسورد) لتوثيق تسليم الطلب وتحصيل المبلغ"
          branchId={branchId}
          onClose={() => setDeliveryAuthOrder(null)}
          onSuccess={handleDeliverAuthSuccess}
        />
      )}

      {/* 🔒 نافذة التحقق من كود الصيدلي المستلم للمرتجع */}
      {returnAuthOrder && (
        <EmployeeCodeAuthModal
          isOpen={Boolean(returnAuthOrder)}
          title="التحقق من هوية الموظف المسؤول عن تسجيل المرتجع 🔒"
          subtitle="يرجى إدخال كود الموظف السري لتوثيق استلام المرتجع وتعديل الحسابات"
          branchId={branchId}
          onClose={() => setReturnAuthOrder(null)}
          onSuccess={(emp) => {
            const target = returnAuthOrder;
            setReturnAuthOrder(null);
            setAuthenticatedReturnEmployee(emp);
            setReturningOrder(target);
          }}
        />
      )}

      {/* نافذة تسجيل طلب جديد */}
      {isNewOrderModalOpen && (
        <NewCustomerOrderModal
          branchId={branchId}
          defaultPharmacist={currentPharmacist}
          orderReceiver={authenticatedReceiver}
          onClose={() => {
            setIsNewOrderModalOpen(false);
            setAuthenticatedReceiver(null);
          }}
          onOrderCreated={(newOrder) => {
            setIsNewOrderModalOpen(false);
            setAuthenticatedReceiver(null);
            showToast?.('✅ تم تسجيل الطلب وإرساله بنجاح');
            fetchOrders();
            setPrintingOrder(newOrder);
          }}
        />
      )}

      {/* نافذة تعديل طلب قائم قبل رد المشتريات */}
      {editingOrder && (
        <NewCustomerOrderModal
          branchId={branchId}
          defaultPharmacist={currentPharmacist}
          editingOrder={editingOrder}
          onClose={() => setEditingOrder(null)}
          onOrderUpdated={(updatedOrder) => {
            setEditingOrder(null);
            showToast?.('✅ تم حفظ التعديلات وإشعار إدارة المشتريات بالصنف المعدل عبر واتساب');
            fetchOrders();
          }}
        />
      )}

      {/* نافذة تعديل مبلغ العربون / المدفوع بعد رد المشتريات */}
      {depositModalOrder && (
        <div
          className="outstock-modal-backdrop"
          style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDepositModalOrder(null)}
        >
          <div
            style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '900', color: '#1e293b' }}>
              💵 تعديل مبلغ العربون / المدفوع
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
              طلب رقم: <strong>{depositModalOrder.order_number || depositModalOrder.orderNumber}</strong> لعميل: <strong>{depositModalOrder.customer_name || depositModalOrder.customerName}</strong>
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '6px' }}>
                مبلغ العربون الجديد (ج.م) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={newDepositAmount}
                onChange={(e) => setNewDepositAmount(e.target.value)}
                className="outstock-form-input"
                style={{ fontSize: '16px', fontWeight: 'bold', textAlign: 'center' }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDepositModalOrder(null)}
                className="outstock-btn outstock-btn-secondary"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveDepositAmount}
                disabled={isSavingDeposit}
                className="outstock-btn outstock-btn-primary"
              >
                {isSavingDeposit ? 'جاري الحفظ...' : 'حفظ العربون الجديد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة طباعة إيصال الكاشير الحراري */}
      {printingOrder && (
        <DualCashierReceiptModal
          order={printingOrder}
          branch={branch}
          onClose={() => setPrintingOrder(null)}
        />
      )}

      {/* ── نافذة تسليم الطلب للعميل وتسوية باقي المبلغ وإدراجه بمبيعات الفرع ── */}
      {deliveryConfirmOrder && (
        <OrderDeliverySettlementModal
          order={deliveryConfirmOrder}
          branch={branch}
          currentPharmacist={currentPharmacist}
          deliveredBy={authenticatedDeliverer}
          onClose={() => {
            setDeliveryConfirmOrder(null);
            setAuthenticatedDeliverer(null);
          }}
          onDeliveredSuccess={(deliveredOrder, meta) => {
            const wasPartial = meta?.wasPartial || deliveredOrder.order_status === 'partially_delivered';
            const remainingPending = meta?.remainingPendingItems || [];

            if (wasPartial && remainingPending.length > 0) {
              setOrders((prev) => prev.map((o) => (o.id === deliveredOrder.id ? deliveredOrder : o)));
              setCompletionModalData({
                order: deliveredOrder,
                deliveredItems: meta?.deliveredItems || [],
                remainingItems: remainingPending,
                initialReservedDeposit: meta?.reservedDeposit || 0,
                authenticatedEmployee: authenticatedDeliverer
              });
            } else {
              setOrders((prev) => prev.filter((o) => o.id !== deliveredOrder.id));
            }

            setTransferredOrders((prev) =>
              prev.map((o) => (o.id === deliveredOrder.id ? { ...o, status: wasPartial ? 'partially_delivered' : 'delivered', delivered_at: new Date().toISOString() } : o))
            );
            setDeliveryConfirmOrder(null);
            setAuthenticatedDeliverer(null);
            fetchOrders();
            fetchTransferredOrders();
            fetchDeliveredOrders();
          }}
          onOpenReceiptPrint={(receiptOrder) => {
            setPrintingOrder(receiptOrder);
          }}
          showToast={showToast}
        />
      )}

      {/* ── نافذة تصعيد شكوى للمالك مباشرة: تأخير الرد أو عدم توفر الصنف ── */}
      {complaintOrder && (
        <OrderComplaintModal
          order={complaintOrder}
          branch={branch}
          currentPharmacist={currentPharmacist}
          onClose={() => setComplaintOrder(null)}
          onSuccess={(orderId, notes) => {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === orderId
                  ? { ...o, has_complaint: true, complaint_notes: notes }
                  : o
              )
            );
          }}
        />
      )}

      {/* ── نافذة تسجيل طلب مرتجع للعميل (كلي أو جزئي) ── */}
      {returningOrder && (
        <OrderReturnModal
          isOpen={Boolean(returningOrder)}
          order={returningOrder}
          authenticatedEmployee={authenticatedReturnEmployee}
          onClose={() => {
            setReturningOrder(null);
            setAuthenticatedReturnEmployee(null);
          }}
          onReturnSubmitted={() => {
            setReturningOrder(null);
            setAuthenticatedReturnEmployee(null);
            fetchOrders();
            fetchBranchReturns();
          }}
          branchName={branch?.name || 'الصيدلية'}
          showToast={showToast}
        />
      )}

      {/* ── نافذة رادار البدائل والمثائل الدوائية التلقائية (AI Drug Eye) ── */}
      {substitutesModalData && (
        <MedicationSubstitutesModal
          isOpen={Boolean(substitutesModalData)}
          onClose={() => setSubstitutesModalData(null)}
          medicationName={substitutesModalData.medicationName}
          medicationId={substitutesModalData.medicationId}
          customerPhone={substitutesModalData.customerPhone}
          customerName={substitutesModalData.customerName}
          branchName={substitutesModalData.branchName || branch?.name}
          procurementSubstitutes={substitutesModalData.procurementSubstitutes || []}
          procurementNotes={substitutesModalData.procurementNotes || ''}
        />
      )}

      {/* ── نافذة تسوية واسترداد العربون قبل حذف أو إلغاء الطلب ── */}
      {refundModalOrder && (
        <OrderDepositRefundModal
          isOpen={Boolean(refundModalOrder)}
          onClose={() => setRefundModalOrder(null)}
          order={refundModalOrder}
          onConfirmRefund={handleConfirmOrderRefund}
          currentPharmacist={currentPharmacist}
        />
      )}

      {/* ── نافذة استكمال ومتابعة الطلب بعد التسليم الجزئي (عربون، إلغاء فوري من المشتريات، واتساب يدوي) ── */}
      {completionModalData && (
        <OrderRemainingCompletionModal
          order={completionModalData.order}
          deliveredItems={completionModalData.deliveredItems}
          remainingItems={completionModalData.remainingItems}
          initialReservedDeposit={completionModalData.initialReservedDeposit}
          branch={branch}
          currentPharmacist={currentPharmacist}
          authenticatedEmployee={completionModalData.authenticatedEmployee}
          onClose={() => setCompletionModalData(null)}
          onOrderUpdated={(updatedOrder) => {
            fetchOrders();
            if (updatedOrder) {
              setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
            }
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
