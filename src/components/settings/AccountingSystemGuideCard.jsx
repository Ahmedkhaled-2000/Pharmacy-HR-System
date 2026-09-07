import React, { useState } from 'react';

/**
 * AccountingSystemGuideCard.jsx
 * دليل وشرح منظومة الحسابات العامة وشجرة الحسابات (ERP) للصيدليات
 * مصمم بلغة مبسطة وسلسة وأمثلة واقعية لتمكين أي صيدلي أو مدير من فهم المنظومة بسهولة تامة
 */
export default function AccountingSystemGuideCard({ onNavigateToAccounts }) {
  const [activeGuideTab, setActiveGuideTab] = useState('concept'); // concept | tree | examples | statements | ai

  return (
    <div style={{
      background: 'var(--surface, #ffffff)',
      border: '1px solid var(--border, #e2e8f0)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      direction: 'rtl',
    }}>
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        paddingBottom: '20px',
        borderBottom: '1px solid var(--border, #e2e8f0)',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
          }}>
            📖
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
                دليل وشرح منظومة الحسابات العامة وشجرة الحسابات (ERP Guide)
              </h3>
              <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                شرح مبسط للصيادلة والمديرين
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #64748b)' }}>
              كل ما تحتاج لمعرفته عن إدارة أموال الصيدليات، قراءة الأكواد، القيد المزدوج، وكشف النزيف المالي بسهولة ويسر
            </p>
          </div>
        </div>

        {onNavigateToAccounts && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onNavigateToAccounts}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🏛️</span>
            <span>فتح منظومة الحسابات الآن</span>
          </button>
        )}
      </div>

      {/* Guide Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '22px',
        borderBottom: '1px solid var(--border, #e2e8f0)',
        paddingBottom: '12px',
      }}>
        <button
          type="button"
          onClick={() => setActiveGuideTab('concept')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: activeGuideTab === 'concept' ? '1.5px solid #0284c7' : '1px solid var(--border, #e2e8f0)',
            background: activeGuideTab === 'concept' ? '#e0f2fe' : 'var(--surface-subtle, #f8fafc)',
            color: activeGuideTab === 'concept' ? '#0284c7' : 'var(--text, #0f172a)',
            fontWeight: '700',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          💡 1. المفهوم العام والفرق عن الكاشير
        </button>

        <button
          type="button"
          onClick={() => setActiveGuideTab('tree')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: activeGuideTab === 'tree' ? '1.5px solid #0d9488' : '1px solid var(--border, #e2e8f0)',
            background: activeGuideTab === 'tree' ? '#ccfbf1' : 'var(--surface-subtle, #f8fafc)',
            color: activeGuideTab === 'tree' ? '#0f766e' : 'var(--text, #0f172a)',
            fontWeight: '700',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🌳 2. شجرة الحسابات وكيف تقرأ الكود
        </button>

        <button
          type="button"
          onClick={() => setActiveGuideTab('examples')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: activeGuideTab === 'examples' ? '1.5px solid #7c3aed' : '1px solid var(--border, #e2e8f0)',
            background: activeGuideTab === 'examples' ? '#f3e8ff' : 'var(--surface-subtle, #f8fafc)',
            color: activeGuideTab === 'examples' ? '#7c3aed' : 'var(--text, #0f172a)',
            fontWeight: '700',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🎯 3. أمثلة صيدلانية عملية (خطوة بخطوة)
        </button>

        <button
          type="button"
          onClick={() => setActiveGuideTab('statements')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: activeGuideTab === 'statements' ? '1.5px solid #059669' : '1px solid var(--border, #e2e8f0)',
            background: activeGuideTab === 'statements' ? '#d1fae5' : 'var(--surface-subtle, #f8fafc)',
            color: activeGuideTab === 'statements' ? '#047857' : 'var(--text, #0f172a)',
            fontWeight: '700',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          📊 4. كيف تقرأ القوائم المالية والأرباح
        </button>

        <button
          type="button"
          onClick={() => setActiveGuideTab('ai')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: activeGuideTab === 'ai' ? '1.5px solid #e11d48' : '1px solid var(--border, #e2e8f0)',
            background: activeGuideTab === 'ai' ? '#ffe4e6' : 'var(--surface-subtle, #f8fafc)',
            color: activeGuideTab === 'ai' ? '#be123c' : 'var(--text, #0f172a)',
            fontWeight: '700',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🤖 5. استخدام الذكاء الاصطناعي لكتابة القيود
        </button>
      </div>

      {/* ── Section 1: Concept ── */}
      {activeGuideTab === 'concept' && (
        <div style={{ lineHeight: '1.8', fontSize: '14px', color: 'var(--text, #1e293b)' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 8px', color: '#166534', fontSize: '16px', fontWeight: '800' }}>
              💡 ما هو نظام الحسابات العامة (ERP) ولماذا هو أهم من مجرد كاشير البيع؟
            </h4>
            <p style={{ margin: 0, color: '#15803d' }}>
              كاشير الصيدلية العادي وظيفته تسجيل المبيعات فقط (فاتورة وباركود). لكنه <strong>لا يخبرك أين ذهبت أرباحك الحقيقية!</strong> هل السيولة تجمدت في رواكد أدوية؟ هل هناك عمولات بنكية مبالغ فيها؟ هل مديونيات شركات التوزيع تزيد أسرع من مبيعاتك؟
              <br />
              هنا يأتي دور <strong>منظومة الحسابات العامة (General Ledger & COA)</strong> لتربط كل حركة في الفروع (مبيعات، مشتريات، إيجارات، رواتب، وشيكات) في شبكة محاسبية دقيقة ومحكمة بنظام <strong>القيد المزدوج</strong>.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>⚖️ ما هو "القيد المزدوج" ببساطة؟</div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                كل حركة مالية في الدنيا لها طرفان: <strong>طرف أخذ (مدين +)</strong> و<strong>طرف أعطى (دائن -)</strong> بنفس القيمة تماماً.
                <br />
                - إذا سددت كهرباء 1,000 ج.م نقداً: مصاريف الكهرباء (أخذت = مدين)، والخزينة (أعطت = دائن).
                <br />
                - إذا بيعت أدوية 5,000 ج.م كاش: الخزينة (أخذت = مدين)، والمبيعات (أعطت = دائن).
                <br />
                <strong>المعادلة دائماً متوازنة (المدين = الدائن دائماً).</strong>
              </p>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>🛡️ حماية الصيدلية من النزيف المالي</div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                منظومة الحسابات تكشف لك فورياً:
                <br />
                • عجز الكاش وفروق تسليم الشفتات بين الصيادلة.
                <br />
                • عمولات نقاط البيع والمحافظ التي تخصمها البنوك تلقائياً.
                <br />
                • الأدوية منتهية الصلاحية (إكسباير) وتحويلها لمطالبات ضد فواتير الموردين لمنع خسارتها.
                <br />
                • صافي الربح الفعلي لكل فرع على حدة بعد سداد مصاريفه.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 2: Chart of Accounts Tree ── */}
      {activeGuideTab === 'tree' && (
        <div style={{ lineHeight: '1.8', fontSize: '14px', color: 'var(--text, #1e293b)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 6px', color: 'var(--text, #0f172a)', fontSize: '16px', fontWeight: '800' }}>
              🌳 كيف تفهم كود أي حساب في شجرة الصيدليات؟
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #64748b)' }}>
              تم تنظيم كود الحساب ليكون رقماً هرمياً ذكياً؛ الرقم الأول من جهة اليسار يحدد طبيعة الحساب فورياً:
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {/* 1 Assets */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#166534', fontSize: '15px' }}>1. الأصول (Assets)</strong>
                <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>مدين دائماً</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#166534', margin: '8px 0 0' }}>
                كل ما تملكه الصيدلية ولـه قيمة نقدية:
                <br />• <strong>111:</strong> نقدية الخزائن بالفروع
                <br />• <strong>112:</strong> الحسابات البنكية (الأهلي، مصر، CIB)
                <br />• <strong>115:</strong> مخزون الأدوية والمستحضرات
                <br />• <strong>116:</strong> سلف العاملين المؤقتة
                <br />• <strong>12:</strong> الأجهزة والتكييفات والديكورات
              </p>
            </div>

            {/* 2 Liabilities */}
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#991b1b', fontSize: '15px' }}>2. الالتزامات (Liabilities)</strong>
                <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>دائن دائماً</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#991b1b', margin: '8px 0 0' }}>
                كل الديون والالتزامات المستحقة على الصيدلية للغير:
                <br />• <strong>21101:</strong> مديونيات شركات توزيع الأدوية (المتحدة، ابن سينا، فارما أوفرسيز)
                <br />• <strong>21102:</strong> موردي مستحضرات التجميل
                <br />• <strong>21201:</strong> رواتب وأجور مستحقة لم تصرف بعد
                <br />• <strong>21203:</strong> ضرائب مستحقة
              </p>
            </div>

            {/* 3 Equity */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#1e40af', fontSize: '15px' }}>3. حقوق الملكية (Equity)</strong>
                <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>دائن</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#1e40af', margin: '8px 0 0' }}>
                حقوق الملاك والشركاء في الصيدلية:
                <br />• <strong>311:</strong> رأس المال المدفوع من أصحاب الصيدليات
                <br />• <strong>321:</strong> الأرباح المرحلة والمحتجزة من السنوات السابقة
                <br />• <strong>331:</strong> جاري الشركاء والمسحوبات الشخصية
              </p>
            </div>

            {/* 4 Revenues */}
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#6b21a8', fontSize: '15px' }}>4. الإيرادات (Revenues)</strong>
                <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>دائن</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#6b21a8', margin: '8px 0 0' }}>
                جميع التدفقات النقدية الواردة من المبيعات والخدمات:
                <br />• <strong>411:</strong> مبيعات الأدوية البشرية
                <br />• <strong>412:</strong> مبيعات مستحضرات التجميل
                <br />• <strong>413:</strong> مبيعات المكملات الغذائية
                <br />• <strong>422:</strong> إيرادات التوصيل والخدمات وتأجير الرفوف
              </p>
            </div>

            {/* 5 COGS */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#92400e', fontSize: '15px' }}>5. تكلفة المبيعات (COGS)</strong>
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>مدين</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#92400e', margin: '8px 0 0' }}>
                التكلفة المباشرة للأدوية التي بيعت بالفعل:
                <br />• <strong>51:</strong> تكلفة مبيعات الأدوية البشرية
                <br />• <strong>52:</strong> تكلفة مبيعات مستحضرات التجميل
                <br />• <strong>59:</strong> توالف وعجز وتوالف الأدوية منتهية الصلاحية
              </p>
            </div>

            {/* 6 Expenses */}
            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#9f1239', fontSize: '15px' }}>6. المصروفات (Expenses)</strong>
                <span style={{ background: '#ffe4e6', color: '#be123c', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>مدين</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#9f1239', margin: '8px 0 0' }}>
                تكاليف تشغيل الصيدليات:
                <br />• <strong>611:</strong> رواتب وأجور الصيادلة والمساعدين
                <br />• <strong>621:</strong> إيجارات مقار الصيدليات
                <br />• <strong>622:</strong> كهرباء ومياه وإنارة
                <br />• <strong>651/652:</strong> عمولات ماكينات الفيزا وإنستاباي
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Step-by-Step Practical Examples ── */}
      {activeGuideTab === 'examples' && (
        <div style={{ lineHeight: '1.8', fontSize: '14px', color: 'var(--text, #1e293b)' }}>
          <h4 style={{ margin: '0 0 14px', color: 'var(--text, #0f172a)', fontSize: '16px', fontWeight: '800' }}>
            🎯 4 عمليات صيدلانية واقعية وكيف يتعامل معها النظام آلياً:
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Example 1: POS & Shift Sales */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>1️⃣</span>
                <strong style={{ fontSize: '15px', color: '#0284c7' }}>مبيعات الشفت نقدياً + فيزا + إنستاباي:</strong>
              </div>
              <p style={{ fontSize: '13px', margin: '0 0 8px', color: '#475569' }}>
                إذا حققت الصيدلية مبيعات شفت بقيمة 10,000 ج.م، منها 6,000 كاش، و 3,000 فيزا (عمولة البنك 1.5% = 45 ج.م)، و 1,000 إنستاباي.
              </p>
              <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12.5px' }}>
                <div>• من مذكورين:</div>
                <div style={{ paddingRight: '16px', color: '#059669' }}>- 6,000.00 ج.م حـ/ خزينة الفرع (11102) [مدين]</div>
                <div style={{ paddingRight: '16px', color: '#059669' }}>- 2,955.00 ج.م حـ/ حساب البنك وفيزا نقاط البيع (11106) [مدين]</div>
                <div style={{ paddingRight: '16px', color: '#dc2626' }}>- 45.00 ج.م حـ/ عمولات بنكية مقتطعة (651) [مدين مصروف]</div>
                <div style={{ paddingRight: '16px', color: '#059669' }}>- 1,000.00 ج.م حـ/ تحويلات إنستاباي (11107) [مدين]</div>
                <div>• إلى حـ/ إيراد مبيعات الأدوية (411) : 10,000.00 ج.م [دائن]</div>
                <div style={{ color: '#0284c7', marginTop: '4px', fontWeight: '700' }}>✓ النتيجة: القيد متزن 10,000 = 10,000 وتم إثبات الكاش والعمولة فورياً.</div>
              </div>
            </div>

            {/* Example 2: Pharma Distributor Purchase & Payment */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>2️⃣</span>
                <strong style={{ fontSize: '15px', color: '#0d9488' }}>شراء أدوية من شركة توزيع (المتحدة / ابن سينا) ثم سدادها:</strong>
              </div>
              <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12.5px' }}>
                <div style={{ fontWeight: '700', color: '#0f766e', marginBottom: '4px' }}>أ) عند استلام الفاتورة الآجلة (بقيمة 50,000 ج.م):</div>
                <div style={{ paddingRight: '16px' }}>من حـ/ مخزون الأدوية البشرية (11501) : 50,000 [مدين]</div>
                <div style={{ paddingRight: '16px' }}>إلى حـ/ شركة المتحدة للصيادلة (21101) : 50,000 [دائن]</div>
                <div style={{ fontWeight: '700', color: '#0f766e', margin: '8px 0 4px' }}>ب) عند سداد الفاتورة بشيك بنكي:</div>
                <div style={{ paddingRight: '16px' }}>من حـ/ شركة المتحدة للصيادلة (21101) : 50,000 [مدين - تسوية المديونية]</div>
                <div style={{ paddingRight: '16px' }}>إلى حـ/ البنك الأهلي المصري (11201) : 50,000 [دائن - خروج النقدية]</div>
              </div>
            </div>

            {/* Example 3: Expired Drugs Credit Note */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>3️⃣</span>
                <strong style={{ fontSize: '15px', color: '#7c3aed' }}>إرجاع أدوية منتهية الصلاحية (إكسباير) وإشعار الخصم:</strong>
              </div>
              <p style={{ fontSize: '13px', margin: '0 0 8px', color: '#475569' }}>
                عند جمع إكسباير بقيمة 4,000 ج.م واعتماده من المندوب وإصدار إشعار دائن (Credit Note):
              </p>
              <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12.5px' }}>
                <div>من حـ/ شركة التوزيع الموردة (21101) : 4,000 ج.م [مدين - استنزال من مديونيتها]</div>
                <div>إلى حـ/ تسويات توالف وإكسباير الأدوية (59) : 4,000 ج.م [دائن - خفض تكلفة الهالك]</div>
                <div style={{ color: '#7c3aed', marginTop: '4px', fontWeight: '700' }}>✓ تم تخفيض ما ندين به للموزع فورياً بدون خسارة مليم.</div>
              </div>
            </div>

            {/* Example 4: Monthly Payroll & Advances */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>4️⃣</span>
                <strong style={{ fontSize: '15px', color: '#e11d48' }}>ترحيل قيد الرواتب الشهري مع استقطاع السلف:</strong>
              </div>
              <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12.5px' }}>
                <div>من حـ/ رواتب وأجور الصيادلة والمساعدين (611) : 40,000 ج.م [مدين - مصروفات الشهر]</div>
                <div>• إلى مذكورين:</div>
                <div style={{ paddingRight: '16px' }}>- حـ/ سلف العاملين (11601) : 5,000 ج.م [دائن - تسوية السلف التي سحبوها سابقاً]</div>
                <div style={{ paddingRight: '16px' }}>- حـ/ رواتب وأجور مستحقة للعاملين (21201) : 35,000 ج.م [دائن - صافي الصرف بالخزينة/البنك]</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 4: Financial Statements ── */}
      {activeGuideTab === 'statements' && (
        <div style={{ lineHeight: '1.8', fontSize: '14px', color: 'var(--text, #1e293b)' }}>
          <h4 style={{ margin: '0 0 14px', color: 'var(--text, #0f172a)', fontSize: '16px', fontWeight: '800' }}>
            📊 كيف تقرأ القوائم المالية وتعرف مركز الصيدلية بنظرة واحدة؟
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#0284c7', marginBottom: '8px' }}>
                1. ميزان المراجعة (Trial Balance)
              </div>
              <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                هو <strong>"ميزان العدل"</strong> المحاسبي. يجمع كافة أرصدة الشجرة في عمودين (مدين ودائن).
                <br />
                <strong>القاعدة الذهبية:</strong> إذا تساوى العمودان 100% فالنظام منضبط تماماً ولا يوجد أي قرش مفقود أو عملية غير مسجلة.
              </p>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#059669', marginBottom: '8px' }}>
                2. قائمة الدخل والأرباح (P&L)
              </div>
              <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                تخبرك هل الصيدلية <strong>تكسب أم تخسر</strong> خلال الشهر:
                <br />• <strong>مجمل الربح (Gross Profit)</strong> = المبيعات - تكلفة شراء البضاعة.
                <br />• <strong>صافي الربح النهائي (Net Profit)</strong> = مجمل الربح - (الرواتب + الإيجار + الكهرباء + عمولات الفيزا).
              </p>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#7c3aed', marginBottom: '8px' }}>
                3. الميزانية العمومية (Balance Sheet)
              </div>
              <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                تعرض <strong>القيمة الحقيقية للصيدليات اليوم</strong>:
                <br />
                <strong>الأصول</strong> (نقدية + بضاعة أدوية + ديكورات) = <strong>الالتزامات</strong> (ديون شركات التوزيع) + <strong>حقوق الملكية</strong> (رأس المال + أرباحك الصافية).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 5: AI Prompt Usage ── */}
      {activeGuideTab === 'ai' && (
        <div style={{ lineHeight: '1.8', fontSize: '14px', color: 'var(--text, #1e293b)' }}>
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px', color: '#9f1239', fontSize: '16px', fontWeight: '800' }}>
              🤖 لا حاجة لأن تكون خبيراً محاسبياً: اكتب بالعامية، والذكاء الاصطناعي يتكفل بالباقي!
            </h4>
            <p style={{ margin: 0, color: '#be123c', fontSize: '13.5px' }}>
              تم تزويد المنظومة بمحرك <strong>معالجة لغوية ذكي (NLP Financial Assistant)</strong> يفهم لهجتك اليومية وكلمات الصيدليات المعتادة. ما عليك إلا كتابة الجملة، وسيقوم بتحديد الطرف المدين والدائن والفرع واحتساب القيد فورياً!
            </p>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
            <strong style={{ fontSize: '14.5px', color: 'var(--text, #0f172a)' }}>أمثلة يمكنك تجربتها الآن في نافذة "الأمر الذكي":</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px' }}>
                ✍️ <em>"دفعنا 1800 جنيه فاتورة كهرباء صيدلية سموحة كاش من الخزينة"</em>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px' }}>
                ✍️ <em>"سددنا 30000 جنيه لشركة المتحدة للأدوية بشيك من البنك الأهلي"</em>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px' }}>
                ✍️ <em>"تحويل 50 ألف جنيه من فودافون كاش لحساب بنك مصر وعمولة 250 جنيه"</em>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px' }}>
                ✍️ <em>"صرف سلفة مستعجلة 2000 جنيه للدكتور أحمد من خزينة الإدارة"</em>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px' }}>
                ✍️ <em>"صيانة تكييفات وثلاجة حفظ الأدوية بصيدلية العجمي 950 جنيه نقداً"</em>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
