import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getActivePayrollMonth,
  getCycleDateRange,
  createDatePredicate,
  getCycleRemainingTime
} from '../utils/periodEngine';
import { getRealDate, getRealTodayStr } from '../utils/timeEngine';

/**
 * Hook موحد لإدارة تصفية الفترات ودورات الشهور عبر كافة الشاشات
 * @param {object} orgSettings - إعدادات المؤسسة
 * @param {string} storageKeyPrefix - بادئة حفظ الإعدادات في التخزين المحلي (admin, bm, emp)
 */
export function usePeriodFilter(orgSettings = {}, storageKeyPrefix = 'admin') {
  // استخراج الشهر النشط تلقائياً من المحرك المركزي
  const activeCycleMonth = useMemo(() => {
    return getActivePayrollMonth(orgSettings, getRealDate());
  }, [
    orgSettings?.payrollPayoutStartDay,
    orgSettings?.payrollPayoutEndDay,
    orgSettings?.payrollPayoutStartTime,
    orgSettings?.payrollPayoutEndTime,
    orgSettings?.payrollPeriodType,
    orgSettings?.payrollCustomFrom,
    orgSettings?.payrollCustomTo
  ]);

  const [filterMode, setFilterMode] = useState(() => {
    try {
      return localStorage.getItem(`${storageKeyPrefix}_filter_mode`) || 'month';
    } catch {
      return 'month';
    }
  });

  const [selectedMonth, setSelectedMonth] = useState(() => {
    try {
      return localStorage.getItem(`${storageKeyPrefix}_selected_month`) || activeCycleMonth || getRealTodayStr().slice(0, 7);
    } catch {
      return activeCycleMonth || getRealTodayStr().slice(0, 7);
    }
  });

  const [customFrom, setCustomFrom] = useState(() => {
    try {
      return localStorage.getItem(`${storageKeyPrefix}_custom_from`) || '';
    } catch {
      return '';
    }
  });

  const [customTo, setCustomTo] = useState(() => {
    try {
      return localStorage.getItem(`${storageKeyPrefix}_custom_to`) || '';
    } catch {
      return '';
    }
  });

  // مزامنة التغييرات في التخزين المحلي
  useEffect(() => {
    try {
      localStorage.setItem(`${storageKeyPrefix}_filter_mode`, filterMode);
      localStorage.setItem(`${storageKeyPrefix}_selected_month`, selectedMonth);
      localStorage.setItem(`${storageKeyPrefix}_custom_from`, customFrom);
      localStorage.setItem(`${storageKeyPrefix}_custom_to`, customTo);
    } catch {}
  }, [filterMode, selectedMonth, customFrom, customTo, storageKeyPrefix]);

  // التحديث التلقائي للشهر عند تعديل إعدادات الدورة في النظام إذا لم يتم التغيير يدوياً
  useEffect(() => {
    if (activeCycleMonth && filterMode === 'month' && !localStorage.getItem(`${storageKeyPrefix}_month_manually_locked`)) {
      // فقط إذا كان الشهر المخزن قديماً
      if (!selectedMonth) {
        setSelectedMonth(activeCycleMonth);
      }
    }
  }, [activeCycleMonth, filterMode, storageKeyPrefix, selectedMonth]);

  // حساب النطاق الفعلي للشهر المحدد بناء على إعدادات النظام المركزية
  const cycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, orgSettings);
  }, [
    selectedMonth,
    orgSettings?.payrollPayoutStartDay,
    orgSettings?.payrollPayoutEndDay,
    orgSettings?.payrollPayoutStartTime,
    orgSettings?.payrollPayoutEndTime,
    orgSettings?.payrollPeriodType,
    orgSettings?.payrollCustomFrom,
    orgSettings?.payrollCustomTo
  ]);

  // دالة التصفية الموحدة
  const filterPredicate = useMemo(() => {
    return createDatePredicate({
      filterMode,
      selectedMonth,
      customFrom,
      customTo,
      orgSettings
    });
  }, [filterMode, selectedMonth, customFrom, customTo, orgSettings]);

  // معلومات الوقت المتبقي لتقفيل الدورة
  const cycleRemaining = useMemo(() => {
    return getCycleRemainingTime(orgSettings, getRealDate());
  }, [orgSettings]);

  const handleMonthChange = useCallback((newMonth) => {
    setSelectedMonth(newMonth);
    try {
      localStorage.setItem(`${storageKeyPrefix}_month_manually_locked`, 'true');
    } catch {}
  }, [storageKeyPrefix]);

  const resetToActiveMonth = useCallback(() => {
    setSelectedMonth(activeCycleMonth);
    try {
      localStorage.removeItem(`${storageKeyPrefix}_month_manually_locked`);
    } catch {}
  }, [activeCycleMonth, storageKeyPrefix]);

  return {
    filterMode,
    setFilterMode,
    selectedMonth,
    setSelectedMonth: handleMonthChange,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    cycleRange,
    filterPredicate,
    activeCycleMonth,
    cycleRemaining,
    resetToActiveMonth
  };
}
