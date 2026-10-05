import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Phone, MapPin, Calendar, Clock, Edit2, History, X, User, CheckCircle, Trash2, AlertTriangle, Building2 } from 'lucide-react';
import { outstockGetCustomers, outstockSaveCustomer, outstockGetCustomerHistory, outstockDeleteCustomer, outstockGetBranches } from '../../../utils/outstockApiClient';

/**
 * PharmacyCustomersTab.jsx
 * شاشة العملاء المسجلين بالصيدلية
 * - استعراض كافة العملاء المسجلين وسجل طلباتهم لكافة الفروع
 * - البحث بالرقم، أو باسم صنف الدواء، وفلترة التاريخ
 * - إضافة وتعديل عميل مع فرض فرادة رقم الهاتف
 * - اختيار المنطقة من قائمة منسدلة
 * - حذف العميل مع الحفاظ على الفواتير التاريخية بأمان
 * - حفظ واستعراض ملاحظات هامة على العميل
 */
export default function PharmacyCustomersTab({ branchId, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ── قائمة المناطق / الأحياء المعتمدة من إعدادات المالك ──
  const [deliveryZones] = useState(() => {
    try {
      const saved = localStorage.getItem('outstock_delivery_zones');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((z) => (typeof z === 'string' ? z : z.name)).filter(Boolean);
        }
      }
    } catch (e) {}
    return ['وسط البلد', 'حي الجامعة', 'المنطقة الأولى', 'المنطقة الثانية', 'حي النزهة', 'أخرى / خارج النطاق'];
  });

  // نافذة إضافة/تعديل عميل
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formLandline, setFormLandline] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // نافذة تأكيد حذف عميل
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // نافذة استعراض سجل العميل السابق
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // جلب العملاء عبر كافة الفروع ومزامنة الفروع
  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const [custRes, branchRes] = await Promise.all([
        outstockGetCustomers({}),
        outstockGetBranches().catch(() => null)
      ]);
      if (custRes?.success && Array.isArray(custRes.customers)) {
        setCustomers(custRes.customers);
      }
      if (branchRes?.success && Array.isArray(branchRes.branches)) {
        setBranches(branchRes.branches);
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
    setFormZone(deliveryZones[0] || '');
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
    setFormZone(cust.zone || deliveryZones[0] || '');
    setFormAddress(cust.address || '');
    setFormNotes(cust.notes || '');
    setFormError('');
    setIsEditModalOpen(true);
  };

  // حذف العميل
  const handleDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      const res = await outstockDeleteCustomer(deletingCustomer.id);
      if (res?.success) {
        showToast?.('✅ تم حذف العميل بنجاح مع الحفاظ على الفواتير التاريخية');
        setDeletingCustomer(null);
        fetchCustomers();
      } else {
        showToast?.('❌ ' + (res?.error || 'تعذر حذف العميل'));
      }
    } catch {
      showToast?.('❌ حدث خطأ أثناء حذف العميل');
    } finally {
      setIsDeleting(false);
    }
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
        zone: formZone ? String(formZone).trim() : null,
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

  // فلترة العملاء بالبحث والفرع
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (selectedBranchFilter !== 'all') {
        if (selectedBranchFilter === 'current_branch') {
          if (String(c.primary_branch_id) !== String(branchId)) return false;
        } else if (String(c.primary_branch_id) !== String(selectedBranchFilter)) {
          return false;
        }
      }
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const name = String(c.full_name || '').toLowerCase();
        const phone = String(c.whatsapp_phone || '').toLowerCase();
        const code = String(c.customer_code || '').toLowerCase();
        const address = String(c.address || '').toLowerCase();
        const bName = String(c.branch_name || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || code.includes(q) || address.includes(q) || bName.includes(q);
      }
      return true;
    });
  }, [customers, selectedBranchFilter, searchQuery, branchId]);

  return (
    <div>
      {/* ── شريط الأدوات ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div className="outstock-filters-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
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

          {/* فلتر الفروع المشتركة */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={16} color="#0d9488" />
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="outstock-search-input"
              style={{ padding: '8px 12px', minWidth: '180px', fontWeight: '800', fontSize: '13px' }}
            >
              <option value="all">🌐 كافة الفروع ({customers.length})</option>
              <option value="current_branch">🏢 فرعنا فقط</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>🏢 {b.name}</option>
              ))}
            </select>
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
                  <th>فرع التسجيل</th>
                  <th>رقم الواتساب</th>
                  <th>الهاتف الأرضي</th>
                  <th>المنطقة والعنوان</th>
                  <th>ملاحظات العميل</th>
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
                      <span style={{
                        background: String(cust.primary_branch_id) === String(branchId) ? '#f0fdf4' : '#eff6ff',
                        color: String(cust.primary_branch_id) === String(branchId) ? '#166534' : '#1d4ed8',
                        border: `1px solid ${String(cust.primary_branch_id) === String(branchId) ? '#bbf7d0' : '#bfdbfe'}`,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        🏢 {cust.branch_name || (String(cust.primary_branch_id) === String(branchId) ? 'فرعكم' : 'فرع مسجل')}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: '#0284c7', fontWeight: '700', direction: 'ltr', display: 'inline-block' }}>
                        {cust.whatsapp_phone}
                      </span>
                    </td>
                    <td>{cust.landline_phone || '—'}</td>
                    <td>
                      <div>
                        {cust.zone && (
                          <span style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '800', display: 'inline-block', marginBottom: '2px' }}>
                            📍 {cust.zone}
                          </span>
                        )}
                        <div style={{ fontSize: '12px' }}>{cust.address || '—'}</div>
                      </div>
                    </td>
                    <td>
                      {cust.notes ? (
                        <div
                          style={{
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            color: '#92400e',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            maxWidth: '180px',
                            fontWeight: '700',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={cust.notes}
                        >
                          ⚠️ {cust.notes}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="outstock-badge partial">
                        {cust.real_orders_count || cust.total_orders_count || 0} طلب
                      </span>
                    </td>
                    <td>
                      {new Date(cust.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button
                          type="button"
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '11.5px' }}
                          onClick={() => handleOpenHistory(cust)}
                          title="استعراض سجل الطلبات الكامل"
                        >
                          <History size={12} />
                          <span>السجل</span>
                        </button>

                        <button
                          type="button"
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '11.5px' }}
                          onClick={() => handleOpenEdit(cust)}
                          title="تعديل بيانات العميل"
                        >
                          <Edit2 size={12} />
                          <span>تعديل</span>
                        </button>

                        <button
                          type="button"
                          className="outstock-btn"
                          style={{
                            padding: '5px 8px',
                            fontSize: '11.5px',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            cursor: 'pointer'
                          }}
                          onClick={() => setDeletingCustomer(cust)}
                          title="حذف العميل مع الحفاظ على فواتير المبيعات السابقة"
                        >
                          <Trash2 size={12} />
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', fontWeight: '800', color: '#0f766e', marginBottom: '4px' }}>
                    <MapPin size={13} />
                    <span>المنطقة / الحي * :</span>
                  </label>
                  <select
                    value={formZone}
                    onChange={(e) => setFormZone(e.target.value)}
                    className="outstock-form-select"
                    style={{ fontWeight: '700' }}
                  >
                    {deliveryZones.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>

                <div className="outstock-form-group">
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>عنوان السكن التفصيلي</label>
                  <input
                    type="text"
                    placeholder="الشارع، رقم العمارة، علامة مميزة"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>

                <div className="outstock-form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', fontWeight: '800', color: '#c2410c', marginBottom: '4px' }}>
                    <AlertTriangle size={13} />
                    <span>ملاحظة هامة على العميل (تظهر تلقائياً عند أي طلب جديد له):</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="مثال: يفضل الاتصال قبل التوصيل، عميل دائم يطلب كذا، إلخ..."
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: '800',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: order.order_category === 'cosmetics' ? '#fdf2f8' : '#ecfdf5',
                              color: order.order_category === 'cosmetics' ? '#db2777' : '#059669',
                              border: order.order_category === 'cosmetics' ? '1px solid #fbcfe8' : '1px solid #a7f3d0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {order.order_category === 'cosmetics' ? '💄 مستحضرات تجميل' : '💊 طلب دوائي'}
                          </span>
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

      {/* ── نافذة تأكيد حذف عميل ── */}
      {deletingCustomer && (
        <div className="outstock-modal-backdrop" onClick={() => setDeletingCustomer(null)}>
          <div
            className="outstock-modal-panel"
            style={{ maxWidth: '460px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={18} color="#dc2626" />
                <h3 style={{ margin: 0, color: '#991b1b', fontSize: '15px', fontWeight: '800' }}>
                  تأكيد حذف العميل ⚠️
                </h3>
              </div>
              <button
                type="button"
                className="outstock-modal-close"
                onClick={() => setDeletingCustomer(null)}
              >
                ×
              </button>
            </div>

            <div className="outstock-modal-body" style={{ padding: '16px 20px', fontSize: '13px' }}>
              <p style={{ margin: '0 0 12px', color: '#1e293b' }}>
                هل أنت متأكد من رغبتك في حذف العميل:
                <strong style={{ display: 'block', margin: '6px 0', fontSize: '14.5px', color: '#dc2626' }}>
                  {deletingCustomer.full_name} ({deletingCustomer.whatsapp_phone})
                </strong>
              </p>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: '#64748b',
                  fontSize: '12px'
                }}
              >
                ℹ️ <strong>ملاحظة أمان:</strong> سيتم حذف بيانات العميل مع الحفاظ التام على أرقام وفواتير الطلبات السابقة في سجلات مبيعات الفرع دون أي تأثر بالحسابات المالية.
              </div>
            </div>

            <div className="outstock-modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setDeletingCustomer(null)}
                disabled={isDeleting}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                disabled={isDeleting}
                className="outstock-btn"
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 18px',
                  fontWeight: '800',
                  borderRadius: '8px'
                }}
              >
                <span>{isDeleting ? 'جاري الحذف...' : 'تأكيد الحذف 🗑️'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
