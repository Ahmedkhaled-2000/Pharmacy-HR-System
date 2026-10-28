import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Truck,
  AlertTriangle,
  Clock,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldAlert,
  Boxes,
  FileText
} from 'lucide-react';

export default function StockDashboardTab({
  overview = {},
  onNavigateTab,
  onOpenTransferDetails
}) {
  const metrics = overview.metrics || {};
  const recentMovements = overview.recentMovements || [];
  const inTransitTransfers = overview.inTransitTransfers || [];

  const costValuation = parseFloat(metrics.total_cost_valuation || 0);
  const publicValuation = parseFloat(metrics.total_public_valuation || 0);
  const potentialMargin = publicValuation > 0 ? (((publicValuation - costValuation) / publicValuation) * 100).toFixed(1) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── 1. بطاقات المؤشرات القياسية (KPI Cards) ── */}
      <div className="stock-metrics-grid">
        {/* تقييم المخزون بالتكلفة */}
        <div className="stock-metric-card" onClick={() => onNavigateTab('balances')}>
          <div className="stock-metric-header">
            <span>قيمة المخزون بسعر التكلفة</span>
            <div className="stock-metric-icon" style={{ background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}>
              <DollarSign size={16} />
            </div>
          </div>
          <div className="stock-metric-value">{costValuation.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج</div>
          <div className="stock-metric-subtext">إجمالي تكلفة الشراء الفعلي لجميع المستودعات</div>
        </div>

        {/* تقييم المخزون بسعر البيع وهامش الربح */}
        <div className="stock-metric-card" onClick={() => onNavigateTab('balances')}>
          <div className="stock-metric-header">
            <span>قيمة المخزون بسعر الجمهور</span>
            <div className="stock-metric-icon" style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="stock-metric-value">{publicValuation.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج</div>
          <div className="stock-metric-subtext" style={{ color: '#059669', fontWeight: 800 }}>
            هامش الربح المتوقع: {potentialMargin}%
          </div>
        </div>

        {/* بضاعة الطريق قيد النقل */}
        <div className="stock-metric-card" onClick={() => onNavigateTab('transfers')}>
          <div className="stock-metric-header">
            <span>بضاعة الطريق (In-Transit)</span>
            <div className="stock-metric-icon" style={{ background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}>
              <Truck size={16} />
            </div>
          </div>
          <div className="stock-metric-value" style={{ color: '#0284c7' }}>
            {parseInt(metrics.in_transit_count || 0, 10)} شحنة
          </div>
          <div className="stock-metric-subtext">شحنات تم إرسالها ولم يتم اعتماد استلامها بعد</div>
        </div>

        {/* الأدوية قريبة الانتهاء */}
        <div className="stock-metric-card" onClick={() => onNavigateTab('batches')}>
          <div className="stock-metric-header">
            <span>قريبة الانتهاء (&lt; 90 يوم)</span>
            <div className="stock-metric-icon" style={{ background: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
              <Clock size={16} />
            </div>
          </div>
          <div className="stock-metric-value" style={{ color: '#d97706' }}>
            {parseInt(metrics.near_expiry_count || 0, 10)} تشغيلة
          </div>
          <div className="stock-metric-subtext">تتطلب تصريفاً سريعاً أو إرجاعاً للمورد</div>
        </div>

        {/* تنبيهات النواقص تحت حد الطلب */}
        <div className="stock-metric-card" onClick={() => onNavigateTab('balances')}>
          <div className="stock-metric-header">
            <span>نواقص تحت حد الأمان</span>
            <div className="stock-metric-icon" style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="stock-metric-value" style={{ color: '#dc2626' }}>
            {parseInt(metrics.low_stock_count || 0, 10)} صنف
          </div>
          <div className="stock-metric-subtext">أصناف قاربت على النفاد وتحتاج أمر شراء</div>
        </div>
      </div>

      {/* ── 2. جدول الشحنات النشطة قيد النقل + جدول الحركات اللحظية ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* بضاعة الطريق قيد النقل بين الفروع */}
        <div className="stock-grid-wrapper">
          <div className="stock-grid-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '13px', color: 'var(--stock-text)' }}>
              <Truck size={16} color="#0284c7" />
              <span>الشحنات قيد النقل حالياً (In-Transit)</span>
            </div>
            <button
              type="button"
              className="stock-menu-trigger-btn"
              onClick={() => onNavigateTab('transfers')}
              style={{ fontSize: '11.5px', color: 'var(--stock-primary)' }}
            >
              عرض كافة التحويلات ⬅️
            </button>
          </div>

          <div className="stock-table-container" style={{ maxHeight: '320px' }}>
            <table className="stock-data-table">
              <thead>
                <tr>
                  <th>رقم التحويل</th>
                  <th>من مستودع</th>
                  <th>إلى مستودع</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {inTransitTransfers.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--stock-text-muted)' }}>
                      لا توجد شحنات قيد النقل حالياً. كافة التحويلات مستقرة ومستلمة.
                    </td>
                  </tr>
                ) : (
                  inTransitTransfers.map((tr) => (
                    <tr key={tr.id}>
                      <td style={{ fontWeight: 800, color: 'var(--stock-primary)' }}>{tr.transfer_number}</td>
                      <td>{tr.from_name}</td>
                      <td>{tr.to_name}</td>
                      <td>{new Date(tr.created_at).toLocaleDateString('ar-EG')}</td>
                      <td>
                        <span className="stock-badge info">🚚 قيد النقل</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="stock-menu-trigger-btn"
                          onClick={() => onOpenTransferDetails?.(tr)}
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                        >
                          فحص واستلام
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* آخر حركات دفتر الأستاذ المخزني الدائم */}
        <div className="stock-grid-wrapper">
          <div className="stock-grid-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '13px', color: 'var(--stock-text)' }}>
              <FileText size={16} color="#059669" />
              <span>آخر حركات دفتر الأستاذ الدائم (Immutable Ledger)</span>
            </div>
            <button
              type="button"
              className="stock-menu-trigger-btn"
              onClick={() => onNavigateTab('ledger')}
              style={{ fontSize: '11.5px', color: 'var(--stock-primary)' }}
            >
              عرض دفتر الأستاذ ⬅️
            </button>
          </div>

          <div className="stock-table-container" style={{ maxHeight: '320px' }}>
            <table className="stock-data-table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>نوع الحركة</th>
                  <th>الكمية</th>
                  <th>المستودع</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {recentMovements.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--stock-text-muted)' }}>
                      لا توجد حركات مسجلة حديثاً في دفتر الأستاذ.
                    </td>
                  </tr>
                ) : (
                  recentMovements.map((mov) => {
                    const isCredit = mov.quantity_delta > 0;
                    return (
                      <tr key={mov.id}>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--stock-text)' }}>{mov.med_name || 'صنف دوائي'}</div>
                          {mov.batch_number && (
                            <div style={{ fontSize: '10px', color: 'var(--stock-text-dim)' }}>تشغيلة: {mov.batch_number}</div>
                          )}
                        </td>
                        <td>
                          <span
                            className={`stock-badge ${
                              mov.movement_type === 'sale'
                                ? 'danger'
                                : mov.movement_type === 'receipt'
                                ? 'success'
                                : mov.movement_type === 'sale_return'
                                ? 'info'
                                : 'warning'
                            }`}
                          >
                            {mov.movement_type === 'sale'
                              ? '🔴 بيع POS'
                              : mov.movement_type === 'sale_return'
                              ? '🔄 مرتجع POS'
                              : mov.movement_type === 'receipt'
                              ? '🟢 استلام مورد'
                              : mov.movement_type === 'transfer_out'
                              ? '📤 تحويل صادر'
                              : mov.movement_type === 'transfer_in'
                              ? '📥 تحويل وارد'
                              : mov.movement_type}
                          </span>
                        </td>
                        <td
                          style={{
                            fontWeight: 900,
                            direction: 'ltr',
                            textAlign: 'right',
                            color: isCredit ? '#059669' : '#dc2626'
                          }}
                        >
                          {isCredit ? `+${mov.quantity_delta}` : mov.quantity_delta}
                        </td>
                        <td>{mov.location_name || 'المستودع الرئيسي'}</td>
                        <td style={{ fontSize: '11px', color: 'var(--stock-text-muted)' }}>
                          {new Date(mov.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
