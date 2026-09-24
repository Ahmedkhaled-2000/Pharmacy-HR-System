import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, RefreshCw, Send, Users, Building2, Search, CheckCircle, Phone, X } from 'lucide-react';
import { outstockGetUnavailableItems, outstockNotifyRestocked } from '../../../utils/outstockApiClient';

/**
 * ProcurementUnavailableTab.jsx
 * شاشة الأصناف غير المتوفرة بالسوق (إدارة المشتريات)
 * - تجميع الأصناف النواقص مصنفة بالفرع الذي طلبها
 * - عند توفر الصنف لاحقاً بالسوق: زر "أصبح متوفراً الآن"
 * - استرجاع بيانات العملاء آلياً وإشعار الصيدلية للاتصال بهم
 */
export default function ProcurementUnavailableTab({ showToast }) {
  const [unavailableItems, setUnavailableItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNotifyingKey, setIsNotifyingKey] = useState(null);

  // نافذة معاينة العملاء المسترجعين بعد إشعار التوفر
  const [restockedResult, setRestockedResult] = useState(null);

  const fetchUnavailable = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetUnavailableItems();
      if (res?.success && Array.isArray(res.unavailableItems)) {
        setUnavailableItems(res.unavailableItems);
      }
    } catch (e) {
      console.warn('Fetch unavailable items error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnavailable();
  }, []);

  // إشعار الفرع بتوفر الصنف واسترجاع بيانات العملاء
  const handleNotifyRestocked = async (item) => {
    if (!window.confirm(`هل الصنف (${item.medication_name}) أصبح متوفراً الآن بالسوق وتريد إشعار فرع (${item.branch_name}) واسترجاع بيانات العملاء؟`)) {
      return;
    }

    const key = `${item.branch_id}_${item.medication_name}`;
    setIsNotifyingKey(key);
    try {
      const res = await outstockNotifyRestocked({
        branchId: item.branch_id,
        medicationName: item.medication_name,
        unitType: item.unit_type
      });

      if (res?.success) {
        showToast?.('✅ تم إشعار الفرع بنجاح واسترجاع بيانات العملاء للتواصل معهم');
        setRestockedResult({
          medicationName: item.medication_name,
          branchName: item.branch_name,
          waitingCustomers: res.waitingCustomers || item.waiting_customers || []
        });
        fetchUnavailable();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر إرسال الإشعار'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء إشعار الفرع');
    } finally {
      setIsNotifyingKey(null);
    }
  };

  // فلترة الأصناف بالبحث
  const filteredItems = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return unavailableItems;

    return unavailableItems.filter(item => {
      const med = String(item.medication_name || '').toLowerCase();
      const branch = String(item.branch_name || '').toLowerCase();
      return med.includes(q) || branch.includes(q);
    });
  }, [unavailableItems, searchQuery]);

  return (
    <div>
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
          <div className="outstock-search-bar" style={{ maxWidth: '480px' }}>
            <Search size={18} className="outstock-search-icon" />
            <input
              type="text"
              placeholder="🔍 ابحث بالدواء الناقص أو اسم الفرع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-search-input"
            />
          </div>

          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={fetchUnavailable}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>❌ أرشيف أصناف الأدوية غير المتوفرة بالسوق (نواقص معلقة)</span>
            <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: '800' }}>
              ({filteredItems.length} صنف عجز سوقي)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري فحص أرشيف النواقص...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>🎉</div>
            <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
              لا توجد أصناف غير متوفرة بالسوق حالياً
            </h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              كافة الأصناف المطلوبة إما تم توفيرها أو لم تسجل كعجز سوقي.
            </p>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>الفرع الطالب</th>
                  <th>صنف الدواء الناقص</th>
                  <th>الوحدة</th>
                  <th>عدد العملاء المنتظرين</th>
                  <th>إجمالي الكمية المطلوبة</th>
                  <th>إجراء التوفر وإشعار الصيدلية</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const key = `${item.branch_id}_${item.medication_name}`;
                  const isNotifying = isNotifyingKey === key;

                  return (
                    <tr key={idx} style={{ background: '#fef2f2' }}>
                      <td>
                        <span style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontWeight: '800',
                          fontSize: '12.5px',
                          color: '#0f766e'
                        }}>
                          <Building2 size={12} style={{ display: 'inline' }} /> {item.branch_name}
                        </span>
                      </td>

                      <td>
                        <strong style={{ fontSize: '14.5px', color: '#991b1b' }}>
                          {item.medication_name}
                        </strong>
                      </td>

                      <td>{item.unit_type === 'strip' ? 'شريط 💊' : 'علبة 📦'}</td>

                      <td>
                        <span className="outstock-badge unavailable" style={{ fontSize: '12px' }}>
                          <Users size={12} />
                          <span>{item.customers_waiting_count} عملاء</span>
                        </span>
                      </td>

                      <td>
                        <strong>{item.total_wanted_qty}</strong>
                      </td>

                      <td>
                        <button
                          type="button"
                          disabled={isNotifying}
                          className="outstock-btn outstock-btn-primary"
                          style={{ padding: '7px 16px', fontSize: '13px' }}
                          onClick={() => handleNotifyRestocked(item)}
                        >
                          <Send size={14} />
                          <span>{isNotifying ? 'جاري الإشعار...' : '🔄 أصبح متوفراً الآن بالسوق!'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة استرجاع بيانات العملاء بعد إشعار التوفر ── */}
      {restockedResult && (
        <div className="outstock-modal-backdrop" onClick={() => setRestockedResult(null)}>
          <div className="outstock-modal-panel" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-header">
              <h3>
                🎉 تم إشعار الفرع بتوفر الصنف: <strong>{restockedResult.medicationName}</strong>
              </h3>
              <button className="outstock-modal-close" onClick={() => setRestockedResult(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="outstock-modal-body">
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '10px',
                padding: '12px 16px',
                color: '#065f46',
                fontSize: '13.5px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle size={18} />
                <span>تم إرسال إشعار فوري لفرع ({restockedResult.branchName}) ليظهر بالفرع أن هذا الصنف أصبح متوفراً!</span>
              </div>

              <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#1e293b', marginTop: '6px' }}>
                بيانات العملاء الذين طلبوا هذا الصنف (ليتمكن الفرع من التواصل معهم فوراً):
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {restockedResult.waitingCustomers.map((cust, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '800', color: '#0f172a' }}>{cust.customerName || cust.full_name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>الكمية المطلوبة: {cust.requestedQuantity || cust.requested_quantity || 1}</div>
                    </div>

                    <a
                      href={`tel:${cust.customerPhone || cust.whatsapp_phone}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontSize: '13px',
                        fontWeight: '800',
                        textDecoration: 'none'
                      }}
                    >
                      <Phone size={13} />
                      <span dir="ltr">{cust.customerPhone || cust.whatsapp_phone}</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div className="outstock-modal-footer">
              <button type="button" className="outstock-btn outstock-btn-primary" onClick={() => setRestockedResult(null)}>
                تم وحفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
