import React, { useState, useEffect } from 'react';
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
  Package
} from 'lucide-react';

/**
 * CosmeticsProductModal.jsx
 * بطاقة عرض ومواصفات مستحضر التجميل والعناية الفاخرة
 * - عرض الماركة والشركة المصنعة
 * - نوع البشرة / الشعر المستهدف
 * - دواعي الاستعمال وطريقة الاستخدام
 * - المواد الفعالة والتركيبة
 * - الصورة المرفقة والرابط الخارجي المباشر
 * - ملخص طلبات الفروع والكميات
 * - حفظ واسترجاع مواصفات المستحضر محلياً لسهولة إعادة الاستخدام
 */
export default function CosmeticsProductModal({
  isOpen,
  onClose,
  item,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('specs'); // 'specs' | 'usage' | 'orders'
  const [brand, setBrand] = useState('');
  const [categoryType, setCategoryType] = useState('skincare'); // skincare, haircare, suncare, makeup, bodycare, perfume
  const [skinType, setSkinType] = useState('all'); // all, oily, dry, combo, sensitive, normal
  const [instructions, setInstructions] = useState('');
  const [activeIngredients, setActiveIngredients] = useState('');
  const [productLink, setProductLink] = useState('');
  const [productImage, setProductImage] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const productName = item?.medication_name || item?.medicationName || '';

  // استرجاع المواصفات المحفوظة مسبقاً لهذا الصنف
  useEffect(() => {
    if (!isOpen || !productName) return;

    const attachedImg = item?.medication_image_url ||
      item?.imageUrl ||
      item?.medicationImageUrl ||
      (item?.item_details || []).find(d => d.medicationImageUrl || d.imageUrl)?.medicationImageUrl ||
      (item?.item_details || []).find(d => d.medicationImageUrl || d.imageUrl)?.imageUrl ||
      '';

    const attachedLink = item?.item_link ||
      item?.itemLink ||
      (item?.item_details || []).find(d => d.itemLink)?.itemLink ||
      '';

    setProductImage(attachedImg);
    setProductLink(attachedLink);

    try {
      const storageKey = `outstock_cosmetic_${encodeURIComponent(productName.trim().toLowerCase())}`;
      const savedData = localStorage.getItem(storageKey);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        setBrand(parsed.brand || '');
        setCategoryType(parsed.categoryType || 'skincare');
        setSkinType(parsed.skinType || 'all');
        setInstructions(parsed.instructions || '');
        setActiveIngredients(parsed.activeIngredients || '');
        if (!attachedLink && parsed.productLink) setProductLink(parsed.productLink);
        if (!attachedImg && parsed.productImage) setProductImage(parsed.productImage);
      } else {
        // افتراضيات ذكية بناء على اسم المستحضر
        setBrand('');
        setCategoryType('skincare');
        setSkinType('all');
        setInstructions('يُستخدم وفقاً لإرشادات الأخصائي أو الصيدلي.');
        setActiveIngredients('');
      }
    } catch {
      // ignore
    }
  }, [isOpen, productName, item]);

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // منع تمرير خلفية الصفحة
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleSaveSpecs = (e) => {
    e?.preventDefault();
    try {
      const storageKey = `outstock_cosmetic_${encodeURIComponent(productName.trim().toLowerCase())}`;
      const payload = {
        brand,
        categoryType,
        skinType,
        instructions,
        activeIngredients,
        productLink,
        productImage,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
      setIsSaved(true);
      showToast?.('✅ تم حفظ مواصفات المستحضر بنجاح');
      setTimeout(() => setIsSaved(false), 2500);
    } catch (e) {
      showToast?.('حدث خطأ أثناء حفظ المواصفات');
    }
  };

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case 'skincare': return '🌸 عناية بالبشرة (Skin Care)';
      case 'haircare': return '💇‍♀️ عناية بالشعر (Hair Care)';
      case 'suncare': return '☀️ واقي شمس وحماية (Sunscreen)';
      case 'makeup': return '💄 مكياج وتجميل (Make-up)';
      case 'bodycare': return '🧴 عناية بالجسم (Body Care)';
      case 'perfume': return '✨ عطور ومسك (Perfumes)';
      default: return '💄 مستحضرات تجميل';
    }
  };

  const getSkinTypeLabel = (st) => {
    switch (st) {
      case 'oily': return '🌿 البشرة الدهنية والمختلطة المائلة للدهنية';
      case 'dry': return '💧 البشرة الجافة والجافة جداً';
      case 'sensitive': return '🛡️ البشرة الحساسة والمتهيجة';
      case 'combo': return '⚖️ البشرة المختلطة العادية';
      case 'damaged_hair': return '💇‍♀️ الشعر الجاف والتالف والمصبوغ';
      default: return '✨ مناسب لكافة أنواع البشرة / الشعر';
    }
  };

  const handleCopySummary = () => {
    const summary = `💄 *بطاقة مستحضر التجميل والعناية*
━━━━━━━━━━━━━━━━━━
🔹 *الصنف:* ${productName}
🏢 *الماركة / الشركة:* ${brand || 'غير محدد'}
🏷️ *التصنيف:* ${getCategoryLabel(categoryType)}
🎯 *النوع المستهدف:* ${getSkinTypeLabel(skinType)}
${activeIngredients ? `🧪 *المواد الفعالة:* ${activeIngredients}\n` : ''}${instructions ? `📋 *طريقة الاستخدام:* ${instructions}\n` : ''}${productLink ? `🔗 *رابط المستحضر:* ${productLink}\n` : ''}━━━━━━━━━━━━━━━━━━
سلسلة صيدليات الأمانة - إدارة مستحضرات التجميل`;

    navigator.clipboard?.writeText(summary);
    setIsCopied(true);
    showToast?.('📋 تم نسخ بطاقة المستحضر إلى الحافظة بنجاح');
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="outstock-modal-backdrop" onClick={onClose} style={{ zIndex: 1050 }}>
      <div
        className="outstock-modal-panel"
        style={{
          maxWidth: '680px',
          width: '95%',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(219, 39, 119, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="outstock-modal-drag-handle" />

        {/* ── الرأس الفاخر للبطاقة ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #fbcfe8 100%)',
            borderBottom: '1px solid #f472b6',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1.5px solid #f472b6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 6px -1px rgba(219, 39, 119, 0.2)',
                color: '#db2777'
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  💄 COSMETICS CARD
                </span>
                <span style={{ fontSize: '12px', color: '#9d174d', fontWeight: '700' }}>
                  بطاقة الصنف التجميلي
                </span>
              </div>
              <h3 style={{ margin: '4px 0 0', color: '#831843', fontSize: '18px', fontWeight: '900' }}>
                {productName}
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              title="نسخ ملخص المستحضر للمشاركة"
            >
              {isCopied ? <CheckCircle2 size={14} color="#059669" /> : <Copy size={14} />}
              <span>{isCopied ? 'تم النسخ ✓' : 'نسخ البطاقة'}</span>
            </button>

            <button
              type="button"
              className="outstock-modal-close"
              onClick={onClose}
              style={{ background: '#ffffff', borderRadius: '50%', width: '32px', height: '32px' }}
            >
              <X size={18} color="#831843" />
            </button>
          </div>
        </div>

        {/* ── شريط التنقل الفرعي ── */}
        <div
          style={{
            display: 'flex',
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            padding: '4px 16px',
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
            <span>المواصفات والماركة</span>
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
            <span>طريقة الاستخدام والمواد الفعالة</span>
          </button>

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
            <span>طلبات الفروع والعملاء ({item.orders_count || (item.item_details || []).length || 1})</span>
          </button>
        </div>

        {/* ── محتوى البطاقة ── */}
        <div className="outstock-modal-body" style={{ maxHeight: 'calc(85vh - 160px)', overflowY: 'auto', padding: '18px 20px' }}>
          {activeTab === 'specs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* قسم الصورة والرابط الخارجي */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: productImage ? '140px 1fr' : '1fr',
                  gap: '16px',
                  background: '#fdf2f8',
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid #fbcfe8',
                  alignItems: 'center'
                }}
              >
                {productImage ? (
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={productImage}
                      alt={productName}
                      style={{
                        width: '130px',
                        height: '130px',
                        objectFit: 'contain',
                        borderRadius: '10px',
                        background: '#ffffff',
                        border: '1px solid #f472b6',
                        padding: '4px'
                      }}
                    />
                    <div style={{ fontSize: '11px', color: '#9d174d', marginTop: '4px', fontWeight: '700' }}>
                      صورة الصنف المرفقة 📷
                    </div>
                  </div>
                ) : null}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontWeight: '800', color: '#831843', fontSize: '14px' }}>
                      🔗 الرابط والمصادر الخارجية للصنف
                    </div>
                    {productLink ? (
                      <a
                        href={productLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#db2777',
                          color: '#ffffff',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          textDecoration: 'none',
                          fontWeight: '800',
                          fontSize: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(219, 39, 119, 0.3)'
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>فتح الرابط بالمتجر / الموقع 🌐</span>
                      </a>
                    ) : null}
                  </div>

                  <input
                    type="url"
                    placeholder="رابط صفحة المنتج (مثال: https://...)"
                    value={productLink}
                    onChange={(e) => setProductLink(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ fontSize: '12.5px', background: '#ffffff' }}
                  />

                  {!productImage && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="url"
                        placeholder="رابط صورة المنتج المباشر إن توفر..."
                        value={productImage}
                        onChange={(e) => setProductImage(e.target.value)}
                        className="outstock-form-input"
                        dir="ltr"
                        style={{ fontSize: '12.5px', background: '#ffffff', flex: 1 }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* بيانات الماركة والتصنيف ونوع البشرة */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="outstock-form-group">
                  <label style={{ fontWeight: '800', color: '#1e293b', fontSize: '13px' }}>
                    🏢 الشركة المصنعة / العلامة التجارية (Brand):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: La Roche-Posay, Vichy, CeraVe..."
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="outstock-form-input"
                    style={{ fontWeight: '700' }}
                  />
                </div>

                <div className="outstock-form-group">
                  <label style={{ fontWeight: '800', color: '#1e293b', fontSize: '13px' }}>
                    🏷️ التصنيف الرئيسي للمستحضر:
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

                <div className="outstock-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontWeight: '800', color: '#1e293b', fontSize: '13px' }}>
                    🎯 نوع البشرة أو الشعر المناسب له المستحضر:
                  </label>
                  <select
                    value={skinType}
                    onChange={(e) => setSkinType(e.target.value)}
                    className="outstock-form-select"
                    style={{ fontWeight: '700' }}
                  >
                    <option value="all">✨ مناسب لكافة أنواع البشرة / الشعر (All Types)</option>
                    <option value="oily">🌿 البشرة الدهنية والمختلطة المعرضة للحبوب (Oily/Acne)</option>
                    <option value="dry">💧 البشرة الجافة والجافة جداً والمقشرة (Dry/Very Dry)</option>
                    <option value="sensitive">🛡️ البشرة الحساسة والمتهيجة والاحمرار (Sensitive)</option>
                    <option value="combo">⚖️ البشرة المختلطة العادية (Combination)</option>
                    <option value="damaged_hair">💇‍♀️ الشعر التالف، المعالج كيميائياً، أو شديد الجفاف</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'usage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="outstock-form-group">
                <label style={{ fontWeight: '800', color: '#1e293b', fontSize: '13px' }}>
                  🧪 المواد الفعالة والتركيبة الأساسية (Active Ingredients):
                </label>
                <input
                  type="text"
                  placeholder="مثال: Niacinamide 10%, Hyaluronic Acid, Zinc PCA, Retinol..."
                  value={activeIngredients}
                  onChange={(e) => setActiveIngredients(e.target.value)}
                  className="outstock-form-input"
                  style={{ fontWeight: '600' }}
                />
              </div>

              <div className="outstock-form-group">
                <label style={{ fontWeight: '800', color: '#1e293b', fontSize: '13px' }}>
                  📋 طريقة الاستخدام، دواعي الاستعمال والمحاذير:
                </label>
                <textarea
                  rows={4}
                  placeholder="مثال: يوضع صباحاً ومساءً على بشرة نظيفة قبل المرطب. تجنب ملامسة العينين، استخدام واقي شمس نهاراً..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="outstock-form-textarea"
                  style={{ fontSize: '13px', lineHeight: '1.6' }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '12.5px',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ShieldCheck size={18} color="#0d9488" />
                <span>
                  <strong>توجيه إداري:</strong> هذه المواصفات تمكن مسؤولي المشتريات وموظفي الصيدليات من تقديم استشارة تجميلية دقيقة للعميل وشرح بدائل المستحضر إن لزم.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
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
                    🏢 الفرع الطالب: <strong>{item.branch_name || item.branch_id}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: '#0d9488', marginTop: '2px' }}>
                    إجمالي الكمية المطلوبة: <strong>{item.total_requested_qty} {item.unit_type === 'strip' ? 'شريط' : 'عبوة/قطعة'}</strong>
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
                  {item.orders_count || (item.item_details || []).length || 1} طلبات عملاء مرتبطة
                </span>
              </div>

              {/* تفاصيل الطلبات الفردية المرتبطة بهذا المستحضر */}
              {(item.item_details || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>
                    سجل طلبات العملاء لهذا الصنف:
                  </div>
                  {(item.item_details || []).map((detail, idx) => (
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
              ) : null}
            </div>
          )}
        </div>

        {/* ── أسفل النافذة ── */}
        <div
          className="outstock-modal-footer"
          style={{
            padding: '14px 20px',
            background: '#fafafa',
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
          >
            إغلاق
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleSaveSpecs}
              className="outstock-btn"
              style={{
                background: isSaved ? '#059669' : '#db2777',
                color: '#ffffff',
                border: 'none',
                fontWeight: '800',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Save size={15} />
              <span>{isSaved ? 'تم الحفظ ✓' : 'حفظ مواصفات المستحضر 💾'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
