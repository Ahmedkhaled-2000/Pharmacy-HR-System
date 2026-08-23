import React, { useState, useEffect } from 'react';
import { fmt, todayStr, getEmpDisplayName } from '../../utils/formatters';
import { triggerDirectPrint } from '../../utils/printHelper';

export default function EmploymentContractModule({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const employees = (state.employees || []).filter(e => e.status !== 'تم الاستقالة' && e.is_active !== false);
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [includeFullBylaws, setIncludeFullBylaws] = useState(true);

  // Selected Employee object
  const emp = employees.find(e => String(e.id) === String(selectedEmpId)) || employees[0] || null;

  // Org Settings
  const orgSettings = state.orgSettings || {};
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const gmName = orgSettings.generalManagerName || 'المدير العام';
  const orgAddress = orgSettings.address || 'الفرع الرئيسي - مصر';
  const commercialReg = orgSettings.commercialRegister || '104859';
  const taxNumber = orgSettings.taxNumber || '948-284-102';

  // Branch Names for selected employee
  const branchNames = emp?.branchesDetails && emp.branchesDetails.length > 0
    ? emp.branchesDetails.map(bd => {
        const br = (state.branches || []).find(b => String(b.id) === String(bd.branchId));
        return br ? br.name : `فرع ${bd.branchId}`;
      }).join(' + ')
    : ((state.branches || []).find(b => String(b.id) === String(emp?.branchId))?.name || emp?.branchName || 'المركز الرئيسي');

  // Salary breakdown
  const monthlySalary = parseFloat(emp?.monthlySalary) || (
    (parseFloat(emp?.salary) || 0) * (parseFloat(emp?.workHoursPerDay) || 8) * (parseFloat(emp?.workDaysPerMonth) || 26)
  ) || (parseFloat(emp?.salary) || 0);

  const workHours = emp?.workHoursPerDay || 8;
  const workDays = emp?.workDaysPerMonth || 26;
  const hireDate = emp?.hireDate || emp?.hiring_date || todayStr();

  // Official bylaws text from state
  const officialBylawsText = state.bylawsText || `
1. الالتزام بالحضور والانصراف في المواعيد المقررة وفق نظام البصمة الإلكترونية.
2. الالتزام بالزي الرسمي والمظهر اللائق وحسن معاملة المرضى والعملاء.
3. الدقة التامة في تحصيل النقدية وجرد الخزينة وتسليم الورديات.
4. يمنع سحب أي أدوية بالآجل إلا وفق الإجراءات المعتمدة من الإدارة.
5. الالتزام بجدول الورديات وعدم التغيب أو ترك العمل بدون إذن رسمي مسبق.
  `.trim();

  // Default contract clauses generator
  const getDefaultClauses = (targetEmp) => [
    {
      id: 'c1',
      title: 'البند الأول: موضوع العقد والوظيفة',
      content: `يُعين الطرف الأول الطرف الثاني للعمل لديه بوظيفة (${targetEmp?.jobTitle || 'صيدلي'}) في فرع (${branchNames}) أو أي من فروع الصيدلية وفقاً لحاجة العمل، ويلتزم الطرف الثاني بأداء واجبات وظيفته بأمانة وإخلاص وفقاً للأصول العلمية والمهنية الصيدلانية ولائحة العمل بالمنشأة.`
    },
    {
      id: 'c2',
      title: 'البند الثاني: مدة العقد وفترة الاختبار',
      content: `مدة هذا العقد سنة واحدة تبدأ من تاريخ مباشرة العمل في (${hireDate})، وتتجدد تلقائياً لمدد مماثلة ما لم يخطر أحد الطرفين الآخر كتابياً بعدم رغبته في التجديد قبل نهاية المدة بـ (30) يوماً على الأقل. ويخضع الطرف الثاني لفترة اختبار مدتها ثلاثة (3) أشهر اعتباراً من تاريخ استلام العمل، يحق خلالها للطرف الأول إنهاء العقد وفق قانون العمل دون إنذار أو مكافأة.`
    },
    {
      id: 'c3',
      title: 'البند الثالث: ساعات العمل والورديات والراحة الأسبوعية',
      content: `تحدد ساعات العمل الفعلية بـ (${workHours}) ساعات يومياً وبمعدل (${workDays}) يوماً في الشهر، ويتم تنظيم الورديات ومواعيد الحضور والانصراف وفقاً لجداول العمل الشهرية المعتمدة والتسجيل عبر منظومة البصمة الإلكترونية بالصيدلية، مع استحقاق الطرف الثاني يوم راحة أسبوعية مدفوعة الأجر.`
    },
    {
      id: 'c4',
      title: 'البند الرابع: الراتب، البدلات، ومواعيد الصرف',
      content: `يتقاضى الطرف الثاني لقاء قيامه بمهامه الوظيفية راتباً أساسياً شهرياً قدره (${fmt(monthlySalary)} ج.م) بالإضافة إلى البدلات المعتمدة والوقت الإضافي المحتسب رسمياً، ويتم صرف الراتب شهرياً في المواعيد المقررة وفق دورة إقفال الرواتب المعتمدة بالصيدلية.`
    },
    {
      id: 'c5',
      title: 'البند الخامس: الإجازات السنوية والرسمية والمرضية',
      content: `يستحق الطرف الثاني إجازة سنوية مدفوعة الأجر مدتها (21) يوماً عن كل سنة عمل كاملة بعد انقضاء ستة أشهر من بدء العمل، وتزاد إلى (30) يوماً وفق قانون العمل. كما يستحق الإجازات الرسمية والأعياد المقررة أو ما يعادلها في حال استلزمت مصلحة العمل دوامه فيها.`
    },
    {
      id: 'c6',
      title: 'البند السادس: الالتزامات المهنية، السرية، والأمانة',
      content: `يلتزم الطرف الثاني بالمحافظة على أموال وعهد وأدوية الصيدلية وممتلكاتها، والالتزام التام بالسر المهني وعدم إفشاء أي أسرار أو معلومات تجارية أو فنية أو قوائم العملاء والموردين، ويمتنع عليه ممارسة أي نشاط صيدلاني أو تجاري منافس أثناء سريان العقد.`
    },
    {
      id: 'c7',
      title: 'البند السابع: الالتزام بنصوص وسياسات لائحة العمل الرسمية للصيدلية',
      content: `يُقر الطرف الثاني باطلاعه الكامل وتعهده بالالتزام الصارم بكافة بنود ونصوص وسياسات لائحة العمل والجزاءات التأديبية المعتمدة بالصيدلية، وتُعد اللائحة جزءاً لا يتجزأ ومكملاً لبنود هذا العقد وتسري على كافة الوقائع والمخالفات الإدارية.`
    },
    {
      id: 'c8',
      title: 'البند الثامن: إنهاء العقد وفترة الإخطار والمخالصة',
      content: `في حال رغبة أحد الطرفين في إنهاء العقد بعد فترة الاختبار، يتعين عليه إخطار الطرف الآخر كتابياً بمهلة إخطار رسمية لا تقل عن (30) يوماً. ويلتزم الطرف الثاني بتسليم ما بعهدته من أدوية ومستندات ومفاتيح واستكمال إجراءات إخلاء الطرف الرسمية قبل تسلم مستحقات التصفية النهائية.`
    },
    {
      id: 'c9',
      title: 'البند التاسع: الاختصاص القضائي وتوقيع الطرفين',
      content: `يخضع هذا العقد ويفسر وفقاً لأحكام قانون العمل المنظم، وتختص المحاكم العمالية الواقع في دائرتها مقر الصيدلية بنظر أي نزاع قد ينشأ لا قدر الله. وحُرر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها.`
    }
  ];

  // Clauses state
  const [clauses, setClauses] = useState([]);

  // Load custom clauses for employee or default
  useEffect(() => {
    if (emp) {
      if (emp.contractClauses && emp.contractClauses.length > 0) {
        setClauses(emp.contractClauses);
      } else {
        setClauses(getDefaultClauses(emp));
      }
    }
  }, [selectedEmpId, emp?.id]);

  const handleUpdateClause = (id, field, value) => {
    setClauses(clauses.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleAddClause = () => {
    const newId = `c_${Date.now()}`;
    const nextNum = clauses.length + 1;
    setClauses([
      ...clauses,
      {
        id: newId,
        title: `البند الإضافي رقم (${nextNum}): بند مخصص`,
        content: 'اكتب نص البند الإضافي هنا...'
      }
    ]);
  };

  const handleRemoveClause = (id) => {
    if (window.confirm('هل أنت متأكد من حذف هذا البند من العقد؟')) {
      setClauses(clauses.filter(c => c.id !== id));
    }
  };

  const handleResetClauses = () => {
    if (window.confirm('هل ترغب في استعادة نموذج العقد القانوني الافتراضي؟')) {
      setClauses(getDefaultClauses(emp));
      setIsEditing(false);
      showToast?.('تمت استعادة نموذج العقد الافتراضي');
    }
  };

  const handleSaveContract = async () => {
    if (!emp) return;
    const performSave = async () => {
      const updatedEmployees = state.employees.map(e => {
        if (e.id === emp.id) {
          return {
            ...e,
            contractClauses: clauses,
            contractSavedAt: new Date().toISOString()
          };
        }
        return e;
      });

      const updatedState = { ...state, employees: updatedEmployees };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      setIsEditing(false);
      showToast?.(`✅ تم حفظ نموذج عقد العمل للموظف (${emp.name}) بنجاح`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'حفظ وتحديث عقد عمل موظف',
        actionDetails: `الموظف: ${emp.name}`,
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  // Direct HTML Print for Employment Contract
  const handlePrintContract = () => {
    if (!emp) return;

    const issueDateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const contractNo = `CNT-${emp.code || emp.id}-${new Date().getFullYear()}`;

    const html = `
      <div style="max-width: 820px; margin: 0 auto; background: #fff; font-family: 'Cairo', 'Tajawal', sans-serif; line-height: 1.6; color: #0f172a;">
        
        <!-- Official Header -->
        <div style="border-bottom: 3px double #0f766e; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div style="text-align: right;">
            <h2 style="margin: 0; color: #0f766e; font-size: 20px; font-weight: 800;">🏥 ${orgName}</h2>
            <span style="font-size: 12px; color: #475569; font-weight: 600;">الإدارة العامة والشؤون القانونية والموارد البشرية</span>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">س.ت: ${commercialReg} | ب.ض: ${taxNumber}</div>
          </div>
          <div style="text-align: center;">
            <div style="background: #f0fdf4; border: 2px solid #0f766e; padding: 6px 20px; border-radius: 8px;">
              <h3 style="margin: 0; color: #0f766e; font-size: 16px; font-weight: 800;">عَقْـدُ عَمَـلٍ فَرْدِيّ مُوَحَّـد</h3>
            </div>
            <span style="font-size: 11px; color: #64748b; margin-top: 4px; display: block;">رقم العقد: <strong>${contractNo}</strong></span>
          </div>
          <div style="text-align: left; font-size: 11.5px; color: #475569;">
            <div>تاريخ التحرير: <strong>${issueDateStr}</strong></div>
            <div>المدير العام: <strong>${gmName}</strong></div>
          </div>
        </div>

        <!-- Preamble Box -->
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 12.5px;">
          <div style="font-weight: 800; color: #0f766e; margin-bottom: 6px; font-size: 13.5px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px;">
            📜 تمهيد وهوية طرفي التعاقد:
          </div>
          <p style="margin: 4px 0 6px;">
            إنه في يوم <strong>${new Date().toLocaleDateString('ar-EG', { weekday: 'long' })}</strong> الموافق <strong>${issueDateStr}</strong>، تم الاتفاق والتراضي بين كل من:
          </p>
          <div style="margin-bottom: 6px; padding: 6px 10px; background: #fff; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>الطرف الأول (صاحب العمل):</strong> ${orgName}، ويمثلها قانوناً السيد/ <strong>${gmName}</strong> بصفته (المدير العام)، ومقرها: ${orgAddress}.
          </div>
          <div style="padding: 6px 10px; background: #fff; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>الطرف الثاني (الموظف):</strong> السيد/ <strong>${emp.name}</strong>، الجنسية: مصري، الرقم القومي: <strong>${emp.nationalId || emp.national_id || '—'}</strong>، المؤهل: <strong>${emp.qualification || 'بكالوريوس صيدلة / علوم طبية'}</strong>، الهاتف: <strong>${emp.phone || '—'}</strong>، كود: <strong>${emp.code || '—'}</strong>.
          </div>
          <p style="margin: 8px 0 0; color: #475569; font-size: 12px;">
            ولما كان الطرف الأول يمتلك ويدير مجموعة صيدليات، ورغب في الاستعانة بخبرات الطرف الثاني، فقد اتفق الطرفان بكامل أهليتهما القانونية على البنود والشروط التالية:
          </p>
        </div>

        <!-- Contract Clauses -->
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
          ${clauses.map((c, i) => `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px;">
              <h4 style="margin: 0 0 4px; color: #0f766e; font-size: 13px; font-weight: 800;">
                ${c.title}
              </h4>
              <p style="margin: 0; font-size: 12px; line-height: 1.55; color: #1e293b; text-align: justify;">
                ${c.content}
              </p>
            </div>
          `).join('')}
        </div>

        <!-- Attached Bylaws Section if selected -->
        ${includeFullBylaws ? `
          <div style="page-break-inside: avoid; background: #fdfefe; border: 1px solid #99f6e4; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 11.5px;">
            <div style="font-weight: 800; color: #0f766e; margin-bottom: 6px; font-size: 12.5px; border-bottom: 1px dashed #99f6e4; padding-bottom: 4px;">
              📋 ملحق نصوص وسياسات لائحة العمل والجزاءات المعتمدة للصيدلية:
            </div>
            <pre style="font-family: 'Cairo', sans-serif; font-size: 11px; color: #334155; white-space: pre-wrap; margin: 0; line-height: 1.5;">${officialBylawsText}</pre>
          </div>
        ` : ''}

        <!-- Signatures & Witness Block -->
        <div style="page-break-inside: avoid; border-top: 2px solid #cbd5e1; padding-top: 14px; margin-top: 18px;">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; text-align: center; font-size: 12px;">
            
            <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc;">
              <div style="font-weight: 800; color: #0f172a; margin-bottom: 30px;">توقيع الطرف الأول (صاحب العمل)</div>
              <div style="border-top: 1px dotted #94a3b8; padding-top: 4px; font-size: 11.5px;">
                <strong>${gmName}</strong>
                <div style="color: #64748b; font-size: 10.5px;">(المدير العام والختم الرسمي)</div>
              </div>
            </div>

            <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc;">
              <div style="font-weight: 800; color: #0f172a; margin-bottom: 30px;">توقيع الطرف الثاني (الموظف)</div>
              <div style="border-top: 1px dotted #94a3b8; padding-top: 4px; font-size: 11.5px;">
                <strong>${emp.name}</strong>
                <div style="color: #64748b; font-size: 10.5px;">(التوقيع وبصمة الإبهام)</div>
              </div>
            </div>

            <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc;">
              <div style="font-weight: 800; color: #0f172a; margin-bottom: 30px;">الشهود والاعتماد القانوني</div>
              <div style="border-top: 1px dotted #94a3b8; padding-top: 4px; font-size: 11px; text-align: right; padding-right: 6px;">
                <div>شاهد 1: .............................</div>
                <div>شاهد 2: .............................</div>
              </div>
            </div>

          </div>
        </div>

      </div>
    `;

    triggerDirectPrint(html, `عقد عمل - ${emp.name}`);
  };

  const filteredEmployees = employees.filter(e => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      (e.name || '').toLowerCase().includes(q) ||
      (e.code || '').toLowerCase().includes(q) ||
      (e.jobTitle || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      
      {/* ── 1. Header Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📝</span> عقود العمل الرسمية وبنود اللائحة
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
            صياغة وتعديل وتخصيص عقود العمل المتوافقة مع قانون العمل وتضمين اللائحة المعتمدة وطباعتها رسمياً
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', background: 'var(--surface-muted)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeFullBylaws}
              onChange={(e) => setIncludeFullBylaws(e.target.checked)}
            />
            تضمين نصوص اللائحة بالطباعة
          </label>

          {isEditing ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsEditing(false)}
                style={{ padding: '8px 14px', borderRadius: '8px' }}
              >
                إلغاء التعديل
              </button>
              <button
                type="button"
                className="btn btn-start"
                onClick={handleSaveContract}
                style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', borderRadius: '8px', fontWeight: 'bold' }}
              >
                💾 حفظ بنود العقد
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsEditing(true)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
              >
                ✏️ تخصيص وتعديل البنود
              </button>
              <button
                type="button"
                className="btn btn-start"
                onClick={handlePrintContract}
                style={{ padding: '8px 18px', background: '#0f766e', color: '#ffffff', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                🖨️ طباعة العقد الرسمي
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 2. Employee Selector & Dossier Summary ── */}
      <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px' }}>
            <label style={{ fontWeight: 'bold', fontSize: '13.5px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
              👤 اختيار الموظف:
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '8px',
                border: '1.5px solid var(--primary, #0f766e)',
                background: '#fff',
                fontFamily: 'Cairo, Tajawal, sans-serif',
                fontWeight: 'bold',
                fontSize: '13.5px'
              }}
            >
              {filteredEmployees.map(e => (
                <option key={e.id} value={e.id}>
                  {getEmpDisplayName(e)} (كود: {e.code || '-'}) - {e.jobTitle || 'موظف'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="🔍 بحث باسم أو كود الموظف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', width: '200px' }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleResetClauses}
              title="استعادة البنود القانونية النموذجية"
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }}
            >
              🔄 استعادة الافتراضي
            </button>
          </div>
        </div>

        {/* Quick Employee Contract Dossier Badges */}
        {emp && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <div>الاسم الكامل: <strong style={{ color: 'var(--primary-dark)' }}>{emp.name}</strong></div>
            <div>المسمى الوظيفي: <strong>{emp.jobTitle || '—'}</strong></div>
            <div>الفرع المعتمد: <strong>{branchNames}</strong></div>
            <div>الرقم القومي: <strong>{emp.nationalId || emp.national_id || '—'}</strong></div>
            <div>الراتب الأساسي: <strong style={{ color: '#059669' }}>{fmt(monthlySalary)} ج.م</strong></div>
            <div>تاريخ التعيين: <strong>{hireDate}</strong></div>
            <div>ساعات العمل: <strong>{workHours} س/يوم ({workDays} يوم)</strong></div>
            <div>فترة الاختبار: <strong style={{ color: '#d97706' }}>3 أشهر</strong></div>
          </div>
        )}
      </div>

      {/* ── 3. Contract Clauses View / Edit Area ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* Preamble Card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14.5px', color: 'var(--primary-dark)', fontFamily: 'Cairo', fontWeight: 800 }}>
            📜 تمهيد وهوية الطرفين (Preamble)
          </h3>
          <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text)', background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div><strong>الطرف الأول (صاحب العمل):</strong> {orgName} - ممثلة بالسيد المدير العام <strong>{gmName}</strong>.</div>
            <div style={{ marginTop: '4px' }}><strong>الطرف الثاني (الموظف):</strong> السيد/ <strong>{emp?.name}</strong> - الرقم القومي: <strong>{emp?.nationalId || emp?.national_id || '—'}</strong> - الهاتف: <strong>{emp?.phone || '—'}</strong>.</div>
          </div>
        </div>

        {/* Dynamic Clauses */}
        {clauses.map((clause, idx) => (
          <div
            key={clause.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px 20px',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              {isEditing ? (
                <input
                  type="text"
                  value={clause.title}
                  onChange={(e) => handleUpdateClause(clause.id, 'title', e.target.value)}
                  style={{
                    fontWeight: 800,
                    fontSize: '14px',
                    color: 'var(--primary-dark)',
                    fontFamily: 'Cairo',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    width: '65%'
                  }}
                />
              ) : (
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--primary-dark)', fontFamily: 'Cairo', fontWeight: 800 }}>
                  {clause.title}
                </h4>
              )}

              {isEditing && (
                <button
                  type="button"
                  onClick={() => handleRemoveClause(clause.id)}
                  style={{
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    fontWeight: 'bold'
                  }}
                >
                  ✕ حذف البند
                </button>
              )}
            </div>

            {isEditing ? (
              <textarea
                rows={3}
                value={clause.content}
                onChange={(e) => handleUpdateClause(clause.id, 'content', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontFamily: 'Tajawal, sans-serif',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  resize: 'vertical'
                }}
              />
            ) : (
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text)', textAlign: 'justify' }}>
                {clause.content}
              </p>
            )}

            {/* If Clause 7: Adherence to Bylaws, show preview of official bylaws text */}
            {clause.id === 'c7' && (
              <div style={{ marginTop: '10px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f766e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📋</span> نصوص وسياسات لائحة العمل الرسمية المعتمدة للصيدلية (مستدعاة تلقائياً من صفحة اللائحة):
                </div>
                <pre style={{ margin: 0, fontSize: '11.5px', color: '#334155', fontFamily: 'Tajawal, Cairo, sans-serif', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {officialBylawsText}
                </pre>
              </div>
            )}
          </div>
        ))}

        {isEditing && (
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleAddClause}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1.5px dashed var(--primary)', color: 'var(--primary)', fontWeight: 'bold' }}
            >
              ➕ إضافة بند إضافي جديد للعقد
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
