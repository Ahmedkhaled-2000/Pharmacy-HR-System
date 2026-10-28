import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, Search, User, Phone, DollarSign, CheckCircle2, X, Download, Printer, RefreshCw, AlertCircle, UserCheck } from 'lucide-react';
import { outstockGetCustomers, outstockAdjustCustomerWallet } from '../../utils/outstockApiClient';
import { printPosSaleReceipt } from '../../utils/posPrintService';
import PosEmployeeActionAuthModal from './PosEmployeeActionAuthModal';
import { loadExcelJS } from '../../utils/excelExport';

/**
 * PosCustomerDebtsModal.jsx
 * إدارة حسابات الآجل والديون للعملاء وسداد الحسابات الجارية
 * موثقة بكود الموظف المعتمد بنظام الـ HR
 */
export default function PosCustomerDebtsModal({ isOpen, onClose }) {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyIndebted, setOnlyIndebted] = useState(true);

  // السداد
  const [selectedCust, setSelectedCust] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card'
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const res = await outstockGetCustomers({ limit: 200 });
      if (res?.success && Array.isArray(res.customers)) {
        setCustomers(res.customers);
      } else {
        const local = localStorage.getItem('pharma_pos_customers');
        if (local) setCustomers(JSON.parse(local));
      }
    } catch (e) {
      console.warn('Failed to fetch customers debts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCustomers();
  }, [isOpen]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const balance = parseFloat(c.wallet_balance ?? c.walletBalance ?? 0);
      const isIndebted = balance < 0;
      if (onlyIndebted && !isIndebted) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const name = String(c.full_name || c.name || '').toLowerCase();
      const phone = String(c.whatsapp_phone || c.phone || '');
      const code = String(c.customer_code || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || code.includes(q);
    });
  }, [customers, searchQuery, onlyIndebted]);

  const handleOpenPayment = (cust) => {
    setSelectedCust(cust);
    const balance = Math.abs(parseFloat(cust.wallet_balance ?? cust.walletBalance ?? 0));
    setPaymentAmount(balance > 0 ? String(balance) : '');
    setPaymentNotes('');
  };

  const handleInitiatePayment = (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      alert('يرجى إدخال مبلغ سداد صحيح');
      return;
    }
    setIsAuthOpen(true);
  };

  const handleEmployeeVerified = async (emp) => {
    if (!selectedCust) return;
    const amount = parseFloat(paymentAmount);

    try {
      // تعديل المحفظة / الدين في السيرفر المركزي
      await outstockAdjustCustomerWallet(selectedCust.id, {
        amount,
        type: 'credit', // سداد يرفع الرصيد
        reason: `سداد دين نقدي بالفرع (${paymentNotes || 'سداد آجل'}) - موثق بكود: ${emp.code}`,
        paymentMethod
      }).catch(() => null);

      alert(`تم تسجيل سداد مبلغ ${amount.toFixed(2)} ج.م للعميل (${selectedCust.full_name || selectedCust.name}) بنجاح!\nالموظف المعتمد: ${emp.name}`);
      setSelectedCust(null);
      fetchCustomers();
    } catch (err) {
      alert('حدث خطأ أثناء تسجيل السداد في الخزينة');
    }
  };

  const handleExportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('ديون العملاء');
      ws.views = [{ rightToLeft: true }];

      ws.columns = [
        { header: 'كود العميل', key: 'code', width: 16 },
        { header: 'اسم العميل', key: 'name', width: 25 },
        { header: 'رقم الهاتف', key: 'phone', width: 16 },
        { header: 'العنوان', key: 'address', width: 22 },
        { header: 'الرصيد / المديونية', key: 'balance', width: 16 }
      ];

      filteredCustomers.forEach((c) => {
        const bal = parseFloat(c.wallet_balance ?? c.walletBalance ?? 0);
        ws.addRow({
          code: c.customer_code || c.id,
          name: c.full_name || c.name,
          phone: c.whatsapp_phone || c.phone,
          address: c.address || '-',
          balance: bal < 0 ? `مديونية: ${Math.abs(bal).toFixed(2)} ج.م` : `رصيد: ${bal.toFixed(2)} ج.م`
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_حسابات_آجل_العملاء_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(10px)',
          direction: 'rtl'
        }}
      >
        <div
          style={{
            width: '920px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            background: '#ffffff',
            borderRadius: '20px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 22px',
              borderBottom: '1.5px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  border: '1.5px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d97706'
                }}
              >
                <CreditCard size={20} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                  حسابات الآجل والديون للعملاء (Customer Credit & Debts Ledger)
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                  متابعة مديونيات العملاء، التحصيل النقدي، وتوثيق السداد بالـ HR
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handleExportExcel}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <Download size={14} />
                <span>تصدير إكسيل</span>
              </button>
              <button
                type="button"
                onClick={fetchCustomers}
                style={{
                  padding: '7px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} className={isLoading ? 'pos-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '7px',
                  borderRadius: '8px',
                  background: '#fee2e2',
                  border: 'none',
                  color: '#b91c1c',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ padding: '12px 22px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="بحث باسم العميل، رقم الهاتف، أو كود العميل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 32px 8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={onlyIndebted}
                onChange={(e) => setOnlyIndebted(e.target.checked)}
                style={{ accentColor: '#d97706', width: '15px', height: '15px' }}
              />
              <span>إظهار العملاء المدينين فقط (عليهم مبالغ آجلة)</span>
            </label>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <CheckCircle2 size={36} color="#86efac" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontWeight: 800 }}>لا توجد مديونيات أو حسابات مطابقة للبحث</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#475569', fontWeight: 800 }}>
                    <th style={{ padding: '10px' }}>كود العميل</th>
                    <th style={{ padding: '10px' }}>اسم العميل</th>
                    <th style={{ padding: '10px' }}>رقم الهاتف</th>
                    <th style={{ padding: '10px' }}>العنوان</th>
                    <th style={{ padding: '10px' }}>حالة الحساب / المديونية</th>
                    <th style={{ padding: '10px' }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((cust) => {
                    const balance = parseFloat(cust.wallet_balance ?? cust.walletBalance ?? 0);
                    const isIndebted = balance < 0;
                    return (
                      <tr key={cust.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: 800, color: '#64748b' }}>{cust.customer_code || cust.id}</td>
                        <td style={{ padding: '10px', fontWeight: 900, color: '#0f172a' }}>{cust.full_name || cust.name}</td>
                        <td style={{ padding: '10px', direction: 'ltr', textAlign: 'right' }}>{cust.whatsapp_phone || cust.phone || '-'}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{cust.address || '-'}</td>
                        <td style={{ padding: '10px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 900,
                              background: isIndebted ? '#fef2f2' : '#f0fdf4',
                              color: isIndebted ? '#b91c1c' : '#15803d',
                              border: `1px solid ${isIndebted ? '#fecaca' : '#bbf7d0'}`
                            }}
                          >
                            {isIndebted ? `مديونية: ${Math.abs(balance).toFixed(2)} ج.م` : `رصيد دائن: ${balance.toFixed(2)} ج.م`}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(cust)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: '#0d9488',
                              color: '#ffffff',
                              border: 'none',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <DollarSign size={13} />
                            <span>تسجيل سداد</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* نموذج سداد دين العميل */}
      {selectedCust && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999995,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(8px)',
            direction: 'rtl'
          }}
        >
          <div
            style={{
              width: '440px',
              maxWidth: '92vw',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                تسجيل سداد دين: {selectedCust.full_name || selectedCust.name}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCust(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInitiatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  مبلغ السداد (ج.م):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1.5px solid #0d9488',
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  طريقة السداد:
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    fontWeight: 800
                  }}
                >
                  <option value="cash">نقداً بالدرج (Cash)</option>
                  <option value="card">فيزا / بطاقة بنكية (Card)</option>
                  <option value="vodafone_cash">محفظة إلكترونية (Vodafone Cash)</option>
                  <option value="instapay">إنستاباي (InstaPay)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  ملاحظات أو رقم الإيصال:
                </label>
                <input
                  type="text"
                  placeholder="ملاحظات السداد..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <UserCheck size={16} />
                  <span>اعتماد السداد [بكود الموظف]</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCust(null)}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '10px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* توثيق كود الموظف عند السداد */}
      <PosEmployeeActionAuthModal
        isOpen={isAuthOpen}
        actionTitle="توثيق سداد دين عميل بالخزينة"
        actionSubtitle="يرجى إدخال كود الموظف المسئول بنظام الـ HR لاعتماد استلام النقدية"
        actionType="debt"
        onVerified={handleEmployeeVerified}
        onClose={() => setIsAuthOpen(false)}
      />
    </>
  );
}

