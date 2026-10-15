import React, { useState, useEffect, useMemo } from 'react';
import '../../styles/contracts.css';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Send,
  Plus,
  Trash2,
  DollarSign,
  Building2,
  Users,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit3,
  ExternalLink,
  BookOpen,
  Award,
  Lock,
  Percent,
  TrendingUp,
  HelpCircle,
  Eye,
  Check,
  X,
  FileCheck
} from 'lucide-react';
import { triggerDirectPrint } from '../../utils/printHelper';

// الصياغة القانونية النموذجية المحكمة للعقد وفق القانون المصري
export const DEFAULT_LEGAL_ARTICLES = [
  {
    id: 'art_1',
    title: 'البند الأول: موضوع العقد ونطاق ترخيص الاستخدام (Scope of License)',
    badge: 'ترخيص الاستخدام',
    content: `يمنح الطرف الأول (الشركة المطورة) بموجب هذا العقد للطرف الثاني (المؤسسة المتعاقدة) ترخيصاً تشغيلياً محدوداً، غير حصري، وغير قابل للتحويل للغير، لاستخدام المنظومة السحابية المتكاملة لإدارة الموارد البشرية والورديات والرواتب ومشتريات الصيدليات (Pharma HR System)، بما يشمل تطبيق الويب (PWA)، وتطبيق سطح المكتب (Desktop App)، وتطبيق كشك الفروع الذكي (Electronic Kiosk). ويسري هذا الترخيص حصرياً داخل النطاق الجغرافي لجمهورية مصر العربية ولعدد الفروع وقوة العمل المحددة في ملحق الاشتراك المرفق بهذا العقد.`
  },
  {
    id: 'art_2',
    title: 'البند الثاني: الملكية الفكرية وحماية الشفرة المصدرية (IP & Source Code Protection)',
    badge: 'حماية المطور',
    content: `يقر الطرف الثاني إقراراً صريحاً وقاطعاً بأن كافة حقوق الملكية الفكرية، وحقوق الطبع والنشر، والعلامات التجارية، والشفرة المصدرية البرمجية (Source Code)، وهندسة قواعد البيانات، وخوارزميات الذكاء الاصطناعي للتعرف على الوجه، والتصميمات الرقمية للنظام هي ملكية حصرية وأبدية للطرف الأول وحده. يُحظر حظراً مطلقاً على الطرف الثاني أو تابعيه أو أي طرف خارجي من قبله محاولة فك الشفرة أو الهندسة العكسية (Reverse Engineering) أو التعديل أو النسخ أو إعادة بيع أو تأجير المنظومة من الباطن. وفي حال ثبوت أي إخلال بهذا البند، يلتزم الطرف الثاني بدفع غرامة اتفاقية وتعويض رادع لا يقل عن 500,000 ج.م (خمسمائة ألف جنيه مصري) مع احتفاظ الطرف الأول بحقه الكامل في التعويض الجنائي والمدني.`
  },
  {
    id: 'art_3',
    title: 'البند الثالث: سرية البيانات وحمايتها الفائقة (Data Privacy & Confidentiality)',
    badge: 'حماية المؤسسة',
    content: `يقر ويلتزم الطرف الأول بأن جميع البيانات الرقمية، والمعلومات الشخصية، وسجلات الحضور والبصمات، وملفات الموظفين، وكشوف الحسابات والرواتب المدخلة على النظام هي ملكية خاصة، حصرية، وسرية للطرف الثاني. يتعهد الطرف الأول بتطبيق أحدث المعايير الأمنية للتشفير (SSL/TLS & AES-256) وضمان عزل قواعد البيانات الخاصة بالطرف الثاني عزل تاماً، وعدم استغلالها أو الاطلاع عليها أو مشاركتها مع أي جهة أو طرف ثالث أياً كان، وذلك اتساقاً مع أحكام قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020.`
  },
  {
    id: 'art_4',
    title: 'البند الرابع: المقابل المالي ومواعيد السداد وفترة السماح (Payment Terms & Grace Period)',
    badge: 'شروط السداد',
    content: `يلتزم الطرف الثاني بسداد القيمة التعاقدية للاشتراك ورسوم التأسيس المحددة في هذا العقد في مواعيد استحقاقها المحددة. يُمنح الطرف الثاني فترة سماح رسمية قدرها (5 أيام عمل) تبدأ من تاريخ استحقاق الفاتورة الدورية. وفي حال انقضاء فترة السماح دون سداد المستحقات دون عذر كتابي مقبول، يحق للطرف الأول إيقاف وتعليق صلاحيات الدخول للنظام مؤقتاً حتى تمام التسوية، دون أن يترتب على ذلك أي مسؤولية أو تعويض على عاتق الطرف الأول عن أي ضرر قد يلحق بالطرف الثاني جراء التوقف.`
  },
  {
    id: 'art_5',
    title: 'البند الخامس: اتفاقية مستوى الخدمة والجاهزية والدعم الفني (SLA 99.5% & Support)',
    badge: 'حماية المؤسسة',
    content: `يلتزم الطرف الأول بضمان استقرار الخوادم وجاهزية النظام للعمل بنسبة توافر شهري لا تقل عن 99.5% (Uptime SLA)، باستثناء فترات الصيانة الوقائية الدورية التي يتم إخطار الطرف الثاني بها مسبقاً بـ 24 ساعة والتي تتم في أوقات الذروة المنخفضة (بعد منتصف الليل). كما يلتزم الطرف الأول بتقديم الدعم الفني التقني على مدار أيام العمل المعتادة، والاستجابة للأعطال الطارئة التي تعيق العمل خلال مدة أقصاها ساعتان من توقيت استلام البلاغ، وإجراء نسخ احتياطي يومي مشفر تلقائياً لكافة قواعد البيانات.`
  },
  {
    id: 'art_6',
    title: 'البند السادس: التجهيز، التدريب، ومحاضر الاستلام (Onboarding & Training)',
    badge: 'التنفيذ والتشغيل',
    content: `يلتزم الطرف الأول بتجهيز وإعداد الحساب السحابي المؤسسي للطرف الثاني، وربط الفروع، وتقديم جلسات تدريبية عملية (عن بُعد أو حضورياً وفق الاتفاق) لمديري الفروع ومسؤولي الموارد البشرية والحسابات على كافة وظائف النظام. ويُعتبر استمرار الطرف الثاني في استخدام المنظومة لمدة تتجاوز 7 أيام عمل من تاريخ تسليم بيانات الاعتماد بمثابة إقرار بالاستلام والموافقة التامة على مطابقة النظام للمواصفات الفنية المتفق عليها.`
  },
  {
    id: 'art_7',
    title: 'البند السابع: القوة القاهرة وحدود المسؤولية القانونية (Force Majeure & Limitation of Liability)',
    badge: 'الاستقرار القانوني',
    content: `لا يُعتبر أي من الطرفين مسؤولاً أو مخلاً بالتزاماته التعاقدية إذا كان العجز عن الوفاء ناتجاً عن أحداث القوة القاهرة الخارجة عن إرادته المعقولة (مثل: الانقطاع العام لكابلات الإنترنت أو شبكات الاتصالات الإقليمية، الكوارث الطبيعية، الحروب، القرارات السيادية الحكومية، أو الهجمات السيبرانية العالمية غير المسبوقة). وفي جميع الأحوال، تنحصر أقصى مسؤولية مالية وتعويضية للطرف الأول تجاه الطرف الثاني في حدود ما دفعه الطرف الثاني خلال فترة الثلاثة أشهر السابقة للواقعة فقط.`
  },
  {
    id: 'art_8',
    title: 'البند الثامن: سريان العقد ومدته والتجديد التلقائي (Term & Auto-Renewal)',
    badge: 'المدة والسريان',
    content: `يسري هذا العقد لمدة عام ميلادي كامل (أو المدة المتفق عليها في جدول الاشتراك) تبدأ من تاريخ توقيعه وسداد الدفعة الأولى. ويتجدد هذا العقد تلقائياً لمدد مماثلة ما لم يُخطر أحد الطرفين الآخر رسمياً عبر خطاب كتابي أو بريد إلكتروني موثق برغبته في عدم التجديد قبل موعد نهاية العقد بـ 30 يوماً على الأقل.`
  },
  {
    id: 'art_9',
    title: 'البند التاسع: إنهاء التعاقد وحق تصدير البيانات (Termination & Data Handover)',
    badge: 'حقوق المؤسسة',
    content: `في حال انتهاء مدة التعاقد أو رغبة الطرف الثاني في عدم التجديد، يلتزم الطرف الأول بالحفاظ على بيانات الطرف الثاني كاملة وتوفير آلية تصدير رقمية مفتوحة (Excel / JSON) لكافة سجلات الحضور، الرواتب، والموظفين لمدة 15 يوماً من تاريخ انتهاء التعاقد لتمكين الطرف الثاني من سحب أرشيفه بالكامل. وبعد انقضاء هذه المدة، يتعهد الطرف الأول بالحذف النهائي والآمن لبيانات المؤسسة من خوادمه التشغيلية لحماية الخصوصية.`
  },
  {
    id: 'art_10',
    title: 'البند العاشر: القانون الواجب التطبيق وفض النزاعات (Governing Law & Jurisdiction)',
    badge: 'الاختصاص القضائي',
    content: `يخضع هذا العقد ويفسر وتنفذ أحكامه وفقاً للقوانين السارية المعمول بها في جمهورية مصر العربية (وعلى الأخص أحكام القانون المدني وقانون التجارة الإلكترونية وقانون حماية الملكية الفكرية رقم 82 لسنة 2002 وقانون حماية البيانات الشخصية رقم 151 لسنة 2020). وفي حال نشوء أي نزاع يتعذر حله ودياً خلال 15 يوماً، يكون الاختصاص القضائي المكاني منعقداً لمحاكم القاهرة/الجيزة الاقتصادية وفقاً لقواعد الاختصاص النوعي والقيمي.`
  }
];

