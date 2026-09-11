import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './accounts.css';

import AccountsDesktopMenuBar from './AccountsDesktopMenuBar';
import ChartOfAccountsTab from './ChartOfAccountsTab';
import TreasuryBanksTab from './TreasuryBanksTab';
import JournalEntriesTab from './JournalEntriesTab';
import PharmaVendorsTab from './PharmaVendorsTab';
import CostCentersTab from './CostCentersTab';
import FinancialStatementsTab from './FinancialStatementsTab';
import CashierClosingTab from './CashierClosingTab';
import AccountingSystemGuideCard from '../settings/AccountingSystemGuideCard';

// Modals
import AccountCodesCheatsheetModal from './AccountCodesCheatsheetModal';
import EditTreasuryFeeModal from './EditTreasuryFeeModal';
import TransferTreasuryModal from './TransferTreasuryModal';
import NewJournalEntryModal from './NewJournalEntryModal';
import AddEditAccountModal from './AddEditAccountModal';
import VendorTransactionModal from './VendorTransactionModal';
import AddEditVendorModal from './AddEditVendorModal';
import PayrollAccountingIntegrationModal from './PayrollAccountingIntegrationModal';
import NewCashierShiftModal from './NewCashierShiftModal';
import AiJournalPromptModal from './AiJournalPromptModal';
import AiAuditRadarModal from './AiAuditRadarModal';
import ZeroOutAccountsModal from './ZeroOutAccountsModal';
import AccountsLoginScreen from './AccountsLoginScreen';

// Default Seeds
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_COST_CENTERS,
  DEFAULT_TREASURIES,
} from '../../utils/defaultChartOfAccounts';
import {
  DEFAULT_PHARMA_VENDORS,
  DEFAULT_VENDOR_TRANSACTIONS,
} from '../../utils/defaultPharmaVendors';
import { DEFAULT_CASHIER_CLOSINGS } from '../../utils/defaultCashierClosings';
import { getCycleDateRange } from '../../utils/periodEngine';

/**
 * AccountsSystemView.jsx
 * الحاوية الكبرى لمنظومة الحسابات العامة وشجرة الحسابات (ERP Enterprise)
 * مصممة بنظام سطح المكتب الاحترافي مع توجيه دقيق من القوائم المنسدلة
 * وتكامل ذكي كامل مع الرواتب، حسابات شركات الأدوية، والطباعة المعزولة
 */
