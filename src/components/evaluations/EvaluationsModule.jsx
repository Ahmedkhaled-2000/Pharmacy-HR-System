import React, { useState, useEffect, useMemo } from 'react';
import { getEmpDisplayName, isEmployeeActive, fmt, arabicWeekday } from '../../utils/formatters';
import { getActivePayrollMonth } from '../../utils/periodEngine';
import { getRealTodayStr } from '../../utils/timeEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Default Standard Criteria Templates per Job Title (المعايير القياسية للوظائف)
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_JOB_EVALUATION_CRITERIA = {
  'صيدلي': [
    { id: '1', title: 'الالتزام بمواعيد الحضور والانصراف والزي الرسمي والجاهزية', maxScore: 20, description: 'الانضباط التام بالورديات والجاهزية ومظهر الصيدلي اللائق' },
    { id: '2', title: 'الدقة في صرف الأدوية وتجنب أخطاء الروشتات ومراجعة الجرعات', maxScore: 25, description: 'مراجعة التداخلات الدوائية والجرعات وسلامة الصرف للمريض' },
    { id: '3', title: 'خدمة العملاء واللباقة وتقديم المشورة والوعي الدوائي', maxScore: 25, description: 'شرح طريقة استخدام العلاج للجمهور وحسن الاستقبال وحل المشكلات' },
    { id: '4', title: 'حفظ وترتيب الأدوية ومتابعة تواريخ الصلاحية والنواقص', maxScore: 15, description: 'المتابعة اليومية للنواقص وتسجيل الأصناف قريبة الانتهاء' },
    { id: '5', title: 'التعاون مع فريق العمل والالتزام باللوائح والتعليمات', maxScore: 15, description: 'التنسيق مع الزملاء ومساعدي الصيدلي والالتزام باللوائح' }
  ],
  'مساعد صيدلي': [
    { id: '1', title: 'الالتزام بمواعيد الحضور والانصراف والانضباط العام', maxScore: 20, description: 'الالتزام بجدول الشيفتات واللوائح الداخلية للفرع' },
    { id: '2', title: 'سرعة ودقة تجهيز الأصناف وإحضارها من الأرفف', maxScore: 25, description: 'معرفة أماكن الأدوية وتجهيز الروشتات ومساعدة الصيدلي' },
    { id: '3', title: 'حسن التعامل مع العملاء ولباقة الاستقبال بالصيدلية', maxScore: 20, description: 'الترحيب بالعميل والسرعة في تلبية متطلباته بلباقة' },
    { id: '4', title: 'رص الأرفف والنظافة والمحافظة على مظهر الفرع', maxScore: 20, description: 'ترتيب وتنسيق واجهات العرض ونظافة الصيدلية' },
    { id: '5', title: 'الأمانة والتعاون وروح الفريق الإيجابية بالفرع', maxScore: 15, description: 'مساعدة الزملاء والمحافظة على عهدة وممتلكات الصيدلية' }
  ],
  'كاشير': [
    { id: '1', title: 'الالتزام بمواعيد الحضور والانضباط بنقطة البيع (الكاشير)', maxScore: 20, description: 'التواجد المستمر في نقطة البيع وعدم ترك الكاشير دون بديل' },
    { id: '2', title: 'الدقة في الحسابات وتقفيل الشفت ومطابقة الخزينة', maxScore: 30, description: 'تجنب العجز أو الزيادة والدقة في تحصيل النقود والمدفوعات' },
    { id: '3', title: 'سرعة إنجاز فواتير العملاء واللباقة التامة والترحيب', maxScore: 25, description: 'تخفيف طوابير الانتظار والتعامل المهذب مع الجمهور' },
    { id: '4', title: 'المحافظة على نظافة وترتيب منطقة الكاشير والعهد', maxScore: 15, description: 'تنظيم الفواتير والأدوات والأوراق النقدية' },
    { id: '5', title: 'التعاون مع طاقم العمل والالتزام بالسياسات المالية', maxScore: 10, description: 'الالتزام بسياسات المرتجعات والخصومات واللوائح' }
  ],
  'مسؤول توصيل': [
    { id: '1', title: 'الالتزام بالحضور والمواعيد والجاهزية المستمرة للطلبات', maxScore: 20, description: 'التواجد في الفرع والاستعداد الدائم لاستلام وتوصيل الأوردرات' },
    { id: '2', title: 'سرعة وأمان توصيل الطلبات للعملاء والمحافظة على العلاج', maxScore: 30, description: 'توصيل العلاج في الوقت المحدد بحالة ممتازة دون تلف' },
    { id: '3', title: 'اللباقة وحسن المعاملة والأمانة مع العملاء بالخارج', maxScore: 25, description: 'المظهر اللائق وتمثيل الصيدلية بأفضل صورة أمام العملاء' },
    { id: '4', title: 'الدقة في تحصيل المبالغ وتسليم الكاش بالفرع فوراً', maxScore: 15, description: 'تسليم مبالغ الفواتير بدقة فور العودة دون تأخير' },
    { id: '5', title: 'المحافظة على حقيبة التوصيل ووسيلة النقل والعهدة', maxScore: 10, description: 'المحافظة على العهدة والمعدات المسلمة' }
  ],
  'مدير فرع': [
    { id: '1', title: 'القيادة وإدارة فريق العمل وتوزيع المهام والشيفتات', maxScore: 25, description: 'تنظيم الجداول والالتزام بالورديات وتحفيز الطاقم' },
    { id: '2', title: 'تحقيق المستهدف البيعي والارتقاء بأداء ومبيعات الفرع', maxScore: 25, description: 'متابعة المبيعات ومؤشرات الأداء ورضا العملاء' },
    { id: '3', title: 'إدارة المخزون وتفادي الرواكد ومتابعة النواقص والصلاحيات', maxScore: 20, description: 'المتابعة الدقيقة للمخزن والطلبيات' },
    { id: '4', title: 'الالتزام الإداري والمالي ورفع التقارير في المواعيد', maxScore: 15, description: 'توريد الخزينة ورفع تقارير البصمة والمصروفات بدقة' },
    { id: '5', title: 'تطبيق لوائح العمل ومعايير الجودة والنظافة العامة', maxScore: 15, description: 'المحافظة على الهوية والمعايير الصيدلانية' }
  ],
  'general': [
    { id: '1', title: 'الالتزام بمواعيد العمل والانضباط العام', maxScore: 20, description: 'الحضور والانصراف والالتزام بالتعليمات' },
    { id: '2', title: 'جودة وإتقان تنفيذ المهام والمسؤوليات الوظيفية', maxScore: 25, description: 'الدقة والكفاءة في أداء الواجبات اليومية' },
    { id: '3', title: 'التعاون مع الزملاء وروح الفريق الإيجابية', maxScore: 20, description: 'العمل الجماعي ودعم فريق الصيدلية' },
    { id: '4', title: 'خدمة العملاء واللباقة والمظهر اللائق', maxScore: 20, description: 'التعامل الاحترافي مع الرواد والزملاء' },
    { id: '5', title: 'المبادرة والتطوير والمحافظة على ممتلكات العمل', maxScore: 15, description: 'الحرص على مصلحة الصيدلية ومواردها' }
  ]
};

