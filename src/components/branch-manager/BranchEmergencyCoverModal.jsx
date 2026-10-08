import React, { useState, useMemo } from 'react';
import { getJobsList } from '../../utils/jobsHelper';
import { arabicWeekday, getRealTodayStr, fmt } from '../../utils/formatters';
import { enqueueNewRequest } from '../../utils/syncEngine';
import { apiSubmitRequestAtomic } from '../../utils/apiClient';
import { emitLiveRequestUpdated } from '../../utils/socketClient';
import { broadcastStateChange } from '../../utils/offlineSync';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';

export default function BranchEmergencyCoverModal({
  isOpen,
  onClose,
  currentBranch,
  managerEmp,
  state,
  setState,
  saveState,
  showToast
}) {
  const todayStr = getRealTodayStr();
  const jobsList = useMemo(() => getJobsList(state), [state]);

  const [coverDate, setCoverDate] = useState(todayStr);
  const [shiftPreset, setShiftPreset] = useState('morning'); // 'morning' | 'evening' | 'night' | 'custom'
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [shiftHours, setShiftHours] = useState(8);
  const [requiredJob, setRequiredJob] = useState('صيدلي');
  const [urgency, setUrgency] = useState('urgent'); // 'urgent' | 'today' | 'tomorrow'
  const [reason, setReason] = useState('إجازة مرضية مفاجئة لموظف');
  const [surgeAllowance, setSurgeAllowance] = useState('50'); // حافز استجابة سريعة
  const [notes, setNotes] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('broadcast'); // 'broadcast' or specific emp.id
  const [isSubmitting, setIsSubmitting] = useState(false);

  // تحديث المواعيد بناءً على القالب المختار
  const handlePresetChange = (preset) => {
    setShiftPreset(preset);
    if (preset === 'morning') {
      setStartTime('08:00');
      setEndTime('16:00');
      setShiftHours(8);
    } else if (preset === 'evening') {
      setStartTime('16:00');
      setEndTime('00:00');
      setShiftHours(8);
    } else if (preset === 'night') {
      setStartTime('00:00');
      setEndTime('08:00');
      setShiftHours(8);
    }
  };

  const handleTimeChange = (type, val) => {
    setShiftPreset('custom');
    if (type === 'start') {
      setStartTime(val);
      if (endTime) {
        const [sH, sM] = val.split(':').map(Number);
        const [eH, eM] = endTime.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff <= 0) diff += 24 * 60;
        setShiftHours(Math.round((diff / 60) * 10) / 10);
      }
    } else {
      setEndTime(val);
      if (startTime) {
        const [sH, sM] = startTime.split(':').map(Number);
        const [eH, eM] = val.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff <= 0) diff += 24 * 60;
        setShiftHours(Math.round((diff / 60) * 10) / 10);
      }
    }
  };

  // ── رادار البدلاء الذكي (Smart Relief Radar) ──
  // فلترة الموظفين الأحرار (Floating) ومتعددي الفروع المتاحين في تاريخ التغطية
  const candidatesRadar = useMemo(() => {
    const list = state?.employees || [];
    const activeStaff = list.filter(e => e.is_active !== false && e.status !== 'تم الاستقالة');

    return activeStaff.map(emp => {
      const isFloating = Boolean(emp.isFloatingStaff || emp.isRoaming || emp.isFloating);
      const isMulti = Boolean(emp.isMultiBranch || (Array.isArray(emp.branchesDetails) && emp.branchesDetails.length > 1));
      const coversThisBranch = Array.isArray(emp.branchesDetails) && emp.branchesDetails.some(b => String(b.branchId) === String(currentBranch?.id));
      const isJobMatch = requiredJob ? (String(emp.jobTitle || '').toLowerCase().includes(requiredJob.toLowerCase()) || String(requiredJob).toLowerCase().includes(String(emp.jobTitle || '').toLowerCase())) : true;

      // فحص جدول الموظف في تاريخ التغطية
      const daySched = getEmployeeDaySchedule(emp.id, coverDate, state);
      const isOffToday = !daySched || daySched.type === 'off' || daySched.isOff === true;
      const hasShiftInOtherBranch = Boolean(daySched && !daySched.isOff && daySched.branchId && String(daySched.branchId) !== String(currentBranch?.id));
      const hasShiftInThisBranch = Boolean(daySched && !daySched.isOff && daySched.branchId && String(daySched.branchId) === String(currentBranch?.id));

      let availabilityStatus = 'available'; // 'available' | 'rest' | 'busy_other' | 'already_here'
      let statusLabel = '🟢 متاح تماماً وجاهز للتغطية';
      let statusBg = '#dcfce7';
      let statusColor = '#15803d';

      if (hasShiftInThisBranch) {
        availabilityStatus = 'already_here';
        statusLabel = '🔵 مسجل بالفعل بهذا الفرع اليوم';
        statusBg = '#e0f2fe';
        statusColor = '#0369a1';
      } else if (hasShiftInOtherBranch) {
        availabilityStatus = 'busy_other';
        statusLabel = `⚠️ مرتبط بوردية بفرع آخر (${daySched.branchName || daySched.branchId})`;
        statusBg = '#fee2e2';
        statusColor = '#dc2626';
      } else if (isOffToday) {
        availabilityStatus = 'rest';
        statusLabel = '🛋️ في يوم راحة مجدولة (يمكن انتدابه)';
        statusBg = '#fef3c7';
        statusColor = '#b45309';
      }

      // حساب درجة التوافق والأولوية في الرادار (Radar Score)
      let score = 0;
      if (isFloating) score += 50;
      if (coversThisBranch) score += 30;
      if (isJobMatch) score += 20;
      if (availabilityStatus === 'available') score += 40;
      if (availabilityStatus === 'rest') score += 20;
      if (availabilityStatus === 'busy_other') score -= 50;

      return {
        emp,
        isFloating,
        isMulti,
        coversThisBranch,
        isJobMatch,
        daySched,
        availabilityStatus,
        statusLabel,
        statusBg,
        statusColor,
        score
      };
    })
    .filter(item => item.isFloating || item.coversThisBranch || item.isJobMatch)
    .sort((a, b) => b.score - a.score);
  }, [state?.employees, currentBranch?.id, coverDate, requiredJob, state]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!coverDate) {
      showToast?.('⚠️ يرجى تحديد تاريخ التغطية');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCandidateObj = candidatesRadar.find(c => String(c.emp.id) === String(selectedCandidateId))?.emp || null;
      const isDirect = Boolean(selectedCandidateObj && selectedCandidateId !== 'broadcast');
      const branchName = currentBranch?.name || 'الفرع';

      const newReq = {
        id: `req_emerg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'emergency_cover',
        typeLabel: '🚨 طلب تغطية طوارئ',
        title: `🚨 طلب تغطية طوارئ عاجلة لفرع (${branchName})`,
        branchId: currentBranch?.id || '',
        branchName: branchName,
        requestedByManagerId: managerEmp?.id || '',
        requestedByManagerName: managerEmp?.name || 'مدير الفرع',
        date: coverDate,
        startTime,
        endTime,
        shiftHours,
        jobTitle: requiredJob,
        urgency,
        reason,
        notes: notes.trim(),
        surgeAllowance: parseFloat(surgeAllowance) || 0,
        assignedEmployeeId: isDirect ? selectedCandidateObj.id : null,
        assignedEmployeeName: isDirect ? selectedCandidateObj.name : 'بث عام لكافة الكوادر الحرة (Pool Broadcast)',
        isDirectAssigned: isDirect,
        status: 'pending', // للإدارة لاعتمادها أو موافقة الموظف
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const newNotif = {
        id: `notif_emerg_${Date.now()}`,
        type: 'emergency_cover_request',
        title: `🚨 طلب تغطية طوارئ عاجلة من فرع ${branchName}`,
        message: `طلب مدير فرع ${branchName} تغطية طوارئ عاجلة (${urgency === 'urgent' ? 'فورية' : 'اليوم'}) لوظيفة ${requiredJob} بتاريخ ${coverDate} من ${startTime} إلى ${endTime}.`,
        linkTab: 'requests',
        targetRole: 'admin',
        read: false,
        createdAt: new Date().toISOString()
      };

      const updatedRequests = [newReq, ...(state.requests || [])];
      const updatedNotifications = [newNotif, ...(state.notifications || [])];

      const updatedState = {
        ...state,
        requests: updatedRequests,
        notifications: updatedNotifications
      };

      setState(updatedState);
      if (saveState) await saveState(updatedState);

      // Async sync & socket dispatch
      try {
        enqueueNewRequest(newReq).catch(err => console.warn('Outbox error:', err));
        apiSubmitRequestAtomic(newReq).catch(err => console.warn('Atomic error:', err));
        emitLiveRequestUpdated(newReq);
        broadcastStateChange('requests', updatedRequests);

        // محاولة مزامنة القالب البيومتري مسبقاً إذا كان الموظف محدداً مباشرة
        if (isDirect && selectedCandidateObj) {
          const targetDevices = (state?.biometricDevices || [])
            .filter(d => String(d.branch_id || d.branchId) === String(currentBranch?.id))
            .map(d => d.serial_number || d.serialNumber);

          if (targetDevices.length > 0) {
            const bioPayload = {
              targetDeviceSerials: targetDevices,
              employeeIds: [selectedCandidateObj.id],
              includeBiometrics: true
            };
            if (window?.apiClient?.post) {
              window.apiClient.post('/api/biometrics/dispatch-users', bioPayload).catch(e => console.warn('Pre-emptive bio sync notice:', e));
            } else {
              fetch('/api/biometrics/dispatch-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bioPayload)
              }).catch(e => console.warn('Pre-emptive bio sync notice:', e));
            }
          }
        }

        notifyAdminOnNewRequest({
          state: updatedState,
          newRequest: newReq,
          empName: managerEmp?.name || 'مدير الفرع',
          branchName
        });
      } catch (syncErr) {
        console.warn('Sync dispatch error for emergency request:', syncErr);
      }

      showToast?.('🚨 تم إرسال طلب تغطية الطوارئ بنجاح إلى الإدارة العليا ورادار الكوادر الحرة');
      onClose();
    } catch (err) {
      console.error('Error submitting emergency request:', err);
      showToast?.('حدث خطأ أثناء إرسال طلب الطوارئ، يرجى المحاولة ثانية');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 999999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '14px 10px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(880px, 96vw)',
          width: '96%',
          maxHeight: 'calc(100dvh - 30px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
          background: '#ffffff',
          border: '2px solid #ef4444'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 22px',
            background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 12px rgba(185, 28, 28, 0.3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px', background: 'rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '12px' }}>
              🚨
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, letterSpacing: '-0.3px' }}>
                طلب تغطية طوارئ عاجلة — فرع {currentBranch?.name}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.9 }}>
                سد العجز التشغيلي الفوري عبر رادار الموظفين الأحرار (Floating Staff) وفريق الاحتياط
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ color: '#ffffff', fontSize: '20px', padding: '4px 10px', borderRadius: '8px' }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* Quick Alert Banner */}
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '22px' }}>⚡</span>
              <div style={{ fontSize: '12.5px', color: '#991b1b', lineHeight: 1.6 }}>
                <strong>صمام الأمان التشغيلي:</strong> يتم فحص الموظفين الأحرار لحظياً عبر الرادار للتأكد من عدم تضارب المواعيد مع فروع أخرى، وعند الاعتماد تُحدث الوردية آلياً وتُرسل أوامر البصمة للماكينة.
              </div>
            </div>

            {/* Row 1: Date, Urgency, Job */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  📅 تاريخ التغطية المطلوبة
                </label>
                <input
                  type="date"
                  value={coverDate}
                  min={todayStr}
                  onChange={(e) => setCoverDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 700, fontSize: '13px' }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', display: 'block' }}>
                  {arabicWeekday(coverDate)} ({coverDate})
                </span>
              </div>

              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  🔥 درجة الاستعجال
                </label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, fontSize: '13px' }}
                >
                  <option value="urgent">🔥 عاجل جداً وفوري (خلال 1 - 2 ساعة)</option>
                  <option value="today">⚡ نوبة اليوم (خلال ساعات)</option>
                  <option value="tomorrow">📅 غداً (تغطية مسبقة لعجز مؤكد)</option>
                </select>
              </div>

              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  💼 المسمى الوظيفي المطلوب
                </label>
                <select
                  value={requiredJob}
                  onChange={(e) => setRequiredJob(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, fontSize: '13px' }}
                >
                  <option value="صيدلي">صيدلي (Pharmacist)</option>
                  <option value="صيدلي أول">صيدلي أول (Senior Pharmacist)</option>
                  <option value="مساعد صيدلي">مساعد صيدلي (Pharmacy Assistant)</option>
                  <option value="كاشير">كاشير (Cashier)</option>
                  <option value="دليفري">دليفري (Delivery)</option>
                  {jobsList.map(j => (
                    <option key={j.id} value={j.title}>{j.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Shift Times & Presets */}
            <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                  ⏱️ موعد وفترة الوردية المطلوبة ({shiftHours} ساعات)
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handlePresetChange('morning')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      border: shiftPreset === 'morning' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                      background: shiftPreset === 'morning' ? '#f0fdfa' : '#fff',
                      color: shiftPreset === 'morning' ? '#0f766e' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    ☀️ صباحية (08:00 – 16:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange('evening')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      border: shiftPreset === 'evening' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      background: shiftPreset === 'evening' ? '#f0f9ff' : '#fff',
                      color: shiftPreset === 'evening' ? '#0284c7' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    🌆 مسائية (16:00 – 00:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange('night')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      border: shiftPreset === 'night' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                      background: shiftPreset === 'night' ? '#faf5ff' : '#fff',
                      color: shiftPreset === 'night' ? '#7c3aed' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    🌙 ليلية (00:00 – 08:00)
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginBottom: '4px' }}>وقت الدخول:</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => handleTimeChange('start', e.target.value)}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 800, textAlign: 'center' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginBottom: '4px' }}>وقت الخروج:</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => handleTimeChange('end', e.target.value)}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 800, textAlign: 'center' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginBottom: '4px' }}>ساعات الوردية:</span>
                  <div style={{ padding: '7px 10px', background: '#e2e8f0', borderRadius: '6px', fontWeight: 900, textAlign: 'center', fontSize: '13px', color: '#0f172a' }}>
                    {shiftHours} س
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Reason & Surge Allowance */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  📋 سبب طلب الطوارئ
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 700, fontSize: '13px' }}
                >
                  <option value="إجازة مرضية مفاجئة لموظف">إجازة مرضية مفاجئة لموظف</option>
                  <option value="غياب مفاجئ بدون إذن مسبق">غياب مفاجئ بدون إذن مسبق</option>
                  <option value="ضغط تشغيلي ومبيعات استثنائي">ضغط تشغيلي ومبيعات استثنائي</option>
                  <option value="عجز في شفت الصيادلة">عجز في شفت الصيادلة</option>
                  <option value="أخرى">أخرى (موضح في الملاحظات)</option>
                </select>
              </div>

              <div className="field">
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                  🎁 حافز الاستجابة السريعة (بدل طوارئ تشجيعي)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={surgeAllowance}
                    onChange={(e) => setSurgeAllowance(e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '9px 36px 9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, fontSize: '13px' }}
                  />
                  <span style={{ position: 'absolute', right: '12px', top: '10px', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                    ج.م
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#047857', marginTop: '3px', display: 'block' }}>
                  💡 يضاف تلقائياً كمكافأة للموظف المستجيب تقديراً لسرعة الحضور
                </span>
              </div>
            </div>

            {/* Row 4: Smart Relief Radar Selection */}
            <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '12px', border: '1.5px solid #bae6fd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>📡</span>
                  <label style={{ fontSize: '14px', fontWeight: 900, color: '#0369a1' }}>
                    رادار البدلاء الذكي (نتائج المرشحين الأحرار: {candidatesRadar.length})
                  </label>
                </div>
                <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0284c7', padding: '3px 8px', borderRadius: '6px', fontWeight: 800 }}>
                  مرتب حسب الجاهزية والأولوية
                </span>
              </div>

              {/* Option 1: Broadcast */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: selectedCandidateId === 'broadcast' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                  background: selectedCandidateId === 'broadcast' ? '#ffffff' : '#f8fafc',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  boxShadow: selectedCandidateId === 'broadcast' ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none'
                }}
              >
                <input
                  type="radio"
                  name="candidate"
                  value="broadcast"
                  checked={selectedCandidateId === 'broadcast'}
                  onChange={() => setSelectedCandidateId('broadcast')}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '13.5px', color: '#0369a1' }}>
                    📢 بث عام لكافة الكوادر الحرة (Broadcast Pool)
                  </strong>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    إرسال الطلب فورياً لكافة الموظفين الأحرار المؤهلين لسرعة التقاط الوردية من أول مستجيب
                  </div>
                </div>
                <span style={{ background: '#dbeafe', color: '#1e40af', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                  الخيار الأسرع
                </span>
              </label>

              {/* Option 2: Candidates List */}
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {candidatesRadar.map(({ emp, isFloating, statusLabel, statusBg, statusColor, availabilityStatus }) => {
                  const isSelected = selectedCandidateId === emp.id;
                  const isBlocked = availabilityStatus === 'busy_other';

                  return (
                    <label
                      key={emp.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: isSelected ? '2px solid #0f766e' : '1px solid #e2e8f0',
                        background: isSelected ? '#f0fdfa' : '#ffffff',
                        cursor: isBlocked ? 'not-allowed' : 'pointer',
                        opacity: isBlocked ? 0.6 : 1,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <input
                        type="radio"
                        name="candidate"
                        value={emp.id}
                        disabled={isBlocked}
                        checked={isSelected}
                        onChange={() => setSelectedCandidateId(emp.id)}
                        style={{ width: '16px', height: '16px', cursor: isBlocked ? 'not-allowed' : 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '13px', color: '#1e293b' }}>{emp.name}</strong>
                          {isFloating ? (
                            <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              🌐 موظف حر طوارئ
                            </span>
                          ) : (
                            <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                              🔄 متعدد الفروع
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: '#64748b' }}>({emp.jobTitle || 'موظف'})</span>
                        </div>
                        <div style={{ fontSize: '11px', color: statusColor, marginTop: '2px', fontWeight: 700 }}>
                          {statusLabel}
                        </div>
                      </div>
                      <span style={{ fontSize: '11.5px', color: '#475569', direction: 'ltr', fontWeight: 700 }}>
                        {emp.phone || ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Notes Field */}
            <div className="field">
              <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                📝 ملاحظات إضافية وتوجيهات للبديل
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اكتب أي تعليمات خاصة بالوردية أو تفاصيل النقص..."
                rows={2}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '12.5px' }}
              />
            </div>

          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '14px 22px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px' }}
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '9px 24px',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 900,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>{isSubmitting ? '⏳ جاري إرسال طلب الطوارئ...' : '🚨 إرسال طلب التغطية فوراً'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
