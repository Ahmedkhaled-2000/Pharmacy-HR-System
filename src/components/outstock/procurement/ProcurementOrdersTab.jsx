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
  Sparkles
} from 'lucide-react';
import { outstockGetProcurementAggregated, outstockProcurementItemAction } from '../../../utils/outstockApiClient';
import { exportProcurementOrdersExcel } from '../../../utils/outstockExcelExporter';
import OutstockConfirmModal from '../common/OutstockConfirmModal';
import { getSocket } from '../../../utils/socketClient';

/**
 * ProcurementOrdersTab.jsx
 * شاشة طلبات الفروع المجمعة لإدارة المشتريات
 * - استلام أصناف مجمعة لكل فرع على حدة (Aggregated Item Model)
 * - تحديد ما تم توفيره بالفرع وما هو غير متوفر بالسوق
 * - شحن الأصناف المتوفرة لرصيد الفرع، أو شطب غير المتوفر وتحويله لنواقص الصيدلية
 * - تصدير شيت إكسل فاخر بتصميم احترافي (Dual-Sheet Executive Excel)
 * - نافذة تأكيد منبثقة احترافية بدلاً من window.confirm
 * - مزامنة لحظية فورية عبر WebSockets عند تسجيل أي طلب بالفرع
 */
export default function ProcurementOrdersTab({ showToast }) {
  const [aggregatedData, setAggregatedData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

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

  const fetchAggregatedOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await outstockGetProcurementAggregated();
      if (res?.success && Array.isArray(res.aggregated)) {
        setAggregatedData(res.aggregated);
      }
    } catch (e) {
      console.warn('Fetch aggregated orders error:', e);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAggregatedOrders();

    // ── الاستماع اللحظي لأحداث Socket.io للمزامنة الفورية مع الفروع ──
    const socket = getSocket();
    if (socket) {
      const handleLiveOrder = () => {
        fetchAggregatedOrders(true);
      };
      socket.on('outstock:order_created', handleLiveOrder);
      socket.on('outstock:items_status_updated', handleLiveOrder);
      socket.on('outstock:item_restocked', handleLiveOrder);

      return () => {
        socket.off('outstock:order_created', handleLiveOrder);
        socket.off('outstock:items_status_updated', handleLiveOrder);
        socket.off('outstock:item_restocked', handleLiveOrder);
      };
    }
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
      message: `هل تريد اعتماد وإرسال (${keys.length}) قرار دفعة واحدة للفروع المعنية وتحديث حسابات وفواتير المرضى والمزامنة اللحظية؟`,
      iconType: 'send',
      confirmText: `اعتماد وإرسال (${keys.length}) قرار الآن`,
      cancelText: 'مراجعة القرارات',
      confirmBtnStyle: 'primary',
      badge: `${keys.length} صنف محدد`,
      details: [
        { label: 'إجمالي القرارات المحددة', value: `${keys.length} صنف` },
        { label: 'المزامنة', value: 'تحديث فوري لرصيد الفروع وإشعارات الصيدليات' }
      ],
      onConfirmAction: async () => {
        setIsProcessing(true);
        try {
          let successCount = 0;
          for (const item of filteredItems) {
            const key = `${item.branch_id}_${item.medication_name}_${item.unit_type}`;
            const action = decisions[key];
            if (action) {
              await outstockProcurementItemAction({
                branchId: item.branch_id,
                medicationName: item.medication_name,
                unitType: item.unit_type,
                action,
                itemIds: (item.item_details || []).map(d => d.itemId)
              });
              successCount++;
            }
          }

          showToast?.(`✅ تم إرسال وتطبيق (${successCount}) تحديث بنجاح ومزامنتها مع الفروع فورياً`);
          setDecisions({});
          fetchAggregatedOrders();
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
        selectedBranchName: branchNameStr
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
                            <small style={{ color: 'var(--muted, #64748b)', fontSize: '11px' }}>
                              فرع صيدلية معتمد
                            </small>
                          </div>
                        </div>
                      </td>

                      {/* صنف الدواء */}
                      <td>
                        <div style={{ fontWeight: '900', fontSize: '14.5px', color: '#0d9488' }}>
                          {item.medication_name}
                        </div>
                        <small style={{ color: 'var(--muted, #64748b)', fontSize: '11px' }}>
                          مسجل كحجز مسبق للعملاء
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
    </div>
  );
}
