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
  Edit3
} from 'lucide-react';
import {
  outstockGetProcurementAggregated,
  outstockProcurementItemAction,
  outstockProcurementBatchItemActions,
  listenToOutstockLocalMessages
} from '../../../utils/outstockApiClient';
import { exportProcurementOrdersExcel } from '../../../utils/outstockExcelExporter';
import OutstockConfirmModal from '../common/OutstockConfirmModal';
import CosmeticsProductModal from '../common/CosmeticsProductModal';
import { getSocket } from '../../../utils/socketClient';

/**
 * ProcurementOrdersTab.jsx
 * شاشة طلبات الفروع المجمعة لإدارة المشتريات
 * - استلام أصناف مجمعة لكل فرع على حدة (Aggregated Item Model)
 * - فلتر الصنف: أدوية (افتراضي) / مستحضرات / الكل مع تصدير إكسل مخصص
 * - دعم صلاحية مسؤول مستحضرات التجميل
 * - تحديد ما تم توفيره بالفرع وما هو غير متوفر بالسوق
 * - شحن الأصناف المتوفرة لرصيد الفرع، أو شطب غير المتوفر وتحويله لنواقص الصيدلية
 * - تصدير شيت إكسل فاخر بتصميم احترافي (Dual-Sheet Executive Excel)
 * - نافذة تأكيد منبثقة احترافية بدلاً من window.confirm
 * - مزامنة لحظية فورية عبر WebSockets عند تسجيل أي طلب بالفرع
 */
