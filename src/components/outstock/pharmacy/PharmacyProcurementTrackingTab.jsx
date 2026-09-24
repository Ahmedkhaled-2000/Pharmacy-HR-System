import React, { useState, useEffect } from 'react';
import { RefreshCw, Clock, CheckCircle, XCircle, Search, Filter } from 'lucide-react';
import { outstockGetOrders } from '../../../utils/outstockApiClient';

/**
 * PharmacyProcurementTrackingTab.jsx
 * شاشة متابعة الطلبات المرسلة إلى إدارة المشتريات
 * تمكن الصيدلية من مراقبة حالة كل صنف: قيد الطلب / تم توفيره / غير متوافر في السوق
 */
export default function PharmacyProcurementTrackingTab({ branchId }) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'available', 'unavailable'
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTracking = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOrders({ branchId, limit: 300 });
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
    if (branchId) fetchTracking();
  }, [branchId]);

  // استخراج البنود الفردية مع حالة المشتريات
  const flatItems = React.useMemo(() => {
    const list = [];
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        list.push({
          ...item,
          orderId: order.id,
          orderNumber: order.order_number || order.orderNumber,
          customerName: order.customer_name || order.customerName,
          customerPhone: order.customer_phone || order.customerPhone,
          orderCreatedAt: order.created_at || order.createdAt
        });
      });
    });
    return list;
  }, [orders]);

  // تطبيق الفلاتر والبحث
  const filteredItems = React.useMemo(() => {
    return flatItems.filter(item => {
      // فلتر الحالة
      if (filterStatus === 'pending' && item.itemStatus !== 'pending') return false;
      if (filterStatus === 'available' && item.itemStatus !== 'available_by_procurement' && item.itemStatus !== 'delivered') return false;
      if (filterStatus === 'unavailable' && item.itemStatus !== 'unavailable_in_market' && !item.prunedFromBill && !item.pruned_from_bill) return false;

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

  return (
    <div>
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
          <div className="outstock-search-bar" style={{ maxWidth: '440px' }}>
            <Search size={18} className="outstock-search-icon" />
            <input
              type="text"
              placeholder="🔍 ابحث باسم الدواء، العميل، أو رقم الطلب..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-search-input"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', background: 'var(--hover)', padding: '3px', borderRadius: '8px', gap: '4px' }}>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'all' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => setFilterStatus('all')}
              >
                الكل ({flatItems.length})
              </button>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'pending' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px', color: '#d97706' }}
                onClick={() => setFilterStatus('pending')}
              >
                ⏳ قيد الطلب
              </button>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'available' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px', color: '#16a34a' }}
                onClick={() => setFilterStatus('available')}
              >
                ✅ تم التوفير
              </button>
              <button
                type="button"
                className={`outstock-nav-btn ${filterStatus === 'unavailable' ? 'is-active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px', color: '#dc2626' }}
                onClick={() => setFilterStatus('unavailable')}
              >
                ❌ غير متوفر بالسوق
              </button>
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchTracking}
              title="تحديث"
            >
              <RefreshCw size={14} />
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
            لا توجد أصناف تطابق خيارات التصفية
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>اسم الدواء</th>
                  <th>الوحدة</th>
                  <th>الكمية</th>
                  <th>العميل</th>
                  <th>رقم الطلب</th>
                  <th>تاريخ الإرسال</th>
                  <th>حالة التوفير من المشتريات</th>
                  <th>ملاحظات المشتريات</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const isAvailable = item.itemStatus === 'available_by_procurement' || item.itemStatus === 'delivered';
                  const isUnavailable = item.itemStatus === 'unavailable_in_market' || item.prunedFromBill || item.pruned_from_bill;

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
                        <div>{item.customerName}</div>
                        <small style={{ color: '#64748b' }}>{item.customerPhone}</small>
                      </td>
                      <td>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          {item.orderNumber}
                        </span>
                      </td>
                      <td>
                        {new Date(item.orderCreatedAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td>
                        {isAvailable ? (
                          <span className="outstock-badge ready">
                            <CheckCircle size={13} />
                            <span>تم توفير الصنف بالفرع 🟢</span>
                          </span>
                        ) : isUnavailable ? (
                          <span className="outstock-badge unavailable">
                            <XCircle size={13} />
                            <span>غير متوفر بالسوق (نواقص) 🔴</span>
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
