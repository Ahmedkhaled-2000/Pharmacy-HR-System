import { useState, useEffect } from 'react';
import {
  getRealDate,
  getRealTodayStr,
  getRealNowTimeStr,
  getRealFormatted12HourTime,
  isServerTimeSynced,
  getRealTimeOffset,
  formatArabicFullDateTime,
  syncRealTime
} from '../utils/timeEngine';

/**
 * Hook مخصص للساعة الحية والتوقيت الموثق مع الخادم
 * يحدث الوقت كل ثانية ويضمن عدم التلاعب بالتاريخ والوقت
 */
export function useLiveRealTime(updateIntervalMs = 1000) {
  const [liveState, setLiveState] = useState(() => {
    const d = getRealDate();
    return {
      realDate: d,
      todayStr: getRealTodayStr(),
      timeStr: getRealNowTimeStr(true),
      formatted12Time: getRealFormatted12HourTime(true),
      formatted12TimeNoSec: getRealFormatted12HourTime(false),
      fullArabicDate: formatArabicFullDateTime(d),
      isServerSynced: isServerTimeSynced(),
      timeOffset: getRealTimeOffset()
    };
  });

  useEffect(() => {
    // محاولة المزامنة الفورية عند تحميل الـ Hook
    syncRealTime();

    const timer = setInterval(() => {
      const d = getRealDate();
      setLiveState({
        realDate: d,
        todayStr: getRealTodayStr(),
        timeStr: getRealNowTimeStr(true),
        formatted12Time: getRealFormatted12HourTime(true),
        formatted12TimeNoSec: getRealFormatted12HourTime(false),
        fullArabicDate: formatArabicFullDateTime(d),
        isServerSynced: isServerTimeSynced(),
        timeOffset: getRealTimeOffset()
      });
    }, updateIntervalMs);

    return () => clearInterval(timer);
  }, [updateIntervalMs]);

  return liveState;
}
