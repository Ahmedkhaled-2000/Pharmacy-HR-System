import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getResolvedEmployeeRoster } from './RosterModule';
import { getEmpDisplayName, arabicWeekday, getRealTodayStr } from '../../utils/formatters';
import { getCycleDateRange, getActivePayrollMonth } from '../../utils/periodEngine';
import { getEmployeeDaySchedule, getDayScheduleFromMap } from '../../utils/rosterEngine';

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
  setState,
  saveState,
  showToast,
  selectedMonth,
  onClose
}) {
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'weekly'
  const [editingDay, setEditingDay] = useState(null); // { dateStr, dayName, currentShift }
  const [editType, setEditType] = useState('shift'); // 'shift' | 'off'
  const [editStart, setEditStart] = useState('08:00');
  const [editEnd, setEditEnd] = useState('16:00');
  const [editHours, setEditHours] = useState(8);
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingDay) {
          setEditingDay(null);
        } else {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, editingDay]);

  if (!employee) return null;

  const orgSettings = state?.orgSettings || {};
  const activeCycleDefault = useMemo(() => {
    return getActivePayrollMonth(orgSettings);
  }, [orgSettings.payrollPayoutStartDay, orgSettings.payrollPayoutEndDay, orgSettings.payrollPeriodType]);

  const [currentMonth, setCurrentMonth] = useState(() => (
    selectedMonth || activeCycleDefault || (getRealTodayStr ? getRealTodayStr().slice(0, 7) : new Date().toISOString().slice(0, 7))
  ));

  useEffect(() => {
    if (selectedMonth && selectedMonth !== currentMonth) {
      setCurrentMonth(selectedMonth);
    }
  }, [selectedMonth]);

  const activeMonth = currentMonth;

  // Available cycle options for modal dropdown switcher
  const availableCycleOptions = useMemo(() => {
    const baseMonth = activeCycleDefault || getActivePayrollMonth(orgSettings);
    const [y, m] = baseMonth.split('-').map(Number);
    const options = [];
    for (let offset = -3; offset <= 2; offset++) {
      let targetM = m + offset;
      let targetY = y;
      while (targetM < 1) {
        targetM += 12;
        targetY -= 1;
      }
      while (targetM > 12) {
        targetM -= 12;
        targetY += 1;
      }
      const mStr = `${targetY}-${String(targetM).padStart(2, '0')}`;
      const rng = getCycleDateRange(mStr, orgSettings);
      options.push({
        month: mStr,
        label: rng.label || mStr,
        shortLabel: `${rng.startDate} إلى ${rng.endDate}`,
        isCurrent: mStr === baseMonth
      });
    }
    return options;
  }, [activeCycleDefault, orgSettings]);

  // ── الدورة النشطة للرواتب والتشغيل ──
  const cycleRange = useMemo(() => {
    return getCycleDateRange(activeMonth, orgSettings);
  }, [activeMonth, orgSettings]);

  // ── قائمة كافة تواريخ الدورة الشهرية ──
  const cycleDates = useMemo(() => {
    if (!cycleRange?.startDate || !cycleRange?.endDate) return [];
    const list = [];
    let curr = new Date(cycleRange.startDate + 'T00:00:00');
    const end = new Date(cycleRange.endDate + 'T00:00:00');
    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      list.push({
        dateStr,
        dayName: arabicWeekday(dateStr),
        dateFormatted: dateStr
      });
      curr.setDate(curr.getDate() + 1);
    }
    return list;
  }, [cycleRange]);

  const empRoster = getResolvedEmployeeRoster(employee, null, state, activeMonth);
  const hasApprovedRoster = Boolean(
    empRoster?.status === 'approved' &&
    empRoster?.schedule &&
    Object.keys(empRoster.schedule).length > 0
  );

  const pendingReq = (state?.requests || []).find(
    req =>
      (String(req.employeeId) === String(employee.id) || (employee.code && String(req.employeeCode) === String(employee.code))) &&
      ['roster_update', 'roster_edit', 'roster_edit_request', 'schedule_edit'].includes(req.type) &&
      ['pending', 'pending_admin', 'pending_branch'].includes(req.status) &&
      (!req.month || req.month === activeMonth || (req.fromDate && req.fromDate <= cycleRange.endDate && req.toDate >= cycleRange.startDate))
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

  // ── فتح نافذة تعديل شفت يوم معين ──
  const handleOpenEditDay = (dateStr, dayName, currentShift) => {
    const isOff = currentShift?.type === 'off' || currentShift?.isOff === true;
    setEditType(isOff ? 'off' : 'shift');
    setEditStart(currentShift?.start || '08:00');
    setEditEnd(currentShift?.end || '16:00');
    setEditHours(currentShift?.hours !== undefined ? currentShift.hours : (isOff ? 0 : (employee.workHoursPerDay || 8)));
    setEditNote(currentShift?.note || '');
    setEditingDay({ dateStr, dayName, currentShift });
  };

  // ── حفظ وتثبيت تعديل شفت يوم معين في الروستر المعتمد ──
  const handleSaveDayEdit = () => {
    if (!editingDay) return;
    const isOff = editType === 'off';
    const shiftPayload = {
      type: isOff ? 'off' : 'shift',
      isOff,
      start: isOff ? '' : editStart,
      end: isOff ? '' : editEnd,
      hours: isOff ? 0 : (parseFloat(editHours) || (employee.workHoursPerDay || 8)),
      editedByAdmin: true,
      note: editNote || 'تعديل شفت مباشر من الإدارة',
      updatedAt: new Date().toISOString()
    };

    const existingRosters = state?.rosters || [];
    const targetMonthKey = activeMonth || cycleRange.month || editingDay.dateStr.slice(0, 7);

    const rIdx = existingRosters.findIndex(r =>
      (String(r.employeeId) === String(employee.id) || (employee.code && String(r.employeeCode) === String(employee.code))) &&
      (!r.month || r.month === targetMonthKey)
    );

    let updatedRosters;
    if (rIdx >= 0) {
      const oldRoster = existingRosters[rIdx];
      const updatedSchedule = {
        ...(oldRoster.schedule || {}),
        [editingDay.dateStr]: shiftPayload
      };
      updatedRosters = existingRosters.map((r, i) =>
        i === rIdx
          ? {
              ...r,
              schedule: updatedSchedule,
              status: 'approved',
              adminApproved: true,
              updatedAt: new Date().toISOString()
            }
          : r
      );
    } else {
      const newRoster = {
        id: `roster_${employee.id}_${targetMonthKey}_${Date.now()}`,
        employeeId: employee.id,
        employeeCode: employee.code || '',
        employeeName: employee.name || '',
        month: targetMonthKey,
        status: 'approved',
        adminApproved: true,
        branchId: employee.branchId || null,
        schedule: {
          ...(singleSchedule || {}),
          [editingDay.dateStr]: shiftPayload
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      updatedRosters = [...existingRosters, newRoster];
    }

    const newState = {
      ...state,
      rosters: updatedRosters
    };

    setState?.(newState);
    saveState?.(newState);
    showToast?.(`تم حفظ وتثبيت شفت يوم ${editingDay.dayName} (${editingDay.dateStr}) بنجاح`, 'success');
    setEditingDay(null);
  };

  const modalJSX = (
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
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '12px 10px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(1150px, 96vw)',
          width: '95%',
          height: 'calc(100dvh - 28px)',
          maxHeight: 'calc(100dvh - 28px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.3)',
          background: 'var(--surface, #ffffff)',
          margin: 'auto'
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
        <div style={{ padding: '18px 22px', overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 }}>
          {isMultiBranch ? (
            <div>
              {employee.branchesDetails.map((bd) => {
                const bId = bd.branchId;
                const bObj = (state.branches || []).find((b) => String(b.id) === String(bId));
                const bName = bObj ? bObj.name : `فرع ${bId}`;
                const bRoster = getResolvedEmployeeRoster(employee, bId, state, activeMonth);
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
                    ['pending', 'pending_admin', 'pending_branch'].includes(req.status) &&
                    (!req.month || req.month === activeMonth || (req.fromDate && req.fromDate <= cycleRange.endDate && req.toDate >= cycleRange.startDate))
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
              {employee.noMonthlySchedule ? (
                <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', padding: '16px 20px', borderRadius: '12px', color: '#5b21b6', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '24px' }}>⏱️</span>
                      <strong style={{ fontSize: '15px', color: '#6d28d9' }}>
                        حالة اعتماد الجدول الشهري: ليس لديه جدول شهري مواعيد متغيرة
                      </strong>
                    </div>
                    <span style={{ background: '#7c3aed', color: '#fff', fontSize: '12px', fontWeight: 800, padding: '4px 12px', borderRadius: '99px' }}>
                      ساعات حرة عبر البصمة
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#4c1d95', lineHeight: '1.7' }}>
                    ✓ هذا الموظف يعمل بنظام الساعات المرنة دون مواعيد شفتات ثابتة، ولا تطبق عليه لائحة التأخيرات أو الساعات الإضافية أو الغياب الجدولي.
                    <br />
                    🛋️ <strong>أيام الراحة الأسبوعية المعتمدة للموظف:</strong>{' '}
                    <span style={{ fontWeight: 800, color: '#7c3aed' }}>
                      {(employee.weeklyRestDays || ['الجمعة']).join('، ')}
                    </span>
                  </div>
                </div>
              ) : hasApprovedRoster ? (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', color: '#166534', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span>
                    حالة اعتماد الجدول الشهري:{' '}
                    <strong style={{ color: '#15803d' }}>🟢 معتمد نهائياً (مدير الفرع + الإدارة العليا)</strong>
                  </span>
                  <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: 700 }}>
                    📅 نطاق دورة الرواتب: من {cycleRange.startDate} إلى {cycleRange.endDate} (بداية الدورة: {cycleRange.startDay || 25} من كل شهر)
                  </span>
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
                    ⚠️ لم يقم الموظف بإرسال أي جدول شهري من بوابته حتى الآن، ولا يوجد جدول عمل معتمد له. يمكنك تعيين أو تعديل شفتات أي يوم مباشرة من خلال جدول التقويم أدناه.
                  </div>
                </div>
              )}

              {/* View Switcher Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-muted, #f1f5f9)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setViewMode('calendar')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      background: viewMode === 'calendar' ? 'var(--primary, #0d9488)' : 'transparent',
                      color: viewMode === 'calendar' ? '#ffffff' : 'var(--text-secondary, #64748b)',
                      boxShadow: viewMode === 'calendar' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    📅 تقويم الدورة الشهرية الكامل ({cycleDates.length} يوم)
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('weekly')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      background: viewMode === 'weekly' ? 'var(--primary, #0d9488)' : 'transparent',
                      color: viewMode === 'weekly' ? '#ffffff' : 'var(--text-secondary, #64748b)',
                      boxShadow: viewMode === 'weekly' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    📋 القالب الأسبوعي القياسي (7 أيام)
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)' }}>📅 الدورة:</span>
                    <select
                      value={activeMonth}
                      onChange={(e) => setCurrentMonth(e.target.value)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: '1.5px solid #0d9488',
                        background: 'var(--surface, #ffffff)',
                        fontWeight: 800,
                        fontSize: '12px',
                        color: '#0f766e',
                        cursor: 'pointer'
                      }}
                      title="التبديل بين دورات الشهور لمعاينة جدول الموظف"
                    >
                      {availableCycleOptions.map((opt) => (
                        <option key={opt.month} value={opt.month}>
                          {opt.label} {opt.isCurrent ? '⚡' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>نطاق الدورة:</span>
                    <strong style={{ color: 'var(--text)', background: 'var(--surface-muted, #f1f5f9)', padding: '3px 8px', borderRadius: '6px' }}>
                      {cycleRange?.startDate} ⬅️ {cycleRange?.endDate}
                    </strong>
                  </div>
                </div>
              </div>

              {/* View 1: Calendar View (Day by Day) */}
              {viewMode === 'calendar' ? (
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <table className="bylaws-table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-muted, #f8fafc)' }}>
                        <th style={{ width: '170px', padding: '10px 12px' }}>اليوم والتاريخ</th>
                        <th style={{ padding: '10px 12px' }}>نوع اليوم / الشفت</th>
                        <th style={{ padding: '10px 12px' }}>موعد الدخول (Check-in)</th>
                        <th style={{ padding: '10px 12px' }}>موعد الخروج (Check-out)</th>
                        <th style={{ padding: '10px 12px' }}>ساعات الشفت</th>
                        <th style={{ padding: '10px 12px' }}>الحالة والمصدر</th>
                        <th style={{ textAlign: 'center', width: '150px', padding: '10px 12px' }}>الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycleDates.map((item) => {
                        let daySched = getEmployeeDaySchedule(employee.id, item.dateStr, state);
                        if (!daySched && singleSchedule) {
                          const jsDay = new Date(item.dateStr + 'T00:00:00').getDay();
                          daySched = getDayScheduleFromMap(singleSchedule, jsDay, item.dateStr);
                        }
                        const isOff = daySched?.type === 'off' || daySched?.isOff === true;
                        const notScheduled = !daySched || (!isOff && !daySched.start && !daySched.end);
                        const checkIn = daySched?.start || (isOff ? '—' : '—');
                        const checkOut = daySched?.end || (isOff ? '—' : '—');
                        const hours = daySched?.hours !== undefined ? daySched.hours : (isOff ? 0 : (checkIn !== '—' && checkOut !== '—' ? (employee.workHoursPerDay || 8) : 0));
                        const isToday = item.dateStr === (getRealTodayStr ? getRealTodayStr() : new Date().toISOString().slice(0, 10));

                        return (
                          <tr
                            key={item.dateStr}
                            style={{
                              background: isToday ? 'rgba(13, 148, 136, 0.08)' : (isOff ? '#fef2f2' : (notScheduled ? 'rgba(239, 68, 68, 0.03)' : 'transparent')),
                              borderRight: isToday ? '4px solid var(--primary, #0d9488)' : 'none',
                              borderBottom: '1px solid var(--border)'
                            }}
                          >
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 800, color: isToday ? 'var(--primary, #0d9488)' : 'var(--text)' }}>
                                  {item.dayName} {isToday && <span style={{ fontSize: '10px', background: '#0d9488', color: '#fff', padding: '1px 6px', borderRadius: '4px', marginRight: '4px' }}>اليوم</span>}
                                </span>
                                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                                  {item.dateStr}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {notScheduled ? (
                                <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                                  ⚠️ غير محدد
                                </span>
                              ) : isOff ? (
                                <span className="badge badge-danger">🔴 راحة أسبوعية (Off)</span>
                              ) : (
                                <span className="badge badge-success">🟢 وردية عمل</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#15803d') }}>
                              {isOff || notScheduled ? '—' : checkIn}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#b91c1c') }}>
                              {isOff || notScheduled ? '—' : checkOut}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: '700' }}>
                              {notScheduled || isOff ? '0 ساعة' : `${hours} ساعات`}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {daySched?.isAdjusted ? (
                                <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: '1px solid #c4b5fd' }}>
                                  {daySched.adjustmentLabel || '🔄 معدل بطلب رسمي'}
                                </span>
                              ) : daySched?.isSwapped ? (
                                <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: '1px solid #c7d2fe' }}>
                                  🔄 تبديل وردية ({daySched.swappedWithName || 'زميل'})
                                </span>
                              ) : daySched?.editedByAdmin ? (
                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: '1px solid #fcd34d' }}>
                                  ✏️ معدل من الإدارة
                                </span>
                              ) : notScheduled ? (
                                <span style={{ color: '#dc2626', fontSize: '11.5px', fontWeight: 700 }}>غير مجدول</span>
                              ) : isOff ? (
                                <span style={{ color: '#dc2626', fontSize: '11.5px' }}>راحة رسمية</span>
                              ) : (
                                <span style={{ color: '#16a34a', fontSize: '11.5px' }}>مجدول بالروستر</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditDay(item.dateStr, item.dayName, daySched)}
                                style={{
                                  padding: '5px 12px',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  borderRadius: '6px',
                                  border: '1px solid #0d9488',
                                  background: '#f0fdfa',
                                  color: '#0d9488',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                                title={`تعديل موعد أو حالة شفت يوم ${item.dayName} (${item.dateStr})`}
                              >
                                ✏️ تعديل الشفت
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* View 2: Standard Weekly View (7 Days) */
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <table className="bylaws-table" style={{ fontSize: '13.5px', width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-muted, #f8fafc)' }}>
                        <th style={{ padding: '10px 12px' }}>اليوم</th>
                        <th style={{ padding: '10px 12px' }}>نوع اليوم / الشفت</th>
                        <th style={{ padding: '10px 12px' }}>موعد الدخول (Check-in)</th>
                        <th style={{ padding: '10px 12px' }}>موعد الخروج (Check-out)</th>
                        <th style={{ padding: '10px 12px' }}>ساعات الشفت</th>
                        <th style={{ padding: '10px 12px' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daysOfWeek.map((day) => {
                        if (employee.noMonthlySchedule) {
                          const isRest = (employee.weeklyRestDays || ['الجمعة']).includes(day.label);
                          return (
                            <tr key={day.key} style={{ background: isRest ? '#fef2f2' : '#f5f3ff', borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 12px', fontWeight: '800' }}>{day.label}</td>
                              <td style={{ padding: '10px 12px' }}>
                                {isRest ? (
                                  <span className="badge badge-danger">🔴 راحة أسبوعية (Off)</span>
                                ) : (
                                  <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>
                                    ⏱️ دوام حر بالساعات
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: '700', color: isRest ? 'var(--muted)' : '#6d28d9' }}>
                                {isRest ? '—' : 'بصمة الحضور'}
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: '700', color: isRest ? 'var(--muted)' : '#6d28d9' }}>
                                {isRest ? '—' : 'بصمة الانصراف'}
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: '700' }}>
                                {isRest ? '0 ساعة' : 'حسب البصمة'}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isRest ? (
                                  <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 700 }}>راحة معتمدة</span>
                                ) : (
                                  <span style={{ color: '#6d28d9', fontSize: '12px', fontWeight: 700 }}>ساعات فعلية</span>
                                )}
                              </td>
                            </tr>
                          );
                        }

                        const shiftInfo = getDayShiftInfo(singleSchedule, day, employee.workHoursPerDay || 8);
                        const { isOff, notScheduled, checkIn, checkOut, hours } = shiftInfo;

                        return (
                          <tr key={day.key} style={{ background: isOff ? '#fef2f2' : (notScheduled ? 'rgba(239, 68, 68, 0.03)' : 'transparent'), borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: '800' }}>{day.label}</td>
                            <td style={{ padding: '10px 12px' }}>
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
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#15803d') }}>
                              {isOff || notScheduled ? '—' : checkIn}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: notScheduled ? 'var(--muted)' : (isOff ? 'var(--muted)' : '#b91c1c') }}>
                              {isOff || notScheduled ? '—' : checkOut}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: '700' }}>
                              {notScheduled || isOff ? '0 ساعة' : `${hours} ساعات`}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
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
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-actions-pro" style={{ justifyContent: 'flex-end', padding: '12px 20px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '8px 22px', fontSize: '13px' }}>
            ✕ إغلاق النافذة
          </button>
        </div>
      </div>

      {/* Inline/Modal Edit Shift Dialog for a specific date */}
      {editingDay && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            zIndex: 1000000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setEditingDay(null)}
        >
          <div
            style={{
              background: 'var(--surface, #ffffff)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid var(--border)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--primary, #0d9488)' }}>
                  ✏️ تعديل شفت يوم: {editingDay.dayName} ({editingDay.dateStr})
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  الموظف: {getEmpDisplayName(employee)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingDay(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              {/* Shift Type Radio */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  نوع اليوم:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: editType === 'shift' ? '2px solid #10b981' : '1px solid var(--border)',
                      background: editType === 'shift' ? '#f0fdf4' : 'var(--surface-muted, #f8fafc)',
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: editType === 'shift' ? '#15803d' : 'var(--text)'
                    }}
                  >
                    <input
                      type="radio"
                      name="editType"
                      value="shift"
                      checked={editType === 'shift'}
                      onChange={() => setEditType('shift')}
                    />
                    🟢 وردية عمل (Shift)
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: editType === 'off' ? '2px solid #ef4444' : '1px solid var(--border)',
                      background: editType === 'off' ? '#fef2f2' : 'var(--surface-muted, #f8fafc)',
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: editType === 'off' ? '#b91c1c' : 'var(--text)'
                    }}
                  >
                    <input
                      type="radio"
                      name="editType"
                      value="off"
                      checked={editType === 'off'}
                      onChange={() => setEditType('off')}
                    />
                    🔴 راحة أسبوعية (Off)
                  </label>
                </div>
              </div>

              {editType === 'shift' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' }}>
                        موعد الحضور (Check-in):
                      </label>
                      <input
                        type="time"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface, #fff)', color: 'var(--text)' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' }}>
                        موعد الانصراف (Check-out):
                      </label>
                      <input
                        type="time"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface, #fff)', color: 'var(--text)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' }}>
                      ساعات الوردية المقررة:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      step="0.5"
                      value={editHours}
                      onChange={(e) => setEditHours(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface, #fff)', color: 'var(--text)' }}
                    />
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' }}>
                  ملاحظة التعديل (اختياري):
                </label>
                <input
                  type="text"
                  placeholder="مثال: تعديل استثنائي لتغطية الزميل أو احتياج الفرع"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface, #fff)', color: 'var(--text)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingDay(null)}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDayEdit}
                style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 800, background: 'var(--primary, #0d9488)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                💾 حفظ وتثبيت الشفت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalJSX, document.body);
  }
  return modalJSX;
}
