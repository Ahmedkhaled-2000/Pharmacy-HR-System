import React, { useState, useMemo } from 'react';
import { calculateEmployeeLeaveStats, getEmployeeApprovedLeaves, getEmpDisplayName, isEmployeeActive, parseAnnualLeaveBalance, normalizeState } from '../../utils/formatters';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';
import { apiSubmitRequestAtomic } from '../../utils/apiClient';
import { saveStateLocally, broadcastStateChange } from '../../utils/offlineSync';

const LEAVE_TYPES = [
  { key: 'annual', label: '🌴 إجازة سنوية اعتيادية', deduction: 'خصم من رصيد الإجازات السنوي' },
  { key: 'casual', label: '🌴 إجازة عارضة', deduction: 'خصم من رصيد الإجازات السنوي' },
  { key: 'sick', label: '🏥 إجازة مرضية (بتقرير طبي)', deduction: 'مدفوعة الأجر (أو حسب لائحة العمل)' },
  { key: 'comp_off', label: '🛋️ إجازة بدل راحة (Comp-Off)', deduction: 'خصم من رصيد بدل الراحة المتاح للموظف' },
  { key: 'unpaid', label: '💸 إجازة بدون راتب', deduction: 'غير مدفوعة (خصم من الراتب الشهري)' },
  { key: 'marriage', label: '💍 إجازة زواج', deduction: 'إجازة مناسبة مدفوعة الأجر بالكامل' },
  { key: 'maternity', label: '👶 إجازة وضع ورعاية طفل', deduction: 'إجازة أمومة ورعاية مدفوعة الأجر' },
  { key: 'bereavement', label: '🖤 إجازة وفاة / حداد', deduction: 'إجازة عزاء رسمية مدفوعة الأجر' },
  { key: 'official', label: '🏛️ إجازة رسمية / مأمورية', deduction: 'مهمة عمل رسمية مدفوعة الأجر' }
];

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

  // ── حالة نافذة منح إجازة رسمية من الإدارة العليا ──
  const [showGrantLeaveModal, setShowGrantLeaveModal] = useState(false);
  const [grantEmpId, setGrantEmpId] = useState('');
  const [grantLeaveType, setGrantLeaveType] = useState('annual');
  const [grantStartDate, setGrantStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [grantEndDate, setGrantEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [grantDaysCount, setGrantDaysCount] = useState(1);
  const [grantReason, setGrantReason] = useState('');
  const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);

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

  // إعدادات المعاملة المالية لكافة أنواع الإجازات
  const [showLeaveFinancialPolicies, setShowLeaveFinancialPolicies] = useState(false);
  const [leaveFinancialPolicies, setLeaveFinancialPolicies] = useState(() => {
    return state.orgSettings?.leaveFinancialPolicies || {
      annual: 'deduct_balance',      // 'deduct_balance' | 'paid' | 'unpaid'
      sick: 'paid',                  // 'deduct_balance' | 'paid' | 'unpaid'
      casual: 'deduct_balance',      // 'deduct_balance' | 'paid' | 'unpaid'
      unpaid: 'unpaid',              // 'deduct_balance' | 'paid' | 'unpaid'
      marriage: 'paid',              // 'deduct_balance' | 'paid' | 'unpaid'
      maternity: 'paid',             // 'deduct_balance' | 'paid' | 'unpaid'
      bereavement: 'paid',           // 'deduct_balance' | 'paid' | 'unpaid'
      comp_off: 'paid'               // 'deduct_balance' | 'paid' | 'unpaid'
    };
  });

  const handleSaveLeaveFinancialPolicies = async (e) => {
    if (e) e.preventDefault();
    const updatedOrgSettings = {
      ...(state.orgSettings || {}),
      leaveFinancialPolicies
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
        console.warn('Error saving leave financial policies:', err);
      }
    }
    if (showToast) {
      showToast('✅ تم حفظ وتحديث المعاملة المالية لكافة أنواع الإجازات بنجاح');
    }
    setShowLeaveFinancialPolicies(false);
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

  // ── دوال حساب وإدارة منح إجازة رسمية للموظف من قبل الإدارة العليا ──
  const calculateDays = (start, end) => {
    if (!start || !end) return 1;
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
    const diff = e.getTime() - s.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleStartDateChange = (val) => {
    setGrantStartDate(val);
    let endVal = grantEndDate;
    if (!endVal || endVal < val) {
      endVal = val;
      setGrantEndDate(val);
    }
    setGrantDaysCount(calculateDays(val, endVal));
  };

  const handleEndDateChange = (val) => {
    setGrantEndDate(val);
    setGrantDaysCount(calculateDays(grantStartDate, val));
  };

  const handleOpenGrantLeaveModal = (emp = null) => {
    const today = new Date().toISOString().slice(0, 10);
    const activeEmps = (state.employees || []).filter(isEmployeeActive);
    const targetId = emp ? emp.id : (activeEmps[0]?.id || '');
    setGrantEmpId(String(targetId || ''));
    setGrantLeaveType('annual');
    setGrantStartDate(today);
    setGrantEndDate(today);
    setGrantDaysCount(1);
    setGrantReason('');
    setIsSubmittingGrant(false);
    setShowGrantLeaveModal(true);
  };

  const handleSaveGrantLeave = async (e) => {
    if (e) e.preventDefault();
    if (!grantEmpId) {
      showToast?.('⚠️ يرجى اختيار الموظف أولاً');
      return;
    }
    const targetEmp = (state.employees || []).find(emp => String(emp.id) === String(grantEmpId));
    if (!targetEmp) {
      showToast?.('⚠️ الموظف المحدد غير موجود');
      return;
    }

    if (!grantStartDate) {
      showToast?.('⚠️ يرجى تحديد تاريخ بداية الإجازة');
      return;
    }

    const effectiveEnd = grantEndDate || grantStartDate;
    if (effectiveEnd < grantStartDate) {
      showToast?.('⚠️ تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية');
      return;
    }

    const parsedDays = parseFloat(grantDaysCount) || 1;
    if (parsedDays <= 0) {
      showToast?.('⚠️ يجب أن يكون عدد الأيام أكبر من صفر');
      return;
    }

    const currentCompOff = parseFloat(targetEmp.compOffBalance || 0) || 0;
    if (grantLeaveType === 'comp_off' && currentCompOff < parsedDays) {
      if (!window.confirm(`⚠️ رصيد بدل الراحة المتاح للموظف (${currentCompOff} يوم) أقل من عدد الأيام المطلوبة (${parsedDays} يوم). هل تريد المتابعة واعتماد الإجازة بقرار إداري استثنائي؟`)) {
        return;
      }
    }

    setIsSubmittingGrant(true);
    const nowIso = new Date().toISOString();
    const leaveId = `leave_admin_${targetEmp.id}_${Date.now()}`;
    const targetEmpBranch = (state.branches || []).find(b => String(b.id) === String(targetEmp.branchId || targetEmp.primaryBranchId));
    const leaveTypeInfo = LEAVE_TYPES.find(t => t.key === grantLeaveType);

    const newLeaveReq = {
      id: leaveId,
      type: 'leave',
      requestType: 'leave',
      leaveType: grantLeaveType,
      typeLabel: `إجازة ${leaveTypeInfo?.label || grantLeaveType}`,
      employeeId: targetEmp.id,
      employeeName: targetEmp.name,
      employeeCode: targetEmp.code || '',
      branchId: targetEmp.branchId || targetEmp.primaryBranchId || '',
      branchName: targetEmpBranch?.name || targetEmp.branchName || '',
      startDate: grantStartDate,
      endDate: effectiveEnd,
      date: grantStartDate,
      daysCount: parsedDays,
      days: parsedDays,
      reason: grantReason.trim() || `إجازة ${leaveTypeInfo?.label || ''} ممنوحة بقرار الإدارة العليا`,
      details: grantReason.trim() || `إجازة ${leaveTypeInfo?.label || ''} ممنوحة بقرار الإدارة العليا`,
      status: 'approved',
      adminApproved: true,
      branchApproved: true,
      approvedBy: 'الإدارة العليا',
      approvedAt: nowIso,
      grantedByAdmin: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // تحديث رصيد بدل الراحة إذا كانت الإجازة بدل راحة
    const updatedEmps = (state.employees || []).map((empItem) => {
      if (String(empItem.id) === String(targetEmp.id) || (targetEmp.code && String(empItem.code) === String(targetEmp.code))) {
        if (grantLeaveType === 'comp_off') {
          const newComp = Math.max(0, currentCompOff - parsedDays);
          return {
            ...empItem,
            compOffBalance: newComp,
            updatedAt: nowIso
          };
        }
      }
      return empItem;
    });

    // إشعار رسمي للموظف
    const newNotification = {
      id: `notif_leave_grant_${Date.now()}`,
      employeeId: targetEmp.id,
      title: '🏖️ تم منحك إجازة رسمية من الإدارة العليا',
      message: `قامت الإدارة العليا باعتماد ومنحك إجازة (${leaveTypeInfo?.label || ''}) للفترة من ${grantStartDate} إلى ${effectiveEnd} (${parsedDays} يوم).`,
      type: 'leave_approved',
      createdAt: nowIso,
      read: false
    };

    const updatedRequests = [newLeaveReq, ...(state.requests || [])];
    const updatedLeaveRequests = [newLeaveReq, ...(state.leaveRequests || [])];
    const updatedNotifications = [newNotification, ...(state.notifications || [])];

    const updatedState = normalizeState({
      ...state,
      employees: updatedEmps,
      requests: updatedRequests,
      leaveRequests: updatedLeaveRequests,
      notifications: updatedNotifications
    });

    // ⚡ إغلاق فوري وتحديث تفاؤلي
    setShowGrantLeaveModal(false);
    setIsSubmittingGrant(false);
    if (setState) setState(updatedState);
    saveStateLocally(updatedState).catch(() => {});
    broadcastStateChange(updatedState);

    if (showToast) {
      showToast(`✅ تم منح واعتماد إجازة (${leaveTypeInfo?.label || ''}) للموظف (${getEmpDisplayName(targetEmp)}) بنجاح!`, 'success');
    }

    // مزامنة السيرفر في الخلفية
    (async () => {
      try {
        await apiSubmitRequestAtomic(newLeaveReq);
      } catch (atomicErr) {
        console.warn('[GrantLeave] Fallback to saveState:', atomicErr);
      }
      if (saveState) {
        saveState(updatedState, { entityType: 'requests' }).catch(err => {
          console.error('[GrantLeave] SaveState error:', err);
        });
      }
    })();
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOpenGrantLeaveModal()}
            style={{
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '13px',
              padding: '7px 18px',
              borderRadius: '10px',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '15px' }}>➕</span>
            <span>منح إجازة لموظف (الإدارة)</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowLeaveFinancialPolicies(!showLeaveFinancialPolicies)}
            style={{
              border: '1.5px solid #0d9488',
              background: showLeaveFinancialPolicies ? 'rgba(13, 148, 136, 0.15)' : 'rgba(13, 148, 136, 0.06)',
              color: '#0f766e',
              fontWeight: 800,
              fontSize: '13px',
              padding: '7px 16px',
              borderRadius: '10px'
            }}
          >
            ⚙️ المعاملة والسياسة المالية للإجازات
          </button>

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

      {/* ── لوحة تخصيص المعاملة المالية لكافة أنواع الإجازات ── */}
      {showLeaveFinancialPolicies && (
        <form onSubmit={handleSaveLeaveFinancialPolicies} className="card settings-card fade-in" style={{
          background: 'linear-gradient(135deg, rgba(204, 251, 241, 0.4), rgba(240, 253, 250, 0.7))',
          border: '1.5px solid #2dd4bf',
          borderRadius: '14px',
          padding: '18px 22px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #99f6e4', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>⚖️</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f766e' }}>
                  تحديد المعاملة والسياسة المالية لكافة أنواع الإجازات
                </h4>
                <span style={{ fontSize: '12px', color: '#115e59' }}>
                  حدد لكل نوع إجازة هل يتم خصمه من رصيد السنوي أم مدفوع الأجر بالكامل أم غير مدفوع (خصم من الراتب)
                </span>
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setShowLeaveFinancialPolicies(false)} style={{ padding: '2px 8px' }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {[
              { key: 'annual', label: '🌴 إجازة سنوية اعتيادية', defaultDesc: 'تُخصم من رصيد الإجازات السنوي' },
              { key: 'sick', label: '🏥 إجازة مرضية (بتقرير طبي)', defaultDesc: 'مدفوعة الأجر أو حسب لائحة العمل' },
              { key: 'casual', label: '🌴 إجازة عارضة', defaultDesc: 'تُخصم من رصيد السنوي أو مدفوعة' },
              { key: 'unpaid', label: '💸 إجازة بدون أجر', defaultDesc: 'تخصم من الراتب الشهري تلقائياً' },
              { key: 'marriage', label: '💍 إجازة زواج', defaultDesc: 'إجازة مناسبة مدفوعة الأجر' },
              { key: 'maternity', label: '👶 إجازة وضع ورعاية طفل', defaultDesc: 'إجازة أمومة مدفوعة الأجر' },
              { key: 'bereavement', label: '🖤 إجازة وفاة / حداد', defaultDesc: 'إجازة عزاء مدفوعة الأجر' },
              { key: 'comp_off', label: '🛋️ إجازة بدل راحة', defaultDesc: 'مدفوعة الأجر مقابل يوم راحة' }
            ].map((item) => (
              <div key={item.key} style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #ccfbf1', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '4px', color: '#134e4a' }}>
                  {item.label}
                </label>
                <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>
                  {item.defaultDesc}
                </span>
                <select
                  value={leaveFinancialPolicies[item.key] || 'paid'}
                  onChange={(e) => setLeaveFinancialPolicies({ ...leaveFinancialPolicies, [item.key]: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1.5px solid #5eead4',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    background: leaveFinancialPolicies[item.key] === 'deduct_balance' ? '#f0fdf4' : leaveFinancialPolicies[item.key] === 'unpaid' ? '#fef2f2' : '#eff6ff',
                    color: leaveFinancialPolicies[item.key] === 'deduct_balance' ? '#15803d' : leaveFinancialPolicies[item.key] === 'unpaid' ? '#b91c1c' : '#1d4ed8'
                  }}
                >
                  <option value="deduct_balance">📉 خصم من رصيد الإجازات السنوي (مدفوعة الأجر)</option>
                  <option value="paid">🟢 مدفوعة الأجر بالكامل (لا تؤثر على الرصيد أو الراتب)</option>
                  <option value="unpaid">🔴 غير مدفوعة الأجر (خصم قيمة اليوم من الراتب)</option>
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowLeaveFinancialPolicies(false)}>إلغاء</button>
            <button type="submit" className="btn btn-start" style={{ background: '#0d9488', borderColor: '#0d9488', padding: '7px 22px' }}>
              💾 حفظ المعاملة المالية للإجازات
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
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          className="btn btn-start"
                          style={{ padding: '4px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                          onClick={() => setSelectedEmpModal(emp)}
                        >
                          👁️ عرض كشف إجازات الموظف
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          title={`منح إجازة رسمية للموظف (${getEmpDisplayName(emp)})`}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: '#0d9488',
                            border: '1.5px solid #0d9488',
                            borderRadius: '8px',
                            background: 'rgba(13, 148, 136, 0.08)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                          onClick={() => handleOpenGrantLeaveModal(emp)}
                        >
                          ➕ منح إجازة
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
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      padding: '6px 14px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={() => handleOpenGrantLeaveModal(selectedEmpModal)}
                  >
                    ➕ منح إجازة لهذا الموظف
                  </button>
                  <button className="btn btn-ghost" onClick={() => setSelectedEmpModal(null)}>✕ إغلاق</button>
                </div>
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

      {/* ── نافذة منح إجازة رسمية للموظف من قبل الإدارة العليا ── */}
      {showGrantLeaveModal && (() => {
        const selectedEmp = (state.employees || []).find(e => String(e.id) === String(grantEmpId));
        const empStats = selectedEmp ? calculateEmployeeLeaveStats(selectedEmp, state) : null;
        const compOffBal = parseFloat(selectedEmp?.compOffBalance || 0) || 0;
        const currentLeaveTypeObj = LEAVE_TYPES.find(t => t.key === grantLeaveType);

        return (
          <div className="modal-backdrop" style={{ zIndex: 1200 }}>
            <div className="modal-content card" style={{ maxWidth: '640px', width: '95%', padding: '26px', borderRadius: '16px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    boxShadow: '0 4px 10px rgba(13, 148, 136, 0.25)'
                  }}>
                    🏖️
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '17px', fontWeight: 800 }}>
                      منح وتسجيل إجازة لموظف (بقرار الإدارة العليا)
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      اعتماد وتسجيل الإجازة مباشرة في كشف حساب الموظف وتحديث الأرصدة تلقائياً
                    </span>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setShowGrantLeaveModal(false)} style={{ padding: '4px 10px', fontSize: '16px' }}>✕</button>
              </div>

              <form onSubmit={handleSaveGrantLeave}>
                {/* 1. اختيار الموظف */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                    👤 اختيار الموظف المستهدف:
                  </label>
                  <select
                    value={grantEmpId}
                    onChange={(e) => setGrantEmpId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid var(--primary, #0d9488)',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      background: 'var(--surface, #fff)',
                      color: 'var(--text)'
                    }}
                    required
                  >
                    <option value="">-- اختر الموظف من القائمة --</option>
                    {(state.employees || []).filter(isEmployeeActive).map(emp => {
                      const b = (state.branches || []).find(br => String(br.id) === String(emp.branchId));
                      return (
                        <option key={emp.id} value={emp.id}>
                          {emp.code ? `[كود ${emp.code}] ` : ''}{getEmpDisplayName(emp)} ({b ? b.name : 'المركز الرئيسي'})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. بطاقة رصيد الموظف المختار التفاعلية */}
                {selectedEmp && (
                  <div style={{
                    background: 'var(--surface-muted, #f8fafc)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div>
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>الموظف المحدد:</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
                        {getEmpDisplayName(selectedEmp)} {selectedEmp.jobTitle && <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>({selectedEmp.jobTitle})</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        color: empStats?.remainingAnnualDays > 0 ? '#15803d' : '#b91c1c',
                        background: empStats?.remainingAnnualDays > 0 ? '#f0fdf4' : '#fef2f2',
                        border: empStats?.remainingAnnualDays > 0 ? '1px solid #bbf7d0' : '1px solid #fecaca',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 800
                      }}>
                        🏖️ الرصيد السنوي: {empStats?.remainingAnnualDays ?? 0} يوم متبقي
                      </span>
                      <span style={{
                        color: compOffBal > 0 ? '#7e22ce' : '#64748b',
                        background: compOffBal > 0 ? '#faf5ff' : 'var(--surface, #fff)',
                        border: compOffBal > 0 ? '1px solid #e9d5ff' : '1px solid var(--border)',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 800
                      }}>
                        🛋️ بدل الراحة: {compOffBal} يوم متاح
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. نوع الإجازة */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                    🏷️ نوع الإجازة الممنوحة:
                  </label>
                  <select
                    value={grantLeaveType}
                    onChange={(e) => setGrantLeaveType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid var(--border)',
                      fontSize: '13.5px',
                      fontWeight: 800,
                      background: 'var(--surface, #fff)',
                      color: 'var(--text)'
                    }}
                  >
                    {LEAVE_TYPES.map(t => (
                      <option key={t.key} value={t.key}>
                        {t.label} ⬅️ [{t.deduction}]
                      </option>
                    ))}
                  </select>

                  <div style={{
                    marginTop: '6px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: grantLeaveType === 'comp_off' ? '#faf5ff' : grantLeaveType === 'unpaid' ? '#fef2f2' : '#f0fdfa',
                    color: grantLeaveType === 'comp_off' ? '#7e22ce' : grantLeaveType === 'unpaid' ? '#b91c1c' : '#0f766e',
                    border: grantLeaveType === 'comp_off' ? '1px solid #e9d5ff' : grantLeaveType === 'unpaid' ? '1px solid #fecaca' : '1px solid #ccfbf1'
                  }}>
                    💡 <strong>الأثر المالي والتنظيمي:</strong> {currentLeaveTypeObj?.deduction}
                    {grantLeaveType === 'comp_off' && (
                      <div style={{ marginTop: '3px', fontSize: '11px' }}>
                        سيتم خصم عدد الأيام تلقائياً من رصيد بدل الراحة للموظف فور اعتماد الإجازة.
                      </div>
                    )}
                    {grantLeaveType === 'annual' && (
                      <div style={{ marginTop: '3px', fontSize: '11px' }}>
                        تعتبر إجازة اعتيادية مدفوعة الأجر وتخصم من رصيد الإجازات السنوي للموظف (21 يوماً).
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. التواريخ وعدد الأيام */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 800, fontSize: '12.5px', color: 'var(--text)' }}>
                      📅 من تاريخ (البداية):
                    </label>
                    <input
                      type="date"
                      value={grantStartDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface, #fff)', color: 'var(--text)', boxSizing: 'border-box' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 800, fontSize: '12.5px', color: 'var(--text)' }}>
                      📅 إلى تاريخ (النهاية):
                    </label>
                    <input
                      type="date"
                      value={grantEndDate}
                      min={grantStartDate}
                      onChange={(e) => handleEndDateChange(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface, #fff)', color: 'var(--text)', boxSizing: 'border-box' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 800, fontSize: '12.5px', color: 'var(--text)' }}>
                      ⏱️ عدد أيام الإجازة:
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={grantDaysCount}
                      onChange={(e) => setGrantDaysCount(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--primary, #0d9488)',
                        fontSize: '14px',
                        fontWeight: 800,
                        textAlign: 'center',
                        background: 'var(--surface, #fff)',
                        color: 'var(--text)',
                        boxSizing: 'border-box'
                      }}
                      required
                    />
                  </div>
                </div>

                {/* 5. سبب الإجازة وملاحظات الإدارة */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 800, fontSize: '12.5px', color: 'var(--text)' }}>
                    📝 سبب الإجازة / ملاحظات الإدارة العليا:
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: إجازة اعتيادية سنوية / مكافأة إدارية / ظرف عائلي معتمد"
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface, #fff)', color: 'var(--text)', boxSizing: 'border-box' }}
                  />
                </div>

                {/* 6. أزرار الحفظ والإلغاء */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowGrantLeaveModal(false)}
                    style={{ padding: '8px 18px', fontSize: '13px' }}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmittingGrant}
                    style={{
                      fontWeight: 800,
                      padding: '9px 24px',
                      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: isSubmittingGrant ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
                    }}
                  >
                    {isSubmittingGrant ? '⏳ جاري الحفظ والاعتماد...' : '💾 اعتماد ومنح الإجازة فوراً'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
