import React, { useState, useEffect, useMemo } from 'react';
import RosterPreviewModal from './RosterPreviewModal';
import { getEmpDisplayName, isEmployeeActive, getRealTodayStr } from '../../utils/formatters';
import { getCycleDateRange } from '../../utils/periodEngine';
import { getResolvedEmployeeRoster } from '../../utils/rosterEngine';

export const DEFAULT_ROSTER_SCHEDULE = {
  'السبت': { type: 'shift', start: '08:00', end: '16:00' },
  'الأحد': { type: 'shift', start: '08:00', end: '16:00' },
  'الاثنين': { type: 'shift', start: '08:00', end: '16:00' },
  'الثلاثاء': { type: 'shift', start: '16:00', end: '00:00' },
  'الأربعاء': { type: 'shift', start: '08:00', end: '16:00' },
  'الخميس': { type: 'shift', start: '08:00', end: '16:00' },
  'الجمعة': { type: 'off', start: '', end: '' }
};

export function normalizeSchedule(rawSchedule) {
  if (!rawSchedule || typeof rawSchedule !== 'object') return DEFAULT_ROSTER_SCHEDULE;
  
  const normalized = { ...DEFAULT_ROSTER_SCHEDULE };
  
  const dayKeyMap = {
    'saturday': 'السبت',
    'sunday': 'الأحد',
    'monday': 'الاثنين',
    'tuesday': 'الثلاثاء',
    'wednesday': 'الأربعاء',
    'thursday': 'الخميس',
    'friday': 'الجمعة',
    'السبت': 'السبت',
    'الأحد': 'الأحد',
    'الاحد': 'الأحد',
    'الإثنين': 'الاثنين',
    'الاثنين': 'الاثنين',
    'الثلاثاء': 'الثلاثاء',
    'الأربعاء': 'الأربعاء',
    'الاربعاء': 'الأربعاء',
    'الخميس': 'الخميس',
    'الجمعة': 'الجمعة',
    '0': 'الأحد',
    '1': 'الاثنين',
    '2': 'الثلاثاء',
    '3': 'الأربعاء',
    '4': 'الخميس',
    '5': 'الجمعة',
    '6': 'السبت',
    'day_0': 'الأحد',
    'day_1': 'الاثنين',
    'day_2': 'الثلاثاء',
    'day_3': 'الأربعاء',
    'day_4': 'الخميس',
    'day_5': 'الجمعة',
    'day_6': 'السبت'
  };

  Object.entries(rawSchedule).forEach(([key, val]) => {
    const cleanKey = String(key).trim().toLowerCase();
    const mappedDay = dayKeyMap[cleanKey] || dayKeyMap[key];
    if (mappedDay && val && typeof val === 'object') {
      const isOff = val.type === 'off' || val.isOff === true || val.type === 'راحة';
      normalized[mappedDay] = {
        type: isOff ? 'off' : 'shift',
        start: isOff ? '' : (val.start || val.checkIn || '08:00'),
        end: isOff ? '' : (val.end || val.checkOut || '16:00')
      };
    }
  });

  return normalized;
}

export { getResolvedEmployeeRoster };

