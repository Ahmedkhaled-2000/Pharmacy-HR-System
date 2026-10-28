import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Layers,
  Wrench,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
  Download,
  DollarSign,
  TrendingUp,
  Package
} from 'lucide-react';

// محرك تطبيع الحروف للبحث الصوتي والتقريبي للأدوية (Phonetic & Fuzzy Normalization)
const normalizePhonetic = (text) => {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // إزالة التشكيل
    .replace(/ph/g, 'f')
    .replace(/[\s\-_]+/g, '');
};

export default function StockExplorerTab({
  balances = [],
  locations = [],
  categories = [],
  isLoading = false,
  onReconcile,
  onOpenAdjustment,
  onViewBatches
}) {
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [filterNegativeStock, setFilterNegativeStock] = useState(false);

  // الفلترة الذكية بالبحث الصوتي والتقريبي
  const filteredBalances = useMemo(() => {
    const rawSearch = search.trim();
    const normSearch = normalizePhonetic(rawSearch);

    return balances.filter((b) => {
      if (selectedLocation && b.location_id !== selectedLocation) return false;
      if (selectedCategory && b.category !== selectedCategory) return false;

      const qty = parseFloat(b.qty_base || 0);
      const minAlert = parseFloat(b.min_alert_qty || 5);

      if (filterLowStock && qty > minAlert) return false;
      if (filterNegativeStock && qty >= 0) return false;

      if (!rawSearch) return true;

      const nameAr = String(b.name_ar || '');
      const nameEn = String(b.name_en || '');
      const barcode = String(b.barcode || '').toLowerCase();

      // بحث مباشر أو صوتي تقريبي
      if (barcode.includes(rawSearch.toLowerCase())) return true;
      if (normalizePhonetic(nameAr).includes(normSearch)) return true;
      if (normalizePhonetic(nameEn).includes(normSearch)) return true;
      if (nameAr.toLowerCase().includes(rawSearch.toLowerCase())) return true;
      if (nameEn.toLowerCase().includes(rawSearch.toLowerCase())) return true;

      return false;
    });
  }, [balances, search, selectedLocation, selectedCategory, filterLowStock, filterNegativeStock]);

  // حساب مؤشرات المعاينة الفورية
  const summaryMetrics = useMemo(() => {
    let costVal = 0;
    let pubVal = 0;
    let lowCount = 0;
    let negCount = 0;

    filteredBalances.forEach(b => {
      const q = parseFloat(b.qty_base || 0);
      const c = parseFloat(b.avg_cost_price || b.unit_price_cost || 0);
      const p = parseFloat(b.public_price || 0);
      const min = parseFloat(b.min_alert_qty || 5);

      costVal += (q * c);
      pubVal += (q * p);
      if (q <= min && q > 0) lowCount++;
      if (q < 0) negCount++;
    });

    return {
      costValuation: Math.max(0, costVal),
      publicValuation: Math.max(0, pubVal),
      lowCount,
      negCount
    };
  }, [filteredBalances]);

  // تصدير الأرصدة إلى CSV
  const handleExportCSV = () => {
    if (filteredBalances.length === 0) return;
    const headers = ['الصنف العربي', 'الصنف الإنجليزي', 'الباركود', 'المستودع', 'الرصيد الفعلي', 'المحجوز', 'المتاح', 'سعر التكلفة', 'سعر البيع', 'إجمالي القيمة'];
    const rows = filteredBalances.map(b => [
      `"${b.name_ar || ''}"`,
      `"${b.name_en || ''}"`,
      `"${b.barcode || ''}"`,
      `"${b.location_name || ''}"`,
      parseFloat(b.qty_base || 0),
      parseFloat(b.qty_reserved || 0),
      parseFloat(b.qty_base || 0) - parseFloat(b.qty_reserved || 0),
      parseFloat(b.avg_cost_price || b.unit_price_cost || 0).toFixed(2),
      parseFloat(b.public_price || 0).toFixed(2),
      (parseFloat(b.qty_base || 0) * parseFloat(b.avg_cost_price || b.unit_price_cost || 0)).toFixed(2)
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `كشاف_أرصدة_المخازن_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      
      {/* ── لوحة مؤشرات الأرصدة المعروضة ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}
      >
        <div className="stock-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={20} />
          </div>
          <div>
            <span style={{ fontSize: '11.5px', color: 'var(--stock-text-muted)', display: 'block' }}>إجمالي الأصناف المعروضة:</span>
            <strong style={{ fontSize: '16px', fontWeight: 900, color: 'var(--stock-text-main)' }}>
              {filteredBalances.length} صنف
            </strong>
          </div>
        </div>

        <div className="stock-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(5, 150, 105, 0.1)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <span style={{ fontSize: '11.5px', color: 'var(--stock-text-muted)', display: 'block' }}>إجمالي قيمة التكلفة:</span>
            <strong style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
              {summaryMetrics.costValuation.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج
            </strong>
          </div>
        </div>

        <div className="stock-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <span style={{ fontSize: '11.5px', color: 'var(--stock-text-muted)', display: 'block' }}>قيمة البيع للجمهور:</span>
            <strong style={{ fontSize: '16px', fontWeight: 900, color: 'var(--stock-text-main)' }}>
              {summaryMetrics.publicValuation.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج
            </strong>
          </div>
        </div>

        <div className="stock-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: summaryMetrics.lowCount > 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.08)', color: summaryMetrics.lowCount > 0 ? '#d97706' : 'var(--stock-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <span style={{ fontSize: '11.5px', color: 'var(--stock-text-muted)', display: 'block' }}>تحت حد الأمان (نواقص):</span>
            <strong style={{ fontSize: '16px', fontWeight: 900, color: summaryMetrics.lowCount > 0 ? '#d97706' : 'var(--stock-text-main)' }}>
              {summaryMetrics.lowCount} صنف
            </strong>
          </div>
        </div>
      </div>

      <div className="stock-grid-wrapper">
        {/* ── شريط أدوات البحث والتصفية المتطورة ── */}
        <div className="stock-grid-toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
            {/* مربع البحث مع محرك صوتي */}
            <div className="stock-search-input-box" style={{ minWidth: '280px' }}>
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="ابحث بالاسم العربي، الإنجليزي، الصوتي (بانادول/Panadol)، أو الباركود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* فلتر المستودع */}
            <select
              className="stock-select-filter"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="">🏢 كافة المستودعات والفروع</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name || loc.name_ar} {loc.is_central ? '⭐ (مركزي)' : ''}
                </option>
              ))}
            </select>

            {/* فلتر التصنيف */}
            {categories.length > 0 && (
              <select
                className="stock-select-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">🏷️ كافة التصنيفات</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {/* فلاتر سريعة */}
            <button
              type="button"
              className={`stock-menu-trigger-btn ${filterLowStock ? 'active' : ''}`}
              onClick={() => setFilterLowStock(!filterLowStock)}
              style={{ fontSize: '11.5px' }}
            >
              <AlertTriangle size={13} color="#fbbf24" />
              <span>نواقص فقط</span>
            </button>

            <button
              type="button"
              className={`stock-menu-trigger-btn ${filterNegativeStock ? 'active' : ''}`}
              onClick={() => setFilterNegativeStock(!filterNegativeStock)}
              style={{ fontSize: '11.5px', color: filterNegativeStock ? '#f87171' : undefined }}
            >
              <AlertCircle size={13} color="#ef4444" />
              <span>أرصدة سالبة (أوفلاين)</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="stock-quick-action-btn outline"
              onClick={handleExportCSV}
              style={{ fontSize: '12px', padding: '5px 12px' }}
            >
              <Download size={13} />
              <span>تصدير CSV</span>
            </button>
          </div>
        </div>

        {/* ── جدول الأرصدة المريح للعين ── */}
        <div className="stock-table-container">
          <table className="stock-data-table">
            <thead>
              <tr>
                <th>الصنف الدوائي</th>
                <th>الباركود</th>
                <th>المستودع / الموقع</th>
                <th style={{ textAlign: 'center' }}>الرصيد الفعلي</th>
                <th style={{ textAlign: 'center' }}>المحجوز</th>
                <th style={{ textAlign: 'center' }}>المتاح للبيع</th>
                <th style={{ textAlign: 'center' }}>سعر التكلفة</th>
                <th style={{ textAlign: 'center' }}>سعر الجمهور</th>
                <th style={{ textAlign: 'center' }}>القيمة الإجمالية</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    جاري تحميل رصيد المستودعات من السيرفر السحابي...
                  </td>
                </tr>
              ) : filteredBalances.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    لا توجد أصناف مطابقة لمعايير البحث الحالية.
                  </td>
                </tr>
              ) : (
                filteredBalances.map((item) => {
                  const totalQty = parseFloat(item.qty_base || 0);
                  const reservedQty = parseFloat(item.qty_reserved || 0);
                  const availableQty = totalQty - reservedQty;
                  const costPrice = parseFloat(item.avg_cost_price || item.unit_price_cost || 0);
                  const publicPrice = parseFloat(item.public_price || 0);
                  const totalValuation = totalQty * costPrice;
                  const isNegative = totalQty < 0;
                  const isLow = totalQty > 0 && totalQty <= parseFloat(item.min_alert_qty || 5);

                  return (
                    <tr
                      key={item.id}
                      className={isNegative ? 'row-danger' : isLow ? 'row-warning' : ''}
                    >
                      <td>
                        <div style={{ fontWeight: 800, color: 'var(--stock-text-main)' }}>{item.name_ar || 'بدون اسم'}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--stock-text-muted)' }}>{item.name_en}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--stock-font-mono)', fontSize: '11px', color: 'var(--stock-text-muted)' }}>
                        {item.barcode || '—'}
                      </td>
                      <td>
                        <span className="stock-badge info">{item.location_name || 'المستودع الرئيسي'}</span>
                      </td>
                      <td
                        style={{
                          fontWeight: 900,
                          fontSize: '13px',
                          direction: 'ltr',
                          textAlign: 'center',
                          color: isNegative ? '#ef4444' : 'var(--stock-text-main)'
                        }}
                      >
                        {totalQty.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ direction: 'ltr', textAlign: 'center', color: 'var(--stock-text-muted)' }}>
                        {reservedQty.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}
                      </td>
                      <td
                        style={{
                          fontWeight: 800,
                          direction: 'ltr',
                          textAlign: 'center',
                          color: availableQty > 0 ? '#059669' : '#d97706'
                        }}
                      >
                        {availableQty.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ direction: 'ltr', textAlign: 'center' }}>
                        {costPrice.toFixed(2)} ج
                      </td>
                      <td style={{ direction: 'ltr', textAlign: 'center', fontWeight: 800 }}>
                        {publicPrice.toFixed(2)} ج
                      </td>
                      <td style={{ direction: 'ltr', textAlign: 'center', fontWeight: 900, color: '#0284c7' }}>
                        {totalValuation.toFixed(2)} ج
                      </td>
                      <td>
                        {isNegative ? (
                          <span className="stock-badge danger">⚠️ رصيد سالب (أوفلاين)</span>
                        ) : isLow ? (
                          <span className="stock-badge warning">⚡ شارف على النفاد</span>
                        ) : (
                          <span className="stock-badge success">✅ متوفر ومستقر</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="stock-menu-trigger-btn"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            title="عرض التشغيلات وتواريخ الصلاحية (FEFO)"
                            onClick={() => onViewBatches?.(item)}
                          >
                            <Clock size={12} color="#fbbf24" />
                            <span>التشغيلات</span>
                          </button>

                          <button
                            type="button"
                            className="stock-menu-trigger-btn"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            title="مطابقة الرصيد ذرياً مع دفتر الأستاذ الدائم"
                            onClick={() => onReconcile?.(item.medication_id, item.location_id)}
                          >
                            <RefreshCw size={12} color="#10b981" />
                            <span>مطابقة</span>
                          </button>

                          <button
                            type="button"
                            className="stock-menu-trigger-btn"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            title="تعديل أو تسوية الرصيد يدوياً"
                            onClick={() => onOpenAdjustment?.(item)}
                          >
                            <Wrench size={12} color="#38bdf8" />
                            <span>تسوية</span>
                          </button>
                        </div>
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
  );
}
