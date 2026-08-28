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
      minHeight: '100vh',
      background: 'var(--background, #0f172a)',
      color: 'var(--text, #f8fafc)',
      fontFamily: "'Tajawal', 'Cairo', sans-serif",
      direction: 'rtl',
      padding: '0 0 60px 0'
    }}>
      {/* ── Top Header ── */}
      <header style={{
        background: 'rgba(30, 41, 59, 0.85)',
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
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '20px',
              color: '#fff'
            }}>
              HR
            </div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text, #fff)' }}>
              {orgName}
            </h1>
            <span style={{ fontSize: '12px', color: '#c4b5fd' }}>
              بوابة القائم بالمقابلة الشخصية واستمارة تقييم المرشحين
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
            href="/admin"
            style={{
              fontSize: '13px',
              color: '#c4b5fd',
              textDecoration: 'none',
              fontWeight: 'bold',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(196, 181, 253, 0.3)',
              background: 'rgba(196, 181, 253, 0.08)'
            }}
          >
            🏢 لوحة شؤون الموظفين
          </a>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{ maxWidth: '960px', margin: '30px auto', padding: '0 16px' }}>

        {/* ── Search Bar Section ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(46, 16, 101, 0.4), rgba(15, 23, 42, 0.8))',
          borderRadius: '20px',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          padding: '28px 24px',
          marginBottom: '28px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)'
        }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: 800, color: '#fff' }}>
            🔍 استدعاء بيانات المرشح للمقابلة
          </h2>
          <p style={{ color: '#cbd5e1', fontSize: '14px', margin: '0 0 18px', lineHeight: '1.6' }}>
            أدخل <strong>رقم هاتف المرشح</strong> أو <strong>كود طلب التعيين</strong> لجلب كافة البيانات التي ملأها المرشح فوراً وبدء تقييم المقابلة.
          </p>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              placeholder="اكتب رقم الهاتف (مثال: 01012345678) أو كود الطلب..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: '1 1 320px',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '15px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                color: '#fff'
              }}
            />
            <button
              type="submit"
              className="btn btn-start"
              style={{
                padding: '12px 28px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '15px',
                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)'
              }}
            >
              بحث وجلب البيانات ⚡
            </button>
          </form>

          {/* Quick Shortcuts for pending candidates */}
          {pendingCandidates.length > 0 && !selectedApp && (
            <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
              <span style={{ fontSize: '12.5px', color: '#a78bfa', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                📋 مرشحون بانتظار المقابلة ({pendingCandidates.length}):
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {pendingCandidates.slice(0, 5).map(cand => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => loadCandidateData(cand)}
                    style={{
                      background: 'rgba(139, 92, 246, 0.15)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      color: '#ddd6fe',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>👤 {cand.name}</span>
                    <span style={{ color: '#fbbf24', fontSize: '11px' }}>({cand.targetJobTitle})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Submission Success Receipt ── */}
        {submissionSuccess && selectedApp && (
          <div className="fade-in" style={{
            background: 'var(--surface, #1e293b)',
            borderRadius: '20px',
            border: '1px solid #10b981',
            padding: '28px',
            textAlign: 'center',
            marginBottom: '28px',
            boxShadow: '0 10px 30px rgba(16, 185, 129, 0.15)'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: '#10b981' }}>
              تم حفظ وإرسال تقرير المقابلة للإدارة العليا!
            </h3>
            <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '16px' }}>
              تم توثيق تقييم المرشح ({selectedApp.name}) بنجاح وإرسال الإشعار والتوصيات للإدارة لاتخاذ القرار النهائي.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSelectedApp(null);
                  setSubmissionSuccess(false);
                  setSearchQuery('');
                }}
                style={{ padding: '8px 20px', borderRadius: '10px' }}
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
              background: 'var(--surface, #1e293b)',
              borderRadius: '20px',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {selectedApp.photoUrl ? (
                    <img src={selectedApp.photoUrl} alt="Photo" style={{ width: '64px', height: '64px', borderRadius: '14px', objectFit: 'cover', border: '2px solid #8b5cf6' }} />
                  ) : (
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '14px',
                      background: 'rgba(139, 92, 246, 0.2)',
                      color: '#a78bfa',
                      fontSize: '24px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid rgba(139, 92, 246, 0.4)'
                    }}>
                      {selectedApp.name.charAt(0)}
                    </div>
                  )}

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff' }}>
                        {selectedApp.name}
                      </h3>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        background: APPLICATION_STATUSES[selectedApp.status]?.bgColor || 'rgba(255,255,255,0.1)',
                        color: APPLICATION_STATUSES[selectedApp.status]?.color || '#fff'
                      }}>
                        {APPLICATION_STATUSES[selectedApp.status]?.label || selectedApp.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                      الوظيفة المتقدم لها: <strong style={{ color: '#38bdf8' }}>{selectedApp.targetJobTitle}</strong> ({selectedApp.department}) · كود الطلب: <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{selectedApp.code}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Contact & CV */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href={`https://wa.me/2${selectedApp.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost"
                    style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700 }}
                  >
                    💬 واتساب
                  </a>
                  <a
                    href={`tel:${selectedApp.phone}`}
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700 }}
                  >
                    📞 اتصال ({selectedApp.phone})
                  </a>
                  {selectedApp.cvUrl && (
                    <a
                      href={selectedApp.cvUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost"
                      style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700 }}
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
                background: 'rgba(15, 23, 42, 0.5)',
                padding: '14px 16px',
                borderRadius: '12px',
                fontSize: '13px'
              }}>
                <div>🎓 <strong>المؤهل:</strong> {selectedApp.qualification || 'غير محدد'} ({selectedApp.graduationYear || ''})</div>
                <div>🏛️ <strong>الجامعة:</strong> {selectedApp.university || 'غير محدد'} ({selectedApp.grade || ''})</div>
                <div>⏳ <strong>سنوات الخبرة:</strong> {selectedApp.experienceYears || '0'} سنوات</div>
                <div>💰 <strong>الراتب المتوقع:</strong> {selectedApp.expectedSalary ? `${selectedApp.expectedSalary} ج.م` : 'غير محدد'}</div>
                <div>🏠 <strong>العنوان:</strong> {selectedApp.address || 'غير محدد'}</div>
                <div>🪪 <strong>الرقم القومي:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedApp.nationalId || '—'}</span></div>
              </div>

              {selectedApp.previousExperience && (
                <div style={{ marginTop: '12px', fontSize: '13px', color: '#cbd5e1', background: 'rgba(15, 23, 42, 0.3)', padding: '10px 14px', borderRadius: '10px' }}>
                  💼 <strong>الخبرات السابقة:</strong> {selectedApp.previousExperience}
                </div>
              )}
            </div>

            {/* Evaluation Form */}
            <form onSubmit={handleSubmitEvaluation} style={{
              background: 'var(--surface, #1e293b)',
              borderRadius: '20px',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
              padding: '28px 24px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)'
            }}>
              <h3 style={{ margin: '0 0 18px', fontSize: '20px', fontWeight: 800, color: '#a78bfa', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⭐️</span>
                <span>استمارة تقييم المقابلة الشخصية والمهنية</span>
              </h3>

              {/* Interviewer Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    اسم القائم بالمقابلة *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="د. مصطفى أحمد"
                    value={interviewerName}
                    onChange={e => setInterviewerName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    الصفة الوظيفية للمقابل
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="مدير فرع / مسؤول الموارد البشرية"
                    value={interviewerJobTitle}
                    onChange={e => setInterviewerJobTitle(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    تاريخ المقابلة
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={interviewDate}
                    onChange={e => setInterviewDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                  />
                </div>
              </div>

              {/* Evaluation Rubrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                
                {/* 1. Technical & Pharmacy Competence */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '18px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '15px', color: '#fff' }}>1. الكفاءة الفنية والتخصصية</strong>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>المعرفة الصيدلية/الفنية، الخبرة العملية، الدقة والتعامل مع المنظومة</div>
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
                            background: technicalSkills >= star ? '#f59e0b' : 'rgba(255, 255, 255, 0.08)',
                            color: technicalSkills >= star ? '#000' : '#94a3b8',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 800,
                            fontSize: '13px'
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
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}
                  />
                </div>

                {/* 2. Soft Skills & Communication */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '18px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '15px', color: '#fff' }}>2. المهارات الشخصية والسلوكية والتواصل</strong>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>اللباقة، المظهر العام، التعامل مع العملاء، العمل تحت الضغط</div>
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
                            background: softSkills >= star ? '#f59e0b' : 'rgba(255, 255, 255, 0.08)',
                            color: softSkills >= star ? '#000' : '#94a3b8',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 800,
                            fontSize: '13px'
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
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}
                  />
                </div>

                {/* 3. Language & Computer Skills & Culture Fit */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#fff' }}>3. برامج الحاسب واللغات</strong>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setLanguageTech(star)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: languageTech >= star ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: 700
                            }}
                          >
                            {star}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#fff' }}>4. الانضباط والالتزام والملاءمة</strong>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setCultureFit(star)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: cultureFit >= star ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: 700
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
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    الراتب المقترح / المتفق عليه أثناء المقابلة
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="مثال: 6500"
                    value={proposedSalary}
                    onChange={e => setProposedSalary(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
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
                      color: recommendation === 'recommended' ? '#10b981' : (recommendation === 'waiting_list' ? '#f59e0b' : '#ef4444')
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  ملاحظات وتوصيات المقابل للإدارة العليا
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="اكتب أي ملاحظات إضافية حول جاهزية المرشح، نقاط القوة والضعف..."
                  value={generalNotes}
                  onChange={e => setGeneralNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px' }}
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="btn btn-ghost"
                  style={{ padding: '10px 20px', borderRadius: '10px' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-start"
                  style={{
                    padding: '12px 32px',
                    borderRadius: '12px',
                    fontWeight: 900,
                    fontSize: '15px',
                    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                    boxShadow: '0 4px 16px rgba(139, 92, 246, 0.4)'
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
