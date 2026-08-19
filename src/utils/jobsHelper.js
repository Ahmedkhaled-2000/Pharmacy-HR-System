export const DEFAULT_JOBS = [
  { id: 'job_1', title: 'صيدلي أول', isManagement: true, description: 'إشراف ومتابعة الفرع وإدارة الكادر الطبي' },
  { id: 'job_2', title: 'مدير فرع', isManagement: true, description: 'إدارة العمليات اليومية للفرع والمبيعات' },
  { id: 'job_3', title: 'مدير إداري', isManagement: true, description: 'إدارة شؤون العاملين والمتابعة الإدارية' },
  { id: 'job_4', title: 'صيدلي', isManagement: false, description: 'صرف الأدوية وتقديم المشورة الطبية' },
  { id: 'job_5', title: 'مساعد صيدلي', isManagement: false, description: 'مساعدة الصيدلي وترتيب الأدوية والرفوف' },
  { id: 'job_6', title: 'كاشير', isManagement: false, description: 'تحصيل الإيرادات وحسابات الصندوق' },
  { id: 'job_7', title: 'مدخل بيانات', isManagement: false, description: 'إدخال الفواتير وتحديث بيانات الأصناف' },
  { id: 'job_8', title: 'مسؤول مخزن', isManagement: false, description: 'جرد البضائع واستلام طلبيات الأدوية' },
  { id: 'job_9', title: 'خدمة توصيل (دليفري)', isManagement: false, description: 'توصيل الطلبات للعملاء' }
];

export function getJobsList(state) {
  if (state?.jobs && Array.isArray(state.jobs) && state.jobs.length > 0) {
    return state.jobs;
  }
  if (state?.orgSettings?.jobs && Array.isArray(state.orgSettings.jobs) && state.orgSettings.jobs.length > 0) {
    return state.orgSettings.jobs;
  }
  return DEFAULT_JOBS;
}

export function isManagementJob(jobTitle, jobsList = DEFAULT_JOBS) {
  if (!jobTitle) return false;
  const cleanTitle = String(jobTitle).trim();
  const matched = (jobsList || []).find(
    (j) => j.title?.trim() === cleanTitle || j.name?.trim() === cleanTitle || j.id === cleanTitle
  );
  if (matched) return Boolean(matched.isManagement || matched.isAdminRole);
  
  // Fallback heuristics for common management titles
  const lower = cleanTitle.toLowerCase();
  return (
    lower.includes('مدير') ||
    lower.includes('إداري') ||
    lower.includes('مسؤول') ||
    lower.includes('أول') ||
    lower.includes('مشرف') ||
    lower.includes('hr')
  );
}
