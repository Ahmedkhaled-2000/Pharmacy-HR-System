import React, { useState, useMemo } from 'react';
import { calculateEvaluationScore, APPLICATION_STATUSES } from '../../utils/recruitmentHelper';

export default function InterviewerEvaluationPortal({
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

  const applications = state?.recruitmentApplications || [];

  // Search by Phone or Application Code
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Evaluation Form States
  const [interviewerName, setInterviewerName] = useState('');
  const [interviewerJobTitle, setInterviewerJobTitle] = useState('مدير الفرع / مسؤول التقييم');
  const [interviewDate, setInterviewDate] = useState(new Date().toISOString().slice(0, 10));

  // Scores (1 to 5)
  const [technicalSkills, setTechnicalSkills] = useState(4);
  const [technicalNotes, setTechnicalNotes] = useState('');

  const [softSkills, setSoftSkills] = useState(4);
  const [softSkillsNotes, setSoftSkillsNotes] = useState('');

  const [languageTech, setLanguageTech] = useState(4);
  const [cultureFit, setCultureFit] = useState(4);

  const [proposedSalary, setProposedSalary] = useState('');
  const [recommendation, setRecommendation] = useState('recommended'); // 'recommended' | 'waiting_list' | 'rejected'
  const [generalNotes, setGeneralNotes] = useState('');

  // Candidates waiting for interview
  const pendingCandidates = useMemo(() => {
    return applications.filter(a => a.status === 'new' || a.status === 'interview_scheduled');
  }, [applications]);

  // Search candidate
  const handleSearch = (e) => {
    e?.preventDefault();
    const query = searchQuery.trim().toLowerCase().replace(/[\s-]/g, '');
    if (!query) {
      showToast?.('يرجى كتابة رقم هاتف المرشح أو كود الطلب');
      return;
    }

    const cleanQuery = query.replace(/\D/g, '');
    const found = applications.find(a => {
      const aPhone = String(a.phone || '').replace(/\D/g, '');
      const aCode = String(a.code || '').toLowerCase().replace(/[\s-]/g, '');
      const aNatId = String(a.nationalId || '').replace(/\D/g, '');
      return (
        (cleanQuery && aPhone.includes(cleanQuery)) ||
        (cleanQuery && aNatId.includes(cleanQuery)) ||
        aCode.includes(query)
      );
    });

    if (found) {
      loadCandidateData(found);
    } else {
      showToast?.('لم يتم العثور على أي مرشح بهذا الرقم أو الكود');
    }
  };

  const loadCandidateData = (app) => {
    setSelectedApp(app);
    setSubmissionSuccess(false);
    setProposedSalary(app.expectedSalary || '');

    // If existing evaluation exists, prefill it
    if (app.interviewEvaluation) {
      const evalData = app.interviewEvaluation;
      setInterviewerName(evalData.interviewerName || '');
      setInterviewerJobTitle(evalData.interviewerJobTitle || 'مدير الفرع');
      setInterviewDate(evalData.interviewDate || new Date().toISOString().slice(0, 10));
      setTechnicalSkills(evalData.technicalSkills || 4);
      setTechnicalNotes(evalData.technicalNotes || '');
      setSoftSkills(evalData.softSkills || 4);
      setSoftSkillsNotes(evalData.softSkillsNotes || '');
      setLanguageTech(evalData.languageTech || 4);
      setCultureFit(evalData.cultureFit || 4);
      setRecommendation(evalData.recommendation || 'recommended');
      setGeneralNotes(evalData.notes || '');
    } else {
      setRecommendation('recommended');
      setTechnicalNotes('');
      setSoftSkillsNotes('');
      setGeneralNotes('');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Submit Evaluation
  const handleSubmitEvaluation = async (e) => {
    e.preventDefault();
    if (!selectedApp) return;

    if (!interviewerName.trim()) {
      showToast?.('يرجى كتابة اسم القائم بالمقابلة');
      return;
    }

    setIsSubmitting(true);
    try {
      const evalPayload = {
        id: `eval_${Date.now()}`,
        interviewerName: interviewerName.trim(),
        interviewerJobTitle: interviewerJobTitle.trim(),
        interviewDate: interviewDate,
        technicalSkills: Number(technicalSkills),
        technicalNotes: technicalNotes.trim(),
        softSkills: Number(softSkills),
        softSkillsNotes: softSkillsNotes.trim(),
        languageTech: Number(languageTech),
        cultureFit: Number(cultureFit),
        proposedSalary: proposedSalary ? String(proposedSalary) : selectedApp.expectedSalary || '',
        recommendation: recommendation, // recommended | waiting_list | rejected
        notes: generalNotes.trim(),
        submittedAt: new Date().toISOString()
      };

      const scoreResult = calculateEvaluationScore(evalPayload);
      evalPayload.score = scoreResult;

      // Determine next status: 'interviewed' (or 'waiting_list' if recommended as waitlist)
      let nextStatus = 'interviewed';
      if (recommendation === 'waiting_list') {
        nextStatus = 'waiting_list';
      } else if (recommendation === 'rejected') {
        nextStatus = 'rejected';
      }

      const updatedApp = {
        ...selectedApp,
        status: nextStatus,
        interviewEvaluation: evalPayload,
        agreedSalary: proposedSalary || selectedApp.expectedSalary || '',
        updatedAt: new Date().toISOString()
      };

      // Create Admin Notification
      const recLabels = {
        recommended: '🟢 يوصى بالتعيين الفوري',
        waiting_list: '⏳ يوصى بوضعه في قائمة الانتظار',
        rejected: '❌ غير مناسب للوظيفة'
      };

      const newNotif = {
        id: `notif_eval_${Date.now()}`,
        title: '📋 تم تقييم مقابلة مرشح',
        message: `تم إجراء المقابلة للمرشح (${selectedApp.name}) لوظيفة (${selectedApp.targetJobTitle}) بواسطة (${interviewerName}) - النتيجة: ${scoreResult.percentage}% (${recLabels[recommendation] || recommendation})`,
        type: 'recruitment_eval',
        targetTab: 'employees',
        targetSubTab: 'recruitment',
        applicationId: selectedApp.id,
        createdAt: new Date().toISOString(),
        read: false
      };

      const updatedApps = (state?.recruitmentApplications || []).map(a =>
        a.id === selectedApp.id ? updatedApp : a
      );

      const existingNotifs = state?.notifications || [];
      const updatedNotifs = [newNotif, ...existingNotifs];

      const updatedState = {
        ...state,
        recruitmentApplications: updatedApps,
        notifications: updatedNotifs
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      setSelectedApp(updatedApp);
      setSubmissionSuccess(true);
      showToast?.('✅ تم حفظ وإرسال تقييم المقابلة للإدارة العليا بنجاح');
    } catch (err) {
      console.error('Error submitting evaluation:', err);
      showToast?.('حدث خطأ أثناء حفظ التقييم، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      {/* ── Top Header ── */}
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
              📋
            </div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
              {orgName}
            </h1>
            <span style={{ fontSize: '12px', color: '#0d9488', fontWeight: 700 }}>
              بوابة القائم بالمقابلة الشخصية وتقييم المرشحين
            </span>
          </div>
        </div>

        {/* Note: The button [🏢 لوحة شؤون الموظفين] is removed as requested */}
      </header>

      {/* ── Main Content ── */}
      <main style={{ maxWidth: '960px', margin: '24px auto', padding: '0 16px' }}>

        {/* ── Search Bar Section ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
          padding: '28px 24px',
          marginBottom: '24px',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.04)'
        }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍</span>
            <span>استدعاء بيانات المرشح للمقابلة</span>
          </h2>
          <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 18px', lineHeight: '1.6' }}>
            أدخل <strong>رقم هاتف المرشح</strong> أو <strong>كود طلب التعيين</strong> لجلب كافة البيانات المسجلة فوراً وبدء التقييم.
          </p>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              placeholder="اكتب رقم الهاتف (مثال: 01012345678) أو كود الطلب (APP-XXXX)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: '1 1 320px',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '15px',
                background: '#f8fafc',
                border: '1.8px solid #cbd5e1',
                color: '#0f172a',
                fontFamily: "'Cairo', 'Tajawal', sans-serif"
              }}
            />
            <button
              type="submit"
              style={{
                padding: '12px 28px',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '15px',
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
              }}
            >
              بحث وجلب البيانات ⚡
            </button>
          </form>

          {/* Quick Shortcuts for pending candidates */}
          {pendingCandidates.length > 0 && !selectedApp && (
            <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
              <span style={{ fontSize: '12.5px', color: '#0f766e', fontWeight: 800, display: 'block', marginBottom: '8px' }}>
                📋 مرشحون بانتظار المقابلة ({pendingCandidates.length}):
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {pendingCandidates.slice(0, 6).map(cand => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => loadCandidateData(cand)}
                    style={{
                      background: '#f0fdfa',
                      border: '1px solid #ccfbf1',
                      color: '#0f766e',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 700
                    }}
                  >
                    <span>👤 {cand.name}</span>
                    <span style={{ color: '#0284c7', fontSize: '11.5px' }}>({cand.targetJobTitle})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Submission Success Receipt ── */}
        {submissionSuccess && selectedApp && (
          <div className="fade-in" style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1.5px solid #10b981',
            padding: '28px',
            textAlign: 'center',
            marginBottom: '28px',
            boxShadow: '0 12px 30px rgba(16, 185, 129, 0.12)'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 900, color: '#065f46' }}>
              تم حفظ وإرسال تقرير المقابلة للإدارة بنجاح!
            </h3>
            <p style={{ color: '#475569', fontSize: '14px', marginBottom: '16px' }}>
              تم توثيق تقييم المرشح ({selectedApp.name}) بنجاح وإرسال الإشعار والتوصيات للإدارة لاتخاذ القرار النهائي.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedApp(null);
                  setSubmissionSuccess(false);
                  setSearchQuery('');
                }}
                style={{
                  padding: '9px 24px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  background: '#0d9488',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                🔍 تقييم مرشح آخر
              </button>
            </div>
          </div>
        )}

        {/* ── Loaded Candidate Dossier & Evaluation Form ── */}
        {selectedApp && (
          <div className="fade-in">
            {/* Candidate Summary Card */}
            <div style={{
              background: '#ffffff',
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {selectedApp.photoUrl ? (
                    <img src={selectedApp.photoUrl} alt="Photo" style={{ width: '64px', height: '64px', borderRadius: '14px', objectFit: 'cover', border: '2px solid #0d9488' }} />
                  ) : (
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '14px',
                      background: '#f0fdfa',
                      color: '#0d9488',
                      fontSize: '24px',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #ccfbf1'
                    }}>
                      {selectedApp.name.charAt(0)}
                    </div>
                  )}

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                        {selectedApp.name}
                      </h3>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        background: APPLICATION_STATUSES[selectedApp.status]?.bgColor || '#f1f5f9',
                        color: APPLICATION_STATUSES[selectedApp.status]?.color || '#334155',
                        border: `1px solid ${APPLICATION_STATUSES[selectedApp.status]?.borderColor || '#cbd5e1'}`
                      }}>
                        {APPLICATION_STATUSES[selectedApp.status]?.label || selectedApp.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                      الوظيفة المتقدم لها: <strong style={{ color: '#0284c7' }}>{selectedApp.targetJobTitle}</strong> ({selectedApp.department}) · كود الطلب: <span style={{ fontFamily: 'monospace', color: '#d97706' }}>{selectedApp.code}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Contact & CV */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href={`https://wa.me/2${selectedApp.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    💬 واتساب
                  </a>
                  <a
                    href={`tel:${selectedApp.phone}`}
                    style={{ background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    📞 اتصال ({selectedApp.phone})
                  </a>
                  {selectedApp.cvUrl && (
                    <a
                      href={selectedApp.cvUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1', padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      📄 عرض الـ CV
                    </a>
                  )}
                </div>
              </div>

              {/* Detailed Grid Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginTop: '18px',
                background: '#f8fafc',
                padding: '14px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                border: '1px solid #e2e8f0',
                color: '#1e293b'
              }}>
                <div>🎓 <strong>المؤهل:</strong> {selectedApp.qualification || 'غير محدد'} ({selectedApp.graduationYear || ''})</div>
                <div>🏛️ <strong>الجامعة:</strong> {selectedApp.university || 'غير محدد'} ({selectedApp.grade || ''})</div>
                <div>⏳ <strong>سنوات الخبرة:</strong> {selectedApp.experienceYears || '0'} سنوات</div>
                <div>💰 <strong>الراتب المتوقع:</strong> {selectedApp.expectedSalary ? `${selectedApp.expectedSalary} ج.م` : 'غير محدد'}</div>
                <div>🏠 <strong>العنوان:</strong> {selectedApp.address || 'غير محدد'}</div>
                <div>🪪 <strong>الرقم القومي:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedApp.nationalId || '—'}</span></div>
              </div>

              {selectedApp.previousExperience && (
                <div style={{ marginTop: '12px', fontSize: '13px', color: '#334155', background: '#f1f5f9', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  💼 <strong>الخبرات السابقة:</strong> {selectedApp.previousExperience}
                </div>
              )}
            </div>

            {/* Evaluation Form */}
            <form onSubmit={handleSubmitEvaluation} style={{
              background: '#ffffff',
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
              padding: '28px 24px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.05)'
            }}>
              <h3 style={{ margin: '0 0 18px', fontSize: '19px', fontWeight: 900, color: '#0f766e', borderBottom: '1.5px solid #f0fdfa', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⭐️</span>
                <span>استمارة تقييم المقابلة الشخصية والمهنية</span>
              </h3>

              {/* Interviewer Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    اسم القائم بالمقابلة *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="د. مصطفى أحمد"
                    value={interviewerName}
                    onChange={e => setInterviewerName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الصفة الوظيفية للمقابل
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="مدير فرع / مسؤول الموارد البشرية"
                    value={interviewerJobTitle}
                    onChange={e => setInterviewerJobTitle(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    تاريخ المقابلة
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={interviewDate}
                    onChange={e => setInterviewDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  />
                </div>
              </div>

              {/* Evaluation Rubrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '24px' }}>
                
                {/* 1. Technical & Pharmacy Competence */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '15px', color: '#0f172a' }}>1. الكفاءة الفنية والتخصصية</strong>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>المعرفة الصيدلية/الفنية، الخبرة العملية، الدقة والتعامل مع المنظومة</div>
                    </div>

                    {/* Star / Number Rating */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setTechnicalSkills(star)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: technicalSkills >= star ? '#f59e0b' : '#ffffff',
                            color: technicalSkills >= star ? '#ffffff' : '#64748b',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                            fontWeight: 900,
                            fontSize: '13px',
                            boxShadow: technicalSkills >= star ? '0 2px 6px rgba(245, 158, 11, 0.4)' : 'none'
                          }}
                        >
                          ★ {star}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="text"
                    className="form-control"
                    placeholder="ملاحظات فنية حول مستوى المرشح الصيدلي/الفني..."
                    value={technicalNotes}
                    onChange={e => setTechnicalNotes(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', background: '#ffffff', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  />
                </div>

                {/* 2. Soft Skills & Communication */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '15px', color: '#0f172a' }}>2. المهارات الشخصية والسلوكية والتواصل</strong>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>اللباقة، المظهر العام، التعامل مع العملاء، العمل تحت الضغط</div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSoftSkills(star)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: softSkills >= star ? '#f59e0b' : '#ffffff',
                            color: softSkills >= star ? '#ffffff' : '#64748b',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                            fontWeight: 900,
                            fontSize: '13px',
                            boxShadow: softSkills >= star ? '0 2px 6px rgba(245, 158, 11, 0.4)' : 'none'
                          }}
                        >
                          ★ {star}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="text"
                    className="form-control"
                    placeholder="ملاحظات سلوكية وتواصل..."
                    value={softSkillsNotes}
                    onChange={e => setSoftSkillsNotes(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', background: '#ffffff', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  />
                </div>

                {/* 3. Language & Computer Skills & Culture Fit */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>3. برامج الحاسب واللغات</strong>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setLanguageTech(star)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: languageTech >= star ? '#0d9488' : '#ffffff',
                              color: languageTech >= star ? '#fff' : '#64748b',
                              border: '1px solid #cbd5e1',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: 800
                            }}
                          >
                            {star}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>4. الانضباط والالتزام والملاءمة</strong>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setCultureFit(star)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: cultureFit >= star ? '#0d9488' : '#ffffff',
                              color: cultureFit >= star ? '#fff' : '#64748b',
                              border: '1px solid #cbd5e1',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: 800
                            }}
                          >
                            {star}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Proposed Salary & Final Recommendation */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الراتب المقترح / المتفق عليه أثناء المقابلة
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="مثال: 6500"
                    value={proposedSalary}
                    onChange={e => setProposedSalary(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    التوصية النهائية للمقابل *
                  </label>
                  <select
                    className="form-control"
                    value={recommendation}
                    onChange={e => setRecommendation(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      fontWeight: 800,
                      background: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      color: recommendation === 'recommended' ? '#047857' : (recommendation === 'waiting_list' ? '#b45309' : '#b91c1c')
                    }}
                  >
                    <option value="recommended">🟢 يوصى بالتعيين الفوري (Recommended)</option>
                    <option value="waiting_list">⏳ يوصى بوضعه في قائمة الانتظار (Talent Pool)</option>
                    <option value="rejected">❌ غير مناسب للوظيفة / مرفوض (Not Suitable)</option>
                  </select>
                </div>
              </div>

              {/* General Notes */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  ملاحظات وتوصيات المقابل للإدارة العليا
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="اكتب أي ملاحظات إضافية حول جاهزية المرشح، نقاط القوة والضعف..."
                  value={generalNotes}
                  onChange={e => setGeneralNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '12px 32px',
                    borderRadius: '12px',
                    fontWeight: 900,
                    fontSize: '15px',
                    background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: isSubmitting ? 'wait' : 'pointer',
                    boxShadow: '0 4px 16px rgba(13, 148, 136, 0.35)'
                  }}
                >
                  {isSubmitting ? 'جاري الإرسال...' : '🚀 اعتماد وإرسال تقييم المقابلة للإدارة'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
