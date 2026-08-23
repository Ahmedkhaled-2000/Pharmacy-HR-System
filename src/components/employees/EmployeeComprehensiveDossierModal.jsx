import React, { useState } from 'react';
import { fmt, todayStr, getEmpDisplayName } from '../../utils/formatters';
import { getEffectiveShiftHours } from '../../utils/latePenaltyEngine';
import { computeEmployeeFinalSettlement } from '../../utils/settlementHelper';
import { triggerDirectPrint, generateClearanceSlipHTML } from '../../utils/printHelper';
import { compressImage } from '../../utils/imageCompressor';

export default function EmployeeComprehensiveDossierModal({
  emp,
  state,
  initialTab = 'summary',
  onClose,
  onOpenRehireModal,
  onOpenEditModal,
  onOpenIDCardModal,
  onSaveSignedClearance
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'summary'); // 'summary' | 'shifts' | 'settlement' | 'permissions' | 'leaves' | 'lateness' | 'loans' | 'evaluations' | 'requests'
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [previewDocModal, setPreviewDocModal] = useState(null); // { url, type, name }

  if (!emp) return null;

  const empIdStr = String(emp.id || '').trim();
  const empCodeStr = String(emp.code || '').trim();

  // 1. Shifts history
  const empShifts = (state.shifts || [])
    .filter((s) => String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeId) === empCodeStr))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const totalHistoricalHours = empShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0);
  const totalApprovedOvertime = empShifts
    .filter((s) => s.overtimeStatus === 'approved' || (parseFloat(s.overtimeHours) > 0 && s.adminApproved))
    .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

  // 2. Loans & advances history (Deduplicated by ID)
  const dossierLoanMap = new Map();
  (state.requests || [])
    .filter((r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) && (r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine'))
    .forEach((r) => dossierLoanMap.set(String(r.id), r));

  (state.loans || [])
    .filter((l) => (String(l.employeeId) === empIdStr || (empCodeStr && String(l.employeeId) === empCodeStr)) && (l.type === 'loan' || l.type === 'advance' || l.type === 'meds' || l.type === 'credit_medicine'))
    .forEach((l) => {
      const existing = dossierLoanMap.get(String(l.id));
      dossierLoanMap.set(String(l.id), { ...(existing || {}), ...l });
    });

  const empLoans = Array.from(dossierLoanMap.values())
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  // 3. Permissions history
  const empPermissions = (state.permissions || state.permissionRequests || [])
    .filter((p) => String(p.employeeId) === empIdStr || (empCodeStr && String(p.employeeId) === empCodeStr))
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  // 4. Leaves history
  const empLeaves = (state.leaves || state.leaveRequests || [])
    .filter((l) => String(l.employeeId) === empIdStr || (empCodeStr && String(l.employeeId) === empCodeStr))
    .sort((a, b) => new Date(b.startDate || b.date || b.createdAt || 0) - new Date(a.startDate || a.date || a.createdAt || 0));

  // 5. Lateness incidents
  const empLateness = (state.lateIncidents || [])
    .filter((inc) => String(inc.employeeId) === empIdStr || (empCodeStr && String(inc.employeeId) === empCodeStr))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // 6. Evaluations
  const empEvaluations = (state.evaluations || [])
    .filter((ev) => String(ev.employeeId) === empIdStr || (empCodeStr && String(ev.employeeId) === empCodeStr))
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  // 7. Resignation requests
  const empResignations = (state.resignationRequests || [])
    .filter((r) => String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr))
    .sort((a, b) => new Date(b.createdAt || b.requestDate || 0) - new Date(a.createdAt || a.requestDate || 0));

  // Handlers for Signed Clearance Document
  const handleUploadSignedDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    try {
      const isImage = file.type.startsWith('image/');
      const dataUrl = await compressImage(file, isImage ? 1400 : undefined, 0.85);
      const newDoc = {
        dataUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        notes: ''
      };
      if (onSaveSignedClearance) {
        await onSaveSignedClearance(emp.id, newDoc);
      }
    } catch (err) {
      console.error('Error uploading signed clearance:', err);
      alert('حدث خطأ أثناء رفع المستند');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteSignedDoc = async () => {
    if (!window.confirm('هل أنت متأكد من حذف مستند إخلاء الطرف الموقع والمؤرشف؟')) return;
    if (onSaveSignedClearance) {
      await onSaveSignedClearance(emp.id, null);
    }
  };

  const handlePrintOfficialSlip = () => {
    try {
      const termDate = emp.terminationDate || emp.resignationDate || todayStr();
      const stmnt = finalSettlement || computeEmployeeFinalSettlement(emp.id, state, termDate);
      const html = generateClearanceSlipHTML({
        emp,
        state,
        terminationDate: termDate,
        effectiveReason: emp.terminationReason || 'استقالة معتمدة',
        clearanceNotes: emp.terminationNotes || '',
        settlement: stmnt
      });
      triggerDirectPrint(html, `إخلاء طرف - ${emp.name}`);
    } catch (err) {
      console.error('Error printing slip:', err);
      window.print();
    }
  };

  const handlePrintSignedDocument = (doc) => {
    if (!doc?.dataUrl) return;
    if (doc.fileType?.startsWith('image/') || doc.dataUrl.startsWith('data:image/')) {
      const html = `<div style="text-align:center;padding:10px;"><img src="${doc.dataUrl}" style="max-width:100%;max-height:95vh;object-fit:contain;" /></div>`;
      triggerDirectPrint(html, `مستند إخلاء طرف موقع - ${emp.name}`);
    } else {
      const win = window.open(doc.dataUrl, '_blank');
      if (win) win.focus();
    }
  };

  // Check if live settlement can be calculated if finalSettlement doesn't exist
  const effectiveSettlement = finalSettlement || (isTerminated ? computeEmployeeFinalSettlement(emp.id, state, emp.terminationDate || todayStr()) : null);

  return (
    <div className="modal-backdrop" style={{ zIndex: 1250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '1050px',
          width: '96%',
          maxHeight: '94vh',
          overflowY: 'auto',
          borderRadius: '18px',
          padding: '24px',
          background: 'var(--bg, #f8fafc)'
        }}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="emp-avatar-circle" style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
              {emp.photoUrl ? (
                <img src={emp.photoUrl} alt={getEmpDisplayName(emp)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                getEmpDisplayName(emp)?.charAt(0) || '👤'
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontFamily: 'Cairo', color: 'var(--text)' }}>
                  {getEmpDisplayName(emp)}
                </h2>
                {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                  <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                    الاسم الرسمي: {emp.name}
                  </span>
                )}
                <span className="code-badge" style={{ background: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                  كود: {emp.code}
                </span>
                {isTerminated ? (
                  <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                    🔴 تم إنهاء الخدمة / مستقيل
                  </span>
                ) : (
                  <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                    🟢 على رأس العمل
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                {emp.jobTitle} {emp.department ? ` · قسم: ${emp.department}` : ''} {emp.phone ? ` · 📞 ${emp.phone}` : ''}
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {isTerminated && (
              <button
                type="button"
                className="btn btn-start"
                onClick={() => onOpenRehireModal && onOpenRehireModal(emp)}
                style={{ background: '#059669', color: '#fff', fontWeight: 'bold', fontSize: '13px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                🔄 إعادة الموظف على رأس العمل
              </button>
            )}
            {onOpenIDCardModal && (
              <button type="button" className="btn btn-ghost" onClick={() => onOpenIDCardModal(emp)} style={{ fontSize: '12.5px' }}>
                🪪 البطاقة التعريفية
              </button>
            )}
            {onOpenEditModal && (
              <button type="button" className="btn btn-ghost" onClick={() => onOpenEditModal(emp)} style={{ fontSize: '12.5px' }}>
                ✏️ تعديل الملف
              </button>
            )}
            <button className="del-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '18px', overflowX: 'auto' }}>
          {[
            { id: 'summary', label: '👤 البيانات والملف التعاقدي', count: null },
            { id: 'settlement', label: '📜 المخالصة والتصفية المالية', count: finalSettlement ? '✅' : null },
            { id: 'shifts', label: '⏱️ سجل البصمات والورديات', count: empShifts.length },
            { id: 'loans', label: '💳 السلف والقروض والأدوية', count: empLoans.length },
            { id: 'permissions', label: '⏰ الأذونات المعتمدة', count: empPermissions.length },
            { id: 'leaves', label: '🏖️ الإجازات والغياب', count: empLeaves.length },
            { id: 'lateness', label: '⚖️ التأخير والجزاءات', count: empLateness.length },
            { id: 'evaluations', label: '⭐ تقييمات الأداء', count: empEvaluations.length },
            { id: 'requests', label: '📝 طلبات الاستقالة', count: empResignations.length }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === tab.id ? 'var(--primary, #0f766e)' : '#fff',
                color: activeTab === tab.id ? '#fff' : 'var(--text)',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: activeTab === tab.id ? '0 2px 8px rgba(15,118,110,0.2)' : 'none'
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span
                  style={{
                    background: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                    color: activeTab === tab.id ? '#fff' : '#475569',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab 1: Personal & Contract Summary */}
        {activeTab === 'summary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Quick KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>إجمالي ساعات العمل المسجلة:</span>
                <strong style={{ fontSize: '18px', color: 'var(--primary-dark)' }}>{fmt(totalHistoricalHours)} ساعة</strong>
              </div>
              <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>إجمالي الساعات الإضافية المعتمدة:</span>
                <strong style={{ fontSize: '18px', color: '#16a34a' }}>+{fmt(totalApprovedOvertime)} ساعة</strong>
              </div>
              <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>عدد الورديات المنفذة:</span>
                <strong style={{ fontSize: '18px', color: '#0284c7' }}>{empShifts.length} وردية</strong>
              </div>
              <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>تاريخ التعيين:</span>
                <strong style={{ fontSize: '15px', color: '#475569' }}>{emp.hireDate || emp.hiring_date || '—'}</strong>
              </div>
            </div>

            {/* Termination info banner if terminated */}
            {isTerminated && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px 18px', color: '#991b1b' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🛑 بيانات وقرار إنهاء الخدمة:
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', fontSize: '13px' }}>
                  <div>تاريخ سريان إنهاء الخدمة: <strong>{emp.terminationDate || emp.resignationDate || emp.terminatedAt?.slice(0, 10) || '—'}</strong></div>
                  <div>سبب إنهاء الخدمة: <strong>{emp.terminationReason || emp.suspension_reason || 'استقالة معتمدة'}</strong></div>
                  {emp.terminationNotes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      ملاحظات إخلاء الطرف: <strong>{emp.terminationNotes}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Detailed Info Grid */}
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '14.5px', color: 'var(--text)' }}>📋 الملف الشخصي والتعاقدي التفصيلي:</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', fontSize: '13px' }}>
                <div>الاسم الكامل (الرسمي): <strong>{emp.name}</strong></div>
                {emp.nickname && <div>اسم الشهرة: <strong style={{ color: 'var(--primary)' }}>{emp.nickname}</strong></div>}
                <div>الرقم القومي: <strong>{emp.nationalId || emp.national_id || '—'}</strong></div>
                <div>المسمى الوظيفي: <strong>{emp.jobTitle}</strong></div>
                <div>القسم: <strong>{emp.department || 'عام'}</strong></div>
                <div>الفرع الرئيسي: <strong>{getBranchName(emp.branchId)}</strong></div>
                <div>رقم الهاتف: <strong>{emp.phone || '—'}</strong></div>
                <div>اسم المستخدم للنظام: <strong>{emp.username || '—'}</strong></div>
                <div>أجر الساعة / الراتب: <strong>{fmt(emp.salary)} ج.م</strong></div>
                <div>ساعات العمل باليوم: <strong>{emp.workHoursPerDay || 8} س</strong></div>
                <div>أيام العمل بالشهر: <strong>{emp.workDaysPerMonth || 26} يوم</strong></div>
                <div>بدل الإدارة: <strong>{fmt(emp.managementAllowance || 0)} ج.م</strong></div>
                <div>بدل الانتقال: <strong>{fmt(emp.transportAllowance || 0)} ج.م</strong></div>
                <div>الأجر الإضافي المخصص: <strong>{fmt(emp.extraAllowance || 0)} ج.م ({emp.extraAllowanceTitle || 'أجر إضافي'})</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Final Settlement & Clearance */}
        {activeTab === 'settlement' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* 1. Official Clearance & Financial Settlement Card */}
            {effectiveSettlement ? (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📜 كشف التصفية والمخالصة المالية النهائية المعتمدة
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      تاريخ التصفية: <strong>{effectiveSettlement.terminationDate || effectiveSettlement.settlementDate || todayStr()}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintOfficialSlip}
                    style={{
                      background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(15,118,110,0.2)'
                    }}
                  >
                    🖨️ طباعة نموذج إخلاء الطرف والمخالصة الرسمية
                  </button>
                </div>

                {/* Financial Summary Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                  {/* Earnings */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ color: '#166534', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>➕ إجمالي المستحقات المكتسبة</span>
                      <span>+{fmt(effectiveSettlement.totalEarnings)} ج.م</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>أجر الساعات الأساسية ({effectiveSettlement.totalRegularHours || 0} س):</span>
                        <strong>{fmt(effectiveSettlement.totalBaseEarnings)} ج.م</strong>
                      </div>
                      {effectiveSettlement.totalApprovedOvertimeHours > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                          <span>الوقت الإضافي المعتمد ({effectiveSettlement.totalApprovedOvertimeHours} س):</span>
                          <strong>+{fmt(effectiveSettlement.totalOvertimeEarnings)} ج.م</strong>
                        </div>
                      )}
                      {effectiveSettlement.totalAllowances > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1d4ed8' }}>
                          <span>إجمالي البدلات الثابتة:</span>
                          <strong>+{fmt(effectiveSettlement.totalAllowances)} ج.م</strong>
                        </div>
                      )}
                      {effectiveSettlement.totalBonus > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                          <span>المكافآت والحوافز:</span>
                          <strong>+{fmt(effectiveSettlement.totalBonus)} ج.م</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Deductions */}
                  <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>➖ إجمالي الاستقطاعات والديون</span>
                      <span>-{fmt(effectiveSettlement.totalDeductions)} ج.م</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: effectiveSettlement.totalRemainingLoansDebt > 0 ? '#b91c1c' : '#334155', fontWeight: effectiveSettlement.totalRemainingLoansDebt > 0 ? 'bold' : 'normal' }}>
                        <span>كامل رصيد السلف والأدوية المتبقي:</span>
                        <strong>-{fmt(effectiveSettlement.totalRemainingLoansDebt)} ج.م</strong>
                      </div>
                      {effectiveSettlement.lateDeduction > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ea580c' }}>
                          <span>خصومات التأخير ({effectiveSettlement.lateDeductionMinutes || 0} دقيقة):</span>
                          <strong>-{fmt(effectiveSettlement.lateDeduction)} ج.م</strong>
                        </div>
                      )}
                      {effectiveSettlement.manualDeduction > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                          <span>الجزاءات والخصومات الأخرى:</span>
                          <strong>-{fmt(effectiveSettlement.manualDeduction)} ج.م</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Net Settlement Ribbon */}
                <div
                  style={{
                    background: effectiveSettlement.isPayableToEmployee !== false ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    color: '#fff',
                    padding: '14px 20px',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontWeight: 'bold',
                    fontSize: '15px'
                  }}
                >
                  <span>{effectiveSettlement.settlementStatusLabel || 'صافي المخالصة والتصفية'}:</span>
                  <span style={{ fontSize: '22px', fontFamily: 'Cairo', fontWeight: 900 }}>
                    {fmt(Math.abs(effectiveSettlement.netSettlement || 0))} ج.م
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', textAlign: 'center', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📄</span>
                لم يتم تسجيل مخالصة مالية نهائية مسبقة لهذا الموظف.
              </div>
            )}

            {/* 2. Signed Clearance Document Management Section */}
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📑 مستند إخلاء الطرف والمخالصة الموقعة والمؤرشفة:
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    أرشفة الورقة الرسمية الموقعة من الموظف والمدير والمحاسب
                  </span>
                </div>

                {emp.signedClearanceDoc ? (
                  <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                    🟢 تم رفع وأرشفة المستند الموقع
                  </span>
                ) : (
                  <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                    ⚠️ بانتظار رفع المستند الموقع
                  </span>
                )}
              </div>

              {emp.signedClearanceDoc ? (
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {emp.signedClearanceDoc.fileType?.startsWith('image/') || emp.signedClearanceDoc.dataUrl?.startsWith('data:image/') ? (
                        <img
                          src={emp.signedClearanceDoc.dataUrl}
                          alt="إخلاء طرف موقع"
                          style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #cbd5e1', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                          onClick={() => setPreviewDocModal({
                            url: emp.signedClearanceDoc.dataUrl,
                            type: emp.signedClearanceDoc.fileType || 'image/jpeg',
                            name: emp.signedClearanceDoc.fileName || 'إخلاء طرف موقع'
                          })}
                          title="اضغط للمعاينة بالحجم الكامل"
                        />
                      ) : (
                        <div style={{ width: '70px', height: '70px', background: '#fee2e2', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                          📄
                        </div>
                      )}

                      <div>
                        <strong style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>
                          {emp.signedClearanceDoc.fileName || 'وثيقة إخلاء طرف موقعة.jpg'}
                        </strong>
                        <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                          تاريخ الرفع: {new Date(emp.signedClearanceDoc.uploadedAt || Date.now()).toLocaleString('ar-EG')}
                        </span>
                        {emp.signedClearanceDoc.notes && (
                          <span style={{ fontSize: '11.5px', color: '#475569', display: 'block', marginTop: '2px' }}>
                            ملاحظات: {emp.signedClearanceDoc.notes}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions for uploaded document */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setPreviewDocModal({
                          url: emp.signedClearanceDoc.dataUrl,
                          type: emp.signedClearanceDoc.fileType || 'image/jpeg',
                          name: emp.signedClearanceDoc.fileName || 'إخلاء طرف موقع'
                        })}
                        style={{ fontSize: '12.5px', background: '#fff', border: '1px solid var(--border)' }}
                      >
                        👁️ معاينة بالحجم الكامل
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handlePrintSignedDocument(emp.signedClearanceDoc)}
                        style={{ fontSize: '12.5px', background: '#fff', border: '1px solid var(--border)' }}
                      >
                        🖨️ طباعة
                      </button>

                      <a
                        href={emp.signedClearanceDoc.dataUrl}
                        download={emp.signedClearanceDoc.fileName || `اخلاء_طرف_${emp.name}.jpg`}
                        className="btn btn-ghost"
                        style={{ fontSize: '12.5px', background: '#fff', border: '1px solid var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      >
                        ⬇️ تحميل
                      </a>

                      <label className="btn btn-ghost" style={{ cursor: isUploadingDoc ? 'not-allowed' : 'pointer', margin: 0, fontSize: '12.5px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                        {isUploadingDoc ? '⏳ جاري الرفع...' : '🔄 استبدال'}
                        <input type="file" accept="image/*,application/pdf" onChange={handleUploadSignedDoc} style={{ display: 'none' }} disabled={isUploadingDoc} />
                      </label>

                      <button
                        type="button"
                        onClick={handleDeleteSignedDoc}
                        style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        🗑️ حذف
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', background: '#f8fafc' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>📤</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '14px', color: '#1e293b' }}>
                    رفع وتوثيق إخلاء الطرف الموقع
                  </h4>
                  <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: '#64748b', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
                    قم بطباعة نموذج إخلاء الطرف وتوقيعه يدوياً من الموظف والمدير، ثم تصويره أو مسحه ضوئياً ورفعه هنا لأرشفته في سجل الموظف الدائم.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <label className="btn btn-start" style={{ cursor: isUploadingDoc ? 'not-allowed' : 'pointer', margin: 0, padding: '9px 18px', fontSize: '13px', background: 'var(--primary, #0f766e)', color: '#fff', fontWeight: 'bold' }}>
                      {isUploadingDoc ? '⏳ جاري المعالجة والرفع...' : '📁 اختيار ملف من الجهاز (صورة / PDF)'}
                      <input type="file" accept="image/*,application/pdf" onChange={handleUploadSignedDoc} style={{ display: 'none' }} disabled={isUploadingDoc} />
                    </label>
                    <label className="btn btn-ghost" style={{ cursor: isUploadingDoc ? 'not-allowed' : 'pointer', margin: 0, padding: '9px 18px', fontSize: '13px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 'bold' }}>
                      📷 التقاط صورة بالكاميرا
                      <input type="file" accept="image/*" capture="environment" onChange={handleUploadSignedDoc} style={{ display: 'none' }} disabled={isUploadingDoc} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Shifts History */}
        {activeTab === 'shifts' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px' }}>⏱️ سجل البصمات والورديات التاريخية ({empShifts.length} وردية):</h4>
            {empShifts.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا توجد ورديات مسجلة</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '8px' }}>التاريخ</th>
                    <th style={{ padding: '8px' }}>الفرع</th>
                    <th style={{ padding: '8px' }}>وقت الحضور</th>
                    <th style={{ padding: '8px' }}>وقت الانصراف</th>
                    <th style={{ padding: '8px' }}>الساعات الأساسية</th>
                    <th style={{ padding: '8px' }}>الوقت الإضافي</th>
                    <th style={{ padding: '8px' }}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {empShifts.map((s, idx) => (
                    <tr key={s.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{s.date}</td>
                      <td style={{ padding: '8px' }}>{getBranchName(s.branchId)}</td>
                      <td style={{ padding: '8px' }}>{s.timeIn || '—'}</td>
                      <td style={{ padding: '8px' }}>{s.timeOut || '—'}</td>
                      <td style={{ padding: '8px', color: 'var(--primary-dark)', fontWeight: 'bold' }}>{fmt(getEffectiveShiftHours(s, state))} س</td>
                      <td style={{ padding: '8px' }}>
                        {parseFloat(s.overtimeHours) > 0 ? (
                          <span style={{ color: s.overtimeStatus === 'approved' ? '#16a34a' : '#ea580c', fontWeight: 'bold' }}>
                            +{fmt(s.overtimeHours)} س {s.overtimeStatus === 'approved' ? '(معتمد)' : '(قيد الاعتماد)'}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontSize: '11px' }}>
                          {s.status || 'مكتملة'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 4: Loans & Meds */}
        {activeTab === 'loans' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px' }}>💳 سجل السلف والقروض والأدوية بالآجل ({empLoans.length}):</h4>
            {empLoans.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا توجد سلف أو مشتريات أدوية مسجلة</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '8px' }}>النوع</th>
                    <th style={{ padding: '8px' }}>التاريخ</th>
                    <th style={{ padding: '8px' }}>أصل المبلغ</th>
                    <th style={{ padding: '8px' }}>المبلغ المسدد</th>
                    <th style={{ padding: '8px' }}>المتبقي</th>
                    <th style={{ padding: '8px' }}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {empLoans.map((l, idx) => {
                    const total = parseFloat(l.amount) || 0;
                    const paid = parseFloat(l.paidAmount) || 0;
                    const rem = Math.max(0, total - paid);
                    return (
                      <tr key={l.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{l.type === 'meds' || l.type === 'credit_medicine' ? '💊 أدوية بالآجل' : '💵 سلفة نقدية'}</td>
                        <td style={{ padding: '8px' }}>{l.date || l.createdAt?.slice(0, 10) || '—'}</td>
                        <td style={{ padding: '8px' }}>{fmt(total)} ج.م</td>
                        <td style={{ padding: '8px', color: '#16a34a' }}>{fmt(paid)} ج.م</td>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: rem > 0 ? '#b91c1c' : '#16a34a' }}>{fmt(rem)} ج.م</td>
                        <td style={{ padding: '8px' }}>
                          {l.status === 'pending' || l.status === 'pending_admin' ? (
                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              ⏳ قيد مراجعة الإدارة
                            </span>
                          ) : l.status === 'rejected' ? (
                            <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              ❌ مرفوض
                            </span>
                          ) : rem <= 0 ? (
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              ✅ مسدد بالكامل
                            </span>
                          ) : (
                            <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              🔴 متبقي مديونية معتمدة
                            </span>
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

        {/* Tab 5: Permissions */}
        {activeTab === 'permissions' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px' }}>⏰ سجل الأذونات المعتمدة ({empPermissions.length}):</h4>
            {empPermissions.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا توجد أذونات مسجلة</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '8px' }}>التاريخ</th>
                    <th style={{ padding: '8px' }}>نوع الإذن</th>
                    <th style={{ padding: '8px' }}>المدة</th>
                    <th style={{ padding: '8px' }}>السبب</th>
                    <th style={{ padding: '8px' }}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {empPermissions.map((p, idx) => (
                    <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{p.date || p.createdAt?.slice(0, 10) || '—'}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{p.type || p.permissionType || 'إذن عمل'}</td>
                      <td style={{ padding: '8px' }}>{p.hours || p.duration || '—'} س</td>
                      <td style={{ padding: '8px' }}>{p.reason || '—'}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ background: p.status === 'approved' || p.adminApproved ? '#dcfce7' : '#fee2e2', color: p.status === 'approved' || p.adminApproved ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px' }}>
                          {p.status === 'approved' || p.adminApproved ? 'معتمد' : (p.status || 'معلق')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 6: Leaves */}
        {activeTab === 'leaves' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px' }}>🏖️ سجل الإجازات الرسمية والمرضية والسنوية ({empLeaves.length}):</h4>
            {empLeaves.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا توجد إجازات مسجلة</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '8px' }}>نوع الإجازة</th>
                    <th style={{ padding: '8px' }}>من تاريخ</th>
                    <th style={{ padding: '8px' }}>إلى تاريخ</th>
                    <th style={{ padding: '8px' }}>عدد الأيام</th>
                    <th style={{ padding: '8px' }}>السبب</th>
                    <th style={{ padding: '8px' }}>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {empLeaves.map((l, idx) => (
                    <tr key={l.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{l.type || l.leaveType || 'إجازة اعتيادية'}</td>
                      <td style={{ padding: '8px' }}>{l.startDate || l.date || '—'}</td>
                      <td style={{ padding: '8px' }}>{l.endDate || l.date || '—'}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{l.daysCount || l.days || 1} يوم</td>
                      <td style={{ padding: '8px' }}>{l.reason || '—'}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ background: l.status === 'approved' || l.adminApproved ? '#dcfce7' : '#fee2e2', color: l.status === 'approved' || l.adminApproved ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px' }}>
                          {l.status === 'approved' || l.adminApproved ? 'معتمدة' : (l.status || 'معلقة')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 7: Lateness & Penalties */}
        {activeTab === 'lateness' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px' }}>⚖️ سجل وقائع التأخير والخصومات اللائحية ({empLateness.length}):</h4>
            {empLateness.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>سجل الموظف نظيف من وقائع التأخير والجزاءات 👍</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '8px' }}>التاريخ</th>
                    <th style={{ padding: '8px' }}>الفرع</th>
                    <th style={{ padding: '8px' }}>دقائق التأخير</th>
                    <th style={{ padding: '8px' }}>الخصم المالي</th>
                    <th style={{ padding: '8px' }}>الإجراء اللائحي</th>
                  </tr>
                </thead>
                <tbody>
                  {empLateness.map((inc, idx) => (
                    <tr key={inc.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{inc.date || '—'}</td>
                      <td style={{ padding: '8px' }}>{getBranchName(inc.branchId)}</td>
                      <td style={{ padding: '8px', color: '#ea580c', fontWeight: 'bold' }}>{inc.deductionMinutes || inc.minutes || 0} دقيقة</td>
                      <td style={{ padding: '8px', color: '#dc2626', fontWeight: 'bold' }}>{fmt(inc.penaltyAmount || 0)} ج.م</td>
                      <td style={{ padding: '8px' }}>{inc.actionType || inc.tierLabel || 'خصم لائحي'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 8: Appraisals & Evaluations */}
        {activeTab === 'evaluations' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px' }}>⭐ سجل تقييمات الأداء الوظيفي ({empEvaluations.length}):</h4>
            {empEvaluations.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا توجد تقييمات مسجلة</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {empEvaluations.map((ev, idx) => (
                  <div key={ev.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '13.5px' }}>الفترة / الشهر: {ev.month || ev.date || '—'}</span>
                      <span style={{ background: '#fef08a', color: '#854d0e', padding: '2px 10px', borderRadius: '12px', fontWeight: 'bold', fontSize: '12.5px' }}>
                        ⭐ التقييم: {ev.score || ev.rating || '100'}%
                      </span>
                    </div>
                    {ev.notes && <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>ملاحظات المشرف: {ev.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 9: Resignation History */}
        {activeTab === 'requests' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14.5px' }}>📝 سجل طلبات الاستقالة والتراجع ({empResignations.length}):</h4>
            {empResignations.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>لا توجد طلبات استقالة سابقة</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {empResignations.map((r, idx) => (
                  <div key={r.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '13.5px' }}>
                        {r.type === 'withdraw' ? '🔄 طلب تراجع عن الاستقالة' : '🛑 طلب استقالة'} بتاريخ: {r.requestDate || r.createdAt?.slice(0, 10)}
                      </span>
                      <span style={{ background: r.adminStatus === 'approved' ? '#dcfce7' : '#fee2e2', color: r.adminStatus === 'approved' ? '#166534' : '#991b1b', padding: '2px 10px', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px' }}>
                        حالة الطلب: {r.adminStatus || 'معلق'}
                      </span>
                    </div>
                    {r.reason && <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>السبب: {r.reason}</div>}
                    {r.adminComment && <div style={{ fontSize: '12.5px', color: 'var(--primary-dark)', marginTop: '4px' }}>قرار الإدارة: {r.adminComment}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FULL DOCUMENT PREVIEW POPUP MODAL ── */}
      {previewDocModal && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setPreviewDocModal(null)}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '850px', width: '92%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: '16px', padding: '16px', background: '#fff' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '12px' }}>
              <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                👁️ معاينة المستند: {previewDocModal.name}
              </strong>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <a
                  href={previewDocModal.url}
                  download={previewDocModal.name || 'document'}
                  className="btn btn-ghost"
                  style={{ fontSize: '12px', padding: '4px 10px' }}
                >
                  ⬇️ تحميل
                </a>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (previewDocModal.url.startsWith('data:image/')) {
                      triggerDirectPrint(`<div style="text-align:center;"><img src="${previewDocModal.url}" style="max-width:100%;max-height:95vh;object-fit:contain;" /></div>`, previewDocModal.name);
                    } else {
                      window.open(previewDocModal.url, '_blank');
                    }
                  }}
                  style={{ fontSize: '12px', padding: '4px 10px' }}
                >
                  🖨️ طباعة
                </button>
                <button className="del-btn" onClick={() => setPreviewDocModal(null)}>✕</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
              {previewDocModal.url.startsWith('data:image/') || previewDocModal.type?.startsWith('image/') ? (
                <img
                  src={previewDocModal.url}
                  alt={previewDocModal.name}
                  style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                />
              ) : (
                <iframe
                  src={previewDocModal.url}
                  title={previewDocModal.name}
                  style={{ width: '100%', height: '72vh', border: 'none', borderRadius: '6px' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
