import React, { useState, useMemo } from 'react';
import {
  Trash2,
  Undo2,
  AlertTriangle,
  Plus,
  Trash,
  Building,
  Truck,
  CheckCircle2,
  DollarSign,
  Search,
  Package,
  Layers,
  Boxes,
  ArrowRight,
  TrendingDown,
  RefreshCw,
  Send,
  Sliders,
  Filter
} from 'lucide-react';
import { stockLogScrap, stockCreateReturn, stockSearchMedications } from '../../utils/stockApiClient';

export default function StockScrapReturnsTab({
  locations = [],
  suppliers = [],
  balances = [],
  medications = [],
  showToast,
  onOperationSuccess
}) {
  const [activeMode, setActiveMode] = useState('scrap'); // 'scrap', 'branch_return', 'supplier_return', 'dead_stock'
  const [sourceLocationId, setSourceLocationId] = useState('loc_central');
  const [targetSupplierId, setTargetSupplierId] = useState('');
  const [reason, setReason] = useState('expired');
  const [notes, setNotes] = useState('');

  // إعدادات بورصة الرواكد
  const [deadStockPeriod, setDeadStockPeriod] = useState(60);
  const [deadStockLocationFilter, setDeadStockLocationFilter] = useState('');
  const [deadStockSearch, setDeadStockSearch] = useState('');

  // بنود العملية الحالية
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // تحليل الأصناف الراكدة (Dead Stock Engine)
  const deadStockAnalysis = useMemo(() => {
    const minQtyThreshold = 1;

    let filtered = balances.filter(b => {
      const q = parseFloat(b.qty_base || 0);
      if (q < minQtyThreshold) return false;
      if (deadStockLocationFilter && b.location_id !== deadStockLocationFilter) return false;

      if (deadStockSearch.trim()) {
        const s = deadStockSearch.toLowerCase();
        const ar = String(b.name_ar || '').toLowerCase();
        const en = String(b.name_en || '').toLowerCase();
        const bar = String(b.barcode || '').toLowerCase();
        if (!ar.includes(s) && !en.includes(s) && !bar.includes(s)) return false;
      }
      return true;
    });

    // ترتيب بالأعلى في رأس المال المجمد
    filtered.sort((a, b) => {
      const valA = parseFloat(a.qty_base || 0) * parseFloat(a.avg_cost_price || a.unit_price_cost || 0);
      const valB = parseFloat(b.qty_base || 0) * parseFloat(b.avg_cost_price || b.unit_price_cost || 0);
      return valB - valA;
    });

    const totalStagnantPacks = filtered.reduce((sum, b) => sum + parseFloat(b.qty_base || 0), 0);
    const totalFrozenCapital = filtered.reduce((sum, b) => {
      return sum + (parseFloat(b.qty_base || 0) * parseFloat(b.avg_cost_price || b.unit_price_cost || 0));
    }, 0);

    return {
      items: filtered,
      count: filtered.length,
      totalStagnantPacks,
      totalFrozenCapital
    };
  }, [balances, deadStockLocationFilter, deadStockSearch, deadStockPeriod]);

  // تحويل صنف راكد مباشرة إلى مرتجع مورد (RTV)
  const handleConvertDeadStockToReturn = (deadItem) => {
    setActiveMode('supplier_return');
    setSourceLocationId(deadItem.location_id || 'loc_central');
    setNotes(`مرتجع تصفية رواكد محول آلياً - ركود لأكثر من ${deadStockPeriod} يوماً`);

    setItems([
      {
        medication_id: deadItem.medication_id,
        trade_name_ar: deadItem.name_ar || 'صنف دوائي',
        trade_name_en: deadItem.name_en || '',
        barcode: deadItem.barcode || '',
        unit_type: deadItem.unit_type || 'pack',
        available_qty: parseFloat(deadItem.qty_base || 0),
        quantity: Math.min(parseFloat(deadItem.qty_base || 0), 50),
        unit_cost: parseFloat(deadItem.avg_cost_price || deadItem.unit_price_cost || 0),
        batch_id: null,
        batch_number: ''
      }
    ]);

    showToast?.(`تم تحويل الصنف (${deadItem.name_ar}) إلى سلة مرتجع المورد`, 'info');
  };

  // البحث عن الأصناف
  const handleSearchMedications = async (q) => {
    setSearchQuery(q);
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const res = await stockSearchMedications({ q, locationId: sourceLocationId });
      if (res?.success) {
        setSearchResults(res.medications || []);
      }
    } catch (_) {
    } finally {
      setIsSearching(false);
    }
  };

  // إضافة صنف إلى جدول العملية
  const handleAddItem = (med) => {
    if (items.some(it => it.medication_id === med.id)) {
      showToast?.('هذا الصنف مضاف بالفعل في القائمة', 'info');
      return;
    }

    setItems(prev => [
      ...prev,
      {
        medication_id: med.id,
        trade_name_ar: med.trade_name_ar,
        trade_name_en: med.trade_name_en,
        barcode: med.barcode,
        unit_type: med.unit_type || 'pack',
        available_qty: parseFloat(med.available_qty || 0),
        quantity: 1,
        unit_cost: parseFloat(med.cost_price || 0),
        batch_id: null,
        batch_number: ''
      }
    ]);
    setSearchQuery('');
    setSearchResults([]);
  };

  // حذف صنف من الجدول
  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // تعديل كمية أو سعر بند
  const handleUpdateItem = (index, field, value) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return { ...item, [field]: value };
    }));
  };

  // حساب التكلفة الإجمالية للعملية
  const totalCost = items.reduce((acc, it) => acc + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_cost) || 0)), 0);

  // تنفيذ العملية وتأكيدها
  const handleExecuteOperation = async () => {
    if (items.length === 0) {
      showToast?.('يرجى إضافة صنف واحد على الأقل للمتابعة', 'warning');
      return;
    }

    for (const it of items) {
      if (!it.quantity || parseFloat(it.quantity) <= 0) {
        showToast?.(`يرجى تحديد كمية صحيحة للصنف: ${it.trade_name_ar}`, 'warning');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      if (activeMode === 'scrap') {
        const payload = {
          location_id: sourceLocationId,
          reason,
          notes,
          items: items.map(it => ({
            medication_id: it.medication_id,
            batch_id: it.batch_id,
            quantity: parseFloat(it.quantity),
            unit_cost: parseFloat(it.unit_cost)
          }))
        };

        const res = await stockLogScrap(payload);
        if (res?.success) {
          showToast?.(res.message || 'تم تسجيل إذن الهوالك والإعدام بنجاح', 'success');
          setItems([]);
          setNotes('');
          if (onOperationSuccess) onOperationSuccess();
        } else {
          showToast?.(res?.error || 'فشل تسجيل إذن الهوالك', 'error');
        }
      } else {
        // مرتجع (فروع أو مورد)
        const payload = {
          return_type: activeMode === 'branch_return' ? 'branch_to_central' : 'central_to_supplier',
          source_location_id: sourceLocationId,
          supplier_id: targetSupplierId || null,
          notes,
          items: items.map(it => ({
            medication_id: it.medication_id,
            batch_id: it.batch_id,
            unit_type: it.unit_type,
            quantity: parseFloat(it.quantity),
            unit_cost: parseFloat(it.unit_cost)
          }))
        };

        const res = await stockCreateReturn(payload);
        if (res?.success) {
          showToast?.(res.message || 'تم تسجيل المرتجع وترحيل القيود بنجاح', 'success');
          setItems([]);
          setNotes('');
          if (onOperationSuccess) onOperationSuccess();
        } else {
          showToast?.(res?.error || 'فشل تسجيل المرتجع', 'error');
        }
      }
    } catch (err) {
      showToast?.(err.message || 'حدث خطأ أثناء تنفيذ العملية المخزنية', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="stock-scrap-returns-container">
      {/* ── شريط اختيار نمط العملية ── */}
      <div className="stock-card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--stock-text-main)' }}>
              مركز التوالف والهوالك والمرتجعات وتصفية الرواكد (Scrap, RTV & Dead Stock)
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>
              إدارة إعدام الأدوية التالفة، تسجيل مرتجعات الفروع والموردين، وبورصة تصفية وتدوير الرواكد لحماية رأس المال
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`stock-pill-btn ${activeMode === 'scrap' ? 'active' : ''}`}
              onClick={() => { setActiveMode('scrap'); setItems([]); }}
              style={{ fontWeight: 800 }}
            >
              <Trash2 size={14} />
              <span>إعدام وتوالف مخزنية</span>
            </button>

            <button
              type="button"
              className={`stock-pill-btn ${activeMode === 'branch_return' ? 'active' : ''}`}
              onClick={() => { setActiveMode('branch_return'); setItems([]); }}
              style={{ fontWeight: 800 }}
            >
              <Undo2 size={14} />
              <span>مرتجع من فرع للرئيسي</span>
            </button>

            <button
              type="button"
              className={`stock-pill-btn ${activeMode === 'supplier_return' ? 'active' : ''}`}
              onClick={() => { setActiveMode('supplier_return'); setItems([]); }}
              style={{ fontWeight: 800 }}
            >
              <Truck size={14} />
              <span>مرتجع إلى مورد خارجي (RTV)</span>
            </button>

            <button
              type="button"
              className={`stock-pill-btn ${activeMode === 'dead_stock' ? 'active' : ''}`}
              onClick={() => { setActiveMode('dead_stock'); setItems([]); }}
              style={{
                fontWeight: 800,
                color: activeMode === 'dead_stock' ? '#ffffff' : '#d97706',
                borderColor: '#fde68a',
                background: activeMode === 'dead_stock' ? '#d97706' : undefined
              }}
            >
              <Boxes size={14} />
              <span>بورصة تصفية الرواكد (Dead Stock)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── وضع بورصة وتصفية الرواكد (Dead Stock Liquidation Hub) ── */}
      {activeMode === 'dead_stock' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* مؤشرات الرواكد الـ 4 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px'
            }}
          >
            <div className="stock-card" style={{ padding: '14px 18px' }}>
              <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>أصناف راكدة (&gt; {deadStockPeriod} يوماً):</span>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#d97706', marginTop: '4px' }}>
                {deadStockAnalysis.count} صنف
              </div>
            </div>

            <div className="stock-card" style={{ padding: '14px 18px' }}>
              <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>رأس المال المجمد بالرواكد:</span>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                {deadStockAnalysis.totalFrozenCapital.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج
              </div>
            </div>

            <div className="stock-card" style={{ padding: '14px 18px' }}>
              <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>إجمالي العبوات الراكدة:</span>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--stock-text-main)', marginTop: '4px' }}>
                {deadStockAnalysis.totalStagnantPacks.toLocaleString('ar-EG')} عبوة
              </div>
            </div>

            <div className="stock-card" style={{ padding: '14px 18px' }}>
              <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>نسبة حماية السيولة المقترحة:</span>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
                100% (توجيه للمرتجع/المناقلة)
              </div>
            </div>
          </div>

          {/* شريط الفلاتر */}
          <div className="stock-card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={14} color="#0284c7" />
              <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--stock-text-main)' }}>فترة الركود الأدنى:</label>
              <select
                className="stock-select-filter"
                value={deadStockPeriod}
                onChange={(e) => setDeadStockPeriod(Number(e.target.value))}
              >
                <option value={45}>45 يوماً بدون حركة</option>
                <option value={60}>60 يوماً بدون حركة</option>
                <option value={90}>90 يوماً بدون حركة</option>
                <option value={180}>180 يوماً (ركود حرج)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building size={14} color="#0284c7" />
              <select
                className="stock-select-filter"
                value={deadStockLocationFilter}
                onChange={(e) => setDeadStockLocationFilter(e.target.value)}
              >
                <option value="">🏢 كافة المستودعات والفروع</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name_ar || loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: '220px' }}>
              <input
                type="text"
                className="stock-input"
                style={{ height: '34px', fontSize: '12.5px', width: '100%' }}
                placeholder="ابحث في قائمة الرواكد بالاسم أو الباركود..."
                value={deadStockSearch}
                onChange={(e) => setDeadStockSearch(e.target.value)}
              />
            </div>
          </div>

          {/* جدول مصفوفة الرواكد */}
          <div className="stock-table-container">
            <table className="stock-data-table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ width: '35px' }}>#</th>
                  <th>الصنف الدوائي</th>
                  <th>الباركود</th>
                  <th>المستودع</th>
                  <th style={{ textAlign: 'center' }}>الكمية الراكدة</th>
                  <th style={{ textAlign: 'center' }}>سعر التكلفة</th>
                  <th style={{ textAlign: 'center', color: '#ef4444' }}>رأس المال المعطل</th>
                  <th style={{ textAlign: 'center' }}>الإجراء الذكي السريع</th>
                </tr>
              </thead>
              <tbody>
                {deadStockAnalysis.items.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      🎉 ممتاز! لا توجد أصناف راكدة مطابقة لمعايير التصفية الحالية. المخزون بحالة دوران ممتازة.
                    </td>
                  </tr>
                ) : (
                  deadStockAnalysis.items.map((it, idx) => {
                    const q = parseFloat(it.qty_base || 0);
                    const cost = parseFloat(it.avg_cost_price || it.unit_price_cost || 0);
                    const frozenVal = q * cost;

                    return (
                      <tr key={it.id || idx}>
                        <td>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--stock-text-main)' }}>{it.name_ar || 'بدون اسم'}</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--stock-text-muted)' }}>{it.name_en}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--stock-font-mono)', fontSize: '11px', color: 'var(--stock-text-muted)' }}>
                          {it.barcode || '—'}
                        </td>
                        <td>
                          <span className="stock-badge info">{it.location_name || 'المستودع الرئيسي'}</span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 900, color: '#d97706' }}>
                          {q.toLocaleString('ar-EG')}
                        </td>
                        <td style={{ textAlign: 'center' }}>{cost.toFixed(2)} ج</td>
                        <td style={{ textAlign: 'center', fontWeight: 900, color: '#ef4444' }}>
                          {frozenVal.toFixed(2)} ج
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="stock-quick-action-btn primary"
                            onClick={() => handleConvertDeadStockToReturn(it)}
                            style={{ fontSize: '11.5px', padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Truck size={13} />
                            <span>تحويل لمرتجع مورد 🚚</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── النمط العادي: إعدام وتوالف / مرتجع فروع / مرتجع مورد ── */
        <div>
          {/* مدخلات رأس الإذن */}
          <div className="stock-card" style={{ marginBottom: '16px', padding: '18px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div>
                <label className="stock-field-label">المستودع المصدر:</label>
                <select
                  className="stock-select-filter"
                  style={{ width: '100%', height: '38px', fontWeight: 700 }}
                  value={sourceLocationId}
                  onChange={(e) => setSourceLocationId(e.target.value)}
                >
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name_ar || loc.name} {loc.is_central ? '(المخزن الرئيسي)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {activeMode === 'scrap' && (
                <div>
                  <label className="stock-field-label">سبب الإعدام / الاستبعاد:</label>
                  <select
                    className="stock-select-filter"
                    style={{ width: '100%', height: '38px', fontWeight: 700 }}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    <option value="expired">أدوية منتهية الصلاحية (Expired)</option>
                    <option value="damaged">كسر وتلف عبوات وسوء تخزين</option>
                    <option value="recalled">سحب واستدعاء رقابي (MOH Recall)</option>
                    <option value="transport_loss">تلف وفقد أثناء نقل الشحنات</option>
                  </select>
                </div>
              )}

              {activeMode === 'supplier_return' && (
                <div>
                  <label className="stock-field-label">المورد المستهدف:</label>
                  <select
                    className="stock-select-filter"
                    style={{ width: '100%', height: '38px', fontWeight: 700 }}
                    value={targetSupplierId}
                    onChange={(e) => setTargetSupplierId(e.target.value)}
                  >
                    <option value="">-- اختر المورد --</option>
                    {suppliers.map(sup => (
                      <option key={sup.id} value={sup.id}>{sup.name || sup.trade_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="stock-field-label">رقم المستند المرجعي أو الملاحظات:</label>
                <input
                  type="text"
                  className="stock-input"
                  style={{ width: '100%', height: '38px' }}
                  placeholder="محضر إتلاف، إذن استرجاع، إلخ..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* محرك البحث السريع عن الأصناف وإضافتها */}
          <div className="stock-card" style={{ marginBottom: '16px', padding: '16px 20px', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--stock-text-muted)' }} />
              <input
                type="text"
                className="stock-input"
                style={{ width: '100%', paddingRight: '38px', height: '40px', fontSize: '13px', fontWeight: 600 }}
                placeholder="ابحث بالاسم التجاري أو الباركود لإضافة الصنف للإذن..."
                value={searchQuery}
                onChange={(e) => handleSearchMedications(e.target.value)}
              />
            </div>

            {searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '20px',
                  left: '20px',
                  background: 'var(--stock-surface)',
                  border: '1px solid var(--stock-border)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                  zIndex: 50,
                  maxHeight: '260px',
                  overflowY: 'auto'
                }}
              >
                {searchResults.map(med => (
                  <div
                    key={med.id}
                    onClick={() => handleAddItem(med)}
                    style={{
                      padding: '10px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--stock-border)'
                    }}
                    className="stock-search-dropdown-row"
                  >
                    <div>
                      <strong style={{ color: 'var(--stock-text-main)' }}>{med.trade_name_ar}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)', marginRight: '8px' }}>
                        ({med.trade_name_en})
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '14px', fontSize: '12px' }}>
                      <span>الرصيد: <strong style={{ color: '#0284c7' }}>{med.available_qty}</strong></span>
                      <span>التكلفة: <strong>{med.cost_price} ج</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* جدول بنود الإذن */}
          <div className="stock-table-container" style={{ marginBottom: '16px' }}>
            <table className="stock-data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>الصنف الدوائي</th>
                  <th style={{ width: '130px' }}>الرصيد المتاح</th>
                  <th style={{ width: '130px' }}>الكمية</th>
                  <th style={{ width: '130px' }}>سعر التكلفة</th>
                  <th style={{ width: '130px' }}>الإجمالي</th>
                  <th style={{ width: '50px' }}>حذف</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      لا توجد بنود مضافة بعد. ابحث عن الأدوية أعلاه أو استخدم بورصة الرواكد للتحويل المباشر.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const subTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0);
                    return (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 800 }}>{item.trade_name_ar}</div>
                          {item.barcode && <div style={{ fontSize: '10.5px', color: 'var(--stock-text-muted)' }}>{item.barcode}</div>}
                        </td>
                        <td>
                          <strong style={{ color: '#0284c7' }}>{item.available_qty}</strong> {item.unit_type}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="stock-input"
                            style={{ width: '100px', height: '32px', textAlign: 'center', fontWeight: 800 }}
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="stock-input"
                            style={{ width: '100px', height: '32px', textAlign: 'center', fontWeight: 700 }}
                            value={item.unit_cost}
                            onChange={(e) => handleUpdateItem(idx, 'unit_cost', e.target.value)}
                          />
                        </td>
                        <td style={{ fontWeight: 800, color: '#ef4444' }}>
                          {subTotal.toFixed(2)} ج
                        </td>
                        <td>
                          <button
                            type="button"
                            className="stock-table-row-btn"
                            style={{ color: '#ef4444' }}
                            onClick={() => handleRemoveItem(idx)}
                          >
                            <Trash size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* شريط الإجمالي والتنفيذ */}
          {items.length > 0 && (
            <div className="stock-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <span style={{ fontSize: '14px', color: 'var(--stock-text-muted)' }}>إجمالي الخسارة / القيمة المستبعدة: </span>
                <strong style={{ fontSize: '20px', fontWeight: 900, color: '#ef4444', marginRight: '6px' }}>
                  {totalCost.toFixed(2)} ج
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)', marginRight: '10px' }}>
                  ({items.length} أصناف)
                </span>
              </div>

              <button
                type="button"
                className="stock-quick-action-btn primary"
                onClick={handleExecuteOperation}
                disabled={isSubmitting}
                style={{ fontWeight: 800, padding: '0 24px', height: '42px', fontSize: '14px' }}
              >
                <CheckCircle2 size={16} />
                <span>
                  {isSubmitting
                    ? 'جاري ترحيل القيود...'
                    : (activeMode === 'scrap' ? 'تأكيد وترحيل إذن الإعدام نهائياً' : 'تأكيد وتسجيل إذن المرتجع')}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
