import React from 'react';

export default function RosterPreviewModal({
  employee,
  state,
  onClose
}) {
  if (!employee) return null;

  const rosters = state.rosters || [];
  const empRoster = rosters.find((r) => r.employeeId === employee.id);

  const daysOfWeek = [
    { key: 'sunday', label: 'الأحد' },
    { key: 'monday', label: 'الإثنين' },
    { key: 'tuesday', label: 'الثلاثاء' },
    { key: 'wednesday', label: 'الأربعاء' },
    { key: 'thursday', label: 'الخميس' },
    { key: 'friday', label: 'الجمعة' },
    { key: 'saturday', label: 'السبت' },
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal-content card" style={{ maxWidth: '750px', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0d9488', fontSize: '18px' }}>
              📅 الجدول الشهري والأسبوعي للموظف: {employee.name}
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              كود: {employee.code} | الفرع: {employee.branchName || 'الرئيسي'} | المسمى الوظيفي: {employee.jobTitle}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕ إغلاق Window</button>
        </div>

        {/* Approval status banner */}
        <div style={{ background: '#e6f7f5', border: '1px solid #0d9488', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', color: '#0f766e', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            حالة اعتماد الجدول الشهري:{' '}
            {empRoster?.status === 'approved' ? (
              <strong style={{ color: '#16a34a' }}>🟢 معتمد نهائياً (مدير الفرع + الإدارة العليا)</strong>
            ) : (
              <strong style={{ color: '#d97706' }}>⏳ بانتظار استكمال الموافقات المزدوجة</strong>
            )}
          </span>
          <span style={{ fontSize: '12px' }}>بداية الشهر: 25 من كل شهر</span>
        </div>

        {/* Shift Calendar Table */}
        <div className="table-responsive">
          <table className="bylaws-table" style={{ fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted)' }}>
                <th>اليوم</th>
                <th>نوع اليوم / الشفت</th>
                <th>موعد الدخول (Check-in)</th>
                <th>موعد الخروج (Check-out)</th>
                <th>ساعات الشفت</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {daysOfWeek.map((day) => {
                const shiftData = empRoster?.schedule?.[day.key] || {
                  isOff: day.key === 'friday',
                  checkIn: '09:00',
                  checkOut: '17:00',
                  hours: 8
                };

                return (
                  <tr key={day.key} style={{ background: shiftData.isOff ? '#fef2f2' : 'transparent' }}>
                    <td style={{ fontWeight: '800' }}>{day.label}</td>
                    <td>
                      {shiftData.isOff ? (
                        <span className="badge badge-danger">🔴 راحة أسبوعية (Off)</span>
                      ) : (
                        <span className="badge badge-success">🟢 وردية عمل عادية</span>
                      )}
                    </td>
                    <td style={{ fontWeight: '700', color: shiftData.isOff ? 'var(--muted)' : '#15803d' }}>
                      {shiftData.isOff ? '—' : (shiftData.checkIn || '09:00')}
                    </td>
                    <td style={{ fontWeight: '700', color: shiftData.isOff ? 'var(--muted)' : '#b91c1c' }}>
                      {shiftData.isOff ? '—' : (shiftData.checkOut || '17:00')}
                    </td>
                    <td style={{ fontWeight: '700' }}>
                      {shiftData.isOff ? '0 ساعة' : `${shiftData.hours || 8} ساعات`}
                    </td>
                    <td>
                      {shiftData.isOff ? (
                        <span style={{ color: '#dc2626', fontSize: '12px' }}>راحة رسمية</span>
                      ) : (
                        <span style={{ color: '#16a34a', fontSize: '12px' }}>مجدول</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
