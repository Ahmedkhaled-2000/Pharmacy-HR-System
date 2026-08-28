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

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── Top Shareable Links Banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(15, 23, 42, 0.8))',
        borderRadius: '20px',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        padding: '22px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔗</span>
            <span>روابط التوظيف والمقابلات السريعة</span>
          </h4>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: '13.5px' }}>
            شارك رابط التقديم العام مع المرشحين، أو رابط المقابلات مع مديري الفروع ورؤساء الأقسام.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* Public Candidate Apply Link */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-start"
              onClick={() => {
                navigator.clipboard?.writeText(publicApplyUrl);
                showToast?.('📋 تم نسخ رابط تقديم المرشحين العام (/careers)');
              }}
              style={{ padding: '8px 16px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>📋 نسخ رابط التقديم (/careers)</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => handleOpenQrModal(publicApplyUrl, 'رابط تقديم المرشحين للوظائف')}
              title="عرض رمز الاستجابة السريعة QR"
              style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '14px' }}
            >
              📱 QR
            </button>
          </div>

          {/* Interviewer Portal Link */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                navigator.clipboard?.writeText(interviewerPortalUrl);
                showToast?.('📋 تم نسخ رابط القائم بالمقابلة (/interview)');
              }}
              style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '8px 16px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>⭐️ نسخ رابط المقابلات (/interview)</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => handleOpenQrModal(interviewerPortalUrl, 'رابط بوابة القائم بالمقابلة')}
              title="عرض رمز الاستجابة السريعة QR"
              style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '14px' }}
            >
              📱 QR
            </button>
          </div>
        </div>
      </div>

      {/* ── Vacancies Grid Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--text, #fff)' }}>
            💼 إدارة الوظائف الشاغرة وشروط التعيين ({vacancies.length})
          </h3>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            تحديد المتطلبات والمؤهلات المطلوبة لكل مسمى وظيفي لجلبها في بوابة التقديم
          </span>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="btn btn-start"
          style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>➕</span>
          <span>إضافة وظيفة شاغرة جديدة</span>
        </button>
      </div>

      {/* ── Vacancies Cards Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '18px'
      }}>
        {vacancies.map(vac => (
          <div
            key={vac.id}
            style={{
              background: 'var(--surface, #1e293b)',
              borderRadius: '16px',
              border: `1px solid ${vac.isActive !== false ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
              opacity: vac.isActive !== false ? 1 : 0.65,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{
                  padding: '3px 10px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700
                }}>
                  {vac.department || 'الصيدلية'}
                </span>

                <button
                  type="button"
                  onClick={() => handleToggleActive(vac.id)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: vac.isActive !== false ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: vac.isActive !== false ? '#10b981' : '#ef4444',
                    border: 'none'
                  }}
                  title="تغيير حالة التقديم"
                >
                  {vac.isActive !== false ? '🟢 مفتوح للتقديم' : '🔴 مغلق مؤقتاً'}
                </button>
              </div>

              <h4 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: 'var(--text, #fff)' }}>
                {vac.jobTitle}
              </h4>

              <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '13px', lineHeight: '1.6' }}>
                {vac.description || 'لا يوجد وصف مدون.'}
              </p>

              <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '10px 12px', borderRadius: '10px', fontSize: '12px', color: '#cbd5e1', marginBottom: '10px' }}>
                <div style={{ marginBottom: '4px' }}>🎓 <strong>المؤهل:</strong> {vac.qualificationRequired || 'مؤهل مناسب'}</div>
                <div>⏳ <strong>الخبرة:</strong> {vac.minExperienceYears ? `${vac.minExperienceYears} سنوات فأكثر` : 'مبتدئ أو ذو خبرة'} · 👥 <strong>المطلوب:</strong> {vac.openingsCount || 1}</div>
              </div>

              {Array.isArray(vac.requirements) && vac.requirements.length > 0 && (
                <ul style={{ margin: 0, paddingRight: '16px', fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                  {vac.requirements.slice(0, 3).map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleOpenEditModal(vac)}
                style={{ padding: '6px 12px', fontSize: '12.5px', borderRadius: '8px' }}
              >
                ✏️ تعديل الشروط
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleDeleteVacancy(vac.id, vac.jobTitle)}
                style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '8px', color: '#ef4444' }}
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
              background: 'var(--surface, #1e293b)',
              borderRadius: '20px',
              padding: '24px',
              fontFamily: "'Tajawal', 'Cairo', sans-serif"
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--text)' }}>
                {editingVac ? '✏️ تعديل شروط الوظيفة الشاغرة' : '➕ إضافة وظيفة شاغرة جديدة'}
              </h3>
              <button type="button" className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveVacancy} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
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
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px' }}
                    required
                  >
                    {jobsList.map(j => (
                      <option key={j.id || j.title} value={j.title}>{j.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    القسم التابع له *
                  </label>
                  <select
                    className="form-control"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px' }}
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
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    عدد الشواغر المطلوبة
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={openingsCount}
                    onChange={e => setOpeningsCount(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    الحد الأدنى لسنوات الخبرة
                  </label>
                  <select
                    className="form-control"
                    value={minExperienceYears}
                    onChange={e => setMinExperienceYears(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px' }}
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  المؤهل الدراسي المطلوب *
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="مثال: بكالوريوس صيدلة مع ترخيص مزاولة المهنة"
                  value={qualificationRequired}
                  onChange={e => setQualificationRequired(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  الوصف الوظيفي والمهام
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="اكتب نبذة عن المسؤوليات اليومية للوظيفة..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  شروط ومتطلبات التعيين (اكتب كل شرط في سطر مستقل)
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="شرط 1&#10;شرط 2&#10;شرط 3"
                  value={requirementsInput}
                  onChange={e => setRequirementsInput(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px' }}
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
                <label htmlFor="vac_active_check" style={{ fontSize: '13.5px', fontWeight: 700, color: '#cbd5e1', cursor: 'pointer' }}>
                  إتاحة هذه الوظيفة للتقديم المباشر في بوابة الوظائف (/careers)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-start" style={{ padding: '8px 24px', fontWeight: 800 }}>
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
              background: 'var(--surface, #1e293b)',
              borderRadius: '20px',
              padding: '24px',
              textAlign: 'center',
              fontFamily: "'Tajawal', 'Cairo', sans-serif"
            }}
          >
            <h4 style={{ margin: '0 0 6px', fontSize: '17px', color: '#fff' }}>{qrModal.title}</h4>
            <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '16px' }}>امسح الرمز بالجوال لفتح الرابط مباشرة</span>

            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR Code"
                style={{ width: '220px', height: '220px', borderRadius: '12px', margin: '0 auto 16px', background: '#fff', padding: '8px' }}
              />
            )}

            <div style={{ fontSize: '12px', color: '#38bdf8', wordBreak: 'break-all', marginBottom: '16px', fontFamily: 'monospace' }}>
              {qrModal.url}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-start"
                onClick={() => {
                  navigator.clipboard?.writeText(qrModal.url);
                  showToast?.('📋 تم نسخ الرابط بنجاح');
                }}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
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
