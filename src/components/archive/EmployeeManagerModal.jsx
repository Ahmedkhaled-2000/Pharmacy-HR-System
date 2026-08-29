import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  UserPlus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Phone,
  Briefcase
} from 'lucide-react';
import { apiArchiveSaveEmployee, apiArchiveDeleteEmployee, apiArchiveGetEmployees } from '../../utils/archiveApiClient';
import { useUI } from '../../context/UIContext';

const ROLES = [
  'صيدلي مسؤول',
  'أمين مخزن',
  'مدخل بيانات',
  'كاشير',
  'عامل خدمات',
  'مدير فرع'
];

export default function EmployeeManagerModal({
  isOpen,
  onClose,
  employeeToEdit = null,
  employees = [],
  onEmployeeSaved = () => {},
  onEmployeeDeleted = () => {}
}) {
  const { showConfirm } = useUI();
  const [name, setName] = useState('');
  const [role, setRole] = useState('صيدلي مسؤول');
  const [phone, setPhone] = useState('');
  const [editingEmpId, setEditingEmpId] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [localEmployeesList, setLocalEmployeesList] = useState(employees);

  // Sync state when modal opens or employeeToEdit changes
  useEffect(() => {
    if (employeeToEdit) {
      setName(employeeToEdit.name || '');
      setRole(employeeToEdit.role || 'صيدلي مسؤول');
      setPhone(employeeToEdit.phone || '');
      setEditingEmpId(employeeToEdit.id);
    } else {
      setName('');
      setRole('صيدلي مسؤول');
      setPhone('');
      setEditingEmpId(null);
    }
    setErrorMsg('');
    setSuccessMsg('');
  }, [employeeToEdit, isOpen]);

  useEffect(() => {
    if (Array.isArray(employees)) {
      setLocalEmployeesList(employees);
    }
  }, [employees]);

  if (!isOpen) return null;

  const handleEditClick = (emp) => {
    setEditingEmpId(emp.id);
    setName(emp.name || '');
    setRole(emp.role || 'صيدلي مسؤول');
    setPhone(emp.phone || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleCancelEdit = () => {
    setEditingEmpId(null);
    setName('');
    setRole('صيدلي مسؤول');
    setPhone('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('يرجى إدخال اسم الموظف الثلاثي');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        id: editingEmpId || undefined,
        name: name.trim(),
        role,
        phone: phone.trim() || null
      };

      const res = await apiArchiveSaveEmployee(payload);
      if (res.success) {
        const savedEmp = res.employee || { ...payload, id: res.id || editingEmpId || 'emp_' + Date.now() };
        
        // Update local list
        setLocalEmployeesList((prev) => {
          const idx = prev.findIndex((em) => String(em.id) === String(savedEmp.id));
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = savedEmp;
            return copy;
          }
          return [savedEmp, ...prev];
        });

        onEmployeeSaved(savedEmp);
        setSuccessMsg(editingEmpId ? 'تم تحديث بيانات الموظف بنجاح!' : 'تم إضافة الموظف الجديد بنجاح!');
        
        // Reset form
        setName('');
        setRole('صيدلي مسؤول');
        setPhone('');
        setEditingEmpId(null);
      } else {
        setErrorMsg(res.error || 'فشل حفظ بيانات الموظف');
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء حفظ بيانات الموظف');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (empId, empName) => {
    const isConfirmed = await showConfirm({
      title: 'حذف موظف الأرشيف',
      message: `هل أنت متأكد من حذف الموظف (${empName}) نهائياً من سجل الأرشيف؟`,
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '👤'
    });
    if (!isConfirmed) return;
    try {
      const res = await apiArchiveDeleteEmployee(empId);
      if (res.success) {
        setLocalEmployeesList((prev) => prev.filter((em) => String(em.id) !== String(empId)));
        onEmployeeDeleted(empId);
        setSuccessMsg('تم حذف الموظف بنجاح');
      } else {
        alert(res.error || 'فشل حذف الموظف');
      }
    } catch {
      alert('حدث خطأ أثناء محاولة حذف الموظف');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Segoe UI', sans-serif"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(14, 165, 233, 0.1)',
          overflow: 'hidden',
          animation: 'archFadeIn 0.2s ease-out'
        }}
      >
        {/* Header (Matching Screenshot 1) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#070b14'
          }}
        >
          {/* Close Button on Left */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#334155';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1e293b';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>

          {/* Right Header Title & Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'right' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f8fafc', margin: 0, lineHeight: 1.3 }}>
                إدارة وأسماء الموظفين (تعديل وإضافة)
              </h2>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '4px 0 0', fontWeight: 500 }}>
                إضافة وتحديث بيانات الموظفين لاستخدامهم مستلمين ومدخلي بيانات للفواتير
              </p>
            </div>

            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                backgroundColor: 'rgba(14, 165, 233, 0.12)',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Users style={{ width: '22px', height: '22px' }} />
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          
          {/* Add / Edit Form Card (Matching Screenshot 1) */}
          <div
            style={{
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              {editingEmpId ? (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    background: 'transparent',
                    border: '1px solid #334155',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء التعديل
                </button>
              ) : <div />}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 800, fontSize: '0.925rem' }}>
                <span>{editingEmpId ? '✏️ تعديل بيانات الموظف:' : 'إضافة موظف جديد:'}</span>
                <UserPlus style={{ width: '16px', height: '16px' }} />
              </div>
            </div>

            {/* Error / Success alerts */}
            {errorMsg && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.8rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#6ee7b7',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.8rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave}>
              {/* Field 1: Full Name */}
              <div style={{ marginBottom: '14px', textAlign: 'right' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  اسم الموظف الثلاثي:
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: د. أحمد خالد / محمد علي"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#0b1120',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                    textAlign: 'right'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#1e293b'}
                />
              </div>

              {/* Row: Role & Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                {/* Field 2: Role / Position */}
                <div style={{ textAlign: 'right' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    الوظيفة / الدور:
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                      outline: 'none',
                      textAlign: 'right'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#1e293b'}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r} style={{ backgroundColor: '#0b1120', color: '#fff' }}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field 3: Phone Number */}
                <div style={{ textAlign: 'right' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    رقم الهاتف (اختياري):
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                      outline: 'none',
                      direction: 'ltr',
                      textAlign: 'right',
                      fontFamily: 'monospace'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#1e293b'}
                  />
                </div>
              </div>

              {/* Submit Button (Matching Screenshot 1) */}
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  backgroundColor: '#2563eb',
                  border: '1px solid #3b82f6',
                  color: '#ffffff',
                  fontSize: '0.925rem',
                  fontWeight: 800,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 18px rgba(37, 99, 235, 0.4)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSaving) e.currentTarget.style.backgroundColor = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  if (!isSaving) e.currentTarget.style.backgroundColor = '#2563eb';
                }}
              >
                {isSaving ? (
                  <>
                    <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                    <span>جاري حفظ البيانات...</span>
                  </>
                ) : (
                  <span>{editingEmpId ? 'حفظ تعديلات الموظف' : 'حفظ الموظف الجديد'}</span>
                )}
              </button>
            </form>
          </div>

          {/* Section: Registered Employees List (Matching Screenshot 1) */}
          <div style={{ textAlign: 'right' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#94a3b8', margin: '0 0 14px' }}>
              قائمة الموظفين المسجلين ({localEmployeesList.length}):
            </h3>

            {localEmployeesList.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  color: '#64748b',
                  fontSize: '0.875rem',
                  fontWeight: 600
                }}
              >
                لا يوجد موظفين مسجلين حالياً
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {localEmployeesList.map((emp) => (
                  <div
                    key={emp.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      backgroundColor: '#070b14',
                      border: '1px solid #1e293b',
                      borderRadius: '12px'
                    }}
                  >
                    {/* Action buttons on left */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleEditClick(emp)}
                        title="تعديل الموظف"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: '#0b1120',
                          border: '1px solid #1e293b',
                          color: '#38bdf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit2 style={{ width: '14px', height: '14px' }} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(emp.id, emp.name)}
                        title="حذف الموظف"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: '#0b1120',
                          border: '1px solid #1e293b',
                          color: '#f87171',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>

                    {/* Employee Info on right */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#f8fafc' }}>
                          {emp.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.2)'
                            }}
                          >
                            {emp.role || 'موظف'}
                          </span>
                          {emp.phone && (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                              {emp.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: '#0b1120',
                          border: '1px solid #1e293b',
                          color: '#60a5fa',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 800
                        }}
                      >
                        {emp.name ? emp.name.slice(0, 2) : '👤'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
