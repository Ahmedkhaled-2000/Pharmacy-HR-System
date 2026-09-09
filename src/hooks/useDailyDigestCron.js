import { useEffect } from 'react';
import { getRealTodayStr } from '../utils/formatters';
import {
  getAuthoritativeGmailConfig,
  resolveAdminRecipients,
  sendGmailEmail,
  generateDailyDigestHTML,
  notifyAdminOnBranchNoShow
} from '../utils/gmailService';
import { compileDailyDigestData, empBelongsToBranch } from '../utils/digestDataEngine';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';

export function useDailyDigestCron() {
  const { state } = useData();
  const { showToast } = useUI();

  useEffect(() => {
    const runCronChecks = async () => {
      if (!state) return;
      const gmailConfig = getAuthoritativeGmailConfig(state);
      if (!gmailConfig || !gmailConfig.enabled) return;

      const nowDate = new Date();
      const currentH = nowDate.getHours();
      const currentM = nowDate.getMinutes();
      const todayKey = getRealTodayStr();

      // ─────────────────────────────────────────────────────────────
      // 1. فحص إرسال التقرير الشامل اليومي التلقائي
      // ─────────────────────────────────────────────────────────────
      if (gmailConfig.sendDailyDigest !== false && gmailConfig.dailyDigestTime && String(gmailConfig.dailyDigestTime).trim()) {
        const [targetHStr, targetMStr] = String(gmailConfig.dailyDigestTime).trim().split(':');
        const targetH = parseInt(targetHStr, 10);
        const targetM = parseInt(targetMStr, 10);

        // إذا تطابقت الساعة والدقيقة الحالية مع الموعد المجدول
        if (!isNaN(targetH) && !isNaN(targetM) && currentH === targetH && Math.abs(currentM - targetM) <= 1) {
          const lastSentKey = 'last_digest_sent_' + todayKey;

          if (!sessionStorage.getItem(lastSentKey)) {
            sessionStorage.setItem(lastSentKey, 'true');

            try {
              const digestData = compileDailyDigestData(state, todayKey);
              const html = generateDailyDigestHTML(digestData, state?.orgSettings);
              const targetRecipients = resolveAdminRecipients(gmailConfig);

              if (targetRecipients.length > 0) {
                await sendGmailEmail({
                  gmailConfig,
                  recipientEmail: targetRecipients,
                  subject: `📊 الملخص الشامل اليومي (${gmailConfig.dailyDigestTime}) — ${todayKey}`,
                  htmlContent: html
                });
                showToast?.('📊 تم إرسال إيميل ملخص اليوم الشامل بنجاح إلى الإدارة');
              }
            } catch (err) {
              console.warn('[DailyDigestCron] Digest delivery failed:', err);
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // 2. فحص إنذار عدم فتح الفرع (Branch No-Show Alert بعد 30 دقيقة)
      // ─────────────────────────────────────────────────────────────
      if (gmailConfig.sendOnBranchNoShow !== false) {
        const branches = (state.branches || []).filter((b) => b && b.id);
        const currentTotalMinutes = currentH * 60 + currentM;

        for (const branch of branches) {
          const openingTime = branch.openingTime;
          if (!openingTime || !String(openingTime).trim()) continue;
          const [openHStr, openMStr] = String(openingTime).trim().split(':');
          const openH = parseInt(openHStr, 10);
          const openM = parseInt(openMStr, 10);
          if (isNaN(openH) || isNaN(openM)) continue;
          const openingTotalMinutes = openH * 60 + openM;
          const thresholdMinutes = openingTotalMinutes + 30; // بعد 30 دقيقة من موعد الفتح

          // إذا حان موعد الإنذار (بين 30 دقيقة و ساعتين بعد الفتح)
          if (currentTotalMinutes >= thresholdMinutes && currentTotalMinutes <= thresholdMinutes + 120) {
            const noShowKey = `noshow_alert_${branch.id}_${todayKey}`;

            if (!sessionStorage.getItem(noShowKey)) {
              // التحقق هل سُجل أي حضور لطاقم هذا الفرع اليوم
              const branchShifts = (state.shifts || []).filter((s) => {
                if (s.date !== todayKey) return false;
                if (s.branchId && String(s.branchId) === String(branch.id)) return true;
                const emp = (state.employees || []).find((e) => String(e.id) === String(s.employeeId));
                return empBelongsToBranch(emp, branch.id);
              });

              const branchActiveShifts = (state.activeShifts || []).filter((s) => {
                if (s.branchId && String(s.branchId) === String(branch.id)) return true;
                const emp = (state.employees || []).find((e) => String(e.id) === String(s.employeeId));
                return empBelongsToBranch(emp, branch.id);
              });

              // إذا لم يسجل أي موظف بصمة دخول حتى الآن
              if (branchShifts.length === 0 && branchActiveShifts.length === 0) {
                sessionStorage.setItem(noShowKey, 'true');
                try {
                  await notifyAdminOnBranchNoShow({
                    state,
                    branch,
                    openingTime,
                    minutesElapsed: currentTotalMinutes - openingTotalMinutes
                  });
                  console.log(`🚨 [Branch No-Show Alert] Sent for branch ${branch.name || branch.id}`);
                } catch (err) {
                  console.warn('[Branch No-Show Alert] Warning:', err);
                }
              }
            }
          }
        }
      }
    };

    // تشغيل الفحص كل 30 ثانية
    const timer = setInterval(runCronChecks, 30000);
    return () => clearInterval(timer);
  }, [state, showToast]);
}
