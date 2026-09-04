import React, { useState, useEffect, useRef, useMemo } from 'react';
import { arabicWeekday } from '../../utils/formatters';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { shouldRouteDirectToAdmin } from '../../utils/jobsHelper';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { getCycleDateRange } from '../../utils/periodEngine';

// Arabic weekday names mapped to JS getDay() index (0=Sunday)
const WEEKDAY_AR_MAP = {
  'الأحد': 0,
  'الاثنين': 1,
  'الثلاثاء': 2,
  'الأربعاء': 3,
  'الخميس': 4,
  'الجمعة': 5,
  'السبت': 6
};

const daysOfWeek = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const DEFAULT_SCHEDULE = {
  'السبت': { type: 'shift', start: '08:00', end: '16:00' },
  'الأحد': { type: 'shift', start: '08:00', end: '16:00' },
  'الاثنين': { type: 'shift', start: '08:00', end: '16:00' },
  'الثلاثاء': { type: 'shift', start: '16:00', end: '00:00' },
  'الأربعاء': { type: 'shift', start: '08:00', end: '16:00' },
  'الخميس': { type: 'shift', start: '08:00', end: '16:00' },
  'الجمعة': { type: 'off', start: '', end: '' }
};

function getDayScheduleFromSchedule(schedule, dateStr, arDayName) {
  if (!schedule || typeof schedule !== 'object') return { type: arDayName === 'الجمعة' ? 'off' : 'shift', start: '08:00', end: '16:00' };
  
  if (schedule[dateStr]) return schedule[dateStr];
  if (schedule[arDayName]) return schedule[arDayName];

  const normAr = arDayName.replace(/[\u0625\u0623\u0622]/g, 'ا');
  for (const [k, v] of Object.entries(schedule)) {
    if (k.replace(/[\u0625\u0623\u0622]/g, 'ا') === normAr) {
      return v;
    }
  }

  const enDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const jsDay = new Date(dateStr).getDay();
  const enDay = enDays[jsDay];
  if (enDay && schedule[enDay]) return schedule[enDay];

  return { type: arDayName === 'الجمعة' ? 'off' : 'shift', start: '08:00', end: '16:00' };
}

/**
 * Build a list of all days in the given month with their weekday name and whether it's off
 * based on the weekly schedule template or dynamic swap resolution.
 */
function buildMonthCalendar(selectedMonth, schedule, fromDate, toDate, empId = null, state = null) {
  const result = [];
  if (fromDate && toDate) {
    let current = new Date(fromDate);
    const end = new Date(toDate);
    if (!isNaN(current) && !isNaN(end) && current <= end) {
      while (current <= end) {
        const y = current.getFullYear();
        const m = current.getMonth() + 1;
        const d = current.getDate();
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const jsDay = current.getDay();
        const arDayName = Object.keys(WEEKDAY_AR_MAP).find(k => WEEKDAY_AR_MAP[k] === jsDay) || '';
        
        let daySchedule;
        if (empId && state) {
          const dynamicSchedule = getEmployeeDaySchedule(empId, dateStr, state);
          if (dynamicSchedule?.isSwapped) {
            daySchedule = dynamicSchedule;
          } else if (schedule) {
            daySchedule = getDayScheduleFromSchedule(schedule, dateStr, arDayName);
          } else {
            daySchedule = dynamicSchedule;
          }
        } else {
          daySchedule = getDayScheduleFromSchedule(schedule, dateStr, arDayName);
        }

        result.push({ date: dateStr, day: d, arDayName, daySchedule });
        current.setDate(current.getDate() + 1);
      }
      return result;
    }
  }

  if (!selectedMonth) return [];
  const [y, m] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const jsDay = new Date(dateStr).getDay(); // 0=Sun..6=Sat
    const arDayName = Object.keys(WEEKDAY_AR_MAP).find(k => WEEKDAY_AR_MAP[k] === jsDay) || '';
    
    let daySchedule;
    if (empId && state) {
      const dynamicSchedule = getEmployeeDaySchedule(empId, dateStr, state);
      if (dynamicSchedule?.isSwapped) {
        daySchedule = dynamicSchedule;
      } else if (schedule) {
        daySchedule = getDayScheduleFromSchedule(schedule, dateStr, arDayName);
      } else {
        daySchedule = dynamicSchedule;
      }
    } else {
      daySchedule = getDayScheduleFromSchedule(schedule, dateStr, arDayName);
    }

    result.push({ date: dateStr, day: d, arDayName, daySchedule });
  }
  return result;
}

