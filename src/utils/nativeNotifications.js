/**
 * nativeNotifications.js
 * جسر إشعارات النظام الموحد:
 * 1. في تطبيق أندرويد (Capacitor) -> يستخدم NativeNotificationPlugin (شريط إشعارات أندرويد بالصوت والاهتزاز)
 * 2. في متصفح الويب (Chrome / Edge / Safari) -> يستخدم Web Notifications API القياسي
 */

import { registerPlugin } from '@capacitor/core';

export const NativeNotification = registerPlugin('NativeNotification');

export function isAndroidNative() {
  return typeof window !== 'undefined' &&
    Boolean(window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.getPlatform() === 'android');
}

/**
 * طلب إذن إشعارات النظام (Android 13+ والمتصفح)
 */
export async function requestSystemNotificationPermission() {
  if (isAndroidNative()) {
    try {
      const res = await NativeNotification.requestPermission();
      return Boolean(res?.granted);
    } catch (e) {
      console.warn('[NativeNotifications] Failed to request Android permission:', e);
      return false;
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
    } catch (e) {
      console.warn('[NativeNotifications] Failed to request Web permission:', e);
    }
  }

  return false;
}

// مجموعة المعرفات التي تم إرسال إشعار نظام لها لمنع التكرار
const getDispatchedNotificationIds = () => {
  try {
    const raw = localStorage.getItem('app_dispatched_system_notif_ids');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const markNotificationAsDispatched = (id) => {
  try {
    if (!id) return;
    const set = getDispatchedNotificationIds();
    set.add(String(id));
    const arr = Array.from(set).slice(-500); // الاحتفاظ بآخر 500 فقط
    localStorage.setItem('app_dispatched_system_notif_ids', JSON.stringify(arr));
  } catch {}
};

/**
 * إرسال إشعار إلى شريط إشعارات الهاتف / نظام التشغيل
 */
export async function showSystemNotification({ title, body, id = null, icon = null }) {
  const notifId = id || `notif_${Date.now()}`;
  const idStr = String(notifId);

  const dispatched = getDispatchedNotificationIds();
  if (dispatched.has(idStr)) {
    return; // تم إرساله مسبقاً
  }

  markNotificationAsDispatched(idStr);

  // 1. نظام أندرويد الأصلي (Capacitor)
  if (isAndroidNative()) {
    try {
      // استخراج رقم عددي ثابت لـ Android Notification ID
      let numericId = 1000;
      for (let i = 0; i < idStr.length; i++) {
        numericId = (numericId * 31 + idStr.charCodeAt(i)) & 0x7fffffff;
      }

      await NativeNotification.showNotification({
        id: numericId,
        title: title || 'منظومة الموارد البشرية',
        body: body || 'لديك إشعار جديد في المنظومة.'
      });
      return true;
    } catch (e) {
      console.warn('[NativeNotifications] Android notification error:', e);
    }
  }

  // 2. بيئة المتصفح (Web Notification)
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title || 'منظومة الموارد البشرية', {
        body: body || '',
        icon: icon || '/icons/logo_192x192.png',
        badge: '/icons/logo_192x192.png',
        tag: idStr
      });
      return true;
    } catch (e) {
      console.warn('[NativeNotifications] Web notification error:', e);
    }
  }

  return false;
}
