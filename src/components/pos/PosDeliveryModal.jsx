import React, { useState, useMemo, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import {
  Bike,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  User,
  DollarSign,
  X,
  AlertTriangle,
  Receipt
} from 'lucide-react';

export default function PosDeliveryModal() {
  const { isDeliveryModalOpen, setIsDeliveryModalOpen } = usePOS();
  const { currentBranch } = useAuth?.() || {};

  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'pending' | 'on_way' | 'delivered' | 'cancelled'
  const [searchQuery, setSearchQuery] = useState('');

  // جلب الفواتير المخزنة محلياً وتصفية طلبات الدليفري
  const deliveryOrders = useMemo(() => {
    try {
      const raw = localStorage.getItem('pharma_pos_sales');
      const sales = raw ? JSON.parse(raw) : [];
      return sales.filter((s) => s.invoiceType === 'delivery' || s.deliveryDetails?.isDelivery);
    } catch {
      return [];
    }
  }, [isDeliveryModalOpen]);

  // إغلاق المودال بزر Escape
  useEffect(() => {
    if (!isDeliveryModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsDeliveryModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeliveryModalOpen, setIsDeliveryModalOpen]);

  if (!isDeliveryModalOpen) return null;

  const filteredOrders = deliveryOrders.filter((order) => {
    if (activeFilter !== 'all' && (order.deliveryStatus || 'on_way') !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const num = String(order.invoiceNumber || '').toLowerCase();
      const name = String(order.customerName || '').toLowerCase();
      const phone = String(order.customerPhone || '').toLowerCase();
      const pilot = String(order.deliveryDetails?.pilotName || '').toLowerCase();
      if (!num.includes(q) && !name.includes(q) && !phone.includes(q) && !pilot.includes(q)) return false;
    }
    return true;
  });

  const totalDeliveryAmount = deliveryOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount || 0)), 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl'
      }}
      onClick={() => setIsDeliveryModalOpen(false)}
    >
      <div
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          border: '1.5px solid rgba(139, 92, 246, 0.45)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.75), 0 0 40px rgba(139, 92, 246, 0.25)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط رأس المودال */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(15,23,42,0.95) 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
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
                background: 'rgba(139, 92, 246, 0.25)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a78bfa'
              }}
            >
              <Bike size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#ffffff' }}>
                مركز إدارة ومتابعة طلبات الدليفري (Delivery Orders Dispatcher)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                تتبع فواتير التوصيل، خط سير الطيارين، وتحصيل المبالغ النقدية للفرع
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDeliveryModalOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: '#94a3b8',
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

        {/* إحصائيات سريعة */}
        <div
          style={{
            padding: '14px 24px',
            background: 'rgba(255,255,255,0.02)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '10px', padding: '8px 14px' }}>
              <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700 }}>إجمالي طلبات التوصيل</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
                {deliveryOrders.length} طلب
              </div>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '8px 14px' }}>
              <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>إجمالي قيمة المبيعات</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
                {totalDeliveryAmount.toFixed(2)} ج.م
              </div>
            </div>
          </div>

          {/* تصفية وبحث */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="بحث باسم العميل، الهاتف، أو الطيار..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 32px 7px 10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '12px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>

        {/* أزرار التصفية بحالة الطلب */}
        <div style={{ padding: '10px 24px', display: 'flex', gap: '8px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { id: 'all', label: 'كل الطلبات' },
            { id: 'pending', label: 'قيد التجهيز ⏳' },
            { id: 'on_way', label: 'مع الطيار 🛵' },
            { id: 'delivered', label: 'تم التسليم بنجاح ✅' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeFilter === tab.id ? '#8b5cf6' : 'rgba(255,255,255,0.05)',
                color: activeFilter === tab.id ? '#ffffff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* قائمة الطلبات */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
              <Bike size={44} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <div style={{ fontWeight: 800, fontSize: '14px' }}>لا توجد طلبات دليفري مطابقة</div>
              <div style={{ fontSize: '12px' }}>يمكنك تحويل أي فاتورة بيع إلى دليفري عبر النقر على زر "تحويل لدليفري 🛵" في شاشة البيع</div>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const delivery = order.deliveryDetails || {};
              const pilotName = delivery.pilotName || 'طيار الفرع';
              const address = delivery.address || 'العنوان مسجل هاتفياً';

              return (
                <div
                  key={order.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '14px', color: '#a78bfa' }}>
                        #{order.invoiceNumber}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '99px',
                          background: 'rgba(139,92,246,0.2)',
                          color: '#c4b5fd',
                          fontSize: '10.5px',
                          fontWeight: 800
                        }}
                      >
                        🛵 دليفري
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(order.createdAt).toLocaleTimeString('ar-EG')}
                      </span>
                    </div>

                    <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                      👤 العميل: {order.customerName || 'عميل نقدي'} {order.customerPhone ? `(${order.customerPhone})` : ''}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                      📍 العنوان: {address}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#38bdf8', marginTop: '2px' }}>
                      🛵 الطيار المسند إليه: <strong>{pilotName}</strong>
                    </div>
                  </div>

                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981' }}>
                      {parseFloat(order.totalAmount || 0).toFixed(2)} ج.م
                    </div>
                    {delivery.deliveryFee > 0 && (
                      <div style={{ fontSize: '11px', color: '#f59e0b' }}>
                        خدمة توصيل: +{delivery.deliveryFee} ج.م
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      {(order.items || []).length} أصناف
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* شريط ذيل المودال */}
        <div
          style={{
            padding: '12px 24px',
            background: 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#94a3b8'
          }}
        >
          <div>
            💡 يتم ربط فواتير الدليفري تلقائياً مع حسابات الطيارين وعمولات التوصيل
          </div>
          <button
            type="button"
            onClick={() => setIsDeliveryModalOpen(false)}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.08)',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            إغلاق [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}
