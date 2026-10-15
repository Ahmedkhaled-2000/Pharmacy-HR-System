/**
 * outstockSlaEngine.js
 * محرك احتساب ساعات ودقائق العمل الفعلية لسرعة رد إدارة المشتريات (Procurement Business Hours SLA Engine)
 * - يستثني أيام العطلات الأسبوعية المحددة (مثل يوم الجمعة أو السبت)
 * - يستثني الساعات غير التشغيلية خارج نطاق الدوام الرسمي
 * - يوفر صيغ عرض دقيقة باللغة العربية
 */

export const DEFAULT_SLA_WORKING_HOURS_CONFIG = {
  excludedDays: [5], // 5 = الجمعة (0: الأحد، 1: الإثنين، 2: الثلاثاء، 3: الأربعاء، 4: الخميس، 5: الجمعة، 6: السبت)
  workStartHour: 9,
  workStartMinute: 0,
  workEndHour: 18,
  workEndMinute: 0,
  useWorkingHoursOnly: true
};

export const WEEK_DAYS_NAMES_AR = [
  { id: 0, name: 'الأحد' },
  { id: 1, name: 'الإثنين' },
  { id: 2, name: 'الثلاثاء' },
  { id: 3, name: 'الأربعاء' },
  { id: 4, name: 'الخميس' },
  { id: 5, name: 'الجمعة' },
  { id: 6, name: 'السبت' }
];

/**
 * حساب صافي دقائق العمل الفعلية بين تاريخين مستبعداً العطلات الأسبوعية وخارج أوقات العمل
 * @param {Date|string|number} startDate - تاريخ رفع الطلب للمشتريات
 * @param {Date|string|number} endDate - تاريخ رد المشتريات (أو اللحظة الحالية للطلب المعلق)
 * @param {object} customConfig - إعدادات ساعات العمل والعطلات
 * @returns {number} صافي دقائق العمل
 */
export function calculateNetBusinessMinutes(startDate, endDate, customConfig = {}) {
  const config = { ...DEFAULT_SLA_WORKING_HOURS_CONFIG, ...customConfig };

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return 0;
  }

  // إذا لم يتم تفعيل حصر ساعات العمل، يتم الحساب التقويمي المطلق
  if (!config.useWorkingHoursOnly) {
    const totalMs = end.getTime() - start.getTime();
    return Math.max(1, Math.round(totalMs / 60000));
  }

  const excludedDays = Array.isArray(config.excludedDays) ? config.excludedDays : [5];
  const startMinuteOfDay = (config.workStartHour ?? 9) * 60 + (config.workStartMinute ?? 0);
  const endMinuteOfDay = (config.workEndHour ?? 18) * 60 + (config.workEndMinute ?? 0);

  // إذا كانت ساعات البداية والنهاية متطابقة أو غير منطقية، نفترض دوام كامل اليوم ما عدا العطلات
  const isFullDayWork = endMinuteOfDay <= startMinuteOfDay;

  let current = new Date(start);
  let totalNetMinutes = 0;

  // لتسريع الحساب إذا كانت الفترة تمتد لأيام طويلة، نقوم بالعد باليوم ثم الساعات
  while (current < end) {
    const dayOfWeek = current.getDay();
    const isExcluded = excludedDays.includes(dayOfWeek);

    if (isExcluded) {
      // قفز إلى بداية اليوم التالي الساعة 00:00
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      current = nextDay < end ? nextDay : new Date(end);
      continue;
    }

    if (isFullDayWork) {
      // دوام 24 ساعة في أيام العمل فقط
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      const stepEnd = nextDay < end ? nextDay : end;
      const ms = stepEnd.getTime() - current.getTime();
      totalNetMinutes += Math.round(ms / 60000);
      current = stepEnd;
      continue;
    }

    // دوام بنطاق ساعات محدد: فحص وقت اليوم الحالي
    const curHour = current.getHours();
    const curMin = current.getMinutes();
    const curMinuteOfDay = curHour * 60 + curMin;

    if (curMinuteOfDay < startMinuteOfDay) {
      // قبل بداية الدوام: قفز إلى بداية الدوام لهذا اليوم
      current.setHours(config.workStartHour, config.workStartMinute, 0, 0);
      if (current >= end) break;
    } else if (curMinuteOfDay >= endMinuteOfDay) {
      // بعد نهاية الدوام: قفز إلى بداية اليوم التالي
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(config.workStartHour, config.workStartMinute, 0, 0);
      current = nextDay < end ? nextDay : new Date(end);
    } else {
      // نحن داخل ساعات العمل: نحسب الفترة حتى نهاية الدوام أو نهاية الوقت المستهدف
      const endOfTodayWork = new Date(current);
      endOfTodayWork.setHours(config.workEndHour, config.workEndMinute, 0, 0);

      const stepEnd = endOfTodayWork < end ? endOfTodayWork : end;
      const ms = stepEnd.getTime() - current.getTime();
      totalNetMinutes += Math.round(ms / 60000);

      // تقدم إلى الخطوة التالية
      current = stepEnd;
      if (current.getTime() === endOfTodayWork.getTime()) {
        // انتهى دوام اليوم: تقدم لبداية اليوم التالي
        current.setDate(current.getDate() + 1);
        current.setHours(config.workStartHour, config.workStartMinute, 0, 0);
      }
    }
  }

  return Math.max(1, totalNetMinutes);
}

/**
 * تنسيق الدقائق إلى صيغة واضحة باللغة العربية (ساعات ودقائق وأيام)
 * @param {number} totalMinutes 
 * @returns {string} النص المنسق
 */
export function formatSlaDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes < 1) return 'أقل من دقيقة';
  const mins = Math.round(totalMinutes);
  if (mins < 60) {
    return `${mins} دقيقة`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours < 24) {
    return remainingMins > 0 ? `${hours} س و ${remainingMins} د` : `${hours} ساعة`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} يوم و ${remHours} س` : `${days} يوم`;
}
