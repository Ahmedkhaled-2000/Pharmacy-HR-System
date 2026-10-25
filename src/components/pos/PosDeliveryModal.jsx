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
      onClick={() => setIsDeliveryModalOpen(false)}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #cbd5e1',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
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
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%)',
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
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
              }}
            >
              <Bike size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                مركز إدارة ومتابعة طلبات الدليفري (Delivery Orders Dispatcher)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                تتبع فواتير التوصيل، خط سير الطيارين، وتحصيل المبالغ النقدية للفرع
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDeliveryModalOpen(false)}
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

        {/* إحصائيات سريعة */}
        <div
          style={{
            padding: '14px 24px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ background: '#ffffff', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '8px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700 }}>إجمالي طلبات التوصيل</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#6d28d9', marginTop: '2px' }}>
                {deliveryOrders.length} طلب
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '8px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>إجمالي قيمة المبيعات</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#15803d', marginTop: '2px' }}>
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
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '8px',
                  color: '#0f172a',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* أزرار التصفية بحالة الطلب */}
        <div style={{ padding: '10px 24px', display: 'flex', gap: '8px', overflowX: 'auto', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
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
                border: activeFilter === tab.id ? '1px solid #8b5cf6' : '1px solid #cbd5e1',
                background: activeFilter === tab.id ? '#8b5cf6' : '#f8fafc',
                color: activeFilter === tab.id ? '#ffffff' : '#475569',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* قائمة الطلبات */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fafafa' }}>
          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
              <Bike size={44} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <div style={{ fontWeight: 800, fontSize: '14px', color: '#334155' }}>لا توجد طلبات دليفري مطابقة</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>يمكنك تحويل أي فاتورة بيع إلى دليفري عبر النقر على زر "تحويل لدليفري 🛵" في شاشة البيع</div>
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
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '14px', color: '#7c3aed' }}>
                        #{order.invoiceNumber}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '99px',
                          background: '#f5f3ff',
                          color: '#6d28d9',
                          border: '1px solid #ddd6fe',
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

                    <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                      👤 العميل: {order.customerName || 'عميل نقدي'} {order.customerPhone ? `(${order.customerPhone})` : ''}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                      📍 العنوان: {address}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#0284c7', marginTop: '2px', fontWeight: 700 }}>
                      🛵 الطيار المسند إليه: <strong>{pilotName}</strong>
                    </div>
                  </div>

                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
                      {parseFloat(order.totalAmount || 0).toFixed(2)} ج.م
                    </div>
                    {delivery.deliveryFee > 0 && (
                      <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 700 }}>
                        خدمة توصيل: +{delivery.deliveryFee} ج.م
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
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
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b'
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
              background: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
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
