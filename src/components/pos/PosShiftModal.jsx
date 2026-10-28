import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useUI } from '../../context/UIContext';
import { Clock, DollarSign, X, CheckCircle2, AlertTriangle, Printer } from 'lucide-react';

export default function PosShiftModal() {
  const {
    isShiftModalOpen,
    setIsShiftModalOpen,
    currentShift,
    setCurrentShift
  } = usePOS();
  const { showToast } = useUI?.() || {};

  const [physicalCash, setPhysicalCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  if (!isShiftModalOpen) return null;

  const openingCash = parseFloat(currentShift?.openingCash || 0);
  const totalSales = parseFloat(currentShift?.totalSalesAmount || 0);
  const cashSales = parseFloat(currentShift?.cashSalesAmount ?? currentShift?.totalSalesAmount ?? 0);
  const visaSales = parseFloat(currentShift?.visaSalesAmount || 0);
  const walletSales = parseFloat(currentShift?.walletSalesAmount || 0);
  const otherSales = parseFloat(currentShift?.otherSalesAmount || 0);
  const cashRefunds = parseFloat(currentShift?.cashRefunds || 0);

  // النقدية الفعلية المتوقعة بالدرج تحسب حصراً من العمليات النقدية والعهدة مع خصم المرتجعات
  const expectedCashInDrawer = Math.max(0, parseFloat((openingCash + cashSales - cashRefunds).toFixed(2)));
  const countedCash = parseFloat(physicalCash || 0);
  const variance = physicalCash !== '' ? (countedCash - expectedCashInDrawer) : 0;

  const handleCloseShift = () => {
    if (physicalCash === '') {
      showToast?.('⚠️ يرجى إدخال النقدية الفعلية الموجودة بالدرج لتسوية الوردية.');
      return;
    }

    const closedShift = {
      ...currentShift,
      endTime: new Date().toISOString(),
      openingCash,
      totalSales,
      cashSales,
      visaSales,
      walletSales,
      otherSales,
      cashRefunds,
      expectedCash: expectedCashInDrawer,
      physicalCash: countedCash,
      variance,
      notes: closingNotes,
      status: 'closed'
    };

    // حفظ في سجل الورديات
    try {
      const pastShifts = JSON.parse(localStorage.getItem('pharma_pos_closed_shifts') || '[]');
      pastShifts.unshift(closedShift);
      localStorage.setItem('pharma_pos_closed_shifts', JSON.stringify(pastShifts));
    } catch {}

    // فتح وردية جديدة تلقائياً مع نقل العهدة الفعلية
    const newShift = {
      id: `shift_${Date.now()}`,
      branchId: currentShift.branchId,
      branchName: currentShift.branchName,
      cashierName: currentShift.cashierName,
      cashierId: currentShift.cashierId,
      startTime: new Date().toISOString(),
      openingCash: countedCash,
      totalSalesAmount: 0,
      cashSalesAmount: 0,
      visaSalesAmount: 0,
      walletSalesAmount: 0,
      otherSalesAmount: 0,
      cashRefunds: 0,
      salesCount: 0,
      status: 'open'
    };

    setCurrentShift(newShift);
    showToast?.(`✅ تم إغلاق الوردية بنجاح! الفارق في الدرج: ${variance >= 0 ? '+' : ''}${variance.toFixed(2)} ج.`);
    setIsShiftModalOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 2250,
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
          width: '92%',
          maxWidth: '560px',
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
            <Clock size={22} color="var(--primary, #0d9488)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                تسوية وإغلاق وردية الكاشير (Z-Report) [F12]
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                مطابقة العهدة النقدية في الدرج مع المبيعات المحسوبة
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsShiftModalOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* ملخص الوردية الحالية */}
          <div style={{ background: 'var(--surface-hover, #f8fafc)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border, #cbd5e1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span>الرصيد الافتتاحي للوردية (العهدة):</span>
              <strong>{openingCash.toFixed(2)} ج</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span>مبيعات نقدية دخلت الدرج (Cash):</span>
              <strong style={{ color: 'var(--primary, #0d9488)' }}>+{cashSales.toFixed(2)} ج</strong>
            </div>
            {cashRefunds > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px', color: '#b91c1c' }}>
                <span>مرتجعات نقدية خُصمت من الدرج:</span>
                <strong>-{cashRefunds.toFixed(2)} ج</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span>عدد فواتير الوردية:</span>
              <strong>{currentShift.salesCount || 0} فاتورة</strong>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1.5px dashed var(--border, #cbd5e1)',
                fontSize: '14px',
                fontWeight: 900
              }}
            >
              <span>💵 النقدية المتوقعة بالدرج (الصافي):</span>
              <span style={{ color: '#0f766e' }}>{expectedCashInDrawer.toFixed(2)} جنيه</span>
            </div>
          </div>

          {/* تسويات الدفع الإلكتروني (تسوية بنكية لا تدخل الدرج) */}
          {(visaSales > 0 || walletSales > 0 || otherSales > 0) && (
            <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bbf7d0', fontSize: '11.5px' }}>
              <div style={{ fontWeight: 800, color: '#166534', marginBottom: '4px' }}>
                💳 مدفوعات إلكترونية غير نقدية (تسويات بنكية منفصلة عن الدرج):
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d' }}>
                <span>بطاقات بنكية / فيزا: <strong>{visaSales.toFixed(2)} ج</strong></span>
                <span>محافظ إلكترونية: <strong>{walletSales.toFixed(2)} ج</strong></span>
                <span>إجمالي مبيعات الوردية الكلي: <strong>{totalSales.toFixed(2)} ج</strong></span>
              </div>
            </div>
          )}

          {/* إدخال الجرد الفعلي للنقدية */}
          <div>
            <label style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '6px', display: 'block' }}>
              💵 النقدية الفعلية بعد العد اليدوي بالدرج:
            </label>
            <input
              type="number"
              min="0"
              placeholder="اكتب المبلغ الفعلي الموجود في الدرج..."
              value={physicalCash}
              onChange={(e) => setPhysicalCash(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '18px',
                fontWeight: 900,
                borderRadius: '10px',
                border: '2px solid var(--primary, #0d9488)',
                textAlign: 'left'
              }}
            />
          </div>

          {/* مؤشر الفرق أو العجز */}
          {physicalCash !== '' && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: variance === 0 ? '#ecfdf5' : variance > 0 ? '#eff6ff' : '#fef2f2',
                borderColor: variance === 0 ? '#10b981' : variance > 0 ? '#3b82f6' : '#ef4444',
                color: variance === 0 ? '#065f46' : variance > 0 ? '#1d4ed8' : '#991b1b'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '13px' }}>
                {variance === 0 ? (
                  <>
                    <CheckCircle2 size={16} />
                    مطابقة تامة بدون أي عجز أو زيادة ✅
                  </>
                ) : variance > 0 ? (
                  <>
                    <AlertTriangle size={16} />
                    يوجد زيادة في النقدية بالدرج
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} />
                    يوجد عجز نقدي في الدرج
                  </>
                )}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 900 }}>
                {variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)} جنيه
              </div>
            </div>
          )}

          {/* ملاحظات الوردية */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>ملاحظات الوردية:</label>
            <textarea
              rows="2"
              placeholder="أي ملاحظات تخص الفروقات أو المصروفات النثرية..."
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border, #cbd5e1)', fontSize: '12px' }}
            />
          </div>
        </div>

        {/* ذيل النافذة */}
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
            onClick={handleCloseShift}
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
            <Printer size={18} />
            <span>إغلاق الوردية وطباعة Z-Report</span>
          </button>

          <button
            type="button"
            onClick={() => setIsShiftModalOpen(false)}
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
      </div>
    </div>
  );
}
