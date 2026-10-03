import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Pill,
  DollarSign,
  Package,
  Barcode,
  Building2,
  AlertTriangle,
  Snowflake,
  Sparkles,
  Check,
  Receipt,
  Search
} from 'lucide-react';
import {
  outstockAddNewMedication,
  outstockUpdateMedicationDetails,
  outstockSearchActiveIngredients
} from '../../../utils/outstockApiClient';

/**
 * خريطة الإعدادات المسبقة للشكل الدوائي (الاسم الافتراضي للوحدة وعدد الوحدات بالعبوة)
 */
const DOSAGE_PRESETS = {
  'أقراص (Tablets)': { unit: 'شريط', packSize: 2 },
  'كبسولات (Capsules)': { unit: 'شريط', packSize: 2 },
  'شراب (Syrup)': { unit: 'زجاجة', packSize: 1 },
  'معلق (Suspension)': { unit: 'زجاجة', packSize: 1 },
  'حقن (Injection)': { unit: 'أمبول', packSize: 5 },
  'أمبولات (Ampoules)': { unit: 'أمبول', packSize: 5 },
  'فيال (Vials)': { unit: 'فيال', packSize: 1 },
  'نقط (Drops)': { unit: 'قطارة', packSize: 1 },
  'مرهم / كريم (Ointment/Cream)': { unit: 'أنبوبة', packSize: 1 },
  'جل (Gel)': { unit: 'أنبوبة', packSize: 1 },
  'فوار / أكياس (Sachets)': { unit: 'كيس', packSize: 10 },
  'بخاخ (Inhaler/Spray)': { unit: 'بخاخ', packSize: 1 },
  'لبوس (Suppositories)': { unit: 'شريط', packSize: 1 },
  'محلول وريدي (IV Solution)': { unit: 'عبوة', packSize: 1 },
  'شامبو / لوشن (Shampoo / Lotion)': { unit: 'عبوة', packSize: 1 },
  'أخرى': { unit: 'علبة', packSize: 1 }
};

/**
 * AddMedicationModal.jsx
 * نافذة احترافية لإضافة وتعديل الأدوية في الكتالوج المركزي
 * تدعم:
 * - حل مشكلة إعادة التهيئة أثناء الكتابة
 * - المواد الفعالة المتعددة بزر (+) والإكمال التلقائي (Typeahead)
 * - اسم الصنف المطبوع على الفاتورة (Invoice Display Name)
 * - الملء التلقائي للوحدة والعبوة بحسب الشكل الدوائي
 * - تعديل الصنف مباشرة في قاعدة البيانات
 */
