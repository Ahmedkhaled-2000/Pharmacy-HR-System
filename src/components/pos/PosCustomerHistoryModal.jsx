import React, { useState, useEffect, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  User,
  Phone,
  Wallet,
  Clock,
  ShoppingBag,
  Receipt,
  Pill,
  X,
  Calendar,
  CheckCircle2,
  TrendingUp,
  FileText
} from 'lucide-react';

export default function PosCustomerHistoryModal() {
  const { isCustomerHistoryOpen, setIsCustomerHistoryOpen, customerHistoryTarget } = usePOS();
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'meds'

  // استخراج فواتير العميل من الذاكرة المحلية والمركزية
  const customerInvoices = useMemo(() => {
    if (!customerHistoryTarget) return [];
    try {
      const raw = localStorage.getItem('pharma_pos_sales');
      const sales = raw ? JSON.parse(raw) : [];
      const cleanPhone = (customerHistoryTarget.phone || '').replace(/\D/g, '');
      const name = (customerHistoryTarget.name || '').trim().toLowerCase();

      return sales.filter((s) => {
        const sPhone = (s.customerPhone || '').replace(/\D/g, '');
        const sName = (s.customerName || '').trim().toLowerCase();
        if (cleanPhone && sPhone && (sPhone.includes(cleanPhone) || cleanPhone.includes(sPhone))) return true;
        if (name && sName && (sName.includes(name) || name.includes(sName))) return true;
        return false;
      });
    } catch {
      return [];
    }
  }, [customerHistoryTarget, isCustomerHistoryOpen]);

  // استخراج الأدوية المعتادة التي اشترى منها العميل
  const frequentMeds = useMemo(() => {
    const map = {};
    customerInvoices.forEach((inv) => {
      (inv.items || []).forEach((it) => {
        const key = it.tradeNameAr || it.tradeNameEn || it.productId;
        if (!map[key]) {
          map[key] = {
            name: it.tradeNameAr || it.tradeNameEn,
            generic: it.genericName || '',
            count: 0,
            lastBought: inv.createdAt
          };
        }
        map[key].count += it.quantity || 1;
      });
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [customerInvoices]);

  const totalSpent = customerInvoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount || 0)), 0);

  // إغلاق المودال بزر Esc
  useEffect(() => {
    if (!isCustomerHistoryOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsCustomerHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCustomerHistoryOpen, setIsCustomerHistoryOpen]);

  if (!isCustomerHistoryOpen || !customerHistoryTarget) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        animation: 'posFadeIn 0.15s ease-out'
      }}
      onClick={() => setIsCustomerHistoryOpen(false)}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #cbd5e1',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden',
          animation: 'posPopScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط رأس المودال */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
              }}
            >
              <User size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                  {customerHistoryTarget.name || 'عميل مسجل'}
                </h3>
                {customerHistoryTarget.isChronic && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '99px',
                      background: '#ecfdf5',
                      border: '1px solid #10b981',
                      color: '#065f46',
                      fontSize: '11px',
                      fontWeight: 800
                    }}
                  >
                    مريض مزمن 💊
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                📞 {customerHistoryTarget.phone || 'بدون هاتف مسجل'} • ملف العميل المركزي الموحد
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCustomerHistoryOpen(false)}
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              color: '#475569',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* كروت الإحصائيات السريعة */}
        <div
          style={{
            padding: '14px 24px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px'
          }}
        >
          <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: 800 }}>💰 رصيد المحفظة المتاح</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#15803d', marginTop: '2px' }}>
              {(parseFloat(customerHistoryTarget.walletBalance) || 0).toFixed(2)} ج.م
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 800 }}>🧾 إجمالي الفواتير السابقة</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0369a1', marginTop: '2px' }}>
              {customerInvoices.length} فاتورة
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '11.5px', color: '#d97706', fontWeight: 800 }}>🛍️ إجمالي المشتريات التراكمي</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#b45309', marginTop: '2px' }}>
              {totalSpent.toFixed(2)} ج.م
            </div>
          </div>
        </div>

        {/* شريط التبويبات */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              background: activeTab === 'invoices' ? '#0d9488' : '#f8fafc',
              border: activeTab === 'invoices' ? '1px solid #0d9488' : '1px solid #cbd5e1',
              color: activeTab === 'invoices' ? '#ffffff' : '#475569',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            📋 سجل الفواتير السابقة ({customerInvoices.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('meds')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              background: activeTab === 'meds' ? '#0d9488' : '#f8fafc',
              border: activeTab === 'meds' ? '1px solid #0d9488' : '1px solid #cbd5e1',
              color: activeTab === 'meds' ? '#ffffff' : '#475569',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            💊 الأدوية المعتادة الأكثر طلباً ({frequentMeds.length})
          </button>
        </div>

        {/* محتوى التبويبات */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', background: '#fafafa' }}>
          {activeTab === 'invoices' && (
            <div>
              {customerInvoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <Receipt size={36} color="#94a3b8" style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>لا توجد فواتير مبيعات سابقة مسجلة لهذا العميل حتى الآن</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>سيتم أرشفة كل فاتورة جديدة تصدر باسم العميل أو هاتفه فوراً</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customerInvoices.map((inv) => (
                    <div
                      key={inv.id || inv.invoiceNumber}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 900, color: '#0284c7' }}>
                            فاتورة #{inv.invoiceNumber}
                          </span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '99px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              background: inv.invoiceType === 'rx' ? '#e0f2fe' : inv.invoiceType === 'delivery' ? '#ede9fe' : '#ecfdf5',
                              color: inv.invoiceType === 'rx' ? '#0369a1' : inv.invoiceType === 'delivery' ? '#6d28d9' : '#047857',
                              border: '1px solid currentColor'
                            }}
                          >
                            {inv.invoiceType === 'rx' ? 'روشتة Rx' : inv.invoiceType === 'delivery' ? 'دليفري 🛵' : 'OTC مباشر'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                          📅 {new Date(inv.createdAt).toLocaleDateString('ar-EG')} - {new Date(inv.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} • الفرع: {inv.branchName || 'الرئيسي'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
                          الأصناف: {(inv.items || []).map((i) => `${i.tradeNameAr || i.tradeNameEn} (×${i.quantity || 1})`).join('، ') || 'بدون تفاصيل'}
                        </div>
                      </div>

                      <div style={{ textAlign: 'left', minWidth: '90px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
                          {parseFloat(inv.totalAmount || 0).toFixed(2)} ج.م
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          طريقة الدفع: {inv.paymentMethod === 'card' ? 'فيزا 💳' : 'كاش 💵'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'meds' && (
            <div>
              {frequentMeds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <Pill size={36} color="#94a3b8" style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>لا توجد أدوية متكررة مسجلة لهذا العميل</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                  {frequentMeds.map((med, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                        {med.name}
                      </div>
                      {med.generic && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          🧪 {med.generic}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11.5px' }}>
                        <span style={{ color: '#0284c7', fontWeight: 800 }}>تكرر الشراء: {med.count} مرة</span>
                        <span style={{ color: '#64748b' }}>آخر صرف: {new Date(med.lastBought).toLocaleDateString('ar-EG')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
