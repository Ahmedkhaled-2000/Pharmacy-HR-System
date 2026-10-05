import React, { useState, useMemo } from 'react';
import { getJobsList, getDepartmentsList } from '../../utils/jobsHelper';
import { enqueueNewRequest } from '../../utils/syncEngine';
import { apiSubmitRequestAtomic } from '../../utils/apiClient';
import { emitLiveRequestUpdated } from '../../utils/socketClient';
import { broadcastStateChange } from '../../utils/offlineSync';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';

export default function BranchRecruitmentNeedModal({
  isOpen,
  onClose,
  currentBranch,
  managerEmp,
  state,
  setState,
  saveState,
  showToast
}) {
  const jobsList = useMemo(() => getJobsList(state), [state]);
  const departmentsList = useMemo(() => getDepartmentsList(state), [state]);

  const [selectedJobId, setSelectedJobId] = useState(jobsList[0]?.id || 'job_1');
  const [selectedDepartment, setSelectedDepartment] = useState(jobsList[0]?.department || departmentsList[0] || 'الصيدلية');
  const [customJobTitle, setCustomJobTitle] = useState('');
  const [headcount, setHeadcount] = useState(1);
  const [urgency, setUrgency] = useState('high'); // 'urgent' | 'high' | 'medium' | 'normal'
  const [shiftType, setShiftType] = useState('full'); // 'morning' | 'evening' | 'night' | 'rotational' | 'full'
  const [qualification, setQualification] = useState('بكالوريوس صيدلة');
  const [experienceYears, setExperienceYears] = useState(1);
  const [requirements, setRequirements] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync department when job changes
  const handleJobChange = (e) => {
    const jId = e.target.value;
    setSelectedJobId(jId);
    if (jId === 'custom') {
      return;
    }
    const found = jobsList.find((j) => String(j.id) === String(jId));
    if (found && found.department) {
      setSelectedDepartment(found.department);
      if (found.title.includes('صيدلي')) {
        setQualification('بكالوريوس صيدلة');
      } else if (found.title.includes('كاشير') || found.title.includes('مخزن')) {
        setQualification('مؤهل عالي أو متوسط مناسب');
      } else if (found.title.includes('دليفري')) {
        setQualification('رخصة قيادة سارية ومؤهل متوسط');
      }
    }
  };

  const selectedJobObj = useMemo(() => {
    if (selectedJobId === 'custom') return null;
    return jobsList.find((j) => String(j.id) === String(selectedJobId)) || null;
  }, [jobsList, selectedJobId]);

  const finalJobTitle = useMemo(() => {
    if (selectedJobId === 'custom') return customJobTitle.trim() || 'وظيفة مخصصة';
    return selectedJobObj?.title || 'وظيفة بالفرع';
  }, [selectedJobId, customJobTitle, selectedJobObj]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!finalJobTitle) {
      showToast?.('يرجى تحديد أو إدخال المسمى الوظيفي المطلوب');
      return;
    }

    if (!reason.trim()) {
      showToast?.('يرجى كتابة سبب ومبرر طلب التوظيف');
      return;
    }

    setIsSubmitting(true);
    try {
      const reqId = `req_recruit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const branchId = currentBranch?.id || managerEmp?.branchId || 'main';
      const branchName = currentBranch?.name || 'الفرع';

      const urgencyLabels = {
        urgent: 'عاجل جداً وطارئ (خلال أيام)',
        high: 'أولوية قصوى (خلال أسبوع)',
        medium: 'أولوية متوسطة (خلال أسبوعين إلى شهر)',
        normal: 'أولوية عادية (تخطيط مستقبلي وتوسع)'
      };

      const shiftLabels = {
        morning: 'وردية صباحية',
        evening: 'وردية مسائية',
        night: 'وردية ليلية (سهر)',
        rotational: 'ورديات متناوبة حسب الجدول',
        full: 'دوام كامل (كامل الوردية)'
      };

      const newReq = {
        id: reqId,
        type: 'recruitment_need',
        subType: 'recruitment_need',
        typeLabel: 'طلب احتياج توظيف',
        branchId,
        branchName,
        jobId: selectedJobId,
        jobTitle: finalJobTitle,
        department: selectedDepartment,
        headcount: Math.max(1, parseInt(headcount, 10) || 1),
        urgency,
        urgencyLabel: urgencyLabels[urgency] || urgency,
        shiftType,
        shiftTypeLabel: shiftLabels[shiftType] || shiftType,
        qualification: qualification.trim(),
        experienceYears: Math.max(0, parseInt(experienceYears, 10) || 0),
        requirements: requirements.trim(),
        reason: reason.trim(),
        notes: notes.trim(),
        details: `طلب مدير فرع ${branchName} توظيف عدد (${headcount}) ${finalJobTitle} بالقسم (${selectedDepartment}) | الأولوية: ${urgencyLabels[urgency] || urgency} | الوردية: ${shiftLabels[shiftType] || shiftType} | الخبرة: ${experienceYears} سنة | الشروط: ${requirements.trim() || '—'} | السبب: ${reason.trim()}`,
        submittedByBranchManager: true,
        managerId: managerEmp?.id || null,
        managerName: managerEmp?.name || 'مدير الفرع',
        managerCode: managerEmp?.code || '',
        creatorRole: 'branch',
        status: 'pending_admin',
        branchApproved: true,
        adminApproved: false,
        targetApproval: 'admin_only',
        createdAt: new Date().toISOString()
      };

      const newNotif = {
        id: `notif_${reqId}`,
        requestId: reqId,
        type: 'recruitment_need',
        title: `👥 طلب احتياج توظيف جديد: فرع ${branchName} (${finalJobTitle})`,
        message: `طلب مدير فرع ${branchName} توظيف عدد (${headcount}) ${finalJobTitle} - الأولوية: ${urgencyLabels[urgency] || urgency} - السبب: ${reason.trim()}`,
        employeeId: managerEmp?.id || null,
        employeeName: managerEmp?.name || 'مدير الفرع',
        employeeCode: managerEmp?.code || '',
        branchId,
        branchName,
        date: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: 'admin'
      };

      const updatedRequests = [newReq, ...(state.requests || [])];
      const updatedNotifications = [newNotif, ...(state.notifications || [])];

      const updatedState = {
        ...state,
        requests: updatedRequests,
        notifications: updatedNotifications
      };

      setState(updatedState);
      if (saveState) await saveState(updatedState);

      // Async sync & notifications
      try {
        enqueueNewRequest(newReq).catch(err => console.warn('Outbox enqueue recruitment error:', err));
        apiSubmitRequestAtomic(newReq).catch(err => console.warn('Atomic submit recruitment error:', err));
        emitLiveRequestUpdated(newReq);
        broadcastStateChange('requests', updatedRequests);
        notifyAdminOnNewRequest({
          state: updatedState,
          newRequest: newReq,
          empName: managerEmp?.name || 'مدير الفرع',
          branchName
        });
      } catch (syncErr) {
        console.warn('Sync dispatch error for recruitment request:', syncErr);
      }

      showToast?.('📤 تم إرسال طلب احتياج التوظيف بنجاح إلى الإدارة العليا للاعتماد والدراسة');
      onClose();
    } catch (err) {
      console.error('Error submitting recruitment request:', err);
      showToast?.('حدث خطأ أثناء إرسال طلب التوظيف، يرجى المحاولة ثانية');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 999999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '14px 10px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(850px, 96vw)',
          width: '96%',
          maxHeight: 'calc(100dvh - 30px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0,
          borderRadius: '16px',
          border: '1px solid var(--border)',
          background: 'var(--surface, #ffffff)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(2, 132, 199, 0.04))',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>👥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0369a1' }}>
                طلب احتياج توظيف جديد (إلى الإدارة العليا)
              </h3>
              <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                فرع: <strong>{currentBranch?.name || 'الفرع'}</strong> | مقدم الطلب: {managerEmp?.name || 'مدير الفرع'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '6px 12px', fontSize: '14px' }}
            onClick={onClose}
          >
            ✕ إغلاق
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', WebkitOverflowScrolling: 'touch' }}>
            
            <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: 'var(--muted)', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '8px', lineHeight: 1.4 }}>
              💡 <strong>توجيه إداري:</strong> يتيح هذا النموذج لمدير الفرع رفع طلب رسمي باحتياج كوادر بشرية جديدة لفرعه، مع اختيار المسمى الوظيفي المعتمد من قسم الوظائف والكوادر وتحديد المواصفات والشروط لتتم دراستها فوراً بواسطة الإدارة العامة والموارد البشرية.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              {/* Job Title Selector from Catalog */}
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>الوظيفة المطلوبة (من دليل الوظائف) *</label>
                <select
                  value={selectedJobId}
                  onChange={handleJobChange}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold' }}
                >
                  {jobsList.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — ({j.department || 'عام'})
                    </option>
                  ))}
                  <option value="custom">➕ مسمى وظيفي آخر غير مدرج...</option>
                </select>
                {selectedJobObj?.description && selectedJobId !== 'custom' && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                    وصف الوظيفة: {selectedJobObj.description}
                  </div>
                )}
              </div>

              {/* Custom Job Title Input if needed */}
              {selectedJobId === 'custom' && (
                <div className="field">
                  <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>اكتب المسمى الوظيفي المطلوب *</label>
                  <input
                    type="text"
                    value={customJobTitle}
                    onChange={(e) => setCustomJobTitle(e.target.value)}
                    placeholder="مثال: مسؤول مبيعات تجميل، أخصائي تغذية..."
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                  />
                </div>
              )}

              {/* Department */}
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>القسم التابع له *</label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                >
                  {departmentsList.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Headcount */}
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>العدد المطلوب *</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold' }}
                />
              </div>

              {/* Urgency */}
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>درجة الاستعجال / الأولوية *</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold', color: urgency === 'urgent' ? '#dc2626' : (urgency === 'high' ? '#ea580c' : '#0369a1') }}
                >
                  <option value="urgent">🔴 عاجل جداً وطارئ (خلال أيام)</option>
                  <option value="high">🟠 أولوية قصوى (خلال أسبوع)</option>
                  <option value="medium">🟡 أولوية متوسطة (خلال أسبوعين إلى شهر)</option>
                  <option value="normal">🟢 أولوية عادية (تخطيط مستقبلي وتوسع)</option>
                </select>
              </div>

              {/* Shift Preference */}
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>فترة الوردية المقترحة *</label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                >
                  <option value="full">دوام كامل (وردية كاملة)</option>
                  <option value="morning">وردية صباحية</option>
                  <option value="evening">وردية مسائية</option>
                  <option value="night">وردية ليلية (سهر)</option>
                  <option value="rotational">ورديات متناوبة حسب جدول الفرع</option>
                </select>
              </div>

              {/* Qualification */}
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>المؤهل الدراسي المطلوب</label>
                <input
                  type="text"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="مثال: بكالوريوس صيدلة، مؤهل عالي..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>

              {/* Experience Years */}
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>الخبرة المطلوبة (سنوات)</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>
            </div>

            {/* Requirements & Conditions (The user explicitly emphasized this) */}
            <div className="field" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>
                📋 الشروط والمواصفات الخاصة المطلوبة في المرشح:
              </label>
              <textarea
                rows="3"
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="اكتب الشروط التي يحتاجها مدير الفرع بالتفصيل (مثال: خبرة بنظام الصيدلية، سكن قريب من الفرع، مهارات بيع مستحضرات التجميل، لباقة وحسن مظهر، تحمل ضغط العمل...)"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', lineHeight: 1.5 }}
              />
            </div>

            {/* Reason / Business Justification */}
            <div className="field" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#b91c1c' }}>
                ⚠️ سبب ومبرر احتياج التوظيف بالفرع *
              </label>
              <textarea
                rows="2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: وجود عجز في تغطية الوردية المسائية، استقالة الصيدلي السابق، زيادة ملحوظة في حجم المبيعات تتطلب صيدلي إضافي..."
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', lineHeight: 1.5 }}
              />
            </div>

            {/* Additional Notes */}
            <div className="field">
              <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>ملاحظات وتوصيات إضافية للإدارة العليا</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي توصيات أو اقتراحات أخرى لإدارة الموارد البشرية..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* Sticky Modal Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0
          }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ padding: '8px 18px', fontSize: '13px' }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-start"
              disabled={isSubmitting}
              style={{
                padding: '8px 24px',
                fontSize: '13px',
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isSubmitting ? 'جاري الإرسال...' : '📤 إرسال طلب الاحتياج للإدارة العليا'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
