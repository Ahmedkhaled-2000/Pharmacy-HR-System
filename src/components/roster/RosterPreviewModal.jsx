import React, { useEffect } from 'react';
import { getResolvedEmployeeRoster } from './RosterModule';
import { getEmpDisplayName } from '../../utils/formatters';

function getDayShiftInfo(schedule, day, fallbackHours = 8) {
  // If no schedule was provided or empty, do NOT invent fake shifts
  if (!schedule || typeof schedule !== 'object' || Object.keys(schedule).length === 0) {
    return {
      isOff: false,
      notScheduled: true,
      checkIn: '—',
      checkOut: '—',
      hours: 0
    };
  }

  const possibleKeys = [
    day.label,
    day.key,
    day.label.replace('الإثنين', 'الاثنين'),
    day.label.replace('الاثنين', 'الإثنين'),
    day.label.replace('الأحد', 'الاحد'),
    day.label.replace('الأربعاء', 'الاربعاء')
  ];

  let raw = null;
  for (const k of possibleKeys) {
    if (schedule[k] !== undefined) {
      raw = schedule[k];
      break;
    }
  }

  if (!raw) {
    const normTarget = day.label.replace(/[\u0625\u0623\u0622]/g, 'ا');
    for (const [k, v] of Object.entries(schedule)) {
      if (k.replace(/[\u0625\u0623\u0622]/g, 'ا') === normTarget || String(k).toLowerCase() === day.key.toLowerCase()) {
        raw = v;
        break;
      }
    }
  }

  if (raw && typeof raw === 'object') {
    const isOff = raw.type === 'off' || raw.isOff === true;
    const checkIn = raw.start || raw.checkIn || (isOff ? '—' : '08:00');
    const checkOut = raw.end || raw.checkOut || (isOff ? '—' : '16:00');
    let hours = raw.hours !== undefined ? raw.hours : (isOff ? 0 : fallbackHours);
    return { isOff, notScheduled: false, checkIn, checkOut, hours };
  }

  return {
    isOff: false,
    notScheduled: true,
    checkIn: '—',
    checkOut: '—',
    hours: 0
  };
}

