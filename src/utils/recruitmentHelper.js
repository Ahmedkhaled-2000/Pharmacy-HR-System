/**
 * recruitmentHelper.js
 * محرك ودوال إدارة التعيينات، الشواغر، المقابلات الشخصية، والتحويل إلى ملف موظف
 */

import { DEFAULT_JOBS, DEFAULT_DEPARTMENTS } from './jobsHelper';

export const APPLICATION_STATUSES = {
  new: {
    id: 'new',
    label: 'طلب جديد',
    icon: '📥',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  interview_scheduled: {
    id: 'interview_scheduled',
    label: 'مقابلة مجدولة',
    icon: '📅',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: 'rgba(139, 92, 246, 0.3)'
  },
  interviewed: {
    id: 'interviewed',
    label: 'تمت المقابلة',
    icon: '📋',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  hired: {
    id: 'hired',
    label: 'تم القبول والتعيين',
    icon: '✅',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  waiting_list: {
    id: 'waiting_list',
    label: 'قائمة الانتظار',
    icon: '⏳',
    color: '#eab308',
    bgColor: 'rgba(234, 179, 8, 0.12)',
    borderColor: 'rgba(234, 179, 8, 0.3)'
  },
  rejected: {
    id: 'rejected',
    label: 'مرفوض',
    icon: '❌',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)'
  }
};

export const DEFAULT_VACANCIES = [
  {
    id: 'vac_pharmacist',
    jobTitle: 'صيدلي',
    department: 'الصيدلية',
    openingsCount: 2,
    qualificationRequired: 'بكالوريوس صيدلة (حاصل على ترخيص مزاولة المهنة)',
    minExperienceYears: 1,
    description: 'صرف الأدوية وتقديم المشورة الدوائية للمرضى والعملاء والالتزام بمعايير الجودة الصيدلية.',
    requirements: [
      'بكالوريوس صيدلة مع كارنيه النقابة وترخيص مزاولة المهنة',
      'إجادة استخدام برامج الصيدليات ونقاط البيع',
      'مهارات تواصل واستماع ممتازة مع العملاء',
      'القدرة على العمل بنظام الشفتات والورديات'
    ],
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'vac_assistant_pharmacist',
    jobTitle: 'مساعد صيدلي',
    department: 'الصيدلية',
    openingsCount: 3,
    qualificationRequired: 'مؤهل مناسب مع خبرة في مجال الصيدليات',
    minExperienceYears: 1,
    description: 'مساعدة الصيدلي في ترتيب الأرفف، تجهيز الطلبيات، وخدمة العملاء.',
    requirements: [
      'خبرة عملية لا تقل عن سنة في الصيدليات',
      'معرفة جيدة بمواقع الأدوية ومجموعاتها',
      'اللباقة والنشاط وحسن المظهر'
    ],
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'vac_cashier',
    jobTitle: 'كاشير',
    department: 'الحسابات والمالية',
    openingsCount: 1,
    qualificationRequired: 'مؤهل تجاري أو عالي مناسب',
    minExperienceYears: 0,
    description: 'استلام النقدية وإصدار الفواتير وتسوية حسابات الصندوق اليومية.',
    requirements: [
      'الدقة العالية في التعاملات المالية وحسابات الصندوق',
      'إجادة العمل على الكاشير وبرامج POS',
      'السرعة والتركيز والأمانة'
    ],
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'vac_delivery',
    jobTitle: 'خدمة توصيل (دليفري)',
    department: 'خدمة التوصيل (الدليفري)',
    openingsCount: 2,
    qualificationRequired: 'رخصة قيادة سارية ومؤهل مناسب',
    minExperienceYears: 0,
    description: 'توصيل الطلبات للعملاء في أسرع وقت مع الحفاظ على سلامة المنتجات.',
    requirements: [
      'امتلاك وسيلة تنقل مناسبة ورخصة قيادة سارية',
      'معرفة تامة بالمناطق والمربعات السكنية المحيطة بالفروع',
      'الأمانة والالتزام بالمواعيد'
    ],
    isActive: true,
    createdAt: new Date().toISOString()
  }
];

/**
 * توليد كود طلب تقديم فريد وقابل للقراءة
 */
export function generateApplicationCode() {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `APP-${yearMonth}-${randomSuffix}`;
}

/**
 * حساب النسبة المئوية والتقدير لتقييم المقابلة
 */
export function calculateEvaluationScore(evaluation) {
  if (!evaluation) return null;
  
  const tech = parseFloat(evaluation.technicalSkills) || 0; // out of 5
  const soft = parseFloat(evaluation.softSkills) || 0; // out of 5
  const lang = parseFloat(evaluation.languageTech) || 0; // out of 5
  const fit = parseFloat(evaluation.cultureFit) || 0; // out of 5

  const totalPoints = tech + soft + lang + fit; // out of 20
  const percentage = Math.round((totalPoints / 20) * 100);

  let ratingLabel = 'غير محدد';
  let badgeColor = '#64748b';

  if (percentage >= 90) {
    ratingLabel = 'ممتاز (مرشح مثالي)';
    badgeColor = '#10b981';
  } else if (percentage >= 80) {
    ratingLabel = 'جيد جداً (يوصى بقبوله)';
    badgeColor = '#3b82f6';
  } else if (percentage >= 65) {
    ratingLabel = 'جيد (مقبول)';
    badgeColor = '#f59e0b';
  } else if (percentage >= 50) {
    ratingLabel = 'مقبول (يحتاج تدريب)';
    badgeColor = '#eab308';
  } else {
    ratingLabel = 'ضعيف (غير مناسب)';
    badgeColor = '#ef4444';
  }

  return {
    totalPoints,
    percentage,
    ratingLabel,
    badgeColor
  };
}

/**
 * تحويل طلب المرشح المقبول إلى مسودة موظف جديد لفتح نافذة EmployeeFileModal
 */
export function convertApplicantToEmployeeDraft(applicant, state = {}) {
  if (!applicant) return null;

  const branches = state.branches || [];
  const defaultBranchId = applicant.preferredBranchId || (branches[0]?.id || '');

  // Prepare phones array
  let phones = [];
  if (Array.isArray(applicant.phones) && applicant.phones.length > 0) {
    phones = applicant.phones.map((p, idx) => ({
      id: p.id || `phone_${idx}_${Date.now()}`,
      number: String(p.number || p).replace(/\D/g, ''),
      type: p.type || 'mobile'
    }));
  } else if (applicant.phone) {
    phones = [
      {
        id: 'phone_1',
        number: String(applicant.phone).replace(/\D/g, ''),
        type: 'mobile'
      }
    ];
    if (applicant.relativePhone || applicant.emergencyPhone) {
      phones.push({
        id: 'phone_2',
        number: String(applicant.relativePhone || applicant.emergencyPhone).replace(/\D/g, ''),
        type: 'relative'
      });
    }
  }

  // Documents mapping
  const documents = [];
  if (applicant.cvUrl) {
    documents.push({
      id: `doc_cv_${Date.now()}`,
      title: 'السيرة الذاتية (CV)',
      fileUrl: applicant.cvUrl,
      fileType: 'pdf',
      uploadedAt: new Date().toISOString()
    });
  }
  if (applicant.nationalIdPhotoUrl) {
    documents.push({
      id: `doc_nid_${Date.now()}`,
      title: 'بطاقة الرقم القومي',
      fileUrl: applicant.nationalIdPhotoUrl,
      fileType: 'image',
      uploadedAt: new Date().toISOString()
    });
  }
  if (applicant.graduationCertUrl) {
    documents.push({
      id: `doc_grad_${Date.now()}`,
      title: 'شهادة التخرج / المؤهل',
      fileUrl: applicant.graduationCertUrl,
      fileType: 'image',
      uploadedAt: new Date().toISOString()
    });
  }
  if (applicant.licensePhotoUrl) {
    documents.push({
      id: `doc_lic_${Date.now()}`,
      title: 'ترخيص مزاولة المهنة / رخصة القيادة',
      fileUrl: applicant.licensePhotoUrl,
      fileType: 'image',
      uploadedAt: new Date().toISOString()
    });
  }
  if (Array.isArray(applicant.documents)) {
    applicant.documents.forEach(doc => {
      if (doc && doc.fileUrl && !documents.some(d => d.fileUrl === doc.fileUrl)) {
        documents.push(doc);
      }
    });
  }

  return {
    isFromRecruitment: true,
    recruitmentApplicationId: applicant.id,
    recruitmentApplicationCode: applicant.code,
    
    name: applicant.name || '',
    nickname: applicant.nickname || '',
    phone: applicant.phone ? String(applicant.phone).replace(/\D/g, '') : '',
    phones: phones.length > 0 ? phones : [{ id: '1', number: '', type: 'mobile' }],
    email: applicant.email || '',
    relativePhone: String(applicant.relativePhone || applicant.emergencyPhone || '').replace(/\D/g, ''),
    nationalId: String(applicant.nationalId || '').replace(/\D/g, ''),
    dob: applicant.dob || '',
    address: applicant.address || '',
    photoUrl: applicant.photoUrl || '',
    maritalStatus: applicant.maritalStatus || 'أعزب',

    jobTitle: applicant.targetJobTitle || applicant.jobTitle || 'صيدلي',
    department: applicant.department || 'الصيدلية',
    
    // Financial and Branch defaults
    branchId: defaultBranchId,
    branchesDetails: [
      {
        id: Date.now().toString(),
        branchId: defaultBranchId,
        salary: applicant.agreedSalary || applicant.expectedSalary || '',
        workHours: '8',
        workDays: '26',
        breakHours: '1'
      }
    ],

    hireDate: applicant.availableStartDate || new Date().toISOString().slice(0, 10),
    contractType: applicant.contractTypePreference || 'دوام كامل',
    status: 'على رأس العمل',
    password: '123',
    annualLeaveBalance: '21',
    documents: documents,
    
    qualification: applicant.qualification || '',
    graduationYear: applicant.graduationYear || '',
    university: applicant.university || '',
    experienceYears: applicant.experienceYears || '',
    previousExperience: applicant.previousExperience || '',
    skills: applicant.skills || '',
    notes: applicant.notes || (applicant.interviewEvaluation ? `ملاحظات المقابلة: ${applicant.interviewEvaluation.notes || ''}` : '')
  };
}