export default function AccountsSystemView({
  isStandalone = false,
  state,
  setState,
  saveState,
  showToast = alert,
  onNavigateTab,
  themeMode = 'light',
  toggleTheme,
  computeGrandPayroll,
  authRole = 'admin',
}) {
  // 1. فحص هل المستخدم الحالي هو المالك (Owner)
  const isOwner = authRole === 'owner' ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('app_auth_role') === 'owner');

  // حالة تسجيل دخول منظومة الحسابات
  const [isAccountsUnlocked, setIsAccountsUnlocked] = useState(() => {
    // إذا كان المستخدم هو المالك: الدخول فوري ومباشر دون مطالبة بكلمة مرور الحسابات
    if (isOwner) return true;
    // إذا تم إلغاء تفعيل قفل الحسابات في إعدادات المؤسسة
    if (state?.orgSettings?.accountsRequireLogin === false) return true;
    // التحقق من فتح الجلسة مسبقاً في نفس جلسة التصفح
    try {
      return sessionStorage.getItem('accounts_session_unlocked') === 'true';
    } catch {
      return false;
    }
  });

  // تحديث حالة الفك تلقائياً إذا تحول المستخدم إلى مالك
  useEffect(() => {
    if (isOwner) {
      setIsAccountsUnlocked(true);
    }
  }, [isOwner]);

  const handleLockAccountsSession = () => {
    try {
      sessionStorage.removeItem('accounts_session_unlocked');
    } catch {}
    setIsAccountsUnlocked(false);
    showToast?.('تم قفل جلسة الحسابات 🔒');
  };

  // Active Navigation Tab: 'chart' | 'treasuries' | 'entries' | 'vendors' | 'cost-centers' | 'reports' | 'guide'
  const [activeTab, setActiveTab] = useState('chart');
  const [reportsSubtype, setReportsSubtype] = useState('trial-balance');

  // Search query from ribbon
  const [searchQuery, setSearchQuery] = useState('');

  // Dimensions & Filters
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [fiscalPeriod, setFiscalPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  // Modals visibility
  const [isCodesCheatsheetOpen, setIsCodesCheatsheetOpen] = useState(false);
  const [isEditFeeOpen, setIsEditFeeOpen] = useState(false);
  const [selectedTreasuryForFee, setSelectedTreasuryForFee] = useState(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [preselectedTreasuryForTransfer, setPreselectedTreasuryForTransfer] = useState(null);
  const [isNewEntryModalOpen, setIsNewEntryModalOpen] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [parentAccountForNew, setParentAccountForNew] = useState(null);
  const [accountToEdit, setAccountToEdit] = useState(null);

  // Vendor Modals
  const [isVendorTxModalOpen, setIsVendorTxModalOpen] = useState(false);
  const [vendorTxInitialType, setVendorTxInitialType] = useState('payment');
  const [isAddEditVendorModalOpen, setIsAddEditVendorModalOpen] = useState(false);
  const [vendorToEdit, setVendorToEdit] = useState(null);

  // Other Feature Modals
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isNewCashierShiftModalOpen, setIsNewCashierShiftModalOpen] = useState(false);
  const [isAiPromptModalOpen, setIsAiPromptModalOpen] = useState(false);
  const [isAiAuditRadarModalOpen, setIsAiAuditRadarModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isZeroOutModalOpen, setIsZeroOutModalOpen] = useState(false);

  // Listen to system-wide New Entry shortcut (Alt+N / Ctrl+N)
  useEffect(() => {
    const handleNewEntry = () => {
      setIsNewEntryModalOpen(true);
    };
    window.addEventListener('app:shortcut:new-entry', handleNewEntry);
    return () => window.removeEventListener('app:shortcut:new-entry', handleNewEntry);
  }, []);

  // Initialize Core Data from State or Clean Defaults (0 balances)
  const accounts = useMemo(() => {
    return state?.accountsData?.accounts || DEFAULT_CHART_OF_ACCOUNTS;
  }, [state?.accountsData?.accounts]);

  const costCenters = useMemo(() => {
    return state?.accountsData?.costCenters || DEFAULT_COST_CENTERS;
  }, [state?.accountsData?.costCenters]);

  const treasuries = useMemo(() => {
    return state?.accountsData?.treasuries || DEFAULT_TREASURIES;
  }, [state?.accountsData?.treasuries]);

  const entries = useMemo(() => {
    return state?.accountsData?.entries || [];
  }, [state?.accountsData?.entries]);

  const vendors = useMemo(() => {
    return state?.accountsData?.vendors || DEFAULT_PHARMA_VENDORS;
  }, [state?.accountsData?.vendors]);

  const vendorTransactions = useMemo(() => {
    const raw = state?.accountsData?.vendorTransactions || DEFAULT_VENDOR_TRANSACTIONS;
    // Filter out any legacy demo seed records
    return raw.filter((tx) => !tx.id?.startsWith('vtx-00'));
  }, [state?.accountsData?.vendorTransactions]);

  const cashierClosings = useMemo(() => {
    const raw = state?.accountsData?.cashierClosings || DEFAULT_CASHIER_CLOSINGS;
    // Filter out any legacy demo seed records
    return raw.filter((c) => !c.id?.startsWith('close-'));
  }, [state?.accountsData?.cashierClosings]);

  const branches = state?.branches || [];

  // Helper to persist accounts state
  const persistAccountsData = useCallback(
    async (updatedPartial) => {
      const current = state?.accountsData || {
        accounts: DEFAULT_CHART_OF_ACCOUNTS,
        costCenters: DEFAULT_COST_CENTERS,
        treasuries: DEFAULT_TREASURIES,
        entries: [],
        vendors: DEFAULT_PHARMA_VENDORS,
        vendorTransactions: DEFAULT_VENDOR_TRANSACTIONS,
        cashierClosings: DEFAULT_CASHIER_CLOSINGS,
      };

      const merged = { ...current, ...updatedPartial };
      const nextState = { ...state, accountsData: merged };

      if (setState) setState(nextState);
      if (saveState) await saveState(nextState);
    },
    [state, setState, saveState]
  );

  // ── Handlers ──

  // 1. Save or Update Account in Chart of Accounts
  const handleSaveAccount = async (accountData) => {
    const exists = accounts.some((a) => a.id === accountData.id);
    let updated;
    if (exists) {
      updated = accounts.map((a) => (a.id === accountData.id ? { ...a, ...accountData } : a));
    } else {
      updated = [...accounts, accountData];
    }

    if (accountData.parent_id) {
      updated = updated.map((a) =>
        a.id === accountData.parent_id ? { ...a, is_parent: true } : a
      );
    }

    await persistAccountsData({ accounts: updated });
    if (showToast) showToast('✅ تم حفظ الحساب بنجاح في شجرة الحسابات');
  };

  // 2. Save Treasury Fee Adjustments
  const handleSaveTreasuryFee = async (updatedTreasury) => {
    const updated = treasuries.map((t) =>
      t.id === updatedTreasury.id ? updatedTreasury : t
    );
    await persistAccountsData({ treasuries: updated });
    if (showToast) {
      showToast(
        `✅ تم تحديث نسبة عمولة ${updatedTreasury.name} إلى ${updatedTreasury.fee_percentage}% بنجاح`
      );
    }
  };

  // 3. Save New Journal Entry & Update Account Balances
  const handleSaveJournalEntry = async (newEntry) => {
    const updatedEntries = [newEntry, ...entries];

    const accountDeltas = {};
    (newEntry.lines || []).forEach((l) => {
      if (!accountDeltas[l.account_id]) accountDeltas[l.account_id] = { debit: 0, credit: 0 };
      accountDeltas[l.account_id].debit += parseFloat(l.debit) || 0;
      accountDeltas[l.account_id].credit += parseFloat(l.credit) || 0;
    });

    const updatedAccounts = accounts.map((acc) => {
      if (accountDeltas[acc.id]) {
        const d = accountDeltas[acc.id];
        const prevBal = parseFloat(acc.current_balance) || 0;
        let nextBal = prevBal;
        if (acc.nature === 'debit') {
          nextBal += d.debit - d.credit;
        } else {
          nextBal += d.credit - d.debit;
        }
        return { ...acc, current_balance: nextBal };
      }
      return acc;
    });

    const updatedTreasuries = treasuries.map((t) => {
      if (accountDeltas[t.account_id]) {
        const d = accountDeltas[t.account_id];
        const prevBal = parseFloat(t.current_balance) || 0;
        const nextBal = prevBal + d.debit - d.credit;
        return { ...t, current_balance: nextBal };
      }
      return t;
    });

    await persistAccountsData({
      entries: updatedEntries,
      accounts: updatedAccounts,
      treasuries: updatedTreasuries,
    });

    if (showToast) showToast(`✅ تم ترحيل وحفظ سند القيد رقم ${newEntry.entry_number} بنجاح`);
  };

  // 4. Execute Internal Transfer
  const handleExecuteTransfer = async ({
    fromTreasury,
    toTreasury,
    grossAmount,
    feeAmount,
    netAmount,
    transferDate,
    notes,
  }) => {
    const lines = [
      {
        id: `line-${Date.now()}-1`,
        account_id: toTreasury.account_id,
        debit: netAmount,
        credit: 0,
        line_desc: `استلام تحويل من ${fromTreasury.name} (صافي)`,
        branch_id: toTreasury.branch_id || null,
      },
      {
        id: `line-${Date.now()}-2`,
        account_id: fromTreasury.account_id,
        debit: 0,
        credit: grossAmount,
        line_desc: `صرف تحويل نقدية إلى ${toTreasury.name}`,
        branch_id: fromTreasury.branch_id || null,
      },
    ];

    if (feeAmount > 0) {
      const commAccountId =
        fromTreasury.commission_account_id ||
        (fromTreasury.treasury_type === 'pos' ? 'acc-651' :
         fromTreasury.treasury_type === 'wallet' ? 'acc-652' :
         fromTreasury.treasury_type === 'instapay' ? 'acc-653' : 'acc-654');

      lines.push({
        id: `line-${Date.now()}-3`,
        account_id: commAccountId,
        debit: feeAmount,
        credit: 0,
        line_desc: `عمولة ومصروفات تحويل (${fromTreasury.name})`,
        branch_id: fromTreasury.branch_id || null,
      });
    }

    const autoEntry = {
      id: `entry-tr-${Date.now()}`,
      entry_number: `TR-${Date.now().toString().slice(-6)}`,
      entry_date: transferDate,
      doc_type: 'transfer',
      doc_reference: `TRANS-${fromTreasury.code}-${toTreasury.code}`,
      branch_id: fromTreasury.branch_id || null,
      cost_center_id: null,
      narration: notes,
      total_debit: grossAmount,
      total_credit: grossAmount,
      status: 'posted',
      created_by: 'المدير المالي',
      lines: lines,
    };

    const updatedTreasuries = treasuries.map((t) => {
      if (t.id === fromTreasury.id) {
        return { ...t, current_balance: (parseFloat(t.current_balance) || 0) - grossAmount };
      }
      if (t.id === toTreasury.id) {
        return { ...t, current_balance: (parseFloat(t.current_balance) || 0) + netAmount };
      }
      return t;
    });

    await handleSaveJournalEntry(autoEntry);
    await persistAccountsData({ treasuries: updatedTreasuries });

    if (showToast) {
      showToast(
        `✅ تم تحويل ${grossAmount.toLocaleString()} ج.م من (${fromTreasury.name}) إلى (${toTreasury.name}) مع خصم عمولة ${feeAmount.toFixed(2)} ج.م`
      );
    }
  };

  // 5. Cost Centers Management: Add/Edit and Delete (Item 9)
  const handleSaveCostCenter = async (costCenterData) => {
    const exists = costCenters.some((c) => c.id === costCenterData.id);
    let updated;
    if (exists) {
      updated = costCenters.map((c) => (c.id === costCenterData.id ? { ...c, ...costCenterData } : c));
    } else {
      updated = [...costCenters, costCenterData];
    }
    await persistAccountsData({ costCenters: updated });
    if (showToast) showToast(`✅ تم حفظ مركز التكلفة (${costCenterData.name}) بنجاح`);
  };

  const handleDeleteCostCenter = async (costCenterId) => {
    const updated = costCenters.filter((c) => c.id !== costCenterId);
    await persistAccountsData({ costCenters: updated });
    if (showToast) showToast('✅ تم حذف مركز التكلفة بنجاح');
  };

  // 6. Pharma Vendors Management: Add/Edit (Item 4)
  const handleSaveVendor = async (vendorData) => {
    const exists = vendors.some((v) => v.id === vendorData.id);
    let updated;
    if (exists) {
      updated = vendors.map((v) => (v.id === vendorData.id ? { ...v, ...vendorData } : v));
    } else {
      updated = [vendorData, ...vendors];
    }
    await persistAccountsData({ vendors: updated });
    if (showToast) showToast(`✅ تم حفظ بيانات شركة التوزيع (${vendorData.name_ar}) بنجاح`);
  };

  // 7. Save Pharma Vendor Transaction & Post Journal Entry
  const handleSaveVendorTransaction = async ({ tx, journalEntry }) => {
    const updatedTxs = [tx, ...vendorTransactions];

    const updatedVendors = vendors.map((v) => {
      if (v.id === tx.vendor_id) {
        const prev = parseFloat(v.current_balance) || 0;
        let next = prev;
        if (tx.tx_type === 'invoice') {
          next += tx.amount;
        } else if (tx.tx_type === 'payment' || tx.tx_type === 'credit_note') {
          next -= tx.amount;
        }
        return { ...v, current_balance: next };
      }
      return v;
    });

    await persistAccountsData({
      vendors: updatedVendors,
      vendorTransactions: updatedTxs,
    });

    if (journalEntry) {
      await handleSaveJournalEntry(journalEntry);
    }

    if (showToast) {
      const typeLabel =
        tx.tx_type === 'invoice' ? 'فاتورة مشتريات' :
        tx.tx_type === 'payment' ? 'سند سداد دفعة/شيك' : 'إشعار خصم مرتجع إكسباير';
      showToast(`✅ تم تسجيل ${typeLabel} للموزع وترحيل القيد المحاسبي المتزن بنجاح`);
    }
  };

  // 8. Post Automated Payroll Entry
  const handlePostPayrollEntry = async (entry) => {
    await handleSaveJournalEntry(entry);
    setIsPayrollModalOpen(false);
    if (showToast) {
      showToast(`✅ تم ترحيل قيد الرواتب والأجور بنجاح وتحديث أرصدة الاستحقاق والسلف`);
    }
  };

  // 9. Save Cashier Shift Closing & Integrate with Payroll Deductions and GL
  const handleSaveCashierClosing = async (closingRecord, journalEntry, payrollDeductions = []) => {
    const updatedClosings = [closingRecord, ...cashierClosings];
    let updatedEntries = entries;
    if (journalEntry) {
      updatedEntries = [journalEntry, ...entries];
    }

    const currentAccountsData = state?.accountsData || {};
    const updatedAccountsData = {
      ...currentAccountsData,
      cashierClosings: updatedClosings,
      entries: updatedEntries,
    };

    // Integrate deductions into state.adjustments for immediate HR / Payroll calculation
    const updatedAdjustments = payrollDeductions.length > 0
      ? [...(state?.adjustments || []), ...payrollDeductions]
      : (state?.adjustments || []);

    const nextState = {
      ...state,
      accountsData: updatedAccountsData,
      adjustments: updatedAdjustments,
    };

    if (setState) setState(nextState);
    if (saveState) await saveState(nextState);

    if (showToast) {
      showToast(`✅ تم تقفيل وردية الكاشير بنجاح (${closingRecord.closure_number}) وتوليد القيد المحاسبي وترحيل استقطاعات العجز للرواتب.`);
    }
  };

  // 10. Delete Cashier Shift Closing
  const handleDeleteCashierClosing = async (closingId) => {
    const updatedClosings = cashierClosings.filter((c) => c.id !== closingId);
    await persistAccountsData({ cashierClosings: updatedClosings });
    if (showToast) {
      showToast('🗑️ تم حذف تقفيل الوردية المحدد.');
    }
  };

  // 11. Settle Monthly Inventory Shortage Against Cash Surplus Escrow
  const handleSettleInventoryShortage = async (branchId, month, netShortage) => {
    const bEmps = (state?.employees || []).filter((e) => {
      return e.branches?.some((b) => b.branchId === branchId) || e.branchId === branchId || e.branch === branchId;
    });

    if (bEmps.length === 0) {
      alert('لا يوجد موظفون مسجلون بهذا الفرع لتوزيع العجز عليهم.');
      return;
    }

    const splitEach = Number((netShortage / bEmps.length).toFixed(2));
    const bName = branches.find((b) => b.id === branchId)?.name || 'الفرع';

    const cycleRange = getCycleDateRange(month, state?.orgSettings);
    const settleDate = cycleRange?.endDate || `${month}-20`;

    const newAdjs = bEmps.map((emp) => ({
      id: `adj-inv-shortage-${Date.now()}-${emp.id}`,
      employeeId: emp.id,
      branchId,
      type: 'deduction',
      amount: splitEach,
      reason: `صافي عجز الجرد الشهري للأصناف بعد مقاصة أمانات الزيادة النقدية (${bName}) - شهر ${month}`,
      date: settleDate,
      createdAt: new Date().toISOString(),
      isInventoryShortage: true,
    }));

    const nextState = {
      ...state,
      adjustments: [...(state?.adjustments || []), ...newAdjs],
    };

    if (setState) setState(nextState);
    if (saveState) await saveState(nextState);

    if (showToast) {
      showToast(`✅ تم توزيع صافي عجز الجرد (${netShortage.toLocaleString()} ج.م) بالتساوي على ${bEmps.length} موظفاً بصيدلية ${bName} وخصمه من الرواتب.`);
    }
  };

  // 12. Full System Factory Reset / Zero-Out Guarded by Owner Authentication
  const handleZeroOutAllAccounts = async () => {
    // 1. Reset all account balances in Chart of Accounts to 0
    const zeroedAccounts = accounts.map((acc) => ({
      ...acc,
      opening_balance: 0,
      current_balance: 0,
    }));

    // 2. Reset all treasury & bank balances to 0
    const zeroedTreasuries = treasuries.map((t) => ({
      ...t,
      current_balance: 0,
    }));

    // 3. Reset all pharma vendor balances to 0
    const zeroedVendors = vendors.map((v) => ({
      ...v,
      current_balance: 0,
    }));

    // 4. Construct totally clean zeroed accountsData
    const zeroedAccountsData = {
      accounts: zeroedAccounts,
      costCenters: costCenters,
      treasuries: zeroedTreasuries,
      entries: [],
      vendors: zeroedVendors,
      vendorTransactions: [],
      cashierClosings: [],
    };

    // 5. Remove any accounts-related adjustments (cashier / inventory shortage) from payroll
    const filteredAdjustments = (state?.adjustments || []).filter(
      (a) => !a.isCashierShortage && !a.isInventoryShortage
    );

    const nextState = {
      ...state,
      accountsData: zeroedAccountsData,
      adjustments: filteredAdjustments,
    };

    if (setState) setState(nextState);
    if (saveState) await saveState(nextState);

    if (showToast) {
      showToast(
        '✅ تم تصفير نظام الحسابات بالكامل وتفريغ كافة السجلات والأرصدة إلى الصفر بنجاح بتفويض معتمد من المالك.'
      );
    }
  };

  const handleOpenVendorTxModal = (type) => {
    setVendorTxInitialType(type || 'payment');
    setIsVendorTxModalOpen(true);
  };

  // ── High-Level Financial Metrics (KPIs) ──
  const metrics = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalRevenues = 0;
    let totalBankFees = 0;
    let totalCogs = 0;
    let totalExpenses = 0;

    accounts.forEach((a) => {
      if (a.is_parent) return;
      const b = parseFloat(a.current_balance) || 0;
      if (a.account_type === 'asset') {
        // Normal assets are debit. Contra-assets (depreciation) reduce assets
        if (a.code.startsWith('128') || a.nature === 'credit') {
          totalAssets -= Math.abs(b);
        } else {
          totalAssets += Math.abs(b);
        }
      } else if (a.account_type === 'liability') {
        totalLiabilities += Math.abs(b);
      } else if (a.account_type === 'revenue') {
        totalRevenues += Math.abs(b);
      } else if (a.account_type === 'cogs') {
        totalCogs += Math.abs(b);
      } else if (a.account_type === 'expense') {
        totalExpenses += Math.abs(b);
        if (a.code.startsWith('65')) totalBankFees += Math.abs(b);
      }
    });

    const grossProfit = totalRevenues - totalCogs;
    const netProfit = grossProfit - totalExpenses;
    const totalLiquid = treasuries.reduce(
      (sum, t) => sum + (parseFloat(t.current_balance) || 0),
      0
    );

    return {
      totalAssets: Math.max(0, totalAssets),
      totalLiabilities,
      totalLiquid,
      totalRevenues,
      totalBankFees,
      grossProfit,
      netProfit,
    };
  }, [accounts, treasuries]);

  // Safe Currency Formatter preventing flipped negative signs in RTL
  const renderFormattedAmount = (num) => {
    const val = parseFloat(num) || 0;
    const isNeg = val < 0;
    const formatted = Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (
      <span dir="ltr" style={{ display: 'inline-block', unicodeBidi: 'plaintext' }}>
        {isNeg ? `- ${formatted}` : formatted}
      </span>
    );
  };

  const handleBackToDashboard = () => {
    if (isStandalone) {
      if (window.opener && !window.opener.closed) {
        window.close();
      } else {
        window.location.href = window.location.origin;
      }
    } else if (onNavigateTab) {
      onNavigateTab('dashboard');
    }
  };

  const handleSelectTab = (targetTab, targetReportSubtype) => {
    setActiveTab(targetTab);
    if (targetReportSubtype) {
      setReportsSubtype(targetReportSubtype);
    }
  };

  // حماية صفحة الحسابات ببوابة تسجيل الدخول (مع استثناء المالك التلقائي)
  if (!isAccountsUnlocked && !isOwner) {
    return (
      <AccountsLoginScreen
        state={state}
        onLoginSuccess={() => {
          setIsAccountsUnlocked(true);
          showToast?.('مرحباً بك في منظومة الحسابات العامة 📊');
        }}
        onBack={() => {
          if (isStandalone) {
            window.location.href = '/';
          } else if (onNavigateTab) {
            onNavigateTab('dashboard');
          } else {
            window.history.back();
          }
        }}
        themeMode={themeMode}
      />
    );
  }

  return (
    <div className="accounts-system-root">
      {/* ── 1. Desktop Layer & Professional ERP Dropdown Menu Bar ── */}
      <AccountsDesktopMenuBar
        branches={branches}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        fiscalPeriod={fiscalPeriod}
        onPeriodChange={setFiscalPeriod}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenNewEntry={() => setIsNewEntryModalOpen(true)}
        onOpenTransfer={() => {
          setPreselectedTreasuryForTransfer(null);
          setIsTransferModalOpen(true);
        }}
        onOpenCodesCheatsheet={() => setIsCodesCheatsheetOpen(true)}
        onOpenAddAccount={() => {
          setParentAccountForNew(null);
          setAccountToEdit(null);
          setIsAddAccountModalOpen(true);
        }}
        onOpenVendorTxModal={handleOpenVendorTxModal}
        onOpenAddVendor={() => {
          setVendorToEdit(null);
          setIsAddEditVendorModalOpen(true);
        }}
        onOpenPayrollModal={() => setIsPayrollModalOpen(true)}
        onOpenNewCashierShift={() => setIsNewCashierShiftModalOpen(true)}
        onOpenAiPromptModal={() => setIsAiPromptModalOpen(true)}
        onOpenAiAuditRadarModal={() => setIsAiAuditRadarModalOpen(true)}
        onOpenGuideModal={() => setActiveTab('guide')}
        onOpenZeroOutModal={() => setIsZeroOutModalOpen(true)}
        themeMode={themeMode}
        toggleTheme={toggleTheme}
        isStandalone={isStandalone}
        onBackToDashboard={handleBackToDashboard}
        onLockAccounts={handleLockAccountsSession}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* ── 2. Interactive KPIs Summary Ribbon (Clickable - Item 10) ── */}
      <div className="acc-kpi-grid">
        {/* Card 1: Liquid Treasuries & Banks -> Go to treasuries */}
        <div
          className="acc-kpi-card interactive"
          style={{ borderTop: '3.5px solid #0284c7' }}
          onClick={() => setActiveTab('treasuries')}
          title="انقر للانتقال إلى شاشة الخزائن والبنوك والدفع الإلكتروني"
          role="button"
          tabIndex={0}
        >
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">إجمالي النقدية والسيولة المتاحة</span>
            <span className="acc-kpi-icon">💰</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#0284c7' }}>
            {renderFormattedAmount(metrics.totalLiquid)}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>الخزائن، البنوك، والمحافظ</span>
            <span className="acc-kpi-click-hint">استعراض ↗</span>
          </div>
        </div>

        {/* Card 2: Total Assets -> Go to Chart of accounts */}
        <div
          className="acc-kpi-card interactive"
          style={{ borderTop: '3.5px solid #0d9488' }}
          onClick={() => setActiveTab('chart')}
          title="انقر للانتقال إلى شجرة الحسابات واستعراض الأصول"
          role="button"
          tabIndex={0}
        >
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">إجمالي أصول المجموعة</span>
            <span className="acc-kpi-icon">🏛️</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#0d9488' }}>
            {renderFormattedAmount(metrics.totalAssets)}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>النقدية + المخزون + الأصول الثابتة</span>
            <span className="acc-kpi-click-hint">استعراض ↗</span>
          </div>
        </div>

        {/* Card 3: Revenues -> Go to Income Statement */}
        <div
          className="acc-kpi-card interactive"
          style={{ borderTop: '3.5px solid #7c3aed' }}
          onClick={() => {
            setActiveTab('reports');
            setReportsSubtype('income-statement');
          }}
          title="انقر للانتقال إلى قائمة الدخل واستعراض المبيعات والإيرادات"
          role="button"
          tabIndex={0}
        >
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">إجمالي المبيعات المحققة</span>
            <span className="acc-kpi-icon">📈</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#7c3aed' }}>
            {renderFormattedAmount(metrics.totalRevenues)}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>أدوية، مستحضرات، ومستلزمات</span>
            <span className="acc-kpi-click-hint">قائمة الدخل ↗</span>
          </div>
        </div>

        {/* Card 4: POS & Wallet Fees -> Go to treasuries / fees */}
        <div
          className="acc-kpi-card interactive"
          style={{ borderTop: '3.5px solid #e11d48' }}
          onClick={() => setActiveTab('treasuries')}
          title="انقر للانتقال إلى الخزائن وإدارة عمولات الدفع الإلكتروني"
          role="button"
          tabIndex={0}
        >
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">عمولات نقاط البيع والمحافظ وإنستاباي</span>
            <span className="acc-kpi-icon">💳</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#e11d48' }}>
            {renderFormattedAmount(metrics.totalBankFees)}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>عمولات مقتطعة ومثبتة آلياً (651/652)</span>
            <span className="acc-kpi-click-hint">إدارة العمولات ↗</span>
          </div>
        </div>

        {/* Card 5: Net Profit -> Go to Income statement / P&L */}
        <div
          className="acc-kpi-card interactive"
          style={{ borderTop: metrics.netProfit >= 0 ? '3.5px solid #059669' : '3.5px solid #dc2626' }}
          onClick={() => {
            setActiveTab('reports');
            setReportsSubtype('income-statement');
          }}
          title="انقر لاستعراض قائمة الأرباح والخسائر والتحليل المالي"
          role="button"
          tabIndex={0}
        >
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">صافي أرباح النشاط</span>
            <span className="acc-kpi-icon">🏆</span>
          </div>
          <div className="acc-kpi-value" style={{ color: metrics.netProfit >= 0 ? '#059669' : '#dc2626' }}>
            {renderFormattedAmount(metrics.netProfit)}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>بعد خصم تكلفة البضاعة والمصروفات</span>
            <span className="acc-kpi-click-hint">تقرير الأرباح ↗</span>
          </div>
        </div>
      </div>

      {/* ── 3. Content Container (Navigated 100% via Dropdown Menus & Cards) ── */}
      <main className="acc-content-container">
        {activeTab === 'chart' && (
          <ChartOfAccountsTab
            accounts={accounts}
            onOpenAddChild={(parent) => {
              setParentAccountForNew(parent);
              setAccountToEdit(null);
              setIsAddAccountModalOpen(true);
            }}
            onOpenEditAccount={(acc) => {
              setParentAccountForNew(null);
              setAccountToEdit(acc);
              setIsAddAccountModalOpen(true);
            }}
            onOpenCodesCheatsheet={() => setIsCodesCheatsheetOpen(true)}
            onOpenNewRootAccount={() => {
              setParentAccountForNew(null);
              setAccountToEdit(null);
              setIsAddAccountModalOpen(true);
            }}
          />
        )}

        {activeTab === 'treasuries' && (
          <TreasuryBanksTab
            treasuries={treasuries}
            branches={branches}
            onOpenEditFee={(treasury) => {
              setSelectedTreasuryForFee(treasury);
              setIsEditFeeOpen(true);
            }}
            onOpenTransferWithTreasury={(treasury) => {
              setPreselectedTreasuryForTransfer(treasury);
              setIsTransferModalOpen(true);
            }}
            onAddNewTreasury={() => {
              showToast('💡 لإضافة خزينة أو حساب بنكي، أضف حسابه أولاً في شجرة الحسابات ثم قم بربطه.');
            }}
          />
        )}

        {activeTab === 'entries' && (
          <JournalEntriesTab
            entries={entries}
            accounts={accounts}
            branches={branches}
            costCenters={costCenters}
            onOpenNewEntry={() => setIsNewEntryModalOpen(true)}
            onVoidEntry={() => {
              showToast('⚠️ لا يمكن حذف قيد معتمد؛ يرجى إنشاء قيد تسوية عكسي وفق المعايير المحاسبية.');
            }}
          />
        )}

        {activeTab === 'vendors' && (
          <PharmaVendorsTab
            vendors={vendors}
            transactions={vendorTransactions}
            branches={branches}
            onOpenNewTransaction={handleOpenVendorTxModal}
            onOpenAddVendor={() => {
              setVendorToEdit(null);
              setIsAddEditVendorModalOpen(true);
            }}
            onOpenEditVendor={(v) => {
              setVendorToEdit(v);
              setIsAddEditVendorModalOpen(true);
            }}
          />
        )}

        {activeTab === 'cost-centers' && (
          <CostCentersTab
            costCenters={costCenters}
            branches={branches}
            onSaveCostCenter={handleSaveCostCenter}
            onDeleteCostCenter={handleDeleteCostCenter}
          />
        )}

        {activeTab === 'cashier-closing' && (
          <CashierClosingTab
            closings={cashierClosings}
            branches={branches}
            employees={state?.employees || []}
            selectedBranchId={selectedBranchId}
            fiscalPeriod={fiscalPeriod}
            onOpenNewShiftModal={() => setIsNewCashierShiftModalOpen(true)}
            onDeleteClosing={handleDeleteCashierClosing}
            onSettleInventoryShortage={handleSettleInventoryShortage}
          />
        )}

        {activeTab === 'reports' && (
          <FinancialStatementsTab
            accounts={accounts}
            entries={entries}
            branches={branches}
            selectedBranchId={selectedBranchId}
            fiscalPeriod={fiscalPeriod}
            reportType={reportsSubtype}
            onReportTypeChange={setReportsSubtype}
          />
        )}

        {activeTab === 'guide' && (
          <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <AccountingSystemGuideCard onNavigateToAccounts={() => setActiveTab('chart')} />
          </div>
        )}
      </main>

      {/* ── 4. Modals ── */}

      {/* A. Account Codes Cheatsheet Popup Modal */}
      <AccountCodesCheatsheetModal
        isOpen={isCodesCheatsheetOpen}
        onClose={() => setIsCodesCheatsheetOpen(false)}
        accounts={accounts}
      />

      {/* B. Edit Treasury / Bank / Wallet Fee Modal */}
      <EditTreasuryFeeModal
        isOpen={isEditFeeOpen}
        onClose={() => {
          setIsEditFeeOpen(false);
          setSelectedTreasuryForFee(null);
        }}
        treasury={selectedTreasuryForFee}
        onSave={handleSaveTreasuryFee}
        accounts={accounts}
      />

      {/* C. Internal Treasury Cash Transfer Modal */}
      <TransferTreasuryModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setPreselectedTreasuryForTransfer(null);
        }}
        treasuries={treasuries}
        preselectedTreasury={preselectedTreasuryForTransfer}
        onExecuteTransfer={handleExecuteTransfer}
      />

      {/* D. New Balanced Journal Entry Modal */}
      <NewJournalEntryModal
        isOpen={isNewEntryModalOpen}
        onClose={() => setIsNewEntryModalOpen(false)}
        accounts={accounts}
        branches={branches}
        costCenters={costCenters}
        onSaveEntry={handleSaveJournalEntry}
      />

      {/* E. Add or Edit Account in Chart Modal */}
      <AddEditAccountModal
        isOpen={isAddAccountModalOpen}
        onClose={() => {
          setIsAddAccountModalOpen(false);
          setParentAccountForNew(null);
          setAccountToEdit(null);
        }}
        parentAccount={parentAccountForNew}
        accountToEdit={accountToEdit}
        onSave={handleSaveAccount}
        allAccounts={accounts}
      />

      {/* F. Pharma Vendors Transaction Modal */}
      <VendorTransactionModal
        isOpen={isVendorTxModalOpen}
        onClose={() => setIsVendorTxModalOpen(false)}
        initialTxType={vendorTxInitialType}
        vendors={vendors}
        branches={branches}
        treasuries={treasuries}
        onSaveTransaction={handleSaveVendorTransaction}
      />

      {/* G. Add / Edit Pharma Vendor Modal (Item 4) */}
      <AddEditVendorModal
        isOpen={isAddEditVendorModalOpen}
        onClose={() => {
          setIsAddEditVendorModalOpen(false);
          setVendorToEdit(null);
        }}
        vendorToEdit={vendorToEdit}
        onSaveVendor={handleSaveVendor}
        existingVendorsCount={vendors.length}
      />

      {/* H. Payroll & HR 1-Click Accounting Integration Modal */}
      <PayrollAccountingIntegrationModal
        isOpen={isPayrollModalOpen}
        onClose={() => setIsPayrollModalOpen(false)}
        state={state}
        fiscalPeriod={fiscalPeriod}
        computeGrandPayroll={computeGrandPayroll}
        treasuries={treasuries}
        accounts={accounts}
        onPostPayrollEntry={handlePostPayrollEntry}
      />

      {/* I. Cashier Shift Closing, Shortage, Surplus & Payroll Allocation Modal */}
      <NewCashierShiftModal
        isOpen={isNewCashierShiftModalOpen}
        onClose={() => setIsNewCashierShiftModalOpen(false)}
        branches={branches}
        selectedBranchId={selectedBranchId}
        employees={state?.employees || []}
        treasuries={treasuries}
        onSaveClosing={handleSaveCashierClosing}
      />

      {/* J. Natural Language AI Journal Prompt Modal */}
      <AiJournalPromptModal
        isOpen={isAiPromptModalOpen}
        onClose={() => setIsAiPromptModalOpen(false)}
        accounts={accounts}
        branches={branches}
        treasuries={treasuries}
        costCenters={costCenters}
        onSaveGeneratedEntry={async (entry) => {
          await handleSaveJournalEntry(entry);
          setIsAiPromptModalOpen(false);
        }}
      />

      {/* J. AI Financial Audit Radar & 30-day Cash Flow Forecast Modal */}
      <AiAuditRadarModal
        isOpen={isAiAuditRadarModalOpen}
        onClose={() => setIsAiAuditRadarModalOpen(false)}
        accounts={accounts}
        entries={entries}
        treasuries={treasuries}
        vendorTransactions={vendorTransactions}
      />

      {/* K. Educational Guide Modal Popup */}
      {isGuideModalOpen && (
        <div className="acc-modal-overlay" onClick={() => setIsGuideModalOpen(false)}>
          <div
            className="acc-modal hide-scrollbar"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', padding: '16px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button
                type="button"
                className="acc-btn"
                onClick={() => setIsGuideModalOpen(false)}
                style={{ padding: '6px 16px', background: '#e2e8f0', color: '#334155', fontWeight: '700' }}
              >
                ✕ إغلاق الدليل
              </button>
            </div>
            <AccountingSystemGuideCard
              onNavigateToAccounts={() => {
                setIsGuideModalOpen(false);
                setActiveTab('chart');
              }}
            />
          </div>
        </div>
      )}

      {/* L. Zero-Out Accounts Full Reset Modal (Owner Guarded) */}
      <ZeroOutAccountsModal
        isOpen={isZeroOutModalOpen}
        onClose={() => setIsZeroOutModalOpen(false)}
        onZeroOut={handleZeroOutAllAccounts}
        orgSettings={state?.orgSettings || {}}
        state={state}
      />
    </div>
  );
}
