import React, { useState, useMemo, useEffect } from 'react';
import {
  DEFAULT_DISCIPLINARY_CATEGORIES,
  getEmployeeDailyRate,
  calculateViolationCounter
} from '../../utils/disciplinaryPenaltyEngine';

export default function DisciplinaryViolationModal({
  isOpen,
  onClose,
  state,
  setState,
  saveState,
  showToast,
  userRole = 'admin',
  currentBranchId = null,
  preSelectedEmpId = null,
  onViolationSaved = null
}) {
  const isAdmin = userRole === 'admin';
  const isBranch = userRole === 'branch';

  const employees = state.employees || [];
  const branches = state.branches || [];
  const policy = state.disciplinaryPolicy || DEFAULT_DISCIPLINARY_CATEGORIES;

  // Filter employees if branch manager
  const availableEmployees = useMemo(() => {
    if (isBranch && currentBranchId) {
      return employees.filter((emp) => {
        const directMatch = String(emp.branchId) === String(currentBranchId);
        const multiMatch = emp.branchesDetails && emp.branchesDetails.some((b) => String(b.branchId) === String(currentBranchId));
        return directMatch || multiMatch;
      });
    }
    return employees;
  }, [employees, isBranch, currentBranchId]);

  // Form State
  const [selectedEmpId, setSelectedEmpId] = useState(preSelectedEmpId ? String(preSelectedEmpId) : '');
  const [selectedCategoryId, setSelectedCategoryId] = useState(policy[0]?.id || 'cat_admin_simple');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [customRuleTitle, setCustomRuleTitle] = useState('');
  const [violationDate, setViolationDate] = useState(new Date().toISOString().slice(0, 10));
  const [incidentDetails, setIncidentDetails] = useState('');
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [attachmentName, setAttachmentName] = useState('');

  // Override / Gross Violation State
  const [isOverrideActive, setIsOverrideActive] = useState(false);
  const [overrideAction, setOverrideAction] = useState('خصم من الأجر الأساسي');
  const [overrideDeductionDays, setOverrideDeductionDays] = useState(1);
  const [deductionType, setDeductionType] = useState('days'); // 'days' | 'fixed_amount' | 'hours_minutes'
  const [deductionFixedAmount, setDeductionFixedAmount] = useState('');
  const [deductionHours, setDeductionHours] = useState(1);
  const [deductionMinutes, setDeductionMinutes] = useState(0);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (preSelectedEmpId) {
      setSelectedEmpId(String(preSelectedEmpId));
    }
  }, [preSelectedEmpId]);

  const selectedEmp = useMemo(() => {
    return employees.find((e) => String(e.id) === String(selectedEmpId)) || null;
  }, [employees, selectedEmpId]);

  const selectedCategory = useMemo(() => {
    return policy.find((c) => c.id === selectedCategoryId) || policy[0];
  }, [policy, selectedCategoryId]);

  // Default rule if category changes
  useEffect(() => {
    if (selectedCategory && selectedCategory.rules && selectedCategory.rules.length > 0) {
      setSelectedRuleId(selectedCategory.rules[0].id);
    } else {
      setSelectedRuleId('');
    }
  }, [selectedCategory]);

  // Calculation of Occurrence Counter & Suggested Action
  const counterResult = useMemo(() => {
    if (!selectedEmpId || !selectedCategoryId) return null;
    return calculateViolationCounter({
      employeeId: selectedEmpId,
      categoryId: selectedCategoryId,
      ruleId: selectedRuleId,
      allRequests: state.requests || [],
      disciplinaryPolicy: policy
    });
  }, [selectedEmpId, selectedCategoryId, selectedRuleId, state.requests, policy]);

  const dailyRate = useMemo(() => {
    return getEmployeeDailyRate(selectedEmp, currentBranchId || selectedEmp?.branchId);
  }, [selectedEmp, currentBranchId]);

  const empHoursPerDay = selectedEmp?.workHours || 8;
  const hourlyRate = useMemo(() => {
    const hours = parseFloat(empHoursPerDay) || 8;
    return hours > 0 ? Math.round((dailyRate / hours) * 100) / 100 : 0;
  }, [dailyRate, empHoursPerDay]);

  const effectiveDeductionDays = useMemo(() => {
    if (isOverrideActive) {
      if (overrideAction !== 'خصم من الأجر الأساسي') return 0;
      if (deductionType === 'days') {
        return parseFloat(overrideDeductionDays) || 0;
      }
      if (deductionType === 'fixed_amount') {
        const amt = parseFloat(deductionFixedAmount) || 0;
        return dailyRate > 0 ? Math.round((amt / dailyRate) * 100) / 100 : 0;
      }
      if (deductionType === 'hours_minutes') {
        const totalH = (parseFloat(deductionHours) || 0) + (parseFloat(deductionMinutes) || 0) / 60;
        const hoursInDay = parseFloat(empHoursPerDay) || 8;
        return hoursInDay > 0 ? Math.round((totalH / hoursInDay) * 100) / 100 : 0;
      }
    }
    return counterResult ? counterResult.deductionDays : 0;
  }, [isOverrideActive, overrideAction, deductionType, overrideDeductionDays, deductionFixedAmount, deductionHours, deductionMinutes, dailyRate, empHoursPerDay, counterResult]);

  const effectiveDeductionAmount = useMemo(() => {
    if (isOverrideActive) {
      if (overrideAction !== 'خصم من الأجر الأساسي') return 0;
      if (deductionType === 'fixed_amount') {
        return parseFloat(deductionFixedAmount) || 0;
      }
      if (deductionType === 'hours_minutes') {
        const totalH = (parseFloat(deductionHours) || 0) + (parseFloat(deductionMinutes) || 0) / 60;
        return Math.round(hourlyRate * totalH * 100) / 100;
      }
      return Math.round(dailyRate * (parseFloat(overrideDeductionDays) || 0) * 100) / 100;
    }
    return Math.round(dailyRate * effectiveDeductionDays * 100) / 100;
  }, [isOverrideActive, overrideAction, deductionType, deductionFixedAmount, deductionHours, deductionMinutes, hourlyRate, dailyRate, overrideDeductionDays, effectiveDeductionDays]);

  const effectiveActionName = useMemo(() => {
    if (isOverrideActive) {
      return overrideAction;
    }
    return counterResult ? counterResult.suggestedAction : 'تنبيه موثق';
  }, [isOverrideActive, overrideAction, counterResult]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedEmp) {
      showToast?.('⚠️ يرجى اختيار الموظف المخالف');
      return;
    }
    if (!selectedCategory) {
      showToast?.('⚠️ يرجى اختيار فئة المخالفة');
      return;
    }
    if (isOverrideActive && !overrideReason.trim()) {
      showToast?.('⚠️ يرجى كتابة مبررات وسبب تجاوز التصعيد التلقائي للمخالفة الجسيمة');
      return;
    }

    const currentRule = (selectedCategory.rules || []).find((r) => r.id === selectedRuleId);
    const ruleTitle = customRuleTitle.trim() || currentRule?.title || selectedCategory.name;

    const reqId = 'disc_' + Date.now();
    const occurrenceNumber = isOverrideActive ? (counterResult ? counterResult.newCount : 1) : (counterResult ? counterResult.newCount : 1);

    const newViolationRequest = {
      id: reqId,
      employeeId: selectedEmp.id,
      employeeName: selectedEmp.name,
      employeeCode: selectedEmp.code,
      branchId: selectedEmp.branchId || currentBranchId,
      type: 'disciplinary_penalty',
      subType: 'disciplinary_penalty',
      categoryId: selectedCategory.id,
      categoryCode: selectedCategory.code,
      categoryName: selectedCategory.name,
      ruleId: selectedRuleId,
      ruleTitle: ruleTitle,
      occurrenceNumber: occurrenceNumber,
      previousOccurrencesCount: counterResult ? counterResult.previousCount : 0,
      actionTitle: effectiveActionName,
      deductionType: isOverrideActive && overrideAction === 'خصم من الأجر الأساسي' ? deductionType : 'days',
      deductionFixedAmount: isOverrideActive && overrideAction === 'خصم من الأجر الأساسي' && deductionType === 'fixed_amount' ? (parseFloat(deductionFixedAmount) || 0) : null,
      deductionHours: isOverrideActive && overrideAction === 'خصم من الأجر الأساسي' && deductionType === 'hours_minutes' ? (parseFloat(deductionHours) || 0) : null,
      deductionMinutes: isOverrideActive && overrideAction === 'خصم من الأجر الأساسي' && deductionType === 'hours_minutes' ? (parseFloat(deductionMinutes) || 0) : null,
      deductionDays: effectiveDeductionDays,
      dailyRate: dailyRate,
      hourlyRate: hourlyRate,
      amount: effectiveDeductionAmount,
      date: violationDate,
      reason: incidentDetails || ruleTitle,
      details: incidentDetails,
      investigationNotes: investigationNotes,
      attachmentName: attachmentName,
      isOverride: isOverrideActive,
      overrideReason: isOverrideActive ? overrideReason : null,
      createdRole: isAdmin ? 'admin' : 'branch',
      createdByName: isAdmin ? 'الإدارة العليا' : 'مدير الفرع',
      createdAt: new Date().toISOString(),
      status: isAdmin ? 'approved' : 'pending_admin',
      adminApproved: isAdmin,
      approvedAt: isAdmin ? new Date().toISOString() : null,
      approvedBy: isAdmin ? 'الإدارة العليا' : null,
      auditLog: [
        {
          action: 'created',
          by: isAdmin ? 'الإدارة العليا' : 'مدير الفرع',
          role: userRole,
          timestamp: new Date().toISOString(),
          note: isAdmin ? 'توثيق وتطبيق جزاء تأديبي فوري' : 'رفع مقترح جزاء تأديبي بانتظار اعتماد الإدارة العليا'
        }
      ]
    };

    let updatedAdjustments = state.adjustments || [];
    let updatedEmployees = state.employees || [];

    // إذا كانت الإدارة العليا وتم اختيار إيقاف مؤقت عن العمل، يتم إيقاف بصمة الموظف فورياً
    if (isAdmin && effectiveActionName === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق') {
      const suspReason = overrideReason?.trim() || incidentDetails?.trim() || ruleTitle || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق';
      updatedEmployees = updatedEmployees.map((emp) => {
        if (String(emp.id) === String(selectedEmp.id)) {
          return {
            ...emp,
            biometricSuspended: true,
            suspensionReason: suspReason,
            suspendedAt: new Date().toISOString(),
            suspendedBy: 'الإدارة العليا'
          };
        }
        return emp;
      });
    }

    // إذا كانت الإدارة العليا وتم اختيار إنهاء خدمة / فصل تأديبي
    if (isAdmin && effectiveActionName === 'إنهاء خدمة / فصل تأديبي') {
      const termReason = overrideReason?.trim() || incidentDetails?.trim() || ruleTitle || 'إنهاء خدمة / فصل تأديبي';
      updatedEmployees = updatedEmployees.map((emp) => {
        if (String(emp.id) === String(selectedEmp.id)) {
          return {
            ...emp,
            status: 'تم الاستقالة',
            is_active: false,
            isTerminated: true,
            terminationReason: termReason,
            terminatedAt: new Date().toISOString(),
            biometricSuspended: true,
            suspensionReason: 'تم إنهاء خدمة الموظف (فصل تأديبي)'
          };
        }
        return emp;
      });
    }

    // إذا كانت الإدارة العليا وتم فرض خصم مالي، يتم الترحيل المباشر للأجور والتسويات
    if (isAdmin && effectiveDeductionAmount > 0) {
      let deductionDetail = '';
      if (isOverrideActive && overrideAction === 'خصم من الأجر الأساسي') {
        if (deductionType === 'fixed_amount') {
          deductionDetail = `خصم مبلغ ثابت ${effectiveDeductionAmount} ج.م`;
        } else if (deductionType === 'hours_minutes') {
          deductionDetail = `خصم ${deductionHours || 0} ساعة و ${deductionMinutes || 0} دقيقة (${effectiveDeductionAmount} ج.م)`;
        } else {
          deductionDetail = `خصم ${effectiveDeductionDays} يوم (${effectiveDeductionAmount} ج.م)`;
        }
      } else {
        deductionDetail = `خصم ${effectiveDeductionDays} يوم (${effectiveDeductionAmount} ج.م)`;
      }

      const adjDesc = `خصم جزاء تأديبي: ${selectedCategory.code} - ${ruleTitle} (المرة ${occurrenceNumber} - ${deductionDetail})`;
      const newAdj = {
        id: `adj_disc_${reqId}`,
        requestId: reqId,
        employeeId: selectedEmp.id,
        employeeName: selectedEmp.name,
        branchId: selectedEmp.branchId || currentBranchId,
        type: 'deduction',
        subType: 'disciplinary_penalty',
        amount: effectiveDeductionAmount,
        deductionDays: effectiveDeductionDays,
        dailyRate: dailyRate,
        description: adjDesc,
        notes: adjDesc,
        reason: adjDesc,
        date: violationDate,
        createdAt: new Date().toISOString()
      };
      updatedAdjustments = [newAdj, ...updatedAdjustments];
    }

    const updatedRequests = [newViolationRequest, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      adjustments: updatedAdjustments,
      employees: updatedEmployees
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    if (isAdmin) {
      showToast?.(`⚖️ تم اعتماد وتطبيق الجزاء التأديبي بنجاح (${effectiveActionName})`);
    } else {
      showToast?.('📤 تم إرسال المخالفة التأديبية بنجاح إلى الإدارة العليا للاعتماد والتطبيق');
    }

    if (onViolationSaved) onViolationSaved(newViolationRequest);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1050 }}>
      <div
        className="modal-card"
        style={{
          maxWidth: '820px',
          width: '96%',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '16px',
          padding: '24px',
          fontFamily: "'Tajawal', sans-serif"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '18px' }}>
          <div>
            <h3 style={{ fontFamily: 'Cairo', margin: '0 0 4px', color: isAdmin ? '#dc2626' : '#ea580c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
              {isAdmin ? '⚖️ توثيق وتطبيق جزاء تأديبي فوري' : '⚠️ توثيق مخالفة تأديبية وإرسالها للإدارة العليا'}
            </h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
              نظام العداد المستقل: احتساب تلقائي لمرات التكرار وتطبيق سلم الجزاءات المعتمد مع ربط مباشر بالأجور
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: '18px', padding: '4px 8px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            {/* 1. Employee Selection */}
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13.5px', marginBottom: '6px' }}>
                👤 اختيار الموظف المخالف <span style={{ color: 'var(--danger)' }}>*</span>:
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' }}
              >
                <option value="">-- اختر الموظف من القائمة --</option>
                {availableEmployees.map((emp) => {
                  const bObj = branches.find((b) => String(b.id) === String(emp.branchId));
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.code || '—'}) - {bObj?.name || 'الفرع الرئيسي'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 2. Violation Date */}
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13.5px', marginBottom: '6px' }}>
                📅 تاريخ ارتكاب الواقعة <span style={{ color: 'var(--danger)' }}>*</span>:
              </label>
              <input
                type="date"
                value={violationDate}
                onChange={(e) => setViolationDate(e.target.value)}
                required
                style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
            </div>
          </div>

          {/* Employee Quick Info Badge */}
          {selectedEmp && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px' }}>
              <div>
                <strong>الراتب الأساسي: </strong>
                <span style={{ color: 'var(--primary-dark)', fontWeight: 'bold' }}>{parseFloat(selectedEmp.salary || 0).toLocaleString()} ج.م</span>
              </div>
              <div>
                <strong>سعر اليوم الأساسي: </strong>
                <span style={{ color: '#047857', fontWeight: 'bold' }}>{dailyRate} ج.م / يوم</span>
              </div>
              <div>
                <strong>ساعات العمل: </strong>
                <span>{selectedEmp.workHoursPerDay || 8} ساعات</span>
              </div>
              <div>
                <strong>أيام الشهر: </strong>
                <span>{selectedEmp.workDaysPerMonth || 26} يوم</span>
              </div>
            </div>
          )}

          {/* 3. Category & Rule Selection */}
          <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13.5px', marginBottom: '6px' }}>
                📂 فئة المخالفة اللائحية <span style={{ color: 'var(--danger)' }}>*</span>:
              </label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 'bold', color: selectedCategory?.color || 'inherit' }}
              >
                {policy.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {selectedCategory?.description && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  💡 {selectedCategory.description}
                </p>
              )}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13.5px', marginBottom: '6px' }}>
                📌 نوع المخالفة المحددة:
              </label>
              <select
                value={selectedRuleId}
                onChange={(e) => setSelectedRuleId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' }}
              >
                {(selectedCategory?.rules || []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
                <option value="custom">-- كتابة نوع مخالفة مخصص أخرى --</option>
              </select>
            </div>

            {selectedRuleId === 'custom' && (
              <div style={{ marginTop: '10px' }}>
                <input
                  type="text"
                  placeholder="اكتب وصف وتصنيف المخالفة المخصصة..."
                  value={customRuleTitle}
                  onChange={(e) => setCustomRuleTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                />
              </div>
            )}
          </div>

          {/* 4. Automated Counter Prediction Box */}
          {counterResult && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔢 نتيجة عداد التكرار الذكي لهذه المخالفة:
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>المخالفات السابقة لنفس الفئة:</span>
                  <strong style={{ fontSize: '16px', color: '#1e293b' }}>
                    {counterResult.previousCount} {counterResult.previousCount === 1 ? 'مرة' : 'مرات'}
                  </strong>
                </div>

                <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>العداد الجديد الحالي:</span>
                  <strong style={{ fontSize: '16px', color: '#047857' }}>
                    المرة {counterResult.newCount}
                  </strong>
                </div>

                <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>الإجراء النظامي المقترح:</span>
                  <strong style={{ fontSize: '14px', color: '#dc2626' }}>
                    {counterResult.suggestedAction}
                  </strong>
                </div>

                <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>الخصم المالي المقترح:</span>
                  <strong style={{ fontSize: '15px', color: counterResult.deductionDays > 0 ? '#b91c1c' : '#059669' }}>
                    {counterResult.deductionDays > 0 ? `${counterResult.deductionDays} يوم (${(dailyRate * counterResult.deductionDays).toFixed(2)} ج.م)` : 'بدون خصم مالي'}
                  </strong>
                </div>
              </div>

              {counterResult.isResetApplied && (
                <div style={{ fontSize: '12.5px', color: '#047857', background: '#dcfce7', padding: '6px 10px', borderRadius: '6px' }}>
                  🔄 ملاحظة: تم تصفير العداد والبدء كأول مرة نظراً لمرور أكثر من 12 شهراً منذ آخر مخالفة مسجلة لنفس النوع.
                </div>
              )}
            </div>
          )}

          {/* 5. Severe Violation / Manual Escalation Override */}
          <div style={{ background: isOverrideActive ? '#fff1f2' : '#f8fafc', border: `1px solid ${isOverrideActive ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', color: isOverrideActive ? '#be123c' : 'var(--text)' }}>
              <input
                type="checkbox"
                checked={isOverrideActive}
                onChange={(e) => setIsOverrideActive(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              ⚡ تصنيف كـ "مخالفة جسيمة" أو تجاوز التصعيد التلقائي
            </label>

            {isOverrideActive && (
              <div style={{ marginTop: '14px', borderTop: '1px dashed #fca5a5', paddingTop: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ gridColumn: overrideAction === 'خصم من الأجر الأساسي' ? '1 / -1' : 'auto' }}>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', marginBottom: '4px' }}>
                      الإجراء الاستثنائي المحدد:
                    </label>
                    <select
                      value={overrideAction}
                      onChange={(e) => setOverrideAction(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
                    >
                      <option value="خصم من الأجر الأساسي">خصم من الأجر الأساسي</option>
                      <option value="إنذار نهائي مباشر">إنذار نهائي مباشر</option>
                      <option value="إحالة فورية للتحقيق والشئون القانونية">إحالة فورية للتحقيق والشئون القانونية</option>
                      <option value="إيقاف مؤقت عن العمل لحين انتهاء التحقيق">إيقاف مؤقت عن العمل لحين انتهاء التحقيق</option>
                      <option value="إنهاء خدمة / فصل تأديبي">إنهاء خدمة / فصل تأديبي</option>
                    </select>
                  </div>

                  {/* Deduction Type Options */}
                  {overrideAction === 'خصم من الأجر الأساسي' && (
                    <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #fed7aa', padding: '14px', borderRadius: '10px' }}>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', marginBottom: '8px', color: '#c2410c' }}>
                        طريقة احتساب الخصم المالي:
                      </label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <button
                          type="button"
                          className={`btn ${deductionType === 'days' ? 'btn-start' : 'btn-ghost'}`}
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                          onClick={() => setDeductionType('days')}
                        >
                          📅 خصم بعدد الأيام
                        </button>
                        <button
                          type="button"
                          className={`btn ${deductionType === 'fixed_amount' ? 'btn-start' : 'btn-ghost'}`}
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                          onClick={() => setDeductionType('fixed_amount')}
                        >
                          💵 خصم مبلغ مالي ثابت (ج.م)
                        </button>
                        <button
                          type="button"
                          className={`btn ${deductionType === 'hours_minutes' ? 'btn-start' : 'btn-ghost'}`}
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                          onClick={() => setDeductionType('hours_minutes')}
                        >
                          ⏱️ خصم ساعات ودقائق محددة
                        </button>
                      </div>

                      {/* Mode 1: Days */}
                      {deductionType === 'days' && (
                        <div style={{ maxWidth: '280px' }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            عدد أيام الخصم (أيام):
                          </label>
                          <input
                            type="number"
                            step="0.25"
                            min="0.25"
                            max="30"
                            value={overrideDeductionDays}
                            onChange={(e) => setOverrideDeductionDays(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                          />
                        </div>
                      )}

                      {/* Mode 2: Fixed Financial Amount */}
                      {deductionType === 'fixed_amount' && (
                        <div style={{ maxWidth: '280px' }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            المبلغ المالي المخصوم (ج.م):
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            placeholder="مثال: 200"
                            value={deductionFixedAmount}
                            onChange={(e) => setDeductionFixedAmount(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                          />
                        </div>
                      )}

                      {/* Mode 3: Hours & Minutes */}
                      {deductionType === 'hours_minutes' && (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <div style={{ flex: 1, maxWidth: '140px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                              عدد الساعات:
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="24"
                              step="1"
                              value={deductionHours}
                              onChange={(e) => setDeductionHours(e.target.value)}
                              style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <div style={{ flex: 1, maxWidth: '140px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                              عدد الدقائق:
                            </label>
                            <select
                              value={deductionMinutes}
                              onChange={(e) => setDeductionMinutes(e.target.value)}
                              style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                            >
                              <option value="0">0 دقيقة</option>
                              <option value="15">15 دقيقة (ربع ساعة)</option>
                              <option value="30">30 دقيقة (نصف ساعة)</option>
                              <option value="45">45 دقيقة (إلا ربع)</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Live Calculation Preview */}
                      <div style={{ marginTop: '10px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ color: '#0369a1', fontWeight: 'bold' }}>
                          💡 أجر اليوم: {dailyRate} ج.م · أجر الساعة ({empHoursPerDay} س): {hourlyRate} ج.م
                        </span>
                        <span style={{ color: '#dc2626', fontWeight: '800' }}>
                          💰 إجمالي الخصم المحتسب: {effectiveDeductionAmount} ج.م (معادل {effectiveDeductionDays} يوم)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Suspension Notice Banner */}
                  {overrideAction === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق' && (
                    <div style={{ gridColumn: '1 / -1', background: '#fef2f2', border: '1.5px solid #f87171', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px' }}>⛔</span>
                      <div style={{ fontSize: '12.5px', color: '#991b1b', lineHeight: '1.5' }}>
                        <strong>تنبيه إداري أمني:</strong> عند اعتماد هذا الإجراء، سيتم <strong>إيقاف بصمة الموظف الإلكترونية وصلاحية تسجيل الحضور فورياً</strong>، ولن يتمكن من فتح شيفت حتى يتم مراجعة التحقيق وإعادة تفعيل بصمته من صفحة البصمة الإلكترونية.
                      </div>
                    </div>
                  )}

                  {/* Dismissal Notice Banner */}
                  {overrideAction === 'إنهاء خدمة / فصل تأديبي' && (
                    <div style={{ gridColumn: '1 / -1', background: '#450a0a', color: '#ffffff', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px' }}>🚫</span>
                      <div style={{ fontSize: '12.5px', lineHeight: '1.5' }}>
                        <strong>تنبيه حرج:</strong> سيتم إنهاء خدمة الموظف تأديبياً، وتغيير حالته إلى <strong>مستقيل/منهي خدمته</strong> وإيقاف بصمته وحرمانه من تسجيل الحضور نهائياً في النظام.
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', marginBottom: '4px', color: '#be123c' }}>
                    سبب ومبررات تجاوز التصعيد التلقائي <span style={{ color: 'red' }}>*</span>:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="بيان أسباب التجاوز وجسامة الواقعة والأضرار المترتبة عليها..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required={isOverrideActive}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #fca5a5', background: '#fff' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 6. Incident Details & Investigation Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                📝 تفاصيل ووصف الواقعة:
              </label>
              <textarea
                rows={3}
                placeholder="شرح ملابسات المخالفة وتوقيتها والشهود إن وجدوا..."
                value={incidentDetails}
                onChange={(e) => setIncidentDetails(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                🔍 ملاحظات التحقيق أو توصية الإدارة:
              </label>
              <textarea
                rows={3}
                placeholder="ملاحظات التحقيق مع الموظف أو ردوده وتوصية المسؤول..."
                value={investigationNotes}
                onChange={(e) => setInvestigationNotes(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          {/* 7. Attachment / Document Reference */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
              📎 المرفقات / مستندات التحقيق والأدلة (اسم الملف أو الرابط):
            </label>
            <input
              type="text"
              placeholder="مثال: محضر_تحقيق_12.pdf أو صورة_الكاميرا_1.jpg أو رابط المستند..."
              value={attachmentName}
              onChange={(e) => setAttachmentName(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Financial Summary Line before Submission */}
          {effectiveDeductionAmount > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ color: '#991b1b', fontSize: '13.5px' }}>
                <strong>💰 التأثير المالي للجزاء: </strong>
                خصم <strong>{effectiveDeductionDays} يوم</strong> من الأجر الأساسي = <strong style={{ fontSize: '15px' }}>{effectiveDeductionAmount} ج.م</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#7f1d1d' }}>
                {isAdmin ? '✅ سيرحل فوراً إلى مسير الرواتب كبند خصم تأديبي' : '⏳ ينتظر موافقة الإدارة العليا للترحيل'}
              </div>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-start"
              style={{
                background: isAdmin ? '#dc2626' : '#ea580c',
                color: '#ffffff',
                fontWeight: 'bold',
                padding: '10px 22px',
                fontSize: '14.5px'
              }}
            >
              {isAdmin ? '⚖️ اعتماد وتطبيق الجزاء فوراً' : '📤 إرسال المخالفة للاعتماد من الإدارة العليا'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
