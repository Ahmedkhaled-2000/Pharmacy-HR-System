import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  Package,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle,
  CheckCircle2,
  Calendar,
  Search,
  Filter,
  Pill,
  Sparkles,
  User,
  Phone,
  Send,
  X
} from 'lucide-react';
import { outstockGetProcurementTracking } from '../../../utils/outstockApiClient';

/**
 * ProcurementDeliveryTrackingTab.jsx
 * شاشة متابعة تسليم الأصناف المتوفرة في كل فرع
 * - عرض الأصناف المتوفرة بانتظار تسليمها للعميل + الأصناف التي تم تسليمها
 * - شارة للصنف المسلّم مع إظهار تاريخ ووقت التسليم
 * - تاريخ ووقت رد المشتريات
 * - فلتر تاريخ مرن (من تاريخ ... إلى تاريخ)
 * - دعم صلاحية مسؤول مستحضرات التجميل لعزل المستحضرات فقط
 */
export default function ProcurementDeliveryTrackingTab({ categoryScope = null }) {
  const [trackingData, setTrackingData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'delivered'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(() => categoryScope || 'all'); // 'all' | 'medication' | 'cosmetics'

  const fetchTracking = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeCat = categoryScope || (categoryFilter === 'all' ? undefined : categoryFilter);
      const res = await outstockGetProcurementTracking({
        status: statusFilter,
        category: activeCat,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      if (res?.success && Array.isArray(res.tracking)) {
        setTrackingData(res.tracking);
      }
    } catch (e) {
      console.warn('Fetch delivery tracking error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, categoryFilter, categoryScope, dateFrom, dateTo]);

  useEffect(() => {
    fetchTracking();
  }, [fetchTracking]);

  // استماع لأحداث التسليم والردود اللحظية
  useEffect(() => {
    const handleLiveEvent = () => fetchTracking();
    window.addEventListener('outstock:order_delivered', handleLiveEvent);
    window.addEventListener('outstock:item_status_updated', handleLiveEvent);
    window.addEventListener('outstock:branch_order_replied', handleLiveEvent);

    return () => {
      window.removeEventListener('outstock:order_delivered', handleLiveEvent);
      window.removeEventListener('outstock:item_status_updated', handleLiveEvent);
      window.removeEventListener('outstock:branch_order_replied', handleLiveEvent);
    };
  }, [fetchTracking]);

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

  // إحصائيات سريعة
  const totalUndeliveredOrders = trackingData.reduce((sum, b) => sum + parseInt(b.pending_delivery_orders || 0, 10), 0);
  const totalUndeliveredItems = trackingData.reduce((sum, b) => sum + parseInt(b.undelivered_items_count || 0, 10), 0);
  const totalDeliveredItems = trackingData.reduce((sum, b) => sum + parseInt(b.delivered_items_count || 0, 10), 0);

  // تصفية العناصر المعروضة بناءً على البحث
  const filteredTracking = useMemo(() => {
    if (!searchQuery.trim()) return trackingData;
    const q = searchQuery.toLowerCase().trim();

    return trackingData.map((branch) => {
      const allItems = branch.items || branch.pending_items || [];
      const matchedItems = allItems.filter((it) => {
        const medName = String(it.medicationName || it.medication_name || '').toLowerCase();
        const custName = String(it.customerName || it.customer_name || '').toLowerCase();
        const custPhone = String(it.customerPhone || it.customer_phone || '').toLowerCase();
        const ordNum = String(it.orderNumber || it.order_number || it.orderId || '').toLowerCase();
        return medName.includes(q) || custName.includes(q) || custPhone.includes(q) || ordNum.includes(q);
      });

      return {
        ...branch,
        items: matchedItems
      };
    }).filter((branch) => (branch.items || []).length > 0 || !searchQuery.trim());
  }, [trackingData, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
      {/* ── بطاقات الإحصائيات السريعة ── */}
      <div className="outstock-stats-grid">
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي الفواتير غير المسلمة بالفروع</p>
            <h3 style={{ color: '#d97706' }}>{totalUndeliveredOrders} فاتورة</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
            <Clock size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أصناف متوفرة بانتظار استلام العميل</p>
            <h3 style={{ color: '#0284c7' }}>{totalUndeliveredItems} عبوة</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            <Package size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أصناف تم تسليمها بنجاح للعميل</p>
            <h3 style={{ color: '#16a34a' }}>{totalDeliveredItems} صنف مسلّم</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#15803d' }}>
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>عدد الفروع النشطة</p>
            <h3 style={{ color: '#0d9488' }}>{trackingData.length} فرع</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <Building2 size={24} />
          </div>
        </div>
      </div>

      {/* ── شريط الفلاتر والبحث والتاريخ ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '14px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          {/* فلتر حالة التسليم */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '13px', fontWeight: '800' }}>
              <Filter size={15} />
              <span>حالة التسليم:</span>
            </div>

            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                border: statusFilter === 'all' ? '2px solid #475569' : '1px solid #cbd5e1',
                background: statusFilter === 'all' ? '#f1f5f9' : '#ffffff',
                color: statusFilter === 'all' ? '#1e293b' : '#64748b'
              }}
            >
              الكل
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
                border: statusFilter === 'pending' ? '2px solid #d97706' : '1px solid #cbd5e1',
                background: statusFilter === 'pending' ? '#fef3c7' : '#ffffff',
                color: statusFilter === 'pending' ? '#92400e' : '#64748b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Clock size={13} color={statusFilter === 'pending' ? '#d97706' : '#64748b'} />
              <span>بانتظار تسليم العميل</span>
              <span style={{ background: '#f59e0b', color: '#ffffff', fontSize: '10.5px', padding: '1px 6px', borderRadius: '8px' }}>
                {totalUndeliveredItems}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('delivered')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                border: statusFilter === 'delivered' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                background: statusFilter === 'delivered' ? '#f0fdf4' : '#ffffff',
                color: statusFilter === 'delivered' ? '#15803d' : '#64748b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <CheckCircle2 size={13} color={statusFilter === 'delivered' ? '#16a34a' : '#64748b'} />
              <span>تم تسليمها للعميل</span>
              <span style={{ background: '#16a34a', color: '#ffffff', fontSize: '10.5px', padding: '1px 6px', borderRadius: '8px' }}>
                {totalDeliveredItems}
              </span>
            </button>
          </div>

          {/* فلتر التصنيف (إذا لم تكن صلاحية مستحضرات محددة) */}
          {!categoryScope ? (
            <div style={{ display: 'flex', gap: '4px', background: '#f8fafc', padding: '3px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: 'none',
                  background: categoryFilter === 'all' ? '#1e293b' : 'transparent',
                  color: categoryFilter === 'all' ? '#ffffff' : '#64748b'
                }}
              >
                كافة التصنيفات
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('medication')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: 'none',
                  background: categoryFilter === 'medication' ? '#059669' : 'transparent',
                  color: categoryFilter === 'medication' ? '#ffffff' : '#64748b'
                }}
              >
                💊 أدوية
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('cosmetics')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: 'none',
                  background: categoryFilter === 'cosmetics' ? '#db2777' : 'transparent',
                  color: categoryFilter === 'cosmetics' ? '#ffffff' : '#64748b'
                }}
              >
                💄 مستحضرات
              </button>
            </div>
          ) : (
            <span
              style={{
                fontSize: '12px',
                fontWeight: '800',
                color: '#be185d',
                background: '#fdf2f8',
                border: '1px solid #fbcfe8',
                padding: '4px 10px',
                borderRadius: '8px'
              }}
            >
              💄 مستحضرات تجميل وعناية فقط
            </span>
          )}
        </div>

        {/* سطر البحث ونطاق التاريخ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* فلتر التاريخ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Calendar size={15} color="#0d9488" />
            <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155' }}>فلتر التاريخ:</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>من:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="outstock-form-input"
                style={{ height: '34px', fontSize: '12px', padding: '2px 8px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>إلى:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="outstock-form-input"
                style={{ height: '34px', fontSize: '12px', padding: '2px 8px' }}
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
                style={{ padding: '4px 8px', fontSize: '11px', color: '#ef4444' }}
                title="مسح فلتر التاريخ"
              >
                <X size={13} />
                <span>مسح</span>
              </button>
            )}
          </div>

          {/* البحث وتحديث البيانات */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', width: '260px' }}>
              <Search
                size={15}
                color="#94a3b8"
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="ابحث بالصنف، العميل، أو الطلب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outstock-form-input"
                style={{ paddingRight: '32px', height: '36px', fontSize: '12px' }}
              />
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchTracking}
              style={{ padding: '7px 12px' }}
              title="تحديث البيانات لحظياً"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ── بطاقات كل فرع وتفاصيل أصنافه ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>🚚 متابعة الأصناف المتوفرة بانتظار تسليمها للعميل في كل فرع</span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#0d9488' }} />
            <div>جاري فحص مؤشرات التسليم وتواريخ الردود بالفروع...</div>
          </div>
        ) : filteredTracking.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
            <Package size={44} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
            <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
              لا توجد أصناف تطابق الفلاتر المحددة حالياً
            </h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              يمكنك تغيير حالة التسليم أو نطاق التاريخ لعرض أصناف أخرى.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredTracking.map((branch) => {
              const itemsList = branch.items || branch.pending_items || [];

              return (
                <div
                  key={branch.branch_id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                      borderBottom: '1px solid #f1f5f9',
                      paddingBottom: '12px',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Building2 size={20} color="#0d9488" />
                      <strong style={{ fontSize: '16px', color: '#0f172a' }}>{branch.branch_name}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="outstock-badge pending">
                        {branch.pending_delivery_orders || 0} طلب لم يُسلم
                      </span>
                      <span className="outstock-badge ready">
                        {branch.undelivered_items_count || 0} صنف جاهز
                      </span>
                      {Number(branch.delivered_items_count || 0) > 0 && (
                        <span
                          style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '3px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '800',
                            border: '1px solid #bbf7d0'
                          }}
                        >
                          ✓ {branch.delivered_items_count} صنف مسلّم
                        </span>
                      )}
                    </div>
                  </div>

                  {itemsList.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={15} />
                      <span>كافة الأدوية المتوفرة تم تسليمها للعملاء في هذا الفرع بانتظام.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                      {itemsList.map((it, idx) => {
                        const isDelivered = Boolean(it.deliveredAt || it.status === 'delivered');
                        const isCosmetics = it.itemType === 'cosmetics' || it.item_type === 'cosmetics';
                        const isBranchOrder = it.orderType === 'branch';

                        return (
                          <div
                            key={idx}
                            style={{
                              background: isDelivered ? '#f0fdf4' : '#ffffff',
                              border: isDelivered ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                              borderRadius: '12px',
                              padding: '12px 14px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {/* شريط الحالة والنوع */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    padding: '2px 6px',
                                    borderRadius: '6px',
                                    background: isCosmetics ? '#fce7f3' : '#e0f2fe',
                                    color: isCosmetics ? '#be185d' : '#0369a1'
                                  }}
                                >
                                  {isCosmetics ? '💄 مستحضر' : '💊 دواء'}
                                </span>

                                {isBranchOrder && (
                                  <span style={{ fontSize: '11px', fontWeight: '800', padding: '2px 6px', borderRadius: '6px', background: '#fef3c7', color: '#92400e' }}>
                                    🏢 طلب فرع
                                  </span>
                                )}
                              </div>

                              {/* شارة التسليم أو الانتظار */}
                              {isDelivered ? (
                                <span
                                  style={{
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    fontSize: '11px',
                                    fontWeight: '900',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #86efac',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <CheckCircle2 size={12} />
                                  <span>تم التسليم للعميل ✅</span>
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <Clock size={12} />
                                  <span>بانتظار التسليم</span>
                                </span>
                              )}
                            </div>

                            {/* اسم الصنف والكمية */}
                            <div style={{ fontWeight: '900', fontSize: '13.5px', color: '#0f172a' }}>
                              {it.medicationName || it.medication_name}
                              <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b', marginRight: '6px' }}>
                                ({it.quantity} {it.unitType === 'strip' ? 'شريط' : 'علبة'})
                              </span>
                            </div>

                            {/* بيانات العميل أو الفرع */}
                            {!isBranchOrder ? (
                              <div style={{ fontSize: '11.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <User size={12} color="#0d9488" />
                                <span>العميل: <strong>{it.customerName || it.customer_name || 'عميل نقدي'}</strong></span>
                                {(it.customerPhone || it.customer_phone) && (
                                  <span dir="ltr" style={{ color: '#0284c7', fontSize: '11px' }}>
                                    ({it.customerPhone || it.customer_phone})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div style={{ fontSize: '11.5px', color: '#0369a1', fontWeight: '700' }}>
                                📌 خاص بمخزن وصيدلية الفرع
                              </div>
                            )}

                            {/* رقم الطلب */}
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              رقم الطلب: <strong style={{ color: '#0f172a' }}>{it.orderNumber || it.order_number || `#${it.orderId}`}</strong>
                            </div>

                            {/* التوقيتات: رد المشتريات ووقت التسليم */}
                            <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '6px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
                              {it.procurementRepliedAt && (
                                <div style={{ color: '#0369a1' }}>
                                  <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                                  رد المشتريات: {formatDateTime(it.procurementRepliedAt)}
                                  {it.procurementRepliedBy && ` (${it.procurementRepliedBy})`}
                                </div>
                              )}

                              {isDelivered && (
                                <div style={{ color: '#15803d', fontWeight: '800' }}>
                                  <CheckCircle2 size={11} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                                  وقت التسليم: {formatDateTime(it.deliveredAt)}
                                  {it.deliveredBy && ` (${it.deliveredBy})`}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
