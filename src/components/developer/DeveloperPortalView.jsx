import React, { useState, useEffect, useMemo, useCallback } from 'react';
import '../../styles/developer.css';
import {
  ShieldAlert,
  Building2,
  TicketPercent,
  Layers,
  Wrench,
  MessageSquare,
  TrendingUp,
  Megaphone,
  RefreshCw,
  LogOut,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Send,
  Plus,
  Trash2,
  DollarSign,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  Sliders,
  Activity,
  Server,
  Database,
  Archive,
  RotateCcw,
  UserCheck,
  MessageCircle,
  Bug,
  Share2,
  Wallet,
  Users,
  LifeBuoy,
  Check,
  CreditCard,
  Edit3,
  Link as LinkIcon,
  QrCode,
  Smartphone,
  ShieldCheck
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/apiClient';

export default function DeveloperPortalView({ onLogout, showToast }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // States
  const [companies, setCompanies] = useState([]);
  const [modules, setModules] = useState([]);
  const [plans, setPlans] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [maintenance, setMaintenance] = useState({ is_global_outage: false, disabled_screens: [], developer_sandbox_active: true });
  const [financials, setFinancials] = useState({ total_revenue: 0, total_expenses: 0, net_profit: 0 });
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  // Telemetry, Affiliates & Tickets States
  const [telemetryStats, setTelemetryStats] = useState({
    db_latency_ms: 0,
    connected_clients: 0,
    total_companies: 0,
    recent_errors_count: 0,
    server_uptime_seconds: 0,
    memory_usage_mb: 0
  });
  const [errorLogs, setErrorLogs] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketReplyText, setTicketReplyText] = useState('');
  const [ticketReplyStatus, setTicketReplyStatus] = useState('in_progress');
  const [ticketFilter, setTicketFilter] = useState('all');

  // Snapshots & Backups
  const [selectedCompBackups, setSelectedCompBackups] = useState([]);
  const [newBackupName, setNewBackupName] = useState('');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  // Live VPS WhatsApp Gateway State
  const [waStatus, setWaStatus] = useState({ status: 'CHECKING', qr: null, phone: '', deviceName: '', uptime: '' });
  const [waDirectPhone, setWaDirectPhone] = useState('');
  const [waDirectMsg, setWaDirectMsg] = useState('');
  const [isSendingDirectWa, setIsSendingDirectWa] = useState(false);

  // Modals
  const [isNewCompanyModalOpen, setIsNewCompanyModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [isNewDiscountModalOpen, setIsNewDiscountModalOpen] = useState(false);
  const [isEditDiscountModalOpen, setIsEditDiscountModalOpen] = useState(false);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [isEditModuleModalOpen, setIsEditModuleModalOpen] = useState(false);
  const [isEditInvoiceSettingsModalOpen, setIsEditInvoiceSettingsModalOpen] = useState(false);
  const [isEditInvoiceModalOpen, setIsEditInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceSettings, setInvoiceSettings] = useState({});
  const [invoiceSettingsForm, setInvoiceSettingsForm] = useState({
    issuer_name: '',
    issuer_email: '',
    tax_number: '',
    issuer_phone: '',
    invoice_title: '',
    invoice_subtitle: '',
    service_title: '',
    service_description: '',
    footer_notice: '',
    free_license_notice: ''
  });
  const [editInvoiceForm, setEditInvoiceForm] = useState({
    id: '',
    invoice_number: '',
    amount: '',
    discount_amount: '',
    net_amount: '',
    payment_method: '',
    status: 'approved',
    notes: ''
  });
  const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAffiliateModalOpen, setIsAffiliateModalOpen] = useState(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedAffiliate, setSelectedAffiliate] = useState(null);

  // Form states - All defaults completely clean/empty (No hardcoded dummy values)
  const [newCompForm, setNewCompForm] = useState({
    company_name: '',
    company_code: '',
    owner_name: '',
    owner_username: '',
    owner_password: '',
    phone: '',
    email: '',
    plan_id: 'free',
    subscription_months: '',
    grace_period_days: '',
    discount_code: ''
  });

  const [editCompanyForm, setEditCompanyForm] = useState({
    id: '',
    company_name: '',
    company_code: '',
    owner_name: '',
    owner_username: '',
    owner_password: '',
    phone: '',
    email: '',
    plan_id: 'free',
    subscription_end: '',
    grace_period_days: 15,
    status: 'active',
    enabled_modules: []
  });

  const [renewForm, setRenewForm] = useState({
    months: '',
    amount: '',
    payment_method: 'instapay',
    notes: ''
  });

  const [suspendForm, setSuspendForm] = useState({
    status: 'suspended',
    suspension_reason: '',
    custom_admin_msg: '',
    custom_staff_msg: ''
  });

  const [discountForm, setDiscountForm] = useState({
    code: '',
    title: '',
    discount_type: 'percentage',
    discount_value: '',
    duration_months: '',
    max_uses: '',
    expires_at: ''
  });

  const [editDiscountForm, setEditDiscountForm] = useState({
    id: '',
    code: '',
    title: '',
    discount_type: 'percentage',
    discount_value: '',
    duration_months: '',
    max_uses: '',
    is_active: true,
    expires_at: ''
  });

  const [paymentMethodForm, setPaymentMethodForm] = useState({
    id: '',
    title: '',
    type: 'instapay',
    account_identifier: '',
    account_name: '',
    badge_text: '',
    instructions: '',
    is_active: true,
    sort_order: 0
  });

  const [editModuleForm, setEditModuleForm] = useState({
    module_id: '',
    name_ar: '',
    price_monthly: '',
    description: '',
    icon: '📦',
    required_dependencies: []
  });

  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: 'hosting_servers',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    target_company_id: 'all',
    priority: 'normal'
  });

  const [affiliateForm, setAffiliateForm] = useState({
    name: '',
    phone: '',
    email: '',
    promo_code: '',
    commission_percent: ''
  });

  const [payoutForm, setPayoutForm] = useState({
    amount: '',
    notes: ''
  });

  const [broadcastMessage, setBroadcastMessage] = useState('');

  // Headers helper
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('app_auth_token') || '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }, []);

  // Fetch all core data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const [compRes, modRes, discRes, mainRes, finRes, expRes, annRes, telRes, affRes, tktRes, pmRes, invRes, invSetRes] = await Promise.all([
        fetch(`${API_BASE_URL}/developer/companies`, { headers }).then(r => r.json()).catch(() => ({ companies: [] })),
        fetch(`${API_BASE_URL}/developer/modules`, { headers }).then(r => r.json()).catch(() => ({ modules: [] })),
        fetch(`${API_BASE_URL}/developer/discounts`, { headers }).then(r => r.json()).catch(() => ({ discounts: [] })),
        fetch(`${API_BASE_URL}/system/maintenance-status`).then(r => r.json()).catch(() => ({ is_global_outage: false, disabled_screens: [] })),
        fetch(`${API_BASE_URL}/developer/financial-summary`, { headers }).then(r => r.json()).catch(() => ({ total_revenue: 0, total_expenses: 0, net_profit: 0 })),
        fetch(`${API_BASE_URL}/developer/expenses`, { headers }).then(r => r.json()).catch(() => ({ expenses: [] })),
        fetch(`${API_BASE_URL}/developer/announcements`, { headers }).then(r => r.json()).catch(() => ({ announcements: [] })),
        fetch(`${API_BASE_URL}/developer/telemetry/stats`, { headers }).then(r => r.json()).catch(() => ({ stats: {}, errors: [] })),
        fetch(`${API_BASE_URL}/developer/affiliates`, { headers }).then(r => r.json()).catch(() => ({ affiliates: [] })),
        fetch(`${API_BASE_URL}/developer/tickets`, { headers }).then(r => r.json()).catch(() => ({ tickets: [] })),
        fetch(`${API_BASE_URL}/developer/payment-methods`, { headers }).then(r => r.json()).catch(() => ({ payment_methods: [] })),
        fetch(`${API_BASE_URL}/developer/invoices`, { headers }).then(r => r.json()).catch(() => ({ invoices: [] })),
        fetch(`${API_BASE_URL}/developer/invoice-settings`, { headers }).then(r => r.json()).catch(() => ({ settings: {} }))
      ]);

      if (compRes.companies) setCompanies(compRes.companies);
      if (modRes.modules) setModules(modRes.modules);
      if (discRes.discounts) setDiscounts(discRes.discounts);
      if (mainRes) setMaintenance(mainRes);
      if (finRes) setFinancials(finRes);
      if (expRes.expenses) setExpenses(expRes.expenses);
      if (annRes.announcements) setAnnouncements(annRes.announcements);
      if (telRes.stats) setTelemetryStats(telRes.stats);
      if (telRes.errors) setErrorLogs(telRes.errors);
      if (affRes.affiliates) setAffiliates(affRes.affiliates);
      if (tktRes.tickets) setSupportTickets(tktRes.tickets);
      if (pmRes.payment_methods) setPaymentMethods(pmRes.payment_methods);
      if (invRes?.invoices) setInvoices(invRes.invoices);
      if (invSetRes?.settings) setInvoiceSettings(invSetRes.settings);
    } catch (err) {
      console.warn('Developer data fetch warning:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── 1. وضع الدخول الشبح (Ghost Impersonation Login) ──
  const handleGhostLogin = async (company) => {
    if (!window.confirm(`هل تريد الدخول الفوري بوضع الشبح كمالك لشركة (${company.company_name})؟\n\nستتمكن من معاينة شاشات الصيدلية ببياناتها الفعلية وتصحيح أي أخطاء دون طلب كلمة المرور.`)) return;

    try {
      showToast?.('⚡ جاري تجهيز جلسة المحاكاة والدخول الشبح...');
      const currentToken = localStorage.getItem('app_auth_token') || '';
      const res = await fetch(`${API_BASE_URL}/developer/impersonate/${company.id}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.token) {
        localStorage.setItem('app_dev_backup_token', currentToken);
        localStorage.setItem('app_auth_token', data.token);
        localStorage.setItem('app_auth_role', 'owner');
        localStorage.setItem('app_is_impersonating', 'true');
        localStorage.setItem('app_impersonated_company', JSON.stringify(data.company));
        showToast?.(`👁️ تم تفعيل وضع الشبح بنجاح! جاري الانتقال لشاشات ${company.company_name}...`);
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } else {
        showToast?.(`❌ فشل الدخول الشبح: ${data.error || 'خطأ غير معروف'}`);
      }
    } catch (err) {
      showToast?.('❌ تعذر الاتصال بالخادم لتفعيل وضع الشبح');
    }
  };

  // ── 2. محرك النسخ الاحتياطي والاستعادة الفردية (Snapshots & Restore) ──
  const handleOpenBackupsModal = async (company) => {
    setSelectedCompany(company);
    setIsBackupModalOpen(true);
    try {
      const res = await fetch(`${API_BASE_URL}/developer/companies/${company.id}/backups`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setSelectedCompBackups(data.backups || []);
      }
    } catch {}
  };

  const handleCreateSnapshot = async () => {
    if (!selectedCompany) return;
    setIsCreatingBackup(true);
    try {
      const res = await fetch(`${API_BASE_URL}/developer/companies/${selectedCompany.id}/backup`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: newBackupName })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('💾 تم أخذ اللقطة وحفظ النسخة الاحتياطية بنجاح!');
        setNewBackupName('');
        const bkRes = await fetch(`${API_BASE_URL}/developer/companies/${selectedCompany.id}/backups`, {
          headers: getAuthHeaders()
        });
        const bkData = await bkRes.json();
        if (bkData.success) setSelectedCompBackups(bkData.backups || []);
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر أخذ النسخة الاحتياطية');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreSnapshot = async (backupId, backupName) => {
    if (!selectedCompany) return;
    if (!window.confirm(`⚠️ تحذير أمني هام:\nهل أنت متأكد من استعادة النسخة "${backupName}" لشركة (${selectedCompany.company_name})؟\n\n💡 سيقوم النظام تلقائياً بأخذ لقطة أمان تراجعية (Safety Rollback) قبل الاستبدال لتفادي أي فقدان بيانات.`)) return;

    setIsRestoringBackup(true);
    try {
      const res = await fetch(`${API_BASE_URL}/developer/companies/${selectedCompany.id}/restore`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ backup_id: backupId })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ ' + (data.message || 'تمت استعادة النسخة بنجاح وتحديث كافة الأجهزة المتصلة!'));
        setIsBackupModalOpen(false);
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر استعادة النسخة الاحتياطية');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleDownloadSnapshot = (backupId) => {
    if (!selectedCompany) return;
    window.open(`${API_BASE_URL}/developer/companies/${selectedCompany.id}/backup/download/${backupId}?token=${encodeURIComponent(localStorage.getItem('app_auth_token') || '')}`, '_blank');
  };

  // ── 3. مركز الرصد والأخطاء (Bug Sentry) ──
  const handleClearErrorLogs = async () => {
    if (!window.confirm('هل أنت متأكد من تفريغ كافة سجلات الأخطاء السابقة؟')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/telemetry/errors`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setErrorLogs([]);
        setTelemetryStats(prev => ({ ...prev, recent_errors_count: 0 }));
        showToast?.('🧹 تم تفريغ سجل الأخطاء بنجاح');
      }
    } catch {
      showToast?.('❌ تعذر تفريغ السجل');
    }
  };

  // ── 4. شبكة الوكلاء والمسوقين (Affiliate Hub) ──
  const handleCreateAffiliate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/developer/affiliates`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(affiliateForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🤝 تم حفظ وتفعيل الوكيل وتوليد كود الخصم له بنجاح!');
        setIsAffiliateModalOpen(false);
        setAffiliateForm({ name: '', phone: '', email: '', promo_code: '', commission_percent: 15 });
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر تسجيل الوكيل');
    }
  };

  const handleAffiliatePayout = async (e) => {
    e.preventDefault();
    if (!selectedAffiliate) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/affiliates/${selectedAffiliate.id}/payout`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payoutForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('💵 تم تسجيل صرف العمولة للوكيل بنجاح!');
        setIsPayoutModalOpen(false);
        setPayoutForm({ amount: '', notes: '' });
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر صرف العمولة');
    }
  };

  const handleGenerateAffiliateWhatsApp = (aff) => {
    const text = `مرحباً أستاذ ${aff.name} 👋\nتحياتنا من إدارة منظومة الصيدليات السحابية.\n\n📊 تقرير أرباحك وعمولاتك التسويقية:\n🏷️ كود الخصم الخاص بك: ${aff.promo_code}\n💰 نسبة العمولة: ${aff.commission_percent}%\n🏢 عدد الصيدليات المشتركة عبر كودك: ${aff.companies_count || 0}\n💵 إجمالي العمولات المستحقة: ${Number(aff.total_earned || 0).toLocaleString()} ج.م\n💳 إجمالي المسدد لك: ${Number(aff.total_paid || 0).toLocaleString()} ج.م\n🟢 رصيدك المتاح للصرف حالياً: ${Number(aff.balance || 0).toLocaleString()} ج.م\n\nنسعد باستمرار شراكتنا ونجاحنا المشترك! 🚀`;
    const cleanPhone = String(aff.phone).replace(/\D/g, '').replace(/^0+/, '20');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // ── 5. تذاكر الدعم الفني (Support Tickets) ──
  const handleReplyTicket = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !ticketReplyText.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: ticketReplyText.trim(),
          status: ticketReplyStatus
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('📨 تم إرسال رد الدعم الفني وتحديث الحالة بنجاح!');
        const updatedMessages = [
          ...(selectedTicket.messages || []),
          {
            sender: 'developer',
            sender_name: 'مطور المنظومة (الدعم الفني)',
            message: ticketReplyText.trim(),
            timestamp: new Date().toISOString()
          }
        ];
        setSelectedTicket({
          ...selectedTicket,
          status: ticketReplyStatus,
          messages: updatedMessages
        });
        setTicketReplyText('');
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر إرسال الرد');
    }
  };

  // Company Actions
  const handleCreateCompany = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/developer/companies`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newCompForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم إنشاء الشركة وتجهيز بيئتها المعزولة بنجاح!');
        setIsNewCompanyModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch (err) {
      showToast?.('❌ تعذر إنشاء الشركة، يرجى المحاولة ثانية');
    }
  };

  const handleRenewSubscription = async (e) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/companies/${selectedCompany.id}/renew`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(renewForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تجديد الاشتراك بنجاح وتطبيق الخصم تلقائياً إن وُجد');
        setIsRenewModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch (err) {
      showToast?.('❌ تعذر تجديد الاشتراك');
    }
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/companies/${selectedCompany.id}/status`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(suspendForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تحديث حالة الشركة وشاشات الإيقاف بنجاح');
        setIsSuspendModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch (err) {
      showToast?.('❌ تعذر تحديث حالة الشركة');
    }
  };

  // Discount Actions
  const handleCreateDiscount = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/developer/discounts`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(discountForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🎉 تم إنشاء كود الخصم وسريان الأشهر بنجاح!');
        setIsNewDiscountModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch (err) {
      showToast?.('❌ تعذر إنشاء كود الخصم');
    }
  };

  const handleDeleteDiscount = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف كود الخصم هذا؟')) return;
    try {
      await fetch(`${API_BASE_URL}/developer/discounts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      showToast?.('🗑️ تم حذف كود الخصم');
      fetchData();
    } catch {}
  };

  // Maintenance Actions
  const handleToggleScreenMaintenance = async (screenId, currentDisabled) => {
    try {
      const res = await fetch(`${API_BASE_URL}/developer/maintenance/toggle-screen`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          screen_id: screenId,
          disabled: !currentDisabled,
          message: 'هذه الشاشة قيد الصيانة المجدولة والتحديثات السحابية.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setMaintenance(prev => ({ ...prev, disabled_screens: data.disabled_screens }));
        showToast?.(!currentDisabled ? '⚠️ تم إيقاف الشاشة للصيانة' : '✅ تم إعادة تفعيل الشاشة للعمل');
      }
    } catch {}
  };

  const handleToggleSandbox = async () => {
    const nextState = !maintenance.developer_sandbox_active;
    try {
      await fetch(`${API_BASE_URL}/developer/maintenance/toggle-sandbox`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ active: nextState })
      });
      setMaintenance(prev => ({ ...prev, developer_sandbox_active: nextState }));
      showToast?.(nextState ? '🧪 وضع تجربة المطور Sandbox مفعّل (تجاوز الأعطال)' : '🔒 وضع Sandbox معطل');
    } catch {}
  };

  // Expense Actions
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/developer/expenses`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(expenseForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تسجيل المصروف وتحديث صافي الأرباح');
        setIsNewExpenseModalOpen(false);
        fetchData();
      }
    } catch {}
  };

  // ── Invoice Settings & Individual Invoice Handlers ──
  const handleOpenEditInvoiceSettings = () => {
    setInvoiceSettingsForm({
      issuer_name: invoiceSettings.issuer_name || 'PharmaCore SaaS Solutions',
      issuer_email: invoiceSettings.issuer_email || 'support@pharmacore.site',
      tax_number: invoiceSettings.tax_number || '849-291-772',
      issuer_phone: invoiceSettings.issuer_phone || '',
      invoice_title: invoiceSettings.invoice_title || 'فاتورة اشتراك سحابية رسمية',
      invoice_subtitle: invoiceSettings.invoice_subtitle || 'منظومة إدارة الصيدليات والموارد البشرية (SaaS Cloud)',
      service_title: invoiceSettings.service_title || 'اشتراك منظومة إدارة الصيدليات السحابية المتكاملة',
      service_description: invoiceSettings.service_description || 'تشمل الحضور، مسير الرواتب، البصمة الذكية، والتقارير',
      footer_notice: invoiceSettings.footer_notice || 'تعتبر هذه الفاتورة سنداً إلكترونياً معتمداً ومسجلاً سحابياً.',
      free_license_notice: invoiceSettings.free_license_notice || 'تم اعتماد هذا الاشتراك مجاناً وبشكل دائم ورسمي من إدارة المنظومة (ترخيص معتمد غير خاضع لأي مستحقات مالية).'
    });
    setIsEditInvoiceSettingsModalOpen(true);
  };

  const handleSaveInvoiceSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/developer/invoice-settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(invoiceSettingsForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم حفظ بيانات وترويسة الفاتورة بنجاح');
        setInvoiceSettings(invoiceSettingsForm);
        setIsEditInvoiceSettingsModalOpen(false);
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر حفظ بيانات الفاتورة');
    }
  };

  const handleOpenEditInvoice = (inv) => {
    setSelectedInvoice(inv);
    setEditInvoiceForm({
      id: inv.id,
      invoice_number: inv.invoice_number || '',
      amount: inv.amount || 0,
      discount_amount: inv.discount_amount || 0,
      net_amount: inv.net_amount || 0,
      payment_method: inv.payment_method || 'instapay',
      status: inv.status || 'approved',
      notes: inv.notes || ''
    });
    setIsEditInvoiceModalOpen(true);
  };

  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/developer/invoices/${editInvoiceForm.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editInvoiceForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تعديل بيانات الفاتورة بنجاح');
        setIsEditInvoiceModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر تعديل بيانات الفاتورة');
    }
  };

  // WhatsApp Broadcast
  const handleSendWhatsAppBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      showToast?.('يرجى كتابة نص الرسالة أولاً');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/developer/whatsapp/broadcast`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: broadcastMessage, target: 'all' })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`💬 ${data.message}`);
        setBroadcastMessage('');
      }
    } catch {}
  };

  // Close open dropdown on outside click
  useEffect(() => {
    const closeMenu = (e) => {
      if (!e.target.closest('.dev-nav-group')) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // ── Company Full Edit Actions ──
  const handleOpenEditCompany = (comp) => {
    setSelectedCompany(comp);
    setEditCompanyForm({
      company_name: comp.company_name || '',
      company_code: comp.company_code || '',
      owner_username: comp.owner_username || '',
      owner_name: comp.owner_name || '',
      owner_password: '',
      phone: comp.phone || '',
      plan_id: comp.plan_id || 'pro',
      status: comp.status || 'active',
      subscription_end: comp.subscription_end ? new Date(comp.subscription_end).toISOString().slice(0, 10) : '',
      enabled_modules: Array.isArray(comp.enabled_modules) ? [...comp.enabled_modules] : ['hr_core'],
      suspension_reason: comp.suspension_reason || '',
      custom_admin_suspension_msg: comp.custom_admin_suspension_msg || '',
      custom_staff_suspension_msg: comp.custom_staff_suspension_msg || ''
    });
    setIsEditCompanyModalOpen(true);
  };

  const handleSaveEditCompany = async (e) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/companies/${selectedCompany.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editCompanyForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم حفظ كافة بيانات الشركة والمالك وتحديث التخزين بنجاح!');
        setIsEditCompanyModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر حفظ تعديلات الشركة');
    }
  };

  const handleCopyRegisterUrl = () => {
    const regUrl = `${window.location.origin}/register`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(regUrl).then(() => {
        showToast?.('📋 تم نسخ رابط تسجيل الشركات المباشر (/register) إلى الحافظة!');
      }).catch(() => {
        prompt('انسخ رابط تسجيل الشركات:', regUrl);
      });
    } else {
      prompt('انسخ رابط تسجيل الشركات:', regUrl);
    }
  };

  // ── Edit Discount Actions ──
  const handleOpenEditDiscount = (disc) => {
    setEditDiscountForm({
      id: disc.id,
      code: disc.code || '',
      title: disc.title || '',
      discount_type: disc.discount_type || 'percentage',
      discount_value: disc.discount_value || '',
      duration_months: disc.duration_months || 1,
      max_uses: disc.max_uses || '',
      is_active: disc.is_active !== false,
      expires_at: disc.expires_at ? new Date(disc.expires_at).toISOString().slice(0, 10) : ''
    });
    setIsEditDiscountModalOpen(true);
  };

  const handleSaveEditDiscount = async (e) => {
    e.preventDefault();
    if (!editDiscountForm.id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/discounts/${editDiscountForm.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editDiscountForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تحديث كود الخصم بنجاح!');
        setIsEditDiscountModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر حفظ تعديلات كود الخصم');
    }
  };

  // ── Edit Module Catalog Actions ──
  const handleOpenEditModule = (mod) => {
    setEditModuleForm({
      module_id: mod.module_id,
      name_ar: mod.name_ar || '',
      price_monthly: mod.price_monthly ?? 0,
      description: mod.description || '',
      icon: mod.icon || '📦',
      required_dependencies: Array.isArray(mod.required_dependencies) ? [...mod.required_dependencies] : []
    });
    setIsEditModuleModalOpen(true);
  };

  const handleSaveEditModule = async (e) => {
    e.preventDefault();
    if (!editModuleForm.module_id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/modules/${editModuleForm.module_id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editModuleForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم حفظ تسعيرة وترابط الموديول وتحديث الكتالوج بنجاح!');
        setIsEditModuleModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر حفظ بيانات الموديول');
    }
  };

  // ── Payment Methods Actions ──
  const handleOpenPaymentMethodModal = (pm = null) => {
    if (pm) {
      setPaymentMethodForm({
        id: pm.id,
        title: pm.title || '',
        type: pm.type || 'instapay',
        account_identifier: pm.account_identifier || '',
        account_name: pm.account_name || '',
        badge_text: pm.badge_text || '',
        instructions: pm.instructions || '',
        is_active: pm.is_active !== false,
        sort_order: pm.sort_order || 0
      });
    } else {
      setPaymentMethodForm({
        id: '',
        title: '',
        type: 'instapay',
        account_identifier: '',
        account_name: '',
        badge_text: '',
        instructions: '',
        is_active: true,
        sort_order: paymentMethods.length
      });
    }
    setIsPaymentMethodModalOpen(true);
  };

  const handleSavePaymentMethod = async (e) => {
    e.preventDefault();
    try {
      const isEditing = Boolean(paymentMethodForm.id);
      const url = isEditing
        ? `${API_BASE_URL}/developer/payment-methods/${paymentMethodForm.id}`
        : `${API_BASE_URL}/developer/payment-methods`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(paymentMethodForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(isEditing ? '✅ تم تحديث وسيلة الدفع بنجاح' : '✅ تم إضافة وسيلة الدفع بنجاح');
        setIsPaymentMethodModalOpen(false);
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر حفظ وسيلة الدفع');
    }
  };

  const handleDeletePaymentMethod = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف وسيلة الدفع هذه؟')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/developer/payment-methods/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🗑️ تم حذف وسيلة الدفع بنجاح');
        fetchData();
      } else {
        showToast?.(`❌ خطأ: ${data.error}`);
      }
    } catch {
      showToast?.('❌ تعذر حذف وسيلة الدفع');
    }
  };

  // ── WhatsApp VPS Integration Actions ──
  const getWaGatewayBase = useCallback(() => {
    if (typeof window !== 'undefined') {
      if (window.location.protocol === 'https:') {
        return `${window.location.origin}/whatsapp`;
      }
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:3100';
      }
      return `http://${hostname}:3100`;
    }
    return 'http://127.0.0.1:3100';
  }, []);

  const fetchWaStatus = useCallback(async () => {
    try {
      const waBase = getWaGatewayBase();
      const res = await fetch(`${waBase}/status`, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      setWaStatus(data);
    } catch (err) {
      setWaStatus(prev => ({ ...prev, status: 'UNREACHABLE', lastError: err.message }));
    }
  }, [getWaGatewayBase]);

  useEffect(() => {
    if (activeTab === 'whatsapp') {
      fetchWaStatus();
      const timer = setInterval(fetchWaStatus, 4000);
      return () => clearInterval(timer);
    }
  }, [activeTab, fetchWaStatus]);

  const handleSendDirectWa = async (e) => {
    e.preventDefault();
    if (!waDirectPhone.trim() || !waDirectMsg.trim()) {
      showToast?.('⚠️ يرجى إدخال رقم الهاتف ونص الرسالة');
      return;
    }
    setIsSendingDirectWa(true);
    try {
      const waBase = getWaGatewayBase();
      const res = await fetch(`${waBase}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: waDirectPhone.trim(), message: waDirectMsg.trim() })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم إرسال رسالة الواتساب بنجاح!');
        setWaDirectMsg('');
      } else {
        showToast?.(`❌ فشل الإرسال: ${data.error || 'خطأ غير معروف'}`);
      }
    } catch (err) {
      showToast?.(`❌ تعذر إرسال الرسالة: ${err.message}`);
    } finally {
      setIsSendingDirectWa(false);
    }
  };

  const handleDisconnectWa = async () => {
    if (!window.confirm('هل أنت متأكد من فك ارتباط خادم الواتساب وإعادة توليد رمز الاقتران QR؟')) return;
    try {
      const waBase = getWaGatewayBase();
      const res = await fetch(`${waBase}/force-reset`, { method: 'POST' });
      const data = await res.json();
      showToast?.(data.message || 'تمت إعادة ضبط جلسة الواتساب بنجاح');
      fetchWaStatus();
    } catch (err) {
      showToast?.(`❌ تعذر إعادة الضبط: ${err.message}`);
    }
  };

  return (
    <div className="dev-shell-root">
      {/* ── Desktop Top Layer Bar ── */}
      <header className="dev-top-bar">
        <div className="dev-brand-badge">
          <div className="dev-brand-icon">⚡</div>
          <div>
            <div style={{ fontSize: '15.5px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.2px' }}>
              بوابة مطور النظام السيادي
            </div>
            <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
              Super Admin SaaS Operations Control
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="dev-telemetry-badge">
            <span className="dev-pulse-dot"></span>
            <span>الخوادم السحابية: متصلة (Ping &lt; 2ms)</span>
          </div>

          <button
            onClick={fetchData}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--dev-border)',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '7px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 700
            }}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} className={isLoading ? 'spinner' : ''} />
            <span style={{ display: 'none', md: 'inline' }}>تحديث حي</span>
          </button>

          <button
            onClick={onLogout}
            style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#f43f5e',
              borderRadius: '10px',
              padding: '7px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800
            }}
          >
            <LogOut size={14} />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* ── Desktop Top Navigation Bar (Grouped Dropdowns) ── */}
      <nav className="dev-nav-topbar">
        {/* المجموعة 1: الشركات والمشتركون */}
        <div className="dev-nav-group">
          <button
            type="button"
            className={`dev-nav-group-btn ${['overview', 'companies', 'affiliates'].includes(activeTab) ? 'is-active-group is-current-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenDropdown(openDropdown === 'companies_group' ? null : 'companies_group');
            }}
          >
            <Building2 size={16} />
            <span>الشركات والمشتركون</span>
            <ChevronDown size={14} style={{ transform: openDropdown === 'companies_group' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {openDropdown === 'companies_group' && (
            <div className="dev-nav-dropdown">
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'overview' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('overview'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={15} />
                  <span>نظرة عامة والنبض الحي</span>
                </div>
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'companies' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('companies'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building2 size={15} />
                  <span>إدارة الشركات والاشتراكات</span>
                </div>
                <span className="dev-dropdown-item-badge">{companies.length}</span>
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'affiliates' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('affiliates'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={15} />
                  <span>شبكة الوكلاء والمسوقين</span>
                </div>
                <span className="dev-dropdown-item-badge">{affiliates.length}</span>
              </button>
            </div>
          )}
        </div>

        {/* المجموعة 2: المنظومة والربط */}
        <div className="dev-nav-group">
          <button
            type="button"
            className={`dev-nav-group-btn ${['pricing', 'whatsapp', 'maintenance'].includes(activeTab) ? 'is-active-group is-current-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenDropdown(openDropdown === 'system_group' ? null : 'system_group');
            }}
          >
            <Layers size={16} />
            <span>المنظومة والربط</span>
            {maintenance.disabled_screens?.length > 0 && (
              <span style={{ background: '#f59e0b', color: '#000', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 900 }}>
                {maintenance.disabled_screens.length}
              </span>
            )}
            <ChevronDown size={14} style={{ transform: openDropdown === 'system_group' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {openDropdown === 'system_group' && (
            <div className="dev-nav-dropdown">
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'pricing' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('pricing'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={15} />
                  <span>تسعير وترابط الموديولات</span>
                </div>
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'whatsapp' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('whatsapp'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={15} />
                  <span>مركز واتساب والربط المباشر</span>
                </div>
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'maintenance' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('maintenance'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench size={15} />
                  <span>الأعطال والصيانة و Sandbox</span>
                </div>
                {maintenance.disabled_screens?.length > 0 && (
                  <span style={{ background: '#f59e0b', color: '#000', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 900 }}>
                    {maintenance.disabled_screens.length} معطل
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* المجموعة 3: المالية والمدفوعات */}
        <div className="dev-nav-group">
          <button
            type="button"
            className={`dev-nav-group-btn ${['financials', 'discounts', 'payment_methods'].includes(activeTab) ? 'is-active-group is-current-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenDropdown(openDropdown === 'finance_group' ? null : 'finance_group');
            }}
          >
            <DollarSign size={16} />
            <span>المالية والمدفوعات</span>
            <ChevronDown size={14} style={{ transform: openDropdown === 'finance_group' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {openDropdown === 'finance_group' && (
            <div className="dev-nav-dropdown">
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'financials' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('financials'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign size={15} />
                  <span>الدفتر المالي وصافي الأرباح</span>
                </div>
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'discounts' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('discounts'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TicketPercent size={15} />
                  <span>مصنع أكواد الدعوة والخصم</span>
                </div>
                <span className="dev-dropdown-item-badge">{discounts.length}</span>
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'payment_methods' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('payment_methods'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={15} />
                  <span>وسائل وطرق الدفع للمشتركين</span>
                </div>
                <span className="dev-dropdown-item-badge">{paymentMethods.length}</span>
              </button>
            </div>
          )}
        </div>

        {/* المجموعة 4: الرقابة والتواصل */}
        <div className="dev-nav-group">
          <button
            type="button"
            className={`dev-nav-group-btn ${['announcements', 'telemetry', 'tickets'].includes(activeTab) ? 'is-active-group is-current-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenDropdown(openDropdown === 'control_group' ? null : 'control_group');
            }}
          >
            <ShieldCheck size={16} />
            <span>الرقابة والتواصل</span>
            {(errorLogs.length > 0 || supportTickets.filter(t => t.status === 'open').length > 0) && (
              <span style={{ background: '#f43f5e', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 900 }}>
                {errorLogs.length + supportTickets.filter(t => t.status === 'open').length}
              </span>
            )}
            <ChevronDown size={14} style={{ transform: openDropdown === 'control_group' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {openDropdown === 'control_group' && (
            <div className="dev-nav-dropdown">
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'announcements' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('announcements'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Megaphone size={15} />
                  <span>تعميمات الإدارة العليا</span>
                </div>
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'telemetry' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('telemetry'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={15} />
                  <span>مركز الرصد والأخطاء (Sentry)</span>
                </div>
                {errorLogs.length > 0 && (
                  <span style={{ background: '#f43f5e', color: '#fff', padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 900 }}>
                    {errorLogs.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`dev-dropdown-item ${activeTab === 'tickets' ? 'is-selected' : ''}`}
                onClick={() => { setActiveTab('tickets'); setOpenDropdown(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LifeBuoy size={15} />
                  <span>تذاكر الدعم الفني</span>
                </div>
                {supportTickets.filter(t => t.status === 'open').length > 0 && (
                  <span style={{ background: '#10b981', color: '#fff', padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 900 }}>
                    {supportTickets.filter(t => t.status === 'open').length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Main Layout Body ── */}
      <div className="dev-main-body">
        {/* ── Content Viewport ── */}
        <main className="dev-content-viewport" style={{ width: '100%', flex: 1 }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div>
              <div style={{ marginBottom: '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#ffffff' }}>
                    لوحة النبض والمؤشرات الحية للشركات
                  </h1>
                  <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
                    متابعة فورية للشركات المسجلة، تواريخ التجديد، الإيرادات، وصافي الأرباح
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setIsNewCompanyModalOpen(true)}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: '12px',
                      padding: '10px 18px',
                      fontWeight: 800,
                      fontSize: '13.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <Plus size={16} />
                    <span>إضافة شركة جديدة</span>
                  </button>

                  <button
                    onClick={() => setIsNewDiscountModalOpen(true)}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      borderRadius: '12px',
                      padding: '10px 16px',
                      fontWeight: 800,
                      fontSize: '13.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <TicketPercent size={16} />
                    <span>إنشاء كود خصم</span>
                  </button>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="dev-kpi-grid">
                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>إجمالي الشركات المسجلة</span>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff' }}>{companies.length}</div>
                  <span style={{ fontSize: '11px', color: '#10b981' }}>● بيئات معزولة 100%</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>الاشتراكات النشطة</span>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#10b981' }}>
                    {companies.filter(c => c.status === 'active').length}
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>تعمل بانتظام</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>قرب انتهاء الاشتراك (&lt;= 7 أيام)</span>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#f59e0b' }}>
                    {companies.filter(c => c.is_expiring_soon || c.is_in_grace).length}
                  </div>
                  <span style={{ fontSize: '11px', color: '#f59e0b' }}>تظهر راية للإدارة العليا</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>الشركات الموقوفة</span>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#f43f5e' }}>
                    {companies.filter(c => c.status === 'suspended').length}
                  </div>
                  <span style={{ fontSize: '11px', color: '#f43f5e' }}>تظهر شاشة الإيقاف</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>صافي الأرباح المحققة</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#38bdf8' }}>
                    {(financials.net_profit || 0).toLocaleString()} ج.م
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>بعد خصم المصروفات</span>
                </div>
              </div>

              {/* Quick Companies Feed */}
              <div className="dev-glass-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>حالة اشتراكات الشركات الحالية</h3>
                  <button
                    onClick={() => setActiveTab('companies')}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    عرض الكل &larr;
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--dev-border)', color: '#94a3b8' }}>
                        <th style={{ padding: '10px' }}>الشركة</th>
                        <th style={{ padding: '10px' }}>الكود والمالك</th>
                        <th style={{ padding: '10px' }}>الباقة</th>
                        <th style={{ padding: '10px' }}>الخصم الترويجي الممتد</th>
                        <th style={{ padding: '10px' }}>الأيام المتبقية</th>
                        <th style={{ padding: '10px' }}>الحالة</th>
                        <th style={{ padding: '10px' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.slice(0, 6).map((comp) => (
                        <tr key={comp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 800, color: '#ffffff' }}>
                            {comp.company_name}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ fontWeight: 700 }}>{comp.company_code}</div>
                            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>{comp.owner_username}</div>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: '8px', fontSize: '12px' }}>
                              {comp.plan_id}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            {comp.applied_discount_code ? (
                              <span style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                padding: '3px 8px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 800
                              }}>
                                🏷️ {comp.applied_discount_code} ({comp.discount_months_remaining} شهر متبقي)
                              </span>
                            ) : (
                              <span style={{ color: '#64748b' }}>بدون خصم</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 800 }}>
                            {comp.id === 'comp_primary_default' ? (
                              <span style={{ color: '#10b981' }}>♾️ دائم (مجاني)</span>
                            ) : (
                              <span style={{ color: comp.days_left <= 3 ? '#f43f5e' : comp.days_left <= 7 ? '#f59e0b' : '#38bdf8' }}>
                                {comp.days_left} يوم
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              background: comp.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                              color: comp.status === 'active' ? '#10b981' : '#f43f5e'
                            }}>
                              {comp.status === 'active' ? 'نشط' : comp.status === 'grace_period' ? 'فترة سماح' : 'موقوف'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => handleGhostLogin(comp)}
                                style={{
                                  background: 'linear-gradient(90deg, #d97706, #b45309)',
                                  color: '#fff',
                                  border: 'none',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="دخول شبح كمالك الشركة"
                              >
                                <Eye size={12} />
                                <span>شبح</span>
                              </button>
                              <button
                                onClick={() => handleOpenBackupsModal(comp)}
                                style={{
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="نسخ احتياطي واستعادة"
                              >
                                <Archive size={12} />
                                <span>نسخ</span>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedCompany(comp);
                                  setIsRenewModalOpen(true);
                                }}
                                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
                              >
                                تجديد
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedCompany(comp);
                                  setSuspendForm({
                                    status: comp.status === 'suspended' ? 'active' : 'suspended',
                                    suspension_reason: comp.suspension_reason || 'انتهاء الاشتراك وعدم السداد',
                                    custom_admin_msg: comp.custom_admin_suspension_msg || '',
                                    custom_staff_msg: comp.custom_staff_suspension_msg || ''
                                  });
                                  setIsSuspendModalOpen(true);
                                }}
                                style={{
                                  background: comp.status === 'suspended' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)',
                                  color: comp.status === 'suspended' ? '#10b981' : '#f43f5e',
                                  border: 'none',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  fontWeight: 700
                                }}
                              >
                                {comp.status === 'suspended' ? 'تنشيط' : 'إيقاف'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPANIES MANAGEMENT */}
          {activeTab === 'companies' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>إدارة الشركات والاشتراكات وفترات السماح</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    التحكم في تفعيل أو إيقاف الشركات، فترات السماح، وتخصيص شاشات التعليق
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleCopyRegisterUrl}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      padding: '9px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    title="نسخ رابط صفحة تسجيل شركة جديدة المباشر"
                  >
                    <LinkIcon size={16} />
                    <span>📋 نسخ رابط تسجيل الشركات (/register)</span>
                  </button>

                  <button
                    onClick={() => setIsNewCompanyModalOpen(true)}
                    style={{
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      padding: '9px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={16} />
                    <span>إضافة شركة جديدة</span>
                  </button>
                </div>
              </div>

              <div className="dev-glass-panel">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                  {companies.map((comp) => (
                    <div
                      key={comp.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid var(--dev-border)',
                        borderRadius: '16px',
                        padding: '18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                            {comp.company_name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                            كود: {comp.company_code} · تخزين معزول: {comp.storage_key}
                          </div>
                        </div>

                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: comp.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                          color: comp.status === 'active' ? '#10b981' : '#f43f5e'
                        }}>
                          {comp.status === 'active' ? 'نشط' : 'موقوف'}
                        </span>
                      </div>

                      <div style={{ fontSize: '12.5px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>👤 المالك: <b>{comp.owner_username}</b> ({comp.owner_name})</div>
                        <div>📞 الهاتف: <b>{comp.phone || '—'}</b></div>
                        <div>📅 نهاية الاشتراك: <b>{new Date(comp.subscription_end).toLocaleDateString('ar-EG')}</b></div>
                        <div>⏳ المتبقي: <b style={{ color: '#38bdf8' }}>{comp.id === 'comp_primary_default' ? 'غير محدود' : `${comp.days_left} يوم`}</b></div>
                      </div>

                      {/* Multi-month Discount Highlight */}
                      {comp.applied_discount_code && (
                        <div style={{
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: '#10b981',
                          fontWeight: 700
                        }}>
                          🎁 كود: <b>{comp.applied_discount_code}</b> · خصم {comp.discount_value}% (متبقي {comp.discount_months_remaining} من أصل {comp.discount_duration_months} أشهر)
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
                        {/* Golden Impersonation / Ghost Login Button */}
                        <button
                          onClick={() => handleGhostLogin(comp)}
                          style={{
                            width: '100%',
                            background: 'linear-gradient(90deg, #b45309 0%, #d97706 50%, #b45309 100%)',
                            color: '#ffffff',
                            border: '1px solid rgba(254, 240, 138, 0.4)',
                            padding: '9px 12px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 10px rgba(180, 83, 9, 0.35)'
                          }}
                        >
                          <Eye size={15} />
                          <span>👁️ وضع الشبح (دخول كمالك الشركة)</span>
                        </button>

                        {/* Edit Company & User Details Button */}
                        <button
                          onClick={() => handleOpenEditCompany(comp)}
                          style={{
                            width: '100%',
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            color: '#38bdf8',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                          title="تعديل كافة بيانات الشركة والمالك والموديولات"
                        >
                          <Edit3 size={14} />
                          <span>تعديل الشركة واليوزر والموديولات</span>
                        </button>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                          <button
                            onClick={() => handleOpenBackupsModal(comp)}
                            style={{
                              background: 'rgba(56, 189, 248, 0.12)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              padding: '8px 4px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px'
                            }}
                          >
                            <Archive size={12} />
                            <span>النسخ</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCompany(comp);
                              setIsRenewModalOpen(true);
                            }}
                            style={{
                              background: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              padding: '8px 4px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            تجديد
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCompany(comp);
                              setSuspendForm({
                                status: comp.status === 'suspended' ? 'active' : 'suspended',
                                suspension_reason: comp.suspension_reason || 'انتهاء الاشتراك وعدم السداد',
                                custom_admin_msg: comp.custom_admin_suspension_msg || '',
                                custom_staff_msg: comp.custom_staff_suspension_msg || ''
                              });
                              setIsSuspendModalOpen(true);
                            }}
                            style={{
                              background: comp.status === 'suspended' ? 'rgba(16,185,129,0.2)' : 'rgba(244, 63, 94, 0.2)',
                              color: comp.status === 'suspended' ? '#10b981' : '#f43f5e',
                              border: 'none',
                              padding: '8px 4px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            {comp.status === 'suspended' ? 'تنشيط' : 'إيقاف'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DISCOUNT STUDIO */}
          {activeTab === 'discounts' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>
                    مصنع أكواد الدعوة والخصومات متعددة الشهور
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    إنشاء كوبونات تسويقية تخصم لعدة أشهر متتالية عند التسجيل وتُطبق تلقائياً على فواتير الشركة
                  </p>
                </div>

                <button
                  onClick={() => setIsNewDiscountModalOpen(true)}
                  style={{
                    background: '#38bdf8',
                    color: '#090d16',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={16} />
                  <span>توليد كود خصم جديد</span>
                </button>
              </div>

              <div className="dev-glass-panel">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--dev-border)', color: '#94a3b8' }}>
                        <th style={{ padding: '10px' }}>الكود</th>
                        <th style={{ padding: '10px' }}>عنوان الحملة</th>
                        <th style={{ padding: '10px' }}>قيمة الخصم</th>
                        <th style={{ padding: '10px' }}>مدة السريان (بالأشهر)</th>
                        <th style={{ padding: '10px' }}>الاستخدام / الحد الأقصى</th>
                        <th style={{ padding: '10px' }}>الحالة</th>
                        <th style={{ padding: '10px' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discounts.map((disc) => (
                        <tr key={disc.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 900, color: '#38bdf8', fontSize: '15px' }}>
                            {disc.code}
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 700, color: '#ffffff' }}>
                            {disc.title}
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 800, color: '#10b981' }}>
                            {disc.discount_type === 'percentage' ? `${disc.discount_value}%` : `${disc.discount_value} ج.م`}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '3px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
                              {disc.duration_months > 1 ? `سارٍ لمدة ${disc.duration_months} أشهر` : 'شهر واحد فقط'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <b>{disc.used_count}</b> / {disc.max_uses} شركة
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ color: disc.is_active ? '#10b981' : '#f43f5e', fontWeight: 700 }}>
                              {disc.is_active ? '● نشط' : '○ معطل'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => handleOpenEditDiscount(disc)}
                                style={{
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  color: '#38bdf8',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '12px',
                                  fontWeight: 700
                                }}
                                title="تعديل كود الخصم والقيمة والأشهر"
                              >
                                <Edit3 size={13} />
                                <span>تعديل</span>
                              </button>

                              <button
                                onClick={() => handleDeleteDiscount(disc.id)}
                                style={{ background: 'rgba(244, 63, 94, 0.15)', border: 'none', color: '#f43f5e', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}
                                title="حذف كود الخصم"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PAGE PRICING & DEPENDENCIES */}
          {activeTab === 'pricing' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>تسعير الصفحات وترابط الموديولات البرمجية</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                  تحديد أسعار كل شاشة في النظام وربط الصفحات التي تعتمد على بعضها برمجياً
                </p>
              </div>

              <div className="dev-glass-panel">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {modules.map((mod) => (
                    <div
                      key={mod.module_id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid var(--dev-border)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '24px' }}>{mod.icon || '📦'}</span>
                        <div>
                          <div style={{ fontWeight: 800, color: '#ffffff' }}>{mod.name_ar}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{mod.module_id}</div>
                        </div>
                      </div>

                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {mod.description || 'وحدة برمجية متكاملة'}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--dev-border)' }}>
                        <span style={{ fontSize: '12px', color: '#cbd5e1' }}>السعر الشهري:</span>
                        <b style={{ fontSize: '16px', color: '#10b981' }}>{mod.price_monthly} ج.م / شهر</b>
                      </div>

                      {mod.required_dependencies?.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>
                          ⚠️ تتطلب برمجياً: {mod.required_dependencies.join(' + ')}
                        </div>
                      )}

                      <button
                        onClick={() => handleOpenEditModule(mod)}
                        style={{
                          width: '100%',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          marginTop: '4px'
                        }}
                      >
                        <Edit3 size={13} />
                        <span>تعديل السعر والترابط</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MAINTENANCE & SANDBOX */}
          {activeTab === 'maintenance' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>
                  غرفة التحكم في الأعطال والصيانة الجزئية وبيئة تجربة المطور (Sandbox)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                  إيقاف شاشة معينة فقط للإصلاح مع إمكانية تجربة الشاشة حصرياً للمطور
                </p>
              </div>

              {/* Developer Sandbox Card */}
              <div style={{
                background: maintenance.developer_sandbox_active ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(2, 132, 199, 0.1) 100%)' : 'rgba(30, 41, 59, 0.4)',
                border: `1.5px solid ${maintenance.developer_sandbox_active ? '#10b981' : 'var(--dev-border)'}`,
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🧪 بيئة المطور لتجربة وإصلاح الأعطال (Developer Sandbox Bypass)</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: maintenance.developer_sandbox_active ? '#10b981' : '#64748b', color: '#fff' }}>
                      {maintenance.developer_sandbox_active ? 'مفعّل' : 'معطل'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '4px' }}>
                    تتيح للمطور الدخول وفحص وتجربة الشاشات المعطلة دون أن تظهر للأعطال أي تأثير على العملاء
                  </div>
                </div>

                <button
                  onClick={handleToggleSandbox}
                  style={{
                    background: maintenance.developer_sandbox_active ? '#10b981' : 'rgba(255,255,255,0.1)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {maintenance.developer_sandbox_active ? 'تعطيل وضع Sandbox' : 'تفعيل وضع Sandbox'}
                </button>
              </div>

              {/* Screen Maintenance Toggles */}
              <div className="dev-glass-panel">
                <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 800 }}>التحكم في إيقاف شاشات النظام للإصلاح</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                  {modules.map((m) => {
                    const isDown = maintenance.disabled_screens?.includes(m.module_id);
                    return (
                      <div
                        key={m.module_id}
                        style={{
                          background: isDown ? 'rgba(244, 63, 94, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                          border: `1px solid ${isDown ? '#f43f5e' : 'var(--dev-border)'}`,
                          borderRadius: '12px',
                          padding: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, color: '#ffffff' }}>{m.name_ar}</div>
                          <div style={{ fontSize: '11px', color: isDown ? '#f43f5e' : '#10b981', fontWeight: 700 }}>
                            {isDown ? '⚠️ قيد الصيانة والإصلاح' : '● تعمل بصورة طبيعية'}
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleScreenMaintenance(m.module_id, isDown)}
                          style={{
                            background: isDown ? '#10b981' : 'rgba(244, 63, 94, 0.2)',
                            color: isDown ? '#fff' : '#f43f5e',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          {isDown ? 'تشغيل' : 'إيقاف للصيانة'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: WHATSAPP COMMAND CENTER & VPS SERVER INTEGRATION */}
          {activeTab === 'whatsapp' && (
            <div>
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>
                    مركز مراسلات الواتساب والربط المباشر مع سيرفر VPS
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    فحص حالة خادم الواتساب المباشر، مسح رمز QR للاقتران، إرسال رسائل اختبارية، وبث جماعي لكافة الشركات
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={fetchWaStatus}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RefreshCw size={14} />
                    <span>فحص الاتصال</span>
                  </button>

                  <button
                    onClick={handleDisconnectWa}
                    style={{
                      background: 'rgba(244, 63, 94, 0.15)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      color: '#f43f5e',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <LogOut size={14} />
                    <span>إعادة ضبط وتوليد QR</span>
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              <div style={{
                background: waStatus.status === 'CONNECTED'
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%)'
                  : waStatus.status === 'QR_READY'
                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.15) 100%)'
                    : 'linear-gradient(135deg, rgba(244, 63, 94, 0.15) 0%, rgba(225, 29, 72, 0.15) 100%)',
                border: `1.5px solid ${waStatus.status === 'CONNECTED' ? '#10b981' : waStatus.status === 'QR_READY' ? '#f59e0b' : '#f43f5e'}`,
                borderRadius: '16px',
                padding: '18px 22px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: waStatus.status === 'CONNECTED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    {waStatus.status === 'CONNECTED' ? '🟢' : waStatus.status === 'QR_READY' ? '📷' : '⚠️'}
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                      {waStatus.status === 'CONNECTED'
                        ? `خادم الواتساب متصل بنجاح (${waStatus.phone || 'متصل'})`
                        : waStatus.status === 'QR_READY'
                          ? 'بانتظار مسح رمز الاستجابة السريعة (QR Code)'
                          : waStatus.status === 'CONNECTING'
                            ? 'جاري محاولة الاتصال بالخادم...'
                            : 'خادم الواتساب غير متصل حالياً'}
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '3px' }}>
                      {waStatus.status === 'CONNECTED'
                        ? `الجهاز المقترن: ${waStatus.deviceName || 'WhatsApp Gateway'} · الرسائل المرسلة: ${waStatus.sentCount || 0}`
                        : waStatus.status === 'QR_READY'
                          ? 'افتح تطبيق واتساب على هاتفك > الأجهزة المرتبطة > ربط جهاز وامسح الرمز أدناه'
                          : (waStatus.lastError || 'يرجى تشغيل السيرفر أو فحص الاتصال')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 800,
                    background: waStatus.status === 'CONNECTED' ? '#10b981' : waStatus.status === 'QR_READY' ? '#f59e0b' : '#f43f5e',
                    color: '#ffffff'
                  }}>
                    {waStatus.status === 'CONNECTED' ? 'CONNECTED' : waStatus.status === 'QR_READY' ? 'QR READY' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {/* QR Code Section (if available) */}
              {waStatus.qrCodeDataUrl && waStatus.status !== 'CONNECTED' && (
                <div className="dev-glass-panel" style={{ textAlign: 'center', padding: '28px', marginBottom: '20px' }}>
                  <div style={{ display: 'inline-block', padding: '16px', background: '#ffffff', borderRadius: '16px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
                    <img src={waStatus.qrCodeDataUrl} alt="WhatsApp QR Code" style={{ width: '240px', height: '240px', display: 'block' }} />
                  </div>
                  <div style={{ marginTop: '16px', fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
                    امسح رمز الـ QR للاقتران الفوري مع منظومة الإشعارات
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                    يتم تحديث الرمز تلقائياً كل بضع ثوانٍ. بعد المسح سيتم تفعيل الإرسال السحابي فوراً.
                  </div>
                </div>
              )}

              {/* Direct Message Tester & Broadcast Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '18px', marginBottom: '22px' }}>
                {/* Single Direct WhatsApp Sender */}
                <div className="dev-glass-panel">
                  <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Smartphone size={18} color="#10b981" />
                    <span>إرسال رسالة تجريبية مباشرة لأي رقم</span>
                  </h3>
                  <form onSubmit={handleSendDirectWa} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>رقم الهاتف (مع كود الدولة - مثال: 201012345678 أو 010...)</label>
                      <input
                        type="text"
                        required
                        placeholder="01012345678"
                        value={waDirectPhone}
                        onChange={(e) => setWaDirectPhone(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15,23,42,0.6)', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>نص الرسالة</label>
                      <textarea
                        rows={3}
                        required
                        placeholder="اكتب رسالة تجريبية لفحص سرعة الخادم..."
                        value={waDirectMsg}
                        onChange={(e) => setWaDirectMsg(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(15,23,42,0.6)', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingDirectWa}
                      style={{
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '10px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Send size={15} />
                      <span>{isSendingDirectWa ? 'جاري الإرسال...' : 'إرسال الرسالة الآن'}</span>
                    </button>
                  </form>
                </div>

                {/* Broadcast Composer */}
                <div className="dev-glass-panel">
                  <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Megaphone size={18} color="#38bdf8" />
                    <span>إرسال تعميم جماعي لكافة الشركات</span>
                  </h3>
                  <textarea
                    rows={5}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="اكتب الرسالة الجماعية هنا (مثال: عروض الترقية، إشعار تحديثات النظام، أو تنبيهات الاشتراكات)..."
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--dev-border)',
                      borderRadius: '10px',
                      padding: '10px',
                      color: '#fff',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleSendWhatsAppBroadcast}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      background: '#25d366',
                      color: '#064e3b',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '10px',
                      fontWeight: 900,
                      fontSize: '13.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Send size={15} />
                    <span>بث جماعي إلى ({companies.length}) شركة</span>
                  </button>
                </div>
              </div>

              {/* Local Server Download Pack */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid var(--dev-border)',
                borderRadius: '14px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#fff' }}>
                    تنزيل حزمة الخادم المحلي المستقل (WhatsApp Gateway Local Executable)
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    لمن يرغب في تشغيل الخادم على جهازه الشخصي دون الاعتماد على VPS
                  </div>
                </div>

                <a
                  href={`${API_BASE_URL}/developer/whatsapp/download-server`}
                  download
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--dev-border)',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} />
                  <span>تحميل السيرفر (WhatsApp.bat)</span>
                </a>
              </div>
            </div>
          )}

          {/* TAB 7: FINANCIALS & P&L */}
          {activeTab === 'financials' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>الدفتر المالي، المصروفات، وصافي الأرباح</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    متابعة اشتراكات الشركات والمصروفات التشغيلية لحساب صافي الأرباح وإدارة بيانات فواتير الشراء الرسمية
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleOpenEditInvoiceSettings}
                    style={{
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '9px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 14px rgba(14, 165, 233, 0.3)'
                    }}
                  >
                    <Sliders size={16} />
                    <span>تعديل بيانات وترويسة الفاتورة الرسمية</span>
                  </button>

                  <button
                    onClick={() => setIsNewExpenseModalOpen(true)}
                    style={{
                      background: '#38bdf8',
                      color: '#090d16',
                      border: 'none',
                      padding: '9px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={16} />
                    <span>تسجيل مصروف تشغيلي جديد</span>
                  </button>
                </div>
              </div>

              {/* Financial KPI Summary */}
              <div className="dev-kpi-grid">
                <div className="dev-kpi-card" style={{ borderTop: '3px solid #10b981' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>إجمالي إيرادات الاشتراكات</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#10b981' }}>
                    {(financials.total_revenue || 0).toLocaleString()} ج.م
                  </div>
                </div>

                <div className="dev-kpi-card" style={{ borderTop: '3px solid #f43f5e' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>إجمالي المصروفات التشغيلية</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#f43f5e' }}>
                    {(financials.total_expenses || 0).toLocaleString()} ج.م
                  </div>
                </div>

                <div className="dev-kpi-card" style={{ borderTop: '3px solid #38bdf8' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>صافي الأرباح (Net Profit)</span>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#38bdf8' }}>
                    {(financials.net_profit || 0).toLocaleString()} ج.م
                  </div>
                  <span style={{ fontSize: '11px', color: '#10b981' }}>هامش الربح: {financials.profit_margin || 0}%</span>
                </div>
              </div>

              {/* Invoices List - Official Invoices Issued to Companies */}
              <div className="dev-glass-panel" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>سجل فواتير الاشتراكات الصادرة للشركات</h3>
                    <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                      إدارة وتعديل بيانات ومبالغ أي فاتورة اشتراك صادرة لأي صيدلية أو شركة
                    </p>
                  </div>
                  <button
                    onClick={handleOpenEditInvoiceSettings}
                    style={{
                      background: 'rgba(14, 165, 233, 0.12)',
                      border: '1px solid rgba(14, 165, 233, 0.3)',
                      color: '#38bdf8',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Edit3 size={13} />
                    <span>تعديل الترويسة والبيانات المصدرة</span>
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--dev-border)', color: '#94a3b8' }}>
                        <th style={{ padding: '8px' }}>رقم الفاتورة</th>
                        <th style={{ padding: '8px' }}>الشركة والمسؤول</th>
                        <th style={{ padding: '8px' }}>المبلغ الأصلي</th>
                        <th style={{ padding: '8px' }}>الخصم</th>
                        <th style={{ padding: '8px' }}>الصافي المحصل</th>
                        <th style={{ padding: '8px' }}>طريقة الدفع</th>
                        <th style={{ padding: '8px' }}>الحالة</th>
                        <th style={{ padding: '8px' }}>التاريخ</th>
                        <th style={{ padding: '8px' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                            لا توجد فواتير مسجلة حالياً
                          </td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '10px 8px', fontWeight: 800, color: '#38bdf8' }}>{inv.invoice_number}</td>
                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ fontWeight: 800, color: '#fff' }}>{inv.company_name || 'شركة معتمدة'}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{inv.owner_name} {inv.owner_phone ? `(${inv.owner_phone})` : ''}</div>
                            </td>
                            <td style={{ padding: '10px 8px' }}>{parseFloat(inv.amount || 0).toLocaleString()} ج.م</td>
                            <td style={{ padding: '10px 8px', color: '#10b981' }}>
                              {parseFloat(inv.discount_amount || 0) > 0 ? `-${parseFloat(inv.discount_amount).toLocaleString()} ج.م` : '—'}
                            </td>
                            <td style={{ padding: '10px 8px', fontWeight: 800, color: '#38bdf8' }}>
                              {parseFloat(inv.net_amount || 0).toLocaleString()} ج.م
                            </td>
                            <td style={{ padding: '10px 8px' }}>{inv.payment_method}</td>
                            <td style={{ padding: '10px 8px' }}>
                              <span style={{
                                background: inv.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                color: inv.status === 'approved' ? '#34d399' : '#fbbf24',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800
                              }}>
                                {inv.status === 'approved' ? 'معتمدة' : 'معلقة'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', fontSize: '11px', color: '#94a3b8' }}>
                              {new Date(inv.created_at).toLocaleDateString('ar-EG')}
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <button
                                onClick={() => handleOpenEditInvoice(inv)}
                                style={{
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid var(--dev-border)',
                                  color: '#fff',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11.5px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Edit3 size={12} />
                                <span>تعديل</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expenses List */}
              <div className="dev-glass-panel">
                <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 800 }}>سجل المصروفات التشغيلية الأخيرة</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--dev-border)', color: '#94a3b8' }}>
                        <th style={{ padding: '8px' }}>البند</th>
                        <th style={{ padding: '8px' }}>التصنيف</th>
                        <th style={{ padding: '8px' }}>المبلغ</th>
                        <th style={{ padding: '8px' }}>التاريخ</th>
                        <th style={{ padding: '8px' }}>ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((exp) => (
                        <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 800, color: '#fff' }}>{exp.title}</td>
                          <td style={{ padding: '10px 8px' }}>{exp.category}</td>
                          <td style={{ padding: '10px 8px', fontWeight: 800, color: '#f43f5e' }}>{exp.amount} ج.م</td>
                          <td style={{ padding: '10px 8px' }}>{exp.expense_date}</td>
                          <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{exp.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>تعميمات وإشعارات الإدارة العليا للشركات</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    بث إشعارات وتوجيهات تظهر حصرياً في مركز إشعارات الإدارة العليا والمالك
                  </p>
                </div>

                <button
                  onClick={() => setIsAnnouncementModalOpen(true)}
                  style={{
                    background: '#f59e0b',
                    color: '#000',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={16} />
                  <span>بث تعميم جديد</span>
                </button>
              </div>

              <div className="dev-glass-panel">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {announcements.map((ann) => (
                    <div
                      key={ann.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid var(--dev-border)',
                        borderRadius: '12px',
                        padding: '14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>{ann.title}</div>
                        <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '4px' }}>{ann.content}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                          الهدف: {ann.target_company_id === 'all' ? 'كافة الشركات' : ann.target_company_id} · التاريخ: {new Date(ann.created_at).toLocaleString('ar-EG')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: LIVE TELEMETRY & BUG SENTRY HUB */}
          {activeTab === 'telemetry' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={22} color="#38bdf8" />
                    <span>مركز الرصد ومصيدة الأخطاء الحية (Bug Sentry Hub)</span>
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    رصد لحظي لسرعة استجابة الخادم، المتصلين عبر السوكت، واصطياد الانهيارات والأخطاء من كافة الأجهزة والمتصفحات
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={fetchData}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--dev-border)',
                      color: '#ffffff',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RefreshCw size={14} className={isLoading ? 'spinner' : ''} />
                    <span>تحديث فوري</span>
                  </button>

                  {errorLogs.length > 0 && (
                    <button
                      onClick={handleClearErrorLogs}
                      style={{
                        background: 'rgba(244, 63, 94, 0.15)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        color: '#f43f5e',
                        padding: '8px 14px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Trash2 size={14} />
                      <span>تفريغ سجل الأخطاء ({errorLogs.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Telemetry KPIs Grid */}
              <div className="dev-kpi-grid">
                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>سرعة استجابة قاعدة البيانات (DB Latency)</span>
                  <div style={{
                    fontSize: '26px',
                    fontWeight: 900,
                    color: telemetryStats.db_latency_ms <= 15 ? '#10b981' : telemetryStats.db_latency_ms <= 60 ? '#f59e0b' : '#f43f5e'
                  }}>
                    {telemetryStats.db_latency_ms || 1} ms
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>استعلام فوري متزامن (Ping)</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>المستخدمون المتصلون عبر السوكت</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#38bdf8' }}>
                    {telemetryStats.connected_clients || 0}
                  </div>
                  <span style={{ fontSize: '11px', color: '#10b981' }}>● اتصالات نشطة بالوقت الفعلي</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>استهلاك ذاكرة Node Heap</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#a855f7' }}>
                    {telemetryStats.memory_usage_mb || 0} MB
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>استهلاك الرام الفعلي</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>مدة عمل الخادم (Uptime)</span>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2e8f0' }}>
                    {Math.floor((telemetryStats.server_uptime_seconds || 0) / 3600)} ساعة و {Math.floor(((telemetryStats.server_uptime_seconds || 0) % 3600) / 60)} دقيقة
                  </div>
                  <span style={{ fontSize: '11px', color: '#10b981' }}>● بدون أي انقطاع</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>الأخطاء المرصودة (Sentry Trapped)</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: errorLogs.length > 0 ? '#f43f5e' : '#10b981' }}>
                    {errorLogs.length}
                  </div>
                  <span style={{ fontSize: '11px', color: errorLogs.length > 0 ? '#f43f5e' : '#10b981' }}>
                    {errorLogs.length > 0 ? 'تتطلب فحصاً برمجياً' : 'النظام سليم 100%'}
                  </span>
                </div>
              </div>

              {/* Errors Feed */}
              <div className="dev-glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                    سجل اصطياد الأخطاء من متصفحات العملاء (Client-side Crashes)
                  </h3>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    يتم الإرسال تلقائياً في الخلفية عند حدوث أي خطأ
                  </span>
                </div>

                {errorLogs.length === 0 ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: '#10b981', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                    <div style={{ fontWeight: 800, fontSize: '16px' }}>مصيدة الأخطاء نظيفة بالكامل!</div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                      لم يسجل أي عميل أو صيدلية أي أخطاء استثنائية في المتصفح حتى الآن.
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--dev-border)', color: '#94a3b8' }}>
                          <th style={{ padding: '10px' }}>التوقيت</th>
                          <th style={{ padding: '10px' }}>كود الشركة</th>
                          <th style={{ padding: '10px' }}>الشاشة / المسار</th>
                          <th style={{ padding: '10px' }}>المستخدم</th>
                          <th style={{ padding: '10px' }}>نص الخطأ المرصود</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorLogs.map((err) => (
                          <tr key={err.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '10px', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '12px' }}>
                              {new Date(err.created_at).toLocaleTimeString('ar-EG')} - {new Date(err.created_at).toLocaleDateString('ar-EG')}
                            </td>
                            <td style={{ padding: '10px', fontWeight: 800, color: '#38bdf8' }}>
                              {err.company_code || err.company_id || 'عام'}
                            </td>
                            <td style={{ padding: '10px', color: '#f59e0b', fontFamily: 'monospace' }}>
                              {err.screen_name || '/'}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '6px', fontSize: '11px' }}>
                                {err.user_role || 'مجهول'}
                              </span>
                            </td>
                            <td style={{ padding: '10px', color: '#f43f5e', fontWeight: 700 }}>
                              <div>{err.error_message}</div>
                              {err.error_stack && (
                                <details style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                                  <summary style={{ cursor: 'pointer' }}>عرض تفاصيل الـ Stack</summary>
                                  <pre style={{ background: '#020617', padding: '8px', borderRadius: '6px', overflowX: 'auto', maxHeight: '120px', direction: 'ltr', textAlign: 'left', color: '#fca5a5' }}>
                                    {err.error_stack}
                                  </pre>
                                </details>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 9: AFFILIATE & PARTNER NETWORK */}
          {activeTab === 'affiliates' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={22} color="#10b981" />
                    <span>شبكة الوكلاء والمسوقين بالعمولة (Affiliate Hub)</span>
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    إدارة مناديب الدعاية والشركاء، احتساب العمولات آلياً مع كل تجديد، وإرسال تقارير الأرباح عبر الواتساب
                  </p>
                </div>

                <button
                  onClick={() => setIsAffiliateModalOpen(true)}
                  style={{
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={16} />
                  <span>إضافة وكيل / مسوق جديد</span>
                </button>
              </div>

              {/* Affiliates KPI Summary */}
              <div className="dev-kpi-grid">
                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>إجمالي الوكلاء والمسوقين</span>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff' }}>{affiliates.length}</div>
                  <span style={{ fontSize: '11px', color: '#10b981' }}>● شبكة نشطة</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>إجمالي العمولات المستحقة</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#10b981' }}>
                    {affiliates.reduce((sum, a) => sum + Number(a.total_earned || 0), 0).toLocaleString()} ج.م
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>عن كافة الاشتراكات المسجلة</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>إجمالي المسدد للوكلاء</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#38bdf8' }}>
                    {affiliates.reduce((sum, a) => sum + Number(a.total_paid || 0), 0).toLocaleString()} ج.م
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>تم تحويلها للمسوقين</span>
                </div>

                <div className="dev-kpi-card">
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>الأرصدة المتبقية المستحقة للصرف</span>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#f59e0b' }}>
                    {affiliates.reduce((sum, a) => sum + Number(a.balance || 0), 0).toLocaleString()} ج.م
                  </div>
                  <span style={{ fontSize: '11px', color: '#f59e0b' }}>جاهزة للتحويل</span>
                </div>
              </div>

              {/* Affiliates Table */}
              <div className="dev-glass-panel">
                {affiliates.length === 0 ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                    لا يوجد وكلاء مسجلون حالياً. اضغط على "إضافة وكيل / مسوق جديد" لإنشاء كود تسويقي ونسبة عمولة.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13.5px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--dev-border)', color: '#94a3b8' }}>
                          <th style={{ padding: '10px' }}>اسم الوكيل</th>
                          <th style={{ padding: '10px' }}>الهاتف</th>
                          <th style={{ padding: '10px' }}>كود الخصم (Promo Code)</th>
                          <th style={{ padding: '10px' }}>نسبة العمولة</th>
                          <th style={{ padding: '10px' }}>الشركات المشتركة</th>
                          <th style={{ padding: '10px' }}>إجمالي الأرباح</th>
                          <th style={{ padding: '10px' }}>المسدد</th>
                          <th style={{ padding: '10px' }}>الرصيد المعلق</th>
                          <th style={{ padding: '10px' }}>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {affiliates.map((aff) => (
                          <tr key={aff.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '12px 10px', fontWeight: 800, color: '#ffffff' }}>
                              {aff.name}
                            </td>
                            <td style={{ padding: '12px 10px', color: '#cbd5e1' }}>
                              {aff.phone}
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '4px 10px', borderRadius: '8px', fontWeight: 900, fontSize: '13px' }}>
                                🏷️ {aff.promo_code}
                              </span>
                            </td>
                            <td style={{ padding: '12px 10px', fontWeight: 800, color: '#10b981' }}>
                              {aff.commission_percent}%
                            </td>
                            <td style={{ padding: '12px 10px', fontWeight: 700 }}>
                              {aff.companies_count || 0} صيدليات
                            </td>
                            <td style={{ padding: '12px 10px', fontWeight: 800, color: '#10b981' }}>
                              {Number(aff.total_earned || 0).toLocaleString()} ج.م
                            </td>
                            <td style={{ padding: '12px 10px', color: '#94a3b8' }}>
                              {Number(aff.total_paid || 0).toLocaleString()} ج.م
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              <span style={{
                                background: Number(aff.balance || 0) > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)',
                                color: Number(aff.balance || 0) > 0 ? '#f59e0b' : '#94a3b8',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontWeight: 900
                              }}>
                                {Number(aff.balance || 0).toLocaleString()} ج.م
                              </span>
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => {
                                    setSelectedAffiliate(aff);
                                    setPayoutForm({ amount: aff.balance > 0 ? aff.balance : '', notes: '' });
                                    setIsPayoutModalOpen(true);
                                  }}
                                  style={{
                                    background: '#10b981',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <DollarSign size={13} />
                                  <span>صرف</span>
                                </button>

                                <button
                                  onClick={() => handleGenerateAffiliateWhatsApp(aff)}
                                  style={{
                                    background: '#25d366',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="إرسال تقرير الأرباح عبر الواتساب"
                                >
                                  <MessageSquare size={13} />
                                  <span>واتساب</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 10: IN-APP SUPPORT TICKETS */}
          {activeTab === 'tickets' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LifeBuoy size={22} color="#38bdf8" />
                    <span>مركز تذاكر ومحادثات الدعم الفني المباشر</span>
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    مراسلة فورية مباشرة لحل مشاكل واستفسارات أصحاب الصيدليات وتحديث الحالات لحظياً
                  </p>
                </div>

                {/* Filter Tabs */}
                <div style={{ display: 'flex', gap: '6px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '10px', border: '1px solid var(--dev-border)' }}>
                  {[
                    { id: 'all', label: `الكل (${supportTickets.length})` },
                    { id: 'open', label: `مفتوحة (${supportTickets.filter(t => t.status === 'open').length})` },
                    { id: 'in_progress', label: `قيد المتابعة (${supportTickets.filter(t => t.status === 'in_progress').length})` },
                    { id: 'resolved', label: `تم الحل (${supportTickets.filter(t => t.status === 'resolved').length})` }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setTicketFilter(f.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: ticketFilter === f.id ? '#38bdf8' : 'transparent',
                        color: ticketFilter === f.id ? '#090d16' : '#94a3b8',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Two-Column Support Desk */}
              <div style={{ display: 'grid', gridTemplateColumns: selectedTicket ? '360px 1fr' : '1fr', gap: '18px' }}>
                {/* Tickets Inbox Column */}
                <div className="dev-glass-panel" style={{ maxHeight: '720px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#94a3b8', marginBottom: '12px' }}>
                    صندوق التذاكر الواردة ({supportTickets.length})
                  </div>

                  {(() => {
                    const filtered = supportTickets.filter(t => ticketFilter === 'all' ? true : t.status === ticketFilter);
                    if (filtered.length === 0) {
                      return (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                          لا توجد تذاكر في هذا القسم حالياً.
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {filtered.map((tkt) => {
                          const isSelected = selectedTicket?.id === tkt.id;
                          return (
                            <div
                              key={tkt.id}
                              onClick={() => {
                                setSelectedTicket(tkt);
                                setTicketReplyStatus(tkt.status);
                              }}
                              style={{
                                padding: '14px',
                                borderRadius: '12px',
                                border: isSelected ? '1.5px solid #38bdf8' : '1px solid var(--dev-border)',
                                background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontWeight: 900, fontSize: '14px', color: '#ffffff' }}>
                                  {tkt.title}
                                </span>
                                <span style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontWeight: 800,
                                  background: tkt.status === 'open' ? 'rgba(16, 185, 129, 0.2)' : tkt.status === 'resolved' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                  color: tkt.status === 'open' ? '#10b981' : tkt.status === 'resolved' ? '#94a3b8' : '#f59e0b'
                                }}>
                                  {tkt.status === 'open' ? '🟢 مفتوحة' : tkt.status === 'resolved' ? '✅ تم الحل' : '⏳ قيد المتابعة'}
                                </span>
                              </div>

                              <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700, marginBottom: '4px' }}>
                                🏢 {tkt.company_name}
                              </div>

                              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{tkt.category === 'technical' ? 'عطل تقني' : tkt.category === 'billing' ? 'ماليات' : 'اقتراح ميزة'} · {tkt.priority === 'urgent' ? '🚨 عاجل' : 'عادي'}</span>
                                <span>{new Date(tkt.last_reply_at || tkt.created_at).toLocaleDateString('ar-EG')}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Active Ticket Conversation Desk */}
                {selectedTicket ? (
                  <div className="dev-glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '720px' }}>
                    {/* Ticket Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--dev-border)', paddingBottom: '14px', marginBottom: '14px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                          {selectedTicket.title}
                        </h3>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                          🏢 الصيدلية: <b style={{ color: '#38bdf8' }}>{selectedTicket.company_name}</b> · تذكرة: #{selectedTicket.id}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                          value={ticketReplyStatus}
                          onChange={(e) => setTicketReplyStatus(e.target.value)}
                          style={{ background: '#1e293b', color: '#ffffff', border: '1px solid var(--dev-border)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: 800 }}
                        >
                          <option value="open">حالة: مفتوحة 🟢</option>
                          <option value="in_progress">حالة: قيد المتابعة ⏳</option>
                          <option value="resolved">حالة: تم الحل ✅</option>
                        </select>

                        <button
                          onClick={() => setSelectedTicket(null)}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Messages Thread Feed */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 0' }}>
                      {(selectedTicket.messages || []).map((msg, i) => {
                        const isDev = msg.sender === 'developer';
                        return (
                          <div
                            key={i}
                            style={{
                              alignSelf: isDev ? 'flex-start' : 'flex-end',
                              maxWidth: '75%',
                              padding: '12px 16px',
                              borderRadius: '14px',
                              background: isDev
                                ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
                                : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                              border: isDev ? '1px solid var(--dev-border)' : '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#ffffff',
                              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                            }}
                          >
                            <div style={{ fontSize: '11px', opacity: 0.85, fontWeight: 800, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isDev ? <span>👑 أنت (مطور المنظومة)</span> : <span>👤 {msg.sender_name || 'العميل'}</span>}
                              <span>·</span>
                              <span>{new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ fontSize: '13.5px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                              {msg.message}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply Input Box */}
                    <form onSubmit={handleReplyTicket} style={{ borderTop: '1px solid var(--dev-border)', paddingTop: '14px', marginTop: 'auto', display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="اكتب رد الدعم الفني لصاحب الصيدلية هنا..."
                        value={ticketReplyText}
                        onChange={(e) => setTicketReplyText(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          borderRadius: '10px',
                          background: '#1e293b',
                          border: '1px solid var(--dev-border)',
                          color: '#ffffff',
                          fontSize: '13.5px'
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!ticketReplyText.trim()}
                        style={{
                          background: '#38bdf8',
                          color: '#090d16',
                          border: 'none',
                          padding: '0 20px',
                          borderRadius: '10px',
                          fontWeight: 900,
                          fontSize: '13.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Send size={15} />
                        <span>إرسال الرد</span>
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="dev-glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '720px', color: '#94a3b8' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎫</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>اختر تذكرة لمعاينتها ومراسلة الصيدلية</div>
                      <div style={{ fontSize: '13px', marginTop: '4px' }}>اضغط على أي تذكرة من الصندوق لعرض سجل المحادثة والرد الفوري</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 11: SYSTEM PAYMENT METHODS HUB */}
          {activeTab === 'payment_methods' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={22} color="#38bdf8" />
                    <span>إدارة وسائل وطرق الدفع للمشتركين</span>
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    تسجيل وتعديل الحسابات البنكية، أرقام إنستاباي، والمحافظ الإلكترونية التي تظهر للمشتركين في صفحة تجديد الاشتراكات
                  </p>
                </div>

                <button
                  onClick={() => handleOpenPaymentMethodModal()}
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    padding: '9px 18px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={16} />
                  <span>إضافة وسيلة دفع جديدة</span>
                </button>
              </div>

              <div className="dev-glass-panel">
                {paymentMethods.length === 0 ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                    لا توجد وسائل دفع مسجلة حالياً. اضغط على "إضافة وسيلة دفع جديدة" لإضافة إنستاباي، فودافون كاش، أو حساب بنكي.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                    {paymentMethods.map((pm) => (
                      <div
                        key={pm.id}
                        style={{
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: `1px solid ${pm.is_active ? 'var(--dev-border)' : 'rgba(244, 63, 94, 0.3)'}`,
                          borderRadius: '16px',
                          padding: '18px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '10px',
                              background: pm.type === 'instapay'
                                ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)'
                                : pm.type === 'vodafone_cash'
                                  ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                                  : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '20px'
                            }}>
                              {pm.type === 'instapay' ? '⚡' : pm.type === 'vodafone_cash' ? '📱' : '🏦'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 900, color: '#ffffff', fontSize: '15.5px' }}>
                                {pm.title}
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                {pm.account_name || 'حساب رسمي'}
                              </div>
                            </div>
                          </div>

                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '8px',
                            background: pm.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                            color: pm.is_active ? '#10b981' : '#f43f5e'
                          }}>
                            {pm.is_active ? '● مفعلة' : '○ معطلة'}
                          </span>
                        </div>

                        <div style={{
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '10px',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <div>
                            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>رقم الحساب / المحفظة / المعرف:</div>
                            <div style={{ fontSize: '14.5px', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.5px', direction: 'ltr', textAlign: 'right' }}>
                              {pm.account_identifier}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(pm.account_identifier);
                              showToast?.('📋 تم نسخ رقم الحساب');
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '5px 8px',
                              cursor: 'pointer',
                              fontSize: '11px'
                            }}
                          >
                            نسخ
                          </button>
                        </div>

                        {pm.badge_text && (
                          <div style={{ fontSize: '11.5px', color: '#10b981', fontWeight: 700 }}>
                            🏷️ {pm.badge_text}
                          </div>
                        )}

                        {pm.instructions && (
                          <div style={{ fontSize: '12px', color: '#94a3b8', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px' }}>
                            ℹ️ {pm.instructions}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--dev-border)' }}>
                          <button
                            onClick={() => handleOpenPaymentMethodModal(pm)}
                            style={{
                              flex: 1,
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#38bdf8',
                              padding: '7px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px'
                            }}
                          >
                            <Edit3 size={13} />
                            <span>تعديل الوسيلة</span>
                          </button>

                          <button
                            onClick={() => handleDeletePaymentMethod(pm.id)}
                            style={{
                              background: 'rgba(244, 63, 94, 0.15)',
                              border: '1px solid rgba(244, 63, 94, 0.3)',
                              color: '#f43f5e',
                              padding: '7px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                            title="حذف وسيلة الدفع"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Mobile Bottom Navigation Dock ── */}
      <nav className="dev-mobile-dock">
        <button className={`dev-mobile-dock-btn ${activeTab === 'overview' ? 'is-active' : ''}`} onClick={() => setActiveTab('overview')}>
          <TrendingUp size={20} />
          <span>النبض</span>
        </button>
        <button className={`dev-mobile-dock-btn ${activeTab === 'companies' ? 'is-active' : ''}`} onClick={() => setActiveTab('companies')}>
          <Building2 size={20} />
          <span>الشركات</span>
        </button>
        <button className={`dev-mobile-dock-btn ${activeTab === 'discounts' ? 'is-active' : ''}`} onClick={() => setActiveTab('discounts')}>
          <TicketPercent size={20} />
          <span>الخصم</span>
        </button>
        <button className={`dev-mobile-dock-btn ${activeTab === 'whatsapp' ? 'is-active' : ''}`} onClick={() => setActiveTab('whatsapp')}>
          <MessageSquare size={20} />
          <span>واتساب</span>
        </button>
        <button className={`dev-mobile-dock-btn ${activeTab === 'financials' ? 'is-active' : ''}`} onClick={() => setActiveTab('financials')}>
          <DollarSign size={20} />
          <span>المالية</span>
        </button>
        <button className={`dev-mobile-dock-btn ${activeTab === 'payment_methods' ? 'is-active' : ''}`} onClick={() => setActiveTab('payment_methods')}>
          <CreditCard size={20} />
          <span>الدفع</span>
        </button>
      </nav>

      {/* ── MODALS ── */}

      {/* 1. New Company Modal */}
      {isNewCompanyModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '500px', width: '100%', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 900 }}>إضافة شركة جديدة وتجهيز بيئتها المعزولة</h3>
            <form onSubmit={handleCreateCompany} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>اسم الصيدلية / الشركة</label>
                <input
                  type="text"
                  required
                  value={newCompForm.company_name}
                  onChange={(e) => setNewCompForm({ ...newCompForm, company_name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>اسم مستخدم المالك</label>
                  <input
                    type="text"
                    required
                    value={newCompForm.owner_username}
                    onChange={(e) => setNewCompForm({ ...newCompForm, owner_username: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>كلمة مرور المالك</label>
                  <input
                    type="password"
                    required
                    value={newCompForm.owner_password}
                    onChange={(e) => setNewCompForm({ ...newCompForm, owner_password: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>رقم الهاتف / الواتساب</label>
                  <input
                    type="text"
                    value={newCompForm.phone}
                    onChange={(e) => setNewCompForm({ ...newCompForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>كود الخصم (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: PHARMA50"
                    value={newCompForm.discount_code}
                    onChange={(e) => setNewCompForm({ ...newCompForm, discount_code: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  إنشاء الشركة الآن
                </button>
                <button type="button" onClick={() => setIsNewCompanyModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Renew Modal */}
      {isRenewModalOpen && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '440px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 900 }}>تجديد اشتراك: {selectedCompany.company_name}</h3>
            {selectedCompany.applied_discount_code && selectedCompany.discount_months_remaining > 0 && (
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', padding: '10px', borderRadius: '10px', fontSize: '12px', color: '#10b981', fontWeight: 700, marginBottom: '14px' }}>
                🏷️ مفعّل خصم بقيمة {selectedCompany.discount_value}% سارٍ لمدة {selectedCompany.discount_months_remaining} أشهر متبقية! سيتم الخصم تلقائياً.
              </div>
            )}
            <form onSubmit={handleRenewSubscription} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>عدد أشهر التجديد</label>
                <select
                  value={renewForm.months}
                  onChange={(e) => setRenewForm({ ...renewForm, months: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                >
                  <option value={1}>شهر واحد</option>
                  <option value={3}>3 أشهر</option>
                  <option value={6}>6 أشهر</option>
                  <option value={12}>سنة كاملة (12 شهراً)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>المبلغ الأساسي (ج.م)</label>
                <input
                  type="number"
                  value={renewForm.amount}
                  onChange={(e) => setRenewForm({ ...renewForm, amount: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  تأكيد التجديد
                </button>
                <button type="button" onClick={() => setIsRenewModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Suspend / Status Modal */}
      {isSuspendModalOpen && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>تعديل حالة حساب: {selectedCompany.company_name}</h3>
            <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>الحالة</label>
                <select
                  value={suspendForm.status}
                  onChange={(e) => setSuspendForm({ ...suspendForm, status: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="active">نشط (سماح كامل بالدخول)</option>
                  <option value="suspended">موقوف (حظر جميع المستخدمين وتوجيههم لشاشة الإيقاف)</option>
                  <option value="grace_period">فترة سماح (تنبيه فقط)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>رسالة شاشة إيقاف الإدارة والمالك</label>
                <textarea
                  rows={2}
                  value={suspendForm.custom_admin_msg}
                  onChange={(e) => setSuspendForm({ ...suspendForm, custom_admin_msg: e.target.value })}
                  placeholder="سبب رسمي للإدارة وطريقة السداد والتواصل..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>رسالة شاشة إيقاف الموظفين ومديري الفروع (غير محرجة)</label>
                <textarea
                  rows={2}
                  value={suspendForm.custom_staff_msg}
                  onChange={(e) => setSuspendForm({ ...suspendForm, custom_staff_msg: e.target.value })}
                  placeholder="النظام متوقف حالياً لإجراء مراجعة وتحديثات من قبل إدارة الشركة..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: suspendForm.status === 'suspended' ? '#f43f5e' : '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  حفظ الحالة وشاشات الإيقاف
                </button>
                <button type="button" onClick={() => setIsSuspendModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. New Discount Modal */}
      {isNewDiscountModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '440px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>إنشاء كود دعوة وخصم لعدة أشهر</h3>
            <form onSubmit={handleCreateDiscount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>كود الخصم</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: PHARMA50"
                  value={discountForm.code}
                  onChange={(e) => setDiscountForm({ ...discountForm, code: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>عنوان الحملة الترويجية</label>
                <input
                  type="text"
                  required
                  placeholder="عرض انطلاقة الصيدليات..."
                  value={discountForm.title}
                  onChange={(e) => setDiscountForm({ ...discountForm, title: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>نوع الخصم</label>
                  <select
                    value={discountForm.discount_type}
                    onChange={(e) => setDiscountForm({ ...discountForm, discount_type: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="percentage">نسبة مئوية (%)</option>
                    <option value="fixed">مبلغ ثابت (ج.م)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>القيمة</label>
                  <input
                    type="number"
                    required
                    value={discountForm.discount_value}
                    onChange={(e) => setDiscountForm({ ...discountForm, discount_value: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>مدة سريان الخصم بالأشهر (سريان تكراري)</label>
                <select
                  value={discountForm.duration_months}
                  onChange={(e) => setDiscountForm({ ...discountForm, duration_months: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid #38bdf8', color: '#fff', boxSizing: 'border-box', fontWeight: 700 }}
                >
                  <option value={1}>شهر واحد فقط (فاتورة البداية)</option>
                  <option value={3}>3 أشهر متتالية</option>
                  <option value={6}>6 أشهر متتالية</option>
                  <option value={12}>12 شهراً (سنة كاملة)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#38bdf8', color: '#090d16', padding: '10px', borderRadius: '10px', fontWeight: 900, border: 'none', cursor: 'pointer' }}>
                  إنشاء الكود فوراً
                </button>
                <button type="button" onClick={() => setIsNewDiscountModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. New Expense Modal */}
      {isNewExpenseModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>تسجيل مصروف تشغيلي للمنظومة</h3>
            <form onSubmit={handleCreateExpense} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>بند المصروف</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: استضافة السيرفر السحابي VPS..."
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>التصنيف</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="hosting_servers">خوادم واستضافة</option>
                    <option value="apis_whatsapp">بوابات API وواتساب</option>
                    <option value="marketing">إعلانات وتسويق</option>
                    <option value="maintenance">صيانة ودعم فني</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>المبلغ (ج.م)</label>
                  <input
                    type="number"
                    required
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#f43f5e', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  حفظ المصروف
                </button>
                <button type="button" onClick={() => setIsNewExpenseModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Company Snapshot & Restore Modal */}
      {isBackupModalOpen && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '640px', width: '100%', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
                  💾 محرك النسخ الاحتياطي والاستعادة الفردية
                </h3>
                <div style={{ fontSize: '12.5px', color: '#38bdf8', marginTop: '3px' }}>
                  {selectedCompany.company_name} (كود: {selectedCompany.company_code}) · تخزين معزول: {selectedCompany.storage_key}
                </div>
              </div>
              <button
                onClick={() => setIsBackupModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px' }}
              >
                ✕
              </button>
            </div>

            {/* Create new snapshot box */}
            <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--dev-border)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
                أخذ لقطة فورية (Instant Point-in-Time Snapshot)
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="اسم اللقطة (مثال: قبل تعديل شفتات رمضان)..."
                  value={newBackupName}
                  onChange={(e) => setNewBackupName(e.target.value)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', background: '#020617', border: '1px solid var(--dev-border)', color: '#fff', fontSize: '13px' }}
                />
                <button
                  type="button"
                  disabled={isCreatingBackup}
                  onClick={handleCreateSnapshot}
                  style={{
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Archive size={14} />
                  <span>{isCreatingBackup ? 'جاري الأخذ...' : 'حفظ لقطة'}</span>
                </button>
              </div>
            </div>

            {/* Saved snapshots list */}
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
                أرشيف النسخ الاحتياطية الخاصة بهذه الصيدلية ({selectedCompBackups.length})
              </div>

              {selectedCompBackups.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                  لا توجد لقطات محفوظة لهذه الشركة حتى الآن. قم بالضغط على "حفظ لقطة" أعلاه لإنشاء أول نسخة.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedCompBackups.map((bk) => (
                    <div
                      key={bk.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid var(--dev-border)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#ffffff' }}>
                          {bk.snapshot_name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                          📅 {new Date(bk.created_at).toLocaleString('ar-EG')} · الحجم: {Math.round((bk.size_bytes || 0) / 1024)} KB · المنشئ: {bk.created_by}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleDownloadSnapshot(bk.id)}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            color: '#cbd5e1',
                            border: '1px solid var(--dev-border)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Download size={13} />
                          <span>تنزيل JSON</span>
                        </button>

                        <button
                          type="button"
                          disabled={isRestoringBackup}
                          onClick={() => handleRestoreSnapshot(bk.id, bk.snapshot_name)}
                          style={{
                            background: 'rgba(244, 63, 94, 0.15)',
                            color: '#f43f5e',
                            border: '1px solid rgba(244, 63, 94, 0.3)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <RotateCcw size={13} />
                          <span>{isRestoringBackup ? 'جاري الاستعادة...' : 'استعادة 🔄'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--dev-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(false)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. New Affiliate Modal */}
      {isAffiliateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '460px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>إضافة وكيل / شريك مسوق جديد</h3>
            <form onSubmit={handleCreateAffiliate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>اسم الوكيل / المسوق</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: د. طارق محمود..."
                  value={affiliateForm.name}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>رقم الهاتف / الواتساب</label>
                  <input
                    type="text"
                    required
                    placeholder="01012345678"
                    value={affiliateForm.phone}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    value={affiliateForm.email}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>كود الخصم الترويجي</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: TAREK20"
                    value={affiliateForm.promo_code}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, promo_code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>نسبة العمولة (%)</label>
                  <input
                    type="number"
                    required
                    value={affiliateForm.commission_percent}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, commission_percent: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  حفظ وتفعيل الوكيل
                </button>
                <button type="button" onClick={() => setIsAffiliateModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Affiliate Payout Modal */}
      {isPayoutModalOpen && selectedAffiliate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 900 }}>صرف عمولة للوكيل: {selectedAffiliate.name}</h3>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '12.5px', color: '#10b981', fontWeight: 800 }}>
              💰 الرصيد المستحق حالياً: {Number(selectedAffiliate.balance || 0).toLocaleString()} ج.م
            </div>

            <form onSubmit={handleAffiliatePayout} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>المبلغ المراد صرفه (ج.م)</label>
                <input
                  type="number"
                  required
                  value={payoutForm.amount}
                  onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>ملاحظات / وسيلة التحويل</label>
                <input
                  type="text"
                  placeholder="مثال: تحويل إنستاباي، كاش، إلخ..."
                  value={payoutForm.notes}
                  onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  تأكيد صرف المبلغ
                </button>
                <button type="button" onClick={() => setIsPayoutModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 9. Edit Company Modal */}
      {isEditCompanyModalOpen && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border-glow)', borderRadius: '20px', maxWidth: '640px', width: '100%', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--dev-border)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
                  تعديل بيانات الشركة وحساب المالك: {selectedCompany.company_name}
                </h3>
                <div style={{ fontSize: '12px', color: '#38bdf8', marginTop: '2px' }}>
                  تخزين معزول: {selectedCompany.storage_key} · ID: {selectedCompany.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditCompanyModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditCompany} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>اسم الصيدلية / الشركة</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.company_name}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, company_name: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>كود الشركة</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.company_code}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, company_code: e.target.value.toLowerCase() })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>اسم مستخدم المالك (Username)</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.owner_username}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, owner_username: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>الاسم الحقيقي للمالك</label>
                  <input
                    type="text"
                    value={editCompanyForm.owner_name}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, owner_name: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>كلمة المرور الجديدة (اختياري)</label>
                  <input
                    type="password"
                    placeholder="اترك فارغاً للإبقاء عليها دون تغيير"
                    value={editCompanyForm.owner_password}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, owner_password: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>رقم الهاتف / الواتساب</label>
                  <input
                    type="text"
                    value={editCompanyForm.phone}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>باقة الاشتراك</label>
                  <select
                    value={editCompanyForm.plan_id}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, plan_id: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="pro">Pro (احترافية)</option>
                    <option value="standard">Standard (أساسية)</option>
                    <option value="free">Free (مجانية دائمة - إخفاء الأسعار)</option>
                    <option value="enterprise">Enterprise (مؤسسية)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>حالة الشركة</label>
                  <select
                    value={editCompanyForm.status}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, status: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="active">نشط (Active)</option>
                    <option value="suspended">موقوف (Suspended)</option>
                    <option value="grace_period">فترة سماح (Grace Period)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>تاريخ نهاية الاشتراك</label>
                  <input
                    type="date"
                    value={editCompanyForm.subscription_end}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, subscription_end: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Interactive Modules Checkboxes */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#38bdf8', display: 'block', marginBottom: '8px' }}>
                  الموديولات والشاشات المفعلة لهذه الشركة:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', maxHeight: '160px', overflowY: 'auto', background: '#1e293b', padding: '10px', borderRadius: '10px', border: '1px solid var(--dev-border)' }}>
                  {modules.map((m) => {
                    const isChecked = editCompanyForm.enabled_modules.includes(m.module_id);
                    return (
                      <label key={m.module_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...editCompanyForm.enabled_modules, m.module_id]
                              : editCompanyForm.enabled_modules.filter(id => id !== m.module_id);
                            setEditCompanyForm({ ...editCompanyForm, enabled_modules: next });
                          }}
                        />
                        <span>{m.icon || '📦'} {m.name_ar}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {editCompanyForm.status === 'suspended' && (
                <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#f43f5e' }}>سبب الإيقاف الرسمي</label>
                    <input
                      type="text"
                      value={editCompanyForm.suspension_reason}
                      onChange={(e) => setEditCompanyForm({ ...editCompanyForm, suspension_reason: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#0f172a', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#94a3b8' }}>رسالة شاشة إيقاف الإدارة</label>
                    <input
                      type="text"
                      value={editCompanyForm.custom_admin_suspension_msg}
                      onChange={(e) => setEditCompanyForm({ ...editCompanyForm, custom_admin_suspension_msg: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#0f172a', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#94a3b8' }}>رسالة شاشة إيقاف الموظفين</label>
                    <input
                      type="text"
                      value={editCompanyForm.custom_staff_suspension_msg}
                      onChange={(e) => setEditCompanyForm({ ...editCompanyForm, custom_staff_suspension_msg: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#0f172a', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    padding: '11px',
                    borderRadius: '10px',
                    fontWeight: 900,
                    fontSize: '13.5px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  حفظ ومزامنة كافة التعديلات
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditCompanyModalOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '11px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. Edit Discount Modal */}
      {isEditDiscountModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border-glow)', borderRadius: '20px', maxWidth: '460px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>تعديل كود الخصم: {editDiscountForm.code}</h3>
            <form onSubmit={handleSaveEditDiscount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>كود الخصم (Promo Code)</label>
                <input
                  type="text"
                  required
                  value={editDiscountForm.code}
                  onChange={(e) => setEditDiscountForm({ ...editDiscountForm, code: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>عنوان الحملة</label>
                <input
                  type="text"
                  required
                  value={editDiscountForm.title}
                  onChange={(e) => setEditDiscountForm({ ...editDiscountForm, title: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>نوع الخصم</label>
                  <select
                    value={editDiscountForm.discount_type}
                    onChange={(e) => setEditDiscountForm({ ...editDiscountForm, discount_type: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="percentage">نسبة مئوية (%)</option>
                    <option value="fixed">مبلغ ثابت (ج.م)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>قيمة الخصم</label>
                  <input
                    type="number"
                    required
                    value={editDiscountForm.discount_value}
                    onChange={(e) => setEditDiscountForm({ ...editDiscountForm, discount_value: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>مدة السريان (بالأشهر)</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    required
                    value={editDiscountForm.duration_months}
                    onChange={(e) => setEditDiscountForm({ ...editDiscountForm, duration_months: parseInt(e.target.value, 10) || 1 })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>الحد الأقصى للمشتركين</label>
                  <input
                    type="number"
                    required
                    value={editDiscountForm.max_uses}
                    onChange={(e) => setEditDiscountForm({ ...editDiscountForm, max_uses: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer', marginTop: '6px' }}>
                  <input
                    type="checkbox"
                    checked={editDiscountForm.is_active}
                    onChange={(e) => setEditDiscountForm({ ...editDiscountForm, is_active: e.target.checked })}
                  />
                  <span>كود الخصم مفعّل ويمكن استخدامه فوراً</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#38bdf8', color: '#090d16', padding: '10px', borderRadius: '10px', fontWeight: 900, border: 'none', cursor: 'pointer' }}>
                  حفظ تعديل الكود
                </button>
                <button type="button" onClick={() => setIsEditDiscountModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11. Edit Module Catalog Modal */}
      {isEditModuleModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border-glow)', borderRadius: '20px', maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>
              تعديل موديول: {editModuleForm.name_ar} ({editModuleForm.module_id})
            </h3>
            <form onSubmit={handleSaveEditModule} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>الأيقونة</label>
                  <input
                    type="text"
                    value={editModuleForm.icon}
                    onChange={(e) => setEditModuleForm({ ...editModuleForm, icon: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', textAlign: 'center', fontSize: '18px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>اسم الموديول بالعربي</label>
                  <input
                    type="text"
                    required
                    value={editModuleForm.name_ar}
                    onChange={(e) => setEditModuleForm({ ...editModuleForm, name_ar: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>السعر الشهري (ج.م / شهر)</label>
                <input
                  type="number"
                  required
                  value={editModuleForm.price_monthly}
                  onChange={(e) => setEditModuleForm({ ...editModuleForm, price_monthly: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#10b981', fontWeight: 800, fontSize: '16px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>الوصف المختصر</label>
                <textarea
                  rows={2}
                  value={editModuleForm.description}
                  onChange={(e) => setEditModuleForm({ ...editModuleForm, description: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  الترابط البرمجي (الموديولات المشروطة قبل تفعيل هذا الموديول):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', maxHeight: '130px', overflowY: 'auto', background: '#1e293b', padding: '8px', borderRadius: '8px', border: '1px solid var(--dev-border)' }}>
                  {modules.filter(m => m.module_id !== editModuleForm.module_id).map((m) => {
                    const isDep = editModuleForm.required_dependencies.includes(m.module_id);
                    return (
                      <label key={m.module_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#cbd5e1', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isDep}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...editModuleForm.required_dependencies, m.module_id]
                              : editModuleForm.required_dependencies.filter(id => id !== m.module_id);
                            setEditModuleForm({ ...editModuleForm, required_dependencies: next });
                          }}
                        />
                        <span>{m.name_ar}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  حفظ وتسعير الموديول
                </button>
                <button type="button" onClick={() => setIsEditModuleModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 12. Payment Method Modal */}
      {isPaymentMethodModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border-glow)', borderRadius: '20px', maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>
              {paymentMethodForm.id ? 'تعديل وسيلة الدفع' : 'إضافة وسيلة دفع للمشتركين'}
            </h3>
            <form onSubmit={handleSavePaymentMethod} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>عنوان وسيلة الدفع</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تحويل إنستاباي الفوري (InstaPay)"
                  value={paymentMethodForm.title}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, title: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>نوع وسيلة الدفع</label>
                  <select
                    value={paymentMethodForm.type}
                    onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, type: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="instapay">إنستاباي (InstaPay)</option>
                    <option value="vodafone_cash">فودافون كاش ومحافظ المحمول</option>
                    <option value="bank_transfer">تحويل بنكي (IBAN)</option>
                    <option value="other">وسيلة أخرى</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>شارة مميزة (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: دفع فوري"
                    value={paymentMethodForm.badge_text}
                    onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, badge_text: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>رقم الحساب / IPA / رقم الهاتف</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: user@instapay أو 01012345678 أو EG1200..."
                  value={paymentMethodForm.account_identifier}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, account_identifier: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#38bdf8', fontWeight: 800, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>اسم صاحب الحساب الرسمي</label>
                <input
                  type="text"
                  placeholder="اسم المستفيد الثلاثي"
                  value={paymentMethodForm.account_name}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, account_name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>تعليمات الإيداع والتأكيد للمشترك</label>
                <textarea
                  rows={2}
                  placeholder="مثال: يرجى إرسال صورة إيصال التحويل عبر واتساب المطور لتفعيل الاشتراك فوراً"
                  value={paymentMethodForm.instructions}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, instructions: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={paymentMethodForm.is_active}
                    onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, is_active: e.target.checked })}
                  />
                  <span>مفعلة وتظهر للمشتركين</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>الترتيب:</span>
                  <input
                    type="number"
                    value={paymentMethodForm.sort_order}
                    onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, sort_order: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '60px', padding: '6px', borderRadius: '6px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', textAlign: 'center' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  حفظ وسيلة الدفع
                </button>
                <button type="button" onClick={() => setIsPaymentMethodModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 13. Edit Invoice Settings Modal */}
      {isEditInvoiceSettingsModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border-glow)', borderRadius: '20px', maxWidth: '640px', width: '100%', padding: '28px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--dev-border)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>⚙️ إعدادات وترويسة فاتورة الشراء والسندات الرسمية</h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>تعديل بيانات الجهة المصدرة، الرقم الضريبي، والعناوين التي تظهر على فواتير المشتركين</p>
              </div>
              <button onClick={() => setIsEditInvoiceSettingsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveInvoiceSettings} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>اسم الجهة المصدرة (الشركة/المؤسسة)</label>
                  <input
                    type="text"
                    required
                    value={invoiceSettingsForm.issuer_name}
                    onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, issuer_name: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>الرقم الضريبي الموحد</label>
                  <input
                    type="text"
                    required
                    value={invoiceSettingsForm.tax_number}
                    onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, tax_number: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>البريد الإلكتروني الرسمي للدعم</label>
                  <input
                    type="email"
                    required
                    value={invoiceSettingsForm.issuer_email}
                    onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, issuer_email: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>هاتف خدمة العملاء / الدعم الفني (اختياري)</label>
                  <input
                    type="text"
                    value={invoiceSettingsForm.issuer_phone}
                    onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, issuer_phone: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>عنوان الفاتورة الرسمي</label>
                  <input
                    type="text"
                    required
                    value={invoiceSettingsForm.invoice_title}
                    onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, invoice_title: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>الوصف الفرعي للفاتورة</label>
                  <input
                    type="text"
                    value={invoiceSettingsForm.invoice_subtitle}
                    onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, invoice_subtitle: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>بند الخدمة الافتراضي في جدول الفاتورة</label>
                <input
                  type="text"
                  required
                  value={invoiceSettingsForm.service_title}
                  onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, service_title: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>تفاصيل ومكونات البند الافتراضي</label>
                <input
                  type="text"
                  value={invoiceSettingsForm.service_description}
                  onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, service_description: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>ملاحظة تذييل الفاتورة العادية (Footer Note)</label>
                <textarea
                  rows={2}
                  value={invoiceSettingsForm.footer_notice}
                  onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, footer_notice: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#10b981', fontWeight: 800, display: 'block', marginBottom: '4px' }}>💎 نص شهادة ترخيص الباقة المجانية الدائمة (بدون مبالغ)</label>
                <textarea
                  rows={2}
                  value={invoiceSettingsForm.free_license_notice}
                  onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, free_license_notice: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#6ee7b7', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{ flex: 1, background: '#0ea5e9', color: '#fff', padding: '11px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  حفظ إعدادات وترويسة الفاتورة
                </button>
                <button type="button" onClick={() => setIsEditInvoiceSettingsModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '11px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 14. Edit Individual Invoice Modal */}
      {isEditInvoiceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--dev-border-glow)', borderRadius: '20px', maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>
              تعديل بيانات الفاتورة الرسمية ({editInvoiceForm.invoice_number})
            </h3>
            <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>رقم الفاتورة المرجعي</label>
                <input
                  type="text"
                  required
                  value={editInvoiceForm.invoice_number}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, invoice_number: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#38bdf8', fontWeight: 800, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>المبلغ الأصلي</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editInvoiceForm.amount}
                    onChange={(e) => {
                      const amt = parseFloat(e.target.value) || 0;
                      const disc = parseFloat(editInvoiceForm.discount_amount) || 0;
                      setEditInvoiceForm({ ...editInvoiceForm, amount: amt, net_amount: Math.max(0, amt - disc) });
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>الخصم</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editInvoiceForm.discount_amount}
                    onChange={(e) => {
                      const disc = parseFloat(e.target.value) || 0;
                      const amt = parseFloat(editInvoiceForm.amount) || 0;
                      setEditInvoiceForm({ ...editInvoiceForm, discount_amount: disc, net_amount: Math.max(0, amt - disc) });
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#10b981', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>الصافي المدفوع</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editInvoiceForm.net_amount}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, net_amount: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#38bdf8', fontWeight: 800, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>طريقة السداد</label>
                  <input
                    type="text"
                    value={editInvoiceForm.payment_method}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, payment_method: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>حالة الفاتورة</label>
                  <select
                    value={editInvoiceForm.status}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, status: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="approved">معتمدة ومحصلة (Approved)</option>
                    <option value="pending">معلقة للمراجعة (Pending)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>ملاحظات الفاتورة</label>
                <textarea
                  rows={2}
                  value={editInvoiceForm.notes}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#1e293b', border: '1px solid var(--dev-border)', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{ flex: 1, background: '#10b981', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                  حفظ تعديل الفاتورة
                </button>
                <button type="button" onClick={() => setIsEditInvoiceModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