export default function RosterModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRosterEmp, setSelectedRosterEmp] = useState(null);

  const orgSettings = state.orgSettings || {};
  const employees = state.employees || [];
  const branches = state.branches || [];

  // Notification Scheduling State
  const [schedDay, setSchedDay] = useState(() => (
    orgSettings.rosterNotificationDay !== undefined ? parseInt(orgSettings.rosterNotificationDay, 10) : 25
  ));
  const [schedAutoSend, setSchedAutoSend] = useState(() => (
    orgSettings.rosterNotificationAutoSend !== undefined ? Boolean(orgSettings.rosterNotificationAutoSend) : true
  ));
  const [schedMessage, setSchedMessage] = useState(() => (
    orgSettings.rosterNotificationMessage || 'تم اعتماد وإصدار الجدول الشهري ومناوبات العمل، يرجى الدخول لمراجعة شفتاتك وأيام الراحة المقررة عبر بوابة الموظف.'
  ));
  const [schedTarget, setSchedTarget] = useState(() => (
    orgSettings.rosterNotificationTarget || 'all'
  ));
  const [schedBranchFilter, setSchedBranchFilter] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSendingNotifs, setIsSendingNotifs] = useState(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Sync state if orgSettings change externally
  useEffect(() => {
    if (orgSettings.rosterNotificationDay !== undefined) {
      setSchedDay(parseInt(orgSettings.rosterNotificationDay, 10));
    }
    if (orgSettings.rosterNotificationAutoSend !== undefined) {
      setSchedAutoSend(Boolean(orgSettings.rosterNotificationAutoSend));
    }
    if (orgSettings.rosterNotificationMessage) {
      setSchedMessage(orgSettings.rosterNotificationMessage);
    }
    if (orgSettings.rosterNotificationTarget) {
      setSchedTarget(orgSettings.rosterNotificationTarget);
    }
  }, [
    orgSettings.rosterNotificationDay,
    orgSettings.rosterNotificationAutoSend,
    orgSettings.rosterNotificationMessage,
    orgSettings.rosterNotificationTarget
  ]);

  // Compute eligible recipients based on target group and branch filters
  const eligibleEmployees = useMemo(() => {
    return (state.employees || []).filter((emp) => {
      if (!isEmployeeActive(emp)) return false;
      if (schedBranchFilter && emp.branchId !== schedBranchFilter && (!emp.branchesDetails || !emp.branchesDetails.some(bd => String(bd.branchId) === String(schedBranchFilter)))) {
        return false;
      }
      if (schedTarget === 'approved_only') {
        const r = getResolvedEmployeeRoster(emp, schedBranchFilter || emp.branchId, state);
        if (r?.status !== 'approved' || !r?.schedule || Object.keys(r.schedule).length === 0) {
          return false;
        }
      }
      return true;
    });
  }, [state.employees, state.rosters, schedTarget, schedBranchFilter]);

  // Save Settings to orgSettings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const parsedDay = parseInt(schedDay, 10);
      const validDay = isNaN(parsedDay) ? 25 : Math.max(1, Math.min(31, parsedDay));

      const updatedOrgSettings = {
        ...(state.orgSettings || {}),
        rosterNotificationDay: validDay,
        rosterNotificationAutoSend: schedAutoSend,
        rosterNotificationMessage: schedMessage.trim() || 'تم اعتماد وإصدار الجدول الشهري ومناوبات العمل، يرجى الدخول لمراجعة شفتاتك وأيام الراحة المقررة عبر بوابة الموظف.',
        rosterNotificationTarget: schedTarget
      };

      const updatedState = {
        ...state,
        orgSettings: updatedOrgSettings
      };

      setState(updatedState);
      if (typeof saveState === 'function') {
        await saveState(updatedState);
      }
      showToast?.('✅ تم حفظ إعدادات إشعار الجدول الشهري بنجاح');
    } catch (err) {
      console.error('Error saving roster notification settings:', err);
      showToast?.('❌ حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Broadcast Notification to Employees
  const executeSendNotifications = async (isAuto = false) => {
    if (eligibleEmployees.length === 0) {
      if (!isAuto) showToast?.('⚠️ لا يوجد موظفين مستحقين للإشعار وفق الخيارات المحددة!');
      return;
    }

    setIsSendingNotifs(true);
    try {
      const todayStr = getRealTodayStr ? getRealTodayStr() : new Date().toISOString().slice(0, 10);
      const currentMonthKey = todayStr.slice(0, 7);
      const nowIso = new Date().toISOString();

      const newNotifications = eligibleEmployees.map((emp) => ({
        id: `notif_roster_announcement_${currentMonthKey}_${emp.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'roster_announcement',
        typeLabel: 'الجدول الشهري',
        icon: '📅',
        title: '📅 اعتماد وإصدار الجدول الشهري',
        message: schedMessage.trim() || 'تم اعتماد وإصدار الجدول الشهري ومناوبات العمل، يرجى الدخول لمراجعة شفتاتك وأيام الراحة المقررة عبر بوابة الموظف.',
        targetEmployeeId: String(emp.id || emp.code),
        employeeId: String(emp.id || emp.code),
        employeeCode: emp.code,
        employeeName: emp.name,
        targetRole: 'employee',
        targetMonth: currentMonthKey,
        linkTab: 'roster',
        read: false,
        date: todayStr,
        timestamp: nowIso,
        createdBy: 'admin',
        isAutoSent: isAuto
      }));

      const updatedOrgSettings = {
        ...(state.orgSettings || {}),
        rosterNotificationDay: schedDay,
        rosterNotificationAutoSend: schedAutoSend,
        rosterNotificationMessage: schedMessage,
        rosterNotificationTarget: schedTarget,
        rosterNotificationLastSentMonth: currentMonthKey,
        rosterNotificationLastSentDate: nowIso,
        rosterNotificationLastSentCount: eligibleEmployees.length
      };

      const updatedState = {
        ...state,
        notifications: [...newNotifications, ...(state.notifications || [])],
        orgSettings: updatedOrgSettings
      };

      setState(updatedState);
      if (typeof saveState === 'function') {
        await saveState(updatedState);
      }

      setShowConfirmModal(false);
      if (isAuto) {
        showToast?.(`🔔 تم إرسال إشعار الجدول الشهري تلقائياً لموظفي الصيدليات (${eligibleEmployees.length} موظف)`);
      } else {
        showToast?.(`📢 تم إرسال إشعار الجدول الشهري بنجاح إلى (${eligibleEmployees.length}) موظف!`);
      }
    } catch (err) {
      console.error('Error sending roster notifications:', err);
      showToast?.('❌ حدث خطأ أثناء إرسال الإشعارات');
    } finally {
      setIsSendingNotifs(false);
    }
  };

  // Auto-send check when today is at or past the scheduled day in the current month
  useEffect(() => {
    if (!state || !state.orgSettings || !setState) return;
    const settings = state.orgSettings;
    const autoSend = settings.rosterNotificationAutoSend !== undefined ? Boolean(settings.rosterNotificationAutoSend) : true;
    if (!autoSend) return;

    const targetDay = settings.rosterNotificationDay !== undefined ? parseInt(settings.rosterNotificationDay, 10) : 25;
    const today = new Date();
    const currentDay = today.getDate();
    const todayStr = getRealTodayStr ? getRealTodayStr() : today.toISOString().slice(0, 10);
    const currentMonthKey = todayStr.slice(0, 7);

    if (currentDay >= targetDay && settings.rosterNotificationLastSentMonth !== currentMonthKey) {
      const lockKey = `auto_roster_notif_sent_${currentMonthKey}`;
      if (!sessionStorage.getItem(lockKey)) {
        sessionStorage.setItem(lockKey, 'true');
        executeSendNotifications(true);
      }
    }
  }, [state?.orgSettings?.rosterNotificationAutoSend, state?.orgSettings?.rosterNotificationDay, state?.orgSettings?.rosterNotificationLastSentMonth]);

  const filteredEmployees = employees.filter((emp) => {
    if (!isEmployeeActive(emp)) return false;
    if (selectedBranch && emp.branchId !== selectedBranch && (!emp.branchesDetails || !emp.branchesDetails.some(bd => String(bd.branchId) === String(selectedBranch)))) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name?.toLowerCase().includes(q);
      const matchNickname = emp.nickname?.toLowerCase().includes(q);
      const matchCode = emp.code?.includes(q);
      if (!matchName && !matchNickname && !matchCode) return false;
    }
    return true;
  });

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📅 إدارة معاينة الجداول الشهرية لموظفي الصيدليات
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            مراجعة شفتات وأيام الراحة الأسبوعية لكل موظف عبر النافذة المنبثقة وجدولة إشعارات الصدور
          </p>
        </div>
      </div>

      {/* ── Notification Scheduling & Instant Broadcast Card ── */}
      <div style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: '14px',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.08) 0%, rgba(20, 184, 166, 0.03) 100%)',
          borderBottom: isSettingsExpanded ? '1px solid var(--border, #e2e8f0)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'var(--primary, #0f766e)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)'
            }}>
              🔔
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text, #1e293b)' }}>
                  جدولة وإرسال إشعار الجدول الشهري للموظفين
                </h3>
                <span style={{
                  fontSize: '12px',
                  padding: '2px 10px',
                  borderRadius: '20px',
                  fontWeight: 700,
                  background: schedAutoSend ? '#ecfdf5' : '#f1f5f9',
                  color: schedAutoSend ? '#059669' : '#64748b',
                  border: `1px solid ${schedAutoSend ? '#a7f3d0' : '#cbd5e1'}`
                }}>
                  {schedAutoSend ? `🟢 إرسال آلي مجدول: يوم ${schedDay} من كل شهر` : '⚪ الإرسال التلقائي: متوقف'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--muted, #64748b)' }}>
                تحديد يوم محدد شهرياً لإشعار الموظفين تلقائياً باعتماد وإصدار جداول شفتاتهم، مع إمكانية البث الفوري الآن
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                background: 'var(--surface, #ffffff)',
                color: 'var(--text, #334155)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{isSettingsExpanded ? '▲ إخفاء الإعدادات' : '▼ ضبط وجدولة الإشعار'}</span>
            </button>
          </div>
        </div>

        {/* Expanded Body */}
        {isSettingsExpanded && (
          <div style={{ padding: '20px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '16px'
            }}>
              {/* 1. Day of Month Selector */}
              <div style={{ background: 'var(--background, #f8fafc)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border, #e2e8f0)' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '13.5px', marginBottom: '6px', color: 'var(--text, #1e293b)' }}>
                  📅 اليوم المحدد شهرياً للإشعار:
                </label>
                <select
                  value={schedDay}
                  onChange={(e) => setSchedDay(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #cbd5e1)',
                    background: 'var(--surface, #ffffff)',
                    fontWeight: 700,
                    color: 'var(--text, #0f172a)'
                  }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      يوم {d} من كل شهر {d === 25 ? '⭐ (الموصى به قبل بداية الدورة)' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '6px', lineHeight: 1.4 }}>
                  سيتم إرسال إشعار للموظفين تلقائياً فور حلول هذا اليوم من كل شهر.
                </div>
              </div>

              {/* 2. Auto-Send Toggle */}
              <div style={{ background: 'var(--background, #f8fafc)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border, #e2e8f0)' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '13.5px', marginBottom: '6px', color: 'var(--text, #1e293b)' }}>
                  ⚡ نظام الإرسال التلقائي:
                </label>
                <select
                  value={schedAutoSend ? 'true' : 'false'}
                  onChange={(e) => setSchedAutoSend(e.target.value === 'true')}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #cbd5e1)',
                    background: 'var(--surface, #ffffff)',
                    fontWeight: 700,
                    color: schedAutoSend ? '#059669' : '#475569'
                  }}
                >
                  <option value="true">🟢 تفعيل الإرسال التلقائي شهرياً</option>
                  <option value="false">⚪ تعطيل الإرسال التلقائي (إرسال يدوي فقط)</option>
                </select>
                <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '6px', lineHeight: 1.4 }}>
                  إرسال دوري ومباشر في اليوم المحدد دون الحاجة لدخول الإدارة يدوياً.
                </div>
              </div>

              {/* 3. Target Group */}
              <div style={{ background: 'var(--background, #f8fafc)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border, #e2e8f0)' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '13.5px', marginBottom: '6px', color: 'var(--text, #1e293b)' }}>
                  👥 الفئة المستهدفة بالإشعار:
                </label>
                <select
                  value={schedTarget}
                  onChange={(e) => setSchedTarget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #cbd5e1)',
                    background: 'var(--surface, #ffffff)',
                    fontWeight: 700,
                    color: 'var(--text, #0f172a)'
                  }}
                >
                  <option value="all">جميع الموظفين النشطين ({employees.filter(isEmployeeActive).length} موظف)</option>
                  <option value="approved_only">الموظفون ذوو الجداول المعتمدة فقط</option>
                </select>
                <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '6px', lineHeight: 1.4 }}>
                  المستهدفون حالياً: <strong style={{ color: 'var(--primary, #0f766e)' }}>{eligibleEmployees.length} موظف</strong>
                </div>
              </div>

              {/* 4. Branch Filter (Optional Scope) */}
              <div style={{ background: 'var(--background, #f8fafc)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border, #e2e8f0)' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '13.5px', marginBottom: '6px', color: 'var(--text, #1e293b)' }}>
                  🏢 نطاق الفروع:
                </label>
                <select
                  value={schedBranchFilter}
                  onChange={(e) => setSchedBranchFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #cbd5e1)',
                    background: 'var(--surface, #ffffff)',
                    fontWeight: 700,
                    color: 'var(--text, #0f172a)'
                  }}
                >
                  <option value="">-- جميع فروع الصيدليات --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '6px', lineHeight: 1.4 }}>
                  تخصيص الإرسال لفرع محدد أو لجميع الصيدليات.
                </div>
              </div>
            </div>

            {/* Custom Message */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13.5px', marginBottom: '6px', color: 'var(--text, #1e293b)' }}>
                <span>📝 نص رسالة الإشعار المرسلة للموظفين:</span>
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted, #64748b)' }}>
                  ينتقل الموظف عند الضغط على الإشعار مباشرة لتبويب الجدول الشهري
                </span>
              </label>
              <textarea
                value={schedMessage}
                onChange={(e) => setSchedMessage(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #cbd5e1)',
                  background: 'var(--surface, #ffffff)',
                  color: 'var(--text, #0f172a)',
                  fontSize: '13.5px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
                placeholder="اكتب نص الإشعار هنا..."
              />
            </div>

            {/* Action Bar & Telemetry */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              padding: '14px',
              background: 'var(--background, #f8fafc)',
              borderRadius: '10px',
              border: '1px solid var(--border, #e2e8f0)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--muted, #64748b)' }}>
                <div>
                  <span>🕒 آخر إرسال: </span>
                  <strong style={{ color: 'var(--text, #1e293b)' }}>
                    {orgSettings.rosterNotificationLastSentDate
                      ? `${new Date(orgSettings.rosterNotificationLastSentDate).toLocaleDateString('ar-EG')} - ${new Date(orgSettings.rosterNotificationLastSentDate).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} (${orgSettings.rosterNotificationLastSentCount || 0} موظف)`
                      : 'لم يتم الإرسال هذا الشهر بعد'}
                  </strong>
                </div>
                <div>
                  <span>🎯 عدد المستلمين المؤهلين: </span>
                  <strong style={{ color: '#0d9488', fontSize: '14px' }}>
                    {eligibleEmployees.length} موظف
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  style={{
                    padding: '8px 18px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    cursor: isSavingSettings ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                  }}
                >
                  <span>{isSavingSettings ? '⏳ جارِ الحفظ...' : '💾 حفظ الإعدادات'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={isSendingNotifs || eligibleEmployees.length === 0}
                  style={{
                    padding: '8px 18px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: '#059669',
                    color: '#ffffff',
                    cursor: (isSendingNotifs || eligibleEmployees.length === 0) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  <span>{isSendingNotifs ? '⏳ جارِ الإرسال...' : `📢 إرسال إشعار فوري الآن (${eligibleEmployees.length})`}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface, #ffffff)',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            border: '1px solid var(--border, #e2e8f0)',
            fontFamily: "'Tajawal', sans-serif"
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px'
              }}>
                📢
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text, #1e293b)' }}>
                  تأكيد بث إشعار فوري بالجدول الشهري
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--muted, #64748b)' }}>
                  سيتم إرسال هذا الإشعار فوراً إلى بوابة الموظف لجميع المشمولين
                </p>
              </div>
            </div>

            <div style={{
              background: 'var(--background, #f8fafc)',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid var(--border, #e2e8f0)',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--muted, #64748b)' }}>
                👥 عدد الموظفين المستلمين: <strong style={{ color: '#059669', fontSize: '15px' }}>{eligibleEmployees.length} موظف</strong>
              </div>
              <div style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--muted, #64748b)' }}>
                🏢 نطاق الفروع: <strong style={{ color: 'var(--text, #1e293b)' }}>{schedBranchFilter ? branches.find(b => b.id === schedBranchFilter)?.name || schedBranchFilter : 'كافة فروع الصيدليات'}</strong>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted, #64748b)' }}>
                📝 نص الإشعار:
              </div>
              <div style={{
                marginTop: '6px',
                padding: '10px',
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                fontSize: '13px',
                lineHeight: 1.5,
                color: 'var(--text, #1e293b)',
                fontWeight: 500
              }}>
                {schedMessage}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSendingNotifs}
                style={{
                  padding: '8px 18px',
                  fontSize: '13.5px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #cbd5e1)',
                  background: 'transparent',
                  color: 'var(--text, #475569)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => executeSendNotifications(false)}
                disabled={isSendingNotifs}
                style={{
                  padding: '8px 20px',
                  fontSize: '13.5px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#059669',
                  color: '#ffffff',
                  cursor: isSendingNotifs ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                }}
              >
                {isSendingNotifs ? '⏳ جارِ الإرسال...' : '🚀 نعم، إرسال الآن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>👥 جميع موظفي الصيدليات (اضغط على الموظف لمعاينة الجدول)</h4>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
          />
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <option value="">-- جميع الفروع --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>المسمى الوظيفي</th>
              <th>حالة اعتماد الجدول الشهري</th>
              <th>معاينة الجدول</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين يطابقون خيارات البحث.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => String(br.id) === String(emp.branchId));
                const empRoster = getResolvedEmployeeRoster(emp, selectedBranch, state);

                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td>
                      {empRoster?.status === 'approved' ? (
                        (!empRoster?.schedule || Object.keys(empRoster.schedule).length === 0) ? (
                          <span className="badge badge-danger" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #ef4444', fontWeight: 'bold' }}>
                            ⚠️ معتمد (بدون جدول تفصيلي!)
                          </span>
                        ) : (
                          <span className="badge badge-success">🟢 معتمد من الإدارة والفرع</span>
                        )
                      ) : (
                        <span className="badge badge-warning">⏳ قيد المراجعة</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-start"
                        style={{ padding: '4px 12px', fontSize: '12.5px' }}
                        onClick={() => setSelectedRosterEmp(emp)}
                      >
                        👁️ معاينة الجدول الشهري
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Roster Preview Modal */}
      {selectedRosterEmp && (
        <RosterPreviewModal
          employee={selectedRosterEmp}
          state={state}
          onClose={() => setSelectedRosterEmp(null)}
        />
      )}
    </div>
  );
}
