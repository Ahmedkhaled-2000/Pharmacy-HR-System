import React, { useState, useMemo } from 'react';
import { arabicWeekday, getRealTodayStr, fmt } from '../../utils/formatters';
import { createDatePredicate, getCycleDateRange } from '../../utils/periodEngine';
import {
  DEFAULT_LATE_PENALTY_POLICY,
  getEffectiveLatePolicy,
  classifyLateTier,
  getPenaltyForOccurrence,
  computeLatenessFinancialAmount,
  isApprovedPermissionForDate,
  getScheduledShiftForDate,
  calculateLatenessMinutes
} from '../../utils/latePenaltyEngine';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';

export default function Dashboard({
  state,
  setState,
  saveState,
  monthPicker,
  setMonthPicker,
  filterMode = 'month',
  setFilterMode,
  customFrom = '',
  setCustomFrom,
  customTo = '',
  setCustomTo,
  filterFn,
  exportAllPayrollExcel,
  showToast,
  onApproveRequest,
  onRejectRequest,
  onSendEarlyExitEmail,
  onWaiveEarlyExit
}) {
  const activeFilterPeriod = filterMode === 'custom' ? 'custom' : 'current';
  const customStartDate = customFrom;
  const customEndDate = customTo;

  // Lateness Card filter and search states
  const [lateFilterMode, setLateFilterMode] = useState('all'); // 'all' | 'deduction' | 'grace' | 'exempt'
  const [lateSearchQuery, setLateSearchQuery] = useState('');
  const [lateEditModalItem, setLateEditModalItem] = useState(null);
  const [lateEditDeductionMins, setLateEditDeductionMins] = useState(0);
  const [lateEditReason, setLateEditReason] = useState('');

  const orgSettings = state.orgSettings || {};
  const employees = state.employees || [];
  const branches = state.branches || [];
  const punches = state.shifts || [];
  const transactions = state.finances || state.transactions || [];

  // General Manager Name fallback
  const gmName = orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const orgLogo = orgSettings.logoUrl || '';

  // Branch employee helper
  const empBelongsToBranch = (emp, branchId) => {
    if (emp.branchId === branchId) return true;
    if (emp.branchesDetails && Array.isArray(emp.branchesDetails)) {
      return emp.branchesDetails.some((bd) => bd.branchId === branchId);
    }
    return false;
  };

  // Branch employee counts
  const branchCounts = branches.map((b) => {
    const count = employees.filter((e) => empBelongsToBranch(e, b.id)).length;
    return { ...b, count };
  });

  const unassignedCount = employees.filter((e) => !e.branchId && (!e.branchesDetails || e.branchesDetails.length === 0)).length;

  // Live Punches per Branch (Today)
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayPunches = punches.filter((p) => (p.date || p.timestamp || '').startsWith(todayDate));

  const predicate = createDatePredicate({
    filterMode,
    selectedMonth: monthPicker,
    customFrom: customStartDate,
    customTo: customEndDate,
    orgSettings
  });

  const matchesFilterDate = (dateStr) => {
    if (!dateStr) return false;
    const d = String(dateStr).slice(0, 10);
    return predicate(d);
  };

  // Filtered Shifts
  const periodShifts = punches.filter((p) => matchesFilterDate(p.date || p.timestamp));
  const totalWorkHours = periodShifts.reduce((acc, p) => acc + (parseFloat(p.hours) || parseFloat(p.workHours) || 0), 0);

  // Dynamic Base Earnings Calculation based on Employee Hourly Rates
  const totalBaseEarnings = periodShifts.reduce((acc, p) => {
    const emp = employees.find((e) => String(e.id) === String(p.employeeId));
    let dailyHourlyRate = 0;
    if (emp) {
      if (emp.branchesDetails && emp.branchesDetails.length > 0) {
        const bDetail = emp.branchesDetails.find((bd) => bd.branchId === p.branchId) || emp.branchesDetails[0];
        const salary = parseFloat(bDetail?.salary) || 0;
        const workHours = parseFloat(bDetail?.workHoursPerDay) || 8;
        const workDays = parseFloat(bDetail?.workDaysPerMonth) || 26;
        const dailyRate = workDays > 0 ? (salary * workHours) / workDays : 0;
        dailyHourlyRate = workHours > 0 ? dailyRate / workHours : (workDays > 0 ? salary / workDays : salary);
      } else {
        const salary = parseFloat(emp.salary) || 0;
        const workHours = parseFloat(emp.workHoursPerDay) || 8;
        const workDays = parseFloat(emp.workDaysPerMonth) || 26;
        const dailyRate = workDays > 0 ? (salary * workHours) / workDays : 0;
        dailyHourlyRate = workHours > 0 ? dailyRate / workHours : (workDays > 0 ? salary / workDays : salary);
      }
    }
    const h = parseFloat(p.hours) || 0;
    return acc + (h * dailyHourlyRate);
  }, 0);

  // Filtered Adjustments
  const periodAdjustments = (state.adjustments || []).filter((a) => matchesFilterDate(a.date));
  const totalBonuses = periodAdjustments
    .filter((a) => a.type === 'bonus')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const totalDeductions = periodAdjustments
    .filter((a) => a.type === 'deduction' || a.type === 'penalty')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const totalNetSalaries = totalBaseEarnings + totalBonuses - totalDeductions;

  // Income & Expenses for the filtered period
  const totalIncome = transactions
    .filter((t) => matchesFilterDate(t.date || t.timestamp) && t.type === 'income')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const totalExpenses = transactions
    .filter((t) => matchesFilterDate(t.date || t.timestamp) && t.type === 'expense')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  return (
    <div style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }} className="fade-in-page">

      {/* ── 2. Employee Summary Cards Breakdown ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span style={{ fontSize: '18px' }}>📊</span>
        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
          إحصائيات الموظفين وتوزيع الفروع والإدارات
        </h4>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Total Employees Hero Card */}
        <div style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #0d9488 60%, #14b8a6 100%)',
          color: '#ffffff',
          padding: '20px 22px',
          borderRadius: '16px',
          boxShadow: '0 10px 25px -5px rgba(13, 148, 136, 0.35), 0 4px 10px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: '700', color: 'rgba(255, 255, 255, 0.95)' }}>
              👥 إجمالي موظفي الشركة
            </span>
            <span style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '3px 8px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: '800',
              backdropFilter: 'blur(4px)'
            }}>
              كافة الفروع
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.5px' }}>
              {employees.length}
            </span>
            <span style={{ fontSize: '15px', fontWeight: '700', color: 'rgba(255, 255, 255, 0.85)' }}>
              موظف
            </span>
          </div>
        </div>

        {/* Individual Branch Cards */}
        {branchCounts.map((b) => (
          <div
            key={b.id}
            style={{
              background: 'var(--surface, #ffffff)',
              border: '1px solid var(--border, #e2e8f0)',
              borderTop: '3.5px solid #0d9488',
              padding: '18px 20px',
              borderRadius: '16px',
              boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05), 0 2px 6px rgba(0, 0, 0, 0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
                🏢 {b.name}
              </span>
              <span style={{
                background: 'var(--primary-light, #f0fdfa)',
                color: 'var(--primary, #0d9488)',
                border: '1px solid var(--primary-tint, #ccfbf1)',
                padding: '2px 8px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '800'
              }}>
                فرع
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary-dark, #0f766e)' }}>
                {b.count}
              </span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--muted, #64748b)' }}>
                موظف
              </span>
            </div>
          </div>
        ))}

        {unassignedCount > 0 && (
          <div
            style={{
              background: 'var(--surface, #ffffff)',
              border: '1px solid var(--border, #e2e8f0)',
              borderTop: '3.5px solid #64748b',
              padding: '18px 20px',
              borderRadius: '16px',
              boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
                🏢 الإدارة العامة / المركز
              </span>
              <span style={{
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                padding: '2px 8px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '800'
              }}>
                رئيسي
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '28px', fontWeight: '900', color: 'var(--text, #0f172a)' }}>
                {unassignedCount}
              </span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--muted, #64748b)' }}>
                موظف
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Separate Live Punch Cards for Every Branch ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span style={{ fontSize: '18px' }}>⏱️</span>
        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
          بطاقات الحضور والبصمات الحية لكل فرع منفصل ({todayDate})
        </h4>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginBottom: '28px' }}>
        {branches.map((b) => {
          const branchEmps = employees.filter((e) => empBelongsToBranch(e, b.id));
          const branchTodayPunches = todayPunches.filter((p) => {
            if (p.branchId) return String(p.branchId) === String(b.id);
            return String(branchEmps.find((e) => String(e.id) === String(p.employeeId))?.branchId || '') === String(b.id);
          });
          const branchActiveCount = branchEmps.filter((e) => {
            const act = state.activeShifts?.[e.id];
            return act && String(act.branchId || e.branchId) === String(b.id);
          }).length;
          const allLeaves = [...(state.leaveRequests || []), ...(state.requests || [])];
          const totalLiveCount = branchTodayPunches.length + branchActiveCount;

          return (
            <div
              key={b.id}
              style={{
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--border, #e2e8f0)',
                padding: '20px',
                borderRadius: '16px',
                boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-dark, #0f766e)', fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🏢 فرع {b.name}
                </h4>
                <span style={{
                  background: totalLiveCount > 0 ? '#dcfce7' : '#f1f5f9',
                  color: totalLiveCount > 0 ? '#15803d' : '#64748b',
                  border: `1px solid ${totalLiveCount > 0 ? '#bbf7d0' : '#e2e8f0'}`,
                  padding: '4px 10px',
                  borderRadius: '99px',
                  fontSize: '12px',
                  fontWeight: '800',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: totalLiveCount > 0 ? '#22c55e' : '#94a3b8'
                  }} />
                  {totalLiveCount} بصمة حية بالفرع
                </span>
              </div>

              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {branchEmps.length === 0 ? (
                  <span style={{ color: 'var(--muted, #94a3b8)', textAlign: 'center', padding: '12px 0' }}>
                    لا يوجد موظفين مسجلين بهذا الفرع.
                  </span>
                ) : (
                  branchEmps.map((emp) => {
                    const activeShift = state.activeShifts?.[emp.id];
                    const isActiveInThisBranch = activeShift && (String(activeShift.branchId || emp.branchId) === String(b.id));
                    const isActiveInOtherBranch = activeShift && !isActiveInThisBranch;

                    const empTodayPunchesInThisBranch = todayPunches.filter((p) => {
                      if (String(p.employeeId) !== String(emp.id)) return false;
                      if (p.branchId) return String(p.branchId) === String(b.id);
                      return String(emp.branchId) === String(b.id);
                    });

                    const onLeaveToday = allLeaves.some(
                      (r) => String(r.employeeId) === String(emp.id) && (r.status === 'approved' || r.adminApproved) && (r.type === 'leave' || r.type === 'leave_request') && r.startDate <= todayDate && r.endDate >= todayDate
                    );

                    const daySched = getEmployeeDaySchedule(emp.id, todayDate, state);
                    const isOffToday = daySched?.type === 'off' || daySched?.isOff === true;
                    const isSwapped = Boolean(daySched?.isSwapped);

                    let statusText = 'لم يبصم بهذا الفرع';
                    let badgeBg = '#fff1f2';
                    let badgeColor = '#e11d48';
                    let badgeBorder = '#fecdd3';

                    if (isActiveInThisBranch) {
                      if (activeShift.isOnBreak || activeShift.isPaused) {
                        statusText = '⏸️ في استراحة';
                        badgeBg = '#fffbeb';
                        badgeColor = '#b45309';
                        badgeBorder = '#fde68a';
                      } else {
                        statusText = '🟢 حاضر حالياً';
                        badgeBg = '#ecfdf5';
                        badgeColor = '#047857';
                        badgeBorder = '#a7f3d0';
                      }
                    } else if (isActiveInOtherBranch) {
                      const otherBranchObj = branches.find((br) => String(br.id) === String(activeShift.branchId));
                      statusText = `🏢 بوردية بفرع ${otherBranchObj ? otherBranchObj.name : 'آخر'}`;
                      badgeBg = '#f1f5f9';
                      badgeColor = '#475569';
                      badgeBorder = '#e2e8f0';
                    } else if (empTodayPunchesInThisBranch.length > 0) {
                      statusText = '🟢 تم الحضور اليوم';
                      badgeBg = '#f0f9ff';
                      badgeColor = '#0284c7';
                      badgeBorder = '#bae6fd';
                    } else if (onLeaveToday) {
                      statusText = '🏖️ إجازة معتمدة';
                      badgeBg = '#f0fdf4';
                      badgeColor = '#16a34a';
                      badgeBorder = '#bbf7d0';
                    } else if (isOffToday) {
                      statusText = isSwapped
                        ? `🔄 💤 راحة متبدلة`
                        : '💤 راحة أسبوعية (OFF)';
                      badgeBg = '#f8fafc';
                      badgeColor = '#64748b';
                      badgeBorder = '#e2e8f0';
                    } else if (isSwapped && daySched?.start && daySched?.end) {
                      statusText = `🔄 وردية متبدلة (${daySched.start})`;
                      badgeBg = '#fffbeb';
                      badgeColor = '#d97706';
                      badgeBorder = '#fde68a';
                    }

                    return (
                      <div
                        key={emp.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          background: 'var(--surface-muted, #f8fafc)',
                          border: '1px solid var(--border, #f1f5f9)'
                        }}
                      >
                        <span style={{ fontWeight: '700', color: 'var(--text, #0f172a)', fontSize: '13.5px' }}>
                          👤 {emp.name}
                        </span>
                        <span style={{
                          background: badgeBg,
                          color: badgeColor,
                          border: `1px solid ${badgeBorder}`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: '800'
                        }}>
                          {statusText}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 3.5 Absent Employees Card Today ── */}
      {(() => {
        const allLeaves = [...(state.leaveRequests || []), ...(state.requests || [])];
        const absentEmpsToday = employees.filter((emp) => {
          const activeShift = state.activeShifts?.[emp.id];
          if (activeShift) return false;
          const hasPunchedToday = todayPunches.some((p) => String(p.employeeId) === String(emp.id));
          if (hasPunchedToday) return false;
          const onLeaveToday = allLeaves.some(
            (r) => String(r.employeeId) === String(emp.id) && (r.status === 'approved' || r.adminApproved) && (r.type === 'leave' || r.type === 'leave_request') && r.startDate <= todayDate && r.endDate >= todayDate
          );
          if (onLeaveToday) return false;
          const daySched = getEmployeeDaySchedule(emp.id, todayDate, state);
          if (daySched?.type === 'off' || daySched?.isOff === true) return false; // Employee is on rest day / OFF today!
          return true;
        });

        return (
          <div
            style={{
              padding: '22px 24px',
              marginBottom: '28px',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderTop: '3.5px solid var(--danger)',
              background: 'var(--surface)',
              borderRadius: '18px',
              boxShadow: 'var(--shadow)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '17px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                🚨 الموظفون الغائبون / لم يبصموا اليوم ({todayDate})
              </h4>
              <span style={{
                background: 'var(--danger)',
                color: '#ffffff',
                padding: '5px 14px',
                borderRadius: '99px',
                fontSize: '13px',
                fontWeight: '800',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
              }}>
                {absentEmpsToday.length} موظف غائب
              </span>
            </div>

            {absentEmpsToday.length === 0 ? (
              <div style={{
                background: 'var(--primary-tint)',
                color: 'var(--primary-dark)',
                border: '1px solid rgba(13, 148, 136, 0.2)',
                padding: '14px 18px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                🟢 لا يوجد موظفين غائبين اليوم - جميع الكوادر مسجلة في وردياتها أو في إجازات معتمدة.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                {absentEmpsToday.map((emp) => {
                  const branchObj = branches.find((b) => empBelongsToBranch(emp, b.id));
                  return (
                    <div
                      key={emp.id}
                      style={{
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        borderRight: '4px solid var(--danger)',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: 'var(--danger-tint)',
                        color: 'var(--danger)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '900',
                        fontSize: '15px'
                      }}>
                        {emp.name.charAt(0)}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.name} <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>({emp.code})</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                          {emp.jobTitle} • {branchObj ? `فرع ${branchObj.name}` : 'الإدارة العامة'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 3.5 Today's Late Employees Card (مطابقة لائحة التأخيرات الرسمية 5 فئات وإظهار تفاصيل التأخير) ── */}
      {(() => {
        const latePolicy = getEffectiveLatePolicy(state);
        const permanentGraceTier = latePolicy?.tiers?.[0] || DEFAULT_LATE_PENALTY_POLICY.tiers[0];
        const permanentGraceMax = permanentGraceTier?.maxMinutes !== undefined ? permanentGraceTier.maxMinutes : 10;
        const monthKey = todayDate.slice(0, 7);
        const arDay = arabicWeekday(todayDate);

        const lateEmployeesToday = [];

        employees.forEach((emp) => {
          // Check if employee punched in today or has active shift today
          const punchToday = punches.find((p) => String(p.employeeId) === String(emp.id) && (p.date || p.timestamp || '').startsWith(todayDate));
          const activeShiftToday = state.activeShifts?.[emp.id];
          const timeIn = punchToday?.timeIn || activeShiftToday?.timeIn;

          if (!timeIn) return;

          // Find scheduled shift
          const sched = getScheduledShiftForDate(emp.id, todayDate, state);
          if (!sched || !sched.start) return;

          const diffMinutes = calculateLatenessMinutes(sched.start, timeIn);
          if (diffMinutes <= 0) return; // حضر في الموعد أو مبكراً

          // Classify into Late Penalty Policy Tier
          const tier = classifyLateTier(diffMinutes, latePolicy);
          const approvedPerm = isApprovedPermissionForDate(emp.id, todayDate, state);

          // Calculate occurrences in this tier for the current month
          const pastCycleIncidents = (state.lateIncidents || []).filter((inc) => {
            if (String(inc.employeeId) !== String(emp.id)) return false;
            if (inc.status === 'cancelled') return false;
            if (inc.date === todayDate) return false; // exclude today's current record
            if (filterFn && !filterFn(inc.date)) return false;
            const incTier = inc.tierKey || inc.tierId;
            return incTier === tier.id || incTier === tier.key;
          });
          const occurrenceNumber = pastCycleIncidents.length + 1;

          // Fetch rule for this occurrence
          const rule = getPenaltyForOccurrence(tier, occurrenceNumber);

          const effectiveBranchId = sched.branchId || emp.branchId;
          const branchObj = branches.find((b) => String(b.id) === String(effectiveBranchId)) || branches.find((b) => empBelongsToBranch(emp, b.id));
          const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

          const incId = `late_inc_${emp.id}_${todayDate}_${timeIn.replace(':', '')}`;
          const existingInc = (state.lateIncidents || []).find((i) => i.id === incId || (String(i.employeeId) === String(emp.id) && i.date === todayDate));

          const reqId = `req_late_${emp.id}_${todayDate}`;
          const penaltyReq = (state.requests || []).find(
            (r) => r.id === reqId || r.id === `req_${incId}` || (String(r.employeeId) === String(emp.id) && r.date === todayDate && (r.subType === 'lateness' || r.type === 'penalty'))
          );

          let actionType = 'grace';
          let actionTitle = 'سماح';
          let deductionMinutes = 0;
          let penaltyAmount = 0;
          let status = 'pending'; // 'grace_allowed' | 'approved_permission_exempt' | 'approved' | 'waived' | 'pending'

          if (approvedPerm) {
            actionType = 'grace';
            actionTitle = `سماح (${approvedPerm.permType === 'early' ? 'إذن خروج مبكر معتمد' : 'إذن تأخير معتمد'})`;
            deductionMinutes = 0;
            penaltyAmount = 0;
            status = 'approved_permission_exempt';
          } else if (existingInc && (existingInc.status === 'waived' || existingInc.status === 'overridden' || existingInc.overrideReason)) {
            actionType = existingInc.actionType || 'grace';
            actionTitle = existingInc.actionLabel || 'سماح (استثناء إداري)';
            deductionMinutes = parseFloat(existingInc.deductionMinutes) || 0;
            penaltyAmount = computeLatenessFinancialAmount(deductionMinutes, emp, effectiveBranchId);
            status = 'waived';
          } else if (existingInc && existingInc.status === 'approved') {
            actionType = existingInc.actionType;
            actionTitle = existingInc.actionLabel;
            deductionMinutes = parseFloat(existingInc.deductionMinutes) || 0;
            penaltyAmount = computeLatenessFinancialAmount(deductionMinutes, emp, effectiveBranchId);
            status = 'approved';
          } else if (penaltyReq && (penaltyReq.status === 'approved' || penaltyReq.adminApproved)) {
            actionType = rule.action;
            actionTitle = penaltyReq.suggestedAction || rule.label;
            deductionMinutes = parseFloat(penaltyReq.deductionMinutes !== undefined ? penaltyReq.deductionMinutes : rule.deductionMinutes) || 0;
            penaltyAmount = computeLatenessFinancialAmount(deductionMinutes, emp, effectiveBranchId);
            status = 'approved';
          } else if (penaltyReq && (penaltyReq.status === 'rejected' || penaltyReq.status === 'waived')) {
            actionType = 'grace';
            actionTitle = 'سماح (قبول عذر)';
            deductionMinutes = 0;
            penaltyAmount = 0;
            status = 'waived';
          } else if (tier.id === 'tier_0_10' || rule.action === 'grace') {
            actionType = 'grace';
            actionTitle = tier.id === 'tier_0_10' ? 'سماح دائم باللائحة (بدون خصم)' : `سماح لائحي (المرة #${occurrenceNumber} في الفئة)`;
            deductionMinutes = 0;
            penaltyAmount = 0;
            status = 'grace_allowed';
          } else {
            actionType = rule.action;
            actionTitle = rule.label;
            deductionMinutes = rule.deductionMinutes || 0;
            penaltyAmount = computeLatenessFinancialAmount(deductionMinutes, emp, effectiveBranchId);
            status = 'pending';
          }

          // Allowed grace count in this tier
          const graceCountInTier = (tier.penalties || []).filter((p) => p.action === 'grace').length;

          lateEmployeesToday.push({
            emp,
            incId,
            reqId,
            shiftId: punchToday?.id || activeShiftToday?.id || '',
            date: todayDate,
            branchId: effectiveBranchId,
            branchName,
            scheduledStart: sched.start,
            timeIn,
            diffMinutes,
            tier,
            occurrenceNumber,
            graceCountInTier,
            rule,
            actionType,
            actionTitle,
            deductionMinutes,
            penaltyAmount,
            status,
            approvedPerm,
            penaltyReq,
            existingInc
          });
        });

        // Summary Counts
        const totalLate = lateEmployeesToday.length;
        const permanentGraceCount = lateEmployeesToday.filter((i) => i.tier.id === 'tier_0_10').length;
        const conditionalGraceCount = lateEmployeesToday.filter((i) => i.tier.id !== 'tier_0_10' && (i.actionType === 'grace' || i.status === 'grace_allowed') && !i.approvedPerm).length;
        const deductionCount = lateEmployeesToday.filter((i) => i.deductionMinutes > 0 && !i.approvedPerm && i.status !== 'waived').length;
        const permissionCount = lateEmployeesToday.filter((i) => i.approvedPerm).length;
        const totalDeductionMinutes = lateEmployeesToday.reduce((acc, i) => acc + (i.status !== 'waived' && !i.approvedPerm ? (i.deductionMinutes || 0) : 0), 0);
        const totalPenaltyAmount = lateEmployeesToday.reduce((acc, i) => acc + (i.status !== 'waived' && !i.approvedPerm ? (i.penaltyAmount || 0) : 0), 0);

        // Filtered list by Tab and Search
        const filteredLateEmployees = lateEmployeesToday.filter((item) => {
          if (lateFilterMode === 'deduction') {
            if (item.deductionMinutes <= 0 || item.approvedPerm || item.status === 'waived') return false;
          } else if (lateFilterMode === 'grace') {
            if (item.deductionMinutes > 0 || item.approvedPerm) return false;
          } else if (lateFilterMode === 'exempt') {
            if (!item.approvedPerm) return false;
          }

          if (lateSearchQuery.trim()) {
            const q = lateSearchQuery.toLowerCase().trim();
            const matchesName = (item.emp.name || '').toLowerCase().includes(q);
            const matchesCode = (item.emp.code || '').includes(q);
            if (!matchesName && !matchesCode) return false;
          }

          return true;
        });

        // Handlers
        const handleApplyLatePenalty = async (item) => {
          const targetIncId = item.incId;
          const targetReqId = item.reqId;
          const emp = item.emp;

          const updatedInc = {
            id: targetIncId,
            employeeId: emp.id,
            employeeCode: emp.code || '',
            employeeName: emp.name || '',
            jobTitle: emp.jobTitle || '',
            branchId: item.branchId,
            branchName: item.branchName,
            shiftId: item.shiftId,
            date: item.date,
            scheduledStartTime: item.scheduledStart,
            actualPunchInTime: item.timeIn,
            lateMinutes: item.diffMinutes,
            tierId: item.tier.id,
            tierKey: item.tier.key || item.tier.id,
            tierName: item.tier.name,
            tierColor: item.tier.color,
            occurrenceNumber: item.occurrenceNumber,
            actionType: item.rule.action,
            actionLabel: item.rule.label,
            deductionMinutes: item.rule.deductionMinutes || 0,
            deductionHours: Math.round(((item.rule.deductionMinutes || 0) / 60) * 100) / 100,
            penaltyAmount: item.penaltyAmount,
            payrollCycleId: item.date.slice(0, 7),
            status: 'approved',
            overrideReason: '',
            permissionRequestId: null,
            updatedAt: new Date().toISOString()
          };

          const existingIncidents = state.lateIncidents || [];
          let foundInc = false;
          const updatedIncidents = existingIncidents.map((inc) => {
            if (inc.id === targetIncId || (String(inc.employeeId) === String(emp.id) && inc.date === item.date)) {
              foundInc = true;
              return { ...inc, ...updatedInc };
            }
            return inc;
          });
          if (!foundInc) updatedIncidents.unshift(updatedInc);

          const updatedReq = {
            id: targetReqId,
            employeeId: emp.id,
            employeeName: emp.name,
            employeeCode: emp.code,
            jobTitle: emp.jobTitle,
            branchId: item.branchId,
            branchName: item.branchName,
            type: 'penalty',
            subType: 'lateness',
            ruleTitle: `جزاء تأخير: ${item.tier.name} (${item.diffMinutes} دقيقة - المرة ${item.occurrenceNumber})`,
            impactType: 'time_deduction',
            deductionMinutes: item.rule.deductionMinutes || 0,
            impactVal: item.rule.deductionMinutes || 0,
            amount: item.penaltyAmount,
            scheduledStart: item.scheduledStart,
            actualIn: item.timeIn,
            latenessMinutes: item.diffMinutes,
            occurrenceNumber: item.occurrenceNumber,
            suggestedAction: item.rule.label,
            reason: `تأخر الموظف بمقدار ${item.diffMinutes} دقيقة عن موعد الوردية (${item.scheduledStart}). المرة #${item.occurrenceNumber} في ${item.tier.name}.`,
            details: `${item.rule.label} | خصم: ${item.rule.deductionMinutes || 0} دقيقة (${item.penaltyAmount} ج.م)`,
            date: item.date,
            payrollCycleId: item.date.slice(0, 7),
            createdAt: new Date().toISOString(),
            targetApproval: 'admin_only',
            branchApproved: true,
            adminApproved: true,
            status: 'approved',
            source: 'dashboard_late_card'
          };

          const existingRequests = state.requests || [];
          let foundReq = false;
          const updatedRequestsList = existingRequests.map((r) => {
            if (r.id === targetReqId || (String(r.employeeId) === String(emp.id) && r.date === item.date && (r.subType === 'lateness' || r.type === 'penalty'))) {
              foundReq = true;
              return { ...r, ...updatedReq };
            }
            return r;
          });
          if (!foundReq) updatedRequestsList.unshift(updatedReq);

          const updatedState = {
            ...state,
            lateIncidents: updatedIncidents,
            requests: updatedRequestsList
          };

          if (setState) setState(updatedState);
          if (saveState) await saveState(updatedState);
          showToast?.(`✅ تم تطبيق الخصم اللائحي (${item.rule.deductionMinutes || 0} دقيقة ~ ${fmt(item.penaltyAmount)} ج.م) على راتب ${emp.name}`);
        };

        const handleWaiveLatePenalty = async (item) => {
          const targetIncId = item.incId;
          const targetReqId = item.reqId;
          const emp = item.emp;

          const updatedInc = {
            id: targetIncId,
            employeeId: emp.id,
            employeeCode: emp.code || '',
            employeeName: emp.name || '',
            jobTitle: emp.jobTitle || '',
            branchId: item.branchId,
            branchName: item.branchName,
            shiftId: item.shiftId,
            date: item.date,
            scheduledStartTime: item.scheduledStart,
            actualPunchInTime: item.timeIn,
            lateMinutes: item.diffMinutes,
            tierId: item.tier.id,
            tierKey: item.tier.key || item.tier.id,
            tierName: item.tier.name,
            tierColor: item.tier.color,
            occurrenceNumber: item.occurrenceNumber,
            actionType: 'grace',
            actionLabel: 'سماح (استثناء إداري)',
            deductionMinutes: 0,
            deductionHours: 0,
            penaltyAmount: 0,
            payrollCycleId: item.date.slice(0, 7),
            status: 'waived',
            overrideReason: 'تم قبول العذر واستثناء الموظف من الإدارة العليا بدون خصم',
            permissionRequestId: null,
            updatedAt: new Date().toISOString()
          };

          const existingIncidents = state.lateIncidents || [];
          let foundInc = false;
          const updatedIncidents = existingIncidents.map((inc) => {
            if (inc.id === targetIncId || (String(inc.employeeId) === String(emp.id) && inc.date === item.date)) {
              foundInc = true;
              return { ...inc, ...updatedInc };
            }
            return inc;
          });
          if (!foundInc) updatedIncidents.unshift(updatedInc);

          const updatedReq = {
            id: targetReqId,
            employeeId: emp.id,
            employeeName: emp.name,
            employeeCode: emp.code,
            jobTitle: emp.jobTitle,
            branchId: item.branchId,
            branchName: item.branchName,
            type: 'penalty',
            subType: 'lateness',
            ruleTitle: `استثناء جزاء تأخير: ${item.tier.name}`,
            impactType: 'time_deduction',
            deductionMinutes: 0,
            impactVal: 0,
            amount: 0,
            scheduledStart: item.scheduledStart,
            actualIn: item.timeIn,
            latenessMinutes: item.diffMinutes,
            occurrenceNumber: item.occurrenceNumber,
            suggestedAction: 'سماح (قبول عذر)',
            reason: `تم قبول عذر التأخير واستثناء الموظف بدون تطبيق خصم مالي.`,
            details: `تم الإعفاء من الخصم وقبول العذر`,
            date: item.date,
            payrollCycleId: item.date.slice(0, 7),
            createdAt: new Date().toISOString(),
            targetApproval: 'admin_only',
            branchApproved: true,
            adminApproved: true,
            status: 'waived',
            source: 'dashboard_late_card'
          };

          const existingRequests = state.requests || [];
          let foundReq = false;
          const updatedRequestsList = existingRequests.map((r) => {
            if (r.id === targetReqId || (String(r.employeeId) === String(emp.id) && r.date === item.date && (r.subType === 'lateness' || r.type === 'penalty'))) {
              foundReq = true;
              return { ...r, ...updatedReq };
            }
            return r;
          });
          if (!foundReq) updatedRequestsList.unshift(updatedReq);

          const updatedState = {
            ...state,
            lateIncidents: updatedIncidents,
            requests: updatedRequestsList
          };

          if (setState) setState(updatedState);
          if (saveState) await saveState(updatedState);
          showToast?.(`🛡️ تم قبول العذر واستثناء الموظف ${emp.name} بدون أي خصم مالي`);
        };

        const openLateEditModal = (item) => {
          setLateEditModalItem(item);
          setLateEditDeductionMins(item.deductionMinutes || 0);
          setLateEditReason(item.existingInc?.overrideReason || '');
        };

        const handleSaveCustomPenalty = async () => {
          if (!lateEditModalItem) return;
          const item = lateEditModalItem;
          const emp = item.emp;
          const mins = parseFloat(lateEditDeductionMins) || 0;
          const penaltyAmt = computeLatenessFinancialAmount(mins, emp, item.branchId);

          const targetIncId = item.incId;
          const targetReqId = item.reqId;

          const updatedInc = {
            id: targetIncId,
            employeeId: emp.id,
            employeeCode: emp.code || '',
            employeeName: emp.name || '',
            jobTitle: emp.jobTitle || '',
            branchId: item.branchId,
            branchName: item.branchName,
            shiftId: item.shiftId,
            date: item.date,
            scheduledStartTime: item.scheduledStart,
            actualPunchInTime: item.timeIn,
            lateMinutes: item.diffMinutes,
            tierId: item.tier.id,
            tierKey: item.tier.key || item.tier.id,
            tierName: item.tier.name,
            tierColor: item.tier.color,
            occurrenceNumber: item.occurrenceNumber,
            actionType: mins > 0 ? 'deduction' : 'grace',
            actionLabel: mins > 0 ? `خصم ${mins} دقيقة (تعديل إداري)` : 'سماح (استثناء إداري)',
            deductionMinutes: mins,
            deductionHours: Math.round((mins / 60) * 100) / 100,
            penaltyAmount: penaltyAmt,
            payrollCycleId: item.date.slice(0, 7),
            status: 'modified',
            overrideReason: lateEditReason.trim() || 'تعديل إداري مخصص من لوحة التحكم',
            updatedAt: new Date().toISOString()
          };

          const existingIncidents = state.lateIncidents || [];
          let foundInc = false;
          const updatedIncidents = existingIncidents.map((inc) => {
            if (inc.id === targetIncId || (String(inc.employeeId) === String(emp.id) && inc.date === item.date)) {
              foundInc = true;
              return { ...inc, ...updatedInc };
            }
            return inc;
          });
          if (!foundInc) updatedIncidents.unshift(updatedInc);

          const updatedReq = {
            id: targetReqId,
            employeeId: emp.id,
            employeeName: emp.name,
            employeeCode: emp.code,
            jobTitle: emp.jobTitle,
            branchId: item.branchId,
            branchName: item.branchName,
            type: 'penalty',
            subType: 'lateness',
            ruleTitle: `جزاء تأخير مخصص: ${item.tier.name}`,
            impactType: 'time_deduction',
            deductionMinutes: mins,
            impactVal: mins,
            amount: penaltyAmt,
            scheduledStart: item.scheduledStart,
            actualIn: item.timeIn,
            latenessMinutes: item.diffMinutes,
            occurrenceNumber: item.occurrenceNumber,
            suggestedAction: `خصم ${mins} دقيقة`,
            reason: lateEditReason.trim() || `تعديل إداري: خصم ${mins} دقيقة`,
            details: `خصم ${mins} دقيقة (${penaltyAmt} ج.م)`,
            date: item.date,
            payrollCycleId: item.date.slice(0, 7),
            createdAt: new Date().toISOString(),
            targetApproval: 'admin_only',
            branchApproved: true,
            adminApproved: true,
            status: 'approved',
            source: 'dashboard_late_card'
          };

          const existingRequests = state.requests || [];
          let foundReq = false;
          const updatedRequestsList = existingRequests.map((r) => {
            if (r.id === targetReqId || (String(r.employeeId) === String(emp.id) && r.date === item.date && (r.subType === 'lateness' || r.type === 'penalty'))) {
              foundReq = true;
              return { ...r, ...updatedReq };
            }
            return r;
          });
          if (!foundReq) updatedRequestsList.unshift(updatedReq);

          const updatedState = {
            ...state,
            lateIncidents: updatedIncidents,
            requests: updatedRequestsList
          };

          if (setState) setState(updatedState);
          if (saveState) await saveState(updatedState);
          setLateEditModalItem(null);
          showToast?.(`✅ تم حفظ التعديل اللائحي وتحديث الخصم إلى ${mins} دقيقة (~ ${fmt(penaltyAmt)} ج.م)`);
        };

        return (
          <div
            style={{
              padding: '24px',
              marginBottom: '28px',
              border: '1px solid #fed7aa',
              background: 'linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)',
              borderRadius: '18px',
              boxShadow: '0 10px 30px -5px rgba(234, 88, 12, 0.08), 0 2px 6px rgba(0, 0, 0, 0.02)'
            }}
          >
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '17px', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                  🏃‍♂️ موظفو اليوم المتأخرون عن مواعيد العمل المجدولة ({todayDate})
                </h4>
                <div style={{ fontSize: '13px', color: '#9a3412', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>⏱️ فترة السماح الدائم باللائحة: <strong>حتى {permanentGraceMax} دقائق</strong> (سماح دائم بدون أي خصم).</span>
                  <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '700' }}>
                    تكرارات الفئات الأعلى تخضع للسماح المشروط والخصم اللائحي (5 فئات)
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: lateEmployeesToday.length > 0 ? '#ea580c' : '#16a34a', color: '#ffffff', padding: '5px 16px', borderRadius: '99px', fontSize: '13.5px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  {lateEmployeesToday.length} موظف تأخر اليوم
                </span>
                {deductionCount > 0 && (
                  <span style={{ background: '#dc2626', color: '#ffffff', padding: '5px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 'bold' }}>
                    ⚠️ {deductionCount} مستحق خصم
                  </span>
                )}
              </div>
            </div>

            {/* 5-Tier Policy Metrics Mini-Cards Banner */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px', borderRight: '4px solid #10b981' }}>
                <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: '700' }}>🟢 0 – 10 دقائق</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#14532d', margin: '2px 0' }}>{permanentGraceCount} <span style={{ fontSize: '11px', fontWeight: '500', color: '#4b5563' }}>حالة</span></div>
                <div style={{ fontSize: '11px', color: '#16a34a' }}>سماح دائم (بدون خصم)</div>
              </div>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 12px', borderRight: '4px solid #3b82f6' }}>
                <div style={{ fontSize: '11.5px', color: '#1d4ed8', fontWeight: '700' }}>🔵 11 – 15 دقيقة</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#1e3a8a', margin: '2px 0' }}>
                  {lateEmployeesToday.filter((i) => i.tier.id === 'tier_11_15').length} <span style={{ fontSize: '11px', fontWeight: '500', color: '#4b5563' }}>حالة</span>
                </div>
                <div style={{ fontSize: '11px', color: '#2563eb' }}>سماح حتى 3 مرات</div>
              </div>

              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 12px', borderRight: '4px solid #f59e0b' }}>
                <div style={{ fontSize: '11.5px', color: '#b45309', fontWeight: '700' }}>🟠 16 – 30 دقيقة</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#78350f', margin: '2px 0' }}>
                  {lateEmployeesToday.filter((i) => i.tier.id === 'tier_16_30').length} <span style={{ fontSize: '11px', fontWeight: '500', color: '#4b5563' }}>حالة</span>
                </div>
                <div style={{ fontSize: '11px', color: '#d97706' }}>سماح حتى مرتين</div>
              </div>

              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '10px 12px', borderRight: '4px solid #ea580c' }}>
                <div style={{ fontSize: '11.5px', color: '#c2410c', fontWeight: '700' }}>🔴 31 – 60 دقيقة</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#7c2d12', margin: '2px 0' }}>
                  {lateEmployeesToday.filter((i) => i.tier.id === 'tier_31_60').length} <span style={{ fontSize: '11px', fontWeight: '500', color: '#4b5563' }}>حالة</span>
                </div>
                <div style={{ fontSize: '11px', color: '#ea580c' }}>سماح مرة واحدة</div>
              </div>

              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 12px', borderRight: '4px solid #dc2626' }}>
                <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: '700' }}>🟣 أكثر من 60 دقيقة</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#7f1d1d', margin: '2px 0' }}>
                  {lateEmployeesToday.filter((i) => i.tier.id === 'tier_over_60').length} <span style={{ fontSize: '11px', fontWeight: '500', color: '#4b5563' }}>حالة</span>
                </div>
                <div style={{ fontSize: '11px', color: '#dc2626' }}>خصم فوري مباشر</div>
              </div>

              <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '10px 12px', borderRight: '4px solid #9333ea' }}>
                <div style={{ fontSize: '11.5px', color: '#7e22ce', fontWeight: '700' }}>💸 إجمالي الخصم المالي لليوم</div>
                <div style={{ fontSize: '17px', fontWeight: '800', color: '#581c87', margin: '2px 0' }}>
                  {totalDeductionMinutes} دقيقة
                </div>
                <div style={{ fontSize: '11.5px', color: '#9333ea', fontWeight: '700' }}>
                  ~ {fmt(totalPenaltyAmount)} ج.م
                </div>
              </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            {lateEmployeesToday.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    className={`btn ${lateFilterMode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setLateFilterMode('all')}
                    style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '8px' }}
                  >
                    الكل ({totalLate})
                  </button>
                  <button
                    className={`btn ${lateFilterMode === 'deduction' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setLateFilterMode('deduction')}
                    style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '8px', background: lateFilterMode === 'deduction' ? '#dc2626' : undefined, color: lateFilterMode === 'deduction' ? '#fff' : undefined }}
                  >
                    ⚠️ مستحق عليهم خصم ({deductionCount})
                  </button>
                  <button
                    className={`btn ${lateFilterMode === 'grace' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setLateFilterMode('grace')}
                    style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '8px', background: lateFilterMode === 'grace' ? '#16a34a' : undefined, color: lateFilterMode === 'grace' ? '#fff' : undefined }}
                  >
                    🟢 حالات السماح ({permanentGraceCount + conditionalGraceCount})
                  </button>
                  {permissionCount > 0 && (
                    <button
                      className={`btn ${lateFilterMode === 'exempt' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setLateFilterMode('exempt')}
                      style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '8px' }}
                    >
                      🛡️ أذونات معتمدة ({permissionCount})
                    </button>
                  )}
                </div>

                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <input
                    type="text"
                    placeholder="🔍 بحث باسم الموظف أو الكود..."
                    value={lateSearchQuery}
                    onChange={(e) => setLateSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '6px 12px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '12.5px' }}
                  />
                  {lateSearchQuery && (
                    <button
                      onClick={() => setLateSearchQuery('')}
                      style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '13px' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {lateEmployeesToday.length === 0 ? (
              <div style={{ background: '#dcfce7', color: '#166534', padding: '16px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', border: '1px solid #bbf7d0', boxShadow: '0 2px 6px rgba(22, 101, 52, 0.05)' }}>
                🟢 ممتاز! لا توجد أي حالات تأخير مسجلة اليوم — جميع الموظفين الذين حضروا التزموا بالمواعيد وفترة السماح المعتمدة باللائحة (حتى {permanentGraceMax} دقائق).
              </div>
            ) : filteredLateEmployees.length === 0 ? (
              <div style={{ background: '#f8fafc', color: '#64748b', padding: '16px', borderRadius: '10px', textAlign: 'center', fontSize: '13px', border: '1px dashed #cbd5e1' }}>
                لا توجد حالات تأخير مطابقة لخيارات التصفية الحالية.
              </div>
            ) : (
              /* Late Employees Details Table */
              <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #fed7aa', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'center', background: '#ffffff' }}>
                  <thead>
                    <tr style={{ background: '#ffedd5', color: '#9a3412', fontWeight: 'bold' }}>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>#</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74', textAlign: 'right' }}>الموظف</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>الفرع المجدول</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>الموعد المجدول</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>وقت البصمة</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>مقدار التأخير والتصنيف</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>سجل التكرار بالفئة</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>الجزاء والخصم اللائحي</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>حالة الإجراء</th>
                      <th style={{ padding: '12px 8px', borderBottom: '2px solid #fdba74' }}>إجراء الإدارة العليا</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLateEmployees.map((item, idx) => {
                      const isPerm = Boolean(item.approvedPerm);
                      const isApproved = item.status === 'approved';
                      const isWaived = item.status === 'waived';
                      const isGraceAllowed = item.status === 'grace_allowed';
                      const isPending = item.status === 'pending';

                      return (
                        <tr key={item.emp.id} style={{ borderBottom: '1px solid #ffedd5', background: isPending && item.deductionMinutes > 0 ? '#fffaf5' : undefined }}>
                          <td style={{ padding: '12px 8px', color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                          
                          {/* Employee info with avatar */}
                          <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: item.tier.color ? `${item.tier.color}22` : '#fee2e2',
                                color: item.tier.color || '#c2410c',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '800',
                                fontSize: '13px',
                                flexShrink: 0
                              }}>
                                {item.emp.name.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontWeight: '800', color: '#1e293b', fontSize: '13.5px' }}>
                                  {item.emp.name}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>#{item.emp.code}</span>
                                  <span>{item.emp.jobTitle}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Branch */}
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                              📍 {item.branchName}
                            </span>
                          </td>

                          {/* Scheduled Start */}
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '12.5px' }}>
                              {item.scheduledStart}
                            </span>
                          </td>

                          {/* Punch Time */}
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '12.5px' }}>
                              {item.timeIn}
                            </span>
                          </td>

                          {/* Lateness & Tier Badge */}
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontWeight: '800', color: item.tier.color || '#c2410c', fontSize: '13.5px' }}>
                              +{item.diffMinutes} دقيقة
                            </div>
                            <span style={{
                              display: 'inline-block',
                              marginTop: '3px',
                              fontSize: '11px',
                              fontWeight: '700',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: item.tier.badgeBg || '#ffedd5',
                              color: item.tier.badgeText || item.tier.color || '#c2410c'
                            }}>
                              {item.tier.name}
                            </span>
                          </td>

                          {/* Tier Occurrence History */}
                          <td style={{ padding: '12px 8px' }}>
                            {item.tier.id === 'tier_0_10' ? (
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '700' }}>
                                🟢 سماح دائم
                              </span>
                            ) : (
                              <div>
                                <span style={{ fontWeight: '700', fontSize: '12.5px', color: '#334155' }}>
                                  المرة #{item.occurrenceNumber} بالدورة
                                </span>
                                <span style={{ display: 'block', fontSize: '11px', color: item.actionType === 'grace' ? '#16a34a' : '#dc2626', fontWeight: '600', marginTop: '2px' }}>
                                  {item.actionType === 'grace'
                                    ? `(سماح متبقي: ${Math.max(0, item.graceCountInTier - item.occurrenceNumber)})`
                                    : `(تجاوز حد السماح ${item.graceCountInTier})`}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Action & Financial Deduction */}
                          <td style={{ padding: '12px 8px' }}>
                            {isPerm ? (
                              <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                                🛡️ إذن معتمد (معفى)
                              </span>
                            ) : item.deductionMinutes > 0 && !isWaived ? (
                              <div>
                                <span style={{ color: '#dc2626', fontWeight: '800', fontSize: '13px', display: 'block' }}>
                                  ⚠️ {item.actionTitle}
                                </span>
                                <span style={{ color: '#b91c1c', fontSize: '11.5px', fontWeight: '700' }}>
                                  خصم {item.deductionMinutes} دقيقة (~ {fmt(item.penaltyAmount)} ج.م)
                                </span>
                              </div>
                            ) : (
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                                🟢 سماح (0 دقيقة - 0 ج.م)
                              </span>
                            )}
                          </td>

                          {/* Decision Status Badge */}
                          <td style={{ padding: '12px 8px' }}>
                            {isPerm ? (
                              <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11.5px', display: 'inline-block' }}>
                                🛡️ إذن تأخير معتمد
                              </span>
                            ) : isApproved ? (
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11.5px', display: 'inline-block' }}>
                                ✅ تم تطبيق الخصم اللائحي
                              </span>
                            ) : isWaived ? (
                              <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11.5px', display: 'inline-block' }}>
                                🕊️ تم قبول العذر (استثناء)
                              </span>
                            ) : isGraceAllowed ? (
                              <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11.5px', display: 'inline-block' }}>
                                🟢 سماح لائحي نظامي
                              </span>
                            ) : (
                              <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11.5px', display: 'inline-block' }}>
                                ⏳ بانتظار اعتماد الإدارة
                              </span>
                            )}
                          </td>

                          {/* Admin Action Buttons */}
                          <td style={{ padding: '12px 8px' }}>
                            {isPerm ? (
                              <span style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: '600' }}>
                                معفى رسمياً
                              </span>
                            ) : isGraceAllowed ? (
                              <span style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: '600' }}>
                                نظامي طبقاً للائحة
                              </span>
                            ) : isPending && item.deductionMinutes > 0 ? (
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button
                                  className="btn btn-start"
                                  style={{ padding: '4px 8px', fontSize: '11.5px', background: '#dc2626' }}
                                  onClick={() => handleApplyLatePenalty(item)}
                                  title="تطبيق الخصم اللائحي الفوري على الراتب"
                                >
                                  ⚖️ تطبيق الخصم ({fmt(item.penaltyAmount)} ج.م)
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 8px', fontSize: '11.5px', border: '1px solid #cbd5e1' }}
                                  onClick={() => handleWaiveLatePenalty(item)}
                                  title="قبول العذر واستثناء الموظف بدون خصم مالي"
                                >
                                  🛡️ قبول العذر
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 6px', fontSize: '11px', border: '1px solid #fed7aa', color: '#c2410c' }}
                                  onClick={() => openLateEditModal(item)}
                                  title="تخصيص دقائق أو سبب الخصم"
                                >
                                  ✏️ تعديل
                                </button>
                              </div>
                            ) : isApproved ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11.5px', color: '#166534', fontWeight: 'bold' }}>
                                  💸 خصم {item.deductionMinutes} د (~{fmt(item.penaltyAmount)} ج.م)
                                </span>
                                <button
                                  onClick={() => handleWaiveLatePenalty(item)}
                                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                                  title="إلغاء الخصم وقبول العذر"
                                >
                                  إعفاء
                                </button>
                              </div>
                            ) : isWaived ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 'bold' }}>
                                  🕊️ معفى بدون خصم
                                </span>
                                {item.deductionMinutes > 0 && (
                                  <button
                                    onClick={() => handleApplyLatePenalty(item)}
                                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                                    title="إعادة تطبيق الخصم"
                                  >
                                    تطبيق
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Custom Penalty Override Modal */}
            {lateEditModalItem && (
              <div className="modal-backdrop" onClick={() => setLateEditModalItem(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', padding: '24px', borderRadius: '16px', maxWidth: '480px', width: '92%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✏️ تخصيص وتعديل جزاء التأخير للموظف
                    </h3>
                    <button onClick={() => setLateEditModalItem(null)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                  </div>

                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '14px' }}>
                    <div>الموظف: <strong>{lateEditModalItem.emp.name} ({lateEditModalItem.emp.code})</strong></div>
                    <div>التأخير المسجل: <strong>+{lateEditModalItem.diffMinutes} دقيقة</strong> ({lateEditModalItem.tier.name})</div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', marginBottom: '6px', color: '#1e293b' }}>
                      دقائق الخصم المعتمدة:
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={lateEditDeductionMins}
                      onChange={(e) => setLateEditDeductionMins(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                    <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      القيمة المالية المقدرة: ~ {fmt(computeLatenessFinancialAmount(lateEditDeductionMins, lateEditModalItem.emp, lateEditModalItem.branchId))} ج.م
                    </span>
                  </div>

                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', marginBottom: '6px', color: '#1e293b' }}>
                      سبب التعديل أو الاستثناء:
                    </label>
                    <textarea
                      rows="3"
                      value={lateEditReason}
                      onChange={(e) => setLateEditReason(e.target.value)}
                      placeholder="اكتب سبب تعديل الجزاء أو الاستثناء لتوثيقه في السجل..."
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setLateEditModalItem(null)}
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      إلغاء
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveCustomPenalty}
                      style={{ padding: '8px 18px', fontSize: '13px', background: '#c2410c', borderColor: '#c2410c' }}
                    >
                      💾 حفظ التعديل اللائحي
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        );
      })()}

      {/* ── 3.7 Early Exit & Overtime Approval Cards Today ── */}
      {(() => {
        const earlyExitRequests = (state.requests || []).filter(
          (r) => (r.type === 'early_exit' || r.subType === 'early_exit') && (r.date === todayDate || r.status === 'pending')
        );

        const overtimeRequests = (state.requests || []).filter(
          (r) => r.type === 'overtime' && (r.date === todayDate || r.status === 'pending')
        );

        if (earlyExitRequests.length === 0 && overtimeRequests.length === 0) return null;

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Early Exit Card */}
            {earlyExitRequests.length > 0 && (
              <div className="card settings-card" style={{ padding: '20px', border: '1px solid rgba(220, 38, 38, 0.25)', borderTop: '3.5px solid var(--danger)', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                    🏃‍♂️ رصد الانصراف المبكر عن موعد الوردية ({earlyExitRequests.length})
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {earlyExitRequests.map((req) => {
                    const isApproved = req.status === 'approved' || req.adminApproved;
                    const isWaived = req.status === 'waived';
                    const isPending = req.status === 'pending';

                    return (
                      <div key={req.id} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <strong style={{ color: 'var(--danger)', fontSize: '14px', fontWeight: '800' }}>👤 {req.employeeName}</strong>
                            <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '6px' }}>• فرع {req.branchName}</span>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              {req.details || req.reason}
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: '800', background: 'var(--danger-tint)', padding: '2px 8px', borderRadius: '6px' }}>
                            {req.earlyMinutes} دقيقة مبكراً
                          </span>
                        </div>

                        <div style={{ marginTop: '12px', display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {isPending ? (
                            <>
                              <button
                                className="btn btn-start"
                                style={{ padding: '5px 12px', fontSize: '12px', background: 'var(--danger)' }}
                                onClick={() => onApproveRequest?.(req.id)}
                                title="تطبيق الجزاء والخصم المالي في حساب الراتب"
                              >
                                ⚖️ تطبيق الخصم اللائحي {req.amount ? `(${req.amount} ج.م)` : ''}
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid var(--border)' }}
                                onClick={() => onWaiveEarlyExit ? onWaiveEarlyExit(req.id) : onRejectRequest?.(req.id)}
                                title="إعفاء الموظف بدون خصم مالي"
                              >
                                🛡️ إعفاء من الخصم
                              </button>
                              {onSendEarlyExitEmail && (
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '5px 12px', fontSize: '12px', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                                  onClick={() => onSendEarlyExitEmail(req.id)}
                                  title="إرسال تنبيه رسمي لبريد الموظف"
                                >
                                  📧 إرسال إشعار للموظف
                                </button>
                              )}
                            </>
                          ) : isApproved ? (
                            <span style={{ color: 'var(--success)', fontSize: '12px', fontWeight: '800' }}>✅ تم تطبيق الخصم اللائحي</span>
                          ) : isWaived ? (
                            <span style={{ color: '#0284c7', fontSize: '12px', fontWeight: '800' }}>🛡️ معفى من الخصم المالي</span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: '800' }}>❌ مرفوض</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Overtime Card */}
            {overtimeRequests.length > 0 && (
              <div className="card settings-card" style={{ padding: '20px', border: '1px solid rgba(5, 150, 105, 0.25)', borderTop: '3.5px solid var(--success)', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--success-dark)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                    ⏱️ طلبات اعتماد الساعات الإضافية ({overtimeRequests.length})
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {overtimeRequests.map((req) => {
                    const isApproved = req.status === 'approved' || req.adminApproved;
                    const isRejected = req.status === 'rejected';
                    const isPending = req.status === 'pending';

                    return (
                      <div key={req.id} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <strong style={{ color: 'var(--success-dark)', fontSize: '14px', fontWeight: '800' }}>👤 {req.employeeName}</strong>
                            <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '6px' }}>• فرع {req.branchName}</span>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              {req.details || req.reason}
                            </div>
                          </div>
                          <span style={{ background: 'var(--success-tint)', color: 'var(--success-dark)', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '800' }}>
                            +{req.hours} س إضافي
                          </span>
                        </div>

                        <div style={{ marginTop: '12px', display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {isPending ? (
                            <>
                              <button
                                className="btn btn-start"
                                style={{ padding: '5px 14px', fontSize: '12px', background: 'var(--success)' }}
                                onClick={() => onApproveRequest?.(req.id)}
                                title="اعتماد الساعات الإضافية واحتسابها ضمن أجر الراتب"
                              >
                                ✅ اعتماد الساعات الإضافية (+{req.hours} س بالراتب)
                              </button>
                              <button
                                className="btn btn-outline"
                                style={{ padding: '5px 12px', fontSize: '12px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                onClick={() => onRejectRequest?.(req.id)}
                                title="استبعاد الإضافي وعدم احتسابه بالأجر"
                              >
                                ❌ استبعاد الإضافي
                              </button>
                            </>
                          ) : isApproved ? (
                            <span style={{ color: 'var(--success)', fontSize: '12px', fontWeight: '800' }}>✅ تم اعتماد الساعات واحتسابها بالراتب</span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: '800' }}>❌ تم استبعاد الساعات الإضافية من الأجر</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 4. Financial Summary & Reports (Matching Image 1 Specifications) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '18px', color: '#1e293b' }}>
            إجمالي الرواتب والتقارير المالية لجميع الموظفين بالشركة
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            {filterMode === 'custom' 
              ? `📊 الفترة المخصصة المحددة: من ${customFrom || '...'} إلى ${customTo || '...'}`
              : `📊 دورة تقفيل شهر (${monthPicker})`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filterMode === 'custom' ? 'custom' : 'month'} onChange={(e) => setFilterMode?.(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}>
            <option value="month">📅 الشهر الحالي ({monthPicker})</option>
            <option value="custom">📅 تصفية الفترة المخصصة</option>
          </select>

          {filterMode === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-muted)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom?.(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>إلى</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo?.(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
              />
            </div>
          )}

          <button className="btn btn-start" onClick={exportAllPayrollExcel} style={{ padding: '6px 14px', fontSize: '13px' }}>
            📊 تصدير شيت إكسيل مخصص بالفترة
          </button>
        </div>
      </div>

      {/* Financial Cards Grid (Modern High-End Bespoke Styling) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {/* Card 1: Total Work Hours */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3.5px solid var(--primary)', padding: '18px 20px', borderRadius: '16px', boxShadow: 'var(--shadow)', transition: 'all 0.2s ease' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700', display: 'block', textAlign: 'right' }}>⏱️ إجمالي ساعات العمل</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '26px', fontWeight: '900', color: 'var(--primary)', textAlign: 'right', fontFamily: "'Plus Jakarta Sans', 'Cairo', sans-serif" }}>
            {totalWorkHours} <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--muted)' }}>ساعة</span>
          </h3>
        </div>

        {/* Card 2: Total Base Earnings */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3.5px solid #0284c7', padding: '18px 20px', borderRadius: '16px', boxShadow: 'var(--shadow)', transition: 'all 0.2s ease' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700', display: 'block', textAlign: 'right' }}>💼 إجمالي المستحقات الأساسية</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '26px', fontWeight: '900', color: '#0284c7', textAlign: 'right', fontFamily: "'Plus Jakarta Sans', 'Cairo', sans-serif" }}>
            {totalBaseEarnings.toFixed(2)} <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--muted)' }}>ج.م</span>
          </h3>
        </div>

        {/* Card 3: Total Bonuses */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3.5px solid var(--success)', padding: '18px 20px', borderRadius: '16px', boxShadow: 'var(--shadow)', transition: 'all 0.2s ease' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700', display: 'block', textAlign: 'right' }}>🎁 إجمالي المكافآت</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '26px', fontWeight: '900', color: 'var(--success)', textAlign: 'right', fontFamily: "'Plus Jakarta Sans', 'Cairo', sans-serif" }}>
            +{totalBonuses.toFixed(2)} <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--muted)' }}>ج.م</span>
          </h3>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Card 4: Solid Teal Hero Banner - Total Paid Net Salaries */}
        <div style={{
          background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)',
          color: '#ffffff',
          padding: '22px 26px',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          boxShadow: '0 8px 24px -4px rgba(13, 148, 136, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <span style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.95)', fontWeight: '700', textAlign: 'right' }}>
            💳 إجمالي رواتب الشركة المدفوعة (صافي المرتبات)
          </span>
          <h2 style={{ margin: '8px 0 0 0', fontSize: '32px', fontWeight: '900', textAlign: 'right', color: '#ffffff', fontFamily: "'Plus Jakarta Sans', 'Cairo', sans-serif" }}>
            {totalNetSalaries.toFixed(2)} <span style={{ fontSize: '18px', fontWeight: '700', color: 'rgba(255, 255, 255, 0.85)' }}>ج.م</span>
          </h2>
        </div>

        {/* Card 5: Total Deductions */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3.5px solid var(--danger)', padding: '18px 20px', borderRadius: '16px', boxShadow: 'var(--shadow)', transition: 'all 0.2s ease' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700', display: 'block', textAlign: 'right' }}>📉 إجمالي الخصومات والجزاءات</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '26px', fontWeight: '900', color: 'var(--danger)', textAlign: 'right', fontFamily: "'Plus Jakarta Sans', 'Cairo', sans-serif" }}>
            -{totalDeductions.toFixed(2)} <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--muted)' }}>ج.م</span>
          </h3>
        </div>
      </div>

      {/* Income & Expenses Summary Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRight: '4px solid var(--success)', padding: '16px 18px', borderRadius: '14px', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: '700' }}>🟢 إجمالي الإيرادات المسجلة</span>
          <h4 style={{ margin: '6px 0 0 0', color: 'var(--success)', fontWeight: '900', fontSize: '18px', fontFamily: "'Plus Jakarta Sans', 'Cairo', sans-serif" }}>{totalIncome.toLocaleString()} ج.م</h4>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRight: '4px solid var(--danger)', padding: '16px 18px', borderRadius: '14px', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: '700' }}>🔴 إجمالي المصروفات المسجلة</span>
          <h4 style={{ margin: '6px 0 0 0', color: 'var(--danger)', fontWeight: '900', fontSize: '18px', fontFamily: "'Plus Jakarta Sans', 'Cairo', sans-serif" }}>{totalExpenses.toLocaleString()} ج.م</h4>
        </div>
      </div>
    </div>
  );
}
