import React, { useState, useMemo, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { logPosSecurityAction } from '../../utils/posAuditLogger';
import {
  RotateCcw,
  Search,
  X,
  Check,
  AlertCircle,
  Printer,
  FileText,
  UserCheck,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function PosReturnsModal() {
  const { isReturnsModalOpen, setIsReturnsModalOpen, currentShift, setCurrentShift } = usePOS();
  const { currentBranch, currentEmpUser } = useAuth?.() || {};
  const { state } = useData?.() || {};
  const { showToast } = useUI?.() || {};

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnItemsState, setReturnItemsState] = useState({});
  const [returnReason, setReturnReason] = useState('رغبة العميل (سليم ومطابق للشروط)');

  // توثيق كود الموظف المسؤول عن اعتماد المرتجع
  const [employeeCode, setEmployeeCode] = useState(() => currentEmpUser?.code || '');
  const [empError, setEmpError] = useState('');

  const verifiedEmp = useMemo(() => {
    if (!employeeCode.trim()) return null;
    const clean = String(employeeCode).trim().toLowerCase();
    const emps = state?.employees || [];
    return emps.find(
      (e) => String(e.code || '').toLowerCase() === clean || String(e.id || '').toLowerCase() === clean
    ) || (currentEmpUser?.code === clean ? currentEmpUser : null);
  }, [employeeCode, state?.employees, currentEmpUser]);

  useEffect(() => {
    if (currentEmpUser?.code && !employeeCode) {
      setEmployeeCode(currentEmpUser.code);
    }
  }, [currentEmpUser]);

  // تحميل المبيعات المحلية المحفوظة
  const allSales = useMemo(() => {
    try {
      const raw = localStorage.getItem('pharma_pos_sales');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [isReturnsModalOpen]);

  if (!isReturnsModalOpen) return null;

  // البحث في الفواتير
  const filteredSales = allSales.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      (s.invoiceNumber || '').toLowerCase().includes(q) ||
      (s.customerPhone || '').includes(q) ||
      (s.customerName || '').toLowerCase().includes(q)
    );
  }).slice(0, 10);

  const handleSelectInvoice = (inv) => {
    setSelectedInvoice(inv);
    const initialReturns = {};
    (inv.items || []).forEach((item, idx) => {
      const remainingReturnable = Math.max(0, (item.quantity || 0) - (item.returnedQty || 0));
      initialReturns[idx] = { returnQty: 0, maxQty: remainingReturnable, unitPrice: item.unitPrice, item };
    });
    setReturnItemsState(initialReturns);
  };

  const handleUpdateReturnQty = (idx, qty) => {
    setReturnItemsState((prev) => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        returnQty: Math.max(0, Math.min(prev[idx].maxQty, parseFloat(qty) || 0))
      }
    }));
  };

  // إجمالي قيمة المرتجع المستحقة
  const totalRefundAmount = Object.values(returnItemsState).reduce((sum, item) => {
    return sum + ((item.returnQty || 0) * (item.unitPrice || 0));
  }, 0);

  const handleConfirmReturn = () => {
    if (totalRefundAmount <= 0) {
      showToast?.('⚠️ يرجى تحديد كمية صنف واحد على الأقل للمرتجع.');
      return;
    }

    if (!employeeCode.trim()) {
      setEmpError('⚠️ إلزامي: يجب إدخال كود الموظف المسؤول لتوثيق وتأكيد حركة المرتجع.');
      return;
    }

    setEmpError('');
    const activeCode = verifiedEmp?.code || employeeCode.trim();
    const activeName = verifiedEmp?.name || currentEmpUser?.name || `صيدلي (${activeCode})`;
    const activeId = verifiedEmp?.id || currentEmpUser?.id || `emp_${activeCode}`;

    const returnedItems = Object.entries(returnItemsState)
      .filter(([_, it]) => it.returnQty > 0)
      .map(([idx, it]) => {
        const origItem = selectedInvoice.items[idx] || {};
        return {
          ...origItem,
          returnedQty: it.returnQty,
          refundAmount: it.returnQty * it.unitPrice
        };
      });

    const returnRecord = {
      id: `ret_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      invoiceNumber: selectedInvoice.invoiceNumber,
      originalSaleId: selectedInvoice.id,
      branchId: selectedInvoice.branchId || currentBranch?.id || 'branch-1',
      createdAt: new Date().toISOString(),
      totalRefundAmount,
      returnReason,
      cashierEmpCode: activeCode,
      cashierEmpName: activeName,
      cashierEmpId: activeId,
      items: returnedItems
    };

    // حفظ في سجل المرتجعات المحلي
    try {
      const existingReturns = JSON.parse(localStorage.getItem('pharma_pos_returns') || '[]');
      existingReturns.unshift(returnRecord);
      localStorage.setItem('pharma_pos_returns', JSON.stringify(existingReturns));
    } catch (err) {
      console.error('Failed saving return record:', err);
    }

    // تحديث كاش الوردية بخصم المرتجع الفعلي من الدرج
    if (setCurrentShift) {
      setCurrentShift((prev) => ({
        ...prev,
        cashRefunds: parseFloat(((prev?.cashRefunds || 0) + totalRefundAmount).toFixed(2))
      }));
    }

    // تحديث الفاتورة الأصلية في السجل لمنع تكرار الإرجاع
    try {
      const salesRaw = localStorage.getItem('pharma_pos_sales');
      if (salesRaw) {
        let salesList = JSON.parse(salesRaw);
        const sIdx = salesList.findIndex(s => s.id === selectedInvoice.id || s.invoiceNumber === selectedInvoice.invoiceNumber);
        if (sIdx >= 0) {
          const targetSale = salesList[sIdx];
          const updatedItems = (targetSale.items || []).map((it, idx) => {
            const retState = returnItemsState[idx];
            if (retState && retState.returnQty > 0) {
              return {
                ...it,
                returnedQty: (it.returnedQty || 0) + retState.returnQty
              };
            }
            return it;
          });
          salesList[sIdx] = {
            ...targetSale,
            items: updatedItems,
            hasReturns: true,
            totalRefunded: parseFloat(((targetSale.totalRefunded || 0) + totalRefundAmount).toFixed(2))
          };
          localStorage.setItem('pharma_pos_sales', JSON.stringify(salesList));
        }
      }
    } catch (e) {
      console.warn('Failed to update sales invoice with return status:', e);
    }

    // إدراج المرتجع في طابور الـ Outbox الموحد للمزامنة مع السيرفر السحابي
    try {
      const outboxRaw = localStorage.getItem('pharma_pos_outbox');
      const outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
      outbox.push({
        eventId: `evt_ret_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        eventType: 'sale.return',
        idempotencyKey: `pos_ret_${selectedInvoice.invoiceNumber}_${Date.now()}`,
        payload: returnRecord,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
      localStorage.setItem('pharma_pos_outbox', JSON.stringify(outbox));
      window.dispatchEvent(new CustomEvent('pos:outbox-updated', { detail: { count: outbox.length } }));

      // محاولة المزامنة اللحظية لو الإنترنت متاح
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../../utils/posOfflineSync.js').then((mod) => {
          mod.triggerBackgroundSync?.();
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to enqueue return to outbox:', e);
    }

    // تسجيل في سجل الرقابة والأمان (Anti-skimming security audit)
    logPosSecurityAction({
      actionType: 'VERIFIED_REFUND',
      terminalCode: localStorage.getItem('app_pos_terminal') || 'POS-01',
      branchId: selectedInvoice.branchId || currentBranch?.id || 'branch-1',
      cashierCode: activeCode,
      cashierName: activeName,
      details: `مرتجع مبيعات للفاتورة ${selectedInvoice.invoiceNumber} بقيمة ${totalRefundAmount.toFixed(2)} ج - السبب: ${returnReason}`,
      metadata: {
        invoiceNumber: selectedInvoice.invoiceNumber,
        totalRefundAmount,
        reason: returnReason,
        itemCount: returnedItems.length
      }
    });

    window.dispatchEvent(new CustomEvent('pos:return-completed', { detail: returnRecord }));

    showToast?.(`✅ تم اعتماد مرتجع المبيعات وخصم ${totalRefundAmount.toFixed(2)} ج من عهدة الدرج بنجاح.`);
    setIsReturnsModalOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 2200,
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
            <RotateCcw size={22} color="#dc2626" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
              مرتجع مبيعات فوري برقم الفاتورة [F9]
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsReturnsModalOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم المودال */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* حقل البحث برقم الفاتورة */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>
              🔍 ابحث برقم الفاتورة أو هاتف العميل:
            </div>
            <input
              type="text"
              placeholder="اكتب رقم الفاتورة مثلاً INV-... أو هاتف العميل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1.5px solid var(--border, #cbd5e1)',
                fontSize: '13px'
              }}
            />
          </div>

          {/* قائمة الفواتير السابقة */}
          {!selectedInvoice && (
            <div style={{ border: '1px solid var(--border, #cbd5e1)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: 'var(--surface-hover, #f8fafc)', fontWeight: 800, fontSize: '12px' }}>
                آخر الفواتير الصادرة:
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {filteredSales.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted, #475569)', fontSize: '12px' }}>
                    لا توجد فواتير مطابقة
                  </div>
                ) : (
                  filteredSales.map((sale) => (
                    <div
                      key={sale.id}
                      onClick={() => handleSelectInvoice(sale)}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px' }}>{sale.invoiceNumber}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: sale.invoiceType === 'rx' ? '#0ea5e920' : sale.invoiceType === 'customer_order' ? '#f59e0b20' : '#10b98120',
                              color: sale.invoiceType === 'rx' ? '#0284c7' : sale.invoiceType === 'customer_order' ? '#d97706' : '#059669',
                              border: `1px solid ${sale.invoiceType === 'rx' ? '#0ea5e940' : sale.invoiceType === 'customer_order' ? '#f59e0b40' : '#10b98140'}`
                            }}
                          >
                            {sale.invoiceType === 'rx' ? '💊 روشتة' : sale.invoiceType === 'customer_order' ? '📋 طلب عميل' : sale.invoiceType === 'delivery' ? '🛵 دليفري' : '🟢 OTC'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                          {new Date(sale.createdAt).toLocaleString('ar-EG')} • {sale.customerName || 'عميل نقدي'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 900, color: 'var(--primary, #0d9488)', fontSize: '14px' }}>
                          {sale.totalAmount.toFixed(2)} ج
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>
                          {sale.items?.length || 0} بنود
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* تفاصيل الفاتورة المختارة وبنود المرتجع الجزئي */}
          {selectedInvoice && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-hover, #f8fafc)', padding: '10px 14px', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 800 }}>الفاتورة: {selectedInvoice.invoiceNumber}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: selectedInvoice.invoiceType === 'rx' ? '#0ea5e920' : selectedInvoice.invoiceType === 'customer_order' ? '#f59e0b20' : '#10b98120',
                      color: selectedInvoice.invoiceType === 'rx' ? '#0284c7' : selectedInvoice.invoiceType === 'customer_order' ? '#d97706' : '#059669',
                      border: `1px solid ${selectedInvoice.invoiceType === 'rx' ? '#0ea5e940' : selectedInvoice.invoiceType === 'customer_order' ? '#f59e0b40' : '#10b98140'}`
                    }}
                  >
                    {selectedInvoice.invoiceType === 'rx' ? '💊 روشتة (Rx)' : selectedInvoice.invoiceType === 'customer_order' ? '📋 طلب عميل' : selectedInvoice.invoiceType === 'delivery' ? '🛵 دليفري' : '🟢 OTC لا وصفية'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted, #475569)' }}>
                    ({selectedInvoice.items?.length} أصناف)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary, #0d9488)', cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}
                >
                  تغيير الفاتورة 🔄
                </button>
              </div>

              {/* جدول بنود الفاتورة وتحديد الكمية المرتجعة */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover, #f8fafc)', borderBottom: '2px solid var(--border, #cbd5e1)' }}>
                    <th style={{ padding: '8px', textAlign: 'right' }}>الصنف</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>الكمية المباعة</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>الكمية المرتجعة</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>المبلغ المرتجع</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedInvoice.items || []).map((it, idx) => {
                    const retInfo = returnItemsState[idx] || { returnQty: 0, maxQty: it.quantity };
                    const lineRefund = (retInfo.returnQty || 0) * it.unitPrice;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle, #e2e8f0)' }}>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800 }}>{it.tradeNameAr}</span>
                            <span
                              style={{
                                fontSize: '9.5px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: it.itemType === 'rx' ? '#0ea5e915' : it.itemType === 'customer_order' ? '#f59e0b15' : '#10b98115',
                                color: it.itemType === 'rx' ? '#0284c7' : it.itemType === 'customer_order' ? '#d97706' : '#059669',
                                border: `1px solid ${it.itemType === 'rx' ? '#0ea5e930' : it.itemType === 'customer_order' ? '#f59e0b30' : '#10b98130'}`
                              }}
                            >
                              {it.itemType === 'rx' ? '💊 Rx' : it.itemType === 'customer_order' ? '📋 طلب' : '🟢 OTC'}
                            </span>
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--muted, #475569)' }}>{it.unitLabel} @ {it.unitPrice.toFixed(2)} ج</div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800 }}>
                          {it.quantity}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max={it.quantity}
                            value={retInfo.returnQty}
                            onChange={(e) => handleUpdateReturnQty(idx, e.target.value)}
                            style={{
                              width: '60px',
                              textAlign: 'center',
                              padding: '4px',
                              borderRadius: '6px',
                              border: '1px solid var(--border, #cbd5e1)',
                              fontWeight: 800
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'left', fontWeight: 900, color: '#dc2626' }}>
                          {lineRefund.toFixed(2)} ج
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* سبب الإرجاع */}
              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 800, marginBottom: '4px', display: 'block' }}>سبب الإرجاع:</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border, #cbd5e1)', fontSize: '12px' }}
                >
                  <option value="رغبة العميل (سليم ومطابق للشروط)">رغبة العميل (سليم ومطابق للشروط)</option>
                  <option value="صرف صنف خاطئ بالخطأ من الصيدلي">صرف صنف خاطئ بالخطأ من الصيدلي</option>
                  <option value="عيب صناعة أو تلف في العبوة">عيب صناعة أو تلف في العبوة</option>
                  <option value="حساسية دوائية / إلغاء روشتة الطبيب">حساسية دوائية / إلغاء روشتة الطبيب</option>
                  <option value="تاريخ الصلاحية غير مناسب للعميل">تاريخ الصلاحية غير مناسب للعميل</option>
                  <option value="سبب إداري آخر">سبب إداري آخر</option>
                </select>
              </div>

              {/* بطاقة توثيق كود الموظف المسؤول عن المرتجع */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  border: empError ? '1.5px solid #ef4444' : verifiedEmp ? '1.5px solid #10b981' : '1px solid var(--border, #cbd5e1)',
                  background: verifiedEmp ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface-hover, #f8fafc)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text, #0f172a)' }}>
                    <UserCheck size={16} color={verifiedEmp ? '#10b981' : '#dc2626'} />
                    <span>كود الموظف المسؤول (إلزامي لاعتماد المرتجع):</span>
                  </label>
                  {verifiedEmp && (
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={14} />
                      تم التحقق: {verifiedEmp.name}
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="أدخل كود الموظف المسؤول (مثال: EMP-101)..."
                  value={employeeCode}
                  onChange={(e) => {
                    setEmployeeCode(e.target.value);
                    if (empError) setEmpError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmReturn();
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--primary, #0d9488)',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: 'var(--surface, #ffffff)',
                    color: 'var(--text, #0f172a)'
                  }}
                />

                {empError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '11.5px', fontWeight: 700 }}>
                    <AlertTriangle size={14} />
                    <span>{empError}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ذيل النافذة والتأكيد */}
        {selectedInvoice && (
          <div
            style={{
              padding: '16px 20px',
              background: 'var(--surface-hover, #f8fafc)',
              borderTop: '1px solid var(--border, #cbd5e1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '12px', color: 'var(--muted, #475569)' }}>إجمالي المبلغ المسترد للعميل:</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#dc2626' }}>
                {totalRefundAmount.toFixed(2)} جنيه
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={totalRefundAmount <= 0}
                onClick={handleConfirmReturn}
                style={{
                  padding: '12px 24px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 900,
                  fontSize: '14px',
                  cursor: totalRefundAmount > 0 ? 'pointer' : 'not-allowed',
                  opacity: totalRefundAmount > 0 ? 1 : 0.6
                }}
              >
                اعتماد المرتجع واسترداد النقدية
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
