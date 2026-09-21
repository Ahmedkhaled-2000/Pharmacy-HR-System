import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Gift,
  Copy,
  ExternalLink,
  Printer,
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  RefreshCw,
  Info,
  QrCode,
  Download
} from 'lucide-react';

export default function SubscriptionBillingCard({
  state = {},
  showToast,
  executeWithOwnerGuard
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState(null);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [renewMonths, setRenewMonths] = useState(1);
  const [renewMethod, setRenewMethod] = useState('instapay');
  const [transactionRef, setTransactionRef] = useState('');
  const [submittingRenewal, setSubmittingRenewal] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);

  const orgSettings = state.orgSettings || {};

  // جلب تفاصيل الاشتراك وسجل الفواتير من الخادم
  const fetchSubscriptionDetails = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const token = localStorage.getItem('app_auth_token');
      const compId = orgSettings.companyId || '';
      const storageKey = orgSettings.companyCode ? `tenant_${orgSettings.companyCode.toLowerCase()}` : '';

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const url = `/api/tenant/subscription-details?company_id=${encodeURIComponent(compId)}&storage_key=${encodeURIComponent(storageKey)}`;
      const res = await fetch(url, { headers });
      const data = await res.json();

      if (data.success && data.company) {
        setSubscriptionData(data);
        localStorage.setItem('app_company_subscription', JSON.stringify(data.company));
      } else {
        // توليد بيانات افتراضية للشركة الأساسية في حالة العمل دون اتصال
        setSubscriptionData({
          company: {
            id: 'comp_primary_default',
            company_name: orgSettings.orgName || 'منظومة الصيدليات الطبية (المركز الرئيسي)',
            company_code: orgSettings.companyCode || 'MAIN-001',
            plan_name: 'الباقة المتكاملة (Enterprise ERP)',
            base_price: 1100,
            status: 'active',
            subscription_start: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
            subscription_end: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString(),
            grace_period_days: 30,
            enabled_modules: ['dashboard', 'branches', 'biometrics', 'payroll', 'requests', 'bylaws', 'accounts', 'income_expenses', 'pharmacy_archive', 'whatsapp_center'],
            applied_discount_code: 'LIFETIME_VIP',
            discount_type: 'percentage',
            discount_value: 100,
            discount_duration_months: 120,
            discount_months_remaining: 120
          },
          invoices: [
            {
              id: 'inv_default_01',
              invoice_number: 'INV-2026-VIP01',
              amount: 1100,
              discount_amount: 1100,
              net_amount: 0,
              discount_code: 'LIFETIME_VIP',
              status: 'approved',
              period_months: 120,
              payment_method: 'free_grant',
              created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
              notes: 'اشتراك المنظومة الأساسية الشامل والدائم لمالك المؤسسة'
            }
          ]
        });
      }
    } catch (err) {
      console.warn('[SubscriptionBillingCard] Offline or fetch notice:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch('/api/system/payment-methods');
      const data = await res.json();
      if (data?.success && Array.isArray(data.payment_methods) && data.payment_methods.length > 0) {
        setPaymentMethods(data.payment_methods);
      }
    } catch {}
  };

  useEffect(() => {
    fetchSubscriptionDetails();
    fetchPaymentMethods();
  }, [orgSettings.companyId]);

  const company = subscriptionData?.company || {};
  const invoices = subscriptionData?.invoices || [];

  // التحقق مما إذا كانت الشركة على الباقة المجانية الدائمة
  const isFreePlan = Boolean(
    subscriptionData?.is_free_plan ||
    company.is_free_plan ||
    company.plan_id === 'free' ||
    company.id === 'comp_primary_default' ||
    (parseFloat(company.base_price) === 0 && !company.plan_id)
  );

  // حساب الأيام المتبقية وحالة فترة السماح
  const timingStats = useMemo(() => {
    const end = company.subscription_end ? new Date(company.subscription_end) : new Date(Date.now() + 30 * 86400000);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const graceDays = parseInt(company.grace_period_days || 7, 10);
    const isInGrace = diffDays <= 0 && diffDays >= -graceDays;
    const isExpired = diffDays < -graceDays;
    const isLifetime = diffDays > 365 * 5;

    let statusText = 'نشط وسارٍ 🟢';
    let statusColor = '#10b981';
    let statusBg = 'rgba(16, 185, 129, 0.12)';

    if (isInGrace) {
      statusText = 'في فترة السماح ⚠️';
      statusColor = '#f59e0b';
      statusBg = 'rgba(245, 158, 11, 0.15)';
    } else if (isExpired || company.status === 'suspended') {
      statusText = 'معلق مؤقتاً 🛑';
      statusColor = '#ef4444';
      statusBg = 'rgba(239, 68, 68, 0.15)';
    }

    return {
      diffDays,
      isInGrace,
      isExpired,
      isLifetime,
      graceDays,
      statusText,
      statusColor,
      statusBg,
      endDateFormatted: isLifetime ? 'اشتراك دائم مفتوح (غير منتهي)' : end.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
      startDateFormatted: company.subscription_start ? new Date(company.subscription_start).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
    };
  }, [company]);

  // تطبيق كود خصم جديد
  const handleApplyPromo = async (e) => {
    e.preventDefault();
    if (!promoCodeInput.trim()) return;

    setApplyingPromo(true);
    try {
      const res = await fetch('/api/tenant/apply-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCodeInput.trim(),
          company_id: company.id
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(data.message || '🎉 تم تطبيق كود الخصم بنجاح!');
        setPromoCodeInput('');
        fetchSubscriptionDetails(true);
      } else {
        showToast?.(`⚠️ ${data.error || 'كود الخصم غير صحيح'}`);
      }
    } catch {
      showToast?.('⚠️ تعذر التحقق من كود الخصم في الوقت الحالي');
    } finally {
      setApplyingPromo(false);
    }
  };

  // نسخ النصوص بضغطة زر
  const copyToClipboard = (text, label) => {
    try {
      navigator.clipboard.writeText(text);
      showToast?.(`✅ تم نسخ ${label} إلى الحافظة بنجاح!`);
    } catch {
      showToast?.(`تم النسخ: ${text}`);
    }
  };

  // إرسال طلب تجديد اشتراك
  const handleRenewSubmit = async (e) => {
    e.preventDefault();
    setSubmittingRenewal(true);
    try {
      const baseMonthly = company.base_price || 500;
      const totalAmount = baseMonthly * renewMonths;
      const res = await fetch('/api/tenant/renew-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          months: renewMonths,
          amount: totalAmount,
          payment_method: renewMethod,
          transaction_reference: transactionRef
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🎉 تم تسجيل طلب التجديد بنجاح! يرجى إرسال الإشعار لتأكيد التفعيل.');
        setIsRenewModalOpen(false);
        fetchSubscriptionDetails(true);

        // فتح الواتساب تلقائياً مع تفاصيل الفاتورة
        const msg = `السلام عليكم ورحمة الله،\nأرغب في تأكيد تجديد اشتراك منظومة الصيدليات:\nاسم الشركة: ${company.company_name}\nكود الشركة: ${company.company_code}\nرقم الفاتورة: ${data.invoice_number}\nالمبلغ: ${data.net_amount} ج.م\nالمدة: ${renewMonths} شهر\nطريقة السداد: ${renewMethod}\nرقم الحوالة/المرجع: ${transactionRef || 'مرفق إشعار التحويل'}`;
        window.open(`https://wa.me/201000000000?text=${encodeURIComponent(msg)}`, '_blank');
      } else {
        showToast?.(`⚠️ ${data.error || 'تعذر إرسال طلب التجديد'}`);
      }
    } catch {
      showToast?.('⚠️ حدث خطأ أثناء إرسال طلب التجديد');
    } finally {
      setSubmittingRenewal(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px auto' }} />
        <div>جاري جلب تفاصيل الاشتراك وسجل الفواتير السحابي...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', fontFamily: 'inherit' }}>
      
      {/* ── 1. HEADER & LIVE STATUS TITLE ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '18px 22px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(99, 102, 241, 0.2))',
            color: 'var(--primary, #0ea5e9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            <CreditCard size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>
                متابعة اشتراك المؤسسة والمدفوعات
              </h3>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                color: timingStats.statusColor,
                background: timingStats.statusBg,
                border: `1px solid ${timingStats.statusColor}40`,
                padding: '3px 10px',
                borderRadius: '99px'
              }}>
                {timingStats.statusText}
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
              كود المؤسسة: <b style={{ color: 'var(--text)' }}>{company.company_code || 'MAIN-001'}</b> · باقة الاشتراك: <b style={{ color: 'var(--primary)' }}>{company.plan_name || 'Enterprise ERP'}</b>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fetchSubscriptionDetails(true)}
            disabled={refreshing}
            className="btn btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '8px 14px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>تحديث البيانات</span>
          </button>

          {isFreePlan ? (
            <div style={{
              padding: '8px 16px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.2))',
              border: '1.5px solid #10b981',
              color: '#059669',
              fontWeight: 800,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.15)'
            }}>
              <Sparkles size={16} />
              <span>💎 اشتراك مجاني دائم معتمد (مفعل مدى الحياة)</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsRenewModalOpen(true)}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 14px rgba(14, 165, 233, 0.25)'
              }}
            >
              <Zap size={15} />
              <span>تجديد الاشتراك / سداد</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 2. HERO STATUS & COUNTDOWN METRICS (3 CARDS) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px'
      }}>
        {/* Card 1: Expiry Countdown */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 700 }}>📅 انتهاء صلاحية الاشتراك</span>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: timingStats.isInGrace ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: timingStats.isInGrace ? '#f59e0b' : '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={18} />
            </div>
          </div>

          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)', marginBottom: '4px' }}>
            {timingStats.isLifetime ? (
              <span style={{ color: '#10b981' }}>♾️ اشتراك دائم (مدى الحياة)</span>
            ) : (
              <span>{timingStats.daysLeft} يوم متبقي</span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
            تاريخ الانتهاء: {timingStats.formattedEnd}
          </div>
        </div>

        {/* Card 2: Applied Discount Tracker or Free Plan Banner */}
        <div style={{
          background: isFreePlan
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.14))'
            : (company.applied_discount_code ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.04), rgba(5, 150, 105, 0.08))' : 'var(--surface)'),
          border: isFreePlan
            ? '1.5px solid #10b981'
            : (company.applied_discount_code ? '1.5px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border)'),
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#059669', fontWeight: 800 }}>
              {isFreePlan ? '💎 حالة ترخيص الاشتراك' : '🎉 الخصم الترويجي المطبق'}
            </span>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isFreePlan ? <Sparkles size={18} /> : <Gift size={18} />}
            </div>
          </div>

          {isFreePlan ? (
            <div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669', marginBottom: '6px' }}>
                اشتراك مجاني دائم بالكامل
              </div>
              <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: '0 0 10px' }}>
                هذا الحساب معتمد بترخيص مجاني دائم مدى الحياة. كافة الخصائص مفعلة ولا يتطلب أي رسوم تجديد دورية أو مدفوعات.
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#065f46',
                fontSize: '11px',
                fontWeight: 800
              }}>
                <CheckCircle2 size={13} />
                <span>مرخص بنسبة 100% بدون أي مطالبات مالية</span>
              </div>
            </div>
          ) : company.applied_discount_code ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '22px', fontWeight: 900, color: '#059669' }}>
                  {company.discount_type === 'percentage' ? `${company.discount_value}% خصم` : `${company.discount_value} ج.م خصم`}
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: '#10b981',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 900
                }}>
                  {company.applied_discount_code}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                عداد الشهور: متبقي <b style={{ color: '#059669' }}>{company.discount_months_remaining || 0} أشهر</b> من إجمالي مدة الخصم ({company.discount_duration_months || 1} أشهر).
              </div>

              {/* Multi-month Visual Steps Indicator */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {Array.from({ length: Math.min(company.discount_duration_months || 1, 12) }).map((_, idx) => {
                  const used = idx < ((company.discount_duration_months || 1) - (company.discount_months_remaining || 0));
                  const isCurrent = idx === ((company.discount_duration_months || 1) - (company.discount_months_remaining || 0));
                  return (
                    <div
                      key={idx}
                      title={`الشهر ${idx + 1}`}
                      style={{
                        flex: 1,
                        height: '6px',
                        borderRadius: '99px',
                        background: used ? '#10b981' : isCurrent ? '#34d399' : 'var(--border)'
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                لا يوجد كود خصم نشط حالياً
              </div>
              <p style={{ fontSize: '11.5px', color: 'var(--muted)', margin: '0 0 12px' }}>
                إذا كان لديك كود دعوة أو كوبون ترويجي، يمكنك تطبيقه الآن للاستفادة بالخصم على فواتير التجديد القادمة.
              </p>
            </div>
          )}

          {/* Promo code quick input - only when NOT free plan */}
          {!isFreePlan && (
            <form onSubmit={handleApplyPromo} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <input
                type="text"
                placeholder="أدخل كود الخصم الجديد..."
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text)'
                }}
              />
              <button
                type="submit"
                disabled={applyingPromo || !promoCodeInput.trim()}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {applyingPromo ? '...' : 'تطبيق'}
              </button>
            </form>
          )}
        </div>

        {/* Card 3: Enterprise Plan Details */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 700 }}>💎 ميزات الباقة والموديولات</span>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={18} />
            </div>
          </div>

          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)', marginBottom: '4px' }}>
            {company.plan_name || 'الباقة المتكاملة'}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
            {isFreePlan ? (
              <span style={{ color: '#059669', fontWeight: 800 }}>الترخيص: 💎 اشتراك مجاني دائم معتمد</span>
            ) : (
              <span>القيمة التقديرية للباقة: <b style={{ color: 'var(--text)' }}>{company.base_price || 1100} ج.م / شهرياً</b></span>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--surface-muted)', fontSize: '11px', fontWeight: 700 }}>
              👥 الحضور والورديات
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--surface-muted)', fontSize: '11px', fontWeight: 700 }}>
              💰 مسير الرواتب
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--surface-muted)', fontSize: '11px', fontWeight: 700 }}>
              📸 البصمة الذكية (AI)
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--surface-muted)', fontSize: '11px', fontWeight: 700 }}>
              🏛️ شجرة الحسابات ERP
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--surface-muted)', fontSize: '11px', fontWeight: 700 }}>
              💬 مركز الواتساب
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. INSTANT PAYMENT METHODS & BANK WALLETS CARD (Hidden on Free Plan) ── */}
      {!isFreePlan && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '22px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: 'var(--text)' }}>
                ⚡ قنوات ومحافظ السداد والتحويل الفوري المعتمدة
              </h4>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                بيانات التحويل المباشر لتجديد الاشتراك. بعد التحويل يتم تأكيد وتفعيل الاشتراك خلال دقائق.
              </p>
            </div>
            <span style={{ fontSize: '11.5px', color: '#059669', background: 'rgba(16, 185, 129, 0.12)', padding: '4px 10px', borderRadius: '8px', fontWeight: 700 }}>
              تفعيل فوري وآمن 🔒
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {(paymentMethods.length > 0 ? paymentMethods : [
              { id: 'pm_instapay', title: '📱 انستاباي (InstaPay)', badge_text: 'موصى به', account_identifier: 'pharmacore@instapay', instructions: 'تحويل فوري عبر تطبيق انستاباي' },
              { id: 'pm_vodafone', title: '🔴 محفظة كاش (فودافون كاش)', badge_text: 'فوري', account_identifier: '01000000000', instructions: 'تحويل عبر محفظة الهاتف' },
              { id: 'pm_bank', title: '🏛️ تحويل بنكي رسمي (IBAN)', badge_text: 'بنك مصر / CIB', account_identifier: 'EG3800020001000000123456789', instructions: 'تحويل بنكي مباشر' }
            ]).map((pm) => (
              <div
                key={pm.id}
                style={{
                  border: '1.5px solid rgba(14, 165, 233, 0.3)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  background: 'rgba(14, 165, 233, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0284c7' }}>{pm.title}</span>
                    {pm.badge_text && (
                      <span style={{ fontSize: '10.5px', background: '#0284c7', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                        {pm.badge_text}
                      </span>
                    )}
                  </div>
                  {pm.account_name && (
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '3px' }}>{pm.account_name}</div>
                  )}
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', direction: 'ltr', textAlign: 'right', wordBreak: 'break-all' }}>
                    {pm.account_identifier}
                  </div>
                  {pm.instructions && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>{pm.instructions}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(pm.account_identifier, pm.title)}
                  style={{
                    marginTop: '12px',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #0284c7',
                    background: 'transparent',
                    color: '#0284c7',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Copy size={13} />
                  <span>نسخ بيانات الدفع</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. INVOICES & PAYMENT HISTORY LEDGER ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '22px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: 'var(--text)' }}>
              🧾 سجل المدفوعات والفواتير السحابية الرسمية
            </h4>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              أرشيف وتوثيق كافة الفواتير والاشتراكات السابقة مع إمكانية عرض وطباعة الفاتورة الضريبية الرسمية.
            </p>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>
            إجمالي الفواتير المسجلة: {invoices.length}
          </span>
        </div>

        {invoices.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px' }}>
            لا توجد فواتير مسجلة حتى الآن.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>رقم الفاتورة</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>تاريخ الإصدار</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>المدة</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>القيمة الأساسية</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>الخصم المطبق</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>الصافي المسدد</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>وسيلة الدفع</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)' }}>الحالة</th>
                  <th style={{ padding: '12px 14px', color: 'var(--muted)', textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--text)' }}>
                      {inv.invoice_number}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--muted)' }}>
                      {new Date(inv.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text)' }}>
                      {inv.period_months > 12 ? 'اشتراك دائم' : `${inv.period_months} شهر`}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--muted)' }}>
                      {isFreePlan ? '—' : `${parseFloat(inv.amount || 0).toLocaleString()} ج.م`}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#059669', fontWeight: 700 }}>
                      {isFreePlan ? '—' : (inv.discount_amount > 0 ? `-${parseFloat(inv.discount_amount).toLocaleString()} ج.م` : '—')}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 900, color: isFreePlan ? '#059669' : 'var(--primary)' }}>
                      {isFreePlan ? 'مجاني دائم 💎' : `${parseFloat(inv.net_amount || 0).toLocaleString()} ج.م`}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--muted)' }}>
                      {inv.payment_method === 'instapay' ? 'InstaPay' : inv.payment_method === 'vodafone_cash' ? 'فودافون كاش' : inv.payment_method === 'bank_transfer' ? 'تحويل بنكي' : inv.payment_method === 'free_grant' ? 'منحة تأسيسية' : inv.payment_method}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: inv.status === 'approved' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        color: inv.status === 'approved' ? '#059669' : '#d97706'
                      }}>
                        {inv.status === 'approved' ? 'معتمدة ومسددة ✅' : 'قيد المراجعة ⏳'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setActiveInvoiceForPrint(inv)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--surface-muted)',
                          color: 'var(--text)',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Printer size={13} />
                        <span>عرض / طباعة</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 5. RENEWAL / UPGRADE MODAL ── */}
      {isRenewModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(5px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>طلب تجديد اشتراك المؤسسة</h4>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>تحديد المدة وطريقة الدفع والحصول على التفعيل الفوري</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRenewModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRenewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '6px' }}>مدة التجديد المطلوبة:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { months: 1, label: 'شهر واحد' },
                    { months: 3, label: '3 أشهر (ربع سنوي)' },
                    { months: 12, label: 'سنة كاملة (خصم إضافي)' }
                  ].map((m) => (
                    <button
                      key={m.months}
                      type="button"
                      onClick={() => setRenewMonths(m.months)}
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        border: renewMonths === m.months ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: renewMonths === m.months ? 'rgba(14, 165, 233, 0.1)' : 'var(--background)',
                        color: renewMonths === m.months ? 'var(--primary)' : 'var(--text)',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Calculation Summary */}
              {(() => {
                const baseMonthly = company.base_price || 500;
                const rawTotal = baseMonthly * renewMonths;
                let discountAmt = 0;
                if (company.discount_months_remaining > 0 && company.discount_value > 0) {
                  if (company.discount_type === 'percentage') {
                    discountAmt = (rawTotal * company.discount_value) / 100;
                  } else {
                    discountAmt = Math.min(rawTotal, company.discount_value * renewMonths);
                  }
                }
                const finalNet = Math.max(0, rawTotal - discountAmt);

                return (
                  <div style={{ background: 'var(--surface-muted)', borderRadius: '12px', padding: '14px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--muted)' }}>المبلغ الأساسي ({renewMonths} شهر):</span>
                      <span style={{ fontWeight: 700 }}>{rawTotal.toLocaleString()} ج.م</span>
                    </div>
                    {discountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#059669', marginBottom: '6px' }}>
                        <span>الخصم المطبق ({company.applied_discount_code}):</span>
                        <span style={{ fontWeight: 800 }}>-{discountAmt.toLocaleString()} ج.م</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 900, borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '6px' }}>
                      <span>صافي المبلغ المطلوب سداده:</span>
                      <span style={{ color: 'var(--primary)' }}>{finalNet.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '6px' }}>طريقة السداد:</label>
                <select
                  value={renewMethod}
                  onChange={(e) => setRenewMethod(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '13px', fontWeight: 700 }}
                >
                  <option value="instapay">انستاباي (InstaPay)</option>
                  <option value="vodafone_cash">فودافون كاش / محافظ الهاتف</option>
                  <option value="bank_transfer">تحويل بنكي رسمي (IBAN)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '6px' }}>رقم مرجع التحويل أو الملاحظات:</label>
                <input
                  type="text"
                  placeholder="مثال: رقم العملية أو اسم المحول..."
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsRenewModalOpen(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingRenewal}
                  style={{
                    flex: 2,
                    padding: '10px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>تأكيد وإرسال عبر الواتساب</span>
                  <ExternalLink size={15} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 6. PRINTABLE OFFICIAL INVOICE MODAL ── */}
      {activeInvoiceForPrint && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(5px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            color: '#0f172a',
            borderRadius: '16px',
            maxWidth: '650px',
            width: '100%',
            padding: '36px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>فاتورة اشتراك سحابية رسمية</h2>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>منظومة إدارة الصيدليات والموارد البشرية (SaaS Cloud)</div>
              </div>
              <div style={{ textAlign: 'left', direction: 'ltr' }}>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#0ea5e9' }}>{activeInvoiceForPrint.invoice_number}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{new Date(activeInvoiceForPrint.created_at).toLocaleDateString('ar-EG')}</div>
              </div>
            </div>

            {/* Client & Vendor Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>صدرت إلى (العميل):</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>{company.company_name}</div>
                <div style={{ fontSize: '12px', color: '#334155' }}>كود الشركة: {company.company_code}</div>
                <div style={{ fontSize: '12px', color: '#334155' }}>مسؤول الحساب: {company.owner_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>الجهة المصدرة:</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#0ea5e9', marginTop: '2px' }}>PharmaCore SaaS Solutions</div>
                <div style={{ fontSize: '12px', color: '#334155' }}>البريد: support@pharmacore.site</div>
                <div style={{ fontSize: '12px', color: '#334155' }}>الرقم الضريبي الموحد: 849-291-772</div>
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'right' }}>
                  <th style={{ padding: '10px' }}>البند / الخدمة</th>
                  <th style={{ padding: '10px' }}>المدة</th>
                  <th style={{ padding: '10px' }}>القيمة</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ fontWeight: 800 }}>اشتراك منظومة إدارة الصيدليات السحابية المتكاملة</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>تشمل الحضور، مسير الرواتب، البصمة الذكية، والتقارير</div>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    {activeInvoiceForPrint.period_months > 12 ? 'اشتراك دائم' : `${activeInvoiceForPrint.period_months} شهر`}
                  </td>
                  <td style={{ padding: '12px 10px', fontWeight: 700 }}>
                    {parseFloat(activeInvoiceForPrint.amount || 0).toLocaleString()} ج.م
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ width: '260px', marginRight: 'auto', marginBottom: '24px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#64748b' }}>
                <span>المجموع:</span>
                <span>{parseFloat(activeInvoiceForPrint.amount || 0).toLocaleString()} ج.م</span>
              </div>
              {activeInvoiceForPrint.discount_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#059669', fontWeight: 700 }}>
                  <span>الخصم ({activeInvoiceForPrint.discount_code}):</span>
                  <span>-{parseFloat(activeInvoiceForPrint.discount_amount).toLocaleString()} ج.م</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #0f172a', fontWeight: 900, fontSize: '15px' }}>
                <span>الصافي المدفوع:</span>
                <span style={{ color: '#0ea5e9' }}>{parseFloat(activeInvoiceForPrint.net_amount || 0).toLocaleString()} ج.م</span>
              </div>
            </div>

            {/* Footer & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                تم استلام المبلغ بنجاح عبر ({activeInvoiceForPrint.payment_method}) · تعتبر هذه الفاتورة سنداً إلكترونياً معتمداً.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Printer size={15} />
                  <span>طباعة الفاتورة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInvoiceForPrint(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#e2e8f0',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
