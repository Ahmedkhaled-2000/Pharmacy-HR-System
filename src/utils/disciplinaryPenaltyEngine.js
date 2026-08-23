/**
 * disciplinaryPenaltyEngine.js
 * محرك لائحة الجزاءات التأديبية ونظام عداد تكرار المخالفات المستقل
 * 
 * المبادئ الأساسية:
 * 1. عداد مستقل تمامًا لكل نوع/فئة مخالفة لكل موظف.
 * 2. استبعاد مخالفات الحضور والانصراف والتأخير (تدار عبر محرك التأخير المستقل).
 * 3. تطبيق فوري لقرارات الإدارة العليا، وتطبيق معلق لقرارات مدير الفرع لحين اعتماد الإدارة العليا.
 * 4. احتساب الخصم المالي وفق معادلة أجر اليوم المعتمدة في النظام.
 * 5. دعم فترة تصفير العداد (Reset Period) من تاريخ آخر مخالفة لنفس النوع.
 * 6. الاحتفاظ بالسجل التاريخي ثابتاً وموثقاً في سجل التدقيق (Audit Log) ودعم الإلغاء المسبب.
 */

// ── الفئات القياسية المعتمدة للمخالفات التأديبية ──
export const DEFAULT_DISCIPLINARY_CATEGORIES = [
  {
    id: 'cat_admin_simple',
    code: 'A',
    name: 'الفئة A — المخالفات الإدارية البسيطة',
    description: 'عدم ترتيب مكان العمل، عدم تنظيم الملفات، ترك مكان العمل مؤقتاً دون إخطار المسؤول دون غياب.',
    color: '#0284c7', // أزرق سماوي
    resetMonths: 12,
    rules: [
      { id: 'rule_a_1', title: 'عدم ترتيب وتنظيم مكان العمل أو الملفات', categoryId: 'cat_admin_simple' },
      { id: 'rule_a_2', title: 'عدم الالتزام بالإجراءات الإدارية البسيطة', categoryId: 'cat_admin_simple' },
      { id: 'rule_a_3', title: 'ترك مكان العمل دون إخطار المسؤول (لا يشكل غياباً)', categoryId: 'cat_admin_simple' },
      { id: 'rule_a_4', title: 'عدم تنفيذ تعليمات تنظيمية غير جوهرية', categoryId: 'cat_admin_simple' }
    ],
    escalation: [
      { occurrence: 1, action: 'تنبيه موثق', type: 'alert', deductionDays: 0, note: 'تنبيه إداري موثق في السجل' },
      { occurrence: 2, action: 'إنذار كتابي', type: 'warning', deductionDays: 0, note: 'إنذار كتابي أول' },
      { occurrence: 3, action: 'إنذار نهائي', type: 'final_warning', deductionDays: 0, note: 'إنذار كتابي نهائي' },
      { occurrence: 4, action: 'خصم يوم من الأجر الأساسي', type: 'deduction', deductionDays: 1.0, note: 'خصم أجر يوم كامل' },
      { occurrence: 5, action: 'خصم يومين من الأجر الأساسي', type: 'deduction', deductionDays: 2.0, note: 'خصم أجر يومين' },
      { occurrence: 6, action: 'إحالة للتحقيق واتخاذ الإجراء المناسب', type: 'investigation', deductionDays: 0, note: 'إحالة للشئون الإدارية/التحقيق', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_instructions',
    code: 'B',
    name: 'الفئة B — عدم الالتزام بالتعليمات والتشغيل',
    description: 'عدم تنفيذ تعليمات المسؤول المباشر، تجاهل إجراءات العمل المعتمدة، تكرار مخالفة التعليمات.',
    color: '#8b5cf6', // بنفسجي
    resetMonths: 12,
    rules: [
      { id: 'rule_b_1', title: 'عدم تنفيذ تعليمات المسؤول المباشر', categoryId: 'cat_instructions' },
      { id: 'rule_b_2', title: 'تجاهل إجراءات العمل والتشغيل المعتمدة بالصيدلية', categoryId: 'cat_instructions' },
      { id: 'rule_b_3', title: 'تكرار مخالفة تعليمات إدارية بعد التنبيه', categoryId: 'cat_instructions' }
    ],
    escalation: [
      { occurrence: 1, action: 'تنبيه موثق', type: 'alert', deductionDays: 0, note: 'تنبيه موثق' },
      { occurrence: 2, action: 'إنذار كتابي', type: 'warning', deductionDays: 0, note: 'إنذار كتابي' },
      { occurrence: 3, action: 'خصم يوم من الأجر الأساسي', type: 'deduction', deductionDays: 1.0, note: 'خصم يوم' },
      { occurrence: 4, action: 'خصم يومين من الأجر الأساسي', type: 'deduction', deductionDays: 2.0, note: 'خصم يومين' },
      { occurrence: 5, action: 'خصم ثلاثة أيام من الأجر الأساسي', type: 'deduction', deductionDays: 3.0, note: 'خصم 3 أيام' },
      { occurrence: 6, action: 'إحالة للتحقيق واتخاذ الإجراء المناسب', type: 'investigation', deductionDays: 0, note: 'إحالة للتحقيق', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_phone_devices',
    code: 'C',
    name: 'الفئة C — استخدام الهاتف والأجهزة الشخصية بشكل غير مصرح',
    description: 'الانشغال بالهاتف أو الأجهزة الشخصية أثناء أوقات العمل في غير الأغراض المهنية المصرح بها.',
    color: '#ec4899', // وردي
    resetMonths: 12,
    rules: [
      { id: 'rule_c_1', title: 'استخدام الهاتف الشخصي أثناء العمل بشكل غير مصرح', categoryId: 'cat_phone_devices' },
      { id: 'rule_c_2', title: 'الانشغال بالأجهزة الإلكترونية وتعطيل خدمة العملاء', categoryId: 'cat_phone_devices' }
    ],
    escalation: [
      { occurrence: 1, action: 'تنبيه موثق', type: 'alert', deductionDays: 0, note: 'تنبيه موثق' },
      { occurrence: 2, action: 'إنذار كتابي', type: 'warning', deductionDays: 0, note: 'إنذار كتابي' },
      { occurrence: 3, action: 'إنذار نهائي', type: 'final_warning', deductionDays: 0, note: 'إنذار نهائي' },
      { occurrence: 4, action: 'خصم يوم من الأجر الأساسي', type: 'deduction', deductionDays: 1.0, note: 'خصم يوم' },
      { occurrence: 5, action: 'خصم يومين من الأجر الأساسي', type: 'deduction', deductionDays: 2.0, note: 'خصم يومين' },
      { occurrence: 6, action: 'إحالة للتحقيق واتخاذ الإجراء المناسب', type: 'investigation', deductionDays: 0, note: 'إحالة للتحقيق', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_negligence',
    code: 'D',
    name: 'الفئة D — الإهمال والتقصير في أداء العمل',
    description: 'عدم تنفيذ المهام المكلف بها، إهمال المتابعة، تكرار الأخطاء الإجرائية، عدم المحافظة على الأدوات.',
    color: '#f59e0b', // برتقالي
    resetMonths: 12,
    rules: [
      { id: 'rule_d_1', title: 'عدم تنفيذ المهمة المكلف بها دون مبرر مقبول', categoryId: 'cat_negligence' },
      { id: 'rule_d_2', title: 'إهمال متابعة المهام الوظيفية والمسؤوليات', categoryId: 'cat_negligence' },
      { id: 'rule_d_3', title: 'تكرار الأخطاء الناتجة عن عدم اتباع إجراءات العمل', categoryId: 'cat_negligence' },
      { id: 'rule_d_4', title: 'عدم المحافظة على الأدوات أو المستندات المسلمة للموظف', categoryId: 'cat_negligence' }
    ],
    escalation: [
      { occurrence: 1, action: 'تنبيه + توجيه وتصحيح', type: 'alert', deductionDays: 0, note: 'تنبيه وتوجيه مهني' },
      { occurrence: 2, action: 'إنذار كتابي', type: 'warning', deductionDays: 0, note: 'إنذار كتابي' },
      { occurrence: 3, action: 'إنذار نهائي', type: 'final_warning', deductionDays: 0, note: 'إنذار نهائي' },
      { occurrence: 4, action: 'خصم يوم من الأجر الأساسي', type: 'deduction', deductionDays: 1.0, note: 'خصم يوم' },
      { occurrence: 5, action: 'خصم يومين من الأجر الأساسي', type: 'deduction', deductionDays: 2.0, note: 'خصم يومين' },
      { occurrence: 6, action: 'خصم ثلاثة أيام من الأجر الأساسي', type: 'deduction', deductionDays: 3.0, note: 'خصم 3 أيام' },
      { occurrence: 7, action: 'إحالة للتحقيق والمساءلة', type: 'investigation', deductionDays: 0, note: 'إحالة للتحقيق', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_safety_security',
    code: 'E',
    name: 'الفئة E — مخالفة تعليمات السلامة والأمن والصحة المهنية',
    description: 'عدم الالتزام بتعليمات السلامة، عدم استخدام وسائل الوقاية، تعريض المكان أو الأشخاص للخطر.',
    color: '#ea580c', // أحمر برتقالي
    resetMonths: 12,
    rules: [
      { id: 'rule_e_1', title: 'عدم الالتزام بتعليمات السلامة والصحة المهنية', categoryId: 'cat_safety_security' },
      { id: 'rule_e_2', title: 'عدم استخدام وسائل الوقاية المطلوبة داخل الصيدلية', categoryId: 'cat_safety_security' },
      { id: 'rule_e_3', title: 'مخالفة إجراءات الأمن الداخلي والحفاظ على المنشأة', categoryId: 'cat_safety_security' },
      { id: 'rule_e_4', title: 'تعريض الزملاء أو العملاء أو الممتلكات للخطر', categoryId: 'cat_safety_security' }
    ],
    escalation: [
      { occurrence: 1, action: 'إنذار كتابي + توعية', type: 'warning', deductionDays: 0, note: 'إنذار كتابي وتوعية بالسلامة' },
      { occurrence: 2, action: 'إنذار نهائي', type: 'final_warning', deductionDays: 0, note: 'إنذار نهائي' },
      { occurrence: 3, action: 'خصم يوم من الأجر الأساسي', type: 'deduction', deductionDays: 1.0, note: 'خصم يوم' },
      { occurrence: 4, action: 'خصم يومين من الأجر الأساسي', type: 'deduction', deductionDays: 2.0, note: 'خصم يومين' },
      { occurrence: 5, action: 'خصم ثلاثة أيام من الأجر الأساسي', type: 'deduction', deductionDays: 3.0, note: 'خصم 3 أيام' },
      { occurrence: 6, action: 'إحالة فورية للتحقيق واتخاذ الإجراء اللازم', type: 'investigation', deductionDays: 0, note: 'إحالة للتحقيق', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_unprofessional_behavior',
    code: 'F',
    name: 'الفئة F — السلوك غير المهني وبيئة العمل',
    description: 'التعامل غير اللائق مع الزملاء، رفع الصوت، افتعال المشكلات، عدم احترام التسلسل الإداري.',
    color: '#6366f1', // نيلي
    resetMonths: 12,
    rules: [
      { id: 'rule_f_1', title: 'التعامل غير اللائق أو المشادات مع الزملاء', categoryId: 'cat_unprofessional_behavior' },
      { id: 'rule_f_2', title: 'رفع الصوت أو استخدام ألفاظ غير مهنية', categoryId: 'cat_unprofessional_behavior' },
      { id: 'rule_f_3', title: 'افتعال المشكلات داخل بيئة العمل أو إثارة النزاعات', categoryId: 'cat_unprofessional_behavior' },
      { id: 'rule_f_4', title: 'عدم احترام التسلسل الإداري وقواعد العمل المشترك', categoryId: 'cat_unprofessional_behavior' }
    ],
    escalation: [
      { occurrence: 1, action: 'تنبيه موثق', type: 'alert', deductionDays: 0, note: 'تنبيه موثق' },
      { occurrence: 2, action: 'إنذار كتابي', type: 'warning', deductionDays: 0, note: 'إنذار كتابي' },
      { occurrence: 3, action: 'إنذار نهائي', type: 'final_warning', deductionDays: 0, note: 'إنذار نهائي' },
      { occurrence: 4, action: 'خصم يوم من الأجر الأساسي', type: 'deduction', deductionDays: 1.0, note: 'خصم يوم' },
      { occurrence: 5, action: 'خصم يومين من الأجر الأساسي', type: 'deduction', deductionDays: 2.0, note: 'خصم يومين' },
      { occurrence: 6, action: 'إحالة للتحقيق واتخاذ الإجراء التأديبي', type: 'investigation', deductionDays: 0, note: 'إحالة للتحقيق', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_customer_service',
    code: 'G',
    name: 'الفئة G — مخالفة معايير خدمة العملاء والمرضى',
    description: 'سوء التعامل مع العميل، تجاهل طلب المريض، تقديم معلومات غير دقيقة، الإضرار بصورة المنشأة.',
    color: '#0d9488', // تركواز
    resetMonths: 12,
    rules: [
      { id: 'rule_g_1', title: 'سوء التعامل مع العميل أو مريض الصيدلية', categoryId: 'cat_customer_service' },
      { id: 'rule_g_2', title: 'عدم الالتزام ببروتوكول وأسلوب خدمة العملاء', categoryId: 'cat_customer_service' },
      { id: 'rule_g_3', title: 'تجاهل طلب العميل أو تركه دون سبب مبرر', categoryId: 'cat_customer_service' },
      { id: 'rule_g_4', title: 'تقديم معلومات غير دقيقة بسبب الإهمال أو التسرع', categoryId: 'cat_customer_service' }
    ],
    escalation: [
      { occurrence: 1, action: 'تنبيه + توجيه وتدريب', type: 'alert', deductionDays: 0, note: 'تنبيه وتدريب' },
      { occurrence: 2, action: 'إنذار كتابي', type: 'warning', deductionDays: 0, note: 'إنذار كتابي' },
      { occurrence: 3, action: 'إنذار نهائي', type: 'final_warning', deductionDays: 0, note: 'إنذار نهائي' },
      { occurrence: 4, action: 'خصم يوم من الأجر الأساسي', type: 'deduction', deductionDays: 1.0, note: 'خصم يوم' },
      { occurrence: 5, action: 'خصم يومين من الأجر الأساسي', type: 'deduction', deductionDays: 2.0, note: 'خصم يومين' },
      { occurrence: 6, action: 'إحالة للتحقيق واتخاذ الإجراء المناسب', type: 'investigation', deductionDays: 0, note: 'إحالة للتحقيق', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_confidentiality',
    code: 'H',
    name: 'الفئة H — إفشاء المعلومات وسرية العمل',
    description: 'إفشاء معلومات داخلية، مشاركة بيانات العملاء أو الموظفين، تصوير مستندات، مشاركة كلمات المرور.',
    color: '#7c3aed', // بنفسجي داكن
    resetMonths: 12,
    rules: [
      { id: 'rule_h_1', title: 'إفشاء معلومات داخلية عن العمل دون تصريح', categoryId: 'cat_confidentiality' },
      { id: 'rule_h_2', title: 'مشاركة بيانات الموظفين أو المرضى أو العملاء دون صلاحية', categoryId: 'cat_confidentiality' },
      { id: 'rule_h_3', title: 'تصوير أو نسخ مستندات أو سجلات الصيدلية دون إذن', categoryId: 'cat_confidentiality' },
      { id: 'rule_h_4', title: 'مشاركة كلمات المرور أو حسابات النظام مع الغير', categoryId: 'cat_confidentiality' }
    ],
    escalation: [
      { occurrence: 1, action: 'إنذار كتابي + تحقيق إداري', type: 'warning', deductionDays: 0, note: 'إنذار وتحقيق' },
      { occurrence: 2, action: 'خصم يومين + إحالة للتحقيق', type: 'deduction', deductionDays: 2.0, note: 'خصم وتحقيق' },
      { occurrence: 3, action: 'خصم 3 أيام + تحقيق موسع', type: 'deduction', deductionDays: 3.0, note: 'خصم وتحقيق' },
      { occurrence: 4, action: 'إحالة فورية للتحقيق واتخاذ الإجراء القانوني', type: 'investigation', deductionDays: 0, note: 'إجراء قانوني حاسم', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_financial_custody',
    code: 'I',
    name: 'الفئة I — المخالفات المالية والعهد والأمانات',
    description: 'عدم المحافظة على العهدة، التأخر في تسليم المستندات المالية، أخطاء مالية ناتجة عن إهمال.',
    color: '#b45309', // بني ذهبي
    resetMonths: 12,
    rules: [
      { id: 'rule_i_1', title: 'عدم المحافظة على العهدة المسلمة للموظف', categoryId: 'cat_financial_custody' },
      { id: 'rule_i_2', title: 'التأخر في تسليم الفواتير أو المستندات المالية في الموعد', categoryId: 'cat_financial_custody' },
      { id: 'rule_i_3', title: 'أخطاء مالية أو محاسبية ناتجة عن الإهمال والتسرع', categoryId: 'cat_financial_custody' },
      { id: 'rule_i_4', title: 'عدم الالتزام بإجراءات استلام وتسليم النقدية والخزينة', categoryId: 'cat_financial_custody' }
    ],
    escalation: [
      { occurrence: 1, action: 'تنبيه موثق + تصحيح', type: 'alert', deductionDays: 0, note: 'تنبيه وتصحيح' },
      { occurrence: 2, action: 'إنذار كتابي', type: 'warning', deductionDays: 0, note: 'إنذار كتابي' },
      { occurrence: 3, action: 'إنذار نهائي + خصم يوم', type: 'deduction', deductionDays: 1.0, note: 'إنذار نهائي وخصم يوم' },
      { occurrence: 4, action: 'إحالة للتحقيق المالي وتحديد المسؤولية', type: 'investigation', deductionDays: 0, note: 'تحقيق مالي مستقل', isDefaultBeyond: true }
    ]
  },
  {
    id: 'cat_severe_gross',
    code: 'J',
    name: 'الفئة J — المخالفات الجسيمة والانتهاكات الكبرى',
    description: 'الاعتداء، التهديد، السرقة، التزوير، العبث بالسجلات، الإتلاف العمدي لممتلكات المنشأة (تحقيق فوري).',
    color: '#dc2626', // أحمر داكن
    resetMonths: 0, // لا تصفير
    rules: [
      { id: 'rule_j_1', title: 'الاعتداء البدني أو التهديد أو التحرش داخل العمل', categoryId: 'cat_severe_gross' },
      { id: 'rule_j_2', title: 'السرقة أو الاختلاس أو الاستيلاء على أموال أو أدوية', categoryId: 'cat_severe_gross' },
      { id: 'rule_j_3', title: 'التزوير في الفواتير أو المستندات أو العبث بسجلات البصمة والنظام', categoryId: 'cat_severe_gross' },
      { id: 'rule_j_4', title: 'تعمد إتلاف الأجهزة أو ممتلكات الصيدلية', categoryId: 'cat_severe_gross' },
      { id: 'rule_j_5', title: 'مخالفة جسيمة أدت إلى ضرر صحي أو مالي بالغ', categoryId: 'cat_severe_gross' }
    ],
    escalation: [
      { occurrence: 1, action: 'إحالة فورية للشئون القانونية والتحقيق الجنائي/التأديبي', type: 'investigation', deductionDays: 0, note: 'تحقيق قانوني فوري وإيقاف مؤقت إذا لزم' },
      { occurrence: 2, action: 'فصل تأديبي / اتخاذ الإجراءات القانونية الحاسمة', type: 'investigation', deductionDays: 0, note: 'إجراء قانوني حاسم', isDefaultBeyond: true }
    ]
  }
];

/**
 * حساب سعر اليوم الأساسي للموظف وفق معادلة النظام الحالية
 */
export function getEmployeeDailyRate(employee, branchId = null) {
  if (!employee) return 0;
  let targetBranchDetails = null;

  if (branchId && employee.branchesDetails && Array.isArray(employee.branchesDetails)) {
    targetBranchDetails = employee.branchesDetails.find((b) => String(b.branchId) === String(branchId));
  } else if (employee.branchesDetails && employee.branchesDetails.length > 0) {
    targetBranchDetails = employee.branchesDetails[0];
  }

  const salary = targetBranchDetails ? (parseFloat(targetBranchDetails.salary) || 0) : (parseFloat(employee.salary) || 0);
  const workHours = targetBranchDetails ? (parseFloat(targetBranchDetails.workHoursPerDay) || 8) : (parseFloat(employee.workHoursPerDay) || 8);
  const workDays = targetBranchDetails ? (parseFloat(targetBranchDetails.workDaysPerMonth) || 26) : (parseFloat(employee.workDaysPerMonth) || 26);

  // المعادلة المعتمدة في النظام:
  // سعر اليوم = (الراتب * ساعات العمل اليومية) / أيام العمل الشهرية (أو الراتب / أيام العمل إذا كان الراتب شهرياً)
  const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
  return Math.round(dailyRate * 100) / 100;
}

/**
 * حساب السجل السابق والعداد الجديد للموظف لنوع مخالفة معين
 * مع تطبيق قاعدة فترة تصفير العداد (Reset Period)
 */
export function calculateViolationCounter({
  employeeId,
  categoryId,
  ruleId = null,
  allRequests = [],
  disciplinaryPolicy = DEFAULT_DISCIPLINARY_CATEGORIES,
  resetPeriodMonths = 12
}) {
  if (!employeeId || !categoryId) {
    return {
      previousCount: 0,
      newCount: 1,
      lastViolationDate: null,
      isResetApplied: false,
      category: null,
      rule: null,
      matchedEscalation: null,
      suggestedAction: 'تنبيه موثق',
      deductionDays: 0,
      historyList: []
    };
  }

  const category = (disciplinaryPolicy || DEFAULT_DISCIPLINARY_CATEGORIES).find((c) => c.id === categoryId) || DEFAULT_DISCIPLINARY_CATEGORIES[0];
  const rule = ruleId ? (category.rules || []).find((r) => r.id === ruleId) : null;

  // استخراج كافة المخالفات السابقة المعتمدة لنفس الموظف ونفس الفئة
  const empCategoryHistory = (allRequests || []).filter((r) => {
    if (String(r.employeeId) !== String(employeeId)) return false;
    if (r.status === 'cancelled' || r.status === 'rejected' || r.isCancelled) return false;
    // التحقق من نفس الفئة أو الكود أو الاسم
    const isSameCategory =
      r.categoryId === categoryId ||
      r.categoryCode === category.code ||
      r.categoryName === category.name ||
      (categoryId === 'CAT_LATE' && (r.sourceType === 'late_incident' || r.subType === 'lateness')) ||
      (category.code === 'CAT_A' && (r.categoryId === 'CAT_A' || r.categoryCode === 'CAT_A'));
    return isSameCategory;
  });

  // الترتيب زمنيًا من الأقدم للأحدث
  empCategoryHistory.sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));

  const effectiveResetMonths = category.resetMonths !== undefined ? category.resetMonths : resetPeriodMonths;
  let activeHistory = [];
  let isResetApplied = false;

  if (effectiveResetMonths > 0 && empCategoryHistory.length > 0) {
    const now = new Date();
    const lastViolation = empCategoryHistory[empCategoryHistory.length - 1];
    const lastDate = new Date(lastViolation.createdAt || lastViolation.date || now);

    const diffMonths = (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());

    if (diffMonths >= effectiveResetMonths) {
      // مرّت فترة التصفير دون تكرار -> تصفير العداد والبدء من 1
      isResetApplied = true;
      activeHistory = [];
    } else {
      activeHistory = empCategoryHistory;
    }
  } else {
    activeHistory = empCategoryHistory;
  }

  const previousCount = activeHistory.length;
  const newCount = previousCount + 1;
  const lastViolationDate = empCategoryHistory.length > 0 ? (empCategoryHistory[empCategoryHistory.length - 1].date || empCategoryHistory[empCategoryHistory.length - 1].createdAt) : null;

  // استخراج درجة التصعيد المقابلة للعداد الجديد
  const escalations = category.escalation || [];
  let matchedEscalation = escalations.find((e) => e.occurrence === newCount);

  if (!matchedEscalation) {
    // إذا تجاوز السلم، نأخذ آخر مستوى محدد أو الافتراضي لما بعد ذلك
    matchedEscalation = escalations.find((e) => e.isDefaultBeyond) || escalations[escalations.length - 1] || {
      occurrence: newCount,
      action: 'إحالة للتحقيق واتخاذ الإجراء المناسب',
      type: 'investigation',
      deductionDays: 0,
      note: 'تجاوز سلم التكرار المعتاد'
    };
  }

  return {
    previousCount,
    newCount,
    lastViolationDate,
    isResetApplied,
    category,
    rule,
    matchedEscalation,
    suggestedAction: matchedEscalation.action,
    deductionDays: matchedEscalation.deductionDays || 0,
    historyList: empCategoryHistory
  };
}

/**
 * حساب ملخص العدادات لجميع الفئات لموظف معين
 */
export function getEmployeeDisciplinarySummary(employeeId, allRequests = [], disciplinaryPolicy = DEFAULT_DISCIPLINARY_CATEGORIES) {
  const policy = disciplinaryPolicy || DEFAULT_DISCIPLINARY_CATEGORIES;
  const summary = {};

  policy.forEach((cat) => {
    const counterInfo = calculateViolationCounter({
      employeeId,
      categoryId: cat.id,
      allRequests,
      disciplinaryPolicy: policy
    });

    summary[cat.id] = {
      categoryId: cat.id,
      categoryCode: cat.code,
      categoryName: cat.name,
      color: cat.color,
      activeCount: counterInfo.previousCount,
      lastViolationDate: counterInfo.lastViolationDate,
      nextEscalationAction: counterInfo.suggestedAction,
      totalRecorded: counterInfo.historyList.length
    };
  });

  return summary;
}
