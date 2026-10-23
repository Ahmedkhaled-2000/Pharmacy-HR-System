import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { buildChronicWhatsAppRefillMessage } from '../../utils/posEngine';
import { MessageSquare, X, Send, User, Calendar, CheckCircle2, Phone } from 'lucide-react';

export default function PosChronicRefillModal() {
  const { isChronicModalOpen, setIsChronicModalOpen } = usePOS();

  // مرضى العلاج المزمن المستحقون لإعادة الصرف خلال 4 أيام
  const [chronicPatients, setChronicPatients] = useState([
    {
      id: 'cp-1',
      customerName: 'أ. حسام الدين السيد',
      phone: '01002345678',
      medicationName: 'كونكور 5 مجم أقراص (Concor 5mg)',
      dailyDose: 'قرص واحد يومياً',
      lastDispensed: '2026-09-27',
      estimatedDepletion: '2026-10-27',
      daysRemaining: 4,
      status: 'pending' // 'pending' | 'sent'
    },
    {
      id: 'cp-2',
      customerName: 'الحاجة فوزية محمود',
      phone: '01123456789',
      medicationName: 'جلوكوفاج 1000 مجم أقراص (Glucophage)',
      dailyDose: 'قرصين يومياً بعد الأكل',
      lastDispensed: '2026-10-12',
      estimatedDepletion: '2026-10-27',
      daysRemaining: 4,
      status: 'pending'
    },
    {
      id: 'cp-3',
      customerName: 'د. طارق عبد الوهاب',
      phone: '01234567890',
      medicationName: 'نيتروماك ريتارد 2.5 مجم (Nitromak)',
      dailyDose: 'كبسولة مرتين يومياً',
      lastDispensed: '2026-10-12',
      estimatedDepletion: '2026-10-27',
      daysRemaining: 4,
      status: 'pending'
    }
  ]);

  const [activePreviewPatient, setActivePreviewPatient] = useState(null);

  if (!isChronicModalOpen) return null;

  const handleSendWhatsAppReminder = (patient) => {
    const msg = buildChronicWhatsAppRefillMessage({
      customerName: patient.customerName,
      medicationName: patient.medicationName,
      branchName: 'صيدليات الشفاء الطبية',
      branchPhone: '01000000000'
    });

    // إرسال عبر واتساب ويب أو خادم الواتساب المدمج
    const cleanPhone = patient.phone.startsWith('0') ? `2${patient.phone}` : patient.phone;
    const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');

    setChronicPatients((prev) =>
      prev.map((p) => (p.id === patient.id ? { ...p, status: 'sent' } : p))
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 2350,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1.5px solid var(--border, #cbd5e1)',
          borderRadius: '20px',
          width: '94%',
          maxWidth: '850px',
          maxHeight: '85vh',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--surface-hover, #f8fafc)',
            borderBottom: '1px solid var(--border, #cbd5e1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={22} color="#25D366" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                أتمتة أدوية الأمراض المزمنة وتذكير الواتساب (Automated Chronic Refill CRM) [F11]
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                متابعة جرعات المرضى وإرسال رسائل تذكير تلقائية بإعادة الصرف قبل نفاد الدواء بـ 4 أيام
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsChronicModalOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {chronicPatients.map((patient) => (
              <div
                key={patient.id}
                style={{
                  border: '1.5px solid var(--border, #cbd5e1)',
                  borderRadius: '14px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: patient.status === 'sent' ? 'rgba(37, 211, 102, 0.05)' : 'var(--surface, #ffffff)',
                  borderColor: patient.status === 'sent' ? '#25D366' : 'var(--border, #cbd5e1)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 900, fontSize: '14px', color: 'var(--text, #0b132b)' }}>
                      {patient.customerName}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--muted, #475569)' }}>
                      📞 {patient.phone}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary, #0d9488)', marginTop: '4px' }}>
                    💊 {patient.medicationName}
                  </div>

                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                    الجرعة اليومية: {patient.dailyDose} • موعد النفاد المقدر: <strong>{patient.estimatedDepletion} (متبقي {patient.daysRemaining} أيام)</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {patient.status === 'sent' ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        background: '#ecfdf5',
                        color: '#059669',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 800
                      }}
                    >
                      <CheckCircle2 size={15} />
                      تم إرسال التذكير
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppReminder(patient)}
                      style={{
                        padding: '10px 18px',
                        background: '#25D366',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 900,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(37, 211, 102, 0.35)'
                      }}
                    >
                      <Send size={14} />
                      <span>إرسال واتساب فوري</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