export default function RosterPreviewModal({
  employee,
  state,
  onClose
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!employee) return null;

  const empRoster = getResolvedEmployeeRoster(employee, null, state);
  const hasApprovedRoster = Boolean(
    empRoster?.status === 'approved' &&
    empRoster?.schedule &&
    Object.keys(empRoster.schedule).length > 0
  );

  const pendingReq = (state?.requests || []).find(
    req =>
      (String(req.employeeId) === String(employee.id) || (employee.code && String(req.employeeCode) === String(employee.code))) &&
      ['roster_update', 'roster_edit', 'roster_edit_request', 'schedule_edit'].includes(req.type) &&
      ['pending', 'pending_admin', 'pending_branch'].includes(req.status)
  );

  const hasPendingReq = Boolean(pendingReq);
  const singleSchedule = hasApprovedRoster
    ? empRoster.schedule
    : (hasPendingReq ? (pendingReq.schedule || pendingReq.newSchedule || null) : null);

  const daysOfWeek = [
    { key: 'sunday', label: 'الأحد' },
    { key: 'monday', label: 'الإثنين' },
    { key: 'tuesday', label: 'الثلاثاء' },
    { key: 'wednesday', label: 'الأربعاء' },
    { key: 'thursday', label: 'الخميس' },
    { key: 'friday', label: 'الجمعة' },
    { key: 'saturday', label: 'السبت' },
  ];

  const isMultiBranch = employee.branchesDetails && employee.branchesDetails.length > 1;

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(1100px, 96vw)',
          width: '95%',
          maxHeight: 'min(92vh, calc(100dvh - 28px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.3)'
        }}
      >
        {/* Header Pro */}
        <div className="modal-header-pro">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
              }}
            >
              📅
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>
                  الجدول الشهري والأسبوعي للموظف: {getEmpDisplayName(employee)}
                </h3>
                <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(13, 148, 136, 0.1)', color: 'var(--primary, #0d9488)', padding: '2px 8px', borderRadius: '6px' }}>
                  كود: {employee.code}
                </span>
                {employee.jobTitle && (
                  <span style={{ fontSize: '11px', fontWeight: 600, background: 'var(--surface-muted, #f1f5f9)', color: 'var(--text-secondary, #64748b)', padding: '2px 8px', borderRadius: '6px' }}>
                    {employee.jobTitle}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                {isMultiBranch ? `مسجل في ${employee.branchesDetails.length} فروع` : `الفرع: ${employee.branchName || 'الرئيسي'}`}
                {employee.nickname && employee.nickname.trim() !== employee.name?.trim() && ` | الاسم الرسمي: ${employee.name}`}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="modal-close-circle-btn"
            title="إغلاق النافذة (Esc)"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 }}>
          {isMultiBranch ? (
            <div>
              {employee.branchesDetails.map((bd) => {
                const bId = bd.branchId;
                const bObj = (state.branches || []).find((b) => String(b.id) === String(bId));
                const bName = bObj ? bObj.name : `فرع ${bId}`;
                const bRoster = getResolvedEmployeeRoster(employee, bId, state);
                const bHasApproved = Boolean(
                  bRoster?.status === 'approved' &&
                  bRoster?.schedule &&
                  Object.keys(bRoster.schedule).length > 0
                );

                const bPendingReq = (state?.requests || []).find(
                  req =>
                    (String(req.employeeId) === String(employee.id) || (employee.code && String(req.employeeCode) === String(employee.code))) &&
                    String(req.branchId || '') === String(bId) &&
                    ['roster_update', 'roster_edit', 'roster_edit_request', 'schedule_edit'].includes(req.type) &&
                    ['pending', 'pending_admin', 'pending_branch'].includes(req.status)
                );

                const bSchedule = bHasApproved
                  ? bRoster.schedule
                  : (bPendingReq ? (bPendingReq.schedule || bPendingReq.newSchedule || null) : null);

                return (
                  <div key={bId} style={{ marginBottom: '22px', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'var(--surface-muted, #f8fafc)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: 'var(--primary, #0d9488)', fontSize: '15px', fontWeight: 800 }}>
                        🏢 جدول فرع: {bName}
                      </h4>
                      <div>
                        {bHasApproved ? (
                          <span className="badge badge-success">🟢 معتمد من الإدارة والفرع</span>
                        ) : bPendingReq ? (
                          <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b' }}>
                            ⏳ قيد المراجعة والاعتماد
                          </span>
                        ) : (
                          <span className="badge badge-danger" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                            ❌ عدم وجود جدول معتمد
                          </span>
                        )}
                      </div>
                    </div>

                    {!bHasApproved && !bPendingReq && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 14px', borderRadius: '8px', color: '#991b1b', marginBottom: '12px', fontSize: '12.5px' }}>
                        ⚠️ لم يتم إرسال أو اعتماد أي جدول لهذا الموظف في هذا الفرع.
                      </div>
                    )}

                    <div className="table-responsive">
                      <table className="bylaws-table" style={{ fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface, #fff)' }}>
                            <th>اليوم</th>
                            <th>نوع اليوم / الشفت</th>
                            <th>موعد الدخول (Check-in)</th>
                            <th>موعد الخروج (Check-out)</th>
                            <th>ساعات الشفت</th>
                            <th>الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {daysOfWeek.map((day) => {
                            const shiftInfo = getDayShiftInfo(bSchedule, day, bd.workHoursPerDay || 8);
                            const { isOff, notScheduled, checkIn, checkOut, hours } = shiftInfo;

                            return (
                              <tr key={day.key} style={{ background: isOff ? '#fef2f2' : (notScheduled ? 'rgba(239, 68, 68, 0.03)' : 'transparent') }}>
                                <td style={{ fontWeight: '800' }}>{day.label}</td>
                                <td>
                                  {notScheduled ? (
                                    <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                                      ⚠️ غير محدد
                                    </span>
                                  ) : isOff ? (
                                    <span className="badge badge-danger">🔴 راحة أسبوعية (Off)</span>
                                  ) : (
                                    <span className="badge badge-success">🟢 وردية عمل عادية</span>
                                  )}
                                </td>
                                <td style={{ fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#15803d') }}>
                                  {isOff || notScheduled ? '—' : checkIn}
                                </td>
                                <td style={{ fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#b91c1c') }}>
                                  {isOff || notScheduled ? '—' : checkOut}
                                </td>
                                <td style={{ fontWeight: '700' }}>
                                  {notScheduled || isOff ? '0 ساعة' : `${hours} ساعات`}
                                </td>
                                <td>
                                  {notScheduled ? (
                                    <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 700 }}>غير مجدول</span>
                                  ) : isOff ? (
                                    <span style={{ color: '#dc2626', fontSize: '12px' }}>راحة رسمية</span>
                                  ) : (
                                    <span style={{ color: '#16a34a', fontSize: '12px' }}>مجدول</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Single branch standard rendering */
            <div>
              {hasApprovedRoster ? (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', color: '#166534', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span>
                    حالة اعتماد الجدول الشهري:{' '}
                    <strong style={{ color: '#15803d' }}>🟢 معتمد نهائياً (مدير الفرع + الإدارة العليا)</strong>
                  </span>
                  <span style={{ fontSize: '12px', color: '#166534' }}>بداية الشهر: 25 من كل شهر</span>
                </div>
              ) : hasPendingReq ? (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', color: '#92400e', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span>
                    حالة اعتماد الجدول الشهري:{' '}
                    <strong style={{ color: '#b45309' }}>⏳ بانتظار استكمال الموافقات المزدوجة (تم إرسال الجدول من الموظف وهو قيد المراجعة)</strong>
                  </span>
                  <span style={{ fontSize: '12px', color: '#92400e' }}>
                    تاريخ التقديم: {pendingReq.date || pendingReq.createdAt?.slice(0, 10) || '—'}
                  </span>
                </div>
              ) : (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', padding: '14px 18px', borderRadius: '12px', color: '#991b1b', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '18px' }}>❌</span>
                    <strong style={{ fontSize: '14px', color: '#b91c1c' }}>
                      حالة اعتماد الجدول الشهري: عدم وجود جدول معتمد
                    </strong>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#7f1d1d', lineHeight: '1.6' }}>
                    ⚠️ لم يقم الموظف بإرسال أي جدول شهري من بوابته حتى الآن، ولا يوجد جدول عمل معتمد له. لم يتم تحديد مواعيد حضور وانصراف رسمية.
                  </div>
                </div>
              )}

              <div className="table-responsive">
                <table className="bylaws-table" style={{ fontSize: '13.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted, #f8fafc)' }}>
                      <th>اليوم</th>
                      <th>نوع اليوم / الشفت</th>
                      <th>موعد الدخول (Check-in)</th>
                      <th>موعد الخروج (Check-out)</th>
                      <th>ساعات الشفت</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daysOfWeek.map((day) => {
                      const shiftInfo = getDayShiftInfo(singleSchedule, day, employee.workHoursPerDay || 8);
                      const { isOff, notScheduled, checkIn, checkOut, hours } = shiftInfo;

                      return (
                        <tr key={day.key} style={{ background: isOff ? '#fef2f2' : (notScheduled ? 'rgba(239, 68, 68, 0.03)' : 'transparent') }}>
                          <td style={{ fontWeight: '800' }}>{day.label}</td>
                          <td>
                            {notScheduled ? (
                              <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                                ⚠️ غير محدد
                              </span>
                            ) : isOff ? (
                              <span className="badge badge-danger">🔴 راحة أسبوعية (Off)</span>
                            ) : (
                              <span className="badge badge-success">🟢 وردية عمل عادية</span>
                            )}
                          </td>
                          <td style={{ fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#15803d') }}>
                            {isOff || notScheduled ? '—' : checkIn}
                          </td>
                          <td style={{ fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#b91c1c') }}>
                            {isOff || notScheduled ? '—' : checkOut}
                          </td>
                          <td style={{ fontWeight: '700' }}>
                            {notScheduled || isOff ? '0 ساعة' : `${hours} ساعات`}
                          </td>
                          <td>
                            {notScheduled ? (
                              <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 700 }}>غير مجدول (لا يوجد جدول)</span>
                            ) : isOff ? (
                              <span style={{ color: '#dc2626', fontSize: '12px' }}>راحة رسمية</span>
                            ) : (
                              <span style={{ color: '#16a34a', fontSize: '12px' }}>مجدول</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-actions-pro" style={{ justifyContent: 'flex-end', padding: '12px 20px' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '7px 20px', fontSize: '13px' }}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
