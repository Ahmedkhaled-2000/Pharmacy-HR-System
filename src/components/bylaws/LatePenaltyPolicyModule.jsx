import React, { useState, useMemo, useEffect } from 'react';
import {
  DEFAULT_LATE_PENALTY_POLICY,
  getEffectiveLatePolicy,
  classifyLateTier,
  getPenaltyForOccurrence,
  computeLatenessFinancialAmount,
  recalculateEmployeeCycleLateness,
  countEmployeeTierOccurrences
} from '../../utils/latePenaltyEngine';
import { fmt, isEmployeeActive } from '../../utils/formatters';
import { useUI } from '../../context/UIContext';

export default function LatePenaltyPolicyModule({
  state,
  setState,
  saveState,
  showToast,
  userRole = 'admin',
  currentEmpId = null,
  currentBranchId = null,
  filterFn = null,
  monthPicker = null,
  customFrom = '',
  customTo = '',
  executeWithOwnerGuard
}) {
  const { showConfirm } = useUI();
  const isAdmin = userRole === 'admin' || userRole === 'owner';
  const isBranchManager = userRole === 'branch';
  const isEmployee = userRole === 'employee';
  const isManagerOrAdmin = isAdmin || isBranchManager;

  const employees = state.employees || [];
  const branches = state.branches || [];

  // Scoped Employee for Employee Portal
  const loggedInEmp = useMemo(() => {
    if (!currentEmpId) return null;
    return employees.find((e) => String(e.id) === String(currentEmpId));
  }, [employees, currentEmpId]);

  // Multi-branch check for employee
  const isMultiBranchEmp = loggedInEmp?.branchesDetails && loggedInEmp.branchesDetails.length > 1;

  // Sub-tab: 'review' (سجل ومراجعة التأخيرات) | 'policy' (إعدادات وتخصيص اللائحة)
  const [subTab, setSubTab] = useState('review');

  // Filters State with strict role-based initial values
  const [filterBranch, setFilterBranch] = useState(currentBranchId || '');
  const [filterEmpId, setFilterEmpId] = useState(isEmployee ? (currentEmpId || '') : '');
  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Keep filterBranch and filterEmpId in sync with props
  useEffect(() => {
    if (isEmployee) {
      setFilterEmpId(currentEmpId || '');
      setFilterBranch(currentBranchId || '');
    } else if (isBranchManager) {
      setFilterBranch(currentBranchId || '');
    }
  }, [currentEmpId, currentBranchId, isEmployee, isBranchManager]);

  // Exception / Override Modal State
  const [selectedIncidentForEdit, setSelectedIncidentForEdit] = useState(null);
  const [overrideAction, setOverrideAction] = useState('grace');
  const [overrideDeductionMinutes, setOverrideDeductionMinutes] = useState(0);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideStatus, setOverrideStatus] = useState('modified');

  // Policy Editor State
  const effectivePolicy = useMemo(() => getEffectiveLatePolicy(state), [state.latePenaltyPolicy, state.bylaws, state.orgSettings]);
  const [policyDraft, setPolicyDraft] = useState(() => JSON.parse(JSON.stringify(effectivePolicy)));

  // Sync draft when state changes
  useEffect(() => {
    setPolicyDraft(JSON.parse(JSON.stringify(effectivePolicy)));
  }, [effectivePolicy]);

  // Target Employees based on strictly scoped role
  const targetEmployees = useMemo(() => {
    let list = employees.filter(isEmployeeActive);
    if (isEmployee) {
      return loggedInEmp ? [loggedInEmp] : [];
    }
    if (isBranchManager) {
      const bId = currentBranchId;
      return list.filter(
        (e) => String(e.branchId) === String(bId) || (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === String(bId)))
      );
    }
    // Admin
    if (filterBranch) {
      return list.filter(
        (e) => String(e.branchId) === String(filterBranch) || (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === String(filterBranch)))
      );
    }
    return list;
  }, [employees, loggedInEmp, isEmployee, isBranchManager, currentBranchId, filterBranch]);

  // Calculate & Synchronize all incidents for the active cycle with strict branch/employee scoping
  const allIncidents = useMemo(() => {
    const map = new Map();

    // 1. تضمين الوقائع المسجلة مسبقاً في state.lateIncidents والمتطابقة مع تصفية الفترة الحالية
    (state.lateIncidents || []).forEach((inc) => {
      if (filterFn && !filterFn(inc.date)) return;
      if (isEmployee) {
        if (String(inc.employeeId) !== String(currentEmpId)) return;
        if (filterBranch && String(inc.branchId) !== String(filterBranch)) return;
      } else if (isBranchManager) {
        if (String(inc.branchId) !== String(currentBranchId)) return;
        if (filterEmpId && String(inc.employeeId) !== String(filterEmpId)) return;
      } else {
        if (filterBranch && String(inc.branchId) !== String(filterBranch)) return;
        if (filterEmpId && String(inc.employeeId) !== String(filterEmpId)) return;
      }
      map.set(inc.id, inc);
    });

    // 2. فحص وإعادة حساب أي ورديات جديدة بالدورة
    let empsToProcess = targetEmployees;
    if (isEmployee) {
      empsToProcess = loggedInEmp ? [loggedInEmp] : [];
    } else if (filterEmpId) {
      empsToProcess = targetEmployees.filter((e) => String(e.id) === String(filterEmpId));
    }

    empsToProcess.forEach((emp) => {
      try {
        const { incidents } = recalculateEmployeeCycleLateness({
          employeeId: emp.id,
          cycleFilterFn: filterFn,
          state,
          payrollCycleId: monthPicker || 'current'
        });

        incidents.forEach((inc) => {
          if (filterFn && !filterFn(inc.date)) return;
          if (isEmployee) {
            if (filterBranch && String(inc.branchId) !== String(filterBranch)) return;
          } else if (isBranchManager) {
            if (String(inc.branchId) !== String(currentBranchId)) return;
          } else if (filterBranch) {
            if (String(inc.branchId) !== String(filterBranch)) return;
          }
          map.set(inc.id, inc);
        });
      } catch (e) {
        console.error('Error recalculating in policy module:', e);
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => b.date.localeCompare(a.date) || (b.actualPunchInTime || '').localeCompare(a.actualPunchInTime || '')
    );
  }, [state.lateIncidents, targetEmployees, loggedInEmp, isEmployee, isBranchManager, currentBranchId, filterBranch, filterEmpId, filterFn, monthPicker, state]);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return allIncidents.filter((inc) => {
      if (filterTier !== 'all' && inc.tierId !== filterTier && inc.tierKey !== filterTier) return false;
      if (filterStatus !== 'all' && inc.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (inc.employeeName || '').toLowerCase().includes(q);
        const matchesCode = (inc.employeeCode || '').includes(q);
        if (!matchesName && !matchesCode) return false;
      }
      return true;
    });
  }, [allIncidents, filterTier, filterStatus, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const summary = {
      tier_0_10: 0,
      tier_11_15: 0,
      tier_16_30: 0,
      tier_31_60: 0,
      tier_over_60: 0,
      totalIncidents: 0,
      totalDeductionMinutes: 0,
      totalFinancialAmount: 0,
      pendingCount: 0,
      approvedCount: 0,
      cancelledCount: 0
    };

    allIncidents.forEach((inc) => {
      summary.totalIncidents += 1;
      const key = inc.tierId || inc.tierKey;
      if (summary[key] !== undefined) {
        summary[key] += 1;
      }

      if (inc.status !== 'cancelled') {
        summary.totalDeductionMinutes += (parseFloat(inc.deductionMinutes) || 0);
        summary.totalFinancialAmount += (parseFloat(inc.penaltyAmount) || 0);
      }

      if (inc.status === 'pending') summary.pendingCount += 1;
      else if (inc.status === 'approved' || inc.status === 'modified') summary.approvedCount += 1;
      else if (inc.status === 'cancelled') summary.cancelledCount += 1;
    });

    return summary;
  }, [allIncidents]);

  // Handler: Run Full Recalculation and Persist
  const handleTriggerFullRecalculation = async () => {
    try {
      let updatedRequests = [...(state.requests || [])];
      const allNewIncidents = [];

      targetEmployees.forEach((emp) => {
        const res = recalculateEmployeeCycleLateness({
          employeeId: emp.id,
          cycleFilterFn: filterFn,
          state,
          payrollCycleId: monthPicker || 'current'
        });
        allNewIncidents.push(...res.incidents);
        updatedRequests = res.updatedRequests;
      });

      const updatedState = {
        ...state,
        lateIncidents: allNewIncidents,
        requests: updatedRequests
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('✅ تم إعادة احتساب وترتيب تكرارات التأخير بنجاح ومطابقة كافة الجداول الشهرية!');
    } catch (err) {
      console.error('Error during recalculation:', err);
      showToast?.('❌ حدث خطأ أثناء إعادة الاحتساب');
    }
  };

  // Handler: Save Override / Exception
  const handleSaveIncidentOverride = async () => {
    if (!selectedIncidentForEdit) return;
    if (!overrideReason.trim()) {
      showToast?.('⚠️ يرجى كتابة سبب التعديل أو الاستثناء لتوثيقه في سجل التدقيق');
      return;
    }

    const targetId = selectedIncidentForEdit.id;
    const emp = employees.find((e) => e.id === selectedIncidentForEdit.employeeId);
    const penaltyAmt = computeLatenessFinancialAmount(overrideDeductionMinutes, emp, selectedIncidentForEdit.branchId);

    const performSaveOverride = async () => {
      const updatedIncidents = (state.lateIncidents || []).map((inc) => {
        if (inc.id === targetId) {
          return {
            ...inc,
            actionType: overrideAction,
            actionLabel: overrideAction === 'grace' ? 'سماح (استثناء إداري)' : `خصم ${overrideDeductionMinutes} دقيقة`,
            deductionMinutes: parseFloat(overrideDeductionMinutes) || 0,
            deductionHours: Math.round(((parseFloat(overrideDeductionMinutes) || 0) / 60) * 100) / 100,
            penaltyAmount: penaltyAmt,
            status: overrideStatus,
            overrideReason: overrideReason.trim(),
            modifiedBy: {
              userId: currentEmpId || 'admin',
              userName: isAdmin ? 'الإدارة العليا' : (isBranchManager ? 'مدير الفرع' : 'المستخدم'),
              role: userRole
            },
            modifiedAt: new Date().toISOString()
          };
        }
        return inc;
      });

      // Also update associated request in state.requests
      const updatedRequests = (state.requests || []).map((r) => {
        if (r.id === `req_${targetId}`) {
          return {
            ...r,
            impactVal: parseFloat(overrideDeductionMinutes) || 0,
            deductionMinutes: parseFloat(overrideDeductionMinutes) || 0,
            amount: penaltyAmt,
            status: overrideStatus === 'cancelled' ? 'cancelled' : 'approved',
            adminApproved: overrideStatus !== 'cancelled',
            reason: `${r.reason} [تعديل إداري: ${overrideReason.trim()}]`
          };
        }
        return r;
      });

      const updatedState = {
        ...state,
        lateIncidents: updatedIncidents,
        requests: updatedRequests
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      setSelectedIncidentForEdit(null);
      showToast?.('✅ تم حفظ التعديل والاستثناء اللائحي بنجاح');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockDirectBonusDeduction',
        actionTitle: 'حفظ استثناء وتعديل جزاء تأخير',
        actionDetails: `الموظف: ${emp?.name || ''} - الإجراء: ${overrideAction}`,
        onExecute: performSaveOverride
      });
    } else {
      await performSaveOverride();
    }
  };

  // Handler: Save Policy Configuration
  const handleSavePolicy = async () => {
    const performSavePolicy = async () => {
      try {
        let updatedRequests = [...(state.requests || [])];
        const allNewIncidents = [];

        employees.forEach((emp) => {
          const res = recalculateEmployeeCycleLateness({
            employeeId: emp.id,
            cycleFilterFn: filterFn,
            state: { ...state, latePenaltyPolicy: policyDraft },
            payrollCycleId: monthPicker || 'current'
          });
          allNewIncidents.push(...res.incidents);
          updatedRequests = res.updatedRequests;
        });

        const updatedState = {
          ...state,
          latePenaltyPolicy: policyDraft,
          bylaws: {
            ...(state.bylaws || {}),
            latePenaltyPolicy: policyDraft
          },
          lateIncidents: allNewIncidents,
          requests: updatedRequests
        };

        if (setState) setState(updatedState);
        if (saveState) await saveState(updatedState);

        setSubTab('review');
        showToast?.('✅ تم حفظ التعديلات اللائحية وإعادة احتساب وتطبيق التأخيرات فورياً!');
      } catch (err) {
        console.error('Error saving policy:', err);
        showToast?.('❌ حدث خطأ أثناء حفظ السياسة');
      }
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'تعديل وحفظ لائحة وسياسة جزاءات التأخير',
        actionDetails: 'تحديث قواعد احتساب التأخير وتطبيقها على الموظفين',
        onExecute: performSavePolicy
      });
    } else {
      await performSavePolicy();
    }
  };

  // Handler: Restore Policy to Standard Defaults
  const handleRestoreDefaultPolicy = async () => {
    const isConfirmed = await showConfirm({
      title: 'استعادة لائحة جزاءات التأخير القياسية',
      message: 'هل ترغب بالتأكيد في استعادة اللائحة القياسية الافتراضية لجزاءات التأخير؟\nسيتم إعادة تعيين الشرائح وسلالم الخصم للوضع الافتراضي.',
      confirmText: 'استعادة اللائحة الافتراضية',
      cancelText: 'إلغاء وتراجع',
      type: 'warning',
      icon: '⏱️'
    });
    if (!isConfirmed) return;

    const performRestorePolicy = async () => {
      try {
        setPolicyDraft(JSON.parse(JSON.stringify(DEFAULT_LATE_PENALTY_POLICY)));
        let updatedRequests = [...(state.requests || [])];
        const allNewIncidents = [];

        employees.forEach((emp) => {
          const res = recalculateEmployeeCycleLateness({
            employeeId: emp.id,
            cycleFilterFn: filterFn,
            state: { ...state, latePenaltyPolicy: DEFAULT_LATE_PENALTY_POLICY },
            payrollCycleId: monthPicker || 'current'
          });
          allNewIncidents.push(...res.incidents);
          updatedRequests = res.updatedRequests;
        });

        const updatedState = {
          ...state,
          latePenaltyPolicy: DEFAULT_LATE_PENALTY_POLICY,
          bylaws: {
            ...(state.bylaws || {}),
            latePenaltyPolicy: DEFAULT_LATE_PENALTY_POLICY
          },
          lateIncidents: allNewIncidents,
          requests: updatedRequests
        };

        if (setState) setState(updatedState);
        if (saveState) await saveState(updatedState);

        setSubTab('review');
        showToast?.('🔄 تم استعادة سياسة جزاءات التأخير القياسية وإعادة احتساب السجلات بنجاح');
      } catch (err) {
        console.error('Error restoring default policy:', err);
        showToast?.('❌ حدث خطأ أثناء استعادة اللائحة');
      }
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'استعادة سياسة جزاءات التأخير الافتراضية',
        actionDetails: 'إعادة تعيين سياسة التأخير القياسية',
        onExecute: performRestorePolicy
      });
    } else {
      await performRestorePolicy();
    }
  };

  // Branch name for display
  const currentBranchObj = branches.find((b) => String(b.id) === String(currentBranchId || filterBranch));
  const currentBranchName = currentBranchObj ? currentBranchObj.name : '';

  return (
    <div className="late-penalty-module" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Header Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: '#fff',
        padding: '20px 24px',
        borderRadius: '16px',
        marginBottom: '22px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '24px' }}>⏱️</span>
            <h2 style={{ fontFamily: 'Cairo', margin: 0, fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>
              {isEmployee
                ? `سجل جزاءات وتأخيرات: ${loggedInEmp?.name || ''}`
                : isBranchManager
                ? `لائحة وجزاءات التأخير - فرع ${currentBranchName || ''}`
                : 'لائحة وجزاءات التأخير المستقلة (5 فئات)'}
            </h2>
            <span style={{
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              fontSize: '11px',
              padding: '3px 10px',
              borderRadius: '20px',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              fontWeight: 600
            }}>
              {isEmployee ? '👤 حساب الموظف' : isBranchManager ? `🏢 مدير فرع ${currentBranchName}` : '👑 الإدارة العامة'}
            </span>
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
            {isEmployee
              ? 'استعراض سجل تأخيراتك الشهرية المحسوبة طبقاً لجدول وردياتك وفئات التأخير المعتمدة'
              : 'نظام آلي متكامل لحساب التأخير مقارنة بالجدول الشهري، مع إعادة الاحتساب التلقائي وفصل الجزاء الزمني عن الخصم المالي'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {isManagerOrAdmin && (
            <button
              className="btn"
              onClick={handleTriggerFullRecalculation}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
              title="إعادة احتساب وترتيب التكرارات للدورة الحالية"
            >
              🔄 إعادة احتساب التأخيرات للدورة
            </button>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs (Policy settings tab only for Super Admin) */}
      {isAdmin && (
        <div style={{
          display: 'flex',
          gap: '10px',
          borderBottom: '2px solid var(--border)',
          paddingBottom: '12px',
          marginBottom: '22px'
        }}>
          <button
            className={`btn ${subTab === 'review' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab('review')}
            style={{
              fontFamily: 'Cairo',
              fontSize: '14px',
              padding: '8px 18px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📋 سجل ومراجعة التأخيرات ({filteredIncidents.length})
          </button>

          <button
            className={`btn ${subTab === 'policy' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab('policy')}
            style={{
              fontFamily: 'Cairo',
              fontSize: '14px',
              padding: '8px 18px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⚙️ تخصيص سياسة اللائحة والجزاءات
          </button>
        </div>
      )}

      {/* ── Sub-Tab 1: Audit & Review ── */}
      {subTab === 'review' && (
        <div>
          {/* Top KPI Metrics Cards (5 Tiers + Totals) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '24px'
          }}>
            {/* Card 1: 0-10 min */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px',
              borderRight: '4px solid #10b981'
            }}>
              <div style={{ color: '#059669', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                🟢 0 – 10 دقائق
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Cairo' }}>
                {metrics.tier_0_10} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>مرة</span>
              </div>
              <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>
                سماح دائم (بدون خصم)
              </div>
            </div>

            {/* Card 2: 11-15 min */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px',
              borderRight: '4px solid #3b82f6'
            }}>
              <div style={{ color: '#2563eb', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                🔵 11 – 15 دقيقة
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Cairo' }}>
                {metrics.tier_11_15} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>مرة</span>
              </div>
              <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>
                خصم بعد المرة 3
              </div>
            </div>

            {/* Card 3: 16-30 min */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px',
              borderRight: '4px solid #f59e0b'
            }}>
              <div style={{ color: '#d97706', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                🟠 16 – 30 دقيقة
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Cairo' }}>
                {metrics.tier_16_30} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>مرة</span>
              </div>
              <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '2px' }}>
                خصم بعد المرة 2
              </div>
            </div>

            {/* Card 4: 31-60 min */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid rgba(234, 88, 12, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px',
              borderRight: '4px solid #ea580c'
            }}>
              <div style={{ color: '#c2410c', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                🔴 31 – 60 دقيقة
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Cairo' }}>
                {metrics.tier_31_60} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>مرة</span>
              </div>
              <div style={{ fontSize: '11px', color: '#ea580c', marginTop: '2px' }}>
                خصم بعد المرة 1
              </div>
            </div>

            {/* Card 5: > 60 min */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px',
              borderRight: '4px solid #dc2626'
            }}>
              <div style={{ color: '#b91c1c', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                🟣 أكثر من 60 دقيقة
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Cairo' }}>
                {metrics.tier_over_60} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>مرة</span>
              </div>
              <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>
                خصم فوري / فصل عند 6
              </div>
            </div>

            {/* Card 6: Total Time Deduction & Financial Impact */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(30, 64, 175, 0.12) 100%)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px',
              borderRight: '4px solid #2563eb'
            }}>
              <div style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                ⏱️ إجمالي الخصم المالي
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af', fontFamily: 'Cairo' }}>
                {metrics.totalDeductionMinutes} دقيقة
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', marginTop: '2px' }}>
                ≈ {fmt(metrics.totalFinancialAmount)} ج.م
              </div>
            </div>
          </div>

          {/* Advanced Filter Bar (Scoped per role) */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '16px',
            borderRadius: '12px',
            marginBottom: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            alignItems: 'center'
          }}>
            {/* Search (For managers & admins) */}
            {!isEmployee && (
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>بحث بالاسم أو الكود</label>
                <input
                  type="text"
                  placeholder="ابحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
                />
              </div>
            )}

            {/* Branch Filter */}
            {isAdmin ? (
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>الفرع</label>
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
                >
                  <option value="">جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            ) : isEmployee && isMultiBranchEmp ? (
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>فرع العمل</label>
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
                >
                  <option value="">جميع فروعي ({loggedInEmp.branchesDetails.length} فروع)</option>
                  {loggedInEmp.branchesDetails.map((bd) => {
                    const bObj = branches.find((b) => b.id === bd.branchId);
                    return (
                      <option key={bd.branchId} value={bd.branchId}>
                        {bObj ? bObj.name : bd.branchName || bd.branchId}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}

            {/* Employee Filter (Admin & Branch Manager only) */}
            {!isEmployee && (
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>الموظف</label>
                <select
                  value={filterEmpId}
                  onChange={(e) => setFilterEmpId(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
                >
                  <option value="">جميع موظفي {isBranchManager ? `فرع ${currentBranchName}` : 'المؤسسة'}</option>
                  {targetEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter Tier */}
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', color: 'var(--muted)' }}>فئة التأخير</label>
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value)}
                style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
              >
                <option value="all">جميع الفئات الـ 5</option>
                <option value="tier_0_10">فئة 0 - 10 دقائق</option>
                <option value="tier_11_15">فئة 11 - 15 دقيقة</option>
                <option value="tier_16_30">فئة 16 - 30 دقيقة</option>
                <option value="tier_31_60">فئة 31 - 60 دقيقة</option>
                <option value="tier_over_60">فئة أكثر من 60 دقيقة</option>
              </select>
            </div>

            {/* Filter Status */}
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', color: 'var(--muted)' }}>حالة الجزاء</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: '7px 10px', fontSize: '13px', borderRadius: '8px' }}
              >
                <option value="all">جميع الحالات</option>
                <option value="approved">معتمد</option>
                <option value="pending">معلق</option>
                <option value="modified">معدل / مستثنى</option>
                <option value="cancelled">ملغى</option>
              </select>
            </div>
          </div>

          {/* Incidents Data Table */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontFamily: 'Cairo' }}>
                    <th style={{ padding: '12px 14px' }}>التاريخ</th>
                    {!isEmployee && <th style={{ padding: '12px 14px' }}>الموظف والفرع</th>}
                    {isEmployee && isMultiBranchEmp && <th style={{ padding: '12px 14px' }}>الفرع</th>}
                    <th style={{ padding: '12px 14px' }}>موعد الشيفت (المجدول)</th>
                    <th style={{ padding: '12px 14px' }}>الحضور الفعلي</th>
                    <th style={{ padding: '12px 14px' }}>دقائق التأخير</th>
                    <th style={{ padding: '12px 14px' }}>الفئة اللائحية</th>
                    <th style={{ padding: '12px 14px' }}>التكرار بالدورة</th>
                    <th style={{ padding: '12px 14px' }}>الجزاء اللائحي</th>
                    <th style={{ padding: '12px 14px' }}>الخصم المالي</th>
                    <th style={{ padding: '12px 14px' }}>الحالة</th>
                    {isManagerOrAdmin && <th style={{ padding: '12px 14px', textAlign: 'center' }}>الإجراءات</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredIncidents.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                        {isEmployee
                          ? 'سجل الحضور ممتاز! لا توجد وقائع تأخير مسجلة لك في هذه الفترة.'
                          : 'لا توجد وقائع تأخير مسجلة مطابقة لمعايير البحث الحالية.'}
                      </td>
                    </tr>
                  ) : (
                    filteredIncidents.map((inc) => (
                      <tr
                        key={inc.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: inc.status === 'cancelled' ? 'rgba(0,0,0,0.02)' : 'transparent',
                          opacity: inc.status === 'cancelled' ? 0.6 : 1
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                          {inc.date}
                        </td>
                        {!isEmployee && (
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{inc.employeeName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              كود: {inc.employeeCode} · {inc.branchName}
                            </div>
                          </td>
                        )}
                        {isEmployee && isMultiBranchEmp && (
                          <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--primary-dark)' }}>
                            {inc.branchName}
                          </td>
                        )}
                        <td style={{ padding: '12px 14px', color: '#2563eb', fontWeight: 600 }}>
                          ⏰ {inc.scheduledStartTime}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                          🚪 {inc.actualPunchInTime}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            background: inc.lateMinutes > 30 ? 'rgba(220, 38, 38, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: inc.lateMinutes > 30 ? '#dc2626' : '#d97706',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '12px'
                          }}>
                            {inc.lateMinutes} دقيقة
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            background: inc.tierColor ? `${inc.tierColor}18` : 'rgba(0,0,0,0.06)',
                            color: inc.tierColor || 'var(--text)',
                            border: `1px solid ${inc.tierColor || '#ccc'}40`,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '11px'
                          }}>
                            {inc.tierName}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{
                            background: 'var(--background)',
                            border: '1px solid var(--border)',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '12px'
                          }}>
                            {inc.occurrenceNumber > 0 ? `المرة #${inc.occurrenceNumber}` : '— (إذن)'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{
                            fontWeight: 700,
                            color: inc.actionType === 'grace' ? '#10b981' : (inc.actionType === 'termination' ? '#dc2626' : '#ea580c')
                          }}>
                            {inc.actionLabel}
                          </div>
                          {inc.deductionMinutes > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              خصم: {inc.deductionMinutes} دقيقة ({inc.deductionHours} ساعة)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: inc.penaltyAmount > 0 ? '#dc2626' : 'var(--muted)' }}>
                          {inc.penaltyAmount > 0 ? `${fmt(inc.penaltyAmount)} ج.م` : 'بدون خصم'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {inc.status === 'approved_permission_exempt' && (
                            <span style={{ background: 'rgba(16,185,129,0.15)', color: '#047857', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }} title={inc.overrideReason}>
                              ⏰ إذن معتمد (معفى من الخصم)
                            </span>
                          )}
                          {inc.status === 'approved' && (
                            <span style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                              ✅ معتمد
                            </span>
                          )}
                          {inc.status === 'pending' && (
                            <span style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                              ⏳ معلق
                            </span>
                          )}
                          {inc.status === 'modified' && (
                            <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }} title={inc.overrideReason}>
                              ✏️ مستثنى / معدل
                            </span>
                          )}
                          {inc.status === 'cancelled' && (
                            <span style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }} title={inc.overrideReason}>
                              🚫 ملغي
                            </span>
                          )}
                        </td>
                        {isManagerOrAdmin && (
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <button
                              className="btn btn-ghost"
                              onClick={() => {
                                setSelectedIncidentForEdit(inc);
                                setOverrideAction(inc.actionType || 'grace');
                                setOverrideDeductionMinutes(inc.deductionMinutes || 0);
                                setOverrideReason(inc.overrideReason || '');
                                setOverrideStatus(inc.status || 'approved');
                              }}
                              style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border)'
                              }}
                              title="تعديل أو استثناء الجزاء مع كتابة مبرر"
                            >
                              ⚙️ تعديل / استثناء
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Tab 2: Policy Matrix Settings (Admin Only) ── */}
      {subTab === 'policy' && isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)', fontSize: '18px' }}>
                ⚙️ تخصيص فئات وجداول جزاءات التأخير
              </h3>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                تتيح هذه الشاشة تعديل مدد الفئات، جدول الجزاءات لكل تكرار، وقيم الخصم بالدقائق بدون الحاجة لتعديل الكود البرمجي
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-ghost"
                onClick={handleRestoreDefaultPolicy}
                style={{ border: '1px solid var(--border)', fontSize: '13px' }}
              >
                🔄 استعادة اللائحة القياسية
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSavePolicy}
                style={{ fontSize: '13px', fontWeight: 700 }}
              >
                💾 حفظ التعديلات اللائحية
              </button>
            </div>
          </div>

          {/* Tiers List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {policyDraft.tiers.map((tier, tierIdx) => (
              <div
                key={tier.id}
                style={{
                  background: 'var(--background)',
                  border: `1px solid ${tier.color || 'var(--border)'}50`,
                  borderRadius: '14px',
                  padding: '18px',
                  borderRight: `6px solid ${tier.color || '#3b82f6'}`
                }}
              >
                {/* Tier Title & Minutes Range */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>🏷️</span>
                    <input
                      type="text"
                      value={tier.name}
                      onChange={(e) => {
                        const updated = [...policyDraft.tiers];
                        updated[tierIdx].name = e.target.value;
                        setPolicyDraft({ ...policyDraft, tiers: updated });
                      }}
                      style={{
                        fontFamily: 'Cairo',
                        fontWeight: 700,
                        fontSize: '15px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        width: '220px'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <span>نطاق الدقائق: من</span>
                    <input
                      type="number"
                      value={tier.minMinutes}
                      onChange={(e) => {
                        const updated = [...policyDraft.tiers];
                        updated[tierIdx].minMinutes = parseInt(e.target.value, 10) || 0;
                        setPolicyDraft({ ...policyDraft, tiers: updated });
                      }}
                      style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                    <span>إلى</span>
                    <input
                      type="number"
                      value={tier.maxMinutes}
                      onChange={(e) => {
                        const updated = [...policyDraft.tiers];
                        updated[tierIdx].maxMinutes = parseInt(e.target.value, 10) || 9999;
                        setPolicyDraft({ ...policyDraft, tiers: updated });
                      }}
                      style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                    <span>دقيقة</span>
                  </div>
                </div>

                {/* Occurrence Table for this Tier */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'right' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                        <th style={{ padding: '8px 10px', width: '90px' }}>رقم التكرار</th>
                        <th style={{ padding: '8px 10px', width: '140px' }}>نوع الإجراء</th>
                        <th style={{ padding: '8px 10px', width: '100px' }}>دقائق الخصم</th>
                        <th style={{ padding: '8px 10px' }}>نص الجزاء والوصف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tier.penalties.map((pen, pIdx) => (
                        <tr key={pen.occurrence} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                            {pen.isDefaultBeyond ? 'المرة 6 فأكثر' : `المرة رقم ${pen.occurrence}`}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <select
                              value={pen.action}
                              onChange={(e) => {
                                const updated = [...policyDraft.tiers];
                                updated[tierIdx].penalties[pIdx].action = e.target.value;
                                if (e.target.value === 'grace') {
                                  updated[tierIdx].penalties[pIdx].deductionMinutes = 0;
                                  updated[tierIdx].penalties[pIdx].label = 'سماح';
                                }
                                setPolicyDraft({ ...policyDraft, tiers: updated });
                              }}
                              style={{ padding: '4px 6px', fontSize: '12px', borderRadius: '6px', width: '100%' }}
                            >
                              <option value="grace">سماح (بدون خصم)</option>
                              <option value="deduction">خصم زمني (دقائق/ساعات)</option>
                              <option value="termination">فصل / تحقيق إداري</option>
                              <option value="warning">إنذار رسمي</option>
                            </select>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              disabled={pen.action === 'grace' || pen.action === 'termination'}
                              value={pen.deductionMinutes}
                              onChange={(e) => {
                                const updated = [...policyDraft.tiers];
                                const val = parseInt(e.target.value, 10) || 0;
                                updated[tierIdx].penalties[pIdx].deductionMinutes = val;
                                updated[tierIdx].penalties[pIdx].label = val >= 60 ? `خصم ${val / 60} ساعة (${val} دقيقة)` : `خصم ${val} دقيقة`;
                                setPolicyDraft({ ...policyDraft, tiers: updated });
                              }}
                              style={{ width: '80px', padding: '4px', textAlign: 'center', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="text"
                              value={pen.label}
                              onChange={(e) => {
                                const updated = [...policyDraft.tiers];
                                updated[tierIdx].penalties[pIdx].label = e.target.value;
                                setPolicyDraft({ ...policyDraft, tiers: updated });
                              }}
                              style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Exception / Override Modal ── */}
      {selectedIncidentForEdit && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)' }}>
                ⚙️ تعديل أو استثناء واقعة تأخير
              </h3>
              <button className="btn btn-ghost" onClick={() => setSelectedIncidentForEdit(null)}>✕</button>
            </div>

            <div style={{ background: 'var(--background)', padding: '12px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>
              <div><strong>الموظف:</strong> {selectedIncidentForEdit.employeeName} ({selectedIncidentForEdit.employeeCode})</div>
              <div><strong>التاريخ:</strong> {selectedIncidentForEdit.date} | <strong>الشيفت المجدول:</strong> {selectedIncidentForEdit.scheduledStartTime} | <strong>الحضور:</strong> {selectedIncidentForEdit.actualPunchInTime}</div>
              <div><strong>الفئة والتكرار:</strong> {selectedIncidentForEdit.tierName} (المرة #{selectedIncidentForEdit.occurrenceNumber})</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label>نوع الإجراء المحدث</label>
                <select
                  value={overrideAction}
                  onChange={(e) => {
                    setOverrideAction(e.target.value);
                    if (e.target.value === 'grace') setOverrideDeductionMinutes(0);
                  }}
                >
                  <option value="grace">سماح (استثناء إداري بدون خصم)</option>
                  <option value="deduction">خصم زمني مخصص</option>
                  <option value="termination">فصل / تحقيق إداري</option>
                </select>
              </div>

              {overrideAction === 'deduction' && (
                <div className="field">
                  <label>عدد دقائق الخصم</label>
                  <input
                    type="number"
                    value={overrideDeductionMinutes}
                    onChange={(e) => setOverrideDeductionMinutes(parseInt(e.target.value, 10) || 0)}
                    placeholder="مثال: 30"
                  />
                </div>
              )}

              <div className="field">
                <label>حالة الجزاء</label>
                <select value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}>
                  <option value="modified">معدل / استثناء معتمد</option>
                  <option value="cancelled">إلغاء الجزاء نهائياً</option>
                  <option value="approved">معتمد عادي</option>
                </select>
              </div>

              <div className="field">
                <label>سبب التعديل أو الاستثناء (إلزامي للتدقيق) *</label>
                <textarea
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="اكتب سبب الاستثناء أو التعديل (مثال: عطل بالمواصلات بإذن الإدارة / خطأ في تسجيل وقت البصمة)..."
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button className="btn btn-ghost" onClick={() => setSelectedIncidentForEdit(null)}>
                  إلغاء
                </button>
                <button className="btn btn-primary" onClick={handleSaveIncidentOverride}>
                  💾 حفظ وتوثيق التعديل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
