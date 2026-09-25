import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pill, Search, AlertTriangle, Snowflake, Sparkles, Check, ChevronDown, RefreshCw, Layers } from 'lucide-react';
import { outstockSearchMedications, outstockGetSubstitutes } from '../../../utils/outstockApiClient';

// ── كتالوج محلي فائق السرعة لضمان العمل اللحظي دون أي تأخير ───────────────
const LOCAL_FALLBACK_MEDS = [
  {
    id: 'eg-441',
    trade_name_en: 'alphintern 30 f.c.tabs',
    trade_name_ar: 'الفنترن 30 قرص',
    generic_name: 'chymotrypsin+trypsin',
    dosage_form: 'أقراص',
    strength: '',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 87.00,
    unit_price: 29.00,
    manufacturer: 'Amoun',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221025030733',
    displayName: 'الفنترن 30 قرص (alphintern 30 f.c.tabs)'
  },
  {
    id: 'f-1',
    trade_name_en: 'Augmentin 1g Tablets',
    trade_name_ar: 'أوجمنتين 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 130.00,
    unit_price: 65.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أوجمنتين 1 جم أقراص (Augmentin 1g Tab)'
  },
  {
    id: 'f-2',
    trade_name_en: 'Augmentin 625mg Tablets',
    trade_name_ar: 'أوجمنتين 625 مجم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '625 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 95.00,
    unit_price: 47.50,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أوجمنتين 625 مجم أقراص (Augmentin 625mg)'
  },
  {
    id: 'f-3',
    trade_name_en: 'Augmentin 457mg Suspension',
    trade_name_ar: 'أوجمنتين 457 مجم معلق للشرب',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'معلق للشرب',
    strength: '457 mg / 5ml',
    pack_size: 1,
    unit_name: 'زجاجة',
    public_price: 75.00,
    unit_price: 75.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أوجمنتين 457 مجم معلق للشرب (Augmentin 457mg Susp)'
  },
  {
    id: 'f-4',
    trade_name_en: 'Curam 1g Tablets',
    trade_name_ar: 'كيورام 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 115.00,
    unit_price: 57.50,
    manufacturer: 'Sandoz',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كيورام 1 جم أقراص (Curam 1g Tab)'
  },
  {
    id: 'f-5',
    trade_name_en: 'Megamox 1g Tablets',
    trade_name_ar: 'ميجاموكس 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 105.00,
    unit_price: 52.50,
    manufacturer: 'Hikma Pharma',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'ميجاموكس 1 جم أقراص (Megamox 1g)'
  },
  {
    id: 'f-6',
    trade_name_en: 'Hibiotic 1g Tablets',
    trade_name_ar: 'هاي بيوتك 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 100.00,
    unit_price: 50.00,
    manufacturer: 'Amoun',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'هاي بيوتك 1 جم أقراص (Hibiotic 1g)'
  },
  {
    id: 'f-7',
    trade_name_en: 'Panadol Advance 500mg',
    trade_name_ar: 'بنادول أدفانس أزرق 500 مجم',
    generic_name: 'Paracetamol',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 45.00,
    unit_price: 22.50,
    manufacturer: 'Haleon / GSK',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'بنادول أدفانس أزرق (Panadol Advance 500mg)'
  },
  {
    id: 'f-8',
    trade_name_en: 'Panadol Extra',
    trade_name_ar: 'بنادول إكسترا أحمر',
    generic_name: 'Paracetamol + Caffeine',
    dosage_form: 'أقراص',
    strength: '500 mg / 65 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 55.00,
    unit_price: 27.50,
    manufacturer: 'Haleon / GSK',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'بنادول إكسترا أحمر (Panadol Extra)'
  },
  {
    id: 'f-9',
    trade_name_en: 'Panadol Cold & Flu All in One',
    trade_name_ar: 'بنادول كولد أند فلو البرتقالي',
    generic_name: 'Paracetamol + Phenylephrine',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 60.00,
    unit_price: 30.00,
    manufacturer: 'Haleon / GSK',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'بنادول كولد أند فلو (Panadol Cold & Flu)'
  },
  {
    id: 'f-10',
    trade_name_en: 'Cataflam 50mg Tablets',
    trade_name_ar: 'كتافلام 50 مجم أقراص',
    generic_name: 'Diclofenac Potassium',
    dosage_form: 'أقراص',
    strength: '50 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 58.00,
    unit_price: 29.00,
    manufacturer: 'Novartis',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كتافلام 50 مجم أقراص (Cataflam 50mg)'
  },
  {
    id: 'f-11',
    trade_name_en: 'Voltaren 100mg SR Tablets',
    trade_name_ar: 'فولتارين 100 مجم أقراص ممتدة المفعول',
    generic_name: 'Diclofenac Sodium',
    dosage_form: 'أقراص',
    strength: '100 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 75.00,
    unit_price: 37.50,
    manufacturer: 'Novartis',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'فولتارين 100 مجم ريتارد (Voltaren 100mg SR)'
  },
  {
    id: 'f-12',
    trade_name_en: 'Voltaren 75mg Ampoules',
    trade_name_ar: 'فولتارين 75 مجم حقن عضل',
    generic_name: 'Diclofenac Sodium',
    dosage_form: 'أمبولات حقن',
    strength: '75 mg',
    pack_size: 6,
    unit_name: 'أمبول',
    public_price: 60.00,
    unit_price: 10.00,
    manufacturer: 'Novartis',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'فولتارين 75 مجم حقن (Voltaren 75mg Amp)'
  },
  {
    id: 'f-13',
    trade_name_en: 'Concor 5mg Tablets',
    trade_name_ar: 'كونكور 5 مجم أقراص',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص',
    strength: '5 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 75.00,
    unit_price: 25.00,
    manufacturer: 'Merck Healthcare',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كونكور 5 مجم أقراص (Concor 5mg)'
  },
  {
    id: 'f-14',
    trade_name_en: 'Concor 2.5mg Tablets',
    trade_name_ar: 'كونكور 2.5 مجم أقراص (كور)',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص',
    strength: '2.5 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 60.00,
    unit_price: 20.00,
    manufacturer: 'Merck Healthcare',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كونكور 2.5 مجم كور (Concor 2.5mg Cor)'
  },
  {
    id: 'f-15',
    trade_name_en: 'Clexane 40mg Syringes',
    trade_name_ar: 'كليكسان 40 مجم حقن سيولة',
    generic_name: 'Enoxaparin Sodium',
    dosage_form: 'حقن جاهزة تحت الجلد',
    strength: '40 mg / 0.4 ml',
    pack_size: 2,
    unit_name: 'سرنجة',
    public_price: 145.00,
    unit_price: 72.50,
    manufacturer: 'Sanofi',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كليكسان 40 مجم حقن (Clexane 40mg Syringe)'
  },
  {
    id: 'f-16',
    trade_name_en: 'Clexane 60mg Syringes',
    trade_name_ar: 'كليكسان 60 مجم حقن سيولة',
    generic_name: 'Enoxaparin Sodium',
    dosage_form: 'حقن جاهزة تحت الجلد',
    strength: '60 mg / 0.6 ml',
    pack_size: 2,
    unit_name: 'سرنجة',
    public_price: 195.00,
    unit_price: 97.50,
    manufacturer: 'Sanofi',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كليكسان 60 مجم حقن (Clexane 60mg Syringe)'
  },
  {
    id: 'f-17',
    trade_name_en: 'Glucophage 1000mg Tablets',
    trade_name_ar: 'جلوكوفاج 1000 مجم أقراص',
    generic_name: 'Metformin Hydrochloride',
    dosage_form: 'أقراص',
    strength: '1000 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 65.00,
    unit_price: 21.67,
    manufacturer: 'Merck Healthcare',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'جلوكوفاج 1000 مجم أقراص (Glucophage 1000mg)'
  },
  {
    id: 'f-18',
    trade_name_en: 'Antinal 200mg Capsules',
    trade_name_ar: 'أنتينال 200 مجم كبسولات مطهر معوي',
    generic_name: 'Nifuroxazide',
    dosage_form: 'كبسولات',
    strength: '200 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 42.00,
    unit_price: 21.00,
    manufacturer: 'Amoun',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أنتينال 200 مجم كبسول (Antinal 200mg)'
  },
  {
    id: 'f-19',
    trade_name_en: 'Nexium 40mg Tablets',
    trade_name_ar: 'نيكسيوم 40 مجم أقراص حموضة',
    generic_name: 'Esomeprazole',
    dosage_form: 'أقراص',
    strength: '40 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 160.00,
    unit_price: 80.00,
    manufacturer: 'AstraZeneca',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'نيكسيوم 40 مجم أقراص (Nexium 40mg)'
  },
  {
    id: 'f-20',
    trade_name_en: 'Controloc 40mg Tablets',
    trade_name_ar: 'كونترولوك 40 مجم أقراص معدة',
    generic_name: 'Pantoprazole',
    dosage_form: 'أقراص',
    strength: '40 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 110.00,
    unit_price: 55.00,
    manufacturer: 'Takeda',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كونترولوك 40 مجم أقراص (Controloc 40mg)'
  },
  {
    id: 'f-21',
    trade_name_en: 'Ventolin Inhaler 100mcg',
    trade_name_ar: 'فنتولين بخاخ صدر 100 ميكروجرام',
    generic_name: 'Salbutamol',
    dosage_form: 'بخاخ فموي',
    strength: '100 mcg',
    pack_size: 1,
    unit_name: 'بخاخة',
    public_price: 55.00,
    unit_price: 55.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'فنتولين بخاخ صدر (Ventolin Inhaler)'
  },
  {
    id: 'f-22',
    trade_name_en: 'Neurontin 300mg Capsules',
    trade_name_ar: 'نيورونتين 300 مجم كبسولات (صنف جدول)',
    generic_name: 'Gabapentin',
    dosage_form: 'كبسولات',
    strength: '300 mg',
    pack_size: 5,
    unit_name: 'شريط',
    public_price: 195.00,
    unit_price: 39.00,
    manufacturer: 'Pfizer',
    is_table_drug: true,
    is_refrigerated: false,
    displayName: 'نيورونتين 300 مجم كبسول (Neurontin 300mg) 🚨 جدول'
  }
];

