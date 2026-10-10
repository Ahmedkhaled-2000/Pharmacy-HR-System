import React, { useState, useEffect, useMemo } from 'react';
import { Search, Building2, Phone, Calendar, Clock, History, X, Users, RefreshCw, Wallet } from 'lucide-react';
import { outstockGetCustomers, outstockGetCustomerHistory, outstockGetBranches } from '../../../utils/outstockApiClient';
import CustomerWalletModal from '../common/CustomerWalletModal';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';

/**
 * OwnerCustomersDirectoryTab.jsx
 * شاشة العملاء المركزية للمالك والمشرف العام
 * - جلب كافة بيانات العملاء المسجلين في كل فروع السلسلة
 * - تقسيم وتصفية العملاء حسب الفرع المسجلين فيه
 * - نافذة منبثقة تفاعلية عند النقر على أي عميل تعرض كامل طلباته وتواريخها
 */
export default function OwnerCustomersDirectoryTab({ showToast }) {
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // نافذة تفاصيل سجل العميل
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // نافذة محفظة العميل الإلكترونية
  const [walletCustomer, setWalletCustomer] = useState(null);
  const [walletTargetCustomer, setWalletTargetCustomer] = useState(null);
  const [isWalletAuthOpen, setIsWalletAuthOpen] = useState(false);
  const [authenticatedEmployee, setAuthenticatedEmployee] = useState(null);

  const handleOpenWallet = (cust) => {
    setWalletTargetCustomer(cust);
    setIsWalletAuthOpen(true);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [custRes, branchRes] = await Promise.all([
        outstockGetCustomers(),
        outstockGetBranches()
      ]);

      if (custRes?.success && Array.isArray(custRes.customers)) {
        setCustomers(custRes.customers);
      }
      if (branchRes?.success && Array.isArray(branchRes.branches)) {
        setBranches(branchRes.branches);
      }
    } catch (e) {
      console.warn('Fetch owner customers error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCustomerOrders = async (cust) => {
    setSelectedCustomer(cust);
    setIsLoadingOrders(true);
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
      setIsLoadingOrders(false);
    }
  };

  // تطبيق الفلاتر
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (selectedBranchFilter !== 'all' && c.primary_branch_id !== selectedBranchFilter) {
        return false;
      }
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const name = String(c.full_name || '').toLowerCase();
        const phone = String(c.whatsapp_phone || '').toLowerCase();
        const code = String(c.customer_code || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || code.includes(q);
      }
      return true;
    });
  }, [customers, selectedBranchFilter, searchQuery]);

  return (
    <div>
      {/* ── شريط الفلاتر والبحث ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
            <div className="outstock-search-bar" style={{ flex: 1 }}>
              <Search size={18} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="🔍 ابحث باسم العميل، الهاتف، أو كود العميل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outstock-search-input"
              />
            </div>

            {/* فلتر الفرع */}
            <div style={{ minWidth: '180px' }}>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="outstock-form-select"
                style={{ height: '42px' }}
              >
                <option value="all">🏢 جميع الفروع ({branches.length})</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={fetchData}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* ── جدول العملاء المقسم حسب الفرع ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>👥 قاعدة بيانات عملاء المجموعة الموحدة</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
              ({filteredCustomers.length} عميل مسجل)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري جلب بيانات العملاء...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            لا يوجد عملاء يطابقون خيارات البحث.
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>كود العميل</th>
                  <th>اسم العميل</th>
                  <th>رصيد المحفظة</th>
                  <th>رقم الواتساب</th>
                  <th>الفرع المسجل فيه</th>
                  <th>العنوان</th>
                  <th>إجمالي الطلبات</th>
                  <th>تاريخ التسجيل</th>
                  <th>سجل الطلبات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(cust => (
                  <tr key={cust.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenCustomerOrders(cust)}>
                    <td>
                      <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                        {cust.customer_code}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>{cust.full_name}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          background: Number(cust.wallet_balance || 0) > 0 ? '#ecfdf5' : '#f8fafc',
                          color: Number(cust.wallet_balance || 0) > 0 ? '#059669' : '#64748b',
                          border: `1px solid ${Number(cust.wallet_balance || 0) > 0 ? '#a7f3d0' : '#e2e8f0'}`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Wallet size={12} />
                        {Number(cust.wallet_balance || 0).toFixed(2)} ج.م
                      </span>
                    </td>
                    <td>
                      <span style={{ color: '#0284c7', fontWeight: '700', direction: 'ltr', display: 'inline-block' }}>
                        {cust.whatsapp_phone}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        background: '#f0fdfa',
                        border: '1px solid #ccfbf1',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: '800',
                        fontSize: '12px',
                        color: '#0f766e'
                      }}>
                        <Building2 size={12} style={{ display: 'inline' }} /> {cust.branch_name || cust.primary_branch_id}
                      </span>
                    </td>
                    <td>{cust.address || '—'}</td>
                    <td>
                      <span className="outstock-badge partial">
                        {cust.real_orders_count || cust.total_orders_count || 0} طلب
                      </span>
                    </td>
                    <td>{new Date(cust.created_at).toLocaleDateString('ar-EG')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="outstock-btn"
                          style={{
                            padding: '5px 10px',
                            fontSize: '12px',
                            background: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenWallet(cust);
                          }}
                          title="إدارة وشحن محفظة العميل"
                        >
                          <Wallet size={13} />
                          <span>المحفظة</span>
                        </button>

                        <button
                          type="button"
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '5px 12px', fontSize: '12px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCustomerOrders(cust);
                          }}
                        >
                          <History size={13} />
                          <span>الطلبات</span>
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

      {/* ── نافذة منبثقة تفاعلية تعرض جميع طلبات العميل والتواريخ ── */}
      {selectedCustomer && (
        <div className="outstock-modal-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div className="outstock-modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>
                📋 سجل طلبات العميل: <strong>{selectedCustomer.full_name}</strong> ({selectedCustomer.customer_code})
              </h3>
              <button className="outstock-modal-close" onClick={() => setSelectedCustomer(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="outstock-modal-body">
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                fontSize: '13px'
              }}>
                <div>الفرع المسجل: <strong>{selectedCustomer.branch_name || selectedCustomer.primary_branch_id}</strong></div>
                <div>الواتساب: <strong dir="ltr">{selectedCustomer.whatsapp_phone}</strong></div>
                <div>الهاتف الأرضي: <span>{selectedCustomer.landline_phone || '—'}</span></div>
                <div>العنوان: <span>{selectedCustomer.address || '—'}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: '1 / -1', background: '#ffffff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span>رصيد محفظة العميل: <strong style={{ color: '#059669', fontSize: '14px' }}>{Number(selectedCustomer.wallet_balance || 0).toFixed(2)} ج.م</strong></span>
                  <button
                    type="button"
                    className="outstock-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      background: '#ecfdf5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginRight: 'auto'
                    }}
                    onClick={() => handleOpenWallet(selectedCustomer)}
                  >
                    <Wallet size={12} />
                    <span>إدارة وشحن المحفظة 👛</span>
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '14px', fontWeight: '900', color: '#1e293b', marginTop: '10px' }}>
                تاريخ الطلبات وتفاصيل الأدوية:
              </div>

              {isLoadingOrders ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  جاري جلب تفاصيل الطلبات...
                </div>
              ) : customerOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  لا توجد طلبات سابقة مسجلة لهذا العميل.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {customerOrders.map(order => (
                    <div
                      key={order.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '900', fontSize: '13.5px', color: '#0f172a' }}>
                            {order.order_number}
                          </span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            (فرع {order.branch_name || order.branch_id})
                          </span>
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
                            <span className="outstock-badge ready">تم التسليم بنجاح ✓</span>
                          ) : (
                            <span className="outstock-badge pending">قيد المتابعة</span>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '6px' }}>
                        تاريخ الطلب: {new Date(order.created_at).toLocaleDateString('ar-EG')} - {new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        {order.delivered_at && ` • تاريخ التسليم: ${new Date(order.delivered_at).toLocaleDateString('ar-EG')}`}
                      </div>

                      <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}>
                        <strong>الأصناف المطلوبة:</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                          {(order.items || []).map((it, i) => (
                            <span key={i} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>
                              {it.medicationName} ({it.quantity} {it.unitType === 'strip' ? 'شريط' : 'علبة'})
                            </span>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12.5px' }}>
                        <div>الإجمالي: <strong>{parseFloat(order.total_amount || 0).toFixed(2)} ج.م</strong></div>
                        <div>المدفوع (عربون): <strong style={{ color: '#059669' }}>{parseFloat(order.paid_amount || 0).toFixed(2)} ج.م</strong></div>
                        <div>المتبقي: <strong style={{ color: '#dc2626' }}>{parseFloat(order.remaining_amount || 0).toFixed(2)} ج.م</strong></div>
                        <div>الصيدلي: <span>{order.responsible_pharmacist || '—'}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="outstock-modal-footer">
              <button type="button" className="outstock-btn outstock-btn-secondary" onClick={() => setSelectedCustomer(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── التحقق من كود الموظف قبل فتح المحفظة ── */}
      {isWalletAuthOpen && (
        <EmployeeCodeAuthModal
          isOpen={isWalletAuthOpen}
          title="التحقق من كود الموظف لفتح محفظة العميل"
          subtitle="يرجى إدخال كود الموظف لتدقيق وتسجيل جميع العمليات المالية"
          actionLabel="تأكيد الكود وفتح المحفظة"
          onSuccess={(emp) => {
            setAuthenticatedEmployee(emp);
            setIsWalletAuthOpen(false);
            if (walletTargetCustomer) {
              setWalletCustomer(walletTargetCustomer);
            }
          }}
          onClose={() => {
            setIsWalletAuthOpen(false);
            setWalletTargetCustomer(null);
          }}
        />
      )}

      {/* ── نافذة إدارة وشحن محفظة العميل ── */}
      {walletCustomer && (
        <CustomerWalletModal
          customer={walletCustomer}
          isOpen={Boolean(walletCustomer)}
          onClose={() => setWalletCustomer(null)}
          authenticatedEmployee={authenticatedEmployee}
          onBalanceUpdated={(custId, newBal) => {
            setCustomers(prev => prev.map(c => c.id === custId ? { ...c, wallet_balance: newBal } : c));
            if (selectedCustomer && selectedCustomer.id === custId) {
              setSelectedCustomer(prev => ({ ...prev, wallet_balance: newBal }));
            }
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
