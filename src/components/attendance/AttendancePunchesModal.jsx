import React, { useState } from 'react';
import { isApprovedPermissionForDate, getEffectiveShiftHours, recalculateEmployeeCycleLateness } from '../../utils/latePenaltyEngine';
import { getEmployeeManualPunchesCount, isShiftManualPunch, arabicWeekday } from '../../utils/formatters';

export default function AttendancePunchesModal({
  employee,
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  filterFn = null,
  monthPicker = null,
  filterMode = 'month',
  customFrom = '',
  customTo = '',
  onClose
}) {
  if (!employee) return null;

  const [editingPunch, setEditingPunch] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [editBreakHours, setEditBreakHours] = useState('0');
  const [editBranchId, setEditBranchId] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const activePeriodFilter = (d) => {
    if (!d) return false;
    const dateStr = String(d).slice(0, 10);
    if (typeof filterFn === 'function') return filterFn(dateStr);
    return true;
  };

  const isCustom = (filterMode === 'custom' || filterMode === 'range') && customFrom && customTo;
  const periodLabel = isCustom ? `الفترة المخصصة: من ${customFrom} إلى ${customTo}` : (monthPicker ? `دورة شهر (${monthPicker})` : '');

  const monthPunches = (state.shifts || []).filter(
    (p) => (String(p.employeeId) === String(employee.id) || String(p.employeeCode) === String(employee.code)) && activePeriodFilter(p.date)
  );

  // Group or process punches into rows
  const shiftsCount = monthPunches.length;
  const manualCount = getEmployeeManualPunchesCount(employee.id, state, activePeriodFilter);

  const totalBreakHours = monthPunches
    .reduce((acc, p) => acc + (parseFloat(p.breakHours) || 0), 0)
    .toFixed(2);

  const totalWorkHours = monthPunches
    .reduce((acc, p) => acc + getEffectiveShiftHours(p, state), 0)
    .toFixed(2);

  const isMultiBranch = employee.branchesDetails && employee.branchesDetails.length > 1;

  // Helper to calculate hourly rate for employee per branch
  const getBranchRate = (branchId) => {
    const bd =
      (employee.branchesDetails || []).find((b) => b.branchId === branchId) ||
      (employee.branchesDetails && employee.branchesDetails[0]) || {
        salary: employee.salary || 0,
        workHoursPerDay: employee.workHoursPerDay || 8,
        workDaysPerMonth: employee.workDaysPerMonth || 26
      };
    const hourlyBase = parseFloat(bd.salary || employee.salary) || 0;
    const workHoursPerDay = parseFloat(bd.workHoursPerDay || bd.workHours || employee.workHoursPerDay) || 8;
    const workDaysPerMonth = parseFloat(bd.workDaysPerMonth || bd.workDays || employee.workDaysPerMonth) || 26;

    const dailyRate = workDaysPerMonth > 0 ? (hourlyBase * workHoursPerDay) / workDaysPerMonth : 0;
    const rate = workHoursPerDay > 0 ? dailyRate / workHoursPerDay : (workDaysPerMonth > 0 ? hourlyBase / workDaysPerMonth : hourlyBase);
    return rate;
  };

  const totalEarned = monthPunches
    .reduce((acc, p) => {
      const netH = parseFloat(p.hours || p.workHours || p.netHours || 8) || 0;
      const rate = getBranchRate(p.branchId || employee.branchId);
      return acc + (netH * rate);
    }, 0)
    .toFixed(2);

  const handleOpenEdit = (punch) => {
    setEditingPunch(punch);
    setEditDate(punch.date || new Date().toISOString().slice(0, 10));
    setEditTimeIn(punch.timeIn || punch.checkIn || punch.inTime || '09:00');
    setEditTimeOut(punch.timeOut || punch.checkOut || punch.outTime || '17:00');
    setEditBreakHours(String(punch.breakHours || 0));
    setEditBranchId(punch.branchId || employee.branchId || '');
    setEditNotes(punch.note || punch.notes || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPunch) return;

    const performSave = async () => {
      const inParts = (editTimeIn || '09:00').split(':').map(Number);
      const outParts = (editTimeOut || '17:00').split(':').map(Number);
      let diff = ((outParts[0] || 0) + (outParts[1] || 0) / 60) - ((inParts[0] || 0) + (inParts[1] || 0) / 60);
      if (diff <= 0) diff += 24;
      const bH = parseFloat(editBreakHours) || 0;
      const calculatedHours = Math.max(0, Math.round((diff - bH) * 100) / 100);

      const updatedShifts = (state.shifts || []).map((s) => {
        if (s.id === editingPunch.id) {
          return {
            ...s,
            date: editDate,
            timeIn: editTimeIn,
            timeOut: editTimeOut,
            breakHours: bH,
            hours: calculatedHours,
            workHours: calculatedHours,
            netHours: calculatedHours,
            branchId: editBranchId || s.branchId || employee.branchId || '',
            note: editNotes.trim() || s.note || 'تم تعديل البصمة بواسطة الإدارة العليا',
            notes: editNotes.trim() || s.notes || 'تم تعديل البصمة بواسطة الإدارة العليا',
            statusLabel: 'معدلة من الإدارة',
            isManual: true,
            manualPunch: true,
            editedByAdmin: true,
            editedAt: new Date().toISOString()
          };
        }
        return s;
      });

      let updatedState = { ...state, shifts: updatedShifts };

      // Auto recalculate late incidents
      const recRes = recalculateEmployeeCycleLateness({
        employeeId: employee.id,
        state: updatedState,
        payrollCycleId: editDate.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      setEditingPunch(null);
      showToast?.('✅ تم حفظ وتعديل بيانات البصمة بنجاح!');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditPastShifts',
        actionTitle: `تعديل بصمة الموظف (${employee.name})`,
        actionDetails: `تاريخ البصمة: ${editDate} | التوقيت الجديد: من ${editTimeIn} إلى ${editTimeOut}`,
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  const handleDeletePunch = async (punch) => {
    const performDelete = async () => {
      const updatedShifts = (state.shifts || []).filter((s) => s.id !== punch.id);
      let updatedState = { ...state, shifts: updatedShifts };

      // Auto recalculate late incidents
      const recRes = recalculateEmployeeCycleLateness({
        employeeId: employee.id,
        state: updatedState,
        payrollCycleId: (punch.date || '').slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('🗑️ تم حذف البصمة بنجاح!');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockDeleteShifts',
        actionTitle: `حذف بصمة الموظف (${employee.name})`,
        actionDetails: `تاريخ البصمة: ${punch.date} | ${punch.timeIn} - ${punch.timeOut}`,
        onExecute: performDelete
      });
    } else {
      if (window.confirm(`هل أنت متأكد من حذف بصمة يوم ${punch.date} للموظف ${employee.name}؟`)) {
        await performDelete();
      }
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content card" style={{ maxWidth: '1200px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0d9488', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              📋 سجل البصمات والورديات — {employee.name} (كود: {employee.code})
              <span style={{ background: manualCount > 0 ? '#fef3c7' : '#f1f5f9', color: manualCount > 0 ? '#b45309' : '#64748b', border: '1px solid ' + (manualCount > 0 ? '#fcd34d' : '#e2e8f0'), padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 800 }}>
                🖐️ بصمات يدوية هذا الشهر: {manualCount}
              </span>
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {isMultiBranch ? `مسجل في ${employee.branchesDetails.length} فروع` : `الفرع: ${employee.branchName || 'الرئيسي'}`} | المسمى الوظيفي: {employee.jobTitle} {periodLabel ? ` • (${periodLabel})` : ''}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕ إغلاق Window</button>
        </div>

        {isMultiBranch ? (
          <div>
            {employee.branchesDetails.map((bd) => {
              const bId = bd.branchId;
              const bObj = (state.branches || []).find((b) => b.id === bId);
              const bName = bObj ? bObj.name : `فرع ${bId}`;
              const bPunches = monthPunches.filter((p) => p.branchId === bId || (!p.branchId && employee.branchesDetails[0].branchId === bId));

              const bShiftsCount = bPunches.length;
              const bTotalBreak = bPunches.reduce((acc, p) => acc + (parseFloat(p.breakHours) || 0), 0).toFixed(2);
              const bTotalWork = bPunches.reduce((acc, p) => acc + (parseFloat(p.hours) || parseFloat(p.workHours) || parseFloat(p.netHours) || 8), 0).toFixed(2);
              const bRate = getBranchRate(bId);
              const bTotalEarned = bPunches.reduce((acc, p) => acc + ((parseFloat(p.hours) || parseFloat(p.workHours) || parseFloat(p.netHours) || 8) || 0) * bRate, 0).toFixed(2);

              return (
                <div key={bId} style={{ marginBottom: '24px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--surface-muted)', padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '15px' }}>
                      🏢 بصمات فرع: {bName} ({bShiftsCount} وردية)
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="badge info">إجمالي ساعات العمل: {bTotalWork} س</span>
                      <span className="badge success" style={{ background: '#dcfce7', color: '#15803d', fontWeight: '700', padding: '4px 10px', borderRadius: '8px' }}>
                        إجمالي المستحقات: {bTotalEarned} ج.م
                      </span>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="bylaws-table" style={{ fontSize: '13px', direction: 'rtl', margin: 0 }}>
                      <thead>
                        <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                          <th style={{ textAlign: 'center' }}>#</th>
                          <th>التاريخ</th>
                          <th>اليوم</th>
                          <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                          <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                          <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                          <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                          <th style={{ textAlign: 'center' }}>المبلغ المستحق</th>
                          <th>الملاحظات</th>
                          <th style={{ textAlign: 'center' }}>الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bPunches.length === 0 ? (
                          <tr>
                            <td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                              لا توجد بصمات مسجلة بهذا الفرع في هذا الشهر.
                            </td>
                          </tr>
                        ) : (
                          bPunches.map((p, index) => {
                            const pDate = new Date(p.date || p.timestamp || Date.now());
                            const dayName = pDate.toLocaleDateString('ar-EG', { weekday: 'long' });
                            const dateStr = p.date || pDate.toISOString().slice(0, 10);
                            const netH = getEffectiveShiftHours(p, state).toFixed(2);
                            const breakH = p.breakHours ? parseFloat(p.breakHours).toFixed(2) : null;
                            const shiftEarned = (parseFloat(netH) * bRate).toFixed(2);

                            const perm = isApprovedPermissionForDate(employee?.id, dateStr, state);
                            const hasPerm = p.hasApprovedPermission || !!perm;
                            const permHours = p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);

                            return (
                              <tr key={p.id || index} style={{ background: hasPerm ? 'rgba(254, 243, 199, 0.25)' : 'transparent' }}>
                                <td style={{ textAlign: 'center', fontWeight: '700' }}>{index + 1}</td>
                                <td style={{ fontWeight: '700' }}>
                                  {dateStr}
                                  {hasPerm && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      ⏰ معدلة بإذن (+{permHours} س)
                                    </span>
                                  )}
                                  {isShiftManualPunch(p) && (
                                    <span style={{ display: 'block', marginTop: '2px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                      🖐️ بصمة يدوية
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontWeight: '600' }}>{dayName}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '12.5px', display: 'inline-block' }}>
                                    {p.timeIn || p.checkIn || p.inTime || '09:00'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '12px', fontWeight: '800', fontSize: '12.5px', display: 'inline-block' }}>
                                    {p.timeOut || p.checkOut || p.outTime || '17:00'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {breakH ? <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '10px', fontWeight: '700', fontSize: '12px' }}>{breakH} س</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                                </td>
                                <td style={{ textAlign: 'center', color: '#0d9488', fontWeight: '800' }}>{netH} ساعة</td>
                                <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: '700' }}>
                                  {shiftEarned} ج.م
                                </td>
                                <td style={{ fontSize: '12px', color: hasPerm ? '#047857' : 'var(--muted)' }}>
                                  {hasPerm ? (
                                    <div>
                                      <span style={{ fontWeight: 700 }}>⏰ معدلة باحتساب ساعات الإذن المعتمد ({perm?.startTime || '—'} إلى {perm?.endTime || '—'})</span>
                                      {p.notes && !p.notes.includes('⏰ تم تعديل البصمة') && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.notes}</div>}
                                    </div>
                                  ) : (
                                    p.notes || p.statusLabel || 'تسجيل بصمة عادية'
                                  )}
                                </td>
                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                    <button
                                      className="btn btn-ghost"
                                      style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                                      title="تعديل البصمة"
                                      onClick={() => handleOpenEdit(p)}
                                    >
                                      ✏️ تعديل
                                    </button>
                                    <button
                                      className="del-btn"
                                      style={{ padding: '3px 6px', fontSize: '11px' }}
                                      title="حذف البصمة"
                                      onClick={() => handleDeletePunch(p)}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {bPunches.length > 0 && (
                        <tfoot>
                          <tr style={{ background: '#f8fafc', fontWeight: '800', borderTop: '2px solid var(--border)' }}>
                            <td colSpan="3" style={{ textAlign: 'right', padding: '12px 16px' }}>الإجمالي ({bShiftsCount} وردية)</td>
                            <td></td>
                            <td></td>
                            <td style={{ textAlign: 'center' }}><span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '8px' }}>{bTotalBreak} س</span></td>
                            <td style={{ textAlign: 'center', color: '#0d9488' }}>{bTotalWork} ساعة</td>
                            <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: '800' }}>
                              {bTotalEarned} ج.م
                            </td>
                            <td></td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Single branch standard rendering */
          <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '10px' }}>
            <table className="bylaws-table" style={{ fontSize: '13px', direction: 'rtl', margin: 0 }}>
              <thead>
                <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                  <th style={{ textAlign: 'center' }}>#</th>
                  <th>التاريخ</th>
                  <th>اليوم</th>
                  <th style={{ textAlign: 'center' }}>وقت الدخول</th>
                  <th style={{ textAlign: 'center' }}>وقت الخروج</th>
                  <th style={{ textAlign: 'center' }}>ساعات البريك</th>
                  <th style={{ textAlign: 'center' }}>صافي ساعات العمل</th>
                  <th style={{ textAlign: 'center' }}>المبلغ المستحق</th>
                  <th>الملاحظات</th>
                  <th style={{ textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {monthPunches.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      لا توجد بصمات مسجلة لهذا الموظف في هذا الشهر.
                    </td>
                  </tr>
                ) : (
                  monthPunches.map((p, index) => {
                    const pDate = new Date(p.date || p.timestamp || Date.now());
                    const dayName = pDate.toLocaleDateString('ar-EG', { weekday: 'long' });
                    const dateStr = p.date || pDate.toISOString().slice(0, 10);
                    const netH = getEffectiveShiftHours(p, state).toFixed(2);
                    const breakH = p.breakHours ? parseFloat(p.breakHours).toFixed(2) : null;
                    const shiftRate = getBranchRate(p.branchId || employee.branchId);
                    const shiftEarned = (parseFloat(netH) * shiftRate).toFixed(2);

                    const perm = isApprovedPermissionForDate(employee?.id, dateStr, state);
                    const hasPerm = p.hasApprovedPermission || !!perm;
                    const permHours = p.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);

                    return (
                      <tr key={p.id || index} style={{ background: hasPerm ? 'rgba(254, 243, 199, 0.25)' : 'transparent' }}>
                        <td style={{ textAlign: 'center', fontWeight: '700' }}>{index + 1}</td>
                        <td style={{ fontWeight: '700' }}>
                          {dateStr}
                          {hasPerm && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              ⏰ معدلة بإذن (+{permHours} س)
                            </span>
                          )}
                          {isShiftManualPunch(p) && (
                            <span style={{ display: 'block', marginTop: '2px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                              🖐️ بصمة يدوية
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: '600' }}>{dayName}</td>
                        
                        {/* Entry Time Pill */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '12.5px',
                            display: 'inline-block'
                          }}>
                            {p.timeIn || p.checkIn || p.inTime || '09:00'}
                          </span>
                        </td>

                        {/* Exit Time Pill */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '12.5px',
                            display: 'inline-block'
                          }}>
                            {p.timeOut || p.checkOut || p.outTime || '17:00'}
                          </span>
                        </td>

                        {/* Break Hours Pill */}
                        <td style={{ textAlign: 'center' }}>
                          {breakH ? (
                            <span style={{
                              background: '#fef3c7',
                              color: '#b45309',
                              padding: '4px 8px',
                              borderRadius: '10px',
                              fontWeight: '700',
                              fontSize: '12px'
                            }}>
                              {breakH} س
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        {/* Net Hours */}
                        <td style={{ textAlign: 'center', color: '#0d9488', fontWeight: '800' }}>
                          {netH} ساعة
                        </td>

                        {/* Amount Due */}
                        <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: '700' }}>
                          {shiftEarned} ج.م
                        </td>

                        {/* Notes */}
                        <td style={{ fontSize: '12px', color: hasPerm ? '#047857' : 'var(--muted)' }}>
                          {hasPerm ? (
                            <div>
                              <span style={{ fontWeight: 700 }}>⏰ معدلة باحتساب ساعات الإذن المعتمد ({perm?.startTime || '—'} إلى {perm?.endTime || '—'})</span>
                              {p.notes && !p.notes.includes('⏰ تم تعديل البصمة') && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.notes}</div>}
                            </div>
                          ) : (
                            p.notes || p.statusLabel || 'تسجيل بصمة عادية'
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', border: '1px solid #bae6fd', background: '#f0f9ff' }}
                              title="تعديل البصمة"
                              onClick={() => handleOpenEdit(p)}
                            >
                              ✏️ تعديل
                            </button>
                            <button
                              className="del-btn"
                              style={{ padding: '3px 6px', fontSize: '11px' }}
                              title="حذف البصمة"
                              onClick={() => handleDeletePunch(p)}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Footer Summary Row */}
              {monthPunches.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: '800', borderTop: '2px solid var(--border)' }}>
                    <td colSpan="3" style={{ textAlign: 'right', padding: '12px 16px' }}>
                      الإجمالي ({shiftsCount} وردية)
                    </td>
                    <td></td>
                    <td></td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '8px' }}>
                        {totalBreakHours} س
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#0d9488' }}>
                      {totalWorkHours} ساعة
                    </td>
                    <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: '800' }}>
                      {totalEarned} ج.م
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Edit Punch Modal ── */}
        {editingPunch && (
          <div className="modal-backdrop" style={{ zIndex: 1100 }}>
            <div className="modal-content card" style={{ maxWidth: '520px', width: '90%', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, color: '#0284c7', fontSize: '16px' }}>
                  ✏️ تعديل بصمة ووردية — {employee.name}
                </h4>
                <button className="btn btn-ghost" onClick={() => setEditingPunch(null)}>✕</button>
              </div>

              <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label>تاريخ البصمة</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label>وقت الحضور (الدخول)</label>
                    <input
                      type="time"
                      value={editTimeIn}
                      onChange={(e) => setEditTimeIn(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>وقت الانصراف (الخروج)</label>
                    <input
                      type="time"
                      value={editTimeOut}
                      onChange={(e) => setEditTimeOut(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMultiBranch ? '1fr 1fr' : '1fr', gap: '12px' }}>
                  <div className="field">
                    <label>ساعات البريك (استراحة)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="12"
                      value={editBreakHours}
                      onChange={(e) => setEditBreakHours(e.target.value)}
                    />
                  </div>

                  {isMultiBranch && (
                    <div className="field">
                      <label>الفرع</label>
                      <select
                        value={editBranchId}
                        onChange={(e) => setEditBranchId(e.target.value)}
                      >
                        {employee.branchesDetails.map((bd) => {
                          const br = (state.branches || []).find((b) => b.id === bd.branchId);
                          return (
                            <option key={bd.branchId} value={bd.branchId}>
                              {br?.name || `فرع ${bd.branchId}`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                <div className="field">
                  <label>ملاحظات ومبرر التعديل</label>
                  <input
                    type="text"
                    placeholder="سبب تعديل أوقات البصمة..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingPunch(null)}>
                    إلغاء
                  </button>
                  <button type="submit" className="btn btn-start">
                    💾 حفظ التعديلات
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
