import { useEffect } from 'react';
import { getRealTodayStr } from '../utils/timeEngine';
import { sendGmailEmail, generateDailyDigestHTML } from '../utils/gmailService';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';

export function useDailyDigestCron() {
  const { state } = useData();
  const { showToast } = useUI();

  useEffect(() => {
    const checkDailyDigest2359 = async () => {
      const nowDate = new Date();
      const h = nowDate.getHours();
      const m = nowDate.getMinutes();

      if (h === 23 && m >= 55) {
        const todayKey = getRealTodayStr();
        const lastSentKey = 'last_digest_sent_' + todayKey;

        if (!sessionStorage.getItem(lastSentKey)) {
          sessionStorage.setItem(lastSentKey, 'true');

          if (!state) return;
          const gmailConfig = state.orgSettings?.gmailConfig;
          if (gmailConfig && gmailConfig.enabled && gmailConfig.sendDailyDigest) {
            const employees = state.employees || [];
            const shifts = (state.shifts || []).filter((s) => s.date === todayKey);
            const requests = (state.requests || []).filter(
              (r) => r.date === todayKey || (r.createdAt && r.createdAt.startsWith(todayKey))
            );
            const adjustments = (state.adjustments || []).filter((a) => a.date === todayKey);

            const presentEmpIds = new Set(shifts.map((s) => s.employeeId));
            const presentCount = presentEmpIds.size;
            const absentCount = Math.max(0, employees.length - presentCount);
            const totalHoursToday = shifts.reduce((acc, s) => acc + (s.hours || 0), 0);

            const pendingRequests = (state.requests || []).filter((r) => r.status === 'pending_admin' || !r.branchApproved);
            const approvedRequestsToday = requests.filter((r) => r.status === 'approved');

            const bonusTotalToday = adjustments
              .filter((a) => a.type === 'bonus')
              .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
            const deductionTotalToday = adjustments
              .filter((a) => a.type === 'deduction')
              .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

            const html = generateDailyDigestHTML({
              dateStr: todayKey,
              employeesCount: employees.length,
              presentCount,
              absentCount,
              lateCount: 0,
              totalHoursToday,
              pendingRequestsCount: pendingRequests.length,
              approvedRequestsCount: approvedRequestsToday.length,
              bonusTotalToday,
              deductionTotalToday
            });

            const targetEmail = gmailConfig.targetAdminEmail || gmailConfig.userEmail;
            if (targetEmail) {
              await sendGmailEmail({
                gmailConfig,
                recipientEmail: targetEmail,
                subject: `📊 الملخص الشامل اليومي (23:59) — ${todayKey}`,
                htmlContent: html
              });
              showToast('📊 تم إرسال إيميل ملخص نهاية اليوم (23:59) بنجاح تلقائياً');
            }
          }
        }
      }
    };

    const timer = setInterval(checkDailyDigest2359, 30000);
    return () => clearInterval(timer);
  }, [state, showToast]);
}
