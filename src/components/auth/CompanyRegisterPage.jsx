import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  User,
  Phone,
  Mail,
  Lock,
  Layers,
  CheckCircle2,
  TicketPercent,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Send,
  HelpCircle
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/apiClient';

export default function CompanyRegisterPage({ onLoginSuccess, onBackToLogin, showToast }) {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    company_name: '',
    company_code: '',
    phone: '',
    email: '',
    owner_name: '',
    owner_username: '',
    owner_password: '',
    plan_id: 'pro',
    selected_modules: ['dashboard', 'branches', 'biometrics', 'payroll', 'requests', 'income_expenses', 'whatsapp_center'],
    discount_code: '',
    payment_method: 'instapay',
    payment_proof_url: ''
  });

  const [modules, setModules] = useState([]);
  const [plans, setPlans] = useState([]);
  const [discountInfo, setDiscountInfo] = useState(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [discountError, setDiscountError] = useState('');

  // Fetch catalog & plans
  useEffect(() => {
    fetch(`${API_BASE_URL}/developer/modules`)
      .then(r => r.json())
      .then(d => { if (d.modules) setModules(d.modules); })
      .catch(() => {});

    fetch(`${API_BASE_URL}/developer/plans`)
      .then(r => r.json())
      .then(d => { if (d.plans) setPlans(d.plans); })
      .catch(() => {});
  }, []);

  // Calculate Base Price
  const baseMonthlyPrice = useMemo(() => {
    if (formData.plan_id !== 'custom') {
      const p = plans.find(item => item.id === formData.plan_id);
      if (p) return parseFloat(p.base_price) || 0;
    }
    // Custom calculation by pages
    return formData.selected_modules.reduce((sum, modId) => {
      const m = modules.find(item => item.module_id === modId);
      return sum + (m ? parseFloat(m.price_monthly) || 0 : 0);
    }, 0);
  }, [formData.plan_id, formData.selected_modules, plans, modules]);

  // Calculate Discount
  const calculatedDiscount = useMemo(() => {
    if (!discountInfo) return 0;
    let disc = 0;
    if (discountInfo.discount_type === 'percentage') {
      disc = (baseMonthlyPrice * (parseFloat(discountInfo.discount_value) || 0)) / 100;
    } else {
      disc = parseFloat(discountInfo.discount_value) || 0;
    }
    return Math.min(disc, baseMonthlyPrice);
  }, [discountInfo, baseMonthlyPrice]);

  const netMonthlyPrice = Math.max(0, baseMonthlyPrice - calculatedDiscount);

  // Handle plan select
  const handleSelectPlan = (plan) => {
    if (plan.id === 'custom') {
      setFormData(prev => ({ ...prev, plan_id: 'custom' }));
    } else {
      setFormData(prev => ({
        ...prev,
        plan_id: plan.id,
        selected_modules: plan.included_modules || []
      }));
    }
  };

  // Toggle module with Dependency Engine
  const handleToggleModule = (mod) => {
    const isSelected = formData.selected_modules.includes(mod.module_id);
    let newSelection = [];

    if (isSelected) {
      if (mod.is_core) {
        showToast?.('⚠️ هذا الموديول أساسي ولا يمكن إلغاؤه');
        return;
      }
      newSelection = formData.selected_modules.filter(id => id !== mod.module_id);
    } else {
      // Auto-enforce dependencies
      const deps = mod.required_dependencies || [];
      newSelection = Array.from(new Set([...formData.selected_modules, mod.module_id, ...deps]));
      if (deps.length > 0) {
        showToast?.(`💡 تم تفعيل الصفحات المرتبطة تلقائياً: ${deps.join(', ')}`);
      }
    }

    setFormData(prev => ({ ...prev, plan_id: 'custom', selected_modules: newSelection }));
  };

  // Validate Discount Code
  const handleValidateDiscountCode = async () => {
    if (!formData.discount_code.trim()) return;
    setIsValidatingCode(true);
    setDiscountError('');
    try {
      const res = await fetch(`${API_BASE_URL}/discounts/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: formData.discount_code, baseAmount: baseMonthlyPrice })
      });
      const data = await res.json();
      if (data.success) {
        setDiscountInfo(data);
        showToast?.('🎉 تم التحقق من الكود وتفعيل الخصم بنجاح!');
      } else {
        setDiscountError(data.error || 'الكود غير صحيح');
        setDiscountInfo(null);
      }
    } catch {
      setDiscountError('تعذر الاتصال للتحقق من الكود');
    } finally {
      setIsValidatingCode(false);
    }
  };

  // Submit Registration
  const handleSubmitRegistration = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          calculated_amount: baseMonthlyPrice
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🎉 تم تسجيل شركتك بنجاح! مرحباً بك في المنظومة.');
        if (data.token) {
          localStorage.setItem('app_auth_token', data.token);
          localStorage.setItem('app_tenant_storage_key', data.storage_key);
          localStorage.setItem('app_tenant_company_id', data.company_id);
          onLoginSuccess?.(data);
        }
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء التسجيل، يرجى مراجعة البيانات');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      background: 'radial-gradient(circle at 10% 20%, #0f172a 0%, #070a12 50%, #020617 100%)',
      color: '#f8fafc',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      direction: 'rtl',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 14px',
      boxSizing: 'border-box'
    }}>
      {/* Header Bar */}
      <div style={{ width: '100%', maxWidth: '840px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981 0%, #0284c7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>منصة إدارة الصيدليات السحابية</div>
            <div style={{ fontSize: '12px', color: '#38bdf8' }}>تسجيل منشأة جديدة واختيار الباقة والخصومات</div>
          </div>
        </div>

        <button
          onClick={onBackToLogin}
          style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#fff', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          تسجيل الدخول &larr;
        </button>
      </div>

      {/* Stepper Indicator */}
      <div style={{ width: '100%', maxWidth: '840px', display: 'flex', justifyContent: 'space-between', marginBottom: '28px', position: 'relative' }}>
        {[
          { num: 1, title: 'بيانات الصيدلية والمالك' },
          { num: 2, title: 'اختيار الباقة والشاشات' },
          { num: 3, title: 'كود الخصم والدفع' }
        ].map((s) => (
          <div
            key={s.num}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: step >= s.num ? '#38bdf8' : '#64748b',
              fontWeight: 800,
              fontSize: '13.5px'
            }}
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: step >= s.num ? '#38bdf8' : 'rgba(255,255,255,0.1)',
              color: step >= s.num ? '#090d16' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900
            }}>
              {s.num}
            </div>
            <span>{s.title}</span>
          </div>
        ))}
      </div>

      {/* Wizard Card Container */}
      <div style={{
        width: '100%',
        maxWidth: '840px',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '30px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        boxSizing: 'border-box'
      }}>
        {/* STEP 1: COMPANY & OWNER PROFILE */}
        {step === 1 && (
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 900 }}>بيانات المنشأة وحساب المالك</h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8' }}>
              سيتم إنشاء حساب مالك الشركة الذي يمتلك الصلاحية الكاملة لتعيين الإدارة العليا ومديري الفروع
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#cbd5e1' }}>اسم الصيدلية / الشركة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مجموعة صيدليات الشفاء الطبية"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', boxSizing: 'border-box', marginTop: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#cbd5e1' }}>رقم الهاتف / الواتساب الرسمي *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 01012345678"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', boxSizing: 'border-box', marginTop: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#cbd5e1' }}>اسم المالك الثلاثي *</label>
                <input
                  type="text"
                  required
                  placeholder="الاسم الكامل لمالك المنشأة"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', boxSizing: 'border-box', marginTop: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#cbd5e1' }}>البريد الإلكتروني (اختياري)</label>
                <input
                  type="email"
                  placeholder="owner@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', boxSizing: 'border-box', marginTop: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8' }}>اسم مستخدم دخول المالك *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: owner_shefaa"
                  value={formData.owner_username}
                  onChange={(e) => setFormData({ ...formData, owner_username: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#1e293b', border: '1.5px solid #38bdf8', color: '#fff', boxSizing: 'border-box', marginTop: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8' }}>كلمة المرور الخاصة بالمالك *</label>
                <input
                  type="password"
                  required
                  placeholder="اختر كلمة مرور قوية"
                  value={formData.owner_password}
                  onChange={(e) => setFormData({ ...formData, owner_password: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#1e293b', border: '1.5px solid #38bdf8', color: '#fff', boxSizing: 'border-box', marginTop: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => {
                  if (!formData.company_name || !formData.phone || !formData.owner_username || !formData.owner_password) {
                    showToast?.('يرجى تعبئة الحقول الأساسية المطلوبة أولاً');
                    return;
                  }
                  setStep(2);
                }}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 28px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>المتابعة لاختيار الباقة</span>
                <ArrowLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PLANS & DYNAMIC PAGE PRICING */}
        {step === 2 && (
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 900 }}>اختيار نوع الاشتراك والشاشات المطلوبة</h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8' }}>
              اختر باقة جاهزة معتمدة أو حدد الشاشات والموديولات التي تريدها فقط (تسعير بالصفحة)
            </p>

            {/* Plans Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {plans.map((p) => {
                const isSelected = formData.plan_id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPlan(p)}
                    style={{
                      background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(30, 41, 59, 0.5)',
                      border: `2px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '16px',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '15px', color: isSelected ? '#38bdf8' : '#fff' }}>
                      {p.name_ar}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 10px' }}>
                      {p.description}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#10b981' }}>
                      {p.id === 'custom' ? 'سعر ديناميكي' : `${p.base_price} ج.م / شهر`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive Module Checklist */}
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800 }}>تخصيص الشاشات والموديولات المفعلة</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
              {modules.map((m) => {
                const isChecked = formData.selected_modules.includes(m.module_id);
                return (
                  <div
                    key={m.module_id}
                    onClick={() => handleToggleModule(m)}
                    style={{
                      background: isChecked ? 'rgba(16, 185, 129, 0.12)' : 'rgba(30, 41, 59, 0.4)',
                      border: `1.5px solid ${isChecked ? '#10b981' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '12px',
                      padding: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      border: `2px solid ${isChecked ? '#10b981' : '#64748b'}`,
                      background: isChecked ? '#10b981' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 900
                    }}>
                      {isChecked ? '✓' : ''}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>{m.name_ar}</div>
                      <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>+{m.price_monthly} ج.م / شهر</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Price Preview Card */}
            <div style={{
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid #38bdf8',
              borderRadius: '16px',
              padding: '16px 20px',
              marginTop: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>إجمالي قيمة الشاشات المختارة:</span>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#38bdf8' }}>
                  {baseMonthlyPrice} ج.م <span style={{ fontSize: '14px', color: '#94a3b8' }}>/ شهرياً</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}
                >
                  &rarr; السابق
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 900 }}
                >
                  المتابعة لكود الخصم والدفع &larr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DISCOUNT CODE & CHECKOUT */}
        {step === 3 && (
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 900 }}>كود الدعوة والخصم الترويجي وطرق الدفع</h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8' }}>
              أدخل كود الخصم للحصول على خصم مباشر يمتد لشهر واحد أو عدة أشهر متتالية
            </p>

            {/* Discount Code Input Box */}
            <div style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <label style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8' }}>هل لديك كود دعوة أو كوبون خصم؟</label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <input
                  type="text"
                  placeholder="مثال: PHARMA50"
                  value={formData.discount_code}
                  onChange={(e) => setFormData({ ...formData, discount_code: e.target.value.toUpperCase() })}
                  style={{ flex: 1, padding: '12px 14px', borderRadius: '10px', background: '#1e293b', border: '1.5px solid #38bdf8', color: '#fff', fontWeight: 800, fontSize: '15px' }}
                />
                <button
                  type="button"
                  onClick={handleValidateDiscountCode}
                  disabled={isValidatingCode}
                  style={{ background: '#38bdf8', color: '#090d16', border: 'none', padding: '0 22px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}
                >
                  {isValidatingCode ? 'جاري الفحص...' : 'تطبيق الكود'}
                </button>
              </div>

              {discountError && (
                <div style={{ color: '#f43f5e', fontSize: '12.5px', marginTop: '8px', fontWeight: 700 }}>
                  ⚠️ {discountError}
                </div>
              )}

              {/* Multi-Month Discount Celebration Card */}
              {discountInfo && (
                <div style={{
                  marginTop: '14px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(2, 132, 199, 0.2) 100%)',
                  border: '1.5px solid #10b981',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{ fontSize: '28px' }}>🎉</div>
                  <div>
                    <div style={{ fontWeight: 900, color: '#ffffff', fontSize: '15px' }}>
                      {discountInfo.title || 'تم تطبيق الخصم بنجاح!'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#a7f3d0', fontWeight: 700, marginTop: '3px' }}>
                      {discountInfo.summary_message}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#cbd5e1', marginTop: '3px' }}>
                      مدة سريان الخصم: <b>{discountInfo.duration_months} أشهر</b> (سيتم تطبيق الخصم آلياً في فواتير التجديد القادمة)
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Price Summary Breakdown */}
            <div style={{
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '18px 20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13.5px', color: '#94a3b8' }}>
                <span>قيمة الاشتراك الشهري الأساسي:</span>
                <span>{baseMonthlyPrice} ج.م</span>
              </div>

              {calculatedDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13.5px', color: '#10b981', fontWeight: 800 }}>
                  <span>قيمة الخصم المطبق:</span>
                  <span>- {calculatedDiscount} ج.م ({discountInfo?.discount_type === 'percentage' ? `${discountInfo.discount_value}%` : `${discountInfo.discount_value} ج.م`})</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontSize: '18px', fontWeight: 900, color: '#ffffff', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <span>الإجمالي المستحق للشهر الأول:</span>
                <span style={{ color: '#10b981', fontSize: '22px' }}>{netMonthlyPrice} ج.م</span>
              </div>
            </div>

            {/* Payment Methods & Instructions */}
            <div style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '18px',
              marginBottom: '24px'
            }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: '#38bdf8' }}>طرق الدفع وسداد الاشتراك المعتمدة:</h4>
              <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>💳 <b>إنستاباي (InstaPay):</b> تحويل مباشر لحساب المنظومة عبر المعرف أو الرقم</div>
                <div>📱 <b>محافظ الكاش (Vodafone Cash):</b> تحويل لرقم المحفظة المعتمد</div>
                <div>🏦 <b>تحويل بنكي رسمي:</b> متاح بناءً على طلب إشعار الإدارة</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}
              >
                &rarr; السابق
              </button>

              <button
                type="button"
                onClick={handleSubmitRegistration}
                disabled={isLoading}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 32px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 18px rgba(16, 185, 129, 0.4)'
                }}
              >
                {isLoading ? 'جاري تجهيز النظام المعزول...' : 'تأكيد التسجيل وبدء الاستخدام فوراً 🚀'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
