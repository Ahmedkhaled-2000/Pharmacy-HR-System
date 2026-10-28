import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Plus, Search, Calendar, CheckCircle2, X, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react';
import { stockLogScrap, stockSearchMedications } from '../../utils/stockApiClient';
import PosEmployeeActionAuthModal from './PosEmployeeActionAuthModal';

/**
 * PosScrapStockModal.jsx
 * مخزون هوالك وتوالف الفرع وتسجيل إتلاف الأدوية المنتهية أو التالفة
 * يتطلب توثيق كود الموظف بنظام الـ HR لحماية المخزون
 */
export default function PosScrapStockModal({ isOpen, onClose }) {
  const [scrapList, setScrapList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // حقول نموذج الإضافة
  const [searchMed, setSearchMed] = useState('');
  const [medResults, setMedResults] = useState([]);
  const [selectedMed, setSelectedMed] = useState(null);
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('expired'); // 'expired' | 'damaged' | 'broken' | 'recall'
  const [notes, setNotes] = useState('');

  // نافذة توثيق كود الموظف
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  const loadScraps = () => {
    try {
      const local = localStorage.getItem('pharma_branch_scrap_log');
      if (local) setScrapList(JSON.parse(local));
    } catch {}
  };

  useEffect(() => {
    if (isOpen) loadScraps();
  }, [isOpen]);

  // البحث عن الدواء المراد إتلافه
  useEffect(() => {
    if (!searchMed.trim() || selectedMed) return;
    const timer = setTimeout(async () => {
      try {
        const res = await stockSearchMedications({ q: searchMed.trim() });
        if (res?.success && Array.isArray(res.medications)) {
          setMedResults(res.medications.slice(0, 8));
        }
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [searchMed, selectedMed]);

  const handleSelectMed = (med) => {
    setSelectedMed(med);
    setSearchMed(med.trade_name_ar || med.name);
    setMedResults([]);
  };

  const handleInitiateScrap = (e) => {
    e.preventDefault();
    if (!selectedMed) {
      alert('يرجى اختيار الصنف أولاً');
      return;
    }
    const payload = {
      medication_id: selectedMed.id,
      medication_name: selectedMed.trade_name_ar || selectedMed.name,
      batch_number: batchNo || 'NA',
      expiry_date: expiryDate,
      quantity: parseFloat(quantity) || 1,
      reason,
      notes
    };
    setPendingPayload(payload);
    setIsAuthModalOpen(true);
  };

  const handleEmployeeVerified = async (employee) => {
    if (!pendingPayload) return;
    const finalItem = {
      ...pendingPayload,
      id: `scrap_${Date.now()}`,
      created_at: new Date().toISOString(),
      authorized_by_code: employee.code,
      authorized_by_name: employee.name
    };

    try {
      await stockLogScrap(finalItem).catch(() => null);
    } catch {}

    const updated = [finalItem, ...scrapList];
    setScrapList(updated);
    try {
      localStorage.setItem('pharma_branch_scrap_log', JSON.stringify(updated));
    } catch {}

    setIsAddOpen(false);
    setSelectedMed(null);
    setSearchMed('');
    setBatchNo('');
    setExpiryDate('');
    setQuantity(1);
    setNotes('');
    alert(`تم تسجيل إتلاف وهالك الصنف بنجاح وتوثيقه باسم: ${employee.name}`);
  };

  if (!isOpen) return null;

  return (
    <>
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
            width: '880px',
            maxWidth: '95vw',
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
                <ShieldAlert size={20} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                  مخزون هوالك وتوالف الفرع والرقابة على الإتلاف
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                  حصر وتوثيق الأدوية منتهية الصلاحية والتالفة بكود الموظف
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsAddOpen((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '9px',
                  background: isAddOpen ? '#fee2e2' : '#dc2626',
                  color: isAddOpen ? '#b91c1c' : '#ffffff',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <Plus size={15} />
                <span>{isAddOpen ? 'إلغاء الإضافة' : '+ تسجيل إتلاف جديد'}</span>
              </button>

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
          </div>

          {/* New Scrap Form */}
          {isAddOpen && (
            <form
              onSubmit={handleInitiateScrap}
              style={{
                padding: '16px 22px',
                background: '#fff1f2',
                borderBottom: '1.5px solid #fecdd3',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                animation: 'posFadeIn 0.15s ease'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '10px' }}>
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#9f1239', marginBottom: '4px' }}>
                    اختر الصنف المراد إتلافه:
                  </label>
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الباركود..."
                    value={searchMed}
                    onChange={(e) => {
                      setSearchMed(e.target.value);
                      if (selectedMed) setSelectedMed(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                  {medResults.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        left: 0,
                        background: '#ffffff',
                        border: '1px solid #fca5a5',
                        borderRadius: '8px',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                        zIndex: 100,
                        maxHeight: '160px',
                        overflowY: 'auto'
                      }}
                    >
                      {medResults.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => handleSelectMed(m)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            borderBottom: '1px solid #f1f5f9'
                          }}
                        >
                          <strong>{m.trade_name_ar || m.name}</strong>
                          <span style={{ color: '#64748b', marginRight: '6px' }}>({m.trade_name_en})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#9f1239', marginBottom: '4px' }}>
                    رقم التشغيلة:
                  </label>
                  <input
                    type="text"
                    placeholder="رقم التشغيلة..."
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#9f1239', marginBottom: '4px' }}>
                    تاريخ الصلاحية:
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#9f1239', marginBottom: '4px' }}>
                    الكمية التالفة:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '10px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#9f1239', marginBottom: '4px' }}>
                    سبب الإتلاف:
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      fontSize: '12px',
                      outline: 'none',
                      fontWeight: 700
                    }}
                  >
                    <option value="expired">منتهي الصلاحية (Expired)</option>
                    <option value="damaged">تالف أو عيب تصنيع</option>
                    <option value="broken">كسر بالصيدلية</option>
                    <option value="recall">منشور سحب من وزارة الصحة</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#9f1239', marginBottom: '4px' }}>
                    ملاحظات الإتلاف:
                  </label>
                  <input
                    type="text"
                    placeholder="سبب إضافي أو رقم المحضر..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <UserCheck size={15} />
                  <span>توثيق وإتلاف [بكود الموظف]</span>
                </button>
              </div>
            </form>
          )}

          {/* Scrap List Table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
            {scrapList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <CheckCircle2 size={36} color="#86efac" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontWeight: 800 }}>لا توجد هوالك أو توالف مسجلة في الفرع حالياً</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#475569', fontWeight: 800 }}>
                    <th style={{ padding: '10px' }}>اسم الصنف</th>
                    <th style={{ padding: '10px' }}>التشغيلة</th>
                    <th style={{ padding: '10px' }}>تاريخ الصلاحية</th>
                    <th style={{ padding: '10px' }}>الكمية</th>
                    <th style={{ padding: '10px' }}>السبب</th>
                    <th style={{ padding: '10px' }}>الموظف المعتمد</th>
                    <th style={{ padding: '10px' }}>تاريخ التسجيل</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapList.map((row, idx) => (
                    <tr key={row.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 800, color: '#0f172a' }}>{row.medication_name}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>{row.batch_number || '-'}</td>
                      <td style={{ padding: '10px', color: '#b91c1c', fontWeight: 700 }}>{row.expiry_date || '-'}</td>
                      <td style={{ padding: '10px', fontWeight: 900, color: '#dc2626' }}>{row.quantity}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c', fontSize: '11px', fontWeight: 800 }}>
                          {row.reason === 'expired' ? 'منتهي الصلاحية' : row.reason === 'damaged' ? 'تالف' : row.reason === 'broken' ? 'كسر' : 'منشور سحب'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', fontWeight: 700, color: '#0d9488' }}>
                        {row.authorized_by_name} ({row.authorized_by_code})
                      </td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{String(row.created_at || '').slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal توثيق الموظف */}
      <PosEmployeeActionAuthModal
        isOpen={isAuthModalOpen}
        actionTitle="توثيق تسجيل إتلاف وهالك بالفرع"
        actionSubtitle="يرجى إدخال كود الموظف المسئول بنظام الـ HR لاعتماد خصم الهالك من العهدة"
        actionType="scrap"
        onVerified={handleEmployeeVerified}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
}

