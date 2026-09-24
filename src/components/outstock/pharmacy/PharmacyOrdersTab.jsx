import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Printer, CheckCircle, MessageSquare, AlertCircle, Clock, Check, Barcode, Phone, Calendar, RefreshCw } from 'lucide-react';
import { outstockGetOrders, outstockDeliverOrder, outstockMarkWhatsappNotified } from '../../../utils/outstockApiClient';
import NewCustomerOrderModal from './NewCustomerOrderModal';
import DualCashierReceiptModal from './DualCashierReceiptModal';
import OutstockConfirmModal from '../common/OutstockConfirmModal';

/**
 * PharmacyOrdersTab.jsx
 * شاشة طلبات العملاء بالصيدلية
 * - إنشاء طلبات جديدة، بحث بالباركود/الهاتف/الاسم
 * - فلترة الطلبات المعلقة النشطة والتسليم بضغطة زر
 * - طباعة فاتورة الكاشير المزدوجة ومراسلة الواتساب
 */
export default function PharmacyOrdersTab({ branchId, branch, currentPharmacist = '', showToast }) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [printingOrder, setPrintingOrder] = useState(null);

  // جلب الطلبات النشطة
  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOrders({ branchId, status: 'active' });
      if (res?.success && Array.isArray(res.orders)) {
        setOrders(res.orders);
      }
    } catch (e) {
      console.warn('Fetch branch orders error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (branchId) fetchOrders();
  }, [branchId]);

  // الاستماع المباشر لتحديثات المزامنة اللحظية والأوفلاين
  useEffect(() => {
    const handleSyncEvent = (e) => {
      const data = e?.detail || e;
      if (!data?.branchId || data.branchId === branchId) {
        fetchOrders();
      }
    };

    window.addEventListener('outstock:order_created', handleSyncEvent);
    window.addEventListener('outstock:item_status_updated', handleSyncEvent);
    window.addEventListener('outstock:items_status_updated', handleSyncEvent);
    window.addEventListener('outstock:order_synced', handleSyncEvent);
    window.addEventListener('outstock:order_delivered', handleSyncEvent);
    window.addEventListener('outstock:realtime_event', handleSyncEvent);

    return () => {
      window.removeEventListener('outstock:order_created', handleSyncEvent);
      window.removeEventListener('outstock:item_status_updated', handleSyncEvent);
      window.removeEventListener('outstock:items_status_updated', handleSyncEvent);
      window.removeEventListener('outstock:order_synced', handleSyncEvent);
      window.removeEventListener('outstock:order_delivered', handleSyncEvent);
      window.removeEventListener('outstock:realtime_event', handleSyncEvent);
    };
  }, [branchId]);

  // الاستماع لاختصارات لوحة المفاتيح التفاعلية (F2, F3, F8)
  useEffect(() => {
    const handleShortcutNewOrder = () => setIsNewOrderModalOpen(true);
    const handleShortcutSearch = () => {
      const el = document.querySelector('.outstock-search-input');
      if (el) {
        el.focus();
        el.select?.();
      }
    };
    const handleShortcutPrint = () => {
      if (orders.length > 0) {
        setPrintingOrder(orders[0]);
      }
    };

    window.addEventListener('outstock:shortcut_new_order', handleShortcutNewOrder);
    window.addEventListener('outstock:shortcut_focus_search', handleShortcutSearch);
    window.addEventListener('outstock:shortcut_quick_print', handleShortcutPrint);

    return () => {
      window.removeEventListener('outstock:shortcut_new_order', handleShortcutNewOrder);
      window.removeEventListener('outstock:shortcut_focus_search', handleShortcutSearch);
      window.removeEventListener('outstock:shortcut_quick_print', handleShortcutPrint);
    };
  }, [orders]);

  // حالة نافذة تأكيد تسليم الدواء
  const [deliveryConfirmOrder, setDeliveryConfirmOrder] = useState(null);
  const [isDelivering, setIsDelivering] = useState(false);

  // تسليم الطلب للعميل
  const handleDeliver = (orderOrId) => {
    const targetOrder = typeof orderOrId === 'object' ? orderOrId : orders.find(o => o.id === orderOrId);
    setDeliveryConfirmOrder(targetOrder || { id: orderOrId });
  };

  const executeDeliver = async () => {
    if (!deliveryConfirmOrder) return;
    const orderId = deliveryConfirmOrder.id;
    setIsDelivering(true);

    try {
      const res = await outstockDeliverOrder(orderId);
      if (res?.success) {
        showToast?.('✅ تم تسليم الطلب للعميل بنجاح وتحصيل المبلغ المتبقي');
        setOrders(prev => prev.filter(o => o.id !== orderId));
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر تسليم الطلب'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء التسليم');
    } finally {
      setIsDelivering(false);
      setDeliveryConfirmOrder(null);
    }
  };

  // إرسال واتساب للعميل
  const handleSendWhatsapp = async (order) => {
    const phone = order.customer_phone || order.customerPhone || '';
    if (!phone) {
      showToast?.('⚠️ لا يوجد رقم هاتف مسجل لهذا العميل');
      return;
    }

    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;

    const custName = order.customer_name || order.customerName || 'عميلنا العزيز';
    const bName = branch?.name || 'الصيدلية';
    const remaining = parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2);

    const msg = `السلام عليكم ورحمة الله وبركاته،\n\nأهلاً بك أ/ ${custName}\nنود إبلاغك بتوفر طلبك الدوائي (إيصال: ${order.order_number || order.orderNumber}) لدى ${bName}، وهو جاهز للاستلام الآن في أي وقت.\n\nالمتبقي عند الاستلام: ${remaining} ج.م\nنسعد دائماً بخدمتكم وتوفير كافة احتياجاتكم الطبية.`;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');

    // تسجيل في السيرفر
    outstockMarkWhatsappNotified(order.id).catch(() => {});
  };

  // فلترة الطلبات بالبحث (باركود / هاتف / اسم / كود طلب)
  const filteredOrders = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return orders;

    return orders.filter(o => {
      const num = String(o.order_number || o.orderNumber || '').toLowerCase();
      const barcode = String(o.barcode_data || o.barcodeData || '').toLowerCase();
      const name = String(o.customer_name || o.customerName || '').toLowerCase();
      const phone = String(o.customer_phone || o.customerPhone || '').toLowerCase();
      return num.includes(q) || barcode.includes(q) || name.includes(q) || phone.includes(q);
    });
  }, [orders, searchQuery]);

  return (
    <div>
      {/* ── شريط الأدوات العلوي والبحث بالباركود ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div className="outstock-filters-bar">
          <div className="outstock-search-bar" style={{ flex: 1, minWidth: '240px' }}>
            <Search size={18} className="outstock-search-icon" />
            <input
              type="text"
              placeholder="🔍 ابحث برقم العميل، الاسم، كود الطلب، أو امسح الباركود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-search-input"
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchOrders}
              title="تحديث البيانات"
            >
              <RefreshCw size={15} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              onClick={() => setIsNewOrderModalOpen(true)}
            >
              <Plus size={16} />
              <span>إنشاء طلب عميل جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── قائمة الطلبات المعلقة النشطة ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>📋 طلبات العملاء قيد المتابعة والتجهيز</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
              ({filteredOrders.length} طلب نشط)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري تحميل طلبات العملاء...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>🎉</div>
            <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
              لا توجد طلبات معلقة حالياً
            </h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              {searchQuery ? 'لم يتم العثور على طلبات تطابق مدخلات البحث' : 'تم تسليم كافة طلبات العملاء بنجاح، يمكنك إنشاء طلب جديد بالزر أعلاه'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredOrders.map(order => {
              const itemsList = order.items || [];
              const activeItems = itemsList.filter(i => !i.prunedFromBill && !i.pruned_from_bill);
              const prunedItems = itemsList.filter(i => i.prunedFromBill || i.pruned_from_bill);

              const allAvailable = activeItems.length > 0 && activeItems.every(i => i.itemStatus === 'available_by_procurement');
              const isPendingProcurement = activeItems.some(i => i.itemStatus === 'pending');

              return (
                <div
                  key={order.id}
                  className={`outstock-order-card ${allAvailable ? 'ready-state' : ''}`}
                >
                  {/* رأس بطاقة الطلب */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        background: '#f1f5f9',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: '900',
                        fontSize: '13px',
                        color: '#334155'
                      }}>
                        {order.order_number || order.orderNumber}
                      </span>

                      <span style={{ fontWeight: '900', fontSize: '15.5px', color: '#0f172a' }}>
                        {order.customer_name || order.customerName}
                      </span>

                      <span style={{ fontSize: '13px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={13} />
                        <span>{order.customer_phone || order.customerPhone}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {order.is_offline_pending || order.isOffline ? (
                        <span className="outstock-badge pending" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                          <Clock size={13} />
                          <span>محفوظ محلياً (أوفلاين) ⏳</span>
                        </span>
                      ) : allAvailable ? (
                        <span className="outstock-badge ready">
                          <CheckCircle size={13} />
                          <span>متوفر بالكامل - جاهز للتسليم 🟢</span>
                        </span>
                      ) : isPendingProcurement ? (
                        <span className="outstock-badge pending">
                          <Clock size={13} />
                          <span>قيد انتظار المشتريات 🟡</span>
                        </span>
                      ) : (
                        <span className="outstock-badge partial">
                          <span>متوفر جزئياً 🔵</span>
                        </span>
                      )}

                      <span style={{
                        background: '#f8fafc',
                        border: '1px dashed #cbd5e1',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: '#64748b'
                      }}>
                        <Barcode size={12} style={{ display: 'inline' }} /> {order.barcode_data || order.barcodeData}
                      </span>
                    </div>
                  </div>

                  {/* جدول بنود الأدوية */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', marginBottom: '6px' }}>
                      الأدوية المطلوبة:
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {activeItems.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: '#ffffff',
                            border: '1px solid',
                            borderColor: item.itemStatus === 'available_by_procurement' ? '#86efac' : '#cbd5e1',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12.5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <strong>{item.medicationName || item.medication_name}</strong>
                          <span style={{ color: '#64748b' }}>
                            ({item.quantity} {item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'})
                          </span>
                          {item.itemStatus === 'available_by_procurement' ? (
                            <span style={{ color: '#16a34a', fontWeight: '900', fontSize: '11px' }}>✓ متوفر</span>
                          ) : (
                            <span style={{ color: '#d97706', fontSize: '11px' }}>⏳ قيد الشراء</span>
                          )}
                        </div>
                      ))}

                      {/* الأصناف المشطوبة لعدم التوفر */}
                      {prunedItems.map((item, idx) => (
                        <div
                          key={`pruned_${idx}`}
                          style={{
                            background: '#fef2f2',
                            border: '1px dashed #fca5a5',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            color: '#dc2626',
                            textDecoration: 'line-through'
                          }}
                          title="تم شطبه لعدم التوفر بالسوق وتحويله لصفحة النواقص"
                        >
                          {item.medicationName || item.medication_name} (غير متوفر بالسوق)
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* تفاصيل المبالغ وموعد الاستلام وأزرار الإجراءات */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    borderTop: '1px solid var(--border-subtle, #f1f5f9)',
                    paddingTop: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                          الإجمالي: <strong>{parseFloat(order.total_amount || order.totalAmount || 0).toFixed(2)} ج.م</strong>
                        </div>
                        <div>
                          المدفوع: <strong style={{ color: '#059669' }}>{parseFloat(order.paid_amount || order.paidAmount || 0).toFixed(2)} ج.م</strong>
                        </div>
                        <div style={{ fontSize: '14px' }}>
                          المتبقي: <strong style={{ color: '#dc2626' }}>{parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2)} ج.م</strong>
                        </div>
                      </div>
                      {order.expected_pickup_date && (
                        <div style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                          <Calendar size={13} />
                          <span>الاستلام: {order.expected_pickup_date || order.expectedPickupDate}</span>
                        </div>
                      )}
                    </div>

                    {/* أزرار الإجراءات */}
                    <div className="outstock-order-actions-bar">
                      <button
                        type="button"
                        onClick={() => handleDeliver(order.id)}
                        className="outstock-btn outstock-btn-success"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        <Check size={16} />
                        <span>تسليم للعميل</span>
                      </button>

                      <div className="outstock-order-sub-actions">
                        <button
                          type="button"
                          onClick={() => handleSendWhatsapp(order)}
                          className="outstock-btn outstock-btn-whatsapp"
                          style={{ padding: '7px 12px', fontSize: '12.5px' }}
                          title="إرسال رسالة واتساب للعميل بإشعار التوفر"
                        >
                          <MessageSquare size={14} />
                          <span>إرسال واتساب</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPrintingOrder(order)}
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '7px 12px', fontSize: '12.5px' }}
                          title="طباعة إيصال الكاشير نسختين"
                        >
                          <Printer size={14} />
                          <span>طباعة الإيصال</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* نافذة تسجيل طلب جديد */}
      {isNewOrderModalOpen && (
        <NewCustomerOrderModal
          branchId={branchId}
          defaultPharmacist={currentPharmacist}
          onClose={() => setIsNewOrderModalOpen(false)}
          onOrderCreated={(newOrder) => {
            setIsNewOrderModalOpen(false);
            showToast?.('✅ تم تسجيل الطلب وإرساله لإدارة المشتريات بنجاح');
            fetchOrders();
            // فتح نافذة الطباعة التلقائية المباشرة
            setPrintingOrder(newOrder);
          }}
        />
      )}

      {/* نافذة طباعة إيصال الكاشير الحراري */}
      {printingOrder && (
        <DualCashierReceiptModal
          order={printingOrder}
          branch={branch}
          onClose={() => setPrintingOrder(null)}
        />
      )}

      {/* ── نافذة تأكيد تسليم الدواء للعميل وتحصيل المبلغ ── */}
      <OutstockConfirmModal
        isOpen={Boolean(deliveryConfirmOrder)}
        title="تأكيد تسليم الطلب وتحصيل المبلغ"
        message="هل حضر العميل واستلم كافة أصناف الأدوية المحجوزة وتم تحصيل المبلغ المتبقي بالدرج؟"
        iconType="success"
        confirmText="نعم، تم التسليم والتحصيل"
        cancelText="تراجع"
        confirmBtnStyle="success"
        badge={deliveryConfirmOrder ? `إيصال #${deliveryConfirmOrder.order_number || deliveryConfirmOrder.orderNumber}` : null}
        details={deliveryConfirmOrder ? [
          { label: 'العميل', value: deliveryConfirmOrder.customer_name || deliveryConfirmOrder.customerName },
          { label: 'الهاتف', value: deliveryConfirmOrder.customer_phone || deliveryConfirmOrder.customerPhone || '-' },
          { label: 'المبلغ المتبقي', value: `${parseFloat(deliveryConfirmOrder.remaining_amount || deliveryConfirmOrder.remainingAmount || 0).toFixed(2)} ج.م` }
        ] : null}
        isProcessing={isDelivering}
        onConfirm={executeDeliver}
        onClose={() => setDeliveryConfirmOrder(null)}
      />
    </div>
  );
}
