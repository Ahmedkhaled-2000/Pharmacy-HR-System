/**
 * bylawsDefaults.js
 * بنود ونصوص وسياسات لائحة العمل الرسمية النموذجية لمجموعة الصيدليات الطبية
 * مع دوال التحويل والتحليل الذكي بين النصوص والمصفوفات الهيكلية المنظمة
 */

export const DEFAULT_PHARMACY_BYLAWS_SECTIONS = [
  {
    id: 'bylaw_preamble',
    title: '📜 مقدمة اللائحة التنظيمية للعمل داخل الفروع',
    category: 'preamble',
    points: [
      'حرصاً من إدارة الصيدلية على تنظيم العمل، وضمان أعلى درجات الانضباط، وحماية حقوق الصيدلية وكافة العاملين بها، وتحقيق بيئة عمل محترمة وآمنة ومهنية، تم اعتماد هذه اللائحة التنظيمية الرسمية.',
      'تُعتبر هذه اللائحة وسياساتها جزءاً لا يتجزأ ومتمماً لعقد العمل الفردي المبرم مع الموظف، وتسري وتُلزم كافة العاملين بجميع فروع ومراكز الصيدلية، ويُعمل بها اعتباراً من تاريخ التعيين والمباشرة.'
    ]
  },
  {
    id: 'bylaw_1',
    title: 'أولاً: الانضباط العام ومواعيد الحضور والورديات',
    category: 'attendance',
    points: [
      'الالتزام التام بمواعيد الشيفت المحددة والحضور قبل الموعد بـ (10) دقائق لإتمام الاستلام والتسليم المنضبط.',
      'تسجيل الحضور والانصراف بدقة عبر منظومة البصمة الإلكترونية المعتمدة داخل النطاق الجغرافي للفرع.',
      '❌ يمنع منعاً باتاً مغادرة مكان العمل أو ترك الفرع أثناء الشيفت بدون إذن مسبق وموثق من المشرف أو مدير الفرع.',
      'أي تأخير عن الموعد المحدد أو غياب بدون إذن رسمي مسبق يُعد مخالفة إدارية تستوجب تطبيق الجزاء المالي اللائحي.'
    ]
  },
  {
    id: 'bylaw_2',
    title: 'ثانياً: احترام التسلسل الإداري والتنظيمي',
    category: 'hierarchy',
    points: [
      'أي شكوى أو طلب أو اعتراض يتم تقديمه رسمياً لمدير الفرع المباشر أولاً للبت فيه والتوجيه بشأنه.',
      '❌ يمنع تجاوز التسلسل الإداري أو إثارة أي شكاوى أو خلافات أمام الزملاء أو المترددين على الصيدلية.',
      'أي تواصل مباشر مع الإدارة العليا دون المرور على مدير الفرع يُعد إجراءً غير معترف به ومخالفة إدارية.'
    ]
  },
  {
    id: 'bylaw_3',
    title: 'ثالثاً: الالتزام بتعليمات مدير الفرع والمشرفين',
    category: 'management',
    points: [
      'تعليمات مدير الفرع أو مشرف الشيفت واجبة التنفيذ الفوري أثناء العمل بما يخدم مصلحة وانتظام الصيدلية.',
      'أي ملاحظات أو استفسارات مهنية يتم مناقشتها بالأسلوب الإداري اللائق في الأوقات المخصصة وبعد انتهاء خدمة العملاء.',
      '❌ يمنع الجدال أو الاعتراض العلني أثناء أوقات العمل أو أثناء التواجد في منطقة خدمة العملاء.'
    ]
  },
  {
    id: 'bylaw_4',
    title: 'رابعاً: السلوك المهني والمظهر اللائق داخل الفرع',
    category: 'professionalism',
    points: [
      'الالتزام بالسلوك المهني الرفيع والأخلاقيات الصيدلانية في جميع الأوقات داخل الصيدلية ومحيطها.',
      'التحدث مع الزملاء والعملاء بأسلوب محترم ولبق ومهذب وهادئ يعكس الصورة المشرفة للمؤسسة.',
      '❌ يمنع العصبية، أو رفع الصوت، أو المزاح غير اللائق، أو التلفظ بما يخالف الآداب العامة وقيم المهنة.',
      'أي تصرف غير معتاد أو يثير الريبة أو يمس سمعة الصيدلية والعاملين بها يُعد مخالفة تنظيمية جسيمة.'
    ]
  },
  {
    id: 'bylaw_5',
    title: 'خامساً: خدمة العملاء والرعاية الدوائية للمرضى',
    category: 'customer_care',
    points: [
      'العميل والمريض المتواجد بالصيدلية له الأولوية القصوى والمطلقة في الرعاية وحسن الاستقبال وسرعة الخدمة.',
      'تقديم المشورة والنصح الدوائي والتوضيحات العلاجية بدقة وأمانة علمية ومهنية متكاملة.',
      '❌ يمنع الانشغال بالهاتف أو ترك العميل ينتظر لأي سبب شخصي أو غير متعلق بمهام العمل.',
      'أي مشكلة أو استفسار معقد مع العميل يتم الرجوع فيه فوراً لمدير الفرع للتعامل معه بهدوء وحكمة.'
    ]
  },
  {
    id: 'bylaw_6',
    title: 'سادساً: قنوات التواصل الرسمية مع العملاء',
    category: 'communication',
    points: [
      'التواصل مع العملاء واستقبال الطلبات يتم حصراً عبر تليفون الفرع أو الخط والواتساب الرسمي المعتمد للصيدلية.',
      '❌ يمنع منعاً باتاً استخدام الهاتف الشخصي أو تبادل أرقام وحسابات شخصية مع العملاء لأي سبب كان.'
    ]
  },
  {
    id: 'bylaw_7',
    title: 'سابعاً: الزي الرسمي وبطاقة التعريف الشخصية (ID)',
    category: 'uniform',
    points: [
      'الالتزام بالبالطو الأبيض النظيف والزي الرسمي المعتمد للصيدلية والمظهر اللائق طوال فترة الشيفت.',
      'ارتداء بطاقة التعريف الشخصية (ID Card) الصادرة من الصيدلية بشكل بارز وواضح للجمهور.',
      '❌ يمنع العمل أو التواجد داخل منطقة خدمة العملاء بدون الزي الرسمي أو بدون بطاقة التعريف.'
    ]
  },
  {
    id: 'bylaw_8',
    title: 'ثامناً: حفظ المتعلقات الشخصية وأماكن العاملين',
    category: 'belongings',
    points: [
      'توضع جميع المتعلقات الشخصية (الحقائب، الملابس، الأغراض الخاصة) في الأماكن والخزائن المخصصة لها فقط.',
      '❌ يمنع وضع أي متعلقات أو أغراض شخصية على كاونتر البيع أو في مساحات خدمة الجمهور والعرض.'
    ]
  },
  {
    id: 'bylaw_9',
    title: 'تاسعاً: تنظيم فترات الصلاة والراحة والمكالمات الطارئة',
    category: 'breaks',
    points: [
      'يتم أداء فريضة الصلاة بالتناوب المنظم بين الزملاء وبما لا يؤثر على سير العمل (بحد أقصى 15 دقيقة للفرد).',
      'المكالمات الشخصية مقتصرة على حالات الضرورة والظروف الطارئة فقط وبأقصر وقت ممكن وبعيداً عن منطقة البيع.'
    ]
  },
  {
    id: 'bylaw_10',
    title: 'عاشراً: حظر دخول غير العاملين للمناطق الخاصة والمعامل',
    category: 'security',
    points: [
      '❌ يمنع منعاً باتاً دخول أي شخص من خارج فريق العمل خلف الكاونتر أو إلى المعمل أو مخزن الأدوية تحت أي مسمى.',
      'أي استثناء للزيارات الرسمية أو أعمال الصيانة يجب أن يتم بموافقة وتنسيق مسبق وصريح من الإدارة.'
    ]
  },
  {
    id: 'bylaw_11',
    title: 'الحادي عشر: ضوابط تناول المأكولات والمشروبات داخل الفرع',
    category: 'dining',
    points: [
      'يُسمح بتناول الوجبات الخفيفة بما لا يؤثر على بيئة العمل وفي الاستراحة المخصصة وبعيداً عن أعين العملاء.',
      '❌ يمنع منعاً باتاً تناول الأطعمة ذات الروائح النفاذة أو إقامة تجمعات طعام أثناء أوقات العمل وأمام المترددين.'
    ]
  },
  {
    id: 'bylaw_12',
    title: 'الثاني عشر: استخدام شبكة الإنترنت وأجهزة ومرافق الفرع',
    category: 'assets',
    points: [
      'أجهزة الكمبيوتر والإنترنت وخطوط الاتصال مخصصة حصرياً لإنجاز معاملات وأنظمة الصيدلية والعمل الرسمي.',
      '❌ يمنع استخدام إمكانيات الفرع لأي أغراض شخصية أو ترفيهية أو تنزيل ملفات وبرامج غير مصرح بها.'
    ]
  },
  {
    id: 'bylaw_13',
    title: 'الثالث عشر: سرية المعلومات وبيانات الصيدلية والمرضى',
    category: 'confidentiality',
    points: [
      'الالتزام التام والمطلق بسرية بيانات الصيدلية، المبيعات، الموردين، والبيانات الصحية والشخصية للمرضى والعملاء.',
      '❌ يمنع التصوير، النشر، أو تداول أي معلومات أو مستندات أو سجلات تخص العمل عبر وسائل التواصل أو غيرها.',
      'يستمر الالتزام القانوني بالسرية سارياً وملزماً للموظف حتى بعد انتهاء علاقة العمل بالصيدلية.'
    ]
  },
  {
    id: 'bylaw_14',
    title: 'الرابع عشر: العُهد غير النقدية والأدوات وتسليم الشيفت والكاشير',
    category: 'custody',
    points: [
      'الحفاظ التام على جميع العُهد المسلمة للموظف (أجهزة الباركود، الطابعات، المفاتيح، الأدوات، الأدوية، والعهدة النقدية).',
      'التسليم الدقيق والشامل للشيفت وجرد الكاشير واستيفاء سجلات التسليم والتسلم المعتمدة بنهاية كل وردية.',
      'يتحمل الموظف المسؤولية القانونية والمادية الكاملة في حالة التقصير أو الإهمال أو الضياع أو التلف الناتج عن سوء الاستخدام.'
    ]
  }
];

