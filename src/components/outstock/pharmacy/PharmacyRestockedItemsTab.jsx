import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Search,
  Phone,
  MessageSquare,
  CheckCircle2,
  Clock,
  Package,
  User,
  MapPin,
  AlertCircle,
  Calendar,
  Check,
  Plus,
  ExternalLink,
  Filter
} from 'lucide-react';
import {
  outstockGetRestockedItems,
  outstockMarkRestockedContacted,
  outstockListenBroadcast,
  listenToOutstockLocalMessages
} from '../../../utils/outstockApiClient';
import { getSocket } from '../../../utils/socketClient';
import NewCustomerOrderModal from './NewCustomerOrderModal';

/**
 * PharmacyRestockedItemsTab.jsx
 * تبويبة "أصناف أُعيد توافرها" في صفحة الصيدلية (قائمة الطلبات)
 * 
 * - تستعرض الأصناف التي كانت ناقصة بالسوق وقامت المشتريات بإشعار توفرها
 * - تعرض بيانات العميل كاملة (الاسم، الهاتف، المنطقة، الملاحظات)
 * - تفاصيل الطلب الأصلي ورقم الطلب
 * - زر مراسلة واتساب مباشر مع نص رسالة جاهز ومهذب
 * - زر تسجيل تم التواصل مع العميل مع ملاحظات الصيدلي
 * - إمكانية إنشاء طلب جديد للعميل مباشرة
 */
