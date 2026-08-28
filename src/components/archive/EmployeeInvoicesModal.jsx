import React, { useMemo } from 'react';
import { X, User, FileText, ArrowDownLeft, ArrowUpRight, ExternalLink } from 'lucide-react';

export default function EmployeeInvoicesModal({
  isOpen,
  onClose,
  employee,
  invoices = [],
  onSelectInvoice
}) {
  const empId = employee?.id;

  const receivedInvoices = useMemo(() => {
    if (!empId) return [];
    return invoices.filter((inv) => {
      const recId = inv.receiverId || inv.receiver_id;
      return String(recId) === String(empId);
    });
  }, [invoices, empId]);

  const enteredInvoices = useMemo(() => {
    if (!empId) return [];
    return invoices.filter((inv) => {
      const clkId = inv.entryClerkId || inv.entry_clerk_id;
      return String(clkId) === String(empId);
    });
  }, [invoices, empId]);

  if (!isOpen || !employee) return null;

  const totalReceivedNet = receivedInvoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0), 0);
  const totalEnteredNet = enteredInvoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl border border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-lg">
              {employee.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
                سجل فواتير الموظف: {employee.name}
              </h2>
              <p className="text-xs text-slate-400" style={{ margin: '2px 0 0' }}>
                الوظيفة: <span className="text-cyan-400 font-semibold">{employee.role || 'طاقم أرشيف'}</span>
                {employee.phone && ` • هاتف: ${employee.phone}`}
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

        {/* Stats Strip */}
        <div className="grid grid-cols-2 gap-4 p-5 bg-slate-900/30 border-b border-slate-800">
          <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-900/50 flex items-center justify-between">
            <div>
              <span className="text-xs text-blue-400 flex items-center gap-1 font-medium">
                <ArrowDownLeft className="w-3.5 h-3.5" />
                فواتير تم استلامها
              </span>
              <p className="text-xl font-bold text-slate-100 mt-1">{receivedInvoices.length} فاتورة</p>
              <p className="text-[11px] text-blue-300 font-mono mt-0.5">
                صافي: {totalReceivedNet.toLocaleString('ar-EG')} ج.م
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-900/50 flex items-center justify-between">
            <div>
              <span className="text-xs text-purple-400 flex items-center gap-1 font-medium">
                <ArrowUpRight className="w-3.5 h-3.5" />
                فواتير تم إدخالها
              </span>
              <p className="text-xl font-bold text-slate-100 mt-1">{enteredInvoices.length} فاتورة</p>
              <p className="text-[11px] text-purple-300 font-mono mt-0.5">
                صافي: {totalEnteredNet.toLocaleString('ar-EG')} ج.م
              </p>
            </div>
          </div>
        </div>

        {/* Tabs & List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* Section 1: Received */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              الفواتير المستلمة بواسطته ({receivedInvoices.length})
            </h3>

            {receivedInvoices.length === 0 ? (
              <p className="text-xs text-slate-500 p-4 bg-slate-900/40 rounded-xl text-center border border-slate-800">
                لم يقم باستلام أي فواتير مسجلة في الأرشيف بعد.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {receivedInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      onClose();
                      if (onSelectInvoice) onSelectInvoice(inv);
                    }}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 cursor-pointer transition flex items-center justify-between group"
                  >
                    <div>
                      <span className="text-xs font-mono font-bold text-blue-400 block">
                        #{inv.invoiceNumber || inv.invoice_number}
                      </span>
                      <span className="text-xs font-semibold text-slate-200 block mt-0.5">
                        {inv.supplier?.name || inv.supplier_name || 'مورد عام'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        {inv.invoiceDate || inv.invoice_date || '-'}
                      </span>
                    </div>

                    <div className="text-left">
                      <span className="text-xs font-mono font-bold text-emerald-400 block">
                        {parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0).toLocaleString('ar-EG')} ج.م
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {inv.items?.length || 0} صنف
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Entered */}
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              الفواتير التي قام بإدخالها ({enteredInvoices.length})
            </h3>

            {enteredInvoices.length === 0 ? (
              <p className="text-xs text-slate-500 p-4 bg-slate-900/40 rounded-xl text-center border border-slate-800">
                لم يقم بإدخال أي فواتير مسجلة في الأرشيف بعد.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {enteredInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      onClose();
                      if (onSelectInvoice) onSelectInvoice(inv);
                    }}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/50 cursor-pointer transition flex items-center justify-between group"
                  >
                    <div>
                      <span className="text-xs font-mono font-bold text-purple-400 block">
                        #{inv.invoiceNumber || inv.invoice_number}
                      </span>
                      <span className="text-xs font-semibold text-slate-200 block mt-0.5">
                        {inv.supplier?.name || inv.supplier_name || 'مورد عام'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        {inv.invoiceDate || inv.invoice_date || '-'}
                      </span>
                    </div>

                    <div className="text-left">
                      <span className="text-xs font-mono font-bold text-emerald-400 block">
                        {parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0).toLocaleString('ar-EG')} ج.م
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {inv.items?.length || 0} صنف
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
}
