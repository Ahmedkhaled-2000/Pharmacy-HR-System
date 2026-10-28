import React, { useState, useEffect } from 'react';
import {
  stockGetLabelTemplate,
  stockSaveLabelTemplate
} from '../../utils/stockApiClient';
import {
  renderCode128Svg,
  printThermalLabels,
  generatePharmaFlyBarcode
} from '../../utils/labelPrintService';
import {
  Printer,
  Sliders,
  Eye,
  Save,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Layers,
  Tag
} from 'lucide-react';

export default function StockLabelPrinterTab({ showToast = () => {} }) {
  const [template, setTemplate] = useState({
    id: 'default_template',
    name: 'الملصق الافتراضي 50x25',
    width_mm: 50,
    height_mm: 25,
    font_size_pt: 8,
    show_pharmacy_name: true,
    pharmacy_header_text: 'صيدليات الشفاء - PharmaOS',
    show_trade_name_ar: true,
    show_trade_name_en: true,
    show_public_price: true,
    show_expiry_date: true,
    show_batch_number: true,
    show_supplier_code: true,
    barcode_symbology: 'CODE128'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // بيانات صنف تجريبي للمعاينة الحية
  const [sampleItem, setSampleItem] = useState({
    medication_id: '1042',
    trade_name_ar: 'أوجمنتين 1 جم أقراص',
    trade_name_en: 'Augmentin 1g 14 Tab',
    public_price: 130.0,
    batch_number: 'B24A',
    expiry_date: '2027-08',
    supplier_code: 'U01'
  });

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setIsLoading(true);
        const res = await stockGetLabelTemplate();
        if (res?.success && res.template) {
          setTemplate(prev => ({ ...prev, ...res.template }));
        }
      } catch (err) {
        console.warn('Could not load template from server, using local defaults');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplate();
  }, []);

  const handleSaveTemplate = async () => {
    try {
      setIsSaving(true);
      await stockSaveLabelTemplate(template);
      localStorage.setItem('pharma_label_template', JSON.stringify(template));
      showToast('تم حفظ إعدادات قالب الملصق الحراري بنجاح! 🏷️', 'success');
    } catch (err) {
      showToast(err.message || 'فشل حفظ إعدادات القالب', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintTestLabel = () => {
    const sampleBarcode = generatePharmaFlyBarcode({
      medicationId: sampleItem.medication_id,
      batchNumber: sampleItem.batch_number,
      expiryDate: sampleItem.expiry_date,
      supplierCode: sampleItem.supplier_code
    });

    printThermalLabels([{
      ...sampleItem,
      label_barcode: sampleBarcode,
      quantity: 1
    }], template);

    showToast('تم إرسال الملصق التجريبي إلى الطابعة 🖨️', 'success');
  };

  const generatedBarcode = generatePharmaFlyBarcode({
    medicationId: sampleItem.medication_id,
    batchNumber: sampleItem.batch_number,
    expiryDate: sampleItem.expiry_date,
    supplierCode: sampleItem.supplier_code
  });

  const previewBarcodeSvg = renderCode128Svg(generatedBarcode, {
    height: Math.max(22, template.height_mm * 1.1),
    barWidth: 1.15
  });

  return (
    <div style={{ padding: '24px', direction: 'rtl', fontFamily: "'Cairo', Tahoma, sans-serif", maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Printer size={26} color="#0f766e" />
            إدارة طابعات الملصقات والتحكم في مكونات الباركود
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            تخصيص أبعاد ملصقات الصيدلية (50x25mm) وتشفير التشغيلة والصلاحية والمورد لمحاكاة دقة نظام PharmaFly
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handlePrintTestLabel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid #0f766e',
              background: '#f0fdfa',
              color: '#0f766e',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px'
            }}
          >
            <Printer size={16} />
            طباعة ملصق تجريبي
          </button>

          <button
            onClick={handleSaveTemplate}
            disabled={isSaving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#0f766e',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: '0 2px 4px rgba(15,118,110,0.2)'
            }}
          >
            <Save size={16} />
            {isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات كافتراضية'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.2fr) minmax(320px, 1fr)', gap: '24px', alignItems: 'start' }}>
        {/* Left: Controls & Configurations */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="#0f766e" />
            أبعاد الملصق ومكونات الطباعة
          </h3>

          {/* Quick presets */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              المقاسات الجاهزة الشائعة للطابعات الحرارية:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { name: '50 × 25 مم (القياسي الأفضل)', w: 50, h: 25 },
                { name: '40 × 25 مم', w: 40, h: 25 },
                { name: '38 × 25 مم', w: 38, h: 25 },
                { name: '30 × 20 مم (صغير)', w: 30, h: 20 }
              ].map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setTemplate({ ...template, width_mm: preset.w, height_mm: preset.h })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: template.width_mm === preset.w && template.height_mm === preset.h ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                    background: template.width_mm === preset.w && template.height_mm === preset.h ? '#f0fdfa' : '#fff',
                    color: template.width_mm === preset.w && template.height_mm === preset.h ? '#0f766e' : '#475569'
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Dimension Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                عرض الملصق (Width بالمليمتر)
              </label>
              <input
                type="number"
                value={template.width_mm}
                onChange={(e) => setTemplate({ ...template, width_mm: parseInt(e.target.value, 10) || 50 })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                ارتفاع الملصق (Height بالمليمتر)
              </label>
              <input
                type="number"
                value={template.height_mm}
                onChange={(e) => setTemplate({ ...template, height_mm: parseInt(e.target.value, 10) || 25 })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Pharmacy Header Text */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              ترويسة / اسم الصيدلية أعلى الملصق
            </label>
            <input
              type="text"
              value={template.pharmacy_header_text || ''}
              onChange={(e) => setTemplate({ ...template, pharmacy_header_text: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>

          {/* Component Visibility Toggles */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
              العناصر المرئية على بطاقة الملصق:
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { key: 'show_pharmacy_name', label: 'اسم الصيدلية بالترويسة' },
                { key: 'show_trade_name_ar', label: 'اسم الدواء التجاري (عربي)' },
                { key: 'show_trade_name_en', label: 'اسم الدواء (إنجليزي)' },
                { key: 'show_public_price', label: 'سعر الجمهور بخط عريض' },
                { key: 'show_expiry_date', label: 'تاريخ الصلاحية (Exp Date)' },
                { key: 'show_batch_number', label: 'رقم التشغيلة (Batch No)' },
                { key: 'show_supplier_code', label: 'كود المورد (Supplier)' }
              ].map(toggle => (
                <label
                  key={toggle.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#334155',
                    cursor: 'pointer',
                    background: template[toggle.key] ? '#f8fafc' : '#fff',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(template[toggle.key])}
                    onChange={(e) => setTemplate({ ...template, [toggle.key]: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>{toggle.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Live WYSIWYG Preview */}
        <div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={18} color="#0f766e" />
              المعاينة الحية الفورية (Live Label Preview)
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
              هكذا سيظهر الملصق المطبوع تماماً من الطابعة الحرارية بالأبعاد المحددة
            </p>

            {/* Visual Paper Canvas */}
            <div style={{
              background: '#f1f5f9',
              padding: '30px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed #cbd5e1'
            }}>
              <div
                style={{
                  width: `${template.width_mm * 4.2}px`,
                  minHeight: `${template.height_mm * 4.2}px`,
                  background: '#fff',
                  border: '1px solid #000',
                  borderRadius: '3px',
                  padding: '6px 10px',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxSizing: 'border-box',
                  color: '#000'
                }}
              >
                {template.show_pharmacy_name && (
                  <div style={{ fontSize: '9px', fontWeight: 800, textAlign: 'center', borderBottom: '0.5px solid #000', paddingBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {template.pharmacy_header_text || 'صيدليات الشفاء'}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '3px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {template.show_trade_name_ar && (
                      <div style={{ fontSize: '11px', fontWeight: 900, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sampleItem.trade_name_ar}
                      </div>
                    )}
                    {template.show_trade_name_en && (
                      <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#333', direction: 'ltr', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sampleItem.trade_name_en}
                      </div>
                    )}
                  </div>
                  {template.show_public_price && (
                    <div style={{ fontSize: '12px', fontWeight: 900, color: '#000', whiteSpace: 'nowrap', marginRight: '6px' }}>
                      {sampleItem.public_price.toFixed(2)} ج.م
                    </div>
                  )}
                </div>

                {/* Barcode */}
                <div style={{ width: '100%', margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: previewBarcodeSvg }} />

                {/* Bottom line: Exp, Batch, Supplier */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 800, borderTop: '0.5px solid #000', paddingTop: '2px', direction: 'ltr' }}>
                  {template.show_expiry_date ? <span>Exp: {sampleItem.expiry_date}</span> : <span></span>}
                  {template.show_batch_number ? <span>B: {sampleItem.batch_number}</span> : <span></span>}
                  {template.show_supplier_code ? <span>S: {sampleItem.supplier_code}</span> : <span></span>}
                </div>
              </div>
            </div>

            {/* Explanation box */}
            <div style={{ marginTop: '16px', background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#0f766e', marginBottom: '4px' }}>
                <Sparkles size={14} />
                تشفير باركود PharmaFly الذكي:
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 800, color: '#0f172a', background: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #99f6e4', display: 'inline-block' }}>
                {generatedBarcode}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>
                عند مسح هذا الباركود بجهاز قارئ الباركود في شاشة POS، يتعرف النظام تلقائياً على الصنف (1042) والتشغيلة (B24A) والصلاحية (2027/08) وكود المورد (U01) دون الحاجة لأي نقرات إضافية.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