export default function MedicationAutocompleteInput({
  value = '',
  unitType = 'pack',
  selectedMed = null,
  onMedicationSelect,
  onTextChange,
  placeholder = 'اسم الدواء أو التركيز (مثل: أوجمنتين 1 جم)...',
  required = true,
  disabled = false
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [substitutes, setSubstitutes] = useState([]);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);
  const [showSubstitutesModal, setShowSubstitutesModal] = useState(false);

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // مزامنة القيمة عند تغيرها خارجياً
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // إغلاق القائمة المنسدلة عند النقر خارج المكوّن
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // دالة البحث التلقائي مع Debounce
  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputValue(text);
    if (onTextChange) onTextChange(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const clean = text.trim();
    if (clean.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        // 1. الاستعلام من خادم الـ API لهيئة الدواء ودراج آي
        const res = await outstockSearchMedications(clean, 12);
        if (res?.success && Array.isArray(res.medications) && res.medications.length > 0) {
          setSuggestions(res.medications);
          setIsOpen(true);
          setActiveIndex(-1);
        } else {
          // 2. استخدام الفلترة المحلية السريعة كـ Fallback
          const s = clean.toLowerCase();
          const localMatched = LOCAL_FALLBACK_MEDS.filter(m =>
            m.trade_name_en.toLowerCase().includes(s) ||
            m.trade_name_ar.includes(clean) ||
            m.generic_name.toLowerCase().includes(s)
          );
          setSuggestions(localMatched);
          setIsOpen(localMatched.length > 0);
          setActiveIndex(-1);
        }
      } catch (err) {
        console.warn('Medication autocomplete search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 180);
  };

  // اختيار صنف من القائمة
  const handleSelectMedication = (med) => {
    const finalDisplayName = med.displayName || `${med.trade_name_ar} (${med.trade_name_en})`;
    setInputValue(finalDisplayName);
    setIsOpen(false);
    setSuggestions([]);

    if (onMedicationSelect) {
      onMedicationSelect(finalDisplayName, med);
    }
  };

  // التنقل بالأسهم واختيار بزر Enter
  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        handleSelectMedication(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // استعراض البدائل والمثائل للصنف الحالي (Drug Eye Equivalents)
  const handleFetchSubstitutes = async () => {
    if (!selectedMed?.generic_name) return;
    setIsLoadingSubs(true);
    setShowSubstitutesModal(true);
    try {
      const res = await outstockGetSubstitutes(selectedMed.generic_name, selectedMed.id);
      if (res?.success && Array.isArray(res.substitutes)) {
        setSubstitutes(res.substitutes);
      } else {
        // Fallback من القائمة المحلية
        const localSubs = LOCAL_FALLBACK_MEDS.filter(m =>
          m.generic_name.toLowerCase() === selectedMed.generic_name.toLowerCase() &&
          m.trade_name_en !== selectedMed.trade_name_en
        );
        setSubstitutes(localSubs);
      }
    } catch (err) {
      console.warn('Failed to fetch substitutes:', err);
    } finally {
      setIsLoadingSubs(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', flex: 1 }}>
      {/* حقل الإدخال الذكي */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="outstock-form-input"
          style={{
            paddingRight: '36px',
            paddingLeft: selectedMed ? '100px' : '36px',
            minHeight: '40px',
            fontSize: '13px',
            fontWeight: '600',
            borderColor: selectedMed ? '#0d9488' : undefined,
            backgroundColor: selectedMed ? '#f0fdfa' : undefined
          }}
        />

        {/* أيقونة البحث / التحميل في البداية */}
        <div style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: selectedMed ? '#0d9488' : '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none'
        }}>
          {isLoading ? (
            <RefreshCw size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Pill size={16} />
          )}
        </div>

        {/* شارة السعر السريع أو زر استعراض البدائل داخل الحقل */}
        {selectedMed && (
          <div style={{
            position: 'absolute',
            left: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={handleFetchSubstitutes}
              title="عرض المثائل والبدائل المعتمدة (Drug Eye)"
              style={{
                background: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                borderRadius: '6px',
                padding: '2px 7px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <Sparkles size={12} />
              <span>بدائل</span>
            </button>
          </div>
        )}
      </div>

      {/* شارة تنبيه أدوية الجدول أو الحفظ في الثلاجة تحت الحقل */}
      {selectedMed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
          {selectedMed.is_table_drug && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#dc2626'
            }}>
              <AlertTriangle size={12} />
              صنف جدول ومؤثرات عقلية (EDA Controlled)
            </span>
          )}

          {selectedMed.is_refrigerated && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#2563eb'
            }}>
              <Snowflake size={12} />
              يحفظ بالثلاجة (2-8°C)
            </span>
          )}

          {selectedMed.pack_size > 1 && (
            <span style={{
              fontSize: '11px',
              color: '#64748b',
              fontWeight: '600'
            }}>
              📦 العلبة تحتوي على {selectedMed.pack_size} {selectedMed.unit_name || 'شرائط'} (سعر الشريط: {selectedMed.unit_price} ج.م)
            </span>
          )}
        </div>
      )}

      {/* ── القائمة المنسدلة الذكية (Autocomplete Dropdown) ── */}
      {isOpen && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            left: 0,
            background: '#ffffff',
            border: '1.5px solid #cbd5e1',
            borderRadius: '12px',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.15)',
            maxHeight: '320px',
            overflowY: 'auto',
            zIndex: 9999,
            padding: '4px'
          }}
        >
          <div style={{
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#64748b',
            background: '#f8fafc',
            borderRadius: '8px',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>💊 نتائج البحث من قاعدة بيانات هيئة الدواء المصرية ودراج آي ({suggestions.length})</span>
            <span style={{ fontSize: '10px', color: '#0d9488' }}>استخدم الأسهم للتنقل و Enter للاختيار</span>
          </div>

          {suggestions.map((med, idx) => {
            const isSelected = activeIndex === idx;
            const packPrice = parseFloat(med.public_price || 0);
            const unitPrice = parseFloat(med.unit_price || (packPrice / (med.pack_size || 1))).toFixed(2);

            return (
              <div
                key={med.id || idx}
                onClick={() => handleSelectMedication(med)}
                onMouseEnter={() => setActiveIndex(idx)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#f0fdfa' : '#ffffff',
                  border: isSelected ? '1px solid #99f6e4' : '1px solid transparent',
                  marginBottom: '2px',
                  transition: 'all 0.12s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>
                      {med.trade_name_ar}
                    </span>
                    <span style={{ fontSize: '12px', color: '#475569', direction: 'ltr', fontWeight: '600' }}>
                      ({med.trade_name_en})
                    </span>
                    {med.is_table_drug && (
                      <span style={{
                        padding: '1px 5px',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}>
                        جدول 🚨
                      </span>
                    )}
                  </div>

                  {/* بطاقة الأسعار الرسمية (علبة وشريط) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{
                      background: '#ecfdf5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '800'
                    }}>
                      علبة: {packPrice} ج.م
                    </span>

                    {med.pack_size > 1 && (
                      <span style={{
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #e2e8f0',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: '700'
                      }}>
                        {med.unit_name || 'شريط'}: {unitPrice} ج.م
                      </span>
                    )}
                  </div>
                </div>

                {/* المادة الفعالة والشكل الصيدلي والشركة */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: '#64748b',
                  marginTop: '4px'
                }}>
                  <span>🧬 المادة: <strong style={{ color: '#0284c7' }}>{med.generic_name}</strong></span>
                  <span>•</span>
                  <span>الشكل: {med.dosage_form}</span>
                  {med.manufacturer && (
                    <>
                      <span>•</span>
                      <span>الشركة: {med.manufacturer}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── نافذة استعراض المثائل والبدائل الدوائية (Drug Eye Modal) ── */}
      {showSubstitutesModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1.5px solid #cbd5e1'
          }}>
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={18} color="#0284c7" />
                  <span>المثائل والبدائل المعتمدة (منظومة Drug Eye)</span>
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                  المادة الفعالة: <strong style={{ color: '#0369a1' }}>{selectedMed?.generic_name}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubstitutesModal(false)}
                className="outstock-modal-close"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
              {isLoadingSubs ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
                  <div>جاري البحث عن البدائل والمثائل في قاعدة بيانات الأدوية...</div>
                </div>
              ) : substitutes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  لا توجد بدائل مسجلة بنفس المادة الفعالة حالياً.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {substitutes.map((sub, idx) => (
                    <div
                      key={sub.id || idx}
                      style={{
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#ffffff',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '13.5px', color: '#0f172a' }}>
                          {sub.trade_name_ar} ({sub.trade_name_en})
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                          {sub.dosage_form} • الشركة: {sub.manufacturer || 'محلية'}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0d9488', marginTop: '4px' }}>
                          علبة: {sub.public_price} ج.م {sub.pack_size > 1 && `(شريط: ${sub.unit_price} ج.م)`}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          handleSelectMedication(sub);
                          setShowSubstitutesModal(false);
                        }}
                        className="outstock-btn outstock-btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', flexShrink: 0 }}
                      >
                        <Check size={14} />
                        <span>اختيار البديل</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'left', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
              <button
                type="button"
                onClick={() => setShowSubstitutesModal(false)}
                className="outstock-btn outstock-btn-secondary"
                style={{ padding: '6px 16px', fontSize: '12.5px' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
