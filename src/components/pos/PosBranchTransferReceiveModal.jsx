import React, { useState, useRef, useEffect } from 'react';
import {
  stockGetTransferByCode,
  stockReceiveTransferByCode
} from '../../utils/stockApiClient';
import { printThermalLabels } from '../../utils/labelPrintService';
import {
  Truck,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Printer,
  X,
  Search,
  Scan,
  PackageCheck,
  Tag,
  ArrowRight
} from 'lucide-react';

export default function PosBranchTransferReceiveModal({
  isOpen,
  onClose,
  currentBranch = null,
  showToast = () => {},
  onReceiveSuccess = () => {}
}) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [transferData, setTransferData] = useState(null);
  const [items, setItems] = useState([]);
  const [step, setStep] = useState('input'); // 'input', 'review', 'completed'
  const [receivedLabels, setReceivedLabels] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setTransferData(null);
      setItems([]);
      setStep('input');
      setReceivedLabels([]);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLookupTransfer = async (e) => {
    if (e) e.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode) {
      showToast('يرجى إدخال أو مسح كود التحويل', 'warning');
      return;
    }

    try {
      setIsLoading(true);
      const res = await stockGetTransferByCode(cleanCode);
      if (res?.success && res.transfer) {
        setTransferData(res.transfer);
        setItems(res.items || []);
        setStep('review');
      } else {
        showToast(res?.error || 'لم يتم العثور على أمر تحويل مطابق', 'error');
      }
    } catch (err) {
      showToast(err.message || 'فشل التحقق من كود التحويل', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReceive = async () => {
    if (!transferData) return;

    try {
      setIsReceiving(true);
      const payload = {
        verification_code: transferData.verification_code || code.trim(),
        received_items: items.map(it => ({
          item_id: it.id,
          quantity_received: parseFloat(it.quantity_dispatched || it.quantity_requested || 0),
          quantity_damaged: 0
        }))
      };

      const res = await stockReceiveTransferByCode(payload);
      if (res?.success) {
        showToast(res.message || 'تم استلام الشحنة وتحديث رصيد الفرع بنجاح!', 'success');
        setReceivedLabels(res.printableLabels || []);
        setStep('completed');
        onReceiveSuccess?.();
      } else {
        showToast(res?.error || 'فشل استلام الشحنة', 'error');
      }
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء تأكيد الاستلام', 'error');
    } finally {
      setIsReceiving(false);
    }
  };

  const handlePrintAllLabels = () => {
    if (!receivedLabels || receivedLabels.length === 0) {
      showToast('لا توجد ملصقات متاحة للطباعة', 'warning');
      return;
    }

    printThermalLabels(receivedLabels);
    showToast(`جاري طباعة ملصقات الباركود لـ ${receivedLabels.length} صنف مستلم... 🏷️🖨️`, 'success');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      direction: 'rtl',
      fontFamily: "'Cairo', Tahoma, sans-serif"
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: step === 'review' ? '780px' : '540px',
        boxShadow: '0 25px 35px -5px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        transition: 'all 0.3s ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: '#0f766e',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackageCheck size={22} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
              استلام طلبيات وتحويلات المخزن المركزي
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px' }}>
          {/* ── STEP 1: Input Code / Scan ── */}
          {step === 'input' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: '#f0fdfa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  color: '#0f766e'
                }}>
                  <KeyRound size={28} />
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  أدخل كود التحويل أو امسح الباركود
                </h4>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                  الكود السري مطبوع أعلى فاتورة التحويل الرسمية المرفقة مع السائق (مثال: TRF-820491)
                </p>
              </div>

              <form onSubmit={handleLookupTransfer}>
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="TRF-XXXXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: '2px solid #0f766e',
                      fontSize: '18px',
                      fontWeight: 800,
                      textAlign: 'center',
                      letterSpacing: '2px',
                      color: '#0f766e',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    autoFocus
                  />
                  <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                    <Scan size={20} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      flex: 1,
                      padding: '11px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !code.trim()}
                    style={{
                      flex: 2,
                      padding: '11px',
                      borderRadius: '10px',
                      border: 'none',
                      background: '#0f766e',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: isLoading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {isLoading ? 'جاري التحقق...' : 'فحص إذن التحويل'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── STEP 2: Review Items ── */}
          {step === 'review' && transferData && (
            <div>
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '10px',
                fontSize: '12px'
              }}>
                <div>
                  <div style={{ color: '#64748b' }}>رقم الإذن:</div>
                  <strong style={{ color: '#0f172a' }}>{transferData.transfer_number}</strong>
                </div>
                <div>
                  <div style={{ color: '#64748b' }}>المصدر:</div>
                  <strong style={{ color: '#0f766e' }}>{transferData.source_name || 'المخزن الرئيسي'}</strong>
                </div>
                <div>
                  <div style={{ color: '#64748b' }}>السائق / المندوب:</div>
                  <strong>{transferData.driver_name || 'مندوب النقل'}</strong>
                </div>
                <div>
                  <div style={{ color: '#64748b' }}>الحالة الحالية:</div>
                  <span style={{ color: '#d97706', fontWeight: 800 }}>🚚 قيد النقل بالطريق</span>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '8px', textAlign: 'center', width: '30px' }}>#</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>اسم الدواء</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>التشغيلة</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>الصلاحية</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>الكمية المشحونة</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>السعر الرسمي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.trade_name_ar || it.medication_name}</div>
                          {it.trade_name_en && <div style={{ fontSize: '10px', color: '#64748b' }}>{it.trade_name_en}</div>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>{it.batch_number || 'B-STOCK'}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#0f766e', fontWeight: 800 }}>{it.expiry_date ? String(it.expiry_date).slice(0, 7) : '-'}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 900, color: '#047857', fontSize: '13px' }}>
                          {it.quantity_dispatched || it.quantity_requested || 1} علبة
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700 }}>{parseFloat(it.public_price || 0).toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  رجوع
                </button>

                <button
                  type="button"
                  onClick={handleConfirmReceive}
                  disabled={isReceiving}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#047857',
                    color: '#fff',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: isReceiving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 6px -1px rgba(4,120,87,0.25)'
                  }}
                >
                  <CheckCircle2 size={18} />
                  {isReceiving ? 'جاري ترحيل الأرصدة للفرع...' : 'تأكيد الاستلام وإضافة البضاعة للرصيد'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Completed & Print Prompt ── */}
          {step === 'completed' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#ecfdf5',
                color: '#047857',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <CheckCircle2 size={36} />
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                تم استلام الشحنة وتحديث رصيد الفرع بنجاح! 📦🎉
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#64748b' }}>
                أصبحت الأدوية الآن متاحة للبيع الفوري في شاشة الكاشير وفق قاعدة FEFO الأقرب انتهاءً أولاً.
              </p>

              {/* Prompt to Print Labels */}
              <div style={{
                background: '#f0fdfa',
                border: '1.5px dashed #0f766e',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', color: '#0f766e' }}>
                  <Tag size={20} />
                  <strong style={{ fontSize: '15px' }}>هل ترغب في طباعة ملصقات الباركود للأصناف المستلمة؟</strong>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#475569' }}>
                  تحتوي الملصقات على اسم الدواء، تاريخ الصلاحية، رقم التشغيلة، وكود المورد (PharmaFly) للصقها على العلب مباشرة قبل رصها على الأرفف.
                </p>

                <button
                  type="button"
                  onClick={handlePrintAllLabels}
                  style={{
                    background: '#0f766e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 10px rgba(15,118,110,0.3)'
                  }}
                >
                  <Printer size={18} />
                  طباعة ملصقات الباركود لجميع الأصناف ({receivedLabels.reduce((acc, it) => acc + (it.quantity || 1), 0)} ملصق)
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 24px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                إغلاق والعودة لنقاط البيع
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

