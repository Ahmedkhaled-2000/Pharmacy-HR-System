import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Sparkles,
  Phone,
  Calendar,
  Building2,
  Clock,
  History,
  X,
  FileText,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  Tag
} from 'lucide-react';
import {
  outstockGetCustomers,
  outstockGetCosmeticsCustomerOrders,
  outstockGetBranches
} from '../../../utils/outstockApiClient';

/**
 * CosmeticsCustomersTab.jsx
 * تبويبة العملاء المسجلين لمسؤول مستحضرات التجميل:
 * - تقتصر على عملاء مستحضرات التجميل المسجلين
 * - إمكانية البحث باسم العميل، رقم الهاتف، أو اسم مستحضر التجميل
 * - سجل طلبات قراءة فقط (Read-only) مخصص لأصناف التجميل
 */
export default function CosmeticsCustomersTab({ showToast }) {
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');

  // نافذة سجل طلبات العميل
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // جلب العملاء
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const [custRes, branchRes] = await Promise.all([
        outstockGetCustomers({ category_scope: 'cosmetics', search: searchQuery }),
        outstockGetBranches().catch(() => null)
      ]);

      if (custRes?.success && Array.isArray(custRes.customers)) {
        setCustomers(custRes.customers);
      } else {
        setCustomers([]);
      }

      if (branchRes?.success && Array.isArray(branchRes.branches)) {
        setBranches(branchRes.branches);
      }
    } catch (e) {
      console.warn('Fetch cosmetics customers error:', e);
      showToast?.('تعذر تحميل بيانات عملاء مستحضرات التجميل');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, showToast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // فتح سجل طلبات العميل
  const handleOpenHistory = async (customer) => {
    setHistoryCustomer(customer);
    setIsLoadingHistory(true);
    try {
      const res = await outstockGetCosmeticsCustomerOrders(customer.id);
      if (res?.success && Array.isArray(res.orders)) {
        setCustomerOrders(res.orders);
      } else {
        setCustomerOrders([]);
      }
    } catch (e) {
      console.warn('Fetch customer cosmetics orders error:', e);
      setCustomerOrders([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // فلترة العملاء
  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (selectedBranch !== 'all') {
      result = result.filter(c => String(c.primary_branch_id) === String(selectedBranch) || c.branch_name === selectedBranch);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c => {
        const name = String(c.full_name || c.name || '').toLowerCase();
        const phone = String(c.whatsapp_phone || c.phone || '').toLowerCase();
        const code = String(c.customer_code || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || code.includes(q);
      });
    }
    return result;
  }, [customers, selectedBranch, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 2px' }}>
      {/* ── الرأس والإحصائيات ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #831843 0%, #be185d 100%)',
          borderRadius: '16px',
          padding: '20px 24px',
          color: '#ffffff',
          boxShadow: '0 8px 24px -4px rgba(190, 24, 93, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1.5px solid rgba(255, 255, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Sparkles size={24} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900' }}>
              العملاء المسجلين - قسم مستحضرات التجميل 💄👥
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', opacity: 0.9 }}>
              سجل عملاء العناية والتجميل واستعراض تاريخ طلباتهم والبدائل التجميلية المفضلة
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              padding: '8px 16px',
              borderRadius: '10px',
              textAlign: 'center',
              backdropFilter: 'blur(4px)'
            }}
          >
            <span style={{ fontSize: '11px', display: 'block', opacity: 0.9 }}>إجمالي العملاء</span>
            <strong style={{ fontSize: '18px', fontFamily: 'monospace' }}>{filteredCustomers.length}</strong>
          </div>

          <button
            type="button"
            onClick={fetchCustomers}
            disabled={isLoading}
            className="outstock-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              padding: '8px 14px',
              borderRadius: '10px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={15} className={isLoading ? 'outstock-spin' : ''} />
            <span>تحديث السجل</span>
          </button>
        </div>
      </div>

      {/* ── شريط البحث والفلترة ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '14px 18px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <input
            type="text"
            placeholder="ابحث باسم العميل، رقم الواتساب، أو اسم مستحضر التجميل المطلوب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="outstock-form-input"
            style={{
              paddingRight: '38px',
              height: '42px',
              fontSize: '13px',
              borderColor: '#f472b6'
            }}
          />
          <Search size={18} color="#be185d" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />
        </div>

        <div style={{ minWidth: '180px' }}>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="outstock-form-select"
            style={{ height: '42px', fontSize: '13px' }}
          >
            <option value="all">كافة الفروع</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── قائمة العملاء ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
      >
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ margin: '0 auto 10px', color: '#be185d' }} />
            <div>جاري تحميل بيانات عملاء مستحضرات التجميل...</div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <Users size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: '800', color: '#334155', fontSize: '15px' }}>لم يتم العثور على عملاء</div>
            <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
              لا يوجد عملاء مطابقين لمعايير البحث في قسم مستحضرات التجميل
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fdf2f8', borderBottom: '1px solid #fbcfe8', color: '#831843' }}>
                  <th style={{ padding: '12px 16px' }}>العميل</th>
                  <th style={{ padding: '12px 16px' }}>رقم الواتساب</th>
                  <th style={{ padding: '12px 16px' }}>الفرع المسجل</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>عدد طلبات التجميل</th>
                  <th style={{ padding: '12px 16px' }}>تاريخ التسجيل</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust, idx) => (
                  <tr
                    key={cust.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#fdf2f8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '800', color: '#0f172a' }}>{cust.full_name || cust.name || 'عميل نقدي'}</div>
                      {cust.customer_code && (
                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                          {cust.customer_code}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} dir="ltr">
                        <Phone size={13} color="#be185d" />
                        <span style={{ fontWeight: '600' }}>{cust.whatsapp_phone || cust.phone || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '700' }}>
                        {cust.branch_name || cust.primary_branch_id || 'الفرع الرئيسي'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          background: '#fdf2f8',
                          color: '#be185d',
                          border: '1px solid #fbcfe8',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontWeight: '800',
                          fontSize: '12px'
                        }}
                      >
                        {cust.cosmetics_orders_count || cust.orders_count || 1} طلب
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                      {cust.created_at ? new Date(cust.created_at).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenHistory(cust)}
                        className="outstock-btn"
                        style={{
                          background: '#fdf2f8',
                          border: '1px solid #f472b6',
                          color: '#be185d',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '800',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                        title="استعراض سجل طلبات مستحضرات التجميل (قراءة فقط)"
                      >
                        <History size={13} />
                        <span>سجل الطلبات 📋</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة سجل طلبات التجميل للعميل (Read-Only) ── */}
      {historyCustomer && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => setHistoryCustomer(null)}
          style={{
            zIndex: 100050,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="outstock-modal-panel"
            style={{
              maxWidth: '680px',
              width: '95%',
              maxHeight: '90vh',
              background: '#ffffff',
              borderRadius: '18px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              direction: 'rtl'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* رأس النافذة */}
            <div
              style={{
                background: 'linear-gradient(135deg, #831843 0%, #be185d 100%)',
                color: '#ffffff',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={20} color="#ffffff" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                    سجل طلبات التجميل: {historyCustomer.full_name || historyCustomer.name}
                  </h3>
                  <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: '2px' }}>
                    هاتف: <span dir="ltr">{historyCustomer.whatsapp_phone || historyCustomer.phone || '—'}</span> (للقراءة والاطلاع فقط 🔒)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* جسم النافذة */}
            <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {isLoadingHistory ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw size={22} className="outstock-spin" style={{ margin: '0 auto 8px', color: '#be185d' }} />
                  <div>جاري جلب سجل طلبات التجميل...</div>
                </div>
              ) : customerOrders.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                  <ShoppingBag size={32} color="#cbd5e1" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: '700' }}>لا توجد طلبات مسجلة لمستحضرات التجميل لهذا العميل</div>
                </div>
              ) : (
                customerOrders.map((ord, idx) => {
                  const items = Array.isArray(ord.items) ? ord.items : [];
                  return (
                    <div
                      key={ord.id || idx}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #fbcfe8',
                        borderRadius: '12px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fdf2f8', paddingBottom: '8px' }}>
                        <div>
                          <strong style={{ color: '#831843', fontSize: '13.5px' }}>
                            طلب #{ord.order_number || ord.id}
                          </strong>
                          <span style={{ fontSize: '12px', color: '#64748b', marginRight: '8px' }}>
                            • {new Date(ord.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <span
                          style={{
                            background: ord.order_status === 'delivered' ? '#dcfce7' : '#fef3c7',
                            color: ord.order_status === 'delivered' ? '#15803d' : '#b45309',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '800'
                          }}
                        >
                          {ord.order_status === 'delivered' ? 'تم التسليم ✓' : (ord.order_status || 'نشط')}
                        </span>
                      </div>

                      {/* قائمة الأصناف التجميلية بالطلب */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {items.map((it, itIdx) => (
                          <div
                            key={itIdx}
                            style={{
                              background: '#fdf2f8',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '12.5px'
                            }}
                          >
                            <div>
                              <strong style={{ color: '#0f172a' }}>{it.medication_name || it.medicationName || it.name}</strong>
                              {it.brand && <span style={{ color: '#9d174d', marginRight: '6px', fontSize: '11px' }}>({it.brand})</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontWeight: '700', color: '#be185d' }}>{it.quantity} عبوة</span>
                              {it.unit_price && (
                                <span style={{ fontWeight: '800', color: '#0f766e' }}>
                                  {(parseFloat(it.unit_price) * (parseInt(it.quantity, 10) || 1)).toFixed(2)} ج.م
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', paddingTop: '4px' }}>
                        <span>الفرع: <strong>{ord.branch_name || 'الفرع'}</strong></span>
                        <span>إجمالي الأصناف التجميلية: <strong style={{ color: '#0f766e' }}>{parseFloat(ord.net_amount || ord.total_amount || 0).toFixed(2)} ج.م</strong></span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* أسفل النافذة */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setHistoryCustomer(null)}
                style={{ padding: '6px 18px', fontSize: '12.5px' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
