import React, { useState } from 'react';
import AttendancePunchesModal from './AttendancePunchesModal';
import { recalculateEmployeeCycleLateness } from '../../utils/latePenaltyEngine';

export default function AttendanceModule({
  state,
  setState,
  saveState,
  showToast,
  filterFn = null,
  monthPicker = null,
  filterMode = 'month',
  customFrom = '',
  customTo = ''
}) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPunchEmp, setSelectedPunchEmp] = useState(null);

  // Active period filter helper
  const activePeriodFilter = (d) => {
    if (!d) return false;
    const dateStr = String(d).slice(0, 10);
    if (typeof filterFn === 'function') return filterFn(dateStr);
    return true;
  };

  const isCustom = (filterMode === 'custom' || filterMode === 'range') && customFrom && customTo;
  const periodLabel = isCustom ? `الفترة المخصصة: من ${customFrom} إلى ${customTo}` : (monthPicker ? `دورة شهر (${monthPicker})` : '');

  // Manual Punch Form State
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualDate, setManualDate] = useState(() => (customFrom ? customFrom : new Date().toISOString().slice(0, 10)));
  const [manualInTime, setManualInTime] = useState('');
  const [manualOutTime, setManualOutTime] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualBranchId, setManualBranchId] = useState('');

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (selectedBranch && emp.branchId !== selectedBranch && (!emp.branchesDetails || !emp.branchesDetails.some((bd) => bd.branchId === selectedBranch))) return false;
    if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase()) && !emp.code.includes(searchQuery)) return false;
    return true;
  });

  const handleAddManualPunch = async (e) => {
    e.preventDefault();
    if (!manualEmpId || !manualDate || !manualInTime || !manualOutTime) {
      showToast?.('يرجى اختيار الموظف والتاريخ وأوقات الدخول والخروج');
      return;
    }

    const empObj = employees.find((e) => e.id === manualEmpId);

    const inHour = parseInt(manualInTime.split(':')[0]) || 9;
    const outHour = parseInt(manualOutTime.split(':')[0]) || 17;
    const workHours = Math.max(1, outHour - inHour);

    const newPunch = {
      id: `punch_manual_${Date.now()}`,
      employeeId: manualEmpId,
      employeeCode: empObj?.code || '',
      employeeName: empObj?.name || '',
      branchId: manualBranchId || empObj?.branchId || '',
      date: manualDate,
      timeIn: manualInTime,
      timeOut: manualOutTime,
      hours: workHours,
      note: manualNotes.trim() || 'تسجيل بصمة يدوية من الأدمن',
      statusLabel: 'تسجيل يدوي',
      createdAt: new Date().toISOString()
    };

    const updatedShifts = [newPunch, ...(state.shifts || [])];
    let updatedState = { ...state, shifts: updatedShifts };
    
    // Auto-recalculate employee lateness occurrences in current cycle
    const recRes = recalculateEmployeeCycleLateness({
      employeeId: manualEmpId,
      state: updatedState,
      payrollCycleId: manualDate.slice(0, 7)
    });
    updatedState = {
      ...updatedState,
      lateIncidents: recRes.incidents,
      requests: recRes.updatedRequests
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    setManualInTime('');
    setManualOutTime('');
    setManualNotes('');
    setManualBranchId('');
    showToast?.('✅ تم إضافة البصمة اليدوية للموظف بنجاح!');
    setManualNotes('');
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            ⏱️ سجل الحضور والانصراف وإضافة البصمات اليدوية
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            استعراض سجل بصمات الموظفين وإضافة بصمات يدوية مع تصفية بالفروع
          </p>
        </div>
      </div>

      {/* Add Manual Punch Form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
          ➕ إضافة بصمة يدوية لموظف
        </h4>
        <form onSubmit={handleAddManualPunch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div className="field">
            <label>اختر الموظف</label>
            <select value={manualEmpId} onChange={(e) => setManualEmpId(e.target.value)} required>
              <option value="">-- اختر الموظف --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} (كود: {e.code})</option>
              ))}
            </select>
          </div>

          {manualEmpId && employees.find(e => e.id === manualEmpId)?.branchesDetails?.length > 1 && (
            <div className="field">
              <label>الفرع (للموظف متعدد الفروع)</label>
              <select value={manualBranchId} onChange={(e) => setManualBranchId(e.target.value)} required>
                <option value="">-- اختر الفرع --</option>
                {employees.find(e => e.id === manualEmpId).branchesDetails.map(bd => {
                  const b = state.branches?.find(br => br.id === bd.branchId);
                  return <option key={bd.branchId} value={bd.branchId}>{b?.name || 'فرع غير معروف'}</option>;
                })}
              </select>
            </div>
          )}

          <div className="field">
            <label>تاريخ البصمة</label>
            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} required />
          </div>

          <div className="field">
            <label>وقت الدخول</label>
            <input type="time" value={manualInTime} onChange={(e) => setManualInTime(e.target.value)} required />
          </div>

          <div className="field">
            <label>وقت الخروج</label>
            <input type="time" value={manualOutTime} onChange={(e) => setManualOutTime(e.target.value)} required />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>ملاحظات ومبرر البصمة اليدوية</label>
            <input type="text" placeholder="سبب الإضافة اليدوية..." value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start">💾 تسجيل البصمة اليدوية</button>
          </div>
        </form>
      </div>

      {/* Filter and Employees List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>👥 كشف حضور الموظفين بالصيدليات (اضغط على الموظف للمعاينة)</h4>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
          />
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <option value="">-- جميع الفروع --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>المسمى الوظيفي</th>
              <th>عدد بصمات الفترة {periodLabel ? `(${periodLabel})` : ''}</th>
              <th>ساعات العمل المسجلة</th>
              <th>المعاينة والسجل</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => br.id === emp.branchId);
                const empPunches = (state.shifts || []).filter((p) => {
                  const isMatch = String(p.employeeId) === String(emp.id) || String(p.employeeCode) === String(emp.code);
                  return isMatch && activePeriodFilter(p.date);
                });
                const totalHours = empPunches.reduce((acc, p) => acc + (parseFloat(p.hours) || parseFloat(p.workHours) || 8), 0).toFixed(1);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{emp.name}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td><span className="badge badge-primary">{empPunches.length} وردية</span></td>
                    <td style={{ color: '#0d9488', fontWeight: '800' }}>{totalHours} ساعة</td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedPunchEmp(emp)}
                      >
                        📋 عرض سجل البصمات التفصيلي
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Attendance Punches Modal */}
      {selectedPunchEmp && (
        <AttendancePunchesModal
          employee={selectedPunchEmp}
          state={state}
          filterFn={filterFn}
          monthPicker={monthPicker}
          filterMode={filterMode}
          customFrom={customFrom}
          customTo={customTo}
          onClose={() => setSelectedPunchEmp(null)}
        />
      )}
    </div>
  );
}
