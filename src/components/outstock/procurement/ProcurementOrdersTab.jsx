import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Search,
  Building2,
  Package,
  Check,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Loader2,
  Sparkles,
  Camera,
  X,
  Pill,
  Filter,
  Edit3,
  Clock,
  Settings,
  Sun,
  Moon,
  Truck,
  Calendar,
  LayoutList,
  Layers,
  User,
  SlidersHorizontal
} from 'lucide-react';
import {
  outstockGetProcurementAggregated,
  outstockProcurementItemAction,
  outstockProcurementBatchItemActions,
  outstockConvertItemType,
  outstockGetCyclesConfig,
  listenToOutstockLocalMessages
} from '../../../utils/outstockApiClient';
import { exportProcurementOrdersExcel } from '../../../utils/outstockExcelExporter';
import OutstockConfirmModal from '../common/OutstockConfirmModal';
import CosmeticsProductModal from '../common/CosmeticsProductModal';
import ItemUnavailabilityModal from './ItemUnavailabilityModal';
import ProcurementCyclesModal from './ProcurementCyclesModal';
import { getSocket } from '../../../utils/socketClient';

/**
 * ProcurementOrdersTab.jsx
 * شاشة طلبات الفروع المجمعة لإدارة المشتريات
 * - عرض كل طلب فرع في سطر مستقل يوضح:
 *   التاريخ والوقت الدقيق، اسم الفرع والصيدلي، نوع الطلب (بدون كشف رقم العميل للخصوصية)، اسم المستحضر والكمية، الملاحظات والاستعجال، وأزرار القرار السريع (متوفر / قيد التجهيز / غير متوفر)
 * - تبويبة عرض مجمعة لاحتياجات الأصناف عبر الفروع
 * - فلتر دورات التوريد وتثبيت المواعيد الافتراضية (دورة الصباح / دورة المساء / وقت محدد)
 * - تصدير شيت إكسل فاخر: شيت 1 تنفيذي موحد للموزعين + شيت 2 تفصيلي بالطلبات الفردية
 * - زر "قيد التجهيز 🚚" وقفل التسليم على فرع الصيدلية لحين التوفير
 */