// Normalize schedule to standard Arabic day names and structure
export function normalizeSchedule(rawSchedule) {
  if (!rawSchedule || typeof rawSchedule !== 'object') return DEFAULT_SCHEDULE;
  
  const normalized = { ...DEFAULT_SCHEDULE };
  
  const dayKeyMap = {
    'saturday': 'السبت',
    'sunday': 'الأحد',
    'monday': 'الاثنين',
    'tuesday': 'الثلاثاء',
    'wednesday': 'الأربعاء',
    'thursday': 'الخميس',
    'friday': 'الجمعة',
    'السبت': 'السبت',
    'الأحد': 'الأحد',
    'الاحد': 'الأحد',
    'الإثنين': 'الاثنين',
    'الاثنين': 'الاثنين',
    'الثلاثاء': 'الثلاثاء',
    'الأربعاء': 'الأربعاء',
    'الاربعاء': 'الأربعاء',
    'الخميس': 'الخميس',
    'الجمعة': 'الجمعة',
    '0': 'الأحد',
    '1': 'الاثنين',
    '2': 'الثلاثاء',
    '3': 'الأربعاء',
    '4': 'الخميس',
    '5': 'الجمعة',
    '6': 'السبت',
    'day_0': 'الأحد',
    'day_1': 'الاثنين',
    'day_2': 'الثلاثاء',
    'day_3': 'الأربعاء',
    'day_4': 'الخميس',
    'day_5': 'الجمعة',
    'day_6': 'السبت'
  };

  Object.entries(rawSchedule).forEach(([key, val]) => {
    const cleanKey = String(key).trim().toLowerCase();
    const mappedDay = dayKeyMap[cleanKey] || dayKeyMap[key];
    if (mappedDay && val && typeof val === 'object') {
      const isOff = val.type === 'off' || val.isOff === true || val.type === 'راحة';
      normalized[mappedDay] = {
        type: isOff ? 'off' : 'shift',
        start: isOff ? '' : (val.start || val.checkIn || '08:00'),
        end: isOff ? '' : (val.end || val.checkOut || '16:00')
      };
    }
  });

  return normalized;
}

export { getResolvedEmployeeRoster } from '../roster/RosterModule';

