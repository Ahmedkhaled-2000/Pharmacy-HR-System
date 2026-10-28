import React from 'react';
import { usePOS } from '../../context/POSContext';
import { Keyboard, X, Sparkles } from 'lucide-react';

export default function PosShortcutsGuideModal() {
  const { isShortcutsGuideOpen, setIsShortcutsGuideOpen } = usePOS();

  if (!isShortcutsGuideOpen) return null;

  const shortcuts = [
    { key: 'Ctrl + P', desc: '🏷️ نافذة إدخال كود الخصم الترويجي (البروموكود Promo Code) بخلفية ضبابية شفافة' },
    { key: 'Alt + O', desc: '👑 بوابة المالك ورادار الفروع وسياسات خصومات العاملين والعملاء [كود: 1511]' },
    { key: 'Shift + Enter', desc: '⚡ بيع نقدي سريع وفوري بدون طباعة ريسيت وتفريغ السلة فوراً (< 1 ثانية)' },
    { key: 'F8', desc: '⚡ إظهار / إخفاء درج الأصناف السريعة الأكثر مبيعاً (مسكنات / برد / مستلزمات)' },
    { key: 'Ctrl + M', desc: '➕ إضافة صنف حر / غير مكود مباشرة للفاتورة مع تحديد السعر والكمية' },
    { key: 'Ctrl + 1', desc: 'تحديد نوع الفاتورة الحالية: OTC (أدوية لا وصفية بيع مباشر)' },
    { key: 'Ctrl + 2', desc: 'تحديد نوع الفاتورة الحالية: روشتة طبية معتمدة (Rx)' },
    { key: 'Ctrl + 3', desc: 'تحديد نوع الفاتورة الحالية: طلب عميل ونواقص خاصة' },
    { key: 'Ctrl + 4', desc: 'تحديد نوع الفاتورة الحالية: توصيل منازل (دليفري)' },
    { key: 'Ctrl + Tab', desc: 'التنقل الفوري بين شاشات البيع المنبثقة المفتوحة (#1، #2، #3)' },
    { key: 'Ctrl + V', desc: 'لصق صورة الروشتة الطبية فوراً من الحافظة وتثبيتها بالفاتورة' },
    { key: 'F1', desc: 'فتح شاشة بيع جديدة منبثقة (يمكن فتح عدد لا نهائي من النوافذ)' },
    { key: 'F2', desc: 'رادار البدائل والمثائل الذكية مرتبة بهامش الربح والأقرب للصلاحية' },
    { key: 'F3', desc: 'تبديل وحدة الصنف فوراً (علبة ⟵ شريط ⟵ قرص/أمبول)' },
    { key: 'F4', desc: 'مركز التقارير والرقابة الحصرية وحركة الدرج وإغلاق الورديات' },
    { key: 'F5', desc: 'الدفع النقدي السريع المباشر وطباعة الريسيت الحراري' },
    { key: 'F6', desc: 'فتح نافذة الدفع المتعدد (فيزا / إنستاباي / آجل / تأمين)' },
    { key: 'F7', desc: 'شاشة إدارة ومتابعة طلبات التوصيل والدليفري وخط سير الطيارين' },
    { key: 'F9', desc: 'شاشة مرتجع المبيعات الفورية برقم الفاتورة والباركود' },
    { key: 'F10', desc: 'بورصة تصفير الرواكد والتبادل بين الفروع (P2P Exchange)' },
    { key: 'F11', desc: 'أتمتة أدوية الأمراض المزمنة وتذكيرات الواتساب' },
    { key: 'F12', desc: 'تسوية وإغلاق وردية الكاشير وجرد النقدية (Z-Report)' },
    { key: 'Esc', desc: 'إغلاق نتائج البحث المنسدلة، أو إلغاء السلة، أو إغلاق المودال النشط' },
    { key: '↓ / ↑', desc: 'التنقل السلس بالسهمين بين نتائج بحث الأدوية' },
    { key: 'Enter', desc: 'إضافة الصنف المظلل للسلة فوراً أو تأكيد الدفع' }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 2500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1.5px solid var(--border, #cbd5e1)',
          borderRadius: '20px',
          width: '92%',
          maxWidth: '680px',
          maxHeight: '85vh',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--surface-hover, #f8fafc)',
            borderBottom: '1px solid var(--border, #cbd5e1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Keyboard size={22} color="var(--primary, #0d9488)" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
              دليل اختصارات لوحة المفاتيح لنقاط البيع (Zero-Mouse POS Guide)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsShortcutsGuideOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            {shortcuts.map((sc) => (
              <div
                key={sc.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  background: 'var(--surface, #ffffff)'
                }}
              >
                <span
                  style={{
                    padding: '4px 10px',
                    background: '#1e293b',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    fontWeight: 900,
                    borderRadius: '8px',
                    minWidth: '60px',
                    textAlign: 'center'
                  }}
                >
                  {sc.key}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text, #0b132b)' }}>
                  {sc.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
