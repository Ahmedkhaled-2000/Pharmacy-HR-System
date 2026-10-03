import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Truck,
  FileText,
  Building2,
  Plus,
  Search,
  RefreshCw,
  DollarSign,
  Calendar,
  CreditCard,
  FileSpreadsheet,
  Download,
  Upload,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Layers,
  Percent,
  Check,
  Filter,
  FileUp,
  FolderArchive,
  ArrowUpDown,
  Trash2,
  Edit,
  CheckSquare,
  Copy,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  UserCheck,
  Server
} from 'lucide-react';
import {
  outstockGetSuppliers,
  outstockSaveSupplier,
  outstockUpdateSupplier,
  outstockDeleteSupplier,
  outstockGetSupplierWithdrawals,
  outstockAddSupplierWithdrawal,
  outstockSettleSupplierClaim,
  outstockGetSupplierPayments,
  outstockGetSupplierInvoices,
  outstockGetSupplierInvoiceDetails,
  outstockSaveSupplierInvoice,
  outstockUpdateSupplierInvoice,
  outstockGetOrderReceipts,
  outstockGetOrderReceiptDetails,
  outstockUploadInvoiceToDrive,
  outstockGetBranchWithdrawals,
  outstockSaveBranchWithdrawal,
  outstockUpdateBranchWithdrawal,
  outstockDeleteBranchWithdrawal,
  outstockGetMedicationByBarcode,
  outstockGetBranches,
  outstockSearchMedications,
  outstockRolloverSupplierLimits,
  outstockSaveSupplierMonthlyLimit
} from '../../../utils/outstockApiClient';
import {
  exportSupplierWithdrawalsExcel,
  exportBranchWithdrawalsExcel,
  parseSupplierInvoiceExcel
} from '../../../utils/outstockExcelExporter';
import SupplierDiscountsComparisonTab from './SupplierDiscountsComparisonTab';
import MedicationAutocompleteInput from '../pharmacy/MedicationAutocompleteInput';
import SelectRegisteredInvoicesModal from './SelectRegisteredInvoicesModal';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';
import ProcurementOrderReceivingTab from './ProcurementOrderReceivingTab';
import PharmaFlyIntegrationTab from './PharmaFlyIntegrationTab';
import { performSmartExtraction } from '../../../utils/archiveAiService';

/**
 * 💊 تحليل وتنسيق تاريخ صلاحية الدواء
 * يدعم الصِيغ: MM/YY أو MM/YYYY أو YYYY-MM أو YYYY-MM-DD
 */
export function parseExpiryDate(inputStr) {
  if (!inputStr) return null;
  const clean = String(inputStr).trim().replace(/[\\-]/g, '/');
  // MM/YY أو MM/YYYY
  const mmyyMatch = clean.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (mmyyMatch) {
    let m = parseInt(mmyyMatch[1], 10);
    let y = parseInt(mmyyMatch[2], 10);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12) {
      return {
        month: m,
        year: y,
        formatted: `${String(m).padStart(2, '0')}/${String(y).slice(-2)}`,
        iso: `${y}-${String(m).padStart(2, '0')}`
      };
    }
  }
  // YYYY/MM
  const yymmMatch = clean.match(/^(\d{4})\/(\d{1,2})$/);
  if (yymmMatch) {
    let y = parseInt(yymmMatch[1], 10);
    let m = parseInt(yymmMatch[2], 10);
    if (m >= 1 && m <= 12) {
      return {
        month: m,
        year: y,
        formatted: `${String(m).padStart(2, '0')}/${String(y).slice(-2)}`,
        iso: `${y}-${String(m).padStart(2, '0')}`
      };
    }
  }
  return null;
}

/**
 * تقييم حالة الصلاحية وحساب المدة المتبقية
 * يعيد شارة ذكية ملونة حسب درجة خطورة أو أمان الصلاحية
 */
