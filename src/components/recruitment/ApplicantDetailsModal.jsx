import React, { useState } from 'react';
import { APPLICATION_STATUSES, calculateEvaluationScore } from '../../utils/recruitmentHelper';

export default function ApplicantDetailsModal({
  isOpen,
  onClose,
  applicant,
  branches = [],
  onOpenScheduleModal,
  onApproveAndHire,
  onMoveToWaitingList,
  onReject,
  onDelete,
  onUpdateNotes,
  showToast
}) {
  if (!isOpen || !applicant) return null;

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'education' | 'documents' | 'evaluation'
  const [internalNotes, setInternalNotes] = useState(applicant.notes || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const statusConfig = APPLICATION_STATUSES[applicant.status] || APPLICATION_STATUSES.new;
  const evaluation = applicant.interviewEvaluation;
  const evalScore = evaluation ? calculateEvaluationScore(evaluation) : null;

  const preferredBranch = branches.find(b => String(b.id) === String(applicant.preferredBranchId));

  const handleSaveNotes = () => {
    onUpdateNotes?.(applicant.id, internalNotes);
    setIsEditingNotes(false);
    showToast?.('💾 تم حفظ ملاحظات الموارد البشرية');
  };

  const handleSendWhatsApp = (customMsg = '') => {
    const phone = applicant.whatsappPhone || applicant.phone;
    if (!phone) {
      showToast?.('لا يوجد رقم هاتف مسجل');
      return;
    }
    const cleanPhone = String(phone).replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('2') ? cleanPhone : `2${cleanPhone}`;
    const encoded = encodeURIComponent(customMsg || `مرحباً ${applicant.name}، بخصوص طلب التوظيف المقدم لوظيفة (${applicant.targetJobTitle})...`);
    window.open(`https://wa.me/${fullPhone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-card fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '850px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #1e293b)',
          borderRadius: '24px',
          padding: '24px',
          fontFamily: "'Tajawal', 'Cairo', sans-serif",
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {applicant.photoUrl ? (
              <img src={applicant.photoUrl} alt="Photo" style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover', border: '2px solid #38bdf8' }} />
            ) : (
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontSize: '22px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(56, 189, 248, 0.3)'
              }}>
                {applicant.name.charAt(0)}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text, #fff)' }}>
                  {applicant.name}
                </h3>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  background: statusConfig.bgColor,
                  color: statusConfig.color,
                  border: `1px solid ${statusConfig.borderColor}`
                }}>
                  {statusConfig.icon} {statusConfig.label}
                </span>
              </div>

              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '3px' }}>
                الوظيفة: <strong style={{ color: '#38bdf8' }}>{applicant.targetJobTitle}</strong> ({applicant.department}) · كود الطلب: <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{applicant.code}</span> · تاريخ التقديم: {new Date(applicant.createdAt).toLocaleDateString('ar-EG')}
              </div>
            </div>
          </div>

          <button type="button" className="close-btn" onClick={onClose} style={{ fontSize: '20px' }}>✕</button>
        </div>

        {/* Navigation Tabs Header */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 0',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          flexShrink: 0
        }}>
          <button
            type="button"
            className={`btn ${activeTab === 'profile' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('profile')}
            style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
          >
            👤 البيانات الشخصية والاتصال
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'education' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('education')}
            style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
          >
            🎓 المؤهلات والخبرات
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'documents' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('documents')}
            style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
          >
            📁 المستندات والمرفقات ({[applicant.cvUrl, applicant.nationalIdPhotoUrl, applicant.graduationCertUrl, applicant.licensePhotoUrl].filter(Boolean).length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'evaluation' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('evaluation')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              color: evaluation ? '#10b981' : undefined
            }}
          >
            ⭐️ تقرير المقابلة {evaluation && `(${evalScore?.percentage}%)`}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 4px' }}>
          
          {/* Tab 1: Personal Profile & Contact */}
          {activeTab === 'profile' && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>الاسم الرباعي:</span>
                  <strong style={{ color: '#fff', fontSize: '14px' }}>{applicant.name}</strong>
                </div>

                {applicant.nickname && (
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>الاسم الشائع / اللقب:</span>
                    <strong style={{ color: '#fff', fontSize: '14px' }}>{applicant.nickname}</strong>
                  </div>
                )}

                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>الرقم القومي:</span>
                  <strong style={{ color: '#fbbf24', fontSize: '14px', fontFamily: 'monospace' }}>{applicant.nationalId || '—'}</strong>
                </div>

                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>تاريخ الميلاد والنوع:</span>
                  <span style={{ color: '#fff', fontSize: '13.5px' }}>{applicant.dob || '—'} ({applicant.gender || 'ذكر'})</span>
                </div>

                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>الحالة الاجتماعية:</span>
                  <span style={{ color: '#fff', fontSize: '13.5px' }}>{applicant.maritalStatus || 'أعزب'}</span>
                </div>

                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>الفرع المفضل:</span>
                  <span style={{ color: '#38bdf8', fontSize: '13.5px', fontWeight: 700 }}>
                    {preferredBranch ? preferredBranch.name : (applicant.preferredBranchId || 'أي فرع متاح')}
                  </span>
                </div>

                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>نوع الدوام والراتب المتوقع:</span>
                  <span style={{ color: '#fff', fontSize: '13.5px' }}>
                    {applicant.contractTypePreference || 'دوام كامل'} {applicant.expectedSalary ? `· ${applicant.expectedSalary} ج.م` : ''}
                  </span>
                </div>

                <div>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>تاريخ الاستعداد للبدء:</span>
                  <span style={{ color: '#fff', fontSize: '13.5px' }}>{applicant.availableStartDate || 'فوري'}</span>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>العنوان ومحل الإقامة:</span>
                  <span style={{ color: '#fff', fontSize: '13.5px' }}>{applicant.address || '—'}</span>
                </div>
              </div>

              {/* Contact Card */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#60a5fa' }}>📞 أرقام وبيانات الاتصال</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '11.5px', display: 'block' }}>رقم الهاتف الأساسي:</span>
                    <a href={`tel:${applicant.phone}`} style={{ color: '#38bdf8', fontSize: '15px', fontWeight: 800, textDecoration: 'none', direction: 'ltr', display: 'inline-block' }}>
                      {applicant.phone}
                    </a>
                  </div>

                  {applicant.whatsappPhone && (
                    <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                      <span style={{ color: '#86efac', fontSize: '11.5px', display: 'block' }}>رقم الواتساب:</span>
                      <a href={`https://wa.me/2${applicant.whatsappPhone}`} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontSize: '15px', fontWeight: 800, textDecoration: 'none', direction: 'ltr', display: 'inline-block' }}>
                        {applicant.whatsappPhone} 💬
                      </a>
                    </div>
                  )}

                  {applicant.relativePhone && (
                    <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '11.5px', display: 'block' }}>هاتف الطوارئ / قريب:</span>
                      <span style={{ color: '#fff', fontSize: '14px', fontFamily: 'monospace' }}>{applicant.relativePhone}</span>
                    </div>
                  )}

                  {applicant.email && (
                    <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '11.5px', display: 'block' }}>البريد الإلكتروني:</span>
                      <span style={{ color: '#fff', fontSize: '13px' }}>{applicant.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scheduled Interview Section */}
              {applicant.interviewSchedule && (
                <div style={{
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  padding: '16px',
                  borderRadius: '14px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', color: '#c4b5fd' }}>📅 تفاصيل موعد المقابلة المجدولة</h4>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onOpenScheduleModal?.(applicant)}
                      style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
                    >
                      تعديل الموعد
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '13px' }}>
                    <div><strong>التاريخ:</strong> {applicant.interviewSchedule.date}</div>
                    <div><strong>الوقت:</strong> {applicant.interviewSchedule.time}</div>
                    <div><strong>المكان:</strong> {applicant.interviewSchedule.locationLabel}</div>
                    {applicant.interviewSchedule.interviewerName && (
                      <div><strong>القائم بالمقابلة:</strong> {applicant.interviewSchedule.interviewerName}</div>
                    )}
                  </div>
                  {applicant.interviewSchedule.notes && (
                    <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#cbd5e1' }}>
                      <strong>ملاحظات:</strong> {applicant.interviewSchedule.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Education & Experience */}
          {activeTab === 'education' && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#60a5fa' }}>🎓 المؤهل الأكاديمي</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13.5px' }}>
                  <div><strong>المؤهل:</strong> {applicant.qualification || 'غير محدد'}</div>
                  <div><strong>الجامعة / المعهد:</strong> {applicant.university || 'غير محدد'}</div>
                  <div><strong>سنة التخرج:</strong> {applicant.graduationYear || '—'}</div>
                  <div><strong>التقدير العام:</strong> {applicant.grade || '—'}</div>
                  <div><strong>سنوات الخبرة:</strong> {applicant.experienceYears || '0'} سنوات</div>
                </div>
              </div>

              {applicant.previousExperience && (
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#60a5fa' }}>💼 أماكن العمل والخبرات السابقة</h4>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#cbd5e1', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                    {applicant.previousExperience}
                  </p>
                </div>
              )}

              {applicant.skills && (
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#60a5fa' }}>⚡ المهارات واللغات وبرامج الحاسب</h4>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#cbd5e1', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                    {applicant.skills}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Documents & Uploaded Files */}
          {activeTab === 'documents' && (
            <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {/* CV File */}
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <h5 style={{ margin: '0 0 8px', color: '#38bdf8', fontSize: '14px' }}>📄 السيرة الذاتية (CV)</h5>
                {applicant.cvUrl ? (
                  <div>
                    <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>
                      {applicant.cvFileName || 'ملف السيرة الذاتية'}
                    </span>
                    <a
                      href={applicant.cvUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-start"
                      style={{ padding: '6px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>👁️</span>
                      <span>معاينة وتحميل الـ CV</span>
                    </a>
                  </div>
                ) : (
                  <span style={{ color: '#64748b', fontSize: '12.5px' }}>لم يتم رفع ملف سيرة ذاتية</span>
                )}
              </div>

              {/* National ID Photo */}
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <h5 style={{ margin: '0 0 8px', color: '#38bdf8', fontSize: '14px' }}>🪪 بطاقة الرقم القومي</h5>
                {applicant.nationalIdPhotoUrl ? (
                  <div>
                    <img src={applicant.nationalIdPhotoUrl} alt="National ID" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }} />
                    <a href={applicant.nationalIdPhotoUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }}>
                      عرض بحجم كامل
                    </a>
                  </div>
                ) : (
                  <span style={{ color: '#64748b', fontSize: '12.5px' }}>لم يتم رفع صورة البطاقة</span>
                )}
              </div>

              {/* Graduation Certificate */}
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <h5 style={{ margin: '0 0 8px', color: '#38bdf8', fontSize: '14px' }}>📜 شهادة التخرج / الكارنيه</h5>
                {applicant.graduationCertUrl ? (
                  <div>
                    <img src={applicant.graduationCertUrl} alt="Certificate" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }} />
                    <a href={applicant.graduationCertUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }}>
                      عرض بحجم كامل
                    </a>
                  </div>
                ) : (
                  <span style={{ color: '#64748b', fontSize: '12.5px' }}>لم يتم رفع صورة الشهادة</span>
                )}
              </div>

              {/* License Photo */}
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <h5 style={{ margin: '0 0 8px', color: '#38bdf8', fontSize: '14px' }}>🚗 ترخيص مزاولة المهنة / رخصة القيادة</h5>
                {applicant.licensePhotoUrl ? (
                  <div>
                    <img src={applicant.licensePhotoUrl} alt="License" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }} />
                    <a href={applicant.licensePhotoUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }}>
                      عرض بحجم كامل
                    </a>
                  </div>
                ) : (
                  <span style={{ color: '#64748b', fontSize: '12.5px' }}>لم يتم رفع الترخيص</span>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Interview Evaluation Report */}
          {activeTab === 'evaluation' && (
            <div className="fade-in">
              {evaluation ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Score Highlight Banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(15, 23, 42, 0.6))',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '18px 24px',
                    borderRadius: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px'
                  }}>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '12.5px' }}>نتيجة تقييم المقابلة:</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: evalScore?.badgeColor || '#10b981' }}>
                        {evalScore?.percentage}% <span style={{ fontSize: '16px', fontWeight: 700 }}>({evalScore?.ratingLabel})</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                        👤 المقابل: <strong>{evaluation.interviewerName}</strong> ({evaluation.interviewerJobTitle}) · تاريخ: {evaluation.interviewDate}
                      </div>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <span style={{
                        padding: '6px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 800,
                        background: evaluation.recommendation === 'recommended' ? 'rgba(16, 185, 129, 0.2)' : (evaluation.recommendation === 'waiting_list' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                        color: evaluation.recommendation === 'recommended' ? '#10b981' : (evaluation.recommendation === 'waiting_list' ? '#fbbf24' : '#ef4444'),
                        border: '1px solid currentColor'
                      }}>
                        {evaluation.recommendation === 'recommended' ? '🟢 يوصى بالتعيين الفوري' : (evaluation.recommendation === 'waiting_list' ? '⏳ يوصى بقائمة الانتظار' : '❌ غير مناسب / مرفوض')}
                      </span>
                    </div>
                  </div>

                  {/* Rubrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>الكفاءة الفنية والتخصص:</span>
                        <strong style={{ color: '#fbbf24' }}>★ {evaluation.technicalSkills} / 5</strong>
                      </div>
                      {evaluation.technicalNotes && <div style={{ fontSize: '12px', color: '#cbd5e1' }}>{evaluation.technicalNotes}</div>}
                    </div>

                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>المهارات السلوكية والتواصل:</span>
                        <strong style={{ color: '#fbbf24' }}>★ {evaluation.softSkills} / 5</strong>
                      </div>
                      {evaluation.softSkillsNotes && <div style={{ fontSize: '12px', color: '#cbd5e1' }}>{evaluation.softSkillsNotes}</div>}
                    </div>

                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>البرامج واللغات:</span>
                        <strong style={{ color: '#38bdf8' }}>{evaluation.languageTech} / 5</strong>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>الانضباط والملاءمة:</span>
                        <strong style={{ color: '#38bdf8' }}>{evaluation.cultureFit} / 5</strong>
                      </div>
                    </div>
                  </div>

                  {evaluation.proposedSalary && (
                    <div style={{ fontSize: '13.5px', background: 'rgba(56, 189, 248, 0.08)', padding: '10px 14px', borderRadius: '10px', color: '#38bdf8' }}>
                      💰 <strong>الراتب المقترح أثناء المقابلة:</strong> {evaluation.proposedSalary} ج.م شهرياً
                    </div>
                  )}

                  {evaluation.notes && (
                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '12px' }}>
                      <strong style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>ملاحظات وتوصيات المقابل:</strong>
                      <p style={{ margin: 0, fontSize: '13.5px', color: '#fff', lineHeight: '1.6' }}>{evaluation.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8' }}>
                  <div style={{ fontSize: '36px', marginBottom: '10px' }}>⏳</div>
                  <h4 style={{ margin: '0 0 6px', color: '#fff' }}>لم يتم تسجيل تقييم المقابلة بعد</h4>
                  <p style={{ fontSize: '13px', margin: '0 0 16px' }}>يمكن للقائم بالمقابلة تقييم المرشح عبر رابط المقابلات أو تسجيله من هنا مباشرة.</p>
                </div>
              )}
            </div>
          )}

          {/* Internal HR Notes Box */}
          <div style={{ marginTop: '16px', background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#cbd5e1' }}>📝 ملاحظات داخلية لإدارة الموارد البشرية:</span>
              {!isEditingNotes ? (
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(true)}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                >
                  تعديل الملاحظات
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="btn btn-start"
                  style={{ padding: '2px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                >
                  حفظ
                </button>
              )}
            </div>
            {isEditingNotes ? (
              <textarea
                className="form-control"
                rows={2}
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                placeholder="اكتب أي ملاحظات إدارية خاصة بهذا الطلب..."
                style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', fontSize: '12.5px' }}
              />
            ) : (
              <div style={{ fontSize: '13px', color: internalNotes ? '#fff' : '#64748b' }}>
                {internalNotes || 'لا توجد ملاحظات داخلية مدونة.'}
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Bar (Bottom Controls) */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border)',
          paddingTop: '16px',
          marginTop: '10px',
          flexWrap: 'wrap',
          gap: '10px',
          flexShrink: 0
        }}>
          {/* Quick Contact buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => handleSendWhatsApp()}
              style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
            >
              💬 واتساب
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onOpenScheduleModal?.(applicant)}
              style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
            >
              📅 جدولة مقابلة
            </button>
          </div>

          {/* Decision Actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {applicant.status !== 'hired' && (
              <button
                type="button"
                className="btn btn-start"
                onClick={() => onApproveAndHire?.(applicant)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontWeight: 900,
                  fontSize: '13.5px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
              >
                ✅ الموافقة والتعيين الفوري
              </button>
            )}

            {applicant.status !== 'waiting_list' && applicant.status !== 'hired' && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onMoveToWaitingList?.(applicant)}
                style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#fbbf24', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
              >
                ⏳ قائمة الانتظار
              </button>
            )}

            {applicant.status !== 'rejected' && applicant.status !== 'hired' && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onReject?.(applicant)}
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
              >
                ❌ رفض الطلب
              </button>
            )}

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onDelete?.(applicant.id)}
              style={{ color: '#94a3b8', padding: '8px 10px', borderRadius: '8px', fontSize: '12px' }}
              title="حذف الطلب نهائياً"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
