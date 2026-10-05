import React, { useState, useMemo, useEffect } from 'react';
import { getRealTodayStr } from '../../utils/timeEngine';
import { arabicWeekday, fmt } from '../../utils/formatters';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { dispatchEmployeeRequest } from '../../utils/requestSubmissionHelper';
import { getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { isPayrollPeriodFrozenForDate } from '../../utils/periodEngine';

export default function EmployeePunchEditRequestModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedBranchId
}) {
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState('single'); // 'single' | 'multiple'
  const [date, setDate] = useState(() => getRealTodayStr());
  const [startDate, setStartDate] = useState(() => getRealTodayStr());
  const [endDate, setEndDate] = useState(() => getRealTodayStr());
  const [excludeOffDays, setExcludeOffDays] = useState(true);
  const [punchType, setPunchType] = useState('full'); // 'full' | 'in' | 'out' | 'correction'
  const [timeIn, setTimeIn] = useState('09:00');
  const [timeOut, setTimeOut] = useState('17:00');
  const [breakHours, setBreakHours] = useState('0');
  const [reason, setReason] = useState('');
  const [branchId, setBranchId] = useState(() => selectedBranchId || emp?.branchId || emp?.branchesDetails?.[0]?.branchId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (selectedBranchId && !branchId) {
      setBranchId(selectedBranchId);
    }
  }, [selectedBranchId, branchId]);

  const empIdStr = String(emp?.id || '').trim();
  const empCodeStr = String(emp?.code || '').trim();

  // Branch details
  const empBranches = useMemo(() => {
    if (Array.isArray(emp?.branchesDetails) && emp.branchesDetails.length > 0) {
      return emp.branchesDetails.map((bd) => {
        const b = (state?.branches || []).find((br) => String(br.id) === String(bd.branchId));
        return {
          id: bd.branchId,
          name: b ? b.name : `فرع ${bd.branchId}`,
          salary: bd.salary,
          workHours: bd.workHoursPerDay
        };
      });
    }
    const singleB = (state?.branches || []).find((br) => String(br.id) === String(emp?.branchId));
    return [{
      id: emp?.branchId || 'main',
      name: singleB ? singleB.name : 'الفرع الأساسي',
      salary: emp?.salary,
      workHours: emp?.workHoursPerDay || 8
    }];
  }, [emp, state?.branches]);

  const currentBranchObj = useMemo(() => {
    return (state?.branches || []).find((b) => String(b.id) === String(branchId)) || null;
  }, [state?.branches, branchId]);

  // Live calculation for preview
  const previewCalc = useMemo(() => {
    const isCheckInOnly = punchType === 'in';
    const isCheckOutOnly = punchType === 'out';
    const bH = Math.max(0, parseFloat(breakHours) || 0);

    if (mode === 'single') {
      let gross = 0;
      let net = 0;
      if (!isCheckInOnly && timeIn && timeOut) {
        const [inH, inM] = timeIn.split(':').map(Number);
        const [outH, outM] = timeOut.split(':').map(Number);
        let diff = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
        if (diff < 0) diff += 24 * 60;
        gross = Math.round((diff / 60) * 100) / 100;
        net = Math.max(0, Math.round((gross - bH) * 100) / 100);
      }

      const daySched = getEmployeeDaySchedule(emp?.id, date, state);
      const profileHours = parseFloat(emp?.workHoursPerDay || emp?.workHours) || 8;
      let schedHours = profileHours;

      if (daySched && daySched.start && daySched.end && daySched.type !== 'off') {
        const [sH, sM] = daySched.start.split(':').map(Number);
        const [eH, eM] = daySched.end.split(':').map(Number);
        let sMins = sH * 60 + (sM || 0);
        let eMins = eH * 60 + (eM || 0);
        if (eMins <= sMins) eMins += 24 * 60;
        schedHours = Math.round(((eMins - sMins) / 60) * 100) / 100;
      }

      const regular = isCheckInOnly ? 0 : Math.min(net, schedHours);
      const overtime = isCheckInOnly ? 0 : Math.max(0, Math.round((net - schedHours) * 100) / 100);

      return {
        grossHours: gross,
        breakHours: bH,
        netHours: net,
        scheduledHours: schedHours,
        regularHours: regular,
        overtimeHours: overtime,
        isOffDay: daySched?.type === 'off' || daySched?.isOff === true
      };
    } else {
      // Multiple days estimate
      let count = 0;
      let cur = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(cur.getTime()) && !isNaN(end.getTime()) && cur <= end) {
        while (cur <= end && count < 60) {
          const dStr = cur.toISOString().slice(0, 10);
          const daySched = getEmployeeDaySchedule(emp?.id, dStr, state);
          const isOff = daySched?.type === 'off' || daySched?.isOff === true;
          if (!(excludeOffDays && isOff)) {
            count++;
          }
          cur.setDate(cur.getDate() + 1);
        }
      }

      let dailyGross = 0;
      let dailyNet = 0;
      if (!isCheckInOnly && timeIn && timeOut) {
        const [inH, inM] = timeIn.split(':').map(Number);
        const [outH, outM] = timeOut.split(':').map(Number);
        let diff = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
        if (diff < 0) diff += 24 * 60;
        dailyGross = Math.round((diff / 60) * 100) / 100;
        dailyNet = Math.max(0, Math.round((dailyGross - bH) * 100) / 100);
      }

      return {
        daysCount: count,
        dailyNetHours: dailyNet,
        totalNetHours: Math.round(dailyNet * count * 100) / 100
      };
    }
  }, [mode, date, startDate, endDate, excludeOffDays, punchType, timeIn, timeOut, breakHours, emp, state]);

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      showToast?.('يرجى كتابة سبب طلب تعديل البصمة أو بيان المهمة الإدارية');
      return;
    }

    if (mode === 'single' && !date) {
      showToast?.('يرجى تحديد تاريخ البصمة');
      return;
    }

    if (mode === 'multiple' && (!startDate || !endDate || startDate > endDate)) {
      showToast?.('يرجى تحديد فترة تواريخ صحيحة');
      return;
    }

    // Freeze check
    const checkDate = mode === 'single' ? date : startDate;
    const freeze = isPayrollPeriodFrozenForDate(checkDate, state?.orgSettings || {});
    if (freeze.isFrozen) {
      showToast?.(freeze.reason || `فترة شهر ${freeze.month} مغلقة ومجمدة رسمياً`);
      return;
    }

    setIsSubmitting(true);
    try {
      const isCheckInOnly = punchType === 'in';
      const isCheckOutOnly = punchType === 'out';
      const targetBId = branchId || emp?.branchId || empBranches[0]?.id || 'main';
      const bObj = (state?.branches || []).find(b => String(b.id) === String(targetBId));
      const bName = bObj ? bObj.name : (empBranches.find(b => String(b.id) === String(targetBId))?.name || 'الفرع');

      const reqId = `req_admin_punch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      let newReq = null;
      let newNotif = null;

      if (mode === 'multiple') {
        const daysList = [];
        let cur = new Date(startDate);
        const end = new Date(endDate);
        while (cur <= end && daysList.length < 60) {
          const dStr = cur.toISOString().slice(0, 10);
          const daySched = getEmployeeDaySchedule(emp?.id, dStr, state);
          const isOff = daySched?.type === 'off' || daySched?.isOff === true;
          if (!(excludeOffDays && isOff)) {
            daysList.push({
              date: dStr,
              dayName: arabicWeekday(dStr),
              timeIn,
              timeOut: isCheckInOnly ? '' : timeOut,
              breakHours: parseFloat(breakHours) || 0,
              punchType,
              netHours: previewCalc.dailyNetHours || 0
            });
          }
          cur.setDate(cur.getDate() + 1);
        }

        if (daysList.length === 0) {
          showToast?.('لا توجد أيام عمل محددة ضمن الفترة (يرجى مراجعة خيار استبعاد الراحات)');
          setIsSubmitting(false);
          return;
        }

        newReq = {
          id: reqId,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.code,
          jobTitle: emp.jobTitle || 'وظيفة إدارية',
          branchId: targetBId,
          branchName: bName,
          type: 'punch_correction',
          subType: 'administrative_punch_request',
          punchType,
          isAdministrativePunch: true,
          isMultiDay: true,
          daysCount: daysList.length,
          startDate,
          endDate,
          date: startDate,
          dates: daysList.map(d => d.date),
          batchDays: daysList,
          timeIn,
          timeOut: isCheckInOnly ? '' : timeOut,
          breakHours: parseFloat(breakHours) || 0,
          hours: previewCalc.totalNetHours,
          netHours: previewCalc.totalNetHours,
          actualWorkedHours: previewCalc.totalNetHours,
          regularHours: previewCalc.totalNetHours,
          typeLabel: `طلب تعديل بصمة إداري (${daysList.length} أيام)`,
          reason: reason.trim(),
          details: `طلب تعديل بصمات لوظيفة إدارية (${emp.jobTitle || 'إداري'}) لعدد ${daysList.length} أيام من ${startDate} إلى ${endDate} بإجمالي ${previewCalc.totalNetHours} س | الفرع: ${bName} | السبب: ${reason.trim()}`,
          status: 'pending_admin',
          branchApproved: true, // Since submitted by the administrative staff member themselves
          adminApproved: false,
          targetApproval: 'admin_only',
          submittedByEmployee: true,
          createdAt: new Date().toISOString()
        };

        newNotif = {
          id: `notif_${reqId}`,
          requestId: reqId,
          type: 'punch_correction',
          title: `🖐️ طلب تعديل بصمة إداري: ${emp.name} (${daysList.length} أيام)`,
          message: `قدم ${emp.name} (${emp.jobTitle || 'وظيفة إدارية'}) طلب تعديل بصمات لعدة أيام (${daysList.length} أيام من ${startDate} إلى ${endDate}) بفرع ${bName}.`,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.code,
          branchId: targetBId,
          branchName: bName,
          date: startDate,
          timestamp: new Date().toISOString(),
          read: false,
          targetRole: 'admin'
        };
      } else {
        // Single Day
        newReq = {
          id: reqId,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.code,
          jobTitle: emp.jobTitle || 'وظيفة إدارية',
          branchId: targetBId,
          branchName: bName,
          type: 'punch_correction',
          subType: 'administrative_punch_request',
          punchType,
          isAdministrativePunch: true,
          isMultiDay: false,
          date,
          startDate: date,
          endDate: date,
          timeIn,
          timeOut: isCheckInOnly ? '' : timeOut,
          breakHours: parseFloat(breakHours) || 0,
          grossHours: previewCalc.grossHours,
          netHours: previewCalc.netHours,
          actualWorkedHours: previewCalc.netHours,
          hours: previewCalc.netHours,
          regularHours: previewCalc.regularHours,
          overtimeHours: previewCalc.overtimeHours,
          overtimeStatus: previewCalc.overtimeHours > 0 ? 'pending' : 'none',
          scheduledHours: previewCalc.scheduledHours,
          typeLabel: isCheckInOnly ? 'طلب إثبات حضور إداري' : (isCheckOutOnly ? 'طلب إثبات انصراف إداري' : 'طلب تعديل بصمة إداري'),
          reason: reason.trim(),
          details: `طلب تعديل بصمة لوظيفة إدارية (${emp.jobTitle || 'إداري'}) بتاريخ ${date} (${isCheckInOnly ? `حضور ${timeIn}` : `${timeIn} إلى ${timeOut} | صافي ${previewCalc.netHours} س`}) | الفرع: ${bName} | السبب: ${reason.trim()}`,
          status: 'pending_admin',
          branchApproved: true,
          adminApproved: false,
          targetApproval: 'admin_only',
          submittedByEmployee: true,
          createdAt: new Date().toISOString()
        };

        newNotif = {
          id: `notif_${reqId}`,
          requestId: reqId,
          type: 'punch_correction',
          title: `🖐️ طلب تعديل بصمة إداري: ${emp.name}`,
          message: `قدم ${emp.name} (${emp.jobTitle || 'وظيفة إدارية'}) طلب تعديل بصمة بتاريخ ${date} (${timeIn} - ${isCheckInOnly ? 'حضور' : timeOut}) بفرع ${bName}.`,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.code,
          branchId: targetBId,
          branchName: bName,
          date,
          timestamp: new Date().toISOString(),
          read: false,
          targetRole: 'admin'
        };
      }

      await dispatchEmployeeRequest({
        request: newReq,
        notification: newNotif,
        state,
        setState,
        saveState,
        showToast,
        successMessage: '✅ تم إرسال طلب تعديل البصمة بنجاح للإدارة العليا للاعتماد المباشر',
        notifyAdmin: () => {
          notifyAdminOnNewRequest({
            state,
            newRequest: newReq,
            empName: emp.name,
            branchName: bName
          });
        }
      });

      setShowForm(false);
      setReason('');
      setTimeIn('09:00');
      setTimeOut('17:00');
      setBreakHours('0');
      setDate(getRealTodayStr());
      setStartDate(getRealTodayStr());
      setEndDate(getRealTodayStr());
    } catch (err) {
      console.error('Error submitting administrative punch request:', err);
      showToast?.('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter employee's own punch requests
  const myPunchRequests = useMemo(() => {
    const list = (state?.requests || []).filter((r) => {
      if (!r || !r.id) return false;
      const rEmpId = String(r.employeeId || '');
      const rEmpCode = String(r.employeeCode || '');
      const isEmp = (empIdStr && (rEmpId === empIdStr || rEmpCode === empIdStr)) ||
                    (empCodeStr && (rEmpId === empCodeStr || rEmpCode === empCodeStr));
      if (!isEmp) return false;

      const isPunch = r.type === 'punch_correction' ||
                      r.type === 'attendance_punch' ||
                      r.type === 'manual_punch_request' ||
                      r.isAdministrativePunch === true ||
                      r.subType === 'administrative_punch_request';
      return isPunch;
    });

    return list.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  }, [state?.requests, empIdStr, empCodeStr]);

  const filteredRequests = useMemo(() => {
    return myPunchRequests.filter((r) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending') {
        return r.status === 'pending' || r.status === 'pending_admin' || (!r.adminApproved && r.status !== 'rejected');
      }
      if (statusFilter === 'approved') {
        return r.status === 'approved' || r.adminApproved;
      }
      if (statusFilter === 'rejected') {
        return r.status === 'rejected' || r.adminDecision === 'rejected';
      }
      return true;
    });
  }, [myPunchRequests, statusFilter]);

  const getStatusBadge = (r) => {
    const isApp = r.status === 'approved' || r.adminApproved;
    const isRej = r.status === 'rejected' || r.adminDecision === 'rejected';
    if (isApp) {
      return (
        <span className="approval-status-badge approved" style={{ fontSize: '11px', padding: '3px 8px' }}>
          🟢 معتمد من الإدارة العليا
        </span>
      );
    }
    if (isRej) {
      return (
        <span className="approval-status-badge rejected" style={{ fontSize: '11px', padding: '3px 8px' }}>
          🔴 مرفوض
        </span>
      );
    }
    return (
      <span className="approval-status-badge pending" style={{ fontSize: '11px', padding: '3px 8px' }}>
        ⏳ قيد مراجعة الإدارة العليا
      </span>
    );
  };

  return (
    <div className="card settings-card fade-in" style={{ padding: isMobileScreen ? '14px' : '22px' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>🖐️</span>
            <h3 style={{ margin: 0, fontSize: isMobileScreen ? '16px' : '18px', color: 'var(--primary-dark)', fontWeight: '800' }}>
              إرسال تعديل بصمة (للوظائف الإدارية)
            </h3>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
            مخصص لشاغلي الوظائف الإدارية ومديري الفروع والمشتريات لتقديم طلبات تسجيل وتعديل البصمات للإدارة العليا مباشرة.
          </p>
        </div>

        <button
          className="btn btn-start"
          onClick={() => setShowForm(!showForm)}
          style={{ padding: '8px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {showForm ? '✕ إغلاق النموذج' : '+ تقديم طلب تعديل بصمة جديد'}
        </button>
      </div>

      {/* Submission Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="fade-in" style={{
          background: 'var(--surface-muted, #f8fafc)',
          border: '1.5px solid var(--primary-tint, #99f6e4)',
          borderRadius: '14px',
          padding: isMobileScreen ? '14px' : '20px',
          marginBottom: '24px'
        }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '14px', color: 'var(--primary)', fontWeight: '800' }}>
            📝 نموذج تقديم طلب تعديل / إثبات بصمة
          </h4>

          {/* Mode Selector */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button
              type="button"
              className={`btn ${mode === 'single' ? 'btn-start' : 'btn-ghost'}`}
              style={{ flex: 1, padding: '7px 0', fontSize: '12.5px', border: mode === 'single' ? 'none' : '1px solid var(--border)' }}
              onClick={() => setMode('single')}
            >
              📅 يوم محدد
            </button>
            <button
              type="button"
              className={`btn ${mode === 'multiple' ? 'btn-start' : 'btn-ghost'}`}
              style={{ flex: 1, padding: '7px 0', fontSize: '12.5px', border: mode === 'multiple' ? 'none' : '1px solid var(--border)' }}
              onClick={() => setMode('multiple')}
            >
              🗓️ عدة أيام متتالية (فترة)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobileScreen ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            {/* Dates */}
            {mode === 'single' ? (
              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>التاريخ *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>من تاريخ *</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>إلى تاريخ *</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                  />
                </div>
              </>
            )}

            {/* Branch */}
            <div className="field">
              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>الفرع المعني بالبصمة *</label>
              {empBranches.length > 1 ? (
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                >
                  {empBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                  🏢 {currentBranchObj ? currentBranchObj.name : empBranches[0]?.name || 'الفرع الأساسي'}
                </div>
              )}
            </div>

            {/* Punch Type */}
            <div className="field">
              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>نوع التعديل *</label>
              <select
                value={punchType}
                onChange={(e) => setPunchType(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              >
                <option value="full">وردية كاملة (حضور وانصراف)</option>
                <option value="in">تسجيل حضور فقط</option>
                <option value="out">تسجيل انصراف فقط</option>
                <option value="correction">تصحيح وتعديل مواعيد وردية مسجلة</option>
              </select>
            </div>
          </div>

          {/* Times and Break */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobileScreen ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            {punchType !== 'out' && (
              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>وقت الحضور *</label>
                <input
                  type="time"
                  value={timeIn}
                  onChange={(e) => setTimeIn(e.target.value)}
                  required
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>
            )}

            {punchType !== 'in' && (
              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>وقت الانصراف *</label>
                <input
                  type="time"
                  value={timeOut}
                  onChange={(e) => setTimeOut(e.target.value)}
                  required
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>
            )}

            {punchType !== 'in' && (
              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>ساعات الاستراحة (بريك)</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="4"
                  value={breakHours}
                  onChange={(e) => setBreakHours(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>
            )}

            {mode === 'multiple' && (
              <div className="field" style={{ display: 'flex', alignItems: 'center', paddingTop: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 'bold' }}>
                  <input
                    type="checkbox"
                    checked={excludeOffDays}
                    onChange={(e) => setExcludeOffDays(e.target.checked)}
                  />
                  استبعاد أيام الراحات الأسبوعية (OFF)
                </label>
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="field" style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>سبب التعديل أو المأمورية الإدارية *</label>
            <textarea
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: مأمورية عمل خارجية للمشتريات / عطل بجهاز البصمة / اجتماع إدارة الفروع..."
              required
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', lineHeight: 1.4 }}
            />
          </div>

          {/* Live Preview Box */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '12.5px'
          }}>
            <div style={{ fontWeight: '800', color: 'var(--primary-dark)', marginBottom: '6px' }}>
              📊 معاينة احتساب الساعات للطلب:
            </div>
            {mode === 'single' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', color: 'var(--text)' }}>
                <span>إجمالي الساعات: <strong>{previewCalc.grossHours} س</strong></span>
                <span>البريك: <strong>{previewCalc.breakHours} س</strong></span>
                <span>صافي العمل: <strong style={{ color: 'var(--primary)' }}>{previewCalc.netHours} س</strong></span>
                <span>المقرر بالجدول: <strong>{previewCalc.scheduledHours} س</strong></span>
                {previewCalc.overtimeHours > 0 && (
                  <span style={{ color: '#b45309', fontWeight: 'bold' }}>⭐ إضافي محتسب: +{previewCalc.overtimeHours} س</span>
                )}
                {previewCalc.isOffDay && (
                  <span style={{ color: '#dc2626', fontWeight: 'bold' }}>⚠️ هذا اليوم مسجل كيوم راحة بالجدول</span>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', color: 'var(--text)' }}>
                <span>عدد أيام العمل المحسوبة: <strong>{previewCalc.daysCount} أيام</strong></span>
                <span>صافي اليوم الواحد: <strong>{previewCalc.dailyNetHours} س</strong></span>
                <span>إجمالي الساعات للفترة: <strong style={{ color: 'var(--primary)' }}>{previewCalc.totalNetHours} س</strong></span>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowForm(false)}
              disabled={isSubmitting}
              style={{ padding: '8px 18px', fontSize: '13px' }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-start"
              disabled={isSubmitting}
              style={{ padding: '8px 24px', fontSize: '13px', fontWeight: 'bold' }}
            >
              {isSubmitting ? 'جاري الإرسال...' : '📤 إرسال طلب التعديل للإدارة العليا'}
            </button>
          </div>
        </form>
      )}

      {/* History Filter and Table */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '14.5px', color: '#1e293b', fontWeight: '800' }}>
            📋 سجل طلبات تعديل البصمات الخاصة بك ({filteredRequests.length})
          </h4>

          <div style={{ display: 'flex', gap: '6px' }}>
            {['all', 'pending', 'approved', 'rejected'].map((st) => {
              const labels = { all: 'الكل', pending: 'قيد المراجعة', approved: 'المعتمدة', rejected: 'المرفوضة' };
              return (
                <button
                  key={st}
                  type="button"
                  className={`btn ${statusFilter === st ? 'btn-start' : 'btn-ghost'}`}
                  style={{ padding: '4px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                  onClick={() => setStatusFilter(st)}
                >
                  {labels[st]}
                </button>
              );
            })}
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', fontSize: '13px' }}>
            لا توجد طلبات تعديل بصمة مسجلة تطابق التحديد.
          </div>
        ) : isMobileScreen ? (
          /* Mobile Card View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredRequests.map((r) => (
              <div key={r.id} style={{
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '12px',
                background: 'var(--surface)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '13px' }}>{r.typeLabel || 'طلب تعديل بصمة'}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      {r.isMultiDay ? `فترة: ${r.startDate} إلى ${r.endDate} (${r.daysCount || r.dates?.length} أيام)` : `تاريخ: ${r.date || r.startDate}`}
                    </div>
                  </div>
                  <div>
                    {getStatusBadge(r)}
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text)', background: 'var(--surface-muted)', padding: '6px 10px', borderRadius: '6px', margin: '8px 0' }}>
                  {r.reason || r.details || '—'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)' }}>
                  <span>🏢 {r.branchName || 'الفرع'}</span>
                  <span>ساعات: <strong>{r.netHours || r.hours || 0} س</strong> {parseFloat(r.overtimeHours) > 0 ? `(إضافي: +${r.overtimeHours} س)` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>تاريخ الطلب</th>
                  <th>الفترة / اليوم</th>
                  <th>الفرع</th>
                  <th>المواعيد والساعات</th>
                  <th>السبب والمبرر</th>
                  <th>الحالة والاعتماد</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: '12px' }}>{r.createdAt ? r.createdAt.slice(0, 10) : '—'}</td>
                    <td style={{ fontWeight: '700' }}>
                      {r.isMultiDay ? (
                        <span>{r.startDate} ➔ {r.endDate} <span style={{ fontSize: '11px', color: 'var(--muted)' }}>({r.daysCount || r.dates?.length} أيام)</span></span>
                      ) : (
                        <span>{r.date || r.startDate} ({arabicWeekday(r.date || r.startDate)})</span>
                      )}
                    </td>
                    <td>{r.branchName || '—'}</td>
                    <td style={{ fontSize: '12px' }}>
                      <div>{r.timeIn || '—'} ➔ {r.timeOut || '—'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        صافي: <strong>{r.netHours || r.hours || 0} س</strong> {parseFloat(r.overtimeHours) > 0 ? `| إضافي: +${r.overtimeHours} س` : ''}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', maxWidth: '240px' }}>
                      {r.reason || r.details || '—'}
                    </td>
                    <td>{getStatusBadge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
