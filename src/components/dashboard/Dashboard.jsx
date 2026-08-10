import React, { useState } from 'react';

export default function Dashboard({
  state,
  setState,
  saveState,
  monthPicker,
  setMonthPicker,
  exportAllPayrollExcel,
  showToast
}) {
  const [filterPeriod, setFilterPeriod] = useState('current'); // 'current' | 'custom'

  const orgSettings = state.orgSettings || {};
  const employees = state.employees || [];
  const branches = state.branches || [];
  const punches = state.shifts || [];
  const transactions = state.finances || state.transactions || [];

  // General Manager Name fallback
  const gmName = orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const orgLogo = orgSettings.logoUrl || '';

  // Branch employee counts
  const branchCounts = branches.map((b) => {
    const count = employees.filter((e) => e.branchId === b.id).length;
    return { ...b, count };
  });

  const unassignedCount = employees.filter((e) => !e.branchId).length;

  // Live Punches per Branch
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayPunches = punches.filter((p) => (p.date || p.timestamp || '').startsWith(todayDate));

  // Financial Stats Calculation (Matching Image 1)
  const totalWorkHours = punches
    .reduce((acc, p) => acc + (parseFloat(p.hours) || parseFloat(p.workHours) || 8), 0)
    .toFixed(2);

  const totalBaseEarnings = employees
    .reduce((acc, e) => acc + (parseFloat(e.salary) || 4000), 0);

  const totalBonuses = (state.adjustments || [])
    .filter((a) => a.type === 'bonus')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const totalDeductions = (state.adjustments || [])
    .filter((a) => a.type === 'deduction' || a.type === 'penalty')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const totalNetSalaries = totalBaseEarnings + totalBonuses - totalDeductions;

  // Income & Expenses
  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  return (
    <div style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }} className="fade-in-page">
      {/* ── 1. Top Header: Pharmacy Name, Logo, GM Name ── */}
      <div className="card settings-card fade-in" style={{ padding: '20px', marginBottom: '20px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '28px',
              fontWeight: 'bold',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(13,148,136,0.3)'
            }}>
              {orgLogo ? <img src={orgLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏥'}
            </div>

            <div>
              <h2 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--text)', fontSize: '22px' }}>
                {orgName}
              </h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--primary)', fontWeight: '700', fontSize: '14.5px' }}>
                👤 {gmName}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>الشهر المعروض:</label>
            <input
              type="month"
              value={monthPicker}
              onChange={(e) => setMonthPicker(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
            />
          </div>
        </div>
      </div>

      {/* ── 2. Employee Summary Cards Breakdown ── */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e293b' }}>
        📊 إحصائيات الموظفين وتوزيع الفروع والإدارات
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '16px', borderRadius: '12px' }}>
          <span style={{ fontSize: '12.5px', opacity: 0.9 }}>👥 عدد الموظفين الكلي بالشركة</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{employees.length} موظف</h3>
        </div>

        {branchCounts.map((b) => (
          <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>🏢 {b.name}</span>
            <h3 style={{ margin: '6px 0 0 0', fontSize: '22px', fontWeight: '800', color: 'var(--primary)' }}>
              {b.count} موظف
            </h3>
          </div>
        ))}

        {unassignedCount > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>🏢 الإدارة العامة / المركز الرئيسي</span>
            <h3 style={{ margin: '6px 0 0 0', fontSize: '22px', fontWeight: '800', color: 'var(--text)' }}>
              {unassignedCount} موظف
            </h3>
          </div>
        )}
      </div>

      {/* ── 3. Separate Live Punch Cards for Every Branch ── */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e293b' }}>
        ⏱️ بطاقات الحضور والبصمات الحية لكل فرع منفصل ({todayDate})
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {branches.map((b) => {
          const branchEmps = employees.filter((e) => e.branchId === b.id);
          const empIds = new Set(branchEmps.map((e) => e.id));
          const branchTodayPunches = todayPunches.filter((p) => empIds.has(p.employeeId));

          return (
            <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '15px' }}>🏢 فرع {b.name}</h4>
                <span className="badge badge-success">{branchTodayPunches.length} بصمة حية</span>
              </div>

              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {branchEmps.length === 0 ? (
                  <span style={{ color: 'var(--muted)' }}>لا يوجد موظفين مسجلين بهذا الفرع.</span>
                ) : (
                  branchEmps.slice(0, 3).map((emp) => {
                    const hasPunched = branchTodayPunches.some((p) => p.employeeId === emp.id);
                    return (
                      <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>👤 {emp.name}</span>
                        {hasPunched ? (
                          <span style={{ color: '#16a34a', fontWeight: 'bold' }}>🟢 حاضـر</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 'bold' }}>🔴 لم يبصم</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 4. Financial Summary & Reports (Matching Image 1 Specifications) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '18px', color: '#1e293b' }}>
          إجمالي الرواتب والتقارير المالية لجميع الموظفين بالشركة
        </h3>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}>
            <option value="current">📅 الشهر الحالي ({monthPicker})</option>
            <option value="custom">📅 تصفية الفترة المخصصة</option>
          </select>

          <button className="btn btn-start" onClick={exportAllPayrollExcel} style={{ padding: '6px 14px', fontSize: '13px' }}>
            📊 تصدير شيت إكسيل مخصص بالفترة
          </button>
        </div>
      </div>

      {/* Financial Cards Grid (Matching Image 1 EXACT layout) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
        {/* Card 1: Total Work Hours */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي ساعات العمل</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#0d9488', textAlign: 'left' }}>
            {totalWorkHours} ساعة
          </h3>
        </div>

        {/* Card 2: Total Base Earnings */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي المستحقات الأساسية</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#0d9488', textAlign: 'left' }}>
            {totalBaseEarnings.toFixed(2)} ج.م
          </h3>
        </div>

        {/* Card 3: Total Bonuses */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي المكافآت</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#10b981', textAlign: 'left' }}>
            +{totalBonuses.toFixed(2)} ج.م
          </h3>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '14px', marginBottom: '24px' }}>
        {/* Card 4: Solid Teal Banner - Total Paid Net Salaries */}
        <div style={{ background: '#0d9488', color: '#fff', padding: '18px 24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '13px', opacity: 0.9, fontWeight: '700', textAlign: 'left' }}>إجمالي رواتب الشركة المدفوعة (صافي المرتبات)</span>
          <h2 style={{ margin: '8px 0 0 0', fontSize: '32px', fontWeight: '900', textAlign: 'left' }}>
            {totalNetSalaries.toFixed(2)} ج.م
          </h2>
        </div>

        {/* Card 5: Total Deductions */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي الخصومات</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#ef4444', textAlign: 'left' }}>
            -{totalDeductions.toFixed(2)} ج.م
          </h3>
        </div>
      </div>

      {/* Income & Expenses Summary Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px', borderRadius: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>🟢 إجمالي الإيرادات المسجلة</span>
          <h4 style={{ margin: '4px 0 0 0', color: '#16a34a', fontWeight: '800' }}>{totalIncome.toLocaleString()} ج.م</h4>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px', borderRadius: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>🔴 إجمالي المصروفات المسجلة</span>
          <h4 style={{ margin: '4px 0 0 0', color: '#dc2626', fontWeight: '800' }}>{totalExpenses.toLocaleString()} ج.م</h4>
        </div>
      </div>
    </div>
  );
}
