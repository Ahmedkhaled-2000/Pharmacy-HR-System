import React, { useState, useEffect } from 'react';
import { fmt, getRealTodayStr, getEmpDisplayName } from '../../utils/formatters';
import { triggerDirectPrint } from '../../utils/printHelper';
import {
  getBylawsSectionsFromState,
  parseBylawsIntoSections
} from '../../utils/bylawsDefaults';
import { useUI } from '../../context/UIContext';

export default function EmploymentContractModule({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const { showConfirm } = useUI();
  const employees = (state.employees || []).filter(e => e.status !== 'تم الاستقالة' && e.is_active !== false);
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [includeFullBylaws, setIncludeFullBylaws] = useState(true);

  // Selected Employee object
  const emp = employees.find(e => String(e.id) === String(selectedEmpId)) || employees[0] || null;

  // Org Settings
  const orgSettings = state.orgSettings || {};
  const orgName = orgSettings.orgName || 'صيدليات مداواه';
  const gmName = orgSettings.generalManagerName || 'د. سيف مقرب - المدير العام للصيدليات';
  const orgAddress = orgSettings.address || 'الفرع الرئيسي - مصر';
  const commercialReg = orgSettings.commercialRegister || '104859';
  const taxNumber = orgSettings.taxNumber || '102-284-948';
  const contractDept = orgSettings.contractDepartment || 'الإدارة العامة والشؤون القانونية والموارد البشرية';
  const contractTitle = orgSettings.contractTitle || 'عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد';
  const contractPrefix = orgSettings.contractNumberPrefix !== undefined ? orgSettings.contractNumberPrefix : 'CNT-Modawa@kane-';

  // Modal State for Editing Organization Contract Header Details
  const [isOrgSettingsModalOpen, setIsOrgSettingsModalOpen] = useState(false);
  const [editOrgName, setEditOrgName] = useState(orgName);
  const [editContractDept, setEditContractDept] = useState(contractDept);
  const [editCommercialReg, setEditCommercialReg] = useState(commercialReg);
  const [editTaxNumber, setEditTaxNumber] = useState(taxNumber);
  const [editGmName, setEditGmName] = useState(gmName);
  const [editOrgAddress, setEditOrgAddress] = useState(orgAddress);
  const [editContractTitle, setEditContractTitle] = useState(contractTitle);
  const [editContractPrefix, setEditContractPrefix] = useState(contractPrefix);
  const [editLogoUrl, setEditLogoUrl] = useState(orgSettings.logoUrl || '');

  // Synchronize modal state whenever modal opens or state updates
  useEffect(() => {
    if (isOrgSettingsModalOpen) {
      setEditOrgName(orgSettings.orgName || 'صيدليات مداواه');
      setEditContractDept(orgSettings.contractDepartment || 'الإدارة العامة والشؤون القانونية والموارد البشرية');
      setEditCommercialReg(orgSettings.commercialRegister || '104859');
      setEditTaxNumber(orgSettings.taxNumber || '102-284-948');
      setEditGmName(orgSettings.generalManagerName || 'د. سيف مقرب - المدير العام للصيدليات');
      setEditOrgAddress(orgSettings.address || 'الفرع الرئيسي - مصر');
      setEditContractTitle(orgSettings.contractTitle || 'عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد');
      setEditContractPrefix(orgSettings.contractNumberPrefix !== undefined ? orgSettings.contractNumberPrefix : 'CNT-Modawa@kane-');
      setEditLogoUrl(orgSettings.logoUrl || '');
    }
  }, [isOrgSettingsModalOpen, orgSettings]);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast?.('⚠️ حجم الشعار يجب أن يكون أقل من 2 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setEditLogoUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleResetOrgContractSettings = () => {
    setEditOrgName('صيدليات مداواه');
    setEditContractDept('الإدارة العامة والشؤون القانونية والموارد البشرية');
    setEditCommercialReg('104859');
    setEditTaxNumber('102-284-948');
    setEditGmName('د. سيف مقرب - المدير العام للصيدليات');
    setEditOrgAddress('الفرع الرئيسي - مصر');
    setEditContractTitle('عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد');
    setEditContractPrefix('CNT-Modawa@kane-');
  };

  const handleSaveOrgContractSettings = async () => {
    const updatedOrgSettings = {
      ...(state.orgSettings || {}),
      orgName: editOrgName.trim() || 'صيدليات مداواه',
      contractDepartment: editContractDept.trim() || 'الإدارة العامة والشؤون القانونية والموارد البشرية',
      commercialRegister: editCommercialReg.trim() || '',
      taxNumber: editTaxNumber.trim() || '',
      generalManagerName: editGmName.trim() || 'د. سيف مقرب - المدير العام للصيدليات',
      address: editOrgAddress.trim() || '',
      contractTitle: editContractTitle.trim() || 'عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد',
      contractNumberPrefix: editContractPrefix.trim() || '',
      logoUrl: editLogoUrl || ''
    };

    const performSave = async () => {
      const updatedState = {
        ...state,
        orgSettings: updatedOrgSettings
      };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      setIsOrgSettingsModalOpen(false);
      showToast?.('✅ تم حفظ وتحديث بيانات المؤسسة وترويسة عقد العمل بنجاح');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'تعديل بيانات وترويسة المنشأة بعقود العمل',
        actionDetails: `المنشأة: ${editOrgName}`,
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  const getFormattedContractNo = (prefix, targetEmp) => {
    const year = new Date().getFullYear();
    const cleanPrefix = (prefix !== undefined ? prefix : 'CNT-Modawa@kane-').trim();
    if (!cleanPrefix) {
      return `CNT-${targetEmp?.code || targetEmp?.id || '101'}-${year}`;
    }
    if (cleanPrefix.endsWith('-') || cleanPrefix.endsWith('@') || cleanPrefix.endsWith('_')) {
      return `${cleanPrefix}${year}`;
    }
    return `${cleanPrefix}-${year}`;
  };

  // Branch Names for selected employee
  const isMultiBranch = emp?.branchesDetails && emp.branchesDetails.length > 1;
  const branchNames = isMultiBranch
    ? emp.branchesDetails.map(bd => {
        const br = (state.branches || []).find(b => String(b.id) === String(bd.branchId));
        return br ? br.name : `فرع ${bd.branchId}`;
      }).join(' + ')
    : ((state.branches || []).find(b => String(b.id) === String(emp?.branchId))?.name || emp?.branchName || 'المركز الرئيسي');

  // Target details and accurate base salary calculation
  const targetBranchDetails = emp?.branchesDetails?.[0] || null;
  const rateVal = targetBranchDetails ? (parseFloat(targetBranchDetails.salary) || 0) : (parseFloat(emp?.salary) || 0);
  const workHours = targetBranchDetails ? (parseFloat(targetBranchDetails.workHours || targetBranchDetails.workHoursPerDay) || 8) : (parseFloat(emp?.workHoursPerDay) || 8);
  const workDays = targetBranchDetails ? (parseFloat(targetBranchDetails.workDays || targetBranchDetails.workDaysPerMonth) || 26) : (parseFloat(emp?.workDaysPerMonth) || 26);

  const calcDailyRate = workDays > 0 ? (rateVal * workHours) / workDays : (rateVal * workHours);
  const calcHourlyRate = workHours > 0 ? calcDailyRate / workHours : (workDays > 0 ? rateVal / workDays : rateVal);

  const monthlySalary = parseFloat(emp?.monthlySalary) || (
    isMultiBranch
      ? emp.branchesDetails.reduce((sum, bd) => {
          const r = parseFloat(bd.salary) || 0;
          const h = parseFloat(bd.workHours || bd.workHoursPerDay) || 8;
          return sum + (r * h);
        }, 0)
      : (rateVal * workHours)
  ) || (rateVal * workHours);

  const hireDate = emp?.hireDate || emp?.hiring_date || getRealTodayStr();

  // Official bylaws structured sections from state
  const bylawsSections = getBylawsSectionsFromState(state);

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

  const handleRemoveClause = async (id) => {
    const isConfirmed = await showConfirm({
      title: 'حذف بند من العقد',
      message: 'هل أنت متأكد من حذف هذا البند من العقد؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '📜'
    });
    if (isConfirmed) {
      setClauses(clauses.filter(c => c.id !== id));
    }
  };

  const handleResetClauses = async () => {
    const isConfirmed = await showConfirm({
      title: 'استعادة نموذج العقد الافتراضي',
      message: 'هل ترغب في استعادة نموذج العقد القانوني الافتراضي؟',
      confirmText: 'استعادة النموذج',
      cancelText: 'إلغاء وتراجع',
      type: 'warning',
      icon: '🔄'
    });
    if (isConfirmed) {
      setClauses(getDefaultClauses(emp));
      setIsEditing(false);
      showToast?.('تمت استعادة نموذج العقد الافتراضي');
    }
  };

  const handleSaveContract = async () => {
    if (!emp) return;

    const performSave = async () => {
      const updatedEmployees = state.employees.map(e => {
        if (String(e.id) === String(emp.id)) {
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
      showToast?.(`✅ تم حفظ بنود عقد العمل للموظف (${emp.name}) بنجاح وإلغاء وضع التعديل`);
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
    const contractNo = getFormattedContractNo(orgSettings.contractNumberPrefix, emp);
    const contractBylawsSections = getBylawsSectionsFromState(state);

    const html = `
      <div style="max-width: 820px; margin: 0 auto; background: #fff; font-family: 'Cairo', 'Tajawal', sans-serif; line-height: 1.5; color: #0f172a; font-size: 11.5px;">
        
        <!-- Official Header -->
        <div style="border-bottom: 2.5px double #0f766e; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid; break-inside: avoid;">
          <div style="text-align: right; display: flex; align-items: center; gap: 8px;">
            ${(orgSettings?.logoUrl) ? `<img src="${orgSettings.logoUrl}" alt="Logo" style="max-height: 48px; max-width: 110px; object-fit: contain;" />` : `<span style="font-size: 20px;">🏥</span>`}
            <div>
              <h2 style="margin: 0; color: #0f766e; font-size: 18px; font-weight: 800;">${orgName}</h2>
              <span style="font-size: 11px; color: #475569; font-weight: 600;">${contractDept}</span>
              <div style="font-size: 10px; color: #64748b; margin-top: 2px;">س.ت: ${commercialReg} | ب.ض: ${taxNumber}</div>
            </div>
          </div>
          <div style="text-align: center;">
            <div style="background: #f0fdf4; border: 2px solid #0f766e; padding: 4px 18px; border-radius: 6px;">
              <h3 style="margin: 0; color: #0f766e; font-size: 14.5px; font-weight: 800;">${contractTitle}</h3>
            </div>
            <span style="font-size: 10.5px; color: #64748b; margin-top: 3px; display: block;">رقم العقد: <strong>${contractNo}</strong></span>
          </div>
          <div style="text-align: left; font-size: 10.5px; color: #475569;">
            <div>تاريخ التحرير: <strong>${issueDateStr}</strong></div>
            <div>المدير العام: <strong>${gmName}</strong></div>
          </div>
        </div>

        <!-- Quick Employee Dossier Summary Bar (Matching Page Toolbar) -->
        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; font-size: 11px; page-break-inside: avoid; break-inside: avoid;">
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 10.5px;">
            <div>الاسم الكامل: <strong style="color: #0f766e;">${emp.name}</strong></div>
            <div>المسمى الوظيفي: <strong>${emp.jobTitle || '—'}</strong></div>
            <div>الفرع المعتمد: <strong>${branchNames}</strong></div>
            <div>الرقم القومي: <strong>${emp.nationalId || emp.national_id || '—'}</strong></div>
            <div>الراتب الأساسي: <strong style="color: #059669;">${fmt(monthlySalary)} ج.م</strong></div>
            <div>تاريخ التعيين: <strong>${hireDate}</strong></div>
            <div>ساعات العمل: <strong>${workHours} س/يوم (${workDays} يوم)</strong></div>
            <div>فترة الاختبار: <strong style="color: #d97706;">3 أشهر</strong></div>
          </div>
        </div>

        <!-- Preamble Box -->
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 11px; page-break-inside: avoid; break-inside: avoid;">
          <div style="font-weight: 800; color: #0f766e; margin-bottom: 4px; font-size: 12px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px;">
            📜 تمهيد وهوية طرفي التعاقد:
          </div>
          <p style="margin: 3px 0 4px; font-size: 11px;">
            إنه في يوم <strong>${new Date().toLocaleDateString('ar-EG', { weekday: 'long' })}</strong> الموافق <strong>${issueDateStr}</strong>، تم الاتفاق والتراضي بين كل من:
          </p>
          <div style="margin-bottom: 4px; padding: 4px 8px; background: #fff; border-radius: 4px; border: 1px solid #e2e8f0;">
            <strong>الطرف الأول (صاحب العمل):</strong> ${orgName}، ويمثلها قانوناً السيد/ <strong>${gmName}</strong> بصفته (المدير العام)، ومقرها: ${orgAddress}.
          </div>
          <div style="padding: 4px 8px; background: #fff; border-radius: 4px; border: 1px solid #e2e8f0;">
            <strong>الطرف الثاني (الموظف):</strong> السيد/ <strong>${emp.name}</strong>، الجنسية: مصري، الرقم القومي: <strong>${emp.nationalId || emp.national_id || '—'}</strong>، المؤهل: <strong>${emp.qualification || 'بكالوريوس صيدلة / علوم طبية'}</strong>، الهاتف: <strong>${emp.phone || '—'}</strong>، كود: <strong>${emp.code || '—'}</strong>.
          </div>
          <p style="margin: 4px 0 0; color: #475569; font-size: 10.5px;">
            ولما كان الطرف الأول يمتلك ويدير مجموعة صيدليات، ورغب في الاستعانة بخبرات الطرف الثاني، فقد اتفق الطرفان بكامل أهليتهما القانونية على البنود والشروط التالية:
          </p>
        </div>

        <!-- Contract Clauses (No page-break split inside clause box) -->
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;">
          ${clauses.map((c) => `
            <div style="page-break-inside: avoid; break-inside: avoid; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px;">
              <h4 style="margin: 0 0 3px; color: #0f766e; font-size: 11.5px; font-weight: 800;">
                ${c.title}
              </h4>
              <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #1e293b; text-align: justify;">
                ${c.content}
              </p>
            </div>
          `).join('')}
        </div>

        <!-- Attached Bylaws Section: Elegant 2-Column Print Flow -->
        ${includeFullBylaws ? `
          <div style="page-break-inside: auto; break-inside: auto; border: 1.5px solid #0f766e; border-radius: 8px; margin-top: 10px; margin-bottom: 12px; background: #ffffff;">
            <div style="background: #f0fdf4; padding: 6px 12px; border-bottom: 1.5px solid #0f766e; display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid; break-inside: avoid;">
              <span style="font-weight: 800; color: #0f766e; font-size: 11.5px;">📋 ملحق نصوص وسياسات لائحة العمل والجزاءات المعتمدة للصيدلية (${contractBylawsSections.length} بنداً معتمداً):</span>
              <span style="font-size: 10px; color: #166534; font-weight: bold;">(جزء لا يتجزأ ومتمم لبنود العقد)</span>
            </div>
            <div style="padding: 8px; column-count: 2; -webkit-column-count: 2; -moz-column-count: 2; column-gap: 8px; -webkit-column-gap: 8px; page-break-inside: auto; break-inside: auto;">
              ${contractBylawsSections.map(sec => `
                <div style="display: inline-block; width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; background: #f8fafc; font-size: 9.5px; vertical-align: top;">
                  <div style="font-weight: 800; color: #0f766e; border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px; margin-bottom: 4px; font-size: 10px;">
                    ${sec.title}
                  </div>
                  <div style="color: #334155; line-height: 1.4;">
                    ${(sec.points || []).map(p => {
                      const pStr = String(p || '').trim();
                      const isWarning = pStr.startsWith('❌');
                      const isObligation = pStr.startsWith('✔️');
                      const cleanP = pStr.replace(/^❌\s*/, '').replace(/^✔️\s*/, '').replace(/^▪\s*/, '').replace(/^\-\s*/, '').replace(/^•\s*/, '');
                      return `
                        <div style="display: flex; gap: 4px; align-items: flex-start; margin-bottom: 2px; ${isWarning ? 'color: #991b1b;' : isObligation ? 'color: #166534;' : ''}">
                          <span style="font-size: 8px; margin-top: 1.5px; color: ${isWarning ? '#dc2626' : isObligation ? '#16a34a' : '#0f766e'};">${isWarning ? '❌' : isObligation ? '✔️' : '▪'}</span>
                          <span style="flex: 1;">${cleanP}</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Signatures & Witness Block -->
        <div style="page-break-inside: avoid; break-inside: avoid; border-top: 2px solid #cbd5e1; padding-top: 10px; margin-top: 12px;">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; font-size: 11px;">
            
            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc;">
              <div style="font-weight: 800; color: #0f172a; margin-bottom: 24px;">توقيع الطرف الأول (صاحب العمل)</div>
              <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; font-size: 10.5px;">
                <strong>${gmName}</strong>
                <div style="color: #64748b; font-size: 9.5px;">(المدير العام والختم الرسمي)</div>
              </div>
            </div>

            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc;">
              <div style="font-weight: 800; color: #0f172a; margin-bottom: 24px;">توقيع الطرف الثاني (الموظف)</div>
              <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; font-size: 10.5px;">
                <strong>${emp.name}</strong>
                <div style="color: #64748b; font-size: 9.5px;">(التوقيع وبصمة الإبهام)</div>
              </div>
            </div>

            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc;">
              <div style="font-weight: 800; color: #0f172a; margin-bottom: 24px;">الشهود والاعتماد القانوني</div>
              <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; font-size: 10px; text-align: right; padding-right: 4px;">
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
                style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                💾 حفظ بنود العقد
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsOrgSettingsModalOpen(true)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid #0f766e',
                  color: '#0f766e',
                  fontWeight: 'bold',
                  background: '#f0fdfa',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="تعديل بيانات وترويسة المنشأة بعقود العمل المطبوعة"
              >
                🏢 تعديل بيانات المنشأة بالعقد
              </button>
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

      {/* ── Organization Contract Header Quick Info Strip ── */}
      <div style={{
        background: '#f0fdfa',
        border: '1.5px solid #99f6e4',
        borderRadius: '12px',
        padding: '12px 18px',
        marginBottom: '18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 2px 6px rgba(15, 118, 110, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {orgSettings.logoUrl ? (
            <img src={orgSettings.logoUrl} alt="Logo" style={{ maxHeight: '42px', maxWidth: '100px', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: '28px' }}>🏥</span>
          )}
          <div>
            <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '15px' }}>
              {orgName} <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>({contractDept})</span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <span>س.ت: <strong style={{ color: '#0f172a' }}>{commercialReg}</strong></span>
              <span>ب.ض: <strong style={{ color: '#0f172a' }}>{taxNumber}</strong></span>
              <span>المفوض بالتوقيع: <strong style={{ color: '#0f172a' }}>{gmName}</strong></span>
              <span>عنوان العقد: <strong style={{ color: '#0f766e' }}>{contractTitle}</strong></span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOrgSettingsModalOpen(true)}
          style={{
            background: '#ffffff',
            border: '1.5px solid #0f766e',
            color: '#0f766e',
            borderRadius: '8px',
            padding: '7px 16px',
            fontSize: '12.5px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <span>⚙️</span> تعديل ترويسة وبيانات المنشأة
        </button>
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
        {clauses.map((clause) => (
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

            {/* If Clause 7: Adherence to Bylaws, show preview of official bylaws structured sections */}
            {clause.id === 'c7' && (
              <div style={{ marginTop: '14px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f766e', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📋</span> نصوص وسياسات لائحة العمل الرسمية المعتمدة للصيدلية (مستدعاة تلقائياً من صفحة اللائحة):
                  </div>
                  <span style={{ background: '#ccfbf1', color: '#0f766e', border: '1px solid #99f6e4', padding: '3px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 'bold' }}>
                    {bylawsSections.length} بنود وسياسات معتمدة
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                  {bylawsSections.map((sec, sIdx) => {
                    const isPreamble = sec.category === 'preamble' || sec.title?.includes('مقدمة') || sec.title?.includes('تمهيد');
                    return (
                      <div key={sec.id || sIdx} style={{ background: '#ffffff', border: `1px solid ${isPreamble ? '#99f6e4' : '#e2e8f0'}`, borderRadius: '10px', padding: '12px 14px', fontSize: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', minWidth: 0 }}>
                        <div style={{ fontWeight: 'bold', color: '#0f766e', marginBottom: '8px', borderBottom: '1px dashed #99f6e4', paddingBottom: '4px', fontSize: '12.5px' }}>
                          {sec.title}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', lineHeight: 1.45 }}>
                          {(sec.points || []).map((p, pIdx) => {
                            const pStr = String(p || '').trim();
                            const isWarning = pStr.startsWith('❌');
                            const isObligation = pStr.startsWith('✔️');
                            const cleanP = pStr.replace(/^❌\s*/, '').replace(/^✔️\s*/, '').replace(/^▪\s*/, '').replace(/^\-\s*/, '');
                            return (
                              <div key={pIdx} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '11px', marginTop: '1px', color: isWarning ? '#dc2626' : isObligation ? '#16a34a' : '#0f766e' }}>
                                  {isWarning ? '❌' : isObligation ? '✔️' : '▪'}
                                </span>
                                <span style={{ color: isWarning ? '#991b1b' : isObligation ? '#166534' : '#334155' }}>
                                  {cleanP}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
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

      {/* ── 4. Modal: Edit Organization Contract Header & Details ── */}
      {isOrgSettingsModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          overflowY: 'auto'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0f766e, #0d9488)',
              color: '#ffffff',
              padding: '16px 22px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏢</span> تعديل بيانات وترويسة المنشأة في عقود العمل
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', opacity: 0.9 }}>
                  البيانات المدخلة هنا ستظهر في أعلى صفحات عقود العمل عند الطباعة وفي تمهيد وتوقيعات العقد
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOrgSettingsModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#ffffff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body with Scroll */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Live Preview Box */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #0f766e',
                borderRadius: '12px',
                padding: '14px 18px',
                boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f766e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>👁️</span> معاينة حية ومباشرة لشكل الترويسة المطبوعة (Live Print Header Preview):
                </div>

                {/* The Header as it appears in Print */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  borderBottom: '2.5px double #0f766e'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    
                    {/* Right: Logo & Name & Dept & Tax/CR */}
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {editLogoUrl ? (
                        <img src={editLogoUrl} alt="Logo" style={{ maxHeight: '46px', maxWidth: '100px', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: '26px' }}>🏥</span>
                      )}
                      <div>
                        <div style={{ color: '#0f766e', fontSize: '17px', fontWeight: 800, margin: 0 }}>
                          {editOrgName || 'صيدليات مداواه'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                          {editContractDept || 'الإدارة العامة والشؤون القانونية والموارد البشرية'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                          س.ت: <strong>{editCommercialReg || '—'}</strong> | ب.ض: <strong>{editTaxNumber || '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Center: Title & Number */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ background: '#f0fdf4', border: '2px solid #0f766e', padding: '4px 16px', borderRadius: '6px' }}>
                        <div style={{ color: '#0f766e', fontSize: '13.5px', fontWeight: 800, margin: 0 }}>
                          {editContractTitle || 'عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد'}
                        </div>
                      </div>
                      <span style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px', display: 'block' }}>
                        رقم العقد: <strong>{getFormattedContractNo(editContractPrefix, emp)}</strong>
                      </span>
                    </div>

                    {/* Left: Date & Signatory */}
                    <div style={{ textAlign: 'left', fontSize: '10.5px', color: '#475569' }}>
                      <div>تاريخ التحرير: <strong>{new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
                      <div>المدير العام: <strong>{editGmName || '—'}</strong></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Input Fields Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
                
                {/* 1. Organization Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    🏢 اسم المنشأة / مجموعة الصيدليات:
                  </label>
                  <input
                    type="text"
                    value={editOrgName}
                    onChange={(e) => setEditOrgName(e.target.value)}
                    placeholder="مثال: صيدليات مداواه"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 2. Department / Subtitle */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    📑 الإدارة التابعة / السطر التعريفي:
                  </label>
                  <input
                    type="text"
                    value={editContractDept}
                    onChange={(e) => setEditContractDept(e.target.value)}
                    placeholder="مثال: الإدارة العامة والشؤون القانونية والموارد البشرية"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 3. Commercial Register (س.ت) */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    📄 رقم السجل التجاري (س.ت):
                  </label>
                  <input
                    type="text"
                    value={editCommercialReg}
                    onChange={(e) => setEditCommercialReg(e.target.value)}
                    placeholder="مثال: 104859"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 4. Tax Card (ب.ض) */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    💳 رقم البطاقة الضريبية (ب.ض):
                  </label>
                  <input
                    type="text"
                    value={editTaxNumber}
                    onChange={(e) => setEditTaxNumber(e.target.value)}
                    placeholder="مثال: 102-284-948"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 5. General Manager / Signatory */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    ✍️ المدير العام / المفوض بالتوقيع:
                  </label>
                  <input
                    type="text"
                    value={editGmName}
                    onChange={(e) => setEditGmName(e.target.value)}
                    placeholder="مثال: د. سيف مقرب - المدير العام للصيدليات"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 6. Headquarters Address */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    📍 عنوان المقر الرئيسي للمنشأة:
                  </label>
                  <input
                    type="text"
                    value={editOrgAddress}
                    onChange={(e) => setEditOrgAddress(e.target.value)}
                    placeholder="مثال: الفرع الرئيسي - مصر"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 7. Contract Title */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    🏷️ عنوان العقد في الترويسة:
                  </label>
                  <input
                    type="text"
                    value={editContractTitle}
                    onChange={(e) => setEditContractTitle(e.target.value)}
                    placeholder="مثال: عَقْدُ عَمَلٍ فَرْدِيّ مُوَحَّد"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 8. Contract Number Prefix */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    🔢 بادئة أو صيغة رقم العقد:
                  </label>
                  <input
                    type="text"
                    value={editContractPrefix}
                    onChange={(e) => setEditContractPrefix(e.target.value)}
                    placeholder="مثال: CNT-Modawa@kane-"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'block' }}>
                    سيظهر الرقم بالصيغة: <strong>{getFormattedContractNo(editContractPrefix, emp)}</strong>
                  </span>
                </div>

              </div>

              {/* 9. Logo Upload / URL Section */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {editLogoUrl ? (
                    <div style={{ position: 'relative' }}>
                      <img src={editLogoUrl} alt="Logo" style={{ maxHeight: '50px', maxWidth: '120px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px', background: '#fff' }} />
                      <button
                        type="button"
                        onClick={() => setEditLogoUrl('')}
                        style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="إزالة الشعار"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#64748b' }}>
                      🏥
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>شعار المنشأة (Logo):</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>يمكنك رفع صورة شعار بدقة عالية ليظهر في ترويسة العقد المطبوع</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{
                    background: '#0f766e',
                    color: '#ffffff',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span>📤</span> رفع شعار من الجهاز
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {editLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setEditLogoUrl('')}
                      style={{
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: '1px solid #fca5a5',
                        padding: '7px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      حذف الشعار
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              padding: '14px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={handleResetOrgContractSettings}
                style={{
                  background: 'none',
                  border: '1px solid #cbd5e1',
                  color: '#64748b',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                🔄 استعادة القيم الافتراضية
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsOrgSettingsModalOpen(false)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrgContractSettings}
                  style={{
                    background: 'linear-gradient(135deg, #0f766e, #0d9488)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 22px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(15, 118, 110, 0.2)'
                  }}
                >
                  <span>💾</span> حفظ واعتماد بيانات الترويسة
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
