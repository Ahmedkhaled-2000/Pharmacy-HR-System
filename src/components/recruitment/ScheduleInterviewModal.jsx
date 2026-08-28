import React, { useState } from 'react';

export default function ScheduleInterviewModal({
  isOpen,
  onClose,
  applicant,
  branches = [],
  onSchedule,
  showToast
}) {
  if (!isOpen || !applicant) return null;

  const [date, setDate] = useState(
    applicant.interviewSchedule?.date || new Date().toISOString().slice(0, 10)
  );
  const [time, setTime] = useState(applicant.interviewSchedule?.time || '14:00');
  const [locationType, setLocationType] = useState(
    applicant.interviewSchedule?.locationType || 'branch'
  );
  const [branchId, setBranchId] = useState(
    applicant.interviewSchedule?.branchId || applicant.preferredBranchId || branches[0]?.id || ''
  );
  const [customLocation, setCustomLocation] = useState(
    applicant.interviewSchedule?.customLocation || ''
  );
  const [interviewerName, setInterviewerName] = useState(
    applicant.interviewSchedule?.interviewerName || ''
  );
  const [notes, setNotes] = useState(applicant.interviewSchedule?.notes || '');

  const selectedBranch = branches.find(b => String(b.id) === String(branchId));
  const locationLabel = locationType === 'branch'
    ? (selectedBranch ? `مقر فرع ${selectedBranch.name}` : 'مقر الفرع')
    : (locationType === 'online' ? 'مقابلة أونلاين (Zoom / Google Meet)' : (customLocation || 'مقر الإدارة العامة'));

  const handleSave = (e) => {
    e.preventDefault();
    if (!date || !time) {
      showToast?.('يرجى تحديد تاريخ ووقت المقابلة');
      return;
    }

    const scheduleData = {
      date,
      time,
      locationType,
      branchId: locationType === 'branch' ? branchId : '',
      branchName: locationType === 'branch' ? (selectedBranch?.name || '') : '',
      customLocation: locationType === 'custom' ? customLocation : '',
      locationLabel,
      interviewerName: interviewerName.trim(),
      notes: notes.trim(),
      scheduledAt: new Date().toISOString()
    };

    onSchedule?.(applicant.id, scheduleData);
    onClose();
  };

  // Generate WhatsApp Message for Candidate
  const handleSendWhatsApp = () => {
    const phone = applicant.whatsappPhone || applicant.phone;
    if (!phone) {
      showToast?.('لا يوجد رقم هاتف مسجل للمرشح');
      return;
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('2') ? cleanPhone : `2${cleanPhone}`;
    
    const msg = `مرحباً ${applicant.name}،
تحية طيبة من إدارة الموارد البشرية،
يسعدنا إبلاغك بأنه قد تم تحديد موعد المقابلة الشخصية الخاصة بطلب التعيين لوظيفة (${applicant.targetJobTitle}):
📅 التاريخ: ${date}
⏰ الموعد: ${time}
📍 المكان: ${locationLabel}
${interviewerName ? `👤 القائم بالمقابلة: ${interviewerName}` : ''}
${notes ? `📝 ملاحظات: ${notes}` : ''}

يرجى إحضار السيرة الذاتية وصورة بطاقة الرقم القومي.
نتمنى لك التوفيق!`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/${fullPhone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-card fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '550px',
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
          <div>
            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#0f172a' }}>
              📅 جدولة موعد مقابلة شخصية
            </h3>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
              المرشح: <strong style={{ color: '#0284c7' }}>{applicant.name}</strong> ({applicant.targetJobTitle})
            </span>
          </div>
          <button type="button" className="close-btn" onClick={onClose} style={{ fontSize: '18px' }}>✕</button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                تاريخ المقابلة *
              </label>
              <input
                type="date"
                className="form-control"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                الوقت والتوقيت *
              </label>
              <input
                type="time"
                className="form-control"
                value={time}
                onChange={e => setTime(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                نوع ومقر المقابلة
              </label>
              <select
                className="form-control"
                value={locationType}
                onChange={e => setLocationType(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
              >
                <option value="branch">مقر أحد الفروع</option>
                <option value="headquarters">مقر الإدارة العامة</option>
                <option value="online">أونلاين (Online Meeting)</option>
                <option value="custom">عنوان مخصص آخر</option>
              </select>
            </div>

            {locationType === 'branch' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  اختيار الفرع
                </label>
                <select
                  className="form-control"
                  value={branchId}
                  onChange={e => setBranchId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {locationType === 'custom' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  العنوان المخصص
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="اكتب العنوان بالتفصيل"
                  value={customLocation}
                  onChange={e => setCustomLocation(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                />
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
              اسم القائم بالمقابلة / المحاور (اختياري)
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="مثال: د. مصطفى - مدير فرع ..."
              value={interviewerName}
              onChange={e => setInterviewerName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
              ملاحظات وتعليمات للمرشح
            </label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="مثال: إحضار أصل شهادة التخرج والمستندات الرسمية..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <span>💬</span>
              <span>إرسال التفاصيل بالواتساب</span>
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px' }}>
                إلغاء
              </button>
              <button type="submit" style={{ padding: '8px 20px', borderRadius: '8px', fontWeight: 900, background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                💾 حفظ الموعد وتأكيده
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
