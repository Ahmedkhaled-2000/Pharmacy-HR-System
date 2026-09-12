import React, { useState, useMemo, useEffect } from 'react';
import { APPLICATION_STATUSES, convertApplicantToEmployeeDraft, calculateEvaluationScore, generateApplicationCode } from '../../utils/recruitmentHelper';
import { getJobsList, getDepartmentsList } from '../../utils/jobsHelper';
import JobVacanciesManager from './JobVacanciesManager';
import ApplicantDetailsModal from './ApplicantDetailsModal';
import ScheduleInterviewModal from './ScheduleInterviewModal';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';
import { useUI } from '../../context/UIContext';

export default function RecruitmentHubModule({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  openAddEmpModalWithDraft
}) {
  const { showConfirm } = useUI();
  const applications = state?.recruitmentApplications || [];
  const branches = state?.branches || [];

  const [activeTab, setActiveTab] = useState('pipeline'); // 'pipeline' | 'vacancies' | 'waiting_list'
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [jobFilter, setJobFilter] = useState('all');

  // Selected applicant for modals
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isAddApplicantModalOpen, setIsAddApplicantModalOpen] = useState(false);

  // Manual Applicant Form State
  const availableJobs = getJobsList(state);
  const availableDepts = getDepartmentsList(state);
  const [manualForm, setManualForm] = useState({
    name: '',
    phone: '',
    nationalId: '',
    targetJobTitle: availableJobs[0]?.title || 'صيدلي',
    department: availableDepts[0] || 'الصيدلية',
    preferredBranchId: '',
    qualification: '',
    experienceYears: '0',
    expectedSalary: '',
    notes: ''
  });

  // ── مزامنة استرجاعية تلقائية: أي مرشح تم تعيينه وأصبح موظفاً نشطاً ينتقل فوراً لـ "تم القبول والتعيين" ──
  useEffect(() => {
    if (!state?.employees || !applications.length) return;
    const employees = state.employees || [];

    let hasChanges = false;
    const updatedApps = applications.map(app => {
      if (app.status === 'hired') return app;

      const cleanAppNid = String(app.nationalId || '').replace(/\D/g, '');
      const cleanAppName = String(app.name || '').trim().toLowerCase();
      const cleanAppPhone = String(app.phone || '').replace(/\D/g, '');

      const matchedEmp = employees.find(emp => {
        if (!emp) return false;
        if (emp.recruitmentApplicationId && String(emp.recruitmentApplicationId) === String(app.id)) return true;
        if (emp.recruitmentApplicationCode && String(emp.recruitmentApplicationCode) === String(app.code)) return true;
        const cleanEmpNid = String(emp.nationalId || '').replace(/\D/g, '');
        if (cleanAppNid && cleanEmpNid && cleanAppNid === cleanEmpNid) return true;
        const cleanEmpName = String(emp.name || '').trim().toLowerCase();
        const cleanEmpPhone = String(emp.phone || '').replace(/\D/g, '');
        if (cleanAppName && cleanEmpName && cleanAppName === cleanEmpName) {
          if (cleanAppPhone && cleanEmpPhone && cleanAppPhone === cleanEmpPhone) return true;
          if (emp.jobTitle && app.targetJobTitle && emp.jobTitle === app.targetJobTitle) return true;
          return true;
        }
        return false;
      });

      if (matchedEmp) {
        hasChanges = true;
        return {
          ...app,
          status: 'hired',
          hiredAt: app.hiredAt || matchedEmp.hireDate || matchedEmp.createdAt || new Date().toISOString(),
          hiredEmployeeId: matchedEmp.id,
          hiredEmployeeCode: matchedEmp.code,
          updatedAt: new Date().toISOString()
        };
      }
      return app;
    });

    if (hasChanges) {
      const updatedState = { ...state, recruitmentApplications: updatedApps };
      if (setState) setState(updatedState);
      if (saveState) saveState(updatedState).catch(() => {});
    }
  }, [state?.employees, applications]);

  // الاستماع لحدث فتح تفاصيل مرشح أو الانتقال التلقائي من الإشعارات
  useEffect(() => {
    const handleSelectApplicant = (e) => {
      const { applicationId, applicantCode, applicantName } = e.detail || {};
      if (!applications || !applications.length) return;
      const targetApp = applications.find(a => 
        (applicationId && String(a.id) === String(applicationId)) ||
        (applicantCode && String(a.code) === String(applicantCode)) ||
        (applicantName && a.name && String(a.name).trim().toLowerCase() === String(applicantName).trim().toLowerCase())
      );
      if (targetApp) {
        setSelectedApplicant(targetApp);
        setIsDetailsModalOpen(true);
        setActiveTab('pipeline');
      }
    };
    window.addEventListener('recruitment:open-applicant', handleSelectApplicant);
    return () => window.removeEventListener('recruitment:open-applicant', handleSelectApplicant);
  }, [applications]);

  // Statistics counters
  const stats = useMemo(() => {
    const total = applications.length;
    const newCount = applications.filter(a => a.status === 'new').length;
    const scheduledCount = applications.filter(a => a.status === 'interview_scheduled').length;
    const interviewedCount = applications.filter(a => a.status === 'interviewed').length;
    const hiredCount = applications.filter(a => a.status === 'hired').length;
    const waitingCount = applications.filter(a => a.status === 'waiting_list').length;
    const rejectedCount = applications.filter(a => a.status === 'rejected').length;

    return {
      total,
      newCount,
      scheduledCount,
      interviewedCount,
      hiredCount,
      waitingCount,
      rejectedCount
    };
  }, [applications]);

  // Unique job titles from applications for filtering
  const availableJobTitles = useMemo(() => {
    const set = new Set();
    applications.forEach(a => {
      if (a.targetJobTitle) set.add(a.targetJobTitle);
    });
    return Array.from(set);
  }, [applications]);

  // Filtered applications
  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      // Tab filter
      if (activeTab === 'waiting_list') {
        if (app.status !== 'waiting_list') return false;
      } else if (activeTab === 'pipeline') {
        if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      }

      // Job Title filter
      if (jobFilter !== 'all' && app.targetJobTitle !== jobFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = (app.name || '').toLowerCase().includes(q);
        const phoneMatch = (app.phone || '').includes(q);
        const codeMatch = (app.code || '').toLowerCase().includes(q);
        const natIdMatch = (app.nationalId || '').includes(q);
        const jobMatch = (app.targetJobTitle || '').toLowerCase().includes(q);
        const qualMatch = (app.qualification || '').toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !codeMatch && !natIdMatch && !jobMatch && !qualMatch) {
          return false;
        }
      }

      return true;
    });
  }, [applications, activeTab, statusFilter, jobFilter, searchQuery]);

  // Open Details Modal
  const handleOpenDetails = (app) => {
    setSelectedApplicant(app);
    setIsDetailsModalOpen(true);
  };

  // Open Schedule Modal
  const handleOpenSchedule = (app) => {
    setSelectedApplicant(app);
    setIsScheduleModalOpen(true);
  };

  // Save Schedule
  const handleSaveSchedule = async (appId, scheduleData) => {
    const updatedApps = applications.map(a => {
      if (a.id === appId) {
        return {
          ...a,
          status: 'interview_scheduled',
          interviewSchedule: scheduleData,
          updatedAt: new Date().toISOString()
        };
      }
      return a;
    });

    const updatedState = { ...state, recruitmentApplications: updatedApps };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('📅 تم حفظ وتأكيد موعد المقابلة بنجاح');
  };

  // Move to Waiting List
  const handleMoveToWaitingList = async (app) => {
    const updatedApps = applications.map(a => {
      if (a.id === app.id) {
        return {
          ...a,
          status: 'waiting_list',
          updatedAt: new Date().toISOString()
        };
      }
      return a;
    });

    const updatedState = { ...state, recruitmentApplications: updatedApps };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (selectedApplicant?.id === app.id) {
      setSelectedApplicant(prev => ({ ...prev, status: 'waiting_list' }));
    }
    showToast?.(`⏳ تم نقل المرشح (${app.name}) إلى قائمة الانتظار / بنك الكفاءات`);
  };

  // Reject Application
  const handleReject = async (app) => {
    const reason = window.prompt('يرجى كتابة سبب رفض الطلب (اختياري):', 'عدم توافق المؤهلات أو الخبرة المطلوبة');
    if (reason === null) return;

    const updatedApps = applications.map(a => {
      if (a.id === app.id) {
        return {
          ...a,
          status: 'rejected',
          rejectionReason: reason || 'مرفوض من الإدارة',
          updatedAt: new Date().toISOString()
        };
      }
      return a;
    });

    const updatedState = { ...state, recruitmentApplications: updatedApps };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (selectedApplicant?.id === app.id) {
      setSelectedApplicant(prev => ({ ...prev, status: 'rejected', rejectionReason: reason }));
    }
    showToast?.(`❌ تم تحديث حالة الطلب إلى مرفوض`);
  };

  // Delete Application
  const handleDelete = async (appId) => {
    const targetApp = applications.find(a => String(a.id) === String(appId));
    const appDisplayName = targetApp?.name || targetApp?.code || 'هذا الطلب';

    const isConfirmed = await showConfirm({
      title: 'حذف طلب التوظيف نهائياً',
      message: `هل أنت متأكد من حذف طلب التعيين الخاص بـ (${appDisplayName}) نهائياً؟ لن يتم استرجاعه حتى مع مزامنة السحابة.`,
      confirmText: 'تأكيد الحذف نهائياً',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;

    // تسجيل معرفات الكيان في قائمة المحذوفات نهائياً (Tombstones) لمنع قيام السحابة بإحيائه
    const deletedKeys = [
      String(appId),
      String(appId).toLowerCase(),
      `app_${appId}`,
      `app_${String(appId).toLowerCase()}`
    ];
    if (targetApp?.code) {
      const codeStr = String(targetApp.code).trim();
      deletedKeys.push(codeStr);
      deletedKeys.push(codeStr.toLowerCase());
      deletedKeys.push(`app_${codeStr}`);
      deletedKeys.push(`app_${codeStr.toLowerCase()}`);
      deletedKeys.push(`app_code_${codeStr.toLowerCase()}`);
    }

    const updatedApps = applications.filter(a => String(a.id) !== String(appId) && (!targetApp?.code || String(a.code) !== String(targetApp.code)));
    const updatedDeletedIds = Array.from(new Set([...(state._deletedIds || []), ...deletedKeys])).filter(Boolean).slice(-3000);

    const updatedState = {
      ...state,
      recruitmentApplications: updatedApps,
      _deletedIds: updatedDeletedIds
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    setIsDetailsModalOpen(false);
    setSelectedApplicant(null);
    showToast?.('🗑️ تم حذف طلب التعيين نهائياً وبنجاح');
  };

  // Manual Add Applicant Handler
  const handleSaveManualApplicant = async (e) => {
    e?.preventDefault();
    const cleanName = (manualForm.name || '').trim();
    if (!cleanName || /^\d+$/.test(cleanName) || cleanName.length < 3) {
      showToast?.('يرجى إدخال اسم مرشح صحيح باللغة العربية (وليس أرقاماً فقط)');
      return;
    }
    const cleanPhone = (manualForm.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      showToast?.('يرجى إدخال رقم هاتف صحيح');
      return;
    }

    const appCode = generateApplicationCode();
    const newApp = {
      id: `app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      code: appCode,
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: cleanName,
      phone: cleanPhone,
      nationalId: (manualForm.nationalId || '').replace(/\D/g, ''),
      targetJobTitle: manualForm.targetJobTitle || 'صيدلي',
      department: manualForm.department || 'الصيدلية',
      preferredBranchId: manualForm.preferredBranchId || '',
      qualification: (manualForm.qualification || '').trim() || 'مؤهل جامعي مناسب',
      experienceYears: String(manualForm.experienceYears || '0'),
      expectedSalary: (manualForm.expectedSalary || '').trim(),
      notes: (manualForm.notes || '').trim()
    };

    const updatedApps = [newApp, ...applications];
    const updatedState = { ...state, recruitmentApplications: updatedApps };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setIsAddApplicantModalOpen(false);
    setManualForm({
      name: '',
      phone: '',
      nationalId: '',
      targetJobTitle: availableJobs[0]?.title || 'صيدلي',
      department: availableDepts[0] || 'الصيدلية',
      preferredBranchId: '',
      qualification: '',
      experienceYears: '0',
      expectedSalary: '',
      notes: ''
    });
    showToast?.(`✅ تم تسجيل طلب التوظيف الجديد للمرشح (${cleanName}) بنجاح`);
  };

  // Update Internal HR Notes
  const handleUpdateNotes = async (appId, notes) => {
    const updatedApps = applications.map(a => {
      if (a.id === appId) {
        return { ...a, notes, updatedAt: new Date().toISOString() };
      }
      return a;
    });

    const updatedState = { ...state, recruitmentApplications: updatedApps };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  // Approve & Hire: Convert Applicant to Employee Draft and open EmployeeFileModal
  const handleApproveAndHire = (applicant) => {
    if (!applicant) return;

    const draftEmp = convertApplicantToEmployeeDraft(applicant, state);
    setIsDetailsModalOpen(false);

    if (openAddEmpModalWithDraft) {
      openAddEmpModalWithDraft(draftEmp, applicant);
    } else {
      showToast?.('تم تحويل بيانات المرشح، جاري فتح ملف الموظف الجديد...');
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('طلبات التعيين');

      sheet.views = [{ rightToLeft: true }];

      mergedTitle(sheet, 'A1:H1', `سجل طلبات التعيين والتوظيف - ${state?.orgSettings?.orgName || ''}`, {
        fillColor: '2563eb',
        fontColor: 'ffffff',
        fontSize: 14
      });

      const headers = [
        'كود الطلب',
        'اسم المرشح',
        'رقم الهاتف',
        'الوظيفة المطلوبة',
        'القسم',
        'المؤهل الدراسي',
        'حالة الطلب',
        'تاريخ التقديم'
      ];

      tableHeaderRow(sheet, headers, { fillColor: '1e293b', fontColor: 'ffffff' });

      filteredApplications.forEach(app => {
        const rowData = [
          app.code || '—',
          app.name || '—',
          app.phone || '—',
          app.targetJobTitle || '—',
          app.department || '—',
          app.qualification || '—',
          APPLICATION_STATUSES[app.status]?.label || app.status,
          new Date(app.createdAt).toLocaleDateString('ar-EG')
        ];
        dataRow(sheet, rowData);
      });

      sheet.columns.forEach(col => {
        col.width = 20;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `سجل_طلبات_التعيين_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast?.('📊 تم تصدير بيانات التعيين إلى ملف Excel بنجاح');
    } catch (err) {
      console.error('Export Excel error:', err);
      showToast?.('حدث خطأ أثناء تصدير ملف Excel');
    }
  };

  return (
    <div className="fade-in" style={{ width: '100%', fontFamily: "'Cairo', 'Tajawal', sans-serif" }}>
      
      {/* ── KPI Summary Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '14px',
        marginBottom: '20px'
      }}>
        {/* Total Applications */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '16px 18px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ color: '#64748b', fontSize: '12.5px', fontWeight: 800 }}>📥 إجمالي الطلبات</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
            {stats.total}
          </div>
        </div>

        {/* New Applications */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #bfdbfe',
          padding: '16px 18px',
          boxShadow: '0 2px 10px rgba(37, 99, 235, 0.04)'
        }}>
          <div style={{ color: '#1d4ed8', fontSize: '12.5px', fontWeight: 800 }}>🆕 طلبات جديدة</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
            {stats.newCount}
          </div>
        </div>

        {/* Scheduled Interviews */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #ddd6fe',
          padding: '16px 18px',
          boxShadow: '0 2px 10px rgba(124, 58, 237, 0.04)'
        }}>
          <div style={{ color: '#6d28d9', fontSize: '12.5px', fontWeight: 800 }}>📅 مقابلات مجدولة</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#7c3aed', marginTop: '4px' }}>
            {stats.scheduledCount}
          </div>
        </div>

        {/* Interviewed */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #fde68a',
          padding: '16px 18px',
          boxShadow: '0 2px 10px rgba(217, 119, 6, 0.04)'
        }}>
          <div style={{ color: '#b45309', fontSize: '12.5px', fontWeight: 800 }}>📋 تمت المقابلة وبانتظار القرار</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#d97706', marginTop: '4px' }}>
            {stats.interviewedCount}
          </div>
        </div>

        {/* Hired */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #a7f3d0',
          padding: '16px 18px',
          boxShadow: '0 2px 10px rgba(5, 150, 105, 0.04)'
        }}>
          <div style={{ color: '#047857', fontSize: '12.5px', fontWeight: 800 }}>✅ تم القبول والتعيين</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
            {stats.hiredCount}
          </div>
        </div>

        {/* Waiting List */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #fed7aa',
          padding: '16px 18px',
          boxShadow: '0 2px 10px rgba(234, 88, 12, 0.04)'
        }}>
          <div style={{ color: '#c2410c', fontSize: '12.5px', fontWeight: 800 }}>⏳ قائمة الانتظار</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>
            {stats.waitingCount}
          </div>
        </div>
      </div>

      {/* ── Sub-Navigation Tabs ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#ffffff',
        padding: '10px 16px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)'
      }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            style={{
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '10px',
              border: activeTab === 'pipeline' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'pipeline' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f8fafc',
              color: activeTab === 'pipeline' ? '#ffffff' : '#334155',
              cursor: 'pointer'
            }}
          >
            <span>📑</span>
            <span>سجل طلبات التعيين ({applications.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vacancies')}
            style={{
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '10px',
              border: activeTab === 'vacancies' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'vacancies' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f8fafc',
              color: activeTab === 'vacancies' ? '#ffffff' : '#334155',
              cursor: 'pointer'
            }}
          >
            <span>💼</span>
            <span>الوظائف المتاحة وشروط التعيين</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('waiting_list')}
            style={{
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '10px',
              border: activeTab === 'waiting_list' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'waiting_list' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f8fafc',
              color: activeTab === 'waiting_list' ? '#ffffff' : '#334155',
              cursor: 'pointer'
            }}
          >
            <span>⏳</span>
            <span>قائمة الانتظار وبنك الكفاءات ({stats.waitingCount})</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setIsAddApplicantModalOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)'
            }}
          >
            <span>➕</span>
            <span>إضافة طلب توظيف يدوي</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>📊</span>
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      {/* ── Tab Content: Vacancies & Requirements ── */}
      {activeTab === 'vacancies' && (
        <JobVacanciesManager
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          executeWithOwnerGuard={executeWithOwnerGuard}
        />
      )}

      {/* ── Tab Content: Applications Pipeline & Waiting List ── */}
      {(activeTab === 'pipeline' || activeTab === 'waiting_list') && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Filters & Search Toolbar */}
          <div style={{
            background: '#ffffff',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)'
          }}>
            {/* Search Input */}
            <div style={{ flex: '1 1 280px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="🔍 بحث بالاسم، رقم الهاتف، الرقم القومي، كود الطلب..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '13.5px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
              />
            </div>

            {/* Filter by Job */}
            {availableJobTitles.length > 0 && (
              <div>
                <select
                  className="form-control"
                  value={jobFilter}
                  onChange={e => setJobFilter(e.target.value)}
                  style={{ padding: '10px 12px', borderRadius: '10px', fontSize: '13px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 600 }}
                >
                  <option value="all">كافة المسميات الوظيفية</option>
                  {availableJobTitles.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Pipeline Status Filter Buttons (only for pipeline tab) */}
            {activeTab === 'pipeline' && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: statusFilter === 'all' ? '#0d9488' : '#f1f5f9',
                    color: statusFilter === 'all' ? '#ffffff' : '#334155',
                    border: statusFilter === 'all' ? 'none' : '1px solid #cbd5e1'
                  }}
                >
                  الكل ({applications.length})
                </button>

                {Object.values(APPLICATION_STATUSES).map(st => {
                  const count = applications.filter(a => a.status === st.id).length;
                  const isSelected = statusFilter === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStatusFilter(st.id)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        background: isSelected ? st.color : st.bgColor,
                        color: isSelected ? '#ffffff' : st.color,
                        border: `1px solid ${isSelected ? st.color : st.borderColor}`
                      }}
                    >
                      {st.icon} {st.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Applications List / Cards */}
          {filteredApplications.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '18px'
            }}>
              {filteredApplications.map(app => {
                const statusCfg = APPLICATION_STATUSES[app.status] || APPLICATION_STATUSES.new;
                const evalData = app.interviewEvaluation;
                const scoreResult = evalData ? calculateEvaluationScore(evalData) : null;

                return (
                  <div
                    key={app.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '18px',
                      border: `1.5px solid ${statusCfg.borderColor}`,
                      padding: '22px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <div>
                      {/* Top Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {app.photoUrl ? (
                            <img src={app.photoUrl} alt="Photo" style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover', border: '1.5px solid #cbd5e1' }} />
                          ) : (
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '12px',
                              background: statusCfg.bgColor,
                              color: statusCfg.color,
                              fontSize: '18px',
                              fontWeight: 900,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: `1px solid ${statusCfg.borderColor}`
                            }}>
                              {app.name.charAt(0)}
                            </div>
                          )}

                          <div>
                            <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                              {app.name}
                            </h4>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                              كود: <span style={{ fontFamily: 'monospace', color: '#d97706', fontWeight: 800 }}>{app.code}</span>
                            </div>
                          </div>
                        </div>

                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          background: statusCfg.bgColor,
                          color: statusCfg.color,
                          border: `1px solid ${statusCfg.borderColor}`
                        }}>
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                      </div>

                      {/* Job & Qualifications Info Box */}
                      <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>الوظيفة المطلوبة:</span>
                          <strong style={{ color: '#0284c7' }}>{app.targetJobTitle} ({app.department})</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>الهاتف:</span>
                          <span style={{ color: '#0f172a', fontWeight: 800, direction: 'ltr' }}>{app.phone}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>المؤهل والخبرة:</span>
                          <span style={{ color: '#334155', fontWeight: 600 }}>{app.qualification || '—'} ({app.experienceYears || '0'} سنين)</span>
                        </div>
                      </div>

                      {/* Evaluation Score Badge if available */}
                      {evalData && (
                        <div style={{
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          fontSize: '12.5px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }}>
                          <div style={{ color: '#065f46' }}>
                            ⭐️ <strong>تقييم المقابلة:</strong> <span style={{ color: '#047857', fontWeight: 900 }}>{scoreResult?.percentage}%</span> ({evalData.interviewerName})
                          </div>
                          <span style={{ fontSize: '11px', color: evalData.recommendation === 'recommended' ? '#047857' : (evalData.recommendation === 'waiting_list' ? '#b45309' : '#b91c1c'), fontWeight: 800 }}>
                            {evalData.recommendation === 'recommended' ? '🟢 موصى به' : (evalData.recommendation === 'waiting_list' ? '⏳ انتظار' : '❌ مرفوض')}
                          </span>
                        </div>
                      )}

                      {/* Interview Schedule Details if scheduled */}
                      {app.interviewSchedule && (
                        <div style={{
                          background: '#f5f3ff',
                          border: '1px solid #ddd6fe',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          color: '#5b21b6',
                          marginBottom: '8px',
                          fontWeight: 700
                        }}>
                          📅 المقابلة: <strong>{app.interviewSchedule.date}</strong> في <strong>{app.interviewSchedule.time}</strong> ({app.interviewSchedule.locationLabel})
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(app)}
                        style={{ padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                      >
                        👁️ استعراض الملف
                      </button>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {app.status === 'hired' ? (
                          <span
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 900,
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>✅</span>
                            <span>تم التعيين كموظف</span>
                            {app.hiredEmployeeCode && <span style={{ opacity: 0.85, fontSize: '11px' }}>({app.hiredEmployeeCode})</span>}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleApproveAndHire(app)}
                            style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 900, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}
                            title="الموافقة والتعيين الفوري بملف الموظف"
                          >
                            ✅ تعيين
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenSchedule(app)}
                          style={{ padding: '7px 11px', borderRadius: '8px', fontSize: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', cursor: 'pointer' }}
                          title="جدولة موعد مقابلة"
                        >
                          📅
                        </button>

                        <a
                          href={`https://wa.me/2${app.whatsappPhone || app.phone}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '7px 11px', borderRadius: '8px', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                          title="مراسلة واتساب"
                        >
                          💬
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDelete(app.id)}
                          style={{
                            padding: '7px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                          }}
                          title="حذف طلب التعيين نهائياً"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '48px 20px',
              textAlign: 'center',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📂</div>
              <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '18px', fontWeight: 900 }}>
                لا توجد طلبات تعيين تطابق شروط البحث الحالية
              </h4>
              <p style={{ color: '#64748b', fontSize: '13.5px', margin: '0 0 16px', fontWeight: 600 }}>
                {activeTab === 'waiting_list'
                  ? 'لم يتم نقل أي مرشح إلى قائمة الانتظار بعد.'
                  : 'يمكنك مشاركة رابط التقديم (/careers) لاستقبال طلبات المتقدمين الجدد.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {/* 1. Applicant Details Modal */}
      {isDetailsModalOpen && selectedApplicant && (
        <ApplicantDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          applicant={selectedApplicant}
          branches={branches}
          onOpenScheduleModal={(app) => {
            setIsDetailsModalOpen(false);
            handleOpenSchedule(app);
          }}
          onApproveAndHire={handleApproveAndHire}
          onMoveToWaitingList={handleMoveToWaitingList}
          onReject={handleReject}
          onDelete={handleDelete}
          onUpdateNotes={handleUpdateNotes}
          showToast={showToast}
        />
      )}

      {/* 2. Schedule Interview Modal */}
      {isScheduleModalOpen && selectedApplicant && (
        <ScheduleInterviewModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          applicant={selectedApplicant}
          branches={branches}
          onSchedule={handleSaveSchedule}
          showToast={showToast}
        />
      )}

      {/* 3. Manual Add Applicant Modal */}
      {isAddApplicantModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            border: '1px solid #e2e8f0',
            fontFamily: "'Cairo', 'Tajawal', sans-serif"
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                  ➕ تسجيل طلب توظيف يدوي جديد
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  إدخال بيانات مرشح جديد مباشرة من داخل النظام وإضافته لسجل التوظيف
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddApplicantModalOpen(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', fontSize: '16px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveManualApplicant} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    اسم المرشح بالكامل *
                  </label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="مثال: أحمد محمد علي حسن"
                    value={manualForm.name}
                    onChange={e => setManualForm(prev => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13.5px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    رقم الهاتف المحمول *
                  </label>
                  <input
                    type="tel"
                    required
                    className="form-control"
                    placeholder="01xxxxxxxxx"
                    value={manualForm.phone}
                    onChange={e => setManualForm(prev => ({ ...prev, phone: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13.5px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الرقم القومي (اختياري - 14 رقم)
                  </label>
                  <input
                    type="text"
                    maxLength={14}
                    className="form-control"
                    placeholder="2xxxxxxxxxxxxx"
                    value={manualForm.nationalId}
                    onChange={e => setManualForm(prev => ({ ...prev, nationalId: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13.5px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الوظيفة المطلوبة *
                  </label>
                  <select
                    className="form-control"
                    value={manualForm.targetJobTitle}
                    onChange={e => setManualForm(prev => ({ ...prev, targetJobTitle: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13px', fontWeight: 700 }}
                  >
                    {availableJobs.map(j => (
                      <option key={j.id || j.title} value={j.title}>{j.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    القسم
                  </label>
                  <select
                    className="form-control"
                    value={manualForm.department}
                    onChange={e => setManualForm(prev => ({ ...prev, department: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13px', fontWeight: 600 }}
                  >
                    {availableDepts.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الفرع المفضل
                  </label>
                  <select
                    className="form-control"
                    value={manualForm.preferredBranchId}
                    onChange={e => setManualForm(prev => ({ ...prev, preferredBranchId: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13px', fontWeight: 600 }}
                  >
                    <option value="">أي فرع متاح</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    المؤهل الدراسي والتخصص
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="مثال: بكالوريوس صيدلة - جامعة الإسكندرية"
                    value={manualForm.qualification}
                    onChange={e => setManualForm(prev => ({ ...prev, qualification: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    سنوات الخبرة السابقة
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    className="form-control"
                    value={manualForm.experienceYears}
                    onChange={e => setManualForm(prev => ({ ...prev, experienceYears: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الراتب المتوقع (ج.م)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="مثال: 6500"
                    value={manualForm.expectedSalary}
                    onChange={e => setManualForm(prev => ({ ...prev, expectedSalary: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    ملاحظات المقابلة أو الاستقبال
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="أي ملاحظات مبدئية عن المرشح..."
                    value={manualForm.notes}
                    onChange={e => setManualForm(prev => ({ ...prev, notes: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddApplicantModalOpen(false)}
                  style={{ padding: '9px 18px', borderRadius: '10px', fontSize: '13.5px', fontWeight: 700, background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 24px',
                    borderRadius: '10px',
                    fontSize: '13.5px',
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)'
                  }}
                >
                  💾 حفظ وتسجيل الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
