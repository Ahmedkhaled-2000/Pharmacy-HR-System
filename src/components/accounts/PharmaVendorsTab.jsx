import React, { useState, useMemo } from 'react';

/**
 * PharmaVendorsTab.jsx
 * شاشة متابعة حسابات وحركات شركات توزيع الأدوية والموردين
 * تتبع مديونيات الشركات، فواتير المشتريات، الشيكات، وإشعارات خصم الإكسباير
 */
export default function PharmaVendorsTab({
  vendors = [],
  transactions = [],
  branches = [],
  onOpenNewTransaction,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState('');
  const [selectedTxTypeFilter, setSelectedTxTypeFilter] = useState('all');
  const [inspectedVendorForStatement, setInspectedVendorForStatement] = useState(null);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedVendorFilter && tx.vendor_id !== selectedVendorFilter) return false;
      if (selectedTxTypeFilter !== 'all' && tx.tx_type !== selectedTxTypeFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const numMatch = tx.tx_number && tx.tx_number.toLowerCase().includes(q);
        const descMatch = tx.narration && tx.narration.toLowerCase().includes(q);
        const chqMatch = tx.cheque_number && tx.cheque_number.toLowerCase().includes(q);
        if (!numMatch && !descMatch && !chqMatch) return false;
      }
      return true;
    });
  }, [transactions, selectedVendorFilter, selectedTxTypeFilter, searchTerm]);

  // Overall Financial Metrics
  const metrics = useMemo(() => {
    const totalPayables = vendors.reduce((sum, v) => sum + (parseFloat(v.current_balance) || 0), 0);
    const totalInvoices = transactions
      .filter((t) => t.tx_type === 'invoice')
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalPaid = transactions
      .filter((t) => t.tx_type === 'payment')
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalExpiredReturns = transactions
      .filter((t) => t.tx_type === 'credit_note')
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    return {
      totalPayables,
      totalInvoices,
      totalPaid,
      totalExpiredReturns,
    };
  }, [vendors, transactions]);

  // Statement calculations for modal
  const vendorStatement = useMemo(() => {
    if (!inspectedVendorForStatement) return [];
    const vTxs = transactions.filter((t) => t.vendor_id === inspectedVendorForStatement.id);
    vTxs.sort((a, b) => new Date(a.tx_date) - new Date(b.tx_date));

    let runningBalance = 0;
    return vTxs.map((tx) => {
      // In vendor accounts (Liability): Invoices increase liability (Credit +), Payments & Credit notes decrease liability (Debit -)
      let debit = 0;
      let credit = 0;
      if (tx.tx_type === 'invoice') {
        credit = parseFloat(tx.amount) || 0;
        runningBalance += credit;
      } else {
        debit = parseFloat(tx.amount) || 0;
        runningBalance -= debit;
      }

      return {
        ...tx,
        debit,
        credit,
        runningBalance,
      };
    });
  }, [inspectedVendorForStatement, transactions]);

  const getVendorName = (vId) => vendors.find((v) => v.id === vId)?.name_ar || vId;
  const getBranchName = (bId) => branches.find((b) => b.id === bId)?.name || 'عام / الإدارة';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. KPIs Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="acc-kpi-card" style={{ borderTop: '3.5px solid #dc2626' }}>
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">إجمالي مديونيات شركات التوزيع</span>
            <span className="acc-kpi-icon">🏢</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#dc2626' }}>
            {metrics.totalPayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>التزامات مستحقة السداد للموزعين</span>
          </div>
        </div>

        <div className="acc-kpi-card" style={{ borderTop: '3.5px solid #0284c7' }}>
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">مشتريات وفواتير الشهر</span>
            <span className="acc-kpi-icon">📥</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#0284c7' }}>
            {metrics.totalInvoices.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>توريدات أدوية ومستحضرات واردة</span>
          </div>
        </div>

        <div className="acc-kpi-card" style={{ borderTop: '3.5px solid #059669' }}>
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">المدفوعات وسدادات الشيكات</span>
            <span className="acc-kpi-icon">📤</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#059669' }}>
            {metrics.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>سدادات بنكية ونقدية وشيكات مصروفة</span>
          </div>
        </div>

        <div className="acc-kpi-card" style={{ borderTop: '3.5px solid #7c3aed' }}>
          <div className="acc-kpi-header">
            <span className="acc-kpi-title">خصومات مرتجع الإكسباير</span>
            <span className="acc-kpi-icon">🔄</span>
          </div>
          <div className="acc-kpi-value" style={{ color: '#7c3aed' }}>
            {metrics.totalExpiredReturns.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="acc-kpi-currency">ج.م</span>
          </div>
          <div className="acc-kpi-footer">
            <span>إشعارات خصم مستردة من الموزعين</span>
          </div>
        </div>
      </div>

      {/* 2. Action Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        padding: '14px 18px',
        borderRadius: '14px',
        boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.04)',
      }}>
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="acc-form-input"
            placeholder="بحث برقم الفاتورة، الشيك، أو الموزع..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: '220px' }}
          />

          <select
            className="acc-filter-select"
            value={selectedVendorFilter}
            onChange={(e) => setSelectedVendorFilter(e.target.value)}
          >
            <option value="">جميع شركات التوزيع والموردين</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name_ar}
              </option>
            ))}
          </select>

          <select
            className="acc-filter-select"
            value={selectedTxTypeFilter}
            onChange={(e) => setSelectedTxTypeFilter(e.target.value)}
          >
            <option value="all">جميع الحركات</option>
            <option value="invoice">فواتير مشتريات فقط</option>
            <option value="payment">سدادات وشيكات فقط</option>
            <option value="credit_note">إشعارات خصم إكسباير فقط</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="acc-btn acc-btn-primary"
            onClick={() => onOpenNewTransaction?.('payment')}
          >
            <span>📤 سداد دفعة / شيك</span>
          </button>
          <button
            type="button"
            className="acc-btn acc-btn-outline"
            onClick={() => onOpenNewTransaction?.('invoice')}
          >
            <span>📥 فاتورة مشتريات</span>
          </button>
          <button
            type="button"
            className="acc-btn acc-btn-outline"
            onClick={() => onOpenNewTransaction?.('credit_note')}
          >
            <span>🔄 إشعار إكسباير</span>
          </button>
        </div>
      </div>

      {/* 3. Vendors Cards Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
            🏢 دليل وحسابات شركات توزيع الأدوية المعتمدة ({vendors.length} موزعين)
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '14px' }}>
          {vendors.map((v) => {
            const utilizationPercent = v.credit_limit > 0 ? Math.min(100, Math.round((v.current_balance / v.credit_limit) * 100)) : 0;
            return (
              <div
                key={v.id}
                style={{
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: '14px',
                  padding: '16px',
                  boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: '3.5px solid #0284c7',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '15px', color: 'var(--text, #0f172a)' }}>{v.name_ar}</strong>
                        <span className="acc-code-badge" style={{ fontSize: '11px' }}>{v.code}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '3px' }}>
                        {v.rep_name} · هاتف: {v.phone}
                      </div>
                    </div>
                  </div>

                  {/* Balance Display */}
                  <div style={{
                    marginTop: '14px',
                    padding: '12px 14px',
                    background: 'var(--surface-subtle, #f8fafc)',
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>الرصيد المستحق للموزع:</div>
                      <div style={{ fontSize: '18px', fontWeight: '900', fontFamily: 'monospace', color: '#dc2626' }}>
                        {Number(v.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        <span style={{ fontSize: '11px', marginRight: '4px' }}>ج.م</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>فترة الائتمان:</div>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#0284c7' }}>
                        {v.credit_days} يوماً
                      </div>
                    </div>
                  </div>

                  {/* Credit Utilization Bar */}
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted, #64748b)', marginBottom: '4px' }}>
                      <span>سقف التسهيلات: {Number(v.credit_limit || 0).toLocaleString()} ج.م</span>
                      <span>استخدام: {utilizationPercent}%</span>
                    </div>
                    <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${utilizationPercent}%`,
                          background: utilizationPercent > 80 ? '#ef4444' : utilizationPercent > 50 ? '#f59e0b' : '#10b981',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease',
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px', borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: '12px' }}>
                  <button
                    type="button"
                    className="acc-btn acc-btn-outline"
                    style={{ flex: 1, padding: '6px 10px', fontSize: '12px', justifyContent: 'center' }}
                    onClick={() => setInspectedVendorForStatement(v)}
                  >
                    📑 كشف حساب تفصيلي
                  </button>
                  <button
                    type="button"
                    className="acc-btn acc-btn-primary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => onOpenNewTransaction?.('payment')}
                    title="سداد دفعة أو شيك لهذا الموزع"
                  >
                    💳 سداد
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Transactions Ledger Table */}
      <div className="acc-table-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
            📜 سجل فواتير وسدادات شركات الأدوية ({filteredTransactions.length} حركة مسجلة)
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>
            يتم إنشاء القيد المحاسبي المزدوج وتحديث اليومية العامة فورياً عند كل حركة
          </span>
        </div>

        <table className="acc-table" style={{ fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ width: '120px' }}>التاريخ</th>
              <th style={{ width: '130px' }}>رقم السند</th>
              <th>شركة التوزيع / المورد</th>
              <th style={{ width: '110px' }}>النوع</th>
              <th style={{ width: '130px' }}>الفرع</th>
              <th style={{ width: '140px' }}>المبلغ</th>
              <th style={{ width: '120px' }}>طريقة السداد</th>
              <th style={{ width: '100px' }}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--muted, #64748b)' }}>
                  لا توجد حركات أو فواتير مسجلة وفق الفلتر المحدد.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.tx_date}</td>
                  <td>
                    <span className="acc-code-badge">{tx.tx_number}</span>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--text, #0f172a)' }}>{getVendorName(tx.vendor_id)}</strong>
                    {tx.narration && (
                      <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>{tx.narration}</div>
                    )}
                  </td>
                  <td>
                    {tx.tx_type === 'invoice' && (
                      <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800' }}>
                        📥 فاتورة مشتريات
                      </span>
                    )}
                    {tx.tx_type === 'payment' && (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800' }}>
                        📤 سداد دفعة/شيك
                      </span>
                    )}
                    {tx.tx_type === 'credit_note' && (
                      <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800' }}>
                        🔄 إشعار إكسباير
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary, #334155)' }}>
                      {getBranchName(tx.branch_id)}
                    </span>
                  </td>
                  <td style={{ fontWeight: '900', fontFamily: 'monospace', fontSize: '14px', color: tx.tx_type === 'invoice' ? '#dc2626' : '#059669' }}>
                    {tx.tx_type === 'invoice' ? '+' : '-'} {Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </td>
                  <td>
                    <span style={{ fontSize: '12px' }}>
                      {tx.payment_method === 'cheque' ? `شيك (${tx.cheque_number || 'بدون رقم'})` :
                       tx.payment_method === 'bank_transfer' ? 'تحويل بنكي' :
                       tx.payment_method === 'cash' ? 'نقداً من الخزينة' :
                       tx.payment_method === 'credit_adjustment' ? 'تسوية إكسباير' : 'آجل'}
                    </span>
                  </td>
                  <td>
                    <span className="status-posted">معتمد مرحل</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Detailed Vendor Statement Modal */}
      {inspectedVendorForStatement && (
        <div className="acc-modal-overlay" onClick={() => setInspectedVendorForStatement(null)}>
          <div className="acc-modal acc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="acc-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>📑</span>
                <div>
                  <h2>كشف حساب تفصيلي: {inspectedVendorForStatement.name_ar}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                    كود الحساب: <strong>{inspectedVendorForStatement.account_code}</strong> · المندوب: {inspectedVendorForStatement.rep_name} ({inspectedVendorForStatement.rep_phone})
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="acc-action-icon-btn"
                onClick={() => setInspectedVendorForStatement(null)}
                style={{ fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <div className="acc-modal-body">
              {/* Top Highlights */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                background: 'var(--surface-subtle, #f8fafc)',
                border: '1px solid var(--border, #e2e8f0)',
                padding: '14px',
                borderRadius: '12px',
              }}>
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>الرصيد الدائن الحالي:</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: '#dc2626', fontFamily: 'monospace' }}>
                    {Number(inspectedVendorForStatement.current_balance || 0).toLocaleString()} ج.م
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>سقف التسهيلات:</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0284c7', fontFamily: 'monospace' }}>
                    {Number(inspectedVendorForStatement.credit_limit || 0).toLocaleString()} ج.م
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>فترة الائتمان المتفق عليها:</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0d9488' }}>
                    {inspectedVendorForStatement.credit_days} يوماً
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <table className="acc-table" style={{ fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '100px' }}>التاريخ</th>
                    <th style={{ width: '120px' }}>رقم السند</th>
                    <th>البيان والتفاصيل</th>
                    <th style={{ width: '120px', color: '#059669' }}>مدين (سداد/إكسباير)</th>
                    <th style={{ width: '120px', color: '#dc2626' }}>دائن (فاتورة)</th>
                    <th style={{ width: '130px', color: '#0284c7' }}>الرصيد التراكمي المستحق</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorStatement.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--muted, #64748b)' }}>
                        لا توجد حركات مسجلة مع هذا الموزع حتى الآن.
                      </td>
                    </tr>
                  ) : (
                    vendorStatement.map((line, idx) => (
                      <tr key={idx}>
                        <td>{line.tx_date}</td>
                        <td><span className="acc-code-badge">{line.tx_number}</span></td>
                        <td>
                          <div>{line.narration}</div>
                          {line.cheque_number && (
                            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>شيك رقم: {line.cheque_number}</div>
                          )}
                        </td>
                        <td style={{ fontWeight: '800', color: line.debit > 0 ? '#059669' : 'var(--muted, #94a3b8)', fontFamily: 'monospace' }}>
                          {line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td style={{ fontWeight: '800', color: line.credit > 0 ? '#dc2626' : 'var(--muted, #94a3b8)', fontFamily: 'monospace' }}>
                          {line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td style={{ fontWeight: '900', color: '#0284c7', fontFamily: 'monospace' }}>
                          {line.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="acc-modal-footer">
              <button
                type="button"
                className="acc-btn acc-btn-outline"
                onClick={() => window.print()}
              >
                🖨️ طباعة كشف الحساب
              </button>
              <button
                type="button"
                className="acc-btn acc-btn-primary"
                onClick={() => setInspectedVendorForStatement(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
