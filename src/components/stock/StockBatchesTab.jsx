import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Warehouse,
  Plus,
  Printer,
  X,
  Tag,
  Calendar,
  Building2
} from 'lucide-react';
import {
  stockSearchMedications,
  stockAddBranchBatch
} from '../../utils/stockApiClient';
import { printThermalLabels, generatePharmaFlyBarcode } from '../../utils/labelPrintService';

export default function StockBatchesTab({
  batches = [],
  locations = [],
  isLoading = false,
  onToggleQuarantine,
  onBatchAdded = () => {},
  showToast = () => {}
}) {
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('all'); // 'all' | 'expired' | '30' | '90' | '180'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'quarantined'

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [medSearchQuery, setMedSearchQuery] = useState('');
  const [medSearchResults, setMedSearchResults] = useState([]);
  const [selectedMed, setSelectedMed] = useState(null);

  const [batchForm, setBatchForm] = useState({
    location_id: locations[0]?.id || '',
    batch_number: '',
    expiry_date: '',
    quantity: '10',
    cost_price: '0',
    public_price: '0'
  });

  // البحث السريع عن الأدوية بالاسم بأول 3 حروف داخل المودال
  useEffect(() => {
    const clean = medSearchQuery.trim();
    if (clean.length < 2) {
      setMedSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await stockSearchMedications({ q: clean });
        if (res?.success) {
          setMedSearchResults(res.medications || []);
        }
      } catch (err) {
        console.warn('Med search err:', err);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [medSearchQuery]);

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (selectedLocation && b.location_id !== selectedLocation) return false;

      const days = parseInt(b.days_to_expire !== undefined ? b.days_to_expire : 9999, 10);
      if (expiryFilter === 'expired' && days >= 0) return false;
      if (expiryFilter === '30' && (days < 0 || days > 30)) return false;
      if (expiryFilter === '90' && (days < 0 || days > 90)) return false;
      if (expiryFilter === '180' && (days < 0 || days > 180)) return false;

      if (statusFilter === 'quarantined' && !b.is_quarantined) return false;
      if (statusFilter === 'active' && b.is_quarantined) return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const medName = String(b.med_name || '').toLowerCase();
      const batchNo = String(b.batch_number || '').toLowerCase();
      const barcode = String(b.barcode || '').toLowerCase();

      return medName.includes(q) || batchNo.includes(q) || barcode.includes(q);
    });
  }, [batches, search, selectedLocation, expiryFilter, statusFilter]);

  const handleSelectMedForBatch = (m) => {
    setSelectedMed(m);
    setBatchForm(prev => ({
      ...prev,
      cost_price: String(m.cost_price || (m.public_price * 0.75).toFixed(2)),
      public_price: String(m.public_price || 0)
    }));
    setMedSearchResults([]);
    setMedSearchQuery('');
  };

  const handleSaveBatchEntry = async (e) => {
    e.preventDefault();
    if (!selectedMed) {
      showToast('يرجى اختيار الصنف الدوائي أولاً', 'warning');
      return;
    }
    if (!batchForm.location_id || !batchForm.batch_number || !batchForm.expiry_date || !batchForm.quantity) {
      showToast('يرجى ملء جميع الحقول الإلزامية', 'warning');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await stockAddBranchBatch({
        location_id: batchForm.location_id,
        medication_id: selectedMed.id,
        batch_number: batchForm.batch_number.trim(),
        expiry_date: batchForm.expiry_date,
        quantity: parseFloat(batchForm.quantity),
        cost_price: parseFloat(batchForm.cost_price || 0),
        public_price: parseFloat(batchForm.public_price || 0)
      });

      if (res?.success) {
        showToast('تمت إضافة رصيد التشغيلة للفرع بنجاح! 📦', 'success');
        setIsAddModalOpen(false);
        setSelectedMed(null);
        onBatchAdded?.();
      } else {
        showToast(res?.error || 'فشل حفظ التشغيلة', 'error');
      }
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء حفظ التشغيلة', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="stock-grid-wrapper">
      {/* ── شريط أدوات البحث وفلاتر الصلاحية ── */}
      <div className="stock-grid-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
          <div className="stock-search-input-box">
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="ابحث باسم الصنف الدوائي، رقم التشغيلة، أو الباركود..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="stock-select-filter"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">🏢 كافة المستودعات والفروع</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name_ar || loc.name}
              </option>
            ))}
          </select>

          <select
            className="stock-select-filter"
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value)}
          >
            <option value="all">⏳ كافة تواريخ الصلاحية</option>
            <option value="expired">🚫 منتهية الصلاحية تماماً</option>
            <option value="30">⚡ قريبة الانتهاء (أقل من 30 يوماً)</option>
            <option value="90">⚠️ قريبة الانتهاء (أقل من 90 يوماً)</option>
            <option value="180">📅 قريبة الانتهاء (أقل من 180 يوماً)</option>
          </select>

          <select
            className="stock-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">🛡️ كافة الحالات</option>
            <option value="active">✅ تشغيلات نشطة ومتاحة</option>
            <option value="quarantined">🛑 تشغيلات محجورة احترازياً</option>
          </select>

          <button
            type="button"
            className="stock-quick-action-btn primary"
            onClick={() => setIsAddModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} />
            <span>إضافة رصيد تشغيلة للفرع</span>
          </button>
        </div>

        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          التشغيلات المطابقة: <strong>{filteredBatches.length}</strong>
        </div>
      </div>

      {/* ── جدول التشغيلات FEFO ── */}
      <div className="stock-table-container">
        <table className="stock-data-table">
          <thead>
            <tr>
              <th>الصنف الدوائي</th>
              <th>رقم التشغيلة</th>
              <th>المستودع / الفرع</th>
              <th>تاريخ الصلاحية</th>
              <th>الأيام المتبقية</th>
              <th>الكمية المتبقية</th>
              <th>سعر التكلفة</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  جاري فحص التشغيلات وتواريخ الصلاحية...
                </td>
              </tr>
            ) : filteredBatches.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  لا توجد تشغيلات مطابقة للبحث.
                </td>
              </tr>
            ) : (
              filteredBatches.map((batch) => {
                const days = parseInt(batch.days_to_expire !== undefined ? batch.days_to_expire : 9999, 10);
                const isExpired = days < 0;
                const isNearUrgent = days >= 0 && days <= 30;
                const isNearWarning = days > 30 && days <= 90;
                const qty = parseFloat(batch.quantity_base || batch.quantity_on_hand || 0);

                return (
                  <tr
                    key={batch.id}
                    className={batch.is_quarantined || isExpired ? 'row-danger' : isNearUrgent ? 'row-warning' : ''}
                  >
                    <td>
                      <div style={{ fontWeight: 800 }}>{batch.med_name || batch.trade_name_ar || 'صنف دوائي'}</div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>{batch.barcode || batch.label_barcode || '—'}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          color: '#0f766e',
                          background: '#f0fdfa',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid #ccfbf1'
                        }}
                      >
                        {batch.batch_number || 'DEFAULT'}
                      </span>
                    </td>
                    <td>{batch.location_name || batch.name_ar || 'المستودع الرئيسي'}</td>
                    <td style={{ fontWeight: 800 }}>
                      {batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : '—'}
                    </td>
                    <td>
                      {isExpired ? (
                        <span className="stock-badge danger">
                          منتهية منذ {Math.abs(days)} يوم
                        </span>
                      ) : isNearUrgent ? (
                        <span className="stock-badge danger">
                          متبقي {days} يوم فقط!
                        </span>
                      ) : isNearWarning ? (
                        <span className="stock-badge warning">
                          متبقي {days} يوم
                        </span>
                      ) : (
                        <span className="stock-badge success">
                          متبقي {days} يوم
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        fontWeight: 900,
                        direction: 'ltr',
                        textAlign: 'right',
                        fontSize: '13px',
                        color: qty > 0 ? '#0f766e' : '#94a3b8'
                      }}
                    >
                      {qty.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ direction: 'ltr', textAlign: 'right' }}>
                      {parseFloat(batch.cost_price || 0).toFixed(2)} ج
                    </td>
                    <td>
                      {batch.is_quarantined ? (
                        <span className="stock-badge danger">🛑 محجورة وممنوعة من الصرف</span>
                      ) : isExpired ? (
                        <span className="stock-badge danger">🚫 منتهية الصلاحية</span>
                      ) : (
                        <span className="stock-badge success">✅ صالحة ومطابقة</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="stock-menu-trigger-btn"
                          style={{ padding: '3px 8px', fontSize: '11px', color: '#0f766e' }}
                          title="طباعة ملصق الباركود لهذه التشغيلة"
                          onClick={() => {
                            printThermalLabels([{
                              medication_id: batch.medication_id,
                              trade_name_ar: batch.med_name || batch.trade_name_ar,
                              public_price: batch.public_price,
                              batch_number: batch.batch_number,
                              expiry_date: batch.expiry_date,
                              label_barcode: batch.label_barcode || `P${batch.medication_id}-${batch.batch_number}`,
                              quantity: 1
                            }]);
                            showToast('جاري طباعة ملصق التشغيلة...', 'success');
                          }}
                        >
                          <Printer size={12} />
                          <span>ملصق</span>
                        </button>

                        <button
                          type="button"
                          className={`stock-quick-action-btn ${batch.is_quarantined ? 'primary' : 'warning'}`}
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          onClick={() => onToggleQuarantine?.(batch.id, !batch.is_quarantined)}
                        >
                          {batch.is_quarantined ? (
                            <>
                              <ShieldCheck size={12} />
                              <span>إلغاء الحجر</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert size={12} />
                              <span>حجر</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Add Batch Balance to Branch */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
          direction: 'rtl',
          fontFamily: "'Cairo', Tahoma, sans-serif"
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '16px 20px', background: '#0f766e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                إضافة رصيد تشغيلة وصلاحية لفرع (FEFO)
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBatchEntry} style={{ padding: '20px' }}>
              {/* Select Location */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  اختر الفرع / المستودع المستهدف:
                </label>
                <select
                  value={batchForm.location_id}
                  onChange={(e) => setBatchForm({ ...batchForm, location_id: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  required
                >
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name_ar || loc.name} ({loc.location_type === 'central_warehouse' ? 'مخزن رئيسي' : 'فرع صيدلية'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Medicine Search */}
              <div style={{ position: 'relative', marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  ابحث عن الصنف الدوائي (بأول 3 حروف):
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="اكتب اسم الدواء بالعربي أو الإنجليزي (أوج / Aug / Pan)..."
                    value={selectedMed ? `${selectedMed.trade_name_ar} (${selectedMed.trade_name_en})` : medSearchQuery}
                    onChange={(e) => {
                      setSelectedMed(null);
                      setMedSearchQuery(e.target.value);
                    }}
                    style={{ width: '100%', padding: '9px 36px 9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  {selectedMed && (
                    <button
                      type="button"
                      onClick={() => { setSelectedMed(null); setMedSearchQuery(''); }}
                      style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {medSearchResults.length > 0 && !selectedMed && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    left: 0,
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    marginTop: '4px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    zIndex: 10
                  }}>
                    {medSearchResults.map(m => (
                      <div
                        key={m.id}
                        onClick={() => handleSelectMedForBatch(m)}
                        style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                      >
                        <div>
                          <strong>{m.trade_name_ar}</strong>
                          <span style={{ color: '#64748b', fontSize: '11px', marginRight: '6px' }}>({m.trade_name_en})</span>
                        </div>
                        <div style={{ color: '#0f766e', fontWeight: 800 }}>{m.public_price} ج.م</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Batch number and expiry date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    رقم التشغيلة (Batch Number) *
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 24B10"
                    value={batchForm.batch_number}
                    onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    تاريخ الصلاحية (YYYY-MM) *
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 2027-08"
                    value={batchForm.expiry_date}
                    onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              {/* Quantity, Cost and Public Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    الكمية (العلب) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={batchForm.quantity}
                    onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    سعر التكلفة (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={batchForm.cost_price}
                    onChange={(e) => setBatchForm({ ...batchForm, cost_price: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    سعر الجمهور (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={batchForm.public_price}
                    onChange={(e) => setBatchForm({ ...batchForm, public_price: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#0f766e', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: isSubmitting ? 'wait' : 'pointer' }}
                >
                  {isSubmitting ? 'جاري الحفظ...' : 'إضافة الرصيد للفرع وتوليد الباركود'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
