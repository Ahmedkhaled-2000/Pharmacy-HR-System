import React, { useState } from 'react';
import { APPLICATION_STATUSES, calculateEvaluationScore } from '../../utils/recruitmentHelper';
import { openDocumentSafely, downloadDocument } from '../../utils/documentViewer';

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
  const [previewDoc, setPreviewDoc] = useState(null); // { url, title, fileName }

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
          background: '#ffffff',
          borderRadius: '24px',
          padding: '24px',
          fontFamily: "'Cairo', 'Tajawal', sans-serif",
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.15)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '16px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {applicant.photoUrl ? (
              <img src={applicant.photoUrl} alt="Photo" style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover', border: '2px solid #0d9488' }} />
            ) : (
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: '#f0fdfa',
                color: '#0d9488',
                fontSize: '22px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #ccfbf1'
              }}>
                {applicant.name.charAt(0)}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
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

              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px', fontWeight: 600 }}>
                الوظيفة: <strong style={{ color: '#0284c7' }}>{applicant.targetJobTitle}</strong> ({applicant.department}) · كود الطلب: <span style={{ fontFamily: 'monospace', color: '#d97706', fontWeight: 800 }}>{applicant.code}</span> · تاريخ التقديم: {new Date(applicant.createdAt).toLocaleDateString('ar-EG')}
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
          borderBottom: '1px solid #e2e8f0',
          overflowX: 'auto',
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              border: activeTab === 'profile' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'profile' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f8fafc',
              color: activeTab === 'profile' ? '#ffffff' : '#334155'
            }}
          >
            👤 البيانات الشخصية والاتصال
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('education')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              border: activeTab === 'education' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'education' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f8fafc',
              color: activeTab === 'education' ? '#ffffff' : '#334155'
            }}
          >
            🎓 المؤهلات والخبرات
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              border: activeTab === 'documents' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'documents' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f8fafc',
              color: activeTab === 'documents' ? '#ffffff' : '#334155'
            }}
          >
            📁 المستندات والمرفقات ({[applicant.cvUrl, applicant.nationalIdPhotoUrl, applicant.graduationCertUrl, applicant.licensePhotoUrl].filter(Boolean).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('evaluation')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              border: activeTab === 'evaluation' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'evaluation' ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#f8fafc',
              color: activeTab === 'evaluation' ? '#ffffff' : '#334155'
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
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid #e2e8f0'
              }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>الاسم الرباعي:</span>
                  <strong style={{ color: '#0f172a', fontSize: '14px' }}>{applicant.name}</strong>
                </div>

                {applicant.nickname && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>الاسم الشائع / اللقب:</span>
                    <strong style={{ color: '#0f172a', fontSize: '14px' }}>{applicant.nickname}</strong>
                  </div>
                )}

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>الرقم القومي:</span>
                  <strong style={{ color: '#d97706', fontSize: '14px', fontFamily: 'monospace' }}>{applicant.nationalId || '—'}</strong>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>تاريخ الميلاد والنوع:</span>
                  <span style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: 600 }}>{applicant.dob || '—'} ({applicant.gender || 'ذكر'})</span>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>الحالة الاجتماعية:</span>
                  <span style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: 600 }}>{applicant.maritalStatus || 'أعزب'}</span>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>الفرع المفضل:</span>
                  <span style={{ color: '#0284c7', fontSize: '13.5px', fontWeight: 800 }}>
                    {preferredBranch ? preferredBranch.name : (applicant.preferredBranchId || 'أي فرع متاح')}
                  </span>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>نوع الدوام والراتب المتوقع:</span>
                  <span style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: 600 }}>
                    {applicant.contractTypePreference || 'دوام كامل'} {applicant.expectedSalary ? `· ${applicant.expectedSalary} ج.م` : ''}
                  </span>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>تاريخ الاستعداد للبدء:</span>
                  <span style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: 600 }}>{applicant.availableStartDate || 'فوري'}</span>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block', fontWeight: 700 }}>العنوان ومحل الإقامة:</span>
                  <span style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: 600 }}>{applicant.address || '—'}</span>
                </div>
              </div>

              {/* Contact Card */}
              <div style={{
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid #e2e8f0'
              }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#0284c7', fontWeight: 800 }}>📞 أرقام وبيانات الاتصال</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                    <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block', fontWeight: 700 }}>رقم الهاتف الأساسي:</span>
                    <a href={`tel:${applicant.phone}`} style={{ color: '#0284c7', fontSize: '15px', fontWeight: 900, textDecoration: 'none', direction: 'ltr', display: 'inline-block' }}>
                      {applicant.phone}
                    </a>
                  </div>

                  {applicant.whatsappPhone && (
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                      <span style={{ color: '#047857', fontSize: '11.5px', display: 'block', fontWeight: 700 }}>رقم الواتساب:</span>
                      <a href={`https://wa.me/2${applicant.whatsappPhone}`} target="_blank" rel="noreferrer" style={{ color: '#047857', fontSize: '15px', fontWeight: 900, textDecoration: 'none', direction: 'ltr', display: 'inline-block' }}>
                        {applicant.whatsappPhone} 💬
                      </a>
                    </div>
                  )}

                  {applicant.relativePhone && (
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                      <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block', fontWeight: 700 }}>هاتف الطوارئ / قريب:</span>
                      <span style={{ color: '#0f172a', fontSize: '14px', fontFamily: 'monospace', fontWeight: 800 }}>{applicant.relativePhone}</span>
                    </div>
                  )}

                  {applicant.email && (
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '10px', flex: '1 1 200px' }}>
                      <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block', fontWeight: 700 }}>البريد الإلكتروني:</span>
                      <span style={{ color: '#0f172a', fontSize: '13px', fontWeight: 600 }}>{applicant.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scheduled Interview Section */}
              {applicant.interviewSchedule && (
                <div style={{
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  padding: '16px',
                  borderRadius: '14px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', color: '#6d28d9', fontWeight: 800 }}>📅 تفاصيل موعد المقابلة المجدولة</h4>
                    <button
                      type="button"
                      onClick={() => onOpenScheduleModal?.(applicant)}
                      style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', background: '#ffffff', border: '1px solid #ddd6fe', color: '#6d28d9', cursor: 'pointer', fontWeight: 700 }}
                    >
                      تعديل الموعد
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '13px', color: '#334155' }}>
                    <div><strong>التاريخ:</strong> {applicant.interviewSchedule.date}</div>
                    <div><strong>الوقت:</strong> {applicant.interviewSchedule.time}</div>
                    <div><strong>المكان:</strong> {applicant.interviewSchedule.locationLabel}</div>
                    {applicant.interviewSchedule.interviewerName && (
                      <div><strong>القائم بالمقابلة:</strong> {applicant.interviewSchedule.interviewerName}</div>
                    )}
                  </div>
                  {applicant.interviewSchedule.notes && (
                    <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#475569' }}>
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
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#0284c7', fontWeight: 800 }}>🎓 المؤهل الأكاديمي</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13.5px', color: '#1e293b' }}>
                  <div><strong>المؤهل:</strong> {applicant.qualification || 'غير محدد'}</div>
                  <div><strong>الجامعة / المعهد:</strong> {applicant.university || 'غير محدد'}</div>
                  <div><strong>سنة التخرج:</strong> {applicant.graduationYear || '—'}</div>
                  <div><strong>التقدير العام:</strong> {applicant.grade || '—'}</div>
                  <div><strong>سنوات الخبرة:</strong> {applicant.experienceYears || '0'} سنوات</div>
                </div>
              </div>

              {applicant.previousExperience && (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#0284c7', fontWeight: 800 }}>💼 أماكن العمل والخبرات السابقة</h4>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                    {applicant.previousExperience}
                  </p>
                </div>
              )}

              {applicant.skills && (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#0284c7', fontWeight: 800 }}>⚡ المهارات واللغات وبرامج الحاسب</h4>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
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
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h5 style={{ margin: 0, color: '#0f766e', fontSize: '14.5px', fontWeight: 800 }}>📄 السيرة الذاتية (CV)</h5>
                    {applicant.cvUrl && (
                      <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                        ✓ مرفق
                      </span>
                    )}
                  </div>
                  {applicant.cvUrl ? (
                    <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '14px', wordBreak: 'break-all' }}>
                      📎 {applicant.cvFileName || `CV_${applicant.name}`}
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '12.5px', display: 'block', marginBottom: '14px' }}>لم يتم إرفاق سيرة ذاتية</span>
                  )}
                </div>

                {applicant.cvUrl && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({
                        url: applicant.cvUrl,
                        title: `معاينة السيرة الذاتية - ${applicant.name}`,
                        fileName: applicant.cvFileName || `CV_${applicant.name}`
                      })}
                      style={{
                        flex: 1,
                        minWidth: '110px',
                        padding: '8px 14px',
                        fontSize: '12.5px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      <span>👁️</span>
                      <span>معاينة فورية</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadDocument(applicant.cvUrl, applicant.cvFileName || `CV_${applicant.name}`)}
                      style={{
                        padding: '8px 12px',
                        fontSize: '12.5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: '#ffffff',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                      title="تحميل الملف إلى جهازك"
                    >
                      <span>⬇️</span>
                      <span>تحميل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDocumentSafely(applicant.cvUrl, applicant.cvFileName || `CV_${applicant.name}`)}
                      style={{
                        padding: '8px 10px',
                        fontSize: '12px',
                        background: '#f0fdfa',
                        color: '#0f766e',
                        border: '1px solid #ccfbf1',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                      title="فتح في نافذة مستقلة"
                    >
                      ↗️
                    </button>
                  </div>
                )}
              </div>

              {/* National ID Photo */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <h5 style={{ margin: '0 0 8px', color: '#0284c7', fontSize: '14px', fontWeight: 800 }}>🪪 بطاقة الرقم القومي</h5>
                {applicant.nationalIdPhotoUrl ? (
                  <div>
                    <img
                      src={applicant.nationalIdPhotoUrl}
                      alt="National ID"
                      onClick={() => setPreviewDoc({ url: applicant.nationalIdPhotoUrl, title: `بطاقة الرقم القومي - ${applicant.name}`, fileName: `NationalID_${applicant.name}.jpg` })}
                      style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setPreviewDoc({ url: applicant.nationalIdPhotoUrl, title: `بطاقة الرقم القومي - ${applicant.name}`, fileName: `NationalID_${applicant.name}.jpg` })}
                        style={{ flex: 1, padding: '5px 10px', fontSize: '12px', background: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        👁️ معاينة
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocument(applicant.nationalIdPhotoUrl, `NationalID_${applicant.name}.jpg`)}
                        style={{ padding: '5px 10px', fontSize: '12px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        ⬇️
                      </button>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>لم يتم رفع صورة البطاقة</span>
                )}
              </div>

              {/* Graduation Certificate */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <h5 style={{ margin: '0 0 8px', color: '#0284c7', fontSize: '14px', fontWeight: 800 }}>📜 شهادة التخرج / الكارنيه</h5>
                {applicant.graduationCertUrl ? (
                  <div>
                    <img
                      src={applicant.graduationCertUrl}
                      alt="Certificate"
                      onClick={() => setPreviewDoc({ url: applicant.graduationCertUrl, title: `شهادة التخرج - ${applicant.name}`, fileName: `GradCert_${applicant.name}.jpg` })}
                      style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setPreviewDoc({ url: applicant.graduationCertUrl, title: `شهادة التخرج - ${applicant.name}`, fileName: `GradCert_${applicant.name}.jpg` })}
                        style={{ flex: 1, padding: '5px 10px', fontSize: '12px', background: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        👁️ معاينة
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocument(applicant.graduationCertUrl, `GradCert_${applicant.name}.jpg`)}
                        style={{ padding: '5px 10px', fontSize: '12px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        ⬇️
                      </button>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>لم يتم رفع صورة الشهادة</span>
                )}
              </div>

              {/* License Photo */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <h5 style={{ margin: '0 0 8px', color: '#0284c7', fontSize: '14px', fontWeight: 800 }}>🚗 ترخيص مزاولة المهنة / رخصة القيادة</h5>
                {applicant.licensePhotoUrl ? (
                  <div>
                    <img
                      src={applicant.licensePhotoUrl}
                      alt="License"
                      onClick={() => setPreviewDoc({ url: applicant.licensePhotoUrl, title: `ترخيص مزاولة المهنة - ${applicant.name}`, fileName: `License_${applicant.name}.jpg` })}
                      style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setPreviewDoc({ url: applicant.licensePhotoUrl, title: `ترخيص مزاولة المهنة - ${applicant.name}`, fileName: `License_${applicant.name}.jpg` })}
                        style={{ flex: 1, padding: '5px 10px', fontSize: '12px', background: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        👁️ معاينة
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocument(applicant.licensePhotoUrl, `License_${applicant.name}.jpg`)}
                        style={{ padding: '5px 10px', fontSize: '12px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        ⬇️
                      </button>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>لم يتم رفع الترخيص</span>
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
                    background: '#ecfdf5',
                    border: '1.5px solid #a7f3d0',
                    padding: '18px 24px',
                    borderRadius: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px'
                  }}>
                    <div>
                      <div style={{ color: '#047857', fontSize: '12.5px', fontWeight: 700 }}>نتيجة تقييم المقابلة:</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#047857' }}>
                        {evalScore?.percentage}% <span style={{ fontSize: '16px', fontWeight: 800 }}>({evalScore?.ratingLabel})</span>
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '2px', fontWeight: 600 }}>
                        👤 المقابل: <strong>{evaluation.interviewerName}</strong> ({evaluation.interviewerJobTitle}) · تاريخ: {evaluation.interviewDate}
                      </div>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <span style={{
                        padding: '6px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 800,
                        background: evaluation.recommendation === 'recommended' ? '#dcfce7' : (evaluation.recommendation === 'waiting_list' ? '#fef3c7' : '#fee2e2'),
                        color: evaluation.recommendation === 'recommended' ? '#047857' : (evaluation.recommendation === 'waiting_list' ? '#b45309' : '#b91c1c'),
                        border: `1px solid ${evaluation.recommendation === 'recommended' ? '#86efac' : (evaluation.recommendation === 'waiting_list' ? '#fde68a' : '#fecaca')}`
                      }}>
                        {evaluation.recommendation === 'recommended' ? '🟢 يوصى بالتعيين الفوري' : (evaluation.recommendation === 'waiting_list' ? '⏳ يوصى بقائمة الانتظار' : '❌ غير مناسب / مرفوض')}
                      </span>
                    </div>
                  </div>

                  {/* Rubrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>الكفاءة الفنية والتخصص:</span>
                        <strong style={{ color: '#d97706' }}>★ {evaluation.technicalSkills} / 5</strong>
                      </div>
                      {evaluation.technicalNotes && <div style={{ fontSize: '12px', color: '#334155' }}>{evaluation.technicalNotes}</div>}
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>المهارات السلوكية والتواصل:</span>
                        <strong style={{ color: '#d97706' }}>★ {evaluation.softSkills} / 5</strong>
                      </div>
                      {evaluation.softSkillsNotes && <div style={{ fontSize: '12px', color: '#334155' }}>{evaluation.softSkillsNotes}</div>}
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>البرامج واللغات:</span>
                        <strong style={{ color: '#0d9488' }}>{evaluation.languageTech} / 5</strong>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>الانضباط والملاءمة:</span>
                        <strong style={{ color: '#0d9488' }}>{evaluation.cultureFit} / 5</strong>
                      </div>
                    </div>
                  </div>

                  {evaluation.proposedSalary && (
                    <div style={{ fontSize: '13.5px', background: '#f0fdfa', border: '1px solid #ccfbf1', padding: '10px 14px', borderRadius: '10px', color: '#0f766e', fontWeight: 700 }}>
                      💰 <strong>الراتب المقترح أثناء المقابلة:</strong> {evaluation.proposedSalary} ج.م شهرياً
                    </div>
                  )}

                  {evaluation.notes && (
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <strong style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>ملاحظات وتوصيات المقابل:</strong>
                      <p style={{ margin: 0, fontSize: '13.5px', color: '#0f172a', lineHeight: '1.6' }}>{evaluation.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
                  <div style={{ fontSize: '36px', marginBottom: '10px' }}>⏳</div>
                  <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 800 }}>لم يتم تسجيل تقييم المقابلة بعد</h4>
                  <p style={{ fontSize: '13px', margin: '0 0 16px' }}>يمكن للقائم بالمقابلة تقييم المرشح عبر رابط المقابلات أو تسجيله من هنا مباشرة.</p>
                </div>
              )}
            </div>
          )}

          {/* Internal HR Notes Box */}
          <div style={{ marginTop: '16px', background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155' }}>📝 ملاحظات داخلية لإدارة الموارد البشرية:</span>
              {!isEditingNotes ? (
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(true)}
                  style={{ background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}
                >
                  تعديل الملاحظات
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  style={{ padding: '3px 12px', fontSize: '12px', borderRadius: '6px', background: '#0d9488', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}
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
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', background: '#ffffff', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
              />
            ) : (
              <div style={{ fontSize: '13px', color: internalNotes ? '#0f172a' : '#94a3b8', fontWeight: 600 }}>
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
          borderTop: '1px solid #e2e8f0',
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
              onClick={() => handleSendWhatsApp()}
              style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
            >
              💬 واتساب
            </button>
            <button
              type="button"
              onClick={() => onOpenScheduleModal?.(applicant)}
              style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
            >
              📅 جدولة مقابلة
            </button>
          </div>

          {/* Decision Actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {applicant.status !== 'hired' && (
              <button
                type="button"
                onClick={() => onApproveAndHire?.(applicant)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontWeight: 900,
                  fontSize: '13.5px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
              >
                ✅ الموافقة والتعيين الفوري
              </button>
            )}

            {applicant.status !== 'waiting_list' && applicant.status !== 'hired' && (
              <button
                type="button"
                onClick={() => onMoveToWaitingList?.(applicant)}
                style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
              >
                ⏳ قائمة الانتظار
              </button>
            )}

            {applicant.status !== 'rejected' && applicant.status !== 'hired' && (
              <button
                type="button"
                onClick={() => onReject?.(applicant)}
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
              >
                ❌ رفض الطلب
              </button>
            )}

            <button
              type="button"
              onClick={() => onDelete?.(applicant.id)}
              style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
              title="حذف الطلب نهائياً"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {/* ── Safe Document Preview Lightbox Modal ── */}
      {previewDoc && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewDoc(null)}
          style={{ zIndex: 1300, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)' }}
        >
          <div
            className="fade-in"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '920px',
              width: '95%',
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: '22px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
              border: '1px solid #cbd5e1'
            }}
          >
            {/* Preview Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📄</span>
                <span>{previewDoc.title}</span>
              </h4>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => downloadDocument(previewDoc.url, previewDoc.fileName)}
                  style={{ padding: '7px 14px', background: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1', borderRadius: '8px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span>⬇️</span>
                  <span>تحميل</span>
                </button>

                <button
                  type="button"
                  onClick={() => openDocumentSafely(previewDoc.url, previewDoc.fileName)}
                  style={{ padding: '7px 14px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span>↗️</span>
                  <span>نافذة مستقلة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div style={{ flex: 1, minHeight: '380px', maxHeight: '72vh', overflow: 'auto', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
              {previewDoc.url.startsWith('data:application/pdf') || (previewDoc.fileName && previewDoc.fileName.toLowerCase().endsWith('.pdf')) ? (
                <iframe
                  src={previewDoc.url}
                  title="PDF Preview"
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '8px' }}
                />
              ) : (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.title}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
