import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Pill,
  Plus,
  Layers,
  Barcode,
  Building2,
  DollarSign,
  TrendingUp,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  History,
  ShieldAlert,
  ArrowUpRight,
  Info,
  Check,
  RefreshCw,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import {
  outstockSearchMedications,
  outstockGetMedicationMasterCard,
  outstockUpdateMedicationDetails,
  outstockAddNewMedication
} from '../../../utils/outstockApiClient';
import MedicationMasterCardModal from '../common/MedicationMasterCardModal';
import AddMedicationModal from '../common/AddMedicationModal';

/**
 * PharmacyMedicationSearchTab.jsx
 * شاشة الفرع: "البحث عن صنف والبدائل"
 * الصلاحيات والضوابط المطبقة بدقة هندسية:
 * 1. بحث فوري متقدم عن الأصناف وبدائلها (بالاسم التجاري، المادة الفعالة، والباركود).
 * 2. عرض كارتة الصنف الشاملة (المواصفات، المثائل بنفس المادة الفعالة، وسجل تغيرات الأسعار).
 * 3. إضافة صنف دوائي جديد للكتالوج المركزي.
 * 4. تعديل السعر فقط إلى سعر أعلى وليس أقل (ممنوع تعديل أي بيانات أخرى أو خفض السعر).
 */
