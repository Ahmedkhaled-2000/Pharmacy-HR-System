import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Pill,
  DollarSign,
  Package,
  Barcode,
  Building2,
  AlertTriangle,
  Snowflake,
  Sparkles,
  Check
} from 'lucide-react';
import { outstockAddNewMedication } from '../../../utils/outstockApiClient';

/**
 * AddMedicationModal.jsx
 * نافذة إضافة دواء جديد للكتالوج المركزي
 * تدعم الحساب اللحظي لسعر الشريط، والتصميم الحديث، ومشاركتها بين الفرع والمالك وطلب العميل
 */
export default function AddMedicationModal({
  isOpen,
  initialData = {},
  onClose,
  onSaveSuccess
}) {
  const [form, setForm] = useState({
    trade_name_ar: '',
    trade_name_en: '',
    generic_name: '',
    dosage_form: 'أقراص (Tablets)',
    strength: '',
    pack_size: 1,
    unit_name: 'شريط',
    public_price: '',
    manufacturer: '',
    category: '',
    gtin_barcode: '',
    is_table_drug: false,
    is_refrigerated: false
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // تهيئة البيانات عند الفتح
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      const initName = initialData?.trade_name_ar || initialData?.name || '';
      const isEnglish = /^[a-zA-Z0-9\s\-+.]+$/.test(initName.trim());

      setForm({
        trade_name_ar: isEnglish ? '' : initName,
        trade_name_en: isEnglish ? initName : (initialData?.trade_name_en || ''),
        generic_name: initialData?.generic_name || '',
        dosage_form: initialData?.dosage_form || 'أقراص (Tablets)',
        strength: initialData?.strength || '',
        pack_size: initialData?.pack_size || 1,
        unit_name: initialData?.unit_name || 'شريط',
        public_price: initialData?.public_price ? String(initialData.public_price) : '',
        manufacturer: initialData?.manufacturer || '',
        category: initialData?.category || '',
        gtin_barcode: initialData?.gtin_barcode || '',
        is_table_drug: Boolean(initialData?.is_table_drug),
        is_refrigerated: Boolean(initialData?.is_refrigerated)
      });
    }
  }, [isOpen, initialData]);

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

    setIsSaving(true);
    try {
      const payload = {
        trade_name_ar: arName || enName,
        trade_name_en: enName || arName,
        generic_name: form.generic_name.trim(),
        dosage_form: form.dosage_form,
        strength: form.strength.trim(),
        pack_size: parseInt(form.pack_size, 10) || 1,
        unit_name: form.unit_name.trim() || 'شريط',
        public_price: pubPrice,
        unit_price: calculatedUnitPrice ? parseFloat(calculatedUnitPrice) : pubPrice,
        manufacturer: form.manufacturer.trim(),
        category: form.category.trim(),
        gtin_barcode: form.gtin_barcode.trim(),
        is_table_drug: form.is_table_drug,
        is_refrigerated: form.is_refrigerated
      };

      const res = await outstockAddNewMedication(payload);
      if (res?.success && res.medication) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('outstock:medication_added', { detail: res.medication }));
        }
        onSaveSuccess?.(res.medication);
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
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '680px',
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
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.18)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Plus size={24} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900' }}>
                إضافة دواء جديد للكتالوج المركزي
              </h3>
              <p style={{ margin: 0, fontSize: '12.5px', opacity: 0.9, marginTop: '2px' }}>
                يتم التحديث اللحظي ويظهر فوراً لكافة الفروع وإدارة المشتريات
              </p>
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

          {/* المادة الفعالة والتركيز */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '5px' }}>
                المادة الفعالة (Generic Active Ingredient):
              </label>
              <input
                type="text"
                placeholder="e.g. Chymotrypsin + Trypsin"
                value={form.generic_name}
                onChange={(e) => setForm({ ...form, generic_name: e.target.value })}
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

            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '5px' }}>
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
                  fontSize: '13.5px',
                  boxSizing: 'border-box',
                  direction: 'ltr'
                }}
              />
            </div>
          </div>

          {/* الشكل الدوائي وحجم العبوة */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                الشكل الدوائي:
              </label>
              <select
                value={form.dosage_form}
                onChange={(e) => setForm({ ...form, dosage_form: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="أقراص (Tablets)">أقراص (Tablets)</option>
                <option value="كبسولات (Capsules)">كبسولات (Capsules)</option>
                <option value="شراب (Syrup)">شراب (Syrup)</option>
                <option value="معلق (Suspension)">معلق (Suspension)</option>
                <option value="حقن (Injection)">حقن (Injection)</option>
                <option value="مرهم / كريم (Ointment/Cream)">مرهم / كريم</option>
                <option value="نقط (Drops)">نقط (Drops)</option>
                <option value="فوار / أكياس (Sachets)">فوار / أكياس</option>
                <option value="بخاخ (Inhaler/Spray)">بخاخ (Inhaler/Spray)</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                عدد الشرائط / الوحدات:
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
                اسم الوحدة:
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
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14.5px',
                fontWeight: '900',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
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
                  <span>حفظ وإضافة الصنف للكتالوج المركزي</span>
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
