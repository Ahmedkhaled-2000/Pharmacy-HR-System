import React, { useState, useEffect } from 'react';
import {
  stockSearchMedications,
  stockGetLabelTemplate
} from '../../utils/stockApiClient';
import {
  renderCode128Svg,
  printThermalLabels,
  generatePharmaFlyBarcode
} from '../../utils/labelPrintService';
import {
  Printer,
  X,
  Search,
  Tag,
  Calendar,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function PosLabelPrintModal({
  isOpen,
  onClose,
  cartItems = [],
  currentBranch = null,
  showToast = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMed, setSelectedMed] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [printQty, setPrintQty] = useState(1);
  const [template, setTemplate] = useState({
    width_mm: 50,
    height_mm: 25,
    show_pharmacy_name: true,
    pharmacy_header_text: currentBranch?.name || 'صيدليات الشفاء',
    show_trade_name_ar: true,
    show_trade_name_en: true,
    show_public_price: true,
    show_expiry_date: true,
    show_batch_number: true,
    show_supplier_code: true
  });

  useEffect(() => {
    if (!isOpen) return;
    stockGetLabelTemplate().then(res => {
      if (res?.success && res.template) {
        setTemplate(prev => ({
          ...prev,
          ...res.template,
          pharmacy_header_text: currentBranch?.name || res.template.pharmacy_header_text || 'صيدليات الشفاء'
        }));
      }
    }).catch(() => {});
  }, [isOpen, currentBranch]);

  // البحث الذكي السريع بأول 3 حروف
  useEffect(() => {
    const clean = searchQuery.trim();
    if (clean.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await stockSearchMedications({
          q: clean,
          locationId: currentBranch?.id || ''
        });
        if (res?.success) {
          setSearchResults(res.medications || []);
        }
      } catch (err) {
        console.warn('Search error in PosLabelPrintModal:', err);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, currentBranch]);

  if (!isOpen) return null;

  const handleSelectMed = (med) => {
    setSelectedMed(med);
    if (med.batches && med.batches.length > 0) {
      setSelectedBatch(med.batches[0]);
    } else {
      setSelectedBatch({
        batch_number: 'B24',
        expiry_date: '2027-12',
        supplier_code_snapshot: 'S01'
      });
    }
    setSearchResults([]);
  };

  const handlePrintSingle = () => {
    if (!selectedMed) {
      showToast('يرجى اختيار صنف أولاً لطباعة ملصقه', 'warning');
      return;
    }

    const batchNo = selectedBatch?.batch_number || 'B1';
    const expDate = selectedBatch?.expiry_date ? String(selectedBatch.expiry_date).slice(0, 7) : '2027-12';
    const suppCode = selectedBatch?.supplier_code_snapshot || 'S01';

    const barcode = generatePharmaFlyBarcode({
      medicationId: selectedMed.id,
      batchNumber: batchNo,
      expiryDate: expDate,
      supplierCode: suppCode
    });

    const labelItem = {
      medication_id: selectedMed.id,
      trade_name_ar: selectedMed.trade_name_ar,
      trade_name_en: selectedMed.trade_name_en,
      public_price: selectedMed.public_price,
      batch_number: batchNo,
      expiry_date: expDate,
      supplier_code: suppCode,
      label_barcode: barcode,
      quantity: Math.max(1, parseInt(printQty, 10) || 1)
    };

    printThermalLabels([labelItem], template);
    showToast(`جاري طباعة ${printQty} ملصق للصنف: ${selectedMed.trade_name_ar} 🏷️`, 'success');
  };

  const handlePrintCartLabels = () => {
    if (!cartItems || cartItems.length === 0) {
      showToast('سلة المبيعات فارغة حالياً', 'warning');
      return;
    }

    const labels = cartItems.map(item => {
      const batchNo = item.selectedBatch?.batch_number || item.batch_number || 'B1';
      const expDate = item.selectedBatch?.expiry_date || item.expiry_date || '2027-12';
      const suppCode = item.selectedBatch?.supplier_code || 'S01';

      return {
        medication_id: item.productId || item.id,
        trade_name_ar: item.nameAr || item.trade_name_ar || item.name,
        trade_name_en: item.nameEn || item.trade_name_en,
        public_price: item.price || item.public_price,
        batch_number: batchNo,
        expiry_date: String(expDate).slice(0, 7),
        supplier_code: suppCode,
        label_barcode: generatePharmaFlyBarcode({
          medicationId: item.productId || item.id,
          batchNumber: batchNo,
          expiryDate: expDate,
          supplierCode: suppCode
        }),
        quantity: Math.max(1, Math.round(item.quantity || 1))
      };
    });

    printThermalLabels(labels, template);
    showToast(`جاري طباعة ملصقات الباركود لكافة أصناف الفاتورة (${labels.length} أصناف) 🏷️`, 'success');
  };

  // Preview Barcode
  const previewBarcode = selectedMed ? generatePharmaFlyBarcode({
    medicationId: selectedMed.id,
    batchNumber: selectedBatch?.batch_number || 'B1',
    expiryDate: selectedBatch?.expiry_date || '2027-12',
    supplierCode: selectedBatch?.supplier_code_snapshot || 'S01'
  }) : 'P1001-B1-2712-S01';

  const previewSvg = renderCode128Svg(previewBarcode, { height: 26, barWidth: 1.15 });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      direction: 'rtl',
      fontFamily: "'Cairo', Tahoma, sans-serif"
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        boxShadow: '0 25px 35px -5px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: '#0f766e',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={20} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
              طباعة ملصقات الباركود الحرارية (PharmaOS Labels)
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Quick Option: Print Cart Labels */}
          {cartItems && cartItems.length > 0 && (
            <div style={{
              background: '#f0fdfa',
              border: '1px solid #ccfbf1',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#0f766e' }}>أصناف فاتورة الكاشير الحالية ({cartItems.length} صنف)</strong>
                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#475569' }}>
                  طباعة فورية لكافة الأدوية المسجلة بالفاتورة الحالية بنفس عدد العلب
                </p>
              </div>
              <button
                type="button"
                onClick={handlePrintCartLabels}
                style={{
                  background: '#0f766e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Tag size={14} />
                طباعة ملصقات الفاتورة
              </button>
            </div>
          )}

          {/* Search Box for any Drug */}
          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              ابحث عن أي دواء بالاسم التجاري (عربي / إنجليزي) بأول 3 حروف:
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="اكتب 3 حروف للبحث السريع (مثال: أوج / Aug / كون / Pan)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 38px 10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                left: 0,
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                marginTop: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                zIndex: 10
              }}>
                {searchResults.map((med) => (
                  <div
                    key={med.id}
                    onClick={() => handleSelectMed(med)}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12.5px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                  >
                    <div>
                      <strong style={{ color: '#0f172a' }}>{med.trade_name_ar}</strong>
                      <span style={{ color: '#64748b', fontSize: '11px', marginRight: '6px' }}>({med.trade_name_en})</span>
                    </div>
                    <div style={{ fontWeight: 800, color: '#0f766e' }}>
                      {parseFloat(med.public_price || 0).toFixed(2)} ج.م
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Medicine Details & Batch Selection */}
          {selectedMed && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{selectedMed.trade_name_ar}</h4>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{selectedMed.trade_name_en}</div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f766e' }}>
                  {parseFloat(selectedMed.public_price || 0).toFixed(2)} ج.م
                </div>
              </div>

              {/* Batches Selector */}
              {selectedMed.batches && selectedMed.batches.length > 0 ? (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    اختر التشغيلة وتاريخ الصلاحية:
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedMed.batches.map(b => (
                      <button
                        key={b.id || b.batch_number}
                        type="button"
                        onClick={() => setSelectedBatch(b)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: selectedBatch?.id === b.id ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                          background: selectedBatch?.id === b.id ? '#f0fdfa' : '#fff',
                          color: selectedBatch?.id === b.id ? '#0f766e' : '#334155'
                        }}
                      >
                        تشغيلة: {b.batch_number} | انتهاء: {String(b.expiry_date).slice(0, 7)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>رقم التشغيلة</label>
                    <input
                      type="text"
                      value={selectedBatch?.batch_number || 'B24'}
                      onChange={(e) => setSelectedBatch({ ...selectedBatch, batch_number: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>تاريخ الصلاحية (YYYY-MM)</label>
                    <input
                      type="text"
                      placeholder="2027-12"
                      value={selectedBatch?.expiry_date || '2027-12'}
                      onChange={(e) => setSelectedBatch({ ...selectedBatch, expiry_date: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}

              {/* Quantity to print */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>عدد الملصقات:</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={printQty}
                  onChange={(e) => setPrintQty(parseInt(e.target.value, 10) || 1)}
                  style={{ width: '80px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 800, textAlign: 'center' }}
                />
              </div>
            </div>
          )}

          {/* Mini Preview */}
          {selectedMed && (
            <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px', background: '#fafafa', marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>معاينة ملصق 50x25mm:</div>
              <div style={{ display: 'inline-block', width: '220px', background: '#fff', border: '1px solid #000', padding: '4px 6px', fontSize: '9px', textAlign: 'right' }}>
                <div style={{ fontWeight: 800, textAlign: 'center', borderBottom: '0.5px solid #000', fontSize: '8px' }}>{template.pharmacy_header_text}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, marginTop: '2px' }}>
                  <span>{selectedMed.trade_name_ar}</span>
                  <span>{selectedMed.public_price} ج.م</span>
                </div>
                <div style={{ margin: '2px 0' }} dangerouslySetInnerHTML={{ __html: previewSvg }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', fontWeight: 700, direction: 'ltr' }}>
                  <span>Exp: {String(selectedBatch?.expiry_date || '').slice(0, 7)}</span>
                  <span>B: {selectedBatch?.batch_number || 'B1'}</span>
                  <span>S: {selectedBatch?.supplier_code_snapshot || 'S01'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              إغلاق
            </button>
            <button
              type="button"
              disabled={!selectedMed}
              onClick={handlePrintSingle}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: selectedMed ? '#0f766e' : '#94a3b8',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: selectedMed ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Printer size={15} />
              طباعة الملصقات ({printQty})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

