import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * AppUpdateWatcher
 * مكون لمراقبة تحديثات النظام والتطبيق لحظياً وتفريغ كاش المتصفح تلقائياً
 * يضمن ظهور التحديثات البرمجية فور نشرها دون الحاجة لأي تدخل يدوي من المستخدم
 */
export default function AppUpdateWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // 1. الاستماع لرسائل Service Worker عند تنصيب نسخة جديدة
    if ('serviceWorker' in navigator) {
      const handleMessage = (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('[AppUpdateWatcher] New version detected via SW:', event.data.version);
          setUpdateAvailable(true);
        }
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);

      // فحص وجود service worker منتظر (Waiting Worker)
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          if (reg.waiting) {
            setUpdateAvailable(true);
          }
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setUpdateAvailable(true);
                }
              });
            }
          });
        }
      }).catch(() => {});

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, []);

  const handleApplyUpdate = () => {
    // تنظيف كاشات المتصفح وإعادة التحميل الفوري
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      }).catch(() => {});
    }
    window.location.reload(true);
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[99999] animate-bounce">
      <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-3 rounded-xl shadow-2xl border border-white/20">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <div className="text-sm">
          <p className="font-bold">تحديث جديد متوفر للمنظومة</p>
          <p className="text-xs text-emerald-100">تم نشر إصدار محدث من النظام</p>
        </div>
        <button
          onClick={handleApplyUpdate}
          className="bg-white text-emerald-800 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-emerald-50 transition shadow active:scale-95 cursor-pointer mr-2"
        >
          تطبيق الآن
        </button>
      </div>
    </div>
  );
}
