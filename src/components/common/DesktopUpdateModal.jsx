import React from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';

/**
 * DesktopUpdateModal
 * نافذة التحديثات التلقائية المباشرة لتطبيق ويندوز المكتبي (.exe)
 * تتيح تنزيل التحديث في الخلفية وتطبيقه بضغطة زر دون الحاجة لإعادة التثبيت أو مسح البرنامج
 */
export default function DesktopUpdateModal({
  isOpen,
  onClose,
  updateStatus,
  updateInfo,
  downloadProgress,
  onInstallNow,
  onCheckAgain,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        dir="rtl"
        className="relative w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100 rounded-2xl shadow-2xl border border-blue-500/30 overflow-hidden"
      >
        {/* Header Glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />

        {/* Close Button */}
        {updateStatus !== 'progress' && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-6">
          {/* Icon & Title */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              {updateStatus === 'downloaded' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 animate-bounce" />
              ) : updateStatus === 'progress' ? (
                <Download className="w-6 h-6 text-blue-400 animate-pulse" />
              ) : updateStatus === 'error' ? (
                <AlertCircle className="w-6 h-6 text-rose-400" />
              ) : (
                <Sparkles className="w-6 h-6 text-amber-400" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                تحديث جديد للمنظومة
                {updateInfo?.version && (
                  <span className="text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                    v{updateInfo.version}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                تحديث تلقائي فوري دون الحاجة لإعادة تثبيت البرنامج
              </p>
            </div>
          </div>

          {/* Body Content based on status */}
          <div className="space-y-4 my-4 bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            {updateStatus === 'checking' && (
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                <span>جاري فحص الإصدارات الجديدة عبر السحابة...</span>
              </div>
            )}

            {updateStatus === 'available' && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-emerald-300">
                  🎉 تم العثور على إصدار جديد وجاري بدء التنزيل في الخلفية.
                </p>
                {updateInfo?.releaseNotes && (
                  <div className="text-xs text-slate-300 max-h-32 overflow-y-auto p-2 bg-slate-900/60 rounded-lg border border-slate-700/30">
                    <p className="font-bold text-slate-400 mb-1">ملاحظات الإصدار:</p>
                    <p className="whitespace-pre-line">{updateInfo.releaseNotes}</p>
                  </div>
                )}
              </div>
            )}

            {updateStatus === 'progress' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-300">
                  <span>جاري تنزيل ملفات التحديث...</span>
                  <span className="font-mono text-blue-400">{downloadProgress || 0}%</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${downloadProgress || 0}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  يمكنك متابعة عملك كالمعتاد، سيتم إشعارك فور اكتمال التنزيل.
                </p>
              </div>
            )}

            {updateStatus === 'downloaded' && (
              <div className="space-y-2">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs leading-relaxed">
                  ✅ <strong>تم تنزيل النسخة الجديدة بنجاح!</strong>
                  <br />
                  اضغط على الزر أدناه لإعادة تشغيل المنظومة وتطبيق الإصدار الجديد فورياً في ثوانٍ معدودة دون فقدان أي بيانات أو تعديلات.
                </div>
              </div>
            )}

            {updateStatus === 'error' && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs">
                ⚠️ حدث خطأ أثناء فحص أو تنزيل التحديث. يرجى التحقق من اتصال الإنترنت أو المحاولة لاحقاً.
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {updateStatus === 'downloaded' ? (
              <button
                onClick={onInstallNow}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                تطبيق التحديث وإعادة التشغيل الفوري
              </button>
            ) : updateStatus === 'progress' ? (
              <button
                onClick={onClose}
                className="py-2 px-4 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              >
                المتابعة في الخلفية
              </button>
            ) : updateStatus === 'error' ? (
              <button
                onClick={onCheckAgain}
                className="py-2 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                إعادة المحاولة
              </button>
            ) : (
              <button
                onClick={onClose}
                className="py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition cursor-pointer"
              >
                إغلاق
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
