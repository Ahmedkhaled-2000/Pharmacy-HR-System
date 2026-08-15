import React from 'react';
import { getResolvedEmployeeRoster } from './RosterModule';

export default function RosterPreviewModal({
  employee,
  state,
  onClose
}) {
  if (!employee) return null;

  const empRoster = getResolvedEmployeeRoster(employee, null, state);

  const daysOfWeek = [
    { key: 'sunday', label: 'الأحد' },
    { key: 'monday', label: 'الإثنين' },
    { key: 'tuesday', label: 'الثلاثاء' },
    { key: 'wednesday', label: 'الأربعاء' },
    { key: 'thursday', label: 'الخميس' },
    { key: 'friday', label: 'الجمعة' },
    { key: 'saturday', label: 'السبت' },
  ];

  const isMultiBranch = employee.branchesDetails && employee.branchesDetails.length > 1;

  return (
    <div className="modal-backdrop">
      <div className="modal-content card" style={{ maxWidth: '750px', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0d9488', fontSize: '18px' }}>
              📅 الجدول الشهري والأسبوعي للموظف: {employee.name}
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              كود: {employee.code} | {isMultiBranch ? `مسجل في ${employee.branchesDetails.length} فروع` : `الفرع: ${employee.branchName || 'الرئيسي'}`} | المسمى الوظيفي: {employee.jobTitle}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕ إغلاق Window</button>
        </div>

        {isMultiBranch ? (
          <div>
            {employee.branchesDetails.map((bd) => {
              const bId = bd.branchId;
              const bObj = (state.branches || []).find((b) => String(b.id) === String(bId));
              const bName = bObj ? bObj.name : `فرع ${bId}`;
              const bRoster = getResolvedEmployeeRoster(employee, bId, state);

              return (
                <div key={bId} style={{ marginBottom: '24px', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', background: 'var(--surface-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '15px' }}>
                      🏢 جدول فرع: {bName}
                    </h4>
                    <span className={`badge ${bRoster?.status === 'approved' ? 'badge-success' : 'badge-warning'}`}>
                      {bRoster?.status === 'approved' ? '🟢 معتمد' : '⏳ بانتظار الاعتماد'}
                    </span>
                  </div>

                  {bRoster?.status === 'approved' && (!bRoster?.schedule || Object.keys(bRoster.schedule).length === 0) && (
                    <div style={{ background: '#fef2f2', border: '2px solid #ef4444', padding: '12px 16px', borderRadius: '12px', color: '#b91c1c', marginBottom: '14px', fontSize: '13.5px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px' }}>🚨</span>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '900' }}>⚠️ تنبيه عاجل للإدارة العليا:</div>
                        <div>تم اعتماد الجدول الشهري لفرع ({bName})، ولكن لم يتم وضع أو تحديد جدول شهري تفصيلي لهذا الموظف!</div>
                      </div>
                    </div>
                  )}

                  <div className="table-responsive">
                    <table className="bylaws-table" style={{ fontSize: '13.5px' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface)' }}>
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
                          const shiftData = bRoster?.schedule?.[day.key] || {
                            isOff: day.key === 'friday',
                            checkIn: '09:00',
                            checkOut: '17:00',
                            hours: bd.workHoursPerDay || 8
                          };

                          return (
                            <tr key={day.key} style={{ background: shiftData.isOff ? '#fef2f2' : 'transparent' }}>
                              <td style={{ fontWeight: '800' }}>{day.label}</td>
                              <td>
                                {shiftData.isOff ? <span className="badge badge-danger">🔴 راحة أسبوعية (Off)</span> : <span className="badge badge-success">🟢 وردية عمل عادية</span>}
                              </td>
                              <td style={{ fontWeight: '700', color: shiftData.isOff ? 'var(--muted)' : '#15803d' }}>
                                {shiftData.isOff ? '—' : (shiftData.checkIn || shiftData.start || '09:00')}
                              </td>
                              <td style={{ fontWeight: '700', color: shiftData.isOff ? 'var(--muted)' : '#b91c1c' }}>
                                {shiftData.isOff ? '—' : (shiftData.checkOut || shiftData.end || '17:00')}
                              </td>
                              <td style={{ fontWeight: '700' }}>
                                {shiftData.isOff ? '0 ساعة' : `${shiftData.hours || bd.workHoursPerDay || 8} ساعات`}
                              </td>
                              <td>
                                {shiftData.isOff ? <span style={{ color: '#dc2626', fontSize: '12px' }}>راحة رسمية</span> : <span style={{ color: '#16a34a', fontSize: '12px' }}>مجدول</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Single branch standard rendering */
          <div>
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

            {empRoster?.status === 'approved' && (!empRoster?.schedule || Object.keys(empRoster.schedule).length === 0) && (
              <div style={{ background: '#fef2f2', border: '2px solid #ef4444', padding: '12px 16px', borderRadius: '12px', color: '#b91c1c', marginBottom: '16px', fontSize: '13.5px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>🚨</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '900' }}>⚠️ تنبيه عاجل للإدارة العليا:</div>
                  <div>تم اعتماد الجدول الشهري للموظف، ولكن لم يتم وضع أو تحديد جدول شهري تفصيلي لهذا الموظف حتى الآن!</div>
                </div>
              </div>
            )}

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
        )}
      </div>
    </div>
  );
}
