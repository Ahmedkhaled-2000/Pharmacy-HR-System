import React, { useState } from 'react';
import {
  X,
  FileText,
  Pill,
  Package,
  Building2,
  Barcode,
  ShieldCheck,
  Layers,
  History,
  TrendingUp,
  TrendingDown,
  Check,
  Copy,
  RefreshCw,
  ExternalLink,
  Snowflake,
  AlertTriangle
} from 'lucide-react';

/**
 * MedicationMasterCardModal.jsx
 * نافذة كارتة الصنف والبدائل والمواصفات الدوائية الشاملة
 * مصممة بهندسة حديثة وبطاقات تفصيلية واضحة تمنع أي تداخل للنصوص
 */
export default function MedicationMasterCardModal({
  medicationId,
  masterCardData,
  isLoading = false,
  onClose,
  onSelectSubstitute
}) {
  const [copiedBarcode, setCopiedBarcode] = useState(false);

  if (!medicationId) return null;

  const med = masterCardData?.medication;
  const substitutes = masterCardData?.substitutes || [];
  const priceHistory = masterCardData?.priceHistory || [];

  const handleCopyBarcode = (code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedBarcode(true);
    setTimeout(() => setCopiedBarcode(false), 2000);
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          direction: 'rtl',
          border: '1px solid rgba(226, 232, 240, 0.8)'
        }}
      >
        {/* ── رأس النافذة الأنيق ── */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
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
              <FileText size={22} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', letterSpacing: '-0.3px' }}>
                كارتة الصنف والمواصفات الدوائية
              </h3>
              <p style={{ margin: 0, fontSize: '12.5px', opacity: 0.9, marginTop: '2px' }}>
                دليل هيئة الدواء المصرية (EDA) وقاعدة بيانات دراج آي الشاملة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.18)',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)'; }}
            title="إغلاق النافذة"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── محتوى الكارتة ── */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isLoading || !med ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <RefreshCw size={36} className="outstock-spin" style={{ margin: '0 auto 12px', color: '#0d9488' }} />
              <p style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>جاري استرجاع بيانات كارتة الصنف والبدائل...</p>
            </div>
          ) : (
            <>
              {/* 1. بطاقة الهوية السعرية والاسم (Hero Card) */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f0fdfa 100%)',
                  borderRadius: '16px',
                  border: '1.5px solid #ccfbf1',
                  padding: '18px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}
              >
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span
                      style={{
                        background: '#0d9488',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: '800',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}
                    >
                      {med.dosage_form || 'دواء'}
                    </span>

                    {med.category && (
                      <span
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #bae6fd'
                        }}
                      >
                        {med.category}
                      </span>
                    )}

                    {med.is_table_drug && (
                      <span
                        style={{
                          background: '#fee2e2',
                          color: '#b91c1c',
                          fontSize: '11px',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <AlertTriangle size={12} />
                        صنف جدول رقابة دوائية 🚨
                      </span>
                    )}

                    {med.is_refrigerated && (
                      <span
                        style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: '11px',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #bfdbfe',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Snowflake size={12} />
                        يحفظ بالثلاجة ❄️
                      </span>
                    )}
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      fontSize: '21px',
                      fontWeight: '900',
                      color: '#0f172a',
                      lineHeight: 1.3,
                      wordBreak: 'break-word'
                    }}
                  >
                    {med.trade_name_ar}
                  </h2>

                  <div
                    style={{
                      fontSize: '14.5px',
                      color: '#0d9488',
                      fontWeight: '800',
                      direction: 'ltr',
                      textAlign: 'right',
                      marginTop: '3px',
                      wordBreak: 'break-word'
                    }}
                  >
                    {med.trade_name_en}
                  </div>
                </div>

                {/* بلوك التسعير الرسمي */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '14px',
                    padding: '12px 18px',
                    border: '1.5px solid #a7f3d0',
                    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.1)',
                    textAlign: 'center',
                    minWidth: '160px'
                  }}
                >
                  <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '700', display: 'block' }}>
                    السعر الرسمي للجمهور
                  </span>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#047857', marginTop: '2px' }}>
                    {(parseFloat(med.public_price) || 0).toFixed(2)}{' '}
                    <span style={{ fontSize: '13px', fontWeight: '700' }}>ج.م</span>
                  </div>
                  {med.pack_size > 1 && (
                    <div
                      style={{
                        marginTop: '4px',
                        padding: '3px 8px',
                        background: '#f0fdf4',
                        color: '#0f766e',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '800'
                      }}
                    >
                      {med.unit_name || 'الشريط'}: {(parseFloat(med.unit_price) || 0).toFixed(2)} ج.م
                    </div>
                  )}
                </div>
              </div>

              {/* 2. شبكة المواصفات الدوائية المنفصلة (6 بطاقات محكمة لمنع أي تداخل) */}
              <div>
                <h4
                  style={{
                    margin: '0 0 10px 0',
                    fontSize: '14px',
                    fontWeight: '800',
                    color: '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Package size={16} color="#0d9488" />
                  <span>المواصفات والبيانات الصيدلية المعتمدة:</span>
                </h4>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '12px'
                  }}
                >
                  {/* المادة الفعالة */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                      <Pill size={14} color="#0284c7" />
                      <span>المادة الفعالة (Generic Name):</span>
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: '800',
                        color: '#0284c7',
                        wordBreak: 'break-word',
                        direction: 'ltr',
                        textAlign: 'right',
                        lineHeight: 1.4
                      }}
                    >
                      {med.generic_name || 'غير محددة'}
                    </div>
                  </div>

                  {/* الشكل الدوائي والتركيز */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                      <Package size={14} color="#0d9488" />
                      <span>الشكل الدوائي والتركيز:</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', wordBreak: 'break-word' }}>
                      {med.dosage_form || 'أقراص'} {med.strength ? `• ${med.strength}` : ''}
                    </div>
                  </div>

                  {/* حجم العبوة والوحدة التوزيعية */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                      <Layers size={14} color="#059669" />
                      <span>تعبئة العبوة والشرائط:</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', wordBreak: 'break-word' }}>
                      {med.pack_size} {med.unit_name || 'شريط'}{' '}
                      <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '600' }}>
                        (الشريط: {(parseFloat(med.unit_price) || 0).toFixed(2)} ج.م)
                      </span>
                    </div>
                  </div>

                  {/* الشركة المصنعة */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                      <Building2 size={14} color="#475569" />
                      <span>الشركة المصنعة (Manufacturer):</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', wordBreak: 'break-word' }}>
                      {med.manufacturer || 'غير مسجلة'}
                    </div>
                  </div>

                  {/* الباركود الدولي GTIN */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                        <Barcode size={14} color="#475569" />
                        <span>الباركود الدولي (GTIN):</span>
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: '900', fontFamily: 'monospace', color: '#1e293b' }}>
                        {med.gtin_barcode || 'لا يوجد'}
                      </div>
                    </div>
                    {med.gtin_barcode && (
                      <button
                        type="button"
                        onClick={() => handleCopyBarcode(med.gtin_barcode)}
                        style={{
                          alignSelf: 'flex-start',
                          marginTop: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: copiedBarcode ? '#dcfce7' : '#f1f5f9',
                          color: copiedBarcode ? '#166534' : '#475569',
                          border: '1px solid #cbd5e1',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedBarcode ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedBarcode ? 'تم النسخ' : 'نسخ الباركود'}</span>
                      </button>
                    )}
                  </div>

                  {/* رقم تسجيل هيئة الدواء EDA */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                      <ShieldCheck size={14} color="#059669" />
                      <span>رقم التسجيل بهيئة الدواء (EDA):</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>
                      {med.eda_reg_no || 'EDA Registered'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. قسم المثائل والبدائل المباشرة مع فروق الأسعار */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: '14.5px',
                      fontWeight: '800',
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Layers size={17} color="#0d9488" />
                    <span>المثائل والبدائل بنفس المادة الفعالة ({substitutes.length}):</span>
                  </h4>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                    تطابق علمي بنفس المادة الفعالة والشكل
                  </span>
                </div>

                {Array.isArray(substitutes) && substitutes.length > 0 ? (
                  <div
                    style={{
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)'
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '10px 14px' }}>اسم البديل التجاري</th>
                          <th style={{ padding: '10px 14px' }}>الشكل والتركيز</th>
                          <th style={{ padding: '10px 14px' }}>الشركة</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>سعر الجمهور</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>فرق السعر</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center' }}>إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {substitutes.map((sub) => {
                          const diff = (parseFloat(sub.public_price) || 0) - (parseFloat(med.public_price) || 0);
                          const isCheaper = diff < -0.05;
                          const isMoreExpensive = diff > 0.05;

                          return (
                            <tr
                              key={sub.id}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                transition: 'background 0.15s ease'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <td style={{ padding: '10px 14px', fontWeight: '800', color: '#1e293b' }}>
                                {sub.trade_name_ar}
                                <span
                                  style={{
                                    fontSize: '11.5px',
                                    color: '#64748b',
                                    display: 'block',
                                    direction: 'ltr',
                                    textAlign: 'right',
                                    fontWeight: '600'
                                  }}
                                >
                                  {sub.trade_name_en}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#475569', fontWeight: '600' }}>
                                {sub.dosage_form}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                                {sub.manufacturer || '-'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '900', color: '#0f172a' }}>
                                {(parseFloat(sub.public_price) || 0).toFixed(2)} ج.م
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'left' }}>
                                {isCheaper && (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: '#dcfce7',
                                      color: '#15803d',
                                      fontSize: '11px',
                                      fontWeight: '800'
                                    }}
                                  >
                                    <TrendingDown size={13} />
                                    أرخص بـ {Math.abs(diff).toFixed(1)} ج.م
                                  </span>
                                )}
                                {isMoreExpensive && (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: '#fee2e2',
                                      color: '#b91c1c',
                                      fontSize: '11px',
                                      fontWeight: '800'
                                    }}
                                  >
                                    <TrendingUp size={13} />
                                    أغلى بـ {diff.toFixed(1)} ج.م
                                  </span>
                                )}
                                {!isCheaper && !isMoreExpensive && (
                                  <span
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: '#f1f5f9',
                                      color: '#475569',
                                      fontSize: '11px',
                                      fontWeight: '700'
                                    }}
                                  >
                                    نفس السعر
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => onSelectSubstitute?.(sub.id)}
                                  style={{
                                    background: '#f0fdfa',
                                    border: '1px solid #99f6e4',
                                    borderRadius: '8px',
                                    padding: '5px 12px',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    color: '#0d9488',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <span>عرض الكارتة</span>
                                  <ExternalLink size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '20px',
                      borderRadius: '12px',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '13px',
                      border: '1px dashed #cbd5e1'
                    }}
                  >
                    لا توجد بدائل مسجلة بنفس المادة الفعالة حالياً في الكتالوج.
                  </div>
                )}
              </div>

              {/* 4. قسم سجل وتاريخ تعديلات الأسعار */}
              <div>
                <h4
                  style={{
                    margin: '0 0 10px 0',
                    fontSize: '14.5px',
                    fontWeight: '800',
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <History size={17} color="#059669" />
                  <span>سجل تحريك وتغيرات الأسعار:</span>
                </h4>

                {Array.isArray(priceHistory) && priceHistory.length > 0 ? (
                  <div
                    style={{
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)'
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '8px 12px' }}>التاريخ</th>
                          <th style={{ padding: '8px 12px' }}>السعر السابق</th>
                          <th style={{ padding: '8px 12px' }}>السعر الجديد</th>
                          <th style={{ padding: '8px 12px' }}>القرار والمصدر</th>
                          <th style={{ padding: '8px 12px' }}>المعدل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceHistory.map((h, i) => (
                          <tr key={h.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 12px', color: '#475569', fontWeight: '600' }}>
                              {new Date(h.created_at).toLocaleDateString('ar-EG')}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#64748b', textDecoration: 'line-through' }}>
                              {parseFloat(h.old_public_price || 0).toFixed(2)} ج.م
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: '900', color: '#059669' }}>
                              {parseFloat(h.new_public_price || 0).toFixed(2)} ج.م
                            </td>
                            <td style={{ padding: '8px 12px', color: '#334155', fontWeight: '600' }}>
                              {h.revision_source || h.decree_number || 'تعديل رسمي'}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#64748b' }}>
                              {h.changed_by || 'الإدارة'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '14px',
                      borderRadius: '10px',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '12.5px',
                      border: '1px dashed #cbd5e1'
                    }}
                  >
                    لا توجد تعديلات سعرية سابقة مسجلة لهذا الصنف.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── ذيل النافذة ── */}
        <div
          style={{
            padding: '14px 24px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 22px',
              borderRadius: '10px',
              background: '#e2e8f0',
              color: '#1e293b',
              border: 'none',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#cbd5e1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
