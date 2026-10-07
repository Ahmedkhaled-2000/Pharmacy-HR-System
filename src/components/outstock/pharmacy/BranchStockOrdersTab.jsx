import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Pill,
  Sparkles,
  Calendar,
  ShieldCheck,
  Send,
  HelpCircle,
  Filter
} from 'lucide-react';
import { outstockGetOrders } from '../../../utils/outstockApiClient';
import NewBranchStockOrderModal from './NewBranchStockOrderModal';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';

/**
 * BranchStockOrdersTab.jsx
 * شاشة طلبات الفرع (نواقص مخزن الفرع الخاص)
 * - عرض وتتبع طلبات بضاعة الفرع المرسلة للمشتريات
 * - فلتر افتراضي: "بانتظار رد المشتريات"
 * - فلاتر أخرى: تم إرسالها، تم توفيرها، غير متوفرة، الكل
 * - إشعار وتحديث لحظي عند رد المشتريات
 */
export default function BranchStockOrdersTab({
  branchId,
  branch,
  currentPharmacist = '',
  showToast
}) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending_procurement'); // default: بانتظار رد المشتريات
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isReceiverAuthOpen, setIsReceiverAuthOpen] = useState(false);
  const [authenticatedReceiver, setAuthenticatedReceiver] = useState(null);

  const fetchBranchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOrders({
        branchId,
        orderType: 'branch',
        status: 'all'
      });
      if (res?.success && Array.isArray(res.orders)) {
        setOrders(res.orders);
      }
    } catch (err) {
      console.error('Fetch branch stock orders error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranchOrders();
  }, [branchId]);

  // استماع المزامنة اللحظية والردود على طلبات الفرع
  useEffect(() => {
    const handleSyncEvent = (e) => {
      const data = e?.detail || e;
      if (!data?.branchId || String(data.branchId) === String(branchId)) {
        fetchBranchOrders();
        if (e.type === 'outstock:branch_order_replied') {
          if (showToast) {
            showToast('🔔 رد جديد من قسم المشتريات على طلب بضاعة الفرع!', 'info');
          }
        }
      }
    };

    window.addEventListener('outstock:order_created', handleSyncEvent);
    window.addEventListener('outstock:branch_order_replied', handleSyncEvent);
    window.addEventListener('outstock:item_status_updated', handleSyncEvent);
    window.addEventListener('outstock:items_status_updated', handleSyncEvent);

    return () => {
      window.removeEventListener('outstock:order_created', handleSyncEvent);
      window.removeEventListener('outstock:branch_order_replied', handleSyncEvent);
      window.removeEventListener('outstock:item_status_updated', handleSyncEvent);
      window.removeEventListener('outstock:items_status_updated', handleSyncEvent);
    };
  }, [branchId, showToast]);

  const handleStartNewOrder = () => {
    setIsReceiverAuthOpen(true);
  };

  const handleReceiverAuthSuccess = (emp) => {
    setAuthenticatedReceiver(emp);
    setIsReceiverAuthOpen(false);
    setIsNewOrderModalOpen(true);
  };

  // تصفية الطلبات بناءً على الفلتر والبحث
  const getItemStatus = (it) => {
    const s = it?.itemStatus || it?.status;
    if (s === 'available' || s === 'available_by_procurement') return 'available';
    if (s === 'unavailable') return 'unavailable';
    return 'pending';
  };

  // تصفية الطلبات بناءً على الفلتر والبحث
  const filteredOrders = useMemo(() => {
    let result = orders;

    // 1. فلتر الحالة
    if (statusFilter === 'pending_procurement') {
      result = result.filter((o) => {
        const items = o.items || [];
        return items.some((it) => getItemStatus(it) === 'pending');
      });
    } else if (statusFilter === 'sent') {
      result = result.filter((o) => o.sent_to_procurement_at || o.sentToProcurementAt || o.created_at || o.createdAt);
    } else if (statusFilter === 'available') {
      result = result.filter((o) => {
        const items = o.items || [];
        return items.some((it) => getItemStatus(it) === 'available');
      });
    } else if (statusFilter === 'unavailable') {
      result = result.filter((o) => {
        const items = o.items || [];
        return items.some((it) => getItemStatus(it) === 'unavailable');
      });
    }

    // 2. البحث النصي
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((o) => {
        const matchId = String(o.id || '').includes(q);
        const matchCode = String(o.barcode || o.barcode_data || '').toLowerCase().includes(q);
        const matchReason = String(o.branch_request_reason || '').toLowerCase().includes(q);
        const matchPharmacist = String(o.order_receiver_name || o.orderReceiverName || '').toLowerCase().includes(q);
        const matchItem = (o.items || []).some((it) =>
          String(it.medicationName || it.medication_name || '').toLowerCase().includes(q)
        );
        return matchId || matchCode || matchReason || matchPharmacist || matchItem;
      });
    }

    return result;
  }, [orders, statusFilter, searchQuery]);

  // إحصائيات سريعة للبطاقات العلوية
  const stats = useMemo(() => {
    let pendingCount = 0;
    let availableCount = 0;
    let unavailableCount = 0;

    orders.forEach((o) => {
      const items = o.items || [];
      if (items.some((it) => getItemStatus(it) === 'pending')) pendingCount++;
      if (items.some((it) => getItemStatus(it) === 'available')) availableCount++;
      if (items.some((it) => getItemStatus(it) === 'unavailable')) unavailableCount++;
    });

    return {
      total: orders.length,
      pending: pendingCount,
      available: availableCount,
      unavailable: unavailableCount
    };
  }, [orders]);

  const formatDateTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('ar-EG', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return isoString;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
      {/* الشريط العلوي مع الإحصائيات وزر الإضافة */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '16px 20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
            }}
          >
            <Building2 size={24} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>
              طلبات بضاعة ونواقص الفرع
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              تتبع نواقص مخزون الصيدلية الداخلي وردود المشتريات اللحظية
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={fetchBranchOrders}
            className="outstock-btn outstock-btn-secondary"
            title="تحديث البيانات"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={handleStartNewOrder}
            className="outstock-btn outstock-btn-primary"
            style={{
              padding: '9px 20px',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
            }}
          >
            <Plus size={18} />
            <span>طلب بضاعة جديد للفرع 📦</span>
          </button>
        </div>
      </div>

      {/* أزرار الفلاتر (الفلتر الافتراضي: بانتظار رد المشتريات) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#ffffff',
          borderRadius: '14px',
          padding: '12px 18px',
          border: '1px solid #e2e8f0'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px', color: '#475569', fontSize: '13px', fontWeight: '800' }}>
            <Filter size={15} />
            <span>الحالة:</span>
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter('pending_procurement')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              border: statusFilter === 'pending_procurement' ? '2px solid #d97706' : '1px solid #cbd5e1',
              background: statusFilter === 'pending_procurement' ? '#fef3c7' : '#ffffff',
              color: statusFilter === 'pending_procurement' ? '#92400e' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={14} color={statusFilter === 'pending_procurement' ? '#d97706' : '#64748b'} />
            <span>بانتظار رد المشتريات</span>
            <span style={{ background: '#f59e0b', color: '#ffffff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px' }}>
              {stats.pending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('sent')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              border: statusFilter === 'sent' ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: statusFilter === 'sent' ? '#eff6ff' : '#ffffff',
              color: statusFilter === 'sent' ? '#1d4ed8' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Send size={14} color={statusFilter === 'sent' ? '#2563eb' : '#64748b'} />
            <span>طلبات تم إرسالها</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('available')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              border: statusFilter === 'available' ? '2px solid #16a34a' : '1px solid #cbd5e1',
              background: statusFilter === 'available' ? '#f0fdf4' : '#ffffff',
              color: statusFilter === 'available' ? '#15803d' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <CheckCircle size={14} color={statusFilter === 'available' ? '#16a34a' : '#64748b'} />
            <span>تم توفيرها بالمشتريات</span>
            <span style={{ background: '#16a34a', color: '#ffffff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px' }}>
              {stats.available}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('unavailable')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              border: statusFilter === 'unavailable' ? '2px solid #dc2626' : '1px solid #cbd5e1',
              background: statusFilter === 'unavailable' ? '#fef2f2' : '#ffffff',
              color: statusFilter === 'unavailable' ? '#991b1b' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <XCircle size={14} color={statusFilter === 'unavailable' ? '#dc2626' : '#64748b'} />
            <span>غير متوفرة</span>
            <span style={{ background: '#dc2626', color: '#ffffff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px' }}>
              {stats.unavailable}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              border: statusFilter === 'all' ? '2px solid #475569' : '1px solid #cbd5e1',
              background: statusFilter === 'all' ? '#f1f5f9' : '#ffffff',
              color: statusFilter === 'all' ? '#1e293b' : '#64748b'
            }}
          >
            كافة طلبات الفرع ({stats.total})
          </button>
        </div>

        {/* حقل البحث */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search
            size={16}
            color="#94a3b8"
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="بحث بالصنف أو رقم الطلب أو الصيدلي..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="outstock-form-input"
            style={{ paddingRight: '36px', height: '38px', fontSize: '12.5px' }}
          />
        </div>
      </div>

      {/* قائمة الطلبات */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center', background: '#ffffff', borderRadius: '16px' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#0284c7' }} />
          <p style={{ color: '#64748b', fontSize: '14px', fontWeight: '700' }}>جارٍ تحميل طلبات الفرع...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1.5px dashed #cbd5e1'
          }}
        >
          <Building2 size={48} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '800', color: '#334155' }}>
            لا توجد طلبات فرع تطابق هذا الفلتر
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            {statusFilter === 'pending_procurement'
              ? 'رائع! لا توجد طلبات معلقة بانتظار رد المشتريات حالياً'
              : 'يمكنك إنشاء طلب بضاعة جديد للفرع بالضغط على زر "طلب بضاعة جديد للفرع"'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredOrders.map((order) => {
            const items = order.items || [];
            const hasPending = items.some((it) => !it.status || it.status === 'pending');
            const hasAvailable = items.some((it) => it.status === 'available');
            const hasUnavailable = items.some((it) => it.status === 'unavailable');

            return (
              <div
                key={order.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px 20px',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* رأس الطلب */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '12px',
                    marginBottom: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: '#0284c7',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '900',
                        padding: '3px 10px',
                        borderRadius: '8px',
                        fontFamily: 'monospace'
                      }}
                    >
                      طلب فرع #{order.id}
                    </span>

                    {order.branch_request_reason && (
                      <span
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          fontSize: '12px',
                          fontWeight: '800',
                          padding: '3px 10px',
                          borderRadius: '8px'
                        }}
                      >
                        📌 {order.branch_request_reason}
                      </span>
                    )}

                    {hasPending && (
                      <span
                        style={{
                          background: '#fef3c7',
                          color: '#92400e',
                          fontSize: '11.5px',
                          fontWeight: '800',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Clock size={12} />
                        بانتظار رد المشتريات
                      </span>
                    )}

                    {hasAvailable && (
                      <span
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          fontSize: '11.5px',
                          fontWeight: '800',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <CheckCircle size={12} />
                        تم التوفير بالمشتريات
                      </span>
                    )}

                    {hasUnavailable && (
                      <span
                        style={{
                          background: '#fee2e2',
                          color: '#991b1b',
                          fontSize: '11.5px',
                          fontWeight: '800',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <XCircle size={12} />
                        صنف غير متوفر
                      </span>
                    )}
                  </div>

                  {/* مواعيد الإرسال والرد */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#64748b' }}>
                    <span title="وقت إرسال الطلب للمشتريات">
                      <Send size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                      أُرسل: {formatDateTime(order.sent_to_procurement_at || order.created_at)}
                    </span>

                    {order.procurement_replied_at && (
                      <span style={{ color: '#0369a1', fontWeight: '700' }} title="تاريخ ووقت رد المشتريات">
                        <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                        رد المشتريات: {formatDateTime(order.procurement_replied_at)}
                        {order.procurement_replied_by && ` (${order.procurement_replied_by})`}
                      </span>
                    )}

                    {(order.order_receiver_name || order.orderReceiverName) && (
                      <span style={{ color: '#334155', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                        مرسل الطلب: <strong>{order.order_receiver_name || order.orderReceiverName}</strong>
                        {(order.order_receiver_code || order.orderReceiverCode) && (
                          <span style={{ color: '#64748b', marginRight: '4px' }}>(كود: {order.order_receiver_code || order.orderReceiverCode} 🔒)</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* أصناف الطلب */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map((it, idx) => {
                    const itStatus = getItemStatus(it);
                    const isCosmetics = (it.itemType || it.item_type) === 'cosmetics';
                    const medName = it.medicationName || it.medication_name || 'صنف غير محدد';

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#f8fafc',
                          borderRadius: '10px',
                          padding: '8px 14px',
                          border: '1px solid #edf2f7'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              background: isCosmetics ? '#fce7f3' : '#e0f2fe',
                              color: isCosmetics ? '#be185d' : '#0369a1',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '800'
                            }}
                          >
                            {isCosmetics ? '💄 مستحضر' : '💊 دواء'}
                          </span>

                          <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                            {medName}
                          </strong>

                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            (الكمية: <strong>{it.quantity} علبة</strong>)
                          </span>

                          {it.notes && (
                            <span style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic' }}>
                              - {it.notes}
                            </span>
                          )}
                        </div>

                        {/* حالة الصنف بالمشتريات وملاحظاتها وتوقيت الرد */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {(it.procurementRepliedAt || it.procurement_replied_at) && (
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              رد: {formatDateTime(it.procurementRepliedAt || it.procurement_replied_at)}
                            </span>
                          )}

                          {itStatus === 'available' ? (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                padding: '3px 10px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <CheckCircle size={13} />
                              <span>متوفر {(it.procurementSourceName || it.procurement_source_name) ? `(${it.procurementSourceName || it.procurement_source_name})` : ''}</span>
                            </span>
                          ) : itStatus === 'unavailable' ? (
                            <span
                              style={{
                                background: '#fee2e2',
                                color: '#991b1b',
                                padding: '3px 10px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <XCircle size={13} />
                              <span>غير متوفر {it.procurement_notes ? `(${it.procurement_notes})` : ''}</span>
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                padding: '3px 10px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Clock size={13} />
                              <span>بانتظار رد المشتريات</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 🔒 نافذة التحقق من كود الموظف مرسل الطلب */}
      {isReceiverAuthOpen && (
        <EmployeeCodeAuthModal
          isOpen={isReceiverAuthOpen}
          title="التحقق من كود الموظف مرسل الطلب 🔒"
          subtitle="يرجى إدخال كود الموظف المسجل بنظام الموارد البشرية لتوثيق إرسال طلب بضاعة للفرع"
          actionLabel="تأكيد الكود والمتابعة"
          branchId={branchId}
          onClose={() => setIsReceiverAuthOpen(false)}
          onSuccess={handleReceiverAuthSuccess}
        />
      )}

      {/* نافذة تسجيل طلب بضاعة جديد للفرع */}
      {isNewOrderModalOpen && (
        <NewBranchStockOrderModal
          branchId={branchId}
          branchName={branch?.name || ''}
          orderReceiver={authenticatedReceiver}
          onClose={() => {
            setIsNewOrderModalOpen(false);
            setAuthenticatedReceiver(null);
          }}
          onOrderCreated={(newOrder) => {
            fetchBranchOrders();
            if (showToast) {
              showToast('✅ تم إرسال طلب بضاعة الفرع إلى إدارة المشتريات بنجاح', 'success');
            }
          }}
        />
      )}
    </div>
  );
}