export default function ProcurementOrdersTab({ showToast, categoryScope = null }) {
  const [aggregatedData, setAggregatedData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(() => categoryScope || 'medication'); // 'medication' | 'cosmetics' | 'all'
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewOrderImageUrl, setPreviewOrderImageUrl] = useState(null);
  const [previewOrderImageTitle, setPreviewOrderImageTitle] = useState('');
  const [selectedCosmeticsItem, setSelectedCosmeticsItem] = useState(null);

  // حالة نافذة تعديل كمية الصنف وملاحظات المشتريات (المتطلب 20)
  const [adjustingItemModalData, setAdjustingItemModalData] = useState(null);

  // قرارات الشراء المعلقة قبل الإرسال (Staged Decisions)
  // Map of `${branchId}_${medicationName}_${unitType}` -> 'available' | 'unavailable'
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

  const fetchAggregatedOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const activeCat = categoryScope || categoryFilter;
      const res = await outstockGetProcurementAggregated({ category: activeCat });
      if (res?.success && Array.isArray(res.aggregated)) {
        setAggregatedData(res.aggregated);
      }
      setLastSyncTime(new Date());
    } catch (e) {
      console.warn('Fetch aggregated orders error:', e);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [categoryFilter, categoryScope]);

  useEffect(() => {
    fetchAggregatedOrders();

    // 1. الاستماع اللحظي لأحداث Socket.io للمزامنة الفورية مع الفروع
    const socket = getSocket();
    const handleLiveOrder = () => {
      fetchAggregatedOrders(true);
    };

    if (socket) {
      socket.on('outstock:order_created', handleLiveOrder);
      socket.on('outstock:items_status_updated', handleLiveOrder);
      socket.on('outstock:item_restocked', handleLiveOrder);
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
      }
      unsubscribeLocal?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(pollInterval);
    };
  }, [fetchAggregatedOrders]);

  // استخراج قائمة الفروع الفريدة
  const branchesList = useMemo(() => {
    const map = new Map();
    aggregatedData.forEach(item => {
      if (item.branch_id && !map.has(item.branch_id)) {
        map.set(item.branch_id, item.branch_name || item.branch_id);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [aggregatedData]);

  // تعيين قرار لصنف معين
  const handleSetDecision = (key, action) => {
    setDecisions(prev => ({
      ...prev,
      [key]: prev[key] === action ? undefined : action
    }));
  };

  // إرسال قرار فردي فوري بنافذة تأكيد منبثقة
  const handleQuickAction = (item, action) => {
    const isAvailable = action === 'available';
    const actionLabel = isAvailable ? 'توفير الصنف وشحنه لرصيد الفرع' : 'تحديد الصنف كغير متوفر وشطبه من الفواتير';
    const unitLabel = item.unit_type === 'strip' ? 'شريط' : 'علبة';

    setConfirmConfig({
      isOpen: true,
      title: isAvailable ? 'تأكيد توفير الصنف بالفرع' : 'تأكيد عدم توفر الصنف بالسوق',
      message: `هل أنت متأكد من ${actionLabel}؟ سيتم تحديث رصيد الفرع وفواتير العملاء ومزامنتها لحظياً.`,
      iconType: isAvailable ? 'success' : 'danger',
      confirmText: isAvailable ? 'نعم، تم التوفير والشحن' : 'نعم، غير متوفر (شطب)',
      cancelText: 'تراجع',
      confirmBtnStyle: isAvailable ? 'success' : 'danger',
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

  // فتح نافذة تعديل الكمية المعتمدة وتدوين الملاحظات (المتطلب 20)
  const handleOpenAdjustModal = (item) => {
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

  // إرسال دفعة القرارات المحددة معاً للفروع بنافذة تأكيد منبثقة
  const handleBatchSubmit = () => {
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

  // تصدير شيت إكسل فاخر لطلبات الفروع
  const handleExportExcel = async () => {
    if (filteredItems.length === 0) {
      showToast?.('لا توجد بيانات متاحة للتصدير حالياً');
      return;
    }

    setIsExporting(true);
    try {
      const selectedBranchObj = branchesList.find(b => b.id === selectedBranchId);
      const branchNameStr = selectedBranchObj ? selectedBranchObj.name : 'كافة الفروع';

      await exportProcurementOrdersExcel(filteredItems, {
        selectedBranchName: branchNameStr,
        category: categoryScope || categoryFilter
      });
      showToast?.('📊 تم استخراج وتنزيل شيت إكسل طلبات المشتريات بنجاح بتصميم احترافي');
    } catch (err) {
      console.error('[Export Excel Error]:', err);
      showToast?.('حدث خطأ أثناء إنشاء شيت الإكسل');
    } finally {
      setIsExporting(false);
    }
  };

  // تطبيق الفلاتر
  const filteredItems = useMemo(() => {
    return aggregatedData.filter(item => {
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
  }, [aggregatedData, selectedBranchId, searchQuery]);

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

      {/* ── شريط الفلاتر واختيار الفرع ── */}
      <div className="outstock-card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div className="outstock-filters-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap', minWidth: '240px' }}>
            <div className="outstock-search-bar" style={{ flex: 1, minWidth: '180px' }}>
              <Search size={18} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="🔍 ابحث باسم الدواء أو الفرع..."
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* زر تصدير شيت إكسل فاخر */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleExportExcel}
              disabled={isExporting || filteredItems.length === 0}
              style={{
                background: '#f0fdf4',
                borderColor: '#86efac',
                color: '#15803d',
                fontWeight: '800'
              }}
              title="تصدير شيت إكسل رسمي وشامل لكافة الأصناف والكميات وتفاصيل العملاء"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  <span>جاري التصدير...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={16} style={{ color: '#16a34a' }} />
                  <span>تصدير شيت إكسل (Excel)</span>
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

      {/* ── جدول الطلبات المجمعة لكل فرع ── */}
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
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: '900', fontSize: '14.5px', color: '#0d9488' }}>
                            {item.medication_name}
                          </div>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {/* 1. متوفر بالفرع */}
                          <button
                            type="button"
                            className={`outstock-btn ${decision === 'available' ? 'outstock-btn-success' : 'outstock-btn-secondary'}`}
                            onClick={() => handleSetDecision(key, 'available')}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              borderColor: decision === 'available' ? '#059669' : '#a7f3d0',
                              color: decision === 'available' ? '#ffffff' : '#047857',
                              background: decision === 'available' ? '#059669' : '#f0fdf4'
                            }}
                            title="تحديد الصنف كمتوفر وإضافته لدفعة الإرسال"
                          >
                            <CheckCircle2 size={14} />
                            <span>متوفر</span>
                          </button>

                          {/* 2. غير متوفر بالسوق */}
                          <button
                            type="button"
                            className={`outstock-btn ${decision === 'unavailable' ? 'outstock-btn-danger' : 'outstock-btn-secondary'}`}
                            onClick={() => handleSetDecision(key, 'unavailable')}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              borderColor: decision === 'unavailable' ? '#dc2626' : '#fecdd3',
                              color: decision === 'unavailable' ? '#ffffff' : '#be123c',
                              background: decision === 'unavailable' ? '#dc2626' : '#fff1f2'
                            }}
                            title="تحديد الصنف كغير متوفر بالسوق وشطبه"
                          >
                            <XCircle size={14} />
                            <span>غير متوفر</span>
                          </button>

                          {/* 3. تعديل الكمية وإضافة ملاحظات المشتريات */}
                          <button
                            type="button"
                            className="outstock-btn outstock-btn-secondary"
                            onClick={() => handleOpenAdjustModal(item)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              borderColor: '#fde68a',
                              color: '#b45309',
                              background: '#fffbeb'
                            }}
                            title="تعديل الكمية المعتمدة وتدوين ملاحظات مدير المشتريات / مسؤول المستحضرات وإشعار الصيدلية"
                          >
                            <Edit3 size={14} />
                            <span>تعديل الكمية</span>
                          </button>

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
                              <span>إرسال الآن</span>
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
    </div>
  );
}
