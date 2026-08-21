import React, { useState } from 'react';
import { fmt, todayStr } from '../../utils/formatters';
import { getEffectiveShiftHours } from '../../utils/latePenaltyEngine';

export default function EmployeeComprehensiveDossierModal({
  emp,
  state,
  onClose,
  onOpenRehireModal,
  onOpenEditModal,
  onOpenIDCardModal
}) {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'shifts' | 'settlement' | 'permissions' | 'leaves' | 'lateness' | 'loans' | 'evaluations' | 'requests'

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

  // 2. Loans & advances history
  const allLoansRaw = [...(state.loans || []), ...(state.requests || [])];
  const empLoans = allLoansRaw
    .filter((l) => (String(l.employeeId) === empIdStr || (empCodeStr && String(l.employeeId) === empCodeStr)) && (l.type === 'loan' || l.type === 'advance' || l.type === 'meds' || l.type === 'credit_medicine'))
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

  // Final settlement snapshot if saved
  const finalSettlement = emp.finalSettlement || emp.settlementRecord || null;

  // Helper branch name
  const getBranchName = (bId) => {
    const b = (state.branches || []).find((br) => String(br.id) === String(bId));
    return b ? `${b.name}` : (bId === 'main' ? 'المركز الرئيسي' : 'فرع');
  };

  const isTerminated = emp.status === 'تم الاستقالة' || emp.is_active === false;

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
                <img src={emp.photoUrl} alt={emp.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                emp.name?.charAt(0) || '👤'
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontFamily: 'Cairo', color: 'var(--text)' }}>{emp.name}</h2>
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
                <div>الاسم الكامل: <strong>{emp.name}</strong></div>
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
          <div>
            {finalSettlement ? (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '16px' }}>
                    📜 سجل التصفية والمخالصة المالية النهائية المعتمدة
                  </h3>
                  <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                    بتاريخ: {finalSettlement.terminationDate || finalSettlement.settlementDate || '—'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ color: '#166534', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
                      ➕ إجمالي المستحقات: +{fmt(finalSettlement.totalEarnings)} ج.م
                    </div>
                    <div style={{ fontSize: '12px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>أجر الساعات الأساسية: {fmt(finalSettlement.totalBaseEarnings)} ج.م</div>
                      <div>أجر الساعات الإضافية: {fmt(finalSettlement.totalOvertimeEarnings)} ج.م</div>
                      <div>إجمالي البدلات: {fmt(finalSettlement.totalAllowances)} ج.م</div>
                      <div>المكافآت: {fmt(finalSettlement.totalBonus)} ج.م</div>
                    </div>
                  </div>

                  <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
                      ➖ إجمالي الاستقطاعات والديون: -{fmt(finalSettlement.totalDeductions)} ج.م
                    </div>
                    <div style={{ fontSize: '12px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>كامل رصيد السلف والأدوية المتبقي: -{fmt(finalSettlement.totalRemainingLoansDebt)} ج.م</div>
                      <div>خصومات التأخير: -{fmt(finalSettlement.lateDeduction)} ج.م</div>
                      <div>الجزاءات والخصومات: -{fmt(finalSettlement.manualDeduction)} ج.م</div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: finalSettlement.isPayableToEmployee !== false ? '#059669' : '#dc2626',
                    color: '#fff',
                    padding: '14px 20px',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontWeight: 'bold',
                    fontSize: '16px'
                  }}
                >
                  <span>{finalSettlement.settlementStatusLabel || 'صافي المخالصة والتصفية'}:</span>
                  <span style={{ fontSize: '20px' }}>{fmt(Math.abs(finalSettlement.netSettlement || 0))} ج.م</span>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', textAlign: 'center', color: 'var(--muted)' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📄</span>
                لم يتم تسجيل مخالصة مالية نهائية مسبقة لهذا الموظف.
              </div>
            )}
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
                          <span style={{ background: rem <= 0 ? '#dcfce7' : '#fee2e2', color: rem <= 0 ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px' }}>
                            {rem <= 0 ? 'مسدد بالكامل' : 'متبقي مديونية'}
                          </span>
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
    </div>
  );
}
