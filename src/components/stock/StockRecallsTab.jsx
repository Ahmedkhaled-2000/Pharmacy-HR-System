import React, { useState } from 'react';
import {
  AlertTriangle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Building,
  Truck,
  CheckCircle2,
  Clock,
  Layers,
  FileWarning,
  Lock,
  Unlock,
  RefreshCw
} from 'lucide-react';
import { stockSearchRecalls, stockQuarantineBatch, stockUnquarantineBatch } from '../../utils/stockApiClient';

export default function StockRecallsTab({
  locations = [],
  showToast,
  onBatchStatusChanged
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  // حالة نافذة تأكيد الحجر
  const [selectedBatchForQuarantine, setSelectedBatchForQuarantine] = useState(null);
  const [quarantineReason, setQuarantineReason] = useState('منشور رقابي صادر من هيئة الدواء المصرية (EDA)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // تنفيذ البحث
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const cleanQ = searchQuery.trim();
    if (!cleanQ) {
      showToast?.('يرجى إدخال رقم التشغيلة أو اسم الدواء أو الباركود للبحث', 'warning');
      return;
    }

    try {
      setIsSearching(true);
      const res = await stockSearchRecalls(cleanQ);
      if (res?.success) {
        setSearchResults(res.results || []);
        setHasSearched(true);
      } else {
        showToast?.(res?.error || 'فشل البحث عن التشغيلة', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'حدث خطأ أثناء فحص سجلات التشغيلات', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  // فتح نافذة تأكيد الحجر
  const handleOpenQuarantineModal = (batch) => {
    setSelectedBatchForQuarantine(batch);
    setQuarantineReason(`منشور تحذيري رقابي من هيئة الدواء للتشغيلة #${batch.batch_number}`);
  };

  // تنفيذ الحجر الفوري
  const handleExecuteQuarantine = async () => {
    if (!selectedBatchForQuarantine) return;
    try {
      setIsSubmitting(true);
      const res = await stockQuarantineBatch({
        batchId: selectedBatchForQuarantine.batch_id,
        batchNumber: selectedBatchForQuarantine.batch_number,
        medicationId: selectedBatchForQuarantine.medication_id,
        reason: quarantineReason
      });

      if (res?.success) {
        showToast?.(res.message || 'تم حجر التشغيلة فوراً وتجميدها بكافة الفروع', 'success');
        setSelectedBatchForQuarantine(null);
        // تحديث النتيجة في القائمة المحلية
        setSearchResults(prev =>
          prev.map(b =>
            b.batch_id === selectedBatchForQuarantine.batch_id
              ? { ...b, is_quarantined: true }
              : b
          )
        );
        if (onBatchStatusChanged) onBatchStatusChanged();
      } else {
        showToast?.(res?.error || 'فشل فرض الحجر', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'حدث خطأ أثناء فرض الحجر', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // رفع الحجر
  const handleReleaseQuarantine = async (batch) => {
    if (!window.confirm(`هل أنت متأكد من إلغاء الحجر عن التشغيلة #${batch.batch_number} وإعادتها للصرف والبيع؟`)) {
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await stockUnquarantineBatch({
        batchId: batch.batch_id,
        batchNumber: batch.batch_number,
        reason: 'إلغاء الحجر بعد مطابقة الفحص الفني والموافقة الرسمية'
      });

      if (res?.success) {
        showToast?.(res.message || 'تم رفع الحجر عن التشغيلة بنجاح', 'success');
        setSearchResults(prev =>
          prev.map(b =>
            b.batch_id === batch.batch_id
              ? { ...b, is_quarantined: false }
              : b
          )
        );
        if (onBatchStatusChanged) onBatchStatusChanged();
      } else {
        showToast?.(res?.error || 'فشل رفع الحجر', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'حدث خطأ أثناء رفع الحجر', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="stock-recalls-container">
      {/* ── الرأس التعريفي والتحذيري ── */}
      <div className="stock-recall-header-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="stock-recall-icon-badge">
            <ShieldAlert size={26} color="#ef4444" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--stock-text-main)' }}>
              نظام الاستدعاء الدوائي وتتبع وحجر التشغيلات (Drug Recall & Batch Tracer)
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--stock-text-muted)' }}>
              محرك رقابي فوري متوافق مع معايير هيئة الدواء المصرية (EDA). يتيح تتبع أي تشغيلة عبر المخزن الرئيسي وكافة الفروع وعربات النقل وفرض الحجر الفوري الشامل لمنع بيعها بنقاط البيع فوراً.
            </p>
          </div>
        </div>
      </div>

      {/* ── شريط البحث السريع عن التشغيلة ── */}
      <div className="stock-card" style={{ marginBottom: '20px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '300px' }}>
            <Search
              size={18}
              style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--stock-text-muted)' }}
            />
            <input
              type="text"
              className="stock-input"
              style={{ width: '100%', paddingRight: '42px', height: '44px', fontSize: '14px', fontWeight: 600 }}
              placeholder="ابحث برقم التشغيلة (Batch No)، أو اسم الصنف، أو الباركود الدولي..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="stock-quick-action-btn primary"
            disabled={isSearching}
            style={{ height: '44px', padding: '0 24px', fontSize: '14px' }}
          >
            {isSearching ? <RefreshCw size={16} className="spin-animate" /> : <Search size={16} />}
            <span>فحص وتتبع التشغيلة</span>
          </button>
        </form>
      </div>

      {/* ── عرض نتائج البحث ── */}
      {hasSearched && (
        <div className="stock-recall-results-section">
          {searchResults.length === 0 ? (
            <div className="stock-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <CheckCircle2 size={42} color="#10b981" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: 'var(--stock-text-main)' }}>
                لم يتم العثور على تشغيلات مطابقة للبحث
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--stock-text-muted)' }}>
                تأكد من كتابة رقم التشغيلة بدقة، أو ابحث باسم الدواء التجاري.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--stock-text-main)' }}>
                  تم العثور على {searchResults.length} تشغيلة مطابقة:
                </span>
              </div>

              {searchResults.map((batch) => {
                const isQuarantined = batch.is_quarantined;
                return (
                  <div
                    key={batch.batch_id}
                    className="stock-card"
                    style={{
                      borderLeft: isQuarantined ? '5px solid #ef4444' : '5px solid #10b981',
                      padding: '20px'
                    }}
                  >
                    {/* رأس بطاقة التشغيلة */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '17px', fontWeight: 900, color: 'var(--stock-text-main)' }}>
                            {batch.trade_name_ar}
                          </span>
                          <span style={{ fontSize: '13px', color: 'var(--stock-text-muted)' }}>
                            ({batch.trade_name_en || 'EDA Catalog'})
                          </span>
                          <span className={`stock-status-chip ${isQuarantined ? 'danger' : 'success'}`}>
                            {isQuarantined ? 'محظورة / قيد الحجر الرقابي 🚫' : 'سليمة ومتاحة للصرف ✅'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '13px', color: 'var(--stock-text-muted)' }}>
                          <span>رقم التشغيلة: <strong style={{ color: 'var(--stock-text-main)' }}>{batch.batch_number}</strong></span>
                          <span>تاريخ الصلاحية: <strong style={{ color: '#0284c7' }}>{batch.expiry_date}</strong></span>
                          <span>سعر البيع: <strong>{batch.public_price} ج</strong></span>
                          <span>سعر التكلفة: <strong>{batch.cost_price} ج</strong></span>
                          <span>إجمالي الكمية المتوفرة: <strong style={{ color: '#059669', fontSize: '14px' }}>{batch.total_quantity} {batch.unit_type || 'عبوة'}</strong></span>
                        </div>
                      </div>

                      {/* زر الإجراء: حجر أو إلغاء الحجر */}
                      <div>
                        {isQuarantined ? (
                          <button
                            type="button"
                            className="stock-quick-action-btn outline"
                            onClick={() => handleReleaseQuarantine(batch)}
                            disabled={isSubmitting}
                            style={{ borderColor: '#10b981', color: '#10b981' }}
                          >
                            <Unlock size={14} />
                            <span>رفع الحجر والترخيص للصرف</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="stock-quick-action-btn danger"
                            onClick={() => handleOpenQuarantineModal(batch)}
                            disabled={isSubmitting}
                            style={{ backgroundColor: '#ef4444', color: '#ffffff', fontWeight: 800 }}
                          >
                            <Lock size={14} />
                            <span>حجر شامل فوري بكافة الفروع</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* خريطة وتوزيع مواقع التشغيلة */}
                    <div style={{ background: 'var(--stock-surface-2)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--stock-border)' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--stock-text-main)', display: 'block', marginBottom: '10px' }}>
                        أماكن تواجد هذه التشغيلة حالياً في الشبكة:
                      </span>

                      {batch.locations.length === 0 ? (
                        <span style={{ fontSize: '13px', color: 'var(--stock-text-muted)' }}>
                          لا يوجد رصيد حالي لهذه التشغيلة في أي مستودع (الرصيد الكلي 0).
                        </span>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                          {batch.locations.map((loc, idx) => {
                            const isCentral = loc.location_type === 'central_warehouse';
                            const isTransit = loc.location_type === 'in_transit';
                            return (
                              <div
                                key={idx}
                                style={{
                                  background: 'var(--stock-surface)',
                                  border: '1px solid var(--stock-border)',
                                  borderRadius: '6px',
                                  padding: '10px 14px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {isCentral ? (
                                    <Building size={16} color="#0284c7" />
                                  ) : isTransit ? (
                                    <Truck size={16} color="#f59e0b" />
                                  ) : (
                                    <Layers size={16} color="#059669" />
                                  )}
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--stock-text-main)' }}>
                                    {loc.location_name}
                                  </span>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: loc.quantity > 0 ? '#0284c7' : '#94a3b8' }}>
                                  {loc.quantity} عبوة
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── نافذة تأكيد أمر الحجر الرقابي الشامل ── */}
      {selectedBatchForQuarantine && (
        <div className="stock-modal-backdrop">
          <div className="stock-modal-card" style={{ maxWidth: '520px' }}>
            <div className="stock-modal-header danger" style={{ borderBottom: '2px solid #ef4444' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldAlert size={22} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  تأكيد فرض الحجر الرقابي الشامل (Universal Batch Recall)
                </h3>
              </div>
            </div>

            <div className="stock-modal-body" style={{ padding: '20px' }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px', marginBottom: '16px', color: '#991b1b', fontSize: '13px' }}>
                <strong>تحذير أمني عاجل:</strong> سيؤدي فرض الحجر على هذه التشغيلة إلى منع صرفها أو بيعها في شاشات الكاشير ونقاط البيع (PharmaOS POS) فوراً، وحظر إدراجها في أي أمر تحويل بين الفروع.
              </div>

              <div style={{ marginBottom: '14px', fontSize: '13px' }}>
                <div>اسم الصنف: <strong>{selectedBatchForQuarantine.trade_name_ar}</strong></div>
                <div>رقم التشغيلة: <strong style={{ color: '#ef4444' }}>{selectedBatchForQuarantine.batch_number}</strong></div>
                <div>الكمية المحجوزة في الشبكة: <strong>{selectedBatchForQuarantine.total_quantity} عبوة</strong></div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="stock-field-label" style={{ fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  سبب الحجر / رقم منشور هيئة الدواء الرقابي:
                </label>
                <textarea
                  className="stock-input"
                  style={{ width: '100%', minHeight: '80px', padding: '10px' }}
                  value={quarantineReason}
                  onChange={(e) => setQuarantineReason(e.target.value)}
                  placeholder="أدخل سبب الحجر أو رقم المنشور الرسمي..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="stock-quick-action-btn outline"
                  onClick={() => setSelectedBatchForQuarantine(null)}
                  disabled={isSubmitting}
                >
                  إلغاء الأمر
                </button>
                <button
                  type="button"
                  className="stock-quick-action-btn danger"
                  onClick={handleExecuteQuarantine}
                  disabled={isSubmitting}
                  style={{ backgroundColor: '#ef4444', color: '#ffffff', fontWeight: 800 }}
                >
                  {isSubmitting ? 'جاري فرض الحجر...' : 'تأكيد الحجر وتجميد البيع فوراً'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
