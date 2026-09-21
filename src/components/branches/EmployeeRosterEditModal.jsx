import React, { useState, useMemo, useEffect } from 'react';
import { arabicWeekday, fmt } from '../../utils/formatters';
import { DAYS_OF_WEEK, formatTime12H, formatShiftRange12H } from './BranchMonthlyRosterModule';
import { getCycleDateRange } from '../../utils/periodEngine';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';

const DEFAULT_SCHEDULE = {
  'السبت': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الأحد': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الاثنين': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الثلاثاء': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الأربعاء': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الخميس': { type: 'shift', start: '08:00', end: '16:00', hours: 8 },
  'الجمعة': { type: 'off', isOff: true, start: '', end: '', hours: 0 }
};

export default function EmployeeRosterEditModal({
  isOpen,
  onClose,
  employee,
  employees = [],
  branchId,
  branchName,
  selectedMonth,
  state,
  setState,
  saveState,
  showToast,
  isBranchManager = false
}) {
  const [selectedEmpId, setSelectedEmpId] = useState(employee?.id || '');
  const targetEmp = useMemo(() => {
    if (selectedEmpId) {
      return (employees || []).find((e) => String(e.id) === String(selectedEmpId)) || employee;
    }
    return employee || (employees || [])[0] || null;
  }, [selectedEmpId, employees, employee]);

  useEffect(() => {
    if (employee?.id) {
      setSelectedEmpId(employee.id);
    }
  }, [employee]);

  // دورة الشهر المعتمدة للرواتب والتشغيل
  const cycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, state?.orgSettings);
  }, [selectedMonth, state?.orgSettings]);

  const [fromDate, setFromDate] = useState(cycleRange?.startDate || `${selectedMonth}-01`);
  const [toDate, setToDate] = useState(cycleRange?.endDate || `${selectedMonth}-30`);

  useEffect(() => {
    if (cycleRange?.startDate && cycleRange?.endDate) {
      setFromDate(cycleRange.startDate);
      setToDate(cycleRange.endDate);
    }
  }, [cycleRange]);

  // جلب الجدول المعتمد الحالي للموظف لهذا الشهر إن وجد
  const existingRoster = useMemo(() => {
    if (!targetEmp) return null;
    return (state?.rosters || []).find(
      (r) =>
        (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
        (r.month === selectedMonth || !r.month) &&
        (String(r.branchId || '') === String(branchId || '') || !r.branchId)
    );
  }, [state?.rosters, targetEmp, selectedMonth, branchId]);

  // حالة المدخلات للـ 7 أيام
  const [scheduleInputs, setScheduleInputs] = useState(() => {
    if (existingRoster?.schedule && typeof existingRoster.schedule === 'object') {
      return { ...existingRoster.schedule };
    }
    return { ...DEFAULT_SCHEDULE };
  });

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // تحديث المدخلات عند تبديل الموظف
  useEffect(() => {
    if (existingRoster?.schedule && typeof existingRoster.schedule === 'object') {
      setScheduleInputs({ ...existingRoster.schedule });
      if (existingRoster.fromDate) setFromDate(existingRoster.fromDate);
      if (existingRoster.toDate) setToDate(existingRoster.toDate);
    } else {
      setScheduleInputs({ ...DEFAULT_SCHEDULE });
      if (cycleRange?.startDate) setFromDate(cycleRange.startDate);
      if (cycleRange?.endDate) setToDate(cycleRange.endDate);
    }
  }, [targetEmp?.id, existingRoster, cycleRange]);

  // تعديل يوم محدد
  const handleDayChange = (dayLabel, field, value) => {
    setScheduleInputs((prev) => {
      const current = prev[dayLabel] || { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
      let updated = { ...current };

      if (field === 'type') {
        const isOff = value === 'off';
        updated = {
          ...updated,
          type: isOff ? 'off' : 'shift',
          isOff,
          start: isOff ? '' : (updated.start || '08:00'),
          end: isOff ? '' : (updated.end || '16:00'),
          hours: isOff ? 0 : (updated.hours || 8)
        };
      } else if (field === 'start') {
        updated.start = value;
        if (updated.end) {
          const [sH, sM] = value.split(':').map(Number);
          const [eH, eM] = updated.end.split(':').map(Number);
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff <= 0) diff += 24 * 60;
          updated.hours = Math.round((diff / 60) * 10) / 10;
        }
      } else if (field === 'end') {
        updated.end = value;
        if (updated.start) {
          const [sH, sM] = updated.start.split(':').map(Number);
          const [eH, eM] = value.split(':').map(Number);
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff <= 0) diff += 24 * 60;
          updated.hours = Math.round((diff / 60) * 10) / 10;
        }
      }

      return {
        ...prev,
        [dayLabel]: updated
      };
    });
  };

  // تطبيق قوالب الورديات السريعة
  const applyPreset = (presetType) => {
    const newInputs = {};
    DAYS_OF_WEEK.forEach((d) => {
      if (presetType === 'morning') {
        if (d.label === 'الجمعة') {
          newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
        } else {
          newInputs[d.label] = { type: 'shift', isOff: false, start: '08:00', end: '16:00', hours: 8 };
        }
      } else if (presetType === 'evening') {
        if (d.label === 'الجمعة') {
          newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
        } else {
          newInputs[d.label] = { type: 'shift', isOff: false, start: '16:00', end: '00:00', hours: 8 };
        }
      } else if (presetType === 'night') {
        if (d.label === 'الجمعة') {
          newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
        } else {
          newInputs[d.label] = { type: 'shift', isOff: false, start: '00:00', end: '08:00', hours: 8 };
        }
      } else if (presetType === 'all_off') {
        newInputs[d.label] = { type: 'off', isOff: true, start: '', end: '', hours: 0 };
      }
    });
    setScheduleInputs(newInputs);
  };

  // إحصائيات الجدول المعد
  const stats = useMemo(() => {
    let totalWeeklyHours = 0;
    let workDaysCount = 0;
    let offDaysCount = 0;

    DAYS_OF_WEEK.forEach((d) => {
      const conf = scheduleInputs[d.label];
      if (!conf || conf.type === 'off' || conf.isOff === true) {
        offDaysCount++;
      } else if (conf.start && conf.end) {
        workDaysCount++;
        const [sH, sM] = conf.start.split(':').map(Number);
        const [eH, eM] = conf.end.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff <= 0) diff += 24 * 60;
        totalWeeklyHours += Math.round((diff / 60) * 10) / 10;
      }
    });

    return { totalWeeklyHours: Math.round(totalWeeklyHours * 10) / 10, workDaysCount, offDaysCount };
  }, [scheduleInputs]);

  // حفظ وإرسال الجدول
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetEmp) {
      showToast?.('⚠️ يرجى اختيار الموظف أولاً');
      return;
    }

    if (stats.workDaysCount === 0) {
      showToast?.('⚠️ يرجى تحديد وردية عمل واحدة على الأقل في الأسبوع');
      return;
    }

    setSubmitting(true);
    try {
      const safeInputs = { ...scheduleInputs };

      if (!isBranchManager) {
        // ─────────────────────────────────────────────────────────────
        // الحالة الأولى: الإدارة العليا (Admin) ➔ اعتماد وحفظ فوري مباشر
        // ─────────────────────────────────────────────────────────────
        const updatedRosters = [...(state?.rosters || [])];
        const existingIdx = updatedRosters.findIndex(
          (r) =>
            (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
            (r.month === selectedMonth || !r.month) &&
            (String(r.branchId || '') === String(branchId || '') || !r.branchId)
        );

        const rosterId = existingIdx >= 0 ? updatedRosters[existingIdx].id : `roster_${targetEmp.id}_${selectedMonth}_${Date.now()}`;
        const newRosterObj = {
          id: rosterId,
          employeeId: targetEmp.id,
          employeeCode: targetEmp.code || '',
          employeeName: targetEmp.name,
          branchId: branchId || targetEmp.branchId || '',
          branchName: branchName || '',
          month: selectedMonth,
          fromDate: fromDate || cycleRange?.startDate,
          toDate: toDate || cycleRange?.endDate,
          schedule: safeInputs,
          status: 'approved',
          adminApproved: true,
          branchApproved: true,
          approvedAt: new Date().toISOString(),
          approvedBy: 'الإدارة العليا (اعتماد وتعيين مباشر)',
          notes: notes.trim(),
          updatedAt: new Date().toISOString()
        };

        if (existingIdx >= 0) {
          updatedRosters[existingIdx] = newRosterObj;
        } else {
          updatedRosters.unshift(newRosterObj);
        }

        // أيضاً اعتماد أي طلبات روستر معلقة لهذا الموظف لنفس الشهر لإبقاء النظام متسقاً
        const updatedRequests = (state?.requests || []).map((r) => {
          if (
            (String(r.employeeId) === String(targetEmp.id) || (targetEmp.code && String(r.employeeCode) === String(targetEmp.code))) &&
            (r.month === selectedMonth || !r.month) &&
            (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
            (r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_branch')
          ) {
            return {
              ...r,
              status: 'approved',
              adminApproved: true,
              branchApproved: true,
              approvedAt: new Date().toISOString(),
              approvedBy: 'الإدارة العليا'
            };
          }
          return r;
        });

        // إنشاء إشعار رسمي للموظف
        const newNotification = {
          id: `notif_roster_${Date.now()}`,
          employeeId: targetEmp.id,
          title: '📅 تم اعتماد وتعيين جدولك الشهري',
          message: `قامت الإدارة العليا باعتماد وتعيين جدولك الشهري لشهر (${selectedMonth}) للفرع (${branchName}) بنجاح.`,
          type: 'roster_approved',
          createdAt: new Date().toISOString(),
          read: false
        };

        const updatedState = {
          ...state,
          rosters: updatedRosters,
          requests: updatedRequests,
          notifications: [newNotification, ...(state?.notifications || [])]
        };

        setState?.(updatedState);
        if (saveState) await saveState(updatedState);

        showToast?.(`✅ تم تعيين واعتماد الجدول الشهري للموظف (${targetEmp.name}) بنجاح!`);
      } else {
        // ─────────────────────────────────────────────────────────────
        // الحالة الثانية: مدير الفرع (Branch Manager) ➔ إنشاء طلب اعتماد للإدارة
        // ─────────────────────────────────────────────────────────────
        const reqId = `roster_req_${targetEmp.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        const newRosterReq = {
          id: reqId,
          type: 'roster_update',
          requestType: 'roster_update',
          typeLabel: 'طلب اعتماد جدول شهري لموظف',
          employeeId: targetEmp.id,
          employeeName: targetEmp.name,
          employeeCode: targetEmp.code || '',
          jobTitle: targetEmp.jobTitle || '',
          branchId: branchId || targetEmp.branchId || '',
          branchName: branchName || '',
          month: selectedMonth,
          fromDate: fromDate || cycleRange?.startDate,
          toDate: toDate || cycleRange?.endDate,
          schedule: safeInputs,
          newSchedule: safeInputs,
          oldSchedule: existingRoster?.schedule || null,
          previousSchedule: existingRoster?.schedule || null,
          submittedBy: 'branch_manager',
          managerStatus: 'approved',
          branchApproved: true,
          branchApprovalStatus: 'approved',
          targetApproval: 'admin_only',
          status: 'pending_admin',
          details: `قام مدير فرع (${branchName}) بإعداد الجدول الشهري للموظف (${targetEmp.name}) لشهر (${selectedMonth}) وبانتظار الاعتماد النهائي من الإدارة العليا. ${notes ? 'ملاحظات: ' + notes.trim() : ''}`,
          reason: notes.trim(),
          createdAt: new Date().toISOString()
        };

        const updatedRequests = [newRosterReq, ...(state?.requests || [])];
        const updatedState = {
          ...state,
          requests: updatedRequests
        };

        setState?.(updatedState);
        if (saveState) await saveState(updatedState);

        // إشعار الإدارة العليا عبر Gmail
        try {
          notifyAdminOnNewRequest({
            state: updatedState,
            newRequest: newRosterReq,
            empName: targetEmp.name
          });
        } catch (mailErr) {
          console.warn('Mail notification error:', mailErr);
        }

        showToast?.(`✅ تم إعداد الجدول للموظف (${targetEmp.name}) وإرسال طلب الاعتماد للإدارة العليا بنجاح`);
      }

      onClose?.();
    } catch (err) {
      console.error('Error saving employee roster:', err);
      showToast?.('❌ حدث خطأ أثناء حفظ الجدول الشهري');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)' }}>
      <div
        className="modal-content card fade-in"
        style={{
          maxWidth: '880px',
          width: '95%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          fontFamily: "'Tajawal', sans-serif"
        }}
      >
        {/* ── 1. ترويسة المودال والصفة ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '26px' }}>{isBranchManager ? '📝' : '⚡'}</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>
                  {isBranchManager ? 'إعداد وتصميم جدول شهري لموظف (طلب اعتماد للإدارة)' : 'تعيين واعتماد الجدول الشهري للموظف فورياً'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                  {isBranchManager
                    ? 'يقوم مدير الفرع بضبط مواعيد العمل الأسبوعية، وترسل للإدارة العليا لاعتمادها رسمياً.'
                    : 'صلاحية الإدارة العليا: يتم تطبيق واعتماد الجدول فورياً في ملف الموظف ومسير الرواتب.'}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: '18px', padding: '4px 10px', borderRadius: '8px' }}
          >
            ✕
          </button>
        </div>

        {/* ── 2. شريط بيانات الموظف والفرع ودورة الشهر ── */}
        <div style={{ background: 'var(--surface-muted)', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)' }}>الموظف المستهدف:</label>
              {employees.length > 1 ? (
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, fontSize: '13px' }}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.code || 'بدون كود'}) - {e.jobTitle || 'موظف'}
                    </option>
                  ))}
                </select>
              ) : (
                <strong style={{ fontSize: '14px' }}>{targetEmp?.name} ({targetEmp?.code})</strong>
              )}
            </div>

            <div style={{ fontSize: '12.5px' }}>
              🏢 الفرع: <strong>{branchName || 'الفرع الرئيسي'}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
              📅 دورة الشهر: {cycleRange?.label || selectedMonth}
            </span>
            {existingRoster ? (
              <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 800 }}>
                ✓ يوجد جدول معتمد
              </span>
            ) : (
              <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 800 }}>
                ⚠️ غير محدد بعد
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── 3. قوالب الورديات السريعة (Quick Presets) ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
              ⚡ قوالب ضبط سريعة:
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => applyPreset('morning')}
                style={{ fontSize: '11.5px', padding: '4px 10px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '6px' }}
                title="وردية صباحية 8 ص - 4 م (الجمعة راحة)"
              >
                ☀️ صباحي (08:00 - 16:00)
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => applyPreset('evening')}
                style={{ fontSize: '11.5px', padding: '4px 10px', background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '6px' }}
                title="وردية مسائية 4 م - 12 ص (الجمعة راحة)"
              >
                🌆 مسائي (16:00 - 00:00)
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => applyPreset('night')}
                style={{ fontSize: '11.5px', padding: '4px 10px', background: '#faf5ff', color: '#6b21a8', border: '1px solid #d8b4fe', borderRadius: '6px' }}
                title="وردية ليلية 12 ص - 8 ص (الجمعة راحة)"
              >
                🌙 ليلي (00:00 - 08:00)
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => applyPreset('all_off')}
                style={{ fontSize: '11.5px', padding: '4px 10px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px' }}
                title="تفريغ كافة الأيام وجعلها راحة"
              >
                🧹 تفريغ (راحة للكل)
              </button>
            </div>
          </div>

          {/* ── 4. جدول الأيام السبعة ── */}
          <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
            <table className="bylaws-table" style={{ margin: 0, fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)' }}>
                  <th style={{ width: '120px', padding: '10px 12px' }}>اليوم</th>
                  <th style={{ width: '170px', padding: '10px 12px' }}>نوع اليوم</th>
                  <th style={{ padding: '10px 12px' }}>موعد البداية (دخول)</th>
                  <th style={{ padding: '10px 12px' }}>موعد النهاية (خروج)</th>
                  <th style={{ width: '110px', textAlign: 'center', padding: '10px 12px' }}>ساعات العمل</th>
                </tr>
              </thead>
              <tbody>
                {DAYS_OF_WEEK.map((d) => {
                  const conf = scheduleInputs[d.label] || { type: 'shift', start: '08:00', end: '16:00', hours: 8 };
                  const isOff = conf.type === 'off' || conf.isOff === true;

                  return (
                    <tr
                      key={d.key}
                      style={{
                        background: isOff ? 'rgba(245, 158, 11, 0.04)' : 'transparent',
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      <td style={{ fontWeight: 800, padding: '10px 12px' }}>
                        <span style={{ display: 'inline-block', width: '22px' }}>{isOff ? '🏖️' : '🟢'}</span>
                        {d.label}
                      </td>

                      <td style={{ padding: '8px 12px' }}>
                        <select
                          value={isOff ? 'off' : 'shift'}
                          onChange={(e) => handleDayChange(d.label, 'type', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: `1.5px solid ${isOff ? '#fde68a' : 'var(--border)'}`,
                            background: isOff ? '#fefce8' : '#fff',
                            fontWeight: 700,
                            color: isOff ? '#92400e' : 'var(--text)'
                          }}
                        >
                          <option value="shift">🟢 وردية عمل (Shift)</option>
                          <option value="off">🏖️ راحة أسبوعية (OFF)</option>
                        </select>
                      </td>

                      <td style={{ padding: '8px 12px' }}>
                        {isOff ? (
                          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>— غير محدد</span>
                        ) : (
                          <input
                            type="time"
                            value={conf.start || '08:00'}
                            onChange={(e) => handleDayChange(d.label, 'start', e.target.value)}
                            required={!isOff}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid var(--border)',
                              fontSize: '13px',
                              fontWeight: 700,
                              width: '130px'
                            }}
                          />
                        )}
                      </td>

                      <td style={{ padding: '8px 12px' }}>
                        {isOff ? (
                          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>— غير محدد</span>
                        ) : (
                          <input
                            type="time"
                            value={conf.end || '16:00'}
                            onChange={(e) => handleDayChange(d.label, 'end', e.target.value)}
                            required={!isOff}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid var(--border)',
                              fontSize: '13px',
                              fontWeight: 700,
                              width: '130px'
                            }}
                          />
                        )}
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 800, padding: '8px 12px' }}>
                        {isOff ? (
                          <span style={{ color: '#b45309', fontSize: '12px' }}>0 س</span>
                        ) : (
                          <span style={{ color: 'var(--primary)', fontSize: '13px' }}>
                            {conf.hours || 8} س
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── 5. بطاقة ملخص ساعات الأسبوع ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⏱️</span>
              <div>
                <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>ساعات العمل الأسبوعية</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#15803d' }}>{stats.totalWeeklyHours} ساعة</div>
              </div>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>💼</span>
              <div>
                <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700 }}>أيام العمل بالجدول</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#1d4ed8' }}>{stats.workDaysCount} أيام</div>
              </div>
            </div>

            <div style={{ background: '#fefce8', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🏖️</span>
              <div>
                <div style={{ fontSize: '11px', color: '#854d0e', fontWeight: 700 }}>أيام الراحة الأسبوعية</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#a16207' }}>{stats.offDaysCount} أيام</div>
              </div>
            </div>
          </div>

          {/* ── 6. ملاحظات إضافية ── */}
          <div className="field" style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700 }}>ملاحظات أو توجيهات خاصة بالجدول (اختياري):</label>
            <input
              type="text"
              placeholder="اكتب أي ملاحظة أو سبب للتعديل..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
            />
          </div>

          {/* ── 7. أزرار الإجراء والاعتماد ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '8px 18px', fontSize: '13px' }}
            >
              إلغاء التراجع
            </button>

            <button
              type="submit"
              className="btn btn-start"
              disabled={submitting}
              style={{
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 900,
                background: isBranchManager
                  ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#fff',
                borderRadius: '10px',
                boxShadow: isBranchManager
                  ? '0 4px 14px rgba(2, 132, 199, 0.3)'
                  : '0 4px 14px rgba(5, 150, 105, 0.3)'
              }}
            >
              {submitting
                ? 'جاري المعالجة...'
                : isBranchManager
                ? '📤 حفظ وإرسال طلب اعتماد الجدول للإدارة العليا'
                : '⚡ اعتماد وحفظ الجدول الشهري فورياً'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
