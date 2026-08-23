import React, { useState } from 'react';
import { fmt, todayStr } from '../../utils/formatters';
import { computeEmployeeFinalSettlement } from '../../utils/settlementHelper';
import { triggerDirectPrint, generateClearanceSlipHTML } from '../../utils/printHelper';
import { compressImage } from '../../utils/imageCompressor';

export default function EmployeeTerminationModal({
  emp,
  state,
  onClose,
  onConfirmTermination
}) {
  const [terminationReason, setTerminationReason] = useState('استقالة بناءً على رغبة الموظف');
  const [customReason, setCustomReason] = useState('');
  const [terminationDate, setTerminationDate] = useState(todayStr());
  const [clearanceNotes, setClearanceNotes] = useState('');
  const [signedDoc, setSignedDoc] = useState(emp?.signedClearanceDoc || null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!emp) return null;

  const effectiveReason = terminationReason === 'أخرى' && customReason.trim() ? customReason.trim() : terminationReason;
  const settlement = computeEmployeeFinalSettlement(emp.id, state, terminationDate);

  const handlePrintSlip = () => {
    try {
      const html = generateClearanceSlipHTML({
        emp,
        state,
        terminationDate,
        effectiveReason,
        clearanceNotes,
        settlement
      });
      triggerDirectPrint(html, `إخلاء طرف - ${emp.name}`);
    } catch (err) {
      console.error('Error generating print slip:', err);
      window.print();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    try {
      const isImage = file.type.startsWith('image/');
      const dataUrl = await compressImage(file, isImage ? 1400 : undefined, 0.85);
      const newDoc = {
        dataUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        notes: clearanceNotes.trim()
      };
      setSignedDoc(newDoc);
    } catch (err) {
      console.error('Error uploading signed clearance:', err);
      alert('حدث خطأ أثناء رفع المستند');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!terminationDate) {
      alert('يرجى تحديد تاريخ سريان إنهاء الخدمة');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من اعتماد إنهاء خدمة الموظف (${emp.name}) وتصفية حسابه المالي بصافي (${fmt(settlement?.netSettlement || 0)} ج.م)؟`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      onConfirmTermination(emp.id, {
        terminationReason: effectiveReason,
        terminationDate,
        clearanceNotes: clearanceNotes.trim(),
        settlement,
        signedClearanceDoc: signedDoc
      });
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-clearance-slip, #printable-clearance-slip * {
            visibility: visible;
          }
          #printable-clearance-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: #fff !important;
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="modal-content"
        style={{
          maxWidth: '900px',
          width: '95%',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '16px',
          padding: '24px'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '18px' }} className="no-print">
          <div>
            <h3 style={{ margin: 0, color: 'var(--danger-dark, #b91c1c)', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛑 إنهاء الخدمة النهائي والمخالصة المالية الشاملة
            </h3>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
              تصفية كافة مستحقات وسلف والتزامات الموظف: <strong>{emp.name} ({emp.code})</strong>
            </span>
          </div>
          <button className="del-btn" onClick={onClose} disabled={isSubmitting}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="no-print">
          {/* Section 1: Termination Details Input */}
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 12px', color: '#991b1b', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📝 بيانات وإجراءات إنهاء الخدمة:
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#7f1d1d' }}>سبب إنهاء الخدمة *</label>
                <select
                  value={terminationReason}
                  onChange={(e) => setTerminationReason(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #f87171', background: '#fff', fontSize: '13px' }}
                >
                  <option value="استقالة بناءً على رغبة الموظف">استقالة بناءً على رغبة الموظف</option>
                  <option value="انتهاء مدة العقد وعدم التجديد">انتهاء مدة العقد وعدم التجديد</option>
                  <option value="إنهاء خدمة بقرار إداري">إنهاء خدمة بقرار إداري</option>
                  <option value="أسباب صحية أو شخصية">أسباب صحية أو شخصية</option>
                  <option value="انتقال أو سفر خارج المحافظة">انتقال أو سفر خارج المحافظة</option>
                  <option value="أخرى">أخرى (تحديد يدوي)</option>
                </select>
              </div>

              {terminationReason === 'أخرى' && (
                <div className="field">
                  <label style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#7f1d1d' }}>تحديد السبب يدوياً *</label>
                  <input
                    type="text"
                    placeholder="اكتب سبب إنهاء الخدمة..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    required
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #f87171', background: '#fff', fontSize: '13px' }}
                  />
                </div>
              )}

              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#7f1d1d' }}>تاريخ سريان إنهاء الخدمة *</label>
                <input
                  type="date"
                  value={terminationDate}
                  onChange={(e) => setTerminationDate(e.target.value)}
                  required
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #f87171', background: '#fff', fontSize: '13px' }}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#7f1d1d' }}>ملاحظات إخلاء الطرف الإداري والتسليمات (العهد، المفاتيح، البطاقات)</label>
                <textarea
                  rows={2}
                  placeholder="تم استلام كافة العهد والمفاتيح وبطاقات العمل وتسليم المهام بنجاح..."
                  value={clearanceNotes}
                  onChange={(e) => setClearanceNotes(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #f87171', background: '#fff', fontSize: '13px', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Live Financial Settlement Calculation */}
          {settlement && (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '18px', borderRadius: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  💰 كشف التصفية والمخالصة المالية الشاملة لإنهاء الخدمة:
                </h4>
                <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                  حتى تاريخ: {terminationDate}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                {/* 1. Earnings Card */}
                <div style={{ background: '#fff', border: '1px solid #86efac', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ borderBottom: '1px solid #bbf7d0', paddingBottom: '6px', marginBottom: '8px', color: '#166534', fontWeight: 'bold', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>➕ إجمالي المستحقات المكتسبة</span>
                    <span>+{fmt(settlement.totalEarnings)} ج.م</span>
                  </div>
                  <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>ساعات العمل الأساسية ({settlement.totalRegularHours} س):</span>
                      <strong>{fmt(settlement.totalBaseEarnings)} ج.م</strong>
                    </div>
                    {settlement.totalApprovedOvertimeHours > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 'bold' }}>
                        <span>⭐ الوقت الإضافي المعتمد ({settlement.totalApprovedOvertimeHours} س):</span>
                        <span>+{fmt(settlement.totalOvertimeEarnings)} ج.م</span>
                      </div>
                    )}
                    {settlement.totalAllowances > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1d4ed8' }}>
                        <span>إجمالي البدلات الثابتة:</span>
                        <span>+{fmt(settlement.totalAllowances)} ج.م</span>
                      </div>
                    )}
                    {settlement.totalBonus > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d' }}>
                        <span>المكافآت والحوافز:</span>
                        <span>+{fmt(settlement.totalBonus)} ج.م</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Liabilities & Deductions Card */}
                <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ borderBottom: '1px solid #fecaca', paddingBottom: '6px', marginBottom: '8px', color: '#991b1b', fontWeight: 'bold', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>➖ إجمالي الاستقطاعات وكامل الديون</span>
                    <span>-{fmt(settlement.totalDeductions)} ج.م</span>
                  </div>
                  <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: settlement.totalRemainingLoansDebt > 0 ? '#b91c1c' : '#334155', fontWeight: settlement.totalRemainingLoansDebt > 0 ? 'bold' : 'normal' }}>
                      <span>💳 كامل رصيد السلف والأدوية المتبقي:</span>
                      <strong>{fmt(settlement.totalRemainingLoansDebt)} ج.م</strong>
                    </div>
                    {settlement.lateDeduction > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ea580c' }}>
                        <span>خصومات التأخير ({settlement.lateDeductionMinutes} دقيقة):</span>
                        <span>-{fmt(settlement.lateDeduction)} ج.م</span>
                      </div>
                    )}
                    {settlement.manualDeduction > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                        <span>الجزاءات والخصومات الأخرى:</span>
                        <span>-{fmt(settlement.manualDeduction)} ج.م</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Outstanding Loans Detailed Table if any */}
              {settlement.activeLoans && settlement.activeLoans.length > 0 && (
                <div style={{ marginBottom: '14px', background: '#fff', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#991b1b', display: 'block', marginBottom: '6px' }}>
                    💳 تفاصيل السلف والمديونيات المتبقية التي سيتم تصفيتها وخصمها بالكامل:
                  </span>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: '#fee2e2', color: '#991b1b' }}>
                        <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>النوع</th>
                        <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>التاريخ</th>
                        <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>أصل المبلغ</th>
                        <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>المدفوع مسبقاً</th>
                        <th style={{ padding: '4px', border: '1px solid #fca5a5' }}>المتبقي للخصم بالتصفية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlement.activeLoans.map((l, idx) => (
                        <tr key={l.id || idx}>
                          <td style={{ padding: '4px', border: '1px solid #fca5a5' }}>{l.type}</td>
                          <td style={{ padding: '4px', border: '1px solid #fca5a5' }}>{l.date}</td>
                          <td style={{ padding: '4px', border: '1px solid #fca5a5' }}>{fmt(l.originalAmount)} ج.م</td>
                          <td style={{ padding: '4px', border: '1px solid #fca5a5', color: '#16a34a' }}>{fmt(l.paidAmount)} ج.م</td>
                          <td style={{ padding: '4px', border: '1px solid #fca5a5', fontWeight: 'bold', color: '#b91c1c' }}>{fmt(l.remainingBalance)} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Net Settlement Clearance Card */}
              <div
                style={{
                  background: settlement.isPayableToEmployee ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: '#fff',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                <div>
                  <span style={{ fontSize: '13px', opacity: 0.9, display: 'block' }}>
                    {settlement.settlementStatusLabel}
                  </span>
                  <div style={{ fontSize: '24px', fontWeight: '900', fontFamily: 'Cairo' }}>
                    {fmt(Math.abs(settlement.netSettlement))} ج.م
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePrintSlip}
                  style={{
                    background: '#fff',
                    color: settlement.isPayableToEmployee ? '#047857' : '#b91c1c',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  🖨️ طباعة إخلاء الطرف والمخالصة المالية
                </button>
              </div>
            </div>
          )}

          {/* Section 3: Optional Signed Clearance Upload */}
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <h4 style={{ margin: 0, color: '#0f766e', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📤 إرفاق مستند إخلاء الطرف الموقع بعد الطباعة (اختياري الآن أو لاحقاً):
              </h4>
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                يدعم الصور (JPG/PNG) وملفات PDF
              </span>
            </div>

            {signedDoc ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {signedDoc.fileType?.startsWith('image/') || signedDoc.dataUrl?.startsWith('data:image/') ? (
                    <img
                      src={signedDoc.dataUrl}
                      alt="إخلاء الطرف الموقع"
                      style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #86efac', cursor: 'pointer' }}
                      onClick={() => {
                        const w = window.open('');
                        w.document.write(`<img src="${signedDoc.dataUrl}" style="max-width:100%;height:auto;"/>`);
                      }}
                      title="اضغط للتكبير"
                    />
                  ) : (
                    <span style={{ fontSize: '32px' }}>📄</span>
                  )}
                  <div>
                    <strong style={{ color: '#166534', fontSize: '13px', display: 'block' }}>
                      ✅ تم إرفاق المستند الموقع بنجاح
                    </strong>
                    <span style={{ fontSize: '11.5px', color: '#475569' }}>
                      {signedDoc.fileName || 'مستند إخلاء طرف موقع'} · {new Date(signedDoc.uploadedAt || Date.now()).toLocaleString('ar-EG')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer', margin: 0, padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid #cbd5e1' }}>
                    🔄 تغيير الملف
                    <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} disabled={isUploadingDoc} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setSignedDoc(null)}
                    style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    🗑️ إزالة
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '16px', textAlign: 'center', background: '#fff' }}>
                <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#475569' }}>
                  بعد طباعة النموذج وتوقيعه من الموظف والمدير، يمكنك رفعه هنا ليتم حفظه في أرشيف الموظف مباشرة.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label className="btn btn-ghost" style={{ cursor: isUploadingDoc ? 'not-allowed' : 'pointer', margin: 0, padding: '8px 16px', fontSize: '12.5px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 'bold' }}>
                    {isUploadingDoc ? '⏳ جاري الضغط والرفع...' : '📁 اختيار ملف من الجهاز (صورة / PDF)'}
                    <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} disabled={isUploadingDoc} />
                  </label>
                  <label className="btn btn-ghost" style={{ cursor: isUploadingDoc ? 'not-allowed' : 'pointer', margin: 0, padding: '8px 16px', fontSize: '12.5px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 'bold' }}>
                    📷 تصوير عبر الكاميرا
                    <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} style={{ display: 'none' }} disabled={isUploadingDoc} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
              إلغاء وتراجع
            </button>
            <button
              type="submit"
              className="btn btn-start"
              style={{ background: '#b91c1c', color: '#fff', fontWeight: 'bold', padding: '10px 24px', fontSize: '14px' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? '⏳ جاري الحفظ والإنهاء...' : '✅ اعتماد إنهاء الخدمة وحفظ التصفية ونقل الموظف للمستقيلين'}
            </button>
          </div>
        </form>

        {/* ── PRINTABLE CLEARANCE & FINAL SETTLEMENT SLIP ── */}
        <div id="printable-clearance-slip" style={{ display: 'none', fontFamily: "'Tajawal', sans-serif", direction: 'rtl' }}>
          {settlement && (
            <div>
              <div style={{ textAlign: 'center', borderBottom: '3px double #0f766e', paddingBottom: '12px', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, color: '#0f766e', fontSize: '20px' }}>🏥 {state.orgSettings?.orgName || 'مجموعة صيدليات الشركة'}</h2>
                <h3 style={{ margin: '6px 0 0', color: '#1e293b', fontSize: '17px' }}>نموذج إخلاء طرف وتصفية ومخالصة مالية نهائية</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>تاريخ الإصدار: {new Date().toISOString().slice(0, 10)}</span>
              </div>

              {/* Employee Info Box */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                <div>اسم الموظف: <strong>{emp.name}</strong></div>
                <div>كود الموظف: <strong>{emp.code}</strong></div>
                <div>المسمى الوظيفي: <strong>{emp.jobTitle}</strong></div>
                <div>الرقم القومي: <strong>{settlement.nationalId}</strong></div>
                <div>تاريخ التعيين: <strong>{settlement.hireDate}</strong></div>
                <div>تاريخ إنهاء الخدمة: <strong>{settlement.terminationDate}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}>سبب إنهاء الخدمة: <strong>{effectiveReason}</strong></div>
              </div>

              {/* Financial Calculation Tables */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                {/* Earnings Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                      <th colSpan="2" style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>➕ المستحقات المكتسبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>أجر الساعات الأساسية ({settlement.totalRegularHours} س)</td>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>{fmt(settlement.totalBaseEarnings)} ج.م</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>أجر الوقت الإضافي المعتمد ({settlement.totalApprovedOvertimeHours} س)</td>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>+{fmt(settlement.totalOvertimeEarnings)} ج.م</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>إجمالي البدلات الثابتة</td>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>+{fmt(settlement.totalAllowances)} ج.م</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>المكافآت والحوافز</td>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>+{fmt(settlement.totalBonus)} ج.م</td>
                    </tr>
                    <tr style={{ background: '#dcfce7', fontWeight: 'bold' }}>
                      <td style={{ padding: '6px', border: '1px solid #cbd5e1' }}>إجمالي الاستحقاقات</td>
                      <td style={{ padding: '6px', border: '1px solid #cbd5e1', color: '#166534', textAlign: 'center' }}>{fmt(settlement.totalEarnings)} ج.م</td>
                    </tr>
                  </tbody>
                </table>

                {/* Deductions Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#fef2f2', color: '#991b1b' }}>
                      <th colSpan="2" style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>➖ الاستقطاعات والديون المتبقية</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>كامل رصيد السلف والأدوية المتبقي</td>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>-{fmt(settlement.totalRemainingLoansDebt)} ج.م</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>خصومات التأخير اللائحي</td>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>-{fmt(settlement.lateDeduction)} ج.م</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>الجزاءات والخصومات الأخرى</td>
                      <td style={{ padding: '5px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>-{fmt(settlement.manualDeduction)} ج.م</td>
                    </tr>
                    <tr style={{ background: '#fee2e2', fontWeight: 'bold' }}>
                      <td style={{ padding: '6px', border: '1px solid #cbd5e1' }}>إجمالي الاستقطاعات والديون</td>
                      <td style={{ padding: '6px', border: '1px solid #cbd5e1', color: '#991b1b', textAlign: 'center' }}>-{fmt(settlement.totalDeductions)} ج.م</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Net Clearance Highlight */}
              <div style={{ background: '#f1f5f9', border: '2px solid #0f766e', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', marginBottom: '18px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  {settlement.settlementStatusLabel}: &nbsp;
                  <span style={{ fontSize: '18px', color: settlement.isPayableToEmployee ? '#15803d' : '#b91c1c' }}>
                    {fmt(Math.abs(settlement.netSettlement))} ج.م
                  </span>
                </span>
                {clearanceNotes && (
                  <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '4px' }}>
                    <strong>ملاحظات الإخلاء: </strong> {clearanceNotes}
                  </div>
                )}
              </div>

              {/* Declaration & Signatures */}
              <div style={{ fontSize: '11px', lineHeight: 1.6, color: '#334155', marginBottom: '24px' }}>
                <strong>إقرار المخالصة وإبراء الذمة:</strong> أقر أنا الموقع أدناه بأنني قد تسلمت كافة مستحقاتي المالية عن فترة عملي بالشركة وليس لي أي مستحقات أو مطالبات مالية أو قانونية سابقة أو لاحقة، وتم إخلاء طرفي بالكامل.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center', fontSize: '12.5px', marginTop: '20px' }}>
                <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
                  <strong>توقيع الموظف (المقر بما فيه)</strong>
                </div>
                <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
                  <strong>توقيع الإدارة المالية والمحاسب</strong>
                </div>
                <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
                  <strong>اعتماد الإدارة العامة والموارد البشرية</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
