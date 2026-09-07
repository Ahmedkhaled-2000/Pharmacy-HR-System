import React, { useState, useMemo } from 'react';

/**
 * FinancialStatementsTab.jsx
 * القوائم والتقارير المالية الختامية الذكية:
 * 1. ميزان المراجعة بالمجاميع والأرصدة (Trial Balance)
 * 2. قائمة الدخل والأرباح والخسائر (Income Statement / P&L)
 * 3. الميزانية العمومية والمركز المالي (Balance Sheet)
 * 4. دفتر الأستاذ العام وكشف حساب تحليلي (General Ledger Statement)
 */
export default function FinancialStatementsTab({
  accounts = [],
  entries = [],
  branches = [],
  selectedBranchId = '',
  fiscalPeriod = '',
}) {
  const [reportType, setReportType] = useState('trial-balance'); // 'trial-balance' | 'income-statement' | 'balance-sheet' | 'general-ledger'
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState('');

  // 1. Calculate Movements and Balances per account from Journal Entries
  const accountBalances = useMemo(() => {
    const map = {};

    accounts.forEach((a) => {
      map[a.id] = {
        ...a,
        totalDebit: 0,
        totalCredit: 0,
        closingDebit: 0,
        closingCredit: 0,
        netBalance: 0,
      };
    });

    // Aggregate lines
    (entries || []).forEach((entry) => {
      // If branch filter applied, filter entries
      if (selectedBranchId && entry.branch_id && entry.branch_id !== selectedBranchId) {
        return;
      }

      (entry.lines || []).forEach((l) => {
        if (selectedBranchId && l.branch_id && l.branch_id !== selectedBranchId) {
          return;
        }

        if (map[l.account_id]) {
          map[l.account_id].totalDebit += parseFloat(l.debit) || 0;
          map[l.account_id].totalCredit += parseFloat(l.credit) || 0;
        }
      });
    });

    // Compute closing balance
    Object.keys(map).forEach((id) => {
      const a = map[id];
      const open = parseFloat(a.opening_balance) || 0;

      if (a.nature === 'debit') {
        const net = open + a.totalDebit - a.totalCredit;
        a.netBalance = net;
        if (net >= 0) {
          a.closingDebit = net;
          a.closingCredit = 0;
        } else {
          a.closingDebit = 0;
          a.closingCredit = Math.abs(net);
        }
      } else {
        const net = open + a.totalCredit - a.totalDebit;
        a.netBalance = net;
        if (net >= 0) {
          a.closingCredit = net;
          a.closingDebit = 0;
        } else {
          a.closingCredit = 0;
          a.closingDebit = Math.abs(net);
        }
      }
    });

    return map;
  }, [accounts, entries, selectedBranchId]);

  // 2. Trial Balance Summary
  const trialBalanceAccounts = useMemo(() => {
    return accounts
      .filter((a) => !a.is_parent)
      .map((a) => accountBalances[a.id] || a)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, accountBalances]);

  const trialTotals = useMemo(() => {
    let totDebit = 0;
    let totCredit = 0;
    let totClosingDebit = 0;
    let totClosingCredit = 0;

    trialBalanceAccounts.forEach((a) => {
      totDebit += a.totalDebit;
      totCredit += a.totalCredit;
      totClosingDebit += a.closingDebit;
      totClosingCredit += a.closingCredit;
    });

    return {
      totDebit,
      totCredit,
      totClosingDebit,
      totClosingCredit,
      isBalanced: Math.abs(totClosingDebit - totClosingCredit) < 0.01,
    };
  }, [trialBalanceAccounts]);

  // 3. Income Statement (P&L) calculations
  const pnlData = useMemo(() => {
    let totalRevenues = 0;
    let totalCogs = 0;
    let totalEmployeeExpenses = 0;
    let totalBranchExpenses = 0;
    let totalBankFees = 0; // 65
    let totalOtherExpenses = 0;

    accounts.forEach((acc) => {
      const b = accountBalances[acc.id];
      if (!b || acc.is_parent) return;

      const val = b.netBalance;

      if (acc.account_type === 'revenue') {
        totalRevenues += val;
      } else if (acc.account_type === 'cogs') {
        totalCogs += val;
      } else if (acc.account_type === 'expense') {
        if (acc.code.startsWith('61')) {
          totalEmployeeExpenses += val;
        } else if (acc.code.startsWith('62')) {
          totalBranchExpenses += val;
        } else if (acc.code.startsWith('65')) {
          totalBankFees += val;
        } else {
          totalOtherExpenses += val;
        }
      }
    });

    const grossProfit = totalRevenues - totalCogs;
    const totalOperatingExpenses = totalEmployeeExpenses + totalBranchExpenses + totalBankFees + totalOtherExpenses;
    const netProfit = grossProfit - totalOperatingExpenses;

    return {
      totalRevenues,
      totalCogs,
      grossProfit,
      totalEmployeeExpenses,
      totalBranchExpenses,
      totalBankFees,
      totalOtherExpenses,
      totalOperatingExpenses,
      netProfit,
    };
  }, [accounts, accountBalances]);

  // 4. Balance Sheet calculations
  const balanceSheetData = useMemo(() => {
    let currentAssets = 0;
    let fixedAssets = 0;
    let currentLiabilities = 0;
    let longTermLiabilities = 0;
    let baseEquity = 0;

    accounts.forEach((acc) => {
      const b = accountBalances[acc.id];
      if (!b || acc.is_parent) return;

      const val = b.netBalance;

      if (acc.account_type === 'asset') {
        if (acc.code.startsWith('11')) currentAssets += val;
        else if (acc.code.startsWith('12')) fixedAssets += val;
      } else if (acc.account_type === 'liability') {
        if (acc.code.startsWith('21')) currentLiabilities += val;
        else if (acc.code.startsWith('22')) longTermLiabilities += val;
      } else if (acc.account_type === 'equity') {
        baseEquity += val;
      }
    });

    const totalAssets = currentAssets + fixedAssets;
    const totalLiabilities = currentLiabilities + longTermLiabilities;
    // Current year profit is added to equity
    const currentYearProfit = pnlData.netProfit;
    const totalEquity = baseEquity + currentYearProfit;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    return {
      currentAssets,
      fixedAssets,
      totalAssets,
      currentLiabilities,
      longTermLiabilities,
      totalLiabilities,
      baseEquity,
      currentYearProfit,
      totalEquity,
      totalLiabilitiesAndEquity,
      difference: Math.abs(totalAssets - totalLiabilitiesAndEquity),
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    };
  }, [accounts, accountBalances, pnlData]);

  // 5. General Ledger Movements for selected account
  const ledgerLines = useMemo(() => {
    if (!selectedLedgerAccountId) return [];
    const lines = [];

    entries.forEach((entry) => {
      if (selectedBranchId && entry.branch_id && entry.branch_id !== selectedBranchId) return;

      (entry.lines || []).forEach((l) => {
        if (l.account_id === selectedLedgerAccountId) {
          lines.push({
            entry_number: entry.entry_number,
            entry_date: entry.entry_date,
            narration: entry.narration,
            line_desc: l.line_desc,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          });
        }
      });
    });

    // Sort by date
    lines.sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

    // Running balance
    const targetAccount = accounts.find((a) => a.id === selectedLedgerAccountId);
    let running = parseFloat(targetAccount?.opening_balance || 0);

    return lines.map((line) => {
      if (targetAccount?.nature === 'debit') {
        running += line.debit - line.credit;
      } else {
        running += line.credit - line.debit;
      }
      return { ...line, runningBalance: running };
    });
  }, [selectedLedgerAccountId, entries, accounts, selectedBranchId]);

  const targetAccountObj = accounts.find((a) => a.id === selectedLedgerAccountId);

  return (
    <div>
      {/* Sub-tabs for Statements */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`acc-tab-btn ${reportType === 'trial-balance' ? 'active' : ''}`}
          onClick={() => setReportType('trial-balance')}
        >
          ⚖️ ميزان المراجعة (Trial Balance)
        </button>

        <button
          type="button"
          className={`acc-tab-btn ${reportType === 'income-statement' ? 'active' : ''}`}
          onClick={() => setReportType('income-statement')}
        >
          📈 قائمة الدخل والأرباح والخسائر (P&L)
        </button>

        <button
          type="button"
          className={`acc-tab-btn ${reportType === 'balance-sheet' ? 'active' : ''}`}
          onClick={() => setReportType('balance-sheet')}
        >
          🏛️ الميزانية العمومية (Balance Sheet)
        </button>

        <button
          type="button"
          className={`acc-tab-btn ${reportType === 'general-ledger' ? 'active' : ''}`}
          onClick={() => setReportType('general-ledger')}
        >
          📖 دفتر الأستاذ العام (General Ledger)
        </button>

        <div style={{ marginRight: 'auto' }}>
          <button
            type="button"
            className="acc-btn acc-btn-outline"
            onClick={() => window.print()}
          >
            🖨️ طباعة التقرير المالي
          </button>
        </div>
      </div>

      {/* ── 1. ميزان المراجعة ── */}
      {reportType === 'trial-balance' && (
        <div>
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '16px 20px', borderRadius: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#fff' }}>
                ميزان المراجعة بالأرصدة والمجاميع
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                التحقق التام من توازن الحسابات والقيود المحاسبية للفرع أو المجموعة
              </p>
            </div>
            <div>
              {trialTotals.isBalanced ? (
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', padding: '6px 14px', borderRadius: '10px', fontSize: '13.5px', fontWeight: '800' }}>
                  ✅ الميزان متزن تماماً
                </span>
              ) : (
                <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', padding: '6px 14px', borderRadius: '10px', fontSize: '13.5px', fontWeight: '800' }}>
                  ⚠️ يوجد فارق عدم اتزان
                </span>
              )}
            </div>
          </div>

          <div className="acc-table-card">
            <table className="acc-table" style={{ fontSize: '12.5px' }}>
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>الكود</th>
                  <th>اسم الحساب</th>
                  <th style={{ width: '90px' }}>الطبيعة</th>
                  <th style={{ width: '130px', color: '#34d399' }}>حركات مدينة (+)</th>
                  <th style={{ width: '130px', color: '#f87171' }}>حركات دائنة (-)</th>
                  <th style={{ width: '140px', color: '#38bdf8' }}>رصيد ختامي مدين</th>
                  <th style={{ width: '140px', color: '#f59e0b' }}>رصيد ختامي دائن</th>
                </tr>
              </thead>
              <tbody>
                {trialBalanceAccounts.map((acc) => (
                  <tr key={acc.id}>
                    <td><span className="acc-code-badge">{acc.code}</span></td>
                    <td><strong style={{ color: '#fff' }}>{acc.name_ar}</strong></td>
                    <td style={{ color: acc.nature === 'debit' ? '#34d399' : '#f87171', fontWeight: '700' }}>
                      {acc.nature === 'debit' ? 'مدين' : 'دائن'}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{acc.totalDebit > 0 ? acc.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{acc.totalCredit > 0 ? acc.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: '800', color: acc.closingDebit > 0 ? '#38bdf8' : '#64748b' }}>
                      {acc.closingDebit > 0 ? acc.closingDebit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: '800', color: acc.closingCredit > 0 ? '#f59e0b' : '#64748b' }}>
                      {acc.closingCredit > 0 ? acc.closingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(15, 23, 42, 0.9)', fontWeight: '800', fontSize: '13.5px' }}>
                  <td colSpan="3" style={{ textAlign: 'left', paddingLeft: '20px' }}>الإجمالي العام للميزان:</td>
                  <td style={{ color: '#34d399', fontFamily: 'monospace' }}>{trialTotals.totDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</td>
                  <td style={{ color: '#f87171', fontFamily: 'monospace' }}>{trialTotals.totCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</td>
                  <td style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{trialTotals.totClosingDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</td>
                  <td style={{ color: '#f59e0b', fontFamily: 'monospace' }}>{trialTotals.totClosingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── 2. قائمة الدخل (P&L) ── */}
      {reportType === 'income-statement' && (
        <div style={{ maxWidth: '850px', margin: '0 auto' }}>
          <div className="acc-table-card" style={{ padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '800', color: '#fff' }}>
                قائمة الدخل والأرباح والخسائر (Income Statement)
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                عن الفترة المالية المنتهية حتى {fiscalPeriod || 'الشهر الحالي'}
              </p>
            </div>

            {/* Revenues */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.12)', borderRadius: '10px', fontWeight: '800', color: '#c084fc' }}>
                <span>1. إجمالي إيرادات المبيعات والنشاط (+)</span>
                <span style={{ fontFamily: 'monospace', fontSize: '16px' }}>
                  {pnlData.totalRevenues.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                </span>
              </div>
            </div>

            {/* COGS */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(249, 115, 22, 0.12)', borderRadius: '10px', fontWeight: '800', color: '#fb923c' }}>
                <span>2. تكلفة المبيعات والبضاعة المباعة (COGS) (-)</span>
                <span style={{ fontFamily: 'monospace', fontSize: '16px' }}>
                  {pnlData.totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                </span>
              </div>
            </div>

            {/* Gross Profit */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', fontWeight: '800', color: '#38bdf8' }}>
                <span style={{ fontSize: '15px' }}>★ مجمل الربح الصيدلاني (Gross Profit)</span>
                <span style={{ fontFamily: 'monospace', fontSize: '18px' }}>
                  {pnlData.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                </span>
              </div>
            </div>

            {/* Operating Expenses */}
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '14px', padding: '16px', marginBottom: '22px' }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#f87171', marginBottom: '12px' }}>
                3. المصروفات التشغيلية والإدارية والعمولات البنكية (-):
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13.5px' }}>
                <span style={{ color: '#cbd5e1' }}>• أجور ومصروفات الكادر الطبي والموظفين (رواتب وإضافي وبدلات)</span>
                <span style={{ fontFamily: 'monospace' }}>{pnlData.totalEmployeeExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13.5px' }}>
                <span style={{ color: '#cbd5e1' }}>• مصروفات تشغيل الفروع (إيجارات، كهرباء، مياه، إنترنت، صيانة، نظافة)</span>
                <span style={{ fontFamily: 'monospace' }}>{pnlData.totalBranchExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
              </div>

              {/* Bank Fees explicitly highlighted as requested! */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13.5px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: '6px' }}>
                <span style={{ color: '#fda4af', fontWeight: '700' }}>
                  • عمولات ومصروفات نقاط البيع والمحافظ وإنستاباي (خصم البنك 651/652/653)
                </span>
                <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#f43f5e' }}>
                  {pnlData.totalBankFees.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13.5px' }}>
                <span style={{ color: '#cbd5e1' }}>• مصروفات تسويق وتوصيل ومصروفات إدارية وعمومية</span>
                <span style={{ fontFamily: 'monospace' }}>{pnlData.totalOtherExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', fontWeight: '800', color: '#f87171' }}>
                <span>إجمالي المصروفات التشغيلية والبنكية:</span>
                <span style={{ fontFamily: 'monospace' }}>{pnlData.totalOperatingExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
              </div>
            </div>

            {/* Net Profit */}
            <div style={{ padding: '16px 20px', background: pnlData.netProfit >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', border: `2px solid ${pnlData.netProfit >= 0 ? '#10b981' : '#ef4444'}`, borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>النتيجة النهائية لأعمال النشاط</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginTop: '2px' }}>
                  {pnlData.netProfit >= 0 ? '🏆 صافي أرباح الفترة (Net Profit)' : '⚠️ صافي خسائر الفترة'}
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: '900', fontFamily: 'monospace', color: pnlData.netProfit >= 0 ? '#34d399' : '#f87171' }}>
                {pnlData.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. الميزانية العمومية ── */}
      {reportType === 'balance-sheet' && (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="acc-table-card" style={{ padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '800', color: '#fff' }}>
                الميزانية العمومية وقائمة المركز المالي (Balance Sheet)
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                المركز المالي كما في تاريخ اليوم · معادلة الميزانية: الأصول = الالتزامات + حقوق الملكية
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Assets Side */}
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', borderRadius: '14px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '16px', color: '#34d399', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                  الجانب الأيمن: الأصول (Assets)
                </h3>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13.5px' }}>
                  <span style={{ color: '#cbd5e1' }}>1. الأصول المتداولة (نقدية، بنوك، مخزون، عملاء)</span>
                  <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>
                    {balanceSheetData.currentAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13.5px' }}>
                  <span style={{ color: '#cbd5e1' }}>2. الأصول الثابتة (أثاث، أجهزة، ديكورات)</span>
                  <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>
                    {balanceSheetData.fixedAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>

                <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '2px solid rgba(52, 211, 153, 0.4)', display: 'flex', justifyContent: 'space-between', fontWeight: '800', color: '#34d399', fontSize: '16px' }}>
                  <span>إجمالي الأصول:</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {balanceSheetData.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>
              </div>

              {/* Liabilities & Equity Side */}
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', borderRadius: '14px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '16px', color: '#60a5fa', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                  الجانب الأيسر: الالتزامات وحقوق الملكية
                </h3>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                  <span style={{ color: '#cbd5e1' }}>• الالتزامات المتداولة (موردون، رواتب ومستحقات)</span>
                  <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>
                    {balanceSheetData.currentLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                  <span style={{ color: '#cbd5e1' }}>• الالتزامات طويلة الأجل (قروض وتسهيلات)</span>
                  <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>
                    {balanceSheetData.longTermLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                  <span style={{ color: '#cbd5e1' }}>• رأس المال والأرباح المرحلة السابقة</span>
                  <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>
                    {balanceSheetData.baseEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#38bdf8' }}>
                  <span style={{ fontWeight: '700' }}>• صافي أرباح الفترة الحالية المنقولة (P&L)</span>
                  <span style={{ fontWeight: '800', fontFamily: 'monospace' }}>
                    {balanceSheetData.currentYearProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>

                <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '2px solid rgba(96, 165, 250, 0.4)', display: 'flex', justifyContent: 'space-between', fontWeight: '800', color: '#60a5fa', fontSize: '16px' }}>
                  <span>إجمالي الالتزامات وحقوق الملكية:</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {balanceSheetData.totalLiabilitiesAndEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>
              </div>
            </div>

            {/* Balanced Banner */}
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              {balanceSheetData.isBalanced ? (
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '10px 20px', borderRadius: '12px', display: 'inline-block', fontWeight: '800' }}>
                  ⚖️ الميزانية متوازنة 100% (الأصول = الالتزامات + حقوق الملكية)
                </div>
              ) : (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '10px 20px', borderRadius: '12px', display: 'inline-block', fontWeight: '800' }}>
                  ⚠️ فارق التوازن: {balanceSheetData.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. دفتر الأستاذ العام ── */}
      {reportType === 'general-ledger' && (
        <div>
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '16px 20px', borderRadius: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                اختر الحساب المحاسبي لاستخراج كشف الحساب التحليلي:
              </label>
              <select
                className="acc-form-select"
                value={selectedLedgerAccountId}
                onChange={(e) => setSelectedLedgerAccountId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">-- اختر الحساب المحاسبي --</option>
                {accounts.filter((a) => !a.is_parent).map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name_ar}
                  </option>
                ))}
              </select>
            </div>

            {targetAccountObj && (
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>الرصيد الافتتاحي للحساب:</div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#38bdf8', fontFamily: 'monospace' }}>
                  {Number(targetAccountObj.opening_balance || 0).toLocaleString()} ج.م
                </div>
              </div>
            )}
          </div>

          <div className="acc-table-card">
            <table className="acc-table" style={{ fontSize: '12.5px' }}>
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>التاريخ</th>
                  <th style={{ width: '120px' }}>رقم السند</th>
                  <th>بيان القيد والسطر</th>
                  <th style={{ width: '130px', color: '#34d399' }}>مدين (+)</th>
                  <th style={{ width: '130px', color: '#f87171' }}>دائن (-)</th>
                  <th style={{ width: '150px', color: '#38bdf8' }}>الرصيد التراكمي المتحرك</th>
                </tr>
              </thead>
              <tbody>
                {!selectedLedgerAccountId ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      يرجى اختيار حساب محاسبي من القائمة أعلاه لعرض حركاته التفصيلية.
                    </td>
                  </tr>
                ) : ledgerLines.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      لا توجد حركات مسجلة على هذا الحساب خلال الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  ledgerLines.map((line, idx) => (
                    <tr key={idx}>
                      <td>{line.entry_date}</td>
                      <td><span className="acc-code-badge">{line.entry_number}</span></td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#fff' }}>{line.narration}</div>
                        {line.line_desc && line.line_desc !== line.narration && (
                          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>{line.line_desc}</div>
                        )}
                      </td>
                      <td style={{ fontWeight: '800', color: line.debit > 0 ? '#34d399' : '#64748b', fontFamily: 'monospace' }}>
                        {line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ fontWeight: '800', color: line.credit > 0 ? '#f87171' : '#64748b', fontFamily: 'monospace' }}>
                        {line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ fontWeight: '800', color: '#38bdf8', fontFamily: 'monospace', fontSize: '13.5px' }}>
                        {line.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