export default function ContractsManagementModule({ companies = [], plans = [], showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('generator'); // generator | subscriptions | playbook
  const [expandedArticle, setExpandedArticle] = useState('art_1');
  const [previewContractModalOpen, setPreviewContractModalOpen] = useState(false);
  const [activePreviewContract, setActivePreviewContract] = useState(null);

  // استرجاع العقود المحفوظة من التخزين المحلي
  const [savedContracts, setSavedContracts] = useState(() => {
    try {
      const stored = localStorage.getItem('developer_legal_contracts_v1');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse saved contracts', e);
    }
    // بيانات أولية نموذجية مبنية على الشركات
    return [
      {
        id: 'cnt_001',
        contractNumber: 'SaaS-MSA-2026-101',
        companyId: companies[0]?.id || 'comp_alpha',
        clientName: companies[0]?.name || 'مجموعة صيدليات النخبة والشفاء',
        commercialRegister: '109842 / جيزة',
        taxNumber: '482-194-092',
        representativeName: 'د. خالد عبد الرحمن الشريف',
        representativeTitle: 'رئيس مجلس الإدارة والعضو المنتدب',
        clientPhone: '01098765432',
        clientAddress: '14 شارع التحرير، الدقي، الجيزة، مصر',
        branchesCount: 6,
        employeesCount: 54,
        planType: 'enterprise',
        planName: 'باقة سلاسل المؤسسات (Enterprise Tier)',
        subscriptionModel: 'annual',
        subscriptionPrice: 38000,
        setupFee: 3000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        gracePeriodDays: 5,
        slaUptime: '99.5%',
        paymentTerms: 'يُسدد الاشتراك مقدماً سنوياً، مع فترة سماح 5 أيام عمل',
        customClauses: 'يشمل العقد ربط 6 أجهزة بصمة فيزيائية بالفروع مجاناً مع توفير تدريب ميداني لمشرفي الفروع.',
        articles: DEFAULT_LEGAL_ARTICLES,
        status: 'active',
        createdAt: '2026-01-01T10:00:00Z'
      },
      {
        id: 'cnt_002',
        contractNumber: 'SaaS-MSA-2026-102',
        companyId: companies[1]?.id || 'comp_beta',
        clientName: companies[1]?.name || 'صيدلية الأمل المركزية',
        commercialRegister: '94821 / القاهرة',
        taxNumber: '312-884-219',
        representativeName: 'د. محمود صبري حسن',
        representativeTitle: 'المدير العام والممثل القانوني',
        clientPhone: '01123456789',
        clientAddress: '28 شارع الهرم، الجيزة، مصر',
        branchesCount: 2,
        employeesCount: 18,
        planType: 'pro',
        planName: 'باقة الأعمال والنمو (Business Pro)',
        subscriptionModel: 'annual',
        subscriptionPrice: 17500,
        setupFee: 1500,
        startDate: '2026-09-01',
        endDate: '2026-10-31', // ستنتهي قريباً لاختبار مؤشر التنبيه
        gracePeriodDays: 5,
        slaUptime: '99.5%',
        paymentTerms: 'دفع سنوي مع إمكانية التجديد بخصم 15% للتجديد المبكر',
        customClauses: 'تفعيل كشك بصمة الوجه الذكي على شاشات الفروع مع نظام نواقص الأدوية.',
        articles: DEFAULT_LEGAL_ARTICLES,
        status: 'expiring_soon',
        createdAt: '2026-09-01T10:00:00Z'
      }
    ];
  });

  // نموذج محرر العقد الحالي
  const [formData, setFormData] = useState({
    contractNumber: `SaaS-MSA-2026-${Math.floor(100 + Math.random() * 900)}`,
    companyId: '',
    clientName: '',
    commercialRegister: '',
    taxNumber: '',
    representativeName: '',
    representativeTitle: 'المدير العام والممثل القانوني',
    clientPhone: '',
    clientAddress: '',
    branchesCount: 1,
    employeesCount: 10,
    planType: 'pro',
    planName: 'باقة الأعمال والنمو (Business Pro)',
    subscriptionModel: 'annual',
    subscriptionPrice: 17500,
    setupFee: 2000,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
    gracePeriodDays: 5,
    slaUptime: '99.5%',
    paymentTerms: 'سداد الاشتراك مقدماً سنوياً، مع فترة سماح 5 أيام عمل قبل تعليق الخدمة.',
    customClauses: 'يشمل العقد تفعيل كشك بصمة الوجه الذكي بكافة الفروع وربط إشعارات الواتساب المباشرة.',
    articles: DEFAULT_LEGAL_ARTICLES
  });

  // حفظ في التخزين المحلي عند أي تعديل في العقود
  useEffect(() => {
    try {
      localStorage.setItem('developer_legal_contracts_v1', JSON.stringify(savedContracts));
    } catch (e) {
      console.error('Failed to save contracts to localStorage', e);
    }
  }, [savedContracts]);

  // عند اختيار شركة من القائمة، تعبئة بياناتها تلقائياً
  const handleSelectCompany = (comp) => {
    if (!comp) return;
    setFormData(prev => ({
      ...prev,
      companyId: comp.id,
      clientName: comp.name || '',
      clientPhone: comp.contact_phone || comp.phone || '',
      branchesCount: comp.branches_count || comp.branches?.length || 1,
      employeesCount: comp.employees_count || comp.employees?.length || 10,
      representativeName: comp.contact_name || comp.owner_name || '',
      planName: comp.plan_name || prev.planName,
      startDate: comp.subscription_start ? comp.subscription_start.slice(0, 10) : prev.startDate,
      endDate: comp.subscription_end ? comp.subscription_end.slice(0, 10) : prev.endDate
    }));
    showToast?.(`تم جلب بيانات ${comp.name} بنجاح إلى نموذج العقد`, 'info');
  };

  // تعديل نص بند معين في العقد
  const handleUpdateArticleContent = (id, newContent) => {
    setFormData(prev => ({
      ...prev,
      articles: prev.articles.map(a => a.id === id ? { ...a, content: newContent } : a)
    }));
  };

  // استعادة الصياغة النموذجية الأصلية للبند
  const handleResetArticle = (id) => {
    const defaultArt = DEFAULT_LEGAL_ARTICLES.find(a => a.id === id);
    if (!defaultArt) return;
    handleUpdateArticleContent(id, defaultArt.content);
    showToast?.(`تمت استعادة الصياغة القانونية النموذجية للبند`, 'info');
  };

  // حفظ العقد الجديد
  const handleSaveContract = (e) => {
    e?.preventDefault();
    if (!formData.clientName.trim()) {
      showToast?.('يرجى كتابة اسم المؤسسة / السلسلة المتعاقدة', 'error');
      return;
    }

    const newContract = {
      id: `cnt_${Date.now()}`,
      ...formData,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    setSavedContracts(prev => [newContract, ...prev.filter(c => c.contractNumber !== formData.contractNumber)]);
    showToast?.(`تم اعتماد وحفظ العقد برقم ${newContract.contractNumber} بنجاح!`, 'success');
    setActiveSubTab('subscriptions');
  };

  // حذف عقد
  const handleDeleteContract = (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا العقد وسجله من المنظومة؟')) return;
    setSavedContracts(prev => prev.filter(c => c.id !== id));
    showToast?.('تم حذف العقد بنجاح', 'info');
  };

  // تجديد الاشتراك بنقرة واحدة لسنة إضافية
  const handleQuickRenew = (contract) => {
    const currentEnd = new Date(contract.endDate);
    const newEnd = new Date(currentEnd.getTime() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const updated = {
      ...contract,
      endDate: newEnd,
      status: 'active',
      renewedAt: new Date().toISOString()
    };

    setSavedContracts(prev => prev.map(c => c.id === contract.id ? updated : c));
    showToast?.(`تم تجديد اشتراك ${contract.clientName} لمدة عام حتى ${newEnd}`, 'success');
  };

  // إرسال تذكير عبر الواتساب للعميل
  const handleSendWhatsAppReminder = (contract) => {
    const phone = (contract.clientPhone || '').replace(/[^0-9]/g, '');
    if (!phone) {
      showToast?.('لا يوجد رقم هاتف مسجل لهذه المنشأة', 'error');
      return;
    }
    const cleanPhone = phone.startsWith('0') ? '2' + phone : (phone.startsWith('2') ? phone : '2' + phone);
    const message = encodeURIComponent(
      `مرحباً د. ${contract.representativeName || contract.clientName}،\nتحية طيبة من إدارة منظومة Pharma HR System.\nنود إحاطتكم علماً بأن اشتراك التعاقد رقم (${contract.contractNumber}) لمؤسستكم الموقرة (${contract.clientName}) سارٍ حتى ${contract.endDate}.\nلضمان استمرار عمل الخوادم والربط السحابي للفروع دون انقطاع، يسعدنا تواصلكم لتجديد الاشتراك أو ترقية باقتكم.\nشكراً لثقتكم الغالية بنا!`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  // تشغيل الطباعة الرسمية للعقد
  const handlePrintContract = (contract) => {
    const contractHtml = generateContractPrintableHtml(contract);
    triggerDirectPrint(contractHtml, `عقد_${contract.contractNumber}_${contract.clientName}`, 'portrait');
  };

  // حساب مؤشرات الأداء الحية للـ SaaS
  const kpiStats = useMemo(() => {
    const total = savedContracts.length;
    const active = savedContracts.filter(c => c.status === 'active').length;
    const today = new Date().toISOString().split('T')[0];
    const expiringSoon = savedContracts.filter(c => {
      const diffDays = Math.ceil((new Date(c.endDate) - new Date(today)) / (1000 * 3600 * 24));
      return diffDays <= 30 && diffDays >= 0;
    }).length;

    const totalARR = savedContracts.reduce((acc, c) => acc + (parseFloat(c.subscriptionPrice) || 0), 0);
    const totalMRR = Math.round(totalARR / 12);

    return { total, active, expiringSoon, totalARR, totalMRR };
  }, [savedContracts]);

  return (
    <div className="contracts-root">
      {/* ── الرأس والتنقل بين التبويبات الفرعية ── */}
      <div className="contracts-header-bar">
        <div className="contracts-header-title-box">
          <div className="contracts-header-icon">
            <ShieldCheck size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>العقود والاشتراكات المؤسسية (Contracts & Subscriptions)</h2>
              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>
                القانون المصري & SLA 99.5%
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              صياغة وإدارة العقود القانونية المحكمة، تتبع الاشتراكات، ودليل وخطة مسؤول المبيعات لإغلاق الصفقات
            </p>
          </div>
        </div>

        {/* أزرار التبويبات الفرعية */}
        <div className="contracts-nav-pills">
          <button
            type="button"
            className={`contracts-nav-pill-btn ${activeSubTab === 'generator' ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab('generator')}
          >
            <FileText size={15} />
            <span>محرر ومولد العقد</span>
          </button>
          <button
            type="button"
            className={`contracts-nav-pill-btn ${activeSubTab === 'subscriptions' ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab('subscriptions')}
          >
            <Building2 size={15} />
            <span>إدارة وتتبع الاشتراكات ({savedContracts.length})</span>
          </button>
          <button
            type="button"
            className={`contracts-nav-pill-btn ${activeSubTab === 'playbook' ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab('playbook')}
          >
            <Award size={15} />
            <span>خطة وخريطة المبيعات 🚀</span>
          </button>
        </div>
      </div>

      {/* ── شريط مؤشرات الأداء الحية للـ SaaS ── */}
      <div className="contracts-kpi-grid">
        <div className="contracts-kpi-card">
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>العقود والاشتراكات السارية</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#34d399', marginTop: '4px' }}>
              {kpiStats.active} <span style={{ fontSize: '13px', color: '#64748b' }}>من {kpiStats.total}</span>
            </div>
          </div>
          <div className="contracts-kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <FileCheck size={22} />
          </div>
        </div>

        <div className="contracts-kpi-card">
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>إجمالي القيمة السنوية (ARR)</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>
              {kpiStats.totalARR.toLocaleString()} <span style={{ fontSize: '12px' }}>ج.م</span>
            </div>
          </div>
          <div className="contracts-kpi-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <DollarSign size={22} />
          </div>
        </div>

        <div className="contracts-kpi-card">
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>الإيراد الشهري المتكرر (MRR)</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#a78bfa', marginTop: '4px' }}>
              {kpiStats.totalMRR.toLocaleString()} <span style={{ fontSize: '12px' }}>ج.م</span>
            </div>
          </div>
          <div className="contracts-kpi-icon-wrap" style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' }}>
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="contracts-kpi-card">
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>اشتراكات تحتاج تجديداً (30 يوم)</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: kpiStats.expiringSoon > 0 ? '#fbbf24' : '#94a3b8', marginTop: '4px' }}>
              {kpiStats.expiringSoon} <span style={{ fontSize: '12px' }}>عميل</span>
            </div>
          </div>
          <div className="contracts-kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════
          التبويب 1: محرر ومولد العقد القانوني التفاعلي
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'generator' && (
        <form onSubmit={handleSaveContract} className="contracts-glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>تجهيز وتوليد عقد تقديم خدمات برمجية سحابية (SaaS Agreement)</h3>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                املأ بيانات المؤسسة والاشتراك لتوليد صيغة قانونية معتمدة قابلة للتعديل والطباعة فوراً
              </p>
            </div>
            {companies?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>جلب سريع من الشركات المسجلة:</span>
                <select
                  className="contracts-field-select"
                  onChange={(e) => {
                    const comp = companies.find(c => String(c.id) === String(e.target.value));
                    handleSelectCompany(comp);
                  }}
                  defaultValue=""
                  style={{ minWidth: '180px' }}
                >
                  <option value="" disabled>-- اختر شركة مسجلة --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* بيانات العقد والمؤسسة */}
          <div className="contracts-form-grid">
            <div className="contracts-field-group">
              <label className="contracts-field-label">رقم العقد التعاقدي (Contract Ref)</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.contractNumber}
                onChange={e => setFormData({ ...formData, contractNumber: e.target.value })}
                required
              />
            </div>

            <div className="contracts-field-group">
              <label className="contracts-field-label">اسم المؤسسة / سلسلة الصيدليات (الطرف الثاني)</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.clientName}
                placeholder="مثال: مجموعة صيدليات الشفاء الحديثة"
                onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                required
              />
            </div>

            <div className="contracts-field-group">
              <label className="contracts-field-label">الممثل القانوني / رئيس مجلس الإدارة</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.representativeName}
                placeholder="مثال: د. أحمد فتحي النجار"
                onChange={e => setFormData({ ...formData, representativeName: e.target.value })}
                required
              />
            </div>

            <div className="contracts-field-group">
              <label className="contracts-field-label">صفة الممثل القانوني</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.representativeTitle}
                placeholder="المدير العام والمفوض بالتوقيع"
                onChange={e => setFormData({ ...formData, representativeTitle: e.target.value })}
              />
            </div>

            <div className="contracts-field-group">
              <label className="contracts-field-label">رقم السجل التجاري</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.commercialRegister}
                placeholder="مثال: 104829 / استثمار الجيزة"
                onChange={e => setFormData({ ...formData, commercialRegister: e.target.value })}
              />
            </div>

            <div className="contracts-field-group">
              <label className="contracts-field-label">رقم البطاقة الضريبية</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.taxNumber}
                placeholder="مثال: 582-192-301"
                onChange={e => setFormData({ ...formData, taxNumber: e.target.value })}
              />
            </div>

            <div className="contracts-field-group">
              <label className="contracts-field-label">هاتف التواصل المعتمد للعميل</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.clientPhone}
                placeholder="010XXXXXXXX"
                onChange={e => setFormData({ ...formData, clientPhone: e.target.value })}
                required
              />
            </div>

            <div className="contracts-field-group">
              <label className="contracts-field-label">العنوان / المقر الرئيسي للطرف الثاني</label>
              <input
                type="text"
                className="contracts-field-input"
                value={formData.clientAddress}
                placeholder="محافظة - مدينة - شارع"
                onChange={e => setFormData({ ...formData, clientAddress: e.target.value })}
              />
            </div>
          </div>

          {/* تفاصيل الباقة والاشتراك والقيم المالية */}
          <div style={{ background: 'rgba(7, 10, 18, 0.45)', padding: '18px 20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={16} /> ملحق الباقة والقيم المالية وجدول السداد
            </h4>
            <div className="contracts-form-grid">
              <div className="contracts-field-group">
                <label className="contracts-field-label">نوع الباقة التعاقدية</label>
                <select
                  className="contracts-field-select"
                  value={formData.planType}
                  onChange={e => {
                    const val = e.target.value;
                    let price = 17500;
                    let name = 'باقة الأعمال والنمو (Business Pro)';
                    if (val === 'starter') { price = 6500; name = 'باقة البداية والفرع الفردي (Starter)'; }
                    if (val === 'enterprise') { price = 38000; name = 'باقة سلاسل المؤسسات (Enterprise Tier)'; }
                    if (val === 'on_premise') { price = 65000; name = 'ترخيص تشغيل دائم (On-Premise License)'; }
                    setFormData({ ...formData, planType: val, planName: name, subscriptionPrice: price });
                  }}
                >
                  <option value="starter">باقة البداية (Starter) - حتى 15 موظف</option>
                  <option value="pro">باقة الأعمال (Business Pro) - من 2 إلى 5 فروع</option>
                  <option value="enterprise">باقة المؤسسات (Enterprise) - حتى 15 فرع</option>
                  <option value="on_premise">ترخيص دائم محلي (On-Premise License)</option>
                  <option value="custom">باقة مخصصة (Custom Agreement)</option>
                </select>
              </div>

              <div className="contracts-field-group">
                <label className="contracts-field-label">دورة السداد المتفق عليها</label>
                <select
                  className="contracts-field-select"
                  value={formData.subscriptionModel}
                  onChange={e => setFormData({ ...formData, subscriptionModel: e.target.value })}
                >
                  <option value="annual">سنوي (موصى به - خصم شهرين)</option>
                  <option value="semi_annual">نصف سنوي (كل 6 أشهر)</option>
                  <option value="quarterly">ربع سنوي (كل 3 أشهر)</option>
                  <option value="monthly">شهري</option>
                  <option value="lifetime">دفعة واحدة لمرة واحدة (ترخيص دائم)</option>
                </select>
              </div>

              <div className="contracts-field-group">
                <label className="contracts-field-label">قيمة الاشتراك الدوري (ج.م)</label>
                <input
                  type="number"
                  className="contracts-field-input"
                  value={formData.subscriptionPrice}
                  onChange={e => setFormData({ ...formData, subscriptionPrice: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>

              <div className="contracts-field-group">
                <label className="contracts-field-label">رسوم التجهيز والتدريب لمرة واحدة (ج.م)</label>
                <input
                  type="number"
                  className="contracts-field-input"
                  value={formData.setupFee}
                  onChange={e => setFormData({ ...formData, setupFee: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="contracts-field-group">
                <label className="contracts-field-label">عدد الفروع المشمولة</label>
                <input
                  type="number"
                  className="contracts-field-input"
                  value={formData.branchesCount}
                  onChange={e => setFormData({ ...formData, branchesCount: parseInt(e.target.value, 10) || 1 })}
                  min="1"
                />
              </div>

              <div className="contracts-field-group">
                <label className="contracts-field-label">الحد الأقصى لقوة العمل (موظفين)</label>
                <input
                  type="number"
                  className="contracts-field-input"
                  value={formData.employeesCount}
                  onChange={e => setFormData({ ...formData, employeesCount: parseInt(e.target.value, 10) || 10 })}
                  min="1"
                />
              </div>

              <div className="contracts-field-group">
                <label className="contracts-field-label">تاريخ بدء سريان العقد</label>
                <input
                  type="date"
                  className="contracts-field-input"
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>

              <div className="contracts-field-group">
                <label className="contracts-field-label">تاريخ انتهاء التعاقد / موعد التجديد</label>
                <input
                  type="date"
                  className="contracts-field-input"
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label className="contracts-field-label">شروط استثنائية أو خدمات إضافية متفق عليها (Custom Clauses)</label>
              <textarea
                rows="2"
                className="contracts-field-textarea"
                value={formData.customClauses}
                placeholder="أدخل أي شروط مخصصة مثل ربط كاميرات أو تدريب إضافي..."
                onChange={e => setFormData({ ...formData, customClauses: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* البنود القانونية الـ 10 التفاعلية */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                  بنود العقد القانوني الـ 10 (صياغة معتمدة تضمن حق المطور وحق المؤسسة)
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  يمكنك النقر على أي بند لتعديل نصه لعميل معين أو استعادة الصياغة النموذجية الأصلية
                </p>
              </div>
              <button
                type="button"
                className="contracts-btn-outline"
                onClick={() => {
                  setFormData({ ...formData, articles: DEFAULT_LEGAL_ARTICLES });
                  showToast?.('تمت استعادة كافة البنود القانونية النموذجية الافتراضية', 'info');
                }}
              >
                <RefreshCw size={13} /> استعادة الصياغة النموذجية لكل البنود
              </button>
            </div>

            {formData.articles.map((art, idx) => (
              <div key={art.id} className="contracts-article-item">
                <div
                  className="contracts-article-header"
                  onClick={() => setExpandedArticle(expandedArticle === art.id ? null : art.id)}
                >
                  <div className="contracts-article-title-wrap">
                    <span style={{ color: '#10b981', fontWeight: 900 }}>{idx + 1}.</span>
                    <span>{art.title}</span>
                    <span className="contracts-article-badge">{art.badge}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {expandedArticle === art.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {expandedArticle === art.id && (
                  <div className="contracts-article-body">
                    <textarea
                      rows="4"
                      className="contracts-field-textarea"
                      style={{ width: '100%', fontSize: '13px', lineHeight: '1.6' }}
                      value={art.content}
                      onChange={(e) => handleUpdateArticleContent(art.id, e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button
                        type="button"
                        className="contracts-btn-outline"
                        style={{ fontSize: '11.5px', padding: '4px 8px' }}
                        onClick={() => handleResetArticle(art.id)}
                      >
                        <RefreshCw size={11} /> استعادة الصياغة النموذجية لهذا البند
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* أزرار الحفظ والمعاينة والطباعة */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              * هذا العقد معتمد وصالح للتوقيع اليدوي والإلكتروني وإرفاق الأختام الرسمية للطرفين.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                className="contracts-btn-secondary"
                onClick={() => {
                  setActivePreviewContract(formData);
                  setPreviewContractModalOpen(true);
                }}
              >
                <Eye size={15} /> معاينة العقد الرسمي
              </button>
              <button
                type="button"
                className="contracts-btn-secondary"
                onClick={() => handlePrintContract(formData)}
              >
                <Printer size={15} /> طباعة العقد فوراً
              </button>
              <button
                type="submit"
                className="contracts-btn-primary"
              >
                <FileCheck size={16} /> اعتماد وحفظ العقد والاشتراك
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          التبويب 2: إدارة وتتبع الاشتراكات والعقود الحية
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'subscriptions' && (
        <div className="contracts-glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>سجل العقود واشتراكات المؤسسات الحية (Enterprise Subscriptions Tracker)</h3>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                متابعة دورة حياة عقود العملاء، مواعيد التجديد، وإرسال تنبيهات الواتساب بنقرة واحدة
              </p>
            </div>
            <button
              type="button"
              className="contracts-btn-primary"
              onClick={() => setActiveSubTab('generator')}
            >
              <Plus size={15} /> إضافة وتوليد عقد جديد
            </button>
          </div>

          <div className="contracts-table-container">
            <table className="contracts-data-table">
              <thead>
                <tr>
                  <th>رقم العقد</th>
                  <th>المؤسسة / السلسلة</th>
                  <th>الممثل القانوني & الهاتف</th>
                  <th>الباقة المعتمدة</th>
                  <th>الفروع / القوة</th>
                  <th>القيمة السنوية</th>
                  <th>تاريخ التجديد</th>
                  <th>الحالة</th>
                  <th style={{ textAlign: 'center' }}>إجراءات العقد والتجديد</th>
                </tr>
              </thead>
              <tbody>
                {savedContracts.map(cnt => {
                  const today = new Date().toISOString().split('T')[0];
                  const diffDays = Math.ceil((new Date(cnt.endDate) - new Date(today)) / (1000 * 3600 * 24));
                  const isExpiring = diffDays <= 30 && diffDays >= 0;
                  const isExpired = diffDays < 0;

                  return (
                    <tr key={cnt.id}>
                      <td style={{ fontWeight: 800, color: '#38bdf8' }}>{cnt.contractNumber}</td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{cnt.clientName}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>س.ت: {cnt.commercialRegister || 'غير مدرج'}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '13px' }}>{cnt.representativeName || 'الإدارة العامة'}</div>
                        <div style={{ fontSize: '11.5px', color: '#38bdf8', direction: 'ltr', textAlign: 'right' }}>{cnt.clientPhone}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{cnt.planName}</div>
                        <div style={{ fontSize: '11px', color: '#a78bfa' }}>{cnt.subscriptionModel === 'annual' ? 'دفع سنوي' : 'دفع دوري'}</div>
                      </td>
                      <td>
                        <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '6px', fontSize: '11.5px' }}>
                          {cnt.branchesCount} فروع / {cnt.employeesCount} موظف
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, color: '#34d399' }}>
                        {(cnt.subscriptionPrice || 0).toLocaleString()} ج.م
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{cnt.endDate}</div>
                        <div style={{ fontSize: '11px', color: isExpired ? '#f43f5e' : (isExpiring ? '#f59e0b' : '#94a3b8') }}>
                          {isExpired ? 'منتهي الصلاحية' : `متبقي ${diffDays} يوم`}
                        </div>
                      </td>
                      <td>
                        {isExpired ? (
                          <span className="contract-status-pill is-suspended">متوقف (منتهي)</span>
                        ) : isExpiring ? (
                          <span className="contract-status-pill is-expiring">ينتهي قريباً</span>
                        ) : (
                          <span className="contract-status-pill is-active">سارٍ ونشط</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="contracts-btn-outline"
                            title="معاينة العقد الرسمي"
                            onClick={() => {
                              setActivePreviewContract(cnt);
                              setPreviewContractModalOpen(true);
                            }}
                          >
                            <Eye size={13} /> معاينة
                          </button>
                          <button
                            type="button"
                            className="contracts-btn-outline"
                            title="طباعة العقد"
                            onClick={() => handlePrintContract(cnt)}
                          >
                            <Printer size={13} /> طباعة
                          </button>
                          <button
                            type="button"
                            className="contracts-btn-outline"
                            style={{ color: '#25d366', borderColor: 'rgba(37, 211, 102, 0.4)' }}
                            title="إرسال تذكير عبر الواتساب"
                            onClick={() => handleSendWhatsAppReminder(cnt)}
                          >
                            <Send size={13} /> واتساب
                          </button>
                          <button
                            type="button"
                            className="contracts-btn-outline"
                            style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                            title="تجديد الاشتراك لعام إضافي بنقرة واحدة"
                            onClick={() => handleQuickRenew(cnt)}
                          >
                            <RefreshCw size={13} /> تجديد
                          </button>
                          <button
                            type="button"
                            className="contracts-btn-outline"
                            style={{ color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.4)' }}
                            title="حذف العقد"
                            onClick={() => handleDeleteContract(cnt.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          التبويب 3: خطة ودليل مسؤول مبيعات الاشتراكات الخارق (Sales Playbook)
          ═════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'playbook' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* كارت استراتيجية العقد كأداة إغلاق */}
          <div className="contracts-glass-card" style={{ borderRight: '4px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '8px', borderRadius: '10px', color: '#10b981' }}>
                <Award size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900 }}>
                  استراتيجية مسؤول المبيعات المحترف: "العقد القانوني كأقوى سلاح لإغلاق الصفقات (Closing Weapon)"
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                  في سوق الصيدليات وسلاسل التجزئة في مصر، العميل لا يخاف من السعر بقدر خوفه من 3 أشياء: (تسرب الرواتب، توقف الخوادم، ومشاكل أجهزة البصمة). إليك كيف تحول العقد لدافع شراء فوري:
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '16px' }}>
              <div style={{ background: 'rgba(7, 10, 18, 0.5)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#38bdf8', fontWeight: 800, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={15} /> 1. طمأنة سرية الرواتب والبيانات
                </div>
                <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  أبرز للعميل <strong>البند الثالث</strong>: نحن ملزمون قانوناً بتشفير بياناتك وفق قانون حماية البيانات الشخصية رقم 151 لسنة 2020، ولا يحق لنا الاطلاع على رواتبك أو مشاركتها.
                </div>
              </div>

              <div style={{ background: 'rgba(7, 10, 18, 0.5)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#34d399', fontWeight: 800, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={15} /> 2. ضمان استقرار الخدمة (SLA 99.5%)
                </div>
                <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  أبرز للعميل <strong>البند الخامس</strong>: نضمن لك 99.5% استقراراً في الخوادم واستجابة للدعم في ساعتين ونسخ احتياطي يومي مشفر تلقائي.
                </div>
              </div>

              <div style={{ background: 'rgba(7, 10, 18, 0.5)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#fbbf24', fontWeight: 800, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ExternalLink size={15} /> 3. حرية استرداد البيانات (Zero Lock-in)
                </div>
                <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  أبرز للعميل <strong>البند التاسع</strong>: لو قررت في أي وقت عدم التجديد، لك الحق الكامل في تصدير أرشيفك الرقمي كاملاً (Excel/JSON) مجاناً.
                </div>
              </div>
            </div>
          </div>

          {/* مراحل دورة المبيعات الـ 5 */}
          <div className="sales-playbook-grid">
            <div className="sales-playbook-card">
              <span className="sales-step-badge" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                المرحلة 1: كشف الهدر المالي (The Cost of Inaction)
              </span>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>حساب خسائر العميل قبل بيع البرنامج</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                لا تتحدث عن مميزات البرنامج أولاً، اسأل صاحب الصيدليات:
                <br />
                <em>"عند حضرتك كم موظف؟ 30 موظف.. لو كل موظف بيتأخر أو بيخرج بدري ربع ساعة بس في اليوم، حضرتك بتخسر شهرياً حوالي 7,500 إلى 12,000 جنيه في الرواتب المهدرة!"</em>
                <br />
                <strong>النتيجة:</strong> يدرك العميل أن اشتراك النظام (1,500 ج.م شهرياً) سيوفر له 8 أضعاف تكلفته!
              </p>
            </div>

            <div className="sales-playbook-card">
              <span className="sales-step-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                المرحلة 2: تجربة الفرع الواحد المشروطة (14-Day Pilot)
              </span>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>عرض التجربة الحية القاتل للتردد</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                إذا تردد العميل، قدم له عرض الـ Pilot:
                <br />
                <em>"يا فندم مش هنطلب اشتراك سنة مقدماً، هنركب كشك بصمة الوجه في فرع واحد عند حضرتك لمدة 14 يوم مجاناً، ونطلع لحضرتك كشف رواتب وانضباط الفرع.. لو موفرش لحضرتك أضعاف تمنه هنلغي التعاقد فوراً وبدون أي التزام."</em>
                <br />
                <strong>النتيجة:</strong> 85% من العملاء الذين يجربون النظام في فرع واحد يطلبون تعميمه فوراً على باقي الفروع!
              </p>
            </div>

            <div className="sales-playbook-card">
              <span className="sales-step-badge" style={{ background: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa' }}>
                المرحلة 3: القضاء التام على أجهزة البصمة التقليدية
              </span>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>توفير هائل في الأجهزة (Hardware Replacement)</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                قارن له التكلفة بالأرقام:
                <br />
                - جهاز البصمة الصيني العادي = 8,000 إلى 12,000 ج.م للجهاز الواحد + صيانة وأعطال مستمرة وبصمات سيليكون مضروبة.
                <br />
                - كشك Pharma HR الذكي = يشتغل على شاشة الفرع أو تابلت بسيط ببصمة الوجه والـ AI وبدون تلاعب، ويشتغل حتى لو النت قطع أوفلاين.
              </p>
            </div>
          </div>

          {/* مصفوفة الردود القاتلة على أشهر 5 اعتراضات للعملاء في مصر */}
          <div className="contracts-glass-card">
            <h4 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HelpCircle size={18} color="#38bdf8" /> مصفوفة الردود الحاسمة على أشهر 5 اعتراضات في السوق المصري (Objection Busting)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
              <div className="sales-objection-item">
                <div className="sales-objection-q">الاعتراض 1: "برنامج جهاز البصمة التقليدي بيجي مع الجهاز مجاناً ومش بدفع اشتراك شهري!"</div>
                <div className="sales-objection-a">
                  <strong>الرد المقنع:</strong> "البرنامج المجاني ده مش بيربط الفروع في مكان واحد، وبيبوظ في شيفتات الصيدليات الليلية، ومفهوش تطبيق للموظف ولا كشك ذكاء اصطناعي ولا حسابات رواتب حقيقية ولا واتساب.. حضرتك بتدفع تمنه أضعاف كل شهر في الوقت الضايع والموظفين اللي بيبصموا لبعض!"
                </div>
              </div>

              <div className="sales-objection-item">
                <div className="sales-objection-q">الاعتراض 2: "الإنترنت بيقطع كتير في فروعنا فمش هينفع نظام سحابي!"</div>
                <div className="sales-objection-a">
                  <strong>الرد المقنع:</strong> "النظام بتاعنا مبني بتقنية Offline-First PWA؛ يعني الكشك بيسجل حضور وانصراف الموظفين ببصمة الوجه والكف في الفرع حتى لو كابل النت مفصول تماماً، وأول ما النت يرجع بيبعت البيانات للسيرفر في ثانية بدون فقدان أي بصمة!"
                </div>
              </div>

              <div className="sales-objection-item">
                <div className="sales-objection-q">الاعتراض 3: "عندي شيفتات ليلية من 11 بالليل لـ 8 الصبح والبرامج بتلخبط في تاريخها!"</div>
                <div className="sales-objection-a">
                  <strong>الرد المقنع:</strong> "ده بالظبط السبب اللي عشانه صممنا النظام ده لسلاسل الصيدليات؛ عندنا خوارزمية ذكية بتربط بصمة الدخول باليوم التشغيلي الفعلي لوردية العمل، ومستحيل تعتبر انصراف الصبح هو حضور يوم جديد."
                </div>
              </div>

              <div className="sales-objection-item">
                <div className="sales-objection-q">الاعتراض 4: "الموظفين والصيادلة هيعترضوا على بصمة الوجه وهيفتكروها تجسس!"</div>
                <div className="sales-objection-a">
                  <strong>الرد المقنع:</strong> "العكس تماماً يا فندم؛ النظام بيوفر تطبيق خاص بالموظف على موبايله يقدر يشوف رصيد إجازاته، ويطلب أذوناته وسلفه، ويشوف تفاصيل راتبه بشفافية كاملة دون الحاجة لمراجعة الإدارة، وده بيرفع الرضا الوظيفي جداً."
                </div>
              </div>

              <div className="sales-objection-item">
                <div className="sales-objection-q">الاعتراض 5: "الوضع الاقتصادي صعب وميزانيتنا متسمحش باشتراكات سنوية كبيرة!"</div>
                <div className="sales-objection-a">
                  <strong>الرد المقنع:</strong> "تقدر تبدأ معانا باشتراك ربع سنوي مرن، وقيمة الاشتراك للصيدلية الواحدة تعادل ثمن 2 باكتة علاج واحدة في الشهر؛ والمبالغ اللي هيوفرها لحضرتك النظام من أول 15 يوم هتغطي تكلفته وتزود صافي أرباحك فوراً."
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          نافذة المعاينة والطباعة الرسمية للعقد (Formal Print Preview Modal)
          ═════════════════════════════════════════════════════════════════════════ */}
      {previewContractModalOpen && activePreviewContract && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', width: '100%', maxWidth: '980px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>
            {/* رأس النافذة */}
            <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="#38bdf8" />
                <span style={{ fontSize: '15px', fontWeight: 800 }}>معاينة النسخة الرسمية للعقد التعاقدي ({activePreviewContract.contractNumber})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="contracts-btn-primary"
                  onClick={() => handlePrintContract(activePreviewContract)}
                >
                  <Printer size={15} /> طباعة العقد الرسمي (Print / PDF)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewContractModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* محتوى الورقة الرسمية المعاينة */}
            <div style={{ overflowY: 'auto', padding: '24px', background: '#0b0f19' }}>
              <div className="contract-paper-preview" dangerouslySetInnerHTML={{ __html: generateContractPrintableHtml(activePreviewContract, false) }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// دالة توليد كود الـ HTML للطباعة الرسمية للعقد
function generateContractPrintableHtml(contract, isFullDoc = true) {
  const articlesHtml = (contract.articles || DEFAULT_LEGAL_ARTICLES).map((art, idx) => `
    <div style="margin-bottom: 16px; page-break-inside: avoid;">
      <h4 style="margin: 0 0 6px 0; color: #0f172a; font-size: 13.5px; font-weight: 800;">
        ${idx + 1}. ${art.title}
      </h4>
      <p style="margin: 0; color: #334155; font-size: 12px; line-height: 1.6; text-align: justify;">
        ${art.content}
      </p>
    </div>
  `).join('');

  const bodyContent = `
    <!-- ترويسة العقد الرسمية -->
    <div class="contract-official-header" style="border-bottom: 2.5px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
      <div style="text-align: right;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #0f172a;">عقد تقديم خدمات برمجية سحابية وترخيص تشغيل</h2>
        <h4 style="margin: 3px 0 0; font-size: 13px; font-weight: 700; color: #475569;">(SaaS Master Services Agreement & Service Level Agreement - SLA)</h4>
        <div style="margin-top: 4px; font-size: 11px; color: #64748b;">خاضع لأحكام القانون المدني وقانون حماية الملكية الفكرية وقانون حماية البيانات الشخصية رقم 151 لسنة 2020</div>
      </div>
      <div style="text-align: left;">
        <div style="font-size: 12px; font-weight: 800; color: #0f172a;">رقم العقد: <span style="font-family: monospace; font-size: 13px;">${contract.contractNumber}</span></div>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">تاريخ التحرير: ${contract.startDate}</div>
        <div style="font-size: 11px; color: #10b981; font-weight: 800; margin-top: 2px;">مستوى الخدمة: SLA 99.5%</div>
      </div>
    </div>

    <!-- التمهيد وأطراف العقد -->
    <div class="contract-parties-box" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; font-size: 12.5px; line-height: 1.6;">
      <p style="margin: 0 0 8px 0; font-weight: 700; color: #0f172a;">
        إنه في يوم الموافق <strong>${contract.startDate}</strong> بجمهورية مصر العربية، تم الاتفاق والتراضي بين كل من:
      </p>
      <div style="margin-bottom: 8px;">
        <strong>أولاً: الشركة المطورة لمنظومة Pharma HR System</strong> (المشار إليها فيما بعد بـ <strong>"الطرف الأول"</strong> أو <strong>"مزود الخدمة"</strong>).
      </div>
      <div>
        <strong>ثانياً: السادة / ${contract.clientName}</strong>، سجل تجاري رقم: <strong>${contract.commercialRegister || 'مرفق'}</strong>، بطاقة ضريبية رقم: <strong>${contract.taxNumber || 'مرفق'}</strong>، ومقرها الرئيسي: <strong>${contract.clientAddress || 'جمهورية مصر العربية'}</strong>، ويمثلها في التوقيع على هذا العقد السيد الدكتور / <strong>${contract.representativeName || 'المفوض بالتوقيع'}</strong> بصفته: <strong>${contract.representativeTitle || 'المدير العام والممثل القانوني'}</strong>، هاتف: <strong>${contract.clientPhone}</strong> (المشار إليهم فيما بعد بـ <strong>"الطرف الثاني"</strong> أو <strong>"العميل"</strong>).
      </div>
      <p style="margin: 8px 0 0 0; color: #475569; font-style: italic;">
        * تمهيد: لما كان الطرف الأول يمتلك المنظومة السحابية المتخصصة في إدارة الموارد البشرية والرواتب وبصمات الوجه، ورغب الطرف الثاني في الانتفاع بخدمات المنظومة وفق نظام الاشتراك السحابي، فقد تلاقت الإرادتان على التعاقد وفقاً للبنود الآتية:
      </p>
    </div>

    <!-- جدول الباقة والقيم المالية المعتمدة -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11.5px; border: 1px solid #cbd5e1;">
      <thead>
        <tr style="background: #f1f5f9; color: #0f172a;">
          <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">الباقة المتعاقد عليها</th>
          <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">الفروع وقوة العمل</th>
          <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">دورة السداد</th>
          <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">قيمة الاشتراك الدوري</th>
          <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">رسوم التأسيس</th>
          <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">سريان العقد حتى</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: 800;">${contract.planName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${contract.branchesCount} فروع / ${contract.employeesCount} موظف</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${contract.subscriptionModel === 'annual' ? 'سنوي' : contract.subscriptionModel}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: 900; color: #059669;">${(contract.subscriptionPrice || 0).toLocaleString()} ج.م</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${(contract.setupFee || 0).toLocaleString()} ج.م</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: 800;">${contract.endDate}</td>
        </tr>
      </tbody>
    </table>

    ${contract.customClauses ? `
      <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 11.5px; color: #92400e;">
        <strong>شروط خاصة إضافية متفق عليها:</strong> ${contract.customClauses}
      </div>
    ` : ''}

    <!-- نصوص البنود القانونية العشرة -->
    <div style="margin-bottom: 24px;">
      ${articlesHtml}
    </div>

    <!-- شبكة التواقيع والأختام الرسمية -->
    <div class="contract-signatures-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; padding-top: 18px; border-top: 1.5px dashed #94a3b8; page-break-inside: avoid;">
      <div class="contract-sig-box" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; text-align: center; background: #fafafa;">
        <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 4px;">عن الطرف الأول (الشركة المطورة)</div>
        <div style="font-size: 11px; color: #64748b;">إدارة العقود وتراخيص البرمجيات</div>
        <div style="margin-top: 8px; font-size: 12px;">الاسم: ............................................</div>
        <div style="margin-top: 4px; font-size: 12px;">التوقيع: ............................................</div>
        <div class="contract-sig-stamp-space" style="height: 70px; border: 1px dashed #cbd5e1; border-radius: 6px; margin-top: 8px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 11px;">
          (خاتم الشركة المطورة المعتمد)
        </div>
      </div>

      <div class="contract-sig-box" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; text-align: center; background: #fafafa;">
        <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 4px;">عن الطرف الثاني (${contract.clientName})</div>
        <div style="font-size: 11px; color: #64748b;">الممثل القانوني: ${contract.representativeName}</div>
        <div style="margin-top: 8px; font-size: 12px;">الصفة: ${contract.representativeTitle}</div>
        <div style="margin-top: 4px; font-size: 12px;">التوقيع: ............................................</div>
        <div class="contract-sig-stamp-space" style="height: 70px; border: 1px dashed #cbd5e1; border-radius: 6px; margin-top: 8px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 11px;">
          (خاتم المؤسسة / الصيدلية)
        </div>
      </div>
    </div>
  `;

  if (!isFullDoc) {
    return bodyContent;
  }

  return `
    <div class="contract-printable-area" style="font-family: 'Cairo', 'Tajawal', sans-serif; direction: rtl; padding: 20px 24px; color: #0f172a;">
      ${bodyContent}
    </div>
  `;
}
