import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, UserCheck, UserPlus, Pill, DollarSign, Calendar, Clock, Printer } from 'lucide-react';
import { outstockGetCustomers, outstockCreateOrder } from '../../../utils/outstockApiClient';

/**
 * NewCustomerOrderModal.jsx
 * نافذة تسجيل طلب عميل جديد مع بحث ذكي بالهاتف/الاسم وإضافة متعددة للأصناف
 */
export default function NewCustomerOrderModal({ branchId, defaultPharmacist = '', onClose, onOrderCreated }) {
  // ── 1. حالة العميل ──
  const [searchPhone, setSearchPhone] = useState('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  // حقول العميل الجديد
  const [customerName, setCustomerName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [landlinePhone, setLandlinePhone] = useState('');
  const [address, setAddress] = useState('');

  // ── 2. بنود الأدوية ──
  const [items, setItems] = useState([
    { medicationName: '', unitType: 'pack', quantity: 1, unitPrice: '' }
  ]);

  // ── 3. الحسابات المالية وموعد الاستلام ──
  const [paidAmount, setPaidAmount] = useState('');
  const [discountType, setDiscountType] = useState('none'); // 'none' | 'amount' | 'percentage'
  const [discountValue, setDiscountValue] = useState('');
  const [expectedPickupDate, setExpectedPickupDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [expectedPickupTime, setExpectedPickupTime] = useState('مساءً (بعد 5:00 عصراً)');
  const [responsiblePharmacist, setResponsiblePharmacist] = useState(defaultPharmacist || 'د. صيدلي النوبية');
  const [customerNotes, setCustomerNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // بحث ذكي عن العميل عند كتابة رقم الهاتف أو الاسم
  const handleSearchCustomer = async (term) => {
    const clean = String(term || '').trim();
    if (!clean || clean.length < 3) return;

    setIsSearchingCustomer(true);
    setErrorMsg('');
    try {
      const res = await outstockGetCustomers({ search: clean });
      if (res?.success && Array.isArray(res.customers) && res.customers.length > 0) {
        const found = res.customers[0];
        setSelectedCustomer(found);
        setCustomerName(found.full_name);
        setWhatsappPhone(found.whatsapp_phone);
        setLandlinePhone(found.landline_phone || '');
        setAddress(found.address || '');
        setIsNewCustomer(false);
      } else {
        setSelectedCustomer(null);
        setIsNewCustomer(true);
        // إذا كان المدخل رقماً، نضعه تلقائياً في خانة الواتساب
        if (/^\d+$/.test(clean)) {
          setWhatsappPhone(clean);
        } else {
          setCustomerName(clean);
        }
      }
    } catch (e) {
      console.warn('Search customer error:', e);
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  // التحكم في قائمة الأصناف
  const handleAddItem = () => {
    setItems(prev => [...prev, { medicationName: '', unitType: 'pack', quantity: 1, unitPrice: '' }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // احتساب الإجماليات
  const totalAmount = items.reduce((sum, it) => {
    const qty = parseInt(it.quantity || 1, 10);
    const price = parseFloat(it.unitPrice || 0);
    return sum + (qty * price);
  }, 0);

  const discVal = parseFloat(discountValue || 0);
  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = (totalAmount * discVal) / 100;
  } else if (discountType === 'amount') {
    discountAmount = discVal;
  }

  const netAmount = Math.max(0, totalAmount - discountAmount);
  const paid = parseFloat(paidAmount || 0);
  const remainingAmount = Math.max(0, netAmount - paid);

  // حفظ وإرسال الطلب
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // تحقق من بيانات العميل
    const finalName = String(customerName || '').trim();
    const finalPhone = String(whatsappPhone || '').replace(/\D/g, '');

    if (!finalName) {
      setErrorMsg('يرجى إدخال اسم العميل');
      return;
    }
    if (!finalPhone || finalPhone.length < 9) {
      setErrorMsg('يرجى إدخال رقم هاتف واتساب صالح للعميل (9 أرقام على الأقل)');
      return;
    }

    // تحقق من الأصناف
    const validItems = items.filter(it => it.medicationName && String(it.medicationName).trim().length > 0);
    if (validItems.length === 0) {
      setErrorMsg('يرجى إدخال اسم دواء واحد على الأقل في الطلب');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        branchId,
        customer: {
          id: selectedCustomer?.id || null,
          fullName: finalName,
          whatsappPhone: finalPhone,
          landlinePhone: landlinePhone ? String(landlinePhone).trim() : null,
          address: address ? String(address).trim() : null
        },
        items: validItems.map(it => ({
          medicationName: String(it.medicationName).trim(),
          unitType: it.unitType || 'pack',
          quantity: parseInt(it.quantity || 1, 10),
          unitPrice: parseFloat(it.unitPrice || 0)
        })),
        paidAmount: paid,
        discountType,
        discountValue: discVal,
        expectedPickupDate,
        expectedPickupTime,
        responsiblePharmacist,
        customerNotes
      };

      const res = await outstockCreateOrder(payload);
      if (res?.success && res.order) {
        onOrderCreated(res.order);
      } else {
        setErrorMsg(res?.error || 'حدث خطأ أثناء حفظ الطلب، يرجى المحاولة ثانية');
      }
    } catch (err) {
      setErrorMsg('تعذر حفظ الطلب، تحقق من الاتصال بالخادم');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="outstock-modal-backdrop" onClick={onClose}>
      <div
        className="outstock-modal-panel modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="outstock-modal-drag-handle" />

        <div className="outstock-modal-header">
          <h3>
            <span>📦 تسجيل طلب عميل جديد (نواقص أدوية)</span>
          </h3>
          <button className="outstock-modal-close" onClick={onClose} title="إغلاق">
            <X size={19} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="outstock-modal-body">
            {errorMsg && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#b91c1c',
                fontSize: '13px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>⚠️ {errorMsg}</span>
              </div>
            )}

            {/* ── 1. قسم بيانات العميل والبحث الذكي ── */}
            <div style={{
              background: '#f0fdfa',
              border: '1.5px solid #ccfbf1',
              borderRadius: '16px',
              padding: '14px 16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: '900', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Search size={16} />
                  <span>بيانات العميل (بحث ذكي بالهاتف أو الاسم)</span>
                </span>
                {selectedCustomer ? (
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: '800', background: '#dcfce7', padding: '3px 9px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    <UserCheck size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> عميل مسجل ({selectedCustomer.customer_code})
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#0284c7', fontWeight: '800', background: '#e0f2fe', padding: '3px 9px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <UserPlus size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> تسجيل عميل جديد
                  </span>
                )}
              </div>

              {/* مربع البحث السريع */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="ابحث برقم هاتف الواتساب أو اسم العميل..."
                  value={searchPhone}
                  onChange={(e) => {
                    setSearchPhone(e.target.value);
                    handleSearchCustomer(e.target.value);
                  }}
                  className="outstock-form-input"
                  style={{ flex: 1, borderColor: '#0d9488' }}
                />
                <button
                  type="button"
                  onClick={() => handleSearchCustomer(searchPhone)}
                  className="outstock-btn outstock-btn-primary"
                  style={{ padding: '0 16px', flexShrink: 0 }}
                >
                  <Search size={16} />
                  <span style={{ display: 'inline' }}>{isSearchingCustomer ? '...' : 'بحث'}</span>
                </button>
              </div>

              {/* حقول بيانات العميل */}
              <div className="outstock-form-row">
                <div className="outstock-form-group">
                  <label>اسم العميل *</label>
                  <input
                    type="text"
                    required
                    placeholder="الاسم ثلاثي أو ثنائي"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>

                <div className="outstock-form-group">
                  <label>رقم هاتف الواتساب (فريد) *</label>
                  <input
                    type="tel"
                    required
                    placeholder="01xxxxxxxxx"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              <div className="outstock-form-row" style={{ marginTop: '10px' }}>
                <div className="outstock-form-group">
                  <label>رقم الهاتف الأرضي (إن وجد)</label>
                  <input
                    type="tel"
                    placeholder="رقم الهاتف الأرضي"
                    value={landlinePhone}
                    onChange={(e) => setLandlinePhone(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>

                <div className="outstock-form-group">
                  <label>عنوان السكن</label>
                  <input
                    type="text"
                    placeholder="المنطقة، الشارع، رقم العمارة"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>
              </div>
            </div>

            {/* ── 2. قسم بنود الأدوية (Responsive Medicine Cards) ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Pill size={16} color="#0d9488" />
                  <span>الأدوية المطلوبة في هذا الطلب ({items.length})</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="outstock-btn outstock-btn-secondary"
                  style={{ fontSize: '12.5px', padding: '6px 14px' }}
                >
                  <Plus size={15} />
                  <span>إضافة دواء آخر</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {items.map((it, idx) => (
                  <div key={idx} className="outstock-med-item-card">
                    <div className="outstock-med-top-line">
                      <span style={{ color: '#0d9488', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <Pill size={16} />
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="اسم الدواء والتركيز (مثل: أوجمنتين 1 جم)..."
                        value={it.medicationName}
                        onChange={(e) => handleItemChange(idx, 'medicationName', e.target.value)}
                        className="outstock-form-input"
                        style={{ flex: 1, minHeight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length === 1}
                        className="outstock-modal-close"
                        style={{
                          width: '36px',
                          height: '36px',
                          opacity: items.length === 1 ? 0.35 : 1,
                          cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                          flexShrink: 0
                        }}
                        title="حذف هذا الصنف"
                      >
                        <Trash2 size={16} color={items.length === 1 ? '#94a3b8' : '#ef4444'} />
                      </button>
                    </div>

                    <div className="outstock-med-sub-grid">
                      <div>
                        <select
                          value={it.unitType}
                          onChange={(e) => handleItemChange(idx, 'unitType', e.target.value)}
                          className="outstock-form-select"
                          style={{ minHeight: '40px', fontSize: '13px' }}
                        >
                          <option value="pack">علبة كاملة 📦</option>
                          <option value="strip">شريط 💊</option>
                        </select>
                      </div>

                      <div>
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="الكمية"
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="outstock-form-input"
                          style={{ minHeight: '40px', textAlign: 'center', fontWeight: 'bold' }}
                        />
                      </div>

                      <div>
                        <input
                          type="number"
                          step="0.5"
                          placeholder="السعر (ج.م)"
                          value={it.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                          className="outstock-form-input"
                          style={{ minHeight: '40px', textAlign: 'center', fontWeight: 'bold' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 3. الحسابات المالية (العربون والمتبقي والخصم) ── */}
            <div style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '16px',
              padding: '14px 16px'
            }}>
              <div style={{ fontSize: '13.5px', fontWeight: '900', color: '#334155', marginBottom: '10px' }}>
                💰 الحساب المالي والعربون
              </div>

              <div className="outstock-form-row">
                <div className="outstock-form-group">
                  <label>المبلغ المدفوع (عربون العميل)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="0.00"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="outstock-form-input"
                    style={{ fontWeight: 'bold', color: '#059669', fontSize: '15px' }}
                  />
                </div>

                <div className="outstock-form-group">
                  <label>نوع الخصم (إن وجد)</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="outstock-form-select"
                  >
                    <option value="none">بدون خصم</option>
                    <option value="amount">مبلغ ثابت (ج.م)</option>
                    <option value="percentage">نسبة مئوية (%)</option>
                  </select>
                </div>

                {discountType !== 'none' && (
                  <div className="outstock-form-group">
                    <label>قيمة الخصم</label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="القيمة"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="outstock-form-input"
                    />
                  </div>
                )}
              </div>

              {/* ملخص المبالغ الفوري - بطاقات متجاوبة */}
              <div className="outstock-financial-summary-grid">
                <div className="outstock-summary-kpi">
                  <span className="kpi-label">إجمالي الأصناف</span>
                  <span className="kpi-val">{totalAmount.toFixed(2)} ج.م</span>
                </div>
                <div className="outstock-summary-kpi">
                  <span className="kpi-label">الصافي بعد الخصم</span>
                  <span className="kpi-val">{netAmount.toFixed(2)} ج.م</span>
                </div>
                <div className="outstock-summary-kpi green">
                  <span className="kpi-label">المدفوع (عربون)</span>
                  <span className="kpi-val">{paid.toFixed(2)} ج.م</span>
                </div>
                <div className="outstock-summary-kpi red highlight-red">
                  <span className="kpi-label">المتبقي عند الاستلام</span>
                  <span className="kpi-val">{remainingAmount.toFixed(2)} ج.م</span>
                </div>
              </div>
            </div>

            {/* ── 4. موعد الاستلام وملاحظات الصيدلي ── */}
            <div className="outstock-form-row">
              <div className="outstock-form-group">
                <label>تاريخ الاستلام المتوقع</label>
                <input
                  type="date"
                  value={expectedPickupDate}
                  onChange={(e) => setExpectedPickupDate(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-group">
                <label>فترة / وقت الاستلام</label>
                <input
                  type="text"
                  placeholder="مثلاً: بعد العصر أو الساعة 7:00 م"
                  value={expectedPickupTime}
                  onChange={(e) => setExpectedPickupTime(e.target.value)}
                  className="outstock-form-input"
                />
              </div>
            </div>

            <div className="outstock-form-row">
              <div className="outstock-form-group">
                <label>اسم الصيدلي المسؤول *</label>
                <input
                  type="text"
                  required
                  placeholder="اسم الصيدلي متلقي الطلب"
                  value={responsiblePharmacist}
                  onChange={(e) => setResponsiblePharmacist(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-group">
                <label>ملاحظات العميل أو الطلب</label>
                <input
                  type="text"
                  placeholder="أي توصيات خاصة بالجرعة أو الشركة المفضلة"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  className="outstock-form-input"
                />
              </div>
            </div>
          </div>

          <div className="outstock-modal-footer">
            <button type="button" className="outstock-btn outstock-btn-secondary" onClick={onClose}>
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="outstock-btn outstock-btn-primary"
            >
              <span>{isSubmitting ? 'جاري الإرسال...' : 'حفظ وإرسال للمشتريات وطباعة الإيصال 🖨️'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
