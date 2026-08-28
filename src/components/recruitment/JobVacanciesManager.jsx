import React, { useState } from 'react';
import QRCode from 'qrcode';
import { DEFAULT_JOBS, getJobsList, DEFAULT_DEPARTMENTS, getDepartmentsList } from '../../utils/jobsHelper';
import { DEFAULT_VACANCIES } from '../../utils/recruitmentHelper';

export default function JobVacanciesManager({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const jobsList = getJobsList(state);
  const departmentsList = getDepartmentsList(state);
  const branches = state?.branches || [];

  const rawVacancies = state?.jobVacancies && Array.isArray(state.jobVacancies) && state.jobVacancies.length > 0
    ? state.jobVacancies
    : DEFAULT_VACANCIES;

  const [vacancies, setVacancies] = useState(rawVacancies);

  // Edit / Create Vacancy Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingVac, setEditingVac] = useState(null);

  const [jobTitle, setJobTitle] = useState(jobsList[0]?.title || 'صيدلي');
  const [department, setDepartment] = useState(departmentsList[0] || 'الصيدلية');
  const [openingsCount, setOpeningsCount] = useState(1);
  const [qualificationRequired, setQualificationRequired] = useState('');
  const [minExperienceYears, setMinExperienceYears] = useState(0);
  const [description, setDescription] = useState('');
  const [requirementsInput, setRequirementsInput] = useState('');
  const [isActive, setIsActive] = useState(true);

  // QR Code Modal State
  const [qrModal, setQrModal] = useState({ isOpen: false, url: '', title: '' });
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Public Links
  const publicApplyUrl = `${window.location.origin}/careers`;
  const interviewerPortalUrl = `${window.location.origin}/interview`;

  // Open QR Code Modal
  const handleOpenQrModal = async (url, title) => {
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2 });
      setQrDataUrl(dataUrl);
      setQrModal({ isOpen: true, url, title });
    } catch (err) {
      console.error('QR code generation error:', err);
    }
  };

  // Open Create Modal
  const handleOpenAddModal = () => {
    setEditingVac(null);
    setJobTitle(jobsList[0]?.title || 'صيدلي');
    setDepartment(departmentsList[0] || 'الصيدلية');
    setOpeningsCount(1);
    setQualificationRequired('');
    setMinExperienceYears(0);
    setDescription('');
    setRequirementsInput('');
    setIsActive(true);
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (vac) => {
    setEditingVac(vac);
    setJobTitle(vac.jobTitle || jobsList[0]?.title || 'صيدلي');
    setDepartment(vac.department || departmentsList[0] || 'الصيدلية');
    setOpeningsCount(vac.openingsCount || 1);
    setQualificationRequired(vac.qualificationRequired || '');
    setMinExperienceYears(vac.minExperienceYears || 0);
    setDescription(vac.description || '');
    setRequirementsInput(Array.isArray(vac.requirements) ? vac.requirements.join('\n') : (vac.requirements || ''));
    setIsActive(vac.isActive !== false);
    setShowModal(true);
  };

  // Save Vacancy
  const handleSaveVacancy = async (e) => {
    e.preventDefault();
    if (!jobTitle.trim()) {
      showToast?.('يرجى اختيار المسمى الوظيفي');
      return;
    }

    const requirementsArray = requirementsInput
      .split('\n')
      .map(r => r.trim())
      .filter(Boolean);

    const vacPayload = {
      id: editingVac ? editingVac.id : `vac_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      jobTitle: jobTitle.trim(),
      department: department.trim(),
      openingsCount: parseInt(openingsCount, 10) || 1,
      qualificationRequired: qualificationRequired.trim(),
      minExperienceYears: parseInt(minExperienceYears, 10) || 0,
      description: description.trim(),
      requirements: requirementsArray,
      isActive: Boolean(isActive),
      createdAt: editingVac?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let updatedList = [];
    if (editingVac) {
      updatedList = vacancies.map(v => v.id === editingVac.id ? vacPayload : v);
    } else {
      updatedList = [vacPayload, ...vacancies];
    }

    const performSave = async () => {
      setVacancies(updatedList);
      const updatedState = { ...state, jobVacancies: updatedList };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      setShowModal(false);
      showToast?.(editingVac ? '✅ تم تحديث بيانات الوظيفة الشاغرة' : '✅ تم إضافة وظيفة شاغرة جديدة ونشرها');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockManageJobs',
        actionTitle: editingVac ? 'تعديل وظيفة شاغرة' : 'إضافة وظيفة شاغرة جديدة',
        actionDetails: `نشر/تعديل شاغر ${vacPayload.jobTitle}`,
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  // Toggle Active Status
  const handleToggleActive = async (vacId) => {
    const updatedList = vacancies.map(v => {
      if (v.id === vacId) {
        return { ...v, isActive: !v.isActive, updatedAt: new Date().toISOString() };
      }
      return v;
    });

    setVacancies(updatedList);
    const updatedState = { ...state, jobVacancies: updatedList };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🔄 تم تحديث حالة الشاغر الوظيفي');
  };

  // Delete Vacancy
  const handleDeleteVacancy = async (vacId, title) => {
    if (!window.confirm(`هل أنت متأكد من حذف الوظيفة الشاغرة (${title}) نهائياً؟`)) return;

    const updatedList = vacancies.filter(v => v.id !== vacId);
    setVacancies(updatedList);
    const updatedState = { ...state, jobVacancies: updatedList };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف الوظيفة الشاغرة');
  };

  const allowGeneralApplication = state?.recruitmentSettings?.allowGeneralApplication !== false;

  const handleToggleGeneralApplication = async () => {
    const newVal = !allowGeneralApplication;
    const updatedSettings = {
      ...(state?.recruitmentSettings || {}),
      allowGeneralApplication: newVal
    };
    const updatedState = {
      ...state,
      recruitmentSettings: updatedSettings
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(newVal ? '🟢 تم تفعيل التقديم العام في صفحة الوظائف (/careers)' : '🔴 تم إيقاف التقديم العام (التقديم مقتصر على الشواغر المعلنة فقط)');
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Cairo', 'Tajawal', sans-serif" }}>
      
      {/* ── Top Shareable Links & Settings Banner ── */}
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔗</span>
              <span>روابط التوظيف والمقابلات السريعة</span>
            </h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '13.5px', fontWeight: 600 }}>
              شارك رابط التقديم العام مع المرشحين، أو رابط المقابلات مع مديري الفروع ورؤساء الأقسام.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* Public Candidate Apply Link */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(publicApplyUrl);
                  showToast?.('📋 تم نسخ رابط تقديم المرشحين العام (/careers)');
                }}
                style={{
                  background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
                }}
              >
                <span>📋 نسخ رابط التقديم (/careers)</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenQrModal(publicApplyUrl, 'رابط تقديم المرشحين للوظائف')}
                title="عرض رمز الاستجابة السريعة QR"
                style={{
                  background: '#f0fdfa',
                  color: '#0f766e',
                  border: '1px solid #ccfbf1',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                📱 QR
              </button>
            </div>

            {/* Interviewer Portal Link */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(interviewerPortalUrl);
                  showToast?.('📋 تم نسخ رابط القائم بالمقابلة (/interview)');
                }}
                style={{
                  background: '#f8fafc',
                  color: '#334155',
                  border: '1.5px solid #cbd5e1',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <span>⭐️ نسخ رابط المقابلات (/interview)</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenQrModal(interviewerPortalUrl, 'رابط بوابة القائم بالمقابلة')}
                title="عرض رمز الاستجابة السريعة QR"
                style={{
                  background: '#f8fafc',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                📱 QR
              </button>
            </div>
          </div>
        </div>

        {/* General Application Status Bar */}
        <div style={{
          background: allowGeneralApplication ? '#f0fdfa' : '#fff1f2',
          border: `1px solid ${allowGeneralApplication ? '#ccfbf1' : '#fecdd3'}`,
          borderRadius: '14px',
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>{allowGeneralApplication ? '🟢' : '🔴'}</span>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: allowGeneralApplication ? '#0f766e' : '#9f1239' }}>
                {allowGeneralApplication
                  ? 'التقديم العام مفعل: يمكن للمرشحين التقديم على كافة التخصصات عبر زر التقديم العام في صفحة الوظائف.'
                  : 'التقديم العام موقوف: تم إخفاء زر التقديم العام، والتقديم متاح حصرياً على الشواغر المحددة والمعلنة بالأسفل.'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleGeneralApplication}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: allowGeneralApplication ? '#ffffff' : '#e11d48',
              color: allowGeneralApplication ? '#0f766e' : '#ffffff',
              border: allowGeneralApplication ? '1.5px solid #0d9488' : 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
            }}
          >
            {allowGeneralApplication ? '⏸️ إيقاف التقديم العام' : '▶️ تفعيل التقديم العام'}
          </button>
        </div>
      </div>

      {/* ── Vacancies Grid Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#0f172a' }}>
            💼 إدارة الوظائف الشاغرة وشروط التعيين ({vacancies.length})
          </h3>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
            تحديد المتطلبات والمؤهلات المطلوبة لكل مسمى وظيفي لجلبها في بوابة التقديم
          </span>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          style={{
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '11px',
            fontWeight: 900,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
          }}
        >
          <span>➕</span>
          <span>إضافة وظيفة شاغرة جديدة</span>
        </button>
      </div>

      {/* ── Vacancies Cards Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
        gap: '18px'
      }}>
        {vacancies.map(vac => (
          <div
            key={vac.id}
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              border: `1.5px solid ${vac.isActive !== false ? '#ccfbf1' : '#e2e8f0'}`,
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
              opacity: vac.isActive !== false ? 1 : 0.7,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
              transition: 'transform 0.15s ease'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{
                  padding: '3px 10px',
                  background: '#f0fdfa',
                  color: '#0f766e',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  border: '1px solid #ccfbf1'
                }}>
                  {vac.department || 'الصيدلية'}
                </span>

                <button
                  type="button"
                  onClick={() => handleToggleActive(vac.id)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: vac.isActive !== false ? '#ecfdf5' : '#fef2f2',
                    color: vac.isActive !== false ? '#047857' : '#b91c1c',
                    border: `1px solid ${vac.isActive !== false ? '#a7f3d0' : '#fecaca'}`
                  }}
                  title="تغيير حالة التقديم"
                >
                  {vac.isActive !== false ? '🟢 مفتوح للتقديم' : '🔴 مغلق مؤقتاً'}
                </button>
              </div>

              <h4 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                {vac.jobTitle}
              </h4>

              <p style={{ margin: '0 0 12px', color: '#475569', fontSize: '13px', lineHeight: '1.6' }}>
                {vac.description || 'لا يوجد وصف مدون.'}
              </p>

              {/* High-contrast Info Box */}
              <div style={{
                background: '#f8fafc',
                padding: '12px 14px',
                borderRadius: '12px',
                fontSize: '12.5px',
                color: '#1e293b',
                border: '1px solid #e2e8f0',
                marginBottom: '12px'
              }}>
                <div style={{ marginBottom: '6px' }}>
                  🎓 <strong>المؤهل:</strong> {vac.qualificationRequired || 'مؤهل مناسب'}
                </div>
                <div>
                  ⏳ <strong>الخبرة:</strong> {vac.minExperienceYears ? `${vac.minExperienceYears} سنوات فأكثر` : 'مبتدئ أو ذو خبرة'} · 👥 <strong>المطلوب:</strong> {vac.openingsCount || 1}
                </div>
              </div>

              {Array.isArray(vac.requirements) && vac.requirements.length > 0 && (
                <ul style={{ margin: 0, paddingRight: '16px', fontSize: '12px', color: '#334155', lineHeight: '1.6' }}>
                  {vac.requirements.slice(0, 3).map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
              <button
                type="button"
                onClick={() => handleOpenEditModal(vac)}
                style={{
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                ✏️ تعديل الشروط
              </button>
              <button
                type="button"
                onClick={() => handleDeleteVacancy(vac.id, vac.jobTitle)}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  color: '#ef4444',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  cursor: 'pointer'
                }}
                title="حذف الشاغر"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Add / Edit Vacancy Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 1100 }}>
          <div
            className="modal-card fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '600px',
              width: '95%',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.15)',
              fontFamily: "'Cairo', 'Tajawal', sans-serif"
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#0f172a' }}>
                {editingVac ? '✏️ تعديل شروط الوظيفة الشاغرة' : '➕ إضافة وظيفة شاغرة جديدة'}
              </h3>
              <button type="button" className="close-btn" onClick={() => setShowModal(false)} style={{ fontSize: '18px' }}>✕</button>
            </div>

            <form onSubmit={handleSaveVacancy} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    المسمى الوظيفي (من وظائف المؤسسة) *
                  </label>
                  <select
                    className="form-control"
                    value={jobTitle}
                    onChange={e => {
                      const val = e.target.value;
                      setJobTitle(val);
                      const matched = jobsList.find(j => j.title === val);
                      if (matched && matched.department) setDepartment(matched.department);
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    required
                  >
                    {jobsList.map(j => (
                      <option key={j.id || j.title} value={j.title}>{j.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    القسم التابع له *
                  </label>
                  <select
                    className="form-control"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    required
                  >
                    {departmentsList.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    عدد الشواغر المطلوبة
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={openingsCount}
                    onChange={e => setOpeningsCount(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الحد الأدنى لسنوات الخبرة
                  </label>
                  <select
                    className="form-control"
                    value={minExperienceYears}
                    onChange={e => setMinExperienceYears(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  >
                    <option value="0">حديث تخرج (بدون خبرة)</option>
                    <option value="1">سنة واحدة</option>
                    <option value="2">سنتان</option>
                    <option value="3">3 سنوات</option>
                    <option value="5">5 سنوات فأكثر</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  المؤهل الدراسي المطلوب *
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="مثال: بكالوريوس صيدلة مع ترخيص مزاولة المهنة"
                  value={qualificationRequired}
                  onChange={e => setQualificationRequired(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  الوصف الوظيفي والمهام
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="اكتب نبذة عن المسؤوليات اليومية للوظيفة..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  شروط ومتطلبات التعيين (اكتب كل شرط في سطر مستقل)
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="شرط 1&#10;شرط 2&#10;شرط 3"
                  value={requirementsInput}
                  onChange={e => setRequirementsInput(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="vac_active_check"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="vac_active_check" style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                  إتاحة هذه الوظيفة للتقديم المباشر في بوابة الوظائف (/careers)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} style={{ padding: '8px 18px', borderRadius: '8px' }}>
                  إلغاء
                </button>
                <button type="submit" style={{ padding: '8px 24px', fontWeight: 900, background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  💾 حفظ الشاغر الوظيفي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── QR Code Modal ── */}
      {qrModal.isOpen && (
        <div className="modal-overlay" onClick={() => setQrModal({ isOpen: false, url: '', title: '' })} style={{ zIndex: 1150 }}>
          <div
            className="modal-card fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '380px',
              width: '90%',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              textAlign: 'center',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.15)',
              fontFamily: "'Cairo', 'Tajawal', sans-serif"
            }}
          >
            <h4 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>{qrModal.title}</h4>
            <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '16px' }}>امسح الرمز بالجوال لفتح الرابط مباشرة</span>

            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR Code"
                style={{ width: '220px', height: '220px', borderRadius: '12px', margin: '0 auto 16px', background: '#fff', padding: '8px', border: '1px solid #e2e8f0' }}
              />
            )}

            <div style={{ fontSize: '12px', color: '#0284c7', wordBreak: 'break-all', marginBottom: '16px', fontFamily: 'monospace', fontWeight: 700 }}>
              {qrModal.url}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(qrModal.url);
                  showToast?.('📋 تم نسخ الرابط بنجاح');
                }}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', background: '#0d9488', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}
              >
                📋 نسخ الرابط
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setQrModal({ isOpen: false, url: '', title: '' })}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
