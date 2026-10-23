import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Sun,
  Moon,
  Check,
  Loader2,
  Settings,
  HelpCircle
} from 'lucide-react';
import { outstockSaveCyclesConfig } from '../../../utils/outstockApiClient';

export default function ProcurementCyclesModal({
  isOpen,
  onClose,
  initialConfig = {},
  onSaveSuccess,
  showToast = alert
}) {
  const [morningCutoff, setMorningCutoff] = useState('14:00');
  const [eveningCutoff, setEveningCutoff] = useState('22:00');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialConfig?.morningCutoff) {
      setMorningCutoff(initialConfig.morningCutoff);
    }
    if (initialConfig?.eveningCutoff) {
      setEveningCutoff(initialConfig.eveningCutoff);
    }
  }, [initialConfig]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await outstockSaveCyclesConfig({
        morningCutoff: morningCutoff || '14:00',
        eveningCutoff: eveningCutoff || '22:00'
      });
      if (res?.success) {
        showToast?.('✅ تم حفظ وتثبيت مواعيد الدورات الافتراضية بنجاح ⏰');
        onSaveSuccess?.(res.config);
        onClose();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر حفظ الإعدادات'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء حفظ مواعيد الدورات');
    } finally {
      setIsSaving(false);
    }
  };

  const format12Hour = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'مساءً' : 'صباحاً';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };

  return (
    <div className="outstock-modal-backdrop" style={{ zIndex: 12000 }}>
      <div className="outstock-modal" style={{ maxWidth: '480px', width: '92%' }}>
        {/* الترويسة */}
        <div className="outstock-modal-header" style={{ background: '#f0fdfa', borderBottom: '1px solid #ccfbf1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#0d9488',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f766e' }}>
                تحديد وتثبيت مواعيد دورات المشتريات
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b' }}>
                ضبط وقت انتهاء استقبال وتجميع طلبيات الفروع للدورة الصباحية والمسائية
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="outstock-modal-close">
            <X size={18} />
          </button>
        </div>

        {/* النموذج */}
        <form onSubmit={handleSave}>
          <div style={{ padding: '20px' }}>
            {/* بطاقة دورة الصباح */}
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sun size={18} style={{ color: '#d97706' }} />
                  <span style={{ fontWeight: '800', fontSize: '13.5px', color: '#92400e' }}>
                    وقت إغلاق الدورة الصباحية
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 'bold' }}>
                  {format12Hour(morningCutoff)}
                </span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: '#78350f' }}>
                الطلبات الواردة من الفروع قبل هذا التوقيت تُدرج تلقائياً في دورة التوريد الصباحية
              </p>
              <input
                type="time"
                value={morningCutoff}
                onChange={(e) => setMorningCutoff(e.target.value)}
                required
                className="outstock-form-input"
                style={{ direction: 'ltr', textAlign: 'center', fontWeight: '900', fontSize: '15px' }}
              />
            </div>

            {/* بطاقة دورة المساء */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Moon size={18} style={{ color: '#475569' }} />
                  <span style={{ fontWeight: '800', fontSize: '13.5px', color: '#1e293b' }}>
                    وقت إغلاق الدورة المسائية
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold' }}>
                  {format12Hour(eveningCutoff)}
                </span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: '#475569' }}>
                الطلبات الواردة بعد الصباح وحتى هذا التوقيت تُدرج في دورة التوريد المسائية
              </p>
              <input
                type="time"
                value={eveningCutoff}
                onChange={(e) => setEveningCutoff(e.target.value)}
                required
                className="outstock-form-input"
                style={{ direction: 'ltr', textAlign: 'center', fontWeight: '900', fontSize: '15px' }}
              />
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              color: '#0f766e',
              background: '#f0fdfa',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #ccfbf1'
            }}>
              <HelpCircle size={15} style={{ flexShrink: 0 }} />
              <span>
                يتم تثبيت هذه المواعيد كأزرار تصفية سريعة بنقرة واحدة في شاشة المشتريات.
              </span>
            </div>
          </div>

          {/* التذييل */}
          <div className="outstock-modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={onClose} className="outstock-btn outstock-btn-secondary" disabled={isSaving}>
              إلغاء
            </button>
            <button type="submit" className="outstock-btn outstock-btn-primary" disabled={isSaving} style={{ fontWeight: '800' }}>
              {isSaving ? (
                <>
                  <Loader2 size={15} className="spinner" />
                  <span>جاري التثبيت...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>حفظ وتثبيت المواعيد</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
