import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Phone, MapPin, Calendar, Clock, Edit2, History, X, User, CheckCircle } from 'lucide-react';
import { outstockGetCustomers, outstockSaveCustomer, outstockGetCustomerHistory } from '../../../utils/outstockApiClient';

/**
 * PharmacyCustomersTab.jsx
 * شاشة العملاء المسجلين بالصيدلية
 * - استعراض كافة العملاء المسجلين وسجل طلباتهم
 * - البحث بالرقم، أو باسم صنف الدواء، وفلترة التاريخ
 * - إضافة وتعديل عميل مع فرض فرادة رقم الهاتف
 */
export default function PharmacyCustomersTab({ branchId, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // نافذة إضافة/تعديل عميل
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formLandline, setFormLandline] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // نافذة استعراض سجل العميل السابق
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // جلب العملاء
  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetCustomers({ branchId });
      if (res?.success && Array.isArray(res.customers)) {
        setCustomers(res.customers);
      }
    } catch (e) {
      console.warn('Fetch customers error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [branchId]);

  // فتح نافذة الإضافة
  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormLandline('');
    setFormAddress('');
    setFormNotes('');
    setFormError('');
    setIsEditModalOpen(true);
  };

  // فتح نافذة التعديل
  const handleOpenEdit = (cust) => {
    setEditingCustomer(cust);
    setFormName(cust.full_name || '');
    setFormPhone(cust.whatsapp_phone || '');
    setFormLandline(cust.landline_phone || '');
    setFormAddress(cust.address || '');
    setFormNotes(cust.notes || '');
    setFormError('');
    setIsEditModalOpen(true);
  };

  // فتح سجل طلبات العميل
  const handleOpenHistory = async (cust) => {
    setHistoryCustomer(cust);
    setIsLoadingHistory(true);
    try {
      const res = await outstockGetCustomerHistory(cust.id);
      if (res?.success && Array.isArray(res.orders)) {
        setCustomerOrders(res.orders);
      } else {
        setCustomerOrders([]);
      }
    } catch (e) {
      setCustomerOrders([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // حفظ العميل
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanName = String(formName || '').trim();
    const cleanPhone = String(formPhone || '').replace(/\D/g, '');

    if (!cleanName) {
      setFormError('يرجى إدخال اسم العميل');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 9) {
      setFormError('يرجى إدخال رقم هاتف واتساب صالح (9 أرقام على الأقل)');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await outstockSaveCustomer({
        id: editingCustomer?.id || null,
        fullName: cleanName,
        whatsappPhone: cleanPhone,
        landlinePhone: formLandline ? String(formLandline).trim() : null,
        address: formAddress ? String(formAddress).trim() : null,
        branchId,
        notes: formNotes ? String(formNotes).trim() : null
      });

      if (res?.success) {
        showToast?.('✅ تم حفظ بيانات العميل بنجاح');
        setIsEditModalOpen(false);
        fetchCustomers();
      } else {
        setFormError(res?.error || 'تعذر حفظ العميل، تأكد من عدم تكرار رقم الهاتف');
      }
    } catch (err) {
      setFormError('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSubmitting(false);
    }
  };

  // فلترة العملاء بالبحث
  const filteredCustomers = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return customers;

    return customers.filter(c => {
      const name = String(c.full_name || '').toLowerCase();
      const phone = String(c.whatsapp_phone || '').toLowerCase();
      const code = String(c.customer_code || '').toLowerCase();
      const address = String(c.address || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || code.includes(q) || address.includes(q);
    });
  }, [customers, searchQuery]);

  return (
    <div>
      {/* ── شريط الأدوات ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div className="outstock-filters-bar">
          <div className="outstock-search-bar" style={{ flex: 1, minWidth: '240px' }}>
            <Search size={18} className="outstock-search-icon" />
            <input
              type="text"
              placeholder="🔍 ابحث باسم العميل، رقم الهاتف، أو كود العميل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-search-input"
            />
          </div>

          <button
            type="button"
            className="outstock-btn outstock-btn-primary"
            onClick={handleOpenAdd}
          >
            <Plus size={16} />
            <span>إضافة عميل جديد</span>
          </button>
        </div>
      </div>

      {/* ── جدول العملاء ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>👥 دليل العملاء المسجلين</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
              ({filteredCustomers.length} عميل)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري تحميل دليل العملاء...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            لا يوجد عملاء يطابقون خيارات البحث
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>كود العميل</th>
                  <th>اسم العميل</th>
                  <th>رقم الواتساب</th>
                  <th>الهاتف الأرضي</th>
                  <th>العنوان</th>
                  <th>إجمالي الطلبات</th>
                  <th>تاريخ التسجيل</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(cust => (
                  <tr key={cust.id}>
                    <td>
                      <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                        {cust.customer_code}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: '#0f172a', fontSize: '13.5px' }}>{cust.full_name}</strong>
                    </td>
                    <td>
                      <span style={{ color: '#0284c7', fontWeight: '700', direction: 'ltr', display: 'inline-block' }}>
                        {cust.whatsapp_phone}
                      </span>
                    </td>
                    <td>{cust.landline_phone || '—'}</td>
                    <td>{cust.address || '—'}</td>
                    <td>
                      <span className="outstock-badge partial">
                        {cust.real_orders_count || cust.total_orders_count || 0} طلب
                      </span>
                    </td>
                    <td>
                      {new Date(cust.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                          onClick={() => handleOpenHistory(cust)}
                          title="استعراض سجل الطلبات الكامل"
                        >
                          <History size={13} />
                          <span>السجل</span>
                        </button>

                        <button
                          type="button"
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                          onClick={() => handleOpenEdit(cust)}
                          title="تعديل بيانات العميل"
                        >
                          <Edit2 size={13} />
                          <span>تعديل</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة إضافة / تعديل عميل ── */}
      {isEditModalOpen && (
        <div className="outstock-modal-backdrop" onClick={() => setIsEditModalOpen(false)}>
          <div className="outstock-modal-panel modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>{editingCustomer ? '✏️ تعديل بيانات العميل' : '👤 إضافة عميل جديد'}</h3>
              <button className="outstock-modal-close" onClick={() => setIsEditModalOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer}>
              <div className="outstock-modal-body">
                {formError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', color: '#b91c1c', fontSize: '13px' }}>
                    ⚠️ {formError}
                  </div>
                )}

                <div className="outstock-form-group">
                  <label>اسم العميل *</label>
                  <input
                    type="text"
                    required
                    placeholder="الاسم ثلاثي أو ثنائي"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>

                <div className="outstock-form-row">
                  <div className="outstock-form-group">
                    <label>رقم هاتف الواتساب (فريد لا يتكرر) *</label>
                    <input
                      type="tel"
                      required
                      placeholder="01xxxxxxxxx"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ textAlign: 'right' }}
                    />
                  </div>

                  <div className="outstock-form-group">
                    <label>رقم الهاتف الأرضي (إن وجد)</label>
                    <input
                      type="tel"
                      placeholder="رقم الهاتف الأرضي"
                      value={formLandline}
                      onChange={(e) => setFormLandline(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ textAlign: 'right' }}
                    />
                  </div>
                </div>

                <div className="outstock-form-group">
                  <label>عنوان السكن</label>
                  <input
                    type="text"
                    placeholder="المنطقة، الشارع، علامة مميزة"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>

                <div className="outstock-form-group">
                  <label>ملاحظات إضافية</label>
                  <textarea
                    rows="2"
                    placeholder="أي ملاحظات حول تفضيلات العميل أو أدوية مزمنة"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="outstock-form-textarea"
                  />
                </div>
              </div>

              <div className="outstock-modal-footer">
                <button type="button" className="outstock-btn outstock-btn-secondary" onClick={() => setIsEditModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" disabled={isSubmitting} className="outstock-btn outstock-btn-primary">
                  <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ بيانات العميل'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── نافذة استعراض سجل طلبات العميل ── */}
      {historyCustomer && (
        <div className="outstock-modal-backdrop" onClick={() => setHistoryCustomer(null)}>
          <div className="outstock-modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>
                📜 سجل طلبات العميل: <strong>{historyCustomer.full_name}</strong>
              </h3>
              <button className="outstock-modal-close" onClick={() => setHistoryCustomer(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="outstock-modal-body">
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>كود العميل: <strong>{historyCustomer.customer_code}</strong></div>
                <div>الواتساب: <strong>{historyCustomer.whatsapp_phone}</strong></div>
                <div>العنوان: <span>{historyCustomer.address || 'غير محدد'}</span></div>
              </div>

              {isLoadingHistory ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  جاري تحميل سجل الطلبات...
                </div>
              ) : customerOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  لا توجد طلبات سابقة مسجلة لهذا العميل حتى الآن.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customerOrders.map(order => (
                    <div
                      key={order.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '12px 14px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div>
                          <strong>{order.order_number}</strong> - {new Date(order.created_at).toLocaleDateString('ar-EG')}
                        </div>
                        <div>
                          {order.order_status === 'delivered' ? (
                            <span className="outstock-badge ready">تم التسليم ✓</span>
                          ) : (
                            <span className="outstock-badge pending">معلق</span>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', color: '#475569' }}>
                        الأصناف:{' '}
                        {(order.items || []).map((it, i) => (
                          <span key={i} style={{ marginLeft: '8px' }}>
                            • {it.medicationName} ({it.quantity} {it.unitType === 'strip' ? 'شريط' : 'علبة'})
                          </span>
                        ))}
                      </div>

                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                        الإجمالي: {order.total_amount} ج.م | المدفوع: {order.paid_amount} ج.م | المتبقي: {order.remaining_amount} ج.م
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="outstock-modal-footer">
              <button type="button" className="outstock-btn outstock-btn-secondary" onClick={() => setHistoryCustomer(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
