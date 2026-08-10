import React from 'react';

export default function PermissionsCard({
  selectedPermEmpId,
  handlePermEmpChange,
  state,
  getEmpName,
  permAllowManualShift,
  setPermAllowManualShift,
  permAllowEditShift,
  setPermAllowEditShift,
  permAllowStartEnd,
  setPermAllowStartEnd,
  permAllowViewSalary,
  setPermAllowViewSalary,
  permAllowAddAdjustment,
  setPermAllowAddAdjustment,
  permAllowViewAdjustments,
  setPermAllowViewAdjustments,
  permAllowExportExcel,
  setPermAllowExportExcel,
  handleResetAllPermissions,
  handleResetSingleEmpPermissions
}) {
  const permList = [
    {
      id: 'manual',
      title: 'تسجيل الورديات والشيفتات يدوياً',
      badge: 'Manual Shift Entry',
      desc: 'إمكانية اختيار الموظف وإضافة وردية بتحديد وقت الدخول والخروج والخصم.',
      checked: permAllowManualShift,
      onChange: (e) => setPermAllowManualShift(e.target.checked)
    },
    {
      id: 'edit',
      title: 'التعديل والحذف للورديات السابقة',
      badge: 'Edit & Delete Shifts',
      desc: 'السماح بتصحيح وتغيير أوقات الورديات المحفوظة بالنظام.',
      checked: permAllowEditShift,
      onChange: (e) => setPermAllowEditShift(e.target.checked)
    },
    {
      id: 'startEnd',
      title: 'بدء وإنهاء الشيفت الحقيقي',
      badge: 'Start / End Shift Timer',
      desc: 'إمكانية الضغط على زر الدخول والخروج والبدء الفوري للحضور.',
      checked: permAllowStartEnd,
      onChange: (e) => setPermAllowStartEnd(e.target.checked)
    },
    {
      id: 'viewSalary',
      title: 'عرض إجمالي المستحقات والرواتب',
      badge: 'View Salary Breakdown',
      desc: 'إظهار تفاصيل وقيم الرواتب المستحقة والمكافآت والخصومات للموظف.',
      checked: permAllowViewSalary,
      onChange: (e) => setPermAllowViewSalary(e.target.checked)
    },
    {
      id: 'viewAdjustments',
      title: 'عرض المكافآت والخصومات والتسويات',
      badge: 'View Adjustments',
      desc: 'إمكانية تصفح كشف المكافآت والخصومات والتسويات الخاصة بالموظف.',
      checked: permAllowViewAdjustments,
      onChange: (e) => setPermAllowViewAdjustments(e.target.checked)
    },
    {
      id: 'adjustments',
      title: 'إضافة الخصومات والمكافآت',
      badge: 'Add Adjustments',
      desc: 'إمكانية إضافة تسوية مالية جديدة للموظفين.',
      checked: permAllowAddAdjustment,
      onChange: (e) => setPermAllowAddAdjustment(e.target.checked)
    },
    {
      id: 'exportExcel',
      title: 'تصدير شيت إكسل الموظف',
      badge: 'Export Employee Excel',
      desc: 'السماح للموظف بتنزيل وتصدير كشف مفردات مرتبه بصيغة Excel.',
      checked: permAllowExportExcel,
      onChange: (e) => setPermAllowExportExcel(e.target.checked)
    }
  ];

  return (
    <div className="permissions-card settings-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🛡️</span>
          <h3 style={{ margin: 0, fontSize: '18px' }}>إدارة صلاحيات الموظفين والعمليات</h3>
        </div>
        {handleResetAllPermissions && (
          <button
            type="button"
            className="del-btn"
            style={{ padding: '7px 16px', fontSize: '12.5px', fontWeight: '700', borderRadius: '99px' }}
            onClick={handleResetAllPermissions}
            title="إلغاء ومسح كافة الصلاحيات وإيقافها لجميع الموظفين بالنظام"
          >
            🔒 إلغاء ومسح جميع الصلاحيات لجميع الموظفين
          </button>
        )}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 18px' }}>
        تحديد وتقييد الصلاحيات المتاحة للموظفين بتسجيل وتعديل الورديات وتصفح بيانات الرواتب بشكل عام أو مخصص لكل موظف.
      </p>

      {/* Employee Target Selector */}
      <div className="settings-inner-box" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <label
            style={{
              fontWeight: '700',
              fontSize: '13.5px',
              margin: 0,
              color: 'var(--primary)'
            }}
          >
            👤 اختر الموظف المستهدف لتخصيص صلاحياته:
          </label>
          {selectedPermEmpId !== 'all' && handleResetSingleEmpPermissions && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 12px', fontSize: '12px', color: 'var(--danger)', border: '1px solid var(--border)' }}
              onClick={handleResetSingleEmpPermissions}
            >
              🔒 إلغاء وإيقاف جميع الصلاحيات لهذا الموظف
            </button>
          )}
        </div>
        <select
          value={selectedPermEmpId}
          onChange={(e) => handlePermEmpChange(e.target.value)}
          style={{
            width: '100%',
            padding: '11px 16px',
            borderRadius: '99px',
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          <option value="all">جميع الموظفين (الصلاحيات العامة للمؤسسة)</option>
          {state.employees.map((e) => (
            <option key={e.id} value={e.id}>
              الموظف: {e.name} (كود: {e.code}) {e.permissions ? '⭐ [صلاحيات مخصصة]' : ''}
            </option>
          ))}
        </select>
        {selectedPermEmpId !== 'all' && (
          <div style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '8px', fontWeight: '700' }}>
            ⚠️ أنت تقوم حالياً بتعديل الصلاحيات المخصصة فقط للموظف: "{getEmpName(selectedPermEmpId)}"
          </div>
        )}
      </div>

      {/* Permission Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {permList.map((item) => (
          <label
            key={item.id}
            className="settings-inner-box"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: '16px',
              padding: '16px 20px',
              margin: 0,
              cursor: 'pointer',
              boxSizing: 'border-box',
              transition: 'background 0.2s ease'
            }}
          >
            <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '15px', color: 'var(--text)' }}>{item.title}</strong>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    background: 'var(--primary-tint)',
                    color: 'var(--primary)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(20, 184, 166, 0.2)'
                  }}
                >
                  {item.badge}
                </span>
              </div>
              <span style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'block', lineHeight: '1.4' }}>
                {item.desc}
              </span>
            </div>

            <input
              type="checkbox"
              checked={item.checked}
              onChange={item.onChange}
              style={{
                width: '22px',
                height: '22px',
                accentColor: 'var(--primary)',
                cursor: 'pointer',
                flexShrink: 0,
                alignSelf: 'center',
                margin: 0
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

