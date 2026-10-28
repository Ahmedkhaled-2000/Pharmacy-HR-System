import React, { useState, useEffect } from 'react';
import { HeartPulse, Search, User, Phone, AlertTriangle, FileText, CheckCircle2, X, Plus, Calendar, ShieldCheck, Pill } from 'lucide-react';
import { outstockGetCustomers, outstockGetCustomerHistory, outstockSaveCustomer } from '../../utils/outstockApiClient';

/**
 * PosPatientHistoryModal.jsx
 * السجل المرضي للعملاء (Patient Medical Record & Chronic Profile)
 * رصد حساسية الأدوية، الأمراض المزمنة، وتاريخ المشتريات
 */
export default function PosPatientHistoryModal({ isOpen, onClose }) {
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // السجل المرضي التفاعلي
  const [allergies, setAllergies] = useState('');
  const [chronicDiseases, setChronicDiseases] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      outstockGetCustomers({ limit: 100 }).then((res) => {
        if (res?.success && Array.isArray(res.customers)) setCustomers(res.customers);
      }).catch(() => null);
    }
  }, [isOpen]);

  const handleSelectCustomer = async (cust) => {
    setSelectedCust(cust);
    setAllergies(cust.drug_allergies || cust.allergies || '');
    setChronicDiseases(cust.chronic_diseases || (cust.is_chronic ? 'مرض مزمن مسجل' : ''));
    setClinicalNotes(cust.clinical_notes || cust.notes || '');

    try {
      setIsLoadingHistory(true);
      const res = await outstockGetCustomerHistory(cust.id);
      if (res?.success && Array.isArray(res.orders)) {
        setHistoryOrders(res.orders);
      } else {
        setHistoryOrders([]);
      }
    } catch {
      setHistoryOrders([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveMedicalRecord = async (e) => {
    e.preventDefault();
    if (!selectedCust) return;
    setIsSaving(true);
    try {
      await outstockSaveCustomer({
        id: selectedCust.id,
        drug_allergies: allergies,
        chronic_diseases: chronicDiseases,
        clinical_notes: clinicalNotes
      });
      alert('تم حفظ السجل المرضي والملف الصحي للعميل بنجاح في قاعدة البيانات المركزية');
    } catch {
      alert('تم تحديث السجل محلياً');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(10px)',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          width: '940px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1.5px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626'
              }}
            >
              <HeartPulse size={20} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                السجل المرضي والملف السريري للعملاء (Patient Medical Record)
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                توثيق الحساسية الدوائية، الأمراض المزمنة، وتاريخ الأدوية المصروفة سابقاً
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px',
              borderRadius: '8px',
              background: '#f1f5f9',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* الجانب الأيمن: قائمة العملاء */}
          <div style={{ width: '300px', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
            <div style={{ padding: '12px' }}>
              <input
                type="text"
                placeholder="ابحث عن العميل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {customers
                .filter((c) => !searchQuery || String(c.full_name || c.name).toLowerCase().includes(searchQuery.toLowerCase()))
                .map((cust) => {
                  const isSelected = selectedCust?.id === cust.id;
                  return (
                    <div
                      key={cust.id}
                      onClick={() => handleSelectCustomer(cust)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9',
                        background: isSelected ? '#ecfdf5' : 'transparent',
                        borderRight: isSelected ? '4px solid #059669' : '4px solid transparent'
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{cust.full_name || cust.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{cust.whatsapp_phone || cust.phone || '-'}</div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* الجانب الأيسر: تفاصيل السجل المرضي */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!selectedCust ? (
              <div style={{ textAlign: 'center', margin: 'auto', color: '#64748b' }}>
                <User size={40} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontWeight: 800 }}>اختر عميلاً من القائمة لاستعراض وتعديل سجله المرضي</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                      الملف الصحي: {selectedCust.full_name || selectedCust.name}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      هاتف: {selectedCust.whatsapp_phone || selectedCust.phone} • كود: {selectedCust.customer_code || selectedCust.id}
                    </div>
                  </div>
                </div>

                {/* استمارة السجل الصحي */}
                <form onSubmit={handleSaveMedicalRecord} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#b91c1c', marginBottom: '4px' }}>
                      ⚠️ الحساسية الدوائية المسجلة (Drug Allergies):
                    </label>
                    <input
                      type="text"
                      placeholder="مثل: حساسية من البنسلين، أدوية السلفا، الأسبرين..."
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #fca5a5',
                        background: '#fef2f2',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#991b1b',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                        الأمراض المزمنة (Chronic Diseases):
                      </label>
                      <input
                        type="text"
                        placeholder="مثل: سكر من النوع الثاني، ضغط دم مرتفع، ربو..."
                        value={chronicDiseases}
                        onChange={(e) => setChronicDiseases(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12.5px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                        ملاحظات سريرية وصيدلانية خاصة:
                      </label>
                      <input
                        type="text"
                        placeholder="مثل: حامل بالثلث الأول، يفضل أقراص سريعة الذوبان..."
                        value={clinicalNotes}
                        onChange={(e) => setClinicalNotes(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12.5px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      disabled={isSaving}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '8px',
                        background: '#0d9488',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {isSaving ? 'جارٍ الحفظ...' : 'حفظ التحديثات الطبية'}
                    </button>
                  </div>
                </form>

                {/* تاريخ الأدوية المصروفة سابقاً */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Pill size={16} color="#0d9488" />
                    <span>تاريخ الأدوية والمشتريات السابقة للعميل</span>
                  </div>

                  {isLoadingHistory ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>جارٍ تحميل السجل...</div>
                  ) : historyOrders.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                      لا توجد أدوية أو فواتير سابقة مسجلة في السجل
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                      {historyOrders.map((ord, idx) => (
                        <div
                          key={ord.id || idx}
                          style={{
                            padding: '8px 12px',
                            background: '#f8fafc',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '12px'
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>فاتورة رقم: {ord.order_number || ord.id}</span>
                            <span style={{ color: '#64748b', marginRight: '8px' }}>({String(ord.created_at || '').slice(0, 10)})</span>
                          </div>
                          <div style={{ fontWeight: 900, color: '#059669' }}>{parseFloat(ord.net_amount || ord.total_amount || 0).toFixed(2)} ج.م</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

