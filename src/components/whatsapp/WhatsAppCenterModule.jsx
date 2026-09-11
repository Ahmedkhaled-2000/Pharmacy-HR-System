import React, { useState, useEffect, useCallback } from 'react';
import { getEmpDisplayName, isEmployeeActive, fmt } from '../../utils/formatters';

export default function WhatsAppCenterModule({
  state,
  showToast,
  monthPicker
}) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [messageType, setMessageType] = useState('payslip'); // 'payslip' | 'announcement' | 'custom'
  const [customText, setCustomText] = useState('');
  const [targetEmpId, setTargetEmpId] = useState('');
  
  // حالة خادم الواتساب الحية
  const [waStatus, setWaStatus] = useState('checking'); // 'checking' | 'CONNECTED' | 'QR_READY' | 'DISCONNECTED'
  const [waPhone, setWaPhone] = useState('');
  const [waLiveQr, setWaLiveQr] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const serverUrl = (state?.orgSettings?.waServerUrl || '').trim() || 'http://127.0.0.1:3100';

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((e) => {
    if (!isEmployeeActive(e)) return false;
    if (selectedBranch && e.branchId !== selectedBranch) return false;
    return true;
  });

  // فحص حالة الخادم الحقيقية
  const fetchWaStatus = useCallback(async (silent = false) => {
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/status`, {
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data.status || 'DISCONNECTED');
        setWaPhone(data.phone || '');
        setWaLiveQr(data.qrCodeDataUrl || '');
        if (!silent && data.status === 'CONNECTED') {
          showToast?.(`🟢 خادم الواتساب متصل ومقترن بنجاح (+${data.phone})`);
        }
      } else {
        setWaStatus('DISCONNECTED');
      }
    } catch {
      setWaStatus('DISCONNECTED');
      if (!silent) {
        showToast?.('⚠️ تعذر الوصول لخادم الواتساب، يمكنك الضغط على "إعادة تشغيل الخادم"');
      }
    }
  }, [serverUrl, showToast]);

  // فحص الحالة تلقائياً عند فتح الصفحة وتكراره كل 10 ثوانٍ
  useEffect(() => {
    fetchWaStatus(true);
    const interval = setInterval(() => {
      fetchWaStatus(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchWaStatus]);

  // إعادة تشغيل خادم الواتساب بنقرة واحدة
  const handleRestartServer = async () => {
    setIsRestarting(true);
    showToast?.('⚡ جاري إعادة تشغيل وتحديث خادم الواتساب في الخلفية...');
    try {
      if (typeof window !== 'undefined' && window.desktopAPI?.restartWhatsAppServer) {
        const res = await window.desktopAPI.restartWhatsAppServer();
        showToast?.(res?.message || 'تمت إعادة تشغيل الخادم بنجاح');
      } else {
        await fetch(`${serverUrl.replace(/\/$/, '')}/api/restart`, {
          method: 'POST',
          signal: AbortSignal.timeout(3000)
        });
        showToast?.('تم إرسال أمر إعادة تشغيل الخادم بنجاح');
      }
    } catch (err) {
      console.warn('Restart trigger warning:', err);
    }

    // إعادة الفحص بعد 2.5 ثانية
    setTimeout(async () => {
      await fetchWaStatus(true);
      setIsRestarting(false);
    }, 2500);
  };

  // توليد نص كشف المرتب لموظف
  const buildPayslipText = (emp) => {
    const orgName = state.orgSettings?.orgName || 'مؤسسة الصيدليات';
    const month = monthPicker || new Date().toISOString().slice(0, 7);
    const base = Number(emp.baseSalary || emp.salary || 0);
    return `السلام عليكم ورحمة الله وبركاته،\n\nعزيزي الموظف: *${getEmpDisplayName(emp)}* (كود: ${emp.code})\nإليك تفاصيل مفردات مرتب شهر (${month}):\n\n• الراتب الأساسي: ${fmt(base)} ج.م\n• الفرع المكلف به: ${branches.find(b => b.id === emp.branchId)?.name || 'الفرع العام'}\n• المسمى الوظيفي: ${emp.jobTitle || 'عضو كادر'}\n\n★ يرجى مراجعة إدارة الحسابات في حال وجود أي استفسار.\nمع تحيات إدارة *${orgName}*.`;
  };

  // معالجة بدء الإرسال الفعلي عبر الواتساب
  const handleSendBroadcast = async (e) => {
    e.preventDefault();

    if (waStatus !== 'CONNECTED') {
      showToast?.('⚠️ خادم الواتساب غير مقترن بالهاتف حالياً. يرجى مسح رمز الـ QR أدناه أولاً لربط واتساب.');
      return;
    }

    const targetList = targetEmpId
      ? filteredEmployees.filter(emp => emp.id === targetEmpId)
      : filteredEmployees;

    const validRecipients = targetList.filter(emp => emp.phone && emp.phone.trim().length >= 10);

    if (validRecipients.length === 0) {
      showToast?.('❌ لا يوجد موظفون محددون يمتلكون أرقام هواتف مسجلة صالحة للواتساب.');
      return;
    }

    setIsSending(true);

    const messages = validRecipients.map(emp => {
      let bodyText = '';
      if (messageType === 'payslip') {
        bodyText = buildPayslipText(emp);
      } else if (messageType === 'announcement') {
        const orgName = state.orgSettings?.orgName || 'المؤسسة';
        bodyText = `📢 *تنبيه إداري وتعميم رسمي*\nمن إدارة: *${orgName}*\n\nإلى الزميل: *${getEmpDisplayName(emp)}*\n\n${customText || 'برجاء الالتزام التام بالتعليمات واللوائح المعتمدة.'}`;
      } else {
        bodyText = customText;
      }
      return {
        phone: emp.phone,
        message: bodyText,
        empName: getEmpDisplayName(emp)
      };
    });

    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });

      if (res.ok) {
        const data = await res.json();
        showToast?.(`🚀 ${data.message || `بدأ إرسال ${messages.length} رسالة بأمان عبر الواتساب!`}`);
        if (messageType === 'custom') setCustomText('');
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast?.(`❌ فشل بدء الإرسال: ${errData.error || 'خطأ في استجابة الخادم'}`);
      }
    } catch {
      showToast?.('❌ تعذر الاتصال بخادم الواتساب لإرسال الرسائل');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            💬 مركز مراسلات وإشعارات الواتساب (WhatsApp Messaging Center)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            إرسال كشوف تفاصيل المرتبات، إشعارات البصمات، والتعاميم الإدارية لموظفي الصيدليات تلقائياً على مدار 24 ساعة
          </p>
        </div>
      </div>

      {/* WhatsApp Server Connection Status Header with Dynamic State & Restart Button */}
      <div style={{
        background: waStatus === 'CONNECTED'
          ? 'linear-gradient(135deg, #10b981, #059669)'
          : waStatus === 'QR_READY'
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'linear-gradient(135deg, #ef4444, #dc2626)',
        color: '#fff',
        padding: '18px 22px',
        borderRadius: '14px',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
      }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {waStatus === 'CONNECTED' && `🟢 خادم الواتساب المحلي: متصل ومستقر ${waPhone ? `(+${waPhone})` : ''}`}
            {waStatus === 'QR_READY' && '🟡 خادم الواتساب: بانتظار مسح رمز QR للاقتران بالهاتف'}
            {waStatus === 'DISCONNECTED' && '🔴 خادم الواتساب: غير متصل أو قيد الإطلاق'}
            {waStatus === 'checking' && '⏳ جاري فحص حالة خادم الواتساب...'}
          </h4>
          <span style={{ fontSize: '13px', opacity: 0.95 }}>
            {waStatus === 'CONNECTED' && 'الخادم يعمل في الخلفية على مدار 24 ساعة ومستعد لإرسال مفردات المرتبات والإشعارات فوراً.'}
            {waStatus === 'QR_READY' && 'امسح رمز الـ QR الظاهر بالأسفل من تطبيق الواتساب بهاتفك لمرة واحدة فقط للربط الدائم.'}
            {waStatus === 'DISCONNECTED' && 'اضغط على زر "إعادة تشغيل الخادم" لتشغيله في الخلفية وحل أي تعليق تلقائياً.'}
            {waStatus === 'checking' && 'يتم التحقق من استجابة المقبس الخلفي للواتساب...'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            style={{ background: '#fff', color: '#0f172a', fontWeight: '800', fontSize: '13px', padding: '8px 16px' }}
            onClick={() => fetchWaStatus(false)}
          >
            📲 فحص الاتصال
          </button>

          {/* زر إعادة التشغيل المطلوب في حال حدوث أي خطأ */}
          <button
            type="button"
            className="btn"
            disabled={isRestarting}
            style={{
              background: '#0f172a',
              color: '#fff',
              fontWeight: '800',
              fontSize: '13px',
              padding: '8px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}
            onClick={handleRestartServer}
          >
            {isRestarting ? '⏳ جاري إعادة التشغيل...' : '🔄 إعادة تشغيل الخادم فوراً'}
          </button>
        </div>
      </div>

      {/* Live QR Pairing Card (Appears automatically when pairing is needed) */}
      {waStatus === 'QR_READY' && waLiveQr && (
        <div style={{
          background: '#ffffff',
          border: '2px dashed #f59e0b',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          textAlign: 'center',
          boxShadow: '0 6px 20px rgba(245, 158, 11, 0.12)'
        }}>
          <h3 style={{ margin: '0 0 6px 0', color: '#b45309', fontSize: '18px' }}>
            📱 امسح رمز الـ QR لربط هاتف الواتساب بالمنظومة
          </h3>
          <p style={{ color: '#64748b', fontSize: '13.5px', margin: '0 0 16px 0' }}>
            افتح WhatsApp على هاتفك ➔ اضغط على القائمة (الثلاث نقاط) ➔ <strong>الأجهزة المرتبطة (Linked Devices)</strong> ➔ اضغط <strong>ربط جهاز</strong> ووجّه الكاميرا:
          </p>
          <div style={{ display: 'inline-block', background: '#fff', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
            <img src={waLiveQr} alt="WhatsApp QR Code" style={{ width: '240px', height: '240px', display: 'block' }} />
          </div>
          <div style={{ marginTop: '14px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '13px', padding: '6px 16px' }}
              onClick={() => handleRestartServer()}
            >
              🔄 تجديد رمز الـ QR
            </button>
          </div>
        </div>
      )}

      {/* Broadcast Form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
          ✉️ إرسال رسائل أو مفردات مرتبات عبر الواتساب
        </h4>

        <form onSubmit={handleSendBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div className="field">
              <label>نوع المراسلة</label>
              <select value={messageType} onChange={(e) => setMessageType(e.target.value)} required>
                <option value="payslip">💰 إرسال كشف ومفردات المرتب الشهري (مع شيت التفاصيل)</option>
                <option value="announcement">📢 إرسال تعميم أو تنبيه إداري عام</option>
                <option value="custom">💬 رسالة مخصصة</option>
              </select>
            </div>

            <div className="field">
              <label>تحديد الفرع الموجه له</label>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                <option value="">-- جميع فروع الصيدليات --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>تحديد موظف معين (اختياري)</label>
              <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)}>
                <option value="">-- إرسال لجميع الموظفين بالمجموعة / الفرع --</option>
                {filteredEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{getEmpDisplayName(emp)} ({emp.code})</option>
                ))}
              </select>
            </div>
          </div>

          {(messageType === 'custom' || messageType === 'announcement') && (
            <div className="field">
              <label>نص التعميم أو الرسالة المخصصة</label>
              <textarea
                rows="4"
                placeholder={messageType === 'announcement' ? 'اكتب نص التعميم الإداري العام الموجه للموظفين...' : 'اكتب الرسالة المراد إرسالها لموظفي الصيدلية عبر الواتساب...'}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                required
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              🛡️ الإرسال محمي بتقنية الفواصل الزمنية الذكية (Anti-Ban) لمنع حظر الرقم من واتساب.
            </span>
            <button
              type="submit"
              disabled={isSending}
              className="btn btn-start"
              style={{
                padding: '10px 24px',
                fontSize: '15px',
                opacity: isSending ? 0.7 : 1
              }}
            >
              {isSending ? '⏳ جاري الإرسال بأمان...' : '📲 بدء الإرسال التلقائي عبر الواتساب'}
            </button>
          </div>
        </form>
      </div>

      {/* Recipient Employee Table Preview */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>👥 قائمة المستلمين المحددين للمراسلة ({filteredEmployees.length} موظف)</h4>
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>المسمى الوظيفي</th>
              <th>رقم هاتف الواتساب</th>
              <th>حالة الاتصال بالواتساب</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا يوجد موظفين مستهدفين.</td></tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => br.id === emp.branchId);
                const hasPhone = emp.phone && emp.phone.trim().length >= 10;
                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td style={{ direction: 'ltr', textAlign: 'right' }}>{emp.phone || '❌ بدون رقم'}</td>
                    <td>
                      {hasPhone ? (
                        <span className="badge badge-success">🟢 جاهز للاستلام</span>
                      ) : (
                        <span className="badge badge-danger">🔴 غير مسجل رقم</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