export default function PharmacyRestockedItemsTab({
  branchId,
  branch,
  currentPharmacist = '',
  showToast
}) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'restocked_available' | 'contacted'

  // نافذة تأكيد تسجيل التواصل مع العميل
  const [contactingItem, setContactingItem] = useState(null);
  const [contactNotes, setContactNotes] = useState('');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  // نافذة إنشاء طلب جديد للعميل
  const [reorderCustomer, setReorderCustomer] = useState(null);

  // جلب الأصناف التي أعيد توفرها
  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetRestockedItems({
        branchId,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery.trim() || undefined
      });
      if (res?.success && Array.isArray(res.items)) {
        setItems(res.items);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.warn('Fetch restocked items error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, statusFilter, searchQuery]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // استماع للتحديثات اللحظية عبر السوكيت وقناة المزامنة المحلية
  useEffect(() => {
    const socket = getSocket();
    const handleLiveUpdate = () => {
      fetchItems();
    };

    if (socket) {
      socket.on('outstock:restocked_alert', handleLiveUpdate);
      socket.on('outstock:item_restocked', handleLiveUpdate);
      socket.on('outstock:restocked_contacted', handleLiveUpdate);
    }

    const unsubLocal = (typeof outstockListenBroadcast === 'function' ? outstockListenBroadcast : listenToOutstockLocalMessages)((data) => {
      const event = data?.type || data?.event;
      if (
        event === 'outstock:restocked_alert' ||
        event === 'outstock:item_restocked' ||
        event === 'outstock:restocked_contacted' ||
        String(event || '').startsWith('outstock:')
      ) {
        fetchItems();
      }
    });

    return () => {
      if (socket) {
        socket.off('outstock:restocked_alert', handleLiveUpdate);
        socket.off('outstock:item_restocked', handleLiveUpdate);
        socket.off('outstock:restocked_contacted', handleLiveUpdate);
      }
      unsubLocal?.();
    };
  }, [fetchItems]);

  // فلترة الأصناف محلياً
  const filteredItems = useMemo(() => {
    let result = items;
    if (statusFilter !== 'all') {
      result = result.filter((it) => it.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((it) => {
        const med = String(it.medication_name || '').toLowerCase();
        const custName = String(it.customer_name || '').toLowerCase();
        const custPhone = String(it.customer_phone || '').toLowerCase();
        const orderNum = String(it.order_number || '').toLowerCase();
        return (
          med.includes(q) ||
          custName.includes(q) ||
          custPhone.includes(q) ||
          orderNum.includes(q)
        );
      });
    }
    return result;
  }, [items, statusFilter, searchQuery]);

  // إحصائيات سريعة
  const stats = useMemo(() => {
    const pendingCount = items.filter((it) => it.status === 'restocked_available').length;
    const contactedCount = items.filter((it) => it.status === 'contacted').length;
    return {
      total: items.length,
      pending: pendingCount,
      contacted: contactedCount
    };
  }, [items]);

  // فتح محادثة واتساب مع العميل
  const handleOpenWhatsApp = (item) => {
    const rawPhone = String(item.customer_phone || '').replace(/\D/g, '');
    if (!rawPhone || rawPhone.length < 9) {
      showToast?.('⚠️ رقم هاتف العميل غير متوفر أو غير صالح');
      return;
    }
    let fullPhone = rawPhone;
    if (fullPhone.startsWith('0')) {
      fullPhone = '2' + fullPhone;
    } else if (!fullPhone.startsWith('20') && fullPhone.length === 10) {
      fullPhone = '20' + fullPhone;
    }

    const branchName = branch?.name || item.branch_name || 'صيدليتنا';
    const custName = item.customer_name ? `أستاذ/ة ${item.customer_name}` : 'عميلنا العزيز';
    const message = `السلام عليكم ورحمة الله وبركاته، ${custName}.\nنود إبلاغ سيادتكم بتوفر صنف: (${item.medication_name}) في ${branchName}.\nبناءً على طلبكم السابق رقم #${item.order_number || ''}.\nيسعدنا تواصلكم لتأكيد استلام الطلب أو حجزه لكم.\nشكراً لثقتكم الغالية.`;

    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // فتح نافذة تسجيل التواصل
  const handleOpenContactModal = (item) => {
    setContactingItem(item);
    setContactNotes(item.contact_notes || '');
  };

  // حفظ تسجيل التواصل
  const handleConfirmContact = async (e) => {
    e.preventDefault();
    if (!contactingItem) return;

    setIsSubmittingContact(true);
    try {
      const res = await outstockMarkRestockedContacted(contactingItem.id, {
        pharmacistName: currentPharmacist || 'الصيدلي',
        notes: contactNotes.trim()
      });

      if (res?.success) {
        showToast?.('✅ تم تسجيل التواصل مع العميل بنجاح');
        setItems((prev) =>
          prev.map((it) =>
            it.id === contactingItem.id
              ? {
                  ...it,
                  status: 'contacted',
                  contacted_by: currentPharmacist || 'الصيدلي',
                  contact_notes: contactNotes.trim(),
                  contacted_customer_at: new Date().toISOString()
                }
              : it
          )
        );
        setContactingItem(null);
      } else {
        showToast?.('❌ ' + (res?.error || 'تعذر تسجيل التواصل'));
      }
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء الحفظ');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
      {/* ── كارت الترويسة والإحصائيات ── */}
      <div className="outstock-card" style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1.5px solid #a7f3d0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#10b981',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <RefreshCw size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#065f46' }}>
                أصناف أُعيد توافرها بالصيدلية 🔄
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#047857' }}>
                الأصناف التي كانت ناقصة بالسوق وتم توفيرها من المشتريات — تواصل مع العملاء لحجزها وتسليمها
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={fetchItems}
              disabled={isLoading}
              className="outstock-btn outstock-btn-secondary"
              style={{ fontSize: '12.5px', padding: '7px 12px' }}
              title="تحديث القائمة الآن"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* بطاقات المؤشرات السريعة */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '16px' }}>
          <div
            onClick={() => setStatusFilter('all')}
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              padding: '10px 14px',
              border: statusFilter === 'all' ? '2px solid #059669' : '1px solid #d1fae5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '700' }}>إجمالي الأصناف المتوفرة</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>{stats.total}</div>
            </div>
            <Package size={22} color="#059669" />
          </div>

          <div
            onClick={() => setStatusFilter('restocked_available')}
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              padding: '10px 14px',
              border: statusFilter === 'restocked_available' ? '2px solid #ea580c' : '1px solid #fed7aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '11.5px', color: '#c2410c', fontWeight: '800' }}>بانتظار التواصل مع العميل ⏳</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#ea580c' }}>{stats.pending}</div>
            </div>
            <Clock size={22} color="#ea580c" />
          </div>

          <div
            onClick={() => setStatusFilter('contacted')}
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              padding: '10px 14px',
              border: statusFilter === 'contacted' ? '2px solid #16a34a' : '1px solid #bbf7d0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: '800' }}>تم التواصل والمتابعة ✅</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#16a34a' }}>{stats.contacted}</div>
            </div>
            <CheckCircle2 size={22} color="#16a34a" />
          </div>
        </div>
      </div>

      {/* ── شريط البحث والتصفية ── */}
      <div className="outstock-card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ position: 'relative', minWidth: '260px', flex: 1 }}>
              <Search
                size={16}
                color="#94a3b8"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="ابحث باسم الصنف، اسم العميل، رقم الهاتف، أو رقم الطلب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outstock-form-input"
                style={{ paddingRight: '36px', height: '38px', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: statusFilter === 'all' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                  background: statusFilter === 'all' ? '#f0fdfa' : '#ffffff',
                  color: statusFilter === 'all' ? '#0f766e' : '#64748b'
                }}
              >
                الكل ({stats.total})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('restocked_available')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: statusFilter === 'restocked_available' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                  background: statusFilter === 'restocked_available' ? '#fff7ed' : '#ffffff',
                  color: statusFilter === 'restocked_available' ? '#c2410c' : '#64748b'
                }}
              >
                بانتظار التواصل ({stats.pending})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('contacted')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: statusFilter === 'contacted' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: statusFilter === 'contacted' ? '#f0fdf4' : '#ffffff',
                  color: statusFilter === 'contacted' ? '#15803d' : '#64748b'
                }}
              >
                تم التواصل ({stats.contacted})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── قائمة الأصناف التي أعيد توافرها ── */}
      {isLoading ? (
        <div className="outstock-card" style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#10b981' }} />
          <div style={{ fontSize: '15px', fontWeight: '800' }}>جاري تحميل الأصناف التي أعيد توافرها...</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="outstock-card" style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '42px', marginBottom: '10px' }}>📦</div>
          <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
            لا توجد أصناف أُعيد توافرها مطابقة حالياً
          </h4>
          <p style={{ margin: 0, fontSize: '13px' }}>
            {searchQuery ? 'لم يتم العثور على نتائج تطابق البحث' : 'عندما تعلن المشتريات عن توفر أصناف كانت ناقصة ستظهر هنا فوراً'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredItems.map((item) => {
            const isContacted = item.status === 'contacted';
            const restockedDateStr = item.restocked_at
              ? new Date(item.restocked_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
              : 'مؤخراً';

            return (
              <div
                key={item.id}
                className="outstock-order-card"
                style={{
                  borderRight: isContacted ? '4px solid #16a34a' : '4px solid #f97316',
                  background: isContacted ? '#ffffff' : '#fcfdfd'
                }}
              >
                {/* رأس كارت الصنف */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: '#f1f5f9',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: '800',
                        fontSize: '13px',
                        color: '#334155'
                      }}
                    >
                      طلب: #{item.order_number || '—'}
                    </span>

                    <strong style={{ fontSize: '16px', color: '#0f172a' }}>
                      💊 {item.medication_name}
                    </strong>

                    <span
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}
                    >
                      الكمية المطلوبة: {item.requested_quantity || 1} علبة
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isContacted ? (
                      <span
                        className="outstock-badge"
                        style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontWeight: '800' }}
                      >
                        <CheckCircle2 size={13} />
                        <span>تم التواصل مع العميل ✅</span>
                      </span>
                    ) : (
                      <span
                        className="outstock-badge"
                        style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontWeight: '800' }}
                      >
                        <Clock size={13} />
                        <span>متوفر — بانتظار التواصل ⏳</span>
                      </span>
                    )}

                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      تاريخ التوفر: {restockedDateStr}
                    </span>
                  </div>
                </div>

                {/* تفاصيل العميل والطلب */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    margin: '12px 0',
                    background: '#f8fafc',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    fontSize: '12.5px'
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>
                      <User size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                      العميل المستفيد:
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '13.5px' }}>
                      {item.customer_name || 'عميل غير مسجل'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>
                      <Phone size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                      رقم الواتساب:
                    </span>
                    <strong style={{ color: '#0284c7', direction: 'ltr', display: 'inline-block' }}>
                      {item.customer_phone || '—'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>
                      <MapPin size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                      المنطقة والعنوان:
                    </span>
                    <span style={{ color: '#334155', fontWeight: '700' }}>
                      {item.customer_zone ? `${item.customer_zone} — ` : ''}
                      {item.customer_address || '—'}
                    </span>
                  </div>

                  {item.order_created_at && (
                    <div>
                      <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        <Calendar size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                        تاريخ الطلب الأصلي:
                      </span>
                      <span style={{ color: '#334155' }}>
                        {new Date(item.order_created_at).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                  )}
                </div>

                {/* ملاحظات مسجلة على العميل */}
                {item.customer_notes && (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: '#92400e',
                      marginBottom: '10px',
                      fontWeight: '700'
                    }}
                  >
                    ⚠️ ملاحظة مسجلة على العميل: {item.customer_notes}
                  </div>
                )}

                {/* ملاحظات التواصل إذا تم التواصل */}
                {isContacted && item.contact_notes && (
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: '#166534',
                      marginBottom: '10px'
                    }}
                  >
                    ✅ تم التواصل بواسطة ({item.contacted_by || 'الصيدلي'}): {item.contact_notes}
                  </div>
                )}

                {/* شريط الإجراءات */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    paddingTop: '8px',
                    borderTop: '1px dashed #e2e8f0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* زر مراسلة الواتساب المباشرة */}
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(item)}
                      className="outstock-btn outstock-btn-whatsapp"
                      style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: '800' }}
                      title="فتح محادثة واتساب مع العميل برسالة إشعار التوفر الجاهزة"
                    >
                      <MessageSquare size={14} />
                      <span>مراسلة واتساب 💬</span>
                    </button>

                    {/* زر الاتصال الهاتفي */}
                    {item.customer_phone && (
                      <a
                        href={`tel:${item.customer_phone}`}
                        className="outstock-btn outstock-btn-secondary"
                        style={{ padding: '7px 12px', fontSize: '12px', textDecoration: 'none' }}
                        title="اتصال هاتفي بالعميل"
                      >
                        <Phone size={13} />
                        <span>اتصال 📞</span>
                      </a>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* زر تسجيل تم التواصل */}
                    <button
                      type="button"
                      onClick={() => handleOpenContactModal(item)}
                      className="outstock-btn"
                      style={{
                        padding: '7px 12px',
                        fontSize: '12px',
                        fontWeight: '800',
                        background: isContacted ? '#f1f5f9' : '#ecfdf5',
                        color: isContacted ? '#475569' : '#065f46',
                        border: isContacted ? '1px solid #cbd5e1' : '1px solid #a7f3d0'
                      }}
                      title="تسجيل إتمام التواصل مع العميل وحفظ الملاحظات"
                    >
                      <Check size={14} />
                      <span>{isContacted ? 'تعديل ملاحظة التواصل' : 'تسجيل تم التواصل ✅'}</span>
                    </button>

                    {/* زر إنشاء طلب جديد للعميل */}
                    <button
                      type="button"
                      onClick={() => setReorderCustomer(item)}
                      className="outstock-btn outstock-btn-primary"
                      style={{ padding: '7px 14px', fontSize: '12px', fontWeight: '800' }}
                      title="فتح نافذة تسجيل طلب جديد لنفس العميل مع الصنف"
                    >
                      <Plus size={14} />
                      <span>إنشاء طلب جديد</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── نافذة تأكيد تسجيل التواصل مع العميل ── */}
      {contactingItem && (
        <div className="outstock-modal-backdrop" onClick={() => setContactingItem(null)}>
          <div
            className="outstock-modal-panel"
            style={{ maxWidth: '500px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outstock-modal-drag-handle" />

            <div className="outstock-modal-header">
              <h3>📞 تسجيل التواصل مع العميل</h3>
              <button
                type="button"
                className="outstock-modal-close"
                onClick={() => setContactingItem(null)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleConfirmContact}>
              <div className="outstock-modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
                  <div>العميل: <strong>{contactingItem.customer_name}</strong></div>
                  <div>الصنف المتوفر: <strong style={{ color: '#0f766e' }}>{contactingItem.medication_name}</strong></div>
                </div>

                <div className="outstock-form-group">
                  <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', marginBottom: '4px', display: 'block' }}>
                    ملاحظات التواصل / رد العميل :
                  </label>
                  <textarea
                    rows={3}
                    placeholder="مثال: تم إبلاغ العميل وسيأتي للاستلام اليوم مساءً..."
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    className="outstock-form-textarea"
                    style={{ fontSize: '12.5px' }}
                  />
                </div>
              </div>

              <div className="outstock-modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setContactingItem(null)}
                  disabled={isSubmittingContact}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingContact}
                  className="outstock-btn outstock-btn-success"
                  style={{ padding: '8px 16px', fontWeight: '800' }}
                >
                  <span>{isSubmittingContact ? 'جاري الحفظ...' : 'تأكيد وحفظ ✅'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── نافذة إنشاء طلب جديد للعميل ── */}
      {reorderCustomer && (
        <NewCustomerOrderModal
          branchId={branchId}
          branch={branch}
          defaultPharmacist={currentPharmacist}
          initialCustomerPhone={reorderCustomer.customer_phone}
          onClose={() => setReorderCustomer(null)}
          onSuccess={() => {
            setReorderCustomer(null);
            fetchItems();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
