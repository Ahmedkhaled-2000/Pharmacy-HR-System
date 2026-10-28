import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Layers,
  Table,
  Building,
  Gift,
  Search,
  Check,
  Percent,
  Receipt
} from 'lucide-react';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

// تطبيع الكلمات للمطابقة الذكية
const normalizeText = (text) => {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s\-_]+/g, '');
};

export default function StockExcelInvoiceImportModal({
  isOpen,
  onClose,
  medications = [],
  onImportItems,
  onApplyInvoiceMeta
}) {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [detectedMeta, setDetectedMeta] = useState({});
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // معالجة قراءة وتحليل ملف الإكسيل أو CSV
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setParseError('');
    setParsedRows([]);
    setDetectedMeta({});

    try {
      const fileName = selectedFile.name.toLowerCase();
      let rawData = [];

      if (fileName.endsWith('.csv')) {
        // قراءة CSV
        const text = await selectedFile.text();
        const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
        rawData = parsed.data || [];
      } else {
        // قراءة Excel عبر ExcelJS
        const buffer = await selectedFile.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('الملف لا يحتوي على أوراق عمل صالحة.');

        worksheet.eachRow({ includeEmpty: false }, (row) => {
          const rowValues = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            rowValues[colNumber - 1] = cell.text ?? cell.value ?? '';
          });
          rawData.push(rowValues);
        });
      }

      if (rawData.length < 2) {
        throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات كافية.');
      }

      // البحث عن صف الترويسة واستخراج البيانات
      processRawData(rawData, fileName);
    } catch (err) {
      setParseError(err.message || 'حدث خطأ أثناء معالجة ملف الإكسيل.');
    } finally {
      setIsProcessing(false);
    }
  };

  // معالجة البيانات الخام ومطابقة الأعمدة
  const processRawData = (data, fileName) => {
    let headerRowIdx = -1;
    let colMap = {
      name: -1,
      barcode: -1,
      qty: -1,
      bonus: -1,
      publicPrice: -1,
      costPrice: -1,
      discount: -1,
      batch: -1,
      expiry: -1
    };

    // كلمات مفتاحية للأعمدة باللغتين
    const keywords = {
      name: ['اسم الصنف', 'الصنف', 'المنتج', 'اسم الدواء', 'product', 'item', 'description', 'name', 'trade name', 'drug', 'البيان'],
      barcode: ['باركود', 'كود الصنف', 'كود', 'barcode', 'gtin', 'ean', 'code'],
      qty: ['الكمية', 'العدد', 'كمية', 'qty', 'quantity', 'count', 'عدد العلب'],
      bonus: ['بونص', 'بونس', 'مجاني', 'كمية مجانية', 'bonus', 'free', 'هدية', 'مجانا'],
      publicPrice: ['سعر الجمهور', 'سعر البيع', 'الجمهور', 'public', 'public price', 'retail', 'rrp', 'سعر رسمي'],
      costPrice: ['سعر الشراء', 'سعر التكلفة', 'السعر', 'سعر الوحدة', 'cost', 'buy price', 'unit price', 'price', 'rate'],
      discount: ['خصم', 'الخصم', 'نسبة الخصم', 'discount', 'disc', 'disc%'],
      batch: ['تشغيلة', 'التشغيلة', 'رقم التشغيلة', 'باتش', 'batch', 'lot', 'lot no', 'batch no'],
      expiry: ['صلاحية', 'تاريخ الصلاحية', 'انتهاء', 'تاريخ الانتهاء', 'expiry', 'exp', 'exp date']
    };

    // فحص أول 15 صفاً لاكتشاف صف الترويسة
    for (let r = 0; r < Math.min(data.length, 15); r++) {
      const row = data[r].map(c => String(c || '').toLowerCase().trim());
      let matchedCount = 0;

      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (!val) continue;

        if (colMap.name === -1 && keywords.name.some(k => val.includes(k))) {
          colMap.name = c;
          matchedCount++;
        } else if (colMap.qty === -1 && keywords.qty.some(k => val.includes(k))) {
          colMap.qty = c;
          matchedCount++;
        } else if (colMap.costPrice === -1 && keywords.costPrice.some(k => val.includes(k))) {
          colMap.costPrice = c;
          matchedCount++;
        } else if (colMap.publicPrice === -1 && keywords.publicPrice.some(k => val.includes(k))) {
          colMap.publicPrice = c;
          matchedCount++;
        } else if (colMap.bonus === -1 && keywords.bonus.some(k => val.includes(k))) {
          colMap.bonus = c;
          matchedCount++;
        } else if (colMap.discount === -1 && keywords.discount.some(k => val.includes(k))) {
          colMap.discount = c;
          matchedCount++;
        } else if (colMap.batch === -1 && keywords.batch.some(k => val.includes(k))) {
          colMap.batch = c;
          matchedCount++;
        } else if (colMap.expiry === -1 && keywords.expiry.some(k => val.includes(k))) {
          colMap.expiry = c;
          matchedCount++;
        } else if (colMap.barcode === -1 && keywords.barcode.some(k => val.includes(k))) {
          colMap.barcode = c;
          matchedCount++;
        }
      }

      // إذا وجدنا اسم الصنف وعموداً آخر كالسعر أو الكمية نعتبر هذا هو صف الترويسة
      if (colMap.name !== -1 && (colMap.qty !== -1 || colMap.costPrice !== -1 || colMap.publicPrice !== -1)) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) {
      throw new Error('تعذر التعرف التلقائي على ترويسة الجدول. تأكد من وجود أعمدة (اسم الصنف، الكمية، السعر).');
    }

    // استخراج بيانات الفاتورة العلوية إن وجدت
    let extractedInvoiceNo = '';
    for (let r = 0; r < headerRowIdx; r++) {
      const rowStr = data[r].join(' ');
      const match = rowStr.match(/(?:فاتورة|فاتوره|invoice|inv|رقم)\s*[:#\-]?\s*([A-Za-z0-9\-]+)/i);
      if (match && match[1]) {
        extractedInvoiceNo = match[1];
        break;
      }
    }
    if (extractedInvoiceNo) {
      setDetectedMeta(prev => ({ ...prev, invoiceNumber: extractedInvoiceNo }));
    }

    // معالجة صفوف الأصناف
    const rows = [];
    for (let r = headerRowIdx + 1; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;

      const rawName = colMap.name !== -1 ? String(row[colMap.name] || '').trim() : '';
      if (!rawName || rawName.length < 2) continue;

      // تجاهل صفوف الإجماليات
      if (/إجمالي|مجموع|صافي|total|subtotal/i.test(rawName)) continue;

      const rawBarcode = colMap.barcode !== -1 ? String(row[colMap.barcode] || '').trim() : '';
      const rawQty = colMap.qty !== -1 ? parseFloat(String(row[colMap.qty] || '0').replace(/[^0-9.]/g, '')) || 0 : 1;
      const rawBonus = colMap.bonus !== -1 ? parseFloat(String(row[colMap.bonus] || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
      const rawPub = colMap.publicPrice !== -1 ? parseFloat(String(row[colMap.publicPrice] || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
      let rawCost = colMap.costPrice !== -1 ? parseFloat(String(row[colMap.costPrice] || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
      const rawDisc = colMap.discount !== -1 ? parseFloat(String(row[colMap.discount] || '0').replace(/[^0-9.]/g, '')) || 0 : 25;
      const rawBatch = colMap.batch !== -1 ? String(row[colMap.batch] || '').trim() : '';
      let rawExp = colMap.expiry !== -1 ? String(row[colMap.expiry] || '').trim() : '';

      // تنظيف تاريخ الصلاحية
      if (rawExp) {
        if (/^\d{1,2}\/\d{2,4}$/.test(rawExp)) {
          const parts = rawExp.split('/');
          const month = parts[0].padStart(2, '0');
          const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
          rawExp = `${year}-${month}-01`;
        }
      }

      if (rawCost === 0 && rawPub > 0) {
        rawCost = parseFloat((rawPub * (1 - rawDisc / 100)).toFixed(2));
      }

      // مطابقة الصنف مع قاعدة بيانات النظام
      const normInputName = normalizeText(rawName);
      let matchedMed = null;

      if (rawBarcode) {
        matchedMed = medications.find(m => m.barcode && String(m.barcode).trim() === rawBarcode);
      }
      if (!matchedMed) {
        matchedMed = medications.find(m => {
          const normAr = normalizeText(m.tradeNameAr || m.name_ar || '');
          const normEn = normalizeText(m.tradeNameEn || m.name_en || '');
          return (normAr && (normAr === normInputName || normAr.includes(normInputName) || normInputName.includes(normAr))) ||
                 (normEn && (normEn === normInputName || normEn.includes(normInputName) || normInputName.includes(normEn)));
        });
      }

      // حساب التكلفة الصافية للعبوة مع أخذ البونص في الحسبان
      const totalPacks = rawQty + rawBonus;
      const grossPaid = rawQty * rawCost;
      const lineNet = grossPaid * (1 - rawDisc / 100);
      const netPerPack = totalPacks > 0 ? (lineNet / totalPacks) : (rawCost * (1 - rawDisc / 100));

      rows.push({
        rawName,
        medication_id: matchedMed?.id || '',
        med_name: matchedMed ? (matchedMed.tradeNameAr || matchedMed.name_ar) : rawName,
        barcode: matchedMed?.barcode || rawBarcode,
        batch_number: rawBatch || `B-${new Date().getFullYear()}-${r}`,
        expiry_date: rawExp || '',
        quantity: rawQty,
        bonus_quantity: rawBonus,
        public_price: rawPub || (matchedMed ? parseFloat(matchedMed.publicPrice || matchedMed.public_price || 0) : 0),
        buying_price: rawCost || (matchedMed ? parseFloat(matchedMed.costPrice || matchedMed.cost_price || 0) : 0),
        discount_percent: rawDisc,
        net_unit_cost: parseFloat(netPerPack.toFixed(2)),
        isMatched: !!matchedMed
      });
    }

    if (rows.length === 0) {
      throw new Error('لم يتم العثور على أسطر أصناف صالحة في الجدول.');
    }

    setParsedRows(rows);
  };

  // تأكيد إدراج الأصناف في الفاتورة
  const handleConfirmImport = () => {
    if (parsedRows.length === 0) return;

    if (detectedMeta.invoiceNumber && onApplyInvoiceMeta) {
      onApplyInvoiceMeta(detectedMeta);
    }

    onImportItems(parsedRows);
    onClose();
  };

  // إحصائيات المعاينة
  const totalItemsCount = parsedRows.length;
  const matchedCount = parsedRows.filter(r => r.isMatched).length;
  const totalPacks = parsedRows.reduce((sum, r) => sum + r.quantity + r.bonus_quantity, 0);
  const totalBonusPacks = parsedRows.reduce((sum, r) => sum + r.bonus_quantity, 0);
  const estimatedCost = parsedRows.reduce((sum, r) => sum + (r.quantity * r.buying_price * (1 - r.discount_percent / 100)), 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="stock-card"
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}
      >
        {/* الترويسة */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--stock-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--stock-surface-2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(5, 150, 105, 0.12)',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'var(--stock-text-main)' }}>
                استيراد وتفريغ فاتورة المشتريات من ملف إكسيل / CSV (E-Invoice Auto-Import)
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>
                يدعم فواتير الموزعين: المتحدة، ابن سينا، فارما أوفرسيز، مالتي فارما، رامكو أو ملف شيت عام
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--stock-text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* محتوى المودال */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* منطقة سحب وإفلات الملف */}
          {parsedRows.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #93c5fd',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                backgroundColor: 'rgba(239, 246, 255, 0.5)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(2, 132, 199, 0.1)',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px'
                }}
              >
                <UploadCloud size={28} />
              </div>
              <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 800, color: 'var(--stock-text-main)' }}>
                انقر لاختيار ملف الفاتورة أو اسحبه وأفلته هنا
              </h4>
              <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--stock-text-muted)' }}>
                يدعم صيغ Excel (.xlsx, .xls) وملفات CSV النصية
              </p>

              {isProcessing && (
                <div style={{ marginTop: '16px', color: '#0284c7', fontWeight: 700, fontSize: '13px' }}>
                  جاري قراءة واستخراج الأصناف والخصومات... ⏳
                </div>
              )}

              {parseError && (
                <div style={{ marginTop: '14px', color: '#ef4444', fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <AlertTriangle size={16} />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          ) : (
            /* جدول معاينة الأصناف المستخرجة */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* شريط الإحصائيات السريعة للملف */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '10px'
                }}
              >
                <div style={{ padding: '10px 14px', background: 'var(--stock-surface-2)', borderRadius: '8px', border: '1px solid var(--stock-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--stock-text-muted)' }}>عدد الأصناف المقروءة:</span>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--stock-text-main)' }}>{totalItemsCount} صنف</div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--stock-surface-2)', borderRadius: '8px', border: '1px solid var(--stock-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--stock-text-muted)' }}>المطابقة مع الدليل المركزي:</span>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
                    {matchedCount} من {totalItemsCount} ({((matchedCount / totalItemsCount) * 100).toFixed(0)}%)
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--stock-surface-2)', borderRadius: '8px', border: '1px solid var(--stock-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--stock-text-muted)' }}>إجمالي العبوات المستلمة:</span>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#0284c7' }}>
                    {totalPacks} عبوة {totalBonusPacks > 0 ? `(${totalBonusPacks} مجاني)` : ''}
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--stock-surface-2)', borderRadius: '8px', border: '1px solid var(--stock-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--stock-text-muted)' }}>صافي القيمة التقديرية:</span>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
                    {estimatedCost.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج
                  </div>
                </div>
              </div>

              {detectedMeta.invoiceNumber && (
                <div style={{ background: 'rgba(2, 132, 199, 0.08)', padding: '8px 14px', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0369a1' }}>
                  <Receipt size={14} />
                  <span>تم استخراج رقم الفاتورة من الملف: <strong>{detectedMeta.invoiceNumber}</strong> (سيتم تطبيقه تلقائياً)</span>
                </div>
              )}

              {/* الجدول */}
              <div className="stock-table-container" style={{ maxHeight: '350px' }}>
                <table className="stock-data-table" style={{ fontSize: '11.5px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '30px' }}>#</th>
                      <th>الصنف</th>
                      <th style={{ width: '80px' }}>المطابقة</th>
                      <th style={{ width: '90px' }}>التشغيلة</th>
                      <th style={{ width: '85px' }}>الصلاحية</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>الكمية</th>
                      <th style={{ width: '60px', textAlign: 'center', color: '#059669' }}>البونص</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>سعر الجمهور</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>سعر الشراء</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>الخصم %</th>
                      <th style={{ width: '75px', textAlign: 'center', color: '#059669' }}>صافي التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--stock-text-main)' }}>{r.med_name}</div>
                          {r.barcode && <span style={{ fontSize: '10px', color: 'var(--stock-text-muted)' }}>{r.barcode}</span>}
                        </td>
                        <td>
                          {r.isMatched ? (
                            <span className="stock-badge success" style={{ fontSize: '10px' }}>
                              <Check size={10} style={{ display: 'inline', marginLeft: '2px' }} />
                              مطابق
                            </span>
                          ) : (
                            <span className="stock-badge warning" style={{ fontSize: '10px' }}>
                              جديد
                            </span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>{r.batch_number}</td>
                        <td>{r.expiry_date || 'غير محدد'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{r.quantity}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#059669' }}>
                          {r.bonus_quantity > 0 ? `+${r.bonus_quantity}` : '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>{r.public_price.toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>{r.buying_price.toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>{r.discount_percent}%</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#059669' }}>
                          {r.net_unit_cost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="stock-menu-trigger-btn"
                  onClick={() => { setParsedRows([]); setFile(null); }}
                  style={{ fontSize: '12px' }}
                >
                  اختيار ملف آخر 🔄
                </button>
              </div>
            </div>
          )}

        </div>

        {/* تذييل المودال وأزرار الإجراء */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--stock-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'var(--stock-surface-2)'
          }}
        >
          <button
            type="button"
            className="stock-menu-trigger-btn"
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '13px' }}
          >
            إلغاء
          </button>

          {parsedRows.length > 0 && (
            <button
              type="button"
              className="stock-quick-action-btn primary"
              onClick={handleConfirmImport}
              style={{ padding: '8px 24px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <CheckCircle2 size={16} />
              <span>إدراج كافة البنود في الفاتورة ({parsedRows.length} صنف)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
