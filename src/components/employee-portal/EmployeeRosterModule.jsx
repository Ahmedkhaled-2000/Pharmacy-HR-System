import React, { useState } from 'react';
import { arabicWeekday } from '../../utils/formatters';

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

/**
 * Build a list of all days in the given month with their weekday name and whether it's off
 * based on the weekly schedule template.
 */
function buildMonthCalendar(selectedMonth, schedule, fromDate, toDate) {
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
        const daySchedule = schedule?.[arDayName] || { type: 'shift', start: '08:00', end: '16:00' };
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
    // Find the Arabic day name that matches this JS weekday index
    const arDayName = Object.keys(WEEKDAY_AR_MAP).find(k => WEEKDAY_AR_MAP[k] === jsDay) || '';
    const daySchedule = schedule?.[arDayName] || { type: 'shift', start: '08:00', end: '16:00' };
    result.push({ date: dateStr, day: d, arDayName, daySchedule });
  }
  return result;
}

export default function EmployeeRosterModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth
}) {
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'week'

  // Roster Builder Form State
  const [scheduleInputs, setScheduleInputs] = useState(() => {
    // Try to load from approved roster for current month
    const approved = (state.rosters || []).find(
      (r) => r.employeeId === emp.id && r.month === selectedMonth && r.status === 'approved'
    );
    if (approved?.schedule) return approved.schedule;
    return {
      'السبت': { type: 'shift', start: '08:00', end: '16:00' },
      'الأحد': { type: 'shift', start: '08:00', end: '16:00' },
      'الاثنين': { type: 'off', start: '', end: '' },
      'الثلاثاء': { type: 'shift', start: '16:00', end: '00:00' },
      'الأربعاء': { type: 'shift', start: '08:00', end: '16:00' },
      'الخميس': { type: 'shift', start: '08:00', end: '16:00' },
      'الجمعة': { type: 'off', start: '', end: '' }
    };
  });

  // Active Approved Roster for Employee
  const currentRoster = (state.rosters || []).find(
    (r) => r.employeeId === emp.id && r.month === selectedMonth && r.status === 'approved'
  );

  const [fromDate, setFromDate] = useState(() => {
    if (currentRoster?.fromDate) return currentRoster.fromDate;
    return `${selectedMonth}-01`;
  });
  
  const [toDate, setToDate] = useState(() => {
    if (currentRoster?.toDate) return currentRoster.toDate;
    if (!selectedMonth) return '';
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    return `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
  });

  // Pending Roster Requests for Employee
  const pendingRosterReq = (state.requests || []).find(
    (r) =>
      r.employeeId === emp.id &&
      r.type === 'roster_update' &&
      r.month === selectedMonth &&
      r.status === 'pending'
  );

  // The active schedule to display (approved or form defaults)
  const activeSchedule = currentRoster?.schedule || scheduleInputs;

  // Build full month calendar
  const monthCalendar = buildMonthCalendar(selectedMonth, activeSchedule, currentRoster?.fromDate || fromDate, currentRoster?.toDate || toDate);

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

    const newRosterReq = {
      id: 'roster_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: emp.branchId,
      type: 'roster_update',
      month: selectedMonth,
      fromDate,
      toDate,
      schedule: scheduleInputs,
      targetApproval: 'branch_and_admin',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newRosterReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };

    setState(updatedState);
    if (saveState) await saveState(updatedState);

    setShowRosterModal(false);
    showToast('تم إرسال جدول الشيفتات الشهري للاعتماد من مدير الفرع والإدارة العليا 📅');
  };

  // Group monthly calendar by week for display
  const groupByWeek = (days) => {
    const weeks = [];
    let week = [];
    days.forEach((d, idx) => {
      week.push(d);
      if (week.length === 7 || idx === days.length - 1) {
        weeks.push(week);
        week = [];
      }
    });
    return weeks;
  };

  return (
    <div className="card ep-tab-content fade-in">
      {/* ── Header ── */}
      <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>📅</span>
          <div>
            <h3 style={{ margin: 0 }}>الجدول الشهري (Monthly Roster)</h3>
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
          <span className="badge success">✅ الجدول معتمد لشهر {selectedMonth}</span>
        ) : (
          <span className="badge secondary">⚠️ لا يوجد جدول معتمد لهذا الشهر — يُعرض النمط الافتراضي</span>
        )}
        <span className="badge info">🗓️ أيام عمل: {workDays} | أيام راحة: {offDays} | إجمالي أيام الشهر: {monthCalendar.length}</span>
      </div>

      {/* ── Roster Builder Form ── */}
      {showRosterModal && (
        <form
          onSubmit={handleSubmitRoster}
          className="card settings-card fade-in"
          style={{ padding: '18px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', margin: '16px 0 20px' }}
        >
          <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: 'var(--primary)' }}>⚙️ إعداد نمط الشيفت الأسبوعي</h4>
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
      )}

      {/* ── View: Weekly Pattern ── */}
      {viewMode === 'week' && (
        <div style={{ marginTop: '20px' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>📋 نمط الأسبوع المعتمد</h4>
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
            📅 تقويم شهر {selectedMonth} — مطابق للأيام الفعلية
          </h4>
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
                  return (
                    <tr
                      key={date}
                      style={{
                        background: isOff ? 'rgba(100,116,139,0.06)' : undefined,
                        opacity: isOff ? 0.75 : 1
                      }}
                    >
                      <td style={{ fontWeight: 600 }}>{date}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '99px',
                          fontSize: '12px',
                          background: isOff ? 'var(--surface)' : 'var(--primary-tint)',
                          color: isOff ? 'var(--muted)' : 'var(--primary-dark)',
                          fontWeight: 600
                        }}>
                          {arDayName}
                        </span>
                      </td>
                      <td>
                        {isOff ? (
                          <span className="badge secondary">💤 راحة (OFF)</span>
                        ) : (
                          <span className="badge success">⏰ وردية عمل</span>
                        )}
                      </td>
                      <td style={{ color: isOff ? 'var(--muted)' : 'var(--primary)', fontWeight: isOff ? 400 : 600 }}>
                        {isOff ? '—' : `${daySchedule?.start} – ${daySchedule?.end}`}
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
  );
}
