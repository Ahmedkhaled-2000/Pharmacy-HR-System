import React, { useState, useMemo, useCallback } from 'react';
import './accounts.css';

import AccountsNavbar from './AccountsNavbar';
import ChartOfAccountsTab from './ChartOfAccountsTab';
import TreasuryBanksTab from './TreasuryBanksTab';
import JournalEntriesTab from './JournalEntriesTab';
import CostCentersTab from './CostCentersTab';
import FinancialStatementsTab from './FinancialStatementsTab';

// Modals
import AccountCodesCheatsheetModal from './AccountCodesCheatsheetModal';
import EditTreasuryFeeModal from './EditTreasuryFeeModal';
import TransferTreasuryModal from './TransferTreasuryModal';
import NewJournalEntryModal from './NewJournalEntryModal';
import AddEditAccountModal from './AddEditAccountModal';

// Default Seeds
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_COST_CENTERS,
  DEFAULT_TREASURIES,
} from '../../utils/defaultChartOfAccounts';

/**
 * AccountsSystemView.jsx
 * الحاوية الكبرى لمنظومة الحسابات العامة وشجرة الحسابات (ERP)
 * تدعم العمل المباشر كشاشة مستقلة بمسار /accounts أو كقسم مدمج داخل لوحة التحكم
 */
