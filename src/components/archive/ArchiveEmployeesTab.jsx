import React, { useState } from 'react';
import { Users, Search, Plus, Phone, FileText, ChevronLeft, ArrowDownLeft, ArrowUpRight, Edit2, Trash2, Loader2, Shield } from 'lucide-react';
import { apiArchiveSaveEmployee, apiArchiveDeleteEmployee } from '../../utils/archiveApiClient';
import EmployeeInvoicesModal from './EmployeeInvoicesModal';

export default function ArchiveEmployeesTab({
  employees = [],
  invoices = [],
  isLoading = false,
  onOpenEmployeeModal,
  onSelectInvoice,
  onEmployeeSaved = () => {},
  onEmployeeDeleted = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpForInvoices, setSelectedEmpForInvoices] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const filteredEmployees = employees.filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (emp.name || '').toLowerCase().includes(q) ||
      (emp.role || '').toLowerCase().includes(q) ||
      (emp.phone && emp.phone.includes(q))
    );
  });

  const handleDelete = async (emp, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`هل أنت متأكد من حذف الموظف "${emp.name}"؟`)) return;

    setDeletingId(emp.id);
    try {
      const res = await apiArchiveDeleteEmployee(emp.id);
      if (res.success) {
        onEmployeeDeleted(emp.id);
      } else {
        alert(res.error || 'فشل حذف الموظف');
      }
    } catch {
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
            <Users className="w-6 h-6 text-cyan-400" />
            إدارة طاقم العمل ومسؤولي الفواتير ({employees.length})
          </h1>
          <p className="text-xs text-slate-400 mt-1" style={{ margin: '4px 0 0 0' }}>
            تتبع الفواتير المستلمة والمدخلة لكل أمين عهدة، محاسب، أو مراجع بالأرشيف
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم الموظف، الوظيفة، الهاتف..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner"
            />
          </div>

          {onOpenEmployeeModal && (
            <button
              type="button"
              onClick={() => onOpenEmployeeModal(null)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-1.5 shadow-md shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة موظف</span>
            </button>
          )}
        </div>
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading && employees.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card rounded-2xl p-5 border border-slate-800/80 animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-800/80"></div>
                <div className="space-y-2 flex-1">
                  <div className="w-3/4 h-5 rounded-lg bg-slate-800/80"></div>
                  <div className="w-1/2 h-3 rounded-lg bg-slate-800/50"></div>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800/60 h-10 rounded-lg bg-slate-800/40"></div>
            </div>
          ))
        ) : filteredEmployees.length === 0 ? (
          <div className="col-span-full text-center text-slate-500 py-16 bg-slate-900/40 rounded-2xl border border-slate-800">
            <Users className="w-12 h-12 mx-auto text-slate-700 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-400">لا يوجد موظفين مطابقين للبحث.</p>
          </div>
        ) : (
          filteredEmployees.map((emp) => {
            // Count invoices for this employee
            const empId = emp.id;
            const receivedCount = invoices.filter(i => String(i.receiverId || i.receiver_id) === String(empId)).length;
            const enteredCount = invoices.filter(i => String(i.entryClerkId || i.entry_clerk_id) === String(empId)).length;

            return (
              <div
                key={emp.id}
                className="glass-card rounded-2xl p-5 border border-slate-800 hover:border-cyan-500/50 transition flex flex-col justify-between space-y-4 group shadow-md"
              >
                <div>
                  {/* Top Info Row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xl group-hover:scale-105 transition border border-cyan-500/20 shadow-inner">
                        {(emp.name || 'م').charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-100 group-hover:text-cyan-300 transition" style={{ margin: 0 }}>
                          {emp.name}
                        </h3>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-full mt-1">
                          <Shield className="w-3 h-3" />
                          {emp.role || 'مسؤول أرشيف'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {onOpenEmployeeModal && (
                        <button
                          type="button"
                          onClick={() => onOpenEmployeeModal(emp)}
                          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="تعديل الموظف"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={deletingId === emp.id}
                        onClick={(e) => handleDelete(emp, e)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition cursor-pointer disabled:opacity-50"
                        title="حذف الموظف"
                      >
                        {deletingId === emp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {emp.phone && (
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/60">
                      <Phone className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="dir-ltr">{emp.phone}</span>
                    </div>
                  )}
                </div>

                {/* Counters Row */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90 text-center">
                    <span className="text-[10px] text-slate-400 block flex items-center justify-center gap-1">
                      <ArrowDownLeft className="w-3 h-3 text-blue-400" />
                      مستلمة
                    </span>
                    <strong className="text-sm font-mono font-bold text-blue-400 mt-0.5 block">
                      {receivedCount}
                    </strong>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90 text-center">
                    <span className="text-[10px] text-slate-400 block flex items-center justify-center gap-1">
                      <ArrowUpRight className="w-3 h-3 text-purple-400" />
                      مدخلة
                    </span>
                    <strong className="text-sm font-mono font-bold text-purple-400 mt-0.5 block">
                      {enteredCount}
                    </strong>
                  </div>
                </div>

                {/* Open in modal action */}
                <button
                  type="button"
                  onClick={() => setSelectedEmpForInvoices(emp)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-cyan-950/40 text-cyan-300 hover:text-cyan-200 border border-slate-700/60 hover:border-cyan-800/60 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>عرض كل فواتير الموظف</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Employee Invoices List Modal */}
      <EmployeeInvoicesModal
        isOpen={Boolean(selectedEmpForInvoices)}
        onClose={() => setSelectedEmpForInvoices(null)}
        employee={selectedEmpForInvoices}
        invoices={invoices}
        onSelectInvoice={onSelectInvoice}
      />

    </div>
  );
}
