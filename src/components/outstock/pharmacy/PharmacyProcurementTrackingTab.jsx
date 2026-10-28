import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Clock, CheckCircle, XCircle, Search, Filter, MessageSquare, Package, CheckCheck } from 'lucide-react';
import { outstockGetOrders, outstockReceiveBranchStockOrder } from '../../../utils/outstockApiClient';

/**
 * PharmacyProcurementTrackingTab.jsx
 * شاشة متابعة الطلبات والأصناف المرسلة إلى إدارة المشتريات
 * تمكن الصيدلية من مراقبة حالة كل صنف: تم التوفير / قيد الطلب / غير متوافر في السوق
 * وتأكيد استلام بضاعة الفرع أو إشعار العميل بالاستلام
 */
export default function PharmacyProcurementTrackingTab({ branchId, initialFilter = 'available' }) {
  const cleanBranchId = useMemo(() => String(branchId || '').replace(/^usr_branch_/, ''), [branchId]);

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState(initialFilter || 'available');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchTracking = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOrders({ branchId: cleanBranchId, limit: 300 });
      if (res?.success && Array.isArray(res.orders)) {
        setOrders(res.orders);
      }
    } catch (e) {
      console.warn('Fetch tracking error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (cleanBranchId) fetchTracking();
  }, [cleanBranchId]);

  // استخراج البنود الفردية مع حالة المشتريات ونوع الطلب
  const flatItems = useMemo(() => {
    const list = [];
    orders.forEach(order => {
      const orderType = order.order_type || order.orderType || 'customer';
      (order.items || []).forEach(item => {
        list.push({
          ...item,
          orderId: order.id,
          orderType,
          orderStatus: order.order_status || order.orderStatus,
          orderNumber: order.order_number || order.orderNumber,
          customerName: orderType === 'branch' ? 'طلب بضاعة الفرع' : (order.customer_name || order.customerName || 'عميل نقدي'),
          customerPhone: orderType === 'branch' ? '' : (order.customer_phone || order.customerPhone || ''),
          orderCreatedAt: order.created_at || order.createdAt
        });
      });
    });
    return list;
  }, [orders]);

  // عدادات الحالات بدقة تامة
  const counts = useMemo(() => {
    let pending = 0;
    let available = 0;
    let unavailable = 0;
    flatItems.forEach(item => {
      const st = item.itemStatus || item.status;
      if (st === 'pending') {
        pending++;
      } else if (st === 'available_by_procurement' || st === 'delivered') {
        available++;
      } else if (st === 'unavailable_in_market' || item.prunedFromBill || item.pruned_from_bill) {
        unavailable++;
      }
    });
    return {
      total: flatItems.length,
      pending,
      available,
      unavailable
    };
  }, [flatItems]);

  // الضبط الذكي للفلتر الافتراضي عند أول تحميل إذا كان الفلتر الحالي فارغاً وتوجد أصناف متوفرة
  useEffect(() => {
    if (!isLoading && flatItems.length > 0) {
      if (filterStatus === 'pending' && counts.pending === 0 && counts.available > 0) {
        setFilterStatus('available');
      }
    }
  }, [isLoading, flatItems.length, counts.pending, counts.available]);

  // تطبيق الفلاتر والبحث
  const filteredItems = useMemo(() => {
    return flatItems.filter(item => {
      const st = item.itemStatus || item.status;
      // فلتر الحالة
      if (filterStatus === 'pending' && st !== 'pending') return false;
      if (filterStatus === 'available' && st !== 'available_by_procurement' && st !== 'delivered') return false;
      if (filterStatus === 'unavailable' && st !== 'unavailable_in_market' && !item.prunedFromBill && !item.pruned_from_bill) return false;

      // فلتر البحث
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const med = String(item.medicationName || item.medication_name || '').toLowerCase();
        const cust = String(item.customerName || '').toLowerCase();
        const ord = String(item.orderNumber || '').toLowerCase();
        if (!med.includes(q) && !cust.includes(q) && !ord.includes(q)) return false;
      }

      return true;
    });
  }, [flatItems, filterStatus, searchQuery]);

  // تأكيد استلام بضاعة الفرع بالصيدلية
  const handleReceiveBranchStock = async (orderId) => {
    setActionLoadingId(orderId);
    try {
      const res = await outstockReceiveBranchStockOrder(orderId);
      if (res?.success) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('outstock:refresh_notifications'));
        }
        await fetchTracking();
      }
    } catch (err) {
      console.error('Receive branch stock error:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div>
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div className="outstock-filters-bar">
          <div className="outstock-search-bar" style={{ flex: 1, minWidth: '220px' }}>
            <Search size={18} className="outstock-search-icon" />
            <input
              type="text"
              placeholder="🔍 ابحث باسم الدواء، العميل، أو رقم الطلب..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-search-input"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', maxWidth: 'max-content' }}>
            <div style={{ display: 'flex', background: 'var(--hover)', padding: '3px', borderRadius: '10px', gap: '4px', overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'all' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => setFilterStatus('all')}
              >
                الكل ({counts.total})
              </button>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'available' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px', color: '#16a34a', fontWeight: filterStatus === 'available' ? '900' : '700' }}
                onClick={() => setFilterStatus('available')}
              >
                ✅ تم التوفير ({counts.available})
              </button>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'pending' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px', color: '#d97706' }}
                onClick={() => setFilterStatus('pending')}
              >
                ⏳ قيد الطلب ({counts.pending})
              </button>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'unavailable' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px', color: '#dc2626' }}
                onClick={() => setFilterStatus('unavailable')}
              >
                ❌ غير متوفر بالسوق ({counts.unavailable})
              </button>
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchTracking}
              title="تحديث"
              style={{ flexShrink: 0 }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>🔄 متابعة حالة أصناف الأدوية المرسلة لإدارة المشتريات</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
              ({filteredItems.length} صنف)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري فحص حالة طلبات المشتريات...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700' }}>
              {filterStatus === 'pending' && counts.available > 0
                ? `لا توجد أصناف معلقة بانتظار رد المشتريات حالياً.`
                : `لا توجد أصناف تطابق خيارات التصفية الحالية.`}
            </p>
            {counts.available > 0 && filterStatus !== 'available' && (
              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={() => setFilterStatus('available')}
                style={{ padding: '8px 18px', fontSize: '13px', background: '#16a34a', color: '#ffffff', borderRadius: '8px', cursor: 'pointer' }}
              >
                ✅ عرض الأصناف التي تم توفيرها ({counts.available} صنف جاهز)
              </button>
            )}
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>اسم الدواء</th>
                  <th>الوحدة</th>
                  <th>الكمية</th>
                  <th>نوع المعاملة / العميل</th>
                  <th>رقم الطلب</th>
                  <th>تاريخ الإرسال</th>
                  <th>حالة التوفير من المشتريات</th>
                  <th>ملاحظات المشتريات</th>
                  <th>الإجراء والتواصل</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const isAvailable = (item.itemStatus || item.status) === 'available_by_procurement' || (item.itemStatus || item.status) === 'delivered';
                  const isDelivered = (item.itemStatus || item.status) === 'delivered' || item.orderStatus === 'delivered';
                  const isUnavailable = (item.itemStatus || item.status) === 'unavailable_in_market' || item.prunedFromBill || item.pruned_from_bill;
                  const isBranchStock = item.orderType === 'branch';

                  return (
                    <tr key={idx} style={{ background: isUnavailable ? '#fef2f2' : isAvailable ? '#f0fdf4' : 'inherit' }}>
                      <td>
                        <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                          {item.medicationName || item.medication_name}
                        </strong>
                      </td>
                      <td>{item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
                      <td><strong>{item.quantity}</strong></td>
                      <td>
                        {isBranchStock ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800' }}>
                            <Package size={13} />
                            <span>بضاعة للفرع</span>
                          </span>
                        ) : (
                          <div>
                            <div style={{ fontWeight: '700' }}>{item.customerName}</div>
                            {item.customerPhone && <small style={{ color: '#64748b' }}>{item.customerPhone}</small>}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          {item.orderNumber}
                        </span>
                      </td>
                      <td>
                        {item.orderCreatedAt ? new Date(item.orderCreatedAt).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td>
                        {isDelivered ? (
                          <span className="outstock-badge" style={{ background: '#dcfce7', color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCheck size={13} />
                            <span>تم استلامه بالفرع ✅</span>
                          </span>
                        ) : isAvailable ? (
                          <span className="outstock-badge ready">
                            <CheckCircle size={13} />
                            <span>تم توفير الصنف 🟢</span>
                          </span>
                        ) : isUnavailable ? (
                          <span className="outstock-badge unavailable">
                            <XCircle size={13} />
                            <span>غير متوفر بالسوق 🔴</span>
                          </span>
                        ) : (
                          <span className="outstock-badge pending">
                            <Clock size={13} />
                            <span>قيد التدبير والمتابعة 🟡</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ color: '#475569', fontSize: '12px' }}>
                          {item.procurementNotes || item.procurement_notes || '—'}
                        </span>
                      </td>
                      <td>
                        {isBranchStock && isAvailable && !isDelivered ? (
                          <button
                            type="button"
                            onClick={() => handleReceiveBranchStock(item.orderId)}
                            disabled={actionLoadingId === item.orderId}
                            className="outstock-btn"
                            style={{
                              padding: '5px 12px',
                              fontSize: '11.5px',
                              fontWeight: '800',
                              background: '#0284c7',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                            title="تأكيد استلام هذا الصنف في مخزن وعهدة الفرع"
                          >
                            <Package size={13} color="#ffffff" />
                            <span>{actionLoadingId === item.orderId ? 'جاري الاستلام...' : 'استلام بالفرع 📥'}</span>
                          </button>
                        ) : item.customerPhone ? (
                          <button
                            type="button"
                            onClick={() => {
                              let cleanPhone = String(item.customerPhone || '').replace(/\D/g, '');
                              if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
                              const custName = item.customerName || 'عميلنا العزيز';
                              const medName = item.medicationName || item.medication_name || 'الدواء';
                              let msg = '';
                              if (isAvailable) {
                                msg = `السلام عليكم ورحمة الله وبركاته، أ/ ${custName}، نود إبلاغكم بتوفر صنف (${medName}) في الصيدلية بناءً على طلبكم رقم #${item.orderNumber}. نتشرف بزيارتكم للاستلام في أي وقت.`;
                              } else if (isUnavailable) {
                                msg = `السلام عليكم ورحمة الله وبركاته، أ/ ${custName}، بخصوص طلبكم رقم #${item.orderNumber} لصنف (${medName})، نعتذر لعدم توفره بالأسواق حالياً. نسعد باستقبالكم لتوفير البديل الطبي المناسب أو استرداد العربون.`;
                              } else {
                                msg = `السلام عليكم ورحمة الله وبركاته، أ/ ${custName}، بخصوص طلبكم رقم #${item.orderNumber} لصنف (${medName})، جاري متابعته وتدبيره من إدارة المشتريات.`;
                              }
                              window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank');
                            }}
                            className="outstock-btn"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11.5px',
                              fontWeight: '800',
                              background: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                            title="إرسال رسالة واتساب للعميل بخصوص هذا الصنف"
                          >
                            <MessageSquare size={13} color="#ffffff" />
                            <span>مراسلة العميل 📱</span>
                          </button>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>—</span>
                        )}
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
