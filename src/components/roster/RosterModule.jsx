import React, { useState } from 'react';
import RosterPreviewModal from './RosterPreviewModal';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';
import { getCycleDateRange } from '../../utils/periodEngine';
import { getResolvedEmployeeRoster } from '../../utils/rosterEngine';

export const DEFAULT_ROSTER_SCHEDULE = {
  'السبت': { type: 'shift', start: '08:00', end: '16:00' },
  'الأحد': { type: 'shift', start: '08:00', end: '16:00' },
  'الاثنين': { type: 'shift', start: '08:00', end: '16:00' },
  'الثلاثاء': { type: 'shift', start: '16:00', end: '00:00' },
  'الأربعاء': { type: 'shift', start: '08:00', end: '16:00' },
  'الخميس': { type: 'shift', start: '08:00', end: '16:00' },
  'الجمعة': { type: 'off', start: '', end: '' }
};

export function normalizeSchedule(rawSchedule) {
  if (!rawSchedule || typeof rawSchedule !== 'object') return DEFAULT_ROSTER_SCHEDULE;
  
  const normalized = { ...DEFAULT_ROSTER_SCHEDULE };
  
  const dayKeyMap = {
    'saturday': 'السبت',
    'sunday': 'الأحد',
    'monday': 'الاثنين',
    'tuesday': 'الثلاثاء',
    'wednesday': 'الأربعاء',
    'thursday': 'الخميس',
    'friday': 'الجمعة',
    'السبت': 'السبت',
    'الأحد': 'الأحد',
    'الاحد': 'الأحد',
    'الإثنين': 'الاثنين',
    'الاثنين': 'الاثنين',
    'الثلاثاء': 'الثلاثاء',
    'الأربعاء': 'الأربعاء',
    'الاربعاء': 'الأربعاء',
    'الخميس': 'الخميس',
    'الجمعة': 'الجمعة',
    '0': 'الأحد',
    '1': 'الاثنين',
    '2': 'الثلاثاء',
    '3': 'الأربعاء',
    '4': 'الخميس',
    '5': 'الجمعة',
    '6': 'السبت',
    'day_0': 'الأحد',
    'day_1': 'الاثنين',
    'day_2': 'الثلاثاء',
    'day_3': 'الأربعاء',
    'day_4': 'الخميس',
    'day_5': 'الجمعة',
    'day_6': 'السبت'
  };

  Object.entries(rawSchedule).forEach(([key, val]) => {
    const cleanKey = String(key).trim().toLowerCase();
    const mappedDay = dayKeyMap[cleanKey] || dayKeyMap[key];
    if (mappedDay && val && typeof val === 'object') {
      const isOff = val.type === 'off' || val.isOff === true || val.type === 'راحة';
      normalized[mappedDay] = {
        type: isOff ? 'off' : 'shift',
        start: isOff ? '' : (val.start || val.checkIn || '08:00'),
        end: isOff ? '' : (val.end || val.checkOut || '16:00')
      };
    }
  });

  return normalized;
}

export { getResolvedEmployeeRoster };

export default function RosterModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRosterEmp, setSelectedRosterEmp] = useState(null);

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((emp) => {
    if (!isEmployeeActive(emp)) return false;
    if (selectedBranch && emp.branchId !== selectedBranch && (!emp.branchesDetails || !emp.branchesDetails.some(bd => String(bd.branchId) === String(selectedBranch)))) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name?.toLowerCase().includes(q);
      const matchNickname = emp.nickname?.toLowerCase().includes(q);
      const matchCode = emp.code?.includes(q);
      if (!matchName && !matchNickname && !matchCode) return false;
    }
    return true;
  });

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📅 إدارة معاينة الجداول الشهرية لموظفي الصيدليات
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            مراجعة شفتات وأيام الراحة الأسبوعية لكل موظف عبر النافذة المنبثقة
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>👥 جميع موظفي الصيدليات (اضغط على الموظف لمعاينة الجدول)</h4>
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
              <th>حالة اعتماد الجدول الشهري</th>
              <th>معاينة الجدول</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => String(br.id) === String(emp.branchId));
                const empRoster = getResolvedEmployeeRoster(emp, selectedBranch, state);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td>
                      {empRoster?.status === 'approved' ? (
                        (!empRoster?.schedule || Object.keys(empRoster.schedule).length === 0) ? (
                          <span className="badge badge-danger" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #ef4444', fontWeight: 'bold' }}>
                            ⚠️ معتمد (بدون جدول تفصيلي!)
                          </span>
                        ) : (
                          <span className="badge badge-success">🟢 معتمد من الإدارة والفرع</span>
                        )
                      ) : (
                        <span className="badge badge-warning">⏳ قيد المراجعة</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedRosterEmp(emp)}
                      >
                        👁️ معاينة الجدول الشهري
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Roster Preview Modal */}
      {selectedRosterEmp && (
        <RosterPreviewModal
          employee={selectedRosterEmp}
          state={state}
          onClose={() => setSelectedRosterEmp(null)}
        />
      )}
    </div>
  );
}
