import React, { useState, useMemo } from 'react';
import { arabicWeekday, fmt } from '../../utils/formatters';
import { getRealTodayStr } from '../../utils/timeEngine';
import { findEmployeeRoster, getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { calculateLatenessMinutes } from '../../utils/latePenaltyEngine';
import { dispatchEmployeeRequest } from '../../utils/requestSubmissionHelper';
import { shouldRouteDirectToAdmin, isBranchWithoutManager } from '../../utils/jobsHelper';

/**
 * ShiftAdjustmentModule.jsx
 * وحدة تعديل الشيفت والجدول الشهري المتطورة
 * 
 * الميزات:
 * 1. المطابقة البصرية الذكية (Visual Punch vs Roster Reconciliation) بين البصمات والجدول المعتمد
 * 2. إمكانية تعديل يوم محدد أو عدة أيام مجمعة (Bulk/Multi-Day Adjustment)
 * 3. تحويل اليوم إلى راحة (Set as Rest Day) أو تعديل أوقات العمل
 * 4. تسوية العمل في يوم الراحة (تعيين يوم راحة بديل أو طلب بدل راحة)
 * 5. كشف تلقائي لجزاءات التأخير مع التنبيه بالإلغاء والإسقاط الفوري عند الاعتماد
 * 6. دورة اعتماد متكاملة (مدير الفرع ثم الإدارة العليا)
 */
export default function ShiftAdjustmentModule({
  mode = 'employee', // 'employee' | 'admin' | 'branch'
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth: initialSelectedMonth,
  selectedBranchId
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return initialSelectedMonth || getRealTodayStr().slice(0, 7);
  });

  const [selectedDates, setSelectedDates] = useState([]);
  const [actionType, setActionType] = useState('modify_hours'); // 'modify_hours' | 'set_rest_day' | 'compensate_worked_rest'
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('17:00');
  const [replacementRestDate, setReplacementRestDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'late_only' | 'worked_rest'

  const activeEmp = emp || (state?.employees || [])[0];
  const activeBranchId = selectedBranchId || activeEmp?.branchesDetails?.[0]?.branchId || activeEmp?.branchId || '';
  const branchObj = (state?.branches || []).find((b) => b && String(b.id) === String(activeBranchId));
  const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

  // 1. حساب قائمة أيام الشهر وبياناتها
  const daysInMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month)) return [];

    const totalDays = new Date(year, month, 0).getDate();
    const list = [];
    const empIdStr = String(activeEmp?.id || '');

    // جلب روستر الموظف المعتمد
    const roster = findEmployeeRoster(activeEmp?.id, selectedMonth, state, activeBranchId);
    const shifts = (state?.shifts || []).filter(
      (s) => String(s.employeeId) === empIdStr && s.date && s.date.startsWith(selectedMonth)
    );
    const lateIncidents = (state?.lateIncidents || []).filter(
      (inc) => String(inc.employeeId) === empIdStr && inc.date && inc.date.startsWith(selectedMonth)
    );

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayName = arabicWeekday(dateStr);
      const jsDay = new Date(dateStr + 'T00:00:00').getDay();

      // الجدول المعتمد لليوم
      const daySchedule = getEmployeeDaySchedule(activeEmp?.id, dateStr, state);
      const isOff = daySchedule?.type === 'off' || daySchedule?.isOff === true;

      // البصمات المسجلة لليوم
      const dayShifts = shifts.filter((s) => s.date === dateStr);
      const punchIn = dayShifts.length > 0 ? (dayShifts[0].timeIn || dayShifts[0].inTime || '') : '';
      const punchOut = dayShifts.length > 0 ? (dayShifts[dayShifts.length - 1].timeOut || dayShifts[dayShifts.length - 1].outTime || '') : '';
      const totalHoursWorked = dayShifts.reduce((sum, s) => sum + (parseFloat(s.hours || s.totalHours) || 0), 0);

      // وقائع التأخير لليوم
      const dayLates = lateIncidents.filter((inc) => inc.date === dateStr);
      const activeLate = dayLates.find((inc) => inc.status !== 'cancelled' && !inc.isCancelled && (parseFloat(inc.penaltyAmount) > 0 || parseFloat(inc.deductionMinutes) > 0));
      const waivedLate = dayLates.find((inc) => inc.status === 'cancelled' || inc.isCancelled || inc.status === 'waived');

      // دقائق التأخير المحسوبة
      let latenessMins = 0;
      if (punchIn && daySchedule?.start && !isOff) {
        latenessMins = calculateLatenessMinutes(daySchedule.start, punchIn);
      }

      // هل نزل في يوم راحة؟
      const isWorkedRestDay = isOff && dayShifts.length > 0;

      list.push({
        dateStr,
        dayName,
        jsDay,
        scheduledShift: daySchedule,
        isOff,
        punchIn,
        punchOut,
        totalHoursWorked,
        latenessMins,
        activeLate,
        waivedLate,
        isWorkedRestDay,
        hasPunches: dayShifts.length > 0
      });
    }

    return list;
  }, [selectedMonth, activeEmp, state, activeBranchId]);

  // تصفية الأيام بناءً على الفلتر
  const filteredDays = useMemo(() => {
    if (filterMode === 'late_only') {
      return daysInMonth.filter((d) => d.activeLate || d.latenessMins > 0);
    }
    if (filterMode === 'worked_rest') {
      return daysInMonth.filter((d) => d.isWorkedRestDay);
    }
    return daysInMonth;
  }, [daysInMonth, filterMode]);

  // طلبات تعديل الشيفت السابقة لهذا الموظف
  const adjustmentRequests = useMemo(() => {
    const empIdStr = String(activeEmp?.id || '');
    return (state?.requests || [])
      .filter((r) => {
        if (!r) return false;
        const isMatchEmp = String(r.employeeId) === empIdStr || (activeEmp?.code && String(r.employeeCode) === String(activeEmp.code));
        const isAdjType = r.type === 'shift_adjustment' || r.type === 'roster_edit' || r.type === 'roster_edit_request';
        return isMatchEmp && isAdjType;
      })
      .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
  }, [state?.requests, activeEmp]);

  // تبديل اختيار تاريخ محدد
  const handleToggleDate = (dateStr) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  // اختيار الكل / إلغاء الكل
  const handleSelectAll = () => {
    if (selectedDates.length === filteredDays.length) {
      setSelectedDates([]);
    } else {
      setSelectedDates(filteredDays.map((d) => d.dateStr));
    }
  };

  // تسوية فورية على وقت البصمة (Auto-Align to Punch)
  const handleAutoAlignToPunch = (dayItem) => {
    if (!dayItem.punchIn) {
      showToast?.('⚠️ لا توجد بصمة مسجلة لهذا اليوم للتسوية عليها');
      return;
    }
    setSelectedDates([dayItem.dateStr]);
    setActionType('modify_hours');
    setNewStartTime(dayItem.punchIn);
    // وقت الانصراف الجديد: إما وقت البصمة الفعلي أو زيادة 8 ساعات
    if (dayItem.punchOut) {
      setNewEndTime(dayItem.punchOut);
    } else {
      const [h, m] = dayItem.punchIn.split(':').map(Number);
      const endH = (h + 8) % 24;
      setNewEndTime(`${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    setReason(`تسوية موعد الحضور ليتطابق مع بصمة الحضور الفعلية (${dayItem.punchIn}) لإسقاط جزاء التأخير`);
    showToast?.(`⚡ تم ضبط الميعاد تلقائياً على وقت البصمة (${dayItem.punchIn})`);
  };

  // تحويل سريع لراحة
  const handleQuickSetRest = (dayItem) => {
    setSelectedDates([dayItem.dateStr]);
    setActionType('set_rest_day');
    setReason(`تحديد يوم ${dayItem.dayName} الموافق ${dayItem.dateStr} كيوم راحة أسبوعية`);
    showToast?.(`🛋️ تم تحديد يوم ${dayItem.dateStr} كـ راحة`);
  };

  // فحص ما إذا كانت الأيام المختارة تحتوي على جزاءات تأخير معلقة
  const selectedDaysPenalties = useMemo(() => {
    const list = [];
    selectedDates.forEach((dStr) => {
      const dayInfo = daysInMonth.find((d) => d.dateStr === dStr);
      if (dayInfo && dayInfo.activeLate) {
        list.push({ date: dStr, late: dayInfo.activeLate });
      }
    });
    return list;
  }, [selectedDates, daysInMonth]);

  // إرسال طلب تعديل الشيفت
  const handleSubmitAdjustment = async (e) => {
    if (e) e.preventDefault();
    if (!activeEmp) {
      showToast?.('❌ خطأ: لم يتم تحديد بيانات الموظف');
      return;
    }
    if (selectedDates.length === 0) {
      showToast?.('⚠️ يرجى اختيار يوم واحد على الأقل من الجدول لتعديل الشيفت');
      return;
    }

    if (actionType === 'modify_hours') {
      if (!newStartTime || !newEndTime) {
        showToast?.('يرجى تحديد وقت بداية ونهاية العمل');
        return;
      }
    }

    if (actionType === 'compensate_worked_rest') {
      if (!replacementRestDate) {
        showToast?.('يرجى تحديد تاريخ يوم الراحة البديل');
        return;
      }
    }

    setSubmitting(true);
    try {
      const reqBranchId = activeBranchId || activeEmp.branchesDetails?.[0]?.branchId || activeEmp.branchId;
      const noBranchMgr = isBranchWithoutManager(reqBranchId, state);
      const isDirectAdmin = noBranchMgr || shouldRouteDirectToAdmin(activeEmp, reqBranchId, state);
      const targetApproval = isDirectAdmin ? 'admin_only' : 'branch_and_admin';

      // احتساب ساعات الشيفت الجديد
      let computedHours = 8;
      if (actionType === 'modify_hours') {
        const [sH, sM] = newStartTime.split(':').map(Number);
        const [eH, eM] = newEndTime.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff <= 0) diff += 24 * 60; // عبر منتصف الليل
        computedHours = parseFloat((diff / 60).toFixed(2));
      } else if (actionType === 'set_rest_day') {
        computedHours = 0;
      }

      // بناء خريطة الجداول الجديدة للأيام المختارة
      const newScheduleMap = {};
      selectedDates.forEach((dStr) => {
        if (actionType === 'modify_hours') {
          newScheduleMap[dStr] = {
            type: 'shift',
            isOff: false,
            start: newStartTime,
            end: newEndTime,
            hours: computedHours
          };
        } else if (actionType === 'set_rest_day') {
          newScheduleMap[dStr] = {
            type: 'off',
            isOff: true,
            start: '',
            end: '',
            hours: 0
          };
        } else if (actionType === 'compensate_worked_rest') {
          // اليوم الذي نزل فيه يصبح شيفت عمل عادي
          newScheduleMap[dStr] = {
            type: 'shift',
            isOff: false,
            start: newStartTime || '08:00',
            end: newEndTime || '16:00',
            hours: 8
          };
          // واليوم البديل يصبح راحة
          if (replacementRestDate) {
            newScheduleMap[replacementRestDate] = {
              type: 'off',
              isOff: true,
              start: '',
              end: '',
              hours: 0,
              isReplacementOff: true,
              replacedWorkDate: dStr
            };
          }
        }
      });

      const actionTitle =
        actionType === 'modify_hours'
          ? `تعديل مواعيد العمل (${newStartTime} إلى ${newEndTime})`
          : actionType === 'set_rest_day'
          ? 'تحويل إلى يوم راحة (Off Day)'
          : `تسوية عمل في يوم راحة مع تعيين يوم ${replacementRestDate} راحة بديلة`;

      const penaltyWaiverNote =
        selectedDaysPenalties.length > 0
          ? ` (يتضمن إسقاط جزاءات تأخير مسجلة لـ ${selectedDaysPenalties.length} يوم بإجمالي خصم ${selectedDaysPenalties.reduce((sum, p) => sum + (parseFloat(p.late.penaltyAmount) || 0), 0)} ج.م)`
          : '';

      const fullDetails = `${actionTitle} للأيام (${selectedDates.join(', ')})${penaltyWaiverNote}. ${reason ? 'السبب: ' + reason.trim() : ''}`;

      const requestId = 'REQ-SHIFT-ADJ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

      const requestPayload = {
        id: requestId,
        type: 'shift_adjustment',
        requestType: 'shift_adjustment',
        typeLabel: 'طلب تعديل الشيفت والجدول',
        employeeId: activeEmp.id,
        employeeName: activeEmp.name,
        employeeCode: activeEmp.code || '',
        branchId: reqBranchId,
        branchName: branchName,
        date: selectedDates[0],
        dates: selectedDates,
        actionType,
        newStartTime: actionType === 'modify_hours' ? newStartTime : '',
        newEndTime: actionType === 'modify_hours' ? newEndTime : '',
        replacementRestDate: actionType === 'compensate_worked_rest' ? replacementRestDate : '',
        schedule: newScheduleMap,
        newSchedule: newScheduleMap,
        month: selectedMonth,
        daysCount: selectedDates.length,
        hasPenaltiesToWaive: selectedDaysPenalties.length > 0,
        penaltiesToWaive: selectedDaysPenalties.map((p) => p.late.id),
        details: fullDetails,
        reason: reason.trim(),
        targetApproval,
        isDirectToAdmin: isDirectAdmin,
        branchNotRequired: isDirectAdmin,
        managerStatus: noBranchMgr ? 'skipped' : (isDirectAdmin ? 'skipped' : 'pending'),
        branchApproved: false,
        adminApproved: false,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // استخدام محرك إرسال الطلبات الموحد
      await dispatchEmployeeRequest({
        request: requestPayload,
        employee: activeEmp,
        state,
        setState,
        saveState,
        showToast
      });

      showToast?.(`✅ تم إرسال طلب تعديل الشيفت لـ (${selectedDates.length}) يوم إلى مدير الفرع والإدارة بنجاح`);

      // إعادة ضبط النموذج
      setSelectedDates([]);
      setReason('');
      setReplacementRestDate('');
    } catch (err) {
      console.error('Error submitting shift adjustment request:', err);
      showToast?.('❌ حدث خطأ أثناء إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  // التنقل بين الشهور
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="card ep-tab-content fade-in" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* ── 1. ترويسة الصفحة والمعلومات الأساسية ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #064e3b 100%)',
        borderRadius: '16px',
        padding: '20px 24px',
        color: '#ffffff',
        marginBottom: '20px',
        boxShadow: '0 8px 24px rgba(15, 118, 110, 0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '30px' }}>🔄</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#ffffff', fontFamily: 'Cairo' }}>
                تعديل الشيفت والجدول الشهري
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.9 }}>
                تعديل مواعيد العمل، تحديد الراحات، وإلغاء جزاءات التأخير بأثر رجعي بموافقة الإدارة
              </p>
            </div>
          </div>

          {/* محدد الشهر */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '12px' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer', padding: '2px 8px' }}
              title="الشهر السابق"
            >
              ◀
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              style={{
                background: '#ffffff',
                color: '#0f766e',
                border: 'none',
                borderRadius: '8px',
                padding: '4px 10px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            />
            <button
              type="button"
              onClick={handleNextMonth}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer', padding: '2px 8px' }}
              title="الشهر التالي"
            >
              ▶
            </button>
          </div>
        </div>

        {/* بطاقة معلومات الموظف */}
        <div style={{ display: 'flex', gap: '20px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', flexWrap: 'wrap', fontSize: '12.5px' }}>
          <span>👤 الموظف: <strong>{activeEmp?.name || '—'}</strong> ({activeEmp?.code || '—'})</span>
          <span>💼 المسمى: <strong>{activeEmp?.jobTitle || '—'}</strong></span>
          <span>🏢 الفرع: <strong>{branchName}</strong></span>
          <span>📅 الشهر المعروض: <strong>{selectedMonth}</strong> ({daysInMonth.length} يوم)</span>
        </div>
      </div>

      {/* ── 2. تبويبات تصفية الأيام والمطابقة البصرية ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${filterMode === 'all' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setFilterMode('all')}
            style={{ fontSize: '12px', padding: '5px 12px' }}
          >
            📋 كافة أيام الشهر ({daysInMonth.length})
          </button>
          <button
            type="button"
            className={`btn ${filterMode === 'late_only' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setFilterMode('late_only')}
            style={{ fontSize: '12px', padding: '5px 12px', background: filterMode === 'late_only' ? '#ea580c' : undefined }}
          >
            ⚠️ أيام التأخير والجزاءات ({daysInMonth.filter((d) => d.activeLate || d.latenessMins > 0).length})
          </button>
          <button
            type="button"
            className={`btn ${filterMode === 'worked_rest' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setFilterMode('worked_rest')}
            style={{ fontSize: '12px', padding: '5px 12px', background: filterMode === 'worked_rest' ? '#7c3aed' : undefined }}
          >
            ⭐ عمل في يوم راحة ({daysInMonth.filter((d) => d.isWorkedRestDay).length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleSelectAll}
            style={{ fontSize: '12px', padding: '5px 12px', border: '1px solid var(--border)' }}
          >
            {selectedDates.length === filteredDays.length ? '✕ إلغاء تحديد الكل' : '✓ تحديد كافة الأيام المعروضة'}
          </button>
          {selectedDates.length > 0 && (
            <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
              تم اختيار {selectedDates.length} يوم
            </span>
          )}
        </div>
      </div>

      {/* ── 3. جدول المطابقة البصرية الذكية (Visual Reconciliation Table) ── */}
      <div className="table-responsive" style={{
        background: 'var(--surface)',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        maxHeight: '420px',
        overflowY: 'auto',
        marginBottom: '20px'
      }}>
        <table className="bylaws-table" style={{ fontSize: '12.5px', borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-muted)' }}>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>اختيار</th>
              <th>اليوم والتاريخ</th>
              <th>الجدول الشهري المعتمد</th>
              <th>البصمة الفعلية (دخول - خروج)</th>
              <th>ساعات العمل</th>
              <th>حالة التأخير والجزاء</th>
              <th style={{ textAlign: 'center' }}>إجراءات تسوية سريعة</th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                  لا توجد أيام تطابق الفلتر المحدد.
                </td>
              </tr>
            ) : (
              filteredDays.map((dayItem) => {
                const isSelected = selectedDates.includes(dayItem.dateStr);
                const hasLate = Boolean(dayItem.activeLate || dayItem.latenessMins > 0);
                const isRest = dayItem.isOff;

                return (
                  <tr
                    key={dayItem.dateStr}
                    style={{
                      background: isSelected
                        ? 'rgba(15, 118, 110, 0.08)'
                        : hasLate
                        ? 'rgba(234, 88, 12, 0.04)'
                        : dayItem.isWorkedRestDay
                        ? 'rgba(124, 58, 237, 0.04)'
                        : 'transparent',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleDate(dayItem.dateStr)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>

                    {/* اليوم والتاريخ */}
                    <td style={{ fontWeight: 800 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{dayItem.dayName}</span>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>({dayItem.dateStr})</span>
                      </div>
                    </td>

                    {/* الجدول الشهري المعتمد */}
                    <td>
                      {isRest ? (
                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                          🛋️ يوم راحة
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {dayItem.scheduledShift?.start || '08:00'} - {dayItem.scheduledShift?.end || '16:00'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            ({dayItem.scheduledShift?.hours || 8} س)
                          </span>
                        </div>
                      )}
                    </td>

                    {/* البصمة الفعلية */}
                    <td>
                      {dayItem.punchIn ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, color: '#047857' }}>
                            {dayItem.punchIn}
                          </span>
                          <span>إلى</span>
                          <span style={{ fontWeight: 800, color: dayItem.punchOut ? '#047857' : '#94a3b8' }}>
                            {dayItem.punchOut || 'جاري الدوام'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>— لم تسجل بصمة</span>
                      )}
                    </td>

                    {/* ساعات العمل */}
                    <td style={{ fontWeight: 700 }}>
                      {dayItem.totalHoursWorked > 0 ? (
                        <span>{fmt(dayItem.totalHoursWorked)} س</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>0 س</span>
                      )}
                    </td>

                    {/* حالة التأخير والجزاء */}
                    <td>
                      {dayItem.activeLate ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, width: 'fit-content' }}>
                            ⚠️ تأخير {dayItem.activeLate.deductionMinutes || dayItem.latenessMins} دقيقة (خصم: {fmt(dayItem.activeLate.penaltyAmount)} ج.م)
                          </span>
                          <span style={{ fontSize: '10px', color: '#dc2626' }}>
                            • سيتم إسقاطه فور اعتماد هذا الطلب
                          </span>
                        </div>
                      ) : dayItem.waivedLate ? (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                          ✅ تم إعفاؤه بموجب تعديل سابق
                        </span>
                      ) : dayItem.latenessMins > 0 ? (
                        <span style={{ color: '#ea580c', fontSize: '11.5px', fontWeight: 700 }}>
                          ⏱️ تأخير {dayItem.latenessMins} دقيقة
                        </span>
                      ) : dayItem.isWorkedRestDay ? (
                        <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                          ⭐ عمل في يوم راحة
                        </span>
                      ) : dayItem.hasPunches ? (
                        <span style={{ color: '#16a34a', fontSize: '11.5px', fontWeight: 700 }}>
                          ✓ حضور منضبط
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>—</span>
                      )}
                    </td>

                    {/* أزرار الإجراء السريع */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {dayItem.punchIn && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleAutoAlignToPunch(dayItem)}
                            title="تسوية موعد الشيفت ليتطابق مع وقت البصمة وإلغاء التأخير"
                            style={{ padding: '2px 8px', fontSize: '11px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '6px' }}
                          >
                            ⚡ تسوية ع البصمة
                          </button>
                        )}
                        {!isRest && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleQuickSetRest(dayItem)}
                            title="تحويل اليوم إلى راحة أسبوعية"
                            style={{ padding: '2px 8px', fontSize: '11px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px' }}
                          >
                            🛋️ راحة
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── 4. نموذج تقديم طلب تعديل الشيفت ── */}
      <div style={{
        background: 'var(--surface-muted)',
        border: '1.5px solid var(--border)',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '24px'
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 800, color: 'var(--primary-dark)', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📝 نموذج طلب التعديل والاعتماد للأيام المختارة</span>
          {selectedDates.length > 0 ? (
            <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px' }}>
              ({selectedDates.length} يوم محدد)
            </span>
          ) : (
            <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
              (يرجى اختيار يوم أو أكثر من الجدول أعلاه)
            </span>
          )}
        </h3>

        {/* تنبيه بالجزاءات المسجلة التي ستسقط تلقائياً */}
        {selectedDaysPenalties.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
            border: '1.5px solid #fdba74',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            <div>
              <strong style={{ color: '#c2410c', fontSize: '13.5px', display: 'block' }}>
                تنبيه الإعفاء المالي واللائحي التلقائي:
              </strong>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9a3412' }}>
                يوجد جزاءات تأخير مسجلة في الأيام المختارة لـ ({selectedDaysPenalties.length}) يوم بإجمالي خصم (
                {selectedDaysPenalties.reduce((sum, p) => sum + (parseFloat(p.late.penaltyAmount) || 0), 0)} ج.م).
                عند اعتماد هذا الطلب من قِبل مدير الفرع والإدارة العليا، سيتم <strong>إسقاط الخصم وتصفير دقائق التأخير نهائياً</strong> وتحديث مسير الرواتب والجدول الشهري فوراً.
              </p>
            </div>
          </div>
        )}

        {/* خيارات الإجراء */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
              نوع التعديل المطلوب *
            </label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
            >
              <option value="modify_hours">✏️ تعديل مواعيد العمل (وقت الحضور والانصراف)</option>
              <option value="set_rest_day">🛋️ تحويل اليوم / الأيام إلى يوم راحة (Off Day)</option>
              <option value="compensate_worked_rest">⭐ تسوية عمل في يوم راحة (تعيين يوم راحة بديل)</option>
            </select>
          </div>

          {/* في حال تعديل الساعات */}
          {actionType === 'modify_hours' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  وقت بداية العمل الجديد *
                </label>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                  وقت نهاية العمل الجديد *
                </label>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
                />
              </div>
            </>
          )}

          {/* في حال تسوية عمل في يوم راحة واختيار يوم بديل */}
          {actionType === 'compensate_worked_rest' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                تاريخ يوم الراحة البديل *
              </label>
              <input
                type="date"
                value={replacementRestDate}
                onChange={(e) => setReplacementRestDate(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
              />
            </div>
          )}
        </div>

        {/* سبب التعديل */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
            سبب التعديل والتفاصيل (لتوضيح الموقف لمدير الفرع والإدارة)
          </label>
          <textarea
            rows="2"
            placeholder="مثال: تغطية زميل في نوبة مسائية / تكليف إضافي من مدير الفرع / تسوية وقت البصمة..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)', resize: 'vertical' }}
          />
        </div>

        {/* زر الإرسال */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-start"
            disabled={submitting || selectedDates.length === 0}
            onClick={handleSubmitAdjustment}
            style={{
              padding: '9px 24px',
              fontSize: '13.5px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
            }}
          >
            {submitting ? '⏳ جاري إرسال الطلب...' : '🚀 إرسال طلب تعديل الشيفت للاعتماد'}
          </button>
        </div>
      </div>

      {/* ── 5. سجل ومتابعة طلبات التعديل السابقة ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋 سجل طلبات تعديل الشيفت والجدول السابقة</span>
            <span style={{ background: 'var(--surface-muted)', padding: '2px 8px', borderRadius: '99px', fontSize: '11px' }}>
              {adjustmentRequests.length} طلب
            </span>
          </h4>
        </div>

        {adjustmentRequests.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '12px', color: 'var(--muted)', fontSize: '13px' }}>
            لا توجد طلبات تعديل شيفت مرسلة سابقاً.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="bylaws-table" style={{ fontSize: '12.5px' }}>
              <thead>
                <tr>
                  <th>تاريخ الطلب</th>
                  <th>الأيام المطلوبة</th>
                  <th>نوع التعديل والتفاصيل</th>
                  <th>حالة مدير الفرع</th>
                  <th>حالة الإدارة العليا</th>
                  <th>الحالة النهائية</th>
                </tr>
              </thead>
              <tbody>
                {adjustmentRequests.map((req) => {
                  const isApproved = req.status === 'approved' || req.adminApproved;
                  const isRejected = req.status === 'rejected' || req.isRejected;
                  const isPending = !isApproved && !isRejected;

                  return (
                    <tr key={req.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {req.createdAt ? req.createdAt.slice(0, 10) : req.date}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {Array.isArray(req.dates) ? req.dates.join(', ') : req.date}
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        <div>{req.details || req.reason || 'تعديل شيفت'}</div>
                        {req.hasPenaltiesToWaive && (
                          <div style={{ fontSize: '11px', color: isApproved ? '#15803d' : '#ea580c', fontWeight: 700 }}>
                            {isApproved ? '✅ تم إسقاط جزاء التأخير المرتبط بنجاح' : '⚠️ يتضمن إسقاط جزاء تأخير عند الموافقة'}
                          </div>
                        )}
                      </td>
                      <td>
                        {req.managerStatus === 'skipped' || req.isDirectToAdmin ? (
                          <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>— تم التوجيه المباشر للإدارة</span>
                        ) : req.branchApproved ? (
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>✓ تمت الموافقة</span>
                        ) : req.branchRejected ? (
                          <span style={{ color: '#dc2626', fontWeight: 800 }}>✕ مرفوض</span>
                        ) : (
                          <span style={{ color: '#d97706', fontWeight: 700 }}>⏳ قيد المراجعة</span>
                        )}
                      </td>
                      <td>
                        {req.adminApproved ? (
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>✓ معتمد رسمياً</span>
                        ) : req.adminRejected ? (
                          <span style={{ color: '#dc2626', fontWeight: 800 }}>✕ مرفوض</span>
                        ) : (
                          <span style={{ color: '#d97706', fontWeight: 700 }}>⏳ بانتظار الاعتماد</span>
                        )}
                      </td>
                      <td>
                        {isApproved ? (
                          <span className="badge badge-success">🟢 معتمد وتم تحديث الجدول</span>
                        ) : isRejected ? (
                          <span className="badge badge-danger">🔴 مرفوض</span>
                        ) : (
                          <span className="badge badge-warning">🟡 قيد الانتظار</span>
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
    </div>
  );
}
