import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Truck,
  Building,
  CheckCircle2,
  Send,
  RefreshCw,
  Sliders,
  DollarSign,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckSquare,
  Square
} from 'lucide-react';
import { stockGetReorderSuggestions, stockCreateBatchTransfer } from '../../utils/stockApiClient';

export default function StockReorderTab({
  locations = [],
  showToast,
  onNavigateTab
}) {
  const [selectedLocationId, setSelectedLocationId] = useState('loc_central');
  const [lookbackDays, setLookbackDays] = useState(30);
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  const [targetBufferDays, setTargetBufferDays] = useState(14);
  const [urgencyFilter, setUrgencyFilter] = useState('all');

  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [editedQuantities, setEditedQuantities] = useState({});

  const [isCreatingTransfer, setIsCreatingTransfer] = useState(false);

  // تحميل المقترحات
  const loadSuggestions = async () => {
    try {
      setIsLoading(true);
      const res = await stockGetReorderSuggestions({
        locationId: selectedLocationId,
        lookbackDays,
        leadTimeDays,
        targetBufferDays
      });

      if (res?.success) {
        const items = res.items || [];
        setSuggestions(items);

        // تحديد افتراضي للأصناف الحرجة وذات الأولوية
        const initialSelected = new Set();
        const initialQtys = {};
        items.forEach(it => {
          if (it.urgency === 'critical' || it.urgency === 'warning') {
            initialSelected.add(it.medication_id);
          }
          initialQtys[it.medication_id] = it.suggested_qty;
        });
        setSelectedItemIds(initialSelected);
        setEditedQuantities(initialQtys);
      } else {
        showToast?.(res?.error || 'فشل تحميل مقترحات إعادة الطلب', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'حدث خطأ أثناء تحليل معدلات الاستهلاك', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [selectedLocationId, lookbackDays, leadTimeDays]);

  // تبديل اختيار صنف واحد
  const toggleItemSelect = (id) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // تبديل اختيار الكل
  const toggleSelectAll = () => {
    if (selectedItemIds.size === filteredSuggestions.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredSuggestions.map(i => i.medication_id)));
    }
  };

  // تغيير الكمية المقترحة
  const handleQuantityChange = (id, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setEditedQuantities(prev => ({ ...prev, [id]: num }));
  };

  // فلترة المقترحات
  const filteredSuggestions = suggestions.filter(item => {
    if (urgencyFilter === 'critical') return item.urgency === 'critical';
    if (urgencyFilter === 'warning') return item.urgency === 'warning';
    if (urgencyFilter === 'central_transfer') return item.recommended_source === 'central_transfer';
    return true;
  });

  // حساب مؤشرات الملخص
  const criticalCount = suggestions.filter(i => i.urgency === 'critical').length;
  const warningCount = suggestions.filter(i => i.urgency === 'warning').length;
  const totalEstimatedCost = Array.from(selectedItemIds).reduce((acc, id) => {
    const item = suggestions.find(i => i.medication_id === id);
    if (!item) return acc;
    const qty = editedQuantities[id] !== undefined ? editedQuantities[id] : item.suggested_qty;
    return acc + (qty * (item.cost_price || 0));
  }, 0);

  // إنشاء أمر تحويل فروع آلي من المقترحات المختارة
  const handleCreateAutoTransfer = async () => {
    if (selectedItemIds.size === 0) {
      showToast?.('يرجى اختيار صنف واحد على الأقل لإنشاء أمر التحويل', 'warning');
      return;
    }

    if (selectedLocationId === 'loc_central') {
      showToast?.('أمر التحويل الآلي مخصص لتغذية الفروع من المخزن الرئيسي. لتوريد المخزن الرئيسي يرجى استخدام فاتورة المشتريات.', 'info');
      return;
    }

    try {
      setIsCreatingTransfer(true);
      const itemsToTransfer = Array.from(selectedItemIds).map(id => {
        const it = suggestions.find(s => s.medication_id === id);
        return {
          medication_id: id,
          quantity: editedQuantities[id] !== undefined ? editedQuantities[id] : it.suggested_qty,
          cost_price: it?.cost_price || 0,
          unit_type: it?.unit_type || 'pack'
        };
      }).filter(i => i.quantity > 0);

      const res = await stockCreateBatchTransfer({
        source_location_id: 'loc_central',
        destination_location_id: selectedLocationId,
        items: itemsToTransfer,
        notes: `أمر تحويل تغذية ذكي مولد آلياً للفرع (${selectedLocationId})`
      });

      if (res?.success) {
        showToast?.(res.message || 'تم إنشاء أمر التحويل الآلي بنجاح', 'success');
        if (onNavigateTab) onNavigateTab('transfers');
      } else {
        showToast?.(res?.error || 'فشل إنشاء أمر التحويل', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'حدث خطأ أثناء إنشاء أمر التحويل', 'error');
    } finally {
      setIsCreatingTransfer(false);
    }
  };

  return (
    <div className="stock-reorder-container">
      {/* ── لوحة التحكم ومحددات التخطيط ── */}
      <div className="stock-card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingUp size={22} color="#0284c7" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--stock-text-main)' }}>
                محرك الذكاء التحليلي لإعادة الطلب وتخطيط الاحتياجات (Demand & Reorder AI)
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>
                يحسب معدل السحب اليومي الفعلي (Run-Rate) وحد الأمان وفترة التوريد ويقترح أوامر التحويل والتوريد المثالية
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--stock-text-main)' }}>المستودع المستهدف:</label>
              <select
                className="stock-select-filter"
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                style={{ fontWeight: 700, minWidth: '180px' }}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name_ar} {loc.is_central ? '(المخزن الرئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--stock-text-main)' }}>فترة المبيعات:</label>
              <select
                className="stock-select-filter"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
              >
                <option value={15}>آخر 15 يوماً</option>
                <option value={30}>آخر 30 يوماً</option>
                <option value={60}>آخر 60 يوماً</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--stock-text-main)' }}>زمن التوريد:</label>
              <select
                className="stock-select-filter"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(Number(e.target.value))}
              >
                <option value={3}>3 أيام</option>
                <option value={7}>7 أيام (أسبوع)</option>
                <option value={14}>14 يوماً (أسبوعين)</option>
              </select>
            </div>

            <button
              type="button"
              className="stock-quick-action-btn outline"
              onClick={loadSuggestions}
              disabled={isLoading}
              title="إعادة احتساب المؤشرات"
            >
              <RefreshCw size={14} className={isLoading ? 'spin-animate' : ''} />
              <span>تحديث التحليل</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── بطاقات المؤشرات السريعة KPI ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
        <div className="stock-kpi-card danger" style={{ background: 'var(--stock-surface)', border: '1px solid var(--stock-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--stock-text-muted)' }}>أصناف حرجة (نفاد وشيك):</span>
            <AlertCircle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444', marginTop: '6px' }}>
            {criticalCount} <span style={{ fontSize: '13px', fontWeight: 600 }}>صنف</span>
          </div>
        </div>

        <div className="stock-kpi-card warning" style={{ background: 'var(--stock-surface)', border: '1px solid var(--stock-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--stock-text-muted)' }}>تحت حد الأمان (Safety Stock):</span>
            <AlertCircle size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#f59e0b', marginTop: '6px' }}>
            {warningCount} <span style={{ fontSize: '13px', fontWeight: 600 }}>صنف</span>
          </div>
        </div>

        <div className="stock-kpi-card info" style={{ background: 'var(--stock-surface)', border: '1px solid var(--stock-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--stock-text-muted)' }}>الأصناف المحددة للطلب:</span>
            <Package size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0284c7', marginTop: '6px' }}>
            {selectedItemIds.size} <span style={{ fontSize: '13px', fontWeight: 600 }}>من {filteredSuggestions.length}</span>
          </div>
        </div>

        <div className="stock-kpi-card success" style={{ background: 'var(--stock-surface)', border: '1px solid var(--stock-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--stock-text-muted)' }}>إجمالي تكلفة الأصناف المحددة:</span>
            <DollarSign size={18} color="#059669" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '6px' }}>
            {totalEstimatedCost.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '13px', fontWeight: 600 }}>ج</span>
          </div>
        </div>
      </div>

      {/* ── شريط الإجراءات والفلترة ── */}
      <div className="stock-card" style={{ marginBottom: '12px', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="stock-table-row-btn"
            onClick={toggleSelectAll}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
          >
            {selectedItemIds.size === filteredSuggestions.length && filteredSuggestions.length > 0 ? (
              <CheckSquare size={16} color="#0284c7" />
            ) : (
              <Square size={16} />
            )}
            <span>تحديد الكل ({filteredSuggestions.length})</span>
          </button>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`stock-pill-btn ${urgencyFilter === 'all' ? 'active' : ''}`}
              onClick={() => setUrgencyFilter('all')}
            >
              الكل ({suggestions.length})
            </button>
            <button
              type="button"
              className={`stock-pill-btn ${urgencyFilter === 'critical' ? 'active' : ''}`}
              onClick={() => setUrgencyFilter('critical')}
              style={{ color: urgencyFilter === 'critical' ? '#ffffff' : '#ef4444' }}
            >
              حرجة فقط ({criticalCount})
            </button>
            <button
              type="button"
              className={`stock-pill-btn ${urgencyFilter === 'warning' ? 'active' : ''}`}
              onClick={() => setUrgencyFilter('warning')}
            >
              تحذير ({warningCount})
            </button>
            {selectedLocationId !== 'loc_central' && (
              <button
                type="button"
                className={`stock-pill-btn ${urgencyFilter === 'central_transfer' ? 'active' : ''}`}
                onClick={() => setUrgencyFilter('central_transfer')}
              >
                متوفر بالرئيسي للتحويل
              </button>
            )}
          </div>
        </div>

        {selectedLocationId !== 'loc_central' ? (
          <button
            type="button"
            className="stock-quick-action-btn primary"
            onClick={handleCreateAutoTransfer}
            disabled={isCreatingTransfer || selectedItemIds.size === 0}
            style={{ fontWeight: 800, padding: '0 20px', height: '40px' }}
          >
            <Send size={15} />
            <span>إنشاء أمر تحويل فروع آلي ({selectedItemIds.size} صنف)</span>
          </button>
        ) : (
          <span style={{ fontSize: '13px', color: 'var(--stock-text-muted)', fontWeight: 600 }}>
            * يتم اعتماد مقترحات المخزن الرئيسي كمسودة مشتريات وتوريد
          </span>
        )}
      </div>

      {/* ── جدول مقترحات إعادة الطلب ── */}
      <div className="stock-table-container">
        <table className="stock-data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>اسم الصنف الدوائي</th>
              <th>الرصيد بالفرع</th>
              <th>رصيد المخزن الرئيسي</th>
              <th>معدل السحب/يوم</th>
              <th>أيام المخزون</th>
              <th>حد الأمان / الطلب</th>
              <th style={{ width: '130px' }}>الكمية المقترحة</th>
              <th>التكلفة التقديرية</th>
              <th>المصدر المقترح</th>
              <th>مستوى الخطورة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} className="stock-table-empty">
                  جاري تحليل حركة المخزون ومعدل الاستهلاك الفعلي...
                </td>
              </tr>
            ) : filteredSuggestions.length === 0 ? (
              <tr>
                <td colSpan={11} className="stock-table-empty">
                  جميع الأصناف في هذا المستودع ضمن الحدود الآمنة ولا تحتاج لإعادة طلب حالياً.
                </td>
              </tr>
            ) : (
              filteredSuggestions.map((item) => {
                const isSelected = selectedItemIds.has(item.medication_id);
                const currentQty = editedQuantities[item.medication_id] !== undefined
                  ? editedQuantities[item.medication_id]
                  : item.suggested_qty;
                const cost = currentQty * (item.cost_price || 0);

                return (
                  <tr
                    key={item.medication_id}
                    style={{
                      background: isSelected ? 'var(--stock-surface-2)' : undefined,
                      borderRight: item.urgency === 'critical' ? '3px solid #ef4444' : undefined
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelect(item.medication_id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, color: 'var(--stock-text-main)' }}>
                        {item.trade_name_ar}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--stock-text-muted)' }}>
                        {item.trade_name_en} {item.barcode ? `| ${item.barcode}` : ''}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: item.current_stock <= 0 ? '#ef4444' : 'var(--stock-text-main)' }}>
                        {item.current_stock}
                      </strong>
                    </td>
                    <td>
                      <strong style={{ color: item.central_available_stock > 0 ? '#0284c7' : '#94a3b8' }}>
                        {item.central_available_stock}
                      </strong>
                    </td>
                    <td>
                      <span>{item.daily_run_rate} / يوم</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, color: item.days_of_stock_left <= 2 ? '#ef4444' : (item.days_of_stock_left <= 5 ? '#f59e0b' : '#10b981') }}>
                        {item.days_of_stock_left} يوم
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      <span>حد أمان: {item.safety_stock}</span> / <span>طلب: {item.reorder_point}</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        className="stock-input"
                        style={{ width: '90px', padding: '6px 8px', textAlign: 'center', fontWeight: 800, height: '32px' }}
                        value={currentQty}
                        onChange={(e) => handleQuantityChange(item.medication_id, e.target.value)}
                      />
                    </td>
                    <td style={{ fontWeight: 700, color: '#059669' }}>
                      {cost.toFixed(2)} ج
                    </td>
                    <td>
                      {item.recommended_source === 'central_transfer' ? (
                        <span className="stock-status-chip info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Building size={12} />
                          <span>تحويل من الرئيسي</span>
                        </span>
                      ) : (
                        <span className="stock-status-chip warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Truck size={12} />
                          <span>شراء من مورد</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`stock-status-chip ${item.urgency === 'critical' ? 'danger' : (item.urgency === 'warning' ? 'warning' : 'success')}`}>
                        {item.urgency === 'critical' ? 'حرج جداً' : (item.urgency === 'warning' ? 'تحت الأمان' : 'مثالي')}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
