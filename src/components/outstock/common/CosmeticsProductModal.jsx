import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  ExternalLink,
  Camera,
  Heart,
  Tag,
  CheckCircle2,
  Copy,
  Building2,
  Share2,
  Save,
  HelpCircle,
  ShieldCheck,
  Package,
  Pill,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  DollarSign,
  Barcode,
  Layers,
  Edit2
} from 'lucide-react';
import {
  outstockConvertMedicationType,
  outstockSearchActiveIngredients,
  outstockAddNewMedication,
  outstockUpdateMedicationDetails
} from '../../../utils/outstockApiClient';

/**
 * CosmeticsProductModal.jsx
 * بطاقة وكارتة مستحضرات التجميل والعناية الفاخرة (Dual-Mode: إضافة / تعديل / استعراض)
 * - نمط الإضافة (Add Mode) لإدراج مستحضر جديد بالكتالوج المركزي
 * - نمط التعديل (Edit Mode) لتحديث مواصفات وصور وأسعار الصنف
 * - رفع وسحب وإفلات الصور (Drag & Drop) مع معاينة فورية Base64 أو رابط خارجي
 * - مزامنة كاملة مع قاعدة بيانات الكتالوج
 */
export default function CosmeticsProductModal({
  isOpen,
  onClose,
  item = null,
  mode = 'view', // 'add' | 'edit' | 'view'
  onSaved,
  showToast
}) {
  const [currentMode, setCurrentMode] = useState(mode);
  const [activeTab, setActiveTab] = useState('specs'); // 'specs' | 'usage' | 'orders'

  // بيانات الصنف الأساسية
  const [tradeNameAr, setTradeNameAr] = useState('');
  const [tradeNameEn, setTradeNameEn] = useState('');
  const [brand, setBrand] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [categoryType, setCategoryType] = useState('skincare'); // skincare, haircare, suncare, makeup, bodycare, perfume
  const [skinType, setSkinType] = useState('all'); // all, oily, dry, combo, sensitive, normal, damaged_hair
  const [publicPrice, setPublicPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [gtinBarcode, setGtinBarcode] = useState('');
  const [dosageForm, setDosageForm] = useState('عبوة تجميلية');

  // الاستخدام والمواد الفعالة
  const [instructions, setInstructions] = useState('');
  const [activeIngredients, setActiveIngredients] = useState('');
  const [ingredientList, setIngredientList] = useState([{ name: '', concentration: '' }]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState({});

  // صورة المستحضر والروابط
  const [productLink, setProductLink] = useState('');
  const [productImage, setProductImage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // حالات التنفيذ
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const isAddMode = currentMode === 'add' || !item?.id;
  const isEditMode = currentMode === 'edit' || isAddMode;

  // تهيئة الحقول عند فتح النافذة
  useEffect(() => {
    if (!isOpen) return;
    setCurrentMode(mode);

    if (item) {
      setTradeNameAr(item.trade_name_ar || item.medication_name || item.name || '');
      setTradeNameEn(item.trade_name_en || item.medication_name_en || '');
      setBrand(item.brand || item.manufacturer || '');
      setManufacturer(item.manufacturer || item.brand || '');
      setCategoryType(item.category_type || item.category || 'skincare');
      setSkinType(item.target_skin_type || item.skin_type || 'all');
      setPublicPrice(item.public_price ? String(item.public_price) : (item.price ? String(item.price) : ''));
      setCostPrice(item.estimated_cost_price ? String(item.estimated_cost_price) : '');
      setGtinBarcode(item.gtin_barcode || item.barcode || '');
      setDosageForm(item.dosage_form || 'عبوة تجميلية');
      setInstructions(item.usage_instructions || item.instructions || '');

      const attachedImg = item.image_url ||
        item.medication_image_url ||
        item.imageUrl ||
        item.medicationImageUrl ||
        (item.item_details || []).find(d => d.medicationImageUrl || d.imageUrl)?.medicationImageUrl ||
        '';
      setProductImage(attachedImg);

      const attachedLink = item.item_link ||
        item.itemLink ||
        (item.item_details || []).find(d => d.itemLink)?.itemLink ||
        '';
      setProductLink(attachedLink);

      // استرجاع المكونات
      if (Array.isArray(item.active_ingredients_list) && item.active_ingredients_list.length > 0) {
        setIngredientList(item.active_ingredients_list.map(i => typeof i === 'string' ? { name: i, concentration: '' } : i));
      } else if (item.generic_name || item.active_ingredients) {
        const raw = item.generic_name || item.active_ingredients;
        const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
        setIngredientList(parts.map(p => ({ name: p, concentration: '' })));
      } else {
        setIngredientList([{ name: '', concentration: '' }]);
      }

      // محاولة استرجاع مواصفات محلية إضافية
      const prodName = item.medication_name || item.trade_name_ar || '';
      if (prodName) {
        try {
          const savedData = localStorage.getItem(`outstock_cosmetic_${encodeURIComponent(prodName.trim().toLowerCase())}`);
          if (savedData) {
            const parsed = JSON.parse(savedData);
            if (!brand && parsed.brand) setBrand(parsed.brand);
            if (!instructions && parsed.instructions) setInstructions(parsed.instructions);
            if (!attachedImg && parsed.productImage) setProductImage(parsed.productImage);
            if (!attachedLink && parsed.productLink) setProductLink(parsed.productLink);
          }
        } catch (_) {}
      }
    } else {
      // وضع إضافة صنف جديد فارغ
      setTradeNameAr('');
      setTradeNameEn('');
      setBrand('');
      setManufacturer('');
      setCategoryType('skincare');
      setSkinType('all');
      setPublicPrice('');
      setCostPrice('');
      setGtinBarcode('');
      setDosageForm('عبوة تجميلية');
      setInstructions('');
      setProductImage('');
      setProductLink('');
      setIngredientList([{ name: '', concentration: '' }]);
    }
  }, [isOpen, item, mode]);

  // إدارة سحب وإفلات ورفع الصور
  const handleImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('⚠️ يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast?.('⚠️ حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setProductImage(e.target?.result || '');
      showToast?.('📸 تم تحميل صورة المستحضر بنجاح');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // دوال إدارة المواد الفعالة المتعددة
  const handleAddIngredient = () => {
    setIngredientList(prev => [...prev, { name: '', concentration: '' }]);
  };

  const handleRemoveIngredient = (index) => {
    setIngredientList(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [{ name: '', concentration: '' }];
    });
  };

  const handleIngredientNameChange = async (index, val) => {
    setIngredientList(prev => {
      const next = [...prev];
      next[index] = { ...next[index], name: val };
      return next;
    });

    if (val && val.trim().length >= 2) {
      try {
        const res = await outstockSearchActiveIngredients(val.trim());
        if (res?.success && Array.isArray(res.ingredients)) {
          setIngredientSuggestions(prev => ({ ...prev, [index]: res.ingredients }));
        }
      } catch (_) {}
    } else {
      setIngredientSuggestions(prev => ({ ...prev, [index]: [] }));
    }
  };

  const handleSelectIngredientSuggestion = (index, ing) => {
    setIngredientList(prev => {
      const next = [...prev];
      next[index] = { ...next[index], name: ing.scientific_name || ing.name || '' };
      return next;
    });
    setIngredientSuggestions(prev => ({ ...prev, [index]: [] }));
  };

  const handleIngredientConcentrationChange = (index, val) => {
    setIngredientList(prev => {
      const next = [...prev];
      next[index] = { ...next[index], concentration: val };
      return next;
    });
  };

  // حفظ الصنف ومزامنته مع الكتالوج المركزي
  const handleSaveProduct = async (e) => {
    e?.preventDefault();

    if (!tradeNameAr.trim()) {
      showToast?.('⚠️ يرجى إدخال اسم المستحضر بالعربية');
      return;
    }
    const numPrice = parseFloat(publicPrice);
    if (isNaN(numPrice) || numPrice < 0) {
      showToast?.('⚠️ يرجى إدخال سعر بيع صحيح');
      return;
    }

    setIsSaving(true);
    try {
      const compositeIngredients = ingredientList
        .map(i => `${i.name || ''} ${i.concentration || ''}`.trim())
        .filter(Boolean)
        .join(', ');

      const payload = {
        trade_name_ar: tradeNameAr.trim(),
        trade_name_en: tradeNameEn.trim() || tradeNameAr.trim(),
        brand: brand.trim() || null,
        manufacturer: (manufacturer || brand).trim() || null,
        public_price: numPrice,
        estimated_cost_price: parseFloat(costPrice) || null,
        item_type: 'cosmetics',
        dosage_form: dosageForm.trim() || 'عبوة تجميلية',
        pack_size: 1,
        category: getCategoryLabel(categoryType),
        target_skin_type: skinType,
        usage_instructions: instructions.trim() || null,
        generic_name: compositeIngredients || null,
        active_ingredients_list: ingredientList.filter(i => i.name.trim()),
        image_url: productImage || null,
        item_link: productLink || null,
        gtin_barcode: gtinBarcode.trim() || null
      };

      let result;
      if (isAddMode) {
        result = await outstockAddNewMedication(payload);
      } else {
        const medId = item.id || item.medication_id;
        result = await outstockUpdateMedicationDetails(medId, payload);
      }

      if (result?.success) {
        // حفظ في التخزين المحلي للاسترجاع السريع
        try {
          const storageKey = `outstock_cosmetic_${encodeURIComponent(tradeNameAr.trim().toLowerCase())}`;
          localStorage.setItem(storageKey, JSON.stringify({
            ...payload,
            productImage,
            productLink,
            savedAt: new Date().toISOString()
          }));
        } catch (_) {}

        showToast?.(`✅ تم ${isAddMode ? 'إضافة' : 'تحديث'} كارتة مستحضر التجميل بنجاح بالكتالوج 💄`);
        onSaved?.(result.medication || payload);
        onClose?.();
      } else {
        showToast?.(result?.error || 'تعذر حفظ المستحضر بالكتالوج');
      }
    } catch (err) {
      console.error('Save cosmetics product error:', err);
      showToast?.('حدث خطأ أثناء الاتصال بالخادم لحفظ المستحضر');
    } finally {
      setIsSaving(false);
    }
  };

  // تحويل إلى صنف دوائي
  const handleConvertTypeToMedication = async () => {
    const medId = item?.medication_id || item?.id;
    if (!medId || isConverting) return;
    if (!window.confirm(`هل أنت متأكد من تحويل مستحضر التجميل "${tradeNameAr || tradeNameEn}" إلى صنف دوائي بالكتالوج 💊؟`)) {
      return;
    }
    setIsConverting(true);
    try {
      const res = await outstockConvertMedicationType(medId, 'medication');
      if (res?.success) {
        showToast?.('✅ تم تحويل الصنف بنجاح إلى دواء 💊🔄');
        onSaved?.();
        onClose?.();
      } else {
        showToast?.(`⚠️ فشل التحويل: ${res?.error || 'حدث خطأ'}`);
      }
    } catch (e) {
      showToast?.(`❌ خطأ: ${e.message}`);
    } finally {
      setIsConverting(false);
    }
  };

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case 'skincare': return 'عناية بالبشرة (Skin Care)';
      case 'haircare': return 'عناية بالشعر (Hair Care)';
      case 'suncare': return 'واقي شمس وحماية (Sunscreen)';
      case 'makeup': return 'مكياج وتجميل (Make-up)';
      case 'bodycare': return 'عناية بالجسم (Body Care)';
      case 'perfume': return 'عطور ومسك (Perfumes)';
      default: return 'مستحضرات تجميل';
    }
  };

  const getSkinTypeLabel = (st) => {
    switch (st) {
      case 'oily': return '🌿 البشرة الدهنية والمختلطة';
      case 'dry': return '💧 البشرة الجافة والجافة جداً';
      case 'sensitive': return '🛡️ البشرة الحساسة والمتهيجة';
      case 'combo': return '⚖️ البشرة المختلطة العادية';
      case 'damaged_hair': return '💇‍♀️ الشعر التالف والمعالج';
      default: return '✨ لكافة أنواع البشرة والشعر';
    }
  };

  const handleCopySummary = () => {
    const summary = `💄 *بطاقة مستحضر التجميل والعناية*
━━━━━━━━━━━━━━━━━━
🔹 *الصنف:* ${tradeNameAr || tradeNameEn}
🏢 *الماركة / الشركة:* ${brand || 'غير محدد'}
🏷️ *التصنيف:* ${getCategoryLabel(categoryType)}
🎯 *النوع المستهدف:* ${getSkinTypeLabel(skinType)}
💰 *السعر الرسمي:* ${publicPrice ? `${parseFloat(publicPrice).toFixed(2)} ج.م` : 'غير محدد'}
${instructions ? `📋 *طريقة الاستخدام:* ${instructions}\n` : ''}${productLink ? `🔗 *رابط المستحضر:* ${productLink}\n` : ''}━━━━━━━━━━━━━━━━━━
سلسلة صيدليات الأمانة - إدارة مستحضرات التجميل`;

    navigator.clipboard?.writeText(summary);
    setIsCopied(true);
    showToast?.('📋 تم نسخ بطاقة المستحضر إلى الحافظة بنجاح');
    setTimeout(() => setIsCopied(false), 2500);
  };

  // إغلاق بزر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (!isSaving) onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  // منع تمرير الخلفية
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="outstock-modal-backdrop"
      onClick={onClose}
      style={{
        zIndex: 100050,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="outstock-modal-panel"
        style={{
          maxWidth: '740px',
          width: '96%',
          maxHeight: '92vh',
          borderRadius: '20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(219, 39, 119, 0.35)',
          background: '#ffffff',
          direction: 'rtl'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── الرأس الفاخر للبطاقة ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #fbcfe8 100%)',
            borderBottom: '1px solid #f472b6',
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: '#ffffff',
                border: '1.5px solid #f472b6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 6px -1px rgba(219, 39, 119, 0.2)',
                color: '#db2777'
              }}
            >
              <Sparkles size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: '#db2777',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: '900',
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}
                >
                  💄 COSMETICS MASTER CARD
                </span>
                <span style={{ fontSize: '12px', color: '#9d174d', fontWeight: '800' }}>
                  {isAddMode ? 'إضافة صنف تجميلي جديد' : (isEditMode ? 'تعديل بيانات المستحضر' : 'كارتة الصنف التجميلي')}
                </span>
              </div>
              <h3 style={{ margin: '4px 0 0', color: '#831843', fontSize: '18px', fontWeight: '900' }}>
                {tradeNameAr || tradeNameEn || 'مستحضر تجميل جديد'}
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isAddMode && currentMode === 'view' && (
              <button
                type="button"
                onClick={() => setCurrentMode('edit')}
                className="outstock-btn"
                style={{
                  background: '#ffffff',
                  border: '1px solid #db2777',
                  color: '#db2777',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <Edit2 size={13} />
                <span>تعديل الكارتة ✏️</span>
              </button>
            )}

            {!isAddMode && (
              <button
                type="button"
                onClick={handleConvertTypeToMedication}
                disabled={isConverting}
                className="outstock-btn"
                style={{
                  background: '#ffffff',
                  border: '1px solid #0d9488',
                  color: '#0f766e',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: isConverting ? 'not-allowed' : 'pointer',
                  opacity: isConverting ? 0.7 : 1
                }}
                title="تحويل كارتة المستحضر إلى صنف دوائي"
              >
                <Pill size={14} color="#0d9488" />
                <span>تحويل لدواء 💊🔄</span>
              </button>
            )}

            {!isAddMode && (
              <button
                type="button"
                onClick={handleCopySummary}
                className="outstock-btn"
                style={{
                  background: '#ffffff',
                  border: '1px solid #f472b6',
                  color: '#be185d',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                {isCopied ? <CheckCircle2 size={14} color="#059669" /> : <Copy size={14} />}
                <span>{isCopied ? 'تم النسخ ✓' : 'نسخ البطاقة'}</span>
              </button>
            )}

            <button
              type="button"
              className="outstock-modal-close"
              onClick={onClose}
              style={{
                background: '#ffffff',
                border: '1px solid #fbcfe8',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={18} color="#831843" />
            </button>
          </div>
        </div>

        {/* ── شريط التنقل بين التبويبات ── */}
        <div
          style={{
            display: 'flex',
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            padding: '4px 18px',
            gap: '8px'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('specs')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'specs' ? '3px solid #db2777' : '3px solid transparent',
              color: activeTab === 'specs' ? '#db2777' : '#64748b',
              fontWeight: activeTab === 'specs' ? '900' : '700',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Tag size={15} />
            <span>البيانات الأساسية والأسعار</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('usage')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'usage' ? '3px solid #db2777' : '3px solid transparent',
              color: activeTab === 'usage' ? '#db2777' : '#64748b',
              fontWeight: activeTab === 'usage' ? '900' : '700',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={15} />
            <span>الاستخدام والمواد الفعالة</span>
          </button>

          {item && (item.orders_count || (item.item_details || []).length > 0) && (
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === 'orders' ? '3px solid #db2777' : '3px solid transparent',
                color: activeTab === 'orders' ? '#db2777' : '#64748b',
                fontWeight: activeTab === 'orders' ? '900' : '700',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Building2 size={15} />
              <span>طلبات الفروع والعملاء ({item.orders_count || item.item_details.length})</span>
            </button>
          )}
        </div>

        {/* ── جسم البطاقة والقوالب ── */}
        <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {activeTab === 'specs' && (
              <>
                {/* 1. رفع الصورة مع دعم السحب والإفلات ومعاينة فورية */}
                <div
                  style={{
                    background: '#fdf2f8',
                    border: isDragOver ? '2px dashed #db2777' : '1.5px dashed #f472b6',
                    borderRadius: '14px',
                    padding: '16px',
                    transition: 'all 0.2s ease'
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: productImage ? '130px 1fr' : '1fr', gap: '16px', alignItems: 'center' }}>
                    {productImage && (
                      <div style={{ textAlign: 'center', position: 'relative' }}>
                        <img
                          src={productImage}
                          alt="صورة المستحضر"
                          style={{
                            width: '120px',
                            height: '120px',
                            objectFit: 'contain',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1.5px solid #fbcfe8',
                            padding: '4px'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setProductImage('')}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '22px',
                            height: '22px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px'
                          }}
                          title="حذف الصورة"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#831843', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Camera size={16} color="#db2777" />
                          <span>صورة المستحضر (اسحب وأفلت الملف هنا أو اختر من جهازك) 📷</span>
                        </span>
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="outstock-btn"
                          style={{
                            background: '#db2777',
                            color: '#ffffff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <Upload size={14} />
                          <span>رفع صورة من الجهاز 📤</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="url"
                          placeholder="أو أدخل رابط صورة المنتج المباشر (URL)..."
                          value={productImage}
                          onChange={(e) => setProductImage(e.target.value)}
                          className="outstock-form-input"
                          dir="ltr"
                          style={{ fontSize: '12px', background: '#ffffff', flex: 1 }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="url"
                          placeholder="رابط صفحة المستحضر الخارجية بالمتجر / الموقع الرسمي (https://...)"
                          value={productLink}
                          onChange={(e) => setProductLink(e.target.value)}
                          className="outstock-form-input"
                          dir="ltr"
                          style={{ fontSize: '12px', background: '#ffffff', flex: 1 }}
                        />
                        {productLink && (
                          <a
                            href={productLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: '#be185d',
                              color: '#ffffff',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              fontSize: '11px',
                              fontWeight: '800',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <ExternalLink size={12} />
                            <span>فتح الرابط</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. أسماء الصنف والماركة والتصنيف */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                      اسم المستحضر بالعربية * :
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: لاروش بوزيه إيفاكلار دو بلس جل مرطب"
                      value={tradeNameAr}
                      onChange={(e) => setTradeNameAr(e.target.value)}
                      className="outstock-form-input"
                      style={{ fontWeight: '700' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                      اسم المستحضر بالإنجليزية:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. La Roche-Posay Effaclar Duo+M"
                      value={tradeNameEn}
                      onChange={(e) => setTradeNameEn(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ fontWeight: '600' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                      العلامة التجارية / الماركة (Brand):
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: La Roche-Posay, CeraVe, Vichy..."
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="outstock-form-input"
                      style={{ fontWeight: '700' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                      الجهة المصنعة / المورد الرئيسي:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: L'Oréal Paris / لوريال العالمية"
                      value={manufacturer}
                      onChange={(e) => setManufacturer(e.target.value)}
                      className="outstock-form-input"
                    />
                  </div>
                </div>

                {/* 3. التسعير والباركود */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'block', marginBottom: '4px' }}>
                      سعر البيع للجمهور (ج.م) * :
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      placeholder="0.00"
                      value={publicPrice}
                      onChange={(e) => setPublicPrice(e.target.value)}
                      className="outstock-form-input"
                      style={{ fontWeight: 'bold', fontSize: '14px', textAlign: 'center', color: '#0f766e' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '4px' }}>
                      سعر التكلفة التقريبي (ج.م):
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      className="outstock-form-input"
                      style={{ fontWeight: 'bold', fontSize: '14px', textAlign: 'center' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '4px' }}>
                      الباركود الدولي (GTIN):
                    </label>
                    <input
                      type="text"
                      placeholder="الباركود (Scan)..."
                      value={gtinBarcode}
                      onChange={(e) => setGtinBarcode(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ textAlign: 'center', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                {/* 4. التصنيف ونوع البشرة المستهدف */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                      🏷️ التصنيف الرئيسي:
                    </label>
                    <select
                      value={categoryType}
                      onChange={(e) => setCategoryType(e.target.value)}
                      className="outstock-form-select"
                      style={{ fontWeight: '700' }}
                    >
                      <option value="skincare">🌸 عناية بالبشرة (Skin Care)</option>
                      <option value="haircare">💇‍♀️ عناية بالشعر (Hair Care)</option>
                      <option value="suncare">☀️ واقي شمس وحماية (Sun Care)</option>
                      <option value="makeup">💄 مكياج وتجميل (Make-up)</option>
                      <option value="bodycare">🧴 عناية بالجسم (Body Care)</option>
                      <option value="perfume">✨ عطور ومسك (Perfumes)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                      🎯 نوع البشرة / الشعر المناسب:
                    </label>
                    <select
                      value={skinType}
                      onChange={(e) => setSkinType(e.target.value)}
                      className="outstock-form-select"
                      style={{ fontWeight: '700' }}
                    >
                      <option value="all">✨ لكافة أنواع البشرة والشعر (All Types)</option>
                      <option value="oily">🌿 البشرة الدهنية والمختلطة المعرضة للحبوب (Oily/Acne)</option>
                      <option value="dry">💧 البشرة الجافة والجافة جداً (Dry/Very Dry)</option>
                      <option value="sensitive">🛡️ البشرة الحساسة والمتهيجة (Sensitive)</option>
                      <option value="combo">⚖️ البشرة المختلطة العادية (Combination)</option>
                      <option value="damaged_hair">💇‍♀️ الشعر التالف، المعالج، أو شديد الجفاف</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'usage' && (
              <>
                {/* إدارة المواد الفعالة */}
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ fontWeight: '800', color: '#1e293b', fontSize: '13px' }}>
                      🧪 المواد الفعالة والتركيبة (Active Ingredients):
                    </label>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      style={{
                        background: '#fdf2f8',
                        border: '1px solid #f472b6',
                        color: '#db2777',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={13} />
                      <span>إضافة مادة فعالة (+)</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ingredientList.map((ing, idx) => {
                      const suggestions = ingredientSuggestions[idx] || [];
                      return (
                        <div key={idx} style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ flex: 2, position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="اسم المادة الفعالة (مثال: Niacinamide, Hyaluronic Acid, Retinol...)"
                              value={ing.name}
                              onChange={(e) => handleIngredientNameChange(idx, e.target.value)}
                              className="outstock-form-input"
                              style={{ fontWeight: '600', fontSize: '13px' }}
                            />
                            {suggestions.length > 0 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  right: 0,
                                  left: 0,
                                  background: '#ffffff',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  boxShadow: '0 8px 16px rgba(0,0,0,0.12)',
                                  zIndex: 50,
                                  maxHeight: '160px',
                                  overflowY: 'auto'
                                }}
                              >
                                {suggestions.map((s, sIdx) => (
                                  <div
                                    key={sIdx}
                                    onClick={() => handleSelectIngredientSuggestion(idx, s)}
                                    style={{
                                      padding: '7px 10px',
                                      fontSize: '12px',
                                      borderBottom: '1px solid #f1f5f9',
                                      cursor: 'pointer',
                                      color: '#0f172a'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                                  >
                                    <strong>{s.scientific_name || s.name}</strong>
                                    {s.trade_name && <span style={{ color: '#64748b', marginRight: '6px' }}>({s.trade_name})</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ flex: 1 }}>
                            <input
                              type="text"
                              placeholder="التركيز (مثال: 10%, 2mg)"
                              value={ing.concentration}
                              onChange={(e) => handleIngredientConcentrationChange(idx, e.target.value)}
                              className="outstock-form-input"
                              style={{ fontWeight: '600', fontSize: '13px' }}
                            />
                          </div>

                          {ingredientList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(idx)}
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                borderRadius: '6px',
                                padding: '7px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="حذف هذه المادة"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* طريقة الاستخدام وملاحظات */}
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                    📋 طريقة الاستخدام والمحاذير وإرشادات الصيدلي:
                  </label>
                  <textarea
                    rows={4}
                    placeholder="مثال: يوضع صباحاً ومساءً على بشرة نظيفة قبل المرطب. تجنب ملامسة محيط العينين، ويراعى تطبيق واقي الشمس نهاراً..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="outstock-form-textarea"
                    style={{ fontSize: '13px', lineHeight: '1.6' }}
                  />
                </div>
              </>
            )}

            {activeTab === 'orders' && item && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    background: '#f0fdfa',
                    border: '1px solid #99f6e4',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '800', color: '#0f766e', fontSize: '13px' }}>
                      🏢 الفرع الطالب: <strong>{item.branch_name || item.branch_id || 'الفرع'}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#0d9488', marginTop: '2px' }}>
                      إجمالي الكمية المطلوبة: <strong>{item.total_requested_qty || 1} عبوة</strong>
                    </div>
                  </div>
                  <span
                    style={{
                      background: '#0d9488',
                      color: '#ffffff',
                      fontWeight: '900',
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '8px'
                    }}
                  >
                    {item.orders_count || (item.item_details || []).length || 1} طلبات عملاء
                  </span>
                </div>

                {(item.item_details || []).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>
                      سجل طلبات العملاء لهذا الصنف:
                    </div>
                    {item.item_details.map((detail, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '12.5px'
                        }}
                      >
                        <div>
                          <strong>طلب #{detail.orderNumber}</strong> • {detail.customerName}
                          {detail.customerPhone && <span style={{ marginRight: '6px', color: '#0284c7' }}>({detail.customerPhone})</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '800', color: '#db2777' }}>
                            الكمية: {detail.quantity}
                          </span>
                          {detail.unitPrice && (
                            <span style={{ color: '#059669', fontWeight: '700' }}>
                              {parseFloat(detail.unitPrice).toFixed(2)} ج.م
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── أسفل النافذة ── */}
          <div
            className="outstock-modal-footer"
            style={{
              padding: '14px 22px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              إلغاء / إغلاق
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="outstock-btn"
              style={{
                background: '#db2777',
                color: '#ffffff',
                border: 'none',
                fontWeight: '800',
                padding: '9px 22px',
                borderRadius: '10px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 10px rgba(219, 39, 119, 0.3)'
              }}
            >
              <Save size={16} />
              <span>{isSaving ? 'جاري الحفظ بالكتالوج...' : (isAddMode ? 'حفظ وإضافة الصنف بالكتالوج 💾' : 'حفظ التعديلات بالكتالوج 💾')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
