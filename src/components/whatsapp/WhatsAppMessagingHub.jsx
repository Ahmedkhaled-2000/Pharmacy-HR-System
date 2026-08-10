import React from 'react';
import { fmt } from '../../utils/formatters';

export default function WhatsAppMessagingHub({
  state,
  waSelectedEmpId,
  setWaSelectedEmpId,
  waCustomMessage,
  setWaCustomMessage,
  waTemplateType,
  setWaTemplateType,
  monthPicker,
  generatePayslipMsg,
  sendWhatsAppMsg,
  sendBulkWhatsAppMsg,
  getEmpName,
  computeEmpSummary,
  openWhatsAppDirect
}) {
  return (
    <div className="settings-page card fade-in" style={{ width: '100%', margin: '0' }}>
      <h3>💬 مركز مراسلات الواتساب وتفاصيل المرتبات</h3>
      <p className="kiosk-sub" style={{ color: 'var(--muted)', marginBottom: '20px' }}>
        إرسال إشعارات وتفاصيل المرتبات المحسوبة تلقائياً لكل موظف مباشرة عبر WhatsApp
      </p>

      <div className="form-row" style={{ flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', width: '100%' }}>
          <div className="field grow">
            <label>اختر الموظف المستهدف</label>
            <select value={waSelectedEmpId} onChange={(e) => {
              const id = e.target.value;
              setWaSelectedEmpId(id);
              if (waTemplateType === 'payslip') {
                if (id !== 'all') {
                  setWaCustomMessage(generatePayslipMsg(id));
                } else {
                  setWaCustomMessage(`السلام عليكم ورحمة الله وبركاته،\n\nعزيزي الموظف: [اسم الموظف]\nإليك تفاصيل مرتب هذا الشهر:\n• ساعات العمل المسجلة\n• المستحقات الأساسية والمكافآت\n• الخصومات وصافي المرتب المستحق\n\nمع تحيات إدارة ${state.orgSettings.orgName || 'المؤسسة'}.`);
                }
              }
            }}>
              <option value="all">🚀 جميع الموظفين (إرسال جماعي دفعة واحدة)</option>
              {state.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  👤 الموظف: {e.name} (كود: {e.code}) {e.phone ? `· 📱 ${e.phone}` : '❌ بدون رقم'}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>قالب الرسالة</label>
            <select value={waTemplateType} onChange={(e) => {
              const type = e.target.value;
              setWaTemplateType(type);
              if (type === 'payslip') {
                if (waSelectedEmpId !== 'all') {
                  setWaCustomMessage(generatePayslipMsg(waSelectedEmpId));
                } else {
                  setWaCustomMessage(`السلام عليكم ورحمة الله وبركاته،\n\nعزيزي الموظف: [اسم الموظف]\nإليك تفاصيل مرتب هذا الشهر:\n• ساعات العمل المسجلة\n• المستحقات الأساسية والمكافآت\n• الخصومات وصافي المرتب المستحق\n\nمع تحيات إدارة ${state.orgSettings.orgName || 'المؤسسة'}.`);
                }
              } else if (type === 'general') {
                setWaCustomMessage(`تنويه هام من إدارة ${state.orgSettings.orgName || 'المؤسسة'}:\n\nبرجاء العلم بضرورة الالتزام بالمواعيد الرسمية للبصمة.`);
              }
            }}>
              <option value="payslip">📄 كشف تفاصيل المرتب والمستحقات</option>
              <option value="general">📢 إشعار عام / تنبيه إداري</option>
              <option value="custom">✏️ نص مخصص حر</option>
            </select>
          </div>
        </div>

        <div className="field grow" style={{ width: '100%' }}>
          <label>محتوى ورسالة WhatsApp (معاينة وحرر النص)</label>
          <textarea
            rows={8}
            value={waCustomMessage}
            onChange={(e) => setWaCustomMessage(e.target.value)}
            placeholder="اكتب هنا محتوى الرسالة والمرتب..."
            style={{ width: '100%', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.6', padding: '14px', borderRadius: '12px' }}
          />
        </div>

        {waSelectedEmpId !== 'all' ? (
          <button
            className="btn btn-start"
            style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '800' }}
            onClick={() => sendWhatsAppMsg(waSelectedEmpId, waCustomMessage)}
          >
            📱 إرسال الرسالة إلى {getEmpName(waSelectedEmpId)} عبر WhatsApp
          </button>
        ) : (
          <>
            <button
              className="btn"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#fff',
                fontWeight: '800',
                fontSize: '15px',
                padding: '14px 24px',
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                cursor: 'pointer'
              }}
              onClick={sendBulkWhatsAppMsg}
            >
              🚀 إرسال لجميع الموظفين دفعة واحدة عبر WhatsApp
            </button>

            <div className="table-responsive" style={{ width: '100%', marginTop: '10px' }}>
              <h4>قائمة الموظفين والإرسال المباشر بضغطة زر:</h4>
              <table style={{ marginTop: '10px' }}>
                <thead>
                  <tr>
                    <th>كود الموظف</th>
                    <th>اسم الموظف</th>
                    <th>رقم الهاتف</th>
                    <th>صافي المرتب المستحق</th>
                    <th>إرسال WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {state.employees.map((e) => {
                    const s = computeEmpSummary(e.id, (d) => d.startsWith(monthPicker));
                    return (
                      <tr key={e.id}>
                        <td>{e.code}</td>
                        <td>{e.name}</td>
                        <td>{e.phone ? `📱 ${e.phone}` : '❌ لا يوجد رقم'}</td>
                        <td className="money" style={{ color: 'var(--primary)' }}>{fmt(s.netSalary)} ج.م</td>
                        <td>
                          <button
                            className="btn btn-start"
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                            onClick={() => openWhatsAppDirect(e.id, generatePayslipMsg(e.id))}
                          >
                            📱 إرسال بـ WhatsApp
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