/**
 * تحويل مصفوفة البنود المنظمة إلى نص مقروء ومقسم
 */
export function sectionsToBylawsText(sections = []) {
  if (!Array.isArray(sections) || sections.length === 0) {
    sections = DEFAULT_PHARMACY_BYLAWS_SECTIONS;
  }

  return sections.map((sec) => {
    const title = sec.title || 'بند من بنود اللائحة';
    const pointsText = (sec.points || []).map((p) => {
      const cleanP = String(p).trim();
      if (cleanP.startsWith('❌') || cleanP.startsWith('✔️') || cleanP.startsWith('-') || cleanP.startsWith('▪') || cleanP.startsWith('•')) {
        return cleanP;
      }
      return `- ${cleanP}`;
    }).join('\n');

    return `${title}\n${pointsText}`;
  }).join('\n\n');
}

/**
 * فحص ما إذا كان السطر يمثل عنوان بند / مادة / قسم في اللائحة
 */
export function isBylawsHeaderLine(line) {
  if (!line) return false;
  // إزالة الأحرف غير المرئية والرموز والترقيم والمسافات الزائدة
  let t = String(line)
    .replace(/[\u200E\u200F\u200B\uFEFF\u00A0]/g, ' ')
    .trim()
    .replace(/^[\*\#\-\_\=\.\:\—\–\•\▪\▫\🔹\🔸\📌\✨\⭐\📜\📋\⚖️]+\s*/, '')
    .trim();

  if (!t) return false;

  // إذا كان السطر مجرد خط فاصل
  if (/^[\-\_\=\*\.]{3,}$/.test(t)) return false;

  // فحص صيغ الأرقام والترتيب العربي الشائعة
  const arabicOrdinalsRegex = /^(📜|📋|⚖️|🔹|🔸|▪️|📌|⭐)?\s*(مقدمة|تمهيد|اللائحة\s+التنظيمية|الائحة\s+التنظيمية|أولاً|اولاً|أولا|اولا|ثانياً|ثانيا|ثالثاً|ثالثا|رابعاً|رابعا|خامساً|خامسا|سادساً|سادسا|سابعاً|سابعا|ثامناً|ثامنا|تاسعاً|تاسعا|عاشراً|عاشرا|الحادي\s*عشر|حادي\s*عشر|الثاني\s*عشر|ثاني\s*عشر|الثالث\s*عشر|ثالث\s*عشر|الرابع\s*عشر|رابع\s*عشر|الخامس\s*عشر|خامس\s*عشر|السادس\s*عشر|سادس\s*عشر|السابع\s*عشر|سابع\s*عشر|الثامن\s*عشر|ثامن\s*عشر|التاسع\s*عشر|تاسع\s*عشر|العشرون|البند\s*(\d+|[^\s\:\-]+)|المادة\s*(\d+|[^\s\:\-]+)|بند\s*(\d+|[^\s\:\-]+)|مادة\s*(\d+|[^\s\:\-]+)|(\d+)[\.\-\:\)])/i;

  return arabicOrdinalsRegex.test(t);
}

/**
 * دالة ذكية لتطهير وتفكيك البنود المدمجة في أي قسم تلقائياً
 */
export function sanitizeBylawsSections(sections = []) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return DEFAULT_PHARMACY_BYLAWS_SECTIONS;
  }

  const result = [];
  let counter = 1;

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i] || {};
    const rawTitle = String(sec.title || '').replace(/[\u200E\u200F\u200B\uFEFF\u00A0]/g, ' ').trim();
    const isPreamble = sec.category === 'preamble' || rawTitle.includes('مقدمة') || rawTitle.includes('تمهيد') || rawTitle.includes('اللائحة التنظيمية');
    
    let currentSec = {
      id: sec.id || (isPreamble ? 'bylaw_preamble' : `bylaw_${counter++}`),
      title: rawTitle || (isPreamble ? '📜 مقدمة اللائحة التنظيمية' : `البند رقم (${counter})`),
      category: isPreamble ? 'preamble' : (sec.category || 'general'),
      points: []
    };

    const points = Array.isArray(sec.points) ? sec.points : [];

    for (let j = 0; j < points.length; j++) {
      let pStr = String(points[j] || '').replace(/[\u200E\u200F\u200B\uFEFF\u00A0]/g, ' ').trim();
      
      // إهمال الأسطر الفاصلة
      if (!pStr || /^[\-\_\=\*\.]{3,}$/.test(pStr) || pStr.startsWith('====') || pStr.startsWith('----') || pStr.startsWith('____')) {
        continue;
      }

      // إذا كانت النقطة تحتوي على رأس بند جديد تم دمجه بالخطأ
      if (isBylawsHeaderLine(pStr)) {
        // حفظ القسم الحالي إذا كان يحتوي على بيانات
        if (currentSec.points.length > 0 || currentSec.title) {
          result.push(currentSec);
        }
        const isNextPreamble = pStr.includes('مقدمة') || pStr.includes('تمهيد') || pStr.includes('اللائحة التنظيمية');
        currentSec = {
          id: isNextPreamble ? 'bylaw_preamble' : `bylaw_${counter++}`,
          title: pStr,
          category: isNextPreamble ? 'preamble' : 'general',
          points: []
        };
      } else {
        // تنظيف علامات الترقيم العادية
        let cleanP = pStr;
        if (cleanP.startsWith('- ') || cleanP.startsWith('* ') || cleanP.startsWith('▪ ') || cleanP.startsWith('• ') || cleanP.startsWith('▫ ')) {
          cleanP = cleanP.slice(2).trim();
        }
        currentSec.points.push(cleanP);
      }
    }

    if (currentSec && (currentSec.points.length > 0 || currentSec.title)) {
      result.push(currentSec);
    }
  }

  return result.length > 0 ? result : DEFAULT_PHARMACY_BYLAWS_SECTIONS;
}

