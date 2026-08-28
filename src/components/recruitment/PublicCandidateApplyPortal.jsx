import React, { useState, useMemo } from 'react';
import { compressImage } from '../../utils/imageCompressor';
import { DEFAULT_JOBS, getJobsList, DEFAULT_DEPARTMENTS, getDepartmentsList } from '../../utils/jobsHelper';
import { DEFAULT_VACANCIES, generateApplicationCode, APPLICATION_STATUSES } from '../../utils/recruitmentHelper';

export default function PublicCandidateApplyPortal({
  state,
  setState,
  saveState,
  showToast,
  themeMode,
  toggleTheme
}) {
  const orgSettings = state?.orgSettings || {};
  const orgName = orgSettings.orgName || 'صيدليات مداواة';
  const logoUrl = orgSettings.logoUrl || '';

  const jobsList = getJobsList(state);
  const departmentsList = getDepartmentsList(state);
  const branches = state?.branches || [];

  // Active vacancies list
  const activeVacancies = useMemo(() => {
    if (state?.jobVacancies && Array.isArray(state.jobVacancies) && state.jobVacancies.length > 0) {
      return state.jobVacancies.filter(v => v.isActive !== false);
    }
    return DEFAULT_VACANCIES.filter(v => v.isActive !== false);
  }, [state?.jobVacancies]);

  // Selected vacancy to apply for
  const [selectedVacancy, setSelectedVacancy] = useState(null);
  const [currentStep, setCurrentStep] = useState(1); // 1: Job & Branch, 2: Personal, 3: Contact, 4: Education & Exp, 5: Docs & Submit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState(null);

  // Form Fields
  const [targetJobTitle, setTargetJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [preferredBranchId, setPreferredBranchId] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [availableStartDate, setAvailableStartDate] = useState('');
  const [contractTypePreference, setContractTypePreference] = useState('دوام كامل');

  // Personal Info
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('ذكر');
  const [maritalStatus, setMaritalStatus] = useState('أعزب');
  const [address, setAddress] = useState('');

  // Contact Info
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [relativePhone, setRelativePhone] = useState('');
  const [email, setEmail] = useState('');

  // Qualification & Experience
  const [qualification, setQualification] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [university, setUniversity] = useState('');
  const [grade, setGrade] = useState('جيد');
  const [experienceYears, setExperienceYears] = useState('0');
  const [previousExperience, setPreviousExperience] = useState('');
  const [skills, setSkills] = useState('');

  // Uploaded Documents (base64)
  const [photoUrl, setPhotoUrl] = useState('');
  const [cvUrl, setCvUrl] = useState('');
  const [cvFileName, setCvFileName] = useState('');
  const [nationalIdPhotoUrl, setNationalIdPhotoUrl] = useState('');
  const [graduationCertUrl, setGraduationCertUrl] = useState('');
  const [licensePhotoUrl, setLicensePhotoUrl] = useState('');

  // Choose a vacancy
  const handleSelectVacancy = (vac) => {
    setSelectedVacancy(vac);
    setTargetJobTitle(vac.jobTitle);
    setDepartment(vac.department || departmentsList[0] || 'الصيدلية');
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // General application without specific vacancy
  const handleOpenGeneralApplication = () => {
    setSelectedVacancy({
      id: 'general_apply',
      jobTitle: jobsList[0]?.title || 'صيدلي',
      department: departmentsList[0] || 'الصيدلية',
      description: 'تقديم طلب توظيف عام لكافة التخصصات'
    });
    setTargetJobTitle(jobsList[0]?.title || 'صيدلي');
    setDepartment(departmentsList[0] || 'الصيدلية');
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // File Upload Handlers with compression
  const handleFileChange = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (type === 'cv') {
        setCvFileName(file.name);
        if (file.type.includes('pdf')) {
          const reader = new FileReader();
          reader.onload = (event) => setCvUrl(event.target.result);
          reader.readAsDataURL(file);
        } else {
          const compressed = await compressImage(file, 1200, 0.85);
          setCvUrl(compressed);
        }
      } else {
        const compressed = await compressImage(file, 1000, 0.8);
        if (type === 'photo') setPhotoUrl(compressed);
        else if (type === 'nationalId') setNationalIdPhotoUrl(compressed);
        else if (type === 'gradCert') setGraduationCertUrl(compressed);
        else if (type === 'license') setLicensePhotoUrl(compressed);
      }
    } catch (err) {
      console.error('File reading error:', err);
      showToast?.('حدث خطأ أثناء تحميل الملف، يرجى المحاولة بصيغة أخرى');
    }
  };

  // Validate current step
  const validateStep = (step) => {
    if (step === 1) {
      if (!targetJobTitle.trim()) {
        showToast?.('يرجى اختيار الوظيفة المراد التقديم عليها');
        return false;
      }
    } else if (step === 2) {
      if (!name.trim()) {
        showToast?.('يرجى إدخال الاسم الكامل رباعياً');
        return false;
      }
      if (!nationalId.trim() || nationalId.trim().length < 10) {
        showToast?.('يرجى إدخال رقم قومي صحيح');
        return false;
      }
      if (!address.trim()) {
        showToast?.('يرجى إدخال العنوان بالتفصيل');
        return false;
      }
    } else if (step === 3) {
      if (!phone.trim() || phone.trim().length < 10) {
        showToast?.('يرجى إدخال رقم هاتف أساسي صحيح');
        return false;
      }
    } else if (step === 4) {
      if (!qualification.trim()) {
        showToast?.('يرجى كتابة المؤهل الدراسي والتخصص');
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final Submit Application
  const handleSubmitApplication = async (e) => {
    e.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) return;

    setIsSubmitting(true);
    try {
      const appCode = generateApplicationCode();
      const newApp = {
        id: `app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        code: appCode,
        status: 'new', // new | interview_scheduled | interviewed | hired | waiting_list | rejected
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        // Job & Preference
        targetJobTitle: targetJobTitle || 'صيدلي',
        department: department || 'الصيدلية',
        preferredBranchId: preferredBranchId || '',
        expectedSalary: expectedSalary ? String(expectedSalary) : '',
        availableStartDate: availableStartDate || new Date().toISOString().slice(0, 10),
        contractTypePreference: contractTypePreference || 'دوام كامل',

        // Personal
        name: name.trim(),
        nickname: nickname.trim(),
        nationalId: nationalId.trim().replace(/\D/g, ''),
        dob: dob || '',
        gender: gender || 'ذكر',
        maritalStatus: maritalStatus || 'أعزب',
        address: address.trim(),
        photoUrl: photoUrl || '',

        // Contact
        phone: phone.trim().replace(/\D/g, ''),
        whatsappPhone: whatsappPhone ? whatsappPhone.trim().replace(/\D/g, '') : phone.trim().replace(/\D/g, ''),
        relativePhone: relativePhone.trim().replace(/\D/g, ''),
        email: email.trim(),

        // Education & Experience
        qualification: qualification.trim(),
        graduationYear: graduationYear.trim(),
        university: university.trim(),
        grade: grade || 'جيد',
        experienceYears: String(experienceYears || '0'),
        previousExperience: previousExperience.trim(),
        skills: skills.trim(),

        // Docs
        cvUrl: cvUrl || '',
        cvFileName: cvFileName || '',
        nationalIdPhotoUrl: nationalIdPhotoUrl || '',
        graduationCertUrl: graduationCertUrl || '',
        licensePhotoUrl: licensePhotoUrl || '',

        // Interview & Review tracking
        interviewSchedule: null,
        interviewEvaluation: null,
        rejectionReason: '',
        waitingListReason: '',
        notes: ''
      };

      // Create realtime notification for Admin
      const newNotif = {
        id: `notif_app_${Date.now()}`,
        title: '📥 طلب تعيين جديد',
        message: `تم استلام طلب تعيين جديد من المرشح (${newApp.name}) لوظيفة (${newApp.targetJobTitle}) برقم ${newApp.code}`,
        type: 'recruitment',
        targetTab: 'employees',
        targetSubTab: 'recruitment',
        applicationId: newApp.id,
        createdAt: new Date().toISOString(),
        read: false
      };

      const existingApps = state?.recruitmentApplications || [];
      const updatedApps = [newApp, ...existingApps];
      const existingNotifs = state?.notifications || [];
      const updatedNotifs = [newNotif, ...existingNotifs];

      const updatedState = {
        ...state,
        recruitmentApplications: updatedApps,
        notifications: updatedNotifs
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      setSubmittedReceipt(newApp);
      showToast?.(`✅ تم تقديم طلب التعيين بنجاح! كود الطلب: ${newApp.code}`);
    } catch (err) {
      console.error('Error submitting application:', err);
      showToast?.('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form to start fresh
  const handleResetForm = () => {
    setSelectedVacancy(null);
    setSubmittedReceipt(null);
    setCurrentStep(1);
    setName('');
    setNickname('');
    setNationalId('');
    setDob('');
    setAddress('');
    setPhone('');
    setWhatsappPhone('');
    setRelativePhone('');
    setEmail('');
    setQualification('');
    setGraduationYear('');
    setUniversity('');
    setExperienceYears('0');
    setPreviousExperience('');
    setSkills('');
    setPhotoUrl('');
    setCvUrl('');
    setCvFileName('');
    setNationalIdPhotoUrl('');
    setGraduationCertUrl('');
    setLicensePhotoUrl('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background, #0f172a)',
      color: 'var(--text, #f8fafc)',
      fontFamily: "'Tajawal', 'Cairo', sans-serif",
      direction: 'rtl',
      padding: '0 0 60px 0'
    }}>
      {/* ── Top Portal Header ── */}
      <header style={{
        background: 'rgba(30, 41, 59, 0.75)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '20px',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
            }}>
              HR
            </div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text, #fff)' }}>
              {orgName}
            </h1>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              بوابة التوظيف والانضمام لفريق العمل
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {toggleTheme && (
            <button
              type="button"
              onClick={toggleTheme}
              className="btn btn-ghost"
              style={{
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border)'
              }}
              title="تبديل المظهر"
            >
              {themeMode === 'light' ? '🌙' : '☀️'}
            </button>
          )}
          <a
            href="/login"
            style={{
              fontSize: '13px',
              color: 'var(--primary, #38bdf8)',
              textDecoration: 'none',
              fontWeight: 'bold',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.08)'
            }}
          >
            🔐 دخول الموظفين / الإدارة
          </a>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main style={{ maxWidth: '1000px', margin: '30px auto', padding: '0 16px' }}>

        {/* Hero Section */}
        {!selectedVacancy && !submittedReceipt && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(15, 23, 42, 0.8))',
            borderRadius: '24px',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '36px 28px',
            textAlign: 'center',
            marginBottom: '36px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '20px', color: '#60a5fa', fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>
              💼 فرص وظيفية واعدة وبيئة عمل احترافية
            </div>
            <h2 style={{ fontSize: '32px', fontWeight: 900, margin: '0 0 12px 0', color: '#fff' }}>
              انضم إلى فريق {orgName}
            </h2>
            <p style={{ maxWidth: '650px', margin: '0 auto 24px', color: '#cbd5e1', fontSize: '15px', lineHeight: '1.7' }}>
              نبحث دائماً عن الكفاءات الطبية والإدارية المتميزة لمشاركتنا رحلة النجاح والتطور. اختر الوظيفة المناسبة وقدّم بياناتك وسنتواصل معك لتحديد موعد المقابلة.
            </p>
            <button
              type="button"
              onClick={handleOpenGeneralApplication}
              className="btn btn-start"
              style={{
                fontSize: '15px',
                padding: '12px 28px',
                borderRadius: '12px',
                fontWeight: 800,
                boxShadow: '0 6px 20px rgba(37, 99, 235, 0.4)'
              }}
            >
              📝 تقديم طلب توظيف عام الآن
            </button>
          </div>
        )}

        {/* ── 1. Submission Success Receipt ── */}
        {submittedReceipt && (
          <div className="fade-in" style={{
            background: 'var(--surface, #1e293b)',
            borderRadius: '24px',
            border: '1px solid #10b981',
            padding: '36px 28px',
            textAlign: 'center',
            maxWidth: '650px',
            margin: '0 auto',
            boxShadow: '0 20px 50px rgba(16, 185, 129, 0.15)'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              fontSize: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              ✓
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: '26px', fontWeight: 900, color: '#10b981' }}>
              تم استلام طلب التعيين بنجاح!
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '14.5px', marginBottom: '24px' }}>
              شكراً لاهتمامك بالانضمام إلينا. تم تسجيل بياناتك بنجاح في قاعدة بيانات التوظيف وسيتم مراجعتها والتواصل معك عبر الهاتف أو الواتساب.
            </p>

            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '16px',
              padding: '20px',
              textAlign: 'right',
              border: '1px dashed rgba(255, 255, 255, 0.2)',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>كود الطلب المرجعي:</span>
                <strong style={{ color: '#38bdf8', fontSize: '16px', fontFamily: 'monospace', letterSpacing: '1px' }}>{submittedReceipt.code}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>اسم المرشح:</span>
                <strong style={{ color: '#fff', fontSize: '14px' }}>{submittedReceipt.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>الوظيفة المتقدم لها:</span>
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{submittedReceipt.targetJobTitle} ({submittedReceipt.department})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>رقم الهاتف المسجل:</span>
                <span style={{ color: '#fff', direction: 'ltr' }}>{submittedReceipt.phone}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>تاريخ التقديم:</span>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{new Date(submittedReceipt.createdAt).toLocaleString('ar-EG')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(submittedReceipt.code);
                  showToast?.('📋 تم نسخ كود الطلب بنجاح');
                }}
                style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 700 }}
              >
                📋 نسخ كود الطلب
              </button>
              <button
                type="button"
                className="btn btn-start"
                onClick={handleResetForm}
                style={{ padding: '10px 24px', borderRadius: '10px', fontWeight: 800 }}
              >
                🏠 العودة للشواغر المتاحة
              </button>
            </div>
          </div>
        )}

        {/* ── 2. Open Vacancies Cards (When no vacancy selected yet) ── */}
        {!selectedVacancy && !submittedReceipt && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🎯</span>
                <span>الوظائف الشاغرة حالياً ({activeVacancies.length})</span>
              </h3>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              {activeVacancies.map(vac => (
                <div
                  key={vac.id}
                  style={{
                    background: 'var(--surface, #1e293b)',
                    borderRadius: '18px',
                    border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    transition: 'transform 0.2s ease, border-color 0.2s ease',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.6)';
                    e.currentTarget.style.transform = 'translateY(-3px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border, rgba(255, 255, 255, 0.1))';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <span style={{
                        padding: '4px 10px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        {vac.department || 'الصيدلية'}
                      </span>
                      {vac.openingsCount > 1 && (
                        <span style={{ fontSize: '11.5px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                          مطلوب {vac.openingsCount} كوادر
                        </span>
                      )}
                    </div>

                    <h4 style={{ margin: '0 0 8px', fontSize: '19px', fontWeight: 800, color: 'var(--text, #fff)' }}>
                      {vac.jobTitle}
                    </h4>

                    <p style={{ margin: '0 0 14px', color: '#94a3b8', fontSize: '13.5px', lineHeight: '1.6' }}>
                      {vac.description}
                    </p>

                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '10px 12px', borderRadius: '10px', fontSize: '12.5px', color: '#cbd5e1', marginBottom: '12px' }}>
                      <div style={{ marginBottom: '4px' }}>
                        🎓 <strong>المؤهل:</strong> {vac.qualificationRequired || 'مؤهل مناسب'}
                      </div>
                      <div>
                        ⏳ <strong>الخبرة المطلوبة:</strong> {vac.minExperienceYears ? `${vac.minExperienceYears} سنوات أو أكثر` : 'مبتدئ أو ذو خبرة'}
                      </div>
                    </div>

                    {Array.isArray(vac.requirements) && vac.requirements.length > 0 && (
                      <ul style={{ margin: 0, paddingRight: '18px', fontSize: '12.5px', color: '#94a3b8', lineHeight: '1.6' }}>
                        {vac.requirements.slice(0, 3).map((req, idx) => (
                          <li key={idx}>{req}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectVacancy(vac)}
                    className="btn btn-start"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>📝</span>
                    <span>التقديم على الوظيفة</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3. Multi-Step Application Form Wizard ── */}
        {selectedVacancy && !submittedReceipt && (
          <div className="fade-in" style={{
            background: 'var(--surface, #1e293b)',
            borderRadius: '24px',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
            padding: '30px 24px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Header / Back */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedVacancy(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: 0,
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  ← العودة لقائمة الوظائف المتاحة
                </button>
                <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--text, #fff)' }}>
                  استمارة التقديم لوظيفة: <span style={{ color: '#38bdf8' }}>{targetJobTitle}</span>
                </h3>
              </div>

              {/* Progress Steps Header */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {[1, 2, 3, 4, 5].map(stepNum => (
                  <div
                    key={stepNum}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: currentStep === stepNum ? '#2563eb' : (currentStep > stepNum ? '#10b981' : 'rgba(255, 255, 255, 0.1)'),
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '13px'
                    }}
                  >
                    {currentStep > stepNum ? '✓' : stepNum}
                  </div>
                ))}
              </div>
            </div>

            {/* Step 1: Job Preferences */}
            {currentStep === 1 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '17px', color: '#60a5fa', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
                  1. تحديد الوظيفة وتفضيلات العمل
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      المسمى الوظيفي المستهدف *
                    </label>
                    <select
                      className="form-control"
                      value={targetJobTitle}
                      onChange={e => {
                        const val = e.target.value;
                        setTargetJobTitle(val);
                        const match = jobsList.find(j => j.title === val);
                        if (match && match.department) setDepartment(match.department);
                      }}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      {jobsList.map(j => (
                        <option key={j.id || j.title} value={j.title}>{j.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      القسم التابع له
                    </label>
                    <select
                      className="form-control"
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      {departmentsList.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الفرع المفضل للعمل
                    </label>
                    <select
                      className="form-control"
                      value={preferredBranchId}
                      onChange={e => setPreferredBranchId(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      <option value="">أي فرع متاح (مرونة تامة)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.branchCode || ''})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      نوع الدوام المفضل
                    </label>
                    <select
                      className="form-control"
                      value={contractTypePreference}
                      onChange={e => setContractTypePreference(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      <option value="دوام كامل">دوام كامل (Full Time)</option>
                      <option value="دوام جزئي">دوام جزئي (Part Time)</option>
                      <option value="شفت مسائي">شفت مسائي / ليلي</option>
                      <option value="تدريب صيدلي">تدريب صيدلي (Internship)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الراتب المتوقع (شهرياً - اختياري)
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="مثال: 6000"
                      value={expectedSalary}
                      onChange={e => setExpectedSalary(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      تاريخ الاستعداد للبدء بالعمل
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={availableStartDate}
                      onChange={e => setAvailableStartDate(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Personal Information */}
            {currentStep === 2 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '17px', color: '#60a5fa', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
                  2. البيانات الشخصية ومحل الإقامة
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الاسم الكامل رباعياً (كما هو في البطاقة الشخصية) *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="أحمد محمد علي حسن"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الاسم الشائع / اللقب (اختياري)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="د. أحمد"
                      value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الرقم القومي (14 رقم) *
                    </label>
                    <input
                      type="text"
                      maxLength={14}
                      className="form-control"
                      placeholder="2980101XXXXXXXX"
                      value={nationalId}
                      onChange={e => setNationalId(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      تاريخ الميلاد
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={dob}
                      onChange={e => setDob(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      النوع
                    </label>
                    <select
                      className="form-control"
                      value={gender}
                      onChange={e => setGender(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      <option value="ذكر">ذكر</option>
                      <option value="أنثى">أنثى</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الحالة الاجتماعية
                    </label>
                    <select
                      className="form-control"
                      value={maritalStatus}
                      onChange={e => setMaritalStatus(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      <option value="أعزب">أعزب</option>
                      <option value="متزوج">متزوج</option>
                      <option value="يعول">يعول</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      العنوان ومحل الإقامة الحالي بالتفصيل *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="المحافظة، المدينة، اسم الشارع، رقم العقار"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Contact Info */}
            {currentStep === 3 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '17px', color: '#60a5fa', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
                  3. بيانات الاتصال والتواصل
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      رقم الهاتف الأساسي *
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="010XXXXXXXX"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      رقم الواتساب (للتواصل وتأكيد المقابلة)
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="010XXXXXXXX"
                      value={whatsappPhone}
                      onChange={e => setWhatsappPhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      رقم هاتف قريب / الطوارئ
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="011XXXXXXXX"
                      value={relativePhone}
                      onChange={e => setRelativePhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      البريد الإلكتروني (Email)
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="example@gmail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Education & Experience */}
            {currentStep === 4 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '17px', color: '#60a5fa', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
                  4. المؤهل الأكاديمي والخبرات السابقة
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      المؤهل الدراسي والتخصص *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="مثال: بكالوريوس العلوم الصيدلية"
                      value={qualification}
                      onChange={e => setQualification(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الجامعة / المعهد
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="مثال: جامعة القاهرة"
                      value={university}
                      onChange={e => setUniversity(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      سنة التخرج
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="مثال: 2023"
                      value={graduationYear}
                      onChange={e => setGraduationYear(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      التقدير العام
                    </label>
                    <select
                      className="form-control"
                      value={grade}
                      onChange={e => setGrade(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      <option value="امتياز مع مرتبة الشرف">امتياز مع مرتبة الشرف</option>
                      <option value="امتياز">امتياز</option>
                      <option value="جيد جداً">جيد جداً</option>
                      <option value="جيد">جيد</option>
                      <option value="مقبول">مقبول</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      سنوات الخبرة العملية
                    </label>
                    <select
                      className="form-control"
                      value={experienceYears}
                      onChange={e => setExperienceYears(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    >
                      <option value="0">حديث تخرج (بدون خبرة)</option>
                      <option value="1">سنة واحدة</option>
                      <option value="2">سنتان</option>
                      <option value="3">3 سنوات</option>
                      <option value="4">4 سنوات</option>
                      <option value="5">5 سنوات أو أكثر</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      الخبرات وأماكن العمل السابقة
                    </label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="اذكر الصيدليات أو الشركات السابقة، المسمى الوظيفي، والمدة"
                      value={previousExperience}
                      onChange={e => setPreviousExperience(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      المهارات الإضافية واللغات والبرامج الصيدلية
                    </label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="مثال: إجادة برنامج صيدليات معتمد، لغة إنجليزية جيدة، مهارات بيع وإقناع"
                      value={skills}
                      onChange={e => setSkills(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Documents & Final Submit */}
            {currentStep === 5 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '17px', color: '#60a5fa', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
                  5. المرفقات والمستندات وتأكيد الإرسال
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {/* CV Upload */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                      📄 السيرة الذاتية (CV / PDF أو صورة)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={e => handleFileChange(e, 'cv')}
                      style={{ fontSize: '12px', color: '#94a3b8' }}
                    />
                    {cvFileName && (
                      <div style={{ marginTop: '8px', color: '#10b981', fontSize: '12px' }}>
                        ✓ تم اختيار: {cvFileName}
                      </div>
                    )}
                  </div>

                  {/* Personal Photo */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                      👤 الصورة الشخصية (اختياري)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, 'photo')}
                      style={{ fontSize: '12px', color: '#94a3b8' }}
                    />
                    {photoUrl && (
                      <img src={photoUrl} alt="Preview" style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover', marginTop: '8px' }} />
                    )}
                  </div>

                  {/* National ID Photo */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                      🪪 صورة بطاقة الرقم القومي
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, 'nationalId')}
                      style={{ fontSize: '12px', color: '#94a3b8' }}
                    />
                    {nationalIdPhotoUrl && (
                      <div style={{ marginTop: '8px', color: '#10b981', fontSize: '12px' }}>✓ تم رفع صورة البطاقة</div>
                    )}
                  </div>

                  {/* Graduation Certificate Photo */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                      📜 شهادة التخرج / كارنيه النقابة
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, 'gradCert')}
                      style={{ fontSize: '12px', color: '#94a3b8' }}
                    />
                    {graduationCertUrl && (
                      <div style={{ marginTop: '8px', color: '#10b981', fontSize: '12px' }}>✓ تم رفع الشهادة</div>
                    )}
                  </div>
                </div>

                {/* Terms and Confirmation */}
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '14px 18px', borderRadius: '12px', fontSize: '13px', color: '#93c5fd', marginBottom: '20px' }}>
                  ℹ️ بالإرسال، أنت تؤكد صحة البيانات المدخلة وتوافق على مراجعتها من قبل إدارة الموارد البشرية لتحديد موعد المقابلة الشخصية.
                </div>
              </div>
            )}

            {/* Navigation & Submit Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="btn btn-ghost"
                  style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 700 }}
                >
                  ← الخطوة السابقة
                </button>
              ) : <div />}

              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="btn btn-start"
                  style={{ padding: '10px 24px', borderRadius: '10px', fontWeight: 800 }}
                >
                  التالي ({currentStep + 1} من 5) →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitApplication}
                  disabled={isSubmitting}
                  className="btn btn-start"
                  style={{
                    padding: '12px 32px',
                    borderRadius: '12px',
                    fontWeight: 900,
                    fontSize: '15px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  {isSubmitting ? 'جاري إرسال الطلب...' : '🚀 تأكيد وإرسال طلب التعيين'}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
