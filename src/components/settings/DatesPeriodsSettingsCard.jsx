import React, { useState, useMemo } from 'react';
import {
  extractPayrollSettings,
  getCycleDateRange,
  getActivePayrollMonth,
  getCycleRemainingTime,
  getDaysInMonth
} from '../../utils/periodEngine';
import { getRealDate, formatArabicFullDateTime, getRealFormatted12HourTime, isServerTimeSynced } from '../../utils/timeEngine';
import { useLiveRealTime } from '../../hooks/useLiveRealTime';

export default function DatesPeriodsSettingsCard({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  authRole
}) {
  const liveTime = useLiveRealTime(1000);
  const orgSettings = state.orgSettings || {};
  const currentSettings = extractPayrollSettings(orgSettings);

  const [periodType, setPeriodType] = useState(currentSettings.periodType || 'cycle');
  const [startDay, setStartDay] = useState(currentSettings.startDay || 26);
  const [endDay, setEndDay] = useState(currentSettings.endDay || 25);
  const [startTime, setStartTime] = useState(currentSettings.startTime || '00:00');
  const [endTime, setEndTime] = useState(currentSettings.endTime || '23:59');
  const [customFrom, setCustomFrom] = useState(currentSettings.customFrom || '');
  const [customTo, setCustomTo] = useState(currentSettings.customTo || '');

  // محاكاة واختبار تاريخ اختياري
  const [testDateInput, setTestDateInput] = useState('');
  const [testMonthInput, setTestMonthInput] = useState(getActivePayrollMonth(orgSettings));

  // معاينة الإعدادات الحالية قبل الحفظ
  const previewOrgSettings = useMemo(() => {
    return {
      ...orgSettings,
      payrollPeriodType: periodType,
      payrollPayoutStartDay: parseInt(startDay, 10),
      payrollPayoutEndDay: parseInt(endDay, 10),
      payrollPayoutDay: parseInt(endDay, 10),
      payrollPayoutStartTime: startTime,
      payrollPayoutEndTime: endTime,
      payrollCustomFrom: customFrom,
      payrollCustomTo: customTo
    };
  }, [orgSettings, periodType, startDay, endDay, startTime, endTime, customFrom, customTo]);

  // حساب النطاق المالي للشهر النشط بناء على الإعدادات الجديدة
  const activeMonthPreview = useMemo(() => {
    return getActivePayrollMonth(previewOrgSettings, liveTime.realDate);
  }, [previewOrgSettings, liveTime.realDate]);

  const activeRangePreview = useMemo(() => {
    return getCycleDateRange(activeMonthPreview, previewOrgSettings);
  }, [activeMonthPreview, previewOrgSettings]);

  const remainingInfo = useMemo(() => {
    return getCycleRemainingTime(previewOrgSettings, liveTime.realDate);
  }, [previewOrgSettings, liveTime.realDate]);

  // اختبار تاريخ المدخل
  const testDateResult = useMemo(() => {
    if (!testDateInput) return null;
    const testDate = new Date(testDateInput + 'T12:00:00');
    const computedMonth = getActivePayrollMonth(previewOrgSettings, testDate);
    const computedRange = getCycleDateRange(computedMonth, previewOrgSettings);
    return {
      month: computedMonth,
      range: computedRange
    };
  }, [testDateInput, previewOrgSettings]);

  // اختبار شهر المدخل
  const testMonthResult = useMemo(() => {
    if (!testMonthInput) return null;
    return getCycleDateRange(testMonthInput, previewOrgSettings);
  }, [testMonthInput, previewOrgSettings]);

  const handleApplyPreset = (presetType) => {
    if (presetType === '26_to_25') {
      setPeriodType('cycle');
      setStartDay(26);
      setEndDay(25);
      setStartTime('00:00');
      setEndTime('23:59');
      showToast?.('💡 تم تعيين القالب: دورة الرواتب من 26 إلى 25');
    } else if (presetType === '1_to_30') {
      setPeriodType('cycle');
      setStartDay(1);
      setEndDay(31);
      setStartTime('00:00');
      setEndTime('23:59');
      showToast?.('💡 تم تعيين القالب: شهر ميلادي كامل (من 1 إلى آخر الشهر)');
    } else if (presetType === '21_to_20') {
      setPeriodType('cycle');
      setStartDay(21);
      setEndDay(20);
      setStartTime('00:00');
      setEndTime('23:59');
      showToast?.('💡 تم تعيين القالب: دورة الرواتب من 21 إلى 20');
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();

    const performSave = async () => {
      const sDayNum = parseInt(startDay, 10);
      const eDayNum = parseInt(endDay, 10);

      const updatedOrgSettings = {
        ...(state.orgSettings || {}),
        payrollPeriodType: periodType,
        payrollPayoutStartDay: sDayNum,
        payrollPayoutEndDay: eDayNum,
        payrollPayoutDay: eDayNum,
        payrollPayoutStartTime: startTime,
        payrollPayoutEndTime: endTime,
        payrollCustomFrom: periodType === 'custom' ? customFrom : '',
        payrollCustomTo: periodType === 'custom' ? customTo : '',
        _payrollCutoffUpdatedAt: new Date().toISOString()
      };

      try {
        localStorage.setItem('payroll_period_type', periodType);
        localStorage.setItem('payroll_payout_start_day', String(sDayNum));
        localStorage.setItem('payroll_payout_end_day', String(eDayNum));
        localStorage.setItem('payroll_payout_start_time', startTime);
        localStorage.setItem('payroll_payout_end_time', endTime);
        if (periodType === 'custom') {
          localStorage.setItem('payroll_custom_from', customFrom);
          localStorage.setItem('payroll_custom_to', customTo);
        }
      } catch {}

      const updatedState = { ...state, orgSettings: updatedOrgSettings };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('💾 تم حفظ وتطبيق إعدادات الفترات ودورات الرواتب وتحديث كافة الشاشات بنجاح');
    };

    const isCutoffRulesLocked = Boolean(state.orgSettings?.ownerModificationLocks?.lockEditCutoffRules);
    if (isCutoffRulesLocked && executeWithOwnerGuard && authRole !== 'owner') {
      executeWithOwnerGuard({
        lockKey: 'lockEditCutoffRules',
        actionTitle: 'تعديل إعدادات التواريخ ودورة الرواتب وتقفيل الشهر',
        actionDetails: `تغيير بداية الدورة إلى يوم ${startDay} والنهاية إلى يوم ${endDay} وساعة الإغلاق ${endTime}`,
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Info & Real Time Status Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)',
        border: '1px solid rgba(14, 165, 233, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '24px' }}>📅</span>
            <h3 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--text)' }}>
              إعدادات التواريخ، الفترات المالية، ودورات تقفيل الرواتب
            </h3>
          </div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: '1.6' }}>
            حدد اليوم والساعة المعتمدين لبداية ونهاية دورة الشهر المالية. سيقوم النظام تلقائياً بنقل الدورة للشهر التالي
            وتجميد مسير الرواتب عند حلول ساعة الإغلاق المحددة، وتطبيق هذه الحدود في شاشات الإدارة، مدير الفرع، وبوابة الموظف.
          </p>
        </div>

        {/* Live Authoritative Real-Time Widget */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: liveTime.isServerSynced ? '#22c55e' : '#f59e0b',
              boxShadow: liveTime.isServerSynced ? '0 0 8px #22c55e' : 'none'
            }} />
            <span>{liveTime.isServerSynced ? '🌐 التوقيت الفعلي الموثق (سيرفر)' : '⏱️ التوقيت المرجعي المباشر'}</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--primary)' }}>
            {liveTime.formatted12Time}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text)', fontWeight: '600' }}>
            {liveTime.fullArabicDate}
          </div>
        </div>
      </div>

      {/* Main Settings & Live Simulation 2-Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        
        {/* Column 1: Configuration Form */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚙️</span>
            <span>تخصيص قواعد الدورة الشهرية</span>
          </h4>

          {/* Quick Presets */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
              ⚡ قوالب جاهزة سريعة:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleApplyPreset('26_to_25')}
                style={{
                  background: startDay === 26 && endDay === 25 ? 'var(--primary-light)' : 'var(--surface-muted)',
                  color: startDay === 26 && endDay === 25 ? 'var(--primary-dark)' : 'var(--text)',
                  border: `1px solid ${startDay === 26 && endDay === 25 ? 'var(--primary)' : 'var(--border)'}`,
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                📅 دورة 26 إلى 25 (الافتراضي)
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('1_to_30')}
                style={{
                  background: startDay === 1 && (endDay === 30 || endDay === 31) ? 'var(--primary-light)' : 'var(--surface-muted)',
                  color: startDay === 1 && (endDay === 30 || endDay === 31) ? 'var(--primary-dark)' : 'var(--text)',
                  border: `1px solid ${startDay === 1 && (endDay === 30 || endDay === 31) ? 'var(--primary)' : 'var(--border)'}`,
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                📆 شهر ميلادي كامل (1 إلى 31)
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('21_to_20')}
                style={{
                  background: startDay === 21 && endDay === 20 ? 'var(--primary-light)' : 'var(--surface-muted)',
                  color: startDay === 21 && endDay === 20 ? 'var(--primary-dark)' : 'var(--text)',
                  border: `1px solid ${startDay === 21 && endDay === 20 ? 'var(--primary)' : 'var(--border)'}`,
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                🗓️ دورة 21 إلى 20
              </button>
            </div>
          </div>

          {/* Period Mode Selector */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
              نوع الدورة الزمنية:
            </label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              <option value="cycle">🔄 دورة شهرية دورية (تتكرر شهرياً عند الأيام المحددة)</option>
              <option value="custom">📆 فترة مخصصة ثابتة (تحديد تاريخ بداية وتاريخ نهاية ثابتين)</option>
            </select>
          </div>

          {periodType === 'cycle' ? (
            <>
              {/* Start & End Days Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                    يوم بداية الشهر المالي:
                  </label>
                  <select
                    value={startDay}
                    onChange={(e) => setStartDay(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    }}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        يوم {d} {d === 26 ? '(الافتراضي للصيدليات)' : ''}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    {startDay > endDay ? '👈 يبدأ من الشهر السابق' : '👈 يبدأ من نفس الشهر'}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                    يوم نهاية الشهر وتقفيل الرواتب:
                  </label>
                  <select
                    value={endDay}
                    onChange={(e) => setEndDay(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    }}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        يوم {d} {d === 25 ? '(الافتراضي للصيدليات)' : ''}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    👈 ينتهي بنهاية هذا اليوم
                  </span>
                </div>
              </div>

              {/* Start & End Cutoff Times Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                    ساعة بدء الدورة الجديدة:
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      fontWeight: 'bold'
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    افتراضي: 00:00 (منتصف الليل)
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                    ساعة إغلاق الرواتب والانتقال التلقائي:
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      fontWeight: 'bold'
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    الانتقال للشهر الجديد فور حلول هذا الوقت
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                  تاريخ بداية الفترة المخصصة:
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontWeight: 'bold'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                  تاريخ نهاية الفترة المخصصة:
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontWeight: 'bold'
                  }}
                />
              </div>
            </div>
          )}

          {/* Action Save Button */}
          <div style={{ marginTop: '10px' }}>
            <button
              type="button"
              onClick={handleSaveSettings}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                color: '#fff',
                border: 'none',
                padding: '12px 20px',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
              }}
            >
              <span>💾</span>
              <span>حفظ وتطبيق إعدادات التواريخ والدورات على المنظومة</span>
            </button>
          </div>
        </div>

        {/* Column 2: Live Interactive Simulation & Preview Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔬</span>
            <span>المعاينة الحية والمحاكاة الفورية</span>
          </h4>

          {/* Active Cycle Status Card */}
          <div style={{
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 'bold' }}>
                📌 الدورة المالية النشطة حالياً:
              </span>
              <span style={{
                background: 'var(--primary-light)',
                color: 'var(--primary-dark)',
                padding: '3px 10px',
                borderRadius: '99px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {activeMonthPreview}
              </span>
            </div>

            <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '8px' }}>
              {activeRangePreview.label}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px' }}>
              <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>تاريخ البداية</span>
                <strong style={{ fontSize: '13px', color: 'var(--text)' }}>{activeRangePreview.startDate}</strong>
              </div>
              <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>تاريخ الإغلاق</span>
                <strong style={{ fontSize: '13px', color: 'var(--text)' }}>{activeRangePreview.endDate}</strong>
              </div>
              <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>إجمالي الأيام</span>
                <strong style={{ fontSize: '13px', color: 'var(--primary)' }}>{activeRangePreview.daysCount} يوم</strong>
              </div>
            </div>

            {/* Countdown / Remaining Time Widget */}
            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: remainingInfo.isClosed ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${remainingInfo.isClosed ? '#fecaca' : '#bbf7d0'}`,
              color: remainingInfo.isClosed ? '#991b1b' : '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              fontWeight: 'bold'
            }}>
              <span>⏱️ موعد الإغلاق والانتقال للشهر الجديد:</span>
              <span>{remainingInfo.remainingText}</span>
            </div>
          </div>

          {/* Test Any Date Tool */}
          <div style={{
            background: 'var(--surface-muted)',
            border: '1px dashed var(--border)',
            borderRadius: '12px',
            padding: '14px'
          }}>
            <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
              🧪 اختبار أي تاريخ لمعرفة الدورة والشهر المالي التابع له:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="date"
                value={testDateInput}
                onChange={(e) => setTestDateInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '12.5px'
                }}
              />
              {testDateInput && (
                <button
                  type="button"
                  onClick={() => setTestDateInput('')}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  مسح
                </button>
              )}
            </div>

            {testDateResult && (
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '12.5px'
              }}>
                <span style={{ color: 'var(--muted)' }}>النتيجة المحسوبة: </span>
                <strong style={{ color: 'var(--primary)' }}>شهر {testDateResult.month}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '11.5px', display: 'block', marginTop: '2px' }}>
                  النطاق: من {testDateResult.range.startDate} إلى {testDateResult.range.endDate}
                </span>
              </div>
            )}
          </div>

          {/* Test Any Month Tool */}
          <div style={{
            background: 'var(--surface-muted)',
            border: '1px dashed var(--border)',
            borderRadius: '12px',
            padding: '14px'
          }}>
            <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
              📊 استعراض نطاق أي شهر محدد:
            </label>
            <input
              type="month"
              value={testMonthInput}
              onChange={(e) => setTestMonthInput(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: '12.5px'
              }}
            />

            {testMonthResult && (
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '12.5px'
              }}>
                <strong style={{ color: 'var(--text)' }}>{testMonthResult.label}</strong>
                <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
                  عدد الأيام المحسوبة: {testMonthResult.daysCount} يوم
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
