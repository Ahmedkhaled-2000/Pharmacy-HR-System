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
  Send,
  Sparkles,
  Archive,
  AlertTriangle,
  ArrowRightLeft,
  Edit,
  Trash2,
  DollarSign
} from 'lucide-react';
import {
  outstockGetOrders,
  outstockDeliverOrder,
  outstockMarkWhatsappNotified,
  outstockDeleteOrder,
  outstockDeleteOrderItem,
  outstockUpdateOrderDeposit
} from '../../../utils/outstockApiClient';
import NewCustomerOrderModal from './NewCustomerOrderModal';
import DualCashierReceiptModal from './DualCashierReceiptModal';
import OrderDeliverySettlementModal from './OrderDeliverySettlementModal';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';
import OrderComplaintModal from './OrderComplaintModal';

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

  // فلاتر التبويبة النشطة: 'all' | 'waiting_procurement' | 'replied'
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

  useEffect(() => {
    if (branchId) {
      if (activeInnerTab === 'active') {
        fetchOrders();
      } else if (activeInnerTab === 'transferred') {
        fetchTransferredOrders();
      } else {
        fetchDeliveredOrders();
      }

      // جلب عدد الطلبات المحولة دائماً لتحديث البادج
      if (activeInnerTab !== 'transferred') {
        outstockGetOrders({ branchId, transferredOnly: true, transferDirection: 'all' })
          .then((res) => {
            if (res?.success && Array.isArray(res.orders)) {
              setTransferredOrders(res.orders);
            }
          })
          .catch(() => {});
      }
    }
  }, [branchId, activeInnerTab, fetchOrders, fetchTransferredOrders, fetchDeliveredOrders]);

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
    setDeliveryAuthOrder(targetOrder || { id: orderOrId });
  };

  const handleDeliverAuthSuccess = (emp) => {
    const target = deliveryAuthOrder;
    setDeliveryAuthOrder(null);
    setAuthenticatedDeliverer(emp);
    setDeliveryConfirmOrder(target);
  };

  // إرسال واتساب للعميل
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

    const msg = `السلام عليكم ورحمة الله وبركاته،\n\nأهلاً بك أ/ ${custName}\nنود إبلاغك بتوفر طلبك الدوائي (إيصال: ${order.order_number || order.orderNumber}) لدى ${bName}، وهو جاهز للاستلام الآن في أي وقت.\n\nالمتبقي عند الاستلام: ${remaining} ج.م\nنسعد دائماً بخدمتكم وتوفير كافة احتياجاتكم الطبية.`;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');

    outstockMarkWhatsappNotified(order.id).catch(() => {});
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

  // حذف الطلب بالكامل قبل رد المشتريات
  const handleDeleteOrder = async (orderId, orderNum) => {
    const targetOrder = orders.find((o) => o.id === orderId) || transferredOrders.find((o) => o.id === orderId);
    if (targetOrder && isOrderReplied(targetOrder)) {
      showToast?.('⚠️ لا يمكن حذف الطلب بعد أن قامت إدارة المشتريات بالرد عليه (كلياً أو جزئياً)');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف الطلب رقم (${orderNum}) بالكامل؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }
    try {
      const res = await outstockDeleteOrder(orderId);
      if (res?.success) {
        showToast?.('✅ تم حذف الطلب بنجاح');
        fetchOrders();
      } else {
        showToast?.(res?.error || 'تعذر حذف الطلب');
      }
    } catch {
      showToast?.('تعذر حذف الطلب، تحقق من الاتصال');
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

  // حساب زمن الاستجابة (SLA) بين الإرسال والرد
  const calculateResponseTime = (sentIso, repliedIso) => {
    if (!sentIso || !repliedIso) return null;
    try {
      const sentTime = new Date(sentIso).getTime();
      const repliedTime = new Date(repliedIso).getTime();
      const diffMinutes = Math.round((repliedTime - sentTime) / (1000 * 60));
      if (diffMinutes < 1) return 'خلال أقل من دقيقة';
      if (diffMinutes < 60) return `خلال ${diffMinutes} دقيقة`;
      const hours = Math.floor(diffMinutes / 60);
      const remainingMins = diffMinutes % 60;
      return `خلال ${hours} س و ${remainingMins} د`;
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

  // فلترة الطلبات النشطة
  const filteredActiveOrders = useMemo(() => {
    let result = orders;

    // فلتر الحالة الفرعي: أي رد (ولو جزئي) يذهب مباشرة لتبويبة تم الرد ولا يظهر في قيد انتظار المشتريات
    if (activeSubFilter === 'waiting_procurement') {
      result = result.filter((o) => !isOrderReplied(o));
    } else if (activeSubFilter === 'replied') {
      result = result.filter((o) => isOrderReplied(o));
    }

    // فلتر البحث النصي
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

    return result;
  }, [orders, activeSubFilter, searchQuery, isOrderReplied]);

  // فلترة الطلبات المسلمة
  const filteredDeliveredOrders = useMemo(() => {
    let result = deliveredOrders;

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

    return result;
  }, [deliveredOrders, searchQuery]);

  // إحصائيات سريعة للطلبات النشطة
  const activeStats = useMemo(() => {
    let waitingCount = 0;
    let repliedCount = 0;
    let readyCount = 0;

    orders.forEach((o) => {
      const hasReplied = isOrderReplied(o);
      const items = o.items || [];
      const hasReady = items.some((it) =>
        (!it.pruned_from_bill && !it.prunedFromBill) &&
        (it.status === 'available' || it.itemStatus === 'available_by_procurement' || it.status === 'delivered')
      );
      if (!hasReplied) waitingCount++;
      if (hasReplied) repliedCount++;
      if (hasReady) readyCount++;
    });

    return {
      total: orders.length,
      waiting: waitingCount,
      replied: repliedCount,
      ready: readyCount
    };
  }, [orders, isOrderReplied]);

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
                const activeItems = itemsList.filter((i) => !i.prunedFromBill && !i.pruned_from_bill);
                const prunedItems = itemsList.filter((i) => i.prunedFromBill || i.pruned_from_bill);

                const hasReplied = isOrderReplied(order);
                const allAvailable = activeItems.length > 0 && prunedItems.length === 0 && activeItems.every((i) => i.itemStatus === 'available_by_procurement' || i.status === 'available');
                const isPendingProcurement = !hasReplied;
                const hasUnavailableOrPending = itemsList.some((i) => {
                  const s = String(i.itemStatus || i.item_status || i.status || '').toLowerCase();
                  const isP = Boolean(i.prunedFromBill || i.pruned_from_bill);
                  return isP || s === 'unavailable' || s === 'unavailable_in_market' || s === 'pending';
                });
                const isPartiallyAvailable = (activeItems.some((i) => i.itemStatus === 'available_by_procurement' || i.status === 'available') && (prunedItems.length > 0 || activeItems.some((i) => i.status === 'pending' || i.itemStatus === 'pending')));
                const slaTime = calculateResponseTime(order.sent_to_procurement_at || order.created_at, order.procurement_replied_at);

                return (
                  <div
                    key={order.id}
                    className={`outstock-order-card ${allAvailable ? 'ready-state' : ''}`}
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

                        {allAvailable ? (
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

                        {slaTime && (
                          <span style={{ color: '#059669', background: '#dcfce7', padding: '1px 6px', borderRadius: '6px', fontWeight: '800' }}>
                            ⚡ {slaTime}
                          </span>
                        )}
                      </div>

                      {order.order_receiver_name && (
                        <div style={{ color: '#475569' }}>
                          الصيدلي المحرر: <strong>{order.order_receiver_name}</strong>
                        </div>
                      )}
                    </div>

                    {/* جدول بنود الأدوية */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', marginBottom: '6px' }}>
                        الأصناف المطلوبة وتصنيفها:
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {activeItems.map((item, idx) => {
                          const isEst = item.is_price_estimated || item.isPriceEstimated;
                          const pMin = parseFloat(item.price_min || item.priceMin || 0);
                          const pMax = parseFloat(item.price_max || item.priceMax || pMin || 0);
                          const isCosmetics = item.item_type === 'cosmetics';
                          const isAvail = item.status === 'available' || item.itemStatus === 'available_by_procurement';

                          return (
                            <div
                              key={idx}
                              style={{
                                background: isAvail ? '#f0fdf4' : '#ffffff',
                                border: '1px solid',
                                borderColor: isAvail ? '#86efac' : isEst ? '#fde68a' : '#cbd5e1',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '12.5px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: '800',
                                  padding: '1px 5px',
                                  borderRadius: '5px',
                                  background: isCosmetics ? '#fce7f3' : '#e0f2fe',
                                  color: isCosmetics ? '#be185d' : '#0369a1'
                                }}
                              >
                                {isCosmetics ? '💄 مستحضر' : '💊 دواء'}
                              </span>

                              <strong>{item.medicationName || item.medication_name}</strong>

                              <span style={{ color: '#64748b' }}>
                                ({item.quantity} {item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'})
                              </span>

                              {isEst && (
                                <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px', fontSize: '10.5px', fontWeight: 'bold' }}>
                                  ({pMin.toFixed(0)} - {pMax.toFixed(0)} ج.م)
                                </span>
                              )}

                              {isAvail ? (
                                <span style={{ color: '#16a34a', fontWeight: '900', fontSize: '11px' }}>✓ متوفر</span>
                              ) : item.status === 'unavailable' ? (
                                <span style={{ color: '#dc2626', fontWeight: '900', fontSize: '11px' }}>✕ غير متوفر</span>
                              ) : (
                                <span style={{ color: '#d97706', fontSize: '11px' }}>⏳ قيد الشراء</span>
                              )}

                              {!hasReplied && activeItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOrderItem(order.id, item.id || idx, item.medicationName || item.medication_name)}
                                  style={{
                                    background: '#fee2e2',
                                    border: '1px solid #fecaca',
                                    borderRadius: '5px',
                                    color: '#dc2626',
                                    cursor: 'pointer',
                                    padding: '2px 5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    fontSize: '11px'
                                  }}
                                  title="حذف هذا الصنف من الطلب قبل رد المشتريات"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {/* الأصناف المشطوبة لعدم التوفر */}
                        {prunedItems.map((item, idx) => (
                          <div
                            key={`pruned_${idx}`}
                            style={{
                              background: '#fef2f2',
                              border: '1px dashed #fca5a5',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              color: '#dc2626',
                              textDecoration: 'line-through'
                            }}
                            title="تم شطبه لعدم التوفر بالسوق وتحويله لصفحة النواقص"
                          >
                            {item.medicationName || item.medication_name} (غير متوفر بالسوق)
                          </div>
                        ))}
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

                      {/* أزرار الإجراءات */}
                      <div className="outstock-order-actions-bar">
                        <button
                          type="button"
                          onClick={() => handleDeliver(order.id)}
                          className="outstock-btn outstock-btn-success"
                          style={{ padding: '8px 16px', fontSize: '13px' }}
                        >
                          <Check size={16} />
                          <span>تسليم للعميل</span>
                        </button>

                        <div className="outstock-order-sub-actions">
                          {/* في حال ردت المشتريات (كلياً أو جزئياً): لا يمكن حذف الطلب إطلاقاً، بل يمكن فقط تعديل الأصناف غير المتوفرة */}
                          {hasReplied ? (
                            hasUnavailableOrPending && (
                              <button
                                type="button"
                                onClick={() => setEditingOrder(order)}
                                className="outstock-btn"
                                style={{
                                  padding: '7px 11px',
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  background: '#fffbeb',
                                  color: '#b45309',
                                  border: '1px solid #fde68a',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="تعديل الأصناف غير المتوفرة فقط أو استبدالها بصنف بديل (الأصناف المعتمدة مقفلة ومحمية)"
                              >
                                <Edit size={14} />
                                <span>تعديل الصنف غير المتوفر ✏️</span>
                              </button>
                            )
                          ) : (
                            /* قبل رد المشتريات: متاح تعديل الطلب بالكامل أو حذفه */
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingOrder(order)}
                                className="outstock-btn"
                                style={{
                                  padding: '7px 11px',
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="تعديل بيانات وأصناف الطلب بالكامل قبل رد المشتريات"
                              >
                                <Edit size={14} />
                                <span>تعديل الطلب ✏️</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(order.id, order.order_number || order.orderNumber)}
                                className="outstock-btn"
                                style={{
                                  padding: '7px 11px',
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  background: '#fef2f2',
                                  color: '#b91c1c',
                                  border: '1px solid #fecaca',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="حذف الطلب بالكامل قبل رد المشتريات"
                              >
                                <Trash2 size={14} />
                                <span>حذف الطلب 🗑️</span>
                              </button>
                            </>
                          )}

                          {/* تعديل العربون متاح دائماً */}
                          <button
                            type="button"
                            onClick={() => handleOpenDepositModal(order)}
                            className="outstock-btn"
                            style={{
                              padding: '7px 11px',
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
                            <DollarSign size={14} />
                            <span>تعديل العربون 💵</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setComplaintOrder(order)}
                            className="outstock-btn"
                            style={{
                              padding: '7px 11px',
                              fontSize: '12px',
                              fontWeight: '800',
                              background: order.has_complaint ? '#fee2e2' : '#fff7ed',
                              color: order.has_complaint ? '#b91c1c' : '#c2410c',
                              border: order.has_complaint ? '1.5px solid #f87171' : '1px solid #fed7aa',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="تصعيد شكوى للمالك مباشرة في حال تأخر رد المشتريات أو لم يتوفر الصنف بالرغم من موافقتهم"
                          >
                            <AlertTriangle size={14} color={order.has_complaint ? '#b91c1c' : '#ea580c'} />
                            <span>{order.has_complaint ? 'تم رفع شكوى للمالك ⚠️' : 'تأخير الرد أو الصنف لم يتوفر ⚠️'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrintingOrder(order)}
                            className="outstock-btn outstock-btn-whatsapp"
                            style={{ padding: '7px 11px', fontSize: '12px' }}
                            title="إرسال الفاتورة الرسمية PDF للعميل عبر الواتساب"
                          >
                            <FileText size={14} />
                            <span>فاتورة PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSendWhatsapp(order)}
                            className="outstock-btn outstock-btn-secondary"
                            style={{ padding: '7px 11px', fontSize: '12px' }}
                            title="إرسال رسالة واتساب للعميل بإشعار التوفر والاستلام"
                          >
                            <MessageSquare size={14} />
                            <span>إشعار واتساب</span>
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
                      </div>
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

                return (
                  <div
                    key={order.id}
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #bbf7d0',
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                          <span>تم التسليم للعميل</span>
                        </span>

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

                      <div>
                        المبلغ الإجمالي المسدد: <strong style={{ color: '#0f172a' }}>{parseFloat(order.total_amount || order.totalAmount || 0).toFixed(2)} ج.م</strong>
                      </div>
                    </div>

                    {/* قائمة الأصناف المسلمة */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {itemsList.map((it, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span style={{ fontSize: '10px', background: it.item_type === 'cosmetics' ? '#fce7f3' : '#e0f2fe', color: it.item_type === 'cosmetics' ? '#be185d' : '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                            {it.item_type === 'cosmetics' ? '💄 مستحضر' : '💊 دواء'}
                          </span>
                          <strong>{it.medicationName || it.medication_name}</strong>
                          <span style={{ color: '#64748b' }}>({it.quantity} علبة)</span>
                        </div>
                      ))}
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
            showToast?.('✅ تم تحديث بيانات الطلب بنجاح');
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
          onDeliveredSuccess={(deliveredOrder) => {
            setOrders((prev) => prev.filter((o) => o.id !== deliveredOrder.id));
            setTransferredOrders((prev) =>
              prev.map((o) => (o.id === deliveredOrder.id ? { ...o, status: 'delivered', delivered_at: new Date().toISOString() } : o))
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
          showToast={showToast}
        />
      )}
    </div>
  );
}
