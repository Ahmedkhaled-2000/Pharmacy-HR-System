import React from 'react';
import { isApprovedPermissionForDate, getEffectiveShiftHours } from '../../utils/latePenaltyEngine';

export default function AttendancePunchesModal({
  employee,
  state,
  filterFn = null,
  monthPicker = null,
  filterMode = 'month',
  customFrom = '',
  customTo = '',
  onClose
}) {
  if (!employee) return null;

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

  return (
    <div className="modal-backdrop">
      <div className="modal-content card" style={{ maxWidth: '1150px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0d9488', fontSize: '18px' }}>
              📋 سجل البصمات والورديات — {employee.name} (كود: {employee.code})
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
                        </tr>
                      </thead>
                      <tbody>
                        {bPunches.length === 0 ? (
                          <tr>
                            <td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
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
                </tr>
              </thead>
              <tbody>
                {monthPunches.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
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
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
