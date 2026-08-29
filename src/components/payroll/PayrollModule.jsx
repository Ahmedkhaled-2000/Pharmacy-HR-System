import React, { useState, useEffect } from 'react';
import PayslipPrintModal from './PayslipPrintModal';
import { fmt, getEmpDisplayName } from '../../utils/formatters';
import { computeLatenessFinancialAmount, isApprovedPermissionForDate } from '../../utils/latePenaltyEngine';
import { printEmployeePayslipDirect } from '../../utils/printHelper';
import { getCycleDateRange } from '../../utils/periodEngine';
import { useUI } from '../../context/UIContext';

export default function PayrollModule({
  state,
  setState,
  saveState,
  monthPicker,
  setMonthPicker,
  exportAllPayrollExcel,
  exportEmpExcel,
  showToast
}) {
  const { showConfirm } = useUI();
  const [selectedEmpModal, setSelectedEmpModal] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBranch, setFilterBranch] = useState('');

  // Monthly Payout Cutoff Period Settings
  const [periodType, setPeriodType] = useState(() => {
    try {
      return localStorage.getItem('payroll_period_type') || state.orgSettings?.payrollPeriodType || 'cycle';
    } catch { return 'cycle'; }
  });

  const [payoutStartDay, setPayoutStartDay] = useState(() => {
    try {
      const v = localStorage.getItem('payroll_payout_start_day');
      if (v !== null) return parseInt(v, 10);
    } catch {}
    return state.orgSettings?.payrollPayoutStartDay !== undefined ? state.orgSettings.payrollPayoutStartDay : 26;
  });

  const [payoutEndDay, setPayoutEndDay] = useState(() => {
    try {
      const v = localStorage.getItem('payroll_payout_end_day');
      if (v !== null) return parseInt(v, 10);
    } catch {}
    return state.orgSettings?.payrollPayoutEndDay !== undefined ? state.orgSettings.payrollPayoutEndDay : 25;
  });

  const [customFrom, setCustomFrom] = useState(() => {
    try {
      return localStorage.getItem('payroll_custom_from') || state.orgSettings?.payrollCustomFrom || '';
    } catch { return ''; }
  });

  const [customTo, setCustomTo] = useState(() => {
    try {
      return localStorage.getItem('payroll_custom_to') || state.orgSettings?.payrollCustomTo || '';
    } catch { return ''; }
  });

  const [payoutStartTime, setPayoutStartTime] = useState(() => {
    try {
      return localStorage.getItem('payroll_payout_start_time') || state.orgSettings?.payrollPayoutStartTime || '00:00';
    } catch { return '00:00'; }
  });

  const [payoutEndTime, setPayoutEndTime] = useState(() => {
    try {
      return localStorage.getItem('payroll_payout_end_time') || state.orgSettings?.payrollPayoutEndTime || '03:00';
    } catch { return '03:00'; }
  });

  const isPeriodFrozen = Boolean(state.orgSettings?.payrollPeriodFrozen?.[monthPicker]?.isFrozen || state.orgSettings?.isPeriodFrozen);

  useEffect(() => {
    const sDay = state.orgSettings?.payrollPayoutStartDay !== undefined 
      ? state.orgSettings.payrollPayoutStartDay 
      : (() => { try { const v = localStorage.getItem('payroll_payout_start_day'); return v !== null && v !== '' ? parseInt(v, 10) : 21; } catch { return 21; } })();
    const eDay = state.orgSettings?.payrollPayoutEndDay !== undefined 
      ? state.orgSettings.payrollPayoutEndDay 
      : (() => { try { const v = localStorage.getItem('payroll_payout_end_day'); return v !== null && v !== '' ? parseInt(v, 10) : 20; } catch { return 20; } })();
    const sTime = state.orgSettings?.payrollPayoutStartTime || (() => { try { return localStorage.getItem('payroll_payout_start_time') || '00:00'; } catch { return '00:00'; } })();
    const eTime = state.orgSettings?.payrollPayoutEndTime || (() => { try { return localStorage.getItem('payroll_payout_end_time') || '03:00'; } catch { return '03:00'; } })();
    const pType = state.orgSettings?.payrollPeriodType || (() => { try { return localStorage.getItem('payroll_period_type') || 'cycle'; } catch { return 'cycle'; } })();
    const cFrom = state.orgSettings?.payrollCustomFrom || (() => { try { return localStorage.getItem('payroll_custom_from') || ''; } catch { return ''; } })();
    const cTo = state.orgSettings?.payrollCustomTo || (() => { try { return localStorage.getItem('payroll_custom_to') || ''; } catch { return ''; } })();

    setPayoutStartDay(sDay);
    setPayoutEndDay(eDay);
    setPayoutStartTime(sTime);
    setPayoutEndTime(eTime);
    setPeriodType(pType);
    setCustomFrom(cFrom);
    setCustomTo(cTo);
  }, [state.orgSettings?.payrollPayoutStartDay, state.orgSettings?.payrollPayoutEndDay, state.orgSettings?.payrollPayoutStartTime, state.orgSettings?.payrollPayoutEndTime, state.orgSettings?.payrollPeriodType, state.orgSettings?.payrollCustomFrom, state.orgSettings?.payrollCustomTo]);

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (filterBranch && emp.branchId !== filterBranch && (!emp.branchesDetails || !emp.branchesDetails.some((bd) => bd.branchId === filterBranch))) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name?.toLowerCase().includes(q);
      const matchNickname = emp.nickname?.toLowerCase().includes(q);
      const matchCode = emp.code?.includes(q);
      if (!matchName && !matchNickname && !matchCode) return false;
    }
    return true;
  });

  const handleSavePeriodSettings = async (newType, sVal, eVal, fromVal, toVal, sTimeVal = '00:00', eTimeVal = '03:00') => {
    const updatedSettings = {
      ...(state.orgSettings || {}),
      payrollPeriodType: newType,
      payrollPayoutStartDay: parseInt(sVal, 10) || 21,
      payrollPayoutEndDay: parseInt(eVal, 10) || 20,
      payrollPayoutStartTime: sTimeVal || '00:00',
      payrollPayoutEndTime: eTimeVal || '03:00',
      payrollPayoutDay: parseInt(eVal, 10) || 20,
      payrollCustomFrom: fromVal || '',
      payrollCustomTo: toVal || ''
    };

    setPeriodType(newType);
    setPayoutStartDay(parseInt(sVal, 10) || 21);
    setPayoutEndDay(parseInt(eVal, 10) || 20);
    setPayoutStartTime(sTimeVal || '00:00');
    setPayoutEndTime(eTimeVal || '03:00');
    setCustomFrom(fromVal || '');
    setCustomTo(toVal || '');

    try {
      localStorage.setItem('payroll_period_type', newType);
      localStorage.setItem('payroll_payout_start_day', String(sVal));
      localStorage.setItem('payroll_payout_end_day', String(eVal));
      localStorage.setItem('payroll_payout_start_time', sTimeVal || '00:00');
      localStorage.setItem('payroll_payout_end_time', eTimeVal || '03:00');
      if (fromVal) localStorage.setItem('payroll_custom_from', fromVal);
      if (toVal) localStorage.setItem('payroll_custom_to', toVal);
    } catch (e) {
      console.warn('Could not save payroll cutoff to localStorage:', e);
    }

    const updatedState = { ...state, orgSettings: updatedSettings };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    
    if (newType === 'custom') {
      showToast?.(`✅ تم حفظ وتطبيق الفترة اليدوية المخصصة (من ${fromVal} إلى ${toVal}) على رواتب المنظومة وصفحة الموظف بنجاح`);
    } else {
      showToast?.(`✅ تم حفظ وتثبيت الدورة الشهرية (من يوم ${sVal} الساعة ${sTimeVal} حتى يوم ${eVal} الساعة ${eTimeVal}) بنجاح`);
    }
  };

  const handleToggleFreezePeriod = async () => {
    const nextStatus = !isPeriodFrozen;
    const confirmMsg = nextStatus
      ? `هل أنت متأكد من إغلاق وتجميد دورة رواتب شهر (${monthPicker})؟\nسيتم قفل تعديل البصمات والخصومات لضمان عدم تغيير المستحقات المصروفة.`
      : `هل ترغب في فك تجميد دورة رواتب شهر (${monthPicker}) للسماح بالتعديلات من الإدارة؟`;

    const isConfirmed = await showConfirm({
      title: nextStatus ? 'إغلاق وتجميد الرواتب' : 'فك تجميد الرواتب',
      message: confirmMsg,
      confirmText: nextStatus ? 'تأكيد التجميد' : 'تأكيد فك التجميد',
      cancelText: 'إلغاء وتراجع',
      type: nextStatus ? 'danger' : 'info',
      icon: nextStatus ? '🔒' : '🔓'
    });
    if (!isConfirmed) return;

    const frozenMap = { ...(state.orgSettings?.payrollPeriodFrozen || {}) };
    frozenMap[monthPicker] = {
      isFrozen: nextStatus,
      frozenAt: new Date().toISOString(),
      frozenBy: 'الإدارة العليا'
    };

    const updatedSettings = {
      ...(state.orgSettings || {}),
      payrollPeriodFrozen: frozenMap
    };

    const updatedState = { ...state, orgSettings: updatedSettings };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast?.(nextStatus ? `🔒 تم تجميد دورة رواتب شهر (${monthPicker}) بنجاح` : `🔓 تم فك تجميد دورة رواتب شهر (${monthPicker})`);
  };

  // Helper to compute date range description for active settings via Period Engine
  const getPeriodDesc = () => {
    const range = getCycleDateRange(monthPicker, state.orgSettings);
    return `${range.label} (${payoutStartTime} إلى ${payoutEndTime})`;
  };

  const getPayrollRangeObj = () => {
    return getCycleDateRange(monthPicker, state.orgSettings);
  };

  const payrollFilterFn = (d) => {
    if (!d) return false;
    const cleanDate = String(d).slice(0, 10);
    const range = getPayrollRangeObj();
    if (range) {
      return cleanDate >= range.startDate && cleanDate <= range.endDate;
    }
    return cleanDate.startsWith(monthPicker);
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            💰 إدارة كشوف رواتب الموظفين وإصدار الـ PDF
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            احتساب الاستحقاقات والخصومات والمكافآت وتحديد بداية ونهاية فترة تقفيل الرواتب الشهري
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-start" onClick={exportAllPayrollExcel}>
            📊 تصدير شيت إكسيل الرواتب الشامل
          </button>
        </div>
      </div>

      {/* Payout Period Cutoff Setting Card */}
      <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '18px 22px', borderRadius: '14px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>🗓️ تحديد فترة إصدار وتقفيل الرواتب الشهري الثابت واليدوي</h4>
            <span style={{ fontSize: '13px', opacity: 0.95 }}>
              الفترة النشطة المعتمدة للرواتب وصفحة الموظف: <strong style={{ textDecoration: 'underline', color: '#fef08a' }}>{getPeriodDesc()}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => handleSavePeriodSettings('cycle', payoutStartDay, payoutEndDay, customFrom, customTo)}
              style={{
                border: 'none',
                background: periodType === 'cycle' ? '#fff' : 'transparent',
                color: periodType === 'cycle' ? '#0f766e' : '#fff',
                fontWeight: 'bold',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              📅 دورة شهرية بالأيام
            </button>
            <button
              type="button"
              onClick={() => handleSavePeriodSettings('custom', payoutStartDay, payoutEndDay, customFrom || `${monthPicker}-01`, customTo || `${monthPicker}-30`)}
              style={{
                border: 'none',
                background: periodType === 'custom' ? '#fff' : 'transparent',
                color: periodType === 'custom' ? '#0f766e' : '#fff',
                fontWeight: 'bold',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              📆 فترة مخصصة يدوياً (من - إلى)
            </button>
          </div>
        </div>

        {/* Freeze Period Alert / Action Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isPeriodFrozen ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0,0,0,0.15)', padding: '10px 16px', borderRadius: '10px', flexWrap: 'wrap', gap: '10px', border: isPeriodFrozen ? '1px solid #fca5a5' : '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>{isPeriodFrozen ? '🔒' : '🔓'}</span>
            <div>
              <span style={{ fontWeight: '800', fontSize: '13.5px', color: isPeriodFrozen ? '#fee2e2' : '#fff' }}>
                حالة دورة رواتب شهر ({monthPicker}): {isPeriodFrozen ? 'مغلقة ومجمدة رسمياً' : 'مفتوحة وقابلة للتعديل'}
              </span>
              <div style={{ fontSize: '11.5px', opacity: 0.9 }}>
                {isPeriodFrozen ? 'تم قفل تعديل البصمات والخصومات لهذا الشهر لضمان عدم تغيير المستحقات المصروفة' : 'يمكن للإدارة ومدراء الفروع تسجيل وتعديل البصمات والجزاءات'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleFreezePeriod}
            style={{
              background: isPeriodFrozen ? '#22c55e' : '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 16px',
              fontWeight: '800',
              fontSize: '12.5px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
            }}
          >
            {isPeriodFrozen ? '🔓 فك تجميد دورة الرواتب' : '🔒 إغلاق وتجميد دورة الرواتب'}
          </button>
        </div>

        {periodType === 'cycle' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.1)', padding: '14px 18px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              {/* Start Cutoff */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.15)', padding: '8px 14px', borderRadius: '10px' }}>
                <span style={{ fontSize: '15px' }}>🚩</span>
                <label style={{ fontSize: '13px', fontWeight: 'bold' }}>من يوم (الشهر السابق):</label>
                <select
                  value={payoutStartDay}
                  onChange={(e) => handleSavePeriodSettings('cycle', e.target.value, payoutEndDay, customFrom, customTo, payoutStartTime, payoutEndTime)}
                  style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold', fontSize: '13px' }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>يوم {d}</option>
                  ))}
                </select>

                <label style={{ fontSize: '13px', fontWeight: 'bold', marginRight: '6px' }}>الساعة:</label>
                <input
                  type="time"
                  value={payoutStartTime}
                  onChange={(e) => handleSavePeriodSettings('cycle', payoutStartDay, payoutEndDay, customFrom, customTo, e.target.value, payoutEndTime)}
                  style={{ padding: '4px 8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold', fontSize: '13px' }}
                />
              </div>

              {/* End Cutoff */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.15)', padding: '8px 14px', borderRadius: '10px' }}>
                <span style={{ fontSize: '15px' }}>🏁</span>
                <label style={{ fontSize: '13px', fontWeight: 'bold' }}>إلى يوم (الشهر الحالي):</label>
                <select
                  value={payoutEndDay}
                  onChange={(e) => handleSavePeriodSettings('cycle', payoutStartDay, e.target.value, customFrom, customTo, payoutStartTime, payoutEndTime)}
                  style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold', fontSize: '13px' }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>يوم {d}</option>
                  ))}
                </select>

                <label style={{ fontSize: '13px', fontWeight: 'bold', marginRight: '6px' }}>الساعة:</label>
                <input
                  type="time"
                  value={payoutEndTime}
                  onChange={(e) => handleSavePeriodSettings('cycle', payoutStartDay, payoutEndDay, customFrom, customTo, payoutStartTime, e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ fontSize: '12px', opacity: 0.95, color: '#fef08a' }}>
              ⚡ <strong>نظام الترحيل التلقائي:</strong> عند حلول موعد نهاية الدورة (يوم {payoutEndDay} الساعة {payoutEndTime}) يتم تلقائياً ترحيل وتجديد التصفية لبدء دورة الشهر الجديد في صفحة الموظف وشاشات الإدارة.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>من تاريخ:</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>إلى تاريخ:</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0f766e', fontWeight: 'bold', fontSize: '13px' }}
              />
            </div>

            <button
              type="button"
              onClick={() => handleSavePeriodSettings('custom', payoutStartDay, payoutEndDay, customFrom, customTo, payoutStartTime)}
              style={{
                border: 'none',
                background: '#fef08a',
                color: '#854d0e',
                fontWeight: '900',
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              💾 تطبيق وحفظ الفترة يدوياً
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 بحث بالاسم أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', width: '220px' }}
          />

          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}
          >
            <option value="">🏢 جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>شهر التقرير:</label>
          <input
            type="month"
            value={monthPicker}
            onChange={(e) => setMonthPicker(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
          />
        </div>
      </div>

      {/* Employees Payroll Table */}
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>ساعات العمل بالفترة</th>
              <th>المكافآت</th>
              <th>الخصومات والغيابات</th>
              <th>صافي المرتب المستحق للفترة</th>
              <th>العمليات والطباعة</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;
                let branchNameDisplay = branches.find((br) => br.id === emp.branchId)?.name || 'المركز الرئيسي';

                if (isMultiBranch) {
                  if (filterBranch) {
                    const targetB = branches.find((br) => br.id === filterBranch);
                    branchNameDisplay = targetB?.name || 'فرع مخصص';
                  } else {
                    branchNameDisplay = emp.branchesDetails.map((bd) => {
                      const brObj = branches.find((br) => br.id === bd.branchId);
                      return brObj?.name || bd.branchId;
                    }).join(' + ');
                  }
                }

                const empSum = state.computeEmpSummary
                  ? state.computeEmpSummary(emp.id, payrollFilterFn, monthPicker, filterBranch || null)
                  : { hours: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, approvedOvertimeHours: 0, overtimeEarnings: 0 };

                const totalDed = (empSum.totalDeduction || 0) + (empSum.absenceDeduction || 0);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>
                      <div>{getEmpDisplayName(emp)}</div>
                      {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'normal' }}>
                          الاسم الرسمي: {emp.name}
                        </div>
                      )}
                    </td>
                    <td>{branchNameDisplay}</td>
                    <td>
                      <strong style={{ color: '#0f766e' }}>{empSum.hours || 0} س أساسي</strong>
                      {empSum.approvedOvertimeHours > 0 && (
                        <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 'bold' }}>
                          ⭐ +{empSum.approvedOvertimeHours} س إضافي (+{fmt(empSum.overtimeEarnings)} ج.م)
                        </div>
                      )}
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>({fmt(empSum.baseEarnings)} ج.م أساسي)</div>
                    </td>
                    <td style={{ color: '#16a34a', fontWeight: '700' }}>
                      {empSum.totalBonus > 0 ? `+${fmt(empSum.totalBonus)} ج.م` : '0 ج.م'}
                    </td>
                    <td style={{ color: '#dc2626', fontWeight: '700' }}>
                      {totalDed > 0 ? `-${fmt(totalDed)} ج.م` : '0 ج.م'}
                    </td>
                    <td style={{ color: '#0d9488', fontWeight: '900', fontSize: '15px' }}>
                      {fmt(empSum.netSalary)} ج.م
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          className="btn btn-start"
                          style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
                          title="طباعة رسمية مباشرة (مطابقة لنظام عقد العمل)"
                          onClick={() => {
                            printEmployeePayslipDirect({
                              emp,
                              month: monthPicker,
                              shifts: state.shifts || [],
                              adjustments: state.adjustments || [],
                              branches,
                              orgSettings: state.orgSettings || {},
                              computeEmpSummary: state.computeEmpSummary,
                              selectedBranchId: filterBranch || null,
                              state
                            });
                          }}
                        >
                          🖨️ طباعة الكشف
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '12px', whiteSpace: 'nowrap' }}
                          title="عرض تفاصيل الحساب"
                          onClick={() => setSelectedEmpModal(emp)}
                        >
                          🔍 تفاصيل
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Salary Detail & PDF Modal */}
      {selectedEmpModal && (() => {
        const empSalary = parseFloat(selectedEmpModal.salary) || 0;
        const empSum = state.computeEmpSummary
          ? state.computeEmpSummary(selectedEmpModal.id, payrollFilterFn, monthPicker, filterBranch || null)
          : { hours: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, absenceDaysCount: 0, approvedOvertimeHours: 0, pendingOvertimeHours: 0, overtimeEarnings: 0 };

        const totalDed = (empSum.totalDeduction || 0) + (empSum.absenceDeduction || 0);

        return (
          <div className="modal-backdrop">
            <div className="modal-content card" style={{ maxWidth: '1100px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#0d9488' }}>
                    💵 كشف مفردات راتب الموظف: {selectedEmpModal.name}
                  </h3>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    كود الموظف: {selectedEmpModal.code} | المسمى الوظيفي: {selectedEmpModal.jobTitle} | الفترة: <strong style={{ color: '#0f766e' }}>{getPeriodDesc()}</strong>
                  </span>
                </div>
                <button className="btn btn-ghost" onClick={() => setSelectedEmpModal(null)}>✕ إغلاق</button>
              </div>

              {/* Salary Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>1. سعر الساعة الشهري</span>
                  <h4 style={{ margin: '4px 0 0 0', color: 'var(--primary-dark)' }}>{empSalary.toLocaleString()} ج.م</h4>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>2. ساعات العمل بالفترة</span>
                  <h4 style={{ margin: '4px 0 0 0', color: 'var(--primary-dark)' }}>{empSum.hours || 0} ساعة ({fmt(empSum.baseEarnings)} ج.م)</h4>
                </div>

                {(empSum.approvedOvertimeHours > 0 || empSum.pendingOvertimeHours > 0) && (
                  <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '10px', border: '1px solid #86efac' }}>
                    <span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>⭐ الوقت الإضافي</span>
                    <h4 style={{ margin: '4px 0 0 0', color: '#15803d' }}>
                      +{fmt(empSum.overtimeEarnings)} ج.م
                    </h4>
                    <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>
                      {empSum.approvedOvertimeHours > 0 && `معتمد: ${empSum.approvedOvertimeHours} ساعة (${fmt(empSum.overtimeEarnings)} ج.م)`}
                      {empSum.pendingOvertimeHours > 0 && ` | ⏳ معلق: ${empSum.pendingOvertimeHours} ساعة`}
                    </div>
                  </div>
                )}

                {empSum.totalAllowances > 0 && (
                  <div style={{ background: '#eff6ff', padding: '14px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: '12px', color: '#1e40af' }}>3. البدلات الثابتة</span>
                    <h4 style={{ margin: '4px 0 0 0', color: '#1d4ed8' }}>
                      +{fmt(empSum.totalAllowances)} ج.م
                    </h4>
                    <div style={{ fontSize: '11px', color: '#1e40af', marginTop: '2px' }}>
                      {empSum.managementAllowance > 0 && `إدارة: ${fmt(empSum.managementAllowance)} | `}
                      {empSum.transportAllowance > 0 && `مواصلات: ${fmt(empSum.transportAllowance)} | `}
                      {Array.isArray(empSum.extraAllowances) && empSum.extraAllowances.length > 0 
                        ? empSum.extraAllowances.map(a => `${a.title || 'إضافي'}: ${fmt(a.amount)}`).join(' | ')
                        : (empSum.extraAllowance > 0 && `${empSum.extraAllowanceTitle || 'إضافي'}: ${fmt(empSum.extraAllowance)}`)}
                    </div>
                  </div>
                )}

                <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '12px', color: '#166534' }}>{empSum.totalAllowances > 0 ? '4.' : '3.'} المكافآت والحوافز</span>
                  <h4 style={{ margin: '4px 0 0 0', color: '#15803d' }}>
                    +{fmt(empSum.totalBonus)} ج.م
                  </h4>
                </div>

                {empSum.lateDeduction > 0 && (
                  <div style={{ background: '#fff7ed', padding: '14px', borderRadius: '10px', border: '1px solid #fed7aa' }}>
                    <span style={{ fontSize: '12px', color: '#c2410c' }}>⏱️ خصومات التأخير اللائحي</span>
                    <h4 style={{ margin: '4px 0 0 0', color: '#ea580c' }}>
                      -{fmt(empSum.lateDeduction)} ج.م
                    </h4>
                    <div style={{ fontSize: '11px', color: '#9a3412', marginTop: '2px' }}>
                      خصم {empSum.lateDeductionMinutes} دقيقة ({empSum.lateIncidentsCount} واقعة تأخير)
                    </div>
                  </div>
                )}

                {empSum.absenceDeduction > 0 && (
                  <div style={{ background: '#fef2f2', padding: '14px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                    <span style={{ fontSize: '12px', color: '#991b1b' }}>🚫 خصومات الغياب بدون إذن</span>
                    <h4 style={{ margin: '4px 0 0 0', color: '#dc2626' }}>
                      -{fmt(empSum.absenceDeduction)} ج.م
                    </h4>
                    <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '2px' }}>
                      عدد {empSum.absenceDaysCount} يوم غياب
                    </div>
                  </div>
                )}

                <div style={{ background: '#fef2f2', padding: '14px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                  <span style={{ fontSize: '12px', color: '#991b1b' }}>إجمالي الخصومات الشاملة</span>
                  <h4 style={{ margin: '4px 0 0 0', color: '#dc2626' }}>
                    -{fmt(totalDed)} ج.م
                  </h4>
                </div>
              </div>

              {/* Late Penalties Detailed Incidents Table */}
              {(() => {
                const empLateIncidents = (state.lateIncidents || []).filter(
                  (inc) =>
                    String(inc.employeeId) === String(selectedEmpModal.id) &&
                    inc.status !== 'cancelled' &&
                    !inc.isCancelled &&
                    inc.objection?.status !== 'approved' &&
                    inc.status !== 'approved_permission_exempt' &&
                    inc.actionType !== 'grace' &&
                    !isApprovedPermissionForDate(selectedEmpModal.id, inc.date, state) &&
                    !(state?.requests || []).some(
                      (r) =>
                        (r.type === 'penalty_objection' || r.type === 'objection') &&
                        (r.status === 'approved' || r.adminApproved) &&
                        (r.penaltyId === inc.id || r.id === `obj_inc_${inc.id}` || (String(r.employeeId) === String(selectedEmpModal.id) && r.date === inc.date))
                    ) &&
                    (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
                    (!filterBranch || String(inc.branchId) === String(filterBranch)) &&
                    payrollFilterFn(inc.date)
                );

                if (empLateIncidents.length === 0) return null;

                return (
                  <div style={{ marginBottom: '22px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#c2410c', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>⏱️</span> جدول وقائع وأيام التأخير والخصم اليومي المعتمد ({empLateIncidents.length} واقعة تأخير)
                      </h4>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9a3412' }}>
                        إجمالي خصم التأخيرات: {fmt(empSum.lateDeduction)} ج.م ({empSum.lateDeductionMinutes} دقيقة)
                      </span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ background: '#ffedd5', color: '#9a3412', borderBottom: '1px solid #fed7aa' }}>
                            <th style={{ padding: '8px 10px' }}>التاريخ</th>
                            <th style={{ padding: '8px 10px' }}>موعد الشيفت</th>
                            <th style={{ padding: '8px 10px' }}>الحضور الفعلي</th>
                            <th style={{ padding: '8px 10px' }}>دقائق التأخير</th>
                            <th style={{ padding: '8px 10px' }}>فئة التأخير</th>
                            <th style={{ padding: '8px 10px' }}>التكرار</th>
                            <th style={{ padding: '8px 10px' }}>الجزاء اللائحي</th>
                            <th style={{ padding: '8px 10px' }}>دقائق الخصم</th>
                            <th style={{ padding: '8px 10px' }}>مبلغ الخصم لليوم</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empLateIncidents.map((inc) => {
                            const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, selectedEmpModal, inc.branchId || filterBranch);
                            const penaltyVal = dayAmt > 0 ? dayAmt : (parseFloat(inc.penaltyAmount) || 0);
                            return (
                              <tr key={inc.id} style={{ borderBottom: '1px solid #fed7aa' }}>
                                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{inc.date}</td>
                                <td style={{ padding: '7px 10px', color: '#2563eb', fontWeight: 600 }}>{inc.scheduledStartTime}</td>
                                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{inc.actualPunchInTime}</td>
                                <td style={{ padding: '7px 10px' }}>
                                  <span style={{ background: 'rgba(234,88,12,0.1)', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    {inc.lateMinutes} دقيقة
                                  </span>
                                </td>
                                <td style={{ padding: '7px 10px' }}>{inc.tierName}</td>
                                <td style={{ padding: '7px 10px', fontWeight: 700 }}>المرة #{inc.occurrenceNumber}</td>
                                <td style={{ padding: '7px 10px', color: inc.deductionMinutes > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                                  {inc.actionLabel}
                                </td>
                                <td style={{ padding: '7px 10px', fontWeight: 700 }}>
                                  {inc.deductionMinutes > 0 ? `${inc.deductionMinutes} دقيقة` : '—'}
                                </td>
                                <td style={{ padding: '7px 10px', fontWeight: 800, color: penaltyVal > 0 ? '#dc2626' : 'var(--muted)' }}>
                                  {penaltyVal > 0 ? `-${fmt(penaltyVal)} ج.م` : '0 ج.م'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '18px', borderRadius: '12px', textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', opacity: 0.9 }}>صافي الراتب النهائي المستحق للفترة ({getPeriodDesc()})</span>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '28px', fontWeight: '900' }}>
                  {fmt(empSum.netSalary)} ج.م
                </h2>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => exportEmpExcel(selectedEmpModal.id, 'month')}>
                  📊 تصدير شيت إكسيل فردي
                </button>
                <button
                  className="btn btn-start"
                  onClick={() => {
                    printEmployeePayslipDirect({
                      emp: selectedEmpModal,
                      month: monthPicker,
                      shifts: state.shifts || [],
                      adjustments: state.adjustments || [],
                      branches,
                      orgSettings: state.orgSettings || {},
                      computeEmpSummary: state.computeEmpSummary,
                      selectedBranchId: filterBranch || null,
                      state
                    });
                  }}
                >
                  🖨️ طباعة كشف المرتب (A4 PDF)
                </button>
                <button className="btn btn-ghost" onClick={() => setShowPrintModal(true)}>
                  👁️ معاينة الكشف
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Official PDF Print Modal */}
      <PayslipPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        emp={selectedEmpModal}
        month={monthPicker}
        shifts={state.shifts || []}
        adjustments={state.adjustments || []}
        branches={branches}
        orgSettings={state.orgSettings || {}}
        computeEmpSummary={state.computeEmpSummary}
        selectedBranchId={filterBranch || null}
        state={state}
      />

    </div>
  );
}
