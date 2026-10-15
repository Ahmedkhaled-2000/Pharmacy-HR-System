import { useState, useEffect } from 'react';
import { outstockGetSettings } from './outstockApiClient';

export const DEFAULT_DELIVERY_ZONES = [
  'المعادي',
  'المعادي الجديدة',
  'زهراء المعادي',
  'مدينة نصر',
  'مصر الجديدة',
  'التجمع الأول',
  'التجمع الخامس',
  'الدقي',
  'المهندسين',
  'وسط البلد',
  'شبرا',
  'الهرم',
  'فيصل',
  'المقطم',
  'حلوان',
  'أخرى / خارج النطاق'
];

const LOCAL_STORAGE_KEY = 'outstock_delivery_zones';
const EVENT_KEY = 'outstock:delivery_zones_updated';

/**
 * الحصول على قائمة المناطق الحالية من الكاش المحلي أو القائمة الافتراضية
 */
export function getCachedDeliveryZones() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_DELIVERY_ZONES;
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((z) => (typeof z === 'string' ? z : z?.name)).filter(Boolean);
      }
    }
  } catch (_) {}
  return DEFAULT_DELIVERY_ZONES;
}

/**
 * جلب المناطق المحدثة من خادم الإعدادات وتحديث الكاش
 */
export async function fetchAndCacheDeliveryZones() {
  try {
    const res = await outstockGetSettings();
    if (res?.success && Array.isArray(res.settings?.deliveryZones) && res.settings.deliveryZones.length > 0) {
      const cleanZones = res.settings.deliveryZones
        .map((z) => (typeof z === 'string' ? z : z?.name))
        .filter(Boolean);
      if (cleanZones.length > 0) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanZones));
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: { zones: cleanZones } }));
        }
        return cleanZones;
      }
    }
  } catch (_) {}
  return getCachedDeliveryZones();
}

/**
 * Hook مخصص React لاستهلاك قائمة المناطق التفاعلية في أي مكوّن
 * يضمن التحديث اللحظي عند قيام المالك بإضافة أو حذف منطقة
 */
export function useDeliveryZones() {
  const [zones, setZones] = useState(() => getCachedDeliveryZones());

  useEffect(() => {
    // 1. مزامنة فورية مع السيرفر
    fetchAndCacheDeliveryZones().then((latest) => {
      if (latest && latest.length > 0) {
        setZones(latest);
      }
    });

    // 2. الاستماع لأحداث التحديث الصادرة من إعدادات المالك
    const handleUpdate = (e) => {
      const list = e?.detail?.zones;
      if (Array.isArray(list) && list.length > 0) {
        setZones(list.map((z) => (typeof z === 'string' ? z : z?.name)).filter(Boolean));
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(EVENT_KEY, handleUpdate);
      return () => window.removeEventListener(EVENT_KEY, handleUpdate);
    }
  }, []);

  return zones;
}
