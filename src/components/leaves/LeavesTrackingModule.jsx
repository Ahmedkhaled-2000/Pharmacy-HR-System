import React, { useState, useMemo } from 'react';
import { calculateEmployeeLeaveStats, getEmployeeApprovedLeaves, getEmpDisplayName, isEmployeeActive, parseAnnualLeaveBalance, normalizeState } from '../../utils/formatters';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';

export default function LeavesTrackingModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [selectedEmpModal, setSelectedEmpModal] = useState(null);
  const [filterBranch, setFilterBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'has_comp_off' | 'low_annual' | 'exhausted_annual'
  const [sortBy, setSortBy] = useState('code'); // 'code' | 'comp_off_desc' | 'annual_remaining_desc' | 'taken_desc'
  const [isExporting, setIsExporting] = useState(false);
  const [editingLeaveBalanceEmp, setEditingLeaveBalanceEmp] = useState(null);
  const [editingBalanceType, setEditingBalanceType] = useState('annual'); // 'annual' | 'comp_off'
  const [newBalanceInput, setNewBalanceInput] = useState('');
  const [showCompOffSettings, setShowCompOffSettings] = useState(false);

  // إعدادات سياسة إجازات بدل الراحة
  const [compOffPolicy, setCompOffPolicy] = useState(() => {
    return state.orgSettings?.compOffPolicy || {
      enabled: true,
      conditionType: 'min_hours', // 'min_hours' | 'shift_percentage'
      minHours: 6,
      minShiftPercentage: 75,
      validityDays: 90
    };
  });

  const handleSaveCompOffPolicy = async (e) => {
    if (e) e.preventDefault();
    const updatedOrgSettings = {
      ...(state.orgSettings || {}),
      compOffPolicy
    };
    const updatedState = normalizeState({
      ...state,
      orgSettings: updatedOrgSettings
    });

    if (setState) setState(updatedState);
    if (saveState) {
      try {
        await saveState(updatedState);
      } catch (err) {
        console.warn('Error saving comp off policy:', err);
      }
    }
    if (showToast) {
      showToast('✅ تم حفظ وتحديث سياسة إجازات بدل الراحة بنجاح');
    }
    setShowCompOffSettings(false);
  };

  const handleOpenEditBalance = (emp, currentBalance, type = 'annual') => {
    setEditingLeaveBalanceEmp(emp);
    setEditingBalanceType(type);
    setNewBalanceInput(String(currentBalance !== undefined && currentBalance !== null ? currentBalance : (type === 'annual' ? '21' : '0')));
  };

  const handleSaveLeaveBalance = async (e) => {
    if (e) e.preventDefault();
    if (!editingLeaveBalanceEmp) return;
    const targetEmp = editingLeaveBalanceEmp;
    const parsedVal = parseFloat(newBalanceInput) || 0;

    const updatedEmps = (state.employees || []).map((empItem) => {
      const isMatch = String(empItem.id) === String(targetEmp.id) || (targetEmp.code && String(empItem.code) === String(targetEmp.code));
      if (!isMatch) return empItem;
      if (editingBalanceType === 'comp_off') {
        return { ...empItem, compOffBalance: parsedVal, updatedAt: new Date().toISOString() };
      }
      return { ...empItem, annualLeaveBalance: parseAnnualLeaveBalance(newBalanceInput, 21), updatedAt: new Date().toISOString() };
    });

    const updatedState = normalizeState({
      ...state,
      employees: updatedEmps
    });

    if (setState) setState(updatedState);
    if (saveState) {
      try {
        await saveState(updatedState);
      } catch (err) {
        console.warn('Error saving state on leave balance change:', err);
      }
    }

    if (selectedEmpModal && (String(selectedEmpModal.id) === String(targetEmp.id) || selectedEmpModal.code === targetEmp.code)) {
      if (editingBalanceType === 'comp_off') {
        setSelectedEmpModal({ ...selectedEmpModal, compOffBalance: parsedVal });
      } else {
        setSelectedEmpModal({ ...selectedEmpModal, annualLeaveBalance: parseAnnualLeaveBalance(newBalanceInput, 21) });
      }
    }

    if (showToast) {
      showToast(`✅ تم تحديث ${editingBalanceType === 'comp_off' ? 'رصيد إجازات بدل الراحة' : 'رصيد الإجازات السنوية'} للموظف (${getEmpDisplayName(targetEmp)}) إلى ${parsedVal} يوم بنجاح`);
    }

    setEditingLeaveBalanceEmp(null);
  };

  // اعتماد استحقاق بدل راحة لموظف نزل في يوم راحته
  const handleApproveCompOffGrant = async (grantReq) => {
    const targetEmpId = String(grantReq.employeeId);
    const updatedEmps = (state.employees || []).map((empItem) => {
      if (String(empItem.id) === targetEmpId || (grantReq.employeeCode && String(empItem.code) === String(grantReq.employeeCode))) {
        const currentBal = parseFloat(empItem.compOffBalance || 0) || 0;
        return {
          ...empItem,
          compOffBalance: currentBal + 1,
          updatedAt: new Date().toISOString()
        };
      }
      return empItem;
    });

    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === grantReq.id) {
        return {
          ...r,
          status: 'approved',
          adminApproved: true,
          approvedAt: new Date().toISOString(),
          approvedBy: 'الإدارة العليا'
        };
      }
      return r;
    });

    const updatedState = normalizeState({
      ...state,
      employees: updatedEmps,
      requests: updatedRequests
    });

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (showToast) showToast('✅ تم اعتماد استحقاق بدل الراحة وإضافة يوم إلى رصيد الموظف');
  };

  const handleRejectCompOffGrant = async (grantReq) => {
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === grantReq.id) {
        return {
          ...r,
          status: 'rejected',
          adminApproved: false,
          isRejected: true,
          rejectedAt: new Date().toISOString(),
          rejectedBy: 'الإدارة العليا'
        };
      }
      return r;
    });

    const updatedState = normalizeState({
      ...state,
      requests: updatedRequests
    });

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (showToast) showToast('❌ تم رفض استحقاق بدل الراحة');
  };

  const employees = state.employees || [];
  const branches = state.branches || [];

  // إحصائيات عامة ومؤشرات أداء أرصدة الإجازات وبدل الراحة
  const stats = useMemo(() => {
    let totalEmployees = 0;
    let totalAnnualTaken = 0;
    let totalCompOffAvailable = 0;
    let compOffEmployeesCount = 0;
    let lowAnnualBalanceCount = 0;
    let exhaustedAnnualBalanceCount = 0;

    (state.employees || []).forEach(emp => {
      if (!isEmployeeActive(emp)) return;
      totalEmployees++;
      const { takenAnnualDays, remainingAnnualDays } = calculateEmployeeLeaveStats(emp, state);
      totalAnnualTaken += takenAnnualDays;
      const compBal = parseFloat(emp.compOffBalance || 0) || 0;
      if (compBal > 0) {
        totalCompOffAvailable += compBal;
        compOffEmployeesCount++;
      }
      if (remainingAnnualDays <= 0) {
        exhaustedAnnualBalanceCount++;
      } else if (remainingAnnualDays <= 5) {
        lowAnnualBalanceCount++;
      }
    });

    return {
      totalEmployees,
      totalAnnualTaken,
      totalCompOffAvailable,
      compOffEmployeesCount,
      lowAnnualBalanceCount,
      exhaustedAnnualBalanceCount
    };
  }, [state.employees, state]);

  // تصدير كشف الإجازات وبدل الراحة إلى ملف Excel
  const handleExportToExcel = async () => {
    try {
      setIsExporting(true);
      const ExcelJS = await loadExcelJS(showToast);
      if (!ExcelJS) {
        showToast?.('تعذر تحميل مكتبة تصدير الإكسل');
        setIsExporting(false);
        return;
      }
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('أرصدة إجازات الموظفين وبدل الراحة', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      const colsCount = 8;
      mergedTitle(ws, 1, 'كشف حساب الإجازات السنوية وأرصدة بدل الراحة للموظفين', colsCount, 'FF0B3532', 15, 32);

      tableHeaderRow(ws, 2, [
        'كود الموظف',
        'اسم الموظف',
        'الفرع',
        'الرصيد السنوي الكلي (يوم)',
        'الإجازات المأخوذة (يوم)',
        'الرصيد السنوي المتبقي (يوم)',
        'رصيد إجازات بدل الراحة المتاح (يوم)',
        'حالة الرصيد'
      ]);

      let rIdx = 3;
      filteredEmployees.forEach(emp => {
        const empBranch = branches.find(b => b.id === emp.branchId);
        const { annualTotal, takenAnnualDays, remainingAnnualDays } = calculateEmployeeLeaveStats(emp, state);
        const compOffBal = parseFloat(emp.compOffBalance || 0) || 0;
        const statusLabel = remainingAnnualDays <= 0 ? 'مستنفذ' : (remainingAnnualDays <= 5 ? 'منخفض' : 'متاح');

        dataRow(ws, rIdx++, [
          emp.code,
          getEmpDisplayName(emp),
          empBranch?.name || 'المركز الرئيسي',
          annualTotal,
          takenAnnualDays,
          remainingAnnualDays,
          compOffBal,
          statusLabel
        ]);
      });

      ws.columns.forEach(col => { col.width = 18; });
      ws.getColumn(2).width = 26;
      ws.getColumn(7).width = 24;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_ارصدة_الاجازات_وبدل_الراحة_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast?.('✅ تم تصدير كشف الإجازات وبدل الراحة بنجاح');
    } catch (err) {
      console.error('Export Error:', err);
      showToast?.('⚠️ حدث خطأ أثناء تصدير ملف الإكسل');
    } finally {
      setIsExporting(false);
    }
  };

  // فلترة وترتيب الموظفين
  const filteredEmployees = useMemo(() => {
    return (state.employees || []).filter((emp) => {
      if (!isEmployeeActive(emp)) return false;
      if (filterBranch && emp.branchId !== filterBranch) return false;

      const { remainingAnnualDays } = calculateEmployeeLeaveStats(emp, state);
      const compOffBal = parseFloat(emp.compOffBalance || 0) || 0;

      if (statusFilter === 'has_comp_off' && compOffBal <= 0) return false;
      if (statusFilter === 'low_annual' && (remainingAnnualDays > 5 || remainingAnnualDays <= 0)) return false;
      if (statusFilter === 'exhausted_annual' && remainingAnnualDays > 0) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = emp.name?.toLowerCase().includes(q);
        const matchNickname = emp.nickname?.toLowerCase().includes(q);
        const matchCode = emp.code?.includes(q);
        if (!matchName && !matchNickname && !matchCode) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'comp_off_desc') {
        const diff = (parseFloat(b.compOffBalance || 0) || 0) - (parseFloat(a.compOffBalance || 0) || 0);
        if (diff !== 0) return diff;
      } else if (sortBy === 'annual_remaining_desc') {
        const aRem = calculateEmployeeLeaveStats(a, state).remainingAnnualDays;
        const bRem = calculateEmployeeLeaveStats(b, state).remainingAnnualDays;
        if (bRem !== aRem) return bRem - aRem;
      } else if (sortBy === 'taken_desc') {
        const aTaken = calculateEmployeeLeaveStats(a, state).takenAnnualDays;
        const bTaken = calculateEmployeeLeaveStats(b, state).takenAnnualDays;
        if (bTaken !== aTaken) return bTaken - aTaken;
      }
      return String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true });
    });
  }, [state.employees, state, filterBranch, searchQuery, statusFilter, sortBy]);

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            🏖️ متابعة كشوف وإجازات الموظفين ورصيد الإجازات وبدل الراحة
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            استعراض سجل الإجازات، الرصيد السنوي، وأرصدة إجازات بدل الراحة المستحقة لكل موظف
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowCompOffSettings(!showCompOffSettings)}
          style={{
            border: '1.5px solid #a855f7',
            background: compOffPolicy.enabled ? 'rgba(168, 85, 247, 0.08)' : 'var(--surface)',
            color: '#7e22ce',
            fontWeight: 800,
            fontSize: '13px',
            padding: '7px 16px',
            borderRadius: '10px'
          }}
        >
          ⚙️ إعدادات وشروط إجازات بدل الراحة {compOffPolicy.enabled ? '🟢 (مفعل)' : '⚪ (معطل)'}
        </button>
      </div>

      {/* ── بطاقات مؤشرات الأداء الإحصائية للأرصدة وبدل الراحة ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '20px'
      }}>
        {/* بطاقة 1: إجمالي الكادر */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'rgba(13, 148, 136, 0.12)',
            color: '#0d9488',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            👥
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>إجمالي الموظفين النشطين</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>{stats.totalEmployees} موظف</div>
          </div>
        </div>

        {/* بطاقة 2: الإجازات المأخوذة */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'rgba(217, 119, 6, 0.12)',
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            🏖️
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>إجمالي الإجازات المستهلكة</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#d97706' }}>{stats.totalAnnualTaken} يوم</div>
          </div>
        </div>

        {/* بطاقة 3: إجمالي رصيد بدل الراحة المتاح (مميزة باللون البنفسجي الفاخر) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(243, 232, 255, 0.6), rgba(250, 245, 255, 0.95))',
          border: '1.5px solid #d8b4fe',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 4px 12px rgba(126, 34, 206, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#7e22ce',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 2px 8px rgba(126, 34, 206, 0.3)'
            }}>
              🛋️
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b21a8', fontWeight: 800 }}>رصيد بدل الراحة المتاح بالكامل</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#581c87' }}>
                {stats.totalCompOffAvailable} <span style={{ fontSize: '14px', fontWeight: 700 }}>يوم متاح</span>
              </div>
              <div style={{ fontSize: '11px', color: '#7e22ce' }}>
                لدى {stats.compOffEmployeesCount} موظف مستحق
              </div>
            </div>
          </div>
          {stats.compOffEmployeesCount > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => setStatusFilter(statusFilter === 'has_comp_off' ? 'all' : 'has_comp_off')}
              style={{
                background: statusFilter === 'has_comp_off' ? '#7e22ce' : '#ffffff',
                color: statusFilter === 'has_comp_off' ? '#ffffff' : '#7e22ce',
                border: '1px solid #a855f7',
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: 800,
                borderRadius: '8px',
                cursor: 'pointer'
              }}
              title="عرض الموظفين الذين يمتلكون رصيد بدل راحة متاح فقط"
            >
              {statusFilter === 'has_comp_off' ? '✓ مفلتر' : 'عرضهم 🛋️'}
            </button>
          )}
        </div>

        {/* بطاقة 4: تنبيهات الأرصدة */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            ⚠️
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>أرصدة سنوية منخفضة/مستنفذة</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: stats.lowAnnualBalanceCount + stats.exhaustedAnnualBalanceCount > 0 ? '#dc2626' : 'var(--text)' }}>
              {stats.lowAnnualBalanceCount + stats.exhaustedAnnualBalanceCount} موظف
            </div>
          </div>
        </div>
      </div>

      {/* ── لوحة تخصيص وشروط سياسة بدل الراحة ── */}
      {showCompOffSettings && (
        <form onSubmit={handleSaveCompOffPolicy} className="card settings-card fade-in" style={{
          background: 'linear-gradient(135deg, rgba(243, 232, 255, 0.4), rgba(250, 245, 255, 0.7))',
          border: '1.5px solid #d8b4fe',
          borderRadius: '14px',
          padding: '18px 22px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e9d5ff', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>🛋️</span>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#6b21a8' }}>
                إعدادات وضوابط نظام إجازات بدل الراحة (Comp-Off Policy)
              </h4>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCompOffSettings(false)} style={{ padding: '2px 8px' }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            {/* زر التفعيل العام */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '6px', color: '#581c87' }}>
                حالة نظام بدل الراحة:
              </label>
              <select
                value={compOffPolicy.enabled ? 'true' : 'false'}
                onChange={(e) => setCompOffPolicy({ ...compOffPolicy, enabled: e.target.value === 'true' })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #c084fc', fontWeight: 800, background: '#fff' }}
              >
                <option value="true">🟢 تفعيل نظام بدل الراحة تلقائياً</option>
                <option value="false">⚪ تعطيل النظام بالكامل</option>
              </select>
            </div>

            {/* نوع شرط الاستحقاق */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '6px', color: '#581c87' }}>
                شرط الاستحقاق عند العمل في يوم الراحة:
              </label>
              <select
                value={compOffPolicy.conditionType || 'min_hours'}
                onChange={(e) => setCompOffPolicy({ ...compOffPolicy, conditionType: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #c084fc', fontWeight: 800, background: '#fff' }}
              >
                <option value="min_hours">⏱️ شرط حد أدنى لعدد ساعات العمل</option>
                <option value="shift_percentage">📊 شرط نسبة مئوية من ساعات الشيفت التعاقدية</option>
              </select>
            </div>

            {/* قيمة الشرط */}
            {compOffPolicy.conditionType === 'shift_percentage' ? (
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '6px', color: '#581c87' }}>
                  النسبة المئوية المطلوبة من ساعات الشيفت (%):
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={compOffPolicy.minShiftPercentage || 75}
                  onChange={(e) => setCompOffPolicy({ ...compOffPolicy, minShiftPercentage: parseFloat(e.target.value) || 75 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #c084fc', fontWeight: 800, background: '#fff' }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '6px', color: '#581c87' }}>
                  الحد الأدنى لساعات العمل في يوم الراحة (ساعات):
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={compOffPolicy.minHours || 6}
                  onChange={(e) => setCompOffPolicy({ ...compOffPolicy, minHours: parseFloat(e.target.value) || 6 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #c084fc', fontWeight: 800, background: '#fff' }}
                />
              </div>
            )}
          </div>

          <p style={{ fontSize: '12px', color: '#6b21a8', margin: '0 0 14px', lineHeight: 1.5 }}>
            💡 <strong>آلية العمل:</strong> عند تفعيل النظام ونزول الموظف للعمل في يوم راحته الأسبوعية محققاً الشرط الموضوع، يتم توجيه طلب اعتماد إلى الإدارة العليا، وعند الموافقة يُضاف يوم إلى <strong>رصيد إجازات بدل الراحة</strong> للموظف ليتمكن من استهلاكه في يوم عمل كدوام مدفوع دون خصم.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCompOffSettings(false)}>إلغاء</button>
            <button type="submit" className="btn btn-start" style={{ background: '#7e22ce', borderColor: '#7e22ce', padding: '7px 20px' }}>
              💾 حفظ السياسة
            </button>
          </div>
        </form>
      )}

      {/* Filter, Search Bar, Sort and Export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '220px' }}
          />
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}
          >
            <option value="">-- جميع الفروع --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* فلاتر سريعة بنقرة زر */}
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-muted)', padding: '3px', borderRadius: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '7px',
                background: statusFilter === 'all' ? 'var(--surface)' : 'transparent',
                color: statusFilter === 'all' ? 'var(--text)' : 'var(--muted)',
                boxShadow: statusFilter === 'all' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              الكل ({stats.totalEmployees})
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStatusFilter('has_comp_off')}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '7px',
                background: statusFilter === 'has_comp_off' ? '#7e22ce' : 'transparent',
                color: statusFilter === 'has_comp_off' ? '#ffffff' : '#7e22ce',
                boxShadow: statusFilter === 'has_comp_off' ? '0 2px 6px rgba(126, 34, 206, 0.25)' : 'none'
              }}
            >
              🛋️ لديهم رصيد بدل راحة ({stats.compOffEmployeesCount})
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStatusFilter('low_annual')}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '7px',
                background: statusFilter === 'low_annual' ? '#d97706' : 'transparent',
                color: statusFilter === 'low_annual' ? '#ffffff' : '#d97706'
              }}
            >
              ⚠️ رصيد منخفض ({stats.lowAnnualBalanceCount})
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStatusFilter('exhausted_annual')}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '7px',
                background: statusFilter === 'exhausted_annual' ? '#dc2626' : 'transparent',
                color: statusFilter === 'exhausted_annual' ? '#ffffff' : '#dc2626'
              }}
            >
              🔒 مستنفذ ({stats.exhaustedAnnualBalanceCount})
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* ترتيب القائمة */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontWeight: 700 }}
          >
            <option value="code">🔢 ترتيب حسب كود الموظف</option>
            <option value="comp_off_desc">🛋️ الأعلى رصيد بدل راحة</option>
            <option value="annual_remaining_desc">🏖️ الأعلى رصيد سنوي متبقي</option>
            <option value="taken_desc">📊 الأكثر استهلاكاً للإجازات</option>
          </select>

          {/* زر تصدير إكسل */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleExportToExcel}
            disabled={isExporting}
            style={{
              border: '1px solid #10b981',
              color: '#059669',
              fontWeight: 800,
              fontSize: '12.5px',
              padding: '7px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isExporting ? 'wait' : 'pointer'
            }}
          >
            <span>📊</span>
            <span>{isExporting ? 'جاري التصدير...' : 'تصدير إكسل'}</span>
          </button>
        </div>
      </div>

      {/* Employees Table */}
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>رصيد الإجازات السنوية</th>
              <th>الإجازات المأخوذة</th>
              <th>الرصيد المتبقي</th>
              <th>رصيد بدل الراحة المتاح</th>
              <th>حالة الرصيد</th>
              <th>معاينة سجل الإجازات</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const empBranch = branches.find((b) => b.id === emp.branchId);
                const { annualTotal, takenAnnualDays, remainingAnnualDays } = calculateEmployeeLeaveStats(emp, state);
                const compOffBal = parseFloat(emp.compOffBalance || 0) || 0;

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{empBranch?.name || 'المركز الرئيسي'}</td>
                    <td style={{ fontWeight: '800' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span>{annualTotal} يوم</span>
                        <button
                          className="btn btn-ghost"
                          title="تعديل رصيد الإجازات السنوية للموظف"
                          style={{ padding: '2px 8px', fontSize: '11.5px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: 'var(--surface-muted)' }}
                          onClick={() => handleOpenEditBalance(emp, annualTotal, 'annual')}
                        >
                          ✏️ تعديل
                        </button>
                      </div>
                    </td>
                    <td style={{ color: '#d97706', fontWeight: '800' }}>{takenAnnualDays} يوم</td>
                    <td style={{ color: remainingAnnualDays > 0 ? '#16a34a' : '#dc2626', fontWeight: '900', fontSize: '15px' }}>
                      {remainingAnnualDays} يوم
                    </td>
                    <td style={{ fontWeight: '800' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: compOffBal > 0 ? '#7e22ce' : 'var(--muted)', background: compOffBal > 0 ? '#f3e8ff' : 'transparent', padding: '2px 8px', borderRadius: '6px' }}>
                          🛋️ {compOffBal} يوم
                        </span>
                        <button
                          className="btn btn-ghost"
                          title="تعديل رصيد إجازات بدل الراحة"
                          style={{ padding: '2px 8px', fontSize: '11.5px', border: '1px solid #d8b4fe', color: '#7e22ce', borderRadius: '6px', cursor: 'pointer' }}
                          onClick={() => handleOpenEditBalance(emp, compOffBal, 'comp_off')}
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                    <td>
                      {remainingAnnualDays === 0 ? (
                        <span className="badge badge-danger">🔒 رصيد مستنفذ (0 يوم)</span>
                      ) : remainingAnnualDays <= 5 ? (
                        <span className="badge badge-warning">⚠️ رصيد منخفض ({remainingAnnualDays} يوم)</span>
                      ) : (
                        <span className="badge badge-success">🟢 رصيد متاح</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedEmpModal(emp)}
                      >
                        👁️ عرض كشف إجازات الموظف
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detailed Leaves Modal for Employee */}
      {selectedEmpModal && (() => {
        const empLeaves = getEmployeeApprovedLeaves(selectedEmpModal, state);
        const { annualTotal, takenAnnualDays, remainingAnnualDays } = calculateEmployeeLeaveStats(selectedEmpModal, state);
        const compOffBal = parseFloat(selectedEmpModal.compOffBalance || 0) || 0;
        const compOffLeaves = empLeaves.filter(r => r.leaveType === 'comp_off' || r.type === 'leave_comp_off');
        const takenCompOffDays = compOffLeaves.reduce((sum, r) => sum + (parseFloat(r.daysCount || r.days || 1) || 1), 0);

        return (
          <div className="modal-backdrop">
            <div className="modal-content card" style={{ maxWidth: '1050px', width: '96%', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#0d9488' }}>
                    🏖️ سجل وكشف إجازات الموظف: {getEmpDisplayName(selectedEmpModal)}
                  </h3>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    كود: {selectedEmpModal.code}
                    {selectedEmpModal.nickname && selectedEmpModal.nickname.trim() !== selectedEmpModal.name?.trim() && ` | الاسم الرسمي: ${selectedEmpModal.name}`}
                  </span>
                </div>
                <button className="btn btn-ghost" onClick={() => setSelectedEmpModal(null)}>✕ إغلاق</button>
              </div>

              {/* ── بطاقات ملخص أرصدة الموظف (السنوي وبدل الراحة) ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                {/* بطاقة الرصيد السنوي */}
                <div style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>🏖️ رصيد الإجازات السنوية الاعتيادية</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: remainingAnnualDays > 0 ? '#16a34a' : '#dc2626', margin: '4px 0' }}>
                      المتبقي: {remainingAnnualDays} يوم <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600 }}>(من {annualTotal} يوم)</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#d97706', fontWeight: 700 }}>
                      المستهلك حتى الآن: {takenAnnualDays} يوم
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}
                    onClick={() => handleOpenEditBalance(selectedEmpModal, annualTotal, 'annual')}
                  >
                    ✏️ تعديل
                  </button>
                </div>

                {/* بطاقة رصيد إجازات بدل الراحة المتاح */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(243, 232, 255, 0.5), rgba(250, 245, 255, 0.9))',
                  border: '1.5px solid #d8b4fe',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b21a8', fontWeight: 800 }}>🛋️ رصيد إجازات بدل الراحة (Comp-Off)</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#581c87', margin: '4px 0' }}>
                      {compOffBal} <span style={{ fontSize: '14px', fontWeight: 700 }}>يوم متاح للاستهلاك</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#7e22ce', fontWeight: 700 }}>
                      تم استهلاكها كإجازات مدفوعة: {takenCompOffDays} يوم
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '12px', border: '1.5px solid #a855f7', color: '#7e22ce', background: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}
                    onClick={() => handleOpenEditBalance(selectedEmpModal, compOffBal, 'comp_off')}
                  >
                    ✏️ تعديل الرصيد
                  </button>
                </div>
              </div>

              {/* Taken leaves table */}
              {empLeaves.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', background: 'var(--surface-muted)', borderRadius: '10px', color: 'var(--muted)' }}>
                  لا توجد إجازات مسجلة أو معتمدة لهذا الموظف حتى الآن.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="bylaws-table" style={{ fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-muted)' }}>
                        <th>تاريخ التقديم / التسجيل</th>
                        <th>نوع الإجازة</th>
                        <th>تاريخ البداية والنهاية</th>
                        <th>عدد الأيام</th>
                        <th>السبب والبيان</th>
                        <th>حالة الاعتماد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empLeaves.map((r, idx) => (
                        <tr key={r.id || idx}>
                          <td>{r.createdAt ? r.createdAt.slice(0, 10) : (r.startDate || '—')}</td>
                          <td>
                            {r.leaveType === 'comp_off' ? (
                              <span className="badge" style={{ background: '#f3e8ff', color: '#7c3aed', border: '1px solid #d8b4fe' }}>🛋️ بدل راحة (مدفوعة)</span>
                            ) : r.leaveType === 'annual' || (!r.leaveType && r.type === 'leave') ? (
                              <span className="badge badge-success">🏖️ سنوية اعتيادية</span>
                            ) : r.leaveType === 'unpaid' ? (
                              <span className="badge badge-warning">⏱️ غير مدفوعة الأجر</span>
                            ) : r.leaveType === 'sick' ? (
                              <span className="badge badge-danger">🏥 إجازة مرضية</span>
                            ) : (
                              <span className="badge badge-primary">{r.leaveType || 'إجازة رسمية'}</span>
                            )}
                          </td>
                          <td style={{ fontWeight: '700' }}>{r.startDate} إلى {r.endDate || r.startDate}</td>
                          <td style={{ fontWeight: '800', color: '#d97706' }}>{r.daysCount || r.days || 1} يوم</td>
                          <td style={{ fontSize: '12px' }}>{r.reason || r.details || '—'}</td>
                          <td>
                            <span className="approval-status-badge approved">🟢 معتمد ومسجل</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Quick Edit Leave Balance Modal */}
      {editingLeaveBalanceEmp && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal-content card" style={{ maxWidth: '420px', width: '92%', padding: '24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: editingBalanceType === 'comp_off' ? '#7e22ce' : '#0d9488', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editingBalanceType === 'comp_off' ? '🛋️ تعديل رصيد إجازات بدل الراحة' : '🏖️ تعديل رصيد الإجازات السنوية'}
              </h3>
              <button className="btn btn-ghost" onClick={() => setEditingLeaveBalanceEmp(null)} style={{ padding: '2px 8px' }}>✕</button>
            </div>
            
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text)' }}>
              الموظف: <strong>{getEmpDisplayName(editingLeaveBalanceEmp)}</strong> (كود: {editingLeaveBalanceEmp.code})
            </p>

            <form onSubmit={handleSaveLeaveBalance}>
              <div className="field" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13.5px' }}>
                  {editingBalanceType === 'comp_off' ? 'رصيد إجازات بدل الراحة المتاح (يوم):' : 'رصيد الإجازات السنوية الكلي (يوم):'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newBalanceInput}
                  onChange={(e) => setNewBalanceInput(e.target.value)}
                  placeholder={editingBalanceType === 'comp_off' ? '0' : '21'}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1.5px solid ${editingBalanceType === 'comp_off' ? '#7e22ce' : '#0d9488'}`,
                    fontSize: '18px',
                    fontWeight: '800',
                    color: editingBalanceType === 'comp_off' ? '#7e22ce' : '#0f766e',
                    textAlign: 'center'
                  }}
                  autoFocus
                  required
                />
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginTop: '6px' }}>
                  {editingBalanceType === 'comp_off'
                    ? '💡 رصيد بدل الراحة يتيح للموظف أخذ إجازة مدفوعة الأجر في يوم عمل دون خصم.'
                    : '💡 يمكنك كتابة أي عدد أيام (مثلاً: 0، 15، 21، 30، أو كسر مثل 14.5).'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditingLeaveBalanceEmp(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-start"
                  style={{ fontWeight: '700', padding: '8px 20px', background: editingBalanceType === 'comp_off' ? '#7e22ce' : undefined, borderColor: editingBalanceType === 'comp_off' ? '#7e22ce' : undefined }}
                >
                  💾 حفظ وتحديث الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
