import React, { useState, useMemo } from 'react';
import {
  DEFAULT_DISCIPLINARY_CATEGORIES,
  getEmployeeDailyRate,
  calculateViolationCounter,
  getEmployeeDisciplinarySummary
} from '../../utils/disciplinaryPenaltyEngine';
import DisciplinaryViolationModal from './DisciplinaryViolationModal';

export default function DisciplinaryPenaltiesTab({
  state,
  setState,
  saveState,
  showToast,
  userRole = 'admin',
  currentBranchId = null,
  filterFn = null,
  monthPicker = null,
  customFrom = '',
  customTo = ''
}) {
  const isAdmin = userRole === 'admin';
  const isBranch = userRole === 'branch';

  const employees = state.employees || [];
  const branches = state.branches || [];
  const policy = state.disciplinaryPolicy || DEFAULT_DISCIPLINARY_CATEGORIES;

  // Active Sub-Tab
  const [subTab, setSubTab] = useState('dashboard'); // 'dashboard' | 'matrix' | 'counters' | 'records' | 'report'

  // Modal State
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [targetEmpForModal, setTargetEmpForModal] = useState(null);

  // Cancellation Modal State
  const [cancellingPenalty, setCancellingPenalty] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // Audit Detail Modal State
  const [inspectedPenalty, setInspectedPenalty] = useState(null);

  // Filters State for Records
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBranch, setFilterBranch] = useState(currentBranchId ? String(currentBranchId) : '');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending_admin' | 'approved' | 'rejected' | 'cancelled'
  const [filterCategory, setFilterCategory] = useState('all');
  const [reportMonth, setReportMonth] = useState(monthPicker || new Date().toISOString().slice(0, 7));

  // Expanded employee in counters tab
  const [expandedEmpId, setExpandedEmpId] = useState(null);

  // Extract all disciplinary penalties from state.requests
  const allDisciplinaryPenalties = useMemo(() => {
    const list = (state.requests || []).filter(
      (r) => r.type === 'disciplinary_penalty' || r.subType === 'disciplinary_penalty'
    );
    return list.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
  }, [state.requests]);

  // Filtered penalties for records and reports
  const filteredPenalties = useMemo(() => {
    return allDisciplinaryPenalties.filter((p) => {
      // Branch filter
      if (currentBranchId && String(p.branchId) !== String(currentBranchId)) {
        const emp = employees.find((e) => String(e.id) === String(p.employeeId));
        const inBranchDetails = emp?.branchesDetails && emp.branchesDetails.some((b) => String(b.branchId) === String(currentBranchId));
        if (!inBranchDetails) return false;
      } else if (filterBranch && String(p.branchId) !== String(filterBranch)) {
        return false;
      }

      // Status filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'pending_admin' && p.status !== 'pending_admin' && p.status !== 'pending') return false;
        if (filterStatus === 'approved' && p.status !== 'approved' && !p.adminApproved) return false;
        if (filterStatus === 'rejected' && p.status !== 'rejected') return false;
        if (filterStatus === 'cancelled' && p.status !== 'cancelled' && !p.isCancelled) return false;
      }

      // Category filter
      if (filterCategory !== 'all' && p.categoryId !== filterCategory && p.categoryCode !== filterCategory) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (p.employeeName || '').toLowerCase().includes(q);
        const matchCode = (p.employeeCode || '').toLowerCase().includes(q);
        const matchRule = (p.ruleTitle || '').toLowerCase().includes(q);
        const matchReason = (p.reason || '').toLowerCase().includes(q);
        const matchAction = (p.actionTitle || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchRule && !matchReason && !matchAction) return false;
      }

      return true;
    });
  }, [allDisciplinaryPenalties, currentBranchId, filterBranch, filterStatus, filterCategory, searchQuery, employees]);

  // Analytics Metrics
  const currentMonthStr = monthPicker || new Date().toISOString().slice(0, 7);
  const currentMonthPenalties = useMemo(() => {
    return allDisciplinaryPenalties.filter((p) => (p.date || p.createdAt || '').startsWith(currentMonthStr));
  }, [allDisciplinaryPenalties, currentMonthStr]);

  const approvedMonthPenalties = currentMonthPenalties.filter((p) => p.status === 'approved' || p.adminApproved);
  const totalMonthDeductionAmount = approvedMonthPenalties.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const pendingApprovalsCount = allDisciplinaryPenalties.filter((p) => p.status === 'pending_admin' || p.status === 'pending').length;

  // Employees with 3+ violations in any category
  const criticalEmployees = useMemo(() => {
    const list = [];
    employees.forEach((emp) => {
      const summary = getEmployeeDisciplinarySummary(emp.id, state.requests || [], policy);
      const highCategories = Object.values(summary).filter((c) => c.activeCount >= 3);
      if (highCategories.length > 0) {
        list.push({
          emp,
          highCategories,
          totalCount: Object.values(summary).reduce((a, b) => a + b.activeCount, 0)
        });
      }
    });
    return list;
  }, [employees, state.requests, policy]);

  // ── Actions ──
  const handleApprovePenalty = async (pen) => {
    const reqId = pen.id;
    const emp = employees.find((e) => String(e.id) === String(pen.employeeId));
    const amount = parseFloat(pen.amount) || 0;
    const dailyRate = pen.dailyRate || getEmployeeDailyRate(emp, pen.branchId);

    // Update Request
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === reqId) {
        return {
          ...r,
          status: 'approved',
          adminApproved: true,
          approvedAt: new Date().toISOString(),
          approvedBy: 'الإدارة العليا',
          auditLog: [
            ...(r.auditLog || []),
            {
              action: 'approved',
              by: 'الإدارة العليا',
              role: 'admin',
              timestamp: new Date().toISOString(),
              note: 'تم اعتماد وتطبيق الجزاء التأديبي من الإدارة العليا'
            }
          ]
        };
      }
      return r;
    });

    // Create Adjustment entry if financial deduction
    let updatedAdjustments = state.adjustments || [];
    if (amount > 0) {
      const adjDesc = `خصم جزاء تأديبي: ${pen.categoryCode || ''} - ${pen.ruleTitle || ''} (المرة ${pen.occurrenceNumber || 1})`;
      const newAdj = {
        id: `adj_disc_${reqId}`,
        requestId: reqId,
        employeeId: pen.employeeId,
        employeeName: pen.employeeName,
        branchId: pen.branchId,
        type: 'deduction',
        subType: 'disciplinary_penalty',
        amount: amount,
        deductionDays: pen.deductionDays || 0,
        dailyRate: dailyRate,
        description: adjDesc,
        notes: adjDesc,
        reason: adjDesc,
        date: pen.date || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      };
      updatedAdjustments = [newAdj, ...updatedAdjustments];
    }

    const updatedState = {
      ...state,
      requests: updatedRequests,
      adjustments: updatedAdjustments
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم اعتماد وتطبيق الجزاء التأديبي وترحيل الخصم لمسير الأجور بنجاح');
  };

  const handleRejectPenalty = async (pen) => {
    const reason = window.prompt('يرجى كتابة سبب رفض مقترح الجزاء التأديبي:');
    if (reason === null) return;

    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === pen.id) {
        return {
          ...r,
          status: 'rejected',
          adminApproved: false,
          rejectedAt: new Date().toISOString(),
          rejectedBy: 'الإدارة العليا',
          rejectionReason: reason || 'تم الرفض بقرار الإدارة العليا',
          auditLog: [
            ...(r.auditLog || []),
            {
              action: 'rejected',
              by: 'الإدارة العليا',
              role: 'admin',
              timestamp: new Date().toISOString(),
              note: `تم رفض المخالفة: ${reason || 'بدون سبب إضافي'}`
            }
          ]
        };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('❌ تم رفض مقترح الجزاء التأديبي وإلغاؤه');
  };

  const handleConfirmCancelPenalty = async () => {
    if (!cancellingPenalty) return;
    if (!cancellationReason.trim()) {
      showToast?.('⚠️ يجب إدخال سبب إلغاء الجزاء التأديبي لتوثيقه في سجل التدقيق');
      return;
    }

    const penId = cancellingPenalty.id;

    // Update Request to Cancelled
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === penId) {
        return {
          ...r,
          status: 'cancelled',
          isCancelled: true,
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'الإدارة العليا',
          cancellationReason: cancellationReason.trim(),
          auditLog: [
            ...(r.auditLog || []),
            {
              action: 'cancelled',
              by: 'الإدارة العليا',
              role: 'admin',
              timestamp: new Date().toISOString(),
              note: `تم إلغاء الجزاء التأديبي: ${cancellationReason.trim()}`
            }
          ]
        };
      }
      return r;
    });

    // Remove any corresponding adjustment entry from adjustments array
    const updatedAdjustments = (state.adjustments || []).filter((a) => {
      if (a.requestId === penId || a.id === `adj_disc_${penId}`) return false;
      return true;
    });

    const updatedState = {
      ...state,
      requests: updatedRequests,
      adjustments: updatedAdjustments
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setCancellingPenalty(null);
    setCancellationReason('');
    showToast?.('✅ تم إلغاء الجزاء وسحب الخصم من مسير الأجور وتوثيق الإلغاء في سجل التدقيق');
  };

  // Export Monthly Report to CSV/Excel
  const handleExportCSV = () => {
    const reportPenalties = allDisciplinaryPenalties.filter((p) => {
      const dateMatches = (p.date || p.createdAt || '').startsWith(reportMonth);
      if (!dateMatches) return false;
      if (filterBranch && String(p.branchId) !== String(filterBranch)) return false;
      return true;
    });

    if (reportPenalties.length === 0) {
      showToast?.('لا توجد بيانات جزاءات لهذا الشهر للتصدير');
      return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'كود الموظف,اسم الموظف,الفرع,التاريخ,فئة المخالفة,نوع المخالفة,تكرار المخالفة,الإجراء المتخذ,أيام الخصم,قيمة الخصم (ج.م),الحالة,المسؤول\n';

    reportPenalties.forEach((p) => {
      const emp = employees.find((e) => String(e.id) === String(p.employeeId));
      const bObj = branches.find((b) => String(b.id) === String(p.branchId));
      const statusLabel = p.status === 'approved' ? 'معتمد' : p.status === 'rejected' ? 'مرفوض' : p.status === 'cancelled' ? 'ملغي' : 'معلق';
      
      const row = [
        `"${p.employeeCode || emp?.code || ''}"`,
        `"${p.employeeName || emp?.name || ''}"`,
        `"${bObj?.name || 'الفرع الرئيسي'}"`,
        `"${p.date || ''}"`,
        `"${p.categoryName || ''}"`,
        `"${p.ruleTitle || ''}"`,
        `"المرة ${p.occurrenceNumber || 1}"`,
        `"${p.actionTitle || ''}"`,
        `"${p.deductionDays || 0}"`,
        `"${p.amount || 0}"`,
        `"${statusLabel}"`,
        `"${p.createdByName || ''}"`
      ];
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `تقرير_الجزاءات_التأديبية_${reportMonth}.csv`;
    link.click();
    showToast?.('📥 تم تصدير تقرير الجزاءات التأديبية بنجاح');
  };

  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Sub Navigation Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface-muted)',
          padding: '10px 14px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${subTab === 'dashboard' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setSubTab('dashboard')}
            style={{ fontSize: '13px', padding: '8px 14px' }}
          >
            📊 لوحة المؤشرات والإحصائيات
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'matrix' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setSubTab('matrix')}
            style={{ fontSize: '13px', padding: '8px 14px' }}
          >
            ⚖️ جدول الفئات ومصفوفة التصعيد
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'counters' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setSubTab('counters')}
            style={{ fontSize: '13px', padding: '8px 14px' }}
          >
            👥 سجل الموظفين وعدادات التكرار
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'records' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setSubTab('records')}
            style={{ fontSize: '13px', padding: '8px 14px', position: 'relative' }}
          >
            📋 سجل القرارات والاعتمادات
            {pendingApprovalsCount > 0 && (
              <span
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  marginRight: '6px',
                  fontWeight: 'bold'
                }}
              >
                {pendingApprovalsCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'report' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setSubTab('report')}
            style={{ fontSize: '13px', padding: '8px 14px' }}
          >
            📄 التقرير الشهري والتصدير
          </button>
        </div>

        <div>
          <button
            type="button"
            className="btn btn-start"
            style={{
              background: '#dc2626',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '13.5px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => {
              setTargetEmpForModal(null);
              setShowViolationModal(true);
            }}
          >
            ➕ {isAdmin ? 'توثيق وتطبيق جزاء تأديبي' : 'رفع مخالفة تأديبية'}
          </button>
        </div>
      </div>

      {/* ── SubTab 1: Dashboard & Analytics ── */}
      {subTab === 'dashboard' && (
        <div>
          {/* Top KPI Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '20px'
            }}
          >
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', borderRight: '4px solid #3b82f6' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'block' }}>مخالفات الشهر الحالي ({currentMonthStr})</span>
              <strong style={{ fontSize: '24px', color: '#1e293b', display: 'block', marginTop: '4px' }}>
                {currentMonthPenalties.length} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--muted)' }}>واقعة</span>
              </strong>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', borderRight: '4px solid #dc2626' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'block' }}>إجمالي الخصومات التأديبية المنفذة</span>
              <strong style={{ fontSize: '24px', color: '#dc2626', display: 'block', marginTop: '4px' }}>
                {totalMonthDeductionAmount.toLocaleString()} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>ج.م</span>
              </strong>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', borderRight: '4px solid #ea580c' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'block' }}>طلبات معلقة بانتظار الاعتماد</span>
              <strong style={{ fontSize: '24px', color: pendingApprovalsCount > 0 ? '#ea580c' : '#10b981', display: 'block', marginTop: '4px' }}>
                {pendingApprovalsCount} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--muted)' }}>طلب</span>
              </strong>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', borderRight: '4px solid #8b5cf6' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'block' }}>إجمالي السجل التأديبي التراكمي</span>
              <strong style={{ fontSize: '24px', color: '#7c3aed', display: 'block', marginTop: '4px' }}>
                {allDisciplinaryPenalties.length} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--muted)' }}>قرار</span>
              </strong>
            </div>
          </div>

          {/* Critical Warnings / Repetitions Alert */}
          {criticalEmployees.length > 0 && (
            <div
              style={{
                background: '#fff1f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '20px'
              }}
            >
              <h4 style={{ margin: '0 0 10px', color: '#991b1b', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ تنبيه تكرار المخالفات: موظفون وصلوا 3 مخالفات أو أكثر في فئة معينة ({criticalEmployees.length})
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {criticalEmployees.map(({ emp, highCategories }) => (
                  <div
                    key={emp.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fca5a5',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px'
                    }}
                  >
                    <strong>{emp.name} ({emp.code}): </strong>
                    {highCategories.map((c) => (
                      <span key={c.categoryId} className="badge badge-danger" style={{ marginRight: '6px' }}>
                        {c.categoryName.split('—')[0]}: {c.activeCount} مرات (المستوى القادم: {c.nextEscalationAction})
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Approvals Quick Table */}
          {pendingApprovalsCount > 0 && isAdmin && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, color: '#92400e', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⏳ طلبات جزاءات تأديبية مرفوعة من مديري الفروع بانتظار قرار الإدارة العليا ({pendingApprovalsCount})
                </h4>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: '12px', color: '#b45309' }}
                  onClick={() => {
                    setFilterStatus('pending_admin');
                    setSubTab('records');
                  }}
                >
                  استعراض في سجل القرارات ←
                </button>
              </div>

              <table className="bylaws-table" style={{ background: '#ffffff', borderRadius: '8px' }}>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الموظف</th>
                    <th>الفرع</th>
                    <th>نوع المخالفة</th>
                    <th>العداد</th>
                    <th>الإجراء المقترح</th>
                    <th>الخصم</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {allDisciplinaryPenalties
                    .filter((p) => p.status === 'pending_admin' || p.status === 'pending')
                    .map((pen) => {
                      const bObj = branches.find((b) => String(b.id) === String(pen.branchId));
                      return (
                        <tr key={pen.id}>
                          <td>{pen.date}</td>
                          <td><strong>{pen.employeeName}</strong> ({pen.employeeCode || '—'})</td>
                          <td>{bObj?.name || 'الفرع الرئيسي'}</td>
                          <td>
                            <span className="badge badge-primary">{pen.categoryCode || '—'}</span> {pen.ruleTitle}
                          </td>
                          <td>المرة {pen.occurrenceNumber || 1}</td>
                          <td><strong>{pen.actionTitle}</strong></td>
                          <td>
                            <span style={{ color: pen.amount > 0 ? '#dc2626' : 'var(--muted)', fontWeight: 'bold' }}>
                              {pen.amount > 0 ? `${pen.amount} ج.م` : 'بدون خصم'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-start"
                                style={{ padding: '4px 8px', fontSize: '12px', background: '#16a34a' }}
                                onClick={() => handleApprovePenalty(pen)}
                              >
                                ✅ اعتماد
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '4px 8px', fontSize: '12px', color: '#dc2626' }}
                                onClick={() => handleRejectPenalty(pen)}
                              >
                                ❌ رفض
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick Categories Overview Grid */}
          <div style={{ marginTop: '10px' }}>
            <h4 style={{ fontFamily: 'Cairo', color: 'var(--primary-dark)', marginBottom: '12px' }}>
              📂 الفئات المعتمدة للائحة الجزاءات التأديبية (A إلى J)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
              {policy.map((cat) => {
                const countInCat = allDisciplinaryPenalties.filter((p) => p.categoryId === cat.id || p.categoryCode === cat.code).length;
                return (
                  <div
                    key={cat.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      borderRight: `4px solid ${cat.color || '#3b82f6'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '14px', color: cat.color || 'inherit' }}>{cat.name}</strong>
                      <span className="badge badge-primary" style={{ fontSize: '11px' }}>{countInCat} واقعة مسجلة</span>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                      {cat.description}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: 'var(--muted)' }}>
                        ⏱️ تصفير العداد: <strong>{cat.resetMonths > 0 ? `${cat.resetMonths} شهر` : 'بدون تصفير'}</strong>
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '11.5px', color: 'var(--primary)' }}
                        onClick={() => {
                          setFilterCategory(cat.id);
                          setSubTab('matrix');
                        }}
                      >
                        عرض السلم والتصعيد ←
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SubTab 2: Regulation Matrix & Categories ── */}
      {subTab === 'matrix' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontFamily: 'Cairo', margin: '0 0 4px', color: 'var(--primary-dark)' }}>
                ⚖️ جدول فئات المخالفات وسلم التدرج التأديبي
              </h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
                تطبيق مبدأ التصعيد التدريجي المستقل لكل فئة: (تنبيه ← إنذار ← إنذار نهائي ← خصم ← تحقيق)
              </p>
            </div>
          </div>

          {/* Render Each Category Escalation Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {policy.map((cat) => (
              <div
                key={cat.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <div
                  style={{
                    background: cat.color ? `${cat.color}15` : '#f8fafc',
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: cat.color || 'var(--text)', fontSize: '16px' }}>
                      {cat.name}
                    </h4>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12.5px' }}>
                      {cat.description}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span className="badge badge-primary">
                      🔄 فترة تصفير العداد: {cat.resetMonths > 0 ? `${cat.resetMonths} شهر من آخر مخالفة` : 'لا تصفير (تراكمي)'}
                    </span>
                  </div>
                </div>

                <div style={{ padding: '16px 18px' }}>
                  {/* Common Rules Examples */}
                  <div style={{ marginBottom: '14px' }}>
                    <strong style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                      📌 أمثلة المخالفات الشائعة تحت هذه الفئة:
                    </strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {(cat.rules || []).map((r) => (
                        <span key={r.id} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px' }}>
                          • {r.title}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Escalation Ladder Table */}
                  <table className="bylaws-table">
                    <thead>
                      <tr>
                        <th style={{ width: '120px' }}>التكرار (العداد)</th>
                        <th>الإجراء التأديبي المعتمد</th>
                        <th>نسبة الخصم من الأجر الأساسي</th>
                        <th>ملاحظات وتوجيهات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cat.escalation || []).map((esc, idx) => (
                        <tr key={idx}>
                          <td>
                            <strong>المرة {esc.occurrence}</strong>
                          </td>
                          <td>
                            <strong style={{ color: esc.deductionDays > 0 ? '#dc2626' : '#1e293b' }}>
                              {esc.action}
                            </strong>
                          </td>
                          <td>
                            <span className={`badge ${esc.deductionDays > 0 ? 'badge-danger' : 'badge-warning'}`}>
                              {esc.deductionDays > 0 ? `خصم ${esc.deductionDays} يوم` : 'بدون خصم مالي'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: '12.5px' }}>
                            {esc.note || '—'}
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

      {/* ── SubTab 3: Employee Counters Records ── */}
      {subTab === 'counters' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontFamily: 'Cairo', margin: '0 0 4px', color: 'var(--primary-dark)' }}>
                👥 سجل الموظفين وعدادات التكرار المستقلة
              </h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
                استعراض بطاقات الموظفين وعدادات التكرار النشطة لكل فئة مخالفة على حدة مع سجل المخالفات التاريخي
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="🔍 بحث باسم الموظف أو الكود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', width: '220px' }}
              />
              {!currentBranchId && (
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- جميع الفروع --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Employee Cards Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {employees
              .filter((emp) => {
                if (currentBranchId && String(emp.branchId) !== String(currentBranchId)) {
                  const inMulti = emp.branchesDetails && emp.branchesDetails.some((b) => String(b.branchId) === String(currentBranchId));
                  if (!inMulti) return false;
                } else if (filterBranch && String(emp.branchId) !== String(filterBranch)) {
                  return false;
                }
                if (searchQuery.trim()) {
                  const q = searchQuery.trim().toLowerCase();
                  if (!emp.name.toLowerCase().includes(q) && !emp.code.toLowerCase().includes(q)) return false;
                }
                return true;
              })
              .map((emp) => {
                const bObj = branches.find((b) => String(b.id) === String(emp.branchId));
                const dailyRate = getEmployeeDailyRate(emp, currentBranchId || emp.branchId);
                const summary = getEmployeeDisciplinarySummary(emp.id, state.requests || [], policy);
                const empPenalties = allDisciplinaryPenalties.filter((p) => String(p.employeeId) === String(emp.id));
                const isExpanded = expandedEmpId === emp.id;

                const activeViolationsCount = Object.values(summary).reduce((sum, c) => sum + c.activeCount, 0);

                return (
                  <div
                    key={emp.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            background: activeViolationsCount > 0 ? '#fee2e2' : '#f0fdf4',
                            color: activeViolationsCount > 0 ? '#dc2626' : '#16a34a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '16px'
                          }}
                        >
                          {emp.name.slice(0, 1)}
                        </div>
                        <div>
                          <strong style={{ fontSize: '15px', color: 'var(--text)' }}>{emp.name}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '10px', marginTop: '2px' }}>
                            <span>الكود: <strong>{emp.code || '—'}</strong></span>
                            <span>الفرع: <strong>{bObj?.name || 'الفرع الرئيسي'}</strong></span>
                            <span>سعر اليوم: <strong>{dailyRate} ج.م</strong></span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={`badge ${activeViolationsCount > 0 ? 'badge-danger' : 'badge-success'}`}>
                          {activeViolationsCount > 0 ? `⚠️ ${activeViolationsCount} مخالفات نشطة` : '✨ سجل نظيف تماماً'}
                        </span>

                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => {
                            setTargetEmpForModal(emp.id);
                            setShowViolationModal(true);
                          }}
                        >
                          ➕ إضافة مخالفة
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => setExpandedEmpId(isExpanded ? null : emp.id)}
                        >
                          {isExpanded ? 'إخفاء السجل ▲' : `السجل التأديبي (${empPenalties.length}) ▼`}
                        </button>
                      </div>
                    </div>

                    {/* Category Counters Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '8px',
                        background: 'var(--surface-muted)',
                        padding: '10px',
                        borderRadius: '10px'
                      }}
                    >
                      {policy.map((cat) => {
                        const catSum = summary[cat.id] || { activeCount: 0, nextEscalationAction: 'تنبيه' };
                        const hasCount = catSum.activeCount > 0;
                        return (
                          <div
                            key={cat.id}
                            style={{
                              background: hasCount ? '#ffffff' : 'rgba(255,255,255,0.6)',
                              border: `1px solid ${hasCount ? cat.color || '#cbd5e1' : '#e2e8f0'}`,
                              borderRadius: '8px',
                              padding: '6px 8px',
                              textAlign: 'center'
                            }}
                          >
                            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                              فئة {cat.code}
                            </span>
                            <strong style={{ fontSize: '14px', color: hasCount ? '#dc2626' : '#64748b' }}>
                              {catSum.activeCount} {catSum.activeCount === 1 ? 'مرة' : 'مرات'}
                            </strong>
                            <span style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={catSum.nextEscalationAction}>
                              القادم: {catSum.nextEscalationAction}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expandable Disciplinary History Table */}
                    {isExpanded && (
                      <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                        <h5 style={{ margin: '0 0 8px', fontSize: '13.5px', color: 'var(--primary-dark)' }}>
                          📜 السجل التأديبي الكامل للموظف ({empPenalties.length} قرار مسجل):
                        </h5>

                        {empPenalties.length === 0 ? (
                          <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '8px' }}>
                            لا توجد مخالفات مسجلة للموظف في السجل التأديبي.
                          </div>
                        ) : (
                          <table className="bylaws-table" style={{ fontSize: '12.5px' }}>
                            <thead>
                              <tr>
                                <th>التاريخ</th>
                                <th>الفئة ونوع المخالفة</th>
                                <th>العداد</th>
                                <th>الإجراء</th>
                                <th>قيمة الخصم</th>
                                <th>المسؤول</th>
                                <th>الحالة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {empPenalties.map((p) => {
                                const isApproved = p.status === 'approved' || p.adminApproved;
                                const isCancelled = p.status === 'cancelled' || p.isCancelled;
                                return (
                                  <tr key={p.id} style={{ opacity: isCancelled ? 0.6 : 1 }}>
                                    <td>{p.date}</td>
                                    <td>
                                      <span className="badge badge-primary">{p.categoryCode}</span> {p.ruleTitle}
                                    </td>
                                    <td>المرة {p.occurrenceNumber || 1}</td>
                                    <td><strong>{p.actionTitle}</strong></td>
                                    <td>
                                      {p.amount > 0 ? (
                                        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{p.amount} ج.م ({p.deductionDays} يوم)</span>
                                      ) : (
                                        <span style={{ color: 'var(--muted)' }}>—</span>
                                      )}
                                    </td>
                                    <td>{p.createdByName || 'الإدارة'}</td>
                                    <td>
                                      {isCancelled ? (
                                        <span className="badge badge-danger">ملغي ({p.cancellationReason || ''})</span>
                                      ) : isApproved ? (
                                        <span className="badge badge-success">معتمد ومطبق</span>
                                      ) : (
                                        <span className="badge badge-warning">معلق</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── SubTab 4: Penalties Records & Audit Log ── */}
      {subTab === 'records' && (
        <div>
          {/* Filters Bar */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '14px 18px',
              marginBottom: '16px',
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              alignItems: 'center'
            }}
          >
            <div style={{ flex: '1 1 200px' }}>
              <input
                type="text"
                placeholder="🔍 بحث بالاسم، الكود، نوع المخالفة، أو الإجراء..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
              />
            </div>

            {!currentBranchId && (
              <div>
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- كل الفروع --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
              >
                <option value="all">-- جميع الحالات --</option>
                <option value="pending_admin">⏳ معلق بانتظار الاعتماد</option>
                <option value="approved">✅ معتمد ومطبق</option>
                <option value="cancelled">🚫 ملغي</option>
                <option value="rejected">❌ مرفوض</option>
              </select>
            </div>

            <div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
              >
                <option value="all">-- كل فئات المخالفات --</option>
                {policy.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Records Table */}
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الموظف</th>
                  <th>الفرع</th>
                  <th>فئة ونوع المخالفة</th>
                  <th>العداد والتكرار</th>
                  <th>الإجراء التأديبي</th>
                  <th>قيمة الخصم</th>
                  <th>منشئ المخالفة</th>
                  <th>الحالة</th>
                  <th>الإجراءات والتدقيق</th>
                </tr>
              </thead>
              <tbody>
                {filteredPenalties.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                      لا توجد قرارات أو مخالفات تأديبية مطابقة للبحث.
                    </td>
                  </tr>
                ) : (
                  filteredPenalties.map((pen) => {
                    const emp = employees.find((e) => String(e.id) === String(pen.employeeId));
                    const bObj = branches.find((b) => String(b.id) === String(pen.branchId));
                    const isApproved = pen.status === 'approved' || pen.adminApproved;
                    const isPending = pen.status === 'pending_admin' || pen.status === 'pending';
                    const isCancelled = pen.status === 'cancelled' || pen.isCancelled;
                    const isRejected = pen.status === 'rejected';

                    return (
                      <tr key={pen.id} style={{ opacity: isCancelled ? 0.6 : 1 }}>
                        <td>{pen.date}</td>
                        <td>
                          <strong>{pen.employeeName || emp?.name}</strong>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>
                            {pen.employeeCode || emp?.code || '—'}
                          </span>
                        </td>
                        <td>{bObj?.name || 'الفرع الرئيسي'}</td>
                        <td>
                          <span className="badge badge-primary">{pen.categoryCode || '—'}</span>
                          <strong style={{ display: 'block', fontSize: '12.5px', marginTop: '2px' }}>{pen.ruleTitle}</strong>
                          {pen.isOverride && (
                            <span className="badge badge-danger" style={{ fontSize: '10px', marginTop: '2px' }}>⚡ تجاوز تلقائي</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 'bold', color: '#047857' }}>المرة {pen.occurrenceNumber || 1}</span>
                        </td>
                        <td>
                          <strong style={{ color: pen.deductionDays > 0 ? '#dc2626' : '#1e293b' }}>
                            {pen.actionTitle}
                          </strong>
                        </td>
                        <td>
                          {pen.amount > 0 ? (
                            <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                              {pen.amount} ج.م
                              <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>
                                ({pen.deductionDays} يوم)
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: '12px' }}>{pen.createdByName || (pen.createdRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع')}</span>
                        </td>
                        <td>
                          {isCancelled ? (
                            <span className="badge badge-danger">ملغي</span>
                          ) : isRejected ? (
                            <span className="badge badge-danger">مرفوض</span>
                          ) : isApproved ? (
                            <span className="badge badge-success">معتمد ومطبق</span>
                          ) : (
                            <span className="badge badge-warning">معلق للاعتماد</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {/* Inspect / Audit log button */}
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '3px 8px', fontSize: '11.5px' }}
                              title="استعراض التفاصيل وسجل التدقيق"
                              onClick={() => setInspectedPenalty(pen)}
                            >
                              🔍 تفاصيل
                            </button>

                            {/* Admin Approval on pending */}
                            {isAdmin && isPending && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-start"
                                  style={{ padding: '3px 8px', fontSize: '11.5px', background: '#16a34a' }}
                                  onClick={() => handleApprovePenalty(pen)}
                                >
                                  ✅ اعتماد
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: '3px 8px', fontSize: '11.5px', color: '#dc2626' }}
                                  onClick={() => handleRejectPenalty(pen)}
                                >
                                  ❌ رفض
                                </button>
                              </>
                            )}

                            {/* Admin Reasoned Cancellation on approved */}
                            {isAdmin && isApproved && !isCancelled && (
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '3px 8px', fontSize: '11px', color: '#dc2626', borderColor: '#fca5a5' }}
                                title="إلغاء مسبب وسحب الخصم من الرواتب"
                                onClick={() => {
                                  setCancellingPenalty(pen);
                                  setCancellationReason('');
                                }}
                              >
                                🚫 إلغاء مسبب
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
        </div>
      )}

      {/* ── SubTab 5: Monthly Report & Export ── */}
      {subTab === 'report' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>📅 شهر التقرير:</label>
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              {!currentBranchId && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>🏢 تصفية الفرع:</label>
                  <select
                    value={filterBranch}
                    onChange={(e) => setFilterBranch(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  >
                    <option value="">-- جميع الفروع --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                className="btn btn-start"
                style={{ background: '#0284c7', color: '#ffffff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleExportCSV}
              >
                📊 تصدير التقرير الشهري (Excel / CSV)
              </button>
            </div>
          </div>

          {/* Monthly Summary Cards */}
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 14px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
              📑 تقرير الجزاءات التأديبية لشهر ({reportMonth})
            </h4>

            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الكود</th>
                  <th>الفرع</th>
                  <th>عدد المخالفات</th>
                  <th>مرات التكرار</th>
                  <th>إجمالي الخصم المالي</th>
                  <th>الحالة العامة</th>
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter((emp) => {
                    if (filterBranch && String(emp.branchId) !== String(filterBranch)) return false;
                    return true;
                  })
                  .map((emp) => {
                    const empMonthPenalties = allDisciplinaryPenalties.filter(
                      (p) => String(p.employeeId) === String(emp.id) && (p.date || p.createdAt || '').startsWith(reportMonth)
                    );
                    if (empMonthPenalties.length === 0) return null;

                    const totalDed = empMonthPenalties
                      .filter((p) => p.status === 'approved' || p.adminApproved)
                      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

                    const hasPending = empMonthPenalties.some((p) => p.status === 'pending_admin' || p.status === 'pending');
                    const bObj = branches.find((b) => String(b.id) === String(emp.branchId));

                    return (
                      <tr key={emp.id}>
                        <td><strong>{emp.name}</strong></td>
                        <td>{emp.code || '—'}</td>
                        <td>{bObj?.name || 'الفرع الرئيسي'}</td>
                        <td>{empMonthPenalties.length}</td>
                        <td>
                          {empMonthPenalties.map((p) => `المرة ${p.occurrenceNumber || 1}`).join('، ')}
                        </td>
                        <td>
                          <strong style={{ color: totalDed > 0 ? '#dc2626' : '#1e293b' }}>
                            {totalDed.toLocaleString()} ج.م
                          </strong>
                        </td>
                        <td>
                          {hasPending ? (
                            <span className="badge badge-warning">يحتوي طلبات معلقة</span>
                          ) : (
                            <span className="badge badge-success">مكتمل ومغلق</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                  .filter(Boolean)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Add New Disciplinary Violation ── */}
      {showViolationModal && (
        <DisciplinaryViolationModal
          isOpen={showViolationModal}
          onClose={() => {
            setShowViolationModal(false);
            setTargetEmpForModal(null);
          }}
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          userRole={userRole}
          currentBranchId={currentBranchId}
          preSelectedEmpId={targetEmpForModal}
        />
      )}

      {/* ── Modal: Reasoned Cancellation ── */}
      {cancellingPenalty && (
        <div className="modal-backdrop" onClick={() => setCancellingPenalty(null)}>
          <div className="modal-card" style={{ maxWidth: '520px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Cairo', margin: '0 0 12px', color: '#dc2626' }}>
              🚫 إلغاء جزاء تأديبي مسبب
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              سيتم إلغاء الجزاء، سحب أي خصم مالي مترتب عليه من مسير الأجور، وتوثيق سبب الإلغاء في سجل التدقيق الرسمي.
            </p>

            <div style={{ background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
              <div><strong>الموظف: </strong>{cancellingPenalty.employeeName}</div>
              <div><strong>المخالفة: </strong>{cancellingPenalty.ruleTitle}</div>
              <div><strong>قيمة الخصم: </strong>{cancellingPenalty.amount || 0} ج.م</div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
                سبب ومبررات الإلغاء <span style={{ color: 'red' }}>*</span>:
              </label>
              <textarea
                rows={3}
                placeholder="بيان أسباب التراجع أو إلغاء الجزاء وقبول المبررات..."
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setCancellingPenalty(null)}>
                تراجع
              </button>
              <button
                type="button"
                className="btn btn-start"
                style={{ background: '#dc2626', color: '#fff', fontWeight: 'bold' }}
                onClick={handleConfirmCancelPenalty}
              >
                تأكيد الإلغاء وسحب الخصم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Inspect & Audit Trail ── */}
      {inspectedPenalty && (
        <div className="modal-backdrop" onClick={() => setInspectedPenalty(null)}>
          <div className="modal-card" style={{ maxWidth: '620px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px' }}>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)' }}>
                🔍 تفاصيل القرار وسجل التدقيق (Audit Log)
              </h3>
              <button type="button" className="btn btn-ghost" onClick={() => setInspectedPenalty(null)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '13px', marginBottom: '16px' }}>
              <div><strong>رقم القرار: </strong>{inspectedPenalty.id}</div>
              <div><strong>الموظف: </strong>{inspectedPenalty.employeeName} ({inspectedPenalty.employeeCode || '—'})</div>
              <div><strong>التاريخ: </strong>{inspectedPenalty.date}</div>
              <div><strong>فئة المخالفة: </strong>{inspectedPenalty.categoryName}</div>
              <div><strong>نوع المخالفة: </strong>{inspectedPenalty.ruleTitle}</div>
              <div><strong>العداد: </strong>المرة {inspectedPenalty.occurrenceNumber || 1}</div>
              <div><strong>الإجراء: </strong>{inspectedPenalty.actionTitle}</div>
              <div><strong>الخصم المالي: </strong>{inspectedPenalty.amount || 0} ج.م ({inspectedPenalty.deductionDays || 0} يوم)</div>
            </div>

            {inspectedPenalty.details && (
              <div style={{ background: 'var(--surface-muted)', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>
                <strong>وصف الواقعة: </strong>{inspectedPenalty.details}
              </div>
            )}

            {inspectedPenalty.investigationNotes && (
              <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px', border: '1px solid #bfdbfe' }}>
                <strong>ملاحظات التحقيق: </strong>{inspectedPenalty.investigationNotes}
              </div>
            )}

            {inspectedPenalty.attachmentName && (
              <div style={{ fontSize: '13px', marginBottom: '12px' }}>
                <strong>📎 المرفقات: </strong>{inspectedPenalty.attachmentName}
              </div>
            )}

            {/* Audit Timeline */}
            <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>📜 سجل التدقيق الزمني (Audit Trail):</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(inspectedPenalty.auditLog || [
                  { action: 'created', by: inspectedPenalty.createdByName || 'المسؤول', timestamp: inspectedPenalty.createdAt, note: 'تسجيل المخالفة' }
                ]).map((log, i) => (
                  <div key={i} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '2px' }}>
                      <span>بواسطة: <strong>{log.by}</strong></span>
                      <span>{log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG') : '—'}</span>
                    </div>
                    <div>{log.note || log.action}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
