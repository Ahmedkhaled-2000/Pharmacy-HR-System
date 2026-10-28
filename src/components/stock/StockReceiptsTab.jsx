import React, { useState, useRef, useEffect } from 'react';
import {
  FilePlus,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Calendar,
  Building,
  DollarSign,
  Search,
  Warehouse,
  Barcode,
  Sparkles,
  Percent,
  Gift,
  HelpCircle,
  TrendingUp,
  Receipt,
  Tag,
  FileSpreadsheet
} from 'lucide-react';
import StockExcelInvoiceImportModal from './StockExcelInvoiceImportModal';

export default function StockReceiptsTab({
  locations = [],
  suppliers = [],
  medications = [],
  onSaveReceipt,
  isLoading = false
}) {
  const [locationId, setLocationId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // استيراد الإكسيل
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // مسح الباركود السريع
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef(null);

  // بنود الفاتورة المدعمة بالبونص وحسابات فارمافلاي الدقيقة
  const [items, setItems] = useState([
    {
      medication_id: '',
      med_name: '',
      barcode: '',
      batch_number: '',
      expiry_date: '',
      quantity: 10,
      bonus_quantity: 0,
      public_price: 0,
      buying_price: 0,
      discount_percent: 25,
      net_unit_cost: 0,
      total_cost: 0,
      profit_margin: 0
    }
  ]);

  const [searchMedQuery, setSearchMedQuery] = useState('');
  const [activeItemIndexForSearch, setActiveItemIndexForSearch] = useState(null);

  // حساب الحقول الرياضية لكل سطر تلقائياً وفق معادلة فارمافلاي المحاسبية
  const calculateRowValues = (row) => {
    const qty = parseFloat(row.quantity || 0);
    const bonus = parseFloat(row.bonus_quantity || 0);
    const buyPrice = parseFloat(row.buying_price || 0);
    const pubPrice = parseFloat(row.public_price || 0);
    const disc = parseFloat(row.discount_percent || 0);

    // إجمالي الفاتورة للسطر قبل الخصم (يحسب فقط على الكمية المدفوعة)
    const grossCost = qty * buyPrice;
    // صافي المبلغ المطلوب دفعه للمورد عن هذا السطر بعد الخصم التجاري
    const lineNetPayable = grossCost * (1 - disc / 100);

    // إجمالي عدد العبوات الفعلية المستلمة في المخزن (المدفوع + المجاني)
    const totalPacks = qty + bonus;

    // صافي تكلفة العبوة الحقيقية بعد توزيع البونص والخصم
    const netCostPerPack = totalPacks > 0 ? (lineNetPayable / totalPacks) : (buyPrice * (1 - disc / 100));

    // نسبة هامش ربح الصيدلية المتوقعة
    const margin = pubPrice > 0 ? (((pubPrice - netCostPerPack) / pubPrice) * 100) : 0;

    return {
      ...row,
      total_cost: parseFloat(lineNetPayable.toFixed(2)),
      net_unit_cost: parseFloat(netCostPerPack.toFixed(2)),
      profit_margin: parseFloat(margin.toFixed(1))
    };
  };

  const handleAddItemRow = (preset = {}) => {
    const newRow = calculateRowValues({
      medication_id: preset.id || '',
      med_name: preset.tradeNameAr || preset.name_ar || preset.trade_name_ar || '',
      barcode: preset.barcode || '',
      batch_number: preset.batch_number || '',
      expiry_date: preset.expiry_date || '',
      quantity: preset.quantity || 10,
      bonus_quantity: preset.bonus_quantity || 0,
      public_price: parseFloat(preset.publicPrice || preset.public_price || 0),
      buying_price: parseFloat(preset.costPrice || preset.cost_price || (preset.publicPrice ? preset.publicPrice * 0.75 : 0)),
      discount_percent: preset.discount_percent !== undefined ? preset.discount_percent : 25
    });

    setItems((prev) => [...prev, newRow]);
  };

  // استيراد بنود الإكسيل ومطابقتها
  const handleImportItemsFromExcel = (newItems) => {
    const formattedRows = newItems.map(calculateRowValues);
    setItems((prev) => {
      const isFirstRowEmpty = prev.length === 1 && !prev[0].medication_id && (!prev[0].med_name || prev[0].med_name === '');
      return isFirstRowEmpty ? formattedRows : [...prev, ...formattedRows];
    });
  };

  const handleApplyInvoiceMeta = (meta) => {
    if (meta.invoiceNumber && !invoiceNumber) {
      setInvoiceNumber(meta.invoiceNumber);
    }
  };

  const handleRemoveItemRow = (idx) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx, field, value) => {
    setItems((prev) => {
      const updated = [...prev];
      const cur = { ...updated[idx], [field]: value };
      updated[idx] = calculateRowValues(cur);
      return updated;
    });
  };

  const handleSelectMedication = (idx, med) => {
    setItems((prev) => {
      const updated = [...prev];
      const pub = parseFloat(med.publicPrice || med.public_price || 0);
      const cost = parseFloat(med.costPrice || med.cost_price || (pub > 0 ? pub * 0.75 : 0));
      const cur = {
        ...updated[idx],
        medication_id: med.id,
        med_name: med.tradeNameAr || med.name_ar || med.trade_name_ar || 'صنف دوائي',
        barcode: med.barcode || '',
        public_price: pub,
        buying_price: cost
      };
      updated[idx] = calculateRowValues(cur);
      return updated;
    });
    setActiveItemIndexForSearch(null);
    setSearchMedQuery('');
  };

  // المسح السريع بالباركود
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const cleanBar = barcodeInput.trim();
    if (!cleanBar) return;

    // محاولة استخراج الباركود العادي أو الـ DataMatrix
    let targetBarcode = cleanBar;
    let extractedExpiry = '';
    let extractedBatch = '';

    // تحليل كود GS1 DataMatrix المصري إن وجد
    if (cleanBar.startsWith('01') && cleanBar.length > 16) {
      targetBarcode = cleanBar.substring(2, 16);
      if (cleanBar.includes('17')) {
        const expIdx = cleanBar.indexOf('17');
        const rawDate = cleanBar.substring(expIdx + 2, expIdx + 8);
        if (rawDate.length === 6) {
          extractedExpiry = `20${rawDate.substring(0, 2)}-${rawDate.substring(2, 4)}-${rawDate.substring(4, 6)}`;
        }
      }
      if (cleanBar.includes('10')) {
        const batchIdx = cleanBar.indexOf('10');
        extractedBatch = cleanBar.substring(batchIdx + 2, batchIdx + 12);
      }
    }

    const matchedMed = medications.find(
      (m) => (m.barcode && m.barcode === targetBarcode) ||
             (m.tradeNameEn && m.tradeNameEn.toLowerCase() === cleanBar.toLowerCase())
    );

    if (matchedMed) {
      handleAddItemRow({
        ...matchedMed,
        batch_number: extractedBatch || '',
        expiry_date: extractedExpiry || ''
      });
      setBarcodeInput('');
    } else {
      alert(`⚠️ لم يتم العثور على صنف بالباركود: ${cleanBar}`);
    }
  };

  // الإجماليات العامة لفاتورة الاستلام
  const invoiceGrossTotal = items.reduce(
    (sum, it) => sum + (parseFloat(it.quantity || 0) * parseFloat(it.buying_price || 0)),
    0
  );
  const invoiceTotalPublicValue = items.reduce(
    (sum, it) => sum + ((parseFloat(it.quantity || 0) + parseFloat(it.bonus_quantity || 0)) * parseFloat(it.public_price || 0)),
    0
  );
  const invoiceNetTotal = items.reduce((sum, it) => sum + (parseFloat(it.total_cost || 0)), 0);
  const invoiceTotalDiscount = invoiceGrossTotal - invoiceNetTotal;
  const invoiceTotalProfit = invoiceTotalPublicValue - invoiceNetTotal;
  const invoiceProfitMargin = invoiceTotalPublicValue > 0 ? ((invoiceTotalProfit / invoiceTotalPublicValue) * 100) : 0;
  const totalReceivedPacks = items.reduce(
    (sum, it) => sum + (parseFloat(it.quantity || 0) + parseFloat(it.bonus_quantity || 0)),
    0
  );

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!locationId) {
      alert('⚠️ يرجى اختيار المستودع المستلم أولاً.');
      return;
    }
    if (!invoiceNumber.trim()) {
      alert('⚠️ يرجى إدخال رقم فاتورة المورد.');
      return;
    }

    const validItems = items.filter((it) => it.medication_id && (parseFloat(it.quantity) > 0 || parseFloat(it.bonus_quantity) > 0));
    if (validItems.length === 0) {
      alert('⚠️ يرجى إضافة صنف دوائي واحد على الأقل بكمية صالحة.');
      return;
    }

    onSaveReceipt?.({
      location_id: locationId,
      supplier_id: supplierId || null,
      invoice_number: invoiceNumber.trim(),
      invoice_date: invoiceDate,
      notes: notes.trim(),
      items: validItems
    });

    // تفريغ النموذج بعد الحفظ
    setInvoiceNumber('');
    setNotes('');
    setItems([
      {
        medication_id: '',
        med_name: '',
        barcode: '',
        batch_number: '',
        expiry_date: '',
        quantity: 10,
        bonus_quantity: 0,
        public_price: 0,
        buying_price: 0,
        discount_percent: 25,
        net_unit_cost: 0,
        total_cost: 0,
        profit_margin: 0
      }
    ]);
  };

  const filteredMeds = medications
    .filter((m) => {
      if (!searchMedQuery.trim()) return false;
      const q = searchMedQuery.trim().toLowerCase();
      const ar = (m.tradeNameAr || m.name_ar || '').toLowerCase();
      const en = (m.tradeNameEn || m.name_en || '').toLowerCase();
      const bar = (m.barcode || '').toLowerCase();
      return ar.includes(q) || en.includes(q) || bar.includes(q);
    })
    .slice(0, 10);

  const selectedSupplierObj = suppliers.find((s) => s.id === supplierId);

  return (
    <div className="stock-receipts-page" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      
      {/* ── 1. بطاقة ترويسة الفاتورة المريحة للعين (Ergonomic Invoice Header) ── */}
      <div className="stock-card" style={{ padding: '16px 20px', border: '1px solid var(--stock-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(2, 132, 199, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={20} color="#0284c7" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'var(--stock-text-main)' }}>
                تسجيل واستلام فاتورة مشتريات وتوريد بضاعة (Goods Receipt Note)
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>
                محرك التوريد المتطور: يدعم البونص المجاني، الخصومات المركبة، وحساب صافي التكلفة الحقيقي لكل عبوة
              </span>
            </div>
          </div>

          {selectedSupplierObj && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--stock-surface-2)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--stock-border)' }}>
              <Building size={14} color="#0284c7" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--stock-text-main)' }}>
                {selectedSupplierObj.name || selectedSupplierObj.trade_name}
              </span>
              <span className="stock-status-chip success" style={{ fontSize: '11px', padding: '2px 8px' }}>
                مورد معتمد
              </span>
            </div>
          )}
        </div>

        {/* شبكة الحقول الرئيسية الأربعة المتناسقة */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px'
          }}
        >
          <div>
            <label className="stock-field-label">
              <Warehouse size={13} style={{ display: 'inline', marginLeft: '4px', verticalAlign: 'middle' }} />
              المستودع المستلم (إلزامي):
            </label>
            <select
              className="stock-select-filter"
              style={{ width: '100%', height: '38px', fontWeight: 700 }}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              <option value="">-- اختر مستودع الاستلام --</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name || loc.name_ar} {loc.is_central ? '⭐ (المخزن الرئيسي)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="stock-field-label">
              <Building size={13} style={{ display: 'inline', marginLeft: '4px', verticalAlign: 'middle' }} />
              الشركة الموردة:
            </label>
            <select
              className="stock-select-filter"
              style={{ width: '100%', height: '38px', fontWeight: 700 }}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">-- توريد مباشر / مورد عام --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.trade_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="stock-field-label">
              <Receipt size={13} style={{ display: 'inline', marginLeft: '4px', verticalAlign: 'middle' }} />
              رقم فاتورة المورد (إلزامي):
            </label>
            <input
              type="text"
              className="stock-input"
              style={{ width: '100%', height: '38px', fontWeight: 700 }}
              placeholder="مثال: INV-99824 أو 84210"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="stock-field-label">
              <Calendar size={13} style={{ display: 'inline', marginLeft: '4px', verticalAlign: 'middle' }} />
              تاريخ الفاتورة:
            </label>
            <input
              type="date"
              className="stock-date-input"
              style={{ width: '100%', height: '38px' }}
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── 2. شريط مسح الباركود و الـ DataMatrix الفوري ── */}
      <div className="stock-card" style={{ padding: '10px 18px', background: 'var(--stock-surface-2)', border: '1px solid var(--stock-border)' }}>
        <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap' }}>
            <Barcode size={18} />
            <span>مسح سريع بالباركود / DataMatrix:</span>
          </div>
          <input
            ref={barcodeInputRef}
            type="text"
            className="stock-input"
            style={{ flex: 1, height: '36px', fontSize: '13px', fontWeight: 600 }}
            placeholder="مرر قارئ الباركود هنا (يدعم أكواد هيئة الدواء 2D DataMatrix و EAN-13)..."
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
          />
          <button
            type="submit"
            className="stock-quick-action-btn primary"
            style={{ height: '36px', padding: '0 16px', fontSize: '12px' }}
          >
            <span>إدراج الصنف</span>
          </button>
        </form>
      </div>

      {/* ── 3. جدول بنود الفاتورة بحسابات البونص المتقدمة ── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="stock-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--stock-border)' }}>
          <div
            style={{
              padding: '12px 18px',
              background: 'var(--stock-surface-2)',
              borderBottom: '1px solid var(--stock-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--stock-text-main)' }}>
                جدول الأصناف والتشغيلات المستلمة
              </span>
              <span className="stock-status-chip info" style={{ fontSize: '11.5px' }}>
                {items.length} أصناف • إجمالي {totalReceivedPacks} عبوة
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="stock-menu-trigger-btn"
                onClick={() => setIsImportModalOpen(true)}
                style={{
                  fontSize: '12px',
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#059669',
                  borderColor: '#a7f3d0',
                  background: '#f0fdf4'
                }}
              >
                <FileSpreadsheet size={15} />
                <span>استيراد فاتورة إكسيل (Excel / CSV)</span>
              </button>

              <button
                type="button"
                className="stock-quick-action-btn primary"
                onClick={() => handleAddItemRow()}
                style={{ fontSize: '12px', padding: '5px 14px' }}
              >
                <Plus size={14} />
                <span>إضافة سطر صنف جديد</span>
              </button>
            </div>
          </div>

          <div className="stock-table-container">
            <table className="stock-data-table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ width: '30px' }}>#</th>
                  <th style={{ minWidth: '220px' }}>الصنف الدوائي</th>
                  <th style={{ width: '120px' }}>التشغيلة (Batch)</th>
                  <th style={{ width: '115px' }}>الصلاحية</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>الكمية</th>
                  <th style={{ width: '80px', textAlign: 'center', color: '#059669' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Gift size={12} />
                      بونص
                    </span>
                  </th>
                  <th style={{ width: '90px', textAlign: 'center' }}>سعر الجمهور</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>سعر الشراء</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>خصم %</th>
                  <th style={{ width: '100px', textAlign: 'center', color: '#0284c7' }}>صافي التكلفة</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>إجمالي السطر</th>
                  <th style={{ width: '45px', textAlign: 'center' }}>حذف</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  return (
                    <tr key={idx}>
                      <td style={{ color: 'var(--stock-text-muted)', textAlign: 'center', fontWeight: 700 }}>
                        {idx + 1}
                      </td>

                      {/* الصنف الدوائي مع البحث الذكي */}
                      <td>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            className="stock-input"
                            style={{ width: '100%', height: '32px', fontSize: '12px', fontWeight: 700 }}
                            placeholder="ابحث باسم الدواء أو الباركود..."
                            value={it.med_name}
                            onFocus={() => {
                              setActiveItemIndexForSearch(idx);
                              setSearchMedQuery('');
                            }}
                            onChange={(e) => {
                              handleItemChange(idx, 'med_name', e.target.value);
                              setSearchMedQuery(e.target.value);
                              setActiveItemIndexForSearch(idx);
                            }}
                          />

                          {/* قائمة البحث المنسدلة */}
                          {activeItemIndexForSearch === idx && searchMedQuery.trim() && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                left: 0,
                                background: 'var(--stock-surface)',
                                border: '1px solid var(--stock-primary)',
                                borderRadius: '8px',
                                boxShadow: 'var(--stock-shadow-lg)',
                                zIndex: 100,
                                maxHeight: '240px',
                                overflowY: 'auto'
                              }}
                            >
                              {filteredMeds.length === 0 ? (
                                <div style={{ padding: '10px', fontSize: '12px', color: 'var(--stock-text-muted)' }}>
                                  لا توجد أدوية مطابقة للبحث
                                </div>
                              ) : (
                                filteredMeds.map((med) => (
                                  <div
                                    key={med.id}
                                    onClick={() => handleSelectMedication(idx, med)}
                                    style={{
                                      padding: '8px 12px',
                                      borderBottom: '1px solid var(--stock-border-subtle)',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                    className="stock-search-dropdown-row"
                                  >
                                    <div>
                                      <div style={{ fontWeight: 800, color: 'var(--stock-text-main)' }}>
                                        {med.tradeNameAr || med.name_ar || med.trade_name_ar}
                                      </div>
                                      <div style={{ fontSize: '11px', color: 'var(--stock-text-muted)' }}>
                                        {med.tradeNameEn || med.name_en} {med.barcode ? `| ${med.barcode}` : ''}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'left', fontSize: '11px' }}>
                                      <span style={{ color: '#059669', fontWeight: 800 }}>
                                        سعر بيع: {med.publicPrice || med.public_price || 0} ج
                                      </span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* رقم التشغيلة */}
                      <td>
                        <input
                          type="text"
                          className="stock-input"
                          style={{ width: '100%', height: '32px', textAlign: 'center', fontFamily: 'var(--stock-font-mono)', fontWeight: 700 }}
                          placeholder="B-2026-X"
                          value={it.batch_number}
                          onChange={(e) => handleItemChange(idx, 'batch_number', e.target.value)}
                          required
                        />
                      </td>

                      {/* تاريخ الصلاحية */}
                      <td>
                        <input
                          type="date"
                          className="stock-date-input"
                          style={{ width: '100%', height: '32px', padding: '4px 6px', fontSize: '11.5px' }}
                          value={it.expiry_date}
                          onChange={(e) => handleItemChange(idx, 'expiry_date', e.target.value)}
                          required
                        />
                      </td>

                      {/* الكمية المشتراة */}
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="stock-input"
                          style={{ width: '100%', height: '32px', textAlign: 'center', fontWeight: 800 }}
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          required
                        />
                      </td>

                      {/* بونص مجاني */}
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="stock-input"
                          style={{ width: '100%', height: '32px', textAlign: 'center', fontWeight: 800, color: '#059669', background: 'rgba(5, 150, 105, 0.05)' }}
                          placeholder="0"
                          value={it.bonus_quantity}
                          onChange={(e) => handleItemChange(idx, 'bonus_quantity', e.target.value)}
                        />
                      </td>

                      {/* سعر الجمهور */}
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="stock-input"
                          style={{ width: '100%', height: '32px', textAlign: 'center', fontWeight: 700 }}
                          value={it.public_price}
                          onChange={(e) => handleItemChange(idx, 'public_price', e.target.value)}
                        />
                      </td>

                      {/* سعر الشراء */}
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="stock-input"
                          style={{ width: '100%', height: '32px', textAlign: 'center', fontWeight: 700 }}
                          value={it.buying_price}
                          onChange={(e) => handleItemChange(idx, 'buying_price', e.target.value)}
                          required
                        />
                      </td>

                      {/* الخصم % */}
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="stock-input"
                          style={{ width: '100%', height: '32px', textAlign: 'center', fontWeight: 700 }}
                          value={it.discount_percent}
                          onChange={(e) => handleItemChange(idx, 'discount_percent', e.target.value)}
                        />
                      </td>

                      {/* صافي التكلفة الحقيقي للعبوة بعد البونص */}
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 800, color: '#0284c7', fontSize: '12.5px' }}>
                          {it.net_unit_cost.toFixed(2)} ج
                        </span>
                        {it.profit_margin > 0 && (
                          <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>
                            ربح {it.profit_margin}%
                          </div>
                        )}
                      </td>

                      {/* إجمالي السطر المستحق */}
                      <td style={{ fontWeight: 900, color: 'var(--stock-text-main)', textAlign: 'right', fontSize: '13px' }}>
                        {it.total_cost.toFixed(2)} ج
                      </td>

                      {/* زر الحذف */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="stock-table-row-btn"
                          onClick={() => handleRemoveItemRow(idx)}
                          disabled={items.length <= 1}
                          style={{ color: items.length > 1 ? '#ef4444' : '#94a3b8', padding: '4px 6px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 4. شريط الإجماليات المالي التنفيذي الفاخر (Executive Financial Summary Dock) ── */}
        <div
          className="stock-card"
          style={{
            padding: '16px 20px',
            border: '1px solid var(--stock-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          {/* كروت المؤشرات المالية الخمسة */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '11.5px', color: 'var(--stock-text-muted)', display: 'block' }}>إجمالي سعر الجمهور:</span>
              <strong style={{ fontSize: '16px', fontWeight: 800, color: 'var(--stock-text-main)' }}>
                {invoiceTotalPublicValue.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج
              </strong>
            </div>

            <div style={{ borderRight: '1px solid var(--stock-border)', paddingRight: '20px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--stock-text-muted)', display: 'block' }}>قبل الخصم:</span>
              <strong style={{ fontSize: '16px', fontWeight: 800, color: 'var(--stock-text-main)' }}>
                {invoiceGrossTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج
              </strong>
            </div>

            <div style={{ borderRight: '1px solid var(--stock-border)', paddingRight: '20px' }}>
              <span style={{ fontSize: '11.5px', color: '#d97706', display: 'block' }}>الخصم والتوفير المكتسب:</span>
              <strong style={{ fontSize: '16px', fontWeight: 800, color: '#d97706' }}>
                {invoiceTotalDiscount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج
              </strong>
            </div>

            <div style={{ borderRight: '1px solid var(--stock-border)', paddingRight: '20px' }}>
              <span style={{ fontSize: '11.5px', color: '#059669', display: 'block' }}>صافي المستحق للمورد:</span>
              <strong style={{ fontSize: '20px', fontWeight: 900, color: '#059669' }}>
                {invoiceNetTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج
              </strong>
            </div>

            <div style={{ borderRight: '1px solid var(--stock-border)', paddingRight: '20px' }}>
              <span style={{ fontSize: '11.5px', color: '#0284c7', display: 'block' }}>الربح التقديري للصيدلية:</span>
              <strong style={{ fontSize: '16px', fontWeight: 900, color: '#0284c7' }}>
                {invoiceTotalProfit.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج ({invoiceProfitMargin.toFixed(1)}%)
              </strong>
            </div>
          </div>

          {/* زر الاعتماد النهائي */}
          <button
            type="submit"
            className="stock-quick-action-btn primary"
            disabled={isLoading}
            style={{ height: '44px', padding: '0 28px', fontSize: '14px', fontWeight: 800, borderRadius: '8px' }}
          >
            <CheckCircle2 size={18} />
            <span>{isLoading ? 'جاري الاعتماد والترحيل...' : 'اعتماد وترحيل الفاتورة للمخزن'}</span>
          </button>
        </div>
      </form>

      {/* مودال استيراد فواتير الموزعين إكسيل الذكي */}
      <StockExcelInvoiceImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        medications={medications}
        onImportItems={handleImportItemsFromExcel}
        onApplyInvoiceMeta={handleApplyInvoiceMeta}
      />
    </div>
  );
}
