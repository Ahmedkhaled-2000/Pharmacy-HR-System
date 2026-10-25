import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { Package, X, ArrowLeftRight, Building2, CheckCircle2, TrendingUp, AlertTriangle } from 'lucide-react';

export default function PosDeadStockExchangeModal() {
  const { isDeadStockModalOpen, setIsDeadStockModalOpen } = usePOS();

  // بيانات افتراضية لأدوية راكدة في هذا الفرع وتطلب بكثرة في فروع أخرى
  const [deadStockItems, setDeadStockItems] = useState([
    {
      id: 'ds-1',
      tradeNameAr: 'سيرفيتام كبسول (Cervitam)',
      batchNo: 'EGY2401',
      expiryDate: '2026-12-30',
      daysLeft: 68,
      stockHere: 15,
      price: 45.00,
      targetBranch: 'صيدلية فرع فيصل - الجيزة',
      targetDemand: 'مرتفع جداً (بيع 40 علبة/شهر)',
      status: 'ready'
    },
    {
      id: 'ds-2',
      tradeNameAr: 'نيوروتون أمبول (Neuroton)',
      batchNo: 'AMP990',
      expiryDate: '2027-01-15',
      daysLeft: 84,
      stockHere: 22,
      price: 54.00,
      targetBranch: 'صيدلية فرع مدينة نصر - القاهرة',
      targetDemand: 'مرتفع (بيع 60 علبة/شهر)',
      status: 'ready'
    },
    {
      id: 'ds-3',
      tradeNameAr: 'إنتوسيد أقراص (Entocid)',
      batchNo: 'CID112',
      expiryDate: '2027-02-10',
      daysLeft: 110,
      stockHere: 30,
      price: 21.00,
      targetBranch: 'صيدلية فرع الإسكندرية - سموحة',
      targetDemand: 'طلب مستمر',
      status: 'ready'
    }
  ]);

  if (!isDeadStockModalOpen) return null;

  const handleInitiateTransfer = (item) => {
    setDeadStockItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'transferred' } : i))
    );
    alert(`✅ تم إرسال إذن تحويل مخزني فوري لصنف [${item.tradeNameAr}] بعدد ${item.stockHere} علبة إلى ${item.targetBranch} لتصفير الراكد ومنع الخسارة.`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 2300,
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
          maxWidth: '840px',
          maxHeight: '85vh',
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
            <Package size={22} color="var(--primary, #0d9488)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                بورصة تصفير الرواكد التبادلية (P2P Dead-Stock Exchange) [F10]
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                نظام ذكي يكتشف الأدوية الراكدة في فرعك ويطابقها مع الفروع ذات الطلب المرتفع لتصريفها قبل انتهاء الصلاحية
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDeadStockModalOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {deadStockItems.map((item) => (
              <div
                key={item.id}
                style={{
                  border: '1.5px solid var(--border, #cbd5e1)',
                  borderRadius: '14px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: item.status === 'transferred' ? 'rgba(5, 150, 105, 0.05)' : 'var(--surface, #ffffff)',
                  borderColor: item.status === 'transferred' ? '#10b981' : 'var(--border, #cbd5e1)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 900, fontSize: '14.5px', color: 'var(--text, #0b132b)' }}>
                      {item.tradeNameAr}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: '#fef3c7',
                        color: '#92400e',
                        fontSize: '11px',
                        fontWeight: 800
                      }}
                    >
                      متبقي: {item.daysLeft} يوم صلاحية
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--muted, #475569)', marginTop: '4px' }}>
                    الكمية الراكدة هنا: <strong style={{ color: '#dc2626' }}>{item.stockHere} علبة</strong> (قيمة: {(item.stockHere * item.price).toFixed(2)} ج)
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--primary, #0d9488)', marginTop: '6px', fontWeight: 800 }}>
                    <Building2 size={14} />
                    <span>الفرع المستهدف للتحويل: {item.targetBranch}</span>
                    <span>• {item.targetDemand}</span>
                  </div>
                </div>

                <div>
                  {item.status === 'transferred' ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        background: '#ecfdf5',
                        color: '#059669',
                        borderRadius: '10px',
                        fontWeight: 900,
                        fontSize: '12.5px'
                      }}
                    >
                      <CheckCircle2 size={16} />
                      تم إرسال إذن النقل
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleInitiateTransfer(item)}
                      style={{
                        padding: '10px 18px',
                        background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 900,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
                      }}
                    >
                      <ArrowLeftRight size={15} />
                      <span>تحويل الصنف فوراً</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