export default function ProcurementOrdersTab({ showToast, categoryScope = null, currentUser = null }) {
  // نمط العرض: 'individual' (عرض كل طلب فرع في سطر مستقل - افتراضي) | 'aggregated' (عرض كميات الأصناف المجمعة)
  const [viewMode, setViewMode] = useState('individual');

  const [aggregatedData, setAggregatedData] = useState([]);
  const [individualOrders, setIndividualOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(() => categoryScope || 'medication'); // 'medication' | 'cosmetics' | 'all'

  // فلتر حالة البند: 'all_active' (النشط) | 'pending' (بانتظار القرار) | 'in_preparation' (قيد التجهيز)
  const [statusFilter, setStatusFilter] = useState('all_active');

  // فلتر دورات الشراء والوقت المحدد
  const [cutoffTimeFilter, setCutoffTimeFilter] = useState('');
  const [activeCycle, setActiveCycle] = useState(null); // 'morning' | 'evening' | null
  const [cyclesConfig, setCyclesConfig] = useState({ morningCutoff: '14:00', eveningCutoff: '22:00' });
  const [isCyclesModalOpen, setIsCyclesModalOpen] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [previewOrderImageUrl, setPreviewOrderImageUrl] = useState(null);
  const [previewOrderImageTitle, setPreviewOrderImageTitle] = useState('');
  const [selectedCosmeticsItem, setSelectedCosmeticsItem] = useState(null);

  // حالة نافذة شطب الصنف وسبب عدم التوفر والبدائل الذكية
  const [unavailabilityModalItem, setUnavailabilityModalItem] = useState(null);

  // حالة نافذة تعديل كمية الصنف وملاحظات المشتريات
  const [adjustingItemModalData, setAdjustingItemModalData] = useState(null);

  // قرارات الشراء المعلقة قبل الإرسال (Staged Decisions)
  const [decisions, setDecisions] = useState({});

  // حالة نافذة التأكيد المنبثقة الاحترافية
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    iconType: 'warning',
    confirmText: 'تأكيد',
    cancelText: 'إلغاء',
    confirmBtnStyle: 'primary',
    badge: null,
    details: null,
    onConfirmAction: null
  });

  const [lastSyncTime, setLastSyncTime] = useState(() => new Date());

  const formattedSyncTime = useMemo(() => {
    if (!lastSyncTime) return '';
    const h = String(lastSyncTime.getHours()).padStart(2, '0');
    const m = String(lastSyncTime.getMinutes()).padStart(2, '0');
    const s = String(lastSyncTime.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [lastSyncTime]);

  // جلب إعدادات الدورات المثبتة
  useEffect(() => {
    const loadCycles = async () => {
      try {
        const res = await outstockGetCyclesConfig();
        if (res?.success && res.config) {
          setCyclesConfig(res.config);
        }
      } catch (_) {}
    };
    loadCycles();
  }, []);

  const fetchAggregatedOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const activeCat = categoryScope || categoryFilter;
      const res = await outstockGetProcurementAggregated({
        category: activeCat,
        status: statusFilter,
        cutoffTime: cutoffTimeFilter || undefined
      });
      if (res?.success) {
        setAggregatedData(Array.isArray(res.aggregated) ? res.aggregated : []);
        setIndividualOrders(Array.isArray(res.individualOrders) ? res.individualOrders : []);
      }
      setLastSyncTime(new Date());
    } catch (e) {
      console.warn('Fetch aggregated orders error:', e);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [categoryFilter, categoryScope, statusFilter, cutoffTimeFilter]);

  useEffect(() => {
    fetchAggregatedOrders();

    // 1. الاستماع اللحظي لأحداث Socket.io للمزامنة الفورية مع الفروع
    const socket = getSocket();
    const handleLiveOrder = () => {
      fetchAggregatedOrders(true);
    };
    const handleCyclesUpdated = (payload) => {
      if (payload?.config) {
        setCyclesConfig(payload.config);
      }
    };

    if (socket) {
      socket.on('outstock:order_created', handleLiveOrder);
      socket.on('outstock:items_status_updated', handleLiveOrder);
      socket.on('outstock:item_restocked', handleLiveOrder);
      socket.on('outstock:item_type_converted', handleLiveOrder);
      socket.on('outstock:cycles_config_updated', handleCyclesUpdated);
    }

    // 2. الاستماع اللحظي عبر قناة المزامنة المحلية المشتركة بين التبويبات (BroadcastChannel)
    const unsubscribeLocal = listenToOutstockLocalMessages((msg) => {
      if (msg?.type?.startsWith('outstock:')) {
        fetchAggregatedOrders(true);
      }
    });

    // 3. مزامنة فورية عند إعادة تنشيط النافذة أو التبديل إليها (Focus & Visibility)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAggregatedOrders(true);
      }
    };
    const handleWindowFocus = () => {
      fetchAggregatedOrders(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    // 4. استطلاع ذكي دوري كل 8 ثوان لضمان عدم فوات أي طلب في الخلفية
    const pollInterval = setInterval(() => {
      fetchAggregatedOrders(true);
    }, 8000);

    return () => {
      if (socket) {
        socket.off('outstock:order_created', handleLiveOrder);
        socket.off('outstock:items_status_updated', handleLiveOrder);
        socket.off('outstock:item_restocked', handleLiveOrder);
        socket.off('outstock:item_type_converted', handleLiveOrder);
      }
      unsubscribeLocal?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(pollInterval);
    };
  }, [fetchAggregatedOrders]);

  // التحقق من صلاحية تغيير حالة الطلبات واتخاذ قرارات التوريد
  const canChangeStatus = useMemo(() => {
    if (!currentUser) return true;
    if (currentUser.role === 'procurement_manager' || currentUser.isProcurementManager || currentUser.role === 'owner') return true;
    if (currentUser.permissions?.can_change_status !== undefined) return Boolean(currentUser.permissions.can_change_status);
    if (currentUser.can_change_status !== undefined) return Boolean(currentUser.can_change_status);
    return true;
  }, [currentUser]);

  // استخراج قائمة الفروع الفريدة مع عزل الفروع لمسؤولي المشتريات المحددين
  const branchesList = useMemo(() => {
    const map = new Map();
    aggregatedData.forEach(item => {
      if (item.branch_id && !map.has(item.branch_id)) {
        map.set(item.branch_id, item.branch_name || item.branch_id);
      }
    });
    let list = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    if (Array.isArray(currentUser?.allowedBranches) && currentUser.allowedBranches.length > 0 && !currentUser.allBranchesAccess) {
      list = list.filter(b => currentUser.allowedBranches.includes(b.id));
    }
    return list;
  }, [aggregatedData, currentUser]);

  // تعيين قرار لصنف معين
  const handleSetDecision = (key, action, item) => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية تغيير أو اتخاذ قرارات بشأن حالة الطلبات');
      return;
    }
    if (action === 'unavailable') {
      setUnavailabilityModalItem(item);
      return;
    }
    setDecisions(prev => ({
      ...prev,
      [key]: prev[key] === action ? undefined : action
    }));
  };

  // تأكيد شطب الصنف غير المتوفر مع حفظ السبب واقتراح البدائل الذكية
  const handleConfirmUnavailability = async ({ reason, substitutes }) => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية شطب الأصناف أو تغيير حالتها');
      return;
    }
    if (!unavailabilityModalItem) return;
    setIsProcessing(true);
    try {
      const res = await outstockProcurementItemAction({
        branchId: unavailabilityModalItem.branch_id,
        medicationName: unavailabilityModalItem.medication_name,
        unitType: unavailabilityModalItem.unit_type,
        action: 'unavailable',
        notes: reason,
        substitutes: substitutes,
        itemIds: (unavailabilityModalItem.item_details || []).map(d => d.itemId)
      });

      if (res?.success) {
        showToast?.(`✅ تم شطب الصنف وتسجيل سبب عدم التوفر وإرسال البدائل لواتساب الفرع بنجاح`);
        setUnavailabilityModalItem(null);
        fetchAggregatedOrders();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر شطب الصنف'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء حفظ القرار');
    } finally {
      setIsProcessing(false);
    }
  };

  // إرسال قرار فردي فوري بنافذة تأكيد منبثقة
  const handleQuickAction = (item, action) => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية تغيير أو اتخاذ قرارات بشأن حالة الطلبات');
      return;
    }
    if (action === 'unavailable') {
      setUnavailabilityModalItem(item);
      return;
    }

    const isAvailable = action === 'available';
    const isInPrep = action === 'in_preparation';
    const actionLabel = isInPrep
      ? 'وضع الصنف قيد التجهيز والشحن للفرع 🚚'
      : 'توفير الصنف وشحنه لرصيد الفرع';
    const unitLabel = item.unit_type === 'strip' ? 'شريط' : 'علبة';

    setConfirmConfig({
      isOpen: true,
      title: isInPrep ? 'تأكيد وضع الصنف قيد التجهيز 🚚' : 'تأكيد توفير الصنف بالفرع',
      message: isInPrep
        ? `هل أنت متأكد من وضع هذا الصنف قيد التجهيز؟ سيتم إشعار صيدلي الفرع مع قفل تسليم الطلب لحين اكتمال التوريد.`
        : `هل أنت متأكد من ${actionLabel}؟ سيتم تحديث رصيد الفرع وفواتير العملاء ومزامنتها لحظياً.`,
      iconType: isInPrep ? 'info' : 'success',
      confirmText: isInPrep ? 'نعم، قيد التجهيز 🚚' : 'نعم، تم التوفير والشحن',
      cancelText: 'تراجع',
      confirmBtnStyle: isInPrep ? 'primary' : 'success',
      badge: `${item.total_requested_qty} ${unitLabel}`,
      details: [
        { label: 'الصنف', value: item.medication_name },
        { label: 'الفرع المستلم', value: item.branch_name || item.branch_id },
        { label: 'عدد طلبات العملاء', value: `${item.orders_count} عميل` }
      ],
      onConfirmAction: async () => {
        setIsProcessing(true);
        try {
          const res = await outstockProcurementItemAction({
            branchId: item.branch_id,
            medicationName: item.medication_name,
            unitType: item.unit_type,
            action,
            itemIds: (item.item_details || []).map(d => d.itemId)
          });

          if (res?.success) {
            showToast?.(`✅ ${res.message || 'تم تحديث حالة الصنف بنجاح'}`);
            fetchAggregatedOrders();
          } else {
            showToast?.(`⚠️ ${res?.error || 'تعذر تطبيق القرار'}`);
          }
        } catch (err) {
          showToast?.('حدث خطأ أثناء إرسال التحديث');
        } finally {
          setIsProcessing(false);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // اتخاذ قرار سريع لطلب فرع فردي (سطر مستقل)
  const handleQuickOrderAction = (order, action) => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية تغيير أو اتخاذ قرارات بشأن حالة الطلبات');
      return;
    }
    if (action === 'unavailable') {
      setUnavailabilityModalItem({
        branch_id: order.branchId,
        branch_name: order.branchName,
        medication_name: order.medicationName,
        unit_type: order.unitType,
        item_details: [{ itemId: order.itemId }]
      });
      return;
    }

    const isAvailable = action === 'available';
    const isInPrep = action === 'in_preparation';
    const unitLabel = order.unitType === 'strip' ? 'شريط' : 'علبة';

    const actionTitle = isAvailable
      ? 'تأكيد توفير وشحن الطلب'
      : 'تأكيد وضع الطلب قيد التجهيز 🚚';

    const actionMsg = isAvailable
      ? `هل أنت متأكد من توفير وشحن الصنف للفرع؟ سيتم تحديث حالة الطلب وإتاحة تسليمه للعميل ومزامنة الفرع فورياً.`
      : `هل أنت متأكد من بدء تجهيز الطلب؟ سيتم إشعار صيدلي الفرع بأن الطلب قيد التجهيز والشحن مع قفل التسليم لحين وصول الشحنة.`;

    setConfirmConfig({
      isOpen: true,
      title: actionTitle,
      message: actionMsg,
      iconType: isAvailable ? 'success' : 'info',
      confirmText: isAvailable ? 'نعم، تم التوفير والشحن' : 'نعم، الطلب قيد التجهيز 🚚',
      cancelText: 'تراجع',
      confirmBtnStyle: isAvailable ? 'success' : 'primary',
      badge: `${order.quantity} ${unitLabel}`,
      details: [
        { label: 'الصنف', value: order.medicationName },
        { label: 'الفرع المستلم', value: order.branchName || order.branchId },
        { label: 'رقم الطلب', value: `#${order.orderNumber}` },
        { label: 'الصيدلي الطالب', value: order.responsiblePharmacist || 'صيدلي الفرع' }
      ],
      onConfirmAction: async () => {
        setIsProcessing(true);
        try {
          const res = await outstockProcurementItemAction({
            branchId: order.branchId,
            medicationName: order.medicationName,
            unitType: order.unitType,
            action,
            itemIds: [order.itemId]
          });

          if (res?.success) {
            showToast?.(`✅ ${res.message || 'تم تحديث حالة الطلب بنجاح'}`);
            fetchAggregatedOrders();
          } else {
            showToast?.(`⚠️ ${res?.error || 'تعذر تطبيق القرار'}`);
          }
        } catch (err) {
          showToast?.('حدث خطأ أثناء إرسال التحديث');
        } finally {
          setIsProcessing(false);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // فتح نافذة تعديل كمية طلب فردي
  const handleOpenAdjustOrderModal = (order) => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية تعديل كميات طلبات الفروع');
      return;
    }
    setAdjustingItemModalData({
      item: {
        branch_id: order.branchId,
        branch_name: order.branchName,
        medication_name: order.medicationName,
        unit_type: order.unitType,
        total_requested_qty: order.quantity,
        item_details: [{
          itemId: order.itemId,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          quantity: order.quantity
        }]
      },
      approvedQty: order.quantity,
      notes: '',
      perOrderAdjustments: { [order.itemId]: order.quantity }
    });
  };

  // تحويل نوع طلب فردي (دوائي <-> تجميل)
  const handleConvertOrderTypePrompt = (order) => {
    handleConvertItemTypePrompt({
      medication_name: order.medicationName,
      item_type: order.itemType,
      branch_id: order.branchId,
      branch_name: order.branchName,
      total_requested_qty: order.quantity,
      unit_type: order.unitType,
      item_details: [{ itemId: order.itemId }]
    });
  };

  // فتح نافذة تعديل الكمية المعتمدة وتدوين الملاحظات (المتطلب 20)
  const handleOpenAdjustModal = (item) => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية تعديل كميات طلبات الفروع');
      return;
    }
    const perOrder = {};
    (item.item_details || []).forEach(d => {
      perOrder[d.itemId] = d.quantity;
    });
    setAdjustingItemModalData({
      item,
      approvedQty: item.total_requested_qty,
      notes: '',
      perOrderAdjustments: perOrder
    });
  };

  // اعتماد تعديل الكمية بالمشتريات وتطبيق المزامنة وإشعار الواتساب
  const handleConfirmAdjustQuantity = async () => {
    if (!adjustingItemModalData) return;
    const { item, approvedQty, notes, perOrderAdjustments } = adjustingItemModalData;

    const hasMultiple = (item.item_details || []).length > 1;
    let finalQty = approvedQty;
    const itemAdjustmentsList = [];

    if (hasMultiple) {
      let sum = 0;
      (item.item_details || []).forEach(d => {
        const q = perOrderAdjustments[d.itemId] != null ? parseInt(perOrderAdjustments[d.itemId], 10) : d.quantity;
        sum += q;
        itemAdjustmentsList.push({
          itemId: d.itemId,
          modifiedQuantity: q,
          notes: (notes || '').trim()
        });
      });
      finalQty = sum;
    } else {
      const num = parseInt(approvedQty, 10);
      if (isNaN(num) || num <= 0) {
        showToast?.('يرجى إدخال كمية صحيحة أكبر من صفر');
        return;
      }
      finalQty = num;
    }

    setIsProcessing(true);
    try {
      const res = await outstockProcurementItemAction({
        branchId: item.branch_id,
        medicationName: item.medication_name,
        unitType: item.unit_type,
        action: 'available',
        modifiedQuantity: finalQty,
        notes: (notes || '').trim() || 'تم تعديل الكمية وتوفيرها من المشتريات',
        itemAdjustments: itemAdjustmentsList.length > 0 ? itemAdjustmentsList : null,
        itemIds: (item.item_details || []).map(d => d.itemId)
      });

      if (res?.success) {
        const waNote = res.whatsAppSent ? ' 📱 وتم إرسال إشعار الواتساب للفرع' : '';
        showToast?.(`✅ ${res.message || 'تم اعتماد وتعديل الكمية بنجاح'}${waNote}`);
        setAdjustingItemModalData(null);
        fetchAggregatedOrders();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر تعديل الكمية'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء تعديل الكمية');
    } finally {
      setIsProcessing(false);
    }
  };

  // تحويل وتصحيح نوع الصنف (دوائي <-> تجميل) ونقله فوراً للمسؤول المختص وتحديث الكتالوج
  const handleConvertItemTypePrompt = (item, explicitTargetType = null) => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية تحويل تصنيف الأصناف');
      return;
    }
    const isCurrentlyCosmetics = item.item_type === 'cosmetics';
    const targetType = explicitTargetType || (isCurrentlyCosmetics ? 'medication' : 'cosmetics');
    const isTargetingCosmetics = targetType === 'cosmetics';
    const itemIds = (item.item_details || []).map(d => d.itemId).filter(Boolean);

    const title = isTargetingCosmetics
      ? 'تحويل الصنف إلى مستحضرات تجميل 💄'
      : 'تحويل الصنف إلى صنف دوائي 💊';

    const message = isTargetingCosmetics
      ? `هل أنت متأكد من تحويل الصنف "${item.medication_name}" من صنف دوائي إلى مستحضرات تجميل؟\nسيتم نقله فوراً إلى شاشة مسؤول المستحضرات، وتحديث الكتالوج العام تلقائياً لتصحيح الطلبات المستقبلية.`
      : `هل أنت متأكد من تحويل الصنف "${item.medication_name}" من مستحضرات تجميل إلى صنف دوائي؟\nسيتم نقله فوراً إلى شاشة مدير المشتريات، وتحديث الكتالوج العام تلقائياً لتصحيح الطلبات المستقبلية.`;

    const badge = isTargetingCosmetics ? '💄 نقل لقسم التجميل' : '💊 نقل للأدوية';
    const confirmText = isTargetingCosmetics ? 'نعم، تحويل لتجميل' : 'نعم، تحويل لدوائي';
    const confirmBtnStyle = isTargetingCosmetics ? 'secondary' : 'primary';

    setConfirmConfig({
      isOpen: true,
      title,
      message,
      iconType: 'warning',
      badge,
      confirmText,
      cancelText: 'إلغاء',
      confirmBtnStyle,
      details: [
        { label: 'الصنف', value: item.medication_name },
        { label: 'الفرع الطالب', value: item.branch_name || item.branch_id },
        { label: 'إجمالي الكمية المطلوبة', value: `${item.total_requested_qty} ${item.unit_type === 'strip' ? 'شريط' : 'علبة'}` },
        { label: 'عدد الطلبات المتأثرة', value: `${itemIds.length || item.orders_count || 1} طلب معلق` }
      ],
      onConfirmAction: async () => {
        setIsProcessing(true);
        try {
          const res = await outstockConvertItemType({
            itemIds,
            branchId: item.branch_id,
            medicationName: item.medication_name,
            targetItemType: targetType,
            updateCatalog: true
          });

          if (res?.success) {
            showToast?.(`✅ ${res.message || (isTargetingCosmetics ? 'تم تحويل الصنف إلى مستحضرات تجميل ونقله بنجاح' : 'تم تحويل الصنف إلى صنف دوائي ونقله بنجاح')}`);
            fetchAggregatedOrders();
          } else {
            showToast?.(`⚠️ ${res?.error || 'تعذر تحويل نوع الصنف'}`);
          }
        } catch (err) {
          showToast?.('حدث خطأ أثناء تحويل نوع الصنف');
        } finally {
          setIsProcessing(false);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // إرسال دفعة القرارات المحددة معاً للفروع بنافذة تأكيد منبثقة
  const handleBatchSubmit = () => {
    if (!canChangeStatus) {
      showToast?.('⛔ ليس لديك صلاحية اعتماد أو إرسال قرارات المشتريات');
      return;
    }
    const keys = Object.keys(decisions).filter(k => decisions[k]);
    if (keys.length === 0) {
      showToast?.('يرجى تحديد قرار (متوفر أو غير متوفر) لصنف واحد على الأقل أولاً');
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: 'إرسال وتطبيق قرارات المشتريات دفعة واحدة',
      message: `هل تريد اعتماد وإرسال (${keys.length}) قرار دفعة واحدة للفروع المعنية وتحديث حسابات وفواتير المرضى وإرسال تقارير الواتساب الموحدة للفروع؟`,
      iconType: 'send',
      confirmText: `اعتماد وإرسال (${keys.length}) قرار الآن`,
      cancelText: 'مراجعة القرارات',
      confirmBtnStyle: 'primary',
      badge: `${keys.length} صنف محدد`,
      details: [
        { label: 'إجمالي القرارات المحددة', value: `${keys.length} صنف` },
        { label: 'المزامنة', value: 'تحديث فوري لرصيد الفروع مع إشعارات واتساب مجمعة' }
      ],
      onConfirmAction: async () => {
        setIsProcessing(true);
        try {
          const actions = [];
          for (const item of filteredItems) {
            const key = `${item.branch_id}_${item.medication_name}_${item.unit_type}`;
            const action = decisions[key];
            if (action) {
              actions.push({
                branchId: item.branch_id,
                medicationName: item.medication_name,
                unitType: item.unit_type,
                action,
                itemIds: (item.item_details || []).map(d => d.itemId)
              });
            }
          }

          const res = await outstockProcurementBatchItemActions(actions);
          if (res?.success) {
            showToast?.(`✅ ${res.message || `تم إرسال وتطبيق (${actions.length}) تحديث بنجاح ومزامنتها مع الفروع فورياً`}`);
            setDecisions({});
            fetchAggregatedOrders();
          } else {
            showToast?.(`⚠️ ${res?.error || 'حدث خطأ أثناء إرسال الدفعة'}`);
          }
        } catch (err) {
          showToast?.('حدث خطأ أثناء إرسال الدفعة');
        } finally {
          setIsProcessing(false);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // تنسيق التاريخ والوقت بتنسيق عربي دقيق (22/10/2026 - 03:45 م)
  const formatDateTime = useCallback((dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      const datePart = d.toLocaleDateString('ar-EG', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const timePart = d.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${datePart} - ${timePart}`;
    } catch (_) {
      return String(dateStr);
    }
  }, []);

  // تصفية وترتيب طلبات الفروع الفردية (سطر لكل طلب فرع)
  const filteredIndividualOrders = useMemo(() => {
    const list = individualOrders.filter(order => {
      if (Array.isArray(currentUser?.allowedBranches) && currentUser.allowedBranches.length > 0 && !currentUser.allBranchesAccess) {
        if (!currentUser.allowedBranches.includes(order.branchId)) return false;
      }
      if (selectedBranchId !== 'all' && order.branchId !== selectedBranchId) {
        return false;
      }
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const med = String(order.medicationName || '').toLowerCase();
        const bName = String(order.branchName || '').toLowerCase();
        const pharm = String(order.responsiblePharmacist || '').toLowerCase();
        const orderNum = String(order.orderNumber || '').toLowerCase();
        return med.includes(q) || bName.includes(q) || pharm.includes(q) || orderNum.includes(q);
      }
      return true;
    });

    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [individualOrders, selectedBranchId, searchQuery, currentUser]);

  // تصدير شيت إكسل فاخر لطلبات الفروع (شيت 1 تنفيذي موحد للموزعين + شيت 2 تفصيلي بالطلبات بدون أرقام العملاء)
  const handleExportExcel = async () => {
    if (filteredItems.length === 0 && filteredIndividualOrders.length === 0) {
      showToast?.('لا توجد بيانات متاحة للتصدير حالياً');
      return;
    }

    setIsExporting(true);
    try {
      const selectedBranchObj = branchesList.find(b => b.id === selectedBranchId);
      const branchNameStr = selectedBranchObj ? selectedBranchObj.name : 'كافة الفروع';

      await exportProcurementOrdersExcel(filteredItems, {
        selectedBranchName: branchNameStr,
        category: categoryScope || categoryFilter,
        individualOrders: filteredIndividualOrders
      });
      showToast?.('📊 تم استخراج وتنزيل شيت إكسل طلبات المشتريات بنجاح بتصميم احترافي وشيت مجمع للموزعين');
    } catch (err) {
      console.error('[Export Excel Error]:', err);
      showToast?.('حدث خطأ أثناء إنشاء شيت الإكسل');
    } finally {
      setIsExporting(false);
    }
  };

  // تطبيق الفلاتر وترتيب الطلبات من الأحدث إلى الأقدم
  const filteredItems = useMemo(() => {
    const items = aggregatedData.filter(item => {
      // عزل الفروع وفق الصلاحيات الممنوحة لمسؤول المشتريات
      if (Array.isArray(currentUser?.allowedBranches) && currentUser.allowedBranches.length > 0 && !currentUser.allBranchesAccess) {
        if (!currentUser.allowedBranches.includes(item.branch_id)) return false;
      }
      if (selectedBranchId !== 'all' && item.branch_id !== selectedBranchId) {
        return false;
      }
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const med = String(item.medication_name || '').toLowerCase();
        const bName = String(item.branch_name || '').toLowerCase();
        return med.includes(q) || bName.includes(q);
      }
      return true;
    });

    return items.sort((a, b) => {
      const getLatest = (it) => {
        if (Array.isArray(it.item_details) && it.item_details.length > 0) {
          const times = it.item_details.map(d => new Date(d.createdAt || d.sentToProcurementAt || 0).getTime());
          return Math.max(...times);
        }
        return 0;
      };
      return getLatest(b) - getLatest(a);
    });
  }, [aggregatedData, selectedBranchId, searchQuery, currentUser]);

  return (
    <div>
      {/* ── نافذة التأكيد المنبثقة الاحترافية ── */}
      <OutstockConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        iconType={confirmConfig.iconType}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        confirmBtnStyle={confirmConfig.confirmBtnStyle}
        badge={confirmConfig.badge}
        details={confirmConfig.details}
        isProcessing={isProcessing}
        onConfirm={() => confirmConfig.onConfirmAction?.()}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* ── شريط الفلاتر واختيار الفرع ونمط العرض والدورات ── */}
      <div className="outstock-card" style={{ padding: '18px', marginBottom: '18px' }}>
        {/* 1. السطر العلوي: اختيار نمط العرض + فلاتر دورات التوريد */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          {/* تبديل نمط العرض: طلبات فردية vs أصناف مجمعة */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
            <button
              type="button"
              onClick={() => setViewMode('individual')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '9px',
                fontSize: '12.5px',
                fontWeight: '800',
                cursor: 'pointer',
                border: 'none',
                background: viewMode === 'individual' ? '#0f766e' : 'transparent',
                color: viewMode === 'individual' ? '#ffffff' : '#475569',
                boxShadow: viewMode === 'individual' ? '0 2px 4px rgba(15, 118, 110, 0.25)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <LayoutList size={15} />
              <span>📋 عرض كل طلب في سطر مستقل (افتراضي)</span>
              <span style={{
                background: viewMode === 'individual' ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                color: viewMode === 'individual' ? '#ffffff' : '#334155',
                fontSize: '11px',
                padding: '1px 7px',
                borderRadius: '10px',
                fontWeight: '900'
              }}>
                {filteredIndividualOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('aggregated')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '9px',
                fontSize: '12.5px',
                fontWeight: '800',
                cursor: 'pointer',
                border: 'none',
                background: viewMode === 'aggregated' ? '#0f766e' : 'transparent',
                color: viewMode === 'aggregated' ? '#ffffff' : '#475569',
                boxShadow: viewMode === 'aggregated' ? '0 2px 4px rgba(15, 118, 110, 0.25)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Layers size={15} />
              <span>📦 عرض الأصناف المجمعة</span>
              <span style={{
                background: viewMode === 'aggregated' ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                color: viewMode === 'aggregated' ? '#ffffff' : '#334155',
                fontSize: '11px',
                padding: '1px 7px',
                borderRadius: '10px',
                fontWeight: '900'
              }}>
                {filteredItems.length}
              </span>
            </button>
          </div>

          {/* فلاتر الدورات وتثبيت المواعيد الافتراضية */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                if (activeCycle === 'morning') {
                  setActiveCycle(null);
                  setCutoffTimeFilter('');
                } else {
                  setActiveCycle('morning');
                  setCutoffTimeFilter(cyclesConfig.morningCutoff || '14:00');
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                border: '1px solid #fde68a',
                background: activeCycle === 'morning' ? '#d97706' : '#fffbeb',
                color: activeCycle === 'morning' ? '#ffffff' : '#92400e',
                boxShadow: activeCycle === 'morning' ? '0 2px 4px rgba(217, 119, 6, 0.25)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title={`تصفية طلبات الدورة الصباحية الواردة حتى ${cyclesConfig.morningCutoff || '14:00'}`}
            >
              <Sun size={14} />
              <span>🌅 دورة الصباح (حتى {cyclesConfig.morningCutoff || '14:00'})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (activeCycle === 'evening') {
                  setActiveCycle(null);
                  setCutoffTimeFilter('');
                } else {
                  setActiveCycle('evening');
                  setCutoffTimeFilter(cyclesConfig.eveningCutoff || '22:00');
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                border: '1px solid #c7d2fe',
                background: activeCycle === 'evening' ? '#4f46e5' : '#eef2ff',
                color: activeCycle === 'evening' ? '#ffffff' : '#3730a3',
                boxShadow: activeCycle === 'evening' ? '0 2px 4px rgba(79, 70, 229, 0.25)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title={`تصفية طلبات الدورة المسائية الواردة حتى ${cyclesConfig.eveningCutoff || '22:00'}`}
            >
              <Moon size={14} />
              <span>🌇 دورة المساء (حتى {cyclesConfig.eveningCutoff || '22:00'})</span>
            </button>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f8fafc', padding: '4px 8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <Clock size={13} color="#64748b" />
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>حتى وقت:</span>
              <input
                type="time"
                value={cutoffTimeFilter}
                onChange={(e) => {
                  setActiveCycle(null);
                  setCutoffTimeFilter(e.target.value);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '12px',
                  fontWeight: '800',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
              {cutoffTimeFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveCycle(null);
                    setCutoffTimeFilter('');
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '1px' }}
                  title="إلغاء فلتر التوقيت"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* زر تثبيت مواعيد الدورات الافتراضية */}
            <button
              type="button"
              onClick={() => setIsCyclesModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '11.5px',
                fontWeight: '800',
                cursor: 'pointer',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155'
              }}
              title="تحديد وتثبيت مواعيد الإغلاق للدورة الصباحية والمسائية"
            >
              <Settings size={13} color="#64748b" />
              <span>تثبيت مواعيد الدورات</span>
            </button>
          </div>
        </div>

        {/* 2. السطر الأوسط: فلاتر حالة الطلب والتصنيف */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          {/* أزرار فلتر حالة الطلب */}
          <div style={{ display: 'flex', gap: '4px', background: '#f8fafc', padding: '3px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
            <button
              type="button"
              onClick={() => setStatusFilter('all_active')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                border: 'none',
                background: statusFilter === 'all_active' ? '#1e293b' : 'transparent',
                color: statusFilter === 'all_active' ? '#ffffff' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              <span>🌐 الكل النشط</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                border: 'none',
                background: statusFilter === 'pending' ? '#d97706' : 'transparent',
                color: statusFilter === 'pending' ? '#ffffff' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              <span>⏳ بانتظار القرار</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('in_preparation')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                border: 'none',
                background: statusFilter === 'in_preparation' ? '#0284c7' : 'transparent',
                color: statusFilter === 'in_preparation' ? '#ffffff' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              <span>🚚 قيد التجهيز</span>
            </button>
          </div>

          {/* أزرار فلتر تصنيف الصنف (أصناف دوائية افتراضياً / مستحضرات / الكل) */}
          {!categoryScope ? (
            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => setCategoryFilter('medication')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: 'none',
                  background: categoryFilter === 'medication' ? '#059669' : 'transparent',
                  color: categoryFilter === 'medication' ? '#ffffff' : '#475569',
                  boxShadow: categoryFilter === 'medication' ? '0 2px 4px rgba(5, 150, 105, 0.25)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Pill size={14} />
                <span>أصناف دوائية 💊 (افتراضي)</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('cosmetics')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: 'none',
                  background: categoryFilter === 'cosmetics' ? '#db2777' : 'transparent',
                  color: categoryFilter === 'cosmetics' ? '#ffffff' : '#475569',
                  boxShadow: categoryFilter === 'cosmetics' ? '0 2px 4px rgba(219, 39, 119, 0.25)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Sparkles size={14} />
                <span>مستحضرات تجميل 💄</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: 'none',
                  background: categoryFilter === 'all' ? '#1e293b' : 'transparent',
                  color: categoryFilter === 'all' ? '#ffffff' : '#475569',
                  boxShadow: categoryFilter === 'all' ? '0 2px 4px rgba(30, 41, 59, 0.25)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🌐 كافة الأصناف</span>
              </button>
            </div>
          ) : (
            <div
              style={{
                background: '#fdf2f8',
                border: '1px solid #fbcfe8',
                color: '#be185d',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={14} />
              <span>نطاق الصلاحية: مستحضرات تجميل وعناية فقط 💄</span>
            </div>
          )}
        </div>

        {/* 3. السطر السفلي: البحث واختيار الفرع وتصدير الإكسل والتحديث والمزامنة */}
        <div className="outstock-filters-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap', minWidth: '240px' }}>
            <div className="outstock-search-bar" style={{ flex: 1, minWidth: '180px' }}>
              <Search size={18} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="🔍 ابحث باسم الدواء، الفرع، الصيدلي، أو رقم الطلب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outstock-search-input"
              />
            </div>

            {/* قائمة اختيار الفرع المحدد */}
            <div style={{ minWidth: '170px', flexShrink: 0 }}>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="outstock-form-select"
                style={{ height: '42px', fontWeight: 'bold' }}
              >
                <option value="all">🏢 جميع الفروع ({branchesList.length})</option>
                {branchesList.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* زر تصدير شيت إكسل فاخر */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleExportExcel}
              disabled={isExporting || (filteredItems.length === 0 && filteredIndividualOrders.length === 0)}
              style={{
                background: '#f0fdf4',
                borderColor: '#86efac',
                color: '#15803d',
                fontWeight: '800'
              }}
              title="تصدير شيت إكسل رسمي وشامل: شيت 1 تنفيذي موحد للموزعين + شيت 2 تفصيلي بالطلبات الفردية مع حجب أرقام العملاء للخصوصية"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  <span>جاري التصدير...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={16} style={{ color: '#16a34a' }} />
                  <span>تصدير إكسل (أمر شراء موحد للموزعين)</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={() => fetchAggregatedOrders()}
              title="تحديث البيانات لحظياً"
            >
              <RefreshCw size={15} />
              <span>تحديث</span>
            </button>

            {/* مؤشر المزامنة اللحظية الفورية مع توقيت الثواني */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '10px',
                background: '#f0fdfa',
                border: '1px solid #99f6e4',
                color: '#0f766e',
                fontSize: '12px',
                fontWeight: '700'
              }}
              title="تحديث لحظي مستمر للطلبات فور تسجيلها بالفروع"
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#0d9488',
                  boxShadow: '0 0 6px #0d9488',
                  display: 'inline-block'
                }}
              />
              <span>آخر مزامنة:</span>
              <span style={{ direction: 'ltr', fontFamily: 'monospace', fontWeight: '800', fontSize: '13px' }}>
                {formattedSyncTime} ⚡
              </span>
            </div>

            {Object.keys(decisions).filter(k => decisions[k]).length > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                className="outstock-btn outstock-btn-primary"
                onClick={handleBatchSubmit}
                style={{ fontWeight: '800' }}
              >
                <Send size={15} />
                <span>إرسال القرارات ({Object.keys(decisions).filter(k => decisions[k]).length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── نمط العرض الأول (الافتراضي): كارت جدول طلبات الفروع الفردية (سطر لكل طلب فرع) ── */}
      {viewMode === 'individual' ? (
        <div className="outstock-card">
          <div className="outstock-card-header">
            <h3 className="outstock-card-title">
              <LayoutList size={20} color="#0d9488" />
              <span>📋 طلبات الفروع الفردية المفصلة (سطر مستقل لكل طلب)</span>
              <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
                ({filteredIndividualOrders.length} طلب)
              </span>
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>
              ⚡ عرض تفصيلي لحظي
            </div>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <Loader2 size={32} className="spinner" style={{ margin: '0 auto 10px', color: '#0d9488' }} />
              <div>جاري تحميل طلبات الفروع الفردية...</div>
            </div>
          ) : filteredIndividualOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>✨</div>
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
                لا توجد طلبات فرعية معلقة حالياً
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                كافة طلبات الأدوية والمستحضرات تم البت فيها بنجاح.
              </p>
            </div>
          ) : (
            <div className="outstock-table-wrap">
              <table className="outstock-table">
                <thead>
                  <tr>
                    <th>الفرع الطالب والصيدلي 🏢</th>
                    <th>اسم المستحضر / الصنف 💊</th>
                    <th>الوحدة</th>
                    <th>الكمية المطلوبة 🔢</th>
                    <th>ملاحظات واستعجال 📝</th>
                    <th>الحالة الحالية 📊</th>
                    <th>القرار السريع لإدارة المشتريات ⚡</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIndividualOrders.map((order, idx) => {
                    const isStock = order.isBranchStock || order.orderType === 'branch';
                    return (
                      <tr key={order.itemId || idx} style={{ transition: 'background 0.15s' }}>
                        {/* 1. الفرع الطالب والصيدلي + نوع الطلب وتاريخ ووقت الإرسال مدمجين بالأسفل */}
                        <td style={{ minWidth: '190px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: '#f0fdfa',
                              border: '1px solid #ccfbf1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#0d9488',
                              flexShrink: 0,
                              marginTop: '2px'
                            }}>
                              <Building2 size={16} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {/* اسم الفرع */}
                              <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13.5px', lineHeight: 1.3 }}>
                                {order.branchName || order.branchId}
                              </div>
                              {/* الصيدلي المسؤول */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '11px' }}>
                                <User size={12} />
                                <span>الصيدلي: {order.responsiblePharmacist || 'صيدلي الفرع'}</span>
                              </div>
                              {/* نوع الطلب */}
                              <div style={{ marginTop: '2px' }}>
                                {isStock ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    border: '1px solid #fde68a'
                                  }}>
                                    🏢 عجز رفوف للفرع
                                  </span>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                    border: '1px solid #bae6fd'
                                  }}>
                                    👤 طلب عميل نقدي (طلب #{order.orderNumber})
                                  </span>
                                )}
                              </div>
                              {/* تاريخ ووقت الإرسال */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontWeight: '700', fontSize: '11px', marginTop: '1px' }}>
                                <Clock size={12} color="#0d9488" />
                                <span>{formatDateTime(order.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. اسم المستحضر وتصنيفه وصورته - التفاف سطر ذكي لمنع التمدد الأفقي */}
                        <td style={{ minWidth: '160px', maxWidth: '280px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}>
                            <div style={{
                              fontWeight: '900',
                              fontSize: '14px',
                              color: '#0f172a',
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                              whiteSpace: 'normal',
                              lineHeight: 1.4
                            }}>
                              {order.medicationName}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              {order.itemType === 'cosmetics' ? (
                                <span style={{ fontSize: '10.5px', background: '#fce7f3', color: '#be185d', padding: '2px 6px', borderRadius: '5px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                  💄 تجميل
                                </span>
                              ) : (
                                <span style={{ fontSize: '10.5px', background: '#ecfdf5', color: '#047857', padding: '2px 6px', borderRadius: '5px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                  💊 دوائي
                                </span>
                              )}
                              {order.medicationImageUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewOrderImageUrl(order.medicationImageUrl);
                                    setPreviewOrderImageTitle(`${order.medicationName} - فرع ${order.branchName || ''}`);
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    background: '#ecfeff',
                                    color: '#0891b2',
                                    border: '1px solid #a5f3fc',
                                    fontSize: '10.5px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="عرض صورة الدواء أو الروشتة المرفقة"
                                >
                                  <Camera size={12} color="#0891b2" />
                                  <span>📷 صورة</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 3. الوحدة */}
                        <td>
                          <span className="outstock-badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                            {order.unitType === 'strip' ? 'شريط' : 'علبة'}
                          </span>
                        </td>

                        {/* 6. الكمية المطلوبة */}
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            background: '#ecfeff',
                            color: '#0e7490',
                            fontWeight: '900',
                            fontSize: '14px',
                            border: '1px solid #cffafe'
                          }}>
                            <Package size={14} />
                            {order.quantity}
                          </span>
                        </td>

                        {/* 7. ملاحظات الصيدلي ومستوى الاستعجال */}
                        <td>
                          <div style={{ maxWidth: '240px' }}>
                            {order.urgencyLevel === 'urgent' && (
                              <span style={{
                                display: 'inline-block',
                                background: '#fee2e2',
                                color: '#b91c1c',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '800',
                                marginBottom: '3px'
                              }}>
                                🔥 عاجل جداً
                              </span>
                            )}
                            <div style={{ fontSize: '12px', color: '#475569', wordBreak: 'break-word' }}>
                              {order.pharmacistNotes || '-'}
                            </div>
                          </div>
                        </td>

                        {/* 8. الحالة الحالية */}
                        <td>
                          {order.itemStatus === 'in_preparation' ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#e0f2fe',
                              color: '#0284c7',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: '800',
                              fontSize: '11.5px',
                              border: '1px solid #bae6fd'
                            }}>
                              <Truck size={13} />
                              <span>قيد التجهيز والشحن 🚚</span>
                            </span>
                          ) : order.itemStatus === 'available' ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#dcfce7',
                              color: '#15803d',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: '800',
                              fontSize: '11.5px',
                              border: '1px solid #bbf7d0'
                            }}>
                              <CheckCircle2 size={13} />
                              <span>متوفر بالفرع ✅</span>
                            </span>
                          ) : order.itemStatus === 'unavailable' ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: '800',
                              fontSize: '11.5px',
                              border: '1px solid #fecaca'
                            }}>
                              <XCircle size={13} />
                              <span>غير متوفر ❌</span>
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#fef3c7',
                              color: '#92400e',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: '800',
                              fontSize: '11.5px',
                              border: '1px solid #fde68a'
                            }}>
                              <Clock size={13} />
                              <span>بانتظار القرار ⏳</span>
                            </span>
                          )}
                        </td>

                        {/* 9. القرار السريع الفردي لكل بند */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {/* زر متوفر */}
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleQuickOrderAction(order, 'available')}
                              disabled={!canChangeStatus || isProcessing}
                              style={{
                                padding: '5px 9px',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                borderColor: '#86efac',
                                color: '#15803d',
                                background: '#f0fdf4'
                              }}
                              title="توفير الصنف وشحنه فورياً لرصيد الفرع"
                            >
                              <CheckCircle2 size={13} />
                              <span>متوفر</span>
                            </button>

                            {/* زر قيد التجهيز */}
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleQuickOrderAction(order, 'in_preparation')}
                              disabled={!canChangeStatus || isProcessing}
                              style={{
                                padding: '5px 9px',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                borderColor: '#7dd3fc',
                                color: '#0369a1',
                                background: '#f0f9ff'
                              }}
                              title="وضع الطلب قيد التجهيز والشحن مع قفل التسليم على الفرع"
                            >
                              <Truck size={13} />
                              <span>قيد التجهيز 🚚</span>
                            </button>

                            {/* زر غير متوفر */}
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleQuickOrderAction(order, 'unavailable')}
                              disabled={!canChangeStatus || isProcessing}
                              style={{
                                padding: '5px 9px',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                borderColor: '#fca5a5',
                                color: '#b91c1c',
                                background: '#fef2f2'
                              }}
                              title="شطب الصنف وتحديد السبب واقتراح البدائل الذكية"
                            >
                              <XCircle size={13} />
                              <span>غير متوفر</span>
                            </button>

                            {/* زر تعديل الكمية */}
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleOpenAdjustOrderModal(order)}
                              disabled={!canChangeStatus || isProcessing}
                              style={{
                                padding: '5px 8px',
                                fontSize: '11.5px',
                                borderColor: '#fde68a',
                                color: '#b45309',
                                background: '#fffbeb'
                              }}
                              title="تعديل الكمية المعتمدة وتدوين الملاحظات"
                            >
                              <Edit3 size={13} />
                            </button>

                            {/* زر تحويل الصنف */}
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleConvertOrderTypePrompt(order)}
                              disabled={!canChangeStatus || isProcessing}
                              style={{
                                padding: '5px 8px',
                                fontSize: '11.5px',
                                borderColor: order.itemType === 'cosmetics' ? '#bae6fd' : '#fbcfe8',
                                color: order.itemType === 'cosmetics' ? '#0284c7' : '#db2777',
                                background: order.itemType === 'cosmetics' ? '#f0f9ff' : '#fdf2f8'
                              }}
                              title={order.itemType === 'cosmetics' ? 'تحويل لدوائي' : 'تحويل لتجميل'}
                            >
                              {order.itemType === 'cosmetics' ? <Pill size={13} /> : <Sparkles size={13} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ── نمط العرض الثاني: جدول الطلبات المجمعة لكل فرع ── */
        <div className="outstock-card">
          <div className="outstock-card-header">
            <h3 className="outstock-card-title">
              <span>📦 طلبات الأدوية المجمعة حسب الفرع</span>
              <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
                ({filteredItems.length} صنف مطلوب للشراء)
              </span>
            </h3>
            {filteredItems.length > 0 && (
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>
                ⚡ المزامنة اللحظية نشطة
              </div>
            )}
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <Loader2 size={32} className="spinner" style={{ margin: '0 auto 10px', color: '#0d9488' }} />
              <div>جاري تجميع طلبات الفروع...</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>✨</div>
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
                لا توجد طلبات أدوية جديدة معلقة من الفروع
              </h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                تم الرد على وتوريد كافة طلبات الأدوية الواردة من الصيدليات بنجاح.
              </p>
            </div>
          ) : (
            <div className="outstock-table-wrap">
              <table className="outstock-table">
                <thead>
                  <tr>
                    <th>الفرع الطالب</th>
                    <th>صنف الدواء</th>
                    <th>الوحدة المطلوبة</th>
                    <th>إجمالي الكمية</th>
                    <th>عدد طلبات العملاء</th>
                    <th>القرار السريع لإدارة المشتريات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const key = `${item.branch_id}_${item.medication_name}_${item.unit_type}`;
                    const decision = decisions[key];

                    return (
                      <tr
                        key={idx}
                        className={
                          decision === 'available'
                            ? 'table-row-selected'
                            : decision === 'unavailable'
                            ? 'table-row-danger'
                            : ''
                        }
                      >
                        {/* الفرع */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: '#f0fdfa',
                              border: '1px solid #ccfbf1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#0d9488'
                            }}>
                              <Building2 size={16} />
                            </div>
                            <div>
                              <div style={{ fontWeight: '800', color: 'var(--text, #0f172a)' }}>
                                {item.branch_name || item.branch_id}
                              </div>
                              {(item.item_details || []).some(d => d.isTransferred) ? (
                                <small style={{ color: '#7c3aed', fontSize: '11px', fontWeight: '800' }}>
                                  فرع الاستلام (محول إليه) 🔄
                                </small>
                              ) : (
                                <small style={{ color: 'var(--muted, #64748b)', fontSize: '11px' }}>
                                  فرع صيدلية معتمد
                                </small>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* صنف الدواء */}
                        <td style={{ minWidth: '160px', maxWidth: '300px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}>
                            <div style={{
                              fontWeight: '900',
                              fontSize: '14px',
                              color: '#0d9488',
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                              whiteSpace: 'normal',
                              lineHeight: 1.4
                            }}>
                              {item.medication_name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {item.item_type === 'cosmetics' ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedCosmeticsItem(item)}
                                  style={{
                                    fontSize: '11px',
                                    background: '#fce7f3',
                                    color: '#be185d',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontWeight: '800',
                                    border: '1px solid #fbcfe8',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="عرض وتعديل مواصفات مستحضر التجميل، الماركة، وطريقة الاستخدام 💄"
                                >
                                  <span>💄 بطاقة المستحضر</span>
                                </button>
                            ) : (
                              <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: '6px', fontWeight: '800' }}>
                                💊 دواء
                              </span>
                            )}
                            {Boolean(item.order_type === 'branch' || (item.item_details || []).some(d => d.orderType === 'branch')) && (
                              <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: '6px', fontWeight: '800' }}>
                                🏢 طلب فرع
                              </span>
                            )}
                            {Boolean((item.item_details || []).some(d => d.isTransferred)) && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  background: '#f5f3ff',
                                  color: '#6d28d9',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontWeight: '800',
                                  border: '1px solid #ddd6fe'
                                }}
                                title={(item.item_details || [])
                                  .filter(d => d.isTransferred)
                                  .map(d => `طلب #${d.orderNumber}: محرر بفرع [${d.sourceBranchName || 'آخر'}] ومحول للاستلام بهذا الفرع`)
                                  .join(' | ')}
                              >
                                🔄 محول للاستلام بهذا الفرع
                              </span>
                            )}
                            {(() => {
                              const attachedImg = item.medication_image_url || (item.item_details || []).find(d => d.medicationImageUrl)?.medicationImageUrl;
                              if (!attachedImg) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewOrderImageUrl(attachedImg);
                                    setPreviewOrderImageTitle(`${item.medication_name} - ${item.branch_name || ''}`);
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: '#ecfeff',
                                    color: '#0891b2',
                                    border: '1px solid #a5f3fc',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                  }}
                                  title="عرض صورة الدواء أو الروشتة المرفقة بطلب العميل"
                                >
                                  <Camera size={13} color="#0891b2" />
                                  <span>📷 روشتة / صورة مرفقة</span>
                                </button>
                              );
                            })()}
                          </div>
                            <small style={{ color: 'var(--muted, #64748b)', fontSize: '11px' }}>
                              {(item.order_type === 'branch' || (item.item_details || []).some(d => d.orderType === 'branch'))
                                ? 'نواقص مخزن الفرع الداخلي'
                                : 'مسجل كحجز مسبق للعملاء'}
                            </small>
                          </div>
                        </td>

                        {/* الوحدة */}
                        <td>
                          <span className="outstock-badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                            {item.unit_type === 'strip' ? 'شريط' : 'علبة'}
                          </span>
                        </td>

                        {/* إجمالي الكمية المطلوبة */}
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            background: '#ecfeff',
                            color: '#0e7490',
                            fontWeight: '900',
                            fontSize: '14.5px',
                            border: '1px solid #cffafe'
                          }}>
                            <Package size={14} />
                            {item.total_requested_qty}
                          </span>
                        </td>

                        {/* عدد طلبات العملاء */}
                        <td>
                          <span className="outstock-badge partial">
                            {item.orders_count} عميل بانتظار التوفير
                          </span>
                        </td>

                        {/* أزرار اتخاذ القرار المباشرة */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {/* 1. متوفر بالفرع */}
                            <button
                              type="button"
                              className={`outstock-btn ${decision === 'available' ? 'outstock-btn-success' : 'outstock-btn-secondary'}`}
                              onClick={() => canChangeStatus ? handleSetDecision(key, 'available') : showToast?.('⛔ ليس لديك صلاحية تغيير أو اتخاذ قرارات بشأن حالة الطلبات')}
                              disabled={!canChangeStatus}
                              style={{
                                padding: '6px 10px',
                                fontSize: '12px',
                                borderColor: decision === 'available' ? '#059669' : '#a7f3d0',
                                color: decision === 'available' ? '#ffffff' : '#047857',
                                background: decision === 'available' ? '#059669' : '#f0fdf4',
                                opacity: !canChangeStatus ? 0.45 : 1,
                                cursor: !canChangeStatus ? 'not-allowed' : 'pointer'
                              }}
                              title={!canChangeStatus ? 'ليس لديك صلاحية اتخاذ قرارات التوفير' : 'تحديد الصنف كمتوفر وإضافته لدفعة الإرسال'}
                            >
                              <CheckCircle2 size={14} />
                              <span>متوفر</span>
                            </button>

                            {/* 2. قيد التجهيز 🚚 */}
                            <button
                              type="button"
                              className={`outstock-btn ${decision === 'in_preparation' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
                              onClick={() => canChangeStatus ? handleSetDecision(key, 'in_preparation', item) : showToast?.('⛔ ليس لديك صلاحية')}
                              disabled={!canChangeStatus}
                              style={{
                                padding: '6px 10px',
                                fontSize: '12px',
                                borderColor: decision === 'in_preparation' ? '#0284c7' : '#7dd3fc',
                                color: decision === 'in_preparation' ? '#ffffff' : '#0369a1',
                                background: decision === 'in_preparation' ? '#0284c7' : '#f0f9ff',
                                opacity: !canChangeStatus ? 0.45 : 1,
                                cursor: !canChangeStatus ? 'not-allowed' : 'pointer'
                              }}
                              title={!canChangeStatus ? 'ليس لديك صلاحية' : 'تحديد الصنف كقيد التجهيز والشحن للفرع'}
                            >
                              <Truck size={14} />
                              <span>قيد التجهيز 🚚</span>
                            </button>

                            {/* 3. غير متوفر بالسوق */}
                            <button
                              type="button"
                              className={`outstock-btn ${decision === 'unavailable' ? 'outstock-btn-danger' : 'outstock-btn-secondary'}`}
                              onClick={() => canChangeStatus ? handleSetDecision(key, 'unavailable', item) : showToast?.('⛔ ليس لديك صلاحية شطب الأصناف أو تغيير حالتها')}
                              disabled={!canChangeStatus}
                              style={{
                                padding: '6px 10px',
                                fontSize: '12px',
                                borderColor: decision === 'unavailable' ? '#dc2626' : '#fecdd3',
                                color: decision === 'unavailable' ? '#ffffff' : '#be123c',
                                background: decision === 'unavailable' ? '#dc2626' : '#fff1f2',
                                opacity: !canChangeStatus ? 0.45 : 1,
                                cursor: !canChangeStatus ? 'not-allowed' : 'pointer'
                              }}
                              title={!canChangeStatus ? 'ليس لديك صلاحية شطب الأصناف' : 'تحديد الصنف كغير متوفر بالسوق وشطبه'}
                            >
                              <XCircle size={14} />
                              <span>غير متوفر</span>
                            </button>

                            {/* 4. تعديل الكمية وإضافة ملاحظات المشتريات */}
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => canChangeStatus ? handleOpenAdjustModal(item) : showToast?.('⛔ ليس لديك صلاحية تعديل كميات طلبات الفروع')}
                              disabled={!canChangeStatus}
                              style={{
                                padding: '6px 10px',
                                fontSize: '12px',
                                borderColor: '#fde68a',
                                color: '#b45309',
                                background: '#fffbeb',
                                opacity: !canChangeStatus ? 0.45 : 1,
                                cursor: !canChangeStatus ? 'not-allowed' : 'pointer'
                              }}
                              title={!canChangeStatus ? 'ليس لديك صلاحية تعديل الكميات' : 'تعديل الكمية المعتمدة وتدوين ملاحظات مدير المشتريات / مسؤول المستحضرات وإشعار الصيدلية'}
                            >
                              <Edit3 size={14} />
                              <span>تعديل</span>
                            </button>

                            {/* 5. زر تحويل وتصحيح نوع الصنف (دوائي <-> تجميل) لنقله للمسؤول المختص فوراً وتصحيح خطأ الصيدلي */}
                            {item.item_type === 'cosmetics' ? (
                              <button
                                type="button"
                                className="outstock-btn outstock-btn-secondary"
                                onClick={() => handleConvertItemTypePrompt(item, 'medication')}
                                disabled={isProcessing}
                                style={{
                                  padding: '6px 9px',
                                  fontSize: '12px',
                                  borderColor: '#bae6fd',
                                  color: '#0369a1',
                                  background: '#f0f9ff',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="تصحيح تصنيف الصنف من تجميل إلى (صنف دوائي) ونقله فوراً لشاشة مدير المشتريات"
                              >
                                <Pill size={14} color="#0284c7" />
                                <span>دوائي</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="outstock-btn outstock-btn-secondary"
                                onClick={() => handleConvertItemTypePrompt(item, 'cosmetics')}
                                disabled={isProcessing}
                                style={{
                                  padding: '6px 9px',
                                  fontSize: '12px',
                                  borderColor: '#fbcfe8',
                                  color: '#db2777',
                                  background: '#fdf2f8',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="تصحيح تصنيف الصنف من دواء إلى (مستحضرات تجميل) ونقله فوراً لشاشة مسؤول التجميل"
                              >
                                <Sparkles size={14} color="#db2777" />
                                <span>تجميل</span>
                              </button>
                            )}

                            {/* زر الإرسال السريع الفردي في حال رغبة الصيدلي في إنهاء بند واحد فوراً */}
                            {decision && (
                              <button
                                type="button"
                                className="outstock-btn outstock-btn-primary"
                                onClick={() => handleQuickAction(item, decision)}
                                disabled={isProcessing}
                                style={{ padding: '6px 10px', fontSize: '11.5px', fontWeight: '800' }}
                                title="إرسال القرار لهذا الصنف فوراً ومزامنة الفرع"
                              >
                                <Send size={12} />
                                <span>إرسال</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── نافذة معاينة صورة الروشتة / الدواء المرفقة بطلب العميل (Lightbox) ── */}
      {previewOrderImageUrl && (
        <div
          className="outstock-modal-backdrop"
          style={{ zIndex: 99999, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPreviewOrderImageUrl(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="#0d9488" />
                <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '14px' }}>
                  معاينة صورة طلب العميل: {previewOrderImageTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOrderImageUrl(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewOrderImageUrl}
              alt="صورة طلب العميل"
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                borderRadius: '8px',
                objectFit: 'contain',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
          </div>
        </div>
      )}

      {/* ── نافذة بطاقة ومواصفات مستحضر التجميل الفاخرة ── */}
      {selectedCosmeticsItem && (
        <CosmeticsProductModal
          isOpen={Boolean(selectedCosmeticsItem)}
          item={selectedCosmeticsItem}
          onClose={() => setSelectedCosmeticsItem(null)}
          showToast={showToast}
        />
      )}

      {/* ── نافذة تعديل كمية الصنف واعتمادها بالمشتريات (المتطلب 20) ── */}
      {adjustingItemModalData && (
        <div
          className="outstock-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px'
          }}
          onClick={() => !isProcessing && setAdjustingItemModalData(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '560px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* رأس النافذة */}
            <div style={{
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              padding: '18px 24px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Edit3 size={20} color="#ffffff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                    تعديل كمية الصنف واعتمادها
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
                    اعتماد كمية مخصصة للصيدلية وتدوين ملاحظات المشتريات وإشعار الواتساب
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isProcessing && setAdjustingItemModalData(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* محتوى النافذة */}
            <div style={{ padding: '20px 24px', maxHeight: '75vh', overflowY: 'auto' }}>
              {/* ملخص الصنف والفرع */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>الصنف:</span>
                  <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                    {adjustingItemModalData.item.medication_name}
                  </strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>الفرع المستلم:</span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#0d9488' }}>
                    {adjustingItemModalData.item.branch_name || adjustingItemModalData.item.branch_id}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>إجمالي الكمية المطلوبة بالفرع:</span>
                  <span style={{
                    background: '#ecfeff',
                    color: '#0e7490',
                    padding: '2px 10px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '900',
                    border: '1px solid #cffafe'
                  }}>
                    {adjustingItemModalData.item.total_requested_qty} {adjustingItemModalData.item.unit_type === 'strip' ? 'شريط' : 'علبة'}
                  </span>
                </div>
              </div>

              {/* إذا كان هناك تفصيل للطلبات */}
              {(adjustingItemModalData.item.item_details || []).length > 1 ? (
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>
                    توزيع الكمية المعتمدة لكل طلب عميل / فرع:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {adjustingItemModalData.item.item_details.map(d => {
                      const currentVal = adjustingItemModalData.perOrderAdjustments[d.itemId] != null
                        ? adjustingItemModalData.perOrderAdjustments[d.itemId]
                        : d.quantity;
                      return (
                        <div
                          key={d.itemId}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                              طلب #{d.orderNumber} ({d.customerName})
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              المطلوب: {d.quantity} {adjustingItemModalData.item.unit_type === 'strip' ? 'شريط' : 'علبة'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#475569' }}>المعتمد:</span>
                            <input
                              type="number"
                              min="1"
                              max={d.quantity}
                              value={currentVal}
                              onChange={e => {
                                const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10));
                                setAdjustingItemModalData(prev => ({
                                  ...prev,
                                  perOrderAdjustments: {
                                    ...prev.perOrderAdjustments,
                                    [d.itemId]: val
                                  }
                                }));
                              }}
                              style={{
                                width: '70px',
                                padding: '6px 8px',
                                border: '2px solid #cbd5e1',
                                borderRadius: '8px',
                                textAlign: 'center',
                                fontWeight: '800',
                                fontSize: '14px',
                                color: '#0d9488'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '6px' }}>
                    الكمية المعتمدة والمتوفرة ({adjustingItemModalData.item.unit_type === 'strip' ? 'شريط' : 'علبة'}):
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={adjustingItemModalData.approvedQty}
                    onChange={e => {
                      const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10));
                      setAdjustingItemModalData(prev => ({ ...prev, approvedQty: val }));
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '2px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '15px',
                      fontWeight: '800',
                      color: '#0f172a'
                    }}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    الكمية المطلوبة أصلاً كانت ({adjustingItemModalData.item.total_requested_qty}). سيتم تعديل كمية الطلب واحتساب الفارق المالي تلقائياً.
                  </small>
                </div>
              )}

              {/* ملحوظات مدير المشتريات / مسؤول المستحضرات */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '6px' }}>
                  💬 ملحوظات المشتريات (تظهر للفرع وفي إشعار الواتساب):
                </label>
                <textarea
                  rows="3"
                  value={adjustingItemModalData.notes}
                  onChange={e => setAdjustingItemModalData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="مثال: تم اعتماد وتوفير جزء من الكمية المطلوبة نظراً لعدم توفر الحصص الكاملة لدى الوكيل حالياً..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '2px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* تنبيه الأمان والمزامنة */}
              <div style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: '#92400e'
              }}>
                <AlertCircle size={16} />
                <span>
                  عند الاعتماد، سيتم تحديث الكمية في فاتورة الفرع وإعادة احتساب المبالغ المالية فورياً وإرسال رسالة واتساب رسمية لرقم الفرع مع توضيح الملاحظات.
                </span>
              </div>
            </div>

            {/* أزرار الإجراء */}
            <div style={{
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              padding: '14px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setAdjustingItemModalData(null)}
                disabled={isProcessing}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmAdjustQuantity}
                disabled={isProcessing}
                style={{
                  padding: '8px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#0d9488',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                <span>اعتماد التعديل والتوفير وإشعار الفرع 🚀</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة شطب الصنف وتحديد سبب عدم التوفر والبدائل الذكية (DrugEye) ── */}
      <ItemUnavailabilityModal
        isOpen={Boolean(unavailabilityModalItem)}
        item={unavailabilityModalItem}
        onClose={() => setUnavailabilityModalItem(null)}
        onConfirm={handleConfirmUnavailability}
        isProcessing={isProcessing}
      />

      {/* ── نافذة تثبيت وتحديد مواعيد الدورات الافتراضية (دورة الصباح ودورة المساء) ── */}
      <ProcurementCyclesModal
        isOpen={isCyclesModalOpen}
        onClose={() => setIsCyclesModalOpen(false)}
        currentConfig={cyclesConfig}
        onSaved={(newCfg) => {
          setCyclesConfig(newCfg);
          fetchAggregatedOrders();
        }}
        showToast={showToast}
      />
    </div>
  );
}
