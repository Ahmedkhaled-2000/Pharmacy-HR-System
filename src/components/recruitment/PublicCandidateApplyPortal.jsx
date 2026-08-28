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
    const matchedJob = jobsList.find(j => j.title === vac.jobTitle);
    const resolvedDept = vac.department || matchedJob?.department || departmentsList[0] || 'الصيدلية';
    setSelectedVacancy(vac);
    setTargetJobTitle(vac.jobTitle);
    setDepartment(resolvedDept);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // General application without specific vacancy
  const handleOpenGeneralApplication = () => {
    const defaultJob = jobsList[0]?.title || 'صيدلي';
    const matchedJob = jobsList.find(j => j.title === defaultJob);
    const resolvedDept = matchedJob?.department || departmentsList[0] || 'الصيدلية';
    setSelectedVacancy({
      id: 'general_apply',
      jobTitle: defaultJob,
      department: resolvedDept,
      description: 'تقديم طلب توظيف عام لكافة التخصصات'
    });
    setTargetJobTitle(defaultJob);
    setDepartment(resolvedDept);
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
        title: `📥 طلب توظيف جديد: ${newApp.name}`,
        message: `تم استلام طلب توظيف جديد من المرشح (${newApp.name}) لوظيفة (${newApp.targetJobTitle} - ${newApp.department}) - كود الطلب: ${newApp.code}`,
        type: 'recruitment',
        icon: '📥',
        typeLabel: 'طلب توظيف جديد',
        employeeName: newApp.name,
        targetTab: 'employees',
        targetSubTab: 'recruitment',
        applicationId: newApp.id,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
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

      // Instant optimistic UI update
      setSubmittedReceipt(newApp);
      setIsSubmitting(false);
      showToast?.(`✅ تم تقديم طلب التعيين بنجاح! كود الطلب: ${newApp.code}`);

      // Background asynchronous non-blocking persistence
      if (saveState) {
        saveState(updatedState).catch(err => {
          console.warn('[CareersPortal] Background sync warning:', err);
        });
      }
    } catch (err) {
      console.error('Error submitting application:', err);
      showToast?.('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى');
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

  const allowGeneralApplication = state?.recruitmentSettings?.allowGeneralApplication !== false;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(145deg, #f0fdfa 0%, #f8fafc 40%, #e0f2fe 100%)',
      color: '#0f172a',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      direction: 'rtl',
      padding: '0 0 60px 0',
      position: 'relative'
    }}>
      {/* ── Top Portal Header ── */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'contain', background: '#f8fafc', padding: '4px', border: '1px solid #e2e8f0' }} />
          ) : (
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '20px',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
            }}>
              🏥
            </div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
              {orgName}
            </h1>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              بوابة التوظيف والانضمام لفريق العمل
            </span>
          </div>
        </div>

        {/* Note: The login button [🔐 دخول الموظفين / الإدارة] is removed as requested */}
      </header>

      {/* ── Main Container ── */}
      <main style={{ maxWidth: '1000px', margin: '24px auto', padding: '0 16px' }}>

        {/* Hero Section */}
        {!selectedVacancy && !submittedReceipt && (
          <div style={{
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            borderRadius: '24px',
            padding: '36px 24px',
            textAlign: 'center',
            marginBottom: '32px',
            boxShadow: '0 14px 34px rgba(13, 148, 136, 0.22)',
            color: '#ffffff'
          }}>
            <div style={{
              display: 'inline-block',
              padding: '6px 16px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(8px)',
              borderRadius: '20px',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              marginBottom: '14px'
            }}>
              💼 فرص وظيفية واعدة وبيئة عمل احترافية
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 900, margin: '0 0 12px 0', color: '#ffffff' }}>
              انضم إلى فريق {orgName}
            </h2>
            <p style={{ maxWidth: '650px', margin: '0 auto 24px', color: '#e6fffa', fontSize: '15px', lineHeight: '1.7', fontWeight: 500 }}>
              نبحث دائماً عن الكفاءات الطبية والإدارية المتميزة لمشاركتنا رحلة النجاح والتطور. اختر الوظيفة المناسبة وسجّل بياناتك للتواصل معك وتحديد موعد المقابلة.
            </p>
            {allowGeneralApplication ? (
              <button
                type="button"
                onClick={handleOpenGeneralApplication}
                style={{
                  fontSize: '15px',
                  padding: '12px 28px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  background: '#ffffff',
                  color: '#0f766e',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
                  transition: 'transform 0.15s ease'
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={e => e.currentTarget.style.transform = 'none'}
              >
                📝 تقديم طلب توظيف عام الآن
              </button>
            ) : (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '10px 22px',
                borderRadius: '14px',
                fontSize: '14px',
                fontWeight: 800,
                color: '#ffffff'
              }}>
                <span>🔒</span>
                <span>التقديم متاح حالياً حصرياً على الشواغر والوظائف المعلنة بالأسفل</span>
              </div>
            )}
          </div>
        )}

        {/* ── 1. Submission Success Receipt ── */}
        {submittedReceipt && (
          <div className="fade-in" style={{
            background: '#ffffff',
            borderRadius: '24px',
            border: '1.5px solid #10b981',
            padding: '36px 24px',
            textAlign: 'center',
            maxWidth: '620px',
            margin: '0 auto',
            boxShadow: '0 16px 40px rgba(16, 185, 129, 0.12)'
          }}>
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: '#ecfdf5',
              color: '#059669',
              fontSize: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              border: '2px solid #a7f3d0'
            }}>
              ✓
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: '24px', fontWeight: 900, color: '#065f46' }}>
              تم استلام طلب التعيين بنجاح!
            </h2>
            <p style={{ color: '#475569', fontSize: '14.5px', marginBottom: '22px', lineHeight: '1.6' }}>
              شكراً لاهتمامك بالانضمام إلينا. تم تسجيل بياناتك بنجاح وسيتم مراجعتها من قبل إدارة الموارد البشرية للتواصل معك عبر الهاتف أو الواتساب.
            </p>

            <div style={{
              background: '#f8fafc',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '18px',
              marginBottom: '24px',
              textAlign: 'right'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '13px' }}>كود طلب التعيين:</span>
                <strong style={{ fontFamily: 'monospace', fontSize: '16px', color: '#0f766e' }}>{submittedReceipt.code}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '13px' }}>اسم المرشح:</span>
                <strong style={{ color: '#0f172a' }}>{submittedReceipt.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '13px' }}>الوظيفة المستهدفة:</span>
                <strong style={{ color: '#0284c7' }}>{submittedReceipt.targetJobTitle} ({submittedReceipt.department})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b', fontSize: '13px' }}>حالة الطلب:</span>
                <span style={{
                  padding: '2px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  background: '#eff6ff',
                  color: '#1d4ed8'
                }}>
                  طلب جديد
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetForm}
              style={{
                padding: '12px 28px',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '14.5px',
                background: '#0d9488',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              🔄 تقديم طلب تعيين آخر
            </button>
          </div>
        )}

        {/* ── 2. Open Vacancies List ── */}
        {!selectedVacancy && !submittedReceipt && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '21px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎯</span>
                  <span>الوظائف الشاغرة حالياً ({activeVacancies.length})</span>
                </h3>
                <span style={{ fontSize: '13.5px', color: '#64748b', fontWeight: 600 }}>
                  تصفح الشواغر المتاحة وقدّم على الوظيفة التي تناسب مؤهلك وخبراتك
                </span>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
              gap: '20px'
            }}>
              {activeVacancies.map(vac => (
                <div
                  key={vac.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    border: '1.5px solid #e2e8f0',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.04)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#0d9488';
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(13, 148, 136, 0.12)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.04)';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <span style={{
                        padding: '4px 10px',
                        background: '#f0fdfa',
                        color: '#0f766e',
                        border: '1px solid #ccfbf1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800
                      }}>
                        {vac.department || 'الصيدلية'}
                      </span>
                      {vac.openingsCount > 1 && (
                        <span style={{ fontSize: '11.5px', color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                          مطلوب {vac.openingsCount} كوادر
                        </span>
                      )}
                    </div>

                    <h4 style={{ margin: '0 0 8px', fontSize: '19px', fontWeight: 900, color: '#0f172a' }}>
                      {vac.jobTitle}
                    </h4>

                    <p style={{ margin: '0 0 14px', color: '#475569', fontSize: '13.5px', lineHeight: '1.6' }}>
                      {vac.description}
                    </p>

                    <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', fontSize: '12.5px', color: '#1e293b', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                      <div style={{ marginBottom: '6px' }}>
                        🎓 <strong>المؤهل:</strong> {vac.qualificationRequired || 'مؤهل مناسب'}
                      </div>
                      <div>
                        ⏳ <strong>الخبرة المطلوبة:</strong> {vac.minExperienceYears ? `${vac.minExperienceYears} سنوات أو أكثر` : 'مبتدئ أو ذو خبرة'}
                      </div>
                    </div>

                    {Array.isArray(vac.requirements) && vac.requirements.length > 0 && (
                      <ul style={{ margin: 0, paddingRight: '18px', fontSize: '12.5px', color: '#334155', lineHeight: '1.6' }}>
                        {vac.requirements.slice(0, 3).map((req, idx) => (
                          <li key={idx}>{req}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectVacancy(vac)}
                    style={{
                      width: '100%',
                      padding: '11px',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
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
            background: '#ffffff',
            borderRadius: '24px',
            border: '1px solid #e2e8f0',
            padding: '30px 24px',
            boxShadow: '0 16px 40px -10px rgba(15, 23, 42, 0.08)'
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
                    color: '#0d9488',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 800,
                    padding: 0,
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  ← العودة لقائمة الوظائف المتاحة
                </button>
                <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                  استمارة التقديم لوظيفة: <span style={{ color: '#0d9488' }}>{targetJobTitle}</span>
                </h3>
              </div>

              {/* Progress Steps Header */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {[1, 2, 3, 4, 5].map(stepNum => (
                  <div
                    key={stepNum}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: currentStep === stepNum ? '#0d9488' : (currentStep > stepNum ? '#10b981' : '#f1f5f9'),
                      color: currentStep >= stepNum ? '#fff' : '#64748b',
                      border: currentStep < stepNum ? '1px solid #cbd5e1' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '13px'
                    }}
                  >
                    {currentStep > stepNum ? '✓' : stepNum}
                  </div>
                ))}
              </div>
            </div>

            {/* Step 1: Job Preferences */}
            {currentStep === 1 && (() => {
              const isSpecificVacancy = Boolean(selectedVacancy && selectedVacancy.id !== 'general_apply');

              return (
                <div className="fade-in">
                  <h4 style={{ margin: '0 0 16px', fontSize: '16.5px', fontWeight: 800, color: '#0f766e', borderBottom: '1.5px solid #f0fdfa', paddingBottom: '8px' }}>
                    1. تحديد الوظيفة وتفضيلات العمل
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                    {/* Target Job Title */}
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        <span>المسمى الوظيفي المستهدف *</span>
                        {isSpecificVacancy && (
                          <span style={{ fontSize: '11px', color: '#0d9488', background: '#f0fdfa', padding: '2px 8px', borderRadius: '6px', border: '1px solid #ccfbf1', fontWeight: 800 }}>
                            🔒 محدد وفق الشاغر المختار
                          </span>
                        )}
                      </label>
                      {isSpecificVacancy ? (
                        <input
                          type="text"
                          className="form-control"
                          value={targetJobTitle}
                          disabled
                          readOnly
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            background: '#f1f5f9',
                            border: '1.5px solid #cbd5e1',
                            color: '#0f172a',
                            fontWeight: 800,
                            cursor: 'not-allowed'
                          }}
                        />
                      ) : (
                        <select
                          className="form-control"
                          value={targetJobTitle}
                          onChange={e => {
                            const val = e.target.value;
                            setTargetJobTitle(val);
                            const match = jobsList.find(j => j.title === val);
                            if (match && match.department) {
                              setDepartment(match.department);
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            background: '#f8fafc',
                            border: '1.5px solid #cbd5e1',
                            color: '#0f172a',
                            fontWeight: 700
                          }}
                          required
                        >
                          {jobsList.map(j => (
                            <option key={j.id || j.title} value={j.title}>{j.title}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Department - ALWAYS Automatically Selected & Locked */}
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        <span>القسم التابع له</span>
                        <span style={{ fontSize: '11px', color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bae6fd', fontWeight: 800 }}>
                          🔒 محدد تلقائياً حسب الوظيفة
                        </span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={department}
                        disabled
                        readOnly
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          background: '#f1f5f9',
                          border: '1.5px solid #cbd5e1',
                          color: '#0f172a',
                          fontWeight: 800,
                          cursor: 'not-allowed'
                        }}
                      />
                    </div>

                    {/* Preferred Branch */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        الفرع المفضل للعمل
                      </label>
                      <select
                        className="form-control"
                        value={preferredBranchId}
                        onChange={e => setPreferredBranchId(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 600 }}
                      >
                        <option value="">أي فرع متاح (مرونة تامة)</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.branchCode || ''})</option>
                        ))}
                      </select>
                    </div>

                    {/* Work Type Preference */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        نوع الدوام المفضل
                      </label>
                      <select
                        className="form-control"
                        value={contractTypePreference}
                        onChange={e => setContractTypePreference(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 600 }}
                      >
                        <option value="دوام كامل">دوام كامل (Full Time)</option>
                        <option value="دوام جزئي">دوام جزئي (Part Time)</option>
                        <option value="شفت مسائي">شفت مسائي / ليلي</option>
                        <option value="تدريب صيدلي">تدريب صيدلي (Internship)</option>
                      </select>
                    </div>

                    {/* Expected Salary */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        الراتب المتوقع (شهرياً - اختياري)
                      </label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder="مثال: 6000"
                        value={expectedSalary}
                        onChange={e => setExpectedSalary(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                      />
                    </div>

                    {/* Available Start Date */}
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                        تاريخ الاستعداد للبدء بالعمل
                      </label>
                      <input
                        type="date"
                        className="form-control"
                        value={availableStartDate}
                        onChange={e => setAvailableStartDate(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Step 2: Personal Information */}
            {currentStep === 2 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '16.5px', fontWeight: 800, color: '#0f766e', borderBottom: '1.5px solid #f0fdfa', paddingBottom: '8px' }}>
                  2. البيانات الشخصية ومحل الإقامة
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      الاسم الكامل رباعياً (كما هو في البطاقة الشخصية) *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="أحمد محمد علي حسن"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      الاسم الشائع / اللقب (اختياري)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="د. أحمد"
                      value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      الرقم القومي (14 رقم) *
                    </label>
                    <input
                      type="text"
                      maxLength={14}
                      className="form-control"
                      placeholder="2980101XXXXXXXX"
                      value={nationalId}
                      onChange={e => setNationalId(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      تاريخ الميلاد
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={dob}
                      onChange={e => setDob(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      النوع
                    </label>
                    <select
                      className="form-control"
                      value={gender}
                      onChange={e => setGender(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    >
                      <option value="ذكر">ذكر</option>
                      <option value="أنثى">أنثى</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      الحالة الاجتماعية
                    </label>
                    <select
                      className="form-control"
                      value={maritalStatus}
                      onChange={e => setMaritalStatus(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    >
                      <option value="أعزب">أعزب</option>
                      <option value="متزوج">متزوج</option>
                      <option value="يعول">يعول</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      العنوان ومحل الإقامة الحالي بالتفصيل *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="المحافظة، المدينة، اسم الشارع، رقم العقار"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Contact Info */}
            {currentStep === 3 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '16.5px', fontWeight: 800, color: '#0f766e', borderBottom: '1.5px solid #f0fdfa', paddingBottom: '8px' }}>
                  3. بيانات الاتصال والتواصل
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      رقم الهاتف الأساسي *
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="010XXXXXXXX"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      رقم الواتساب (للتواصل وتأكيد المقابلة)
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="010XXXXXXXX"
                      value={whatsappPhone}
                      onChange={e => setWhatsappPhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      رقم هاتف قريب / الطوارئ
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="011XXXXXXXX"
                      value={relativePhone}
                      onChange={e => setRelativePhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      البريد الإلكتروني (Email)
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="example@gmail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', direction: 'ltr', textAlign: 'right', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Education & Experience */}
            {currentStep === 4 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '16.5px', fontWeight: 800, color: '#0f766e', borderBottom: '1.5px solid #f0fdfa', paddingBottom: '8px' }}>
                  4. المؤهل الأكاديمي والخبرات السابقة
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      المؤهل الدراسي والتخصص *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="مثال: بكالوريوس العلوم الصيدلية"
                      value={qualification}
                      onChange={e => setQualification(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      الجامعة / المعهد
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="مثال: جامعة القاهرة"
                      value={university}
                      onChange={e => setUniversity(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      سنة التخرج
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="مثال: 2023"
                      value={graduationYear}
                      onChange={e => setGraduationYear(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      التقدير العام
                    </label>
                    <select
                      className="form-control"
                      value={grade}
                      onChange={e => setGrade(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    >
                      <option value="امتياز مع مرتبة الشرف">امتياز مع مرتبة الشرف</option>
                      <option value="امتياز">امتياز</option>
                      <option value="جيد جداً">جيد جداً</option>
                      <option value="جيد">جيد</option>
                      <option value="مقبول">مقبول</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      سنوات الخبرة العملية
                    </label>
                    <select
                      className="form-control"
                      value={experienceYears}
                      onChange={e => setExperienceYears(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
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
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      الخبرات وأماكن العمل السابقة
                    </label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="اذكر الصيدليات أو الشركات السابقة، المسمى الوظيفي، والمدة"
                      value={previousExperience}
                      onChange={e => setPreviousExperience(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                      المهارات الإضافية واللغات والبرامج الصيدلية
                    </label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="مثال: إجادة برنامج صيدليات معتمد، لغة إنجليزية جيدة، مهارات بيع وإقناع"
                      value={skills}
                      onChange={e => setSkills(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Documents & Final Submit */}
            {currentStep === 5 && (
              <div className="fade-in">
                <h4 style={{ margin: '0 0 16px', fontSize: '16.5px', fontWeight: 800, color: '#0f766e', borderBottom: '1.5px solid #f0fdfa', paddingBottom: '8px' }}>
                  5. المرفقات والمستندات وتأكيد الإرسال
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {/* CV Upload */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1.5px dashed #cbd5e1' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                      📄 السيرة الذاتية (CV / PDF أو صورة)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={e => handleFileChange(e, 'cv')}
                      style={{ fontSize: '12px', color: '#475569' }}
                    />
                    {cvFileName && (
                      <div style={{ marginTop: '8px', color: '#059669', fontSize: '12px', fontWeight: 700 }}>
                        ✓ تم اختيار: {cvFileName}
                      </div>
                    )}
                  </div>

                  {/* Personal Photo */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1.5px dashed #cbd5e1' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                      👤 الصورة الشخصية (اختياري)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, 'photo')}
                      style={{ fontSize: '12px', color: '#475569' }}
                    />
                    {photoUrl && (
                      <img src={photoUrl} alt="Preview" style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover', marginTop: '8px', border: '1px solid #cbd5e1' }} />
                    )}
                  </div>

                  {/* National ID Photo */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1.5px dashed #cbd5e1' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                      🪪 صورة بطاقة الرقم القومي
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, 'nationalId')}
                      style={{ fontSize: '12px', color: '#475569' }}
                    />
                    {nationalIdPhotoUrl && (
                      <div style={{ marginTop: '8px', color: '#059669', fontSize: '12px', fontWeight: 700 }}>✓ تم رفع صورة البطاقة</div>
                    )}
                  </div>

                  {/* Graduation Certificate Photo */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1.5px dashed #cbd5e1' }}>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                      📜 شهادة التخرج / كارنيه النقابة
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, 'gradCert')}
                      style={{ fontSize: '12px', color: '#475569' }}
                    />
                    {graduationCertUrl && (
                      <div style={{ marginTop: '8px', color: '#059669', fontSize: '12px', fontWeight: 700 }}>✓ تم رفع الشهادة</div>
                    )}
                  </div>
                </div>

                {/* Terms and Confirmation */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px 18px', borderRadius: '12px', fontSize: '13px', color: '#166534', fontWeight: 600, marginBottom: '20px' }}>
                  ℹ️ بالإرسال، أنت تؤكد صحة البيانات المدخلة وتوافق على مراجعتها من قبل إدارة الموارد البشرية لتحديد موعد المقابلة الشخصية.
                </div>
              </div>
            )}

            {/* Navigation & Submit Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer'
                  }}
                >
                  ← الخطوة السابقة
                </button>
              ) : <div />}

              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  style={{
                    padding: '11px 26px',
                    borderRadius: '11px',
                    fontWeight: 800,
                    background: '#0d9488',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
                  }}
                >
                  التالي ({currentStep + 1} من 5) →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitApplication}
                  disabled={isSubmitting}
                  style={{
                    padding: '12px 32px',
                    borderRadius: '12px',
                    fontWeight: 900,
                    fontSize: '15px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: isSubmitting ? 'wait' : 'pointer',
                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)'
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