export default function PharmacyMedicationSearchTab({
  branchId,
  branch,
  currentPharmacist = '',
  showToast = (msg) => window.dispatchEvent(new CustomEvent('outstock:notify', { detail: msg }))
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchDebounceRef = useRef(null);

  // كارتة الصنف
  const [masterCardMedId, setMasterCardMedId] = useState(null);
  const [masterCardData, setMasterCardData] = useState(null);
  const [isLoadingMasterCard, setIsLoadingMasterCard] = useState(false);

  // تعديل السعر (سعر أعلى فقط)
  const [priceEditMed, setPriceEditMed] = useState(null);
  const [newPublicPrice, setNewPublicPrice] = useState('');
  const [newPackSize, setNewPackSize] = useState('1');
  const [priceEditReason, setPriceEditReason] = useState('تشغيلة جديدة بسعر أعلى من الشركة');
  const [priceEditDecree, setPriceEditDecree] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // إضافة صنف جديد
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // تنفيذ البحث
  const handleSearch = async (term) => {
    const q = term !== undefined ? String(term).trim() : String(searchTerm).trim();

    setIsLoading(true);
    try {
      const res = await outstockSearchMedications(q, 40);
      if (res?.success && Array.isArray(res.medications)) {
        setSearchResults(res.medications);
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      console.warn('Search error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // ⚡ البحث اللحظي التلقائي بمجرد الكتابة دون الحاجة لضغط Enter
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      handleSearch(searchTerm);
    }, 240);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchTerm]);

  // الاستماع لتحديثات الأسعار اللحظية لإنعاش الشاشة دون إعادة تحميل
  useEffect(() => {
    const handlePriceUpdate = (e) => {
      const data = e?.detail || e;
      if (data?.medicationId) {
        setSearchResults((prev) =>
          prev.map((m) =>
            m.id === data.medicationId
              ? {
                  ...m,
                  public_price: data.new_public_price || m.public_price,
                  unit_price: data.new_unit_price || m.unit_price
                }
              : m
          )
        );
      }
    };

    window.addEventListener('outstock:price_updated', handlePriceUpdate);
    window.addEventListener('outstock:medication_added', () => handleSearch(searchTerm));
    return () => {
      window.removeEventListener('outstock:price_updated', handlePriceUpdate);
      window.removeEventListener('outstock:medication_added', () => handleSearch(searchTerm));
    };
  }, [searchTerm]);

  // فتح كارتة الصنف
  const handleOpenMasterCard = async (medId) => {
    setMasterCardMedId(medId);
    setIsLoadingMasterCard(true);
    try {
      const res = await outstockGetMedicationMasterCard(medId);
      if (res?.success) {
        setMasterCardData(res);
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر جلب كارتة الصنف'}`);
        setMasterCardMedId(null);
      }
    } catch (err) {
      showToast?.(`❌ خطأ: ${err.message}`);
      setMasterCardMedId(null);
    } finally {
      setIsLoadingMasterCard(false);
    }
  };

  // فتح نافذة تعديل السعر (تحريك لأعلى فقط)
  const handleOpenPriceEdit = (med) => {
    setPriceEditMed(med);
    setNewPublicPrice('');
    setNewPackSize(String(med.pack_size || 1));
    setPriceEditReason('تشغيلة جديدة بسعر أعلى من الشركة');
    setPriceEditDecree('');
  };

  // حفظ السعر الجديد للأعلى فقط
  const handleSavePriceIncrease = async (e) => {
    e.preventDefault();
    if (!priceEditMed) return;

    const currentPrice = parseFloat(priceEditMed.public_price || 0);
    const enteredPrice = parseFloat(newPublicPrice);

    if (isNaN(enteredPrice) || enteredPrice <= 0) {
      showToast('⚠️ يرجى إدخال سعر صحيح');
      return;
    }

    if (enteredPrice <= currentPrice) {
      showToast(
        `⛔ تنبيه نظام التسعير: السعر الحالي (${currentPrice.toFixed(2)} ج.م). مسموح فقط بإدخال سعر أعلى لمواكبة منشورات الأسعار الجديدة.`
      );
      return;
    }

    setIsSavingPrice(true);
    try {
      const res = await outstockUpdateMedicationDetails(priceEditMed.id, {
        public_price: enteredPrice,
        pack_size: parseInt(newPackSize || priceEditMed.pack_size || 1, 10),
        reason: priceEditReason,
        decreeNumber: priceEditDecree
      });

      if (res?.success) {
        showToast(
          `✅ تم رفع السعر الرسمي بنجاح وتعميمه لحظياً على كافة الفروع! السعر الجديد: ${enteredPrice.toFixed(2)} ج.م`
        );
        setPriceEditMed(null);
        handleSearch(searchTerm);
      } else {
        showToast(`❌ فشل التحديث: ${res?.error || 'حدث خطأ'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSavingPrice(false);
    }
  };


  return (
    <div className="outstock-tab-container" style={{ direction: 'rtl', padding: '16px' }}>
      {/* ── العنوان والشريط العلوي ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '20px 24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(2, 132, 199, 0.3)'
                }}
              >
                <Search size={22} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
                  البحث عن صنف والبدائل الدوائية
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  دليل الأدوية المصرية، البحث بالمادة الفعالة والبدائل، كارتة الصنف، وتعديل السعر للأعلى فقط
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: '700',
                fontSize: '13.5px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              <Plus size={18} />
              <span>إضافة صنف جديد</span>
            </button>
          </div>
        </div>

        {/* ── شريط البحث الفوري الذكي ── */}
        <div style={{ marginTop: '18px', position: 'relative' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchTerm);
            }}
            style={{ display: 'flex', gap: '10px' }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="ابحث باسم الصنف (عربي أو إنجليزي)، المادة الفعالة، أو الباركود... (مثال: الفانترن، alphintern، بنادول)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '13px 44px 13px 16px',
                  borderRadius: '12px',
                  border: '2px solid #cbd5e1',
                  fontSize: '15px',
                  fontWeight: '600',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: '#f8fafc',
                  transition: 'border-color 0.2s'
                }}
              />
              <Search
                size={20}
                color="#64748b"
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#e2e8f0',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#475569'
                  }}
                  title="مسح البحث وعرض الكتالوج"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '0 24px',
                borderRadius: '12px',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                fontWeight: '700',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isLoading ? <RefreshCw size={16} className="outstock-spin" /> : <Search size={16} />}
              <span>بحث</span>
            </button>
          </form>
        </div>
      </div>

      {/* ── شريط التعليمات الصارمة والضوابط للصيدلي ── */}
      <div
        style={{
          background: '#eff6ff',
          border: '1.5px solid #bfdbfe',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: '#1e40af'
        }}
      >
        <ShieldAlert size={22} color="#2563eb" style={{ flexShrink: 0 }} />
        <div>
          <strong>ضوابط الصيدلية بالفرع:</strong> يمكنك البحث عن أي دواء أو بدائله المباشرة، وعرض كارتة الصنف التفصيلية،
          وإضافة أصناف جديدة للكتالوج. <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>تعديل الأسعار مسموح به فقط إلى سعر أعلى</span> (لمواكبة التشغيلات والزيادات الرسمية الجديدة)، وممنوع خفض الأسعار أو تعديل بيانات الصنف الأساسية.
        </div>
      </div>

      {/* ── شبكة وجدول نتائج البحث ── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <RefreshCw size={32} className="outstock-spin" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontWeight: '700' }}>جاري البحث الفوري في كتالوج الأدوية...</p>
        </div>
      ) : searchResults.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '40px 20px',
            textAlign: 'center',
            border: '1px dashed #cbd5e1',
            color: '#64748b'
          }}
        >
          <Pill size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#334155' }}>لم يتم العثور على أدوية مطابقة</h4>
          <p style={{ margin: 0, fontSize: '13px' }}>
            جرب البحث بجزء من الاسم أو المادة الفعالة، أو قم بإضافة الصنف كدواء جديد للكتالوج.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '700' }}>
            تم العثور على {searchResults.length} دواء مطابق:
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '14px'
            }}
          >
            {searchResults.map((med) => {
              const packSize = parseInt(med.pack_size || 1, 10);
              const publicPrice = parseFloat(med.public_price || 0);
              const unitPrice = parseFloat(med.unit_price || (publicPrice / packSize).toFixed(2));

              return (
                <div
                  key={med.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid #e2e8f0',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* شريط الشارات الجانبي */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {med.is_table_drug && (
                        <span
                          style={{
                            background: '#fee2e2',
                            color: '#991b1b',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '2px 8px',
                            borderRadius: '6px'
                          }}
                        >
                          صنف جدول
                        </span>
                      )}
                      {med.is_refrigerated && (
                        <span
                          style={{
                            background: '#e0f2fe',
                            color: '#075985',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '2px 8px',
                            borderRadius: '6px'
                          }}
                        >
                          ثلاجة ❄️
                        </span>
                      )}
                      <span
                        style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}
                      >
                        {med.dosage_form || 'أقراص'}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                      {med.gtin_barcode ? `باركود: ${med.gtin_barcode}` : ''}
                    </div>
                  </div>

                  {/* الاسم التجاري والمادة الفعالة */}
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                      {med.trade_name_ar}
                    </h3>
                    <div style={{ fontSize: '13.5px', color: '#2563eb', fontWeight: '700', direction: 'ltr', textAlign: 'right' }}>
                      {med.trade_name_en}
                    </div>

                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: '600' }}>المادة الفعالة:</span>
                      <span style={{ color: '#0284c7', fontWeight: '700' }}>{med.generic_name || 'غير محددة'}</span>
                    </div>

                    {med.manufacturer && (
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={13} />
                        <span>{med.manufacturer}</span>
                      </div>
                    )}
                  </div>

                  {/* بطاقة الأسعار وحجم العبوة */}
                  <div
                    style={{
                      background: '#f8fafc',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid #f1f5f9'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>سعر العبوة الرسمي</span>
                      <strong style={{ fontSize: '17px', color: '#047857' }}>
                        {publicPrice.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                      </strong>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                        سعر {med.unit_name || 'الشريط'} ({packSize} {med.unit_name || 'شرائط'})
                      </span>
                      <strong style={{ fontSize: '15px', color: '#0284c7' }}>
                        {unitPrice.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                      </strong>
                    </div>
                  </div>

                  {/* أزرار الإجراءات للفرع */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenMasterCard(med.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <FileText size={15} />
                      <span>كارتة الصنف والبدائل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenPriceEdit(med)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: '#f0fdf4',
                        color: '#15803d',
                        border: '1px solid #bbf7d0',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <TrendingUp size={15} />
                      <span>تعديل السعر (للأعلى)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 1. نافذة كارتة الصنف والبدائل الشاملة (Item Master Card Modal) ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {masterCardMedId && (
        <div
          className="outstock-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMasterCardMedId(null);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            {/* رأس النافذة */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={22} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>كارتة الصنف والبدائل الدوائية</h3>
                  <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>
                    هيئة الدواء المصرية & دليل دراج آي الشامل
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMasterCardMedId(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '5px',
                  display: 'flex'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* جسم الكارتة */}
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {isLoadingMasterCard || !masterCardData ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <RefreshCw size={28} className="outstock-spin" style={{ margin: '0 auto 8px' }} />
                  <p>جاري استرجاع بيانات كارتة الصنف والبدائل...</p>
                </div>
              ) : (
                <>
                  {/* بيانات الصنف الأساسية */}
                  <div
                    style={{
                      background: '#f8fafc',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                          {masterCardData.medication.trade_name_ar}
                        </h2>
                        <div style={{ fontSize: '14px', color: '#0284c7', fontWeight: '700', direction: 'ltr', textAlign: 'right' }}>
                          {masterCardData.medication.trade_name_en}
                        </div>
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>السعر الرسمي الحالي</span>
                        <strong style={{ fontSize: '20px', color: '#047857' }}>
                          {masterCardData.medication.public_price.toFixed(2)} ج.م
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '10px',
                        marginTop: '14px',
                        fontSize: '12.5px',
                        borderTop: '1px solid #e2e8f0',
                        paddingTop: '12px'
                      }}
                    >
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>المادة الفعالة:</span>
                        <strong style={{ color: '#0f172a' }}>{masterCardData.medication.generic_name || 'غير محدد'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>الشكل والتركيز:</span>
                        <strong style={{ color: '#0f172a' }}>
                          {masterCardData.medication.dosage_form} {masterCardData.medication.strength || ''}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>حجم العبوة:</span>
                        <strong style={{ color: '#0f172a' }}>
                          {masterCardData.medication.pack_size} {masterCardData.medication.unit_name || 'شريط'} (سعر الشريط: {masterCardData.medication.unit_price.toFixed(2)} ج.م)
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>الشركة المصنعة:</span>
                        <strong style={{ color: '#0f172a' }}>{masterCardData.medication.manufacturer || 'غير مسجلة'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>الباركود الدولي:</span>
                        <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>
                          {masterCardData.medication.gtin_barcode || 'لا يوجد باركود'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>رقم تسجيل هيئة الدواء (EDA):</span>
                        <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>
                          {masterCardData.medication.eda_reg_no || 'غير مسجل'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* المثائل والبدائل المباشرة بنفس المادة الفعالة */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={16} color="#0284c7" />
                        <span>المثائل والبدائل المتاحة بنفس المادة الفعالة ({masterCardData.substitutes?.length || 0}):</span>
                      </h4>
                    </div>

                    {Array.isArray(masterCardData.substitutes) && masterCardData.substitutes.length > 0 ? (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right' }}>
                              <th style={{ padding: '8px 12px' }}>اسم البديل</th>
                              <th style={{ padding: '8px 12px' }}>الشكل</th>
                              <th style={{ padding: '8px 12px' }}>الشركة</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>سعر العبوة</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center' }}>إجراء</th>
                            </tr>
                          </thead>
                          <tbody>
                            {masterCardData.substitutes.map((sub) => {
                              const diff = sub.public_price - masterCardData.medication.public_price;
                              return (
                                <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: '700', color: '#1e293b' }}>
                                    {sub.trade_name_ar}
                                    <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', direction: 'ltr', textAlign: 'right' }}>
                                      {sub.trade_name_en}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', color: '#475569' }}>{sub.dosage_form}</td>
                                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{sub.manufacturer || '-'}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>
                                    <span style={{ color: diff < 0 ? '#15803d' : diff > 0 ? '#b91c1c' : '#0284c7' }}>
                                      {sub.public_price.toFixed(2)} ج.م
                                    </span>
                                    {diff !== 0 && (
                                      <span style={{ fontSize: '10.5px', display: 'block', color: diff < 0 ? '#15803d' : '#b91c1c' }}>
                                        ({diff < 0 ? `أرخص بـ ${Math.abs(diff).toFixed(1)} ج.م` : `أغلى بـ ${diff.toFixed(1)} ج.م`})
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMasterCard(sub.id)}
                                      style={{
                                        background: '#f1f5f9',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '11.5px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        color: '#334155'
                                      }}
                                    >
                                      عرض
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        لا توجد بدائل مسجلة بنفس المادة الفعالة حالياً.
                      </div>
                    )}
                  </div>

                  {/* سجل تغيرات وتحريك الأسعار التاريخي */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <History size={16} color="#059669" />
                      <span>سجل تغيرات وتحريك الأسعار التاريخي:</span>
                    </h4>

                    {Array.isArray(masterCardData.priceHistory) && masterCardData.priceHistory.length > 0 ? (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right' }}>
                              <th style={{ padding: '8px 10px' }}>التاريخ</th>
                              <th style={{ padding: '8px 10px' }}>السعر السابق</th>
                              <th style={{ padding: '8px 10px' }}>السعر الجديد</th>
                              <th style={{ padding: '8px 10px' }}>السبب والمنشور</th>
                              <th style={{ padding: '8px 10px' }}>المسؤول</th>
                            </tr>
                          </thead>
                          <tbody>
                            {masterCardData.priceHistory.map((h, i) => (
                              <tr key={h.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 10px', color: '#475569' }}>
                                  {new Date(h.created_at).toLocaleDateString('ar-EG')}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748b', textDecoration: 'line-through' }}>
                                  {h.old_public_price?.toFixed(2)} ج.م
                                </td>
                                <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#059669' }}>
                                  {h.new_public_price?.toFixed(2)} ج.م
                                </td>
                                <td style={{ padding: '8px 10px', color: '#334155' }}>
                                  {h.revision_source || h.decree_number || 'تعديل رسمي'}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748b' }}>{h.changed_by || 'الفرع'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '12.5px' }}>
                        لم تسجل أي تغيرات سعرية سابقة لهذا الصنف.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ذيل النافذة */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'left' }}>
              <button
                type="button"
                onClick={() => setMasterCardMedId(null)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: '#e2e8f0',
                  color: '#334155',
                  border: 'none',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 2. نافذة تعديل السعر للأعلى فقط (Branch Price Increase Only Modal) ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {priceEditMed && (
        <div
          className="outstock-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingPrice) setPriceEditMed(null);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            {/* الرأس */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TrendingUp size={22} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>تحديث السعر الرسمي للصنف</h3>
                  <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>
                    مسموح فقط برفع السعر إلى سعر أعلى لمواكبة التشغيلات الجديدة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPriceEditMed(null)}
                disabled={isSavingPrice}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '5px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* النموذج */}
            <form onSubmit={handleSavePriceIncrease} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* بطاقة معلومات الصنف الثابتة (غير قابلة للتعديل) */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}
              >
                <h4 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                  {priceEditMed.trade_name_ar}
                </h4>
                <div style={{ fontSize: '13px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                  {priceEditMed.trade_name_en}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  الشكل: {priceEditMed.dosage_form} | عدد الوحدات: {priceEditMed.pack_size} {priceEditMed.unit_name || 'شريط'}
                </div>
              </div>

              {/* مقارنة السعر الحالي والسعر الجديد */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                  <span style={{ fontSize: '11.5px', color: '#991b1b', display: 'block', fontWeight: '600' }}>
                    السعر الحالي المسجل
                  </span>
                  <strong style={{ fontSize: '18px', color: '#dc2626' }}>
                    {parseFloat(priceEditMed.public_price || 0).toFixed(2)} ج.م
                  </strong>
                </div>

                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '11.5px', color: '#166534', display: 'block', fontWeight: '600' }}>
                    سعر الشريط الحالي
                  </span>
                  <strong style={{ fontSize: '18px', color: '#15803d' }}>
                    {parseFloat(priceEditMed.unit_price || 0).toFixed(2)} ج.م
                  </strong>
                </div>
              </div>

              {/* حقل إدخال السعر الجديد */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                  السعر الجديد للعبوة (ج.م) - <span style={{ color: '#059669' }}>يجب أن يكون أعلى من {priceEditMed.public_price} ج.م</span>:
                </label>
                <input
                  type="number"
                  step="0.25"
                  min={parseFloat(priceEditMed.public_price || 0) + 0.25}
                  placeholder={`أدخل سعراً أعلى من ${priceEditMed.public_price}...`}
                  value={newPublicPrice}
                  onChange={(e) => setNewPublicPrice(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '17px',
                    fontWeight: '800',
                    color: '#059669',
                    border: '2px solid #059669',
                    borderRadius: '8px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              {/* رسالة التحقق الصارمة */}
              {newPublicPrice && parseFloat(newPublicPrice) <= parseFloat(priceEditMed.public_price || 0) && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1.5px solid #f87171',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#991b1b',
                    fontSize: '12.5px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertTriangle size={18} />
                  <span>
                    ⛔ خطأ: لا يمكن إدخال سعر أقل من أو يساوي السعر الحالي ({priceEditMed.public_price} ج.م). مسموح فقط بإدخال سعر أعلى.
                  </span>
                </div>
              )}

              {/* معاينة الزيادة وسعر الشريط الجديد */}
              {newPublicPrice && parseFloat(newPublicPrice) > parseFloat(priceEditMed.public_price || 0) && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    color: '#15803d'
                  }}
                >
                  ✅ زيادة صالحة (+{(parseFloat(newPublicPrice) - parseFloat(priceEditMed.public_price || 0)).toFixed(2)} ج.م).
                  سيصبح سعر الشريط الجديد تلقائياً:{' '}
                  <strong>
                    {(parseFloat(newPublicPrice) / parseInt(newPackSize || priceEditMed.pack_size || 1, 10)).toFixed(2)} ج.م
                  </strong>
                </div>
              )}

              {/* السبب ورقم المنشور */}
              <div>
                <label style={{ fontSize: '12px', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  سبب الرفع / رقم المنشور (اختياري):
                </label>
                <input
                  type="text"
                  value={priceEditReason}
                  onChange={(e) => setPriceEditReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* أزرار الإجراء */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="submit"
                  disabled={
                    isSavingPrice ||
                    !newPublicPrice ||
                    parseFloat(newPublicPrice) <= parseFloat(priceEditMed.public_price || 0)
                  }
                  style={{
                    flex: 1,
                    padding: '12px',
                    background:
                      !newPublicPrice || parseFloat(newPublicPrice) <= parseFloat(priceEditMed.public_price || 0)
                        ? '#cbd5e1'
                        : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor:
                      !newPublicPrice || parseFloat(newPublicPrice) <= parseFloat(priceEditMed.public_price || 0)
                        ? 'not-allowed'
                        : 'pointer',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  {isSavingPrice ? 'جاري تعميم السعر...' : 'حفظ وتعميم السعر الجديد لحظياً'}
                </button>

                <button
                  type="button"
                  onClick={() => setPriceEditMed(null)}
                  disabled={isSavingPrice}
                  style={{
                    padding: '12px 18px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 3. نافذة إضافة صنف جديد (Branch Add New Medication Modal) ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <AddMedicationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaveSuccess={(createdMed) => {
          showToast?.(`✅ تم إضافة صنف "${createdMed.trade_name_ar}" للكتالوج المركزي بنجاح`);
          handleSearch(searchTerm || '');
        }}
      />
    </div>
  );
}
