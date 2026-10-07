/**
 * server/egypt-time.js
 * ══════════════════════════════════════════════════════════════════════════════
 * 🇪🇬 محرك التوقيت المصري المحلي الموحد (Egypt Local Time Engine)
 * يعتمد كلياً وبشكل صارم على توقيت جمهورية مصر العربية (Africa/Cairo)
 * ولا يعتمد نهائياً على توقيت نظام السيرفر (Server OS/UTC)
 * ══════════════════════════════════════════════════════════════════════════════
 */

if (typeof process !== 'undefined' && process.env) {
  process.env.TZ = 'Africa/Cairo';
}

export const CAIRO_TIMEZONE = 'Africa/Cairo';

/**
 * استخراج مكونات التاريخ والوقت بتوقيت مصر بدقة تامة
 */
export function getEgyptParts(date = new Date()) {
  const d = (date instanceof Date && !isNaN(date)) ? date : (typeof date === 'number' ? new Date(date) : new Date());
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const p = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  const hour = p.hour === '24' ? '00' : p.hour;
  const dateStr = `${p.year}-${p.month}-${p.day}`;
  const timeStr = `${hour}:${p.minute}`;
  const timeSecStr = `${hour}:${p.minute}:${p.second}`;
  return {
    date: dateStr,
    time: timeStr,
    timeWithSeconds: timeSecStr,
    dateTime: `${dateStr} ${timeSecStr}`,
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(hour),
    minute: Number(p.minute),
    second: Number(p.second)
  };
}

/**
 * الحصول على تاريخ اليوم بتوقيت مصر بصيغة YYYY-MM-DD
 */
export function getEgyptDate(date = new Date()) {
  return getEgyptParts(date).date;
}

/**
 * الحصول على الوقت الحالي بتوقيت مصر بصيغة HH:mm (نظام 24 ساعة)
 */
export function getEgyptTime(date = new Date()) {
  return getEgyptParts(date).time;
}

/**
 * الحصول على الوقت الحالي بتوقيت مصر مع الثواني بصيغة HH:mm:ss
 */
export function getEgyptTimeWithSeconds(date = new Date()) {
  return getEgyptParts(date).timeWithSeconds;
}

/**
 * الحصول على التاريخ والوقت معاً بتوقيت مصر بصيغة YYYY-MM-DD HH:mm:ss
 */
export function getEgyptDateTime(date = new Date()) {
  return getEgyptParts(date).dateTime;
}

/**
 * تحويل نص التاريخ والوقت الصادر من ماكينة البصمة أو الكشك بتوقيت مصر إلى Unix Epoch بالمللي ثانية
 * يتفادى تماماً أي انزلاق بسبب فارق توقيت السيرفر
 */
export function parseEgyptTimeToEpoch(dateTimeStr) {
  if (!dateTimeStr) return Date.now();
  const clean = String(dateTimeStr).trim().replace('T', ' ');
  const [dPart, tPart = '00:00:00'] = clean.split(' ');
  const [y, m, d] = (dPart || '').split('-').map(Number);
  const [hh, mm, ss = 0] = (tPart || '').split(':').map(Number);
  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) return Date.now();

  const utcGuess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date(utcGuess));
  const p = {};
  for (const part of parts) p[part.type] = part.value;
  const cairoHour = p.hour === '24' ? 0 : Number(p.hour);
  const cairoUtcRepresentation = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), cairoHour, Number(p.minute), Number(p.second));
  const offsetMs = cairoUtcRepresentation - utcGuess;
  return utcGuess - offsetMs;
}

/**
 * اسم مستعار لدعم التوافق المباشر
 */
export const parseDevicePunchEpoch = parseEgyptTimeToEpoch;

/**
 * حساب الفارق الزمني الصافي بالدقائق بين حركتي تبصيم بتوقيت مصر بدقة مطلقة
 * يستوعب الورديات الليلية والعابرة لمنتصف الليل تلقائياً
 */
export function calculatePunchMinutesDiff(startDate, startTime, endDate, endTime) {
  if (!startDate || !startTime || !endTime) return 0;
  const sStr = `${String(startDate).slice(0, 10)} ${String(startTime).slice(0, 5)}:00`;
  const eDate = endDate ? String(endDate).slice(0, 10) : String(startDate).slice(0, 10);
  const eStr = `${eDate} ${String(endTime).slice(0, 5)}:00`;
  
  let sEpoch = parseEgyptTimeToEpoch(sStr);
  let eEpoch = parseEgyptTimeToEpoch(eStr);

  // إذا لم يتم تمرير تاريخ انتهاء صريح وكان وقت الانتهاء أقل من وقت البدء، فالوردية عبرت منتصف الليل
  if (!endDate && eEpoch <= sEpoch) {
    eEpoch += 24 * 3600 * 1000;
  }

  return (eEpoch - sEpoch) / (1000 * 60);
}
