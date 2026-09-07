import React from 'react';
import { fmt, getEmpDisplayName } from '../../utils/formatters';
import { isManagementJob } from '../../utils/jobsHelper';

export default function EmployeeSalaryDetailsModal({
  emp,
  branches = [],
  jobs = [],
  onClose,
  onEdit
}) {
  if (!emp) return null;

  const isMgmt = isManagementJob(emp.jobTitle, jobs);
  const mainBranch = branches.find((b) => String(b.id) === String(emp.branchId)) || null;

  // 1. Branches details breakdown
  const branchesList = Array.isArray(emp.branchesDetails) && emp.branchesDetails.length > 0
    ? emp.branchesDetails
    : [
        {
          branchId: emp.branchId || '',
          salary: emp.salary || 0,
          workHours: emp.workHours || emp.workHoursPerDay || 8,
          workDays: emp.workDays || emp.workDaysPerMonth || 26,
          breakHours: emp.breakHours || emp.defaultBreakHours || 0
        }
      ];

  // Calculations per branch
  const computedBranches = branchesList.map((bd, idx) => {
    const bObj = branches.find((b) => String(b.id) === String(bd.branchId));
    const bName = bObj ? bObj.name : (bd.branchName || (idx === 0 && mainBranch ? mainBranch.name : `فرع ${idx + 1}`));
    const hourlyRateInput = parseFloat(bd.salary) || 0; // سعر الساعة الشهري المدخل
    const workHours = parseFloat(bd.workHours) || 8;
    const workDays = parseFloat(bd.workDays) || 26;
    const breakHours = parseFloat(bd.breakHours) || 0;
    const netHours = Math.max(0, workHours - breakHours);
    const effectiveHours = netHours > 0 ? netHours : workHours;

    // تطبيق نفس معادلة البيانات المالية للموظف:
    // 1. سعر اليوم = (سعر الساعة الشهري * ساعات العمل) / أيام العمل
    const dayRate = workDays > 0 ? Math.round(((hourlyRateInput * workHours) / workDays) * 100) / 100 : 0;
    // 2. سعر الساعة اليومي الصافي = سعر اليوم / صافي ساعات العمل الفعلية
    const hourRate = effectiveHours > 0 ? Math.round((dayRate / effectiveHours) * 100) / 100 : 0;
    // 3. الراتب الأساسي الشهري = سعر الساعة الشهري * ساعات العمل
    const basicSalary = Math.round(hourlyRateInput * workHours * 100) / 100;

    return {
      branchId: bd.branchId,
      branchName: bName,
      branchCode: bObj?.branchCode || bd.branchCode || '',
      hourlyRateInput,
      basicSalary,
      workHours,
      workDays,
      breakHours,
      netHours,
      dayRate,
      hourRate
    };
  });

  const totalBasicSalary = computedBranches.reduce((acc, b) => acc + b.basicSalary, 0);

  // 2. Allowances
  const mgmtAllowance = parseFloat(emp.managementAllowance || emp.managementBonus) || 0;
  const transportAllowance = parseFloat(emp.transportAllowance) || 0;
  const dailyAttendanceAllowance = parseFloat(emp.dailyAllowanceAmount !== undefined ? emp.dailyAllowanceAmount : (emp.dailyAttendanceAllowance || 0)) || 0;
  const dailyAllowanceTitle = emp.dailyAllowanceTitle?.trim() || 'بدل الحضور اليومي (بالبصمة)';

  // Extra / Custom Allowances (الأجور والبدلات الإضافية المخصصة: حوافز / بدلات مخصصة)
  let extraAllowancesList = [];
  const safeParseArray = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return null;
  };

  const rawList = safeParseArray(emp.extraAllowances) || safeParseArray(emp.customAllowances);

  if (rawList) {
    extraAllowancesList = rawList
      .filter((a) => (parseFloat(a?.amount) || 0) > 0 || (a?.title && String(a.title).trim()))
      .map((a, idx) => ({
        id: a.id || `ea_${idx}`,
        title: a.title?.trim() || 'أجر إضافي / بدل مخصص',
        amount: parseFloat(a.amount) || 0
      }));
  }

  // Fallback if extraAllowancesList is empty but emp.extraAllowance > 0 or emp.extraAllowanceTitle exists
  if (extraAllowancesList.length === 0 && ((parseFloat(emp.extraAllowance) || 0) > 0 || (emp.extraAllowanceTitle && String(emp.extraAllowanceTitle).trim()))) {
    extraAllowancesList = [{
      id: '1',
      title: emp.extraAllowanceTitle?.trim() || 'أجر إضافي / بدل مخصص',
      amount: parseFloat(emp.extraAllowance) || 0
    }];
  }

  const totalExtraAllowances = extraAllowancesList.reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0)
    || (parseFloat(emp.extraAllowance) || 0);

  if (extraAllowancesList.length === 0 && totalExtraAllowances > 0) {
    extraAllowancesList.push({
      id: '1',
      title: emp.extraAllowanceTitle?.trim() || 'أجر إضافي / بدل مخصص',
      amount: totalExtraAllowances
    });
  }

  // Daily attendance allowances list
  const dailyAllowancesList = Array.isArray(emp.dailyAllowances) && emp.dailyAllowances.length > 0
    ? emp.dailyAllowances
        .map((a) => ({
          id: a.id || Math.random().toString(),
          title: a.title?.trim() || 'بدل يومي بالبصمة',
          amount: parseFloat(a.amount) || 0
        }))
        .filter((a) => a.amount > 0 || a.title)
    : (dailyAttendanceAllowance > 0 ? [{
        id: 'daily_1',
        title: dailyAllowanceTitle,
        amount: dailyAttendanceAllowance
      }] : []);

  const totalDailyAllowanceRate = dailyAllowancesList.reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0) || dailyAttendanceAllowance;

  // Total Fixed Contractual Allowances (Management + Transport + Extra Allowances)
  const totalFixedAllowances = mgmtAllowance + transportAllowance + totalExtraAllowances;

  // Total Guaranteed Contractual Monthly Package
  const totalMonthlyPackage = totalBasicSalary + totalFixedAllowances;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 99999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-card fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '890px',
          width: '95%',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '16px',
          border: '1.5px solid #10b981',
          padding: '24px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          background: '#ffffff'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '26px',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
              }}
            >
              💵
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  {getEmpDisplayName(emp)}
                </h3>
                <span style={{ fontSize: '12px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                  كود: {emp.code || '—'}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>💼 {emp.jobTitle || 'موظف'}</span>
                <span>•</span>
                <span>🏢 {mainBranch ? mainBranch.name : 'بدون فرع رئيسي'}</span>
                {isMgmt && (
                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                    👔 كادر إداري
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            style={{ fontSize: '16px', border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '8px' }}
          >
            ✕
          </button>
        </div>

        {/* Big Total Monthly Package Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            borderRadius: '14px',
            padding: '16px 20px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            boxShadow: '0 4px 14px rgba(4,120,87,0.25)'
          }}
        >
          <div>
            <span style={{ fontSize: '12.5px', opacity: 0.9, display: 'block' }}>إجمالي الباقة التعاقدية الشهرية الثابتة</span>
            <div style={{ fontSize: '24px', fontWeight: 900, marginTop: '2px' }}>
              {fmt(totalMonthlyPackage)} <span style={{ fontSize: '14px', fontWeight: 600 }}>ج.م / شهرياً</span>
            </div>
          </div>
          <div style={{ textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.25)', paddingRight: '16px' }}>
            <div style={{ fontSize: '12px', opacity: 0.85 }}>الأساسي: {fmt(totalBasicSalary)} ج.م</div>
            <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>البدلات: {fmt(totalFixedAllowances)} ج.م</div>
          </div>
        </div>

        {/* 1. Branch Salaries & Hourly Rates Table */}
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏢</span> تفاصيل الراتب وساعات العمل حسب الفروع ({computedBranches.length})
          </h4>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>الفرع</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>سعر الساعة الشهري</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>الراتب الأساسي</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>ساعات / يوم</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>أيام / شهر</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>سعر اليوم</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>سعر الساعة الصافي</th>
                </tr>
              </thead>
              <tbody>
                {computedBranches.map((b, idx) => (
                  <tr key={b.branchId || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>
                      📍 {b.branchName}
                      {b.branchCode && <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>({b.branchCode})</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#4f46e5', whiteSpace: 'nowrap' }}>
                      {fmt(b.hourlyRateInput)} ج.م
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, color: '#047857', whiteSpace: 'nowrap' }}>
                      {fmt(b.basicSalary)} ج.م
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <strong>{b.workHours}</strong> س
                      {b.breakHours > 0 && <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>({b.breakHours}س بريك)</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {b.workDays} يوم
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#0369a1', whiteSpace: 'nowrap' }}>
                      {fmt(b.dayRate)} ج.م
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, color: '#b45309', whiteSpace: 'nowrap' }}>
                      {fmt(b.hourRate)} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Allowances Breakdown Grid */}
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🎁</span> البدلات والمخصصات التعاقدية
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {/* Management Allowance */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>بدل الإدارة (شهري)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: mgmtAllowance > 0 ? '#15803d' : '#94a3b8', marginTop: '2px' }}>
                {mgmtAllowance > 0 ? `${fmt(mgmtAllowance)} ج.م` : 'غير مخصص'}
              </div>
            </div>

            {/* Transport Allowance */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>بدل الانتقال (شهري)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: transportAllowance > 0 ? '#0369a1' : '#94a3b8', marginTop: '2px' }}>
                {transportAllowance > 0 ? `${fmt(transportAllowance)} ج.م` : 'غير مخصص'}
              </div>
            </div>

            {/* Daily Attendance Allowance */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                {dailyAllowanceTitle || 'بدل الحضور اليومي (بالبصمة)'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: totalDailyAllowanceRate > 0 ? '#b45309' : '#94a3b8', marginTop: '2px' }}>
                {totalDailyAllowanceRate > 0 ? `${fmt(totalDailyAllowanceRate)} ج.م / يوم` : 'غير مخصص'}
              </div>
              {totalDailyAllowanceRate > 0 && (
                <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                  يصرف للوردية الأولى فقط في اليوم
                </div>
              )}
            </div>

            {/* Custom Extra Allowances Total Badge */}
            <div style={{ background: totalExtraAllowances > 0 ? '#faf5ff' : '#f8fafc', border: totalExtraAllowances > 0 ? '1.5px solid #d8b4fe' : '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', color: totalExtraAllowances > 0 ? '#6b21a8' : '#64748b' }}>🏷️ إجمالي البدلات والحوافز الإضافية</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: totalExtraAllowances > 0 ? '#7c3aed' : '#94a3b8', marginTop: '2px' }}>
                {totalExtraAllowances > 0 ? `${fmt(totalExtraAllowances)} ج.م` : 'غير مخصص'}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Dedicated Section: الأجور والبدلات الإضافية المخصصة (حوافز / بدلات مخصصة) */}
        <div style={{ marginBottom: '20px', background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: '14px', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏷️</span> الأجور والبدلات الإضافية المخصصة (حوافز / بدلات مخصصة)
              </h4>
              <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: '#7e22ce' }}>
                البنود والمسميات الإضافية المعتمدة للموظف في نظام الأجور ومسير الرواتب.
              </p>
            </div>
            {totalExtraAllowances > 0 && (
              <span style={{ fontSize: '13px', background: '#f3e8ff', color: '#6b21a8', padding: '4px 10px', borderRadius: '8px', fontWeight: 800, border: '1px solid #d8b4fe' }}>
                الإجمالي: {fmt(totalExtraAllowances)} ج.م
              </span>
            )}
          </div>

          {extraAllowancesList.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {extraAllowancesList.map((ea, idx) => (
                <div
                  key={ea.id || idx}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #e9d5ff',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 5px rgba(124, 58, 237, 0.06)'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#4c1d95' }}>
                      🏷️ {ea.title || `أجر إضافي ${idx + 1}`}
                    </div>
                    <span style={{ fontSize: '10.5px', color: '#7c3aed', background: '#faf5ff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e9d5ff', display: 'inline-block', marginTop: '3px' }}>
                      حافز / بدل مخصص
                    </span>
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#6d28d9' }}>
                    {fmt(parseFloat(ea.amount) || 0)} <span style={{ fontSize: '12px', fontWeight: 600 }}>ج.م</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: '#ffffff', border: '1px dashed #d8b4fe', borderRadius: '10px', padding: '14px', color: '#7e22ce', fontSize: '12.5px', textAlign: 'center' }}>
              لا توجد أجور أو بدلات إضافية مخصصة مسجلة لهذا الموظف (يمكن إضافتها من زر تعديل الراتب ✏️).
            </div>
          )}
        </div>

        {/* Read-Only Notice and Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #e2e8f0', paddingTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🔒</span> بيانات الراتب للقراءة والاطلاع المعتمد فقط. لتعديل الراتب استخدم زر التعديل (✏️).
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onEdit}
                style={{ padding: '7px 16px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', background: '#059669', borderColor: '#059669' }}
              >
                <span>✏️</span> تعديل الراتب والبدلات
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ padding: '7px 20px', borderRadius: '8px', fontSize: '13px' }}
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