export function getExpiryAnalysis(expiryStr) {
  if (!expiryStr) {
    return { status: 'empty', label: '—', color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' };
  }
  const parsed = parseExpiryDate(expiryStr);
  if (!parsed) {
    return { status: 'unknown', label: String(expiryStr).trim(), color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' };
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthsRemaining = (parsed.year - currentYear) * 12 + (parsed.month - currentMonth);

  if (monthsRemaining < 0) {
    return {
      status: 'expired',
      label: `${parsed.formatted} (منتهي ⛔)`,
      monthsRemaining,
      color: '#b91c1c',
      bg: '#fee2e2',
      border: '#fca5a5'
    };
  } else if (monthsRemaining <= 6) {
    return {
      status: 'critical',
      label: `${parsed.formatted} (وشيك: ${monthsRemaining} ش ⚠️)`,
      monthsRemaining,
      color: '#c2410c',
      bg: '#ffedd5',
      border: '#fdba74'
    };
  } else if (monthsRemaining <= 12) {
    return {
      status: 'warning',
      label: `${parsed.formatted} (باقي ${monthsRemaining} شهر)`,
      monthsRemaining,
      color: '#b45309',
      bg: '#fef3c7',
      border: '#fde68a'
    };
  } else {
    const years = (monthsRemaining / 12).toFixed(1);
    return {
      status: 'healthy',
      label: `${parsed.formatted} (ساري: ${years} سنة)`,
      monthsRemaining,
      color: '#15803d',
      bg: '#dcfce7',
      border: '#86efac'
    };
  }
}

/**
 * ProcurementSuppliersTab.jsx
 * الشاشة المركزية الشاملة لإدارة الموردين وفواتير الشراء ومسحوبات الفروع
 * تضم 4 أقسام رئيسية:
 * 1. حسابات الموردين وحدود الائتمان والمديونيات مع الفلتر الشهري وتدوير الليمت
 * 2. استلام الطلبات وتسجيل أصناف الشحنات والفواتير
 * 3. فواتير الموردين ومطابقتها والأرشفة على Google Drive
 * 4. مسحوبات الفروع الشهرية والتوريدات الميدانية
 */
export default function ProcurementSuppliersTab({ showToast = alert, initialSubTab = 'accounts', currentUser = null }) {
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const [activeSubTab, setActiveSubTab] = useState(initialSubTab || 'accounts'); // 'accounts' | 'order_receiving' | 'invoices' | 'withdrawals' | 'discounts_comparison'
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ── الصلاحيات الدقيقة للأقسام الفرعية لإدارة الموردين والربط ──────────────────────────────
  const isMasterAdmin = !currentUser || currentUser.role === 'owner' || currentUser.role === 'procurement_manager' || currentUser.username === 'admin-stock';
  const perms = currentUser?.permissions || {};
  const isCosmetics = currentUser?.role === 'cosmetics_officer' || perms.category_scope === 'cosmetics' || currentUser?.category_scope === 'cosmetics';

  const canAccessAccounts = !isCosmetics && (isMasterAdmin || perms.can_access_supplier_accounts === true || currentUser?.can_access_supplier_accounts === true);
  const canAccessReceiving = !isCosmetics && (isMasterAdmin || perms.can_access_order_receiving === true || currentUser?.can_access_order_receiving === true);
  const canAccessInvoices = !isCosmetics && (isMasterAdmin || perms.can_access_supplier_invoices === true || currentUser?.can_access_supplier_invoices === true);
  const canAccessWithdrawals = !isCosmetics && (isMasterAdmin || perms.can_access_branch_withdrawals === true || currentUser?.can_access_branch_withdrawals === true);
  const canAccessDiscounts = !isCosmetics && (isMasterAdmin || perms.can_access_discounts_comparison === true || currentUser?.can_access_discounts_comparison === true);
  const canAccessPharmafly = !isCosmetics && (isMasterAdmin || perms.can_access_pharmafly === true || currentUser?.can_access_pharmafly === true);

  useEffect(() => {
    if (activeSubTab === 'accounts' && !canAccessAccounts) {
      if (canAccessReceiving) setActiveSubTab('order_receiving');
      else if (canAccessInvoices) setActiveSubTab('invoices');
      else if (canAccessWithdrawals) setActiveSubTab('withdrawals');
      else if (canAccessDiscounts) setActiveSubTab('discounts_comparison');
      else if (canAccessPharmafly) setActiveSubTab('pharmafly_sync');
    }
  }, [activeSubTab, canAccessAccounts, canAccessReceiving, canAccessInvoices, canAccessWithdrawals, canAccessDiscounts, canAccessPharmafly]);

  // ── الفلترة الشهرية لحسابات الموردين وتدوير الحد الائتماني ────────────────────
  const [supplierAccountsMonth, setSupplierAccountsMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // ══════════════════════════════════════════════════════════════════════════════
  // تحميل قائمة الموردين بحسب الشهر المختار
  // ══════════════════════════════════════════════════════════════════════════════
  const loadSuppliers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await outstockGetSuppliers({ month: supplierAccountsMonth });
      if (res?.success) {
        setSuppliers(res.suppliers || []);
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      showToastRef.current?.('تعذر تحميل بيانات الموردين');
    } finally {
      setIsLoading(false);
    }
  }, [supplierAccountsMonth]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // دوال التنقل بين الشهور بحسابات رقمية سليمة بدون مشاكل فرق التوقيت UTC
  const getPrevMonthStr = (ym) => {
    let [y, m] = ym.split('-').map(Number);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    return `${y}-${String(m).padStart(2, '0')}`;
  };

  const getNextMonthStr = (ym) => {
    let [y, m] = ym.split('-').map(Number);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return `${y}-${String(m).padStart(2, '0')}`;
  };

  const handlePrevMonth = () => setSupplierAccountsMonth(prev => getPrevMonthStr(prev));
  const handleNextMonth = () => setSupplierAccountsMonth(prev => getNextMonthStr(prev));
  const handleCurrentMonth = () => setSupplierAccountsMonth(new Date().toISOString().slice(0, 7));

  const handleRolloverCreditLimits = async () => {
    const prevMonth = getPrevMonthStr(supplierAccountsMonth);
    const confirmMsg = `هل تريد بالتأكيد استعمال نفس الحدود الائتمانية من الشهر السابق (${prevMonth}) وتطبيقها على هذا الشهر (${supplierAccountsMonth})؟\nسيتم تحديث كافة الموردين بالحدود المسجلة سابقاً.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsLoading(true);
      const res = await outstockRolloverSupplierLimits({
        targetMonth: supplierAccountsMonth,
        previousMonth: prevMonth
      });
      if (res?.success) {
        showToastRef.current?.(`✅ تم تطبيق الحدود الائتمانية من شهر (${prevMonth}) بنجاح`);
        loadSuppliers();
      } else {
        showToastRef.current?.(res?.error || 'فشل نسخ الحدود الائتمانية');
      }
    } catch (err) {
      showToastRef.current?.('حدث خطأ أثناء نسخ الحدود الائتمانية');
    } finally {
      setIsLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. حسابات الموردين وحدود الائتمان
  // ══════════════════════════════════════════════════════════════════════════════
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierFormData, setSupplierFormData] = useState({
    code: '',
    name: '',
    phone: '',
    contact_person: '',
    payment_type: 'credit',
    credit_limit: '',
    credit_term_days: '30',
    notes: ''
  });

  // نافذة تسوية مطالبة مالية
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementSupplier, setSettlementSupplier] = useState(null);
  const [settlementData, setSettlementData] = useState({
    amount: '',
    payment_method: 'bank_transfer',
    reference_number: '',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: ''
  });
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);

  // نافذة كشف مسحوبات المورد
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [selectedSupplierForWithdrawals, setSelectedSupplierForWithdrawals] = useState(null);
  const [supplierWithdrawals, setSupplierWithdrawals] = useState([]);
  const [withdrawalSearch, setWithdrawalSearch] = useState('');
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(false);

  // نافذة إضافة مسحوب يدوي للمورد (مع دعم الفواتير المتعددة وعدد الأصناف وملف PDF)
  const [isManualWithdrawalModalOpen, setIsManualWithdrawalModalOpen] = useState(false);
  const [returnToWithdrawalsAfterManual, setReturnToWithdrawalsAfterManual] = useState(false);
  const [isSelectInvoicesModalOpen, setIsSelectInvoicesModalOpen] = useState(false);

  // توثيق كود الموظف السري (المعامل كباسورد) عند تسجيل فاتورة جديدة
  const [isInvoiceEmployeeAuthOpen, setIsInvoiceEmployeeAuthOpen] = useState(false);
  const [verifiedInvoiceEmployee, setVerifiedInvoiceEmployee] = useState(null);

  const [manualWithdrawalForm, setManualWithdrawalForm] = useState({
    item_count: '1',
    invoices: [
      { invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10), amount: '' }
    ],
    pdf_file: null,
    pdf_file_name: '',
    pdf_file_base64: '',
    notes: ''
  });
  const [isSubmittingManualWithdrawal, setIsSubmittingManualWithdrawal] = useState(false);

  // إدراج الفواتير المسجلة المحددة إلى نموذج المسحوب اليدوي
  const handleConfirmSelectedInvoices = (selectedInvs) => {
    if (!selectedInvs || selectedInvs.length === 0) return;
    const newRows = selectedInvs.map((inv) => ({
      invoice_number: inv.invoice_number || '',
      invoice_date: inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      amount: String(Number(inv.total_amount || 0).toFixed(2))
    }));

    setManualWithdrawalForm((prev) => {
      const isFirstRowEmpty =
        prev.invoices.length === 1 &&
        !prev.invoices[0].invoice_number &&
        !prev.invoices[0].amount;
      const combined = isFirstRowEmpty ? newRows : [...prev.invoices, ...newRows];
      return {
        ...prev,
        invoices: combined,
        item_count: Math.max(Number(prev.item_count) || 1, combined.length).toString()
      };
    });
    setIsSelectInvoicesModalOpen(false);
    showToastRef.current?.(`✅ تم إدراج ${selectedInvs.length} فاتورة مسجلة بنجاح`);
  };

  // بعد التحقق من كود الموظف كباسورد بنجاح
  const handleInvoiceEmployeeVerified = (employee) => {
    setVerifiedInvoiceEmployee(employee);
    setIsInvoiceEmployeeAuthOpen(false);
    const defaultSup = suppliers[0] || null;
    setInvoiceForm({
      supplier_id: defaultSup?.id || '',
      invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      payment_terms: defaultSup?.payment_type || 'credit',
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      discount_amount: '0',
      tax_amount: '0',
      paid_amount: '0',
      notes: '',
      items: []
    });
    setAttachedFile(null);
    setAttachedFileBase64('');
    setIsInvoiceModalOpen(true);
    showToastRef.current?.(`✅ مرحباً ${employee.name}، تم توثيق كودك بنجاح`);
  };

  // إحصائيات الموردين العامة
  const supplierStats = useMemo(() => {
    let totalCreditLimit = 0;
    let totalBalance = 0;
    let totalInvoicesAmount = 0;
    let creditCount = 0;
    let cashCount = 0;

    suppliers.forEach((s) => {
      const limit = Number(s.credit_limit || 0);
      const bal = Number(s.current_balance || 0);
      const invTot = Number(s.total_invoices_amount || 0);
      totalCreditLimit += limit;
      totalBalance += bal;
      totalInvoicesAmount += invTot;
      if (s.payment_type === 'credit') creditCount++;
      else cashCount++;
    });

    const creditUtilization = totalCreditLimit > 0 ? (totalBalance / totalCreditLimit) * 100 : 0;

    return {
      count: suppliers.length,
      creditCount,
      cashCount,
      totalCreditLimit,
      totalBalance,
      totalInvoicesAmount,
      creditUtilization: Math.min(100, Math.round(creditUtilization))
    };
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q) ||
        s.contact_person?.toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierFormData({
      code: `SUP-${String(suppliers.length + 1).padStart(3, '0')}`,
      name: '',
      phone: '',
      contact_person: '',
      payment_type: 'credit',
      credit_limit: '50000',
      credit_term_days: '30',
      notes: ''
    });
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (supplier) => {
    setEditingSupplier(supplier);
    setSupplierFormData({
      code: supplier.code || '',
      name: supplier.name || '',
      phone: supplier.phone || '',
      contact_person: supplier.contact_person || '',
      payment_type: supplier.payment_type || 'credit',
      credit_limit: supplier.credit_limit || '',
      credit_term_days: supplier.credit_term_days || '30',
      notes: supplier.notes || ''
    });
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!supplierFormData.name?.trim()) {
      showToastRef.current?.('يرجى إدخال اسم المورد');
      return;
    }

    try {
      const payload = {
        ...supplierFormData,
        month: supplierAccountsMonth // ربط الحد الائتماني بالشهر النشط وتحديث السجل الشهري
      };

      if (editingSupplier) {
        const res = await outstockUpdateSupplier(editingSupplier.id, payload);
        if (res?.success) {
          showToastRef.current?.('تم تحديث بيانات المورد والحد الائتماني بنجاح');
          setIsSupplierModalOpen(false);
          loadSuppliers();
        } else {
          showToastRef.current?.(res?.error || 'فشل التحديث');
        }
      } else {
        const res = await outstockSaveSupplier(payload);
        if (res?.success) {
          showToastRef.current?.('تم إضافة المورد الجديد وحفظ حده الائتماني بنجاح');
          setIsSupplierModalOpen(false);
          loadSuppliers();
        } else {
          showToastRef.current?.(res?.error || 'فشل الإضافة');
        }
      }
    } catch (err) {
      console.error(err);
      showToastRef.current?.('حدث خطأ أثناء حفظ بيانات المورد');
    }
  };

  const handleDeleteSupplier = async (supplier) => {
    const confirmMsg = `هل أنت متأكد من حذف أو أرشفة المورد "${supplier.name}"؟\n\n🛡️ ملاحظة الأمان المالي: إذا كان للمورد سجل فواتير أو طلبيات سابقة، سيتم إيقاف حسابه وأرشفته بأمان دون حذف سجلاته المالية السابقة لحماية العمليات المحاسبية.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await outstockDeleteSupplier(supplier.id);
      if (res?.success) {
        showToastRef.current?.(res.message || 'تم حذف / إيقاف حساب المورد بنجاح');
        loadSuppliers();
      } else {
        showToastRef.current?.(res?.error || 'تعذر إتمام عملية حذف المورد');
      }
    } catch (err) {
      showToastRef.current?.('حدث خطأ أثناء حذف المورد');
    }
  };

  const handleOpenSettlement = (supplier) => {
    setSettlementSupplier(supplier);
    setSettlementData({
      amount: String(supplier.current_balance || ''),
      payment_method: 'bank_transfer',
      reference_number: '',
      payment_date: new Date().toISOString().slice(0, 10),
      notes: ''
    });
    setIsSettlementModalOpen(true);
  };

  const handleSaveSettlement = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(settlementData.amount);
    if (!amountNum || amountNum <= 0) {
      showToast?.('يرجى إدخال مبلغ سداد صحيح');
      return;
    }

    try {
      setIsSubmittingSettlement(true);
      const res = await outstockSettleSupplierClaim(settlementSupplier.id, settlementData);
      if (res?.success) {
        showToast?.('تم تسجيل سداد الدفعة بنجاح وتحديث رصيد المورد');
        setIsSettlementModalOpen(false);
        loadSuppliers();
      } else {
        showToast?.(res?.error || 'فشل تسجيل السداد');
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء تسجيل السداد');
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  const handleOpenWithdrawals = async (supplier) => {
    setSelectedSupplierForWithdrawals(supplier);
    setWithdrawalSearch('');
    setIsWithdrawalModalOpen(true);
    setIsLoadingWithdrawals(true);
    try {
      const res = await outstockGetSupplierWithdrawals(supplier.id);
      if (res?.success) {
        setSupplierWithdrawals(res.withdrawals || []);
      }
    } catch (err) {
      console.error(err);
      showToast?.('تعذر جلب مسحوبات المورد');
    } finally {
      setIsLoadingWithdrawals(false);
    }
  };

  const filteredSupplierWithdrawals = useMemo(() => {
    const q = withdrawalSearch.trim().toLowerCase();
    if (!q) return supplierWithdrawals;
    return supplierWithdrawals.filter(
      (w) =>
        w.medication_name?.toLowerCase().includes(q) ||
        w.invoice_number?.toLowerCase().includes(q) ||
        w.barcode?.includes(q)
    );
  }, [supplierWithdrawals, withdrawalSearch]);

  const handleExportSupplierWithdrawals = async () => {
    if (!selectedSupplierForWithdrawals) return;
    try {
      await exportSupplierWithdrawalsExcel(selectedSupplierForWithdrawals, filteredSupplierWithdrawals);
      showToastRef.current?.('تم تصدير كشف المسحوبات إلى Excel بنجاح');
    } catch (err) {
      console.error(err);
      showToastRef.current?.('فشل تصدير ملف الإكسل');
    }
  };

  const manualWithdrawalTotalAmount = useMemo(() => {
    return (manualWithdrawalForm.invoices || []).reduce((acc, inv) => acc + (parseFloat(inv.amount || 0) || 0), 0);
  }, [manualWithdrawalForm.invoices]);

  const handleOpenManualFromWithdrawals = () => {
    setReturnToWithdrawalsAfterManual(true);
    setIsWithdrawalModalOpen(false);
    setIsManualWithdrawalModalOpen(true);
  };

  const handleCloseManualWithdrawal = () => {
    setIsManualWithdrawalModalOpen(false);
    if (returnToWithdrawalsAfterManual) {
      setReturnToWithdrawalsAfterManual(false);
      setIsWithdrawalModalOpen(true);
    }
  };

  const handleAddManualInvoiceRow = () => {
    setManualWithdrawalForm((prev) => ({
      ...prev,
      invoices: [
        ...prev.invoices,
        { invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10), amount: '' }
      ]
    }));
  };

  const handleRemoveManualInvoiceRow = (index) => {
    if (manualWithdrawalForm.invoices.length <= 1) return;
    setManualWithdrawalForm((prev) => ({
      ...prev,
      invoices: prev.invoices.filter((_, idx) => idx !== index)
    }));
  };

  const handleManualInvoiceRowChange = (index, field, value) => {
    setManualWithdrawalForm((prev) => {
      const nextInvoices = [...prev.invoices];
      nextInvoices[index] = { ...nextInvoices[index], [field]: value };
      return { ...prev, invoices: nextInvoices };
    });
  };

  const handlePdfFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToastRef.current?.('⚠️ يرجى اختيار ملف بصيغة PDF فقط');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setManualWithdrawalForm((prev) => ({
        ...prev,
        pdf_file: file,
        pdf_file_name: file.name,
        pdf_file_base64: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePdfFile = () => {
    setManualWithdrawalForm((prev) => ({
      ...prev,
      pdf_file: null,
      pdf_file_name: '',
      pdf_file_base64: ''
    }));
  };

  const handlePreviewPdf = () => {
    if (!manualWithdrawalForm.pdf_file_base64) return;
    const win = window.open();
    if (win) {
      win.document.write(`<iframe src="${manualWithdrawalForm.pdf_file_base64}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
    }
  };

  const handleSaveManualSupplierWithdrawal = async (e) => {
    e.preventDefault();
    if (!selectedSupplierForWithdrawals?.id) return;

    const itemCount = parseInt(manualWithdrawalForm.item_count || 1, 10);
    if (isNaN(itemCount) || itemCount < 1) {
      showToastRef.current?.('⚠️ يرجى إدخال عدد أصناف صحيح (1 على الأقل)');
      return;
    }

    const validInvoices = (manualWithdrawalForm.invoices || []).filter(
      (inv) => parseFloat(inv.amount || 0) > 0
    );

    if (validInvoices.length === 0) {
      showToastRef.current?.('⚠️ يرجى إدخال فاتورة واحدة على الأقل بمبلغ أكبر من صفر');
      return;
    }

    try {
      setIsSubmittingManualWithdrawal(true);
      const res = await outstockAddSupplierWithdrawal(selectedSupplierForWithdrawals.id, {
        items_count: itemCount,
        invoices: validInvoices.map((inv, idx) => ({
          invoice_number: inv.invoice_number?.trim() || `WITH-${Date.now().toString().slice(-4)}-${idx + 1}`,
          invoice_date: inv.invoice_date || new Date().toISOString().slice(0, 10),
          amount: parseFloat(inv.amount || 0)
        })),
        total_amount: manualWithdrawalTotalAmount,
        file_base64: manualWithdrawalForm.pdf_file_base64 || null,
        file_name: manualWithdrawalForm.pdf_file_name || null,
        notes: manualWithdrawalForm.notes || ''
      });

      if (res?.success) {
        showToastRef.current?.('✅ تم تسجيل المسحوبات وتحديث كشف حساب المورد بنجاح');
        setManualWithdrawalForm({
          item_count: '1',
          invoices: [
            { invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10), amount: '' }
          ],
          pdf_file: null,
          pdf_file_name: '',
          pdf_file_base64: '',
          notes: ''
        });
        setIsManualWithdrawalModalOpen(false);
        if (returnToWithdrawalsAfterManual) {
          setReturnToWithdrawalsAfterManual(false);
          setIsWithdrawalModalOpen(true);
          handleOpenWithdrawals(selectedSupplierForWithdrawals);
        }
        loadSuppliers();
      } else {
        showToastRef.current?.(`⚠️ ${res?.error || 'فشل تسجيل المسحوب'}`);
      }
    } catch (err) {
      console.error(err);
      showToastRef.current?.('❌ حدث خطأ أثناء تسجيل المسحوبات');
    } finally {
      setIsSubmittingManualWithdrawal(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. فواتير الموردين ومطابقتها والأرشفة في Google Drive
  // ══════════════════════════════════════════════════════════════════════════════
  const [invoices, setInvoices] = useState([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoiceSupplierFilter, setInvoiceSupplierFilter] = useState('all');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);

  // حالة حفظ المسودة المؤقتة محلياً
  const [hasInvoiceDraft, setHasInvoiceDraft] = useState(() => {
    try {
      return Boolean(localStorage.getItem('outstock_supplier_invoice_draft'));
    } catch (e) {
      return false;
    }
  });

  // مطابقة الأمان: طلبيات وأذون استلام اليوم لنفس المورد
  const [sameDayReceipts, setSameDayReceipts] = useState([]);
  const [selectedReceiptForMatching, setSelectedReceiptForMatching] = useState(null);
  const [isLoadingReceiptsForMatching, setIsLoadingReceiptsForMatching] = useState(false);

  // حالة نموذج الفاتورة الجديدة / المعدلة
  const [invoiceForm, setInvoiceForm] = useState({
    supplier_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_terms: 'credit',
    due_date: '',
    discount_amount: '0',
    tax_amount: '0',
    paid_amount: '0',
    notes: '',
    items: []
  });

  // فحص أذون الاستلام الموثقة لنفس المورد بنفس التاريخ لمطابقة الأمان
  useEffect(() => {
    if (isInvoiceModalOpen && invoiceForm.supplier_id && invoiceForm.invoice_date) {
      setIsLoadingReceiptsForMatching(true);
      outstockGetOrderReceipts({
        supplierId: invoiceForm.supplier_id,
        dateFrom: invoiceForm.invoice_date,
        dateTo: invoiceForm.invoice_date
      })
        .then((res) => {
          if (res?.success && Array.isArray(res.receipts)) {
            setSameDayReceipts(res.receipts);
          } else {
            setSameDayReceipts([]);
          }
        })
        .catch(() => setSameDayReceipts([]))
        .finally(() => setIsLoadingReceiptsForMatching(false));
    } else {
      setSameDayReceipts([]);
      setSelectedReceiptForMatching(null);
    }
  }, [isInvoiceModalOpen, invoiceForm.supplier_id, invoiceForm.invoice_date]);

  // اختيار إذن استلام معين لربطه وتدقيقه
  const handleSelectMatchingReceipt = async (receiptId) => {
    if (!receiptId) {
      setSelectedReceiptForMatching(null);
      return;
    }
    const found = sameDayReceipts.find(r => String(r.id) === String(receiptId));
    if (found) {
      let detailed = found;
      if (!found.items || found.items.length === 0) {
        try {
          const res = await outstockGetOrderReceiptDetails(found.id);
          if (res?.success && res.receipt) detailed = res.receipt;
        } catch (e) {}
      }
      setSelectedReceiptForMatching(detailed);
    }
  };

  // تفريغ أصناف إذن الاستلام الموثقة داخل الفاتورة
  const handleApplyReceiptItemsToInvoice = () => {
    if (!selectedReceiptForMatching || !selectedReceiptForMatching.items) return;
    const newItems = selectedReceiptForMatching.items.map((it, idx) => {
      const qty = Number(it.quantity_received) || 1;
      const pub = Number(it.public_price) || 0;
      return {
        id: `rec_item_${Date.now()}_${idx}`,
        medication_name: it.medication_name || '',
        barcode: it.barcode || '',
        pack_size: 1,
        quantity: qty,
        public_price: pub || '',
        catalog_price: pub || null,
        discount_percent: '',
        buy_price: pub || '',
        total_price: parseFloat((qty * (pub || 0)).toFixed(2)),
        expiry_date: it.expiry_date || '',
        batch_number: it.batch_number || ''
      };
    });

    setInvoiceForm((prev) => ({
      ...prev,
      invoice_number: prev.invoice_number || selectedReceiptForMatching.invoice_number || '',
      items: newItems
    }));
    showToastRef.current?.(`✅ تم تحميل ${newItems.length} صنف من إذن الاستلام بنجاح`);
  };

  // حساب عدم التطابق الأمني بين بنود الفاتورة وإذن الاستلام
  const matchingDiscrepancies = useMemo(() => {
    if (!selectedReceiptForMatching || !selectedReceiptForMatching.items || selectedReceiptForMatching.items.length === 0) {
      return [];
    }
    const receiptItems = selectedReceiptForMatching.items;
    const discrepancies = [];

    // فحص الأصناف المستلمة ومقارنة كمياتها مع الفاتورة
    receiptItems.forEach(rit => {
      const rName = (rit.medication_name || '').trim().toLowerCase();
      const rQty = Number(rit.quantity_received || 0);
      const matchedInv = invoiceForm.items.find(i => (i.medication_name || '').trim().toLowerCase() === rName);
      if (!matchedInv) {
        discrepancies.push({
          type: 'missing_in_invoice',
          medicationName: rit.medication_name,
          message: `الصنف "${rit.medication_name}" مسجل بإذن الاستلام (${rQty} وحدة) وغير موجود بالفاتورة`
        });
      } else if (Number(matchedInv.quantity) !== rQty) {
        discrepancies.push({
          type: 'qty_mismatch',
          medicationName: rit.medication_name,
          message: `اختلاف كمية "${rit.medication_name}": المستلم (${rQty}) ≠ بالفاتورة (${matchedInv.quantity})`
        });
      }
    });

    // فحص الأصناف الموجودة بالفاتورة وغير مسجلة بإذن الاستلام
    invoiceForm.items.forEach(invItem => {
      const invName = (invItem.medication_name || '').trim().toLowerCase();
      const matchedReceipt = receiptItems.find(r => (r.medication_name || '').trim().toLowerCase() === invName);
      if (!matchedReceipt) {
        discrepancies.push({
          type: 'extra_in_invoice',
          medicationName: invItem.medication_name,
          message: `الصنف "${invItem.medication_name}" مضاف بالفاتورة ولكن لم يُسجل بإذن استلام الشحنة`
        });
      }
    });

    return discrepancies;
  }, [selectedReceiptForMatching, invoiceForm.items]);

  // حفظ مسودة الفاتورة مؤقتاً في المتصفح
  const handleSaveInvoiceDraft = () => {
    try {
      const draftData = {
        invoiceForm,
        verifiedInvoiceEmployee,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('outstock_supplier_invoice_draft', JSON.stringify(draftData));
      setHasInvoiceDraft(true);
      showToastRef.current?.('💾 تم حفظ مسودة الفاتورة مؤقتاً بنجاح');
    } catch (e) {
      showToastRef.current?.('تعذر حفظ المسودة');
    }
  };

  // استعادة مسودة الفاتورة المحفوظة مؤقتاً
  const handleRestoreInvoiceDraft = () => {
    try {
      const raw = localStorage.getItem('outstock_supplier_invoice_draft');
      if (!raw) {
        showToastRef.current?.('لا توجد مسودة محفوظة مسبقاً');
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed.invoiceForm) {
        setInvoiceForm(parsed.invoiceForm);
      }
      if (parsed.verifiedInvoiceEmployee) {
        setVerifiedInvoiceEmployee(parsed.verifiedInvoiceEmployee);
      }
      setEditingInvoiceId(null);
      setIsInvoiceModalOpen(true);
      showToastRef.current?.('✅ تم استعادة مسودة الفاتورة المحفوظة بنجاح');
    } catch (e) {
      showToastRef.current?.('تعذر استعادة المسودة');
    }
  };

  // فتح نافذة تعديل فاتورة مسجلة مسبقاً
  const handleOpenEditInvoice = async (inv) => {
    try {
      let fullInv = inv;
      if (!inv.items || inv.items.length === 0) {
        const res = await outstockGetSupplierInvoiceDetails(inv.id);
        if (res?.success && res.invoice) {
          fullInv = res.invoice;
        }
      }

      setEditingInvoiceId(fullInv.id);
      setVerifiedInvoiceEmployee({
        name: fullInv.recorded_by || fullInv.recorded_by_name || 'مسؤول المشتريات',
        code: fullInv.recorded_by_code || 'EMP'
      });

      setInvoiceForm({
        supplier_id: fullInv.supplier_id || '',
        invoice_number: fullInv.invoice_number || '',
        invoice_date: fullInv.invoice_date ? String(fullInv.invoice_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        payment_terms: fullInv.payment_terms || 'credit',
        due_date: fullInv.due_date ? String(fullInv.due_date).slice(0, 10) : '',
        discount_amount: String(fullInv.discount_amount || '0'),
        tax_amount: String(fullInv.tax_amount || '0'),
        paid_amount: String(fullInv.paid_amount || '0'),
        notes: fullInv.notes || '',
        items: (fullInv.items || []).map((it, idx) => ({
          id: it.id || `inv_item_${idx}`,
          medication_name: it.medication_name || '',
          barcode: it.barcode || '',
          pack_size: Number(it.pack_size) || 1,
          quantity: Number(it.quantity) || 1,
          public_price: it.public_price || '',
          catalog_price: it.public_price || null,
          discount_percent: it.discount_percent || '',
          buy_price: it.buy_price || '',
          total_price: it.total_price || (Number(it.quantity || 1) * Number(it.buy_price || 0)),
          expiry_date: it.expiry_date || it.expiryDate || '',
          batch_number: it.batch_number || it.batchNumber || ''
        }))
      });

      setViewingInvoice(null);
      setIsInvoiceModalOpen(true);
    } catch (err) {
      console.error(err);
      showToastRef.current?.('تعذر فتح الفاتورة للتعديل');
    }
  };

  // ملف الفاتورة المرفوع
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedFileBase64, setAttachedFileBase64] = useState('');
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [isExtractingAI, setIsExtractingAI] = useState(false);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);

  const medicationInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const barcodeInputRef = useRef(null);
  const [editingInvoiceItemIndex, setEditingInvoiceItemIndex] = useState(null);

  // صنف مؤقت للإدخال اليدوي
  const [manualItem, setManualItem] = useState({
    medication_name: '',
    barcode: '',
    pack_size: 1,
    quantity: 1,
    public_price: '',
    discount_percent: '',
    buy_price: '',
    expiry_date: '',
    batch_number: '',
    catalog_price: null
  });

  const loadInvoices = useCallback(async () => {
    try {
      setIsLoadingInvoices(true);
      const params = {};
      if (invoiceSupplierFilter !== 'all') params.supplierId = invoiceSupplierFilter;
      if (invoiceStatusFilter !== 'all') params.paymentStatus = invoiceStatusFilter;
      if (invoiceSearchQuery.trim()) params.search = invoiceSearchQuery.trim();

      const res = await outstockGetSupplierInvoices(params);
      if (res?.success) {
        setInvoices(res.invoices || []);
      }
    } catch (err) {
      console.error(err);
      showToastRef.current?.('تعذر تحميل فواتير الموردين');
    } finally {
      setIsLoadingInvoices(false);
    }
  }, [invoiceSupplierFilter, invoiceStatusFilter, invoiceSearchQuery]);

  useEffect(() => {
    if (activeSubTab === 'invoices') {
      loadInvoices();
    }
  }, [activeSubTab, loadInvoices]);

  const handleCloseInvoiceModal = () => {
    setInvoiceForm({
      supplier_id: '',
      invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      payment_terms: 'credit',
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      discount_amount: '0',
      tax_amount: '0',
      paid_amount: '0',
      notes: '',
      items: []
    });
    setManualItem({
      medication_name: '',
      barcode: '',
      pack_size: 1,
      quantity: 1,
      public_price: '',
      discount_percent: '',
      buy_price: '',
      expiry_date: '',
      batch_number: '',
      catalog_price: null
    });
    setAttachedFile(null);
    setAttachedFileBase64('');
    setEditingInvoiceId(null);
    setSelectedReceiptForMatching(null);
    setIsInvoiceModalOpen(false);
  };

  const handleOpenAddInvoice = () => {
    setEditingInvoiceId(null);
    setIsInvoiceEmployeeAuthOpen(true);
  };

  // معالجة رفع الملف
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFileBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // 1) استيراد من ملف Excel
  const handleImportExcelInvoice = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingExcel(true);
    try {
      const res = await parseSupplierInvoiceExcel(file);
      if (res.success && res.items.length > 0) {
        setInvoiceForm((prev) => ({
          ...prev,
          items: [...prev.items, ...res.items]
        }));
        showToast?.(`تم استيراد ${res.items.length} صنف من شيت الإكسل بنجاح`);
      } else {
        showToast?.(res.error || 'لم يتم العثور على أصناف صالحة في ملف الإكسل');
      }
    } catch (err) {
      console.error(err);
      showToast?.('حدث خطأ أثناء قراءة ملف الإكسل');
    } finally {
      setIsParsingExcel(false);
      e.target.value = '';
    }
  };

  // 2) استخراج ذكي بالذكاء الاصطناعي (Groq Vision + Gemini Vision + Regex)
  const handleAIExtractInvoice = async () => {
    if (!attachedFileBase64) {
      showToastRef.current?.('يرجى اختيار صورة الفاتورة أو المستند أولاً');
      return;
    }
    setIsExtractingAI(true);
    try {
      const extracted = await performSmartExtraction(
        attachedFile,
        attachedFileBase64,
        {},
        suppliers,
        (msg) => console.log(msg)
      );

      if (extracted && (extracted.items?.length > 0 || extracted.totalAmount > 0)) {
        setInvoiceForm((prev) => ({
          ...prev,
          supplier_id: extracted.supplierId || prev.supplier_id,
          invoice_number: extracted.invoiceNumber || prev.invoice_number,
          invoice_date: extracted.invoiceDate || prev.invoice_date,
          discount_amount: extracted.discountAmount ? String(extracted.discountAmount) : prev.discount_amount,
          items: extracted.items && extracted.items.length > 0
            ? [...prev.items, ...extracted.items.map((it, idx) => {
                const qty = Number(it.quantity) || 1;
                const pub = Number(it.public_price) || 0;
                const disc = Number(it.discount_percent) || 0;
                let buy = Number(it.buy_price);
                if (!buy && pub > 0) buy = pub * (1 - disc / 100);
                const tot = Number(it.total_price) || (qty * buy);
                let rawExp = it.expiry_date || it.expiry || it.exp || '';
                const parsedExp = parseExpiryDate(rawExp);
                if (parsedExp) rawExp = parsedExp.formatted;
                return {
                  id: `ai_item_${Date.now()}_${idx}`,
                  medication_name: it.medication_name || it.name || '',
                  barcode: it.barcode || '',
                  pack_size: Number(it.pack_size) || 1,
                  quantity: qty,
                  public_price: pub,
                  catalog_price: pub || null,
                  discount_percent: disc,
                  buy_price: parseFloat(buy.toFixed(2)),
                  total_price: parseFloat(tot.toFixed(2)),
                  expiry_date: rawExp,
                  batch_number: it.batch_number || it.batch || it.lot || ''
                };
              })]
            : prev.items
        }));
        showToastRef.current?.(`تم استخراج بيانات الفاتورة و${extracted.items?.length || 0} صنف بنجاح ✨`);
      } else {
        showToastRef.current?.('لم يتمكن الذكاء الاصطناعي من قراءة الأصناف بوضوح، يرجى التدقيق أو الإدخال اليدوي');
      }
    } catch (err) {
      console.error(err);
      showToastRef.current?.('تعذر استخراج البيانات بالذكاء الاصطناعي');
    } finally {
      setIsExtractingAI(false);
    }
  };

  // البحث عن الصنف بالباركود العالمي GTIN مباشرة
  const handleBarcodeLookup = async (code) => {
    const cleanCode = String(code || '').trim();
    if (!cleanCode) return;
    try {
      const res = await outstockGetMedicationByBarcode(cleanCode);
      if (res?.success && res.medication) {
        const med = res.medication;
        const pub = Number(med.price || med.public_price || 0);
        const supplierObj = suppliers.find((s) => s.id === invoiceForm.supplier_id);
        const defaultDisc = supplierObj ? Number(supplierObj.default_discount || 0) : 0;
        const disc = Number(manualItem.discount_percent) || defaultDisc || 0;
        const buy = pub > 0 && disc > 0 ? parseFloat((pub * (1 - disc / 100)).toFixed(2)) : (pub || '');

        setManualItem((prev) => ({
          ...prev,
          medication_name: med.trade_name_ar || med.displayName || med.trade_name_en || med.name,
          barcode: med.gtin_barcode || med.barcode || cleanCode,
          public_price: pub || '',
          discount_percent: disc || prev.discount_percent || '',
          buy_price: buy || '',
          pack_size: Number(med.pack_size) || 1,
          catalog_price: pub || null
        }));
        showToastRef.current?.(`✅ تم العثور على الصنف: ${med.trade_name_ar || med.trade_name_en || med.name}`);
        setTimeout(() => {
          quantityInputRef.current?.focus();
          quantityInputRef.current?.select();
        }, 80);
      } else {
        showToastRef.current?.('⚠️ لم يتم العثور على صنف مسجل بهذا الباركود');
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
    }
  };

  // بدء تعديل صنف مسجل بجدول الفاتورة
  const handleStartEditInvoiceItem = (item, index) => {
    setEditingInvoiceItemIndex(index);
    setManualItem({
      medication_name: item.medication_name || '',
      barcode: item.barcode || '',
      pack_size: item.pack_size || 1,
      quantity: item.quantity || 1,
      public_price: item.public_price !== undefined ? item.public_price : '',
      discount_percent: item.discount_percent !== undefined ? item.discount_percent : '',
      buy_price: item.buy_price !== undefined ? item.buy_price : '',
      expiry_date: item.expiry_date || '',
      batch_number: item.batch_number || '',
      catalog_price: item.catalog_price || null
    });
    setTimeout(() => {
      quantityInputRef.current?.focus();
    }, 60);
  };

  // إلغاء تعديل صنف
  const handleCancelEditInvoiceItem = () => {
    setEditingInvoiceItemIndex(null);
    setManualItem({
      medication_name: '',
      barcode: '',
      pack_size: 1,
      quantity: 1,
      public_price: '',
      discount_percent: '',
      buy_price: '',
      expiry_date: '',
      batch_number: '',
      catalog_price: null
    });
    medicationInputRef.current?.focus();
  };

  // إضافة أو حفظ تعديل صنف يدوي
  const handleAddManualItem = () => {
    if (!manualItem.medication_name?.trim()) {
      showToastRef.current?.('يرجى كتابة اسم الصنف');
      medicationInputRef.current?.focus();
      return;
    }
    const qty = Number(manualItem.quantity) || 1;
    const pub = Number(manualItem.public_price) || 0;
    const disc = Number(manualItem.discount_percent) || 0;
    let buy = Number(manualItem.buy_price);
    if (!buy && pub > 0) {
      buy = pub * (1 - disc / 100);
    }
    const tot = qty * (buy || 0);

    // معالجة وتنسيق تاريخ الصلاحية
    let formattedExp = manualItem.expiry_date?.trim() || '';
    const parsedExp = parseExpiryDate(formattedExp);
    if (parsedExp) {
      formattedExp = parsedExp.formatted;
    }

    const newItem = {
      id: `manual_${Date.now()}`,
      medication_name: manualItem.medication_name.trim(),
      barcode: manualItem.barcode || '',
      pack_size: Number(manualItem.pack_size) || 1,
      quantity: qty,
      public_price: pub,
      catalog_price: manualItem.catalog_price || null,
      discount_percent: disc,
      buy_price: parseFloat((buy || 0).toFixed(2)),
      total_price: parseFloat(tot.toFixed(2)),
      expiry_date: formattedExp,
      batch_number: (manualItem.batch_number || '').trim()
    };

    if (editingInvoiceItemIndex !== null) {
      setInvoiceForm((prev) => {
        const nextItems = [...prev.items];
        const existingId = nextItems[editingInvoiceItemIndex]?.id || newItem.id;
        nextItems[editingInvoiceItemIndex] = {
          ...newItem,
          id: existingId
        };
        return { ...prev, items: nextItems };
      });
      setEditingInvoiceItemIndex(null);
      showToastRef.current?.('✅ تم حفظ تعديل الصنف بالفاتورة بنجاح');
    } else {
      setInvoiceForm((prev) => ({
        ...prev,
        items: [...prev.items, newItem]
      }));
    }

    setManualItem({
      medication_name: '',
      barcode: '',
      pack_size: 1,
      quantity: 1,
      public_price: '',
      discount_percent: '',
      buy_price: '',
      expiry_date: '',
      batch_number: '',
      catalog_price: null
    });

    setTimeout(() => {
      medicationInputRef.current?.focus();
    }, 50);
  };

  const handleRemoveInvoiceItem = (id) => {
    setInvoiceForm((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== id)
    }));
    if (editingInvoiceItemIndex !== null) {
      setEditingInvoiceItemIndex(null);
    }
  };

  // حساب إجماليات الفاتورة
  const invoiceTotals = useMemo(() => {
    let subtotal = 0;
    let totalDiscountItems = 0;

    invoiceForm.items.forEach((item) => {
      subtotal += Number(item.total_price || 0);
    });

    const disc = Number(invoiceForm.discount_amount || 0);
    const tax = Number(invoiceForm.tax_amount || 0);
    const net = Math.max(0, subtotal - disc + tax);
    const paid = Number(invoiceForm.paid_amount || 0);
    const remaining = Math.max(0, net - paid);

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      net: parseFloat(net.toFixed(2)),
      remaining: parseFloat(remaining.toFixed(2)),
      itemCount: invoiceForm.items.length
    };
  }, [invoiceForm]);

  // حفظ الفاتورة والأرشفة على Google Drive
  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceForm.supplier_id) {
      showToast?.('يرجى تحديد المورد');
      return;
    }
    if (!invoiceForm.invoice_number?.trim()) {
      showToast?.('يرجى كتابة رقم الفاتورة');
      return;
    }
    if (invoiceForm.items.length === 0) {
      showToast?.('يرجى إضافة بند واحد على الأقل داخل الفاتورة');
      return;
    }

    try {
      setIsSavingInvoice(true);
      const supplierObj = suppliers.find((s) => String(s.id) === String(invoiceForm.supplier_id));

      let driveResult = null;
      // أرشفة الملف على Google Drive إذا كان مرفقاً
      if (attachedFile && attachedFileBase64) {
        setIsUploadingToDrive(true);
        driveResult = await outstockUploadInvoiceToDrive({
          fileBase64: attachedFileBase64,
          fileName: attachedFile.name,
          mimeType: attachedFile.type,
          supplierCode: supplierObj?.code || 'SUP-GEN',
          supplierName: supplierObj?.name || 'مورد عام',
          invoiceNumber: invoiceForm.invoice_number
        });
        setIsUploadingToDrive(false);
      }

      const payload = {
        ...invoiceForm,
        recorded_by: verifiedInvoiceEmployee?.name || 'مسؤول المشتريات',
        recorded_by_code: verifiedInvoiceEmployee?.code || null,
        total_amount: invoiceTotals.subtotal,
        net_amount: invoiceTotals.net,
        remaining_balance: invoiceTotals.remaining,
        drive_file_id: driveResult?.fileId || null,
        drive_file_url: driveResult?.viewUrl || null,
        drive_folder_url: driveResult?.folderUrl || null
      };

      let res;
      if (editingInvoiceId) {
        res = await outstockUpdateSupplierInvoice(editingInvoiceId, payload);
      } else {
        res = await outstockSaveSupplierInvoice(payload);
      }

      if (res?.success) {
        showToastRef.current?.(
          editingInvoiceId ? '✅ تم تحديث بيانات الفاتورة بنجاح' : '✅ تم تسجيل الفاتورة وأرشفتها بنجاح'
        );
        handleCloseInvoiceModal();
        setEditingInvoiceId(null);
        loadInvoices();
        loadSuppliers();
      } else {
        showToastRef.current?.(res?.error || 'فشل حفظ الفاتورة');
      }
    } catch (err) {
      console.error(err);
      showToastRef.current?.('حدث خطأ أثناء حفظ الفاتورة');
    } finally {
      setIsSavingInvoice(false);
      setIsUploadingToDrive(false);
    }
  };

  // عرض تفاصيل الفاتورة ومطابقتها (Split-View / Modal)
  const handleViewInvoiceDetails = async (inv) => {
    try {
      const res = await outstockGetSupplierInvoiceDetails(inv.id);
      if (res?.success) {
        setViewingInvoice(res.invoice);
      } else {
        setViewingInvoice(inv);
      }
    } catch {
      setViewingInvoice(inv);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // 3. مسحوبات الفروع الشهرية
  // ══════════════════════════════════════════════════════════════════════════════
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchWithdrawalsData, setBranchWithdrawalsData] = useState([]);
  const [extraWithdrawals, setExtraWithdrawals] = useState([]);
  const [isLoadingBranchWithdrawals, setIsLoadingBranchWithdrawals] = useState(false);
  const [isExtraWithdrawalModalOpen, setIsExtraWithdrawalModalOpen] = useState(false);
  const [isBranchHistoryModalOpen, setIsBranchHistoryModalOpen] = useState(false);
  const [selectedBranchForHistory, setSelectedBranchForHistory] = useState(null);
  const [branchesList, setBranchesList] = useState([]);
  const [editingWithdrawalId, setEditingWithdrawalId] = useState(null);

  const [extraForm, setExtraForm] = useState({
    branch_id: '',
    amount: '',
    items_count: '1',
    withdrawal_date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const loadBranchWithdrawals = useCallback(async () => {
    try {
      setIsLoadingBranchWithdrawals(true);
      const res = await outstockGetBranchWithdrawals({ monthPeriod: selectedMonth });
      if (res?.success) {
        setBranchWithdrawalsData(res.branchesSummary || []);
        setExtraWithdrawals(res.withdrawals || res.extraWithdrawals || []);
      }
    } catch (err) {
      console.error(err);
      showToastRef.current?.('تعذر تحميل مسحوبات الفروع');
    } finally {
      setIsLoadingBranchWithdrawals(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (activeSubTab === 'withdrawals') {
      loadBranchWithdrawals();
      outstockGetBranches()
        .then((res) => {
          if (res?.success) setBranchesList(res.branches || []);
        })
        .catch(() => {});
    }
  }, [activeSubTab, loadBranchWithdrawals]);

  const handleSaveExtraWithdrawal = async (e) => {
    e.preventDefault();
    if (!extraForm.branch_id) {
      showToastRef.current?.('يرجى اختيار الفرع');
      return;
    }
    const numAmount = parseFloat(extraForm.amount || 0);
    if (!numAmount || numAmount <= 0) {
      showToastRef.current?.('يرجى إدخال مبلغ مسحوبات صحيح أكبر من صفر');
      return;
    }
    const itemsCount = parseInt(extraForm.items_count || 1);

    try {
      let res;
      if (editingWithdrawalId) {
        res = await outstockUpdateBranchWithdrawal(editingWithdrawalId, {
          branch_id: extraForm.branch_id,
          amount: numAmount,
          items_count: itemsCount,
          withdrawal_date: extraForm.withdrawal_date,
          notes: extraForm.notes
        });
      } else {
        res = await outstockSaveBranchWithdrawal({
          branch_id: extraForm.branch_id,
          amount: numAmount,
          items_count: itemsCount,
          withdrawal_date: extraForm.withdrawal_date,
          notes: extraForm.notes
        });
      }

      if (res?.success) {
        showToastRef.current?.(editingWithdrawalId ? '✅ تم تحديث مسحوب الفرع بنجاح' : '✅ تم تسجيل مسحوبات الفرع بنجاح');
        setIsExtraWithdrawalModalOpen(false);
        setEditingWithdrawalId(null);
        setExtraForm({
          branch_id: '',
          amount: '',
          items_count: '1',
          withdrawal_date: new Date().toISOString().slice(0, 10),
          notes: ''
        });
        loadBranchWithdrawals();
      } else {
        showToastRef.current?.(res?.error || 'فشل الحفظ');
      }
    } catch (err) {
      showToastRef.current?.('حدث خطأ أثناء حفظ المسحوب');
    }
  };

  const handleStartEditBranchWithdrawal = (withdrawal) => {
    setEditingWithdrawalId(withdrawal.id);
    setExtraForm({
      branch_id: withdrawal.branch_id || (selectedBranchForHistory ? (selectedBranchForHistory.branch_id || selectedBranchForHistory.id) : ''),
      amount: String(withdrawal.amount || ''),
      items_count: String(withdrawal.items_count || 1),
      withdrawal_date: withdrawal.withdrawal_date ? withdrawal.withdrawal_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: withdrawal.notes || ''
    });
    setIsExtraWithdrawalModalOpen(true);
  };

  const handleDeleteBranchWithdrawal = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المسحوب نهائياً؟')) return;
    try {
      const res = await outstockDeleteBranchWithdrawal(id);
      if (res?.success) {
        showToastRef.current?.('✅ تم حذف المسحوب بنجاح');
        loadBranchWithdrawals();
      } else {
        showToastRef.current?.(res?.error || 'تعذر حذف المسحوب');
      }
    } catch (err) {
      console.error(err);
      showToastRef.current?.('حدث خطأ أثناء حذف المسحوب');
    }
  };

  const handleExportBranchWithdrawals = async () => {
    try {
      await exportBranchWithdrawalsExcel(selectedMonth, branchWithdrawalsData, extraWithdrawals);
      showToast?.('تم تصدير مسحوبات الفروع إلى ملف إكسل بنجاح');
    } catch (err) {
      console.error(err);
      showToast?.('فشل تصدير ملف الإكسل');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // واجهة العرض (JSX)
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="procurement-suppliers-tab-container" style={{ padding: '16px', direction: 'rtl' }}>
      {/* ── شريط التنقل الفرعي (Sub-Tabs) ── */}
      <div
        className="suppliers-subtabs-bar"
        style={{
          display: 'flex',
          gap: '10px',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}
      >
        {canAccessAccounts && (
          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'accounts' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('accounts')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontWeight: 'bold' }}
          >
            <Truck size={17} />
            <span>حسابات الموردين وحدود الائتمان</span>
            <span
              style={{
                background: activeSubTab === 'accounts' ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px'
              }}
            >
              {suppliers.length}
            </span>
          </button>
        )}

        {canAccessReceiving && (
          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'order_receiving' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('order_receiving')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              fontWeight: 'bold',
              background: activeSubTab === 'order_receiving' ? '#0f766e' : '#f0fdfa',
              color: activeSubTab === 'order_receiving' ? '#fff' : '#0f766e',
              border: '1.5px solid #99f6e4'
            }}
          >
            <PackageCheck size={17} />
            <span>استلام الطلبات والشحنات</span>
          </button>
        )}

        {canAccessInvoices && (
          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'invoices' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('invoices')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontWeight: 'bold' }}
          >
            <FileText size={17} />
            <span>فواتير الموردين ومطابقتها (Drive)</span>
          </button>
        )}

        {canAccessWithdrawals && (
          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'withdrawals' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('withdrawals')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontWeight: 'bold' }}
          >
            <Building2 size={17} />
            <span>مسحوبات الفروع الشهرية</span>
          </button>
        )}

        {canAccessDiscounts && (
          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'discounts_comparison' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('discounts_comparison')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              fontWeight: 'bold',
              background: activeSubTab === 'discounts_comparison' ? '#0f766e' : '#f0fdf4',
              color: activeSubTab === 'discounts_comparison' ? '#fff' : '#15803d',
              border: '1.5px solid #86efac'
            }}
            title="مقارنة نسب خصم شركات التوزيع للأصناف وبوابة الربط مع منصة i'SUPPLY"
          >
            <Percent size={17} />
            <span>مقارنة خصومات الموردين و i'SUPPLY 👑</span>
          </button>
        )}

        {canAccessPharmafly && (
          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'pharmafly_sync' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('pharmafly_sync')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              fontWeight: 'bold',
              background: activeSubTab === 'pharmafly_sync' ? '#065f46' : '#ecfdf5',
              color: activeSubTab === 'pharmafly_sync' ? '#fff' : '#047857',
              border: '1.5px solid #a7f3d0'
            }}
            title="ربط ومزامنة برنامج فارما فلاي للفروع لحظياً"
          >
            <Server size={17} />
            <span>ربط فارما فلاي 🔄 (PharmaFly ERP)</span>
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الأول: حسابات الموردين وحدود الائتمان
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'accounts' && (
        <div className="suppliers-accounts-section">
          {/* شريط الإدارة والفلترة الشهرية وتدوير الحدود الائتمانية */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              border: '1.5px solid #cbd5e1',
              borderRadius: '12px',
              padding: '14px 18px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              flexWrap: 'wrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#0f766e',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Calendar size={22} />
              </div>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>حسابات شهر:</span>
                  <span style={{ color: '#0f766e', fontFamily: 'monospace', fontSize: '16px' }}>{supplierAccountsMonth}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  يتم تصفير المسحوبات والمديونيات للشهر الجديد تلقائياً مع الاحتفاظ التام بسجلات الشهور السابقة
                </div>
              </div>

              {/* عناصر اختيار الشهر */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '10px' }}>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="outstock-btn outstock-btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="الشهر السابق"
                >
                  <ChevronRight size={15} />
                  <span>الشهر السابق</span>
                </button>

                <input
                  type="month"
                  className="outstock-form-input"
                  value={supplierAccountsMonth}
                  onChange={(e) => {
                    if (e.target.value) setSupplierAccountsMonth(e.target.value);
                  }}
                  style={{ width: '150px', padding: '6px 10px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}
                />

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="outstock-btn outstock-btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="الشهر التالي"
                >
                  <span>الشهر التالي</span>
                  <ChevronLeft size={15} />
                </button>

                <button
                  type="button"
                  onClick={handleCurrentMonth}
                  className="outstock-btn outstock-btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 'bold', color: '#0f766e' }}
                  title="الانتقال للشهر الحالي"
                >
                  الشهر الحالي
                </button>
              </div>
            </div>

            {/* زر استعمال نفس الحد الائتماني من الشهر السابق */}
            <button
              type="button"
              onClick={handleRolloverCreditLimits}
              disabled={isLoading}
              className="outstock-btn"
              style={{
                background: '#047857',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: '800',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(4, 120, 87, 0.25)'
              }}
              title="نسخ الحدود الائتمانية من الشهر السابق وتطبيقها على هذا الشهر"
            >
              <RefreshCw size={15} className={isLoading ? 'outstock-spin' : ''} />
              <span>استعمال نفس الحد الائتماني من الشهر السابق</span>
            </button>
          </div>

          {/* بطاقات المؤشرات الرقمية (KPIs) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}
          >
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Truck size={22} />
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>إجمالي الموردين</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                  {supplierStats.count} مورد{' '}
                  <span style={{ fontSize: '11px', color: '#0284c7' }}>({supplierStats.creditCount} أجل)</span>
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <DollarSign size={22} />
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>حد الائتمان الكلي</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#b45309' }}>
                  {supplierStats.totalCreditLimit.toLocaleString('ar-EG')} ج.م
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <CreditCard size={22} />
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>إجمالي المديونية الحالية</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#b91c1c' }}>
                  {supplierStats.totalBalance.toLocaleString('ar-EG')} ج.م
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Percent size={22} />
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>استهلاك الائتمان</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#047857' }}>
                  {supplierStats.creditUtilization}%
                </div>
              </div>
            </div>
          </div>

          {/* شريط الإجراءات والبحث */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
                <Search
                  size={16}
                  style={{ position: 'absolute', right: '10px', top: '10px', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  className="outstock-form-input"
                  placeholder="بحث باسم المورد، الكود، أو الهاتف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingRight: '34px', width: '100%' }}
                />
              </div>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={loadSuppliers}
                title="تحديث البيانات"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              onClick={handleOpenAddSupplier}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>إضافة مورد جديد</span>
            </button>
          </div>

          {/* جدول الموردين */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
              <div>جاري تحميل بيانات الموردين...</div>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <Truck size={36} style={{ color: '#94a3b8', marginBottom: '10px' }} />
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#475569' }}>لا يوجد موردين مسجلين</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                اضغط على زر "إضافة مورد جديد" لبدء تسجيل حسابات الموردين والأجل
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 14px' }}>كود المورد</th>
                    <th style={{ padding: '12px 14px' }}>اسم المورد</th>
                    <th style={{ padding: '12px 14px' }}>جهة الاتصال والهاتف</th>
                    <th style={{ padding: '12px 14px' }}>طريقة التعامل</th>
                    <th style={{ padding: '12px 14px' }}>حد الائتمان</th>
                    <th style={{ padding: '12px 14px' }}>فترة السداد</th>
                    <th style={{ padding: '12px 14px' }}>الرصيد الحالي</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map((s, idx) => {
                    const limit = Number(s.credit_limit || 0);
                    const bal = Number(s.current_balance || 0);
                    const percent = limit > 0 ? Math.min(100, Math.round((bal / limit) * 100)) : 0;
                    return (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 1 ? '#fafafa' : '#fff'
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f766e' }}>
                          {s.code || `SUP-${s.id}`}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>{s.name}</td>
                        <td style={{ padding: '12px 14px', color: '#475569' }}>
                          <div>{s.phone || '-'}</div>
                          {s.contact_person && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{s.contact_person}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {s.payment_type === 'credit' ? (
                            <span
                              style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11.5px',
                                fontWeight: 'bold'
                              }}
                            >
                              أجل (ائتمان)
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11.5px',
                                fontWeight: 'bold'
                              }}
                            >
                              نقدي (كاش)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#334155' }}>
                          {limit > 0 ? `${limit.toLocaleString('ar-EG')} ج.م` : 'بدون سقف'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>
                          {s.credit_term_days ? `${s.credit_term_days} يوم` : '-'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 'bold', color: bal > 0 ? '#dc2626' : '#16a34a' }}>
                            {bal.toLocaleString('ar-EG')} ج.م
                          </div>
                          {limit > 0 && (
                            <div
                              style={{
                                width: '100px',
                                height: '5px',
                                background: '#e2e8f0',
                                borderRadius: '3px',
                                overflow: 'hidden',
                                marginTop: '4px'
                              }}
                            >
                              <div
                                style={{
                                  width: `${percent}%`,
                                  height: '100%',
                                  background: percent > 85 ? '#ef4444' : percent > 60 ? '#f59e0b' : '#10b981'
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleOpenSettlement(s)}
                              title="تسوية دفعة مالية"
                              style={{ padding: '5px 8px', fontSize: '11.5px', color: '#047857' }}
                            >
                              <DollarSign size={14} />
                              <span>سداد</span>
                            </button>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleOpenWithdrawals(s)}
                              title="كشف مسحوبات المورد"
                              style={{ padding: '5px 8px', fontSize: '11.5px', color: '#0284c7' }}
                            >
                              <Eye size={14} />
                              <span>مسحوبات</span>
                            </button>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleOpenEditSupplier(s)}
                              title="تعديل بيانات المورد"
                              style={{ padding: '5px 8px' }}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleDeleteSupplier(s)}
                              title="حذف المورد"
                              style={{ padding: '5px 8px', color: '#dc2626' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الجديد: استلام الطلبات والشحنات
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'order_receiving' && (
        <ProcurementOrderReceivingTab showToast={showToastRef.current || showToast} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الثاني: فواتير الموردين ومطابقتها والأرشفة على Google Drive
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'invoices' && (
        <div className="suppliers-invoices-section">
          {/* شريط الإجراءات والفلترة */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
                <Search
                  size={16}
                  style={{ position: 'absolute', right: '10px', top: '10px', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  className="outstock-form-input"
                  placeholder="بحث برقم الفاتورة، المورد، أو اسم الصنف..."
                  value={invoiceSearchQuery}
                  onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                  style={{ paddingRight: '34px', width: '100%' }}
                />
              </div>

              <select
                className="outstock-form-select"
                value={invoiceSupplierFilter}
                onChange={(e) => setInvoiceSupplierFilter(e.target.value)}
                style={{ width: '160px' }}
              >
                <option value="all">كافة الموردين</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                className="outstock-form-select"
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                style={{ width: '150px' }}
              >
                <option value="all">كافة الحالات</option>
                <option value="paid">مدفوعة بالكامل</option>
                <option value="partially_paid">مدفوعة جزئياً</option>
                <option value="unpaid">غير مدفوعة (مستحقة)</option>
              </select>

              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={loadInvoices}
                title="تحديث قائمة الفواتير"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {hasInvoiceDraft && (
                <button
                  type="button"
                  className="outstock-btn"
                  onClick={handleRestoreInvoiceDraft}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#fef3c7',
                    border: '1px solid #fde047',
                    color: '#854d0e',
                    fontWeight: '800',
                    fontSize: '12px'
                  }}
                  title="استعادة مسودة الفاتورة المحفوظة مؤقتاً"
                >
                  <FolderArchive size={15} />
                  <span>استعادة الحفظ المؤقت (مسودة)</span>
                </button>
              )}

              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={handleOpenAddInvoice}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>تسجيل فاتورة توريد جديدة</span>
              </button>
            </div>
          </div>

          {/* قائمة الفواتير */}
          {isLoadingInvoices ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
              <div>جاري تحميل فواتير الشراء...</div>
            </div>
          ) : invoices.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <FileText size={36} style={{ color: '#94a3b8', marginBottom: '10px' }} />
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#475569' }}>لا توجد فواتير مطابقة</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                اضغط على "تسجيل فاتورة توريد جديدة" لإدخال فواتير الشراء ومطابقة البنود
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 14px' }}>رقم الفاتورة</th>
                    <th style={{ padding: '12px 14px' }}>المورد</th>
                    <th style={{ padding: '12px 14px' }}>مسؤول الإدخال</th>
                    <th style={{ padding: '12px 14px' }}>التاريخ والاستحقاق</th>
                    <th style={{ padding: '12px 14px' }}>إجمالي الفاتورة</th>
                    <th style={{ padding: '12px 14px' }}>الصافي بعد الخصم</th>
                    <th style={{ padding: '12px 14px' }}>المدفوع والمتبقي</th>
                    <th style={{ padding: '12px 14px' }}>أرشيف Drive</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>معاينة ومطابقة</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, idx) => {
                    const net = Number(inv.net_amount || inv.total_amount || 0);
                    const paid = Number(inv.paid_amount || 0);
                    const remaining = Math.max(0, net - paid);
                    const isPaid = remaining <= 0;

                    return (
                      <tr
                        key={inv.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 1 ? '#fafafa' : '#fff'
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f766e' }}>
                          {inv.invoice_number}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 'bold' }}>{inv.supplier_name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{inv.supplier_code}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <UserCheck size={14} color="#0f766e" />
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                              {inv.recorded_by || inv.recorded_by_name || 'مسؤول المشتريات'}
                            </span>
                          </div>
                          {inv.recorded_by_code && (
                            <div style={{ fontSize: '10.5px', color: '#64748b', fontFamily: 'monospace' }}>
                              كود: ••••
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569' }}>
                          <div>{new Date(inv.invoice_date).toLocaleDateString('ar-EG')}</div>
                          {inv.due_date && (
                            <div style={{ fontSize: '11px', color: '#d97706' }}>
                              استحقاق: {new Date(inv.due_date).toLocaleDateString('ar-EG')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>
                          {Number(inv.total_amount || 0).toLocaleString('ar-EG')} ج.م
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f172a' }}>
                          {net.toLocaleString('ar-EG')} ج.م
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {isPaid ? (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11.5px',
                                fontWeight: 'bold'
                              }}
                            >
                              مدفوعة بالكامل
                            </span>
                          ) : (
                            <div>
                              <div style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                                متبقي: {remaining.toLocaleString('ar-EG')} ج.م
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                مدفوع: {paid.toLocaleString('ar-EG')} ج.م
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {inv.drive_file_url ? (
                            <a
                              href={inv.drive_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#0284c7',
                                textDecoration: 'none',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}
                              title="فتح الملف المؤرشف على Google Drive"
                            >
                              <FolderArchive size={14} />
                              <span>Google Drive</span>
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>غير مرفق</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleOpenEditInvoice(inv)}
                              title="تعديل بيانات الفاتورة والبنود"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px', color: '#0284c7' }}
                            >
                              <Edit size={14} />
                              <span>تعديل</span>
                            </button>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => handleViewInvoiceDetails(inv)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px' }}
                            >
                              <Eye size={14} />
                              <span>عرض</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الثالث: مسحوبات الفروع الشهرية
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'withdrawals' && (
        <div className="suppliers-withdrawals-section">
          {/* شريط اختيار الشهر والتصدير */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#475569' }}>شهر المحاسبة:</span>
              <input
                type="month"
                className="outstock-form-input"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ width: '160px' }}
              />
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setSelectedMonth(new Date().toISOString().slice(0, 7))}
                style={{ fontSize: '12px' }}
              >
                هذا الشهر
              </button>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={loadBranchWithdrawals}
                title="تحديث البيانات"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={handleExportBranchWithdrawals}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d' }}
              >
                <FileSpreadsheet size={16} />
                <span>تصدير إلى Excel</span>
              </button>

              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={() => setIsExtraWithdrawalModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>تسجيل مسحوب فرع إضافي</span>
              </button>
            </div>
          </div>

          {/* جدول ملخص مسحوبات الفروع */}
          {isLoadingBranchWithdrawals ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
              <div>جاري جلب تقارير مسحوبات الفروع...</div>
            </div>
          ) : branchWithdrawalsData.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <Building2 size={36} style={{ color: '#94a3b8', marginBottom: '10px' }} />
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#475569' }}>
                لا توجد مسحوبات مسجلة لهذا الشهر ({selectedMonth})
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                يتم احتساب مسحوبات الفروع تلقائياً عند شحن طلبات الفروع من المشتريات أو عبر تسجيل مسحوبات إضافية
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 14px' }}>الفرع / الصيدلية</th>
                    <th style={{ padding: '12px 14px' }}>عدد الأصناف المستلمة</th>
                    <th style={{ padding: '12px 14px' }}>إجمالي الكميات المسحوبة</th>
                    <th style={{ padding: '12px 14px' }}>إجمالي قيمة المسحوبات (ج.م)</th>
                    <th style={{ padding: '12px 14px' }}>نسبة مسحوبات الفرع</th>
                    <th style={{ padding: '12px 14px' }}>آخر عملية توريد</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>سجل المسحوبات</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalNetworkCost = branchWithdrawalsData.reduce(
                      (acc, b) => acc + Number(b.total_amount || b.total_cost || b.totalAmount || 0),
                      0
                    );
                    return branchWithdrawalsData.map((b, idx) => {
                      const cost = Number(b.total_amount || b.total_cost || b.totalAmount || 0);
                      const percent = totalNetworkCost > 0 ? ((cost / totalNetworkCost) * 100).toFixed(1) : 0;
                      return (
                        <tr
                          key={b.branch_id || idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 1 ? '#fafafa' : '#fff'
                          }}
                        >
                          <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f172a' }}>
                            {b.branch_name || b.name || `فرع ${b.branch_id}`}
                          </td>
                          <td style={{ padding: '12px 14px' }}>{b.items_count || b.itemsCount || b.distinctItems || 0} صنف</td>
                          <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>
                            {b.total_quantity || b.items_count || b.itemsCount || 0} وحدة
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f766e' }}>
                            {cost.toLocaleString('ar-EG')} ج.م
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '60px',
                                  height: '5px',
                                  background: '#e2e8f0',
                                  borderRadius: '3px',
                                  overflow: 'hidden'
                                }}
                              >
                                <div
                                  style={{
                                    width: `${percent}%`,
                                    height: '100%',
                                    background: '#0d9488'
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{percent}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748b' }}>
                            {b.last_withdrawal_date
                              ? new Date(b.last_withdrawal_date).toLocaleDateString('ar-EG')
                              : '-'}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBranchForHistory(b);
                                setIsBranchHistoryModalOpen(true);
                              }}
                              className="outstock-btn"
                              style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px'
                              }}
                              title="عرض سجل مسحوبات هذا الفرع"
                            >
                              <FileText size={14} />
                              <span>سجل المسحوبات</span>
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الرابع: مقارنة خصومات الموردين وبوابة i'SUPPLY
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'discounts_comparison' && (
        <SupplierDiscountsComparisonTab showToast={showToast} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الخامس: بوابة التكامل والمزامنة الحية مع برنامج فارما فلاي
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'pharmafly_sync' && (
        <PharmaFlyIntegrationTab currentUser={currentUser} showToast={showToastRef.current || showToast} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة إضافة / تعديل مورد
      ══════════════════════════════════════════════════════════════════════════ */}
      {isSupplierModalOpen && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '520px', width: '92%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                {editingSupplier ? 'تعديل بيانات المورد' : 'تسجيل مورد جديد'}
              </h3>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={() => setIsSupplierModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="outstock-form-label">كود المورد</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={supplierFormData.code}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, code: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="outstock-form-label">اسم المورد / الشركة</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={supplierFormData.name}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="outstock-form-label">رقم الهاتف</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={supplierFormData.phone}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="outstock-form-label">المندوب / جهة الاتصال</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={supplierFormData.contact_person}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, contact_person: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: supplierFormData.payment_type === 'cash' ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="outstock-form-label">نوع الحساب</label>
                  <select
                    className="outstock-form-select"
                    value={supplierFormData.payment_type}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSupplierFormData({
                        ...supplierFormData,
                        payment_type: val,
                        credit_term_days: val === 'cash' ? '0' : (supplierFormData.credit_term_days || '30'),
                        credit_limit: val === 'cash' ? '0' : supplierFormData.credit_limit
                      });
                    }}
                  >
                    <option value="credit">أجل (ائتمان)</option>
                    <option value="cash">نقدي (كاش)</option>
                  </select>
                </div>
                {supplierFormData.payment_type !== 'cash' && (
                  <div>
                    <label className="outstock-form-label">حد الائتمان (ج.م)</label>
                    <input
                      type="number"
                      min="0"
                      className="outstock-form-input"
                      value={supplierFormData.credit_limit}
                      onChange={(e) => setSupplierFormData({ ...supplierFormData, credit_limit: e.target.value })}
                      placeholder="0 = بدون حد"
                    />
                  </div>
                )}
              </div>

              {supplierFormData.payment_type !== 'cash' && (
                <div style={{ marginBottom: '14px' }}>
                  <label className="outstock-form-label">فترة السداد بالأيام (فترة السماح)</label>
                  <input
                    type="number"
                    min="1"
                    className="outstock-form-input"
                    value={supplierFormData.credit_term_days}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, credit_term_days: e.target.value })}
                    placeholder="30"
                  />
                </div>
              )}

              <div style={{ marginBottom: '18px' }}>
                <label className="outstock-form-label">ملاحظات إضافية</label>
                <textarea
                  className="outstock-form-input"
                  rows={2}
                  value={supplierFormData.notes}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setIsSupplierModalOpen(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="outstock-btn outstock-btn-primary">
                  حفظ المورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة تسوية مطالبة مالية / سداد دفعة
      ══════════════════════════════════════════════════════════════════════════ */}
      {isSettlementModalOpen && settlementSupplier && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '480px', width: '92%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16.5px', color: '#0f172a' }}>
                تسوية مطالبة مالية: {settlementSupplier.name}
              </h3>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={() => setIsSettlementModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                background: '#f8fafc',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                marginBottom: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>الرصيد المستحق حالياً:</span>
                <span style={{ fontWeight: 'bold', color: '#b91c1c' }}>
                  {Number(settlementSupplier.current_balance || 0).toLocaleString('ar-EG')} ج.م
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveSettlement}>
              <div style={{ marginBottom: '14px' }}>
                <label className="outstock-form-label">مبلغ السداد (ج.م)</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  className="outstock-form-input"
                  value={settlementData.amount}
                  onChange={(e) => setSettlementData({ ...settlementData, amount: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="outstock-form-label">طريقة الدفع</label>
                  <select
                    className="outstock-form-select"
                    value={settlementData.payment_method}
                    onChange={(e) => setSettlementData({ ...settlementData, payment_method: e.target.value })}
                  >
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="cash">نقدي (كاش الخزينة)</option>
                    <option value="cheque">شيك بنكي</option>
                    <option value="vodafone_cash">فودافون كاش / إنستاباي</option>
                  </select>
                </div>
                <div>
                  <label className="outstock-form-label">تاريخ السداد</label>
                  <input
                    type="date"
                    className="outstock-form-input"
                    value={settlementData.payment_date}
                    onChange={(e) => setSettlementData({ ...settlementData, payment_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="outstock-form-label">رقم الإيصال / مرجع التحويل أو الشيك</label>
                <input
                  type="text"
                  className="outstock-form-input"
                  placeholder="مثال: TXN-998822"
                  value={settlementData.reference_number}
                  onChange={(e) => setSettlementData({ ...settlementData, reference_number: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="outstock-form-label">ملاحظات السداد</label>
                <textarea
                  className="outstock-form-input"
                  rows={2}
                  value={settlementData.notes}
                  onChange={(e) => setSettlementData({ ...settlementData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setIsSettlementModalOpen(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="outstock-btn outstock-btn-primary"
                  disabled={isSubmittingSettlement}
                >
                  {isSubmittingSettlement ? 'جاري السداد...' : 'تأكيد تسجيل السداد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة كشف مسحوبات المورد مع تصدير Excel
      ══════════════════════════════════════════════════════════════════════════ */}
      {isWithdrawalModalOpen && selectedSupplierForWithdrawals && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '880px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '14px'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16.5px', color: '#0f172a' }}>
                  كشف مسحوبات المورد: {selectedSupplierForWithdrawals.name}
                </h3>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                  كود: {selectedSupplierForWithdrawals.code} | حد الائتمان: {selectedSupplierForWithdrawals.credit_limit || 0} ج.م
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-primary"
                  onClick={handleOpenManualFromWithdrawals}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                >
                  <Plus size={15} />
                  <span>إضافة مسحوب يدوي</span>
                </button>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={handleExportSupplierWithdrawals}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d' }}
                >
                  <FileSpreadsheet size={15} />
                  <span>تصدير Excel</span>
                </button>
                <button
                  type="button"
                  className="outstock-btn-close"
                  onClick={() => setIsWithdrawalModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* شريط البحث في المسحوبات */}
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                className="outstock-form-input"
                placeholder="بحث باسم الصنف أو رقم الفاتورة..."
                value={withdrawalSearch}
                onChange={(e) => setWithdrawalSearch(e.target.value)}
              />
            </div>

            {/* الجدول */}
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              {isLoadingWithdrawals ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <RefreshCw className="outstock-spin" size={20} style={{ marginBottom: '6px' }} />
                  <div>جاري جلب المسحوبات...</div>
                </div>
              ) : filteredSupplierWithdrawals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  لا توجد مسحوبات مسجلة لهذا المورد
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '8px 10px' }}>رقم الفاتورة</th>
                      <th style={{ padding: '8px 10px' }}>التاريخ</th>
                      <th style={{ padding: '8px 10px' }}>اسم الصنف</th>
                      <th style={{ padding: '8px 10px' }}>الكمية</th>
                      <th style={{ padding: '8px 10px' }}>سعر الجمهور</th>
                      <th style={{ padding: '8px 10px' }}>الخصم</th>
                      <th style={{ padding: '8px 10px' }}>سعر الشراء</th>
                      <th style={{ padding: '8px 10px' }}>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSupplierWithdrawals.map((w, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{w.invoice_number || '-'}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>
                          {w.invoice_date ? new Date(w.invoice_date).toLocaleDateString('ar-EG') : '-'}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{w.medication_name}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{w.quantity}</td>
                        <td style={{ padding: '8px 10px' }}>{w.public_price || 0} ج.م</td>
                        <td style={{ padding: '8px 10px', color: '#d97706' }}>{w.discount_percent || 0}%</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{w.buy_price || 0} ج.م</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#0f766e' }}>
                          {(Number(w.quantity || 0) * Number(w.buy_price || 0)).toFixed(2)} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة إضافة مسحوب يدوي للمورد (تصميم تنفيذي متعدد الفواتير والأصناف والـ PDF) ── */}
      {isManualWithdrawalModalOpen && selectedSupplierForWithdrawals && (
        <div className="outstock-modal-overlay" style={{ zIndex: 1100 }}>
          <div
            className="outstock-modal-card"
            style={{
              maxWidth: '720px',
              width: '95%',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)'
            }}
          >
            {/* رأس النافذة */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1.5px solid #e2e8f0',
                paddingBottom: '14px',
                marginBottom: '18px'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={20} color="#0284c7" />
                  <span>تسجيل مسحوبات وفواتير يدوية للمورد</span>
                </h3>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                  المورد: <strong style={{ color: '#0f172a' }}>{selectedSupplierForWithdrawals.name}</strong> (كود: <span style={{ fontFamily: 'monospace' }}>{selectedSupplierForWithdrawals.code}</span>) | الرصيد الحالي: <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{parseFloat(selectedSupplierForWithdrawals.current_balance || 0).toFixed(2)} ج.م</span>
                </div>
              </div>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={handleCloseManualWithdrawal}
                style={{ padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveManualSupplierWithdrawal}>
              {/* القسم الأول: عدد الأصناف المسحوبة */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <label className="outstock-form-label" style={{ fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Layers size={16} color="#0284c7" />
                  <span>إجمالي عدد الأصناف المسحوبة (Item Count) *</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min="1"
                    required
                    className="outstock-form-input"
                    value={manualWithdrawalForm.item_count}
                    onChange={(e) => setManualWithdrawalForm((prev) => ({ ...prev, item_count: e.target.value }))}
                    placeholder="مثال: 12 صنف"
                    style={{ maxWidth: '220px', fontWeight: '900', fontSize: '15px', color: '#0f172a', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                    عدد الأصناف الدوائية المندرجة في هذه المسحوبات
                  </span>
                </div>
              </div>

              {/* القسم الثاني: جدول الفواتير المتعددة */}
              <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label className="outstock-form-label" style={{ fontWeight: '900', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={16} color="#0d9488" />
                    <span>فواتير ومستندات السحب ({manualWithdrawalForm.invoices.length})</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setIsSelectInvoicesModalOpen(true)}
                      className="outstock-btn"
                      style={{
                        background: '#ecfdf5',
                        color: '#047857',
                        border: '1px solid #6ee7b7',
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: '800',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer'
                      }}
                      title="استيراد وتحديد فواتير توريد مسجلة لهذا المورد لإدراجها تلقائياً"
                    >
                      <CheckSquare size={14} />
                      <span>تحديد فواتير مسجلة</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAddManualInvoiceRow}
                      className="outstock-btn"
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        border: '1px solid #7dd3fc',
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: '800',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={14} />
                      <span>إضافة فاتورة أخرى</span>
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 10px', width: '35%' }}>رقم الفاتورة / الإذن</th>
                        <th style={{ padding: '8px 10px', width: '30%' }}>تاريخ الفاتورة</th>
                        <th style={{ padding: '8px 10px', width: '25%' }}>قيمة الفاتورة (ج.م) *</th>
                        <th style={{ padding: '8px 10px', width: '10%', textAlign: 'center' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualWithdrawalForm.invoices.map((invRow, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              type="text"
                              required
                              placeholder={`رقم الفاتورة #${idx + 1}`}
                              className="outstock-form-input"
                              value={invRow.invoice_number}
                              onChange={(e) => handleManualInvoiceRowChange(idx, 'invoice_number', e.target.value)}
                              style={{ padding: '6px 10px', fontSize: '12.5px', fontWeight: '700' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              type="date"
                              required
                              className="outstock-form-input"
                              value={invRow.invoice_date}
                              onChange={(e) => handleManualInvoiceRowChange(idx, 'invoice_date', e.target.value)}
                              style={{ padding: '6px 8px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              type="number"
                              step="any"
                              min="0.01"
                              required
                              placeholder="0.00"
                              className="outstock-form-input"
                              value={invRow.amount}
                              onChange={(e) => handleManualInvoiceRowChange(idx, 'amount', e.target.value)}
                              style={{ padding: '6px 10px', fontSize: '13px', fontWeight: '900', color: '#0f766e', textAlign: 'center' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveManualInvoiceRow(idx)}
                              disabled={manualWithdrawalForm.invoices.length <= 1}
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                borderRadius: '6px',
                                padding: '5px',
                                cursor: manualWithdrawalForm.invoices.length <= 1 ? 'not-allowed' : 'pointer',
                                opacity: manualWithdrawalForm.invoices.length <= 1 ? 0.35 : 1
                              }}
                              title="حذف هذا الصف"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* بطاقة الإجمالي التلقائي */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#166534' }}>
                    المجموع الكلي لقيمة الفواتير المسحوبة:
                  </span>
                  <strong style={{ fontSize: '16px', color: '#15803d', fontFamily: 'monospace' }}>
                    {manualWithdrawalTotalAmount.toFixed(2)} ج.م
                  </strong>
                </div>
              </div>

              {/* القسم الثالث: إرفاق ملف الفاتورة PDF */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <label className="outstock-form-label" style={{ fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <FileUp size={16} color="#0284c7" />
                  <span>إرفاق ملف الفاتورة / السند الممسوح ضوئياً (PDF)</span>
                </label>

                {manualWithdrawalForm.pdf_file_name ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', border: '1.5px solid #0284c7', borderRadius: '10px', padding: '8px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={18} color="#0284c7" />
                      <div>
                        <strong style={{ fontSize: '12.5px', color: '#0f172a' }}>{manualWithdrawalForm.pdf_file_name}</strong>
                        <div style={{ fontSize: '11px', color: '#059669' }}>تم إرفاق الملف بنجاح ✅</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handlePreviewPdf}
                        className="outstock-btn"
                        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                      >
                        <Eye size={13} style={{ marginLeft: '4px' }} />
                        <span>معاينة</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePdfFile}
                        className="outstock-btn"
                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                      >
                        <Trash2 size={13} style={{ marginLeft: '4px' }} />
                        <span>إزالة</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      id="manual-withdrawal-pdf-input"
                      accept="application/pdf,.pdf"
                      onChange={handlePdfFileChange}
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="manual-withdrawal-pdf-input"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '16px',
                        border: '2px dashed #cbd5e1',
                        borderRadius: '10px',
                        background: '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <FileUp size={22} color="#64748b" />
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#0284c7' }}>اضغط لاختيار ملف PDF للفاتورة</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>يدعم ملفات PDF الممسوحة ضوئياً حتى 15 ميجابايت</span>
                    </label>
                  </div>
                )}
              </div>

              {/* القسم الرابع: الملاحظات */}
              <div style={{ marginBottom: '16px' }}>
                <label className="outstock-form-label" style={{ fontWeight: '700', color: '#334155' }}>
                  ملاحظات إضافية حول التوريد / المسحوب
                </label>
                <textarea
                  className="outstock-form-input"
                  rows={2}
                  value={manualWithdrawalForm.notes}
                  onChange={(e) => setManualWithdrawalForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="ملاحظات المشتريات، اسم المندوب المسلم، رقم أذن المخزن، إلخ..."
                />
              </div>

              {/* أزرار الإجراءات */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={handleCloseManualWithdrawal}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="outstock-btn outstock-btn-primary"
                  disabled={isSubmittingManualWithdrawal || manualWithdrawalTotalAmount <= 0}
                  style={{
                    padding: '8px 20px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    fontWeight: '800',
                    fontSize: '13px'
                  }}
                >
                  {isSubmittingManualWithdrawal ? 'جاري الحفظ...' : `حفظ المسحوبات (${manualWithdrawalTotalAmount.toFixed(2)} ج.م)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة تسجيل فاتورة توريد جديدة مع 3 طرق إدخال و Drive
      ══════════════════════════════════════════════════════════════════════════ */}
      {isInvoiceModalOpen && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '1420px', width: '97%', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '14px'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                  {editingInvoiceId ? 'تعديل فاتورة توريد ومطابقة البنود' : 'تسجيل فاتورة توريد جديدة ومطابقة البنود'}
                </h3>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                  {editingInvoiceId ? 'تعديل الفاتورة وإعادة احتساب الأرصدة والمطابقة' : 'أرشفة تلقائية على Google Drive في مجلد [Code] Name'}
                </span>
              </div>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={handleCloseInvoiceModal}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
              {/* شارة توثيق الموظف المسؤول عن إدخال الفاتورة */}
              {verifiedInvoiceEmployee && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    padding: '9px 14px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '13px', fontWeight: 'bold' }}>
                    <UserCheck size={18} color="#16a34a" />
                    <span>الموظف الموثّق لتسجيل الفاتورة:</span>
                    <span style={{ color: '#0f172a' }}>{verifiedInvoiceEmployee.name}</span>
                  </div>
                  <div
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: '800',
                      letterSpacing: '2px',
                      fontFamily: 'monospace'
                    }}
                  >
                    كود: ••••
                  </div>
                </div>
              )}

              {/* بيانات الفاتورة الأساسية */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="outstock-form-label">المورد</label>
                  <select
                    className="outstock-form-select"
                    value={invoiceForm.supplier_id}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, supplier_id: e.target.value })}
                    required
                  >
                    <option value="">اختر المورد...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="outstock-form-label">رقم الفاتورة</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={invoiceForm.invoice_number}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="outstock-form-label">تاريخ الفاتورة</label>
                  <input
                    type="date"
                    className="outstock-form-input"
                    value={invoiceForm.invoice_date}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="outstock-form-label">طريقة السداد</label>
                  <select
                    className="outstock-form-select"
                    value={invoiceForm.payment_terms}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_terms: e.target.value })}
                  >
                    <option value="credit">أجل (ائتمان)</option>
                    <option value="cash">نقدي (كاش فوري)</option>
                  </select>
                </div>
              </div>

              {/* قسم مطابقة الأمان مع أذون الاستلام الموثقة لنفس المورد اليوم */}
              {sameDayReceipts.length > 0 && (
                <div
                  style={{
                    background: '#eff6ff',
                    border: '1.5px solid #bfdbfe',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    marginBottom: '14px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <PackageCheck size={18} color="#2563eb" />
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e40af' }}>
                        أذون الاستلام الموثقة لهذا المورد بتاريخ اليوم ({sameDayReceipts.length}):
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <select
                        className="outstock-form-select"
                        value={selectedReceiptForMatching?.id || ''}
                        onChange={(e) => handleSelectMatchingReceipt(e.target.value)}
                        style={{ width: '220px', height: '34px', fontSize: '12px' }}
                      >
                        <option value="">-- اختر إذن استلام للمطابقة --</option>
                        {sameDayReceipts.map((r) => (
                          <option key={r.id} value={r.id}>
                            إذن: {r.invoice_number} ({r.total_quantity} وحدة)
                          </option>
                        ))}
                      </select>

                      {selectedReceiptForMatching && (
                        <button
                          type="button"
                          onClick={handleApplyReceiptItemsToInvoice}
                          className="outstock-btn"
                          style={{
                            background: '#2563eb',
                            color: '#ffffff',
                            padding: '6px 12px',
                            fontSize: '11.5px',
                            fontWeight: '800',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={13} />
                          <span>تحميل أصناف الإذن للفاتورة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* تنبيهات مطابقة الأمان عند وجود فوارق أو أصناف غير متطابقة */}
                  {selectedReceiptForMatching && matchingDiscrepancies.length > 0 && (
                    <div style={{ marginTop: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontWeight: '800', fontSize: '12px', marginBottom: '6px' }}>
                        <AlertCircle size={15} />
                        <span>⚠️ تنبيه مطابقة الأمان: تم رصد {matchingDiscrepancies.length} حالة عدم تطابق بين الفاتورة وإذن الاستلام:</span>
                      </div>
                      <ul style={{ margin: 0, paddingRight: '20px', fontSize: '11.5px', color: '#dc2626' }}>
                        {matchingDiscrepancies.map((disc, dIdx) => (
                          <li key={dIdx} style={{ marginBottom: '2px' }}>
                            {disc.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedReceiptForMatching && matchingDiscrepancies.length === 0 && (
                    <div style={{ marginTop: '8px', color: '#16a34a', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={15} />
                      <span>جميع بنود وكميات الفاتورة متطابقة تماماً 100% مع إذن استلام الشحنة ✅</span>
                    </div>
                  )}
                </div>
              )}

              {/* شريط الإدخال والذكاء الاصطناعي ورفع المستند */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '14px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
                    مستند الفاتورة وطرق إدراج البنود:
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <label
                      className="outstock-btn outstock-btn-secondary"
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                    >
                      <Upload size={14} />
                      <span>{attachedFile ? attachedFile.name : 'رفع صورة أو PDF الفاتورة'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                      />
                    </label>

                    <button
                      type="button"
                      className="outstock-btn outstock-btn-secondary"
                      onClick={handleAIExtractInvoice}
                      disabled={isExtractingAI || !attachedFileBase64}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#7c3aed' }}
                      title="استخراج وقراءة البنود ذكياً باستخدام Vision AI"
                    >
                      <Sparkles size={14} className={isExtractingAI ? 'outstock-spin' : ''} />
                      <span>{isExtractingAI ? 'جاري الاستخراج بالذكاء الاصطناعي...' : 'استخراج ذكي بالذكاء الاصطناعي ✨'}</span>
                    </button>

                    <label
                      className="outstock-btn outstock-btn-secondary"
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#15803d' }}
                    >
                      <FileSpreadsheet size={14} />
                      <span>{isParsingExcel ? 'جاري القراءة...' : 'استيراد من شيت Excel'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportExcelInvoice}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>

                {/* مجلد Google Drive المستهدف */}
                {invoiceForm.supplier_id && (
                  <div style={{ fontSize: '11px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <FolderArchive size={13} />
                    <span>
                      سيتم حفظ وأرشفة المستند تلقائياً في مجلد:{' '}
                      <strong>
                        فواتير_الموردين/[
                        {suppliers.find((s) => String(s.id) === String(invoiceForm.supplier_id))?.code || 'SUP'}]{' '}
                        {suppliers.find((s) => String(s.id) === String(invoiceForm.supplier_id))?.name}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              {/* تنبيهات ذكية للفاتورة: زيادة الأسعار والصلاحيات الوشيكة */}
              {(() => {
                const priceIncreasedItems = (invoiceForm.items || []).filter(
                  (it) => it.catalog_price && Number(it.public_price) > Number(it.catalog_price)
                );
                const criticalExpiryItems = (invoiceForm.items || []).filter((it) => {
                  const exp = getExpiryAnalysis(it.expiry_date);
                  return exp.status === 'critical' || exp.status === 'expired';
                });

                return (
                  <>
                    {priceIncreasedItems.length > 0 && (
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                          border: '1px solid #a7f3d0',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          marginBottom: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color: '#065f46'
                        }}
                      >
                        <Sparkles size={16} style={{ color: '#059669', flexShrink: 0 }} />
                        <span>
                          <strong>✨ رصد تحديث أسعار رسمي:</strong> تم رصد{' '}
                          <strong>{priceIncreasedItems.length}</strong> أصناف بسعر بيع أعلى من المسجل بالكتالوج. سيتم تعميم الأسعار وتحديثها بقاعدة البيانات تلقائياً فور الحفظ.
                        </span>
                      </div>
                    )}

                    {criticalExpiryItems.length > 0 && (
                      <div
                        style={{
                          background: '#fff1f2',
                          border: '1px solid #fecdd3',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          marginBottom: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color: '#9f1239'
                        }}
                      >
                        <AlertCircle size={16} style={{ color: '#e11d48', flexShrink: 0 }} />
                        <span>
                          <strong>⚠️ تنبيه رقابي للصلاحيات:</strong> تتضمن الفاتورة{' '}
                          <strong>{criticalExpiryItems.length}</strong> أصناف ذات صلاحية وشيكة (أقل من 6 أشهر) أو منتهية، يرجى مراجعتها وتوثيقها.
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* صف إدخال صنف يدوي سريع مع الصلاحية والتشغيلة وتحديث السعر */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(280px, 3.2fr) 75px 115px 85px 110px 135px 120px 120px 48px',
                  gap: '10px',
                  alignItems: 'end',
                  marginBottom: '12px',
                  background: '#fafafa',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>اسم الصنف / الدواء</label>
                  <MedicationAutocompleteInput
                    inputRef={medicationInputRef}
                    required={false}
                    value={manualItem.medication_name}
                    onChange={(val) => setManualItem((prev) => ({ ...prev, medication_name: val }))}
                    onTextChange={(val) => setManualItem((prev) => ({ ...prev, medication_name: val }))}
                    onMedicationSelect={(displayName, med) => {
                      const pub = Number(med.price || med.public_price || 0);
                      const disc = Number(manualItem.discount_percent || 0);
                      const buy = pub > 0 && disc > 0 ? parseFloat((pub * (1 - disc / 100)).toFixed(2)) : (pub || manualItem.buy_price);
                      setManualItem((prev) => ({
                        ...prev,
                        medication_name: displayName || med.name || med.arabic_name,
                        public_price: pub || '',
                        buy_price: buy || '',
                        barcode: med.barcode || med.gtin_barcode || '',
                        pack_size: Number(med.pack_size) || 1,
                        catalog_price: pub || null
                      }));
                    }}
                    onSelect={(med, displayName) => {
                      const pub = Number(med.price || med.public_price || 0);
                      const disc = Number(manualItem.discount_percent || 0);
                      const buy = pub > 0 && disc > 0 ? parseFloat((pub * (1 - disc / 100)).toFixed(2)) : (pub || manualItem.buy_price);
                      setManualItem((prev) => ({
                        ...prev,
                        medication_name: displayName || med.name || med.arabic_name,
                        public_price: pub || '',
                        buy_price: buy || '',
                        barcode: med.barcode || med.gtin_barcode || '',
                        pack_size: Number(med.pack_size) || 1,
                        catalog_price: pub || null
                      }));
                    }}
                    placeholder="ابحث في دليل الأدوية..."
                  />
                </div>
                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>الكمية</label>
                  <input
                    ref={quantityInputRef}
                    type="number"
                    min="1"
                    className="outstock-form-input"
                    value={manualItem.quantity}
                    onChange={(e) => setManualItem({ ...manualItem, quantity: e.target.value })}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="outstock-form-label" style={{ fontSize: '11px', margin: 0 }}>سعر الجمهور</label>
                    {manualItem.catalog_price && Number(manualItem.public_price) > Number(manualItem.catalog_price) && (
                      <span style={{ fontSize: '9.5px', color: '#15803d', fontWeight: 'bold' }}>
                        🚀 زيادة
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="outstock-form-input"
                    placeholder="0.00"
                    value={manualItem.public_price}
                    onChange={(e) => {
                      const pub = Number(e.target.value) || 0;
                      const disc = Number(manualItem.discount_percent) || 0;
                      const buy = pub > 0 && disc > 0 ? parseFloat((pub * (1 - disc / 100)).toFixed(2)) : manualItem.buy_price;
                      setManualItem((prev) => ({ ...prev, public_price: e.target.value, buy_price: buy }));
                    }}
                  />
                </div>
                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>خصم %</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="outstock-form-input"
                    placeholder="0%"
                    value={manualItem.discount_percent}
                    onChange={(e) => {
                      const disc = Number(e.target.value) || 0;
                      const pub = Number(manualItem.public_price) || 0;
                      const buy = pub > 0 ? parseFloat((pub * (1 - disc / 100)).toFixed(2)) : manualItem.buy_price;
                      setManualItem((prev) => ({ ...prev, discount_percent: e.target.value, buy_price: buy }));
                    }}
                  />
                </div>
                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>سعر الشراء</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="outstock-form-input"
                    placeholder="صافي"
                    value={manualItem.buy_price}
                    onChange={(e) => setManualItem({ ...manualItem, buy_price: e.target.value })}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="outstock-form-label" style={{ fontSize: '11px', margin: 0 }}>الصلاحية</label>
                    {manualItem.expiry_date && (
                      <span style={{ fontSize: '9.5px', color: getExpiryAnalysis(manualItem.expiry_date).color, fontWeight: 'bold' }}>
                        {parseExpiryDate(manualItem.expiry_date)?.formatted || ''}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="MM/YY مثلاً 08/27"
                    value={manualItem.expiry_date}
                    onChange={(e) => setManualItem({ ...manualItem, expiry_date: e.target.value })}
                    title="تاريخ انتهاء الصلاحية (مثلاً: 08/27 أو 2027-08)"
                  />
                </div>
                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>رقم التشغيلة</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="اختياري"
                    value={manualItem.batch_number}
                    onChange={(e) => setManualItem({ ...manualItem, batch_number: e.target.value })}
                    title="رقم التشغيلة أو اللوت"
                  />
                </div>
                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>الباركود (Enter 🔍)</label>
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    className="outstock-form-input"
                    placeholder="امسح الباركود..."
                    value={manualItem.barcode}
                    onChange={(e) => setManualItem({ ...manualItem, barcode: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBarcodeLookup(manualItem.barcode);
                      }
                    }}
                    title="امسح أو اكتب الباركود واضغط Enter للبحث المباشر"
                  />
                </div>
                {editingInvoiceItemIndex !== null ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="outstock-btn outstock-btn-primary"
                      onClick={handleAddManualItem}
                      style={{ height: '38px', width: '38px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#059669', borderColor: '#059669' }}
                      title="حفظ تعديل الصنف (Enter)"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      type="button"
                      className="outstock-btn outstock-btn-secondary"
                      onClick={handleCancelEditInvoiceItem}
                      style={{ height: '38px', width: '38px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}
                      title="إلغاء التعديل"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-primary"
                    onClick={handleAddManualItem}
                    style={{ height: '38px', width: '48px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="إضافة الصنف للفاتورة"
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>

              {/* جدول بنود الفاتورة المدخلة الاحترافي */}
              <div style={{ flex: 1, minHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '14px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '9px 10px', width: '40px', textAlign: 'center' }}>م</th>
                      <th style={{ padding: '9px 10px' }}>اسم الصنف</th>
                      <th style={{ padding: '9px 10px', textAlign: 'center', width: '75px' }}>الكمية</th>
                      <th style={{ padding: '9px 10px', width: '120px' }}>سعر الجمهور</th>
                      <th style={{ padding: '9px 10px', width: '85px' }}>نسبة الخصم</th>
                      <th style={{ padding: '9px 10px', width: '110px' }}>سعر الشراء</th>
                      <th style={{ padding: '9px 10px', textAlign: 'center', width: '135px' }}>تاريخ الصلاحية</th>
                      <th style={{ padding: '9px 10px', textAlign: 'center', width: '120px' }}>رقم التشغيلة</th>
                      <th style={{ padding: '9px 10px', width: '115px' }}>الإجمالي</th>
                      <th style={{ padding: '9px 10px', textAlign: 'center', width: '75px' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceForm.items.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                          لم يتم إضافة أي أصناف حتى الآن. يمكنك الإضافة يدوياً مع الصلاحية والتشغيلة، أو الاستيراد من إكسل، أو الاستخراج بالذكاء الاصطناعي.
                        </td>
                      </tr>
                    ) : (
                      invoiceForm.items.map((item, idx) => (
                        <tr
                          key={item.id || idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: editingInvoiceItemIndex === idx ? '#fef9c3' : 'transparent',
                            transition: 'background 0.2s ease'
                          }}
                        >
                          <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{idx + 1}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>
                            <div>{item.medication_name}</div>
                            {item.barcode && (
                              <span style={{ fontSize: '10px', color: '#64748b', display: 'block', fontWeight: 'normal' }}>
                                🏷️ {item.barcode}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ fontWeight: '600' }}>{item.public_price || 0} ج.م</div>
                            {item.catalog_price && Number(item.public_price) > Number(item.catalog_price) && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '9.5px',
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontWeight: 'bold',
                                  border: '1px solid #86efac'
                                }}
                                title={`سعر رسمي أعلى (السابق: ${item.catalog_price} ج.م)`}
                              >
                                🚀 زيادة +{(Number(item.public_price) - Number(item.catalog_price)).toFixed(1)} ج.م
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', color: '#d97706' }}>{item.discount_percent || 0}%</td>
                          <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{item.buy_price || 0} ج.م</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {(() => {
                              const exp = getExpiryAnalysis(item.expiry_date);
                              if (!item.expiry_date || exp.status === 'empty') {
                                return <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>;
                              }
                              return (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    background: exp.bg,
                                    color: exp.color,
                                    border: `1px solid ${exp.border}`
                                  }}
                                  title={`حالة الصلاحية: ${exp.label}`}
                                >
                                  {exp.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {item.batch_number ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  background: '#f8fafc',
                                  color: '#334155',
                                  border: '1px solid #cbd5e1',
                                  fontFamily: 'monospace',
                                  fontWeight: '600'
                                }}
                                title={`رقم التشغيلة: ${item.batch_number}`}
                              >
                                #{item.batch_number}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#0f766e' }}>
                            {Number(item.total_price || 0).toFixed(2)} ج.م
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <button
                                type="button"
                                onClick={() => handleStartEditInvoiceItem(item, idx)}
                                style={{
                                  border: 'none',
                                  background: editingInvoiceItemIndex === idx ? '#0284c7' : '#f0f9ff',
                                  color: editingInvoiceItemIndex === idx ? '#ffffff' : '#0284c7',
                                  padding: '4px 6px',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title="تعديل هذا الصنف"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveInvoiceItem(item.id)}
                                style={{
                                  border: 'none',
                                  background: '#fef2f2',
                                  color: '#ef4444',
                                  padding: '4px 6px',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title="حذف هذا الصنف من الفاتورة"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* ملخص الحسابات وسداد الفاتورة */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '10px',
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '16px'
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>إجمالي الأصناف ({invoiceTotals.itemCount})</div>
                  <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                    {invoiceTotals.subtotal.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>

                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>خصم إضافي (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    className="outstock-form-input"
                    value={invoiceForm.discount_amount}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, discount_amount: e.target.value })}
                  />
                </div>

                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>الصافي النهائي</label>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f766e' }}>
                    {invoiceTotals.net.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>

                <div>
                  <label className="outstock-form-label" style={{ fontSize: '11px' }}>المدفوع حالياً (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    className="outstock-form-input"
                    value={invoiceForm.paid_amount}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, paid_amount: e.target.value })}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>المتبقي (أجل)</div>
                  <div style={{ fontSize: '15px', fontWeight: 'bold', color: invoiceTotals.remaining > 0 ? '#b91c1c' : '#15803d' }}>
                    {invoiceTotals.remaining.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>
              </div>

              {/* أزرار الإجراءات */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleSaveInvoiceDraft}
                  className="outstock-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#fef3c7',
                    border: '1px solid #fde047',
                    color: '#854d0e',
                    fontWeight: '800',
                    fontSize: '12px'
                  }}
                  title="حفظ مسودة مؤقتة على المتصفح للعودة إليها لاحقاً"
                >
                  <FolderArchive size={14} />
                  <span>حفظ مسودة مؤقتة</span>
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    onClick={handleCloseInvoiceModal}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="outstock-btn outstock-btn-primary"
                    disabled={isSavingInvoice || isUploadingToDrive}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {(isSavingInvoice || isUploadingToDrive) && <RefreshCw size={14} className="outstock-spin" />}
                    <span>{editingInvoiceId ? 'حفظ تعديل الفاتورة' : isUploadingToDrive ? 'جاري الأرشفة على Drive...' : isSavingInvoice ? 'جاري الحفظ...' : 'حفظ وأرشفة الفاتورة'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة معاينة ومطابقة بنود الفاتورة (Invoice Details Modal)
      ══════════════════════════════════════════════════════════════════════════ */}
      {viewingInvoice && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '840px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '14px'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16.5px', color: '#0f172a' }}>
                  فاتورة توريد: {viewingInvoice.invoice_number}
                </h3>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                  المورد: {viewingInvoice.supplier_name} | التاريخ: {new Date(viewingInvoice.invoice_date).toLocaleDateString('ar-EG')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {viewingInvoice.drive_file_url && (
                  <a
                    href={viewingInvoice.drive_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="outstock-btn outstock-btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#0284c7', textDecoration: 'none' }}
                  >
                    <ExternalLink size={14} />
                    <span>المستند على Drive</span>
                  </a>
                )}
                <button
                  type="button"
                  className="outstock-btn-close"
                  onClick={() => setViewingInvoice(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* تفاصيل البنود */}
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '14px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '8px 10px' }}>م</th>
                    <th style={{ padding: '8px 10px' }}>اسم الصنف</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>الكمية</th>
                    <th style={{ padding: '8px 10px' }}>سعر الجمهور</th>
                    <th style={{ padding: '8px 10px' }}>الخصم</th>
                    <th style={{ padding: '8px 10px' }}>سعر الشراء</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>تاريخ الصلاحية</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>رقم التشغيلة</th>
                    <th style={{ padding: '8px 10px' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(!viewingInvoice.items || viewingInvoice.items.length === 0) ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        لا توجد بنود تفصيلية مسجلة لهذه الفاتورة
                      </td>
                    </tr>
                  ) : (
                    viewingInvoice.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{item.medication_name}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 10px' }}>{item.public_price || 0} ج.م</td>
                        <td style={{ padding: '8px 10px', color: '#d97706' }}>{item.discount_percent || 0}%</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{item.buy_price || 0} ج.م</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {(() => {
                            const exp = getExpiryAnalysis(item.expiry_date);
                            if (!item.expiry_date || exp.status === 'empty') return <span style={{ color: '#94a3b8' }}>—</span>;
                            return (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  background: exp.bg,
                                  color: exp.color,
                                  border: `1px solid ${exp.border}`
                                }}
                              >
                                {exp.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {item.batch_number ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 6px',
                                borderRadius: '5px',
                                fontSize: '11px',
                                background: '#f8fafc',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                                fontFamily: 'monospace',
                                fontWeight: 'bold'
                              }}
                            >
                              #{item.batch_number}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#0f766e' }}>
                          {Number(item.total_price || 0).toFixed(2)} ج.م
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>إجمالي الفاتورة الصافي: </span>
                <strong style={{ fontSize: '15px', color: '#0f766e' }}>
                  {Number(viewingInvoice.net_amount || viewingInvoice.total_amount || 0).toLocaleString('ar-EG')} ج.م
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>المتبقي: </span>
                <strong style={{ fontSize: '15px', color: '#b91c1c' }}>
                  {Number(viewingInvoice.remaining_balance || 0).toLocaleString('ar-EG')} ج.م
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة تسجيل مسحوب فرع إضافي
      ══════════════════════════════════════════════════════════════════════════ */}
      {isExtraWithdrawalModalOpen && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '480px', width: '92%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16.5px', color: '#0f172a' }}>
                {editingWithdrawalId ? '✏️ تعديل مسحوبات فرع مسجلة' : 'تسجيل مسحوب فرع إضافي'}
              </h3>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={() => {
                  setIsExtraWithdrawalModalOpen(false);
                  setEditingWithdrawalId(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExtraWithdrawal}>
              <div style={{ marginBottom: '14px' }}>
                <label className="outstock-form-label">الفرع المستلم *</label>
                <select
                  className="outstock-form-select"
                  value={extraForm.branch_id}
                  onChange={(e) => setExtraForm({ ...extraForm, branch_id: e.target.value })}
                  required
                >
                  <option value="">اختر الفرع...</option>
                  {branchesList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="outstock-form-label">مبلغ المسحوبات الإجمالي (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="outstock-form-input"
                  placeholder="0.00"
                  value={extraForm.amount}
                  onChange={(e) => setExtraForm({ ...extraForm, amount: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="outstock-form-label">عدد الأصناف المسحوبة</label>
                <input
                  type="number"
                  min="1"
                  className="outstock-form-input"
                  placeholder="1"
                  value={extraForm.items_count}
                  onChange={(e) => setExtraForm({ ...extraForm, items_count: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="outstock-form-label">تاريخ المسحوب *</label>
                <input
                  type="date"
                  className="outstock-form-input"
                  value={extraForm.withdrawal_date}
                  onChange={(e) => setExtraForm({ ...extraForm, withdrawal_date: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="outstock-form-label">سبب المسحوب / ملاحظات</label>
                <textarea
                  className="outstock-form-input"
                  rows={2}
                  placeholder="مثال: توريد استثنائي مباشر، تغطية عجز مخزون الفرع..."
                  value={extraForm.notes}
                  onChange={(e) => setExtraForm({ ...extraForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => {
                    setIsExtraWithdrawalModalOpen(false);
                    setEditingWithdrawalId(null);
                  }}
                >
                  إلغاء
                </button>
                <button type="submit" className="outstock-btn outstock-btn-primary">
                  {editingWithdrawalId ? 'حفظ التعديلات 💾' : 'حفظ المسحوب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة سجل مسحوبات الفرع
      ══════════════════════════════════════════════════════════════════════════ */}
      {isBranchHistoryModalOpen && selectedBranchForHistory && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '820px', width: '95%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} style={{ color: '#0d9488' }} />
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                  سجل مسحوبات: {selectedBranchForHistory.branch_name || selectedBranchForHistory.name || `فرع ${selectedBranchForHistory.branch_id}`}
                </h3>
              </div>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={() => {
                  setIsBranchHistoryModalOpen(false);
                  setSelectedBranchForHistory(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {(() => {
                const branchHistory = extraWithdrawals.filter(
                  (w) => String(w.branch_id) === String(selectedBranchForHistory.branch_id || selectedBranchForHistory.id)
                );
                if (branchHistory.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '35px', color: '#64748b' }}>
                      لا توجد مسحوبات مسجلة لهذا الفرع في هذا الشهر
                    </div>
                  );
                }
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '10px 12px' }}>التاريخ</th>
                        <th style={{ padding: '10px 12px' }}>المبلغ</th>
                        <th style={{ padding: '10px 12px' }}>عدد الأصناف</th>
                        <th style={{ padding: '10px 12px' }}>ملاحظات / السبب</th>
                        <th style={{ padding: '10px 12px' }}>المسؤول</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchHistory.map((item, i) => (
                        <tr key={item.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>
                            {item.withdrawal_date ? new Date(item.withdrawal_date).toLocaleDateString('ar-EG') : '-'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#0f766e', fontWeight: 'bold' }}>
                            {Number(item.amount || 0).toLocaleString('ar-EG')} ج.م
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {item.items_count || 1} صنف
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569' }}>
                            {item.notes || '-'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '12px' }}>
                            {item.created_by_name || '-'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleStartEditBranchWithdrawal(item)}
                                style={{
                                  border: 'none',
                                  background: '#eff6ff',
                                  color: '#2563eb',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 'bold'
                                }}
                                title="تعديل هذا المسحوب"
                              >
                                <Edit size={12} />
                                <span>تعديل</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBranchWithdrawal(item.id)}
                                style={{
                                  border: 'none',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 'bold'
                                }}
                                title="حذف هذا المسحوب"
                              >
                                <Trash2 size={12} />
                                <span>حذف</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => {
                  setIsBranchHistoryModalOpen(false);
                  setSelectedBranchForHistory(null);
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة التحقق من كود الموظف كباسورد لتسجيل فاتورة جديدة */}
      <EmployeeCodeAuthModal
        isOpen={isInvoiceEmployeeAuthOpen}
        title="التحقق من كود الموظف لإدخال الفاتورة"
        subtitle="يرجى إدخال كود الموظف السري لتوثيق مسؤوليته عن إدخال فاتورة التوريد في النظام"
        actionLabel="تأكيد ومتابعة إدخال الفاتورة"
        onClose={() => setIsInvoiceEmployeeAuthOpen(false)}
        onSuccess={handleInvoiceEmployeeVerified}
      />

      {/* نافذة تحديد فواتير مسجلة للمسحوبات اليدوية */}
      <SelectRegisteredInvoicesModal
        isOpen={isSelectInvoicesModalOpen}
        suppliers={suppliers}
        initialSupplierId={selectedSupplierForWithdrawals?.id}
        onClose={() => setIsSelectInvoicesModalOpen(false)}
        onConfirm={handleConfirmSelectedInvoices}
      />
    </div>
  );
}
