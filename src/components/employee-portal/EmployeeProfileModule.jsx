import React, { useState } from 'react';
import { fmt, getEmpDisplayName } from '../../utils/formatters';
import { getJobsList } from '../../utils/jobsHelper';
import { compressImage } from '../../utils/imageCompressor';

export default function EmployeeProfileModule({
  emp,
  state,
  setState,
  saveState,
  showToast
}) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Profile editable fields state (STRICTLY RESTRICTED TO: Phones, Photo, Address, Marital Status)
  const [phones, setPhones] = useState(() => {
    if (Array.isArray(emp?.phones) && emp.phones.length > 0) {
      return emp.phones.map(p => ({ id: p.id || Math.random().toString(), number: p.number || '', type: p.type || 'mobile' }));
    }
    if (emp?.phone) {
      return [{ id: '1', number: emp.phone, type: 'mobile' }];
    }
    return [{ id: '1', number: '', type: 'mobile' }];
  });
  const [address, setAddress] = useState(emp?.address || '');
  const [maritalStatus, setMaritalStatus] = useState(emp?.maritalStatus || 'أعزب');
  const [photoUrl, setPhotoUrl] = useState(emp?.photoUrl || emp?.photo || '');
  const [requestNotes, setRequestNotes] = useState('');

  if (!emp) return null;

  const branches = state?.branches || [];
  const jobs = getJobsList(state);
  const mainBranch = branches.find(b => String(b.id) === String(emp.branchId)) || null;
  const jobInfo = jobs.find(j => j.title?.trim() === emp.jobTitle?.trim()) || null;

  // Handle Image Upload for Profile Photo
  const handlePhotoUpload = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast?.('⚠️ حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
      return;
    }

    try {
      const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.8 });
      setPhotoUrl(compressed);
      showToast?.('📸 تم تحميل وضغط الصورة بنجاح');
    } catch {
      showToast?.('❌ حدث خطأ أثناء معالجة الصورة');
    }
  };

  // Submit Profile Update Request (Routes to Senior Management / Admin)
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const cleanPhones = phones.filter(p => p.number && p.number.trim());
      if (cleanPhones.length === 0) {
        showToast?.('⚠️ يرجى إدخال رقم هاتف واحد على الأقل');
        setIsSubmitting(false);
        return;
      }

      const reqId = 'req_prof_' + Date.now();
      const newRequest = {
        id: reqId,
        type: 'profile_update',
        title: `طلب تحديث بيانات شخصية: ${emp.name}`,
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.name,
        branchId: emp.branchId,
        branchName: mainBranch?.name || '',
        status: 'pending_admin',
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        notes: requestNotes.trim(),
        proposedChanges: {
          phones: cleanPhones,
          address: address.trim(),
          maritalStatus,
          photoUrl
        },
        // Display summary for admin review
        summary: `طلب تحديث: ${cleanPhones.length} أرقام تواصل، العنوان: ${address || '—'}، الحالة: ${maritalStatus}`
      };

      // Notification for Admin
      const newNotification = {
        id: 'notif_' + Date.now(),
        type: 'profile_update_request',
        targetRole: 'admin',
        title: `👤 طلب تحديث بيانات شخصية جديد`,
        message: `الموظف ${emp.name} (كود ${emp.code}) تقدم بطلب لتحديث بياناته الشخصية (أرقام الهاتف / العنوان / الحالة الاجتماعية).`,
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.code,
        requestId: reqId,
        linkTab: 'requests',
        date: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        read: false
      };

      const updatedRequests = [newRequest, ...(state?.requests || [])];
      const updatedNotifications = [newNotification, ...(state?.notifications || [])];
      const updatedState = {
        ...state,
        requests: updatedRequests,
        notifications: updatedNotifications
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('✅ تم إرسال طلب التحديث بنجاح إلى الإدارة للمراجعة والاعتماد');
      setShowEditModal(false);
    } catch {
      showToast?.('❌ حدث خطأ أثناء إرسال الطلب');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Branches details breakdown
  const branchesList = Array.isArray(emp.branchesDetails) && emp.branchesDetails.length > 0
    ? emp.branchesDetails
    : [
        {
          branchId: emp.branchId || '',
          salary: emp.salary || 0,
          workHours: emp.workHours || 8,
          workDays: emp.workDays || 26
        }
      ];

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px', margin: '0 auto' }}>
      
      {/* ── SECTION 1: HERO HEADER & QUICK PROFILE CARD ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: '16px',
          border: '1.5px solid #e2e8f0',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #10b981',
              boxShadow: '0 4px 12px rgba(16,185,129,0.2)',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {emp.photoUrl || emp.photo ? (
              <img
                src={emp.photoUrl || emp.photo}
                alt={emp.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '38px', color: '#94a3b8' }}>👤</span>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                {getEmpDisplayName(emp)}
              </h2>
              <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 800 }}>
                كود: {emp.code || '—'}
              </span>
              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 800 }}>
                {emp.status || 'على رأس العمل'}
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', color: '#475569', fontSize: '13.5px', flexWrap: 'wrap' }}>
              <span>💼 <strong>{emp.jobTitle || 'موظف'}</strong></span>
              <span>•</span>
              <span>🏢 {emp.department || 'القسم غير محدد'}</span>
              <span>•</span>
              <span>📍 {mainBranch?.name || 'الفرع الرئيسي'}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-start"
          onClick={() => setShowEditModal(true)}
          style={{
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            padding: '10px 22px',
            fontSize: '13.5px',
            fontWeight: 800,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(13,148,136,0.25)'
          }}
        >
          <span>✏️</span> طلب تحديث بيانات شخصية
        </button>
      </div>

      {/* ── SECTION 2: PERSONAL & CONTRACT DATA GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Personal Details Card */}
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '10px' }}>
            <span>👤</span> البيانات الشخصية
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>الرقم القومي:</span>
              <strong style={{ color: '#0f172a' }}>{emp.nationalId || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>تاريخ الميلاد:</span>
              <strong style={{ color: '#0f172a' }}>{emp.dob || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>الحالة الاجتماعية:</span>
              <strong style={{ color: '#0f172a' }}>{emp.maritalStatus || 'أعزب'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>هاتف الطوارئ / الأقارب:</span>
              <strong style={{ color: '#0f172a' }}>{emp.relativePhone || emp.emergencyPhone || '—'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '4px' }}>أرقام الهواتف المسجلة:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {Array.isArray(emp.phones) && emp.phones.length > 0 ? (
                  emp.phones.map((p, idx) => (
                    <span key={idx} style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, color: '#0369a1' }}>
                      📱 {p.number}
                    </span>
                  ))
                ) : (
                  <span style={{ color: '#0f172a', fontWeight: 700 }}>{emp.phone || '—'}</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
              <span style={{ color: '#64748b' }}>العنوان السكني:</span>
              <strong style={{ color: '#0f172a', maxWidth: '65%', textAlign: 'left' }}>{emp.address || '—'}</strong>
            </div>
          </div>
        </div>

        {/* Contract & Employment Card */}
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '10px' }}>
            <span>📝</span> بيانات التعاقد والوظيفة
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>المسمى الوظيفي:</span>
              <strong style={{ color: '#0f766e' }}>💼 {emp.jobTitle || 'موظف'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>القسم التابع له:</span>
              <strong style={{ color: '#0f172a' }}>🏢 {emp.department || 'عام'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>نوع العقد:</span>
              <strong style={{ color: '#0f172a' }}>{emp.contractType || 'دوام كامل'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>تاريخ بداية العمل:</span>
              <strong style={{ color: '#0f172a' }}>{emp.hireDate || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>رصيد الإجازات السنوية:</span>
              <strong style={{ color: '#15803d' }}>🏖️ {emp.annualLeaveBalance || 21} يوم / سنة</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
              <span style={{ color: '#64748b' }}>الفروع المكلف بها:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end' }}>
                {branchesList.map((bd, idx) => {
                  const bObj = branches.find(b => String(b.id) === String(bd.branchId));
                  return (
                    <span key={idx} style={{ background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                      📍 {bObj?.name || bd.branchName || `فرع ${idx + 1}`}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: JOB DESCRIPTION & RESPONSIBILITIES (Linked dynamically to Jobs Table) ── */}
      <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '20px' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📋</span> الوصف والمهام الوظيفية المعتمدة لوظيفة ({emp.jobTitle || 'موظف'})
        </h3>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '16px',
          color: '#334155',
          fontSize: '14px',
          lineHeight: '1.8'
        }}>
          {jobInfo?.description ? (
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{jobInfo.description}</p>
          ) : (
            <p style={{ margin: 0, color: '#94a3b8', fontStyle: 'italic' }}>
              لا يوجد وصف وظيفي محدد مسبقاً لهذه الوظيفة في هيكل الوظائف المعتمد. يمكنك التواصل مع الإدارة للاستفسار عن المهام التفصيلية.
            </p>
          )}
        </div>
      </div>

      {/* ── SECTION 4: FINANCIAL PACKAGE BREAKDOWN (Read-Only) ── */}
      <div style={{ background: '#fff', border: '1.5px solid #10b981', borderRadius: '14px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💵</span> الباقة المالية والتعاقدية المعتمدة
          </h3>
          <span style={{ fontSize: '12px', background: '#ecfdf5', color: '#047857', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>
            🔒 قراءة فقط (وفقاً للعقد المعتمد)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {branchesList.map((bd, idx) => {
            const bObj = branches.find(b => String(b.id) === String(bd.branchId));
            const salary = parseFloat(bd.salary) || 0;
            const days = parseFloat(bd.workDays) || 26;
            const hours = parseFloat(bd.workHours) || 8;
            const dayRate = days > 0 ? salary / days : 0;
            const hourRate = hours > 0 ? dayRate / hours : 0;

            return (
              <div key={idx} style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '13.5px', marginBottom: '6px' }}>
                  📍 {bObj?.name || `فرع ${idx + 1}`}
                </div>
                <div style={{ fontSize: '13px', color: '#334155' }}>
                  الراتب الأساسي: <strong>{fmt(salary)} ج.م</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  سعر اليوم: <strong>{fmt(dayRate)} ج.م</strong> | الساعة: <strong>{fmt(hourRate)} ج.م</strong>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                  ساعات العمل: {hours} س/يوم — {days} يوم/شهر
                </div>
              </div>
            );
          })}

          {/* Allowances */}
          {parseFloat(emp.managementAllowance || emp.managementBonus) > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>بدل إدارة (شهري)</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                {fmt(parseFloat(emp.managementAllowance || emp.managementBonus))} ج.م
              </div>
            </div>
          )}

          {parseFloat(emp.transportAllowance) > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>بدل انتقال (شهري)</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0369a1', marginTop: '2px' }}>
                {fmt(parseFloat(emp.transportAllowance))} ج.م
              </div>
            </div>
          )}

          {parseFloat(emp.dailyAttendanceAllowance) > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>بدل حضور يومي بالبصمة</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                {fmt(parseFloat(emp.dailyAttendanceAllowance))} ج.م / يوم
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: REQUEST PROFILE DATA UPDATE (STRICT FIELD RESTRICTION) ── */}
      {showEditModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div
            className="modal-card fade-in"
            style={{
              maxWidth: '620px',
              width: '95%',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '16px',
              border: '2px solid #0d9488',
              padding: '24px',
              background: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✏️</span> طلب تحديث بيانات شخصية
              </h3>
              <button type="button" className="icon-btn" onClick={() => setShowEditModal(false)}>✕</button>
            </div>

            {/* Strict Notice */}
            <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', color: '#92400e', fontSize: '12.5px', lineHeight: '1.6' }}>
              <strong>⚠️ سياسة النظام:</strong> يُسمح للموظف بتقديم طلب تحديث محصور فقط في: <strong>(أرقام الهواتف، الصورة الشخصية، العنوان، الحالة الاجتماعية)</strong>.
              يتم مراجعة الطلب واعتماده من قبل الإدارة العليا قبل تطبيقه رسمياً في ملفك.
            </div>

            <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Photo Upload */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>الصورة الشخصية:</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0d9488', background: '#f1f5f9' }}>
                    {photoUrl ? (
                      <img src={photoUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '24px' }}>👤</div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Phone Numbers */}
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>أرقام الهواتف والتواصل *</label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '2px 8px' }}
                    onClick={() => setPhones([...phones, { id: Math.random().toString(), number: '', type: 'mobile' }])}
                  >
                    ➕ إضافة رقم هاتف
                  </button>
                </div>
                {phones.map((p, idx) => (
                  <div key={p.id || idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="tel"
                      value={p.number}
                      placeholder="رقم الهاتف (مثال: 01012345678)"
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setPhones(phones.map((item, i) => i === idx ? { ...item, number: val } : item));
                      }}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      required={idx === 0}
                    />
                    {phones.length > 1 && (
                      <button
                        type="button"
                        className="del-btn"
                        style={{ padding: '6px 10px' }}
                        onClick={() => setPhones(phones.filter((_, i) => i !== idx))}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Marital Status */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>الحالة الاجتماعية:</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                >
                  <option value="أعزب">أعزب</option>
                  <option value="متزوج">متزوج</option>
                  <option value="متزوج ويعول">متزوج ويعول</option>
                  <option value="مطلق">مطلق</option>
                  <option value="أرمل">أرمل</option>
                </select>
              </div>

              {/* Address */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>العنوان السكني الجديد:</label>
                <input
                  type="text"
                  value={address}
                  placeholder="اكتب العنوان بالتفصيل..."
                  onChange={(e) => setAddress(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Request Notes */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>ملاحظات إضافية للإدارة (اختياري):</label>
                <textarea
                  rows="2"
                  value={requestNotes}
                  placeholder="سبب التحديث أو أي تفاصيل توضيحية..."
                  onChange={(e) => setRequestNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowEditModal(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-start"
                  disabled={isSubmitting}
                  style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', padding: '9px 24px' }}
                >
                  {isSubmitting ? 'جاري الإرسال...' : '🚀 إرسال طلب التحديث للإدارة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
