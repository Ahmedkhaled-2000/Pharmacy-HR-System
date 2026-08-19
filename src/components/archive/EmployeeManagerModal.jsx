import React, { useState, useEffect } from 'react';
import { X, User, Phone, Shield, Save, Loader2, AlertCircle } from 'lucide-react';
import { apiArchiveSaveEmployee } from '../../utils/archiveApiClient';

const ROLES = [
  'أمين عهدة واستلام',
  'محاسب ومدخل بيانات',
  'صيدلي أول',
  'مراجع فواتير',
  'مسؤول مشتريات'
];

export default function EmployeeManagerModal({
  isOpen,
  onClose,
  employeeToEdit = null,
  onEmployeeSaved = () => {}
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('أمين عهدة واستلام');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (employeeToEdit) {
      setName(employeeToEdit.name || '');
      setRole(employeeToEdit.role || 'أمين عهدة واستلام');
      setPhone(employeeToEdit.phone || '');
    } else {
      setName('');
      setRole('أمين عهدة واستلام');
      setPhone('');
    }
    setErrorMsg('');
  }, [employeeToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    setErrorMsg('');

    try {
      const payload = {
        id: employeeToEdit?.id,
        name: name.trim(),
        role,
        phone: phone.trim() || null
      };

      const res = await apiArchiveSaveEmployee(payload);
      if (res.success) {
        onEmployeeSaved(res.employee || { ...payload, id: res.id || employeeToEdit?.id || 'emp_' + Date.now() });
        onClose();
      } else {
        setErrorMsg(res.error || 'فشل حفظ الموظف');
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء حفظ بيانات الموظف');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-lg">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100" style={{ margin: 0 }}>
                {employeeToEdit ? 'تعديل بيانات الموظف' : 'إضافة موظف أرشيف جديد'}
              </h2>
              <p className="text-xs text-slate-400" style={{ margin: '2px 0 0' }}>
                تسجيل مسؤولي الاستلام والإدخال لربطهم بالفواتير
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          
          {errorMsg && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">اسم الموظف الرباعي *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد محمود إبراهيم"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">الدور الوظيفي / الصلاحية</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">رقم الهاتف والتواصل</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010xxxxxxxx"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{employeeToEdit ? 'حفظ التعديلات' : 'تسجيل الموظف'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