export default function AccountsSystemView({
  isStandalone = false,
  state,
  setState,
  saveState,
  showToast = alert,
  onNavigateTab,
}) {
  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'treasuries' | 'entries' | 'cost-centers' | 'reports'

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

  // Initialize Core Data from State or Defaults
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

  const branches = state?.branches || [];

  // Helper to persist accounts state
  const persistAccountsData = useCallback(
    async (updatedPartial) => {
      const current = state?.accountsData || {
        accounts: DEFAULT_CHART_OF_ACCOUNTS,
        costCenters: DEFAULT_COST_CENTERS,
        treasuries: DEFAULT_TREASURIES,
        entries: [],
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

    // If parent was updated to is_parent = true
    if (accountData.parent_id) {
      updated = updated.map((a) =>
        a.id === accountData.parent_id ? { ...a, is_parent: true } : a
      );
    }

    await persistAccountsData({ accounts: updated });
    if (showToast) showToast('✅ تم حفظ الحساب بنجاح في شجرة الحسابات');
  };

  // 2. Save Treasury Fee Adjustments (Requested by User!)
  const handleSaveTreasuryFee = async (updatedTreasury) => {
    const updated = treasuries.map((t) =>
      t.id === updatedTreasury.id ? updatedTreasury : t
    );
    await persistAccountsData({ treasuries: updated });
    if (showToast) {
      showToast(
        `✅ تم تحديث نسبة خصم وعمولة ${updatedTreasury.name} إلى ${updatedTreasury.fee_percentage}% بنجاح`
      );
    }
  };

  // 3. Save New Journal Entry & Update Account Balances
  const handleSaveJournalEntry = async (newEntry) => {
    const updatedEntries = [newEntry, ...entries];

    // Recalculate balances for touched accounts
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

    // Also update treasuries balance if touched
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

  // 4. Execute Internal Transfer with Automatic Commission / Bank Fee Entry
  const handleExecuteTransfer = async ({
    fromTreasury,
    toTreasury,
    grossAmount,
    feeAmount,
    netAmount,
    transferDate,
    notes,
  }) => {
    // Generate Balanced Journal Entry
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

    // If there is an electronic / bank fee, add the commission line!
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
        line_desc: `عمولة ومصروفات تحويل لحظي / بنكي (${fromTreasury.name})`,
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

    // Update treasuries balance
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
        `✅ تم تحويل ${grossAmount.toLocaleString()} ج.م من (${fromTreasury.name}) إلى (${toTreasury.name}) مع خصم عمولة ${feeAmount.toFixed(2)} ج.م وإنشاء القيد المتزن فورياً.`
      );
    }
  };

  // 5. Save Cost Center
  const handleSaveCostCenter = async (newCC) => {
    const updated = [...costCenters, newCC];
    await persistAccountsData({ costCenters: updated });
    if (showToast) showToast(`✅ تم حفظ مركز التكلفة (${newCC.name})`);
  };

  // ── Calculate High-Level Financial Metrics (KPIs) ──
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
      if (a.account_type === 'asset') totalAssets += b;
      else if (a.account_type === 'liability') totalLiabilities += b;
      else if (a.account_type === 'revenue') totalRevenues += b;
      else if (a.account_type === 'cogs') totalCogs += b;
      else if (a.account_type === 'expense') {
        totalExpenses += b;
        if (a.code.startsWith('65')) totalBankFees += b;
      }
    });

    const grossProfit = totalRevenues - totalCogs;
    const netProfit = grossProfit - totalExpenses;
    const totalLiquid = treasuries.reduce(
      (sum, t) => sum + (parseFloat(t.current_balance) || 0),
      0
    );

    return {
      totalAssets,
      totalLiabilities,
      totalLiquid,
      totalRevenues,
      totalBankFees,
      grossProfit,
      netProfit,
    };
  }, [accounts, treasuries]);

  const handleBackToDashboard = () => {
    if (isStandalone) {
      window.location.href = window.location.origin;
    } else if (onNavigateTab) {
      onNavigateTab('dashboard');
    }
  };

  return (
    <div className="accounts-system-root">
      {/* 1. Header & Topbar */}
      <AccountsNavbar
        branches={branches}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        fiscalPeriod={fiscalPeriod}
        onPeriodChange={setFiscalPeriod}
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
        isStandalone={isStandalone}
        onBackToDashboard={handleBackToDashboard}
      />

      {/* 2. KPIs Summary Ribbon */}
      <div className="acc-kpi-grid">
        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">إجمالي النقدية والسيولة المتاحة</span>
            <span className="acc-kpi-icon">💰</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#38bdf8' }}>
            {metrics.totalLiquid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>الخزائن، البنوك، نقاط البيع، والمحافظ</span>
          </div>
        </div>

        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">إجمالي أصول المجموعة</span>
            <span className="acc-kpi-icon">🏛️</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#34d399' }}>
            {metrics.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>النقدية + المخزون + الأصول الثابتة</span>
          </div>
        </div>

        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">إجمالي المبيعات المحققة</span>
            <span className="acc-kpi-icon">📈</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#c084fc' }}>
            {metrics.totalRevenues.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>أدوية، مستحضرات، مكملات، ومستلزمات</span>
          </div>
        </div>

        {/* Bank & Digital Wallets Fees Card (Requested by User!) */}
        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">عمولات نقاط البيع والمحافظ وإنستاباي</span>
            <span className="acc-kpi-icon">💳</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#fb7185' }}>
            {metrics.totalBankFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>خصومات بنكية مقتطعة ومثبتة آلياً (651/652)</span>
          </div>
        </div>

        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">صافي أرباح النشاط</span>
            <span className="acc-kpi-icon">🏆</span>
          </div>
          <div className="acc-kpi-value" style={{ color: metrics.netProfit >= 0 ? '#10b981' : '#f87171' }}>
            {metrics.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>بعد خصم تكلفة البضاعة وكافة المصروفات</span>
          </div>
        </div>
      </div>

      {/* 3. Main Navigation Sub-tabs */}
      <nav className="acc-nav-tabs">
        <button
          type="button"
          className={`acc-tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          <span>🌳</span>
          <span>شجرة الحسابات (COA)</span>
        </button>

        <button
          type="button"
          className={`acc-tab-btn ${activeTab === 'treasuries' ? 'active' : ''}`}
          onClick={() => setActiveTab('treasuries')}
        >
          <span>🏦</span>
          <span>الخزائن والبنوك والدفع الإلكتروني</span>
        </button>

        <button
          type="button"
          className={`acc-tab-btn ${activeTab === 'entries' ? 'active' : ''}`}
          onClick={() => setActiveTab('entries')}
        >
          <span>📜</span>
          <span>دفتر القيود اليومية ({entries.length})</span>
        </button>

        <button
          type="button"
          className={`acc-tab-btn ${activeTab === 'cost-centers' ? 'active' : ''}`}
          onClick={() => setActiveTab('cost-centers')}
        >
          <span>🎯</span>
          <span>مراكز التكلفة ({costCenters.length})</span>
        </button>

        <button
          type="button"
          className={`acc-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <span>📊</span>
          <span>القوائم المالية وميزان المراجعة</span>
        </button>
      </nav>

      {/* 4. Tab Body Content */}
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
            onVoidEntry={(entry) => {
              showToast('⚠️ لا يمكن حذف قيد معتمد؛ يرجى إنشاء قيد تسوية عكسي وفق المعايير المحاسبية.');
            }}
          />
        )}

        {activeTab === 'cost-centers' && (
          <CostCentersTab
            costCenters={costCenters}
            branches={branches}
            onSaveCostCenter={handleSaveCostCenter}
          />
        )}

        {activeTab === 'reports' && (
          <FinancialStatementsTab
            accounts={accounts}
            entries={entries}
            branches={branches}
            selectedBranchId={selectedBranchId}
            fiscalPeriod={fiscalPeriod}
          />
        )}
      </main>

      {/* ── 5. Modals ── */}

      {/* A. Account Codes Cheatsheet Popup Modal (User Requested!) */}
      <AccountCodesCheatsheetModal
        isOpen={isCodesCheatsheetOpen}
        onClose={() => setIsCodesCheatsheetOpen(false)}
        accounts={accounts}
      />

      {/* B. Edit Treasury / Bank / Wallet Fee Modal (User Requested!) */}
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
    </div>
  );
}