export default function EmployeeRosterModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth,
  selectedBranchId,
  autoOpenRosterModal,
  setAutoOpenRosterModal
}) {
  const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;
  const primaryBranch = emp.branchesDetails?.[0]?.branchId || emp.branchId || '';

  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [showRosterModal, setShowRosterModal] = useState(false);

  useEffect(() => {
    if (autoOpenRosterModal) {
      setShowRosterModal(true);
      setAutoOpenRosterModal?.(false);
    }
  }, [autoOpenRosterModal, setAutoOpenRosterModal]);

  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'week'
  const [activeFormBranchId, setActiveFormBranchId] = useState(selectedBranchId || primaryBranch || '');

  // Admin-defined payroll cycle range for current selected month
  const cycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, state?.orgSettings);
  }, [selectedMonth, state?.orgSettings]);

  const defaultCycleFrom = cycleRange?.startDate || `${selectedMonth}-01`;
  const defaultCycleTo = cycleRange?.endDate || (() => {
    if (!selectedMonth) return '';
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    return `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
  })();

  // Form states
  const [scheduleInputs, setScheduleInputs] = useState(DEFAULT_SCHEDULE);
  const [fromDate, setFromDate] = useState(defaultCycleFrom);
  const [toDate, setToDate] = useState(defaultCycleTo);

  // Determine current active branch ID for roster lookups
  const curBranch = selectedBranchId || activeFormBranchId || primaryBranch;

  // Active Approved Roster for current selected branch & month
  const currentRoster = useMemo(() => {
    return getResolvedEmployeeRoster(emp, curBranch, selectedMonth, state);
  }, [emp, curBranch, selectedMonth, state]);

  // Ref لمنع إعادة تعيين التواريخ التي يقوم الموظف بكتابتها أثناء عمل Polling أو تحديث الحالة
  const lastSyncKeyRef = useRef('');

  // Sync state ONLY when selectedBranchId, activeFormBranchId, selectedMonth, or approved roster identity actually changes
  useEffect(() => {
    const targetBranch = selectedBranchId || activeFormBranchId || primaryBranch;
    const approved = getResolvedEmployeeRoster(emp, targetBranch, selectedMonth, state);
    const syncKey = `${selectedMonth}_${targetBranch}_${approved?.id || 'none'}_${approved?.approvedAt || ''}`;

    if (lastSyncKeyRef.current !== syncKey) {
      lastSyncKeyRef.current = syncKey;

      if (approved?.schedule) {
        setScheduleInputs(approved.schedule);
      } else {
        setScheduleInputs(DEFAULT_SCHEDULE);
      }

      setFromDate(approved?.fromDate || defaultCycleFrom);
      setToDate(approved?.toDate || defaultCycleTo);
    }
  }, [selectedBranchId, activeFormBranchId, selectedMonth, primaryBranch, defaultCycleFrom, defaultCycleTo, state?.rosters, state?.requests, emp?.id, emp?.code]);

  // Pending Roster Requests for Employee
  const pendingRosterReq = (state.requests || []).find(
    (r) =>
      (String(r.employeeId) === String(emp.id) || (emp.code && String(r.employeeCode) === String(emp.code))) &&
      (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
      (r.month === selectedMonth || !r.month) &&
      (r.status === 'pending' || r.status === 'pending_admin') &&
      (String(r.branchId || '') === String(curBranch || '') || (!r.branchId && String(primaryBranch || '') === String(curBranch || '')))
  );

  // The active schedule to display (approved or form defaults)
  const activeSchedule = currentRoster?.schedule || scheduleInputs;

  // Build full month calendar with swap integration
  const monthCalendar = buildMonthCalendar(
    selectedMonth,
    activeSchedule,
    currentRoster?.fromDate || fromDate,
    currentRoster?.toDate || toDate,
    emp?.id,
    state
  );

  // Stats
  const workDays = monthCalendar.filter(d => d.daySchedule?.type !== 'off').length;
  const offDays = monthCalendar.length - workDays;

  // Handle Roster Schedule Field Change
  const handleScheduleChange = (day, field, value) => {
    setScheduleInputs((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }));
  };

  // Submit Roster for Approval
  const handleSubmitRoster = async (e) => {
    e.preventDefault();

    const targetBranch = activeFormBranchId || selectedBranchId || primaryBranch;

    const isDirectAdmin = shouldRouteDirectToAdmin(emp, targetBranch, state);
    const targetApproval = isDirectAdmin ? 'admin_only' : 'branch_and_admin';

    const newRosterReq = {
      id: 'roster_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: targetBranch,
      type: 'roster_update',
      month: selectedMonth,
      fromDate,
      toDate,
      schedule: scheduleInputs,
      targetApproval,
      isDirectToAdmin: isDirectAdmin,
      branchNotRequired: isDirectAdmin,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newRosterReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };

    // Instant Optimistic UI Update (No lagging or waiting)
    setState(updatedState);
    setShowRosterModal(false);
    showToast(isDirectAdmin ? 'تم إرسال جدول الشيفتات الشهري للاعتماد من الإدارة العليا مباشرة 📅' : 'تم إرسال جدول الشيفتات الشهري للاعتماد من مدير الفرع والإدارة العليا 📅');

    // Asynchronous background persistence and notifications
    try {
      if (saveState) await saveState(updatedState);
      notifyAdminOnNewRequest({ state: updatedState, newRequest: newRosterReq, empName: emp.name });
    } catch (err) {
      console.warn('Background sync on submit roster:', err);
    }
  };

  // Render Roster Builder Modal Component
  const renderRosterModal = () => {
    const targetBranchId = activeFormBranchId || selectedBranchId || emp.branchId;
    return (
      <form
        onSubmit={handleSubmitRoster}
        className="card settings-card fade-in"
        style={{ padding: '18px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', margin: '16px 0 20px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--primary)' }}>
            ⚙️ إعداد نمط الشيفت الأسبوعي
          </h4>
          {isMultiBranch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>الفرع:</label>
              <select
                value={targetBranchId}
                onChange={(e) => setActiveFormBranchId(e.target.value)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
              >
                {emp.branchesDetails.map((bd) => {
                  const bObj = (state.branches || []).find((b) => b.id === bd.branchId);
                  return (
                    <option key={bd.branchId} value={bd.branchId}>
                      {bObj ? bObj.name : `فرع ${bd.branchId}`}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 14px' }}>
          حدد أوقات العمل والأوف لكل يوم في الأسبوع. يتم تكرار هذا النمط على كل أسابيع الشهر. سيُرسل طلب الاعتماد إلى
          <strong> مدير الفرع والإدارة العليا</strong> معاً.
        </p>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div className="field">
            <label>يبدأ من تاريخ</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>ينتهي في تاريخ</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>اليوم</th>
                <th>نوع اليوم</th>
                <th>بداية الشيفت</th>
                <th>نهاية الشيفت</th>
              </tr>
            </thead>
            <tbody>
              {daysOfWeek.map((day) => (
                <tr key={day}>
                  <td style={{ fontWeight: 'bold' }}>{day}</td>
                  <td>
                    <select
                      value={scheduleInputs[day]?.type || 'shift'}
                      onChange={(e) => handleScheduleChange(day, 'type', e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: '6px' }}
                    >
                      <option value="shift">وردية عمل (Shift)</option>
                      <option value="off">راحة أسبوعية (OFF)</option>
                    </select>
                  </td>
                  <td>
                    {scheduleInputs[day]?.type === 'shift' ? (
                      <input
                        type="time"
                        value={scheduleInputs[day]?.start || '08:00'}
                        onChange={(e) => handleScheduleChange(day, 'start', e.target.value)}
                        required
                      />
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {scheduleInputs[day]?.type === 'shift' ? (
                      <input
                        type="time"
                        value={scheduleInputs[day]?.end || '16:00'}
                        onChange={(e) => handleScheduleChange(day, 'end', e.target.value)}
                        required
                      />
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setShowRosterModal(false)}>إلغاء</button>
          <button type="submit" className="btn btn-start">💾 حفظ وإرسال الـ Roster للاعتماد</button>
        </div>
      </form>
    );
  };

  // Multi-branch render when all branches are selected (!selectedBranchId)
  if (isMultiBranch && !selectedBranchId) {
    return (
      <div className="card ep-tab-content fade-in">
        <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>📅</span>
            <div>
              <h3 style={{ margin: 0 }}>الجدول الشهري لكل فرع على حدة</h3>
              <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
                عرض الجداول الشفتية المعتمدة لشهر {selectedMonth} لكافة الفروع المسجل بها الموظف
              </p>
            </div>
          </div>
          <button
            className="btn btn-start"
            onClick={() => setShowRosterModal(!showRosterModal)}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            {showRosterModal ? '✕ إغلاق النموذج' : '✏️ إنشاء / تعديل Roster لفرع...'}
          </button>
        </div>

        {showRosterModal && renderRosterModal()}

        {emp.branchesDetails.map((bd) => {
          const bId = bd.branchId;
          const branchObj = (state.branches || []).find((b) => String(b.id) === String(bId) || b.name === bId);
          const bName = branchObj ? branchObj.name : `فرع ${bId}`;

          const bRoster = getResolvedEmployeeRoster(emp, bId, selectedMonth, state);

          const bSchedule = bRoster?.schedule || DEFAULT_SCHEDULE;
          const bCalendar = buildMonthCalendar(selectedMonth, bSchedule, bRoster?.fromDate || fromDate, bRoster?.toDate || toDate, emp?.id, state);
          const bWorkDays = bCalendar.filter(d => d.daySchedule?.type !== 'off').length;
          const bOffDays = bCalendar.length - bWorkDays;

          return (
            <div key={bId} style={{ marginTop: '20px', padding: '16px', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '16px' }}>
                    🏢 جدول فرع: {bName}
                  </h4>
                  <span className={`badge ${bRoster?.status === 'approved' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11.5px' }}>
                    {bRoster?.status === 'approved' ? '🟢 معتمد' : '⏳ بانتظار الاعتماد'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="badge info">أيام عمل: {bWorkDays} | أيام راحة: {bOffDays}</span>
                  <button
                    className="btn btn-start"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => {
                      setActiveFormBranchId(bId);
                      setShowRosterModal(true);
                    }}
                  >
                    ✏️ إنشاء / تعديل Roster فرع: {bName}
                  </button>
                </div>
              </div>

              {isMobileScreen ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {bCalendar.map(({ date, day, arDayName, daySchedule }) => {
                    const isOff = daySchedule?.type === 'off';
                    const isSwapped = daySchedule?.isSwapped;
                    return (
                      <div
                        key={date}
                        style={{
                          background: isSwapped ? 'rgba(245, 158, 11, 0.08)' : (isOff ? 'var(--surface-muted)' : 'var(--surface)'),
                          border: isSwapped ? '1px solid #f59e0b' : (isOff ? '1px dashed var(--border)' : '1px solid var(--border)'),
                          borderRadius: '12px',
                          padding: '12px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: isOff ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                          opacity: (isOff && !isSwapped) ? 0.8 : 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            background: isSwapped ? '#fef3c7' : (isOff ? 'var(--surface)' : 'var(--primary-tint)'),
                            color: isSwapped ? '#b45309' : (isOff ? 'var(--muted)' : 'var(--primary-dark)'),
                            fontWeight: 700
                          }}>
                            {arDayName}
                          </span>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>{date}</div>
                            <div style={{ fontSize: '11.5px', color: isSwapped ? '#b45309' : 'var(--muted)', marginTop: '2px' }}>
                              {isSwapped ? (daySchedule.swapNote || '🔄 شيفت متبدل معتمد') : `اليوم ${day} من الشهر`}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          {isOff ? (
                            isSwapped ? (
                              <span className="badge warning" style={{ fontSize: '11.5px' }}>🔄 💤 راحة متبدلة</span>
                            ) : (
                              <span className="badge secondary" style={{ fontSize: '11.5px' }}>💤 راحة (OFF)</span>
                            )
                          ) : (
                            <div>
                              <span className={`badge ${isSwapped ? 'warning' : 'success'}`} style={{ fontSize: '11px', display: 'inline-block', marginBottom: '3px' }}>
                                {isSwapped ? '🔄 وردية متبدلة' : '⏰ وردية عمل'}
                              </span>
                              <div style={{ fontSize: '12.5px', fontWeight: 800, color: isSwapped ? '#b45309' : 'var(--primary-dark)' }}>
                                {daySchedule?.start} – {daySchedule?.end}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>اليوم</th>
                        <th>نوع اليوم</th>
                        <th>أوقات الشيفت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bCalendar.map(({ date, day, arDayName, daySchedule }) => {
                        const isOff = daySchedule?.type === 'off';
                        const isSwapped = daySchedule?.isSwapped;
                        return (
                          <tr key={date} style={{ background: isSwapped ? 'rgba(245, 158, 11, 0.08)' : (isOff ? 'rgba(100,116,139,0.06)' : undefined), opacity: (isOff && !isSwapped) ? 0.75 : 1 }}>
                            <td style={{ fontWeight: 600 }}>{date}</td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: isSwapped ? '#fef3c7' : (isOff ? 'var(--surface)' : 'var(--primary-tint)'), color: isSwapped ? '#b45309' : (isOff ? 'var(--muted)' : 'var(--primary-dark)'), fontWeight: 600 }}>
                                {arDayName}
                              </span>
                            </td>
                            <td>
                              {isOff ? (
                                isSwapped ? <span className="badge warning">🔄 💤 راحة متبدلة</span> : <span className="badge secondary">💤 راحة (OFF)</span>
                              ) : (
                                isSwapped ? <span className="badge warning">🔄 وردية متبدلة</span> : <span className="badge success">⏰ وردية عمل</span>
                              )}
                            </td>
                            <td style={{ color: isSwapped ? '#b45309' : (isOff ? 'var(--muted)' : 'var(--primary)'), fontWeight: isOff && !isSwapped ? 400 : 600 }}>
                              {isOff ? (isSwapped ? (daySchedule.swapNote || 'راحة متبدلة') : '—') : `${daySchedule?.start} – ${daySchedule?.end}${isSwapped && daySchedule.swappedWithName ? ` (مع ${daySchedule.swappedWithName})` : ''}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Branch Name helper for single branch view
  const currentBranchObj = (state.branches || []).find(b => b.id === curBranch);
  const currentBranchName = currentBranchObj ? currentBranchObj.name : `فرع ${curBranch}`;

  return (
    <div className="card ep-tab-content fade-in">
      {/* ── Header ── */}
      <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>📅</span>
          <div>
            <h3 style={{ margin: 0 }}>الجدول الشهري (Monthly Roster) {isMultiBranch && `— فرع: ${currentBranchName}`}</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              الجدول المعتمد لشهر {selectedMonth} — يتطلب اعتماد مدير الفرع والإدارة العليا
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* View Toggle */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px' }}>
            <button
              className={`btn ${viewMode === 'calendar' ? 'btn-start' : 'btn-ghost'}`}
              style={{ padding: '4px 12px', fontSize: '12px' }}
              onClick={() => setViewMode('calendar')}
            >
              📅 تقويم الشهر
            </button>
            <button
              className={`btn ${viewMode === 'week' ? 'btn-start' : 'btn-ghost'}`}
              style={{ padding: '4px 12px', fontSize: '12px' }}
              onClick={() => setViewMode('week')}
            >
              📋 نمط الأسبوع
            </button>
          </div>

          <button
            className="btn btn-start"
            onClick={() => setShowRosterModal(!showRosterModal)}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            {showRosterModal ? '✕ إغلاق النموذج' : '✏️ إنشاء / تعديل Roster الشهر'}
          </button>
        </div>
      </div>

      {/* Pending request notice */}
      {pendingRosterReq && (
        <div style={{ margin: '12px 0 0', padding: '10px 14px', background: 'rgba(234,179,8,0.1)', border: '1px solid #eab308', borderRadius: '8px' }}>
          <span className="badge warning">⏳ يوجد طلب تعديل جدول قيد الاعتماد من مدير الفرع والإدارة العليا</span>
        </div>
      )}

      {/* Roster status badge */}
      <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {currentRoster ? (
          <span className="badge success">✅ الجدول معتمد لشهر {selectedMonth} ({currentBranchName})</span>
        ) : (
          <span className="badge secondary">⚠️ لا يوجد جدول معتمد لهذا الشهر ({currentBranchName}) — يُعرض النمط الافتراضي</span>
        )}
        <span className="badge info">🗓️ أيام عمل: {workDays} | أيام راحة: {offDays} | إجمالي أيام الشهر: {monthCalendar.length}</span>
      </div>

      {/* ── Roster Builder Form ── */}
      {showRosterModal && renderRosterModal()}

      {/* ── View: Weekly Pattern ── */}
      {viewMode === 'week' && (
        <div style={{ marginTop: '20px' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>📋 نمط الأسبوع المعتمد ({currentBranchName})</h4>
          <div className="ep-summary-grid">
            {daysOfWeek.map((day) => {
              const item = activeSchedule[day] || { type: 'shift', start: '08:00', end: '16:00' };
              const isOff = item?.type === 'off';
              return (
                <div
                  key={day}
                  className="ep-summary-card"
                  style={{ border: isOff ? '1px dashed var(--muted)' : '1px solid var(--primary-tint)' }}
                >
                  <div className="ep-summary-icon">{isOff ? '💤' : '⏰'}</div>
                  <div className="ep-summary-body">
                    <div className="ep-summary-label">{day}</div>
                    <div
                      className="ep-summary-value"
                      style={{ fontSize: '15px', color: isOff ? 'var(--muted)' : 'var(--primary)' }}
                    >
                      {isOff ? 'عطلة (OFF)' : `${item.start} – ${item.end}`}
                    </div>
                    <div className="ep-summary-sub">
                      {isOff ? 'يوم راحة رسمي' : 'وردية العمل المعتمدة'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── View: Full Month Calendar ── */}
      {viewMode === 'calendar' && (
        <div style={{ marginTop: '20px' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>
            📅 تقويم شهر {selectedMonth} — مطابق للأيام الفعلية ({currentBranchName})
          </h4>
          {isMobileScreen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monthCalendar.map(({ date, day, arDayName, daySchedule }) => {
                const isOff = daySchedule?.type === 'off';
                const isSwapped = daySchedule?.isSwapped;
                return (
                  <div
                    key={date}
                    style={{
                      background: isSwapped ? 'rgba(245, 158, 11, 0.08)' : (isOff ? 'var(--surface-muted)' : 'var(--surface)'),
                      border: isSwapped ? '1px solid #f59e0b' : (isOff ? '1px dashed var(--border)' : '1px solid var(--border)'),
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: isOff ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                      opacity: (isOff && !isSwapped) ? 0.8 : 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        background: isSwapped ? '#fef3c7' : (isOff ? 'var(--surface)' : 'var(--primary-tint)'),
                        color: isSwapped ? '#b45309' : (isOff ? 'var(--muted)' : 'var(--primary-dark)'),
                        fontWeight: 700
                      }}>
                        {arDayName}
                      </span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>{date}</div>
                        <div style={{ fontSize: '11.5px', color: isSwapped ? '#b45309' : 'var(--muted)', marginTop: '2px' }}>
                          {isSwapped ? (daySchedule.swapNote || '🔄 شيفت متبدل معتمد') : `اليوم ${day} من الشهر`}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      {isOff ? (
                        isSwapped ? (
                          <span className="badge warning" style={{ fontSize: '11.5px' }}>🔄 💤 راحة متبدلة</span>
                        ) : (
                          <span className="badge secondary" style={{ fontSize: '11.5px' }}>💤 راحة (OFF)</span>
                        )
                      ) : (
                        <div>
                          <span className={`badge ${isSwapped ? 'warning' : 'success'}`} style={{ fontSize: '11px', display: 'inline-block', marginBottom: '3px' }}>
                            {isSwapped ? '🔄 وردية متبدلة' : '⏰ وردية عمل'}
                          </span>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: isSwapped ? '#b45309' : 'var(--primary-dark)' }}>
                            {daySchedule?.start} – {daySchedule?.end}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>اليوم</th>
                    <th>نوع اليوم</th>
                    <th>أوقات الشيفت</th>
                  </tr>
                </thead>
                <tbody>
                  {monthCalendar.map(({ date, day, arDayName, daySchedule }) => {
                    const isOff = daySchedule?.type === 'off';
                    const isSwapped = daySchedule?.isSwapped;
                    return (
                      <tr
                        key={date}
                        style={{
                          background: isSwapped ? 'rgba(245, 158, 11, 0.08)' : (isOff ? 'rgba(100,116,139,0.06)' : undefined),
                          opacity: (isOff && !isSwapped) ? 0.75 : 1
                        }}
                      >
                        <td style={{ fontWeight: 600 }}>{date}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '99px',
                            fontSize: '12px',
                            background: isSwapped ? '#fef3c7' : (isOff ? 'var(--surface)' : 'var(--primary-tint)'),
                            color: isSwapped ? '#b45309' : (isOff ? 'var(--muted)' : 'var(--primary-dark)'),
                            fontWeight: 600
                          }}>
                            {arDayName}
                          </span>
                        </td>
                        <td>
                          {isOff ? (
                            isSwapped ? <span className="badge warning">🔄 💤 راحة متبدلة</span> : <span className="badge secondary">💤 راحة (OFF)</span>
                          ) : (
                            isSwapped ? <span className="badge warning">🔄 وردية متبدلة</span> : <span className="badge success">⏰ وردية عمل</span>
                          )}
                        </td>
                        <td style={{ color: isSwapped ? '#b45309' : (isOff ? 'var(--muted)' : 'var(--primary)'), fontWeight: isOff && !isSwapped ? 400 : 600 }}>
                          {isOff ? (isSwapped ? (daySchedule.swapNote || 'راحة متبدلة') : '—') : `${daySchedule?.start} – ${daySchedule?.end}${isSwapped && daySchedule.swappedWithName ? ` (مع ${daySchedule.swappedWithName})` : ''}`}
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
  );
}
