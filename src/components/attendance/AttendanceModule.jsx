import React, { useState, useMemo, useEffect } from 'react';
import AttendancePunchesModal from './AttendancePunchesModal';
import { recalculateEmployeeCycleLateness, getEffectiveShiftHours, reconcileEmployeeScheduleOrPunchChange } from '../../utils/latePenaltyEngine';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { checkShiftConflicts } from '../../utils/workHoursEngine';
import { isBranchMatch } from '../../utils/branchMatcher';
import { apiSaveSettingsSlice } from '../../utils/apiClient';
import { saveStateLocally, broadcastStateChange } from '../../utils/offlineSync';
import { getCycleDateRange, getActivePayrollMonth } from '../../utils/periodEngine';
import {
  getEmpDisplayName,
  isEmployeeActive,
  getEmployeeManualPunchesCount,
  getRealTodayStr,
  getPunchMethodDetails,
  getShiftStartEpoch,
  isEmployeeOnApprovedLeave,
  getEmployeeCurrentApprovedLeave
} from '../../utils/formatters';

export default function AttendanceModule({
  state,
  setState,
  saveState,
  showToast,
  filterFn = null,
  monthPicker = null,
  setMonthPicker = null,
  filterMode = 'month',
  setFilterMode = null,
  customFrom = '',
  setCustomFrom = null,
  customTo = '',
  setCustomTo = null,
  executeWithOwnerGuard,
  stopShift
}) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPunchEmp, setSelectedPunchEmp] = useState(null);

  // Default active cycle from orgSettings or fallback to current month
  const autoActiveCycle = useMemo(() => {
    return getActivePayrollMonth(state?.orgSettings);
  }, [state?.orgSettings]);

  // Local month state synced with parent props or local storage
  const [effectiveMonth, setEffectiveMonth] = useState(() => {
    return monthPicker || autoActiveCycle || new Date().toISOString().slice(0, 7);
  });

  const [effectiveFilterMode, setEffectiveFilterMode] = useState(() => {
    return filterMode || 'month';
  });

  const [effectiveCustomFrom, setEffectiveCustomFrom] = useState(customFrom || '');
  const [effectiveCustomTo, setEffectiveCustomTo] = useState(customTo || '');

  // Synchronize with parent monthPicker if changed externally
  useEffect(() => {
    if (monthPicker && monthPicker !== effectiveMonth) {
      setEffectiveMonth(monthPicker);
    }
  }, [monthPicker]);

  useEffect(() => {
    if (filterMode && filterMode !== effectiveFilterMode) {
      setEffectiveFilterMode(filterMode);
    }
  }, [filterMode]);

  // Handle Month Change
  const handleMonthChange = (newMonth) => {
    if (!newMonth) return;
    setEffectiveMonth(newMonth);
    setEffectiveFilterMode('month');
    if (typeof setMonthPicker === 'function') {
      setMonthPicker(newMonth);
    }
    if (typeof setFilterMode === 'function') {
      setFilterMode('month');
    }
  };

  // Previous Month
  const handlePrevMonth = () => {
    const [y, m] = (effectiveMonth || autoActiveCycle).split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY = y - 1;
    }
    const prevMonthStr = `${prevY}-${String(prevM).padStart(2, '0')}`;
    handleMonthChange(prevMonthStr);
  };

  // Next Month
  const handleNextMonth = () => {
    const [y, m] = (effectiveMonth || autoActiveCycle).split('-').map(Number);
    let nextY = y;
    let nextM = m + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY = y + 1;
    }
    const nextMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`;
    handleMonthChange(nextMonthStr);
  };

  // Jump to Current Active Cycle
  const handleCurrentCycle = () => {
    handleMonthChange(autoActiveCycle);
  };

  // Toggle All Records
  const handleToggleAllRecords = () => {
    const newMode = effectiveFilterMode === 'all' ? 'month' : 'all';
    setEffectiveFilterMode(newMode);
    if (typeof setFilterMode === 'function') {
      setFilterMode(newMode);
    }
  };

  // Cycle range for effective month
  const activeCycleRange = useMemo(() => {
    return getCycleDateRange(effectiveMonth, state?.orgSettings);
  }, [effectiveMonth, state?.orgSettings]);

  // Predicate function for attendance filtering
  const activePeriodFilter = useMemo(() => {
    if (effectiveFilterMode === 'all') {
      return () => true;
    }
    if (effectiveFilterMode === 'custom' && effectiveCustomFrom && effectiveCustomTo) {
      return (d) => {
        if (!d) return false;
        const s = String(d).slice(0, 10);
        return s >= effectiveCustomFrom && s <= effectiveCustomTo;
      };
    }
    return (d) => {
      if (!d) return false;
      const s = String(d).slice(0, 10);
      return Boolean(activeCycleRange?.startDate && activeCycleRange?.endDate && s >= activeCycleRange.startDate && s <= activeCycleRange.endDate);
    };
  }, [effectiveFilterMode, effectiveCustomFrom, effectiveCustomTo, activeCycleRange]);

  const periodLabel = useMemo(() => {
    if (effectiveFilterMode === 'all') return 'كافة السجلات المسجلة (بدون تقييد)';
    if (effectiveFilterMode === 'custom' && effectiveCustomFrom && effectiveCustomTo) {
      return `فترة مخصصة: من ${effectiveCustomFrom} إلى ${effectiveCustomTo}`;
    }
    return activeCycleRange?.label || `دورة شهر (${effectiveMonth})`;
  }, [effectiveFilterMode, effectiveCustomFrom, effectiveCustomTo, activeCycleRange, effectiveMonth]);

  const getTodayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Manual Punch Form State
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualDate, setManualDate] = useState(getTodayDateStr);
  const [manualInTime, setManualInTime] = useState('');
  const [manualOutTime, setManualOutTime] = useState('');
  const [manualBreakHours, setManualBreakHours] = useState('0');
  const [manualNotes, setManualNotes] = useState('');
  const [manualBranchId, setManualBranchId] = useState('');
  const [manualFilterBranchId, setManualFilterBranchId] = useState('all');
  const [includeDailyAllowance, setIncludeDailyAllowance] = useState(true);

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (!isEmployeeActive(emp)) return false;
    if (selectedBranch) {
      const matchPrimary = isBranchMatch(emp.branchId, { id: selectedBranch });
      const matchDetails = emp.branchesDetails && emp.branchesDetails.some((bd) => isBranchMatch(bd.branchId, { id: selectedBranch }));
      const hasShiftsInBranch = (state.shifts || []).some(s => {
        if (!s || !s.date || !activePeriodFilter(s.date)) return false;
        if (s.status === 'cancelled' || s.isCancelled) return false;
        const sEmpId = String(s.employeeId || '');
        const sEmpCode = String(s.employeeCode || '');
        const eId = String(emp.id || '');
        const eCode = String(emp.code || '');
        const isMatchEmp = (eId && (sEmpId === eId || sEmpCode === eId)) || (eCode && (sEmpId === eCode || sEmpCode === eCode));
        if (!isMatchEmp) return false;
        return isBranchMatch(s.branchId, { id: selectedBranch });
      });
      if (!matchPrimary && !matchDetails && !hasShiftsInBranch) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name?.toLowerCase().includes(q);
      const matchNickname = emp.nickname?.toLowerCase().includes(q);
      const matchCode = emp.code?.includes(q);
      if (!matchName && !matchNickname && !matchCode) return false;
    }
    return true;
  });

  const manualFilteredEmployees = useMemo(() => {
    return employees.filter(isEmployeeActive).filter((emp) => {
      if (manualFilterBranchId === 'all' || !manualFilterBranchId) return true;
      if (String(emp.branchId) === String(manualFilterBranchId)) return true;
      if (emp.branchesDetails && emp.branchesDetails.some((bd) => String(bd.branchId) === String(manualFilterBranchId))) return true;
      return false;
    });
  }, [state.employees, manualFilterBranchId]);

  // 🛡️ فحص التعارض والتنقل اللحظي بين الفروع للبصمة اليدوية
  const manualConflictResult = useMemo(() => {
    if (!manualEmpId || !manualDate || !manualInTime || !manualOutTime) return null;
    const empObj = employees.find((e) => e.id === manualEmpId);
    return checkShiftConflicts({
      employeeId: manualEmpId,
      employeeCode: empObj?.code,
      branchId: manualBranchId || empObj?.branchId,
      branchName: (state.branches || []).find(b => isBranchMatch(manualBranchId || empObj?.branchId, b))?.name,
      date: manualDate,
      timeIn: manualInTime,
      timeOut: manualOutTime,
      excludeShiftId: null,
      shifts: state.shifts || [],
      branches: state.branches || []
    });
  }, [manualEmpId, manualDate, manualInTime, manualOutTime, manualBranchId, employees, state]);

  const handleAddManualPunch = async (e) => {
    e.preventDefault();
    if (!manualEmpId || !manualDate || !manualInTime || !manualOutTime) {
      showToast?.('يرجى اختيار الموظف والتاريخ وأوقات الدخول والخروج');
      return;
    }

    const empObj = employees.find((e) => e.id === manualEmpId);

    // 🛡️ التحقق الاحترافي من عدم تكرار الوردية لنفس الفرع ومنع أي تداخل زمني
    const conflictResult = checkShiftConflicts({
      employeeId: manualEmpId,
      employeeCode: empObj?.code,
      branchId: manualBranchId || empObj?.branchId,
      branchName: (state.branches || []).find(b => isBranchMatch(manualBranchId || empObj?.branchId, b))?.name,
      date: manualDate,
      timeIn: manualInTime,
      timeOut: manualOutTime,
      excludeShiftId: null,
      shifts: state.shifts || [],
      branches: state.branches || []
    });

    if (conflictResult.hasConflict) {
      showToast?.(`⚠️ ${conflictResult.message}`);
      return;
    }

    const inParts = manualInTime.split(':').map(Number);
    const outParts = manualOutTime.split(':').map(Number);
    let diffMinutes = ((outParts[0] || 0) * 60 + (outParts[1] || 0)) - ((inParts[0] || 0) * 60 + (inParts[1] || 0));
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    const elapsedHours = diffMinutes / 60;
    const bH = Math.max(0, parseFloat(manualBreakHours) || 0);
    const workHours = Math.max(0, Math.round((elapsedHours - bH) * 100) / 100);

    const performAdd = async () => {
      const daySched = getEmployeeDaySchedule(manualEmpId, manualDate, state);
      const profileHours = parseFloat(empObj?.workHoursPerDay || empObj?.workHours) || 8;
      let scheduledShiftHours = profileHours;
      if (daySched && daySched.start && daySched.end && daySched.type !== 'off') {
        const [sH, sM] = daySched.start.split(':').map(Number);
        const [eH, eM] = daySched.end.split(':').map(Number);
        let sMins = sH * 60 + (sM || 0);
        let eMins = eH * 60 + (eM || 0);
        if (eMins <= sMins) eMins += 24 * 60;
        scheduledShiftHours = Math.round(((eMins - sMins) / 60) * 100) / 100;
      } else if (daySched && daySched.hours && daySched.type !== 'off') {
        scheduledShiftHours = parseFloat(daySched.hours) || profileHours;
      }

      const regularHours = Math.min(workHours, scheduledShiftHours);
      const overtimeHours = Math.max(0, Math.round((workHours - scheduledShiftHours) * 100) / 100);
      const otStatus = overtimeHours > 0 ? 'approved' : 'none';

      const bObj = (state.branches || []).find(b => isBranchMatch(manualBranchId || empObj?.branchId, b));
      const targetBId = bObj ? bObj.id : (manualBranchId || empObj?.branchId || '');
      const targetBName = bObj ? bObj.name : '';

      const newPunch = {
        id: `punch_manual_${Date.now()}`,
        employeeId: manualEmpId,
        employeeCode: empObj?.code || '',
        employeeName: empObj?.name || '',
        branchId: targetBId,
        branchName: targetBName,
        date: manualDate,
        timeIn: manualInTime,
        timeOut: manualOutTime,
        breakHours: bH,
        hours: workHours,
        workHours: workHours,
        regularHours: regularHours,
        scheduledHours: scheduledShiftHours,
        actualWorkedHours: workHours,
        netHours: workHours,
        overtimeHours: overtimeHours,
        overtimeStatus: otStatus,
        isManual: true,
        manualPunch: true,
        createdBy: 'admin',
        creatorRole: 'admin',
        isAdminCreated: true,
        adminApproved: true,
        acknowledgedByAdmin: true,
        note: (manualNotes.trim() ? manualNotes.trim() + ' | ' : '') + 
              (bH > 0 ? `تسجيل بصمة يدوية من الأدمن (بريك: ${bH} س)` : 'تسجيل بصمة يدوية من الأدمن') +
              (overtimeHours > 0 ? ` (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)` : ''),
        statusLabel: overtimeHours > 0 ? 'تسجيل يدوي (مع إضافي معتمد)' : 'تسجيل يدوي',
        excludeDailyAllowance: !includeDailyAllowance,
        createdAt: new Date().toISOString()
      };

      const updatedShifts = [newPunch, ...(state.shifts || [])];
      let updatedState = { ...state, shifts: updatedShifts };
      
      // Auto-recalculate employee lateness via unified reconciliation engine
      const { updatedState: reconState } = reconcileEmployeeScheduleOrPunchChange({
        employeeId: manualEmpId,
        state: updatedState,
        options: { reason: 'تسجيل بصمة يدوية بالإدارة' }
      });

      const markedIncidents = (reconState.lateIncidents || []).map((inc) => {
        if (inc.shiftId === newPunch.id || inc.date === manualDate) {
          return {
            ...inc,
            read: true,
            acknowledgedByAdmin: true,
            isAdminCreated: true,
            creatorRole: 'admin'
          };
        }
        return inc;
      });

      const markedRequests = (reconState.requests || []).map((r) => {
        if (r.date === manualDate || r.shiftId === newPunch.id) {
          return {
            ...r,
            read: true,
            hiddenFromAdmin: true,
            isAdminCreated: true,
            creatorRole: 'admin'
          };
        }
        return r;
      });

      const cleanDeletedIds = (reconState._deletedIds || state._deletedIds || []).filter(d => {
        if (!d) return false;
        const dStr = String(d).toLowerCase();
        const fId = newPunch.id.toLowerCase();
        return dStr !== fId && dStr !== `shift_${fId}` && dStr !== `punch_${fId}`;
      });

      updatedState = {
        ...reconState,
        lateIncidents: markedIncidents,
        requests: markedRequests,
        _deletedIds: cleanDeletedIds
      };

      // 0ms instant optimistic UI response
      if (setState) setState(updatedState);
      setManualInTime('');
      setManualOutTime('');
      setManualBreakHours('0');
      setManualNotes('');
      setManualBranchId('');
      setIncludeDailyAllowance(true);
      setManualDate(getTodayDateStr());

      const lateInc = markedIncidents.find((inc) => (inc.shiftId === newPunch.id || inc.date === manualDate) && inc.lateMinutes > 0);
      if (lateInc && lateInc.deductionMinutes > 0) {
        showToast?.(`✅ تم تسجيل البصمة وتطبيق لائحة الجزاءات تلقائياً: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.tierName} (${lateInc.actionLabel} - خصم ${lateInc.penaltyAmount} ج.م)`);
      } else if (lateInc && lateInc.lateMinutes > 0) {
        showToast?.(`✅ تم تسجيل البصمة وتطبيق اللائحة: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.actionLabel || 'فترة سماح'}`);
      } else if (overtimeHours > 0) {
        showToast?.(`✅ تم تسجيل البصمة اليدوية واحتساب الوقت الإضافي تلقائياً: ${regularHours} س أساسي + ${overtimeHours} س إضافي معتمد`);
      } else {
        showToast?.('✅ تم إضافة البصمة اليدوية للموظف فوراً وحساب الساعات بنجاح (حضور في الموعد)');
      }

      let atomicSaved = false;
      try {
        const slicesToSave = {
          shifts: updatedShifts,
          requests: updatedState.requests
        };
        if (updatedState.lateIncidents) {
          slicesToSave.lateIncidents = updatedState.lateIncidents;
        }
        if (updatedState._deletedIds) {
          slicesToSave._deletedIds = updatedState._deletedIds;
        }
        await apiSaveSettingsSlice(slicesToSave);
        atomicSaved = true;
      } catch (sliceErr) {
        console.warn('[AttendanceModule] Slice save error:', sliceErr);
      }

      if (atomicSaved) {
        try {
          await saveStateLocally(updatedState);
          broadcastStateChange(updatedState);
        } catch (locErr) {
          console.warn('[AttendanceModule] Local save error:', locErr);
        }
      } else if (saveState) {
        saveState(updatedState).catch(err => console.error('Background save error on manual punch:', err));
      }
    };

    performAdd();
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            ⏱️ سجل الحضور والانصراف وإضافة البصمات اليدوية
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            استعراض سجل بصمات الموظفين وإضافة بصمات يدوية مع تصفية بالفروع
          </p>
        </div>
      </div>

      {/* Add Manual Punch Form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
          ➕ إضافة بصمة يدوية لموظف
        </h4>
        <form onSubmit={handleAddManualPunch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div className="field">
            <label>فلتر حسب الفرع</label>
            <select
              value={manualFilterBranchId}
              onChange={(e) => {
                const bId = e.target.value;
                setManualFilterBranchId(bId);
                setManualEmpId('');
                if (bId !== 'all') {
                  setManualBranchId(bId);
                } else {
                  setManualBranchId('');
                }
              }}
            >
              <option value="all">🏬 جميع الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>اختر الموظف</label>
            <select
              value={manualEmpId}
              onChange={(e) => {
                const id = e.target.value;
                setManualEmpId(id);
                const emp = employees.find(em => String(em.id) === String(id));
                if (emp) {
                  const bH = emp.breakHours || emp.defaultBreakHours || emp.branchesDetails?.[0]?.breakHours || '0';
                  setManualBreakHours(String(bH));
                  if (manualFilterBranchId && manualFilterBranchId !== 'all') {
                    setManualBranchId(manualFilterBranchId);
                  } else if (emp.branchId) {
                    setManualBranchId(emp.branchId);
                  }
                } else {
                  setManualBreakHours('0');
                }
              }}
              required
            >
              <option value="">-- اختر الموظف --</option>
              {manualFilteredEmployees.map((e) => {
                const count = getEmployeeManualPunchesCount(e.id, state, activePeriodFilter);
                return (
                  <option key={e.id} value={e.id}>
                    {getEmpDisplayName(e)} (كود: {e.code}) — [مسجل له {count} بصمات يدوية هذا الشهر]
                  </option>
                );
              })}
            </select>
          </div>

          {manualEmpId && employees.find(e => e.id === manualEmpId)?.branchesDetails?.length > 1 && (
            <div className="field">
              <label>الفرع (للموظف متعدد الفروع)</label>
              <select value={manualBranchId} onChange={(e) => setManualBranchId(e.target.value)} required>
                <option value="">-- اختر الفرع --</option>
                {employees.find(e => e.id === manualEmpId).branchesDetails.map(bd => {
                  const b = state.branches?.find(br => br.id === bd.branchId);
                  return <option key={bd.branchId} value={bd.branchId}>{b?.name || 'فرع غير معروف'}</option>;
                })}
              </select>
            </div>
          )}

          <div className="field">
            <label>تاريخ البصمة</label>
            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} required />
          </div>

          <div className="field">
            <label>وقت الدخول</label>
            <input type="time" value={manualInTime} onChange={(e) => setManualInTime(e.target.value)} required />
          </div>

          <div className="field">
            <label>وقت الخروج</label>
            <input type="time" value={manualOutTime} onChange={(e) => setManualOutTime(e.target.value)} required />
          </div>

          <div className="field">
            <label>ساعات البريك (تخصم من اليوم)</label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="12"
              value={manualBreakHours}
              onChange={(e) => setManualBreakHours(e.target.value)}
              placeholder="0"
            />
          </div>

          {manualInTime && manualOutTime && (() => {
            const inParts = manualInTime.split(':').map(Number);
            const outParts = manualOutTime.split(':').map(Number);
            let diffMinutes = ((outParts[0] || 0) * 60 + (outParts[1] || 0)) - ((inParts[0] || 0) * 60 + (inParts[1] || 0));
            if (diffMinutes <= 0) diffMinutes += 24 * 60;
            const gross = Math.round((diffMinutes / 60) * 100) / 100;
            const bH = Math.max(0, parseFloat(manualBreakHours) || 0);
            const net = Math.max(0, Math.round((gross - bH) * 100) / 100);
            return (
              <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bbf7d0', fontSize: '13px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span>⏱️ إجمالي وقت التواجد: <strong>{gross} س</strong></span>
                <span>☕ ساعات البريك المخصومة: <strong>{bH} س</strong></span>
                <span style={{ color: '#16a34a', fontWeight: '800' }}>✅ صافي ساعات العمل المحسوبة: <strong>{net} ساعة</strong></span>
              </div>
            );
          })()}

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>ملاحظات ومبرر البصمة اليدوية</label>
            <input type="text" placeholder="سبب الإضافة اليدوية..." value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} />
          </div>

          {(() => {
            const empObj = employees.find((e) => e.id === manualEmpId);
            const dailyRate = (empObj && (parseFloat(empObj.dailyAllowanceAmount) || 0)) ||
              (empObj?.dailyAllowances?.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0) || 0);
            if (!empObj || dailyRate <= 0) return null;

            return (
              <div style={{
                gridColumn: '1 / -1',
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontSize: '13px' }}>
                  <span style={{ fontSize: '18px' }}>💰</span>
                  <div>
                    <strong>البدل اليومي للموظف ({empObj.dailyAllowanceTitle || 'بدل يومي'}):</strong>
                    <span style={{ marginRight: '6px', color: '#047857', fontWeight: 800 }}>
                      +{dailyRate} ج.م / يوم
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#059669', display: 'block' }}>
                      يتم احتساب البدل تلقائياً في كشف الراتب عند تسجيل بصمة الدخول لهذا اليوم
                    </span>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#065f46', fontWeight: 'bold' }}>
                  <input
                    type="checkbox"
                    checked={includeDailyAllowance}
                    onChange={(e) => setIncludeDailyAllowance(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#059669' }}
                  />
                  احتساب البدل اليومي مع هذه البصمة
                </label>
              </div>
            );
          })()}

          {manualConflictResult?.hasConflict && (
            <div style={{
              gridColumn: '1 / -1',
              background: '#fef2f2',
              border: '1.5px solid #ef4444',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '12.5px',
              color: '#991b1b',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              boxShadow: '0 2px 6px rgba(239, 68, 68, 0.1)'
            }}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1, lineHeight: '1.5' }}>
                {manualConflictResult.message}
              </div>
            </div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-start"
              style={{
                opacity: manualConflictResult?.hasConflict ? 0.7 : 1,
                cursor: manualConflictResult?.hasConflict ? 'not-allowed' : 'pointer'
              }}
            >
              💾 تسجيل البصمة اليدوية
            </button>
          </div>
        </form>
      </div>

      {/* ── Month & Period Navigation Toolbar ── */}
      <div style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        border: '1.5px solid #cbd5e1',
        borderRadius: '14px',
        padding: '14px 18px',
        marginBottom: '18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        {/* Navigation Buttons & Month Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1.5px solid #0d9488', borderRadius: '10px', padding: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              title="الانتقال إلى الشهر السابق"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                color: '#0f766e',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ◀ الشهر السابق
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', borderRight: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '15px' }}>📅</span>
              <input
                type="month"
                value={effectiveMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '14px',
                  fontWeight: 800,
                  color: '#0f766e',
                  cursor: 'pointer',
                  background: 'transparent'
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              title="الانتقال إلى الشهر التالي"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                color: '#0f766e',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              الشهر التالي ▶
            </button>
          </div>

          <button
            type="button"
            onClick={handleCurrentCycle}
            style={{
              background: (effectiveMonth === autoActiveCycle && effectiveFilterMode === 'month') ? '#0d9488' : '#fff',
              color: (effectiveMonth === autoActiveCycle && effectiveFilterMode === 'month') ? '#fff' : '#0d9488',
              border: '1.5px solid #0d9488',
              padding: '6px 14px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            title="العودة إلى دورة الرواتب النشطة الحالية"
          >
            <span>🎯</span>
            <span>الدورة النشطة الحالية</span>
          </button>

          <button
            type="button"
            onClick={handleToggleAllRecords}
            style={{
              background: effectiveFilterMode === 'all' ? '#7c3aed' : '#fff',
              color: effectiveFilterMode === 'all' ? '#fff' : '#7c3aed',
              border: '1.5px solid #7c3aed',
              padding: '6px 14px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            title="عرض كافة بصمات الموظفين المسجلة بدون تقييد زمني بشهر معين"
          >
            <span>🌐</span>
            <span>{effectiveFilterMode === 'all' ? 'عرض الكل نشط (إلغاء التقييد)' : 'كافة السجلات (الكل)'}</span>
          </button>
        </div>

        {/* Active Range Summary Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            background: effectiveFilterMode === 'all' ? '#ede9fe' : '#ccfbf1',
            color: effectiveFilterMode === 'all' ? '#5b21b6' : '#115e59',
            border: `1px solid ${effectiveFilterMode === 'all' ? '#ddd6fe' : '#99f6e4'}`,
            padding: '6px 14px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>{effectiveFilterMode === 'all' ? '🌐' : '🗓️'}</span>
            <span>{periodLabel}</span>
            {effectiveFilterMode === 'month' && activeCycleRange?.daysCount && (
              <span style={{
                background: '#0d9488',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: '8px',
                fontSize: '11px',
                marginRight: '6px'
              }}>
                {activeCycleRange.daysCount} يوم
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Employees List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>👥 كشف حضور الموظفين بالصيدليات (اضغط على الموظف للمعاينة)</h4>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
          />
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <option value="">-- جميع الفروع --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>المسمى الوظيفي</th>
              <th>عدد بصمات الفترة {periodLabel ? `(${periodLabel})` : ''}</th>
              <th>بصمات يدوية هذا الشهر</th>
              <th>ساعات العمل المسجلة</th>
              <th>المعاينة والسجل</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => br.id === emp.branchId);
                const empPunches = (state.shifts || []).filter((p) => {
                  if (p.status === 'cancelled' || p.isCancelled) return false;
                  const isMatch = String(p.employeeId) === String(emp.id) || String(p.employeeCode) === String(emp.code);
                  return isMatch && activePeriodFilter(p.date);
                });

                // فحص إجازة الموظف المعتمدة لليوم
                const todayStrNow = typeof getRealTodayStr === 'function' ? getRealTodayStr() : new Date().toISOString().slice(0, 10);
                const approvedLeaveToday = getEmployeeCurrentApprovedLeave(emp, todayStrNow, state);
                const hasActualPunchToday = (state.shifts || []).some(s =>
                  (String(s.employeeId) === String(emp.id) || String(s.employeeCode) === String(emp.code)) &&
                  s.date === todayStrNow &&
                  Boolean(s.timeIn && s.timeIn !== '—') &&
                  s.status !== 'cancelled' && !s.isCancelled
                );

                // فحص ما إذا كان الموظف لديه بصمة حضور نشطة اليوم أو وردية ليلية عابرة لمنتصف الليل حقيقية (Live Active Shift)
                const openShiftInShifts = (state.shifts || []).find(s => {
                  if (String(s.employeeId) !== String(emp.id) && String(s.employeeCode) !== String(emp.code)) return false;
                  if (s.status === 'cancelled' || s.isCancelled || s.status === 'completed') return false;
                  if (!s.timeIn || s.timeIn === '—') return false;
                  const hasTimeOut = Boolean(s.timeOut && s.timeOut !== '—' && s.timeOut !== '' && s.timeOut !== 'قيد العمل الآن');
                  if (hasTimeOut) return false;

                  const sEpoch = getShiftStartEpoch(s);
                  if (s.date === todayStrNow) return true;
                  // وردية ليلية بدأت أمس ومستمرة لليوم (خلال نافذة أقصاها 30 ساعة)
                  return s.date < todayStrNow && sEpoch > 0 && (Date.now() - sEpoch) < 30 * 3600 * 1000;
                });

                const rawActiveShift = state.activeShifts?.[emp.id] ||
                  state.activeShifts?.[String(emp.id)] ||
                  (emp.code && state.activeShifts?.[emp.code]) ||
                  (emp.code && state.activeShifts?.[String(emp.code)]) ||
                  openShiftInShifts;

                // إذا كان الموظف في إجازة معتمدة اليوم ولم يقم بالبصمة فعلياً اليوم، لا نعتبره متواجداً
                const activeShift = (approvedLeaveToday && !hasActualPunchToday) ? null : rawActiveShift;
                const actEpoch = activeShift ? getShiftStartEpoch(activeShift) : 0;

                const isOvernightActive = Boolean(
                  activeShift &&
                  isEmployeeActive(emp) &&
                  activeShift.date &&
                  activeShift.date < todayStrNow &&
                  actEpoch > 0 &&
                  (Date.now() - actEpoch) < 30 * 3600 * 1000
                );
                const hasLiveShift = Boolean(activeShift && isEmployeeActive(emp) && (activeShift.date === todayStrNow || isOvernightActive));
                const liveElapsedHours = hasLiveShift && actEpoch > 0
                  ? Math.max(0, Math.round(((Date.now() - actEpoch) / 3600000) * 10) / 10)
                  : 0;

                const validPunches = empPunches.filter((p) => !p.isRejectedPhoto && p.status !== 'rejected_photo');
                const distinctBranchesCount = new Set(validPunches.map(p => p.branchId || p.branchName).filter(Boolean)).size;
                const totalCompletedHours = validPunches.reduce((acc, p) => acc + (getEffectiveShiftHours(p, state) || 0), 0);
                const totalHours = (totalCompletedHours + liveElapsedHours).toFixed(1);
                const hasLiveAlreadyInValidPunches = validPunches.some(p => p.isLiveActive || (!p.timeOut || p.timeOut === '—' || p.timeOut === '' || p.timeOut === 'قيد العمل الآن'));
                const totalShiftsCount = validPunches.length + (hasLiveShift && !hasLiveAlreadyInValidPunches ? 1 : 0);
                const manualCount = getEmployeeManualPunchesCount(emp.id, state, activePeriodFilter);

                return (
                  <tr key={emp.id} style={{ background: hasLiveShift ? 'rgba(236, 253, 245, 0.45)' : 'transparent' }}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>
                      {getEmpDisplayName(emp)}
                      {approvedLeaveToday && !hasLiveShift && (
                        <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: '#0369a1', background: '#e0f2fe', border: '1px solid #7dd3fc', padding: '1px 8px', borderRadius: '6px', fontWeight: '800' }}>
                            🏖️ إجازة معتمدة ({approvedLeaveToday.leaveType === 'unpaid' ? 'بدون أجر' : approvedLeaveToday.leaveType === 'sick' ? 'مرضية' : 'سنوية'})
                          </span>
                        </div>
                      )}
                      {hasLiveShift && (
                        <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: liveElapsedHours >= 15 ? '#dc2626' : '#059669', fontWeight: '800' }}>
                            {isOvernightActive
                              ? `🟢 متواجد الآن 🌙 (${activeShift.timeIn})`
                              : `🟢 متواجد الآن (${activeShift.timeIn})`}
                          </span>
                          {liveElapsedHours >= 15 && (
                            <span style={{ fontSize: '10px', color: '#b91c1c', background: '#fee2e2', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontWeight: '900' }}>
                              ⚠️ {liveElapsedHours} س جارية
                            </span>
                          )}
                          {(() => {
                            const meth = getPunchMethodDetails(activeShift);
                            return (
                              <span style={{
                                background: meth.bg,
                                color: meth.color,
                                border: `1px solid ${meth.border}`,
                                padding: '1px 7px',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                <span>{meth.icon}</span>
                                <span>{meth.shortLabel}</span>
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span className="badge badge-primary">{totalShiftsCount} وردية</span>
                        {hasLiveShift && (
                          <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '6px', fontSize: '10.5px', fontWeight: '800', textAlign: 'center' }}>
                            {isOvernightActive ? 'حضور حي 🌙 عابر لمنتصف الليل' : 'حضور حي'}
                          </span>
                        )}
                        {hasLiveShift && liveElapsedHours >= 15 && (
                          <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #f87171', padding: '1px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', textAlign: 'center' }}>
                            ⚠️ مفتوحة &gt; 15 ساعة
                          </span>
                        )}
                        {distinctBranchesCount > 1 && (
                          <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: '800', textAlign: 'center' }}>
                            🏢 متعدد الفروع ({distinctBranchesCount})
                          </span>
                        )}
                        {approvedLeaveToday && !hasLiveShift && (
                          <span style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '6px', fontSize: '10.5px', fontWeight: '800', textAlign: 'center' }}>
                            🏖️ في إجازة معتمدة
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {manualCount > 0 ? (
                        <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '3px 10px', borderRadius: '8px', fontWeight: '800', fontSize: '12px' }}>
                          🖐️ {manualCount} يدوي
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>0</span>
                      )}
                    </td>
                    <td style={{ color: '#0d9488', fontWeight: '800' }}>
                      {totalHours} ساعة
                      {hasLiveShift && (
                        <span style={{ display: 'block', fontSize: '10.5px', color: '#16a34a', fontWeight: 'normal' }}>
                          (+{liveElapsedHours} س جارية)
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedPunchEmp(emp)}
                      >
                        📋 عرض سجل البصمات التفصيلي
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Attendance Punches Modal */}
      {selectedPunchEmp && (
        <AttendancePunchesModal
          employee={selectedPunchEmp}
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          executeWithOwnerGuard={executeWithOwnerGuard}
          filterFn={activePeriodFilter}
          monthPicker={effectiveMonth}
          setMonthPicker={handleMonthChange}
          filterMode={effectiveFilterMode}
          setFilterMode={setEffectiveFilterMode}
          customFrom={effectiveCustomFrom}
          setCustomFrom={setEffectiveCustomFrom}
          customTo={effectiveCustomTo}
          setCustomTo={setEffectiveCustomTo}
          stopShift={stopShift}
          onClose={() => setSelectedPunchEmp(null)}
        />
      )}
    </div>
  );
}
