import React, { useState, useMemo } from 'react';
import { arabicWeekday } from '../../utils/formatters';
import {
  DEFAULT_PERMISSION_POLICY,
  applyApprovedPermissionsToShifts,
  recalculateEmployeeCycleLateness
} from '../../utils/latePenaltyEngine';

export default function EmployeePermissionsManagementModule({
  state,
  setState,
  saveState,
  currentBranch,
  authRole = 'admin',
  currentEmployee = null,
  showToast
}) {
  const isBranchManager = authRole === 'branch';
  const effectiveBranchId = isBranchManager ? currentBranch?.id : null;

  // ── السياسة الخاصة بالأذونات ──
  const permPolicy = state.permissionPolicy || DEFAULT_PERMISSION_POLICY;
  const [maxHours, setMaxHours] = useState(permPolicy.maxHoursPerPermission || 2);
  const [maxMonthlyCount, setMaxMonthlyCount] = useState(permPolicy.maxPermissionsPerMonth || 2);
  const [cycleStartDay, setCycleStartDay] = useState(permPolicy.cycleStartDay || state.orgSettings?.payrollPayoutStartDay || 21);
  const [cycleEndDay, setCycleEndDay] = useState(permPolicy.cycleEndDay || state.orgSettings?.payrollPayoutEndDay || 20);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  // ── الفلاتر ──
  const [selectedMonth, setSelectedMonth] = useState(() => monthPicker || new Date().toISOString().slice(0, 7));
  const [filterBranch, setFilterBranch] = useState(effectiveBranchId || '');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | pending | approved | rejected | exceptional
  const [filterType, setFilterType] = useState('all'); // all | late | early
  const [searchQuery, setSearchQuery] = useState('');

  // ── النوافذ المنبثقة (Modals) ──
  const [previewReq, setPreviewReq] = useState(null);
  const [showExceptionalModal, setShowExceptionalModal] = useState(false);

  // ── نموذج الإذن الاستثنائي ──
  const [excEmpId, setExcEmpId] = useState('');
  const [excDate, setExcDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [excPermType, setExcPermType] = useState('late'); // late | early
  const [excStartTime, setExcStartTime] = useState('08:00');
  const [excEndTime, setExcEndTime] = useState('10:00');
  const [excReason, setExcReason] = useState('');
  const [excSubmitting, setExcSubmitting] = useState(false);

  const branches = state.branches || [];
  const employees = (state.employees || []).filter((e) => {
    if (isBranchManager && effectiveBranchId) {
      return (
        String(e.branchId) === String(effectiveBranchId) ||
        (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === String(effectiveBranchId)))
      );
    }
    return true;
  });

  // حساب مدة الإذن بالساعات والدقائق
  const computeDurationObj = (start, end) => {
    if (!start || !end) return { hours: 0, minutes: 0, text: '—' };
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
    if (diff <= 0) diff += 24 * 60;
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    let txt = '';
    if (hrs > 0) txt += `${hrs} ساعة `;
    if (mins > 0) txt += `${mins} دقيقة`;
    return {
      minutes: diff,
      hours: Math.round((diff / 60) * 100) / 100,
      text: txt || `${diff} دقيقة`
    };
  };

  // ── حفظ سياسة الأذونات ──
  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);
    try {
      const updatedPolicy = {
        ...permPolicy,
        maxHoursPerPermission: parseFloat(maxHours) || 2,
        maxPermissionsPerMonth: parseInt(maxMonthlyCount, 10) || 2,
        cycleStartDay: parseInt(cycleStartDay, 10) || 21,
        cycleEndDay: parseInt(cycleEndDay, 10) || 20,
        updatedAt: new Date().toISOString()
      };
      const updatedState = {
        ...state,
        permissionPolicy: updatedPolicy
      };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.('✅ تم حفظ ضوابط وسياسة أذونات الموظفين بنجاح');
    } catch (err) {
      console.error(err);
      showToast?.('❌ حدث خطأ أثناء حفظ السياسة');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // ── جميع طلبات الأذونات ──
  const allPermissions = useMemo(() => {
    return (state.requests || [])
      .filter((r) => r.type === 'permission' || r.type === 'إذن' || r.type === 'late_permission' || r.type === 'early_leave')
      .map((r) => {
        const dur = computeDurationObj(r.startTime || r.fromTime, r.endTime || r.toTime);
        const emp = (state.employees || []).find((e) => String(e.id) === String(r.employeeId));
        const branch = (state.branches || []).find((b) => String(b.id) === String(r.branchId || emp?.branchId));
        const reqDate = r.date || r.startDate || (r.createdAt ? r.createdAt.slice(0, 10) : '');
        return {
          ...r,
          durationObj: dur,
          computedDurationText: r.durationText || dur.text,
          computedHours: r.hours || dur.hours,
          empObj: emp,
          branchName: branch ? branch.name : (r.branchName || 'الفرع الرئيسي'),
          reqDate: reqDate
        };
      });
  }, [state.requests, state.employees, state.branches]);

  // حساب استخدام الموظفين للأذونات في الشهر المختار
  const employeeUsageMap = useMemo(() => {
    const map = new Map();
    allPermissions.forEach((p) => {
      if (p.reqDate && p.reqDate.startsWith(selectedMonth) && p.status === 'approved' && !p.isExceptional) {
        const count = map.get(String(p.employeeId)) || 0;
        map.set(String(p.employeeId), count + 1);
      }
    });
    return map;
  }, [allPermissions, selectedMonth]);

  // تصفية الأذونات
  const filteredPermissions = useMemo(() => {
    return allPermissions.filter((p) => {
      if (isBranchManager && effectiveBranchId) {
        if (p.branchId && String(p.branchId) !== String(effectiveBranchId)) return false;
      } else if (filterBranch && String(p.branchId) !== String(filterBranch)) {
        return false;
      }

      if (filterEmployeeId && String(p.employeeId) !== String(filterEmployeeId)) return false;

      if (selectedMonth && p.reqDate && !p.reqDate.startsWith(selectedMonth)) return false;

      if (filterType !== 'all') {
        if (filterType === 'late' && p.permType !== 'late') return false;
        if (filterType === 'early' && p.permType !== 'early') return false;
      }

      if (filterStatus !== 'all') {
        if (filterStatus === 'exceptional') {
          if (!p.isExceptional) return false;
        } else if (filterStatus === 'pending') {
          if (p.status !== 'pending' || p.adminApproved || p.branchApproved) return false;
        } else if (p.status !== filterStatus) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (p.employeeName || p.empObj?.name || '').toLowerCase();
        const code = (p.employeeCode || p.empObj?.code || '').toLowerCase();
        const reason = (p.reason || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !reason.includes(q)) return false;
      }

      return true;
    });
  }, [allPermissions, isBranchManager, effectiveBranchId, filterBranch, filterEmployeeId, selectedMonth, filterType, filterStatus, searchQuery]);

  // الإحصائيات الشهرية
  const stats = useMemo(() => {
    const monthPerms = allPermissions.filter((p) => p.reqDate && p.reqDate.startsWith(selectedMonth));
    const approved = monthPerms.filter((p) => p.status === 'approved' || p.adminApproved);
    const pending = monthPerms.filter((p) => p.status === 'pending' && !p.adminApproved);
    const exceptional = monthPerms.filter((p) => p.isExceptional);
    const totalHours = approved.reduce((acc, p) => acc + (parseFloat(p.computedHours) || 0), 0);

    return {
      total: monthPerms.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      exceptionalCount: exceptional.length,
      totalHours: Math.round(totalHours * 100) / 100
    };
  }, [allPermissions, selectedMonth]);

  // ── اعتماد إذن ──
  const handleApprovePermission = async (permId) => {
    const targetPerm = allPermissions.find((p) => p.id === permId);
    if (!targetPerm) return;

    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === permId) {
        return {
          ...r,
          status: 'approved',
          adminApproved: true,
          branchApproved: true,
          approvedAt: new Date().toISOString()
        };
      }
      return r;
    });

    // 1. مزامنة البصمات (shifts) وتعويض الساعات
    const updatedShifts = applyApprovedPermissionsToShifts({
      ...state,
      requests: updatedRequests
    });

    // 2. إلغاء أي جزاء تأخير أو خصم
    let updatedLateIncidents = [...(state.lateIncidents || [])];
    if (targetPerm.employeeId) {
      try {
        const { incidents } = recalculateEmployeeCycleLateness({
          employeeId: targetPerm.employeeId,
          cycleFilterFn: null,
          state: { ...state, requests: updatedRequests, shifts: updatedShifts },
          payrollCycleId: (targetPerm.reqDate || new Date().toISOString()).slice(0, 7)
        });
        const incidentIds = new Set(incidents.map((i) => i.id));
        updatedLateIncidents = [
          ...updatedLateIncidents.filter((i) => !incidentIds.has(i.id) && String(i.employeeId) !== String(targetPerm.employeeId)),
          ...incidents
        ];
      } catch (e) {
        console.error('Error recalculating upon permission approval:', e);
      }
    }

    const updatedState = {
      ...state,
      requests: updatedRequests,
      shifts: updatedShifts,
      lateIncidents: updatedLateIncidents
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم اعتماد الإذن، وتعديل البصمة، وإلغاء الخصم بنجاح');
    if (previewReq?.id === permId) {
      setPreviewReq({ ...previewReq, status: 'approved', adminApproved: true, branchApproved: true });
    }
  };

  // ── رفض إذن ──
  const handleRejectPermission = async (permId) => {
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === permId) {
        return {
          ...r,
          status: 'rejected',
          isRejected: true,
          adminApproved: false,
          branchApproved: false,
          rejectedAt: new Date().toISOString()
        };
      }
      return r;
    });

    const updatedState = {
      ...state,
      requests: updatedRequests
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('⚠️ تم رفض طلب الإذن');
    if (previewReq?.id === permId) {
      setPreviewReq({ ...previewReq, status: 'rejected', isRejected: true });
    }
  };

  // ── إصدار إذن استثنائي ──
  const handleCreateExceptionalPermission = async (e) => {
    e.preventDefault();
    if (!excEmpId) {
      showToast?.('⚠️ يرجى اختيار الموظف أولاً');
      return;
    }
    if (!excDate) {
      showToast?.('⚠️ يرجى تحديد تاريخ الإذن');
      return;
    }

    setExcSubmitting(true);
    try {
      const emp = (state.employees || []).find((empObj) => String(empObj.id) === String(excEmpId));
      const durObj = computeDurationObj(excStartTime, excEndTime);

      const newExcPerm = {
        id: 'perm_exc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.code,
        branchId: emp.branchId || currentBranch?.id,
        type: 'permission',
        permType: excPermType,
        date: excDate,
        startTime: excStartTime,
        endTime: excEndTime,
        hours: durObj.hours,
        durationMinutes: durObj.minutes,
        durationText: durObj.text,
        reason: `[إذن استثنائي]: ${excReason.trim() || 'تم المنح كإذن استثنائي من الإدارة'}`,
        isExceptional: true,
        targetApproval: 'admin_only',
        status: 'approved',
        adminApproved: true,
        branchApproved: true,
        createdBy: currentEmployee ? currentEmployee.name : (authRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع'),
        createdAt: new Date().toISOString()
      };

      const updatedRequests = [newExcPerm, ...(state.requests || [])];

      // مزامنة فورية مع البصمات (shifts)
      const updatedShifts = applyApprovedPermissionsToShifts({
        ...state,
        requests: updatedRequests
      });

      // إلغاء الجزاءات اللائحية لليوم المعني
      let updatedLateIncidents = [...(state.lateIncidents || [])];
      try {
        const { incidents } = recalculateEmployeeCycleLateness({
          employeeId: emp.id,
          cycleFilterFn: null,
          state: { ...state, requests: updatedRequests, shifts: updatedShifts },
          payrollCycleId: excDate.slice(0, 7)
        });
        const incidentIds = new Set(incidents.map((i) => i.id));
        updatedLateIncidents = [
          ...updatedLateIncidents.filter((i) => !incidentIds.has(i.id) && String(i.employeeId) !== String(emp.id)),
          ...incidents
        ];
      } catch (err) {
        console.error('Error in recalculation:', err);
      }

      const updatedState = {
        ...state,
        requests: updatedRequests,
        shifts: updatedShifts,
        lateIncidents: updatedLateIncidents
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.(`✅ تم إصدار الإذن الاستثنائي للموظف (${emp.name}) وتعديل بصمته وإلغاء أي خصم`);
      setShowExceptionalModal(false);
      setExcEmpId('');
      setExcReason('');
    } catch (err) {
      console.error(err);
      showToast?.('❌ حدث خطأ أثناء إنشاء الإذن الاستثنائي');
    } finally {
      setExcSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '30px' }}>
      
      {/* ── Top Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', background: 'var(--surface)', padding: '18px 22px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>⏰</span>
            <h2 style={{ margin: 0, fontFamily: 'Cairo', fontWeight: 800, color: 'var(--primary-dark)', fontSize: '22px' }}>
              نظام إدارة وضوابط أذونات الموظفين
            </h2>
          </div>
          <p style={{ margin: '6px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
            تحديد الحد الأقصى لساعات ومرات الأذونات، إصدار الأذونات الاستثنائية، والمزامنة التلقائية مع البصمات ولائحة الجزاءات
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-start"
            onClick={() => setShowExceptionalModal(true)}
            style={{
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
              cursor: 'pointer'
            }}
          >
            <span>✨</span> إصدار إذن استثنائي لموظف
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {/* Card 1 */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', borderRight: '4px solid var(--primary)' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, marginBottom: '6px' }}>📋 إجمالي أذونات الشهر</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary-dark)', fontFamily: 'Cairo' }}>{stats.total} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>إذن</span></div>
        </div>

        {/* Card 2 */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.3)', borderRight: '4px solid #10b981' }}>
          <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginBottom: '6px' }}>✅ الأذونات المعتمدة</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', fontFamily: 'Cairo' }}>{stats.approvedCount} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>إذن</span></div>
        </div>

        {/* Card 3 */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(245, 158, 11, 0.3)', borderRight: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '12px', color: '#d97706', fontWeight: 700, marginBottom: '6px' }}>⏳ بانتظار الاعتماد</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#f59e0b', fontFamily: 'Cairo' }}>{stats.pendingCount} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>طلب</span></div>
        </div>

        {/* Card 4 */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(13, 148, 136, 0.3)', borderRight: '4px solid #0d9488' }}>
          <div style={{ fontSize: '12px', color: '#0f766e', fontWeight: 700, marginBottom: '6px' }}>⏱️ إجمالي الساعات المصرح بها</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0d9488', fontFamily: 'Cairo' }}>{stats.totalHours} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>ساعة</span></div>
        </div>

        {/* Card 5 */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(147, 51, 234, 0.3)', borderRight: '4px solid #9333ea' }}>
          <div style={{ fontSize: '12px', color: '#7e22ce', fontWeight: 700, marginBottom: '6px' }}>🌟 أذونات استثنائية</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#9333ea', fontFamily: 'Cairo' }}>{stats.exceptionalCount} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>إذن</span></div>
        </div>
      </div>

      {/* ── Policy Settings Box ── */}
      <div style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, rgba(13, 148, 136, 0.04) 100%)', borderRadius: '16px', border: '1px solid rgba(37, 99, 235, 0.15)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '16px', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚙️</span> ضوابط وسياسة الأذونات الشهرية العامة
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--muted)', background: '#fff', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            تطبق تلقائياً على كافة نماذج تقديم الأذونات
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
              ⏱️ أقصى مدة مسموحة للإذن الواحد:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="0.5"
                max="8"
                step="0.5"
                value={maxHours}
                onChange={(e) => setMaxHours(e.target.value)}
                style={{ width: '100px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, textAlign: 'center', fontSize: '15px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>ساعة (كحد أقصى للطلب الواحد)</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
              🔢 أقصى عدد مرات مسموح بها شهرياً لكل موظف:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="1"
                max="10"
                step="1"
                value={maxMonthlyCount}
                onChange={(e) => setMaxMonthlyCount(e.target.value)}
                style={{ width: '100px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, textAlign: 'center', fontSize: '15px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>مرات شهرياً (الرصيد المتاح)</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
              🗓️ فترة احتساب الأذونات الشهرية:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>من يوم</span>
              <input
                type="number"
                min="1"
                max="31"
                value={cycleStartDay}
                onChange={(e) => setCycleStartDay(e.target.value)}
                style={{ width: '65px', padding: '9px 8px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, textAlign: 'center', fontSize: '14px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>إلى يوم</span>
              <input
                type="number"
                min="1"
                max="31"
                value={cycleEndDay}
                onChange={(e) => setCycleEndDay(e.target.value)}
                style={{ width: '65px', padding: '9px 8px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, textAlign: 'center', fontSize: '14px' }}
              />
            </div>
          </div>

          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSavePolicy}
              disabled={isSavingPolicy}
              style={{ padding: '10px 22px', borderRadius: '8px', fontWeight: 800, fontSize: '13.5px', height: '42px' }}
            >
              {isSavingPolicy ? 'جاري الحفظ...' : '💾 حفظ وتعميم السياسة'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters & Search Toolbar ── */}
      <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 700, fontSize: '13px' }}
            />
          </div>

          {!isBranchManager && (
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 600 }}
            >
              <option value="">🏢 جميع الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          <select
            value={filterEmployeeId}
            onChange={(e) => setFilterEmployeeId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 600 }}
          >
            <option value="">👤 جميع الموظفين</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 600 }}
          >
            <option value="all">🔍 جميع الحالات</option>
            <option value="pending">⏳ قيد الانتظار</option>
            <option value="approved">✅ معتمد</option>
            <option value="rejected">❌ مرفوض</option>
            <option value="exceptional">🌟 أذونات استثنائية</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 600 }}
          >
            <option value="all">⏰ كل الأنواع</option>
            <option value="late">🚪 إذن تأخير</option>
            <option value="early">🏃 إذن انصراف مبكر</option>
          </select>
        </div>

        <div>
          <input
            type="text"
            placeholder="🔍 بحث بالاسم أو السبب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', width: '220px', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* ── Table of Permissions ── */}
      <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)', color: 'var(--text)' }}>
                <th style={{ padding: '12px 14px' }}>#</th>
                <th style={{ padding: '12px 14px' }}>الموظف</th>
                <th style={{ padding: '12px 14px' }}>الفرع</th>
                <th style={{ padding: '12px 14px' }}>التاريخ واليوم</th>
                <th style={{ padding: '12px 14px' }}>نوع الإذن</th>
                <th style={{ padding: '12px 14px' }}>فترة الإذن</th>
                <th style={{ padding: '12px 14px' }}>المدة المحسوبة</th>
                <th style={{ padding: '12px 14px' }}>رصيد الشهر</th>
                <th style={{ padding: '12px 14px' }}>الحالة والاعتماد</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏰</div>
                    لا توجد أذونات مسجلة مطابقة لمعايير البحث الحالية في شهر {selectedMonth}.
                  </td>
                </tr>
              ) : (
                filteredPermissions.map((perm, idx) => {
                  const usedCount = employeeUsageMap.get(String(perm.employeeId)) || 0;
                  const isApproved = perm.status === 'approved' || perm.adminApproved;
                  const isPending = perm.status === 'pending' && !perm.adminApproved;
                  const isRejected = perm.status === 'rejected' || perm.isRejected;

                  return (
                    <tr
                      key={perm.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: perm.isExceptional ? 'rgba(147, 51, 234, 0.03)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text)' }}>{perm.employeeName || perm.empObj?.name || '—'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>كود: {perm.employeeCode || perm.empObj?.code || '—'}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--primary-dark)' }}>
                        {perm.branchName}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700 }}>📅 {perm.reqDate}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{perm.reqDate && arabicWeekday(perm.reqDate)}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {perm.isExceptional ? (
                          <span style={{ background: 'rgba(147, 51, 234, 0.15)', color: '#7e22ce', border: '1px solid rgba(147, 51, 234, 0.3)', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800 }}>
                            🌟 إذن استثنائي
                          </span>
                        ) : perm.permType === 'early' ? (
                          <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                            🏃 انصراف مبكر
                          </span>
                        ) : (
                          <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                            🚪 تأخير عن الوردية
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1e293b' }}>
                        من {perm.startTime || perm.fromTime || '—'} إلى {perm.endTime || perm.toTime || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ background: 'var(--background)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '6px', fontWeight: 800, color: 'var(--primary-dark)' }}>
                          ⏱️ {perm.computedDurationText}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: usedCount >= maxMonthlyCount ? '#dc2626' : '#059669' }}>
                          {usedCount} من {maxMonthlyCount} إذن
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {isApproved && (
                          <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#047857', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                            ✅ معتمد ومعدل بالبصمة
                          </span>
                        )}
                        {isPending && (
                          <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                            ⏳ بانتظار الاعتماد
                          </span>
                        )}
                        {isRejected && (
                          <span style={{ background: 'rgba(220, 38, 38, 0.15)', color: '#b91c1c', border: '1px solid rgba(220, 38, 38, 0.3)', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                            ❌ مرفوض
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setPreviewReq(perm)}
                            title="معاينة تفاصيل الإذن في نافذة منبثقة"
                            style={{ padding: '4px 8px', fontSize: '13px', background: 'var(--background)', border: '1px solid var(--border)' }}
                          >
                            👁️ معاينة
                          </button>
                          {isPending && (
                            <>
                              <button
                                type="button"
                                className="btn btn-start"
                                onClick={() => handleApprovePermission(perm.id)}
                                title="اعتماد الإذن وتعديل البصمة"
                                style={{ padding: '4px 8px', fontSize: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px' }}
                              >
                                ✅
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => handleRejectPermission(perm.id)}
                                title="رفض الإذن"
                                style={{ padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px' }}
                              >
                                ❌
                              </button>
                            </>
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
      </div>

      {/* ── Modal: معاينة تفاصيل الإذن في نافذة منبثقة ── */}
      {previewReq && (
        <div className="modal-overlay" onClick={() => setPreviewReq(null)} style={{ zIndex: 1100 }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', width: '92%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '2px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>⏰</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-dark)', fontWeight: 800 }}>
                    تفاصيل ومعاينة إذن الموظف
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    معرف الإذن: #{previewReq.id}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPreviewReq(null)}
                style={{ padding: '6px 12px', fontWeight: 800 }}
              >
                ✕ إغلاق
              </button>
            </div>

            {/* Employee Info */}
            <div style={{ background: 'var(--background)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>اسم الموظف:</span>
                  <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '14px' }}>
                    👤 {previewReq.employeeName || previewReq.empObj?.name || '—'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>الكود الوظيفي:</span>
                  <div style={{ fontWeight: 800, color: 'var(--text)' }}>
                    {previewReq.employeeCode || previewReq.empObj?.code || '—'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>الفرع:</span>
                  <div style={{ fontWeight: 800, color: 'var(--primary-dark)' }}>
                    🏢 {previewReq.branchName}
                  </div>
                </div>
              </div>
            </div>

            {/* Time & Duration Box */}
            <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, color: '#92400e', fontSize: '14.5px', fontWeight: 800 }}>
                  ⏱️ توقيت وفترة الإذن المصرح بها:
                </h4>
                {previewReq.isExceptional && (
                  <span style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                    🌟 إذن استثنائي
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#92400e' }}>تاريخ اليوم:</span>
                  <div style={{ fontWeight: 800, color: '#78350f' }}>
                    📅 {previewReq.reqDate} ({previewReq.reqDate && arabicWeekday(previewReq.reqDate)})
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#92400e' }}>ساعات الإذن:</span>
                  <div style={{ fontWeight: 800, color: '#78350f' }}>
                    من <strong>{previewReq.startTime || '08:00'}</strong> إلى <strong>{previewReq.endTime || '10:00'}</strong>
                  </div>
                </div>
                <div style={{ background: '#fef3c7', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                  <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 800 }}>إجمالي مدة الإذن:</span>
                  <div style={{ fontWeight: 900, color: '#b45309', fontSize: '16px' }}>
                    ⏱️ {previewReq.computedDurationText}
                  </div>
                </div>
              </div>
            </div>

            {/* Reason */}
            <div style={{ marginBottom: '18px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                📝 شرح وسبب الإذن:
              </span>
              <div style={{ background: 'var(--background)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13.5px', color: 'var(--text)' }}>
                {previewReq.reason || 'لا يوجد شرح إضافي مذكور.'}
              </div>
            </div>

            {/* Punch & Lateness Sync Info */}
            <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px 14px', borderRadius: '10px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12.5px', color: '#065f46', fontWeight: 700 }}>
                💡 الأثر التلقائي على النظام:
              </div>
              <div style={{ fontSize: '12px', color: '#047857', marginTop: '4px' }}>
                عند اعتماد هذا الإذن، يتم تلقائياً تعديل بصمة يوم {previewReq.reqDate} باحتساب ساعات الإذن وإلغاء أي خصم لائحي ناتج عن التأخير أو الانصراف المبكر بنسبة 100%.
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPreviewReq(null)}
                style={{ padding: '8px 16px', fontWeight: 700 }}
              >
                إغلاق
              </button>
              {(!previewReq.status || previewReq.status === 'pending') && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => handleRejectPermission(previewReq.id)}
                    style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', fontWeight: 800, padding: '8px 16px' }}
                  >
                    ❌ رفض الإذن
                  </button>
                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={() => handleApprovePermission(previewReq.id)}
                    style={{ background: '#10b981', color: '#fff', border: 'none', fontWeight: 800, padding: '8px 20px' }}
                  >
                    ✅ اعتماد وتعديل البصمة
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Modal: نموذج إنشاء إذن استثنائي لموظف ── */}
      {showExceptionalModal && (
        <div className="modal-overlay" onClick={() => setShowExceptionalModal(false)} style={{ zIndex: 1100 }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '92%', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '2px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>✨</span>
                <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-dark)', fontWeight: 800 }}>
                  إصدار إذن استثنائي معتمد لموظف
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowExceptionalModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExceptionalPermission} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Employee Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  👤 اختر الموظف: <span style={{ color: 'red' }}>*</span>
                </label>
                <select
                  value={excEmpId}
                  onChange={(e) => setExcEmpId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: 600 }}
                >
                  <option value="">-- اضغط لاختيار الموظف --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (كود: {e.code}) - {branches.find(b => b.id === e.branchId)?.name || 'الفرع الرئيسي'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  📅 تاريخ الإذن: <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="date"
                  value={excDate}
                  onChange={(e) => setExcDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: 700 }}
                />
              </div>

              {/* Type */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  ⏰ نوع الإذن:
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="excType"
                      checked={excPermType === 'late'}
                      onChange={() => setExcPermType('late')}
                    />
                    🚪 إذن تأخير عن موعد بداية الوردية
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="excType"
                      checked={excPermType === 'early'}
                      onChange={() => setExcPermType('early')}
                    />
                    🏃 إذن انصراف مبكر قبل نهاية الوردية
                  </label>
                </div>
              </div>

              {/* Time Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                    من الساعة:
                  </label>
                  <input
                    type="time"
                    value={excStartTime}
                    onChange={(e) => setExcStartTime(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                    إلى الساعة:
                  </label>
                  <input
                    type="time"
                    value={excEndTime}
                    onChange={(e) => setExcEndTime(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: 700 }}
                  />
                </div>
              </div>

              {/* Duration Preview */}
              <div style={{ background: '#fef3c7', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>إجمالي مدة الإذن المحسوبة:</span>
                <span style={{ fontSize: '15px', fontWeight: 900, color: '#b45309' }}>
                  ⏱️ {computeDurationObj(excStartTime, excEndTime).text}
                </span>
              </div>

              {/* Reason */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  📝 سبب منح الإذن الاستثنائي:
                </label>
                <textarea
                  rows="3"
                  value={excReason}
                  onChange={(e) => setExcReason(e.target.value)}
                  placeholder="اكتب سبب الاستثناء أو ملاحظات الإدارة..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowExceptionalModal(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={excSubmitting}
                  className="btn btn-start"
                  style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '8px', fontWeight: 800 }}
                >
                  {excSubmitting ? 'جاري الإصدار والتطبيق...' : '✨ إصدار واعتماد فوري'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
