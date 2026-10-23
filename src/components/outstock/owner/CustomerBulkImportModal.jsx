import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Download,
  Loader2,
  Users,
  Check,
  RefreshCw
} from 'lucide-react';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { outstockBulkImportCustomers } from '../../../utils/outstockApiClient';

export default function CustomerBulkImportModal({ isOpen, onClose, onSuccess, branches = [], showToast = alert }) {
  const [file, setFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'valid' | 'invalid'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // تنظيف وتوحيد رقم الهاتف المصري
  const cleanEgyptianPhone = (raw) => {
    if (!raw) return '';
    let digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('0020')) digits = digits.slice(4);
    else if (digits.startsWith('20') && digits.length === 12) digits = digits.slice(2);
    else if (digits.startsWith('01') && digits.length === 11) digits = digits;
    else if (digits.startsWith('1') && digits.length === 10) digits = '0' + digits;
    return digits;
  };

  const validatePhone = (phone) => {
    return /^01[0125]\d{8}$/.test(phone);
  };

  // معالجة قراءة الملف
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsParsing(true);
    setParsedRows([]);

    try {
      const fileName = selectedFile.name.toLowerCase();
      let rawData = [];

      if (fileName.endsWith('.csv')) {
        const text = await selectedFile.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawData = parsed.data || [];
      } else {
        const buffer = await selectedFile.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) throw new Error('الملف لا يحتوي على أوراق عمل صالحة');

        const headers = [];
        const rows = [];
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell((cell, colNumber) => {
              headers[colNumber] = String(cell.value || '').trim();
            });
          } else {
            const obj = {};
            row.eachCell((cell, colNumber) => {
              const h = headers[colNumber];
              if (h) obj[h] = cell.value != null ? String(cell.value).trim() : '';
            });
            if (Object.keys(obj).length > 0) rows.push(obj);
          }
        });
        rawData = rows;
      }

      // تحليل ومطابقة الأعمدة
      const processed = rawData.map((row, idx) => {
        const findVal = (patterns) => {
          for (const k of Object.keys(row)) {
            const cleanKey = k.trim().toLowerCase();
            for (const p of patterns) {
              if (cleanKey.includes(p)) return String(row[k] || '').trim();
            }
          }
          return '';
        };

        const name = findVal(['اسم', 'name', 'عميل', 'customer']);
        const rawPhone = findVal(['هاتف', 'واتس', 'phone', 'mobile', 'whatsapp', 'موبايل']);
        const branchName = findVal(['فرع', 'branch']);
        const zone = findVal(['منطقة', 'حي', 'zone', 'area']);
        const address = findVal(['عنوان', 'address']);
        const notes = findVal(['ملاحظة', 'notes', 'note']);

        const phone = cleanEgyptianPhone(rawPhone);
        const isValidPhone = validatePhone(phone);
        const isValidName = Boolean(name && name.length >= 2);

        let branchId = 'main';
        if (branchName) {
          const matchBranch = branches.find(b => b.name?.includes(branchName) || b.id === branchName);
          if (matchBranch) branchId = matchBranch.id;
        }

        const errors = [];
        if (!isValidName) errors.push('اسم العميل مطلوب');
        if (!isValidPhone) errors.push('رقم الهاتف غير صالح (يجب أن يبدأ بـ 01 ويتكون من 11 رقم)');

        return {
          id: idx + 1,
          fullName: name,
          whatsappPhone: phone,
          primaryBranchId: branchId,
          zone,
          address,
          notes,
          isValid: errors.length === 0,
          errors
        };
      });

      setParsedRows(processed);
    } catch (err) {
      console.error('[Parse File Error]:', err);
      showToast?.(`⚠️ تعذر قراءة الملف: ${err.message || 'تأكد من صيغة الملف'}`);
    } finally {
      setIsParsing(false);
    }
  };

  // تنزيل نموذج إكسل جاهز للتعبئة
  const handleDownloadTemplate = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('نموذج استيراد العملاء', {
        views: [{ rightToLeft: true }]
      });

      ws.columns = [
        { header: 'اسم العميل', key: 'name', width: 26 },
        { header: 'رقم الواتساب', key: 'phone', width: 18 },
        { header: 'الفرع المفضل', key: 'branch', width: 20 },
        { header: 'المنطقة / الحي', key: 'zone', width: 18 },
        { header: 'العنوان التفصيلي', key: 'address', width: 30 },
        { header: 'ملاحظات', key: 'notes', width: 24 }
      ];

      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D9488' } };
      ws.getRow(1).alignment = { horizontal: 'center' };

      // صفوف توضيحية
      ws.addRow({
        name: 'أحمد محمد علي',
        phone: '01012345678',
        branch: branches[0]?.name || 'فرع النصر',
        zone: 'مدينة نصر',
        address: '15 شارع الطيران',
        notes: 'عميل دائم'
      });
      ws.addRow({
        name: 'سارة إبراهيم',
        phone: '01198765432',
        branch: branches[1]?.name || 'الفرع الرئيسي',
        zone: 'مصر الجديدة',
        address: 'عمارة 4 ميدان المحكمة',
        notes: 'خصم أدوية مزمنة'
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'نموذج_استيراد_عملاء_الصيدلية.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast?.('تعذر إنشاء النموذج');
    }
  };

  const validRows = parsedRows.filter(r => r.isValid);
  const invalidRows = parsedRows.filter(r => !r.isValid);

  const displayedRows = filterTab === 'valid'
    ? validRows
    : filterTab === 'invalid'
    ? invalidRows
    : parsedRows;

  // بدء الاستيراد النهائي
  const handleConfirmImport = async () => {
    if (validRows.length === 0) {
      showToast?.('⚠️ لا توجد صفوف بيانات صالحة للاستيراد');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = validRows.map(r => ({
        fullName: r.fullName,
        whatsappPhone: r.whatsappPhone,
        primaryBranchId: r.primaryBranchId,
        zone: r.zone,
        address: r.address,
        notes: r.notes
      }));

      const res = await outstockBulkImportCustomers(payload);
      if (res?.success) {
        showToast?.(`✅ ${res.message}`);
        onSuccess?.();
        onClose();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر استيراد البيانات'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء الاتصال بالسيرفر');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="outstock-modal-backdrop" style={{ zIndex: 12000 }}>
      <div className="outstock-modal" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* الترويسة */}
        <div className="outstock-modal-header" style={{ background: '#f0fdfa', borderBottom: '1px solid #ccfbf1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f766e' }}>
                استيراد مجمّع لقاعدة بيانات العملاء (Excel / CSV)
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                إضافة وتحديث سجلات عملاء المجموعة دفعة واحدة مع التحقق التلقائي من صحة أرقام الهواتف
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="outstock-modal-close">
            <X size={18} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {/* صندوق رفع الملف وتنزيل النموذج */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                minWidth: '280px',
                border: '2px dashed #0d9488',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
                background: '#f0fdfa',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <Upload size={32} style={{ color: '#0d9488', margin: '0 auto 8px' }} />
              <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f766e' }}>
                {file ? file.name : 'انقر لاختيار ملف إكسل أو CSV'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                يدعم صيغ .xlsx و .xls و .csv
              </div>
            </div>

            <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={handleDownloadTemplate}
                style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#f8fafc', borderColor: '#cbd5e1' }}
              >
                <Download size={22} style={{ color: '#0284c7' }} />
                <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>تنزيل نموذج إكسل جاهز</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>شيت بالأعمدة الصحيحة</span>
              </button>
            </div>
          </div>

          {/* مؤشرات الحالة بعد قراءة الملف */}
          {isParsing && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
              <Loader2 size={28} className="spinner" style={{ margin: '0 auto 8px', color: '#0d9488' }} />
              <div>جاري قراءة وتحليل بيانات الملف...</div>
            </div>
          )}

          {!isParsing && parsedRows.length > 0 && (
            <div>
              {/* إحصائيات سريعة وأزرار التصفية */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: '800',
                    fontSize: '12.5px',
                    background: filterTab === 'all' ? '#0f172a' : '#f1f5f9',
                    color: filterTab === 'all' ? '#fff' : '#475569'
                  }}
                >
                  🌐 كافة السجلات ({parsedRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('valid')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: '800',
                    fontSize: '12.5px',
                    background: filterTab === 'valid' ? '#059669' : '#f0fdf4',
                    color: filterTab === 'valid' ? '#fff' : '#047857'
                  }}
                >
                  ✅ السجلات الصالحة ({validRows.length})
                </button>
                {invalidRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterTab('invalid')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: '800',
                      fontSize: '12.5px',
                      background: filterTab === 'invalid' ? '#dc2626' : '#fef2f2',
                      color: filterTab === 'invalid' ? '#fff' : '#b91c1c'
                    }}
                  >
                    ⚠️ بيانات تحتاج تصحيح ({invalidRows.length})
                  </button>
                )}
              </div>

              {/* جدول المعاينة */}
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table className="outstock-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>م</th>
                      <th>اسم العميل</th>
                      <th>رقم الهاتف</th>
                      <th>الفرع</th>
                      <th>المنطقة / الحي</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map((r, i) => (
                      <tr key={i} style={{ background: !r.isValid ? '#fef2f2' : undefined }}>
                        <td>{r.id}</td>
                        <td style={{ fontWeight: '800' }}>{r.fullName || '—'}</td>
                        <td style={{ direction: 'ltr', textAlign: 'center', fontWeight: 'bold' }}>
                          {r.whatsappPhone || '—'}
                        </td>
                        <td>
                          {branches.find(b => b.id === r.primaryBranchId)?.name || r.primaryBranchId}
                        </td>
                        <td>{r.zone || '—'}</td>
                        <td>
                          {r.isValid ? (
                            <span style={{ color: '#059669', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <CheckCircle size={13} />
                              <span>صالح</span>
                            </span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: '700' }} title={r.errors.join(' | ')}>
                              ❌ {r.errors.join('، ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* أزرار الإجراءات في الأسفل */}
        <div className="outstock-modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12.5px', color: '#64748b' }}>
            {validRows.length > 0 && (
              <span>سيتم استيراد / تحديث <strong>{validRows.length}</strong> عميل معتمد</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="outstock-btn outstock-btn-secondary" onClick={onClose} disabled={isSubmitting}>
              إلغاء
            </button>
            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              onClick={handleConfirmImport}
              disabled={isSubmitting || validRows.length === 0}
              style={{ fontWeight: '800' }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="spinner" />
                  <span>جاري الاستيراد والحفظ...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>بدء الاستيراد المجمّع ({validRows.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
