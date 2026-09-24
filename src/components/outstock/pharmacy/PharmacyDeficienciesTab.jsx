import React, { useState, useEffect, useMemo } from 'react';
import { Search, AlertTriangle, Users, RotateCcw, Package, X, Phone, CheckCircle, RefreshCw } from 'lucide-react';
import { outstockGetDeficiencies, outstockReorderDeficiency, outstockGetBranchStock } from '../../../utils/outstockApiClient';
import OutstockConfirmModal from '../common/OutstockConfirmModal';

/**
 * PharmacyDeficienciesTab.jsx
 * شاشة أدوية النواقص والرصيد بالصيدلية
 * - تجميع أدوية النواقص والعملاء المنتظرين لكل صنف
 * - إمكانية إعادة طلب الصنف لصالح عميل وظهوره بطلبات العملاء
 * - متابعة رصيد الأصناف المتوفرة المستلمة من المشتريات
 */
export default function PharmacyDeficienciesTab({ branchId, currentPharmacist = '', showToast }) {
  const [deficiencies, setDeficiencies] = useState([]);
  const [branchStock, setBranchStock] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMedForCustomers, setSelectedMedForCustomers] = useState(null);
  const [isReorderingId, setIsReorderingId] = useState(null);

  const fetchDeficienciesData = async () => {
    setIsLoading(true);
    try {
      const [defRes, stockRes] = await Promise.all([
        outstockGetDeficiencies({ branchId }),
        outstockGetBranchStock(branchId)
      ]);

      if (defRes?.success && Array.isArray(defRes.deficiencies)) {
        setDeficiencies(defRes.deficiencies);
      }
      if (stockRes?.success && Array.isArray(stockRes.stock)) {
        setBranchStock(stockRes.stock);
      }
    } catch (e) {
      console.warn('Fetch deficiencies error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (branchId) fetchDeficienciesData();
  }, [branchId]);

  // حالة نافذة تأكيد إعادة طلب الصنف
  const [reorderConfirmData, setReorderConfirmData] = useState(null);

  // إعادة طلب الصنف لصالح عميل
  const handleReorder = (deficiencyId, customerName, medName = '') => {
    setReorderConfirmData({
      deficiencyId,
      customerName,
      medName: medName || selectedMedForCustomers?.medication_name || 'الدواء'
    });
  };

  const executeReorder = async () => {
    if (!reorderConfirmData) return;
    const { deficiencyId, customerName } = reorderConfirmData;
    setIsReorderingId(deficiencyId);

    try {
      const res = await outstockReorderDeficiency(deficiencyId, currentPharmacist);
      if (res?.success) {
        showToast?.(`✅ تم إعادة طلب الصنف للعميل (${customerName}) وإرساله للمشتريات بنجاح`);
        fetchDeficienciesData();
        setSelectedMedForCustomers(null);
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر إعادة الطلب'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء إعادة طلب الصنف');
    } finally {
      setIsReorderingId(null);
      setReorderConfirmData(null);
    }
  };

  // فلترة النواقص بالبحث
  const filteredDeficiencies = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return deficiencies;

    return deficiencies.filter(d => {
      const med = String(d.medication_name || '').toLowerCase();
      const hasCust = (d.customers || []).some(c => {
        const name = String(c.customerName || '').toLowerCase();
        const phone = String(c.customerPhone || '').toLowerCase();
        return name.includes(q) || phone.includes(q);
      });
      return med.includes(q) || hasCust;
    });
  }, [deficiencies, searchQuery]);

  return (
    <div>
      {/* ── ملخص رصيد أصناف النواقص بالفرع ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={17} />
            <span>رصيد الأصناف المتوفرة بالفرع (المستلمة من المشتريات وجاهزة للتسليم)</span>
          </h4>
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            style={{ padding: '5px 12px', fontSize: '12px' }}
            onClick={fetchDeficienciesData}
          >
            <RefreshCw size={13} />
            <span>تحديث</span>
          </button>
        </div>

        {branchStock.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            لا يوجد رصيد أصناف محتجز حالياً، يتم شحن الأصناف تلقائياً فور توفيرها من إدارة المشتريات.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {branchStock.map((stk, idx) => (
              <div
                key={idx}
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <div>
                  <strong style={{ color: '#166534', fontSize: '13px' }}>{stk.medication_name}</strong>
                  <div style={{ fontSize: '11px', color: '#15803d' }}>
                    الرصيد المتاح: <strong>{stk.available_quantity}</strong> {stk.unit_type === 'strip' ? 'شريط' : 'علبة'}
                  </div>
                </div>
                <span className="outstock-badge ready" style={{ fontSize: '11px' }}>جاهز للتسليم</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── شريط البحث ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div className="outstock-search-bar" style={{ maxWidth: '520px' }}>
          <Search size={18} className="outstock-search-icon" />
          <input
            type="text"
            placeholder="🔍 ابحث بالصنف، رقم هاتف العميل، أو اسمه..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="outstock-search-input"
          />
        </div>
      </div>

      {/* ── جدول أدوية النواقص والعملاء المرتبطين ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>⚠️ دليل أدوية النواقص والعملاء المنتظرين</span>
            <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: '800' }}>
              ({filteredDeficiencies.length} صنف ناقص بالسوق)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري فحص قائمة النواقص...
          </div>
        ) : filteredDeficiencies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            لا توجد أدوية نواقص مسجلة حالياً
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>صنف الدواء الناقص</th>
                  <th>الوحدة</th>
                  <th>عدد العملاء الراغبين</th>
                  <th>إجمالي الكمية المطلوبة</th>
                  <th>الرصيد الحالي بالفرع</th>
                  <th>قائمة العملاء والإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeficiencies.map((def, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                        {def.medication_name}
                      </strong>
                    </td>
                    <td>{def.unit_type === 'strip' ? 'شريط 💊' : 'علبة 📦'}</td>
                    <td>
                      <span className="outstock-badge unavailable" style={{ fontSize: '12px' }}>
                        <Users size={12} />
                        <span>{def.requests_count} عملاء</span>
                      </span>
                    </td>
                    <td><strong>{def.total_qty}</strong></td>
                    <td>
                      {def.current_branch_stock > 0 ? (
                        <span style={{ color: '#16a34a', fontWeight: '900' }}>
                          {def.current_branch_stock} متوفر
                        </span>
                      ) : (
                        <span style={{ color: '#dc2626' }}>0 (نفد تماماً)</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="outstock-btn outstock-btn-secondary"
                        style={{ padding: '6px 14px', fontSize: '12.5px' }}
                        onClick={() => setSelectedMedForCustomers(def)}
                      >
                        <Users size={14} />
                        <span>عرض العملاء ({def.requests_count}) وإعادة الطلب</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة استعراض العملاء الذين طلبوا هذا الصنف مع إمكانية إعادة الطلب ── */}
      {selectedMedForCustomers && (
        <div className="outstock-modal-backdrop" onClick={() => setSelectedMedForCustomers(null)}>
          <div className="outstock-modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>
                📋 العملاء الذين طلبوا صنف: <strong>{selectedMedForCustomers.medication_name}</strong>
              </h3>
              <button className="outstock-modal-close" onClick={() => setSelectedMedForCustomers(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="outstock-modal-body">
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                هؤلاء العملاء طلبوا هذا الصنف مسبقاً وتم شطبه لعدم التوفر بالسوق. يمكنك الآن إعادة طلب الصنف لصالح العميل لإرساله مجدداً للمشتريات:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(selectedMedForCustomers.customers || []).map(cust => (
                  <div
                    key={cust.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '900', fontSize: '14.5px', color: '#0f172a' }}>
                        {cust.customerName}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Phone size={12} />
                        <span dir="ltr">{cust.customerPhone}</span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                        الكمية: {cust.requestedQuantity} {selectedMedForCustomers.unit_type === 'strip' ? 'شريط' : 'علبة'} • تاريخ الطلب الأول: {new Date(cust.createdAt).toLocaleDateString('ar-EG')}
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        disabled={isReorderingId === cust.id}
                        className="outstock-btn outstock-btn-primary"
                        style={{ padding: '7px 14px', fontSize: '12.5px' }}
                        onClick={() => handleReorder(cust.id, cust.customerName)}
                      >
                        <RotateCcw size={14} />
                        <span>{isReorderingId === cust.id ? 'جاري إعادة الطلب...' : 'إعادة طلب الصنف للعميل'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="outstock-modal-footer">
              <button type="button" className="outstock-btn outstock-btn-secondary" onClick={() => setSelectedMedForCustomers(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة تأكيد إعادة طلب الصنف للعميل ── */}
      <OutstockConfirmModal
        isOpen={Boolean(reorderConfirmData)}
        title="تأكيد إعادة طلب الصنف للعميل"
        message={`هل تريد إعادة طلب الصنف (${reorderConfirmData?.medName}) لصالح العميل (${reorderConfirmData?.customerName}) وإرساله لإدارة المشتريات من جديد؟`}
        iconType="send"
        confirmText="نعم، إعادة الطلب الآن"
        cancelText="تراجع"
        confirmBtnStyle="primary"
        badge={reorderConfirmData?.medName}
        details={reorderConfirmData ? [
          { label: 'اسم العميل', value: reorderConfirmData.customerName },
          { label: 'الصنف المطلوب', value: reorderConfirmData.medName },
          { label: 'الإجراء', value: 'إعادة إدراج الصنف في قائمة طلبات العملاء النشطة للمشتريات' }
        ] : null}
        isProcessing={Boolean(isReorderingId)}
        onConfirm={executeReorder}
        onClose={() => setReorderConfirmData(null)}
      />
    </div>
  );
}
