import React, { useState, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Pill,
  Sparkles,
  Building2,
  ShieldCheck,
  AlertCircle,
  Send,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import {
  outstockCreateOrder,
  broadcastOutstockLocalMessage,
  outstockVerifyEmployeeCode
} from '../../../utils/outstockApiClient';
import MedicationAutocompleteInput from './MedicationAutocompleteInput';
import AddMedicationModal from '../common/AddMedicationModal';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';

/**
 * NewBranchStockOrderModal.jsx
 * نافذة تسجيل طلب أدوية/مستحضرات خاصة بالفرع (طلبات الفرع للمخزون)
 * - نفس شاشة طلب عميل جديد مع استبعاد بيانات العميل والأسعار والفواتير
 * - إرسال الطلب مباشرة إلى إدارة المشتريات بدون طباعة فاتورة
 * - تصنيف الصنف لكل بند (دوائي / مستحضرات)
 */
export default function NewBranchStockOrderModal({
  branchId,
  branchName = '',
  orderReceiver = null,
  onClose,
  onOrderCreated
}) {
  const [requestReason, setRequestReason] = useState('نواقص مخزون الصيدلية (عجز رفوف)');
  const [generalNotes, setGeneralNotes] = useState('');
  const [urgencyLevel, setUrgencyLevel] = useState('normal'); // 'normal' | 'urgent'

  const [items, setItems] = useState([
    {
      medicationName: '',
      unitType: 'pack',
      quantity: 1,
      selectedMed: null,
      itemType: 'medication',
      notes: ''
    }
  ]);

  const [senderEmployee, setSenderEmployee] = useState(orderReceiver || null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [inlineCode, setInlineCode] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeError, setCodeError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isAddMedModalOpen, setIsAddMedModalOpen] = useState(false);
  const [addMedTargetIndex, setAddMedTargetIndex] = useState(null);
  const [addMedInitialName, setAddMedInitialName] = useState('');

  const itemInputRefs = useRef([]);

  const handleVerifyInlineCode = async () => {
    const clean = String(inlineCode || '').trim();
    if (!clean) {
      setCodeError('يرجى إدخال كود الموظف');
      return;
    }
    setIsVerifyingCode(true);
    setCodeError('');
    try {
      const res = await outstockVerifyEmployeeCode(clean);
      if (res?.success && res.employee) {
        setSenderEmployee(res.employee);
        setInlineCode('');
      } else {
        setCodeError(res?.error || 'كود الموظف غير مسجل');
      }
    } catch (err) {
      setCodeError(err.message || 'خطأ في التحقق من كود الموظف');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleAddItem = () => {
    const newIdx = items.length;
    setItems((prev) => [
      ...prev,
      {
        medicationName: '',
        unitType: 'pack',
        quantity: 1,
        selectedMed: null,
        itemType: 'medication',
        notes: ''
      }
    ]);
    setTimeout(() => {
      if (itemInputRefs.current[newIdx]) {
        itemInputRefs.current[newIdx].focus();
      }
    }, 60);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleMedicationSelect = (index, displayName, medObj) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        medicationName: displayName,
        selectedMed: medObj
      };
      return next;
    });
  };

  const handleOpenAddMedModal = (index, typedText) => {
    setAddMedTargetIndex(index);
    setAddMedInitialName(typedText || '');
    setIsAddMedModalOpen(true);
  };

  const handleMedicationAdded = (newMed) => {
    if (addMedTargetIndex !== null && newMed) {
      handleMedicationSelect(addMedTargetIndex, newMed.medication_name || newMed.name, newMed);
    }
    setIsAddMedModalOpen(false);
    setAddMedTargetIndex(null);
    setAddMedInitialName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const validItems = items.filter((it) => it.medicationName && String(it.medicationName).trim().length > 0);
    if (validItems.length === 0) {
      setErrorMsg('يرجى إدخال اسم صنف واحد على الأقل في طلب الفرع');
      return;
    }

    if (!senderEmployee || !senderEmployee.code) {
      setErrorMsg('⚠️ يرجى إدخال وتأكيد كود الموظف مرسل الطلب أولاً قبل الإرسال');
      return;
    }

    const hasCosmetics = validItems.some((it) => it.itemType === 'cosmetics');
    const hasMeds = validItems.some((it) => (it.itemType || 'medication') === 'medication');
    const computedCategory = hasCosmetics && hasMeds ? 'mixed' : (hasCosmetics ? 'cosmetics' : 'medication');

    setIsSubmitting(true);
    try {
      const payload = {
        branchId,
        orderType: 'branch',
        orderCategory: computedCategory,
        orderReceiverCode: senderEmployee.code,
        orderReceiverName: senderEmployee.name || 'صيدلي الفرع',
        branchRequestReason: requestReason,
        customerNotes: [urgencyLevel === 'urgent' ? '⚡ طلب عاجل جداً' : '', generalNotes].filter(Boolean).join(' - '),
        items: validItems.map((it) => ({
          medicationName: String(it.medicationName).trim(),
          unitType: 'pack',
          quantity: parseInt(it.quantity || 1, 10),
          unitPrice: 0,
          itemType: it.itemType || 'medication',
          notes: it.notes || null
        }))
      };

      const res = await outstockCreateOrder(payload);
      if (res?.success && res.order) {
        try {
          broadcastOutstockLocalMessage({
            type: 'outstock:order_created',
            orderId: res.order.id,
            branchId: payload.branchId,
            orderType: 'branch',
            timestamp: new Date().toISOString()
          });
          window.dispatchEvent(new CustomEvent('outstock:order_created', { detail: res.order }));
        } catch (_) {}

        if (onOrderCreated) {
          onOrderCreated(res.order);
        }
        onClose();
      } else {
        setErrorMsg(res?.error || 'حدث خطأ أثناء إرسال طلب الفرع، يرجى المحاولة ثانية');
      }
    } catch (err) {
      console.error('Error creating branch stock order:', err);
      setErrorMsg(err.message || 'فشل الاتصال بالخادم لإرسال طلب الفرع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(5px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="outstock-modal-card"
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          direction: 'rtl'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '2px solid #334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)'
              }}
            >
              <Building2 size={24} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>طلب بضاعة / نواقص خاصة بالفرع</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '800',
                    background: 'rgba(59, 130, 246, 0.25)',
                    color: '#93c5fd',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(147, 197, 253, 0.3)'
                  }}
                >
                  مخزون الفرع الداخلي 🏢
                </span>
              </h2>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                طلب أدوية ومستحضرات لسد عجز الفرع - يتم الإرسال للمشتريات مباشرة دون أسعار أو فواتير عملاء
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '10px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النافذة */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#991b1b',
                fontSize: '13px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}
            >
              <AlertCircle size={18} color="#ef4444" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* شريط معلومات الفرع والمحرر مرسل الطلب */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={16} color="#0284c7" />
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>
                الفرع الطالب: <strong style={{ color: '#0369a1' }}>{branchName || `فرع #${branchId}`}</strong>
              </span>
            </div>

            {senderEmployee ? (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '10px',
                  padding: '6px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ShieldCheck size={16} color="#16a34a" />
                <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: '800' }}>
                  الموظف مرسل الطلب: <strong>{senderEmployee.name}</strong> (كود: {senderEmployee.code} 🔒)
                </span>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  style={{
                    background: '#e0f2fe',
                    border: '1px solid #bae6fd',
                    borderRadius: '6px',
                    color: '#0369a1',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  تغيير
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <input
                  type="password"
                  placeholder="أدخل كود الموظف مرسل الطلب..."
                  value={inlineCode}
                  onChange={(e) => setInlineCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleVerifyInlineCode();
                    }
                  }}
                  className="outstock-form-input"
                  style={{ height: '32px', width: '190px', fontSize: '12px' }}
                />
                <button
                  type="button"
                  onClick={handleVerifyInlineCode}
                  disabled={isVerifyingCode}
                  className="outstock-btn outstock-btn-primary"
                  style={{ padding: '5px 12px', fontSize: '11.5px', height: '32px', fontWeight: '800' }}
                >
                  {isVerifyingCode ? 'جاري التحقق...' : 'تأكيد الكود 🔒'}
                </button>
                {codeError && (
                  <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: '800' }}>{codeError}</span>
                )}
              </div>
            )}
          </div>

          {/* بيانات الطلب الإدارية */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 1fr',
              gap: '14px',
              marginBottom: '20px'
            }}
          >
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                سبب / غرض الطلب:
              </label>
              <select
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                className="outstock-form-select"
                style={{ fontWeight: '700' }}
              >
                <option value="نواقص مخزون الصيدلية (عجز رفوف)">نواقص مخزون الصيدلية (عجز رفوف)</option>
                <option value="تأمين كميات لأدوية موسمية مطلوبة">تأمين كميات لأدوية موسمية مطلوبة</option>
                <option value="طلب خاص لعملاء مترددين بانتظام">طلب خاص لعملاء مترددين بانتظام</option>
                <option value="أخرى / طلب مخزني إداري">أخرى / طلب مخزني إداري</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                مستوى الاستعجال:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setUrgencyLevel('normal')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    border: urgencyLevel === 'normal' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: urgencyLevel === 'normal' ? '#e0f2fe' : '#ffffff',
                    color: urgencyLevel === 'normal' ? '#0369a1' : '#64748b'
                  }}
                >
                  عادي 📦
                </button>
                <button
                  type="button"
                  onClick={() => setUrgencyLevel('urgent')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    border: urgencyLevel === 'urgent' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                    background: urgencyLevel === 'urgent' ? '#fee2e2' : '#ffffff',
                    color: urgencyLevel === 'urgent' ? '#991b1b' : '#64748b'
                  }}
                >
                  ⚡ عاجل جداً
                </button>
              </div>
            </div>
          </div>

          {/* قائمة الأصناف المطلوبة للفرع */}
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pill size={18} color="#0284c7" />
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#1e293b' }}>
                  الأصناف المطلوبة للفرع ({items.length})
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontWeight: '800'
                  }}
                >
                  📦 الطلب بالعلبة كاملة
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="outstock-btn outstock-btn-secondary"
                style={{ fontSize: '12.5px', padding: '6px 14px', fontWeight: '800' }}
              >
                <Plus size={15} />
                <span>إضافة صنف آخر</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map((it, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '14px',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                    position: 'relative',
                    zIndex: items.length - idx
                  }}
                >
                  {/* رأس بند الصنف مع تصنيف (دوائي / مستحضرات) */}
                  <div style={{ width: '100%', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                        <Pill size={14} />
                        <span>اسم الصنف / المستحضر * :</span>
                      </label>
                      <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '2px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <button
                          type="button"
                          onClick={() => handleItemChange(idx, 'itemType', 'medication')}
                          style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: (it.itemType || 'medication') === 'medication' ? '#059669' : 'transparent',
                            color: (it.itemType || 'medication') === 'medication' ? '#ffffff' : '#64748b',
                            boxShadow: (it.itemType || 'medication') === 'medication' ? '0 1px 3px rgba(5, 150, 105, 0.3)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Pill size={12} />
                          <span>💊 دواء</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleItemChange(idx, 'itemType', 'cosmetics')}
                          style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: it.itemType === 'cosmetics' ? '#db2777' : 'transparent',
                            color: it.itemType === 'cosmetics' ? '#ffffff' : '#64748b',
                            boxShadow: it.itemType === 'cosmetics' ? '0 1px 3px rgba(219, 39, 119, 0.3)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Sparkles size={12} />
                          <span>💄 مستحضرات</span>
                        </button>
                      </div>
                    </div>
                    <MedicationAutocompleteInput
                      inputRef={(el) => (itemInputRefs.current[idx] = el)}
                      value={it.medicationName}
                      unitType="pack"
                      selectedMed={it.selectedMed}
                      onMedicationSelect={(displayName, medObj) => handleMedicationSelect(idx, displayName, medObj)}
                      onTextChange={(text) => handleItemChange(idx, 'medicationName', text)}
                      onAddNewMedication={(typedText) => handleOpenAddMedModal(idx, typedText)}
                      placeholder="ابحث باسم الدواء، المادة الفعالة، أو الباركود..."
                      required
                    />
                  </div>

                  {/* تفاصيل الكمية والملاحظات وزر الحذف */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 140px 1fr auto',
                      gap: '10px',
                      alignItems: 'end'
                    }}
                  >
                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                        الوحدة
                      </label>
                      <div
                        style={{
                          height: '38px',
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '800',
                          fontSize: '12px',
                          color: '#0369a1'
                        }}
                      >
                        علبة كاملة 📦
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                        الكمية المطلوبة * :
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="outstock-form-input"
                        style={{ height: '38px', textAlign: 'center', fontWeight: 'bold' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                        ملاحظة إضافية للصنف (اختياري):
                      </label>
                      <input
                        type="text"
                        placeholder="مثل: يفضل تشغيلة حديثة / شركة محددة..."
                        value={it.notes}
                        onChange={(e) => handleItemChange(idx, 'notes', e.target.value)}
                        className="outstock-form-input"
                        style={{ height: '38px', fontSize: '12px' }}
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length === 1}
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '8px',
                          border: '1px solid #fecaca',
                          background: '#fef2f2',
                          cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                          opacity: items.length === 1 ? 0.35 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="حذف هذا الصنف"
                      >
                        <Trash2 size={16} color="#ef4444" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ملاحظات عامة للطلب */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
              ملاحظات عامة لقسم المشتريات:
            </label>
            <textarea
              rows={2}
              placeholder="أي تفاصيل أو توجيهات إضافية تود إبلاغ إدارة المشتريات بها بخصوص هذا الطلب..."
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              className="outstock-form-input"
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* تذييل النافذة والأزرار */}
          <div
            style={{
              paddingTop: '16px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px' }}>
              <CheckCircle2 size={15} color="#10b981" />
              <span>سيتم توجيه الأصناف فورياً لمسؤولي الأدوية ومستحضرات التجميل بالمشتريات</span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                className="outstock-btn outstock-btn-secondary"
                style={{ padding: '9px 18px' }}
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="outstock-btn outstock-btn-primary"
                style={{
                  padding: '9px 24px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  fontWeight: '800',
                  gap: '8px'
                }}
              >
                <Send size={16} />
                <span>{isSubmitting ? 'جارٍ الإرسال...' : 'إرسال طلب الفرع للمشتريات 🚀'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {isAddMedModalOpen && (
        <AddMedicationModal
          initialName={addMedInitialName}
          onClose={() => {
            setIsAddMedModalOpen(false);
            setAddMedTargetIndex(null);
            setAddMedInitialName('');
          }}
          onMedicationAdded={handleMedicationAdded}
        />
      )}

      {/* نافذة التحقق من كود الموظف مرسل الطلب */}
      {isAuthModalOpen && (
        <EmployeeCodeAuthModal
          isOpen={isAuthModalOpen}
          title="التحقق من كود الموظف مرسل الطلب 🔒"
          subtitle="يرجى إدخال كود الموظف المسجل بنظام الموارد البشرية لتوثيق إرسال طلب بضاعة الفرع"
          actionLabel="تأكيد الكود والمتابعة"
          branchId={branchId}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={(emp) => {
            setSenderEmployee(emp);
            setIsAuthModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
