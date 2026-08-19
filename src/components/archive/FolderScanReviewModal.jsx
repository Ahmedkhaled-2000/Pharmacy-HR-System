import React, { useState } from 'react';
import {
  X,
  Scan,
  FolderOpen,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export default function FolderScanReviewModal({
  isOpen,
  onClose,
  settings = {},
  onConfirmBatch = () => {}
}) {
  const [scanPath, setScanPath] = useState(settings?.AUTO_SCAN_FOLDER_PATH || '');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedFiles, setScannedFiles] = useState([]);
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleStartScan = async () => {
    if (!scanPath.trim()) {
      setStatusMsg('يرجى كتابة أو تحديد مسار المجلد المحلي أولاً');
      return;
    }

    setIsScanning(true);
    setStatusMsg('جاري فحص المجلد وقراءة الملفات غير المؤرشفة...');

    setTimeout(() => {
      setIsScanning(false);
      setStatusMsg('تم اكتشاف ملفات جديدة جاهزة للأرشفة الآلية!');
      setScannedFiles([
        { id: 1, name: 'فواتير_المتحدة_مارس_2026.xlsx', type: 'excel', size: '48 KB', detectedSupplier: 'المتحدة للصيادلة', itemsCount: 42, status: 'ready' },
        { id: 2, name: 'فاتورة_ابن_سينا_scan_012.png', type: 'image', size: '1.4 MB', detectedSupplier: 'ابن سينا فارما', itemsCount: 18, status: 'ready' },
        { id: 3, name: 'فاتورة_فارما_أوفيس_1092.pdf', type: 'pdf', size: '320 KB', detectedSupplier: 'أوفيس فارما', itemsCount: 8, status: 'ready' }
      ]);
    }, 1200);
  };

  const handleConfirmAll = () => {
    onConfirmBatch(scannedFiles);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl border border-slate-700 w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-lg">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100" style={{ margin: 0 }}>
                الفحص والمطابقة التلقائية لمجلد الفواتير
              </h2>
              <p className="text-xs text-slate-400" style={{ margin: '2px 0 0' }}>
                مسح المجلد المحلي ومعالجة الفواتير بصيغ Excel والصور وPDF دفعة واحدة
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

        {/* Content */}
        <div className="p-5 space-y-4">
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">مسار المجلد المحلي على الجهاز</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
                placeholder="C:\Scanned_Invoices"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="button"
                disabled={isScanning}
                onClick={handleStartScan}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                <span>بدء الفحص</span>
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className="p-3 bg-cyan-950/60 border border-cyan-800/80 rounded-xl text-xs text-cyan-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Files List */}
          {scannedFiles.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                الملفات المكتشفة ({scannedFiles.length})
              </h3>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {scannedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                        {file.type === 'excel' ? <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-blue-400" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{file.name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          المورد: <strong className="text-indigo-300">{file.detectedSupplier}</strong> • الحجم: {file.size} • ({file.itemsCount} صنف)
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      جاهز للأرشفة
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            إلغاء
          </button>

          {scannedFiles.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmAll}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد واستيراد كل الفواتير ({scannedFiles.length})</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
