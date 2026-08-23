import React from 'react';

export default function EmployeeModal({
  isEmpModalOpen,
  setIsEmpModalOpen,
  editingEmp,
  empPhotoUrl,
  setEmpPhotoUrl,
  empName,
  setEmpName,
  empNickname,
  setEmpNickname,
  empCode,
  setEmpCode,
  empPhone,
  setEmpPhone,
  empEmail,
  setEmpEmail,
  empRelativePhone,
  setEmpRelativePhone,
  empJobTitle,
  setEmpJobTitle,
  empSalary,
  setEmpSalary,
  empWorkHours,
  setEmpWorkHours,
  empWorkDays,
  setEmpWorkDays,
  empAnnualLeaveBalance,
  setEmpAnnualLeaveBalance,
  empPassword,
  setEmpPassword,
  handleFileUpload,
  handleSaveEmp,
  handleAdminDeviceStatus
}) {
  if (!isEmpModalOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card emp-form-modal">
        <h3 style={{ textAlign: 'center', marginBottom: '18px' }}>
          {editingEmp ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}
        </h3>

        <div className="emp-modal-vertical-layout">
          {/* Photo Upload Section at TOP Center */}
          <div className="emp-photo-top-section">
            <div className="emp-photo-preview-box">
              {empPhotoUrl ? (
                <img src={empPhotoUrl} alt="Employee Avatar" />
              ) : (
                <div className="avatar-placeholder-lg">{empName ? empName.charAt(0) : '👤'}</div>
              )}
            </div>

            <label className="btn btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              📷 رفع صورة من الجهاز
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, (dataUrl) => setEmpPhotoUrl(dataUrl))}
                style={{ display: 'none' }}
              />
            </label>
            {empPhotoUrl && (
              <button
                type="button"
                className="del-btn"
                style={{ marginTop: '4px', fontSize: '12px' }}
                onClick={() => setEmpPhotoUrl('')}
              >
                حذف الصورة
              </button>
            )}
          </div>

          {/* Input Fields */}
          <div className="form-row" style={{ flexDirection: 'column', gap: '12px', width: '100%' }}>
            <div className="field">
              <label>الاسم بالكامل (الرسمي في مسير الرواتب والمفردات)</label>
              <input type="text" value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="مثال: أحمد محمود علي" />
            </div>
            <div className="field">
              <label>اسم الشهرة (يظهر في جميع شاشات وصفحات النظام)</label>
              <input type="text" value={empNickname || ''} onChange={(e) => setEmpNickname?.(e.target.value)} placeholder="مثال: د. أحمد / دكتور كريم (اختياري)" />
            </div>
            <div className="field">
              <label>كود الموظف / البصمة الإلكترونية</label>
              <input type="text" value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="101" />
            </div>
            <div className="field">
              <label>البريد الإلكتروني الشخصي (Gmail التنبيهات)</label>
              <input type="email" value={empEmail || ''} onChange={(e) => setEmpEmail?.(e.target.value)} placeholder="employee@gmail.com" />
            </div>
            <div className="field">
              <label>رقم الهاتف الشخصي / الجوال</label>
              <input type="text" value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} placeholder="01012345678" />
            </div>
            <div className="field">
              <label>رقم هاتف قريب من الدرجة الأولى (للطوارئ)</label>
              <input type="text" value={empRelativePhone} onChange={(e) => setEmpRelativePhone?.(e.target.value)} placeholder="01112345678 (الأب / الزوجة / الأخ)" />
            </div>
            <div className="field">
              <label>المسمى الوظيفي</label>
              <input type="text" value={empJobTitle} onChange={(e) => setEmpJobTitle(e.target.value)} placeholder="مساعد صيدلي / مدخل بيانات" />
            </div>
            <div className="field">
              <label>سعر الساعة الشهري (الراتب الأساسي)</label>
              <input type="text" inputMode="decimal" value={empSalary} onChange={(e) => setEmpSalary(e.target.value)} placeholder="650" />
            </div>
            <div className="field">
              <label>عدد ساعات العمل اليومية المدخلة (ساعة)</label>
              <input type="text" inputMode="decimal" value={empWorkHours} onChange={(e) => setEmpWorkHours(e.target.value)} placeholder="10" />
            </div>
            <div className="field">
              <label>عدد أيام العمل الشهرية المدخلة (يوم)</label>
              <input type="text" inputMode="decimal" value={empWorkDays} onChange={(e) => setEmpWorkDays(e.target.value)} placeholder="26" />
            </div>
            <div className="field">
              <label>رصيد الإجازات السنوي (يوم)</label>
              <input type="text" inputMode="numeric" value={empAnnualLeaveBalance} onChange={(e) => setEmpAnnualLeaveBalance(e.target.value)} placeholder="21" />
            </div>
            <div className="field">
              <label>كلمة السر (للدخول للبوابة)</label>
              <input type="text" value={empPassword} onChange={(e) => setEmpPassword(e.target.value)} placeholder="123" />
            </div>
          </div>
        </div>

        {/* ── قسم الأجهزة المرتبطة بالموظف (تظهر فقط عند التعديل وليس الإضافة) ── */}
        {editingEmp && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>📱 الأجهزة المرتبطة للمصادقة (بصمة الجهاز)</h4>
            
            {(!editingEmp.devices || editingEmp.devices.length === 0) ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>لا توجد أجهزة مسجلة لهذا الموظف حتى الآن.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {editingEmp.devices.map((device, idx) => (
                  <div key={device.deviceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#334155' }}>
                        {device.deviceInfo?.deviceType || 'جهاز غير معروف'}
                        {device.status === 'pending' && <span style={{ background: '#fef08a', color: '#854d0e', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', marginLeft: '8px' }}>⏳ قيد المراجعة</span>}
                        {device.status === 'approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', marginLeft: '8px' }}>✅ معتمد</span>}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                        بصمة: {device.deviceId.substring(0, 16)}... | تاريخ الطلب: {device.requestedAt}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {device.status === 'pending' && (
                        <>
                          <button type="button" onClick={() => handleAdminDeviceStatus(editingEmp.id, device.deviceId, 'approved')} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>الموافقة</button>
                          <button type="button" onClick={() => handleAdminDeviceStatus(editingEmp.id, device.deviceId, 'rejected')} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>رفض الطلب</button>
                        </>
                      )}
                      {device.status === 'approved' && (
                        <button type="button" onClick={() => handleAdminDeviceStatus(editingEmp.id, device.deviceId, 'deleted')} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>حذف وإلغاء</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ margin: '12px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>* الموافقة على جهاز تعني أن الموظف يمكنه تسجيل الحضور منه فوراً بدون إدخال كود.</p>
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: 'center', marginTop: '24px' }}>
          <button className="btn btn-ghost" onClick={() => setIsEmpModalOpen(false)}>إلغاء</button>
          <button className="btn btn-start" style={{ minWidth: '140px' }} onClick={handleSaveEmp}>حفظ الموظف</button>
        </div>
      </div>
    </div>
  );
}
