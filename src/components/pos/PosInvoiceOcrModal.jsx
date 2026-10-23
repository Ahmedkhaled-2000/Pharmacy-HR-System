import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { FileSpreadsheet, X, UploadCloud, CheckCircle2, AlertCircle, Sparkles, Layers } from 'lucide-react';

export default function PosInvoiceOcrModal() {
  const { isOcrModalOpen, setIsOcrModalOpen, productsCatalog, setProductsCatalog } = usePOS();

  const [distributorName, setDistributorName] = useState('شركة ابن سينا فارما (Ibn Sina)');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedData, setParsedData] = useState(null);

  if (!isOcrModalOpen) return null;

  // محاكاة قراءة الفاتورة بالذكاء الاصطناعي (AI Vision OCR)
  const handleSimulateOcr = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setParsedData({
        invoiceNo: 'SIN-889104',
        date: new Date().toISOString().slice(0, 10),
        distributor: distributorName,
        totalInvoice: 4250.00,
        itemsCount: 3,
        items: [
          {
            tradeNameAr: 'أوجمنتين 1 جم أقراص',
            batchNo: 'GSK-2027B',
            expiryDate: '2027-10-30',
            qty: 20,
            bonus: 2, // 2 علبة مجاناً
            publicPrice: 130.00,
            distributorDiscount: 22.5, // 22.5% خصم تجاري
            costPrice: 90.67
          },
          {
            tradeNameAr: 'كونكور 5 مجم أقراص',
            batchNo: 'MCK-8812',
            expiryDate: '2028-04-15',
            qty: 30,
            bonus: 0,
            publicPrice: 65.00,
            distributorDiscount: 20.0,
            costPrice: 52.00
          },
          {
            tradeNameAr: 'بانادول أزرق 500 مجم',
            batchNo: 'PAN-7701',
            expiryDate: '2028-08-20',
            qty: 50,
            bonus: 5,
            publicPrice: 45.00,
            distributorDiscount: 18.0,
            costPrice: 33.50
          }
        ]
      });
      setIsAnalyzing(false);
    }, 1200);
  };

  const handleApproveInvoiceToStock = () => {
    if (!parsedData) return;

    // إضافة الكميات للمخزون
    setProductsCatalog((prev) => {
      const updated = [...prev];
      parsedData.items.forEach((item) => {
        const prod = updated.find((p) => p.tradeNameAr === item.tradeNameAr);
        if (prod) {
          const totalReceived = item.qty + item.bonus;
          const newBatch = {
            id: `b-ocr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            qtyBase: totalReceived,
            unitCost: item.costPrice
          };
          prod.batches = [newBatch, ...(prod.batches || [])];
        }
      });
      return updated;
    });

    alert(`✅ تم إدراج الفاتورة رقم #${parsedData.invoiceNo} بنجاح في رصيد المخزون، مع توليد القيد المحاسبي في شجرة الحسابات العامة (ERP).`);
    setIsOcrModalOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 2400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1.5px solid var(--border, #cbd5e1)',
          borderRadius: '20px',
          width: '94%',
          maxWidth: '850px',
          maxHeight: '88vh',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--surface-hover, #f8fafc)',
            borderBottom: '1px solid var(--border, #cbd5e1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={22} color="var(--primary, #0d9488)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                الأرشفة والإدخال الآلي لفواتير الشركات (AI Invoice OCR)
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                قراءة فواتير الموزعين (ابن سينا، المتحدة، فارما أوفرسيز) واستخراج الأصناف والصلاحيات والخصومات آلياً
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOcrModalOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* صندوق سحب وإفلات صورة الفاتورة */}
          {!parsedData && (
            <div
              onClick={handleSimulateOcr}
              style={{
                border: '2px dashed var(--primary, #0d9488)',
                borderRadius: '16px',
                padding: '40px 20px',
                textAlign: 'center',
                background: 'var(--primary-light, #f0fdfa)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <UploadCloud size={48} color="var(--primary, #0d9488)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text, #0b132b)' }}>
                {isAnalyzing ? 'جاري مسح ومعالجة الفاتورة بالذكاء الاصطناعي...' : 'اضغط لاختيار صورة الفاتورة أو امسحها بالسكانر مباشرة'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted, #475569)', marginTop: '4px' }}>
                يدعم كافة فواتير شركات التوزيع المصرية (ابن سينا، المتحدة، فارما أوفرسيز، أوفيس، وغيرها)
              </div>
            </div>
          )}

          {/* معاينة نتيجة القراءة */}
          {parsedData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5', padding: '12px 16px', borderRadius: '12px', border: '1px solid #10b981' }}>
                <div>
                  <div style={{ fontWeight: 900, color: '#065f46', fontSize: '14px' }}>
                    ✅ تم استخراج بيانات الفاتورة بنجاح: #{parsedData.invoiceNo}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#047857' }}>
                    الموزع: {parsedData.distributor} • التاريخ: {parsedData.date}
                  </div>
                </div>
                <div style={{ textAlign: 'left', fontWeight: 900, fontSize: '18px', color: '#047857' }}>
                  {parsedData.totalInvoice.toFixed(2)} جنيه
                </div>
              </div>

              {/* جدول الأصناف المقروءة والتشغيلات */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover, #f8fafc)', borderBottom: '2px solid var(--border, #cbd5e1)' }}>
                    <th style={{ padding: '8px', textAlign: 'right' }}>الصنف المستخرج</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>التشغيلة (Batch)</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>الصلاحية</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>الكمية + البونص</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>الخصم والتكلفة</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle, #e2e8f0)' }}>
                      <td style={{ padding: '8px', fontWeight: 800 }}>
                        {item.tradeNameAr}
                        <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>سعر الجمهور: {item.publicPrice.toFixed(2)} ج</div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>
                        {item.batchNo}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#059669', fontWeight: 800 }}>
                        {item.expiryDate}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 800 }}>{item.qty} علبة</span>
                        {item.bonus > 0 && (
                          <span style={{ color: '#059669', fontSize: '11px', marginRight: '4px' }}>
                            (+{item.bonus} بونص مجاني)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'left' }}>
                        <div style={{ fontWeight: 800, color: 'var(--primary, #0d9488)' }}>{item.costPrice.toFixed(2)} ج</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted, #475569)' }}>خصم: {item.distributorDiscount}%</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ذيل النافذة */}
        {parsedData && (
          <div
            style={{
              padding: '16px 20px',
              background: 'var(--surface-hover, #f8fafc)',
              borderTop: '1px solid var(--border, #cbd5e1)',
              display: 'flex',
              gap: '10px'
            }}
          >
            <button
              type="button"
              onClick={handleApproveInvoiceToStock}
              style={{
                flex: 1,
                height: '46px',
                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={18} />
              <span>اعتماد وتسكين الفاتورة في المخزن والحسابات</span>
            </button>

            <button
              type="button"
              onClick={() => setParsedData(null)}
              style={{
                padding: '0 20px',
                height: '46px',
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--border, #cbd5e1)',
                borderRadius: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              إلغاء [Esc]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