export function getJobEvaluationCriteria(jobTitle, orgSettings = {}) {
  const customMap = orgSettings?.evaluationCriteriaByJob || {};
  const normalizedJob = String(jobTitle || '').trim();

  if (customMap[normalizedJob] && Array.isArray(customMap[normalizedJob]) && customMap[normalizedJob].length > 0) {
    return customMap[normalizedJob];
  }

  for (const [k, v] of Object.entries(customMap)) {
    if (v && v.length > 0 && (normalizedJob.includes(k) || k.includes(normalizedJob))) {
      return v;
    }
  }

  if (DEFAULT_JOB_EVALUATION_CRITERIA[normalizedJob]) {
    return DEFAULT_JOB_EVALUATION_CRITERIA[normalizedJob];
  }

  for (const [k, v] of Object.entries(DEFAULT_JOB_EVALUATION_CRITERIA)) {
    if (normalizedJob.includes(k) || k.includes(normalizedJob)) {
      return v;
    }
  }

  return DEFAULT_JOB_EVALUATION_CRITERIA['general'];
}

export default function EvaluationsModule({
  subTab = 'evaluations',
  onSubTabChange,
  state,
  setState,
  saveState,
  currentRole = 'admin', // 'admin' | 'branch'
  currentBranchId,
  onSaveEvaluation,
  onSaveEmployeeNote,
  onReplyToNote,
  showToast
}) {
  const [activeTab, setActiveTab] = useState(subTab || 'evaluations'); // 'evaluations' | 'criteria' | 'notes' | 'complaints'
  
  // Selected Month State (Requirement 4)
  const initialMonth = useMemo(() => {
    try {
      return getActivePayrollMonth(state?.orgSettings || {}, new Date());
    } catch {
      return new Date().toISOString().slice(0, 7);
    }
  }, [state?.orgSettings]);

  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending_employee' | 'pending_admin' | 'approved'
  const [branchFilter, setBranchFilter] = useState(currentBranchId || 'all');
  const [jobFilter, setJobFilter] = useState('all');

  // Evaluation Form State
  const [evalEmpId, setEvalEmpId] = useState('');
  const [evalNotes, setEvalNotes] = useState('');
  const [evalItems, setEvalItems] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Criteria Template Settings State (Requirement 3)
  const [selectedCriteriaJob, setSelectedCriteriaJob] = useState('صيدلي');
  const [editingCriteriaItems, setEditingCriteriaItems] = useState([]);

  // Direct Edit Evaluation Modal State for Super Admin
  const [editingEval, setEditingEval] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editAdminComment, setEditAdminComment] = useState('');
  const [editItems, setEditItems] = useState([]);

  // Admin Review Interactive Box per Evaluation Card
  const [adminCommentMap, setAdminCommentMap] = useState({});

  // Note Form State
  const [noteEmpId, setNoteEmpId] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [replyTextMap, setReplyTextMap] = useState({});

  // Complaint Filters State
  const [complaintFilterStatus, setComplaintFilterStatus] = useState('all');
  const [complaintBranchFilter, setComplaintBranchFilter] = useState('all');
  const [complaintSearch, setComplaintSearch] = useState('');

  const employees = state?.employees || [];
  const evaluations = state?.evaluations || [];
  const notes = state?.employeeNotes || [];
  const branches = state?.branches || [];
  const orgSettings = state?.orgSettings || {};

  // Synchronize SubTab
  useEffect(() => {
    if (subTab && subTab !== activeTab) {
      setActiveTab(subTab);
    }
  }, [subTab]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (onSubTabChange) onSubTabChange(newTab);
  };

  // Load criteria when employee selection changes in Evaluation Form
  useEffect(() => {
    if (!evalEmpId) {
      setEvalItems([]);
      return;
    }
    const empObj = employees.find(e => String(e.id) === String(evalEmpId));
    const job = empObj?.jobTitle || 'general';
    const criteria = getJobEvaluationCriteria(job, orgSettings);
    setEvalItems(criteria.map(c => ({
      id: c.id || String(Date.now() + Math.random()),
      title: c.title,
      description: c.description || '',
      maxScore: c.maxScore || 20,
      score: c.maxScore || 20 // Default full score initially for easy adjustment
    })));
  }, [evalEmpId, orgSettings, employees]);

  // Load criteria for the Template Settings SubTab
  useEffect(() => {
    const criteria = getJobEvaluationCriteria(selectedCriteriaJob, orgSettings);
    setEditingCriteriaItems(criteria.map(c => ({ ...c })));
  }, [selectedCriteriaJob, orgSettings]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Month label
  const monthLabelText = useMemo(() => {
    const [y, m] = (selectedMonth || '').split('-');
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const idx = parseInt(m, 10) - 1;
    return `${monthNames[idx] || m} ${y} (${selectedMonth})`;
  }, [selectedMonth]);

  // ─────────────────────────────────────────────────────────────────────────
  // Evaluated employees list filtered by selectedMonth, branch, and role
  // ─────────────────────────────────────────────────────────────────────────
  const filteredEvaluations = useMemo(() => {
    return evaluations.filter((ev) => {
      // Month Filter
      if (selectedMonth) {
        const evMonth = ev.month || (ev.date ? ev.date.slice(0, 7) : null);
        if (evMonth && evMonth !== selectedMonth) return false;
      }

      // Branch Filter
      const targetB = currentRole === 'branch' ? currentBranchId : branchFilter;
      if (targetB && targetB !== 'all') {
        if (String(ev.branchId) !== String(targetB)) return false;
      }

      // Job Filter
      if (jobFilter && jobFilter !== 'all') {
        const emp = employees.find(e => String(e.id) === String(ev.employeeId));
        const job = ev.jobTitle || emp?.jobTitle || '';
        if (job !== jobFilter) return false;
      }

      // Status Filter
      if (statusFilter !== 'all') {
        const currentStage = ev.stage || (ev.status === 'approved' ? 'approved' : ev.employeeStatus === 'pending' ? 'pending_employee' : 'pending_admin');
        if (statusFilter === 'pending_employee' && currentStage !== 'pending_employee') return false;
        if (statusFilter === 'pending_admin' && currentStage !== 'pending_admin') return false;
        if (statusFilter === 'approved' && currentStage !== 'approved') return false;
      }

      return true;
    }).sort((a, b) => {
      const getT = (e) => new Date(e.createdAt || e.date || 0).getTime();
      return getT(b) - getT(a);
    });
  }, [evaluations, selectedMonth, currentRole, currentBranchId, branchFilter, jobFilter, statusFilter, employees]);

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 5: Top Performers per Job Title (لوحة شرف الموظفين المتميزين)
  // ─────────────────────────────────────────────────────────────────────────
  const topPerformersByJob = useMemo(() => {
    const monthEvals = evaluations.filter((ev) => {
      const evMonth = ev.month || (ev.date ? ev.date.slice(0, 7) : null);
      if (selectedMonth && evMonth && evMonth !== selectedMonth) return false;
      if (currentRole === 'branch' && currentBranchId && String(ev.branchId) !== String(currentBranchId)) return false;
      return true;
    });

    const groups = {};
    monthEvals.forEach((ev) => {
      const emp = employees.find(e => String(e.id) === String(ev.employeeId));
      const job = ev.jobTitle || emp?.jobTitle || 'أخرى';
      if (!groups[job]) groups[job] = [];
      groups[job].push({
        ...ev,
        empObj: emp,
        calculatedScore: parseFloat(ev.percentage) || parseFloat(ev.score) || 0
      });
    });

    const winners = [];
    Object.entries(groups).forEach(([job, evList]) => {
      if (evList.length === 0) return;
      evList.sort((a, b) => b.calculatedScore - a.calculatedScore);
      const topOne = evList[0];
      if (topOne && topOne.calculatedScore >= 60) {
        winners.push({
          jobTitle: job,
          ...topOne
        });
      }
    });

    return winners;
  }, [evaluations, selectedMonth, currentRole, currentBranchId, employees]);

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 1 & 2: Submit Evaluation by Branch Manager or Admin
  // ─────────────────────────────────────────────────────────────────────────
  const handleEvaluationSubmit = async (e) => {
    e.preventDefault();
    if (!evalEmpId) {
      showToast('يرجى تحديد الموظف المراد تقييمه');
      return;
    }

    const empObj = employees.find((e) => String(e.id) === String(evalEmpId));
    if (!empObj) {
      showToast('بيانات الموظف غير متوفرة');
      return;
    }

    const totalScore = evalItems.reduce((acc, item) => acc + (parseFloat(item.score) || 0), 0);
    const maxTotalScore = evalItems.reduce((acc, item) => acc + (parseFloat(item.maxScore) || 20), 0);
    const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;
    
    let rating = 'ممتاز';
    if (percentage < 60) rating = 'ضعيف';
    else if (percentage < 75) rating = 'مقبول';
    else if (percentage < 85) rating = 'جيد';
    else if (percentage < 95) rating = 'جيد جداً';

    const empBranchId = empObj.branchesDetails?.[0]?.branchId || empObj.branchId || currentBranchId || '';
    const branchObj = branches.find(b => String(b.id) === String(empBranchId));

    // Evaluator Info (Branch Manager or Admin)
    const isBranchEvaluator = currentRole === 'branch';
    const evaluatorName = isBranchEvaluator 
      ? (branchObj?.managerName || state.currentUserName || 'مدير الفرع')
      : 'الإدارة العليا';
    const evaluatorRole = isBranchEvaluator ? 'مدير الفرع' : 'الإدارة العليا';

    const evalData = {
      id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      employeeId: String(empObj.id),
      employeeName: empObj.name,
      employeeCode: empObj.code,
      jobTitle: empObj.jobTitle || 'موظف',
      branchId: empBranchId,
      branchName: branchObj?.name || 'الفرع الرئيسي',
      
      // Evaluator Info (Requirement 2)
      evaluatorId: state.currentUserId || '',
      evaluatorName: evaluatorName,
      evaluatorCode: branchObj?.managerCode || '',
      evaluatorRole: evaluatorRole,
      
      // Month & Dates (Requirement 4)
      month: selectedMonth,
      date: getRealTodayStr(),
      createdAt: new Date().toISOString(),
      
      // Scores & Items
      items: evalItems,
      score: percentage,
      percentage,
      totalScore,
      maxTotalScore,
      rating,
      
      // Notes
      managerNotes: evalNotes.trim(),
      notes: evalNotes.trim(),
      
      // Workflow Stage: Starts with employee review (Requirement 1)
      stage: 'pending_employee',
      status: 'pending_employee',
      employeeStatus: 'pending',
      employeeComment: '',
      respondedAt: null,
      
      // Admin Final Approval
      adminStatus: 'pending',
      adminComment: '',
      adminApproved: false,
      approvedAt: null
    };

    // Notification for the employee (Requirement 1)
    const empNotif = {
      id: `notif_eval_emp_${Date.now()}`,
      employeeId: empObj.id,
      type: 'eval_pending_employee',
      title: `⭐ تقييم شهري جديد لشهر (${selectedMonth})`,
      message: `قام ${evaluatorRole} (${evaluatorName}) برصد تقييم أدائك لشهر (${selectedMonth}) بنسبة ${percentage}% (${rating}). يرجى مراجعة تفاصيل التقييم والرد بالموافقة أو إبداء الملاحظات.`,
      timestamp: new Date().toISOString(),
      read: false,
      linkTab: 'evaluations',
      evalId: evalData.id
    };

    const updatedEvals = [evalData, ...evaluations];
    const updatedNotifications = [empNotif, ...(state.notifications || [])];
    const updatedState = { ...state, evaluations: updatedEvals, notifications: updatedNotifications };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast(`✅ تم حفظ التقييم بنجاح وإرساله للموظف (${empObj.name}) للمراجعة والرد الأول`);
    setEvalEmpId('');
    setEvalNotes('');
    setShowAddForm(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 1 & 2: Senior Management Finalizes Evaluation with Admin Comment
  // ─────────────────────────────────────────────────────────────────────────
  const handleAdminFinalizeEvaluation = async (ev, customComment = null) => {
    const finalComment = customComment !== null ? customComment : (adminCommentMap[ev.id] || ev.adminComment || '');

    const empObj = employees.find(e => String(e.id) === String(ev.employeeId));
    const branchObj = branches.find(b => String(b.id) === String(ev.branchId));

    const updatedEvals = evaluations.map((e) => {
      if (e.id === ev.id) {
        return {
          ...e,
          stage: 'approved',
          status: 'approved',
          adminStatus: 'approved',
          adminApproved: true,
          adminComment: finalComment.trim(),
          adminNotes: finalComment.trim(),
          approvedAt: new Date().toISOString(),
          approvedBy: 'الإدارة العليا'
        };
      }
      return e;
    });

    // Notification for Employee
    const empNotif = {
      id: `notif_eval_final_emp_${Date.now()}`,
      employeeId: ev.employeeId,
      type: 'eval_finalized',
      title: `⭐ تم اعتماد تقييم أداء شهر (${ev.month || selectedMonth}) من الإدارة العليا`,
      message: `اعتمدت الإدارة العليا تقييمك لشهر (${ev.month || selectedMonth}) بنسبة نهائية ${ev.percentage}%. ${finalComment.trim() ? `تعليق الإدارة: "${finalComment.trim()}"` : ''}`,
      timestamp: new Date().toISOString(),
      read: false,
      linkTab: 'evaluations',
      evalId: ev.id
    };

    // Notification for Branch Manager
    const mgrNotif = {
      id: `notif_eval_final_mgr_${Date.now()}`,
      type: 'eval_finalized_manager',
      title: `⭐ تم اعتماد تقييم الموظف (${ev.employeeName})`,
      message: `راجعت واعتمدت الإدارة العليا تقييم الموظف ${ev.employeeName} لشهر (${ev.month || selectedMonth}). ${finalComment.trim() ? `تعليق الإدارة: "${finalComment.trim()}"` : ''}`,
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'branch',
      branchId: ev.branchId,
      linkTab: 'evaluations',
      evalId: ev.id
    };

    const updatedNotifications = [empNotif, mgrNotif, ...(state.notifications || [])];
    const updatedState = { ...state, evaluations: updatedEvals, notifications: updatedNotifications };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast(`✅ تم اعتماد التقييم وإرسال رأي الإدارة العليا للموظف ومدير الفرع بنجاح`);
    setAdminCommentMap(prev => ({ ...prev, [ev.id]: '' }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 3: Save Job Evaluation Criteria Templates by Senior Management
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveCriteriaTemplate = async () => {
    if (editingCriteriaItems.length === 0) {
      showToast('يجب أن يحتوي القالب على بند تقييم واحد على الأقل');
      return;
    }

    const totalMax = editingCriteriaItems.reduce((sum, i) => sum + (parseFloat(i.maxScore) || 0), 0);

    const currentMap = { ...(orgSettings.evaluationCriteriaByJob || {}) };
    currentMap[selectedCriteriaJob] = editingCriteriaItems;

    const updatedOrgSettings = {
      ...orgSettings,
      evaluationCriteriaByJob: currentMap
    };

    const updatedState = {
      ...state,
      orgSettings: updatedOrgSettings
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast(`✅ تم حفظ معايير تقييم وظيفة (${selectedCriteriaJob}) بنجاح (المجموع: ${totalMax} درجة)`);
  };

  const handleResetCriteriaToDefault = () => {
    const def = DEFAULT_JOB_EVALUATION_CRITERIA[selectedCriteriaJob] || DEFAULT_JOB_EVALUATION_CRITERIA['general'];
    setEditingCriteriaItems(def.map(c => ({ ...c })));
    showToast(`تم استعادة المعايير الافتراضية لوظيفة (${selectedCriteriaJob})`);
  };

  const handleAddCriteriaItem = () => {
    setEditingCriteriaItems([
      ...editingCriteriaItems,
      { id: String(Date.now()), title: '', description: '', maxScore: 20 }
    ]);
  };

  const handleRemoveCriteriaItem = (id) => {
    setEditingCriteriaItems(editingCriteriaItems.filter(i => i.id !== id));
  };

  const handleUpdateCriteriaField = (id, field, value) => {
    setEditingCriteriaItems(editingCriteriaItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // Super Admin Direct Edit Evaluation Modal
  const handleOpenEditModal = (ev) => {
    setEditingEval(ev);
    setEditNotes(ev.managerNotes || ev.notes || '');
    setEditAdminComment(ev.adminComment || '');
    setEditItems(ev.items && ev.items.length > 0 ? [...ev.items] : [
      { id: '1', title: 'الالتزام والانضباط', score: 18, maxScore: 20 }
    ]);
  };

  const handleSaveDirectAdminEdit = async (e) => {
    e.preventDefault();
    if (!editingEval) return;

    const totalScore = editItems.reduce((acc, item) => acc + (parseFloat(item.score) || 0), 0);
    const maxTotalScore = editItems.reduce((acc, item) => acc + (parseFloat(item.maxScore) || 20), 0);
    const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;
    
    let rating = 'ممتاز';
    if (percentage < 60) rating = 'ضعيف';
    else if (percentage < 75) rating = 'مقبول';
    else if (percentage < 85) rating = 'جيد';
    else if (percentage < 95) rating = 'جيد جداً';

    const updatedEvals = evaluations.map((ev) => {
      if (ev.id === editingEval.id) {
        return {
          ...ev,
          items: editItems,
          score: percentage,
          percentage,
          totalScore,
          maxTotalScore,
          rating,
          managerNotes: editNotes.trim(),
          notes: editNotes.trim(),
          adminComment: editAdminComment.trim(),
          adminNotes: editAdminComment.trim(),
          stage: 'approved',
          status: 'approved',
          adminApproved: true,
          updatedByAdminAt: new Date().toISOString()
        };
      }
      return ev;
    });

    const updatedState = { ...state, evaluations: updatedEvals };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setEditingEval(null);
    showToast('✅ تم تحديث واعتماد التقييم بواسطة الإدارة العليا بنجاح');
  };

  // Notes & Complaints handlers
  const handleNoteSubmit = (e) => {
    e.preventDefault();
    if (!noteEmpId || !noteContent.trim()) {
      showToast('يرجى اختيار الموظف وإدخال نص الملاحظة');
      return;
    }
    const noteData = {
      id: `note_${Date.now()}`,
      employeeId: noteEmpId,
      content: noteContent,
      branchId: currentBranchId || '',
      createdRole: currentRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع',
      createdAt: new Date().toISOString(),
      replies: []
    };
    if (onSaveEmployeeNote) onSaveEmployeeNote(noteData);
    showToast('✅ تم تسجيل الملاحظة بنجاح!');
    setNoteContent('');
  };

  const handleReplySubmit = (noteId) => {
    const text = replyTextMap[noteId];
    if (!text || !text.trim()) return;

    if (onReplyToNote) {
      onReplyToNote(noteId, {
        id: `reply_${Date.now()}`,
        authorRole: currentRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع',
        content: text.trim(),
        createdAt: new Date().toISOString()
      });
    }
    setReplyTextMap({ ...replyTextMap, [noteId]: '' });
  };

  const complaintsCount = (state.requests || []).filter((r) => r.type === 'complaint').length;

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Header & SubTabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⭐</span>
            <span>نظام تقييم الأداء ولوحة الشرف والتميز</span>
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
            دورة التقييم التفاعلية (مدير الفرع ⬅️ الموظف ⬅️ الإدارة العليا) ومعايير الوظائف
          </p>
        </div>

        {/* Navigation Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface, #f8fafc)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--muted)' }}>
              📑 القسم المعروض:
            </span>
            <select
              value={activeTab}
              onChange={(e) => handleTabChange(e.target.value)}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1.5px solid var(--primary, #0f766e)',
                background: '#ffffff',
                color: 'var(--text)',
                fontFamily: 'Cairo, Tajawal, sans-serif',
                fontWeight: 'bold',
                fontSize: '13.5px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15,118,110,0.1)',
                outline: 'none',
                minWidth: '240px'
              }}
            >
              <option value="evaluations">
                ⭐ تقييمات الأداء والدرجات ({evaluations.length})
              </option>
              {currentRole === 'admin' && (
                <option value="criteria">
                  ⚙️ قوالب ومعايير التقييم لكل وظيفة
                </option>
              )}
              <option value="notes">
                💬 ملاحظات الفروع والردود ({notes.length})
              </option>
              <option value="complaints">
                📋 شكاوى ومقترحات الموظفين ({complaintsCount})
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 1: EVALUATIONS & TOP PERFORMERS BOARD                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'evaluations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

          {/* Controls Bar: Month Picker & Filters (Requirement 4) */}
          <div style={{
            background: 'linear-gradient(135deg, #f0fdfa, #f8fafc)',
            border: '1.5px solid #ccfbf1',
            borderRadius: '16px',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            boxShadow: '0 2px 8px rgba(15,118,110,0.06)'
          }}>
            {/* Month Navigator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🗓️</span>
                <span>شهر التقييم:</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handlePrevMonth}
                style={{ padding: '4px 10px', fontSize: '12px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '8px' }}
                title="الشهر السابق"
              >
                ◀
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #0d9488',
                  fontWeight: 'bold',
                  fontSize: '13.5px',
                  color: '#0f766e',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleNextMonth}
                style={{ padding: '4px 10px', fontSize: '12px', background: '#fff', border: '1px solid #99f6e4', borderRadius: '8px' }}
                title="الشهر التالي"
              >
                ▶
              </button>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f766e', background: '#ccfbf1', padding: '4px 12px', borderRadius: '99px' }}>
                {monthLabelText}
              </span>
            </div>

            {/* Quick Action & Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {currentRole === 'admin' && (
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: '#fff' }}
                >
                  <option value="all">📍 جميع الفروع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}

              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: '#fff' }}
              >
                <option value="all">👔 جميع الوظائف</option>
                {Object.keys(DEFAULT_JOB_EVALUATION_CRITERIA).filter(k => k !== 'general').map(j => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>

              <button
                type="button"
                className="btn btn-start"
                onClick={() => setShowAddForm(!showAddForm)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 16px' }}
              >
                {showAddForm ? '✕ إخفاء النموذج' : '➕ رصد تقييم جديد للموظف'}
              </button>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* Requirement 5: Top Performers Wall of Fame (لوحة شرف التميز)   */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div style={{
            background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
            border: '2px solid #fcd34d',
            borderRadius: '18px',
            padding: '20px 24px',
            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.12)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '30px' }}>🏆</span>
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'Cairo', color: '#92400e', fontSize: '17px' }}>
                    لوحة الشرف والتميز الوظيفي — أعلى الموظفين تقييماً لشهر ({monthLabelText})
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#b45309' }}>
                    تكريم فرسان الأداء والمركز الأول في كل مسمى وظيفي بالشركة
                  </p>
                </div>
              </div>
              <span style={{ background: '#fef08a', border: '1px solid #fde047', color: '#854d0e', padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 'bold' }}>
                🌟 {topPerformersByJob.length} فئات وظيفية متميزة
              </span>
            </div>

            {topPerformersByJob.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#b45309', background: '#fffbeb', borderRadius: '12px', fontSize: '13.5px' }}>
                لا توجد تقييمات مرصودة لشهر ({monthLabelText}) حتى الآن لاستخراج لوحة الشرف.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                {topPerformersByJob.map((winner, idx) => (
                  <div
                    key={winner.id || idx}
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #fde68a',
                      borderRadius: '14px',
                      padding: '16px',
                      boxShadow: '0 4px 10px rgba(217, 119, 6, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ position: 'absolute', top: '-10px', left: '-10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '14px 14px 6px 6px', borderRadius: '0 0 20px 0', fontSize: '14px', fontWeight: 'bold' }}>
                      🥇
                    </div>

                    <div style={{ paddingRight: '18px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#d97706', background: '#fef3c7', padding: '3px 8px', borderRadius: '6px' }}>
                        ⭐ أفضل {winner.jobTitle}
                      </span>
                      <h4 style={{ margin: '6px 0 2px', fontSize: '15.5px', fontWeight: '900', color: '#1e293b' }}>
                        {winner.employeeName}
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'normal', marginRight: '6px' }}>
                          (كود: {winner.employeeCode})
                        </span>
                      </h4>
                    </div>

                    <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '4px', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>📍 الفرع:</span>
                        <strong style={{ color: '#0f766e' }}>{winner.branchName || 'الفرع الرئيسي'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>👤 مدير الفرع:</span>
                        <span style={{ color: '#334155', fontWeight: '600' }}>{winner.evaluatorName || 'مدير الفرع'}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 'bold' }}>
                        التقدير: {winner.rating || 'ممتاز'}
                      </span>
                      <span style={{ fontSize: '17px', fontWeight: '900', color: '#15803d', background: '#dcfce7', padding: '2px 10px', borderRadius: '8px', border: '1px solid #86efac' }}>
                        {winner.percentage || winner.score}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* New Evaluation Form (Interactive by Job Criteria)                */}
          {/* ──────────────────────────────────────────────────────────────── */}
          {showAddForm && (
            <div style={{ background: '#ffffff', border: '2px solid #0d9488', padding: '22px', borderRadius: '16px', boxShadow: '0 6px 18px rgba(13,148,136,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#0f766e', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⭐</span>
                  <span>رصد تقييم أداء جديد للموظف لشهر ({monthLabelText})</span>
                </h4>
                <span style={{ fontSize: '12.5px', color: '#0f766e', background: '#ccfbf1', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>
                  المقيِّم: {currentRole === 'branch' ? 'مدير الفرع' : 'الإدارة العليا'}
                </span>
              </div>

              <form onSubmit={handleEvaluationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  <div className="field">
                    <label style={{ fontWeight: 'bold', fontSize: '13px' }}>اختر الموظف المراد تقييمه *</label>
                    <select
                      value={evalEmpId}
                      onChange={(e) => setEvalEmpId(e.target.value)}
                      required
                      style={{ padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #0d9488', fontWeight: 'bold', fontSize: '13.5px', background: '#fff' }}
                    >
                      <option value="">-- اختر الموظف من القائمة --</option>
                      {employees
                        .filter(isEmployeeActive)
                        .filter(e => {
                          if (currentRole === 'branch' && currentBranchId) {
                            const bId = e.branchesDetails?.[0]?.branchId || e.branchId;
                            return String(bId) === String(currentBranchId);
                          }
                          return true;
                        })
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {getEmpDisplayName(e)} (كود: {e.code} — الوظيفة: {e.jobTitle || 'موظف'})
                          </option>
                        ))}
                    </select>
                  </div>

                  {evalEmpId && (() => {
                    const selEmp = employees.find(e => String(e.id) === String(evalEmpId));
                    const totalSc = evalItems.reduce((acc, i) => acc + (parseFloat(i.score) || 0), 0);
                    const maxSc = evalItems.reduce((acc, i) => acc + (parseFloat(i.maxScore) || 20), 0);
                    const pct = maxSc > 0 ? Math.round((totalSc / maxSc) * 100) : 0;
                    const bObj = branches.find(b => String(b.id) === String(selEmp?.branchId || selEmp?.branchesDetails?.[0]?.branchId));
                    return (
                      <div style={{
                        background: 'linear-gradient(135deg, #f0fdfa, #e6fffa)',
                        border: '2px solid #0d9488',
                        padding: '14px 18px',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: '0 3px 10px rgba(13,148,136,0.08)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '18px' }}>👤</span>
                            <strong style={{ fontSize: '15px', color: '#0f172a' }}>{selEmp?.name}</strong>
                            <span style={{ fontSize: '12px', background: '#ccfbf1', color: '#0f766e', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                              كود: {selEmp?.code}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#475569' }}>📍 الفرع:</span>
                            <strong style={{ color: '#0f766e', fontSize: '13px' }}>{bObj?.name || 'الفرع الرئيسي'}</strong>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid #99f6e4', paddingTop: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 'bold' }}>الوظيفة المعتمدة:</span>
                            <span style={{
                              background: '#0d9488',
                              color: '#ffffff',
                              padding: '4px 14px',
                              borderRadius: '8px',
                              fontWeight: '900',
                              fontSize: '14px',
                              boxShadow: '0 2px 6px rgba(13,148,136,0.2)'
                            }}>
                              👔 {selEmp?.jobTitle || 'موظف'}
                            </span>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                              ({evalItems.length} بنود قياسية محملة)
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12.5px', color: '#0f766e', fontWeight: 'bold' }}>الدرجة والنسبة:</span>
                            <span style={{
                              background: pct >= 85 ? '#dcfce7' : pct >= 70 ? '#fef3c7' : '#fee2e2',
                              color: pct >= 85 ? '#15803d' : pct >= 70 ? '#b45309' : '#b91c1c',
                              border: `1px solid ${pct >= 85 ? '#86efac' : pct >= 70 ? '#fde68a' : '#fca5a5'}`,
                              padding: '3px 12px',
                              borderRadius: '8px',
                              fontWeight: '900',
                              fontSize: '15px'
                            }}>
                              {totalSc} / {maxSc} ({pct}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Criteria Rows */}
                {evalItems.length > 0 && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <label style={{ fontWeight: '800', fontSize: '13.5px', color: '#1e293b' }}>
                        📋 بنود التقييم المعتمدة لوظيفة الموظف ({evalItems.length} معايير):
                      </label>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        يتم تقييم كل بند من 0 إلى الدرجة القصوى المحددة
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {evalItems.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          style={{
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            background: '#ffffff',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1'
                          }}
                        >
                          <div style={{ flex: '3 1 250px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>
                              #{idx + 1} — {item.title}
                            </div>
                            {item.description && (
                              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                {item.description}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold' }}>الدرجة الممنوحة:</label>
                            <input
                              type="number"
                              min="0"
                              max={item.maxScore}
                              value={item.score}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setEvalItems(evalItems.map(i => i.id === item.id ? { ...i, score: Math.min(val, item.maxScore) } : i));
                              }}
                              style={{ width: '75px', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #0d9488', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', color: '#0f766e' }}
                              required
                            />
                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>
                              / {item.maxScore}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="field">
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>📝 ملاحظات وتوصيات مدير الفرع على الموظف</label>
                  <textarea
                    rows="2"
                    placeholder="اكتب ملاحظات تفصيلية حول أداء الموظف، نقاط القوة، والتوصيات التحسينية..."
                    value={evalNotes}
                    onChange={(e) => setEvalNotes(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button type="submit" className="btn btn-start" style={{ padding: '10px 22px', fontSize: '13.5px' }}>
                    🚀 إرسال التقييم للموظف للمراجعة والرد الأول
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowAddForm(false)}>
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* Status Tabs & Evaluations Cards List                             */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', color: '#1e293b', fontWeight: '800' }}>
                📋 سجل تقييمات شهر ({monthLabelText}) — {filteredEvaluations.length} تقييم
              </h4>

              {/* Status Filter Tabs */}
              <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                {[
                  { id: 'all', label: 'الكل' },
                  { id: 'pending_employee', label: '⏳ بانتظار رد الموظف' },
                  { id: 'pending_admin', label: '📋 بانتظار اعتماد الإدارة' },
                  { id: 'approved', label: '✅ المعتمدة والنهائية' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12.5px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      background: statusFilter === tab.id ? '#0d9488' : 'transparent',
                      color: statusFilter === tab.id ? '#ffffff' : '#475569'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredEvaluations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                لا توجد تقييمات مطابقة لهذا الشهر والفلاتر المحددة.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {filteredEvaluations.map((ev) => {
                  const emp = employees.find((e) => String(e.id) === String(ev.employeeId));
                  const branchObj = branches.find((b) => String(b.id) === String(ev.branchId));
                  const stage = ev.stage || (ev.status === 'approved' ? 'approved' : ev.employeeStatus === 'pending' ? 'pending_employee' : 'pending_admin');

                  return (
                    <div
                      key={ev.id}
                      style={{
                        background: '#ffffff',
                        border: stage === 'approved' ? '1.5px solid #86efac' : stage === 'pending_admin' ? '2px solid #3b82f6' : '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '20px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
                      }}
                    >
                      {/* Evaluation Header (Requirement 2) */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h4 style={{ margin: 0, fontSize: '16.5px', fontWeight: '900', color: '#0f172a' }}>
                              👤 {emp ? getEmpDisplayName(emp) : (ev.employeeName || 'موظف')}
                            </h4>
                            <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                              كود: {ev.employeeCode || emp?.code}
                            </span>
                            <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                              👔 {ev.jobTitle || emp?.jobTitle || 'موظف'}
                            </span>
                          </div>

                          {/* Branch & Manager Info */}
                          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12.5px', color: '#64748b', marginTop: '6px' }}>
                            <span>📍 الفرع: <strong style={{ color: '#0f766e' }}>{ev.branchName || branchObj?.name || 'الفرع الرئيسي'}</strong></span>
                            <span>👤 مدير الفرع المقيم: <strong style={{ color: '#334155' }}>{ev.evaluatorName || 'مدير الفرع'} {ev.evaluatorCode ? `(كود: ${ev.evaluatorCode})` : ''}</strong></span>
                            <span>🗓️ الشهر: <strong style={{ color: '#0f172a' }}>{ev.month || selectedMonth}</strong></span>
                          </div>
                        </div>

                        {/* Status Badge & Score */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '99px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            background: stage === 'approved' ? '#dcfce7' : stage === 'pending_admin' ? '#dbeafe' : '#fef3c7',
                            color: stage === 'approved' ? '#166534' : stage === 'pending_admin' ? '#1e40af' : '#92400e',
                            border: `1px solid ${stage === 'approved' ? '#86efac' : stage === 'pending_admin' ? '#93c5fd' : '#fde68a'}`
                          }}>
                            {stage === 'approved' ? '✅ معتمد ونهائي' : stage === 'pending_admin' ? '📋 بانتظار اعتماد الإدارة العليا' : '⏳ بانتظار رد الموظف'}
                          </span>

                          <div style={{ textAlign: 'center', background: '#f0fdfa', border: '1.5px solid #99f6e4', padding: '4px 12px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '900', color: '#0d9488' }}>
                              {ev.percentage || ev.score}%
                            </div>
                            <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: 'bold' }}>
                              {ev.rating || 'ممتاز'}
                            </div>
                          </div>

                          {currentRole === 'admin' && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                              onClick={() => handleOpenEditModal(ev)}
                            >
                              ✏️ تعديل
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Criteria Items Table */}
                      {ev.items && ev.items.length > 0 && (
                        <div className="table-responsive" style={{ margin: '10px 0' }}>
                          <table className="bylaws-table" style={{ fontSize: '12.5px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', color: '#334155' }}>
                                <th style={{ width: '50%' }}>بند التقييم المعياري</th>
                                <th style={{ textAlign: 'center' }}>الدرجة الممنوحة</th>
                                <th style={{ textAlign: 'center' }}>الدرجة العظمى</th>
                                <th style={{ textAlign: 'center' }}>النسبة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ev.items.map((item, idx) => {
                                const sc = parseFloat(item.score) || 0;
                                const mx = parseFloat(item.maxScore) || 20;
                                const pct = mx > 0 ? Math.round((sc / mx) * 100) : 0;
                                return (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: 'bold' }}>#{idx + 1} — {item.title}</td>
                                    <td style={{ textAlign: 'center', fontWeight: '800', color: '#0d9488' }}>{sc}</td>
                                    <td style={{ textAlign: 'center', color: '#64748b' }}>{mx}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span className={`badge ${pct >= 85 ? 'badge-success' : pct >= 70 ? 'badge-warning' : 'badge-danger'}`}>
                                        {pct}%
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: '#f0fdfa', fontWeight: '900', color: '#0f766e' }}>
                                <td>المجموع الكلي:</td>
                                <td style={{ textAlign: 'center' }}>{ev.totalScore || ev.items.reduce((s, i) => s + (parseFloat(i.score) || 0), 0)}</td>
                                <td style={{ textAlign: 'center' }}>{ev.maxTotalScore || ev.items.reduce((s, i) => s + (parseFloat(i.maxScore) || 20), 0)}</td>
                                <td style={{ textAlign: 'center' }}>{ev.percentage || ev.score}%</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      {/* Notes & Responses Grid (Requirement 1 & 2) */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginTop: '12px' }}>
                        {/* 1. Branch Manager Notes */}
                        <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f766e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>📝</span>
                            <span>ملاحظات وتوصيات مدير الفرع:</span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#1e293b' }}>
                            {ev.managerNotes || ev.notes || 'لا توجد ملاحظات إضافية.'}
                          </div>
                        </div>

                        {/* 2. Employee Response */}
                        <div style={{
                          background: ev.employeeStatus === 'approved' ? '#f0fdf4' : ev.employeeStatus === 'rejected' ? '#fef2f2' : '#fffbeb',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: `1px solid ${ev.employeeStatus === 'approved' ? '#86efac' : ev.employeeStatus === 'rejected' ? '#fca5a5' : '#fde68a'}`
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px', color: ev.employeeStatus === 'approved' ? '#166534' : ev.employeeStatus === 'rejected' ? '#991b1b' : '#92400e' }}>
                            <span>💬</span>
                            <span>رد ورأي الموظف:</span>
                            <span style={{ marginRight: 'auto', fontWeight: '800' }}>
                              {ev.employeeStatus === 'approved' ? '🟢 وافق على التقييم' : ev.employeeStatus === 'rejected' ? '🔴 اعترض على التقييم' : '⏳ لم يرد بعد'}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#1e293b', fontStyle: ev.employeeComment ? 'italic' : 'normal' }}>
                            {ev.employeeComment ? `"${ev.employeeComment}"` : ev.employeeStatus === 'approved' ? 'وافق الموظف على نتائج التقييم.' : 'بانتظار مراجعة الموظف وإبداء رأيه.'}
                          </div>
                          {ev.respondedAt && (
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                              بتاريخ: {new Date(ev.respondedAt).toLocaleString('ar-EG')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 3. Senior Management Review & Comment (Requirement 1 & 2) */}
                      {currentRole === 'admin' && (
                        <div style={{ marginTop: '14px', background: '#eff6ff', border: '1.5px solid #bfdbfe', padding: '14px', borderRadius: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🏛️</span>
                              <span>رأي وقرار الإدارة العليا:</span>
                            </span>
                            {ev.adminApproved && (
                              <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                                ✅ معتمد رسمياً من الإدارة العليا
                              </span>
                            )}
                          </div>

                          {ev.adminApproved && ev.adminComment && (
                            <div style={{ fontSize: '13.5px', color: '#1e3a8a', fontWeight: '600', marginBottom: '8px' }}>
                              💬 تعليق الإدارة العليا المعتمد: "{ev.adminComment}"
                            </div>
                          )}

                          {/* Interactive Comment & Finalize Box */}
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
                            <input
                              type="text"
                              placeholder="أضف تعليق / توصيات الإدارة العليا هنا..."
                              value={adminCommentMap[ev.id] !== undefined ? adminCommentMap[ev.id] : (ev.adminComment || '')}
                              onChange={(e) => setAdminCommentMap({ ...adminCommentMap, [ev.id]: e.target.value })}
                              style={{ flex: 1, minWidth: '220px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #93c5fd', fontSize: '13px', background: '#fff' }}
                            />
                            <button
                              type="button"
                              className="btn btn-start"
                              onClick={() => handleAdminFinalizeEvaluation(ev)}
                              style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              ✅ {ev.adminApproved ? 'تحديث رأي الإدارة' : 'اعتماد التقييم النهائي وإشعار الطرفين'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Display Admin Comment to Branch Manager as well */}
                      {currentRole === 'branch' && ev.adminComment && (
                        <div style={{ marginTop: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', color: '#1e40af' }}>
                          <strong>🏛️ تعليق الإدارة العليا: </strong> "{ev.adminComment}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 2: REQUIREMENT 3 - JOB EVALUATION CRITERIA TEMPLATES        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'criteria' && currentRole === 'admin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'Cairo', color: '#0f766e', fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚙️</span>
                  <span>إعداد قوالب ومعايير التقييم الثابتة لكل وظيفة</span>
                </h3>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                  تحدد الإدارة العليا بنود التقييم والدرجة العظمى لكل بند ليلتزم بها مديرو الفروع عند التقييم
                </p>
              </div>

              {/* Job Selector for Template */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold' }}>اختر الوظيفة:</label>
                <select
                  value={selectedCriteriaJob}
                  onChange={(e) => setSelectedCriteriaJob(e.target.value)}
                  style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid #0d9488', fontWeight: 'bold', fontSize: '13.5px', background: '#f0fdfa', color: '#0f766e' }}
                >
                  {Object.keys(DEFAULT_JOB_EVALUATION_CRITERIA).map(job => (
                    <option key={job} value={job}>
                      👔 {job === 'general' ? 'معايير عامة افتراضية' : job}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Criteria Editor Table */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: '800', fontSize: '14px', color: '#1e293b' }}>
                  قائمة بنود تقييم وظيفة ({selectedCriteriaJob}):
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleAddCriteriaItem}
                  style={{ fontSize: '12.5px', padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                >
                  ➕ إضافة بند جديد
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {editingCriteriaItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span style={{ fontWeight: '900', color: '#0f766e', fontSize: '14px' }}>#{idx + 1}</span>

                    <div style={{ flex: '3 1 250px' }}>
                      <input
                        type="text"
                        placeholder="عنوان بند التقييم..."
                        value={item.title}
                        onChange={(e) => handleUpdateCriteriaField(item.id, 'title', e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}
                        required
                      />
                      <input
                        type="text"
                        placeholder="وصف وتفاصيل المعيار للمدير..."
                        value={item.description}
                        onChange={(e) => handleUpdateCriteriaField(item.id, 'description', e.target.value)}
                        style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold' }}>الدرجة العظمى:</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={item.maxScore}
                        onChange={(e) => handleUpdateCriteriaField(item.id, 'maxScore', parseFloat(e.target.value) || 1)}
                        style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #0d9488', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', color: '#0f766e' }}
                        required
                      />
                    </div>

                    {editingCriteriaItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCriteriaItem(item.id)}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                        title="حذف هذا البند"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Total Score Calculation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', padding: '10px 14px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px' }}>
                <span style={{ fontWeight: 'bold', color: '#0f766e' }}>إجمالي الدرجات العظمى للمعايير:</span>
                <span style={{ fontWeight: '900', fontSize: '16px', color: '#0d9488' }}>
                  {editingCriteriaItems.reduce((s, i) => s + (parseFloat(i.maxScore) || 0), 0)} درجة
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-start"
                onClick={handleSaveCriteriaTemplate}
                style={{ padding: '10px 24px', fontSize: '13.5px' }}
              >
                💾 حفظ وتعميم معايير وظيفة ({selectedCriteriaJob})
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleResetCriteriaToDefault}
                style={{ color: '#64748b', fontSize: '12.5px' }}
              >
                🔄 استعادة المعايير الافتراضية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 3: NOTES & REPLIES                                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
              📝 إضافة ملاحظة جديدة على موظف
            </h4>
            <form onSubmit={handleNoteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="field">
                <label>اختر الموظف</label>
                <select value={noteEmpId} onChange={(e) => setNoteEmpId(e.target.value)} required>
                  <option value="">-- اختر الموظف --</option>
                  {employees.filter(isEmployeeActive).map((e) => (
                    <option key={e.id} value={e.id}>
                      {getEmpDisplayName(e)} (كود: {e.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>نص الملاحظة</label>
                <textarea
                  rows="3"
                  placeholder="أدخل الملاحظات السلوكية أو الإدارية..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-start" style={{ alignSelf: 'flex-start' }}>
                💾 حفظ الملاحظة
              </button>
            </form>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                لا توجد ملاحظات مسجلة حتى الآن.
              </div>
            ) : (
              notes.map((note) => {
                const emp = employees.find((e) => e.id === note.employeeId);
                return (
                  <div key={note.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="badge badge-primary">{note.createdRole || 'الإدارة العليا'}</span>
                        <strong style={{ fontSize: '15px' }}>👤 الموظف: {emp ? emp.name : 'غير محدد'} ({emp?.code})</strong>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {new Date(note.createdAt).toLocaleString('ar-EG')}
                      </span>
                    </div>

                    <p style={{ margin: '8px 0 12px 0', fontSize: '14.5px', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                      {note.content}
                    </p>

                    {note.replies && note.replies.length > 0 && (
                      <div style={{ marginTop: '12px', paddingRight: '16px', borderRight: '3px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {note.replies.map((reply) => (
                          <div key={reply.id} style={{ background: 'var(--primary-tint)', padding: '10px 14px', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                              <span>💬 رد: {reply.authorRole}</span>
                              <span>{new Date(reply.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ fontSize: '13.5px', color: 'var(--text)' }}>{reply.content}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="اكتب رداً على هذه الملاحظة..."
                        value={replyTextMap[note.id] || ''}
                        onChange={(e) => setReplyTextMap({ ...replyTextMap, [note.id]: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={() => handleReplySubmit(note.id)}>
                        إرسال الرد
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 4: COMPLAINTS & GRIEVANCES                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'complaints' && (() => {
        const allComplaints = (state.requests || []).filter(r => r.type === 'complaint');

        const filteredComplaints = allComplaints.filter((comp) => {
          const empObj = employees.find(e => String(e.id) === String(comp.employeeId));
          if (complaintFilterStatus === 'pending' && (comp.status === 'resolved' || comp.status === 'closed')) return false;
          if (complaintFilterStatus === 'resolved' && comp.status !== 'resolved') return false;
          if (complaintFilterStatus === 'closed' && comp.status !== 'closed') return false;

          if (complaintBranchFilter !== 'all') {
            const compBranchId = comp.branchId || empObj?.branchId;
            if (String(compBranchId) !== String(complaintBranchFilter)) return false;
          }

          if (complaintSearch.trim()) {
            const q = complaintSearch.toLowerCase();
            const eName = (comp.employeeName || empObj?.name || '').toLowerCase();
            const subj = (comp.subject || '').toLowerCase();
            const det = (comp.details || '').toLowerCase();
            if (!eName.includes(q) && !subj.includes(q) && !det.includes(q)) return false;
          }

          return true;
        });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="🔍 بحث في الشكاوى باسم الموظف أو الموضوع..."
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                style={{ flex: 1, minWidth: '220px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
              />
              <select
                value={complaintFilterStatus}
                onChange={(e) => setComplaintFilterStatus(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff' }}
              >
                <option value="all">جميع الحالات</option>
                <option value="pending">⏳ قيد الانتظار</option>
                <option value="resolved">✅ تم الحل والرد</option>
                <option value="closed">🔒 مغلقة</option>
              </select>
            </div>

            {filteredComplaints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px' }}>
                لا توجد شكاوى مسجلة.
              </div>
            ) : (
              filteredComplaints.map((comp) => {
                const empObj = employees.find(e => String(e.id) === String(comp.employeeId));
                return (
                  <div key={comp.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 2px', fontSize: '15px' }}>{comp.subject}</h4>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          الموظف: <strong>{comp.employeeName || empObj?.name}</strong> (كود: {comp.employeeCode || empObj?.code})
                        </span>
                      </div>
                      <span className={`badge ${comp.status === 'resolved' ? 'badge-success' : 'badge-warning'}`}>
                        {comp.status === 'resolved' ? 'تم الرد' : 'قيد المتابعة'}
                      </span>
                    </div>

                    <p style={{ margin: '8px 0', fontSize: '13.5px', color: 'var(--text)' }}>
                      {comp.details}
                    </p>

                    {comp.adminReply && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', color: '#166534', marginTop: '8px' }}>
                        <strong>رد الإدارة:</strong> {comp.adminReply}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })()}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DIRECT EDIT EVALUATION MODAL (SUPER ADMIN)                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {editingEval && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 14px', fontFamily: 'Cairo', color: '#0f766e', fontSize: '17px' }}>
              ✏️ تعديل تقييم الموظف: {editingEval.employeeName}
            </h3>

            <form onSubmit={handleSaveDirectAdminEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>بنود التقييم والدرجات:</label>
                {editItems.map((item, idx) => (
                  <div key={item.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => setEditItems(editItems.map((it, i) => i === idx ? { ...it, title: e.target.value } : it))}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      max={item.maxScore}
                      value={item.score}
                      onChange={(e) => setEditItems(editItems.map((it, i) => i === idx ? { ...it, score: parseFloat(e.target.value) || 0 } : it))}
                      style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #0d9488', textAlign: 'center', fontWeight: 'bold' }}
                      required
                    />
                    <span style={{ fontSize: '12px', color: '#64748b' }}>/ {item.maxScore}</span>
                  </div>
                ))}
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>ملاحظات مدير الفرع</label>
                <textarea rows="2" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e40af' }}>🏛️ تعليق ورأي الإدارة العليا</label>
                <textarea rows="2" value={editAdminComment} onChange={(e) => setEditAdminComment(e.target.value)} placeholder="رأي الإدارة العليا وتوصياتها..." />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingEval(null)}>إلغاء</button>
                <button type="submit" className="btn btn-start">💾 حفظ التعديلات والاعتماد</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
