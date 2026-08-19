import React, { useState } from 'react';
import { apiArchiveSaveEmployee } from '../../utils/archiveApiClient';

export default function EmployeeManagerModal({
  isOpen,
  onClose,
  onEmployeeSaved = () => {}
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('أمين مخزن');
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    setMsg('');
    try {
      const res = await apiArchiveSaveEmployee({
        name: name.trim(),
        role,
        phone,
        active
      });

      if (res.success) {
        setName('');
        setPhone('');
        onEmployeeSaved();
        onClose();
      } else {
        setMsg(res.error || 'فشل حفظ الموظف');
      }
    } catch (err) {
      setMsg('حدث خطأ أثناء حفظ الموظف');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="arch-modal-overlay" onClick={onClose}>
      <div className="arch-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        
        <div className="arch-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.3rem' }}>👥</span>
            <h3>إضافة موظف أرشيف جديد</h3>
          </div>
          <button className="arch-btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="arch-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {msg && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '8px 12px', color: '#f87171', fontSize: '0.8rem' }}>
                ⚠️ {msg}
              </div>
            )}

            <div className="arch-input-group">
              <label className="arch-input-label">اسم الموظف الثلاثي *</label>
              <input
                type="text"
                className="arch-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أحمد محمد علي"
                required
                autoFocus
              />
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">الدور الوظيفي</label>
              <select className="arch-select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="أمين مخزن">أمين مخزن</option>
                <option value="مدخل بيانات">مدخل بيانات</option>
                <option value="صيدلي أول">صيدلي أول</option>
                <option value="مدير فرع">مدير فرع</option>
                <option value="محاسب">محاسب</option>
              </select>
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">رقم الهاتف</label>
              <input
                type="text"
                className="arch-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010xxxxxxxx"
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#e2e8f0', marginTop: '4px' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
              />
              <span>موظف نشط ومتاح في خيارات الفواتير</span>
            </label>

          </div>

          <div className="arch-modal-footer">
            <button type="button" className="arch-btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="arch-btn-primary" disabled={isSaving}>
              {isSaving ? 'جاري الحفظ...' : '💾 حفظ الموظف'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
