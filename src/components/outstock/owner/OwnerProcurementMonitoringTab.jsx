import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, RefreshCw, BarChart2, TrendingUp, Building2 } from 'lucide-react';
import { outstockGetOwnerOverview, outstockGetUnavailableItems } from '../../../utils/outstockApiClient';

/**
 * OwnerProcurementMonitoringTab.jsx
 * شاشة رقابة ومتابعة إدارة المشتريات للمالك والمشرف العام
 * - متابعة الأصناف التي تم توفيرها لكل فرع
 * - متابعة الأصناف التي لم يتم توفيرها (العجز السوقي)
 * - كفاءة التوريد ونسب التلبية (Fulfillment KPIs)
 */
export default function OwnerProcurementMonitoringTab() {
  const [overview, setOverview] = useState(null);
  const [unavailableItems, setUnavailableItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProcurementStats = async () => {
    setIsLoading(true);
    try {
      const [ovRes, unRes] = await Promise.all([
        outstockGetOwnerOverview(),
        outstockGetUnavailableItems()
      ]);

      if (ovRes?.success) setOverview(ovRes);
      if (unRes?.success && Array.isArray(unRes.unavailableItems)) {
        setUnavailableItems(unRes.unavailableItems);
      }
    } catch (e) {
      console.warn('Fetch procurement stats error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProcurementStats();
  }, []);

  const kpis = overview?.procurementKpi || {};
  const totalItems = parseInt(kpis.total_items_handled || 0, 10);
  const fulfilledItems = parseInt(kpis.fulfilled_items || 0, 10);
  const unavailableCount = parseInt(kpis.unavailable_items || 0, 10);
  const pendingCount = parseInt(kpis.pending_procurement_items || 0, 10);

  const fulfillmentRate = totalItems > 0 ? Math.round((fulfilledItems / totalItems) * 100) : 0;

  return (
    <div>
      {/* ── بطاقات مؤشرات الكفاءة (Procurement SLAs & KPIs) ── */}
      <div className="outstock-stats-grid">
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>نسبة نجاح توفير النواقص (Fulfillment)</p>
            <h3 style={{ color: '#16a34a' }}>{fulfillmentRate}%</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أصناف تم توفيرها بنجاح للفروع</p>
            <h3 style={{ color: '#0f766e' }}>{fulfilledItems} صنف</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أصناف غير متوفرة بالسوق (نواقص)</p>
            <h3 style={{ color: '#dc2626' }}>{unavailableCount} صنف</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <XCircle size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أصناف جاري تدبيرها من الموزعين</p>
            <h3 style={{ color: '#d97706' }}>{pendingCount} صنف</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Clock size={24} />
          </div>
        </div>
      </div>

      {/* ── جدول الأصناف غير المتوفرة لكل فرع ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>❌ كشف الأصناف غير المتوفرة (العجز السوقي) موزعاً على الفروع</span>
            <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: '800' }}>
              ({unavailableItems.length} صنف عجز)
            </span>
          </h3>

          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={fetchProcurementStats}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري فحص مؤشرات إدارة المشتريات...
          </div>
        ) : unavailableItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            لا توجد أصناف غير متوفرة بالسوق حالياً.
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>اسم الفرع</th>
                  <th>صنف الدواء الناقص</th>
                  <th>الوحدة</th>
                  <th>عدد العملاء المتأثرين</th>
                  <th>إجمالي الكمية المطلوبة</th>
                </tr>
              </thead>
              <tbody>
                {unavailableItems.map((item, idx) => (
                  <tr key={idx} style={{ background: '#fef2f2' }}>
                    <td>
                      <span style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: '800',
                        fontSize: '12.5px',
                        color: '#0f766e'
                      }}>
                        <Building2 size={12} style={{ display: 'inline' }} /> {item.branch_name}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '14px', color: '#991b1b' }}>{item.medication_name}</strong>
                    </td>
                    <td>{item.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
                    <td>
                      <span className="outstock-badge unavailable">
                        {item.customers_waiting_count} عملاء
                      </span>
                    </td>
                    <td><strong>{item.total_wanted_qty}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
