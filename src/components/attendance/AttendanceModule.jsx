import React, { useState } from 'react';
import AttendancePunchesModal from './AttendancePunchesModal';
import { recalculateEmployeeCycleLateness } from '../../utils/latePenaltyEngine';
import { getEmpDisplayName, isEmployeeActive, getEmployeeManualPunchesCount } from '../../utils/formatters';

export default function AttendanceModule({
  state,
  setState,
  saveState,
  showToast,
  filterFn = null,
  monthPicker = null,
  filterMode = 'month',
  customFrom = '',
  customTo = '',
  executeWithOwnerGuard
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
  const [manualBreakHours, setManualBreakHours] = useState('0');
  const [manualNotes, setManualNotes] = useState('');
  const [manualBranchId, setManualBranchId] = useState('');

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (!isEmployeeActive(emp)) return false;
    if (selectedBranch && emp.branchId !== selectedBranch && (!emp.branchesDetails || !emp.branchesDetails.some((bd) => bd.branchId === selectedBranch))) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name?.toLowerCase().includes(q);
      const matchNickname = emp.nickname?.toLowerCase().includes(q);
      const matchCode = emp.code?.includes(q);
      if (!matchName && !matchNickname && !matchCode) return false;
    }
    return true;
  });

  const handleAddManualPunch = async (e) => {
    e.preventDefault();
    if (!manualEmpId || !manualDate || !manualInTime || !manualOutTime) {
      showToast?.('يرجى اختيار الموظف والتاريخ وأوقات الدخول والخروج');
      return;
    }

    const empObj = employees.find((e) => e.id === manualEmpId);

    const inParts = manualInTime.split(':').map(Number);
    const outParts = manualOutTime.split(':').map(Number);
    let diffMinutes = ((outParts[0] || 0) * 60 + (outParts[1] || 0)) - ((inParts[0] || 0) * 60 + (inParts[1] || 0));
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    const elapsedHours = diffMinutes / 60;
    const bH = Math.max(0, parseFloat(manualBreakHours) || 0);
    const workHours = Math.max(0, Math.round((elapsedHours - bH) * 100) / 100);

    const performAdd = () => {
      const newPunch = {
        id: `punch_manual_${Date.now()}`,
        employeeId: manualEmpId,
        employeeCode: empObj?.code || '',
        employeeName: empObj?.name || '',
        branchId: manualBranchId || empObj?.branchId || '',
        date: manualDate,
        timeIn: manualInTime,
        timeOut: manualOutTime,
        breakHours: bH,
        hours: workHours,
        actualWorkedHours: workHours,
        isManual: true,
        manualPunch: true,
        createdBy: 'admin',
        creatorRole: 'admin',
        isAdminCreated: true,
        acknowledgedByAdmin: true,
        note: manualNotes.trim() || (bH > 0 ? `تسجيل بصمة يدوية من الأدمن (بريك: ${bH} س)` : 'تسجيل بصمة يدوية من الأدمن'),
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

      const markedIncidents = (recRes.incidents || []).map((inc) => {
        if (inc.shiftId === newPunch.id || inc.date === manualDate) {
          return {
            ...inc,
            read: true,
            acknowledgedByAdmin: true,
            isAdminCreated: true,
            creatorRole: 'admin'
          };
        }
        return inc;
      });

      const markedRequests = (recRes.updatedRequests || []).map((r) => {
        if (r.date === manualDate || r.shiftId === newPunch.id) {
          return {
            ...r,
            read: true,
            hiddenFromAdmin: true,
            isAdminCreated: true,
            creatorRole: 'admin'
          };
        }
        return r;
      });

      updatedState = {
        ...updatedState,
        lateIncidents: markedIncidents,
        requests: markedRequests
      };

      // 0ms instant optimistic UI response
      if (setState) setState(updatedState);
      setManualInTime('');
      setManualOutTime('');
      setManualBreakHours('0');
      setManualNotes('');
      setManualBranchId('');

      const lateInc = markedIncidents.find((inc) => (inc.shiftId === newPunch.id || inc.date === manualDate) && inc.lateMinutes > 0);
      if (lateInc && lateInc.deductionMinutes > 0) {
        showToast?.(`✅ تم تسجيل البصمة وتطبيق لائحة الجزاءات تلقائياً: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.tierName} (${lateInc.actionLabel} - خصم ${lateInc.penaltyAmount} ج.م)`);
      } else if (lateInc && lateInc.lateMinutes > 0) {
        showToast?.(`✅ تم تسجيل البصمة وتطبيق اللائحة: تأخير (${lateInc.lateMinutes} دقيقة) - ${lateInc.actionLabel || 'فترة سماح'}`);
      } else {
        showToast?.('✅ تم إضافة البصمة اليدوية للموظف فوراً وحساب الساعات بنجاح (حضور في الموعد)');
      }

      // Non-blocking background sync
      if (saveState) {
        saveState(updatedState).catch(err => console.error('Background save error on manual punch:', err));
      }
    };

    performAdd();
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
            <select
              value={manualEmpId}
              onChange={(e) => {
                const id = e.target.value;
                setManualEmpId(id);
                const emp = employees.find(em => String(em.id) === String(id));
                if (emp) {
                  const bH = emp.breakHours || emp.defaultBreakHours || emp.branchesDetails?.[0]?.breakHours || '0';
                  setManualBreakHours(String(bH));
                } else {
                  setManualBreakHours('0');
                }
              }}
              required
            >
              <option value="">-- اختر الموظف --</option>
              {employees.filter(isEmployeeActive).map((e) => {
                const count = getEmployeeManualPunchesCount(e.id, state, activePeriodFilter);
                return (
                  <option key={e.id} value={e.id}>
                    {getEmpDisplayName(e)} (كود: {e.code}) — [مسجل له {count} بصمات يدوية هذا الشهر]
                  </option>
                );
              })}
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

          <div className="field">
            <label>ساعات البريك (تخصم من اليوم)</label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="12"
              value={manualBreakHours}
              onChange={(e) => setManualBreakHours(e.target.value)}
              placeholder="0"
            />
          </div>

          {manualInTime && manualOutTime && (() => {
            const inParts = manualInTime.split(':').map(Number);
            const outParts = manualOutTime.split(':').map(Number);
            let diffMinutes = ((outParts[0] || 0) * 60 + (outParts[1] || 0)) - ((inParts[0] || 0) * 60 + (inParts[1] || 0));
            if (diffMinutes <= 0) diffMinutes += 24 * 60;
            const gross = Math.round((diffMinutes / 60) * 100) / 100;
            const bH = Math.max(0, parseFloat(manualBreakHours) || 0);
            const net = Math.max(0, Math.round((gross - bH) * 100) / 100);
            return (
              <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bbf7d0', fontSize: '13px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span>⏱️ إجمالي وقت التواجد: <strong>{gross} س</strong></span>
                <span>☕ ساعات البريك المخصومة: <strong>{bH} س</strong></span>
                <span style={{ color: '#16a34a', fontWeight: '800' }}>✅ صافي ساعات العمل المحسوبة: <strong>{net} ساعة</strong></span>
              </div>
            );
          })()}

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
              <th>بصمات يدوية هذا الشهر</th>
              <th>ساعات العمل المسجلة</th>
              <th>المعاينة والسجل</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => br.id === emp.branchId);
                const empPunches = (state.shifts || []).filter((p) => {
                  const isMatch = String(p.employeeId) === String(emp.id) || String(p.employeeCode) === String(emp.code);
                  return isMatch && activePeriodFilter(p.date);
                });
                const totalHours = empPunches.reduce((acc, p) => acc + (parseFloat(p.hours) || parseFloat(p.workHours) || 8), 0).toFixed(1);
                const manualCount = getEmployeeManualPunchesCount(emp.id, state, activePeriodFilter);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td><span className="badge badge-primary">{empPunches.length} وردية</span></td>
                    <td>
                      {manualCount > 0 ? (
                        <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '3px 10px', borderRadius: '8px', fontWeight: '800', fontSize: '12px' }}>
                          🖐️ {manualCount} يدوي
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>0</span>
                      )}
                    </td>
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
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          executeWithOwnerGuard={executeWithOwnerGuard}
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
