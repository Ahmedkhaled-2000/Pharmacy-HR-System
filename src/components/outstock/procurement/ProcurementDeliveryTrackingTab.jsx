import React, { useState, useEffect } from 'react';
import { Building2, Package, RefreshCw, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { outstockGetProcurementTracking } from '../../../utils/outstockApiClient';

/**
 * ProcurementDeliveryTrackingTab.jsx
 * شاشة متابعة تسليم الأصناف بالفروع
 * تمكّن مسؤول المشتريات من متابعة حالات الأصناف التي تم توريدها للفروع ولم يقم الفرع بتسليمها بعد للعملاء
 */
export default function ProcurementDeliveryTrackingTab() {
  const [trackingData, setTrackingData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTracking = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetProcurementTracking();
      if (res?.success && Array.isArray(res.tracking)) {
        setTrackingData(res.tracking);
      }
    } catch (e) {
      console.warn('Fetch delivery tracking error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, []);

  const totalUndeliveredOrders = trackingData.reduce((sum, b) => sum + parseInt(b.pending_delivery_orders || 0, 10), 0);
  const totalUndeliveredItems = trackingData.reduce((sum, b) => sum + parseInt(b.undelivered_items_count || 0, 10), 0);

  return (
    <div>
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
            <p>إجمالي وحدات الأدوية بانتظار استلام العميل</p>
            <h3 style={{ color: '#0284c7' }}>{totalUndeliveredItems} عبوة/شريط</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            <Package size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>عدد الفروع النشطة في التوزيع</p>
            <h3 style={{ color: '#0d9488' }}>{trackingData.length} فرع</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <Building2 size={24} />
          </div>
        </div>
      </div>

      {/* ── بطاقات كل فرع وتفاصيل أصنافه ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>🚚 متابعة الأصناف المتوفرة بانتظار تسليمها للعميل في كل فرع</span>
          </h3>
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={fetchTracking}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري فحص مؤشرات التسليم بالفروع...
          </div>
        ) : trackingData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            لا توجد فروع مسجلة حالياً
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {trackingData.map(branch => {
              const pendingItems = branch.pending_items || [];

              return (
                <div
                  key={branch.branch_id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '16px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={18} color="#0d9488" />
                      <strong style={{ fontSize: '16px', color: '#0f172a' }}>{branch.branch_name}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className="outstock-badge pending">
                        {branch.pending_delivery_orders || 0} طلب لم يُسلم بعد
                      </span>
                      <span className="outstock-badge ready">
                        {branch.undelivered_items_count || 0} صنف جاهز
                      </span>
                    </div>
                  </div>

                  {pendingItems.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={15} />
                      <span>جميع الأدوية المتوفرة تم تسليمها للعملاء في هذا الفرع بانتظام.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {pendingItems.map((it, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12.5px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px'
                          }}
                        >
                          <div style={{ fontWeight: '800', color: '#1e293b' }}>
                            {it.medicationName} ({it.quantity} {it.unitType === 'strip' ? 'شريط' : 'علبة'})
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            العميل: {it.customerName} ({it.customerPhone})
                          </div>
                          <div style={{ fontSize: '10px', color: '#0284c7' }}>
                            طلب: {it.orderNumber}
                          </div>
                        </div>
                      ))}
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