export default function AddMedicationModal({
  isOpen,
  initialData = {},
  creatorEmployee = null,
  onClose,
  onSaveSuccess,
  zIndex = 120000
}) {
  const isEditMode = Boolean(initialData?.id);
  const prevIsOpenRef = useRef(false);

  const [form, setForm] = useState({
    trade_name_ar: '',
    trade_name_en: '',
    invoice_display_name: '',
    dosage_form: 'أقراص (Tablets)',
    strength: '',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: '',
    manufacturer: '',
    category: '',
    gtin_barcode: '',
    is_table_drug: false,
    is_refrigerated: false
  });

  // قائمة المواد الفعالة
  const [activeIngredients, setActiveIngredients] = useState(['']);
  // اقتراحات المواد الفعالة
  const [suggestions, setSuggestions] = useState({}); // { [index]: Array }
  const [activeSugIndex, setActiveSugIndex] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // تهيئة البيانات فقط عند انتقال isOpen من false إلى true
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setErrorMsg('');
      const initName = initialData?.trade_name_ar || initialData?.name || '';
      const isEnglish = /^[a-zA-Z0-9\s\-+.]+$/.test(initName.trim());

      const dForm = initialData?.dosage_form || 'أقراص (Tablets)';
      const preset = DOSAGE_PRESETS[dForm] || { unit: 'شريط', packSize: 2 };

      setForm({
        trade_name_ar: isEnglish ? '' : initName,
        trade_name_en: isEnglish ? initName : (initialData?.trade_name_en || ''),
        invoice_display_name: initialData?.invoice_display_name || initialData?.invoiceDisplayName || '',
        dosage_form: dForm,
        strength: initialData?.strength || '',
        pack_size: initialData?.pack_size || preset.packSize,
        unit_name: initialData?.unit_name || preset.unit,
        public_price: initialData?.public_price ? String(initialData.public_price) : (initialData?.current_price ? String(initialData.current_price) : ''),
        manufacturer: initialData?.manufacturer || initialData?.company_name || '',
        category: initialData?.category || '',
        gtin_barcode: initialData?.gtin_barcode || initialData?.barcode || '',
        is_table_drug: Boolean(initialData?.is_table_drug),
        is_refrigerated: Boolean(initialData?.is_refrigerated)
      });

      // استخراج المواد الفعالة
      let ings = [];
      if (Array.isArray(initialData?.active_ingredients_list) && initialData.active_ingredients_list.length > 0) {
        ings = initialData.active_ingredients_list;
      } else if (Array.isArray(initialData?.active_ingredients) && initialData.active_ingredients.length > 0) {
        ings = initialData.active_ingredients;
      } else if (initialData?.generic_name || initialData?.active_ingredient) {
        const raw = initialData.generic_name || initialData.active_ingredient;
        ings = String(raw).split('+').map(s => s.trim()).filter(Boolean);
      }
      setActiveIngredients(ings.length > 0 ? ings : ['']);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialData]);

  // تغيير الشكل الدوائي وتحديث الوحدة وحجم العبوة تلقائياً
  const handleDosageFormChange = (e) => {
    const selectedForm = e.target.value;
    const preset = DOSAGE_PRESETS[selectedForm];
    setForm(prev => ({
      ...prev,
      dosage_form: selectedForm,
      unit_name: preset ? preset.unit : prev.unit_name,
      pack_size: preset ? preset.packSize : prev.pack_size
    }));
  };

  // إدارة المواد الفعالة
  const handleIngredientChange = async (index, val) => {
    const updated = [...activeIngredients];
    updated[index] = val;
    setActiveIngredients(updated);

    if (val.trim().length >= 2) {
      try {
        const res = await outstockSearchActiveIngredients(val.trim(), 8);
        if (res?.success && Array.isArray(res.data)) {
          setSuggestions(prev => ({ ...prev, [index]: res.data }));
          setActiveSugIndex(index);
          return;
        }
      } catch (err) {}
    }
    setSuggestions(prev => ({ ...prev, [index]: [] }));
  };

  const selectSuggestion = (index, sug) => {
    const updated = [...activeIngredients];
    updated[index] = sug.name || sug;
    setActiveIngredients(updated);
    setSuggestions(prev => ({ ...prev, [index]: [] }));
    setActiveSugIndex(null);
  };

  const addIngredientField = () => {
    setActiveIngredients([...activeIngredients, '']);
  };

  const removeIngredientField = (index) => {
    if (activeIngredients.length <= 1) {
      setActiveIngredients(['']);
      return;
    }
    const updated = activeIngredients.filter((_, i) => i !== index);
    setActiveIngredients(updated);
  };

  // احتساب لحظي لسعر الشريط
  const calculatedUnitPrice = useMemo(() => {
    const pub = parseFloat(form.public_price);
    const pack = parseInt(form.pack_size, 10);
    if (!isNaN(pub) && pub > 0 && !isNaN(pack) && pack > 0) {
      return (pub / pack).toFixed(2);
    }
    return null;
  }, [form.public_price, form.pack_size]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const arName = form.trade_name_ar.trim();
    const enName = form.trade_name_en.trim();
    const pubPrice = parseFloat(form.public_price);

    if (!arName && !enName) {
      setErrorMsg('يرجى إدخال اسم الدواء بالعربي أو بالإنجليزي');
      return;
    }
    if (isNaN(pubPrice) || pubPrice <= 0) {
      setErrorMsg('يرجى إدخال سعر رسمي صحيح للدواء أكبر من الصفر');
      return;
    }

    const cleanIngredients = activeIngredients.map(s => s.trim()).filter(Boolean);

    setIsSaving(true);
    try {
      const payload = {
        tradeName: enName || arName,
        arabicName: arName || enName,
        invoiceDisplayName: form.invoice_display_name.trim() || null,
        activeIngredients: cleanIngredients,
        genericName: cleanIngredients.join(' + '),
        dosageForm: form.dosage_form,
        strength: form.strength.trim(),
        packSize: parseInt(form.pack_size, 10) || 1,
        unitName: form.unit_name.trim() || 'شريط',
        price: pubPrice,
        unitPrice: calculatedUnitPrice ? parseFloat(calculatedUnitPrice) : pubPrice,
        company: form.manufacturer.trim(),
        category: form.category.trim(),
        barcode: form.gtin_barcode.trim(),
        isTableDrug: form.is_table_drug,
        isRefrigerated: form.is_refrigerated,
        employeeCode: creatorEmployee?.code || null,
        employeeName: creatorEmployee?.name || null
      };

      let res;
      if (isEditMode) {
        res = await outstockUpdateMedicationDetails(initialData.id, payload);
      } else {
        res = await outstockAddNewMedication(payload);
      }

      if (res?.success) {
        const savedMed = res.medication || { id: initialData.id, ...payload };
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('outstock:medication_added', { detail: savedMed }));
        }
        onSaveSuccess?.(savedMed);
        onClose();
      } else {
        setErrorMsg(res?.error || 'حدث خطأ أثناء حفظ الدواء بالكتالوج المركزي');
      }
    } catch (err) {
      setErrorMsg(err.message || 'تعذر حفظ الدواء، تحقق من اتصال الخادم');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: zIndex || 120000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          direction: 'rtl',
          border: '1px solid rgba(226, 232, 240, 0.8)'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '18px 24px',
            background: isEditMode
              ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
              : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {isEditMode ? <Pill size={24} color="#ffffff" /> : <Plus size={24} color="#ffffff" />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900' }}>
                {isEditMode ? 'تعديل بيانات الصنف في الكتالوج المركزي' : 'إضافة دواء جديد للكتالوج المركزي'}
              </h3>
              <p style={{ margin: 0, fontSize: '12.5px', opacity: 0.9, marginTop: '2px' }}>
                يتم التحديث المباشر ويظهر فوراً لكافة الفروع وإدارة المشتريات
              </p>
              {creatorEmployee && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.25)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: '800',
                  marginTop: '4px'
                }}>
                  <span>المسؤول: {creatorEmployee.name} (كود: {creatorEmployee.code}) 🔒</span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              background: 'rgba(255, 255, 255, 0.18)',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              padding: '8px',
              display: 'flex'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النموذج */}
        <form
          onSubmit={handleSubmit}
          style={{ padding: '22px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#b91c1c',
                fontSize: '13px',
                fontWeight: '800'
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {/* الاسمان التجاريان */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '5px' }}>
                اسم الصنف بالعربي * :
              </label>
              <input
                type="text"
                placeholder="مثال: ألفانترن 30 قرص"
                value={form.trade_name_ar}
                onChange={(e) => setForm({ ...form, trade_name_ar: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13.5px',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '5px' }}>
                الاسم بالإنجليزي (Trade Name):
              </label>
              <input
                type="text"
                placeholder="e.g. Alphintern 30 Tabs"
                value={form.trade_name_en}
                onChange={(e) => setForm({ ...form, trade_name_en: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13.5px',
                  boxSizing: 'border-box',
                  direction: 'ltr'
                }}
              />
            </div>
          </div>

          {/* الاسم المطبوع على الفاتورة */}
          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Receipt size={16} color="#0284c7" />
                <span>الاسم المطبوع على الفاتورة (Invoice Display Name):</span>
              </label>
              <span style={{ fontSize: '11px', color: '#64748b' }}>يظهر على إيصال العميل المطبوع (اختياري)</span>
            </div>
            <input
              type="text"
              placeholder="مثال: ألفانترن أقراص (يُطبع بهذا الاسم في الفاتورة)"
              value={form.invoice_display_name}
              onChange={(e) => setForm({ ...form, invoice_display_name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13.5px',
                boxSizing: 'border-box',
                background: '#ffffff'
              }}
            />
          </div>

          {/* المواد الفعالة المتعددة مع زر (+) والإكمال التلقائي */}
          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b' }}>
                المواد الفعالة (Active Ingredients) - يدعم الإكمال التلقائي:
              </label>
              <button
                type="button"
                onClick={addIngredientField}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#e0f2fe',
                  color: '#0369a1',
                  border: '1px solid #bae6fd',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} />
                <span>إضافة مادة فعالة أخرى (+)</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeIngredients.map((ing, idx) => (
                <div key={idx} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      placeholder="e.g. Paracetamol, Ibuprofen, Chymotrypsin..."
                      value={ing}
                      onChange={(e) => handleIngredientChange(idx, e.target.value)}
                      onFocus={() => setActiveSugIndex(idx)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                        direction: 'ltr'
                      }}
                    />
                    {/* قائمة الاقتراحات التلقائية */}
                    {activeSugIndex === idx && Array.isArray(suggestions[idx]) && suggestions[idx].length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 1000,
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          boxShadow: '0 8px 16px rgba(0,0,0,0.12)',
                          maxHeight: '160px',
                          overflowY: 'auto',
                          marginTop: '3px',
                          direction: 'ltr'
                        }}
                      >
                        {suggestions[idx].map((sug, sIdx) => {
                          const sName = sug.name || sug;
                          return (
                            <div
                              key={sIdx}
                              onClick={() => selectSuggestion(idx, sug)}
                              style={{
                                padding: '8px 12px',
                                fontSize: '12.5px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <span style={{ fontWeight: '600', color: '#0369a1' }}>{sName}</span>
                              {sug.count && (
                                <span style={{ fontSize: '11px', color: '#64748b' }}>({sug.count} أدوية)</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {activeIngredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIngredientField(idx)}
                      style={{
                        background: '#fee2e2',
                        border: 'none',
                        color: '#dc2626',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer'
                      }}
                      title="حذف المادة"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* الشكل الدوائي، عدد الوحدات، واسم الوحدة (ملء تلقائي) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                الشكل الدوائي (Dosage Form):
              </label>
              <select
                value={form.dosage_form}
                onChange={handleDosageFormChange}
                style={{
                  width: '100%',
                  padding: '10px 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  background: '#ffffff'
                }}
              >
                {Object.keys(DOSAGE_PRESETS).map(df => (
                  <option key={df} value={df}>{df}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                عدد الوحدات / الشرائط بالعلبة:
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.pack_size}
                onChange={(e) => setForm({ ...form, pack_size: parseInt(e.target.value || 1, 10) })}
                style={{
                  width: '100%',
                  padding: '10px 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  textAlign: 'center'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                اسم الوحدة الصيدلانية:
              </label>
              <input
                type="text"
                placeholder="شريط / أمبول / زجاجة"
                value={form.unit_name}
                onChange={(e) => setForm({ ...form, unit_name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                التركيز (Strength):
              </label>
              <input
                type="text"
                placeholder="مثال: 500mg أو 1g"
                value={form.strength}
                onChange={(e) => setForm({ ...form, strength: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  direction: 'ltr'
                }}
              />
            </div>
          </div>

          {/* السعر والباركود */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#047857', display: 'block', marginBottom: '5px' }}>
                السعر الرسمي للجمهور (ج.م) * :
              </label>
              <input
                type="number"
                step="0.25"
                min="0.5"
                placeholder="مثال: 87.00"
                value={form.public_price}
                onChange={(e) => setForm({ ...form, public_price: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '2px solid #059669',
                  fontSize: '15px',
                  fontWeight: '900',
                  color: '#047857',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '5px' }}>
                الباركود الدولي (GTIN / Barcode):
              </label>
              <input
                type="text"
                placeholder="مثال: 6221025030733"
                value={form.gtin_barcode}
                onChange={(e) => setForm({ ...form, gtin_barcode: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13.5px',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace'
                }}
              />
            </div>
          </div>

          {/* شارة المعاينة اللحظية لسعر الشريط */}
          {calculatedUnitPrice && form.pack_size > 1 && (
            <div
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                border: '1.5px solid #a7f3d0',
                borderRadius: '12px',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#065f46'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#059669" />
                <span style={{ fontSize: '13px', fontWeight: '800' }}>
                  سعر {form.unit_name || 'الشريط'} المحسوب تلقائياً:
                </span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: '900' }}>
                {calculatedUnitPrice} ج.م{' '}
                <span style={{ fontSize: '11px', fontWeight: '600' }}>(عبوة {form.pack_size} {form.unit_name || 'شرائط'})</span>
              </div>
            </div>
          )}

          {/* الشركة المصنعة والتصنيف */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                الشركة المصنعة (Manufacturer):
              </label>
              <input
                type="text"
                placeholder="مثال: Amoun / Eva / Novartis"
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                التصنيف الدوائي (Category):
              </label>
              <input
                type="text"
                placeholder="مثال: مضاد للتورم والالتهاب"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* خيارات الرقابة والحفظ */}
          <div
            style={{
              display: 'flex',
              gap: '24px',
              background: '#f8fafc',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap'
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', color: '#991b1b' }}>
              <input
                type="checkbox"
                checked={form.is_table_drug}
                onChange={(e) => setForm({ ...form, is_table_drug: e.target.checked })}
                style={{ width: '17px', height: '17px', accentColor: '#dc2626' }}
              />
              <span>صنف جدول رقابة دوائية 🚨</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', color: '#0369a1' }}>
              <input
                type="checkbox"
                checked={form.is_refrigerated}
                onChange={(e) => setForm({ ...form, is_refrigerated: e.target.checked })}
                style={{ width: '17px', height: '17px', accentColor: '#0284c7' }}
              />
              <span>يحفظ بالثلاجة (2 - 8 درجات مئوية) ❄️</span>
            </label>
          </div>

          {/* أزرار الإرسال */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                flex: 1,
                padding: '13px',
                background: isEditMode
                  ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14.5px',
                fontWeight: '900',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                boxShadow: isEditMode
                  ? '0 4px 14px rgba(2, 132, 199, 0.35)'
                  : '0 4px 14px rgba(5, 150, 105, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isSaving ? (
                <span>جاري الحفظ في الكتالوج المركزي...</span>
              ) : (
                <>
                  <Check size={18} />
                  <span>{isEditMode ? 'حفظ التعديلات في الكتالوج المركزي' : 'حفظ وإضافة الصنف للكتالوج المركزي'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '13px 22px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                fontWeight: '800',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