/**
 * تحليل نصوص اللائحة بذكاء ومرونة إلى أقسام وبنود مرتبة
 */
export function parseBylawsIntoSections(text) {
  if (!text || typeof text !== 'string') {
    return DEFAULT_PHARMACY_BYLAWS_SECTIONS;
  }

  const clean = text.replace(/[\u200E\u200F\u200B\uFEFF\u00A0]/g, ' ').trim();
  if (!clean) return DEFAULT_PHARMACY_BYLAWS_SECTIONS;

  const lines = clean.split('\n');
  const rawSections = [];
  let currentSection = null;
  let sectionCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // تجاهل الفواصل والأسطر الفارغة
    if (!trimmed || /^[\-\_\=\*\.]{3,}$/.test(trimmed) || trimmed.startsWith('===') || trimmed.startsWith('---') || trimmed.startsWith('___')) {
      continue;
    }

    if (isBylawsHeaderLine(trimmed)) {
      if (currentSection) {
        rawSections.push(currentSection);
      }
      const isPreamble = trimmed.includes('مقدمة') || trimmed.includes('تمهيد') || trimmed.includes('اللائحة التنظيمية');
      currentSection = {
        id: isPreamble ? 'bylaw_preamble' : `bylaw_${sectionCounter++}`,
        title: trimmed,
        category: isPreamble ? 'preamble' : 'general',
        points: []
      };
    } else {
      // إزالة علامات الترقيم في بداية النقطة إن وجدت للحصول على نص نظيف مع الاحتفاظ بالرموز التعبيرية
      let cleanPoint = trimmed;
      if (cleanPoint.startsWith('- ') || cleanPoint.startsWith('* ') || cleanPoint.startsWith('▪ ') || cleanPoint.startsWith('• ') || cleanPoint.startsWith('▫ ')) {
        cleanPoint = cleanPoint.slice(2).trim();
      }

      if (currentSection) {
        currentSection.points.push(cleanPoint);
      } else {
        // إذا كان السطر في البداية قبل أي عنوان (تمهيد عام)
        currentSection = {
          id: 'bylaw_preamble',
          title: '📜 مقدمة وتمهيد اللائحة الرسمية',
          category: 'preamble',
          points: [cleanPoint]
        };
      }
    }
  }

  if (currentSection && (currentSection.points.length > 0 || currentSection.title)) {
    rawSections.push(currentSection);
  }

  return sanitizeBylawsSections(rawSections);
}

/**
 * استخراج مصفوفة البنود المنظمة من حالة النظام مع التوافق التراجعي والتطهير التلقائي
 */
export function getBylawsSectionsFromState(state = {}) {
  if (state && Array.isArray(state.bylawsSections) && state.bylawsSections.length > 0) {
    return sanitizeBylawsSections(state.bylawsSections);
  }

  if (state && state.bylawsText && typeof state.bylawsText === 'string' && state.bylawsText.trim().length > 0) {
    return parseBylawsIntoSections(state.bylawsText);
  }

  return DEFAULT_PHARMACY_BYLAWS_SECTIONS;
}
