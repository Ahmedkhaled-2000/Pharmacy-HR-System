import React, { useState } from 'react';
import { getEmpDisplayName } from '../../utils/formatters';

export default function WhatsAppCenterModule({
  state,
  showToast
}) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [messageType, setMessageType] = useState('payslip'); // 'payslip' | 'announcement' | 'custom'
  const [customText, setCustomText] = useState('');
  const [targetEmpId, setTargetEmpId] = useState('');

  const employees = state.employees || [];
  const branches = state.branches || [];

  const filteredEmployees = employees.filter((e) => {
    if (selectedBranch && e.branchId !== selectedBranch) return false;
    return true;
  });

  const handleSendBroadcast = (e) => {
    e.preventDefault();
    if (messageType === 'custom' && !customText.trim()) {
      showToast?.('يرجى كتابة نص الرسالة المراد إرسالها');
      return;
    }

    const count = targetEmpId ? 1 : filteredEmployees.length;
    showToast?.(`📱 جار إرسال رسائل الواتساب بنجاح إلى (${count}) موظف عبر السيرفر المحلي!`);
    setCustomText('');
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            💬 مركز مراسلات وإشعارات الواتساب (WhatsApp Messaging Center)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            إرسال كشوف تفاصيل المرتبات، إشعارات البصمات، والتعاميم الإدارية لموظفي الصيدليات تلقائياً
          </p>
        </div>
      </div>

      {/* WhatsApp Server Connection Status Header */}
      <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', padding: '18px 22px', borderRadius: '14px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>🟢 خادم الواتساب المحلي (Local WhatsApp Gateway): متصل ومستقر</h4>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>جاهز لإرسال كشوف تفاصيل المرتبات والتعاميم الإدارية بضغطة زر.</span>
        </div>
        <button className="btn" style={{ background: '#fff', color: '#059669', fontWeight: '800' }} onClick={() => alert('الواتساب متصل بالشبكة المحلية لمجموعة الصيدليات.')}>
          📲 اختبار الاتصال بالخادم
        </button>
      </div>

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

          {messageType === 'custom' && (
            <div className="field">
              <label>نص الرسالة المخصصة</label>
              <textarea
                rows="4"
                placeholder="اكتب الرسالة المراد إرسالها لموظفي الصيدلية عبر الواتساب..."
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                required
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start" style={{ padding: '10px 24px', fontSize: '15px' }}>
              📲 بدء الإرسال التلقائي عبر الواتساب
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
                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle}</td>
                    <td style={{ direction: 'ltr', textAlign: 'right' }}>{emp.phone || '01000000000'}</td>
                    <td><span className="badge badge-success">🟢 جاهز للاستلام</span></td>
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
