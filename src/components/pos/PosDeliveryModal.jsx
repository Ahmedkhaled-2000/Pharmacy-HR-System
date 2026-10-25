import React, { useState, useMemo, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import {
  getDeliveryPilots,
  saveDeliveryPilots,
  getDeliveryZones,
  getDeliveryOrders,
  updateDeliveryOrderStatus,
  calculatePilotsSummary,
  settlePilotCash,
  generatePilotWhatsAppMessage,
  generateCustomerWhatsAppMessage,
  openWhatsAppChat,
  printDeliveryWaybill
} from '../../services/posDeliveryService';
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
  Receipt,
  Printer,
  MessageSquare,
  Send,
  Plus,
  RefreshCw,
  Wallet,
  ShieldCheck,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

export default function PosDeliveryModal() {
  const { isDeliveryModalOpen, setIsDeliveryModalOpen, currentShift } = usePOS();
  const { currentBranch, currentEmpUser } = useAuth?.() || {};

  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'settlement' | 'pilots'
  const [activeStatusFilter, setActiveStatusFilter] = useState('all'); // 'all' | 'pending' | 'on_way' | 'delivered' | 'returned'
  const [selectedPilotFilter, setSelectedPilotFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // قائمة الطيارين
  const [pilots, setPilots] = useState(() => getDeliveryPilots());
  const [newPilotName, setNewPilotName] = useState('');
  const [newPilotPhone, setNewPilotPhone] = useState('');
  const [newPilotFee, setNewPilotFee] = useState('10');
  const [isAddingPilot, setIsAddingPilot] = useState(false);

  // تحديث البيانات عند فتح المودال أو بث حدث
  useEffect(() => {
    if (!isDeliveryModalOpen) return;
    setPilots(getDeliveryPilots());
  }, [isDeliveryModalOpen, refreshTrigger]);

  useEffect(() => {
    const handleDeliveryUpdated = () => setRefreshTrigger((prev) => prev + 1);
    window.addEventListener('pos:delivery-updated', handleDeliveryUpdated);
    window.addEventListener('pos:pilot-settled', handleDeliveryUpdated);
    return () => {
      window.removeEventListener('pos:delivery-updated', handleDeliveryUpdated);
      window.removeEventListener('pos:pilot-settled', handleDeliveryUpdated);
    };
  }, []);

  // إغلاق المودال بزر Escape
  useEffect(() => {
    if (!isDeliveryModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsDeliveryModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeliveryModalOpen, setIsDeliveryModalOpen]);

  // جلب الفواتير المخزنة محلياً وتصفية طلبات الدليفري
  const deliveryOrders = useMemo(() => {
    return getDeliveryOrders();
  }, [isDeliveryModalOpen, refreshTrigger]);

  const pilotsSummary = useMemo(() => {
    return calculatePilotsSummary(deliveryOrders, pilots);
  }, [deliveryOrders, pilots]);

  if (!isDeliveryModalOpen) return null;

  // تصفية الطلبات
  const filteredOrders = deliveryOrders.filter((order) => {
    const status = order.deliveryStatus || 'pending';
    if (activeStatusFilter !== 'all' && status !== activeStatusFilter) return false;

    const pilotName = order.deliveryDetails?.pilotName || '';
    if (selectedPilotFilter !== 'all' && pilotName !== selectedPilotFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const num = String(order.invoiceNumber || '').toLowerCase();
      const name = String(order.customerName || '').toLowerCase();
      const phone = String(order.customerPhone || '').toLowerCase();
      const pilot = String(pilotName).toLowerCase();
      const addr = String(order.deliveryDetails?.address || '').toLowerCase();
      if (!num.includes(q) && !name.includes(q) && !phone.includes(q) && !pilot.includes(q) && !addr.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const totalDeliverySales = deliveryOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);
  const pendingCount = deliveryOrders.filter((o) => (o.deliveryStatus || 'pending') === 'pending').length;
  const onWayCount = deliveryOrders.filter((o) => o.deliveryStatus === 'on_way').length;
  const deliveredCount = deliveryOrders.filter((o) => o.deliveryStatus === 'delivered').length;
  const returnedCount = deliveryOrders.filter((o) => o.deliveryStatus === 'returned').length;

  // تغيير حالة الطلب
  const handleStatusChange = (order, newStatus) => {
    updateDeliveryOrderStatus(order.id || order.invoiceNumber, newStatus);
    setRefreshTrigger((prev) => prev + 1);
  };

  // إسناد طيار للطلب
  const handleAssignPilot = (order, pilot) => {
    updateDeliveryOrderStatus(order.id || order.invoiceNumber, order.deliveryStatus || 'pending', {
      pilotId: pilot.id,
      pilotName: pilot.name,
      pilotPhone: pilot.phone
    });
    setRefreshTrigger((prev) => prev + 1);
  };

  // إضافة طيار جديد
  const handleAddPilot = (e) => {
    e.preventDefault();
    if (!newPilotName.trim()) return;
    const newPilot = {
      id: `pilot-${Date.now()}`,
      name: newPilotName.trim(),
      phone: newPilotPhone.trim(),
      vehicle: 'موتوسيكل',
      status: 'available',
      commissionPerOrder: parseFloat(newPilotFee) || 10
    };
    const updated = [...pilots, newPilot];
    setPilots(updated);
    saveDeliveryPilots(updated);
    setNewPilotName('');
    setNewPilotPhone('');
    setIsAddingPilot(false);
  };

  // تسوية نقدية الطيار وتوريدها للدرج
  const handleSettlePilot = (summary) => {
    if (summary.totalCashCollected <= 0) {
      alert(`لا توجد نقدية محصلة مستحقة التوريد للطيار ${summary.pilot.name}`);
      return;
    }
    const confirmSettle = window.confirm(
      `تأكيد تسوية عهدة [${summary.pilot.name}]؟\n` +
      `إجمالي المحصل: ${summary.totalCashCollected.toFixed(2)} ج.م\n` +
      `عمولة الطيار: ${summary.totalCommissionEarned.toFixed(2)} ج.م\n` +
      `الصافي المورد لدرج الكاشير: ${(summary.totalCashCollected - summary.totalCommissionEarned).toFixed(2)} ج.م`
    );
    if (!confirmSettle) return;

    settlePilotCash(
      summary.pilot.id,
      summary.pilot.name,
      summary.totalCashCollected,
      summary.totalCommissionEarned,
      currentShift?.id
    );
    setRefreshTrigger((prev) => prev + 1);
    alert(`تمت تسوية وتوريد عهدة ${summary.pilot.name} بنجاح إلى درج الكاشير! ✅`);
  };

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
          maxWidth: '1100px',
          height: '92vh',
          maxHeight: '900px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 1. رأس النافذة الأنيق الموحد ── */}
        <div
          style={{
            padding: '16px 24px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)'
              }}
            >
              <Bike size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                  مركز تشغيل وإدارة أوردرات الدليفري (Delivery Dispatch & Settlement)
                </h2>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '99px',
                    background: '#ede9fe',
                    color: '#6d28d9',
                    fontSize: '11px',
                    fontWeight: 800
                  }}
                >
                  {currentBranch?.name || 'الفرع الرئيسي'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                تتبع خطوط سير الطيارين، تصفية وتوريد العهدة النقدية، وتوليد بوالص الشحن ورسائل الواتساب
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* التبويبات الرئيسية */}
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                padding: '3px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9px',
                  border: 'none',
                  background: activeTab === 'orders' ? '#ffffff' : 'transparent',
                  color: activeTab === 'orders' ? '#7c3aed' : '#64748b',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'orders' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                🛵 طلبات التوصيل ({deliveryOrders.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9px',
                  border: 'none',
                  background: activeTab === 'settlement' ? '#ffffff' : 'transparent',
                  color: activeTab === 'settlement' ? '#059669' : '#64748b',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'settlement' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                💰 تسوية عهدة الطيارين
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pilots')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9px',
                  border: 'none',
                  background: activeTab === 'pilots' ? '#ffffff' : 'transparent',
                  color: activeTab === 'pilots' ? '#0d9488' : '#64748b',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'pilots' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                👥 فريق الطيارين ({pilots.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsDeliveryModalOpen(false)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="إغلاق [Esc]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── 2. محتوى تبويب طلبات التوصيل (Orders Dispatcher) ── */}
        {activeTab === 'orders' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* مؤشرات الأداء السريعة وأشرطة التصفية */}
            <div
              style={{
                padding: '12px 24px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              {/* أزرار الحالات مع العدادات الحية */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
                {[
                  { id: 'all', label: 'كافة الطلبات', count: deliveryOrders.length, color: '#475569', bg: '#f1f5f9' },
                  { id: 'pending', label: 'قيد التجهيز ⏳', count: pendingCount, color: '#d97706', bg: '#fef3c7' },
                  { id: 'on_way', label: 'مع الطيار 🛵', count: onWayCount, color: '#7c3aed', bg: '#ede9fe' },
                  { id: 'delivered', label: 'تم التسليم والتحصيل ✅', count: deliveredCount, color: '#059669', bg: '#dcfce7' },
                  { id: 'returned', label: 'مرتجع ❌', count: returnedCount, color: '#dc2626', bg: '#fee2e2' }
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStatusFilter(s.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '8px',
                      border: activeStatusFilter === s.id ? `1.5px solid ${s.color}` : '1px solid #cbd5e1',
                      background: activeStatusFilter === s.id ? s.bg : '#ffffff',
                      color: s.color,
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{s.label}</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '99px',
                        background: activeStatusFilter === s.id ? s.color : '#f1f5f9',
                        color: activeStatusFilter === s.id ? '#ffffff' : '#475569',
                        fontSize: '10.5px'
                      }}
                    >
                      {s.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* أدوات البحث وتصفية الطيارين */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* تصفية بالطيار */}
                <select
                  value={selectedPilotFilter}
                  onChange={(e) => setSelectedPilotFilter(e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    outline: 'none'
                  }}
                >
                  <option value="all">كل الطيارين ({pilots.length})</option>
                  {pilots.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {/* حقل البحث الفوري */}
                <div style={{ position: 'relative', width: '240px' }}>
                  <Search size={14} color="#94a3b8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="بحث برقم الطلب، العميل، الهاتف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 32px 7px 10px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: '12px',
                      outline: 'none',
                      color: '#0f172a',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* قائمة كروت الطلبات المتطورة */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                  <Bike size={52} color="#cbd5e1" style={{ marginBottom: '12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#334155' }}>
                    لا توجد فواتير دليفري مسجلة بهذه الفئة
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '6px' }}>
                    يمكنك إنشاء طلب توصيل فوري من شاشة البيع باختيار نوع الفاتورة دليفري [Ctrl+4]
                  </div>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const delivery = order.deliveryDetails || {};
                  const status = order.deliveryStatus || 'pending';
                  const pilotName = delivery.pilotName || 'غير مسند';
                  const pilotPhone = delivery.pilotPhone || '';
                  const total = parseFloat(order.totalAmount || 0);
                  const fee = parseFloat(delivery.deliveryFee || 0);
                  const grandTotal = total + fee;

                  const statusConfig = {
                    pending: { label: 'قيد التجهيز ⏳', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
                    on_way: { label: 'مع الطيار 🛵', color: '#7c3aed', bg: '#ede9fe', border: '#ddd6fe' },
                    delivered: { label: 'تم التسليم والتحصيل ✅', color: '#059669', bg: '#dcfce7', border: '#bbf7d0' },
                    returned: { label: 'مرتجع ❌', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' }
                  }[status] || { label: 'قيد التجهيز', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' };

                  return (
                    <div
                      key={order.id || order.invoiceNumber}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* السطر العلوي: رقم الفاتورة والوقت والحالة والإجمالي */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 900, color: '#7c3aed' }}>
                            #{order.invoiceNumber}
                          </span>
                          <span
                            style={{
                              padding: '2px 10px',
                              borderRadius: '99px',
                              background: statusConfig.bg,
                              color: statusConfig.color,
                              border: `1px solid ${statusConfig.border}`,
                              fontSize: '11px',
                              fontWeight: 800
                            }}
                          >
                            {statusConfig.label}
                          </span>
                          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                            <Clock size={12} style={{ display: 'inline', marginLeft: '3px' }} />
                            {new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div style={{ textAlign: 'left', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>المطلوب تحصيله:</span>
                          <span style={{ fontSize: '18px', fontWeight: 900, color: '#059669' }}>
                            {grandTotal.toFixed(2)} ج.م
                          </span>
                          {fee > 0 && (
                            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 700 }}>
                              (توصيل +{fee} ج.م)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* السطر الأوسط: بيانات العميل والعنوان والطيار والأصناف */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '14px', alignItems: 'center' }}>
                        {/* بيانات العميل */}
                        <div>
                          <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <User size={14} color="#7c3aed" />
                            <span>{order.customerName || 'عميل نقدي'}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={12} color="#059669" />
                            <span style={{ direction: 'ltr' }}>{order.customerPhone || 'بدون هاتف'}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MapPin size={12} color="#ef4444" />
                            <span>{delivery.address || order.customerAddress || 'العنوان مسجل هاتفياً'}</span>
                          </div>
                          {delivery.notes && (
                            <div style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', marginTop: '4px' }}>
                              📝 {delivery.notes}
                            </div>
                          )}
                        </div>

                        {/* الطيار المسند ومحدد الإسناد السريع */}
                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 700 }}>
                            🛵 الطيار المسند للأوردر:
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <select
                              value={pilotName}
                              onChange={(e) => {
                                const selected = pilots.find((p) => p.name === e.target.value);
                                if (selected) handleAssignPilot(order, selected);
                              }}
                              style={{
                                flex: 1,
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 800,
                                color: pilotName !== 'غير مسند' ? '#0f172a' : '#ef4444',
                                outline: 'none'
                              }}
                            >
                              <option value="غير مسند">-- اختر طيار لتسليمه الأوردر --</option>
                              {pilots.map((p) => (
                                <option key={p.id} value={p.name}>
                                  {p.name} ({p.phone || 'بدون هاتف'})
                                </option>
                              ))}
                            </select>
                          </div>
                          {pilotPhone && (
                            <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '4px', direction: 'ltr', textAlign: 'right' }}>
                              📞 {pilotPhone}
                            </div>
                          )}
                        </div>

                        {/* ملخص الأصناف */}
                        <div style={{ textAlign: 'left', background: '#fafafa', padding: '8px 12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700 }}>
                            الأصناف: {(order.items || []).length} صنف
                          </div>
                          <div style={{ fontSize: '11px', color: '#334155', marginTop: '4px', maxHeight: '42px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {(order.items || []).map((it) => `${it.tradeNameAr || it.name} (${it.qty})`).join(' ، ')}
                          </div>
                        </div>
                      </div>

                      {/* السطر السفلي: أزرار التحكم والطباعة والتواصل بالواتساب */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderTop: '1px solid #f1f5f9',
                          paddingTop: '10px',
                          flexWrap: 'wrap',
                          gap: '8px'
                        }}
                      >
                        {/* أزرار تغيير الحالة اللحظية */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(order, 'on_way')}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '8px',
                                background: '#7c3aed',
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
                              <Bike size={13} />
                              خروج مع الطيار 🛵
                            </button>
                          )}

                          {status === 'on_way' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(order, 'delivered')}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '8px',
                                background: '#059669',
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
                              <CheckCircle2 size={13} />
                              تأكيد التسليم والتحصيل ✅
                            </button>
                          )}

                          {status !== 'returned' && status !== 'delivered' && (
                            <button
                              type="button"
                              onClick={() => {
                                const reason = prompt('يرجى كتابة سبب إرجاع أوردر الدليفري:');
                                if (reason !== null) {
                                  updateDeliveryOrderStatus(order.id || order.invoiceNumber, 'returned', { returnReason: reason });
                                  setRefreshTrigger((prev) => prev + 1);
                                }
                              }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '8px',
                                background: '#fee2e2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              تسجيل كمرتجع ❌
                            </button>
                          )}

                          {status === 'delivered' && (
                            <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={13} />
                              تم التحصيل والتسليم
                            </span>
                          )}
                        </div>

                        {/* أدوات الإرسال والطباعة */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* واتساب للطيار */}
                          <button
                            type="button"
                            onClick={() => {
                              const targetPhone = pilotPhone || prompt('أدخل رقم واتساب الطيار:');
                              if (targetPhone) {
                                const msg = generatePilotWhatsAppMessage(order, currentBranch?.name || 'صيدلية فارماكور');
                                openWhatsAppChat(targetPhone, msg);
                              }
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              background: '#f0fdf4',
                              color: '#16a34a',
                              border: '1px solid #bbf7d0',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="إرسال بيانات الأوردر والعنوان للطيار على واتساب"
                          >
                            <Send size={12} />
                            واتساب الطيار
                          </button>

                          {/* واتساب للعميل */}
                          {order.customerPhone && (
                            <button
                              type="button"
                              onClick={() => {
                                const msg = generateCustomerWhatsAppMessage(order, pilotName, currentBranch?.name || 'صيدلية فارماكور');
                                openWhatsAppChat(order.customerPhone, msg);
                              }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '8px',
                                background: '#f5f3ff',
                                color: '#7c3aed',
                                border: '1px solid #ddd6fe',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="إشعار العميل بخروج الأوردر عبر واتساب"
                            >
                              <MessageSquare size={12} />
                              واتساب العميل
                            </button>
                          )}

                          {/* طباعة بوليصة التوصيل 80mm */}
                          <button
                            type="button"
                            onClick={() => {
                              printDeliveryWaybill(order, {
                                name: currentBranch?.name || 'مجموعة صيدليات فارماكور',
                                phone: currentBranch?.phone || '03-5555555'
                              });
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '8px',
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #cbd5e1',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="طباعة إيصال بوليصة شحن واستلام للطيار"
                          >
                            <Printer size={12} />
                            طباعة بوليصة
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── 3. محتوى تبويب تسوية عهدة ونقدية الطيارين (Settlement) ── */}
        {activeTab === 'settlement' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
            <div style={{ marginBottom: '16px', background: '#ffffff', padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                تسوية عهدة ونقدية الطيارين (Daily Delivery Pilots Cash Settlement)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                مراجعة الأوردرات المسلمة لكل طيار، احتساب عمولات التوصيل المستحقة، وتوريد صافي النقدية مباشرة لدرج الكاشير بالوردية الحالية.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {pilotsSummary.map((summary) => {
                if (summary.pilot.id === 'unassigned' && summary.totalOrders === 0) return null;

                const netToDrawer = summary.totalCashCollected - summary.totalCommissionEarned;

                return (
                  <div
                    key={summary.pilot.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '16px',
                      padding: '18px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: '#ede9fe',
                              color: '#7c3aed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 900
                            }}
                          >
                            <Bike size={20} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: '14.5px', color: '#0f172a' }}>
                              {summary.pilot.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                              {summary.pilot.phone || 'بدون هاتف'}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '99px',
                            background: '#f1f5f9',
                            color: '#334155',
                            fontSize: '11px',
                            fontWeight: 800
                          }}
                        >
                          {summary.totalOrders} أوردر
                        </span>
                      </div>

                      {/* إحصائيات الأوردرات */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px', textAlign: 'center' }}>
                        <div style={{ background: '#f8fafc', padding: '8px 4px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: '10.5px', color: '#64748b' }}>في الطريق</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
                            {summary.onWayOrders}
                          </div>
                        </div>

                        <div style={{ background: '#f0fdf4', padding: '8px 4px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                          <div style={{ fontSize: '10.5px', color: '#16a34a' }}>تم التسليم</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                            {summary.deliveredOrders}
                          </div>
                        </div>

                        <div style={{ background: '#fef2f2', padding: '8px 4px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                          <div style={{ fontSize: '10.5px', color: '#dc2626' }}>مرتجع</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
                            {summary.returnedOrders}
                          </div>
                        </div>
                      </div>

                      {/* الصندوق المالي للعهدة */}
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: '#64748b' }}>إجمالي المحصل في يد الطيار:</span>
                          <span style={{ fontWeight: 800, color: '#0f172a' }}>{summary.totalCashCollected.toFixed(2)} ج.م</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: '#64748b' }}>عمولات الطيار المستحقة:</span>
                          <span style={{ fontWeight: 800, color: '#d97706' }}>- {summary.totalCommissionEarned.toFixed(2)} ج.م</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px dashed #cbd5e1', paddingTop: '6px', marginTop: '2px' }}>
                          <span style={{ fontWeight: 800, color: '#059669' }}>صافي التوريد لدرج الكاشير:</span>
                          <span style={{ fontWeight: 900, color: '#059669', fontSize: '15px' }}>
                            {netToDrawer.toFixed(2)} ج.م
                          </span>
                        </div>
                      </div>
                    </div>

                    {summary.pilot.id !== 'unassigned' && (
                      <button
                        type="button"
                        onClick={() => handleSettlePilot(summary)}
                        disabled={summary.totalCashCollected <= 0}
                        style={{
                          marginTop: '16px',
                          padding: '10px',
                          borderRadius: '10px',
                          background: summary.totalCashCollected > 0 ? '#059669' : '#e2e8f0',
                          color: summary.totalCashCollected > 0 ? '#ffffff' : '#94a3b8',
                          border: 'none',
                          fontWeight: 800,
                          fontSize: '12.5px',
                          cursor: summary.totalCashCollected > 0 ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Wallet size={15} />
                        تقفيل وتوريد العهدة للدرج
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 4. محتوى تبويب إدارة الطيارين (Fleet Management) ── */}
        {activeTab === 'pilots' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                  قائمة طياري ومندوبي توصيل الفرع
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  إضافة وإدارة بيانات الطيارين ونسبة العمولة المقررة عن كل أوردر
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddingPilot(!isAddingPilot)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Plus size={15} />
                إضافة طيار جديد
              </button>
            </div>

            {/* فورم إضافة طيار جديد */}
            {isAddingPilot && (
              <form
                onSubmit={handleAddPilot}
                style={{
                  background: '#ffffff',
                  padding: '18px 20px',
                  borderRadius: '14px',
                  border: '1.5px solid #c4b5fd',
                  marginBottom: '20px',
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.08)',
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1.5fr 1fr auto',
                  gap: '12px',
                  alignItems: 'end'
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                    اسم الطيار / الكابتن:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: كابتن أحمد حسن"
                    value={newPilotName}
                    onChange={(e) => setNewPilotName(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                    رقم هاتف الواتساب:
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="010xxxxxxxx"
                    value={newPilotPhone}
                    onChange={(e) => setNewPilotPhone(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', outline: 'none', direction: 'ltr', textAlign: 'right', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                    عمولة التوصيل (ج.م):
                  </label>
                  <input
                    type="number"
                    value={newPilotFee}
                    onChange={(e) => setNewPilotFee(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="submit"
                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#059669', color: '#fff', border: 'none', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    حفظ
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingPilot(false)}
                    style={{ padding: '8px 12px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}

            {/* جدول الطيارين */}
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 800 }}>
                    <th style={{ padding: '12px 18px' }}>الكابتن</th>
                    <th style={{ padding: '12px 18px' }}>رقم الهاتف / الواتساب</th>
                    <th style={{ padding: '12px 18px' }}>وسيلة الانتقال</th>
                    <th style={{ padding: '12px 18px' }}>عمولة الأوردر</th>
                    <th style={{ padding: '12px 18px' }}>الحالة</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left' }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {pilots.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 18px', fontWeight: 800, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Bike size={16} color="#7c3aed" />
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px', direction: 'ltr', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                        {p.phone || 'بدون هاتف'}
                      </td>
                      <td style={{ padding: '12px 18px', color: '#64748b' }}>
                        {p.vehicle || 'موتوسيكل'}
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: 800, color: '#d97706' }}>
                        {p.commissionPerOrder || 10} ج.م
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '99px', background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 800 }}>
                          متاح للتوصيل ✅
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'left' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف الطيار ${p.name}؟`)) {
                              const updated = pilots.filter((x) => x.id !== p.id);
                              setPilots(updated);
                              saveDeliveryPilots(updated);
                            }
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 5. شريط الذيل الأنيق ── */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={15} color="#059669" />
            <span>نظام التوصيل الصيدلاني المتكامل • مربوط محاسبياً بوردية الكاشير ودرج النقدية</span>
          </div>

          <button
            type="button"
            onClick={() => setIsDeliveryModalOpen(false)}
            style={{
              padding: '6px 18px',
              borderRadius: '8px',
              background: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
              fontSize: '12px',
              fontWeight: 800,
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
